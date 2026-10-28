import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// Nobody put back for how they moved (the user's call, 2026-10-28: no anticheat for now) — a
// hiccup, a dash, a leap: taken as sent. Only a placement of the server's (a teleport) isn't undone
// by moves that were already on their way (docs/plan/41-the-snap.md).
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27000 + Math.floor(Math.random() * 100);
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
    await sleep(20);
  }
}

let n = 0;
// someone out in the car park (open, flat snow), at (30.5, y0)
async function out(y0 = 30.5) {
  n++;
  const room: Room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 3950 + n,
    token: `dev:${60 + n}:Q${n}:member,builder`,
  });
  rooms.push(room);
  const snaps: { x: number; y: number }[] = [];
  room.onMessage("snap", (m) => snaps.push(m));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  room.send("teleport", { to: { x: 30.5, y: y0, level: 0 } });
  const me = () => room.state.players.get(room.sessionId);
  await waitFor(() => me().level === 0 && Math.abs(me().y - y0) < 0.6);
  // (the teleport is a snap too: what was sent before it is let go for a second)
  await sleep(1100);
  const p = { x: me().x, y: me().y, mt: 100_000, seq: 0 };
  const msg = (dy: number, dmt: number) => {
    p.y += dy;
    p.mt += dmt;
    return { x: p.x, y: p.y, z: 0, l: 0, d: 0, a: 1, seq: ++p.seq, mv: 2, yaw: 0, pitch: 0, mt: p.mt };
  };
  snaps.length = 0; // (the teleport's own)
  return { room, snaps, me, msg };
}

test("a hiccup: a second of jogging handed over at once — nobody put back", async () => {
  const s = await out();
  // jogging (4.2 tiles / s), a message every 50 ms
  for (let i = 0; i < 10; i++) {
    s.room.send("pos", s.msg(0.21, 50));
    await sleep(50);
  }
  // the line holds the next second's messages, then hands them all over at once
  const held = Array.from({ length: 20 }, () => s.msg(0.21, 50));
  await sleep(1000);
  for (const m of held) s.room.send("pos", m);
  await sleep(400);
  assert.equal(s.snaps.length, 0, "not put back");
  assert.ok(Math.abs(s.me().y - held[held.length - 1].y) < 0.01, "where they said");
});

test("in the second after a teleport, a move from far off (sent before it) is let go", async () => {
  const s = await out(38.5);
  s.room.send("teleport", { to: { x: 30.5, y: 38.5, level: 0 } });
  await sleep(200);
  const was = s.me().y;
  s.room.send("pos", s.msg(20, 50));
  await sleep(300);
  assert.ok(Math.abs(s.me().y - was) < 0.01, "not moved");
});

test("fast or far, taken as sent: 12 tiles / s, then a leap — nobody put back", async () => {
  const s = await out(32.5);
  for (let i = 0; i < 12; i++) {
    s.room.send("pos", s.msg(0.6, 50));
    await sleep(50);
  }
  const leap = s.msg(20, 50);
  s.room.send("pos", leap);
  await sleep(300);
  assert.equal(s.snaps.length, 0, "not put back");
  assert.ok(Math.abs(s.me().y - leap.y) < 0.01, "where they said");
});
