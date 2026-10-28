import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, isOpening, type ObjectKind } from "@yutopia/shared";
import { kindSolids, openingHole, type Solid3 } from "@yutopia/shared/shapes";
import * as items from "../art/items";
import { type Bounds3, KINDS, modelBounds } from "./model-bounds";

// The drawing and the physics never drift apart (docs/plan/50-the-volume.md, A): each kind's 3D
// model, drawn as the 3D view draws it, measured against its shapes (shared/shapes), placed off
// the origin at every turn — so the turn and the frames (wall items, things on a surface) are
// checked too.

const TOL = 0.06; // m, any face
// (drawn by their own builders in 3D — Stairs3, Lifts3 — not World3: their item art isn't what shows)
const OWN = new Set<string>(["stairs", "elevator"]);

function solidsBounds(ss: Solid3[]): Bounds3 | null {
  if (!ss.length) return null;
  const b = { x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
  for (const s of ss) {
    // (a box's quarter turns stay axis-aligned: its half sizes are its extents)
    const [hx, hz, y0, y1] = s.t === "box" ? [s.hx, s.hz, s.y - s.hy, s.y + s.hy] : [s.r, s.r, s.y0, s.y1];
    b.x0 = Math.min(b.x0, s.x - hx);
    b.x1 = Math.max(b.x1, s.x + hx);
    b.z0 = Math.min(b.z0, s.z - hz);
    b.z1 = Math.max(b.z1, s.z + hz);
    b.y0 = Math.min(b.y0, y0);
    b.y1 = Math.max(b.y1, y1);
  }
  return b;
}

function union(a: Bounds3 | null, b: Bounds3 | null): Bounds3 | null {
  if (!a || !b) return a ?? b;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    z0: Math.min(a.z0, b.z0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
    z1: Math.max(a.z1, b.z1),
  };
}

const AXES = ["x0", "x1", "y0", "y1", "z0", "z1"] as const;

test("every kind's shapes fit its 3D model, at every turn", () => {
  const bad: string[] = [];
  for (const kind of KINDS) {
    if (isOpening(kind) || OWN.has(kind)) continue;
    for (const rot of [0, 1, 2, 3]) {
      const o = { id: `${kind}-t`, kind, x: 3, y: 5, rot, props: {} as Record<string, unknown> };
      let model: Bounds3 | null = null;
      for (let v = 0; v < (entry(kind).variants ?? 1); v++)
        model = union(model, modelBounds(items, { ...o, id: `${kind}-${v}`, props: { variant: v } }));
      const shape = solidsBounds(kindSolids(o));
      assert.ok(model && shape, `${kind}: drawn and shaped`);
      // (a thing on the floor reaches it: legs drawn as ink lines aren't in the model's box)
      const off = AXES.filter(
        (k) => Math.abs(model[k] - shape[k]) > TOL && !(k === "y0" && shape.y0 === 0 && model.y0 <= 0.1),
      );
      if (off.length)
        bad.push(
          `${kind} rot ${rot}: ${off.map((k) => `${k} model ${model[k].toFixed(2)} shape ${shape[k].toFixed(2)}`).join(", ")}`,
        );
    }
  }
  assert.deepEqual(bad, []);
});

test("doors and windows: the model frames its wall's cut", () => {
  const bad: string[] = [];
  for (const kind of KINDS.filter(isOpening) as ObjectKind[]) {
    const m = modelBounds(items, { id: `${kind}-t`, kind, x: 3, y: 5, rot: 0 });
    assert.ok(m, kind);
    const [h0, h1] = openingHole(kind);
    // (the frame round the hole: a little under a window's sill, over a door's head; a door's
    // studio lamp the most, 0.5 m)
    if (m.y0 > h0 + TOL || m.y0 < h0 - 0.12 || m.y1 < h1 - TOL || m.y1 > h1 + 0.5)
      bad.push(`${kind}: hole ${h0}–${h1}, drawn ${m.y0.toFixed(2)}–${m.y1.toFixed(2)}`);
  }
  assert.deepEqual(bad, []);
});
