import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// Waiting in the office (docs/plan/51-the-pet.md, phase 4): left there by its owner standing in it with
// it; it keeps to the room — its owner gone off, out of the world and back; sent
// there from anywhere, it goes; hungry, its office's bowl; a friend knocking, to the door; the room no
// longer its owner's, it waits where it is.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27170 + Math.floor(Math.random() * 100);
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
}
const me = (w: Who): S => w.room.state.players.get(w.room.sessionId);
async function join(uid: number, sandbox: number): Promise<Who> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder`,
  });
  rooms.push(room);
  const w: Who = { room, events: [] };
  room.onMessage("pet:event", (m: { kind: string }) => w.events.push(m.kind));
  for (const t of ["toast", "snap", "spawn:mine", "media:key", "hear", "knock", "pet:challenge"])
    room.onMessage(t, () => {});
  await waitFor(() => !!room.state.players?.get(room.sessionId) && room.state.objects?.size > 0);
  return w;
}
const leave = async (w: Who) => {
  rooms.splice(rooms.indexOf(w.room), 1);
  await w.room.leave(true);
};
// the studio's War Room (shared maps: x 29..48, y 0..12, on the home floor), made someone's office
const OFFICE = { x: 38.5, y: 6.5 };
const inOffice = (p: { x: number; y: number }) => p.x > 29 && p.x < 48 && p.y > 0 && p.y < 12;
const LOBBY = { x: 6.5, y: 24.5 };

test("left in the office: it keeps to it — its owner off, out of the world, back; follow takes it back", async () => {
  const ana = await join(81, 71);
  ana.room.send("map:room:update", { key: "war-room", ownerId: 81, ownerName: "P81" });
  ana.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => [...ana.room.state.pets.values()].some((p: S) => p.sid === ana.room.sessionId));
  const rex: S = [...ana.room.state.pets.values()].find((p: S) => p.sid === ana.room.sessionId);
  // in the lobby: "wait in my office" isn't for here
  ana.room.send("teleport", { to: LOBBY });
  await waitFor(() => Math.hypot(me(ana).x - LOBBY.x, me(ana).y - LOBBY.y) < 2);
  ana.room.send("pet:cmd", { id: rex.id, cmd: "home" });
  await waitFor(() => ana.events.includes("notInOffice"));
  // in her office with him: there it is
  ana.room.send("teleport", { to: OFFICE });
  await waitFor(() => inOffice(me(ana)));
  await waitFor(() => inOffice(rex), 15_000);
  ana.room.send("pet:cmd", { id: rex.id, cmd: "home" });
  await waitFor(() => rex.mode === "home");
  assert.ok(ana.events.includes("home"));
  // off she goes: he stays in the room
  ana.room.send("teleport", { to: LOBBY });
  await waitFor(() => Math.hypot(me(ana).x - LOBBY.x, me(ana).y - LOBBY.y) < 2);
  await sleep(4000);
  assert.ok(inOffice(rex), `in the office: ${rex.x},${rex.y}`);
  assert.equal(rex.mode, "home");
  await waitFor(() => /War Room/.test(rex.seen), 7000);
  // out of the world (Cai about, the world open — offline, a room's owner isn't kept when it shuts):
  // back, he's at home still
  const cai = await join(82, 71);
  const seen = (): S => cai.room.state.pets.get(rex.id);
  await leave(ana);
  await waitFor(() => seen()?.sid === "");
  await sleep(3000);
  assert.ok(inOffice(seen()) && seen().mode === "home", "home with her away");
  const back = await join(81, 71);
  await waitFor(() => [...back.room.state.pets.values()].some((p: S) => p.name === "Rex"));
  const again: S = [...back.room.state.pets.values()].find((p: S) => p.name === "Rex");
  await waitFor(() => again.sid === back.room.sessionId);
  assert.equal(again.mode, "home");
  assert.ok(inOffice(again));
  await sleep(3000);
  assert.ok(inOffice(again), "it keeps to the room");
  // follow (from the lobby): with her again
  back.room.send("pet:cmd", { id: again.id, cmd: "follow" });
  await waitFor(() => again.mode === "follow");
  await waitFor(() => !inOffice(again), 15_000);
  back.room.send("pet:release", { id: again.id });
});

test("sent home from the lobby, it goes; hungry, its office's bowl; a friend knocks, it comes to the door; the room given away, it waits", async () => {
  const ana = await join(83, 72);
  ana.room.send("map:room:update", { key: "war-room", ownerId: 83, ownerName: "P83" });
  // a bowl in the office, with something in it
  ana.room.send("obj:batch", {
    items: [{ id: "h-bowl", kind: "pet_bowl", x: 44, y: 3, rot: 0, props: { portions: 3 } }],
  });
  await waitFor(() => !!ana.room.state.objects.get("h-bowl"));
  ana.room.send("pet:adopt", { species: "dog", name: "Bo" });
  await waitFor(() => [...ana.room.state.pets.values()].some((p: S) => p.sid === ana.room.sessionId));
  const bo: S = [...ana.room.state.pets.values()].find((p: S) => p.sid === ana.room.sessionId);
  ana.room.send("teleport", { to: LOBBY });
  await waitFor(() => Math.hypot(me(ana).x - LOBBY.x, me(ana).y - LOBBY.y) < 2);
  await sleep(1500);
  ana.room.send("pet:cmd", { id: bo.id, cmd: "gohome" });
  await waitFor(() => bo.mode === "home");
  await waitFor(() => inOffice(bo), 30_000);
  // hungry: to the bowl, and eats
  ana.room.send("pet:test", { id: bo.id, needs: { food: 20 } });
  await waitFor(() => bo.act === "eat", 20_000);
  await waitFor(() => bo.food > 20, 10_000);
  ana.room.send("pet:test", { id: bo.id, needs: { food: 100 } });
  // a friend at the locked door: he comes over to it, inside
  const bia = await join(84, 72);
  ana.room.send("pet:test", { id: bo.id, bonds: { "84": 60 } });
  await sleep(500);
  // (in the hall, by the office's wall: a knock)
  bia.room.send("teleport", { to: { x: 38.5, y: 13.5 } });
  await waitFor(() => Math.hypot(me(bia).x - 38.5, me(bia).y - 13.5) < 1.5);
  bia.room.send("knock", { area: "war-room" });
  const at = { x: me(bia).x, y: me(bia).y };
  await waitFor(() => Math.hypot(bo.x - at.x, bo.y - at.y) < 3.5, 15_000);
  assert.ok(inOffice(bo), `inside, by the door: ${bo.x},${bo.y}, Bia at ${at.x},${at.y}, ${bo.act}`);
  assert.equal(bo.mode, "home");
  // the room given to someone else: he waits where he is
  ana.room.send("map:room:update", { key: "war-room", ownerId: 99, ownerName: "P99" });
  await waitFor(() => bo.mode === "wait", 10_000);
  ana.room.send("pet:release", { id: bo.id });
});
