import {
  anchoredAt,
  BUILDINGS,
  CHUNK,
  EDIT_LIMITS,
  editsNow,
  GROUNDS,
  groundsChunk,
  SURFACES,
  type Surface,
  WAYS,
} from "./grounds.ts";
import {
  decodeBytes,
  decodeHeights,
  encodeBytes,
  encodeHeights,
  type GroundsEdits,
  TREE_MASK,
} from "./grounds-edits.ts";

// God mode's land and paint brushes (docs/plan/53-the-god-mode.md, phase 6): a stroke changes the
// draft's grids — the land's lift, a sample every half metre (each chunk's edge kept in both
// chunks it bounds), and the tiles' paint — round where the brush is, falling off to its edge,
// never on what's anchored (the rule book's own test, sample by sample) nor past ±30 m. Raise and
// lower add while it's held; smooth eases each sample to its neighbours', flatten to the height
// first pressed, roughen adds bumps; a ramp runs from where it was pressed to where it is now. The
// land as generated (levelled to its roads and buildings) comes from the chunks made of the
// Grounds, so nothing's worked out twice. And what a draft's lift does to what stands on the
// land: a building's plot tipped, a way made steep (warnings, not the rule book's).

/** Samples a side of a chunk's lift grid. */
const N = CHUNK * 2 + 1;
const LIFT_MAX = EDIT_LIMITS.lift * 100;
export type LandMode = "raise" | "lower" | "smooth" | "flatten" | "ramp" | "roughen";
export const LAND_MODES: LandMode[] = ["raise", "lower", "smooth", "flatten", "ramp", "roughen"];
/** What paint can put down (not a building's floor), and "as generated". */
export const PAINTS = ["snow", "deep", "path", "asphalt", "walk", "ice", "rock", "generated"] as const;
export type Paint = (typeof PAINTS)[number];
/** The brush's size (m across) and strength (1–100). */
export const BRUSH = { land: { min: 2, max: 64 }, paint: { min: 1, max: 32 }, strength: { min: 1, max: 100 } };

const key = (cx: number, cz: number) => `${cx},${cz}`;
/** Off the rule book's ground: anchored, past the edge, or a chunk the Grounds haven't got. */
function locked(x: number, z: number): boolean {
  if (x < GROUNDS.x0 || x >= GROUNDS.x1 || z < GROUNDS.z0 || z >= GROUNDS.z1) return true;
  return anchoredAt(x, z) !== null;
}
function smooth01(t: number): number {
  return t >= 1 ? 0 : t <= 0 ? 1 : 0.5 * (1 + Math.cos(Math.PI * t));
}

/** A stroke of the land brush over a draft: `edits()` is the draft with it. */
export class LandStroke {
  // the draft's lift grids (cm, kept as fractions while it goes: a frame's bit near the edge is
  // less than one) being changed, and as they were when the stroke began
  private readonly lifts = new Map<string, Float32Array>();
  private readonly start = new Map<string, Int16Array>();
  // the land without any lift (m), from the chunks made
  private readonly base = new Map<string, Float32Array>();
  private readonly touched = new Set<string>();
  private readonly from: GroundsEdits;
  /** how many samples it's changed (laid again only when this moves) */
  version = 0;
  private target = 0; // flatten's height
  private a: { x: number; z: number; h: number } | null = null; // ramp's start
  private rampSamples = new Map<string, [number, number]>(); // (the last ramp's samples: put back before the next)

  constructor(
    from: GroundsEdits,
    readonly mode: LandMode,
    /** m across */
    readonly size: number,
    /** 1–100 */
    readonly strength: number,
    at: { x: number; z: number },
  ) {
    this.from = from;
    this.target = this.height(at.x, at.z);
    this.a = { ...at, h: this.target };
  }

  // ── a sample by its global index (half metres from the origin) ──
  private grid(cx: number, cz: number): Float32Array {
    const k = key(cx, cz);
    let g = this.lifts.get(k);
    if (!g) {
      const s = this.from.height?.[k];
      const was = (s && decodeHeights(s, N * N)) || new Int16Array(N * N);
      g = Float32Array.from(was);
      this.lifts.set(k, g);
      this.start.set(k, was);
    }
    return g;
  }
  private baseOf(cx: number, cz: number): Float32Array {
    const k = key(cx, cz);
    let b = this.base.get(k);
    if (!b) {
      // (the chunk as made now has the lift laid now in it: that taken off)
      const c = groundsChunk(cx, cz);
      const s = editsNow().height?.[k];
      const laid = s ? decodeHeights(s, N * N) : null;
      b = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) b[i] = c.h[i] - (laid ? laid[i] / 100 : 0);
      this.base.set(k, b);
    }
    return b;
  }
  private where(sx: number, sz: number) {
    const cx = Math.floor(sx / (N - 1));
    const cz = Math.floor(sz / (N - 1));
    return { cx, cz, i: sx - cx * (N - 1), j: sz - cz * (N - 1) };
  }
  private lift(sx: number, sz: number): number {
    const p = this.where(sx, sz);
    return this.grid(p.cx, p.cz)[p.j * N + p.i];
  }
  private liftAtStart(sx: number, sz: number): number {
    const p = this.where(sx, sz);
    this.grid(p.cx, p.cz);
    return (this.start.get(key(p.cx, p.cz)) as Int16Array)[p.j * N + p.i];
  }
  private land(sx: number, sz: number): number {
    const p = this.where(sx, sz);
    return this.baseOf(p.cx, p.cz)[p.j * N + p.i];
  }
  /** The land's height at a sample now (m). */
  private h(sx: number, sz: number): number {
    return this.land(sx, sz) + this.lift(sx, sz) / 100;
  }
  /** Set, in every chunk that has it (an edge's in two, a corner's in four). */
  private set(sx: number, sz: number, cm: number) {
    const v = Math.max(-LIFT_MAX, Math.min(LIFT_MAX, cm));
    const p = this.where(sx, sz);
    for (const [cx, i] of p.i === 0 ? [[p.cx, 0] as const, [p.cx - 1, N - 1] as const] : [[p.cx, p.i] as const])
      for (const [cz, j] of p.j === 0 ? [[p.cz, 0] as const, [p.cz - 1, N - 1] as const] : [[p.cz, p.j] as const]) {
        if (cx * CHUNK < GROUNDS.x0 || cx * CHUNK >= GROUNDS.x1 || cz * CHUNK < GROUNDS.z0 || cz * CHUNK >= GROUNDS.z1)
          continue;
        const g = this.grid(cx, cz);
        if (Math.abs(g[j * N + i] - v) < 1e-4) continue;
        g[j * N + i] = v;
        this.touched.add(key(cx, cz));
        this.version++;
      }
  }
  /** The land's height at (x, z), the nearest sample's (the brush's own reading). */
  height(x: number, z: number): number {
    return this.h(Math.round(x * 2), Math.round(z * 2));
  }

  /** Each sample within the brush round (x, z), its weight (1 in the middle, 0 at the edge). */
  private each(x: number, z: number, f: (sx: number, sz: number, w: number) => void) {
    const r = this.size / 2;
    for (let sz = Math.ceil((z - r) * 2); sz <= Math.floor((z + r) * 2); sz++)
      for (let sx = Math.ceil((x - r) * 2); sx <= Math.floor((x + r) * 2); sx++) {
        const w = smooth01(Math.hypot(sx / 2 - x, sz / 2 - z) / r);
        // (the rule book tests a sample a quarter metre in)
        if (w > 0 && !locked(sx / 2 + 0.25, sz / 2 + 0.25)) f(sx, sz, w);
      }
  }

  /** The brush held at (x, z) for `dt` s (Shift: `invert`). */
  apply(x: number, z: number, dt: number, invert = false) {
    const k = this.strength / 100;
    const m = invert ? (this.mode === "raise" ? "lower" : this.mode === "lower" ? "raise" : this.mode) : this.mode;
    if (m === "raise" || m === "lower") {
      const cm = (m === "raise" ? 1 : -1) * k * 400 * dt;
      this.each(x, z, (sx, sz, w) => this.set(sx, sz, this.lift(sx, sz) + cm * w));
    } else if (m === "roughen") {
      const cm = k * 120 * dt;
      this.each(x, z, (sx, sz, w) => this.set(sx, sz, this.lift(sx, sz) + cm * w * (invert ? -1 : 1) * bump(sx, sz)));
    } else if (m === "smooth" || m === "flatten") {
      const ease = Math.min(1, k * 6 * dt);
      // (smooth: to the mean of the samples a metre round it; worked out before any's changed)
      const want: [number, number, number][] = [];
      this.each(x, z, (sx, sz, w) => {
        const t =
          m === "flatten"
            ? this.target
            : (this.h(sx - 2, sz) + this.h(sx + 2, sz) + this.h(sx, sz - 2) + this.h(sx, sz + 2) + this.h(sx, sz)) / 5;
        want.push([sx, sz, this.lift(sx, sz) + (t - this.h(sx, sz)) * 100 * ease * w]);
      });
      for (const [sx, sz, v] of want) this.set(sx, sz, v);
    } else if (m === "ramp") this.rampTo(x, z);
  }

  /** The ramp from where it was pressed to (x, z): the land along it from the one height to the
   *  other, as wide as the brush, easing into what's round it. */
  private rampTo(x: number, z: number) {
    const a = this.a;
    if (!a) return;
    // (put back what the last one set: each one's made from the stroke's start)
    for (const [sx, sz] of this.rampSamples.values()) this.set(sx, sz, this.liftAtStart(sx, sz));
    this.rampSamples.clear();
    const hb =
      this.land(Math.round(x * 2), Math.round(z * 2)) + this.liftAtStart(Math.round(x * 2), Math.round(z * 2)) / 100;
    const dx = x - a.x;
    const dz = z - a.z;
    const l2 = dx * dx + dz * dz;
    const r = this.size / 2;
    const x0 = Math.min(a.x, x) - r;
    const x1 = Math.max(a.x, x) + r;
    const z0 = Math.min(a.z, z) - r;
    const z1 = Math.max(a.z, z) + r;
    for (let sz = Math.ceil(z0 * 2); sz <= Math.floor(z1 * 2); sz++)
      for (let sx = Math.ceil(x0 * 2); sx <= Math.floor(x1 * 2); sx++) {
        const px = sx / 2;
        const pz = sz / 2;
        const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2)) : 0;
        const d = Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
        // (full across its middle half, easing off to the brush's edge)
        const w = smooth01(Math.max(0, d / r - 0.5) * 2);
        if (w <= 0 || locked(px + 0.25, pz + 0.25)) continue;
        const want = a.h + (hb - a.h) * t;
        const at = this.land(sx, sz) * 100 + this.liftAtStart(sx, sz);
        this.set(sx, sz, this.liftAtStart(sx, sz) + (want * 100 - at) * w);
        this.rampSamples.set(`${sx},${sz}`, [sx, sz]);
      }
  }

  /** The draft with the stroke (only the chunks it touched encoded again; a grid of nothing gone). */
  edits(): GroundsEdits {
    const height = { ...(this.from.height ?? {}) };
    for (const k of this.touched) {
      const g = Int16Array.from(this.lifts.get(k) as Float32Array, Math.round);
      if (g.some((v) => v !== 0)) height[k] = encodeHeights(g);
      else delete height[k];
    }
    const out: GroundsEdits = { ...this.from, height };
    if (!Object.keys(height).length) delete out.height;
    return out;
  }
}
// (a bump's height at a sample: a few metres across, the same each time)
function bump(sx: number, sz: number): number {
  const x = sx / 2;
  const z = sz / 2;
  return Math.sin(x * 0.9 + Math.sin(z * 0.37) * 2.1) * Math.cos(z * 0.83 + Math.sin(x * 0.29) * 1.7);
}

/** A stroke of the paint brush: each tile within it the surface, or as generated. */
export class PaintStroke {
  private readonly grids = new Map<string, Uint8Array>();
  private readonly touched = new Set<string>();
  private last: { x: number; z: number } | null = null;
  /** how many tiles it's changed (laid again only when this moves) */
  version = 0;
  constructor(
    private readonly from: GroundsEdits,
    readonly paint: Paint,
    /** m across */
    readonly size: number,
  ) {}

  /** Painted at (x, z) — and along the way from where it was last, not a dotted line. */
  apply(x: number, z: number) {
    const p = this.last ?? { x, z };
    const d = Math.hypot(x - p.x, z - p.z);
    const n = Math.max(1, Math.ceil(d / Math.max(0.5, this.size / 4)));
    for (let s = 1; s <= n; s++) this.dab(p.x + ((x - p.x) * s) / n, p.z + ((z - p.z) * s) / n);
    this.last = { x, z };
  }
  private dab(x: number, z: number) {
    const r = Math.max(0.5, this.size / 2);
    const v = this.paint === "generated" ? 0 : SURFACES.indexOf(this.paint as Surface) + 1;
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++)
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (Math.hypot(tx + 0.5 - x, tz + 0.5 - z) > r || locked(tx + 0.5, tz + 0.5)) continue;
        const cx = Math.floor(tx / CHUNK);
        const cz = Math.floor(tz / CHUNK);
        const k = key(cx, cz);
        let g = this.grids.get(k);
        if (!g) {
          const s = this.from.paint?.[k];
          g = (s && decodeBytes(s, CHUNK * CHUNK)) || new Uint8Array(CHUNK * CHUNK);
          this.grids.set(k, g);
        }
        const i = (tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK);
        if (g[i] === v) continue;
        g[i] = v;
        this.touched.add(k);
        this.version++;
      }
  }
  edits(): GroundsEdits {
    const paint = { ...(this.from.paint ?? {}) };
    for (const k of this.touched) {
      const g = this.grids.get(k) as Uint8Array;
      if (g.some((v) => v !== 0)) paint[k] = encodeBytes(g);
      else delete paint[k];
    }
    const out: GroundsEdits = { ...this.from, paint };
    if (!Object.keys(paint).length) delete out.paint;
    return out;
  }
}

/** A draft's lift at (x, z), m (its grids', between samples as the land's is). */
export function liftIn(e: GroundsEdits, x: number, z: number): number {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const s = e.height?.[key(cx, cz)];
  if (!s) return 0;
  const g = decoded(s);
  const u = (x - cx * CHUNK) * 2;
  const v = (z - cz * CHUNK) * 2;
  const i = Math.min(N - 2, Math.floor(u));
  const j = Math.min(N - 2, Math.floor(v));
  const fu = u - i;
  const fv = v - j;
  const a = g[j * N + i];
  const b = g[j * N + i + 1];
  const c = g[(j + 1) * N + i];
  const d = g[(j + 1) * N + i + 1];
  return (a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv) / 100;
}
/** A draft's paint on the tile at (x, z): a surface, or null as generated. */
export function paintIn(e: GroundsEdits, x: number, z: number): Surface | null {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const cx = Math.floor(tx / CHUNK);
  const cz = Math.floor(tz / CHUNK);
  const s = e.paint?.[key(cx, cz)];
  if (!s) return null;
  const v = (decodeBytes(s, CHUNK * CHUNK) as Uint8Array)[(tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK)];
  return v ? SURFACES[v - 1] : null;
}
// (grids read often — the pointer's readout, the checks — decoded once each)
const cache = new Map<string, Int16Array>();
function decoded(s: string): Int16Array {
  let g = cache.get(s);
  if (!g) {
    g = decodeHeights(s, N * N) ?? new Int16Array(N * N);
    if (cache.size > 64) cache.delete(cache.keys().next().value as string);
    cache.set(s, g);
  }
  return g;
}

/** How out of level a building's plot may be made (m), and how steep a way (rise over run). */
export const SLOPE = { plot: 0.6, way: 0.14 };

/** What a draft's lift does to what stands on the land, against `from` (what's published): a
 *  building's plot tipped, a way made steep. Warnings: the publish shows them, the tools too. */
export function slopeIssues(from: GroundsEdits, to: GroundsEdits): string[] {
  const out: string[] = [];
  const changed = new Set<string>();
  const a = from.height ?? {};
  const b = to.height ?? {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) changed.add(k);
  if (!changed.size) return out;
  const near = (x0: number, z0: number, x1: number, z1: number) => {
    for (let cz = Math.floor(z0 / CHUNK); cz <= Math.floor(z1 / CHUNK); cz++)
      for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++)
        if (changed.has(key(cx, cz))) return true;
    return false;
  };
  for (const bd of BUILDINGS) {
    if (!near(bd.x0, bd.z0, bd.x1, bd.z1)) continue;
    const at = [
      [bd.x0, bd.z0],
      [bd.x1, bd.z0],
      [bd.x0, bd.z1],
      [bd.x1, bd.z1],
      [(bd.x0 + bd.x1) / 2, (bd.z0 + bd.z1) / 2],
    ].map(([x, z]) => liftIn(to, x, z) - liftIn(from, x, z));
    const spread = Math.max(...at) - Math.min(...at);
    if (spread > SLOPE.plot) out.push(`${bd.name}: its plot ${spread.toFixed(1)} m out of level`);
  }
  for (const w of WAYS) {
    let steep = 0;
    for (let i = 1; i < w.line.length; i++) {
      const [px, pz] = w.line[i - 1];
      const [qx, qz] = w.line[i];
      if (!near(Math.min(px, qx), Math.min(pz, qz), Math.max(px, qx), Math.max(pz, qz))) continue;
      const d = Math.hypot(qx - px, qz - pz) || 1;
      const rise = liftIn(to, qx, qz) - liftIn(from, qx, qz) - (liftIn(to, px, pz) - liftIn(from, px, pz));
      steep = Math.max(steep, Math.abs(rise) / d);
    }
    if (steep > SLOPE.way) out.push(`${w.name}: ${Math.round(steep * 100)}% steeper where the land moves`);
  }
  return out;
}

// ── the woods (phase 8): the tree cells, 3.2 m, ten a chunk a side ──────────
const CELL = 3.2;
export type TreePick = "pine" | "birch" | "bare" | "mix";
export const TREE_PICKS: TreePick[] = ["pine", "birch", "bare", "mix"];
export type WoodsMode = "plant" | "clear" | "generated";
// (a cell's own: the same each time it's brushed)
function cellHash(i: number, j: number, k: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
/** What a planted cell grows: the kind asked for, or of a mix (most pines, some birches, a few bare). */
function planted(pick: TreePick, i: number, j: number): number {
  if (pick !== "mix") return TREE_MASK[pick];
  const q = cellHash(i, j, 2);
  return q < 0.62 ? TREE_MASK.pine : q < 0.88 ? TREE_MASK.birch : TREE_MASK.bare;
}

/** A stroke of the forest brush: each cell within it planted (as thick as asked: the rest bare),
 *  cleared, or as generated; never on what's anchored. */
export class WoodsStroke {
  private readonly grids = new Map<string, Uint8Array>();
  private readonly touched = new Set<string>();
  version = 0;
  constructor(
    private readonly from: GroundsEdits,
    readonly mode: WoodsMode,
    readonly pick: TreePick,
    /** 0–1: how many of the cells grow a tree */
    readonly thick: number,
    /** m across */
    readonly size: number,
  ) {}
  apply(x: number, z: number) {
    const r = this.size / 2;
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++)
      for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
        const cx = (i + 0.5) * CELL;
        const cz = (j + 0.5) * CELL;
        if (Math.hypot(cx - x, cz - z) > r || locked(cx, cz)) continue;
        const v =
          this.mode === "generated"
            ? TREE_MASK.generated
            : this.mode === "clear" || cellHash(i, j, 1) >= this.thick
              ? TREE_MASK.none
              : planted(this.pick, i, j);
        this.set(i, j, v);
      }
  }
  private set(i: number, j: number, v: number) {
    const ci = Math.floor(i / 10);
    const cj = Math.floor(j / 10);
    const k = key(ci, cj);
    let g = this.grids.get(k);
    if (!g) {
      const s = this.from.trees?.[k];
      g = (s && decodeBytes(s, 100)) || new Uint8Array(100);
      this.grids.set(k, g);
    }
    const n = (j - cj * 10) * 10 + (i - ci * 10);
    if (g[n] === v) return;
    g[n] = v;
    this.touched.add(k);
    this.version++;
  }
  edits(): GroundsEdits {
    const trees = { ...(this.from.trees ?? {}) };
    for (const k of this.touched) {
      const g = this.grids.get(k) as Uint8Array;
      if (g.some((v) => v !== 0)) trees[k] = encodeBytes(g);
      else delete trees[k];
    }
    const out: GroundsEdits = { ...this.from, trees };
    if (!Object.keys(trees).length) delete out.trees;
    return out;
  }
}
/** One tree: the cell at (x, z) grows one of `pick` (a mix: one of the mix), or none (null). */
export function oneTree(e: GroundsEdits, x: number, z: number, pick: TreePick | null): GroundsEdits {
  const s = new WoodsStroke(e, pick ? "plant" : "clear", pick ?? "pine", 1, 0.1);
  const i = Math.floor(x / CELL);
  const j = Math.floor(z / CELL);
  s.apply((i + 0.5) * CELL, (j + 0.5) * CELL);
  return s.edits();
}
