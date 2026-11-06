import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, footprint, quarterOf, quarterYaw } from "./catalog.ts";
import { moveStep } from "./ground.ts";
import { hearingGain } from "./hearing.ts";
import { areaAt, holdsItems, hWall, isFloor, tileAt } from "./map.ts";
import { studio } from "./maps/studio.ts";
import { testWorld } from "./physics/testing.ts";

test("studio map is rectangular and every object sits on floor without overlaps", () => {
  assert.equal(studio.tiles.length, studio.height);
  for (const row of studio.tiles) assert.equal(row.length, studio.width);
  const solid = new Map<string, string>();
  const ids = new Set<string>();
  for (const o of studio.objects) {
    assert.ok(!ids.has(o.id), `duplicate id ${o.id}`);
    ids.add(o.id);
    const e = entry(o.kind);
    const { w, h } = footprint(o.kind, quarterOf(o));
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

test("every walkable tile and every area is reachable from spawn", async () => {
  // (Jolt's floor and the navmesh's ways: physics/testing.ts)
  const w = await testWorld(studio, studio.objects);
  const g = w.place();
  const nav = (await w.nav()).floor(0);
  assert.ok(nav);
  for (let y = 0; y < studio.height; y++)
    for (let x = 0; x < studio.width; x++)
      if (g.ok(x, y)) assert.ok(nav.path(studio.spawn, { x: x + 0.5, y: y + 0.5 }), `unreachable ${x},${y}`);
  for (const a of studio.areas) {
    const p = nav.path(studio.spawn, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
    assert.ok(p && p.length > 0, `no path to ${a.key}`);
  }
  w.dispose();
});

test("paths never cross walls or furniture", async () => {
  const w = await testWorld(studio, studio.objects);
  const g = w.place();
  const path = (await w.nav()).floor(0)?.path(studio.spawn, { x: 44.5, y: 17.5 }); // spawn → booth 3
  assert.ok(path);
  let prev = studio.spawn;
  for (const p of path) {
    // (a thin line along it: through nothing — the navmesh keeps about a body's radius off what's
    // in the way, to its 0.11 m cells)
    assert.ok(g.clear(prev, p, 0.05), `segment ${JSON.stringify(prev)} → ${JSON.stringify(p)}`);
    prev = p;
  }
  assert.equal(areaAt(studio, prev.x, prev.y)?.key, "booth-3");
  w.dispose();
});

test("movement slides along walls, and no way goes through one", async () => {
  const w = await testWorld(studio, studio.objects);
  const g = w.place();
  let p = { x: 1.5, y: 23.5 };
  for (let i = 0; i < 30; i++) p = moveStep(g, p, { x: -1, y: 0 }, 4, 0.05);
  assert.ok(p.x >= 0.3 && p.x <= 0.55 && g.fits(p.x, p.y), `stops at the thin wall: ${p.x}`);
  assert.ok(g.clear({ x: 6.5, y: 28.5 }, { x: 6.7, y: 28.5 }, 0.05));
  assert.ok(!g.clear({ x: 12.5, y: 25.5 }, { x: 14.5, y: 25.5 }, 0.05), "through the lobby wall");
  w.dispose();
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
    const w = await testWorld(studio, placed);
    assert.ok(
      (await w.nav()).floor(0)?.path(studio.spawn, { x: 22.5, y: 2.5 }),
      `${t.key}: tracking room still walkable`,
    );
    w.dispose();
  }
});

test("placement: no furniture in walls, wall items need a wall", async () => {
  const { canPlace } = await import("./build.ts");
  assert.ok(canPlace(studio, studio.objects, { id: "p", kind: "plant", x: 0, y: 3 }), "old wall tiles are floor now");
  assert.ok(canPlace(studio, studio.objects, { id: "p", kind: "plant", x: 10, y: 3 }));
  assert.ok(
    !canPlace(studio, studio.objects, { id: "s", kind: "desk", x: 28, y: 9, yaw: quarterYaw(0) }),
    "never across a wall",
  );
  assert.ok(!canPlace(studio, studio.objects, { id: "w", kind: "whiteboard", x: 10, y: 3 }), "no wall behind");
  assert.ok(canPlace(studio, studio.objects, { id: "w", kind: "whiteboard", x: 11, y: 0 }), "on the north wall");
  assert.ok(!canPlace(studio, studio.objects, { id: "w", kind: "poster", x: 6, y: 0 }), "not on a window");
  assert.ok(!canPlace(studio, studio.objects, { id: "d", kind: "desk", x: 3, y: 6 }), "overlaps a desk");
  assert.ok(
    !canPlace(studio, studio.objects, { id: "p", kind: "plant", x: 10, y: 3 }, [{ x: 10.5, y: 3.5 }]),
    "someone standing there",
  );
});
