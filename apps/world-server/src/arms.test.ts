import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { ARMS, FLARE, SHADE_STATES } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import type { Inventory } from "@yutopia/shared/inventory";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// Guns and flares (docs/plan/30-the-dark.md, phase 5): A exposes one with a
// focused torch, B shoots it down; an honest late shot (at where B saw it a
// moment ago) counts, a ray from somewhere B isn't doesn't; a shielded one
// throws a spark; a reload is a round at a time out of the pockets; a flare
// thrown lands ahead, lit, and keeps them out.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_DARK_FAST = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26770 + Math.floor(Math.random() * 100);
const OFF = { x: -60, y: -10 };
const POND = { x: -250, z: -60 };
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
const shadows = (p: { room: Room }): any[] => [...(p.room.state.shadows?.values() ?? [])];
const code = (s: (typeof SHADE_STATES)[number]) => SHADE_STATES.indexOf(s);

interface Person {
  room: Room;
  inv: Inventory | null;
  hits: { id: string; kind: string }[];
  // where it saw each shadowed, and when (its own clock)
  seen: Map<string, { t: number; x: number; y: number }[]>;
}
async function person(uid: number, sandbox: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, hits: [], seen: new Map() };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("arms:hit", (m: { id: string; kind: string }) => who.hits.push(m));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  const rec = setInterval(() => {
    for (const s of shadows(who)) {
      const l = who.seen.get(s.id) ?? [];
      l.push({ t: Date.now(), x: s.x, y: s.y });
      if (l.length > 100) l.shift();
      who.seen.set(s.id, l);
    }
  }, 20);
  after(() => clearInterval(rec));
  return who;
}
const at = (bx: number, bz: number) => ({ x: bx - OFF.x, y: bz - OFF.y });
async function standAt(p: Person, bx: number, bz: number) {
  const to = at(bx, bz);
  p.room.send("teleport", { to: { ...to, level: 0 } });
  await waitFor(() => me(p.room).level === 0 && Math.hypot(me(p.room).x - to.x, me(p.room).y - to.y) < 0.5);
}
// stand still aiming at (x, y) (the floor's coords): the body faces it, the aim bit on
function aim(p: Person, x: number, y: number) {
  const m = me(p.room);
  const yaw = Math.atan2(y - m.y, x - m.x);
  p.room.send("pos", {
    x: m.x,
    y: m.y,
    z: heightAt(m.x + OFF.x, m.y + OFF.y),
    d: 2,
    a: 0,
    seq: 0,
    mv: packMv("still") | MV_AIM,
    yaw: yawToByte(yaw),
    pitch: 0,
  });
  return yaw;
}
// a shot from my hand at (x, y), as the client sends it
function fire(p: Person, x: number, y: number, lag = 0, from?: { x: number; y: number }) {
  const m = me(p.room);
  const o = from ?? { x: m.x, y: m.y };
  const oz = heightAt(m.x + OFF.x, m.y + OFF.y) + 1.35;
  const yaw = Math.atan2(y - o.y, x - o.x);
  const d = Math.hypot(x - o.x, y - o.y);
  // (down at its chest)
  const pitch = Math.atan2(heightAt(x + OFF.x, y + OFF.y) + 1 - oz, d);
  p.room.send("arms:fire", { ox: o.x, oy: o.y, oz, yaw, pitch, lag, seed: 7 });
}
const setup = async (sandbox: number) => {
  const a = await person(600 + sandbox * 2, sandbox);
  const b = await person(601 + sandbox * 2, sandbox);
  a.room.send("mod:hour", { h: 12 });
  a.room.send("mod:dark", { mode: "called" }); // (the director off: only the ones called up)
  a.room.send("mod:storm", { storm: 0, now: true });
  await waitFor(() => Math.abs(a.room.state.hour - 12) < 0.01 && a.room.state.storm < 0.05);
  await standAt(a, POND.x, POND.z);
  await standAt(b, POND.x, POND.z + 3);
  // B armed: both guns loaded, rounds in the pockets
  b.room.send("mod:refill", { kit: true });
  await waitFor(() => b.inv?.weapons[0]?.id === "revolver");
  b.room.send("arms:draw", { slot: 0 });
  await waitFor(() => me(b.room).gun === "revolver");
  return { a, b };
};

test("A exposes it, B shoots it down: a shielded one sparks, an exposed one is hurt, then killed", async () => {
  const { a, b } = await setup(61);
  a.room.send("mod:dark", { spawn: 1 });
  await waitFor(() => shadows(a).length === 1 && shadows(b).length === 1, 4000);
  // shielded: a spark, nothing hurt
  const s0 = shadows(b)[0];
  aim(b, s0.x, s0.y);
  await sleep(100);
  fire(b, shadows(b)[0].x, shadows(b)[0].y);
  await waitFor(() => b.hits.length === 1, 3000);
  assert.equal(b.hits[0].kind, "spark");
  // A's focused torch burns its shield off
  a.room.send("phone:torch", { on: true });
  const torch = setInterval(() => {
    const s = shadows(a)[0];
    if (s) aim(a, s.x, s.y);
  }, 50);
  try {
    await waitFor(() => shadows(a)[0]?.s === code("exposed"), 10_000);
  } finally {
    clearInterval(torch);
    a.room.send("phone:torch", { on: false });
  }
  // B: two rounds into it
  for (let i = 0; i < 2; i++) {
    const s = shadows(b)[0];
    aim(b, s.x, s.y);
    await sleep(ARMS.revolver.rate * 1000 + 50);
    fire(b, shadows(b)[0].x, shadows(b)[0].y);
  }
  await waitFor(() => b.hits.some((h) => h.kind === "killed"), 3000);
  assert.deepEqual(
    b.hits.map((h) => h.kind),
    ["spark", "hurt", "killed"],
  );
  await waitFor(() => shadows(b)[0]?.s === code("dissolve") || shadows(b).length === 0);
  // three rounds spent
  await waitFor(() => b.inv?.weapons[0]?.loaded === 3);
});

test("the rewind: a late shot at where B saw it counts; a ray from somewhere B isn't doesn't", async () => {
  const { a, b } = await setup(62);
  a.room.send("mod:dark", { spawn: 1 });
  await waitFor(() => shadows(b).length === 1, 4000);
  const id = shadows(b)[0].id;
  // it's moving (circling in): a shot at where it is now, from a tile away from me — not mine
  await sleep(2000);
  const now = shadows(b)[0];
  aim(b, now.x, now.y);
  await sleep(ARMS.revolver.rate * 1000 + 50);
  const m = me(b.room);
  fire(b, now.x, now.y, 0, { x: m.x + 2.5, y: m.y });
  await sleep(400);
  assert.equal(b.hits.length, 0, "a muzzle 2.5 tiles from where the server has me: no shot");
  assert.equal(b.inv?.weapons[0]?.loaded, 6, "and no round spent");
  // where I saw it 300 ms ago, my line's lag (150 ms) said: a hit (a spark: it's shielded)
  const seen = b.seen.get(id) ?? [];
  const then = seen.find((p) => p.t >= Date.now() - 300) ?? seen[0];
  const moved = Math.hypot(then.x - shadows(b)[0].x, then.y - shadows(b)[0].y);
  fire(b, then.x, then.y, 150);
  await waitFor(() => b.hits.length === 1, 3000);
  assert.equal(b.hits[0].kind, "spark");
  assert.ok(moved > 0.3, `it had moved on (${moved.toFixed(2)} tiles): the hit was where B saw it`);
});

test("a reload: a round at a time out of the pockets, till full; a shot stops it", async () => {
  const { b } = await setup(63);
  const aimAway = () => aim(b, me(b.room).x + 20, me(b.room).y);
  for (let i = 0; i < 3; i++) {
    aimAway();
    await sleep(ARMS.revolver.rate * 1000 + 50);
    fire(b, me(b.room).x + 20, me(b.room).y);
  }
  await waitFor(() => b.inv?.weapons[0]?.loaded === 3);
  const spare = b.inv?.pockets.find((s) => s?.id === "r38")?.n ?? 0;
  b.room.send("arms:reload", {});
  await sleep(ARMS.revolver.reload * 1000 + 120);
  assert.equal(b.inv?.weapons[0]?.loaded, 4, "one round after 0.35 s");
  await waitFor(() => b.inv?.weapons[0]?.loaded === 6, 2000);
  assert.equal(b.inv?.pockets.find((s) => s?.id === "r38")?.n, spare - 3, "out of the pockets");
  // a shot in the middle of a reload stops it
  aimAway();
  await sleep(ARMS.revolver.rate * 1000 + 50);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await waitFor(() => b.inv?.weapons[0]?.loaded === 5);
  b.room.send("arms:reload", {});
  await sleep(100);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await sleep(ARMS.revolver.rate * 1000 + 600);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await sleep(1000);
  assert.ok((b.inv?.weapons[0]?.loaded ?? 9) < 6, "the reload stopped at the shot");
});

test("a flare thrown lands ahead, lit for 12 s: nobody comes into it", async () => {
  const { a, b } = await setup(64);
  a.room.send("mod:hour", { h: 23 });
  await waitFor(() => Math.abs(a.room.state.hour - 23) < 0.01);
  const from = { x: me(b.room).x, y: me(b.room).y };
  b.room.send("arms:flare", { yaw: 0, pitch: 0 });
  await waitFor(() => b.room.state.flares.size === 1, 3000);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const f: any = [...b.room.state.flares.values()][0];
  const d = Math.hypot(f.x - from.x, f.y - from.y);
  assert.ok(d > 4 && d < 10 && f.x > from.x, `ahead, ${d.toFixed(1)} tiles`);
  assert.ok(Math.abs(f.until - f.at - FLARE.secs * 1000) < 1);
  assert.equal(b.inv?.pockets.find((s) => s?.id === "flare")?.n, 2, "one flare used");
  // B stands in its light; they're called up round it
  await standAt(b, f.x + OFF.x + 1, f.y + OFF.y);
  b.room.send("mod:dark", { mode: "normal", spawn: 4 });
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    for (const s of shadows(b)) {
      const dd = Math.hypot(s.x - f.x, s.y - f.y);
      assert.ok(dd >= FLARE.radius - 0.3 || s.s === code("flee"), `one in the flare's light at ${dd.toFixed(2)}`);
    }
    await sleep(100);
  }
  assert.equal(me(b.room).hp, 100, "nobody struck B in the light");
});
