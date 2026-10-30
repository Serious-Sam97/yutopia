import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadJolt } from "./load.ts";
import { PhysicsWorld, type RagPart, sizesFor } from "./world.ts";

// A ragdoll in the physics world (docs/plan/58-the-animation.md, 5d): dropped, it comes to rest on
// the land, its parts held together at their joints; gone, it leaves nothing behind.

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});
const flat = (x0 = -16, z0 = -16, n = 65) => ({ x0, z0, n, step: 0.5, h: new Float32Array(n * n) });
const up: [number, number, number] = [0, 1, 0];
const down: [number, number, number] = [0, -1, 0];
const x: [number, number, number] = [1, 0, 0];

test("a ragdoll dropped from 3 m lands, settles on the ground, its knee held at its joint", async () => {
  const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8, things: 16 }));
  worlds.push(w);
  w.setLand("land", flat());
  w.settle();
  const at = (y: number): [number, number, number] => [0, y, 0];
  const parts: RagPart[] = [
    { parent: -1, at: at(3.9), q: [0, 0, 0, 1], end: [0, 0.5, 0], r: 0.13, mass: 25, dir: up, axis: x },
    {
      parent: 0,
      at: at(3.9),
      q: [1, 0, 0, 0],
      end: [0, 0.4, 0],
      r: 0.07,
      mass: 8,
      dir: down,
      axis: x,
      rest: down,
      cone: 0.9,
    },
    {
      parent: 1,
      at: at(3.5),
      q: [1, 0, 0, 0],
      end: [0, 0.4, 0],
      r: 0.06,
      mass: 4,
      dir: down,
      axis: x,
      hinge: [0, 2.4],
    },
  ];
  const id = w.addRagdoll(parts, [0, -2, 1]);
  assert.ok(id !== null);
  const before = w.counts();
  const out = new Float32Array(parts.length * 7);
  for (let i = 0; i < 300; i++) w.step(1 / 60);
  assert.ok(w.ragdollParts(id as number, out));
  for (let i = 0; i < parts.length; i++)
    assert.ok(out[i * 7 + 1] > -0.05 && out[i * 7 + 1] < 1, `part ${i} on the ground: y ${out[i * 7 + 1]}`);
  // (the shin's joint where the thigh's end is: the thigh's joint plus its bone turned)
  const [qx, qy, qz, qw] = [out[7 + 3], out[7 + 4], out[7 + 5], out[7 + 6]];
  const e = [0, 0.4, 0];
  const t = [2 * (qy * e[2] - qz * e[1]), 2 * (qz * e[0] - qx * e[2]), 2 * (qx * e[1] - qy * e[0])];
  const end = [
    e[0] + qw * t[0] + (qy * t[2] - qz * t[1]),
    e[1] + qw * t[1] + (qz * t[0] - qx * t[2]),
    e[2] + qw * t[2] + (qx * t[1] - qy * t[0]),
  ];
  const gap = Math.hypot(out[7] + end[0] - out[14], out[8] + end[1] - out[15], out[9] + end[2] - out[16]);
  assert.ok(gap < 0.03, `the knee holds: ${gap.toFixed(3)} m apart`);
  assert.ok(w.ragdollSpeed(id as number) < 0.3, `at rest: ${w.ragdollSpeed(id as number)}`);
  w.removeRagdoll(id as number);
  assert.equal(w.counts().bodies, before.bodies - parts.length);
});
