import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, SURFACE } from "@yutopia/shared";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { type LivePart, Model } from "../kit";
import { modelOf } from "../native";
import * as storage2 from "./storage2";

// Plan 68 phase 5 (docs/plan/68-more-furniture.md): Storage — every kind and look on its footprint, on
// the floor (the cassette rack on the wall's face), under the ceiling and 8k tris; the tops at their spec
// under every usable cell; the cabinet's glass and light; the weather's wet look.

const FAMS = storage2.LOOKS;
const IDS = ["a", "b", "c", "q7", "zz"];

function bounds(pos: ArrayLike<number>, b = { x0: 9, x1: -9, y0: 9, y1: -9, z0: 9, z1: -9 }, off = [0, 0, 0]) {
  for (let i = 0; i < pos.length; i += 3) {
    b.x0 = Math.min(b.x0, pos[i] + off[0]);
    b.x1 = Math.max(b.x1, pos[i] + off[0]);
    b.y0 = Math.min(b.y0, pos[i + 1] + off[1]);
    b.y1 = Math.max(b.y1, pos[i + 1] + off[1]);
    b.z0 = Math.min(b.z0, pos[i + 2] + off[2]);
    b.z1 = Math.max(b.z1, pos[i + 2] + off[2]);
  }
  return b;
}
/** A model's bounds with what glows and its live parts (at rest). */
function allBounds(g: BufferGeometry) {
  const b = bounds(g.attributes.position.array);
  if (g.userData.glow) bounds((g.userData.glow as BufferGeometry).attributes.position.array, b);
  for (const p of (g.userData.live as LivePart[]) ?? []) bounds(p.geo.attributes.position.array, b, p.at);
  return b;
}
const tris = (g: BufferGeometry) =>
  (g.attributes.position.count + ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0)) / 3;
const live = (kind: string, props: Record<string, unknown> = {}) =>
  (modelOf({ id: "x", kind, x: 0, y: 0, yaw: quarterYaw(0), props }).userData.live as LivePart[]) ?? [];
/** What's hit looking straight down at (x, z) from `from` m up: its height (0: nothing). */
function topAt(g: BufferGeometry, x: number, z: number, from: number): number {
  const hit = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0)).intersectObject(
    new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })),
  )[0];
  return hit ? hit.point.y : 0;
}

test("storage: every kind and look on its footprint, on the floor or the wall, under the ceiling and 8k", () => {
  for (const [kind, looks] of Object.entries(FAMS)) {
    const e = entry(kind);
    assert.equal(looks.length, e.variants ?? 1, `${kind}: a name a look`);
    assert.ok(e.buildable, `${kind}: in the panel`);
    for (let variant = 0; variant < looks.length; variant++)
      for (const id of IDS)
        for (const on of [true, false]) {
          const g = modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant, on } });
          const b = allBounds(g);
          const what = `${kind} ${variant} ${id}${on ? "" : " off"}`;
          assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
          assert.ok(b.y1 <= 3.275, `${what}: under the ceiling (${b.y1.toFixed(3)})`);
          assert.ok(tris(g) < 8000, `${what}: ${tris(g)} tris`);
          if (e.wall) {
            assert.ok(
              b.z0 >= 0.098 && b.z1 <= 0.35,
              `${what}: on the wall's face, out ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`,
            );
            assert.ok(b.y0 > 0.2, `${what}: up off the floor (${b.y0.toFixed(3)})`);
          } else {
            assert.ok(b.z0 >= -0.005 && b.z1 <= e.h + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
            assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
          }
        }
  }
});
test("storage tops: at their spec under every cell things stand on, every look and story", () => {
  for (const kind of ["plan_chest", "office_safe"]) {
    const e = entry(kind);
    const want = SURFACE[kind];
    assert.ok(want !== undefined && e.surface !== undefined && e.top, `${kind}: a surface and its cells`);
    const [x0, y0, x1, y1] = e.top;
    for (let variant = 0; variant < (e.variants ?? 1); variant++)
      for (const id of IDS) {
        const g = modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
        for (let cy = y0; cy < y1; cy++)
          for (let cx = x0; cx < x1; cx++) {
            const h = topAt(g, (cx + 0.5) / 4, (cy + 0.5) / 4, want + 0.3);
            assert.ok(
              Math.abs(h - want) < 0.012,
              `${kind} ${variant} ${id}: cell ${cx},${cy} at ${h.toFixed(3)} (${want})`,
            );
          }
      }
  }
});
test("the display cabinet: lit inside when on, out when off; its panes see-through", () => {
  const glow = (on: boolean) =>
    (
      modelOf({ id: "x", kind: "display_cabinet", x: 0, y: 0, yaw: quarterYaw(0), props: { on } }).userData
        .glow as BufferGeometry | null
    )?.attributes.position.count ?? 0;
  assert.ok(glow(true) > 0, "lit");
  assert.equal(glow(false), 0, "out");
  assert.equal(entry("display_cabinet").interact, "lamp");
  assert.ok(
    live("display_cabinet").some((p) => p.glass && p.anim.kind === "still"),
    "its glass",
  );
});

test("the weather's wet look: snow on the boots, rain on the umbrellas (a hook, drawn when it's set)", () => {
  const draw = (kind: string, wet: boolean, look = 0) => {
    const m = new Model(2);
    storage2.DRAW[kind](m, { look, fabric: null, seed: 0.425, occupied: false, wet } as storage2.WetLook);
    return m.geometry();
  };
  for (const kind of ["shoe_rack", "umbrella_stand"])
    for (const look of [0, 1]) {
      const dry = draw(kind, false, look);
      const wet = draw(kind, true, look);
      assert.ok(wet.attributes.position.count > dry.attributes.position.count, `${kind} ${look}: wet shows`);
      assert.equal(allBounds(wet).y0 >= -0.006, true, `${kind}: its puddle on the floor`);
    }
});
