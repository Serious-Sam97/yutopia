import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CarState,
  type CarWorld,
  type Controls,
  createCar,
  flatWorld,
  type Ground,
  groundsWorld,
  HELPS,
  type Helps,
  NO_HELPS,
  OFFROAD,
  readout,
  SEDAN,
  type Solid,
  STEP,
  setEngine,
  settle,
  stepCar,
} from "./car/index.ts";
import { treesIn } from "./grounds.ts";

// The car's physics against the numbers of docs/plan/28-the-car.md (phase 1).

const NONE: Controls = { up: 0, down: 0, steer: 0, hand: 0, digital: true };
const warm = (s: CarState) => {
  setEngine(s, true);
  s.temp = 0.55;
  return s;
};
/** A sedan rolling at `kmh` in 2nd on flat `g`. */
function rolling(_g: Ground, kmh: number, spec = SEDAN) {
  const s = warm(createCar(spec, 0, 0, 0, 0));
  const v = kmh / 3.6;
  s.v.x = v;
  for (const w of s.wheels) w.w = v / spec.wheel.r;
  s.gear = 2;
  s.rpm = 3000;
  return s;
}
function run(s: CarState, w: CarWorld, seconds: number, c: (s: CarState, t: number) => Controls, helps: Helps = HELPS) {
  for (let t = 0; t < seconds; t += STEP) stepCar(s, c(s, t), w, helps);
}
function brakingDistance(g: Ground, helps: Helps = HELPS) {
  const s = rolling(g, 50);
  const w = flatWorld(g);
  const x0 = s.p.x;
  for (let t = 0; readout(s).kmh > 0.5 && t < 40; t += STEP) stepCar(s, { ...NONE, down: 1 }, w, helps);
  return s.p.x - x0;
}
/** The most sideways g a steady turn at 40 km/h reaches on `g` (the steering swept). */
function cornering(g: Ground) {
  let best = 0;
  for (let st = 0.1; st <= 1.001; st += 0.1) {
    const s = rolling(g, 40);
    const w = flatWorld(g);
    let prev = Math.atan2(s.v.z, s.v.x);
    let sum = 0;
    let n = 0;
    for (let t = 0; t < 8; t += STEP) {
      stepCar(
        s,
        { up: Math.max(0, Math.min(1, (40 - readout(s).kmh) * 0.15)), down: 0, steer: st, hand: 0, digital: false },
        w,
      );
      const c = Math.atan2(s.v.z, s.v.x);
      let d = c - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      prev = c;
      if (t > 6) {
        sum += (Math.abs(d / STEP) * Math.hypot(s.v.x, s.v.z)) / 9.81;
        n++;
      }
    }
    best = Math.max(best, sum / n);
  }
  return best;
}

test("at rest it settles on its springs, 52/48, and stays put", () => {
  const s = createCar(SEDAN, 0, 0, 0, 0);
  run(s, flatWorld("asphalt"), 10, () => NONE);
  const front = s.wheels[0].load + s.wheels[1].load;
  const rear = s.wheels[2].load + s.wheels[3].load;
  assert.ok(Math.abs(front / (front + rear) - 0.52) < 0.01, `front share ${front / (front + rear)}`);
  assert.ok(Math.hypot(s.v.x, s.v.y, s.v.z) < 0.001);
  assert.ok(Math.abs(s.p.y - SEDAN.cog) < 0.01);
});

test("0–100 km/h and its top speed on asphalt", () => {
  const s = warm(createCar(SEDAN, 0, 0, 0, 0));
  const w = flatWorld("asphalt");
  let t100 = 0;
  for (let t = 0; t < 60; t += STEP) {
    stepCar(s, { ...NONE, up: 1 }, w);
    if (!t100 && readout(s).kmh >= 100) t100 = t;
  }
  assert.ok(t100 > 10 && t100 < 13, `0–100 in ${t100.toFixed(1)} s`);
  const top = readout(s).kmh;
  assert.ok(top > 160 && top < 180, `top ${top.toFixed(0)} km/h`);
});

test("braking from 50 km/h: each surface its own distance", () => {
  const d = (g: Ground) => brakingDistance(g);
  const asphalt = d("asphalt");
  const path = d("path");
  const snow = d("snow");
  const ice = d("ice");
  assert.ok(asphalt > 12 && asphalt < 18, `asphalt ${asphalt.toFixed(1)}`);
  assert.ok(path > 20 && path < 32, `packed snow ${path.toFixed(1)}`);
  assert.ok(snow > 20 && snow < 38, `snow ${snow.toFixed(1)}`);
  assert.ok(ice > 80 && ice < 130, `ice ${ice.toFixed(1)}`);
});

test("cornering grip: asphalt, packed snow, ice", () => {
  const a = cornering("asphalt");
  const p = cornering("path");
  const i = cornering("ice");
  assert.ok(a > 0.7 && a < 0.9, `asphalt ${a.toFixed(2)} g`);
  assert.ok(p > 0.28 && p < 0.45, `packed snow ${p.toFixed(2)} g`);
  assert.ok(i > 0.06 && i < 0.13, `ice ${i.toFixed(2)} g`);
});

test("the handbrake holds it on a 15 % slope for a minute", () => {
  for (const a of [Math.PI / 2, -Math.PI / 2, 0]) {
    const w = flatWorld("asphalt", 0.15);
    const s = warm(createCar(SEDAN, 0, 0, 0, a));
    settle(s, w);
    run(s, w, 60, () => ({ ...NONE, hand: 1 }));
    assert.ok(Math.hypot(s.p.x, s.p.z) < 0.05, `crept ${Math.hypot(s.p.x, s.p.z).toFixed(3)} m`);
  }
});

test("deep snow: floored without traction control it digs in; with it, it crawls on", () => {
  const go = (helps: Helps) => {
    const w = flatWorld("deep");
    const s = warm(createCar(SEDAN, 0, 0, 0, 0));
    run(s, w, 2, () => NONE);
    run(s, w, 15, () => ({ ...NONE, up: 1 }), helps);
    return readout(s).kmh;
  };
  assert.ok(go({ ...HELPS, tcs: false }) < 3, "dug in");
  assert.ok(go(HELPS) > 4, "crawls");
});

test("a handbrake turn swings it round; the helpers hold a drift", () => {
  const s = rolling("path", 40);
  const w = flatWorld("path");
  run(s, w, 1.5, (_s, t) => ({ ...NONE, steer: 1, hand: t < 1 ? 1 : 0 }));
  const f = 1 - 2 * (s.q.y ** 2 + s.q.z ** 2);
  const fz = 2 * (s.q.x * s.q.z - s.q.w * s.q.y);
  assert.ok(Math.abs(Math.atan2(fz, f)) > 0.7, "it turned");
  const d = rolling("path", 40);
  let most = 0;
  run(d, w, 8, (c) => {
    most = Math.max(most, Math.abs(readout(c).beta));
    return { ...NONE, up: 1, steer: 1 };
  });
  assert.ok(most > 0.15 && most < 1.0, `slid ${most.toFixed(2)} rad, no spin`);
});

test("into a wall: it stops there, it doesn't go through", () => {
  const s = rolling("asphalt", 30);
  const w: CarWorld = {
    ...flatWorld("asphalt"),
    solids: (_x, _z, _r, out) => out.push({ kind: "box", x: 20, z: 0, hx: 1, hz: 30, what: "wall" }),
  };
  let hit = 0;
  run(s, w, 4, (c) => {
    if (c.hit) hit = Math.max(hit, c.hit.j);
    return NONE;
  });
  assert.ok(s.p.x + SEDAN.body.ahead < 19.05, `nose at ${(s.p.x + SEDAN.body.ahead).toFixed(2)}`);
  assert.ok(hit > 3000, "a real knock");
});

test("S held at a stop puts it in reverse; W brings it back", () => {
  const s = warm(createCar(SEDAN, 0, 0, 0, 0));
  const w = flatWorld("asphalt");
  run(s, w, 3, () => ({ ...NONE, down: 1 }));
  assert.equal(s.gear, -1);
  assert.ok(readout(s).kmh < -5);
  run(s, w, 6, () => ({ ...NONE, up: 1 }));
  assert.ok(s.gear >= 1 && readout(s).kmh > 5);
});

test("the same inputs give the same car, bit for bit", () => {
  const go = () => {
    const w = flatWorld("snow");
    const s = warm(createCar(SEDAN, 0, 0, 0, 0.3));
    for (let i = 0; i < 2400; i++)
      stepCar(
        s,
        { up: (i % 300) / 300, down: 0, steer: Math.sin(i / 90), hand: i % 700 < 50 ? 1 : 0, digital: true },
        w,
      );
    return [s.p.x, s.p.y, s.p.z, s.q.x, s.q.y, s.q.z, s.q.w, s.rpm];
  };
  const a = go();
  const b = go();
  assert.deepEqual(a, b);
});

test("the 4x4 goes where the sedan bogs down", () => {
  const go = (spec = SEDAN) => {
    const w = flatWorld("deep");
    const s = warm(createCar(spec, 0, 0, 0, 0));
    run(s, w, 2, () => NONE);
    run(s, w, 15, () => ({ ...NONE, up: 1 }), { ...NO_HELPS, auto: true });
    return s.p.x;
  };
  assert.ok(go(OFFROAD) > go(SEDAN) * 3 + 20, "much further");
});

test("a tree is its trunk: nothing else of it stops a car (the tile people walk round isn't a wall)", () => {
  const w = groundsWorld();
  let checked = 0;
  for (let cx = 0; cx < 8 && checked < 40; cx++)
    for (const t of treesIn(cx, -8)) {
      const out: Solid[] = [];
      w.solids(t.x, t.z, 1.2, out);
      // all round the trunk, a hand's breadth off its bark: inside no box (the old tile was one)
      const r = out.find((o) => o.kind === "circle" && o.x === t.x && o.z === t.z)?.r ?? 0;
      assert.ok(r > 0.1 && r < 0.5, `its trunk: ${r}`);
      for (let k = 0; k < 8; k++) {
        const px = t.x + Math.cos((k * Math.PI) / 4) * (r + 0.15);
        const pz = t.z + Math.sin((k * Math.PI) / 4) * (r + 0.15);
        const box = out.find(
          (o) => o.kind === "box" && Math.abs(px - o.x) < (o.hx ?? 0) && Math.abs(pz - o.z) < (o.hz ?? 0),
        );
        assert.ok(!box, `beside the tree at ${t.x.toFixed(1)}, ${t.z.toFixed(1)}: a ${box?.what}`);
      }
      checked++;
    }
  assert.ok(checked > 10, `trees checked: ${checked}`);
});

test("off the road: the sedan gets on through the woods' deep snow, the 4x4 more so (and it shifts up)", () => {
  const go = (spec: typeof SEDAN, g: Ground) => {
    const w = flatWorld(g);
    const s = warm(createCar(spec, 0, 0, 0, 0));
    settle(s, w);
    run(s, w, 20, () => ({ ...NONE, up: 1 }));
    return s;
  };
  const sedanDeep = readout(go(SEDAN, "deep")).kmh;
  const sedanSnow = readout(go(SEDAN, "snow")).kmh;
  const off = go(OFFROAD, "deep");
  assert.ok(sedanDeep > 35 && sedanDeep < 60, `sedan, deep snow: ${sedanDeep.toFixed(0)} km/h in 20 s`);
  assert.ok(sedanSnow > 65, `sedan, snow: ${sedanSnow.toFixed(0)} km/h in 20 s`);
  assert.ok(readout(off).kmh > sedanDeep + 15, `4x4, deep snow: ${readout(off).kmh.toFixed(0)} km/h`);
  assert.ok(off.gear >= 2, `the 4x4 out of first (${off.gear})`);
});

/** The sedan at 30 km/h into a free car of the same weight across its path (a box that moves when hit). */
function knock(dz: number) {
  const s = rolling("asphalt", 30);
  const body = { x: 8, z: dz, vx: 0, vz: 0, w: 0, j: 0 };
  const w: CarWorld = {
    ...flatWorld("asphalt"),
    solids: (_x, _z, _r, out) => {
      body.x += body.vx * STEP;
      body.z += body.vz * STEP;
      out.push({
        kind: "box",
        x: body.x,
        z: body.z,
        hx: 0.95,
        hz: 2.45,
        what: "car",
        m: SEDAN.mass,
        vx: body.vx,
        vz: body.vz,
        wy: body.w,
        shove: (jx, jz) => {
          body.vx += jx / SEDAN.mass;
          body.vz += jz / SEDAN.mass;
          body.j += Math.hypot(jx, jz);
        },
      });
    },
  };
  let yaw = 0;
  run(s, w, 1.5, (c) => {
    yaw = Math.max(yaw, Math.abs(c.w.y));
    return NONE;
  });
  return { s, body, yaw };
}

test("into another car: the knock shared by weight — square on, no spin; on its corner, a turn", () => {
  const v0 = 30 / 3.6;
  const square = knock(0);
  // (equal weights, a little bounce: the struck car leaves faster than the striker)
  assert.ok(square.body.vx > v0 * 0.45 && square.body.vx < v0 * 0.75, `struck car ${square.body.vx.toFixed(2)} m/s`);
  assert.ok(square.s.v.x > 0 && square.s.v.x < v0 * 0.5, `striker ${square.s.v.x.toFixed(2)} m/s`);
  assert.ok(square.yaw < 0.1, `square on: yaw ${square.yaw.toFixed(2)} rad/s`);
  const corner = knock(2.6);
  assert.ok(corner.yaw > 0.2, `on its corner: yaw ${corner.yaw.toFixed(2)} rad/s`);
});
