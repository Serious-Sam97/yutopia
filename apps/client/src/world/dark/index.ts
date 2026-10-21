import type { ServerMessages } from "@yutopia/shared";
import { LOCKER, LOOT, LOOT_REACH, type LootItem, SEARCH_MS } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import { type Inventory, type ItemId, POCKETS, WEAPON_SLOT, WEAPONS } from "@yutopia/shared/inventory";
import { addStrings, trMaybe } from "@/lib/i18n";
import type { WorldController } from "../controller";
import { actionOf } from "../input/bindings";
import type { Press } from "../input/controls";
import type { DarkHooks, Walker } from "../input/walker";
import { ARMS_CSS, Arms } from "./arms";
import { DOWN_CSS, Down } from "./down";
import { CACHE_ICON, ICON } from "./icons";
import { INV_CSS, InventoryPanel } from "./inventory";
import { Shades } from "./shades";
import { STRINGS } from "./strings";
import { VITALS_CSS, VitalsHud } from "./vitals-hud";
import { DarkSound } from "./voices";

// The dark (docs/plan/30-the-dark.md), on the client: its own chunk, loaded by
// the walker the first time I'm out on the land. Phase 2: my stamina as an arc
// by my body (amber, out of breath), what I carry (a strip bottom right, for a
// moment after a pickup and while Tab is held: click to use, right click to
// drop), searching a spot (E or the pad's X near it: a ring fills, then the
// server says what was in it), what lies on the snow. As in
// design/screens/dark/05a-loot and 05b-pockets.
export const DARK_CHUNK = "yutopia-dark";
addStrings(STRINGS, DARK_CHUNK);

const t = (key: string, vars: Record<string, string> = {}) =>
  (trMaybe(key) ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const itemName = (id: ItemId) => t(`dark_item_${id}`);
const TPX = 39.19; // iso px a tile up (the views' clientAt)
const AMBER = "#e9a33a";
const USABLE = new Set<string>(["aid", "battery"]);

type Target =
  | { kind: "spot"; id: string; label: string; x: number; y: number; z: number }
  | { kind: "drop"; id: string; label: string; x: number; y: number; z: number };

export function startDark(ctl: WorldController, walker: Walker): DarkHooks {
  return new Dark(ctl, walker);
}

const CSS = `
.dk{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:-apple-system,"SF Pro Text","Helvetica Neue",system-ui,sans-serif;color:#e9ecef}
.dk .abs{position:absolute}
.dk-strip{display:flex;gap:6px;align-items:flex-end;right:24px;bottom:182px;transition:opacity .25s}
.dk-bat{right:24px;bottom:140px;width:170px}
.dk-bat .row{display:flex;justify-content:space-between;font-size:12px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.dk-bat .bar{position:relative;height:5px;background:rgba(255,255,255,.18);border-radius:3px;margin-top:6px;overflow:hidden}
.dk-bat .bar i{position:absolute;top:0;bottom:0;left:0}
.dk-slot{position:relative;height:58px;width:58px;border-radius:7px;background:rgba(12,15,21,.66);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(3px)}
.dk-slot.w{width:104px}
.dk-slot svg{position:absolute;inset:6px 6px 10px 6px;width:calc(100% - 12px);height:calc(100% - 16px)}
.dk-slot .k{position:absolute;left:5px;top:3px;font-size:10px;font-weight:700;color:rgba(233,236,239,.55)}
.dk-slot .n{position:absolute;right:5px;bottom:2px;font-size:13px;font-weight:700;text-shadow:0 1px 2px #000}
.dk-slot.empty{background:rgba(12,15,21,.38);border-style:dashed;border-color:rgba(255,255,255,.12)}
.dk-slot.new{border:1.5px solid ${AMBER};box-shadow:0 0 12px rgba(233,163,58,.45)}
.dk-slot .plus{position:absolute;left:50%;top:-20px;transform:translateX(-50%);font-size:12px;font-weight:800;color:${AMBER};text-shadow:0 1px 3px #000}
.dk-slot:hover{border-color:#fff;background:rgba(40,46,56,.8)}
.dk-tip{position:absolute;bottom:68px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(10,12,16,.9);border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 9px;font-size:12px;display:none}
.dk-slot:hover .dk-tip{display:block}
.dk-tip b{display:block;font-size:13px;margin-bottom:3px}
.dk-tip span{color:rgba(233,236,239,.7)}
.dk-hint{position:absolute;right:0;bottom:-18px;white-space:nowrap;font-size:11px;color:rgba(233,236,239,.6)}
.dk-key{display:inline-block;min-width:16px;padding:0 4px;border:1px solid rgba(233,236,239,.5);border-radius:3px;font-size:10px;font-weight:700;text-align:center;line-height:14px;color:#e9ecef;margin:0 2px}
.dk-prompt{background:rgba(10,12,16,.72);border-radius:6px;padding:6px 10px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;transform:translate(36px,-50%);white-space:nowrap}
.dk-toast{left:50%;top:84px;transform:translateX(-50%);background:rgba(10,12,16,.72);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:9px 14px;font-size:14px;display:flex;gap:10px;align-items:center;transition:opacity .3s}
.dk-toast svg{width:26px;height:26px}
.dk-drop{transform:translate(-50%,-50%) rotate(-8deg);filter:drop-shadow(0 0 6px rgba(255,255,255,.35))}
.dk-hit{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(120,0,0,0) 40%,rgba(150,10,10,.55) 100%);opacity:0;transition:opacity .45s ease-out}
.dk-awake{position:fixed;inset:0;pointer-events:none;background:#000;display:flex;align-items:center;justify-content:center;font-size:20px;letter-spacing:.04em;color:#d9dde2;opacity:0;transition:opacity .9s}
.dk-tools{right:24px;top:84px;pointer-events:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.dk-tools>button{width:34px;height:34px;border-radius:17px;border:1px solid rgba(255,255,255,.2);background:rgba(10,12,16,.72);color:#e9ecef;font-size:16px;cursor:pointer}
.dk-tools .menu{display:none;flex-direction:column;gap:4px;background:rgba(10,12,16,.85);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px}
.dk-tools.open .menu{display:flex}
.dk-tools .menu b{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:rgba(233,236,239,.6);margin-bottom:2px}
.dk-tools .menu button{font-size:12px;padding:4px 10px;border-radius:5px;border:1px solid rgba(255,255,255,.15);background:rgba(40,46,56,.8);color:#e9ecef;cursor:pointer;text-align:left}
.dk-arc-l{font-size:11px;font-weight:700;color:${AMBER};letter-spacing:.06em;text-transform:uppercase;transform:translateX(-50%);white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.dk svg.abs{filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
`;

class Dark implements DarkHooks {
  private inv: Inventory | null = null;
  private readonly root = document.createElement("div");
  private readonly strip = document.createElement("div");
  private readonly prompt = document.createElement("div");
  private readonly toastEl = document.createElement("div");
  private readonly arc = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private readonly arcLabel = document.createElement("div");
  private readonly bat = document.createElement("div");
  private readonly hit = document.createElement("div");
  private readonly awake = document.createElement("div");
  private readonly shades: Shades;
  private readonly arms: Arms;
  private readonly downs: Down;
  private readonly voices: DarkSound;
  private readonly vitals: VitalsHud;
  private readonly panel: InventoryPanel;
  /** the use key held (a hold to get someone up, my own first aid) */
  private useKey: string | null = null;
  private batSeen = 0;
  private readonly drops = new Map<string, HTMLDivElement>();
  private hadLying = false;
  private stripUntil = 0;
  private tab = false;
  private fresh = new Map<number, string>(); // slot → "+n", for the strip's moment after a pickup
  private target: Target | null = null;
  private search: { target: Target; at: number } | null = null;
  private toastUntil = 0;
  private arcSeen = 0;
  private raf = 0;
  private offs: (() => void)[] = [];

  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
  ) {
    const style = document.createElement("style");
    style.textContent = CSS + ARMS_CSS + DOWN_CSS + VITALS_CSS + INV_CSS;
    this.root.className = "dk";
    this.root.append(style);
    this.strip.className = "abs dk-strip";
    this.prompt.className = "abs dk-prompt";
    this.toastEl.className = "abs dk-toast";
    this.arc.setAttribute("class", "abs");
    this.arcLabel.className = "abs dk-arc-l";
    this.bat.className = "abs dk-bat";
    this.arcLabel.textContent = t("dark_winded");
    for (const el of [this.strip, this.prompt, this.toastEl, this.arc, this.arcLabel, this.bat] as HTMLElement[]) {
      el.style.display = "none";
      this.root.append(el);
    }
    this.hit.className = "dk-hit";
    this.awake.className = "dk-awake";
    this.awake.textContent = t("dark_awake");
    this.root.append(this.hit, this.awake);
    document.body.append(this.root);
    this.shades = new Shades(ctl);
    this.voices = new DarkSound(ctl, walker, this.shades);
    this.vitals = new VitalsHud(ctl, walker, this.root);
    this.arms = new Arms(ctl, walker, this.shades, () => this.inv, this.root, this.voices);
    this.downs = new Down(ctl, walker, this.root, () => !!this.inv?.pockets.some((s) => s?.id === "aid"), t);
    // the inventory (I, the pad's Menu): its asks go to the server, or to the guns
    this.panel = new InventoryPanel(
      ctl,
      walker,
      () => this.inv,
      {
        use: (slot) => ctl.room?.send("dark:use", { slot }),
        drop: (slot) => ctl.room?.send("dark:drop", { slot }),
        move: (from, to) => ctl.room?.send("dark:move", { from, to }),
        pick: (id, slot) => ctl.room?.send("dark:pick", slot === undefined ? { id } : { id, slot }),
        draw: (slot) => this.arms.draw(slot),
        reload: () => this.arms.reload(),
      },
      t,
      () => {
        // (the nearest of the shadowed, out here)
        if (!walker.outside) return Number.POSITIVE_INFINITY;
        const me = walker.where();
        let d = Number.POSITIVE_INFINITY;
        for (const sh of this.shades.list())
          if (sh.state !== "dissolve") d = Math.min(d, Math.hypot(sh.x - me.x, sh.y - me.y));
        return d;
      },
    );
    this.tools();
    // (the e2e reads it)
    (window as unknown as { __dark?: unknown }).__dark = this;

    const room = ctl.room;
    if (room) {
      const on = <K extends keyof ServerMessages>(type: K, fn: (m: ServerMessages[K]) => void) => {
        const off = room.onMessage(type, fn) as unknown;
        if (typeof off === "function") this.offs.push(off as () => void);
      };
      on("dark:pockets", (m) => this.pockets(m.inv, m.bat));
      on("dark:found", (m) => this.found(m.got, m.full, !!m.gone));
      // struck: red at the edges a moment; down to nothing: black, and the office
      on("dark:hit", () => {
        this.voices.struck();
        this.hit.style.transition = "none";
        this.hit.style.opacity = "1";
        requestAnimationFrame(() => {
          this.hit.style.transition = "";
          this.hit.style.opacity = "0";
        });
      });
      on("dark:awake", () => {
        this.awake.style.transition = "none";
        this.awake.style.opacity = "1";
        setTimeout(() => {
          this.awake.style.transition = "";
          this.awake.style.opacity = "0";
        }, 1800);
      });
      room.send("dark:hello", {});
    }
    // E (whatever "use" is bound to) near something: search it, not the world's use
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      // the inventory open: its keys first (not I: the walker's, to close it)
      if (this.panel.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!e.repeat && this.arms.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.code === "Tab") {
        e.preventDefault();
        this.tab = true;
        this.render();
        return;
      }
      if (!e.repeat && actionOf(this.walker.controls.b, e.code) === "use" && this.use()) {
        this.useKey = e.code;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === this.useKey) this.useKey = null;
      if (e.code !== "Tab") return;
      this.tab = false;
      this.render();
    };
    const blur = () => {
      this.tab = false;
      this.useKey = null;
    };
    // the left button, aiming with a gun out: a shot (not the world's click). (mousedown: with
    // the right button already held, a second button is no pointerdown — the pointer's chord)
    const press = (e: MouseEvent) => {
      if (this.arms.click(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    window.addEventListener("mousedown", press, true);
    this.offs.push(() => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("mousedown", press, true);
    });
    this.strip.addEventListener("contextmenu", (e) => e.preventDefault());
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const off of this.offs) off();
    this.shades.dispose();
    this.arms.dispose();
    this.panel.dispose();
    this.downs.dispose();
    this.voices.dispose();
    this.vitals.dispose();
    this.root.remove();
  }

  // an admin's tools for trying the fight (docs/plan/30-the-dark.md phase 4: the user signs off
  // the feel): the hour, calling some up, a refill, off and on
  private tools() {
    const room = this.ctl.room;
    const me = room?.state.players.get(room.sessionId);
    if (!room || !me?.admin) return;
    const box = tag("div", "abs dk-tools", "");
    const open = document.createElement("button");
    open.textContent = "☾";
    open.title = t("dark_tools");
    const menu = tag("div", "menu", "");
    menu.append(tag("b", "", t("dark_tools")));
    const item = (key: string, send: () => void) => {
      const b = document.createElement("button");
      b.textContent = t(key);
      b.addEventListener("click", send);
      menu.append(b);
    };
    item("dark_t_night", () => room.send("mod:hour", { h: 23 }));
    item("dark_t_day", () => room.send("mod:hour", { h: 12 }));
    item("dark_t_clock", () => room.send("mod:hour", { h: null }));
    item("dark_t_one", () => room.send("mod:dark", { mode: "normal", spawn: 1 }));
    item("dark_t_three", () => room.send("mod:dark", { mode: "normal", spawn: 3 }));
    item("dark_t_refill", () => room.send("mod:refill", {}));
    item("dark_t_kit", () => room.send("mod:refill", { kit: true }));
    item("dark_t_down", () => room.send("mod:down", {}));
    item("dark_t_peace", () => room.send("mod:dark", { mode: "peaceful" }));
    item("dark_t_normal", () => room.send("mod:dark", { mode: "normal" }));
    open.addEventListener("click", () => box.classList.toggle("open"));
    box.append(open, menu);
    this.root.append(box);
  }

  // ── what the walker hands on ─────────────────────────────────────────────
  inventory(): void {
    this.panel.toggle();
  }
  frozen(): boolean {
    return this.panel.open;
  }
  use(): boolean {
    // someone down by me to get up, or my own first aid down: held
    if (this.downs.use()) return true;
    if (!this.target || this.walker.down) return false;
    if (this.search?.target.id !== this.target.id) this.search = { target: this.target, at: performance.now() };
    return true;
  }
  presses(p: Set<Press>, aiming: boolean): void {
    this.arms.presses(p, aiming);
  }
  aid(): void {
    const slot = this.inv?.pockets.findIndex((s) => s?.id === "aid") ?? -1;
    if (slot >= 0) this.ctl.room?.send("dark:use", { slot });
  }

  // ── the server's word ────────────────────────────────────────────────────
  private pockets(inv: Inventory, bat: number) {
    const was = this.inv;
    this.inv = inv;
    // (the walker counts my battery down as I focus; the server's word when they part)
    if (!was || Math.abs(this.walker.vitals.bat - bat) > 4) this.walker.vitals.bat = bat;
    if (!was) return this.render();
    // what's new: ringed in amber with how many, the strip up for a moment
    this.fresh.clear();
    inv.pockets.forEach((s, i) => {
      const before = was.pockets[i];
      const gain = s ? s.n - (before?.id === s.id ? before.n : 0) : 0;
      if (gain > 0) this.fresh.set(i, `+${gain}`);
    });
    inv.weapons.forEach((w, i) => {
      if (w && was.weapons[i]?.id !== w.id) this.fresh.set(WEAPON_SLOT + i, "+1");
    });
    if (this.fresh.size) this.stripUntil = performance.now() + 3000;
    this.render();
  }

  private found(got: LootItem[], full: boolean, gone: boolean) {
    this.search = null;
    if (!got.length) return this.toast(t(gone ? "dark_gone" : full ? "dark_full" : "dark_nothing"), []);
    const parts = got.map((g) =>
      WEAPONS[g.id as keyof typeof WEAPONS] ? itemName(g.id).toLowerCase() : `${g.n} ${itemName(g.id).toLowerCase()}`,
    );
    const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${t("dark_and")} ${parts.at(-1)}` : parts[0];
    this.toast(
      `${t("dark_found", { what })}${full ? ` · ${t("dark_full")}` : ""}`,
      got.map((g) => g.id),
    );
  }

  private toast(text: string, icons: ItemId[]) {
    const el = this.toastEl;
    el.replaceChildren();
    if (icons[0]) el.append(svg(ICON[icons[0]]));
    const span = document.createElement("span");
    span.textContent = text;
    el.append(span);
    if (icons.length > 1) el.append(svg(ICON[icons[icons.length - 1]]));
    el.style.display = "flex";
    el.style.opacity = "1";
    this.toastUntil = performance.now() + 3200;
  }

  // ── the strip ────────────────────────────────────────────────────────────
  private render() {
    const inv = this.inv;
    const show = !!inv && (this.tab || performance.now() < this.stripUntil);
    this.strip.style.display = show ? "flex" : "none";
    this.strip.style.pointerEvents = show ? "auto" : "none";
    if (!show || !inv) return;
    this.strip.replaceChildren();
    const slot = (i: number, id: ItemId | null, n: string, wide: boolean, key?: string) => {
      const el = document.createElement("div");
      el.className = `dk-slot${wide ? " w" : ""}${id ? "" : " empty"}${this.fresh.has(i) ? " new" : ""}`;
      if (key) el.append(tag("span", "k", key));
      if (id) {
        el.append(svg(ICON[id]));
        el.append(tag("span", "n", n));
        const tip = tag("div", "dk-tip", "");
        tip.append(tag("b", "", itemName(id)));
        if (USABLE.has(id)) {
          tip.append(tag("span", "", `${t("dark_use")} (${t(`dark_use_${id}`)})`));
          tip.append(document.createElement("br"));
        }
        tip.append(tag("span", "", t("dark_drop")));
        el.append(tip);
        el.addEventListener("click", () => USABLE.has(id) && this.ctl.room?.send("dark:use", { slot: i }));
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.ctl.room?.send("dark:drop", { slot: i });
        });
      }
      const plus = this.fresh.get(i);
      if (plus && performance.now() < this.stripUntil) el.append(tag("span", "plus", plus));
      this.strip.append(el);
    };
    for (const [i, w] of inv.weapons.entries())
      slot(WEAPON_SLOT + i, w?.id ?? null, w ? `${w.loaded}/${WEAPONS[w.id].mag}` : "", true, String(i + 1));
    for (let i = 0; i < POCKETS; i++) {
      const s = inv.pockets[i];
      slot(i, s?.id ?? null, s ? String(s.n) : "", false);
    }
    if (this.tab) {
      const hint = tag("div", "dk-hint", "");
      hint.append(
        tag("span", "dk-key", "Tab"),
        ` ${t("dark_pockets")} · `,
        tag("span", "dk-key", "I"),
        ` ${t("dark_inv_all")} · pad `,
        tag("span", "dk-key", "↓"),
        ` ${t("dark_aid_pad")}`,
      );
      this.strip.append(hint);
    }
  }

  // ── every frame: what's in reach, the arc, the drops ─────────────────────
  private frame() {
    this.panel.frame();
    this.shades.frame();
    this.arms.frame();
    this.voices.frame();
    this.vitals.frame();
    // (the use held: the key, or the pad's button)
    const padUse = this.walker.controls.b.pad.use;
    this.downs.frame(!!this.useKey || (padUse !== undefined && this.walker.controls.pad.held(padUse)));
    const ctl = this.ctl;
    const now = performance.now();
    const out = ctl.level === 0 && !!ctl.room;
    const me = this.walker.where();
    const ox = ctl.map?.ox ?? 0;
    const oy = ctl.map?.oy ?? 0;
    const at = (x: number, y: number, h: number) => {
      const c = ctl.clientAt(x, y, h * TPX);
      const r = ctl.engine?.app?.canvas?.getBoundingClientRect();
      return { x: c.x + (r?.left ?? 0), y: c.y + (r?.top ?? 0) };
    };

    // in reach: a spot, the locker, something on the snow (the nearest)
    let best: Target | null = null;
    let bestD = LOOT_REACH;
    if (out && Number.isFinite(me.x)) {
      const bx = me.x + ox;
      const bz = me.y + oy;
      for (const s of LOOT) {
        const d = Math.hypot(s.x - bx, s.z - bz);
        if (d <= bestD) {
          bestD = d;
          best = { kind: "spot", id: s.id, label: t(`dark_place_${s.place}`), x: s.x - ox, y: s.z - oy, z: me.z };
        }
      }
      const dl = Math.hypot(LOCKER.x - bx, LOCKER.z - bz);
      if (dl <= bestD) {
        bestD = dl;
        best = {
          kind: "spot",
          id: "locker",
          label: t("dark_place_locker"),
          x: LOCKER.x - ox,
          y: LOCKER.z - oy,
          z: me.z,
        };
      }
    }
    // the drops: drawn within 30 tiles, the nearest in reach to pick up
    const seen = new Set<string>();
    const drops = out ? ctl.room?.state.drops : null;
    // (3D: things lying on the snow, tp/arms3d.ts; iso: their icons)
    const lying: { id: string; item: string; x: number; y: number; z: number }[] = [];
    // (one lying on the snow: the nearest in reach the target; 3D the view's, iso an icon)
    const lay = (id: string, item: string, icon: string, x: number, y: number, reach: number, target: () => Target) => {
      const dist = Math.hypot(x - me.x, y - me.y);
      if (dist > reach) return;
      if (dist <= bestD) {
        bestD = dist;
        best = target();
      }
      if (ctl.tp) {
        lying.push({ id, item, x, y, z: heightAt(x + ox, y + oy) });
        return;
      }
      seen.add(id);
      let el = this.drops.get(id);
      if (!el) {
        el = document.createElement("div");
        el.className = "abs dk-drop";
        el.innerHTML = icon;
        this.drops.set(id, el);
        this.root.append(el);
      }
      const p = at(x, y, heightAt(x + ox, y + oy) + 0.05);
      const k = Math.max(0.35, Math.min(1, 4 / Math.max(1, dist)));
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.width = `${64 * k}px`;
      const svgEl = el.firstElementChild as SVGElement | null;
      svgEl?.setAttribute("width", "100%");
    };
    drops?.forEach((d: { id: string; item: string; n: number; x: number; y: number }) => {
      lay(d.id, d.item, ICON[d.item as ItemId] ?? "", d.x, d.y, 30, () => ({
        kind: "drop",
        id: d.id,
        label: t("dark_pick", { item: itemName(d.item as ItemId).toLowerCase() }),
        x: d.x,
        y: d.y,
        z: me.z,
      }));
    });
    // the day's nests' caches (docs/plan/31-the-day.md): searched as a spot (a ring, then the server)
    if (out)
      ctl.room?.state.caches?.forEach((c: { id: string; kind: string; x: number; y: number }) => {
        lay(c.id, `cache:${c.kind}`, CACHE_ICON[c.kind] ?? "", c.x, c.y, 45, () => ({
          kind: "spot",
          id: c.id,
          label: t(`dark_cache_${c.kind}`),
          x: c.x,
          y: c.y,
          z: me.z,
        }));
      });
    if (ctl.tp && (lying.length || this.hadLying)) ctl.tp.arms().drops(lying);
    this.hadLying = lying.length > 0;
    for (const [id, el] of this.drops)
      if (!seen.has(id)) {
        el.remove();
        this.drops.delete(id);
      }
    this.target = best;

    // a search under way: the ring fills, then ask; walked off, it stops
    const s = this.search;
    if (s && (!best || best.id !== s.target.id)) this.search = null;
    else if (s && s.at >= 0) {
      const need = s.target.kind === "drop" ? 0 : SEARCH_MS;
      if (now - s.at >= need) {
        s.at = -1; // (asked: waiting for the answer)
        if (s.target.kind === "drop") ctl.room?.send("dark:pick", { id: s.target.id });
        else ctl.room?.send("dark:loot", { spot: s.target.id });
      }
    }
    // the prompt, beside me
    const pr = this.prompt;
    const tgt = this.target as Target | null;
    if (tgt) {
      const p = at(me.x, me.y, me.z + 1); // (beside me: the thing is within reach anyway)
      pr.style.display = "flex";
      pr.style.left = `${p.x}px`;
      pr.style.top = `${p.y}px`;
      const k = this.search ? (this.search.at < 0 ? 1 : Math.min(1, (now - this.search.at) / SEARCH_MS)) : 0;
      const key = this.walker.controls.b.keys.use[0]?.replace(/^Key/, "") ?? "E";
      pr.innerHTML = `${ring(k)}<span></span><span class="dk-key">${key}</span>`;
      (pr.children[1] as HTMLElement).textContent = tgt.label;
    } else pr.style.display = "none";

    // stamina: an arc by my body while it isn't full; amber, out of breath
    const st = this.walker.vitals.st;
    const winded = this.walker.breath.winded;
    if (st < 99.5 || winded) this.arcSeen = now;
    const showArc = out && now - this.arcSeen < 800;
    this.arc.style.display = showArc ? "block" : "none";
    this.arcLabel.style.display = showArc && winded ? "block" : "none";
    if (showArc) {
      // round my body as it's drawn: its height on screen (3D up close is big)
      const feet = at(me.x, me.y, me.z);
      const head = at(me.x, me.y, me.z + 1.8);
      const r = Math.max(36, Math.min(150, Math.abs(feet.y - head.y) * 0.5));
      const cx = (feet.x + head.x) / 2 - r * 0.25;
      const cy = (feet.y + head.y) / 2;
      const box = Math.ceil(2 * r + 12);
      this.arc.setAttribute("width", String(box));
      this.arc.setAttribute("height", String(box));
      this.arc.style.left = `${cx - box / 2}px`;
      this.arc.style.top = `${cy - box / 2}px`;
      this.arc.style.opacity = String(st >= 99.5 && !winded ? Math.max(0, 1 - (now - this.arcSeen) / 800) : 1);
      this.arc.innerHTML = arcSvg(st / 100, winded, r, box / 2);
      this.arcLabel.style.left = `${cx - r * 0.55}px`;
      this.arcLabel.style.top = `${cy + r * 0.9}px`;
    }
    // the torch's battery (FOCO), while it's on out here or not full: what focusing eats in amber
    const lp = ctl.room?.state.players.get(ctl.room.sessionId);
    const bat = this.walker.vitals.bat;
    if (out && (lp?.torch || bat < 99.5)) this.batSeen = now;
    const showBat = now - this.batSeen < 1500;
    this.bat.style.display = showBat ? "block" : "none";
    if (showBat) {
      const focus = this.walker.focus;
      const low = bat < 25;
      const pct = Math.round(bat);
      const eat = focus ? Math.min(bat, 12) : 0;
      const fill = low ? "#d9534f" : "#d9dde2";
      // run out: no focus until it's back to 25% (shared vitals.ts) — said, and the mark it's coming back to
      const drained = this.walker.breath.drained;
      const label = drained ? t("dark_recharging") : t("dark_focus");
      const mark = drained ? `<i style="left:25%;width:2px;background:${AMBER}"></i>` : "";
      this.bat.innerHTML = `<div class="row"><span style="color:${AMBER}">${label.toUpperCase()}</span><span style="color:${low ? "#ff8a80" : "rgba(233,236,239,.85)"}">${pct}%</span></div><div class="bar"><i style="width:${bat - eat}%;background:${fill}"></i><i style="left:${bat - eat}%;width:${eat}%;background:${AMBER}"></i>${mark}</div>`;
    }
    // the strip's moment, the toast's
    if (this.stripUntil && now > this.stripUntil) {
      this.stripUntil = 0;
      this.fresh.clear();
      this.render();
    }
    if (this.toastUntil && now > this.toastUntil) {
      this.toastUntil = 0;
      this.toastEl.style.display = "none";
    }
  }
}

// ── bits ─────────────────────────────────────────────────────────────────────
function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
function tag(name: string, cls: string, text: string): HTMLElement {
  const el = document.createElement(name);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}
function svg(markup: string): Element {
  const box = document.createElement("div");
  box.innerHTML = markup;
  return box.firstElementChild as Element;
}
// the search's ring, k of it full
function ring(k: number): string {
  const c = 2 * Math.PI * 9;
  return `<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" stroke="rgba(255,255,255,.25)" stroke-width="2.5" fill="none"/><circle cx="11" cy="11" r="9" stroke="#e9ecef" stroke-width="2.5" fill="none" stroke-dasharray="${(c * k).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 11 11)"/></svg>`;
}
// stamina: a third of a circle round the body's left side, filled from the bottom up
function arcSvg(f: number, winded: boolean, r: number, c0: number): string {
  const c = 2 * Math.PI * r;
  const span = c / 3;
  const len = Math.max(0, Math.min(1, f)) * span;
  const col = winded ? AMBER : "rgba(240,242,245,.95)";
  const w = r > 80 ? 5 : 4;
  const arc = (stroke: string, dash: number) =>
    `<circle cx="${c0}" cy="${c0}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(120 ${c0} ${c0})"/>`;
  return arc("rgba(20,24,30,.35)", span) + arc(col, len);
}
