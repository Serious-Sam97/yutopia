import { ARMS, FLARE, LOOT_REACH } from "@yutopia/shared/dark";
import {
  type Inventory,
  type ItemId,
  isWeapon,
  POCKETS,
  STACKS,
  WEAPON_SLOT,
  WEAPONS,
} from "@yutopia/shared/inventory";
import { VITALS } from "@yutopia/shared/vitals";
import type { WorldController } from "../controller";
import type { Walker } from "../input/walker";
import { ICON } from "./icons";

// The inventory (docs/plan/30-the-dark.md, design/screens/dark/06a-inventory,
// 06b-inventory): I (the pad's Menu) opens "Pockets" over the world, which
// doesn't stop — you stand still while it's open, and can't aim. Left, you:
// health, stamina, warmth, the battery, what's in your hand. The middle: the
// two weapons and the six pockets. Right, the one picked: what it is, use,
// hold, reload, drop. Below, what lies on the snow in reach. Click to pick,
// right click to drop, drag to move between pockets (or from the snow into
// one); on the pad the d-pad moves, A uses or takes, X drops, B closes.

const AMBER = "#e9a33a";
const USABLE = new Set<string>(["aid", "battery"]);
const NEAR = 15; // tiles: one of the shadowed this near, the warning

/** What the panel asks for (the dark's index sends it). */
export interface InvActions {
  use(slot: number): void;
  drop(slot: number): void;
  move(from: number, to: number): void;
  pick(id: string, slot?: number): void;
  draw(slot: number): void;
  reload(): void;
}
type Tr = (key: string, vars?: Record<string, string>) => string;
type Pick = { slot: number } | { drop: string } | null;
interface Lying {
  id: string;
  item: ItemId;
  n: number;
  loaded: number;
}

export class InventoryPanel {
  open = false;
  private readonly el = document.createElement("div");
  private readonly warn = document.createElement("div");
  private sel: Pick = null;
  private drag: { from: Pick; x: number; y: number; ghost: HTMLElement | null } | null = null;
  private groundKey = "";
  private ground: Lying[] = [];
  private shown = "";
  private vitalsAt = 0;
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
    this.warn.className = "dk-inv-warn";
    this.el.style.display = "none";
    this.warn.style.display = "none";
    // (its own layer over everything: the 3D name tags stack up to 10000 over the dark's)
    document.body.append(this.el, this.warn);
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    this.el.addEventListener("pointerdown", this.down);
    window.addEventListener("pointermove", this.moved);
    window.addEventListener("pointerup", this.up);
  }

  dispose(): void {
    window.removeEventListener("pointermove", this.moved);
    window.removeEventListener("pointerup", this.up);
    this.el.remove();
    this.warn.remove();
  }

  toggle(): void {
    if (this.open) this.close();
    else {
      this.open = true;
      // (mouse look on: the pointer shown while it's open — let go here, so the browser locks it
      // again on closing without asking for a click)
      this.relook = !!this.ctl.tp?.looking;
      if (this.relook) this.ctl.tp?.setLook(false);
      this.el.style.display = "block";
      this.shown = "";
      this.render();
    }
  }
  close(): void {
    this.open = false;
    this.el.style.display = "none";
    this.warn.style.display = "none";
    this.endDrag();
    if (this.relook) this.ctl.tp?.setLook(true);
    this.relook = false;
  }

  /** A key down while open (the dark's capturing listener): true if it's taken. I isn't (the walker's). */
  key(e: KeyboardEvent): boolean {
    if (!this.open) return false;
    if (e.code === "Escape") {
      this.close();
      return true;
    }
    if (e.code === "KeyE") this.primary();
    else if (e.code === "KeyR") this.act.reload();
    else if (e.code === "Digit1" || e.code === "Digit2") this.act.draw(e.code === "Digit1" ? 0 : 1);
    else if (e.code === "Delete" || e.code === "Backspace") this.dropSel();
    else if (e.code === "KeyI") return false;
    return true;
  }

  /** Every frame: the vitals, the snow in reach, the warning, the pad. */
  frame(): void {
    if (!this.open) return;
    const now = performance.now();
    // what lies in reach (shown when it changes)
    const me = this.walker.where();
    const lying: Lying[] = [];
    this.ctl.room?.state.drops?.forEach(
      (d: { id: string; item: string; n: number; loaded: number; x: number; y: number }) => {
        if (this.walker.outside && Math.hypot(d.x - me.x, d.y - me.y) <= LOOT_REACH)
          lying.push({ id: d.id, item: d.item as ItemId, n: d.n, loaded: d.loaded });
      },
    );
    const key = lying.map((d) => `${d.id}:${d.n}`).join(",");
    if (key !== this.groundKey) {
      this.groundKey = key;
      this.ground = lying;
      if (this.sel && "drop" in this.sel && !lying.some((d) => d.id === (this.sel as { drop: string }).drop))
        this.sel = null;
      this.render();
    }
    if (now - this.vitalsAt > 200) {
      this.vitalsAt = now;
      this.render();
    }
    const n = this.near();
    this.warn.style.display = n <= NEAR ? "block" : "none";
    if (n <= NEAR) this.warn.textContent = this.t("dark_inv_near");
    this.pad();
  }

  // ── the pad: the d-pad moves through weapons, pockets, the snow; A uses or takes, X drops, B closes ──
  private pad() {
    const pad = this.walker.controls.pad;
    const order: Pick[] = [
      { slot: WEAPON_SLOT },
      { slot: WEAPON_SLOT + 1 },
      ...Array.from({ length: POCKETS }, (_, i) => ({ slot: i })),
      ...this.ground.map((d) => ({ drop: d.id })),
    ];
    const at = Math.max(
      0,
      order.findIndex((o) => same(o, this.sel)),
    );
    let to = -1;
    if (pad.pressed(15)) to = at + 1; // →
    if (pad.pressed(14)) to = at - 1; // ←
    if (pad.pressed(13)) to = at < 2 ? 2 : at + 3; // ↓ (weapons above, pockets three a row)
    if (pad.pressed(12)) to = at < 2 ? at : at < 5 ? 0 : at - 3; // ↑
    if (to >= 0) {
      this.sel = order[Math.max(0, Math.min(order.length - 1, to))];
      this.render();
    }
    if (pad.pressed(0)) this.primary();
    if (pad.pressed(2)) this.dropSel();
    if (pad.pressed(1)) this.close();
  }

  // ── what the buttons do ──────────────────────────────────────────────────
  private primary() {
    const s = this.sel;
    const inv = this.inv();
    if (!s || !inv) return;
    if ("drop" in s) return this.act.pick(s.drop);
    if (s.slot >= WEAPON_SLOT) return this.act.draw(s.slot - WEAPON_SLOT);
    const st = inv.pockets[s.slot];
    if (st && USABLE.has(st.id)) this.act.use(s.slot);
  }
  private dropSel() {
    const s = this.sel;
    if (s && "slot" in s && this.walker.outside) this.act.drop(s.slot);
  }

  // ── the pointer: click picks, right click drops, a drag moves ────────────
  private down = (e: PointerEvent) => {
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-slot],[data-drop],[data-act]");
    if (!hit) return;
    e.preventDefault();
    const act = hit.dataset.act;
    if (act) {
      if (e.button === 0) this.button(act);
      return;
    }
    const pick: Pick =
      hit.dataset.slot !== undefined ? { slot: Number(hit.dataset.slot) } : { drop: hit.dataset.drop as string };
    if (e.button === 2) {
      if ("slot" in pick && this.walker.outside) this.act.drop(pick.slot);
      return;
    }
    if (e.button !== 0) return;
    this.sel = pick;
    this.shown = "";
    this.render();
    if (hit.classList.contains("empty")) return;
    this.drag = { from: pick, x: e.clientX, y: e.clientY, ghost: null };
  };
  private moved = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      const id = this.itemOf(d.from);
      if (!id) return;
      d.ghost = document.createElement("div");
      d.ghost.className = "dk-inv-ghost";
      d.ghost.innerHTML = ICON[id];
      this.el.append(d.ghost);
      this.el.classList.add("dragging");
    }
    if (d.ghost) {
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
    }
  };
  private up = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    if (d.ghost) {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-slot]");
      const to = under ? Number(under.dataset.slot) : -1;
      if (to >= 0 && d.from) {
        if ("slot" in d.from) {
          if (to !== d.from.slot) this.act.move(d.from.slot, to);
        } else this.act.pick(d.from.drop, to);
        this.sel = { slot: to };
      }
    }
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
  }
  private itemOf(p: Pick): ItemId | null {
    const inv = this.inv();
    if (!p || !inv) return null;
    if ("drop" in p) return this.ground.find((d) => d.id === p.drop)?.item ?? null;
    return (p.slot >= WEAPON_SLOT ? inv.weapons[p.slot - WEAPON_SLOT]?.id : inv.pockets[p.slot]?.id) ?? null;
  }

  // ── the panel ────────────────────────────────────────────────────────────
  private render() {
    if (!this.open) return;
    const inv = this.inv();
    const t = this.t;
    const room = this.ctl.room;
    const lp = room?.state.players.get(room.sessionId);
    const hp = Math.round((lp?.hp as number) ?? 100);
    const st = Math.round(this.walker.vitals.st);
    const wm = Math.round((lp?.wm as number) ?? 100);
    const bat = Math.round(this.walker.vitals.bat);
    const gun = (lp?.gun as string) || "";
    const out = this.walker.outside;
    const night = (room?.state.hour ?? 12) >= 20.5 || (room?.state.hour ?? 12) < 5;
    // (rebuilt only when something shown changed)
    const sig = JSON.stringify([inv, hp, st, wm, bat, gun, out, this.sel, this.groundKey, this.walker.breath.drained]);
    if (sig === this.shown) return;
    this.shown = sig;

    const bar = (name: string, v: number, col: string, txt: string, hint: string) =>
      `<div class="vit"><div class="row"><span>${name}</span><span>${txt}</span></div><div class="bar"><i style="width:${v}%;background:${col}"></i></div>${hint ? `<small>${hint}</small>` : ""}</div>`;
    const cold = out && night ? t("dark_inv_cold") : wm < 100 && !out ? t("dark_inv_warm") : "";
    const held = gun && isWeapon(gun) ? inv?.weapons.find((w) => w?.id === gun) : null;
    const you = `<div class="col"><div class="lbl">${t("dark_inv_you")}</div>
      ${bar(t("dark_inv_health"), hp, "#d9534f", String(hp), hp < VITALS.hp.upTo ? t("dark_inv_hp_hint") : "")}
      ${bar(t("dark_inv_stamina"), st, this.walker.breath.winded ? AMBER : "#e9ecef", String(st), this.walker.breath.winded ? t("dark_winded") : "")}
      ${bar(t("dark_inv_warmth"), wm, "#8fc6ec", String(wm), cold)}
      ${bar(t("dark_inv_battery"), bat, bat < 25 ? "#d9534f" : "#d9dde2", `${bat}%`, this.walker.breath.drained ? t("dark_recharging") : t("dark_inv_bat_hint"))}
      <div class="held">${t("dark_inv_hand")}<b>${held ? `${t(`dark_item_${held.id}`)} · ${held.loaded}/${WEAPONS[held.id].mag}` : t("dark_inv_nothing")}</b></div></div>`;

    const isSel = (p: Pick) => (same(p, this.sel) ? " sel" : "");
    let weapons = "";
    let pockets = "";
    if (inv) {
      inv.weapons.forEach((w, i) => {
        const slot = WEAPON_SLOT + i;
        const spare = w ? countOf(inv, WEAPONS[w.id].ammo) : 0;
        weapons += w
          ? `<div class="slot w${isSel({ slot })}${gun === w.id ? " inhand" : ""}" data-slot="${slot}"><span class="k">${i + 1}</span>${ICON[w.id]}<span class="sub">+${spare} ${t(`dark_item_${WEAPONS[w.id].ammo}`).toLowerCase()}</span><span class="n">${w.loaded}/${WEAPONS[w.id].mag}</span>${gun === w.id ? `<span class="tag">${t("dark_inv_hand").toUpperCase()}</span>` : ""}</div>`
          : `<div class="slot w empty${isSel({ slot })}" data-slot="${slot}"><span class="k">${i + 1}</span></div>`;
      });
      inv.pockets.forEach((s, i) => {
        pockets += s
          ? `<div class="slot p${isSel({ slot: i })}" data-slot="${i}">${ICON[s.id]}<span class="n">${s.n}<small>/${STACKS[s.id]}</small></span></div>`
          : `<div class="slot p empty${isSel({ slot: i })}" data-slot="${i}"></div>`;
      });
    }

    const ground = this.ground.length
      ? this.ground
          .map(
            (d) =>
              `<div class="gi${isWeapon(d.item) ? " wide" : ""}${isSel({ drop: d.id })}" data-drop="${d.id}">${ICON[d.item]}<div><b>${t(`dark_item_${d.item}`)}</b><span>${isWeapon(d.item) ? `${d.loaded}/${WEAPONS[d.item].mag}` : `×${d.n}`}</span></div><span class="take">${t("dark_inv_take").toUpperCase()}</span></div>`,
          )
          .join("")
      : `<span class="none">${t(out ? "dark_inv_ground_none" : "dark_inv_ground_inside")}</span>`;

    const key = (k: string) => `<span class="dk-key">${k}</span>`;
    this.el.innerHTML = `<div class="dk-inv-bg" data-act="close"></div><div class="panel">
      <div class="head"><h1>${t("dark_inv_title")}</h1><span class="r">${t("dark_inv_sub")}</span><span class="x" data-act="close">✕</span></div>
      ${you}
      <div class="col"><div class="lbl">${t("dark_inv_weapons")}</div><div class="ws">${weapons}</div>
        <div class="lbl">${t("dark_inv_pockets")}</div><div class="grid">${pockets}</div></div>
      <div class="col det">${this.details(inv, gun, hp, bat, out)}</div>
      <div class="ground"><div class="lbl">${t("dark_inv_ground")}</div><div class="gl">${ground}</div>
        <div class="foot">${t("dark_inv_foot", { i: key("I"), e: key("E") })} · pad ${key("Menu")} ${key("A")} ${key("X")} ${key("B")}</div></div>
    </div>`;
    if (this.drag?.ghost) this.el.append(this.drag.ghost);
  }

  private details(inv: Inventory | null, gun: string, hp: number, bat: number, out: boolean): string {
    const t = this.t;
    const id = this.itemOf(this.sel);
    const head = `<div class="lbl">${t("dark_inv_picked")}</div>`;
    if (!inv || !id || !this.sel) return `${head}<p class="hint">${t("dark_inv_pick_hint")}</p>`;
    const k = (s: string) => `<span class="dk-key">${s}</span>`;
    const btn = (act: string, label: string, keys: string, main = false, off = false) =>
      `<div class="btn${main ? " main" : ""}${off ? " off" : ""}" ${off ? "" : `data-act="${act}"`}><span>${label}</span><span>${keys}</span></div>`;
    const stat = (a: string, b: string) => `<span>${a}</span><b>${b}</b>`;
    const dropBtn = out
      ? btn("drop", t("dark_inv_drop_btn"), t("dark_inv_right"))
      : btn("drop", t("dark_inv_drop_btn"), t("dark_inv_outside"), false, true);
    let stats = "";
    let btns = "";
    if ("drop" in this.sel) {
      const d = this.ground.find((g) => g.id === (this.sel as { drop: string }).drop);
      stats = d ? stat(t("dark_inv_on_snow"), isWeapon(d.item) ? `${d.loaded}/${WEAPONS[d.item].mag}` : `×${d.n}`) : "";
      btns = btn("take", t("dark_inv_take"), `${k("E")} · ${t("dark_inv_drag")}`, true);
    } else if (isWeapon(id)) {
      const w = inv.weapons[this.sel.slot - WEAPON_SLOT];
      const a = ARMS[id];
      const ammo = WEAPONS[id].ammo;
      stats =
        stat(t("dark_inv_loaded"), t("dark_inv_of", { n: String(w?.loaded ?? 0), m: String(WEAPONS[id].mag) })) +
        stat(t("dark_inv_spare", { ammo: t(`dark_item_${ammo}`) }), String(countOf(inv, ammo))) +
        stat(t("dark_inv_damage"), a.pellets > 1 ? `${a.pellets} × ${a.damage}` : String(a.damage)) +
        stat(t("dark_inv_range"), `${a.range} m`);
      const n = String(this.sel.slot - WEAPON_SLOT + 1);
      btns =
        (gun === id ? btn("away", t("dark_inv_away"), k(n)) : btn("hold", t("dark_inv_hold"), k(n), true)) +
        (gun === id && (w?.loaded ?? 0) < WEAPONS[id].mag && countOf(inv, ammo) > 0
          ? btn("reload", t("dark_inv_reload"), k("R"))
          : "") +
        dropBtn;
    } else {
      const s = inv.pockets[this.sel.slot];
      stats = stat(t("dark_inv_in_pocket"), t("dark_inv_of", { n: String(s?.n ?? 0), m: String(STACKS[id]) }));
      if (id === "aid") stats += stat(t("dark_inv_health_now"), `${hp} → 100`);
      if (id === "battery") stats += stat(t("dark_inv_bat_now"), `${bat}% → 100%`);
      if (id === "flare") stats += stat(t("dark_inv_burns"), `${FLARE.secs} s`);
      btns =
        (USABLE.has(id) ? btn("use", t("dark_inv_use"), `${k("E")} · ${t("dark_inv_click")}`, true) : "") + dropBtn;
    }
    const wide = isWeapon(id) ? " wide" : "";
    return `${head}<div class="big${wide}">${ICON[id]}</div><h2>${t(`dark_item_${id}`)}</h2><p>${t(`dark_desc_${id}`)}</p><div class="stats">${stats}</div><div class="btns">${btns}</div>`;
  }
}

function same(a: Pick, b: Pick): boolean {
  if (!a || !b) return false;
  if ("slot" in a) return "slot" in b && a.slot === b.slot;
  return "drop" in b && a.drop === b.drop;
}
function countOf(inv: Inventory, id: string): number {
  let n = 0;
  for (const s of inv.pockets) if (s?.id === id) n += s.n;
  return n;
}

export const INV_CSS = `
.dk-inv{position:fixed;inset:0;pointer-events:auto;z-index:20000;font-family:-apple-system,"SF Pro Text","Helvetica Neue",system-ui,sans-serif;color:#e9ecef}
.dk-inv-bg{position:absolute;inset:0;background:rgba(4,6,10,.5);backdrop-filter:blur(4px) brightness(.8)}
.dk-inv .panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1080px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border-radius:14px;background:rgba(12,15,21,.86);border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.6);display:grid;grid-template-columns:250px 1fr 300px;user-select:none}
.dk-inv .head{grid-column:1/4;display:flex;align-items:center;gap:16px;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,.09)}
.dk-inv .head h1{font-size:15px;letter-spacing:.18em;font-weight:800;margin:0;flex:1}
.dk-inv .head .r{font-size:12px;color:rgba(233,236,239,.6)}
.dk-inv .head .x{cursor:pointer;font-size:14px;color:rgba(233,236,239,.6);padding:2px 6px}
.dk-inv .col{padding:20px 22px}
.dk-inv .col+.col{border-left:1px solid rgba(255,255,255,.07)}
.dk-inv .lbl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:rgba(233,236,239,.55);font-weight:700}
.dk-inv .vit{margin:14px 0 0}
.dk-inv .vit .row{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;font-weight:700}
.dk-inv .vit .row span:last-child{font-size:12px;color:rgba(233,236,239,.75)}
.dk-inv .vit .bar{height:6px;background:rgba(255,255,255,.12);border-radius:3px;margin-top:6px;overflow:hidden;position:relative}
.dk-inv .vit .bar i{position:absolute;top:0;bottom:0;left:0;border-radius:3px}
.dk-inv .vit small{display:block;font-size:11px;color:rgba(233,236,239,.5);margin-top:4px}
.dk-inv .held{margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;color:rgba(233,236,239,.7)}
.dk-inv .held b{display:block;font-size:14px;color:#e9ecef;margin-top:3px}
.dk-inv .ws{display:flex;gap:12px;margin:10px 0 24px}
.dk-inv .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:10px}
.dk-inv .slot{position:relative;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);cursor:pointer}
.dk-inv .slot:hover{border-color:rgba(255,255,255,.4)}
.dk-inv .slot.w{flex:1;height:96px}
.dk-inv .slot.p{height:100px}
.dk-inv .slot svg{position:absolute;inset:12px 12px 22px 12px;width:calc(100% - 24px);height:calc(100% - 34px);pointer-events:none}
.dk-inv .slot .k{position:absolute;left:8px;top:6px;font-size:11px;font-weight:800;color:rgba(233,236,239,.55)}
.dk-inv .slot .n{position:absolute;right:8px;bottom:5px;font-size:15px;font-weight:800;text-shadow:0 1px 2px #000}
.dk-inv .slot .n small{font-size:11px;font-weight:600;color:rgba(233,236,239,.5)}
.dk-inv .slot .sub{position:absolute;left:8px;bottom:6px;font-size:11px;color:rgba(233,236,239,.6);font-weight:600}
.dk-inv .slot .tag{position:absolute;right:8px;top:6px;font-size:9px;font-weight:800;letter-spacing:.08em;color:rgba(233,236,239,.75)}
.dk-inv .slot.empty{background:rgba(255,255,255,.02);border-style:dashed;border-color:rgba(255,255,255,.12)}
.dk-inv .slot.inhand{border-color:rgba(233,236,239,.55)}
.dk-inv .slot.sel,.dk-inv .gi.sel{border:1.5px solid ${AMBER};background:rgba(233,163,58,.09);box-shadow:0 0 16px rgba(233,163,58,.25)}
.dk-inv.dragging .slot:hover{border:1.5px dashed ${AMBER};background:rgba(233,163,58,.06)}
.dk-inv-ghost{position:fixed;width:84px;height:84px;transform:translate(-50%,-50%) rotate(-5deg);pointer-events:none;filter:drop-shadow(0 8px 14px rgba(0,0,0,.6))}
.dk-inv-ghost svg{width:100%;height:100%}
.dk-inv .det .hint{font-size:13px;color:rgba(233,236,239,.5);margin-top:14px}
.dk-inv .big{height:110px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 55%,rgba(255,255,255,.07),transparent 70%);border-radius:10px;margin:10px 0 14px}
.dk-inv .big svg{width:100px;height:100px}
.dk-inv .big.wide svg{width:220px;height:90px}
.dk-inv .det h2{font-size:19px;font-weight:800;margin:0}
.dk-inv .det p{font-size:13px;line-height:1.45;color:rgba(233,236,239,.72);margin:8px 0 12px}
.dk-inv .stats{display:grid;grid-template-columns:1fr auto;gap:5px 10px;font-size:12px;color:rgba(233,236,239,.6);margin-bottom:16px}
.dk-inv .stats b{color:#e9ecef;font-weight:700;text-align:right}
.dk-inv .btns{display:flex;flex-direction:column;gap:8px}
.dk-inv .btn{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:7px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:13px;font-weight:700;cursor:pointer}
.dk-inv .btn:hover{background:rgba(255,255,255,.12)}
.dk-inv .btn.main{background:${AMBER};color:#14110c;border-color:${AMBER}}
.dk-inv .btn.main .dk-key{color:#14110c;border-color:rgba(20,17,12,.55)}
.dk-inv .btn.off{opacity:.45;cursor:default}
.dk-inv .btn span:last-child{font-size:11px;font-weight:600;opacity:.75}
.dk-inv .ground{grid-column:1/4;border-top:1px solid rgba(255,255,255,.09);padding:16px 24px;display:flex;flex-direction:column;gap:10px}
.dk-inv .gl{display:flex;gap:12px;flex-wrap:wrap;min-height:72px;align-items:center}
.dk-inv .gl .none{font-size:12px;color:rgba(233,236,239,.45)}
.dk-inv .gi{width:190px;height:72px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;gap:10px;padding:0 12px;position:relative;cursor:pointer}
.dk-inv .gi svg{width:46px;height:46px;flex:none;pointer-events:none}
.dk-inv .gi.wide svg{width:64px;height:30px}
.dk-inv .gi b{font-size:13px;display:block}
.dk-inv .gi span{font-size:11px;color:rgba(233,236,239,.55)}
.dk-inv .gi .take{position:absolute;right:10px;top:8px;font-size:10px;font-weight:800;color:${AMBER};letter-spacing:.06em}
.dk-inv .foot{font-size:11px;color:rgba(233,236,239,.55);text-align:right}
.dk-inv-warn{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:20001;color:#e9ecef;font-family:-apple-system,"SF Pro Text","Helvetica Neue",system-ui,sans-serif;background:rgba(90,20,18,.85);border:1px solid rgba(255,120,110,.4);border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600}
@media (max-width:900px){.dk-inv .panel{grid-template-columns:1fr}.dk-inv .head,.dk-inv .ground{grid-column:1}.dk-inv .col+.col{border-left:0;border-top:1px solid rgba(255,255,255,.07)}}
`;
