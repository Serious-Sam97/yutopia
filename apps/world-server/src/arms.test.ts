import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME, STOREY } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { ARM, ARMS, BODY, damageAt, FLARE, pvpDamage, SHADE_STATES } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import { count, type Inventory } from "@yutopia/shared/inventory";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// Guns and flares (docs/plan/30-the-dark.md, phase 5): A exposes one with a
// focused torch, B shoots it down; an honest late shot (at where B saw it a
// moment ago) counts, a ray from somewhere B isn't doesn't; a shielded one
// throws a spark; a reload (AW2's): out, the live rounds back, a speedloader; a flare
// thrown lands ahead, lit, and keeps them out. And the office armed: one of us
// shot takes half (the lobby, the studio); a shotgun's pellets each; not one
// who's down, not one on another floor, not through a wall; a flare indoors.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_DARK_FAST = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 30100 + Math.floor(Math.random() * 100); // (its own hundred: no two files share one — they run at once)
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
  hits: { id: string; kind: string; head?: boolean }[];
  shots: { sid: string; spread: number }[];
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
  const who: Person = { room, inv: null, hits: [], shots: [], struck: [], seen: new Map() };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("arms:hit", (m: { id: string; kind: string; head?: boolean }) => who.hits.push(m));
  room.onMessage("arms:shot", (m: { sid: string; spread: number }) => who.shots.push(m));
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
const at = (bx: number, bz: number) => ({ x: bx, y: bz });
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
  const oz = heightAt(m.x, m.y) + 1.35;
  const yaw = Math.atan2(y - o.y, x - o.x);
  const d = Math.hypot(x - o.x, y - o.y);
  // (down at its chest)
  const pitch = Math.atan2(heightAt(x, y) + 1 - oz, d);
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
  await sleep(ARMS.revolver.draw * 1000 + 50); // (up)
  return { a, b };
};

test("A exposes it, B shoots it down: a shielded one sparks, an exposed one is hurt (four times), then killed", async () => {
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
  // B: five rounds into it (a round is 50 to the body; it takes SHADE.hp, 250)
  for (let i = 0; i < 5; i++) {
    const s = shadows(b)[0];
    aim(b, s.x, s.y);
    await sleep(ARMS.revolver.rate * 1000 + 50);
    await waitFor(() => offLine(a, b, shadows(b)[0].x, shadows(b)[0].y));
    fire(b, shadows(b)[0].x, shadows(b)[0].y);
  }
  await waitFor(() => b.hits.some((h) => h.kind === "killed"), 3000);
  assert.deepEqual(
    b.hits.map((h) => h.kind),
    ["spark", "hurt", "hurt", "hurt", "hurt", "killed"],
  );
  await waitFor(() => shadows(b)[0]?.s === code("dissolve") || shadows(b).length === 0);
  // six rounds spent
  await waitFor(() => loaded0(b) === 0);
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

test("the revolver's reload (AW2's): out, every round dumped (the live ones back), a speedloader, shut; a shot while out snaps it", async () => {
  const { b } = await setup(63);
  const aimAway = () => aim(b, me(b.room).x + 20, me(b.room).y);
  const spare = () => (b.inv ? count(b.inv, "r38") : 0);
  for (let i = 0; i < 3; i++) {
    aimAway();
    await sleep(ARMS.revolver.rate * 1000 + 50);
    fire(b, me(b.room).x + 20, me(b.room).y);
  }
  await waitFor(() => loaded0(b) === 3);
  const before = spare();
  b.room.send("arms:reload", {});
  await waitFor(() => me(b.room).arm === ARM.open, 1000);
  // (out: the three live ones back in the pockets, the cylinder empty)
  await waitFor(() => loaded0(b) === 0, 1500);
  assert.equal(spare(), before + 3, "the live rounds back to the pockets");
  // (the speedloader: all six at once, then shut)
  const t0 = Date.now();
  await waitFor(() => loaded0(b) === 6, 2500);
  assert.ok(Date.now() - t0 > ARMS.revolver.speed * 1000 - 200, "the speedloader's six after its time");
  assert.equal(spare(), before - 3, "six out of the pockets for three spent");
  await waitFor(() => me(b.room).arm === ARM.idle, 1500);
  // a shot while it's out (rounds in it): shut, nothing fired, nothing dumped
  aimAway();
  await sleep(ARMS.revolver.rate * 1000 + 50);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await waitFor(() => loaded0(b) === 5);
  b.room.send("arms:reload", {});
  await waitFor(() => me(b.room).arm === ARM.open, 1000);
  fire(b, me(b.room).x + 20, me(b.room).y);
  await waitFor(() => me(b.room).arm === ARM.idle, 1500);
  assert.equal(loaded0(b), 5, "snapped shut: nothing dumped, nothing fired");
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
  assert.equal((b.inv?.pockets.find((s) => s?.id === "flare") as { n?: number } | undefined)?.n, 2, "one flare used");
  // B stands in its light; they're called up round it
  await standAt(b, f.x + 1, f.y);
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
function shootAt(p: Person, x: number, y: number, seed = 7, high = 1) {
  const m = me(p.room);
  const fz = m.z - m.level * STOREY; // (over their floor: Player.z is the world's)
  const oz = fz + 1.35;
  const yaw = Math.atan2(y - m.y, x - m.x);
  const pitch = Math.atan2(fz + high - oz, Math.hypot(x - m.x, y - m.y));
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
  const { a, b, at } = await indoors(65, 0, 13.5, 17.5, 3.5, 17.5);
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
  const { a, b, at } = await indoors(67, 0, 6.5, 17.5, 3.5, 17.5);
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
  // in the lobby, A hit where they stand
  const { a, b, at } = await indoors(68, 0, 13.5, 17.5, 3.5, 17.5);
  shootAt(b, at.x, at.y);
  await waitFor(() => b.hits.length === 1, 3000);
  await waitFor(() => me(a.room).hp === 75);
  // right over it on the studio's floor (level 4): B's shot there meets nobody
  await standIn(a, at.x, at.y, 4);
  await sleep(ARMS.revolver.rate * 1000);
  shootAt(b, at.x, at.y, 8);
  await waitFor(() => (loaded0(b) ?? 6) < 5, 3000);
  await sleep(300);
  assert.equal(b.hits.length, 1, "on another floor: missed");
  assert.equal(me(a.room).hp, 75);
  // A in the south offices, the lobby's east wall between them
  const there = await standIn(a, 24.5, 24.5, 0);
  const here = await standIn(b, 20.5, 24.5, 0);
  assert.ok(there.x > 22.2 && here.x < 21.8, `either side of the wall: B ${here.x}, A ${there.x}`);
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

// ── the feel's rules (docs/plan/32-the-arms.md) ────────────────────────────
test("a gun's up only after its draw: a shot before it isn't; Player.arm says drawing, then idle", async () => {
  const { a, b, at } = await indoors(70, 0, 13.5, 17.5, 3.5, 17.5);
  b.room.send("arms:draw", { slot: -1 });
  await waitFor(() => me(b.room).gun === "");
  // (plan 80) the revolver carried: its holster on the hip for everyone, put away or not; A carries none
  await waitFor(() => me(b.room).holster, 1500);
  assert.equal(a.room.state.players.get(b.room.sessionId)?.holster, true);
  assert.equal(me(a.room).holster, false);
  // (plan 81) the double-barrel carried too (the kit's): slung on her back
  assert.equal(a.room.state.players.get(b.room.sessionId)?.sling, true);
  assert.equal(me(a.room).sling, false);
  b.room.send("arms:draw", { slot: 0 });
  await waitFor(() => me(b.room).gun === "revolver");
  await waitFor(() => me(b.room).arm === ARM.draw, 300);
  shootAt(b, at.x, at.y);
  await sleep(150);
  assert.equal(loaded0(b), 6, "not up yet: no shot");
  await waitFor(() => me(b.room).arm === ARM.idle, 2000);
  shootAt(b, at.x, at.y);
  await waitFor(() => loaded0(b) === 5, 2000);
  await waitFor(() => me(a.room).hp < 100);
});

test("the head: a shot at A's head takes half again; the server's spread goes out with the shot", async () => {
  const { a, b, at } = await indoors(71, 0, 13.5, 17.5, 3.5, 17.5);
  console.log(
    "[headdbg] A",
    JSON.stringify({ x: me(a.room).x, y: me(a.room).y, z: me(a.room).z, mv: me(a.room).mv, a: me(a.room).a }),
    "B",
    JSON.stringify({ x: me(b.room).x, y: me(b.room).y, z: me(b.room).z }),
  );
  shootAt(b, at.x, at.y, 7, 1.68);
  await waitFor(() => b.hits.length === 1, 3000);
  assert.equal(b.hits[0].head, true);
  await waitFor(() => me(a.room).hp === 100 - damageAt("revolver", pvpDamage("revolver"), 9.6, true));
  assert.equal(me(a.room).hp, 62);
  // what A saw of it: the spread the server shot with — standing still, aimed, the first: its own
  await waitFor(() => a.shots.length === 1);
  assert.ok(Math.abs(a.shots[0].spread - ARMS.revolver.spread) < 1e-6, `${a.shots[0].spread}`);
  // a second straight after: bloomed
  await sleep(ARMS.revolver.rate * 1000 + 50);
  shootAt(b, at.x, at.y, 8);
  await waitFor(() => a.shots.length === 2);
  assert.ok(a.shots[1].spread > ARMS.revolver.spread + 0.005, `${a.shots[1].spread}`);
});

test("the double-barrel at 10 tiles: each pellet that meets A takes less than at 3", async () => {
  const { a, b, at } = await indoors(72, 0, 13.5, 17.5, 3.5, 17.5);
  b.room.send("arms:draw", { slot: 1 });
  await waitFor(() => me(b.room).gun === "shotgun");
  await sleep(ARMS.shotgun.draw * 1000 + 50);
  shootAt(b, at.x, at.y);
  await waitFor(() => b.hits.length > 0, 3000);
  await sleep(300);
  const hits = b.hits.filter((h) => h.kind === "person" || h.kind === "downed");
  const t = 10 - BODY.r;
  const want = hits.reduce((n, h) => n + damageAt("shotgun", pvpDamage("shotgun"), t, !!h.head), 0);
  assert.ok(damageAt("shotgun", pvpDamage("shotgun"), t, false) < pvpDamage("shotgun"));
  await waitFor(() => me(a.room).hp === Math.max(0, 100 - want));
});

test("the double-barrel's reload: broken open (both out: the live shell back), a shell at a time, shut; a shot while open snaps it shut", async () => {
  const { b } = await indoors(73, 0, 13.5, 17.5, 3.5, 17.5);
  b.room.send("arms:draw", { slot: 1 });
  await waitFor(() => me(b.room).gun === "shotgun");
  await sleep(ARMS.shotgun.draw * 1000 + 50);
  const loaded1 = () => (b.inv?.quick[1] as { loaded?: number } | null | undefined)?.loaded;
  const away = () => {
    aim(b, me(b.room).x - 20, me(b.room).y);
    shootAt(b, me(b.room).x - 20, me(b.room).y);
  };
  for (let i = 0; i < 2; i++) {
    away();
    await sleep(ARMS.shotgun.rate * 1000 + 60);
  }
  await waitFor(() => loaded1() === 0);
  b.room.send("arms:reload", {});
  await waitFor(() => me(b.room).arm === ARM.open, 1000);
  const t0 = Date.now();
  await waitFor(() => loaded1() === 1, 2000);
  const first = Date.now() - t0;
  assert.ok(first > (ARMS.shotgun.open + ARMS.shotgun.reload) * 1000 - 150, `the first shell after ${first} ms`);
  // (plan 81: the closing everyone sees — Player.arm ARM.shut — once the second's in)
  await waitFor(() => me(b.room).arm === ARM.shut, 2000);
  await waitFor(() => loaded1() === 2, 1000);
  await waitFor(() => me(b.room).arm === ARM.idle, 2000);
  // spend one; open it again; a shot while it's open (a shell in): shut, nothing fired
  away();
  await waitFor(() => loaded1() === 1);
  b.room.send("arms:reload", {});
  await waitFor(() => me(b.room).arm === ARM.open, 1000);
  shootAt(b, me(b.room).x - 20, me(b.room).y, 11);
  await waitFor(() => me(b.room).arm === ARM.shut, 1000);
  await waitFor(() => me(b.room).arm === ARM.idle, 1500);
  assert.equal(loaded1(), 1, "snapped shut: nothing loaded, nothing fired");
  // opened again and let be: both out (the live one back to the pockets), then two in
  const shells = () => (b.inv ? count(b.inv, "shell") : 0);
  const had = shells();
  b.room.send("arms:reload", {});
  await waitFor(() => loaded1() === 0, 1500);
  assert.equal(shells(), had + 1, "the live shell back to the pockets");
  await waitFor(() => loaded1() === 2, 2500);
  await waitFor(() => me(b.room).arm === ARM.idle, 1500);
  await sleep(ARMS.shotgun.rate * 1000);
  away();
  await waitFor(() => loaded1() === 1, 2000);
});

test("the AK (plan 79 phase 5): full auto at its rate through the line's jitter, never faster; the magazine out (its rounds back), a new one in, the charging handle when it ran dry", async () => {
  const { b } = await setup(75);
  b.room.send("mod:refill", { kit: true, ak: true });
  await waitFor(() => b.inv?.quick[2]?.id === "ak47");
  b.room.send("arms:draw", { slot: 2 });
  await waitFor(() => me(b.room).gun === "ak47");
  // (plan 82) the AK carried: slung on her back when it isn't in her hands, for everyone
  await waitFor(() => me(b.room).slingAk, 1500);
  await sleep(ARMS.ak47.draw * 1000 + 50);
  const loaded2 = () => (b.inv?.quick[2] as { loaded?: number } | null | undefined)?.loaded;
  const spare = () => (b.inv ? count(b.inv, "r762") : 0);
  const away = () => {
    aim(b, me(b.room).x + 20, me(b.room).y);
    fire(b, me(b.room).x + 20, me(b.room).y);
  };
  assert.equal(loaded2(), 30);
  // held: a round every 0.1 s — one late and the next early on its heels still both go
  for (let i = 0; i < 4; i++) {
    away();
    await sleep(ARMS.ak47.rate * 1000);
  }
  await sleep(ARMS.ak47.rate * 1000);
  away();
  away();
  await waitFor(() => loaded2() === 24, 1500);
  // …but never faster than its rate over time: twenty sent at once, two at most
  await sleep(400);
  for (let i = 0; i < 20; i++) away();
  await sleep(300);
  assert.ok((loaded2() ?? 0) >= 22, `a burst sent at once: ${24 - (loaded2() ?? 0)} fired`);
  // the magazine out: every round left in it back to the pockets; the new one, all thirty at once
  const left = loaded2() ?? 0;
  const before = spare();
  b.room.send("arms:reload", {});
  await waitFor(() => me(b.room).arm === ARM.open, 1000);
  await waitFor(() => loaded2() === 0, 1500);
  assert.equal(spare(), before + left, "the old magazine's rounds back");
  const t0 = Date.now();
  await waitFor(() => loaded2() === 30, 2500);
  assert.ok(Date.now() - t0 > ARMS.ak47.speed * 1000 - 200, "the new magazine after its time");
  const t1 = Date.now();
  // (plan 82: the closing everyone sees — shouldered again, no charging handle)
  await waitFor(() => me(b.room).arm === ARM.shut, 1000);
  await waitFor(() => me(b.room).arm === ARM.idle, 2000);
  const shut = Date.now() - t1;
  assert.ok(shut < ARMS.ak47.rack * 1000 - 200, `not run dry: no charging handle (${shut} ms)`);
  // run dry: the same, and the charging handle racked after
  for (let i = 0; i < 30; i++) {
    away();
    await sleep(ARMS.ak47.rate * 1000 + 5);
  }
  await waitFor(() => loaded2() === 0, 2000);
  b.room.send("arms:reload", {});
  await waitFor(() => loaded2() === 30, 4000);
  // (plan 82: racked — everyone sees it)
  await waitFor(() => me(b.room).arm === ARM.rack, 1000);
  const t2 = Date.now();
  await waitFor(() => me(b.room).arm === ARM.idle, 2500);
  assert.ok(Date.now() - t2 > ARMS.ak47.rack * 1000 - 250, "run dry: the charging handle racked");
});

test("the sniper (plan 79 phase 6): down its scope, the shot goes near dead on (wide, not); the bolt worked after each, no shot till it's home; its reload keeps the rounds in it, a round at a time", async () => {
  const { a, b } = await setup(77);
  b.room.send("mod:refill", { kit: true, sniper: true });
  await waitFor(() => b.inv?.quick[3]?.id === "sniper");
  b.room.send("arms:draw", { slot: 3 });
  await waitFor(() => me(b.room).gun === "sniper");
  await sleep(ARMS.sniper.draw * 1000 + 50);
  const loaded3 = () => (b.inv?.quick[3] as { loaded?: number } | null | undefined)?.loaded;
  const shoot = (scope: boolean) => {
    const m = me(b.room);
    aim(b, m.x + 30, m.y);
    const oz = heightAt(m.x, m.y) + 1.35;
    b.room.send("arms:fire", { ox: m.x, oy: m.y, oz, yaw: 0, pitch: 0, lag: 0, seed: 3, scope });
  };
  // scoped: the spread A is told the shot went out with — a fraction of the unscoped one's
  shoot(true);
  await waitFor(() => a.shots.length === 1);
  await waitFor(() => me(b.room).arm === ARM.bolt, 1000);
  // (the bolt not home: no shot)
  shoot(true);
  await sleep(300);
  assert.equal(loaded3(), 4, "no shot while the bolt's worked");
  await waitFor(() => me(b.room).arm === ARM.idle, 1500);
  await sleep(ARMS.sniper.rate * 1000 - 600);
  shoot(false);
  await waitFor(() => a.shots.length === 2, 2000);
  const [scoped, wide] = a.shots.map((s) => s.spread);
  assert.ok(scoped < wide * 0.05, `scoped ${scoped} vs ${wide}`);
  assert.equal(loaded3(), 3);
  // the reload: the bolt back (the three stay in), a round at a time, home
  await sleep(ARMS.sniper.rate * 1000 + 50);
  b.room.send("arms:reload", {});
  await waitFor(() => me(b.room).arm === ARM.open, 1000);
  await sleep(ARMS.sniper.open * 1000 + 100);
  assert.ok((loaded3() ?? 0) >= 3, "nothing dumped");
  await waitFor(() => loaded3() === 5, 2500);
  // (plan 83: the bolt run home everyone sees — Player.arm ARM.shut — once the last's in)
  await waitFor(() => me(b.room).arm === ARM.shut, 1000);
  await waitFor(() => me(b.room).arm === ARM.idle, 1500);
});

test("the Daybreak (plan 79 phase 7): not charged, nothing; charged a second, a ball flies, burns one of them bare as it comes and bursts on it — put down in one", async () => {
  const { a, b } = await setup(79);
  b.room.send("mod:refill", { kit: true, daybreak: true });
  await waitFor(() => b.inv?.quick[3]?.id === "daybreak");
  b.room.send("arms:draw", { slot: 3 });
  await waitFor(() => me(b.room).gun === "daybreak");
  await sleep(ARMS.daybreak.draw * 1000 + 50);
  const cells = () => (b.inv?.quick[3] as { loaded?: number } | null | undefined)?.loaded;
  const orbs: { id: string }[] = [];
  const bursts: { id: string }[] = [];
  b.room.onMessage("arms:orb", (m: { id: string }) => orbs.push(m));
  b.room.onMessage("arms:burst", (m: { id: string }) => bursts.push(m));
  a.room.send("mod:dark", { spawn: 1 });
  await waitFor(() => shadows(b).length === 1, 4000);
  // not charged: nothing goes
  aim(b, shadows(b)[0].x, shadows(b)[0].y);
  await sleep(100);
  fire(b, shadows(b)[0].x, shadows(b)[0].y);
  await sleep(300);
  assert.equal(cells(), 3, "no charge, no shot");
  // charged: Player.arm says so; a second on, the ball
  aim(b, shadows(b)[0].x, shadows(b)[0].y);
  b.room.send("arms:charge", {});
  await waitFor(() => me(b.room).arm === ARM.charge, 1000);
  await sleep(ARMS.daybreak.charge * 1000 + 30);
  await waitFor(() => offLine(a, b, shadows(b)[0].x, shadows(b)[0].y));
  aim(b, shadows(b)[0].x, shadows(b)[0].y);
  fire(b, shadows(b)[0].x, shadows(b)[0].y);
  await waitFor(() => orbs.length === 1, 1000);
  await waitFor(() => cells() === 2);
  await waitFor(() => bursts.length === 1, 4000);
  // (its shield burnt off on the way, the burst's light on it: 300, over its 250)
  await waitFor(() => b.hits.some((h) => h.kind === "killed"), 2000);
  // (plan 84 phase 4) its reload: opened (the cell left in it out), the new ones in, then the closing everyone sees —
  // Player.arm ARM.shut, back up to the ready
  await sleep(ARMS.daybreak.rate * 1000 + 50);
  b.room.send("arms:reload", {});
  await waitFor(() => me(b.room).arm === ARM.open, 1000);
  await waitFor(() => cells() === 3, (ARMS.daybreak.open + ARMS.daybreak.speed) * 1000 + 500);
  await waitFor(() => me(b.room).arm === ARM.shut, 1000);
  await waitFor(() => me(b.room).arm === ARM.idle, ARMS.daybreak.shut * 1000 + 500);
});
