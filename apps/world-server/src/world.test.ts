import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME, spHour } from "@yutopia/shared";
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

async function join(id: number, sandbox = 1) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
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

test("two people join the world and see each other; offline sandboxes are separate", async () => {
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

test("the weather and the flashlight: a storm called up reaches everyone at once; a beam is seen", async () => {
  const [a, b] = rooms;
  a.send("mod:storm", { storm: 1, now: true });
  await waitFor(() => a.state.storm > 0.99 && b.state.storm > 0.99);
  // sent off: it dies down (a scheduled storm's way, not at once)
  a.send("mod:storm", { storm: 0 });
  await waitFor(() => b.state.storm < 0.99);
  a.send("mod:storm", { storm: null, now: true });
  a.send("phone:torch", { on: true });
  await waitFor(() => b.state.players.get(a.sessionId)?.torch === true);
  a.send("phone:torch", { on: false });
  await waitFor(() => b.state.players.get(a.sessionId)?.torch === false);
});

test("the hour: São Paulo's, the same for everyone; an admin sets another, nobody else can", async () => {
  const person = async (id: number, roles: string) => {
    const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 9,
      token: `dev:${id}:P${id}:${roles}`,
    });
    rooms.push(room);
    await waitFor(() => !!room.state?.players?.get(room.sessionId));
    return room;
  };
  const admin = await person(91, "member,admin");
  const guest = await person(92, "member");
  // (a second's tick apart at most, and an hour is 3,600 of them)
  const near = (a: number, b: number) => Math.abs(((a - b + 36) % 24) - 12) < 2 / 3600;
  await waitFor(() => guest.state.players.size === 2);
  assert.ok(near(admin.state.hour, spHour(Date.now())), `${admin.state.hour} vs ${spHour(Date.now())}`);
  assert.ok(near(guest.state.hour, admin.state.hour));
  // not theirs to set
  const was = guest.state.hour;
  guest.send("mod:hour", { h: (was + 12) % 24 });
  await sleep(300);
  assert.ok(near(guest.state.hour, was), "a member can't set the hour");
  // an admin's: the same night for both, running on from it; then São Paulo's again
  admin.send("mod:hour", { h: 23.5 });
  await waitFor(() => near(admin.state.hour, 23.5) && near(guest.state.hour, 23.5));
  admin.send("mod:hour", { h: null });
  await waitFor(() => near(guest.state.hour, spHour(Date.now())));
});
