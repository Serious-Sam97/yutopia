import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { CATALOG, placedFootprint, quarterYaw, standHeight, type WorldObjectDef } from "../catalog.ts";
import { isOpening } from "../openings.ts";
import { blocksOf, kindSolids, type Solid3 } from "../shapes/index.ts";
import { loadJolt } from "./load.ts";
import { BODY, PhysicsWorld, sizesFor } from "./world.ts";

// The furniture in Jolt (docs/plan/67-the-furniture.md: its shapes from the kit's models). Every
// solid kind, at two turns, walked at from its four sides along its middle: where something on that
// line stands higher than the walker climbs and lower than a head, the walker is stopped short of it
// — never inside it, never through to the other side; where nothing does, it gets past (or up onto
// it). And a body dropped onto it, where its body's top is uppermost, lands at the jump table's
// height.

// (what Jolt's walker gets up onto without a jump: STEP_UP, and the capsule's round foot riding up a
// little more — a 0.42 m coffee table is walked onto, a 0.5 m toy box isn't)
const CLIMBS = 0.45;

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});
const flat = (x0 = -12, z0 = -12, n = 49) => ({ x0, z0, n, step: 0.5, h: new Float32Array(n * n) });
// (the building's own, not furniture: the stairs and the lift are walked on and ridden, the car a
// vehicle; a wall piece hangs off the ground)
const SKIP = new Set(["stairs", "elevator", "car"]);
const kinds = Object.keys(CATALOG).filter((k) => blocksOf(k) === "solid" && !isOpening(k) && !SKIP.has(k));

const inside = (s: Solid3, x: number, z: number, r: number) =>
  s.t === "box"
    ? Math.abs(x - s.x) < s.hx + r - 0.06 && Math.abs(z - s.z) < s.hz + r - 0.06
    : Math.hypot(x - s.x, z - s.z) < s.r + r - 0.06;
const height = (s: Solid3): [number, number] => (s.t === "box" ? [s.y - s.hy, s.y + s.hy] : [s.y0, s.y1]);

test("every solid piece in Jolt: walked at from four sides, stopped where it blocks; stood on at its top", async () => {
  const bad: string[] = [];
  for (const kind of kinds)
    for (const rot of [0, 1]) {
      const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 16, things: 8 }));
      worlds.push(w);
      w.setLand("land", flat());
      const o: WorldObjectDef = { id: `t-${kind}`, kind, x: 0, y: 0, yaw: quarterYaw(rot), props: {} };
      const solids = kindSolids(o, 0);
      w.setStatic("thing", solids);
      w.settle();
      const { w: fw, h: fh } = placedFootprint(o);
      const [mx, mz] = [fw / 2, fh / 2];
      const what = `${kind} rot ${rot}`;
      // the four sides, along the middle
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const span = dx ? fw / 2 : fh / 2;
        const sx = mx - dx * (span + 1.6);
        const sz = mz - dz * (span + 1.6);
        // what stands on the walker's line, from a step to a head high
        const blocks = solids.some((s) => {
          const [y0, y1] = height(s);
          if (y1 <= CLIMBS || y0 >= BODY.h - 0.1) return false;
          // (the line: the walker's path from its start to the far side, its body's width round it)
          for (let t = 0; t <= 1; t += 0.02) {
            const x = sx + dx * t * (2 * span + 3.2);
            const z = sz + dz * t * (2 * span + 3.2);
            if (inside(s, x, z, 0.06)) return true;
          }
          return false;
        });
        const c = w.addCharacter(sx, 0.02, sz) as number;
        for (let i = 0; i < 180; i++) {
          w.moveCharacter(c, dx * 2, -2, dz * 2, 1 / 60, true);
          w.step();
        }
        const p: [number, number, number] = [0, 0, 0];
        w.characterAt(c, p);
        const past = dx * (p[0] - mx) + dz * (p[2] - mz) > 0;
        const into = solids.find((s) => {
          const [y0, y1] = height(s);
          return y1 > p[1] + CLIMBS && y0 < p[1] + BODY.h - 0.1 && inside(s, p[0], p[2], BODY.r);
        });
        if (into) bad.push(`${what} from ${dx},${dz}: the walker inside it at ${p.map((v) => v.toFixed(2))}`);
        if (blocks && past) bad.push(`${what} from ${dx},${dz}: walked through it to ${p.map((v) => v.toFixed(2))}`);
        if (!blocks && !past && p[1] < 0.05)
          bad.push(`${what} from ${dx},${dz}: stopped by nothing on its line at ${p.map((v) => v.toFixed(2))}`);
      }
      // stood on: dropped onto its body's middle, it lands at the jump table's height
      const st = standHeight(kind);
      // (a top narrower than a body isn't stood on: a fireplace's mantel shelf)
      const narrow = solids[0].t === "box" && Math.min(solids[0].hx, solids[0].hz) < BODY.r * 0.6;
      if (st !== undefined && !narrow) {
        const top = st;
        // (its body's middle, or a quarter along it where something else stands over the middle: a
        // net, a terminal on its cart, a roof's ridge)
        const body = solids[0];
        const [hx, hz] = body.t === "box" ? [body.hx, body.hz] : [body.r * 0.7, body.r * 0.7];
        const topAt = (x: number, z: number) =>
          solids.reduce((t, s) => (inside(s, x, z, 0.06 + 0.06) ? Math.max(t, height(s)[1]) : t), 0);
        const spots: [number, number][] = [[body.x, body.z]];
        for (const [a, b] of [
          [0.5, 0],
          [-0.5, 0],
          [0, 0.5],
          [0, -0.5],
          [0.5, 0.5],
          [-0.5, -0.5],
        ])
          spots.push([body.x + a * hx, body.z + b * hz]);
        const [bx, bz] = spots.find(([x, z]) => topAt(x, z) <= height(body)[1] + 0.01) ?? spots[0];
        const c = w.addCharacter(bx, top + 0.6, bz) as number;
        for (let i = 0; i < 120; i++) {
          w.moveCharacter(c, 0, -4, 0, 1 / 60, true);
          w.step();
        }
        const p: [number, number, number] = [0, 0, 0];
        w.characterAt(c, p);
        if (Math.abs(p[1] - top) > 0.09) bad.push(`${what}: stood on at ${p[1].toFixed(2)}, its top ${top.toFixed(2)}`);
      }
      w.destroy();
      worlds.pop();
    }
  assert.deepEqual(bad, []);
});
