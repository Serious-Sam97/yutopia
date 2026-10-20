import assert from "node:assert/strict";
import { after, test } from "node:test";
import { BLOCKS, campusBuilding, moveBlocks, upgradeGround } from "./building.ts";
import type { WorldObjectDef } from "./catalog.ts";
import { Grid, moveStep, RUN_SPEED, setOutdoors } from "./grid.ts";
import { GATE, groundsAreaAt, groundsOutdoors, heightAt, INSIDES, walkableTile } from "./grounds.ts";
import { hearingGain } from "./hearing.ts";
import { type Height, stepHeight } from "./jump.ts";
import { levelMap } from "./levels.ts";
import { areaAt, edgeAt, type LevelDef, type MapDef, setAreasBeyond, setEdge, tileAt } from "./map.ts";
import { studio } from "./maps/studio.ts";
import { openingsIntoWalls } from "./openings.ts";
import { findPath } from "./path.ts";
import { splitAll } from "./tops.ts";

// The ground floor on the Grounds (docs/plan/27-the-grounds.md): past the
// stored lobby and lot the land goes on, and you walk it.

function ground() {
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const b = campusBuilding(into.map, into.objects);
  assert.ok(b);
  const moved = new Map(b.moved.map((o) => [o.id, o]));
  const objects = [...into.objects.map((o) => moved.get(o.id) ?? o), ...b.add];
  const g0 = levelMap(b.map, 0) as MapDef;
  return { g0, grid: Grid.from(g0, objects), map: b.map };
}
setOutdoors(groundsOutdoors);
setAreasBeyond(groundsAreaAt);
after(() => {
  setOutdoors(null);
  setAreasBeyond(null);
});

// the floor's coords → the building's (its corner at ox, oy)
const B = (g0: MapDef, p: { x: number; y: number }) => ({ x: p.x + (g0.ox ?? 0), y: p.y + (g0.oy ?? 0) });
const L = (g0: MapDef, x: number, y: number) => ({ x: x - (g0.ox ?? 0), y: y - (g0.oy ?? 0) });

/** Walk a found way from `from` to `to` (the floor's coords), feet on the ground. */
function walk(grid: Grid, g0: MapDef, from: { x: number; y: number }, to: { x: number; y: number }) {
  const path = findPath(grid, from, to);
  assert.ok(path, `a way from ${from.x},${from.y} to ${to.x},${to.y}`);
  let pos = { ...from };
  const h: Height = { z: grid.groundAt(pos.x, pos.y, 0), vz: 0, up: false };
  let hi = h.z;
  let lo = h.z;
  for (const wp of path) {
    for (let i = 0; i < 4000; i++) {
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) break;
      const step = Math.min(d, RUN_SPEED / 60);
      const next = moveStep(grid, pos, { x: dx / d, y: dy / d }, step * 60, 1 / 60, h.z);
      assert.ok(next.x !== pos.x || next.y !== pos.y, `stuck at ${JSON.stringify(B(g0, pos))} z ${h.z.toFixed(2)}`);
      pos = next;
      stepHeight(grid, pos.x, pos.y, h, 1 / 60);
      assert.ok(!h.up, `never off the ground walking (at ${JSON.stringify(B(g0, pos))})`);
      if (grid.onLand(pos.x, pos.y)) {
        const b = B(g0, pos);
        assert.ok(
          Math.abs(h.z - heightAt(b.x, b.y)) < 0.25,
          `feet on the land at ${b.x},${b.y}: ${h.z} vs ${heightAt(b.x, b.y)}`,
        );
      }
      hi = Math.max(hi, h.z);
      lo = Math.min(lo, h.z);
    }
  }
  return { pos, hi, lo };
}

test("the Grounds round the ground floor: out of the lot, onto the land", () => {
  const { g0, grid } = ground();
  // the lot is the stored floor; west of it, past the floor's own tiles, the land
  const lot = L(g0, -30, 20);
  assert.ok(grid.ok(Math.floor(lot.x), Math.floor(lot.y)));
  assert.ok(!grid.onLand(lot.x, lot.y), "the lot is the floor's own");
  const lawn = L(g0, -90, 20);
  assert.ok(grid.onLand(lawn.x, lawn.y), "the lawn is land");
  assert.ok(grid.ok(Math.floor(lawn.x), Math.floor(lawn.y)));
  // the trail into the woods, to the pond's shore
  const r = walk(grid, g0, lot, L(g0, -160, -6));
  const at = B(g0, r.pos);
  assert.ok(Math.hypot(at.x + 160, at.y + 6) < 1, `got there (${at.x}, ${at.y})`);
});

test("the Grounds: up the driveway to the gate, the floor never changing", () => {
  const { g0, grid } = ground();
  const r = walk(grid, g0, L(g0, -48, -6), L(g0, -40, -330));
  assert.ok(r.hi > 2.9, `climbed (the driveway's top ${r.hi.toFixed(2)} — a storey's band, but it's the land)`);
  // the gate lets you through; the fence either side doesn't
  assert.ok(walkableTile(Math.floor(GATE.x), Math.floor(GATE.z)));
  assert.ok(!walkableTile(Math.floor(GATE.x) + 20, Math.floor(GATE.z)));
  const through = walk(grid, g0, L(g0, -40, -330), L(g0, -40, -380));
  assert.ok(B(g0, through.pos).y < -375, "out past the gate");
});

test("the Grounds: the fence and the ridges are the edge", () => {
  const { g0, grid } = ground();
  for (const [x, z] of [
    [-400, 0],
    [0, 170],
    [220, -100],
  ]) {
    const p = L(g0, x, z);
    assert.ok(!grid.ok(Math.floor(p.x), Math.floor(p.y)), `the fence at ${x},${z}`);
  }
  // far out on the ridges: nothing to stand on
  const p = L(g0, -470, -100);
  assert.ok(!grid.ok(Math.floor(p.x), Math.floor(p.y)));
});

test("the courtyard's blocks: their ground floors are the ground floor's own, and you walk in", () => {
  const { g0, grid, map } = ground();
  assert.equal(upgradeGround(map), null, "once");
  for (const b of BLOCKS) {
    const mid = L(g0, (b.x0 + b.x1) / 2 - 6, (b.y0 + b.y1) / 2 + 3);
    assert.equal(areaAt(g0, mid.x, mid.y)?.key, b.key);
    assert.ok(!grid.onLand(mid.x, mid.y), `${b.name}: the floor's own tiles`);
  }
  // from the lot, round the headquarters, across the courtyard, in at the east block's doors
  const r = walk(grid, g0, L(g0, -30, 20), L(g0, 82, 18));
  const at = B(g0, r.pos);
  assert.equal(areaAt(g0, r.pos.x, r.pos.y)?.key, "east-block", `inside (${at.x}, ${at.y})`);
  // its glass is a wall: straight through it from the courtyard, no
  assert.ok(!grid.clear(L(g0, 72, 30), L(g0, 80, 30)));
});

test("the blocks moved out of a bigger studio's way: a stored floor's old ones go, what was in them goes with them", () => {
  const { map } = ground();
  const l0 = map.levels?.find((l) => l.index === 0) as LevelDef;
  const ox = l0.ox;
  const oy = l0.oy;
  // as a world from before: the blocks where they first stood (east x 60, south y 48)
  const OLD: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {
    "east-block": { x0: 60, y0: -10, x1: 88, y1: 48 },
    "south-block": { x0: -4, y0: 48, x1: 50, y1: 72 },
  };
  const tiles = l0.tiles.map((r) => [...r]);
  const walls = { hWalls: [...l0.hWalls], vWalls: [...l0.vWalls] };
  for (const b of BLOCKS) {
    const n = { x: b.x0 - ox, y: b.y0 - oy, w: b.x1 - b.x0, h: b.y1 - b.y0 };
    for (let y = n.y; y < n.y + n.h; y++) for (let x = n.x; x < n.x + n.w; x++) tiles[y][x] = " ";
    for (let x = n.x; x <= n.x + n.w; x++)
      for (const y of [n.y, n.y + n.h]) if (x < n.x + n.w) setEdge(walls, { dir: "h", x, y }, ".");
    for (let y = n.y; y < n.y + n.h; y++) for (const x of [n.x, n.x + n.w]) setEdge(walls, { dir: "v", x, y }, ".");
    const o = OLD[b.key];
    const a = { x: o.x0 - ox, y: o.y0 - oy, w: o.x1 - o.x0, h: o.y1 - o.y0 };
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++) if (tiles[y][x] === " ") tiles[y][x] = "_";
    for (let x = a.x; x < a.x + a.w; x++) for (const y of [a.y, a.y + a.h]) setEdge(walls, { dir: "h", x, y }, "g");
    for (let y = a.y; y < a.y + a.h; y++) for (const x of [a.x, a.x + a.w]) setEdge(walls, { dir: "v", x, y }, "g");
  }
  const areas = l0.areas.map((a) => {
    const o = OLD[a.key];
    return o ? { ...a, x: o.x0 - ox, y: o.y0 - oy } : a;
  });
  const old: MapDef = {
    ...map,
    levels: (map.levels ?? []).map((l) =>
      l.index === 0 ? { ...l, tiles: tiles.map((r) => r.join("")), ...walls, areas } : l,
    ),
  };
  // a desk someone built in the old east block
  const desk: WorldObjectDef = { id: "d1", kind: "desk", x: 70 - ox, y: 20 - oy, rot: 0, props: { level: 0 } };
  const r = moveBlocks(old, [desk]);
  assert.ok(r, "moved");
  assert.equal(moveBlocks(r.map, r.objects), null, "once");
  const g = levelMap(r.map, 0) as MapDef;
  for (const b of BLOCKS) {
    const a = g.areas.find((x) => x.key === b.key);
    assert.deepEqual([a?.x, a?.y], [b.x0 - ox, b.y0 - oy], `${b.name} where it stands now`);
  }
  // the old east block's glass is gone (its west wall, in the courtyard), its floor is land
  assert.equal(edgeAt(g, { dir: "v", x: 60 - ox, y: 30 - oy }), ".");
  assert.equal(tileAt(g, 66 - ox, 30 - oy), " ");
  // the desk went with it
  assert.deepEqual([r.moved[0]?.x, r.moved[0]?.y], [86 - ox, 20 - oy]);
});

test("the town: into the bar by its door, never through its wall; inside, you hear each other, not the street", () => {
  const { g0, grid, map } = ground();
  const bar = INSIDES.find((i) => i.b.sign === "BAR");
  assert.ok(bar);
  const b = bar.b;
  // its wall is a wall: from the pavement straight in, no
  assert.ok(!grid.clear(L(g0, b.x0 + 3, b.z0 - 1.5), L(g0, b.x0 + 3, b.z0 + 2)));
  // by the door, yes (from Main Street to a table)
  const r = walk(grid, g0, L(g0, (b.x0 + b.x1) / 2, -405), L(g0, b.x0 + 4.2, b.z0 + 6.5));
  const room = areaAt(g0, r.pos.x, r.pos.y);
  assert.equal(room?.name, "Bar");
  assert.equal(room?.kind, "private");
  // out on the street, the place is the street
  const street = L(g0, 430, -405);
  assert.equal(areaAt(g0, street.x, street.y)?.name, "Main Street");
  // hearing: two at the bar hear each other; someone on the pavement outside, nobody inside
  const ear = (p: { x: number; y: number }) => ({ ...p, level: 0 });
  const a = ear(L(g0, b.x0 + 4, b.z0 + 6));
  const c = ear(L(g0, b.x0 + 8, b.z0 + 10));
  const out = ear(L(g0, b.x0 + 4, b.z0 - 1.5));
  assert.ok(hearingGain(map, a, c) > 0, "inside, each other");
  assert.equal(hearingGain(map, a, out), 0, "the street can't hear the bar");
  assert.equal(hearingGain(map, out, a), 0);
});
