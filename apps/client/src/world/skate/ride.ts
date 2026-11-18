// My board (docs/plan/104-the-skate-again.md): on it and off it, its keys (F2a, Tony Hawk's PC layout: A/D steer and
// W/S lean — the tricks' directions too —, W pushes, S brakes (a powerslide at speed), Space held crouches / let go
// ollies, J a flip, K a grind / lip / wallride, L a grab, Q/E spin, Shift the revert and break vert, X off, C the
// camera's preset), the park near (the town's two and the pieces built), what the step said (the skate HUD, the
// sound, a bail onto the ragdoll), the skate camera, the code for the wire. Loaded when a board's first taken in hand.

import type { Body } from "@yutopia/shared/move";
import {
  type BoardVariant,
  NO_KEYS,
  type PiecePlace,
  piecesOfThings,
  SKATE,
  SKATE_BAIL,
  SKATE_HALL,
  type SkateEnv,
  type SkateEvents,
  type SkateKeys,
  SkatePark,
  skateCode,
  skateEnv,
  startSkate,
  surfFrame,
  townSkatePieces,
} from "@yutopia/shared/skate";
import { hud as hudStore } from "../store";
import { thrown } from "../tp/thrown";
import { awayAt } from "./board3d";
import { SkateCamera } from "./camera";
import { SkateHud } from "./hud";
import { skateSound } from "./sound";

/** What each key is to a board: held (a field) and pressed (its edge). */
const KEYS: Record<string, { held?: keyof SkateKeys; press?: keyof SkateKeys }> = {
  KeyW: { held: "up", press: "upPressed" },
  KeyS: { held: "down", press: "downPressed" },
  KeyA: { held: "left", press: "leftPressed" },
  KeyD: { held: "right", press: "rightPressed" },
  Space: { held: "ollie", press: "olliePressed" },
  KeyJ: { press: "flipPressed" },
  KeyK: { held: "grind", press: "grindPressed" },
  KeyL: { held: "grab", press: "grabPressed" },
  KeyQ: { held: "spinL" },
  KeyE: { held: "spinR" },
  ShiftLeft: { held: "brk", press: "breakPressed" },
  ShiftRight: { held: "brk", press: "breakPressed" },
  KeyX: { press: "offPressed" },
};
/** The keys a board eats while riding (the walker's own still get W A S D and Space). */
const EATS = new Set(["KeyJ", "KeyK", "KeyL", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight", "KeyX", "KeyC"]);

/** The sound's API (skate/sound.ts, plan 104 F12a). */
type Surface = "concrete" | "wood" | "metal" | "asphalt";
interface Voice {
  update(o: {
    speed: number;
    maxSpeed: number;
    surface: Surface;
    state: "roll" | "air" | "grind" | "slide" | "manual" | "wall" | "lip" | "off";
    grindOn?: Surface;
    airT?: number;
    push: number;
  }): void;
  hit(what: string, surface: Surface, k?: number): void;
  hush(): void;
}

export interface RideHost {
  /** the walker's body */
  body(): Body | null;
  /** my session id (the ragdoll's) */
  sid(): string;
  /** the floor's things now (the built pieces among them: `sk_*`), and the land's height (where they sit) */
  things(): Iterable<{
    kind: string;
    x: number;
    y: number;
    rot?: number;
    yaw?: number;
    props?: Record<string, unknown> | null;
  }>;
  landAt(x: number, y: number): number;
  /** what's underfoot (the walker's footing) */
  footing?(x: number, y: number): string;
}

const inHall = (x: number, y: number) =>
  x >= SKATE_HALL.x0 && x <= SKATE_HALL.x1 && y >= SKATE_HALL.z0 && y <= SKATE_HALL.z1;

export class SkateRide {
  private held = new Set<string>();
  private pressed = new Set<keyof SkateKeys>();
  private park = new SkatePark([]);
  private piecesKey = "";
  private parkAt = 0;
  private skEnv: SkateEnv = skateEnv(this.park);
  private hud: SkateHud | null = null;
  readonly cam = new SkateCamera();
  /** s left of the bail's code on the wire (the others' ragdoll) */
  private bailUntil = 0;
  /** (F13a) the board thrown off in the last bail: from where, how fast, when — got back by walking to it */
  private away: { x: number; y: number; vx: number; vy: number; at: number } | null = null;
  /** the session carried from one ride to the next: the special, lit, the score; the best (this browser's) */
  private carry = { special: 0, lit: false, score: 0 };
  private best = 0;
  private camDt = 1 / 60;
  /** the board I'm on (or last was) */
  variant: BoardVariant = "street-pop";
  stance: 1 | -1 = 1;
  constructor(private host: RideHost) {
    try {
      this.best = Number(localStorage.getItem("yutopia.skate.best") ?? 0) || 0;
    } catch {
      this.best = 0;
    }
  }

  riding(): boolean {
    return !!this.host.body()?.skate;
  }

  /** Down on it (from standing: the speed I had, the way she faces) — or, on it, off. */
  toggle(variant: BoardVariant, stance: 1 | -1) {
    const b = this.host.body();
    if (!b) return;
    if (b.skate) {
      this.keep(b);
      b.skate = null;
      this.hit("off");
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
    this.hud.hidden(false);
    this.cam.reset();
    startSkate(b, variant, stance, this.carry);
    hudStore.set({ skating: true });
    this.hit("on");
  }

  /** A key (ctl/input.ts, before the walker's): true, it's the board's (only while riding). */
  key(e: KeyboardEvent, down: boolean): boolean {
    if (e.code === "KeyC") {
      if (down && !e.repeat && this.riding()) this.hud?.note(`Camera: ${this.cam.cycle()}`);
      return EATS.has(e.code);
    }
    const k = KEYS[e.code];
    if (!k) return false;
    if (down) {
      if (!e.repeat && !this.held.has(e.code) && k.press) this.pressed.add(k.press);
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
    const k: SkateKeys = { ...NO_KEYS };
    const r = k as unknown as Record<string, boolean>;
    for (const code of this.held) {
      const f = KEYS[code]?.held;
      if (f) r[f] = true;
    }
    for (const p of this.pressed) r[p] = true;
    return k;
  }
  /** The presses were stepped: gone. */
  stepped() {
    this.pressed.clear();
  }

  /** The town's two parks (F7c: the hall's and the yard's), and the pieces built (F6a). */
  private town: PiecePlace[] | null = null;
  pieces(): PiecePlace[] {
    this.town ??= townSkatePieces();
    const built = piecesOfThings(this.host.things(), (x, y) => this.host.landAt(x, y));
    return built.length ? [...this.town, ...built] : this.town;
  }
  /** The park near, its pieces kept up to date (rebuilt when they change). */
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

  /** What's under the wheels, as the sound has it: a hall's ramp is wood, a yard's concrete; the ground by its footing. */
  private surface(b: Body): Surface {
    const k = b.skate;
    if (k?.on) return inHall(b.x, b.y) ? "wood" : "concrete";
    const f = this.host.footing?.(b.x, b.y) ?? "asphalt";
    return f === "asphalt" ? "asphalt" : "concrete";
  }
  private hit(what: string, k?: number) {
    const b = this.host.body();
    (skateSound() as unknown as Voice | null)?.hit(what, b ? this.surface(b) : "concrete", k);
  }
  /** The session kept from the board's state (the next ride carries it on). */
  private keep(b: Body) {
    const k = b.skate;
    if (k) this.carry = { special: k.special, lit: k.lit, score: k.score };
  }

  /** What the steps said this frame (the body after them). */
  after(evs: SkateEvents[], b: Body, dt: number) {
    this.camDt = dt;
    const surf = this.surface(b);
    const snd = skateSound() as unknown as Voice | null;
    for (const e of evs) {
      if (e.ollie) snd?.hit(e.grind ? "grind-jump" : "jump", surf);
      if (e.land !== undefined) snd?.hit("land", surf, e.land);
      if (e.grind) snd?.hit(e.grind === "ledge" ? "slide-land" : "grind-land", e.grind === "ledge" ? surf : "metal");
      if (e.cess) snd?.hit("cess", surf);
      if (e.combo) {
        this.hud?.landed(e.combo.score);
        const total = (b.skate?.score ?? this.carry.score) + 0;
        if (total > this.best) {
          this.best = total;
          try {
            localStorage.setItem("yutopia.skate.best", String(total));
          } catch {
            /* (a private window) */
          }
        }
      }
      if (e.gap) this.hud?.gap(e.gap.name, e.gap.pts);
      if (e.lost) this.hud?.bailed(e.lost.score);
      if (e.off !== undefined) snd?.hit(e.off > SKATE.offSlow ? "off" : "kick-up", surf);
      if (e.bail) {
        // onto the ragdoll at the speed I had, the board shot on (plan 58's fall, as thrown from a car)
        thrown.set(this.host.sid(), { v: [b.vx, Math.max(1.2, b.vz), b.vy], at: performance.now() });
        this.away = { x: b.x, y: b.y, vx: b.vx * 1.1, vy: b.vy * 1.1, at: performance.now() };
        this.bailUntil = 1.5;
        this.carry = { ...this.carry, special: 0, lit: false };
        snd?.hit("bail", surf);
      }
    }
    this.bailUntil = Math.max(0, this.bailUntil - dt);
    const k = b.skate;
    if (!k) {
      if (hudStore.get().skating) hudStore.set({ skating: false });
      this.hud?.hidden(true);
      snd?.hush();
      return;
    }
    this.keep(b);
    // the sound: the wheels by the speed and the surface, the grind or slide on, the air's spin-down
    const g = k.grind;
    snd?.update({
      speed: Math.abs(k.s),
      maxSpeed: SKATE.top,
      surface: surf,
      state:
        k.mode === "grind"
          ? g?.what === "ledge" || g?.across
            ? "slide"
            : "grind"
          : k.mode === "roll"
            ? "roll"
            : (k.mode as "air" | "manual" | "wall" | "lip"),
      grindOn: g ? (g.what === "ledge" ? surf : "metal") : undefined,
      airT: k.air?.t,
      push: k.push,
    });
    // the HUD: the combo's names, its base × count, the needle, the session
    const names = [...k.combo.done.map((d) => d.name), ...(k.combo.live ? [k.combo.live.name] : [])];
    const bal = k.grind
      ? { v: k.grind.bal, kind: "grind" as const }
      : k.manual
        ? { v: k.manual.bal, kind: "manual" as const }
        : k.lip
          ? { v: k.lip.bal, kind: "lip" as const }
          : undefined;
    this.hud?.show({
      combo: names.length ? { names, base: k.combo.base, mult: k.combo.count } : null,
      bal,
      score: k.score,
      best: Math.max(this.best, k.score),
      special: Math.min(1, k.special / SKATE.specialFull),
      lit: k.lit,
      fakie: k.s < 0,
    });
  }

  /** The skate camera's frame (a game camera for the view: tp/view.ts gameCam), or null off the board. */
  camera() {
    const b = this.host.body();
    if (!b?.skate) return null;
    return this.cam.frame(b, this.park, this.camDt);
  }

  /** For the wire (pos.sk): the board as it is, the bail a moment after it. */
  code(b: Body | null): number {
    if (b?.skate) return skateCode(b.skate);
    return this.bailUntil > 0 ? SKATE_BAIL : 0;
  }

  dispose() {
    this.hud?.dispose();
    this.hud = null;
  }
}
export { SKATE };
