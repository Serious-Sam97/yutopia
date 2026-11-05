import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { groundAt, ROOM_NAME, skyAt } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// The weather in the room (docs/plan/65-the-weather.md, phase 2): the schedule's sky, the ground
// stepped by the rule, an admin's calls on both.

process.env.YUTOPIA_OFFLINE = "1";
// (the schedule's weather, not the tests' winter: package.json's YUTOPIA_WEATHER)
delete process.env.YUTOPIA_WEATHER;
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 32600 + Math.floor(Math.random() * 100); // (its own hundred: no two files share one — they run at once)
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

async function person(id: number, roles: string, sandbox: number) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${id}:P${id}:${roles}`,
  });
  rooms.push(room);
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  return room;
}

async function waitFor(fn: () => boolean, ms = 4000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const weather = (room: Room): any => room.state.weather;

test("the sky and the ground at the start are the schedule's, the same for everyone", async () => {
  const a = await person(81, "member", 21);
  const b = await person(82, "member", 21);
  await waitFor(() => a.state.players.size === 2);
  const sky = skyAt(Date.now());
  const g = groundAt(Date.now());
  assert.equal(weather(a).kind, sky.kind);
  assert.ok(Math.abs(weather(a).temp - sky.temp) < 0.3, `${weather(a).temp} °C, the schedule's ${sky.temp}`);
  for (const k of ["snow", "wet", "puddles", "ice"]) assert.ok(Math.abs(weather(b)[k] - g[k as "snow"]) < 0.01, k);
  assert.equal(weather(a).to, "");
});

test("an admin calls the sky for everyone, for an hour; nobody else can; back to the schedule", async () => {
  const admin = await person(83, "member,admin", 22);
  const guest = await person(84, "member", 22);
  await waitFor(() => guest.state.players.size === 2);
  // not theirs to call
  guest.send("mod:weather", { to: "snow", now: true });
  guest.send("mod:ground", { to: "snow", now: true });
  await sleep(400);
  assert.equal(weather(guest).to, "", "a member can't call the weather");
  assert.equal(weather(guest).groundTo, "");
  // a snow: cold enough to be snow, coming down, for an hour, who's said
  admin.send("mod:weather", { to: "snow", now: true });
  await waitFor(() => weather(guest).kind === "snow" && weather(guest).fall > 0.7);
  assert.ok(weather(guest).temp <= -2 + 1e-3);
  assert.equal(weather(guest).to, "snow");
  assert.equal(weather(guest).by, "P83");
  assert.ok(Math.abs(weather(guest).until - (Date.now() + 60 * 60_000)) < 5000);
  // a storm: wild at once, a blizzard in the cold
  admin.send("mod:weather", { to: "storm", now: true });
  await waitFor(() => guest.state.storm > 0.99);
  // a rain: warm enough to be rain; its storm's gone with the storm call
  admin.send("mod:weather", { to: "rain", now: true });
  await waitFor(() => weather(guest).kind === "rain" && guest.state.storm === 0);
  assert.ok(weather(guest).temp >= 6 - 1e-3);
  // clear: nothing coming down, no cloud
  admin.send("mod:weather", { to: "clear", now: true });
  await waitFor(() => weather(guest).kind === "clear" && weather(guest).fall === 0 && weather(guest).cloud === 0);
  // a call that isn't one: nothing changes
  admin.send("mod:weather", { to: "hail", now: true } as never);
  await sleep(300);
  assert.equal(weather(guest).to, "clear");
  // back to the schedule
  admin.send("mod:weather", { to: null, now: true });
  await waitFor(() => weather(guest).to === "" && weather(guest).by === "" && weather(guest).until === 0);
  assert.equal(weather(guest).kind, skyAt(Date.now()).kind);
});

test("the ground: snowed in for everyone, then melting by the rule; melted over two minutes; as the weather has it", async () => {
  const admin = await person(85, "member,admin", 23);
  const guest = await person(86, "member", 23);
  await waitFor(() => guest.state.players.size === 2);
  // snowed in, at once: the snow and the water's ice
  admin.send("mod:ground", { to: "snow", now: true });
  await waitFor(() => weather(guest).snow === 1 && weather(guest).ice === 1);
  assert.equal(weather(guest).groundTo, "", "at once: the call's done");
  // then the rule: a warm rain melts it, a little each second
  admin.send("mod:weather", { to: "rain", now: true });
  await waitFor(() => weather(guest).snow < 1 && weather(guest).snow > 0.99, 5000);
  // (and the ground getting wetter by the rule — slowly: soaked in ~30 min of rain. Not a level:
  // the schedule's ground that day is what the snow fell on, wet or dry — 0.7 by 5 s held only on
  // a wet day, red since 2026-11-03)
  const wetAt = weather(guest).wet;
  await waitFor(() => weather(guest).wet > wetAt + 0.001, 5000);
  // melted, over two minutes: on its way, who's said
  admin.send("mod:ground", { to: "melt" });
  await waitFor(() => weather(guest).groundTo === "melt" && weather(guest).groundBy === "P85");
  // (eased: slow to start, a few thousandths gone in six seconds — the rule alone takes hours)
  await sleep(6000);
  const s = weather(guest).snow;
  assert.ok(s < 0.997 && s > 0.9, `melting over two minutes: ${s} after 6 s`);
  // (a member can't stop it)
  guest.send("mod:ground", { to: null, now: true });
  await sleep(300);
  assert.equal(weather(guest).groundTo, "melt");
  // all of it, at once
  admin.send("mod:ground", { to: "melt", now: true });
  await waitFor(() => weather(guest).snow === 0 && weather(guest).ice === 0 && weather(guest).wet >= 0.7);
  // as the weather has it: the schedule's ground
  admin.send("mod:weather", { to: null, now: true });
  admin.send("mod:ground", { to: null, now: true });
  const g = groundAt(Date.now());
  await waitFor(() => Math.abs(weather(guest).snow - g.snow) < 0.01 && Math.abs(weather(guest).ice - g.ice) < 0.01);
});
