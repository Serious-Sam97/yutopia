// Plan 108: random rides with jumps over the town's parks (steered, pushed, popped, spun at random), on a mover like
// Jolt's over the floor (it can't lift a body that's under it): she never ends up under the floor, nor in the air
// inside a ramp's body. Before the fix 17 rides in 300 fell through (into a ramp's side in the air, nothing to land
// on). RUNS=1500 for a long run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JUMP_G } from "../jump.ts";
import { openFloor } from "../move/floor.ts";
import { STEP_DT } from "../move/spec.ts";
import { type Body, type MoveEnv, type Mover, NO_INPUT, newBody, stepBody } from "../move/step.ts";
import { parkPieces, TOWN_PARKS } from "./parks.ts";
import { SkatePark } from "./pieces.ts";
import { NO_KEYS, skateEnv, startSkate } from "./step.ts";

/** Jolt's character over a flat floor at h: it can't lift a body that's under it (it falls on). */
function floorMover(h: number): Mover {
  return {
    step(b: Body, dt: number) {
      if (b.z < h - 0.05) {
        b.vz -= JUMP_G * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.up = true;
        return false;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.up) {
        b.vz -= JUMP_G * dt;
        b.z += b.vz * dt;
        if (b.z <= h) {
          b.z = h;
          b.vz = 0;
          b.up = false;
          return true;
        }
        return false;
      }
      b.z = h;
      return false;
    },
  };
}

let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

test("random rides with jumps over the parks never end under the floor nor inside a ramp", () => {
  const bad: string[] = [];
  for (const p of TOWN_PARKS) {
    const park = new SkatePark(parkPieces(p));
    const env: MoveEnv = {
      grid: openFloor(() => p.h),
      footing: () => "walk",
      mover: floorMover(p.h),
      skate: skateEnv(park),
    };
    for (let run = 0; run < Number(process.env.RUNS ?? 150); run++) {
      const s0 = seed;
      const x = p.x0 + 2 + rnd() * (p.x1 - p.x0 - 4);
      const y = p.z0 + 2 + rnd() * (p.z1 - p.z0 - 4);
      const t0 = park.topAt(x, y, p.h + 99);
      const b = newBody(x, y, t0 ? t0.z : p.h, rnd() * Math.PI * 2);
      startSkate(b, "street-pop", 1);
      if (b.skate) b.skate.s = 3 + rnd() * 8;
      const log: string[] = [];
      let steer = 0;
      let nextPop = 0.4 + rnd();
      let hold = 0;
      let inside = 0;
      for (let i = 0; i < Math.round(14 / STEP_DT) && b.skate; i++) {
        const t = i * STEP_DT;
        if (rnd() < 0.02) steer = Math.floor(rnd() * 3) - 1;
        let ollie = false;
        if (t >= nextPop) {
          hold = 0.1 + rnd() * 0.25;
          nextPop = t + hold + 0.5 + rnd() * 1.2;
        }
        if (hold > 0) {
          ollie = true;
          hold -= STEP_DT;
        }
        const keys = { ...NO_KEYS, ollie, left: steer < 0, right: steer > 0, brk: rnd() < 0.3, spinL: rnd() < 0.05 };
        stepBody(b, { ...NO_INPUT, skate: keys }, env);
        const k = b.skate;
        log.push(
          `${t.toFixed(2)} ${k?.mode ?? "off"} ${b.x.toFixed(2)},${b.y.toFixed(2)} z=${b.z.toFixed(3)} vz=${b.vz.toFixed(2)} on=${k?.on ? k.on.piece : "-"} over=${park.over(b.x, b.y)} top=${park.topAt(b.x, b.y, 99)?.z.toFixed(2) ?? "-"}/${park.topAt(b.x, b.y, 99)?.on.piece ?? ""}`,
        );
        if (log.length > 12) log.shift();
        const it = park.topAt(b.x, b.y, 99, 0);
        inside = !b.skate?.on && it && it.z > b.z + 0.1 && b.z > it.p.oz + 0.05 ? inside + 1 : 0;
        if (b.z < p.h - 0.3 || inside > 6) {
          bad.push(`${inside > 6 ? "INSIDE" : "UNDER"} ${p.key} seed ${s0} run ${run}:\n  ${log.join("\n  ")}`);
          break;
        }
      }
    }
  }
  assert.equal(bad.length, 0, `${bad.length} under the floor; first:\n${bad[0]}`);
});
