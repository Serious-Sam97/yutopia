import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw } from "@yutopia/shared";
import { Box3, type BufferGeometry, Mesh, MeshBasicMaterial } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { LOOKS } from "./desktop2";

// Plan 68 phase 7 (docs/plan/68-more-furniture.md): On desks — every kind and look a thing on a surface
// in its 1×1 frame (live parts at rest too), stood on its top, under 8k tris; its looks one a catalog
// variant; what moves moves: the cradle's end balls swing in turn, the globe's land and the fan's blades
// turn, the snow globe's flakes and the aquarium's fish go round and its bubbles rise, the hourglass's
// grains fall, the Vortex figurine bobbles.

const KINDS = Object.keys(LOOKS);
const mat = new MeshBasicMaterial();
const SEEDS = ["a", "s7", "q19", "zz", "k3"];
const of = (kind: string, props: Record<string, unknown> = {}, id = "d") =>
  modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props });
const live = (g: BufferGeometry) => (g.userData.live as LivePart[] | undefined) ?? [];

/** The box round a model: its still parts, what glows, its live parts where they rest. */
function bounds(g: BufferGeometry): Box3 {
  g.computeBoundingBox();
  const b = new Box3().copy(g.boundingBox as Box3);
  const glow = g.userData.glow as BufferGeometry | null;
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
  ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0) / 3 +
  live(g).reduce((n, p) => n + p.geo.attributes.position.count / 3, 0);

test("on desks: every kind and look in its frame, on the top it stands on, under 8k tris", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.ok(e.onSurface && e.buildable, `${kind}: put on a surface`);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a look a variant`);
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const id of SEEDS)
        for (const on of [true, false]) {
          const g = of(kind, { variant, on }, id);
          const b = bounds(g);
          const what = `${kind} ${variant} ${id}${on ? "" : " off"}`;
          assert.ok(
            b.min.x >= 0.25 && b.max.x <= 0.75 && b.min.z >= 0.25 && b.max.z <= 0.75,
            `${what}: sized for a desk`,
          );
          assert.ok(b.min.y > -0.004 && b.min.y < 0.012, `${what}: on its top (${b.min.y.toFixed(4)})`);
          assert.ok(b.max.y < 0.4, `${what}: low enough for a shelf (${b.max.y.toFixed(3)})`);
          assert.ok(tris(g) < 8000, `${what}: under 8k tris (${tris(g)})`);
        }
  }
});

test("on desks: what moves moves", () => {
  const parts = (kind: string, props: Record<string, unknown> = {}) => live(of(kind, props));
  // the cradle: its end balls swing out in turn — one at rest while the other's out
  const balls = parts("newtons_cradle").filter((p) => p.anim.kind === "nod");
  assert.equal(balls.length, 2, "the end balls");
  const tip = (p: LivePart, t: number) => p.rot[2] + liveAt(p.anim, t).turn[1];
  const at = [0.375, 1.125].map((t) => balls.map((p) => Math.abs(tip(p, t))));
  for (const [a, b] of at) assert.ok(Math.min(a, b) < 0.02 && Math.max(a, b) > 0.4, "one out, one resting");
  assert.ok(at[0][0] < at[0][1] !== at[1][0] < at[1][1], "in turn");
  // (each swings outward only, never through its neighbours)
  for (const p of balls) for (let t = 0; t < 3; t += 0.1) assert.ok(tip(p, t) * p.rot[2] >= -1e-9, "outward");
  // the globe, the fan: turning (round their own z: the globe's tipped axis, the fan's hub)
  for (const kind of ["desk_globe", "desk_fan"]) {
    const spin = parts(kind).find((p) => p.anim.kind === "spin");
    assert.ok(spin, `${kind}: turns`);
    assert.ok(Math.abs(liveAt(spin.anim, 1).turn[1] - liveAt(spin.anim, 0).turn[1]) > 0.1, `${kind}: turning`);
  }
  // swirls: flakes in the snow globe, fish in the aquarium (and in the bowl), under glass
  for (const [kind, props] of [
    ["desk_snow_globe", {}],
    ["desk_aquarium", { variant: 0 }],
    ["desk_aquarium", { variant: 2 }],
  ] as const) {
    const ps = parts(kind, props);
    const sw = ps.find((p) => p.anim.kind === "swirl");
    assert.ok(sw && liveAt(sw.anim, 2).turn[0] !== 0, `${kind}: goes round`);
    assert.ok(
      ps.some((p) => p.glass),
      `${kind}: under glass`,
    );
  }
  // the aquarium's bubbles rise (sets lit in turn, each higher than the last), its water lit while on
  const bub = parts("desk_aquarium").filter((p) => p.anim.kind === "blink");
  assert.ok(bub.length >= 3, "bubbles");
  const lit = [0, 0.3, 0.6].map((t) => bub.map((p) => liveAt(p.anim, t).shown).join());
  assert.equal(new Set(lit).size, 3, "rising");
  assert.ok(
    parts("desk_aquarium").some((p) => p.glass && p.glow),
    "the water lit",
  );
  assert.ok(!parts("desk_aquarium", { on: false }).some((p) => p.glass && p.glow), "and dark when off");
  // the hourglass's grains, the bobblehead
  const grains = parts("hourglass").filter((p) => p.anim.kind === "blink");
  assert.ok(grains.length >= 3, "grains falling");
  const bobs = parts("vortex_figurine").filter((p) => p.anim.kind === "nod");
  assert.ok(bobs.length >= 4, "Vortex in his colours");
  assert.ok(Math.abs(liveAt(bobs[0].anim, 0.4).turn[1] - liveAt(bobs[0].anim, 0).turn[1]) > 0.05, "he bobbles");
  assert.ok(
    bobs.every((p) => JSON.stringify(p.anim) === JSON.stringify(bobs[0].anim) && p.at.join() === bobs[0].at.join()),
    "all of him together",
  );
});

test("on desks: story details by the seed", () => {
  // a typewriter's sheet typed further for some, what's in a pencil cup, a cube scrambled or turning,
  // how far an hourglass has run; a pin in some globes
  const sum = (kind: string, id: string) => {
    const p = of(kind, { variant: 0 }, id).attributes.position.array;
    let s = 0;
    for (let i = 0; i < p.length; i += 7) s += p[i] * (i % 13);
    return `${p.length}|${s.toFixed(3)}`;
  };
  for (const kind of ["typewriter", "pencil_cup", "rubiks_cube", "hourglass"]) {
    const n = new Set(SEEDS.map((id) => sum(kind, id)));
    assert.ok(n.size > 1, `${kind}: not every one alike`);
  }
  assert.ok(new Set(SEEDS.map((id) => live(of("desk_globe", {}, id)).length)).size > 1, "a pin in some globes");
});
