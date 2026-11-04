import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, FENCE, FENCE_H, STATUE, TOWER, terrainAt, treesIn } from "../grounds.ts";
import { townBounds } from "../land.ts";
import { GROUND_WHATS, type GroundSolid, groundSolidsIn } from "./grounds.ts";
import type { Solid3 } from "./index.ts";

// (the land's box: land.ts, docs/plan/69)
const GROUNDS = townBounds(); // (today's town: the long road's land is its own tests')

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

test("the pitched roofs: steps a body walks up (≤ 0.2), none over the drawn slope (bare), up to the ridge", async () => {
  const { BUILDINGS, CHUNK: C, groundAt: gAt } = await import("../grounds.ts");
  const { groundSolidsIn: inChunk } = await import("./grounds.ts");
  // (the drawn slope: tp/grounds3d.ts `pitched` — over, rise, ridge along x — bare: its snow's the
  // weather's, stood a little in — docs/plan/65)
  const look: Record<string, { over: number; rise: number }> = {
    church: { over: 0.5, rise: 6 },
    farmhouse: { over: 0.55, rise: 3 },
    boathouse: { over: 0.5, rise: 2.4 },
  };
  for (const b of BUILDINGS.filter((u) => look[u.kind])) {
    const { over, rise } = look[b.kind];
    const alongX = b.kind !== "church";
    const y0 = gAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const eave = y0 + { church: 6, farmhouse: 6.2, boathouse: 3.2 }[b.kind as "church"];
    const [v0, v1] = alongX ? [b.z0, b.z1] : [b.x0, b.x1];
    const half = (v1 - v0) / 2;
    const drawn = (v: number) => eave + (rise * (half + over - Math.abs(v - (v0 + v1) / 2))) / (half + over);
    const roofs = [];
    for (let cx = Math.floor(b.x0 / C) - 1; cx <= Math.floor(b.x1 / C) + 1; cx++)
      for (let cz = Math.floor(b.z0 / C) - 1; cz <= Math.floor(b.z1 / C) + 1; cz++)
        for (const g of inChunk(cx, cz))
          if (g.what === "roof" && g.s.t === "box" && g.s.x > b.x0 && g.s.x < b.x1 && g.s.z > b.z0 && g.s.z < b.z1)
            roofs.push(g.s);
    assert.ok(roofs.length > 5, b.key);
    let top = 0;
    for (const s of roofs) {
      assert.ok(s.hy * 2 <= 0.21, `${b.key}: a step ${s.hy * 2}`);
      const [a, c] = alongX ? [s.z - s.hz, s.z + s.hz] : [s.x - s.hx, s.x + s.hx];
      // (its top under the drawn surface at both its edges: the slope's lowest there)
      assert.ok(s.y + s.hy <= Math.min(drawn(a), drawn(c)) + 0.05, `${b.key}: a step over the roof`);
      top = Math.max(top, s.y + s.hy);
    }
    assert.ok(eave + rise - top < 0.25, `${b.key}: up to its ridge (${top} of ${eave + rise})`);
  }
});

test("the streets' pavements: stood on at the drawn 0.18 over the ground, not where another street crosses", async () => {
  const { WAYS, CHUNK: C, groundAt: gAt, wayHalf, wayPave } = await import("../grounds.ts");
  const { groundSolidsIn: inChunk } = await import("./grounds.ts");
  const main = WAYS.find((w) => w.key === "main");
  assert.ok(main);
  const topAt = (x: number, z: number) => {
    let t = Number.NEGATIVE_INFINITY;
    for (const g of inChunk(Math.floor(x / C), Math.floor(z / C))) {
      if (g.what !== "pavement" || g.s.t !== "box") continue;
      const s = g.s;
      const dx = x - s.x;
      const dz = z - s.z;
      const lx = dx * Math.cos(s.a) - dz * Math.sin(s.a);
      const lz = dx * Math.sin(s.a) + dz * Math.cos(s.a);
      if (Math.abs(lx) <= s.hx && Math.abs(lz) <= s.hz) t = Math.max(t, s.y + s.hy);
    }
    return t;
  };
  let on = 0;
  for (let i = 40; i < main.line.length - 40; i += 7) {
    const [x, z] = main.line[i];
    const [bx, bz] = main.line[i + 1];
    const l = Math.hypot(bx - x, bz - z);
    const o = wayHalf(main, i) + wayPave(main, i) / 2;
    const px = x - ((bz - z) / l) * o;
    const pz = z + ((bx - x) / l) * o;
    const t = topAt(px, pz);
    if (t === Number.NEGATIVE_INFINITY) continue;
    on++;
    assert.ok(Math.abs(t - gAt(px, pz) - 0.18) < 0.03, `at (${px}, ${pz}): ${t - gAt(px, pz)}`);
  }
  assert.ok(on > 10, `on its pavement ${on} times`);
});

// ── the town's details (tp/grounds3d.ts `shop`, `civicFront`, `house`, `church`) ──
/** Every solid of these kinds whose footprint covers (x, z). */
function at(x: number, z: number, whats?: string[]): GroundSolid[] {
  return chunksRound(x, z).filter((g) => (!whats || whats.includes(g.what)) && covers(g.s, x, z));
}

test("the awnings, the canopy, the marquee: solid from 0.6 out, under their drawn tops, 2.2 over the pavement", async () => {
  const { BUILDINGS, groundAt } = await import("../grounds.ts");
  const { AWNING_IN, HEAD_ROOM } = await import("./grounds.ts");
  let shops = 0;
  for (const b of BUILDINGS.filter((u) => ["shop", "bar", "hotel"].includes(u.kind) && !u.vacant)) {
    const nz = b.face === "n" ? -1 : 1;
    const fz = b.face === "n" ? b.z0 : b.z1;
    const xm = (b.x0 + b.x1) / 2;
    const y0 = groundAt(xm, (b.z0 + b.z1) / 2);
    const mine = chunksRound(xm, fz).filter(
      (g) => g.what === "awning" && g.s.t === "box" && g.s.x > b.x0 && g.s.x < b.x1 && Math.abs(g.s.z - fz) < 4,
    );
    if (b.key === "hall") {
      assert.equal(mine.length, 0, "the hall has none");
      continue;
    }
    assert.ok(mine.length, `${b.key}: an awning`);
    shops++;
    // the drawn surface at d out (and its snow, where it's flat: the canopy's, the marquee's)
    const drawn =
      b.key === "post"
        ? () => 3.95 + 0.066
        : b.kind === "hotel"
          ? () => 3.45 + 0.099
          : (d: number) => 3.5 - (0.6 * d) / 1.6;
    const under = b.key === "post" ? 3.75 : b.kind === "hotel" ? 3.1 : 2.62;
    for (const { s } of mine) {
      if (s.t !== "box") continue;
      const d0 = Math.abs(s.z - s.hz - fz) < Math.abs(s.z + s.hz - fz) ? s.z - s.hz : s.z + s.hz;
      const d1 = d0 === s.z - s.hz ? s.z + s.hz : s.z - s.hz;
      const [a, c] = [(d0 - fz) * nz, (d1 - fz) * nz];
      assert.ok(a >= AWNING_IN - 1e-6, `${b.key}: from ${a} out, not ${AWNING_IN}`);
      const t = top(s) - y0;
      assert.ok(t <= Math.min(drawn(a), drawn(c)) + 1e-6, `${b.key}: its top ${t} over the drawn ${drawn(c)}`);
      assert.ok(t >= Math.max(drawn(a), drawn(c)) - 0.2, `${b.key}: its top ${t} far under the drawn ${drawn(a)}`);
      assert.ok(bottom(s) - y0 >= under - 1e-6, `${b.key}: its bottom ${bottom(s) - y0} under the drawn ${under}`);
      // the head room over whatever's under it: the pavement, the steps
      for (const [px, pz] of [
        [s.x - s.hx + 0.01, s.z],
        [s.x, s.z - s.hz + 0.01],
        [s.x + s.hx - 0.01, s.z + s.hz - 0.01],
      ]) {
        const floor = Math.max(
          groundAt(px, pz),
          ...at(px, pz, ["pavement", "porch"])
            .map((g) => top(g.s))
            .filter((y) => y < bottom(s)),
        );
        assert.ok(bottom(s) - floor >= HEAD_ROOM, `${b.key}: ${bottom(s) - floor} over the floor at (${px}, ${pz})`);
      }
    }
    // (the strip by the wall open: a run up the face goes past)
    assert.equal(at(xm + 0.3, fz + nz * 0.3, ["awning"]).length, 0, `${b.key}: by the wall`);
  }
  assert.ok(shops >= 8, `${shops} shops' awnings`);
});

/** Up from `from` to `to` (a straight line at a body's middle), the floor's rises: each the top of
 *  what's underfoot (the land, the pavement, a step) — none over the step-up, nothing in the way. */
function climb(from: [number, number], to: [number, number], ground: (x: number, z: number) => number): number[] {
  const n = 60;
  const floors: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / n;
    const z = from[1] + ((to[1] - from[1]) * i) / n;
    const here = at(x, z);
    const g = ground(x, z);
    // (underfoot: what tops out within a step of the land; overhead: from 2 m up)
    const feet = here.filter((s) => top(s.s) <= g + 1.2);
    const f = Math.max(g, ...feet.map((s) => top(s.s)));
    for (const s of here)
      if (!feet.includes(s))
        assert.ok(bottom(s.s) >= f + 2.0, `${s.what} in the way at (${x}, ${z}): from ${bottom(s.s) - f}`);
    floors.push(f);
  }
  const rises = floors.slice(1).map((f, i) => f - floors[i]);
  return rises;
}

test("the porches, the civic steps and the church's: each step ≤ 0.27 up to the door, its roof 2.2 over the deck", async () => {
  const { BUILDINGS, groundAt } = await import("../grounds.ts");
  const { HEAD_ROOM } = await import("./grounds.ts");
  let houses = 0;
  for (const b of BUILDINGS.filter((u) => u.kind === "house")) {
    const nx = b.face === "e" ? 1 : -1;
    const fx = b.face === "e" ? b.x1 : b.x0;
    const zm = (b.z0 + b.z1) / 2;
    const y0 = groundAt((b.x0 + b.x1) / 2, zm);
    const rises = climb([fx + nx * 3, zm], [fx + nx * 0.05, zm], groundAt);
    assert.ok(Math.max(...rises) <= 0.27, `${b.key}: a step ${Math.max(...rises)}`);
    const deck = Math.max(
      ...at(fx + nx * 0.3, zm, ["porch"])
        .map((g) => top(g.s))
        .filter((y) => y < y0 + 1),
    );
    assert.ok(Math.abs(deck - (y0 + 0.5)) < 1e-6, `${b.key}: its deck at ${deck - y0}`);
    // its roof: from 0.6 out, at its drawn top (2.9), 2.2 over the deck
    const roof = at(fx + nx * 1.2, zm, ["porch"]).filter((g) => bottom(g.s) > y0 + 2);
    assert.equal(roof.length, 1, `${b.key}: its porch roof`);
    assert.ok(top(roof[0].s) <= y0 + 2.9 + 1e-6 && bottom(roof[0].s) - deck >= HEAD_ROOM, b.key);
    assert.equal(at(fx + nx * 0.4, zm, ["porch"]).filter((g) => bottom(g.s) > y0 + 2).length, 0, "open by the wall");
    // the railing (a front gable's): one thin box, its top the rail's 1.45
    for (const g of chunksRound(fx, zm).filter((u) => u.what === "porch_rail" && u.s.t === "box")) {
      if (g.s.t !== "box" || Math.abs(g.s.x - (fx + nx * 1.6)) > 0.01 || g.s.z < b.z0 || g.s.z > b.z1) continue;
      assert.ok(Math.min(g.s.hx, g.s.hz) <= 0.13 && Math.abs(top(g.s) - (y0 + 1.45)) < 1e-6, `${b.key}: its railing`);
    }
    // the chimney: to 0.8 over the ridge and its cap
    const chimney = chunksRound(b.x0, zm).filter(
      (g) => g.what === "building" && g.s.x > b.x0 && g.s.x < b.x1 && g.s.z > b.z0 && g.s.z < b.z1 && top(g.s) > y0 + 7,
    );
    assert.ok(chimney.length >= 2, `${b.key}: its chimney`);
    houses++;
  }
  assert.ok(houses >= 10);
  for (const b of BUILDINGS.filter((u) => u.key === "hall" || u.key === "post")) {
    const fz = b.face === "n" ? b.z0 : b.z1;
    const nz = b.face === "n" ? -1 : 1;
    const xm = (b.x0 + b.x1) / 2;
    const rises = climb([xm + 0.5, fz + nz * 2], [xm + 0.5, fz + nz * 0.05], (x, z) => groundAt(x, z));
    assert.ok(Math.max(...rises) <= 0.27, `${b.key}: a step ${Math.max(...rises)}`);
  }
  const church = BUILDINGS.find((u) => u.kind === "church");
  if (church) {
    const xm = (church.x0 + church.x1) / 2;
    const sz1 = church.z1 + 2.5;
    // (to the steeple's solid, 0.2 past its drawn face)
    const rises = climb([xm, sz1 + 2], [xm, sz1 + 0.25], groundAt);
    assert.ok(Math.max(...rises) <= 0.27 && rises.reduce((a, b) => a + b, 0) > 0.4, `the church: ${rises}`);
  }
});

test("the hall's pediment: steps ≤ 0.2 under its drawn slopes, up to its peak", async () => {
  const { BUILDINGS, groundAt } = await import("../grounds.ts");
  const b = BUILDINGS.find((u) => u.key === "hall");
  assert.ok(b);
  const fz = b.face === "n" ? b.z0 : b.z1;
  const xm = (b.x0 + b.x1) / 2;
  const y0 = groundAt(xm, (b.z0 + b.z1) / 2);
  const drawn = (x: number) => y0 + 4.8 + (1.5 * (3.3 - Math.abs(x - xm))) / 3.3;
  const steps = chunksRound(xm, fz).filter(
    (g) => g.what === "building" && g.s.t === "box" && Math.abs(g.s.x - xm) < 3.4 && bottom(g.s) >= y0 + 4.8 - 1e-6,
  );
  assert.ok(steps.length >= 6);
  let peak = 0;
  for (const { s } of steps) {
    if (s.t !== "box") continue;
    assert.ok(s.hy * 2 <= 0.2 + 1e-6);
    assert.ok(
      top(s) <= Math.min(drawn(s.x - s.hx), drawn(s.x + s.hx)) + 1e-6,
      `a step over the pediment at ${top(s) - y0}`,
    );
    peak = Math.max(peak, top(s));
  }
  assert.ok(y0 + 6.3 - peak < 0.2, `to ${peak - y0}`);
});

test("lamps and street things on a pavement stand on it (pavedAt), off it on the ground", async () => {
  const { LAMPS, STREET, groundAt, pavedAt, KERB } = await import("../grounds.ts");
  let on = 0;
  for (const l of LAMPS.filter((u) => u.kind === "town")) {
    const lift = pavedAt(l.x, l.z);
    const foot = at(l.x, l.z, ["lamp_town"]);
    assert.ok(foot.length, l.key);
    const b = Math.min(...foot.map((g) => bottom(g.s)));
    assert.ok(Math.abs(b - groundAt(l.x, l.z) - lift) < 1e-6, `${l.key}: at ${b - groundAt(l.x, l.z)}`);
    if (lift) on++;
  }
  assert.ok(on >= 20, `${on} lamps on the pavements`);
  const hydrant = STREET.find((t) => t.kind === "hydrant");
  assert.ok(hydrant && Math.abs(pavedAt(hydrant.x, hydrant.z) - KERB) < 1e-9);
  // (off a street: none)
  assert.equal(pavedAt(0, 0), 0);
});
