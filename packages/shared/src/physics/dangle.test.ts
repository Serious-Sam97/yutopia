import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadJolt } from "./load.ts";
import { type DanglePart, PhysicsWorld, sizesFor } from "./world.ts";

// Dangles (docs/plan/61-the-sway.md): what's worn and swings on Jolt — hung off a kinematic anchor,
// it swings and settles under it, is thrown by the anchor's moves, rests against the body's
// stand-ins and the world's statics, and never meets anything gameplay.

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});
const flat = (x0 = -16, z0 = -16, n = 65) => ({ x0, z0, n, step: 0.5, h: new Float32Array(n * n) });
const DT = 1 / 60;

async function world() {
  const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8, things: 16 }));
  worlds.push(w);
  w.setLand("land", flat());
  w.settle();
  return w;
}
// (a bag: a box 0.6 m under its anchor, hung out to the side by `out` m)
const bag = (y: number, out = 0): DanglePart => ({
  parent: -1,
  at: [0, y, 0],
  c: [out, y - 0.6, 0],
  q: [0, 0, 0, 1],
  box: [0.15, 0.1, 0.05],
  mass: 1.2,
  cone: 1.2,
  twist: 0.4,
});
const anchorAt = (x: number, y: number, z: number) => new Float32Array([x, y, z, 0, 0, 0, 1]);
const out = new Float32Array(7);

test("a bag let go of out to the side swings under its anchor and settles there, its strap held", async () => {
  const w = await world();
  const id = w.addDangle(anchorAt(0, 2, 0), [{ ...bag(2, 0.4), friction: 0.3 }]);
  assert.ok(id);
  let crossed = false;
  for (let i = 0; i < 60 * 6; i++) {
    w.moveDangle(id, anchorAt(0, 2, 0), DT);
    w.step(DT);
    w.dangleParts(id, out);
    if (out[0] < -0.05) crossed = true;
    // (its centre kept its distance from the anchor: the joint holds)
    const d = Math.hypot(out[0], out[1] - 2, out[2]);
    assert.ok(Math.abs(d - Math.hypot(0.4, 0.6)) < 0.03, `the strap stretched to ${d.toFixed(3)} m`);
  }
  assert.ok(crossed, "it never swung past the middle");
  assert.ok(Math.abs(out[0]) < 0.03 && Math.abs(out[1] - (2 - 0.72)) < 0.03, `settled at ${out[0]}, ${out[1]}`);
});

test("a bag on its strap lifts off it in a jump's fall and thumps down past where it hangs on landing", async () => {
  const w = await world();
  // (its strap free to go slack by 15 cm, stretching a little)
  const id = w.addDangle(anchorAt(0, 2, 0), [
    {
      ...bag(2),
      slack: 0.15,
      stretch: 6,
    },
  ]);
  assert.ok(id);
  for (let i = 0; i < 60; i++) {
    w.moveDangle(id, anchorAt(0, 2, 0), DT);
    w.step(DT);
  }
  w.dangleParts(id, out);
  const hang = out[1] - 2;
  // (a game's jump: up at 6 m/s, falling at 26 m/s² — quicker than the bag's own fall)
  let lifted = 0;
  let thump = 0;
  for (let i = 0; i < 90; i++) {
    const t = i * DT;
    const y = t < 6 / 13 ? 2 + 6 * t - 13 * t * t : 2;
    w.moveDangle(id, anchorAt(0, y, 0), DT);
    w.step(DT);
    w.dangleParts(id, out);
    const rel = out[1] - y - hang;
    if (t < 6 / 13) lifted = Math.max(lifted, rel);
    else thump = Math.min(thump, rel);
  }
  assert.ok(lifted > 0.05, `the bag never lifted in the fall (${lifted.toFixed(3)})`);
  assert.ok(thump < -0.005, `it never went on down past its hang on landing (${thump.toFixed(3)})`);
  for (let i = 0; i < 180; i++) {
    w.moveDangle(id, anchorAt(0, 2, 0), DT);
    w.step(DT);
  }
  w.dangleParts(id, out);
  assert.ok(Math.abs(out[1] - 2 - hang) < 0.01, "it never settled back on its strap");
});

test("a body's stand-in holds a bag off it, and the stand-in's move knocks it", async () => {
  const w = await world();
  // (a thigh: a capsule upright just in front of where the bag hangs)
  const pid = w.addProxies([{ r: 0.08, h: 0.2 }]);
  assert.ok(pid);
  const leg = (z: number) => new Float32Array([0, 1.4, z, 0, 0, 0, 1]);
  w.moveProxies(pid, leg(0.2), DT, true);
  const id = w.addDangle(anchorAt(0, 2, 0), [bag(2)], pid, 1);
  assert.ok(id);
  // (the leg swung back through where the bag is: the bag's pushed back with it)
  let z = 0.2;
  for (let i = 0; i < 40; i++) {
    z = Math.max(-0.1, z - 1.5 * DT);
    w.moveProxies(pid, leg(z), DT);
    w.moveDangle(id, anchorAt(0, 2, 0), DT);
    w.step(DT);
    w.dangleParts(id, out);
    assert.ok(out[2] < z - 0.08 + 0.02, `the bag went into the leg (${out[2].toFixed(3)} by ${z.toFixed(3)})`);
  }
  assert.ok(out[2] < -0.12, "the leg never pushed it back");
});

test("a static stops a bag; a thing falling and a stand-in of no one's never meet what's not theirs", async () => {
  const w = await world();
  // (a wall just behind where it'd swing to)
  w.setStatic("wall", [{ t: "box", x: 0, y: 1.5, z: -0.3, hx: 1, hy: 1, hz: 0.05, a: 0 }], "wall");
  w.settle();
  const id = w.addDangle(anchorAt(0, 2, 0), [{ ...bag(2), c: [0, 2, 0.6] }]);
  assert.ok(id);
  let least = 0;
  for (let i = 0; i < 120; i++) {
    w.moveDangle(id, anchorAt(0, 2, 0), DT);
    w.step(DT);
    w.dangleParts(id, out);
    least = Math.min(least, out[2]);
  }
  assert.ok(least > -0.3, `it went through the wall (${least.toFixed(3)})`);
  // (a ball dropped onto it falls through: a dangle meets nothing that moves)
  const ball = w.addThing({ kind: "ball", r: 0.1 }, out[0], out[1] + 0.6, out[2]);
  assert.ok(ball);
  const p: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 90; i++) {
    w.moveDangle(id, anchorAt(0, 2, 0), DT);
    w.step(DT);
  }
  w.thingAt(ball, p);
  assert.ok(p[1] < 0.5, `the ball came to rest on the bag (${p[1].toFixed(2)})`);
});

test("dangles and stand-ins gone leave nothing behind", async () => {
  const w = await world();
  const before = w.counts().bodies;
  for (let k = 0; k < 50; k++) {
    const pid = w.addProxies([
      { r: 0.1, h: 0.3 },
      { r: 0.12, h: 0 },
    ]);
    assert.ok(pid);
    const id = w.addDangle(anchorAt(0, 2, 0), [bag(2), { ...bag(1.4), parent: 0, c: [0, 0.9, 0] }], pid, 2);
    assert.ok(id);
    for (let i = 0; i < 10; i++) w.step(DT);
    w.removeDangle(id);
    w.removeProxies(pid);
  }
  assert.equal(w.counts().bodies, before);
});

test("a soak: 20 people a minute — the stand-ins and two dangles each, moving — no NaN, nothing gained", async () => {
  const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8, worn: 20 * 14 }));
  worlds.push(w);
  w.setLand("land", flat(-40, -40, 161));
  w.settle();
  const people = Array.from({ length: 20 }, (_, k) => {
    const pid = w.addProxies(Array.from({ length: 10 }, () => ({ r: 0.08, h: 0.15 })));
    assert.ok(pid);
    const x = (k % 5) * 3 - 6;
    const z = Math.floor(k / 5) * 3 - 6;
    const at = new Float32Array(70);
    const a = anchorAt(x, 1.3, z);
    const bagId = w.addDangle(
      a,
      [{ ...bag(1.3), at: [x, 1.3, z], c: [x, 0.95, z], slack: 0.06, stretch: 14 }],
      pid,
      10,
    );
    const tailId = w.addDangle(
      anchorAt(x, 1.6, z),
      [{ parent: -1, at: [x, 1.6, z], c: [x, 1.45, z], q: [0, 0, 0, 1], r: 0.03, h: 0.1, mass: 0.1, cone: 0.7 }],
      pid,
      11,
    );
    assert.ok(bagId && tailId);
    return { pid, bagId, tailId, x, z, at };
  });
  // (Jolt's heap once it's settled in: its contact caches grown to what's touching, the first seconds)
  let heap0 = 0;
  const bodies0 = w.counts().bodies;
  const out = new Float32Array(7);
  for (let i = 0; i < 60 * 60; i++) {
    const t = i * DT;
    for (const [k, p] of people.entries()) {
      // (round a circle at a jog, bobbing, now and then a jump)
      const ang = t * 1.2 + k;
      const x = p.x + Math.cos(ang) * 2;
      const z = p.z + Math.sin(ang) * 2;
      const jump = (t + k * 0.3) % 4 < 0.5 ? Math.sin((((t + k * 0.3) % 4) / 0.5) * Math.PI) * 0.8 : 0;
      const y = 1.3 + Math.abs(Math.sin(t * 9)) * 0.05 + jump;
      for (let j = 0; j < 10; j++) p.at.set([x + (j % 3) * 0.1 - 0.1, y - j * 0.1, z, 0, 0, 0, 1], j * 7);
      w.moveProxies(p.pid, p.at, DT);
      w.moveDangle(p.bagId, anchorAt(x, y, z), DT);
      w.moveDangle(p.tailId, anchorAt(x, y + 0.3, z), DT);
    }
    w.step(DT);
    if (i === 600) heap0 = w.counts().heap;
    if (i % 600 === 599)
      for (const p of people) {
        assert.ok(w.dangleParts(p.bagId, out));
        for (const v of out) assert.ok(Number.isFinite(v), "a NaN in a bag");
        assert.ok(w.dangleParts(p.tailId, out));
        for (const v of out) assert.ok(Number.isFinite(v), "a NaN in a tail");
      }
  }
  assert.equal(w.counts().bodies, bodies0);
  assert.equal(w.counts().heap, heap0, `Jolt's heap grew by ${w.counts().heap - heap0} bytes`);
});

test("a dangle swings back no further than `back`, forward as far as its cone (a badge on the chest)", async () => {
  const w = await world();
  // (across: the person's left, +x — so forward is +z, back −z; the anchor sped up steadily one way,
  // the bag hangs back the other, to atan(a / g) or its limit)
  const lean = (a: number) => {
    const id = w.addDangle(anchorAt(0, 2, 0), [
      { ...bag(2), across: [1, 0, 0], cone: 0.8, back: 0.05, coneAcross: 0.8, friction: 0.05 },
    ]);
    assert.ok(id);
    let z = 0;
    let vz = 0;
    for (let i = 0; i < 90; i++) {
      vz += a * DT;
      z += vz * DT;
      w.moveDangle(id, anchorAt(0, 2, z), DT);
      w.step(DT);
    }
    w.dangleParts(id, out);
    w.removeDangle(id);
    return Math.atan2(out[2] - z, 2 - out[1]);
  };
  // (sped up backward, it swings forward: atan(6 / 9.81) ≈ 0.55; forward, back — held at 0.05)
  const fwd = lean(-6);
  const back = lean(6);
  assert.ok(fwd > 0.4, `forward it hardly swung (${fwd.toFixed(2)})`);
  assert.ok(back > -0.1, `back it swung ${back.toFixed(2)} rad, past its 0.05`);
});

test("a dangle with a rest spring comes back to how it hung at first, not straight down", async () => {
  const w = await world();
  // (hung out at 34° — a tie lying on a sloped shirt — with gravity it'd fall plumb under the anchor)
  const hang = (rest?: number) => {
    const id = w.addDangle(anchorAt(0, 2, 0), [{ ...bag(2, 0.4), friction: 0, rest, mass: 0.1 }]);
    assert.ok(id);
    for (let i = 0; i < 180; i++) {
      w.moveDangle(id, anchorAt(0, 2, 0), DT);
      w.step(DT);
    }
    w.dangleParts(id, out);
    w.removeDangle(id);
    return out[0];
  };
  assert.ok(hang(8) > 0.3, "the rest spring didn't hold it out");
  assert.ok(Math.abs(hang()) < 0.1, "without one it didn't hang plumb");
});
