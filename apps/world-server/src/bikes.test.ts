import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { RACKS } from "@yutopia/shared/bike";
import { type CarWire, HOME_CARS, headingQuat, parkedPose } from "@yutopia/shared/car";
import { heightAt } from "@yutopia/shared/grounds";
import { Client, type Room } from "colyseus.js";

// The bicycles on the server (docs/plan/101-the-bicycles.md): the town's racks and their bikes; a bike ridden off on
// someone's say; thrown off it, at any speed, on the ragdoll (it rolls on from their client); left on its side, parked
// lying there; ridden by an admin's spawn.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 30900 + Math.floor(Math.random() * 100);
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
async function waitFor(fn: () => boolean, ms = 8000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);
const props = (o: { props: string }) => JSON.parse(o.props) as Record<string, unknown>;

test("the racks and their bikes; ridden, thrown off slowly, and left lying on its side", async () => {
  const a = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9,
    token: "dev:51:P51:member,builder",
  });
  rooms.push(a);
  await waitFor(() => a.state.players?.size > 0 && a.state.objects?.size > 0);
  // the racks (the drawn ones) and every rack's bikes, home
  await waitFor(() => HOME_CARS.filter((h) => h.id.startsWith("rack-")).every((h) => !!a.state.objects.get(h.id)));
  for (const r of RACKS) {
    const o = a.state.objects.get(r.id);
    if (r.bare) assert.equal(o, undefined, `${r.id}: no rack drawn`);
    else assert.equal(o?.kind, "bike_rack", `${r.id}: a rack`);
  }
  const id = "rack-square-0";
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const o: any = a.state.objects.get(id);
  assert.equal(props(o).model, "bike_town");
  assert.equal((props(o).look as { variant: string }).variant, "town-classic");
  // on it
  const pose = parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });
  const by = { x: pose.x - Math.sin(pose.a) * 0.9, y: pose.y + Math.cos(pose.a) * 0.9 };
  a.send("teleport", { to: { ...by, level: 0 } });
  await waitFor(() => me(a).level === 0 && Math.hypot(me(a).x - by.x, me(a).y - by.y) < 2.5);
  a.send("car:enter", { id, seat: 0 });
  const vid = `car:${id}`;
  await waitFor(() => me(a).busy === `drive:${vid}` && !!a.state.vehicles.get(vid));
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const v = (): any => a.state.vehicles.get(vid);
  assert.equal(v().kind, "bike_town");
  // ridden 1.5 m/s (slow: getting off at that speed is a step off, but a fall's a fall)
  let x = v().x;
  const z = v().z;
  const q = headingQuat(v().a);
  const wire = (seq: number, quat = q, vx = 1.5): CarWire => ({
    seq,
    x,
    y: heightAt(x, z) + 1.0,
    z,
    qx: quat.x,
    qy: quat.y,
    qz: quat.z,
    qw: quat.w,
    vx,
    vy: 0,
    vz: 0,
    wy: 0,
    steer: 0,
    rpm: 70,
    gear: 1,
    fl: 0,
    slip: 0,
    fuel: 1,
    st: seq * 50 + 1,
  });
  for (let i = 1; i <= 6; i++) {
    x += 0.075;
    a.send("car:state", wire(i));
    await sleep(55);
  }
  let thrown = false;
  a.onMessage("car:thrown", () => {
    thrown = true;
  });
  a.send("car:leave", { jump: true, fall: true });
  await waitFor(() => me(a).busy === "");
  await waitFor(() => thrown, 3000);
  assert.ok(Number(me(a).fellAt) > 0, "on the ragdoll");
  // it rolls on from my client (I'm its coaster), comes to rest on its left side; parked lying there
  const side = { x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) };
  // (its heading kept, turned about its own forward axis a quarter round: on its side)
  const lying = {
    x: q.w * side.x + q.x * side.w + q.y * side.z - q.z * side.y,
    y: q.w * side.y - q.x * side.z + q.y * side.w + q.z * side.x,
    z: q.w * side.z + q.x * side.y - q.y * side.x + q.z * side.w,
    w: q.w * side.w - q.x * side.x - q.y * side.y - q.z * side.z,
  };
  a.send("car:state", { ...wire(7, lying, 0), y: heightAt(x, z) + 0.2 });
  await waitFor(() => !a.state.vehicles.get(vid), 12_000);
  const parked = a.state.objects.get(id);
  assert.ok(Number(props(parked).down) !== 0 && props(parked).down !== undefined, `lying: ${props(parked).down}`);
  assert.ok(!props(parked).driven);
});
