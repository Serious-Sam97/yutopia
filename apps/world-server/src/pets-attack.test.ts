import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { KNOCK } from "@yutopia/shared/pool-throw";
import { Client, type Room } from "colyseus.js";

// Get him (docs/plan/52-the-pet-two.md, D8): Ana sets her dog on Bia — it runs to her, she's down and
// stays down (past a knock's time) while it bites; only Ana calls it off ("leave", or any command);
// it ends too with Ana gone from the world, or Bia gone; not someone in a car, not Ana herself.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 28070 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
});
after(async () => {
  const bounded = <T>(p: Promise<T>) => Promise.race([p, sleep(1000)]);
  await Promise.all(rooms.map((r) => bounded(r.leave(true).catch(() => {}))));
  await bounded(server.gracefullyShutdown(false));
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});
async function waitFor(fn: () => boolean, ms = 8000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error(`timeout: ${fn.toString().slice(0, 90)}`);
    await sleep(25);
  }
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
type S = any;
interface Who {
  room: Room;
  events: string[];
  toasts: string[];
}
const me = (w: Who): S => w.room.state.players.get(w.room.sessionId);
async function join(uid: number, sandbox: number): Promise<Who> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder`,
  });
  rooms.push(room);
  const w: Who = { room, events: [], toasts: [] };
  room.onMessage("pet:event", (m: { kind: string }) => w.events.push(m.kind));
  room.onMessage("toast", (m: { text: string }) => w.toasts.push(m.text));
  for (const t of ["snap", "spawn:mine", "media:key", "hear", "pet:challenge", "knock"]) room.onMessage(t, () => {});
  await waitFor(() => !!room.state.players?.get(room.sessionId) && room.state.objects?.size > 0);
  return w;
}
const leave = async (w: Who) => {
  rooms.splice(rooms.indexOf(w.room), 1);
  await w.room.leave(true);
};
const LOBBY = { x: 6.5, y: 24.5 };

test("get him: down and held past a knock's time, till she calls it off; not her, not someone out of reach", async () => {
  const ana = await join(111, 91);
  const bia = await join(112, 91);
  for (const w of [ana, bia]) w.room.send("teleport", { to: LOBBY });
  ana.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => [...ana.room.state.pets.values()].some((p: S) => p.sid === ana.room.sessionId));
  const rex: S = [...ana.room.state.pets.values()].find((p: S) => p.sid === ana.room.sessionId);
  const bOf = (): S => ana.room.state.players.get(bia.room.sessionId);
  // not herself
  ana.room.send("pet:cmd", { id: rex.id, cmd: "attack", target: ana.room.sessionId });
  await waitFor(() => ana.events.includes("attackNo"));
  // Bia, a few steps off: it runs to her, she's down
  bia.room.send("teleport", { to: { x: LOBBY.x + 4, y: LOBBY.y + 1 } });
  await waitFor(() => Math.hypot(me(bia).x - LOBBY.x - 4, me(bia).y - LOBBY.y - 1) < 2);
  ana.room.send("pet:cmd", { id: rex.id, cmd: "attack", target: bia.room.sessionId });
  await waitFor(() => bOf().bitBy === rex.id, 10_000);
  assert.ok(bOf().fellAt > 0, "down");
  await waitFor(() => bia.toasts.some((t) => /Rex \(P111's dog\) has you/.test(t)));
  assert.equal(rex.act, "attack");
  // still down well past a knock's time
  await sleep(KNOCK.secs * 1000 + 1500);
  assert.equal(bOf().bitBy, rex.id);
  assert.ok(bOf().fellAt > 0, "still down");
  // Bia can't call it off
  bia.room.send("pet:cmd", { id: rex.id, cmd: "leave" });
  await sleep(400);
  assert.equal(bOf().bitBy, rex.id);
  // Ana does: up again
  ana.room.send("pet:cmd", { id: rex.id, cmd: "leave" });
  await waitFor(() => bOf().bitBy === "" && bOf().fellAt === 0);
  assert.equal(rex.act, "");
  // again, then any other word ends it too
  ana.room.send("pet:cmd", { id: rex.id, cmd: "attack", target: bia.room.sessionId });
  await waitFor(() => bOf().bitBy === rex.id, 10_000);
  ana.room.send("pet:cmd", { id: rex.id, cmd: "come" });
  await waitFor(() => bOf().bitBy === "");
  // Bia far off (more than its reach): not sent
  bia.room.send("teleport", { to: { x: LOBBY.x + 40, y: LOBBY.y } });
  await waitFor(() => Math.hypot(me(bia).x - me(ana).x, me(bia).y - me(ana).y) > 30);
  ana.events.length = 0;
  ana.room.send("pet:cmd", { id: rex.id, cmd: "attack", target: bia.room.sessionId });
  await waitFor(() => ana.events.includes("attackNo"));
  ana.room.send("pet:release", { id: rex.id });
});

test("it ends with its owner gone from the world, or the one it holds gone", async () => {
  const ana = await join(113, 92);
  const bia = await join(114, 92);
  const cai = await join(115, 92);
  for (const w of [ana, bia, cai]) w.room.send("teleport", { to: LOBBY });
  ana.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => [...ana.room.state.pets.values()].some((p: S) => p.sid === ana.room.sessionId));
  const rex: S = [...ana.room.state.pets.values()].find((p: S) => p.sid === ana.room.sessionId);
  const id = rex.id;
  ana.room.send("pet:cmd", { id, cmd: "attack", target: bia.room.sessionId });
  const bSeen = (): S => cai.room.state.players.get(bia.room.sessionId);
  await waitFor(() => bSeen()?.bitBy === id, 10_000);
  // Ana out of the world: Bia's up
  await leave(ana);
  await waitFor(() => bSeen()?.bitBy === "" && bSeen()?.fellAt === 0);
  // Ana back, Rex hers again; on Cai, and Cai leaves: it lets go (nobody to hold)
  const back = await join(113, 92);
  back.room.send("teleport", { to: LOBBY });
  await waitFor(() => (back.room.state.pets.get(id) as S)?.sid === back.room.sessionId, 10_000);
  back.room.send("pet:cmd", { id, cmd: "follow" });
  await sleep(1500);
  back.room.send("pet:cmd", { id, cmd: "attack", target: cai.room.sessionId });
  const r = (): S => back.room.state.pets.get(id);
  await waitFor(() => r().act === "attack", 10_000);
  await leave(cai);
  await waitFor(() => r().act !== "attack");
  back.room.send("pet:release", { id });
});
