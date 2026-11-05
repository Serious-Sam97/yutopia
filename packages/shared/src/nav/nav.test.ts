import assert from "node:assert/strict";
import { test } from "node:test";
import { setOutdoors } from "../ground.ts";
import { groundsOutdoors } from "../grounds.ts";
import { getMap } from "../index.ts";
import { floorsOf, levelMap, objLevel } from "../levels.ts";
import { isFloor, spanOf, tileAt } from "../map.ts";
import { buildingSolids } from "../physics/build.ts";
import { testWorld } from "../physics/testing.ts";
import { finishWorld } from "../structure/finish.ts";
import { BuildingNav, loadNav } from "./index.ts";

// Plan 72 phase 7: the navmesh (recast) a floor, built from the solids Jolt's world is made of —
// everywhere a body steps on Jolt, it goes (it went everywhere the tile grid's paths went, while
// there was one); things are obstacles put in and taken out.

setOutdoors(groundsOutdoors);
const studio = getMap("studio");
const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
const floorOfThing = (id: string) => {
  const o = done.objects.find((x) => x.id === id);
  return o ? objLevel(o, done.map) : null;
};
const groundSpan = () => {
  const g = spanOf(levelMap(done.map, 0) as NonNullable<ReturnType<typeof levelMap>>);
  return { x0: g.x0, z0: g.y0, x1: g.x1, z1: g.y1 };
};

test("every floor's mesh goes everywhere a body steps on Jolt, and a way is the waypoints after where you are", async () => {
  await loadNav();
  const tw = await testWorld(done.map, done.objects);
  const nav = new BuildingNav();
  const t0 = performance.now();
  const { made } = await nav.sync(buildingSolids(done.map, done.objects), floorOfThing, groundSpan());
  assert.deepEqual([...made].sort(), floorsOf(done.map), `every floor made (${Math.round(performance.now() - t0)} ms)`);
  for (const level of floorsOf(done.map)) {
    const lm = levelMap(done.map, level);
    assert.ok(lm);
    const f = nav.floor(level);
    assert.ok(f);
    const grid = tw.place(level);
    const sp = spanOf(lm);
    const from = { x: lm.spawn.x, y: lm.spawn.y };
    // a body's reach on Jolt from the floor's arrival (its steps, a tile at a time)
    const seen = new Set<string>([`${Math.floor(from.x)},${Math.floor(from.y)}`]);
    const queue: [number, number][] = [[Math.floor(from.x), Math.floor(from.y)]];
    while (queue.length) {
      const [x, y] = queue.shift() as [number, number];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const [nx, ny] = [x + dx, y + dy];
        const k = `${nx},${ny}`;
        if (seen.has(k) || nx < sp.x0 || ny < sp.y0 || nx >= sp.x1 || ny >= sp.y1) continue;
        // (the stairs' treads aren't a floor's: they're the connectors between floors)
        if (grid.onRamp(nx + 0.5, ny + 0.5) || !grid.step(x, y, nx, ny)) continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
    let both = 0;
    const missed: string[] = [];
    for (let y = sp.y0; y < sp.y1; y += 2)
      for (let x = sp.x0; x < sp.x1; x += 2) {
        if (!isFloor(tileAt(lm, x, y)) || !seen.has(`${x},${y}`)) continue;
        const to = { x: x + 0.5, y: y + 0.5 };
        const way = f.path(from, to);
        if (!way) {
          missed.push(`${x},${y}`);
          continue;
        }
        both++;
        const end = way[way.length - 1] ?? from;
        assert.ok(Math.hypot(end.x - to.x, end.y - to.y) < 0.6, `floor ${level}: the way to ${x},${y} ends there`);
      }
    assert.deepEqual(missed, [], `floor ${level}: a body's reach, the mesh's too (${both} tiles)`);
  }
  nav.dispose();
  tw.dispose();
});

test("things are obstacles: a desk put across a way closes it, taken away opens it; a locked door's owner gets through it", async () => {
  await loadNav();
  const nav = new BuildingNav();
  const b = buildingSolids(done.map, done.objects);
  await nav.sync(b, floorOfThing);
  const f = nav.floor(4);
  assert.ok(f);
  // a corridor made of boxes across the studio's floor: a wall of desks from x 0 to 48 at y 18
  const fence = [...Array(24).keys()].map((i) => ({
    t: "box" as const,
    x: i * 2 + 1,
    y: 14 + 0.4,
    z: 18,
    hx: 1,
    hy: 0.4,
    hz: 0.5,
    a: 0,
  }));
  const from = { x: 20.5, y: 14.5 };
  const to = { x: 20.5, y: 22.5 };
  assert.ok(f.path(from, to), "open: a way");
  const was = new Map(
    [...b.statics]
      .filter(([k]) => floorOfThing(k.slice(k.indexOf(":") + 1)) === 4 || k.startsWith("clutter:4:"))
      .map(([k, v]) => [k, v.solids]),
  );
  const t0 = performance.now();
  f.setObstacles(new Map([...was, ["fence", fence]]));
  const ms = performance.now() - t0;
  assert.equal(f.path(from, to), null, "a row of desks across the room: no way past");
  assert.ok(ms < 100, `put in fast (${ms.toFixed(1)} ms)`);
  // the owner of a locked door — here the fence, as if it were one — through it; nobody else
  assert.ok(f.path(from, to, { open: ["fence"] }), "its owner: through");
  assert.equal(f.path(from, to), null, "and shut again after");
  f.setObstacles(was);
  assert.ok(f.path(from, to), "taken away: the way again");
  nav.dispose();
});

test("a thin obstacle (a lift's wall, a shut door: 0.12 m) still closes a way — obstacles are widened by a body", async () => {
  await loadNav();
  const nav = new BuildingNav(0);
  const b = buildingSolids(done.map, done.objects);
  await nav.sync(b, floorOfThing);
  const f = nav.floor(4);
  assert.ok(f);
  const from = { x: 20.5, y: 14.5 };
  const to = { x: 20.5, y: 22.5 };
  const was = new Map(
    [...b.statics]
      .filter(([k]) => floorOfThing(k.slice(k.indexOf(":") + 1)) === 4 || k.startsWith("clutter:4:"))
      .map(([k, v]) => [k, v.solids]),
  );
  const wall = [{ t: "box" as const, x: 24, y: 14 + 1.25, z: 18, hx: 24, hy: 1.25, hz: 0.06, a: 0 }];
  f.setObstacles(new Map([...was, ["thin", wall]]));
  assert.equal(f.path(from, to), null, "a 0.12 m wall across the room: no way through it");
  nav.dispose();
});

test("out on the land past the ground floor's mesh: a window round the way's ends, made when first asked", async () => {
  await loadNav();
  const nav = new BuildingNav(0);
  const g = groundSpan();
  await nav.sync(buildingSolids(done.map, done.objects), floorOfThing, g);
  const lm = levelMap(done.map, 0);
  assert.ok(lm);
  // from the lot (on the ground floor's mesh) to a spot 60 m west of the floor's span
  const tw = await testWorld(done.map, done.objects);
  const grid = tw.place(0);
  let from: { x: number; y: number } | null = null;
  for (let x = g.x0 + 2; x < g.x0 + 30 && !from; x++)
    for (let y = g.z0 + 2; y < g.z1 - 2 && !from; y++)
      if (grid.ok(x, y) && grid.onLand(x + 0.5, y + 0.5)) from = { x: x + 0.5, y: y + 0.5 };
  assert.ok(from, "a spot out on the lot");
  const far = { x: g.x0 - 60, y: from.y };
  assert.equal(nav.path(0, from, far), undefined, "not yet: its window being made");
  const way = await nav.pathSoon(0, from, far);
  assert.ok(way?.length, "then a way");
  const end = way[way.length - 1];
  assert.ok(Math.hypot(end.x - far.x, end.y - far.y) < 3.5, `it ends there (${end.x.toFixed(1)}, ${end.y.toFixed(1)})`);
  assert.ok(nav.path(0, from, far)?.length, "and the window's kept");
  assert.equal(nav.path(0, from, { x: from.x - 700, y: from.y + 700 }), null, "too far to walk in one go: none");
  nav.dispose();
  tw.dispose();
});

test("hundreds of obstacles at once all go in (the tile cache's queue takes 64 between updates)", async () => {
  await loadNav();
  const nav = new BuildingNav(0);
  await nav.sync(buildingSolids(done.map, done.objects), floorOfThing);
  const f = nav.floor(4);
  assert.ok(f);
  const from = { x: 20.5, y: 14.5 };
  const to = { x: 20.5, y: 22.5 };
  // 200 small posts out of the way first, then the row across the room: the row's still in
  const posts = new Map<
    string,
    { t: "box"; x: number; y: number; z: number; hx: number; hy: number; hz: number; a: number }[]
  >();
  for (let i = 0; i < 200; i++)
    posts.set(`post${i}`, [
      { t: "box", x: 2 + (i % 20) * 0.3, y: 14.4, z: 40 + Math.floor(i / 20) * 0.3, hx: 0.05, hy: 0.4, hz: 0.05, a: 0 },
    ]);
  const row = [...Array(24).keys()].map((i) => ({
    t: "box" as const,
    x: i * 2 + 1,
    y: 14.4,
    z: 18,
    hx: 1,
    hy: 0.4,
    hz: 0.5,
    a: 0,
  }));
  f.setObstacles(new Map([...posts, ["row", row]]));
  assert.equal(f.path(from, to), null, "the row, put in after 200 others, closes the way");
  nav.dispose();
});
