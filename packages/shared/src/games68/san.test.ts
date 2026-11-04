import assert from "node:assert/strict";
import { test } from "node:test";
import { legal, parseFen, sq } from "./chess.ts";
import { replay, sanOf, uciOf } from "./san.ts";

test("moves named the usual way: pieces, captures, castling, promotion, check and mate", () => {
  assert.deepEqual(replay("e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6 d7c6 e1g1").san, [
    "e4",
    "e5",
    "Nf3",
    "Nc6",
    "Bb5",
    "a6",
    "Bxc6",
    "dxc6",
    "O-O",
  ]);
  // the fool's mate
  assert.deepEqual(replay("f2f3 e7e5 g2g4 d8h4").san, ["f3", "e5", "g4", "Qh4#"]);
  // en passant, a check
  assert.deepEqual(replay("e2e4 a7a6 e4e5 d7d5 e5d6 a6a5 d6c7 a5a4 c7b8q").san.slice(-3), ["dxc7", "a4", "cxb8=Q"]);
  assert.deepEqual(replay("e2e4 f7f6 d1h5").san.at(-1), "Qh5+");
});

test("which of two knights: by its file, else its rank", () => {
  const p = parseFen("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1");
  const m = legal(p, sq("b1"), sq("d2"));
  assert.ok(m);
  assert.equal(sanOf(p, m), "Nbd2");
  const q = parseFen("4k3/8/8/1N6/8/8/8/1N2K3 w - - 0 1");
  const n = legal(q, sq("b1"), sq("c3"));
  assert.ok(n);
  assert.equal(sanOf(q, n), "N1c3");
  assert.equal(uciOf(n), "b1c3");
});

test("a log that goes wrong stops where it does", () => {
  const r = replay("e2e4 e7e5 e1e8 g1f3");
  assert.equal(r.san.length, 2);
  assert.equal(r.fens.length, 2);
});
