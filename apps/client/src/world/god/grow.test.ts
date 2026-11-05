import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits, growDefs } from "@yutopia/shared/grounds";
import { type GroundsEdits, NO_EDITS } from "@yutopia/shared/grounds-edits";
import { Scene } from "three";
import { hud } from "../store";
import { changeGrow, GrowTool, growAt, newGrowKey, removeGrow, snapRect } from "./grow";

// God mode grows the land (docs/plan/69-the-long-road.md, phase 10): a drag drawn out to the 32 m
// grid, a piece laid with the panel's biome (none over another), picked by a click, changed where
// it's added, and taken away — not while a road stands on it.

const at = (x: number, z: number) => ({ x, z, h: 0 });

function tool() {
  let draft: GroundsEdits = NO_EDITS;
  const steps: GroundsEdits[] = [];
  const t = new GrowTool(
    {
      draft: () => draft,
      change: (next) => {
        draft = next;
        steps.push(next);
        applyEdits(next);
      },
    },
    new Scene(),
  );
  const set = (d: GroundsEdits) => {
    draft = d;
    applyEdits(d);
  };
  return { t, steps, draft: () => draft, set };
}
const opts = (p: Partial<ReturnType<typeof hud.get>["god"]["grow"]>) =>
  hud.set((s) => ({ god: { ...s.god, grow: { ...s.god.grow, sel: null, blocked: null, drawing: null, ...p } } }));

test("a drag's rect: out to the grid round both ends, either way round, a cell at least", () => {
  assert.deepEqual(snapRect({ x: -90, z: 130 }, { x: 150, z: 630 }), { x0: -96, z0: 128, x1: 160, z1: 640 });
  assert.deepEqual(snapRect({ x: 150, z: 630 }, { x: -90, z: 130 }), { x0: -96, z0: 128, x1: 160, z1: 640 });
  // (on the grid already: as it is)
  assert.deepEqual(snapRect({ x: 0, z: 0 }, { x: 64, z: 96 }), { x0: 0, z0: 0, x1: 64, z1: 96 });
  // (a click: one cell)
  assert.deepEqual(snapRect({ x: 5, z: 5 }, { x: 5, z: 5 }), { x0: 0, z0: 0, x1: 32, z1: 32 });
});

test("the draft's pieces: found under a point, keyed afresh, changed where added, taken away", () => {
  const a = { key: "god-land-1", biome: "forest" as const, x0: 0, z0: 0, x1: 64, z1: 64 };
  const b = { key: "god-land-2", biome: "lake" as const, x0: 32, z0: 32, x1: 128, z1: 128 };
  assert.equal(growAt([a, b], 40, 40)?.key, "god-land-2", "the last laid first");
  assert.equal(growAt([a, b], 10, 10)?.key, "god-land-1");
  assert.equal(growAt([a, b], 64, 10), null, "its far edge out");
  const e: GroundsEdits = { rev: 1, land: { add: [a, b], change: { "god-land-1": { lift: 5 } } } };
  assert.equal(newGrowKey(e), "god-land-3");
  assert.equal(newGrowKey({ rev: 1, land: { add: [b] } }), "god-land-1");
  // (changed in its add entry, the old change folded in; a field set undefined dropped)
  const c = changeGrow(e, "god-land-1", { biome: "hills", name: undefined });
  assert.deepEqual(c.land?.add?.[0], { key: "god-land-1", biome: "hills", x0: 0, z0: 0, x1: 64, z1: 64, lift: 5 });
  assert.equal(c.land?.change, undefined);
  const r = removeGrow(e, "god-land-1");
  assert.deepEqual(
    r.land?.add?.map((d) => d.key),
    ["god-land-2"],
  );
  assert.equal(r.land?.change, undefined);
  assert.equal(r.land?.remove, undefined, "god mode's own: just gone");
});

test("the tool: drawn south of the town, laid with the panel's biome; over it refused; picked; changed; taken away", () => {
  const { t, steps, draft, set } = tool();
  set(NO_EDITS);
  opts({ biome: "meadow", lift: 12, name: "" });
  // drawn: from over the town's south edge out 500 m
  assert.ok(t.down(at(-90, 130)));
  t.move(at(150, 630));
  assert.ok(t.drawing);
  t.up(at(150, 630), false);
  assert.equal(steps.length, 1);
  assert.deepEqual(growDefs(draft()), [
    { key: "god-land-1", biome: "meadow", x0: -96, z0: 128, x1: 160, z1: 640, lift: 12 },
  ]);
  assert.equal(hud.get().god.grow.sel, "god-land-1", "the new one picked");
  // another over it: refused, nothing laid
  opts({ biome: "forest", lift: 0 });
  t.down(at(0, 300));
  t.move(at(300, 700));
  // (drawn as it goes: red, with why; its size)
  t.frame(at(300, 700), { y: 0 });
  assert.match(hud.get().god.grow.blocked ?? "", /over god-land-1/);
  assert.deepEqual(hud.get().god.grow.drawing, { x0: 0, z0: 288, x1: 320, z1: 704 });
  t.up(at(300, 700), false);
  assert.equal(steps.length, 1);
  assert.equal(hud.get().god.grow.drawing, null);
  // far off the land, joined to nothing: refused
  t.down(at(-5000, 5000));
  t.up(at(-4800, 5200), false);
  assert.equal(steps.length, 1);
  // a click inside it picks it (the panel takes its biome and lift)
  t.down(at(30, 400));
  t.up(at(30, 400), true);
  assert.equal(hud.get().god.grow.sel, "god-land-1");
  assert.equal(hud.get().god.grow.biome, "meadow");
  assert.equal(hud.get().god.grow.lift, 12);
  // changed: hills, named — in its add entry (a lake this near the town is refused: its shore would
  // be eased into the town's land)
  t.setOpts({ biome: "hills", name: "Long Mere" });
  assert.equal(steps.length, 2);
  assert.deepEqual(draft().land?.add?.[0], {
    key: "god-land-1",
    biome: "hills",
    x0: -96,
    z0: 128,
    x1: 160,
    z1: 640,
    lift: 12,
    name: "Long Mere",
  });
  assert.equal(draft().land?.change, undefined);
  // a slider dragged: not a step till it's let go
  t.setOpts({ lift: 30 }, false);
  assert.equal(steps.length, 2);
  t.setOpts({ lift: 30 });
  assert.equal(growDefs(draft())[0].lift, 30);
  // a road out onto it: the piece stays while it's there
  set({
    ...draft(),
    ways: {
      add: [
        {
          key: "god-south",
          kind: "road",
          name: "South Road",
          w: 7,
          pts: [
            [32, 150],
            [32, 300],
            [40, 500],
          ],
        },
      ],
    },
  });
  const n = steps.length;
  t.removePicked();
  assert.equal(steps.length, n, "refused: the road would be past the edge");
  assert.equal(growDefs(draft()).length, 1);
  // the road gone, it's taken away
  set({ ...draft(), ways: undefined });
  t.removePicked();
  assert.equal(steps.length, n + 1);
  assert.deepEqual(growDefs(draft()), []);
  assert.equal(hud.get().god.grow.sel, null);
  // (a click on nothing lets the picked one go)
  opts({ sel: "god-land-1" });
  t.down(at(30, 400));
  t.up(at(30, 400), true);
  assert.equal(hud.get().god.grow.sel, null);
  applyEdits(NO_EDITS);
});
