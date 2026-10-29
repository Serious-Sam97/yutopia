import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// A smarter dog (docs/plan/52-the-pet-two.md, D2–D4): neglected, it sulks; its owner busy, it lies
// down quiet by them; a stranger by them in the dark, it barks and stands between; another dog, a
// play-bow or a growl; at home before its owner's usual time, it waits at the office's door; late,
// it goes to bed.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27770 + Math.floor(Math.random() * 100);
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
  says: string[];
}
const me = (w: Who): S => w.room.state.players.get(w.room.sessionId);
async function join(uid: number, sandbox: number): Promise<Who> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state.players?.get(room.sessionId) && room.state.objects?.size > 0);
  return { room, says: [] };
}
const adopt = async (w: Who, name: string): Promise<S> => {
  w.room.send("pet:adopt", { species: "dog", name });
  await waitFor(() => [...w.room.state.pets.values()].some((p: S) => p.sid === w.room.sessionId && p.name === name));
  return [...w.room.state.pets.values()].find((p: S) => p.sid === w.room.sessionId && p.name === name);
};
const hour = async (w: Who, h: number) => {
  w.room.send("mod:hour", { h });
  await waitFor(() => Math.abs(w.room.state.hour - h) < 0.01);
};
const LOT = { x: 40, y: 22, level: 0 };

test("neglected it sulks; its owner busy, it lies down quiet; a stranger in the dark, a bark between them", async () => {
  const ana = await join(101, 81);
  await hour(ana, 12);
  ana.room.send("teleport", { to: LOT });
  await waitFor(() => me(ana).level === 0);
  const rex = await adopt(ana, "Rex");
  await waitFor(() => rex.floor === 0 && Math.hypot(rex.x - me(ana).x, rex.y - me(ana).y) < 3, 10_000);
  // three hours of no one, fun low: a sulk
  ana.room.send("pet:test", { id: rex.id, needs: { fun: 20 }, ago: 3 * 3_600_000, hours: 0.001 });
  await waitFor(() => rex.mood === "sulk");
  // played with (attention): the sulk passes in its time; here, put it right
  ana.room.send("pet:test", { id: rex.id, needs: { fun: 90 }, ago: -3 * 3_600_000 });
  // busy (do not disturb): it lies down by her, quiet
  ana.room.send("status", { status: "dnd" });
  await waitFor(() => rex.act === "move:lie", 6000);
  const said = rex.sayAt;
  ana.room.send("pet:cmd", { id: rex.id, cmd: "speak" });
  await sleep(400);
  assert.equal(rex.sayAt, said, "not a sound while she's busy");
  ana.room.send("status", { status: "online" });
  await waitFor(() => rex.act === "", 12_000);
  // night, out in the lot: a stranger comes up beside her — a bark, alarmed, between them
  await hour(ana, 23);
  const bia = await join(102, 81);
  bia.room.send("teleport", { to: { x: me(ana).x + 2, y: me(ana).y + 1, level: 0 } });
  await waitFor(() => me(bia).level === 0 && Math.hypot(me(bia).x - me(ana).x, me(bia).y - me(ana).y) < 4);
  await waitFor(() => rex.say === "angry" && rex.mood === "alert", 8000);
  await hour(ana, 12);
});

test("two dogs meet: a play-bow (or a growl); at home before her usual time, at the office door; late, to bed", async () => {
  const ana = await join(103, 82);
  const cai = await join(104, 82);
  await hour(ana, 12);
  for (const w of [ana, cai]) w.room.send("teleport", { to: LOT });
  await waitFor(() => me(ana).level === 0 && me(cai).level === 0);
  const a = await adopt(ana, "Ace");
  const b = await adopt(cai, "Bee");
  // side by side
  cai.room.send("teleport", { to: { x: me(ana).x + 1.5, y: me(ana).y, level: 0 } });
  await waitFor(
    () => (a.act === "move:playbow" || a.say === "angry") && (b.act === "move:playbow" || b.say === "angry"),
    15_000,
  );
  // Ana's office (the War Room, hers), Ace left there; she goes; her usual hour's 13:00
  ana.room.send("map:room:update", { key: "war-room", ownerId: 103, ownerName: "P103" });
  ana.room.send("teleport", { to: { x: 38.5, y: 6.5, level: 4 } });
  await waitFor(() => me(ana).level === 4);
  await waitFor(() => a.floor === 4 && a.x > 29 && a.x < 48 && a.y > 0 && a.y < 12, 20_000);
  ana.room.send("pet:cmd", { id: a.id, cmd: "home" });
  await waitFor(() => a.mode === "home");
  ana.room.send("pet:test", { id: a.id, arrivals: [13, 13, 13, 13] });
  const aid = a.id;
  rooms.splice(rooms.indexOf(ana.room), 1);
  await ana.room.leave(true);
  const ace = (): S => cai.room.state.pets.get(aid);
  // 12:30, half an hour before: to the door, inside
  await hour(cai, 12.5);
  const room = (await import("./WorldRoom.ts")).WorldRoom.current;
  // biome-ignore lint/suspicious/noExplicitAny: the room's own map
  const area = room?.levelMap(4).areas.find((x: any) => x.key === "war-room");
  assert.ok(area);
  const edge = () => {
    const p = ace();
    return Math.min(p.x - area.x, area.x + area.w - p.x, p.y - area.y, area.y + area.h - p.y);
  };
  // (the War Room has no door of its own: the side towards the floor's lifts, its south wall)
  let last = { x: -99, y: -99 };
  const settled = async () => {
    for (let t = Date.now(); Date.now() - t < 25_000; ) {
      const p = { x: ace().x, y: ace().y };
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05 && edge() < 1.6) return true;
      last = p;
      await sleep(1200);
    }
    return false;
  };
  assert.ok(await settled(), `at the room's edge, waiting: ${ace().x},${ace().y}`);
  const was = { x: ace().x, y: ace().y };
  await sleep(4000);
  assert.ok(Math.hypot(ace().x - was.x, ace().y - was.y) < 0.5, "it stays there");
  assert.equal(ace().mode, "home");
  // late: to bed
  await hour(cai, 23);
  cai.room.send("pet:test", { id: aid, needs: { energy: 50 }, hours: 0.001 });
  await waitFor(() => ace().mode === "sleep", 8000);
  await hour(cai, 12);
});
