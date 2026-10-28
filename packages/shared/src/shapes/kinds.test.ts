import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, entry, footprint, type ObjectKind } from "../catalog.ts";
import { STOREY } from "../levels.ts";
import { HALF_WALL_H, kindSolids, SHAPES, SLAB, slabSolid, WALL_H, WALL_T, wallSolids } from "./index.ts";

test("every kind has a shape, and its parts are real boxes near its footprint", () => {
  for (const kind of Object.keys(CATALOG) as ObjectKind[]) {
    const { parts } = SHAPES[kind];
    if (!entry(kind).opening) assert.ok(parts.length, `${kind}: parts`);
    const { w, h } = footprint(kind);
    for (const p of parts) {
      assert.ok(p.y1 > p.y0 && p.y0 >= 0, `${kind}: y`);
      if (p.t === "box") assert.ok(p.u1 > p.u0 && p.v1 > p.v0, `${kind}: size`);
      else assert.ok(p.r > 0, `${kind}: r`);
      // (an arm or a lamp's head may reach out a little; a lamp post's arm 2 m)
      const [u0, u1, v0, v1] = p.t === "box" ? [p.u0, p.u1, p.v0, p.v1] : [p.u - p.r, p.u + p.r, p.v - p.r, p.v + p.r];
      const out = Math.max(-u0, u1 - w, -v0, v1 - h);
      assert.ok(out <= (kind === "lamp_post" ? 1.6 : 0.2), `${kind}: ${out.toFixed(2)} m past its footprint`);
    }
  }
});

test("a thing turns in its own footprint", () => {
  // the desk (2 × 1) at (4, 6): rot 0 along x, rot 1 along z, the same tiles as the grid's
  const at = (rot: number) => {
    const [s] = kindSolids({ id: "d", kind: "desk", x: 4, y: 6, rot });
    assert.equal(s.t, "box");
    return s.t === "box" ? [s.x - s.hx, s.z - s.hz, s.x + s.hx, s.z + s.hz].map((n) => +n.toFixed(2)) : [];
  };
  assert.deepEqual(at(0), [4, 6.06, 6, 6.94]);
  assert.deepEqual(at(1), [4.06, 6, 4.94, 8]);
  assert.deepEqual(at(2), [4, 6.06, 6, 6.94]);
  // a storey up
  const [s] = kindSolids({ id: "d", kind: "desk", x: 4, y: 6 }, STOREY);
  assert.ok(s.t === "box" && Math.abs(s.y + s.hy - (STOREY + 0.64)) < 1e-9);
});

test("walls: full, half, a door's lintel, a window's sill and pane", () => {
  const e = { dir: "h" as const, x: 2, y: 3 };
  const [full] = wallSolids(e, "p").solids;
  assert.deepEqual(
    [full.x, full.z, full.hx, full.hz, full.y + full.hy].map((n) => +n.toFixed(6)),
    [2.5, 3, 0.5, WALL_T / 2, WALL_H],
  );
  assert.equal(wallSolids(e, "h").solids[0].hy * 2, HALF_WALL_H);
  assert.deepEqual(wallSolids(e, ".").solids, []);
  // a door: nothing under its head (2.245 m), the lintel over it
  const door = wallSolids(e, "p", { kind: "door", z0: 0, z1: 88 });
  assert.equal(door.solids.length, 1);
  assert.ok(Math.abs(door.solids[0].y - door.solids[0].hy - 2.245) < 0.001);
  assert.equal(door.pane, undefined);
  // a window: the sill, the head and its glass between
  const win = wallSolids({ dir: "v", x: 2, y: 3 }, "b", { kind: "window", z0: 36, z1: 88 });
  assert.equal(win.solids.length, 2);
  assert.ok(win.pane && Math.abs(win.pane.y - win.pane.hy - 0.919) < 0.001);
  assert.ok(win.pane && Math.abs(win.pane.hx - WALL_T / 2) < 1e-9 && win.pane.hz === 0.5);
});

test("a storey's slab meets the walls' tops", () => {
  const s = slabSolid(0, 0, 10, 8, STOREY);
  assert.ok(Math.abs(s.y - s.hy - WALL_H) < 1e-9);
  assert.equal(+(s.hy * 2).toFixed(3), SLAB);
});
