import {
  CHUNK,
  groundAt,
  groundSurfaceAt,
  groundsChunk,
  groundsRng,
  KART_FENCE,
  pineVariant,
  type Surface,
  type Tree,
  terrainAt,
  treeDensity,
  treesIn,
} from "@yutopia/shared/grounds";
import { Color, Matrix4, Quaternion, Vector3 } from "three";

// A block of the streamed land (grounds-stream.ts), worked out as numbers: its heights, colours,
// the green under its snow, its skirts and its trees' matrices. Pure, three's maths only — so it's
// made in a worker (land-block.worker.ts) as you go (a near block was 20–90 ms on the long road,
// docs/plan/69: one a frame was a frame missed), and here behind the loading screen. The mesh is
// put together from it on the main thread (GroundsStream.place).

/** The land's surfaces' colours. */
export const SURF: Record<Surface, number> = {
  snow: 0xf3f6f9,
  deep: 0xeef3f8,
  path: 0xd6d4cf,
  asphalt: 0xc4c8cc,
  walk: 0xd8d8d4,
  ice: 0xc3d2dc,
  floor: 0xc9c5bd,
  // (a warm grey: a cool one, lit by the sky, read as a pond on a bluff's face)
  rock: 0x7a756d,
  sand: 0xe2cfa4,
};

// ── what lies on the woods' floor (woods3d.ts draws them) ──
export type Cover = "shrub" | "stump" | "log" | "stone" | "boulder";
export interface Lying {
  kind: Cover;
  x: number;
  y: number;
  z: number;
  ry: number;
  s: number;
}
export const COVERS: Cover[] = ["shrub", "stump", "log", "stone", "boulder"];

/** What lies in chunk (cx, cz), clear of its trees. */
export function coverIn(cx: number, cz: number, trees: Tree[]): Lying[] {
  const r = groundsRng(cx * 7919 + cz * 104729 + 17);
  const out: Lying[] = [];
  const clear = (x: number, z: number, d: number) => trees.every((t) => Math.hypot(t.x - x, t.z - z) > d);
  for (let i = 0; i < 30; i++) {
    const x = cx * CHUNK + r() * CHUNK;
    const z = cz * CHUNK + r() * CHUNK;
    const p = r();
    const surf = groundSurfaceAt(x, z);
    let kind: Cover | null = null;
    if (surf === "rock") kind = p < 0.45 ? "boulder" : p < 0.75 ? "stone" : null;
    else if (surf === "deep")
      kind = p < 0.3 ? "shrub" : p < 0.38 ? "stump" : p < 0.43 ? "log" : p < 0.55 ? "stone" : null;
    else if (surf === "snow" && treeDensity(x, z) > 0.04) kind = p < 0.12 ? "shrub" : p < 0.18 ? "stone" : null;
    if (!kind) continue;
    if (!clear(x, z, kind === "log" ? 2.4 : kind === "boulder" ? 2 : 1.1)) continue;
    // (a log needs its length on the same snow)
    if (kind === "log") {
      const a = r() * Math.PI;
      const ok = [-1.6, 1.6].every((k) => groundSurfaceAt(x + Math.cos(a) * k, z - Math.sin(a) * k) === "deep");
      if (!ok) continue;
      out.push({ kind, x, y: groundAt(x, z) - 0.05, z, ry: a, s: 0.85 + r() * 0.3 });
      continue;
    }
    const s = kind === "boulder" ? 0.7 + r() * 0.9 : 0.7 + r() * 0.6;
    out.push({ kind, x, y: groundAt(x, z) - (kind === "boulder" ? 0.3 * s : 0.04), z, ry: r() * Math.PI * 2, s });
  }
  return out;
}

/** The trees' pools by kind (GroundsStream makes one instanced mesh each, in this order). */
export const TREE_KINDS = {
  pine: [0, 1, 2, 3, 4, 5],
  birch: [6, 7, 8],
  bare: [9, 10, 11],
  far: 12,
  mound: 13,
  farBirch: 14,
  farBare: 15,
  cover: Object.fromEntries(COVERS.map((c, i) => [c, 16 + i])) as Record<Cover, number>,
};

/** The land round each of a block's (n + 1)² vertices, `step` apart, for the green under the snow
 *  (docs/plan/65 W3): (the woods — the deep snow's, spread ~6 m: their floor reaches under
 *  their crowns — and a way near: 1 on one, 0 six metres off). */
export function landAround(
  surf: readonly string[] | ((i: number, j: number) => string),
  n: number,
  step: number,
): Float32Array {
  const N = n + 1;
  // (worked out over the block and a margin round it — the woods' blur, a way's six metres — so two
  // blocks side by side agree on their shared edge: a lookup past the edge, else the edge's own)
  const R = Math.min(6, Math.max(1, Math.round(6 / step)));
  const M = typeof surf === "function" ? Math.max(R, Math.ceil(6 / step)) + 1 : 0;
  const W = N + 2 * M;
  const at = (i: number, j: number) => (typeof surf === "function" ? surf(i, j) : surf[j * N + i]);
  const woods = new Float32Array(W * W);
  const d = new Float32Array(W * W).fill(99);
  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) {
      const s = at(i - M, j - M);
      woods[j * W + i] = s === "deep" ? 1 : 0;
      if (s === "path" || s === "asphalt" || s === "walk" || s === "floor") d[j * W + i] = 0;
    }
  // (the ways near: a chamfer distance, in metres)
  for (let pass = 0; pass < 2; pass++)
    for (let j0 = 0; j0 < W; j0++)
      for (let i0 = 0; i0 < W; i0++) {
        const j = pass ? W - 1 - j0 : j0;
        const i = pass ? W - 1 - i0 : i0;
        const o = pass ? 1 : -1;
        let v = d[j * W + i];
        const ii = i + o;
        const jj = j + o;
        if (ii >= 0 && ii < W) v = Math.min(v, d[j * W + ii] + step);
        if (jj >= 0 && jj < W) v = Math.min(v, d[jj * W + i] + step);
        if (ii >= 0 && ii < W && jj >= 0 && jj < W) v = Math.min(v, d[jj * W + ii] + step * Math.SQRT2);
        d[j * W + i] = v;
      }
  // (the woods spread: a box blur each way, ~6 m)
  let w = woods;
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(W * W);
    for (let j = 0; j < W; j++)
      for (let i = 0; i < W; i++) {
        let sum = 0;
        let k = 0;
        for (let o = -R; o <= R; o++) {
          const ii = pass ? i : i + o;
          const jj = pass ? j + o : j;
          if (ii < 0 || jj < 0 || ii >= W || jj >= W) continue;
          sum += w[jj * W + ii];
          k++;
        }
        t[j * W + i] = sum / k;
      }
    w = t;
  }
  const out = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const q = (j + M) * W + i + M;
      const o = (j * N + i) * 2;
      out[o] = Math.max(w[q], woods[q] * 0.85);
      out[o + 1] = Math.max(0, 1 - d[q] / 6);
    }
  return out;
}

// a vertex of the land's colour: its surface's, the snow a little blue in long waves. (The Kart Park's
// asphalt is its circuit's own meshes': under them the land's snow — its layout changes, the land's
// made once — docs/plan/47-the-track-changer.md)
const BLUE = new Color(0xdbe5f0);
function landColour(x: number, z: number, near: boolean, c: Color): string {
  const F = KART_FENCE;
  const g = groundSurfaceAt(x, z, !near);
  const s = g === "asphalt" && x > F.x0 && x < F.x1 && z > F.z0 && z < F.z1 ? "snow" : g;
  c.setHex(SURF[s]);
  if (s === "snow" || s === "deep") c.lerp(BLUE, 0.35 + 0.35 * Math.sin(x * 0.05 + z * 0.031));
  return s;
}

export interface BlockAsk {
  key: string;
  x0: number;
  z0: number;
  /** its side, its samples' step; the nearest tier (the walking chunk's own heights, the woods' floor) */
  size: number;
  step: number;
  near: boolean;
}
export interface BlockData {
  key: string;
  /** the edits it was made under (grounds' editsVersion, the main thread's) */
  v: number;
  /** (n + 1)² grid vertices, then the skirts' feet: x, y, z from the block's corner */
  pos: Float32Array;
  col: Float32Array;
  uv: Float32Array;
  /** the green under the snow (wx3d's wxLand) */
  around: Float32Array;
  /** the skirts: their feet's vertex, the edge's over it, pairs */
  under: Uint32Array;
  /** the skirts' triangles (the grid's are the main thread's: what the ground floor covers skipped) */
  skirt: Uint32Array;
  /** its trees: per pool, the instances' matrices */
  trees: { pool: number; m: Float32Array }[];
}

/** A block of land worked out (`v`: the edits it's made under, handed back as is). */
export function blockData(a: BlockAsk, v: number): BlockData {
  const { x0, z0, size, step, near } = a;
  const n = size / step;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const surf: string[] = [];
  const c = new Color();
  // near: the walking chunk's own heights (the same the feet are on)
  const chunk = near ? groundsChunk(Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK)) : null;
  const height = (i: number, j: number) =>
    chunk ? chunk.h[j * 2 * (CHUNK * 2 + 1) + i * 2] : terrainAt(x0 + i * step, z0 + j * step);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      pos.push(x - x0, height(i, j), z - z0);
      surf.push(landColour(x, z, near, c));
      col.push(c.r, c.g, c.b);
      uv.push(x / 14, z / 14);
    }
  // (the green's: the woods and the ways round each vertex — wx3d.ts)
  // (past the block's edge, the land there: its neighbours agree at their shared edge)
  const past = new Color();
  const around = Array.from(
    landAround(
      (i, j) =>
        i >= 0 && j >= 0 && i <= n && j <= n
          ? surf[j * (n + 1) + i]
          : landColour(x0 + i * step, z0 + j * step, near, past),
      n,
      step,
    ),
  );
  // skirts down from the edges (no cracks where the detail changes)
  const under: number[] = []; // a skirt's foot, the edge vertex over it
  const skirt: number[] = [];
  const edge = (list: number[]) => {
    const base = pos.length / 3;
    for (const [i, p] of list.entries()) {
      under.push(base + i, p);
      pos.push(pos[p * 3], pos[p * 3 + 1] - 1.6 - step * 0.4, pos[p * 3 + 2]);
      col.push(col[p * 3], col[p * 3 + 1], col[p * 3 + 2]);
      uv.push(uv[p * 2], uv[p * 2 + 1]);
      around.push(around[p * 2], around[p * 2 + 1]);
    }
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      skirt.push(a, base + i, b, b, base + i, base + i + 1, a, b, base + i, b, base + i + 1, base + i);
    }
  };
  edge(Array.from({ length: n + 1 }, (_, a) => a));
  edge(Array.from({ length: n + 1 }, (_, a) => n * (n + 1) + a));
  edge(Array.from({ length: n + 1 }, (_, b) => b * (n + 1)));
  edge(Array.from({ length: n + 1 }, (_, b) => b * (n + 1) + n));
  // its trees, by kind
  const trees: Tree[] = [];
  for (let cz = Math.floor(z0 / CHUNK); cz < (z0 + size) / CHUNK; cz++)
    for (let cx = Math.floor(x0 / CHUNK); cx < (x0 + size) / CHUNK; cx++)
      trees.push(...(near && chunk ? chunk.trees : treesIn(cx, cz)));
  const by = new Map<number, number[]>();
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const tilt = new Quaternion();
  const axis = new Vector3();
  const at = new Vector3();
  const sc = new Vector3();
  // each tree its own lean and girth (a hash of where it stands: the same for everyone)
  const hash = (x: number, z: number, k: number) => {
    const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
    return v - Math.floor(v);
  };
  const put = (pool: number, t: Tree, s: number, sy = s, dy = -0.25, lean = true) => {
    q.setFromAxisAngle(up, t.ry);
    let sx = s;
    let sz = s;
    if (lean) {
      const a = hash(t.x, t.z, 1) * Math.PI * 2;
      axis.set(Math.cos(a), 0, Math.sin(a));
      q.premultiply(tilt.setFromAxisAngle(axis, (hash(t.x, t.z, 2) - 0.5) * 0.09));
      sx = s * (0.9 + 0.2 * hash(t.x, t.z, 3));
      sz = s * (0.9 + 0.2 * hash(t.x, t.z, 4));
    }
    m.compose(at.set(t.x, t.y + dy, t.z), q, sc.set(sx, sy, sz));
    let l = by.get(pool);
    if (!l) {
      l = [];
      by.set(pool, l);
    }
    for (const e of m.elements) l.push(e);
  };
  const K = TREE_KINDS;
  for (const t of trees) {
    const v = Math.floor(t.ry * 10) % 3;
    const sy = 0.9 + (t.s % 0.2);
    if (t.kind === "pine") {
      // (mostly the usual three; now and then a young one, a tall one, an old broad one)
      // (shared grounds.ts: its trunk's height is the same choice — docs/plan/50-the-volume.md)
      const pv = pineVariant(t);
      put(near ? K.pine[pv] : K.far, t, t.s * 1.45, t.s * 1.45 * sy);
      if (near) put(K.mound, t, 2.2 * t.s, 0.45, -0.2, false);
    } else if (near) {
      put(t.kind === "birch" ? K.birch[v] : K.bare[v], t, t.s * (t.kind === "bare" ? 1.7 : 1), t.s * sy);
      put(K.mound, t, 1.1 * t.s, 0.3, -0.2, false);
    } else put(t.kind === "birch" ? K.farBirch : K.farBare, t, t.s * (t.kind === "bare" ? 1.7 : 1), t.s * sy);
  }
  // the woods' floor, near you
  if (near && chunk)
    for (const l of coverIn(Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK), trees))
      put(K.cover[l.kind], { x: l.x, y: l.y, z: l.z, ry: l.ry, s: l.s, kind: "pine" } as Tree, l.s, l.s, 0, false);
  return {
    key: a.key,
    v,
    pos: new Float32Array(pos),
    col: new Float32Array(col),
    uv: new Float32Array(uv),
    around: new Float32Array(around),
    under: new Uint32Array(under),
    skirt: new Uint32Array(skirt),
    trees: [...by].map(([pool, l]) => ({ pool, m: new Float32Array(l) })),
  };
}

/** What a block's data hands a worker's postMessage to move rather than copy. */
export function blockBuffers(d: BlockData): ArrayBuffer[] {
  return [d.pos, d.col, d.uv, d.around, d.under, d.skirt, ...d.trees.map((t) => t.m)].map(
    (a) => a.buffer as ArrayBuffer,
  );
}
