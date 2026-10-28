import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// The physics world on the server (docs/plan/50-the-volume.md, phase 2): built when the room
// starts — the building, then every Grounds chunk as the land worker makes it — its counts on
// /metrics, and an edit in build mode followed (only what changed made again).
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";
process.env.YUTOPIA_PHYSICS = "1";

const PORT = 27300 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
let room: Room | null = null;
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
});
after(async () => {
  const bounded = <T>(p: Promise<T>) => Promise.race([p, sleep(1000)]);
  await bounded(room?.leave(true).catch(() => {}) ?? Promise.resolve());
  await bounded(server.gracefullyShutdown(false));
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});

async function gauges(): Promise<Record<string, number>> {
  const text = await (await fetch(`http://localhost:${PORT}/metrics`)).text();
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/^yutopia_(physics_\w+) (\S+)$/gm)) out[m[1]] = Number(m[2]);
  return out;
}
async function until(fn: (g: Record<string, number>) => boolean, ms: number) {
  const t = Date.now();
  for (;;) {
    const g = await gauges();
    if (fn(g)) return g;
    if (Date.now() - t > ms) throw new Error(`timeout: ${JSON.stringify(g)}`);
    await sleep(200);
  }
}

test("the room's physics world: the building at once, the whole Grounds as their land's made", async () => {
  room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9301,
    token: "dev:1:P1:member,builder",
  });
  const g = await until((g) => g.physics_ground_chunks >= 1184, 90_000);
  assert.ok(g.physics_bodies > 2000, `${g.physics_bodies} bodies`);
  assert.ok(g.physics_bodies < g.physics_max_bodies, "within its sizes");
  assert.equal(g.physics_refused, 0);
  assert.ok(g.physics_heap_bytes > 0 && g.physics_heap_bytes < 64 * 1024 * 1024, `${g.physics_heap_bytes} bytes`);
});

test("an edit in build mode: the thing's body made, nothing else", async () => {
  assert.ok(room);
  const before = await gauges();
  // (a plant somewhere on the home floor: one of these spots is free)
  for (const [x, y] of [
    [3, 3],
    [20, 5],
    [30, 12],
    [40, 30],
    [12, 20],
  ])
    room.send("obj:put", { id: `phys-plant-${x}-${y}`, kind: "plant", x, y, rot: 0 });
  const g = await until((g) => g.physics_statics > before.physics_statics, 10_000);
  assert.ok(g.physics_statics - before.physics_statics <= 5, "a body a plant, no more");
  assert.equal(g.physics_ground_chunks, before.physics_ground_chunks, "the Grounds untouched");
});

// (the company's fence along z −360 — shared grounds.ts FENCE — at x 0: the ground floor's coords
// are the building's less GROUND_OFFSET)
const FX = 0 + 60;
const FY = -360 + 10;
// (in the first test's room: one physics world a process, the first room's; admins, to be put by the
// fence at once — the walker with no powers on)
async function crossFence(roles: string, uid: number, up: number) {
  const { terrainAt } = await import("@yutopia/shared/grounds");
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9301,
    token: `dev:${uid}:P${uid}:${roles}`,
  });
  const snaps: unknown[] = [];
  r.onMessage("snap", (m) => snaps.push(m));
  r.onMessage("*", () => {});
  const me = () => r.state?.players?.get(r.sessionId);
  for (let t = Date.now(); !me() && Date.now() - t < 8000; ) await sleep(20);
  if (up) {
    r.send("mod:power", { power: "fly", on: true });
    for (let t = Date.now(); me().powers === 0 && Date.now() - t < 4000; ) await sleep(20);
  }
  r.send("teleport", { to: { x: FX + 0.5, y: FY - 2.5, level: 0 } });
  for (let t = Date.now(); Math.abs(me().y - (FY - 2.5)) > 0.6 && Date.now() - t < 8000; ) await sleep(20);
  await sleep(1200);
  snaps.length = 0;
  // across it, a quarter metre at a time at a walk's pace, a little over the ground (or 2 m up)
  const mt = Math.floor(performance.now());
  for (let i = 1; i <= 20; i++) {
    const y = FY - 2.5 + i * 0.25;
    const z = terrainAt(FX + 0.5 - 60, y - 10) + up;
    r.send("pos", { x: FX + 0.5, y, z, l: 0, mt: mt + i * 120, d: 0, a: 1 });
    await sleep(120);
  }
  await sleep(300);
  const y = me().y;
  await r.leave(true).catch(() => {});
  return { y, snaps: snaps.length };
}

// (walked into, the fence stops you in your own browser — Jolt there, e2e fence.spec; the server
// puts nobody back: no anticheat for now, the user's call 2026-10-28)
test("plan 50's first ask on the server: flown over the fence at 2 m, taken", async () => {
  await until((g) => g.physics_ground_chunks >= 1184, 90_000);
  const flown = await crossFence("member,builder,admin", 3, 2);
  assert.ok(flown.snaps === 0 && flown.y > FY + 2, `the flier over it: y ${flown.y.toFixed(2)}, ${flown.snaps} snaps`);
});

test("reach in three dimensions: a mug from the machine on the ground, not flying 4 m over it", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9301,
    token: "dev:4:P4:member,builder,admin",
  });
  r.onMessage("*", () => {});
  const me = () => r.state?.players?.get(r.sessionId);
  for (let t = Date.now(); !me() && Date.now() - t < 8000; ) await sleep(20);
  // the studio's coffee machine
  let machine: { id: string; x: number; y: number } | null = null;
  r.state.objects.forEach((o: { id: string; kind: string; x: number; y: number }) => {
    if (!machine && o.kind === "coffee_machine") machine = { id: o.id, x: o.x, y: o.y };
  });
  assert.ok(machine, "a coffee machine");
  const m = machine as { id: string; x: number; y: number };
  r.send("teleport", { to: { x: m.x + 0.5, y: m.y + 1.5, level: me().level } });
  await sleep(1500);
  r.send("item:take", { id: m.id });
  for (let t = Date.now(); me().held !== "mug" && Date.now() - t < 3000; ) await sleep(20);
  assert.equal(me().held, "mug", "taken, standing by it");
  r.send("item:drop", {});
  // up 4 m over the same spot, flying
  r.send("mod:power", { power: "fly", on: true });
  for (let t = Date.now(); me().powers === 0 && Date.now() - t < 3000; ) await sleep(20);
  const z0 = me().z;
  for (let i = 1; i <= 8; i++) {
    r.send("pos", { x: me().x, y: me().y, z: z0 + i * 0.5, mt: Math.floor(performance.now()), d: 0, a: 0 });
    await sleep(80);
  }
  for (let t = Date.now(); me().z < z0 + 3.9 && Date.now() - t < 3000; ) await sleep(20);
  assert.ok(me().z > z0 + 3.9, `up there: ${me().z}`);
  r.send("item:take", { id: m.id });
  await sleep(600);
  assert.equal(me().held, "", "out of reach up there");
  await r.leave(true).catch(() => {});
});

// one building (docs/plan/50 D): a floor is where you are, from your height — up through a ceiling
// for a flier through walls, the stairs for anyone else
async function upAFloor(roles: string, uid: number, powers: string[]) {
  const { STOREY } = await import("@yutopia/shared");
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9301,
    token: `dev:${uid}:P${uid}:${roles}`,
  });
  const snaps: unknown[] = [];
  r.onMessage("snap", (m) => snaps.push(m));
  r.onMessage("*", () => {});
  const me = () => r.state?.players?.get(r.sessionId);
  for (let t = Date.now(); !me() && Date.now() - t < 8000; ) await sleep(20);
  for (const power of powers) r.send("mod:power", { power, on: true });
  for (let t = Date.now(); powers.length && me().powers === 0 && Date.now() - t < 4000; ) await sleep(20);
  await sleep(300);
  const at = { x: 20.5, y: 18.5 };
  r.send("teleport", { to: { ...at, level: 1 } });
  for (let t = Date.now(); me().level !== 1 && Date.now() - t < 8000; ) await sleep(20);
  await sleep(1200);
  snaps.length = 0;
  // up, half a metre at a time, past the band (2.9): floor 2's frame, a storey lower
  const mt = Math.floor(performance.now());
  let i = 0;
  for (const z of [0.5, 1, 1.5, 2, 2.5, 2.85]) r.send("pos", { ...at, z, l: 1, mt: mt + ++i * 120, d: 0, a: 0 });
  await sleep(200);
  for (const z of [3.3, 3.8, 4.3]) {
    r.send("pos", { ...at, z: z - STOREY, l: 2, mt: mt + ++i * 120, d: 0, a: 0 });
    await sleep(120);
  }
  await sleep(400);
  const out = { level: me().level as number, snaps: snaps.length };
  await r.leave(true).catch(() => {});
  return out;
}

test("one building: through walls, a flier goes up through the ceiling onto the next floor", async () => {
  const ghost = await upAFloor("member,builder,admin", 5, ["fly", "clip"]);
  assert.deepEqual(ghost, { level: 2, snaps: 0 }, "the flier on floor 2");
});
