// The living chessmen's moves (docs/plan/70-the-chess.md, "The moves (choreography)", "Captures and
// the end", phases 3–4): pure maths, no three.js. The client sees a chess table's `props.fen` go from
// one position to the next; `planMove(before, after, last)` finds the one legal move between them and
// lays out who goes where and when; `actorAt` / `victimAt` say where each man stands and how he holds
// himself at any moment of it.
//
// API
//   planMove(before, after, last?) → MovePlan | null   null: not one legal move apart (snap instead)
//   actorAt(plan, i, t) → ManPose                      actor i at t seconds from the move's start
//   victimAt(plan, t) → VictimPose                     the taken man (whole / flinch / breaking / gone)
//   sqToFr(i) / frToSq([f, r])                         chess.ts square index (a8 = 0 … h1 = 63) ⇄ (file, rank)
//   SQ, and every timing constant below (tunable)
//
// Conventions
//   - A square is (file, rank) as floats: file 0..7 = a..h, rank 0..7 = 1..8; a1 = (0, 0), h8 = (7, 7).
//     Positions in between are fractions of a square (a man halfway from e2 to e4 is at (4, 2)).
//   - `lift` is metres over the board at the table's scale (a square SQ = 0.065 m).
//   - `yaw` is radians about the up axis: 0 = facing +rank (white's way, toward rank 8), +π/2 = facing
//     +file (toward the h-file); facing along (dfile, drank) is atan2(dfile, drank). At rest white is 0,
//     black π. Within a move, yaws are kept numerically continuous: white's in (−π, π], black's in
//     (0, 2π], so a turn is a straight lerp between two numbers and never wraps.
//   - Times are seconds from the move's start (t = 0 when the client sees the new position).
//   - `pose` is a name from the client's POSES (rest, step, windup, strike, thrust, flinch, rear, leap,
//     land …), `k` its blend 0..1. Within a leg k moves smoothly; between legs it may switch pose at
//     once (windup → strike, rear → leap → land: a blow's snap); a client may crossfade ~0.08 s.

import { inCheck, legalMoves, type Move, outcome, type Position, parseFen, play, type Side, sqName } from "./chess.ts";

export type Man = "p" | "r" | "n" | "b" | "q" | "k";
/** (file, rank): a1 = (0, 0), h8 = (7, 7) */
export type Fr = [number, number];

/** m: a square at the table */
export const SQ = 0.065;

// ——— timing (s) and sizes, to tune ———
/** turning to face its way, and back to face the enemy */
export const TURN = 0.25;
/** the least a man's going takes (a short step still reads as a move) */
export const GO_MIN = 0.7;
/** a beat at the end of every move for things to settle */
export const SETTLE = 0.1;
/** the knight rearing before the leap, and landing after it */
export const REAR = 0.3;
export const LAND = 0.25;
/** m: the knight's leap at its height */
export const LEAP_LIFT = 0.05;
/** squares: how far short of its victim a taker stops to strike */
export const STOP_SHORT = 0.35;
/** the blow drawn back, the blow itself, and when within the blow it lands (a fraction of STRIKE) */
export const WINDUP = 0.25;
export const STRIKE = 0.25;
export const STRIKE_HIT = 0.3;
/** the taker's step into the taken square */
export const STEP_IN = 0.35;
/** the victim's flinch rising, and his breaking into chips */
export const FLINCH_IN = 0.2;
export const BREAK = 0.6;
/** the castling rook's arc out toward the board's centre (squares) and its time */
export const CASTLE_ARC = 0.9;
export const CASTLE_ROOK_GO = 0.9;
/** the promoted pawn: a wait after it's back at rest, then the morph */
export const PROMO_WAIT = 0.1;
export const PROMO_MORPH = 0.5;
/** the pose's blend while turning on the spot */
export const TURN_K = 0.35;

type Gait = Man | "trot";
/** How each man goes: time = base + squares / speed (clamped to [GO_MIN, max]); its pose and blend
 *  while going; `bob` m of lift per step, one step every `stride` squares. The knight's leap (n) lifts
 *  by LEAP_LIFT instead; "trot" is the knight on foot (its step into a taken square). */
export const GAIT: Record<
  Gait,
  { speed: number; base: number; max: number; pose: string; k: number; bob: number; stride: number }
> = {
  // marches in small hops, two a square
  p: { speed: 2, base: 0.3, max: 1.25, pose: "step", k: 0.8, bob: 0.006, stride: 0.5 },
  // grinds along: no lift, slow
  r: { speed: 1.5, base: 0.35, max: 1.4, pose: "step", k: 0.5, bob: 0, stride: 1 },
  // one arc
  n: { speed: 6, base: 0.3, max: 0.75, pose: "leap", k: 1, bob: 0, stride: 1 },
  // glides
  b: { speed: 4, base: 0.4, max: 1.3, pose: "step", k: 0.3, bob: 0, stride: 1 },
  // strides
  q: { speed: 5, base: 0.35, max: 1.3, pose: "step", k: 1, bob: 0.002, stride: 0.8 },
  // walks slowly, a step at a time
  k: { speed: 1.4, base: 0.45, max: 1.4, pose: "step", k: 0.7, bob: 0.0015, stride: 0.5 },
  trot: { speed: 2, base: 0.2, max: 0.6, pose: "step", k: 0.5, bob: 0.002, stride: 0.35 },
};

/** One stretch of an actor's move. turn: on the spot, yaw0 → yaw1. go: from → to (along a cubic
 *  Bézier through `bend` if given), facing yaw0, in its gait. act: on the spot, a pose by `shape`. */
export interface Leg {
  kind: "turn" | "go" | "act";
  t0: number;
  t1: number;
  from: Fr;
  to: Fr;
  bend?: [Fr, Fr];
  yaw0: number;
  yaw1: number;
  gait: Gait;
  pose: string;
  /** act: k over the leg — arch 0→1→0, rise 0→1, fall 1→0, blow 1 then down to 0 */
  shape: "arch" | "rise" | "fall" | "blow";
}

export interface Actor {
  from: Fr;
  to: Fr;
  kind: Man;
  side: Side;
  /** the man who moved, or the rook castling with his king */
  role: "mover" | "castle-rook";
  start: number;
  end: number;
  legs: Leg[];
}
export interface Victim {
  /** where the taken man stands (en passant: the passed pawn's square, not the mover's `to`) */
  at: Fr;
  kind: Man;
  side: Side;
  /** index into actors */
  by: number;
  /** s: the taker sets off — the victim starts to flinch */
  flinchAt: number;
  /** s: the blow lands — the victim starts to break */
  breakAt: number;
  /** the way he turns to face the blow (his side's yaw range) */
  yaw: number;
}
export interface MovePlan {
  /** the mover first; a castling rook second */
  actors: Actor[];
  victim: Victim | null;
  /** the pawn turns into `to` at `at_s` (s), over PROMO_MORPH */
  promo: { at: Fr; side: Side; to: "q" | "r" | "b" | "n"; at_s: number } | null;
  /** the side to move after it is in check (mate included) */
  check: boolean;
  end: "play" | "check" | "mate" | "stalemate" | "fifty" | "material";
  /** s: the whole move, capture, promotion and settling included */
  duration: number;
  /** the move found, in chess.ts squares and names ("e2", "e4") */
  move: { from: number; to: number; name: string };
}
export interface ManPose {
  at: Fr;
  /** m over the board */
  lift: number;
  yaw: number;
  pose: string;
  k: number;
}
export interface VictimPose {
  state: "whole" | "flinch" | "breaking" | "gone";
  /** flinch: its blend; breaking: 0 → 1 over BREAK; gone: 1; whole: 0 */
  k: number;
  yaw: number;
}

// ——— helpers ———
export const sqToFr = (i: number): Fr => [i % 8, 7 - Math.floor(i / 8)];
export const frToSq = ([f, r]: Fr): number => (7 - Math.round(r)) * 8 + Math.round(f);
export const restYaw = (side: Side): number => (side === "w" ? 0 : Math.PI);
const TAU = Math.PI * 2;
/** a yaw in the side's range: white (−π, π], black (0, 2π] */
function norm(y: number, side: Side): number {
  const lo = side === "w" ? -Math.PI : 0;
  let v = y;
  while (v <= lo) v += TAU;
  while (v > lo + TAU) v -= TAU;
  return v;
}
const faceYaw = (from: Fr, to: Fr, side: Side): number => norm(Math.atan2(to[0] - from[0], to[1] - from[1]), side);
const smooth = (u: number): number => u * u * (3 - 2 * u);
const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const dist = (a: Fr, b: Fr): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
function goTime(g: Gait, d: number): number {
  const G = GAIT[g];
  return Math.max(GO_MIN, Math.min(G.max, G.base + d / G.speed));
}
function bezier(p0: Fr, p1: Fr, p2: Fr, p3: Fr, u: number): Fr {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** Lays an actor's legs end to end from (t, at, yaw). */
function track(side: Side, from: Fr, t0: number) {
  const legs: Leg[] = [];
  const s = { t: t0, at: from, yaw: restYaw(side) };
  const push = (leg: Omit<Leg, "t0" | "t1">, dur: number) => {
    legs.push({ ...leg, t0: s.t, t1: s.t + dur });
    s.t += dur;
    s.at = leg.to;
    s.yaw = leg.yaw1;
    return legs[legs.length - 1];
  };
  return {
    legs,
    s,
    /** turn on the spot to face `target` (a raw yaw), if not already */
    turn(target: number) {
      const y = norm(target, side);
      if (Math.abs(y - s.yaw) < 1e-3) return;
      push({ kind: "turn", from: s.at, to: s.at, yaw0: s.yaw, yaw1: y, gait: "k", pose: "step", shape: "arch" }, TURN);
    },
    go(to: Fr, gait: Gait, dur: number, bend?: [Fr, Fr]) {
      return push(
        { kind: "go", from: s.at, to, bend, yaw0: s.yaw, yaw1: s.yaw, gait, pose: GAIT[gait].pose, shape: "arch" },
        dur,
      );
    },
    act(pose: string, shape: Leg["shape"], dur: number) {
      return push({ kind: "act", from: s.at, to: s.at, yaw0: s.yaw, yaw1: s.yaw, gait: "k", pose, shape }, dur);
    },
  };
}

/** The legal move from `before` that gives `after` (board and turn), or null. */
function findMove(before: string, after: string, last?: [number, number]): { p: Position; m: Move } | null {
  let p: Position;
  let q: Position;
  try {
    p = parseFen(before);
    q = parseFen(after);
  } catch {
    return null;
  }
  const want = `${q.board.join(",")} ${q.turn}`;
  const hits: Move[] = [];
  for (const m of legalMoves(p)) {
    const r = play(p, m);
    if (`${r.board.join(",")} ${r.turn}` === want) hits.push(m);
  }
  if (!hits.length) return null;
  const m = (last && hits.find((h) => h.from === last[0] && h.to === last[1])) || hits[0];
  return { p, m };
}
/** The move from `before` to `after` laid out in time, or null if they aren't one legal move apart
 *  (identical, unrelated or unparsable): the client then just snaps to `after`. `last` ([from, to],
 *  chess.ts squares — the table's `props.last`) picks between moves that give the same position. */
export function planMove(before: string, after: string, last?: [number, number]): MovePlan | null {
  const found = findMove(before, after, last);
  if (!found) return null;
  const { p, m } = found;
  const q = parseFen(after);
  const side = p.turn;
  const piece = p.board[m.from];
  const kind = piece.toLowerCase() as Man;
  const from = sqToFr(m.from);
  const to = sqToFr(m.to);
  const actors: Actor[] = [];
  let victim: Victim | null = null;
  let promo: MovePlan["promo"] = null;

  const finish = (tr: ReturnType<typeof track>, a: Omit<Actor, "start" | "end" | "legs">) => {
    const legs = tr.legs;
    actors.push({ ...a, legs, start: legs.length ? legs[0].t0 : 0, end: legs.length ? tr.s.t : 0 });
  };

  if (kind === "k" && Math.abs(m.to - m.from) === 2) {
    // castling: the king walks two squares; when he's halfway the rook steps round in front of him
    const king = track(side, from, 0);
    king.turn(faceYaw(from, to, side));
    const walk = king.go(to, "k", goTime("k", 2));
    king.turn(restYaw(side));
    finish(king, { from, to, kind: "k", side, role: "mover" });
    const kingside = m.to > m.from;
    const rFrom = sqToFr(kingside ? m.from + 3 : m.from - 4);
    const rTo = sqToFr(kingside ? m.from + 1 : m.from - 1);
    const out = side === "w" ? CASTLE_ARC : -CASTLE_ARC; // toward the board's centre
    const rook = track(side, rFrom, (walk.t0 + walk.t1) / 2);
    rook.turn(faceYaw(rFrom, rTo, side));
    rook.go(rTo, "r", CASTLE_ROOK_GO, [
      [rFrom[0], rFrom[1] + out],
      [rTo[0], rTo[1] + out],
    ]);
    rook.turn(restYaw(side));
    finish(rook, { from: rFrom, to: rTo, kind: "r", side, role: "castle-rook" });
  } else {
    const taken = p.board[m.to];
    const passant = kind === "p" && m.to === p.ep && !taken;
    const vSq = passant ? m.to + (side === "w" ? 8 : -8) : taken ? m.to : -1;
    const tr = track(side, from, 0);
    const travel = faceYaw(from, to, side);
    tr.turn(travel);
    // getting somewhere: the knight rears, leaps and lands; the rest go in their gait
    let setOff = 0;
    const approach = (target: Fr) => {
      const d = dist(tr.s.at, target);
      if (kind === "n") {
        tr.act("rear", "rise", REAR);
        setOff = tr.go(target, "n", goTime("n", d)).t0 - REAR;
        tr.act("land", "fall", LAND);
      } else setOff = tr.go(target, kind, goTime(kind, d)).t0;
    };
    const blow = (): number => {
      tr.act("windup", "rise", WINDUP);
      const hit = tr.act(kind === "p" ? "thrust" : "strike", "blow", STRIKE);
      return hit.t0 + STRIKE * STRIKE_HIT;
    };
    if (vSq < 0) approach(to);
    else {
      const vAt = sqToFr(vSq);
      let breakAt: number;
      let strikeFrom: Fr;
      if (passant) {
        // the pawn strikes sideways as it passes: halfway, it turns to the pawn beside it
        strikeFrom = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
        approach(strikeFrom);
        tr.turn(faceYaw(strikeFrom, vAt, side));
        breakAt = blow();
        tr.turn(travel);
        tr.go(to, "p", goTime("p", dist(strikeFrom, to)));
      } else {
        // the taker stops a step short, strikes, then steps into the square
        const d = dist(from, to);
        strikeFrom = [to[0] - ((to[0] - from[0]) / d) * STOP_SHORT, to[1] - ((to[1] - from[1]) / d) * STOP_SHORT];
        approach(strikeFrom);
        breakAt = blow();
        tr.go(to, kind === "n" ? "trot" : kind, STEP_IN);
      }
      const vSide: Side = side === "w" ? "b" : "w";
      victim = {
        at: vAt,
        kind: p.board[vSq].toLowerCase() as Man,
        side: vSide,
        by: 0,
        flinchAt: setOff,
        breakAt,
        yaw: faceYaw(vAt, strikeFrom, vSide),
      };
    }
    tr.turn(restYaw(side));
    finish(tr, { from, to, kind, side, role: "mover" });
    if (kind === "p" && (to[1] === 7 || to[1] === 0)) {
      const into = (q.board[m.to] || m.promo || "q").toLowerCase() as "q" | "r" | "b" | "n";
      promo = { at: to, side, to: into, at_s: actors[0].end + PROMO_WAIT };
    }
  }

  const v = victim as Victim | null;
  let duration = Math.max(...actors.map((a) => a.end));
  if (v) duration = Math.max(duration, v.breakAt + BREAK);
  if (promo) duration = Math.max(duration, promo.at_s + PROMO_MORPH);
  const end = outcome(q);
  return {
    actors,
    victim: v,
    promo,
    check: inCheck(q),
    end,
    duration: duration + SETTLE,
    move: { from: m.from, to: m.to, name: `${sqName(m.from)}${sqName(m.to)}${m.promo ?? ""}` },
  };
}

function legPose(leg: Leg, t: number): ManPose {
  const u = clamp01((t - leg.t0) / (leg.t1 - leg.t0 || 1));
  if (leg.kind === "turn")
    return {
      at: [leg.from[0], leg.from[1]],
      lift: 0,
      yaw: lerp(leg.yaw0, leg.yaw1, smooth(u)),
      pose: "step",
      k: TURN_K * Math.sin(Math.PI * u),
    };
  if (leg.kind === "act") {
    const k =
      leg.shape === "arch"
        ? Math.sin(Math.PI * u)
        : leg.shape === "rise"
          ? smooth(u)
          : leg.shape === "fall"
            ? 1 - smooth(u)
            : u < 0.35
              ? 1
              : 1 - smooth((u - 0.35) / 0.65);
    return { at: [leg.from[0], leg.from[1]], lift: 0, yaw: leg.yaw0, pose: leg.pose, k };
  }
  const ue = smooth(u);
  const at: Fr = leg.bend
    ? bezier(leg.from, leg.bend[0], leg.bend[1], leg.to, ue)
    : [lerp(leg.from[0], leg.to[0], ue), lerp(leg.from[1], leg.to[1], ue)];
  const G = GAIT[leg.gait];
  if (leg.gait === "n") return { at, lift: LEAP_LIFT * Math.sin(Math.PI * ue), yaw: leg.yaw0, pose: "leap", k: 1 };
  const steps = Math.max(1, Math.round(dist(leg.from, leg.to) / G.stride));
  return {
    at,
    lift: G.bob * Math.abs(Math.sin(Math.PI * steps * ue)),
    yaw: leg.yaw0,
    pose: G.pose,
    k: G.k * Math.min(1, u / 0.15, (1 - u) / 0.15),
  };
}

/** Actor `i` of the plan at `t` s: before his start he stands at `from`, after his end at `to`, both
 *  at rest facing the enemy. */
export function actorAt(plan: MovePlan, i: number, t: number): ManPose {
  const a = plan.actors[i];
  if (!a.legs.length || t <= a.start)
    return { at: [a.from[0], a.from[1]], lift: 0, yaw: restYaw(a.side), pose: "rest", k: 1 };
  if (t >= a.end) return { at: [a.to[0], a.to[1]], lift: 0, yaw: restYaw(a.side), pose: "rest", k: 1 };
  const leg = a.legs.find((l) => t < l.t1) ?? a.legs[a.legs.length - 1];
  return legPose(leg, t);
}

/** The taken man at `t`: whole till the taker sets off, flinching (turning to face the blow) till it
 *  lands, breaking over BREAK, then gone. With no victim: whole. */
export function victimAt(plan: MovePlan, t: number): VictimPose {
  const v = plan.victim;
  if (!v) return { state: "whole", k: 0, yaw: 0 };
  const rest = restYaw(v.side);
  if (t < v.flinchAt) return { state: "whole", k: 0, yaw: rest };
  if (t < v.breakAt) {
    const k = smooth(clamp01((t - v.flinchAt) / FLINCH_IN));
    return { state: "flinch", k, yaw: lerp(rest, v.yaw, k) };
  }
  if (t < v.breakAt + BREAK) return { state: "breaking", k: (t - v.breakAt) / BREAK, yaw: v.yaw };
  return { state: "gone", k: 1, yaw: v.yaw };
}
