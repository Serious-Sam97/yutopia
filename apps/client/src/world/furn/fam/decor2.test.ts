import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw } from "@yutopia/shared";
import type { BufferGeometry } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { LOOKS } from "./decor2";

// Plan 68 phase 14: Decor — every kind and look on its footprint (a wall piece on its wall's frame, a
// thing on a surface on its 1×1), under the ceiling, on the floor (floor pieces), under 8k tris; the
// aquarium's fish going round and its bubbles rising, the stove's flames (none when it's out), the
// fountain's jet playing and its water falling.

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

test("decor: every look on its footprint, under the ceiling, on the floor, under 8k tris", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a look a variant`);
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const seed of ["a", "b", "c", "d"]) {
        const g = modelOf({ id: `${kind}-${seed}`, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
        const b = bounds(g);
        const what = `${kind} ${variant}`;
        const [w, h] = e.onSurface ? [1, 1] : [e.w, e.h];
        assert.ok(
          b.x0 >= -0.005 && b.x1 <= w + 0.005 && b.z0 >= -0.005 && b.z1 <= h + 0.005,
          `${what}: on its footprint`,
        );
        assert.ok(b.y1 <= 3.275, `${what}: under the ceiling (${b.y1.toFixed(3)})`);
        if (e.wall) assert.ok(b.z0 >= 0.095, `${what}: in front of its wall`);
        else if (kind !== "hanging_plant")
          assert.ok(b.y0 > -0.006 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(tris(g) < 8000, `${what}: under 8k tris (${tris(g)})`);
      }
  }
  // the hanging plant over heads, from the ceiling
  for (let variant = 0; variant < 3; variant++) {
    const b = bounds(model("hanging_plant", { variant }));
    assert.ok(b.y0 > 1.82 && b.y1 > 3.2, `hanging plant ${variant}: ${b.y0.toFixed(2)}–${b.y1.toFixed(2)}`);
  }
});

test("decor: fish swim round, bubbles rise, flames flicker and go out, the fountain plays", () => {
  for (let variant = 0; variant < 3; variant++) {
    const parts = live("big_aquarium", { variant });
    const fish = parts.filter((p) => p.anim.kind === "swirl");
    assert.ok(fish.length >= 4, `aquarium ${variant}: schools of fish`);
    assert.ok(liveAt(fish[0].anim, 3).turn[0] !== liveAt(fish[0].anim, 0).turn[0], "they swim round");
    const bubbles = parts.filter((p) => p.anim.kind === "blink");
    const at = [0, 0.3, 0.6].map((t) => bubbles.map((p) => liveAt(p.anim, t).shown).join());
    assert.ok(bubbles.length >= 6 && new Set(at).size === 3, `aquarium ${variant}: bubbles rising`);
    assert.ok(
      parts.some((p) => p.glass),
      "under water",
    );
    const flames = live("wood_stove", { variant }).filter((p) => p.anim.kind === "flame");
    assert.ok(flames.length >= 4, `stove ${variant}: flames`);
    assert.equal(live("wood_stove", { variant, on: false }).filter((p) => p.anim.kind === "flame").length, 0, "out");
  }
  for (let variant = 0; variant < 2; variant++) {
    const parts = live("fountain", { variant });
    const falling = parts.filter((p) => p.anim.kind === "blink");
    const at = [0, 0.2, 0.4, 0.6].map((t) => falling.map((p) => liveAt(p.anim, t).shown).join());
    assert.ok(falling.length >= 6 && new Set(at).size > 2, `fountain ${variant}: water falling, rippling`);
    assert.ok(
      parts.some((p) => p.glass),
      `fountain ${variant}: its water`,
    );
  }
  assert.ok(
    live("fountain").some((p) => p.anim.kind === "flame"),
    "the jet plays",
  );
  assert.ok(
    live("terrarium", { variant: 0 }).some((p) => p.glass),
    "a terrarium's glass",
  );
});
