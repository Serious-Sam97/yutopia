// Server perf budget: an offline world-server with N bots walking real paths.
// Fails if the average tick (features + simulation) goes over budget, or if
// the server puts back an honest walk, jog or sprint (docs/plan/29-the-move.md).
// A sixth of them are out on the land, sprinting laps of the frozen pond with
// stamina in play (docs/plan/30-the-dark.md D2): out of breath they jog, as the
// client does, and say so.
//   pnpm --filter @yutopia/world-server perf

import { monitorEventLoopDelay } from "node:perf_hooks";
import { ANIM, dirFromDelta, findPath, type Point, ROOM_NAME } from "@yutopia/shared";
import { dayNests, dayOf, NESTS } from "@yutopia/shared/dark";
import { CHUNK, checkEdits, GROUNDS, heightAt, SURFACES, walkableTile } from "@yutopia/shared/grounds";
import { encodeBytes, encodeHeights, type GroundsEdits } from "@yutopia/shared/grounds-edits";
import { type Gait, MOVE, MV_WINDED, packMv, yawToByte } from "@yutopia/shared/move";
import { FULL_VITALS, freshClock, stepVitals } from "@yutopia/shared/vitals";
import { Client, type Room } from "colyseus.js";

// DARK=1 (docs/plan/30-the-dark.md phase 4): 50 bots, 40 of them out on the pond at night,
// the shadowed up to their 40 (brought out quickly); the bytes one outside and one inside
// receive a second, against 6 KB/s outside and ~0 inside.
const DARK = process.env.DARK === "1";
// DAY=1 (docs/plan/31-the-day.md phase 4): 50 bots by day, 40 out — half of them stood ~30 tiles
// from a nest each (its sleepers out), half sprinting laps of the pond (waking the nests there)
const DAY = process.env.DAY === "1";
if (DARK) process.env.YUTOPIA_DARK_FAST = "1";
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET ??= "perf";
process.env.YUTOPIA_INTERNAL_SECRET ??= "perf";
// GOD=1 (docs/plan/53-the-god-mode.md, phase 11): a third of the way in, an admin publishes ~4 MB
// of edits (the land lifted and painted over ~300 chunks of the woods, away from everyone) and,
// once every bot has it, rolls it back: both revisions reach every bot, nobody's put back, and the
// server's own work on each (checked against the rule book and laid: the handler's time, as
// metered) stays under GOD_MS. (The event loop's longest stall is shown too, not held: the bots
// share this process.)
const GOD = process.env.GOD === "1";
const GOD_MS = 200;
const BOTS = Number(process.env.BOTS ?? (DARK || DAY ? 50 : 60));
const SECONDS = Number(process.env.SECONDS ?? 15);
const BUDGET_MS = 4;
const PORT = 27600 + Math.floor(Math.random() * 200);

const { startWorldServer } = await import("./server.ts");
const server = await startWorldServer(PORT);
const { WorldRoom } = await import("./WorldRoom.ts");
// (the physics world's land built first, as a live server's is long before anyone's on it: till a
// chunk's in, moves there are the grid's word, then Jolt's — docs/plan/50-the-volume.md)
const chunks = async () =>
  Number(
    /^yutopia_physics_ground_chunks ([\d.]+)$/m.exec(
      await (await fetch(`http://localhost:${PORT}/metrics`)).text(),
    )?.[1] ?? NaN,
  );
const timers: ReturnType<typeof setInterval>[] = [];
let snaps = 0;
const bytes = { out: 0, in: 0 }; // received by one bot outside, one inside (DARK)
const outside = (i: number) => (DARK || DAY ? i % 5 !== 0 : i % 6 === 5);
const nests = DAY ? dayNests(dayOf(Date.now())).slice(0, NESTS.base) : [];
// a walkable spot ~30 tiles from a nest, clear of every nest by 20 (they sleep on)
function by(n: { x: number; z: number }): { x: number; y: number } | null {
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const x = Math.floor(n.x + Math.cos(a) * 30) + 0.5;
    const z = Math.floor(n.z + Math.sin(a) * 30) + 0.5;
    if (walkableTile(Math.floor(x), Math.floor(z)) && nests.every((m) => Math.hypot(m.x - x, m.z - z) > 20))
      return { x: x + 60, y: z + 10 };
  }
  return null;
}
const rooms: Room[] = [];
let winded = 0; // times an outdoor bot ran out of breath
let awake = 0; // bots struck down (DARK)

if (process.env.YUTOPIA_PHYSICS !== "0") {
  // (the room and its physics world are made with the first one in)
  const first = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 1,
    token: "bot:799999:B",
  });
  const t0 = Date.now();
  while (!((await chunks()) >= 1184) && Date.now() - t0 < 120_000) await new Promise((r) => setTimeout(r, 300));
  // (it stays, standing: an empty room would go, its physics world with it)
  first.onMessage("*", () => {});
}
for (let i = 0; i < BOTS; i++) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 1,
    // (the ones out on the land: builders, to be put there — bots can't teleport)
    token: outside(i) ? `dev:${800000 + i}:B${i}:member,builder,admin` : `bot:${800000 + i}:B${i}`,
  });
  rooms.push(room);
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
  // (by day, half stand by a nest each)
  const scout = DAY && out && i % 2 === 0 ? by(nests[Math.floor(i / 2) % nests.length]) : null;
  if (out) {
    const lane = DARK || DAY ? -60 + ((i * 3) % 24) - 12 : -60 + ((i * 7) % 20) - 10;
    const from = scout ?? { x: -280 + 60, y: lane + 10 };
    room.send("teleport", { to: { ...from, level: 0 } });
    await new Promise<void>((r) => room.onMessage("snap", () => r()));
    Object.assign(pos, from);
    placed = true;
    // (the night, for the dark's run; kept on their feet: the shadowed strike)
    if (DAY && i === 1) {
      room.send("mod:hour", { h: 12 });
      room.send("mod:storm", { storm: 0, now: true });
      room.send("mod:dark", { mode: "normal" });
    }
    if (DARK && i === 1) {
      room.send("mod:hour", { h: 23 });
      room.send("mod:storm", { storm: 0, now: true });
      room.send("mod:dark", { mode: "normal" });
    }
    if (DARK || DAY) timers.push(setInterval(() => room.send("mod:refill", {}), 2500));
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
  // (each step as far as the time since the last says, as a client's: a bot's timer held up and
  // then run twice at once — 200 bots share the server's thread — mustn't look like a dash)
  let lastAt = performance.now();
  timers.push(
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastAt) / 1000);
      lastAt = now;
      if (woken || scout) return;
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
          dt,
        );
        if (breath.winded && !was) winded++;
        pos.x += (east ? 1 : -1) * MOVE[g] * dt;
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
          mt: Math.round(now) >>> 0,
        });
        return;
      }
      if (!path.length) {
        const a = areas[Math.floor(Math.random() * areas.length)];
        path = findPath(grid, pos, { x: a.x + Math.random() * a.w, y: a.y + Math.random() * a.h }) ?? [];
      }
      let budget = speed * dt;
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
        mt: Math.round(now) >>> 0,
      });
    }, 50),
  );
}

// warm up, reset, measure (the dark: once the shadowed are out; the day: once the nests by the scouts are)
if (DAY) {
  const t0 = Date.now();
  while ((WorldRoom.current?.state.shadows.size ?? 0) < 30 && Date.now() - t0 < 60_000)
    await new Promise((r) => setTimeout(r, 200));
}
if (DARK) {
  const t0 = Date.now();
  while ((WorldRoom.current?.state.shadows.size ?? 0) < 35 && Date.now() - t0 < 60_000)
    await new Promise((r) => setTimeout(r, 200));
}
// PETS=n (docs/plan/51-the-pet.md, phase 5): n pets out in the world on their own — their owners in
// for a moment to adopt three each, then gone: one of each three lost out on the land (wandering
// legs, the dangers in play), the others waiting in the building where they were left
const PETS = Number(process.env.PETS ?? 0);
const SPECIES = ["dog", "cat", "rabbit", "platypus", "capybara", "parrot"];
let lostN = 0;
for (let i = 0; i < PETS; i += 3) {
  const owner = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 1,
    token: `dev:${900000 + i}:O${i}:member,builder,admin`,
  });
  owner.onMessage("*", () => {});
  const n = Math.min(3, PETS - i);
  for (let k = 0; k < n; k++) owner.send("pet:adopt", { species: SPECIES[(i + k) % 6], name: `P${i + k}` });
  const mine = () =>
    // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
    [...(owner.state.pets?.values() ?? [])].filter((p: any) => p.sid === owner.sessionId) as { id: string }[];
  for (let t = 0; t < 100 && mine().length < n; t++) await new Promise((r) => setTimeout(r, 50));
  const first = mine()[0];
  if (first) {
    // (on the open ground west of the lot: the shared grounds' metres -148, -4, spread about)
    const at = { x: -88 + (Math.random() - 0.5) * 40, y: 6 + (Math.random() - 0.5) * 40 };
    owner.send("pet:test", { id: first.id, at, lose: true });
    lostN++;
  }
  await new Promise((r) => setTimeout(r, 200));
  await owner.leave(true);
}
// GOD: the edits (lifted 1.5 m at most in long waves, painted in bands), chunk by chunk where the
// rule book takes them and 40 m clear of the pond's laps, till they're ~4 MB
const N = CHUNK * 2 + 1;
const big: GroundsEdits = { rev: 0, height: {}, paint: {} };
let bigBytes = 0;
if (GOD) {
  const near = (cx: number, cz: number) =>
    cx * CHUNK < -200 + 40 && (cx + 1) * CHUNK > -280 - 40 && cz * CHUNK < -48 + 40 && (cz + 1) * CHUNK > -72 - 40;
  for (let cz = Math.ceil(GROUNDS.z0 / CHUNK); cz * CHUNK < GROUNDS.z1 && bigBytes < 4e6; cz++)
    for (let cx = Math.ceil(GROUNDS.x0 / CHUNK); cx * CHUNK < GROUNDS.x1 && bigBytes < 4e6; cx++) {
      if (near(cx, cz)) continue;
      const h = new Int16Array(N * N);
      for (let i = 0; i < N * N; i++) {
        const x = cx * CHUNK + (i % N) * 0.5;
        const z = cz * CHUNK + Math.floor(i / N) * 0.5;
        h[i] = Math.round(150 * Math.sin(x / 23) * Math.cos(z / 31)) || 1;
      }
      const pt = new Uint8Array(CHUNK * CHUNK);
      for (let i = 0; i < pt.length; i++) pt[i] = 1 + (Math.floor(((i % CHUNK) + cx * CHUNK) / 6) % SURFACES.length);
      const k = `${cx},${cz}`;
      const hs = encodeHeights(h);
      const ps = encodeBytes(pt);
      if (checkEdits({ rev: 0, height: { [k]: hs }, paint: { [k]: ps } }).length) continue;
      (big.height as Record<string, string>)[k] = hs;
      (big.paint as Record<string, string>)[k] = ps;
      // (as JSON: the two strings, their keys quoted, a colon and a comma each)
      bigBytes += hs.length + ps.length + 2 * (k.length + 4);
    }
  bigBytes = JSON.stringify(big).length;
  const no = checkEdits(big);
  if (no.length) throw new Error(`the edits refused: ${no.slice(0, 3).join("; ")}`);
}
const god = GOD
  ? await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
      sandbox: 1,
      token: "dev:899999:God:member,builder,admin",
    })
  : null;
const godSaid: string[] = [];
god?.onMessage("*", (t) => godSaid.push(String(t)));
const godRun = { publish: NaN, rollback: NaN, ok: !GOD };
const everyoneAt = async (rev: number, t0: number) => {
  while (!rooms.every((r) => r.state.groundsRev === rev)) {
    if (performance.now() - t0 > 60_000) throw new Error(`not every bot got revision ${rev}`);
    await new Promise((r) => setTimeout(r, 10));
  }
  return performance.now() - t0;
};
bytes.out = 0;
bytes.in = 0;
let shadowsMax = 0;
const watch = setInterval(() => {
  shadowsMax = Math.max(shadowsMax, WorldRoom.current?.state.shadows.size ?? 0);
}, 200);
// the server's own work on the messages (each type timed: metrics.ts — since the last scrape, so
// the second one's are the run's)
const handled = (text: string) => {
  let ms = 0;
  let n = 0;
  for (const m of text.matchAll(/^yutopia_message_ms_sum\{type="([^"]+)"\} ([\d.]+)$/gm)) ms += Number(m[2]);
  for (const m of text.matchAll(/^yutopia_message_count\{type="pos"\} (\d+)$/gm)) n += Number(m[1]);
  const pos = Number(/^yutopia_message_ms_sum\{type="pos"\} ([\d.]+)$/m.exec(text)?.[1] ?? 0);
  return { ms, n, pos };
};
await fetch(`http://localhost:${PORT}/metrics`);
const cpu0 = process.cpuUsage();
const stalls = monitorEventLoopDelay({ resolution: 5 });
stalls.enable();
if (god) {
  const { offlineDrafts } = await import("./features/godmode.ts");
  await new Promise((r) => setTimeout(r, (SECONDS * 1000) / 3));
  const was = god.state.groundsRev as number;
  offlineDrafts.set(899999, { userId: 899999, name: "perf", baseRev: was, data: { ...big, rev: was } });
  let t0 = performance.now();
  god.send("god:publish", { draftId: 899999, note: "perf" });
  godRun.publish = await everyoneAt(was + 1, t0);
  t0 = performance.now();
  god.send("god:rollback", { rev: was });
  godRun.rollback = await everyoneAt(was + 2, t0);
  godRun.ok = !godSaid.includes("god:refused");
  await new Promise((r) => setTimeout(r, (SECONDS * 1000) / 3));
} else await new Promise((r) => setTimeout(r, SECONDS * 1000));
stalls.disable();
const stallMax = stalls.max / 1e6;
const cpu = process.cpuUsage(cpu0);
const text = await (await fetch(`http://localhost:${PORT}/metrics`)).text();
const after = handled(text);
const godMs = (t: string) =>
  Number(new RegExp(`^yutopia_message_ms_max\\{type="god:${t}"\\} ([\\d.]+)$`, "m").exec(text)?.[1] ?? NaN);
const godWork = { publish: godMs("publish"), rollback: godMs("rollback") };
const avg = Number(/yutopia_tick_ms_avg ([\d.]+)/.exec(text)?.[1] ?? "NaN");
const max = Number(/yutopia_tick_ms_max ([\d.]+)/.exec(text)?.[1] ?? "NaN");
const cpuPct = ((cpu.user + cpu.system) / 1000 / (SECONDS * 1000)) * 100;
clearInterval(watch);
console.log(
  `[perf] ${BOTS} bots${PETS ? ` · ${WorldRoom.current?.state.pets.size ?? 0} pets out (${lostN} lost)` : ""} · tick avg ${avg} ms · max ${max} ms · process CPU ${cpuPct.toFixed(0)}% (incl. the bots themselves) · ${snaps} put back · out of breath ${winded} times outside`,
);
// (the moves checked on Jolt: what each costs, and the server's share of a core for every message)
const moves = after.n;
console.log(
  `[perf] messages: ${(after.ms / SECONDS / 10).toFixed(1)}% of a core · ${(moves / SECONDS).toFixed(0)} moves a second, ${moves ? ((after.pos / moves) * 1000).toFixed(0) : "—"} µs each`,
);
const outKBs = bytes.out / 1024 / SECONDS;
const inKBs = bytes.in / 1024 / SECONDS;
if (DAY)
  console.log(
    `[perf] the day: ${shadowsMax} of the nests' out at most · received ${outKBs.toFixed(2)} KB/s outside, ${inKBs.toFixed(2)} KB/s inside · ${awake} struck down`,
  );
if (DARK)
  console.log(
    `[perf] the dark: ${shadowsMax} shadowed at most · received ${outKBs.toFixed(2)} KB/s outside, ${inKBs.toFixed(2)} KB/s inside (the shadowed's share outside: ${(outKBs - inKBs).toFixed(2)}) · ${awake} struck down`,
  );
if (GOD)
  console.log(
    `[perf] god mode: ${(bigBytes / 1e6).toFixed(2)} MB over ${Object.keys(big.height ?? {}).length} chunks · the server's work on it ${godWork.publish.toFixed(0)} ms, on the roll back ${godWork.rollback.toFixed(0)} ms (held under ${GOD_MS}) · every bot had it in ${godRun.publish.toFixed(0)} ms, the roll back in ${godRun.rollback.toFixed(0)} ms · the event loop's longest stall ${stallMax.toFixed(0)} ms${godRun.ok ? "" : " · REFUSED"}`,
  );
for (const t of timers) clearInterval(t);
await server.gracefullyShutdown(false);
// (inside, nothing of the dark arrives: what it receives is the people; outside, the shadowed add theirs)
process.exit(
  avg <= BUDGET_MS &&
    snaps === 0 &&
    (!DARK || outKBs - inKBs <= 6) &&
    godRun.ok &&
    (!GOD || Math.max(godWork.publish, godWork.rollback) <= GOD_MS)
    ? 0
    : 1,
);
