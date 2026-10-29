import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { type CarWire, headingQuat, parkedPose } from "@yutopia/shared/car";
import { heightAt } from "@yutopia/shared/grounds";
import { LOST } from "@yutopia/shared/pets";
import { Client, type Room } from "colyseus.js";

// Lost and found (docs/plan/51-the-pet.md, phase 3): left behind by its owner's car it's lost; it
// wanders, isn't heard from far, is seen by a friend (its owner told) and follows them, and is found
// by its owner near. The dangers, lost only: hunger and thirst at the full rate, the cold at night out
// of the lamps, a car's hit (twice kills), the wild (gone for good). Kept lost through a restart.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26870 + Math.floor(Math.random() * 100);
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
interface Who {
  room: Room;
  events: string[];
  toasts: string[];
}
const me = (w: Who): S => w.room.state.players.get(w.room.sessionId);
const OFF = { x: -60, y: -10 }; // the Grounds' metres = the ground floor's tiles + this
const tile = (x: number, z: number) => ({ x: x - OFF.x, y: z - OFF.y });
const OPEN = tile(-148, -4); // open ground, no lamp near, no trees
const DEEP = tile(-268, -184); // the deep woods
const props = (o: { props: string }) => JSON.parse(o.props) as Record<string, unknown>;
async function join(uid: number, sandbox: number): Promise<Who> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const w: Who = { room, events: [], toasts: [] };
  room.onMessage("pet:event", (m: { kind: string }) => w.events.push(m.kind));
  room.onMessage("toast", (m: { text: string }) => w.toasts.push(m.text));
  for (const t of ["snap", "spawn:mine", "media:key", "hear", "car:no", "pet:challenge"]) room.onMessage(t, () => {});
  await waitFor(() => !!room.state.players?.get(room.sessionId) && room.state.objects?.size > 0);
  return w;
}
const adopt = async (w: Who, species: string, name: string): Promise<S> => {
  w.room.send("pet:adopt", { species, name });
  await waitFor(() => [...w.room.state.pets.values()].some((p: S) => p.sid === w.room.sessionId && p.name === name));
  return [...w.room.state.pets.values()].find((p: S) => p.sid === w.room.sessionId && p.name === name);
};
const hour = async (w: Who, h: number) => {
  w.room.send("mod:hour", { h });
  await waitFor(() => Math.abs(w.room.state.hour - h) < 0.01);
};
/** In a lot car, driving: a state at (x, z) metres going `sp` m/s along its heading. */
async function inACar(w: Who) {
  const o: S = [...w.room.state.objects.values()].find((x: S) => x.kind === "car" && !props(x).driven);
  const pose = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
  w.room.send("teleport", { to: { x: pose.x + Math.cos(pose.a) * 3.4, y: pose.y + Math.sin(pose.a) * 3.4, level: 0 } });
  await waitFor(() => me(w).level === 0);
  w.room.send("car:enter", { id: o.id, seat: 0 });
  const vid = `car:${o.id}`;
  await waitFor(() => me(w).busy === `drive:${vid}`);
  let seq = 0;
  const a = (w.room.state.vehicles.get(vid) as S).a as number;
  const q = headingQuat(a);
  const at = (x: number, z: number, sp: number) => {
    const wire: CarWire = {
      seq: ++seq,
      x,
      y: heightAt(x, z) + 0.52,
      z,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
      vx: Math.cos(a) * sp,
      vy: 0,
      vz: Math.sin(a) * sp,
      wy: 0,
      steer: 0,
      rpm: 2200,
      gear: 1,
      fl: 1024,
      slip: 0,
      fuel: 40,
    };
    w.room.send("car:state", wire);
  };
  return { vid, a, at, v: (): S => w.room.state.vehicles.get(vid) };
}

test("left behind by the car: lost; not heard from far; seen and followed by a friend; found by its owner", async () => {
  const ana = await join(71, 61);
  const rex = await adopt(ana, "dog", "Rex");
  // out to the lot with her, told to stay; she gets in a car and drives off (10 m/s, on and on)
  const car = await inACar(ana);
  ana.room.send("pet:cmd", { id: rex.id, cmd: "stay" });
  await waitFor(() => rex.mode === "stay");
  // (it came down to the lot with her)
  await waitFor(() => rex.floor === 0);
  let x = car.v().x as number;
  let z = car.v().z as number;
  let driving = true;
  const drive = (async () => {
    while (driving) {
      x += Math.cos(car.a);
      z += Math.sin(car.a);
      car.at(x, z, 10);
      await sleep(100);
    }
    car.at(x, z, 0);
  })();
  await waitFor(() => Math.hypot(rex.x + OFF.x - x, rex.y + OFF.y - z) > LOST.far + 10, 15_000);
  // called to follow now, far behind: it runs after the car — and is lost
  ana.room.send("pet:cmd", { id: rex.id, cmd: "follow" });
  await waitFor(() => rex.mode === "follow");
  await waitFor(() => ana.toasts.some((t) => /You drove off without Rex/.test(t)), 3000);
  await waitFor(() => rex.mode === "lost", LOST.ms + 5000);
  driving = false;
  await drive;
  assert.ok(ana.events.includes("astray"));
  const seen = JSON.parse(rex.seen);
  assert.ok(seen.lost && seen.where && Number.isFinite(seen.x), `seen ${rex.seen}`);
  // from the car, 80 m off: "come" isn't heard
  ana.room.send("pet:cmd", { id: rex.id, cmd: "come" });
  await waitFor(() => ana.events.includes("unheard"));
  assert.equal(rex.mode, "lost");
  // a friend it knows comes by: seen (Ana told), and it follows her
  const bia = await join(72, 61);
  ana.room.send("pet:test", { id: rex.id, bonds: { "72": 60 } });
  bia.room.send("teleport", { to: { x: rex.x + 2, y: rex.y, level: rex.floor } });
  await waitFor(() => ana.toasts.some((t) => /P72 saw Rex/.test(t)));
  await waitFor(() => JSON.parse(rex.seen).by === "P72");
  bia.room.send("teleport", { to: { x: rex.x + 6, y: rex.y + 1, level: rex.floor } });
  await waitFor(() => Math.hypot(rex.x - me(bia).x, rex.y - me(bia).y) < 3, 10_000);
  assert.equal(rex.mode, "lost");
  // Ana out of the car and over to them: found
  await sleep(200);
  ana.room.send("car:leave", {});
  await waitFor(() => !me(ana).busy);
  ana.room.send("teleport", { to: { x: rex.x + 1.5, y: rex.y, level: rex.floor } });
  await waitFor(() => rex.mode === "follow");
  assert.ok(ana.events.includes("found"));
  assert.equal(rex.seen, "");
  ana.room.send("pet:release", { id: rex.id });
});

test("the dangers, lost only: hunger and thirst, the cold at night, a car's hit, the wild", async () => {
  const ana = await join(73, 62);
  const cai = await join(74, 62);
  await hour(ana, 12);
  // Cai's dog left waiting out on the open ground, Cai gone
  const kept = await adopt(cai, "dog", "Kept");
  cai.room.send("pet:cmd", { id: kept.id, cmd: "stay" });
  cai.room.send("pet:test", { id: kept.id, at: OPEN });
  await waitFor(() => kept.mode === "stay" && Math.hypot(kept.x - OPEN.x, kept.y - OPEN.y) < 0.5);
  rooms.splice(rooms.indexOf(cai.room), 1);
  await cai.room.leave(true);
  const k = (): S => ana.room.state.pets.get(kept.id);
  await waitFor(() => k()?.sid === "");
  // hunger and thirst: 40 hours lost, at the full rate — dead; 40 hours waiting (slowly) — not
  const lost = await adopt(ana, "dog", "Lost");
  ana.room.send("pet:test", { id: lost.id, at: OPEN, lose: true });
  await waitFor(() => lost.mode === "lost");
  ana.room.send("pet:test", { id: lost.id, hours: 40 });
  await waitFor(() => ana.events.includes("died"));
  await waitFor(() => !lost.alive);
  ana.room.send("pet:test", { id: kept.id, hours: 40 });
  await sleep(300);
  assert.equal(k().alive, true);
  ana.room.send("pet:release", { id: lost.id });
  ana.room.send("pet:test", { id: kept.id, needs: { food: 100, water: 100, health: 100 } });
  // the cold: two hours out at night — lost, out of the lamps: hurt; waiting there: not
  await hour(ana, 23);
  const cold = await adopt(ana, "cat", "Cold");
  ana.room.send("pet:test", { id: cold.id, at: OPEN, lose: true });
  await waitFor(() => cold.mode === "lost");
  ana.room.send("pet:test", { id: cold.id, at: OPEN, hours: 2 });
  await waitFor(() => cold.health < 100);
  assert.ok(cold.health <= 100 - LOST.cold * 2 + 1, `cold ${cold.health}`);
  ana.room.send("pet:test", { id: kept.id, hours: 2 });
  await sleep(300);
  assert.equal(k().health, 100);
  // a car's hit: lost, badly hurt; again, dead. Not lost: only knocked aside
  await hour(ana, 12);
  const car = await inACar(ana);
  const hit = async (pet: S) => {
    const m = { x: pet.x + OFF.x, z: pet.y + OFF.y };
    car.at(m.x, m.z, 6);
    await waitFor(() => Math.abs((car.v().x as number) - m.x) < 0.01);
    ana.room.send("pet:hit", { id: pet.id });
  };
  const h0 = cold.health;
  await hit(cold);
  await waitFor(() => cold.health <= h0 - LOST.car);
  assert.equal(cold.alive, true);
  const kh = k().health;
  await hit(k());
  await sleep(300);
  assert.equal(k().health, kh);
  assert.equal(k().alive, true);
  await sleep(4200);
  await hit(cold);
  await waitFor(() => ana.events.includes("died_car"));
  await waitFor(() => !cold.alive);
  ana.room.send("pet:release", { id: cold.id });
  car.at(car.v().x, car.v().z, 0);
  await sleep(200);
  ana.room.send("car:leave", {});
  await waitFor(() => !me(ana).busy);
  // the wild: lost in the deep woods — gone for good (offline the chance always comes up)
  const wild = await adopt(ana, "rabbit", "Wild");
  ana.room.send("pet:test", { id: wild.id, at: DEEP, lose: true });
  await waitFor(() => wild.mode === "lost");
  ana.room.send("pet:test", { id: wild.id, at: DEEP, hours: 0.5 });
  await waitFor(() => ana.events.includes("gone"));
  await waitFor(() => !ana.room.state.pets.has(wild.id));
});

test("lost through a restart: back lost, its last sighting kept", async () => {
  const ana = await join(75, 63);
  const mia = await adopt(ana, "cat", "Mia");
  ana.room.send("pet:test", { id: mia.id, at: OPEN, lose: true });
  await waitFor(() => mia.mode === "lost");
  const seen = JSON.parse(mia.seen);
  rooms.splice(rooms.indexOf(ana.room), 1);
  await ana.room.leave(true);
  await sleep(600);
  const back = await join(75, 63);
  await waitFor(() => [...back.room.state.pets.values()].some((p: S) => p.name === "Mia"));
  const again: S = [...back.room.state.pets.values()].find((p: S) => p.name === "Mia");
  assert.equal(again.mode, "lost");
  assert.equal(JSON.parse(again.seen).where, seen.where);
  back.room.send("pet:release", { id: again.id });
});
