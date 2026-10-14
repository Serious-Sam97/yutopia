import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { areaAt, canPlace, dressItems, findPath, Grid, getMap, ROOM_NAME, studio, takenId } from "@yutopia/shared";
import { newCar, SLOT_GRIP, SLOT_LAP, SLOT_VMAX, slotCurve, stepCar } from "@yutopia/shared/slotcar";
import { Client, type Room } from "colyseus.js";

process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26670 + Math.floor(Math.random() * 100);
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
}

async function person(id: number, spaceId: number, roles = "member"): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    spaceId,
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
    "chat",
    "kicked",
    "vortex:say",
    "wb:scene",
    "wb:op",
    "arcade:scores",
    "build:history",
    "chat:react",
    "piano:note",
    "game:tv",
    "game:pad",
    "game:audience",
    "spawn:mine",
  ])
    room.onMessage(t, (m) => {
      if (!p.msgs[t]) p.msgs[t] = [];
      p.msgs[t].push(m);
      if (t === "hear") p.hear = m as Person["hear"];
    });
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
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
// the live map from room state, seen with this person's door permissions
function liveGrid(p: Person) {
  const { map, objects } = liveWorld(p);
  return Grid.from(map, objects, { uid: p.room.state.players.get(p.room.sessionId).uid });
}
function liveWorld(p: Person) {
  const st = p.room.state;
  const map = {
    ...studio,
    width: st.width,
    height: st.height,
    tiles: [...st.tiles],
    hWalls: [...st.hWalls],
    vWalls: [...st.vWalls],
    areas: JSON.parse(st.areas),
    spawn: { x: st.spawnX, y: st.spawnY },
  };
  const objects = [...st.objects.values()].map(
    (o: { id: string; kind: string; x: number; y: number; rot: number; props: string }) => ({
      id: o.id,
      kind: o.kind,
      x: o.x,
      y: o.y,
      rot: o.rot,
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
    if (ok(sx, sy) && canPlace(map, objects, { id: "probe", kind, x: sx, y: sy, rot: 0 }, bodies))
      return { x: sx, y: sy };
  return null;
}
async function walk(p: Person, to: { x: number; y: number }) {
  const me = p.room.state.players.get(p.room.sessionId);
  let x = me.x;
  let y = me.y;
  const path = findPath(liveGrid(p), { x, y }, to) ?? [];
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
      p.room.send("pos", { x, y, d: 0, a: 1, seq: ++seq });
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
  // guest follows to the door and tries to walk in
  await walk(guest, { x: 31.5, y: 16.5 });
  assert.notEqual(me(guest).area, "booth-1", "can't walk in uninvited");
  await waitFor(() => (host.msgs.knock?.length ?? 0) > 0);
  assert.ok(guest.msgs.snap?.length, "guest was snapped back at the door");
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
  member.room.send("obj:put", { id: plant, kind: "plant", x: 10, y: 3, rot: 0 });
  await sleep(200);
  assert.equal(member.room.state.objects.get(plant).x, before.x);
  builder.room.send("obj:put", { id: "b-desk", kind: "desk", x: 28, y: 9, rot: 0 }); // across a wall
  await waitFor(() => (builder.msgs.toast?.length ?? 0) > 0);
  assert.ok(!member.room.state.objects.get("b-desk"));
  builder.room.send("obj:put", { id: plant, kind: "plant", x: 10, y: 3, rot: 0 });
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

test("poker: only people at the table can put a card on it", async () => {
  const s = ++space;
  const outside = await person(16, s);
  outside.room.send("poker:open", { cardId: 5, boardId: 2, title: "Nope" });
  await sleep(200);
  assert.equal(outside.room.state.poker.open, false);
  await walk(outside, { x: 36.5, y: 3.5 });
  outside.room.send("poker:open", { cardId: 5, boardId: 2, title: "Card" });
  await waitFor(() => outside.room.state.poker.open === true);
  assert.equal(outside.room.state.poker.cardId, 5);
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
  a.room.send("obj:put", { id: "t-piano", kind: "piano", x: px, y: py, rot: 0 });
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

test("moderation: owners mute, lock rooms and remove people; members can't", async () => {
  const s = ++space;
  const owner = await person(25, s, "member,builder");
  const guest = await person(26, s);
  guest.room.send("mod:mute", { userId: 25, muted: true });
  await sleep(200);
  assert.equal(me(owner).muted, false, "members can't mute");
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
  await walk(guest, { x: 36.5, y: 8.5 });
  assert.notEqual(me(guest).area, "war-room");
  await waitFor(() => (owner.msgs.knock?.length ?? 0) > 0);

  // remove: kicked now and can't come straight back
  owner.room.send("mod:kick", { userId: 26 });
  await waitFor(() => (guest.msgs.kicked?.length ?? 0) > 0);
  await assert.rejects(() => person(26, s));
});

test("map editing: builders paint floors and walls on edges, nobody gets walled in, members can't", async () => {
  const s = ++space;
  const member = await person(27, s);
  const owner = await person(28, s, "member,builder");
  const tiles = () => [...member.room.state.tiles] as string[];
  const hw = () => [...member.room.state.hWalls] as string[];
  const vw = () => [...member.room.state.vWalls] as string[];
  member.room.send("map:walls", { edges: [{ x: 10, y: 3, dir: "h", ch: "p" }] });
  member.room.send("map:paint", { cells: [{ x: 11, y: 3, ch: "," }] });
  await sleep(250);
  assert.equal(hw()[3][10], ".", "members can't build walls");
  assert.equal(tiles()[3][11], ".", "…or paint floors");
  owner.room.send("map:paint", { cells: [{ x: 11, y: 3, ch: "," }] });
  owner.room.send("map:walls", {
    edges: [
      { x: 10, y: 3, dir: "h", ch: "b" },
      { x: 4, y: 6, dir: "v", ch: "p" }, // through a desk
    ],
  });
  await waitFor(() => hw()[3][10] === "b" && tiles()[3][11] === ",");
  assert.equal(vw()[6][4], ".", "not through the desk");
  await waitFor(() => (owner.msgs.toast?.length ?? 0) > 0);
  // a wall built right through someone moves them aside
  await walk(member, { x: 10.5, y: 6.2 });
  assert.ok(Math.abs(me(member).y - 6.2) < 0.05, "standing just past the y = 6 line");
  const snaps = member.msgs.snap?.length ?? 0;
  owner.room.send("map:walls", { edges: [{ x: 10, y: 6, dir: "h", ch: "p" }] });
  await waitFor(() => (member.msgs.snap?.length ?? 0) > snaps);
  await waitFor(() => Math.abs(me(member).y - 6) >= 0.32); // off the wall
});

test("chat reactions: only people who got the message react, and they all see the count", async () => {
  const s = ++space;
  const ana = await person(50, s);
  const bia = await person(51, s);
  ana.room.send("chat", { text: "standup in 5", scope: "space" });
  await waitFor(() => (bia.msgs.chat?.length ?? 0) > 0);
  const id = (bia.msgs.chat?.[0] as { id: string }).id;
  const late = await person(52, s); // joined after: never got it
  late.room.send("chat:react", { id, e: "heart" });
  bia.room.send("chat:react", { id, e: "heart" });
  await waitFor(() => (ana.msgs["chat:react"]?.length ?? 0) > 0);
  const last = (p: Person) => p.msgs["chat:react"]?.at(-1) as { id: string; reactions: Record<string, number[]> };
  assert.deepEqual(last(ana).reactions, { heart: [51] });
  assert.equal(late.msgs["chat:react"], undefined, "not in the audience");
  bia.room.send("chat:react", { id, e: "heart" }); // toggles off
  await waitFor(() => ana.msgs["chat:react"]?.length === 2);
  assert.deepEqual(last(ana).reactions, {});
});

test("build undo/redo: per person, a drag is one step, others' later edits are kept", async () => {
  const s = ++space;
  const ana = await person(40, s, "member,builder");
  const bia = await person(41, s, "member,builder");
  const tiles = () => [...ana.room.state.tiles] as string[];
  const orig = tiles()[3][10];
  const hist = (p: Person) => p.msgs["build:history"]?.at(-1) as { undo: number; redo: number } | undefined;
  // a drag arrives as several batches: one step
  ana.room.send("map:paint", { cells: [{ x: 10, y: 3, ch: "," }] });
  await sleep(100);
  ana.room.send("map:paint", { cells: [{ x: 11, y: 3, ch: "," }] });
  ana.room.send("obj:put", { id: "u-plant", kind: "plant", x: 12, y: 3, rot: 0 });
  await waitFor(() => hist(ana)?.undo === 1, 4000);
  // Bia repaints one of Ana's tiles
  bia.room.send("map:paint", { cells: [{ x: 11, y: 3, ch: "_" }] });
  await waitFor(() => hist(bia)?.undo === 1, 4000);
  assert.equal(hist(ana)?.undo, 1, "Bia's edit isn't on Ana's stack");
  ana.room.send("build:undo", {});
  await waitFor(() => tiles()[3][10] === orig);
  assert.equal(tiles()[3][11], "_", "Bia's tile stays");
  assert.equal(ana.room.state.objects.get("u-plant"), undefined, "the plant is gone");
  await waitFor(() => hist(ana)?.redo === 1 && hist(ana)?.undo === 0);
  ana.room.send("build:redo", {});
  await waitFor(() => tiles()[3][10] === "," && !!ana.room.state.objects.get("u-plant"));
  // members can't undo anything
  const member = await person(42, s);
  member.room.send("build:undo", {});
  await sleep(200);
  assert.equal(tiles()[3][10], ",");
});

test("rooms + doors: an owned room with walls, locked so only its owner gets in or out", async () => {
  const s = ++space;
  const owner = await person(29, s, "member,builder"); // project owner = builder
  const ana = await person(30, s); // room owner
  const bia = await person(31, s);
  owner.room.send("map:new", { width: 32, height: 24 });
  await waitFor(() => owner.room.state.width === 32);
  owner.room.send("map:room", {
    name: "Ana's office",
    kind: "private",
    x: 4,
    y: 4,
    w: 5,
    h: 4,
    ownerId: 30,
    ownerName: "P30",
    walls: true,
    floor: ",",
  });
  await waitFor(() => !!owner.room.state.objects.get("door-room-ana-s-office"));
  const areas = JSON.parse(owner.room.state.areas);
  assert.equal(areas.find((a: { key: string }) => a.key === "room-ana-s-office").ownerId, 30);
  // bia can open/close but not lock
  await walk(bia, { x: 6.5, y: 10.5 });
  bia.room.send("door:set", { id: "door-room-ana-s-office", state: "locked" });
  await waitFor(() => (bia.msgs.toast?.length ?? 0) > 0);
  assert.equal(JSON.parse(owner.room.state.objects.get("door-room-ana-s-office").props).state, "open");
  // ana walks in and locks it
  await walk(ana, { x: 6.5, y: 5.5 });
  ana.room.send("door:set", { id: "door-room-ana-s-office", state: "locked" });
  await waitFor(() => JSON.parse(ana.room.state.objects.get("door-room-ana-s-office").props).state === "locked");
  await sleep(200);
  // bia can't walk in, can't teleport to ana
  await walk(bia, { x: 6.5, y: 5.5 });
  assert.ok(me(bia).y > 8, "bia stays outside");
  // a tampered client pushing raw moves into the doorway gets snapped back
  await walk(bia, { x: 6.5, y: 9.5 });
  const snaps = bia.msgs.snap?.length ?? 0;
  // (the door is a thin edge at y = 8: push well across it)
  for (let i = 1; i <= 9; i++) {
    bia.room.send("pos", { x: 6.5, y: 9.5 - i * 0.2, d: 4, a: 1, seq: 9000 + i });
    await sleep(55);
  }
  await waitFor(() => (bia.msgs.snap?.length ?? 0) > snaps);
  assert.ok(me(bia).y > 8.1, "the server keeps the doorway shut");
  bia.room.send("teleport", { to: { userId: 30 } });
  await sleep(300);
  assert.ok(me(bia).y > 8, "no teleporting in");
  // ana can still walk out (and back in)
  await walk(ana, { x: 6.5, y: 11.5 });
  assert.ok(me(ana).y > 9, "the owner walks out");
  // a project owner can unlock in an emergency
  owner.room.send("door:set", { id: "door-room-ana-s-office", state: "open" });
  await waitFor(() => JSON.parse(owner.room.state.objects.get("door-room-ana-s-office").props).state === "open");
  await sleep(200);
  await walk(bia, { x: 6.5, y: 5.5 });
  assert.ok(me(bia).y < 8, "open again: bia walks in");
});

test("desks for a person, and resizing the map", async () => {
  const s = ++space;
  const owner = await person(32, s, "member,builder");
  owner.room.send("desk:assign", { id: "seat-3-5-a", ownerId: 33, ownerName: "P33" });
  await waitFor(() => JSON.parse(owner.room.state.objects.get("seat-3-5-a").props).ownerId === 33);
  owner.room.send("desk:assign", { id: "seat-7-5-a", ownerId: 33, ownerName: "P33" });
  await waitFor(() => JSON.parse(owner.room.state.objects.get("seat-7-5-a").props).ownerId === 33);
  await waitFor(() => JSON.parse(owner.room.state.objects.get("seat-3-5-a").props).ownerId === undefined, 2000);
  owner.room.send("map:resize", { width: 64, height: 48 });
  await waitFor(() => owner.room.state.width === 64 && owner.room.state.tiles.length === 48);
  owner.room.send("map:resize", { width: 20, height: 16 });
  await waitFor(() => owner.room.state.width === 20);
  const left = [...owner.room.state.objects.values()].every((o: { x: number; y: number }) => o.x < 20 && o.y < 16);
  assert.ok(left, "furniture outside the new size is removed");
});

test("the theme around the studio: builders pick it, members can't", async () => {
  const s = ++space;
  const member = await person(34, s);
  const owner = await person(35, s, "member,builder");
  assert.equal(member.room.state.theme, "clouds");
  member.room.send("map:theme", { theme: "snow" });
  await sleep(250);
  assert.equal(member.room.state.theme, "clouds", "members can't");
  owner.room.send("map:theme", { theme: "lava" });
  await sleep(250);
  assert.equal(member.room.state.theme, "clouds", "only known themes");
  owner.room.send("map:theme", { theme: "snow" });
  await waitFor(() => member.room.state.theme === "snow");
});

test("build hand: one builder holds a thing at a time; group moves are all or nothing", async () => {
  const s = ++space;
  const ana = await person(50, s, "member,builder");
  const bia = await person(51, s, "member,builder");
  const obj = (id: string) => ana.room.state.objects.get(id);
  ana.room.send("obj:put", { id: "h-plant", kind: "plant", x: 10, y: 3, rot: 0 });
  await waitFor(() => !!obj("h-plant"));
  // Ana picks it up: Bia can't move it, and is told who has it
  ana.room.send("obj:hold", { ids: ["h-plant"] });
  await waitFor(() => !!ana.room.state.holds.get("h-plant"));
  bia.room.send("obj:put", { id: "h-plant", kind: "plant", x: 12, y: 3, rot: 0 });
  await waitFor(() =>
    (bia.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("P50 is moving")),
  );
  assert.equal(obj("h-plant")?.x, 10, "still where Ana's hand left it");
  // Ana puts it down: the hold is gone, and Bia may move it again
  ana.room.send("obj:put", { id: "h-plant", kind: "plant", x: 11, y: 3, rot: 0 });
  await waitFor(() => obj("h-plant")?.x === 11 && !ana.room.state.holds.get("h-plant"));
  // a group that doesn't all fit changes nothing
  ana.room.send("obj:batch", {
    items: [
      { id: "h-plant", kind: "plant", x: 13, y: 3, rot: 0 },
      { kind: "plant", x: 900, y: 900, rot: 0 }, // off the map: no
    ],
  });
  await sleep(300);
  assert.equal(obj("h-plant")?.x, 11, "nothing moved");
  // …one that does, moves and adds together
  const before = ana.room.state.objects.size;
  ana.room.send("obj:batch", {
    items: [
      { id: "h-plant", kind: "plant", x: 13, y: 3, rot: 0 },
      { kind: "plant", x: 14, y: 3, rot: 0 },
    ],
  });
  await waitFor(() => obj("h-plant")?.x === 13 && ana.room.state.objects.size === before + 1);
  const copy = [...ana.room.state.objects.values()].find((o) => o.kind === "plant" && o.x === 14 && o.y === 3);
  assert.ok(copy, "the copy is there");
  // remove several at once
  ana.room.send("obj:removeMany", { ids: ["h-plant", copy.id] });
  await waitFor(() => !obj("h-plant") && !obj(copy.id));
  // a hand lets go when its builder leaves
  bia.room.send("obj:put", { id: "h-lamp", kind: "lamp", x: 12, y: 3, rot: 0 });
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
  ana.room.send("obj:put", { id: "t-desk", kind: "desk", x: 10, y: 3, rot: 0 });
  await waitFor(() => !!obj("t-desk"));
  // a mug on the desk's right half: at the desk's height
  ana.room.send("obj:put", { id: "t-mug", kind: "tabletop", x: 11, y: 3, rot: 0, props: { d: "mug", seed: 0.3 } });
  await waitFor(() => !!obj("t-mug"));
  assert.equal(JSON.parse(obj("t-mug")?.props ?? "{}").z, 25);
  // more than one per tile: a second mug in the next quarter, but not on the first
  ana.room.send("obj:put", { id: "t-mug2", kind: "tabletop", x: 11, y: 3, rot: 0, props: { d: "mug", c: [2, 1] } });
  await waitFor(() => !!obj("t-mug2"));
  ana.room.send("obj:put", { id: "t-mug3", kind: "tabletop", x: 11, y: 3, rot: 0, props: { d: "mug", c: [1, 1] } });
  await sleep(300);
  assert.equal(obj("t-mug3"), undefined);
  ana.room.send("obj:remove", { id: "t-mug2" });
  await waitFor(() => !obj("t-mug2"));
  // a desk placed now is bare for good (never furnished on the next load)
  assert.equal(JSON.parse(obj("t-desk")?.props ?? "{}").split, 1);
  // the room's own desks came set up: monitors and keyboards are real things
  const tops = [...st.objects.values()].filter((o) => o.kind === "tabletop");
  assert.ok(
    tops.some((o) => JSON.parse(o.props).d === "monitor"),
    "monitors on the studio's desks",
  );
  assert.ok(
    [...st.objects.values()].some((o) => o.kind === "side_table"),
    "the radio's stand",
  );
  // not on the floor
  ana.room.send("obj:put", { id: "t-floor", kind: "tabletop", x: 13, y: 3, rot: 0, props: { d: "mug" } });
  await sleep(300);
  assert.equal(obj("t-floor"), undefined);
  // the desk moves (and turns): the mug keeps its spot on it
  ana.room.send("obj:put", { id: "t-desk", kind: "desk", x: 12, y: 3, rot: 0 });
  await waitFor(() => obj("t-mug")?.x === 13 && obj("t-mug")?.y === 3);
  ana.room.send("obj:put", { id: "t-desk", kind: "desk", x: 12, y: 3, rot: 2 });
  await waitFor(() => obj("t-mug")?.x === 12, 3000);
  // the desk goes: so does what's on it
  ana.room.send("obj:remove", { id: "t-desk" });
  await waitFor(() => !obj("t-desk") && !obj("t-mug"));
  // looks: a real variant stays, a made-up one is dropped
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, rot: 0, props: { variant: 2 } });
  await waitFor(() => !!obj("t-chair"));
  assert.equal(JSON.parse(obj("t-chair")?.props ?? "{}").variant, 2);
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, rot: 0, props: { variant: 9 } });
  await waitFor(() => JSON.parse(obj("t-chair")?.props ?? "{}").variant === undefined);
  // a colour: kept on things that take one (a valid hex), dropped otherwise
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, rot: 0, props: { color: "#3d4a5c" } });
  await waitFor(() => JSON.parse(obj("t-chair")?.props ?? "{}").color === "#3d4a5c");
  ana.room.send("obj:put", { id: "t-chair", kind: "chair", x: 10, y: 3, rot: 0, props: { color: "red" } });
  await waitFor(() => JSON.parse(obj("t-chair")?.props ?? "{}").color === undefined);
  ana.room.send("obj:put", { id: "t-plant", kind: "plant", x: 12, y: 3, rot: 0, props: { color: "#3d4a5c" } });
  await waitFor(() => !!obj("t-plant"));
  assert.equal(JSON.parse(obj("t-plant")?.props ?? "{}").color, undefined, "plants aren't painted");
  ana.room.send("obj:remove", { id: "t-plant" });
  // generated clutter: taking a piece hides it and puts a real one in its place
  const map = () => ({
    ...getMap(st.mapKey),
    width: st.width,
    height: st.height,
    tiles: [...st.tiles],
    hWalls: [...st.hWalls],
    vWalls: [...st.vWalls],
    areas: JSON.parse(st.areas),
    spawn: { x: st.spawnX, y: st.spawnY },
  });
  const objects = () =>
    [...st.objects.values()].map((o) => ({
      id: o.id,
      kind: o.kind,
      x: o.x,
      y: o.y,
      rot: o.rot,
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
  a.room.send("pos", { x: at?.x ?? 0, y: at?.y ?? 0, d: 0, a: 2, seq: 1 });
  a.room.send("focus", { on: true });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.focus === true);
  // walking off ends it; and standing, you can't
  a.room.send("pos", { x: (at?.x ?? 0) + 0.1, y: at?.y ?? 0, d: 0, a: 1, seq: 2 });
  await waitFor(() => b.room.state.players.get(a.room.sessionId)?.focus === false);
  a.room.send("focus", { on: true });
  await sleep(300);
  assert.equal(b.room.state.players.get(a.room.sessionId)?.focus, false);
  // a switch within reach, two lamps in its room, one in another room
  const x = Math.floor(at?.x ?? 0);
  const y = Math.floor(at?.y ?? 0);
  const { map } = liveWorld(a);
  const sw = spotFor(a, "light_switch", x, y, 10, (sx, sy) => !!areaAt(map, sx + 0.5, sy + 0.5));
  assert.ok(sw, "a wall to put the switch on");
  await walk(a, { x: sw.x + 0.5, y: sw.y + 1.5 });
  const room = areaAt(map, sw.x + 0.5, sw.y + 0.5)?.key;
  const inRoom = (sx: number, sy: number) => areaAt(map, sx + 0.5, sy + 0.5)?.key === room;
  a.room.send("obj:put", { id: "t-switch", kind: "light_switch", ...sw, rot: 0 });
  const l1 = spotFor(a, "lamp", sw.x, sw.y + 1, 6, inRoom);
  assert.ok(l1);
  a.room.send("obj:put", { id: "t-lamp1", kind: "lamp", ...l1, rot: 0 });
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
  a.room.send("obj:put", { id: "t-lamp2", kind: "lamp", ...l2, rot: 0 });
  const l3 = spotFor(
    a,
    "lamp",
    sw.x,
    sw.y,
    14,
    (sx, sy) => !!room && !inRoom(sx, sy) && !!areaAt(map, sx + 0.5, sy + 0.5),
  );
  assert.ok(l3, "another room nearby");
  a.room.send("obj:put", { id: "t-lamp3", kind: "lamp", ...l3, rot: 0 });
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
      { kind: "tabletop", x: spot.x, y: spot.y, rot: 0, props: { d: "mug", c: [1, 1] } },
      { kind: "desk", x: spot.x, y: spot.y, rot: 0 },
    ],
  });
  await waitFor(() => count() === 2);
  const mug = [...a.room.state.objects.values()].find((o) => o.kind === "tabletop" && o.x === spot.x && o.y === spot.y);
  assert.equal(JSON.parse(mug?.props ?? "{}").z, 25, "standing on the desk's top");
});

test("slot cars: lanes near the track, five lights, laps counted from what a real car could do", async () => {
  const s = ++space;
  const a = await person(41, s, "member,builder");
  const b = await person(42, s);
  const at = me(a);
  const spot = spotFor(a, "slot_track", Math.floor(at?.x ?? 0) - 2, Math.floor(at?.y ?? 0) - 4, 5, () => true);
  assert.ok(spot, "room for a track");
  a.room.send("obj:put", { id: "t-slot", kind: "slot_track", x: spot.x, y: spot.y, rot: 0 });
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
  a.room.send("obj:remove", { id: "t-slot" });
  await waitFor(() => !race());
});

test("the arrival point: builders move it to open floor, and that's where people come in", async () => {
  const s = ++space;
  const owner = await person(43, s, "member,builder");
  const member = await person(44, s);
  const st = () => owner.room.state;
  const from = { x: st().spawnX, y: st().spawnY };
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
  assert.equal(st().spawnX, from.x);
  owner.room.send("map:spawn", { x: -5, y: -5 });
  await waitFor(() => (owner.msgs.toast ?? []).some((m) => /open floor/i.test((m as { text: string }).text)));
  owner.room.send("map:spawn", to);
  await waitFor(() => st().spawnX === to.x + 0.5 && st().spawnY === to.y + 0.5);
  await waitFor(() => (owner.msgs.toast ?? []).some((m) => /Arrival point set/.test((m as { text: string }).text)));
  // someone coming in now arrives there
  const late = await person(45, s);
  const p = late.room.state.players.get(late.room.sessionId);
  assert.ok(Math.hypot(p.x - (to.x + 0.5), p.y - (to.y + 0.5)) < 1.01, `arrived at ${p.x},${p.y}`);
});

test("your own arrival point: pick a spot you can walk to, arrive there, go back to it, reset it", async () => {
  const s = ++space;
  const ana = await person(54, s);
  const bia = await person(55, s); // keeps the room alive while Ana comes back
  const sp = { x: ana.room.state.spawnX, y: ana.room.state.spawnY };
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
        if (findPath(g, sp, { x: x + 0.5, y: y + 0.5 })?.length) to = { x, y };
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

test("your own arrival point in a booth: fine while it's free, the space's while someone's talking in it", async () => {
  const s = ++space;
  const ana = await person(56, s);
  const bia = await person(57, s);
  const sp = { x: ana.room.state.spawnX, y: ana.room.state.spawnY };
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
  a.room.send("obj:put", { id: "t-tv", kind: "crt_tv", x: tvSpot.x, y: tvSpot.y, rot: 0 });
  await waitFor(() => !!st().objects.get("t-tv"));
  const conSpot = spotFor(a, "console_nes", tvSpot.x + 1, tvSpot.y + 2, 4, () => true);
  assert.ok(conSpot, "room for a console");
  a.room.send("obj:put", { id: "t-con", kind: "console_nes", x: conSpot.x, y: conSpot.y, rot: 0 });
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

  // Ana leaves: paused; Bia carries on as host
  await a.room.leave(true);
  await waitFor(() => c()?.host === "", 4000);
  b.room.send("game:continue", { id: "t-con" });
  await waitFor(() => c()?.host === b.room.sessionId && c()?.p1 === b.room.sessionId && c()?.p2 === "");
  b.room.send("game:power", { id: "t-con", on: false });
  await waitFor(() => !c());
});
