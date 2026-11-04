// Vortex at the chess table (docs/plan/70-the-chess.md, phase 7): a small engine over the shared
// rules — negamax with alpha-beta, deepened a ply at a time, captures and promotions tried first,
// captures followed to the end (bounded) so it doesn't stop mid-trade, and a score of material and
// where the pieces stand. Mates score by their length, so the shortest is preferred; stalemate, the
// fifty moves and too little left to mate are draws.
//
// Thought comes as a generator, as pool's Vortex does (pool-game.ts `vortexThink`): the world server
// steps it for a few milliseconds a tick and picks it up again on the next. A level's limit is a
// count of positions looked at, not time, so the same position, level and seed always give the
// same move.

import { inCheck, legalMoves, type Move, type Position, parseFen, play } from "./chess.ts";

export const CHESS_LEVELS = ["easy", "medium", "hard", "turbo"] as const;
export type ChessLevel = (typeof CHESS_LEVELS)[number];
export const isChessLevel = (l: unknown): l is ChessLevel =>
  typeof l === "string" && (CHESS_LEVELS as readonly string[]).includes(l);

interface Level {
  /** how many plies deep (deepened one at a time up to this) */
  depth: number;
  /** how many captures deep the quiet search follows a trade */
  quiet: number;
  /** the spread of the noise on each move's score at the top (centipawns), 0 for none */
  noise: number;
  /** the noise picks among this many of the best moves */
  top: number;
  /** the most positions looked at before he plays what he has */
  budget: number;
}

// easy (the plan's Pawn): one move deep, a capture's answer seen, and a wide noise among his five
// best — weak, now and then a piece left hanging; medium (Knight): two deep, a little noise; hard
// (Rook): three deep; turbo (Queen): as deep as about a second's worth of positions allows.
const LEVELS: Record<ChessLevel, Level> = {
  easy: { depth: 1, quiet: 1, noise: 90, top: 5, budget: 20_000 },
  medium: { depth: 2, quiet: 3, noise: 25, top: 3, budget: 40_000 },
  hard: { depth: 3, quiet: 6, noise: 0, top: 1, budget: 60_000 },
  turbo: { depth: 6, quiet: 8, noise: 0, top: 1, budget: 60_000 },
};

/** A step back to the caller every so many positions. */
const YIELD_EVERY = 64;
const MATE = 100_000;
const INF = 1_000_000;

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Where each piece stands best, from white's side with a8 first (the board's order); black's is the
// same table turned over. The well-known simple tables (Michniewski's).
const table = (rows: string): number[] => rows.trim().split(/\s+/).map(Number);
const PLACE: Record<string, number[]> = {
  p: table(`
      0   0   0   0   0   0   0   0
     50  50  50  50  50  50  50  50
     10  10  20  30  30  20  10  10
      5   5  10  25  25  10   5   5
      0   0   0  20  20   0   0   0
      5  -5 -10   0   0 -10  -5   5
      5  10  10 -20 -20  10  10   5
      0   0   0   0   0   0   0   0`),
  n: table(`
    -50 -40 -30 -30 -30 -30 -40 -50
    -40 -20   0   0   0   0 -20 -40
    -30   0  10  15  15  10   0 -30
    -30   5  15  20  20  15   5 -30
    -30   0  15  20  20  15   0 -30
    -30   5  10  15  15  10   5 -30
    -40 -20   0   5   5   0 -20 -40
    -50 -40 -30 -30 -30 -30 -40 -50`),
  b: table(`
    -20 -10 -10 -10 -10 -10 -10 -20
    -10   0   0   0   0   0   0 -10
    -10   0   5  10  10   5   0 -10
    -10   5   5  10  10   5   5 -10
    -10   0  10  10  10  10   0 -10
    -10  10  10  10  10  10  10 -10
    -10   5   0   0   0   0   5 -10
    -20 -10 -10 -10 -10 -10 -10 -20`),
  r: table(`
      0   0   0   0   0   0   0   0
      5  10  10  10  10  10  10   5
     -5   0   0   0   0   0   0  -5
     -5   0   0   0   0   0   0  -5
     -5   0   0   0   0   0   0  -5
     -5   0   0   0   0   0   0  -5
     -5   0   0   0   0   0   0  -5
      0   0   0   5   5   0   0   0`),
  q: table(`
    -20 -10 -10  -5  -5 -10 -10 -20
    -10   0   0   0   0   0   0 -10
    -10   0   5   5   5   5   0 -10
     -5   0   5   5   5   5   0  -5
      0   0   5   5   5   5   0  -5
    -10   5   5   5   5   5   0 -10
    -10   0   5   0   0   0   0 -10
    -20 -10 -10  -5  -5 -10 -10 -20`),
  // the king in the middle game: home, behind his pawns
  k: table(`
    -30 -40 -40 -50 -50 -40 -40 -30
    -30 -40 -40 -50 -50 -40 -40 -30
    -30 -40 -40 -50 -50 -40 -40 -30
    -30 -40 -40 -50 -50 -40 -40 -30
    -20 -30 -30 -40 -40 -30 -30 -20
    -10 -20 -20 -20 -20 -20 -20 -10
     20  20   0   0   0   0  20  20
     20  30  10   0   0  10  30  20`),
};
// the king once the heavy pieces are off: out to the middle (and the losing king driven to the edge)
const KING_LATE = table(`
    -50 -40 -30 -20 -20 -30 -40 -50
    -30 -20 -10   0   0 -10 -20 -30
    -30 -10  20  30  30  20 -10 -30
    -30 -10  30  40  40  30 -10 -30
    -30 -10  30  40  40  30 -10 -30
    -30 -10  20  30  30  20 -10 -30
    -30 -30   0   0   0   0 -30 -30
    -50 -30 -30 -30 -30 -30 -30 -50`);

/** The position's score for the side to move, in centipawns. */
export function evaluate(p: Position): number {
  let score = 0;
  let pieces = 0; // knights, bishops, rooks and queens on both sides
  for (const c of p.board) if (c && !"pPkK".includes(c)) pieces += VALUE[c.toLowerCase()];
  const late = pieces <= 1_600;
  for (let s = 0; s < 64; s++) {
    const c = p.board[s];
    if (!c) continue;
    const t = c.toLowerCase();
    const white = c !== t;
    const at = white ? s : s ^ 56;
    const v = VALUE[t] + (t === "k" && late ? KING_LATE[at] : PLACE[t][at]);
    score += white ? v : -v;
  }
  return p.turn === "w" ? score : -score;
}

/** A draw however it's played on: the fifty moves, or too little left to mate. */
function drawn(p: Position): boolean {
  if (p.half >= 100) return true;
  let minor = 0;
  for (const c of p.board) {
    if (!c || c === "k" || c === "K") continue;
    if (c !== "n" && c !== "N" && c !== "b" && c !== "B") return false;
    if (++minor > 1) return false;
  }
  return true;
}

// what a move takes (en passant's pawn too)
const taken = (p: Position, m: Move): string =>
  p.board[m.to] || (m.to === p.ep && p.board[m.from].toLowerCase() === "p" ? "p" : "");

/** How soon to try a move: captures by the most valuable piece taken with the least valuable taker,
 *  then promotions; the rest after. */
function urgency(p: Position, m: Move): number {
  let k = 0;
  const victim = taken(p, m);
  if (victim) k += 10_000 + 10 * VALUE[victim.toLowerCase()] - VALUE[p.board[m.from].toLowerCase()];
  if (m.promo) k += 9_000 + VALUE[m.promo];
  return k;
}

function ordered(p: Position, moves: Move[], tie?: () => number): Move[] {
  const keyed = moves.map((m) => ({ m, k: urgency(p, m) + (tie ? tie() : 0) }));
  keyed.sort((a, b) => b.k - a.k);
  return keyed.map((e) => e.m);
}

interface Search {
  nodes: number;
  /** the count at which thought stops (∞ while the first ply is being finished) */
  limit: number;
  stop: boolean;
  quiet: number;
}

function* visit(s: Search): Generator<void, void> {
  s.nodes++;
  if (s.nodes % YIELD_EVERY === 0) yield;
  if (s.nodes >= s.limit) s.stop = true;
}

function* negamax(
  s: Search,
  p: Position,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): Generator<void, number> {
  if (depth <= 0) return yield* quiesce(s, p, alpha, beta, ply, 0);
  yield* visit(s);
  if (s.stop) return 0;
  const moves = legalMoves(p);
  if (!moves.length) return inCheck(p) ? -(MATE - ply) : 0;
  if (drawn(p)) return 0;
  let best = -INF;
  for (const m of ordered(p, moves)) {
    const v = -(yield* negamax(s, play(p, m), depth - 1, -beta, -alpha, ply + 1));
    if (s.stop) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// The quiet search: past the last ply only captures and promotions are tried (every move when in
// check), the side to move free to stand on the score as it is; `q` captures deep at most.
function* quiesce(
  s: Search,
  p: Position,
  alpha: number,
  beta: number,
  ply: number,
  q: number,
): Generator<void, number> {
  yield* visit(s);
  if (s.stop) return 0;
  const check = inCheck(p);
  let best = -INF;
  if (!check) {
    const stand = evaluate(p);
    if (stand >= beta || q >= s.quiet) return stand;
    if (stand > alpha) alpha = stand;
    best = stand;
  } else if (q >= s.quiet) return evaluate(p);
  const moves = legalMoves(p);
  if (!moves.length) return check ? -(MATE - ply) : 0;
  if (drawn(p)) return 0;
  const tries = check ? moves : moves.filter((m) => m.promo || taken(p, m));
  for (const m of ordered(p, tries)) {
    const v = -(yield* quiesce(s, play(p, m), -beta, -alpha, ply + 1, q + 1));
    if (s.stop) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// a seeded random, so the server's Vortex can be replayed in tests (as pool's)
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

/** Vortex thinks over `fen` at `level`: a step yielded every few dozen positions; returns his
 *  move, or null when there's none to make. The same position, level and seed give the same move. */
export function* chessThink(fen: string, level: ChessLevel, seed: number): Generator<void, Move | null> {
  const L = LEVELS[level];
  const r = rng(seed);
  const p = parseFen(fen);
  const moves = legalMoves(p);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const s: Search = { nodes: 0, limit: Number.POSITIVE_INFINITY, stop: false, quiet: L.quiet };
  // equal moves are told apart by the seed, so he doesn't open the same way every game
  let root = ordered(p, moves, () => r() * 0.5);
  const scores = new Map<Move, number>();

  for (let depth = 1; depth <= L.depth; depth++) {
    s.limit = depth === 1 ? Number.POSITIVE_INFINITY : L.budget;
    const done = new Map<Move, number>();
    let alpha = -INF;
    for (const m of root) {
      // with noise every move's score is wanted whole; without, only the best's
      const v = -(yield* negamax(s, play(p, m), depth - 1, -INF, L.noise ? INF : -alpha, 1));
      if (s.stop) break;
      done.set(m, v);
      if (v > alpha) alpha = v;
    }
    // a ply cut short still counts if it got through the last ply's best (searched first)
    if (done.size) {
      for (const [m, v] of done) scores.set(m, v);
      if (done.size < root.length) for (const m of root) if (!done.has(m)) scores.delete(m);
      root = [...root].sort((a, b) => (scores.get(b) ?? -INF) - (scores.get(a) ?? -INF));
    }
    if (s.stop) break;
    if (Math.abs(scores.get(root[0]) ?? 0) >= MATE - 1_000) break; // a mate found: no need to look further
  }

  if (!L.noise) return root[0];
  // the weaker levels: his few best, each scored with a shake of noise, the best of those played
  let pick = root[0];
  let top = -INF;
  for (const m of root.slice(0, L.top)) {
    const v = (scores.get(m) ?? -INF) + gauss(r) * L.noise;
    if (v > top) {
      top = v;
      pick = m;
    }
  }
  return pick;
}

/** Vortex's move, thought through to the end at once (tests, and wherever slicing doesn't matter). */
export function chessBest(fen: string, level: ChessLevel, seed: number): Move | null {
  const it = chessThink(fen, level, seed);
  for (;;) {
    const step = it.next();
    if (step.done) return step.value;
  }
}
