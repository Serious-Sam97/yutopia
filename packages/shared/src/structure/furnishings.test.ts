// Plan 113 — the town's furnished buildings laid out by hand, and every storeyed building's stairs: each layout laid
// as the world server lays it (structure/spaces.ts) and held to the rules (furnishings-check.ts) — nothing through a
// wall or another piece, nothing in a window or the doorway, the stairs clear, every seat and counter reached from
// the door and every seat facing its table or the room.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILDINGS } from "../grounds.ts";
import { FURNISHED, STAIRS } from "./furnish-layouts.ts";
import { frameOf, layoutThings, stairsAt, toWorld, yawOf } from "./furnishings.ts";
import { layoutProblems } from "./furnishings-check.ts";
import { hasSpace, layoutFor, laySpace } from "./spaces.ts";
import type { Structure } from "./types.ts";

const empty = (): Structure => ({
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [0, 0],
  floors: [{ index: 0, name: "g", z: 0, grid: { x0: 0, y0: 0, w: 1, h: 1 } }],
  slabs: [],
  walls: [],
  rooms: [],
});

test("every hand-made layout holds: walls, pieces, windows, the doorway, the stairs, reach, facing", () => {
  const keys = [...new Set([...Object.keys(FURNISHED), ...Object.keys(STAIRS)])];
  assert.ok(keys.length >= 25, `${keys.length} layouts`);
  const bad: string[] = [];
  for (const key of keys) {
    const b = BUILDINGS.find((q) => q.key === key);
    assert.ok(b && hasSpace(b), `${key}: a building with a space`);
    const layout = layoutFor(b);
    assert.ok(layout, key);
    const s = laySpace(empty(), b);
    assert.ok(s, key);
    const things = [
      ...s.things,
      ...layoutThings(
        b,
        layout,
        s.floors.map((f) => f.index),
      ),
    ];
    for (const p of layoutProblems(b, layout, s.floors, s.walls, things)) bad.push(`${key}: ${p}`);
  }
  assert.deepEqual(bad, []);
});

test("the furnished six are laid with their own: the bar's counter down its side, the farmhouse's beds upstairs", () => {
  for (const key of ["bar", "diner", "market", "farmhouse", "barn", "gatehouse"]) {
    const b = BUILDINGS.find((q) => q.key === key);
    assert.ok(b?.enter, `${key}: furnished`);
    assert.equal(layoutFor(b), FURNISHED[key]);
  }
  const bar = BUILDINGS.find((q) => q.key === "bar");
  assert.ok(bar);
  const s = laySpace(empty(), bar);
  assert.ok(s);
  const things = layoutThings(
    bar,
    FURNISHED.bar,
    s.floors.map((f) => f.index),
  );
  const counters = things.filter((o) => o.kind === "bar_counter");
  assert.equal(counters.length, 3);
  // (down the +u wall: the east one, the bar facing the north-facing frame's −u, west)
  assert.ok(counters.every((o) => o.x > bar.x0 + 12 && Math.abs((o.yaw ?? 0) - Math.PI / 2) < 1e-4));
  const farm = BUILDINGS.find((q) => q.key === "farmhouse");
  assert.ok(farm);
  const fs = laySpace(empty(), farm);
  assert.ok(fs);
  const ft = layoutThings(
    farm,
    FURNISHED.farmhouse,
    fs.floors.map((f) => f.index),
  );
  assert.equal(ft.filter((o) => o.kind === "double_bed" && o.props?.level === fs.floors[1].index).length, 2);
  assert.ok(
    fs.walls.some((w) => w.id === `sp-farmhouse-w0` && !w.shell),
    "its hall's walls",
  );
});

test("a building's frame from its door: turned with it, its stairs turned too", () => {
  const bar = BUILDINGS.find((q) => q.key === "bar");
  const gate = BUILDINGS.find((q) => q.key === "gatehouse");
  assert.ok(bar && gate);
  const fb = frameOf(bar);
  const fg = frameOf(gate);
  assert.ok(fb && fg);
  // (the bar's door looks north: its frame the plain one; the gatehouse's west, a quarter round)
  assert.deepEqual([fb.q, fb.U, fb.V], [0, [1, 0], [0, 1]]);
  assert.equal(fg.q, 3);
  assert.deepEqual(toWorld(fb, 0, 0), [bar.x0, bar.z0]);
  // (a piece facing in, yaw 0 in the north frame; in the west frame a quarter on: facing east, +x)
  assert.equal(yawOf(fb, "in"), 0);
  const y = yawOf(fg, "in");
  assert.ok(Math.abs(-Math.sin(y) - 1) < 1e-4 && Math.abs(Math.cos(y)) < 1e-4, `${y}`);
  // (the bar's stairs across its back, their door looking west)
  const st = stairsAt(bar, FURNISHED.bar.stairs as NonNullable<typeof FURNISHED.bar.stairs>);
  assert.deepEqual(st, { x: bar.x0 + 6, y: bar.z0 + 12, rot: 3 });
});
