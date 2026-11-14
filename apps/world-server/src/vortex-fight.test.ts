import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import type { Inventory } from "@yutopia/shared/inventory";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { VORTEX_FIGHT } from "@yutopia/shared/vortex-fight";
import { Client, type Room } from "colyseus.js";

// The fight with Vortex (docs/plan/88-vortex-fight.md phase 1): shot, he's hurt — his health a fraction, the acts by
// it, who's in it told to everyone; two of them shooting; beaten — his tape where he fell, everyone told, nothing
// hits him while he's down; an admin's reset.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 33100 + Math.floor(Math.random() * 100); // (its own hundred)
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
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const vx = (room: Room): any => room.state.npcs.get("vortex");
interface Person {
  room: Room;
  inv: Inventory | null;
  hits: { id: string; kind: string }[];
  fight: { who: { sid: string; name: string; hits: number }[] }[];
  down: { by: string; secs: number }[];
}
async function person(uid: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 41,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, hits: [], fight: [], down: [] };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("arms:hit", (m: Person["hits"][number]) => who.hits.push(m));
  room.onMessage("vortex:fight", (m: Person["fight"][number]) => who.fight.push(m));
  room.onMessage("vortex:down", (m: Person["down"][number]) => who.down.push(m));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId) && !!vx(room));
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  return who;
}
// a revolver drawn, aimed at him, a shot — from where they stand, at his middle
async function armed(p: Person) {
  p.room.send("mod:refill", { kit: true });
  await waitFor(() => p.inv?.quick[0]?.id === "revolver");
  p.room.send("arms:draw", { slot: 0 });
  await waitFor(() => me(p.room).gun === "revolver");
  await sleep(900);
}
function shoot(p: Person) {
  const m = me(p.room);
  const v = vx(p.room);
  const yaw = Math.atan2(v.y - m.y, v.x - m.x);
  p.room.send("pos", {
    x: m.x,
    y: m.y,
    z: m.z,
    a: 0,
    seq: 0,
    mv: packMv("still") | MV_AIM,
    yaw: yawToByte(yaw + AIM_BLADE),
    pitch: 0,
  });
  const oz = 1.35;
  const pitch = Math.atan2(VORTEX_FIGHT.z0 + VORTEX_FIGHT.h / 2 - oz, Math.hypot(v.x - m.x, v.y - m.y));
  setTimeout(() => p.room.send("arms:fire", { ox: m.x, oy: m.y, oz, yaw, pitch, lag: 0, seed: 7 }), 60);
}

test("shot, Vortex is hurt: his health, the acts, who's in it; two shooting; beaten — his tape, everyone told", async () => {
  const a = await person(881);
  const b = await person(882);
  // him held beside A, B a step back and aside (both arrive on the same spot: out of A's line)
  const m = me(a.room);
  b.room.send("teleport", { to: { x: m.x - 1.5, y: m.y + 1.5, level: m.level } });
  await waitFor(() => Math.hypot(me(b.room).x - (m.x - 1.5), me(b.room).y - (m.y + 1.5)) < 0.6);
  a.room.send("mod:vortex", { reset: true, hold: true, at: { x: m.x + 2.5, y: m.y } });
  await waitFor(() => Math.abs(vx(a.room).x - (m.x + 2.5)) < 0.01);
  await armed(a);
  // a hit: his health down, act I, who's in it — on both screens
  shoot(a);
  await waitFor(() => a.hits.some((h) => h.kind === "vortex"));
  await waitFor(() => vx(b.room).vk < 1 && vx(b.room).vact === 1);
  await waitFor(() => b.fight.at(-1)?.who[0]?.sid === a.room.sessionId);
  assert.equal(b.fight.at(-1)?.who[0]?.hits, 1);
  // an act set (an admin's): II, his face with it
  a.room.send("mod:vortex", { act: 2 });
  await waitFor(() => vx(b.room).vact === 2 && vx(b.room).mood === "fury");
  // B in it too (him moved in front of her, away from A's line): two told
  await armed(b);
  a.room.send("mod:vortex", { at: { x: m.x - 1.5, y: m.y + 4 } });
  await waitFor(() => Math.abs(vx(b.room).y - (m.y + 4)) < 0.01);
  const k = vx(a.room).vk;
  shoot(b);
  await waitFor(() => vx(a.room).vk < k);
  await waitFor(() => (a.fight.at(-1)?.who.length ?? 0) === 2);
  // beaten: everyone told, his tape where he fell; while he's down nothing hits him
  a.room.send("mod:vortex", { beat: true });
  await waitFor(() => a.down.length === 1 && b.down.length === 1);
  await waitFor(() => vx(a.room).mood === "dead");
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const tape = (): any => [...a.room.state.drops.values()].find((d: { item: string }) => d.item === "vxtape");
  await waitFor(() => !!tape());
  assert.ok(Math.hypot(tape().x - vx(a.room).x, tape().y - vx(a.room).y) < 0.6, "where he fell");
  const before = a.hits.filter((h) => h.kind === "vortex").length;
  shoot(a);
  await sleep(500);
  assert.equal(a.hits.filter((h) => h.kind === "vortex").length, before, "down: no hits");
  // an admin's reset: up, no fight
  a.room.send("mod:vortex", { reset: true, hold: false });
  await waitFor(() => vx(a.room).vact === 0 && vx(a.room).vgone === 0 && vx(a.room).mood === "smug");
  await waitFor(() => a.fight.at(-1)?.who.length === 0);
});
