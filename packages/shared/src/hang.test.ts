import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import type { WorldObjectDef } from "./catalog.ts";
import {
  faceHit,
  faceNear,
  hangAt,
  hangBlocker,
  hangCanon,
  hangEdges,
  hangNear,
  hangOf,
  hangSpot,
  liftRange,
  reachOf,
  WQ,
  WZ_PX,
  wallSpan,
} from "./hang.ts";
import { applyStep, diffStep, snapshot } from "./history.ts";
import { backAt, faceMat, type MapDef } from "./map.ts";
import {
  addRoom,
  applyEdges,
  blankMap,
  edgeBlocker,
  layoutFromMap,
  mapFromLayout,
  resizeMap,
  setRoomWalls,
  validLayout,
} from "./map-edit.ts";

// A 20×16 blank studio with a plaster wall across it at y = 8 (x 2..13): both
// faces have floor in front.
function hall(): MapDef {
  const m = blankMap("t", "T", 20, 16);
  return applyEdges(
    m,
    Array.from({ length: 12 }, (_, i) => ({ dir: "h" as const, x: 2 + i, y: 8, ch: "p" })),
  );
}
const board = (o: Partial<WorldObjectDef> = {}): WorldObjectDef => ({
  id: "wb",
  kind: "whiteboard",
  x: 4,
  y: 8,
  rot: 0,
  ...o,
});

test("older wall items stay where they were: north wall, or turned (rot 3) the west one", () => {
  const north = board({ rot: 2 }); // any other stored turn was the north wall
  assert.equal(hangOf(north).rot, 0);
  assert.deepEqual(wallSpan(north), [
    { dir: "h", x: 4, y: 8 },
    { dir: "h", x: 5, y: 8 },
  ]);
  const west = board({ x: 0, y: 3, rot: 3 });
  assert.deepEqual(wallSpan(west), [
    { dir: "v", x: 0, y: 3 },
    { dir: "v", x: 0, y: 4 },
  ]);
  // made explicit, nothing moves
  const c = hangCanon(north);
  assert.equal(c.rot, 0);
  assert.deepEqual(c.props, { wu: 0, wz: 0 });
  assert.deepEqual(hangOf(c), hangOf(north));
});

test("wall items hang on either face, anywhere along it and up it", () => {
  const map = hall();
  const south: WorldObjectDef = hangCanon(board()); // front face of y = 8, facing +y
  assert.ok(canPlace(map, [], south));
  // the back face of the same wall: from the tile north of it, facing −y
  const north = hangAt(board({ id: "n" }), { dir: "h", line: 8, side: -1 }, 4 * WQ, 0);
  assert.equal(north.rot, 2);
  assert.equal(north.y, 7);
  assert.equal(hangOf(north).line, 8);
  assert.ok(canPlace(map, [south], north), "both faces of one wall take things");
  // a quarter tile along: overlaps the one there, not when raised clear of it
  const over = hangAt(board({ id: "o" }), { dir: "h", line: 8, side: 1 }, 4 * WQ + 3, 0);
  assert.equal(over.x, 4);
  assert.equal(over.props?.wu, 3);
  assert.equal(hangBlocker(map, [south], over), "something hangs there");
  const [, top] = liftRange("whiteboard");
  assert.ok(top >= 5, "a whiteboard can go up a good way");
  const up = hangAt(board({ id: "o" }), { dir: "h", line: 8, side: 1 }, 4 * WQ + 3, 5);
  assert.equal(hangOf(up).z0, hangOf(south).z0 + 5 * WZ_PX);
  assert.ok(canPlace(map, [south], up), "above the other one");
  // the edges it covers: a quarter tile into a third one
  assert.deepEqual(
    hangEdges(hangOf(up)).map((e) => e.x),
    [4, 5, 6],
  );
  // not off the wall, nor past its end, nor over the void outside
  assert.equal(hangBlocker(map, [], { ...up, props: { ...up.props, wz: 99 } }), "off the wall");
  assert.equal(
    hangBlocker(map, [], hangAt(board(), { dir: "h", line: 8, side: 1 }, 13 * WQ, 0)),
    "no wall to hang it on",
  );
  assert.equal(hangBlocker(map, [], hangAt(board(), { dir: "h", line: 0, side: -1 }, 4 * WQ, 0)), "no floor in front");
  // a wall meeting its face somewhere along it is in the way; on the other face it isn't
  const t = applyEdges(map, [{ dir: "v", x: 6, y: 8, ch: "p" }]);
  assert.equal(hangBlocker(t, [], hangAt(board(), { dir: "h", line: 8, side: 1 }, 5 * WQ, 0)), "a wall is in the way");
  assert.equal(hangBlocker(t, [], hangAt(board(), { dir: "h", line: 8, side: -1 }, 5 * WQ, 0)), null);
  // …and that wall can't be built across one that's there
  assert.equal(
    edgeBlocker(map, [hangAt(board(), { dir: "h", line: 8, side: 1 }, 5 * WQ, 0)], { dir: "v", x: 6, y: 8 }, "p"),
    "Whiteboard hangs across there",
  );
});

test("near a point: the middle under the pointer, on the grid, kept on the wall", () => {
  const map = hall();
  const o = hangNear(board(), { dir: "h", line: 8, side: -1 }, 7.1, 60);
  const h = hangOf(o);
  assert.equal(h.side, -1);
  assert.equal((h.u0 + h.u1) / 2 / WQ, 7, "middle on the nearest quarter");
  assert.ok(Math.abs((h.z0 + h.z1) / 2 - 60) <= WZ_PX / 2);
  assert.ok(canPlace(map, [], o));
  // z null keeps how high it was
  const same = hangNear({ ...o, props: { ...o.props, wz: 2 } }, { dir: "h", line: 8, side: 1 }, 7, null);
  assert.equal(same.props?.wz, 2);
  // far too high: as high as it goes
  const top = hangNear(board(), { dir: "h", line: 8, side: 1 }, 7, 999);
  assert.equal(hangBlocker(map, [], top), null);
  // used from its own side only
  assert.ok(reachOf(o, hangSpot(o, 0.6)) < 0.5);
  assert.equal(reachOf(o, { x: 7, y: 8.5 }), Number.POSITIVE_INFINITY);
});

test("pointing at a wall: the face the ray meets first, looking at it", () => {
  const map = hall();
  // the iso camera looks down towards −x −y: from in front of the wall's south face
  const ray = { o: { x: 9, y: 10, z: 600 }, d: { x: -2, y: -2, z: -600 } };
  // its point at the wall's face (y 8.1): t = 0.95 → x 7.1, z 30
  const hit = faceHit(map, ray);
  assert.ok(hit);
  assert.deepEqual(hit.face, { dir: "h", line: 8, side: 1 });
  assert.ok(Math.abs(hit.along - 7.1) < 1e-9 && Math.abs(hit.z - 30) < 1e-9);
  // looked through (cut away): the next one behind it, or none
  assert.equal(
    faceHit(map, ray, (e) => e.dir === "h" && e.y === 8),
    null,
  );
  // from the other side the back face answers
  const back = faceHit(map, { o: { x: 9, y: 5, z: 80 }, d: { x: 0, y: 1, z: -10 } });
  assert.deepEqual(back?.face, { dir: "h", line: 8, side: -1 });
  // nothing to point at: the face nearest the floor point
  assert.deepEqual(faceNear(map, 7.3, 7.8)?.face, { dir: "h", line: 8, side: -1 });
  assert.deepEqual(faceNear(map, 7.3, 8.2)?.face, { dir: "h", line: 8, side: 1 });
});

test("two-faced walls: each face its own material, kept through edits, undo and storage", () => {
  const map = hall();
  const e = { dir: "h" as const, x: 5, y: 8 };
  // paint the back face brick: the front stays plaster
  const a = applyEdges(map, [{ ...e, ch: "b", side: -1 }]);
  assert.equal(faceMat(a, e, 1), "p");
  assert.equal(faceMat(a, e, -1), "b");
  assert.equal(backAt(a, e), "b");
  // the front repainted walnut: the back keeps its brick
  const b = applyEdges(a, [{ ...e, ch: "w", side: 1 }]);
  assert.equal(faceMat(b, e, 1), "w");
  assert.equal(faceMat(b, e, -1), "b");
  // a window put in keeps both faces
  const w = applyEdges(b, [{ ...e, ch: "W" }]);
  assert.equal(faceMat(w, e, -1), "b");
  // the back painted like the front: one material again, nothing stored
  const same = applyEdges(b, [{ ...e, ch: "w", side: -1 }]);
  assert.equal(backAt(same, e), ".");
  assert.equal(same.hBacks, undefined);
  // the wall taken away and built again: one material through
  const gone = applyEdges(applyEdges(a, [{ ...e, ch: "." }]), [{ ...e, ch: "k" }]);
  assert.equal(faceMat(gone, e, -1), "k");
  // glass is glass on both sides
  assert.equal(faceMat(applyEdges(a, [{ ...e, ch: "g" }]), e, -1), null);
  // undo / redo
  const step = diffStep(snapshot(map, []), snapshot(a, []), "paint");
  assert.ok(step);
  const undone = applyStep(a, [], step, "back").map;
  assert.ok(undone);
  assert.equal(faceMat(undone, e, -1), "p");
  const redone = applyStep(undone, [], step, "forward").map;
  assert.equal(redone && faceMat(redone, e, -1), "b");
  // stored and read back; resized
  const l = layoutFromMap(a);
  assert.ok(validLayout(l));
  assert.ok(!validLayout({ ...l, hBacks: l.hBacks?.map((r) => r.replace(".", "g")) }), "only materials");
  assert.ok(!validLayout({ ...l, vBacks: l.vBacks?.slice(1) }), "rows");
  assert.equal(faceMat(mapFromLayout("t", "T", l), e, -1), "b");
  assert.equal(faceMat(resizeMap(a, 24, 16), e, -1), "b");
  assert.equal(layoutFromMap(map).hBacks, undefined, "nothing stored while every wall is one material");
});

test("rooms side by side: each repaints its own side of the wall between them", () => {
  const base = blankMap("t", "T", 24, 16);
  const room = (key: string, x: number) => {
    const r = addRoom(base, [], [], {
      key,
      name: key,
      kind: "private",
      x,
      y: 2,
      w: 5,
      h: 5,
      ownerId: null,
      ownerName: null,
      walls: true,
    });
    if (typeof r === "string") throw new Error(r);
    return r.map;
  };
  let m = room("a", 2);
  const second = addRoom(m, [], [], {
    key: "b",
    name: "b",
    kind: "private",
    x: 7,
    y: 2,
    w: 5,
    h: 5,
    ownerId: null,
    ownerName: null,
    walls: true,
    wall: "b",
  });
  if (typeof second === "string") throw new Error(second);
  m = second.map;
  const shared = { dir: "v" as const, x: 7, y: 4 };
  // b's walls are brick on its side; a keeps plaster on its own
  assert.equal(faceMat(m, shared, 1), "b");
  assert.equal(faceMat(m, shared, -1), "p");
  m = setRoomWalls(m, "a", "k");
  assert.equal(faceMat(m, shared, -1), "k", "a's side cork");
  assert.equal(faceMat(m, shared, 1), "b", "b's side untouched");
  assert.equal(faceMat(m, { dir: "h", x: 3, y: 2 }, 1), "k", "a's north wall, inside");
});
