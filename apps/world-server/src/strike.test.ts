import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import type { Inventory } from "@yutopia/shared/inventory";
import { STRIKE_DESK, STRIKE_PARK } from "@yutopia/shared/strike";
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
