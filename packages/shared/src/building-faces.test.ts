// Plan 111 phase 2 — no two faces of a building in one plane: every kind × style, smallest to largest, fewest to
// most floors, door south and east. Faces in one plane, facing one way and drawn differently flicker as the camera
// moves: settleFaces draws the walls in from their lines and grows a fighting box off them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { coplanarFights, WALL_IN } from "./building-kit.ts";
import { KINDS, type KitKind, layoutOf } from "./building-styles.ts";
import type { Building } from "./grounds.ts";

test("no building's faces fight: every kind × style × size × floors × side", () => {
  const bad: string[] = [];
  let n = 0;
  for (const [kind, kd] of Object.entries(KINDS) as [KitKind, (typeof KINDS)[KitKind]][])
    for (const st of kd.styles)
      for (const face of ["s", "e"] as const)
        for (const t of [0, 0.5, 1]) {
          const w = Math.round(kd.min + (kd.max - kd.min) * t);
          const d = Math.round(Math.max(kd.min, w * 0.8));
          for (const floors of new Set([kd.floors[0], kd.floors[1]])) {
            const b = {
              key: `faces-${kind}-${st.id}-${face}-${w}-${floors}`,
              kind,
              name: kd.name,
              x0: 100,
              z0: 100,
              x1: 100 + w,
              z1: 100 + d,
              floors,
              face,
              style: st.id,
              ...(kd.sign && { sign: "SIGN" }),
            } as Building;
            const L = layoutOf(b);
            if (!L) continue;
            n++;
            for (const f of coplanarFights(L)) bad.push(`${b.key}: ${f.a} ~ ${f.b} (${f.area} m²)`);
          }
        }
  assert.ok(n > 700, `laid out ${n}`);
  assert.deepEqual(bad.slice(0, 20), []);
});

test("walls are drawn in from their lines, not moved about", () => {
  const L = layoutOf({
    key: "faces-wall-in",
    kind: "house",
    name: "House",
    x0: 0,
    z0: 0,
    x1: 10,
    z1: 8,
    floors: 2,
    face: "s",
    style: "cape",
  } as Building);
  assert.ok(L);
  // (a wall facing south, its line at z = 8: drawn WALL_IN north of it)
  const south = L.walls.find((w) => w.o[1] === 1 && w.y0 < 1);
  assert.ok(south);
  assert.ok(Math.abs(south.a[1] - (8 - WALL_IN)) < 1e-9, `${south.a[1]}`);
});

// Plan 111 — a door drawn where you go in: every kind walked into, every style, smallest to largest, door south and
// east, and the town's — a door part (or a shop's recess) at its layout's door. (A pilaster on a shop's middle left
// it none; a row's and a fire station's way in was the front's middle, between their doors.)
test("every building walked into has a door drawn where you go in", async () => {
  const { BUILDINGS } = await import("./grounds.ts");
  const DOOR = /^(door-|shop-recess)/;
  const bad: string[] = [];
  const check = (b: Building) => {
    const L = layoutOf(b);
    if (!L || !KINDS[b.kind as KitKind]?.enter) return;
    const d = L.door;
    const drawn = L.parts.some(
      (p) =>
        DOOR.test(p.part) &&
        Math.hypot(p.x - d.x, p.z - d.z) < Math.max(0.6, d.w / 2) &&
        Math.abs(p.y - d.y) < 0.4,
    );
    if (!drawn) bad.push(`${b.key} (${b.kind} ${b.style ?? ""})`);
  };
  for (const b of BUILDINGS) check(b);
  for (const [kind, kd] of Object.entries(KINDS) as [KitKind, (typeof KINDS)[KitKind]][])
    for (const st of kd.styles)
      for (const t of [0, 0.25, 0.5, 0.75, 1])
        for (const face of ["s", "e"] as const) {
          const w = Math.round(kd.min + (kd.max - kd.min) * t);
          const d = Math.round(Math.max(kd.min, w * 0.8));
          check({
            key: `door-${kind}-${st.id}-${w}-${face}`,
            kind,
            name: kd.name,
            x0: 100,
            z0: 100,
            x1: 100 + w,
            z1: 100 + d,
            floors: kd.floors[0],
            face,
            style: st.id,
            ...(kd.sign && { sign: "SIGN" }),
          } as Building);
        }
  assert.deepEqual(bad.slice(0, 20), []);
});
