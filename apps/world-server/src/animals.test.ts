import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { habitatAt } from "@yutopia/shared/animals/habitat";
import { doingOf } from "@yutopia/shared/animals/mind";
import { heightAt, walkableCell, waterAt } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import type { Inventory } from "@yutopia/shared/inventory";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { packMv, yawToByte } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// The animals (docs/plan/126-animal-life.md) in an offline room: the land's made round whoever's out, a placed herd
// where God mode put it; a deer bolts from a runner, falls to shots and is skinned (meat, a hide); a duck comes to
// bread held out and eats it from the hand (trust); the wolves come for a stranger in their pass (F5c); the farm's
// pens keep their horses, ridden.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 32100 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
let lay: (e: GroundsEdits) => unknown;
const rooms: Room[] = [];
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  lay = (await import("./land.ts")).landEdits;
  server = await startWorldServer(PORT);
});
after(async () => {
  lay({ rev: 0 });
  for (const r of rooms) await r.leave(true).catch(() => {});
  await server.gracefullyShutdown(false);
});
async function waitFor(fn: () => boolean, ms = 15_000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(25);
  }
}
interface Person {
  room: Room;
  inv: Inventory | null;
  hits: { id: string; kind: string }[];
  did: { id: string; act: string; ok: boolean; got?: { id: string; n: number }[]; trust?: number; why?: string }[];
  struck: { id: string; kind: string; n: number }[];
  calls: { id: string; k: string; c: string }[];
}
async function person(uid: number, sandbox: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, hits: [], did: [], struck: [], calls: [] };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("arms:hit", (m: Person["hits"][number]) => who.hits.push(m));
  room.onMessage("animal:did", (m: Person["did"][number]) => who.did.push(m));
  room.onMessage("animal:strike", (m: Person["struck"][number]) => who.struck.push(m));
  room.onMessage("animal:call", (m: Person["calls"][number]) => who.calls.push(m));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  // (up and whole: a run before may have left them down — the offline store keeps their vitals)
  room.send("mod:refill", {});
  await waitFor(() => (room.state.players.get(room.sessionId) as { hp: number }).hp >= 100);
  return who;
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const animal = (room: Room, id: string): any => room.state.animals?.get(id);
async function standAt(p: Person, x: number, y: number) {
  p.room.send("teleport", { to: { x, y, level: 0 } });
  await waitFor(() => me(p.room).level === 0 && Math.hypot(me(p.room).x - x, me(p.room).y - y) < 0.5);
}
function moveTo(p: Person, x: number, y: number, mv = packMv("still")) {
  p.room.send("pos", { x, y, z: heightAt(x, y), a: 0, seq: 0, mv, yaw: 0, pitch: 0 });
}
/** An open walkable field spot round (x, y). */
function fieldNear(x: number, y: number): { x: number; y: number } {
  for (let r = 0; r < 200; r += 4)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * r);
      const py = Math.round(y + Math.sin(a) * r);
      let ok = true;
      for (let dx = -12; dx <= 12 && ok; dx += 3)
        for (let dy = -12; dy <= 12 && ok; dy += 3) if (!walkableCell(px + dx, py + dy) || waterAt(px + dx, py + dy)) ok = false;
      if (ok && habitatAt(px, py).field) return { x: px, y: py };
    }
  throw new Error("no field");
}

test("a placed deer: seen near, bolts from a runner", async () => {
  const f = fieldNear(60, -150);
  lay({ rev: 1, animals: { add: [{ key: "t-deer", kind: "herd", species: "deer", x: f.x, z: f.y, n: 1 }] } });
  const p = await person(201, 2601);
  p.room.send("mod:hour", { h: 19 });
  await standAt(p, f.x + 60, f.y);
  await waitFor(() => !!animal(p.room, "t-deer#0"));
  const d = animal(p.room, "t-deer#0");
  assert.ok(Math.hypot(d.x - f.x, d.y - f.y) < 20, "near where it was put");
  // a runner coming at it: it bolts
  const start = { x: d.x, y: d.y };
  for (let i = 0; i < 12; i++) {
    moveTo(p, f.x + 60 - i * 4, f.y, packMv("sprint"));
    await sleep(120);
  }
  await waitFor(() => ["flee", "alert"].includes(doingOf(animal(p.room, "t-deer#0").d)), 8000);
  await waitFor(() => Math.hypot(animal(p.room, "t-deer#0").x - start.x, animal(p.room, "t-deer#0").y - start.y) > 4, 8000);

});

test("a hare shot down from where it sits, skinned: meat and its fur", async () => {
  const f = fieldNear(20, -120);
  lay({ rev: 5, animals: { add: [{ key: "t-hare", kind: "herd", species: "hare", x: f.x, z: f.y, n: 1 }] } });
  const p = await person(205, 2605);
  p.room.send("mod:hour", { h: 12 });
  await standAt(p, f.x - 16, f.y);
  await waitFor(() => !!animal(p.room, "t-hare#0"));
  p.room.send("mod:refill", { kit: true });
  await waitFor(() => p.inv?.quick[0]?.id === "revolver");
  p.room.send("arms:draw", { slot: 0 });
  await sleep(800);
  let killed = false;
  for (let i = 0; i < 6 && !killed; i++) {
    const a = animal(p.room, "t-hare#0");
    const m = me(p.room);
    const oz = heightAt(m.x, m.y) + 1.35;
    const yaw = Math.atan2(a.y - m.y, a.x - m.x);
    const dist = Math.hypot(a.x - m.x, a.y - m.y);
    const pitch = Math.atan2(heightAt(a.x, a.y) + 0.12 - oz, dist);
    p.room.send("pos", { x: m.x, y: m.y, z: heightAt(m.x, m.y), a: 0, seq: 0, mv: packMv("still") | 16, yaw: yawToByte(yaw + AIM_BLADE), pitch: 0 });
    await sleep(300);
    p.room.send("arms:fire", { ox: m.x, oy: m.y, oz, yaw, pitch, lag: 0, seed: 7 + i });
    await sleep(900);
    killed = p.hits.some((h) => h.id === "t-hare#0" && h.kind === "killed");
  }
  assert.ok(killed, "it fell");
  assert.equal(doingOf(animal(p.room, "t-hare#0").d), "dead");
  const a = animal(p.room, "t-hare#0");
  await standAt(p, a.x + 1, a.y);
  p.room.send("animal:act", { id: "t-hare#0", act: "skin" });
  await waitFor(() => p.did.some((x) => x.act === "skin"));
  const skin = p.did.find((x) => x.act === "skin");
  assert.ok(skin?.ok, `skinned (${skin?.why})`);
  assert.ok(skin?.got?.some((g) => g.id === "meat"));
  assert.ok(skin?.got?.some((g) => g.id === "hide_fur"));
});

test("a duck comes to bread held out, eats it from the hand; trust grows", async () => {
  // the pond's north shore, the ducks on the water by it
  lay({ rev: 2, animals: { add: [{ key: "t-duck", kind: "herd", species: "duck", x: -240, z: -80, n: 1 }] } });
  const p = await person(202, 2602);
  p.room.send("mod:hour", { h: 12 });
  // (the dark's day nests take those off the paths even at noon: she'd be down before the duck came, and nothing
  // comes to the downed)
  p.room.send("mod:dark", { mode: "peaceful" });
  // a walkable spot on the bank
  let bank: { x: number; y: number } | null = null;
  for (let z = -96; z > -140 && !bank; z -= 1) if (walkableCell(-240, z) && !waterAt(-240, z)) bank = { x: -240, y: z - 1 };
  assert.ok(bank);
  await standAt(p, bank.x, bank.y);
  await waitFor(() => !!animal(p.room, "t-duck#0"));
  // bread from the market's crate, then back to the bank
  await standAt(p, 366, -397.5);
  p.room.send("animal:take", { food: "bread" });
  await waitFor(() => p.inv?.hand?.id === "bread");
  await standAt(p, bank.x, bank.y);
  // still, holding it out: it comes
  for (let i = 0; i < 200; i++) {
    moveTo(p, bank.x, bank.y);
    const a = animal(p.room, "t-duck#0");
    if (!a) {
      await sleep(250);
      continue;
    }
    if (Math.hypot(a.x - bank.x, a.y - bank.y) < 2.4) break;
    await sleep(250);
  }
  await waitFor(() => !!animal(p.room, "t-duck#0"));
  const a = animal(p.room, "t-duck#0");
  assert.ok(Math.hypot(a.x - bank.x, a.y - bank.y) < 3, `it came (${Math.hypot(a.x - bank.x, a.y - bank.y).toFixed(1)} m)`);
  p.room.send("animal:act", { id: "t-duck#0", act: "feed" });
  await waitFor(() => p.did.some((x) => x.act === "feed"));
  const fed = p.did.find((x) => x.act === "feed");
  assert.ok(fed?.ok, `fed (${fed?.why})`);
  assert.ok((fed?.trust ?? 0) > 0);
});

test("the wolves' pass (F5c): a stranger in their territory is struck", async () => {
  const f = fieldNear(-100, -300);
  lay({ rev: 3, animals: { add: [{ key: "t-wolf", kind: "den", species: "wolf", x: f.x, z: f.y, n: 2, young: 0, r: 200 }] } });
  const p = await person(203, 2603);
  p.room.send("mod:hour", { h: 23 });
  // (the dark's shadowed off: at 23:00 they'd have her down first, and the wolves leave the downed alone)
  p.room.send("mod:dark", { mode: "peaceful" });
  await standAt(p, f.x + 15, f.y);
  await waitFor(() => !!animal(p.room, "t-wolf#0"));
  // (it warns first: she walks up to it and stays — a warned wolf charges once it's growled a while)
  let at = { x: f.x + 15, y: f.y };
  for (let i = 0; i < 150 && !p.struck.length; i++) {
    const w = animal(p.room, "t-wolf#0");
    // (up to it, then she stays where she is)
    if (w && Math.hypot(w.x - at.x, w.y - at.y) > 7) at = { x: w.x + 5, y: w.y };
    moveTo(p, at.x, at.y);
    await sleep(200);
  }
  assert.ok(p.struck.length > 0, "struck");
  // (one bite on her, then it backs off: the next not for a while)
  const first = p.struck.length;
  await sleep(1000);
  assert.ok(p.struck.length <= first + 1, `bitten ${p.struck.length - first} times in a second`);
  assert.equal(p.struck[0].kind, "wolf");
  await waitFor(() => me(p.room).hp < 100);
});

test("the farm: horses in their paddock, ridden; a hen's egg", async () => {
  lay({ rev: 4 });
  const p = await person(204, 2604);
  p.room.send("mod:hour", { h: 12 });
  await standAt(p, 476, -290);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const horses = () => [...(p.room.state.animals?.values() ?? [])].filter((a: any) => a.k === "horse" && !a.young);
  await waitFor(() => horses().length > 0);
  for (const h of horses()) assert.ok(h.x >= 452 && h.x <= 500 && h.y >= -298 && h.y <= -280, "in the paddock");
  const h = horses()[0];
  await standAt(p, h.x + 1, h.y);
  const hx = me(p.room).x;
  const hy = me(p.room).y;
  p.room.send("animal:act", { id: h.id, act: "mount" });
  await waitFor(() => p.did.some((x) => x.act === "mount"));
  assert.ok(p.did.find((x) => x.act === "mount")?.ok);
  await waitFor(() => doingOf(animal(p.room, h.id).d) === "ridden");
  // it goes where its rider goes
  moveTo(p, hx - 3, hy, packMv("sprint"));
  await waitFor(() => Math.abs(animal(p.room, h.id).x - (hx - 3)) < 0.5);
  // ridden out of the paddock and let go there: it walks back in (its pen held it everywhere outside: stuck)
  for (let y = hy; y < -273; y += 0.8) {
    moveTo(p, hx - 3, y, packMv("walk"));
    await sleep(100);
  }
  moveTo(p, hx - 3, -273, packMv("still"));
  await waitFor(() => animal(p.room, h.id).y > -276);
  p.room.send("animal:act", { id: h.id, act: "dismount" });
  await waitFor(() => doingOf(animal(p.room, h.id).d) !== "ridden");
  await waitFor(() => animal(p.room, h.id).y < -280.3, 20_000);
  // a hen
  await standAt(p, 425, -273);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const hen = () => [...(p.room.state.animals?.values() ?? [])].find((a: any) => a.k === "chicken" && !a.young);
  await waitFor(() => !!hen());
  const c = hen();
  await standAt(p, c.x + 0.5, c.y);
  p.room.send("animal:act", { id: c.id, act: "collect" });
  await waitFor(() => p.did.some((x) => x.act === "collect"));
  const egg = p.did.find((x) => x.act === "collect");
  assert.ok(egg?.ok, `an egg (${egg?.why})`);
  assert.ok(egg?.got?.some((g) => g.id === "egg"));
  // once a day
  p.room.send("animal:act", { id: c.id, act: "collect" });
  await waitFor(() => p.did.filter((x) => x.act === "collect").length > 1);
  assert.equal(p.did.filter((x) => x.act === "collect")[1].why, "today");
});

test("one of the land's own God mode moved (plan 127, F5a): out where it's moved, by its own key", async () => {
  // (the tests' rooms make no wildlife of the land's: a change written whole stands on its own)
  const f = fieldNear(-60, -200);
  const key = "l-3_-2_deer_0";
  lay({ rev: 6, animals: { change: { [key]: { species: "deer", x: f.x, z: f.y, n: 2, young: 0 } } } });
  try {
    const p = await person(206, 2606);
    p.room.send("mod:hour", { h: 12 });
    await standAt(p, f.x + 40, f.y);
    await waitFor(() => !!animal(p.room, `${key}#0`) && !!animal(p.room, `${key}#1`), 20_000);
    const a = animal(p.room, `${key}#0`);
    assert.ok(Math.hypot(a.x - f.x, a.y - f.y) < 25, "where it was moved");
  } finally {
    lay({ rev: 7 });
  }
});

// ── plan 128: the minds out on the land ───────────────────────────────────────────────────────────────────────────

test("a herd at dusk goes somewhere of its day, together — and stands still when it stands (plan 128)", async () => {
  const f = fieldNear(140, -120);
  lay({ rev: 8, animals: { add: [{ key: "t-herd", kind: "herd", species: "deer", x: f.x, z: f.y, n: 3 }] } });
  try {
    // (an earlier test's room: a seventh room's physics in one file is too slow to join)
    const p = await person(207, 2601);
    p.room.send("mod:hour", { h: 18 });
    p.room.send("mod:dark", { mode: "peaceful" });
    // (off to one side, far enough not to be a bother: it's the deer's evening)
    await standAt(p, f.x - 75, f.y);
    await waitFor(() => !!animal(p.room, "t-herd#0") && !!animal(p.room, "t-herd#2"), 20_000);
    const start = { x: animal(p.room, "t-herd#0").x, y: animal(p.room, "t-herd#0").y };
    let far = 0;
    let onTheSpot = 0;
    let lastPos: { x: number; y: number; p: number } | null = null;
    for (let i = 0; i < 120 && far < 20; i++) {
      moveTo(p, f.x - 75, f.y);
      await sleep(500);
      const a = animal(p.room, "t-herd#0");
      if (!a) continue;
      far = Math.max(far, Math.hypot(a.x - start.x, a.y - start.y));
      // (walking, it moves; standing, its pace is still)
      if (lastPos && lastPos.p !== 0 && a.p !== 0 && Math.hypot(a.x - lastPos.x, a.y - lastPos.y) < 0.05) onTheSpot++;
      lastPos = { x: a.x, y: a.y, p: a.p };
    }
    assert.ok(far >= 20, `the lead went ${far.toFixed(1)} m in a minute of dusk`);
    assert.ok(onTheSpot <= 2, `walking on the spot ${onTheSpot} times`);
    const l = animal(p.room, "t-herd#0");
    for (const i of [1, 2]) {
      const m = animal(p.room, `t-herd#${i}`);
      if (m) assert.ok(Math.hypot(m.x - l.x, m.y - l.y) < 35, `the herd's #${i} with its lead`);
    }
  } finally {
    lay({ rev: 9 });
  }
});

test("a runner at a herd: an alarm called, heard (plan 128 F6a/F7a)", async () => {
  const f = fieldNear(-160, -60);
  lay({ rev: 10, animals: { add: [{ key: "t-alarm", kind: "herd", species: "deer", x: f.x, z: f.y, n: 3 }] } });
  try {
    const p = await person(208, 2602);
    p.room.send("mod:hour", { h: 12 });
    p.room.send("mod:dark", { mode: "peaceful" });
    await standAt(p, f.x + 60, f.y);
    await waitFor(() => !!animal(p.room, "t-alarm#0"), 20_000);
    for (let i = 0; i < 40 && !p.calls.some((c) => c.c === "alarm" && c.id.startsWith("t-alarm")); i++) {
      const a = animal(p.room, "t-alarm#0");
      const to = a ? { x: a.x + 14, y: a.y } : { x: f.x + 14, y: f.y };
      const at = me(p.room);
      const step = Math.min(2.5, Math.hypot(to.x - at.x, to.y - at.y));
      const l = Math.hypot(to.x - at.x, to.y - at.y) || 1;
      moveTo(p, at.x + ((to.x - at.x) / l) * step, at.y + ((to.y - at.y) / l) * step, packMv("walk"));
      await sleep(250);
    }
    assert.ok(p.calls.some((c) => c.c === "alarm" && c.id.startsWith("t-alarm")), "an alarm heard from the herd");
  } finally {
    lay({ rev: 11 });
  }
});
