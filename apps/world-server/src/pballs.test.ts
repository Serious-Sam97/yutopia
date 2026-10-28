import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { aimPitch, KNOCK, OFF_TABLE, PBALL } from "@yutopia/shared/pool-throw";
import { Client, type Room } from "colyseus.js";

// Pool balls out of a game (features/pballs.ts): B takes a ball off a table nobody's playing and
// throws it at A — A goes down where they stand and is up again a few seconds on; the ball lies
// there to be picked up, and goes back on its table. The cue taken down fires balls: A down
// again. Not while a game's on; a game starting calls the balls back.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26880 + Math.floor(Math.random() * 100);
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
async function person(uid: number, sandbox: number): Promise<Room> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  return room;
}
async function standIn(r: Room, x: number, y: number, level: number) {
  r.send("teleport", { to: { x, y, level } });
  await waitFor(() => me(r).level === level && Math.hypot(me(r).x - x, me(r).y - y) < 1.5);
  await sleep(150);
  return { x: me(r).x, y: me(r).y };
}
// the table's balls (packed: [id, x, y, down, …]): which, and whether off the cloth
const onTable = (r: Room, id: string): { id: number; down: number }[] =>
  ((JSON.parse(r.state.pool.get(id)?.game || "{}").balls ?? []) as number[][]).map((q) => ({ id: q[0], down: q[3] }));
// a throw at someone's chest, as the client works it out
function throwAt(r: Room, x: number, y: number) {
  const m = me(r);
  const d = Math.hypot(x - m.x, y - m.y);
  r.send("pball:throw", {
    yaw: Math.atan2(y - m.y, x - m.x),
    pitch: aimPitch(d - 0.25, 1.1 - PBALL.hand, PBALL.throwSpeed),
  });
}

test("a ball off the table thrown at A knocks A down; it lies there, is picked up, goes back", async () => {
  const a = await person(901, 91);
  const b = await person(902, 91);
  const at = await standIn(a, 10.5, 22.5, 4);
  await standIn(b, 2.5, 22.5, 4);
  // a table beside B (wherever there's room for one), on B's side of the wall along y 21 — a hand
  // doesn't reach through a wall (docs/plan/50-the-volume.md E)
  const id = "t-pool";
  for (const [x, y] of [
    [1, 23],
    [2, 23],
    [0, 23],
    [3, 23],
    [1, 24],
    [2, 24],
    [0, 24],
    [3, 24],
    [1, 25],
    [2, 25],
  ]) {
    b.send("obj:put", { id, kind: "pool_table", x, y, rot: 0 });
    await sleep(300);
    if (b.state.objects.get(id)) break;
  }
  assert.ok(b.state.objects.get(id), "room for the table");
  // nobody playing: its balls racked on it
  await waitFor(() => onTable(b, id).length === 16, 3000);
  assert.ok(onTable(b, id).every((q) => q.down < 0));

  b.send("pball:take", { id, what: "ball" });
  await waitFor(() => /^pball:\d+$/.test(me(b).held));
  const n = Number(me(b).held.split(":")[1]);
  await waitFor(() => onTable(b, id).find((q) => q.id === n)?.down === OFF_TABLE);
  // (it stays in the hand: nothing puts it away as a finished drink)
  await sleep(1200);
  assert.equal(me(b).held, `pball:${n}`);

  throwAt(b, at.x, at.y);
  await waitFor(() => me(a).fellAt > 0, 3000);
  assert.equal(me(b).held, "");
  const [key, ball] = [...b.state.pballs.entries()][0];
  assert.equal(ball.hit, a.sessionId);
  assert.equal(ball.n, n);
  // (thrown back the way the ball went: from B towards A, +x)
  assert.ok(Math.abs(me(a).fellYaw) < 0.3);
  // down: no throwing, no jumping; up again after KNOCK.secs
  await waitFor(() => me(a).fellAt === 0, KNOCK.secs * 1000 + 1500);

  // the ball lies by A: B goes and picks it up, and puts it back on the table
  await standIn(b, ball.rx - 0.6, ball.ry, 4);
  await sleep(SETTLE_MS);
  b.send("pball:pick", { key });
  await waitFor(() => me(b).held === `pball:${n}`);
  assert.equal(b.state.pballs.size, 0);
  await standIn(b, 2.5, 22.5, 4);
  b.send("pball:back", {});
  await waitFor(() => onTable(b, id).find((q) => q.id === n)?.down === -1);
  assert.equal(me(b).held, "");
});

const SETTLE_MS = 600;

test("the cue taken down fires balls: A knocked down again; not while a game's on", async () => {
  const a = await person(903, 92);
  const b = await person(904, 92);
  const at = await standIn(a, 10.5, 22.5, 4);
  const from = await standIn(b, 2.5, 22.5, 4);
  const id = "t-pool2";
  for (const [x, y] of [
    [1, 23],
    [2, 23],
    [1, 19],
    [2, 19],
    [0, 23],
    [3, 23],
  ]) {
    b.send("obj:put", { id, kind: "pool_table", x, y, rot: 0 });
    await sleep(300);
    if (b.state.objects.get(id)) break;
  }
  await waitFor(() => onTable(b, id).length === 16, 3000);
  b.send("pball:take", { id, what: "cue" });
  await waitFor(() => me(b).gun === "cue");
  // from the tip, a little ahead of the hands, straight at A's chest
  const oz = me(b).z + 1.3;
  const yaw = Math.atan2(at.y - from.y, at.x - from.x);
  b.send("pball:fire", {
    ox: from.x + Math.cos(yaw) * 0.8,
    oy: from.y + Math.sin(yaw) * 0.8,
    oz,
    yaw,
    pitch: aimPitch(Math.hypot(at.x - from.x, at.y - from.y) - 0.8, 1.1 - 1.3, PBALL.cueSpeed),
  });
  await waitFor(() => me(a).fellAt > 0, 3000);
  const shot = [...b.state.pballs.values()][0];
  assert.equal(shot.table, "", "the cue's own ball, off no table");
  // a shot from somewhere B isn't: refused
  b.send("pball:fire", { ox: from.x + 5, oy: from.y, oz, yaw, pitch: 0 });
  await sleep(500);
  assert.equal(b.state.pballs.size, 1);
  // put back
  b.send("pball:back", {});
  await waitFor(() => me(b).gun === "");

  // a game on: nothing comes off the table
  b.send("pool:sit", { id, seat: 0 });
  b.send("pool:vortex", { id, level: "easy" });
  await waitFor(() => b.state.pool.get(id)?.seats.size === 2);
  b.send("pool:start", { id });
  await waitFor(() => b.state.pool.get(id)?.phase === "play");
  b.send("pball:take", { id, what: "ball" });
  b.send("pball:take", { id, what: "cue" });
  await sleep(400);
  assert.equal(me(b).held, "");
  assert.equal(me(b).gun, "");
});
