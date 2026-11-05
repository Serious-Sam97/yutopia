import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, SURFACE } from "@yutopia/shared";
import { Box3, type BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveGroup } from "../liveparts";
import { modelOf } from "../native";
import { LOOKS } from "./tables2";

// Plan 68 phase 4 (docs/plan/68-more-furniture.md): the new desks and tables — every kind and look on
// its footprint, on the floor, under the ceiling, under 8k tris; its top at shared SURFACE under the
// middle of every quarter-tile cell its catalog `top` lets things stand in (and the catalog's iso px
// read back to it); the desks' knee spaces empty where their sitters go; the drafting lamp lit and out.

const mat = new MeshBasicMaterial({ side: DoubleSide });
const KINDS = Object.keys(LOOKS);

function whole(g: BufferGeometry): Group {
  const out = new Group();
  out.add(new Mesh(g, mat));
  const live = liveGroup(g, mat, mat, mat);
  if (live) out.add(live);
  out.updateMatrixWorld(true);
  return out;
}
const tris = (g: BufferGeometry) =>
  (g.attributes.position.count +
    ((g.userData.live as LivePart[]) ?? []).reduce((n, p) => n + p.geo.attributes.position.count, 0) +
    ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0)) /
  3;
function topAt(o: Group, x: number, z: number, from: number): number {
  const hit = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0)).intersectObject(o, true)[0];
  return hit ? hit.point.y : 0;
}

test("desks & tables 2: every kind and look on its footprint, its top at its spec under every usable cell", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a name a look`);
    const want = SURFACE[kind];
    assert.ok(want !== undefined && e.surface !== undefined, `${kind}: a surface`);
    assert.ok(Math.abs((e.surface as number) - want) < 0.001, `${kind}: the catalog's surface read back`);
    const top = e.top ?? [0, 0, e.w * 4, e.h * 4];
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const id of ["a", "b", "c", "d", "e", "f"]) {
        const g = modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
        const w = whole(g);
        const b = new Box3().setFromObject(w);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(
          b.min.x >= -0.005 && b.max.x <= e.w + 0.005,
          `${what}: across ${b.min.x.toFixed(3)}..${b.max.x.toFixed(3)}`,
        );
        assert.ok(
          b.min.z >= -0.005 && b.max.z <= e.h + 0.005,
          `${what}: down ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}`,
        );
        assert.ok(b.min.y > -0.006 && b.min.y < 0.012, `${what}: on the floor (${b.min.y.toFixed(3)})`);
        assert.ok(b.max.y < 3.27, `${what}: under the ceiling`);
        assert.ok(tris(g) < 8000, `${what}: ${tris(g)} tris`);
        for (let cy = top[1]; cy < top[3]; cy++)
          for (let cx = top[0]; cx < top[2]; cx++) {
            const h = topAt(w, (cx + 0.5) / 4, (cy + 0.5) / 4, want + 0.3);
            assert.ok(
              Math.abs(h - want) < 0.012,
              `${what}: the top over cell ${cx},${cy} at ${h.toFixed(3)} (want ${want})`,
            );
          }
      }
  }
});

test("desks & tables 2: the knees — nothing under a desk's top where its sitters' knees go", () => {
  // (the corner desk: a tile each along −z, and its return along −x; the drafting table and the
  // folding table along −z; the dining table from both long sides)
  const knees: Record<string, ((x: number, z: number) => boolean)[]> = {
    corner_desk: [(x, z) => x > 0.12 && x < 1.85 && z < 0.55, (x, z) => z > 0.95 && z < 1.85 && x < 0.55],
    drafting_table: [(x, z) => x > 0.2 && x < 1.25 && z < 0.4],
    folding_table: [(x, z) => x > 0.35 && x < 1.65 && z < 0.4],
    dining_table: [(x, z) => x > 0.45 && x < 2.55 && (z < 0.25 || z > 1.75)],
    round_table: [(x, z) => Math.hypot(x - 1.5, z - 1.5) > 0.85 && Math.hypot(x - 1.5, z - 1.5) < 1.4],
  };
  for (const [kind, spaces] of Object.entries(knees))
    for (let variant = 0; variant < LOOKS[kind].length; variant++) {
      const p = modelOf({ id: "k", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } }).attributes.position
        .array;
      for (let i = 0; i < p.length; i += 3) {
        const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
        if (y <= 0.05 || y >= 0.6) continue;
        for (const inKnees of spaces)
          assert.ok(
            !inKnees(x, z),
            `${kind} ${variant}: a part where knees go (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`,
          );
      }
    }
});

test("desks & tables 2: the drafting table's lamp lights, and goes out switched off", () => {
  for (let variant = 0; variant < 2; variant++) {
    const glow = (on?: boolean) =>
      (
        modelOf({
          id: "d",
          kind: "drafting_table",
          x: 0,
          y: 0,
          yaw: quarterYaw(0),
          props: { variant, ...(on === undefined ? {} : { on }) },
        }).userData.glow as BufferGeometry | null
      )?.attributes.position.count ?? 0;
    assert.ok(glow() > 0 && glow(true) > 0, `drafting table ${variant}: lit`);
    assert.equal(glow(false), 0, `drafting table ${variant}: out`);
  }
  assert.equal(entry("drafting_table").interact, "lamp");
});
