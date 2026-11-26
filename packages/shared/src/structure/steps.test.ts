import assert from "node:assert/strict";
import { test } from "node:test";
import { flightBoxes } from "./flights.ts";
import { placeOnWall } from "./free-openings.ts";
import { doorSteps } from "./steps.ts";
import type { Structure, Wall } from "./types.ts";

// (asked 2026-11-26) the steps up onto a foundation: at every door out of it, from the yard's land to the pad's edge.

const pad: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 8],
  [0, 8],
];
const front: Wall = { id: "w1", floor: 5, a: [1, 1], b: [9, 1], base: 0.75, height: 3, front: "p" };
const st = (found: number): Structure =>
  ({
    version: 4,
    key: "t",
    name: "t",
    home: 0,
    spawn: [0, 0],
    floors: [
      { index: 5, name: "G", z: 0.75, grid: { x0: -5, y0: -5, w: 20, h: 20 }, space: "home:t", storey: 0, found },
    ],
    slabs: [],
    walls: [front],
    rooms: [
      {
        key: "r",
        floor: 5,
        outline: [
          [1, 1],
          [9, 1],
          [9, 7],
          [1, 7],
        ],
        rect: [1, 1, 9, 7],
        props: {},
      },
    ],
    layers: { found: { "5": [{ ring: pad, style: "brick" }] } },
  }) as never;
const door = (at: number) => {
  const props = { free: true, on: { wall: "w1", at }, level: 5 };
  return { id: "d1", kind: "door", ...placeOnWall(front, at, { kind: "door", props }), props };
};

test("a door out of a house on a foundation: steps from the land up to the pad's edge in front of it", () => {
  const [f] = doorSteps(st(0.75), 5, [door(4)]);
  assert.ok(f, "steps");
  assert.equal(f.rise, 0.75);
  assert.equal(f.base, -0.75, "its foot on the land");
  assert.ok(f.solid);
  // (they climb +y — towards the door, from the yard's side, the side out of the room)
  assert.ok(Math.abs(Math.sin(f.dir) - 1) < 1e-6);
  const boxes = flightBoxes(f).filter((b) => b.part === "tread");
  const topTread = boxes.reduce((a, b) => (b.y1 > a.y1 ? b : a));
  assert.ok(Math.abs(topTread.y1 - 0.75) < 1e-6, "its top tread at the floor");
  // (its top tread just out from the pad's edge at y 0, in front of the door's middle)
  assert.ok(topTread.y < 0 && topTread.y > -0.4, `top tread at ${topTread.y}`);
  assert.ok(Math.abs(f.x - 4.5) < 0.6);
  // (no foundation, no steps; a window, none)
  assert.equal(doorSteps(st(0), 5, [door(4)]).length, 0);
  assert.equal(doorSteps(st(0.75), 5, [{ ...door(4), kind: "window" }]).length, 0);
});

test("no steps where a wall stands between the door and the pad's edge", () => {
  const s = st(0.75) as Structure;
  // (no room round it: both sides open — the nearer edge, behind it, walled off by a wall along y 0.5)
  const open = {
    ...s,
    rooms: [],
    walls: [...s.walls, { id: "w2", floor: 5, a: [0, 0.5], b: [10, 0.5], base: 0.75, height: 3, front: "p" }],
  } as Structure;
  // (the far side's edge at y 8 is past a porch's reach: none at all — never behind the wall)
  assert.equal(doorSteps(open, 5, [door(4)]).length, 0);
  // (the wall gone: there again)
  assert.equal(doorSteps({ ...open, walls: s.walls }, 5, [door(4)]).length, 1);
});
