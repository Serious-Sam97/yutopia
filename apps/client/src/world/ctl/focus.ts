import { entry, reachOf, type WorldObjectDef } from "@yutopia/shared";
import { isGameTv } from "@yutopia/shared/games";
import { offBand, spanOf } from "@yutopia/shared/reach";
import { type Key, tr } from "@/lib/i18n";
import { prefs, setPrefs } from "@/lib/prefs";
import type { WorldController } from "../controller";
import { thingLabel } from "../labels";
import { activePad } from "../pads";
import { type ActTarget, hud } from "../store";
import { INTERACT_RANGE } from "./common";

/** What Focus reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type FocusHost = Pick<
  WorldController,
  | "camWanted"
  | "cars"
  | "clientAt"
  | "footprintOf"
  | "god"
  | "grid"
  | "height"
  | "hostRect"
  | "level"
  | "life"
  | "map"
  | "me"
  | "menu"
  | "model"
  | "pets"
  | "room"
  | "send"
  | "tp"
  | "walkYaw"
  | "walker"
>;

export class Focus {
  constructor(private readonly c: FocusHost) {}

  // ── interactions ─────────────────────────────────────────────────────────
  nearestInteractable(): WorldObjectDef | null {
    if (!this.c.model) return null;
    let best: WorldObjectDef | null = null;
    let bestD = INTERACT_RANGE;
    const cable = !!hud.get().cable; // a cable in hand: only what it plugs into
    for (const o of this.c.model.allObjects()) {
      const e = entry(o.kind);
      if (!e.interact || (cable && !isGameTv(o.kind))) continue;
      const d = this.reach(o);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // The mouse is the camera (docs/plan/56-the-controls.md A, 3D only): the pointer locked in play,
  // the mouse turns the camera — a click on the world takes it, Esc (the browser's) lets it go.
  // It lets go by itself when something wants the pointer — a menu, a panel, build mode, god
  // mode, a side panel, choosing my arrival — and comes back when that's gone (if it was mine).
  aimId: string | null = null; // the usable thing under the crosshair

  lookWas = { menu: false, panel: false, build: false, side: null as string | null, pick: false, kart: false };

  relock = false;

  /** Something on screen wants the pointer (the cursor): no locking it to the camera now. */
  pointerWanted(): boolean {
    const h = hud.get();
    return (
      !!h.menu ||
      !!h.panel.kind ||
      h.build.on ||
      h.pickArrival ||
      h.side !== null ||
      h.phone.open ||
      h.kartUi ||
      !!this.c.god?.on
    );
  }

  // C (3D only): third person ↔ first person. Into first person from a key
  // press, mouse look starts at once (half the mode without it).
  swapCamera() {
    const v = this.c.tp;
    if (!v) return;
    const view = prefs().view === "1p" ? "3p" : "1p";
    setPrefs({ view });
    v.setMode(this.c.camWanted());
  }

  watchLook = () => {
    const h = hud.get();
    const now = {
      menu: !!h.menu,
      panel: !!h.panel.kind,
      build: h.build.on,
      side: h.side,
      pick: h.pickArrival,
      kart: h.kartUi,
    };
    const was = this.lookWas;
    this.lookWas = now;
    const tp = this.c.tp;
    if (!tp) return;
    const opened =
      (now.menu && !was.menu) ||
      (now.panel && !was.panel) ||
      (now.build && !was.build) ||
      (now.pick && !was.pick) ||
      (now.kart && !was.kart) ||
      (now.side !== null && now.side !== was.side);
    if (opened && tp.mouseLook.looking) {
      this.relock = true;
      tp.mouseLook.setLook(false);
    }
    // all of it gone again: back to the camera (Chrome locks again without a click after a
    // let-go from code; where the browser says no, the next click on the world does)
    if (this.relock && !this.pointerWanted()) {
      this.relock = false;
      tp.mouseLook.resumeLook();
    }
  };

  // what E / X uses: in mouse look the thing under the crosshair (when it's
  // something to use), else the nearest
  aimedObject(): WorldObjectDef | null {
    if (!this.aimId || !this.c.tp?.mouseLook.looking || hud.get().cable) return null;
    const o = this.c.model?.getObject(this.aimId);
    return o && entry(o.kind).interact ? o : null;
  }

  // How far up or down a thing is out of my hands' band (shared reach.ts, as the server
  // measures: what it stands on, its shapes' height) — 0 within it; a flier over the lot reaches
  // nothing down there.
  /** How far my hands are up or down from something lying at height `g` on my floor (shared
   *  reach.ts: 0 within their band) — the dark's drops and spots ask it. */
  offAt(g: number): number {
    return offBand(this.c.height.z, g, g);
  }

  offBand(o: WorldObjectDef): number {
    const g = this.c.grid.onLand(o.x, o.y) ? (this.c.grid.outside?.height(o.x, o.y) ?? 0) : 0;
    const [y0, y1] = spanOf(o);
    return offBand(this.c.height.z, g + y0, g + y1);
  }

  // …and how far my hands are from it: across the floor to it, and that
  reach(o: WorldObjectDef): number {
    const across = reachOf(o, this.c.me);
    const off = this.offBand(o);
    return off ? Math.hypot(across, off) : across;
  }

  updatePrompt() {
    if (this.c.cars?.prompt(hud)) return; // (a car: in by its door, or out — car/cars.ts)
    // the shuttle at its stop, near: on (or off, riding)
    const lp = this.c.room?.state.players.get(this.c.room.sessionId);
    const ride =
      this.c.level === 0
        ? (this.c.life?.prompt(this.c.room?.state.vehicles, lp?.busy === RIDING, this.c.me) ?? null)
        : null;
    if (ride) {
      const cur = hud.get().prompt;
      if (cur?.objectId !== ride.objectId || cur.label !== ride.label) hud.set({ prompt: ride });
      return;
    }
    // what's in front of me (docs/plan/56-the-controls.md C: the walker's focus, a few times a
    // second); in first person, what the crosshair's on first
    const tg = this.c.walker?.targets;
    const now = performance.now();
    this.focusHost.room = this.c.room;
    this.focusHost.level = this.c.level;
    if (tg && now - this.focusAt > 120) {
      this.focusAt = now;
      tg.update();
      this.lockFrame(now);
      // (locked on: the prompt's the lock's, wherever it is)
      const f = this.lock ?? tg.focus;
      const items = (this.lock ? [this.lock] : tg.list).map((t) => ({
        key: t.key,
        kind: t.kind,
        label: t.kind === "toy" ? tr(`act_${t.act}` as Key) : t.label,
        act: t.act,
        objectId: t.objectId,
      }));
      const at = Math.max(
        0,
        items.findIndex((t) => t.key === f?.key),
      );
      const sig = `${items.map((t) => `${t.key}|${t.act}`).join(",")}@${at}`;
      if (sig !== this.focusSig) {
        this.focusSig = sig;
        hud.set({ targets: items.length ? { items, at } : null });
      }
    }
    const pad = this.c.walker?.controls.pad.live ?? false;
    if (pad !== hud.get().padLive) hud.set({ padLive: pad });
    const fo = tg?.focus;
    // (in an elevator's car its panel is the way to use it: no "X" for it)
    const near =
      this.aimedObject() ??
      (tg ? (fo?.objectId ? (this.c.model?.getObject(fo.objectId) ?? null) : null) : this.nearestInteractable());
    const o = near?.kind === "elevator" && hud.get().lift ? null : near;
    const cur = hud.get().prompt;
    // (a seat, my desk: no use of their own, only their menu's)
    const kind = !o ? "" : hud.get().cable ? "plug" : (entry(o.kind).interact ?? "menu");
    if ((o?.id ?? null) === (cur?.objectId ?? null) && kind === (cur?.kind ?? "")) return;
    this.c.tp?.setHighlight(this.c.footprintOf(o?.id));
    hud.set({
      prompt: o ? { objectId: o.id, kind, label: kind === "plug" ? tr("cablePlug") : thingLabel(o) } : null,
    });
  }

  /** What the focus (input/targets.ts) asks of the world. */
  readonly focusHost: import("../input/targets").TargetHost = {
    room: null,
    level: 0,
    me: () => this.c.me,
    facing: () => this.c.walkYaw,
    camYaw: () => this.c.tp?.lookYaw ?? this.c.walkYaw,
    objects: () => this.c.model?.allObjects() ?? [],
    reach: (o) => this.reach(o),
    cable: () => !!hud.get().cable,
    inLift: () => !!hud.get().lift,
    menuFor: (t) => this.c.menu.menuFor(t),
  };

  /** Use, tapped: a car's door, the shuttle, else the focus's main action (docs/plan/56 C). */
  interact() {
    const p = hud.get().prompt;
    if (p && this.c.cars?.act(p.kind, p.objectId)) return;
    if (p?.kind === "ride" || p?.kind === "ride:leave")
      return this.c.send(p.kind === "ride" ? "ride:board" : "ride:leave", {});
    const f = this.lock ?? this.c.walker?.targets?.focus;
    if (p && (!f || this.aimedObject())) return this.c.menu.activateObject(p.objectId, false);
    if (!f) return;
    // (locked on to it from over there: walked over to)
    if (f.kind === "object" && f.act === "use") return this.c.menu.activateObject(f.objectId ?? "", !!this.lock);
    if (f.kind === "npc") return this.c.send("vortex:poke", {});
    if (f.kind === "toy") return this.c.pets.pickToy(f.key.slice(4));
    if (f.menu) this.c.menu.doAct(f.act, f.menu, f.label);
  }

  /** The next (1) or previous (-1) in the prompt's stack is the focus: [ ], the prompt's ‹ ›. */
  cycleFocus(by: 1 | -1) {
    this.c.walker?.targets?.cycle(by);
    this.focusAt = 0;
  }

  /** One in the prompt's stack, clicked, is the focus. */
  pickFocus(key: string) {
    this.c.walker?.targets?.pick(key);
    this.focusAt = 0;
  }

  /** Use, held: the focus's menu over it on screen, or mine with nothing in focus. */
  focusMenu() {
    if (hud.get().prompt?.kind.startsWith("car") || hud.get().prompt?.kind.startsWith("ride")) return this.interact();
    const f = this.lock ?? this.c.walker?.targets?.focus;
    if (f && !f.menu) return this.interact();
    const target: ActTarget = f?.menu ?? { type: "self" };
    const at = f ?? this.c.me;
    const r = this.c.hostRect();
    const s = this.c.clientAt(at.x, at.y, f?.kind === "object" ? 0.51 : 1.2);
    const where = { x: r.left + s.x, y: r.top + s.y };
    this.c.walker?.clear();
    if (!this.c.menu.openMenu(target, where, true) && f?.kind === "object")
      this.c.menu.activateObject(f.objectId ?? "", false);
  }

  // ── the lock-on (docs/plan/56-the-controls.md E): F / the wheel's button / RB holds on to the
  // focus, or who the camera's looking at; the camera frames us both, I face it, Use acts on it;
  // ← → / a flick of the stick or the mouse goes to the next one that way; again, or out of
  // range for a moment, lets go
  lock: import("../input/targets").Target | null = null;

  lockLostAt = 0;

  lockSide = 0;

  toggleLock() {
    const tg = this.c.walker?.targets;
    if (!tg) return;
    this.lock = this.lock ? null : (tg.focus ?? tg.lockable(LOCK_RANGE)[0] ?? null);
    this.lockLostAt = 0;
    this.showLock();
  }

  showLock() {
    const l = this.lock;
    const cur = hud.get().lockOn;
    if ((cur?.label ?? null) !== (l?.label ?? null)) hud.set({ lockOn: l ? { label: l.label } : null });
    // (its feet: someone's own, else where my feet are)
    if (this.c.tp)
      this.c.tp.lockAt = l
        ? { x: l.x, y: l.y, z: l.z ?? this.c.height.z, id: l.kind === "person" ? l.key.slice(2) : undefined }
        : null;
    this.focusSig = "";
  }

  lockFrame(now: number) {
    const tg = this.c.walker?.targets;
    const l = this.lock;
    if (!tg || !l) return;
    const t = tg.find(l.key, LOCK_RANGE + 4);
    if (t) {
      this.lock = t;
      this.lockLostAt = 0;
    } else if (!this.lockLostAt) this.lockLostAt = now;
    else if (now - this.lockLostAt > LOCK_LOST_MS) this.lock = null;
    // the next one that way: ← → (the camera's keys), the right stick or the mouse flicked
    const keys = this.c.walker?.camKeys().x ?? 0;
    const stick = activePad()?.axes[2] ?? 0;
    const side = keys || (Math.abs(stick) > 0.7 ? Math.sign(stick) : 0);
    const flick = this.c.tp?.takeFlick() ?? 0;
    const go = flick || (side && side !== this.lockSide ? side : 0);
    this.lockSide = side;
    if (go && this.lock) this.lock = tg.next(this.lock, go, LOCK_RANGE) ?? this.lock;
    this.showLock();
  }

  // Use held down: a tap on its release, the menu past USE_HOLD (keys and a pad: docs/plan/56 C)
  use: { src: "key" | "pad"; at: number; done: boolean } | null = null;

  focusAt = 0;

  focusSig = "";

  holdFrame(now: number) {
    const u = this.use;
    if (!u) return;
    if (u.src === "pad" && !this.c.walker?.padHeld("use")) {
      this.use = null;
      if (!u.done) this.interact();
      return;
    }
    if (!u.done && now - u.at >= USE_HOLD) {
      u.done = true;
      this.focusMenu();
    }
  }
}

const LOCK_RANGE = 14;

const LOCK_LOST_MS = 1500;
/** Use held this long: the focus's menu, not its main action (ms; docs/plan/56-the-controls.md C) */

/** Use held this long: the focus's menu, not its main action (ms; docs/plan/56-the-controls.md C) */
const USE_HOLD = 350;

// riding the shuttle (docs/plan/27, phase 6: grounds-life.ts)
const RIDING = "ride:shuttle";
