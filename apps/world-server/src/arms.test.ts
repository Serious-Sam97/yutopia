import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { ARMS, FLARE, pvpDamage, SHADE_STATES } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import type { Inventory } from "@yutopia/shared/inventory";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// Guns and flares (docs/plan/30-the-dark.md, phase 5): A exposes one with a
// focused torch, B shoots it down; an honest late shot (at where B saw it a
// moment ago) counts, a ray from somewhere B isn't doesn't; a shielded one
// throws a spark; a reload is a round at a time out of the pockets; a flare
// thrown lands ahead, lit, and keeps them out. And the office armed: one of us
// shot takes half (the lobby, the studio); a shotgun's pellets each; not one
// who's down, not one on another floor, not through a wall; a flare indoors.
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
// (the first quick slot's rounds: a gun there)
const loaded0 = (p: { inv?: Inventory | null }) => (p.inv?.quick[0] as { loaded?: number } | null | undefined)?.loaded;
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const shadows = (p: { room: Room }): any[] => [...(p.room.state.shadows?.values() ?? [])];
const code = (s: (typeof SHADE_STATES)[number]) => SHADE_STATES.indexOf(s);

interface Person {
  room: Room;
  inv: Inventory | null;
  hits: { id: string; kind: string }[];
  struck: { id: string; n: number; shot?: boolean }[];
  // where it saw each shadowed, and when (its own clock)
  seen: Map<string, { t: number; x: number; y: number }[]>;
}
async function person(uid: number, sandbox: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, hits: [], struck: [], seen: new Map() };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("arms:hit", (m: { id: string; kind: string }) => who.hits.push(m));
  room.onMessage("dark:hit", (m: Person["struck"][number]) => who.struck.push(m));
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
    z: m.z,
    d: 2,
    a: 0,
    seq: 0,
    mv: packMv("still") | MV_AIM,
    yaw: yawToByte(yaw + AIM_BLADE), // (aiming, the body's bladed: shared beam.ts)
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
// (a shot at one of them mustn't pass through A on its way: A's off B's line to (x, y))
const offLine = (a: Person, b: Person, x: number, y: number) => {
  const A = me(a.room);
  const B = me(b.room);
  const dx = x - B.x;
  const dy = y - B.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = ((A.x - B.x) * dx + (A.y - B.y) * dy) / len;
  return t < 0 || t > len || Math.abs((A.x - B.x) * dy - (A.y - B.y) * dx) / len > 1.2;
};
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
  await waitFor(() => b.inv?.quick[0]?.id === "revolver");
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
  await waitFor(() => offLine(a, b, shadows(b)[0].x, shadows(b)[0].y));
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
    await waitFor(() => offLine(a, b, shadows(b)[0].x, shadows(b)[0].y));
    fire(b, shadows(b)[0].x, shadows(b)[0].y);
  }
  await waitFor(() => b.hits.some((h) => h.kind === "killed"), 3000);
  assert.deepEqual(
    b.hits.map((h) => h.kind),
    ["spark", "hurt", "killed"],
  );
  await waitFor(() => shadows(b)[0]?.s === code("dissolve") || shadows(b).length === 0);
  // three rounds spent
  await waitFor(() => loaded0(b) === 3);
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
  assert.equal(loaded0(b), 6, "and no round spent");
  // where I saw it 300 ms ago, my line's lag (150 ms) said: a hit (a spark: it's shielded) — once
  // it was somewhere A isn't on the way to (A's a target too)
  const seen = b.seen.get(id) ?? [];
  const at300 = () => (b.seen.get(id) ?? []).find((p) => p.t >= Date.now() - 300);
  await waitFor(() => {
    const p = at300();
    return !!p && offLine(a, b, p.x, p.y);
  });
  const then = at300() ?? seen[0];
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
  await waitFor(() => loaded0(b) === 3);
  const spare = b.inv?.pockets.find((s) => s?.id === "r38")?.n ?? 0;
  b.room.send("arms:reload", {});
  await sleep(ARMS.revolver.reload * 1000 + 120);
  assert.equal(loaded0(b), 4, "one round after 0.35 s");
  await waitFor(() => loaded0(b) === 6, 2000);
  assert.equal(b.inv?.pockets.find((s) => s?.id === "r38")?.n, spare - 3, "out of the pockets");
  // a shot in the middle of a reload stops it
  aimAway();
  await sleep(ARMS.revolver.rate * 1000 + 50);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await waitFor(() => loaded0(b) === 5);
  b.room.send("arms:reload", {});
  await sleep(100);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await sleep(ARMS.revolver.rate * 1000 + 600);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await sleep(1000);
  assert.ok((loaded0(b) ?? 9) < 6, "the reload stopped at the shot");
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

// ── the office armed: one of us a target, indoors too ──────────────────────
// somewhere on a floor (its own coords); where the server put them
async function standIn(p: Person, x: number, y: number, level: number) {
  p.room.send("teleport", { to: { x, y, level } });
  await waitFor(() => me(p.room).level === level && Math.hypot(me(p.room).x - x, me(p.room).y - y) < 1.5);
  await sleep(300); // (a few ticks where they stand: the rewind's)
  return { x: me(p.room).x, y: me(p.room).y };
}
// a shot from my hand at someone standing at (x, y) (at their chest), as the client sends it
function shootAt(p: Person, x: number, y: number, seed = 7) {
  const m = me(p.room);
  const oz = m.z + 1.35;
  const yaw = Math.atan2(y - m.y, x - m.x);
  const pitch = Math.atan2(m.z + 1 - oz, Math.hypot(x - m.x, y - m.y));
  p.room.send("arms:fire", { ox: m.x, oy: m.y, oz, yaw, pitch, lag: 0, seed });
}
const indoors = async (sandbox: number, level: number, ax: number, ay: number, bx: number, by: number) => {
  const a = await person(600 + sandbox * 2, sandbox);
  const b = await person(601 + sandbox * 2, sandbox);
  a.room.send("mod:dark", { mode: "peaceful" });
  const at = await standIn(a, ax, ay, level);
  await standIn(b, bx, by, level);
  b.room.send("mod:refill", { kit: true });
  await waitFor(() => b.inv?.quick[0]?.id === "revolver");
  b.room.send("arms:draw", { slot: 0 });
  await waitFor(() => me(b.room).gun === "revolver");
  aim(b, at.x, at.y);
  await sleep(ARMS.revolver.rate * 1000 + 50);
  return { a, b, at };
};

test("the lobby: B's revolver hits A for half what one of the shadowed takes; A's told who", async () => {
  // (the ground floor's lobby: a clear row through it, the glass doors' height)
  const { a, b, at } = await indoors(65, 0, 73.5, 27.5, 63.5, 27.5);
  shootAt(b, at.x, at.y);
  await waitFor(() => b.hits.length === 1, 3000);
  assert.equal(b.hits[0].kind, "person");
  assert.equal(b.hits[0].id, a.room.sessionId);
  await waitFor(() => me(a.room).hp === 100 - pvpDamage("revolver"));
  assert.equal(pvpDamage("revolver"), 25);
  await waitFor(() => a.struck.length === 1);
  assert.deepEqual(a.struck[0], { id: b.room.sessionId, n: 25, shot: true });
  await waitFor(() => loaded0(b) === 5);
});

test("the studio (level 4): a shot there counts too; four put one of us down, the fifth finds nobody", async () => {
  const { a, b, at } = await indoors(66, 4, 10.5, 22.5, 2.5, 22.5);
  for (let i = 0; i < 4; i++) {
    shootAt(b, at.x, at.y, 7 + i);
    await sleep(ARMS.revolver.rate * 1000 + 50);
  }
  await waitFor(() => b.hits.length === 4, 3000);
  assert.deepEqual(
    b.hits.map((h) => h.kind),
    ["person", "person", "person", "downed"],
  );
  await waitFor(() => me(a.room).downAt > 0);
  // down: not a target
  shootAt(b, at.x, at.y, 99);
  await sleep(500);
  assert.equal(b.hits.length, 4, "nothing hit");
  assert.equal(me(a.room).hp, 0);
});

test("the shotgun: each pellet that meets one of us takes half its own", async () => {
  const { a, b, at } = await indoors(67, 0, 66.5, 27.5, 63.5, 27.5);
  b.room.send("arms:draw", { slot: 1 });
  await waitFor(() => me(b.room).gun === "shotgun");
  await sleep(ARMS.shotgun.rate * 1000 + 50);
  shootAt(b, at.x, at.y);
  await waitFor(() => b.hits.length > 0, 3000);
  await sleep(300);
  const n = b.hits.filter((h) => h.kind === "person" || h.kind === "downed").length;
  assert.ok(n >= 3, `${n} pellets met A at 3 tiles`);
  assert.equal(pvpDamage("shotgun"), 9);
  await waitFor(() => me(a.room).hp === Math.max(0, 100 - 9 * n));
});

test("another floor: nobody's hit; a wall on the way stops it", async () => {
  // out by the building's west wall (the ground floor's coords), A hit where they stand
  const { a, b, at } = await indoors(68, 0, 10.5, 22.5, 4.5, 22.5);
  shootAt(b, at.x, at.y);
  await waitFor(() => b.hits.length === 1, 3000);
  await waitFor(() => me(a.room).hp === 75);
  // the same spot on the studio's floor (level 4): B's shot there meets nobody
  await standIn(a, at.x, at.y, 4);
  await sleep(ARMS.revolver.rate * 1000);
  shootAt(b, at.x, at.y, 8);
  await waitFor(() => (loaded0(b) ?? 6) < 5, 3000);
  await sleep(300);
  assert.equal(b.hits.length, 1, "on another floor: missed");
  assert.equal(me(a.room).hp, 75);
  // A in the south offices, the lobby's east wall between them
  const there = await standIn(a, 84.5, 34.5, 0);
  const here = await standIn(b, 80.5, 34.5, 0);
  assert.ok(there.x > 82.2 && here.x < 81.8, `either side of the wall: B ${here.x}, A ${there.x}`);
  aim(b, there.x, there.y);
  await sleep(ARMS.revolver.rate * 1000 + 50);
  shootAt(b, there.x, there.y, 9);
  await waitFor(() => (loaded0(b) ?? 6) < 4, 3000);
  await sleep(300);
  assert.equal(b.hits.length, 1, "through a wall: missed");
  assert.equal(me(a.room).hp, 75);
});

test("a flare thrown indoors lands on that floor, lit there", async () => {
  const { b } = await indoors(69, 4, 10.5, 22.5, 2.5, 22.5);
  b.room.send("arms:flare", { yaw: 0, pitch: 0 });
  await waitFor(() => b.room.state.flares.size === 1, 3000);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const f: any = [...b.room.state.flares.values()][0];
  assert.equal(f.level, 4);
  assert.equal(f.z, 0, "on the floor");
  assert.ok(f.x > me(b.room).x, "ahead");
});
