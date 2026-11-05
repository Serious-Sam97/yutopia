import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// A feature that throws doesn't take the world down (docs/plan/72-the-3d-core.md, phase 1): its
// hooks and tick run on their own, the others' still run, a tick that keeps throwing is switched
// off and said so by /health (still up: `degraded`); what Colyseus catches for the room (a clock
// timer) is counted, the room goes on.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 31900 + Math.floor(Math.random() * 100); // (its own hundred: the files run at once)
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
let room: Room | null = null;
const seen = { badTicks: 0, goodTicks: 0, goodJoins: 0 };

before(async () => {
  const { registerFeature } = await import("./features/index.ts");
  // (registered before the room is made: installed with the others)
  registerFeature(() => ({
    tick() {
      seen.badTicks++;
      throw new Error("a broken tick (guard.test)");
    },
    join() {
      throw new Error("a broken join (guard.test)");
    },
  }));
  registerFeature(() => ({
    tick() {
      seen.goodTicks++;
    },
    join() {
      seen.goodJoins++;
    },
  }));
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
});
after(async () => {
  const bounded = <T>(p: Promise<T>) => Promise.race([p, sleep(1000)]);
  await bounded(room?.leave(true).catch(() => {}) ?? Promise.resolve());
  await bounded(server.gracefullyShutdown(false));
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});

async function waitFor(fn: () => boolean, ms = 3000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

test("a feature that throws: the others still run, its tick switched off, the world up", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9601,
    token: "dev:96:P96:member",
  });
  room = r;
  r.onMessage("*", () => {});
  await waitFor(() => !!r.state?.players?.get(r.sessionId), 8000);
  // the join after the broken one still ran
  assert.equal(seen.goodJoins, 1);
  // the broken tick: switched off after TICK_FAILS (100) in a row; the good one never stopped
  await waitFor(() => seen.badTicks >= 100, 12_000);
  const atOff = seen.badTicks;
  const good = seen.goodTicks;
  await sleep(400);
  assert.equal(seen.badTicks, atOff, "switched off: not called again");
  assert.ok(seen.goodTicks > good + 3, "the other features still tick");
  const { WorldRoom } = await import("./WorldRoom.ts");
  const live = [...WorldRoom.live][0];
  assert.equal(live.featuresOff().length, 1);
  const health = await (await fetch(`http://localhost:${PORT}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.degraded, true);
  assert.ok(health.tickAgeMs < 1000);
  // a clock timer that throws: Colyseus hands it to the room (onUncaughtException), counted
  live.clock.setTimeout(() => {
    throw new Error("a broken timer (guard.test)");
  }, 10);
  await sleep(150);
  const text = await (await fetch(`http://localhost:${PORT}/metrics`)).text();
  assert.match(text, /yutopia_room_errors_total [1-9]/);
  assert.match(text, /yutopia_feature_errors_total [1-9]/);
  // and the room still ticks: someone's move still taken
  const before = seen.goodTicks;
  await sleep(200);
  assert.ok(seen.goodTicks > before);
});
