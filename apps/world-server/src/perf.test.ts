import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { type PerfReport, ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";
import type { PerfRow } from "./api.ts";

// How the game runs for each player (docs/plan/39-the-telemetry.md): a client's report is
// checked field by field, kept to one per 20 s, given who it is and how often the server
// put them back, and handed to the API in a batch (here when the room closes); its ping
// is answered.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26900 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const sent: PerfRow[][] = [];
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
  const { perfSink } = await import("./features/perf.ts");
  perfSink.send = async (rows) => {
    sent.push(rows);
  };
});
after(async () => {
  await server.gracefullyShutdown(false);
});
async function waitFor(fn: () => boolean, ms = 8000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

const report = (over: Partial<PerfReport> = {}): PerfReport => ({
  session: "page-1",
  client: { version: "0.1.118", commit: "abc1234" },
  secs: 30,
  hidden: 0,
  frames: { fps: 44.2, med: 19.1, p95: 24.6, worst: 58, gapP95: 35, gapWorst: 65, over33: 40, over50: 2 },
  long: { n: 0, worst: 0 },
  stages: { "tp.frame": 17, logic: 1, "made up": 999 },
  draws: 1300,
  culled: 2400,
  where: {
    level: 4,
    area: "tracking",
    x: 17.5,
    y: 14.5,
    view: "3p",
    quality: "high",
    qualityPref: "auto",
    maxFps: 60,
    hour: 18.2,
    near: 0,
    inCar: false,
  },
  machine: {
    browser: "Firefox 145",
    os: "macOS",
    gpu: "Apple M4 Pro",
    screen: [2000, 1000],
    canvas: [4000, 2000],
    dpr: 2,
    cores: 14,
    memory: null,
    ratio: 1,
    ratioAtStart: 2,
    dprAtStart: 2,
    ratioFixes: 99999,
  },
  net: { pingMed: 31, pingP95: 60, reconnects: 0 },
  ...over,
});

test("reports checked, one per 20 s, with who and their snaps, sent in a batch; pings answered", async () => {
  const room: Room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 3901,
    token: "dev:41:Ana:member,builder",
  });
  const pongs: number[] = [];
  room.onMessage("perf:pong", (m: { t: number }) => pongs.push(m.t));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));

  room.send("perf:ping", { t: 1234.5 });
  await waitFor(() => pongs.length === 1);
  assert.equal(pongs[0], 1234.5);

  // put somewhere by the server (to the arrival point): a snap
  room.send("teleport", { to: "spawn" });
  await sleep(300);

  room.send("perf:report", report({ frames: { ...report().frames, fps: 99999, worst: -5 } }));
  // (a second inside 20 s: dropped)
  room.send("perf:report", report({ session: "page-2" }));
  await sleep(300);
  await room.leave(true);
  await waitFor(() => sent.length > 0);

  const rows = sent.flat();
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.user_id, 41);
  assert.equal(r.session, "page-1");
  assert.equal(r.version, "0.1.118");
  assert.equal((r.context as { commit: string }).commit, "abc1234");
  assert.equal(r.fps, 1000, "clamped");
  assert.equal(r.frame_worst, 0, "clamped");
  assert.deepEqual(r.stages, { "tp.frame": 17, logic: 1 }, "unknown stages dropped");
  assert.equal(r.gpu, "Apple M4 Pro");
  assert.equal(r.view, "3p");
  assert.equal(r.area, "tracking");
  assert.ok(r.snaps >= 1, `snaps counted (${r.snaps})`);
  assert.equal((r.context as { culled: number }).culled, 2400);
  const m = r.machine as { ratio: number; ratioAtStart: number; dprAtStart: number; ratioFixes: number };
  assert.deepEqual(
    [m.ratio, m.ratioAtStart, m.dprAtStart, m.ratioFixes],
    [1, 2, 2, 10_000],
    "the ratio's story kept, clamped",
  );
});
