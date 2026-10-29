import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { GROUND_OFFSET, ROOM_NAME } from "@yutopia/shared";
import { CHUNK, editsNow, heightAt } from "@yutopia/shared/grounds";
import { encodeHeights, type GroundsEdits } from "@yutopia/shared/grounds-edits";
import { Client, type Room } from "colyseus.js";

// God mode on the world server (docs/plan/53-the-god-mode.md, phase 3): a member's publish is
// dropped, a draft that breaks the rule book is refused with why, an admin's is laid — the room's
// revision moves, whoever stands where the land rose is lifted onto it and told, a late joiner
// gets the edits — and a roll back is a revision of its own. A draft's published by its id, the
// admin's own (docs/plan/55-the-drafts.md). (Offline: the drafts kept in the server, as the API
// would.)
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27400 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
// (the server's own copy, imported after the env above: config reads it on import)
let offlineDrafts: typeof import("./features/godmode.ts").offlineDrafts;
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
  ({ offlineDrafts } = await import("./features/godmode.ts"));
});
after(async () => {
  const bounded = <T>(p: Promise<T>) => Promise.race([p, sleep(1000)]);
  await Promise.all(rooms.map((r) => bounded(r.leave(true).catch(() => {}))));
  await bounded(server.gracefullyShutdown(false));
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});
async function waitFor(fn: () => boolean, ms = 10_000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}

// the farm's open field south of the farmhouse: chunk (13, −8), lifted 3 m all over
const FIELD = { x: 446.5, z: -238.5 };
const N = CHUNK * 2 + 1;
const RAISED: GroundsEdits = { rev: 0, height: { "13,-8": encodeHeights(new Int16Array(N * N).fill(300)) } };

async function join(uid: number, roles: string) {
  const room: Room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 5301,
    token: `dev:${uid}:P${uid}:${roles}`,
  });
  rooms.push(room);
  const said: { type: string; msg: Record<string, unknown> }[] = [];
  room.onMessage("*", (type, msg) => said.push({ type: String(type), msg }));
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  const me = () => room.state.players.get(room.sessionId);
  return { room, said, me };
}
const ADMIN = "member,builder,admin";
const MEMBER = "member,builder";

test("a member's publish is dropped; a draft against the rules refused, with why", async () => {
  const m = await join(31, MEMBER);
  offlineDrafts.set(31, { userId: 31, name: "Mine", baseRev: 0, data: RAISED });
  m.room.send("god:publish", { draftId: 31 });
  m.room.send("god:rollback", { rev: 0 });
  await sleep(600);
  assert.equal(m.room.state.groundsRev, 0);
  assert.ok(!m.said.some((s) => s.type.startsWith("god:")), "nothing said back to a member");

  const a = await join(32, ADMIN);
  // (someone else's draft, and none: refused)
  a.room.send("god:publish", { draftId: 31 });
  await waitFor(() => a.said.some((s) => s.type === "god:refused"));
  a.room.send("god:publish", {});
  await waitFor(() => a.said.filter((s) => s.type === "god:refused").length === 2);
  assert.equal(offlineDrafts.has(31), true, "not theirs: kept");
  a.said.length = 0;
  offlineDrafts.set(320, { userId: 32, name: "No road", baseRev: 0, data: { rev: 0, ways: { remove: ["road"] } } });
  a.room.send("god:publish", { draftId: 320 });
  await waitFor(() => a.said.some((s) => s.type === "god:refused"));
  const no = a.said.find((s) => s.type === "god:refused")?.msg as { problems: string[] };
  assert.ok(
    no.problems.some((p) => /Can't take away road/.test(p)),
    no.problems.join("; "),
  );
  offlineDrafts.set(320, { userId: 32, name: "Old", baseRev: 7, data: RAISED });
  a.room.send("god:publish", { draftId: 320 });
  await waitFor(() => a.said.filter((s) => s.type === "god:refused").length === 2);
  assert.equal(a.room.state.groundsRev, 0);
});

test("an admin's publish laid: the revision moves, the one standing there lifted onto the land", async () => {
  const a = await join(33, ADMIN);
  const to = { x: FIELD.x - GROUND_OFFSET.x, y: FIELD.z - GROUND_OFFSET.y, level: 0 };
  a.room.send("teleport", { to });
  await waitFor(() => a.me().level === 0 && Math.hypot(a.me().x - to.x, a.me().y - to.y) < 0.6);
  await sleep(1100);
  const was = heightAt(FIELD.x, FIELD.z);
  a.said.length = 0;
  offlineDrafts.set(330, { userId: 33, name: "The field", baseRev: 0, data: RAISED });
  offlineDrafts.set(331, { userId: 33, name: "Another", baseRev: 0, data: { rev: 0 } });
  a.room.send("god:publish", { draftId: 330, note: "The field raised" });
  await waitFor(() => a.said.some((s) => s.type === "god:published"));
  assert.deepEqual([offlineDrafts.has(330), offlineDrafts.has(331)], [false, true], "that draft gone, the other kept");
  // (the message comes at once, the room's revision with its next patch)
  await waitFor(() => a.room.state.groundsRev === 1);
  assert.equal(editsNow().rev, 1);
  assert.ok(Math.abs(heightAt(FIELD.x, FIELD.z) - was - 3) < 0.02, "the land 3 m up");
  const snap = a.said.find((s) => s.type === "snap")?.msg as { z: number } | undefined;
  assert.ok(snap && Math.abs(snap.z - (was + 3)) < 0.1, `lifted onto it: ${snap?.z}`);
  assert.ok(a.said.some((s) => s.type === "toast" && /ground shifts/.test(String(s.msg.text))));
  // a late joiner gets what's laid
  const late = await join(34, MEMBER);
  await waitFor(() => late.said.some((s) => s.type === "god:edits"));
  assert.equal((late.said.find((s) => s.type === "god:edits")?.msg as unknown as GroundsEdits).rev, 1);
});

test("rolled back to none: a revision of its own, the land as generated", async () => {
  const a = await join(35, ADMIN);
  a.room.send("god:rollback", { rev: 5 });
  await waitFor(() => a.said.some((s) => s.type === "god:refused"));
  a.room.send("god:rollback", { rev: 0 });
  await waitFor(() => a.room.state.groundsRev === 2);
  assert.equal(editsNow().rev, 2);
  assert.equal(editsNow().height, undefined);
});

test("god mode: a member can't go in; an admin's body marked building, on foot walking the draft, out", async () => {
  const m = await join(36, MEMBER);
  m.room.send("god:enter", {});
  await sleep(400);
  assert.equal(m.me().busy, "");
  const a = await join(37, ADMIN);
  a.room.send("god:enter", {});
  await waitFor(() => a.me().busy === "god");
  // (the member sees it: the room's state)
  await waitFor(() => m.room.state.players.get(a.room.sessionId)?.busy === "god");
  a.room.send("god:walk", { on: true });
  await waitFor(() => a.me().busy === "");
  a.room.send("god:walk", { on: false });
  await waitFor(() => a.me().busy === "god");
  a.room.send("god:leave", {});
  await waitFor(() => a.me().busy === "");
  // (walking without being in: nothing)
  a.room.send("god:walk", { on: false });
  await sleep(300);
  assert.equal(a.me().busy, "");
});

test("a building published over someone: they're moved out of it, by its nearest wall, and told", async () => {
  const a = await join(38, ADMIN);
  const to = { x: FIELD.x - GROUND_OFFSET.x, y: FIELD.z - GROUND_OFFSET.y, level: 0 };
  a.room.send("teleport", { to });
  await waitFor(() => a.me().level === 0 && Math.hypot(a.me().x - to.x, a.me().y - to.y) < 0.6);
  await sleep(1100);
  a.said.length = 0;
  const rev = a.room.state.groundsRev;
  // (a house 12 × 10 round where they stand, 2 m off its west wall's middle… nearer its west)
  const x0 = Math.round(FIELD.x - 2);
  const z0 = Math.round(FIELD.z - 5);
  offlineDrafts.set(380, {
    userId: 38,
    name: "A house",
    baseRev: rev,
    data: {
      rev,
      buildings: {
        add: [
          {
            key: "god-building-1",
            kind: "house",
            name: "Field House",
            x0,
            z0,
            x1: x0 + 12,
            z1: z0 + 10,
            floors: 1,
            face: "e",
          },
        ],
      },
    },
  });
  a.room.send("god:publish", { draftId: 380, note: "a house on someone" });
  await waitFor(() => a.said.some((s) => s.type === "god:published"));
  const snap = a.said.find((s) => s.type === "snap")?.msg as { x: number; y: number } | undefined;
  assert.ok(snap, "set down somewhere");
  const gx = snap.x + GROUND_OFFSET.x;
  const gz = snap.y + GROUND_OFFSET.y;
  assert.ok(Math.abs(gz - FIELD.z) < 0.5, "along the wall from where they stood");
  assert.ok(gx < x0 && x0 - gx < 1.5, `out by the west wall: ${gx} (the wall at ${x0})`);
  assert.ok(a.said.some((s) => s.type === "toast" && /Field House stands here now/.test(String(s.msg.text))));
});
