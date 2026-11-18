// The bicycles on Jolt (docs/plan/101-the-bicycles.md, phases 2, 4, 5, 6): how each goes, turns, stops, hops and
// wheelies; the tricks landed or fallen from; the snow and the ice; a crash.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Ground } from "../car/grip.ts";
import { JoltCarWorld } from "../car/jolt-world.ts";
import type { Controls, Solid } from "../car/state.ts";
import { flatWorld } from "../car/world.ts";
import type { BikeDrive } from "./drive.ts";
import { BIKE_SPECS, type BikeKind } from "./specs.ts";

const worlds: JoltCarWorld[] = [];
after(() => {
  for (const w of worlds) w.dispose();
});
const idle: Controls = { up: 0, down: 0, steer: 0, hand: 0, digital: true };
const kmh = (d: BikeDrive) => Math.hypot(d.s.v.x, d.s.v.z) * 3.6;
const headingOf = (d: BikeDrive) => {
  const q = d.s.q;
  // (its forward's heading)
  const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
  const fz = 2 * (q.x * q.z - q.w * q.y);
  return Math.atan2(fz, fx);
};

async function ride(kind: BikeKind, ground: Ground = "asphalt", solids: Solid[] = [], studs = false) {
  const cw = flatWorld(ground);
  if (solids.length) cw.solids = (_x, _z, _r, out) => out.push(...solids);
  const w = await JoltCarWorld.create(cw);
  worlds.push(w);
  const d = w.addBike(BIKE_SPECS[kind], 0, 0, 0);
  d.studs = studs;
  const run = (c: Controls | ((t: number) => Controls), secs: number, each?: () => void, toFall = true) => {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      w.step(typeof c === "function" ? c(i / 60) : c);
      each?.();
      if (toFall && d.bk.fell) break;
    }
  };
  run(idle, 0.5);
  return { w, d, run };
}

test("the town bike: up to its cruise and its sprint, and coasting on", async () => {
  const { d, run } = await ride("bike_town");
  run({ ...idle, up: 1 }, 7);
  const cruise = kmh(d);
  assert.ok(cruise > 26 && cruise < 31.5, `cruise ${cruise.toFixed(1)}`);
  run({ ...idle, up: 1, sprint: true }, 8);
  const sprint = kmh(d);
  assert.ok(sprint > 37 && sprint < 43, `sprint ${sprint.toFixed(1)}`);
  assert.ok(d.bk.stand > 0.9, "stood up on the pedals");
  run(idle, 2);
  assert.ok(kmh(d) > sprint - 8 && kmh(d) < sprint, "coasts on, slowing");
  assert.equal(d.bk.fell, null);
});

test("it leans into a turn, holds it, and flicks the other way", async () => {
  const { d, run } = await ride("bike_town");
  run({ ...idle, up: 1 }, 6);
  const h0 = headingOf(d);
  let most = 0;
  run({ ...idle, up: 1, steer: 1 }, 2.5, () => {
    most = Math.max(most, d.bk.roll);
  });
  assert.ok(most > 0.4 && most < 0.75, `lean ${most.toFixed(2)}`);
  const turned = Math.abs(Math.atan2(Math.sin(headingOf(d) - h0), Math.cos(headingOf(d) - h0)));
  assert.ok(turned > 1.2, `turned ${turned.toFixed(2)} rad`);
  run({ ...idle, up: 1, steer: -1 }, 0.8);
  assert.ok(d.bk.roll < -0.3, `the other way within 0.8 s: ${d.bk.roll.toFixed(2)}`);
  assert.equal(d.bk.fell, null);
  assert.ok(kmh(d) > 20, "kept its speed through the turns");
});

test("the brakes stop it short, and stopped it stands on a foot", async () => {
  const { d, run } = await ride("bike_town");
  run({ ...idle, up: 1 }, 7);
  const x0 = d.s.p.x;
  run({ ...idle, down: 1 }, 4);
  assert.ok(kmh(d) < 1, "stopped");
  assert.ok(d.s.p.x - x0 < 12, `in ${(d.s.p.x - x0).toFixed(1)} m`);
  run(idle, 4);
  assert.notEqual(d.bk.foot, 0, "a foot down");
  assert.ok(Math.abs(d.bk.roll) > 0.04 && Math.abs(d.bk.roll) < 0.15, `tipped to it ${d.bk.roll.toFixed(2)}`);
  assert.equal(d.bk.fell, null);
});

test("the BMX hops high and lands clean; the town bike a little", async () => {
  for (const [kind, least] of [
    ["bike_bmx", 0.75],
    ["bike_town", 0.2],
  ] as const) {
    const { d, run } = await ride(kind);
    run({ ...idle, up: 1 }, 4);
    const y0 = d.s.p.y;
    run({ ...idle, up: 1, hop: true }, 0.6);
    let top = 0;
    run({ ...idle, up: 1 }, 1.6, () => {
      top = Math.max(top, d.s.p.y - y0);
    });
    assert.ok(top > least, `${kind} hopped ${top.toFixed(2)} m`);
    assert.equal(d.bk.fell, null, `${kind} landed`);
    assert.ok(d.bk.landed?.clean, `${kind} clean`);
  }
});

test("the wheelie held at its balance, the stoppie on the front brake; both let down", async () => {
  const { d, run } = await ride("bike_bmx");
  run({ ...idle, up: 1 }, 4);
  run({ ...idle, up: 1, lean: 1 }, 2.5);
  assert.ok(d.bk.pitch > 0.35 && d.bk.pitch < 0.62, `wheelie ${d.bk.pitch.toFixed(2)}`);
  run({ ...idle, up: 1 }, 1.2);
  assert.ok(Math.abs(d.bk.pitch) < 0.05, "down again");
  run({ ...idle, up: 1 }, 2);
  let low = 0;
  run({ ...idle, down: 1, lean: -1 }, 0.7, () => {
    low = Math.min(low, d.bk.pitch);
  });
  assert.ok(low < -0.15, `stoppie ${low.toFixed(2)}`);
  run(idle, 1.5);
  assert.equal(d.bk.fell, null);
});

test("a tailwhip on the BMX lands; on the town bike it isn't round in time — off", async () => {
  {
    const { d, run } = await ride("bike_bmx");
    run({ ...idle, up: 1 }, 4);
    run({ ...idle, up: 1, hop: true }, 0.5);
    run({ ...idle, up: 1 }, 0.12);
    run({ ...idle, steer: -1, trick: true }, 0.05);
    run(idle, 1.6);
    assert.equal(d.bk.fell, null, "landed it");
    assert.deepEqual(d.bk.landed?.tricks, ["tailwhipL"]);
  }
  {
    const { d, run } = await ride("bike_town");
    run({ ...idle, up: 1 }, 4);
    run({ ...idle, up: 1, hop: true }, 0.5);
    run({ ...idle, up: 1 }, 0.12);
    run({ ...idle, steer: -1, trick: true }, 0.05);
    run(idle, 1.6);
    assert.equal(d.bk.fell?.why, "trick");
  }
});

test("a 360 held round lands; let go halfway, it comes down sideways — off", async () => {
  {
    const { d, run } = await ride("bike_bmx");
    run({ ...idle, up: 1 }, 4);
    run({ ...idle, up: 1, hop: true }, 0.5);
    let spun = 0;
    // (held round till it's all but there, as a rider would: let go, the spin stops)
    run(
      () => ({ ...idle, steer: d.bk.air > 0.03 && d.tricks.spun < Math.PI * 2 - 0.45 ? 1 : 0 }),
      1.6,
      () => {
        spun = Math.max(spun, d.bk.landed?.turns ?? 0);
      },
    );
    assert.equal(d.bk.fell, null, `landed it (${d.bk.landed?.why ?? ""})`);
    assert.equal(spun, 1, "once round");
  }
  {
    const { d, run } = await ride("bike_bmx");
    run({ ...idle, up: 1 }, 4);
    run({ ...idle, up: 1, hop: true }, 0.5);
    run((t) => ({ ...idle, steer: t > 0.04 && t < 0.3 ? 1 : 0 }), 1.6);
    assert.equal(d.bk.fell?.why, "sideways");
  }
});

test("ice: the town bike can't lean far and slides off if pushed; studs hold it", async () => {
  {
    const { d, run } = await ride("bike_town", "ice");
    run({ ...idle, up: 1 }, 6);
    assert.ok(kmh(d) > 12, `it gets going on ice ${kmh(d).toFixed(1)}`);
    let most = 0;
    run({ ...idle, up: 1, steer: 1 }, 2, () => {
      most = Math.max(most, d.bk.roll);
    });
    assert.ok(most < 0.32, `leans little ${most.toFixed(2)}`);
  }
  {
    const { d, run } = await ride("bike_mtb", "ice", [], true);
    run({ ...idle, up: 1 }, 6);
    let most = 0;
    run({ ...idle, up: 1, steer: 1 }, 2, () => {
      most = Math.max(most, d.bk.roll);
    });
    assert.ok(most > 0.4, `studs: leans in ${most.toFixed(2)}`);
    assert.equal(d.bk.fell, null);
  }
});

test("deep snow bogs the road bike down; the mountain bike keeps going", async () => {
  const speeds: Record<string, number> = {};
  for (const kind of ["bike_road", "bike_mtb"] as const) {
    const { d, run } = await ride(kind, "deep");
    run({ ...idle, up: 1 }, 6);
    speeds[kind] = kmh(d);
  }
  assert.ok(speeds.bike_road < 12, `road ${speeds.bike_road.toFixed(1)}`);
  assert.ok(speeds.bike_mtb > speeds.bike_road * 1.3, `mtb ${speeds.bike_mtb.toFixed(1)}`);
});

test("ridden into a wall it throws its rider; the bike falls over", async () => {
  const wall: Solid = { kind: "box", x: 22, z: 0, hx: 0.5, hz: 4, a: 0, what: "wall" };
  const { d, run } = await ride("bike_town", "asphalt", [wall]);
  run({ ...idle, up: 1 }, 6);
  assert.equal(d.bk.fell?.why, "crash");
  run(idle, 3, undefined, false);
  assert.ok(Math.abs(d.bk.roll) > 1.0, `on its side ${d.bk.roll.toFixed(2)}`);
});
