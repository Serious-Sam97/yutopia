import assert from "node:assert/strict";
import { test } from "node:test";
import { sq } from "@yutopia/shared/games68/chess";
import { type InstancedMesh, MeshBasicMaterial, Vector3 } from "three";
import { ChessMen3, lostOf, menOf, standIns } from "./chessmen3d";
import { chessSquare, PLAY } from "./fam/gameroom";
import { placeOf } from "./native";

// Plan 70 phase 1 (docs/plan/70-the-chess.md): the living men at rest, where the room's game has them.

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// (1. e4 d5 2. exd5: a black pawn gone)
const TAKEN = "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
const table = (id: string, fen: string | undefined, x = 4, y = 6, rot = 0) => ({
  id,
  kind: "chess_table",
  x,
  y,
  rot,
  props: { variant: 1, ...(fen ? { fen } : {}) },
});

test("each man on its square of the table, at every turn of the table", () => {
  for (let rot = 0; rot < 4; rot++) {
    const o = table("t", TAKEN, 4, 6, rot);
    const men = menOf(o);
    assert.equal(men.length, 31, "31 men after a pawn's taken");
    // the white pawn that took is on d5, facing the black end
    const [x, z] = chessSquare(sq("d5"));
    const want = new Vector3(x, PLAY.chess_table.top + 0.0005, z).applyMatrix4(placeOf(o));
    const on = men.filter((m) => new Vector3().setFromMatrixPosition(m.at).distanceTo(want) < 1e-6);
    assert.equal(on.length, 1, `rot ${rot}: one man on d5`);
    assert.deepEqual([on[0].side, on[0].kind], ["w", "p"]);
    // (on the board: inside the table's footprint, over its top)
    for (const m of men) assert.ok(new Vector3().setFromMatrixPosition(m.at).y > 0.72, "on the board");
  }
});

test("a table with no game, or one that won't read, has its men as they start", () => {
  assert.equal(menOf(table("a", undefined)).length, 32);
  assert.equal(menOf(table("b", "garbage")).length, 32);
});

test("the floor's men: instanced by set, side and man, again only when a game changes", () => {
  const men = new ChessMen3(new MeshBasicMaterial());
  const two = [table("t1", START), table("t2", START, 9, 6)];
  men.sync(two);
  assert.equal(men.drawn, 64, "two tables' men");
  // (12 kinds of man in one set: a mesh each, whatever the tables)
  const meshes = () => men.root.children.filter((m) => (m as InstancedMesh).isInstancedMesh);
  assert.equal(meshes().length, 12);
  const before = meshes()
    .map((m) => m.uuid)
    .join();
  men.sync([table("t1", TAKEN), table("t2", START, 9, 6)]);
  assert.equal(men.drawn, 63, "a man taken");
  assert.equal(
    meshes()
      .map((m) => m.uuid)
      .join(),
    before,
    "the same meshes, moved",
  );
  men.sync([table("t2", START, 9, 6)]);
  assert.equal(men.drawn, 32, "a table taken away");
  men.sync([]);
  assert.equal(men.drawn, 0);
  men.dispose();
});

// (phases 3–4) a move played out: its men are rigs while it lasts (the mover, the taken man), then
// they're back among the instanced at rest
test("a move played out by rigs, then back at rest", () => {
  const men = new ChessMen3(new MeshBasicMaterial());
  const before = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
  const after = "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
  men.frame(100);
  men.sync([table("p1", before)]);
  assert.equal(men.rigsAt("p1"), 0, "at rest: all instanced");
  men.sync([{ ...table("p1", after), props: { variant: 1, fen: after, last: [36, 27], lastAt: Date.now() } }]);
  assert.equal(men.rigsAt("p1"), 1, "the taker a rig");
  const play = men.playing("p1");
  assert.ok(play?.plan.victim, "a capture planned");
  assert.equal(men.drawn, 31 + 1 - 1, "the 31 men left: 30 instanced, the taker a rig");
  men.frame(100 + (play?.plan.duration ?? 0) + 0.2);
  assert.equal(men.playing("p1"), null, "played out");
  assert.equal(men.rigsAt("p1"), 0);
  assert.equal(men.drawn, 31);
  men.dispose();
});

// (phase 4) a game's end: the beaten king (and the winners) are rigs, the crown dropped; a draw, both
// kings; a move seen late snaps (no playing out)
test("the end of a game: a mate's king and winners, a draw's kings; late news snaps", () => {
  const men = new ChessMen3(new MeshBasicMaterial());
  men.frame(10);
  const mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  men.sync([table("m1", mated)]);
  assert.ok(men.ended("m1")?.loser === "w", "white mated");
  // (the white king and every black man: rigs)
  assert.equal(men.rigsAt("m1"), 1 + 16);
  men.frame(100);
  const stale = "8/8/8/8/8/5k2/5q2/7K w - - 0 60";
  men.sync([table("m1", mated), { ...table("d1", stale, 12, 6), props: { variant: 1, fen: stale, over: "agreed" } }]);
  assert.equal(men.ended("d1")?.loser, null, "a draw");
  assert.equal(men.rigsAt("d1"), 2, "both kings");
  men.dispose();
});

test("what each side's lost, from the position (promoted pawns counted as pawns)", () => {
  assert.deepEqual(lostOf(parseBoard("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")), [[], []]);
  const [w, b] = lostOf(parseBoard("rnb1kbnr/ppp2ppp/8/8/8/8/PPPPPPP1/RNBQKBNQ"));
  assert.deepEqual(w, ["r"], "white: the h-rook (its h-pawn a queen now, not lost)");
  assert.deepEqual(b, ["q", "p", "p"]);
});

test("a life-size board: stand-ins' squares empty of stone men; the men solid where they stand", () => {
  const men = new ChessMen3(new MeshBasicMaterial());
  const big = (si?: Record<string, number>) => ({
    id: "w1",
    kind: "wizard_chess",
    x: 2,
    y: 2,
    rot: 0,
    props: { variant: 1, ...(si ? { si } : {}) },
  });
  men.sync([big()]);
  assert.equal(men.drawn, 32);
  assert.equal(men.solids("w1").length, 32, "each man a body");
  men.sync([big({ "52": 7 })]);
  assert.equal(men.drawn, 31, "e2's pawn is a person now");
  assert.equal(men.solids("w1").length, 31);
  assert.deepEqual([...standIns(big({ "52": 7, "12": 8 }))].sort(), [12, 52]);
  // (the bodies at a person's size, on the board)
  const s = men.solids("w1")[0];
  assert.ok(s.h > 0.9 && s.r > 0.3 && s.r < 0.55, `a man's body: ${s.h} m high, ${s.r} m round`);
  men.dispose();
});

const parseBoard = (rows: string) =>
  rows
    .replace(/\//g, "")
    .split("")
    .flatMap((c) => (/\d/.test(c) ? Array(Number(c)).fill("") : [c]));
