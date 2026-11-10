import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw } from "@yutopia/shared";
import type { BufferGeometry } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS } from "./pets2";

// Plan 68 phase 16: Pets — every kind and look on its footprint (the hamster cage on its 1×1 on a
// surface), on the floor, under 8k tris; the hamster's wheel going round, the bird bobbing and its
// swing swaying, the gate's flap swinging, the cat tree's toy, the lights blinking.

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

test("pets: every look on its footprint, on the floor, under 8k tris", () => {
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
        assert.ok(b.y1 <= 3.275, `${what}: under the ceiling`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(tris(g) < MAX_TRIS, `${what}: under 8k tris (${tris(g)})`);
      }
  }
});

test("pets: the wheel goes round, the bird bobs, the flap swings, the toy dangles, lights blink", () => {
  const moving = (kind: string, anim: string, variant = 0) => {
    const ps = live(kind, { variant }).filter((p) => p.anim.kind === anim);
    assert.ok(ps.length > 0, `${kind} ${variant}: ${anim}`);
    const a = liveAt(ps[0].anim, 0);
    const b = liveAt(ps[0].anim, 0.7);
    assert.ok(
      a.turn[0] !== b.turn[0] || a.turn[1] !== b.turn[1] || a.shown !== b.shown,
      `${kind} ${variant}: its ${anim} moves`,
    );
  };
  for (let v = 0; v < 2; v++) {
    moving("hamster_wheel", "spin", v);
    moving("hamster_wheel", "nod", v);
    moving("pet_door", "nod", v);
    moving("ball_launcher", "blink", v);
    moving("auto_feeder", "blink", v);
  }
  for (let v = 0; v < 3; v++) {
    moving("bird_cage", "nod", v);
    moving("cat_tree", "nod", v);
  }
  assert.ok(
    live("auto_feeder").some((p) => p.glass),
    "the feeder's hopper is clear",
  );
});
