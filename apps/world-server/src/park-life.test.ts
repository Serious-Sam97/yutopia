import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { heightAt } from "@yutopia/shared/grounds";
import { KART_FOLK, KART_SITTING, kartSeats, SIT_HIP } from "@yutopia/shared/kart";
import { Client, type Room } from "colyseus.js";

// The Kart Park's seats and folk (docs/plan/46-the-karts.md, "the park's people"): a bench by the
// fire sat on and got up from, one sitter a seat, the painted crowd's seats not anyone's, a stand's
// upper row from its front; the folk there and the visitors walking; a sitter who leaves frees it.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";
// (no physics world: the visitors start for the benches when the room does, and Jolt's start
// shifts when that is — the seats they take here are timed against it)
process.env.YUTOPIA_PHYSICS = "0";

const PORT = 26470 + Math.floor(Math.random() * 100);
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
const park = (room: Room): any => room.state.karts.get("park");
const taken = (r: Room) => String(park(r).seats).split(",").filter(Boolean).map(Number);
const OFF = { x: -60, y: -10 };
let sandbox = 40;
async function join(uid: number, s: number) {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: s,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(r);
  r.onMessage("snap", () => {});
  await waitFor(() => r.state.players?.size > 0 && !!r.state.karts?.get("park"));
  return r;
}
async function goTo(r: Room, x: number, z: number) {
  const at = { x: x - OFF.x, y: z - OFF.y, level: 0 };
  r.send("teleport", { to: at });
  await waitFor(() => Math.hypot(me(r).x - at.x, me(r).y - at.y) < 1.5);
}
const seats = kartSeats();

test("a bench by the fire: sat on, one a seat, got up from", async () => {
  const s = ++sandbox;
  const a = await join(71, s);
  const b = await join(72, s);
  // (the bench across the fire: the visitors sit on the other two)
  const i = seats.findIndex((q) => q.stand === undefined && Math.abs(Math.sin(q.a)) > 0.5);
  const q = seats[i];
  await goTo(a, q.out[0], q.out[1]);
  await goTo(b, q.out[0], q.out[1]);
  a.send("park:sit", { i });
  await waitFor(() => me(a).busy === KART_SITTING);
  assert.equal(me(a).a, 2, "sitting");
  assert.ok(Math.abs(me(a).x + OFF.x - q.x) < 0.01 && Math.abs(me(a).y + OFF.y - q.z) < 0.01, "on the seat");
  assert.ok(Math.abs(me(a).z - (heightAt(q.x, q.z) + q.top - SIT_HIP)) < 0.01, "at its height");
  assert.deepEqual(taken(a), [i]);
  // (someone else: not that one)
  b.send("park:sit", { i });
  await sleep(300);
  assert.equal(me(b).busy, "");
  // my moves aren't mine while I sit
  a.send("pos", { x: me(a).x + 3, y: me(a).y, d: 0, a: 1, z: me(a).z });
  await sleep(300);
  assert.ok(Math.abs(me(a).x + OFF.x - q.x) < 0.01, "still on it");
  a.send("park:stand", {});
  await waitFor(() => me(a).busy === "");
  assert.ok(Math.hypot(me(a).x + OFF.x - q.out[0], me(a).y + OFF.y - q.out[1]) < 0.01, "up in front of it");
  assert.deepEqual(taken(a), []);
  // walked off it, as off the office's bench: up where I was, my moves mine again
  a.send("park:sit", { i });
  await waitFor(() => me(a).busy === KART_SITTING);
  a.send("park:stand", { walk: true });
  await waitFor(() => me(a).busy === "");
  assert.ok(Math.hypot(me(a).x + OFF.x - q.x, me(a).y + OFF.y - q.z) < 0.01, "up where I sat");
  assert.deepEqual(taken(a), []);
});

test("the stands: the crowd's seats aren't anyone's; a row up from the front; leaving frees it", async () => {
  const s = ++sandbox;
  const a = await join(73, s);
  const crowd = seats.findIndex((q) => q.crowd);
  const up = seats.findIndex((q) => q.stand === 0 && q.row === 3 && !q.crowd);
  assert.ok(crowd >= 0 && up >= 0);
  const q = seats[up];
  await goTo(a, q.out[0], q.out[1]);
  a.send("park:sit", { i: crowd });
  await sleep(300);
  assert.equal(me(a).busy, "", "not on the crowd's");
  a.send("park:sit", { i: up });
  await waitFor(() => me(a).busy === KART_SITTING);
  assert.ok(me(a).z > heightAt(q.x, q.z) + 1.4, "up on the fourth row");
  const b = await join(74, s);
  await waitFor(() => taken(b).includes(up));
  // (left once only: out of the list the teardown leaves)
  rooms.splice(rooms.indexOf(a), 1);
  await a.leave(true);
  await waitFor(() => !taken(b).includes(up));
});

test("the folk: staff at their places, the visitors walking", async () => {
  const s = ++sandbox;
  const a = await join(75, s);
  for (const f of KART_FOLK) {
    const n = a.state.npcs.get(`folk-${f.id}`);
    assert.ok(n, f.id);
    assert.equal(n.kind, "folk");
    assert.equal(n.level, 0);
  }
  const v = a.state.npcs.get("folk-maya");
  const x0 = v.x;
  const y0 = v.y;
  await waitFor(() => Math.hypot(v.x - x0, v.y - y0) > 2, 10_000);
});
