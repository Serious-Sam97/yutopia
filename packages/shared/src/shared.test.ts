import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, footprint } from "./catalog.ts";
import { Grid, isLegalMove, moveStep } from "./grid.ts";
import { hearingGain, stereoPan } from "./hearing.ts";
import { dirFromDelta, screenInputToWorld, toScreen, toWorld } from "./iso.ts";
import { areaAt, holdsItems, hWall, isFloor, tileAt } from "./map.ts";
import { studio } from "./maps/studio.ts";
import { findPath } from "./path.ts";

test("iso projection round-trips", () => {
  for (const [x, y] of [
    [0, 0],
    [3.25, 7.5],
    [47, 35],
  ]) {
    const s = toScreen(x, y);
    const w = toWorld(s.x, s.y);
    assert.ok(Math.abs(w.x - x) < 1e-9 && Math.abs(w.y - y) < 1e-9);
  }
});

test("facings match the screen", () => {
  assert.equal(dirFromDelta(1, 1), 0); // screen-down = S
  assert.equal(dirFromDelta(-1, -1), 4); // screen-up = N
  assert.equal(dirFromDelta(1, -1), 6); // screen-right = E
  assert.equal(dirFromDelta(-1, 1), 2); // screen-left = W
  const up = screenInputToWorld(0, -1);
  assert.equal(dirFromDelta(up.x, up.y), 4);
});

test("studio map is rectangular and every object sits on floor without overlaps", () => {
  assert.equal(studio.tiles.length, studio.height);
  for (const row of studio.tiles) assert.equal(row.length, studio.width);
  const solid = new Map<string, string>();
  const ids = new Set<string>();
  for (const o of studio.objects) {
    assert.ok(!ids.has(o.id), `duplicate id ${o.id}`);
    ids.add(o.id);
    const e = entry(o.kind);
    const { w, h } = footprint(o.kind, o.rot);
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const x = o.x + dx;
        const y = o.y + dy;
        assert.ok(isFloor(tileAt(studio, x, y)), `${o.id} off-floor at ${x},${y}`);
        if (e.wall) assert.ok(holdsItems(hWall(studio, x, y)), `${o.id} needs a wall behind ${x},${y}`);
        if (e.solid && !e.wall) {
          const k = `${x},${y}`;
          assert.ok(!solid.has(k), `${o.id} overlaps ${solid.get(k)} at ${k}`);
          solid.set(k, o.id);
        }
      }
  }
});

test("every walkable tile and every area is reachable from spawn", () => {
  const g = Grid.from(studio, studio.objects);
  const seen = new Uint8Array(g.width * g.height);
  const q = [[Math.floor(studio.spawn.x), Math.floor(studio.spawn.y)]];
  seen[g.idx(q[0][0], q[0][1])] = 1;
  while (q.length) {
    const [x, y] = q.pop() as number[];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (g.step(x, y, nx, ny) && !seen[g.idx(nx, ny)]) {
        seen[g.idx(nx, ny)] = 1;
        q.push([nx, ny]);
      }
    }
  }
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) if (g.ok(x, y)) assert.ok(seen[g.idx(x, y)], `unreachable ${x},${y}`);
  for (const a of studio.areas) {
    const p = findPath(g, studio.spawn, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
    assert.ok(p && p.length > 0, `no path to ${a.key}`);
  }
});

test("paths never cross walls or furniture", () => {
  const g = Grid.from(studio, studio.objects);
  const path = findPath(g, studio.spawn, { x: 44.5, y: 17.5 }); // spawn → booth 3
  assert.ok(path);
  let prev = studio.spawn;
  for (const p of path) {
    assert.ok(g.clear(prev, p), `segment ${JSON.stringify(prev)} → ${JSON.stringify(p)}`);
    prev = p;
  }
  assert.equal(areaAt(studio, prev.x, prev.y)?.key, "booth-3");
});

test("movement slides along walls and server rejects teleports through them", () => {
  const g = Grid.from(studio, studio.objects);
  let p = { x: 1.5, y: 23.5 };
  for (let i = 0; i < 30; i++) p = moveStep(g, p, { x: -1, y: 0 }, 4, 0.05);
  assert.ok(p.x >= 0.3 && p.x <= 0.55 && g.fits(p.x, p.y), `stops at the thin wall: ${p.x}`);
  assert.ok(isLegalMove(g, { x: 6.5, y: 28.5 }, { x: 6.7, y: 28.5 }, 0.05));
  assert.ok(!isLegalMove(g, { x: 6.5, y: 28.5 }, { x: 16.5, y: 28.5 }, 0.05), "too far");
  assert.ok(!isLegalMove(g, { x: 12.5, y: 25.5 }, { x: 14.5, y: 25.5 }, 0.5), "through the lobby wall");
});

test("hearing: proximity, private rooms, booths and the stage", () => {
  const near = hearingGain(studio, { x: 10, y: 3 }, { x: 11, y: 3 });
  const mid = hearingGain(studio, { x: 10, y: 3 }, { x: 14, y: 3 });
  const far = hearingGain(studio, { x: 3, y: 3 }, { x: 15, y: 3 });
  assert.equal(near, 1);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(far, 0);
  // War Room: the door doesn't leak
  assert.equal(hearingGain(studio, { x: 27.5, y: 5.5 }, { x: 29.5, y: 5.5 }), 0);
  assert.equal(hearingGain(studio, { x: 30, y: 4 }, { x: 45, y: 9 }), 1);
  // booths are separate from each other
  assert.equal(hearingGain(studio, { x: 31, y: 17 }, { x: 37, y: 17 }), 0);
  // stage reaches the lobby
  assert.equal(hearingGain(studio, { x: 3, y: 30 }, { x: 33, y: 22 }), 1);
  // focus mode
  assert.equal(hearingGain(studio, { x: 10, y: 3, dnd: true }, { x: 11, y: 3 }), 0);
  // hysteresis keeps a fading voice a bit longer
  assert.equal(hearingGain(studio, { x: 3, y: 3 }, { x: 9.5, y: 3 }), 0);
  assert.ok(hearingGain(studio, { x: 3, y: 3 }, { x: 9.5, y: 3 }, true) > 0);
  assert.ok(stereoPan({ x: 5, y: 5 }, { x: 8, y: 2 }) > 0);
});

test("templates fit their room without overlaps", async () => {
  const { TEMPLATES, canPlace, replacedByTemplate } = await import("./build.ts");
  const { areaAt } = await import("./map.ts");
  for (const t of TEMPLATES) {
    const keep = studio.objects.filter(
      (o) => !(replacedByTemplate(o.kind) && areaAt(studio, o.x + 0.5, o.y + 0.5)?.key === t.area),
    );
    const placed: typeof keep = [...keep];
    for (const o of t.objects) {
      assert.ok(canPlace(studio, placed, o), `${t.key}: ${o.id} doesn't fit`);
      assert.equal(areaAt(studio, o.x + 0.5, o.y + 0.5)?.key, t.area, `${t.key}: ${o.id} outside ${t.area}`);
      placed.push(o);
    }
    assert.ok(
      t.objects.some((o) => o.props?.desk),
      `${t.key} has desks`,
    );
    const g = Grid.from(studio, placed);
    assert.ok(findPath(g, studio.spawn, { x: 22.5, y: 2.5 }), `${t.key}: tracking room still walkable`);
  }
});

test("placement: no furniture in walls, wall items need a wall", async () => {
  const { canPlace } = await import("./build.ts");
  assert.ok(canPlace(studio, studio.objects, { id: "p", kind: "plant", x: 0, y: 3 }), "old wall tiles are floor now");
  assert.ok(canPlace(studio, studio.objects, { id: "p", kind: "plant", x: 10, y: 3 }));
  assert.ok(!canPlace(studio, studio.objects, { id: "s", kind: "desk", x: 28, y: 9, rot: 0 }), "never across a wall");
  assert.ok(!canPlace(studio, studio.objects, { id: "w", kind: "whiteboard", x: 10, y: 3 }), "no wall behind");
  assert.ok(canPlace(studio, studio.objects, { id: "w", kind: "whiteboard", x: 11, y: 0 }), "on the north wall");
  assert.ok(!canPlace(studio, studio.objects, { id: "w", kind: "poster", x: 6, y: 0 }), "not on a window");
  assert.ok(!canPlace(studio, studio.objects, { id: "d", kind: "desk", x: 3, y: 6 }), "overlaps a desk");
  assert.ok(
    !canPlace(studio, studio.objects, { id: "p", kind: "plant", x: 10, y: 3 }, [{ x: 10.5, y: 3.5 }]),
    "someone standing there",
  );
});
