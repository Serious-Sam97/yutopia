import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorldObjectDef } from "./catalog.ts";
import { canBeFree, freeFits, isFreeThing, placeFree, thingCorners } from "./free-things.ts";
import { seatByte, seatYaw } from "./ground.ts";
import { getMap } from "./index.ts";
import { seatsOf } from "./physics/place.ts";
import { kindSolids } from "./shapes/index.ts";
import { wallsEdit } from "./structure/edit.ts";
import { finishWorld } from "./structure/finish.ts";
import { structureFromMap } from "./structure/from-map.ts";
import { applyOps } from "./structure/ops.ts";

// Phase 11.9 (docs/plan/72): things placed free — anywhere, turned any way.

const studio = getMap("studio");
const s0 = structureFromMap(finishWorld(studio, studio.objects, { fresh: true, building: true }).map);
const desk: WorldObjectDef = { id: "d", kind: "desk", x: 0, y: 0, yaw: 0, props: { level: 3 } };

test("who can stand free: things on the floor, not those on surfaces, walls, nor the building's own", () => {
  assert.ok(canBeFree("desk") && canBeFree("chair"));
  assert.ok(!canBeFree("door") && !canBeFree("stairs") && !canBeFree("flight") && !canBeFree("elevator"));
});

test("put on whole tiles at a quarter turn it's a tile thing; else free, its middle where it was put", () => {
  // a desk is 2 × 1: its middle at (21, 10.5) unturned → its corner (20, 10)
  const t = placeFree(desk, 21, 10.5, 0);
  assert.deepEqual([t.x, t.y, t.yaw, isFreeThing(t)], [20, 10, 0, false]);
  // a quarter turn: 1 × 2, middle (20.5, 11) → corner (20, 10)
  const q = placeFree(desk, 20.5, 11, Math.PI / 2);
  assert.deepEqual([q.x, q.y, isFreeThing(q)], [20, 10, false]);
  // 30°: free, its middle as put
  const f = placeFree(desk, 21, 10.5, Math.PI / 6);
  assert.deepEqual([f.x, f.y, isFreeThing(f)], [21, 10.5, true]);
  const c = thingCorners(f);
  const mid = [c.reduce((s, p) => s + p[0], 0) / 4, c.reduce((s, p) => s + p[1], 0) / 4];
  assert.ok(Math.abs(mid[0] - 21) < 1e-9 && Math.abs(mid[1] - 10.5) < 1e-9);
});

test("where a free thing fits: on the floor, no wall through it, nothing solid under it", () => {
  const f = placeFree(desk, 21, 10.5, Math.PI / 6);
  assert.equal(freeFits(f, [], s0, 3), null);
  assert.equal(freeFits(placeFree(desk, -3, 10.5, Math.PI / 6), [], s0, 3), "off the floor");
  const w = wallsEdit(s0, 3, [{ a: [19, 10.5], b: [23, 10.5], front: "p" }], [], () => "x");
  assert.ok("op" in w);
  assert.equal(freeFits(f, [], applyOps(s0, [w.op]), 3), "a wall's in the way");
  const other = placeFree({ ...desk, id: "o" }, 21.4, 10.6, Math.PI / 4);
  assert.equal(freeFits(f, [other], s0, 3), "something's there");
  assert.equal(freeFits(f, [placeFree({ ...desk, id: "o" }, 24, 13, 0)], s0, 3), null);
});

test("Jolt's boxes for a free thing: turned as it is, round its middle", () => {
  const f = placeFree(desk, 21, 10.5, Math.PI / 6);
  const solids = kindSolids(f, 0);
  assert.ok(solids.length > 0);
  for (const q of solids) {
    if (q.t !== "box") continue;
    assert.ok(Math.abs(q.a + Math.PI / 6) < 1e-4, "turned by its yaw (kept to 1e-5)");
    assert.ok(Math.hypot(q.x - 21, q.z - 10.5) < 1.2, "round its middle");
  }
});

test("a chair turned 30° is sat on facing its own way, at its middle; a sofa along its seat", () => {
  const chair = placeFree({ id: "c", kind: "chair", x: 0, y: 0, yaw: 0, props: { level: 3 } }, 20.4, 10.6, Math.PI / 6);
  const seats = seatsOf([chair]);
  const s = seats.get("20,10");
  assert.ok(s?.front && s.spot, "a seat on its middle's tile");
  // (its back on −y unturned: it faces +y turned 30°)
  assert.ok(Math.abs(seatYaw(s) - (Math.PI / 2 + Math.PI / 6)) < 1e-4); // (kept to 1e-5 rad)
  assert.equal(seatByte(s), Math.round(((Math.PI / 2 + Math.PI / 6) / Math.PI) * 128));
  assert.deepEqual(s.spot, { x: 20.4, y: 10.6 });
  const sofa = placeFree({ id: "s", kind: "sofa", x: 0, y: 0, yaw: 0, props: { level: 3 } }, 30, 10.5, Math.PI / 4);
  const along = [...seatsOf([sofa]).values()];
  assert.ok(along.length >= 2, "a sofa's seats");
  for (const t of along) {
    const [dx, dy] = [(t.spot?.x ?? 0) - 30, (t.spot?.y ?? 0) - 10.5];
    // (on the line through its middle along its length)
    assert.ok(Math.abs(dx * -Math.sin(Math.PI / 4) + dy * Math.cos(Math.PI / 4)) < 1e-4);
  }
});
