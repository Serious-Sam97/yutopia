import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, standHeight } from "./catalog.ts";
import { SEAT_NEXT, SEAT_SPEC, STAND, STAND_NEXT, SURFACE, SURFACE_NEXT, TOP_NEXT } from "./furniture.ts";
import { topsOnHosts } from "./tops.ts";

// Plan 67 phase 1 (docs/plan/67-the-furniture.md): the furniture's measures moved into one place in
// metres; the catalog reads them back exactly. Since seating and the desks went live (phase 3) the
// seats and surfaces are at true scale.

test("the catalog reads its surfaces and stand heights from the spec (m, exact)", () => {
  for (const [k, m] of Object.entries(SURFACE)) assert.equal(entry(k).surface, m, k);
  for (const [k, m] of Object.entries(STAND)) assert.equal(standHeight(k), m, k);
  // (plan 67 at true scale: a desk at 0.74, a counter at 0.90; the reception's top its work surface)
  assert.equal(SURFACE.desk, 0.74);
  assert.equal(SURFACE.counter, 0.9);
  assert.deepEqual(entry("reception").top, [0, 0, 12, 3]);
  // (a surface is stood on at its surface; thin things and walls never)
  assert.equal(standHeight("desk"), 0.74);
  assert.equal(standHeight("plant"), undefined);
  assert.equal(standHeight("whiteboard"), undefined);
});

test("the seats at true scale", () => {
  // a real chair's seat and a sofa's for the 1.79 m people (plan 67 B)
  assert.equal(SEAT_SPEC.chair.top, 0.47);
  assert.ok(SEAT_SPEC.sofa.top > 0.43 && SEAT_SPEC.sofa.top < 0.48);
  assert.equal(SEAT_SPEC.stool.rear, -0.15);
  // nothing awaiting sign-off on the seats, the surfaces, the stands (all in the world)
  assert.deepEqual(
    [SEAT_NEXT, SURFACE_NEXT, STAND_NEXT, TOP_NEXT].map((t) => Object.keys(t).length),
    [0, 0, 0, 0],
  );
});

test("things already on desks rise with them: each tabletop's z set from its host, once", () => {
  const desk = { id: "d", kind: "desk", x: 4, y: 3, yaw: quarterYaw(0) };
  const mug = { id: "m", kind: "tabletop", x: 4, y: 3, props: { d: "mug", c: [1, 1], z: 0.64 } };
  const upstairs = { ...desk, id: "d2", props: { level: 2 } };
  const mug2 = { ...mug, id: "m2", props: { ...mug.props, level: 2, z: 0.64 } };
  const loose = { id: "l", kind: "tabletop", x: 9, y: 9, props: { d: "mug", z: 0.64 } };
  const one = topsOnHosts([desk, mug, upstairs, mug2, loose]);
  assert.deepEqual(
    one.changed.map((o) => [o.id, o.props?.z]),
    [
      ["m", entry("desk").surface],
      ["m2", entry("desk").surface],
    ],
  );
  assert.equal(one.objects.find((o) => o.id === "l")?.props?.z, 0.64, "no host: left as it is");
  assert.equal(topsOnHosts(one.objects).changed.length, 0, "a second run changes nothing");
});
