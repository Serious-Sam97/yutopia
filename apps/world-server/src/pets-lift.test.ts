import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { findPath, ROOM_NAME } from "@yutopia/shared";
import { Client, type Room } from "colyseus.js";

// The lift (docs/plan/52-the-pet-two.md, item 8 / D1): a dog following its owner into car A rides with
// them, in the car, at its height — no hops floor to floor in the corridors — and arrives where it can
// walk to them (it used to land behind the lift and stay there); the same back up. Shut in somewhere
// it can't get out of, it's put back at its owner's side.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27380 + Math.floor(Math.random() * 100);
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
async function waitFor(fn: () => boolean, ms = 6000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error(`timeout: ${fn.toString().slice(0, 90)}`);
    await sleep(25);
  }
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
type S = any;

test("a dog following into the lift rides down and up in the car with its owner, and walks out with her", async () => {
  const { WorldRoom } = await import("./WorldRoom.ts");
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9701,
    token: "dev:95:P95:member,builder",
  });
  rooms.push(r);
  r.onMessage("*", () => {});
  const me = (): S => r.state?.players?.get(r.sessionId);
  await waitFor(() => !!me(), 8000);
  r.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => r.state.pets?.size === 1);
  const pet = (): S => [...r.state.pets.values()][0];
  // the room's own view: can it walk to her from where it is?
  const reaches = () => {
    const room = WorldRoom.current;
    const p = me();
    if (!room) return false;
    const g = room.gridFor(95, p.level);
    return pet().floor === p.level && !!findPath(g, pet(), { x: p.x, y: p.y });
  };
  let seq = 0;
  const step = async (path: [number, number][], level = 4) => {
    let at = { x: me().x, y: me().y };
    for (const [x, y] of path) {
      await sleep(Math.max(55, (Math.hypot(x - at.x, y - at.y) / 4.5) * 1000));
      r.send("pos", { x, y, z: 0, l: level, d: 0, a: 1, seq: ++seq });
      at = { x, y };
    }
    await sleep(150);
  };
  const stop = (level: number) =>
    [...r.state.objects.values()].find(
      (o: S) => o.kind === "elevator" && JSON.parse(o.props).shaft === "A" && JSON.parse(o.props).level === level,
    ) as S;
  // to car A's doors with him, called, in
  await step([
    [6.8, 28.2],
    [7.2, 27.8],
    [8.0, 28.2],
    [8.8, 28.5],
  ]);
  r.send("lift:call", { id: stop(4).id });
  await waitFor(() => JSON.parse(stop(4).props).door === "open");
  await step([
    [8.9, 29],
    [9, 29.6],
    [9, 30],
  ]);
  await sleep(300);
  // down: he's in the car with her all the way, at its height — never in a corridor
  r.send("lift:go", { id: stop(4).id, level: 0 });
  await waitFor(() => JSON.parse(stop(4).props).ph === "moving");
  await waitFor(() => pet().ride === "lift", 2000);
  const t = Date.now();
  let samples = 0;
  while (Date.now() - t < 12_000) {
    const p = pet();
    if (p.ride === "lift") {
      samples++;
      assert.equal(p.floor, me().level, "on her floor");
      assert.ok(Math.hypot(p.x - me().x, p.y - me().y) < 1, "beside her, in the car");
      assert.ok(Math.abs(p.z - me().z) < 0.01, "at the car's height");
    }
    if (me().level > 0) r.send("pos", { x: 9, y: 26, z: 0, l: me().level, d: 0, a: 1, seq: ++seq });
    if (me().level === 0 && JSON.parse(stop(0).props).door === "open") break;
    await sleep(60);
  }
  assert.ok(samples > 10, `in the car on the way (${samples})`);
  // there: out of the ride, on her floor, a way to her (not behind the lift)
  await waitFor(() => pet().ride === "" && pet().floor === 0);
  assert.equal(pet().z, 0);
  assert.ok(reaches(), `a way to her from ${pet().x},${pet().y}`);
  // she walks out into the lobby: he follows
  const out = { x: me().x, y: me().y - 4 };
  await step([[out.x, out.y]], 0);
  await waitFor(() => Math.hypot(pet().x - me().x, pet().y - me().y) < 3.5, 10_000);
  // and back up: in the car again, out with her on floor 4
  await step([[out.x, out.y + 4]], 0);
  r.send("lift:call", { id: stop(0).id });
  await waitFor(() => JSON.parse(stop(0).props).door === "open");
  await sleep(1500);
  r.send("lift:go", { id: stop(0).id, level: 4 });
  await waitFor(() => JSON.parse(stop(0).props).ph === "moving");
  await waitFor(() => pet().ride === "lift", 2000);
  await waitFor(() => me().level === 4 && JSON.parse(stop(4).props).door === "open", 15_000);
  await waitFor(() => pet().ride === "" && pet().floor === 4);
  assert.ok(reaches(), "a way to her up there too");
  r.send("pet:release", { id: pet().id });
});

test("shut in where it can't get to its owner: put back at their side", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9702,
    token: "dev:96:P96:member,builder",
  });
  rooms.push(r);
  r.onMessage("*", () => {});
  const me = (): S => r.state?.players?.get(r.sessionId);
  await waitFor(() => !!me(), 8000);
  // out in the lot (the ground floor), the dog with her
  r.send("teleport", { to: { x: 40, y: 22, level: 0 } });
  await waitFor(() => me().level === 0);
  r.send("pet:adopt", { species: "dog", name: "Bo" });
  await waitFor(() => r.state.pets?.size === 1);
  const pet = (): S => [...r.state.pets.values()][0];
  // set down inside a parked car's body (no way out of it)
  const car: S = [...r.state.objects.values()].find((o: S) => o.kind === "car" && !JSON.parse(o.props).driven);
  r.send("pet:test", { id: pet().id, at: { x: car.x + 1, y: car.y + 1 } });
  await waitFor(() => Math.hypot(pet().x - car.x - 1, pet().y - car.y - 1) < 0.2);
  await waitFor(() => Math.hypot(pet().x - me().x, pet().y - me().y) < 2.5, 12_000);
  r.send("pet:release", { id: pet().id });
});

test("up or down on foot: it goes where she left the floor first, then comes along; in front of her, it steps aside", async () => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 9703,
    token: "dev:97:P97:member,builder",
  });
  rooms.push(r);
  r.onMessage("*", () => {});
  const me = (): S => r.state?.players?.get(r.sessionId);
  await waitFor(() => !!me(), 8000);
  r.send("pet:adopt", { species: "dog", name: "Cy" });
  await waitFor(() => r.state.pets?.size === 1);
  const pet = (): S => [...r.state.pets.values()][0];
  // in the lobby (floor 4's), the dog beside her
  r.send("teleport", { to: { x: 6.5, y: 24.5 } });
  await waitFor(() => Math.hypot(me().x - 6.5, me().y - 24.5) < 2.5);
  await waitFor(() => Math.hypot(pet().x - me().x, pet().y - me().y) < 3, 10_000);
  // she walks off towards car A (the lift test's way) and goes down a floor at once: he goes to
  // where she left first
  let seq = 0;
  const lvl = me().level;
  const B = { x: 8.8, y: 28.5 };
  for (const [x, y] of [
    [6.8, 28.2],
    [7.2, 27.8],
    [8.0, 28.2],
    [8.8, 28.5],
  ]) {
    r.send("pos", { x, y, z: 0, l: lvl, d: 0, a: 1, seq: ++seq });
    await sleep(260);
  }
  await waitFor(() => Math.hypot(me().x - B.x, me().y - B.y) < 0.5);
  r.send("teleport", { to: { x: 6.5, y: 24.5, level: lvl - 1 } });
  await waitFor(() => me().level === lvl - 1);
  let lastUp = { x: pet().x, y: pet().y };
  const t = Date.now();
  while (pet().floor === lvl && Date.now() - t < 9000) {
    lastUp = { x: pet().x, y: pet().y };
    await sleep(50);
  }
  assert.equal(pet().floor, lvl - 1, "came along");
  assert.ok(Math.hypot(lastUp.x - B.x, lastUp.y - B.y) < 2, `left from where she did: ${lastUp.x},${lastUp.y}`);
  assert.ok(Math.hypot(pet().x - me().x, pet().y - me().y) < 3, "beside her down there");
  // right in front of her (where she faces): it steps aside
  r.send("teleport", { to: { x: 40, y: 22, level: 0 } });
  await waitFor(() => me().level === 0);
  await waitFor(() => pet().floor === 0 && Math.hypot(pet().x - me().x, pet().y - me().y) < 3, 10_000);
  r.send("pos", { x: me().x, y: me().y, z: 0, l: 0, d: 0, a: 0, seq: ++seq });
  await sleep(300);
  // (FACING[0]: +x +y)
  r.send("pet:test", { id: pet().id, at: { x: me().x + 0.7, y: me().y + 0.7 } });
  const ahead = () => {
    const ax = pet().x - me().x;
    const ay = pet().y - me().y;
    return { along: (ax + ay) / Math.SQRT2, across: Math.abs(ax - ay) / Math.SQRT2 };
  };
  await waitFor(() => ahead().along > 0.8 && ahead().across < 0.3, 2000);
  await waitFor(() => ahead().along <= 0.4 || ahead().across >= 0.6, 6000);
  r.send("pet:release", { id: pet().id });
});
