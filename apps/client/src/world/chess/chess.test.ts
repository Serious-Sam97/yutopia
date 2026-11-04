import assert from "node:assert/strict";
import { test } from "node:test";
import { vortexMood } from "./index";

// Plan 70 phase 7: Vortex's face at a table he plays, by the game.
const at = (props: Record<string, unknown>) => ({ id: "t", kind: "chess_table", x: 0, y: 0, rot: 0, props });
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("Vortex's face: thinking on his move, judging on yours, bored and asleep as you take your time", () => {
  assert.equal(vortexMood(at({ fen: START, lastAt: Date.now() - 9000 }), "w"), "focused");
  assert.equal(vortexMood(at({ fen: START, lastAt: Date.now() - 9000 }), "b"), "judging");
  assert.equal(vortexMood(at({ fen: START, lastAt: Date.now() - 30_000 }), "b"), "bored");
  assert.equal(vortexMood(at({ fen: START, lastAt: Date.now() - 90_000 }), "b"), "asleep");
});

test("Vortex's face: shocked when you've just taken one of his, smug when he's taken yours", () => {
  // 1. e4 d5 2. exd5: black's pawn taken, black to move
  const took = {
    fen: "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
    log: "e2e4 d7d5 e4d5",
    last: [36, 27],
    lastAt: Date.now() - 500,
  };
  assert.equal(vortexMood(at(took), "b"), "shocked");
  assert.equal(vortexMood(at(took), "w"), "smug");
});

test("Vortex's face at the end: crying beaten, ecstatic winning, side-eyed at a draw", () => {
  const mate = { fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3" };
  assert.equal(vortexMood(at(mate), "w"), "crying");
  assert.equal(vortexMood(at(mate), "b"), "ecstasy");
  assert.equal(vortexMood(at({ fen: START, over: "resign", loser: "w" }), "w"), "crying");
  assert.equal(vortexMood(at({ fen: START, over: "agreed" }), "b"), "sideeye");
});
