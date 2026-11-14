import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import type { Inventory } from "@yutopia/shared/inventory";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { VORTEX_FIGHT } from "@yutopia/shared/vortex-fight";
import { Client, type Room } from "colyseus.js";

// The fight with Vortex (docs/plan/88-vortex-fight.md phase 1): shot, he's hurt — his health a fraction, the acts by
// it, who's in it told to everyone; two of them shooting; beaten — his tape where he fell, everyone told, nothing
// hits him while he's down; an admin's reset.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 33100 + Math.floor(Math.random() * 100); // (its own hundred)
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
const vx = (room: Room): any => room.state.npcs.get("vortex");
interface Person {
  room: Room;
  inv: Inventory | null;
  hits: { id: string; kind: string }[];
  fight: { who: { sid: string; name: string; hits: number }[] }[];
  down: { by: string; secs: number }[];
  moves: { kind: string; to?: string; who?: string[]; n?: number; item?: string; area?: string; ms?: number }[];
}
async function person(uid: number): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 41,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(room);
  const who: Person = { room, inv: null, hits: [], fight: [], down: [], moves: [] };
  room.onMessage("dark:pockets", (m: { inv: Inventory }) => {
    who.inv = m.inv;
  });
  room.onMessage("arms:hit", (m: Person["hits"][number]) => who.hits.push(m));
  room.onMessage("vortex:fight", (m: Person["fight"][number]) => who.fight.push(m));
  room.onMessage("vortex:down", (m: Person["down"][number]) => who.down.push(m));
  room.onMessage("vortex:move", (m: Person["moves"][number]) => who.moves.push(m));
  room.onMessage("*", () => {});
  await waitFor(() => !!room.state?.players?.get(room.sessionId) && !!vx(room));
  room.send("dark:hello", {});
  await waitFor(() => who.inv !== null);
  return who;
}
// gone (out of the next test's line: they all arrive on one spot) — once only (twice hangs the file)
async function bye(...ps: Person[]) {
  for (const p of ps) {
    rooms.splice(rooms.indexOf(p.room), 1);
    await p.room.leave(true).catch(() => {});
  }
}
// a revolver drawn, aimed at him, a shot — from where they stand, at his middle
async function armed(p: Person) {
  p.room.send("mod:refill", { kit: true });
  await waitFor(() => p.inv?.quick[0]?.id === "revolver");
  p.room.send("arms:draw", { slot: 0 });
  await waitFor(() => me(p.room).gun === "revolver");
  await sleep(900);
}
function shoot(p: Person, at?: { x: number; y: number; z: number }) {
  const m = me(p.room);
  const v = at ?? vx(p.room);
  const yaw = Math.atan2(v.y - m.y, v.x - m.x);
  p.room.send("pos", {
    x: m.x,
    y: m.y,
    z: m.z,
    a: 0,
    seq: 0,
    mv: packMv("still") | MV_AIM,
    yaw: yawToByte(yaw + AIM_BLADE),
    pitch: 0,
  });
  const oz = 1.35;
  const pitch = Math.atan2((at ? at.z : VORTEX_FIGHT.z0 + VORTEX_FIGHT.h / 2) - oz, Math.hypot(v.x - m.x, v.y - m.y));
  setTimeout(() => p.room.send("arms:fire", { ox: m.x, oy: m.y, oz, yaw, pitch, lag: 0, seed: 7 }), 60);
}

test("shot, Vortex is hurt: his health, the acts, who's in it; two shooting; beaten — his tape, everyone told", async () => {
  const a = await person(881);
  const b = await person(882);
  // him held beside A, B a step back and aside (both arrive on the same spot: out of A's line)
  const m = me(a.room);
  b.room.send("teleport", { to: { x: m.x - 1.5, y: m.y + 1.5, level: m.level } });
  await waitFor(() => Math.hypot(me(b.room).x - (m.x - 1.5), me(b.room).y - (m.y + 1.5)) < 0.6);
  a.room.send("mod:vortex", { reset: true, hold: true, at: { x: m.x + 2.5, y: m.y } });
  await waitFor(() => Math.abs(vx(a.room).x - (m.x + 2.5)) < 0.01);
  await armed(a);
  // a hit: his health down, act I, who's in it — on both screens
  shoot(a);
  await waitFor(() => a.hits.some((h) => h.kind === "vortex"));
  await waitFor(() => vx(b.room).vk < 1 && vx(b.room).vact === 1);
  await waitFor(() => b.fight.at(-1)?.who[0]?.sid === a.room.sessionId);
  assert.equal(b.fight.at(-1)?.who[0]?.hits, 1);
  // an act set (an admin's): II, his face with it
  a.room.send("mod:vortex", { act: 2 });
  await waitFor(() => vx(b.room).vact === 2 && vx(b.room).mood === "fury");
  // B in it too (him moved in front of her, away from A's line): two told
  await armed(b);
  a.room.send("mod:vortex", { at: { x: m.x - 1.5, y: m.y + 4 } });
  await waitFor(() => Math.abs(vx(b.room).y - (m.y + 4)) < 0.01);
  const k = vx(a.room).vk;
  shoot(b);
  await waitFor(() => vx(a.room).vk < k);
  await waitFor(() => (a.fight.at(-1)?.who.length ?? 0) === 2);
  // beaten: everyone told, his tape where he fell; while he's down nothing hits him
  a.room.send("mod:vortex", { beat: true });
  await waitFor(() => a.down.length === 1 && b.down.length === 1);
  await waitFor(() => vx(a.room).mood === "dead");
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const tape = (): any => [...a.room.state.drops.values()].find((d: { item: string }) => d.item === "vxtape");
  await waitFor(() => !!tape());
  assert.ok(Math.hypot(tape().x - vx(a.room).x, tape().y - vx(a.room).y) < 0.6, "where he fell");
  const before = a.hits.filter((h) => h.kind === "vortex").length;
  shoot(a);
  await sleep(500);
  assert.equal(a.hits.filter((h) => h.kind === "vortex").length, before, "down: no hits");
  // an admin's reset: up, no fight
  a.room.send("mod:vortex", { reset: true, hold: false });
  await waitFor(() => vx(a.room).vact === 0 && vx(a.room).vgone === 0 && vx(a.room).mood === "smug");
  await waitFor(() => a.fight.at(-1)?.who.length === 0);
  await bye(a, b);
});

// (phase 2) his act II moves, each on both screens: the tape whip (bound — no shots — and a friend cuts her free),
// REW (back where she stood), PAUSE (the shots held, then back at her — hurt, never down), the confiscation (her gun
// gone, left far off with its rounds), the radio's blast (made to dance), HR (sent to reception; her shots not
// counted); unheld in act II — one by himself
test("act II: the whip and a friend's knife, REW, PAUSE, the confiscation, the radio, HR — and one by himself", async () => {
  const a = await person(883);
  const b = await person(884);
  const m = me(a.room);
  const sa = a.room.sessionId;
  // (both arrive on the same spot: B out of A's line)
  b.room.send("teleport", { to: { x: m.x - 1.5, y: m.y + 1.5, level: m.level } });
  await waitFor(() => Math.hypot(me(b.room).x - (m.x - 1.5), me(b.room).y - (m.y + 1.5)) < 0.6);
  a.room.send("mod:vortex", { reset: true, hold: true, at: { x: m.x + 2.5, y: m.y } });
  await waitFor(() => Math.abs(vx(a.room).x - (m.x + 2.5)) < 0.01);
  await armed(a);
  shoot(a);
  await waitFor(() => vx(a.room).vact === 1);
  a.room.send("mod:vortex", { act: 2 });
  await waitFor(() => vx(a.room).vact === 2);
  const last = (p: Person, kind: string) => p.moves.filter((x) => x.kind === kind).at(-1);

  // the whip: thrown, then she's taped up — on both screens; no shots while bound
  a.room.send("mod:vortex", { move: "whip", to: sa });
  await waitFor(() => last(b, "whip")?.to === sa);
  await waitFor(() => last(a, "bound")?.to === sa && last(b, "bound")?.to === sa);
  const k0 = vx(a.room).vk;
  shoot(a);
  await sleep(400);
  assert.equal(vx(a.room).vk, k0, "bound: no shots");
  // B beside her cuts her free
  b.room.send("teleport", { to: { x: m.x - 0.8, y: m.y + 0.8, level: m.level } });
  await waitFor(() => Math.hypot(me(b.room).x - me(a.room).x, me(b.room).y - me(a.room).y) < 1.6);
  b.room.send("vortex:free", { sid: sa });
  await waitFor(() => last(a, "free")?.to === sa);

  // REW: a step away, then pulled back to where she was
  const was = { x: me(a.room).x, y: me(a.room).y };
  await sleep(600);
  a.room.send("teleport", { to: { x: was.x, y: was.y - 2, level: m.level } });
  await waitFor(() => Math.abs(me(a.room).y - (was.y - 2)) < 0.3);
  await sleep(400);
  a.room.send("mod:vortex", { move: "rew", to: sa });
  await waitFor(() => last(b, "rew")?.to === sa);
  await waitFor(() => Math.hypot(me(a.room).x - was.x, me(a.room).y - was.y) < 0.6);

  // PAUSE: her shot held (his health as it was), then back at her — hurt, not down
  a.room.send("mod:vortex", { at: { x: me(a.room).x + 2.5, y: me(a.room).y } });
  await waitFor(() => Math.abs(vx(a.room).x - (me(a.room).x + 2.5)) < 0.01);
  const hp0 = me(a.room).hp;
  const k1 = vx(a.room).vk;
  a.room.send("mod:vortex", { move: "pause" });
  await waitFor(() => !!last(b, "pause"));
  await sleep(250);
  shoot(a);
  await waitFor(() => a.hits.filter((h) => h.kind === "vortex").length >= 2);
  assert.equal(vx(a.room).vk, k1, "paused: held in the air");
  await waitFor(() => last(b, "play")?.to === sa, 5000);
  assert.ok((last(b, "play")?.n ?? 0) > 0);
  await waitFor(() => me(a.room).hp < hp0);
  assert.equal(me(a.room).downAt, 0, "hurt, never down");

  // the confiscation: her revolver gone from her hand and her quick slots, lying far off with its rounds
  a.room.send("mod:vortex", { move: "steal", to: sa });
  await waitFor(() => last(b, "steal")?.to === sa);
  assert.equal(last(b, "steal")?.item, "revolver");
  assert.ok(last(b, "steal")?.area);
  await waitFor(() => me(a.room).gun === "" && !a.inv?.quick.some((it) => it?.id === "revolver"));
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const gun = [...a.room.state.drops.values()].find((d: any) => d.item === "revolver") as any;
  assert.ok(gun, "left somewhere");
  assert.ok(Math.hypot(gun.x - me(a.room).x, gun.y - me(a.room).y) > 5, "far off");

  // the radio's blast: made to dance — on both screens
  a.room.send("mod:vortex", { move: "radio", to: sa });
  await waitFor(() => !!last(b, "radio")?.who?.includes(sa));
  await waitFor(() => b.room.state.players.get(sa)?.emote === "tape");

  // HR: sent to reception; her shots not counted a while
  a.room.send("mod:vortex", { move: "hr", to: sa });
  await waitFor(() => last(b, "hr")?.to === sa);
  await waitFor(() => Math.hypot(me(a.room).x - 2.5, me(a.room).y - 23) < 1.2);
  // (her shots not counted for 20 s wherever she is: back in the open, where a shot reaches him)
  a.room.send("teleport", { to: { x: was.x, y: was.y, level: m.level } });
  await waitFor(() => Math.hypot(me(a.room).x - was.x, me(a.room).y - was.y) < 0.6);
  await armed(a);
  a.room.send("mod:vortex", { at: { x: me(a.room).x + 2.5, y: me(a.room).y } });
  await waitFor(() => Math.abs(vx(a.room).x - (me(a.room).x + 2.5)) < 0.01);
  const k2 = vx(a.room).vk;
  const n2 = a.hits.filter((h) => h.kind === "vortex").length;
  shoot(a);
  await waitFor(() => a.hits.filter((h) => h.kind === "vortex").length > n2);
  await sleep(200);
  assert.equal(vx(a.room).vk, k2, "in HR's corner: not counted");

  // unheld, act II, B in it beside him: a move by himself within 6–9 s
  b.room.send("teleport", { to: { x: was.x - 1.5, y: was.y + 1.5, level: m.level } });
  await waitFor(() => Math.hypot(me(b.room).x - (was.x - 1.5), me(b.room).y - (was.y + 1.5)) < 0.6);
  await armed(b);
  // (in front of her as in the first test: away from A's line)
  a.room.send("mod:vortex", { at: { x: was.x - 1.5, y: was.y + 4 } });
  await waitFor(() => Math.abs(vx(b.room).y - (was.y + 4)) < 0.01);
  shoot(b);
  await waitFor(() => (a.fight.at(-1)?.who.length ?? 0) === 2);
  const before = b.moves.length;
  a.room.send("mod:vortex", { hold: false, act: 2 });
  await waitFor(() => b.moves.slice(before).some((x) => x.kind !== "play" && x.kind !== "free"), 12_000);
  a.room.send("mod:vortex", { reset: true, hold: true });
  await bye(a, b);
});

// (phase 3) act III: into it — the transformation told to both (the lights out are the clients'), the shadowed let
// in, after A, striking her; one shot dissolves; his clones — one shot pops, him none the worse; possession on her,
// no second mind game on her while it lasts, the glitch on B; his own blows, unheld, till she's down; beaten — his
// and theirs gone
test("act III: the dark, the shadowed, his clones, the mind games, his blows — down; beaten, all gone", async () => {
  const a = await person(885);
  const b = await person(886);
  const m = me(a.room);
  const sa = a.room.sessionId;
  const sb = b.room.sessionId;
  b.room.send("teleport", { to: { x: m.x - 1.5, y: m.y + 1.5, level: m.level } });
  await waitFor(() => Math.hypot(me(b.room).x - (m.x - 1.5), me(b.room).y - (m.y + 1.5)) < 0.6);
  a.room.send("mod:vortex", { reset: true, hold: true, at: { x: m.x + 2.5, y: m.y } });
  await waitFor(() => Math.abs(vx(a.room).x - (m.x + 2.5)) < 0.01);
  await armed(a);
  shoot(a);
  await waitFor(() => vx(a.room).vact === 1);
  const last = (p: Person, kind: string) => p.moves.filter((x) => x.kind === kind).at(-1);
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  const npcs = (p: Person, kind: string): any[] =>
    // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
    [...p.room.state.npcs.values()].filter((n: any) => n.kind === kind && n.id !== "vortex");

  // into act III: his face, the transformation told to both; the shadowed let in, after her
  a.room.send("mod:vortex", { act: 3 });
  await waitFor(() => vx(b.room).vact === 3 && vx(b.room).mood === "possessed");
  await waitFor(() => !!last(a, "dark") && !!last(b, "dark"));
  await waitFor(() => npcs(b, "vshade").length >= 1);
  const hp0 = me(a.room).hp;
  await waitFor(() => last(b, "strike")?.to === sa, 15_000);
  await waitFor(() => me(a.room).hp < hp0);
  // one shot: it dissolves, then it's gone
  const sh = npcs(a, "vshade")[0];
  const shId = sh.id as string;
  a.room.send("mod:vortex", { at: { x: m.x + 6, y: m.y } }); // (him out of the way)
  shoot(a, { x: sh.x, y: sh.y, z: 0.9 });
  await waitFor(() => !a.room.state.npcs.get(shId) || a.room.state.npcs.get(shId).mood === "dissolve");
  await waitFor(() => !a.room.state.npcs.get(shId), 3000);

  // his clones: two of him — one shot pops, him none the worse
  a.room.send("mod:vortex", { move: "clones" });
  await waitFor(() => last(b, "clones")?.n === 2 && npcs(b, "vortex").length === 2);
  const k = vx(a.room).vk;
  // (the nearest clone, aimed at again till one's hit — the shadowed still about may take a shot first)
  const hitsOn = (pre: string) => a.hits.filter((h) => h.id.startsWith(pre)).length;
  const onHim = hitsOn("vortex") - hitsOn("vortex:");
  for (let i = 0; i < 5 && !hitsOn("vortex:c"); i++) {
    const c = npcs(a, "vortex").sort(
      (p, q) => Math.hypot(p.x - me(a.room).x, p.y - me(a.room).y) - Math.hypot(q.x - me(a.room).x, q.y - me(a.room).y),
    )[0];
    shoot(a, { x: c.x, y: c.y, z: VORTEX_FIGHT.z0 + VORTEX_FIGHT.h / 2 });
    await sleep(900);
  }
  await waitFor(() => hitsOn("vortex:c") > 0 && !!last(b, "pop") && npcs(b, "vortex").length === 1);
  if (hitsOn("vortex") - hitsOn("vortex:") === onHim) assert.equal(vx(a.room).vk, k, "a clone: him none the worse");

  // the mind games: possession on her; nothing more on her while it lasts; the glitch on B
  a.room.send("mod:vortex", { move: "possess", to: sa });
  await waitFor(() => last(b, "possess")?.to === sa && last(b, "possess")?.ms === 3000);
  a.room.send("mod:vortex", { move: "glitch", to: sa });
  await sleep(300);
  assert.equal(last(b, "glitch"), undefined, "never two at once on one person");
  // (B in the fight first: only they're his)
  await armed(b);
  a.room.send("mod:vortex", { at: { x: m.x - 1.5, y: m.y + 4 } });
  await waitFor(() => Math.abs(vx(b.room).y - (m.y + 4)) < 0.01);
  shoot(b);
  await waitFor(() => (a.fight.at(-1)?.who.length ?? 0) === 2);
  a.room.send("mod:vortex", { move: "glitch", to: sb });
  await waitFor(() => last(a, "glitch")?.to === sb);

  // unheld, beside her: his blows (and theirs) till she's down
  a.room.send("mod:vortex", { hold: false, at: { x: me(a.room).x + 1.2, y: me(a.room).y } });
  await waitFor(() => me(a.room).downAt > 0, 25_000);

  // beaten: his clones and the shadowed gone
  a.room.send("mod:vortex", { beat: true, hold: true });
  await waitFor(() => a.down.length === 1);
  await waitFor(() => npcs(a, "vshade").length === 0 && npcs(a, "vortex").length === 0);
  a.room.send("mod:vortex", { reset: true });
  a.room.send("mod:heal", {});
  await bye(a, b);
});
