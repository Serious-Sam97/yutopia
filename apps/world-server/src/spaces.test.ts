/* biome-ignore-all lint/suspicious/noExplicitAny: decoded schema state */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import type { Structure } from "@yutopia/shared/structure";
import { Client, type Room } from "colyseus.js";

// The town's buildings' insides on the world server (docs/plan/112-the-insides.md, 113): every building you walk
// into has its storeys in the structure, laid at the start; a member's edit there is refused, an admin's taken; a
// God mode publish that moves a building carries its inside with it — its walls, its things — and one that would
// leave what's built outside it is refused, with why. (Offline: the drafts kept in the server.)
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 30700 + Math.floor(Math.random() * 100);
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
async function waitFor(fn: () => boolean, ms = 15_000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}
async function join(uid: number, roles: string) {
  const room: Room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: 5701,
    token: `dev:${uid}:P${uid}:${roles}`,
  });
  rooms.push(room);
  const said: { type: string; msg: Record<string, unknown> }[] = [];
  room.onMessage("*", (type, msg) => said.push({ type: String(type), msg }));
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  return { room, said };
}
async function structure(p: {
  room: Room;
  said: { type: string; msg: Record<string, unknown> }[];
}): Promise<Structure> {
  p.said.length = 0;
  p.room.send("struct:get", {});
  await waitFor(() => p.said.some((s) => s.type === "struct:full"));
  return (p.said.find((s) => s.type === "struct:full")?.msg as { structure: Structure }).structure;
}
const thing = (room: Room, id: string) =>
  [...room.state.objects.values()].find((o: any) => o.id === id) as { x: number; y: number } | undefined;

test("a town building's inside: laid; a member's edit refused, an admin's taken; moved with its building", async () => {
  const a = await join(71, "member,builder,admin");
  const m = await join(72, "member,builder");
  const st = await structure(a);
  const bar = st.floors.filter((f) => f.space === "bar").sort((p, q) => (p.storey ?? 0) - (q.storey ?? 0));
  assert.equal(bar.length, 2, "the bar's two storeys");
  assert.ok(st.floors.filter((f) => f.space).length > 40, "the town's storeys laid");
  const g = bar[0].index;
  const x0 = bar[0].grid.x0;
  const z0 = bar[0].grid.y0;
  // (its laid things: the bar counter, the stools…)
  const on = [...a.room.state.objects.values()].filter((o: any) => JSON.parse(o.props || "{}").level === g);
  assert.ok(
    on.some((o: any) => o.kind === "bar_counter"),
    "its bar",
  );
  const wall = { level: g, add: [{ a: [x0 + 4, z0 + 12.5], b: [x0 + 4, z0 + 13.5], front: "p" }], remove: [] };
  m.said.length = 0;
  m.room.send("struct:walls", wall);
  await waitFor(() => m.said.some((s) => s.type === "toast" && /Only admins/.test(String(s.msg.text))));
  a.said.length = 0;
  a.room.send("struct:walls", wall);
  await waitFor(() => a.said.some((s) => s.type === "struct:walls:ok"));
  m.said.length = 0;
  m.room.send("obj:put", {
    id: "t-sofa-m",
    kind: "sofa",
    x: x0 + 6,
    y: z0 + 13,
    yaw: 0,
    props: { level: g, free: true },
  });
  await waitFor(() => m.said.some((s) => s.type === "toast" && /only admins/.test(String(s.msg.text))));
  a.room.send("obj:put", {
    id: "t-sofa",
    kind: "sofa",
    x: x0 + 6,
    y: z0 + 13,
    yaw: 0,
    props: { level: g, free: true },
  });
  await waitFor(() => !!thing(a.room, "t-sofa"));
  assert.ok(!thing(a.room, "t-sofa-m"), "the member's: not put");
  // the shell: never taken away
  const shell = st.walls.find((w) => w.floor === g && w.shell);
  assert.ok(shell);
  a.said.length = 0;
  a.room.send("struct:walls", { level: g, add: [], remove: [shell.id] });
  await waitFor(() => a.said.some((s) => s.type === "toast" && /building's own wall/.test(String(s.msg.text))));

  // a publish moving the bar 2 m east: its inside with it — and whoever's standing in it (plan 113 review)
  const me = () => a.room.state.players.get(a.room.sessionId) as { x: number; y: number; level: number };
  a.room.send("teleport", { to: { x: x0 + 9, y: z0 + 6, level: g } });
  await waitFor(() => me().level === g);
  const stood = { x: me().x, y: me().y };
  offlineDrafts.set(701, {
    userId: 71,
    name: "The bar along",
    baseRev: 0,
    data: { rev: 0, buildings: { change: { bar: { x0: x0 + 2, x1: x0 + 18 } } } },
  });
  a.said.length = 0;
  a.room.send("god:publish", { draftId: 701 });
  await waitFor(() => a.said.some((s) => s.type === "god:published" || s.type === "god:refused"));
  const refused = a.said.find((s) => s.type === "god:refused");
  assert.ok(!refused, `published: ${JSON.stringify(refused?.msg)}`);
  await waitFor(() => (thing(a.room, "t-sofa")?.x ?? 0) > x0 + 7.9);
  const after = await structure(a);
  const g2 = after.floors.find((f) => f.index === g);
  assert.equal(g2?.grid.x0, x0 + 2, "its storey moved");
  const mine = after.walls.find((w) => w.floor === g && !w.shell);
  assert.deepEqual(mine?.a, [x0 + 6, z0 + 12.5], "the admin's wall with it");
  assert.equal(thing(a.room, "t-sofa")?.x, x0 + 8, "the sofa with it");
  await waitFor(() => Math.abs(me().x - (stood.x + 2)) < 0.01);
  assert.equal(me().level, g, "still in it");
  assert.ok(Math.abs(me().y - stood.y) < 0.01, "moved with it");

  // one that'd leave the sofa outside it: refused, with why
  offlineDrafts.set(702, {
    userId: 71,
    name: "The bar narrowed",
    baseRev: 1,
    data: { rev: 0, buildings: { change: { bar: { x0: x0 + 2, x1: x0 + 10 } } } },
  });
  a.said.length = 0;
  a.room.send("god:publish", { draftId: 702 });
  await waitFor(() => a.said.some((s) => s.type === "god:published" || s.type === "god:refused"));
  const why = a.said.find((s) => s.type === "god:refused")?.msg as { problems?: string[] } | undefined;
  assert.ok(
    why?.problems?.some((p) => /smaller than what's built/.test(p)),
    JSON.stringify(why),
  );

  // made empty in a publish: its laid furniture taken away (the admin's sofa kept); furnished again: back
  const counters = () => [...a.room.state.objects.values()].filter((o: any) => o.id.startsWith("sp-bar-p")).length;
  assert.ok(counters() > 50, `${counters()} laid pieces`);
  offlineDrafts.set(703, {
    userId: 71,
    name: "The bar emptied",
    baseRev: 1,
    data: { rev: 0, buildings: { change: { bar: { x0: x0 + 2, x1: x0 + 18, enter: false } } } },
  });
  a.room.send("god:publish", { draftId: 703 });
  await waitFor(() => counters() === 0);
  assert.ok(thing(a.room, "t-sofa"), "the admin's own kept");
  offlineDrafts.set(704, {
    userId: 71,
    name: "The bar again",
    baseRev: 2,
    data: { rev: 0, buildings: { change: { bar: { x0: x0 + 2, x1: x0 + 18, enter: true } } } },
  });
  a.room.send("god:publish", { draftId: 704 });
  await waitFor(() => counters() > 50);
  const c = [...a.room.state.objects.values()].find(
    (o: any) => o.id.startsWith("sp-bar-p") && o.kind === "bar_counter",
  ) as any;
  assert.ok(c && c.x > x0 + 2 + 13, "laid where the bar stands now");
});

test("plan 113's second review: nothing in through the land's floor, no member's desk there, no undo or rollback past what's built, a way in at every door", async () => {
  const a = await join(73, "member,builder,admin");
  const m = await join(74, "member,builder");
  const st = await structure(a);
  const fh = st.floors.find((f) => f.space === "farmhouse" && f.storey === 0);
  assert.ok(fh);
  const { x0, y0 } = fh.grid;
  const toast = (p: { said: { type: string; msg: Record<string, unknown> }[] }, re: RegExp) =>
    waitFor(() => p.said.some((s) => s.type === "toast" && re.test(String(s.msg.text))));

  // a thing put on the land's floor inside a town building's plot: refused, a member's and an admin's alike
  m.said.length = 0;
  m.room.send("obj:put", { id: "t-land", kind: "sofa", x: x0 + 6, y: y0 + 5, yaw: 0, props: { level: 0 } });
  await toast(m, /inside a town building/);
  m.said.length = 0;
  m.room.send("obj:batch", {
    items: [{ id: "t-land-b", kind: "chair", x: x0 + 6, y: y0 + 6, yaw: 0, props: { level: 0 } }],
  });
  await toast(m, /inside a town building/);
  assert.ok(!thing(a.room, "t-land") && !thing(a.room, "t-land-b"));

  // a member's desk made of a town building's thing: refused
  const laid = [...a.room.state.objects.values()].find((o: any) => o.id.startsWith("sp-farmhouse-p")) as any;
  assert.ok(laid);
  m.said.length = 0;
  m.room.send("desk:assign", { id: laid.id, ownerId: 74, ownerName: "P74" });
  await toast(m, /Only admins/);
  assert.ok(!JSON.parse(laid.props || "{}").desk, "not made a desk");

  // an admin's wall in it, then a publish that moves it: that step's not undone where the building was
  a.said.length = 0;
  a.room.send("struct:walls", {
    level: fh.index,
    add: [{ a: [x0 + 2, y0 + 9], b: [x0 + 4, y0 + 9], front: "p" }],
    remove: [],
  });
  await waitFor(() => a.said.some((s) => s.type === "struct:walls:ok"));
  await sleep(900); // (its step closes, quiet)
  const rev = a.room.state.groundsRev as number;
  offlineDrafts.set(711, {
    userId: 73,
    name: "The farmhouse along",
    baseRev: rev,
    data: { rev: 0, buildings: { change: { farmhouse: { x0: x0 + 30, x1: x0 + 30 + fh.grid.w } } } },
  });
  a.said.length = 0;
  a.room.send("god:publish", { draftId: 711 });
  await waitFor(() => a.said.some((s) => s.type === "god:published" || s.type === "god:refused"));
  assert.ok(
    !a.said.some((s) => s.type === "god:refused"),
    JSON.stringify(a.said.find((s) => s.type === "god:refused")?.msg),
  );
  a.said.length = 0;
  a.room.send("build:undo", {});
  await toast(a, /publish changed the town since/);
  const moved = await structure(a);
  const mine = moved.walls.find((w) => w.floor === fh.index && !w.shell && !w.id.startsWith("sp-"));
  assert.ok(mine && mine.a[0] === x0 + 32, "the wall where the farmhouse is now, kept");

  // widened in a publish, a chair in its new part since, then a rollback to before it: refused, with why (one that
  // only moves it back carries what's in it — a move's never refused)
  const moved1 = a.room.state.groundsRev as number;
  offlineDrafts.set(712, {
    userId: 73,
    name: "The farmhouse wider",
    baseRev: moved1,
    data: { rev: 0, buildings: { change: { farmhouse: { x0: x0 + 30, x1: x0 + 30 + fh.grid.w + 6 } } } },
  });
  a.said.length = 0;
  a.room.send("god:publish", { draftId: 712 });
  await waitFor(() => a.said.some((s) => s.type === "god:published" || s.type === "god:refused"));
  assert.ok(
    !a.said.some((s) => s.type === "god:refused"),
    JSON.stringify(a.said.find((s) => s.type === "god:refused")?.msg),
  );
  a.room.send("obj:put", {
    id: "t-chair",
    kind: "chair",
    x: x0 + 30 + fh.grid.w + 3,
    y: y0 + 2,
    yaw: 0,
    props: { level: fh.index },
  });
  await waitFor(() => !!thing(a.room, "t-chair"));
  a.said.length = 0;
  a.room.send("god:rollback", { rev: moved1 });
  await waitFor(() => a.said.some((s) => s.type === "god:published" || s.type === "god:refused"));
  const why = a.said.find((s) => s.type === "god:refused")?.msg as { problems?: string[] } | undefined;
  assert.ok(
    why?.problems?.some((p) => /Farmhouse: smaller than what's built/.test(p)),
    JSON.stringify(why),
  );

  // a way in from the street at the church's door (its tower's out in front) and the lake boathouse's (over its jetty)
  for (const key of ["church", "lake-boathouse"]) {
    const g = moved.floors.find((f) => f.space === key && f.storey === 0);
    assert.ok(g, key);
    const inside = { x: g.grid.x0 + g.grid.w / 2, y: g.grid.y0 + g.grid.h / 2 };
    // (from the street before its door: its front's the plot's far side from the inside's middle — the layout's)
    const door = key === "church" ? { x: inside.x, y: g.grid.y0 + g.grid.h + 6 } : { x: inside.x, y: g.grid.y0 - 4 };
    a.room.send("teleport", { to: { ...door, level: 0 } });
    await waitFor(() => {
      const p = a.room.state.players.get(a.room.sessionId);
      return p?.level === 0 && Math.hypot(p.x - door.x, p.y - door.y) < 1.5;
    }, 30_000);
    a.said.length = 0;
    a.room.send("way", { n: 9, x: inside.x, y: inside.y, fx: door.x, fy: door.y });
    await waitFor(() => a.said.some((s) => s.type === "way"), 60_000);
    const pts = (a.said.find((s) => s.type === "way")?.msg as { pts: [number, number][] | null }).pts;
    assert.ok(pts?.length, `${key}: a way in`);
    const end = pts[pts.length - 1];
    assert.ok(Math.hypot(end[0] - inside.x, end[1] - inside.y) < 0.6, `${key}: to its middle (${end})`);
  }
});
