// Bot swarm: N fake people wandering the real world (needs YUTOPIA_ALLOW_BOTS=1
// on the world-server). Usage:
//   pnpm tsx tools/bots.mts --count 45 [--url ws://localhost:2567] [--seconds 120] [--chatty]
import {
  ANIM,
  avatarFromSeed,
  dirFromDelta,
  findPath,
  Grid,
  getMap,
  type Point,
  ROOM_NAME,
  WALK_SPEED,
} from "@yutopia/shared";
import { Client, getStateCallbacks } from "colyseus.js";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const COUNT = Number(arg("count", "45"));
const URL = arg("url", "ws://localhost:2567");
const SECONDS = Number(arg("seconds", "120"));
const CHATTY = process.argv.includes("--chatty");
const map = getMap("studio");

async function bot(i: number) {
  const id = 900000 + i;
  const room = await new Client(URL).joinOrCreate(ROOM_NAME, {
    token: `bot:${id}:Bot ${String(i + 1).padStart(2, "0")}`,
  });
  await new Promise<void>((r) => (room.state?.players ? r() : room.onStateChange.once(() => r())));
  const $ = getStateCallbacks(room);
  let grid = Grid.from(map, map.objects);
  $(room.state).objects.onAdd(() => {
    grid = Grid.from(
      map,
      [...room.state.objects.values()].map((o: { id: string; kind: string; x: number; y: number; rot: number }) => ({
        id: o.id,
        kind: o.kind,
        x: o.x,
        y: o.y,
        rot: o.rot,
      })),
    );
  });
  const me = room.state.players.get(room.sessionId);
  const pos: Point = { x: me.x, y: me.y };
  let path: Point[] = [];
  let wait = Math.random() * 3;
  let d = 0;
  let seq = 0;
  void avatarFromSeed(id);
  room.onMessage("snap", (m: Point) => {
    pos.x = m.x;
    pos.y = m.y;
    path = [];
  });
  for (const t of ["hear", "chat", "toast", "knock", "vortex:say", "admitted", "wb:scene", "kicked"])
    room.onMessage(t, () => {});
  const dt = 0.05;
  const timer = setInterval(() => {
    if (!path.length) {
      wait -= dt;
      if (wait > 0) return;
      for (let tries = 0; tries < 20 && !path.length; tries++) {
        const a = map.areas[Math.floor(Math.random() * map.areas.length)];
        if (a.kind === "booth") continue;
        const target = { x: a.x + Math.random() * a.w, y: a.y + Math.random() * a.h };
        path = findPath(grid, pos, target) ?? [];
      }
      wait = 2 + Math.random() * 6;
      if (CHATTY && Math.random() < 0.15) room.send("chat", { text: "beep boop 📼", scope: "nearby" });
      if (Math.random() < 0.1)
        room.send("emote", { e: ["wave", "tape", "coffee", "clap"][Math.floor(Math.random() * 4)] });
    }
    let budget = WALK_SPEED * dt;
    while (budget > 0 && path.length) {
      const wp = path[0];
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) d = dirFromDelta(dx, dy);
      if (dist <= budget) {
        pos.x = wp.x;
        pos.y = wp.y;
        budget -= dist;
        path.shift();
      } else {
        pos.x += (dx / dist) * budget;
        pos.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    room.send("pos", { x: pos.x, y: pos.y, d, a: path.length ? ANIM.walk : ANIM.idle, seq: ++seq });
  }, dt * 1000);
  return () => {
    clearInterval(timer);
    return room.leave(true);
  };
}

const stops: (() => Promise<unknown>)[] = [];
for (let i = 0; i < COUNT; i++) {
  stops.push(await bot(i));
  await new Promise((r) => setTimeout(r, 40));
}
console.log(`[bots] ${COUNT} bots wandering the world for ${SECONDS}s`);
setTimeout(async () => {
  await Promise.all(stops.map((s) => s().catch(() => {})));
  console.log("[bots] done");
  process.exit(0);
}, SECONDS * 1000);
