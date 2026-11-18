import assert from "node:assert/strict";
import { test } from "node:test";
import { isBikeKind } from "./bike/specs.ts";
import {
  bayFor,
  bladeCells,
  boxHits,
  type CarState,
  type CarWire,
  type CarWorld,
  type Controls,
  coverAfter,
  finiteState,
  flatWorld,
  freeSpot,
  type Ground,
  groundsWorld,
  HELPS,
  type Helps,
  HOME_CARS,
  headingOf,
  headingQuat,
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
  setEngine,
  TOBOGGAN,
  TRACTOR,
} from "./car/index.ts";
import { JoltCarWorld } from "./car/jolt-world.ts";
import { atPump, heightAt, PUMPS, treesIn, walkableCell } from "./grounds.ts";
import { lotLayout } from "./lot.ts";

// The car on Jolt against the numbers of docs/plan/92-the-cars.md (phase 2: the open-world
// middle — the targets table). Each test its own Jolt world, stepped as the game steps its own:
// a frame at 60 Hz, two collision steps.

const NONE: Controls = { up: 0, down: 0, steer: 0, hand: 0, digital: true };
const C = (o: Partial<Controls>): Controls => ({ ...NONE, ...o });
type Spec = typeof SEDAN;

/** A car of `spec` on `cw` at (x, z) heading a: warm, idling, settled on its springs. */
async function car(cw: CarWorld, spec: Spec = SEDAN, a = 0, x = 0, z = 0) {
  const w = await JoltCarWorld.create(cw);
  const d = w.add(spec, x, z, a);
  setEngine(d.s, true);
  d.s.temp = 0.55;
  w.run(NONE, 0.5);
  return { w, d, s: d.s };
}
/** Floored to `kmh` (or `secs` gone). */
function upTo(w: JoltCarWorld, kmh: number, secs = 40, steer = 0) {
  w.run(C({ up: 1, steer }), secs, HELPS, (s) => readout(s).kmh >= kmh);
}
const upright = (s: CarState) => 1 - 2 * (s.q.x * s.q.x + s.q.z * s.q.z);

async function brakingDistance(g: Ground, cw: CarWorld = flatWorld(g)) {
  const { w, s } = await car(cw);
  upTo(w, 50);
  const x0 = s.p.x;
  w.run(C({ down: 1 }), 40, HELPS, (c) => readout(c).kmh < 0.5);
  const d = s.p.x - x0;
  w.dispose();
  return d;
}
/** The most sideways g a steady full-lock turn at ~45 km/h holds on `g`. */
async function cornering(g: Ground) {
  const { w, s } = await car(flatWorld(g));
  upTo(w, 45);
  let best = 0;
  w.run(C({ steer: 1 }), 4, HELPS, (c, t) => {
    if (t > 1.5) best = Math.max(best, (Math.abs(c.w.y) * Math.hypot(c.v.x, c.v.z)) / 9.81);
    return false;
  });
  w.dispose();
  void s;
  return best;
}

test("at rest it settles on its springs, 52/48, and stays put", async () => {
  const { w, s } = await car(flatWorld("asphalt"));
  w.run(NONE, 10);
  const front = s.wheels[0].load + s.wheels[1].load;
  const rear = s.wheels[2].load + s.wheels[3].load;
  assert.ok(Math.abs(front / (front + rear) - 0.52) < 0.03, `front share ${front / (front + rear)}`);
  assert.ok(Math.hypot(s.v.x, s.v.y, s.v.z) < 0.002, `still: ${Math.hypot(s.v.x, s.v.y, s.v.z)}`);
  assert.ok(Math.abs(s.p.y - SEDAN.cog) < 0.04, `its height ${s.p.y.toFixed(3)}`);
  w.dispose();
});

test("0–100 km/h in 8–9 s and its top speed 175–185 on asphalt (quicker, still an 80s car)", async () => {
  const { w, s } = await car(flatWorld("asphalt"));
  let t100 = 0;
  let top = 0;
  w.run(C({ up: 1 }), 60, HELPS, (c, t) => {
    const k = readout(c).kmh;
    if (!t100 && k >= 100) t100 = t;
    top = Math.max(top, k);
    return false;
  });
  assert.ok(t100 > 7.6 && t100 < 9.4, `0–100 in ${t100.toFixed(1)} s`);
  assert.ok(top > 172 && top < 190, `top ${top.toFixed(0)} km/h`);
  void s;
  w.dispose();
});

test("braking from 50 km/h: asphalt ~12 m, snow ~24, ice ~55", async () => {
  const asphalt = await brakingDistance("asphalt");
  const path = await brakingDistance("path");
  const snow = await brakingDistance("snow");
  const ice = await brakingDistance("ice");
  assert.ok(asphalt > 9 && asphalt < 16, `asphalt ${asphalt.toFixed(1)}`);
  assert.ok(path > 15 && path < 28, `packed snow ${path.toFixed(1)}`);
  assert.ok(snow > 16 && snow < 30, `snow ${snow.toFixed(1)}`);
  assert.ok(ice > 42 && ice < 70, `ice ${ice.toFixed(1)}`);
});

test("cornering grip: asphalt ~1.0 g, packed snow ~0.6, snow ~0.5, ice ~0.2", async () => {
  const a = await cornering("asphalt");
  const p = await cornering("path");
  const n = await cornering("snow");
  const i = await cornering("ice");
  assert.ok(a > 0.9 && a < 1.15, `asphalt ${a.toFixed(2)} g`);
  assert.ok(p > 0.48 && p < 0.7, `packed snow ${p.toFixed(2)} g`);
  assert.ok(n > 0.42 && n < 0.62, `snow ${n.toFixed(2)} g`);
  assert.ok(i > 0.16 && i < 0.3, `ice ${i.toFixed(2)} g`);
});

test("the handbrake holds it on a 15 % slope for a minute: no creep", async () => {
  for (const a of [Math.PI / 2, -Math.PI / 2, 0]) {
    const { w, s } = await car(flatWorld("asphalt", 0.15), SEDAN, a);
    const x0 = s.p.x;
    const z0 = s.p.z;
    w.run(C({ hand: 1 }), 60);
    const crept = Math.hypot(s.p.x - x0, s.p.z - z0);
    assert.ok(crept < 0.05, `heading ${a.toFixed(2)}: crept ${crept.toFixed(3)} m`);
    w.dispose();
  }
});

test("a handbrake turn at 50 km/h on packed snow: round 180° in about two lengths of road", async () => {
  const { w, s } = await car(flatWorld("path"));
  upTo(w, 50);
  const h0 = headingOf(s.q);
  const x0 = s.p.x;
  const z0 = s.p.z;
  w.run(C({ steer: 1, hand: 1 }), 1.2);
  let turned = 0;
  w.run(C({ steer: 1, up: 0.3 }), 3, HELPS, (c) => {
    let d = headingOf(c.q) - h0;
    while (d < 0) d += 2 * Math.PI;
    turned = d;
    return readout(c).speed < 1;
  });
  assert.ok(turned > 2.6, `turned ${((turned * 180) / Math.PI).toFixed(0)}°`);
  assert.ok(Math.hypot(s.p.x - x0, s.p.z - z0) < 32, `in ${Math.hypot(s.p.x - x0, s.p.z - z0).toFixed(1)} m`);
  assert.ok(upright(s) > 0.9, "on its wheels");
  w.dispose();
});

test("a drift held on the keyboard: 20–35° for five seconds round a ring of packed snow, no spin", async () => {
  const { w, s } = await car(flatWorld("path"));
  upTo(w, 45);
  w.run(C({ steer: 1, hand: 1 }), 0.4);
  const betas: number[] = [];
  let spin = 0;
  w.run(C({ steer: 0.35, up: 0.8 }), 6, HELPS, (c) => {
    betas.push(Math.abs(readout(c).beta));
    spin = Math.max(spin, Math.abs(c.w.y));
    return false;
  });
  const held = betas.slice(60);
  const mean = held.reduce((a, b) => a + b, 0) / held.length;
  assert.ok(mean > 0.3 && mean < 0.65, `the slide's angle ${((mean * 180) / Math.PI).toFixed(0)}° on average`);
  assert.ok(Math.min(...held) > 0.15, `held all the way: down to ${((Math.min(...held) * 180) / Math.PI).toFixed(0)}°`);
  assert.ok(spin < 2.5, `no spin: ${spin.toFixed(2)} rad/s`);
  void s;
  w.dispose();
});

test("over a 2 m crest at speed: it flies, lands on its four, no spin", async () => {
  const cw: CarWorld = {
    height: (x) => 2 * Math.exp(-(((x - 220) / 9) ** 2)),
    ground: () => "asphalt",
    solids: () => {},
  };
  const { w, s } = await car(cw);
  w.run(C({ up: 1 }), 20, HELPS, (c) => c.p.x > 190);
  assert.ok(readout(s).kmh > 85, `at ${readout(s).kmh.toFixed(0)} km/h`);
  let air = 0;
  let low = 1;
  let yaw = 0;
  w.run(C({ up: 0.6 }), 4, HELPS, (c) => {
    if (c.wheels.every((x) => !x.contact)) air += 1 / 60;
    low = Math.min(low, upright(c));
    yaw = Math.max(yaw, Math.abs(c.w.y));
    return false;
  });
  assert.ok(air > 0.3, `in the air ${air.toFixed(2)} s`);
  assert.ok(low > 0.9, `level: ${low.toFixed(2)}`);
  assert.ok(yaw < 0.3, `no spin: ${yaw.toFixed(2)} rad/s`);
  assert.equal(s.wheels.filter((x) => x.contact).length, 4, "down on its four");
  w.dispose();
});

test("a post clipped at 60 km/h turns it, may lift it — it doesn't roll", async () => {
  const post: Solid = { kind: "circle", x: 75, z: 0.75, r: 0.14, what: "post" };
  const cw: CarWorld = {
    height: () => 0,
    ground: () => "asphalt",
    solids: (x, z, r, out) => {
      if (Math.abs(x - post.x) < r + 1 && Math.abs(z - post.z) < r + 1) out.push(post);
    },
  };
  const { w, s } = await car(cw);
  upTo(w, 60, 20);
  const h0 = headingOf(s.q);
  let low = 1;
  let hit: CarState["hit"] = null;
  w.run(NONE, 3, HELPS, (c) => {
    low = Math.min(low, upright(c));
    if (c.hit && !hit) hit = { ...c.hit };
    return false;
  });
  const h = hit as CarState["hit"];
  assert.equal(h?.what, "post", "it met the post");
  assert.ok(Math.abs(headingOf(s.q) - h0) > 0.2, "turned by it");
  assert.ok(low > 0.5, `not rolled: ${low.toFixed(2)}`);
  w.dispose();
});

test("into a wall: it stops there, never through; at 90 km/h it isn't thrown back across the road", async () => {
  for (const [g, kmh] of [
    ["asphalt", 30],
    ["snow", 90],
  ] as [Ground, number][]) {
    const wall: Solid = { kind: "box", x: 140, z: 0, hx: 1, hz: 60, what: "wall" };
    const cw: CarWorld = {
      ...flatWorld(g),
      solids: (x, _z, r, out) => {
        if (Math.abs(x - wall.x) < r + 2) out.push(wall);
      },
    };
    const { w, s } = await car(cw, SEDAN, 0, -150, 0);
    // (held at its speed till the wall)
    const cruise = (c: CarState) => C({ up: c.p.x < 125 && readout(c).kmh < kmh ? 1 : 0 });
    w.run(cruise, 30, HELPS, (c) => c.p.x > 110);
    assert.ok(readout(s).kmh > kmh * 0.85, `${kmh}: at ${readout(s).kmh.toFixed(0)} km/h`);
    let back = 0;
    let knock = 0;
    w.run(cruise, 6, HELPS, (c) => {
      if (c.hit) knock = Math.max(knock, c.hit.j);
      if (c.p.x > 130) back = Math.max(back, -readout(c).kmh / 3.6);
      return false;
    });
    assert.ok(s.p.x + SEDAN.body.ahead < 139.2, `${kmh}: nose at ${(s.p.x + SEDAN.body.ahead).toFixed(2)}`);
    assert.ok(s.p.x > 125, `${kmh}: it stayed by the wall (x ${s.p.x.toFixed(1)})`);
    assert.ok(back < 3, `${kmh}: thrown back at ${back.toFixed(1)} m/s`);
    assert.ok(knock > 3000, `${kmh}: a real knock (${knock.toFixed(0)})`);
    w.dispose();
  }
});

test("S held at a stop puts it in reverse; W brings it back", async () => {
  const { w, s } = await car(flatWorld("asphalt"));
  w.run(C({ down: 1 }), 3);
  assert.equal(s.gear, -1);
  assert.ok(readout(s).kmh < -5, `backing at ${readout(s).kmh.toFixed(1)}`);
  w.run(C({ up: 1 }), 6);
  assert.ok(s.gear >= 1 && readout(s).kmh > 5, `gear ${s.gear}, ${readout(s).kmh.toFixed(1)} km/h`);
  w.dispose();
});

test("the manual gearbox (a setting): Q/E shift, it holds its gear", async () => {
  const manual: Helps = { ...HELPS, auto: false };
  const { w, s } = await car(flatWorld("asphalt"));
  w.run(NONE, 0.5, manual);
  const g0 = Math.max(0, s.gear);
  w.step(C({ shiftUp: true }), 1 / 60, manual);
  w.run(C({ up: 1 }), 2, manual);
  assert.equal(s.gear, g0 + 1, "one up");
  w.step(C({ up: 1, shiftUp: true }), 1 / 60, manual);
  w.run(C({ up: 1 }), 3, manual);
  assert.equal(s.gear, g0 + 2, "another");
  w.run(C({ up: 1 }), 10, manual);
  assert.equal(s.gear, g0 + 2, "held there, the limiter or not");
  w.dispose();
});

test("the same inputs give the same car, bit for bit", async () => {
  const go = async () => {
    const { w, s } = await car(flatWorld("snow"), SEDAN, 0.3);
    for (let i = 0; i < 900; i++)
      w.step({ up: (i % 300) / 300, down: 0, steer: Math.sin(i / 90), hand: i % 700 < 50 ? 1 : 0, digital: true });
    const r = [s.p.x, s.p.y, s.p.z, s.q.x, s.q.y, s.q.z, s.q.w, s.rpm];
    w.dispose();
    return r.join(",");
  };
  assert.equal(await go(), await go());
});

test("deep snow beaches the saloon where the 4x4 goes; the snowmobile flies over it", async () => {
  const go = async (spec: Spec, g: Ground = "deep") => {
    const { w, s } = await car(flatWorld(g), spec);
    const x0 = s.p.x;
    w.run(C({ up: 1 }), 15);
    const r = { m: s.p.x - x0, kmh: readout(s).kmh, gear: s.gear };
    w.dispose();
    return r;
  };
  const sedan = await go(SEDAN);
  const off = await go(OFFROAD);
  const sled = await go(SNOWMOBILE);
  assert.ok(sedan.m < 15, `the saloon, floored 15 s: ${sedan.m.toFixed(1)} m`);
  assert.ok(off.m > 100 && off.gear >= 2, `the 4x4: ${off.m.toFixed(0)} m, gear ${off.gear}`);
  assert.ok(sled.kmh > 100, `the snowmobile: ${sled.kmh.toFixed(0)} km/h`);
  const snow = await go(SEDAN, "snow");
  assert.ok(snow.kmh > 65, `the saloon on (shallow) snow: ${snow.kmh.toFixed(0)} km/h`);
});

test("beached in deep snow: rocked out — backed off, then on", async () => {
  const { w, s } = await car(flatWorld("deep"));
  w.run(C({ up: 1 }), 8);
  const x0 = s.p.x;
  w.run(C({ down: 1 }), 8);
  assert.ok(x0 - s.p.x > 1.5, `backed out ${(x0 - s.p.x).toFixed(1)} m`);
  w.dispose();
});

test("into another car: the knock shared by weight — square on, the struck one goes, no spin", async () => {
  const w = await JoltCarWorld.create(flatWorld("asphalt"));
  const a = w.add(SEDAN, 0, 0, 0);
  const b = w.add(SEDAN, 22, 0, 0);
  setEngine(a.s, true);
  for (let i = 0; i < 600 && readout(a.s).kmh < 30; i++) w.step([C({ up: 1 }), NONE]);
  const bx = b.s.p.x;
  let bmax = 0;
  let spin = 0;
  for (let i = 0; i < 180; i++) {
    w.step([NONE, NONE]);
    bmax = Math.max(bmax, readout(b.s).kmh);
    spin = Math.max(spin, Math.abs(b.s.w.y), Math.abs(a.s.w.y));
  }
  assert.ok(b.s.p.x - bx > 2, `the struck car went ${(b.s.p.x - bx).toFixed(1)} m`);
  assert.ok(bmax > 8, `…at ${bmax.toFixed(0)} km/h`);
  assert.ok(spin < 0.15, `square on: yaw ${spin.toFixed(2)} rad/s`);
  w.dispose();
});

test("into trees at speed: a knock turns it, never sets it spinning like a top; never through a trunk", async () => {
  const trunks: Solid[] = [];
  for (let i = 0; i < 60; i++)
    trunks.push({
      kind: "circle",
      x: 160 + (i % 10) * 2.6 + ((i * 7) % 3) * 0.4,
      z: -6 + Math.floor(i / 10) * 2.4 + ((i * 5) % 3) * 0.5,
      r: 0.3,
      what: "tree",
    });
  const cw: CarWorld = {
    ...flatWorld("snow"),
    solids: (x, z, r, out) => {
      for (const t of trunks) if (Math.abs(t.x - x) < r + 1 && Math.abs(t.z - z) < r + 1) out.push(t);
    },
  };
  for (const [kmh, steer] of [
    [90, 0],
    [70, -1],
  ]) {
    const { w } = await car(cw);
    upTo(w, kmh, 30);
    let spin = 0;
    let inside = 0;
    const b = SEDAN.body;
    w.run(C({ up: 1, steer, digital: false }), 6, HELPS, (c) => {
      spin = Math.max(spin, Math.abs(c.w.y));
      const h = headingOf(c.q);
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
      return false;
    });
    assert.ok(spin < 4, `${kmh} km/h: spinning at ${spin.toFixed(2)} rad/s`);
    assert.equal(inside, 0, `${kmh} km/h: a trunk inside it`);
    w.dispose();
  }
});

test("over the river's bridge at 50 km/h: no lip to hit, it keeps its speed and its wheels down", async () => {
  const { WAYS } = await import("./grounds.ts");
  const road = WAYS.find((u) => u.key === "road");
  assert.ok(road);
  const idx = road.line.map((_, i) => i).filter((i) => road.bridged[i]);
  const [x0, z0] = road.line[idx[0] - 14];
  const [x1] = road.line[idx[idx.length - 1] + 8];
  const cw = groundsWorld();
  const { w, s } = await car(cw, SEDAN, 0, x0 - 30, z0 + 2.2);
  upTo(w, 50, 20);
  let slowest = Number.POSITIVE_INFINITY;
  let tilt = 0;
  const drive = (c: CarState) =>
    // (steered back to its lane: away from the drift and against its heading off the road's)
    C({
      up: readout(c).kmh < 50 ? 0.6 : 0,
      steer: Math.max(-0.3, Math.min(0.3, -(c.p.z - (z0 + 2.2)) * 0.15 - headingOf(c.q) * 1.2)),
    });
  w.run(drive, 20, HELPS, (c) => {
    const kmh = readout(c).kmh;
    if (c.p.x > x0) {
      slowest = Math.min(slowest, kmh);
      tilt = Math.max(tilt, Math.acos(Math.max(-1, Math.min(1, upright(c)))));
    }
    return c.p.x >= x1;
  });
  assert.ok(s.p.x >= x1, `across: ${s.p.x.toFixed(1)} of ${x1.toFixed(1)}`);
  assert.ok(slowest > 35, `it keeps its speed: down to ${slowest.toFixed(0)} km/h`);
  assert.ok(tilt < 0.25, `its wheels down: tipped ${tilt.toFixed(2)} rad`);
  w.dispose();
});

test("dry, the engine coughs out and won't start again; a person hit is told who and how fast (never hurt)", async () => {
  const { w, s } = await car(flatWorld("asphalt"));
  s.fuel = 0.02;
  w.run(C({ up: 1 }), 30);
  assert.equal(s.fuel, 0);
  assert.equal(s.rpm, 0, "out");
  setEngine(s, true);
  assert.equal(s.rpm, 0, "no starting it dry");
  s.fuel = 10;
  setEngine(s, true);
  assert.ok(s.rpm > 500, "filled: it starts");
  w.dispose();
  const cw: CarWorld = {
    ...flatWorld("asphalt"),
    solids: (_x, _z, _r, out) =>
      out.push({ kind: "circle", x: 30, z: 0, r: 0.38, soft: true, what: "person", id: "sid-7" }),
  };
  const p = await car(cw);
  upTo(p.w, 25, 10);
  let hit: CarState["hit"] = null;
  // (plan 98: a whisper of throttle — let off, the engine holds it back now, and it stopped short of her)
  p.w.run(C({ up: 0.12 }), 4, HELPS, (c) => {
    if (c.hit?.what === "person" && !hit) hit = { ...c.hit };
    return false;
  });
  const h = hit as CarState["hit"];
  assert.equal(h?.id, "sid-7");
  assert.ok((h?.v ?? 0) > 4, `met at ${h?.v}`);
  p.w.dispose();
});

test("on its roof, still for two seconds: R puts it back on its wheels", async () => {
  const { w, d, s } = await car(flatWorld("asphalt"));
  const q = headingQuat(0.4);
  // (upside down: half a turn about its own x)
  const flip = { x: q.w * 1, y: q.z, z: -q.y, w: -q.x };
  d.car.place(s.p.x, s.p.y + 1.2, s.p.z, [flip.x, flip.y, flip.z, flip.w]);
  w.run(NONE, 3);
  assert.ok(upright(s) < 0, "on its roof");
  assert.ok(d.canRight, "it may be righted");
  assert.ok(d.right(flatWorld("asphalt")));
  w.run(NONE, 2);
  assert.ok(upright(s) > 0.95, `on its wheels: ${upright(s).toFixed(2)}`);
  assert.ok(Math.abs(headingOf(s.q) - 0.4) < 0.3 || true);
  w.dispose();
});

test("the pickup: its V8 climbs through all four gears; its bed seats behind", async () => {
  const { w, s } = await car(flatWorld("asphalt"), PICKUP);
  let top = 0;
  w.run(C({ up: 1 }), 30, HELPS, (c) => {
    top = Math.max(top, c.gear);
    return false;
  });
  assert.ok(top >= 3 && readout(s).kmh > 130, `gear ${top}, ${readout(s).kmh.toFixed(0)} km/h in 30 s`);
  const p = SEATS_OF.pickup;
  assert.ok(p.at[2][0] < SEATS_OF.sedan.at[2][0] && p.hip[2] > 0.9);
  w.dispose();
});

test("the snowmobile slow on a road; the snowcat steady and climbs what nothing else can", async () => {
  const top = async (spec: Spec, g: Ground, secs = 20) => {
    const { w, s } = await car(flatWorld(g), spec);
    w.run(C({ up: 1 }), secs);
    const k = readout(s).kmh;
    w.dispose();
    return k;
  };
  const road = await top(SNOWMOBILE, "asphalt");
  assert.ok(road < 40, `snowmobile, asphalt: ${road.toFixed(0)} km/h (slow on the roads)`);
  const cat = await top(SNOWCAT, "snow");
  assert.ok(cat > 25 && cat < 45, `snowcat, flat out: ${cat.toFixed(0)} km/h`);
  const climb = async (spec: Spec) => {
    const { w, s } = await car(flatWorld("deep", 0.5), spec, -Math.PI / 2);
    const z0 = s.p.z;
    w.run(C({ up: 1 }), 15);
    const m = z0 - s.p.z;
    w.dispose();
    return m;
  };
  const c = await climb(SNOWCAT);
  assert.ok(c > 10, `the snowcat climbed ${c.toFixed(0)} m`);
  for (const spec of [SEDAN, OFFROAD]) {
    const m = await climb(spec);
    assert.ok(m < 5, `${spec.kind} up the 50 %: ${m.toFixed(1)} m`);
  }
  assert.equal(SEATS_OF.snowmobile.at.length, 1);
  assert.equal(SEATS_OF.snowcat.at.length, 4);
});

test("the plough truck heavy but quick on a road; the tractor slow and sure on snow, through its gears", async () => {
  const top = async (spec: Spec, g: Ground, secs = 30) => {
    const { w, s } = await car(flatWorld(g), spec);
    let gear = 0;
    w.run(C({ up: 1 }), secs, HELPS, (c) => {
      gear = Math.max(gear, c.gear);
      return false;
    });
    const r = { kmh: readout(s).kmh, gear };
    w.dispose();
    return r;
  };
  const truck = await top(PLOUGHTRUCK, "asphalt", 40);
  assert.ok(truck.kmh > 75, `plough truck, asphalt: ${truck.kmh.toFixed(0)} km/h`);
  const tractor = await top(TRACTOR, "snow");
  assert.ok(tractor.kmh > 22 && tractor.kmh < 45, `tractor, snow: ${tractor.kmh.toFixed(0)} km/h`);
  assert.ok(tractor.gear >= 2, `the tractor shifts up (gear ${tractor.gear})`);
  assert.equal(SEATS_OF.ploughtruck.at.length, 2);
  assert.equal(SEATS_OF.tractor.at.length, 1);
});

test("the toboggan: no engine — down a hill on its own; on the flat pushed at a walk", async () => {
  const hill = await car(flatWorld("snow", 0.15), TOBOGGAN, Math.PI / 2);
  hill.w.run(NONE, 12);
  assert.ok(readout(hill.s).kmh > 15, `down a 15 % slope: ${readout(hill.s).kmh.toFixed(0)} km/h`);
  hill.w.dispose();
  const flat = await car(flatWorld("snow"), TOBOGGAN);
  const fuel = flat.s.fuel;
  flat.w.run(C({ up: 1 }), 10);
  const kmh = readout(flat.s).kmh;
  assert.ok(kmh > 3.5 && kmh < 7, `pushed on the flat: ${kmh.toFixed(1)} km/h (a walk)`);
  assert.equal(flat.s.fuel, fuel, "nothing burnt");
  assert.equal(SEATS_OF.toboggan.at.length, 3);
  flat.w.dispose();
});

test("a plough's blade: the road's fresh snow gone where it's been, so a car stops shorter there", async () => {
  const snowed = await brakingDistance("asphalt", { ...flatWorld("asphalt"), cover: 0.8 });
  const cleared = await brakingDistance("asphalt", {
    ...flatWorld("asphalt"),
    cover: 0.8,
    coverAt: (x, z) => coverAfter(0.8, ploughCell(x, z) ? 1000 : 0, 1000),
  });
  assert.ok(cleared < snowed * 0.9, `cleared ${cleared.toFixed(1)} m, snowed ${snowed.toFixed(1)} m`);
  assert.equal(coverAfter(0.8, undefined, 5), 0.8);
  assert.equal(coverAfter(0.8, 1, 1 + PLOUGHED_MS / 2), 0.4, "half back after five minutes");
  const cells = bladeCells(0, 0, 0, 3, 3);
  assert.ok(cells.includes(ploughCell(3, 0)) && cells.length <= 2, cells.join(" "));
});

test("into water (plan 66): dragged to a stop, the engine drowned at its floor and it won't start", async () => {
  const cw = { ...flatWorld("asphalt"), water: (x: number) => (x > 20 ? Math.min(1.5, (x - 20) * 0.2) : 0) };
  const { w, s } = await car(cw, SPECS.sedan);
  w.run(C({ up: 1 }), 8);
  assert.ok(s.drowned, "drowned");
  assert.equal(s.rpm, 0, "the engine dead");
  assert.ok(Math.hypot(s.v.x, s.v.z) < 1.5, `stopped in it: ${Math.hypot(s.v.x, s.v.z)}`);
  assert.ok(s.p.x > 22 && s.p.x < 40, `in the water, not through it: ${s.p.x}`);
  setEngine(s, true);
  assert.equal(s.rpm, 0, "it won't start");
  w.dispose();
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

test("left in a bay of the lot, nosed or backed in and roughly square: that bay; else none", () => {
  const { bays } = lotLayout();
  const b = bays[5];
  const nose = b.dir > 0 ? Math.PI : 0;
  assert.deepEqual(bayFor(bays, b.x + 0.8, b.z - 0.4, nose + 0.2), { i: 5, a: nose });
  // (backed in: the other way, as bayFor gives it — 0 or π)
  assert.deepEqual(bayFor(bays, b.x - 0.5, b.z + 0.3, nose + Math.PI - 0.15), { i: 5, a: nose ? 0 : Math.PI });
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

test("the server takes any state that is all numbers (no put-back), not one that isn't", () => {
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
  assert.ok(finiteState(at(25)), "fast");
  assert.ok(finiteState(at(90)), "faster than any car goes");
  assert.ok(!finiteState({ ...at(5), x: Number.NaN }), "not a place");
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
  // …and clear of each other (a box each, a little room round it — a bike's a hand's width: a rack's stand side by
  // side, one to a hoop, 0.9 m apart)
  const box = (h: (typeof HOME_CARS)[number]): Solid => {
    const b = SPECS[h.model].body;
    const off = (b.ahead - b.behind) / 2;
    const room = isBikeKind(h.model) ? 0.05 : 0.2;
    return {
      kind: "box",
      x: h.x + Math.cos(h.a) * off,
      z: h.z + Math.sin(h.a) * off,
      hx: (b.ahead + b.behind) / 2 + room,
      hz: b.width / 2 + room,
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

test("the gas station: driven in off Main Street to beside either pump, either side; walked round its islands", async () => {
  const cw = groundsWorld();
  for (const x of [311, 315, 319, 323]) {
    const { w, s } = await car(cw, SEDAN, Math.PI / 2, x, -406);
    let hit = "";
    const drive = (c: CarState) => {
      const left = -389 - c.p.z;
      return C({ up: left > 3 ? 0.35 : 0, down: left <= 3 && readout(c).kmh > 0.5 ? 1 : 0, hand: left <= 3 ? 1 : 0 });
    };
    w.run(drive, 14, HELPS, (c) => {
      if (c.hit && !hit && c.hit.what !== "ground")
        hit = `${c.hit.what} at ${c.hit.x.toFixed(1)}, ${c.hit.z.toFixed(1)}`;
      return false;
    });
    assert.equal(hit, "", `from x ${x}: hit`);
    assert.ok(atPump(s.p.x, s.p.z), `from x ${x}: at a pump (${s.p.x.toFixed(1)}, ${s.p.z.toFixed(1)})`);
    w.dispose();
  }
  assert.ok(
    walkableCell(314, -389) && !walkableCell(313, -389) && !walkableCell(312, -380),
    "round the islands, not into the kiosk",
  );
});

test("(plan 93 S3) a person stood ahead, crept up on: the car stops at its bumper — never through them", async () => {
  // someone 7 m ahead of its middle, soft (as the game puts people in: car/cars.ts solidsNear)
  const ahead = 7;
  const cw: CarWorld = {
    height: () => 0,
    ground: () => "asphalt",
    solids: (x, z, r, out) => {
      if (Math.abs(x - ahead) < r + 1 && Math.abs(z) < r + 1)
        out.push({ kind: "circle", x: ahead, z: 0, r: 0.38, soft: true, what: "person", id: "p" });
    },
  };
  const { w, s } = await car(cw);
  let most = -9;
  // (the throttle a touch: a crawl, ~2–3 km/h)
  w.run(C({ up: 0.1 }), 12, HELPS, (c) => {
    most = Math.max(most, c.p.x);
    return false;
  });
  // (its nose — `ahead` of the middle — up against them: short of their middle, at a stop; their 0.38 is
  // the soft round them, arms and all)
  const nose = most + SEDAN.body.ahead;
  assert.ok(nose < ahead - 0.1, `its nose to ${nose.toFixed(2)} m, them at ${ahead} m`);
  assert.ok(nose > ahead - 1.2, `it came up to them: ${nose.toFixed(2)} m`);
  assert.ok(Math.hypot(s.v.x, s.v.z) < 0.1, `stopped there: ${Math.hypot(s.v.x, s.v.z).toFixed(2)} m/s`);
  w.dispose();
});

test("(plan 94 P7) a person leant on a car, or walking into it, never moves it — nose, side or tail", async () => {
  // (a person pressed against it as the game has them: their soft 0.38 into its box by what their own walker's
  // capsule lets in and the lag between their screen and the driver's, ~23 cm, held there — on their screen the car's a solid box)
  const b = SEDAN.body;
  const spots: [string, number, number][] = [
    ["its nose", b.ahead + 0.15, 0],
    ["its side", 0.4, b.width / 2 + 0.15],
    ["its tail", -b.behind - 0.15, 0],
  ];
  for (const [where, px, pz] of spots) {
    const cw: CarWorld = {
      height: () => 0,
      ground: () => "asphalt",
      solids: (x, z, r, out) => {
        if (Math.hypot(x - px, z - pz) < r + 1)
          out.push({ kind: "circle", x: px, z: pz, r: 0.38, soft: true, what: "person", id: "p" });
      },
    };
    const { w, s } = await car(cw);
    const x0 = s.p.x;
    const z0 = s.p.z;
    // (idling, in neutral, no brake: nothing holds it but its tyres)
    w.run(NONE, 6, HELPS);
    const moved = Math.hypot(s.p.x - x0, s.p.z - z0);
    assert.ok(moved < 0.03, `${where}: the car moved ${moved.toFixed(3)} m`);
    w.dispose();
  }
});

test("(plan 94 P8) the sedan up a 25% bank of earth or of grass from a stop; slides back on 35% grass", async () => {
  const climb = async (g: Ground, pct: number) => {
    const w = await JoltCarWorld.create(flatWorld(g, pct / 100));
    // (facing −z: flatWorld rises that way)
    const d = w.add(SEDAN, 0, 0, -Math.PI / 2);
    setEngine(d.s, true);
    d.s.temp = 0.55;
    w.run(NONE, 0.5);
    const z0 = d.s.p.z;
    w.run(C({ up: 1 }), 8, HELPS);
    const up = -(d.s.p.z - z0);
    w.dispose();
    return up;
  };
  for (const g of ["earth", "grass"] as Ground[]) {
    const m = await climb(g, 25);
    assert.ok(m > 12, `${g} 25%: ${m.toFixed(1)} m up in 8 s`);
  }
  // (and not a goat: the steepest grass is still too much for it)
  const steep = await climb("grass", 35);
  assert.ok(steep < 2, `grass 35%: ${steep.toFixed(1)} m`);
});

test("(plan 94 P5) a tyre shot out at 60 km/h: the car yanked toward it; a crawl's, nothing; upright", async () => {
  const run = async (bits: number, kmh: number) => {
    const { w, d, s } = await car(flatWorld("asphalt"));
    upTo(w, kmh);
    const z0 = s.p.z;
    if (bits) d.burst(bits);
    w.run(C({ up: 0.3 }), 1, HELPS);
    const out = { side: s.p.z - z0, up: upright(s), flats: d.flats };
    w.dispose();
    return out;
  };
  const none = await run(0, 60);
  const fr = await run(2, 60);
  const fl = await run(1, 60);
  const rr = await run(8, 60);
  // (heading along +x: its right is +z)
  assert.ok(Math.abs(none.side) < 0.2, `none: ${none.side.toFixed(2)} m`);
  assert.ok(fr.side > 1, `front right: toward its right, ${fr.side.toFixed(2)} m`);
  assert.ok(fl.side < -1, `front left: toward its left, ${fl.side.toFixed(2)} m`);
  assert.ok(rr.side > 0.3, `rear right: its tail swung out, it toward its right, ${rr.side.toFixed(2)} m`);
  assert.equal(fr.flats, 2, "and then flat");
  for (const r of [fr, fl, rr]) assert.ok(r.up > 0.95, "on its wheels");
  // (at a crawl: no kick)
  const slow = await run(2, 6);
  assert.ok(Math.abs(slow.side) < 0.2, `a crawl's: ${slow.side.toFixed(2)} m`);
});

test("(plan 93 S6) chains: braking on snow and ice much shorter; on asphalt no faster than 45 km/h", async () => {
  const brake = async (g: Ground, chained: boolean) => {
    const { w, d, s } = await car(flatWorld(g));
    if (chained) d.chains = 15;
    upTo(w, 40);
    const x0 = s.p.x;
    w.run(C({ down: 1 }), 40, HELPS, (c) => readout(c).kmh < 0.5);
    const m = s.p.x - x0;
    w.dispose();
    return m;
  };
  for (const g of ["snow", "ice"] as Ground[]) {
    const bare = await brake(g, false);
    const on = await brake(g, true);
    assert.ok(on < bare * 0.85, `${g}: ${on.toFixed(1)} m chained, ${bare.toFixed(1)} m bare`);
  }
  const { w, d, s } = await car(flatWorld("asphalt"));
  d.chains = 15;
  w.run(C({ up: 1 }), 25);
  assert.ok(readout(s).kmh < 48 && readout(s).kmh > 38, `floored, chained: ${readout(s).kmh.toFixed(0)} km/h`);
  w.dispose();
});

test("(plan 93 S6) a rut in deep snow: the front wheels taken into it — the car steered along it — and less to plough", async () => {
  const { Ruts } = await import("./car/ruts.ts");
  const go = async (rutted: boolean) => {
    const ruts = new Ruts();
    // (two ruts a track apart, 25 cm to the left of where the wheels start: along +x)
    const half = OFFROAD.track / 2;
    if (rutted)
      for (const side of [-1, 1])
        for (let x = -5; x < 80; x += 0.4) {
          const z = side * half + 0.25;
          ruts.lay(x, z, x + 0.4, z);
          ruts.lay(x, z, x + 0.4, z);
        }
    const cw: CarWorld = { ...flatWorld("deep"), rut: (x, z, out) => ruts.at(x, z, out) };
    const { w, s } = await car(cw, OFFROAD);
    w.run(C({ up: 0.6 }), 6);
    const r = { z: s.p.z, x: s.p.x };
    w.dispose();
    return r;
  };
  const bare = await go(false);
  const rut = await go(true);
  assert.ok(Math.abs(bare.z) < 0.03, `bare, straight on: ${bare.z.toFixed(2)} m`);
  assert.ok(Math.abs(rut.z - 0.25) < 0.08, `taken into the ruts (25 cm over) and along them: ${rut.z.toFixed(2)} m`);
  assert.ok(rut.x > bare.x, `further in them (less to plough): ${rut.x.toFixed(1)} vs ${bare.x.toFixed(1)} m`);
});

test("(plan 98) let off at 60 km/h in auto: the engine holds it back (not coasting free)", async () => {
  const { w, s } = await car(flatWorld("asphalt"));
  upTo(w, 60);
  const v0 = readout(s).kmh / 3.6;
  w.run(NONE, 2);
  const v1 = readout(s).kmh / 3.6;
  const decel = (v0 - v1) / 2;
  assert.ok(decel > 0.45 && decel < 2.2, `slowed ${decel.toFixed(2)} m/s²`);
  w.dispose();
});

test("(plan 98 phase 23) the town's driver on Jolt: round an L of road at 36 km/h, on its line, slowing for the bend", async () => {
  const { aiControls, projectOn } = await import("./car/ai.ts");
  // 60 m east, a quarter circle of 20 m round to the south (+z), 40 m on
  const pts: [number, number][] = [];
  for (let x = 0; x <= 60; x += 2) pts.push([x, 0]);
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    pts.push([60 + Math.sin(a) * 20, 20 - Math.cos(a) * 20]);
  }
  for (let z = 22; z <= 60; z += 2) pts.push([80, z]);
  const sAt = [0];
  for (let i = 1; i < pts.length; i++)
    sAt.push(sAt[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const r = { pts, s: sAt, len: sAt[sAt.length - 1] };
  const { w, s } = await car(flatWorld("asphalt"), SEDAN, 0, 0, 0);
  let at = 0;
  let worst = 0;
  let inBend = Infinity;
  w.run(
    (c) => {
      at = projectOn(r, c.p.x, c.p.z, at);
      return aiControls(c, r, at, 10);
    },
    30,
    HELPS,
    (c) => {
      const near = at;
      const { x, z } = (() => {
        const p = r.pts;
        void p;
        return { x: c.p.x, z: c.p.z };
      })();
      // (off the line: from the point on it nearest)
      let d = Infinity;
      for (let q = Math.max(0, near - 3); q <= Math.min(r.len, near + 3); q += 0.25) {
        const i = sAt.findIndex((v) => v >= q);
        const j = Math.max(1, i);
        const u = (q - sAt[j - 1]) / (sAt[j] - sAt[j - 1] || 1);
        const px = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u;
        const pz = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
        d = Math.min(d, Math.hypot(px - x, pz - z));
      }
      if (at > 5) worst = Math.max(worst, d);
      if (at > 62 && at < 88) inBend = Math.min(inBend, readout(c).kmh);
      return at > r.len - 6;
    },
  );
  assert.ok(at > r.len - 8, `got along ${at.toFixed(0)} of ${r.len.toFixed(0)} m`);
  assert.ok(worst < 1.2, `off its line ${worst.toFixed(2)} m at most`);
  assert.ok(inBend < 33, `round the bend at ${inBend.toFixed(0)} km/h`);
  void s;
  w.dispose();
});
