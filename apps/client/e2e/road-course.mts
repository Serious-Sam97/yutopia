// Phase 0 of docs/plan/69-the-long-road.md: the long road's course as the plan has it (L3, L4,
// L5, L7), worked out here for the mocks — no game code. The road's spine (hand-placed points,
// hairpins on the climb), its designed profile, the land eased round it (the valley follows the
// road, the mountains stand off it), the creek and its gorge, the lake's basin, and where the
// forest grows. Inside today's Grounds the land is the game's (`terrainAt`); past them, this.
import { fbm, landBounds, terrainAt } from "@yutopia/shared/grounds";

// (the land's box: shared land.ts — docs/plan/69)
const GROUNDS = landBounds();

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ROAD_W = 9;

// ── the spine: [x, z, altitude?] (x east, z south; north is −z). An altitude marks a point the
// profile passes through; between them it's eased by length. ──
type P = [number, number, number?];
/** a hairpin: a half turn of radius r from (x, z) heading `dir` (+1 east, −1 west), climbing north */
function hairpin(x: number, z: number, dir: number, r: number): P[] {
  const out: P[] = [];
  for (let k = 1; k <= 5; k++) {
    const a = (k / 6) * Math.PI;
    out.push([x + dir * Math.sin(a) * r, z - r + Math.cos(a) * r]);
  }
  return out;
}
const LEG_W0 = 6560;
const LEG_E0 = 7060;
function climb(): P[] {
  const out: P[] = [];
  let z = -840;
  let alt = 160;
  for (let leg = 0; leg < 7; leg++) {
    const east = leg % 2 === 0;
    const xa = east ? LEG_W0 + leg * 12 : LEG_E0 + leg * 8;
    const xb = east ? LEG_E0 + leg * 8 : LEG_W0 + leg * 12;
    out.push([xa, z, alt]);
    out.push([(xa + xb) / 2, z - 36]);
    z -= 70;
    alt += 37;
    out.push([xb, z, alt]);
    out.push(...hairpin(xb, z, east ? 1 : -1, 20));
    z -= 40;
    alt += 2;
  }
  return out;
}
export const CTRL: P[] = [
  // the edge of town: Main Street's end, past where the barricade stood, between the fields
  [536, -405, 1.77],
  [760, -405],
  [1050, -398],
  [1350, -412],
  [1650, -430],
  [2050, -398, 10],
  // the Long Wood: gentle bends, the creek beside it on the north, a timber bridge over it
  [2400, -340],
  [2620, -270],
  [2820, -300],
  [2960, -350, 24],
  [3150, -420],
  [3380, -400],
  [3600, -470],
  [3820, -520],
  [4150, -436, 52], // the rest stop (south side)
  [4380, -400],
  [4600, -480],
  [4850, -540, 70],
  // the gorge: along its south rim, the creek far under on the north
  [5200, -600],
  [5550, -612, 104],
  [5900, -585],
  [6200, -625, 142],
  [6330, -680],
  // the high bridge, over the gorge
  [6420, -760, 158],
  [6530, -820],
  // the climb: seven legs and their hairpins up the mountain's south face
  ...climb(),
  // to the pass
  [7240, -1540],
  [7450, -1660],
  [7700, -1760, 458],
  [7880, -1800, 462], // the pass
  // down to the lake, and along its south shore to the lookout on the bluff at its east end
  [8120, -1880],
  [8380, -1960],
  [8620, -2020, 412],
  [8900, -2030],
  [9250, -1990, 407],
  [9620, -2010],
  [9980, -2060, 410],
  [10200, -2170],
  [10290, -2300, 422], // the lookout
];

// Catmull-Rom through the points, one sample every metre
function dense(pts: P[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const l = pts[pts.length - 1];
  out.push([l[0], l[1]]);
  // (even spacing: a metre)
  const even: [number, number][] = [out[0]];
  let acc = 0;
  for (let i = 1; i < out.length; i++) {
    const d = Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
    acc += d;
    if (acc >= 1) {
      even.push(out[i]);
      acc = 0;
    }
  }
  return even;
}
export const SPINE = dense(CTRL);
export const N = SPINE.length;
/** the length along the road at each sample (m) */
export const S: number[] = [0];
for (let i = 1; i < N; i++) S.push(S[i - 1] + Math.hypot(SPINE[i][0] - SPINE[i - 1][0], SPINE[i][1] - SPINE[i - 1][1]));
export const LENGTH = S[N - 1];

// the profile: through the marked points, by length, then eased (a moving mean over 120 m)
export const ALT: number[] = (() => {
  // (each marked point's sample: the nearest)
  const marks: [number, number][] = [];
  for (const p of CTRL) {
    if (p[2] === undefined) continue;
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(SPINE[i][0] - p[0], SPINE[i][1] - p[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    marks.push([S[best], p[2]]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const raw = S.map((s) => {
    if (s <= marks[0][0]) return marks[0][1];
    for (let k = 0; k < marks.length - 1; k++)
      if (s <= marks[k + 1][0])
        return lerp(marks[k][1], marks[k + 1][1], (s - marks[k][0]) / (marks[k + 1][0] - marks[k][0]));
    return marks[marks.length - 1][1];
  });
  const W = 25;
  const pre = [0];
  for (const v of raw) pre.push(pre[pre.length - 1] + v);
  return raw.map((_, i) => {
    const a = Math.max(0, i - W);
    const b = Math.min(N - 1, i + W);
    // (the ends held: town's end meets Main Street, the lookout its pad)
    const k = Math.min(1, Math.min(i, N - 1 - i) / W);
    return lerp(raw[i], (pre[b + 1] - pre[a]) / (b - a + 1), k);
  });
})();
/** the grade at each sample (rise a metre, over ±15 m) */
export const GRADE: number[] = ALT.map((_, i) => {
  const a = Math.max(0, i - 15);
  const b = Math.min(N - 1, i + 15);
  return (ALT[b] - ALT[a]) / Math.max(1, S[b] - S[a]);
});
/** how sharply it turns at each sample (1/m, over ±12 m): the hairpins ~0.05 */
export const BEND: number[] = SPINE.map((_, i) => {
  const a = SPINE[Math.max(0, i - 12)];
  const b = SPINE[i];
  const c = SPINE[Math.min(N - 1, i + 12)];
  const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = h2 - h1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) / 24;
});

// ── the places along it ──
export const at = (km: number) => {
  let i = 0;
  while (i < N - 1 && S[i] < km * 1000) i++;
  return i;
};
const nearestSample = (x: number, z: number) => {
  let best = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < N; i += 2) {
    const d = (SPINE[i][0] - x) ** 2 + (SPINE[i][1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
};
export const REST = nearestSample(4150, -436);
// the last leg's middle: the view back down the valley
export const PULLOUT = nearestSample((LEG_W0 + LEG_E0) / 2 + 40, -840 - 6 * 110 - 36);
export const PASS = nearestSample(7880, -1800);
export const LOOKOUT = N - 1;
/** a pad beside the road (its sample, which side: +1 its right looking along it, the size) */
export const PADS = [
  { name: "rest stop", i: REST, side: 1, r: 34 },
  { name: "pull-out", i: PULLOUT, side: -1, r: 16 },
  { name: "lookout", i: LOOKOUT, side: 0, r: 30 },
];
export function padAt(p: (typeof PADS)[number]): [number, number] {
  const [x, z] = SPINE[p.i];
  if (!p.side) return [x, z];
  const n = SPINE[Math.min(N - 1, p.i + 1)];
  const b = SPINE[Math.max(0, p.i - 1)];
  const l = Math.hypot(n[0] - b[0], n[1] - b[1]) || 1;
  // (its right looking along: −z's normal)
  const rx = -(n[1] - b[1]) / l;
  const rz = (n[0] - b[0]) / l;
  return [x - rx * p.side * (p.r + 6), z - rz * p.side * (p.r + 6)];
}

// ── the lake ──
export const LAKE = { cx: 9520, cz: -2330, rx: 640, rz: 250, level: 401, tilt: 0.08 };
export function lakeR(x: number, z: number): number {
  const dx = x - LAKE.cx;
  const dz = z - LAKE.cz;
  const c = Math.cos(LAKE.tilt);
  const s = Math.sin(LAKE.tilt);
  const u = dx * c + dz * s;
  const v = -dx * s + dz * c;
  // (a wobbly shore)
  const w = 1 + 0.07 * fbm(x / 140, z / 140, 3, 691);
  return Math.hypot(u / LAKE.rx, v / LAKE.rz) / w;
}

// ── a spatial index of the spine (32 m buckets, every sample) ──
const B = 32;
const buckets = new Map<number, number[]>();
const bk = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
for (let i = 0; i < N; i++) {
  const k = bk(Math.floor(SPINE[i][0] / B), Math.floor(SPINE[i][1] / B));
  let l = buckets.get(k);
  if (!l) {
    l = [];
    buckets.set(k, l);
  }
  l.push(i);
}
/** the nearest spine sample within r (its index and distance), or null */
export function nearRoad(x: number, z: number, r = 64): { i: number; d: number } | null {
  const R = Math.ceil(r / B);
  const ci = Math.floor(x / B);
  const cj = Math.floor(z / B);
  let best = -1;
  let bd = r * r;
  for (let j = cj - R; j <= cj + R; j++)
    for (let i = ci - R; i <= ci + R; i++) {
      const l = buckets.get(bk(i, j));
      if (!l) continue;
      for (const s of l) {
        const d = (SPINE[s][0] - x) ** 2 + (SPINE[s][1] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
    }
  return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
}
// a coarser one for the valley's blend (every 16th sample, 256 m buckets)
const VB = 256;
const vb = new Map<number, number[]>();
for (let i = 0; i < N; i += 16) {
  const k = bk(Math.floor(SPINE[i][0] / VB), Math.floor(SPINE[i][1] / VB));
  let l = vb.get(k);
  if (!l) {
    l = [];
    vb.set(k, l);
  }
  l.push(i);
}
// the road's altitude by x alone (far from it: the land's general height there)
const BY_X = (() => {
  const out = new Float32Array(1200);
  const n = new Float32Array(1200);
  for (let i = 0; i < N; i++) {
    const k = Math.max(0, Math.min(1199, Math.floor((SPINE[i][0] + 1000) / 10)));
    out[k] += ALT[i];
    n[k]++;
  }
  let last = ALT[0];
  for (let k = 0; k < 1200; k++) {
    if (n[k]) last = out[k] / n[k];
    out[k] = last;
  }
  // (eased over ±600 m: the climb's legs all share their x, the pass's approach doesn't)
  const pre = [0];
  for (let k = 0; k < 1200; k++) pre.push(pre[k] + out[k]);
  return out.map((_, k) => {
    const a = Math.max(0, k - 60);
    const b = Math.min(1199, k + 60);
    return (pre[b + 1] - pre[a]) / (b - a + 1);
  });
})();
// (far from it: a gentle rise east, from the fields to the lake's height — not the road's own, whose
// climb's legs all share a few hundred metres of x)
const altByX = (x: number) => 4 + 420 * smooth(1800, 9200, x) + 0 * BY_X[0];

/** the valley: the road's profile spread over the land round it (a blend of the samples near) */
function valley(x: number, z: number): number {
  const R = 3;
  const ci = Math.floor(x / VB);
  const cj = Math.floor(z / VB);
  const far = 700;
  let ws = 1 / (far * far + 400) ** 2;
  let sum = altByX(x) * ws;
  for (let j = cj - R; j <= cj + R; j++)
    for (let i = ci - R; i <= ci + R; i++) {
      const l = vb.get(bk(i, j));
      if (!l) continue;
      for (const s of l) {
        const d2 = (SPINE[s][0] - x) ** 2 + (SPINE[s][1] - z) ** 2;
        if (d2 > 760 * 760) continue;
        // (tapered to nothing by 760 m: no edge where the buckets end)
        const w = (1 - smooth(480, 760, Math.sqrt(d2))) / (d2 + 400) ** 2;
        ws += w;
        sum += ALT[s] * w;
      }
    }
  return sum / ws;
}

// ── the mountains: a ridged field, east of the wood, and a few peaks placed by hand ──
const PEAKS: [number, number, number, number][] = [
  // x, z, over the valley, radius
  [7620, -2200, 470, 420], // the pass's south peak
  [8060, -1420, 440, 480], // the pass's north peak
  [7700, -1180, 380, 420], // over the climb
  [9200, -2850, 520, 520], // the lake's ring
  [10800, -2350, 500, 560],
  [9800, -1600, 420, 480],
  [8900, -1750, 330, 380],
  [10600, -2900, 460, 600],
  [6900, -300, 260, 520], // the creek's source
  [8200, -600, 320, 600],
  [9400, -900, 380, 620],
];
const ridged = (x: number, z: number) => {
  let sum = 0;
  let a = 1;
  let f = 1 / 1700;
  let norm = 0;
  for (let o = 0; o < 6; o++) {
    const n = 1 - Math.abs(fbm(x * f, z * f, 1, 3001 + o * 7));
    sum += a * n * n;
    norm += a;
    a *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
};
// how far a spot is from everything walkable: the road (every 100 m of it) and today's Grounds
const COARSE = SPINE.filter((_, i) => i % 100 === 0);
function bandDist(x: number, z: number): number {
  let d = Math.max(GROUNDS.x0 - x, x - GROUNDS.x1, GROUNDS.z0 - z, z - GROUNDS.z1, 0);
  for (const [sx, sz] of COARSE) d = Math.min(d, Math.hypot(x - sx, z - sz));
  return d;
}
/** what stands off the road: hills by the wood, mountains east of it (m over the valley) */
function relief(x: number, z: number, d: number): number {
  const east = smooth(4200, 6800, x);
  // (the band's own hills; off it, rolling ones growing bigger, the forest's country)
  const off = bandDist(x, z);
  const hills =
    (42 + 120 * smooth(400, 2600, off)) * (0.5 + 0.5 * fbm(x / 620, z / 620, 4, 77)) + 6 * fbm(x / 90, z / 90, 3, 78);
  let peaks = 0;
  for (const [px, pz, h, r] of PEAKS) {
    const q = ((x - px) ** 2 + (z - pz) ** 2) / (r * r);
    if (q < 9) peaks += h * Math.exp(-q);
  }
  const mtn = 240 * ridged(x, z) ** 1.5 + peaks;
  // (the far ranges: far off everything, round it all — the horizon's mountains, real land)
  const ranges = smooth(1800, 7000, off) * (180 + 820 * ridged(x * 0.8 + 9000, z * 0.8) ** 1.3);
  const far = lerp(hills, mtn, east) + ranges;
  // (near the road: nothing; standing off it over a few hundred metres)
  const k = smooth(18, 420, d) ** 1.3;
  // (the climb's face between the legs: kept a slope, not bumps)
  return far * k;
}

/** far off the road the land falls away into valleys of its own (not one plateau at the road's height) */
function lowlands(x: number, z: number, d: number): number {
  const k = smooth(260, 1100, d) * smooth(2500, 5000, x);
  return k * 260 * (0.5 + 0.5 * fbm(x / 1100, z / 1100, 4, 4040));
}

// ── the creek: from the mountains south of the climb, west down the gorge, under the high bridge,
// along the wood's north, under the timber bridge, away south over the fields ──
const CREEK_PTS: P[] = [
  [7350, -300],
  [7000, -420],
  [6700, -540],
  [6460, -680],
  [6380, -735], // under the high bridge
  [6200, -770],
  [5900, -780],
  [5600, -740],
  [5250, -700],
  [4950, -640],
  [4650, -590],
  [4300, -550],
  [3950, -545],
  [3600, -520],
  [3300, -470],
  [3080, -380], // under the timber bridge
  [2900, -250],
  [2650, -130],
  [2400, 60],
  [2250, 320],
  [2150, 640],
];
export const CREEK = dense(CREEK_PTS);
const CN = CREEK.length;
const cb = new Map<number, number[]>();
for (let i = 0; i < CN; i += 2) {
  const k = bk(Math.floor(CREEK[i][0] / B), Math.floor(CREEK[i][1] / B));
  let l = cb.get(k);
  if (!l) {
    l = [];
    cb.set(k, l);
  }
  l.push(i);
}
function nearCreek(x: number, z: number, r = 80): { i: number; d: number } | null {
  const R = Math.ceil(r / B);
  const ci = Math.floor(x / B);
  const cj = Math.floor(z / B);
  let best = -1;
  let bd = r * r;
  for (let j = cj - R; j <= cj + R; j++)
    for (let i = ci - R; i <= ci + R; i++) {
      const l = cb.get(bk(i, j));
      if (!l) continue;
      for (const s of l) {
        const d = (CREEK[s][0] - x) ** 2 + (CREEK[s][1] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
    }
  return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
}
const creekAlong = (() => {
  const a = [0];
  for (let i = 1; i < CN; i++)
    a.push(a[i - 1] + Math.hypot(CREEK[i][0] - CREEK[i - 1][0], CREEK[i][1] - CREEK[i - 1][1]));
  return a;
})();
const BRIDGE_C = (() => {
  let best = 0;
  for (let i = 0; i < CN; i++)
    if (Math.hypot(CREEK[i][0] - 6380, CREEK[i][1] + 735) < Math.hypot(CREEK[best][0] - 6380, CREEK[best][1] + 735))
      best = i;
  return creekAlong[best];
})();
/** the gorge: how deep under the land the creek runs, and its half-width, along it */
function creekCut(s: number): { depth: number; half: number } {
  const g = smooth(BRIDGE_C - 2600, BRIDGE_C - 1600, s) * (1 - smooth(BRIDGE_C + 250, BRIDGE_C + 900, s));
  return { depth: lerp(2.2, 46, g), half: lerp(9, 58, g) };
}
/** the creek's bed at each sample: under the land by its cut, never rising downstream */
export const CREEK_BED: number[] = (() => {
  const raw = CREEK.map(([x, z], i) => valley(x, z) + 0.4 * relief(x, z, 60) - creekCut(creekAlong[i]).depth);
  for (let i = 1; i < CN; i++) raw[i] = Math.min(raw[i], raw[i - 1] - 0.002);
  return raw;
})();
export const creekWater = (i: number) => CREEK_BED[i] + 0.5;

// ── the land ──
/** the road's altitude where it is, its distance off the spine, and whether it's bridged there */
const BRIDGE_FILL = 9;
/** the land past today's Grounds (and how the two meet), carved and eased to the road */
export function landAt(x: number, z: number): number {
  const out = Math.max(GROUNDS.x0 - x, x - GROUNDS.x1, GROUNDS.z0 - z, z - GROUNDS.z1, 0);
  // inside today's Grounds, west of the barricade: the game's own
  if (out === 0 && x < GROUNDS.x1 - 12) return terrainAt(x, z);
  const road = nearRoad(x, z, 420);
  const d = road?.d ?? 420;
  let h = valley(x, z) + relief(x, z, d) - lowlands(x, z, d);
  // (round today's Grounds: from their edge's height out to the field's, over 160 m)
  if (x < GROUNDS.x1 + 60 || out < 160) {
    const ex = Math.max(GROUNDS.x0, Math.min(GROUNDS.x1, x));
    const ez = Math.max(GROUNDS.z0, Math.min(GROUNDS.z1, z));
    const edge = terrainAt(ex, ez) + (out > 0 ? 18 * smooth(0, 160, out) : 0);
    const k = road && road.d < 60 && x > GROUNDS.x1 - 12 ? 1 : smooth(0, 160, out);
    h = lerp(edge, h, k);
  }
  // the creek and its gorge
  const c = nearCreek(x, z, 90);
  if (c) {
    const { half } = creekCut(creekAlong[c.i]);
    if (c.d < half + 8) {
      const bed = CREEK_BED[c.i];
      const t = Math.min(1, c.d / half);
      const wall = bed + (Math.max(h, bed) - bed) * smooth(0.12, 1, t) ** 0.85;
      h = Math.min(h, wall);
    }
  }
  // the lake's basin
  const r = lakeR(x, z);
  if (r < 1.7) {
    const bowl = r < 1 ? LAKE.level - 1.2 - 24 * (1 - r * r) ** 0.7 : LAKE.level - 1.2 + 70 * smooth(1, 1.7, r) ** 1.6;
    h = Math.min(h, bowl);
  }
  // the road: the land eased to it (cut, and fill where it's not a bridge)
  if (road && road.d < 40) {
    const a = ALT[road.i];
    const k = 1 - smooth(ROAD_W / 2 + 1.2, ROAD_W / 2 + 16 + Math.abs(h - a) * 0.6, road.d);
    if (h > a || a - h < BRIDGE_FILL) h = lerp(h, a - 0.06, k);
  }
  // the pads
  for (const p of PADS) {
    const [px, pz] = padAt(p);
    const dd = Math.hypot(x - px, z - pz);
    if (dd < p.r + 20) h = lerp(h, ALT[p.i] - 0.06, 1 - smooth(p.r, p.r + 20, dd));
  }
  return h;
}
/** the road's deck where the land's far under it (the bridges) */
export function bridged(i: number): boolean {
  const [x, z] = SPINE[i];
  const c = nearCreek(x, z, 80);
  if (c && c.d < creekCut(creekAlong[c.i]).half + 1.5) return true;
  return landBare(x, z) < ALT[i] - BRIDGE_FILL + 0.5;
}
// the land without the road's fill (what a bridge stands over)
function landBare(x: number, z: number): number {
  const road = nearRoad(x, z, 420);
  const d = road?.d ?? 420;
  let h = valley(x, z) + relief(x, z, d) - lowlands(x, z, d);
  const c = nearCreek(x, z, 90);
  if (c) {
    const { half } = creekCut(creekAlong[c.i]);
    if (c.d < half + 8) {
      const bed = CREEK_BED[c.i];
      const t = Math.min(1, c.d / half);
      h = Math.min(h, bed + (Math.max(h, bed) - bed) * smooth(0.12, 1, t) ** 0.85);
    }
  }
  return h;
}

// ── the forest: how dense, by where along the road and how high ──
export const TREELINE = 420;
export function forest(x: number, z: number, h: number, slope: number): number {
  if (x < GROUNDS.x1 - 12 && z > GROUNDS.z0 && z < GROUNDS.z1 && x > GROUNDS.x0) return 0; // (the game's own)
  const road = nearRoad(x, z, 420);
  if (road && road.d < ROAD_W / 2 + 4) return 0;
  const km = road ? S[road.i] / 1000 : 9;
  // fields by town along the road (420 m either side), the wilderness's forest everywhere else
  let f = lerp(0.05, 0.9, smooth(1.2, 1.9, km));
  if (road && km < 1.9) f = lerp(f, 0.86, smooth(260, 420, road.d));
  // (hedgerows across the fields)
  if (km < 1.6 && road && road.d < 300) f = Math.max(f, 0.5 * (1 - smooth(0, 6, Math.abs(((x + 60) % 260) - 130))));
  // (round today's Grounds: their woods go on)
  if (!road) f = 0.86;
  // by height: the treeline, scattered firs over it, none past 450
  const line = TREELINE + 90 * fbm(x / 420, z / 420, 4, 818);
  f *= 1 - smooth(line - 110, line, h) * 0.9;
  if (h > line + 60) f = 0;
  // clearings, the rest stop's, the pads'
  const cl = fbm(x / 240, z / 240, 3, 515);
  // (clearings: by the road now and then, rarer out in the wilderness)
  if (cl > (road && road.d < 300 ? 0.36 : 0.5)) f *= 0.08;
  for (const p of PADS) {
    const [px, pz] = padAt(p);
    const dd = Math.hypot(x - px, z - pz);
    if (dd < p.r + 8) return 0;
    // (the pull-out's view: cut down the slope towards the town)
    if (p.name === "pull-out" && dd < 220) {
      const vx = 1200 - px;
      const vz = -420 - pz;
      const vl = Math.hypot(vx, vz);
      if (((x - px) * vx + (z - pz) * vz) / (dd * vl) > 0.82) return 0;
    }
  }
  // the lake, the creek's water, steep rock
  if (lakeR(x, z) < 1.03) return 0;
  const c = nearCreek(x, z, 70);
  // (the creek's water, and the gorge's floor: stones, no trees)
  if (c && c.d < Math.max(4, creekCut(creekAlong[c.i]).half * 0.55)) return 0;
  if (slope > 0.85) f *= 0.15;
  // the wood's edge along the road: a little thinner
  if (road && road.d < 14) f *= 0.6;
  return Math.max(0, Math.min(0.95, f));
}
/** what a spot's ground is (as the game's surfaces) */
export function surfaceAt(x: number, z: number, h: number, slope: number, dens: number): string {
  const road = nearRoad(x, z, 12);
  if (road && road.d < ROAD_W / 2) return "asphalt";
  if (slope > 0.85 || (h > 620 && slope > 0.55)) return "rock";
  if (lakeR(x, z) < 1) return "ice";
  return dens > 0.45 ? "deep" : "snow";
}
export const cellRng = (i: number, j: number, s: number) => {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** the highest land within r of (x, z), on a 10 m grid */
export function summit(x: number, z: number, r: number): [number, number, number] {
  let best: [number, number, number] = [x, landAt(x, z), z];
  for (let j = -r; j <= r; j += 10)
    for (let i = -r; i <= r; i += 10) {
      const h = landAt(x + i, z + j);
      if (h > best[1]) best = [x + i, h, z + j];
    }
  return best;
}
