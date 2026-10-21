import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { dayNests, dayOf, NESTS, SHADE_STATES } from "@yutopia/shared/dark";
import { heightAt, walkableTile } from "@yutopia/shared/grounds";
import { packMv } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// The day's nests (docs/plan/31-the-day.md, phase 2): by day nobody comes out
// of the dark — a nest at the farm is out, asleep, when someone's near; seen
// crouching at 12 tiles it sleeps on, at 6 standing it wakes, all of it; led
// past its leash it goes home and sleeps again; at the dusk it's the night's.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27670 + Math.floor(Math.random() * 100);
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
const shadows = (room: Room): any[] => [...(room.state.shadows?.values() ?? [])];
const code = (s: (typeof SHADE_STATES)[number]) => SHADE_STATES.indexOf(s);

async function person(uid: number, sandbox: number) {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  return room;
}
// on the land at (bx, bz), the building's coords
async function standAt(room: Room, bx: number, bz: number, crouch = false) {
  const to = { x: bx - OFF.x, y: bz - OFF.y };
  // (crouched before going: a teleport lands with the last pos's gait)
  if (crouch) {
    const m = me(room);
    room.send("pos", { x: m.x, y: m.y, z: m.z, d: 2, a: 0, seq: 0, mv: packMv("still") | 8 });
    await waitFor(() => (me(room).mv & 8) !== 0);
  }
  if (Math.hypot(me(room).x - to.x, me(room).y - to.y) > 0.5) {
    room.send("teleport", { to: { ...to, level: 0 } });
    await waitFor(() => me(room).level === 0 && Math.hypot(me(room).x - to.x, me(room).y - to.y) < 0.5);
  }
  room.send("pos", { ...to, z: heightAt(bx, bz), d: 2, a: 0, seq: 0, mv: packMv("still") | (crouch ? 8 : 0) });
}
const hour = async (room: Room, h: number) => {
  room.send("mod:hour", { h });
  room.send("mod:storm", { storm: 0, now: true });
  await waitFor(() => Math.abs(room.state.hour - h) < 0.01 && room.state.storm < 0.05);
};
// the day's nests as the server has them (the first 30: nobody's been out yet but us)
const nests = dayNests(dayOf(Date.now())).slice(0, NESTS.base);
// a walkable spot `r` from (x, z), clear of every nest by `clear`
function spotNear(x: number, z: number, r: number, clear = 14) {
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const sx = x + Math.cos(a) * r;
    const sz = z + Math.sin(a) * r;
    if (!walkableTile(Math.floor(sx), Math.floor(sz))) continue;
    if (nests.some((n) => (n.x !== x || n.z !== z) && Math.hypot(n.x - sx, n.z - sz) < clear)) continue;
    return { x: Math.floor(sx) + 0.5, z: Math.floor(sz) + 0.5 };
  }
  throw new Error(`nowhere ${r} from ${x}, ${z}`);
}
// the ones round a nest (building coords): within 7 tiles of it
const round = (room: Room, n: { x: number; z: number }) =>
  shadows(room).filter((s) => Math.hypot(s.x + OFF.x - n.x, s.y + OFF.y - n.z) < 7);

test("by day nobody comes out of the dark; a nest out there, asleep, once you're near", async () => {
  const a = await person(801, 81);
  await hour(a, 12);
  // far from every nest: nothing comes
  let lone: { x: number; z: number } | null = null;
  for (let z = -300; z < 100 && !lone; z += 23)
    for (let x = -350; x < 200 && !lone; x += 29) {
      if (!walkableTile(Math.floor(x), Math.floor(z))) continue;
      if (nests.every((n) => Math.hypot(n.x - x, n.z - z) > 110))
        lone = { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 };
    }
  assert.ok(lone, "somewhere far from the nests");
  await standAt(a, lone.x, lone.z);
  await sleep(3500);
  assert.equal(shadows(a).length, 0, "nobody out of the dark by day");
  // by a nest at the farm: out, asleep, as many as it holds
  const farm = nests.find((n) => n.zone === "farm");
  assert.ok(farm, "a nest at the farm");
  const by = spotNear(farm.x, farm.z, 25);
  await standAt(a, by.x, by.z);
  await waitFor(() => round(a, farm).length === farm.n, 15_000);
  for (const s of round(a, farm)) assert.equal(s.s, code("lurk"), "asleep");
});

test("crouched at 12 tiles it sleeps on; at 6 standing it wakes — the whole nest; past its leash, home to sleep", async () => {
  const a = await person(811, 82);
  await hour(a, 12);
  const farm = nests.filter((n) => n.zone === "farm").sort((p, q) => q.n - p.n)[0];
  assert.ok(farm);
  const by = spotNear(farm.x, farm.z, 25);
  await standAt(a, by.x, by.z);
  await waitFor(() => round(a, farm).length === farm.n, 15_000);
  // creeping up: 12 tiles crouched — still asleep
  const c12 = spotNear(farm.x, farm.z, 12);
  await standAt(a, c12.x, c12.z, true);
  await sleep(2000);
  for (const s of round(a, farm)) assert.equal(s.s, code("lurk"), "crouched at 12: asleep");
  // 6 tiles, standing: awake, all of them
  const s6 = spotNear(farm.x, farm.z, 4.5);
  await standAt(a, s6.x, s6.z);
  await waitFor(() => round(a, farm).every((s) => s.s !== code("lurk")), 5000);
  // away past its leash: they go home, and sleep again
  const away = spotNear(farm.x, farm.z, 55, 20);
  await standAt(a, away.x, away.z);
  await waitFor(
    () => shadows(a).length > 0 && shadows(a).every((s) => s.s === code("home") || s.s === code("lurk")),
    20_000,
  );
  await waitFor(() => round(a, farm).length === farm.n && round(a, farm).every((s) => s.s === code("lurk")), 30_000);
});

test("at the dusk the nest's are the night's: awake, out of their nests", async () => {
  const a = await person(821, 83);
  await hour(a, 12);
  const farm = nests.find((n) => n.zone === "farm");
  assert.ok(farm);
  const by = spotNear(farm.x, farm.z, 25);
  await standAt(a, by.x, by.z);
  await waitFor(() => round(a, farm).length === farm.n, 15_000);
  await hour(a, 19);
  await waitFor(() => round(a, farm).every((s) => s.s !== code("lurk")), 5000);
  a.send("mod:dark", { mode: "peaceful" });
});

test("the nests' caches: out for the day; searched, what's in it comes to the pockets, and it's gone", async () => {
  const a = await person(831, 84);
  const found: { got: { id: string; n: number }[] }[] = [];
  a.onMessage("dark:found", (m: { got: { id: string; n: number }[] }) => found.push(m));
  a.send("dark:hello", {});
  await hour(a, 12);
  const withCache = nests.filter((n) => n.cache);
  assert.ok(withCache.length > 5, "most nests keep one");
  // on the state (the sweep's: every 5 s), the day's first 30's
  await waitFor(() => withCache.every((n) => a.state.caches.has(n.cache?.id)), 8000);
  const n = withCache.find((x) => x.zone === "farm") ?? withCache[0];
  const c = n.cache as NonNullable<typeof n.cache>;
  await standAt(a, c.x, c.z);
  a.send("dark:loot", { spot: c.id });
  await waitFor(() => found.length > 0, 4000);
  assert.deepEqual(found[0].got.map((g) => g.id).sort(), c.items.map((i) => i.id).sort());
  await waitFor(() => !a.state.caches.has(c.id), 3000);
});
