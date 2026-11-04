// The far land's heavy part (far3d.ts; docs/plan/69-the-long-road.md L5, L6): a ring of the land round
// the camera — its heights, its colours (snow, rock on the steep, the lake's ice, the forest's canopy
// tinted in) — and the far trees out past the near land, worked out off the main thread. This
// worker's Grounds are its own: god mode's edits as laid in the world come with each ask.
import { applyEdits, terrainAt, treeDensity, waterAt } from "@yutopia/shared/grounds";
import { type GroundsEdits, NO_EDITS } from "@yutopia/shared/grounds-edits";

export interface FarAsk {
  id: number;
  /** the main thread's edits version: laid again here when it moved (a draft keeps the published
   *  rev; a rollback to none has none) */
  v: number;
  edits: GroundsEdits | null;
  /** the lakes iced over (the room's ice): drawn as ice, else as water (the sea never) */
  iced: boolean;
  /** the ring: its corner, samples a side, their step; the near land's circle (under it, a little) */
  x0: number;
  z0: number;
  n: number;
  step: number;
  near: { cx: number; cz: number; r: number } | null;
  /** the far trees too: between these radii round (cx, cz), a jittered `cell` grid */
  trees: { cx: number; cz: number; r0: number; r1: number; cell: number } | null;
}
export interface FarLandData {
  id: number;
  /** heights, n², row by row (z) */
  h: Float32Array;
  /** colours, sRGB bytes, n² × 3 */
  c: Uint8Array;
  /** the far trees: x, y, z, scale each */
  trees: Float32Array;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (i: number, j: number, s: number) => {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
// the land's colours (the game's snow, its rock, the ice; the canopy far off: snow-laden spruce)
const SNOW = [243, 246, 249];
const BLUE = [219, 229, 240];
const ROCK = [115, 120, 128];
const ICE = [195, 210, 220];
const WATER = [36, 48, 58];
const CANOPY = [92, 110, 102];

let laid = -1;
function ring(a: FarAsk): FarLandData {
  const { x0, z0, n, step } = a;
  const h = new Float32Array(n * n);
  // (a lake's or the sea's: its water, flat at its level — the bed under it was drawn, pale, and the
  // near water's edge a band over it)
  const wet = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      const w = waterAt(x, z);
      if (w && (w.kind === "lake" || w.kind === "sea")) {
        h[j * n + i] = w.level;
        wet[j * n + i] = w.kind === "sea" ? 2 : 1;
      } else h[j * n + i] = terrainAt(x, z);
    }
  const c = new Uint8Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      const hx = h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)];
      const hz = h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i];
      const slope = Math.hypot(hx, hz) / (2 * step);
      let col: number[];
      if (wet[k]) col = a.iced && wet[k] === 1 ? ICE : WATER;
      else if (slope > 0.85 || (h[k] > 620 && slope > 0.55)) col = ROCK;
      else {
        const t = 0.35 + 0.35 * Math.sin(x * 0.05 + z * 0.031);
        col = SNOW.map((v, q) => v + (BLUE[q] - v) * t);
        // (the forest, as the trees would be: its canopy's colour over the snow)
        const d = Math.min(1, treeDensity(x, z) * 1.15);
        const tone = 0.75 + 0.2 * Math.sin(x / 310 + Math.sin(z / 470) * 2);
        col = col.map((v, q) => v + (CANOPY[q] - v) * d * tone);
      }
      c[k * 3] = col[0];
      c[k * 3 + 1] = col[1];
      c[k * 3 + 2] = col[2];
      // (under the near land: a little down)
      if (a.near) {
        const d = Math.hypot(x - a.near.cx, z - a.near.cz);
        h[k] -= 3 * (1 - smooth(a.near.r - 40, a.near.r, d));
      }
    }
  const trees: number[] = [];
  if (a.trees) {
    const { cx, cz, r0, r1, cell } = a.trees;
    for (let j = Math.floor((cz - r1) / cell); j < (cz + r1) / cell; j++)
      for (let i = Math.floor((cx - r1) / cell); i < (cx + r1) / cell; i++) {
        const x = (i + 0.1 + 0.8 * hash(i, j, 5)) * cell;
        const z = (j + 0.1 + 0.8 * hash(i, j, 6)) * cell;
        const r = Math.hypot(x - cx, z - cz);
        if (r < r0 || r > r1) continue;
        // (thinning out into the canopy past three quarters of the way)
        if (hash(i, j, 9) < smooth(r1 * 0.75, r1, r)) continue;
        if (hash(i, j, 7) > treeDensity(x, z)) continue;
        trees.push(x, terrainAt(x, z) - 0.3, z, (1.1 + 0.6 * hash(i, j, 8)) * (cell / 9));
      }
  }
  return { id: a.id, h, c, trees: new Float32Array(trees) };
}

self.onmessage = (e: MessageEvent<FarAsk>) => {
  const a = e.data;
  if (a.v !== laid) {
    applyEdits(a.edits ?? NO_EDITS);
    laid = a.v;
  }
  const d = ring(a);
  (self as unknown as Worker).postMessage(d, [
    d.h.buffer as ArrayBuffer,
    d.c.buffer as ArrayBuffer,
    d.trees.buffer as ArrayBuffer,
  ]);
};
