import {
  aimGuide,
  BALL_R,
  cloneBalls,
  FOOT_SPOT,
  HEAD_STRING,
  newBall,
  POOL_L,
  POOL_POCKETS,
  POOL_SEGS,
  POOL_W,
  type PoolBall,
  type PoolEvent,
  type PoolShot,
  placeOk,
  rack,
  shotSpeed,
  simulate,
} from "./pool.ts";

// 8-ball, the rules (as 8 Ball Pool plays them, WPA-flavoured) and Vortex's
// game. Pure: the server keeps a PoolGame per table, runs each shot through the
// physics (pool.ts) and `judge` says what it meant.
//
//  · The break: legal if a ball drops or four reach a cushion; otherwise a foul.
//    The 8 on the break comes back to the foot spot (no win, no loss).
//  · The table is open until someone pots a ball on a legal shot after the
//    break: the first ball potted gives that player its group.
//  · Fouls (ball in hand anywhere for the other player): the cue ball potted,
//    nothing hit, the wrong ball hit first (the 8 first on an open table too),
//    no cushion after the contact with nothing potted, the shot clock.
//    A scratch on the break: ball in hand behind the head string.
//  · The 8: once your group is down you call a pocket. In it on a legal shot:
//    you win. Early, in another pocket, or with a foul: you lose.

export type Group = "solids" | "stripes";
export const groupOf = (id: number): Group | null =>
  id >= 1 && id <= 7 ? "solids" : id >= 9 && id <= 15 ? "stripes" : null;
const other = (g: Group): Group => (g === "solids" ? "stripes" : "solids");

export type Foul = "scratch" | "noHit" | "wrongFirst" | "eightFirst" | "noRail" | "badBreak" | "clock";
export type Outcome = "win" | "eightEarly" | "eightWrongPocket" | "eightScratch" | "eightFoul";

export interface PoolGame {
  balls: PoolBall[];
  turn: 0 | 1; // whose shot
  groups: [Group | null, Group | null]; // null on both: the table is open
  broken: boolean; // the break has been played
  inHand: "" | "kitchen" | "anywhere"; // the shooter's ball in hand
  winner: -1 | 0 | 1;
  shots: number;
}

export interface Verdict {
  game: PoolGame; // after the shot
  potted: number[]; // balls that dropped (ids, in order)
  foul: Foul | null;
  outcome: Outcome | null; // the game ended on this shot (the winner is in game.winner)
  keeps: boolean; // the shooter goes again
  assigned: Group | null; // the shooter's group was set on this shot
  respotted: boolean; // the 8 came back to the foot spot
}

export function newGame(seed: number, breaker: 0 | 1): PoolGame {
  return {
    balls: rack(seed),
    turn: breaker,
    groups: [null, null],
    broken: false,
    inHand: "kitchen",
    winner: -1,
    shots: 0,
  };
}

const onTable = (balls: readonly PoolBall[], g: Group) => balls.filter((b) => b.down < 0 && groupOf(b.id) === g);
// what the shooter must hit first: their group, the 8 once it's cleared, anything but the 8 on an open table
export function onTheEight(game: PoolGame, seat: 0 | 1 = game.turn): boolean {
  const g = game.groups[seat];
  return !!g && onTable(game.balls, g).length === 0;
}
export function legalFirst(game: PoolGame, id: number, seat: 0 | 1 = game.turn): boolean {
  const g = game.groups[seat];
  if (id === 8) return !!g && onTable(game.balls, g).length === 0;
  if (!g) return id !== 0; // open table: any coloured ball
  return groupOf(id) === g;
}
export const remaining = (game: PoolGame, seat: 0 | 1): number => {
  const g = game.groups[seat];
  return g ? onTable(game.balls, g).length : 7;
};

// The 8 back on the foot spot (or straight behind it, the first free place).
function respot8(balls: PoolBall[]) {
  const eight = balls.find((b) => b.id === 8) as PoolBall;
  for (let k = 0; k < 40; k++) {
    const x = FOOT_SPOT.x + k * 0.01;
    if (x > POOL_L / 2 - BALL_R) break;
    if (!balls.some((b) => b.id !== 8 && b.down < 0 && Math.hypot(b.x - x, b.y) < 2 * BALL_R + 1e-4)) {
      Object.assign(eight, newBall(8, x, 0));
      return;
    }
  }
  Object.assign(eight, newBall(8, FOOT_SPOT.x - 0.1, 0));
}

// The cue ball out of the pocket, waiting to be placed (somewhere legal).
function cueBack(balls: PoolBall[], kitchen: boolean) {
  const cue = balls.find((b) => b.id === 0) as PoolBall;
  for (const [x, y] of [
    [HEAD_STRING - 0.25, 0],
    [HEAD_STRING - 0.25, 0.2],
    [HEAD_STRING - 0.25, -0.2],
    [HEAD_STRING - 0.1, 0],
    [-0.1, 0],
    [0, 0.3],
    [0, -0.3],
  ]) {
    if (placeOk(balls, x, y, kitchen)) {
      Object.assign(cue, newBall(0, x, y));
      return;
    }
  }
  Object.assign(cue, newBall(0, HEAD_STRING - 0.3, 0));
}

// What a shot meant. `after`: the balls at rest (the physics'), `events` what
// happened on the way, `called` the pocket called for the 8 (−1 none), `clock`
// the shot clock ran out (no shot at all).
export function judge(
  game: PoolGame,
  after: readonly PoolBall[],
  events: readonly PoolEvent[],
  called: number,
  clock = false,
): Verdict {
  const seat = game.turn;
  const opp = (1 - seat) as 0 | 1;
  const balls = cloneBalls(clock ? game.balls : after);
  const potted = clock ? [] : events.filter((e) => e.k === "pocket").map((e) => e.a);
  const next: PoolGame = { ...game, balls, shots: game.shots + 1, inHand: "" };
  const v: Verdict = { game: next, potted, foul: null, outcome: null, keeps: false, assigned: null, respotted: false };
  const end = (winner: 0 | 1, outcome: Outcome) => {
    next.winner = winner;
    v.outcome = outcome;
    return v;
  };
  const pass = (foul: Foul | null, kitchen = false) => {
    v.foul = foul;
    next.turn = opp;
    if (foul) {
      next.inHand = kitchen ? "kitchen" : "anywhere";
      const cue = balls.find((b) => b.id === 0) as PoolBall;
      if (cue.down >= 0) cueBack(balls, kitchen);
    }
    return v;
  };
  if (clock) return pass("clock");

  const first = events.find((e) => e.k === "ball" && (e.a === 0 || e.b === 0));
  const firstId = first ? (first.a === 0 ? (first.b as number) : first.a) : -1;
  const scratch = potted.includes(0);
  const eightDown = potted.includes(8);
  const anyRail = (() => {
    // a cushion (or a pocket) after the first contact
    const t0 = first?.t ?? Number.POSITIVE_INFINITY;
    return events.some((e) => (e.k === "rail" || e.k === "jaw" || e.k === "pocket") && e.t >= t0);
  })();
  const objectPots = potted.filter((id) => id !== 0);

  // ── the break ──
  if (!game.broken) {
    next.broken = true;
    const toRail = new Set(events.filter((e) => e.k === "rail" && e.a !== 0).map((e) => e.a)).size;
    const legalBreak = objectPots.length > 0 || toRail >= 4;
    if (eightDown) {
      respot8(balls);
      v.respotted = true;
    }
    if (scratch) return pass("scratch", true);
    if (!legalBreak) return pass("badBreak");
    // the table stays open; potting anything (but the 8) keeps the breaker on
    v.keeps = objectPots.some((id) => id !== 8);
    if (!v.keeps) next.turn = opp;
    return v;
  }

  const g = game.groups[seat];
  const wasOnEight = onTheEight(game, seat);

  // ── the 8 ──
  if (eightDown) {
    if (!wasOnEight) return end(opp, "eightEarly");
    if (scratch) return end(opp, "eightScratch");
    const eightPocket = events.find((e) => e.k === "pocket" && e.a === 8)?.b ?? -1;
    if (firstId !== 8) return end(opp, "eightFoul");
    if (called >= 0 && eightPocket !== called) return end(opp, "eightWrongPocket");
    return end(seat, "win");
  }

  // ── fouls ──
  if (scratch) return pass("scratch");
  if (firstId < 0) return pass("noHit");
  if (!g && firstId === 8) return pass("eightFirst");
  if (!legalFirst(game, firstId, seat)) return pass("wrongFirst");
  if (!objectPots.length && !anyRail) return pass("noRail");

  // ── a legal shot: groups, and does the shooter stay? ──
  let mine = g;
  if (!g && objectPots.length) {
    // open table: the first ball down decides
    mine = groupOf(objectPots[0]) as Group;
    next.groups = seat === 0 ? [mine, other(mine)] : [other(mine), mine];
    v.assigned = mine;
  }
  v.keeps = !!mine && objectPots.some((id) => groupOf(id) === mine);
  if (!v.keeps) next.turn = opp;
  return v;
}

// Ball in hand: put the cue ball down (checked).
export function placeCue(game: PoolGame, x: number, y: number): boolean {
  if (!game.inHand) return false;
  if (!placeOk(game.balls, x, y, game.inHand === "kitchen")) return false;
  const cue = game.balls.find((b) => b.id === 0) as PoolBall;
  Object.assign(cue, newBall(0, x, y));
  return true;
}

// ── on the wire ──────────────────────────────────────────────────────────────
// Balls at rest, compact: [id, x, y, down, qx, qy, qz, qw] at 0.01 mm / 1e-5.
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
export const packBalls = (balls: readonly PoolBall[]): number[][] =>
  balls.map((b) => [b.id, r5(b.x), r5(b.y), b.down, r5(b.q[0]), r5(b.q[1]), r5(b.q[2]), r5(b.q[3])]);
export const unpackBalls = (rows: unknown): PoolBall[] =>
  Array.isArray(rows)
    ? rows.map((r) => {
        const [id, x, y, down, qx, qy, qz, qw] = (r as number[]).map(Number);
        const n = Math.hypot(qx, qy, qz, qw) || 1;
        return { ...newBall(id, x, y), down, q: [qx / n, qy / n, qz / n, qw / n] as PoolBall["q"] };
      })
    : [];
export const packGame = (g: PoolGame): string => JSON.stringify({ ...g, balls: packBalls(g.balls) });
export function unpackGame(s: string): PoolGame | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    return { ...o, balls: unpackBalls(o.balls) } as PoolGame;
  } catch {
    return null;
  }
}

// ── Vortex's game ────────────────────────────────────────────────────────────
// For every ball he may hit and every pocket: the ghost-ball shot (where the
// cue ball must be at contact to send the ball at the pocket), if both paths
// are clear and the cut isn't hopeless; each tried a few times through the real
// physics with his hand's shake for his level; the best by how often it drops
// (and, higher up, where the cue ball ends). Nothing makeable: a safety (a soft
// legal hit). With ball in hand he places the cue ball behind his best shot.

export const POOL_LEVELS = ["easy", "medium", "hard", "turbo"] as const;
export type PoolLevel = (typeof POOL_LEVELS)[number];
export const isPoolLevel = (l: unknown): l is PoolLevel =>
  typeof l === "string" && (POOL_LEVELS as readonly string[]).includes(l);

const SHAKE: Record<PoolLevel, { angle: number; power: number; tries: number; position: boolean; spin: boolean }> = {
  easy: { angle: 0.028, power: 0.18, tries: 3, position: false, spin: false },
  medium: { angle: 0.012, power: 0.1, tries: 4, position: false, spin: false },
  hard: { angle: 0.0055, power: 0.06, tries: 5, position: true, spin: true },
  turbo: { angle: 0.0022, power: 0.03, tries: 6, position: true, spin: true },
};

export interface VortexShot {
  shot: PoolShot;
  called: number; // the pocket (for the 8, and for show)
  place?: { x: number; y: number }; // ball in hand: where he put it
  target: number; // the ball he's playing (−1: a safety)
}

// a seeded random, so the server's Vortex can be replayed in tests
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

// is the straight path from a to b clear of every ball but the ones skipped?
function clear(balls: readonly PoolBall[], ax: number, ay: number, bx: number, by: number, skip: number[]): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (const b of balls) {
    if (b.down >= 0 || skip.includes(b.id)) continue;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / len2));
    if (Math.hypot(ax + dx * t - b.x, ay + dy * t - b.y) < 2 * BALL_R + 0.002) return false;
  }
  return true;
}

// a spot just inside a pocket's mouth to send a ball at
function aimPoint(i: number): { x: number; y: number } {
  const p = POOL_POCKETS[i];
  return { x: p.lx - p.dx * 0.01, y: p.ly - p.dy * 0.01 };
}

interface Plan {
  target: number;
  pocket: number;
  angle: number;
  power: number;
  cut: number;
  dist: number;
}

function plans(game: PoolGame, cue: { x: number; y: number }): Plan[] {
  const out: Plan[] = [];
  const balls = game.balls;
  for (const ob of balls) {
    if (ob.down >= 0 || ob.id === 0 || !legalFirst(game, ob.id)) continue;
    for (let i = 0; i < POOL_POCKETS.length; i++) {
      const a = aimPoint(i);
      const ox = a.x - ob.x;
      const oy = a.y - ob.y;
      const od = Math.hypot(ox, oy);
      if (od < 1e-6) continue;
      const gx = ob.x - (ox / od) * 2 * BALL_R;
      const gy = ob.y - (oy / od) * 2 * BALL_R;
      const cx = gx - cue.x;
      const cy = gy - cue.y;
      const cd = Math.hypot(cx, cy);
      if (cd < 1e-6) continue;
      // the cut: between the cue ball's way and the object ball's
      const cut = Math.acos(Math.max(-1, Math.min(1, (cx * ox + cy * oy) / (cd * od))));
      if (cut > 1.35) continue;
      // a side pocket takes a ball only from fairly square on
      const p = POOL_POCKETS[i];
      const into = (ox * p.dx + oy * p.dy) / od;
      if (p.side ? into < 0.55 : into < 0.3) continue;
      if (!clear(balls, cue.x, cue.y, gx, gy, [0, ob.id])) continue;
      if (!clear(balls, ob.x, ob.y, a.x, a.y, [0, ob.id])) continue;
      // speed: enough to carry the object ball in with some to spare (a cut passes on cos² of it)
      const need = (0.55 + 0.6 * od) / Math.max(0.25, Math.cos(cut)) + 0.35 * cd;
      const v = Math.min(7, Math.max(0.6, need * 1.15));
      const power = Math.min(1, ((v - 0.25) / 9) ** (1 / 1.5));
      out.push({ target: ob.id, pocket: i, angle: Math.atan2(cy, cx), power, cut, dist: cd + od });
    }
  }
  return out;
}

// how good a layout is for the shooter's next shot: the easiest makeable plan
function leave(game: PoolGame, balls: PoolBall[]): number {
  const cue = balls.find((b) => b.id === 0);
  if (!cue || cue.down >= 0) return 0;
  const ps = plans({ ...game, balls }, cue);
  let best = 0;
  for (const p of ps) best = Math.max(best, Math.cos(p.cut) * (1 / (1 + p.dist)));
  return best;
}

// Thinking in slices: the server runs this a few milliseconds a tick (one
// physics run per step) so a hard think never stalls the room.
export function* vortexThink(game: PoolGame, level: PoolLevel, seed: number): Generator<void, VortexShot> {
  const r = rng(seed);
  const shake = SHAKE[level];
  const cueBall = game.balls.find((b) => b.id === 0) as PoolBall;
  let place: { x: number; y: number } | undefined;

  // ball in hand: try spots behind each makeable shot, keep the best
  if (game.inHand) {
    const kitchen = game.inHand === "kitchen";
    let best: { x: number; y: number; score: number } | null = null;
    for (const ob of game.balls) {
      if (ob.down >= 0 || ob.id === 0 || !legalFirst(game, ob.id)) continue;
      for (let i = 0; i < POOL_POCKETS.length; i++) {
        const a = aimPoint(i);
        const od = Math.hypot(a.x - ob.x, a.y - ob.y) || 1;
        const ux = (a.x - ob.x) / od;
        const uy = (a.y - ob.y) / od;
        for (const back of [0.18, 0.3, 0.45]) {
          const x = ob.x - ux * (2 * BALL_R + back);
          const y = ob.y - uy * (2 * BALL_R + back);
          if (!placeOk(game.balls, x, y, kitchen)) continue;
          const score = plans({ ...game, balls: game.balls }, { x, y }).filter(
            (p) => p.target === ob.id && p.pocket === i,
          ).length
            ? 1 / (1 + od + back)
            : 0;
          if (score > (best?.score ?? 0)) best = { x, y, score };
        }
      }
    }
    if (!best) {
      // anywhere legal, then
      for (const [x, y] of [
        [HEAD_STRING - 0.2, 0],
        [HEAD_STRING - 0.2, 0.25],
        [0, 0],
        [-0.3, -0.25],
      ])
        if (placeOk(game.balls, x, y, kitchen)) {
          best = { x, y, score: 0 };
          break;
        }
    }
    if (best) place = { x: best.x, y: best.y };
  }
  const cue = place ?? { x: cueBall.x, y: cueBall.y };
  const balls = cloneBalls(game.balls);
  const c0 = balls.find((b) => b.id === 0) as PoolBall;
  Object.assign(c0, newBall(0, cue.x, cue.y));
  const here: PoolGame = { ...game, balls };

  const candidates = plans(here, cue)
    .sort((a, b) => Math.cos(b.cut) / (1 + b.dist) - Math.cos(a.cut) / (1 + a.dist))
    .slice(0, level === "easy" ? 4 : 10);
  let best: { plan: Plan; spinY: number; score: number } | null = null;
  for (const plan of candidates) {
    for (const spinY of shake.spin ? [0, 0.6, -0.6] : [0]) {
      let made = 0;
      let pos = 0;
      for (let k = 0; k < shake.tries; k++) {
        const shot: PoolShot = {
          angle: plan.angle + gauss(r) * shake.angle,
          power: Math.max(0.05, Math.min(1, plan.power * (1 + gauss(r) * shake.power))),
          spinX: 0,
          spinY,
        };
        const res = simulate(balls, shot);
        yield;
        const fake = { ...here, inHand: "" as const };
        const v = judge(fake, res.balls, res.events, plan.target === 8 ? plan.pocket : -1);
        const ok = v.keeps || v.outcome === "win";
        if (ok) {
          made++;
          if (shake.position) pos += leave(v.game, res.balls);
        }
      }
      const score = made / shake.tries + (shake.position ? (0.5 * pos) / shake.tries : 0);
      if (!best || score > best.score) best = { plan, spinY, score };
    }
  }
  if (best && best.score > 0.05) {
    const shot: PoolShot = {
      angle: best.plan.angle + gauss(r) * shake.angle,
      power: Math.max(0.05, Math.min(1, best.plan.power * (1 + gauss(r) * shake.power))),
      spinX: 0,
      spinY: best.spinY,
    };
    return { shot, called: best.plan.pocket, place, target: best.plan.target };
  }
  // a safety: the nearest legal ball, full and firm enough to reach a cushion
  let near: PoolBall | null = null;
  for (const b of balls)
    if (b.down < 0 && b.id !== 0 && legalFirst(here, b.id) && clear(balls, cue.x, cue.y, b.x, b.y, [0, b.id]))
      if (!near || Math.hypot(b.x - cue.x, b.y - cue.y) < Math.hypot(near.x - cue.x, near.y - cue.y)) near = b;
  if (near) {
    const angle = Math.atan2(near.y - cue.y, near.x - cue.x) + gauss(r) * shake.angle;
    return { shot: { angle, power: 0.32, spinX: 0, spinY: 0 }, called: -1, place, target: -1 };
  }
  // nothing to see at all: hit the nearest legal ball off a cushion... or just roll at the rack
  const any =
    balls.find((b) => b.down < 0 && b.id !== 0 && legalFirst(here, b.id)) ??
    balls.find((b) => b.down < 0 && b.id !== 0);
  const angle = any ? Math.atan2(any.y - cue.y, any.x - cue.x) : 0;
  return { shot: { angle, power: 0.45, spinX: 0, spinY: 0 }, called: -1, place, target: -1 };
}

export function vortexShot(game: PoolGame, level: PoolLevel, seed: number): VortexShot {
  const it = vortexThink(game, level, seed);
  for (;;) {
    const s = it.next();
    if (s.done) return s.value;
  }
}

// the break, Vortex style: full power, a hair off-centre on the head ball
export function vortexBreak(level: PoolLevel, seed: number, cue: { x: number; y: number }): PoolShot {
  const r = rng(seed);
  const head = { x: FOOT_SPOT.x, y: (r() - 0.5) * 0.004 };
  return {
    angle: Math.atan2(head.y - cue.y, head.x - cue.x) + gauss(r) * SHAKE[level].angle * 0.5,
    power: level === "easy" ? 0.85 : 1,
    spinX: 0,
    spinY: -0.15,
  };
}

// the physics' pieces the client draws with, re-exported for one import
export { aimGuide, POOL_L, POOL_POCKETS, POOL_SEGS, POOL_W, shotSpeed };
