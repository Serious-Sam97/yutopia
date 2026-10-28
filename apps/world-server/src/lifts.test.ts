import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME, STOREY } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// A lift's car carries its riders (docs/plan/50-the-volume.md, D: one building): on the way down
// the shaft they're where it is — each floor it passes theirs a moment, their height over it the
// car's floor's — and what they say meanwhile isn't taken; the doors open where it stops, them in it.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27500 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
let room: Room | null = null;
before(async () => {
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

test("a ride down: the car carries its rider through every floor on the way, at its height", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9501,
    token: "dev:91:P91:member,builder",
  });
  room = r;
  r.onMessage("*", () => {});
  const snaps: unknown[] = [];
  r.onMessage("snap", (m) => snaps.push(m));
  const me = () => r.state?.players?.get(r.sessionId);
  await waitFor(() => !!me(), 8000);
  // from the arrival point, up to car A's doors (x 8–10) and in, as rooms.test's ride
  let seq = 0;
  const step = async (path: [number, number][]) => {
    let at = { x: me().x, y: me().y };
    for (const [x, y] of path) {
      await sleep(Math.max(55, (Math.hypot(x - at.x, y - at.y) / 4.5) * 1000));
      r.send("pos", { x, y, z: 0, l: 4, d: 0, a: 1, seq: ++seq });
      at = { x, y };
    }
    await sleep(150);
  };
  await step([
    [6.8, 28.2],
    [7.2, 27.8],
    [8.0, 28.2],
    [8.8, 28.5],
  ]);
  const stop = (level: number) =>
    [...r.state.objects.values()].find(
      (o: { kind: string; props: string }) =>
        o.kind === "elevator" && JSON.parse(o.props).shaft === "A" && JSON.parse(o.props).level === level,
    ) as { id: string; props: string };
  r.send("lift:call", { id: stop(4).id });
  await waitFor(() => JSON.parse(stop(4).props).door === "open", 5000);
  await step([
    [8.9, 29],
    [9, 29.6],
    [9, 30],
  ]);
  assert.ok(me().y > 29.5, "in the car");
  snaps.length = 0;
  r.send("lift:go", { id: stop(4).id, level: 0 });
  // (the doors shut first: then it goes)
  await waitFor(() => JSON.parse(stop(4).props).ph === "moving", 5000);
  // on the way: the floors it passes, how high over each (the building's height, every sample)
  const seen = new Set<number>();
  const heights: number[] = [];
  const t = Date.now();
  while (Date.now() - t < 12_000) {
    seen.add(me().level);
    heights.push(me().level * STOREY + me().z);
    // (what they say on the way isn't taken: the car has them — till it's down, where it stops)
    if (me().level > 0) r.send("pos", { x: 9, y: 26, z: 0, l: me().level, d: 0, a: 1, seq: ++seq });
    if (me().level === 0 && JSON.parse(stop(0).props).door === "open") break;
    await sleep(60);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4], "every floor on the way down");
  assert.ok(
    heights.some((h) => h > 1 && h < 4 * STOREY - 1 && h % STOREY > 0.5),
    "between floors too",
  );
  for (let i = 1; i < heights.length; i++)
    assert.ok(heights[i] <= heights[i - 1] + 0.05, `down all the way (${heights[i - 1]} → ${heights[i]})`);
  assert.equal(me().level, 0);
  assert.ok(Math.abs(me().z) < 0.01, "on the ground floor's floor");
  assert.ok(me().y - 10 > 29, "still in the car, not where they said");
  assert.equal(snaps.length, 1, "told once, where it stops");
});
