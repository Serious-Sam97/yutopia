import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { matchMaker } from "@colyseus/core";
import {
  areaAt,
  canPlace,
  dressItems,
  entry,
  isHeld,
  type MapDef,
  quarterOf,
  quarterYaw,
  ROOM_NAME,
  STOREY,
  takenId,
} from "@yutopia/shared";
import { newCar, SLOT_GRIP, SLOT_LAP, SLOT_VMAX, slotCurve, slotLap, stepCar } from "@yutopia/shared/slotcar";
import {
  applyOps,
  cellTop,
  edgeBack,
  edgeFront,
  type StructOp,
  type Structure,
  viewOf,
} from "@yutopia/shared/structure";
import { Client, type Room } from "colyseus.js";
import type { WorldRoom } from "./WorldRoom.ts";

process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 32200 + Math.floor(Math.random() * 100); // (its own hundred: no two files share one — they run at once)
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
let space = 100;

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

interface Person {
  room: Room;
  hear: { ids: string[]; heardBy: string[] };
  msgs: Record<string, unknown[]>;
  // the building's structure as this person has it (plan 72 phase 6: whole when asked, then edits)
  struct?: Structure;
  rev?: number;
}
// the home floor's map (the others in `levels`) as this person's structure gives it
const home = (p: Person): MapDef => viewOf(p.struct as Structure);
// the building as this person has it, asked of their structure (plan 72 phase 11: no tile rows)
const st = (p: Person) => p.struct as Structure;
const cellAt = (p: Person, x: number, y: number, floor = st(p).home) => cellTop(st(p), floor, x, y);
const edgeAt = (p: Person, e: { dir: "h" | "v"; x: number; y: number }, floor = st(p).home) =>
  edgeFront(st(p), floor, e);
const backAt = (p: Person, e: { dir: "h" | "v"; x: number; y: number }, floor = st(p).home) =>
  edgeBack(st(p), floor, e);
// a room made as the build tool makes one (plan 72 phase 11): its walls drawn round it (the room
// found as they close), named and given its owner, a door in its south wall — its key
async function makeRoom(
  owner: Person,
  r: { x: number; y: number; w: number; h: number; name: string; kind: string; ownerId: number; ownerName: string },
): Promise<string> {
  const ok = owner.msgs["struct:walls:ok"]?.length ?? 0;
  const [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
  const c: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  owner.room.send("struct:walls", { add: c.map((a, i) => ({ a, b: c[(i + 1) % 4], front: "p" })), n: 1 });
  await waitFor(() => (owner.msgs["struct:walls:ok"]?.length ?? 0) > ok);
  const key = (owner.msgs["struct:walls:ok"]?.at(-1) as { found?: string[] }).found?.[0];
  assert.ok(key, "a room found");
  owner.room.send("map:room:update", { key, name: r.name, kind: r.kind, ownerId: r.ownerId, ownerName: r.ownerName });
  await waitFor(() => home(owner).areas.some((a) => a.key === key && a.name === r.name));
  owner.room.send("obj:put", {
    id: `door-${key}`,
    kind: "door",
    x: r.x + 2,
    y: y1,
    yaw: 0,
    props: { state: "open", roomKey: key },
  });
  await waitFor(() => !!owner.room.state.objects.get(`door-${key}`));
  return key;
}

async function person(id: number, sandbox: number, roles = "member"): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${id}:P${id}:${roles}`,
  });
  rooms.push(room);
  const p: Person = { room, hear: { ids: [], heardBy: [] }, msgs: {} };
  for (const t of [
    "hear",
    "snap",
    "knock",
    "admitted",
    "toast",
    "kicked",
    "vortex:say",
    "wb:scene",
    "wb:op",
    "arcade:scores",
    "build:history",
    "struct:ops",
    "struct:walls:ok",
    "struct:slabs:ok",
    "piano:note",
    "game:tv",
    "game:pad",
    "game:audience",
    "spawn:mine",
    "computer:ok",
    "computer:off",
    "call:ring",
    "phone:live",
    "call:update",
    "call:join",
    "gps:friends",
    "present:opened",
    "claw:result",
    "tg:state",
  ])
    room.onMessage(t, (m) => {
      if (!p.msgs[t]) p.msgs[t] = [];
      p.msgs[t].push(m);
      if (t === "hear") p.hear = m as Person["hear"];
    });
  room.onMessage("struct:full", (m: { rev: number; structure: Structure }) => {
    p.struct = m.structure;
    p.rev = m.rev;
  });
  room.onMessage("struct:ops", (m: { rev: number; ops: StructOp[] }) => {
    if (!p.struct || m.rev !== (p.rev ?? -1) + 1) return void room.send("struct:get", {});
    p.struct = applyOps(p.struct, m.ops);
    p.rev = m.rev;
  });
  room.send("struct:get", {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId) && !!p.struct);
  return p;
}

async function waitFor(fn: () => boolean, ms = 3000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

// Walk the real path in small legal steps (like a client would).
// the room itself (it runs in this process): its place for this person on their floor (their own
// locked doors open), and its ways (the navmesh's)
function liveRoom(p: Person): WorldRoom {
  return matchMaker.getLocalRoomById(p.room.roomId) as unknown as WorldRoom;
}
function liveGrid(p: Person) {
  const me = p.room.state.players.get(p.room.sessionId);
  return liveRoom(p).gridFor(me.uid, me.level);
}
function wayOf(p: Person, from: { x: number; y: number }, to: { x: number; y: number }) {
  const me = p.room.state.players.get(p.room.sessionId);
  return liveRoom(p).wayFor(me.uid, me.level, from, to);
}
function liveWorld(p: Person) {
  const st = p.room.state;
  // (the building's other floors in `levels`: the grid of this one leaves their things out)
  const map = home(p);
  const objects = [...st.objects.values()].map(
    (o: { id: string; kind: string; x: number; y: number; yaw: number; props: string }) => ({
      id: o.id,
      kind: o.kind,
      x: o.x,
      y: o.y,
      yaw: o.yaw,
      props: JSON.parse(o.props || "{}"),
    }),
  );
  return { map, objects };
}
// A free spot for a thing near (x, y) where `ok` agrees (nearest first).
function spotFor(p: Person, kind: string, x: number, y: number, r: number, ok: (sx: number, sy: number) => boolean) {
  const { map, objects } = liveWorld(p);
  const bodies = [...p.room.state.players.values()].map((b: { x: number; y: number }) => ({ x: b.x, y: b.y }));
  const spots: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) spots.push([x + dx, y + dy]);
  spots.sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y));
  for (const [sx, sy] of spots)
    if (ok(sx, sy) && canPlace(map, objects, { id: "probe", kind, x: sx, y: sy, yaw: quarterYaw(0) }, bodies))
      return { x: sx, y: sy };
  return null;
}
async function walk(p: Person, to: { x: number; y: number }) {
  const me = p.room.state.players.get(p.room.sessionId);
  let x = me.x;
  let y = me.y;
  const path = wayOf(p, { x, y }, to) ?? [];
  let seq = 0;
  const snapsAtStart = p.msgs.snap?.length ?? 0;
  for (const wp of path) {
    for (let i = 0; i < 400; i++) {
      const dx = wp.x - x;
      const dy = wp.y - y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01) break;
      const step = Math.min(0.2, d);
      x += (dx / d) * step;
      y += (dy / d) * step;
      p.room.send("pos", { x, y, yaw: 32, a: 1, seq: ++seq });
      await sleep(52);
      if ((p.msgs.snap?.length ?? 0) > snapsAtStart) return; // server refused (a booth, a locked door): stop here
    }
  }
  await sleep(150);
}

const me = (p: Person) => p.room.state.players.get(p.room.sessionId);

test("people next to each other hear each other, in both directions", async () => {
  const s = ++space;
  const a = await person(1, s);
  const b = await person(2, s);
  await waitFor(() => a.hear.ids.includes(b.room.sessionId) && b.hear.ids.includes(a.room.sessionId));
  assert.deepEqual(a.hear.heardBy, ["2"]);
  assert.deepEqual(b.hear.heardBy, ["1"]);
});

test("walking away stops hearing; the lobby can't hear the tracking room", async () => {
  const s = ++space;
  const a = await person(3, s);
  const b = await person(4, s);
  await waitFor(() => a.hear.ids.length === 1);
  await walk(b, { x: 22.5, y: 4.5 }); // far end of the tracking room
  await waitFor(() => a.hear.ids.length === 0 && a.hear.heardBy.length === 0);
});

test("booths: entering an occupied booth knocks; admitted guests get in", async () => {
  const s = ++space;
  const host = await person(5, s);
  const guest = await person(6, s);
  // host walks spawn → hall → booth 1 (door at 31,14)
  await walk(host, { x: 31.5, y: 16.5 });
  assert.equal(me(host).area, "booth-1");
  // guest follows to the door and knocks (their browser stops them at its edge and knocks for
  // them — input/walker.ts; the server puts nobody back: the user's call, 2026-10-28)
  await walk(guest, { x: 31.5, y: 13.4 });
  assert.notEqual(me(guest).area, "booth-1", "at the door, outside");
  guest.room.send("knock", { area: "booth-1" });
  await waitFor(() => (host.msgs.knock?.length ?? 0) > 0);
  // nobody outside hears the booth
  assert.ok(!guest.hear.ids.includes(host.room.sessionId));
  host.room.send("admit", { userId: 6, area: "booth-1" });
  await waitFor(() => (guest.msgs.admitted?.length ?? 0) > 0);
  await walk(guest, { x: 31.5, y: 17.5 });
  assert.equal(me(guest).area, "booth-1");
  await waitFor(() => guest.hear.ids.includes(host.room.sessionId));
});

test("the stage reaches the whole building", async () => {
  const s = ++space;
  const speaker = await person(7, s);
  const listener = await person(8, s);
  await walk(listener, { x: 3.5, y: 33.5 }); // lobby corner
  await walk(speaker, { x: 33.5, y: 22.5 }); // onto the stage
  assert.equal(me(speaker).area, "stage");
  await waitFor(() => listener.hear.ids.includes(speaker.room.sessionId));
  assert.ok(speaker.hear.heardBy.includes("8"));
});

test("focus mode (dnd) mutes both ways", async () => {
  const s = ++space;
  const a = await person(9, s);
  const b = await person(10, s);
  await waitFor(() => a.hear.ids.length === 1);
  a.room.send("status", { status: "dnd" });
  await waitFor(() => a.hear.ids.length === 0 && b.hear.ids.length === 0);
});

test("a second tab replaces the first", async () => {
  const s = ++space;
  const first = await person(11, s);
  const second = await person(11, s);
  await waitFor(() => (first.msgs.kicked?.length ?? 0) > 0);
  await waitFor(() => second.room.state.players.size === 1);
});

test("only builders can move furniture, and only where it fits", async () => {
  const s = ++space;
  const member = await person(12, s);
  const builder = await person(13, s, "member,builder");
  const plant = "tr-plant-0";
  const before = member.room.state.objects.get(plant);
  member.room.send("obj:put", { id: plant, kind: "plant", x: 10, y: 3, yaw: 0 });
  await sleep(200);
  assert.equal(member.room.state.objects.get(plant).x, before.x);
  builder.room.send("obj:put", { id: "b-desk", kind: "desk", x: 28, y: 9, yaw: 0 }); // across a wall
  await waitFor(() => (builder.msgs.toast?.length ?? 0) > 0);
  assert.ok(!member.room.state.objects.get("b-desk"));
  builder.room.send("obj:put", { id: plant, kind: "plant", x: 10, y: 3, yaw: 0 });
  await waitFor(() => member.room.state.objects.get(plant).x === 10);
  builder.room.send("obj:remove", { id: plant });
  await waitFor(() => !member.room.state.objects.get(plant));
});

test("standup: everyone in the ring gets a turn, then it ends", async () => {
  const s = ++space;
  const a = await person(14, s);
  const b = await person(15, s);
  await walk(a, { x: 22.5, y: 15.5 });
  await walk(b, { x: 23.5, y: 16.5 });
  assert.equal(me(a).area, "standup");
  assert.equal(me(b).area, "standup");
  a.room.send("standup:start", {});
  await waitFor(() => a.room.state.standup.active === true);
  assert.deepEqual([...a.room.state.standup.order].sort(), [14, 15]);
  assert.equal(a.room.state.standup.turn, 0);
  b.room.send("standup:next", {});
  await waitFor(() => a.room.state.standup.turn === 1);
  a.room.send("standup:next", {});
  await waitFor(() => a.room.state.standup.active === false);
  await waitFor(() => (b.msgs.toast?.length ?? 0) > 0);
});

test("radio: each radio its own station, with a start time", async () => {
  const s = ++space;
  const a = await person(17, s);
  const b = await person(18, s);
  const radio = (p: Person, id: string) => JSON.parse(p.room.state.objects.get(id).props || "{}").radio ?? {};
  a.room.send("radio:set", { id: "lounge-radio", playing: true, station: 4 });
  await waitFor(() => radio(b, "lounge-radio").playing === true);
  assert.equal(radio(b, "lounge-radio").station, 1, "station wraps to the list");
  assert.ok(Math.abs(radio(b, "lounge-radio").startedAt - Date.now()) < 2000);
  // the record player next to it plays its own
  assert.equal(radio(b, "lounge-turntable").playing, undefined);
  b.room.send("radio:set", { id: "lounge-turntable", playing: true, station: 2 });
  await waitFor(() => radio(a, "lounge-turntable").station === 2);
  assert.equal(radio(a, "lounge-radio").station, 1);
  b.room.send("radio:set", { id: "lounge-radio", playing: false });
  await waitFor(() => radio(a, "lounge-radio").playing === false);
  assert.equal(radio(a, "lounge-turntable").playing, true);
  // each its own volume knob, kept in 0..1 (a new one starts at 0.8)
  assert.equal(radio(a, "lounge-radio").volume, 0.8);
  a.room.send("radio:volume", { id: "lounge-turntable", volume: 0.35 });
  await waitFor(() => radio(b, "lounge-turntable").volume === 0.35);
  assert.equal(radio(b, "lounge-radio").volume, 0.8, "the radio next to it keeps its own");
  a.room.send("radio:volume", { id: "lounge-turntable", volume: 7 });
  await waitFor(() => radio(b, "lounge-turntable").volume === 1);
  // not a radio: nothing
  a.room.send("radio:set", { id: "nope", playing: true });
});

test("coffee: a mug from the machine when you're next to it, for everyone to see; put it down", async () => {
  const s = ++space;
  const a = await person(19, s);
  const b = await person(20, s);
  const machine = [...a.room.state.objects.values()].find((o) => o.kind === "coffee_machine");
  assert.ok(machine, "the studio has a coffee machine");
  // too far: nothing
  a.room.send("item:take", { id: machine.id });
  await sleep(300);
  assert.equal(me(a)?.held, "");
  await walk(a, { x: machine.x + 0.5, y: machine.y + 1.5 });
  a.room.send("item:take", { id: machine.id });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.held === "mug");
  assert.ok(Math.abs((me(a)?.heldAt ?? 0) - Date.now()) < 2000);
  // only things that hand something out
  const desk = [...a.room.state.objects.values()].find((o) => o.kind === "desk");
  a.room.send("item:take", { id: desk?.id ?? "" });
  await sleep(200);
  assert.equal(me(a)?.held, "mug");
  a.room.send("item:drop", {});
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.held === "");
});

test("using things shows; the piano is heard from whoever's at it", async () => {
  const s = ++space;
  const a = await person(21, s, "member,builder");
  const b = await person(22, s);
  // what I'm busy with: only things you can use
  a.room.send("use", { what: "arcade" });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.busy === "arcade");
  a.room.send("use", { what: "<hack>" });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.busy === "");
  // a piano right where Ana is
  const at = me(a);
  const px = Math.floor(at?.x ?? 0);
  const py = Math.floor(at?.y ?? 0) - 2;
  a.room.send("obj:put", { id: "t-piano", kind: "piano", x: px, y: py, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("t-piano"));
  a.room.send("piano:note", { id: "t-piano", n: 4 });
  await waitFor(() => (b.msgs["piano:note"]?.length ?? 0) === 1);
  assert.equal((b.msgs["piano:note"][0] as { n: number }).n, 4);
  assert.equal(a.msgs["piano:note"]?.length ?? 0, 0, "not echoed to the player");
  // out of range notes, and pianos you're not at, are dropped
  a.room.send("piano:note", { id: "t-piano", n: 99 });
  b.room.send("piano:note", { id: "t-piano", n: 2 });
  await sleep(300);
  assert.equal(b.msgs["piano:note"].length, 1);
  a.room.send("obj:remove", { id: "t-piano" });
});

test("whiteboard: ops are cleaned, broadcast and kept", async () => {
  const s = ++space;
  const a = await person(19, s);
  const b = await person(20, s);
  a.room.send("wb:op", {
    objectId: "tr-whiteboard",
    op: { t: "add", item: { id: "s1", k: "stroke", c: "red", w: 999, p: [10, 10, 5000, -3] } },
  });
  await waitFor(() => (b.msgs["wb:op"]?.length ?? 0) > 0);
  const op = b.msgs["wb:op"]?.[0] as { op: { item: { c: string; w: number; p: number[] } } };
  assert.equal(op.op.item.c, "#2a2420");
  assert.equal(op.op.item.w, 40);
  assert.deepEqual(op.op.item.p, [10, 10, 1000, 0]);
  b.room.send("wb:get", { objectId: "tr-whiteboard" });
  await waitFor(() => (b.msgs["wb:scene"]?.length ?? 0) > 0);
  assert.equal((b.msgs["wb:scene"]?.[0] as { items: unknown[] }).items.length, 1);
  a.room.send("wb:op", { objectId: "not-a-board", op: { t: "clear" } });
  a.room.send("wb:op", { objectId: "tr-whiteboard", op: { t: "add", item: { id: "x", k: "evil" } } });
  await sleep(200);
  assert.equal(b.msgs["wb:op"]?.length, 1);
});

test("vortex: lives in the building, walks around, answers a poke privately", async () => {
  const s = ++space;
  const a = await person(21, s);
  const b = await person(22, s);
  const vx = () => a.room.state.npcs.get("vortex");
  await waitFor(() => !!vx());
  const start = { x: vx().x, y: vx().y };
  await waitFor(() => Math.hypot(vx().x - start.x, vx().y - start.y) > 0.5, 15000);
  // chase him and poke until he answers (he doesn't stand still)
  for (let i = 0; i < 8 && !(a.msgs["vortex:say"]?.length ?? 0); i++) {
    await walk(a, { x: vx().x, y: vx().y });
    a.room.send("vortex:poke", {});
    await sleep(1200);
  }
  assert.ok((a.msgs["vortex:say"]?.length ?? 0) > 0, "he answered");
  assert.equal(b.msgs["vortex:say"]?.length ?? 0, 0, "personal lines are private");
});

test("build: owners can switch the tracking room to a template", async () => {
  const s = ++space;
  const member = await person(23, s);
  const owner = await person(24, s, "member,builder");
  member.room.send("build:template", { template: "rows" });
  await sleep(300);
  assert.ok(member.room.state.objects.get("seat-3-5-a"), "members can't");
  owner.room.send("build:template", { template: "rows" });
  await waitFor(() => !member.room.state.objects.get("seat-3-5-a") && !!member.room.state.objects.get("row-desk-3-4"));
  const desks = [...member.room.state.objects.values()].filter((o: { props: string }) => JSON.parse(o.props).desk);
  assert.equal(desks.length, 40);
  owner.room.send("build:template", { template: "pods" });
  await waitFor(() => !!member.room.state.objects.get("seat-3-5-a"));
});

// Plan 67 phase 10: a builder furnishes the room they stand in by a plan, and Undo puts it back; a
// whole floor's refurnishing is an admin's.
test("office: a builder furnishes the room they're in, Undo puts it back; the floor is an admin's", async () => {
  const s = ++space;
  const builder = await person(31, s, "member,builder");
  const ids = () => new Set([...builder.room.state.objects.keys()] as string[]);
  await walk(builder, { x: 18.5, y: 27.5 }); // (the lounge)
  await sleep(600); // (the room settled: what it sets right on load)
  const before = ids();
  builder.room.send("build:refurnish", {});
  await sleep(300);
  const diff = [...ids()].filter((id) => !before.has(id)).concat([...before].filter((id) => !ids().has(id)));
  assert.deepEqual(diff, [], "a builder can't refurnish the floor");
  builder.room.send("build:furnish", { plan: "lounge" });
  await waitFor(() => [...ids()].some((id) => id.startsWith("lounge-lounge-")));
  const added = [...ids()].filter((id) => !before.has(id));
  assert.ok(added.length >= 6, `furnished (${added.length})`);
  assert.ok(
    [...before].some((id) => !ids().has(id)),
    "its old furniture taken out",
  );
  await sleep(800); // (the step closes once the edits pause)
  builder.room.send("build:undo", {});
  await waitFor(() => !added.some((id) => ids().has(id)));
  assert.deepEqual(ids(), before, "Undo puts the room back as it was");
});

test("Christmas: an admin puts it out and away; a present opens for who it's for; wrapped at the table; the mistletoe", async () => {
  const s = ++space;
  const admin = await person(41, s, "member,builder,admin");
  const bia = await person(42, s, "member,builder");
  const ids = () => [...admin.room.state.objects.keys()] as string[];
  const xmas = () => ids().filter((id) => id.startsWith("xmas-"));
  await sleep(600);
  // only an admin
  bia.room.send("build:christmas", { on: true });
  await sleep(300);
  assert.equal(xmas().length, 0, "a builder can't put Christmas out");
  admin.room.send("build:christmas", { on: true });
  await waitFor(() => xmas().length > 0);
  const out = xmas();
  assert.ok(out.length >= 10, `put out (${out.length})`);
  // a present for P42, by the lounge's sofa
  await walk(bia, { x: 18.5, y: 27.5 });
  await walk(admin, { x: 19.5, y: 27.5 });
  const { map } = liveWorld(bia);
  const spot = spotFor(bia, "present", 18, 28, 3, (sx, sy) => !!areaAt(map, sx + 0.5, sy + 0.5));
  assert.ok(spot, "somewhere for a present");
  bia.room.send("obj:put", { id: "t-gift", kind: "present", ...spot, yaw: 0, props: { text: "p42" } });
  await waitFor(() => !!bia.room.state.objects.get("t-gift"));
  admin.room.send("present:open", { id: "t-gift" });
  await waitFor(() => (admin.msgs.toast ?? []).some((m) => /for P42/.test((m as { text: string }).text)));
  assert.ok(bia.room.state.objects.get("t-gift"), "not for the admin: still wrapped");
  bia.room.send("present:open", { id: "t-gift" });
  await waitFor(() => !bia.room.state.objects.get("t-gift"));
  const gift = me(bia).held;
  assert.ok(isHeld(gift), `in hand: ${gift}`);
  assert.equal((bia.msgs["present:opened"]?.[0] as { gift: string }).gift, gift);
  // wrapped at a table, for the admin
  const tspot = spotFor(bia, "wrapping_table", 18, 29, 4, (sx, sy) => !!areaAt(map, sx + 0.5, sy + 0.5));
  assert.ok(tspot, "somewhere for the table");
  bia.room.send("obj:put", { id: "t-table", kind: "wrapping_table", ...tspot, yaw: 0 });
  await waitFor(() => !!bia.room.state.objects.get("t-table"));
  await walk(bia, { x: tspot.x + 1, y: tspot.y + 1.5 });
  bia.room.send("present:wrap", { id: "t-table", to: 41 });
  await waitFor(() => ids().some((id) => id.startsWith("present-42-")));
  const wrapped = admin.room.state.objects.get(ids().find((id) => id.startsWith("present-42-")));
  const props = JSON.parse(wrapped.props);
  assert.equal(props.to, 41, "for the admin");
  assert.equal(props.gift, gift, "what she held inside");
  assert.equal(me(bia).held, "", "out of her hands");
  // the two of them under the mistletoe: hearts
  const at = { x: Math.floor(me(bia).x), y: Math.floor(me(bia).y) };
  bia.room.send("obj:put", { id: "t-mistle", kind: "mistletoe", ...at, yaw: 0 });
  await waitFor(() => !!bia.room.state.objects.get("t-mistle"));
  await walk(bia, { x: at.x + 0.3, y: at.y + 0.5 });
  await walk(admin, { x: at.x + 0.75, y: at.y + 0.5 });
  await waitFor(() => me(bia).emote === "heart" && me(admin).emote === "heart", 4000);
  // put away (Undo brings it back)
  admin.room.send("build:christmas", { on: false });
  await waitFor(() => xmas().length === 0);
  await sleep(800);
  admin.room.send("build:undo", {});
  await waitFor(() => xmas().length === out.length);
});

test("the small games: chess moves by the rules, darts score, the claw drops, air hockey for two", async () => {
  const s = ++space;
  const a = await person(51, s, "member,builder");
  const b = await person(52, s, "member,builder");
  await sleep(600);
  await walk(a, { x: 18.5, y: 27.5 });
  await walk(b, { x: 19.5, y: 27.5 });
  const { map } = liveWorld(a);
  const inside = (sx: number, sy: number) => !!areaAt(map, sx + 0.5, sy + 0.5);
  const put = async (id: string, kind: string, x: number, y: number, r = 4) => {
    const at = spotFor(a, kind, x, y, r, inside);
    assert.ok(at, `somewhere for the ${kind}`);
    a.room.send("obj:put", { id, kind, ...at, yaw: 0 });
    await waitFor(() => !!a.room.state.objects.get(id));
  };
  const props = (id: string) => JSON.parse(a.room.state.objects.get(id).props || "{}");
  // chess: sides taken, a legal move made, an illegal one and one out of turn refused
  await put("g-chess", "chess_table", 18, 28);
  a.room.send("chess:sit", { id: "g-chess", side: "w" });
  b.room.send("chess:sit", { id: "g-chess", side: "b" });
  await waitFor(() => props("g-chess").w === 51 && props("g-chess").b === 52);
  b.room.send("chess:move", { id: "g-chess", from: 12, to: 28 }); // (black's e7–e5: not their turn)
  a.room.send("chess:move", { id: "g-chess", from: 52, to: 20 }); // (e2–e5: illegal)
  await sleep(300);
  assert.equal(props("g-chess").fen, undefined, "nothing moved yet");
  a.room.send("chess:move", { id: "g-chess", from: 52, to: 36 }); // e2–e4
  await waitFor(() => String(props("g-chess").fen ?? "").startsWith("rnbqkbnr/pppppppp/8/8/4P3/"));
  // (plan 70: the move's time, for the men to play it out from)
  assert.ok(Math.abs(Date.now() - Number(props("g-chess").lastAt)) < 5000, "the move's time kept");
  assert.equal(props("g-chess").log, "e2e4", "the game's moves logged");
  // (a builder moving the table can't set its game: the position and the seats stay the game's)
  {
    const o = a.room.state.objects.get("g-chess");
    a.room.send("obj:put", {
      id: "g-chess",
      kind: "chess_table",
      x: o.x,
      y: o.y,
      yaw: Math.PI / 2,
      props: { fen: "garbage", w: 99 },
    });
    await waitFor(() => quarterOf(a.room.state.objects.get("g-chess")) === 1);
    assert.ok(String(props("g-chess").fen).startsWith("rnbqkbnr/pppppppp/8/8/4P3/"), "the game kept");
    assert.equal(props("g-chess").w, 51, "white's seat kept");
  }
  // darts: thrown into the board, scored; three make a turn
  await put("g-darts-wall", "dartboard", 18, 27, 9);
  {
    const d = a.room.state.objects.get("g-darts-wall");
    await walk(a, { x: d.x + 0.5, y: d.y + 0.5 });
  }
  for (let i = 0; i < 3; i++) {
    a.room.send("darts:throw", { id: "g-darts-wall", x: 0, y: 0.103 });
    // (a dart a moment: one sent straight after is let fall)
    if (i === 0) a.room.send("darts:throw", { id: "g-darts-wall", x: 0, y: 0 });
    await sleep(400);
  }
  await waitFor(() => props("g-darts-wall").turn?.n === 3);
  assert.equal(props("g-darts-wall").turn.total, 180, "three treble twenties");
  assert.equal(props("g-darts-wall").best.score, 180);
  // the claw: dropped, told what it won (or not)
  await put("g-claw", "claw_machine", 20, 28);
  const near = async (p: typeof a, id: string) => {
    const o = a.room.state.objects.get(id);
    const at = spotFor(p, "chair", o.x, o.y, 3, inside);
    assert.ok(at);
    await walk(p, { x: at.x + 0.5, y: at.y + 0.5 });
  };
  await near(a, "g-claw");
  a.room.send("claw:drop", { id: "g-claw", x: 0.5, z: 0.5 });
  await waitFor(() => (a.msgs["claw:result"]?.length ?? 0) > 0);
  // (again straight away: too soon, told so — the panel's claw comes back up empty)
  a.room.send("claw:drop", { id: "g-claw", x: 0.5, z: 0.5 });
  await waitFor(() => (a.msgs["claw:result"]?.length ?? 0) > 1);
  assert.equal((a.msgs["claw:result"].at(-1) as { toy: string | null }).toy, null);
  // air hockey: two join, it runs, the state comes to both
  await put("g-hockey", "air_hockey", 17, 30);
  await near(a, "g-hockey");
  await near(b, "g-hockey");
  a.room.send("tg:join", { id: "g-hockey" });
  b.room.send("tg:join", { id: "g-hockey" });
  await waitFor(() => (b.msgs["tg:state"] ?? []).some((m) => (m as { running: boolean }).running));
  a.room.send("tg:input", { id: "g-hockey", x: 1, y: 0.4 });
  await sleep(200);
  const last = (a.msgs["tg:state"] ?? []).at(-1) as { side: number; s: number[] };
  assert.equal(last.side, 0);
  b.room.send("tg:leave", { id: "g-hockey" });
  await waitFor(() => (a.msgs["tg:state"] ?? []).some((m) => !(m as { running: boolean }).running));
  // a chess side kept by someone who's walked off is anyone's to take
  await near(a, "g-chess");
  await near(b, "g-chess");
  b.room.send("chess:sit", { id: "g-chess", side: "w" });
  await sleep(300);
  assert.equal(props("g-chess").w, 51, "white still Ana's while she's at it");
  await walk(a, { x: 30.5, y: 27.5 });
  b.room.send("chess:sit", { id: "g-chess", side: "w" });
  await waitFor(() => props("g-chess").w === 52);
});

// plan 70 (docs/plan/70-the-chess.md): a draw offered, taken back, offered again and agreed; a new game;
// a side resigning; neither from someone not playing
test("chess: a draw offered and agreed, a resignation, only by the players", async () => {
  const s = ++space;
  const a = await person(53, s, "member,builder");
  const b = await person(54, s, "member,builder");
  const c = await person(55, s, "member");
  await sleep(600);
  await walk(a, { x: 18.5, y: 27.5 });
  await walk(b, { x: 19.5, y: 27.5 });
  await walk(c, { x: 19.5, y: 28.5 });
  const { map } = liveWorld(a);
  const inside = (sx: number, sy: number) => !!areaAt(map, sx + 0.5, sy + 0.5);
  const at = spotFor(a, "chess_table", 18, 28, 4, inside);
  assert.ok(at, "somewhere for the table");
  a.room.send("obj:put", { id: "d-chess", kind: "chess_table", ...at, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("d-chess"));
  const props = () => JSON.parse(a.room.state.objects.get("d-chess").props || "{}");
  a.room.send("chess:sit", { id: "d-chess", side: "w" });
  b.room.send("chess:sit", { id: "d-chess", side: "b" });
  await waitFor(() => props().w === 53 && props().b === 54);
  a.room.send("chess:move", { id: "d-chess", from: 52, to: 36 }); // e2–e4
  await waitFor(() => !!props().lastAt);
  // a draw: offered by white, taken back, offered again; someone watching can't agree to it
  a.room.send("chess:draw", { id: "d-chess", offer: true });
  await waitFor(() => props().offer === "w");
  a.room.send("chess:draw", { id: "d-chess", offer: false });
  await waitFor(() => props().offer === undefined);
  a.room.send("chess:draw", { id: "d-chess", offer: true });
  await waitFor(() => props().offer === "w");
  c.room.send("chess:draw", { id: "d-chess", offer: true });
  c.room.send("chess:resign", { id: "d-chess" });
  await sleep(300);
  assert.equal(props().over, undefined, "a watcher can't end it");
  b.room.send("chess:draw", { id: "d-chess", offer: true });
  await waitFor(() => props().over === "agreed");
  // a new game, and a resignation
  a.room.send("chess:new", { id: "d-chess" });
  await waitFor(() => props().over === undefined && !props().lastAt);
  b.room.send("chess:resign", { id: "d-chess" });
  await waitFor(() => props().over === "resign");
  assert.equal(props().loser, "b");
  // (over: no more moves)
  a.room.send("chess:move", { id: "d-chess", from: 52, to: 36 });
  await sleep(300);
  assert.equal(props().last, undefined, "no move after it's over");
});

// plan 70: Vortex asked to play the other side: he answers a move (after his look at the board), and
// goes when his opponent gets up
test("chess: Vortex plays the empty side and goes when his opponent does", async () => {
  const s = ++space;
  const a = await person(56, s, "member,builder");
  await sleep(600);
  await walk(a, { x: 18.5, y: 27.5 });
  const { map } = liveWorld(a);
  const inside = (sx: number, sy: number) => !!areaAt(map, sx + 0.5, sy + 0.5);
  const at = spotFor(a, "chess_table", 18, 28, 4, inside);
  assert.ok(at, "somewhere for the table");
  a.room.send("obj:put", { id: "v-chess", kind: "chess_table", ...at, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("v-chess"));
  const props = () => JSON.parse(a.room.state.objects.get("v-chess").props || "{}");
  a.room.send("chess:vortex", { id: "v-chess", level: "easy" });
  await sleep(300);
  assert.equal(props().vx, undefined, "only someone playing asks him");
  a.room.send("chess:sit", { id: "v-chess", side: "w" });
  await waitFor(() => props().w === 56);
  a.room.send("chess:vortex", { id: "v-chess", level: "easy" });
  await waitFor(() => props().vx === "easy" && props().vxSide === "b" && props().bn === "Vortex");
  a.room.send("chess:move", { id: "v-chess", from: 52, to: 36 }); // e2–e4
  await waitFor(() => String(props().log ?? "").split(" ").length === 2, 12_000);
  const [, reply] = String(props().log).split(" ");
  assert.match(reply, /^[a-h][78][a-h][56]$/, "black's first move, from his ranks");
  // (up from the table: he goes too)
  a.room.send("chess:sit", { id: "v-chess", side: null });
  await waitFor(() => props().vx === undefined && props().bn === undefined);
});

// plan 70 phase 9: a life-size board — someone stands in for a man, is carried when it moves, and is
// thrown down (hit) when it's taken; a commander can't stand in
test("chess: a stand-in on a life-size board, carried and taken", async () => {
  const s = ++space;
  const a = await person(57, s, "member,builder");
  const b = await person(58, s, "member,builder");
  const c = await person(59, s, "member");
  await sleep(600);
  const { map } = liveWorld(a);
  const inside = (sx: number, sy: number) => !!areaAt(map, sx + 0.5, sy + 0.5);
  const at = spotFor(a, "wizard_chess", 18, 28, 14, inside);
  assert.ok(at, "somewhere for the board");
  a.room.send("obj:put", { id: "big-chess", kind: "wizard_chess", ...at, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("big-chess"));
  const props = () => JSON.parse(a.room.state.objects.get("big-chess").props || "{}");
  for (const p of [a, b, c]) await walk(p, { x: at.x + 5, y: at.y + 5 });
  a.room.send("chess:sit", { id: "big-chess", side: "w" });
  b.room.send("chess:sit", { id: "big-chess", side: "b" });
  await waitFor(() => props().w === 57 && props().b === 58);
  a.room.send("chess:standin", { id: "big-chess", sq: 52 });
  await sleep(300);
  assert.equal(props().si, undefined, "a commander doesn't stand in");
  c.room.send("chess:standin", { id: "big-chess", sq: 36 });
  await sleep(300);
  assert.equal(props().si, undefined, "nobody to stand in for on an empty square");
  c.room.send("chess:standin", { id: "big-chess", sq: 52 });
  await waitFor(() => props().si?.["52"] === 59);
  // e2–e4 carries her; d7–d5, e4×d5 — then the queen takes her on d5: she's thrown
  a.room.send("chess:move", { id: "big-chess", from: 52, to: 36 });
  await waitFor(() => props().si?.["36"] === 59 && props().si?.["52"] === undefined);
  b.room.send("chess:move", { id: "big-chess", from: 11, to: 27 });
  await waitFor(() => String(props().log).split(" ").length === 2);
  a.room.send("chess:move", { id: "big-chess", from: 36, to: 27 });
  await waitFor(() => props().si?.["27"] === 59);
  const hitBefore = Number(me(c).hitAt) || 0;
  b.room.send("chess:move", { id: "big-chess", from: 3, to: 27 });
  await waitFor(() => Object.keys(props().si ?? {}).length === 0);
  assert.ok(Number(me(c).hitAt) > hitBefore, "thrown down by the blow");
});

test("moderation: admins mute, lock rooms and remove people; builders and members can't", async () => {
  const s = ++space;
  const owner = await person(25, s, "member,builder,admin");
  const guest = await person(26, s, "member,builder");
  assert.equal(me(owner).admin, true);
  assert.equal(me(guest).admin, false);
  guest.room.send("mod:mute", { userId: 25, muted: true });
  await sleep(200);
  assert.equal(me(owner).muted, false, "builders can't mute");
  owner.room.send("mod:mute", { userId: 26, muted: true });
  await waitFor(() => me(guest).muted === true);
  guest.room.send("media", { mic: true, cam: false, screen: false });
  await sleep(200);
  assert.equal(me(guest).mic, false, "muted people stay off mic");
  owner.room.send("mod:mute", { userId: 26, muted: false });
  await waitFor(() => me(guest).muted === false);

  // lock the war room from inside: the guest has to knock
  await walk(owner, { x: 36.5, y: 3.5 });
  owner.room.send("mod:lock", { area: "war-room", locked: true });
  await waitFor(() => owner.room.state.locks.has("war-room"));
  // (at its door in the hall: their browser stops them at its edge and knocks — input/walker.ts)
  await walk(guest, { x: 36.5, y: 13.5 });
  assert.notEqual(me(guest).area, "war-room");
  guest.room.send("knock", { area: "war-room" });
  await waitFor(() => (owner.msgs.knock?.length ?? 0) > 0);

  // remove: kicked now and can't come straight back
  owner.room.send("mod:kick", { userId: 26 });
  await waitFor(() => (guest.msgs.kicked?.length ?? 0) > 0);
  await assert.rejects(() => person(26, s));
});

test("building: builders draw walls and floors, members can't; nobody's moved by a wall", async () => {
  const s = ++space;
  const member = await person(27, s);
  const owner = await person(28, s, "member,builder");
  const square = (x: number, y: number): [number, number][] => [
    [x, y],
    [x + 1, y],
    [x + 1, y + 1],
    [x, y + 1],
  ];
  member.room.send("struct:walls", { add: [{ a: [10, 3], b: [11, 3], front: "p" }] });
  member.room.send("struct:slabs", { add: [{ outline: square(11, 3), top: "," }] });
  await sleep(250);
  assert.equal(edgeAt(member, { dir: "h", x: 10, y: 3 }), ".", "members can't build walls");
  assert.equal(cellAt(member, 11, 3), ".", "…or lay floors");
  owner.room.send("struct:slabs", { add: [{ outline: square(11, 3), top: "," }] });
  owner.room.send("struct:walls", { add: [{ a: [10, 3], b: [11, 3], front: "b" }] });
  await waitFor(() => edgeAt(member, { dir: "h", x: 10, y: 3 }) === "b" && cellAt(member, 11, 3) === ",");
  // a wall built right through someone: the server doesn't move them (their own browser's physics
  // steps them out of it — no put-backs, the user's call 2026-10-28)
  await walk(member, { x: 10.5, y: 6.2 });
  assert.ok(Math.abs(me(member).y - 6.2) < 0.05, "standing just past the y = 6 line");
  const snaps = member.msgs.snap?.length ?? 0;
  owner.room.send("struct:walls", { add: [{ a: [10, 6], b: [11, 6], front: "p" }] });
  await waitFor(() => edgeAt(member, { dir: "h", x: 10, y: 6 }) === "p");
  await sleep(250);
  assert.equal(member.msgs.snap?.length ?? 0, snaps, "not put anywhere");
});

test("walls drawn free: a builder's wall at 45° goes in for everyone; undone it goes, redone it's back", async () => {
  const s = ++space;
  const member = await person(30, s);
  const owner = await person(31, s, "member,builder");
  const ops = (who: Person) =>
    (who.msgs["struct:ops"] ?? []) as {
      ops: { op: string; add?: { id: string; a: number[]; b: number[] }[]; remove?: string[] }[];
    }[];
  const wall = { a: [12, 8] as [number, number], b: [15, 11] as [number, number], front: "b" };
  // a member: nothing
  member.room.send("struct:walls", { add: [wall], n: 1 });
  await sleep(300);
  assert.equal(ops(member).length, 0, "members can't draw walls");
  // a builder: its operation, to everyone; the id back to them
  owner.room.send("struct:walls", { add: [wall], n: 7 });
  await waitFor(() => ops(member).length === 1);
  const added = ops(member)[0].ops[0].add ?? [];
  assert.equal(added.length, 1);
  assert.deepEqual([added[0].a, added[0].b], [wall.a, wall.b], "at 45°, where it was drawn");
  await waitFor(() => (owner.msgs["struct:walls:ok"]?.length ?? 0) === 1);
  assert.deepEqual(owner.msgs["struct:walls:ok"]?.[0], { n: 7, ids: [added[0].id] });
  // one that can't go: off the floor — told why, nothing sent
  owner.room.send("struct:walls", { add: [{ a: [-50, 8], b: [-40, 8], front: "p" }] });
  await waitFor(() =>
    (owner.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("off the floor")),
  );
  // undone (once the step's closed): taken away; redone: back
  await sleep(800);
  owner.room.send("build:undo", {});
  await waitFor(() => ops(member).length === 2);
  assert.deepEqual(ops(member)[1].ops[0].remove, [added[0].id], "undone: gone");
  owner.room.send("build:redo", {});
  await waitFor(() => ops(member).length === 3);
  assert.equal(ops(member)[2].ops[0].add?.[0]?.id, added[0].id, "redone: back, the same wall");
  // drawn along it again: there already, nothing sent
  owner.room.send("struct:walls", { add: [wall] });
  await waitFor(() =>
    (owner.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("there already")),
  );
  await sleep(200);
  assert.equal(ops(member).length, 3);
});

test("an arc drawn: in for everyone with its bow, too deep a bow refused", async () => {
  const s = ++space;
  const member = await person(32, s);
  const owner = await person(33, s, "member,builder");
  type Ops = { ops: { op: string; add?: { id: string; bow?: number }[]; remove?: string[] }[] }[];
  const ops = () => (member.msgs["struct:ops"] ?? []) as Ops;
  owner.room.send("struct:walls", { add: [{ a: [12, 8], b: [16, 8], front: "w", bow: 1.25 }] });
  await waitFor(() => ops().length === 1);
  const arc = ops()[0].ops[0].add?.[0];
  assert.equal(arc?.bow, 1.25, "its bow, as drawn");
  owner.room.send("struct:walls", { add: [{ a: [12, 12], b: [16, 12], front: "w", bow: 2.5 }] });
  await waitFor(() =>
    (owner.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("bows too far")),
  );
});

test("a wall's height and thickness: drawn a rail 0.1 thick, raised later as the same wall, undone", async () => {
  const s = ++space;
  const member = await person(34, s);
  const owner = await person(35, s, "member,builder");
  type Ops = { ops: { op: string; add?: { id: string; height: number; thick?: number }[]; remove?: string[] }[] }[];
  const ops = () => (member.msgs["struct:ops"] ?? []) as Ops;
  owner.room.send("struct:walls", { add: [{ a: [12, 8], b: [16, 8], front: "p", height: 1.1, thick: 0.1 }] });
  await waitFor(() => ops().length === 1);
  const rail = ops()[0].ops[0].add?.[0];
  assert.deepEqual([rail?.height, rail?.thick], [1.1, 0.1]);
  await sleep(800);
  owner.room.send("struct:walls", { set: [{ id: rail?.id ?? "", height: 2.4, thick: 0.3 }] });
  await waitFor(() => ops().length === 2);
  const o = ops()[1].ops[0];
  assert.deepEqual([o.remove, o.add?.[0].id, o.add?.[0].height, o.add?.[0].thick], [[rail?.id], rail?.id, 2.4, 0.3]);
  await sleep(800);
  owner.room.send("build:undo", {});
  await waitFor(() => ops().length === 3);
  assert.deepEqual(
    [ops()[2].ops[0].add?.[0].height, ops()[2].ops[0].add?.[0].thick],
    [1.1, 0.1],
    "undone: a rail again",
  );
});

test("a room found as walls close round it: a triangle, named (its outline kept), undone", async () => {
  const s = ++space;
  const owner = await person(36, s, "member,builder");
  type R = { key: string; outline: number[][]; props: { name: string } };
  const rooms = () =>
    ((owner.msgs["struct:ops"] ?? []) as { ops: { op: string; rooms?: R[] }[] }[]).flatMap((m) =>
      m.ops.filter((o) => o.op === "rooms").map((o) => o.rooms ?? []),
    );
  owner.room.send("struct:walls", {
    n: 3,
    add: [
      { a: [12, 8], b: [18, 8], front: "p" },
      { a: [18, 8], b: [12, 14], front: "p" },
      { a: [12, 14], b: [12, 8], front: "p" },
    ],
  });
  await waitFor(() => (owner.msgs["struct:walls:ok"]?.length ?? 0) === 1);
  const ok = owner.msgs["struct:walls:ok"]?.[0] as { found?: string[] };
  assert.equal(ok.found?.length, 1, "a room found");
  const key = ok.found?.[0] ?? "";
  const tri = rooms()
    .at(-1)
    ?.find((r) => r.key === key);
  assert.equal(tri?.props.name, "New room");
  assert.equal(tri?.outline.length, 3, "its outline the triangle");
  // named (an edit made on the map): its outline kept, not its rectangle
  await sleep(800);
  owner.room.send("map:room:update", { key, name: "Nook" });
  await waitFor(() => rooms().some((l) => l.some((r) => r.key === key && r.props.name === "Nook")));
  const named = rooms()
    .at(-1)
    ?.find((r) => r.key === key);
  assert.equal(named?.outline.length, 3, "still the triangle");
  // undone twice (the name, the walls): the room gone with them
  await sleep(800);
  owner.room.send("build:undo", {});
  await sleep(500);
  owner.room.send("build:undo", {});
  await waitFor(() => !(rooms().at(-1) ?? []).some((r) => r.key === key));
});

test("a door in a wall at 45°: placed from its wall, refused off its end, gone with its wall, back on undo", async () => {
  const s = ++space;
  const owner = await person(37, s, "member,builder");
  owner.room.send("struct:walls", { n: 1, add: [{ a: [12, 8], b: [18, 14], front: "p" }] });
  await waitFor(() => (owner.msgs["struct:walls:ok"]?.length ?? 0) === 1);
  const wall = (owner.msgs["struct:walls:ok"]?.[0] as { ids: string[] }).ids[0];
  const L = Math.hypot(6, 6);
  await sleep(800);
  // off its end: refused
  owner.room.send("obj:put", {
    id: "fd-bad",
    kind: "door",
    x: 0,
    y: 0,
    yaw: 0,
    props: { free: true, on: { wall, at: 0.1 } },
  });
  await waitFor(() =>
    (owner.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("off the end")),
  );
  assert.equal(owner.room.state.objects.get("fd-bad"), undefined);
  // in the middle: the server places it from the wall (what was sent for x, y, yaw is ignored)
  owner.room.send("obj:put", {
    id: "fd",
    kind: "door",
    x: 0,
    y: 0,
    yaw: 0,
    props: { free: true, on: { wall, at: L / 2 } },
  });
  await waitFor(() => !!owner.room.state.objects.get("fd"));
  const d = owner.room.state.objects.get("fd");
  assert.ok(Math.abs((d?.yaw ?? 0) - Math.PI / 4) < 1e-4, `yaw ${d?.yaw}`);
  assert.ok(Math.abs((d?.x ?? 0) - (15 - (Math.SQRT1_2 / 2) * 1)) < 0.01, `x ${d?.x}`);
  const props = JSON.parse(d?.props ?? "{}");
  assert.equal(props.free, true);
  assert.equal(props.on.wall, wall);
  // the wall taken away: the door goes with it; undone: both back
  await sleep(800);
  owner.room.send("struct:walls", { remove: [wall] });
  await waitFor(() => !owner.room.state.objects.get("fd"));
  await sleep(800);
  owner.room.send("build:undo", {});
  await waitFor(() => !!owner.room.state.objects.get("fd"));
});

test("floors and roofs: a mezzanine with a rail on it, a gable over a box, undone", async () => {
  const s = ++space;
  const owner = await person(38, s, "member,builder");
  type Ops = {
    ops: {
      op: string;
      slabs?: { id: string; z: number }[];
      roofs?: { id: string; kind: string }[];
      add?: { base: number }[];
    }[];
  }[];
  const ops = () => (owner.msgs["struct:ops"] ?? []) as Ops;
  const last = (op: string) =>
    ops()
      .flatMap((m) => m.ops)
      .filter((o) => o.op === op)
      .at(-1);
  owner.room.send("struct:slabs", {
    n: 1,
    add: [
      {
        outline: [
          [12, 8],
          [18, 8],
          [18, 12],
          [12, 12],
        ],
        top: ".",
        over: 1.75,
      },
    ],
  });
  await waitFor(() => (owner.msgs["struct:slabs:ok"]?.length ?? 0) === 1);
  const deck = (owner.msgs["struct:slabs:ok"]?.[0] as { ids: string[] }).ids[0];
  const z = last("slabs")?.slabs?.find((x) => x.id === deck)?.z ?? 0;
  await sleep(800);
  owner.room.send("struct:walls", { add: [{ a: [12, 12], b: [18, 12], front: "p", height: 1.1, over: 1.75 }] });
  await waitFor(() =>
    ops().some((m) => m.ops.some((o) => o.op === "walls" && o.add?.some((w) => Math.abs(w.base - z) < 1e-6))),
  );
  await sleep(800);
  // a box of walls, a gable on it
  owner.room.send("struct:walls", {
    add: [
      { a: [20, 8], b: [26, 8], front: "p" },
      { a: [26, 8], b: [26, 12], front: "p" },
      { a: [26, 12], b: [20, 12], front: "p" },
      { a: [20, 12], b: [20, 8], front: "p" },
    ],
  });
  await sleep(800);
  owner.room.send("struct:roofs", {
    add: [
      {
        outline: [
          [20, 8],
          [26, 8],
          [26, 12],
          [20, 12],
        ],
        kind: "gable",
        pitch: 30,
      },
    ],
  });
  await waitFor(() => (last("roofs")?.roofs ?? []).length === 1);
  // undone: no roof
  await sleep(800);
  owner.room.send("build:undo", {});
  await waitFor(() => (last("roofs")?.roofs ?? [1]).length === 0);
});

test("a lift stopping at a mezzanine: a stop up on it joins the shaft, the car rides there; off it, refused", async () => {
  const s = ++space;
  const owner = await person(40, s, "member,builder");
  owner.room.send("struct:slabs", {
    n: 1,
    add: [
      {
        outline: [
          [12, 8],
          [18, 8],
          [18, 12],
          [12, 12],
        ],
        top: ".",
        over: 2.5,
      },
    ],
  });
  await waitFor(() => (owner.msgs["struct:slabs:ok"]?.length ?? 0) === 1);
  await sleep(600);
  // a stop on the floor, one up on the mezzanine over it: the same shaft
  owner.room.send("obj:put", { id: "lg", kind: "elevator", x: 13, y: 9, yaw: 0, props: {} });
  await waitFor(() => !!owner.room.state.objects.get("lg"));
  owner.room.send("obj:put", { id: "lm", kind: "elevator", x: 13, y: 9, yaw: 0, props: { deck: 2.5 } });
  await waitFor(() => !!owner.room.state.objects.get("lm"));
  const props = (id: string) => JSON.parse(owner.room.state.objects.get(id)?.props ?? "{}");
  assert.equal(props("lm").deck, 2.5);
  assert.equal(props("lm").shaft, props("lg").shaft, "one shaft");
  // off the mezzanine: refused
  owner.room.send("obj:put", { id: "lx", kind: "elevator", x: 30, y: 20, yaw: 0, props: { deck: 2.5 } });
  await waitFor(() =>
    (owner.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("on the mezzanine")),
  );
  assert.equal(owner.room.state.objects.get("lx"), undefined);
  // in the car on the floor: called, sent up to the mezzanine — out there at its height
  const level = me(owner).level;
  await stepTo(owner, [
    { x: 14, y: 10, z: 0, l: level },
    { x: 14, y: 10.1, z: 0, l: level },
  ]);
  owner.room.send("lift:call", { id: "lg" });
  await waitFor(() => props("lg").door === "open", 5000);
  const up = Math.round((level + 2.5 / STOREY) * 1e4) / 1e4;
  owner.room.send("lift:go", { id: "lg", level: up });
  await waitFor(() => props("lm").door === "open", 12000);
  assert.equal(me(owner).level, level);
  assert.ok(Math.abs(me(owner).z - (level * STOREY + 2.5)) < 0.05, `up on it: ${me(owner).z}`);
  // and back down
  owner.room.send("lift:go", { id: "lm", level });
  await waitFor(() => props("lg").door === "open", 12000);
  assert.ok(Math.abs(me(owner).z - level * STOREY) < 0.05, `down: ${me(owner).z}`);
});

test("a desk placed free at 30°: kept with its middle and turn; where a wall runs through, refused", async () => {
  const s = ++space;
  const owner = await person(39, s, "member,builder");
  owner.room.send("obj:put", { id: "fdesk", kind: "desk", x: 14, y: 6.5, yaw: Math.PI / 6, props: { free: true } });
  await waitFor(() => !!owner.room.state.objects.get("fdesk"));
  const d = owner.room.state.objects.get("fdesk");
  assert.deepEqual([d?.x, d?.y], [14, 6.5]);
  assert.ok(Math.abs((d?.yaw ?? 0) - Math.PI / 6) < 1e-4);
  assert.equal(JSON.parse(d?.props ?? "{}").free, true);
  // a wall through where a second would go: refused
  owner.room.send("struct:walls", { add: [{ a: [16, 9], b: [20, 9], front: "p" }] });
  await sleep(600);
  owner.room.send("obj:put", { id: "fdesk2", kind: "desk", x: 18, y: 9, yaw: Math.PI / 6, props: { free: true } });
  await waitFor(() =>
    (owner.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("a wall's in the way")),
  );
  assert.equal(owner.room.state.objects.get("fdesk2"), undefined);
});

test("two-faced walls: each face its own material; wall items hang on either face, anywhere on it", async () => {
  const s = ++space;
  const owner = await person(29, s, "member,builder");
  const hw = (x: number) => edgeAt(owner, { dir: "h", x, y: 3 });
  const obj = (id: string) => owner.room.state.objects.get(id);
  owner.room.send("struct:walls", {
    add: [10, 11, 12].map((x) => ({ a: [x, 3], b: [x + 1, 3], front: "p" })),
    n: 1,
  });
  await waitFor(() => [10, 11, 12].map(hw).join("") === "ppp");
  const mid = (owner.msgs["struct:walls:ok"]?.at(-1) as { ids: string[] }).ids[1];
  // the back face (−y) cork, the front stays plaster
  owner.room.send("struct:walls", { set: [{ id: mid, back: "k" }] });
  await waitFor(() => backAt(owner, { dir: "h", x: 11, y: 3 }) === "k");
  assert.equal(hw(11), "p");
  // a whiteboard on the back face, half a tile along and raised three steps
  owner.room.send("obj:put", { id: "wb-back", kind: "whiteboard", x: 10, y: 2, yaw: Math.PI, props: { wu: 2, wz: 3 } });
  await waitFor(() => !!obj("wb-back"));
  assert.equal(quarterOf(obj("wb-back") ?? {}), 2);
  // (and fixed to that wall's back face: plan 72's `on`, structure/attach.ts)
  const { on, ...props } = JSON.parse(obj("wb-back")?.props ?? "{}");
  assert.deepEqual(props, { wu: 2, wz: 3 });
  assert.equal(on?.side, -1, "on the wall's back face");
  assert.equal(typeof on?.wall, "string");
  // the same spot on that face is taken; on the other face it's free
  const toasts = owner.msgs.toast?.length ?? 0;
  owner.room.send("obj:put", { id: "wb-over", kind: "whiteboard", x: 10, y: 2, yaw: Math.PI, props: { wu: 3, wz: 3 } });
  await waitFor(() => (owner.msgs.toast?.length ?? 0) > toasts);
  assert.equal(obj("wb-over"), undefined);
  owner.room.send("obj:put", { id: "wb-front", kind: "whiteboard", x: 10, y: 3, yaw: 0, props: { wu: 2, wz: 99 } });
  await waitFor(() => !!obj("wb-front"));
  assert.equal(JSON.parse(obj("wb-front")?.props ?? "{}").wz, 6, "as high as it goes, not off the wall");
  // the wall can't go from under them
  owner.room.send("struct:walls", { remove: [mid] });
  await waitFor(() =>
    (owner.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("hangs on that wall")),
  );
  assert.equal(hw(11), "p");
});

test("build undo/redo: per person, a drag is one step, others' later edits are kept", async () => {
  const s = ++space;
  const ana = await person(40, s, "member,builder");
  const bia = await person(41, s, "member,builder");
  const hw = (x: number) => edgeAt(ana, { dir: "h", x, y: 3 });
  const hist = (p: Person) => p.msgs["build:history"]?.at(-1) as { undo: number; redo: number } | undefined;
  // a drag arrives as several batches: one step
  ana.room.send("struct:walls", { add: [{ a: [10, 3], b: [11, 3], front: "b" }] });
  await sleep(100);
  ana.room.send("struct:walls", { add: [{ a: [11, 3], b: [12, 3], front: "b" }] });
  ana.room.send("obj:put", { id: "u-plant", kind: "plant", x: 12, y: 4, yaw: 0 });
  await waitFor(() => hist(ana)?.undo === 1, 4000);
  // Bia draws a wall of her own next to them
  bia.room.send("struct:walls", { add: [{ a: [12, 3], b: [13, 3], front: "w" }] });
  await waitFor(() => hist(bia)?.undo === 1, 4000);
  assert.equal(hist(ana)?.undo, 1, "Bia's edit isn't on Ana's stack");
  ana.room.send("build:undo", {});
  // (the walls come as the structure's operations, at once; the plant with the next patch)
  await waitFor(() => hw(10) === "." && hw(11) === "." && !ana.room.state.objects.get("u-plant"));
  assert.equal(hw(12), "w", "Bia's wall stays");
  await waitFor(() => hist(ana)?.redo === 1 && hist(ana)?.undo === 0);
  ana.room.send("build:redo", {});
  await waitFor(() => hw(10) === "b" && hw(11) === "b" && !!ana.room.state.objects.get("u-plant"));
  // members can't undo anything
  const member = await person(42, s);
  member.room.send("build:undo", {});
  await sleep(200);
  assert.equal(hw(10), "b");
});

test("rooms + doors: an owned room with walls, locked so only its owner gets in or out", async () => {
  const s = ++space;
  const owner = await person(29, s, "member,builder,admin"); // an admin
  const ana = await person(30, s); // room owner
  const bia = await person(31, s);
  owner.room.send("map:new", { width: 32, height: 24 });
  await waitFor(() => home(owner).width === 32);
  const key = await makeRoom(owner, {
    name: "Ana's office",
    kind: "private",
    x: 4,
    y: 4,
    w: 5,
    h: 4,
    ownerId: 30,
    ownerName: "P30",
  });
  const DOOR = `door-${key}`;
  const areas = home(owner).areas;
  assert.equal(areas.find((a: { key: string }) => a.key === key)?.ownerId, 30);
  // bia can open/close but not lock
  await walk(bia, { x: 6.5, y: 10.5 });
  bia.room.send("door:set", { id: DOOR, state: "locked" });
  await waitFor(() => (bia.msgs.toast?.length ?? 0) > 0);
  assert.equal(JSON.parse(owner.room.state.objects.get(DOOR).props).state, "open");
  // ana walks in and locks it
  await walk(ana, { x: 6.5, y: 5.5 });
  ana.room.send("door:set", { id: DOOR, state: "locked" });
  await waitFor(() => JSON.parse(ana.room.state.objects.get(DOOR).props).state === "locked");
  await sleep(200);
  // bia can't walk in, can't teleport to ana
  await walk(bia, { x: 6.5, y: 5.5 });
  assert.ok(me(bia).y > 8, "bia stays outside");
  // (a client pushing raw moves through the locked door isn't put back: the door holds in the
  // browser, on Jolt — no anticheat, the user's call 2026-10-28)
  bia.room.send("teleport", { to: { userId: 30 } });
  await sleep(300);
  assert.ok(me(bia).y > 8, "no teleporting in");
  // ana can still walk out (and back in)
  await walk(ana, { x: 6.5, y: 11.5 });
  assert.ok(me(ana).y > 9, "the owner walks out");
  // an owner's lock is theirs: not even an admin opens it, nor builds a way round it
  const door = () => owner.room.state.objects.get(DOOR);
  const toasts = owner.msgs.toast?.length ?? 0;
  owner.room.send("door:set", { id: DOOR, state: "open" });
  await waitFor(() => (owner.msgs.toast?.length ?? 0) > toasts);
  assert.equal(JSON.parse(door().props).state, "locked", "the admin can't unlock it");
  const west = st(owner).walls.find((w) => w.a[0] === 4 && w.b[0] === 4 && Math.min(w.a[1], w.b[1]) <= 5)?.id ?? "";
  owner.room.send("struct:walls", { remove: [west] });
  owner.room.send("obj:remove", { id: DOOR });
  owner.room.send("map:room:remove", { key: key });
  await sleep(400);
  assert.notEqual(edgeAt(owner, { dir: "v", x: 4, y: 5 }), ".", "its walls stay");
  assert.ok(door(), "its door stays");
  assert.ok(home(owner).areas.some((a: { key: string }) => a.key === key));
  // a wall elsewhere is fine
  owner.room.send("struct:walls", { add: [{ a: [20, 5], b: [20, 6], front: "p" }] });
  await waitFor(() => edgeAt(owner, { dir: "v", x: 20, y: 5 }) === "p");
  // ana unlocks it (from anywhere): bia walks in
  ana.room.send("door:set", { id: DOOR, state: "open" });
  await waitFor(() => JSON.parse(door().props).state === "open");
  await sleep(200);
  await walk(bia, { x: 6.5, y: 5.5 });
  assert.ok(me(bia).y < 8, "open again: bia walks in");
});

test("desks for a person", async () => {
  const s = ++space;
  const owner = await person(32, s, "member,builder");
  owner.room.send("desk:assign", { id: "seat-3-5-a", ownerId: 33, ownerName: "P33" });
  await waitFor(() => JSON.parse(owner.room.state.objects.get("seat-3-5-a").props).ownerId === 33);
  owner.room.send("desk:assign", { id: "seat-7-5-a", ownerId: 33, ownerName: "P33" });
  await waitFor(() => JSON.parse(owner.room.state.objects.get("seat-7-5-a").props).ownerId === 33);
  await waitFor(() => JSON.parse(owner.room.state.objects.get("seat-3-5-a").props).ownerId === undefined, 2000);
});

test("build hand: one builder holds a thing at a time; group moves are all or nothing", async () => {
  const s = ++space;
  const ana = await person(50, s, "member,builder");
  const bia = await person(51, s, "member,builder");
  const obj = (id: string) => ana.room.state.objects.get(id);
  ana.room.send("obj:put", { id: "h-plant", kind: "plant", x: 10, y: 3, yaw: 0 });
  await waitFor(() => !!obj("h-plant"));
  // Ana picks it up: Bia can't move it, and is told who has it
  ana.room.send("obj:hold", { ids: ["h-plant"] });
  await waitFor(() => !!ana.room.state.holds.get("h-plant"));
  bia.room.send("obj:put", { id: "h-plant", kind: "plant", x: 12, y: 3, yaw: 0 });
  await waitFor(() =>
    (bia.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("P50 is moving")),
  );
  assert.equal(obj("h-plant")?.x, 10, "still where Ana's hand left it");
  // Ana puts it down: the hold is gone, and Bia may move it again
  ana.room.send("obj:put", { id: "h-plant", kind: "plant", x: 11, y: 3, yaw: 0 });
  await waitFor(() => obj("h-plant")?.x === 11 && !ana.room.state.holds.get("h-plant"));
  // a group that doesn't all fit changes nothing
  ana.room.send("obj:batch", {
    items: [
      { id: "h-plant", kind: "plant", x: 13, y: 3, yaw: 0 },
      { kind: "plant", x: 900, y: 900, yaw: 0 }, // off the map: no
    ],
  });
  await sleep(300);
  assert.equal(obj("h-plant")?.x, 11, "nothing moved");
  // …one that does, moves and adds together
  const before = ana.room.state.objects.size;
  ana.room.send("obj:batch", {
    items: [
      { id: "h-plant", kind: "plant", x: 13, y: 3, yaw: 0 },
      { kind: "plant", x: 14, y: 3, yaw: 0 },
    ],
  });
  await waitFor(() => obj("h-plant")?.x === 13 && ana.room.state.objects.size === before + 1);
  const copy = [...ana.room.state.objects.values()].find((o) => o.kind === "plant" && o.x === 14 && o.y === 3);
  assert.ok(copy, "the copy is there");
  // remove several at once
  ana.room.send("obj:removeMany", { ids: ["h-plant", copy.id] });
  await waitFor(() => !obj("h-plant") && !obj(copy.id));
  // a hand lets go when its builder leaves
  bia.room.send("obj:put", { id: "h-lamp", kind: "lamp", x: 12, y: 3, yaw: 0 });
  await waitFor(() => !!obj("h-lamp"));
  bia.room.send("obj:hold", { ids: ["h-lamp"] });
  await waitFor(() => !!ana.room.state.holds.get("h-lamp"));
  await bia.room.leave(true);
  await waitFor(() => !ana.room.state.holds.get("h-lamp"));
});

test("tabletops sit on surfaces and ride along; looks are checked; clutter becomes real", async () => {
  const s = ++space;
  const ana = await person(52, s, "member,builder");
  const st = ana.room.state;
  const obj = (id: string) => st.objects.get(id);
  ana.room.send("obj:put", { id: "t-desk", kind: "desk", x: 10, y: 3, yaw: 0 });
  await waitFor(() => !!obj("t-desk"));
  // a mug on the desk's right half: at the desk's height
  ana.room.send("obj:put", { id: "t-mug", kind: "tabletop", x: 11, y: 3, yaw: 0, props: { d: "mug", seed: 0.3 } });
  await waitFor(() => !!obj("t-mug"));
  assert.equal(JSON.parse(obj("t-mug")?.props ?? "{}").z, entry("desk").surface);
  // more than one per tile: a second mug in the next quarter, but not on the first
  ana.room.send("obj:put", { id: "t-mug2", kind: "tabletop", x: 11, y: 3, yaw: 0, props: { d: "mug", c: [2, 1] } });
  await waitFor(() => !!obj("t-mug2"));
  ana.room.send("obj:put", { id: "t-mug3", kind: "tabletop", x: 11, y: 3, yaw: 0, props: { d: "mug", c: [1, 1] } });
  await sleep(300);
  assert.equal(obj("t-mug3"), undefined);
  ana.room.send("obj:remove", { id: "t-mug2" });
  await waitFor(() => !obj("t-mug2"));
  // a desk placed now is bare for good (never furnished on the next load)
  assert.equal(JSON.parse(obj("t-desk")?.props ?? "{}").split, 1);
  // the room's own desks came set up: monitors and keyboards are real things
  const tops = [...st.objects.values()].filter((o) => o.kind === "tabletop");
  assert.ok(
    tops.some((o) => JSON.parse(o.props).d === "keyboard"),
    "keyboards on the studio's desks",
  );
  // …and their screens are computers (VortexOS, shared/computer.ts), none left a plain monitor
  assert.ok(
    [...st.objects.values()].some((o) => o.kind === "computer"),
    "computers on the studio's desks",
  );
  assert.ok(!tops.some((o) => JSON.parse(o.props).d === "monitor"), "no plain monitors left");
  assert.ok(
    [...st.objects.values()].some((o) => o.kind === "side_table"),
    "the radio's stand",
  );
  // not on the floor
  ana.room.send("obj:put", { id: "t-floor", kind: "tabletop", x: 13, y: 3, yaw: 0, props: { d: "mug" } });
  await sleep(300);
  assert.equal(obj("t-floor"), undefined);
  // the desk moves (and turns): the mug keeps its spot on it
  ana.room.send("obj:put", { id: "t-desk", kind: "desk", x: 12, y: 3, yaw: 0 });
  await waitFor(() => obj("t-mug")?.x === 13 && obj("t-mug")?.y === 3);
  ana.room.send("obj:put", { id: "t-desk", kind: "desk", x: 12, y: 3, yaw: Math.PI });
  await waitFor(() => obj("t-mug")?.x === 12, 3000);
  // the desk goes: so does what's on it
  ana.room.send("obj:remove", { id: "t-desk" });
  await waitFor(() => !obj("t-desk") && !obj("t-mug"));
  // looks: a real variant stays, a made-up one is dropped
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, yaw: 0, props: { variant: 2 } });
  await waitFor(() => !!obj("t-chair"));
  assert.equal(JSON.parse(obj("t-chair")?.props ?? "{}").variant, 2);
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, yaw: 0, props: { variant: 9 } });
  await waitFor(() => JSON.parse(obj("t-chair")?.props ?? "{}").variant === undefined);
  // a colour: kept on things that take one (a valid hex), dropped otherwise
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, yaw: 0, props: { color: "#3d4a5c" } });
  await waitFor(() => JSON.parse(obj("t-chair")?.props ?? "{}").color === "#3d4a5c");
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, yaw: 0, props: { color: "red" } });
  await waitFor(() => JSON.parse(obj("t-chair")?.props ?? "{}").color === undefined);
  ana.room.send("obj:put", { id: "t-plant", kind: "plant", x: 12, y: 3, yaw: 0, props: { color: "#3d4a5c" } });
  await waitFor(() => !!obj("t-plant"));
  assert.equal(JSON.parse(obj("t-plant")?.props ?? "{}").color, undefined, "plants aren't painted");
  ana.room.send("obj:remove", { id: "t-plant" });
  // generated clutter: taking a piece hides it and puts a real one in its place
  const map = () => ({ ...home(ana), levels: undefined, floor: undefined });
  const objects = () =>
    [...st.objects.values()].map((o) => ({
      id: o.id,
      kind: o.kind,
      x: o.x,
      y: o.y,
      yaw: o.yaw,
      props: JSON.parse(o.props),
    }));
  const piece = dressItems(map(), objects()).find((d) => d.kind !== "frame");
  assert.ok(piece, "the studio has floor clutter");
  ana.room.send("dress:take", { id: piece.id });
  await waitFor(() => !!obj(takenId(piece.id)));
  const real = obj(takenId(piece.id));
  assert.equal(real?.kind, "decor");
  assert.equal(JSON.parse(real?.props ?? "{}").d, piece.kind);
  assert.ok(!dressItems(map(), objects()).some((d) => d.id === piece.id), "the generated one is gone");
  // members can't take clutter
  const bea = await person(53, s);
  const other = dressItems(map(), objects()).find((d) => d.kind !== "frame");
  if (other) {
    bea.room.send("dress:take", { id: other.id });
    await sleep(300);
    assert.equal(obj(takenId(other.id)), undefined);
  }
});

test("between people: a wave carries, a high five needs you close and not on do-not-disturb, a drink is handed over", async () => {
  const s = ++space;
  const a = await person(23, s);
  const b = await person(24, s);
  const seen = (who: Person, sid: string) => who.room.state.players.get(sid);
  const machine = [...a.room.state.objects.values()].find((o) => o.kind === "coffee_machine");
  assert.ok(machine);
  // a wave carries across the room
  a.room.send("social", { to: b.room.sessionId, act: "wave" });
  await waitFor(() => seen(b, a.room.sessionId)?.act === "wave");
  assert.equal(seen(a, b.room.sessionId)?.act, "", "a wave is one-sided");
  await waitFor(() => seen(b, a.room.sessionId)?.act === "", 4000);
  // Ana goes for a coffee: a high five doesn't reach that far
  await walk(a, { x: machine.x + 0.5, y: machine.y + 1.5 });
  a.room.send("social", { to: b.room.sessionId, act: "highfive" });
  await sleep(300);
  assert.equal(seen(a, a.room.sessionId)?.act, "");
  await sleep(600);
  a.room.send("item:take", { id: machine.id });
  await waitFor(() => seen(b, a.room.sessionId)?.held === "mug");
  await walk(b, { x: machine.x + 1.5, y: machine.y + 1.5 });
  // on do-not-disturb: only a wave
  b.room.send("status", { status: "dnd" });
  await waitFor(() => seen(a, b.room.sessionId)?.status === "dnd");
  a.room.send("social", { to: b.room.sessionId, act: "highfive" });
  await sleep(900);
  assert.equal(seen(a, a.room.sessionId)?.act, "");
  b.room.send("status", { status: "online" });
  await waitFor(() => seen(a, b.room.sessionId)?.status === "online");
  // both sides show it, from the same moment; Bea hears about it
  a.room.send("social", { to: b.room.sessionId, act: "highfive" });
  await waitFor(() => seen(b, b.room.sessionId)?.act === "highfive");
  assert.equal(seen(b, a.room.sessionId)?.actWith, b.room.sessionId);
  assert.equal(seen(b, b.room.sessionId)?.actAt, seen(b, a.room.sessionId)?.actAt);
  assert.ok((b.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("high-fived")));
  // cheers needs two drinks
  await waitFor(() => seen(a, a.room.sessionId)?.act === "", 3000);
  await sleep(850);
  a.room.send("social", { to: b.room.sessionId, act: "cheers" });
  await sleep(400);
  assert.equal(seen(a, a.room.sessionId)?.act, "");
  // handing it over: Bea has it once the hands meet, with the sips it had
  const heldAt = seen(a, a.room.sessionId)?.heldAt;
  a.room.send("social", { to: b.room.sessionId, act: "give" });
  await waitFor(() => seen(a, b.room.sessionId)?.act === "take");
  await waitFor(() => seen(a, b.room.sessionId)?.held === "mug", 3000);
  assert.equal(seen(a, a.room.sessionId)?.held, "");
  assert.equal(seen(a, b.room.sessionId)?.heldAt, heldAt);
  // nonsense is ignored
  a.room.send("social", { to: b.room.sessionId, act: "<hug>" });
  a.room.send("social", { to: a.room.sessionId, act: "wave" });
  await sleep(300);
});

test("focus while seated; light switches turn their room's lamps", async () => {
  const s = ++space;
  const a = await person(25, s, "member,builder");
  const b = await person(26, s);
  const at = me(a);
  // focus only while you're sitting
  a.room.send("pos", { x: at?.x ?? 0, y: at?.y ?? 0, yaw: 32, a: 2, seq: 1 });
  a.room.send("focus", { on: true });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.focus === true);
  // walking off ends it; and standing, you can't
  a.room.send("pos", { x: (at?.x ?? 0) + 0.1, y: at?.y ?? 0, yaw: 32, a: 1, seq: 2 });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.focus === false);
  a.room.send("focus", { on: true });
  await sleep(300);
  assert.equal(b.room.state.players.get(a.room.sessionId)?.focus, false);
  // a switch within reach, two lamps in its room, one in another room
  const x = Math.floor(at?.x ?? 0);
  const y = Math.floor(at?.y ?? 0);
  const { map } = liveWorld(a);
  // (a wall you can walk up to: not the inside of the elevators' core)
  const sw = spotFor(
    a,
    "light_switch",
    x,
    y,
    10,
    (sx, sy) =>
      !!areaAt(map, sx + 0.5, sy + 0.5) && !!wayOf(a, { x: at?.x ?? 0, y: at?.y ?? 0 }, { x: sx + 0.5, y: sy + 1.5 }),
  );
  assert.ok(sw, "a wall to put the switch on");
  await walk(a, { x: sw.x + 0.5, y: sw.y + 1.5 });
  const room = areaAt(map, sw.x + 0.5, sw.y + 0.5)?.key;
  const inRoom = (sx: number, sy: number) => areaAt(map, sx + 0.5, sy + 0.5)?.key === room;
  a.room.send("obj:put", { id: "t-switch", kind: "light_switch", ...sw, yaw: 0 });
  const l1 = spotFor(a, "lamp", sw.x, sw.y + 1, 6, inRoom);
  assert.ok(l1);
  a.room.send("obj:put", { id: "t-lamp1", kind: "lamp", ...l1, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("t-lamp1"));
  const l2 = spotFor(
    a,
    "lamp",
    sw.x,
    sw.y + 1,
    6,
    (sx, sy) => inRoom(sx, sy) && Math.hypot(sx - l1.x, sy - l1.y) > 1.5,
  );
  assert.ok(l2);
  a.room.send("obj:put", { id: "t-lamp2", kind: "lamp", ...l2, yaw: 0 });
  const l3 = spotFor(
    a,
    "lamp",
    sw.x,
    sw.y,
    14,
    (sx, sy) => !!room && !inRoom(sx, sy) && !!areaAt(map, sx + 0.5, sy + 0.5),
  );
  assert.ok(l3, "another room nearby");
  a.room.send("obj:put", { id: "t-lamp3", kind: "lamp", ...l3, yaw: 0 });
  await waitFor(() => ["t-switch", "t-lamp2", "t-lamp3"].every((id) => !!a.room.state.objects.get(id)));
  const on = (id: string) => JSON.parse(b.room.state.objects.get(id)?.props ?? "{}").on !== false;
  a.room.send("lights:room", { id: "t-switch", on: false });
  await waitFor(() => !on("t-lamp1") && !on("t-lamp2"));
  assert.equal(on("t-lamp3"), true, "another room's lamp stays on");
  a.room.send("lights:room", { id: "t-switch", on: true });
  await waitFor(() => on("t-lamp1") && on("t-lamp2"));
  for (const id of ["t-switch", "t-lamp1", "t-lamp2", "t-lamp3"]) a.room.send("obj:remove", { id });
});

test("a group comes down in any order: what's on a desk is placed after the desk", async () => {
  const s = ++space;
  const a = await person(27, s, "member,builder");
  const at = me(a);
  const spot = spotFor(a, "desk", Math.floor(at?.x ?? 0), Math.floor(at?.y ?? 0) - 3, 6, () => true);
  assert.ok(spot);
  const count = () => [...a.room.state.objects.values()].filter((o) => o.x === spot.x && o.y === spot.y).length;
  a.room.send("obj:batch", {
    items: [
      { kind: "tabletop", x: spot.x, y: spot.y, yaw: 0, props: { d: "mug", c: [1, 1] } },
      { kind: "desk", x: spot.x, y: spot.y, yaw: 0 },
    ],
  });
  await waitFor(() => count() === 2);
  const mug = [...a.room.state.objects.values()].find((o) => o.kind === "tabletop" && o.x === spot.x && o.y === spot.y);
  assert.equal(JSON.parse(mug?.props ?? "{}").z, entry("desk").surface, "standing on the desk's top");
});

test("slot cars: lanes near the track, five lights, laps counted from what a real car could do", async () => {
  const s = ++space;
  const a = await person(41, s, "member,builder");
  const b = await person(42, s);
  const at = me(a);
  const spot = spotFor(a, "slot_track", Math.floor(at?.x ?? 0) - 2, Math.floor(at?.y ?? 0) - 4, 5, () => true);
  assert.ok(spot, "room for a track");
  a.room.send("obj:put", { id: "t-slot", kind: "slot_track", x: spot.x, y: spot.y, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("t-slot"));
  const race = () => b.room.state.slots.get("t-slot");
  // too far from the table: no lane
  const far = me(b);
  const near = (p: { x: number; y: number }) =>
    Math.hypot(p.x - Math.max(spot.x, Math.min(p.x, spot.x + 4)), p.y - Math.max(spot.y, Math.min(p.y, spot.y + 3)));
  if (far && near(far) > 3) {
    b.room.send("slot:join", { id: "t-slot", lane: 0 });
    await waitFor(() => (b.msgs.toast?.length ?? 0) > 0);
    assert.ok(!race()?.cars.get("0"));
  }
  if (near(me(a) ?? { x: 0, y: 0 }) > 2.5) await walk(a, { x: spot.x + 2, y: spot.y + 3.5 });
  a.room.send("slot:join", { id: "t-slot", lane: 1 });
  await waitFor(() => race()?.cars.get("1")?.name === "P41");
  // starting: the lights come on one by one, then go out
  a.room.send("slot:start", { id: "t-slot", laps: 3 });
  await waitFor(() => race()?.phase === "countdown");
  await waitFor(() => (race()?.lights ?? 0) >= 3, 3000);
  await waitFor(() => race()?.phase === "race", 6000);
  assert.equal(race()?.laps, 3);
  // a teleport is ignored
  a.room.send("slot:car", { id: "t-slot", s: 6, v: 3, off: 0, ov: 0 });
  await sleep(150);
  assert.equal(race()?.cars.get("1")?.s, 0);
  // drive a careful lap, reporting at 20 Hz like the client
  const car = newCar();
  const tick = 0.05;
  const careful = () => {
    let lim = SLOT_VMAX;
    for (let d = 0; d <= 1.2; d += 0.01) {
      const k = slotCurve(car.s + d);
      if (k) lim = Math.min(lim, Math.sqrt(SLOT_GRIP / k) * 0.9 + d * 3);
    }
    return car.v < lim ? 1 : 0;
  };
  while (car.s < SLOT_LAP + 0.3) {
    for (let i = 0; i < 5; i++) stepCar(car, careful(), tick / 5);
    a.room.send("slot:car", { id: "t-slot", s: car.s, v: car.v, off: car.off, ov: car.ov });
    await sleep(tick * 1000);
  }
  await waitFor(() => race()?.cars.get("1")?.lap === 1);
  const lap = race()?.cars.get("1");
  assert.ok((lap?.best ?? 0) > 2 && (lap?.best ?? 0) < 8, `a lap in ${lap?.best}`);
  // giving the lane back empties the race: back to the lobby
  a.room.send("slot:leave", { id: "t-slot" });
  await waitFor(() => race()?.cars.size === 0 && race()?.phase === "lobby");

  // another track on the table (saved with it), a race on "free": flat out
  // through a corner is a car a real one could be, leaving the slot isn't
  if (far && near(far) > 3) {
    b.room.send("slot:track", { id: "t-slot", track: "speedway" });
    await sleep(150);
    assert.ok(!JSON.parse(a.room.state.objects.get("t-slot")?.props ?? "{}").track, "Bia is too far to change it");
  }
  a.room.send("slot:track", { id: "t-slot", track: "moon" });
  a.room.send("slot:track", { id: "t-slot", track: "speedway" });
  await waitFor(() => JSON.parse(a.room.state.objects.get("t-slot")?.props ?? "{}").track === "speedway");
  a.room.send("slot:join", { id: "t-slot", lane: 2 });
  await waitFor(() => race()?.cars.get("2")?.name === "P41");
  a.room.send("slot:start", { id: "t-slot", laps: 3, diff: "free" });
  await waitFor(() => race()?.phase === "race", 8000);
  assert.equal(race()?.diff, "free");
  const bend = 1.4 + 0.3; // into the speedway's first bend
  assert.ok(slotCurve(bend, "speedway") > 0);
  // (reported as a car gets there: a jump the length of the straight is a teleport)
  for (let s = 0.3; s < bend + 0.01; s = Math.min(bend, s + 0.3)) {
    a.room.send("slot:car", { id: "t-slot", s, v: 3.9, off: 0, ov: 0 });
    await sleep(90);
    if (s === bend) break;
  }
  await waitFor(() => (race()?.cars.get("2")?.s ?? 0) >= bend - 1e-6);
  a.room.send("slot:car", { id: "t-slot", s: bend + 0.05, v: 0, off: 0.05, ov: 3.9 });
  await sleep(150);
  assert.equal(race()?.cars.get("2")?.off, 0, "a car off its slot is no car on free");
  // laps count on this track's own length (a lap is shorter than the classic's)
  assert.ok(slotLap("speedway") < SLOT_LAP);
  a.room.send("slot:track", { id: "t-slot", track: "clover" });
  await sleep(150);
  assert.equal(JSON.parse(a.room.state.objects.get("t-slot")?.props ?? "{}").track, "speedway", "not during a race");
  a.room.send("slot:leave", { id: "t-slot" });
  await waitFor(() => race()?.cars.size === 0 && race()?.phase === "lobby");
  a.room.send("obj:remove", { id: "t-slot" });
  await waitFor(() => !race());
});

test("the arrival point: builders move it to open floor, and that's where people come in", async () => {
  const s = ++space;
  const owner = await person(43, s, "member,builder");
  const member = await person(44, s);
  const _st = () => owner.room.state;
  const from = { ...home(owner).spawn };
  // somewhere open a few tiles away
  const g = liveGrid(owner);
  let to: { x: number; y: number } | null = null;
  for (let r = 2; r < 8 && !to; r++)
    for (const [dx, dy] of [
      [r, 0],
      [0, r],
      [-r, 0],
      [0, -r],
    ])
      if (!to && g.ok(Math.floor(from.x) + dx, Math.floor(from.y) + dy))
        to = { x: Math.floor(from.x) + dx, y: Math.floor(from.y) + dy };
  assert.ok(to, "an open tile nearby");
  // members can't; a wall-less void tile is refused
  member.room.send("map:spawn", to);
  await sleep(250);
  assert.equal(home(owner).spawn.x, from.x);
  owner.room.send("map:spawn", { x: -5, y: -5 });
  await waitFor(() => (owner.msgs.toast ?? []).some((m) => /open floor/i.test((m as { text: string }).text)));
  owner.room.send("map:spawn", to);
  await waitFor(() => home(owner).spawn.x === to.x + 0.5 && home(owner).spawn.y === to.y + 0.5);
  await waitFor(() => (owner.msgs.toast ?? []).some((m) => /Arrival point set/.test((m as { text: string }).text)));
  // someone coming in now arrives there
  const late = await person(45, s);
  const p = late.room.state.players.get(late.room.sessionId);
  assert.ok(Math.hypot(p.x - (to.x + 0.5), p.y - (to.y + 0.5)) < 1.01, `arrived at ${p.x},${p.y}`);
});

// Coming in as the first time, at the arrival point (anyone else comes back where
// they were: docs/plan/36-the-ghost.md) — for the test's leaves and joins in a row.
async function longGone(t: { after(fn: () => void): void }) {
  const { WorldRoom } = await import("./WorldRoom.ts");
  WorldRoom.comeBack = false;
  t.after(() => {
    WorldRoom.comeBack = true;
  });
}

test("your own arrival point: pick a spot you can walk to, arrive there, go back to it, reset it", async (t) => {
  await longGone(t);
  const s = ++space;
  const ana = await person(54, s);
  const bia = await person(55, s); // keeps the room alive while Ana comes back
  const sp = home(ana).spawn;
  const mine = () => (ana.msgs["spawn:mine"] ?? []).at(-1) as { at: { x: number; y: number } | null } | undefined;
  await waitFor(() => mine() !== undefined && mine()?.at === null);
  // an open tile a few steps away, reachable from the arrival point, not in a booth
  const g = liveGrid(ana);
  const { map } = liveWorld(ana);
  let to: { x: number; y: number } | null = null;
  for (let r = 3; r < 9 && !to; r++)
    for (const [dx, dy] of [
      [r, 0],
      [0, r],
      [-r, 0],
      [0, -r],
    ]) {
      const x = Math.floor(sp.x) + dx;
      const y = Math.floor(sp.y) + dy;
      if (!to && g.ok(x, y) && g.fits(x + 0.5, y + 0.5) && areaAt(map, x + 0.5, y + 0.5)?.kind !== "booth")
        if (wayOf(ana, sp, { x: x + 0.5, y: y + 0.5 })?.length) to = { x, y };
    }
  assert.ok(to, "an open tile nearby");
  // off the map: refused, nothing changes
  ana.room.send("spawn:mine", { at: { x: -4, y: -4 } });
  await waitFor(() => (ana.msgs.toast ?? []).some((m) => /off the map/i.test((m as { text: string }).text)));
  assert.equal(mine()?.at, null);
  await sleep(550);
  ana.room.send("spawn:mine", { at: to });
  await waitFor(() => mine()?.at?.x === to.x + 0.5 && mine()?.at?.y === to.y + 0.5);
  // coming back in: Ana arrives at hers, Bia still at the space's
  await ana.room.leave(true);
  const again = await person(54, s);
  const p = me(again);
  assert.ok(Math.hypot(p.x - (to.x + 0.5), p.y - (to.y + 0.5)) < 0.01, `arrived at ${p.x},${p.y}`);
  await waitFor(() => (again.msgs["spawn:mine"] ?? []).some((m) => (m as { at: unknown }).at !== null));
  assert.ok(Math.hypot(me(bia).x - sp.x, me(bia).y - sp.y) < 1.5, "Bia at the space's arrival point");
  // "go to the arrival point" takes her to her own; reset → the space's again
  again.room.send("teleport", { to: { userId: 55 } });
  await waitFor(() => Math.hypot(me(again).x - (to.x + 0.5), me(again).y - (to.y + 0.5)) > 0.5);
  again.room.send("teleport", { to: "spawn" });
  await waitFor(() => Math.hypot(me(again).x - (to.x + 0.5), me(again).y - (to.y + 0.5)) < 0.01);
  again.room.send("spawn:mine", { at: null });
  await waitFor(() => ((again.msgs["spawn:mine"] ?? []).at(-1) as { at: unknown }).at === null);
  again.room.send("teleport", { to: "spawn" });
  await waitFor(() => Math.hypot(me(again).x - sp.x, me(again).y - sp.y) < 1.5);
});

test("your own arrival point in a booth: fine while it's free, the space's while someone's talking in it", async (t) => {
  await longGone(t);
  const s = ++space;
  const ana = await person(56, s);
  const bia = await person(57, s);
  const sp = home(ana).spawn;
  const mine = (p: Person) =>
    (p.msgs["spawn:mine"] ?? []).at(-1) as { at: { x: number; y: number } | null } | undefined;
  await walk(ana, { x: 31.5, y: 16.5 });
  assert.equal(me(ana).area, "booth-1");
  ana.room.send("spawn:mine", { at: { x: me(ana).x, y: me(ana).y } });
  await waitFor(() => mine(ana)?.at !== null && mine(ana)?.at !== undefined);
  const spot = mine(ana)?.at as { x: number; y: number };
  // back in while it's free: in the booth
  await ana.room.leave(true);
  let again = await person(56, s);
  assert.ok(Math.hypot(me(again).x - spot.x, me(again).y - spot.y) < 0.01, "arrived in the booth");
  // Bia takes the booth for a call (Ana steps out): Ana comes in at the space's spot
  await walk(again, { x: 31.5, y: 12.5 });
  assert.notEqual(me(again).area, "booth-1");
  await walk(bia, { x: 31.5, y: 17.5 });
  assert.equal(me(bia).area, "booth-1");
  await again.room.leave(true);
  again = await person(56, s);
  assert.ok(Math.hypot(me(again).x - sp.x, me(again).y - sp.y) < 1.5, `arrived at ${me(again).x},${me(again).y}`);
  assert.deepEqual(mine(again)?.at, spot, "the spot is kept");
});

test("back where they left, unless it's shut to them now: a booth someone's talking in", async () => {
  const s = ++space;
  const ana = await person(58, s);
  const bia = await person(59, s);
  const sp = home(ana).spawn;
  // Ana leaves from inside the booth: back in it while it's free
  await walk(ana, { x: 31.5, y: 16.5 });
  assert.equal(me(ana).area, "booth-1");
  const was = { x: me(ana).x, y: me(ana).y };
  rooms.splice(rooms.indexOf(ana.room), 1);
  await ana.room.leave(true);
  let again = await person(58, s);
  assert.ok(Math.hypot(me(again).x - was.x, me(again).y - was.y) < 0.6, `arrived at ${me(again).x},${me(again).y}`);
  // gone again; Bia takes the booth for a call: Ana comes in at the space's arrival point
  rooms.splice(rooms.indexOf(again.room), 1);
  await again.room.leave(true);
  await walk(bia, { x: 31.5, y: 17.5 });
  assert.equal(me(bia).area, "booth-1");
  again = await person(58, s);
  assert.ok(Math.hypot(me(again).x - sp.x, me(again).y - sp.y) < 1.5, `arrived at ${me(again).x},${me(again).y}`);
});

test("game room: a console moved to another TV (a media one too), or unplugged, leaves the old TV's input", async () => {
  const s = ++space;
  const a = await person(48, s, "member,builder");
  const st = () => a.room.state;
  const at = me(a);
  const base = { x: Math.floor(at?.x ?? 0), y: Math.floor(at?.y ?? 0) };
  const put = async (id: string, kind: string, x: number, y: number) => {
    const p = spotFor(a, kind, x, y, 6, () => true);
    assert.ok(p, `room for ${id}`);
    a.room.send("obj:put", { id, kind, x: p.x, y: p.y, yaw: 0 });
    await waitFor(() => !!st().objects.get(id));
    return p;
  };
  const tv1 = await put("m-tv1", "crt_tv", base.x - 2, base.y - 3);
  const con = await put("m-con", "console_nes", tv1.x + 1, tv1.y + 2);
  const tv2 = await put("m-tv2", "tv_console", con.x + 2, con.y); // a media TV: consoles too
  const props = (id: string) => JSON.parse(st().objects.get(id)?.props ?? "{}");
  const toasts = () => (a.msgs.toast ?? []).map((m) => (m as { text: string }).text);

  // the cable's plugged in at the TV: from across the room, no
  await walk(a, { x: tv1.x + 1, y: tv1.y + 8 });
  a.room.send("game:plug", { id: "m-con", tv: "m-tv1" });
  await waitFor(() => toasts().some((x) => /Get closer to the TV/.test(x)));
  assert.equal(props("m-con").tv, undefined);
  await walk(a, { x: tv1.x + 1, y: tv1.y + 1.5 });
  a.room.send("game:plug", { id: "m-con", tv: "m-tv1" });
  await waitFor(() => props("m-tv1").input === "m-con");
  // moved to the Console TV: the first one lets go of it, this one switches to it
  await walk(a, { x: tv2.x + 1, y: tv2.y + 1.5 });
  a.room.send("game:plug", { id: "m-con", tv: "m-tv2" });
  await waitFor(() => props("m-con").tv === "m-tv2" && props("m-tv2").input === "m-con");
  await waitFor(() => props("m-tv1").input === undefined);
  // …and back to its TV input (YouTube / Jellyfin), and to the console again
  a.room.send("game:input", { tv: "m-tv2", console: "media" });
  await waitFor(() => props("m-tv2").input === "media");
  a.room.send("game:input", { tv: "m-tv2", console: "m-con" });
  await waitFor(() => props("m-tv2").input === "m-con");
  // unplugged (at the console): so does the second
  await walk(a, { x: con.x + 0.5, y: con.y + 1.5 });
  a.room.send("game:plug", { id: "m-con", tv: null });
  await waitFor(() => props("m-con").tv === undefined && props("m-tv2").input === undefined);
  await a.room.leave(true);
});

test("game room: one game at a time per person — a second one pauses the first (anyone can carry it on)", async () => {
  const s = ++space;
  const a = await person(49, s, "member,builder");
  const b = await person(50, s);
  const st = () => a.room.state;
  const at = me(a);
  const base = { x: Math.floor(at?.x ?? 0), y: Math.floor(at?.y ?? 0) };
  const put = async (id: string, kind: string, x: number, y: number) => {
    const p = spotFor(a, kind, x, y, 6, () => true);
    assert.ok(p, `room for ${id}`);
    a.room.send("obj:put", { id, kind, x: p.x, y: p.y, yaw: 0 });
    await waitFor(() => !!st().objects.get(id));
    return p;
  };
  const tv1 = await put("g1-tv", "crt_tv", base.x - 2, base.y - 3);
  const c1 = await put("g1-con", "console_nes", tv1.x, tv1.y + 2);
  const c2 = await put("g2-con", "console_nes", tv1.x + 2, tv1.y + 2);
  const props = (id: string) => JSON.parse(st().objects.get(id)?.props ?? "{}");
  await walk(a, { x: tv1.x + 1, y: tv1.y + 1.5 });
  for (const id of ["g1-con", "g2-con"]) {
    a.room.send("game:plug", { id, tv: "g1-tv" });
    await waitFor(() => props(id).tv === "g1-tv");
    a.room.send("game:cart", { id, game: "b:testcard-nes" });
    await waitFor(() => props(id).cart === "b:testcard-nes");
  }
  await walk(a, { x: (c1.x + c2.x) / 2 + 0.5, y: c1.y + 1.5 });
  const c = (id: string) => st().consoles.get(id);
  a.room.send("game:power", { id: "g1-con", on: true });
  await waitFor(() => c("g1-con")?.host === a.room.sessionId);
  // the second: Ana runs it now; the first is paused (still on, nobody running it)
  a.room.send("game:power", { id: "g2-con", on: true });
  await waitFor(() => c("g2-con")?.host === a.room.sessionId);
  assert.equal(c("g1-con")?.host, "");
  assert.equal(c("g1-con")?.p1, "");
  await waitFor(() =>
    (a.msgs.toast ?? []).some((m) => /paused: you run one game at a time/.test((m as { text: string }).text)),
  );
  // Bia carries the first one on
  await walk(b, { x: c1.x + 0.5, y: c1.y + 1.5 });
  b.room.send("game:continue", { id: "g1-con" });
  await waitFor(() => c("g1-con")?.host === b.room.sessionId);
  assert.equal(c("g2-con")?.host, a.room.sessionId, "two games at once, one each");
  await a.room.leave(true);
  await b.room.leave(true);
});

test("game room: plug a console into a TV, a cartridge, power, pad 2 relayed, the TV's audience, carry on", async () => {
  const s = ++space;
  const a = await person(46, s, "member,builder");
  const b = await person(47, s);
  const st = () => b.room.state;
  const at = me(a);
  const base = { x: Math.floor(at?.x ?? 0), y: Math.floor(at?.y ?? 0) };
  // a TV and a console in front of it, near Ana (spots the rules allow)
  const tvSpot = spotFor(a, "crt_tv", base.x - 1, base.y - 3, 6, () => true);
  assert.ok(tvSpot, "room for a TV");
  a.room.send("obj:put", { id: "t-tv", kind: "crt_tv", x: tvSpot.x, y: tvSpot.y, yaw: 0 });
  await waitFor(() => !!st().objects.get("t-tv"));
  const conSpot = spotFor(a, "console_nes", tvSpot.x + 1, tvSpot.y + 2, 4, () => true);
  assert.ok(conSpot, "room for a console");
  a.room.send("obj:put", { id: "t-con", kind: "console_nes", x: conSpot.x, y: conSpot.y, yaw: 0 });
  await waitFor(() => !!st().objects.get("t-con"));
  const props = (id: string) => JSON.parse(st().objects.get(id)?.props ?? "{}");
  await walk(a, { x: conSpot.x + 0.5, y: conSpot.y + 1.5 });

  // can't turn on: not plugged in, no cartridge
  a.room.send("game:power", { id: "t-con", on: true });
  await waitFor(() => (a.msgs.toast ?? []).some((m) => /Plug it into a TV/.test((m as { text: string }).text)));
  a.room.send("game:plug", { id: "t-con", tv: "t-tv" });
  await waitFor(() => props("t-con").tv === "t-tv" && props("t-tv").input === "t-con");
  // a cartridge for another console doesn't fit; a built-in 8-bit one does
  a.room.send("game:cart", { id: "t-con", game: "b:ucity" });
  await waitFor(() => (a.msgs.toast ?? []).some((m) => /doesn't fit/.test((m as { text: string }).text)));
  a.room.send("game:cart", { id: "t-con", game: "b:testcard-nes" });
  await waitFor(() => props("t-con").cart === "b:testcard-nes" && !!props("t-con").cartColor);

  // on: Ana hosts, pad 1; the TV's token
  a.room.send("game:power", { id: "t-con", on: true });
  await waitFor(() => st().consoles.get("t-con")?.host === a.room.sessionId);
  const c = () => st().consoles.get("t-con");
  assert.equal(c()?.p1, a.room.sessionId);
  assert.equal(c()?.title, "Test Card");
  a.room.send("game:tv", { id: "t-con" });
  await waitFor(() => (a.msgs["game:tv"]?.length ?? 0) > 0);
  assert.equal((a.msgs["game:tv"][0] as { identity: string }).identity, "tv-t-con");
  // can't swap cartridges while it's on
  a.room.send("game:cart", { id: "t-con", game: null });
  await waitFor(() => (a.msgs.toast ?? []).some((m) => /Turn it off first/.test((m as { text: string }).text)));

  // Bia: far away she still sees the TV (video), and doesn't hear it
  await waitFor(() => (a.msgs["game:audience"] ?? []).length > 0);
  const aud = () => a.msgs["game:audience"].at(-1) as { video: string[]; audio: string[] };
  assert.ok(aud().video.includes("47"), "everyone sees the TV");
  // she walks up and takes pad 2: her buttons reach Ana
  await walk(b, { x: conSpot.x + 1.5, y: conSpot.y + 1.5 });
  await waitFor(() => aud().audio.includes("47"), 4000);
  b.room.send("game:port", { id: "t-con", port: 2 });
  await waitFor(() => c()?.p2 === b.room.sessionId);
  b.room.send("game:pad", { id: "t-con", bits: 0b10001 });
  await waitFor(() => (a.msgs["game:pad"] ?? []).length > 0);
  assert.deepEqual(a.msgs["game:pad"][0], { id: "t-con", port: 2, bits: 0b10001 });
  // Ana's own buttons don't go round through the server; bad bits are dropped
  b.room.send("game:pad", { id: "t-con", bits: 99999 });
  await sleep(200);
  assert.equal(a.msgs["game:pad"].length, 1);
  // the 16 buttons (L2 R2 L3 R3 too) and the sticks travel; sticks out of range are dropped
  b.room.send("game:pad", { id: "t-con", bits: 0xc000, sticks: [127, -127, 0, 5] });
  await waitFor(() => a.msgs["game:pad"].length === 2);
  assert.deepEqual(a.msgs["game:pad"][1], { id: "t-con", port: 2, bits: 0xc000, sticks: [127, -127, 0, 5] });
  for (const sticks of [[200, 0, 0, 0], [0, 0, 0], [0.5, 0, 0, 0], "x"])
    b.room.send("game:pad", { id: "t-con", bits: 1, sticks: sticks as never });
  await sleep(200);
  assert.equal(a.msgs["game:pad"].length, 2);
  // a pad's analog mode: who holds it says, everyone sees it (its LED)
  b.room.send("game:analog", { id: "t-con", on: true });
  await waitFor(() => c()?.a2 === true);
  assert.equal(c()?.a1, false);

  // Ana leaves: paused; Bia carries on as host
  await a.room.leave(true);
  await waitFor(() => c()?.host === "", 4000);
  b.room.send("game:continue", { id: "t-con" });
  await waitFor(() => c()?.host === b.room.sessionId && c()?.p1 === b.room.sessionId && c()?.p2 === "");
  b.room.send("game:power", { id: "t-con", on: false });
  await waitFor(() => !c());
});

test("your own booth: you arrive at your spot in it with someone talking in it, and right after a reload", async () => {
  const s = ++space;
  const owner = await person(58, s, "member,builder");
  const sam = await person(59, s);
  const gabe = await person(60, s);
  owner.room.send("map:new", { width: 32, height: 24 });
  await waitFor(() => home(owner).width === 32);
  const key = await makeRoom(owner, {
    name: "Sam's office",
    kind: "booth",
    x: 4,
    y: 4,
    w: 5,
    h: 4,
    ownerId: 59,
    ownerName: "P59",
  });
  const mine = (p: Person) =>
    (p.msgs["spawn:mine"] ?? []).at(-1) as { at: { x: number; y: number } | null } | undefined;
  await walk(sam, { x: 6.5, y: 5.5 });
  assert.equal(me(sam).area, key);
  sam.room.send("spawn:mine", { at: { x: me(sam).x, y: me(sam).y } });
  await waitFor(() => mine(sam)?.at != null);
  const spot = mine(sam)?.at as { x: number; y: number };
  // Gabe is let in and stays for a call; Sam steps out and comes back in: his own room
  sam.room.send("admit", { userId: 60, area: key });
  await waitFor(() => (gabe.msgs.admitted?.length ?? 0) > 0);
  await walk(gabe, { x: 5.5, y: 5.5 });
  assert.equal(me(gabe).area, key);
  await sam.room.leave(true);
  let again = await person(59, s);
  assert.ok(Math.hypot(me(again).x - spot.x, me(again).y - spot.y) < 0.01, "the owner arrives in his own booth");
  // a reload: the old session lingers (reconnection window) while the new one comes in
  again.room.connection.close();
  await sleep(100);
  again = await person(59, s);
  assert.ok(Math.hypot(me(again).x - spot.x, me(again).y - spot.y) < 0.01, "after a reload too");
  await waitFor(
    () => [...again.room.state.players.values()].filter((q: { uid: number }) => q.uid === 59).length === 1,
    25000,
  );
});

test("a computer: one person at a time, what its OS shows reaches everyone, standing up shuts it down", async () => {
  const s = ++space;
  const a = await person(61, s, "member,builder");
  const b = await person(62, s);
  const st = () => a.room.state;
  const at = me(a);
  const d = spotFor(a, "desk", Math.floor(at?.x ?? 0) - 2, Math.floor(at?.y ?? 0) - 3, 6, () => true);
  assert.ok(d, "room for a desk");
  a.room.send("obj:put", { id: "pc-desk", kind: "desk", x: d.x, y: d.y, yaw: 0 });
  await waitFor(() => !!st().objects.get("pc-desk"));
  a.room.send("obj:put", {
    id: "pc-1",
    kind: "computer",
    x: d.x,
    y: d.y,
    yaw: 0,
    props: { c: [1, 2], z: entry("desk").surface },
  });
  await waitFor(() => !!st().objects.get("pc-1"));
  const pc = () => st().computers.get("pc-1");
  const toasts = (p: Person) => (p.msgs.toast ?? []).map((m) => (m as { text: string }).text);

  // too far: nothing
  await walk(a, { x: d.x + 0.5, y: d.y + 6.5 });
  a.room.send("computer:use", { id: "pc-1" });
  await waitFor(() => toasts(a).some((t) => /closer/.test(t)));
  assert.equal(pc(), undefined);

  // at it: it's hers and boots
  await walk(a, { x: d.x + 0.5, y: d.y + 1.6 });
  a.room.send("computer:use", { id: "pc-1" });
  await waitFor(() => (a.msgs["computer:ok"] ?? []).length === 1);
  await waitFor(() => pc()?.sid === a.room.sessionId);
  assert.equal(pc()?.phase, "boot");

  // her OS says what it shows; labels are cleaned, unknown eras ignored
  a.room.send("computer:phase", { id: "pc-1", phase: "desktop", era: "win98", app: "Paint<script>", user: "ana" });
  await waitFor(() => pc()?.phase === "desktop");
  assert.equal(pc()?.era, "win98");
  assert.equal(pc()?.app, "Paintscript");
  assert.equal(pc()?.user, "ana");
  a.room.send("computer:phase", { id: "pc-1", phase: "saver", era: "amiga" });
  await waitFor(() => pc()?.phase === "saver");
  assert.equal(pc()?.era, "win98");
  a.room.send("computer:phase", { id: "pc-1", phase: "hacked" });
  await sleep(200);
  assert.equal(pc()?.phase, "saver");

  // Bia: can't take it, can't speak for it
  await walk(b, { x: d.x + 1.5, y: d.y + 1.6 });
  b.room.send("computer:use", { id: "pc-1" });
  await waitFor(() => toasts(b).some((t) => /using this computer/.test(t)));
  b.room.send("computer:phase", { id: "pc-1", phase: "login" });
  await sleep(200);
  assert.equal(pc()?.sid, a.room.sessionId);
  assert.equal(pc()?.phase, "saver");

  // Ana stands up: it shuts down (nothing changes it after), then it's off
  a.room.send("computer:leave", { id: "pc-1" });
  await waitFor(() => pc()?.phase === "shutdown");
  a.room.send("computer:phase", { id: "pc-1", phase: "desktop" });
  await sleep(200);
  assert.equal(pc()?.phase, "shutdown");
  await waitFor(() => !pc(), 6000);

  // now Bia can; walking off shuts it down (and tells her)
  b.room.send("computer:use", { id: "pc-1" });
  await waitFor(() => pc()?.sid === b.room.sessionId);
  await walk(b, { x: d.x + 0.5, y: d.y + 7.5 });
  await waitFor(() => pc()?.phase === "shutdown");
  await waitFor(() => (b.msgs["computer:off"] ?? []).length === 1);
  await waitFor(() => !pc(), 6000);

  // leaving the space, or the computer taken away, does too
  await walk(a, { x: d.x + 0.5, y: d.y + 1.6 });
  a.room.send("computer:use", { id: "pc-1" });
  await waitFor(() => pc()?.sid === a.room.sessionId);
  a.room.send("obj:remove", { id: "pc-1" });
  await waitFor(() => !pc());
  await a.room.leave(true);
  await b.room.leave(true);
});

test("pool: a seat near the table, Vortex in the other, a break, his turn by himself, out of turn ignored, leaving loses", async () => {
  const s = ++space;
  const a = await person(51, s, "member,builder");
  const b = await person(52, s);
  const at = me(a);
  const spot = spotFor(a, "pool_table", Math.floor(at?.x ?? 0) - 2, Math.floor(at?.y ?? 0) - 3, 5, () => true);
  assert.ok(spot, "room for a pool table");
  a.room.send("obj:put", { id: "t-pool", kind: "pool_table", x: spot.x, y: spot.y, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("t-pool"));
  const t = () => b.room.state.pool.get("t-pool");
  const near = (p: { x: number; y: number }) =>
    Math.hypot(p.x - Math.max(spot.x, Math.min(p.x, spot.x + 4)), p.y - Math.max(spot.y, Math.min(p.y, spot.y + 2)));
  if (near(me(a) ?? { x: 0, y: 0 }) > 2) await walk(a, { x: spot.x + 2, y: spot.y + 2.6 });
  a.room.send("pool:sit", { id: "t-pool", seat: 0 });
  await waitFor(() => t()?.seats.get("0")?.name === "P51");
  // two seats needed
  a.room.send("pool:start", { id: "t-pool" });
  await waitFor(() => (a.msgs.toast?.length ?? 0) > 0);
  assert.equal(t()?.phase, "lobby");
  a.room.send("pool:vortex", { id: "t-pool", level: "medium" });
  await waitFor(() => t()?.seats.get("1")?.vortex === "medium");
  a.room.send("pool:start", { id: "t-pool", clock: 30, guide: "long" });
  await waitFor(() => t()?.phase === "play");
  assert.equal(t()?.clock, 30);
  const game = () => JSON.parse(t()?.game ?? "{}");
  assert.equal(game().turn, 0, "the first game: seat 0 breaks");
  // someone not seated can't shoot
  b.room.send("pool:shot", { id: "t-pool", angle: 0, power: 1, spinX: 0, spinY: 0, called: -1 });
  await sleep(150);
  assert.equal(t()?.shotNo, 0);
  // the break
  a.room.send("pool:shot", { id: "t-pool", angle: 0, power: 1, spinX: 0, spinY: 0, called: -1 });
  await waitFor(() => t()?.shotNo === 1);
  assert.ok(game().broken);
  assert.ok(t()?.before && t()?.shot);
  // a second shot while the balls still roll: ignored
  a.room.send("pool:shot", { id: "t-pool", angle: 1, power: 0.2, spinX: 0, spinY: 0, called: -1 });
  await sleep(100);
  assert.equal(t()?.shotNo, 1);
  // when it's Vortex's turn he plays it himself
  if (game().turn === 1) {
    await waitFor(() => (t()?.shotNo ?? 0) >= 2, 20_000);
    const r = JSON.parse(t()?.shot ?? "{}");
    assert.equal(r.seat, 1);
  }
  // walking out mid-game: Vortex wins, the table remembers it
  a.room.send("pool:leave", { id: "t-pool" });
  await waitFor(() => t()?.phase === "done" || t()?.phase === "lobby");
  await waitFor(() => !!JSON.parse(a.room.state.objects.get("t-pool")?.props ?? "{}").record);
  const rec = JSON.parse(a.room.state.objects.get("t-pool")?.props ?? "{}").record;
  assert.equal(rec.last[0].w, "Vortex");
});

test("ping-pong: Ana serves to Vortex — her hit checked against her racket, he returns it, her miss is his point", async () => {
  const { ballAt, hitBall, flightEvents } = await import("@yutopia/shared/pong");
  const s = ++space;
  const a = await person(61, s, "member,builder");
  const b = await person(62, s);
  const at = me(a);
  const spot = spotFor(a, "pingpong_table", Math.floor(at?.x ?? 0) - 2, Math.floor(at?.y ?? 0) - 3, 6, () => true);
  assert.ok(spot, "room for a table");
  a.room.send("obj:put", { id: "t-pong", kind: "pingpong_table", x: spot.x, y: spot.y, yaw: 0 });
  await waitFor(() => !!a.room.state.objects.get("t-pong"));
  const t = () => b.room.state.pong.get("t-pong");
  const near = (p: { x: number; y: number }) =>
    Math.hypot(p.x - Math.max(spot.x, Math.min(p.x, spot.x + 4)), p.y - Math.max(spot.y, Math.min(p.y, spot.y + 2)));
  if (near(me(a) ?? { x: 0, y: 0 }) > 2) await walk(a, { x: spot.x - 0.8, y: spot.y + 1 });
  a.room.send("pong:sit", { id: "t-pong", seat: 0 });
  await waitFor(() => t()?.seats.get("0")?.name === "P61");
  a.room.send("pong:vortex", { id: "t-pong", level: "turbo" });
  await waitFor(() => t()?.seats.get("1")?.vortex === "turbo");
  a.room.send("pong:start", { id: "t-pong", to: 11, bestOf: 1 });
  await waitFor(() => t()?.phase === "play");
  const score = () => JSON.parse(t()?.score ?? "{}");
  assert.equal(score().server, 0, "Ana serves first");
  await sleep(700);
  // the toss
  a.room.send("pong:toss", { id: "t-pong", t: Date.now(), y: 0 });
  await waitFor(() => JSON.parse(t()?.flight || "{}").kind === "toss");
  const toss = JSON.parse(t()?.flight ?? "{}");
  // she meets it on the way down, ~0.36 s after the toss: report the racket there, then the hit
  const hitAt = toss.t0 + 420;
  const ball = ballAt(toss, hitAt).ball;
  const racket = { x: ball.x - 0.02, y: ball.y, z: ball.z, nx: 1, ny: 0, nz: 0.1, vx: 3.5, vy: 0, vz: 0.6 };
  while (Date.now() < hitAt) await sleep(10);
  // a racket far away first: refused
  a.room.send("pong:racket", { id: "t-pong", r: [ball.x, ball.y + 1.5, ball.z, 1, 0, 0, 0, 0, 0, hitAt] });
  const nb = hitBall(ball, racket, { side: 0, assist: 1, serve: true });
  a.room.send("pong:hit", {
    id: "t-pong",
    seq: t()?.seq,
    t: hitAt,
    b: [nb.x, nb.y, nb.z, nb.vx, nb.vy, nb.vz, nb.wx, nb.wy, nb.wz],
  });
  await sleep(150);
  assert.equal(JSON.parse(t()?.flight || "{}").kind, "toss", "a hit far from her racket isn't taken");
  // Bia can't hit Ana's toss
  b.room.send("pong:hit", {
    id: "t-pong",
    seq: t()?.seq,
    t: hitAt,
    b: [nb.x, nb.y, nb.z, nb.vx, nb.vy, nb.vz, nb.wx, nb.wy, nb.wz],
  });
  // now with her racket right there
  a.room.send("pong:racket", { id: "t-pong", r: [racket.x, racket.y, racket.z, 1, 0, 0.1, 3.5, 0, 0.6, hitAt] });
  a.room.send("pong:hit", {
    id: "t-pong",
    seq: t()?.seq,
    t: hitAt,
    b: [nb.x, nb.y, nb.z, nb.vx, nb.vy, nb.vz, nb.wx, nb.wy, nb.wz],
  });
  await waitFor(() => JSON.parse(t()?.flight || "{}").kind === "serve");
  const serve = JSON.parse(t()?.flight ?? "{}");
  const sides = flightEvents(serve)
    .filter((e) => e.k === "table")
    .map((e) => e.side);
  assert.deepEqual(sides.slice(0, 2), [0, 1], "the assisted serve: her side, then his");
  // Vortex (Turbo) plays it back
  await waitFor(() => JSON.parse(t()?.flight || "{}").by === 1, 4000);
  // and Ana doesn't: his point
  await waitFor(() => (t()?.pointNo ?? 0) >= 1, 6000);
  const pt = JSON.parse(t()?.point ?? "{}");
  assert.equal(pt.winner, 1);
  assert.deepEqual(score().points, [0, 1]);
  a.room.send("pong:concede", { id: "t-pong" });
  await waitFor(() => t()?.phase === "done");
});

test("the phone: calls ring across spaces, answer, the line, hang up; declined, busy, nobody there", async () => {
  const sa = ++space;
  const sb = ++space;
  const ana = await person(80, sa);
  const bia = await person(81, sb); // another space
  const caio = await person(82, sa);
  const me = (p: Person) => p.room.state.players.get(p.room.sessionId);
  const last = (p: Person, t: string) => p.msgs[t]?.at(-1) as Record<string, unknown> | undefined;
  // case and ringtone, seen on the body
  bia.room.send("phone:prefs", { case: "rust", ringtone: "bell" });
  bia.room.send("phone:prefs", { case: "nope", ringtone: "nope" });
  await waitFor(() => me(bia)?.phoneCase === "rust" && me(bia)?.tone === "bell");
  // out of the pocket: others see it; at the ear only on a call
  ana.room.send("phone:state", { state: "text" });
  await waitFor(() => caio.room.state.players.get(ana.room.sessionId)?.phone === "text");
  ana.room.send("phone:state", { state: "call" });
  ana.room.send("phone:state", { state: "bud" });
  await sleep(150);
  assert.equal(me(ana)?.phone, "text", "not on a call yet (nor on the earbud)");

  // Ana calls Bia (a different space): it rings there
  ana.room.send("call:start", { to: [81], video: false });
  await waitFor(() => (bia.msgs["call:ring"]?.length ?? 0) > 0);
  const id = (last(bia, "call:ring") as { id: string }).id;
  await waitFor(() => me(bia)?.ringing === true);
  await waitFor(() => last(ana, "call:update")?.phase === "ringing");
  // Bia answers: both get the line, both at the ear
  bia.room.send("call:answer", { id });
  await waitFor(() => (ana.msgs["call:join"]?.length ?? 0) > 0 && (bia.msgs["call:join"]?.length ?? 0) > 0);
  assert.equal((last(ana, "call:join") as { room: string }).room, `call-${id}`);
  await waitFor(() => me(bia)?.ringing === false && me(bia)?.phone === "call" && me(ana)?.phone === "call");
  assert.equal(last(ana, "call:update")?.phase, "live");
  // Caio calls Ana meanwhile: busy
  caio.room.send("call:start", { to: [80], video: false });
  await waitFor(() => last(caio, "call:update")?.end === "busy");
  // Ana puts the phone away: the earbud, everyone sees it
  ana.room.send("phone:state", { state: "bud" });
  await waitFor(() => caio.room.state.players.get(ana.room.sessionId)?.phone === "bud");
  // Bia hangs up: it's over for both, phones back in the pocket (the earbud out)
  bia.room.send("call:end", { id });
  await waitFor(() => last(ana, "call:update")?.phase === "ended" && last(ana, "call:update")?.end === "answered");
  await waitFor(() => me(ana)?.phone === "" && me(bia)?.phone === "");

  // Caio calls Ana, she declines
  caio.room.send("call:start", { to: [80], video: false });
  await waitFor(() => (ana.msgs["call:ring"]?.length ?? 0) > 0);
  ana.room.send("call:decline", { id: (last(ana, "call:ring") as { id: string }).id });
  await waitFor(() => last(caio, "call:update")?.end === "declined");
  await waitFor(() => me(ana)?.ringing === false);
  // nobody by that id in Yutopia
  caio.room.send("call:start", { to: [999], video: false });
  await waitFor(() => last(caio, "call:update")?.end === "unreachable");
  // a photo: the flash, rate-limited
  caio.room.send("phone:shot", {});
  await waitFor(() => (ana.room.state.players.get(caio.room.sessionId)?.shotAt ?? 0) > 0);
});

// Someone's line drops mid-call (a closed tab, the network): the others' call
// ends in seconds — not after the room's reconnection grace, and not never
// (after an earlier blip the room hands back a new client object).
test("the phone: a dropped line ends the call; a blip doesn't; a group call loses just that one", async () => {
  const { phoneHub } = await import("./features/phone.ts");
  const was = phoneHub.dropMs;
  phoneHub.dropMs = 800;
  try {
    const ana = await person(90, ++space);
    const bia = await person(91, ++space);
    const cai = await person(92, ++space);
    const dan = await person(93, ++space);
    const last = (p: Person) =>
      p.msgs["call:update"]?.at(-1) as
        | { phase: string; end?: string; members: { uid: number; state: string }[] }
        | undefined;
    const stateOf = (p: Person, uid: number) => last(p)?.members.find((m) => m.uid === uid)?.state;
    // the line comes back (the client's reconnect): same session, a new socket
    const back = async (p: Person) => {
      p.room = await new Client(`ws://localhost:${PORT}`).reconnect(p.room.reconnectionToken);
      rooms.push(p.room);
      p.msgs = {};
      for (const t of ["call:update", "call:join"])
        p.room.onMessage(t, (m) => {
          if (!p.msgs[t]) p.msgs[t] = [];
          p.msgs[t].push(m);
        });
    };
    const answer = async (p: Person) => {
      await waitFor(() => (p.msgs["call:ring"]?.length ?? 0) > 0);
      p.room.send("call:answer", { id: (p.msgs["call:ring"]?.at(-1) as { id: string }).id });
    };

    // Ana calls Bia
    ana.room.send("call:start", { to: [91], video: false });
    await answer(bia);
    await waitFor(() => last(ana)?.phase === "live" && me(bia)?.phone === "call");
    // a blip: Bia's line is back before the drop counts — still on the call
    bia.room.connection.close();
    await sleep(50);
    await back(bia);
    await sleep(phoneHub.dropMs + 400);
    assert.equal(last(ana)?.phase, "live", "a blip doesn't end the call");
    assert.equal(phoneHub.calls.size > 0, true);
    // then Bia closes the tab: over for Ana within a few seconds
    bia.room.connection.close();
    await waitFor(() => last(ana)?.phase === "ended" && last(ana)?.end === "answered", phoneHub.dropMs + 2000);
    await waitFor(() => me(ana)?.phone === "");

    // a group call: Ana, Cai and Dan
    ana.room.send("call:start", { to: [92, 93], video: false });
    await answer(cai);
    await answer(dan);
    await waitFor(() => stateOf(ana, 92) === "in" && stateOf(ana, 93) === "in");
    // Cai's line is gone longer than the drop allows: Cai is off the call (the others go on),
    // and hears it's over when the line comes back
    cai.room.connection.close();
    await waitFor(() => stateOf(ana, 92) === "left", phoneHub.dropMs + 2000);
    assert.equal(last(ana)?.phase, "live");
    assert.equal(stateOf(dan, 92), "left");
    await back(cai);
    await waitFor(() => last(cai)?.phase === "ended");
    // Dan drops too: Ana's alone on the line, so it ends
    dan.room.connection.close();
    await waitFor(() => last(ana)?.phase === "ended", phoneHub.dropMs + 2000);

    // Cai, back, takes Ana's call, then opens Yutopia in another tab: that tab isn't on it
    ana.room.send("call:start", { to: [92], video: false });
    cai.msgs["call:ring"] = [];
    cai.room.onMessage("call:ring", (m) => cai.msgs["call:ring"]?.push(m));
    await answer(cai);
    await waitFor(() => last(ana)?.phase === "live");
    await person(92, ++space);
    await waitFor(() => last(ana)?.phase === "ended" && last(ana)?.end === "answered");
  } finally {
    phoneHub.dropMs = was;
  }
});

// A call of three (docs/plan/37-the-gps.md § 1): everyone on it gets the line
// once — two answering at the same moment as well (a second line for the same
// person tore the first down halfway and cut them off), and one added mid-call.
test("the phone: a call of three — each on it gets the line exactly once", async (t) => {
  // (real tokens: minting one takes a while, which is when a second answer comes in)
  const { config } = await import("./config.ts");
  const was = { ...config.livekit };
  Object.assign(config.livekit, { key: "test-key", secret: "test-secret-test-secret-test-secret" });
  t.after(() => Object.assign(config.livekit, was));
  const ana = await person(94, ++space);
  const bia = await person(95, ++space);
  const cai = await person(96, ++space);
  const dan = await person(97, ++space);
  const joins = (p: Person) => (p.msgs["call:join"] ?? []) as { room: string }[];
  const lastUp = (p: Person) =>
    p.msgs["call:update"]?.at(-1) as { phase: string; members: { uid: number; state: string }[] } | undefined;
  const ins = (p: Person) => lastUp(p)?.members.filter((m) => m.state === "in").length ?? 0;
  const ringId = async (p: Person) => {
    await waitFor(() => (p.msgs["call:ring"]?.length ?? 0) > 0);
    return (p.msgs["call:ring"]?.at(-1) as { id: string }).id;
  };

  // Ana calls Bia and Cai; both answer at once
  ana.room.send("call:start", { to: [95, 96], video: false });
  const id = await ringId(bia);
  await ringId(cai);
  bia.room.send("call:answer", { id });
  cai.room.send("call:answer", { id });
  await waitFor(() => ins(ana) === 3 && ins(bia) === 3 && ins(cai) === 3);
  await sleep(300);
  for (const p of [ana, bia, cai]) {
    assert.equal(joins(p).length, 1, "one line each");
    assert.equal(joins(p)[0]?.room, `call-${id}`);
  }

  // Bia adds Dan: Dan gets the line, nobody already on gets another
  bia.room.send("call:add", { id, uid: 97 });
  dan.room.send("call:answer", { id: await ringId(dan) });
  await waitFor(() => ins(ana) === 4 && ins(dan) === 4);
  await sleep(300);
  assert.equal(joins(dan).length, 1);
  assert.equal(joins(dan)[0]?.room, `call-${id}`);
  for (const p of [ana, bia, cai]) assert.equal(joins(p).length, 1, "no second line for the ones already on");

  // Ana hangs up: the other three go on
  ana.room.send("call:end", { id });
  await waitFor(() => ins(bia) === 3);
  assert.equal(lastUp(bia)?.phase, "live");
  for (const p of [bia, cai, dan]) p.room.send("call:end", { id });
  await waitFor(() => lastUp(ana)?.phase === "ended" || lastUp(bia)?.phase === "ended");
});

// The GPS's friends (docs/plan/37-the-gps.md § 6): someone sharing is seen by
// the people in their phone book only — where they are on the Grounds' coords —
// and by nobody while in focus mode or once they stop sharing.
test("the GPS: a contact sharing shows on my map; nobody else does, nor in focus mode, nor once it's off", async (t) => {
  const { gpsHub } = await import("./features/gps.ts");
  const was = gpsHub.contactsOf;
  gpsHub.contactsOf = async (uid) => (uid === 120 ? [121] : []); // Ana's phone book: Bia
  t.after(() => {
    gpsHub.contactsOf = was;
  });
  const s = ++space;
  const ana = await person(120, s);
  const bia = await person(121, s);
  const cai = await person(122, s);
  type F = { friends: { uid: number; x: number; z: number; where: string }[] };
  const ask = async (p: Person) => {
    const n = p.msgs["gps:friends"]?.length ?? 0;
    await sleep(450); // (one ask in ASK_MS)
    p.room.send("gps:friends", {});
    await waitFor(() => (p.msgs["gps:friends"]?.length ?? 0) > n);
    return (p.msgs["gps:friends"]?.at(-1) as F).friends;
  };
  // not sharing: nothing
  assert.deepEqual(await ask(bia), []);
  ana.room.send("gps:share", { on: true });
  await waitFor(() => gpsHub.sharing.has(120));
  // Bia (in Ana's book) sees her, on the Grounds' coords
  const seen = await ask(bia);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].uid, 120);
  assert.ok(Number.isFinite(seen[0].x) && Number.isFinite(seen[0].z));
  assert.ok(typeof seen[0].where === "string" && seen[0].where.length > 0);
  // Cai isn't in her book: nothing; Ana herself: nothing of her own
  assert.deepEqual(await ask(cai), []);
  assert.deepEqual(await ask(ana), []);
  // focus mode: nobody sees her
  ana.room.send("status", { status: "dnd" });
  await waitFor(() => ana.room.state.players.get(ana.room.sessionId)?.status === "dnd");
  assert.deepEqual(await ask(bia), []);
  ana.room.send("status", { status: "online" });
  await waitFor(() => ana.room.state.players.get(ana.room.sessionId)?.status === "online");
  assert.equal((await ask(bia)).length, 1);
  // off: gone
  ana.room.send("gps:share", { on: false });
  await waitFor(() => !gpsHub.sharing.has(120));
  assert.deepEqual(await ask(bia), []);
});

// The API's live phone events (apps/api Push) reach the person through the world.
test("phone pushes from the API: signed, delivered to that person only", async () => {
  // (imported here: a static import would read the config before YUTOPIA_OFFLINE is set)
  const { signInternal } = await import("./api.ts");
  const s = ++space;
  const ana = await person(41, s);
  const bia = await person(42, s);
  const push = (body: unknown, opts: { ts?: string; path?: string; sig?: string } = {}) => {
    const raw = JSON.stringify(body);
    const ts = opts.ts ?? Math.floor(Date.now() / 1000).toString();
    const sig = opts.sig ?? signInternal(ts, "POST", opts.path ?? "/internal/push", raw);
    return fetch(`http://localhost:${PORT}/internal/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Yutopia-Timestamp": ts, "X-Yutopia-Signature": sig },
      body: raw,
    });
  };
  const event = { type: "message", message: { id: 7, body: "hi" } };
  const ok = await push({
    events: [
      { uid: 41, event },
      { uid: 999, event },
      { uid: "x", event },
    ],
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, delivered: 1 });
  await waitFor(() => (ana.msgs["phone:live"]?.length ?? 0) === 1);
  assert.deepEqual(ana.msgs["phone:live"]?.[0], { event });
  await sleep(100);
  assert.equal(bia.msgs["phone:live"]?.length ?? 0, 0, "not to anyone else");

  // unsigned, a signature for another path, an old one, not JSON-shaped
  assert.equal((await push({ events: [] }, { sig: "0".repeat(64) })).status, 401);
  assert.equal((await push({ events: [] }, { path: "/internal/other" })).status, 401);
  assert.equal((await push({ events: [] }, { ts: String(Math.floor(Date.now() / 1000) - 400) })).status, 401);
  assert.equal((await push({ nope: true })).status, 422);
  assert.equal((await fetch(`http://localhost:${PORT}/internal/push`)).status, 405);
});

test("one world, with a cap: past it a join is refused, a second tab still takes its own place", async () => {
  const { WorldRoom } = await import("./WorldRoom.ts");
  const was = WorldRoom.CAPACITY;
  WorldRoom.CAPACITY = 2;
  try {
    const s = ++space;
    const a = await person(51, s);
    const b = await person(52, s);
    assert.equal(a.room.roomId, b.room.roomId);
    await assert.rejects(() => person(53, s), /full/);
    const again = await person(52, s); // Bia's new tab: allowed, the old one goes
    assert.equal(again.room.roomId, a.room.roomId);
    await waitFor(() => (b.msgs.kicked?.length ?? 0) > 0);
  } finally {
    WorldRoom.CAPACITY = was;
  }
});

// The API replacing the world's data (apps/api WorldSnapshot): the room closes and
// stays shut until it's let go, then opens from the new data on the next join.
test("hold: the API closes the world, nobody gets in, then it opens again", async () => {
  const { signInternal } = await import("./api.ts");
  const hold = (on: boolean) => {
    const raw = JSON.stringify({ hold: on });
    const ts = Math.floor(Date.now() / 1000).toString();
    return fetch(`http://localhost:${PORT}/internal/hold`, {
      method: "POST",
      headers: { "X-Yutopia-Timestamp": ts, "X-Yutopia-Signature": signInternal(ts, "POST", "/internal/hold", raw) },
      body: raw,
    });
  };
  const s = ++space;
  const a = await person(61, s);
  const first = a.room.roomId;
  const res = await hold(true);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, held: true, closed: true });
  await waitFor(() => a.room.connection.isOpen === false);
  await assert.rejects(() => person(62, ++space), /being reset/);
  assert.equal((await (await hold(false)).json()).held, false);
  const b = await person(63, s);
  assert.notEqual(b.room.roomId, first, "a fresh room");
  // unsigned: no
  const bad = await fetch(`http://localhost:${PORT}/internal/hold`, { method: "POST", body: '{"hold":true}' });
  assert.equal(bad.status, 401);
});

// ── the building (docs/plan/25-building-floors.md) ──────────────────────────
// The world is the top of five floors: the lobby and the lot on the ground
// floor (its corner at -60, -10), the core at x 6–14, y 30–36. Every floor's places are the
// world's (plan 72's one frame): G is a spot as the studio's coords give it.
const G = (x: number, y: number) => ({ x, y });
const stepTo = async (p: Person, path: { x: number; y: number; z: number; l: number }[]) => {
  let seq = 0;
  // (at a jog's pace: the server allows no more than a sprint's, docs/plan/29-the-move.md M7)
  let at = { x: me(p).x, y: me(p).y };
  for (const s of path) {
    await sleep(Math.max(55, (Math.hypot(s.x - at.x, s.y - at.y) / 4.5) * 1000));
    // (the move's height the world's: over its floor + the floor's)
    p.room.send("pos", { ...s, z: s.z + s.l * STOREY, yaw: 32, a: 1, seq: ++seq });
    at = s;
  }
  await sleep(150);
};

test("the building: you arrive on the studio's floor, five floors up", async () => {
  const s = ++space;
  const a = await person(80, s);
  assert.equal(home(a).floor, 4);
  assert.deepEqual(
    (home(a).levels ?? []).map((l: { index: number }) => l.index),
    [0, 1, 2, 3],
  );
  assert.equal(me(a).level, 4);
});

test("elevators: call one, step in, ride it to the lot's floor — the doors open where it is", async () => {
  const s = ++space;
  const a = await person(81, s, "member,builder");
  // from the arrival point, up to the doors of car A (x 8–10)
  await stepTo(a, [
    { x: 6.8, y: 28.2, z: 0, l: 4 },
    { x: 7.2, y: 27.8, z: 0, l: 4 },
    { x: 8.0, y: 28.2, z: 0, l: 4 },
    { x: 8.8, y: 28.5, z: 0, l: 4 },
  ]);
  assert.ok(Math.abs(me(a).x - 8.8) < 0.2, "at the doors");
  const stop = (level: number) =>
    [...a.room.state.objects.values()].find(
      (o: { kind: string; props: string }) =>
        o.kind === "elevator" && JSON.parse(o.props).shaft === "A" && JSON.parse(o.props).level === level,
    ) as { id: string; props: string };
  const door = (level: number) => JSON.parse(stop(level).props).door;
  assert.equal(door(4), "closed", "shut until it's called");
  a.room.send("lift:call", { id: stop(4).id });
  await waitFor(() => door(4) === "open", 5000);
  // in (the doors are a way in now), and down to the ground floor
  await stepTo(a, [
    { x: 8.9, y: 29, z: 0, l: 4 },
    { x: 9, y: 29.6, z: 0, l: 4 },
    { x: 9, y: 30, z: 0, l: 4 },
  ]);
  assert.ok(me(a).y > 29.5, "in the car");
  a.room.send("lift:go", { id: stop(4).id, level: 0 });
  await waitFor(() => me(a).level === 0, 12000);
  const g = G(9, 30);
  assert.ok(Math.hypot(me(a).x - g.x, me(a).y - g.y) < 0.6, "at the same spot of the car, a floor down");
  await waitFor(() => door(0) === "open", 3000);
  assert.equal(door(4), "closed", "and shut up there");
});

test("elevators: two ride; the doors wait for whoever's in the car or the doorway; nobody is shut in", async () => {
  const s = ++space;
  const a = await person(85, s, "member,builder");
  const b = await person(86, s, "member,builder");
  for (const [p, x] of [
    [a, 8.6],
    [b, 9.4],
  ] as const)
    await stepTo(p, [
      { x: 6.8, y: 28.2, z: 0, l: 4 },
      { x: 7.2, y: 27.8, z: 0, l: 4 },
      { x: 7.9, y: 28, z: 0, l: 4 },
      { x: (7.9 + x) / 2, y: 28.1, z: 0, l: 4 },
      { x, y: 28.2, z: 0, l: 4 },
      { x, y: 28.5, z: 0, l: 4 },
    ]);
  const stop = (level: number) =>
    [...a.room.state.objects.values()].find(
      (o: { kind: string; props: string }) =>
        o.kind === "elevator" && JSON.parse(o.props).shaft === "A" && JSON.parse(o.props).level === level,
    ) as { id: string; props: string };
  const door = (level: number) => JSON.parse(stop(level).props).door;
  assert.ok(Math.abs(me(b).x - 9.4) < 0.2, "b at the doors (nothing standing in front of them)");
  a.room.send("lift:call", { id: stop(4).id });
  await waitFor(() => door(4) === "open", 5000);
  for (const [p, x] of [
    [a, 8.6],
    [b, 9.4],
  ] as const)
    await stepTo(p, [
      { x, y: 29, z: 0, l: 4 },
      { x, y: 29.6, z: 0, l: 4 },
      { x, y: 30, z: 0, l: 4 },
    ]);
  assert.ok(me(a).y > 29.5 && me(b).y > 29.5, "both in the car");
  // well past the doors' own time: nobody's picked a floor, so they don't shut on them
  await sleep(8500);
  assert.equal(door(4), "open", "held open for the people in it");
  // b steps out; a rides down alone
  await stepTo(b, [
    { x: 9.4, y: 29.4, z: 0, l: 4 },
    { x: 9.4, y: 28.8, z: 0, l: 4 },
    { x: 9.4, y: 28.3, z: 0, l: 4 },
  ]);
  assert.ok(me(b).y < 28.6, "b walked out");
  a.room.send("lift:go", { id: stop(4).id, level: 0 });
  await waitFor(() => me(a).level === 0, 12000);
  assert.equal(me(b).level, 4, "b stayed");
  await waitFor(() => door(0) === "open", 3000);
  await sleep(8500);
  assert.equal(door(0), "open", "open till they walk out");
  const out = G(8.6, 28.3);
  await stepTo(a, [
    { ...G(8.6, 29.4), z: 0, l: 0 },
    { ...G(8.6, 28.8), z: 0, l: 0 },
    { ...out, z: 0, l: 0 },
  ]);
  assert.ok(Math.abs(me(a).y - out.y) < 0.2, "a walked out on the ground floor");
  // (up on the studio's floor the car's gone: its shut doors hold in the browser, on Jolt — the
  // server puts nobody back, the user's call 2026-10-28)
});

test("stairs: walked up a floor (the server follows the treads)", async () => {
  const s = ++space;
  const a = await person(82, s, "member,builder");
  const foot = G(13, 30.5);
  a.room.send("teleport", { to: { ...foot, level: 0 } });
  await waitFor(() => me(a).level === 0 && Math.abs(me(a).x - foot.x) < 0.3);
  // up flight A (east half, away from the door), the landing, flight B, onto floor 1
  const path: { x: number; y: number; z: number; l: number }[] = [];
  for (let v = 0.6; v <= 4.2; v += 0.2) {
    const h = Math.max(0, Math.min(1.75, ((v - 1) / 3) * 1.75));
    path.push({ ...G(13, 30 + v), z: h, l: 0 });
  }
  for (let u = 13; u >= 11; u -= 0.25) path.push({ ...G(u, 34.6), z: 1.75, l: 0 });
  for (let v = 4.2; v >= 1.1; v -= 0.2) {
    const h = Math.min(3.5, 1.75 + ((4 - Math.min(4, v)) / 3) * 1.75);
    if (h > 2.9) {
      path.push({ x: 11, y: 30 + v, z: h - 3.5, l: 1 });
    } else path.push({ ...G(11, 30 + v), z: h, l: 0 });
  }
  path.push({ x: 11, y: 30.6, z: 0, l: 1 });
  await stepTo(a, path);
  assert.equal(me(a).level, 1, "on floor 1");
  assert.ok(Math.abs(me(a).y - 30.6) < 0.3);
  assert.ok(Math.abs(me(a).z - STOREY) < 0.15, "on floor 1's floor");
});

test("stairs: the last treads and the step onto the landing in one message (a long frame) — not put back", async () => {
  const s = ++space;
  const a = await person(240, s, "member,builder");
  // the stairwell (x 10–14, y 29–36: the landing y 29–31, flight B up from y 34 to 31 at x 10–12)
  const foot = G(13, 30.5);
  a.room.send("teleport", { to: { ...foot, level: 0 } });
  await waitFor(() => me(a).level === 0 && Math.abs(me(a).x - foot.x) < 0.3);
  await sleep(1100); // (the teleport's snap: what was on its way is let go a second)
  const path: { x: number; y: number; z: number; l: number }[] = [];
  for (let y = 30.6; y <= 34.4; y += 0.2) path.push({ ...G(13, y), z: Math.max(0, ((y - 31) / 3) * 1.75), l: 0 });
  for (let x = 13; x >= 11; x -= 0.25) path.push({ ...G(x, 34.6), z: 1.75, l: 0 });
  for (let y = 34.2; y >= 32.2; y -= 0.2) {
    const h = 1.75 + ((34 - Math.min(34, y)) / 3) * 1.75;
    path.push(h > 2.9 ? { x: 11, y, z: h - 3.5, l: 1 } : { ...G(11, y), z: h, l: 0 });
  }
  // up the treads to half a step below floor 1 (y 31.9, its frame), then a tile on: off them
  // onto the landing in the same message
  path.push({ x: 11, y: 31.9, z: -0.53, l: 1 });
  await stepTo(a, path);
  await sleep(300); // (a walk's pace)
  a.room.send("pos", { x: 11, y: 30.9, z: STOREY, l: 1, yaw: 32, a: 1, seq: path.length + 1 });
  await sleep(150);
  assert.equal(me(a).level, 1, "on floor 1");
  assert.ok(Math.abs(me(a).y - 30.9) < 0.05, `on the landing (at ${me(a).y.toFixed(2)})`);
  assert.equal(me(a).z, STOREY);
});

test("teleport to someone on another floor lands you on theirs; other floors don't hear you", async () => {
  const s = ++space;
  const a = await person(83, s, "member,builder");
  const b = await person(84, s, "member,builder");
  // b goes down to the lobby; a stands right over them on the studio's floor
  b.room.send("teleport", { to: { ...G(12, 18), level: 0 } });
  await waitFor(() => me(b).level === 0);
  a.room.send("teleport", { to: { x: 12, y: 18, level: 4 } });
  await waitFor(() => Math.abs(me(a).x - 12) < 0.6 && Math.abs(me(a).y - 18) < 0.6);
  await sleep(600);
  assert.ok(!a.hear.ids.includes(b.room.sessionId), "a floor between them (four, here)");
  a.room.send("teleport", { to: { userId: 84 } });
  await waitFor(() => me(a).level === 0);
  await waitFor(() => a.hear.ids.includes(b.room.sessionId), 3000);
});

test("floors: a blank one on top, and taken away again (never the studio's)", async () => {
  const s = ++space;
  const a = await person(85, s, "member,builder");
  const floors = () => [a.room.state.floor, ...(home(a).levels ?? []).map((l: { index: number }) => l.index)];
  a.room.send("level:remove", { level: 4 });
  await sleep(300);
  assert.equal(floors().length, 5, "the studio stays");
  a.room.send("level:add", {});
  await waitFor(() => floors().includes(5));
  // (a thing on the studio's floor, the home one, doesn't say its level)
  const things = (level: number, kind: string) =>
    [...a.room.state.objects.values()].filter(
      (o: { kind: string; props: string }) => o.kind === kind && (JSON.parse(o.props).level ?? 4) === level,
    ).length;
  await waitFor(() => things(5, "elevator") === 2);
  assert.equal(things(4, "stairs"), 1, "stairs up to it from the studio");
  a.room.send("level:remove", { level: 5 });
  await waitFor(() => !floors().includes(5));
  await waitFor(() => things(4, "stairs") === 0 && things(5, "elevator") === 0);
});
