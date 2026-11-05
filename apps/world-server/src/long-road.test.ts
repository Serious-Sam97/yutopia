import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { BUS_STOPS } from "@yutopia/shared/longroad";
import { Client, type Room } from "colyseus.js";

// Long Pine Road's life (docs/plan/69, L7): the bus from Main Street's stop to Silver Lake's with a
// rider, and the traffic now and then. YUTOPIA_LIFE_FAST: a run in about half a minute.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";
process.env.YUTOPIA_LIFE_FAST = "1";

const PORT = 31800 + Math.floor(Math.random() * 100); // (its own hundred: no two files share one — they run at once)
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

test("the bus: on at Main Street's stop, carried up Long Pine Road, off at Silver Lake's", async () => {
  const a = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 8,
    token: "dev:33:P33:member,builder",
  });
  rooms.push(a);
  await waitFor(() => a.state.players?.size > 0 && !!a.state.vehicles?.get("bus"));
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const bus = (): any => a.state.vehicles.get("bus");
  await waitFor(() => bus().shown);
  // (at the town's stop: stood beside it and on — if it's just gone, the next time it's there)
  for (let go = 0; go < 4 && me(a).busy !== "ride:shuttle"; go++) {
    await waitFor(() => bus().stop === "town", 120_000);
    const b = bus();
    const at = { x: b.x - Math.sin(b.a) * 3, y: b.z + Math.cos(b.a) * 3 };
    a.send("teleport", { to: { ...at, level: 0 } });
    await waitFor(() => me(a).level === 0 && Math.hypot(me(a).x - at.x, me(a).y - at.y) < 2).catch(() => {});
    a.send("ride:board", {});
    await waitFor(() => me(a).busy === "ride:shuttle", 1500).catch(() => {});
  }
  assert.equal(me(a).busy, "ride:shuttle", "on the bus");
  assert.equal(bus().riders, 1);
  // off it goes, up the road (seated, carried); at the lake they're let off
  await waitFor(() => bus().stop === "", 10_000);
  await waitFor(() => Math.hypot(me(a).x - BUS_STOPS.town.x, me(a).y - BUS_STOPS.town.z) > 500, 30_000);
  assert.equal(me(a).busy, "ride:shuttle", "carried");
  await waitFor(() => bus().stop === "lake" && me(a).busy === "", 90_000);
  const x = me(a).x;
  const z = me(a).y;
  assert.ok(Math.hypot(x - BUS_STOPS.lake.x, z - BUS_STOPS.lake.z) < 15, `off at the lake: ${x}, ${z}`);
  assert.equal(bus().riders, 0);
});

test("the traffic: a car now and then, driving the road and gone again", async () => {
  const a = rooms[0];
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const car = (): any => a.state.vehicles.get("traffic");
  await waitFor(() => !!car()?.shown, 30_000);
  const x0 = car().x;
  const z0 = car().z;
  await waitFor(() => Math.hypot(car().x - x0, car().z - z0) > 200, 15_000);
  await waitFor(() => !car().shown, 90_000);
});
