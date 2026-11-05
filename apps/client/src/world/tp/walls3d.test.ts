import assert from "node:assert/strict";
import { test } from "node:test";
import { floorsOf, getMap, levelMap, spanOf } from "@yutopia/shared";
import { structureFromMap } from "@yutopia/shared/structure";
import { finishWorld } from "@yutopia/shared/structure/finish";
import { localView } from "@yutopia/shared/structure/fold";
import { Out } from "./kit3d";
import { edgesOfMap, edgesOfWalls, piecesOf, turnOut } from "./walls3d";

// Phase 8 (docs/plan/72): the 3D view draws a floor's walls from the structure. On the campus every
// wall is on the lattice: the structure's walls give the floor's drawing exactly the edges its tile
// map did — every edge's front and back, every floor — so the walls drawn are the same.

test("the campus: every floor's walls from the structure are its map's edges, front and back", () => {
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const s = structureFromMap(done.map);
  for (const level of floorsOf(done.map)) {
    const lm = levelMap(done.map, level);
    assert.ok(lm);
    const corner = { x: lm.ox ?? 0, y: lm.oy ?? 0 };
    const local = localView(lm);
    const fromMap = edgesOfMap(local);
    const fromWalls = edgesOfWalls(s.walls, level, corner);
    assert.equal(fromWalls.free.length, 0, `floor ${level}: nothing off the lattice`);
    const sp = spanOf(local);
    const differ: string[] = [];
    for (let y = sp.y0; y <= sp.y1; y++)
      for (let x = sp.x0; x <= sp.x1; x++)
        for (const dir of ["h", "v"] as const) {
          const a = dir === "h" ? fromMap.h(x, y) : fromMap.v(x, y);
          const b = dir === "h" ? fromWalls.h(x, y) : fromWalls.v(x, y);
          const ba = fromMap.back({ dir, x, y });
          const bb = fromWalls.back({ dir, x, y });
          if (a !== b || ba !== bb) differ.push(`${dir} ${x},${y}: ${a}/${ba} vs ${b}/${bb}`);
        }
    assert.deepEqual(differ, [], `floor ${level}`);
  }
});

test("a wall at 45°: off the lattice, a metre at a time along it, each piece turned onto its line", () => {
  const e = edgesOfWalls(
    [{ id: "w", floor: 0, a: [2, 2], b: [2 + 3 / Math.SQRT2, 2 + 3 / Math.SQRT2], base: 0, height: 3.27, front: "p" }],
    0,
    { x: 0, y: 0 },
  );
  assert.equal(e.free.length, 1);
  assert.equal(e.h(2, 2), ".");
  const ps = piecesOf(e.free[0]);
  assert.deepEqual(
    ps.map((p) => p.len.toFixed(3)),
    ["1.000", "1.000", "1.000"],
  );
  assert.ok(ps.every((p) => Math.abs(p.angle - Math.PI / 4) < 1e-9));
  // a piece drawn along +x from the origin (three: x, up, z), turned and placed: its far end on the line
  const o = new Out();
  o.lit.pos.push(0, 0, 0, 1, 2, 0);
  o.lit.nor.push(0, 0, 1, 0, 0, 1);
  turnOut(o, ps[1].angle, ps[1].at[0], ps[1].at[1]);
  const [x1, , z1] = o.lit.pos.slice(3);
  assert.ok(Math.abs(x1 - (ps[1].at[0] + Math.SQRT1_2)) < 1e-9 && Math.abs(z1 - (ps[1].at[1] + Math.SQRT1_2)) < 1e-9);
  assert.equal(o.lit.pos[4], 2, "its height kept");
  // its face's normal turned with it (out of +z to a quarter turn on from the line)
  assert.ok(Math.abs(o.lit.nor[0] + Math.SQRT1_2) < 1e-9 && Math.abs(o.lit.nor[2] - Math.SQRT1_2) < 1e-9);
});

test("the campus: the ceiling over the structure's indoor slabs covers the tiles the old one did, every floor", async () => {
  const { slabBoxes } = await import("@yutopia/shared/physics/structure-solids");
  const { isFloor, tileAt, wellsOf } = await import("@yutopia/shared");
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const s = structureFromMap(done.map);
  for (const level of floorsOf(done.map)) {
    const lm = levelMap(done.map, level);
    assert.ok(lm);
    const corner = { x: lm.ox ?? 0, y: lm.oy ?? 0 };
    const local = localView(lm);
    const wells = new Set(
      [...wellsOf(lm, done.objects, "ceiling")].map((k) => {
        const [x, y] = k.split(",").map(Number);
        return `${x - corner.x},${y - corner.y}`;
      }),
    );
    const rings = s.slabs
      .filter((sl) => sl.floor === level && sl.top !== "a" && sl.top !== "c")
      .flatMap((sl) => [sl.outline, ...sl.holes])
      .map((r) => r.map(([x, y]): [number, number] => [x - corner.x, y - corner.y]));
    const holes = [...wells].map((k): [number, number, number, number] => {
      const [x, y] = k.split(",").map(Number);
      return [x, y, x + 1, y + 1];
    });
    const boxes = slabBoxes(rings, holes, 0);
    const covered = (x: number, y: number) => boxes.some((b) => Math.abs(x - b.x) < b.hx && Math.abs(y - b.z) < b.hz);
    const differ: string[] = [];
    for (let y = 0; y < local.height; y++)
      for (let x = 0; x < local.width; x++) {
        const ch = tileAt(local, x, y);
        const old = isFloor(ch) && ch !== "a" && ch !== "c" && !wells.has(`${x},${y}`);
        if (covered(x + 0.5, y + 0.5) !== old) differ.push(`${x},${y}`);
      }
    assert.deepEqual(differ, [], `floor ${level}`);
  }
});

test("the campus: what's floor by the structure's slabs (below-cull's) is what the tiles said, every floor", async () => {
  const { crossings } = await import("@yutopia/shared/physics/structure-solids");
  const { isFloor, tileAt } = await import("@yutopia/shared");
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const s = structureFromMap(done.map);
  for (const level of floorsOf(done.map)) {
    const lm = levelMap(done.map, level);
    assert.ok(lm);
    const corner = { x: lm.ox ?? 0, y: lm.oy ?? 0 };
    const local = localView(lm);
    const rings = s.slabs
      .filter((sl) => sl.floor === level)
      .flatMap((sl) => [sl.outline, ...sl.holes])
      .map((r) => r.map(([x, y]): [number, number] => [x - corner.x, y - corner.y]));
    const differ: string[] = [];
    for (let y = -1; y <= local.height; y++)
      for (let x = -1; x <= local.width; x++) {
        const bySlab = crossings(rings, y + 0.5).filter((c) => c < x + 0.5).length % 2 === 1;
        if (bySlab !== isFloor(tileAt(local, x, y))) differ.push(`${x},${y}`);
      }
    assert.deepEqual(differ, [], `floor ${level}`);
  }
});
