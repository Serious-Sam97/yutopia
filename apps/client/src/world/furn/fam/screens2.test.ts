import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw } from "@yutopia/shared";
import { Box3, type BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS, OC, RTV, VW } from "./screens2";

// Plan 68 phase 8 (docs/plan/68-more-furniture.md): Screens & TVs — every kind and look on its footprint
// (a wall piece on its wall, the projector up at the ceiling), on the floor, under 8k tris; their
// pictures lit while on and dark glass when off; nothing over the plane the media's picture would be
// drawn on (fam/screens2.ts GLASS) but the video wall's seams; what moves moves.

const KINDS = Object.keys(LOOKS);
const mat = new MeshBasicMaterial();
const of = (kind: string, props: Record<string, unknown> = {}, id = "s") =>
  modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props });
const live = (g: BufferGeometry) => (g.userData.live as LivePart[] | undefined) ?? [];
const glowOf = (g: BufferGeometry) => g.userData.glow as BufferGeometry | null;

function bounds(g: BufferGeometry): Box3 {
  g.computeBoundingBox();
  const b = new Box3().copy(g.boundingBox as Box3);
  const glow = glowOf(g);
  if (glow) {
    glow.computeBoundingBox();
    b.union(glow.boundingBox as Box3);
  }
  for (const p of live(g)) {
    const m = new Mesh(p.geo, mat);
    m.position.set(...p.at);
    m.rotation.set(p.rot[0], p.rot[1], p.rot[2], "YXZ");
    m.updateMatrixWorld(true);
    b.union(new Box3().setFromObject(m));
  }
  return b;
}
const tris = (g: BufferGeometry) =>
  g.attributes.position.count / 3 +
  (glowOf(g)?.attributes.position.count ?? 0) / 3 +
  live(g).reduce((n, p) => n + p.geo.attributes.position.count / 3, 0);

test("screens: every kind and look on its footprint, on the floor or its wall or up at the ceiling", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a look a variant`);
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const on of [true, false]) {
        const g = of(kind, { variant, on });
        const b = bounds(g);
        const what = `${kind} ${variant}${on ? "" : " off"}`;
        assert.ok(
          b.min.x >= -0.005 && b.max.x <= e.w + 0.005 && b.min.z >= -0.005 && b.max.z <= e.h + 0.005,
          `${what}: on its footprint`,
        );
        assert.ok(tris(g) < MAX_TRIS, `${what}: under 8k tris (${tris(g)})`);
        if (e.outdoor) assert.ok(b.max.y < 4.5, `${what}: its height`);
        else assert.ok(b.max.y <= 3.275, `${what}: under the ceiling (${b.max.y.toFixed(3)})`);
        if (kind === "ceiling_projector") assert.ok(Math.abs(b.max.y - 3.27) < 0.01, `${what}: hung from the ceiling`);
        else if (e.wall) assert.ok(b.min.z >= 0.099 && b.min.y > 0.1, `${what}: on its wall's face, off the floor`);
        else assert.ok(b.min.y > -0.006 && b.min.y < 0.012, `${what}: on the floor (${b.min.y.toFixed(4)})`);
      }
  }
});

test("screens: lit while on, dark when off; the media's plane clear", () => {
  for (const kind of KINDS) {
    const lit = (on: boolean) => glowOf(of(kind, { on }))?.attributes.position.count ?? 0;
    assert.ok(lit(true) > lit(false) + 30, `${kind}: its picture lit while on`);
  }
  // (each glass's plane — shared fam/screens2.ts GLASS has the same — nothing still in the model in
  // front of it over the picture, its picture just behind: the video wall's seams in it too)
  for (const [kind, g] of Object.entries({ video_wall: VW, outdoor_cinema: OC, radio_tv_cabinet: RTV })) {
    const m = of(kind);
    const [z0, z1] = [g.y0, g.y1];
    const mesh = new Mesh(m, mat);
    const glow = glowOf(m);
    for (const [u, v] of [
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.3],
      [0.3, 0.8],
    ]) {
      const x = g.x0 + (g.x1 - g.x0) * u;
      const y = z0 + (z1 - z0) * v;
      const ray = new Raycaster(new Vector3(x, y, g.face + 2), new Vector3(0, 0, -1), 0, 3);
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(
        !hit || hit.point.z < g.face,
        `${kind}: nothing over its glass at ${u},${v} (${hit?.point.z.toFixed(4)})`,
      );
      if (glow) {
        const gh = ray.intersectObject(new Mesh(glow, mat))[0];
        assert.ok(
          gh && gh.point.z < g.face && gh.point.z > g.face - 0.02,
          `${kind}: its picture just behind the plane at ${u},${v}`,
        );
      }
    }
  }
});

test("screens: what moves moves", () => {
  const blinks = (kind: string, props: Record<string, unknown> = {}) =>
    live(of(kind, props)).filter((p) => p.anim.kind === "blink");
  // the aurora shimmers, Vortex blinks, the film flickers, the monitors' REC lights and the VCR's 12:00
  for (const [kind, props] of [
    ["video_wall", { variant: 0 }],
    ["video_wall", { variant: 1 }],
    ["outdoor_cinema", {}],
    ["security_monitors", {}],
  ] as const) {
    const b = blinks(kind, props);
    assert.ok(b.length > 0, `${kind}: something blinks`);
    const at = [0, 0.13, 0.3, 0.7, 1.4, 2.1, 3.3, 4.25].map((t) => b.map((p) => liveAt(p.anim, t).shown).join());
    assert.ok(new Set(at).size > 1, `${kind}: and changes`);
    assert.equal(blinks(kind, { ...props, on: false }).length, 0, `${kind}: still when off`);
  }
  // the monitor that cycles its cameras: two pictures, never both, never none
  const cyc = blinks("security_monitors").filter((p) => p.anim.kind === "blink" && p.anim.period === 6);
  assert.ok(cyc.length >= 2);
  const showing = (t: number) =>
    new Set(cyc.filter((p) => liveAt(p.anim, t).shown).map((p) => (p.anim.kind === "blink" ? p.anim.phase : -1)));
  for (const t of [0.5, 2, 3.5, 5]) assert.equal(showing(t).size, 1, `one camera at a time (${t} s)`);
});
