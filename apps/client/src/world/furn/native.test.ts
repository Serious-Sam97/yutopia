import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, SEAT_NEXT, SEAT_SPEC, SURFACE, SURFACE_NEXT, TOP_NEXT } from "@yutopia/shared";

// (what the kit draws is sat on and stood on as the spec says: in the world, or awaiting sign-off)
const SEAT = { ...SEAT_SPEC, ...SEAT_NEXT };
const SURF = { ...SURFACE, ...SURFACE_NEXT };

import { turnPoint } from "@yutopia/shared/shapes";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { Out } from "../tp/kit3d";
import { CEL_ALPHA } from "./look";
import { modelOf, nativeInto } from "./native";

// Plan 67 phase 1 (docs/plan/67-the-furniture.md): a kind the kit draws stays on its footprint,
// its anchors are where its spec says (the task chair's seat at SEAT_NEXT's top), and it's turned
// into the world exactly as the physics' shapes are (shared turnPoint), marked for the cel.

const chair = { id: "c", kind: "chair", x: 5, y: 7, rot: 0 };

/** What's hit looking straight down at (x, z) from `from` m up: its height (0: nothing). */
function topAt(g: BufferGeometry, x: number, z: number, from = 0.6): number {
  const ray = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))[0];
  return hit ? hit.point.y : 0;
}

function bounds(pos: ArrayLike<number>) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i < pos.length; i += 3) {
    b.x0 = Math.min(b.x0, pos[i]);
    b.x1 = Math.max(b.x1, pos[i]);
    b.y0 = Math.min(b.y0, pos[i + 1]);
    b.y1 = Math.max(b.y1, pos[i + 1]);
    b.z0 = Math.min(b.z0, pos[i + 2]);
    b.z1 = Math.max(b.z1, pos[i + 2]);
  }
  return b;
}

test("the task chair stands on its tile, its seat where the spec sits you", () => {
  const g = modelOf(chair);
  const b = bounds(g.attributes.position.array);
  assert.ok(b.x0 >= 0 && b.x1 <= 1 && b.z0 >= 0 && b.z1 <= 1, `on its 1×1: ${JSON.stringify(b)}`);
  assert.ok(Math.abs(b.y0) < 0.005, `on the floor: ${b.y0}`);
  assert.ok(b.y1 > 1 && b.y1 < 1.2, `its back's top ${b.y1}`);
  // the cushion's top over the seat's middle
  const top = topAt(g, 0.5, 0.52);
  assert.ok(Math.abs(top - SEAT.chair.top) < 0.015, `the seat ${top.toFixed(3)} vs ${SEAT.chair.top}`);
  // (the same look, the same model: built once)
  assert.equal(modelOf({ ...chair, x: 9 }), g);
  assert.notEqual(modelOf({ ...chair, props: { color: "#9a4a32" } }), g);
});

test("turned as the shapes are, every turn; its vertices marked for the cel", () => {
  const g = modelOf(chair);
  const m = bounds(g.attributes.position.array);
  for (let rot = 0; rot < 4; rot++) {
    const out = new Out();
    nativeInto(out, { ...chair, rot });
    const b = bounds(out.lit.pos);
    const a = turnPoint({ ...chair, rot }, 1, 1, m.x0, m.z0);
    const c = turnPoint({ ...chair, rot }, 1, 1, m.x1, m.z1);
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-5;
    assert.ok(near(b.x0, Math.min(a.x, c.x)) && near(b.x1, Math.max(a.x, c.x)), `rot ${rot}: x`);
    assert.ok(near(b.z0, Math.min(a.z, c.z)) && near(b.z1, Math.max(a.z, c.z)), `rot ${rot}: z`);
    assert.ok(near(b.y1, m.y1), `rot ${rot}: y`);
    assert.equal(out.lit.pos.length, g.attributes.position.count * 3);
    for (let i = 3; i < out.lit.col.length; i += 4) assert.equal(out.lit.col[i], CEL_ALPHA);
    assert.equal(out.soft.rects.length, 1, "its shadow on the floor");
  }
  // sat at a desk (plan 62's pull): moved the way it faces (+y at rot 0, −x at rot 1), the same model
  for (const [rot, dx, dz] of [
    [0, 0, 0.4],
    [1, -0.4, 0],
  ]) {
    const a = new Out();
    const b = new Out();
    nativeInto(a, { ...chair, rot });
    nativeInto(b, { ...chair, rot, props: { pull: 0.4 } });
    const ba = bounds(a.lit.pos);
    const bb = bounds(b.lit.pos);
    assert.ok(Math.abs(bb.x0 - ba.x0 - dx) < 1e-5 && Math.abs(bb.z0 - ba.z0 - dz) < 1e-5, `pulled at rot ${rot}`);
  }
});

// Plan 67 phase 2: every seat, every look, with and without its story, sat on or not — on its
// footprint at every turn, on the floor, its seat where the spec sits you, within its budget.
test("every seat and look: on its footprint, on the floor, its seat at its spec, under 8k tris", () => {
  const looks: Record<string, number> = { chair: 4, armchair: 2, sofa: 3, beanbag: 1, bench: 1 };
  for (const [kind, n] of Object.entries(looks)) {
    const e = { chair: [1, 1], armchair: [1, 1], sofa: [3, 1], beanbag: [1, 1], bench: [3, 1] }[kind] as number[];
    for (let variant = 0; variant < n; variant++)
      for (const id of ["a", "b", "c", "d", "e", "f"])
        for (const occupied of [false, true]) {
          const o = { id, kind, x: 0, y: 0, rot: 0, props: { variant, occupied } };
          const g = modelOf(o);
          const b = bounds(g.attributes.position.array);
          const what = `${kind} ${variant} ${id}${occupied ? " sat" : ""}`;
          assert.ok(b.x0 >= -0.005 && b.x1 <= e[0] + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
          assert.ok(b.z0 >= -0.005 && b.z1 <= e[1] + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
          assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
          assert.ok(g.attributes.position.count / 3 < 8000, `${what}: ${g.attributes.position.count / 3} tris`);
          if (occupied) continue;
          // the seat's top over its middle (a sofa's or a bench's middle tile), what's sat on
          // (a few points: a bench's slats have gaps)
          const top = Math.max(...[0.5, 0.55, 0.6].map((z) => topAt(g, e[0] / 2, z)));
          const want = SEAT[kind].top;
          const tol = kind === "beanbag" ? 0.06 : 0.03;
          assert.ok(Math.abs(top - want) < tol, `${what}: its seat ${top.toFixed(3)} vs ${want}`);
        }
  }
});

// Plan 67 phase 3: desks, tables, storage — on their footprints, their tops where SURFACE_NEXT has
// things stand (every quarter-tile cell a tabletop can use has the top under its middle), under
// budget; a desk's knee space empty all along its sitters' side.
test("desks, tables, storage: on the footprint, the top at its spec under every usable cell, under 8k", () => {
  const kinds: Record<string, number> = {
    desk: 4,
    meeting_table: 1,
    coffee_table: 1,
    side_table: 1,
    reception: 1,
    counter: 2,
    cupboard: 1,
    bookcase: 3,
    tape_shelf: 3,
    locker: 1,
    cart_shelf: 1,
    disc_rack: 2,
  };
  for (const [kind, n] of Object.entries(kinds)) {
    const e = entry(kind);
    const top = TOP_NEXT[kind] ?? e.top ?? [0, 0, e.w * 4, e.h * 4];
    for (let variant = 0; variant < n; variant++)
      for (const id of ["a", "b", "c"]) {
        const g = modelOf({ id, kind, x: 0, y: 0, rot: 0, props: { variant } });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= -0.005 && b.z1 <= e.h + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < 8000, `${what}: ${g.attributes.position.count / 3} tris`);
        const want = SURF[kind];
        if (want === undefined) continue;
        for (let cy = top[1]; cy < top[3]; cy++)
          for (let cx = top[0]; cx < top[2]; cx++) {
            const h = topAt(g, (cx + 0.5) / 4, (cy + 0.5) / 4, want + 0.3);
            assert.ok(
              Math.abs(h - want) < 0.012,
              `${what}: the top over cell ${cx},${cy} at ${h.toFixed(3)} (want ${want})`,
            );
          }
      }
  }
});

test("a desk's knees: nothing under it along its sitters' side, either tile", () => {
  for (let variant = 0; variant < 4; variant++) {
    const g = modelOf({ id: "a", kind: "desk", x: 0, y: 0, rot: 0, props: { variant } });
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
      const inKnees = x > 0.12 && x < 1.88 && y > 0.05 && y < 0.62 && z < 0.55;
      assert.ok(!inKnees, `desk ${variant}: a part where knees go (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
});
