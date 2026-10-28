import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { type CarWire, HOME_CARS, headingQuat, parkedPose } from "@yutopia/shared/car";
import { heightAt } from "@yutopia/shared/grounds";
import { Client, type Room } from "colyseus.js";

// The lot's cars, driven (docs/plan/28-the-car.md, phase 3): into the
// driver's seat, a passenger beside, the driver's states believed (and a jump
// not), out, parked where it stopped, the lot put back.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26070 + Math.floor(Math.random() * 100);
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
const OFF = { x: -60, y: -10 };
const props = (o: { props: string }) => JSON.parse(o.props) as Record<string, unknown>;

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
  const pose = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
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
  const poseOf = (c: { x: number; y: number; rot: number; props: string }) =>
    parkedPose({ x: c.x, y: c.y, rot: c.rot, props: props(c) });
  others.sort((p, q) => {
    const d = (c: typeof p) => Math.hypot(poseOf(c).x + OFF.x - v().x, poseOf(c).y + OFF.y - v().z);
    return d(p) - d(q);
  });
  const hit = others[0];
  const before = poseOf(hit);
  const to = { x: before.x + OFF.x + 0.8, z: before.y + OFF.y + 0.3, a: before.a + 0.2 };
  if (Math.hypot(to.x - v().x, to.z - v().z) < 12) {
    a.send("car:shove", { id: hit.id, ...to });
    await waitFor(() => Math.abs(poseOf(a.state.objects.get(hit.id)).x + OFF.x - to.x) < 0.05);
    const after = poseOf(a.state.objects.get(hit.id));
    assert.ok(
      Math.abs(after.y + OFF.y - to.z) < 0.05 &&
        Math.abs(Math.atan2(Math.sin(after.a - to.a), Math.cos(after.a - to.a))) < 0.01,
      "shoved where it stopped",
    );
    await sleep(300);
    a.send("car:shove", { id: hit.id, x: to.x + 40, z: to.z, a: to.a });
    await sleep(300);
    assert.ok(Math.abs(poseOf(a.state.objects.get(hit.id)).x + OFF.x - to.x) < 0.05, "a knock can't send it 40 m");
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
  });
  for (let i = 1; i <= 40; i++) {
    x += ca * 0.25;
    z += sa * 0.25;
    a.send("car:state", wire(i));
    await sleep(50);
  }
  await waitFor(() => v().seq === 40);
  assert.ok(Math.hypot(v().x - x, v().z - z) < 0.01, "it is where the driver says");
  assert.ok(Math.abs(me(a).x + OFF.x - x) < 2.5, "the driver is carried in it");
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
  const pp = parkedPose({ x: parked.x, y: parked.y, rot: parked.rot, props: props(parked) });
  assert.ok(
    Math.hypot(pp.x + OFF.x - x, pp.y + OFF.y - z) < 0.2,
    `parked where it stopped: ${pp.x + OFF.x} ${pp.y + OFF.y} vs ${x} ${z}`,
  );
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
  const pose = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
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
  assert.equal(p.dmg, "0.2,0,0,0.5");
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
  const pose = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
  const door = { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4 };
  r.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(r).level === 0);
  r.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(r).busy === `drive:${vid}`);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => r.state.vehicles.get(vid);
  const from = { x: v().x, z: v().z };
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
    return parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
  };
  // where they live, with their roles
  for (const id of ["farm-pickup", "town-car-3", "gas-rental"]) {
    const p = poseOf(id);
    assert.ok(Math.hypot(p.x + OFF.x - home(id).x, p.y + OFF.y - home(id).z) < 0.05, `${id} at home`);
  }
  assert.equal(props(a.state.objects.get("town-car-3")).role, "police");
  assert.equal(props(a.state.objects.get("farm-pickup")).model, "pickup");
  // into the pickup: the driver in the cab, someone in the bed (higher, further back)
  await a.send("mod:cars", {});
  await sleep(300);
  const p0 = poseOf("farm-pickup");
  const door = { x: p0.x - Math.sin(p0.a) * 2.2, y: p0.y + Math.cos(p0.a) * 2.2 };
  for (const r of [a, b]) {
    r.send("teleport", { to: { x: 30, y: 20, level: 0 } });
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
  assert.ok(
    Math.hypot(moved.x + OFF.x - home("farm-pickup").x, moved.y + OFF.y - home("farm-pickup").z) > 4,
    "left where it stopped",
  );
  a.send("mod:cars", {});
  await waitFor(() => {
    const p = poseOf("farm-pickup");
    return Math.hypot(p.x + OFF.x - home("farm-pickup").x, p.y + OFF.y - home("farm-pickup").z) < 0.05;
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
  const p = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
  assert.equal(props(o).model, "snowmobile");
  const by = { x: p.x, y: p.y + 1.6 };
  for (const r of [a, b]) {
    r.send("teleport", { to: { x: 30, y: 20, level: 0 } });
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
