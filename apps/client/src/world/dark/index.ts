import type { ServerMessages } from "@yutopia/shared";
import {
  FLARE,
  KIT_SPOT,
  LOCKER,
  LOOT_REACH,
  type LootItem,
  lockerFront,
  lootNow,
  SEARCH_MS,
} from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import {
  count,
  findStack,
  type Inventory,
  type ItemId,
  isUsable,
  isWeapon,
  STACKS as STACKS_ANY,
  WEAPONS,
} from "@yutopia/shared/inventory";
import { type BoardVariant, variantOfItem } from "@yutopia/shared/skate/spec";
import { Vector3 } from "three";
import { addStrings, trMaybe } from "@/lib/i18n";
import type { WorldController } from "../controller";
import { eyesOf, glareOf, stepEyes } from "../eyes";
import { actionOf } from "../input/bindings";
import type { Press } from "../input/controls";
import type { DarkHooks, Walker } from "../input/walker";
import { hud } from "../store";
import { strikeKeys } from "../strike/flag";
import { ARMS_CSS, Arms } from "./arms";
import { DOWN_CSS, Down } from "./down";
import { artVersion, itemArt, preloadArt } from "./icons";
import { INV_CSS, InventoryPanel } from "./inventory";
import { Shades } from "./shades";
import { STRINGS } from "./strings";
import { VITALS_CSS, VitalsHud } from "./vitals-hud";
import { DarkSound } from "./voices";
import { VORTEX_CSS, VortexFight } from "./vortex";

// The dark (docs/plan/30-the-dark.md), on the client: its own chunk, loaded by
// the walker the first time I'm out on the land. Phase 2: my stamina as an arc
// by my body (amber, out of breath), the quick slots (keys 1–4) always bottom
// right — framed, captioned with the held gun's rounds (plan 86) — and a typed slip
// above them for what I gain (plan 86: the strip that was there gone), searching a
// spot (E or the pad's X near it: a ring fills, then the server says what was in
// it), what lies on the snow; H a first aid, B a battery from anywhere (plan 86).
// As in design/screens/dark/05a-loot and design/inventory/0-hud.
export const DARK_CHUNK = "yutopia-dark";
addStrings(STRINGS, DARK_CHUNK);

const t = (key: string, vars: Record<string, string> = {}) =>
  (trMaybe(key) ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const itemName = (id: ItemId) => t(`dark_item_${id}`);
// (in a sentence: lower case — but a name stays one: Vortex's tape, plan 88)
const inLine = (name: string) => name.replace(/\S+/g, (w) => (/^Vortex/.test(w) ? w : w.toLowerCase()));
const AMBER = "#e9a33a";
const SLIP_MS = 3200; // a pick-up's slip, shown this long
// (plan 87) the left hand's mark on the quick bar: a gloved hand, in the lamp's colour
const GLOVE_SVG =
  '<svg class="gl" viewBox="0 0 11 12"><path d="M2 11V5.5M2 5.5V2.6a.9.9 0 0 1 1.8 0V5M3.8 5V1.6a.9.9 0 0 1 1.8 0V5M5.6 5V2a.9.9 0 0 1 1.8 0v3.5M7.4 5.5V3.4a.9.9 0 0 1 1.8 0V8c0 2-1.4 3-3.2 3H4.4C3 11 2 10 2 8.6" fill="none" stroke="#f1d79a" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

type Target =
  | { kind: "spot"; id: string; label: string; x: number; y: number; z: number }
  | { kind: "drop"; id: string; label: string; x: number; y: number; z: number };

export function startDark(ctl: WorldController, walker: Walker): DarkHooks {
  return new Dark(ctl, walker);
}

const CSS = `
.dk{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:-apple-system,"SF Pro Text","Helvetica Neue",system-ui,sans-serif;color:#e9ecef}
.dk .abs{position:absolute}
.dk-col{position:absolute;right:24px;bottom:18px;display:flex;flex-direction:column-reverse;align-items:flex-end;gap:14px}
.dk-col>.abs{position:relative;right:auto;bottom:auto}
@media (max-width:639px){.dk-col{right:12px;left:12px;bottom:92px;align-items:center}}
.dk-bat{width:170px}
.dk-quick{flex-direction:column;gap:7px}
.dk-quick .cap{display:flex;justify-content:space-between;gap:18px;font:400 11px/1 var(--font-mono);letter-spacing:.16em;text-transform:uppercase;color:#d9c08a}
.dk-quick .cap b{font-weight:400;color:var(--cream);letter-spacing:.06em;text-transform:none}
.dk-quick .cap .hurt{color:#e7907c}
.dk-qs{display:flex;gap:6px;align-items:flex-end}
.dk-quick .cap .lit{color:var(--amber)}
.dk-q.hnd{background:rgba(60,38,20,.45)}
.dk-q.hnd .gl{position:absolute;left:13px;top:3px;width:9px;height:10px}
.dk-q.lit{border-color:var(--amber);box-shadow:0 0 0 1px color-mix(in srgb,var(--amber) 35%,transparent),0 0 14px color-mix(in srgb,var(--amber) 40%,transparent)}
.dk-q.burn{border-color:#ff7a4a;box-shadow:0 0 0 1px rgba(255,122,74,.4),0 0 16px rgba(255,110,60,.45)}
.dk-qs .sep{width:1px;align-self:stretch;margin:2px 3px;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--amber) 35%,transparent),transparent)}
.dk-quick{padding:8px 10px 10px;border:5px solid transparent;border-radius:6px;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--wood) 0 0/600px 240px border-box;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.55),0 12px 30px rgba(0,0,0,.5)}
.dk-q{position:relative;height:54px;width:54px;border-radius:6px;background:rgba(255,255,255,.04);border:1px solid color-mix(in srgb,var(--amber) 16%,transparent);transition:transform .12s ease-out,border-color .12s,box-shadow .12s}
.dk-q.w{width:96px}
.dk-q svg,.dk-q img.art{position:absolute;inset:6px 5px 10px 5px;width:calc(100% - 10px);height:calc(100% - 16px)}
.dk-q .k{position:absolute;left:4px;top:3px;font:400 10px/1 var(--font-mono);color:var(--cream-dim)}
.dk-q .n{position:absolute;right:4px;bottom:1px;font-size:11px;font-weight:700;text-shadow:0 1px 2px #000}
.dk-q.empty{background:transparent;border-style:dashed;border-color:color-mix(in srgb,var(--amber) 14%,transparent)}
.dk-q.on{border:1px solid var(--amber);box-shadow:0 0 0 2px color-mix(in srgb,var(--amber) 30%,transparent),0 0 12px color-mix(in srgb,var(--amber) 35%,transparent)}
.dk-q.go{transform:scale(1.12);border-color:var(--cream)}
.dk-q.no{animation:dknope .28s}
@keyframes dknope{20%{transform:translateX(-3px)}60%{transform:translateX(3px)}}
.dk-bat{padding:8px 10px 9px;border:5px solid transparent;border-radius:6px;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--wood) 0 0/600px 240px border-box;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.55)}
.dk-bat .row{display:flex;justify-content:space-between;font:400 11.5px/1 var(--font-mono);letter-spacing:.04em}
.dk-bat .bar{position:relative;height:4px;background:var(--track);border-radius:2px;margin-top:7px;overflow:hidden}
.dk-bat .bar i{position:absolute;top:0;bottom:0;left:0}
.dk-bk{margin-right:10px;color:var(--cream-dim)}
.dk-slips{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.dk-slip{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 10px;background:var(--paper);color:#222;font:400 14px/1.3 var(--font-mono);box-shadow:0 8px 18px rgba(0,0,0,.4);transform:rotate(-.6deg);white-space:nowrap;transition:opacity .4s,transform .4s}
.dk-slip:nth-child(2n){transform:rotate(.4deg)}
.dk-slip svg,.dk-slip img.art{width:34px;height:30px;flex:none;filter:none}
.dk-slip.w svg,.dk-slip.w img.art{width:56px}
.dk-slip.gone{opacity:0;transform:translateY(-6px) rotate(-.6deg)}
.dk-key{display:inline-block;min-width:16px;padding:0 4px;border:1px solid rgba(233,236,239,.5);border-radius:3px;font-size:10px;font-weight:700;text-align:center;line-height:14px;color:#e9ecef;margin:0 2px}
.dk-prompt{background:rgba(10,12,16,.72);border-radius:6px;padding:6px 10px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;transform:translate(36px,-50%);white-space:nowrap}
.dk-toast{left:50%;top:84px;transform:translateX(-50%);background:rgba(10,12,16,.72);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:9px 14px;font-size:14px;display:flex;gap:10px;align-items:center;transition:opacity .3s}
.dk-toast svg,.dk-toast img.art{width:26px;height:26px}
.dk img.art,.dk-inv img.art,.dk-inv-ghost img.art{object-fit:contain;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
.dk-hit{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(120,0,0,0) 40%,rgba(150,10,10,.55) 100%);opacity:0;transition:opacity .45s ease-out}
.dk-awake{position:fixed;inset:0;pointer-events:none;background:#000;display:flex;align-items:center;justify-content:center;font-size:20px;letter-spacing:.04em;color:#d9dde2;opacity:0;transition:opacity .9s}
.dk-arc-l{font-size:11px;font-weight:700;color:${AMBER};letter-spacing:.06em;text-transform:uppercase;transform:translateX(-50%);white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.dk svg.abs{filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
`;

class Dark implements DarkHooks {
  private inv: Inventory | null = null;
  private readonly root = document.createElement("div");
  private readonly slips = document.createElement("div"); // (plan 86) above the quick slots: what I gained, typed
  private readonly col = document.createElement("div"); // bottom right, up from the guns: the quick slots, the slips, the battery
  private readonly quickEl = document.createElement("div");
  private quickKey = "";
  private quickPulse: { n: number; ok: boolean; until: number } | null = null;
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
  readonly vxf: VortexFight;
  private readonly voices: DarkSound;
  private readonly vitals: VitalsHud;
  private readonly panel: InventoryPanel;
  /** the use key held (a hold to get someone up, my own first aid) */
  private useKey: string | null = null;
  private batSeen = 0;
  // the air under the water (docs/plan/66-the-water.md, S3): shown under it, and as it comes back
  private readonly airEl = document.createElement("div");
  private airSeen = 0;
  private hadLying = false;
  // the supply lockers on my floor (looked for twice a second: they're built and moved rarely)
  private lockers: { id: string; x: number; y: number; yaw: number }[] = [];
  private lockersAt = 0;
  private lockersLevel = -1;
  private lockersHere(now: number) {
    const ctl = this.ctl;
    if (now - this.lockersAt < 500 && this.lockersLevel === ctl.level) return this.lockers;
    this.lockersAt = now;
    this.lockersLevel = ctl.level;
    const home = ctl.building?.home ?? ctl.building?.floor ?? 0;
    const out: typeof this.lockers = [];
    ctl.room?.state.objects?.forEach(
      (o: { id: string; kind: string; x: number; y: number; yaw: number; props: string }) => {
        if (o.kind !== "locker") return;
        let level = home;
        try {
          const l = JSON.parse(o.props || "{}").level;
          if (typeof l === "number") level = l;
        } catch {}
        if (level === ctl.level) out.push({ id: o.id, x: o.x, y: o.y, yaw: o.yaw });
      },
    );
    this.lockers = out;
    return out;
  }
  private target: Target | null = null;
  private search: { target: Target; at: number } | null = null;
  private toastUntil = 0;
  private arcSeen = 0;
  private raf = 0;
  private offs: (() => void)[] = [];

  /** the room it listens to (its messages: the pockets, the shots) */
  readonly room: unknown;
  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
  ) {
    this.room = ctl.room;
    // (plan 86: the items' pictures, in before they're first shown)
    preloadArt();
    const style = document.createElement("style");
    style.textContent = CSS + ARMS_CSS + DOWN_CSS + VITALS_CSS + INV_CSS + VORTEX_CSS;
    this.root.className = "dk";
    this.root.append(style);
    this.slips.className = "abs dk-slips";
    this.prompt.className = "abs dk-prompt";
    this.toastEl.className = "abs dk-toast";
    this.arc.setAttribute("class", "abs");
    this.arcLabel.className = "abs dk-arc-l";
    this.bat.className = "abs dk-bat";
    this.airEl.className = "abs dk-bat dk-air"; // (the battery's look, its own name: the breath)
    this.quickEl.className = "abs dk-quick";
    this.col.className = "dk-col";
    this.arcLabel.textContent = t("dark_winded");
    for (const el of [this.prompt, this.toastEl, this.arc, this.arcLabel] as HTMLElement[]) {
      el.style.display = "none";
      this.root.append(el);
    }
    for (const el of [this.quickEl, this.bat, this.airEl]) el.style.display = "none";
    this.root.append(this.col);
    this.hit.className = "dk-hit";
    this.awake.className = "dk-awake";
    this.awake.textContent = t("dark_awake");
    this.root.append(this.hit, this.awake);
    document.body.append(this.root);
    this.shades = new Shades(ctl);
    this.voices = new DarkSound(ctl, walker, this.shades);
    this.vitals = new VitalsHud(ctl, walker, this.root);
    // (plan 93 S2: sat in a car, the guns see the seat — drawn as its rules allow, aimed with the right button
    // there, fired out of its window — and the walker otherwise)
    const seat = () => ctl.cars?.gunSeat() ?? null;
    const armsWalker = new Proxy(walker, {
      get(t, k) {
        const g = seat();
        if (g) {
          if (k === "stepping") return g.canDraw;
          if (k === "aiming") return g.aiming;
          if (k === "where")
            // (where a gun's fired from, less what Arms adds on foot — ahead, aside, a hand's height — so its
            // muzzle comes out at the window's)
            return () => {
              const m = g.muzzle();
              const d = ctl.tp?.camera.getWorldDirection(new Vector3());
              const yaw = d ? Math.atan2(d.z, d.x) : 0;
              const f = { x: Math.cos(yaw), y: Math.sin(yaw) };
              return { x: m.x - f.x * 0.45 + f.y * 0.22, y: m.y - f.y * 0.45 - f.x * 0.22, z: m.z - 1.35 };
            };
        }
        const v = Reflect.get(t, k, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    this.arms = new Arms(ctl, armsWalker, this.shades, () => this.inv, this.root, this.voices);
    this.arms.onQuick = (n, ok) => {
      this.quickPulse = { n, ok, until: performance.now() + (ok ? 160 : 280) };
      this.quickKey = "";
    };
    // (the column, bottom up: the guns' cylinder and flares, the quick slots, the slips, the battery)
    this.col.append(this.arms.hudEl, this.quickEl, this.slips, this.airEl, this.bat);
    this.downs = new Down(ctl, walker, this.root, () => !!this.inv && count(this.inv, "aid") > 0, t);
    // (plan 88) the fight with Vortex: his cassette, his moves on my screen
    this.vxf = new VortexFight(ctl, walker, this.root, t, this.voices);
    this.shades.more = this.vxf.shadeBodies;
    // the inventory (I, the pad's Menu): its asks go to the server, or to the guns
    this.panel = new InventoryPanel(
      ctl,
      walker,
      () => this.inv,
      {
        use: (slot) => ctl.room?.send("dark:use", { slot }),
        // (plan 93 S4: a car's boot or glove box open — what's dropped goes in it; what's taken comes out of it)
        drop: (slot, n) => {
          const st = ctl.cars?.store();
          if (st)
            ctl.room?.send("car:put", { kind: st.kind, id: st.id, from: slot, ...(n === undefined ? {} : { n }) });
          else ctl.room?.send("dark:drop", n === undefined ? { slot } : { slot, n });
        },
        move: (from, to) => ctl.room?.send("dark:move", { from, to }),
        split: (from, to, n) => ctl.room?.send("dark:split", n === undefined ? { from, to } : { from, to, n }),
        pick: (id, slot) => {
          const st = id.startsWith("store:") ? ctl.cars?.store() : null;
          if (st)
            ctl.room?.send("car:take", {
              kind: st.kind,
              id: st.id,
              i: Number(id.slice(6)),
              ...(slot === undefined ? {} : { slot }),
            });
          else ctl.room?.send("dark:pick", slot === undefined ? { id } : { id, slot });
        },
        takeAll: () => {
          const st = ctl.cars?.store();
          if (st) ctl.room?.send("car:take", { kind: st.kind, id: st.id, i: -1 });
          else ctl.room?.send("dark:takeAll", {});
        },
        store: () => ctl.cars?.store() ?? null,
        organize: () => ctl.room?.send("dark:organize", {}),
        draw: (slot) => this.arms.draw(slot),
        quick: (n) => this.arms.quick(n),
        hand: () => this.handKey(true),
        handState: () => this.handState(),
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
    // (the e2e reads it)
    (window as unknown as { __dark?: unknown }).__dark = this;

    const room = ctl.room;
    if (room) {
      const on = <K extends keyof ServerMessages>(type: K, fn: (m: ServerMessages[K]) => void) => {
        const off = room.onMessage(type, fn) as unknown;
        if (typeof off === "function") this.offs.push(off as () => void);
      };
      on("dark:pockets", (m) => this.pockets(m.inv, m.bat));
      on("dark:found", (m) => this.found(m.got, m.full, !!m.gone, !!m.later));
      // (plan 103) a rack's board refused: two carried already
      on("skate:no", () => this.toast(t("dark_skate_many"), []));
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
      // (plan 115: the Strike Park's vote or radio open — its number keys, not the hand's or the quick slots')
      if (strikeKeys.digits && /^Digit[1-6]$/.test(e.code)) return;
      // (plan 115 phase 24) in the match, CS's keys: 1 the primary, 2 the pistol, Q the last; 3–5 the park's own
      if (strikeKeys.playing && !hud.get().panel.kind) {
        if ((e.code === "Digit1" || e.code === "Digit2") && !e.repeat) {
          this.arms.drawSlot(e.code === "Digit1" ? 0 : 1);
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (e.code === "KeyQ" && !e.repeat) {
          this.arms.drawLast();
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (e.code === "KeyF" && !e.repeat) {
          strikeKeys.inspectAt = performance.now();
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (e.code === "Digit3" && !e.repeat) {
          this.ctl.room?.send("strike:knife", { on: true });
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (/^Digit[4-5]$/.test(e.code)) return;
      }
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
      // (Tab: the walker's — the next thing in reach; plan 86: held, it no longer shows the strip — the page's focus
      // kept where it is)
      if (e.code === "Tab") {
        e.preventDefault();
        return;
      }
      // (plan 87) 1 the left hand — the torch on or off, a first aid, a battery, a flare lit and held, or thrown
      if (!e.repeat && e.code === "Digit1" && this.handKey()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // (plan 86) H a first aid, B a battery — from the quick slots or the pack, on foot
      if (
        !e.repeat &&
        (e.code === "KeyH" || (e.code === "KeyB" && !strikeKeys.playing)) &&
        this.quickUse(e.code === "KeyH" ? "aid" : "battery")
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!e.repeat && actionOf(this.walker.controls.b, e.code) === "use" && !strikeKeys.use && this.use()) {
        this.useKey = e.code;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === this.useKey) this.useKey = null;
    };
    const blur = () => {
      this.useKey = null;
    };
    // the left button, aiming with a gun out: a shot (not the world's click). (mousedown: with
    // the right button already held, a second button is no pointerdown — the pointer's chord)
    const press = (e: MouseEvent) => {
      // (only a click into the scene: the pointer held by the game, or straight on its canvas — a click on a menu, a
      // panel or the HUD's buttons is theirs; the Strike Park's buy menu fired the gun at every pick)
      const h = hud.get();
      const onScene = !!document.pointerLockElement || e.target instanceof HTMLCanvasElement;
      if (e.button === 0 && (!onScene || h.panel.kind || h.menu)) return;
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
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const t = performance.now();
      this.frame();
      this.ctl.framePerf.lap("dark (own)", t);
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
    this.vxf.dispose();
    this.voices.dispose();
    this.vitals.dispose();
    this.root.remove();
  }

  // ── what the walker hands on ─────────────────────────────────────────────
  inventory(): void {
    this.panel.toggle();
  }
  frozen(): boolean {
    // (or taped up by Vortex, or made to dance)
    return this.panel.open || this.vxf.frozen();
  }
  steer(move: Parameters<DarkHooks["steer"]>[0]): void {
    this.vxf.steer(move);
  }
  use(): boolean {
    // someone down by me to get up, or my own first aid down: held; a friend taped up, cut free (held)
    if (this.downs.use()) return true;
    if (this.vxf.use()) return true;
    if (!this.target || this.walker.down) return false;
    if (this.search?.target.id !== this.target.id) this.search = { target: this.target, at: performance.now() };
    return true;
  }
  presses(p: Set<Press>, aiming: boolean): void {
    this.arms.presses(p, aiming);
    // LB held and A B X Y: the quick slots, as 1–4 (docs/plan/56-the-controls.md phase 6)
    for (let i = 0; i < 4; i++) if (p.has(`slot${i + 1}` as Press)) this.arms.quick(i);
  }
  aid(): void {
    const slot = this.inv ? findStack(this.inv, "aid") : -1;
    if (slot >= 0) this.ctl.room?.send("dark:use", { slot });
  }
  // ── (plan 87) the left hand: key 1, the pad's ↑ ─────────────────────────────
  hand(): void {
    this.handKey();
  }
  slotKey(n: number): void {
    if (n === 0) this.handKey();
    else if (n >= 1 && n <= 4) this.arms.quick(n - 1);
  }
  /** The left hand's use, on foot (not building, no menu, the pack shut — its own keys then): the torch switched; a
   *  first aid or a battery used (not when full: said); a flare lit and held up (F3b), or the one held thrown;
   *  anything else, or nothing there: nothing. True if the key was taken. */
  private handKey(fromPack = false): boolean {
    const h = hud.get();
    // (the pack open: its own keys and buttons call this — `fromPack`; the world's 1 waits)
    if (!this.inv || !this.walker.stepping || h.menu || h.build.on || (this.panel.open && !fromPack)) return false;
    const room = this.ctl.room;
    const lp = room?.state.players.get(room.sessionId);
    if (lp?.downAt) return false;
    const it = this.inv.hand;
    let ok = true;
    // (a flare lit and held up: thrown first, where I look — whatever's in the slot since)
    if (this.arms.heldFlare()) this.arms.flare();
    else if (it?.id === "torch") room?.send("dark:hand", { on: !lp?.torch });
    else if (variantOfItem(it?.id)) {
      // (plan 103) a board: dropped and stepped on — the controller's (no server round trip); the pack shut first
      const c = this.ctl as { skateHand?: (variant: BoardVariant) => void };
      ok = !!c.skateHand;
      if (ok && fromPack) this.panel.close();
      c.skateHand?.(variantOfItem(it?.id) as BoardVariant);
    } else if (it?.id === "flare") room?.send("dark:hand", {});
    else if (it?.id === "aid" && ((lp?.hp as number) ?? 100) >= 100) {
      this.toast(t("dark_full_aid"), ["aid"]);
      ok = false;
    } else if (it?.id === "battery" && this.walker.vitals.bat >= 99.5) {
      this.toast(t("dark_full_battery"), ["battery"]);
      ok = false;
    } else if (it && isUsable(it.id)) room?.send("dark:hand", {});
    else {
      // (nothing there, or something that does nothing from a hand — rounds, a fuse: said)
      this.toast(t("dark_hand_none"), it ? [it.id] : []);
      ok = false;
    }
    // (the quick bar's left-hand slot: a nudge, or a shake)
    this.handPulse = { ok, until: performance.now() + (ok ? 160 : 280) };
    this.quickKey = "";
    return true;
  }
  private handPulse: { ok: boolean; until: number } | null = null;
  /** (plan 87) the flare held up in my left hand: which, and when I first saw it (its seconds count down from it) */
  private heldSince: { id: string; at: number } | null = null;
  /** (plan 87) The left hand's light: the torch lit in it; a flare held up and its seconds left (0: none). */
  handState(): { lit: boolean; burn: number } {
    const room = this.ctl.room;
    const lp = room?.state.players.get(room.sessionId);
    let id = "";
    room?.state.flares?.forEach((f: { id: string; held?: string }) => {
      if (f.held && f.held === room.sessionId) id = f.id;
    });
    const now = performance.now();
    if (!id) this.heldSince = null;
    else if (this.heldSince?.id !== id) this.heldSince = { id, at: now };
    const burn = this.heldSince ? Math.max(0, Math.ceil(FLARE.secs - (now - this.heldSince.at) / 1000)) : 0;
    return { lit: !!lp?.torch && this.inv?.hand?.id === "torch", burn };
  }

  /** (plan 86) H, B: a first aid or a battery used from wherever it is — on foot only (in a car H is the horn, B
   *  looks back), not while building or a menu's up. True if the key was taken: used, or said why not. */
  private quickUse(id: "aid" | "battery"): boolean {
    const h = hud.get();
    if (!this.inv || !this.walker.stepping || h.menu || h.build.on || this.panel.open) return false;
    const room = this.ctl.room;
    const lp = room?.state.players.get(room.sessionId);
    if (lp?.downAt) return false;
    const slot = findStack(this.inv, id);
    if (slot < 0) this.toast(t(`dark_none_${id}`), [id]);
    else if (id === "aid" && ((lp?.hp as number) ?? 100) >= 100) this.toast(t("dark_full_aid"), [id]);
    else if (id === "battery" && this.walker.vitals.bat >= 99.5) this.toast(t("dark_full_battery"), [id]);
    else room?.send("dark:use", { slot });
    return true;
  }

  // ── the server's word ────────────────────────────────────────────────────
  /** (plan 93 S6) How many of a stack I carry (the cars' chain prompt asks) */
  /** (plan 115) The rounds in a gun I carry (its magazine), 0 if I've none of it. */
  loadedOf(gun: string): number {
    const it = this.inv ? [...this.inv.quick, ...this.inv.pockets].find((x) => x?.id === gun) : null;
    return it && "loaded" in it ? Number((it as { loaded?: number }).loaded ?? 0) : 0;
  }
  countOf(id: string): number {
    return this.inv && id in STACKS_ANY ? count(this.inv, id as Parameters<typeof count>[1]) : 0;
  }
  private pockets(inv: Inventory, bat: number) {
    const was = this.inv;
    this.inv = inv;
    // (the walker counts my battery down as I focus; the server's word when they part)
    if (!was || Math.abs(this.walker.vitals.bat - bat) > 4) this.walker.vitals.bat = bat;
    if (!was) return;
    // (plan 86) what's new, by kind — a move, a split, organizing gain nothing: a slip each, typed, above the quick
    // slots ("+4 shells · in the pack"); a weapon new only if it wasn't carried before at all
    const all = (v: Inventory) => [...v.quick, ...v.pockets];
    const kinds = new Set(all(inv).flatMap((it) => (it ? [it.id] : [])));
    for (const id of kinds) {
      const q = inv.quick.findIndex((it) => it?.id === id);
      const atHand = (before: Inventory) =>
        before.quick.reduce((a, it) => a + (it?.id === id ? ("n" in it ? it.n : 1) : 0), 0);
      let n = 0;
      let hand = false;
      if (isWeapon(id)) {
        if (all(was).some((it) => it?.id === id)) continue;
        n = 1;
        hand = q >= 0;
      } else {
        n = count(inv, id) - count(was, id);
        hand = q >= 0 && atHand(inv) > atHand(was);
      }
      if (n <= 0) continue;
      const where = hand ? t("dark_slip_hand", { n: String(q + 2) }) : t("dark_slip_pack");
      const name = n > 1 ? (trMaybe(`dark_many_${id}`) ?? itemName(id)) : itemName(id);
      this.slip(id, `${isWeapon(id) ? "+" : `+${n}`} ${inLine(name)} · ${where}`);
    }
  }

  /** (plan 86) A typed slip above the quick slots, for a moment — three at most, the oldest let go */
  private slip(id: ItemId, text: string) {
    const el = tag("div", `dk-slip${isWeapon(id) ? " w" : ""}`, "");
    el.append(svg(itemArt(id)), tag("span", "", text));
    this.slips.append(el);
    while (this.slips.childElementCount > 3) this.slips.firstElementChild?.remove();
    setTimeout(() => el.classList.add("gone"), SLIP_MS);
    setTimeout(() => el.remove(), SLIP_MS + 450);
  }

  private found(got: LootItem[], full: boolean, gone: boolean, later = false) {
    this.search = null;
    if (!got.length)
      return this.toast(t(later ? "dark_tomorrow" : gone ? "dark_gone" : full ? "dark_full" : "dark_nothing"), []);
    // (plan 86: what came, the slips say — the pockets' word; here only what didn't fit)
    if (full) this.toast(t("dark_full"), []);
  }

  private toast(text: string, icons: ItemId[]) {
    const el = this.toastEl;
    el.replaceChildren();
    if (icons[0]) el.append(svg(itemArt(icons[0])));
    const span = document.createElement("span");
    span.textContent = text;
    el.append(span);
    if (icons.length > 1) el.append(svg(itemArt(icons[icons.length - 1])));
    el.style.display = "flex";
    el.style.opacity = "1";
    this.toastUntil = performance.now() + 3200;
  }

  // ── the quick slots (1–4): always there, bottom right — but for the inventory ──
  // (plan 86, design/inventory/0-hud: framed, captioned — "At hand", and the held gun's rounds: in it + spare; hurt,
  // with a first aid carried, the caption says H)
  private quickHud(now: number) {
    const inv = this.inv;
    // (plan 104 F7b: on a board the skate HUD has the screen — no quick bar)
    // (plan 115: in the Strike Park's match its own HUD shows the guns and the ammo — the quick bar out of the view model's way)
    const show = !!inv && !this.panel.open && !hud.get().skating && !strikeKeys.playing;
    this.quickEl.style.display = show ? "flex" : "none";
    // (plan 115: the guns' own counter too — the park's HUD shows the magazine)
    this.arms.hudEl.style.visibility = strikeKeys.playing ? "hidden" : "";
    if (!show || !inv) return;
    const room = this.ctl.room;
    const lp = room?.state.players.get(room.sessionId);
    const gun = (lp?.gun as string) || "";
    const hurt = ((lp?.hp as number) ?? 100) < 60 && count(inv, "aid") > 0 && !lp?.downAt;
    const held = isWeapon(gun) ? inv.quick.find((it) => it?.id === gun) : null;
    const rounds =
      held && "loaded" in held
        ? `${t(`dark_ammo_${WEAPONS[held.id].ammo}`)} · ${held.loaded} + ${count(inv, WEAPONS[held.id].ammo)}`
        : "";
    const pulse = this.quickPulse && now < this.quickPulse.until ? this.quickPulse : null;
    if (!pulse) this.quickPulse = null;
    const hp = this.handPulse && now < this.handPulse.until ? this.handPulse : null;
    if (!hp) this.handPulse = null;
    // (plan 87) the left hand: its light (the torch lit, its battery; a flare held up, its seconds)
    const hs = this.handState();
    const bat = Math.round(this.walker.vitals.bat);
    const key = `${JSON.stringify(inv.quick)}|${JSON.stringify(inv.hand)}|${hs.lit ? bat : -1}|${hs.burn}|${gun}|${rounds}|${hurt}|${pulse ? `${pulse.n}${pulse.ok}` : ""}|${hp ? hp.ok : ""}|${artVersion()}`;
    if (key === this.quickKey) return;
    this.quickKey = key;
    this.quickEl.replaceChildren();
    const cap = tag("div", "cap", "");
    if (hs.burn) cap.append(tag("span", "lit", t("dark_hud_flare", { s: `${hs.burn}s` })));
    else if (hs.lit) cap.append(tag("span", "lit", t("dark_hud_torch", { p: `${bat}%` })));
    else if (hurt) {
      const h = tag("span", "hurt", "");
      h.append(tag("span", "dk-key", "H"), ` ${t("dark_aid_pad")} ×${count(inv, "aid")}`);
      cap.append(h);
    } else cap.append(tag("span", "", t("dark_at_hand")));
    if (rounds) cap.append(tag("b", "", rounds));
    const row = tag("div", "dk-qs", "");
    this.quickEl.append(cap, row);
    {
      const it = inv.hand;
      const shows: ItemId | null = it?.id ?? (hs.burn ? "flare" : null);
      const el = document.createElement("div");
      const go = hp ? (hp.ok ? " go" : " no") : "";
      el.className = `dk-q hnd${shows ? "" : " empty"}${hs.lit ? " lit" : ""}${hs.burn ? " burn" : ""}${go}`;
      el.append(tag("span", "k", "1"));
      el.insertAdjacentHTML("beforeend", GLOVE_SVG);
      if (shows) {
        el.append(svg(itemArt(shows)));
        const n = !it ? "" : it.id === "torch" ? `${bat}%` : "n" in it ? String(it.n) : "";
        if (n) el.append(tag("span", "n", n));
      }
      row.append(el, tag("div", "sep", ""));
    }
    for (const [i, it] of inv.quick.entries()) {
      const el = document.createElement("div");
      const wide = !!it && isWeapon(it.id);
      const on = !!it && it.id === gun;
      const go = pulse?.n === i ? (pulse.ok ? " go" : " no") : "";
      el.className = `dk-q${wide ? " w" : ""}${it ? "" : " empty"}${on ? " on" : ""}${go}`;
      el.append(tag("span", "k", String(i + 2)));
      if (it) {
        el.append(svg(itemArt(it.id)));
        el.append(tag("span", "n", "loaded" in it ? `${it.loaded}/${WEAPONS[it.id].mag}` : String(it.n)));
      }
      row.append(el);
    }
  }

  // ── every frame: what's in reach, the arc, the drops ─────────────────────
  // the eyes (docs/plan/44-the-night.md N3): seconds adjusted to the dark, and when last stepped
  private eyesT = 0;
  private eyesAt = performance.now();
  private eyes(out: boolean, x: number, y: number) {
    const ctl = this.ctl;
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.eyesAt) / 1000);
    this.eyesAt = now;
    const dark = ctl.model?.getDaylight().dark ?? 0;
    // (indoors, nowhere yet, and no 3D view yet: the rooms' light)
    const lum = !out || !Number.isFinite(x) || !ctl.tp ? 1 : ctl.tp.eyes.glareAt(x, y, ctl.room?.sessionId ?? "");
    this.eyesT = stepEyes(this.eyesT, dt, glareOf(lum), dark);
    ctl.tp?.eyes.setEyes(eyesOf(this.eyesT));
  }

  private frame() {
    this.panel.frame();
    this.shades.frame();
    this.arms.frame();
    this.voices.frame();
    this.vitals.frame();
    // (the use held: the key, or the pad's button)
    const padUse = this.walker.controls.b.pad.use;
    const useHeld = !!this.useKey || (padUse !== undefined && this.walker.controls.pad.held(padUse));
    this.downs.frame(useHeld);
    this.vxf.frame(useHeld);
    const ctl = this.ctl;
    const now = performance.now();
    const out = ctl.level === 0 && !!ctl.room;
    const me = this.walker.where();
    this.eyes(out, me.x, me.y);
    // the ground at (x, y) on my floor: the snow's, out on it; the floor's indoors
    const floorZ = (x: number, y: number) => (out && ctl.grid.onLand(x, y) ? heightAt(x, y) : 0);
    const at = (x: number, y: number, h: number) => {
      const c = ctl.clientAt(x, y, h);
      const r = ctl.hostRect();
      return { x: c.x + r.left, y: c.y + r.top };
    };

    // in reach: a spot, a locker, something lying about (the nearest) — across, and up or down to
    // it (a flier over it doesn't reach it: shared reach.ts, as the server asks)
    const far = (dx: number, dy: number, x: number, y: number) => Math.hypot(dx, dy, ctl.offAt(floorZ(x, y)));
    let best: Target | null = null;
    let bestD = LOOT_REACH;
    // a supply locker on my floor (built anywhere): a kit a day
    if (Number.isFinite(me.x))
      for (const k of this.lockersHere(now)) {
        const f = lockerFront(k);
        const d = far(f.x - me.x, f.y - me.y, f.x, f.y);
        if (d <= bestD) {
          bestD = d;
          best = { kind: "spot", id: `${KIT_SPOT}${k.id}`, label: t("dark_place_kit"), x: f.x, y: f.y, z: me.z };
        }
      }
    if (out && Number.isFinite(me.x)) {
      const bx = me.x;
      const bz = me.y;
      for (const s of lootNow()) {
        const d = far(s.x - bx, s.z - bz, s.x, s.z);
        if (d <= bestD) {
          bestD = d;
          best = { kind: "spot", id: s.id, label: t(`dark_place_${s.place}`), x: s.x, y: s.z, z: me.z };
        }
      }
      const dl = far(LOCKER.x - bx, LOCKER.z - bz, LOCKER.x, LOCKER.z);
      if (dl <= bestD) {
        bestD = dl;
        best = {
          kind: "spot",
          id: "locker",
          label: t("dark_place_locker"),
          x: LOCKER.x,
          y: LOCKER.z,
          z: me.z,
        };
      }
    }
    // the drops on my floor: drawn within 30 tiles (the 3D view's, tp/arms3d.ts), the nearest in
    // reach to pick up
    const drops = ctl.room?.state.drops;
    const lying: { id: string; item: string; x: number; y: number; z: number }[] = [];
    // (one lying on the snow: the nearest in reach the target)
    const lay = (id: string, item: string, x: number, y: number, reach: number, target: () => Target) => {
      const dist = Math.hypot(x - me.x, y - me.y);
      if (dist > reach) return;
      const d = far(x - me.x, y - me.y, x, y);
      if (d <= bestD) {
        bestD = d;
        best = target();
      }
      lying.push({ id, item, x, y, z: floorZ(x, y) });
    };
    drops?.forEach((d: { id: string; item: string; n: number; x: number; y: number; level?: number }) => {
      if ((d.level ?? 0) !== ctl.level) return;
      lay(d.id, d.item, d.x, d.y, 30, () => ({
        kind: "drop",
        id: d.id,
        label: t("dark_pick", { item: inLine(itemName(d.item as ItemId)) }),
        x: d.x,
        y: d.y,
        z: me.z,
      }));
    });
    // the day's nests' caches (docs/plan/31-the-day.md): searched as a spot (a ring, then the server)
    if (out)
      ctl.room?.state.caches?.forEach((c: { id: string; kind: string; x: number; y: number }) => {
        lay(c.id, `cache:${c.kind}`, c.x, c.y, 45, () => ({
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
    // (not in a car or on the shuttle: no body of mine walking there to hang it by)
    const busy = String(ctl.room?.state.players.get(ctl.room.sessionId)?.busy ?? "");
    const aboard = busy.startsWith("drive:") || busy.startsWith("ride:");
    const showArc = out && !aboard && now - this.arcSeen < 800;
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
      const fill = low ? "var(--rust)" : "var(--amber)";
      // run out: no focus until it's back to 25% (shared vitals.ts) — said, and the mark it's coming back to
      const drained = this.walker.breath.drained;
      const label = drained ? t("dark_recharging") : t("dark_focus");
      const mark = drained ? `<i style="left:25%;width:2px;background:${AMBER}"></i>` : "";
      // (plan 86: a battery carried — B puts it in)
      const spare = this.inv ? count(this.inv, "battery") : 0;
      const b = spare ? `<span class="dk-bk"><span class="dk-key">B</span>×${spare}</span>` : "";
      this.bat.innerHTML = `<div class="row"><span style="color:var(--amber)">${label.toUpperCase()}</span><span style="color:${low ? "var(--error)" : "var(--cream)"}">${b}${pct}%</span></div><div class="bar"><i style="width:${bat - eat}%;background:${fill}"></i><i style="left:${bat - eat}%;width:${eat}%;background:var(--amber);opacity:.4"></i>${mark}</div>`;
    }
    // the air under the water: under it, and a moment after it's full again
    const air = this.walker.airK;
    if (this.walker.under || air < 0.999) this.airSeen = now;
    const showAir = now - this.airSeen < 1200;
    this.airEl.style.display = showAir ? "block" : "none";
    if (showAir) {
      const low = air < 0.25;
      const pct = Math.round(air * 100);
      this.airEl.innerHTML = `<div class="row"><span style="color:#8fc9d6">${t("dark_breath").toUpperCase()}</span><span style="color:${low ? "var(--error)" : "var(--cream)"}">${pct}%</span></div><div class="bar"><i style="width:${pct}%;background:${low ? "var(--rust)" : "#5fa9bb"}"></i></div>`;
    }
    // the toast's moment
    this.quickHud(now);
    // (the phone out sits where the column is: the guns, the quick slots, the battery go under it; plan 86: the pack
    // open too — its belt is the quick bar, its tag the gun's rounds)
    const phone = hud.get().phone;
    this.col.style.visibility = phone.open || phone.camera || this.panel.open ? "hidden" : "";
    // (god mode's camera over the land: none of it, till I'm on foot again — docs/plan/53)
    const god = hud.get().god;
    const gone = god.on && !god.walking ? "none" : "";
    if (this.root.style.display !== gone) this.root.style.display = gone;
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
