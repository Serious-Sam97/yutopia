import type { Body, MoveEnv, MoveInput, StepEvents, WaterHere } from "./step.ts";

// The water (docs/plan/66-the-water.md, S2): a body in it wades while its feet are on the bed —
// slower the deeper (stepBody's, by `wadeK`) — and floats once the water's up to its chest: it swims
// on the surface, its head out (a crawl on the sprint), or under it (C: a duck dive; the camera's
// pitch steers, Space up, C again back up; let go, it floats up). The current carries it. Out where the bed
// comes up to wading, or (Space) up a bank or the dock's edge in reach. Falling in deep enough, the
// water catches it: no landing. Pure and deterministic, as the rest of the core.

/** The water's numbers (m, s). */
export const SWIM = {
  /** water over the feet from which it's a wade */
  wade: 0.3,
  /** water over the feet from which the body floats (its chest at the surface): it swims */
  float: 1.25,
  /** water this deep floats a walker (a little deeper than a swimmer stands up in: no flicker) */
  enter: 1.45,
  /** a swimmer's feet under the surface (the head out) */
  ride: 1.25,
  /** wading at `float` deep: its speed × (1 − this), and no sprint */
  wadeSlow: 0.6,
  /** on the surface, a crawl (sprinting), under, under fast (m/s) */
  speed: 1.3,
  crawl: 2.3,
  under: 1.4,
  underFast: 2.0,
  /** to the speed wanted, and the water's drag back to the current (m/s²) */
  accel: 2.6,
  /** under: Space up, the dive's push down, and floating up when let go (m/s) */
  rise: 1.4,
  sink: 1.6,
  buoy: 0.5,
  /** the surface's bob (m, Hz) */
  bob: 0.035,
  bobHz: 0.45,
  /** turning (rad/s) */
  turn: 3.2,
  /** a fall into water this deep is caught (no landing) */
  catch: 1.3,
  /** climbing out: a top this far ahead, no higher than this over the surface */
  reach: 0.9,
  outTop: 1.0,
  /** the ice's top over the level (grounds.ts ICE_TOP) */
  iceTop: 0.04,
} as const;

/** The water over a body's feet (m; 0 out of it). */
export const overFeet = (b: Body, w: WaterHere | null | undefined) => (w ? Math.max(0, w.level - b.z) : 0);

/** How much a wade slows the walk at `over` metres over the feet (1: none). */
export function wadeK(over: number): number {
  if (over <= SWIM.wade) return 1;
  return 1 - SWIM.wadeSlow * Math.min(1, (over - SWIM.wade) / (SWIM.float - SWIM.wade));
}

/** Does the body swim this step (afloat, or caught falling in)? */
export function swimming(b: Body, w: WaterHere): boolean {
  const deep = w.level - w.bed;
  // (on the ice: walked — but under it, come up through it)
  if (w.ice && !b.swim) return b.z < w.level - 0.3;
  if (b.swim) return deep >= SWIM.float - 0.1 || b.z < w.bed - 0.05 || b.swim.under;
  // falling into it
  if (b.up && b.z < w.level - 0.2 && deep >= SWIM.catch) return true;
  // walked off the shelf (the bed's gone from under the chest)
  return deep >= SWIM.enter && b.z < w.level - SWIM.enter + 0.05;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** One step afloat. `begin` (the env's mantle): climb out onto a top ahead. */
export function stepSwim(
  b: Body,
  inp: MoveInput,
  env: MoveEnv,
  w: WaterHere,
  dt: number,
  ev: StepEvents,
  begin: (ux: number, uy: number, h: number, dist: number) => void,
): StepEvents {
  const S = SWIM;
  if (!b.swim) {
    // in: a splash by how hard; a dive from high goes under
    const hard = Math.max(0, -b.vz);
    ev.splash = Math.min(1, 0.15 + hard / 10);
    b.swim = { under: hard > 7 };
    b.vz *= 0.25;
    b.up = false;
    b.jump = null;
    b.rising = false;
    b.takeoff = -1;
    b.flow = null;
    b.airDash = 0;
    b.landed = 0;
  }
  const s = b.swim;
  const top = w.level - S.ride;
  // ── iced over (it froze round me): up on it (under it, I swim on to a hole or open water)
  if (w.ice && !s.under) {
    b.swim = null;
    b.z = w.level + S.iceTop;
    b.vz = 0;
    b.vx = 0;
    b.vy = 0;
    return ev;
  }
  const mag = Math.min(1, Math.hypot(inp.x, inp.y));
  const ux = mag > 1e-3 ? inp.x / Math.hypot(inp.x, inp.y) : Math.cos(b.yaw);
  const uy = mag > 1e-3 ? inp.y / Math.hypot(inp.x, inp.y) : Math.sin(b.yaw);

  // ── out: the bed up to where a swimmer's feet ride (stood up on it: a wade, coming up the slope to
  // the shore), or up a bank or the dock's edge in reach
  if (!s.under && w.bed > top - 0.1 && b.z <= top + 0.1) {
    b.swim = null;
    b.z = w.bed;
    b.vz = 0;
    return ev;
  }
  // (a ledge under the water ahead, up to the shelf: stepped up onto it, waded on)
  if (!s.under && mag > 0.05) {
    const ax = b.x + ux * 0.45;
    const ay = b.y + uy * 0.45;
    const g = env.grid.groundAt(ax, ay, w.level);
    if (g > b.z + 0.05 && g < w.level - 0.25 && w.level - g < S.float && env.grid.fitsAt(ax, ay, g + 0.05)) {
      b.swim = null;
      b.z = g;
      b.x = ax;
      b.y = ay;
      b.vz = 0;
      return ev;
    }
  }
  if (!s.under && inp.jumpPressed) {
    const out = climbOut(b, env, w, ux, uy);
    if (out) {
      b.swim = null;
      begin(ux, uy, out.top - b.z, out.dist);
      ev.verb = "mantle";
      return ev;
    }
  }
  // ── under or up: C dives, and again comes back up (Space too)
  if (inp.crouchPressed) {
    s.under = !s.under;
    if (s.under) b.vz = -S.sink;
  }

  // ── across: to the speed wanted, the current under it (let go, it carries you)
  const fast = inp.sprint && !inp.tired;
  const want = (s.under ? (fast ? S.underFast : S.under) : fast ? S.crawl : S.speed) * mag;
  const pitch = s.under && mag > 0.05 ? (inp.pitch ?? 0) : 0;
  const across = want * Math.cos(pitch);
  const tx = ux * across + w.vx;
  const ty = uy * across + w.vy;
  const dvx = tx - b.vx;
  const dvy = ty - b.vy;
  const dv = Math.hypot(dvx, dvy);
  if (dv > 1e-9) {
    const k = Math.min(1, (S.accel * dt) / dv);
    b.vx += dvx * k;
    b.vy += dvy * k;
  }

  // ── up and down: on the surface its bob; under, by the pitch, Space, C, else floating up
  if (!s.under) {
    const bob = S.bob * Math.sin(b.t * 2 * Math.PI * S.bobHz);
    b.vz = Math.max(-2, Math.min(2, (top + bob - b.z) * 4));
  } else {
    const vzWant = want * Math.sin(pitch) + (inp.jump ? S.rise : 0) + (mag < 0.05 ? S.buoy : 0);
    b.vz += (vzWant - b.vz) * Math.min(1, 4 * dt);
    // (back at the surface, coming up: on it)
    if (b.z >= top - 0.02 && b.vz > 0) {
      s.under = false;
      b.vz = 0;
    }
  }
  if (b.z + b.vz * dt > top + 0.1) b.vz = (top + 0.1 - b.z) / dt;

  // ── moved: on Jolt, its character with no gravity (the bed and the banks in the way); else the
  // grid's way — over the bed, never under it
  if (env.mover && (env.mover.ready?.(b.x, b.y) ?? true)) env.mover.step(b, dt, 0, env.blocked, true);
  else {
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    if (env.grid.fitsAt(nx, ny, b.z) && !env.blocked?.(nx, ny)) {
      b.x = nx;
      b.y = ny;
    } else {
      b.vx = 0;
      b.vy = 0;
    }
    b.z = Math.max(env.grid.groundAt(b.x, b.y, b.z + 0.5), b.z + b.vz * dt);
  }
  b.up = false;

  // ── facing: where you mean to go (or the camera's way)
  const heading = inp.faceLook ? inp.look : mag > 0.1 ? Math.atan2(uy, ux) : b.yaw;
  const d = wrap(heading - b.yaw);
  b.yaw = Math.abs(d) <= S.turn * dt ? heading : wrap(b.yaw + Math.sign(d) * S.turn * dt);
  b.gait = mag < 0.05 ? "still" : fast ? "sprint" : "jog";
  return ev;
}

/** A top to climb out onto ahead (a bank, the dock's planks): how high, and how far on to stand. */
function climbOut(b: Body, env: MoveEnv, w: WaterHere, ux: number, uy: number): { top: number; dist: number } | null {
  const S = SWIM;
  for (const d of [0.4, 0.65, S.reach]) {
    const x = b.x + ux * d;
    const y = b.y + uy * d;
    const g = env.grid.groundAt(x, y, w.level + S.outTop + 0.2);
    if (g < w.level - 0.25 || g > w.level + S.outTop) continue;
    if (!env.grid.fitsAt(x + ux * 0.3, y + uy * 0.3, g + 0.05)) continue;
    return { top: g, dist: d + 0.35 };
  }
  return null;
}
