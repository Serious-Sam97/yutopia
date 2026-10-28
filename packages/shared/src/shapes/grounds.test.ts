import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, FENCE, FENCE_H, GROUNDS, STATUE, TOWER, terrainAt, treesIn } from "../grounds.ts";
import { GROUND_WHATS, type GroundSolid, groundSolidsIn } from "./grounds.ts";
import type { Solid3 } from "./index.ts";

const top = (s: Solid3) => (s.t === "box" ? s.y + s.hy : s.y1);
const bottom = (s: Solid3) => (s.t === "box" ? s.y - s.hy : s.y0);
/** Is (x, z) within this solid's footprint (a box turned about y)? */
function covers(s: Solid3, x: number, z: number, pad = 0): boolean {
  if (s.t === "cyl") return Math.hypot(x - s.x, z - s.z) <= s.r + pad;
  const c = Math.cos(s.a);
  const n = Math.sin(s.a);
  const dx = x - s.x;
  const dz = z - s.z;
  // (into its own frame: the inverse of rotation.y)
  const lx = dx * c - dz * n;
  const lz = dx * n + dz * c;
  return Math.abs(lx) <= s.hx + pad && Math.abs(lz) <= s.hz + pad;
}
function chunksRound(x: number, z: number): GroundSolid[] {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const out: GroundSolid[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...groundSolidsIn(cx + i, cz + j));
  return out;
}

test("every solid of the Grounds: finite, a size, in its chunk; the counts the physics world sizes from", () => {
  const t0 = performance.now();
  let total = 0;
  let most = 0;
  let mostAt = "";
  const byWhat = new Map<string, number>();
  for (let cz = Math.floor(GROUNDS.z0 / CHUNK); cz <= Math.floor(GROUNDS.z1 / CHUNK); cz++)
    for (let cx = Math.floor(GROUNDS.x0 / CHUNK); cx <= Math.floor(GROUNDS.x1 / CHUNK); cx++) {
      const list = groundSolidsIn(cx, cz);
      total += list.length;
      if (list.length > most) {
        most = list.length;
        mostAt = `${cx},${cz}`;
      }
      for (const { what, s } of list) {
        byWhat.set(what, (byWhat.get(what) ?? 0) + 1);
        assert.ok(GROUND_WHATS[what], what);
        const nums = s.t === "box" ? [s.x, s.y, s.z, s.hx, s.hy, s.hz, s.a] : [s.x, s.z, s.r, s.y0, s.y1];
        assert.ok(nums.every(Number.isFinite), `${what} at ${s.x}, ${s.z}: not finite`);
        if (s.t === "box") assert.ok(s.hx > 0 && s.hy > 0 && s.hz > 0, `${what} at ${s.x}, ${s.z}: no size`);
        else assert.ok(s.r > 0 && s.y1 > s.y0, `${what} at ${s.x}, ${s.z}: no size`);
        assert.equal(Math.floor(s.x / CHUNK), cx, `${what} at ${s.x}: not in its chunk`);
        assert.equal(Math.floor(s.z / CHUNK), cz, `${what} at ${s.z}: not in its chunk`);
      }
    }
  const ms = performance.now() - t0;
  console.log(
    `[grounds solids] ${total} over the Grounds, most in a chunk ${most} (${mostAt}), ${ms.toFixed(0)} ms;`,
    Object.fromEntries([...byWhat].sort((a, b) => b[1] - a[1])),
  );
  assert.ok(total > 1000);
});

test("the same twice (pure)", () => {
  assert.deepEqual(groundSolidsIn(0, -12), groundSolidsIn(0, -12));
});

test("the company's fence: FENCE_H (1.2) over the land at a post", () => {
  // (a point on its south side, away from the gate)
  const [x, z] = [FENCE[2][0] - 31.5, FENCE[2][1]];
  const at = chunksRound(x, z).filter((g) => g.what === "fence" && covers(g.s, x, z));
  assert.ok(at.length, "a fence piece there");
  const s = at[0].s;
  assert.ok(Math.abs(top(s) - (terrainAt(x, z) + FENCE_H)) < 0.3, `top ${top(s)} vs ${terrainAt(x, z) + FENCE_H}`);
  assert.ok(bottom(s) < terrainAt(x, z));
});

test("the water tower: its riser stands at its middle, its tank over it", () => {
  const near = chunksRound(TOWER.x, TOWER.z).filter((g) => g.what === "tower" && covers(g.s, TOWER.x, TOWER.z));
  const y = terrainAt(TOWER.x, TOWER.z);
  assert.ok(
    near.some((g) => bottom(g.s) <= y + 0.01 && top(g.s) > y + 20),
    "the riser",
  );
  assert.ok(
    near.some((g) => bottom(g.s) > y + 20 && g.s.t === "cyl" && g.s.r > 6),
    "the tank",
  );
});

test("the statue on its pedestal, 7.4 up", () => {
  const near = chunksRound(STATUE.x, STATUE.z).filter((g) => g.what === "statue" && covers(g.s, STATUE.x, STATUE.z));
  assert.ok(near.length >= 5);
  assert.ok(Math.max(...near.map((g) => top(g.s))) > terrainAt(STATUE.x, STATUE.z) + 7);
});

test("a tree's trunk stands on the land at the tree", () => {
  // (a chunk deep in the woods)
  const [cx, cz] = [-8, -8];
  const trees = treesIn(cx, cz);
  assert.ok(trees.length > 10);
  const t = trees[0];
  const trunk = groundSolidsIn(cx, cz).find((g) => g.what.startsWith("tree_") && g.s.x === t.x && g.s.z === t.z);
  assert.ok(trunk && trunk.s.t === "cyl");
  assert.ok(trunk.s.t === "cyl" && trunk.s.y0 < terrainAt(t.x, t.z) && trunk.s.y0 > terrainAt(t.x, t.z) - 0.5);
});
