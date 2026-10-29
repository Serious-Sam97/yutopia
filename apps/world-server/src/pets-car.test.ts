import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { type CarWire, headingQuat, parkedPose } from "@yutopia/shared/car";
import { heightAt } from "@yutopia/shared/grounds";
import { Client, type Room } from "colyseus.js";

// Pets in the car (docs/plan/51-the-pet.md, phase 2): its owner gets in, it runs to a free door and
// hops in; carried in its seat as the car goes; a person taking its seat moves it; out with its
// owner; its owner gone from the world, out of the car to wait.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26570 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
});
after(async () => {
  const bounded = <T>(p: Promise<T>) => Promise.race([p, sleep(1000)]);
  await Promise.all(rooms.map((r) => bounded(r.leave(true).catch(() => {}))));
  await bounded(server.gracefullyShutdown(false));
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});
async function waitFor(fn: () => boolean, ms = 8000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(25);
  }
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
type S = any;
const me = (r: Room): S => r.state.players.get(r.sessionId);
const OFF = { x: -60, y: -10 };
const props = (o: { props: string }) => JSON.parse(o.props) as Record<string, unknown>;
const join = async (uid: number, sandbox: number) => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder`,
  });
  rooms.push(r);
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  return r;
};

test("a dog and a cat get in with their owner, ride, give a seat up, and get out with her", async () => {
  const a = await join(61, 51);
  const events: string[] = [];
  a.onMessage("pet:event", (m: { kind: string }) => events.push(m.kind));
  for (const t of ["toast", "snap", "spawn:mine", "media:key", "hear"]) a.onMessage(t, () => {});
  a.send("pet:adopt", { species: "dog", name: "Rex" });
  a.send("pet:adopt", { species: "cat", name: "Mia" });
  const mine = (): S[] => [...a.state.pets.values()].filter((p: S) => p.sid === a.sessionId);
  await waitFor(() => mine().length === 2);
  // out to a car in the lot, the pets with her
  const o: S = [...a.state.objects.values()].find((x: S) => x.kind === "car");
  const pose = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
  const door = { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4 };
  a.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(a).level === 0 && Math.hypot(me(a).x - door.x, me(a).y - door.y) < 2.5);
  await waitFor(() => mine().every((p) => p.floor === 0 && Math.hypot(p.x - me(a).x, p.y - me(a).y) < 6));
  a.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(a).busy === `drive:${vid}` && !!a.state.vehicles.get(vid));
  const v = (): S => a.state.vehicles.get(vid);
  // both in: a seat each, never the driver's
  await waitFor(() => mine().every((p) => p.ride === vid), 15_000);
  const seats = mine().map((p) => p.seat);
  assert.ok(seats.every((s) => s >= 1) && seats[0] !== seats[1], `seats ${seats}`);
  assert.equal(events.filter((k) => k === "boarded").length, 2);
  // driven 2 s at 5 m/s: carried in their seats
  let x = v().x;
  let z = v().z;
  const ca = Math.cos(v().a);
  const sa = Math.sin(v().a);
  const q = headingQuat(v().a);
  const wire = (seq: number, sp: number): CarWire => ({
    seq,
    x,
    y: heightAt(x, z) + 0.52,
    z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx: ca * sp,
    vy: 0,
    vz: sa * sp,
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
    a.send("car:state", wire(i, 5));
    await sleep(50);
  }
  a.send("car:state", wire(41, 0));
  await waitFor(() => v().seq === 41);
  await sleep(150);
  for (const p of mine())
    assert.ok(Math.hypot(p.x + OFF.x - x, p.y + OFF.y - z) < 2, `${p.name} carried: ${p.x + OFF.x},${p.y + OFF.y}`);
  // someone takes a pet's seat: it moves to another (one's still free)
  const taken = mine()[0];
  const b = await join(62, 51);
  for (const t of ["toast", "snap", "spawn:mine", "media:key", "hear", "pet:event"]) b.onMessage(t, () => {});
  b.send("teleport", { to: { x: x - OFF.x + Math.sin(v().a) * 2, y: z - OFF.y - Math.cos(v().a) * 2, level: 0 } });
  await waitFor(() => me(b).level === 0);
  const want = taken.seat;
  b.send("car:enter", { id: vid, seat: want });
  await waitFor(() => me(b).busy === `ride:car:${vid}`);
  await waitFor(() => taken.seat !== want && taken.ride === vid);
  assert.ok(taken.seat >= 1 && taken.seat !== mine()[1].seat);
  // she gets out: so do they, by the car, following her
  a.send("car:leave", {});
  await waitFor(() => !me(a).busy);
  await waitFor(() => mine().every((p) => p.ride === "" && p.mode === "follow"));
  for (const p of mine()) assert.ok(Math.hypot(p.x + OFF.x - x, p.y + OFF.y - z) < 5, `${p.name} out by the car`);
  // back in, they with her; then she leaves the world: out of the car, waiting there
  a.send("car:enter", { id: vid, seat: 0 });
  await waitFor(() => mine().filter((p) => p.ride === vid).length >= 1, 15_000);
  const ids = mine().map((p) => p.id);
  rooms.splice(rooms.indexOf(a), 1);
  await a.leave(true);
  const theirs = () => ids.map((id) => b.state.pets.get(id) as S);
  await waitFor(() => theirs().every((p) => p && p.sid === "" && p.ride === ""));
  assert.ok(theirs().every((p) => p.mode === "wait"));
});
