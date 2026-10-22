// The pool balls' look, one source for both views: what colour a ball is in
// any direction from its centre (its own frame: the stripe's band round its z
// equator, the number discs on ±x, the cue ball's red dots on all six axes so
// its spin shows), shaded per pixel into small sprites for the iso view (turned
// as the physics turns them) and painted into a sphere texture for 3D.
//
// Frames: the physics' table frame (x along, y up the plan, z up) → three.js'
// world (X = tile x, Y = up, Z = tile y) is a quarter turn about X; the table's
// own turn (rot) is quarter turns about Y. Ball local → three = qRot·qBase·qBall.

export type Q = [number, number, number, number]; // x, y, z, w
export type V3 = [number, number, number];

const HEX: Record<number, string> = {
  1: "#f2b21c",
  2: "#1f4ea8",
  3: "#c8322b",
  4: "#56307f",
  5: "#e8691b",
  6: "#1d7748",
  7: "#7b2331",
  8: "#141414",
};
export const ballHex = (id: number) => (id === 0 ? "#f3eee0" : HEX[id > 8 ? id - 8 : id]);
const rgb = (h: string): V3 => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const IVORY: V3 = [243, 238, 224];
const INK: V3 = [24, 20, 18];
const DOT: V3 = [196, 48, 43];
const COS_DISC = Math.cos(0.43);
const SIN_DISC = Math.sin(0.43);
const COS_DOT = Math.cos(0.16);
const STRIPE = 0.47; // |z| past this: the stripe's white caps
// edges are blended over this much of the surface (a pixel or so of the 3D
// texture, of the iso sprite): no stair-steps round the stripe, discs, dots
const SOFT = 0.012;
const smooth = (e: number) => Math.max(0, Math.min(1, 0.5 + e / SOFT));
const mix = (a: V3, b: V3, k: number): V3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

// the numbers, as masks (drawn once by the browser's own font, read smoothly)
const masks = new Map<number, Float32Array>();
const MASK = 96;
function mask(id: number): Float32Array | null {
  if (typeof document === "undefined") return null;
  const have = masks.get(id);
  if (have) return have;
  const c = document.createElement("canvas");
  c.width = c.height = MASK;
  const g = c.getContext("2d");
  const out = new Float32Array(MASK * MASK);
  if (g) {
    g.fillStyle = "#000";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const k = MASK / 40;
    g.font = `700 ${(id > 9 ? 22 : 28) * k}px "Inter", "Helvetica Neue", Arial, sans-serif`;
    g.fillText(String(id), MASK / 2, MASK / 2 + 1.5 * k);
    // a 6 and a 9 get their underline
    if (id === 6 || id === 9) g.fillRect(MASK / 2 - 6 * k, MASK / 2 + 12 * k, 12 * k, 2.5 * k);
    const d = g.getImageData(0, 0, MASK, MASK).data;
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] / 255;
  }
  masks.set(id, out);
  return out;
}

// the number mask read between its pixels (u, v: 0..1 across it)
function inkAt(mk: Float32Array, u: number, v: number): number {
  const fx = Math.max(0, Math.min(MASK - 1.001, u * MASK - 0.5));
  const fy = Math.max(0, Math.min(MASK - 1.001, v * MASK - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const ax = fx - x0;
  const ay = fy - y0;
  const a = mk[y0 * MASK + x0];
  const b = mk[y0 * MASK + x0 + 1];
  const c = mk[(y0 + 1) * MASK + x0];
  const d = mk[(y0 + 1) * MASK + x0 + 1];
  return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
}

// The ball's colour (0..255) in local direction n (unit).
export function ballRGB(id: number, nx: number, ny: number, nz: number): V3 {
  if (id === 0) {
    // ivory, with a red dot on each axis
    const m = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
    return mix(IVORY, DOT, smooth(m - COS_DOT));
  }
  const stripe = id > 8;
  const colour = rgb(ballHex(id));
  const base: V3 = stripe ? mix(colour, IVORY, smooth(Math.abs(nz) - STRIPE)) : colour;
  // the number discs on +x and −x
  const ax = Math.abs(nx);
  if (ax > COS_DISC - SOFT) {
    const u = (nx > 0 ? ny : -ny) / SIN_DISC; // −1..1 across the disc
    const v = -nz / SIN_DISC;
    const mk = mask(id);
    const ink = mk ? inkAt(mk, u * 0.5 + 0.5, v * 0.5 + 0.5) : 0;
    const disc = mix(IVORY, INK, ink);
    return mix(base, disc, smooth(ax - COS_DISC));
  }
  return base;
}

// ── quaternions ──────────────────────────────────────────────────────────────
export const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const H = Math.SQRT1_2;
const Q_BASE: Q = [-H, 0, 0, H]; // table frame → three: −90° about X
const qRot = (rot: number): Q => {
  const a = (-Math.PI / 4) * (rot & 3);
  return [0, Math.sin(a), 0, Math.cos(a)];
};
// a ball's turn in three's world, from the physics' (table frame)
export const ballQuat = (q: Q, rot: number): Q => qmul(qmul(qRot(rot), Q_BASE), q);
// rotate v by the inverse of q (three's world → the ball's own frame)
function unrotate(q: Q, v: V3): V3 {
  const [x, y, z, w] = [-q[0], -q[1], -q[2], q[3]];
  // v' = q v q*, with q the conjugate
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

// ── iso sprites ──────────────────────────────────────────────────────────────
// The iso camera (three's world): screen right, screen up, and towards the
// viewer (30° down, from +x +y).
const E = Math.PI / 6;
const R_: V3 = [H, 0, -H];
const U_: V3 = [-Math.sin(E) * H, Math.cos(E), -Math.sin(E) * H];
const V_: V3 = [Math.cos(E) * H, Math.sin(E), Math.cos(E) * H];
// the light: over the table (the lamp) and a little from the upper left
const L_ = (() => {
  const l: V3 = [R_[0] * -0.35 + U_[0] * 0.55 + V_[0] * 0.35, 0.9, R_[2] * -0.35 + U_[2] * 0.55 + V_[2] * 0.35];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n] as V3;
})();

export const CELL = 44; // px per ball sprite in the atlas
export const ATLAS_COLS = 4;

// Paint one ball into its cell of the atlas, turned `q` (three's world).
export function paintIso(img: ImageData, cell: number, id: number, q: Q) {
  const S = CELL;
  const x0 = (cell % ATLAS_COLS) * S;
  const y0 = Math.floor(cell / ATLAS_COLS) * S;
  const d = img.data;
  const W = img.width;
  const rad = S / 2 - 1;
  // half vector for the highlight
  const hx = L_[0] + V_[0];
  const hy = L_[1] + V_[1];
  const hz = L_[2] + V_[2];
  const hn = Math.hypot(hx, hy, hz);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const o = ((y0 + j) * W + x0 + i) * 4;
      const px = (i + 0.5 - S / 2) / rad;
      const py = -(j + 0.5 - S / 2) / rad;
      const rr = px * px + py * py;
      if (rr > 1.06) {
        d[o + 3] = 0;
        continue;
      }
      const r = Math.min(1, rr);
      const nz = Math.sqrt(1 - r);
      // the surface's normal in three's world
      const n: V3 = [
        px * R_[0] + py * U_[0] + nz * V_[0],
        px * R_[1] + py * U_[1] + nz * V_[1],
        px * R_[2] + py * U_[2] + nz * V_[2],
      ];
      const loc = unrotate(q, n);
      const c = ballRGB(id, loc[0], loc[1], loc[2]);
      const lam = Math.max(0, n[0] * L_[0] + n[1] * L_[1] + n[2] * L_[2]);
      const spec = Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hn) ** 46;
      const shade = 0.42 + 0.68 * lam;
      const rim = 0.82 + 0.18 * nz;
      // the outline (the kit's ink) on the very edge, anti-aliased off it
      const edge = Math.sqrt(rr);
      const ink = Math.max(0, Math.min(1, (edge - 0.9) / 0.08));
      const alpha = Math.max(0, Math.min(1, (1.03 - edge) / 0.05));
      for (let k = 0; k < 3; k++) {
        const lit = c[k] * shade * rim + 255 * spec * 0.85;
        d[o + k] = Math.min(255, lit * (1 - ink * 0.75) + 42 * ink * 0.75);
      }
      d[o + 3] = Math.round(alpha * 255);
    }
}

// ── 3D texture ───────────────────────────────────────────────────────────────
// An equirectangular map for three's SphereGeometry (u round from −x, v from +y).
export function paintSphere(id: number, w = 512, h = 256): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const th = ((j + 0.5) / h) * Math.PI;
    const st = Math.sin(th);
    const ct = Math.cos(th);
    for (let i = 0; i < w; i++) {
      const ph = ((i + 0.5) / w) * Math.PI * 2;
      const n: V3 = [-Math.cos(ph) * st, ct, Math.sin(ph) * st];
      const col = ballRGB(id, n[0], n[1], n[2]);
      const o = (j * w + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
