import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorldObjectDef } from "../catalog.ts";
import { doorCentre, doorRoom } from "../doors.ts";
import { getMap } from "../index.ts";
import { openingCentre, openingEdges } from "../openings.ts";
import { wallLength } from "./arc.ts";
import { wallsEdit } from "./edit.ts";
import { finishWorld } from "./finish.ts";
import { freeCuts, freeOpeningWhy, headingOf, openingAlong, placeOnWall } from "./free-openings.ts";
import { structureFromMap } from "./from-map.ts";
import { applyOps } from "./ops.ts";
import { onTiles } from "./query.ts";
import type { Wall } from "./types.ts";
import { viewOf } from "./view.ts";

// Phase 11.6 (docs/plan/72): doors and windows slid along walls drawn free, at any angle.

const studio = getMap("studio");
const s0 = structureFromMap(finishWorld(studio, studio.objects, { fresh: true, building: true }).map);
let n = 0;
const r = wallsEdit(s0, 3, [{ a: [20, 10], b: [26, 16], front: "p" }], [], () => `d${n++}`);
assert.ok("op" in r);
const s = applyOps(s0, [r.op]);
const wall = s.walls.find((w) => w.id === "d0") as Wall;
const L = Math.hypot(6, 6);
const door = (at: number, id = "door1", kind = "door"): WorldObjectDef => ({
  id,
  kind,
  ...placeOnWall(wall, at, kind),
  props: { free: true, on: { wall: wall.id, at }, level: 3 },
});

test("an opening on a 45° wall: placed from its wall, its middle where `on` says, no tile edges", () => {
  const d = door(L / 2);
  assert.ok(Math.abs((d.yaw ?? 0) - Math.PI / 4) < 1e-9, "the wall's heading");
  assert.equal(headingOf(wall), d.yaw);
  const c = openingCentre(d);
  assert.ok(Math.abs(c.x - 23) < 1e-3 && Math.abs(c.y - 13) < 1e-3, `${c.x},${c.y}`);
  const dc = doorCentre(d);
  assert.ok(Math.abs(dc.x - 23) < 1e-3 && Math.abs(dc.y - 13) < 1e-3);
  assert.deepEqual(openingEdges(d), [], "on no tile edge");
  // the spot along it nearest a point, snapped to a quarter metre and kept on the wall
  assert.equal(openingAlong(wall, [23.1, 12.9], "door"), Math.round(L / 2 / 0.25) * 0.25);
  assert.equal(openingAlong(wall, [19, 9], "door"), 0.5, "not off its end");
});

test("what it won't take: off the end, another there, a wall too low, an arc, a half wall", () => {
  const why = (at: number, others: WorldObjectDef[] = [], kind = "door") =>
    freeOpeningWhy(s, 3, kind, { wall: wall.id, at }, others);
  assert.equal(why(L / 2), null);
  assert.equal(why(0.2), "off the end of the wall");
  assert.equal(why(L / 2, [door(L / 2 + 0.5, "other")]), "another's there");
  assert.equal(why(L / 2, [door(L / 2 + 1.0, "other")]), null, "a door's width along: clear");
  assert.equal(freeOpeningWhy(s, 3, "door", { wall: "nope", at: 1 }, []), "no wall there");
  const low = applyOps(s, [{ op: "walls", remove: [wall.id], add: [{ ...wall, height: 1.1 }] }]);
  assert.equal(freeOpeningWhy(low, 3, "door", { wall: wall.id, at: L / 2 }, []), "the wall's too low");
  const half = applyOps(s, [{ op: "walls", remove: [wall.id], add: [{ ...wall, front: "h", height: 0.868 }] }]);
  assert.equal(freeOpeningWhy(half, 3, "door", { wall: wall.id, at: L / 2 }, []), "that wall takes no door");
  // a gentle arc takes one (across its curve); a tight one doesn't
  const arc = applyOps(s, [{ op: "walls", remove: [wall.id], add: [{ ...wall, bow: 1 }] }]);
  assert.equal(freeOpeningWhy(arc, 3, "door", { wall: wall.id, at: 4 }, []), null);
  const tight = applyOps(s, [
    { op: "walls", remove: [wall.id], add: [{ ...wall, b: [21.2, 10], bow: 0.6 } as typeof wall] },
  ]);
  assert.equal(freeOpeningWhy(tight, 3, "door", { wall: wall.id, at: 0.94 }, []), "too tight a curve");
  // a wall on the tile lines takes the tile tool's (by its edges: drawn edge by edge, a free one's hole
  // would never be cut in it)
  const f3 = s.floors.find((f) => f.index === 3);
  const tiled = s.walls.find((w) => w.floor === 3 && f3 && onTiles(w, f3) && w.front === "p" && wallLength(w) >= 2);
  assert.ok(tiled);
  const why2 = freeOpeningWhy(s, 3, "door", { wall: tiled.id, at: 1 }, []);
  assert.equal(why2, "that wall takes doors and windows by its tiles");
});

test("its hole: in the wall's cuts (drawn and in Jolt) where it is along the wall", async () => {
  const { cutsOf } = await import("../physics/structure-solids.ts");
  const { buildingSolids } = await import("../physics/build.ts");
  const d = door(L / 2);
  const c = freeCuts([d], wall.id);
  assert.equal(c.length, 1);
  assert.ok(Math.abs(c[0].u0 - (L / 2 - 0.5)) < 1e-6 && Math.abs(c[0].u1 - (L / 2 + 0.5)) < 1e-6);
  assert.equal(cutsOf(s, [d], 3).get(wall.id)?.length, 1);
  // Jolt: the wall's boxes leave the doorway open below the door's top
  const b = buildingSolids(viewOf(s), [d], s);
  const boxes = [...b.statics.entries()]
    .filter(([k]) => k.startsWith("wall:3:"))
    .flatMap(([, v]) => v.solids)
    .filter((q) => q.t === "box");
  const at = (x: number, z: number, y: number) =>
    boxes.some((q) => q.t === "box" && Math.hypot(q.x - x, q.z - z) < 0.3 && Math.abs(q.y - y) <= q.hy + 1e-6);
  const base = s.floors.find((f) => f.index === 3)?.z ?? 0;
  assert.ok(!at(23, 13, base + 1), "open where the door is");
  assert.ok(at(23, 13, base + 3), "the wall over it");
  assert.ok(at(21, 11, base + 1), "the wall beside it");
});

test("a door in a wall drawn free belongs to the room on one side of it", () => {
  const map = viewOf(s);
  const lm = map.levels?.find((l) => l.index === 3);
  assert.ok(lm);
  const d = door(L / 2);
  const room = doorRoom(
    { ...map, areas: [{ key: "nook", name: "Nook", kind: "private", x: 23, y: 10, w: 3, h: 3 }] },
    d,
  );
  assert.equal(room?.key, "nook");
});

test("a door in an arc: placed across its curve, its hole cut from the chords it crosses", async () => {
  const { buildingSolids } = await import("../physics/build.ts");
  const { wallPoint, wallLength } = await import("./arc.ts");
  const arc = applyOps(s, [{ op: "walls", remove: [wall.id], add: [{ ...wall, bow: 1.5 }] }]);
  const w = arc.walls.find((q) => q.id === wall.id) as Wall;
  const Lc = wallLength(w);
  const at = Lc / 2;
  const p = placeOnWall(w, at, "door");
  const start = wallPoint(w, (at - 0.5) / Lc);
  assert.ok(Math.hypot(p.x - start[0], p.y - start[1]) < 1e-3, "it starts on the curve");
  const d: WorldObjectDef = { id: "da", kind: "door", ...p, props: { free: true, on: { wall: w.id, at }, level: 3 } };
  const b = buildingSolids(viewOf(arc), [d], arc);
  const boxes = [...b.statics.entries()]
    .filter(([k]) => k.startsWith("wall:3:"))
    .flatMap(([, v]) => v.solids)
    .filter((q) => q.t === "box");
  const top = wallPoint(w, 0.5);
  const base = arc.floors.find((f) => f.index === 3)?.z ?? 0;
  const near = (y: number) =>
    boxes.some(
      (q) => q.t === "box" && Math.hypot(q.x - top[0], q.z - top[1]) < 0.3 && Math.abs(q.y - y) <= q.hy + 1e-6,
    );
  assert.ok(!near(base + 1), "open where the door is");
  assert.ok(near(base + 3), "the wall over it");
});

// plan 130 phase 8: a door or window's own width, height and sill; joined windows; looks, shutters, curtains
import { openingCutOf, openingSizeWhy, openingSpanOf } from "../openings.ts";

test("its own size: the hole, its place along the wall, what's checked", () => {
  const props = { free: true, on: { wall: wall.id, at: L / 2 }, ow: 2.4, oh: 1.2, sill: 0.6 };
  const w: WorldObjectDef = { id: "w1", kind: "window", ...placeOnWall(wall, L / 2, { kind: "window", props }), props };
  assert.equal(openingSpanOf(w), 2.4);
  assert.deepEqual(openingCutOf(w), [0.6, 1.8]);
  const cut = freeCuts([w], wall.id)[0];
  assert.ok(Math.abs(cut.u1 - cut.u0 - 2.4) < 1e-9 && cut.z0 === 0.6 && cut.z1 === 1.8);
  // (its start 1.2 m back from its middle, along the wall)
  assert.ok(Math.abs(Math.hypot(w.x - 23, w.y - 13) - 1.2) < 1e-3);
  const why = (p: Record<string, unknown>, others: WorldObjectDef[] = [], at = L / 2) =>
    freeOpeningWhy(s, 3, { kind: "window", props: { ...p, free: true } }, { wall: wall.id, at }, others);
  assert.equal(why({ ow: 2.4, oh: 1.2, sill: 0.6 }), null);
  assert.equal(why({ ow: 9 }), "not a width it comes in");
  assert.equal(why({ oh: 2.4, sill: 1.8 }), "the wall's too low");
  assert.equal(why({ ow: 7.5 }), "not a width it comes in");
  // (windows joined: one starting where the other ends)
  assert.equal(why({ ow: 1 }, [w], L / 2 + 1.7), null, "side by side");
  assert.equal(why({ ow: 1 }, [w], L / 2 + 1.6), "another's there");
  assert.equal(openingSizeWhy({ kind: "door", props: { sill: 1 } }), "a door has no sill");
  assert.equal(openingSizeWhy({ kind: "door", props: { look: "french" } }), null);
  assert.equal(openingSizeWhy({ kind: "window", props: { look: "french" } }), "not a look it comes in");
  assert.equal(openingSizeWhy({ kind: "window", props: { shutters: "#335544", curtains: "#aa2222" } }), null);
  assert.equal(openingSizeWhy({ kind: "door", props: { shutters: "#335544" } }), "no shutters like that");
  // (a tile line's door: the catalog's size whatever it says)
  assert.equal(openingSpanOf({ kind: "door", props: { ow: 2 } }), 1);
});

test("a home lot's walls on the tile lines take them free", () => {
  const f = s.floors.find((q) => q.index === 3);
  assert.ok(f);
  const tw: Wall = {
    id: "tw",
    floor: 3,
    a: [f.grid.x0 + 2, f.grid.y0 + 2],
    b: [f.grid.x0 + 8, f.grid.y0 + 2],
    front: "p",
    base: f.z,
    height: 3.266,
  } as Wall;
  const st = { walls: [tw], floors: [{ ...f }] };
  const on = { wall: "tw", at: 3 };
  assert.ok(onTiles(tw, f), "on the tile lines");
  {
    assert.equal(freeOpeningWhy(st, 3, "window", on, []), "that wall takes doors and windows by its tiles");
    assert.equal(freeOpeningWhy({ ...st, floors: [{ ...f, space: "home:x" }] }, 3, "window", on, []), null);
  }
});
