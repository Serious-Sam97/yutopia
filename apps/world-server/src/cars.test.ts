import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { type CarWire, headingQuat, parkedPose } from "@yutopia/shared/car";
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
  // a state no car could get to: put back
  let snapped = false;
  a.onMessage("car:snap", () => {
    snapped = true;
  });
  a.send("car:state", wire(41, 80));
  await waitFor(() => snapped);
  assert.ok(Math.hypot(v().x - x, v().z - z) < 0.01, "not believed");
  // stopped, both out: it parks where it is, at its heading
  a.send("car:state", { ...wire(42), vx: 0, vz: 0 });
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
  // the lot put back (an admin's)
  a.send("mod:cars", {});
  await waitFor(() => typeof props(a.state.objects.get(o.id)).a !== "number");
});
