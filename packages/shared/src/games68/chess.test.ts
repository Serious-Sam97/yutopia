import assert from "node:assert/strict";
import { test } from "node:test";
import { legal, legalMoves, outcome, type Position, parseFen, play, START, sq, toFen } from "./chess.ts";

// Plan 68 phase 24: the chess rules, checked the way engines are — the number of positions a few
// moves deep from known positions (perft) — and the endings.
const perft = (p: Position, d: number): number =>
  d === 0 ? 1 : legalMoves(p).reduce((n, m) => n + perft(play(p, m), d - 1), 0);

test("chess: every legal move, counted from known positions", () => {
  const start = parseFen(START);
  assert.equal(perft(start, 1), 20);
  assert.equal(perft(start, 2), 400);
  assert.equal(perft(start, 3), 8902);
  // "Kiwipete": castling, en passant and promotion all in play
  const kiwi = parseFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
  assert.equal(perft(kiwi, 1), 48);
  assert.equal(perft(kiwi, 2), 2039);
  // position 3: en passant and checks along a rank
  assert.equal(perft(parseFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"), 3), 2812);
  assert.equal(toFen(start), START);
});

test("chess: mate, stalemate, en passant, promotion", () => {
  let p = parseFen(START);
  for (const [a, b] of [
    ["f2", "f3"],
    ["e7", "e5"],
    ["g2", "g4"],
    ["d8", "h4"],
  ]) {
    const m = legal(p, sq(a), sq(b));
    assert.ok(m, `${a}${b}`);
    p = play(p, m);
  }
  assert.equal(outcome(p), "mate", "fool's mate");
  assert.equal(outcome(parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")), "stalemate");
  // en passant
  let e = parseFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const ep = legal(e, sq("e5"), sq("d6"));
  assert.ok(ep);
  e = play(e, ep);
  assert.equal(e.board[sq("d5")], "", "the pawn taken in passing");
  // promotion (a queen unless asked)
  const pr = parseFen("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
  assert.equal(play(pr, legal(pr, sq("b7"), sq("b8")) ?? { from: 0, to: 0 }).board[sq("b8")], "Q");
  assert.equal(play(pr, legal(pr, sq("b7"), sq("b8"), "n") ?? { from: 0, to: 0 }).board[sq("b8")], "N");
  // castling moves the rook
  const c = play(
    parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"),
    legal(parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), sq("e1"), sq("g1")) ?? { from: 0, to: 0 },
  );
  assert.equal(c.board[sq("f1")], "R");
  assert.equal(c.castle, "kq");
  assert.equal(legal(parseFen(START), sq("e2"), sq("e5")), null, "an illegal move refused");
});
