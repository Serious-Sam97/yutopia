// A jump (Space): a hop standing or walking, a front flip running — high
// enough to land on things (a desk with a hop, the arcade's top with a flip;
// grid.ts says what can be stood on). A crouch to load up, then real gravity:
// the feet rise and fall and land on the highest top they clear (or the floor),
// a squash on landing. Walking off the edge of something drops you. Only the
// heights and the stages live here — how the body moves through them is the
// client's (chars/motion.ts `jumpPose`).
import type { Grid } from "./grid.ts";

// (a leap: running's jump in the KH body — the flip's height, leant forward, not turned over: the
// flip is the jump in the air there — docs/plan/58-the-animation.md)
export const JUMPS = ["hop", "flip", "leap"] as const;
export type JumpKind = (typeof JUMPS)[number];
export const isJump = (k: unknown): k is JumpKind => JUMPS.includes(k as JumpKind);

/** Gravity, tiles / s² (a tile ≈ a metre: floatier than the real thing, as games are). */
export const JUMP_G = 20;

const SPEC: Record<JumpKind, { crouch: number; h: number; land: number }> = {
  hop: { crouch: 0.09, h: 0.8, land: 0.16 },
  flip: { crouch: 0.11, h: 1.45, land: 0.22 },
  leap: { crouch: 0.06, h: 1.45, land: 0.2 },
};

export interface JumpTimes {
  crouch: number;
  /** up and back down to where it started, s */
  air: number;
  land: number;
  /** the whole thing landing where it started, s */
  len: number;
  /** the apex, tiles above where it started */
  h: number;
}

export function jumpTimes(kind: JumpKind): JumpTimes {
  const s = SPEC[kind] ?? SPEC.hop;
  // up and down again from h: t = 2·√(2h/g)
  const air = 2 * Math.sqrt((2 * s.h) / JUMP_G);
  return { crouch: s.crouch, air, land: s.land, len: s.crouch + air + s.land, h: s.h };
}

/** How fast the feet leave the ground, tiles / s. */
export const jumpSpeed = (kind: JumpKind) => Math.sqrt(2 * JUMP_G * jumpTimes(kind).h);

export interface JumpArc {
  stage: "crouch" | "air" | "land" | "done";
  /** how far into the stage, 0..1 */
  k: number;
  /** the feet's height off where it started, tiles */
  h: number;
}

/** Where a jump landing where it started is, `t` s in (previews, review shots). */
export function jumpArc(kind: JumpKind, t: number): JumpArc {
  const T = jumpTimes(kind);
  if (t < 0) return { stage: "crouch", k: 0, h: 0 };
  if (t < T.crouch) return { stage: "crouch", k: t / T.crouch, h: 0 };
  const a = t - T.crouch;
  if (a < T.air) {
    const v0 = (JUMP_G * T.air) / 2;
    return { stage: "air", k: a / T.air, h: Math.max(0, v0 * a - (JUMP_G * a * a) / 2) };
  }
  const l = a - T.air;
  if (l < T.land) return { stage: "land", k: l / T.land, h: 0 };
  return { stage: "done", k: 1, h: 0 };
}

/** The next jump may start once this one is coming down (a jump pressed just before landing chains). */
export function jumpReady(kind: JumpKind, t: number): boolean {
  const T = jumpTimes(kind);
  return t >= T.crouch + T.air - 0.2;
}

// ── the feet's height ───────────────────────────────────────────────────────
export interface Height {
  z: number; // tiles off the floor
  vz: number; // tiles / s, up
  up: boolean; // in the air
}

/** One step of the feet at (x, y): in the air they fall and land on the highest
 *  top they clear; on something, walking off its edge drops them. True on landing. */
export function stepHeight(
  grid: Pick<Grid, "groundAt" | "onRamp" | "onLand">,
  x: number,
  y: number,
  h: Height,
  dt: number,
): boolean {
  const ground = grid.groundAt(x, y, h.z);
  if (!h.up) {
    if (ground < h.z - 0.01) {
      // down the stairs the feet follow the treads (no hop off each step), and
      // downhill outdoors the ground
      if ((grid.onRamp(x, y) && h.z - ground < 0.45) || (grid.onLand(x, y) && h.z - ground < 0.6)) {
        h.z = ground;
        return false;
      }
      h.up = true; // off the edge
      h.vz = 0;
    } else {
      h.z = ground; // (a step up)
      return false;
    }
  }
  h.vz -= JUMP_G * dt;
  const z = h.z + h.vz * dt;
  if (h.vz <= 0 && z <= ground) {
    h.z = ground;
    h.vz = 0;
    h.up = false;
    return true;
  }
  h.z = z;
  return false;
}

// ── what the body's doing ───────────────────────────────────────────────────
/** A jump as the body shows it: the stage and how far into it. A fall off something is a hop's air and landing. */
export interface JumpNow {
  kind: JumpKind;
  stage: "crouch" | "air" | "land";
  k: number;
}

/** The nominal jump `t` s in as a stage (previews). */
export function jumpNowAt(kind: JumpKind, t: number): JumpNow | null {
  const a = jumpArc(kind, t);
  return a.stage === "done" ? null : { kind, stage: a.stage, k: a.k };
}

const FALL_MS = 120; // in the air this long without a jump: it's a fall (shown, and landed)

/** Someone's jump (or fall) stage from when it started and whether they're in the air. */
export class JumpTrack {
  kind: JumpKind | null = null;
  private start = 0;
  private wasUp = false;
  private landedAt = -1;
  private fallAt = -1;

  /** a jump starting at `now` (ms; later for others: as late as they're drawn) */
  begin(kind: JumpKind, now: number) {
    this.kind = kind;
    this.start = now;
    this.wasUp = false;
    this.landedAt = -1;
    this.fallAt = -1;
  }

  /** s since it started (-1: none) */
  since(now: number): number {
    return this.kind ? (now - this.start) / 1000 : -1;
  }

  /** this frame (`up`: their feet are off whatever's under them) */
  update(now: number, up: boolean): JumpNow | null {
    const kind = this.kind;
    if (kind) {
      const T = jumpTimes(kind);
      const t = (now - this.start) / 1000;
      if (t < 0) return null;
      if (t < T.crouch) return { kind, stage: "crouch", k: t / T.crouch };
      if (this.landedAt < 0) {
        if (up) this.wasUp = true;
        // down (or never got up: something over them)
        if (!up && (this.wasUp || t > T.crouch + 0.25)) this.landedAt = now;
        else return { kind, stage: "air", k: Math.min(0.95, (t - T.crouch) / T.air) };
      }
      const lt = (now - this.landedAt) / 1000;
      if (lt < T.land) return { kind, stage: "land", k: lt / T.land };
      this.kind = null;
    }
    // off the edge of something: a fall
    if (up) {
      if (this.fallAt < 0) this.fallAt = now;
      return now - this.fallAt > FALL_MS ? { kind: "hop", stage: "air", k: 0.95 } : null;
    }
    if (this.fallAt >= 0) {
      const long = now - this.fallAt > FALL_MS;
      this.fallAt = -1;
      if (long) {
        // landed from it: a hop's landing
        this.begin("hop", now - 10_000);
        this.wasUp = true;
        this.landedAt = now;
        return { kind: "hop", stage: "land", k: 0 };
      }
    }
    return null;
  }
}
