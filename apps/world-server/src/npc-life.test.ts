import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { heightAt } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { type NpcDef, parseNpc } from "@yutopia/shared/npc";
import { townCast } from "@yutopia/shared/npc/town";
import { Client, type Room } from "colyseus.js";

// NPCs on the map (docs/plan/121-npcs-on-the-map.md) in an offline room: a town NPC placed is let go by their own
// feature and played here, back to their own once taken off the map; a made one dressed from the cast, wandering in
// their circle, answering X aloud; one out of their hours walks home and in at the door; Vortex never placed.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 31800 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
let lay: (e: GroundsEdits) => unknown;
let sign: (ts: string, method: string, path: string, raw: string) => string;
// biome-ignore lint/suspicious/noExplicitAny: the room in this process (its structure, its grid)
let liveRoom: () => any;
const rooms: Room[] = [];
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  lay = (await import("./land.ts")).landEdits;
  sign = (await import("./api.ts")).signInternal;
  const { WorldRoom } = await import("./WorldRoom.ts");
  liveRoom = () => [...WorldRoom.live].at(-1);
  server = await startWorldServer(PORT);
});
after(async () => {
  lay({ rev: 0 });
  for (const r of rooms) await r.leave(true).catch(() => {});
  await server.gracefullyShutdown(false);
});
async function waitFor(fn: () => boolean, ms = 10_000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(25);
  }
}
async function join(uid: number, s: number) {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: s,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(r);
  r.onMessage("snap", () => {});
  await waitFor(() => r.state.players?.size > 0 && r.state.npcs?.size > 0);
  return r;
}
async function sendCast(npcs: NpcDef[]) {
  const raw = JSON.stringify({ npcs });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`http://localhost:${PORT}/internal/cast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Yutopia-Timestamp": ts,
      "X-Yutopia-Signature": sign(ts, "POST", "/internal/cast", raw),
    },
    body: raw,
  });
  assert.equal(res.status, 200);
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const npc = (r: Room, id: string): any => r.state.npcs.get(id);

test("placed NPCs: the town's let go and played here, a made one wanders and answers, one goes home, Vortex never", async () => {
  const r = await join(91, 911);
  await waitFor(() => !!npc(r, "folk-maya"));
  // the cast: the town's, and Dora, made on the cast page — she answers, wanders; Ned has a shift that's over now
  const hour = Number(r.state.hour);
  const dora = parseNpc({
    key: "npc-dora",
    name: "Dora",
    lines: [{ when: "answer", en: "Fresh bread!", pt: "Pão fresquinho!" }],
    behaviour: { type: "wander", answer: true, talk: "never" },
  }) as NpcDef;
  const ned = parseNpc({
    key: "npc-ned",
    name: "Ned",
    behaviour: { type: "stand", hours: "shift", from: (Math.floor(hour) + 3) % 24, to: (Math.floor(hour) + 4) % 24 },
  }) as NpcDef;
  await sendCast([...townCast(), dora, ned]);

  // placed: Maya (a town visitor) stood by the houses, Dora wandering a 4 m circle, Ned going home to house-w0;
  // Vortex too — never placed
  lay({
    rev: 901,
    npcs: {
      add: [
        { key: "folk-maya", x: 418, z: -436, a: 0, level: 0 },
        { key: "npc-dora", x: 420, z: -452, a: 0, level: 0, r: 4 },
        { key: "npc-ned", x: 417, z: -444, a: Math.PI, level: 0, home: "house-w0" },
        { key: "vortex", x: 419, z: -440, a: 0, level: 0 },
      ],
    },
  });
  await waitFor(() => !!npc(r, "place:folk-maya") && !npc(r, "folk-maya"));
  assert.equal(npc(r, "place:folk-maya").name, "Maya");
  assert.equal(npc(r, "place:folk-maya").kind, "folk");
  assert.ok(Math.hypot(npc(r, "place:folk-maya").x - 418, npc(r, "place:folk-maya").y + 436) < 1);
  assert.equal(npc(r, "place:vortex"), undefined);
  assert.ok(npc(r, "vortex"), "Vortex still his own");
  assert.equal(npc(r, "place:npc-dora").name, "Dora");
  // (she answers: the client offers "Talk"; Maya doesn't)
  assert.equal(npc(r, "place:npc-dora").talk, true);
  assert.equal(npc(r, "place:folk-maya").talk, false);

  // Dora wanders, within her circle
  const d0 = { x: npc(r, "place:npc-dora").x, y: npc(r, "place:npc-dora").y };
  await waitFor(() => Math.hypot(npc(r, "place:npc-dora").x - d0.x, npc(r, "place:npc-dora").y - d0.y) > 0.5, 30_000);
  assert.ok(Math.hypot(npc(r, "place:npc-dora").x - 420, npc(r, "place:npc-dora").y + 452) <= 4.6);

  // Ned's shift is over: he walks to house-w0's door (x 412) and in — its ground storey, a floor of its own
  const ned0 = npc(r, "place:npc-ned");
  await waitFor(() => ned0.level !== 0, 30_000);
  assert.ok(ned0.level >= 32, `in house-w0's storey (${ned0.level})`);
  assert.ok(ned0.x < 412, "inside, past the door");

  // talked to: Dora answers aloud
  // (she keeps wandering: followed, asked again)
  const dn = npc(r, "place:npc-dora");
  for (let i = 0; i < 20 && !String(dn.say).startsWith("Fresh bread!"); i++) {
    r.send("teleport", { to: { x: dn.x + 1.2, y: dn.y, level: 0 } });
    await sleep(400);
    r.send("npc:talk", { id: "place:npc-dora" });
    await sleep(400);
  }
  assert.ok(String(dn.say).startsWith("Fresh bread!"), `she answered (${dn.say})`);
  // (aloud, both languages on the wire: the client says the one it's in)
  assert.equal(dn.say, "Fresh bread!\u001fPão fresquinho!");

  // taken off the map: Maya back to her own (the Kart Park's walk), the others gone
  lay({ rev: 902 });
  await waitFor(() => !npc(r, "place:folk-maya") && !!npc(r, "folk-maya") && !npc(r, "place:npc-dora"));
  assert.equal(npc(r, "place:npc-ned"), undefined);
});

test("placed NPCs and a shot: one ducks, one runs away from the shooter", async () => {
  const r = await join(92, 912);
  const duck = parseNpc({ key: "npc-duck", name: "Duck", behaviour: { type: "stand", shots: "duck" } }) as NpcDef;
  const run = parseNpc({ key: "npc-run", name: "Run", behaviour: { type: "stand", shots: "flee" } }) as NpcDef;
  await sendCast([...townCast(), duck, run]);
  lay({
    rev: 903,
    npcs: {
      add: [
        { key: "npc-duck", x: 420, z: -500, a: 0, level: 0 },
        { key: "npc-run", x: 424, z: -500, a: 0, level: 0 },
      ],
    },
  });
  await waitFor(() => !!npc(r, "place:npc-duck") && !!npc(r, "place:npc-run"));
  // armed (the kit), stood 8 m off, firing away from them
  const seen = { inv: false };
  r.onMessage("dark:pockets", () => {
    seen.inv = true;
  });
  r.onMessage("*", () => {});
  r.send("dark:hello", {});
  await waitFor(() => seen.inv);
  r.send("mod:refill", { kit: true });
  await sleep(300);
  r.send("arms:draw", { slot: 0 });
  r.send("teleport", { to: { x: 422, y: -508, level: 0 } });
  await waitFor(
    () => Math.hypot(r.state.players.get(r.sessionId).x - 422, r.state.players.get(r.sessionId).y + 508) < 0.6,
  );
  await sleep(600);
  const m = r.state.players.get(r.sessionId);
  const yaw = Math.PI / 2 + Math.PI; // (south: away from them, north of here)
  r.send("pos", { x: m.x, y: m.y, z: m.z, a: 0, seq: 0, mv: packMv("still") | MV_AIM, yaw: yawToByte(yaw), pitch: 0 });
  await sleep(300);
  const run0 = { x: npc(r, "place:npc-run").x, y: npc(r, "place:npc-run").y };
  r.send("arms:fire", {
    ox: m.x,
    oy: m.y,
    oz: heightAt(m.x, m.y) + 1.35,
    yaw: -Math.PI / 2,
    pitch: 0,
    lag: 0,
    seed: 7,
  });
  await waitFor(() => npc(r, "place:npc-duck").mood === "duck", 5000);
  await waitFor(() => npc(r, "place:npc-run").mood === "run", 5000);
  // (away from the shooter: further from them than they stood)
  await waitFor(() => {
    const n = npc(r, "place:npc-run");
    return Math.hypot(n.x - m.x, n.y - m.y) > Math.hypot(run0.x - m.x, run0.y - m.y) + 2;
  }, 10_000);
  // the duck's over in a few seconds
  await waitFor(() => npc(r, "place:npc-duck").mood === "", 8000);
  lay({ rev: 904 });
});

test("placed NPCs between floors: down a town building's stairs to their home, up them on a route, the studio's too; a street bench sat on", async () => {
  const r = await join(93, 913);
  const room = liveRoom();
  const floors = room.structure.floors as {
    index: number;
    space?: string;
    storey?: number;
    grid: { x0: number; y0: number; w: number; h: number };
  }[];
  const storey = (space: string, n: number) => floors.find((f) => f.space === space && (f.storey ?? 0) === n);
  // (a building with two storeys and stairs between them)
  const spaces = [...new Set(floors.filter((f) => f.space && (f.storey ?? 0) === 1).map((f) => f.space as string))];
  const hasStairs = (lv: number) =>
    [...room.state.objects.values()].some(
      (o: { kind: string; props: string }) => o.kind === "stairs" && JSON.parse(o.props || "{}").level === lv,
    );
  const key = spaces.find((k) => hasStairs(storey(k, 0)?.index ?? -1));
  assert.ok(key, "a town building with stairs up");
  const s0 = storey(key, 0);
  const s1 = storey(key, 1);
  assert.ok(s0 && s1);
  const open = (lv: number, g: { x0: number; y0: number; w: number; h: number }) =>
    room.gridFor(null, lv).nearestOpen(g.x0 + g.w / 2, g.y0 + g.h / 2, 8);
  const up = open(s1.index, s1.grid);
  assert.ok(up, "a spot upstairs");
  // the studio: a spot on its first floor and on its ground
  // (by the foot of a staircase on each: its own floor's open spot near it)
  const { stairsWayUp } = await import("@yutopia/shared");
  const stairsOn = (lv: number) =>
    [...room.state.objects.values()].find(
      (o: { kind: string; props: string }) => o.kind === "stairs" && JSON.parse(o.props || "{}").level === lv,
    );
  const near = (lv: number) => {
    const o = stairsOn(lv);
    if (!o) return null;
    const foot = stairsWayUp({ x: o.x, y: o.y, yaw: o.yaw })[0];
    return room.gridFor(null, lv).nearestOpen(foot.x, foot.y, 6);
  };
  const stUp = near(1);
  const stDown = near(0);
  assert.ok(stUp && stDown, "the studio's first floor and its ground");
  // a street bench out on the land
  const { STREET } = await import("@yutopia/shared/grounds");
  const bench = STREET.find((t) => t.kind === "bench");
  assert.ok(bench, "a street bench");
  const hour = Number(r.state.hour);
  const cast: NpcDef[] = [
    // Upa: upstairs, a shift that's over now, home here: down the stairs to the ground storey
    parseNpc({
      key: "npc-upa",
      name: "Upa",
      behaviour: { type: "stand", hours: "shift", from: (Math.floor(hour) + 3) % 24, to: (Math.floor(hour) + 4) % 24 },
    }) as NpcDef,
    // Rua: on the ground storey, a route up the stairs and back
    parseNpc({ key: "npc-rua", name: "Rua", behaviour: { type: "route" } }) as NpcDef,
    // Stu: the studio's first floor, a route down to its ground floor
    parseNpc({ key: "npc-stu", name: "Stu", behaviour: { type: "route" } }) as NpcDef,
    // Ben: sat on the bench
    parseNpc({ key: "npc-ben", name: "Ben", behaviour: { type: "sit" } }) as NpcDef,
  ];
  await sendCast([...townCast(), ...cast]);
  const g0 = open(s0.index, s0.grid);
  const [bx, bz] = [bench.x + 1, bench.z + 0.5];
  lay({
    rev: 905,
    npcs: {
      add: [
        { key: "npc-upa", x: up.x, z: up.y, a: 0, level: s1.index, home: key },
        {
          key: "npc-rua",
          x: g0.x,
          z: g0.y,
          a: 0,
          level: s0.index,
          route: [{ x: up.x, z: up.y, level: s1.index }],
          pause: 1,
        },
        ...(stUp && stDown
          ? [
              {
                key: "npc-stu",
                x: stUp.x,
                z: stUp.y,
                a: 0,
                level: 1,
                route: [{ x: stDown.x, z: stDown.y, level: 0 }],
                pause: 1,
              },
            ]
          : []),
        { key: "npc-ben", x: bx, z: bz, a: 0, level: 0 },
      ],
    },
  });
  await waitFor(() => !!npc(r, "place:npc-upa") && !!npc(r, "place:npc-ben"));
  // Ben sits on the bench, up on its seat
  await waitFor(() => npc(r, "place:npc-ben").a === 2, 15_000);
  const { groundAt, pavedAt } = await import("@yutopia/shared/grounds");
  const b = npc(r, "place:npc-ben");
  assert.ok(b.z > groundAt(b.x, b.y) + pavedAt(b.x, b.y), `up on the seat (${b.z})`);
  assert.ok(Math.hypot(b.x - bx, b.y - bz) < 0.8, "on the bench");
  // Upa walks down the stairs, to the ground storey (her home's)
  await waitFor(() => npc(r, "place:npc-upa").level === s0.index, 40_000);
  // Rua climbs to the storey above
  await waitFor(() => npc(r, "place:npc-rua").level === s1.index, 40_000);
  // Stu comes down the studio's stairs
  if (stUp && stDown) await waitFor(() => npc(r, "place:npc-stu").level === 0, 40_000);
  lay({ rev: 906 });
});

// docs/plan/123-npcs-alive.md: their minds — Bea at work behind house-w0's counter in her shift; Tom, thirsty, walks in,
// waits his turn, is made a coffee and handed it, and drinks it there.
test("placed NPCs' minds: a worker at her spot in her shift, a thirsty one served there, cup in hand", async () => {
  const r = await join(94, 914);
  const room = liveRoom();
  const f = room.structure.floors.find((q: { space?: string; storey?: number }) => q.space === "house-w0" && !q.storey);
  assert.ok(f, "house-w0's ground storey");
  const g = room.gridFor(0, f.index);
  const spot = g.nearestOpen(f.grid.x0 + f.grid.w / 2, f.grid.y0 + f.grid.h / 2, 4);
  assert.ok(spot);
  const hour = Math.floor(Number(r.state.hour));
  const bea = parseNpc({ key: "npc-bea", name: "Bea", behaviour: { type: "stand", talk: "never" } }) as NpcDef;
  const tom = parseNpc({ key: "npc-tom", name: "Tom", behaviour: { type: "stand", talk: "never" } }) as NpcDef;
  await sendCast([...townCast(), bea, tom]);
  lay({
    rev: 931,
    npcs: {
      add: [
        {
          key: "npc-bea",
          x: 417,
          z: -446,
          a: 0,
          level: 0,
          work: {
            building: "house-w0",
            job: "barista",
            spot: "counter",
            x: spot.x,
            z: spot.y,
            a: 0,
            level: f.index,
            from: (hour + 23) % 24,
            to: (hour + 2) % 24,
          },
        },
        { key: "npc-tom", x: 417, z: -442, a: 0, level: 0 },
      ],
    },
  });
  await waitFor(() => !!npc(r, "place:npc-bea") && !!npc(r, "place:npc-tom"));
  // Bea: in her shift, to her spot inside
  await waitFor(() => {
    const b = npc(r, "place:npc-bea");
    return b.level === f.index && Math.hypot(b.x - spot.x, b.y - spot.y) < 0.8;
  }, 40_000);
  assert.ok(room.npcMind.needs("npc-tom"), "Tom has a mind");
  // Tom, thirsty: a coffee at hers — in line, made, handed, drunk
  room.npcMind.nudge("npc-tom", { thirst: 4 });
  await waitFor(() => room.npcMind.doing("npc-tom")?.kind === "coffee", 20_000);
  assert.equal(room.npcMind.doing("npc-tom")?.at, "npc-bea");
  await waitFor(() => npc(r, "place:npc-tom").level === f.index, 40_000);
  await waitFor(() => npc(r, "place:npc-bea").act === "make", 20_000);
  assert.equal(npc(r, "place:npc-bea").actWith, "place:npc-tom");
  await waitFor(() => npc(r, "place:npc-tom").held === "mug", 15_000);
  await waitFor(() => npc(r, "place:npc-tom").act === "drink", 15_000);
  // (a coffee's half a need a second: well up after a few)
  const t0 = room.npcMind.needs("npc-tom")?.thirst ?? 0;
  await waitFor(() => (room.npcMind.needs("npc-tom")?.thirst ?? 0) > t0 + 5, 20_000);

  // a player at her counter (F4c): what she is to me — her job, what I can do — an order made and handed over
  const next = (type: string) =>
    // biome-ignore lint/suspicious/noExplicitAny: decoded messages
    new Promise<any>((res) => {
      const off = r.onMessage(type, (m) => {
        off();
        res(m);
      });
    });
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const me = (): any => r.state.players.get(r.sessionId);
  r.send("pos", { x: spot.x + 1.3, y: spot.y, z: 0, l: f.index, a: 0, mv: 0, yaw: 0, pitch: 0 });
  await waitFor(() => me().level === f.index && Math.hypot(me().x - spot.x - 1.3, me().y - spot.y) < 0.2);
  const about = next("npc:about");
  r.send("npc:about", { id: "place:npc-bea" });
  const a = await about;
  assert.equal(a.job, "barista");
  assert.equal(a.work, "house-w0");
  assert.ok(a.acts.includes("order") && a.acts.includes("talk") && !a.acts.includes("hug"), a.acts.join());
  assert.equal(a.bond.level, "stranger");
  const ordered = next("npc:acted");
  r.send("npc:act", { id: "place:npc-bea", act: "order" });
  assert.equal((await ordered).act, "order");
  await waitFor(() => me().held === "mug", 25_000);
  // a compliment to Tom, sat with his coffee: taken (or not), and he's met me once now
  const tomNow = npc(r, "place:npc-tom");
  r.send("pos", { x: tomNow.x + 0.8, y: tomNow.y, z: 0, l: f.index, a: 0, mv: 0, yaw: 0, pitch: 0 });
  await waitFor(() => Math.hypot(me().x - tomNow.x - 0.8, me().y - tomNow.y) < 0.2);
  const done = next("npc:acted");
  r.send("npc:act", { id: "place:npc-tom", act: "compliment" });
  const d = await done;
  assert.equal(d.act, "compliment");
  assert.equal(d.bond.n, 1);
  // (said aloud: on his Npc, a patch after the answer)
  await waitFor(() => npc(r, "place:npc-tom").say.length > 0, 3000);
  lay({ rev: 0 });
});

// docs/plan/123-npcs-alive.md F9a: rain called — Cleo, out on the land, opens an umbrella; dry again, put away
test("placed NPCs in the rain: an umbrella out on the land, put away once it's dry", async () => {
  const r = await join(95, 915);
  const cleo = parseNpc({ key: "npc-cleo", name: "Cleo", behaviour: { type: "stand", talk: "never" } }) as NpcDef;
  await sendCast([...townCast(), cleo]);
  lay({ rev: 951, npcs: { add: [{ key: "npc-cleo", x: 418, z: -436, a: 0, level: 0 }] } });
  try {
    await waitFor(() => !!npc(r, "place:npc-cleo"));
    assert.equal(npc(r, "place:npc-cleo").held, "");
    r.send("mod:weather", { to: "rain", now: true });
    await waitFor(() => npc(r, "place:npc-cleo").held === "umbrella", 10_000);
    r.send("mod:weather", { to: "clear", now: true });
    await waitFor(() => npc(r, "place:npc-cleo").held === "", 10_000);
  } finally {
    r.send("mod:weather", { to: null });
    lay({ rev: 0 });
  }
});

// docs/plan/123-npcs-alive.md, its leftovers: table service — Wes waiting the diner's tables in his shift; Ann, hungry,
// shown to a table and sat; her order taken there, Wes to the pass, a plate carried out, set down; she eats. And an
// admin's bond with her set outright: a friend's acts on her menu (the kiss among them).
test("placed NPCs at a waited place: sat at a table, the order taken there, a plate brought; an admin's bond set", async () => {
  const r = await join(96, 916);
  const room = liveRoom();
  const f = room.structure.floors.find((q: { space?: string; storey?: number }) => q.space === "diner" && !q.storey);
  assert.ok(f, "the diner's floor");
  const g = room.gridFor(0, f.index);
  const spot = g.nearestOpen(f.grid.x0 + f.grid.w / 2, f.grid.y0 + f.grid.h / 2, 4);
  const far = g.nearestOpen(f.grid.x0 + 2, f.grid.y0 + f.grid.h / 2, 4);
  assert.ok(spot && far);
  const hour = Math.floor(Number(r.state.hour));
  const wes = parseNpc({ key: "npc-wes", name: "Wes", behaviour: { type: "stand", talk: "never" } }) as NpcDef;
  const ann = parseNpc({ key: "npc-ann", name: "Ann", behaviour: { type: "stand", talk: "never" } }) as NpcDef;
  await sendCast([...townCast(), wes, ann]);
  lay({
    rev: 961,
    npcs: {
      add: [
        {
          key: "npc-wes",
          x: spot.x,
          z: spot.y,
          a: 0,
          level: f.index,
          work: {
            building: "diner",
            job: "waiter",
            spot: "floor",
            x: spot.x,
            z: spot.y,
            a: 0,
            level: f.index,
            from: (hour + 23) % 24,
            to: (hour + 2) % 24,
          },
        },
        { key: "npc-ann", x: far.x, z: far.y, a: 0, level: f.index },
      ],
    },
  });
  try {
    await waitFor(() => !!npc(r, "place:npc-wes") && !!npc(r, "place:npc-ann"));
    await waitFor(() => room.npcMind.doing("npc-wes")?.mode === "work", 20_000);
    room.npcMind.nudge("npc-ann", { hunger: 3 });
    await waitFor(() => room.npcMind.doing("npc-ann")?.kind === "meal", 20_000);
    assert.equal(room.npcMind.doing("npc-ann")?.at, "npc-wes");
    // sat at a table (her place a seat), waiting there
    await waitFor(() => room.npcMind.doing("npc-ann")?.stage === "queue", 40_000);
    // (the room's state a patch behind the mind)
    await waitFor(() => npc(r, "place:npc-ann").a === 2, 3000);
    // Wes over to her, the order taken, to the pass and back with a plate
    await waitFor(() => npc(r, "place:npc-wes").held === "plate", 60_000);
    await waitFor(() => npc(r, "place:npc-wes").held === "" && npc(r, "place:npc-wes").act === "give", 40_000);
    await waitFor(() => npc(r, "place:npc-ann").act === "eat", 15_000);
    assert.equal(npc(r, "place:npc-ann").a, 2, "still at her table");
    // her plate set down before her: on a table's top in reach (a booth's at 0.76 m)
    await waitFor(() => !!npc(r, "place:npc-ann").dish, 5000);
    const [dx, dy, dh] = String(npc(r, "place:npc-ann").dish).split(",").map(Number);
    const annAt = npc(r, "place:npc-ann");
    assert.ok(Math.hypot(dx - annAt.x, dy - annAt.y) < 0.9, `the plate in reach: ${npc(r, "place:npc-ann").dish}`);
    assert.ok(dh > 0.6 && dh < 1.15, `on a table's top: ${dh}`);

    // an admin's: her bond with me set to a friend's — the kiss on offer near her
    const ann0 = npc(r, "place:npc-ann");
    r.send("pos", { x: ann0.x + 0.9, y: ann0.y, z: 0, l: f.index, a: 0, mv: 0, yaw: 0, pitch: 0 });
    // biome-ignore lint/suspicious/noExplicitAny: decoded state
    const me = (): any => r.state.players.get(r.sessionId);
    await waitFor(() => me().level === f.index && Math.hypot(me().x - ann0.x - 0.9, me().y - ann0.y) < 0.2);
    // biome-ignore lint/suspicious/noExplicitAny: decoded messages
    const about = new Promise<any>((res) => {
      const off = r.onMessage("npc:about", (m) => {
        off();
        res(m);
      });
    });
    r.send("mod:npcBond", { id: "place:npc-ann", v: 50 });
    const a = await about;
    assert.equal(a.bond.level, "friend");
    assert.ok(a.acts.includes("kiss") && a.acts.includes("hug"), a.acts.join());
  } finally {
    lay({ rev: 0 });
  }
});
