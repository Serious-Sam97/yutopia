import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// Life on the Grounds (docs/plan/27, phase 6): the shuttle's run with a rider,
// the visitor's car, the guard on his round. YUTOPIA_LIFE_FAST: a trip in seconds.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";
process.env.YUTOPIA_LIFE_FAST = "1";

const PORT = 25870 + Math.floor(Math.random() * 100);
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
async function waitFor(fn: () => boolean, ms = 5000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);
// the ground floor's coords are the building's less (−60, −10)
const OFF = { x: -60, y: -10 };

test("the shuttle: on at the headquarters' stop, carried to the town square, off at its kerb", async () => {
  const a = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 7,
    token: "dev:31:P31:member,builder",
  });
  rooms.push(a);
  await waitFor(() => a.state.players?.size > 0 && !!a.state.vehicles?.get("shuttle"));
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const sh = (): any => a.state.vehicles.get("shuttle");
  await waitFor(() => sh().shown);
  // (it starts at the headquarters; wait for it to be there, at a stop)
  await waitFor(() => sh().stop === "hq", 30_000);
  const at = { x: sh().x - OFF.x - 2.5, y: sh().z - OFF.y };
  a.send("teleport", { to: { ...at, level: 0 } });
  await waitFor(() => me(a).level === 0 && Math.hypot(me(a).x - at.x, me(a).y - at.y) < 2);
  a.send("ride:board", {});
  await waitFor(() => me(a).busy === "ride:shuttle");
  assert.equal(sh().riders, 1);
  // off it goes; at the town square they're let off
  await waitFor(() => sh().stop === "town" && me(a).busy === "", 30_000);
  const x = me(a).x + OFF.x;
  const z = me(a).y + OFF.y;
  assert.ok(Math.abs(x - 412) < 8 && Math.abs(z - -401) < 5, `off at the square: ${x}, ${z}`);
  assert.equal(sh().riders, 0);
});

test("the guard walks his round; the visitor's car is kept off the lot till it comes", async () => {
  const a = rooms[0];
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const g = (): any => a.state.npcs.get("guard");
  await waitFor(() => !!g());
  const x0 = g().x;
  const y0 = g().y;
  assert.equal(g().level, 0);
  await sleep(1500);
  assert.ok(Math.hypot(g().x - x0, g().y - y0) > 0.5 || g().a === 0, "he walks (or stops to look out)");
  assert.ok(a.state.vehicles.get("visitor"));
});

test("the guard's shift: at his post by day, out of the gatehouse's door to the fence after dark, back in at dawn", async () => {
  const a = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 7,
    token: "dev:92:P92:member,admin",
  });
  rooms.push(a);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const g = (): any => a.state.npcs.get("guard");
  const at = () => ({ x: g().x + OFF.x, z: g().y + OFF.y });
  const inGatehouse = () => at().x > -34 && at().x < -29 && at().z > -367 && at().z < -361;
  await waitFor(() => !!a.state.npcs?.get("guard"));
  // midday: at his post, standing
  a.send("mod:hour", { h: 12 });
  await waitFor(() => inGatehouse(), 30_000);
  await sleep(400);
  assert.ok(inGatehouse(), `at his post by day: ${JSON.stringify(at())}`);
  // night: out of the door (walking past it, not appearing on the round)
  a.send("mod:hour", { h: 22 });
  await waitFor(() => !inGatehouse(), 5000);
  const first = at();
  assert.ok(Math.hypot(first.x - -36, first.z - -364) < 4, `out by the door first: ${JSON.stringify(first)}`);
  await waitFor(() => Math.abs(at().z - -357) < 0.5 && Math.abs(at().x - -36) > 3, 10_000);
  // morning: home the shorter way, in at the door, to his post
  a.send("mod:hour", { h: 9 });
  await waitFor(() => inGatehouse(), 60_000);
  a.send("mod:hour", { h: null });
});
