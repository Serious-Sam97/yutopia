import assert from "node:assert/strict";
import { test } from "node:test";
import { getMap, levelMap, type MapDef, type WorldObjectDef } from "@yutopia/shared";
import { finishWorld } from "@yutopia/shared/structure/finish";
import { localThing, localView } from "@yutopia/shared/structure/fold";
import { LightMap } from "./light";
import { LAYERS, LightVolume, VPX } from "./light-volume";

// Docs/plan/72 phase 9: the light volume. On the floor (its layer 0) it's the light map's light
// exactly, wherever its lamps hang — a lamp hung high reaches further and burns brighter by just as
// much as its height takes off on the floor; above the floor, it's lit by how far it is from them.

const studio = getMap("studio");
const done = finishWorld(studio, studio.objects, { fresh: true, building: true });

// (the light map's own sum at a point: its lamps at 0.35 m, what they see — art/light.ts add)
function plan(lm: LightMap, x: number, y: number): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (const { s, win } of lm.sources) {
    const d = Math.hypot(x - s.x, y - s.y, 0.35);
    if (d >= s.radius || !lm.sees(s, x, y)) continue;
    const f = (1 - (d / s.radius) ** 2) ** 2 * s.intensity;
    if (win) out[3] += f;
    else {
      out[0] += (((s.color >> 16) & 255) / 255) * f;
      out[1] += (((s.color >> 8) & 255) / 255) * f;
      out[2] += ((s.color & 255) / 255) * f;
    }
  }
  return out;
}

for (const level of [0, 4]) {
  const lmap = levelMap(done.map, level) as MapDef;
  const floor = localView(lmap);
  const things: WorldObjectDef[] = done.objects
    .filter((o) => (o.props?.level ?? 4) === level)
    .map((o) => localThing(lmap, o));
  const lm = new LightMap(floor, things);

  test(`floor ${level}: the volume's floor is the light map's light, wherever its lamps hang`, () => {
    assert.ok(lm.sources.length > 0, "it has lamps or windows");
    {
      const v = new LightVolume(lm);
      let worst = 0;
      let lit = 0;
      for (let py = 0; py < v.h; py += 3)
        for (let px = 0; px < v.w; px += 3) {
          const want = plan(lm, (px + 0.5) / VPX, (py + 0.5) / VPX);
          const i = (py * v.w + px) * 4;
          // (half floats: within their precision)
          for (let k = 0; k < 4; k++)
            worst = Math.max(worst, Math.abs(v.at(i + k) - want[k]) / Math.max(0.05, want[k]));
          if (want[0] + want[3] > 0.05) lit++;
        }
      assert.ok(lit > 20, `some of it lit (${lit})`);
      assert.ok(worst < 4e-3, `off the light map's by ${worst} (relative)`);
    }
  });
}

test("up the storey: a lamp lights round where it hangs — a pendant brightest round its shade", () => {
  const lmap = levelMap(done.map, 4) as MapDef;
  const floor = localView(lmap);
  const things: WorldObjectDef[] = done.objects
    .filter((o) => (o.props?.level ?? 4) === 4)
    .map((o) => localThing(lmap, o));
  // (one pendant over the middle of the studio, on its own)
  const at = { x: Math.floor(floor.width / 2), y: Math.floor(floor.height / 2) };
  const pendant: WorldObjectDef = { id: "p1", kind: "pendant_light", x: at.x, y: at.y, props: { on: true } };
  const lm = new LightMap(floor, [pendant, ...things.filter((o) => o.kind !== "window" && !/light|lamp/.test(o.kind))]);
  const lamp = lm.sources.find((q) => !q.win && q.s.h);
  assert.ok(lamp, "the pendant gives light, hung");
  const high = new LightVolume(lm);
  const px = Math.floor(lamp.s.x * VPX);
  const py = Math.floor(lamp.s.y * VPX);
  const at3 = (v: LightVolume, k: number) => v.at((k * v.w * v.h + py * v.w + px) * 4);
  // hung at 2.3 m: brightest round its own height, brighter there than on the floor
  const ks = [...Array(LAYERS).keys()];
  const top = ks.reduce((a, b) => (at3(high, b) > at3(high, a) ? b : a), 0);
  assert.ok(
    Math.abs(LightVolume.layerY(top) - (lamp.s.h ?? 0)) <= 0.51,
    `its brightest layer at ${LightVolume.layerY(top)}`,
  );
  assert.ok(at3(high, top) > at3(high, 0) * 1.5, "brighter round the shade than on the floor");
});
