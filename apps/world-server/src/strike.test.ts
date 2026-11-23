import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import type { Inventory } from "@yutopia/shared/inventory";
import { inStrikeArena, STRIKE_DESK, STRIKE_PARK, strikeMap } from "@yutopia/shared/strike";
import { Client, type Room } from "colyseus.js";

// The Strike Park (docs/plan/114-the-strike-park.md): into the compound, join, the teams filled with Vortex
// bots, the park's loadout lent (the pockets put aside), a buy, the round's spawns in the arena, the map
// swapped with its show, and out again: the pockets given back.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";
process.env.YUTOPIA_STRIKE_FAST = "1";

const PORT = 31400 + Math.floor(Math.random() * 100);
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
interface Person {
  room: Room;
  inv: Inventory | null;
  why: string[];
}
async function person(uid: number, sandbox: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, why: [] };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("strike:why", (m: { why: string }) => who.why.push(m.why));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  return who;
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const arena = (p: Person): any => p.room.state.strike;
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (p: Person): any => p.room.state.players.get(p.room.sessionId);

test("join in the lobby: bots fill both teams, the park's revolver lent; out, the pockets back", async () => {
  const ana = await person(9301, 93);
  const own = JSON.stringify(ana.inv?.quick);
  // (not in the compound: refused quietly)
  ana.room.send("strike:join", {});
  await sleep(200);
  assert.equal(arena(ana).members.size, 0);
  ana.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
  await waitFor(() => Math.abs(me(ana).x - STRIKE_DESK.x) < 1);
  ana.room.send("strike:join", { mode: "competitive" });
  await waitFor(() => arena(ana).members.size === 10);
  const mine = arena(ana).members.get(ana.room.sessionId);
  assert.equal(mine.money, 800);
  assert.equal(mine.pistol, "revolver");
  assert.equal(arena(ana).phase, "warmup");
  await waitFor(() => (ana.inv?.quick[0] as { id?: string } | null)?.id === "revolver" && !ana.inv?.quick[1]);
  // (put in the arena at a spawn)
  await waitFor(() => Math.abs(me(ana).y - STRIKE_PARK.z) < 100 && Math.abs(me(ana).x - STRIKE_PARK.x) < 100);
  // a buy in warmup (free)
  ana.room.send("strike:buy", { item: "ak47" });
  await waitFor(() => arena(ana).members.get(ana.room.sessionId).primary === "ak47");
  await waitFor(() => (ana.inv?.quick[0] as { id?: string } | null)?.id === "ak47");
  // the match: round 1, freeze
  ana.room.send("strike:start", {});
  await waitFor(() => arena(ana).phase === "freeze" && arena(ana).round === 1);
  assert.ok([...arena(ana).members.values()].some((m: { bomb: boolean }) => m.bomb));
  // out
  ana.room.send("strike:leave", {});
  await waitFor(() => arena(ana).phase === "idle");
  await waitFor(() => JSON.stringify(ana.inv?.quick) === own);
});

test("the Map Board: the map struck and the next one put up", async () => {
  const bia = await person(9302, 94);
  bia.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
  await waitFor(() => Math.abs(me(bia).x - STRIKE_DESK.x) < 1);
  bia.room.send("strike:map", { key: "freight" });
  await waitFor(() => arena(bia).up === false && arena(bia).next === "freight");
  await waitFor(() => arena(bia).up === true && arena(bia).map === "freight", 4000);
  // a hostage map: Glass Tower, its hostages there when a match starts
  bia.room.send("strike:map", { key: "tower" });
  await waitFor(() => arena(bia).up === true && arena(bia).map === "tower", 4000);
  bia.room.send("strike:join", {});
  await waitFor(() => arena(bia).members.size > 0);
  bia.room.send("strike:start", {});
  await waitFor(() => arena(bia).hostages.length === 4);
  bia.room.send("strike:leave", {});
  await waitFor(() => arena(bia).phase === "idle");
});

test("ready up: the only person in the warmup ready → the match starts", async () => {
  const cai = await person(9303, 95);
  cai.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
  await waitFor(() => Math.abs(me(cai).x - STRIKE_DESK.x) < 1);
  cai.room.send("strike:join", { mode: "competitive" });
  await waitFor(() => arena(cai).phase === "warmup");
  cai.room.send("strike:ready", { on: true });
  await waitFor(() => arena(cai).phase === "freeze" && arena(cai).round === 1);
  cai.room.send("strike:leave", {});
  await waitFor(() => arena(cai).phase === "idle");
});

test("the warmup's map vote (plan 118): voted another map → the countdown → its show → the match starts there", async () => {
  const dee = await person(9304, 96);
  dee.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
  await waitFor(() => Math.abs(me(dee).x - STRIKE_DESK.x) < 1);
  dee.room.send("strike:join", { mode: "competitive" });
  await waitFor(() => arena(dee).phase === "warmup" && String(arena(dee).vote).split(",").length === 3);
  const from = String(arena(dee).map);
  const to = String(arena(dee).vote).split(",")[1];
  assert.notEqual(to, from);
  dee.room.send("strike:vote", { key: to });
  await waitFor(() => JSON.parse(String(arena(dee).votes || "{}"))[dee.room.sessionId] === to);
  dee.room.send("strike:ready", { on: true });
  await waitFor(() => Number(arena(dee).goTo) > 0);
  // (not ready again: the count stops)
  dee.room.send("strike:ready", { on: false });
  await waitFor(() => Number(arena(dee).goTo) === 0);
  dee.room.send("strike:ready", { on: true });
  await waitFor(() => arena(dee).map === to && arena(dee).phase === "freeze" && arena(dee).round === 1, 15000);
  dee.room.send("strike:leave", {});
  await waitFor(() => arena(dee).phase === "idle");
});

test("the team votes (plan 118): a timeout in the freeze, a bot kicked out (its place left empty)", async () => {
  const eve = await person(9305, 97);
  eve.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
  await waitFor(() => Math.abs(me(eve).x - STRIKE_DESK.x) < 1);
  eve.room.send("strike:join", { mode: "competitive" });
  await waitFor(() => arena(eve).phase === "warmup");
  eve.room.send("strike:start", {});
  await waitFor(() => arena(eve).phase === "freeze");
  const left = Number(arena(eve).left);
  eve.room.send("strike:call", { kind: "timeout" });
  await waitFor(() => Number(arena(eve).left) > left + 20);
  assert.match(String(arena(eve).timeouts), /3/);
  const mine = arena(eve).members.get(eve.room.sessionId).team;
  const bot = [...arena(eve).members.entries()].find(
    ([, m]: [string, { bot: boolean; team: string }]) => m.bot && m.team === mine,
  )?.[0];
  assert.ok(bot);
  const n = arena(eve).members.size;
  eve.room.send("strike:call", { kind: "kick", target: bot });
  await waitFor(() => !arena(eve).members.has(bot) && arena(eve).members.size === n - 1);
  eve.room.send("strike:leave", {});
  await waitFor(() => arena(eve).phase === "idle");
});

test("ready up (plan 118): the one not ready walks off → the rest ready → the countdown, the match", async () => {
  const fay = await person(9306, 98);
  const gil = await person(9307, 98);
  for (const w of [fay, gil]) {
    w.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
    await waitFor(() => Math.abs(me(w).x - STRIKE_DESK.x) < 1);
  }
  fay.room.send("strike:join", { mode: "competitive" });
  await waitFor(() => arena(fay).phase === "warmup");
  gil.room.send("strike:join", {});
  await waitFor(() => arena(fay).members.has(gil.room.sessionId));
  fay.room.send("strike:ready", { on: true });
  await waitFor(() => String(arena(fay).ready).includes(fay.room.sessionId));
  assert.equal(Number(arena(fay).goTo), 0);
  gil.room.send("strike:leave", {});
  await waitFor(() => !arena(fay).members.has(gil.room.sessionId));
  await waitFor(() => Number(arena(fay).goTo) > 0 || arena(fay).phase === "freeze");
  await waitFor(() => arena(fay).phase === "freeze" && arena(fay).round === 1);
  fay.room.send("strike:leave", {});
  await waitFor(() => arena(fay).phase === "idle");
});

test("the bot quota (plan 119, CS's bot_quota fill): 4 players → me and three bots, 2 v 2; someone joins → a bot goes", async () => {
  const hal = await person(9308, 99);
  const ida = await person(9309, 99);
  for (const w of [hal, ida]) {
    w.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
    await waitFor(() => Math.abs(me(w).x - STRIKE_DESK.x) < 1);
  }
  hal.room.send("strike:settings", { fill: true, quota: 4 });
  await waitFor(() => Number(arena(hal).quota) === 4);
  hal.room.send("strike:join", { mode: "competitive", squad: 0 });
  await waitFor(() => arena(hal).phase === "warmup" && arena(hal).members.size === 4);
  const sides = () => {
    const n = { r: 0, w: 0 };
    for (const m of arena(hal).members.values()) n[m.team as "r" | "w"]++;
    return n;
  };
  assert.deepEqual(sides(), { r: 2, w: 2 });
  ida.room.send("strike:join", { squad: 1 });
  await waitFor(() => arena(hal).members.has(ida.room.sessionId));
  await waitFor(() => arena(hal).members.size === 4);
  assert.deepEqual(sides(), { r: 2, w: 2 });
  const bots = [...arena(hal).members.values()].filter((m: { bot: boolean }) => m.bot).length;
  assert.equal(bots, 2);
  // (back to the full size: 0)
  hal.room.send("strike:settings", { quota: 0 });
  await waitFor(() => arena(hal).members.size === 10);
  ida.room.send("strike:leave", {});
  hal.room.send("strike:leave", {});
  await waitFor(() => arena(hal).phase === "idle");
});

test("the charge (plan 119, F4a: CS's way): E alone never plants; drawn (5) and the left button held on A, it's planted", async () => {
  const jo = await person(9310, 100);
  jo.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
  await waitFor(() => Math.abs(me(jo).x - STRIKE_DESK.x) < 1);
  jo.room.send("strike:settings", { fill: false, quota: 0 });
  await waitFor(() => arena(jo).fill === false);
  jo.room.send("strike:join", { mode: "competitive", squad: 0 });
  await waitFor(() => arena(jo).phase === "warmup");
  jo.room.send("strike:start", {});
  await waitFor(() => arena(jo).phase === "live", 30000);
  assert.equal(arena(jo).members.get(jo.room.sessionId).bomb, true);
  const A = strikeMap(String(arena(jo).map)).sites?.A;
  assert.ok(A);
  jo.room.send("teleport", {
    to: { x: (A.x0 + A.x1) / 2 + STRIKE_PARK.x, y: (A.z0 + A.z1) / 2 + STRIKE_PARK.z, level: 0 },
  });
  await sleep(600);
  // (E: nothing)
  jo.room.send("strike:use", { on: true });
  await sleep(800);
  assert.equal(arena(jo).charge, "carried");
  jo.room.send("strike:use", { on: false });
  // (the left button without it drawn: nothing either)
  jo.room.send("strike:use", { on: true, plant: true });
  await sleep(500);
  assert.equal(arena(jo).charge, "carried");
  jo.room.send("strike:use", { on: false });
  jo.room.send("strike:charge", { on: true });
  await waitFor(() => me(jo).held === "charge" && me(jo).gun === "");
  jo.room.send("strike:use", { on: true, plant: true });
  await waitFor(() => arena(jo).charge === "planting");
  await waitFor(() => arena(jo).charge === "planted", 6000);
  // (planted: out of the hands)
  await waitFor(() => me(jo).held === "");
  jo.room.send("strike:use", { on: false });
  jo.room.send("strike:leave", {});
  await waitFor(() => arena(jo).phase === "idle");
  jo.room.send("strike:settings", { fill: true });
});

test("the knife (plan 119, F2a: CS's): a stab from the front takes 65, one in the back kills", async () => {
  const kim = await person(9311, 101);
  const lou = await person(9312, 101);
  for (const w of [kim, lou]) {
    w.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
    await waitFor(() => Math.abs(me(w).x - STRIKE_DESK.x) < 1);
  }
  kim.room.send("strike:settings", { fill: false, quota: 0 });
  await waitFor(() => arena(kim).fill === false);
  kim.room.send("strike:join", { mode: "competitive", squad: 0 });
  await waitFor(() => arena(kim).phase === "warmup");
  lou.room.send("strike:join", { squad: 1 });
  await waitFor(() => arena(kim).members.has(lou.room.sessionId));
  kim.room.send("strike:start", {});
  await waitFor(() => arena(kim).phase === "live", 30000);
  // side by side in the middle of A: kim facing east at lou, a metre on
  const A = strikeMap(String(arena(kim).map)).sites?.A;
  assert.ok(A);
  const x = (A.x0 + A.x1) / 2 + STRIKE_PARK.x;
  const y = (A.z0 + A.z1) / 2 + STRIKE_PARK.z;
  let seq = 1000;
  const stand = async (w: typeof kim, px: number, yaw: number) => {
    w.room.send("teleport", { to: { x: px, y, level: 0 } });
    await waitFor(() => Math.abs(me(w).x - px) < 0.3);
    w.room.send("pos", { x: me(w).x, y: me(w).y, z: me(w).z, l: 0, a: 0, seq: seq++, yaw });
    await waitFor(() => me(w).yaw === yaw);
  };
  await stand(kim, x, 0);
  await stand(lou, x + 1, 128); // (facing kim)
  kim.room.send("strike:knife", { on: true });
  await waitFor(() => me(kim).held === "knife");
  const hp = () => Number(arena(kim).members.get(lou.room.sessionId).hp);
  kim.room.send("strike:stab", { heavy: true });
  await waitFor(() => hp() === 35);
  // (turned away: in the back, after the stab's second)
  await stand(lou, x + 1, 0);
  await sleep(1000);
  kim.room.send("strike:stab", { heavy: true });
  await waitFor(() => arena(kim).members.get(lou.room.sessionId).alive === false);
  kim.room.send("strike:leave", {});
  lou.room.send("strike:leave", {});
  await waitFor(() => arena(kim).phase === "idle");
  kim.room.send("strike:settings", { fill: true });
});

test("out mid-match by closing the page, back later: in the lobby yard, not stuck on the arena (the user's, 11-23)", async () => {
  const mo = await person(9313, 102);
  mo.room.send("teleport", { to: { x: STRIKE_DESK.x, y: STRIKE_DESK.z + 4, level: 0 } });
  await waitFor(() => Math.abs(me(mo).x - STRIKE_DESK.x) < 1);
  mo.room.send("strike:settings", { fill: true, quota: 0 });
  mo.room.send("strike:join", { mode: "competitive", squad: 0 });
  await waitFor(() => arena(mo).phase === "warmup");
  mo.room.send("strike:start", {});
  await waitFor(() => arena(mo).phase === "freeze" || arena(mo).phase === "live", 20000);
  // (out on the arena, in the match)
  await waitFor(() => inStrikeArena(me(mo).x, me(mo).y, -2));
  // the page closed: gone (consented — no reconnection kept)
  // (out of the teardown's list: a room left twice hangs the file — memory colyseus-test-leave)
  rooms.splice(rooms.indexOf(mo.room), 1);
  await mo.room.leave(true);
  await sleep(500);
  const again = await person(9313, 102);
  await waitFor(() => Math.abs(me(again).x - STRIKE_DESK.x) < 9 && !inStrikeArena(me(again).x, me(again).y, -2));
  assert.equal(arena(again).members.has(again.room.sessionId), false);
});
