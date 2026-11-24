import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import {
  type CarWire,
  CHAIN_ON_MS,
  carKindOf,
  chainSpot,
  FIRE,
  HOME_CARS,
  headingQuat,
  MEND_MS,
  PANE_CRACK,
  PANE_GONE,
  PART,
  parkedPose,
  parseDamage,
  SEATS_OF,
  SPECS,
} from "@yutopia/shared/car";
import { heightAt, POND, POND_LEVEL } from "@yutopia/shared/grounds";
import { QUICK_SLOT } from "@yutopia/shared/inventory";
import { MV_AIM, packMv } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// The lot's cars, driven (docs/plan/28-the-car.md, phase 3): into the
// driver's seat, a passenger beside, the driver's states believed (and a jump
// not), out, parked where it stopped, the lot put back.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 30200 + Math.floor(Math.random() * 100); // (its own hundred: no two files share one — they run at once)
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
});
after(async () => {
  for (const r of rooms) await r.leave(true).catch(() => {});
  await server.gracefullyShutdown(false);
});
async function waitFor(fn: () => boolean, ms = 6000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);
const props = (o: { props: string }) => JSON.parse(o.props) as Record<string, unknown>;
/** a pack's place, as the server sends it */
type Slot = { id: string; n: number } | null;

test("into a lot car, driven, a passenger beside, out — and it's parked where it stopped", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 9,
      token: `dev:${uid}:P${uid}:member,builder`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(41);
  // a car in the lot, and where it stands
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const cars = [...a.state.objects.values()].filter((o: any) => o.kind === "car");
  assert.ok(cars.length > 3, "the lot has cars");
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = cars[0];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  // (in the aisle by its nose: the bays beside it may be taken)
  const door = { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4 };
  a.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(a).level === 0 && Math.hypot(me(a).x - door.x, me(a).y - door.y) < 2.5);
  a.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(a).busy === `drive:${vid}` && !!a.state.vehicles.get(vid));
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => a.state.vehicles.get(vid);
  assert.equal(v().kind, "sedan");
  assert.ok(props(a.state.objects.get(o.id)).driven, "its object is out being driven");
  // a parked car it knocked, come to rest: put where it stopped (not when it couldn't have got there)
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const others: any[] = cars.filter((c: any) => c.id !== o.id);
  const poseOf = (c: { x: number; y: number; yaw: number; props: string }) =>
    parkedPose({ x: c.x, y: c.y, yaw: c.yaw, props: props(c) });
  others.sort((p, q) => {
    const d = (c: typeof p) => Math.hypot(poseOf(c).x - v().x, poseOf(c).y - v().z);
    return d(p) - d(q);
  });
  const hit = others[0];
  const before = poseOf(hit);
  const to = { x: before.x + 0.8, z: before.y + 0.3, a: before.a + 0.2 };
  if (Math.hypot(to.x - v().x, to.z - v().z) < 12) {
    a.send("car:shove", { id: hit.id, ...to });
    await waitFor(() => Math.abs(poseOf(a.state.objects.get(hit.id)).x - to.x) < 0.05);
    const after = poseOf(a.state.objects.get(hit.id));
    assert.ok(
      Math.abs(after.y - to.z) < 0.05 &&
        Math.abs(Math.atan2(Math.sin(after.a - to.a), Math.cos(after.a - to.a))) < 0.01,
      "shoved where it stopped",
    );
    await sleep(300);
    a.send("car:shove", { id: hit.id, x: to.x + 40, z: to.z, a: to.a });
    await sleep(300);
    assert.ok(Math.abs(poseOf(a.state.objects.get(hit.id)).x - to.x) < 0.05, "a knock can't send it 40 m");
  } else assert.fail(`no parked car near enough to knock (${Math.hypot(to.x - v().x, to.z - v().z).toFixed(1)} m)`);
  // a passenger gets in beside
  const b = await join(42);
  b.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(b).level === 0);
  b.send("car:enter", { id: vid, seat: 1 });
  await waitFor(() => me(b).busy === `ride:car:${vid}`);
  assert.equal(v().riders, 2);
  // drive it 2 s forward at 5 m/s, as the driver's sim would say
  let x = v().x;
  let z = v().z;
  const ca = Math.cos(v().a);
  const sa = Math.sin(v().a);
  const q = headingQuat(v().a);
  const wire = (seq: number, dx = 0): CarWire => ({
    seq,
    x: x + dx,
    y: heightAt(x, z) + 0.52,
    z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx: ca * 5,
    vy: 0,
    vz: sa * 5,
    wy: 0,
    steer: 0,
    rpm: 2200,
    gear: 1,
    fl: 1024,
    slip: 0,
    fuel: 40,
    st: seq * 50 + 1, // (the driver's sim clock)
  });
  // a new driver: everyone watching starts its playback again (client car/playback.ts)
  assert.ok(v().jump >= 1, "a new driver is a jump");
  const jumped = v().jump;
  for (let i = 1; i <= 40; i++) {
    x += ca * 0.25;
    z += sa * 0.25;
    a.send("car:state", wire(i));
    await sleep(50);
  }
  await waitFor(() => v().seq === 40);
  assert.ok(Math.hypot(v().x - x, v().z - z) < 0.01, "it is where the driver says");
  assert.equal(v().st, 40 * 50 + 1, "on the driver's clock");
  assert.equal(v().jump, jumped, "a passenger getting in isn't a jump");
  assert.ok(Math.abs(me(a).x - x) < 2.5, "the driver is carried in it");
  // faster than any car goes: believed all the same (no put-backs — the user's call, 2026-10-28);
  // only a state that isn't numbers is let go
  let snapped = false;
  a.onMessage("car:snap", () => {
    snapped = true;
  });
  a.send("car:state", { ...wire(41, 80), x: Number.NaN });
  await sleep(150);
  assert.ok(Math.hypot(v().x - x, v().z - z) < 0.01, "not numbers: let go");
  a.send("car:state", wire(42, 80));
  await waitFor(() => v().seq === 42);
  assert.equal(snapped, false, "nobody put back");
  await sleep(60); // (states closer together than the car's rate are dropped)
  // stopped, both out: it parks where it is, at its heading
  a.send("car:state", { ...wire(43), vx: 0, vz: 0 });
  await sleep(80);
  a.send("car:leave", {});
  b.send("car:leave", {});
  await waitFor(() => me(a).busy === "" && me(b).busy === "");
  await waitFor(() => !a.state.vehicles.get(vid), 8000);
  const parked = a.state.objects.get(o.id);
  const pp = parkedPose({ x: parked.x, y: parked.y, yaw: parked.yaw, props: props(parked) });
  assert.ok(Math.hypot(pp.x - x, pp.y - z) < 0.2, `parked where it stopped: ${pp.x} ${pp.y} vs ${x} ${z}`);
  assert.ok(!props(parked).driven);
  assert.equal(typeof props(parked).a, "number");
  // the lot put back (an admin's): each car in its own bay, as it was
  a.send("mod:cars", {});
  await waitFor(() => typeof props(a.state.objects.get(o.id)).a !== "number");
  for (const [c, was] of [
    [o, pose],
    [hit, before],
  ] as const) {
    const now = poseOf(a.state.objects.get(c.id));
    assert.ok(Math.hypot(now.x - was.x, now.y - was.y) < 0.02 && now.a === was.a, `${c.id} back in its own bay`);
  }
});

test("its tank and its wear: only down from the driver, kept when parked; a passenger's radio; someone knocked down", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 9,
      token: `dev:${uid}:P${uid}:member,builder`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(43);
  const b = await join(44);
  a.send("mod:cars", {});
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...a.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[1];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const door = { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4 };
  for (const r of [a, b]) r.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(a).level === 0 && me(b).level === 0);
  a.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(a).busy === `drive:${vid}`);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => a.state.vehicles.get(vid);
  assert.ok(Math.abs(v().fuel - 0.7) < 1e-6, "a lot car's tank: 70 %");
  let x = v().x;
  let z = v().z;
  const ca = Math.cos(v().a);
  const sa = Math.sin(v().a);
  const q = headingQuat(v().a);
  let seq = 0;
  const state = (speed: number, fuel: number): CarWire => ({
    seq: ++seq,
    x,
    y: heightAt(x, z) + 0.52,
    z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx: ca * speed,
    vy: 0,
    vz: sa * speed,
    wy: 0,
    steer: 0,
    rpm: 1500,
    gear: 1,
    fl: 1024,
    slip: 0,
    fuel,
  });
  // the tank: down as the driver burns it (30 of the sedan's 60 litres), never up
  a.send("car:state", state(0, 30));
  await waitFor(() => Math.abs(v().fuel - 0.5) < 1e-3);
  await sleep(80);
  a.send("car:state", state(0, 55));
  await sleep(200);
  assert.ok(Math.abs(v().fuel - 0.5) < 1e-3, "the driver can't fill it");
  // its wear: up, a little at a time
  a.send("car:wear", { grime: 0.6, dmg: [0.2, 0, 0, 0.9] });
  await waitFor(() => v().grime > 0);
  assert.ok(Math.abs(v().grime - 0.1) < 1e-3, "the dirt: no more than 0.1 at once");
  assert.equal(v().dmg, "0.2,0,0,0.5");
  // the roof and the parts (docs/plan/92 phase 9): the bumper gone and a lamp out kept, never mended by
  // the driver (a part once broken stays, a zone never less)
  a.send("car:wear", { grime: 0.1, dmg: [0.1, 0, 0, 0.5, 0.3], parts: 2 | 16 });
  await waitFor(() => v().dmg.includes("|"));
  assert.equal(v().dmg, "0.2,0,0,0.5,0.3|19");
  a.send("car:wear", { grime: 0.1, dmg: [0.2, 0, 0, 0.5, 0.3], parts: 0 });
  await sleep(150);
  assert.equal(v().dmg, "0.2,0,0,0.5,0.3|19");
  // not at a pump: no filling
  let why = "";
  a.onMessage("car:no", (m: { why: string }) => {
    why = m.why;
  });
  a.send("car:fill", { on: true });
  await waitFor(() => why === "pump");
  assert.equal(v().filling, false);
  // a passenger's radio button: the driver's told
  b.send("car:enter", { id: vid, seat: 1 });
  await waitFor(() => me(b).busy === `ride:car:${vid}`);
  let told = 0;
  a.onMessage("car:radio", () => {
    told++;
  });
  b.send("car:radio", {});
  await waitFor(() => told === 1);
  b.send("car:leave", {});
  await waitFor(() => me(b).busy === "");
  // on the move, into her: knocked down (once)
  for (let i = 0; i < 3; i++) {
    x += ca * 0.25;
    z += sa * 0.25;
    a.send("car:state", state(5, 29.9));
    await sleep(60);
  }
  a.send("car:knock", { sid: b.sessionId });
  await waitFor(() => me(b).fellAt > 0);
  // stopped, out: parked with its tank and its wear
  a.send("car:state", state(0, 29.9));
  await sleep(80);
  a.send("car:leave", {});
  await waitFor(() => !a.state.vehicles.get(vid), 8000);
  const p = props(a.state.objects.get(o.id));
  assert.ok(Math.abs(Number(p.fuel) - 29.9 / 60) < 2e-3, `its tank kept: ${p.fuel}`);
  assert.equal(p.grime, 0.1);
  assert.equal(p.dmg, "0.2,0,0,0.5,0.3|19");
  // the lot put back: fresh
  a.send("mod:cars", {});
  await waitFor(() => props(a.state.objects.get(o.id)).fuel === undefined);
  assert.equal(props(a.state.objects.get(o.id)).dmg, undefined);
});

test("stuck: pulled out to a clear spot near by (the server's pick), not again straight after", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9,
    token: "dev:45:P45:member,builder",
  });
  rooms.push(r);
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  r.send("mod:cars", {});
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...r.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[2];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const door = { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4 };
  r.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(r).level === 0);
  r.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(r).busy === `drive:${vid}`);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => r.state.vehicles.get(vid);
  const from = { x: v().x, z: v().z };
  const jumped = v().jump;
  let snap: { x: number; z: number } | null = null;
  let why = "";
  r.onMessage("car:snap", (m: { x: number; z: number }) => {
    snap = m;
  });
  r.onMessage("car:no", (m: { why: string }) => {
    why = m.why;
  });
  r.send("car:unstick", {});
  await waitFor(() => !!snap);
  const to = snap as unknown as { x: number; z: number };
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  assert.ok(d > 2.9 && d <= 30, `pulled ${d.toFixed(1)} m`);
  await waitFor(() => Math.hypot(v().x - to.x, v().z - to.z) < 0.01); // (the car there for everyone)
  assert.equal(v().jump, (jumped + 1) & 255, "drawn there at once by everyone (a jump), not eased to");
  r.send("car:unstick", {});
  await waitFor(() => why === "soon");
  r.send("car:leave", {});
  await waitFor(() => me(r).busy === "");
  r.send("mod:cars", {});
});

test("the cars that live away from the lot: made where they live; the pickup's bed; put back home, not in the lot", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 9,
      token: `dev:${uid}:P${uid}:member,builder`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(46);
  const b = await join(47);
  await waitFor(() => !!a.state.objects.get("farm-pickup") && !!a.state.objects.get("town-car-3"));
  const home = (id: string) => HOME_CARS.find((h) => h.id === id) as (typeof HOME_CARS)[number];
  const poseOf = (id: string) => {
    const o = a.state.objects.get(id);
    return parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  };
  // where they live, with their roles
  for (const id of ["farm-pickup", "town-car-3", "gas-rental"]) {
    const p = poseOf(id);
    assert.ok(Math.hypot(p.x - home(id).x, p.y - home(id).z) < 0.05, `${id} at home`);
  }
  assert.equal(props(a.state.objects.get("town-car-3")).role, "police");
  assert.equal(props(a.state.objects.get("farm-pickup")).model, "pickup");
  // into the pickup: the driver in the cab, someone in the bed (higher, further back)
  await a.send("mod:cars", {});
  await sleep(300);
  const p0 = poseOf("farm-pickup");
  const door = { x: p0.x - Math.sin(p0.a) * 2.2, y: p0.y + Math.cos(p0.a) * 2.2 };
  for (const r of [a, b]) {
    r.send("teleport", { to: { x: -30, y: 10, level: 0 } });
    await waitFor(() => me(r).level === 0);
    r.send("teleport", { to: { ...door, level: 0 } });
    await waitFor(() => Math.hypot(me(r).x - door.x, me(r).y - door.y) < 3);
  }
  a.send("car:enter", { id: "farm-pickup", seat: 0 });
  const vid = "car:farm-pickup";
  await waitFor(() => me(a).busy === `drive:${vid}`);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => a.state.vehicles.get(vid);
  assert.equal(v().kind, "pickup");
  b.send("car:enter", { id: vid, seat: 2 });
  await waitFor(() => me(b).busy === `ride:car:${vid}`);
  await sleep(150);
  assert.ok(me(b).z - me(a).z > 0.4, `in the bed: ${me(b).z.toFixed(2)} over the cab's ${me(a).z.toFixed(2)}`);
  // driven 6 m on, left: parked there — then the lot put back: home again
  let x = v().x;
  let z = v().z;
  const ca = Math.cos(v().a);
  const sa = Math.sin(v().a);
  const q = headingQuat(v().a);
  for (let i = 1; i <= 24; i++) {
    x += ca * 0.25;
    z += sa * 0.25;
    const st: CarWire = {
      seq: i,
      x,
      y: heightAt(x, z) + 0.62,
      z,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
      vx: i < 24 ? ca * 5 : 0,
      vy: 0,
      vz: i < 24 ? sa * 5 : 0,
      wy: 0,
      steer: 0,
      rpm: 1500,
      gear: 1,
      fl: 1024,
      slip: 0,
      fuel: 50,
    };
    a.send("car:state", st);
    await sleep(55);
  }
  await sleep(100);
  for (const r of [a, b]) r.send("car:leave", {});
  await waitFor(() => !a.state.vehicles.get(vid), 8000);
  const moved = poseOf("farm-pickup");
  assert.ok(Math.hypot(moved.x - home("farm-pickup").x, moved.y - home("farm-pickup").z) > 4, "left where it stopped");
  a.send("mod:cars", {});
  await waitFor(() => {
    const p = poseOf("farm-pickup");
    return Math.hypot(p.x - home("farm-pickup").x, p.y - home("farm-pickup").z) < 0.05;
  });
});

test("a snowmobile: its one rider, no more", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 9,
      token: `dev:${uid}:P${uid}:member,builder`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(48);
  const b = await join(49);
  a.send("mod:cars", {});
  await waitFor(() => !!a.state.objects.get("pond-sled-0"));
  await sleep(300);
  const o = a.state.objects.get("pond-sled-0");
  const p = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  assert.equal(props(o).model, "snowmobile");
  const by = { x: p.x, y: p.y + 1.6 };
  for (const r of [a, b]) {
    r.send("teleport", { to: { x: -30, y: 10, level: 0 } });
    await waitFor(() => me(r).level === 0);
    r.send("teleport", { to: { ...by, level: 0 } });
    await waitFor(() => Math.hypot(me(r).x - by.x, me(r).y - by.y) < 3);
  }
  a.send("car:enter", { id: "pond-sled-0", seat: 0 });
  await waitFor(() => me(a).busy === "drive:car:pond-sled-0");
  assert.equal(a.state.vehicles.get("car:pond-sled-0").kind, "snowmobile");
  let why = "";
  b.onMessage("car:no", (m: { why: string }) => {
    why = m.why;
  });
  b.send("car:enter", { id: "car:pond-sled-0", seat: 1 });
  await waitFor(() => why === "taken");
  assert.equal(me(b).busy, "");
  a.send("car:leave", {});
  await waitFor(() => me(a).busy === "");
});

test("into the pond (plan 66): driven in deep, its people are out of it afloat, and nobody gets back in", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9,
    token: "dev:50:P50:member,builder,admin",
  });
  rooms.push(r);
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  // (the water open: the tests' world is a winter's, frozen)
  r.send("mod:ground", { to: "melt", now: true });
  await waitFor(() => r.state.weather.ice === 0);
  r.send("mod:cars", {});
  await waitFor(() => !!r.state.objects.get("pond-sled-0"));
  await sleep(300);
  const o = r.state.objects.get("pond-sled-0");
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  r.send("teleport", { to: { x: -30, y: 10, level: 0 } });
  await waitFor(() => me(r).level === 0);
  r.send("teleport", { to: { x: pose.x, y: pose.y + 1.6, level: 0 } });
  await waitFor(() => Math.hypot(me(r).x - pose.x, me(r).y - pose.y - 1.6) < 3);
  r.send("car:enter", { id: "pond-sled-0", seat: 0 });
  await waitFor(() => me(r).busy === "drive:car:pond-sled-0");
  // driven out over the pond's deep middle (where the driver says it is, it is)
  const q = headingQuat(0);
  const at = { x: POND.cx, z: POND.cz };
  r.send("car:state", {
    seq: 1,
    x: at.x,
    y: heightAt(at.x, at.z) + 0.5,
    z: at.z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx: 0,
    vy: 0,
    vz: 0,
    wy: 0,
    steer: 0,
    rpm: 0,
    gear: 0,
    fl: 0,
    slip: 0,
    fuel: 10,
  } satisfies CarWire);
  await waitFor(() => me(r).busy === "");
  assert.ok(Math.abs(me(r).z - (POND_LEVEL - 1.25)) < 0.05, `afloat: ${me(r).z}`);
  // left there, parked where it went down: nobody gets in
  await waitFor(() => !r.state.vehicles.get("car:pond-sled-0"), 6000);
  let why = "";
  r.onMessage("car:no", (m: { why: string }) => {
    why = m.why;
  });
  r.send("car:enter", { id: "pond-sled-0", seat: 0 });
  await waitFor(() => why === "gone");
  r.send("mod:ground", { to: "snow", now: true });
  await waitFor(() => r.state.weather.ice === 1);
});

test("(plan 93 S3) knocked at a walk's pace: a stagger, unhurt; in a fight, at speed: down and hurt by how fast", async () => {
  const join = async (uid: number, roles: string) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 10,
      token: `dev:${uid}:P${uid}:${roles}`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(47, "member,builder,admin");
  const b = await join(48, "member,builder");
  a.send("mod:cars", {});
  a.send("mod:dark", { mode: "peaceful" });
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...a.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[1];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const door = { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4 };
  for (const r of [a, b]) r.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(a).level === 0 && me(b).level === 0);
  a.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(a).busy === `drive:${vid}`);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => a.state.vehicles.get(vid);
  const x = v().x;
  const z = v().z;
  const ca = Math.cos(v().a);
  const sa = Math.sin(v().a);
  const q = headingQuat(v().a);
  let seq = 0;
  const state = (speed: number): CarWire => ({
    seq: ++seq,
    x,
    y: heightAt(x, z) + 0.52,
    z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx: ca * speed,
    vy: 0,
    vz: sa * speed,
    wy: 0,
    steer: 0,
    rpm: 1500,
    gear: 1,
    fl: 1024,
    slip: 0,
    fuel: 40,
  });
  // at 3 m/s (~11 km/h): a stagger — thrown, on her feet, unhurt
  a.send("car:state", state(3));
  await sleep(120);
  a.send("car:knock", { sid: b.sessionId });
  await waitFor(() => me(b).hitAt > 0);
  assert.equal(me(b).fellAt, 0, "not down");
  assert.equal(me(b).hp, 100, "unhurt");
  // the driver fires out of her window: a fight
  a.send("mod:refill", { kit: true });
  await sleep(400);
  a.send("car:state", state(0));
  a.send("arms:draw", { slot: 0 });
  await waitFor(() => me(a).gun === "revolver");
  await sleep(700);
  const m = me(a);
  const yaw = Math.atan2(-Math.cos(v().a), Math.sin(v().a));
  a.send("arms:fire", {
    ox: m.x + Math.sin(v().a) * 0.6,
    oy: m.y - Math.cos(v().a) * 0.6,
    oz: m.z + 0.75,
    yaw,
    pitch: 0.3,
    lag: 0,
    seed: 1,
  });
  await sleep(4200); // (the knock's own again)
  // at 10 m/s, into her: down, and hurt by it — (10 − 3) × 4
  a.send("car:state", state(10));
  await sleep(120);
  a.send("car:knock", { sid: b.sessionId });
  await waitFor(() => me(b).fellAt > 0);
  await waitFor(() => me(b).hp === 72, 3000);
  // (plan 97 L4) the one knocked leaves: the server forgets when they were knocked
  const { WorldRoom } = await import("./WorldRoom.ts");
  const k0 = WorldRoom.current?.carMaps?.().knockedAt ?? 0;
  assert.ok(k0 >= 1, "her knock kept while she's here");
  rooms.splice(rooms.indexOf(b), 1);
  await b.leave(true);
  await waitFor(() => (WorldRoom.current?.carMaps?.().knockedAt ?? 0) === k0 - 1);
});

test("(plan 93 S4) its boot, stood behind it parked: put in, taken out, kept on it; its glove box from the front seat", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 11,
    token: "dev:49:P49:member,builder,admin",
  });
  rooms.push(r);
  // biome-ignore lint/suspicious/noExplicitAny: the pack as the server sends it
  let inv: any = null;
  r.onMessage("dark:pockets", (m: { inv: unknown }) => {
    inv = m.inv;
  });
  r.onMessage("*", () => {});
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  r.send("dark:hello", {});
  await waitFor(() => inv !== null);
  r.send("mod:cars", {});
  r.send("mod:refill", { kit: true });
  await sleep(500);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...r.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[2];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const back = 2.58 + 0.35; // (a saloon's back from its middle, and a step)
  const behind = { x: pose.x - Math.cos(pose.a) * back, y: pose.y - Math.sin(pose.a) * back };
  // (a stack in the pockets: which)
  // biome-ignore lint/suspicious/noExplicitAny: the pack
  const stackAt = () => (inv.pockets as any[]).findIndex((it) => it && !("loaded" in it));
  const total = (id: string) =>
    [...inv.pockets, ...inv.quick, inv.hand].reduce((a: number, it: Slot) => a + (it?.id === id ? it.n : 0), 0);
  await waitFor(() => stackAt() >= 0);
  const slot = stackAt();
  const what = inv.pockets[slot].id;
  const had = total(what);
  // too far: nothing
  r.send("teleport", { to: { x: behind.x - Math.cos(pose.a) * 3, y: behind.y - Math.sin(pose.a) * 3, level: 0 } });
  await sleep(500);
  r.send("car:put", { kind: "boot", id: o.id, from: slot });
  await sleep(400);
  assert.equal(props(r.state.objects.get(o.id)).boot, undefined, "not from there");
  // behind it: in
  r.send("teleport", { to: { ...behind, level: 0 } });
  await waitFor(() => Math.hypot(me(r).x - behind.x, me(r).y - behind.y) < 0.5);
  r.send("car:put", { kind: "boot", id: o.id, from: slot });
  // biome-ignore lint/suspicious/noExplicitAny: props
  await waitFor(() => ((props(r.state.objects.get(o.id)).boot as any[]) ?? []).some((s) => s.id === what));
  await waitFor(() => total(what) === 0 || total(what) < had);
  // out again: all of it
  r.send("car:take", { kind: "boot", id: o.id, i: -1 });
  await waitFor(() => props(r.state.objects.get(o.id)).boot === undefined);
  await waitFor(() => total(what) === had);
  // something left in it, the car driven off and parked: still in it
  r.send("car:put", { kind: "boot", id: o.id, from: slot, n: 1 });
  await waitFor(() => !!props(r.state.objects.get(o.id)).boot);
  r.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(r).busy === `drive:${vid}`);
  // the glove box, sat at the wheel: the revolver in it, and out
  const rev = (inv.quick as { id: string }[]).findIndex((it) => it?.id === "revolver");
  assert.ok(rev >= 0, "a revolver at hand");
  r.send("car:put", { kind: "glove", id: o.id, from: QUICK_SLOT + rev });
  // biome-ignore lint/suspicious/noExplicitAny: props
  await waitFor(() => ((props(r.state.objects.get(o.id)).glove as any[]) ?? []).some((s) => s.id === "revolver"));
  r.send("car:take", { kind: "glove", id: o.id, i: 0 });
  await waitFor(() => props(r.state.objects.get(o.id)).glove === undefined);
  // biome-ignore lint/suspicious/noExplicitAny: the pack
  await waitFor(() => [...inv.pockets, ...inv.quick].some((it: any) => it?.id === "revolver"));
  r.send("car:leave", {});
  await waitFor(() => !r.state.vehicles.get(vid), 8000);
  assert.ok(
    ((props(r.state.objects.get(o.id)).boot as { id: string }[]) ?? []).some((s) => s.id === what),
    "kept in its boot",
  );
});

test("(plan 93 S5) each seat's own window: down by its switch, up again; nobody's but a seated person's", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 12,
    token: "dev:51:P51:member,builder,admin",
  });
  rooms.push(r);
  r.onMessage("*", () => {});
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  r.send("mod:cars", {});
  await sleep(500);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...r.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[3];
  // (stood away from it: no window of mine to wind)
  r.send("car:window", { down: true });
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const side = { x: pose.x + Math.sin(pose.a) * 1.6, y: pose.y - Math.cos(pose.a) * 1.6 };
  r.send("teleport", { to: { ...side, level: 0 } });
  await waitFor(() => Math.hypot(me(r).x - side.x, me(r).y - side.y) < 0.5);
  r.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(r).busy === `drive:${vid}` && !!r.state.vehicles.get(vid));
  assert.equal(r.state.vehicles.get(vid).win, 0, "all up as it's got into");
  r.send("car:window", { down: true });
  await waitFor(() => r.state.vehicles.get(vid).win === 1);
  r.send("car:window", { down: false });
  await waitFor(() => r.state.vehicles.get(vid).win === 0);
});

test("(plan 93 S6) a snow chain fitted kneeling by a wheel, from the pack; walked off, not; carried driving", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 13,
    token: "dev:53:P53:member,builder,admin",
  });
  rooms.push(r);
  // biome-ignore lint/suspicious/noExplicitAny: the pack as the server sends it
  let inv: any = null;
  r.onMessage("dark:pockets", (m: { inv: unknown }) => {
    inv = m.inv;
  });
  r.onMessage("*", () => {});
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  r.send("dark:hello", {});
  await waitFor(() => inv !== null);
  r.send("mod:cars", {});
  r.send("mod:refill", { chains: 4 });
  const chains = () =>
    [...inv.pockets, ...inv.quick, inv.hand].reduce((a: number, it: Slot) => a + (it?.id === "chains" ? it.n : 0), 0);
  await waitFor(() => chains() === 4);
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...r.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[4];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const spec = SPECS[carKindOf(props(o).model)];
  const go = async (i: number) => {
    const at = chainSpot(spec, pose.x, pose.y, pose.a, i);
    r.send("teleport", { to: { x: at.x, y: at.y, level: 0 } });
    await waitFor(() => Math.hypot(me(r).x - at.x, me(r).y - at.y) < 0.4);
  };
  // by its front left wheel: knelt, a while, on
  await go(0);
  r.send("car:chain", { id: o.id, wheel: 0, on: true });
  await waitFor(() => me(r).busy === `chain:${o.id}:0`);
  await sleep(CHAIN_ON_MS * 0.5);
  assert.equal(props(r.state.objects.get(o.id)).chains, undefined, "not yet");
  await waitFor(() => props(r.state.objects.get(o.id)).chains === 1, CHAIN_ON_MS);
  assert.equal(me(r).busy, "");
  await waitFor(() => chains() === 3);
  // the front right: begun, then walked off — not fitted, still in the pack
  await go(1);
  r.send("car:chain", { id: o.id, wheel: 1, on: true });
  await waitFor(() => me(r).busy === `chain:${o.id}:1`);
  r.send("car:chain-stop", {});
  await waitFor(() => me(r).busy === "");
  await sleep(CHAIN_ON_MS + 300);
  assert.equal(props(r.state.objects.get(o.id)).chains, 1);
  assert.equal(chains(), 3);
  // driven: its chains on the wire
  r.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(r).busy === `drive:${vid}` && !!r.state.vehicles.get(vid));
  assert.equal(r.state.vehicles.get(vid).chains, 1);
});

test("(plan 93 S7) mended at its bonnet with a wrench (the engine first), a flat changed for the spare; a tow rope tied, untied", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 14,
    token: "dev:55:P55:member,builder,admin",
  });
  rooms.push(r);
  // biome-ignore lint/suspicious/noExplicitAny: the pack as the server sends it
  let inv: any = null;
  const nos: string[] = [];
  r.onMessage("dark:pockets", (m: { inv: unknown }) => {
    inv = m.inv;
  });
  r.onMessage("car:no", (m: { why: string }) => nos.push(m.why));
  r.onMessage("*", () => {});
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  r.send("dark:hello", {});
  await waitFor(() => inv !== null);
  r.send("mod:cars", {});
  await sleep(500);
  const has = (id: string) =>
    [...inv.pockets, ...inv.quick, inv.hand].reduce((a: number, it: Slot) => a + (it?.id === id ? it.n : 0), 0);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const cars: any[] = [...r.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven);
  const o = cars[5];
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const at = (oo: any) => parkedPose({ x: oo.x, y: oo.y, yaw: oo.yaw, props: props(oo) });
  const spec = SPECS[carKindOf(props(o).model)];
  const stand = async (x: number, y: number) => {
    r.send("teleport", { to: { x, y, level: 0 } });
    await waitFor(() => Math.hypot(me(r).x - x, me(r).y - y) < 0.4);
  };
  // its damage: driven a moment and knocked about — the engine dead, a lamp, a side's glass, a flat at the back left
  const pose = at(o);
  await stand(pose.x + Math.sin(pose.a) * 1.6, pose.y - Math.cos(pose.a) * 1.6);
  r.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(r).busy === `drive:${vid}` && !!r.state.vehicles.get(vid));
  const sent = PART.engineDead | PART.headL | PART.goneFL | PART.flatRL;
  // (as the server keeps them: plan 94's glass — a pane gone was cracked first)
  const parts = parseDamage(`0|${sent}`).parts;
  r.send("car:wear", { grime: 0, dmg: [0.5, 0, 0.3, 0, 0], parts: sent });
  await sleep(300);
  r.send("car:wear", { grime: 0, dmg: [0.95, 0, 0.3, 0, 0], parts: sent });
  await waitFor(() => parseDamage(r.state.vehicles.get(vid).dmg).parts === parts);
  r.send("car:leave", {});
  await waitFor(() => me(r).busy === "" && !r.state.vehicles.get(vid));
  const dm = () => parseDamage(props(r.state.objects.get(o.id)).dmg);
  await waitFor(() => dm().parts === parts);
  const p2 = at(r.state.objects.get(o.id));
  const nose = {
    x: p2.x + Math.cos(p2.a) * (spec.body.ahead + 0.45),
    y: p2.y + Math.sin(p2.a) * (spec.body.ahead + 0.45),
  };
  // at its bonnet, no wrench: refused
  await stand(nose.x, nose.y);
  r.send("car:mend", { id: o.id, what: "engine" });
  await waitFor(() => nos.includes("wrench"));
  // the wrench (and a tow rope): the engine first — the lamps aren't, out of order
  r.send("mod:refill", { tools: true });
  await waitFor(() => has("wrench") === 1 && has("towrope") === 1);
  r.send("car:mend", { id: o.id, what: "lamps" });
  await sleep(300);
  assert.equal(me(r).busy, "", "the engine's first");
  r.send("car:mend", { id: o.id, what: "engine" });
  await waitFor(() => me(r).busy === `mend:${o.id}:engine`);
  await waitFor(() => !(dm().parts & PART.engineDead), MEND_MS.engine + 2000);
  assert.ok(dm().zones[0] <= 0.75, "no more steam");
  assert.equal(has("wrench"), 1, "a wrench is kept");
  // the flat at the back left: its spare
  const w2 = chainSpot(spec, p2.x, p2.y, p2.a, 2);
  await stand(w2.x, w2.y);
  r.send("car:mend", { id: o.id, what: "tyre", wheel: 2 });
  await waitFor(() => me(r).busy === `mend:${o.id}:tyre2`);
  await waitFor(() => !(dm().parts & PART.flatRL), MEND_MS.tyre + 2000);
  assert.equal(props(r.state.objects.get(o.id)).spare, 0, "its spare used");
  // a tow rope: from its back to the nearest car's front, then untied — the rope back in the pack
  const near = cars
    .filter((c) => c.id !== o.id)
    .sort((a, b) => Math.hypot(at(a).x - p2.x, at(a).y - p2.y) - Math.hypot(at(b).x - p2.x, at(b).y - p2.y))[0];
  r.send("car:tow", { from: o.id, to: near.id });
  await waitFor(
    () => props(r.state.objects.get(o.id)).towing === near.id && props(r.state.objects.get(near.id)).towedBy === o.id,
  );
  assert.equal(has("towrope"), 0);
  r.send("car:untow", { id: near.id });
  await waitFor(() => !props(r.state.objects.get(o.id)).towing && !props(r.state.objects.get(near.id)).towedBy);
  await waitFor(() => has("towrope") === 1);
});

test("(plan 93 S9, plan 94 G6) locked by its owner: a stranger's door refused, its alarm on and its owner told; its owner gets in, still locked till unlocked from inside", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 15,
      token: `dev:${uid}:P${uid}:member,builder,admin`,
    });
    rooms.push(r);
    r.onMessage("*", () => {});
    await waitFor(() => !!r.state.players?.get(r.sessionId));
    return r;
  };
  const a = await join(57);
  const b = await join(58);
  const noB: string[] = [];
  b.onMessage("car:no", (m: { why: string }) => noB.push(m.why));
  const alarms: { id: string; why: string }[] = [];
  a.onMessage("car:alarm", (m: { id: string; why: string }) => alarms.push(m));
  const bought: string[] = [];
  a.onMessage("car:bought", (m: { id: string }) => bought.push(m.id));
  const to = { x: 512, y: -393.5, level: 0 };
  a.send("teleport", { to });
  await waitFor(() => Math.hypot(me(a).x - to.x, me(a).y - to.y) < 1);
  a.send("car:buy", { model: "sedan", colour: 2, plate: "" });
  await waitFor(() => bought.length === 1 && !!a.state.objects.get(bought[0]));
  const id = bought[0];
  const o = a.state.objects.get(id);
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const side = { x: pose.x + Math.sin(pose.a) * 1.6, y: pose.y - Math.cos(pose.a) * 1.6, level: 0 };
  // a stranger can't lock it
  b.send("teleport", { to: side });
  await waitFor(() => Math.hypot(me(b).x - side.x, me(b).y - side.y) < 0.6);
  b.send("car:lock", { id, on: true });
  await waitFor(() => noB.includes("owned"));
  // its owner locks it, a few steps off (its fob reaches)
  const off = { x: pose.x - Math.sin(pose.a) * 4, y: pose.y + Math.cos(pose.a) * 4, level: 0 };
  a.send("teleport", { to: off });
  await waitFor(() => Math.hypot(me(a).x - off.x, me(a).y - off.y) < 1);
  a.send("car:lock", { id, on: true });
  await waitFor(() => props(a.state.objects.get(id)).locked === 1);
  // the stranger tries a door: refused, its alarm on, its owner told
  b.send("car:enter", { id, seat: 1 });
  await waitFor(() => noB.includes("locked"));
  await waitFor(() => alarms.length === 1 && Number(props(a.state.objects.get(id)).alarmAt) > 0);
  assert.equal(alarms[0].why, "door");
  assert.equal(me(b).busy, "");
  // its owner gets in: its keys — (plan 94 G6, F10b) and it stays locked as it's driven: a stranger's refused its
  // empty seats, till its driver unlocks it from inside
  a.send("teleport", { to: side });
  await waitFor(() => Math.hypot(me(a).x - side.x, me(a).y - side.y) < 0.6);
  a.send("car:enter", { id, seat: 0 });
  await waitFor(() => me(a).busy === `drive:car:${id}`);
  assert.equal(props(a.state.objects.get(id)).locked, 1, "still locked, driven");
  noB.length = 0;
  b.send("car:enter", { id, seat: 1 });
  await waitFor(() => noB.includes("locked"));
  assert.equal(me(b).busy, "", "a stranger refused a locked car's seat");
  a.send("car:lock", { id, on: false });
  await waitFor(() => props(a.state.objects.get(id)).locked === undefined);
  b.send("car:enter", { id, seat: 1 });
  await waitFor(() => me(b).busy === `ride:car:car:${id}` || me(b).busy.startsWith("ride:"));
});

/** (plan 94 P4; plan 95 F1a) Bia's round through the driver's side into Ana at the wheel — her window up, or
 *  wound down first. */
async function windowShot(sandbox: number, uids: [number, number], down: boolean) {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox,
      token: `dev:${uid}:P${uid}:member,builder,admin`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(uids[0]);
  const b = await join(uids[1]);
  a.send("mod:cars", {});
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...a.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[2];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  a.send("teleport", { to: { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4, level: 0 } });
  await waitFor(() => me(a).level === 0);
  a.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(a).busy === `drive:${vid}` && !!a.state.vehicles.get(vid));
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v: any = a.state.vehicles.get(vid);
  // (plan 95 F1a: her window wound down)
  if (down) {
    a.send("car:window", { down: true });
    await waitFor(() => (a.state.vehicles.get(vid).win & 1) !== 0);
  }
  const kind = carKindOf(props(o).model);
  // (the driver's seat: its place from the car's centre of gravity, forward and to its right)
  const [u, w] = SEATS_OF[kind].at[0];
  const ca = Math.cos(v.a);
  const sa = Math.sin(v.a);
  const at = (uu: number, ww: number) => ({ x: v.x + ca * uu - sa * ww, y: v.z + sa * uu + ca * ww });
  const head = at(u, w);
  // Bia a step out from the driver's door (in the gap before the next car in the lot), armed
  const side = Math.sign(w) || -1;
  // (wound down: a little ahead of her, the round in through her own window — square on, it comes in behind the
  // server's line between the front window and the rear one)
  const stand = at(u + (down ? 0.6 : 0), w + side * 1.9);
  b.send("teleport", { to: { ...stand, level: 0 } });
  // (put by the nearest free spot: a little off it, maybe — the shot's from where she is)
  await waitFor(() => Math.hypot(me(b).x - stand.x, me(b).y - stand.y) < 1.5);
  b.send("dark:hello", {});
  b.send("mod:refill", { kit: true });
  await sleep(400);
  b.send("arms:draw", { slot: 0 });
  await waitFor(() => me(b).gun === "revolver");
  await sleep(700);
  const hp0 = me(a).hp;
  // (aiming: on foot, a shot's only from the aim)
  b.send("pos", { x: me(b).x, y: me(b).y, z: me(b).z, yaw: 0, a: 0, seq: 1, mv: packMv("still") | MV_AIM });
  await waitFor(() => (me(b).mv & MV_AIM) !== 0);
  const mb = me(b);
  const log: unknown[] = [];
  b.onMessage("car:shot", (m) => log.push(["car:shot", m]));
  b.onMessage("arms:hit", (m) => log.push(["arms:hit", m]));
  const oz = mb.z + 1.35;
  // (at her head: her hip's height and the head over it, from the ground under the car)
  const tz = heightAt(head.x, head.y) + SEATS_OF[kind].hip[0] + 0.72;
  const dist = Math.hypot(head.x - mb.x, head.y - mb.y);
  b.send("arms:fire", {
    ox: mb.x,
    oy: mb.y,
    oz,
    yaw: Math.atan2(head.y - mb.y, head.x - mb.x),
    pitch: Math.atan2(tz - oz, dist),
    lag: 0,
    seed: 3,
  });
  await waitFor(() => me(a).hp < hp0, 3000);
  assert.ok(
    log.some((x) => (x as [string, { kind?: string }])[1].kind === "person"),
    `the shooter told she hit a person: ${JSON.stringify(log)}`,
  );
  const dm = parseDamage(a.state.vehicles.get(vid).dmg);
  const near = side < 0 ? [2, 4] : [3, 5];
  if (!down)
    // (its glass on her side cracked where the round came in — the front window or the one behind it, by where
    // Bia was put)
    assert.ok(
      near.some((i) => dm.parts & PANE_CRACK[i]),
      `a window on her side cracked (${a.state.vehicles.get(vid).dmg})`,
    );
  // (wound down: no glass in her window to crack)
  else
    assert.equal(
      dm.parts & (PANE_CRACK[near[0]] | PANE_GONE[near[0]]),
      0,
      `her open window not cracked (${a.state.vehicles.get(vid).dmg})`,
    );
}

test("(plan 94 P4) a round through a car's window hurts whoever sat behind it; its glass cracked", () =>
  windowShot(16, [61, 62], false));
test("(plan 95 F1a) …through her window wound down: she's hurt, and there was no glass there to crack", () =>
  windowShot(19, [66, 67], true));

test("(plan 94 P1, plan 95 F7a) crashed past its worst it smokes; shot in the engine it burns — at least 10 s however it's shot — then blows: burnt out, Bia near it knocked down and hurt", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 17,
      token: `dev:${uid}:P${uid}:member,builder,admin`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(63);
  const b = await join(64);
  a.send("mod:cars", {});
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...a.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[4];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  a.send("teleport", { to: { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4, level: 0 } });
  await waitFor(() => me(a).level === 0);
  a.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(a).busy === `drive:${vid}` && !!a.state.vehicles.get(vid));
  // its front crashed in, twice (half at most a time): past its worst — smoking
  a.send("car:wear", { grime: 0, dmg: [0.5, 0, 0, 0, 0], parts: 0 });
  await sleep(250);
  a.send("car:wear", { grime: 0, dmg: [0.99, 0, 0, 0, 0], parts: 0 });
  await waitFor(() => parseDamage(a.state.vehicles.get(vid).dmg).fire === FIRE.smoke);
  a.send("car:leave", {});
  await waitFor(() => me(a).busy === "" && !a.state.vehicles.get(vid));
  const dm = () => parseDamage(props(a.state.objects.get(o.id)).dmg);
  assert.equal(dm().fire, FIRE.smoke, "parked, still smoking");
  // Ana well away; Bia 3.5 m ahead of its nose, armed, aiming at its engine low in its front
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const p2: any = parkedPose({
    x: a.state.objects.get(o.id).x,
    y: a.state.objects.get(o.id).y,
    yaw: a.state.objects.get(o.id).yaw,
    props: props(a.state.objects.get(o.id)),
  });
  const spec = SPECS[carKindOf(props(o).model)];
  const fx = Math.cos(p2.a);
  const fy = Math.sin(p2.a);
  a.send("teleport", { to: { x: p2.x - fx * 18, y: p2.y - fy * 18, level: 0 } });
  const stand = { x: p2.x + fx * (spec.body.ahead + 3.5), y: p2.y + fy * (spec.body.ahead + 3.5) };
  b.send("teleport", { to: { ...stand, level: 0 } });
  await waitFor(() => Math.hypot(me(b).x - stand.x, me(b).y - stand.y) < 1.5);
  b.send("dark:hello", {});
  b.send("mod:refill", { kit: true });
  await sleep(400);
  b.send("arms:draw", { slot: 0 });
  await waitFor(() => me(b).gun === "revolver");
  b.send("pos", { x: me(b).x, y: me(b).y, z: me(b).z, yaw: 0, a: 0, seq: 1, mv: packMv("still") | MV_AIM });
  await waitFor(() => (me(b).mv & MV_AIM) !== 0);
  await sleep(600);
  let blasted: { id: string } | null = null;
  b.onMessage("car:blast", (m: { id: string }) => {
    blasted = m;
  });
  const fire = () => {
    const mb = me(b);
    const oz = mb.z + 1.35;
    const t = { x: p2.x + fx * (spec.body.ahead - 0.1), y: p2.y + fy * (spec.body.ahead - 0.1) };
    const tz = heightAt(t.x, t.y) + spec.clearance + 0.3;
    const d = Math.hypot(t.x - mb.x, t.y - mb.y);
    b.send("arms:fire", {
      ox: mb.x,
      oy: mb.y,
      oz,
      yaw: Math.atan2(t.y - mb.y, t.x - mb.x),
      pitch: Math.atan2(tz - oz, d),
      lag: 0,
      seed: 5,
    });
  };
  const hp0 = me(b).hp;
  // two rounds into its engine: alight
  for (let i = 0; i < 2; i++) {
    fire();
    await sleep(700);
  }
  await waitFor(() => dm().fire === FIRE.burning, 3000);
  const caught = Date.now();
  // two more: past its blast's heat — but it burns 10 s first (plan 95 F7a)
  for (let i = 0; i < 2; i++) {
    fire();
    await sleep(700);
  }
  await sleep(1500);
  assert.equal(dm().fire, FIRE.burning, "shot on, still burning a few seconds after it caught");
  assert.equal(blasted, null, "…not blown yet");
  await waitFor(() => dm().fire === FIRE.burnt, 12_000);
  const burnt_s = (Date.now() - caught) / 1000;
  assert.ok(
    burnt_s > 9 && burnt_s < 13,
    `blown ~10 s after it caught, not the 25 s left alone (${burnt_s.toFixed(1)} s)`,
  );
  await waitFor(() => blasted !== null, 2000);
  const burnt = dm();
  assert.ok(
    burnt.parts & PANE_GONE[0] && burnt.wreck,
    `burnt out: its glass gone, its doors off (${props(a.state.objects.get(o.id)).dmg})`,
  );
  assert.ok(me(b).fellAt > 0, "Bia knocked down");
  assert.ok(me(b).hp < hp0, `…and hurt (${me(b).hp})`);
  assert.equal(me(a).fellAt, 0, "Ana, 18 m off, not");
});

test("(plan 94 G3, G4) a boot open is everyone's (its opener's busy), shut when they walk off; ruts pressed reach someone who joins later", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 18,
      token: `dev:${uid}:P${uid}:member,builder,admin`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(65);
  a.send("mod:cars", {});
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...a.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[6];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const spec = SPECS[carKindOf(props(o).model)];
  // behind it: its boot open — busy `boot:<id>`, for every client to lift its lid
  const back = {
    x: pose.x - Math.cos(pose.a) * (spec.body.behind + 0.35),
    y: pose.y - Math.sin(pose.a) * (spec.body.behind + 0.35),
  };
  a.send("teleport", { to: { ...back, level: 0 } });
  await waitFor(() => Math.hypot(me(a).x - back.x, me(a).y - back.y) < 0.6);
  a.send("car:boot", { id: o.id, open: true });
  await waitFor(() => me(a).busy === `boot:${o.id}`);
  // walked off: shut
  a.send("teleport", { to: { x: back.x - Math.cos(pose.a) * 6, y: back.y - Math.sin(pose.a) * 6, level: 0 } });
  await waitFor(() => me(a).busy === "", 4000);
  // driven, its ruts said; someone joining after is told them
  a.send("teleport", { to: { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4, level: 0 } });
  await waitFor(() => Math.hypot(me(a).x - pose.x, me(a).y - pose.y) < 4);
  a.send("car:enter", { id: o.id, seat: 0 });
  await waitFor(() => me(a).busy === `drive:car:${o.id}`);
  const cx = Math.round(pose.x * 100);
  const cz = Math.round(pose.y * 100);
  a.send("car:ruts", { segs: [cx, cz, cx + 150, cz, cx, cz + 120, cx + 150, cz + 120, cx, cz, cx + 9000, cz] });
  await sleep(300);
  const late = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 18,
    token: "dev:66:P66:member",
  });
  rooms.push(late);
  let got: number[] | null = null;
  late.onMessage("car:ruts", (m: { segs: number[] }) => {
    got = m.segs;
  });
  late.onMessage("*", () => {});
  late.send("car:ruts-hello", {});
  await waitFor(() => got !== null, 5000);
  // (the two stretches near it, a step or two long — not the 90 m one)
  assert.deepEqual(got, [cx, cz, cx + 150, cz, cx, cz + 120, cx + 150, cz + 120]);
});

test("(plan 98) in by the passenger's door (said on the wire); out on the move: refused unasked, thrown out asked", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 98,
    token: "dev:98:P98:member,builder,admin",
  });
  rooms.push(r);
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  r.send("mod:cars", {});
  r.send("mod:dark", { mode: "peaceful" });
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...r.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[2];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  r.send("teleport", { to: { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4, level: 0 } });
  await waitFor(() => me(r).level === 0);
  // in at the wheel by the passenger's door: everyone's told
  r.send("car:enter", { id: o.id, seat: 0, via: 1 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(r).busy === `drive:${vid}`);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => r.state.vehicles.get(vid);
  await waitFor(() => v()?.via === 1);
  // on the move at 10 m/s
  const q = headingQuat(v().a);
  const x = v().x;
  const z = v().z;
  r.send("car:state", {
    seq: 1,
    x,
    y: heightAt(x, z) + 0.52,
    z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx: Math.cos(v().a) * 10,
    vy: 0,
    vz: Math.sin(v().a) * 10,
    wy: 0,
    steer: 0,
    rpm: 3000,
    gear: 2,
    fl: 0,
    slip: 0,
    fuel: 40,
  } satisfies CarWire);
  await waitFor(() => Math.hypot(v().vx, v().vz) > 9);
  const no: string[] = [];
  r.onMessage("car:no", (m: { why: string }) => no.push(m.why));
  r.send("car:leave", {});
  await waitFor(() => no.includes("moving"));
  assert.equal(me(r).busy, `drive:${vid}`, "still at the wheel");
  // asked: out, thrown down along its way (past a stumble's pace), unhurt out of a fight
  r.send("car:leave", { jump: true });
  await waitFor(() => me(r).busy === "");
  await waitFor(() => me(r).fellAt > 0);
  assert.equal(me(r).hp, 100, "unhurt: no fight");
});

test("(plan 98 phase 24) a passenger across to the wheel once it's empty: driving it, in by no door", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 99,
      token: `dev:${uid}:P${uid}:member,builder,admin`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(101);
  const b = await join(102);
  a.send("mod:cars", {});
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = [...a.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven)[3];
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  for (const r of [a, b])
    r.send("teleport", { to: { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4, level: 0 } });
  await waitFor(() => me(a).level === 0 && me(b).level === 0);
  const vid = `car:${o.id}`;
  a.send("car:enter", { id: o.id, seat: 0 });
  await waitFor(() => me(a).busy === `drive:${vid}`);
  b.send("car:enter", { id: o.id, seat: 1 });
  await waitFor(() => me(b).busy === `ride:car:${vid}`);
  // the wheel taken: not across
  const no: string[] = [];
  b.onMessage("car:no", (m: { why: string }) => no.push(m.why));
  b.send("car:swap", {});
  await waitFor(() => no.includes("taken"));
  // the driver out: across
  a.send("car:leave", {});
  await waitFor(() => me(a).busy === "");
  b.send("car:swap", {});
  await waitFor(() => me(b).busy === `drive:${vid}`);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v: any = b.state.vehicles.get(vid);
  assert.equal(String(v.seats).split("|")[0], b.sessionId);
  assert.equal(String(v.seats).split("|")[1], "");
  assert.equal(v.via, 1, "from the passenger's seat");
});

test("(plan 98 phase 25) one driver's car into another's: the other's driver told, once for the one crash", async () => {
  const join = async (uid: number) => {
    const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 97,
      token: `dev:${uid}:P${uid}:member,builder,admin`,
    });
    rooms.push(r);
    await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
    return r;
  };
  const a = await join(111);
  const b = await join(112);
  a.send("mod:cars", {});
  await sleep(300);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const cars: any[] = [...a.state.objects.values()].filter((c: any) => c.kind === "car" && !props(c).driven);
  const into = async (r: Room, o: { id: string; x: number; y: number; yaw: number; props: string }) => {
    const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
    r.send("teleport", { to: { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4, level: 0 } });
    await waitFor(() => me(r).level === 0);
    r.send("car:enter", { id: o.id, seat: 0 });
    await waitFor(() => me(r).busy === `drive:car:${o.id}`);
    return `car:${o.id}`;
  };
  const va = await into(a, cars[4]);
  const vb = await into(b, cars[5]);
  const toA: unknown[] = [];
  const toB: { by: string }[] = [];
  a.onMessage("car:struck", (m) => toA.push(m));
  b.onMessage("car:struck", (m: { by: string }) => toB.push(m));
  a.send("car:hit", { other: vb, j: 9000, vx: 6, vz: 0, m: 1280, x: 0, z: 0 });
  await waitFor(() => toB.length === 1);
  assert.equal(toB[0].by, va);
  // (the same crash on b's screen, told back at once: both felt it already)
  b.send("car:hit", { other: va, j: 9000, vx: -6, vz: 0, m: 1280, x: 0, z: 0 });
  await sleep(300);
  assert.equal(toA.length, 0, "not told twice");
});
