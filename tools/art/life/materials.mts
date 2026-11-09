// Plan 73, phase 3 — the life look's material library, painted by code: each material of
// apps/client/src/world/look/life-matlib-list.ts as three seamlessly tiling maps — albedo (sRGB), orm
// (R the crevices' shade, G roughness, B metal; linear) and normal — written as PNG, then KTX2 by Basis
// Universal (albedo and orm ETC1S, normal UASTC), full size and half (Low), into
// apps/client/public/life/mat/.
//
// The style is the one decided for the look (docs/plan/73, "painted"): soft shapes and gentle tone,
// clean patterns, no photo grain. Every pattern repeats exactly across its tile: periodic noise (its
// lattice wraps), cells that wrap, bands and bricks in whole counts.
//
//   node --experimental-strip-types tools/art/life/materials.mts [--only oak,linen] [--png DIR] [--no-ktx]
//        [--basisu PATH]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  LIBRARY,
  MAT_IDS,
  type MatDef,
  type MatId,
  matFile,
} from "../../../apps/client/src/world/look/life-matlib-list.ts";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const only = opt("--only")?.split(",");
const pngDir = opt("--png") ?? join(tmpdir(), "yutopia-mat");
const ktx = !args.includes("--no-ktx");
const BASISU =
  opt("--basisu") ??
  join(process.env.HOME ?? "", "Developer/projects/yondra/yutopia-art-src/tools/basis_universal/bin/basisu");
const OUT = new URL("../../../apps/client/public/life/mat/", import.meta.url).pathname;

// ── numbers ─────────────────────────────────────────────────────────────────────────────────────

type V3 = [number, number, number];
const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const hex = (h: number): V3 => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const grey = (k: number): V3 => [k, k, k];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const fract = (x: number) => x - Math.floor(x);

/** A hash of a lattice point, 0…1. */
function hash(ix: number, iy: number, s: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise on a lattice that wraps every px × py cells (so a tile of it repeats), 0…1. */
function vnoise(x: number, y: number, px: number, py: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const x0 = mod(xi, px);
  const x1 = mod(xi + 1, px);
  const y0 = mod(yi, py);
  const y1 = mod(yi + 1, py);
  const a = hash(x0, y0, s);
  const b = hash(x1, y0, s);
  const c = hash(x0, y1, s);
  const d = hash(x1, y1, s);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/** Fractal noise over the tile (u, v in 0…1): `fx` × `fy` lattice cells across it at the first octave
 *  (whole numbers: it tiles), doubling each octave. 0…1. */
function fbm(u: number, v: number, fx: number, fy: number, oct: number, s: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let tot = 0;
  let X = fx;
  let Y = fy;
  for (let k = 0; k < oct; k++) {
    sum += amp * vnoise(u * X, v * Y, X, Y, s + k * 101);
    tot += amp;
    amp *= gain;
    X *= 2;
    Y *= 2;
  }
  return sum / tot;
}

/** Cells over the tile (n × n, wrapping): the nearest point's distance (f1), the next's (f2) — in
 *  cell units — its id and where it is relative to (u, v). */
function cells(u: number, v: number, n: number, s: number, jitter = 0.85) {
  const x = u * n;
  const y = v * n;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  let dx1 = 0;
  let dy1 = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = mod(xi + i, n);
      const cy = mod(yi + j, n);
      const px = xi + i + 0.5 + (hash(cx, cy, s) - 0.5) * jitter;
      const py = yi + j + 0.5 + (hash(cx, cy, s + 7) - 0.5) * jitter;
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = cx + cy * n;
        dx1 = dx;
        dy1 = dy;
      } else if (d < f2) f2 = d;
    }
  return { f1, f2, id, dx: dx1, dy: dy1 };
}

// ── what a pattern gives, per pixel ─────────────────────────────────────────────────────────────

interface Px {
  /** colour, sRGB 0…1 */
  c: V3;
  /** height 0…1 (the normal map's, and the crevices' shade) */
  h: number;
  /** roughness 0…1 (scaled by the material's own) */
  r: number;
}
type Pattern = (u: number, v: number) => Px;

// ── woods: the grain along u ────────────────────────────────────────────────────────────────────

interface WoodOpts {
  light: number;
  dark: number;
  /** growth rings across a repeat (v) */
  rings: number;
  /** how the rings wander */
  warp: number;
  /** how dark the late wood's lines */
  late: number;
  /** open pores (oak, ash): short dark dashes along the grain */
  pores: number;
  /** long streaks of tone along the grain */
  streak: number;
  /** knots (pine) */
  knots: number;
  seed: number;
}
function woodField(o: WoodOpts) {
  const L = hex(o.light);
  const D = hex(o.dark);
  return (u: number, v: number): Px => {
    const s = o.seed;
    let ring = v * o.rings + o.warp * (fbm(u, v, 1, 2, 3, s) - 0.5) * 2 + 0.35 * (fbm(u, v, 2, 8, 2, s + 1) - 0.5);
    let knot = 0;
    if (o.knots > 0) {
      // (a few knots: the rings swell round each, its core dark)
      const k = cells(u, v, 3, s + 9, 0.7);
      const kx = k.dx * 2.2; // (stretched along the grain)
      const d2 = kx * kx + k.dy * k.dy * 9;
      const on = hash(k.id, 0, s + 3) < o.knots ? 1 : 0;
      knot = on * Math.exp(-d2 * 40);
      ring += on * Math.exp(-d2 * 9) * 0.55;
    }
    const band = 0.5 + 0.5 * Math.sin(TAU * ring);
    const late = smooth(0.55, 0.98, band) ** 1.5 + 0.35 * smooth(0.7, 0.95, fbm(u, v, 3, 96, 1, s + 6));
    const streak = fbm(u, v, 2, 24, 3, s + 2);
    const drift = fbm(u, v, 1, 2, 2, s + 4);
    // (pores: fine dashes along the grain — two octaves, so they're not the lattice's blocks)
    const pore = o.pores > 0 ? smooth(0.6, 0.85, fbm(u, v, 64, 512, 2, s + 5)) * o.pores : 0;
    let t = 0.28 + late * o.late + (streak - 0.5) * o.streak + (drift - 0.5) * 0.22 + pore * 0.35;
    t = clamp(t + knot * 0.5);
    const c = mix3(L, D, t);
    return { c, h: clamp(0.62 - late * 0.2 - pore * 0.12 - knot * 0.2), r: clamp(0.85 + late * 0.1 + pore * 0.15) };
  };
}
const WOODS: Record<string, WoodOpts> = {
  oak: {
    light: 0xcfa774,
    dark: 0x9a6c3d,
    rings: 26,
    warp: 0.45,
    late: 0.3,
    pores: 0.8,
    streak: 0.22,
    knots: 0,
    seed: 11,
  },
  walnut: {
    light: 0x7d563a,
    dark: 0x45301f,
    rings: 18,
    warp: 0.8,
    late: 0.28,
    pores: 0.3,
    streak: 0.4,
    knots: 0,
    seed: 12,
  },
  pine: {
    light: 0xe3c48d,
    dark: 0xbc8a4f,
    rings: 16,
    warp: 0.55,
    late: 0.42,
    pores: 0,
    streak: 0.14,
    knots: 0.18,
    seed: 13,
  },
  cherry: {
    light: 0xbd7449,
    dark: 0x8a4a2b,
    rings: 24,
    warp: 0.4,
    late: 0.22,
    pores: 0.15,
    streak: 0.28,
    knots: 0,
    seed: 14,
  },
  birch: {
    light: 0xe8d6b5,
    dark: 0xcbb08a,
    rings: 30,
    warp: 0.3,
    late: 0.22,
    pores: 0.1,
    streak: 0.16,
    knots: 0,
    seed: 15,
  },
  ash: {
    light: 0xbfb9ae,
    dark: 0x837c71,
    rings: 22,
    warp: 0.5,
    late: 0.36,
    pores: 0.7,
    streak: 0.18,
    knots: 0,
    seed: 16,
  },
};

/** Floorboards of a wood: 11 planks across 2 m, two lengths along, each its own cut and tone, a soft
 *  bevel and a dark seam between. */
function floorboards(w: WoodOpts): Pattern {
  const wood = woodField(w);
  const PLANKS = 11;
  return (u, v) => {
    const p = Math.floor(v * PLANKS);
    const inP = v * PLANKS - p;
    const shift = hash(p, 0, w.seed + 20) * 0.5;
    const along = fract(u + shift);
    const piece = Math.floor(along * 2); // (two boards a row)
    const inL = along * 2 - piece;
    const id = p * 2 + piece;
    // (the wood a metre a repeat: the 2 m tile reads it at twice the rate, each board its own cut)
    const px = wood(fract(u * 2 + hash(id, 1, w.seed) * 7.3), fract((inP / PLANKS) * 2 + hash(id, 2, w.seed) * 3.7));
    const tone = 1 + (hash(id, 3, w.seed) - 0.5) * 0.16;
    const eS = Math.min(inP, 1 - inP) * 0.182; // (metres to the board's side)
    const eE = Math.min(inL, 1 - inL) * 1.0; // (to its end)
    const e = Math.min(eS, eE);
    const bevel = smooth(0, 0.004, e);
    const seam = smooth(0.0006, 0.0025, e);
    const c = mul3(px.c, tone * (0.45 + 0.55 * seam) * (0.94 + 0.06 * bevel));
    return { c, h: px.h * 0.4 + 0.6 * bevel, r: mix(1, px.r, seam) };
  };
}

// ── fabrics: weaves, near white ─────────────────────────────────────────────────────────────────

/** A weave: `threads` threads across the tile each way; `top(i, j)` whether the warp (along v) is
 *  on top at that crossing. */
function weave(threads: number, top: (i: number, j: number) => boolean, seed: number, slub = 0.1): Pattern {
  return (u, v) => {
    const x = u * threads;
    const y = v * threads;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const warp = top(i, j);
    // (a thread's round profile across it, a little thicker or thinner along its length: slubs)
    const across = warp ? fx : fy;
    const along = warp ? fy : fx;
    const thick = 1 + (fbm(warp ? u : v, warp ? v : u, threads / 4, 4, 2, seed + (warp ? 0 : 50)) - 0.5) * slub * 4;
    const prof = Math.sin(Math.PI * clamp((across - 0.5) * thick + 0.5)) ** 0.7;
    const dip = 0.75 + 0.25 * Math.sin(Math.PI * along);
    const h = prof * dip;
    const mott = (fbm(u, v, 3, 3, 3, seed + 3) - 0.5) * 0.08;
    const k = 0.8 + 0.14 * h + mott + (warp ? 0.015 : -0.015);
    return { c: grey(clamp(k)), h, r: 0.9 + 0.1 * (1 - h) };
  };
}
const FABRICS: Record<string, Pattern> = {
  linen: weave(56, (i, j) => (i + j) % 2 === 0, 21, 0.18),
  twill: weave(72, (i, j) => mod(i + j, 4) < 2, 22, 0.06),
  herringbone: weave(
    72,
    (i, j) => {
      const band = Math.floor(i / 9) % 2; // (the diagonal turns every 9 threads)
      return mod(band ? i - j : i + j, 4) < 2;
    },
    23,
    0.06,
  ),
  tweed: (() => {
    const base = weave(48, (i, j) => mod(i + j, 4) < 2, 24, 0.14);
    return (u, v) => {
      const p = base(u, v);
      // (flecks: a few lighter and darker strands of the yarn)
      const f = fbm(u, v, 96, 24, 1, 25);
      const g = fbm(u, v, 24, 96, 1, 26);
      const fleck = smooth(0.8, 0.9, f) * 0.07 - smooth(0.82, 0.92, g) * 0.08;
      return { ...p, c: grey(clamp(p.c[0] + fleck)) };
    };
  })(),
  velvet: (u, v) => {
    // (no weave to see: a soft pile, crushed lighter and darker in broad sweeps)
    const sweep = fbm(u + 0.3 * fbm(u, v, 2, 2, 2, 31), v, 2, 3, 4, 32);
    const pile = fbm(u, v, 64, 64, 2, 33);
    const k = 0.76 + (sweep - 0.5) * 0.2 + (pile - 0.5) * 0.04;
    return { c: grey(clamp(k)), h: 0.5 + (pile - 0.5) * 0.3 + (sweep - 0.5) * 0.2, r: 0.95 };
  },
  boucle: (u, v) => {
    // (loops of yarn: round bumps, the gaps between them in shadow)
    const a = cells(u, v, 34, 41, 0.9);
    const b = cells(fract(u + 0.5 / 34), fract(v + 0.37 / 34), 34, 42, 0.9);
    const loop = Math.max(1 - smooth(0.15, 0.62, a.f1), 0.85 * (1 - smooth(0.15, 0.62, b.f1)));
    const mott = (fbm(u, v, 4, 4, 3, 43) - 0.5) * 0.07;
    return { c: grey(clamp(0.7 + 0.24 * loop + mott)), h: loop, r: 0.92 + 0.08 * (1 - loop) };
  },
};

// ── the rest ────────────────────────────────────────────────────────────────────────────────────

const leather: Pattern = (u, v) => {
  const c = cells(u, v, 44, 51, 0.95);
  const crease = smooth(0, 0.22, c.f2 - c.f1); // (0 in the crease between pebbles)
  const dome = 1 - smooth(0.1, 0.75, c.f1);
  const wrinkle = Math.abs(fbm(u, v, 3, 5, 4, 52) - 0.5) * 2; // (ridges: 0 along a fold)
  const fold = smooth(0, 0.12, wrinkle);
  const mott = (fbm(u, v, 3, 3, 3, 53) - 0.5) * 0.14;
  const k = 0.84 + mott * 0.5 - (1 - crease) * 0.1 - (1 - fold) * 0.03 + dome * 0.04;
  return {
    c: grey(clamp(k)),
    h: clamp(0.4 + 0.45 * crease * (0.6 + 0.4 * dome) + 0.15 * fold),
    r: 0.8 + 0.2 * (1 - crease) - 0.1 * dome,
  };
};
const metalBrushed: Pattern = (u, v) => {
  const lines = fbm(u, v, 1, 220, 3, 61);
  const long = fbm(u, v, 2, 12, 2, 62);
  return { c: grey(clamp(0.9 + (lines - 0.5) * 0.08 + (long - 0.5) * 0.05)), h: lines, r: 0.85 + (lines - 0.5) * 0.4 };
};
const metalCast: Pattern = (u, v) => {
  const m = fbm(u, v, 4, 4, 4, 63);
  const pit = cells(u, v, 64, 64, 0.9);
  const p = 1 - (1 - smooth(0.04, 0.1, pit.f1)) * (hash(pit.id, 0, 65) < 0.2 ? 1 : 0);
  return {
    c: grey(clamp(0.86 + (m - 0.5) * 0.08 - (1 - p) * 0.1)),
    h: clamp(0.5 + (m - 0.5) * 0.4) * p,
    r: 0.85 + (m - 0.5) * 0.3 + (1 - p) * 0.15,
  };
};
const metalPolished: Pattern = (u, v) => {
  const smudge = fbm(u, v, 3, 3, 4, 66);
  return { c: grey(0.95), h: 0.5, r: 0.75 + smooth(0.45, 0.75, smudge) * 0.5 };
};
const plaster: Pattern = (u, v) => {
  const warp = fbm(u, v, 3, 3, 2, 71);
  const trowel = fbm(fract(u + warp * 0.3), v, 5, 4, 4, 72);
  const sweep = smooth(0.42, 0.58, trowel);
  const m = fbm(u, v, 2, 2, 3, 73);
  return {
    c: grey(clamp(0.9 + (m - 0.5) * 0.06 + sweep * 0.02)),
    h: 0.5 + sweep * 0.2 + (fbm(u, v, 24, 24, 2, 74) - 0.5) * 0.15,
    r: 0.95 - sweep * 0.08,
  };
};
const paper = (u: number, v: number) => (fbm(u, v, 32, 32, 2, 81) - 0.5) * 0.04 + (fbm(u, v, 3, 3, 2, 82) - 0.5) * 0.04;
const wallpaperStripe: Pattern = (u, v) => {
  // (vertical stripes on a wall: across u) — a broad band, a narrow one, a fine pinstripe between
  const x = fract(u * 4); // (four repeats of the stripe a tile: 15 cm)
  const broad = smooth(0.0, 0.01, x) * (1 - smooth(0.5, 0.51, x));
  const pin = Math.exp(-(((x - 0.72) / 0.012) ** 2));
  const k = 0.9 - broad * 0.1 - pin * 0.14 + paper(u, v);
  return { c: grey(clamp(k)), h: 0.5 + broad * 0.15, r: 0.9 - broad * 0.1 };
};
const wallpaperDamask: Pattern = (u, v) => {
  // (a medallion on a half-drop: two across, two down, the second column dropped half a step)
  const col = Math.floor(u * 2);
  const vv = fract(v * 2 + (col % 2) * 0.5);
  const x = (fract(u * 2) - 0.5) * 2;
  const y = (vv - 0.5) * 2;
  const r = Math.hypot(x, y * 0.8);
  const a = Math.atan2(y, x);
  const flower = r < 0.28 + 0.12 * Math.cos(4 * a) ** 2 ? 1 : 0;
  const ring = Math.exp(-(((r - 0.55 - 0.06 * Math.cos(8 * a)) / 0.03) ** 2));
  const leaf = Math.abs(x) < 0.08 && Math.abs(y) > 0.62 && Math.abs(y) < 0.95 ? 1 : 0;
  const lattice = Math.exp(-(((Math.abs(x) + Math.abs(y * 0.9) - 1.02) / 0.025) ** 2));
  const m = clamp(flower + ring + leaf + lattice);
  const k = 0.9 - m * 0.13 + paper(u, v);
  return { c: grey(clamp(k)), h: 0.45 + m * 0.25, r: 0.9 - m * 0.18 };
};
/** Square tiles, `n` × `n` a repeat, grout `grout` of a tile wide; a little tone each, a gentle wave
 *  (made by hand). */
function tiles(n: number, grout: number, wave: number, seed: number): Pattern {
  return (u, v) => {
    const x = u * n;
    const y = v * n;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const e = Math.min(fx, 1 - fx, fy, 1 - fy);
    const inT = smooth(grout * 0.5, grout * 0.5 + 0.012, e);
    const tone = (hash(i, j, seed) - 0.5) * 0.06 + (fbm(u, v, n, n, 3, seed + 1) - 0.5) * 0.06;
    const h = inT * (0.75 + (fbm(u, v, n * 2, n * 2, 2, seed + 2) - 0.5) * wave);
    const k = inT ? 0.92 + tone : 0.55;
    return { c: grey(clamp(mix(0.58, k, inT))), h, r: mix(1, 0.75, inT) };
  };
}
const carpet: Pattern = (u, v) => {
  const tuft = cells(u, v, 120, 91, 0.9);
  const t = 1 - smooth(0.1, 0.7, tuft.f1);
  const m = fbm(u, v, 4, 4, 3, 92);
  const k = 0.76 + t * 0.1 + (m - 0.5) * 0.12 + (hash(tuft.id, 0, 93) - 0.5) * 0.06;
  return { c: grey(clamp(k)), h: t * 0.8 + m * 0.2, r: 1 };
};
const BRICK_COLOURS = [0xa4583d, 0x914933, 0xb06549, 0x7f412d, 0x9d5c41, 0xa86a52].map(hex);
const brick: Pattern = (u, v) => {
  // (16 courses of 7.5 cm, 5 bricks a course a 1.2 m repeat, a half-brick bond)
  const COURSES = 16;
  const PER = 5;
  const cy = v * COURSES;
  const row = Math.floor(cy);
  const fy = cy - row;
  const cx = u * PER + (row % 2) * 0.5;
  const b = Math.floor(cx);
  const fx = cx - b;
  const id = mod(b, PER) + row * PER;
  const ex = Math.min(fx, 1 - fx) * 0.24;
  const ey = Math.min(fy, 1 - fy) * 0.075;
  const e = Math.min(ex, ey);
  const inB = smooth(0.004, 0.007, e);
  const round = smooth(0.004, 0.012, e);
  const base = BRICK_COLOURS[Math.floor(hash(id, 0, 101) * BRICK_COLOURS.length)];
  const mott = (fbm(u, v, 12, 24, 3, 102) - 0.5) * 0.18;
  const burnt = smooth(0.3, 0.0, Math.min(fx, 1 - fx)) * (hash(id, 1, 103) < 0.25 ? 0.25 : 0);
  const pit = cells(u, v, 90, 104, 0.9);
  const p = smooth(0.04, 0.12, pit.f1);
  const bc = mul3(base, 1 + mott - burnt - (1 - p) * 0.12);
  const mortar: V3 = mul3(hex(0xb7ae9f), 0.92 + (fbm(u, v, 40, 40, 2, 105) - 0.5) * 0.2);
  return {
    c: mix3(mortar, bc, inB),
    h: clamp(0.2 + inB * (0.55 + 0.25 * round) * (0.85 + 0.15 * p)),
    r: mix(1, 0.85, inB),
  };
};
// (plan 73 phase 7) slates: 8 courses up a 1.2 m repeat (15 cm showing), 4 slates a course, a half bond;
// each course's foot laid over the one below — its lip a dark line, the slate thickening up to it
const SLATE_COLOURS = [0x4f555c, 0x5a6068, 0x474c53, 0x60666d, 0x535960, 0x4a5058].map(hex);
const roofSlate: Pattern = (u, v) => {
  const COURSES = 8;
  const PER = 4;
  const cy = v * COURSES;
  const row = Math.floor(cy);
  const fy = cy - row;
  const cx = u * PER + (row % 2) * 0.5;
  const b = Math.floor(cx);
  const fx = cx - b;
  const id = mod(b, PER) + row * PER;
  // (the joint between two slates; the foot of the course, where it lies over the one below)
  const joint = smooth(0.0, 0.025, Math.min(fx, 1 - fx));
  const foot = smooth(0.0, 0.07, fy);
  const base = SLATE_COLOURS[Math.floor(hash(id, 0, 121) * SLATE_COLOURS.length)];
  const grain = (fbm(u, v, 18, 5, 3, 122) - 0.5) * 0.14;
  const chip = hash(id, 2, 124) < 0.15 ? smooth(0.05, 0.0, Math.min(fx, 1 - fx)) * 0.15 : 0;
  const k = (1 + grain + (hash(id, 1, 123) - 0.5) * 0.12 - chip) * (0.55 + 0.45 * foot) * (0.65 + 0.35 * joint);
  return {
    c: mul3(base, k),
    h: clamp((0.25 + 0.55 * (1 - fy)) * joint + grain * 0.5),
    r: mix(0.95, 0.78, joint * foot),
  };
};
const concrete: Pattern = (u, v) => {
  const m = fbm(u, v, 3, 3, 5, 111);
  const pore = cells(u, v, 70, 112, 0.95);
  const p = hash(pore.id, 0, 113) < 0.3 ? smooth(0.04, 0.1, pore.f1) : 1;
  const k = 0.6 + (m - 0.5) * 0.1 - (1 - p) * 0.12;
  return {
    c: mul3(hex(0xa19e98), clamp(k / 0.6, 0, 1.4)),
    h: 0.5 + (m - 0.5) * 0.3 - (1 - p) * 0.3,
    r: 0.9 + (1 - p) * 0.1,
  };
};
const asphalt: Pattern = (u, v) => {
  const s = cells(u, v, 160, 121, 0.9);
  const stone = 1 - smooth(0.2, 0.45, s.f1);
  const light = hash(s.id, 0, 122);
  const m = fbm(u, v, 4, 4, 4, 123);
  const base = mul3(hex(0x45464a), 0.9 + (m - 0.5) * 0.3);
  const st = grey(0.32 + light * 0.22);
  return {
    c: mix3(base, st, stone * (light > 0.4 ? 0.8 : 0.3)),
    h: 0.35 + stone * 0.5 + (m - 0.5) * 0.15,
    r: 0.95 - stone * 0.1,
  };
};
const paving: Pattern = (u, v) => {
  const n = 4; // (60 cm slabs, 2.4 m a repeat)
  const x = u * n;
  const y = v * n;
  const i = Math.floor(x);
  const j = Math.floor(y);
  const e = Math.min(x - i, 1 - (x - i), y - j, 1 - (y - j)) * 0.6;
  const inS = smooth(0.003, 0.008, e);
  const edge = smooth(0.008, 0.04, e);
  const tone = (hash(i, j, 131) - 0.5) * 0.1;
  const m = fbm(u, v, 8, 8, 4, 132);
  const grit = fbm(u, v, 128, 128, 1, 133);
  const slab = mul3(hex(0xb8b0a3), 1 + tone + (m - 0.5) * 0.12 + (grit - 0.5) * 0.05 - (1 - edge) * 0.05);
  return {
    c: mix3(hex(0x5d5a55), slab, inS),
    h: clamp(0.15 + inS * (0.7 + 0.15 * edge) + (m - 0.5) * 0.1),
    r: mix(1, 0.88, inS),
  };
};
const grass: Pattern = (u, v) => {
  const patch = fbm(u, v, 3, 3, 4, 141);
  const base = mix3(
    mix3(hex(0x4b7a2f), hex(0x6b9640), smooth(0.35, 0.65, patch)),
    hex(0x7a8d45),
    smooth(0.68, 0.85, fbm(u, v, 5, 5, 3, 142)) * 0.5,
  );
  // (blades: short strokes standing up the texture, their tips lighter)
  const blade = fbm(u, v, 260, 40, 2, 143);
  const tip = smooth(0.55, 0.85, blade);
  const gap = smooth(0.35, 0.15, blade);
  const c = mul3(base, 0.85 + tip * 0.3 - gap * 0.3);
  return { c, h: blade, r: 1 };
};
const dirt: Pattern = (u, v) => {
  const m = fbm(u, v, 4, 4, 5, 151);
  const base = mix3(hex(0x5c4430), hex(0x80634a), m);
  const p = cells(u, v, 50, 152, 0.9);
  const isStone = hash(p.id, 0, 153) < 0.4;
  const stone = isStone ? 1 - smooth(0.12, 0.3, p.f1) : 0;
  const lit = clamp(0.5 - p.dy * 2); // (lit from above the texture: a rounded stone)
  const sc = mul3(hex(0x8a8276), 0.8 + lit * 0.35 + (hash(p.id, 1, 154) - 0.5) * 0.3);
  const grain = (fbm(u, v, 128, 128, 1, 155) - 0.5) * 0.08;
  return { c: mix3(mul3(base, 1 + grain), sc, stone), h: clamp(0.3 + m * 0.3 + stone * 0.5), r: 1 - stone * 0.15 };
};
const bark: Pattern = (u, v) => {
  // (plates up the trunk, between them deep fissures — u around it, v up)
  const w = fbm(u, v, 3, 2, 3, 161);
  const ridge = Math.abs(fbm(fract(u + w * 0.15), v, 10, 2, 4, 162) - 0.5) * 2;
  const fiss = smooth(0.0, 0.3, ridge);
  const plate = fbm(u, v, 12, 6, 3, 163);
  const c0 = mix3(hex(0x2d241b), mix3(hex(0x5e4f40), hex(0x7d6c5a), plate), fiss);
  const lichen = smooth(0.74, 0.8, fbm(u, v, 8, 8, 3, 164)) * fiss;
  return { c: mix3(c0, hex(0x8d9478), lichen * 0.6), h: fiss * (0.7 + 0.3 * plate), r: 1 };
};
const foliage: Pattern = (u, v) => {
  // (overlapping leaves: each cell's leaf an ellipse at its own angle, the nearest on top; the
  // shadows between them deep)
  const N = 20;
  const x = u * N;
  const y = v * N;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = -1;
  let bh = 0;
  let bc: V3 = hex(0x1b2a12);
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = mod(xi + i, N);
      const cy = mod(yi + j, N);
      const s = hash(cx, cy, 171);
      const px = xi + i + 0.5 + (hash(cx, cy, 172) - 0.5) * 0.8;
      const py = yi + j + 0.5 + (hash(cx, cy, 173) - 0.5) * 0.8;
      const a = hash(cx, cy, 174) * Math.PI;
      const dx = x - px;
      const dy = y - py;
      const lx = dx * Math.cos(a) + dy * Math.sin(a);
      const ly = -dx * Math.sin(a) + dy * Math.cos(a);
      const d = (lx / 0.85) ** 2 + (ly / 0.42) ** 2;
      if (d < 1 && s > best) {
        best = s;
        const dome = Math.sqrt(1 - d);
        const lit = clamp(0.55 - ly * 0.5 + dome * 0.3);
        const leafC = mix3(hex(0x3d6a26), hex(0x6e9a3c), hash(cx, cy, 175));
        const vein = Math.exp(-((ly / 0.03) ** 2)) * 0.12;
        bc = mul3(leafC, 0.6 + lit * 0.55 + vein);
        bh = 0.4 + 0.6 * dome;
      }
    }
  return { c: bc, h: best < 0 ? 0 : bh, r: best < 0 ? 1 : 0.7 };
};

const PATTERNS: Record<MatId, Pattern> = {
  oak: woodField(WOODS.oak),
  walnut: woodField(WOODS.walnut),
  pine: woodField(WOODS.pine),
  cherry: woodField(WOODS.cherry),
  birch: woodField(WOODS.birch),
  ash: woodField(WOODS.ash),
  "floor-oak": floorboards(WOODS.oak),
  "floor-walnut": floorboards(WOODS.walnut),
  linen: FABRICS.linen,
  twill: FABRICS.twill,
  velvet: FABRICS.velvet,
  boucle: FABRICS.boucle,
  tweed: FABRICS.tweed,
  herringbone: FABRICS.herringbone,
  leather,
  "metal-brushed": metalBrushed,
  "metal-cast": metalCast,
  "metal-polished": metalPolished,
  plaster,
  "wallpaper-stripe": wallpaperStripe,
  "wallpaper-damask": wallpaperDamask,
  "tile-floor": tiles(2, 0.012, 0.15, 181),
  "tile-wall": tiles(4, 0.02, 0.35, 182),
  carpet,
  brick,
  "roof-slate": roofSlate,
  concrete,
  asphalt,
  paving,
  grass,
  dirt,
  bark,
  foliage,
};

/** How deep a family's crevices shade (the orm's R: what ambient light reaches). */
const CREVICE: Record<MatDef["family"], number> = {
  wood: 0.15,
  floor: 0.5,
  fabric: 0.3,
  leather: 0.3,
  metal: 0.2,
  wall: 0.15,
  tile: 0.6,
  carpet: 0.35,
  masonry: 0.6,
  ground: 0.45,
  plant: 0.6,
};

// ── PNG ─────────────────────────────────────────────────────────────────────────────────────────

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(new Uint8Array(out.subarray(4, 8 + data.length))), 8 + data.length);
  return out;
}
function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // (RGB)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

// ── a material's maps ───────────────────────────────────────────────────────────────────────────

interface Maps {
  n: number;
  albedo: Float32Array; // rgb sRGB 0…1
  height: Float32Array;
  rough: Float32Array;
}
function paint(id: MatId): Maps {
  const n = LIBRARY[id].px;
  const f = PATTERNS[id];
  const albedo = new Float32Array(n * n * 3);
  const height = new Float32Array(n * n);
  const rough = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      // (pixel centres: u, v in 0…1, row 0 at v 0 — KTX2 isn't flipped, UV (0, 0) is the first row)
      const p = f((x + 0.5) / n, (y + 0.5) / n);
      const i = y * n + x;
      albedo[i * 3] = p.c[0];
      albedo[i * 3 + 1] = p.c[1];
      albedo[i * 3 + 2] = p.c[2];
      height[i] = p.h;
      rough[i] = p.r;
    }
  return { n, albedo, height, rough };
}

/** Half size: 2 × 2 averaged (the albedo in linear light). */
function halve(m: Maps): Maps {
  const n = m.n / 2;
  const albedo = new Float32Array(n * n * 3);
  const height = new Float32Array(n * n);
  const rough = new Float32Array(n * n);
  const lin = (c: number) => c ** 2.2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const o = y * n + x;
      const at = [
        2 * y * m.n + 2 * x,
        2 * y * m.n + 2 * x + 1,
        (2 * y + 1) * m.n + 2 * x,
        (2 * y + 1) * m.n + 2 * x + 1,
      ];
      for (let k = 0; k < 3; k++)
        albedo[o * 3 + k] = (at.reduce((s, i) => s + lin(m.albedo[i * 3 + k]), 0) / 4) ** (1 / 2.2);
      height[o] = at.reduce((s, i) => s + m.height[i], 0) / 4;
      rough[o] = at.reduce((s, i) => s + m.rough[i], 0) / 4;
    }
  return { n, albedo, height, rough };
}

const byte = (x: number) => Math.round(clamp(x) * 255);

function encode(id: MatId, m: Maps, half: boolean) {
  const def = LIBRARY[id];
  const n = m.n;
  const al = new Uint8Array(n * n * 3);
  const orm = new Uint8Array(n * n * 3);
  const crev = CREVICE[def.family];
  for (let i = 0; i < n * n; i++) {
    for (let k = 0; k < 3; k++) al[i * 3 + k] = byte(m.albedo[i * 3 + k]);
    orm[i * 3] = byte(1 - crev * (1 - m.height[i]) ** 2);
    orm[i * 3 + 1] = byte(m.rough[i]);
    orm[i * 3 + 2] = byte(def.metalness > 0 ? 1 : 0);
  }
  // the normal map at half the albedo's size: the painted look's relief is soft, and the normals were
  // four fifths of the library's download at full size
  const nn = n / 2;
  const hh = new Float32Array(nn * nn);
  for (let y = 0; y < nn; y++)
    for (let x = 0; x < nn; x++)
      hh[y * nn + x] =
        (m.height[2 * y * n + 2 * x] +
          m.height[2 * y * n + 2 * x + 1] +
          m.height[(2 * y + 1) * n + 2 * x] +
          m.height[(2 * y + 1) * n + 2 * x + 1]) /
        4;
  const nm = new Uint8Array(nn * nn * 3);
  // (per texel: a smaller map's steps are taller, so a gain by its size keeps the slopes)
  const gain = 6 * (nn / 256);
  for (let y = 0; y < nn; y++)
    for (let x = 0; x < nn; x++) {
      const i = y * nn + x;
      const hx = hh[y * nn + ((x + 1) % nn)] - hh[y * nn + ((x + nn - 1) % nn)];
      const hy = hh[((y + 1) % nn) * nn + x] - hh[((y + nn - 1) % nn) * nn + x];
      let nx = -hx * 0.5 * gain;
      let ny = -hy * 0.5 * gain;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      nm[i * 3] = byte(nx * 0.5 + 0.5);
      nm[i * 3 + 1] = byte(ny * 0.5 + 0.5);
      nm[i * 3 + 2] = byte(nz * 0.5 + 0.5);
    }
  const out: [string, Uint8Array, string[], number][] = [
    ["albedo", al, [], n],
    ["orm", orm, ["-linear"], n],
    ["normal", nm, ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "1.5", "-normal_map", "-mip_renorm"], nn],
  ];
  for (const [kind, data, flags, side] of out) {
    const file = matFile(id, kind as "albedo", half).replace(".ktx2", ".png");
    const p = join(pngDir, file);
    writeFileSync(p, png(side, side, data));
    if (ktx)
      execFileSync(
        BASISU,
        ["-ktx2", "-mipmap", "-quiet", ...flags, p, "-output_file", join(OUT, matFile(id, kind as "albedo", half))],
        {
          stdio: ["ignore", "ignore", "inherit"],
        },
      );
  }
}

mkdirSync(pngDir, { recursive: true });
mkdirSync(OUT, { recursive: true });
for (const id of MAT_IDS) {
  if (only && !only.includes(id)) continue;
  const t0 = Date.now();
  const m = paint(id);
  encode(id, m, false);
  encode(id, halve(m), true);
  console.log(`${id}: ${m.n}px, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(`pngs in ${pngDir}${ktx ? `, ktx2 in ${OUT}` : ""}`);
