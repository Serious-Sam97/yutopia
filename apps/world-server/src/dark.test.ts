import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { HQ_DOORS, inLampPool, LAMP_POOL_R, SHADE, SHADE_STATES } from "@yutopia/shared/dark";
import { BENCH, heightAt, LAMPS } from "@yutopia/shared/grounds";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// The shadowed (docs/plan/30-the-dark.md, phase 4): out of the dark 25–45 tiles
// off, never in a pool or by the HQ (by day they wait in nests: nests.test.ts); a strike lands on someone standing there,
// and a roll through the windup gets out of it; a focused beam burns the shield
// off (exposed); nobody comes into a lamp's pool; the dawn takes them; whoever
// is within 70 tiles sees them, indoors too (through the windows), but only
// those outside are struck.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_DARK_FAST = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26670 + Math.floor(Math.random() * 100);
const OFF = { x: -60, y: -10 }; // the ground floor's corner in the building's coords
const POND = { x: -250, z: -60 }; // open ice, far from the lamps and the HQ
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
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const shadows = (room: Room): any[] => [...(room.state.shadows?.values() ?? [])];
const code = (s: (typeof SHADE_STATES)[number]) => SHADE_STATES.indexOf(s);

async function person(uid: number, sandbox: number, hits: { n: number }[] = []) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  room.onMessage("dark:hit", (m: { n: number }) => hits.push(m));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  return room;
}
// on the land at (bx, bz), the building's coords; feet on the ground (so a roll may start)
async function standAt(room: Room, bx: number, bz: number, mv = 0, yaw = 0) {
  const to = { x: bx - OFF.x, y: bz - OFF.y };
  if (Math.hypot(me(room).x - to.x, me(room).y - to.y) > 0.5) {
    room.send("teleport", { to: { ...to, level: 0 } });
    await waitFor(() => me(room).level === 0 && Math.hypot(me(room).x - to.x, me(room).y - to.y) < 0.5);
  }
  room.send("pos", { ...to, z: heightAt(bx, bz), d: 2, a: 0, seq: 0, mv, yaw });
}
const hour = async (room: Room, h: number) => {
  room.send("mod:hour", { h });
  // (and no blizzard: in one the director sends stragglers even by day)
  room.send("mod:storm", { storm: 0, now: true });
  await waitFor(() => Math.abs(room.state.hour - h) < 0.01 && room.state.storm < 0.05);
};

test("out of the dark: 25–45 tiles off, emerging, never in a pool or by the HQ; only those near see them", async () => {
  const a = await person(501, 51);
  const far = await person(502, 51);
  await hour(a, 23);
  await standAt(a, POND.x, POND.z);
  await waitFor(() => shadows(a).length >= 3, 10_000);
  const here = { x: me(a).x, y: me(a).y };
  for (const s of shadows(a)) {
    const d = Math.hypot(s.x - here.x, s.y - here.y);
    assert.ok(d > 20 && d < 47, `out of the dark at ${d.toFixed(1)}`);
    const b = { x: s.x + OFF.x, z: s.y + OFF.y };
    assert.equal(inLampPool(b.x, b.z), false, "never in a pool");
    assert.ok(Math.hypot(b.x - HQ_DOORS.x, b.z - HQ_DOORS.z) > 40, "never by the HQ");
  }
  assert.ok(
    shadows(a).some((s) => s.s === code("emerge")),
    "they come out of the dark first",
  );
  // the one in the studio, far over 70 tiles off, sees none of them
  assert.equal(shadows(far).length, 0);
});

test("those indoors see them through the windows, and are never struck", async () => {
  const hits: { n: number }[] = [];
  const lobbyHits: { n: number }[] = [];
  const studioHits: { n: number }[] = [];
  const a = await person(591, 59, hits);
  const lobby = await person(592, 59, lobbyHits);
  const studio = await person(593, 59, studioHits);
  await hour(a, 23);
  a.send("mod:dark", { mode: "called" });
  const stand = async (room: Room, x: number, y: number, level: number) => {
    room.send("teleport", { to: { x, y, level } });
    await waitFor(() => me(room).level === level && Math.hypot(me(room).x - x, me(room).y - y) < 1.5);
  };
  // in the lobby by its east wall (the ground floor's coords), and up in the studio (level 4: its
  // own, its corner the building's — some 50 tiles off over the ground)
  await stand(lobby, 105.5, 28.5, 0);
  await stand(studio, 10.5, 22.5, 4);
  // A out on the snow east of the HQ; one called up 8–14 tiles off
  await standAt(a, 60, 18);
  a.send("mod:dark", { spawn: 1 });
  await waitFor(() => shadows(a).length === 1, 4000);
  const id = shadows(a)[0].id;
  await waitFor(() => shadows(lobby).length === 1 && shadows(studio).length === 1, 2000);
  assert.equal(shadows(lobby)[0].id, id);
  assert.equal(shadows(studio)[0].id, id);
  // indoors nobody calls one up: they're no prey
  lobby.send("mod:dark", { spawn: 1 });
  await sleep(600);
  assert.equal(shadows(a).length, 1, "none called up indoors");
  // it comes for the one outside; those indoors are never struck
  await waitFor(() => hits.length >= 1, 15_000);
  assert.equal(lobbyHits.length + studioHits.length, 0, "indoors: never struck");
  assert.equal(me(lobby).hp, 100);
  assert.equal(me(studio).hp, 100);
});

test("a strike lands on someone standing there (15); rolled through, it misses", async () => {
  const hits: { n: number }[] = [];
  const a = await person(511, 52, hits);
  // the director off (out on the ice even the day sends some): one called up, to fight
  await hour(a, 12);
  a.send("mod:dark", { mode: "called" });
  await standAt(a, POND.x, POND.z);
  a.send("mod:dark", { spawn: 1 });
  await waitFor(() => shadows(a).length === 1, 4000);
  // the first rush: stand there and take it
  await waitFor(() => shadows(a)[0]?.s === code("windup"), 15_000);
  await waitFor(() => hits.length === 1, 2000);
  assert.equal(hits[0].n, SHADE.strikeDamage);
  await waitFor(() => me(a).hp === 100 - SHADE.strikeDamage);
  // the next: roll as it swings (0.55 s into its 0.8 s windup: the strike lands in the roll's first 350 ms)
  await waitFor(() => shadows(a)[0]?.s === code("recover"), 2000);
  await waitFor(() => shadows(a)[0]?.s === code("windup"), 15_000);
  await sleep(550);
  a.send("jump", { k: "roll" });
  await waitFor(() => shadows(a)[0]?.s === code("recover"), 2000);
  await sleep(200);
  assert.equal(hits.length, 1, "rolled through: missed");
  assert.ok(me(a).hp >= 100 - SHADE.strikeDamage);
});

test("a focused beam burns its shield off: exposed", async () => {
  const a = await person(521, 53);
  await hour(a, 12);
  a.send("mod:dark", { mode: "called" });
  await standAt(a, POND.x, POND.z);
  a.send("mod:dark", { spawn: 1 });
  await waitFor(() => shadows(a).length === 1, 4000);
  a.send("phone:torch", { on: true });
  // aim at it, wherever it goes
  const aimAt = () => {
    const s = shadows(a)[0];
    if (!s) return;
    // (aiming, the body's bladed: its facing AIM_BLADE right of the look — shared beam.ts)
    const yaw = yawToByte(Math.atan2(s.y - me(a).y, s.x - me(a).x) + AIM_BLADE);
    a.send("pos", {
      x: me(a).x,
      y: me(a).y,
      z: heightAt(POND.x, POND.z),
      d: 2,
      a: 0,
      seq: 0,
      mv: packMv("still") | MV_AIM,
      yaw,
      pitch: 0,
    });
  };
  const timer = setInterval(aimAt, 50);
  try {
    await waitFor(() => shadows(a)[0]?.s === code("burning") || shadows(a)[0]?.sh < 100, 8000);
    await waitFor(() => shadows(a)[0]?.s === code("exposed"), 8000);
    assert.equal(shadows(a)[0].sh, 0);
  } finally {
    clearInterval(timer);
    a.send("phone:torch", { on: false });
  }
});

test("nobody comes into a lamp's pool, nor strikes whoever stands in it", async () => {
  const hits: { n: number }[] = [];
  const a = await person(531, 54, hits);
  await hour(a, 23);
  // the clearing's lone lamp, by the bench
  const lamp = LAMPS.find((l) => l.kind === "lone" && Math.hypot(l.x - BENCH.x, l.z - BENCH.z) < 4);
  assert.ok(lamp);
  await standAt(a, lamp.x + 2, lamp.z);
  a.send("mod:dark", { mode: "normal", spawn: 4 });
  const R = LAMP_POOL_R[lamp.kind];
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    for (const s of shadows(a)) {
      const d = Math.hypot(s.x + OFF.x - lamp.x, s.y + OFF.y - lamp.z);
      assert.ok(d >= R - 0.2, `one in the pool, ${d.toFixed(2)} from the lamp`);
    }
    await sleep(100);
  }
  assert.ok(shadows(a).length > 0, "they're out there");
  assert.equal(hits.length, 0, "and nobody struck me");
});

test("the dawn takes them", async () => {
  const a = await person(541, 55);
  await hour(a, 23);
  await standAt(a, POND.x, POND.z);
  await waitFor(() => shadows(a).length >= 2, 10_000);
  await hour(a, 6);
  await waitFor(() => shadows(a).length === 0, 8000);
  // and an admin's peaceful keeps them away at night
  await hour(a, 23);
  a.send("mod:dark", { mode: "peaceful" });
  await sleep(2000);
  assert.equal(shadows(a).length, 0);
  a.send("mod:dark", { mode: "normal" });
});

test("the ones an admin calls up stay through the dawn (to try the fight at any hour)", async () => {
  const a = await person(542, 56);
  await hour(a, 6);
  await standAt(a, POND.x, POND.z);
  a.send("mod:dark", { mode: "called", spawn: 2 });
  await waitFor(() => shadows(a).length === 2, 4000);
  // (the dawn would have them fleeing and gone by now)
  await sleep(3000);
  assert.equal(shadows(a).length, 2, "still out at 6:00");
  for (const s of shadows(a)) assert.notEqual(s.s, code("flee"));
  // and the dark switched off sends even them away
  a.send("mod:dark", { mode: "peaceful" });
  await waitFor(() => shadows(a).length === 0, 3000);
  a.send("mod:dark", { mode: "normal" });
});
