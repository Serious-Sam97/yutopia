// The long road (docs/plan/69-the-long-road.md, L3–L5, L7): Long Pine Road, 13.8 km east from
// where Main Street's barricade stood — out past the fields, through the Long Wood, along the
// gorge's rim and over the high bridge, up seven legs and six hairpins to Hawk Pass (461 m), down to
// Silver Lake (401 m) and along its south shore to the lookout. Its spine and profile designed by
// hand (phase 0's course: apps/client/e2e/road-course.mts), and the land shaped round it: the valley
// follows the road, the mountains stand off it, the creek's gorge carved, the lake's basin dug, the
// forest by height. Everything here is the land past today's Grounds; grounds.ts blends it in (its
// `macro`) and lays the road (a way, its heights this profile).
// Building coords (metres; x east, z south). Kept free of grounds.ts: it reads this.
import { BASE_LAND, type Region } from "./land.ts";

export type P = [number, number, number?];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// (the Grounds' noise, the same numbers: grounds.ts fbm — its own copy, so this module needs nothing
// of that one)
function hash2(x: number, z: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, s: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s);
  const b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s);
  const d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number, oct: number, s: number): number {
  let sum = 0;
  let norm = 0;
  let a = 1;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += a * (vnoise(x * f, z * f, s + i * 17) * 2 - 1);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** The long road is on (the game's since docs/plan/69's phase 3). */
export const LONG_ROAD = true;
/** Its name, the lake's, the pass's (the user's set 1, 2026-11-03). */
export const NAMES = { road: "Long Pine Road", lake: "Silver Lake", pass: "Hawk Pass" } as const;
export const ROAD_W = 9;

// ── the spine: [x, z, altitude?] (x east, z south; north is −z). An altitude marks a point the
// profile passes through; between them it's eased by length. ──
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
    // (a leg west starts 6 m on past the hairpin's end, as a leg east does 12: it started 8 m behind
    // it, the road turned back on itself in a 3.6 m step — a kink, its ribbon torn there)
    const xa = east ? LEG_W0 + leg * 12 : LEG_E0 + (leg - 1) * 8 - 6;
    const xb = east ? LEG_E0 + leg * 8 : LEG_W0 + leg * 12;
    out.push([xa, z, alt]);
    out.push([(xa + xb) / 2, z - 36]);
    z -= 70;
    alt += 36.5;
    out.push([xb, z, alt]);
    // (a hairpin up to the next leg — none after the last: it runs on east to the pass)
    if (leg === 6) break;
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

// Catmull-Rom through the points, one sample every metre — centripetal (its knots by the square root
// of each stretch's length): the uniform kind, from a 250 m leg into a hairpin's 10 m steps, overshot
// and came back on itself, the road a loop at each hairpin's ends
function dense(pts: P[]): [number, number][] {
  const out: [number, number][] = [];
  const end = pts.length - 1;
  // (past the ends: carried on straight)
  const at = (i: number): [number, number] =>
    i < 0
      ? [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]]
      : i > end
        ? [2 * pts[end][0] - pts[end - 1][0], 2 * pts[end][1] - pts[end - 1][1]]
        : [pts[i][0], pts[i][1]];
  for (let i = 0; i < end; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const knot = (a: [number, number], b: [number, number]) =>
      Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
    const mix = (a: [number, number], b: [number, number], ta: number, tb: number, t: number): [number, number] => {
      const k = (t - ta) / (tb - ta);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const a1 = mix(p0, p1, t0, t1, t);
      const a2 = mix(p1, p2, t1, t2, t);
      const a3 = mix(p2, p3, t2, t3, t);
      const b1 = mix(a1, a2, t0, t2, t);
      const b2 = mix(a2, a3, t1, t3, t);
      out.push(mix(b1, b2, t1, t2, t));
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
// the last leg's middle: the view back down the valley (its pad out on the valley side)
export const PULLOUT = nearestSample((LEG_W0 + LEG_E0) / 2 + 40, -840 - 6 * 110 - 36);
export const PASS = nearestSample(7880, -1800);
export const LOOKOUT = N - 1;
/** a pad beside the road (its sample, which side: +1 its right looking along it, the size) */
export const PADS = [
  { name: "rest stop", i: REST, side: 1, r: 34, fall: 20 },
  { name: "pull-out", i: PULLOUT, side: -1, r: 16, fall: 20 },
  // (the lookout's down over 35 m: over 20 it stood on a drum of rock, steep all round, a dark face
  // that read as a pond from the side)
  { name: "lookout", i: LOOKOUT, side: 0, r: 30, fall: 35 },
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
/** The lookout's deck (L7): from its pad, flat 30 m round, out over the drop past its edge towards
 *  the lake — `a0`…`a1` m out along (dx, dz), `half` either side, its planks' top. (On the pad, all
 *  of it, it lay on the ground in the middle of the bluff, a small bridge to nowhere.) */
export const LOOKOUT_DECK = (() => {
  const [x, z] = SPINE[N - 1];
  const l = Math.hypot(LAKE.cx - x, LAKE.cz - z) || 1;
  return { x, z, dx: (LAKE.cx - x) / l, dz: (LAKE.cz - z) / l, a0: 26, a1: 48, half: 4, top: ALT[N - 1] + 0.2 };
})();
/** Whether (x, z) is under the lookout's deck, or within `pad` of it. */
export function underDeck(x: number, z: number, pad = 0): boolean {
  const D = LOOKOUT_DECK;
  const a = (x - D.x) * D.dx + (z - D.z) * D.dz;
  const b = -(x - D.x) * D.dz + (z - D.z) * D.dx;
  return a > D.a0 - pad && a < D.a1 + pad && Math.abs(b) < D.half + pad;
}
export function lakeR(x: number, z: number): number {
  const dx = x - LAKE.cx;
  const dz = z - LAKE.cz;
  const c = Math.cos(LAKE.tilt);
  const s = Math.sin(LAKE.tilt);
  const u = dx * c + dz * s;
  const v = -dx * s + dz * c;
  const r = Math.hypot(u / LAKE.rx, v / LAKE.rz);
  // (far off, as it is: its wobble's 7 % either way, and nothing asks past 1.7 — the noise was
  // worked out for all the land, the town's too, a second of the loading)
  if (r > 1.9) return r;
  // (a wobbly shore)
  return r / (1 + 0.07 * fbm(x / 140, z / 140, 3, 691));
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
// far from the road: a gentle rise east, from the fields to the lake's height
const altByX = (x: number) => 4 + 420 * smooth(1800, 9200, x);

/** the valley: the road's profile spread over the land round it (a blend of the samples near) */
function valleyExact(x: number, z: number): number {
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
// today's Grounds' box (land.ts BASE_LAND's): the land past it is this module's
const TOWN = BASE_LAND.reduce(
  (b, r) => ({
    x0: Math.min(b.x0, r.drawn.x0),
    z0: Math.min(b.z0, r.drawn.z0),
    x1: Math.max(b.x1, r.drawn.x1),
    z1: Math.max(b.z1, r.drawn.z1),
  }),
  { x0: Number.POSITIVE_INFINITY, z0: Number.POSITIVE_INFINITY, x1: -Infinity, z1: -Infinity },
);
/** How far (x, z) is out of today's Grounds (0 in them). */
export function outOfTown(x: number, z: number): number {
  return Math.max(TOWN.x0 - x, x - TOWN.x1, TOWN.z0 - z, z - TOWN.z1, 0);
}
// how far a spot is from everything walkable: the road (every 100 m of it) and today's Grounds
const COARSE = SPINE.filter((_, i) => i % 100 === 0);
function bandDistExact(x: number, z: number): number {
  let d = outOfTown(x, z);
  for (const [sx, sz] of COARSE) d = Math.min(d, Math.hypot(x - sx, z - sz));
  return d;
}
// the road's distance far off it, coarsely (every 16th sample: within 16 m)
function roadFarExact(x: number, z: number): { d: number; i: number } {
  const R = 3;
  const ci = Math.floor(x / VB);
  const cj = Math.floor(z / VB);
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let j = cj - R; j <= cj + R; j++)
    for (let i = ci - R; i <= ci + R; i++) {
      const l = vb.get(bk(i, j));
      if (!l) continue;
      for (const s of l) {
        const d = (SPINE[s][0] - x) ** 2 + (SPINE[s][1] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
    }
  return best < 0 ? { d: 900, i: -1 } : { d: Math.min(900, Math.sqrt(bd)), i: best };
}

// ── the slow parts, kept on a 16 m grid in 256 m tiles (made as asked, the least lately used go):
// the valley, how far the road is and which of it, how far from everything walkable ──
const G = 16;
const T = 16; // cells a tile a side
const NODES = T + 1;
const fieldTiles = new Map<number, { f: Float32Array; used: number }>();
let fieldTick = 0;
const FIELD_KEEP = 3000;
function fieldTile(ti: number, tj: number): Float32Array {
  const k = bk(ti, tj);
  const hit = fieldTiles.get(k);
  if (hit) {
    hit.used = ++fieldTick;
    return hit.f;
  }
  const f = new Float32Array(NODES * NODES * 5);
  for (let j = 0; j < NODES; j++)
    for (let i = 0; i < NODES; i++) {
      const x = (ti * T + i) * G;
      const z = (tj * T + j) * G;
      const n = (j * NODES + i) * 5;
      const r = roadFarExact(x, z);
      f[n] = valleyExact(x, z);
      f[n + 1] = r.d;
      f[n + 2] = bandDistExact(x, z);
      f[n + 3] = r.i;
      f[n + 4] = creekFarExact(x, z);
    }
  fieldTiles.set(k, { f, used: ++fieldTick });
  if (fieldTiles.size > FIELD_KEEP) {
    const by = [...fieldTiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let q = 0; q < fieldTiles.size - FIELD_KEEP * 0.9; q++) fieldTiles.delete(by[q][0]);
  }
  return f;
}
/** The grid's values at (x, z): the valley, the road's distance (coarse), the band's, and the
 *  nearest node's road sample. */
function field(x: number, z: number): { valley: number; road: number; band: number; i: number; creek: number } {
  const gx = x / G;
  const gz = z / G;
  const ti = Math.floor(gx / T);
  const tj = Math.floor(gz / T);
  const f = fieldTile(ti, tj);
  const u = gx - ti * T;
  const v = gz - tj * T;
  const i = Math.min(T - 1, Math.floor(u));
  const j = Math.min(T - 1, Math.floor(v));
  const fu = u - i;
  const fv = v - j;
  const at = (a: number, b: number, c: number) => f[((j + b) * NODES + (i + a)) * 5 + c];
  const bil = (c: number) =>
    (at(0, 0, c) * (1 - fu) + at(1, 0, c) * fu) * (1 - fv) + (at(0, 1, c) * (1 - fu) + at(1, 1, c) * fu) * fv;
  return {
    valley: bil(0),
    road: bil(1),
    band: bil(2),
    i: at(fu < 0.5 ? 0 : 1, fv < 0.5 ? 0 : 1, 3),
    creek: bil(4),
  };
}
/** How far the road is: exactly near it (searched as far as the grid says, and a little), the grid's
 *  further off, the one eased into the other between 40 and 56 m. */
function roadD(x: number, z: number, grid: number, near: { d: number } | null | undefined): number {
  if (grid >= 56) return grid;
  const n = near === null ? nearRoad(x, z, grid + 24) : near;
  return n ? lerp(n.d, grid, smooth(40, 56, grid)) : grid;
}
/** How far the road is from (x, z) — exactly within 96 m of it, else from the grid — and its sample
 *  (-1 past 900 m). */
export function roadNear(x: number, z: number): { d: number; i: number } {
  const g = field(x, z);
  if (g.road < 110) {
    const n = nearRoad(x, z, Math.min(120, g.road + 24));
    if (n) return n;
  }
  return { d: g.road, i: g.i };
}

// ── the mountains: a ridged field, east of the wood, and a few peaks placed by hand ──
const PEAKS: [number, number, number, number][] = [
  // x, z, over the valley, radius
  [7620, -2200, 470, 420], // the pass's north peak
  [8060, -1420, 440, 480], // the pass's south peak
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
/** what stands off the road: hills by the wood, mountains east of it, the far ranges round it all
 *  (m over the valley) */
function relief(x: number, z: number, d: number, off: number): number {
  const east = smooth(4200, 6800, x);
  // (the band's own hills; off it, rolling ones growing bigger, the forest's country)
  const hills =
    (42 + 120 * smooth(400, 2600, off)) * (0.5 + 0.5 * fbm(x / 620, z / 620, 4, 77)) + 6 * fbm(x / 90, z / 90, 3, 78);
  let peaks = 0;
  for (const [px, pz, h, r] of PEAKS) {
    const q = ((x - px) ** 2 + (z - pz) ** 2) / (r * r);
    if (q < 9) peaks += h * Math.exp(-q);
  }
  const mtn = east > 0 ? 240 * ridged(x, z) ** 1.5 + peaks : 0;
  // (the far ranges: far off everything, round it all — the horizon's mountains, real land)
  const rk = smooth(1800, 7000, off);
  const ranges = rk > 0 ? rk * (180 + 820 * ridged(x * 0.8 + 9000, z * 0.8) ** 1.3) : 0;
  const far = lerp(hills, mtn, east) + ranges;
  // (near the road: nothing; standing off it over a few hundred metres)
  return far * smooth(18, 420, d) ** 1.3;
}
/** far off the road the land falls away into valleys of its own (not one plateau at the road's height) */
function lowlands(x: number, z: number, d: number): number {
  const k = smooth(260, 1100, d) * smooth(2500, 5000, x);
  return k > 0 ? k * 260 * (0.5 + 0.5 * fbm(x / 1100, z / 1100, 4, 4040)) : 0;
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
export function nearCreek(x: number, z: number, r = 80): { i: number; d: number } | null {
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
export function creekCut(i: number): { depth: number; half: number } {
  const s = creekAlong[i];
  const g = smooth(BRIDGE_C - 2600, BRIDGE_C - 1600, s) * (1 - smooth(BRIDGE_C + 250, BRIDGE_C + 900, s));
  return { depth: lerp(2.2, 46, g), half: lerp(9, 58, g) };
}
// the land with no creek, lake, road or pads (what's under all of them)
function wild(x: number, z: number): number {
  const g = field(x, z);
  // (out to 420 m, as phase 0's course had it: past that, as far as the land's concerned, far)
  const d = Math.min(420, roadD(x, z, g.road, null));
  return g.valley + relief(x, z, d, g.band) - lowlands(x, z, d);
}
/** the creek's bed at each sample: under the land by its cut, never rising downstream (made once) */
let bedOf: Float32Array | null = null;
export function creekBed(i: number): number {
  if (!bedOf) {
    const raw = new Float32Array(CN);
    for (let k = 0; k < CN; k++) {
      const [x, z] = CREEK[k];
      const g = field(x, z);
      raw[k] = g.valley + 0.4 * relief(x, z, 60, g.band) - creekCut(k).depth;
    }
    for (let k = 1; k < CN; k++) raw[k] = Math.min(raw[k], raw[k - 1] - 0.002);
    bedOf = raw;
  }
  return bedOf[i];
}
/** The creek's water at a sample (half a metre over its bed). */
export const creekWater = (i: number) => creekBed(i) + 0.5;
// (the creek's box: past it, no need to look)
const CREEK_BOX = CREEK.reduce(
  (b, [x, z]) => ({ x0: Math.min(b.x0, x), z0: Math.min(b.z0, z), x1: Math.max(b.x1, x), z1: Math.max(b.z1, z) }),
  { x0: Number.POSITIVE_INFINITY, z0: Number.POSITIVE_INFINITY, x1: -Infinity, z1: -Infinity },
);
/** The creek near (x, z) within r, or null. */
export function creekNear(x: number, z: number, r = 90): { i: number; d: number } | null {
  if (x < CREEK_BOX.x0 - r || x > CREEK_BOX.x1 + r || z < CREEK_BOX.z0 - r || z > CREEK_BOX.z1 + r) return null;
  // (the grid says how far it is, within 16 m: searched only as far as that)
  const far = field(x, z).creek;
  if (far > r + 24) return null;
  return nearCreek(x, z, Math.min(r, far + 24));
}
// the creek's distance far off it, coarsely (every 16th sample, 256 m buckets; 900 past them)
const cvb = new Map<number, number[]>();
for (let i = 0; i < CN; i += 16) {
  const k = bk(Math.floor(CREEK[i][0] / VB), Math.floor(CREEK[i][1] / VB));
  let l = cvb.get(k);
  if (!l) {
    l = [];
    cvb.set(k, l);
  }
  l.push(i);
}
function creekFarExact(x: number, z: number): number {
  const ci = Math.floor(x / VB);
  const cj = Math.floor(z / VB);
  let bd = 900 * 900;
  for (let j = cj - 1; j <= cj + 1; j++)
    for (let i = ci - 1; i <= ci + 1; i++)
      for (const s of cvb.get(bk(i, j)) ?? []) bd = Math.min(bd, (CREEK[s][0] - x) ** 2 + (CREEK[s][1] - z) ** 2);
  return Math.sqrt(bd);
}
function carveCreek(x: number, z: number, h: number): number {
  const c = creekNear(x, z, 90);
  if (!c) return h;
  const { half } = creekCut(c.i);
  if (c.d >= half + 8) return h;
  const bed = creekBed(c.i);
  const t = Math.min(1, c.d / half);
  return Math.min(h, bed + (Math.max(h, bed) - bed) * smooth(0.12, 1, t) ** 0.85);
}

// ── the land ──
const BRIDGE_FILL = 9;
/** The long road's land at (x, z): the valley and what stands off it, the creek carved, the lake's
 *  basin dug, eased to the road (cut, and fill where it's no bridge) and to the pads. */
export function longLand(x: number, z: number): number {
  const g = field(x, z);
  const road = g.road < 56 ? nearRoad(x, z, g.road + 24) : null;
  // (out to 420 m, as phase 0's course had it: past that, as far as the land's concerned, far)
  const d = Math.min(420, roadD(x, z, g.road, road));
  let h = g.valley + relief(x, z, d, g.band) - lowlands(x, z, d);
  h = carveCreek(x, z, h);
  // the lake's basin: its bowl under its level; past its shore the mountains round it eased down to it,
  // their own shape kept (held under one bowl to 1.7 and let go there, they stood up out of it in a
  // wall a few hundred metres high; held under a cone, a smooth white cone) — its shore over its level
  const r = lakeR(x, z);
  const L = LAKE.level - 1.2;
  if (r < 1) h = Math.min(h, L - 24 * (1 - r * r) ** 0.7);
  else {
    const rim = L + 9 * smooth(1, 1.25, r);
    if (h > L) h = Math.min(h, Math.max(L + (h - L) * smooth(1, 3.2, r) ** 1.2, rim));
    // (and low land by it up to its rim: a hollow by its shore held its water, a pond of its own)
    if (r < 1.8) h = Math.max(h, rim - 9 * smooth(1.4, 1.8, r));
  }
  // the road: the land eased to it (cut, and fill where it's not a bridge) — to the heights of the
  // road round it, weighted by how near (between a hairpin's two legs, a slope from one to the other,
  // not a step where the nearer changes)
  if (road && road.d < 40) {
    const a = roadTarget(x, z, road);
    const k = 1 - smooth(ROAD_W / 2 + 1.2, ROAD_W / 2 + 16 + Math.abs(h - a) * 0.6, road.d);
    if (h > a || a - h < BRIDGE_FILL) h = lerp(h, a - 0.06, k);
  }
  // the pads
  for (const p of PADS) {
    const [px, pz] = padAt(p);
    const dd = Math.hypot(x - px, z - pz);
    if (dd < p.r + p.fall) h = lerp(h, ALT[p.i] - 0.06, 1 - smooth(p.r, p.r + p.fall, dd));
  }
  return h;
}
// the height the land near the road is eased to: the nearest stretch's, blended with any other
// stretch of it within 40 m (another leg of the climb) by how near each is
function roadTarget(x: number, z: number, near: { i: number; d: number }): number {
  const ci = Math.floor(x / B);
  const cj = Math.floor(z / B);
  // (the nearest sample of each stretch apart from the nearest's own: 60 samples or more away)
  let ws = 0;
  let sum = 0;
  const seen: { i: number; d: number }[] = [near];
  for (let j = cj - 2; j <= cj + 2; j++)
    for (let i = ci - 2; i <= ci + 2; i++)
      for (const q of buckets.get(bk(i, j)) ?? []) {
        if (q % 2) continue;
        const d = Math.hypot(SPINE[q][0] - x, SPINE[q][1] - z);
        if (d > 44) continue;
        const o = seen.find((e) => Math.abs(e.i - q) < 60);
        if (!o) seen.push({ i: q, d });
        else if (d < o.d && o !== near) {
          o.i = q;
          o.d = d;
        }
      }
  // (on the road, its own stretch's alone: the other leg of a hairpin, a few metres higher, came in
  // across it — the land through the asphalt's middle, its ribbon flat from edge to edge)
  const off = smooth(ROAD_W / 2 + 1, ROAD_W / 2 + 10, near.d);
  for (const e of seen) {
    const w = ((1 - smooth(4, 44, e.d)) / (e.d * e.d + 4)) * (e === near ? 1 : off);
    ws += w;
    sum += ALT[e.i] * w;
  }
  return ws > 0 ? sum / ws : ALT[near.i];
}
/** Whether the road's sample i is a bridge (the creek under it, or the land far under it). */
export function longBridged(i: number): boolean {
  const [x, z] = SPINE[i];
  const c = creekNear(x, z, 80);
  if (c && c.d < creekCut(c.i).half + 1.5) return true;
  return carveCreek(x, z, wild(x, z)) < ALT[i] - BRIDGE_FILL + 0.5;
}

// ── the forest: how dense, by where along the road and how high ──
export const TREELINE = 420;
/** How dense the forest is at (x, z) (`h` the land's height there, `slope` its steepness). */
export function longForest(x: number, z: number, h: number, slope: number): number {
  const road = roadNear(x, z);
  if (road.d < ROAD_W / 2 + 4) return 0;
  const near = road.d < 420 && road.i >= 0;
  const km = near ? S[road.i] / 1000 : 9;
  // fields by town along the road (420 m either side), the wilderness's forest everywhere else
  let f = lerp(0.05, 0.9, smooth(1.2, 1.9, km));
  if (near && km < 1.9) f = lerp(f, 0.86, smooth(260, 420, road.d));
  // (hedgerows across the fields)
  if (km < 1.6 && near && road.d < 300)
    f = Math.max(f, 0.5 * (1 - smooth(0, 6, Math.abs(((((x + 60) % 260) + 260) % 260) - 130))));
  if (!near) f = 0.86;
  // by height: the treeline (ragged), scattered firs over it, none past it by 60
  const line = TREELINE + 90 * fbm(x / 420, z / 420, 4, 818);
  f *= 1 - smooth(line - 110, line, h) * 0.9;
  if (h > line + 60) return 0;
  // clearings: by the road now and then, rarer out in the wilderness
  if (fbm(x / 240, z / 240, 3, 515) > (near && road.d < 300 ? 0.36 : 0.5)) f *= 0.08;
  for (const p of PADS) {
    const [px, pz] = padAt(p);
    const dd = Math.hypot(x - px, z - pz);
    if (dd < p.r + 8) return 0;
    if (p.name === "lookout" && underDeck(x, z, 3)) return 0;
    // (the pull-out's view: cut down the slope towards the town)
    if (p.name === "pull-out" && dd < 220) {
      const vx = 1200 - px;
      const vz = -420 - pz;
      const vl = Math.hypot(vx, vz);
      if (((x - px) * vx + (z - pz) * vz) / (dd * vl) > 0.82) return 0;
    }
  }
  // the lake, the creek's water and the gorge's floor (stones), steep rock
  // (none in its water, nor on the shore a metre over it: its water runs out past 1.03)
  if (lakeR(x, z) < 1.25 && h < LAKE.level + 1) return 0;
  if (lakeR(x, z) < 1.03) return 0;
  if (x > 8975 && x < 9150 && z > -2170 && z < -1995 && shoreClear(x, z)) return 0;
  const c = creekNear(x, z, 70);
  if (c && c.d < Math.max(4, creekCut(c.i).half * 0.55)) return 0;
  if (slope > 0.85) f *= 0.15;
  // the wood's edge along the road: a little thinner
  if (road.d < 14) f *= 0.6;
  return Math.max(0, Math.min(0.95, f));
}

// ── its land as regions (land.ts): the band people may reach — a rect round each 600 m of the road,
// 300 m either side — and the lake's basin; drawn 700 m round each ──
export const BAND_HALF = 300;
export const LONG_LAND: readonly Region[] = (() => {
  const out: Region[] = [];
  const STEP = 600;
  let a = 0;
  for (let n = 0; a < N - 1; n++) {
    let b = a;
    while (b < N - 1 && S[b] - S[a] < STEP) b++;
    let x0 = Number.POSITIVE_INFINITY;
    let z0 = Number.POSITIVE_INFINITY;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let i = a; i <= b; i++) {
      x0 = Math.min(x0, SPINE[i][0]);
      z0 = Math.min(z0, SPINE[i][1]);
      x1 = Math.max(x1, SPINE[i][0]);
      z1 = Math.max(z1, SPINE[i][1]);
    }
    const km = S[a] / 1000;
    const biome = km < 1.5 ? "field" : km < 4.9 ? "forest" : km < 6.1 ? "gorge" : km < 11.6 ? "alpine" : "lake";
    // (from the barricade's line: the town's own land west of it)
    out.push({
      key: `long-road:${n}`,
      biome,
      reach: {
        kind: "rect",
        x0: Math.max(528, Math.round(x0 - BAND_HALF)),
        z0: Math.round(z0 - BAND_HALF),
        x1: Math.round(x1 + BAND_HALF),
        z1: Math.round(z1 + BAND_HALF),
      },
      drawn: {
        x0: Math.max(544, Math.round(x0 - 700)),
        z0: Math.round(z0 - 700),
        x1: Math.round(x1 + 700),
        z1: Math.round(z1 + 700),
      },
    });
    a = b;
  }
  out.push({
    key: "silver-lake",
    biome: "lake",
    reach: {
      kind: "rect",
      x0: LAKE.cx - LAKE.rx - 120,
      z0: LAKE.cz - LAKE.rz - 160,
      x1: LAKE.cx + LAKE.rx + 120,
      z1: LAKE.cz + LAKE.rz + 120,
    },
    drawn: {
      x0: LAKE.cx - LAKE.rx - 700,
      z0: LAKE.cz - LAKE.rz - 700,
      x1: LAKE.cx + LAKE.rx + 700,
      z1: LAKE.cz + LAKE.rz + 700,
    },
  });
  return out;
})();

/** The length along the road at sample i (m). */
export const longS = (i: number) => S[i];
/** Its signs: where (a sample), which side, the words and colours. */
export const LONG_SIGNS: { i: number; side: 1 | -1; text: string[]; bg: string; fg: string }[] = [
  { i: at(0.06), side: -1, text: [`${NAMES.lake}  14`, `${NAMES.pass}  11`], bg: "#1f5a3a", fg: "#f4f4ee" },
  { i: Math.max(0, REST - 90), side: 1, text: ["REST AREA", "→"], bg: "#1f5a3a", fg: "#f4f4ee" },
  {
    i: Math.max(0, PASS - 60),
    side: -1,
    text: [NAMES.pass.toUpperCase(), `${Math.round(ALT[PASS])} m`],
    bg: "#6b3a1f",
    fg: "#f6efe2",
  },
  {
    i: Math.max(0, LOOKOUT - 220),
    side: -1,
    text: [NAMES.lake.toUpperCase(), "LOOKOUT"],
    bg: "#6b3a1f",
    fg: "#f6efe2",
  },
];

// ── its places (docs/plan/69, L7): the rest stop's pad, the pull-out's, the lookout's; Silver Lake's
// shore — the jetty and boathouse at its west end, two cabins above it; the bus's stops ──
/** Where the town's bus stop is (Main Street's north kerb, by its end) and the lake's (the lookout's
 *  pad by the road), and the shelters by each. */
export const BUS_STOPS = {
  town: { x: 512, z: -408.6 },
  lake: (() => {
    const i = LOOKOUT - 26;
    return { x: SPINE[i][0], z: SPINE[i][1] };
  })(),
};
/** The lake's shore things: the boathouse (its jetty out from it, north), the cabins. */
export const SHORE = {
  boathouse: { x0: 8988, z0: -2154, x1: 9002, z1: -2144 },
  jetty: { x: 8995, z0: -2154, z1: -2178 },
  cabins: [
    { key: "cabin-west", x0: 9056, z0: -2098, x1: 9066, z1: -2090 },
    { key: "cabin-east", x0: 9126, z0: -2088, x1: 9136, z1: -2080 },
  ],
  /** the path down from the road between the cabins to the boathouse's back */
  path: [
    [9096, -2004],
    [9096, -2062],
    [9094, -2100],
    [9050, -2126],
    [8995, -2140],
  ] as [number, number][],
};
// (the shore's things and its path: no trees on them)
const SHORE_RECTS = [SHORE.boathouse, ...SHORE.cabins];
function shoreClear(x: number, z: number): boolean {
  for (const r of SHORE_RECTS) if (x > r.x0 - 6 && x < r.x1 + 6 && z > r.z0 - 6 && z < r.z1 + 6) return true;
  const P = SHORE.path;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 4) return true;
  }
  return false;
}
/** Is (x, z) on the road or its verges (`margin` m past its edge)? */
export function onLongRoad(x: number, z: number, margin = 6): boolean {
  if (!LONG_ROAD) return false;
  return roadNear(x, z).d < ROAD_W / 2 + margin;
}
