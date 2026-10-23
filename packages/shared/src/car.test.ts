import assert from "node:assert/strict";
import { test } from "node:test";
import { campusLot } from "./building.ts";
import {
  bayFor,
  bladeCells,
  boxHits,
  type CarState,
  type CarWire,
  type CarWorld,
  type Controls,
  coverAfter,
  createCar,
  flatWorld,
  freeSpot,
  type Ground,
  groundsWorld,
  HELPS,
  type Helps,
  HOME_CARS,
  headingQuat,
  implausible,
  NO_HELPS,
  OFFROAD,
  PICKUP,
  PLOUGHED_MS,
  PLOUGHTRUCK,
  ploughCell,
  readout,
  SEATS_OF,
  SEDAN,
  SNOWCAT,
  SNOWMOBILE,
  type Solid,
  SPECS,
  STEP,
  setEngine,
  settle,
  stepCar,
  TOBOGGAN,
  TRACTOR,
} from "./car/index.ts";
import { atPump, heightAt, PUMPS, treesIn, walkableTile } from "./grounds.ts";

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

test("over the river's bridge at 50 km/h: no lip to hit, it keeps its speed and its wheels down", async () => {
  const { heightAt, WAYS } = await import("./grounds.ts");
  const road = WAYS.find((u) => u.key === "road");
  assert.ok(road);
  const idx = road.line.map((_, i) => i).filter((i) => road.bridged[i]);
  const [x0, z0] = road.line[idx[0] - 14];
  const [x1] = road.line[idx[idx.length - 1] + 8];
  const w = groundsWorld();
  const s = warm(createCar(SEDAN, x0, heightAt(x0, z0) + 0.4, z0 + 2.2, 0));
  settle(s, w);
  const v = 50 / 3.6;
  s.v.x = v;
  for (const wh of s.wheels) wh.w = v / SEDAN.wheel.r;
  s.gear = 3;
  s.rpm = 3000;
  let slowest = Number.POSITIVE_INFINITY;
  let tilt = 0;
  for (let t = 0; s.p.x < x1 && t < 20; t += STEP) {
    // (holding 50 on the throttle, steering back to its lane)
    const kmh = readout(s).kmh;
    const steer = Math.max(-0.3, Math.min(0.3, (s.p.z - (z0 + 2.2)) * 0.15));
    stepCar(s, { ...NONE, up: kmh < 50 ? 0.6 : 0, steer }, w);
    slowest = Math.min(slowest, kmh);
    const up = 1 - 2 * (s.q.x * s.q.x + s.q.z * s.q.z);
    tilt = Math.max(tilt, Math.acos(Math.max(-1, Math.min(1, up))));
  }
  assert.ok(s.p.x >= x1, `across: ${s.p.x.toFixed(1)} of ${x1.toFixed(1)}`);
  assert.ok(slowest > 40, `it keeps its speed: down to ${slowest.toFixed(0)} km/h`);
  assert.ok(tilt < 0.25, `its wheels down: tipped ${tilt.toFixed(2)} rad`);
});

test("dry, the engine coughs out and won't start again; a person hit is told who and how fast", () => {
  const s = rolling("asphalt", 40);
  s.fuel = 0.02;
  run(s, flatWorld("asphalt"), 30, () => ({ ...NONE, up: 1 }));
  assert.equal(s.fuel, 0);
  assert.equal(s.rpm, 0, "out");
  setEngine(s, true);
  assert.equal(s.rpm, 0, "no starting it dry");
  s.fuel = 10;
  setEngine(s, true);
  assert.ok(s.rpm > 500, "filled: it starts");
  // someone in the road
  const p = rolling("asphalt", 25);
  const w: CarWorld = {
    ...flatWorld("asphalt"),
    solids: (_x, _z, _r, out) =>
      out.push({ kind: "circle", x: 12, z: 0, r: 0.38, soft: true, what: "person", id: "sid-7" }),
  };
  let hit: CarState["hit"] = null;
  run(p, w, 3, (c) => {
    if (c.hit?.what === "person" && !hit) hit = { ...c.hit };
    return NONE;
  });
  const h = hit as CarState["hit"];
  assert.equal(h?.id, "sid-7");
  assert.ok((h?.v ?? 0) > 5, `met at ${h?.v}`);
});

test("left in a bay of the lot, nosed or backed in and roughly square: that bay; else none", () => {
  const { bays } = campusLot(36);
  const b = bays[5];
  const nose = b.dir > 0 ? Math.PI : 0;
  assert.deepEqual(bayFor(bays, b.x + 0.8, b.z - 0.4, nose + 0.2), { i: 5, a: nose });
  assert.deepEqual(bayFor(bays, b.x - 0.5, b.z + 0.3, nose + Math.PI - 0.15), { i: 5, a: nose + Math.PI });
  assert.equal(bayFor(bays, b.x, b.z, nose + 0.8), null, "across it");
  assert.equal(bayFor(bays, b.x, b.z + 1.4, nose), null, "between two");
  assert.equal(bayFor(bays, b.x + 4, b.z, nose), null, "out in the aisle");
});

test("the gas station's pumps: beside an island is at one, on it or away isn't", () => {
  assert.equal(PUMPS.length, 2);
  for (const p of PUMPS) {
    assert.ok(atPump(p.x + 1.8, p.z + 1) && atPump(p.x - 1.8, p.z - 1));
    assert.ok(atPump(p.x + 4, p.z + 2), "the middle lane, between the islands");
    assert.ok(!atPump(p.x, p.z), "on the island");
    assert.ok(!atPump(p.x + 1.8, p.z + 6), "past it");
  }
});

test("into a wall at 90 km/h: it crumples and stops there — it isn't thrown back across the road", () => {
  const s = rolling("snow", 90);
  const w: CarWorld = {
    ...flatWorld("snow"),
    solids: (_x, _z, _r, out) => out.push({ kind: "box", x: 25, z: 0, hx: 1, hz: 60, what: "wall" }),
  };
  let back = 0;
  let after = -1;
  run(s, w, 6, (c, t) => {
    if (c.hit && after < 0) after = t;
    if (after >= 0) back = Math.max(back, -readout(c).kmh / 3.6);
    return { ...NONE, up: t < 3 ? 1 : 0 };
  });
  assert.ok(after > 0, "it hit");
  assert.ok(back < 2, `thrown back at ${back.toFixed(1)} m/s`);
  assert.ok(s.p.x > 18, `it stayed by the wall: x ${s.p.x.toFixed(1)}`);
});

test("into trees at speed: a knock turns it, never sets it spinning like a top; a trunk is never let inside it", () => {
  // a stand of trunks, a few metres apart
  const trunks: Solid[] = [];
  for (let i = 0; i < 60; i++)
    trunks.push({
      kind: "circle",
      x: 15 + (i % 10) * 2.6 + ((i * 7) % 3) * 0.4,
      z: -6 + Math.floor(i / 10) * 2.4 + ((i * 5) % 3) * 0.5,
      r: 0.3,
      what: "tree",
    });
  const w: CarWorld = { ...flatWorld("snow"), solids: (_x, _z, _r, out) => out.push(...trunks) };
  for (const [kmh, a, steer] of [
    [90, 0.1, 0],
    [110, -0.2, 0.8],
    [70, 0.35, -1],
  ]) {
    const s = rolling("snow", kmh);
    const q = headingQuat(a);
    s.q = { x: q.x, y: q.y, z: q.z, w: q.w };
    s.v.x = Math.cos(a) * (kmh / 3.6);
    s.v.z = Math.sin(a) * (kmh / 3.6);
    let spin = 0;
    let inside = 0;
    const b = SEDAN.body;
    run(s, w, 8, (c) => {
      spin = Math.max(spin, Math.abs(c.w.y));
      const h = Math.atan2(2 * (c.q.x * c.q.z - c.q.w * c.q.y), 1 - 2 * (c.q.y * c.q.y + c.q.z * c.q.z));
      const off = (b.ahead - b.behind) / 2;
      for (const o of trunks)
        if (
          boxHits(
            c.p.x + Math.cos(h) * off,
            c.p.z + Math.sin(h) * off,
            (b.ahead + b.behind) / 2 - 0.3,
            b.width / 2 - 0.3,
            h,
            { ...o, r: 0 },
          )
        )
          inside++;
      return { ...NONE, up: 1, steer, digital: false };
    });
    assert.ok(spin <= 3.0001, `${kmh} km/h: spinning at ${spin.toFixed(2)} rad/s`);
    assert.equal(inside, 0, `${kmh} km/h: a trunk inside it`);
  }
});

test("dug into deep snow, floored without traction control: backed out with the helps on", () => {
  const w = flatWorld("deep");
  const s = warm(createCar(SEDAN, 0, 0, 0, 0));
  run(s, w, 2, () => NONE);
  run(s, w, 12, () => ({ ...NONE, up: 1 }), { ...HELPS, tcs: false });
  assert.ok(readout(s).kmh < 3, "dug in");
  const x0 = s.p.x;
  run(s, w, 10, () => ({ ...NONE, down: 1 }));
  assert.ok(x0 - s.p.x > 3, `backed out ${(x0 - s.p.x).toFixed(1)} m`);
});

test("pulled out: the nearest spot it fits clear of everything, on firm ground before deep snow", () => {
  // deep snow; a path along z = 20; trunks all round the car
  const trunks: Solid[] = [];
  for (let x = -8; x <= 8; x += 2.2)
    for (let z = -6; z <= 6; z += 2.2)
      if (Math.hypot(x, z) > 1.5) trunks.push({ kind: "circle", x, z, r: 0.3, what: "tree" });
  const w: CarWorld = {
    ...flatWorld("deep"),
    ground: (_x, z) => (Math.abs(z - 20) < 3 ? "path" : "deep"),
    solids: (x, z, r, out) => {
      for (const t of trunks) if (Math.abs(t.x - x) < r + 1 && Math.abs(t.z - z) < r + 1) out.push(t);
    },
  };
  const spot = freeSpot(w, SEDAN, 0, 0, 0);
  assert.ok(spot, "somewhere");
  const p = spot as { x: number; z: number; a: number };
  assert.ok(Math.abs(p.z - 20) < 3, `on the path: ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
  const b = SEDAN.body;
  const off = (b.ahead - b.behind) / 2;
  assert.ok(!trunks.some((t) => boxHits(p.x + Math.cos(p.a) * off, p.z + Math.sin(p.a) * off, 2.45, 0.93, p.a, t)));
});

test("the server believes a crash (stopped dead in one packet), not a car flung faster", () => {
  const q = headingQuat(0);
  const at = (vx: number, x = 0): CarWire => ({
    seq: 1,
    x,
    y: 0.5,
    z: 0,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx,
    vy: 0,
    vz: 0,
    wy: 0,
    steer: 0,
    rpm: 2000,
    gear: 3,
    fl: 0,
    slip: 0,
    fuel: 30,
  });
  const ground = () => 0;
  assert.equal(implausible(at(25), at(-1.2, 1.2), 0.05, ground), null, "a crash");
  assert.equal(implausible(at(25), at(0, 1.2), 0.05, ground), null, "stopped dead");
  assert.equal(implausible(at(5), at(28, 0.3), 0.05, ground), "accelerated");
});

test("the gas station: driven in off Main Street to beside either pump, either side; walked round its islands", () => {
  const w = groundsWorld();
  for (const x of [311, 315, 319, 323]) {
    const s = createCar(SEDAN, x, heightAt(x, -406), -406, Math.PI / 2);
    settle(s, w);
    warm(s);
    let hit = "";
    run(s, w, 12, (c) => {
      if (c.hit && !hit) hit = `${c.hit.what} at ${c.hit.x.toFixed(1)}, ${c.hit.z.toFixed(1)}`;
      const left = -389 - c.p.z;
      return {
        ...NONE,
        up: left > 3 ? 0.35 : 0,
        down: left <= 3 && readout(c).kmh > 0.5 ? 1 : 0,
        hand: left <= 3 ? 1 : 0,
      };
    });
    assert.equal(hit, "", `from x ${x}: hit`);
    assert.ok(atPump(s.p.x, s.p.z), `from x ${x}: at a pump (${s.p.x.toFixed(1)}, ${s.p.z.toFixed(1)})`);
  }
  assert.ok(
    walkableTile(314, -389) && !walkableTile(313, -389) && !walkableTile(312, -380),
    "round the islands, not into the kiosk",
  );
});

test("the cars that live away from the lot: each home clear of everything, level, on ground it can drive off", () => {
  const w = groundsWorld();
  assert.ok(HOME_CARS.length >= 20, `${HOME_CARS.length} homes`);
  assert.equal(HOME_CARS.filter((h) => h.role === "police").length, 1, "one police car");
  assert.equal(HOME_CARS.filter((h) => h.role === "taxi").length, 2, "two taxis");
  assert.ok(
    HOME_CARS.some((h) => h.model === "pickup"),
    "the farm's pickup",
  );
  const ids = new Set(HOME_CARS.map((h) => h.id));
  assert.equal(ids.size, HOME_CARS.length, "every id its own");
  for (const h of HOME_CARS) {
    const b = SPECS[h.model].body;
    const off = (b.ahead - b.behind) / 2;
    const cx = h.x + Math.cos(h.a) * off;
    const cz = h.z + Math.sin(h.a) * off;
    const near: Solid[] = [];
    w.solids(cx, cz, 5, near);
    const hit = near.find((o) => boxHits(cx, cz, (b.ahead + b.behind) / 2 + 0.1, b.width / 2 + 0.1, h.a, o));
    assert.ok(!hit, `${h.id}: into a ${hit?.what} at ${hit?.x.toFixed(0)}, ${hit?.z.toFixed(0)}`);
    const ys = [-2, 2].flatMap((u) =>
      [-0.8, 0.8].map((v) =>
        heightAt(cx + Math.cos(h.a) * u - Math.sin(h.a) * v, cz + Math.sin(h.a) * u + Math.cos(h.a) * v),
      ),
    );
    assert.ok(Math.max(...ys) - Math.min(...ys) < 0.5, `${h.id}: level`);
  }
  // …and clear of each other (a box each, a little room round it)
  const box = (h: (typeof HOME_CARS)[number]): Solid => {
    const b = SPECS[h.model].body;
    const off = (b.ahead - b.behind) / 2;
    return {
      kind: "box",
      x: h.x + Math.cos(h.a) * off,
      z: h.z + Math.sin(h.a) * off,
      hx: (b.ahead + b.behind) / 2 + 0.2,
      hz: b.width / 2 + 0.2,
      a: h.a,
      what: h.id,
    } as Solid;
  };
  for (const a of HOME_CARS)
    for (const b of HOME_CARS) {
      if (a.id >= b.id || Math.hypot(a.x - b.x, a.z - b.z) > 12) continue;
      const o = box(b);
      const s = box(a);
      assert.ok(!boxHits(s.x, s.z, s.hx ?? 0, s.hz ?? 0, a.a, o), `${a.id} into ${b.id}`);
    }
});

test("the pickup: its V8 climbs through all four gears (never held on its limiter in first); its bed seats behind", () => {
  const s = warm(createCar(PICKUP, 0, 0, 0, 0));
  settle(s, flatWorld("asphalt"));
  let top = 0;
  run(s, flatWorld("asphalt"), 30, (c) => {
    top = Math.max(top, c.gear);
    return { ...NONE, up: 1 };
  });
  assert.ok(top >= 3 && readout(s).kmh > 130, `gear ${top}, ${readout(s).kmh.toFixed(0)} km/h in 30 s`);
  // its two behind the cab: in the bed, further back and higher than the sedan's rear seats
  const p = SEATS_OF.pickup;
  assert.ok(p.at[2][0] < SEATS_OF.sedan.at[2][0] && p.hip[2] > 0.9);
});

test("the snowmobile: at home on snow and deep snow, slow on a road; the snowcat climbs what nothing else can", () => {
  const top = (spec: typeof SEDAN, g: Ground, secs = 20) => {
    const w = flatWorld(g);
    const s = warm(createCar(spec, 0, 0, 0, 0));
    settle(s, w);
    run(s, w, secs, () => ({ ...NONE, up: 1 }));
    return readout(s).kmh;
  };
  const deep = top(SNOWMOBILE, "deep");
  assert.ok(deep > 100, `snowmobile, deep snow: ${deep.toFixed(0)} km/h`);
  assert.ok(deep > top(SEDAN, "deep") * 2, "far quicker than a car through deep snow");
  const road = top(SNOWMOBILE, "asphalt");
  assert.ok(road < 40, `snowmobile, asphalt: ${road.toFixed(0)} km/h (slow on the roads)`);
  const cat = top(SNOWCAT, "snow");
  assert.ok(cat > 25 && cat < 45, `snowcat, flat out: ${cat.toFixed(0)} km/h`);
  // up a 50 % slope of deep snow: only the snowcat gets anywhere
  const climb = (spec: typeof SEDAN) => {
    const w = flatWorld("deep", 0.5);
    const s = warm(createCar(spec, 0, 0, 0, -Math.PI / 2));
    settle(s, w);
    run(s, w, 15, () => ({ ...NONE, up: 1 }));
    return -s.p.z;
  };
  assert.ok(climb(SNOWCAT) > 10, `the snowcat climbed ${climb(SNOWCAT).toFixed(0)} m`);
  for (const spec of [SEDAN, OFFROAD, SNOWMOBILE]) assert.ok(climb(spec) < 5, `${spec.kind} up the 50 %`);
  // seats: one on the snowmobile, four in the snowcat
  assert.equal(SEATS_OF.snowmobile.at.length, 1);
  assert.equal(SEATS_OF.snowcat.at.length, 4);
});

test("the plough truck: heavy but quick on a road; the tractor slow and sure on snow, through its gears; two seats and one", () => {
  const top = (spec: typeof SEDAN, g: Ground, secs = 30) => {
    const w = flatWorld(g);
    const s = warm(createCar(spec, 0, 0, 0, 0));
    settle(s, w);
    let gear = 0;
    run(s, w, secs, (c) => {
      gear = Math.max(gear, c.gear);
      return { ...NONE, up: 1 };
    });
    return { kmh: readout(s).kmh, gear };
  };
  const truck = top(PLOUGHTRUCK, "asphalt", 40);
  assert.ok(truck.kmh > 75, `plough truck, asphalt: ${truck.kmh.toFixed(0)} km/h`);
  const tractor = top(TRACTOR, "snow");
  assert.ok(tractor.kmh > 22 && tractor.kmh < 45, `tractor, snow: ${tractor.kmh.toFixed(0)} km/h`);
  assert.ok(tractor.gear >= 2, `the tractor shifts up (gear ${tractor.gear})`);
  assert.equal(SEATS_OF.ploughtruck.at.length, 2);
  assert.equal(SEATS_OF.tractor.at.length, 1);
});

test("the toboggan: no engine — it runs down a hill on its own; on the flat, pushed at a walk; three on it", () => {
  const down = flatWorld("snow", 0.15);
  const s = warm(createCar(TOBOGGAN, 0, 0, 0, Math.PI / 2));
  settle(s, down);
  run(s, down, 12, () => NONE);
  assert.ok(readout(s).kmh > 15, `down a 15 % slope: ${readout(s).kmh.toFixed(0)} km/h`);
  const flat = flatWorld("snow");
  const p = warm(createCar(TOBOGGAN, 0, 0, 0, 0));
  const fuel = p.fuel;
  settle(p, flat);
  run(p, flat, 10, () => ({ ...NONE, up: 1 }));
  const kmh = readout(p).kmh;
  assert.ok(kmh > 3.5 && kmh < 7, `pushed on the flat: ${kmh.toFixed(1)} km/h (a walk)`);
  assert.equal(p.fuel, fuel, "nothing burnt");
  assert.equal(SEATS_OF.toboggan.at.length, 3);
});

test("a plough's blade: the road's fresh snow gone where it's been, so a car stops shorter there; back over ten minutes", () => {
  const stop = (w: CarWorld) => {
    const s = rolling("asphalt", 50);
    const x0 = s.p.x;
    for (let t = 0; readout(s).kmh > 0.5 && t < 40; t += STEP) stepCar(s, { ...NONE, down: 1 }, w, HELPS);
    return s.p.x - x0;
  };
  const snowed = stop({ ...flatWorld("asphalt"), cover: 0.8 });
  const cleared = stop({
    ...flatWorld("asphalt"),
    cover: 0.8,
    coverAt: (x, z) => coverAfter(0.8, ploughCell(x, z) ? 1000 : 0, 1000),
  });
  assert.ok(cleared < snowed * 0.9, `cleared ${cleared.toFixed(1)} m, snowed ${snowed.toFixed(1)} m`);
  assert.equal(coverAfter(0.8, undefined, 5), 0.8);
  assert.equal(coverAfter(0.8, 1, 1 + PLOUGHED_MS / 2), 0.4, "half back after five minutes");
  // the blade's cells: across it, ahead of the truck
  const cells = bladeCells(0, 0, 0, 3, 3);
  assert.ok(cells.includes(ploughCell(3, 0)) && cells.length <= 2, cells.join(" "));
});
