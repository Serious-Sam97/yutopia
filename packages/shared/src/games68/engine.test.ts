import assert from "node:assert/strict";
import { test } from "node:test";
import { legalMoves, type Move, outcome, type Position, parseFen, play, START, sq, sqName } from "./chess.ts";
import { CHESS_LEVELS, type ChessLevel, chessBest, chessThink, isChessLevel } from "./engine.ts";

// Plan 70 phase 7: Vortex's engine — always a legal move, mates found, a free queen taken, his thought
// in slices and the same each time, the easy level weaker than the best.

const ITALIAN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
const KIWI = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
// black to move, en passant and a promotion about
const ODD = "4k3/1P6/8/8/3pP3/8/8/4K3 b - e3 0 1";
const POSITIONS = [START, ITALIAN, KIWI, ODD];

// turbo thinks about a second a move: each answer worked out once
const memo = new Map<string, Move | null>();
const best = (fen: string, level: ChessLevel, seed = 1): Move | null => {
  const key = `${fen}|${level}|${seed}`;
  if (!memo.has(key)) memo.set(key, chessBest(fen, level, seed));
  return memo.get(key) ?? null;
};
const name = (m: Move | null) => (m ? `${sqName(m.from)}${sqName(m.to)}${m.promo ?? ""}` : "none");
const isLegal = (fen: string, m: Move | null) =>
  !!m && legalMoves(parseFen(fen)).some((l) => l.from === m.from && l.to === m.to && l.promo === m.promo);

// can the side to move mate within `n` moves whatever the other does?
function forcesMate(p: Position, n: number): boolean {
  for (const m of legalMoves(p)) {
    const q = play(p, m);
    const o = outcome(q);
    if (o === "mate") return true;
    if (n > 1 && o !== "stalemate" && legalMoves(q).every((r) => forcesMate(play(q, r), n - 1))) return true;
  }
  return false;
}

test("engine: the levels", () => {
  assert.deepEqual([...CHESS_LEVELS], ["easy", "medium", "hard", "turbo"]);
  assert.ok(isChessLevel("turbo"));
  assert.ok(!isChessLevel("queen"));
  assert.ok(!isChessLevel(3));
});

test("engine: every level plays a legal move, and none when there's none", () => {
  for (const fen of POSITIONS)
    for (const level of CHESS_LEVELS)
      assert.ok(isLegal(fen, best(fen, level)), `${level} at ${fen}: ${name(best(fen, level))}`);
  // after the fool's mate, and stalemated
  const mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  const stalemated = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
  for (const level of CHESS_LEVELS) {
    assert.equal(chessBest(mated, level, 1), null);
    assert.equal(chessBest(stalemated, level, 1), null);
  }
});

test("engine: mate in one, either side", () => {
  for (const level of ["hard", "turbo"] as const) {
    // the back rank
    assert.equal(name(best("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", level)), "a1a8", level);
    assert.equal(name(best("r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1", level)), "a8a1", level);
    // the scholar's
    const scholar = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    assert.equal(name(best(scholar, level)), "h5f7", level);
  }
});

test("engine: turbo mates in two", () => {
  // king and rook against the king in the corner, and black's rooks and bishops at white's king: no
  // mate in one, a mate in two
  for (const fen of ["k7/8/2K5/8/8/8/8/7R w - - 0 1", "6k1/pp4p1/2p5/2bp4/8/P5Pb/1P3rrP/2BRRN1K b - - 0 1"]) {
    const p = parseFen(fen);
    assert.ok(!forcesMate(p, 1) && forcesMate(p, 2), `a mate in two: ${fen}`);
    const m = best(fen, "turbo");
    assert.ok(m && isLegal(fen, m));
    const q = play(p, m);
    // whatever the answer, a mate follows
    assert.ok(
      legalMoves(q).length > 0 && legalMoves(q).every((r) => forcesMate(play(q, r), 1)),
      `${name(m)} forces mate`,
    );
  }
});

test("engine: hard and turbo take a hanging queen", () => {
  for (const level of ["hard", "turbo"] as const) {
    assert.equal(name(best("4k3/8/8/3q4/8/4N3/8/4K3 w - - 0 1", level)), "e3d5", level);
    // early on, the queen left where the knight takes it
    assert.equal(name(best("rnb1kbnr/pppp1ppp/8/4p3/7q/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3", level)), "f3h4", level);
  }
});

test("engine: thought in slices, the same each time", () => {
  for (const level of ["hard", "turbo"] as const) {
    const it = chessThink(ITALIAN, level, 1);
    let steps = 0;
    let r = it.next();
    while (!r.done) {
      steps++;
      r = it.next();
    }
    assert.ok(steps > (level === "turbo" ? 100 : 1), `${level} yields (${steps})`);
    assert.equal(name(r.value), name(best(ITALIAN, level)), `${level}: the same seed, the same move`);
  }
  assert.equal(name(chessBest(KIWI, "medium", 5)), name(chessBest(KIWI, "medium", 5)));
});

test("engine: easy is weaker than turbo", () => {
  let differ = 0;
  for (const fen of POSITIONS)
    for (const seed of [1, 2, 3]) if (name(best(fen, "easy", seed)) !== name(best(fen, "turbo"))) differ++;
  assert.ok(differ >= 3, `easy differs from turbo ${differ} times in 12`);
  // he takes a free queen at turbo; at easy, over a few games, he doesn't always
  const free = "rnb1kbnr/pppp1ppp/8/4p3/7q/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3";
  const takes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => sq("h4") === best(free, "easy", seed)?.to).length;
  assert.ok(takes >= 1, "easy sees a free queen sometimes");
});
