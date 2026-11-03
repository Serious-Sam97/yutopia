// Phase 0 of docs/plan/66-the-water.md: the water's shape as the plan has it (S1), worked out here
// from the shared Grounds for the mocks — no game code. The river's level runs downhill north →
// south (the running minimum of today's bed, a slight fall added, eased); the beds carved under the
// level (a wading shelf, then the deep); the land's change from today's (`delta`), so the mock can
// lower the drawn land by it.
import { POND, POND_LEVEL, RIVER, terrainAt } from "@yutopia/shared/grounds";

const L = RIVER.line;
const N = L.length;
const HALF = RIVER.w / 2; // 11
const FALL = 0.001; // the slow reaches' fall a metre (never flat)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** the length along the river at each sample (m) */
export const along: number[] = [0];
for (let i = 1; i < N; i++) along.push(along[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));

/** the land 26 m off the river's middle, the lower side (its banks' top: past where it's carved) */
export const bank: number[] = L.map(([x, z], i) => {
  const n = L[Math.min(N - 1, i + 1)];
  const p = L[Math.max(0, i - 1)];
  const l = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1;
  const nx = -(n[1] - p[1]) / l;
  const nz = (n[0] - p[0]) / l;
  return Math.min(terrainAt(x + nx * 26, z + nz * 26), terrainAt(x - nx * 26, z - nz * 26));
});
const FREEBOARD = 0.6; // the level at least this under the lower bank's top

/** the river's level at each sample: never rising southwards, never over its banks */
export const level: number[] = (() => {
  const h = RIVER.h.map((v, i) => Math.min(v, bank[i] - FREEBOARD));
  const lv: number[] = [h[0]];
  for (let i = 1; i < N; i++) lv.push(Math.min(lv[i - 1] - FALL * (along[i] - along[i - 1]), h[i]));
  // eased (a moving mean keeps it falling), then held under today's bed and falling again
  const W = 8;
  const sm = lv.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(N - 1, i + W); j++) {
      s += lv[j];
      n++;
    }
    return s / n;
  });
  for (let i = 0; i < N; i++) sm[i] = Math.min(sm[i], h[i]);
  // (the drawn bed and the banks are carved from today's bed: never over it either)
  for (let i = 1; i < N; i++) sm[i] = Math.min(sm[i], sm[i - 1]);
  return sm;
})();

/** how steep the level is at each sample (m a m) */
export const slope: number[] = level.map((_, i) => {
  const a = Math.max(0, i - 3);
  const b = Math.min(N - 1, i + 3);
  return (level[a] - level[b]) / Math.max(1e-3, along[b] - along[a]);
});
/** the current's speed at each sample (m/s): ~0.4 on the reaches, white water on the drops */
export const speed: number[] = slope.map((s) => 0.35 + Math.min(3.2, s * 25));

/** how deep the river is d metres off its middle (m), at a sample */
function riverDepth(d: number, i: number): number {
  const fast = smooth(0.02, 0.08, slope[i]); // the drops: rocks and shallow white water
  const shelf = d >= HALF - 2.5 ? (0.9 * (HALF - d)) / 2.5 : 0.9 + 1.9 * smooth(HALF - 2.5, HALF - 6, d);
  return shelf * (1 - 0.65 * fast);
}
/** how deep the pond is at its ellipse measure r (0 the middle, 1 the shore) (m) */
function pondDepth(r: number): number {
  if (r >= 1) return 0;
  return r > 0.88 ? (0.9 * (1 - r)) / 0.12 : 0.9 + 2.6 * smooth(0.88, 0.35, r);
}

// the river's samples bucketed (16 m) for the nearest segment
const B = 16;
const buckets = new Map<string, number[]>();
for (let i = 0; i + 1 < N; i++) {
  const x0 = Math.floor((Math.min(L[i][0], L[i + 1][0]) - 30) / B);
  const x1 = Math.floor((Math.max(L[i][0], L[i + 1][0]) + 30) / B);
  const z0 = Math.floor((Math.min(L[i][1], L[i + 1][1]) - 30) / B);
  const z1 = Math.floor((Math.max(L[i][1], L[i + 1][1]) + 30) / B);
  for (let bx = x0; bx <= x1; bx++)
    for (let bz = z0; bz <= z1; bz++) {
      const k = `${bx},${bz}`;
      const a = buckets.get(k);
      if (a) a.push(i);
      else buckets.set(k, [i]);
    }
}
/** the nearest point of the river's line: its sample (fractional), its distance, the side (+ its left) */
export function nearRiver(x: number, z: number): { t: number; i: number; d: number; s: number } | null {
  const c = buckets.get(`${Math.floor(x / B)},${Math.floor(z / B)}`);
  if (!c) return null;
  let best: { t: number; i: number; d: number; s: number } | null = null;
  for (const i of c) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * u;
    const pz = az + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) {
      const s = Math.sign(-dz * (x - ax) + dx * (z - az)) || 1;
      best = { t: i + u, i, d, s };
    }
  }
  return best && best.d < 30 ? best : null;
}
const at = (a: number[], t: number) => {
  const i = Math.min(N - 2, Math.floor(t));
  return a[i] + (a[i + 1] - a[i]) * (t - i);
};

/** The water at (x, z) as the plan has it: its level and how deep it is there (none: null). */
export function waterAt(
  x: number,
  z: number,
): { level: number; depth: number; speed: number; kind: "pond" | "river" } | null {
  const r = Math.sqrt(((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2);
  if (r < 1) return { level: POND_LEVEL, depth: pondDepth(r), speed: 0, kind: "pond" };
  const n = nearRiver(x, z);
  if (n && n.d < HALF)
    return { level: at(level, n.t), depth: riverDepth(n.d, n.i), speed: at(speed, n.t), kind: "river" };
  return null;
}

/** How much the land at (x, z) moves from today's (m, + up): the beds carved, the river's banks
 *  brought down to its level. */
export function delta(x: number, z: number): number {
  const r2 = ((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2;
  if (r2 < 1) return -pondDepth(Math.sqrt(r2));
  const n = nearRiver(x, z);
  if (!n || n.d >= 25) return 0;
  const lv = at(level, n.t);
  const old = at(RIVER.h, n.t);
  if (n.d < HALF) return lv - riverDepth(n.d, n.i) - old;
  return (lv - old) * (1 - smooth(HALF, HALF + 14, n.d));
}
