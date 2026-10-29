import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits, CHUNK, checkEdits, LAMPS, SNOW_POLES, STREET, treesIn, WAYS } from "./grounds.ts";
import { oneTree, WoodsStroke } from "./grounds-brush.ts";
import { type GroundsEdits, NO_EDITS, type ThingDef } from "./grounds-edits.ts";
import { addThing, changeThing, removeThing, thingAt, thingBlocked, thingDefOf } from "./grounds-things.ts";
import { groundSolidsIn } from "./shapes/grounds.ts";

// God mode's nature and things (docs/plan/53-the-god-mode.md, phase 8): a boulder, a sign, a fence
// and a snow pole put down are drawn and solid where they are; the generator's lamp moved, its
// bench taken away; what the rule book refuses; the forest brush planting, clearing and putting
// back the woods, never a tree on a road.

const FIELD = { x: 446.5, z: -238.5 }; // (the farm's field: no road, no building)
const thing = (d: Partial<ThingDef> & { key: string; kind: ThingDef["kind"] }): ThingDef => ({
  x: FIELD.x,
  z: FIELD.z,
  ry: 0,
  ...d,
});
const solidsNear = (x: number, z: number, r: number) =>
  groundSolidsIn(Math.floor(x / CHUNK), Math.floor(z / CHUNK)).filter((g) => {
    const s = g.s as unknown as { x0?: number; x1?: number; z0?: number; z1?: number; x?: number; z?: number };
    const cx = s.x ?? ((s.x0 ?? 0) + (s.x1 ?? 0)) / 2;
    const cz = s.z ?? ((s.z0 ?? 0) + (s.z1 ?? 0)) / 2;
    return Math.hypot(cx - x, cz - z) < r;
  });

test("a boulder, a sign, a fence, a snow pole: laid, solid where they stand, by the rules", () => {
  applyEdits(NO_EDITS);
  let e: GroundsEdits = NO_EDITS;
  e = addThing(e, thing({ key: "god-thing-1", kind: "boulder", s: 1.4 }));
  e = addThing(e, thing({ key: "god-thing-2", kind: "sign", x: FIELD.x + 6, text: "Frost's Pond 200 m" }));
  e = addThing(
    e,
    thing({
      key: "god-thing-3",
      kind: "fence",
      x: FIELD.x - 10,
      z: FIELD.z + 6,
      pts: [
        [FIELD.x - 10, FIELD.z + 6],
        [FIELD.x + 10, FIELD.z + 6],
        [FIELD.x + 10, FIELD.z + 16],
      ],
    }),
  );
  e = addThing(e, thing({ key: "god-thing-4", kind: "snowpole", x: FIELD.x - 4 }));
  assert.deepEqual(checkEdits(e), []);
  applyEdits(e);
  assert.equal(STREET.find((t) => t.key === "god-thing-1")?.s, 1.4);
  assert.equal(STREET.find((t) => t.key === "god-thing-2")?.text, "Frost's Pond 200 m");
  assert.ok(SNOW_POLES.some((p) => p.key === "god-thing-4"));
  assert.ok(solidsNear(FIELD.x, FIELD.z, 0.5).length > 0, "the boulder's solid");
  assert.ok(solidsNear(FIELD.x, FIELD.z + 6, 6).length > 0, "the fence's solids along its line");
  assert.equal(thingAt(FIELD.x + 0.8, FIELD.z), "god-thing-1");
  assert.equal(thingAt(FIELD.x + 3, FIELD.z + 6.05), "god-thing-3", "a fence: by its line");
  assert.deepEqual(thingDefOf("god-thing-2")?.text, "Frost's Pond 200 m");
  applyEdits(NO_EDITS);
});

test("the rule book: too big, words where there are none, a fence too long or into the campus", () => {
  const no = (d: ThingDef) => checkEdits(addThing(NO_EDITS, d));
  assert.ok(no(thing({ key: "god-thing-1", kind: "boulder", s: 3 })).length);
  assert.ok(no(thing({ key: "god-thing-1", kind: "bench", s: 1.2 })).length);
  assert.ok(no(thing({ key: "god-thing-1", kind: "bench", text: "hi" })).length);
  assert.ok(no(thing({ key: "god-thing-1", kind: "sign", text: "x".repeat(41) })).length);
  assert.ok(
    no(
      thing({
        key: "god-thing-1",
        kind: "fence",
        pts: [
          [FIELD.x, FIELD.z],
          [FIELD.x + 70, FIELD.z],
        ],
      }),
    ).length,
  );
  assert.ok(
    no(
      thing({
        key: "god-thing-1",
        kind: "fence",
        x: -80,
        z: 0,
        pts: [
          [-80, 0],
          [-40, 0],
        ],
      }),
    ).some((p) => /stays as it is/.test(p)),
  );
  // where the tool won't put one down
  const road = WAYS.find((w) => w.key === "road") as (typeof WAYS)[number];
  const [rx, rz] = road.line[Math.floor(road.line.length / 2)];
  assert.match(thingBlocked("bench", rx, rz) ?? "", /County road/);
  assert.ok(thingBlocked("bench", 0, 0), "the campus");
  assert.equal(thingBlocked("bench", FIELD.x, FIELD.z), null);
});

test("the generator's: a lamp moved, a bench taken away; not moved into the campus", () => {
  applyEdits(NO_EDITS);
  const lamp = LAMPS.find((l) => l.kind === "town") as (typeof LAMPS)[number];
  const bench = STREET.find((t) => t.kind === "bench") as (typeof STREET)[number];
  let e = changeThing(NO_EDITS, lamp.key, { x: lamp.x + 2, z: lamp.z });
  e = removeThing(e, bench.key);
  assert.deepEqual(checkEdits(e), []);
  applyEdits(e);
  assert.equal(LAMPS.find((l) => l.key === lamp.key)?.x, lamp.x + 2);
  assert.ok(!STREET.some((t) => t.key === bench.key));
  assert.ok(checkEdits(changeThing(NO_EDITS, lamp.key, { x: 0, z: 0 })).some((p) => /stays as it is/.test(p)));
  applyEdits(NO_EDITS);
});

test("the forest brush: pines planted in the field, the woods cleared and back; none on a road", () => {
  applyEdits(NO_EDITS);
  const cx = Math.floor(FIELD.x / CHUNK);
  const cz = Math.floor(FIELD.z / CHUNK);
  const before = treesIn(cx, cz).length;
  const p = new WoodsStroke(NO_EDITS, "plant", "pine", 1, 20);
  p.apply(FIELD.x, FIELD.z);
  const planted = p.edits();
  assert.deepEqual(checkEdits(planted), []);
  applyEdits(planted);
  const now = treesIn(cx, cz);
  assert.ok(now.length > before + 10, `${before} → ${now.length}`);
  assert.ok(now.filter((t) => Math.hypot(t.x - FIELD.x, t.z - FIELD.z) < 9).every((t) => t.kind === "pine"));
  // half as thick: about half of them
  const half = new WoodsStroke(NO_EDITS, "plant", "mix", 0.5, 20);
  half.apply(FIELD.x, FIELD.z);
  applyEdits(half.edits());
  const n = treesIn(cx, cz).length - before;
  assert.ok(n > 3 && n < now.length - before - 3, `half: ${n} of ${now.length - before}`);
  // the woods west of the HQ cleared, then as made again
  const W = { x: -150, z: -110 };
  const wx = Math.floor(W.x / CHUNK);
  const wz = Math.floor(W.z / CHUNK);
  applyEdits(NO_EDITS);
  const woods = treesIn(wx, wz).length;
  const clear = new WoodsStroke(NO_EDITS, "clear", "pine", 1, 64);
  clear.apply(wx * CHUNK + 16, wz * CHUNK + 16);
  const cleared = clear.edits();
  applyEdits(cleared);
  assert.ok(treesIn(wx, wz).length < woods / 3, `cleared ${woods} → ${treesIn(wx, wz).length}`);
  const back = new WoodsStroke(cleared, "generated", "pine", 1, 64);
  back.apply(wx * CHUNK + 16, wz * CHUNK + 16);
  applyEdits(back.edits());
  assert.equal(treesIn(wx, wz).length, woods);
  assert.equal(back.edits().trees, undefined, "nothing left of it");
  // planted over the county road: none on the road itself
  const road = WAYS.find((w) => w.key === "road") as (typeof WAYS)[number];
  const [rx, rz] = road.line[Math.floor(road.line.length / 2)];
  const over = new WoodsStroke(NO_EDITS, "plant", "pine", 1, 30);
  over.apply(rx, rz);
  applyEdits(over.edits());
  const onRoad = treesIn(Math.floor(rx / CHUNK), Math.floor(rz / CHUNK)).filter(
    (t) => Math.hypot(t.x - rx, t.z - rz) < 14 && road.line.some(([x, z]) => Math.hypot(x - t.x, z - t.z) < road.w / 2),
  );
  assert.deepEqual(onRoad, []);
  // one tree, then none
  applyEdits(NO_EDITS);
  const one = oneTree(NO_EDITS, FIELD.x, FIELD.z, "birch");
  applyEdits(one);
  assert.ok(treesIn(cx, cz).some((t) => t.kind === "birch" && Math.hypot(t.x - FIELD.x, t.z - FIELD.z) < 3.3));
  applyEdits(oneTree(one, FIELD.x, FIELD.z, null));
  assert.ok(!treesIn(cx, cz).some((t) => t.kind === "birch" && Math.hypot(t.x - FIELD.x, t.z - FIELD.z) < 3.3));
  applyEdits(NO_EDITS);
});
