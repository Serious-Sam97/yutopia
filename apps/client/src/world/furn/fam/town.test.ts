import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, SEAT_SPEC, STAND, SURFACE } from "@yutopia/shared";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS } from "./town";

// Plan 113 (docs/plan/113-the-furniture-by-hand.md, F3a): the town's buildings' own pieces — every look on its
// footprint, on the floor, under the ceiling and 8k tris; tops where things stand at their spec under every usable
// cell; the booth's bench and the bale sat on at their spec.

const KINDS = Object.keys(LOOKS);

function bounds(g: BufferGeometry) {
  const p = g.attributes.position.array;
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const take = (x: number, y: number, z: number) => {
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
    b.z0 = Math.min(b.z0, z);
    b.z1 = Math.max(b.z1, z);
  };
  for (let i = 0; i < p.length; i += 3) take(p[i], p[i + 1], p[i + 2]);
  for (const l of (g.userData.live as LivePart[]) ?? []) {
    const q = l.geo.attributes.position.array;
    for (let i = 0; i < q.length; i += 3) take(q[i] + l.at[0], q[i + 1] + l.at[1], q[i + 2] + l.at[2]);
  }
  return b;
}

function topAt(g: BufferGeometry, x: number, z: number, from: number): number {
  const ray = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))[0];
  return hit ? hit.point.y : 0;
}

const model = (kind: string, props: Record<string, unknown> = {}, id = "k") =>
  modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props });

test("town: every look on its footprint, on the floor, under the ceiling and 8k tris", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a name a look`);
    assert.ok(e.buildable && !e.outdoor, `${kind}: built, indoors`);
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const id of ["k", "town-2", "town-7"]) {
        const g = model(kind, { variant }, id);
        const b = bounds(g);
        const what = `${kind} ${variant} (${id})`;
        assert.ok(
          b.x0 >= -0.005 && b.x1 <= e.w + 0.005 && b.z0 >= -0.005 && b.z1 <= e.h + 0.005,
          `${what}: on its footprint (${b.x0.toFixed(3)}..${b.x1.toFixed(3)} × ${b.z0.toFixed(3)}..${b.z1.toFixed(3)})`,
        );
        assert.ok(b.y0 > -0.01 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(b.y1 < 3.27, `${what}: ${b.y1.toFixed(2)} m`);
        assert.ok(
          g.attributes.position.count / 3 < MAX_TRIS,
          `${what}: under 8k tris (${g.attributes.position.count / 3})`,
        );
      }
  }
});

test("town: tops at their spec under every usable cell; the booth's bench and the bale at theirs", () => {
  for (const kind of ["booth_table", "bar_counter", "back_bar", "checkout", "farm_table", "pub_table"]) {
    const e = entry(kind);
    const want = SURFACE[kind];
    const [x0, y0, x1, y1] = e.top ?? [0, 0, e.w * 4, e.h * 4];
    for (let variant = 0; variant < LOOKS[kind].length; variant++) {
      const g = model(kind, { variant });
      for (let cx = x0; cx < x1; cx++)
        for (let cy = y0; cy < y1; cy++) {
          const h = topAt(g, (cx + 0.5) / 4, (cy + 0.5) / 4, want + 0.15);
          assert.ok(
            Math.abs(h - want) < 0.015,
            `${kind} ${variant}: cell ${cx},${cy} at ${h.toFixed(3)}, spec ${want}`,
          );
        }
    }
  }
  for (const kind of ["booth_seat", "hay_bale"])
    for (let variant = 0; variant < LOOKS[kind].length; variant++) {
      const s = SEAT_SPEC[kind];
      const g = model(kind, { variant });
      const h = topAt(g, kind === "hay_bale" ? 0.5 : 1, 0.5 + s.front - 0.08, 1.0);
      assert.ok(Math.abs(h - s.top) < 0.04, `${kind} ${variant}: its seat at ${h.toFixed(3)} (spec ${s.top})`);
    }
  void STAND;
});
