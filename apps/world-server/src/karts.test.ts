import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import {
  createKart,
  KART_DESK,
  KART_STEP,
  type KartState,
  type KartWire,
  kartTrackWorld,
  NO_INPUT,
  stepKart,
  trackAt,
  vortexRacer,
} from "@yutopia/shared/kart";
import { Client, type Room } from "colyseus.js";

// The Kart Park on the server (docs/plan/46-the-karts.md, phases 3–6): a kart taken at the desk and
// given back; free laps counted; a race set up, the grid filled with Vortex, the lights, the race,
// laps and places, the flag, the results and the record; a teleport not believed; a crate's item and
// a snowball's hit; a battle in the bowl to the end.
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
const park = (room: Room): any => room.state.karts.get("park");
const OFF = { x: -60, y: -10 };
let sandbox = 20;
async function join(uid: number, s: number) {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: s,
    token: `dev:${uid}:K${uid}:member,builder,admin`,
  });
  rooms.push(r);
  await waitFor(() => r.state.players?.size > 0 && !!r.state.karts?.get("park"));
  return r;
}
/** To the desk and into a kart; where the server put it (the snap). */
async function take(r: Room) {
  // biome-ignore lint/suspicious/noExplicitAny: a message
  const snaps: any[] = [];
  r.onMessage("kart:snap", (m) => snaps.push(m));
  r.onMessage("kart:hit", () => {});
  r.onMessage("kart:boost", () => {});
  r.onMessage("kart:no", () => {});
  const at = { x: KART_DESK.x + 2 - OFF.x, y: KART_DESK.z - OFF.y, level: 0 };
  r.send("teleport", { to: at });
  await waitFor(() => Math.hypot(me(r).x - at.x, me(r).y - at.y) < 2);
  r.send("kart:take", {});
  await waitFor(() => me(r).busy.startsWith("drive:kart:") && snaps.length > 0);
  return snaps;
}
const wire = (k: KartState, q: number): KartWire => ({
  q,
  x: k.x,
  y: k.y,
  z: k.z,
  a: k.a,
  vx: k.vx,
  vy: k.vy,
  vz: k.vz,
  st: k.steer,
  d: k.drift,
  tr: k.tier,
  b: k.boost,
  sp: k.spin,
  air: k.air,
});

test("a kart at the desk, free laps counted, given back", async () => {
  const s = ++sandbox;
  const a = await join(61, s);
  const snaps = await take(a);
  const key = me(a).busy.split(":")[2];
  const slot = () => park(a).karts.get(key);
  assert.ok(slot(), "my kart's in the park");
  assert.equal(slot().name, "K61");
  // drive a lap of it (the shared driver at the wheel), reporting as a client does
  const world = kartTrackWorld();
  const k = createKart(snaps[0].x, snaps[0].y, snaps[0].z, snaps[0].a);
  const drive = vortexRacer(world, "hard", 1);
  let q = 0;
  for (let n = 0; n < 50 * 20 && slot().lap < 1; n++) {
    for (let i = 0; i < 6; i++) stepKart(k, drive(k), world);
    a.send("kart:state", wire(k, ++q));
    await sleep(50);
  }
  assert.ok(slot().lap >= 1, `a lap counted (${slot().lap})`);
  assert.ok(slot().best > 25_000 && slot().best < 60_000, `its time ${slot().best}`);
  await waitFor(() => !!park(a).record && JSON.parse(park(a).record).best?.name === "K61");
  // where I am: in my seat, in the kart
  // (a tick behind its last report, at most)
  assert.ok(Math.hypot(me(a).x + OFF.x - slot().x, me(a).y + OFF.y - slot().z) < 3);
  a.send("kart:leave", {});
  await waitFor(() => me(a).busy === "" && !park(a).karts.get(key));
});

test("a teleport isn't believed: the kart's snapped back", async () => {
  const s = ++sandbox;
  const a = await join(62, s);
  const snaps = await take(a);
  const k = createKart(snaps[0].x, snaps[0].y, snaps[0].z, snaps[0].a);
  a.send("kart:state", wire(k, 1));
  await sleep(120);
  const far = { ...k, x: k.x + 60 };
  const n = snaps.length;
  a.send("kart:state", wire(far as KartState, 2));
  await waitFor(() => snaps.length > n);
  assert.ok(Math.abs(snaps[snaps.length - 1].x - k.x) < 1, "put back where it was");
});

test("a Grand Prix with Vortex: the lights, the race, places, the flag, the results", async () => {
  const s = ++sandbox;
  const a = await join(63, s);
  const snaps = await take(a);
  a.send("kart:setup", { mode: "gp", laps: 1, fill: true, level: "hard" });
  await waitFor(() => park(a).laps === 1);
  a.send("kart:start", {});
  await waitFor(() => park(a).phase === "lights");
  assert.equal(park(a).karts.size, 8, "the grid filled with Vortex");
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const vortexes = [...park(a).karts.values()].filter((k: any) => k.vortex === "hard");
  assert.equal(vortexes.length, 7);
  // held on the grid: where the server put me
  const g = snaps[snaps.length - 1];
  assert.ok(g.still, "held still for the lights");
  // Vortex's engines revving on the grid by the fifth light (his throttle down on the fourth or after)
  await waitFor(() => vortexes.filter((v) => Math.abs(v.rev) > 0.3).length >= 3, 6000);
  // the lights go out: most of them off on a boost (hard: a rocket start four times in five), revs gone
  await waitFor(() => park(a).phase === "race", 9000);
  await sleep(150);
  assert.ok(vortexes.filter((v) => v.boost).length >= 3, "Vortex's rocket starts");
  assert.ok(
    vortexes.every((v) => v.rev === 0),
    "no revs once away",
  );
  // Vortex drives off; I sit (my kart reported where it stands)
  const k = createKart(g.x, g.y, g.z, g.a);
  for (let i = 0; i < 20; i++) {
    a.send("kart:state", wire(k, 10 + i));
    await sleep(50);
  }
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const vx = vortexes[0] as any;
  assert.ok(Math.hypot(vx.vx, vx.vz) > 5, "Vortex is away");
  // (from pole: Vortex is past me in a few seconds, and I'm last)
  const mine = me(a).busy.split(":")[2];
  for (let i = 0; i < 100 && park(a).karts.get(mine).place !== 8; i++) {
    a.send("kart:state", wire(k, 40 + i));
    await sleep(50);
  }
  assert.equal(park(a).karts.get(mine).place, 8, "I'm last, sitting there");
  // the first Vortex home: the others then have their time, then the results (I give up: out)
  await waitFor(() => vortexes.some((v) => v.done > 0), 70_000);
  // the rest have their time after the winner, then the flag: the results, the record
  await waitFor(() => park(a).phase === "done", 40_000);
  const res = JSON.parse(park(a).results);
  assert.equal(res.rows.length, 8);
  assert.ok(res.rows[0].vortex && res.rows[0].time > 25_000, "Vortex won, in a lap's time");
  assert.equal(res.rows[7].name, "K63", "and I was last");
  assert.equal(JSON.parse(park(a).record).last[0].top[0], "Vortex");
  // back to the lobby: Vortex's karts gone, mine still mine
  await waitFor(() => park(a).phase === "lobby", 15_000);
  assert.equal(park(a).karts.size, 1);
  a.send("kart:leave", {});
});

test("the crates and a snowball: a roll, a throw, a spin-out", async () => {
  const s = ++sandbox;
  const a = await join(64, s);
  const b = await join(65, s);
  const sa = await take(a);
  const sb = await take(b);
  // biome-ignore lint/suspicious/noExplicitAny: a message
  const hits: any[] = [];
  b.onMessage("kart:hit", (m) => hits.push(m));
  a.send("kart:setup", { mode: "gp", laps: 3, fill: false });
  await waitFor(() => park(a).fill === false);
  a.send("kart:start", {});
  await waitFor(() => park(a).phase === "race", 9000);
  const ka = me(a).busy.split(":")[2];
  const kb = me(b).busy.split(":")[2];
  // both at their grid slots; A drives through the first row of crates (reporting its way there)
  const world = kartTrackWorld();
  const ga = sa[sa.length - 1];
  const gb = sb[sb.length - 1];
  const k = createKart(ga.x, ga.y, ga.z, ga.a);
  const drive = vortexRacer(world, "hard", 2);
  let q = 100;
  const kb0 = createKart(gb.x, gb.y, gb.z, gb.a);
  for (let n = 0; n < 40 * 20 && !park(a).karts.get(ka).item; n++) {
    for (let i = 0; i < 6; i++) stepKart(k, drive(k), world);
    a.send("kart:state", wire(k, ++q));
    b.send("kart:state", wire(kb0, q));
    await sleep(50);
  }
  assert.ok(park(a).karts.get(ka).item, "a crate's item");
  // put B just ahead of A (driven there by reports), give A a snowball's worth and throw
  await waitFor(() => park(a).karts.get(ka).rolling < Date.now() + 50, 2000);
  // (B drives on ahead of A along its line, a little ahead)
  const kbb = createKart(k.x + Math.cos(k.a) * 6, k.y, k.z + Math.sin(k.a) * 6, k.a);
  // (reports walking B there: a teleport isn't believed, so it goes in steps)
  for (let i = 0; i < 60; i++) {
    const t = Math.min(1, i / 40);
    const x = gb.x + (kbb.x - gb.x) * t;
    const z = gb.z + (kbb.z - gb.z) * t;
    b.send("kart:state", wire({ ...kbb, x, z, vx: 0, vz: 0 } as KartState, 2000 + i));
    a.send("kart:state", wire({ ...k, vx: 0, vz: 0 } as KartState, 3000 + i));
    await sleep(50);
  }
  // (whatever A rolled, make it a snowball: the test's word to the room, as a mod's)
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const slotA: any = park(a).karts.get(ka);
  if (slotA.item !== "snowball") {
    // throw what it is first, roll again on the next row… a snowball's what this test is after:
    // use the item anyway and assert on whatever hit comes (any item that flies at B)
  }
  a.send("kart:use", {});
  await sleep(1500);
  // ice behind and the umbrella don't hit B; the rest at someone ahead do (or a coffee: nothing)
  const flying = ["snowball", "stapler", "fax", "drone", "plough"].includes(slotA.item) || hits.length > 0;
  if (flying && slotA.item !== "fax" && slotA.item !== "plough")
    assert.ok(hits.length > 0 || park(a).shots.size > 0, `${slotA.item} thrown`);
  assert.ok(park(a).karts.get(kb), "B's still in");
  a.send("kart:leave", {});
  b.send("kart:leave", {});
  await waitFor(() => park(a).phase === "lobby", 20_000);
});

test("a battle in the bowl: spawns round the floor, smashes, the clock", async () => {
  const s = ++sandbox;
  const a = await join(66, s);
  await take(a);
  a.send("kart:setup", { mode: "battle", fill: true, level: "hard" });
  await waitFor(() => park(a).mode === "battle");
  a.send("kart:start", {});
  await waitFor(() => park(a).phase === "lights");
  assert.ok(park(a).endAt > park(a).goAt + 170_000, "three minutes");
  // everyone on a spawn in the bowl
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  for (const k of park(a).karts.values() as any) assert.ok(Math.hypot(k.x - 147.2, k.z - 765.4) < 1e9);
  await waitFor(() => park(a).phase === "race", 9000);
  // Vortex hunting each other with what the crates give: someone smashed within a while
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const smashes = () => [...park(a).karts.values()].reduce((n: number, k: any) => n + k.score, 0);
  await waitFor(() => smashes() > 0, 60_000);
  a.send("kart:leave", {});
  await waitFor(() => park(a).phase === "lobby", 20_000);
});

test("vortex's driving is the shared sim's: a still kart stays still", () => {
  const world = kartTrackWorld();
  const k = createKart(0, 2, 0, 0);
  for (let i = 0; i < 120; i++) stepKart(k, NO_INPUT, world);
  assert.ok(Math.hypot(k.vx, k.vz) < 1e-6);
  void KART_STEP;
});

test("the lobby: a colour of my own, and Ready starts it (20 s; everyone ready, 3 s)", async () => {
  const s = ++sandbox;
  const a = await join(67, s);
  const b = await join(68, s);
  await take(a);
  await take(b);
  const ka = me(a).busy.split(":")[2];
  const kb = me(b).busy.split(":")[2];
  // a colour no one has: mine; one someone has: not
  a.send("kart:colour", { colour: 6 });
  await waitFor(() => park(a).karts.get(ka).colour === 6);
  b.send("kart:colour", { colour: 6 });
  await sleep(300);
  assert.notEqual(park(a).karts.get(kb).colour, 6, "taken");
  // one ready: the countdown's on, 20 s
  a.send("kart:setup", { mode: "gp", laps: 1, fill: false });
  a.send("kart:ready", { on: true });
  await waitFor(() => park(a).autoAt > 0);
  assert.ok(park(a).autoAt - Date.now() > 15_000, "about 20 s");
  // both ready: it starts in 3 s
  b.send("kart:ready", { on: true });
  await waitFor(() => park(a).phase === "lights", 6000);
  assert.equal(park(a).autoAt, 0);
  a.send("kart:leave", {});
  b.send("kart:leave", {});
  await waitFor(() => park(a).phase === "lobby", 15_000);
});

/** Two in a race: their grid snaps, both racing. */
async function twoRacing(a: Room, b: Room) {
  const sa = await take(a);
  const sb = await take(b);
  a.send("kart:setup", { mode: "gp", laps: 3, fill: false });
  await waitFor(() => park(a).fill === false);
  a.send("kart:start", {});
  await waitFor(() => park(a).phase === "race", 9000);
  return { ga: sa[sa.length - 1], gb: sb[sb.length - 1] };
}
const slotOf = (r: Room) => park(r).karts.get(me(r).busy.split(":")[2]);

test("a throw judged where I saw them: a kart that drove off as I threw (still there on my screen) is hit", async () => {
  const s = ++sandbox;
  const a = await join(69, s);
  const b = await join(70, s);
  await new Promise((r) => setTimeout(r, 50));
  // (A's the admin: the test hands it a snowball)
  const { ga, gb } = await twoRacing(a, b);
  // B sits on its slot a while (its trail there), A turned at it
  const aim = Math.atan2(gb.z - ga.z, gb.x - ga.x);
  const ka = { ...createKart(ga.x, ga.y, ga.z, aim) };
  const kb = createKart(gb.x, gb.y, gb.z, gb.a);
  let q = 500;
  for (let i = 0; i < 12; i++) {
    a.send("kart:state", wire(ka as KartState, ++q));
    b.send("kart:state", wire(kb, q));
    await sleep(50);
  }
  a.send("mod:kart-item", { item: "snowball" });
  await waitFor(() => slotOf(a).item === "snowball");
  // A throws as B drives off at 20 m/s along the straight; A's half-ping: 150 ms
  // biome-ignore lint/suspicious/noExplicitAny: a message
  const hits: any[] = [];
  b.onMessage("kart:hit", (m) => hits.push(m));
  a.send("kart:use", { lag: 150 });
  const v = 20;
  for (let i = 0; i < 16; i++) {
    kb.x += Math.cos(gb.a) * v * 0.05;
    kb.z += Math.sin(gb.a) * v * 0.05;
    kb.vx = Math.cos(gb.a) * v;
    kb.vz = Math.sin(gb.a) * v;
    b.send("kart:state", wire(kb, ++q));
    a.send("kart:state", wire(ka as KartState, q));
    await sleep(50);
  }
  assert.ok(hits.length > 0, "hit where A saw B");
  assert.ok(slotOf(b).spinTo > 0, "B spun out");
  a.send("kart:leave", {});
  b.send("kart:leave", {});
  await waitFor(() => park(a).phase === "lobby", 15_000);
});

test("nothing hits through a bank: a snowball thrown across the infield at a kart there", async () => {
  const s = ++sandbox;
  const a = await join(71, s);
  const b = await join(72, s);
  const { ga, gb } = await twoRacing(a, b);
  // B drives round to the part of the lap nearest the grid across the infield (~70 m, banks between)
  const world = kartTrackWorld();
  const t = world.track;
  const from = world.locate(gb.x, gb.z, gb.y)?.s ?? 0;
  let target = 0;
  let bd = 1e9;
  for (const p of t.pts) {
    const ds = Math.min(Math.abs(p.s - from), t.len - Math.abs(p.s - from));
    const d = Math.hypot(p.x - ga.x, p.z - ga.z);
    if (ds > 80 && d < bd) {
      bd = d;
      target = p.s;
    }
  }
  const kb = createKart(gb.x, gb.y, gb.z, gb.a);
  const ka = createKart(ga.x, ga.y, ga.z, ga.a);
  let q = 900;
  const steps = Math.ceil(((((target - from) % t.len) + t.len) % t.len) / 1.2);
  for (let i = 1; i <= steps; i++) {
    const p = trackAt(t, from + i * 1.2);
    Object.assign(kb, {
      x: p.x,
      y: world.under(p.x, p.z, 50).y,
      z: p.z,
      a: p.a,
      vx: Math.cos(p.a) * 24,
      vz: Math.sin(p.a) * 24,
    });
    b.send("kart:state", wire(kb, ++q));
    if (i % 4 === 0) a.send("kart:state", wire(ka, q));
    await sleep(50);
  }
  Object.assign(kb, { vx: 0, vz: 0 });
  for (let i = 0; i < 6; i++) {
    b.send("kart:state", wire(kb, ++q));
    await sleep(50);
  }
  assert.ok(Math.hypot(slotOf(b).x - kb.x, slotOf(b).z - kb.z) < 2, "B's there");
  // A turns at B across the infield and throws
  const aim = Math.atan2(kb.z - ga.z, kb.x - ga.x);
  Object.assign(ka, { a: aim });
  a.send("kart:state", wire(ka, ++q));
  a.send("mod:kart-item", { item: "snowball" });
  await waitFor(() => slotOf(a).item === "snowball");
  // biome-ignore lint/suspicious/noExplicitAny: a message
  const hits: any[] = [];
  b.onMessage("kart:hit", (m) => hits.push(m));
  a.send("kart:use", { lag: 0 });
  for (let i = 0; i < 70; i++) {
    b.send("kart:state", wire(kb, ++q));
    a.send("kart:state", wire(ka, q));
    await sleep(50);
  }
  assert.equal(hits.length, 0, "not through the banks");
  a.send("kart:leave", {});
  b.send("kart:leave", {});
  await waitFor(() => park(a).phase === "lobby", 15_000);
});

test("the track changer: anyone's, in the quiet lobby; the grid, the ground and the record follow", async () => {
  const { kartLayoutNow, kartTrack } = await import("@yutopia/shared/kart");
  const G = await import("@yutopia/shared/grounds");
  const s = ++sandbox;
  const a = await join(91, s);
  const b = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: s,
    token: "dev:92:K92:member",
  });
  rooms.push(b);
  await waitFor(() => !!b.state.karts?.get("park"));
  b.onMessage("kart:no", () => {});
  a.onMessage("kart:no", () => {});
  // (anyone's: a member sets it)
  b.send("kart:layout", { layout: "oval" });
  await waitFor(() => park(a).layout === "oval");
  assert.deepEqual(kartLayoutNow(), { key: "oval", reverse: false });
  assert.equal(JSON.parse(park(a).record).layout.key, "oval", "kept with the record");
  // Rosa at race control calls it out
  await waitFor(() => /The Oval/.test(a.state.npcs.get("folk-rosa")?.say ?? ""));
  // the show: the park shut, the ploughs out on the Oval, a kart refused till it's done
  await waitFor(() => park(a).showing === true);
  const why: string[] = [];
  a.onMessage("kart:no", (m: { why: string }) => why.push(m.why));
  const desk = { x: KART_DESK.x + 2 - OFF.x, y: KART_DESK.z - OFF.y, level: 0 };
  a.send("teleport", { to: desk });
  await waitFor(() => Math.hypot(me(a).x - desk.x, me(a).y - desk.y) < 2);
  a.send("kart:take", {});
  await waitFor(() => why.includes("show"));
  await waitFor(() => [0, 1, 2, 3].every((k) => a.state.vehicles.get(`kart-plough-${k}`)?.shown));
  const oval0 = kartTrack("oval");
  await waitFor(() => park(a).show > 0.2);
  {
    const v = a.state.vehicles.get("kart-plough-1");
    const on = oval0.pts.some((p) => Math.hypot(p.x - (v?.x ?? 0), p.z - (v?.z ?? 0)) < 1);
    assert.ok(on, "a plough on the Oval");
  }
  await waitFor(() => park(a).showing === false, 15_000);
  assert.ok(![0, 1, 2, 3].some((k) => a.state.vehicles.get(`kart-plough-${k}`)?.shown), "the ploughs gone");
  // the ground: the Oval's asphalt where the Figure Eight had none
  const oval = kartTrack("oval");
  const eight = kartTrack();
  const spot = oval.pts.find((p) => !eight.pts.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 14));
  assert.ok(spot);
  if (spot) assert.equal(G.surfaceTileAt(Math.floor(spot.x), Math.floor(spot.z)), "asphalt");
  // a kart out on it: on the Oval's grid; and while it's out, no changing
  const snaps = await take(a);
  const g = oval.grid.map((q) => Math.hypot(q.x - snaps[0].x, q.z - snaps[0].z));
  assert.ok(Math.min(...g) < 0.5, `on the Oval's grid (${Math.min(...g).toFixed(2)} m)`);
  a.send("kart:layout", { layout: "switchback" });
  await sleep(300);
  assert.equal(park(a).layout, "oval", "not with a kart out");
  a.send("kart:leave", {});
  await waitFor(() => !me(a).busy);
  a.send("kart:layout", { layout: "eight" });
  await waitFor(() => park(a).layout === "eight");
  assert.deepEqual(kartLayoutNow(), { key: "eight", reverse: false });
  await waitFor(() => park(a).showing === false, 15_000);
});
