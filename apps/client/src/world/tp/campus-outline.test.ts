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
