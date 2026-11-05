import assert from "node:assert/strict";
import { test } from "node:test";
import { getMap } from "../index.ts";
import type { MapDef } from "../map.ts";
import { WALL_H } from "../units.ts";
import { doorways, floorFaces, roomOutline, wallFaces } from "./faces.ts";
import { structureFromMap } from "./from-map.ts";
import { applyOps, diffStructures, invertOps } from "./ops.ts";
import { area2, cellsOf, inRing, traceRegion } from "./rings.ts";
import { mapDiff, roundTrip } from "./roundtrip.ts";
import { mapFromStructure } from "./to-map.ts";
import type { Wall } from "./types.ts";

// Plan 72 phase 6: the structure (walls as segments, floors as slabs, rooms as polygons, in world
// metres) holds everything the tile maps did — they come back from it the same.

let seed = 7;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

function randomGrid(w: number, h: number) {
  const tiles = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => pick([" ", " ", ".", ".", ",", "_", "a"])).join(""),
  );
  const edge = () => pick([".", ".", ".", ".", "p", "p", "w", "b", "g", "h", "P", "K"]);
  const hWalls = Array.from({ length: h + 1 }, () => Array.from({ length: w }, edge).join(""));
  const vWalls = Array.from({ length: h }, () => Array.from({ length: w + 1 }, edge).join(""));
  const back = (r: string) =>
    [...r].map((c) => ("pwfbkPWFBK".includes(c) && rnd() < 0.3 ? pick(["w", "b", "k"]) : ".")).join("");
  return { width: w, height: h, tiles, hWalls, vWalls, hBacks: hWalls.map(back), vBacks: vWalls.map(back) };
}

test("a region's rings: a square with a hole, two squares touching at a corner — the cells come back", () => {
  const cells = ["####.", "#..#.", "####.", "....#", "...#."];
  const has = (x: number, y: number) => cells[y][x] === "#";
  const shapes = traceRegion(5, 5, has, 10, 20);
  assert.equal(shapes.length, 3, "the frame, and the two diagonal cells each their own");
  const frame = shapes.find((s) => s.holes.length) as (typeof shapes)[number];
  assert.equal(frame.outline.length, 4, "the frame: a rectangle (collinear corners dropped)");
  assert.equal(frame.holes[0].length, 4, "its hole too");
  assert.ok(area2(frame.outline) * area2(frame.holes[0]) < 0, "an outline and its hole wind opposite ways");
  const got = Array.from({ length: 5 }, () => Array(5).fill("."));
  for (const s of shapes)
    cellsOf(s.outline, s.holes, 5, 5, 10, 20, (x, y) => {
      got[y][x] = "#";
    });
  assert.deepEqual(
    got.map((r) => r.join("")),
    cells,
  );
});

test("the studio as a structure: world metres, walls joined along their runs, the rooms with all they kept", () => {
  const m = getMap("studio");
  const s = structureFromMap(m);
  assert.equal(s.version, 4);
  assert.ok(s.walls.length < m.hWalls.join("").replace(/\./g, "").length, "runs of edges are one wall");
  for (const w of s.walls) {
    assert.ok(w.a[0] === w.b[0] || w.a[1] === w.b[1], "along x or along y (the tile tool's)");
    assert.ok(w.height === WALL_H || w.front === "h");
  }
  for (const r of s.rooms) {
    const a = m.areas.find((x) => x.key === r.key);
    assert.ok(a);
    assert.equal(r.props.name, a.name);
  }
  assert.deepEqual(roundTrip(m), []);
});

test("random maps of several floors come back the same, faces, windows, half walls and all", () => {
  for (let i = 0; i < 40; i++) {
    const g = randomGrid(4 + Math.floor(rnd() * 9), 3 + Math.floor(rnd() * 9));
    const other = randomGrid(3 + Math.floor(rnd() * 7), 3 + Math.floor(rnd() * 7));
    const m: MapDef = {
      key: "t",
      name: "Test",
      ...g,
      spawn: { x: 1.5, y: 1.5 },
      areas: [{ key: "a", name: "Room A", kind: "private", x: 0, y: 0, w: 2, h: 2, ownerId: 9, priority: 2 }],
      objects: [],
      floor: 2,
      levels: [
        {
          index: 0,
          name: "Ground",
          ox: -5 + Math.floor(rnd() * 10),
          oy: -3,
          outdoor: rnd() < 0.5,
          ...other,
          areas: [{ key: "b", name: "Lobby", kind: "open", x: 1, y: 1, w: 1, h: 2 }],
          spawn: { x: 0.5, y: 0.5 },
        },
      ],
      core: { x: 1, y: 1 },
    };
    const back = mapFromStructure(structureFromMap(m));
    assert.deepEqual(mapDiff(m, back), [], `map ${i}`);
  }
});

test("edits as operations: what turns one into the other, applied, read the same; undone, the first comes back", () => {
  const studio = getMap("studio");
  for (let i = 0; i < 25; i++) {
    const g1 = randomGrid(9, 7);
    const g2 = { ...randomGrid(9, 7), tiles: rnd() < 0.5 ? g1.tiles : randomGrid(9, 7).tiles };
    const a = structureFromMap({
      ...studio,
      ...g1,
      areas: studio.areas.slice(0, 2),
      levels: undefined,
      floor: undefined,
    });
    const b = structureFromMap({
      ...studio,
      ...g2,
      areas: rnd() < 0.5 ? studio.areas.slice(0, 2) : studio.areas.slice(1, 4),
      spawn: rnd() < 0.5 ? studio.spawn : { x: 2.5, y: 3.5 },
      levels: undefined,
      floor: undefined,
    });
    const ops = diffStructures(a, b);
    const c = applyOps(a, ops);
    assert.deepEqual(mapDiff(mapFromStructure(b), mapFromStructure(c)), [], `edit ${i}`);
    assert.deepEqual(diffStructures(c, b), [], "nothing left between them");
    const undo = invertOps(a, ops);
    assert.deepEqual(mapDiff(mapFromStructure(a), mapFromStructure(applyOps(c, undo))), [], `undo ${i}`);
  }
  // a wall taken away that isn't there, or put in twice: refused
  const s = structureFromMap(studio);
  assert.throws(() => applyOps(s, [{ op: "walls", remove: ["nope"], add: [] }]));
  assert.throws(() => applyOps(s, [{ op: "walls", remove: [], add: [s.walls[0]] }]));
});

test("rooms from the walls: an L-shaped room is its L, two rooms in one space keep their rectangles, a slanted wall closes a face", () => {
  const seg = (a: [number, number], b: [number, number]) => ({ a, b });
  // an L (6×6 with its top-right 3×3 out) and, inside its foot, a free-standing pillar's box
  const L = [
    seg([0, 0], [3, 0]),
    seg([3, 0], [3, 3]),
    seg([3, 3], [6, 3]),
    seg([6, 3], [6, 6]),
    seg([6, 6], [0, 6]),
    seg([0, 6], [0, 0]),
    // a wall poking in from the side: no face of its own
    seg([0, 4], [1, 4]),
  ];
  const faces = wallFaces(L);
  assert.equal(faces.length, 1, "one enclosed face (the poke doesn't close anything)");
  assert.ok(area2(faces[0].outline) < 0, "walked the way outlines are");
  assert.equal(Math.abs(area2(faces[0].outline)) / 2, 27, "the L's area");
  // the room drawn as the L's lower rectangle: its outline is the L
  assert.equal(roomOutline([0, 3, 6, 6], faces, []).length, 6);
  // a second room's middle in the same face: both keep their rectangles
  assert.equal(roomOutline([0, 3, 6, 6], faces, [[0, 0, 3, 3]]).length, 4);
  // walls crossing (a +), a diagonal across a square: split where they meet
  const plus = wallFaces([
    seg([0, 0], [4, 0]),
    seg([4, 0], [4, 4]),
    seg([4, 4], [0, 4]),
    seg([0, 4], [0, 0]),
    seg([2, 0], [2, 4]),
    seg([0, 2], [4, 2]),
    seg([0, 0], [2, 2]),
  ]);
  assert.equal(plus.length, 5, "four quarters, one of them cut in two");
  assert.equal(
    plus.reduce((t, f) => t + Math.abs(area2(f.outline)) / 2, 0),
    16,
  );
  // a box inside a room: the room's hole
  const ring = wallFaces([
    seg([0, 0], [5, 0]),
    seg([5, 0], [5, 5]),
    seg([5, 5], [0, 5]),
    seg([0, 5], [0, 0]),
    seg([2, 2], [3, 2]),
    seg([3, 2], [3, 3]),
    seg([3, 3], [2, 3]),
    seg([2, 3], [2, 2]),
  ]);
  const big = ring.find((f) => f.holes.length);
  assert.ok(big && inRing(big.holes[0], 2.5, 2.5));
});

test("a room closes across its doorway (a gap of up to 2 m between walls in line), not across an open side", () => {
  const room = (gap: number) => {
    const walls = [
      [
        [0, 0],
        [4, 0],
      ],
      [
        [4, 0],
        [4, 6],
      ],
      [
        [4, 6],
        [0, 6],
      ],
      [
        [0, 6],
        [0, 2 + gap],
      ],
      [
        [0, 2],
        [0, 0],
      ],
    ].map(([a, b], i) => ({ id: `w${i}`, floor: 0, a, b, base: 0, height: 3, front: "p" }) as Wall);
    return floorFaces({ walls }, 0);
  };
  assert.equal(room(1).length, 1, "a door's gap: closed");
  assert.equal(room(2).length, 1, "two metres: closed");
  assert.equal(room(2.5).length, 0, "wider: an open side");
  assert.deepEqual(
    doorways([
      { a: [0, 0], b: [3, 0] },
      { a: [5, 0], b: [9, 0] },
    ]),
    [{ a: [3, 0], b: [5, 0] }],
  );
});

test("rooms from the walls on today's worlds: every room's outline holds its own rectangle", () => {
  const s = structureFromMap(getMap("studio"));
  let faced = 0;
  for (const r of s.rooms) {
    const [x0, y0, x1, y1] = r.rect;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) assert.ok(inRing(r.outline, x + 0.5, y + 0.5), r.key);
    if (r.outline.length !== 4 || Math.abs(area2(r.outline)) / 2 !== (x1 - x0) * (y1 - y0)) faced++;
  }
  assert.ok(s.rooms.length > 3);
  void faced;
});

test("the one frame: an older map's floors, rooms and things in the world's — the same places, the tiles the same", async () => {
  const { foldMap, foldThing, localView, dressIn } = await import("./fold.ts");
  const { hWall, tileAt, vWall } = await import("../map.ts");
  const { levelMap, offsetOf } = await import("../levels.ts");
  for (let i = 0; i < 12; i++) {
    const g = randomGrid(4 + Math.floor(rnd() * 6), 3 + Math.floor(rnd() * 6));
    const other = randomGrid(3 + Math.floor(rnd() * 6), 3 + Math.floor(rnd() * 6));
    const [ox, oy] = [-7 + Math.floor(rnd() * 14), -4 + Math.floor(rnd() * 8)];
    const old: MapDef = {
      key: "t",
      name: "Test",
      ...g,
      spawn: { x: 1.5, y: 1.5 },
      areas: [{ key: "a", name: "A", kind: "open", x: 0, y: 0, w: 2, h: 2 }],
      objects: [],
      floor: 1,
      levels: [
        {
          index: 0,
          name: "Ground",
          ox,
          oy,
          ...other,
          areas: [
            { key: "b", name: "B", kind: "open", x: 1, y: 1, w: 2, h: 2, dressOff: ["d-b-plant-2-2", "d-b-f1-1"] },
          ],
          spawn: { x: 0.5, y: 0.5 },
        },
      ],
    };
    const w = foldMap(old);
    assert.ok(w.world);
    // a thing on the ground floor: moved by its corner; on the home floor: where it was
    const t = foldThing(old, { id: "t", kind: "plant", x: 2, y: 1, yaw: 0, props: { level: 0 } });
    assert.deepEqual([t.x, t.y], [2 + ox, 1 + oy]);
    assert.deepEqual(foldThing(old, { id: "h", kind: "plant", x: 2, y: 1, yaw: 0 }), {
      id: "h",
      kind: "plant",
      x: 2,
      y: 1,
      yaw: 0,
    });
    const g0 = levelMap(w, 0) as MapDef;
    assert.deepEqual(offsetOf(w, 0), { x: ox, y: oy });
    assert.deepEqual([g0.areas[0].x, g0.areas[0].y], [1 + ox, 1 + oy], "a room: the world's");
    assert.deepEqual(g0.areas[0].dressOff, ["d-b-plant-1-1", "d-b-f0-0"], "its dressing kept from its own corner");
    assert.equal(dressIn("d-x-y-plant-5-7", 2, 3), "d-x-y-plant-3-4");
    // the floor as drawn (its own frame) is the older one
    const lv = localView(g0);
    assert.deepEqual(lv.areas[0], { ...old.levels?.[0].areas[0], dressOff: g0.areas[0].dressOff });
    // the floor asked at world places answers as the older one did at its own: its tiles and walls
    const go = levelMap(old, 0) as MapDef;
    for (let y = -1; y <= other.height; y++)
      for (let x = -1; x <= other.width; x++) {
        assert.equal(tileAt(g0, x + ox, y + oy), tileAt(go, x, y), `tile ${x},${y}`);
        assert.equal(hWall(g0, x + ox, y + oy), hWall(go, x, y), `h wall ${x},${y}`);
        assert.equal(vWall(g0, x + ox, y + oy), vWall(go, x, y), `v wall ${x},${y}`);
      }
    // and back through a structure
    assert.deepEqual(mapDiff(w, mapFromStructure(structureFromMap(w))), []);
  }
});

test("doors, windows and hung things fixed to their walls: each one's wall under its middle, put back there", async () => {
  const { attachAll, attachable, onOf, pointOn } = await import("./attach.ts");
  const { finishWorld } = await import("./finish.ts");
  const { objLevel } = await import("../levels.ts");
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const s = structureFromMap(done.map);
  const { objects, changed } = attachAll(s, done.objects, (o) => objLevel(o, done.map));
  const fixed = objects.filter((o) => attachable(o.kind));
  assert.ok(fixed.length > 50, `${fixed.length} doors, windows and hung things`);
  assert.equal(changed.length, fixed.length);
  for (const o of fixed) {
    const on = onOf(o);
    assert.ok(on, `${o.kind} ${o.id} on a wall`);
    const w = s.walls.find((x) => x.id === on.wall);
    assert.ok(w && w.floor === objLevel(o, done.map), `${o.id}: a wall of its floor`);
    const p = pointOn(s, on) as [number, number];
    assert.ok(p && Number.isFinite(p[0]), o.id);
  }
  // again: nothing changes
  assert.equal(attachAll(s, objects, (o) => objLevel(o, done.map)).changed.length, 0);
});

test("stairs and lifts as connectors: each staircase joins its floor to the next, each lift every floor it stops at", async () => {
  const { connectorsOf } = await import("./connectors.ts");
  const { finishWorld } = await import("./finish.ts");
  const { elevOf } = await import("../levels.ts");
  const { inRing: inside } = await import("./rings.ts");
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const cs = connectorsOf(done.map, done.objects);
  const stairs = cs.filter((c) => c.kind === "stairs");
  const lifts = cs.filter((c) => c.kind === "lift");
  assert.ok(stairs.length >= 4, `${stairs.length} staircases`);
  for (const c of stairs) {
    const [lo, hi] = c.stops;
    assert.equal(hi.floor, lo.floor + 1);
    assert.equal(hi.z - lo.z, elevOf(1) - elevOf(0));
    // the treads from the floor's height to the next's
    const hs = (c.ramps ?? []).flatMap((r) => [r.h0, r.h1]);
    assert.equal(Math.min(...hs), lo.z);
    assert.equal(Math.max(...hs), hi.z);
    // where you get on and off: inside its footprint
    for (const s of c.stops) assert.ok(inside(c.outline, s.at[0], s.at[1]), `${c.id} floor ${s.floor}`);
  }
  assert.ok(lifts.length >= 2, `${lifts.length} lifts`);
  for (const c of lifts) {
    const fl = c.stops.map((s) => s.floor);
    assert.deepEqual(
      fl,
      [...fl].sort((a, b) => a - b),
      "bottom up",
    );
    assert.ok(fl.length >= 2);
    for (const s of c.stops) assert.equal(s.z, elevOf(s.floor));
  }
});
