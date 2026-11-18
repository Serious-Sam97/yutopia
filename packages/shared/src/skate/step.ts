// The board's step (docs/plan/103-the-skate.md, phases 2–4): a mode of the walker's body, as the swim is — the
// same body, standing on something that rolls. Pure and deterministic: the client steps it at STEP_DT; others are
// drawn from its code on the wire (`skateCode`).
//
// Rolling: the board goes along its nose (or tail-first: fakie), pushed (W), slowed (S), carved (A/D), pulled by the
// slope. On the world's own ground the walker's mover (Jolt's) moves it — walls, kerbs, the land's slopes; on a
// park's piece it rides the piece's profile exactly (pieces.ts), so a vert wall is no harder than the flat. Space
// held crouches, let go ollies; off a vert lip it goes up and comes back in (Tony Hawk's). In the air: E a flip, R a
// grab (held), A/D a spin, F a grind or a wallride; landed clean, the tricks go in the combo; landed wrong, a bail.
// On a rail, a ledge, a coping: the grind, its balance held with A/D; W then S quickly a manual (S then W, a nose
// manual), its balance with W/S; F at a coping going up slowly, a lip trick; Q landing in a ramp, the revert.

import { JUMP_G } from "../jump.ts";
import type { Body, MoveEnv, MoveInput, StepEvents } from "../move/step.ts";
import { type OnSurface, type Placed, SkatePark, toWorld, wScale } from "./pieces.ts";
import { BOARD_FEEL, BOARD_VARIANTS, type BoardVariant, SKATE, shapeOf, underwheel } from "./spec.ts";
import {
  Combo,
  dirOf,
  FLIP_BY,
  GRAB_BY,
  GRIND_BY,
  LIP_BY,
  SLIDE_BY,
  SPECIALS,
  TRICK_IDS,
  TRICKS,
  type TrickDef,
  type TrickId,
  UPGRADE,
} from "./tricks.ts";

/** The keys a board reads (the client's, from its bindings: F3a). */
export interface SkateKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  upPressed: boolean;
  downPressed: boolean;
  leftPressed?: boolean;
  rightPressed?: boolean;
  /** Space: held crouches, let go ollies (pressed at a wall in the air: a wallplant) */
  ollie: boolean;
  olliePressed?: boolean;
  /** (docs/plan/104 F2a, Tony Hawk's PC layout) J a flip, L a grab (held), K a grind / lip / wallride (held catches),
   *  Q / E spin, Shift the revert and break vert (spine, acid), X off */
  flipPressed: boolean;
  grab: boolean;
  grabPressed: boolean;
  grind: boolean;
  grindPressed: boolean;
  spinL?: boolean;
  spinR?: boolean;
  brk?: boolean;
  breakPressed?: boolean;
  /** (plan 103's Q revert: the break's press now) */
  revertPressed?: boolean;
  offPressed: boolean;
}
export const NO_KEYS: SkateKeys = {
  up: false,
  down: false,
  left: false,
  right: false,
  upPressed: false,
  downPressed: false,
  ollie: false,
  flipPressed: false,
  grab: false,
  grabPressed: false,
  grind: false,
  grindPressed: false,
  revertPressed: false,
  offPressed: false,
  leftPressed: false,
  rightPressed: false,
  olliePressed: false,
  spinL: false,
  spinR: false,
  brk: false,
  breakPressed: false,
};

export type SkateMode = "roll" | "manual" | "air" | "grind" | "lip" | "wall";
export const SKATE_MODES: SkateMode[] = ["roll", "manual", "air", "grind", "lip", "wall"];

/** A trick in the air under way: which, how long in, how long it takes; a grab's held and its let go. */
export interface AirTrick {
  id: TrickId;
  t: number;
  len: number;
  double?: boolean;
  /** a grab: let go (s since), -1 still held */
  rel?: number;
}
export interface AirNow {
  t: number;
  spun: number;
  /** off a vert lip (Tony Hawk's: up and back in) */
  vert: boolean;
  /** going fakie when it left (the tricks count switch) */
  fakie: boolean;
  cur: AirTrick | null;
  done: { id: TrickId; double?: boolean; held?: number }[];
  /** the grind key pressed this long ago (a catch's buffer) */
  catch: number;
  /** a vert air: the plan way back into its ramp (the auto-turn's), the placed surface it left; vert broken (Shift: out
   *  over the top, a spine transfer); an acid drop called (Shift over a ramp) */
  inYaw?: number;
  fromPl?: number;
  broke?: boolean;
  acid?: boolean;
}
export interface Balance {
  bal: number;
  v: number;
}
export interface GrindNow extends Balance {
  id: TrickId;
  ux: number;
  uy: number;
  slope: number;
  what: string;
  across: boolean;
  t: number;
}
export interface LipNow extends Balance {
  id: TrickId;
  t: number;
  l: number;
}
export interface WallNow {
  nx: number;
  ny: number;
  t: number;
}

/** A body on a board. */
export interface SkateNow {
  variant: BoardVariant;
  /** 1 regular (the left foot forward), −1 goofy */
  stance: 1 | -1;
  mode: SkateMode;
  /** s in this mode */
  t: number;
  /** the speed along the nose (−: fakie); a grind's along the rail's way */
  s: number;
  /** on a park's piece (else the world's own ground, or the air) */
  on: OnSurface | null;
  /** the ground's normal under the board (the draw's) */
  n: [number, number, number];
  /** the board's slope under it, rise per metre along the nose (the world's ground: the mover's) */
  slope: number;
  /** Space held this long; a push's cycle (0..1) and whether it's pushing; the carve (−1 left … 1 right) */
  crouch: number;
  push: number;
  pushing: boolean;
  lean: number;
  /** how rough the ground under the wheels is (0 smooth … 1: the sound's) */
  rough: number;
  air: AirNow | null;
  grind: GrindNow | null;
  manual: (Balance & { id: TrickId }) | null;
  lip: LipNow | null;
  wall: WallNow | null;
  combo: Combo;
  /** s since it came down clean (the grace to link a manual or a revert), and down in a ramp */
  since: number;
  ramp: boolean;
  /** s since W and S were last pressed (the manual's taps) */
  lastUp: number;
  lastDown: number;
  /** (docs/plan/104) the special meter (points, full at SKATE.specialFull) and lit; the session's banked score; the
   *  combo's balance seconds (each balance harder by them), the last grind's id; the directions pressed lately (the
   *  specials'), the board's own clock; a powerslide on; no grind for this long (after a wallplant) */
  special: number;
  lit: boolean;
  score: number;
  balT: number;
  lastGrind: TrickId | null;
  dirs: { d: "u" | "d" | "l" | "r"; t: number }[];
  clock: number;
  cess: boolean;
  noGrind: number;
}

export interface SkateEvents {
  ollie?: boolean;
  /** came down: how hard (0..1), clean */
  land?: number;
  /** thrown off, and why */
  bail?: "trick" | "sideways" | "drop" | "balance" | "wall" | "snow";
  /** a trick begun (its id) */
  trick?: TrickId;
  /** a grind begun on (rail, coping, ledge) */
  grind?: string;
  /** the combo banked (landed clean and rolled on) or lost (a bail) */
  combo?: { name: string; score: number; count: number };
  lost?: { name: string; score: number; count: number };
  /** stepped off, at this speed */
  off?: number;
  revert?: boolean;
  /** a powerslide begun */
  cess?: boolean;
  /** a gap made (its name, points) */
  gap?: { name: string; pts: number };
}

/** The park a board asks about where it is (the pieces placed near), and the step's numbers. */
export interface SkateEnv {
  park: SkatePark;
  /** the step itself (this file's `stepSkate`), handed in with the park */
  step: (b: Body, inp: MoveInput, env: MoveEnv, dt: number, ev: StepEvents) => StepEvents;
}
/** A skate env for a park. */
export const skateEnv = (park: SkatePark): SkateEnv => ({ park, step: stepSkate });

const EMPTY_PARK = new SkatePark([]);

/** On a board, from standing (its speed along `yaw` the body's own). */
export function startSkate(
  b: Body,
  variant: BoardVariant,
  stance: 1 | -1 = 1,
  carry?: { special: number; lit: boolean; score: number },
): SkateNow {
  const s = b.vx * Math.cos(b.yaw) + b.vy * Math.sin(b.yaw);
  const k: SkateNow = {
    variant,
    stance,
    mode: b.up ? "air" : "roll",
    t: 0,
    s: Math.max(0, s),
    on: null,
    n: [0, 0, 1],
    slope: 0,
    crouch: 0,
    push: 0,
    pushing: false,
    lean: 0,
    rough: 0,
    air: b.up ? newAir(false, false) : null,
    grind: null,
    manual: null,
    lip: null,
    wall: null,
    combo: new Combo(),
    since: 0,
    ramp: false,
    lastUp: 9,
    lastDown: 9,
    special: carry?.special ?? 0,
    lit: carry?.lit ?? false,
    score: carry?.score ?? 0,
    balT: 0,
    lastGrind: null,
    dirs: [],
    clock: 0,
    cess: false,
    noGrind: 0,
  };
  // (docs/plan/104, the board's direction: rolling forward along the way she faces, at her speed that way — never
  // across it, never fakie from a sideways step)
  b.vx = Math.cos(b.yaw) * k.s;
  b.vy = Math.sin(b.yaw) * k.s;
  b.skate = k;
  b.verb = null;
  b.flow = null;
  b.swim = null;
  b.takeoff = -1;
  b.jump = null;
  return k;
}

const newAir = (vert: boolean, fakie: boolean): AirNow => ({
  t: 0,
  spun: 0,
  vert,
  fakie,
  cur: null,
  done: [],
  catch: 9,
});

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** A heading turned toward another by at most `max` (rad), the short way. */
function turnToward(from: number, to: number, max: number): number {
  const d = wrap(to - from);
  return Math.abs(d) <= max ? to : wrap(from + Math.sign(d) * max);
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The frame on a placed surface at (ℓ, w): the point, the tangent up ℓ, the way across, the normal. */
export function surfFrame(p: Placed, l: number, w: number) {
  const pt = p.s.prof.at(l);
  const q = toWorld(p, pt.u, w);
  const T: [number, number, number] = [pt.tu * q.ux, pt.tu * q.uy, pt.tz];
  const W: [number, number, number] = [q.wx, q.wy, 0];
  const N: [number, number, number] = [-pt.tz * q.ux, -pt.tz * q.uy, pt.tu];
  return { x: q.x, y: q.y, z: p.oz + pt.z, T, W, N, ux: q.ux, uy: q.uy, wx: q.wx, wy: q.wy, u: pt.u, tz: pt.tz };
}

/** The board's nose on a surface frame: its share along the tangent and across (unit), and in the world. */
function noseOn(yaw: number, f: ReturnType<typeof surfFrame>) {
  const cx = Math.cos(yaw);
  const cy = Math.sin(yaw);
  let fu = cx * f.ux + cy * f.uy;
  let fw = cx * f.wx + cy * f.wy;
  const n = Math.hypot(fu, fw) || 1;
  fu /= n;
  fw /= n;
  const F: [number, number, number] = [fu * f.T[0] + fw * f.W[0], fu * f.T[1] + fw * f.W[1], fu * f.T[2]];
  return { fu, fw, F };
}

/** One step on a board. The body's x, y, z are the board's contact; vx, vy, vz its velocity; yaw its nose. */
export function stepSkate(b: Body, inp: MoveInput, env: MoveEnv, dt: number, ev: StepEvents): StepEvents {
  const k = b.skate as SkateNow;
  const keys = inp.skate ?? NO_KEYS;
  const park = env.skate?.park ?? EMPTY_PARK;
  ev.skate ??= {};
  const sev: SkateEvents = ev.skate;
  b.t += dt;
  k.t += dt;
  k.lastUp = keys.upPressed ? 0 : k.lastUp + dt;
  k.lastDown = keys.downPressed ? 0 : k.lastDown + dt;
  k.clock += dt;
  k.noGrind = Math.max(0, k.noGrind - dt);
  // (the directions pressed lately: a special's two)
  for (const [on, d] of [
    [keys.upPressed, "u"],
    [keys.downPressed, "d"],
    [keys.leftPressed, "l"],
    [keys.rightPressed, "r"],
  ] as const)
    if (on) k.dirs.push({ d, t: k.clock });
  while (k.dirs.length && k.clock - k.dirs[0].t > SKATE.specialWindow) k.dirs.shift();
  // the special meter: lit, it drains (~15 s); unlit, it ebbs
  if (k.lit) {
    k.special -= SKATE.specialDrain * dt;
    if (k.special <= 0) {
      k.special = 0;
      k.lit = false;
    }
  } else k.special = Math.max(0, k.special - SKATE.specialDecay * dt);
  // (a manual's taps: W then S, S then W)
  const manualTap: TrickId | null =
    keys.downPressed && k.lastUp > 0 && k.lastUp < SKATE.tap
      ? "manual"
      : keys.upPressed && k.lastDown > 0 && k.lastDown < SKATE.tap
        ? "nosemanual"
        : null;

  if (keys.offPressed && (k.mode === "roll" || k.mode === "manual")) {
    sev.off = Math.abs(k.s);
    bank(k, sev);
    b.skate = null;
    b.gait = "still";
    return ev;
  }

  switch (k.mode) {
    case "roll":
    case "manual":
      roll(b, k, keys, env, park, dt, sev, manualTap);
      break;
    case "air":
      air(b, k, keys, env, park, dt, sev, manualTap);
      break;
    case "grind":
      grind(b, k, keys, env, park, dt, sev);
      break;
    case "lip":
      lip(b, k, keys, park, dt, sev);
      break;
    case "wall":
      wall(b, k, keys, env, park, dt, sev);
      break;
  }
  b.gait = "still";
  return ev;
}

function setMode(k: SkateNow, m: SkateMode) {
  k.mode = m;
  k.t = 0;
}

function bank(k: SkateNow, sev: SkateEvents) {
  k.combo.settle();
  if (k.combo.count > 0) {
    const score = k.combo.score;
    sev.combo = { name: k.combo.name, score, count: k.combo.count };
    k.score += score;
    // (the special fills by what the combo paid: lit at full)
    if (!k.lit) {
      k.special = Math.min(SKATE.specialFull, k.special + score);
      if (k.special >= SKATE.specialFull) k.lit = true;
    }
  }
  k.combo.clear();
  k.balT = 0;
  k.lastGrind = null;
}

/** Thrown off: the walker's body again, its speed kept (the client's ragdoll takes it). */
function bail(b: Body, k: SkateNow, sev: SkateEvents, why: NonNullable<SkateEvents["bail"]>) {
  sev.bail = why;
  k.combo.settle();
  if (k.combo.count > 0) sev.lost = { name: k.combo.name, score: k.combo.score, count: k.combo.count };
  k.combo.clear();
  // (a bail empties the special)
  k.special = 0;
  k.lit = false;
  b.skate = null;
  b.up = b.vz > 0.5 || b.up;
}

/** The ollie's take-off speed for a crouch held this long. */
function popOf(k: SkateNow, share = 1): number {
  const c = clamp(k.crouch / SKATE.crouch, 0, 1);
  const h = (SKATE.ollieTap + (SKATE.ollie - SKATE.ollieTap) * c) * BOARD_FEEL[shapeOf(k.variant)].pop * share;
  return Math.sqrt(2 * SKATE.g * h);
}

/** Into the air with this velocity (and a pop up the normal). */
function takeOff(b: Body, k: SkateNow, v: [number, number, number], vert: boolean) {
  b.vx = v[0];
  b.vy = v[1];
  b.vz = v[2];
  b.up = true;
  k.on = null;
  k.grind = null;
  k.lip = null;
  k.wall = null;
  k.crouch = 0;
  if (k.manual) {
    k.combo.settle();
    k.manual = null;
  }
  k.air = newAir(vert, k.s < 0);
  setMode(k, "air");
}

// ── rolling ──────────────────────────────────────────────────────────────────────────────────────────────

function roll(
  b: Body,
  k: SkateNow,
  keys: SkateKeys,
  env: MoveEnv,
  park: SkatePark,
  dt: number,
  sev: SkateEvents,
  manualTap: TrickId | null,
) {
  const feel = BOARD_FEEL[shapeOf(k.variant)];
  const foot = underwheel(k.on ? "floor" : env.footing(b.x, b.y));
  k.since += dt;
  k.rough = foot.rough;
  const speed = Math.abs(k.s);

  // the carve: tighter the slower, a kick turn at a crawl
  const turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const rate = speed < 1 ? SKATE.pivot : Math.min(SKATE.turnMax, speed / SKATE.radius);
  if (k.mode !== "manual" || turn) b.yaw = wrap(b.yaw + turn * rate * feel.turn * dt);
  k.lean += (turn * Math.min(1, speed / 4) - k.lean) * Math.min(1, dt * 8);

  // the frame under the board: a piece's, or the world's flat-ish ground
  let F: [number, number, number];
  let tz = 0;
  if (k.on) {
    const p = park.placed[k.on.pl];
    const f = surfFrame(p, k.on.l, k.on.w);
    F = noseOn(b.yaw, f).F;
    k.n = f.N;
    tz = Math.abs(f.tz);
  } else {
    const sl = k.slope;
    const n = Math.hypot(1, sl);
    F = [Math.cos(b.yaw) / n, Math.sin(b.yaw) / n, sl / n];
    k.n = [0, 0, 1];
  }

  // the speed: the slope's pull (the ramps' and the land's), a push (W) or the auto-kick at a crawl (you never
  // stall), the brake or a powerslide (S), the ground's loss, the air's
  let a = -SKATE.gRamp * F[2];
  const lit = k.lit ? SKATE.litSpeed : 1;
  const flat = tz < 0.3;
  const want = keys.up ? SKATE.push * feel.speed * lit : speed < SKATE.kickMin ? SKATE.kick : 0;
  const pushing = k.mode === "roll" && !keys.down && flat && speed < want;
  k.pushing = pushing && foot.push > 0;
  if (k.pushing) {
    a += Math.sign(k.s || 1) * SKATE.pushAccel * foot.push;
    k.push = (k.push + dt / SKATE.pushCycle) % 1;
  } else k.push = 0;
  // (pumping: the crouch held going down a ramp)
  if (k.on && keys.ollie && F[2] * Math.sign(k.s) < -0.2) a += Math.sign(k.s) * SKATE.pump;
  let loss = SKATE.roll + foot.loss * feel.rough + SKATE.drag * k.s * k.s;
  // S: at speed a powerslide (the board across, scrubbing — the one way it goes sideways), slower the brake
  const cess = keys.down && k.mode === "roll" && !manualTap && speed > SKATE.cessFrom && flat;
  if (cess && !k.cess) {
    sev.trick = "powerslide";
    sev.cess = true;
  }
  k.cess = cess;
  if (keys.down && k.mode === "roll" && !manualTap) loss += cess ? SKATE.cess : SKATE.brake;
  k.s += a * dt;
  if (Math.abs(k.s) > 1e-6) {
    const d = Math.min(Math.abs(k.s), loss * dt);
    k.s -= Math.sign(k.s) * d;
  }
  k.s = clamp(k.s, -SKATE.top * lit, SKATE.top * lit);

  // deep snow, sand: the board stops dead (on the move, she's thrown)
  if (foot.stop && !k.on) {
    if (speed > 2) {
      b.vx = Math.cos(b.yaw) * k.s;
      b.vy = Math.sin(b.yaw) * k.s;
      b.vz = 1.5;
      return bail(b, k, sev, "snow");
    }
    k.s = 0;
  }

  // the manual: in from a W–S tap (or still going), its balance on W / S
  if (k.mode === "roll" && manualTap && speed > 1.2 && !k.on) startManual(k, manualTap, sev);
  if (k.mode === "manual" && k.manual) {
    const m = k.manual;
    const into = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    k.balT += dt;
    if (!balance(m, k.t, into, dt, m.id === "manual" ? 1 : -1, k.balT)) return bail(b, k, sev, "balance");
    k.combo.grow(m.id, k.t, { switch: k.s < 0 });
    if (speed < 0.6 || k.on) {
      k.combo.settle();
      k.manual = null;
      setMode(k, "roll");
      k.since = SKATE.grace;
    }
  } else if (k.combo.count > 0 && k.since > SKATE.grace) bank(k, sev);

  // the revert: Q just after coming down in a ramp — the board turned round on its wheels
  if ((keys.breakPressed || keys.revertPressed) && k.ramp && k.since < SKATE.revert && k.mode === "roll") {
    b.yaw = wrap(b.yaw + Math.PI);
    k.s = -k.s;
    k.combo.add("revert", {});
    k.since = 0;
    k.ramp = false;
    sev.revert = true;
    sev.trick = "revert";
  }

  // a lip trick: F at a coping, going up to it slowly
  if (k.on && keys.grindPressed && k.mode === "roll") {
    const p = park.placed[k.on.pl];
    for (const cop of p.s.prof.copings) {
      const f = surfFrame(p, k.on.l, k.on.w);
      const up = noseOn(b.yaw, f).fu * k.s;
      if (Math.abs(k.on.l - cop) < SKATE.lipNear && up > 0 && speed < SKATE.lipSpeed) {
        const id = LIP_BY[dirOf(keys.up, keys.down, keys.left, keys.right)];
        k.lip = { id, t: 0, l: cop, bal: 0, v: 0 };
        k.on.l = cop;
        k.s = 0;
        setMode(k, "lip");
        k.combo.grow(id, 0, { switch: up < 0 });
        sev.trick = id;
        return;
      }
    }
  }

  // the ollie: Space held crouches, let go pops (up the ground's normal)
  if (keys.ollie) k.crouch += dt;
  else if (k.crouch > 0) {
    const pop = popOf(k);
    const v: [number, number, number] = [
      F[0] * k.s + k.n[0] * pop,
      F[1] * k.s + k.n[1] * pop,
      F[2] * k.s + k.n[2] * pop,
    ];
    if (k.mode === "manual") {
      k.combo.settle();
      k.manual = null;
    }
    sev.ollie = true;
    b.z += 0.01;
    return takeOff(b, k, v, false);
  }

  if (k.on) rideOn(b, k, env, park, dt, F, !!keys.brk);
  else rideGround(b, k, env, park, dt, sev);
}

function startManual(k: SkateNow, id: TrickId, sev: SkateEvents) {
  k.manual = { id, bal: 0, v: 0 };
  setMode(k, "manual");
  k.combo.grow(id, 0, { switch: k.s < 0 });
  sev.trick = id;
}

/** A balance needle (Neversoft's CManual: an inverted pendulum): it tips the way it leans, the harder the more
 *  seconds of balance this combo has had (`hardT` — carried over from grind to manual to lip); the keys push its
 *  drift back; sat too still, it's nudged. False: off. */
function balance(m: Balance, t: number, into: number, dt: number, sign = 1, hardT = t): boolean {
  // (a drift of its own, the same on every machine: two slow waves)
  const drift = 0.55 * Math.sin(t * 1.9 + 0.7) + 0.35 * Math.sin(t * 3.3 + 2.1);
  const hard = 1 + SKATE.hard * hardT;
  m.v += (SKATE.tip * m.bal + drift) * hard * dt - into * sign * SKATE.hold * dt;
  if (Math.abs(m.v) < 0.02 && Math.abs(m.bal) < 0.05) m.v += (Math.sin(t * 7.7) >= 0 ? 1 : -1) * SKATE.nudge * dt;
  m.v *= Math.max(0, 1 - SKATE.damp * dt);
  m.bal += m.v * dt;
  return Math.abs(m.bal) < 1;
}

/** On a piece: along its profile and across it, off its ends to the next piece, the ground or the air. */
function rideOn(
  b: Body,
  k: SkateNow,
  env: MoveEnv,
  park: SkatePark,
  dt: number,
  F: [number, number, number],
  brk = false,
) {
  const on = k.on as OnSurface;
  const p = park.placed[on.pl];
  const f0 = surfFrame(p, on.l, on.w);
  const nose = noseOn(b.yaw, f0);
  const dl = nose.fu * k.s * dt;
  const dw = (nose.fw * k.s * dt) / wScale(p, f0.u);
  const l1 = on.l + dl;
  const w1 = on.w + dw;
  const prof = p.s.prof;

  // over a coping going up: off the lip (a vert lip: straight up, back in)
  for (const cop of prof.copings) {
    if (on.l < cop - 1e-6 && l1 >= cop - 1e-6) {
      const at = surfFrame(p, cop - 1e-3, on.w);
      if (at.tz >= SKATE.vertLip) {
        const across = nose.fw * k.s;
        const fromPl = on.pl;
        // vert broken (Shift held: out over the top — onto the deck, or over a spine to its far face): the speed as it is
        if (brk) {
          setPos(b, at.x, at.y, at.z + 0.02);
          k.n = at.N;
          const v: [number, number, number] = [F[0] * k.s, F[1] * k.s, F[2] * k.s];
          // (over the top: the way up turned a little out, so it clears the coping)
          const out = Math.max(1.5, Math.abs(k.s) * 0.25);
          v[0] += at.ux * out;
          v[1] += at.uy * out;
          takeOff(b, k, v, false);
          if (k.air) {
            k.air.broke = true;
            k.air.fromPl = fromPl;
          }
          return;
        }
        // Tony Hawk's vert assist: straight up (its speed kept, to a most), turned back to face in, back down
        const up = Math.min(SKATE.vertMax, Math.abs(nose.fu * k.s) * at.tz * SKATE.vertBoost);
        // (nudged back in, over the ramp: it comes down on its face)
        b.x = at.x - at.ux * 0.08;
        b.y = at.y - at.uy * 0.08;
        b.z = at.z;
        k.n = at.N;
        takeOff(b, k, [at.W[0] * across, at.W[1] * across, up], true);
        if (k.air) {
          k.air.inYaw = Math.atan2(-at.uy, -at.ux);
          k.air.fromPl = fromPl;
        }
        return;
      }
    }
  }
  if (l1 >= 0 && l1 <= prof.total && w1 >= p.s.w0 && w1 <= p.s.w1) {
    on.l = l1;
    on.w = w1;
    const f = surfFrame(p, l1, w1);
    setPos(b, f.x, f.y, f.z);
    const v = noseOn(b.yaw, f).F;
    b.vx = v[0] * k.s;
    b.vy = v[1] * k.s;
    b.vz = v[2] * k.s;
    return;
  }
  // off an end: where it would be
  const nx = b.x + F[0] * k.s * dt;
  const ny = b.y + F[1] * k.s * dt;
  const nz = b.z + F[2] * k.s * dt;
  const next = park.topAt(nx, ny, nz + 0.1, 0.02);
  if (next && Math.abs(next.z - nz) < 0.15) {
    k.on = next.on;
    setPos(b, nx, ny, next.z);
    return;
  }
  const ground = env.grid.groundAt(nx, ny, nz + 0.1);
  if (Math.abs(ground - nz) < 0.15 && Math.abs(F[2]) < 0.35) {
    k.on = null;
    k.slope = 0;
    setPos(b, nx, ny, ground);
    return;
  }
  // (off the back of a deck, off a kicker's top, off a box's side: the air)
  setPos(b, nx, ny, nz);
  takeOff(b, k, [F[0] * k.s, F[1] * k.s, F[2] * k.s], false);
}

function setPos(b: Body, x: number, y: number, z: number) {
  b.x = x;
  b.y = y;
  b.z = z;
}

/** On the world's own ground: the mover (Jolt's) or the grid's way; onto a piece where one starts; a wall. */
function rideGround(b: Body, k: SkateNow, env: MoveEnv, park: SkatePark, dt: number, sev: SkateEvents) {
  const cx = Math.cos(b.yaw);
  const cy = Math.sin(b.yaw);
  const nx = b.x + cx * k.s * dt;
  const ny = b.y + cy * k.s * dt;
  // onto a piece (its foot level with the ground) — or into its side
  const onto = park.topAt(nx, ny, b.z + SKATE.stepUp + 0.02, 0);
  if (onto && onto.z >= b.z - 0.12) {
    k.on = onto.on;
    setPos(b, nx, ny, onto.z);
    return;
  }
  if (park.wallAt(nx, ny, b.z, SKATE.stepUp)) return knock(b, k, sev);
  const x0 = b.x;
  const y0 = b.y;
  const z0 = b.z;
  b.vx = cx * k.s;
  b.vy = cy * k.s;
  b.vz = 0;
  let fell = false;
  if (env.mover && (env.mover.ready?.(b.x, b.y) ?? true)) {
    b.up = false;
    env.mover.step(b, dt, SKATE.stepUp, env.blocked);
    fell = b.up;
  } else {
    const g = env.grid;
    if (g.clear({ x: b.x, y: b.y }, { x: nx, y: ny }, 0.25, b.z + 0.02) && !env.blocked?.(nx, ny)) {
      b.x = nx;
      b.y = ny;
    }
    const h = g.groundAt(b.x, b.y, b.z + SKATE.stepUp);
    if (h < b.z - 0.08) fell = true;
    else b.z = h;
  }
  const want = Math.abs(k.s) * dt;
  const went = Math.hypot(b.x - x0, b.y - y0);
  if (want > 1e-4 && went < want * 0.5 && !fell) {
    b.x = x0;
    b.y = y0;
    b.z = z0;
    return knock(b, k, sev);
  }
  // the slope by the way it went (smoothed: the land's facets)
  if (went > 1e-4 && !fell) k.slope += ((b.z - z0) / went - k.slope) * Math.min(1, dt * 10) * Math.sign(k.s || 1);
  if (fell) {
    // (off a kerb, a step, a ledge: rolled off into the air)
    takeOff(b, k, [cx * k.s, cy * k.s, Math.min(0, b.vz)], false);
  }
}

/** Into a wall: fast, a bail; slow, knocked back. */
function knock(b: Body, k: SkateNow, sev: SkateEvents) {
  if (Math.abs(k.s) > SKATE.bailWall) {
    b.vx = -Math.cos(b.yaw) * k.s * 0.2;
    b.vy = -Math.sin(b.yaw) * k.s * 0.2;
    b.vz = 0;
    return bail(b, k, sev, "wall");
  }
  k.s = -k.s * 0.25;
  b.vx = 0;
  b.vy = 0;
}

// ── the air ──────────────────────────────────────────────────────────────────────────────────────────────

function air(
  b: Body,
  k: SkateNow,
  keys: SkateKeys,
  env: MoveEnv,
  park: SkatePark,
  dt: number,
  sev: SkateEvents,
  manualTap: TrickId | null,
) {
  k.air ??= newAir(false, false);
  const A = k.air;
  const feel = BOARD_FEEL[shapeOf(k.variant)];
  A.t += dt;
  A.catch = keys.grindPressed ? 0 : A.catch + dt;
  const dir = dirOf(keys.up, keys.down, keys.left, keys.right);

  // the spin (Q / E held: Tony Hawk's spin keys — A/D are the tricks' directions in the air); off a vert lip with no
  // spin asked, the auto-turn back to face into the ramp (not a spin: it isn't counted)
  const spin = (keys.spinR ? 1 : 0) - (keys.spinL ? 1 : 0);
  if (spin) {
    b.yaw = wrap(b.yaw + spin * SKATE.spin * dt);
    A.spun += SKATE.spin * dt;
  } else if (A.vert && A.inYaw !== undefined && A.spun < 0.3) {
    b.yaw = turnToward(b.yaw, A.inYaw, SKATE.autoturn * dt);
  }
  // Shift in the air over a ramp: an acid drop called
  if (keys.breakPressed && !A.vert) A.acid = true;
  // Space at a wall in the air: a wallplant — kicked off it, up, out
  if (keys.olliePressed && env.flow && A.t > 0.08) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 1) {
      const w = env.flow.wall(b.x, b.y, b.z, b.vx / sp, b.vy / sp, 0.7);
      if (w) {
        const into = b.vx * w.nx + b.vy * w.ny;
        b.vx += (-into + SKATE.plantOut) * w.nx;
        b.vy += (-into + SKATE.plantOut) * w.ny;
        b.vz = Math.max(b.vz, SKATE.plantUp);
        b.yaw = wrap(b.yaw + Math.PI);
        A.done.push({ id: "wallplant" });
        k.noGrind = SKATE.plantNoGrind;
        sev.trick = "wallplant";
        sev.ollie = true;
      }
    }
  }

  // the tricks: J a flip (again quickly, its upgrade), L a grab held (again, its upgrade), let go; lit, two
  // directions just before the key: a special
  const c = A.cur;
  const special = (key: "flip" | "grab" | "grind"): TrickId | null => {
    if (!k.lit || k.dirs.length < 2) return null;
    const [a1, a2] = [k.dirs[k.dirs.length - 2].d, k.dirs[k.dirs.length - 1].d];
    const sp = SPECIALS.find((x) => x.key === key && x.dirs[0] === a1 && x.dirs[1] === a2);
    if (!sp) return null;
    k.dirs = [];
    return sp.id;
  };
  if (keys.flipPressed) {
    const kind = c ? (TRICKS[c.id] as TrickDef).kind : null;
    if (c && kind === "flip" && !c.double && c.t < c.len * 0.6) {
      const up = UPGRADE[c.id];
      if (up) {
        c.id = up;
        c.len = TRICKS[up].len / feel.flip;
      } else {
        c.double = true;
        c.len *= 1.6;
      }
      sev.trick = c.id;
    } else if (!c) {
      const id = special("flip") ?? FLIP_BY[dir];
      A.cur = { id, t: 0, len: TRICKS[id].len / feel.flip };
      sev.trick = id;
    }
  } else if (keys.grabPressed) {
    const up = c ? UPGRADE[c.id] : undefined;
    if (c && up && (TRICKS[c.id] as TrickDef).kind === "grab" && c.rel === -1) {
      c.id = up;
      c.len = Math.max(c.len, TRICKS[up].len);
      sev.trick = up;
    } else if (!c) {
      const id = special("grab") ?? GRAB_BY[dir];
      A.cur = { id, t: 0, len: TRICKS[id].len, rel: -1 };
      sev.trick = id;
    }
  }
  const cur = A.cur;
  if (cur) {
    cur.t += dt;
    const grab = (TRICKS[cur.id] as TrickDef).kind === "grab";
    if (grab) {
      if (cur.rel === -1 && !keys.grab && cur.t >= cur.len) cur.rel = 0;
      else if ((cur.rel ?? -1) >= 0) cur.rel = (cur.rel as number) + dt;
      if ((cur.rel ?? -1) >= 0.12) {
        A.done.push({ id: cur.id, held: Math.max(0, cur.t - cur.len - (cur.rel as number)) });
        A.cur = null;
      }
    } else if (cur.t >= cur.len) {
      A.done.push({ id: cur.id, double: cur.double });
      A.cur = null;
    }
  }

  // a grind: K (held, or pressed a moment ago) over a rail, a ledge, a coping — caught only in the air
  if ((keys.grind || A.catch < 0.2) && !A.cur && k.noGrind <= 0) {
    const r = railNear(env, park, b.x, b.y, b.z, SKATE.reach);
    // (and room left along it the way it's going: not caught again on the end just ground off)
    const left = r ? (b.vx * r.ux + b.vy * r.uy >= 0 ? r.ahead : r.back) : 0;
    if (r && left > 0.3 && b.z >= r.z - SKATE.over && b.z <= r.z + SKATE.over && (b.vz <= 0.5 || b.z <= r.z + 0.1)) {
      landTricks(k, A);
      return startGrind(b, k, r, dir, sev, special("grind"));
    }
    // a wallride: at a wall, in the air
    if (A.catch < 0.2 && env.flow) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 2) {
        const w = env.flow.wall(b.x, b.y, b.z, b.vx / sp, b.vy / sp, 0.6);
        if (w && w.top > b.z + 0.8) {
          landTricks(k, A);
          k.wall = { nx: w.nx, ny: w.ny, t: 0 };
          // (along the wall: the way into it taken off)
          const into = b.vx * w.nx + b.vy * w.ny;
          b.vx -= into * w.nx;
          b.vy -= into * w.ny;
          b.vz = Math.max(b.vz, 1.6);
          k.air = null;
          setMode(k, "wall");
          k.combo.grow("wallride", 0);
          sev.trick = "wallride";
          return;
        }
      }
    }
  }

  // moving: over a park's pieces our own (their faces exact); elsewhere the mover (Jolt's world)
  const x0 = b.x;
  const y0 = b.y;
  const z0 = b.z;
  const overPark = park.near(b.x, b.y).length > 0 || park.near(b.x + b.vx * dt, b.y + b.vy * dt).length > 0;
  let landedWorld = false;
  if (!overPark && env.mover && (env.mover.ready?.(b.x, b.y) ?? true)) {
    // (the mover pulls by JUMP_G: the board's own pull made up to it)
    b.vz += (JUMP_G - (A.vert ? SKATE.gVert : SKATE.g)) * dt;
    const vz0 = b.vz;
    b.up = true;
    landedWorld = env.mover.step(b, dt, 0, env.blocked);
    if (landedWorld) b.vz = vz0 - JUMP_G * dt;
  } else {
    b.vz -= (A.vert ? SKATE.gVert : SKATE.g) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
  }
  // down on a piece
  const top = park.topAt(b.x, b.y, Math.max(z0, b.z) + 0.02, 0);
  if (top && b.z <= top.z && b.vz <= 0) {
    k.on = top.on;
    b.z = top.z;
    const p = park.placed[top.on.pl];
    const f = surfFrame(p, top.on.l, top.on.w);
    return land(b, k, A, f.N, f.T, f.W, f.ux, f.uy, f.wx, f.wy, dt, sev, manualTap, Math.abs(f.N[2]) < 0.97);
  }
  if (!overPark && !env.mover) {
    const g = env.grid.groundAt(b.x, b.y, z0 + 0.02);
    if (b.z <= g && b.vz <= 0) {
      b.z = g;
      landedWorld = true;
    }
  }
  if (landedWorld) {
    k.on = null;
    k.slope = 0;
    return land(b, k, A, [0, 0, 1], [1, 0, 0], [0, 1, 0], 1, 0, 0, 1, dt, sev, manualTap, false);
  }
  // (fell far below everything: the world's floor reached by the mover's way only)
  void x0;
  void y0;
}

/** The air's tricks that are done counted (a grind or a wall caught from the air: they're landed). */
function landTricks(k: SkateNow, A: AirNow) {
  let first = true;
  for (const d of A.done) {
    k.combo.add(d.id, { spin: first ? A.spun : 0, switch: A.fakie, double: d.double, held: d.held });
    first = false;
  }
  if (A.done.length === 0 && A.spun > Math.PI * 0.9) k.combo.add("air", { spin: A.spun, switch: A.fakie });
  A.done = [];
  A.spun = 0;
}

/** Down on a surface (normal N, its tangent T up the profile and W across, their plan ways). */
function land(
  b: Body,
  k: SkateNow,
  A: AirNow,
  N: [number, number, number],
  T: [number, number, number],
  W: [number, number, number],
  ux: number,
  uy: number,
  wx: number,
  wy: number,
  dt: number,
  sev: SkateEvents,
  manualTap: TrickId | null,
  ramp: boolean,
) {
  void dt;
  const v: [number, number, number] = [b.vx, b.vy, b.vz];
  const vn = v[0] * N[0] + v[1] * N[1] + v[2] * N[2];
  const impact = clamp(-vn / SKATE.hardest, 0, 1);
  // a trick not done (a flip still turning, a grab still held)
  if (A.cur) return bail(b, k, sev, "trick");
  if (-vn > SKATE.hardest) return bail(b, k, sev, "drop");
  // the board against the way it goes, on the surface (its tangent plane: (T, W))
  const vt = v[0] * T[0] + v[1] * T[1] + v[2] * T[2];
  const vw = v[0] * W[0] + v[1] * W[1] + v[2] * W[2];
  const sT = Math.hypot(vt, vw);
  const cx = Math.cos(b.yaw);
  const cy = Math.sin(b.yaw);
  let fu = cx * ux + cy * uy;
  let fw = cx * wx + cy * wy;
  const fn = Math.hypot(fu, fw) || 1;
  fu /= fn;
  fw /= fn;
  let s = 0;
  if (sT > 1.2) {
    const cos = (fu * vt + fw * vw) / sT;
    const off = Math.acos(clamp(cos, -1, 1));
    const fakie = off > Math.PI / 2;
    const offA = fakie ? Math.PI - off : off;
    if (offA > SKATE.sideways) return bail(b, k, sev, "sideways");
    // (Tony Hawk's: the board set straight with the way it goes)
    const dtn = (fakie ? -1 : 1) / sT;
    const du = vt * dtn;
    const dw = vw * dtn;
    b.yaw = Math.atan2(du * uy + dw * wy, du * ux + dw * wx);
    s = (fakie ? -1 : 1) * sT * (1 - 0.2 * (offA / SKATE.sideways));
  } else s = 0;
  k.s = s;
  k.n = N;
  b.up = false;
  b.vz = 0;
  // (the glue that's the landing's own: over a spine onto its far face, vert broken; an acid drop onto a ramp's face)
  if (A.broke && k.on && A.fromPl !== undefined && k.on.pl !== A.fromPl) A.done.push({ id: "spine" });
  else if (A.acid && ramp && k.on) A.done.push({ id: "acid" });
  landTricks(k, A);
  k.air = null;
  k.since = 0;
  k.ramp = ramp;
  setMode(k, "roll");
  sev.land = impact;
  // a manual pressed for as it came down: in it, the combo going on
  const buffered =
    manualTap ??
    (k.lastUp < SKATE.tap && k.lastDown < SKATE.tap ? (k.lastUp > k.lastDown ? "manual" : "nosemanual") : null);
  if (buffered && !ramp && Math.abs(s) > 1.2) startManual(k, buffered, sev);
}

// ── rails ────────────────────────────────────────────────────────────────────────────────────────────────

interface RailHit {
  x: number;
  y: number;
  z: number;
  ux: number;
  uy: number;
  back: number;
  ahead: number;
  slope: number;
  what: string;
}

/** The nearest rail, ledge or coping: the park's lines, and Flowmotion's tagged rails (the town's fences, the
 *  parkour rails: flat). */
function railNear(env: MoveEnv, park: SkatePark, x: number, y: number, z: number, reach: number): RailHit | null {
  const a = park.line(x, y, z, reach);
  const f = env.flow?.rail(x, y, z, reach) ?? null;
  if (a && f)
    return Math.hypot(a.x - x, a.y - y) <= Math.hypot(f.x - x, f.y - y) ? a : { ...f, slope: 0, what: "rail" };
  return a ?? (f ? { ...f, slope: 0, what: "rail" } : null);
}

function startGrind(
  b: Body,
  k: SkateNow,
  r: RailHit,
  dir: ReturnType<typeof dirOf>,
  sev: SkateEvents,
  special: TrickId | null = null,
) {
  const railYaw = Math.atan2(r.uy, r.ux);
  const off = Math.abs(wrap(b.yaw - railYaw));
  const offA = Math.min(off, Math.PI - off);
  const across = offA > (50 * Math.PI) / 180;
  const id = special ?? (across ? SLIDE_BY[dir] : GRIND_BY[dir]);
  // (the same grind again in the combo: harder; a new one, a little easier — Same_Grind_Add_Time, New_Grind_Sub_Time)
  k.balT = Math.max(0, k.balT + (k.lastGrind === id ? SKATE.sameAdd : -SKATE.newSub));
  k.lastGrind = id;
  // its speed along the rail (at least the grind's own), and the rail's boost (grinds speed you up)
  let s = b.vx * r.ux + b.vy * r.uy;
  if (Math.abs(s) < SKATE.grindMin) s = (s < 0 ? -1 : 1) * SKATE.grindMin;
  s += Math.sign(s) * SKATE.grindBoost;
  // the board along the rail (its nose the nearer way) or across it
  if (across) b.yaw = wrap(railYaw + (wrap(b.yaw - railYaw) > 0 ? Math.PI / 2 : -Math.PI / 2));
  else b.yaw = off < Math.PI / 2 ? railYaw : wrap(railYaw + Math.PI);
  k.grind = { id, ux: r.ux, uy: r.uy, slope: r.slope, what: r.what, across, t: 0, bal: 0, v: 0 };
  k.s = s;
  k.air = null;
  b.x = r.x;
  b.y = r.y;
  b.z = r.z;
  b.up = false;
  b.vz = 0;
  setMode(k, "grind");
  k.combo.grow(id, 0, { switch: false });
  sev.trick = id;
  sev.grind = r.what;
}

function grind(b: Body, k: SkateNow, keys: SkateKeys, env: MoveEnv, park: SkatePark, dt: number, sev: SkateEvents) {
  const g = k.grind as GrindNow;
  g.t += dt;
  // the balance: A / D (the board's left and right as it goes)
  const into = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * (k.s < 0 ? -1 : 1);
  k.balT += dt;
  if (!balance(g, g.t, into, dt, 1, k.balT)) {
    b.vx = g.ux * k.s;
    b.vy = g.uy * k.s;
    return bail(b, k, sev, "balance");
  }
  k.combo.grow(g.id, g.t);
  // another grind on the same rail: F and a direction again
  if (keys.grindPressed && g.t > 0.15) {
    const dir = dirOf(keys.up, keys.down, keys.left, keys.right);
    const id = g.across ? SLIDE_BY[dir] : GRIND_BY[dir];
    if (id !== g.id) {
      k.combo.settle();
      g.id = id;
      g.t = 0;
      k.combo.grow(id, 0);
      sev.trick = id;
    }
  }
  // the slope's pull, the rail's loss
  const sl = g.slope / Math.hypot(1, g.slope);
  k.s -= SKATE.g * sl * dt;
  k.s -= Math.sign(k.s) * Math.min(Math.abs(k.s), SKATE.grindLoss * dt);
  // off: Space (popped), or too slow
  if (keys.ollie && g.t > 0.08) k.crouch += dt;
  if ((!keys.ollie && k.crouch > 0) || Math.abs(k.s) < 0.5) {
    const pop = Math.abs(k.s) < 0.5 ? 0 : popOf(k, SKATE.offPop);
    k.combo.settle();
    sev.ollie = pop > 0;
    b.z += 0.02;
    return takeOff(b, k, [g.ux * k.s, g.uy * k.s, g.slope * k.s + pop], false);
  }
  // along: followed round its kinks, off its end into the air
  const nx = b.x + g.ux * k.s * dt;
  const ny = b.y + g.uy * k.s * dt;
  const nz = b.z + g.slope * k.s * dt;
  const r = railNear(env, park, nx, ny, nz, 0.3);
  if (r && Math.abs(r.z - nz) < 0.2) {
    const same = r.ux * g.ux + r.uy * g.uy;
    const left = same * k.s >= 0 ? r.ahead : r.back;
    if (Math.abs(same) > 0.6 && left > 0.02) {
      const flip = same < 0 ? -1 : 1;
      g.ux = r.ux * flip;
      g.uy = r.uy * flip;
      g.slope = r.slope * flip;
      setPos(b, r.x, r.y, r.z);
      b.vx = g.ux * k.s;
      b.vy = g.uy * k.s;
      b.vz = g.slope * k.s;
      return;
    }
  }
  k.combo.settle();
  setPos(b, nx, ny, nz);
  takeOff(b, k, [g.ux * k.s, g.uy * k.s, g.slope * k.s], false);
}

// ── at the coping, on a wall ─────────────────────────────────────────────────────────────────────────────

function lip(b: Body, k: SkateNow, keys: SkateKeys, park: SkatePark, dt: number, sev: SkateEvents) {
  const L = k.lip as LipNow;
  const on = k.on as OnSurface;
  L.t += dt;
  const into = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  k.balT += dt;
  if (!balance(L, L.t, into, dt, 1, k.balT)) return bail(b, k, sev, "balance");
  k.combo.grow(L.id, L.t);
  const p = park.placed[on.pl];
  const f = surfFrame(p, L.l, on.w);
  setPos(b, f.x, f.y, f.z);
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  k.n = f.N;
  const len = (TRICKS[L.id] as TrickDef).len;
  if ((!keys.grind && L.t >= len * 0.5) || L.t > len + 2.5) {
    // back in: down the face (a handplant comes round, the stalls rock back fakie)
    k.combo.settle();
    k.lip = null;
    if (L.id === "handplant") b.yaw = wrap(b.yaw + Math.PI);
    on.l = L.l - 0.12;
    const nose = noseOn(b.yaw, surfFrame(p, on.l, on.w));
    k.s = nose.fu > 0 ? -1.5 : 1.5;
    k.since = 0;
    k.ramp = true;
    setMode(k, "roll");
  }
}

function wall(b: Body, k: SkateNow, keys: SkateKeys, env: MoveEnv, park: SkatePark, dt: number, sev: SkateEvents) {
  const W = k.wall as WallNow;
  W.t += dt;
  k.combo.grow("wallride", W.t);
  b.vz -= SKATE.g * SKATE.wallG * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const still = env.flow?.wall(b.x, b.y, b.z, -W.nx, -W.ny, 0.7);
  const pop = keys.ollie && W.t > 0.1;
  if (pop || !still || W.t > SKATE.wallLen || sp < 1.5) {
    k.combo.settle();
    const out = pop ? 2.4 : 1.2;
    const up = pop ? popOf({ ...k, crouch: SKATE.crouch }, SKATE.offPop) : 0;
    sev.ollie = pop;
    k.wall = null;
    const s = k.s;
    takeOff(b, k, [b.vx + W.nx * out, b.vy + W.ny * out, b.vz + up], false);
    k.s = s;
  }
  void park;
}

// ── on the wire ──────────────────────────────────────────────────────────────────────────────────────────

/** A board in a number (a player's `sk`): its mode + 1 (0: on foot), the trick going on, fakie, goofy, the board.
 *  The trick's own time is the receiver's (from when the code changed). */
export function skateCode(k: SkateNow | null | undefined): number {
  if (!k) return 0;
  const mode = SKATE_MODES.indexOf(k.mode) + 1;
  const tr = k.air?.cur?.id ?? k.grind?.id ?? k.manual?.id ?? k.lip?.id ?? (k.wall ? "wallride" : null);
  const ti = tr ? TRICK_LIST.indexOf(tr) + 1 : 0;
  const v = BOARD_VARIANT_INDEX(k.variant);
  const dbl = k.air?.cur?.double ? 1 : 0;
  const crouch = k.crouch > 0 ? 1 : 0;
  const push = k.pushing ? 1 : 0;
  return (
    mode +
    (ti << 3) +
    ((k.s < 0 ? 1 : 0) << 9) +
    ((k.stance < 0 ? 1 : 0) << 10) +
    (v << 11) +
    (dbl << 15) +
    (crouch << 16) +
    (push << 17) +
    ((Math.round(clamp((k.lean + 1) / 2, 0, 1) * 15) & 15) << 18) +
    ((k.cess ? 1 : 0) << 22) +
    ((k.lit ? 1 : 0) << 23)
  );
}
export interface SkateLook {
  mode: SkateMode;
  trick: TrickId | null;
  fakie: boolean;
  stance: 1 | -1;
  variant: BoardVariant;
  double: boolean;
  crouch: boolean;
  push: boolean;
  lean: number;
  /** a powerslide (the board across the way it goes), the special lit */
  cess: boolean;
  lit: boolean;
}
export function skateOfCode(c: number): SkateLook | null {
  const mode = SKATE_MODES[(c & 7) - 1];
  if (!mode) return null;
  const ti = (c >> 3) & 63;
  return {
    mode,
    trick: ti ? (TRICK_LIST[ti - 1] ?? null) : null,
    fakie: ((c >> 9) & 1) === 1,
    stance: ((c >> 10) & 1) === 1 ? -1 : 1,
    variant: BOARD_LIST[(c >> 11) & 15] ?? "street-pop",
    double: ((c >> 15) & 1) === 1,
    crouch: ((c >> 16) & 1) === 1,
    push: ((c >> 17) & 1) === 1,
    lean: (((c >> 18) & 15) / 15) * 2 - 1,
    cess: ((c >> 22) & 1) === 1,
    lit: ((c >> 23) & 1) === 1,
  };
}
/** The look of a board now, from the body itself (the local player's: the same shape as the wire's). */
export function skateLook(k: SkateNow): SkateLook {
  return skateOfCode(skateCode(k)) as SkateLook;
}
const TRICK_LIST = TRICK_IDS;
const BOARD_LIST = BOARD_VARIANTS;
const BOARD_VARIANT_INDEX = (v: BoardVariant) => Math.max(0, BOARD_LIST.indexOf(v));
/** Thrown off (a bail): the code for the moment after (the others' ragdoll), the board gone from under her. */
export const SKATE_BAIL = 7;
export const isSkateCode = (c: unknown): c is number =>
  typeof c === "number" &&
  Number.isInteger(c) &&
  c >= 0 &&
  c < 2 ** 24 &&
  ((c & 7) <= SKATE_MODES.length || c === SKATE_BAIL);
