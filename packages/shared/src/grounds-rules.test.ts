import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, checkEdits } from "./grounds.ts";
import { encodeHeights, type GroundsEdits, NO_EDITS } from "./grounds-edits.ts";

// God mode's rule book (docs/plan/53-the-god-mode.md § A): what a set of edits may do, the world
// server's say before a publish.

const N = CHUNK * 2 + 1;
const lift = (cm: number) => encodeHeights(new Int16Array(N * N).fill(cm));
const OK: GroundsEdits = {
  rev: 0,
  height: { "13,-8": lift(150) }, // the farm's field
  ways: {
    add: [
      {
        key: "god-pond-road",
        kind: "road",
        name: "Pond Road",
        w: 7,
        pts: [
          [-150, -150],
          [-125, -135],
          [-100, -120],
        ],
      },
    ],
    change: { main: { w: 12, lamps: true } }, // the shuttle's: wider, lit
  },
  buildings: {
    add: [
      {
        key: "god-pine",
        kind: "house",
        name: "Pine House",
        x0: -140,
        z0: -100,
        x1: -128,
        z1: -90,
        floors: 2,
        face: "s",
      },
    ],
  },
  things: { add: [{ key: "god-lamp-1", kind: "lamp-town", x: -110, z: -110, ry: 0 }], remove: ["lamp:clearing"] },
};
const has = (e: GroundsEdits, bit: RegExp) => checkEdits(e).some((s) => bit.test(s));

test("none, or a fair set: nothing wrong", () => {
  assert.deepEqual(checkEdits(NO_EDITS), []);
  assert.deepEqual(checkEdits(OK), []);
});

test("what's anchored stays: not taken away, not moved", () => {
  assert.ok(has({ rev: 0, ways: { remove: ["road"] } }, /Can't take away road/));
  assert.ok(
    has(
      {
        rev: 0,
        ways: {
          change: {
            main: {
              pts: [
                [0, 0],
                [9, 9],
              ],
            },
          },
        },
      },
      /Can't move main/,
    ),
  );
  assert.ok(has({ rev: 0, buildings: { remove: ["hq"] } }, /Can't take away hq/));
  assert.ok(has({ rev: 0, buildings: { change: { motors: { x0: 480 } } } }, /Can't move motors/));
  // (a town building that's no one's: fair game)
  assert.deepEqual(checkEdits({ rev: 0, buildings: { remove: ["books"] } }), []);
});

test("nothing on ground that stays as it is: the campus, the park, past the edge", () => {
  assert.ok(has({ rev: 0, height: { "0,0": lift(100) } }, /height 0,0: on ground that stays/));
  assert.ok(has({ rev: 0, height: { "99,0": lift(100) } }, /not a chunk/));
  assert.ok(
    has(
      {
        ...OK,
        ways: {
          add: [
            {
              key: "god-x",
              kind: "road",
              name: "X",
              w: 7,
              pts: [
                [-100, 30],
                [40, 30],
              ],
            },
          ],
        },
      },
      /god-x: through ground/,
    ),
  );
  assert.ok(
    has({ rev: 0, things: { add: [{ key: "god-l", kind: "lamp-lone", x: 20, z: 20, ry: 0 }] } }, /god-l: on ground/),
  );
});

test("the limits: sizes, kinds, keys, bounds", () => {
  assert.ok(has({ rev: 0, height: { "13,-8": lift(4000) } }, /out of bounds/));
  assert.ok(has({ rev: 0, height: { "13,-8": "AAAA" } }, /not 4225 values/));
  const house = OK.buildings?.add?.[0];
  assert.ok(house);
  assert.ok(has({ rev: 0, buildings: { add: [{ ...house, x1: -100 }] } }, /8–20 m a side/));
  assert.ok(has({ rev: 0, buildings: { add: [{ ...house, kind: "hq" }] } }, /not a kind god mode builds/));
  assert.ok(has({ rev: 0, buildings: { add: [{ ...house, key: "pine" }] } }, /"god-"/));
  assert.ok(has({ rev: 0, buildings: { add: [house, house] } }, /twice/));
  assert.ok(
    has({ rev: 0, buildings: { add: [{ ...house, x0: 378, z0: -396, x1: 392, z1: -384 }] } }, /on top of Bookshop/),
  );
  assert.ok(
    has(
      { rev: 0, things: { add: [{ key: "god-t", kind: "lamp-flood" as never, x: -110, z: -110, ry: 0 }] } },
      /not a kind of thing/,
    ),
  );
});
