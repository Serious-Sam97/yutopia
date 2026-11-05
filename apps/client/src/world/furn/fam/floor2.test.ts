import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, standHeight } from "@yutopia/shared";
import type { BufferGeometry } from "three";
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { LOOKS } from "./floor2";

// Plan 68 phase 15: Rugs & floor — every kind and look on its footprint, on the floor, under 8k tris;
// the rugs flat (walked over), the risers' and steps' tops where a body stands (STAND), the dance
// floor's tiles lit in a pattern that moves (and dark when it's switched off).

const KINDS = Object.keys(LOOKS);

function bounds(g: BufferGeometry) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const all = [g, ...((g.userData.live as LivePart[]) ?? []).map((p) => p.geo.clone().translate(...p.at))];
  for (const x of all) {
    const pos = x.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      b.x0 = Math.min(b.x0, pos[i]);
      b.x1 = Math.max(b.x1, pos[i]);
      b.y0 = Math.min(b.y0, pos[i + 1]);
      b.y1 = Math.max(b.y1, pos[i + 1]);
      b.z0 = Math.min(b.z0, pos[i + 2]);
      b.z1 = Math.max(b.z1, pos[i + 2]);
    }
  }
  return b;
}
const tris = (g: BufferGeometry) =>
  (g.attributes.position.count +
    ((g.userData.live as LivePart[]) ?? []).reduce((n, p) => n + p.geo.attributes.position.count, 0)) /
  3;
const model = (kind: string, props: Record<string, unknown> = {}) =>
  modelOf({ id: `${kind}-t`, kind, x: 0, y: 0, yaw: quarterYaw(0), props });
const live = (kind: string, props: Record<string, unknown> = {}) =>
  (model(kind, props).userData.live as LivePart[]) ?? [];

test("rugs & floor: every look on its footprint, on the floor, under 8k tris; rugs flat", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a look a variant`);
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const seed of ["a", "b", "c", "d"])
        for (const color of [undefined, "#3a8ae0"]) {
          const g = modelOf({
            id: `${kind}-${seed}`,
            kind,
            x: 0,
            y: 0,
            yaw: quarterYaw(0),
            props: { variant, ...(color ? { color } : {}) },
          });
          const b = bounds(g);
          const what = `${kind} ${variant}`;
          assert.ok(
            b.x0 >= -0.005 && b.x1 <= e.w + 0.005 && b.z0 >= -0.005 && b.z1 <= e.h + 0.005,
            `${what}: on its footprint`,
          );
          assert.ok(b.y0 > -0.006 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
          assert.ok(tris(g) < 8000, `${what}: under 8k tris (${tris(g)})`);
          if (!e.solid && kind !== "dance_floor") assert.ok(b.y1 < 0.06, `${what}: flat (${b.y1.toFixed(3)})`);
        }
  }
});

/** What's hit looking straight down at (x, z): its height (0: nothing). */
function topAt(g: BufferGeometry, x: number, z: number): number {
  const hit = new Raycaster(new Vector3(x, 2, z), new Vector3(0, -1, 0)).intersectObject(
    new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })),
  )[0];
  return hit ? hit.point.y : 0;
}

test("stage: the risers and steps stood on at their tops", () => {
  for (let variant = 0; variant < 3; variant++) {
    const riser = model("stage_riser", { variant });
    const top = standHeight("stage_riser") ?? 0;
    for (const [x, z] of [
      [0.5, 0.55],
      [1.5, 0.3],
      [1, 0.8],
    ])
      assert.ok(
        Math.abs(topAt(riser, x, z) - top) < 0.012,
        `riser ${variant}: its deck at ${topAt(riser, x, z).toFixed(3)}`,
      );
    const steps = model("stage_steps", { variant });
    assert.ok(Math.abs(topAt(steps, 0.5, 0.25) - top) < 0.012, `steps ${variant}: the top step`);
    assert.ok(Math.abs(topAt(steps, 0.5, 0.75) - top / 2) < 0.012, `steps ${variant}: the bottom step`);
  }
});

test("the dance floor: its tiles lit in a moving pattern, dark when off", () => {
  for (let variant = 0; variant < 3; variant++) {
    const sets = live("dance_floor", { variant }).filter((p) => p.anim.kind === "blink");
    assert.ok(sets.length >= 2, `dance floor ${variant}: tiles in sets`);
    const at = [0, 0.25, 0.5, 0.75, 1].map((t) => sets.map((p) => liveAt(p.anim, t).shown).join());
    assert.ok(new Set(at).size > 1, `dance floor ${variant}: the pattern moves`);
    assert.equal(live("dance_floor", { variant, on: false }).length, 0, `dance floor ${variant}: off, dark`);
  }
});
