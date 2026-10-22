import type { G, V } from "./campus";

// Snow that settled (docs/plan/33-the-look.md, phase 2): what falls, lies — on
// roofs with a lip curled over the eaves and icicles under them, on flat roofs
// and awnings in lumps, in drifts banked up against the walls, in the plough's
// banks along every road — instead of white slabs and strings of beads. All of
// it faceted (the look), lumpy by a smooth noise along its run, standing on the
// ground where it is.

export const SNOW = 0xf4f7fa;
const ICE = 0xdbe7f0;

type Rng = () => number;
type YAt = (x: number, z: number) => number;

/** A face from four corners, its normal its own: turned up, or towards `out`. */
export function face(g: G, a: V, b: V, c: V, d: V, out: V = [0, 1, 0]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n: V = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  n = [n[0] / l, n[1] / l, n[2] / l];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
  g.quad(a, b, c, d, n);
}

/** Smooth noise along a run, −1..1: random knots every `step`, eased between (t ≥ 0). */
export function wobble(r: Rng, step = 2.5): (t: number) => number {
  const knots: number[] = [];
  return (t) => {
    const i = Math.max(0, Math.floor(t / step));
    while (knots.length <= i + 1) knots.push(r() * 2 - 1);
    const f = t / step - i;
    const e = f * f * (3 - 2 * f);
    return knots[i] * (1 - e) + knots[i + 1] * e;
  };
}

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A station along a ridge: where, which way is "out", how big (0: none, down in the ground). */
export interface Station {
  x: number;
  z: number;
  nx: number;
  nz: number;
  k: number;
}

/** A ridge of snow along stations: its cross-section `prof` ([out from the line, up]), the
 *  heights scaled by each station's k, standing on the ground. */
export function ridge(g: G, st: Station[], prof: [number, number][], yAt: YAt) {
  g.color(SNOW);
  const P = st.map((s) =>
    prof.map(([o, h]): V => {
      const x = s.x + s.nx * o;
      const z = s.z + s.nz * o;
      return [x, yAt(x, z) - 0.06 + Math.max(h * s.k, -0.1), z];
    }),
  );
  for (let i = 0; i + 1 < st.length; i++) {
    if (st[i].k <= 0 && st[i + 1].k <= 0) continue;
    for (let j = 0; j + 1 < prof.length; j++) face(g, P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]);
  }
}

/** Snow drifted against a wall from a to b, banked up on its `n` side; none where `skip` says
 *  (a door), tapering off at both ends. */
export function driftAlong(
  g: G,
  a: [number, number],
  b: [number, number],
  n: [number, number],
  yAt: YAt,
  r: Rng,
  o: { h: number; w: number; skip?: (x: number, z: number) => boolean },
) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.5) return;
  const steps = Math.max(2, Math.ceil(len / 0.8));
  const big = wobble(r, 2.6);
  const small = wobble(r, 1.1);
  const st: Station[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (len * i) / steps;
    const x = a[0] + ((b[0] - a[0]) * t) / len;
    const z = a[1] + ((b[1] - a[1]) * t) / len;
    let k = (0.72 + 0.3 * big(t) + 0.12 * small(t)) * ease(0, 1.4, t) * ease(0, 1.4, len - t);
    if (o.skip?.(x + n[0] * 0.6, z + n[1] * 0.6)) k = 0;
    st.push({ x: x + n[0] * 0.03, z: z + n[1] * 0.03, nx: n[0], nz: n[1], k });
  }
  ridge(
    g,
    st,
    [
      [0, o.h],
      [o.w * 0.3, o.h * 0.85],
      [o.w * 0.65, o.h * 0.4],
      [o.w, -1],
    ],
    yAt,
  );
}

/** The plough's bank along a line (sampled about a tile apart), `off` out on its `side`. */
export function bankAlong(
  g: G,
  line: [number, number][],
  off: number,
  side: 1 | -1,
  yAt: YAt,
  r: Rng,
  o: { h: number; w: number; skip?: (x: number, z: number, i: number) => boolean },
) {
  const big = wobble(r, 3.5);
  const small = wobble(r, 1.2);
  const st: Station[] = [];
  let t = 0;
  for (let i = 0; i < line.length; i++) {
    const [px, pz] = line[Math.max(0, i - 1)];
    const [qx, qz] = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(qx - px, qz - pz) || 1;
    const nx = (-(qz - pz) / l) * side;
    const nz = ((qx - px) / l) * side;
    if (i > 0) t += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    const x = line[i][0] + nx * off;
    const z = line[i][1] + nz * off;
    const k = o.skip?.(x, z, i) ? 0 : Math.max(0, 0.75 + 0.35 * big(t) + 0.15 * small(t));
    st.push({ x, z, nx, nz, k });
  }
  ridge(
    g,
    st,
    [
      [-o.w * 0.5, -1],
      [-o.w * 0.25, o.h * 0.75],
      [0, o.h],
      [o.w * 0.3, o.h * 0.7],
      [o.w * 0.65, o.h * 0.2],
      [o.w * 0.9, -1],
    ],
    yAt,
  );
}

/** Icicles hanging under an edge from a to b (a few, odd lengths, now and then a long one). */
export function icicles(g: G, a: V, b: V, r: Rng, rate = 0.5) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  g.color(ICE);
  for (let t = 0.15 + r() * 0.3; t < len - 0.1; t += 0.18 + r() * 0.45) {
    if (r() > rate) continue;
    const f = t / len;
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    const z = a[2] + (b[2] - a[2]) * f;
    const L = r() < 0.12 ? 0.5 + r() * 0.5 : 0.1 + r() * 0.3;
    const w = 0.035 + L * 0.06;
    const tip: V = [x, y - L, z];
    const c: V[] = [0, 1, 2].map((k) => {
      const an = (k / 3) * Math.PI * 2 + r();
      return [x + Math.cos(an) * w, y, z + Math.sin(an) * w];
    });
    for (let k = 0; k < 3; k++) {
      const p = c[k];
      const q = c[(k + 1) % 3];
      const mid: V = [(p[0] + q[0]) / 2 - x, 0, (p[2] + q[2]) / 2 - z];
      face(g, p, q, tip, tip, mid);
    }
  }
}

/** Snow on a slope (a roof's, an awning's, a porch's): from its high edge h0→h1 down to its
 *  low edge l0→l1 (the surface it lies on), `t` thick, lumpy along the eave, a lip curled
 *  over the low edge and icicles under it. */
export function slopeSnow(g: G, h0: V, h1: V, l0: V, l1: V, t: number, r: Rng, ice = 0.5) {
  const sub = (p: V, q: V): V => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const add = (p: V, q: V, k = 1): V => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k];
  const lerp = (p: V, q: V, f: number): V => add(p, sub(q, p), f);
  const norm = (p: V): V => {
    const l = Math.hypot(...p) || 1;
    return [p[0] / l, p[1] / l, p[2] / l];
  };
  const along = sub(h1, h0);
  const down = norm(sub(l0, h0));
  let N = norm([
    along[1] * down[2] - along[2] * down[1],
    along[2] * down[0] - along[0] * down[2],
    along[0] * down[1] - along[1] * down[0],
  ]);
  if (N[1] < 0) N = [-N[0], -N[1], -N[2]];
  const len = Math.hypot(...along);
  const n = Math.max(1, Math.round(len / 1.1));
  const lumps = wobble(r, 1.6);
  const hi: V[] = [];
  const lo: V[] = [];
  const lipA: V[] = [];
  const lipB: V[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const end = i === 0 || i === n ? 0.75 : 1;
    const th = t * 0.9 * end;
    const tl = t * (1 + 0.35 * lumps(f * len)) * end;
    const H = lerp(h0, h1, f);
    const L = lerp(l0, l1, f);
    hi.push(add(H, N, th));
    lo.push(add(L, N, tl));
    // the lip: over the edge and down a little
    lipA.push(add(add(L, down, 0.1 + tl * 0.4), [0, -1, 0], tl * 0.35));
    lipB.push(add(add(L, down, 0.04), [0, -1, 0], tl * 0.7));
  }
  g.color(SNOW);
  for (let i = 0; i < n; i++) {
    face(g, hi[i], hi[i + 1], lo[i + 1], lo[i], N);
    face(g, lo[i], lo[i + 1], lipA[i + 1], lipA[i], add(N, down));
    face(g, lipA[i], lipA[i + 1], lipB[i + 1], lipB[i], down);
  }
  // its two ends: the snow's thickness seen from the side
  for (const [i, s] of [
    [0, -1],
    [n, 1],
  ] as const) {
    const out: V = [along[0] * s, along[1] * s, along[2] * s];
    const H = lerp(h0, h1, i / n);
    const L = lerp(l0, l1, i / n);
    face(g, H, L, lo[i], hi[i], out);
  }
  if (ice > 0) icicles(g, lerp(lipB[0], lipB[n], 0.02), lerp(lipB[0], lipB[n], 0.98), r, ice);
}

/** Snow on a flat top from (x0, z0) to (x1, z1) at y: lumps on a ~2-tile grid, lower at its
 *  edges (rounded off), skirted down to the roof. */
export function flatSnow(g: G, x0: number, z0: number, x1: number, z1: number, y: number, t: number, r: Rng) {
  const nx = Math.max(1, Math.round((x1 - x0) / 2));
  const nz = Math.max(1, Math.round((z1 - z0) / 2));
  const h: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    h.push([]);
    for (let j = 0; j <= nz; j++) {
      const edge = i === 0 || j === 0 || i === nx || j === nz;
      h[i].push(y + t * (edge ? 0.55 + r() * 0.2 : 0.85 + r() * 0.45));
    }
  }
  const P = (i: number, j: number): V => [x0 + ((x1 - x0) * i) / nx, h[i][j], z0 + ((z1 - z0) * j) / nz];
  g.color(SNOW);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) face(g, P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
  const base = (p: V): V => [p[0], y - 0.02, p[2]];
  for (let i = 0; i < nx; i++) {
    face(g, base(P(i, 0)), base(P(i + 1, 0)), P(i + 1, 0), P(i, 0), [0, 0, -1]);
    face(g, base(P(i, nz)), base(P(i + 1, nz)), P(i + 1, nz), P(i, nz), [0, 0, 1]);
  }
  for (let j = 0; j < nz; j++) {
    face(g, base(P(0, j)), base(P(0, j + 1)), P(0, j + 1), P(0, j), [-1, 0, 0]);
    face(g, base(P(nx, j)), base(P(nx, j + 1)), P(nx, j + 1), P(nx, j), [1, 0, 0]);
  }
}
