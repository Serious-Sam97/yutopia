import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { findPath, Grid, ROOM_NAME, studio } from "@yutopia/shared";
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
  const st = p.room.state;
  const map = {
    ...studio,
    width: st.width,
    height: st.height,
    tiles: [...st.tiles],
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
  return Grid.from(map, objects, { uid: st.players.get(p.room.sessionId).uid });
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
  builder.room.send("obj:put", { id: plant, kind: "plant", x: 0, y: 3, rot: 0 }); // into a wall
  await waitFor(() => (builder.msgs.toast?.length ?? 0) > 0);
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

test("radio: one shared station with a start time", async () => {
  const s = ++space;
  const a = await person(17, s);
  const b = await person(18, s);
  a.room.send("radio:set", { playing: true, station: 4 });
  await waitFor(() => b.room.state.radio.playing === true);
  assert.equal(b.room.state.radio.station, 1, "station wraps to the list");
  assert.ok(Math.abs(b.room.state.radio.startedAt - Date.now()) < 2000);
  b.room.send("radio:set", { playing: false });
  await waitFor(() => a.room.state.radio.playing === false);
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

test("map editing: builders paint walls, nobody gets walled in, members can't", async () => {
  const s = ++space;
  const member = await person(27, s);
  const owner = await person(28, s, "member,builder");
  const tiles = () => [...member.room.state.tiles] as string[];
  member.room.send("map:paint", { cells: [{ x: 10, y: 3, ch: "#" }] });
  await sleep(250);
  assert.equal(tiles()[3][10], ".", "members can't paint");
  owner.room.send("map:paint", {
    cells: [
      { x: 10, y: 3, ch: "#" },
      { x: 11, y: 3, ch: "," },
      { x: 3, y: 6, ch: "#" },
    ],
  });
  await waitFor(() => tiles()[3][10] === "#" && tiles()[3][11] === ",");
  assert.equal(tiles()[6][3], ".", "not over the desk");
  await waitFor(() => (owner.msgs.toast?.length ?? 0) > 0);
  // standing people can't be walled in
  const at = me(member);
  owner.room.send("map:paint", { cells: [{ x: Math.floor(at.x), y: Math.floor(at.y), ch: "#" }] });
  await sleep(250);
  assert.notEqual(tiles()[Math.floor(at.y)][Math.floor(at.x)], "#");
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
  for (let i = 1; i <= 6; i++) {
    bia.room.send("pos", { x: 6.5, y: 9.5 - i * 0.2, d: 4, a: 1, seq: 9000 + i });
    await sleep(55);
  }
  await waitFor(() => (bia.msgs.snap?.length ?? 0) > snaps);
  assert.ok(me(bia).y > 8.7, "the server keeps the doorway shut");
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
