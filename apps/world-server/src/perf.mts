// Server perf budget: an offline world-server with N bots walking real paths.
// Fails if the average tick (features + simulation) goes over budget, or if
// the server puts back an honest walk, jog or sprint (docs/plan/29-the-move.md).
// A sixth of them are out on the land, sprinting laps of the frozen pond with
// stamina in play (docs/plan/30-the-dark.md D2): out of breath they jog, as the
// client does, and say so.
//   pnpm --filter @yutopia/world-server perf
import { ANIM, dirFromDelta, findPath, type Point, ROOM_NAME } from "@yutopia/shared";
import { heightAt } from "@yutopia/shared/grounds";
import { type Gait, MOVE, MV_WINDED, packMv, yawToByte } from "@yutopia/shared/move";
import { FULL_VITALS, freshClock, stepVitals } from "@yutopia/shared/vitals";
import { Client } from "colyseus.js";

// DARK=1 (docs/plan/30-the-dark.md phase 4): 50 bots, 40 of them out on the pond at night,
// the shadowed up to their 40 (brought out quickly); the bytes one outside and one inside
// receive a second, against 6 KB/s outside and ~0 inside.
const DARK = process.env.DARK === "1";
if (DARK) process.env.YUTOPIA_DARK_FAST = "1";
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET ??= "perf";
process.env.YUTOPIA_INTERNAL_SECRET ??= "perf";
const BOTS = Number(process.env.BOTS ?? (DARK ? 50 : 60));
const SECONDS = Number(process.env.SECONDS ?? 15);
const BUDGET_MS = 4;
const PORT = 27600 + Math.floor(Math.random() * 200);

const { startWorldServer } = await import("./server.ts");
const server = await startWorldServer(PORT);
const { WorldRoom } = await import("./WorldRoom.ts");
const timers: ReturnType<typeof setInterval>[] = [];
let snaps = 0;
const bytes = { out: 0, in: 0 }; // received by one bot outside, one inside (DARK)
const outside = (i: number) => (DARK ? i % 5 !== 0 : i % 6 === 5);
let winded = 0; // times an outdoor bot ran out of breath
let awake = 0; // bots struck down (DARK)

for (let i = 0; i < BOTS; i++) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 1,
    // (the ones out on the land: builders, to be put there — bots can't teleport)
    token: outside(i) ? `dev:${800000 + i}:B${i}:member,builder,admin` : `bot:${800000 + i}:B${i}`,
  });
  for (const t of [
    "hear",
    "chat",
    "toast",
    "knock",
    "vortex:say",
    "admitted",
    "wb:scene",
    "wb:op",
    "kicked",
    "arcade:scores",
    "dark:hit",
    "dark:pockets",
  ])
    room.onMessage(t, () => {});
  await new Promise<void>((r) => (room.state?.players ? r() : room.onStateChange.once(() => r())));
  const me = room.state.players.get(room.sessionId);
  const pos: Point = { x: me.x, y: me.y };
  // walking the world as the server has it: its floor, its grid for them (locked doors and all)
  const world = WorldRoom.current;
  if (!world) throw new Error("no world room");
  const grid = world.gridFor(800000 + i, me.level);
  const areas = world.levelMap(me.level).areas.filter((a) => world.mayEnter(me, a.key));
  let path: Point[] = [];
  let seq = 0;
  // a third each walk, jog and sprint, as the move's gaits go
  const gait: Gait = (["walk", "jog", "sprint"] as const)[i % 3];
  const speed = MOVE[gait];
  let yaw = 0;
  // out on the pond: laps of its ice along z −60 (the building's coords; the floor's are 60, 10 on)
  const out = outside(i);
  // (the bytes this one receives: the first outside, the first inside)
  const counts = out ? (i === 1 ? "out" : null) : i === 0 ? "in" : null;
  if (counts) {
    const ws = (
      room.connection as unknown as {
        transport: { ws: { addEventListener: (t: string, f: (e: { data: ArrayBuffer | string }) => void) => void } };
      }
    ).transport.ws;
    ws.addEventListener("message", (e) => {
      bytes[counts] += typeof e.data === "string" ? e.data.length : e.data.byteLength;
    });
  }
  let placed = !out;
  if (out) {
    const lane = DARK ? -60 + ((i * 3) % 24) - 12 : -60 + ((i * 7) % 20) - 10;
    const from = { x: -280 + 60, y: lane + 10 };
    room.send("teleport", { to: { ...from, level: 0 } });
    await new Promise<void>((r) => room.onMessage("snap", () => r()));
    Object.assign(pos, from);
    placed = true;
    // (the night, for the dark's run; kept on their feet: the shadowed strike)
    if (DARK && i === 1) {
      room.send("mod:hour", { h: 23 });
      room.send("mod:storm", { storm: 0, now: true });
      room.send("mod:dark", { mode: "normal" });
    }
    if (DARK) timers.push(setInterval(() => room.send("mod:refill", {}), 2500));
  }
  const v = { ...FULL_VITALS };
  const breath = freshClock();
  let east = true;
  // (struck down and woken at the office: that move isn't a put-back; it stays in)
  let woken = false;
  room.onMessage("dark:awake", () => {
    woken = true;
    awake++;
  });
  room.onMessage("snap", (m: Point) => {
    if (!placed) return;
    if (woken) {
      Object.assign(pos, { x: m.x, y: m.y });
      return;
    }
    snaps++;
    Object.assign(pos, { x: m.x, y: m.y });
    path = [];
  });
  timers.push(
    setInterval(() => {
      if (woken) return;
      // (down: it waits for its refill to get it up — a crawl's no lap)
      if (room.state.players.get(room.sessionId)?.downAt) return;
      if (out) {
        // sprinting until out of breath, then a jog until it's back (shared/vitals.ts, as the walker)
        const g: Gait = breath.winded ? "jog" : "sprint";
        const was = breath.winded;
        stepVitals(
          v,
          breath,
          { sprinting: g === "sprint", outside: true, night: 0, storm: 0, warm: false, focus: false },
          0.05,
        );
        if (breath.winded && !was) winded++;
        pos.x += (east ? 1 : -1) * MOVE[g] * 0.05;
        if (pos.x > -200 + 60) east = false;
        if (pos.x < -280 + 60) east = true;
        yaw = east ? 0 : Math.PI;
        room.send("pos", {
          x: pos.x,
          y: pos.y,
          z: heightAt(pos.x - 60, pos.y - 10),
          d: dirFromDelta(east ? 1 : -1, 0),
          a: ANIM.walk,
          seq: ++seq,
          mv: packMv(g) | (breath.winded ? MV_WINDED : 0),
          yaw: yawToByte(yaw),
          mt: Math.round(performance.now()) >>> 0,
        });
        return;
      }
      if (!path.length) {
        const a = areas[Math.floor(Math.random() * areas.length)];
        path = findPath(grid, pos, { x: a.x + Math.random() * a.w, y: a.y + Math.random() * a.h }) ?? [];
      }
      let budget = speed * 0.05;
      let d = 0;
      while (budget > 0 && path.length) {
        const wp = path[0];
        const dx = wp.x - pos.x;
        const dy = wp.y - pos.y;
        const dist = Math.hypot(dx, dy);
        d = dirFromDelta(dx, dy);
        yaw = Math.atan2(dy, dx);
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
      const moving = path.length > 0;
      room.send("pos", {
        x: pos.x,
        y: pos.y,
        d,
        a: moving ? ANIM.walk : ANIM.idle,
        seq: ++seq,
        mv: packMv(moving ? gait : "still"),
        yaw: yawToByte(yaw),
        mt: Math.round(performance.now()) >>> 0,
      });
    }, 50),
  );
}

// warm up, reset, measure (the dark: once the shadowed are out)
if (DARK) {
  const t0 = Date.now();
  while ((WorldRoom.current?.state.shadows.size ?? 0) < 35 && Date.now() - t0 < 60_000)
    await new Promise((r) => setTimeout(r, 200));
}
bytes.out = 0;
bytes.in = 0;
let shadowsMax = 0;
const watch = setInterval(() => {
  shadowsMax = Math.max(shadowsMax, WorldRoom.current?.state.shadows.size ?? 0);
}, 200);
await fetch(`http://localhost:${PORT}/metrics`);
const cpu0 = process.cpuUsage();
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const cpu = process.cpuUsage(cpu0);
const text = await (await fetch(`http://localhost:${PORT}/metrics`)).text();
const avg = Number(/yutopia_tick_ms_avg ([\d.]+)/.exec(text)?.[1] ?? "NaN");
const max = Number(/yutopia_tick_ms_max ([\d.]+)/.exec(text)?.[1] ?? "NaN");
const cpuPct = ((cpu.user + cpu.system) / 1000 / (SECONDS * 1000)) * 100;
clearInterval(watch);
console.log(
  `[perf] ${BOTS} bots · tick avg ${avg} ms · max ${max} ms · process CPU ${cpuPct.toFixed(0)}% (incl. the bots themselves) · ${snaps} put back · out of breath ${winded} times outside`,
);
const outKBs = bytes.out / 1024 / SECONDS;
const inKBs = bytes.in / 1024 / SECONDS;
if (DARK)
  console.log(
    `[perf] the dark: ${shadowsMax} shadowed at most · received ${outKBs.toFixed(2)} KB/s outside, ${inKBs.toFixed(2)} KB/s inside (the shadowed's share outside: ${(outKBs - inKBs).toFixed(2)}) · ${awake} struck down`,
  );
for (const t of timers) clearInterval(t);
await server.gracefullyShutdown(false);
// (inside, nothing of the dark arrives: what it receives is the people; outside, the shadowed add theirs)
process.exit(avg <= BUDGET_MS && snaps === 0 && (!DARK || outKBs - inKBs <= 6) ? 0 : 1);
