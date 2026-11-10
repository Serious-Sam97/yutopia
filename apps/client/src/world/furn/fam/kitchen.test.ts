import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, SEAT_SPEC, STAND, SURFACE } from "@yutopia/shared";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS } from "./kitchen";

// Plan 68 phase 18 (docs/plan/68-more-furniture.md): the kitchen and café — every look on its footprint
// (or its 1×1 frame on a surface), on the floor, under the ceiling and 8k tris; tops where things
// stand at their spec under every usable cell, the stool's seat at its spec; the hob's flames live
// while it's on and gone when it's off; the case's and the freezer's glass apart; the dishwasher's
// light blinking.

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

test("kitchen: every look on its footprint, on the floor, under the ceiling and 8k tris", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a name a look`);
    assert.ok(e.buildable && !e.outdoor, `${kind}: built, indoors`);
    const [w, h] = e.onSurface ? [1, 1] : [e.w, e.h];
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const id of ["k", "kitchen-2", "kitchen-7"]) {
        const g = model(kind, { variant }, id);
        const b = bounds(g);
        const what = `${kind} ${variant} (${id})`;
        assert.ok(
          b.x0 >= -0.005 && b.x1 <= w + 0.005 && b.z0 >= -0.005 && b.z1 <= h + 0.005,
          `${what}: on its footprint`,
        );
        assert.ok(b.y0 > -0.01 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(b.y1 < (e.onSurface ? 0.5 : 3.27), `${what}: ${b.y1.toFixed(2)} m`);
        assert.ok(
          g.attributes.position.count / 3 < MAX_TRIS,
          `${what}: under 8k tris (${g.attributes.position.count / 3})`,
        );
      }
  }
});

test("kitchen: tops at their spec under every usable cell, the stool's seat at its spec", () => {
  for (const kind of ["kitchen_island", "dishwasher", "cafe_counter", "kitchen_stove"]) {
    const e = entry(kind);
    const want = SURFACE[kind];
    const [x0, y0, x1, y1] = e.top ?? [0, 0, e.w * 4, e.h * 4];
    // (the hob's trivets a grid: stood on within a few cm of its spec)
    const tol = kind === "kitchen_stove" ? 0.04 : 0.012;
    for (let variant = 0; variant < LOOKS[kind].length; variant++) {
      const g = model(kind, { variant });
      for (let cx = x0; cx < x1; cx++)
        for (let cy = y0; cy < y1; cy++) {
          const h = topAt(g, (cx + 0.5) / 4, (cy + 0.5) / 4, want + 0.2);
          assert.ok(Math.abs(h - want) < tol, `${kind} ${variant}: cell ${cx},${cy} at ${h.toFixed(3)}, spec ${want}`);
        }
    }
  }
  for (let variant = 0; variant < 3; variant++) {
    const sink = model("kitchen_sink", { variant });
    for (const [x, z] of [
      [0.1, 0.5],
      [0.9, 0.5],
      [0.5, 0.1],
    ])
      assert.ok(
        Math.abs(topAt(sink, x, z, 1.0) - (STAND.kitchen_sink ?? 0)) < 0.012,
        `sink ${variant}: its worktop at (${x}, ${z})`,
      );
    const stool = model("counter_stool", { variant });
    const h = topAt(stool, 0.5, 0.5 + SEAT_SPEC.counter_stool.front - 0.1, 1.2);
    assert.ok(
      Math.abs(h - SEAT_SPEC.counter_stool.top) < 0.03,
      `counter stool ${variant}: its seat at ${h.toFixed(3)}`,
    );
  }
});

test("kitchen: the hob's flames live while on, gone when off; glass apart; the dishwasher running", () => {
  const live = (kind: string, props: Record<string, unknown> = {}, id = "k") =>
    (model(kind, props, id).userData.live as LivePart[]) ?? [];
  for (let variant = 0; variant < 3; variant++) {
    const flames = live("kitchen_stove", { variant }).filter((p) => p.anim.kind === "flame");
    assert.ok(flames.length >= 2 && flames.every((p) => p.glow), `stove ${variant}: lit burners`);
    const at = [0, 0.3, 0.6].map((t) => liveAt(flames[0].anim, t).scale[1].toFixed(3));
    assert.ok(new Set(at).size > 1, "the flames flicker");
    assert.equal(live("kitchen_stove", { variant, on: false }).length, 0, `stove ${variant}: off, out`);
    assert.ok(
      live("cafe_counter", { variant }).some((p) => p.glass),
      `café counter ${variant}: the case's glass`,
    );
    assert.ok(
      live("ice_cream_freezer", { variant }).some((p) => p.glass),
      `freezer ${variant}: its lids`,
    );
  }
  // (running by its seed: some ids blink, none other than that)
  const ids = Array.from({ length: 12 }, (_, i) => `dw-${i}`);
  const blinks = ids.map((id) => live("dishwasher", {}, id).filter((p) => p.anim.kind === "blink"));
  assert.ok(
    blinks.some((b) => b.length === 1),
    "a dishwasher running",
  );
  const b = blinks.find((x) => x.length)?.[0];
  assert.ok(b && new Set([0, 0.8, 1.6, 2.0].map((t) => liveAt(b.anim, t).shown)).size === 2, "its light blinking");
});
