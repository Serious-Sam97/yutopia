import assert from "node:assert/strict";
import { test } from "node:test";
import { CAR_BODY, carKindOf } from "./car/body.ts";
import { HOME_CARS } from "./car/homes.ts";
import { CHUNK, groundSurfaceAt, groundsChunk, MOTORS, motorsTiles, treesIn } from "./grounds.ts";

// The car dealer (docs/plan/43-the-spot.md, phase 2): its forecourt is concrete with no trees on
// it, its posts and rail are in the walking's way, and its vehicles on show stand clear of each
// other, the posts, the rail and the collection bay, where a new car waits.

const Y = MOTORS.yard;
/** A vehicle's footprint's corners (its box round the CoG, turned by `a`). */
function corners(model: string, x: number, z: number, a: number): [number, number][] {
  const b = CAR_BODY[carKindOf(model)];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [b.ahead, b.width / 2],
    [b.ahead, -b.width / 2],
    [-b.behind, -b.width / 2],
    [-b.behind, b.width / 2],
  ].map(([u, w]) => [x + c * u - s * w, z + s * u + c * w]);
}
/** Two convex quads overlap (separating axes). */
function overlap(p: [number, number][], q: [number, number][], gap = 0): boolean {
  for (const poly of [p, q])
    for (let i = 0; i < 4; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % 4];
      const nx = -(bz - az);
      const nz = bx - ax;
      const l = Math.hypot(nx, nz);
      const proj = (r: [number, number][]) => r.map(([x, z]) => (x * nx + z * nz) / l);
      const [p0, p1] = [Math.min(...proj(p)), Math.max(...proj(p))];
      const [q0, q1] = [Math.min(...proj(q)), Math.max(...proj(q))];
      if (p1 + gap <= q0 || q1 + gap <= p0) return false;
    }
  return true;
}

test("the forecourt: concrete, no trees, its posts and rail in the way", () => {
  for (let x = Y.x0 + 0.5; x < Y.x1; x += 2)
    for (let z = Y.z0 + 0.5; z < Y.z1; z += 2) assert.equal(groundSurfaceAt(x, z), "walk", `${x}, ${z}`);
  const cx0 = Math.floor((Y.x0 - 3) / CHUNK);
  const cx1 = Math.floor((Y.x1 + 3) / CHUNK);
  const cz0 = Math.floor((Y.z0 - 3) / CHUNK);
  const cz1 = Math.floor((Y.z1 + 3) / CHUNK);
  for (let i = cx0; i <= cx1; i++)
    for (let j = cz0; j <= cz1; j++)
      for (const t of treesIn(i, j))
        assert.ok(!(t.x > Y.x0 - 1 && t.x < Y.x1 + 1 && t.z > Y.z0 - 1 && t.z < Y.z1 + 1), `a tree at ${t.x}, ${t.z}`);
  for (const [x, z] of motorsTiles()) {
    const c = groundsChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    const i = x - c.cx * CHUNK;
    const j = z - c.cz * CHUNK;
    assert.equal(c.walk[j * CHUNK + i], 0, `the tile ${x}, ${z} is walked through`);
  }
});

test("the vehicles on show: home cars that are never driven, clear of each other and the bay", () => {
  const show = HOME_CARS.filter((h) => h.role === "show");
  assert.equal(show.length, MOTORS.show.length);
  assert.deepEqual(new Set(show.map((h) => h.model)).size, show.length, "one of each");
  const c = MOTORS.collect;
  const bay = corners("sedan", c.x, c.z, c.a);
  const quads = show.map((h) => ({ id: h.id, q: corners(h.model, h.x, h.z, h.a) }));
  for (const [i, a] of quads.entries()) {
    for (const b of quads.slice(i + 1)) assert.ok(!overlap(a.q, b.q, 0.2), `${a.id} and ${b.id}`);
    assert.ok(!overlap(a.q, bay, 0.3), `${a.id} in the collection bay`);
    // on the forecourt, off its rail
    for (const [x, z] of a.q) assert.ok(x > Y.x0 && x < Y.x1 - 0.3 && z > Y.z0 && z < Y.z1 - 0.3, `${a.id} off it`);
    // clear of the posts
    for (const [x, z] of [...MOTORS.signPosts, ...MOTORS.floods]) {
      const post: [number, number][] = [
        [x - 0.15, z - 0.15],
        [x + 0.15, z - 0.15],
        [x + 0.15, z + 0.15],
        [x - 0.15, z + 0.15],
      ];
      assert.ok(!overlap(a.q, post, 0.3), `${a.id} on a post at ${x}, ${z}`);
    }
  }
  // the collection bay: on the forecourt, by its way in
  for (const [x, z] of bay) assert.ok(x > Y.x0 && x < Y.x1 && z > Y.z0 && z < Y.z1);
  assert.ok(c.x > MOTORS.way.x0 && c.x < MOTORS.way.x1);
});
