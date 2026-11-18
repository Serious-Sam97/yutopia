import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { HOME_CARS, parkedPose, variantsOf } from "@yutopia/shared/car";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { Client, type Room } from "colyseus.js";

// God mode's vehicles on the world server (docs/plan/102-god-mode-vehicles.md, phase 2): a draft that moves one of the
// town's cars and repaints it, takes another away, places a bike and moves one of the lot's cars, published — the
// world's vehicles made to match; one with a kind there isn't refused; rolled back to none, the town's own as the code
// has them again and the placed bike gone (the lot's car stays where it was moved: that's once).
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 33300 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
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
const props = (o: { props: string }) => JSON.parse(o.props) as Record<string, unknown>;
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const poseOf = (o: any) => parkedPose({ x: o.x, y: o.y, yaw: o.yaw, props: props(o) });

test("God mode's vehicles published: moved, repainted, taken away, placed; refused; rolled back", async () => {
  const room: Room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 10201,
    token: "dev:61:P61:member,builder,admin",
  });
  rooms.push(room);
  const said: { type: string; msg: Record<string, unknown> }[] = [];
  room.onMessage("*", (type, msg) => said.push({ type: String(type), msg }));
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  await waitFor(() => HOME_CARS.every((h) => !!room.state.objects.get(h.id)));
  const objs = () => room.state.objects;
  const taxi = HOME_CARS.find((h) => h.role === "taxi" && !h.look);
  const other = HOME_CARS.find((h) => h.model === "sedan" && !h.role && h.id !== taxi?.id);
  assert.ok(taxi && other, "a taxi and a sedan of the town's");
  // (one of the lot's cars: not a home)
  const lotCar = [...objs().values()].find((o) => o.kind === "car" && /^car-\d+$/.test(o.id));
  assert.ok(lotCar, "a lot car");
  const lotWas = poseOf(lotCar);
  const variant = variantsOf("sedan")[0];
  const draft: GroundsEdits = {
    rev: 0,
    vehicles: {
      add: [
        {
          key: "god-car-1",
          model: "bike_bmx",
          x: taxi.x + 3,
          z: taxi.z + 8,
          a: 1,
          look: { variant: variantsOf("bike_bmx")[0], colour: 0x2266cc },
        },
      ],
      change: {
        [taxi.id]: { x: taxi.x + 6, z: taxi.z, look: { variant, colour: 0x335577 }, role: "", plate: "GOD 1" },
        [lotCar.id]: { x: lotWas.x + 4, z: lotWas.y + 4 },
      },
      remove: [other.id],
    },
  };
  // (a kind there isn't: refused, with why)
  offlineDrafts.set(611, {
    userId: 61,
    name: "Bad",
    baseRev: 0,
    data: { rev: 0, vehicles: { add: [{ key: "god-car-1", model: "hovercraft", x: 0, z: 0, a: 0 }] } },
  });
  room.send("god:publish", { draftId: 611 });
  await waitFor(() => said.some((s) => s.type === "god:refused"));
  const no = said.find((s) => s.type === "god:refused")?.msg as { problems: string[] };
  assert.ok(
    no.problems.some((p) => /no such vehicle/.test(p)),
    no.problems.join("; "),
  );

  offlineDrafts.set(612, { userId: 61, name: "Vehicles", baseRev: 0, data: draft });
  room.send("god:publish", { draftId: 612 });
  await waitFor(() => said.some((s) => s.type === "god:published"));
  await waitFor(() => !objs().get(other.id) && !!objs().get("god-car-1"));
  // the taxi at its new home, as it's painted now, no longer a taxi
  const t = objs().get(taxi.id);
  const tp = poseOf(t);
  assert.ok(Math.hypot(tp.x - (taxi.x + 6), tp.y - taxi.z) < 0.6, `moved: ${tp.x},${tp.y}`);
  assert.deepEqual(props(t).look, { extras: [], wheels: "steel", variant, colour: 0x335577 });
  assert.equal(props(t).role, undefined);
  assert.equal(props(t).plate, "GOD 1");
  // the bike placed
  const b = objs().get("god-car-1");
  assert.equal(props(b).model, "bike_bmx");
  assert.ok(Math.hypot(poseOf(b).x - (taxi.x + 3), poseOf(b).y - (taxi.z + 8)) < 0.6);
  // the lot's car moved, once
  const lp = poseOf(objs().get(lotCar.id));
  assert.ok(Math.hypot(lp.x - (lotWas.x + 4), lp.y - (lotWas.y + 4)) < 0.6, `lot car: ${lp.x},${lp.y}`);

  // rolled back to none: the town's as the code has them
  room.send("god:rollback", { rev: 0 });
  await waitFor(() => room.state.groundsRev === 2);
  await waitFor(() => !!objs().get(other.id) && !objs().get("god-car-1"));
  const t2 = objs().get(taxi.id);
  const tp2 = poseOf(t2);
  assert.ok(Math.hypot(tp2.x - taxi.x, tp2.y - taxi.z) < 0.6, "the taxi home again");
  assert.equal(props(t2).role, "taxi");
  assert.equal(props(t2).look, undefined);
  assert.equal(props(t2).plate, undefined);
  const lp2 = poseOf(objs().get(lotCar.id));
  assert.ok(Math.hypot(lp2.x - lp.x, lp2.y - lp.y) < 0.6, "the lot's car where it was moved");
});
