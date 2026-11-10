import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, hangSize, quarterYaw } from "@yutopia/shared";
import { kindSolids } from "@yutopia/shared/shapes";
import type { BufferGeometry } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS } from "./lights2";

// Plan 68 phase 11 (docs/plan/68-more-furniture.md): the Lights — every kind and look, lit and out, on
// its footprint (a wall piece on its wall, a ceiling one over heads and under the ceiling, a thing on a
// surface in its 1×1), under 8k tris counting its glow and live parts; each a lamp that switches, dark
// and still when it's off; the fairy lights twinkle, the candles flicker, the chandelier's crystals
// glint, the Edison bulbs' glass stays put.

const CEILING = 3.27;
const KINDS = Object.keys(LOOKS);

function bounds(g: BufferGeometry) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const take = (p: ArrayLike<number>, dx = 0, dy = 0, dz = 0) => {
    for (let i = 0; i < p.length; i += 3) {
      b.x0 = Math.min(b.x0, p[i] + dx);
      b.x1 = Math.max(b.x1, p[i] + dx);
      b.y0 = Math.min(b.y0, p[i + 1] + dy);
      b.y1 = Math.max(b.y1, p[i + 1] + dy);
      b.z0 = Math.min(b.z0, p[i + 2] + dz);
      b.z1 = Math.max(b.z1, p[i + 2] + dz);
    }
  };
  take(g.attributes.position.array);
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) take(glow.attributes.position.array);
  for (const l of live(g)) take(l.geo.attributes.position.array, ...l.at);
  return b;
}
const live = (g: BufferGeometry) => (g.userData.live as LivePart[] | undefined) ?? [];
const tris = (g: BufferGeometry) => {
  const glow = g.userData.glow as BufferGeometry | null;
  return (
    (g.attributes.position.count +
      (glow?.attributes.position.count ?? 0) +
      live(g).reduce((n, l) => n + l.geo.attributes.position.count, 0)) /
    3
  );
};
const model = (kind: string, props: Record<string, unknown> = {}) =>
  modelOf({ id: `l-${kind}`, kind, x: 0, y: 0, yaw: quarterYaw(0), props });

test("lights: every look, lit and out, on its footprint, under the ceiling, under 8k tris", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants, LOOKS[kind].length, `${kind}: a look a variant`);
    const ceiling = !e.wall && !e.onSurface && !e.solid;
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const on of [true, false]) {
        const g = model(kind, { variant, on });
        const b = bounds(g);
        const what = `${kind} ${variant}${on ? "" : " (off)"}`;
        const [w, h] = e.onSurface ? [1, 1] : [e.w, e.h];
        assert.ok(b.x0 >= -0.005 && b.x1 <= w + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        if (e.wall) {
          assert.ok(b.z0 >= 0.098 && b.z1 <= 0.4, `${what}: on its wall, out ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
          assert.ok(b.y0 > 1.2, `${what}: up the wall (${b.y0.toFixed(3)})`);
        } else assert.ok(b.z0 >= -0.005 && b.z1 <= h + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y1 <= CEILING + 0.003, `${what}: under the ceiling (${b.y1.toFixed(3)})`);
        if (ceiling) assert.ok(b.y0 > 2.05, `${what}: over heads (${b.y0.toFixed(3)})`);
        else if (!e.wall)
          assert.ok(b.y0 > -0.006 && b.y0 < 0.015, `${what}: on the floor or its top (${b.y0.toFixed(3)})`);
        assert.ok(tris(g) < MAX_TRIS, `${what}: ${tris(g)} tris`);
      }
  }
});

test("lights: each a lamp with its light, switched off dark and still", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.interact, "lamp", `${kind}: switches`);
    assert.ok(e.light && e.light.radius > 0 && e.light.intensity > 0, `${kind}: a light`);
    assert.ok(e.buildable, `${kind}: buildable`);
    for (let variant = 0; variant < LOOKS[kind].length; variant++) {
      const lit = model(kind, { variant });
      const out = model(kind, { variant, on: false });
      // (what's lit: its glowing parts, still or live — a candle's flames)
      const glow = (g: BufferGeometry) =>
        ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0) +
        live(g)
          .filter((p) => p.glow)
          .reduce((n, p) => n + p.geo.attributes.position.count, 0);
      assert.ok(glow(lit) > 0, `${kind} ${variant}: lit, it glows`);
      assert.ok(glow(out) < glow(lit), `${kind} ${variant}: out, less glows (${glow(out)} vs ${glow(lit)})`);
      assert.ok(!live(out).some((p) => p.glow), `${kind} ${variant}: out, nothing live is lit`);
      assert.ok(
        !live(out).some((p) => p.anim.kind === "flame" || p.anim.kind === "blink"),
        `${kind} ${variant}: out, still`,
      );
    }
  }
  // (hung from the ceiling: its light from where its bulbs are)
  for (const kind of ["chandelier", "paper_lanterns", "edison_cluster", "track_lights"])
    assert.ok((entry(kind).light?.h ?? 0) > 2.3, `${kind}: lit from up high`);
  assert.ok(entry("festoon_lights").outdoor, "the festoon's out of doors");
  assert.ok(
    entry("uplighter").solid && entry("festoon_lights").solid,
    "the uplighter and the festoon's posts are walked round",
  );
});

test("lights: the fairy lights twinkle, the candles flicker, the crystals glint, the glass stays", () => {
  const sets = live(model("fairy_lights", { variant: 0 })).filter((p) => p.anim.kind === "blink");
  assert.ok(sets.length >= 3, "the fairy lights in sets");
  const at = [0, 0.5, 1, 1.5, 2].map((t) => sets.map((p) => liveAt(p.anim, t).shown).join());
  assert.ok(new Set(at).size > 1, "they twinkle");
  for (let variant = 0; variant < 3; variant++) {
    const flames = live(model("candles", { variant })).filter((p) => p.anim.kind === "flame");
    assert.ok(flames.length >= 2, `candles ${variant}: their flames`);
    const sy = [0, 0.1, 0.2, 0.3].map((t) => liveAt(flames[0].anim, t).scale[1]);
    assert.ok(Math.max(...sy) - Math.min(...sy) > 0.05, `candles ${variant}: flickering`);
  }
  assert.ok(
    live(model("chandelier", { variant: 1 })).some((p) => p.anim.kind === "blink"),
    "the crystals glint",
  );
  for (const on of [true, false])
    assert.ok(
      live(model("edison_cluster", { on })).some((p) => p.glass),
      "the Edison bulbs under their glass",
    );
  assert.ok(
    live(model("candles", { variant: 2, on: false })).some((p) => p.glass),
    "the jars' glass, out too",
  );
});

test("lights: shaped from their models; the fairy lights hang where their hang size says", () => {
  for (const kind of KINDS)
    assert.ok(kindSolids({ id: "s", kind, x: 0, y: 0, yaw: quarterYaw(0) }).length > 0, `${kind}: shaped`);
  const [n, lo, hi] = hangSize("fairy_lights");
  const b = bounds(model("fairy_lights"));
  assert.ok(n >= Math.ceil((b.x1 - b.x0) * 4) - 1, `its span ${n}`);
  assert.ok(lo <= b.y0 + 0.03 && hi >= b.y1 - 0.03, `its height ${lo}..${hi} px`);
});
