// Server perf budget: an offline world-server with N bots walking real paths.
// Fails if the average tick (features + simulation) goes over budget.
//   pnpm --filter @yutopia/world-server perf
import { ANIM, dirFromDelta, findPath, Grid, getMap, type Point, ROOM_NAME, WALK_SPEED } from "@yutopia/shared";
import { Client } from "colyseus.js";

process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET ??= "perf";
process.env.YUTOPIA_INTERNAL_SECRET ??= "perf";
const BOTS = Number(process.env.BOTS ?? 60);
const SECONDS = Number(process.env.SECONDS ?? 15);
const BUDGET_MS = 4;
const PORT = 27600 + Math.floor(Math.random() * 200);

const { startWorldServer } = await import("./server.ts");
const server = await startWorldServer(PORT);
const map = getMap("studio");
const grid = Grid.from(map, map.objects);
const timers: ReturnType<typeof setInterval>[] = [];

for (let i = 0; i < BOTS; i++) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 1,
    token: `bot:${800000 + i}:B${i}`,
  });
  for (const t of [
    "hear",
    "snap",
    "chat",
    "toast",
    "knock",
    "vortex:say",
    "admitted",
    "wb:scene",
    "wb:op",
    "kicked",
    "arcade:scores",
  ])
    room.onMessage(t, () => {});
  await new Promise<void>((r) => (room.state?.players ? r() : room.onStateChange.once(() => r())));
  const me = room.state.players.get(room.sessionId);
  const pos: Point = { x: me.x, y: me.y };
  let path: Point[] = [];
  let seq = 0;
  timers.push(
    setInterval(() => {
      if (!path.length) {
        const a = map.areas[Math.floor(Math.random() * map.areas.length)];
        if (a.kind !== "booth")
          path = findPath(grid, pos, { x: a.x + Math.random() * a.w, y: a.y + Math.random() * a.h }) ?? [];
      }
      let budget = WALK_SPEED * 0.05;
      let d = 0;
      while (budget > 0 && path.length) {
        const wp = path[0];
        const dx = wp.x - pos.x;
        const dy = wp.y - pos.y;
        const dist = Math.hypot(dx, dy);
        d = dirFromDelta(dx, dy);
        if (dist <= budget) {
          Object.assign(pos, wp);
          budget -= dist;
          path.shift();
        } else {
          pos.x += (dx / dist) * budget;
          pos.y += (dy / dist) * budget;
          budget = 0;
        }
      }
      room.send("pos", { x: pos.x, y: pos.y, d, a: path.length ? ANIM.walk : ANIM.idle, seq: ++seq });
    }, 50),
  );
}

// warm up, reset, measure
await fetch(`http://localhost:${PORT}/metrics`);
const cpu0 = process.cpuUsage();
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const cpu = process.cpuUsage(cpu0);
const text = await (await fetch(`http://localhost:${PORT}/metrics`)).text();
const avg = Number(/yutopia_tick_ms_avg ([\d.]+)/.exec(text)?.[1] ?? "NaN");
const max = Number(/yutopia_tick_ms_max ([\d.]+)/.exec(text)?.[1] ?? "NaN");
const cpuPct = ((cpu.user + cpu.system) / 1000 / (SECONDS * 1000)) * 100;
console.log(
  `[perf] ${BOTS} bots · tick avg ${avg} ms · max ${max} ms · process CPU ${cpuPct.toFixed(0)}% (incl. the bots themselves)`,
);
for (const t of timers) clearInterval(t);
await server.gracefullyShutdown(false);
process.exit(avg <= BUDGET_MS ? 0 : 1);
