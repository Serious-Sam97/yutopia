import assert from "node:assert/strict";
import { test } from "node:test";
import { getMap } from "../index.ts";
import { STOREY } from "../units.ts";
import { wallsEdit } from "./edit.ts";
import { finishWorld } from "./finish.ts";
import { structureFromMap } from "./from-map.ts";
import { applyOps, invertOps } from "./ops.ts";
import { cellTop } from "./query.ts";
import { selfCrosses, slabAt, slabsEdit, slabWhy, workingHeights } from "./slab-edit.ts";
import type { XY } from "./types.ts";
import { viewOf } from "./view.ts";

// Phase 11.7 (docs/plan/72): floors drawn free — polygons at the floor's height or a mezzanine's.

const studio = getMap("studio");
const s = structureFromMap(finishWorld(studio, studio.objects, { fresh: true, building: true }).map);
const f3 = s.floors.find((f) => f.index === 3);
const tri: XY[] = [
  [20, 10],
  [26, 10],
  [20, 16],
];
let n = 0;
const id = () => `s${n++}`;

test("a floor drawn: a triangle of carpet, an operation, undone", () => {
  assert.equal(slabWhy(s, 3, { outline: tri, top: "," }), null);
  const r = slabsEdit(s, 3, [{ outline: tri, top: "," }], [], id);
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  const sl = after.slabs.find((x) => x.id === r.added[0].id);
  assert.equal(sl?.z, f3?.z);
  assert.equal(slabAt(after, 3, [21, 11])?.id, sl?.id, "the last drawn on top");
  const back = applyOps(after, invertOps(s, [r.op]));
  const ids = (l: typeof s.slabs) => l.map((x) => JSON.stringify(x)).sort();
  assert.deepEqual(ids(back.slabs), ids(s.slabs));
});

test("what it won't take: crossing edges, too small, off the floor, no such material, no headroom", () => {
  const bow: XY[] = [
    [20, 10],
    [24, 14],
    [24, 10],
    [20, 14],
  ];
  assert.ok(selfCrosses(bow));
  assert.equal(slabWhy(s, 3, { outline: bow, top: "." }), "its edges cross");
  assert.equal(
    slabWhy(s, 3, {
      outline: [
        [20, 10],
        [20.2, 10],
        [20, 10.2],
      ],
      top: ".",
    }),
    "too small",
  );
  assert.equal(
    slabWhy(s, 3, {
      outline: [
        [-9, 10],
        [26, 10],
        [20, 16],
      ],
      top: ".",
    }),
    "off the floor",
  );
  assert.equal(slabWhy(s, 3, { outline: tri, top: "q" }), "not a floor's material");
  assert.equal(slabWhy(s, 3, { outline: tri, top: ".", over: 0.4 }), "not a floor's height");
  assert.equal(slabWhy(s, 3, { outline: tri, top: ".", over: STOREY - 0.2 }), "not a floor's height");
});

test("a mezzanine: its own height, not the floor's tiles, solid in Jolt up there; a wall stood on it", async () => {
  const { buildingSolids } = await import("../physics/build.ts");
  const deck: XY[] = [
    [20, 10],
    [26, 10],
    [26, 14],
    [20, 14],
  ];
  const r = slabsEdit(s, 3, [{ outline: deck, top: ".", over: 1.75 }], [], id);
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  assert.deepEqual(workingHeights(after, 3), [0, 1.75]);
  // the tile map is the floor's own (the mezzanine isn't its tiles)
  const lv = (st: typeof s) => {
    const f = st.floors.find((q) => q.index === 3);
    if (!f) return "";
    const out: string[] = [];
    for (let y = f.grid.y0; y < f.grid.y0 + f.grid.h; y++)
      for (let x = f.grid.x0; x < f.grid.x0 + f.grid.w; x++) out.push(cellTop(st, 3, x, y));
    return out.join("");
  };
  assert.equal(lv(after), lv(s));
  // Jolt: a slab box at the deck's height over (23, 12)
  const z = (f3?.z ?? 0) + 1.75;
  const b = buildingSolids(viewOf(after), [], after);
  const at = [...b.statics.entries()]
    .filter(([k]) => k.startsWith("slab:3:"))
    .flatMap(([, v]) => v.solids)
    .some(
      (q) =>
        q.t === "box" &&
        Math.abs(q.y + q.hy - z) < 1e-6 &&
        Math.abs(q.x - 23) <= q.hx + 1e-6 &&
        Math.abs(q.z - 12) <= q.hz + 1e-6,
    );
  assert.ok(at, "its top at its height");
  // a rail on it: stood at its height; a full wall up there pokes through the ceiling: refused
  const w = wallsEdit(after, 3, [{ a: [20, 14], b: [26, 14], front: "p", height: 1.1, over: 1.75 }], [], () => "rail");
  assert.ok("op" in w);
  assert.equal(w.added[0].base, Math.round(z * 1000) / 1000);
  assert.deepEqual(
    wallsEdit(after, 3, [{ a: [20, 14], b: [26, 14], front: "p", over: 1.75 }], [], () => "x"),
    { why: "too high up there" },
  );
  assert.deepEqual(
    wallsEdit(s, 3, [{ a: [20, 14], b: [26, 14], front: "p", height: 1.1, over: 1.75 }], [], () => "x"),
    { why: "no floor up there" },
  );
});

test("floors overlapping: one floor (Jolt's boxes cover both, no hole where they meet)", async () => {
  const { buildingSolids } = await import("../physics/build.ts");
  // a carpet square half over a wood one, both drawn on an open spot outside the building's own
  const a: XY[] = [
    [2, 2],
    [8, 2],
    [8, 6],
    [2, 6],
  ];
  const b: XY[] = [
    [5, 3],
    [11, 3],
    [11, 8],
    [5, 8],
  ];
  const r = slabsEdit(
    s,
    3,
    [
      { outline: a, top: "." },
      { outline: b, top: "," },
    ],
    [],
    id,
  );
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  const sol = buildingSolids(viewOf(after), [], after);
  const boxes = [...sol.statics.entries()].filter(([k]) => k.startsWith("slab:3:")).flatMap(([, v]) => v.solids);
  const under = (x: number, y: number) =>
    boxes.some((q) => q.t === "box" && Math.abs(q.x - x) <= q.hx + 1e-6 && Math.abs(q.z - y) <= q.hz + 1e-6);
  assert.ok(under(6, 4), "where they overlap");
  assert.ok(under(3, 3) && under(10, 7), "each on its own");
  assert.equal(slabAt(after, 3, [6, 4])?.top, ",", "the last drawn on top");
});
