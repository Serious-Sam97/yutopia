import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits, CHUNK, groundAt, type StreetThing } from "@yutopia/shared/grounds";
import { NO_EDITS } from "@yutopia/shared/grounds-edits";
import { addThing, THINGS } from "@yutopia/shared/grounds-things";
import type { Solid3 } from "@yutopia/shared/shapes";
import { groundSolidsIn } from "@yutopia/shared/shapes/grounds";
import { streetGeometry } from "./town3d";

// The street things' models against their solids (docs/plan/50-the-volume.md A; plan 53 phase 8
// adds kinds): each one put down on its own in the farm's field, what the 3D view draws of it and
// what the shapes table makes solid of it — the solid inside what's drawn, as tall.

const AT = { x: 446.5, z: -238.5 };
const KINDS = THINGS.filter((t) => !t.kind.startsWith("lamp-") && t.kind !== "snowpole").map((t) => t.kind);

function solidBox(s: Solid3) {
  if (s.t === "cyl") return { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r, y1: s.y1 };
  const ex = Math.abs(Math.cos(s.a)) * s.hx + Math.abs(Math.sin(s.a)) * s.hz;
  const ez = Math.abs(Math.sin(s.a)) * s.hx + Math.abs(Math.cos(s.a)) * s.hz;
  return { x0: s.x - ex, x1: s.x + ex, z0: s.z - ez, z1: s.z + ez, y1: s.y + s.hy };
}

for (const kind of KINDS)
  test(`${kind}: what's solid of it is inside what's drawn, as tall`, () => {
    const t: StreetThing = {
      key: "god-thing-1",
      kind: kind as StreetThing["kind"],
      x: AT.x,
      z: AT.z,
      ry: 0,
      ...(kind === "fence" && {
        pts: [
          [AT.x, AT.z],
          [AT.x + 7, AT.z],
        ] as [number, number][],
      }),
      ...(kind === "boulder" && { s: 1.3 }),
    };
    applyEdits(addThing(NO_EDITS, { ...t, kind: t.kind }));
    const near = (b: { x0: number; x1: number; z0: number; z1: number }) =>
      b.x1 > AT.x - 3 && b.x0 < AT.x + 10 && b.z1 > AT.z - 3 && b.z0 < AT.z + 3;
    // (a solid's in the chunk its middle's in: the ones round too)
    const cx = Math.floor(AT.x / CHUNK);
    const cz = Math.floor(AT.z / CHUNK);
    const solids = [-1, 0, 1]
      .flatMap((dx) => [-1, 0, 1].flatMap((dz) => groundSolidsIn(cx + dx, cz + dz)))
      .filter((g) => g.what === "street")
      .map((g) => solidBox(g.s))
      .filter(near);
    applyEdits(NO_EDITS);
    assert.ok(solids.length, "something solid");
    const drawn = { x0: 1e9, x1: -1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
    for (const g of streetGeometry([t])) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      if (!b) continue;
      drawn.x0 = Math.min(drawn.x0, b.min.x);
      drawn.x1 = Math.max(drawn.x1, b.max.x);
      drawn.z0 = Math.min(drawn.z0, b.min.z);
      drawn.z1 = Math.max(drawn.z1, b.max.z);
      drawn.y1 = Math.max(drawn.y1, b.max.y);
    }
    const pad = 0.2;
    for (const s of solids) {
      assert.ok(
        s.x0 >= drawn.x0 - pad && s.x1 <= drawn.x1 + pad && s.z0 >= drawn.z0 - pad && s.z1 <= drawn.z1 + pad,
        `solid ${JSON.stringify(s)} outside drawn ${JSON.stringify(drawn)}`,
      );
    }
    const top = Math.max(...solids.map((s) => s.y1));
    // (a fence's land rolls: measured from the ground where it stands)
    assert.ok(
      Math.abs(top - drawn.y1) < 0.3,
      `${kind}: solid to ${top - groundAt(AT.x, AT.z)}, drawn ${drawn.y1 - groundAt(AT.x, AT.z)}`,
    );
  });
