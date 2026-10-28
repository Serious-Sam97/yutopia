import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { studio } from "../maps/studio.ts";
import { isWindowKind, openingEdges, openingsIntoWalls } from "../openings.ts";
import { box3 } from "../shapes/index.ts";
import { splitAll } from "../tops.ts";
import { buildingSolids, WorldBuilder } from "./build.ts";
import { loadJolt } from "./load.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

// The physics world on small worlds (docs/plan/50-the-volume.md, phase 2). The whole Grounds with
// 300 bodies and 500 things, and the long session, run in `pnpm physics` (tools/physics-bench).

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});
async function world(sizes = sizesFor({ statics: 64, things: 64 }), log?: (m: string) => void) {
  const w = await PhysicsWorld.create(loadJolt, sizes, log);
  worlds.push(w);
  return w;
}
// a flat land chunk at y 0 round the origin
const flat = (x0 = -16, z0 = -16, n = 65) => ({ x0, z0, n, step: 0.5, h: new Float32Array(n * n) });

test("a fence: walked into, it stops you; flown over at 2 m, you pass (plan 50's first ask)", async () => {
  const w = await world();
  w.setLand("land", flat());
  w.setStatic("fence", [box3(4.94, -8, 5.06, 8, 0, 1.2)]);
  w.settle();
  const walker = w.addCharacter(0, 0.02, -3) as number;
  const flier = w.addCharacter(0, 2, 3) as number;
  for (let t = 0; t < 300; t++) {
    w.moveCharacter(walker, 2, -1, 0, 1 / 60, true);
    w.moveCharacter(flier, 2, 0, 0, 1 / 60, false);
    w.step();
  }
  const p: [number, number, number] = [0, 0, 0];
  w.characterAt(walker, p);
  assert.ok(p[0] < 4.95 && p[0] > 4, `the walker stops at the fence: x ${p[0]}`);
  w.characterAt(flier, p);
  assert.ok(p[0] > 9, `the flier passes over: x ${p[0]}`);
  assert.equal(w.counts().characters, 2);
});

test("questions: a ray down finds the land, a ray across the fence, a sphere what's near", async () => {
  const w = await world();
  w.setLand("land", flat());
  w.setStatic("fence", [box3(4.94, -8, 5.06, 8, 0, 1.2)]);
  w.settle();
  assert.ok(Math.abs((w.rayHit(1, 10, 1, 0, -1, 0, 20) ?? 0) - 10) < 0.01, "10 m down to the land");
  assert.ok(Math.abs((w.rayHit(0, 1, 0, 1, 0, 0, 10) ?? 0) - 4.94) < 0.01, "4.94 m to the fence at 1 m up");
  assert.equal(w.rayHit(0, 1.5, 0, 1, 0, 0, 10), null, "over it at 1.5 m: nothing");
  assert.ok(w.overlaps(5, 0.6, 0, 0.3) >= 1);
  assert.equal(w.overlaps(0, 5, 0, 0.3), 0);
});

test("guardrail 1: past its sizes an add is refused and logged, never handed to Jolt", async () => {
  const said: string[] = [];
  const w = await world({ maxBodies: 3, maxPairs: 64, maxContacts: 64 }, (m) => said.push(m));
  for (let i = 0; i < 3; i++) assert.ok(w.setStatic(`s${i}`, [box3(i * 2, 0, i * 2 + 1, 1, 0, 1)]));
  assert.equal(w.setStatic("s3", [box3(9, 0, 10, 1, 0, 1)]), false);
  assert.equal(w.addThing({ kind: "ball", r: 0.2 }, 0, 5, 0), null);
  assert.equal(w.counts().refused, 2);
  assert.match(said[0], /full \(3 bodies, [0-9.]+ MB of Jolt.s heap free\)/);
  // (room again once one's gone)
  w.remove("s0");
  assert.ok(w.addThing({ kind: "ball", r: 0.2 }, 0, 5, 0) !== null);
});

test("guardrail 1: no world made without room in Jolt's heap (it never grows, and running out aborts it)", async () => {
  const made: PhysicsWorld[] = [];
  let error = "";
  try {
    for (let i = 0; i < 20; i++)
      made.push(await PhysicsWorld.create(loadJolt, sizesFor({ statics: 2600, things: 500 })));
  } catch (e) {
    error = (e as Error).message;
  } finally {
    worlds.push(...made);
  }
  assert.match(error, /no room for a world/);
  assert.ok(made.length >= 3, `${made.length} made`);
  // (and the last of them still works)
  const w = made[made.length - 1];
  assert.ok(w.setStatic("a", [box3(0, 0, 1, 1, 0, 1)]));
});

test("guardrail 2: small fast things don't fall through the land (LinearCast, always)", async () => {
  const w = await world(sizesFor({ statics: 4, things: 200 }));
  w.setLand("land", flat());
  w.settle();
  const ids: number[] = [];
  for (let i = 0; i < 150; i++)
    ids.push(
      w.addThing(
        i % 2 ? { kind: "ball", r: 0.05 } : { kind: "crate", h: 0.05 },
        -10 + (i % 15) * 1.3,
        20 + i * 0.3,
        -6 + Math.floor(i / 15) * 1.3,
      ) as number,
    );
  for (let t = 0; t < 60 * 8; t++) w.step();
  const p: [number, number, number] = [0, 0, 0];
  let lost = 0;
  for (const id of ids) {
    w.thingAt(id, p);
    if (p[1] < -0.2) lost++;
  }
  assert.equal(lost, 0, `${lost} fell through`);
});

test("a vehicle: a kinematic box, moved by the car sim", async () => {
  const w = await world();
  w.setVehicle("car:a", box3(0, -1, 4.5, 1, 0, 1.4, 0));
  assert.ok(Math.abs((w.rayHit(2, 5, 0, 0, -1, 0, 10) ?? 0) - 3.6) < 0.01, "its roof 1.4 up");
  w.setVehicle("car:a", box3(10, -1, 14.5, 1, 0, 1.4, 0));
  assert.equal(w.rayHit(2, 5, 0, 0, -1, 0, 10), null, "gone from where it was");
  assert.ok(w.rayHit(12, 5, 0, 0, -1, 0, 10) !== null, "there where it's gone");
  w.removeVehicle("car:a");
  assert.equal(w.counts().vehicles, 0);
});

test("the studio: its walls stop a ray, a door lets it through, a window's pane doesn't, its slab is underfoot", async () => {
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const b = buildingSolids(into.map, into.objects);
  assert.ok(
    [...b.statics.keys()].some((k) => k.startsWith("wall:")) &&
      [...b.statics.keys()].some((k) => k.startsWith("thing:")),
  );
  const w = await world(sizesFor({ statics: b.statics.size, vehicles: b.cars.size }));
  const build = new WorldBuilder(w);
  build.building(b);
  w.settle();
  const { x, y } = into.map.spawn;
  assert.ok(Math.abs((w.rayHit(x, 1, y, 0, -1, 0, 5) ?? -1) - 1) < 0.01, "the floor's slab, 1 m under");
  const hits = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].filter(([dx, dz]) => w.rayHit(x, 1.5, y, dx, 0, dz, 80) !== null);
  assert.equal(hits.length, 4, "walls all round");
  // across a window's middle at its pane: stopped; at 0.5 m its sill; made a door, open
  const win = into.objects.find((d) => isWindowKind(d.kind));
  assert.ok(win, "a window");
  const [e] = openingEdges(win);
  const [mx, mz] = e.dir === "h" ? [e.x + 0.5, e.y] : [e.x, e.y + 0.5];
  const [dx, dz] = e.dir === "h" ? [0, 1] : [1, 0];
  const across = (up: number) => w.rayHit(mx - dx * 0.5, up, mz - dz * 0.5, dx, 0, dz, 1);
  assert.ok(across(1.5) !== null, "not through a window's pane");
  assert.ok(across(0.5) !== null, "nor its sill");
  // the same again: nothing made twice
  assert.deepEqual(build.building(buildingSolids(into.map, into.objects)), { made: 0, removed: 0 });
  const door = into.objects.map((o) => (o.id === win.id ? { ...o, kind: "door" } : o));
  const edit = build.building(buildingSolids(into.map, door));
  assert.ok(edit.made >= 1 && edit.made <= 2, `only its floor's chunk made again: ${edit.made}`);
  assert.equal(across(1), null, "through a door");
  assert.ok(across(2.5) !== null, "its lintel");
});

test("the same world twice comes out the same (a hash of where things rest)", async () => {
  const run = async () => {
    const w = await world(sizesFor({ statics: 4, things: 100 }));
    w.setLand("land", flat());
    w.setStatic("fence", [box3(-2, -8, -1.9, 8, 0, 1.2)]);
    w.settle();
    const ids: number[] = [];
    for (let i = 0; i < 60; i++)
      ids.push(
        w.addThing({ kind: "crate", h: 0.25 }, -3 + (i % 6) * 0.9, 3 + i * 0.4, -3 + Math.floor(i / 6) * 0.7) as number,
      );
    for (let t = 0; t < 300; t++) w.step();
    const f = new Float32Array(ids.length * 3);
    const p: [number, number, number] = [0, 0, 0];
    ids.forEach((id, i) => {
      w.thingAt(id, p);
      f.set(p, i * 3);
    });
    return Buffer.from(f.buffer).toString("base64");
  };
  assert.equal(await run(), await run());
});

test("destroyed, its Jolt memory goes back", async () => {
  const J = await loadJolt();
  const heap = () => J.JoltInterface.prototype.sGetTotalMemory() - J.JoltInterface.prototype.sGetFreeMemory();
  const before = heap();
  for (let k = 0; k < 3; k++) {
    const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8, things: 50 }));
    w.setLand("land", flat());
    for (let i = 0; i < 50; i++) w.addThing({ kind: "ball", r: 0.2 }, i % 7, 3, Math.floor(i / 7));
    w.addCharacter(0, 1, 0);
    for (let t = 0; t < 60; t++) w.step();
    w.destroy();
  }
  assert.ok(heap() - before < 64 * 1024, `${heap() - before} bytes kept`);
});

test("the debug view's lines: each solid where it is, the land ending where its chunk does", async () => {
  const w = await world();
  w.setStatic("a", [box3(10, 20, 12, 21, 0, 1)]);
  w.setLand("l", { x0: 0, z0: 0, n: 5, step: 1, h: new Float32Array(25).fill(0.5) });
  const span = (l: Float32Array) => {
    const b = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
    for (let i = 0; i < l.length; i += 3)
      for (let k = 0; k < 3; k++) {
        b[k * 2] = Math.min(b[k * 2], l[i + k]);
        b[k * 2 + 1] = Math.max(b[k * 2 + 1], l[i + k]);
      }
    return b.map((v) => +v.toFixed(3));
  };
  assert.deepEqual(span(w.debugLines(11, 20.5, 1.5)), [10, 12, 0, 1, 20, 21]);
  // (5 samples a side padded to 8 with holes: the land's 0..4, no skirt past it)
  assert.deepEqual(span(w.debugLines(2, 2, 1.5)), [0, 4, 0.5, 0.5, 0, 4]);
});

test("sight: a wall stops it, a table doesn't (reach: docs/plan/50 E)", async () => {
  const w = await world();
  w.setStatic("wall", [box3(4.9, -5, 5.1, 5, 0, 3.27)], "wall");
  w.setStatic("table", [box3(2, -1, 3, 1, 0, 0.75)]);
  w.settle();
  assert.equal(w.sees(0, 1.2, 0, 6, 1, 0), false, "through the wall: no");
  assert.equal(w.sees(0, 1.2, 0, 4, 0.5, 0), true, "over the table to this side of the wall");
  assert.equal(w.sees(0, 1.2, 0, 3, 0.4, 0), true, "a table isn't in sight's way");
});
