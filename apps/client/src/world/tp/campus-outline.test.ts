import assert from "node:assert/strict";
import { test } from "node:test";
import { edgeKey, floorOf, getMap, hWall, isWindow, vWall } from "@yutopia/shared";
import { structureFromMap } from "@yutopia/shared/structure";
import { finishWorld } from "@yutopia/shared/structure/finish";
import { facadeRuns, type Outline } from "./campus";
import { edgesOfWalls } from "./walls3d";

// Phase 8 (docs/plan/72): the campus's outside from the structure — the main block's facade runs
// round the home floor's slabs (not its tiles), its windows where the structure's walls are windows.
// On the campus they're the same runs and the same windows as the tiles gave: the same facade.

test("the campus: the facade's runs and windows from the structure are the tiles'", () => {
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const building = done.map;
  const s = structureFromMap(building);
  const f = floorOf(building);
  const corner = building.world ? { x: building.ox ?? 0, y: building.oy ?? 0 } : { x: 0, y: 0 };
  const outline: Outline = {
    rings: s.slabs
      .filter((sl) => sl.floor === f)
      .flatMap((sl) => [sl.outline, ...sl.holes])
      .map((r) => r.map(([x, y]): [number, number] => [x - corner.x, y - corner.y])),
    edges: edgesOfWalls(s.walls, f, corner),
  };
  const fromTiles = facadeRuns(building);
  const fromStructure = facadeRuns(building, outline);
  assert.ok(fromTiles.length >= 4, `the block's outline: ${fromTiles.length} runs`);
  // the same runs, in the same order (the facade's geometry the same, vertex for vertex)
  assert.deepEqual(fromStructure, fromTiles);
  // and the same windows along them
  let windows = 0;
  for (const r of fromTiles) {
    const n = Math.abs(r.x1 - r.x0) + Math.abs(r.z1 - r.z0);
    for (let i = 0; i < n; i++) {
      const e = r.nz !== 0 ? { dir: "h" as const, x: r.x0 + i, y: r.z0 } : { dir: "v" as const, x: r.x0, y: r.z0 + i };
      const a = e.dir === "h" ? hWall(building, e.x, e.y) : vWall(building, e.x, e.y);
      const b = e.dir === "h" ? outline.edges.h(e.x, e.y) : outline.edges.v(e.x, e.y);
      assert.equal(isWindow(b), isWindow(a), `the edge ${edgeKey(e)}`);
      if (isWindow(a)) windows++;
    }
  }
});

test("an L-shaped floor round a courtyard, windows painted on its outside: the same facade from either", async () => {
  const { applyEdges, applyPaint, blankMap, VOID } = await import("@yutopia/shared");
  let m = blankMap("l", "L", 20, 16);
  const cells: { x: number; y: number; ch: string }[] = [];
  // (the north-east quarter gone: an L; a courtyard open in the middle of the rest)
  for (let y = 0; y < 7; y++) for (let x = 11; x < 20; x++) cells.push({ x, y, ch: VOID });
  for (let y = 9; y < 12; y++) for (let x = 5; x < 9; x++) cells.push({ x, y, ch: VOID });
  m = applyPaint(m, cells);
  // windows along the south edge, the L's inner corner's west face, and the courtyard's north side
  m = applyEdges(m, [
    ...[2, 3, 4, 12, 13].map((x) => ({ dir: "h" as const, x, y: 16, ch: "W" })),
    ...[2, 3].map((y) => ({ dir: "v" as const, x: 11, y, ch: "W" })),
    ...[5, 6, 7].map((x) => ({ dir: "h" as const, x, y: 9, ch: "W" })),
  ]);
  const s = structureFromMap(m);
  const outline: Outline = {
    rings: s.slabs.filter((sl) => sl.floor === floorOf(m)).flatMap((sl) => [sl.outline, ...sl.holes]),
    edges: edgesOfWalls(s.walls, floorOf(m), { x: 0, y: 0 }),
  };
  const fromTiles = facadeRuns(m);
  assert.ok(fromTiles.length >= 10, `an L and a courtyard: ${fromTiles.length} runs`);
  assert.deepEqual(facadeRuns(m, outline), fromTiles);
  let windows = 0;
  for (const r of fromTiles) {
    const n = Math.abs(r.x1 - r.x0) + Math.abs(r.z1 - r.z0);
    for (let i = 0; i < n; i++) {
      const e = r.nz !== 0 ? { dir: "h" as const, x: r.x0 + i, y: r.z0 } : { dir: "v" as const, x: r.x0, y: r.z0 + i };
      const a = e.dir === "h" ? hWall(m, e.x, e.y) : vWall(m, e.x, e.y);
      const b = e.dir === "h" ? outline.edges.h(e.x, e.y) : outline.edges.v(e.x, e.y);
      assert.equal(isWindow(b), isWindow(a), `the edge ${edgeKey(e)}`);
      if (isWindow(b)) windows++;
    }
  }
  assert.equal(windows, 10, "every painted window on the outline");
});

test("the facade's windows: every floor's, where their walls hold them, at their floor's height", async () => {
  const { facadeWindows } = await import("./campus");
  const { openingCut } = await import("@yutopia/shared");
  const wall = (id: string, floor: number, a: [number, number], b: [number, number], front = "p") => ({
    id,
    floor,
    a,
    b,
    base: floor * 3.5,
    height: 3.266,
    front,
  });
  const s = {
    home: 1,
    floors: [
      { index: 0, name: "G", z: 0, grid: { x0: 0, y0: 0, w: 10, h: 10 } },
      { index: 1, name: "1", z: 3.5, grid: { x0: 0, y0: 0, w: 10, h: 10 } },
    ],
    walls: [
      wall("g-n", 0, [0, 0], [10, 0]),
      wall("g-s", 0, [0, 10], [10, 10], "g"),
      wall("h-n", 1, [0, 0], [10, 0]),
      wall("h-e", 1, [10, 0], [10, 10], "W"),
    ],
  };
  const win = (id: string, kind: string, on: string, at: number) => ({
    id,
    kind,
    x: 0,
    y: 0,
    props: { on: { wall: on, at } },
  });
  const ws = facadeWindows(
    s,
    [win("a", "window", "g-n", 2.5), win("b", "window_wide", "h-n", 6), win("c", "plant", "h-n", 1)],
    { x: 0, y: 0 },
  );
  const [c0, c1] = openingCut("window");
  // the ground floor's window: a metre wide round 2.5 along, a storey under the studio's floor
  assert.deepEqual(ws[0], { a: [2, 0], b: [3, 0], y0: c0 - 3.5, y1: c1 - 3.5 });
  // the studio's wide one: two metres round 6
  assert.deepEqual(
    [ws[1].a, ws[1].b],
    [
      [5, 0],
      [7, 0],
    ],
  );
  assert.ok(Math.abs(ws[1].y0 - openingCut("window_wide")[0]) < 1e-9);
  // the glass wall, floor to its top; the wall painted as windows, one a metre
  const glass = ws.filter((w) => w.glass);
  assert.deepEqual(glass, [{ a: [0, 10], b: [10, 10], y0: -3.5, y1: -3.5 + 3.266, glass: true }]);
  assert.equal(ws.filter((w) => !w.glass && w.a[0] === 10).length, 10);
  assert.equal(ws.length, 2 + 1 + 10);
});
