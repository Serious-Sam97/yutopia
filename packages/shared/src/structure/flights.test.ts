import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Flight,
  flightAddOps,
  flightBounds,
  flightBoxes,
  flightRemoveOps,
  flightTop,
  flightWhy,
  stepsOf,
} from "./flights.ts";
import { applyOps } from "./ops.ts";
import type { Structure } from "./types.ts";

// Plan 130 phase 6: stairs built with one tool — straight, L, U, spiral, ladder; the hole above, railed.

const f0: Flight = {
  id: "s1",
  x: 5,
  y: 5,
  dir: 0,
  shape: "straight",
  turn: 1,
  width: 1,
  rise: 3.5,
  style: "oak",
  rail: "balusters",
};
const st = (): Structure => ({
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [0, 0],
  floors: [
    { index: 0, name: "G", z: 0, grid: { x0: 0, y0: 0, w: 20, h: 20 } },
    { index: 1, name: "1", z: 3.5, grid: { x0: 0, y0: 0, w: 20, h: 20 } },
  ],
  slabs: [
    {
      id: "up",
      floor: 1,
      z: 3.5,
      top: ".",
      outline: [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
      holes: [],
    },
  ],
  walls: [],
  rooms: [],
});

test("a straight flight: its risers under 20 cm, its treads up along its way, its top a storey up", () => {
  const n = stepsOf(f0);
  assert.ok(3.5 / n <= 0.2);
  const treads = flightBoxes(f0).filter((b) => b.part === "tread");
  assert.equal(treads.length, n);
  assert.ok(Math.abs(treads[n - 1].y1 - 3.5) < 1e-9);
  // (dir 0: climbing +x)
  assert.ok(treads[n - 1].x > treads[0].x + 4);
  assert.ok(Math.abs(flightTop(f0).at[0] - (5 + n * 0.28)) < 1e-6);
});

test("an L turns to its left, a U comes back beside itself", () => {
  const l = flightBoxes({ ...f0, shape: "l" }).filter((b) => b.part === "tread");
  // (dir 0, its left +y: the second run climbs +y)
  assert.ok(l[l.length - 1].y > l[0].y + 1.5);
  const u = flightTop({ ...f0, shape: "u" });
  assert.ok(Math.abs(u.at[0] - 5) < 1.2 && u.at[1] > 5.5, `a U's top back by its foot (${u.at})`);
  const r = flightBoxes({ ...f0, shape: "l", turn: -1 }).filter((b) => b.part === "tread");
  assert.ok(r[r.length - 1].y < r[0].y - 1.5);
});

test("put up a storey: a hole in the floor over it, railed but where it comes up; taken away, both gone", () => {
  const s = st();
  assert.equal(flightWhy(s, 0, f0), null);
  const t = applyOps(s, flightAddOps(s, 0, f0, 1));
  const up = t.slabs.find((x) => x.id === "up");
  assert.equal(up?.holes.length, 1);
  const rails = t.walls.filter((w) => w.id.startsWith("rail-s1-"));
  assert.equal(rails.length, 3);
  const b = flightBounds(f0);
  assert.ok(rails.every((w) => w.style === "rail"));
  // (the side it comes out at — its far end, +x — has none)
  assert.ok(!rails.some((w) => Math.abs(w.a[0] - (b.x1 + 0.05)) < 1e-3 && Math.abs(w.b[0] - (b.x1 + 0.05)) < 1e-3));
  const ops = flightRemoveOps(t, 0, "s1", 1);
  assert.ok(Array.isArray(ops));
  const back = applyOps(t, ops);
  assert.equal(back.slabs.find((x) => x.id === "up")?.holes.length, 0);
  assert.equal(back.walls.length, 0);
});

test("off the floor: refused", () => {
  assert.equal(flightWhy(st(), 0, { ...f0, x: 18 }), "off the floor");
});
