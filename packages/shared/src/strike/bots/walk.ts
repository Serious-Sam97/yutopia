// A bot's feet (docs/plan/117-bot-brains.md, phase 3, F4a): the walk grid's path pulled straight (no 45° zigzags:
// the furthest node ahead it can walk to in a line is where it heads), CS's own ground rules to get there (shared
// move.ts: the acceleration and friction that make stopping a skill — a counter-strafe), walking quietly or
// crouched when it wants, sidestepping in a fight, and the floor under it followed (steps, stairs, crates).

import { CELL, DROP, type Grid, JUMP, nodeAt, nodeNear, nodePos, STEP } from "../grid.ts";
import { stepMove } from "../move.ts";
import { pathPen } from "./know.ts";

export interface Feet {
  x: number;
  y: number;
  z: number;
  /** the height of the floor node it stands on (y eases toward it; the floor's chosen by this) */
  gy: number;
  vx: number;
  vz: number;
  /** the path (nodes), how far along it's got, the node it's heading for (its pulled-straight waypoint) */
  path: number[];
  pi: number;
  wp: number;
  /** where the path goes to (a node), and when it was last pulled straight */
  to: number;
  pulledAt: number;
  /** stuck: seconds without getting anywhere while wanting to */
  stuck: number;
}
export const newFeet = (x: number, y: number, z: number): Feet => ({
  x,
  y,
  z,
  gy: y,
  vx: 0,
  vz: 0,
  path: [],
  pi: 0,
  wp: -1,
  to: -1,
  pulledAt: 0,
  stuck: 0,
});

/** How it wants to go this step. */
export interface Gait {
  /** run, walk (quiet, Shift), crouch, or stand (stop: friction) */
  mode: "run" | "walk" | "crouch" | "stop";
  /** the hand's run speed (rules.speedWith) */
  max: number;
  /** a sidestep instead of the path (a fight's strafe): the way (unit, world x/z) */
  side?: [number, number] | null;
  /** stopping hard: a step against the way it's going (CS's counter-strafe) */
  counter?: boolean;
  /** slowed by a hit (rules.TAG) */
  tagged?: number;
}

/** Whether a body can walk straight from (ax, az) at height ay to (bx, bz): every quarter metre on the floor, no
 *  step up past a stair's, none down past a drop, room either side for its shoulders. */
export function walkClear(g: Grid, ax: number, ay: number, az: number, bx: number, bz: number, by?: number): boolean {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 1e-3) return true;
  const n = Math.ceil(L / 0.25);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  let y = ay;
  for (let i = 1; i <= n; i++) {
    const t = Math.min(L, i * 0.25);
    const x = ax + ux * t;
    const z = az + uz * t;
    const k = nodeAt(g, x, z, y);
    if (k < 0) return false;
    const h = g.hs[k];
    if (h - y > STEP || y - h > STEP) return false;
    y = h;
    // (its shoulders: a hand's width either side on the floor too, every metre)
    if (i % 4 === 0) {
      const a = nodeAt(g, x - uz * 0.3, z + ux * 0.3, y);
      const b = nodeAt(g, x + uz * 0.3, z - ux * 0.3, y);
      if (a < 0 || b < 0 || Math.abs(g.hs[a] - y) > STEP || Math.abs(g.hs[b] - y) > STEP) return false;
    }
  }
  // (and it ends on the floor it was meant to: not under a stair, on the storey below)
  return by === undefined || Math.abs(y - by) <= STEP;
}

/** Sets the feet going to node `to` (a new path); false if there's no way. */
export function goTo(f: Feet, g: Grid, to: number): boolean {
  const from = nodeNear(g, f.x, f.z, f.gy);
  const p = pathPen(g, from, to, null);
  f.to = to;
  f.pulledAt = -1;
  if (!p) {
    f.path = [];
    f.pi = 0;
    f.wp = -1;
    return false;
  }
  f.path = p;
  f.pi = 0;
  f.wp = -1;
  return true;
}
/** Sets the feet going along a path already made (a route's), from its node nearest them. */
export function follow(f: Feet, g: Grid, path: number[], to = path[path.length - 1]) {
  let best = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length; i += 2) {
    const [x, y, z] = nodePos(g, path[i]);
    const d = Math.hypot(x - f.x, z - f.z) + Math.abs(y - f.gy) * 4;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  // (far from its line: a path onto it first)
  if (bd > 4) {
    const from = nodeNear(g, f.x, f.z, f.gy);
    const on = pathPen(g, from, path[best], null);
    f.path = on ? [...on, ...path.slice(best + 1)] : path.slice(best);
  } else f.path = path.slice(best);
  f.pi = 0;
  f.wp = -1;
  f.to = to;
  f.pulledAt = -1;
}
/** Whether the feet have got where they were going (within `r` m). */
export function arrived(f: Feet, g: Grid, r = 0.8): boolean {
  if (f.to < 0) return true;
  const [x, y, z] = nodePos(g, f.to);
  return Math.hypot(x - f.x, z - f.z) <= r && Math.abs(y - f.gy) < 1.5;
}
/** m left along the path. */
export function pathLeft(f: Feet, g: Grid): number {
  let L = 0;
  let px = f.x;
  let pz = f.z;
  for (let i = f.pi; i < f.path.length; i += 4) {
    const [x, , z] = nodePos(g, f.path[i]);
    L += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  if (f.path.length) {
    const [x, , z] = nodePos(g, f.path[f.path.length - 1]);
    L += Math.hypot(x - px, z - pz);
  }
  return L;
}

/** The way the path goes from here (unit x/z), for where to look while walking; [0, 0] at its end. */
export function heading(f: Feet, g: Grid): [number, number] {
  const k = f.wp >= 0 ? f.wp : Math.min(f.path.length - 1, f.pi + 6);
  if (k < 0 || !f.path.length) return [0, 0];
  const [x, , z] = nodePos(g, f.path[k]);
  const d = Math.hypot(x - f.x, z - f.z);
  return d < 0.05 ? [0, 0] : [(x - f.x) / d, (z - f.z) / d];
}

/** One step of the feet: toward the pulled-straight waypoint (or sideways, or stopping), CS's ground rules, the
 *  floor followed. `now` s (the pull's clock). */
export function stepFeet(f: Feet, g: Grid, gait: Gait, dt: number, now: number) {
  // the waypoint: every quarter second (or when it's reached), the furthest of the next 48 nodes walkable in a line
  if (f.path.length && f.pi < f.path.length) {
    if (f.wp >= 0) {
      const [wx, , wz] = nodePos(g, f.path[f.wp]);
      if (Math.hypot(wx - f.x, wz - f.z) < 0.6) {
        f.pi = f.wp + 1;
        f.wp = -1;
      }
    }
    if (f.pi < f.path.length && (f.wp < 0 || now - f.pulledAt > 0.25)) {
      f.pulledAt = now;
      let best = f.pi;
      const end = Math.min(f.path.length - 1, f.pi + 48);
      for (let k = end; k > f.pi; k -= 2) {
        const [x, y, z] = nodePos(g, f.path[k]);
        if (walkClear(g, f.x, f.gy, f.z, x, z, y)) {
          best = k;
          break;
        }
      }
      f.wp = best;
    }
  }
  // the wish
  let wx = 0;
  let wz = 0;
  if (gait.side) [wx, wz] = gait.side;
  else if (gait.mode !== "stop" && f.wp >= 0 && f.pi < f.path.length) {
    const [x, , z] = nodePos(g, f.path[f.wp]);
    const d = Math.hypot(x - f.x, z - f.z);
    if (d > 0.05) {
      wx = (x - f.x) / d;
      wz = (z - f.z) / d;
    }
  }
  const sp0 = Math.hypot(f.vx, f.vz);
  if (gait.counter && gait.mode === "stop" && sp0 > 0.6 && !gait.side) {
    wx = -f.vx / sp0;
    wz = -f.vz / sp0;
  }
  const v = stepMove(
    { x: f.vx, z: f.vz },
    {
      wx,
      wz,
      walk: gait.mode === "walk",
      crouch: gait.mode === "crouch",
      max: gait.max,
      onGround: true,
      tagged: gait.tagged ?? 0,
    },
    dt,
  );
  // (a counter-strafe never turns into a step back the other way)
  if (gait.counter && gait.mode === "stop" && v.x * f.vx + v.z * f.vz < 0) {
    v.x = 0;
    v.z = 0;
  }
  f.vx = v.x;
  f.vz = v.z;
  // the floor: the node where it's going at the height it stands at — or the path's, where that's within a climb (on a
  // stair two floors share a cell: the nearer to a lagging height was the one below); else along one axis; else
  // stopped
  let ref = f.gy;
  if (f.path.length && f.pi < f.path.length) {
    const py = g.hs[f.path[Math.min(f.pi, f.path.length - 1)]];
    const pPrev = f.pi > 0 ? g.hs[f.path[f.pi - 1]] : py;
    if (Math.abs(py - f.gy) <= JUMP) ref = py;
    // (at a drop's edge — still on the floor of the node before: down through the opening to the next node's floor)
    else if (Math.abs(pPrev - f.gy) <= STEP) ref = py;
    // (on another floor than its path: a new one from where it is)
    else if (Math.abs(py - f.gy) > 2.5 && f.to >= 0 && now - f.pulledAt > 0.5) goTo(f, g, f.to);
  }
  const tryAt = (x: number, z: number): boolean => {
    let k = nodeAt(g, x, z, ref);
    if (k < 0) return false;
    if (Math.abs(g.hs[k] - f.gy) > JUMP && Math.abs(g.hs[k] - ref) > STEP) k = nodeAt(g, x, z, f.gy);
    const h = g.hs[k];
    if (h - f.gy > JUMP || f.gy - h > DROP) return false;
    // (never off a ledge by accident — a turn's momentum past a slab's edge: down more than a stair only where its
    // path goes down, one of its next few nodes at that height)
    if (f.gy - h > STEP && Math.abs(h - ref) > STEP) {
      let ok = false;
      for (let i = f.pi; i < Math.min(f.path.length, f.pi + 6); i++)
        if (Math.abs(g.hs[f.path[i]] - h) <= STEP) ok = true;
      if (!ok) return false;
    }
    f.x = x;
    f.z = z;
    f.gy = h;
    f.y = h - f.y > STEP ? h : f.y + (h - f.y) * Math.min(1, dt * 18);
    return true;
  };
  const nx = f.x + f.vx * dt;
  const nz = f.z + f.vz * dt;
  const was = [f.x, f.z];
  if (!tryAt(nx, nz) && !tryAt(nx, f.z) && !tryAt(f.x, nz)) {
    f.vx = 0;
    f.vz = 0;
  }
  // stuck: wanting to go and not going
  const moved = Math.hypot(f.x - was[0], f.z - was[1]);
  const wanted = (wx || wz) && gait.mode !== "stop";
  f.stuck = wanted && moved < dt * 0.4 ? f.stuck + dt : 0;
  void CELL;
}
