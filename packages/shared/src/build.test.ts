import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace, TEMPLATES } from "./build.ts";
import { entry, variantOf, type WorldObjectDef } from "./catalog.ts";
import { dressItems } from "./dressing.ts";
import { studio } from "./maps/studio.ts";
import { carried, hostOf, riders, splitAll, splitBuiltIns, surfaceAt, topAt, topCentre, topRect } from "./tops.ts";

const desk = (x: number, y: number, rot = 0): WorldObjectDef => ({ id: "desk", kind: "desk", x, y, rot });
// a tabletop with its back corner on world cell (qx, qy) (quarter tiles)
const top = (id: string, d: string, qx: number, qy: number, rot = 0): WorldObjectDef =>
  topAt({ id, kind: "tabletop", x: 0, y: 0, rot, props: { d } }, qx, qy);

test("a desk takes as many things as fit, a quarter tile at a time", () => {
  const free = studio.objects.filter((o) => o.x > 20 || o.y > 20); // clear a corner of the tracking room
  const d = desk(10, 3);
  const all = [...free, d];
  // four mugs on one tile of the desk
  const mugs = [0, 1, 2, 3].map((i) => top(`m${i}`, "mug", 44 + i, 13));
  let placed = [...all];
  for (const m of mugs) {
    assert.ok(canPlace(studio, placed, m), `${m.id} fits`);
    placed = [...placed, m];
  }
  // not on another, not on the floor, not hanging over the edge
  assert.ok(!canPlace(studio, placed, top("x", "mug", 45, 13)), "on a mug");
  assert.ok(!canPlace(studio, all, top("x", "mug", 52, 13)), "on the floor");
  assert.ok(!canPlace(studio, all, top("x", "monitor", 47, 15)), "half off the edge");
  // a monitor across the middle of the desk (its two tiles) is fine
  assert.ok(canPlace(studio, all, top("x", "monitor", 43, 13)));
  assert.equal(hostOf(all, top("x", "monitor", 43, 13))?.id, "desk");
  assert.equal(surfaceAt([d], 11, 3)?.id, "desk");
  assert.equal(surfaceAt([d], 12, 3), undefined);
});

test("a shelf's top is narrower than the shelf", () => {
  const shelf: WorldObjectDef = { id: "s", kind: "tape_shelf", x: 5, y: 5, rot: 0 };
  assert.ok(hostOf([shelf], top("p", "photo", 21, 21)), "the middle of the top");
  assert.ok(!hostOf([shelf], top("p", "photo", 21, 20)), "the front edge is open shelving");
  // turned, the narrow top turns with it
  const turned = { ...shelf, rot: 1 };
  assert.ok(hostOf([turned], top("p", "photo", 21, 21)));
  assert.ok(!hostOf([turned], top("p", "photo", 20, 21)));
});

test("what stands on a surface rides along when it moves or turns, and turns too", () => {
  const before = desk(5, 5);
  const kb = top("kb", "keyboard", 25, 20); // the right seat's keyboard, at the front
  const at = (after: WorldObjectDef) =>
    carried(before, after, [before, kb]).map((t) => {
      const c = topCentre(t);
      return [c.x, c.y, t.rot];
    });
  assert.deepEqual(at(desk(10, 2)), [[11.5, 2.125, 0]], "moved: same spot");
  // a half turn: the keyboard goes to the other side, facing the other way
  assert.deepEqual(at(desk(10, 2, 2)), [[10.5, 2.875, 2]]);
  // round trip: turned away and back, it's where it started
  const turned = carried(before, desk(5, 5, 1), [before, kb])[0];
  const back = carried(desk(5, 5, 1), before, [desk(5, 5, 1), turned])[0];
  assert.deepEqual(topRect(back), topRect(kb));
  assert.equal(back.rot, 0);
  // only things on it come along
  assert.deepEqual(riders(before, [before, top("far", "mug", 80, 80)]), []);
});

test("bare furniture: what used to be drawn on it becomes real things, once", () => {
  const d = desk(10, 3, 2);
  const s = splitBuiltIns(d);
  assert.ok(s);
  assert.equal(s.self.props?.split, 1);
  const kinds = s.add.map((t) => t.props?.d).sort();
  assert.deepEqual(kinds.slice(0, 2), ["keyboard", "keyboard"]);
  assert.equal(kinds.filter((k) => k === "monitor").length, 2);
  // all on the desk, none on another, monitors facing the sitter (turned with it)
  let placed: WorldObjectDef[] = [s.self];
  for (const t of s.add) {
    assert.ok(canPlace(studio, placed, t), `${t.props?.d} fits`);
    placed = [...placed, t];
  }
  assert.ok(s.add.filter((t) => t.props?.d === "monitor").every((t) => t.rot === 2));
  assert.ok(s.add.every((t) => t.props?.z === 25));
  // a second run finds it split
  assert.equal(splitBuiltIns(s.self), null);
  // the radio steps onto a side table of its own
  const r = splitBuiltIns({ id: "radio", kind: "radio", x: 3, y: 4, rot: 0 });
  assert.equal(r?.add[0].kind, "side_table");
  assert.ok(r && canPlace(studio, r.add, r.self));
  // a whole room: hosts first, ids stable, the second run changes nothing
  const one = splitAll(studio.objects);
  assert.ok(one.changed.length > 0);
  const firstTop = one.objects.findIndex((o) => entry(o.kind).onSurface);
  assert.ok(
    one.objects.slice(firstTop).every((o) => entry(o.kind).onSurface),
    "hosts before tops",
  );
  assert.equal(splitAll(one.objects).changed.length, 0);
  // the layouts come set up
  assert.ok(TEMPLATES.every((t) => t.objects.some((o) => o.props?.d === "monitor")));
});

test("a look: props.variant when valid, else the kind's own or seeded by id", () => {
  assert.equal(entry("desk").variants, 4);
  assert.equal(variantOf({ kind: "desk", id: "a", props: { variant: 2 } }, 0.9), 2);
  assert.equal(variantOf({ kind: "chair", id: "a", props: { variant: 7 } }, 0.9), 3, "out of range: seeded");
  assert.equal(variantOf({ kind: "chair", id: "a" }, 0.1), 0);
  assert.equal(variantOf({ kind: "desk", id: "a", props: { variant: 7 } }, 0.9), 0, "desks: walnut until changed");
  assert.equal(variantOf({ kind: "bench", id: "a", props: { variant: 1 } }, 0.5), 0, "one look only");
});

test("a room's hidden pieces keep the rules out of the way; nothing's generated on desks", () => {
  const all = dressItems(studio, studio.objects);
  const piece = all.find((d) => d.kind !== "frame");
  assert.ok(piece, "the studio has floor clutter");
  const areas = studio.areas.map((a) => ({ ...a, dressOff: [piece.id] }));
  const off = dressItems({ ...studio, areas }, studio.objects);
  assert.ok(!off.some((d) => d.id === piece.id), "hidden");
  assert.equal(off.length, all.length - 1, "only that one");
  assert.ok(
    all.every((d) => d.z === 0),
    "no generated clutter on surfaces",
  );
});
