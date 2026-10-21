import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { LOCKER, LOOT, type LootItem, lockerFront } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import type { Inventory } from "@yutopia/shared/inventory";
import { MOVE, MV_AIM, packMv } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// Vitals, pockets, loot (docs/plan/30-the-dark.md, phase 2): a sprint out on the
// land drains stamina and, out of breath, the allowance falls to a jog; a spot's
// loot goes to whoever searches it first and comes back on its timer; the
// gatehouse locker's revolver, dropped on the snow and picked up by someone else;
// pockets kept across a rejoin.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_LOOT_FAST = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26270 + Math.floor(Math.random() * 100);
const OFF = { x: -60, y: -10 }; // the ground floor's corner in the building's coords
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
async function waitFor(fn: () => boolean, ms = 6000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}
// (the first quick slot's rounds: a gun there)
const loaded0 = (p: { inv?: Inventory | null }) => (p.inv?.quick[0] as { loaded?: number } | null | undefined)?.loaded;
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);

interface Person {
  room: Room;
  bat: number;
  inv: Inventory | null;
  found: { spot: string; got: LootItem[]; full: boolean; gone?: boolean; later?: boolean }[];
  snaps: number;
}
async function person(uid: number, roles = "member,builder"): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 31,
    token: `dev:${uid}:P${uid}:${roles}`,
  });
  rooms.push(room);
  const who: Person = { room, bat: 100, inv: null, found: [], snaps: 0 };
  room.onMessage("dark:pockets", (m: { inv: Inventory; bat: number }) => {
    who.inv = m.inv;
    who.bat = m.bat;
  });
  room.onMessage("dark:found", (m: Person["found"][number]) => who.found.push(m));
  room.onMessage("snap", () => who.snaps++);
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  return who;
}
// to a spot on the land (the building's coords)
async function goTo(p: Person, bx: number, bz: number) {
  const to = { x: bx - OFF.x, y: bz - OFF.y };
  p.room.send("teleport", { to: { ...to, level: 0 } });
  await waitFor(() => me(p.room).level === 0 && Math.hypot(me(p.room).x - to.x, me(p.room).y - to.y) < 0.5);
}

test("a sprint across the pond drains stamina; out of breath the allowance is a jog's, and no roll", async () => {
  const a = await person(301);
  assert.equal(me(a.room).st, 100);
  // the pond's ice, flat and clear along z −60 from x −285
  let bx = -285;
  const bz = -60;
  await goTo(a, bx, bz);
  await sleep(100);
  a.snaps = 0; // (the teleport's own)
  const send = (gait: "sprint" | "jog") => {
    a.room.send("pos", {
      x: bx - OFF.x,
      y: bz - OFF.y,
      z: heightAt(bx, bz),
      d: 2,
      a: 1,
      seq: 0,
      mv: packMv(gait),
    });
  };
  // 6.4 s at a sprint (50 ms a message, as the client sends)
  for (let i = 0; i < 128; i++) {
    bx += MOVE.sprint * 0.05;
    send("sprint");
    await sleep(50);
  }
  await waitFor(() => me(a.room).st <= 3, 1500).catch(() =>
    assert.fail(`stamina ${me(a.room).st}, ${a.snaps} put back`),
  );
  assert.equal(a.snaps, 0, "an honest sprint is never put back");
  await waitFor(() => me(a.room).st === 0, 1500);
  // still sprinting, out of breath: put back once the grace and the slack run out
  const sent = a.snaps;
  for (let i = 0; i < 30 && a.snaps === sent; i++) {
    bx += MOVE.sprint * 0.05;
    send("sprint");
    await sleep(50);
  }
  assert.ok(a.snaps > sent, "a sprint while winded is put back");
  // where the server has me; a roll refused
  await sleep(100);
  bx = me(a.room).x + OFF.x;
  a.room.send("jump", { k: "roll" });
  await sleep(150);
  assert.notEqual(me(a.room).jump, "roll", "no roll out of breath");
  // a jog is fine (and stamina comes back while it goes)
  const jogged = a.snaps;
  for (let i = 0; i < 30; i++) {
    bx += MOVE.jog * 0.05;
    send("jog");
    await sleep(50);
  }
  assert.equal(a.snaps, jogged, "a jog while winded passes");
  assert.ok(me(a.room).st > 0, `stamina back on the way (${me(a.room).st})`);
});

test("a spot's loot goes to whoever searches it first, and comes back on its timer", async () => {
  const a = await person(311);
  const b = await person(312);
  // a townhouse's door (the first spot that turns something up: a search can find nothing)
  for (const spot of LOOT.filter((s) => s.place === "house")) {
    await goTo(a, spot.x, spot.z);
    await goTo(b, spot.x, spot.z);
    a.found = [];
    b.found = [];
    a.room.send("dark:loot", { spot: spot.id });
    await waitFor(() => a.found.length === 1);
    b.room.send("dark:loot", { spot: spot.id });
    await waitFor(() => b.found.length === 1);
    assert.equal(b.found[0].gone, true, "the second finds it emptied");
    assert.deepEqual(b.found[0].got, []);
    if (!a.found[0].got.length) continue;
    // what A found is in A's pockets
    await waitFor(() => (a.inv?.pockets.some(Boolean) || a.inv?.quick.some(Boolean)) ?? false);
    // refilled (YUTOPIA_LOOT_FAST: 20 min → 1.5–2.5 s)
    await sleep(2600);
    b.room.send("dark:loot", { spot: spot.id });
    await waitFor(() => b.found.length === 2);
    assert.notEqual(b.found[1].gone, true, "full again");
    return;
  }
  assert.fail("no house turned anything up");
});

test("the locker's revolver: loaded the first time; dropped, picked up by someone else; then empty", async () => {
  const a = await person(321);
  const b = await person(322);
  await goTo(a, LOCKER.x, LOCKER.z);
  a.room.send("dark:loot", { spot: "locker" });
  await waitFor(() => a.found.length === 1);
  assert.deepEqual(a.found[0].got, [{ id: "revolver", n: 1, loaded: 6 }]);
  await waitFor(() => a.inv?.quick[0]?.id === "revolver");
  // out on the snow by the gate, dropped (a weapon's slot: 6)
  await goTo(a, LOCKER.x - 8, LOCKER.z);
  a.room.send("dark:drop", { slot: 6 });
  await waitFor(() => a.room.state.drops.size === 1 && a.inv?.quick[0] === null);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const d: any = [...a.room.state.drops.values()][0];
  assert.equal(d.item, "revolver");
  assert.equal(d.loaded, 6);
  await goTo(b, d.x + OFF.x, d.y + OFF.y);
  b.room.send("dark:pick", { id: d.id });
  await waitFor(() => b.inv?.quick[0]?.id === "revolver");
  assert.equal(loaded0(b), 6);
  await waitFor(() => b.room.state.drops.size === 0);
  // back to the locker: another, empty this time
  await goTo(a, LOCKER.x, LOCKER.z);
  a.room.send("dark:loot", { spot: "locker" });
  await waitFor(() => a.found.length === 2);
  assert.deepEqual(a.found[1].got, [{ id: "revolver", n: 1, loaded: 0 }]);
  // and A's pockets are kept: gone and back
  rooms.splice(rooms.indexOf(a.room), 1);
  await a.room.leave(true);
  await sleep(200);
  const a2 = await person(321);
  assert.equal(a2.inv?.quick[0]?.id, "revolver");
  assert.equal(loaded0(a2), 0);
});

test("the torch focused: on, aiming, out on the land — the battery runs down; let go, it stops falling", async () => {
  const a = await person(331);
  await goTo(a, -250, -60);
  const aim = (on: boolean) =>
    a.room.send("pos", {
      x: -250 - OFF.x,
      y: -60 - OFF.y,
      z: heightAt(-250, -60),
      d: 2,
      a: 0,
      seq: 0,
      mv: packMv("still") | (on ? MV_AIM : 0),
    });
  // aiming without the torch: nothing
  aim(true);
  await sleep(400);
  assert.equal(me(a.room).focused, false);
  a.room.send("phone:torch", { on: true });
  aim(true);
  await waitFor(() => me(a.room).focused === true);
  await waitFor(() => a.bat <= 80, 4000);
  // let go of the aim: wide again, and the battery stops falling
  aim(false);
  await waitFor(() => me(a.room).focused === false);
  const after = a.bat;
  await sleep(1200);
  assert.ok(a.bat >= after, `${a.bat} after ${after}`);
  a.room.send("phone:torch", { on: false });
});

test("one body a person: one kept for a reconnection, the battery runs down at 12/s, not twice; run out, none until 25", async () => {
  const a = await person(341);
  // a's line drops (not a leave: the room keeps a's body a while for the reconnection), and they're back in a new tab
  rooms.splice(rooms.indexOf(a.room), 1);
  await a.room.leave(false);
  const b = await person(341);
  const mine = [...b.room.state.players.values()].filter((p) => p.uid === 341);
  assert.equal(mine.length, 2, "the kept one and the new one");
  await goTo(b, -250, -60);
  const aim = (on: boolean) =>
    b.room.send("pos", {
      x: -250 - OFF.x,
      y: -60 - OFF.y,
      z: heightAt(-250, -60),
      d: 2,
      a: 0,
      seq: 0,
      mv: packMv("still") | (on ? MV_AIM : 0),
    });
  b.room.send("phone:torch", { on: true });
  aim(true);
  await waitFor(() => me(b.room).focused === true);
  await waitFor(() => b.bat <= 90, 4000);
  const t0 = Date.now();
  const from = b.bat;
  await waitFor(() => b.bat <= from - 36, 6000);
  const rate = (from - b.bat) / ((Date.now() - t0) / 1000);
  assert.ok(rate > 9 && rate < 15, `${rate.toFixed(1)} a second`);
  // still aiming down to nothing, and on: the focus stays off all the way back up to 25
  // (told twice a second: by then it's already coming back, so not quite 0)
  await waitFor(() => !me(b.room).focused && b.bat < 5, 8000);
  let on = 0;
  const low = b.bat;
  const t1 = Date.now();
  while (b.bat < 24) {
    if (me(b.room).focused) on++;
    await sleep(50);
  }
  assert.equal(on, 0, "no focus while it comes back");
  // back at 4 a second (twice that was the kept body settling the same battery again)
  const back = (b.bat - low) / ((Date.now() - t1) / 1000);
  assert.ok(back < 5.5, `back at ${back.toFixed(1)} a second`);
  await waitFor(() => me(b.room).focused === true, 2000);
  aim(false);
  b.room.send("phone:torch", { on: false });
});

test("the inventory: a pocket dragged to another; something on the snow taken into the pocket it was dragged to; the quick slots", async () => {
  const a = await person(361, "member,builder,admin");
  await goTo(a, -250, -60);
  a.room.send("mod:refill", { kit: true });
  await waitFor(() => !!a.inv?.pockets.some((s) => s?.id === "aid"));
  const at = (id: string) => (a.inv as Inventory).pockets.findIndex((s) => s?.id === id);
  const empty = () => (a.inv as Inventory).pockets.indexOf(null);
  // the first aid to the empty pocket
  const aid = at("aid");
  const to = empty();
  assert.ok(aid >= 0 && to >= 0);
  a.room.send("dark:move", { from: aid, to });
  await waitFor(() => a.inv?.pockets[to]?.id === "aid" && a.inv?.pockets[aid] === null);
  // the flares dropped, then taken back into the pocket the first aid left
  const fl = at("flare");
  a.room.send("dark:drop", { slot: fl });
  await waitFor(() => a.room.state.drops.size > 0 && at("flare") < 0);
  const drop = [...a.room.state.drops.values()].find((d) => d.item === "flare");
  assert.ok(drop);
  a.room.send("dark:pick", { id: drop.id, slot: aid });
  await waitFor(() => a.inv?.pockets[aid]?.id === "flare");
  assert.equal(a.inv?.pockets[aid]?.n, 3);
  // quick slots swap
  const w0 = a.inv?.quick[0]?.id;
  a.room.send("dark:move", { from: 6, to: 7 });
  await waitFor(() => a.inv?.quick[1]?.id === w0);
  // the first aid into quick slot 4 (slot 9); a gun drawn from its slot
  a.room.send("dark:move", { from: to, to: 9 });
  await waitFor(() => a.inv?.quick[3]?.id === "aid" && a.inv?.pockets[to] === null);
  a.room.send("arms:draw", { slot: 1 });
  await waitFor(() => me(a.room).gun === w0);
  // a stack's quick slot draws nothing (the gun stays out); a weapon never goes into a pocket
  a.room.send("arms:draw", { slot: 3 });
  a.room.send("dark:move", { from: 7, to });
  // used from the quick slot, which empties
  a.room.send("dark:use", { slot: 9 });
  await waitFor(() => a.inv?.quick[3] === null);
  assert.equal(me(a.room).gun, w0, "still in the hand");
  assert.equal(a.inv?.quick[1]?.id, w0, "the gun stayed in its quick slot");
  assert.equal(a.inv?.pockets[to], null);
});

test("indoors: dropped on the studio's floor, there; picked up on that floor only", async () => {
  const a = await person(371, "member,builder,admin");
  const b = await person(372, "member,builder,admin");
  a.room.send("mod:refill", { kit: true });
  await waitFor(() => !!a.inv?.pockets.some((s) => s?.id === "flare"));
  const stand = async (p: Person, x: number, y: number, level: number) => {
    p.room.send("teleport", { to: { x, y, level } });
    await waitFor(() => me(p.room).level === level && Math.hypot(me(p.room).x - x, me(p.room).y - y) < 1.5);
  };
  await stand(a, 10.5, 22.5, 4);
  const slot = a.inv?.pockets.findIndex((s) => s?.id === "flare") ?? -1;
  a.room.send("dark:drop", { slot });
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const drop = (): any => [...a.room.state.drops.values()].find((d: { item: string }) => d.item === "flare");
  await waitFor(() => !!drop());
  assert.equal(drop().level, 4);
  // B on the ground floor (out by its west wall, at those coords): not theirs to pick
  await stand(b, drop().x, drop().y, 0);
  b.room.send("dark:pick", { id: drop().id });
  await sleep(400);
  assert.ok(drop(), "still lying there");
  // the lobby's locker is the ground floor's: not searched from upstairs
  a.room.send("dark:loot", { spot: "locker" });
  await sleep(300);
  assert.equal(a.found.length, 0, "no search off the ground floor");
  // B upstairs: picked up
  await stand(b, drop().x, drop().y, 4);
  b.room.send("dark:pick", { id: drop().id });
  await waitFor(() => !drop());
  assert.equal(b.inv?.pockets.find((s) => s?.id === "flare")?.n, 3);
});

test("a supply locker, built: a kit a day — what fits; tomorrow another; kept across a rejoin", async () => {
  const { kitClock } = await import("./features/survival.ts");
  const a = await person(381);
  // built in the studio (level 4), by the reception
  a.room.send("obj:put", { id: "kit-locker", kind: "locker", x: 8, y: 23, rot: 0, props: { level: 4 } });
  await waitFor(() => !!a.room.state.objects.get("kit-locker"));
  const f = lockerFront(a.room.state.objects.get("kit-locker"));
  const open = async (p: Person) => {
    p.room.send("teleport", { to: { x: f.x, y: f.y, level: 4 } });
    await waitFor(() => me(p.room).level === 4 && Math.hypot(me(p.room).x - f.x, me(p.room).y - f.y) < 0.5);
    const n = p.found.length;
    p.room.send("dark:loot", { spot: "kit:kit-locker" });
    await waitFor(() => p.found.length === n + 1);
    return p.found[n];
  };
  const first = await open(a);
  assert.deepEqual(first.got, [
    { id: "revolver", n: 1, loaded: 6 },
    { id: "r38", n: 12 },
    { id: "aid", n: 1 },
    { id: "battery", n: 1 },
    { id: "flare", n: 2 },
  ]);
  assert.equal(first.full, false);
  const again = await open(a);
  assert.deepEqual([again.got, again.later], [[], true], "once a day");
  // (B in the room meanwhile: an empty room goes, and the tests' builds aren't saved)
  const b = await person(382, "member,builder,admin");
  // gone and back: still today's
  rooms.splice(rooms.indexOf(a.room), 1);
  await a.room.leave(true);
  await sleep(200);
  const a2 = await person(381);
  assert.equal((await open(a2)).later, true);
  // pockets nearly full: what fits (the flares in a free quick slot), the day taken
  b.room.send("mod:refill", { kit: true });
  await waitFor(() => b.inv?.quick[0]?.id === "revolver" && !!b.inv?.pockets.some((s) => s?.id === "battery"));
  const some = await open(b);
  assert.deepEqual(
    some.got.map((g) => g.id),
    ["r38", "aid", "battery", "flare"],
  );
  assert.deepEqual(b.inv?.quick[2], { id: "flare", n: 2 });
  assert.equal(some.full, false, "all of it fitted, with the quick slots");
  assert.equal((await open(b)).later, true);
  // tomorrow: another (a revolver carried: none)
  kitClock.shift = 86_400_000;
  try {
    const next = await open(a2);
    assert.deepEqual(
      next.got.map((g) => g.id),
      ["r38", "aid", "battery", "flare"],
    );
  } finally {
    kitClock.shift = 0;
  }
});

test("the torch focused indoors too: on, aiming, on the studio's floor", async () => {
  const a = await person(391, "member,builder,admin");
  a.room.send("teleport", { to: { x: 10.5, y: 22.5, level: 4 } });
  await waitFor(() => me(a.room).level === 4 && Math.hypot(me(a.room).x - 10.5, me(a.room).y - 22.5) < 1.5);
  await sleep(300);
  const p = { x: me(a.room).x, y: me(a.room).y };
  a.room.send("phone:torch", { on: true });
  a.room.send("pos", { x: p.x, y: p.y, z: 0, d: 2, a: 0, seq: 0, mv: packMv("still") | MV_AIM });
  await waitFor(() => me(a.room).focused === true);
  a.room.send("pos", { x: p.x, y: p.y, z: 0, d: 2, a: 0, seq: 0, mv: packMv("still") });
  await waitFor(() => me(a.room).focused === false);
  a.room.send("phone:torch", { on: false });
});
