import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { convertV1 } from "./convert.ts";
import { doorEdge, doorFits, Grid } from "./grid.ts";
import { areaAt, holdsItems, hWall, isFloor, MapBuilder, type MapDef, tileAt, WALL } from "./map.ts";
import { layoutFromMap, validLayout } from "./map-edit.ts";
import { studio, studioV1 } from "./maps/studio.ts";
import { findPath } from "./path.ts";

// Connected components of walkable tiles: v1 by tile adjacency, v2 by steps
// (which also respect walls on edges).
function components(map: MapDef, grid: Grid, edges: boolean): Int32Array {
  const W = map.width;
  const comp = new Int32Array(W * map.height).fill(-1);
  let n = 0;
  for (let i = 0; i < comp.length; i++) {
    if (comp[i] !== -1 || !isFloor(tileAt(map, i % W, Math.floor(i / W)))) continue;
    const q = [i];
    comp[i] = n;
    while (q.length) {
      const c = q.pop() as number;
      const x = c % W;
      const y = Math.floor(c / W);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        const ok = edges ? grid.step(x, y, nx, ny) : isFloor(tileAt(map, nx, ny));
        if (ok && comp[ny * W + nx] === -1) {
          comp[ny * W + nx] = n;
          q.push(ny * W + nx);
        }
      }
    }
    n++;
  }
  return comp;
}

test("the studio converts: no wall tiles, a valid v2 layout, rooms gain the wall tiles", () => {
  assert.ok(studio.tiles.every((r) => !r.includes(WALL)));
  assert.ok(validLayout(layoutFromMap(studio)));
  const before = studioV1.tiles.join("").replace(/[# ]/g, "").length;
  const after = studio.tiles.join("").replace(/ /g, "").length;
  assert.ok(after > before + 200, `more floor: ${before} → ${after}`);
  assert.equal(after, studio.width * studio.height, "the old walls all became floor");
});

test("conversion keeps who can reach whom, and rooms where they were", () => {
  const v1g = Grid.from({ ...studioV1, hWalls: [], vWalls: [] }, []);
  const v2g = Grid.from(studio, []);
  const c1 = components(studioV1, v1g, false);
  const c2 = components(studio, v2g, true);
  const floors: number[] = [];
  for (let i = 0; i < c1.length; i++) if (c1[i] !== -1) floors.push(i);
  for (const a of floors)
    for (const b of [floors[0], floors[floors.length - 1], floors[Math.floor(floors.length / 2)]])
      assert.equal(c1[a] === c1[b], c2[a] === c2[b], `connectivity of ${a % 48},${Math.floor(a / 48)}`);
  // every v1 floor tile is still in the same room
  for (const i of floors) {
    const x = (i % 48) + 0.5;
    const y = Math.floor(i / 48) + 0.5;
    const was = areaAt(studioV1, x, y);
    if (was) assert.equal(areaAt(studio, x, y)?.key, was.key, `room at ${x},${y}`);
  }
  // rooms that had a wall between them still do (and walking there is blocked)
  assert.ok(!v2g.step(28, 8, 29, 8), "tracking ↮ war room");
  assert.ok(v2g.step(28, 5, 29, 5), "…except through the doorway");
  assert.ok(!v2g.step(33, 17, 34, 17) || !v2g.step(34, 17, 35, 17), "booth 1 ↮ booth 2");
  assert.ok(findPath(v2g, studio.spawn, { x: 44.5, y: 17.5 }), "spawn → booth 3");
});

test("conversion moves boards onto their wall and doors onto their edge", () => {
  for (const o of studio.objects) {
    if (o.kind.endsWith("_wall") || o.kind === "poster" || o.kind === "whiteboard" || o.kind === "notice_board")
      assert.ok(holdsItems(hWall(studio, o.x, o.y)), `${o.id} hangs on a wall`);
  }
  // a v1 room with a door tile in its bottom wall, as build mode made them
  const grid = new MapBuilder(20, 16)
    .room(0, 0, 19, 15, ".")
    .build()
    .map((r) => [...r]);
  // an inner room 4..10 × 4..9 (walls included), carpet inside, a doorway at (7, 9)
  for (let y = 4; y <= 9; y++)
    for (let x = 4; x <= 10; x++) grid[y][x] = x === 4 || x === 10 || y === 4 || y === 9 ? WALL : ",";
  grid[9][7] = ",";
  const tiles = grid.map((r) => r.join(""));
  const v1: MapDef = {
    key: "t",
    name: "T",
    width: 20,
    height: 16,
    tiles,
    hWalls: [],
    vWalls: [],
    spawn: { x: 2.5, y: 12.5 },
    areas: [
      { key: "main", name: "Main", kind: "open", x: 1, y: 1, w: 18, h: 14 },
      { key: "room-a", name: "A", kind: "private", x: 5, y: 5, w: 5, h: 4, priority: 3, ownerId: 7, ownerName: "Ana" },
    ],
    objects: [],
  };
  const door = { id: "door-room-a", kind: "door", x: 7, y: 9, rot: 0, props: { state: "locked", roomKey: "room-a" } };
  const { map, objects, changed } = convertV1(v1, [door]);
  const d = objects[0];
  assert.deepEqual([d.x, d.y, d.rot], [7, 10, 0], "onto the edge below the old doorway");
  assert.equal(changed.length, 1);
  assert.ok(doorFits(map, doorEdge(d)));
  assert.ok(canPlace(map, [], d));
  const outside = { x: 7.5, y: 13.5 };
  const inside = { x: 7.5, y: 6.5 };
  assert.equal(findPath(Grid.from(map, [d], { uid: 8 }), outside, inside)?.length ?? 0, 0, "locked for others");
  assert.ok(findPath(Grid.from(map, [d], { uid: 7 }), outside, inside), "open for the owner");
  assert.equal(areaAt(map, 7.5, 9.5)?.key, "room-a", "the room grew over its bottom wall");
});
