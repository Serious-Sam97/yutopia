import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_HOME_LOTS, claimOps, lotFloors, storeyAddOps } from "../homes.ts";
import { applyOps, type StructOp } from "./ops.ts";
import { supportEditWhy } from "./support.ts";
import type { Structure, Wall, XY } from "./types.ts";

// The quality pass: an upper storey stands over walls, rooms or columns of the one under it — nothing floats.

const empty = (): Structure => ({
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [0, 0],
  floors: [{ index: 0, name: "G", z: 0, grid: { x0: 0, y0: 0, w: 10, h: 10 } }],
  slabs: [],
  walls: [],
  rooms: [],
});
const A = BASE_HOME_LOTS[0];
const [x, y] = [A.x0 + 2, A.z0 + 2];
const box = (x0: number, y0: number, x1: number, y1: number): XY[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
function lot(): { s: Structure; g: number; u: number } {
  let s = empty();
  s = applyOps(s, claimOps(s, A, { uid: 7, name: "Bia" }, 2) ?? []);
  const up = storeyAddOps(s, A, "up");
  assert.ok(Array.isArray(up));
  s = applyOps(s, up);
  const [g, u] = lotFloors(s, A.key);
  return { s, g: g.index, u: u.index };
}
const slabOp = (floor: number, ring: XY[], id = "s1"): StructOp => ({
  op: "slabs",
  floor,
  slabs: [{ id, floor, z: 5, top: ".", outline: ring, holes: [] }],
});

test("a floor upstairs over nothing floats: refused; over a room under it, held up", () => {
  const { s, g, u } = lot();
  const up = box(x, y, x + 6, y + 4);
  assert.match(supportEditWhy(s, u, [slabOp(u, up)]) ?? "", /holds it up/);
  // (a room's walls under it, its room)
  const walls: Wall[] = up.map((a, i) => ({
    id: `w${i}`,
    floor: g,
    a,
    b: up[(i + 1) % 4],
    base: 2,
    height: 3,
    front: "p",
  }));
  const s2 = applyOps(s, [
    { op: "walls", remove: [], add: walls },
    { op: "rooms", floor: g, rooms: [{ key: "r", floor: g, outline: up, props: {} } as never] },
  ]);
  assert.equal(supportEditWhy(s2, u, [slabOp(u, up)]), null);
  // (a balcony 2 m past its walls: the overhang; 3 m: too far)
  assert.equal(supportEditWhy(s2, u, [slabOp(u, box(x, y - 2, x + 6, y + 4))]), null);
  assert.match(supportEditWhy(s2, u, [slabOp(u, box(x, y - 3, x + 6, y + 4))]) ?? "", /holds it up/);
  // (columns hold it up as walls do)
  assert.equal(
    supportEditWhy(s2, u, [slabOp(u, box(x, y - 3, x + 6, y + 4))], (f) =>
      f === g
        ? [
            [x + 1, y - 2.5],
            [x + 3, y - 2.5],
            [x + 5, y - 2.5],
          ]
        : [],
    ),
    null,
  );
  // (a wall holding it up stays)
  const s3 = applyOps(s2, [slabOp(u, up)]);
  const drop: StructOp[] = [
    { op: "walls", remove: ["w0", "w1", "w2", "w3"], add: [] },
    { op: "rooms", floor: g, rooms: [] },
  ];
  assert.match(supportEditWhy(s3, g, drop) ?? "", /holds up the storey over it/);
  // (the ground storey and its walls: nothing to need)
  assert.equal(supportEditWhy(s, g, [slabOp(g, up)]), null);
});
