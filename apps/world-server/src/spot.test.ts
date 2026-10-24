import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { bayById, lotLayout, ROOM_NAME } from "@yutopia/shared";
import { parkedPose } from "@yutopia/shared/car";
import { Client, type Room } from "colyseus.js";

// Someone's own bay (docs/plan/43-the-spot.md, phase 1): claimed standing in it, the board up for
// everyone; someone else's not taken; one each; given up; a marked bay never; a pool car moved
// out of a claimed bay and never put back into one.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 26270 + Math.floor(Math.random() * 100);
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
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const me = (room: Room): any => room.state.players.get(room.sessionId);
const OFF = { x: -60, y: -10 };
const props = (o: { props: string }) => JSON.parse(o.props) as Record<string, unknown>;
const join = async (uid: number) => {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 13,
    token: `dev:${uid}:P${uid}:member,builder`,
  });
  rooms.push(r);
  await waitFor(() => r.state.players?.size > 0 && r.state.objects?.size > 0);
  return r;
};
/** Into a bay (its id), at `at` along it from its middle towards the aisle (0: the middle). */
const into = async (r: Room, bay: string, at = 0) => {
  const b = bayById(lotLayout(), bay);
  assert.ok(b, bay);
  const to = { x: b.x + b.dir * at - OFF.x, y: b.z - OFF.y, level: 0 };
  r.send("teleport", { to });
  await waitFor(() => me(r).level === 0 && Math.hypot(me(r).x - to.x, me(r).y - to.y) < 0.6);
};
const noes = (r: Room) => {
  const out: string[] = [];
  r.onMessage("spot:no", (m: { why: string }) => out.push(m.why));
  return out;
};

test("a bay claimed standing in it, someone else's not, one each, given up; a marked one never", async () => {
  const a = await join(51);
  const b = await join(52);
  const noA = noes(a);
  const noB = noes(b);
  await into(a, "d-05");
  a.send("spot:claim", { bay: "d-05" });
  await waitFor(() => !!b.state.objects.get("bay-d-05"));
  const o = b.state.objects.get("bay-d-05");
  assert.equal(o.kind, "bayboard");
  assert.equal(props(o).ownerId, 51);
  assert.equal(props(o).ownerName, "P51");
  assert.equal(props(o).level, 0);
  // someone else's: not taken from them, nor taken down
  await into(b, "d-05");
  b.send("spot:claim", { bay: "d-05" });
  b.send("spot:free", { bay: "d-05" });
  await waitFor(() => noB.length >= 2);
  assert.deepEqual(noB, ["taken", "taken"]);
  assert.equal(props(a.state.objects.get("bay-d-05")).ownerId, 51);
  // from afar: no
  a.send("spot:claim", { bay: "d-13" });
  await waitFor(() => noA.length >= 1);
  assert.equal(noA[0], "far");
  // one each: another moves the board
  await into(a, "d-04");
  a.send("spot:claim", { bay: "d-04" });
  await waitFor(() => !!a.state.objects.get("bay-d-04") && !a.state.objects.get("bay-d-05"));
  // a visitors' bay: never
  const visitor = lotLayout().bays.find((x) => x.kind === "visitor");
  assert.ok(visitor);
  const vid = `${visitor.row === "e" ? "d" : "?"}-${String(visitor.slot).padStart(2, "0")}`;
  await into(b, vid);
  b.send("spot:claim", { bay: vid });
  await waitFor(() => noB.length >= 3);
  assert.equal(noB[2], "kind");
  // given up
  a.send("spot:free", { bay: "d-04" });
  await waitFor(() => !a.state.objects.get("bay-d-04"));
});

test("a pool car in a claimed bay is moved out, and the lot put back leaves the bay to its owner", async () => {
  const a = await join(53);
  const l = lotLayout();
  // the bay a seeded car is in (car-0's), claimed from its aisle end
  const c = l.cars[0];
  const bay = l.bays.find((x) => x.x === c.x && Math.abs(x.z - c.z) < 1);
  assert.ok(bay);
  const id = `${{ w: "a", "mid-w": "b", "mid-e": "c", e: "d" }[bay.row]}-${String(bay.slot).padStart(2, "0")}`;
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const cars = () => [...a.state.objects.values()].filter((o: any) => o.kind === "car");
  const inBay = (o: { x: number; y: number; rot: number; props: string }) => {
    const p = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
    return Math.abs(p.x + OFF.x - bay.x) < 1.6 && Math.abs(p.y + OFF.y - bay.z) < 1.2;
  };
  assert.ok(cars().some(inBay), "a car in it to begin with");
  await into(a, id, l.bayL / 2 + 0.2);
  a.send("spot:claim", { bay: id });
  await waitFor(() => !!a.state.objects.get(`bay-${id}`));
  // the lot put back (the tow's own way): car-0 not in its old bay, nobody's car in the claimed one
  a.send("mod:cars", {});
  await waitFor(() => !cars().some(inBay), 8000);
  assert.ok(
    cars().some((o: { id: string }) => o.id === "car-0"),
    "car-0 is still about",
  );
});

test("the dealer: your own beside you in the collection bay, its plate; one each; the show cars not driven", async () => {
  const a = await join(54);
  const noA: string[] = [];
  a.onMessage("car:no", (m: { why: string }) => noA.push(m.why));
  const bought: string[] = [];
  a.onMessage("car:bought", (m: { id: string }) => bought.push(m.id));
  // far from MOTORS (in the lot): no
  await into(a, "d-03");
  a.send("car:buy", { model: "sedan", colour: 1, plate: "x" });
  await waitFor(() => noA.length >= 1);
  assert.equal(noA[0], "far");
  // on its forecourt (the building's coords; the ground floor's are OFF from them)
  const to = { x: 512 - OFF.x, y: -393.5 - OFF.y, level: 0 };
  a.send("teleport", { to });
  await waitFor(() => me(a).level === 0 && Math.hypot(me(a).x - to.x, me(a).y - to.y) < 1);
  a.send("car:buy", { model: "hovercraft", colour: 1, plate: "" });
  await waitFor(() => noA.length >= 2);
  assert.equal(noA[1], "model");
  a.send("car:buy", { model: "sedan", colour: 1, plate: "ana.86!" });
  await waitFor(() => bought.length >= 1 && !!a.state.objects.get(bought[0]));
  const o = a.state.objects.get(bought[0]);
  assert.ok(o, "it's there");
  const p = props(o);
  assert.equal(p.ownerId, 54);
  assert.equal(p.plate, "ANA·86");
  assert.equal(p.variant, 1);
  assert.equal(p.fuel, 1);
  const pose = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: p });
  assert.ok(Math.hypot(pose.x + OFF.x - 523.8, pose.y + OFF.y + 389.6) < 0.6, "in the collection bay");
  // another: the first retired (not got into), the new one by them
  a.send("car:buy", { model: "offroad", colour: 7, plate: "" });
  await waitFor(() => bought.length >= 2 && !!a.state.objects.get(bought[1]));
  await waitFor(() => !!props(a.state.objects.get(bought[0])).retire);
  assert.ok(props(a.state.objects.get(bought[0])).retire, "the old one retired");
  const o2 = a.state.objects.get(bought[1]);
  assert.equal(props(o2).model, "offroad");
  assert.equal(props(o2).plate, "P54");
  // a vehicle on show: never driven
  const show = a.state.objects.get("motors-sedan");
  assert.ok(show, "MOTORS' sedan on show");
  const sp = parkedPose({ x: show.x, y: show.y, rot: show.rot, props: props(show) });
  a.send("teleport", { to: { x: sp.x + 1.5, y: sp.y - 2, level: 0 } });
  await sleep(300);
  a.send("car:enter", { id: "motors-sedan", seat: 0 });
  await waitFor(() => noA.length >= 3);
  assert.ok(["show", "far"].includes(noA[2]));
  assert.notEqual(me(a).busy, "drive:car:motors-sedan");
});

test("the keys: only the owner drives, anyone rides; lent, the borrower drives; taken back, not again", async () => {
  const a = await join(57);
  const b = await join(58);
  const noB: { why: string; who?: string }[] = [];
  b.onMessage("car:no", (m: { why: string; who?: string }) => noB.push(m));
  const keys: { lent: boolean; why?: string }[] = [];
  b.onMessage("car:keys", (m: { lent: boolean; why?: string }) => keys.push(m));
  // Ana's own, from MOTORS
  const bought: string[] = [];
  a.onMessage("car:bought", (m: { id: string }) => bought.push(m.id));
  const at = { x: 512 - OFF.x, y: -393.5 - OFF.y, level: 0 };
  a.send("teleport", { to: at });
  await waitFor(() => me(a).level === 0 && Math.hypot(me(a).x - at.x, me(a).y - at.y) < 1);
  a.send("car:buy", { model: "sedan", colour: 2, plate: "P57" });
  await waitFor(() => bought.length >= 1 && !!a.state.objects.get(bought[0]));
  const id = bought[0];
  const o = b.state.objects.get(id);
  const pose = parkedPose({ x: o.x, y: o.y, rot: o.rot, props: props(o) });
  // beside it, on its west side (its east is the forecourt's rail)
  const side = [1, -1].map((s) => ({ x: pose.x - Math.sin(pose.a) * 2.3 * s, y: pose.y + Math.cos(pose.a) * 2.3 * s }));
  const door = side.sort((p, q) => p.x - q.x)[0];
  b.send("teleport", { to: { ...door, level: 0 } });
  await waitFor(() => me(b).level === 0 && Math.hypot(me(b).x - door.x, me(b).y - door.y) < 1.2);
  // the wheel: not hers
  b.send("car:enter", { id, seat: 0 });
  await waitFor(() => noB.length >= 1);
  assert.equal(noB[0].why, "owned");
  assert.equal(noB[0].who, "P57");
  // beside: anyone
  b.send("car:enter", { id, seat: 1 });
  await waitFor(() => me(b).busy === `ride:car:car:${id}`);
  b.send("car:leave", {});
  await waitFor(() => me(b).busy === "");
  await waitFor(() => !props(b.state.objects.get(id)).driven);
  // lent: hers to drive
  a.send("car:lend", { to: 58 });
  await waitFor(() => keys.length >= 1);
  assert.equal(keys[0].lent, true);
  await waitFor(() => props(a.state.objects.get(id)).lentTo === 58);
  b.send("car:enter", { id, seat: 0 });
  await waitFor(() => me(b).busy === `drive:car:${id}`);
  b.send("car:leave", {});
  await waitFor(() => me(b).busy === "");
  await waitFor(() => !props(b.state.objects.get(id)).driven);
  // taken back: not again
  a.send("car:lend", { to: null });
  await waitFor(() => keys.length >= 2);
  assert.deepEqual([keys[1].lent, keys[1].why], [false, "taken"]);
  await waitFor(() => props(a.state.objects.get(id)).lentTo === undefined);
  b.send("car:enter", { id, seat: 0 });
  await waitFor(() => noB.length >= 2);
  assert.equal(noB[1].why, "owned");
});
