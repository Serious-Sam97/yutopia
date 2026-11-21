import assert from "node:assert/strict";
import { test } from "node:test";
import { bridgeRuns, CHUNK, FENCE, FENCE_H, STATUE, TOWER, terrainAt, treesIn, WAYS } from "../grounds.ts";
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

test("the kit's roofs (plan 110): steps a body walks up (≤ 0.2), none over the drawn roof, up to its ridge", async () => {
  const { BUILDINGS, CHUNK: C, groundAt: gAt } = await import("../grounds.ts");
  const { layoutOf } = await import("../building-styles.ts");
  const { groundSolidsIn: inChunk } = await import("./grounds.ts");
  let roofs = 0;
  for (const b of BUILDINGS) {
    const L = layoutOf(b);
    if (!L) continue;
    const y0 = gAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const profs = L.solids.flatMap((so) => ("steps" in so ? [so.steps] : []));
    if (!profs.length) continue;
    /** the highest drawn roof over (a span of) the plan: each roof's slope at both ends of the span */
    const drawnOver = (x0: number, z0: number, x1: number, z1: number) => {
      let best = Number.NEGATIVE_INFINITY;
      for (const st of profs) {
        if (
          (x0 + x1) / 2 < st.x0 - 1e-6 ||
          (x0 + x1) / 2 > st.x1 + 1e-6 ||
          (z0 + z1) / 2 < st.z0 - 1e-6 ||
          (z0 + z1) / 2 > st.z1 + 1e-6
        )
          continue;
        const at = (c: number) => {
          for (let i = 0; i + 1 < st.prof.length; i++) {
            const [ca, ya] = st.prof[i];
            const [cb, yb] = st.prof[i + 1];
            if (c >= ca - 1e-6 && c <= cb + 1e-6) return y0 + ya + ((yb - ya) * (c - ca)) / (cb - ca || 1);
          }
          return Number.NEGATIVE_INFINITY;
        };
        const [a, c] = st.alongX ? [z0, z1] : [x0, x1];
        best = Math.max(best, Math.min(at(a), at(c)));
      }
      return best;
    };
    const lo = y0 + Math.min(...profs.flatMap((st) => st.prof.map((p) => p[1]))) - 0.5;
    const peak = y0 + Math.max(...profs.flatMap((st) => st.prof.map((p) => p[1])));
    let top = Number.NEGATIVE_INFINITY;
    for (let cx = Math.floor(b.x0 / C) - 1; cx <= Math.floor(b.x1 / C) + 1; cx++)
      for (let cz = Math.floor(b.z0 / C) - 1; cz <= Math.floor(b.z1 / C) + 1; cz++)
        for (const g of inChunk(cx, cz)) {
          const s = g.s;
          if (g.what !== "roof" || s.t !== "box" || s.hy * 2 > 0.21 || s.y < lo) continue;
          if (s.x < b.x0 - 4 || s.x > b.x1 + 4 || s.z < b.z0 - 4 || s.z > b.z1 + 4) continue;
          const allowed = drawnOver(s.x - s.hx, s.z - s.hz, s.x + s.hx, s.z + s.hz);
          if (allowed === Number.NEGATIVE_INFINITY) continue; // (a flat roof's, a canopy's)
          assert.ok(s.y + s.hy <= allowed + 0.05, `${b.key}: a step over its roof`);
          top = Math.max(top, s.y + s.hy);
        }
    assert.ok(peak - top < 0.3, `${b.key}: up to its ridge (${top - y0} of ${peak - y0})`);
    roofs++;
  }
  assert.ok(roofs >= 20, `${roofs} roofs`);
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

test("the awnings, the canopies, the marquee (plan 110): solid from 0.6 out, 2.2 over what's under them", async () => {
  const { BUILDINGS, groundAt } = await import("../grounds.ts");
  const { layoutOf } = await import("../building-styles.ts");
  const { AWNING_IN, HEAD_ROOM } = await import("./grounds.ts");
  let n = 0;
  for (const b of BUILDINGS) {
    const L = layoutOf(b);
    if (!L) continue;
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const { x, z, ox, oz } = L.door;
    for (const so of L.solids) {
      if (so.what !== "awning" || !("box" in so)) continue;
      n++;
      const [x0, z0, x1, z1, ya] = so.box;
      // (its nearest edge to the front's face: AWNING_IN out at least)
      const face = ox !== 0 ? x : z;
      const near =
        ox !== 0
          ? Math.min(Math.abs(x0 - face), Math.abs(x1 - face))
          : Math.min(Math.abs(z0 - face), Math.abs(z1 - face));
      assert.ok(near >= AWNING_IN - 1e-6, `${b.key}: from ${near} out`);
      for (const [px, pz] of [
        [x0 + 0.01, z0 + 0.01],
        [x1 - 0.01, z1 - 0.01],
      ]) {
        const floor = Math.max(
          groundAt(px, pz),
          ...at(px, pz, ["pavement", "porch"])
            .map((g) => top(g.s))
            .filter((y) => y < y0 + ya),
        );
        assert.ok(y0 + ya - floor >= HEAD_ROOM - 1e-6, `${b.key}: ${y0 + ya - floor} over the floor at (${px}, ${pz})`);
      }
      void oz;
    }
  }
  assert.ok(n >= 8, `${n} awnings`);
});

/** Up from `from` to `to` (a straight line at a body's middle), the floor's rises: each the top of
 *  what's underfoot (the land, the pavement, a step) — none over the step-up, nothing in the way. */
function climb(
  from: [number, number],
  to: [number, number],
  ground: (x: number, z: number) => number,
  whats?: string[],
): number[] {
  const n = 60;
  const floors: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / n;
    const z = from[1] + ((to[1] - from[1]) * i) / n;
    const here = at(x, z, whats);
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

test("every door (plan 110): walked up to from the street, each step ≤ 0.27, nothing in the way under 2 m", async () => {
  const { BUILDINGS, groundAt } = await import("../grounds.ts");
  const { layoutOf } = await import("../building-styles.ts");
  let doors = 0;
  for (const b of BUILDINGS) {
    const L = layoutOf(b);
    if (!L || b.kind === "garage" || b.kind === "silo" || b.kind === "shelter") continue;
    const { x, z, ox, oz } = L.door;
    // (where the land itself steps up onto its pad, that's the land's: not this one's to climb)
    if (Math.abs(groundAt(x - ox * 0.3, z - oz * 0.3) - groundAt(x + ox * 0.3, z + oz * 0.3)) > 0.27) continue;
    // (its own: the street's lamps and poles before a door are the street's)
    const own = ["porch", "porch_rail", "awning", "pavement", "building", "roof", "forecourt"];
    const rises = climb([x + ox * 3.4, z + oz * 3.4], [x + ox * 0.05, z + oz * 0.05], groundAt, own);
    assert.ok(Math.max(...rises) <= 0.27, `${b.key}: a step ${Math.max(...rises)}`);
    doors++;
  }
  assert.ok(doors >= 30, `${doors} doors`);
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

test("every bridge: its deck under the wheels the whole way, from the road before it onto the road after — no slot at its ends", () => {
  // (the river bridge's ends were a slot across the road 3–4 m deep: the deck stopped at its first and last bridged
  // samples, the land not flattened within half a sample of them — everything on Jolt fell in)
  let n = 0;
  for (const w of WAYS)
    for (const r of bridgeRuns(w)) {
      if (r.length < 2) continue;
      n++;
      const a = r[0];
      const b = r[r.length - 1];
      const L = w.line;
      const decks = new Map<string, GroundSolid[]>();
      const near = (x: number, z: number) => {
        const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
        let l = decks.get(k);
        if (!l) {
          l = chunksRound(x, z).filter((g) => g.what === "bridge_deck");
          decks.set(k, l);
        }
        return l;
      };
      for (let i = Math.max(0, a - 4); i < Math.min(L.length - 1, b + 4); i++) {
        const [ax, az] = L[i];
        const [bx, bz] = L[i + 1];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        // (every 5 cm along, across from kerb to kerb)
        for (let u = 0; u <= 1; u += 0.05 / len)
          for (const o of [-(w.w / 2 - 0.4), 0, w.w / 2 - 0.4]) {
            const x = ax + (bx - ax) * u + nx * o;
            const z = az + (bz - az) * u + nz * o;
            const want = w.h[i] + (w.h[i + 1] - w.h[i]) * u;
            const deck = Math.max(...near(x, z).map((g) => (covers(g.s, x, z) ? top(g.s) : Number.NEGATIVE_INFINITY)));
            const got = Math.max(deck, terrainAt(x, z));
            assert.ok(
              want - got < 0.15,
              `${w.key}'s bridge ${a}–${b}: ${(want - got).toFixed(2)} m down at sample ${i} + ${u.toFixed(2)} (${x.toFixed(1)}, ${z.toFixed(1)})`,
            );
            assert.ok(
              got - want < 0.2,
              `${w.key}'s bridge ${a}–${b}: a lip ${(got - want).toFixed(2)} (deck ${(deck - want).toFixed(2)}) at sample ${i} + ${u.toFixed(2)} off ${o.toFixed(1)}`,
            );
          }
      }
    }
  assert.ok(n >= 3, "the river's, the ravine's, the long road's");
});
