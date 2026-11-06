import assert from "node:assert/strict";
import test from "node:test";
import * as G from "./grounds.ts";
import {
  CHUNK,
  carBlockedCell,
  heightAt,
  iceAt,
  longDressIn,
  surfaceCellAt,
  terrainAt,
  treesIn,
  WAYS,
  walkableCell,
  waterAt,
} from "./grounds.ts";
import {
  ALT,
  at,
  BEND,
  CREEK,
  GRADE,
  LAKE,
  LENGTH,
  LOOKOUT_DECK,
  longBridged,
  NAMES,
  PASS,
  ROAD_W,
  S,
  SHORE,
  SPINE,
} from "./longroad.ts";
import { iceSheet } from "./physics/build.ts";
import { route, routeOver } from "./route.ts";
import { groundSolidsIn } from "./shapes/grounds.ts";

// docs/plan/69-the-long-road.md, phase 3: Long Pine Road, the spine's test — its grades, its width
// clear, every metre of it walked and driven, its bridges, what lines it.

const road = () => {
  const w = WAYS.find((u) => u.key === "long-road");
  assert.ok(w, "the long road laid");
  return w;
};

test("the course: 13–14 km, the pass at 461 m, grades of 9% at most, the hairpins under 5%", () => {
  assert.ok(LENGTH > 13_000 && LENGTH < 14_500, `${LENGTH} m`);
  assert.equal(Math.round(ALT[PASS]), 461);
  assert.equal(NAMES.road, "Long Pine Road");
  for (let i = 0; i < SPINE.length; i++) {
    assert.ok(Math.abs(GRADE[i]) <= 0.091, `${(GRADE[i] * 100).toFixed(1)}% at km ${(S[i] / 1000).toFixed(2)}`);
    if (BEND[i] > 0.03) assert.ok(Math.abs(GRADE[i]) <= 0.05, `a hairpin at ${(GRADE[i] * 100).toFixed(1)}%`);
  }
});

test("the road: its line the spine, its heights the profile, asphalt and walkable all the way", () => {
  const w = road();
  assert.equal(w.line.length, SPINE.length);
  assert.equal(w.w, ROAD_W);
  for (let i = 0; i < SPINE.length; i += 7) {
    const [x, z] = SPINE[i];
    // (its first 80 m eased from Main Street's height: the profile after)
    assert.ok(Math.abs(w.h[i] - ALT[i]) < (S[i] < 80 ? 1 : 1e-9));
    assert.ok(
      Math.abs(heightAt(x, z) - w.h[i]) < 0.25,
      `km ${(S[i] / 1000).toFixed(2)}: ${heightAt(x, z)} vs ${w.h[i]}`,
    );
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    assert.ok(walkableCell(tx, tz), `walkable at km ${(S[i] / 1000).toFixed(2)}`);
    assert.ok(!carBlockedCell(tx, tz), `driven at km ${(S[i] / 1000).toFixed(2)}`);
    assert.equal(surfaceCellAt(tx, tz), "asphalt");
  }
});

test("its width clear: no tree within 2 m of its edges", () => {
  const seen = new Set<string>();
  for (let i = 0; i < SPINE.length; i += 16) {
    const cx = Math.floor(SPINE[i][0] / CHUNK);
    const cz = Math.floor(SPINE[i][1] / CHUNK);
    const k = `${cx},${cz}`;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const t of treesIn(cx, cz))
      for (let j = Math.max(0, i - 80); j < Math.min(SPINE.length, i + 80); j++)
        assert.ok(
          Math.hypot(t.x - SPINE[j][0], t.z - SPINE[j][1]) > ROAD_W / 2 + 2,
          `a tree on the road at ${t.x},${t.z}`,
        );
  }
});

test("its bridges: the timber one over the creek, the high one over the gorge, decked at the road's height", () => {
  const w = road();
  const runs: [number, number][] = [];
  for (let i = 0; i < w.bridged.length; i++)
    if (w.bridged[i]) {
      const last = runs[runs.length - 1];
      if (last && i - last[1] <= 2) last[1] = i;
      else runs.push([i, i]);
    }
  assert.equal(runs.length, 2, JSON.stringify(runs.map(([a, b]) => [S[a], S[b]])));
  const [timber, high] = runs;
  assert.ok(Math.abs(S[timber[0]] / 1000 - 2.65) < 0.2);
  assert.ok(Math.abs(S[high[0]] / 1000 - 5.95) < 0.2);
  // (on the high bridge: the deck's height, 40 m over the gorge's floor)
  const m = Math.floor((high[0] + high[1]) / 2);
  const [x, z] = SPINE[m];
  assert.ok(Math.abs(heightAt(x, z) - ALT[m]) < 0.1);
  assert.ok(ALT[m] - terrainAt(x, z) > 30, `${ALT[m] - terrainAt(x, z)} m over the gorge`);
});

test("what lines it: rails where it drops (solid, kept off), posts, poles past the treeline, km markers, signs", () => {
  const all: ReturnType<typeof longDressIn> = [];
  const seen = new Set<string>();
  for (const [x, z] of SPINE) {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(...longDressIn(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  }
  const n = (k: string) => all.filter((d) => d.kind === k).length;
  assert.ok(n("rail") > 100, `${n("rail")} rails`);
  assert.ok(n("post") > 400);
  assert.ok(n("pole") > 200);
  // (thirteen km, the sixth on the high bridge: none there)
  assert.equal(n("km"), 12);
  assert.equal(n("sign"), 4);
  // (a rail's tile: nobody walks onto it, no car drives through it)
  const r = all.find((d) => d.kind === "rail");
  assert.ok(r && r.bx !== undefined && r.bz !== undefined);
  const mx = Math.floor((r.x + (r.bx ?? 0)) / 2);
  const mz = Math.floor((r.z + (r.bz ?? 0)) / 2);
  assert.ok(carBlockedCell(mx, mz));
});

test("the land round it: a band 300 m either side walked, past it the walls; Silver Lake swum", () => {
  const i = at(3);
  const [x, z] = SPINE[i];
  // (150 m off it, in the wood: most of the ground walked — the trees' tiles aside)
  let free = 0;
  for (let a = 0; a < 10; a++)
    for (let b = 0; b < 10; b++) if (walkableCell(Math.floor(x) + a, Math.floor(z) - 150 + b)) free++;
  assert.ok(free > 50, `${free} of 100 walked`);
  assert.ok(!walkableCell(Math.floor(x), Math.floor(z) - 700));
  const w = waterAt(LAKE.cx, LAKE.cz);
  assert.ok(w && w.kind === "lake" && w.depth > 10);
});

test("Silver Lake ices from its shores in, walked on it; the creek runs open; a path down to the shore", () => {
  const mid = { x: LAKE.cx, z: LAKE.cz };
  const shore = { x: LAKE.cx, z: LAKE.cz + LAKE.rz * 0.93 };
  assert.ok(iceAt(mid.x, mid.z, 1), "iced over in the deep winter");
  assert.equal(iceAt(mid.x, mid.z, 0.4), null, "its middle open as it thaws");
  assert.ok(iceAt(shore.x, shore.z, 0.4), "its shore still iced");
  assert.equal(iceAt(mid.x, mid.z, 0), null);
  // (the creek's water runs: never iced)
  const [cx, cz] = CREEK[Math.floor(CREEK.length / 2)];
  assert.ok(waterAt(cx, cz), "the creek's water");
  assert.equal(iceAt(cx, cz, 1), null);
  // (the physics' sheet: boxes at the ice's top over the lake)
  const lake = iceSheet(1).filter((b) => b.t === "box" && Math.hypot(b.x - LAKE.cx, b.z - LAKE.cz) < LAKE.rx);
  assert.ok(lake.length > 100, `${lake.length} boxes`);
  // (the path from the road between the cabins to the boathouse, walked; the GPS's way there)
  for (const [x, z] of SHORE.path) assert.ok(walkableCell(Math.floor(x), Math.floor(z)), `${x}, ${z}`);
  const end = SHORE.path[SHORE.path.length - 1];
  routeOver(G);
  const r = route(SPINE[at(10)] as [number, number], end, "foot");
  assert.ok(r, "routed down to the shore");
});

test("its bridges solid each on its own: none of their deck or truss on the road between them", () => {
  const whats = (km: number) => {
    const [x, z] = SPINE[at(km)];
    return new Set(groundSolidsIn(Math.floor(x / CHUNK), Math.floor(z / CHUNK)).map((g) => g.what));
  };
  for (const km of [3.5, 4.2, 5.0]) {
    const w = whats(km);
    assert.ok(!w.has("bridge_deck") && !w.has("bridge_rail"), `km ${km}`);
  }
  // (and on them, both)
  const bridged = road()
    .line.map((_, i) => i)
    .filter((i) => road().bridged[i]);
  const mid = bridged[Math.floor(bridged.length / 4)];
  const [bx, bz] = road().line[mid];
  const w = new Set(groundSolidsIn(Math.floor(bx / CHUNK), Math.floor(bz / CHUNK)).map((g) => g.what));
  assert.ok(w.has("bridge_deck") && w.has("bridge_rail"));
});

test("the road's line never turns back on itself, and its land is flat under it edge to edge", () => {
  // (the uniform spline looped at each hairpin's ends: a straight run past the turn, the turn begun
  // back under it)
  for (let i = 3; i < SPINE.length - 3; i++) {
    const a = Math.atan2(SPINE[i][1] - SPINE[i - 3][1], SPINE[i][0] - SPINE[i - 3][0]);
    const b = Math.atan2(SPINE[i + 3][1] - SPINE[i][1], SPINE[i + 3][0] - SPINE[i][0]);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    assert.ok(d < Math.PI / 3, `turns back at ${i} (${SPINE[i].map(Math.round)})`);
  }
  // (nor kinks: a leg started behind its hairpin's end, the road bent 24° in a metre, its ribbon torn)
  const head = (i: number) => Math.atan2(SPINE[i + 1][1] - SPINE[i][1], SPINE[i + 1][0] - SPINE[i][0]);
  for (let i = 1; i < SPINE.length - 2; i++) {
    let d = Math.abs(head(i) - head(i - 1));
    if (d > Math.PI) d = 2 * Math.PI - d;
    assert.ok(
      d < (10 * Math.PI) / 180,
      `a kink of ${Math.round((d * 180) / Math.PI)}° at ${i} (${SPINE[i].map(Math.round)})`,
    );
  }
  // (the asphalt's a ribbon with no middle: the land across it under the line from edge to edge — a
  // hairpin's other leg came into the height across it, the land through the road's middle)
  for (let i = 8; i < SPINE.length - 8; i += 4) {
    if (longBridged(i) || longBridged(i - 6) || longBridged(i + 6)) continue;
    const [x, z] = SPINE[i];
    const a = SPINE[i - 2];
    const b = SPINE[i + 2];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const nz = (b[0] - a[0]) / l;
    const h = ROAD_W / 2;
    const e0 = terrainAt(x - nx * h, z - nz * h);
    const e1 = terrainAt(x + nx * h, z + nz * h);
    for (const k of [-0.5, 0, 0.5]) {
      const over = terrainAt(x + nx * h * k, z + nz * h * k) - (e0 + ((e1 - e0) * (k + 1)) / 2);
      assert.ok(
        over < 0.06,
        `the land ${over.toFixed(2)} m through the road at ${i} (${Math.round(x)},${Math.round(z)})`,
      );
    }
  }
});

test("the lookout's deck: out over the drop towards the lake, walked on, no trees through it", () => {
  const D = LOOKOUT_DECK;
  const at = (u: number) => [D.x + D.dx * u, D.z + D.dz * u] as const;
  // (on the pad where it starts, out over the drop at its end; Silver Lake ahead of it)
  assert.ok(Math.abs(terrainAt(...at(D.a0)) - D.top) < 0.6, `its start on the pad: ${terrainAt(...at(D.a0))}`);
  assert.ok(terrainAt(...at(D.a1)) < D.top - 8, `its end over the drop: ${terrainAt(...at(D.a1))}`);
  assert.ok(D.dx * (LAKE.cx - D.x) + D.dz * (LAKE.cz - D.z) > 0, "towards the lake");
  // (its planks a solid to its top there, and its rails)
  const [ex, ez] = at(D.a1 - 3);
  const solids = groundSolidsIn(Math.floor(ex / CHUNK), Math.floor(ez / CHUNK)).filter(
    (g) => g.what === "lookout_deck",
  );
  assert.ok(
    solids.some((g) => g.s.t === "box" && Math.abs(g.s.y + g.s.hy - D.top) < 0.01),
    `its planks: ${solids.length} solids`,
  );
  // (no tree under it)
  for (let u = D.a0; u <= D.a1; u += 2) assert.equal(G.treeDensity(...at(u)), 0, `a tree under it at ${u} m`);
});
