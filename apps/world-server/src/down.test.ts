import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { BENCH, heightAt, LAMPS } from "@yutopia/shared/grounds";
import type { Inventory } from "@yutopia/shared/inventory";
import { MOVE, packMv } from "@yutopia/shared/move";
import { DOWN } from "@yutopia/shared/vitals";
import { Client, type Room } from "colyseus.js";

// Down, up, awake (docs/plan/30-the-dark.md, phase 6): at nothing you go down
// and crawl; a teammate holding by you for 3 s gets you up at 35 (going out of
// reach stops it); your own first aid, 5 s; nobody comes, you wake at the
// office at 50 with what you carried; away outside at night, you go down too.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_DARK_FAST = "1"; // (a bleed of 3 s, away for 1 s)
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26870 + Math.floor(Math.random() * 100);
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

interface Person {
  room: Room;
  inv: Inventory | null;
  awake: number;
  snaps: number;
}
async function person(uid: number, sandbox: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, awake: 0, snaps: 0 };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("dark:awake", () => who.awake++);
  room.onMessage("snap", () => who.snaps++);
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  // (the director off: out on the ice even the day sends some; these are about being down)
  room.send("mod:dark", { mode: "called" });
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  return who;
}
async function standAt(p: Person, bx: number, bz: number) {
  const to = { x: bx - OFF.x, y: bz - OFF.y };
  p.room.send("teleport", { to: { ...to, level: 0 } });
  await waitFor(() => me(p.room).level === 0 && Math.hypot(me(p.room).x - to.x, me(p.room).y - to.y) < 0.5);
  p.room.send("pos", { ...to, z: heightAt(bx, bz), d: 2, a: 0, seq: 0, mv: 0 });
  await sleep(100);
}
const down = async (p: Person) => {
  p.room.send("mod:down", {});
  await waitFor(() => me(p.room).downAt > 0);
  assert.equal(me(p.room).hp, 0);
};

test("down, a teammate gets you up in 3 s at 35; out of reach, it stops", async () => {
  const a = await person(701, 71);
  const b = await person(702, 71);
  await standAt(a, POND.x, POND.z);
  await standAt(b, POND.x + 1, POND.z);
  await down(a);
  // B holds by A; walks off after a second: it stops
  b.room.send("dark:revive", { sid: a.room.sessionId, on: true });
  await waitFor(() => me(a.room).revBy === b.room.sessionId);
  await sleep(1000);
  await standAt(b, POND.x + 4, POND.z);
  await waitFor(() => me(a.room).revBy === "");
  assert.ok(me(a.room).downAt > 0, "still down");
  // back, and held the whole 3 s (the bleeding waits meanwhile: a 3 s bleed here, still down)
  await standAt(b, POND.x + 1, POND.z);
  const t0 = Date.now();
  b.room.send("dark:revive", { sid: a.room.sessionId, on: true });
  await waitFor(() => me(a.room).downAt === 0, 6000);
  assert.ok(Date.now() - t0 >= DOWN.revive * 1000 - 100, "it took its 3 s");
  assert.equal(me(a.room).hp, DOWN.upHp);
  assert.equal(a.awake, 0, "up where they were, not at the office");
});

test("alone: woken at the office, 50 health, what they carried kept", async () => {
  const c = await person(711, 72);
  await standAt(c, POND.x, POND.z);
  c.room.send("mod:refill", { kit: true });
  await waitFor(() => c.inv?.weapons[0]?.id === "revolver");
  await down(c);
  await waitFor(() => c.awake === 1, 8000);
  await waitFor(() => me(c.room).downAt === 0 && me(c.room).hp === DOWN.awakeHp);
  assert.notEqual(Math.round(me(c.room).x), Math.round(POND.x - OFF.x), "not on the pond any more");
  assert.equal(c.inv?.weapons[0]?.id, "revolver", "what they carried, kept");
});

test("their own first aid: 5 s held, up at 100, one kit used", async () => {
  const d = await person(721, 73);
  await standAt(d, POND.x, POND.z);
  d.room.send("mod:refill", { kit: true });
  await waitFor(() => (d.inv?.pockets.find((s) => s?.id === "aid")?.n ?? 0) >= 1);
  const kits = d.inv?.pockets.find((s) => s?.id === "aid")?.n ?? 0;
  // (the bleed is 3 s in this test's speed: the first aid's 5 s outlasts it — someone holds
  // by them meanwhile, which holds the bleeding, without getting them up in time)
  const e = await person(722, 73);
  await standAt(e, POND.x + 1, POND.z);
  await down(d);
  d.room.send("dark:selfaid", { on: true });
  const t0 = Date.now();
  // (a helper's hold, renewed: 2.5 s at a time, never the 3 it takes)
  const hold = setInterval(() => {
    e.room.send("dark:revive", { sid: d.room.sessionId, on: false });
    e.room.send("dark:revive", { sid: d.room.sessionId, on: true });
  }, 2500);
  e.room.send("dark:revive", { sid: d.room.sessionId, on: true });
  try {
    await waitFor(() => me(d.room).downAt === 0, 8000);
  } finally {
    clearInterval(hold);
  }
  assert.ok(Date.now() - t0 >= DOWN.selfAid * 1000 - 150, `${Date.now() - t0} ms`);
  assert.equal(me(d.room).hp, 100);
  await waitFor(() => (d.inv?.pockets.find((s) => s?.id === "aid")?.n ?? 0) === kits - 1);
});

test("down: a crawl, no jog, no jump", async () => {
  const f = await person(731, 74);
  await standAt(f, POND.x, POND.z);
  await down(f);
  f.room.send("jump", { k: "hop" });
  await sleep(150);
  assert.notEqual(me(f.room).jump, "hop", "no jump");
  let bx = POND.x;
  const step = async (speed: number, n: number) => {
    for (let i = 0; i < n; i++) {
      bx += speed * 0.05;
      f.room.send("pos", {
        x: bx - OFF.x,
        y: POND.z - OFF.y,
        z: heightAt(bx, POND.z),
        d: 2,
        a: 1,
        seq: 0,
        mv: packMv("crouch"),
      });
      await sleep(50);
    }
  };
  const snaps = f.snaps;
  await step(DOWN.crawl, 30);
  assert.equal(f.snaps, snaps, "a crawl is fine");
  await step(MOVE.jog, 30);
  assert.ok(f.snaps > snaps, "a jog isn't");
});

test("away outside at night: down, then woken at the office", async () => {
  const g = await person(741, 75);
  g.room.send("mod:hour", { h: 23 });
  // (in the clearing lamp's pool: the shadowed don't come in — it's the being away that does it)
  const lamp = LAMPS.find((l) => l.kind === "lone" && Math.hypot(l.x - BENCH.x, l.z - BENCH.z) < 4);
  assert.ok(lamp);
  await standAt(g, lamp.x + 2, lamp.z);
  g.room.send("status", { status: "away" });
  await waitFor(() => me(g.room).downAt > 0, 4000);
  await waitFor(() => g.awake === 1, 8000);
});
