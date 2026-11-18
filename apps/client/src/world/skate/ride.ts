// My board (docs/plan/103-the-skate.md, phase 6): on it and off it, its keys (F3a: W push, S stop, A/D carve and
// spin, Space held crouch / let go ollie, E a flip, R a grab, F a grind / lip / wallride, W→S a manual, Q the
// revert, X off), the park near (the town's two and the pieces built), what the step said (the combo on the HUD,
// a bail onto the ragdoll), the code for the wire. Loaded when a board's first taken in hand.

import type { Body } from "@yutopia/shared/move";
import {
  type BoardVariant,
  NO_KEYS,
  type PiecePlace,
  SKATE,
  SKATE_BAIL,
  type SkateEnv,
  type SkateEvents,
  type SkateKeys,
  SkatePark,
  skateCode,
  skateEnv,
  piecesOfThings,
  startSkate,
  surfFrame,
  townSkatePieces,
} from "@yutopia/shared/skate";
import { thrown } from "../tp/thrown";
import { awayAt } from "./board3d";
import { SkateHud } from "./hud";
import { skateSound } from "./sound";

const CODES: Record<string, keyof SkateKeys | null> = {
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Space: "ollie",
  KeyE: "flipPressed",
  KeyR: "grab",
  KeyF: "grind",
  KeyQ: "revertPressed",
  KeyX: "offPressed",
};
/** The keys a board eats (the walker's own still get W A S D and Space). */
const EATS = new Set(["KeyE", "KeyR", "KeyF", "KeyQ", "KeyX"]);

export interface RideHost {
  /** the walker's body */
  body(): Body | null;
  /** my session id (the ragdoll's) */
  sid(): string;
  /** the floor's things now (the built pieces among them: `sk_*`), and the land's height (where they sit) */
  things(): Iterable<{ kind: string; x: number; y: number; rot?: number; yaw?: number; props?: Record<string, unknown> | null }>;
  landAt(x: number, y: number): number;
  /** a sound (plan 103 phase 7) */
  sound?(what: string, k?: number): void;
}

export class SkateRide {
  private held = new Set<string>();
  private pressed = new Set<keyof SkateKeys>();
  private park = new SkatePark([]);
  private piecesKey = "";
  private parkAt = 0;
  private skEnv: SkateEnv = skateEnv(this.park);
  private hud: SkateHud | null = null;
  /** s left of the bail's code on the wire (the others' ragdoll) */
  private bailUntil = 0;
  /** (F13a) the board thrown off in the last bail: from where, how fast, when — got back by walking to it */
  private away: { x: number; y: number; vx: number; vy: number; at: number } | null = null;
  /** the board I'm on (or last was) */
  variant: BoardVariant = "street-pop";
  stance: 1 | -1 = 1;
  constructor(private host: RideHost) {}

  riding(): boolean {
    return !!this.host.body()?.skate;
  }

  /** Down on it (from standing: the speed I had) — or, on it, off. */
  toggle(variant: BoardVariant, stance: 1 | -1) {
    const b = this.host.body();
    if (!b) return;
    if (b.skate) {
      b.skate = null;
      this.sound("off");
      return;
    }
    if (b.swim || b.flow || b.verb) return;
    // (thrown off: it's where it rolled to — walked to and picked up, or back in the hand after a while)
    if (this.away) {
      const t = (performance.now() - this.away.at) / 1000;
      const w = awayAt(this.away.x, this.away.y, this.away.vx, this.away.vy, t);
      if (t < 8 && Math.hypot(w.x - b.x, w.y - b.y) > 1.6) {
        this.hud?.note("Your board's over there — walk to it");
        return;
      }
      this.away = null;
    }
    this.variant = variant;
    this.stance = stance;
    this.hud ??= new SkateHud();
    startSkate(b, variant, stance);
    this.sound("on");
  }

  /** A key (ctl/input.ts, before the walker's): true, it's the board's. */
  key(e: KeyboardEvent, down: boolean): boolean {
    const k = CODES[e.code];
    if (!k) return false;
    if (down) {
      if (!e.repeat && !this.held.has(e.code)) {
        if (k === "up") this.pressed.add("upPressed");
        if (k === "down") this.pressed.add("downPressed");
        if (k === "grab") this.pressed.add("grabPressed");
        if (k === "grind") this.pressed.add("grindPressed");
        if (k === "flipPressed" || k === "revertPressed" || k === "offPressed") this.pressed.add(k);
      }
      this.held.add(e.code);
    } else this.held.delete(e.code);
    return EATS.has(e.code);
  }
  /** The window lost the keys (blurred): none held. */
  blur() {
    this.held.clear();
    this.pressed.clear();
  }

  /** The keys for a step: what's held, and the presses not yet stepped. */
  keys(): SkateKeys {
    const h = this.held;
    const k: SkateKeys = {
      ...NO_KEYS,
      up: h.has("KeyW"),
      down: h.has("KeyS"),
      left: h.has("KeyA"),
      right: h.has("KeyD"),
      ollie: h.has("Space"),
      grab: h.has("KeyR"),
      grind: h.has("KeyF"),
    };
    for (const p of this.pressed) (k as unknown as Record<string, boolean>)[p] = true;
    return k;
  }
  /** The presses were stepped: gone. */
  stepped() {
    this.pressed.clear();
  }

  /** The park near, its pieces kept up to date (the town's and the ones built: rebuilt when they change). */
  /** The town's two parks (F7c: the hall's and the yard's), and the pieces built (F6a). */
  private town: PiecePlace[] | null = null;
  pieces(): PiecePlace[] {
    this.town ??= townSkatePieces();
    const built = piecesOfThings(this.host.things(), (x, y) => this.host.landAt(x, y));
    return built.length ? [...this.town, ...built] : this.town;
  }
  env(): SkateEnv {
    const ps = this.pieces();
    const key = ps
      .map((p) => `${p.kind}${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(3)}`)
      .join("|");
    if (key !== this.piecesKey) {
      this.piecesKey = key;
      this.park = new SkatePark(ps);
      this.skEnv = skateEnv(this.park);
    }
    return this.skEnv;
  }
  parkNow(): SkatePark {
    return this.park;
  }
  /** The ground's normal at someone's feet (a piece's, else up): how their board's drawn. */
  normalAt(x: number, y: number, z: number): [number, number, number] | null {
    // (the park kept up to date for the others too, a second at a time)
    const now = performance.now();
    if (now - this.parkAt > 1000) {
      this.parkAt = now;
      this.env();
    }
    const t = this.park.topAt(x, y, z + 0.15, 0);
    if (!t || Math.abs(t.z - z) > 0.3) return null;
    const p = this.park.placed[t.on.pl];
    return surfFrame(p, t.on.l, t.on.w).N;
  }

  /** What the steps said this frame (the body after them). */
  after(evs: SkateEvents[], b: Body, dt: number) {
    for (const e of evs) {
      if (e.ollie) this.sound("pop");
      if (e.land !== undefined) this.sound("land", e.land);
      if (e.grind) this.sound(`grind:${e.grind}`);
      if (e.combo) this.hud?.ended(e.combo.score, false);
      if (e.lost) this.hud?.ended(e.lost.score, true);
      if (e.off !== undefined) this.sound("off", e.off);
      if (e.bail) {
        // onto the ragdoll at the speed I had, the board shot on (plan 58's fall, as thrown from a car)
        thrown.set(this.host.sid(), { v: [b.vx, Math.max(1.2, b.vz), b.vy], at: performance.now() });
        this.away = { x: b.x, y: b.y, vx: b.vx * 1.1, vy: b.vy * 1.1, at: performance.now() };
        this.bailUntil = 1.5;
        this.sound("bail");
      }
    }
    this.bailUntil = Math.max(0, this.bailUntil - dt);
    const k = b.skate;
    const snd = skateSound();
    if (!k) {
      this.hud?.show(null);
      snd?.hush();
      return;
    }
    // the wheels, a grind, a push (the ground's roughness from the step's own: plan 103 F8a)
    const g = k.grind ? (k.grind.what === "ledge" ? "ledge" : "steel") : null;
    snd?.update(Math.abs(k.s), k.rough, g, k.mode === "air" || k.mode === "wall", k.push);
    const bal = k.grind ? k.grind.bal : k.manual ? k.manual.bal : k.lip ? k.lip.bal : undefined;
    this.hud?.show({
      name: k.combo.name,
      base: k.combo.base,
      count: k.combo.count,
      bal,
      vertical: !!(k.manual || k.lip),
    });
  }

  /** For the wire (pos.sk): the board as it is, the bail a moment after it. */
  code(b: Body | null): number {
    if (b?.skate) return skateCode(b.skate);
    return this.bailUntil > 0 ? SKATE_BAIL : 0;
  }

  /** A moment heard (the host's, else the board's own). */
  private sound(what: string, k?: number) {
    if (this.host.sound) this.host.sound(what, k);
    else skateSound()?.hit(what, k);
  }

  dispose() {
    this.hud?.dispose();
    this.hud = null;
  }
}
export { SKATE };
