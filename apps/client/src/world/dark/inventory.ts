import { ARMS, FLARE, LOOT_REACH } from "@yutopia/shared/dark";
import {
  count,
  fits,
  freeQuick,
  HAND_SLOT,
  type Inventory,
  type ItemId,
  isUsable,
  isWeapon,
  POCKETS,
  QUICK,
  QUICK_SLOT,
  STACKS,
  slotAt,
  WEAPONS,
} from "@yutopia/shared/inventory";
import type { WorldController } from "../controller";
import type { Walker } from "../input/walker";
import { artVersion, itemArt } from "./icons";

// The inventory (docs/plan/86-the-inventory.md phase 3, look B · the open pack — design/inventory/0-b-pack.png,
// 0-b-phone.png): I (the pad's Menu) opens it over the world, which doesn't stop — you stand still while it's open,
// and can't aim. The four at hand are loops on a wooden belt (keys 1–4: a weapon or anything); under it the pack, a
// canvas bag drawn open with its eight pouches (a weapon there is carried, not equipped — plan 85); the picked one
// on a paper tag hung from the bag's ring; what lies in reach along the foot.
// The mouse: click picks; a drag moves (Shift: splits a stack; off the pack: drops it); right click, the menu (use,
// equip to 1–4, split, drop 1, drop all); hover an item in the pack or on the ground and press 1–4: there; Shift +
// click, the pack ⇄ at hand; a double click uses or equips. Keys: E use, R reload, T take all, O organize, the arrows
// pick, Delete drops. The pad: the d-pad picks, A uses, Y the menu, X held drops, B closes. A phone: tap picks, tap
// an empty slot to move the picked there, hold for the menu; Drop by a hold.

const NEAR = 15; // tiles: one of the shadowed this near, the warning
const W = 1200; // the stage (a desktop's: scaled down to fit)
const H = 700;
const PHONE = 640; // narrower: the phone's column
const DOUBLE_MS = 350;
const LONG_MS = 450; // a touch held: the menu
const HOLD_MS = 500; // a drop held (a phone's, the pad's X)
const isQuick = (slot: number) => slot >= QUICK_SLOT && slot < QUICK_SLOT + QUICK;
/** (plan 87) the left hand's mark: a gloved hand, outlined in the lamp's colour */
const GLOVE =
  '<svg class="gl" viewBox="0 0 11 12"><path d="M2 11V5.5M2 5.5V2.6a.9.9 0 0 1 1.8 0V5M3.8 5V1.6a.9.9 0 0 1 1.8 0V5M5.6 5V2a.9.9 0 0 1 1.8 0v3.5M7.4 5.5V3.4a.9.9 0 0 1 1.8 0V8c0 2-1.4 3-3.2 3H4.4C3 11 2 10 2 8.6" fill="none" stroke="#f1d79a" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** What the panel asks for (the dark's index sends it). */
export interface InvActions {
  use(slot: number): void;
  /** (plan 86) `n` of a stack, or all of it */
  drop(slot: number, n?: number): void;
  move(from: number, to: number): void;
  /** (plan 86) half (or `n`) of a stack into another slot */
  split(from: number, to: number, n?: number): void;
  pick(id: string, slot?: number): void;
  /** (plan 86) everything on the ground in reach */
  takeAll(): void;
  /** (plan 86) the pack put in order */
  organize(): void;
  draw(slot: number): void;
  /** a quick slot (0–3) as its key does (2–5): a weapon out or away, a use, a flare */
  quick(n: number): void;
  /** (plan 87) the left hand as its key does (1): the torch, a first aid, a battery, a flare */
  hand(): void;
  /** (plan 87) the left hand's light: the torch lit; a flare held up, its seconds left (0 none) */
  handState(): { lit: boolean; burn: number };
  reload(): void;
  /** (plan 93 S4) a car's boot or glove box open here: in the ground's place — its name, what's in it */
  store?(): { label: string; items: { id: string; n: number; loaded?: number }[] } | null;
}
type Tr = (key: string, vars?: Record<string, string>) => string;
type Spot = { slot: number } | { drop: string };
type Pick = Spot | null;
interface Lying {
  id: string;
  item: ItemId;
  n: number;
  loaded: number;
}
/** A line of the menu: what it does, its words, its keys (or the four slots' chips) */
interface Entry {
  act: string;
  label: string;
  keys?: string;
  chips?: boolean;
  /** (the chip of the slot it's in already: -1 the left hand, 0–3 the quick slots) */
  own?: number;
  /** (plan 87: the chips it doesn't fit — the left hand for a weapon, the quick slots for the torch) */
  ban?: number[];
  bad?: boolean;
  line?: boolean;
}
interface Menu {
  at: Pick;
  items: Entry[];
  focus: number;
  x: number;
  y: number;
}

export class InventoryPanel {
  open = false;
  private readonly el = document.createElement("div");
  private readonly bg = document.createElement("div");
  private readonly stage = document.createElement("div");
  private readonly menuEl = document.createElement("div");
  private readonly warn = document.createElement("div");
  private sel: Pick = null;
  private hover: Pick = null;
  private drag: { from: Pick; x: number; y: number; ghost: HTMLElement | null; shift: boolean } | null = null;
  private lastDown: { pick: Pick; t: number } | null = null;
  private longT = 0;
  private holdT = 0;
  private menu: Menu | null = null;
  private groundKey = "";
  private ground: Lying[] = [];
  /** (plan 93 S4) the open store's name, in the ground's place ("" none) */
  private storeLabel = "";
  private shown = "";
  private vitalsAt = 0;
  private phone = false;
  /** a touch screen: Drop by a hold, the notes' "drag" */
  private coarse = false;
  private xAt = 0;
  private xFired = false;
  /** mouse look (Z) was on when it opened: the pointer's let go meanwhile, locked again after */
  private relook = false;

  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
    private readonly inv: () => Inventory | null,
    private readonly act: InvActions,
    private readonly t: Tr,
    private readonly near: () => number,
  ) {
    this.el.className = "dk-inv";
    this.bg.className = "dk-inv-bg";
    this.bg.dataset.act = "close";
    this.stage.className = "panel";
    this.menuEl.className = "dk-inv-menu";
    this.warn.className = "dk-inv-warn";
    this.el.append(this.bg, this.stage, this.menuEl);
    this.el.style.display = "none";
    this.menuEl.style.display = "none";
    this.warn.style.display = "none";
    // (its own layer over everything: the 3D name tags stack up to 10000 over the dark's)
    document.body.append(this.el, this.warn);
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    this.el.addEventListener("pointerdown", this.down);
    this.el.addEventListener("pointerover", this.over);
    window.addEventListener("pointermove", this.moved);
    window.addEventListener("pointerup", this.up);
    window.addEventListener("pointercancel", this.up);
    window.addEventListener("resize", this.layout);
  }

  dispose(): void {
    window.removeEventListener("pointermove", this.moved);
    window.removeEventListener("pointerup", this.up);
    window.removeEventListener("pointercancel", this.up);
    window.removeEventListener("resize", this.layout);
    clearTimeout(this.longT);
    clearTimeout(this.holdT);
    this.el.remove();
    this.warn.remove();
  }

  toggle(): void {
    if (this.open) this.close();
    else {
      this.open = true;
      // (mouse look on: the pointer shown while it's open — let go here, so the browser locks it
      // again on closing without asking for a click)
      this.relook = !!this.ctl.tp?.mouseLook.looking;
      if (this.relook) this.ctl.tp?.mouseLook.setLook(false);
      this.coarse = matchMedia("(pointer: coarse)").matches;
      this.el.style.display = "block";
      this.layout();
      this.shown = "";
      this.render();
    }
  }
  close(): void {
    this.open = false;
    this.el.style.display = "none";
    this.warn.style.display = "none";
    this.closeMenu();
    this.endDrag();
    this.hover = null;
    if (this.relook) this.ctl.tp?.mouseLook.resumeLook();
    this.relook = false;
  }

  /** The stage scaled to the window (its coordinates are the mock's); a phone's a column. */
  private layout = () => {
    if (!this.open) return;
    const phone = innerWidth < PHONE;
    if (phone !== this.phone) this.shown = "";
    this.phone = phone;
    this.el.classList.toggle("phone", phone);
    const k = phone ? 1 : Math.min(1, (innerWidth - 24) / W, (innerHeight - 24) / H);
    this.stage.style.setProperty("--k", String(k));
  };

  /** A key down while open (the dark's capturing listener): true if it's taken. I isn't (the walker's). */
  key(e: KeyboardEvent): boolean {
    if (!this.open) return false;
    if (e.code === "KeyI") return false;
    const m = this.menu;
    if (m) {
      if (e.code === "Escape") this.closeMenu();
      else if (e.repeat) return true;
      else if (e.code === "ArrowDown") this.menuStep(1);
      else if (e.code === "ArrowUp") this.menuStep(-1);
      else if (e.code === "Enter" || e.code === "KeyE") this.runMenu(m.items[m.focus].act);
      else if (/^Digit[1-5]$/.test(e.code) && m.items.some((it) => it.chips))
        this.runMenu("to", Number(e.code.slice(5)) - 2);
      return true;
    }
    if (e.code === "Escape") {
      this.close();
      return true;
    }
    if (e.repeat) return true;
    if (e.code === "KeyE") this.primary();
    else if (e.code === "KeyR") this.act.reload();
    else if (/^Digit[1-5]$/.test(e.code)) {
      // (hover something in the pack or on the ground and press 1–5: it goes there — 1 the left hand; else — and on
      // the belt — as the key does in the world)
      const n = Number(e.code.slice(5)) - 2;
      const h = this.hover;
      const onBelt = !!h && "slot" in h && h.slot >= QUICK_SLOT;
      if (h && !onBelt && this.itemOf(h)) this.assign(h, n);
      else if (n < 0) this.act.hand();
      else this.act.quick(n);
    } else if (e.code === "Delete" || e.code === "Backspace") this.dropSel();
    else if (e.code === "KeyT") this.takeAll();
    else if (e.code === "KeyO") this.act.organize();
    else if (e.code === "ArrowRight") this.nav(0, 1);
    else if (e.code === "ArrowLeft") this.nav(0, -1);
    else if (e.code === "ArrowDown") this.nav(1, 0);
    else if (e.code === "ArrowUp") this.nav(-1, 0);
    return true;
  }

  /** Every frame: the vitals, the snow in reach, the warning, the pad. */
  frame(): void {
    if (!this.open) return;
    const now = performance.now();
    // what lies in reach (shown when it changes)
    const me = this.walker.where();
    const lying: Lying[] = [];
    // (plan 93 S4: a car's boot or glove box open — what's in it, in the ground's place)
    const st = this.act.store?.() ?? null;
    if (st)
      st.items.forEach((it, i) => {
        lying.push({ id: `store:${i}`, item: it.id as ItemId, n: it.n, loaded: it.loaded ?? 0 });
      });
    else
      this.ctl.room?.state.drops?.forEach(
        (d: { id: string; item: string; n: number; loaded: number; x: number; y: number; level?: number }) => {
          if ((d.level ?? 0) === this.ctl.level && Math.hypot(d.x - me.x, d.y - me.y) <= LOOT_REACH)
            lying.push({ id: d.id, item: d.item as ItemId, n: d.n, loaded: d.loaded });
        },
      );
    this.storeLabel = st?.label ?? "";
    const key = `${this.storeLabel}|${lying.map((d) => `${d.id}:${d.item}:${d.n}:${d.loaded}`).join(",")}`;
    if (key !== this.groundKey) {
      this.groundKey = key;
      this.ground = lying;
      if (this.sel && "drop" in this.sel && !lying.some((d) => d.id === (this.sel as { drop: string }).drop))
        this.sel = null;
      if (
        this.menu?.at &&
        "drop" in this.menu.at &&
        !lying.some((d) => d.id === (this.menu?.at as { drop: string }).drop)
      )
        this.closeMenu();
      this.render();
    }
    if (now - this.vitalsAt > 200) {
      this.vitalsAt = now;
      this.render();
    }
    const n = this.near();
    this.warn.style.display = n <= NEAR ? "block" : "none";
    if (n <= NEAR) this.warn.textContent = this.t("dark_inv_near");
    this.pad(now);
  }

  // ── the pad: the d-pad picks through the belt, the pack, the ground; A uses or takes, Y the menu, X held drops,
  // B closes (the menu first) ──
  private pad(now: number) {
    const pad = this.walker.controls.pad;
    const m = this.menu;
    if (m) {
      if (pad.pressed(13)) this.menuStep(1); // ↓
      if (pad.pressed(12)) this.menuStep(-1); // ↑
      if (pad.pressed(0)) this.runMenu(m.items[m.focus].act);
      else if (pad.pressed(1) || pad.pressed(3)) this.closeMenu();
      return;
    }
    if (pad.pressed(15)) this.nav(0, 1); // →
    if (pad.pressed(14)) this.nav(0, -1); // ←
    // (the belt a row of five — the left hand, then 2–5 — the pack two rows of four, the ground a row)
    if (pad.pressed(13)) this.nav(1, 0); // ↓
    if (pad.pressed(12)) this.nav(-1, 0); // ↑
    if (pad.pressed(0)) this.primary();
    if (pad.pressed(3) && this.sel) this.menuFor(this.sel);
    if (pad.held(2)) {
      if (!this.xAt) this.xAt = now;
      else if (!this.xFired && now - this.xAt >= HOLD_MS) {
        this.xFired = true;
        this.dropSel();
      }
    } else {
      this.xAt = 0;
      this.xFired = false;
    }
    if (pad.pressed(1)) this.close();
  }
  /** The panel's rows, as the pad and the arrows walk them: the belt (the left hand, then the quick slots), the
   *  pack's two rows, the ground */
  private rows(): Pick[][] {
    const half = POCKETS / 2;
    return [
      [{ slot: HAND_SLOT }, ...Array.from({ length: QUICK }, (_, i) => ({ slot: QUICK_SLOT + i }))],
      Array.from({ length: half }, (_, i) => ({ slot: i })),
      Array.from({ length: half }, (_, i) => ({ slot: half + i })),
      ...(this.ground.length ? [this.ground.map((d) => ({ drop: d.id }))] : []),
    ];
  }
  /** A step through the rows: across one, or up and down — the quick slots over the pack's columns (the left hand
   *  before them: ← along the belt) */
  private nav(dr: number, dc: number) {
    const rows = this.rows();
    let r = rows.findIndex((row) => row.some((o) => same(o, this.sel)));
    if (r < 0) {
      this.sel = rows[0][0];
      this.render();
      return;
    }
    let c = rows[r].findIndex((o) => same(o, this.sel));
    const clamp = (x: number, n: number) => Math.max(0, Math.min(n - 1, x));
    if (dr) {
      const off = (row: number) => (row === 0 ? 1 : 0);
      const col = c - off(r);
      r = clamp(r + dr, rows.length);
      c = clamp(col + off(r), rows[r].length);
    } else c = clamp(c + dc, rows[r].length);
    this.sel = rows[r][c];
    this.render();
  }

  // ── what the keys and buttons do ─────────────────────────────────────────
  /** E, A, a double click: take it, use it, equip it, hold it */
  private primary(p: Pick = this.sel) {
    const inv = this.inv();
    if (!p || !inv) return;
    if ("drop" in p) return this.act.pick(p.drop);
    if (p.slot === HAND_SLOT) return this.act.hand();
    if (isQuick(p.slot)) return this.act.quick(p.slot - QUICK_SLOT);
    const st = inv.pockets[p.slot];
    // (plan 85: a weapon in the pack — equipped)
    if (st && isWeapon(st.id)) return this.equip(p);
    // (plan 87: the torch — to the left hand, where it lights)
    if (st?.id === "torch") return this.put(p, HAND_SLOT);
    if (st && isUsable(st.id)) this.act.use(p.slot);
  }
  /** (plan 85 F5a) A weapon in the pack into the first empty quick slot — none empty, the tag says so (a drag onto
   *  one, or 2–5 on it, swaps) */
  private equip(p: Pick = this.sel) {
    const inv = this.inv();
    if (!p || !inv || "drop" in p || p.slot >= POCKETS) return;
    const to = freeQuick(inv);
    if (to >= 0) this.put(p, to);
  }
  /** (plan 86) Into quick slot `n` — what's there swapped (the shared moveSlot), or taken from the ground there;
   *  (plan 87) -1 the left hand. Not where it doesn't fit (a weapon in the left hand, the torch at hand). */
  private assign(p: Pick, n: number) {
    const id = this.itemOf(p);
    if (!p || !id) return;
    const to = n < 0 ? HAND_SLOT : QUICK_SLOT + n;
    if (!fits(to, id)) return;
    if ("slot" in p && p.slot === to) return n < 0 ? this.act.hand() : this.act.quick(n);
    this.put(p, to);
  }
  /** Moved (or taken from the ground) into a slot, picked there */
  private put(from: Pick, to: number) {
    if (!from) return;
    if ("drop" in from) this.act.pick(from.drop, to);
    else if (from.slot === to) return;
    else this.act.move(from.slot, to);
    this.sel = { slot: to };
    this.shown = "";
    this.render();
  }
  /** (plan 86) Shift + click: the pack → the first free at hand (plan 87: the torch, the left hand), at hand or in
   *  the left hand → the first free pouch; the ground: taken */
  private swapSide(p: Pick) {
    const inv = this.inv();
    if (!p || !inv) return;
    if ("drop" in p) return this.act.pick(p.drop);
    const torch = this.itemOf(p) === "torch";
    const to = p.slot < POCKETS ? (torch ? HAND_SLOT : freeQuick(inv)) : inv.pockets.indexOf(null);
    if (to >= 0) this.put(p, to);
  }
  /** (plan 86) Where a split goes: a free pouch, else a free one at hand */
  private freeFor(): number {
    const inv = this.inv();
    if (!inv) return -1;
    const pocket = inv.pockets.indexOf(null);
    return pocket >= 0 ? pocket : freeQuick(inv);
  }
  private split(p: Pick) {
    const to = this.freeFor();
    if (p && "slot" in p && to >= 0) this.act.split(p.slot, to);
  }
  private dropSel(n?: number) {
    const s = this.sel;
    if (s && "slot" in s) this.act.drop(s.slot, n);
  }
  private takeAll() {
    if (this.ground.length) this.act.takeAll();
  }
  private gun(): string {
    const room = this.ctl.room;
    return (room?.state.players.get(room.sessionId)?.gun as string) || "";
  }
  private canReload(inv: Inventory, id: ItemId): boolean {
    const w = inv.quick.find((it) => it?.id === id);
    return isWeapon(id) && !!w && "loaded" in w && w.loaded < WEAPONS[id].mag && count(inv, WEAPONS[id].ammo) > 0;
  }

  // ── the menu (right click, a touch held, the pad's Y) ────────────────────
  private entries(p: Pick): Entry[] {
    const inv = this.inv();
    const id = this.itemOf(p);
    const t = this.t;
    if (!inv || !p || !id) return [];
    const kk = (s: string) => `<span class="kk">${s}</span>`;
    if ("drop" in p)
      return [
        { act: "take", label: t("dark_inv_take"), keys: kk("E") },
        { act: "to", label: t("dark_inv_take_to"), chips: true },
        ...(this.ground.length > 1 ? [{ act: "takeAll", label: t("dark_inv_take_all"), keys: kk("T") }] : []),
      ];
    const it = slotAt(inv, p.slot);
    if (!it) return [];
    const q = isQuick(p.slot) ? p.slot - QUICK_SLOT : -1;
    const inHandSlot = p.slot === HAND_SLOT;
    const out: Entry[] = [];
    const hs = this.act.handState();
    if (inHandSlot) {
      // (plan 87: the left hand's own — as 1 does)
      if (id === "torch")
        out.push({ act: "use", label: t(hs.lit ? "dark_inv_put_out" : "dark_inv_light"), keys: kk("1") });
      else if (id === "flare")
        out.push({ act: "use", label: t(hs.burn ? "dark_inv_throw" : "dark_inv_light_one"), keys: kk("1") });
      else if (isUsable(id)) out.push({ act: "use", label: t("dark_inv_use"), keys: kk("1") });
    } else if (id === "torch") {
      out.push({ act: "hand", label: t("dark_inv_to_hand"), keys: kk("1") });
    } else if (isWeapon(id)) {
      if (q >= 0) {
        const inHand = this.gun() === id;
        out.push({ act: "use", label: t(inHand ? "dark_inv_away" : "dark_inv_hold"), keys: kk(String(q + 2)) });
        if (inHand && this.canReload(inv, id)) out.push({ act: "reload", label: t("dark_inv_reload"), keys: kk("R") });
      }
    } else if (isUsable(id)) out.push({ act: "use", label: t("dark_inv_use"), keys: kk(q >= 0 ? String(q + 2) : "E") });
    else if (id === "flare" && q >= 0) out.push({ act: "use", label: t("dark_inv_throw"), keys: kk(String(q + 2)) });
    // (plan 87: the chips ✋1 2–5 — the ones it doesn't fit greyed: the left hand for a weapon, the quick slots for
    // the torch)
    if (id !== "torch" || !inHandSlot)
      out.push({
        act: "to",
        label: t(q >= 0 || inHandSlot ? "dark_inv_move_to" : "dark_inv_equip_to"),
        chips: true,
        own: inHandSlot ? -1 : q >= 0 ? q : undefined,
        ban: isWeapon(id) ? [-1] : id === "torch" ? [0, 1, 2, 3] : [],
      });
    if ((q >= 0 || inHandSlot) && inv.pockets.includes(null))
      out.push({ act: "pack", label: t("dark_inv_to_pack"), keys: kk(t("dark_inv_shift_click")) });
    const n = "n" in it ? it.n : 1;
    if (!isWeapon(id) && n >= 2 && this.freeFor() >= 0)
      out.push({ act: "split", label: t("dark_inv_split"), keys: kk(t("dark_inv_shift_drag")) });
    if (n >= 2) out.push({ act: "drop1", label: t("dark_inv_drop1"), line: true });
    out.push({
      act: "drop",
      label: n >= 2 ? t("dark_inv_drop_all", { n: String(n) }) : t("dark_inv_drop_btn"),
      bad: true,
      line: n < 2,
    });
    return out;
  }
  /** The menu for `p`, at a point (the pointer's), else at its slot */
  private menuFor(p: Pick, x?: number, y?: number) {
    const items = this.entries(p);
    if (!p || !items.length) return;
    if (x === undefined || y === undefined) {
      const q = "slot" in p ? `[data-slot="${p.slot}"]` : `[data-drop="${p.drop}"]`;
      const r = this.stage.querySelector(q)?.getBoundingClientRect();
      x = r ? r.left + r.width * 0.55 : innerWidth / 2;
      y = r ? r.top + r.height * 0.6 : innerHeight / 2;
    }
    this.sel = p;
    this.render();
    this.menu = { at: p, items, focus: 0, x, y };
    this.drawMenu();
  }
  private drawMenu() {
    const m = this.menu;
    if (!m) return;
    this.menuEl.innerHTML = m.items
      .map(
        (it, i) =>
          `${it.line ? "<hr>" : ""}<div class="it${i === m.focus ? " on" : ""}${it.bad ? " bad" : ""}" data-menu="${it.act}"><span>${it.label}</span><span class="r">${
            it.chips
              ? [-1, 0, 1, 2, 3]
                  .map((n) => {
                    const off = n === it.own || !!it.ban?.includes(n);
                    return `<span class="kk${n < 0 ? " hd" : ""}${off ? " own" : ""}"${off ? "" : ` data-menu="to" data-n="${n}"`}>${n < 0 ? `${GLOVE}1` : n + 2}</span>`;
                  })
                  .join("")
              : (it.keys ?? "")
          }</span></div>`,
      )
      .join("");
    const el = this.menuEl;
    el.style.display = "block";
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(m.x, innerWidth - w - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(m.y, innerHeight - h - 8))}px`;
  }
  private menuStep(d: number) {
    const m = this.menu;
    if (!m) return;
    m.focus = (m.focus + d + m.items.length) % m.items.length;
    this.drawMenu();
  }
  private closeMenu() {
    this.menu = null;
    this.menuEl.style.display = "none";
  }
  private runMenu(act: string, n?: number) {
    const m = this.menu;
    if (!m) return;
    const p = m.at;
    const inv = this.inv();
    this.closeMenu();
    if (!p || !inv) return;
    if (act === "use" || act === "take") this.primary(p);
    else if (act === "reload") this.act.reload();
    else if (act === "to") {
      // (the row itself, not a chip: the first free at hand — none, the first; the torch, the left hand)
      const free = freeQuick(inv);
      this.assign(p, n ?? (this.itemOf(p) === "torch" ? -1 : free >= 0 ? free - QUICK_SLOT : 0));
    } else if (act === "hand") this.assign(p, -1);
    else if (act === "pack") this.swapSide(p);
    else if (act === "split") this.split(p);
    else if (act === "takeAll") this.takeAll();
    else if ("slot" in p && act === "drop1") this.act.drop(p.slot, 1);
    else if ("slot" in p && act === "drop") this.act.drop(p.slot);
    this.shown = "";
    this.render();
  }

  // ── the pointer: click picks, a drag moves, right click the menu ─────────
  private pickOf(el: HTMLElement): Spot {
    return el.dataset.slot !== undefined ? { slot: Number(el.dataset.slot) } : { drop: el.dataset.drop as string };
  }
  private over = (e: PointerEvent) => {
    const hit = (e.target as HTMLElement).closest?.<HTMLElement>("[data-slot],[data-drop]");
    this.hover = hit ? this.pickOf(hit) : null;
  };
  private down = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    // the menu open: its lines and chips; a press anywhere else only closes it
    if (this.menu) {
      e.preventDefault();
      const m = target.closest<HTMLElement>("[data-menu]");
      if (m && e.button === 0)
        this.runMenu(m.dataset.menu as string, m.dataset.n === undefined ? undefined : Number(m.dataset.n));
      else if (!target.closest(".dk-inv-menu")) this.closeMenu();
      return;
    }
    const hit = target.closest<HTMLElement>("[data-slot],[data-drop],[data-act]");
    if (!hit) return;
    e.preventDefault();
    const touch = e.pointerType === "touch";
    const act = hit.dataset.act;
    if (act) {
      if (e.button !== 0) return;
      // (a touch screen: Drop by a hold — a stray tap drops nothing)
      if (act === "drop" && (touch || this.coarse)) {
        hit.classList.add("holding");
        clearTimeout(this.holdT);
        this.holdT = window.setTimeout(() => {
          this.holdT = 0;
          this.dropSel();
        }, HOLD_MS);
        return;
      }
      this.button(act);
      return;
    }
    const pick = this.pickOf(hit);
    const item = this.itemOf(pick);
    if (e.button === 2) {
      if (item) this.menuFor(pick, e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    const was = this.sel;
    // (a phone: something picked, then an empty slot tapped — it goes there)
    if (touch && !item && "slot" in pick && was && this.itemOf(was)) return this.put(was, pick.slot);
    this.sel = pick;
    this.shown = "";
    this.render();
    if (!item) return;
    const now = performance.now();
    const dbl = !!this.lastDown && same(this.lastDown.pick, pick) && now - this.lastDown.t < DOUBLE_MS;
    this.lastDown = dbl ? null : { pick, t: now };
    if (dbl && !e.shiftKey) return this.primary(pick);
    this.drag = { from: pick, x: e.clientX, y: e.clientY, ghost: null, shift: e.shiftKey };
    if (touch) {
      const { clientX: x, clientY: y } = e;
      clearTimeout(this.longT);
      this.longT = window.setTimeout(() => {
        this.longT = 0;
        if (this.drag && !this.drag.ghost) {
          this.drag = null;
          this.menuFor(pick, x, y);
        }
      }, LONG_MS);
    }
  };
  private moved = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      clearTimeout(this.longT);
      this.longT = 0;
      const id = this.itemOf(d.from);
      if (!id) return;
      d.ghost = document.createElement("div");
      d.ghost.className = `dk-inv-ghost${isWeapon(id) ? " wide" : ""}`;
      d.ghost.innerHTML = itemArt(id);
      this.el.append(d.ghost);
      this.el.classList.add("dragging");
    }
    if (d.ghost) {
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
    }
  };
  private up = (e: PointerEvent) => {
    if (this.holdT) {
      clearTimeout(this.holdT);
      this.holdT = 0;
    }
    this.stage.querySelector(".holding")?.classList.remove("holding");
    clearTimeout(this.longT);
    this.longT = 0;
    const d = this.drag;
    if (!d) return;
    if (d.ghost && d.from) {
      const at = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const under = at?.closest<HTMLElement>("[data-slot]");
      if (under) {
        const to = Number(under.dataset.slot);
        // (Shift: a stack split — half there)
        if (d.shift && "slot" in d.from && to !== d.from.slot && !isWeapon(this.itemOf(d.from))) {
          this.act.split(d.from.slot, to);
          this.sel = { slot: to };
        } else this.put(d.from, to);
      } else if (at?.closest(".dk-inv-bg") && "slot" in d.from) this.act.drop(d.from.slot); // (off the pack: dropped)
    } else if (d.shift && d.from) this.swapSide(d.from);
    this.endDrag();
    this.shown = "";
    this.render();
  };
  private endDrag() {
    this.drag?.ghost?.remove();
    this.drag = null;
    this.el.classList.remove("dragging");
  }
  private button(act: string) {
    if (act === "close") this.close();
    else if (act === "use" || act === "take" || act === "hold") this.primary();
    else if (act === "drop") this.dropSel();
    else if (act === "reload") this.act.reload();
    else if (act === "away") this.act.draw(-1);
    else if (act === "equip") this.equip();
    else if (act === "takeAll") this.takeAll();
    else if (act === "organize") this.act.organize();
    else if (act === "hand") this.act.hand();
    else if (act === "tohand") this.assign(this.sel, -1);
  }
  private itemOf(p: Pick): ItemId | null {
    const inv = this.inv();
    if (!p || !inv) return null;
    if ("drop" in p) return this.ground.find((d) => d.id === p.drop)?.item ?? null;
    return slotAt(inv, p.slot)?.id ?? null;
  }

  // ── the pack ─────────────────────────────────────────────────────────────
  private render() {
    if (!this.open) return;
    const inv = this.inv();
    const t = this.t;
    const room = this.ctl.room;
    const lp = room?.state.players.get(room.sessionId);
    const hp = Math.round((lp?.hp as number) ?? 100);
    const wm = Math.round((lp?.wm as number) ?? 100);
    const bat = Math.round(this.walker.vitals.bat);
    const gun = (lp?.gun as string) || "";
    const out = this.walker.outside;
    const hs = this.act.handState();
    // (rebuilt only when something shown changed)
    const sig = JSON.stringify([
      inv,
      hs,
      hp,
      wm,
      bat,
      gun,
      out,
      this.sel,
      this.groundKey,
      this.phone,
      this.coarse,
      artVersion(),
    ]);
    if (sig === this.shown) return;
    this.shown = sig;

    const isSel = (p: Pick) => (same(p, this.sel) ? " sel" : "");
    const art = (id: ItemId) => `<div class="art">${itemArt(id)}</div>`;
    let loops = "";
    let pouches = "";
    if (inv) {
      // (plan 87) the left hand: first on the belt, its own leather, a hand's mark; the torch lit in it, a flare
      // burning — then the belt's buckle, then 2–5
      const h = inv.hand;
      const shows: ItemId | null = h?.id ?? (hs.burn ? "flare" : null);
      const hk = `<span class="k">${GLOVE}1${this.phone ? "" : ` · ${t("dark_inv_left_hand")}`}</span>`;
      const tag = hs.burn
        ? `<span class="tag">${t("dark_inv_burning")} ${hs.burn}s</span>`
        : hs.lit
          ? `<span class="tag">${t("dark_inv_lit")}</span>`
          : "";
      const hn = !h ? "" : h.id === "torch" ? `${bat}%` : "n" in h ? `${h.n}<small>/${STACKS[h.id]}</small>` : "";
      loops += `<div class="loop hnd${shows ? "" : " e"}${hs.lit ? " lit" : ""}${hs.burn ? " burn" : ""}${isSel({ slot: HAND_SLOT })}" data-slot="${HAND_SLOT}">${hk}${this.phone ? "" : tag}${shows ? art(shows) : ""}${hn ? `<span class="n">${hn}</span>` : ""}</div><div class="buckle"></div>`;
      inv.quick.forEach((it, i) => {
        const slot = QUICK_SLOT + i;
        const k = `<span class="k">${i + 2}</span>`;
        if (!it) loops += `<div class="loop e${isSel({ slot })}" data-slot="${slot}">${k}</div>`;
        else if ("loaded" in it) {
          const hand = gun === it.id;
          loops += `<div class="loop w${hand ? " hand" : ""}${isSel({ slot })}" data-slot="${slot}">${k}${hand ? `<span class="tag">${t("dark_inv_hand")}</span>` : ""}${art(it.id)}<span class="s">+${count(inv, WEAPONS[it.id].ammo)}</span><span class="n">${it.loaded}/${WEAPONS[it.id].mag}</span></div>`;
        } else
          loops += `<div class="loop${isSel({ slot })}" data-slot="${slot}">${k}${art(it.id)}<span class="n">${it.n}<small>/${STACKS[it.id]}</small></span></div>`;
      });
      inv.pockets.forEach((it, i) => {
        // (plan 85: a weapon in the pack — carried, not equipped: its rounds in it and spare, no key)
        if (!it) pouches += `<div class="po e${isSel({ slot: i })}" data-slot="${i}"></div>`;
        else if ("loaded" in it)
          pouches += `<div class="po w${isSel({ slot: i })}" data-slot="${i}">${art(it.id)}<span class="s">+${count(inv, WEAPONS[it.id].ammo)}</span><span class="n">${it.loaded}/${WEAPONS[it.id].mag}</span></div>`;
        else
          pouches += `<div class="po${isSel({ slot: i })}" data-slot="${i}">${art(it.id)}<span class="n">${it.n}<small>/${STACKS[it.id]}</small></span></div>`;
      });
    }

    const stones = this.ground.length
      ? this.ground
          .map(
            (d) =>
              `<div class="stone${isWeapon(d.item) ? " w" : ""}${isSel({ drop: d.id })}" data-drop="${d.id}">${art(d.item)}<div class="nm"><b>${t(`dark_item_${d.item}`)}</b><span>${isWeapon(d.item) ? `${d.loaded}/${WEAPONS[d.item].mag}` : `×${d.n}`}</span></div><span class="take">${t("dark_inv_take")}</span></div>`,
          )
          .join("")
      : `<span class="none">${t(this.storeLabel ? "dark_inv_store_empty" : "dark_inv_ground_none")}</span>`;
    const all = this.ground.length
      ? `<span class="kk all" data-act="takeAll">${t("dark_inv_take_all")}${this.phone ? "" : " · T"}</span>`
      : "";
    const v = (k: string, n: string, lo: boolean) => `<span${lo ? ' class="lo"' : ""}>${t(k)} <b>${n}</b></span>`;

    this.stage.innerHTML = `<div class="top"><span class="cap">${t("dark_inv_at_hand")}</span><span class="x" data-act="close"><span class="kk">Esc</span>✕</span></div>
      <div class="belt">${loops}</div>
      <div class="bag"><h1 class="flap">${t("dark_inv_title")}</h1><span class="org" data-act="organize">${t("dark_inv_organize")}<span class="kk">O</span></span><div class="pockets">${pouches}</div></div>
      <div class="string"></div><div class="ring"></div>
      <div class="det paper">${this.details(inv, gun, hp, bat)}</div>
      <div class="snow"><span class="cap">${this.storeLabel || t(out ? "dark_inv_snow" : "dark_inv_floor")}</span><div class="gl">${stones}</div>${all}</div>
      <div class="vit">${v("dark_inv_v_health", String(hp), hp < 50)}${v("dark_inv_v_warmth", String(wm), wm < 40)}${v("dark_inv_v_torch", `${bat}%`, bat < 25)}</div>`;
    if (this.drag?.ghost) this.el.append(this.drag.ghost);
  }

  /** The paper tag: the picked one large, its name, what it is, its numbers, its buttons — nothing picked, the keys */
  private details(inv: Inventory | null, gun: string, hp: number, bat: number): string {
    const t = this.t;
    const p = this.sel;
    const id = this.itemOf(p);
    const kk = (s: string) => `<span class="kk">${s}</span>`;
    if (!inv || !id || !p) {
      const row = (k: string, d: string) => `<span>${k}</span><b>${d}</b>`;
      return `<span class="cap">${t("dark_inv_title")}</span><p class="what hint">${t("dark_inv_pick_hint")}</p><div class="sp keys">${
        this.coarse
          ? ""
          : row(kk("1"), t("dark_inv_k_hand")) +
            row(kk("2–5"), t("dark_inv_k_hover")) +
            row(t("dark_inv_k_shift"), t("dark_inv_k_shift_do")) +
            row(t("dark_inv_k_dbl"), t("dark_inv_k_dbl_do")) +
            row(t("dark_inv_k_right"), t("dark_inv_k_right_do")) +
            row(t("dark_inv_k_drag"), t("dark_inv_k_drag_do")) +
            row(`${kk("H")} ${kk("B")}`, t("dark_inv_k_hb")) +
            row(t("dark_inv_k_pad"), t("dark_inv_k_pad_do"))
      }</div>`;
    }
    const btn = (act: string, label: string, keys = "", main = false, off = false) =>
      `<div class="${main ? "lampbtn" : "btn"}${off ? " off" : ""}" ${off ? "" : `data-act="${act}"`}><span>${label}</span>${keys}</div>`;
    const stat = (a: string, b: string) => `<span>${a}</span><b>${b}</b>`;
    const dropBtn = btn("drop", t("dark_inv_drop_btn"), this.coarse ? kk(t("dark_inv_hold_key")) : "");
    let where = "";
    let stats = "";
    let note = "";
    let btns = "";
    if ("drop" in p) {
      const d = this.ground.find((g) => g.id === (p as { drop: string }).drop);
      where = t(this.walker.outside ? "dark_inv_snow" : "dark_inv_floor");
      if (d)
        stats = isWeapon(d.item)
          ? stat(t("dark_inv_loaded"), t("dark_inv_of", { n: String(d.loaded), m: String(WEAPONS[d.item].mag) }))
          : stat(t("dark_inv_how_many"), `×${d.n}`);
      btns =
        btn("take", t("dark_inv_take"), kk("E"), true) +
        (this.ground.length > 1 ? btn("takeAll", t("dark_inv_take_all"), kk("T")) : "");
    } else if (isWeapon(id)) {
      const it = slotAt(inv, p.slot);
      const w = it && "loaded" in it ? it : null;
      const a = ARMS[id];
      const ammo = WEAPONS[id].ammo;
      stats =
        stat(t("dark_inv_loaded"), t("dark_inv_of", { n: String(w?.loaded ?? 0), m: String(WEAPONS[id].mag) })) +
        stat(t("dark_inv_spare", { ammo: t(`dark_item_${ammo}`) }), String(count(inv, ammo))) +
        stat(t("dark_inv_dmg_range"), `${a.pellets > 1 ? `${a.pellets} × ${a.damage}` : a.damage} · ${a.range} m`);
      if (p.slot < POCKETS) {
        // (plan 85: in the pack — carried, not equipped: equipped into the first empty quick slot, or 1–4 on it, or
        // dragged onto one to swap)
        const free = freeQuick(inv) >= 0;
        where = t("dark_inv_in_pocket");
        note = t(free ? (this.coarse ? "dark_inv_in_pack_touch" : "dark_inv_in_pack") : "dark_inv_quick_full");
        btns = btn("equip", t("dark_inv_equip"), kk("E"), true, !free) + dropBtn;
      } else {
        const n = String(p.slot - QUICK_SLOT + 2);
        where = t(gun === id ? "dark_inv_in_hand_n" : "dark_inv_at_n", { n });
        btns =
          (gun === id ? btn("away", t("dark_inv_away"), kk(n)) : btn("hold", t("dark_inv_hold"), kk(n), true)) +
          (gun === id && this.canReload(inv, id) ? btn("reload", t("dark_inv_reload"), kk("R")) : "") +
          dropBtn;
      }
    } else if (id === "torch" || p.slot === HAND_SLOT) {
      // (plan 87) the left hand's — the torch there or in the pack, a flare, anything else there
      const hs = this.act.handState();
      const inHandSlot = p.slot === HAND_SLOT;
      const it = slotAt(inv, p.slot);
      const s = it && "n" in it ? it : null;
      where = inHandSlot
        ? `${t("dark_inv_hand_slot")}${hs.lit ? ` · ${t("dark_inv_lit")}` : hs.burn ? ` · ${t("dark_inv_burning")}` : ""}`
        : t("dark_inv_in_pocket");
      if (id === "torch") {
        stats =
          stat(t("dark_inv_battery_stat"), `${bat}%`) +
          stat(t("dark_inv_spare_bat"), `${count(inv, "battery")} · B`) +
          stat(t("dark_inv_focus"), t("dark_inv_focus_rb"));
        note = t(inHandSlot ? "dark_inv_held_guns" : "dark_inv_torch_pack");
        btns =
          (inHandSlot
            ? btn("hand", t(hs.lit ? "dark_inv_put_out" : "dark_inv_light"), kk("1"), true)
            : btn("tohand", t("dark_inv_to_hand"), kk("1"), true)) + dropBtn;
      } else {
        stats = stat(t("dark_inv_how_many"), t("dark_inv_of", { n: String(s?.n ?? 0), m: String(STACKS[id]) }));
        if (id === "flare")
          stats += hs.burn
            ? stat(t("dark_inv_burning_for"), `${hs.burn} s`)
            : stat(t("dark_inv_burns"), `${FLARE.secs} s`);
        if (id === "aid") stats += stat(t("dark_inv_health_now"), `${hp} → 100`);
        if (id === "battery") stats += stat(t("dark_inv_bat_now"), `${bat}% → 100%`);
        const main =
          id === "flare"
            ? btn("hand", t(hs.burn ? "dark_inv_throw" : "dark_inv_light_one"), kk("1"), true)
            : isUsable(id)
              ? btn("hand", t("dark_inv_use"), kk("1"), true)
              : "";
        if (!main) note = t("dark_inv_hand_idle");
        btns = main + dropBtn;
      }
    } else {
      const it = slotAt(inv, p.slot);
      const s = it && "n" in it ? it : null;
      const q = isQuick(p.slot) ? String(p.slot - QUICK_SLOT + 2) : "";
      where = q ? t("dark_inv_at_n", { n: q }) : t("dark_inv_in_pocket");
      stats = stat(t("dark_inv_how_many"), t("dark_inv_of", { n: String(s?.n ?? 0), m: String(STACKS[id]) }));
      if (id === "aid") stats += stat(t("dark_inv_health_now"), `${hp} → 100`);
      if (id === "battery") stats += stat(t("dark_inv_bat_now"), `${bat}% → 100%`);
      if (id === "flare") stats += stat(t("dark_inv_burns"), `${FLARE.secs} s`);
      btns =
        (isUsable(id) ? btn("use", t("dark_inv_use"), kk(q || "E"), true) : "") +
        (id === "flare" && q ? btn("use", t("dark_inv_throw"), kk(q), true) : "") +
        dropBtn;
    }
    const wide = isWeapon(id) ? " wide" : "";
    return `<span class="cap">${where}</span><div class="pic${wide}">${itemArt(id)}</div><h2>${t(`dark_item_${id}`)}</h2><p class="what">${t(`dark_desc_${id}`)}</p><div class="sp">${stats}${note ? `<span class="note">${note}</span>` : ""}</div><div class="btns">${btns}</div>`;
  }
}

function same(a: Pick, b: Pick): boolean {
  if (!a || !b) return false;
  if ("slot" in a) return "slot" in b && a.slot === b.slot;
  return "drop" in b && a.drop === b.drop;
}

// (the HUD's look, plan 45 — globals.css: --cream, --amber the lamp, --paper, --ink, --wood, the type faces; the
// mock's own: design/inventory/mock/inventory.html `.B`)
const LABEL = "#d9c08a";
const RED = "#e7907c";
const HAIR = "rgba(241,215,154,.26)";
export const INV_CSS = `
.dk-inv{position:fixed;inset:0;pointer-events:auto;z-index:20000;font-family:var(--font-body);color:var(--cream);-webkit-font-smoothing:antialiased}
.dk-inv-bg{position:absolute;inset:0;background:radial-gradient(130% 100% at 50% 50%,rgba(6,8,12,.55) 40%,rgba(2,4,8,.85) 100%);backdrop-filter:blur(4px) brightness(.8)}
.dk-inv .panel{position:absolute;left:50%;top:50%;width:${W}px;height:${H}px;transform:translate(-50%,-50%) scale(var(--k,1));pointer-events:none;user-select:none;-webkit-user-select:none}
.dk-inv .panel>*{position:absolute;pointer-events:auto}
.dk-inv .panel>.string,.dk-inv .panel>.ring,.dk-inv .panel>.vit{pointer-events:none}
.dk-inv .cap{font:400 11px/1 var(--font-mono);letter-spacing:.16em;text-transform:uppercase;color:${LABEL}}
.dk-inv .kk{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;font:400 11px/1 var(--font-mono);color:var(--cream-dim);border:1px solid ${HAIR};border-radius:3px;white-space:nowrap}
.dk-inv .n{font:400 13px/1 var(--font-mono);color:var(--cream);text-shadow:0 1px 2px #000}
.dk-inv .n small{color:var(--cream-dim);font-size:11px}
.dk-inv .art{position:absolute;pointer-events:none;display:flex;align-items:center;justify-content:center}
.dk-inv .art img.art,.dk-inv .art svg{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 8px rgba(0,0,0,.55))}
.dk-inv .top{right:22px;top:16px;display:flex;align-items:center;gap:12px}
.dk-inv .top .cap{display:none}
.dk-inv .top .x{display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--cream-dim);font-size:14px;padding:4px}
/* the belt: the four at hand, loops on a strip of walnut */
.dk-inv .belt{left:20px;top:18px;width:800px;height:128px;border-radius:10px;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.35)),var(--wood) 0 60px/600px 240px;box-shadow:inset 0 0 0 1px rgba(255,220,170,.12),0 14px 28px rgba(0,0,0,.55);padding:12px 18px;display:grid;grid-template-columns:140px 26px repeat(4,1fr);gap:14px}
/* (plan 87) the left hand: its loop at the belt's left end, darker leather, a hand's mark; lit or burning; the buckle */
.dk-inv .loop.hnd{background:linear-gradient(180deg,rgba(42,26,14,.75),rgba(26,16,8,.8));box-shadow:inset 0 2px 8px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,220,170,.18)}
.dk-inv .loop.hnd .k{display:flex;gap:5px;align-items:center}
.dk-inv .loop .gl{width:11px;height:12px;opacity:.85}
.dk-inv .loop.hnd.lit{box-shadow:inset 0 2px 8px rgba(0,0,0,.6),0 0 0 1px var(--amber),0 0 22px rgba(241,215,154,.45)}
.dk-inv .loop.hnd.burn{box-shadow:inset 0 2px 8px rgba(0,0,0,.6),0 0 0 1px #ff7a4a,0 0 22px rgba(255,110,60,.5)}
.dk-inv .loop.hnd.lit::after,.dk-inv .loop.hnd.burn::after{content:"";position:absolute;right:14%;top:22%;width:46px;height:46px;border-radius:50%;background:radial-gradient(circle,rgba(255,236,190,.5),transparent 70%);pointer-events:none}
.dk-inv .loop.hnd.burn::after{background:radial-gradient(circle,rgba(255,120,80,.55),transparent 70%)}
.dk-inv .loop.hnd.sel{box-shadow:inset 0 2px 8px rgba(0,0,0,.6),0 0 0 2px var(--amber),0 0 18px rgba(241,215,154,.45)}
.dk-inv .buckle{align-self:center;height:70%;border-radius:5px;background:linear-gradient(180deg,#d8c08a,#8a7448);box-shadow:inset 0 0 0 4px #5a4a2c,inset 0 0 0 6px #c9b07a,0 3px 6px rgba(0,0,0,.5);pointer-events:none}
.dk-inv .belt::before{content:"";position:absolute;left:8px;right:8px;top:6px;bottom:6px;border:1px dashed rgba(255,220,170,.28);border-radius:7px;pointer-events:none}
.dk-inv .loop{position:relative;overflow:hidden;border-radius:6px;background:rgba(20,12,6,.55);box-shadow:inset 0 2px 8px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,220,170,.1);cursor:pointer;touch-action:none}
.dk-inv .loop .art{inset:14px 10px 22px}
.dk-inv .loop .k{position:absolute;left:8px;top:6px;font:400 11px/1 var(--font-mono);color:rgba(255,230,190,.7)}
.dk-inv .loop .tag{position:absolute;right:8px;top:6px;font:400 10px/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--amber)}
.dk-inv .loop .n,.dk-inv .po .n{position:absolute;right:9px;bottom:7px}
.dk-inv .loop .s,.dk-inv .po .s{position:absolute;left:9px;bottom:7px;font:400 11px/1 var(--font-mono);color:rgba(236,230,218,.6)}
.dk-inv .loop:hover{box-shadow:inset 0 2px 8px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,220,170,.3)}
.dk-inv .loop.hand{box-shadow:inset 0 2px 8px rgba(0,0,0,.6),0 0 0 1px var(--amber),0 0 16px rgba(241,215,154,.35)}
.dk-inv .loop.sel{box-shadow:inset 0 2px 8px rgba(0,0,0,.6),0 0 0 2px var(--amber),0 0 18px rgba(241,215,154,.45);background:rgba(60,40,18,.6)}
/* the pack: a canvas bag drawn open, its flap, its eight stitched pouches */
.dk-inv .bag{left:20px;top:166px;width:800px;height:420px;border-radius:26px 26px 18px 18px;background:radial-gradient(120% 90% at 50% 0%,#4a4334 0%,#3a3428 45%,#2a251c 100%);box-shadow:inset 0 0 0 1px rgba(255,235,200,.1),inset 0 30px 60px rgba(0,0,0,.35),0 26px 50px rgba(0,0,0,.6);padding:54px 34px 30px}
.dk-inv .bag::before{content:"";position:absolute;inset:12px;border-radius:18px 18px 12px 12px;border:2px dashed rgba(255,235,200,.18);pointer-events:none}
.dk-inv .flap{position:absolute;left:50%;top:-20px;transform:translateX(-50%);margin:0;padding:10px 26px;border-radius:10px;background:var(--wood) 0 120px/600px 240px;box-shadow:0 6px 14px rgba(0,0,0,.5);font:600 22px/1 var(--font-title);letter-spacing:.22em;text-transform:uppercase;color:#f3e3c4;white-space:nowrap}
.dk-inv .org{position:absolute;right:30px;top:22px;display:flex;align-items:center;gap:8px;font:400 11px/1 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:rgba(236,230,218,.7);cursor:pointer;padding:4px}
.dk-inv .org:hover{color:var(--amber)}
.dk-inv .pockets{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);gap:18px;height:100%}
.dk-inv .po{position:relative;overflow:hidden;border-radius:10px 10px 16px 16px;background:linear-gradient(180deg,#2c271e,#241f17);box-shadow:inset 0 3px 10px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,235,200,.08);cursor:pointer;touch-action:none}
.dk-inv .po::after{content:"";position:absolute;left:8px;right:8px;top:6px;border-top:2px dashed rgba(255,235,200,.2);pointer-events:none}
.dk-inv .po .art{inset:20px 14px 26px}
.dk-inv .po.e{background:linear-gradient(180deg,rgba(44,39,30,.55),rgba(36,31,23,.55))}
.dk-inv .po:hover{box-shadow:inset 0 3px 10px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,235,200,.28)}
.dk-inv .po.sel{box-shadow:inset 0 3px 10px rgba(0,0,0,.55),0 0 0 2px var(--amber),0 0 18px rgba(241,215,154,.4)}
.dk-inv.dragging .loop:hover,.dk-inv.dragging .po:hover{box-shadow:inset 0 3px 10px rgba(0,0,0,.55),0 0 0 2px var(--amber);background:rgba(241,215,154,.08)}
/* the tag on its string, from the bag's ring */
.dk-inv .ring{left:802px;top:180px;width:20px;height:20px;border-radius:50%;border:3px solid #b39566;box-shadow:0 2px 4px rgba(0,0,0,.5)}
.dk-inv .string{left:812px;top:190px;width:226px;height:2px;background:linear-gradient(90deg,#6d5d42,#a08a62);transform:rotate(-27.4deg);transform-origin:left center;box-shadow:0 2px 3px rgba(0,0,0,.45)}
.dk-inv .paper{left:848px;top:70px;width:330px;padding:24px 22px 18px;background:var(--paper);color:#222;box-shadow:0 16px 34px rgba(0,0,0,.5);transform:rotate(1.2deg)}
.dk-inv .paper::before{content:"";position:absolute;left:50%;top:10px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#2a2620;box-shadow:inset 0 0 0 3px #c8bea6}
.dk-inv .paper .cap{color:#7a6a4a}
.dk-inv .paper .pic{height:120px;display:flex;align-items:center;justify-content:center;margin:10px 0 6px}
.dk-inv .paper .pic img.art,.dk-inv .paper .pic svg{width:110px;height:110px;object-fit:contain;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))}
.dk-inv .paper .pic.wide img.art,.dk-inv .paper .pic.wide svg{width:260px;height:110px}
.dk-inv .paper h2{font:600 30px/1 var(--font-title);margin:0;color:#1d1b17}
.dk-inv .paper .what{font:400 13px/1.45 var(--font-body);color:#555;margin:6px 0 10px}
.dk-inv .paper .what.hint{margin:12px 0}
.dk-inv .paper .sp{display:grid;grid-template-columns:1fr auto;gap:0 12px;font:400 13px/1.75 var(--font-mono)}
.dk-inv .paper .sp b{font-weight:400;text-align:right}
.dk-inv .paper .sp.keys{font-size:12px;line-height:1.5;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center}
.dk-inv .paper .sp.keys b{text-align:left;color:#555}
.dk-inv .paper .sp.keys .kk{color:#555;border-color:rgba(0,0,0,.25)}
.dk-inv .paper .note{grid-column:1/-1;color:#8a5a17;border-top:1px dashed rgba(0,0,0,.2);margin-top:4px;padding-top:4px;line-height:1.45}
.dk-inv .paper .btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.dk-inv .lampbtn,.dk-inv .btn{height:36px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:4px;font:600 13px/1 var(--font-body);cursor:pointer;flex:1 1 40%}
.dk-inv .lampbtn{background:var(--amber);color:var(--ink);box-shadow:0 0 14px rgba(241,215,154,.35);flex-grow:1.3}
.dk-inv .lampbtn .kk{color:var(--ink);border-color:rgba(26,26,30,.4)}
.dk-inv .lampbtn:hover{filter:brightness(1.06)}
.dk-inv .paper .btn{color:#222;border:1px solid rgba(0,0,0,.25);background:transparent}
.dk-inv .paper .btn .kk{color:#555;border-color:rgba(0,0,0,.25)}
.dk-inv .paper .btn:hover{background:rgba(0,0,0,.05)}
.dk-inv .btn.off,.dk-inv .lampbtn.off{opacity:.45;cursor:default;box-shadow:none}
.dk-inv .btn.holding{background-image:linear-gradient(rgba(200,85,63,.35),rgba(200,85,63,.35));background-repeat:no-repeat;background-size:0 100%;animation:dkinvhold ${HOLD_MS}ms linear forwards}
@keyframes dkinvhold{to{background-size:100% 100%}}
/* what lies in reach, along the foot; the vitals, typed */
.dk-inv .snow{left:40px;top:614px;height:72px;display:flex;gap:14px;align-items:center;max-width:820px}
.dk-inv .gl{display:flex;gap:14px;align-items:center;overflow:hidden}
.dk-inv .gl .none{font:400 12px/1 var(--font-mono);color:var(--cream-dim)}
.dk-inv .stone{position:relative;flex:none;height:70px;padding:0 16px 0 72px;border-radius:36px;background:rgba(236,240,245,.1);border:1px solid rgba(236,240,245,.2);display:flex;align-items:center;gap:10px;backdrop-filter:blur(3px);cursor:pointer;touch-action:none}
.dk-inv .stone .art{left:10px;top:10px;width:52px;height:50px}
.dk-inv .stone.w{padding-left:96px}
.dk-inv .stone.w .art{width:78px}
.dk-inv .stone b{font:600 14px/1.2 var(--font-body);display:block}
.dk-inv .stone .nm span{font:400 12px/1 var(--font-mono);color:var(--cream-dim)}
.dk-inv .stone .take{margin-left:8px;font:400 11px/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--amber)}
.dk-inv .stone:hover{border-color:rgba(236,240,245,.4)}
.dk-inv .stone.sel{border-color:var(--amber);box-shadow:0 0 14px rgba(241,215,154,.3)}
.dk-inv .kk.all{height:26px;padding:0 10px;color:var(--amber);cursor:pointer;flex:none}
.dk-inv .kk.all:hover{background:rgba(241,215,154,.1)}
.dk-inv .vit{right:30px;bottom:24px;display:flex;gap:16px;font:400 12px/1 var(--font-mono);color:var(--cream-dim)}
.dk-inv .vit b{color:var(--cream);font-weight:400}
.dk-inv .vit .lo b{color:${RED}}
/* the drag's ghost; the menu */
.dk-inv-ghost{position:fixed;z-index:3;width:84px;height:84px;transform:translate(-50%,-50%) rotate(-5deg);pointer-events:none;filter:drop-shadow(0 8px 14px rgba(0,0,0,.6))}
.dk-inv-ghost.wide{width:150px;height:64px}
.dk-inv-ghost svg,.dk-inv-ghost img.art{width:100%;height:100%;object-fit:contain}
.dk-inv-menu{position:fixed;z-index:4;min-width:196px;padding:6px;border-radius:4px;background:#1b1c22;border:1px solid ${HAIR};box-shadow:0 14px 30px rgba(0,0,0,.6);user-select:none;-webkit-user-select:none}
.dk-inv-menu .it{height:30px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 10px;border-radius:3px;font:500 13px/1 var(--font-body);color:var(--cream);cursor:pointer}
.dk-inv-menu .it:hover,.dk-inv-menu .it.on{background:rgba(241,215,154,.12);color:var(--amber)}
.dk-inv-menu .it.bad{color:${RED}}
.dk-inv-menu .r{display:flex;gap:4px}
.dk-inv-menu .kk{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;font:400 10px/1 var(--font-mono);color:var(--cream-dim);border:1px solid ${HAIR};border-radius:3px;white-space:nowrap}
.dk-inv-menu .kk[data-menu]:hover{color:var(--ink);background:var(--amber);border-color:var(--amber)}
.dk-inv-menu .kk.own{opacity:.35}
.dk-inv-menu .kk.hd{gap:3px;color:var(--amber);border-color:rgba(241,215,154,.5)}
.dk-inv-menu .kk .gl{width:9px;height:10px}
.dk-inv-menu hr{border:0;border-top:1px solid rgba(241,215,154,.14);margin:4px 2px}
.dk-inv-warn{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:20001;color:var(--cream);font:400 13px/1.3 var(--font-mono);background:rgba(90,20,18,.85);border:1px solid rgba(255,120,110,.4);border-radius:4px;padding:8px 14px}
/* a phone (plan 86 0-b-phone): a column — the belt, the pack four across, the tag a sheet, the ground a line */
.dk-inv.phone .panel{left:0;top:0;width:100%;height:100%;transform:none;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:12px;pointer-events:auto;background:rgba(8,10,14,.6)}
.dk-inv.phone .panel>*{position:relative;left:auto;top:auto;right:auto;bottom:auto;width:auto}
.dk-inv.phone .top{justify-content:space-between}
.dk-inv.phone .top .cap{display:block}
.dk-inv.phone .top .x .kk{display:none}
.dk-inv.phone .belt{height:84px;flex:none;padding:8px 10px;gap:6px;border-radius:8px;grid-template-columns:1.1fr 10px repeat(4,1fr)}
.dk-inv.phone .belt::before{left:5px;right:5px;top:4px;bottom:4px;border-radius:6px}
.dk-inv.phone .loop .art{inset:10px 4px 15px}
.dk-inv.phone .loop .k{left:5px;top:4px;font-size:9px}
.dk-inv.phone .loop .tag,.dk-inv.phone .loop .s,.dk-inv.phone .po .s,.dk-inv.phone .n small{display:none}
.dk-inv.phone .loop .n,.dk-inv.phone .po .n{right:5px;bottom:4px;font-size:10px}
.dk-inv.phone .bag{height:auto;flex:none;margin-top:12px;padding:30px 12px 14px;border-radius:18px 18px 12px 12px}
.dk-inv.phone .bag::before{inset:7px;border-radius:13px 13px 8px 8px}
.dk-inv.phone .flap{top:-14px;padding:7px 18px;font-size:16px;border-radius:8px}
.dk-inv.phone .org{right:14px;top:10px;font-size:9px}
.dk-inv.phone .org .kk{display:none}
.dk-inv.phone .pockets{grid-template-rows:none;gap:8px}
.dk-inv.phone .po{height:76px;border-radius:7px 7px 11px 11px}
.dk-inv.phone .po .art{inset:12px 6px 16px}
.dk-inv.phone .ring,.dk-inv.phone .string,.dk-inv.phone .vit{display:none}
.dk-inv.phone .paper{flex:none;padding:16px 16px 12px;transform:rotate(.6deg);display:grid;grid-template-columns:110px 1fr;gap:2px 12px}
.dk-inv.phone .paper::before{top:6px;width:10px;height:10px;margin-left:-5px}
.dk-inv.phone .paper .cap{grid-column:2;align-self:end}
.dk-inv.phone .paper .pic{grid-column:1;grid-row:1/3;height:64px;margin:0}
.dk-inv.phone .paper .pic img.art,.dk-inv.phone .paper .pic svg{width:100px;height:56px}
.dk-inv.phone .paper h2{grid-column:2;font-size:24px}
.dk-inv.phone .paper .what{display:none}
.dk-inv.phone .paper .what.hint{display:block;grid-column:1/-1}
.dk-inv.phone .paper .sp,.dk-inv.phone .paper .btns{grid-column:1/-1}
.dk-inv.phone .paper .sp{font-size:12px;line-height:1.6;margin-top:6px}
.dk-inv.phone .snow{height:auto;flex:none;gap:8px}
.dk-inv.phone .snow>.cap{display:none}
.dk-inv.phone .gl{flex:1;gap:8px}
.dk-inv.phone .stone{flex:1;height:50px;padding:0 10px 0 50px}
.dk-inv.phone .stone .art{left:6px;top:7px;width:36px;height:36px}
.dk-inv.phone .stone.w{padding-left:62px}
.dk-inv.phone .stone.w .art{width:50px}
.dk-inv.phone .stone b{font-size:12px}
.dk-inv.phone .stone .nm span{font-size:11px}
.dk-inv.phone .stone .take{display:none}
.dk-inv.phone .kk.all{height:34px}
`;
