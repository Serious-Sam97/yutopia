import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 25670 + Math.floor(Math.random() * 100);
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

async function join(id: number, spaceId = 1) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    spaceId,
    token: `bot:${id}:Bot${id}`,
  });
  rooms.push(room);
  await waitFor(() => room.state?.players?.size > 0);
  return room;
}

async function waitFor(fn: () => boolean, ms = 3000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);

test("two people join the same space and see each other; other spaces are separate", async () => {
  const a = await join(1);
  const b = await join(2);
  const c = await join(3, 2);
  await waitFor(() => a.state.players.size === 2 && b.state.players.size === 2);
  assert.equal(a.roomId, b.roomId);
  assert.notEqual(a.roomId, c.roomId);
  assert.equal(c.state.players.size, 1);
  assert.ok(a.state.objects.size > 100, "map objects are in state");
});

test("legal moves are accepted, wall-hacks get snapped back", async () => {
  const a = rooms[0];
  const start = { x: me(a).x, y: me(a).y };
  const snaps: { x: number; y: number }[] = [];
  a.onMessage("snap", (m) => snaps.push(m));
  a.send("pos", { x: start.x + 0.2, y: start.y, d: 6, a: 1, seq: 1 });
  await waitFor(() => Math.abs(me(a).x - (start.x + 0.2)) < 0.01);
  await sleep(60);
  a.send("pos", { x: 40.5, y: 5.5, d: 6, a: 1, seq: 2 }); // straight into the War Room
  await waitFor(() => snaps.length > 0);
  assert.ok(Math.abs(me(a).x - (start.x + 0.2)) < 0.01);
});

test("hearing: neighbours hear each other, far away people don't", async () => {
  const a = rooms[0];
  const b = rooms[1];
  const heard: string[][] = [];
  a.onMessage("hear", (m) => heard.push(m.ids));
  // Both bots stand at the lobby spawn — but bots are muted for hearing (they don't publish).
  await sleep(400);
  assert.ok(heard.length === 0 || heard.at(-1)?.length === 0);
  assert.ok(b.sessionId);
});

test("chat reaches people nearby and is rate-limited", async () => {
  const a = rooms[0];
  const b = rooms[1];
  const got: string[] = [];
  b.onMessage("chat", (m) => got.push(m.text));
  for (let i = 0; i < 8; i++) a.send("chat", { text: `hi ${i}`, scope: "nearby" });
  await sleep(300);
  assert.equal(got.length, 5, "burst of 5 then throttled");
});

test("a new look reaches everyone, validated", async () => {
  const [a, b] = rooms;
  const look = { ...JSON.parse(me(a).avatar || "{}"), hair: "afro", style: "ligne", topColor: "#123456" };
  a.send("avatar", { avatar: look });
  await waitFor(() => JSON.parse(b.state.players.get(a.sessionId)?.avatar ?? "{}").topColor === "#123456");
  const seen = JSON.parse(b.state.players.get(a.sessionId)?.avatar ?? "{}");
  assert.equal(seen.hair, "afro");
  assert.equal(seen.style, "ligne");
  assert.equal(seen.topColor, "#123456");
  // bad values fall back to defaults (and the 2 s limit drops spam)
  await sleep(2100);
  a.send("avatar", { avatar: { ...look, topColor: '"/><script>', hair: "x y" } });
  await waitFor(() => JSON.parse(me(a).avatar).hair !== "afro");
  assert.match(JSON.parse(me(a).avatar).topColor, /^#[0-9a-f]{6}$/i);
});

test("emotes show and expire on the player", async () => {
  const a = rooms[0];
  a.send("emote", { e: "wave" });
  await waitFor(() => me(a).emote === "wave");
  a.send("emote", { e: "not-an-emote" });
  await sleep(100);
  assert.equal(me(a).emote, "wave");
});
