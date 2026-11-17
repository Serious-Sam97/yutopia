import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { type CarClaim, DOOR_GONE, DOOR_HANG, PANE_CRACK, PART, parkedPose, parseDamage, parseHoles, SPECS } from "@yutopia/shared/car";
import { ARMS } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import type { Inventory } from "@yutopia/shared/inventory";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { Client, type Room } from "colyseus.js";

// Shots meet cars (docs/plan/93-the-car-in-the-world.md S1): one of Main Street's parked cars between B and
// A — struck low at its nose, the engine block stops the round (A, behind it, is safe; its front's damaged,
// everyone near told what was struck); through its side windows a round goes on (A, behind, is hit; that
// side's glass gone); a tyre struck goes flat.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 33200 + Math.floor(Math.random() * 100); // (its own hundred: no two files share one — they run at once)
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

interface Person {
  room: Room;
  inv: Inventory | null;
  hits: { id: string; kind: string }[];
  carShots: { hits: { id: string; struck: string; face: number }[] }[];
}
async function person(uid: number, sandbox: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, hits: [], carShots: [] };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("arms:hit", (m: { id: string; kind: string }) => who.hits.push(m));
  room.onMessage("car:shot", (m: Person["carShots"][number]) => who.carShots.push(m));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  return who;
}
async function standAt(p: Person, x: number, y: number) {
  p.room.send("teleport", { to: { x, y, level: 0 } });
  await waitFor(() => me(p.room).level === 0 && Math.hypot(me(p.room).x - x, me(p.room).y - y) < 0.6);
  await sleep(300); // (a few ticks where they stand: the rewind's)
}
// aiming (the body faces it), still
function aim(p: Person, x: number, y: number) {
  const m = me(p.room);
  p.room.send("pos", {
    x: m.x,
    y: m.y,
    z: m.z,
    a: 0,
    seq: 0,
    mv: packMv("still") | MV_AIM,
    yaw: yawToByte(Math.atan2(y - m.y, x - m.x) + AIM_BLADE),
    pitch: 0,
  });
}
// a shot from my hand toward (x, y) at `h` m over the ground there
// (plan 95 F4a: `cars`, the shooter's screen's word on each round's car)
function fireAt(p: Person, x: number, y: number, h: number, cars?: (CarClaim | 0 | null)[], ground?: number) {
  const m = me(p.room);
  const oz = heightAt(m.x, m.y) + 1.35;
  const yaw = Math.atan2(y - m.y, x - m.x);
  const pitch = Math.atan2((ground ?? heightAt(x, y)) + h - oz, Math.hypot(x - m.x, y - m.y));
  p.room.send("arms:fire", { ox: m.x, oy: m.y, oz, yaw, pitch, lag: 0, seed: 7, ...(cars ? { cars } : {}) });
}
// a parked car of the street: its object, its pose
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
function aCar(room: Room): { id: string; x: number; y: number; a: number; props: () => any } {
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  let found: any = null;
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  room.state.objects.forEach((o: any, id: string) => {
    if (found || o.kind !== "car") return;
    const props = JSON.parse(o.props || "{}");
    if (props.driven || props.role === "show" || props.retire || (props.level ?? 0) !== 0) return;
    if (!/^town-car/.test(id)) return;
    found = { id, o, props };
  });
  assert.ok(found, "a parked car on Main Street");
  const pose = parkedPose({ x: found.o.x, y: found.o.y, props: found.props });
  return {
    id: found.id,
    x: pose.x,
    y: pose.y,
    a: pose.a,
    props: () => JSON.parse(room.state.objects.get(found.id).props),
  };
}
async function armed(sandbox: number) {
  const a = await person(820 + sandbox * 2, sandbox);
  const b = await person(821 + sandbox * 2, sandbox);
  a.room.send("mod:dark", { mode: "peaceful" });
  a.room.send("mod:hour", { h: 12 });
  await waitFor(
    () => !!a.room.state.objects && [...a.room.state.objects.values()].some((o: { kind: string }) => o.kind === "car"),
  );
  b.room.send("mod:refill", { kit: true });
  await waitFor(() => b.inv?.quick[0]?.id === "revolver");
  return { a, b, car: aCar(a.room) };
}
async function draw(b: Person, slot: number, gun: string) {
  b.room.send("arms:draw", { slot });
  await waitFor(() => me(b.room).gun === gun);
  await sleep((ARMS as Record<string, { draw: number }>)[gun].draw * 1000 + 80);
}

test("struck low at its nose: the engine block stops the round — A behind it safe — and its front takes it", async () => {
  const { a, b, car } = await armed(91);
  const f = [Math.cos(car.a), Math.sin(car.a)];
  await standAt(b, car.x + f[0] * 8, car.y + f[1] * 8);
  await standAt(a, car.x - f[0] * 4.5, car.y - f[1] * 4.5);
  await draw(b, 0, "revolver");
  aim(b, car.x, car.y);
  await sleep(ARMS.revolver.rate * 1000 + 50);
  // (at the bumper's height, at the nose: on through it, toward A's knees)
  const nose = SPECS.sedan.body.ahead;
  fireAt(b, car.x + f[0] * nose, car.y + f[1] * nose, 0.55);
  await waitFor(() => b.carShots.length === 1, 4000);
  assert.equal(b.carShots[0].hits[0].struck, "engine");
  assert.equal(b.carShots[0].hits[0].face, 0, "by its front");
  await waitFor(() => a.carShots.length === 1, 2000);
  assert.equal(b.hits.length, 0, "nobody hit");
  await waitFor(() => parseDamage(car.props().dmg).zones[0] > 0, 2000);
  assert.equal(me(a.room).hp, 100);
});

test("through its side windows the round goes on: A behind it is hit, that side's glass cracked (plan 94 P3); a tyre goes flat", async () => {
  const { a, b, car } = await armed(92);
  const r = [-Math.sin(car.a), Math.cos(car.a)];
  await standAt(b, car.x + r[0] * 7, car.y + r[1] * 7);
  // (A on the pavement, between the car and the shops' wall)
  await standAt(a, car.x - r[0] * 2.5, car.y - r[1] * 2.5);
  await draw(b, 0, "revolver");
  const A = me(a.room);
  aim(b, A.x, A.y);
  await sleep(ARMS.revolver.rate * 1000 + 50);
  fireAt(b, A.x, A.y, 1.15);
  await waitFor(() => b.carShots.length === 1, 4000);
  assert.equal(b.carShots[0].hits[0].struck, "glass");
  assert.equal(b.carShots[0].hits[0].face, 3, "by its right side");
  await waitFor(() => b.hits.some((h) => h.kind === "person" && h.id === a.room.sessionId), 3000);
  // (plan 94 P3: its pane on that side cracked — the front's or the one behind, by where B is)
  await waitFor(() => !!(parseDamage(car.props().dmg).parts & (PANE_CRACK[3] | PANE_CRACK[5])), 2000);
  // a tyre: the front right, low, from where B stands
  await sleep(ARMS.revolver.rate * 1000 + 50);
  const fr = { x: car.x + Math.cos(car.a) * SPECS.sedan.front, y: car.y + Math.sin(car.a) * SPECS.sedan.front };
  aim(b, fr.x, fr.y);
  fireAt(b, fr.x, fr.y, 0.3);
  await waitFor(() => b.carShots.length === 2, 4000);
  assert.equal(b.carShots[1].hits[0].struck, "tyre");
  await waitFor(() => !!(parseDamage(car.props().dmg).parts & PART.flatFR), 2000);
});

test("from the driver's seat (plan 93 S2): the revolver out of their own window is fired; ahead through the windscreen, or the shotgun, isn't", async () => {
  const { b, car } = await armed(93);
  const f = [Math.cos(car.a), Math.sin(car.a)];
  await standAt(b, car.x + f[0] * 3.4, car.y + f[1] * 3.4);
  b.room.send("car:enter", { id: car.id, seat: 0 });
  const vid = `car:${car.id}`;
  await waitFor(() => me(b.room).busy === `drive:${vid}` && !!b.room.state.vehicles.get(vid), 6000);
  await draw(b, 0, "revolver");
  const loaded = (slot: number) => (b.inv?.quick[slot] as { loaded?: number } | null | undefined)?.loaded;
  const v = () => b.room.state.vehicles.get(vid);
  // (out of the driver's side: its left — the seat's across is −; the car's right is (−sin a, cos a))
  const shoot = (yaw: number) => {
    const m = me(b.room);
    const a = v().a;
    const out = { x: Math.sin(a), y: -Math.cos(a) };
    b.room.send("arms:fire", {
      ox: m.x + out.x * 0.6,
      oy: m.y + out.y * 0.6,
      oz: m.z + 0.75,
      yaw,
      pitch: -0.05,
      lag: 0,
      seed: 5,
    });
  };
  const a0 = v().a;
  const was = loaded(0);
  assert.equal(was, 6);
  shoot(Math.atan2(-Math.cos(a0), Math.sin(a0)));
  await waitFor(() => loaded(0) === 5, 3000);
  // straight ahead: through its own windscreen — not from a seat
  await sleep(ARMS.revolver.rate * 1000 + 80);
  shoot(a0);
  await sleep(800);
  assert.equal(loaded(0), 5, "not fired ahead");
  // the shotgun: not the driver's
  await draw(b, 1, "shotgun");
  const sg = loaded(1);
  shoot(Math.atan2(-Math.cos(a0), Math.sin(a0)));
  await sleep(800);
  assert.equal(loaded(1), sg, "not the driver's shotgun");
});

test("(plan 95 F4a) the shooter's word on where: its bonnet from ahead — the engine under it, its hole laid on the skin's way out; a round it met no car on passes over; a word far off the round's line isn't taken (the box's)", async () => {
  const { b, car } = await armed(95);
  const f = [Math.cos(car.a), Math.sin(car.a)];
  const r = [-Math.sin(car.a), Math.cos(car.a)];
  await standAt(b, car.x + f[0] * 7, car.y + f[1] * 7);
  await draw(b, 0, "revolver");
  aim(b, car.x, car.y);
  const g = heightAt(car.x, car.y);
  // (a point on its bonnet's top, in the car's frame — as a screen's ray test would give it)
  const S = SPECS.sedan;
  const u = S.body.ahead - 0.55;
  const w = 0.1;
  const h = 0.95;
  const at = { x: car.x + f[0] * u + r[0] * w, y: car.y + f[1] * u + r[1] * w };
  const bonnet: CarClaim = { id: car.id, u, w, h, f: 0, s: "engine", nu: 0, nw: 0, nh: 100 };
  await sleep(ARMS.revolver.rate * 1000 + 50);
  fireAt(b, at.x, at.y, h, [bonnet], g);
  await waitFor(() => b.carShots.length === 1, 4000);
  assert.equal(b.carShots[0].hits[0].struck, "engine", "the engine, through its bonnet");
  assert.equal(b.carShots[0].hits[0].face, 0, "its front's");
  await waitFor(() => parseHoles(car.props().holes).length === 1, 2000);
  const hole = parseHoles(car.props().holes)[0];
  assert.ok(Math.abs(hole.u - u) < 0.02 && Math.abs(hole.h - h) < 0.02, `its hole where it was struck (${car.props().holes})`);
  assert.deepEqual(hole.n, [0, 0, 1], "laid on the skin's way out: up");
  // (the same line, the screen saying it met no car: nothing struck)
  await sleep(ARMS.revolver.rate * 1000 + 50);
  fireAt(b, at.x, at.y, h, [0], g);
  await sleep(700);
  assert.equal(b.carShots.length, 1, "a round that met no car on the screen strikes none");
  // (a word for its far side's door, the round at its bonnet — a metre off its line: not taken; the box's, its
  // front's face)
  await sleep(ARMS.revolver.rate * 1000 + 50);
  fireAt(b, at.x, at.y, h, [{ id: car.id, u: 0, w: -S.body.width / 2, h: 0.7, f: 2, s: "panel" }], g);
  await waitFor(() => b.carShots.length === 2, 4000);
  assert.equal(b.carShots[1].hits[0].face, 0, "the box's: its front");
  assert.notEqual(b.carShots[1].hits[0].struck, "panel", "not the claim's");
});

test("(plan 95 F5a) the windscreen shot five times from ahead: a star kept where each went in, still in till the fifth; then in", async () => {
  const { b, car } = await armed(96);
  const f = [Math.cos(car.a), Math.sin(car.a)];
  const r = [-Math.sin(car.a), Math.cos(car.a)];
  await standAt(b, car.x + f[0] * 7, car.y + f[1] * 7);
  await draw(b, 0, "revolver");
  aim(b, car.x, car.y);
  const g = heightAt(car.x, car.y);
  const S = SPECS.sedan;
  // (points across the windscreen — as a screen's ray test would give them: its glass, pane 0)
  const u = S.front - 0.55;
  const h = 1.15;
  for (let k = 0; k < 5; k++) {
    const w = -0.45 + k * 0.22;
    const at = { x: car.x + f[0] * u + r[0] * w, y: car.y + f[1] * u + r[1] * w };
    await sleep(ARMS.revolver.rate * 1000 + 60);
    fireAt(b, at.x, at.y, h, [{ id: car.id, u, w, h, f: 0, s: "glass", p: 0, nu: 70, nw: 0, nh: 70 }], g);
    await waitFor(() => b.carShots.length === k + 1, 4000);
    assert.equal(b.carShots[k].hits[0].struck, "glass");
    await waitFor(() => parseHoles(car.props().holes).filter((x) => x.pane === 0).length === k + 1, 2000);
    const dm = parseDamage(car.props().dmg);
    assert.ok(dm.parts & PART.screen, "starred");
    if (k < 4) assert.equal(dm.parts & PART.screenGone, 0, `still in after ${k + 1}`);
    else assert.ok(dm.parts & PART.screenGone, "in at the fifth");
  }
  const stars = parseHoles(car.props().holes);
  assert.ok(stars.every((x) => x.pane === 0 && Math.abs(x.u - u) < 0.02 && x.n), "each where it went in, its normal kept");
});

test("(plan 96 F4a, F4b) a door shot off: one shotgun blast into it — each pellet a round — and it hangs; two revolver rounds more, it's off", async () => {
  const { b, car } = await armed(97);
  const f = [Math.cos(car.a), Math.sin(car.a)];
  const r = [-Math.sin(car.a), Math.cos(car.a)];
  const S = SPECS.sedan;
  // (its right front door's skin, from 4 m off its side)
  const u = -0.2;
  const w = S.body.width / 2;
  const h = 0.7;
  const at = { x: car.x + f[0] * u + r[0] * w, y: car.y + f[1] * u + r[1] * w };
  await standAt(b, car.x + f[0] * u + r[0] * 4, car.y + f[1] * u + r[1] * 4);
  const g = heightAt(car.x, car.y);
  const door: CarClaim = { id: car.id, u, w, h, f: 3, s: "panel", part: "door_fr", nu: 0, nw: 100, nh: 0 };
  const wreck = () => parseDamage(car.props().dmg).wreck;
  await draw(b, 1, "shotgun");
  aim(b, at.x, at.y);
  await sleep(300);
  fireAt(b, at.x, at.y, h, Array(8).fill(door), g);
  await waitFor(() => b.carShots.length === 1, 4000);
  await waitFor(() => (wreck() & DOOR_HANG[1]) !== 0, 2000);
  assert.equal(wreck() & DOOR_GONE[1], 0, "hanging, not off, at 8");
  assert.equal(parseHoles(car.props().holes).filter((x) => x.part === "door_fr").length, 8, "eight rounds in it");
  await draw(b, 0, "revolver");
  aim(b, at.x, at.y);
  for (let k = 0; k < 2; k++) {
    await sleep(ARMS.revolver.rate * 1000 + 60);
    fireAt(b, at.x, at.y, h, [door], g);
    await waitFor(() => b.carShots.length === 2 + k, 4000);
  }
  await waitFor(() => (wreck() & DOOR_GONE[1]) !== 0, 2000);
});
