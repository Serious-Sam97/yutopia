import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { POWERS } from "@yutopia/shared/admin";
import { Client, type Room } from "colyseus.js";

// Run the place (docs/plan/48-the-admin.md): an admin's powers and moderation are theirs alone —
// a member sending the same messages changes nothing — and the powers really let them move:
// a flier's move high up is taken where a walker's is put back.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27200 + Math.floor(Math.random() * 100);
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
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

let n = 0;
// one sandbox each test; someone in it out in the car park at (30.5, y)
async function join(sandbox: number, uid: number, roles: string, y = 30.5) {
  const room: Room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${uid}:P${uid}:${roles}`,
  });
  rooms.push(room);
  const said: { type: string; msg: Record<string, unknown> }[] = [];
  const snaps: { x: number; y: number; z?: number }[] = [];
  room.onMessage("snap", (m) => snaps.push(m));
  room.onMessage("*", (type, msg) => said.push({ type: String(type), msg }));
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  room.send("teleport", { to: { x: 30.5, y, level: 0 } });
  const me = () => room.state.players.get(room.sessionId);
  await waitFor(() => me().level === 0 && Math.abs(me().y - y) < 0.6);
  await sleep(1100); // (the teleport's snap: what was sent before it is let go for a second)
  snaps.length = 0;
  return { room, said, snaps, me, uid };
}
const ADMIN = "member,builder,admin";
const MEMBER = "member,builder";
const sandbox = () => 4600 + ++n;

test("a member's powers and moderation are refused; an admin's are taken", async () => {
  const s = sandbox();
  const ana = await join(s, 1, ADMIN, 30.5);
  const bia = await join(s, 2, MEMBER, 34.5);
  bia.room.send("mod:power", { power: "fly", on: true });
  bia.room.send("mod:freeze", { userId: 1, minutes: 5 });
  bia.room.send("mod:notice", { text: "not from a member" });
  ana.room.send("mod:power", { power: "fly", on: true });
  ana.room.send("mod:power", { power: "hidden", on: true });
  await waitFor(() => ana.me().powers === (POWERS.fly | POWERS.hidden));
  await sleep(300);
  assert.equal(bia.me().powers, 0, "no powers for a member");
  assert.equal(ana.me().frozenUntil, 0, "a member can't hold anyone still");
  assert.ok(!ana.said.some((m) => m.type === "toast" && m.msg.text === "not from a member"), "no member's notice");
  ana.room.send("mod:power", { power: "hidden", on: false });
  ana.room.send("mod:power", { power: "nonsense", on: true });
  await waitFor(() => ana.me().powers === POWERS.fly);
});

test("flying: a move 8 tiles up is taken — for a flier, and (no put-backs) for anyone", async () => {
  const s = sandbox();
  const ana = await join(s, 11, ADMIN, 30.5);
  const bia = await join(s, 12, MEMBER, 34.5);
  ana.room.send("mod:power", { power: "fly", on: true });
  await waitFor(() => ana.me().powers === POWERS.fly);
  const up = (who: typeof ana, mt: number) =>
    who.room.send("pos", { x: who.me().x, y: who.me().y, z: 8, l: 0, d: 0, a: 0, mv: 0, yaw: 0, pitch: 0, mt });
  up(ana, 200_000);
  up(bia, 200_000);
  await sleep(400);
  assert.ok(Math.abs(ana.me().z - 8) < 0.01, `the flier is up there (${ana.me().z})`);
  assert.equal(ana.snaps.length, 0, "and not put back");
  assert.ok(Math.abs(bia.me().z - 8) < 0.01, "the walker too: taken as sent");
  assert.equal(bia.snaps.length, 0, "nobody put back");
});

test("held still: every move put back till it's over; a notice reaches everyone", async () => {
  const s = sandbox();
  const ana = await join(s, 21, ADMIN, 30.5);
  const bia = await join(s, 22, MEMBER, 34.5);
  ana.room.send("mod:freeze", { userId: 22, minutes: 5 });
  await waitFor(() => bia.me().frozenUntil > Date.now());
  const y = bia.me().y;
  bia.room.send("pos", { x: bia.me().x, y: y + 0.2, z: 0, l: 0, d: 0, a: 1, mv: 2, yaw: 0, pitch: 0, mt: 300_050 });
  await sleep(300);
  assert.ok(Math.abs(bia.me().y - y) < 0.01, "didn't move");
  assert.ok(bia.snaps.length > 0, "put back");
  assert.ok(bia.said.some((m) => m.type === "toast" && /holding you still/.test(String(m.msg.text))));
  ana.room.send("mod:freeze", { userId: 22, minutes: 0 });
  await waitFor(() => bia.me().frozenUntil === 0);
  ana.room.send("mod:notice", { text: "  The server   restarts at 18:00  " });
  await waitFor(() => bia.said.some((m) => m.type === "toast" && m.msg.text === "The server restarts at 18:00"));
});

test("brought here, then removed for an hour, then let back in", async () => {
  const s = sandbox();
  const ana = await join(s, 31, ADMIN, 30.5);
  const bia = await join(s, 32, MEMBER, 40.5);
  ana.room.send("mod:bring", { userId: 32 });
  await waitFor(() => Math.hypot(bia.me().x - ana.me().x, bia.me().y - ana.me().y) < 2.5);
  ana.room.send("mod:kick", { userId: 32, minutes: 60 });
  await waitFor(() =>
    ana.said.some(
      (m) =>
        m.type === "admin:removed" &&
        (m.msg.list as { uid: number; until: number }[]).some(
          (r) => r.uid === 32 && r.until > Date.now() + 50 * 60_000,
        ),
    ),
  );
  await assert.rejects(join(s, 32, MEMBER), "can't come back while removed");
  ana.room.send("mod:unremove", { userId: 32 });
  await waitFor(() => ana.said.some((m) => m.type === "admin:removed" && (m.msg.list as unknown[]).length === 0));
  const again = await join(s, 32, MEMBER);
  assert.ok(again.me(), "back in");
});

test("height counts: no high-five with a flier up there, either way; back down, it lands", async () => {
  const s = sandbox();
  const ana = await join(s, 41, ADMIN, 30.5);
  const bia = await join(s, 42, MEMBER, 31.5);
  ana.room.send("mod:power", { power: "fly", on: true });
  await waitFor(() => ana.me().powers === POWERS.fly);
  const at = (z: number, mt: number) =>
    ana.room.send("pos", { x: ana.me().x, y: ana.me().y, z, l: 0, d: 0, a: 0, mv: 0, yaw: 0, pitch: 0, mt });
  at(6, 400_000);
  await waitFor(() => ana.me().z > 5);
  bia.room.send("social", { to: ana.room.sessionId, act: "highfive" });
  await sleep(300);
  ana.room.send("social", { to: bia.room.sessionId, act: "fistbump" });
  await sleep(300);
  assert.equal(bia.me().act, "", "no high-five up to her");
  assert.equal(ana.me().act, "", "no fist bump down from her");
  bia.room.send("social", { to: ana.room.sessionId, act: "wave" });
  await waitFor(() => bia.me().act === "wave");
  at(0, 401_000);
  await waitFor(() => ana.me().z < 0.5);
  // (one at a time: her wave over first)
  await waitFor(() => bia.me().act === "" && ana.me().act === "");
  ana.room.send("social", { to: bia.room.sessionId, act: "highfive" });
  await waitFor(() => ana.me().act === "highfive");
});
