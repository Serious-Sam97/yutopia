import assert from "node:assert/strict";
import { test } from "node:test";
import { getMap, levelMap } from "../index.ts";
import { backAt, edgeAt, type TileMap, tileAt } from "../map.ts";
import { wallsEdit } from "./edit.ts";
import { finishWorld } from "./finish.ts";
import { foldMap } from "./fold.ts";
import { structureFromMap } from "./from-map.ts";
import { applyOps } from "./ops.ts";
import { cellEdges, cellTop, edgeBack, edgeFront } from "./query.ts";
import type { Structure } from "./types.ts";

// Plan 72 phase 11 (the adapter deleted): the floor and its edges asked of the structure answer
// what the generator's tile map it was made from says — every cell, every edge, every floor.

const studio = getMap("studio");
const made = foldMap(finishWorld(studio, studio.objects, { fresh: true, building: true }).map);
const world = structureFromMap(made);

function same(s: Structure, m: TileMap = made) {
  let cells = 0;
  let edges = 0;
  for (const f of s.floors) {
    const g = levelMap(m, f.index) as TileMap;
    const { x0, y0, w, h } = f.grid;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        assert.equal(cellTop(s, f.index, x, y), tileAt(g, x, y), `floor ${f.index} cell ${x},${y}`);
        cells++;
      }
    let walled = 0;
    for (let y = y0; y <= y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const e = { dir: "h" as const, x, y };
        assert.equal(edgeFront(s, f.index, e), edgeAt(g, e), `floor ${f.index} h ${x},${y}`);
        assert.equal(edgeBack(s, f.index, e), backAt(g, e), `floor ${f.index} h back ${x},${y}`);
        if (edgeAt(g, e) !== ".") walled++;
        edges++;
      }
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x <= x0 + w; x++) {
        const e = { dir: "v" as const, x, y };
        assert.equal(edgeFront(s, f.index, e), edgeAt(g, e), `floor ${f.index} v ${x},${y}`);
        assert.equal(edgeBack(s, f.index, e), backAt(g, e), `floor ${f.index} v back ${x},${y}`);
        if (edgeAt(g, e) !== ".") walled++;
        edges++;
      }
    // (every walled edge listed, once)
    assert.equal(cellEdges(s, f.index).length, walled, `floor ${f.index}: walled edges`);
  }
  return { cells, edges };
}

test("the world's floors and walls, asked of the structure: as the adapter's grids had them", () => {
  const n = same(world);
  assert.ok(n.cells > 5000 && n.edges > 10000, JSON.stringify(n));
});

test("with walls drawn free (off the lines, an arc): the cells' edges as before, the free ones by segment", () => {
  const f = world.floors.find((q) => q.index === 3) ?? world.floors[0];
  let n = 0;
  const r = wallsEdit(
    world,
    f.index,
    [
      { a: [20.25, 20], b: [24.75, 20], front: "p" },
      { a: [20, 24], b: [26, 24], front: "b", bow: 1.5 },
      { a: [30, 20], b: [34, 20], front: "p" },
    ],
    [],
    () => `q${++n}`,
  );
  assert.ok(!("why" in r), JSON.stringify(r));
  const s = applyOps(world, [(r as { op: Parameters<typeof applyOps>[1][number] }).op]);
  // the whole-metre one is the cells' edges; the free ones (off the lines, an arc) aren't
  for (const x of [30, 31, 32, 33]) assert.equal(edgeFront(s, f.index, { dir: "h", x, y: 20 }), "p");
  for (const [x, y] of [
    [20, 20],
    [21, 20],
    [24, 20],
    [20, 24],
    [23, 24],
    [25, 24],
  ])
    assert.equal(edgeFront(s, f.index, { dir: "h", x, y }), edgeFront(world, f.index, { dir: "h", x, y }), `${x},${y}`);
  // the cells as they were
  for (let x = 18; x < 36; x++) assert.equal(cellTop(s, f.index, x, 21), cellTop(world, f.index, x, 21));
});
