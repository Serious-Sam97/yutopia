import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw } from "@yutopia/shared";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS, PLAY } from "./music";

// Plan 68 phase 10 (docs/plan/68-more-furniture.md): play & music — every kind and look on its footprint
// (the metronome in its 1×1 on a surface), under the ceiling, on the floor, under 8k tris; where each is
// played from as PLAY has it; the live parts moving — the DJ's records and panels, the karaoke's lights,
// the metronome's arm.

const CEILING = 3.27;

function bounds(g: BufferGeometry) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const add = (pos: ArrayLike<number>, at: number[] = [0, 0, 0]) => {
    for (let i = 0; i < pos.length; i += 3) {
      b.x0 = Math.min(b.x0, pos[i] + at[0]);
      b.x1 = Math.max(b.x1, pos[i] + at[0]);
      b.y0 = Math.min(b.y0, pos[i + 1] + at[1]);
      b.y1 = Math.max(b.y1, pos[i + 1] + at[1]);
      b.z0 = Math.min(b.z0, pos[i + 2] + at[2]);
      b.z1 = Math.max(b.z1, pos[i + 2] + at[2]);
    }
  };
  add(g.attributes.position.array);
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) add(glow.attributes.position.array);
  // (a live part at rest, unturned: its own points round where it rests)
  for (const p of live(g)) add(p.geo.attributes.position.array, p.at);
  return b;
}
const live = (g: BufferGeometry) => (g.userData.live as LivePart[] | undefined) ?? [];
const tris = (g: BufferGeometry) =>
  (g.attributes.position.count +
    ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0) +
    live(g).reduce((n, p) => n + p.geo.attributes.position.count, 0)) /
  3;

/** What's hit looking along `dir` from `from`: where (null: nothing). */
function hit(g: BufferGeometry, from: [number, number, number], dir: [number, number, number]): Vector3 | null {
  const ray = new Raycaster(new Vector3(...from), new Vector3(...dir).normalize());
  const mat = new MeshBasicMaterial({ side: DoubleSide });
  const meshes = [new Mesh(g, mat)];
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) meshes.push(new Mesh(glow, mat));
  const h = ray.intersectObjects(meshes)[0];
  return h ? h.point : null;
}
const topAt = (g: BufferGeometry, x: number, z: number, from = 3) => hit(g, [x, from, z], [0, -1, 0])?.y ?? 0;

const model = (kind: string, variant: number, id = "t") =>
  modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });

test(`play & music: every kind and look on its footprint, under the ceiling, on the floor, under 8k tris`, () => {
  for (const kind of Object.keys(LOOKS)) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a look a variant`);
    assert.ok(e.buildable, `${kind}: in the panel`);
    for (let v = 0; v < LOOKS[kind].length; v++)
      for (const id of ["a", "b", "c", "d"]) {
        const g = model(kind, v, id);
        const b = bounds(g);
        const what = `${kind} ${v} (${id})`;
        const [w, h] = e.onSurface ? [1, 1] : [e.w, e.h];
        assert.ok(
          b.x0 >= -0.005 && b.x1 <= w + 0.005 && b.z0 >= -0.005 && b.z1 <= h + 0.005,
          `${what}: on its footprint (${b.x0.toFixed(2)}..${b.x1.toFixed(2)}, ${b.z0.toFixed(2)}..${b.z1.toFixed(2)})`,
        );
        assert.ok(b.y1 <= CEILING, `${what}: under the ceiling (${b.y1.toFixed(2)})`);
        if (e.wall) assert.ok(b.z0 >= 0.1 - 0.005, `${what}: out from the wall's face`);
        else assert.ok(b.y0 > -0.02 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(tris(g) < MAX_TRIS, `${what}: under 8k tris (${tris(g)})`);
      }
  }
});

test("play & music: where they're played from", () => {
  for (let v = 0; v < 3; v++) {
    const dk = model("drum_kit", v);
    const [sx, sz] = PLAY.drum_kit.stool;
    assert.ok(Math.abs(topAt(dk, sx, sz) - PLAY.drum_kit.top) < 0.02, `drums ${v}: the stool`);
    const sy = PLAY.drum_kit.snare;
    assert.ok(Math.abs(topAt(dk, sy[0] + 0.05, sy[2] - 0.05) - sy[1]) < 0.04, `drums ${v}: the snare's head`);
    const sy2 = model("synth_stand", v);
    const S = PLAY.synth_stand;
    assert.ok(Math.abs(topAt(sy2, S.x0 + 0.0117, S.front - 0.03) - S.keys) < 0.004, `synth ${v}: its keys`);
    const dj = model("dj_booth", v);
    const [dx, dz] = PLAY.dj_booth.dj;
    assert.ok(Math.abs(topAt(dj, dx, dz) - PLAY.dj_booth.riser) < 0.003, `dj ${v}: the riser`);
    // the karaoke's picture: its glass across where PLAY has it
    const K = PLAY.karaoke;
    const k = model("karaoke", v);
    for (const [x, y] of [
      [K.x0 + 0.02, K.y0 + 0.02],
      [K.x1 - 0.02, K.y1 - 0.02],
    ]) {
      const p = hit(k, [x, y, 1], [0, 0, -1]);
      assert.ok(p && Math.abs(p.z - K.z) < 0.01, `karaoke ${v}: its screen at ${x}, ${y}`);
    }
  }
});

test("live parts: the records turn, the lights flash, the metronome ticks", () => {
  const parts = (kind: string, v = 0) => live(model(kind, v));
  const changes = (ps: LivePart[], f: (p: LivePart, t: number) => unknown) =>
    new Set([0, 0.23, 0.51, 0.77, 1.3].map((t) => ps.map((p) => JSON.stringify(f(p, t))).join("|"))).size > 1;
  for (let v = 0; v < 3; v++) {
    const dj = parts("dj_booth", v);
    const records = dj.filter((p) => p.anim.kind === "spin");
    assert.ok(records.length >= 4, `dj ${v}: two records and their labels`);
    assert.ok(liveAt(records[0].anim, 1).turn[0] > 3, `dj ${v}: at 33⅓`);
    assert.ok(
      changes(
        dj.filter((p) => p.anim.kind === "blink"),
        (p, t) => liveAt(p.anim, t).shown,
      ),
      `dj ${v}: its front flashes`,
    );
    const kar = parts("karaoke", v);
    assert.ok(
      kar.some((p) => p.anim.kind === "spin") && kar.some((p) => p.glass),
      `karaoke ${v}: its light goes round`,
    );
    const arm = parts("metronome", v).find((p) => p.anim.kind === "nod");
    const swings = arm ? Array.from({ length: 10 }, (_, i) => liveAt(arm.anim, i / 10).turn[1]) : [0];
    assert.ok(Math.max(...swings) - Math.min(...swings) > 0.5, `metronome ${v}: ticks`);
  }
  // (the still ones have none)
  for (const kind of ["gong", "theremin", "synth_stand", "drum_kit", "guitar_amp"])
    assert.equal(parts(kind).length, 0, `${kind}: still`);
});
