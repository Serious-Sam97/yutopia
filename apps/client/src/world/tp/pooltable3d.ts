import { Color, ShapeUtils, Vector2 } from "three";
import { type Out, zt } from "./kit3d";

// The pool table in 3D, its own model (the iso view draws the item's sketch,
// art/items/gametables.ts; this is the same table, built for being looked at
// from any side and from right over it while you play):
//   · the six pockets are real holes — the cloth, the cushions and the rails
//     bitten round each one, a leather throat going down into the dark and a
//     cup at the bottom, so a ball going down is seen going down (tables/pool.ts
//     drops it POCKET_DEPTH into them);
//   · cushions shaped like cushions: a nose at the height that meets a ball,
//     sloping back up to the rail, cut along the pockets' jaws;
//   · walnut rails rounded over on the outside, brass irons round the pockets,
//     mother-of-pearl sights; an apron with raised panels, turned legs, the
//     ball-return trough at the foot end.
// Flat facets with the kit's ink on the main edges (the world's look). Written
// into the build's own buffers (Out), so it is lit, shadowed, picked and faded
// like any other item.
//
// Item tiles at rot 0: x along its 4 tiles, y across its 2, height in tiles.
// Sizes are the game's (shared/tables.ts, shared/pool.ts), copied here so the
// 3D chunk doesn't take those modules in.

const TPM = 1.55; // tiles per metre on this table
const W = 4;
const H = 2;
const CX = W / 2;
const CY = H / 2;
const HL = (1.981 / 2) * TPM; // cloth, nose to nose
const HW = (0.991 / 2) * TPM;
const X0 = CX - HL;
const X1 = CX + HL;
const Y0 = CY - HW;
const Y1 = CY + HW;
const CUSH = 0.05 * TPM; // nose → the cushion's back
const RAIL = 0.1 * TPM; // wood beyond it
const BX0 = X0 - CUSH; // the cushions' backs (the rails' inside)
const BX1 = X1 + CUSH;
const BY0 = Y0 - CUSH;
const BY1 = Y1 + CUSH;
const OX0 = BX0 - RAIL; // the rails' outside
const OX1 = BX1 + RAIL;
const OY0 = BY0 - RAIL;
const OY1 = BY1 + RAIL;

// heights (tiles): the cloth at the item's furniture height, what's above it to scale
const ZC = zt(25); // the cloth (TABLES.pool_table.top, px)
const ZN = ZC + 0.036 * TPM; // the cushion's nose: where it meets a ball (63% of one up)
const ZB = ZC + 0.042 * TPM; // the cushion's back
const ZR = ZC + 0.046 * TPM; // the rail's top
const ZA = ZC - 0.05; // the rail's underside (the apron's top, hidden under it)
const ZP = zt(15.5); // the apron's bottom
const POCKET_DEEP = 0.085 * TPM; // tables/pool.ts POCKET_DEPTH (m), in tiles
const ZT = ZC - POCKET_DEEP; // the throat's bottom
const RR = 0.022; // the rail's rounded outer edge

// the pockets' holes: a corner's 18 mm out past the cloth's corner, a side's
// 45 mm out past the edge (shared/pool.ts), radius as the iso art draws them
interface Hole {
  x: number;
  y: number;
  r: number;
}
const PC = 0.018 * TPM;
const PS = 0.045 * TPM;
const HOLES: Hole[] = [
  { x: X0 - PC, y: Y0 - PC, r: 0.105 },
  { x: CX, y: Y0 - PS, r: 0.098 },
  { x: X1 + PC, y: Y0 - PC, r: 0.105 },
  { x: X0 - PC, y: Y1 + PC, r: 0.105 },
  { x: CX, y: Y1 + PS, r: 0.098 },
  { x: X1 + PC, y: Y1 + PC, r: 0.105 },
];

// the jaws: the cushions stop at noses either side of each mouth and are cut
// back along the jaw, at an angle to their face (shared/pool.ts)
const CORNER_NOSE = (0.116 / Math.SQRT2) * TPM; // along the cushion from the corner
const SIDE_NOSE = (0.132 / 2) * TPM; // either side of a side pocket's middle
const CORNER_JAW = (142 * Math.PI) / 180;
const SIDE_JAW = (104 * Math.PI) / 180;

// the cloths and their wood (as the iso art: green, blue, wine)
const LOOKS: { cloth: string; wood: string; woodDark: string }[] = [
  { cloth: "#2f6a4c", wood: "#5b3a26", woodDark: "#3e2718" },
  { cloth: "#2c587a", wood: "#3a2a20", woodDark: "#2a1d15" },
  { cloth: "#7b2f3b", wood: "#8a5a36", woodDark: "#6a4128" },
];

type P2 = [number, number];
type V3 = [number, number, number];
type C4 = [number, number, number, number];

const tmp = new Color();
const col = (hex: string, k = 1, a = 1): C4 => {
  tmp.setStyle(hex);
  return [tmp.r * k, tmp.g * k, tmp.b * k, a];
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// ── plan geometry ────────────────────────────────────────────────────────────
function inPoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inHole = (p: P2, h: Hole, pad = 0) => Math.hypot(p[0] - h.x, p[1] - h.y) < h.r + pad;

// A polygon's outline with the holes bitten out of it (`out`: false) — or
// added to it (`out`: true, the outline of the polygon and the holes together).
// Each point says which hole's arc it is on (−1: on the polygon's own edge).
function bite(poly: P2[], holes: Hole[], out: boolean): { p: P2; arc: number }[] {
  const pts: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.004));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const which = (p: P2) => holes.findIndex((h) => inHole(p, h));
  const k0 = pts.findIndex((p) => which(p) < 0);
  const walk = [...pts.slice(k0), ...pts.slice(0, k0)];
  const res: { p: P2; arc: number }[] = [];
  let i = 0;
  while (i < walk.length) {
    const hi = which(walk[i]);
    if (hi < 0) {
      res.push({ p: walk[i], arc: -1 });
      i++;
      continue;
    }
    const h = holes[hi];
    let j = i;
    while (j < walk.length && which(walk[j]) === hi) j++;
    const a0 = Math.atan2(walk[i][1] - h.y, walk[i][0] - h.x);
    const e = walk[j % walk.length];
    const a1 = Math.atan2(e[1] - h.y, e[0] - h.x);
    let ccw = a1 - a0;
    while (ccw <= 0) ccw += Math.PI * 2;
    const mid = a0 + ccw / 2;
    const midIn = inPoly([h.x + Math.cos(mid) * h.r, h.y + Math.sin(mid) * h.r], poly);
    // through the polygon (a bite), or round outside it (the union's outline)
    const span = midIn !== out ? ccw : ccw - Math.PI * 2;
    const n = Math.max(6, Math.ceil((Math.abs(span) * h.r) / 0.006));
    for (let k = 0; k <= n; k++) {
      const a = a0 + (span * k) / n;
      res.push({ p: [h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r], arc: hi });
    }
    i = j;
  }
  return res;
}

function triangulate(contour: P2[], holes: P2[][] = []): number[][] {
  const v = (p: P2) => new Vector2(p[0], p[1]);
  let c = contour.map(v);
  if (ShapeUtils.isClockWise(c)) c = c.reverse();
  const hs = holes.map((h) => {
    const hv = h.map(v);
    return ShapeUtils.isClockWise(hv) ? hv : hv.reverse();
  });
  const all = [...c, ...hs.flat()];
  // each triangle as its corners' x, y
  return ShapeUtils.triangulateShape(c, hs).map((t) => [
    all[t[0]].x,
    all[t[0]].y,
    all[t[1]].x,
    all[t[1]].y,
    all[t[2]].x,
    all[t[2]].y,
  ]);
}

// the cushions in plan: from nose to nose along each rail, cut back along the
// jaws to the cushion's back line; and their outward normal (off the cloth)
interface Cushion {
  poly: P2[];
  o: P2; // out, off the cloth
  nose: number; // the nose line, along `o` (x or y)
}
function cushions(): Cushion[] {
  const one = (a: P2, ua: P2, angA: number, b: P2, ub: P2, angB: number, o: P2): Cushion => {
    const jaw = (p: P2, u: P2, ang: number): P2 => {
      const jx = u[0] * Math.cos(ang) + o[0] * Math.sin(ang);
      const jy = u[1] * Math.cos(ang) + o[1] * Math.sin(ang);
      const t = CUSH / Math.sin(ang);
      return [p[0] + jx * t, p[1] + jy * t];
    };
    return { poly: [a, b, jaw(b, ub, angB), jaw(a, ua, angA)], o, nose: o[0] ? a[0] : a[1] };
  };
  return [
    one([X0 + CORNER_NOSE, Y0], [1, 0], CORNER_JAW, [CX - SIDE_NOSE, Y0], [-1, 0], SIDE_JAW, [0, -1]),
    one([CX + SIDE_NOSE, Y0], [1, 0], SIDE_JAW, [X1 - CORNER_NOSE, Y0], [-1, 0], CORNER_JAW, [0, -1]),
    one([X0 + CORNER_NOSE, Y1], [1, 0], CORNER_JAW, [CX - SIDE_NOSE, Y1], [-1, 0], SIDE_JAW, [0, 1]),
    one([CX + SIDE_NOSE, Y1], [1, 0], SIDE_JAW, [X1 - CORNER_NOSE, Y1], [-1, 0], CORNER_JAW, [0, 1]),
    one([X0, Y0 + CORNER_NOSE], [0, 1], CORNER_JAW, [X0, Y1 - CORNER_NOSE], [0, -1], CORNER_JAW, [-1, 0]),
    one([X1, Y0 + CORNER_NOSE], [0, 1], CORNER_JAW, [X1, Y1 - CORNER_NOSE], [0, -1], CORNER_JAW, [1, 0]),
  ];
}
const CUSHIONS = cushions();
// the cushion's height at a point on it: the nose, sloping up to its back
function cushionZ(c: Cushion, p: P2): number {
  const d = c.o[0] ? (p[0] - c.nose) * c.o[0] : (p[1] - c.nose) * c.o[1];
  return ZN + (ZB - ZN) * Math.max(0, Math.min(1, d / CUSH));
}
const inBack = (p: P2) => p[0] > BX0 && p[0] < BX1 && p[1] > BY0 && p[1] < BY1;
// what's under a point of a hole's rim: the rail, a cushion, or the cloth (the mouth)
function rimZ(p: P2): number {
  if (!inBack(p)) return ZR;
  for (const c of CUSHIONS) if (inPoly(p, c.poly)) return cushionZ(c, p);
  return ZC;
}

// ── the builder ──────────────────────────────────────────────────────────────
export function poolTable3(out: Out, at: { x: number; y: number }, rot: number, seed: number) {
  const look = LOOKS[Math.min(LOOKS.length - 1, Math.floor(seed * LOOKS.length))];
  const r = rot & 3;
  // item tiles (rot 0) → the world (three's axes: x, up, y)
  const wp = (x: number, y: number, z: number): V3 => {
    let X = x;
    let Y = y;
    let w = W;
    let h = H;
    for (let i = 0; i < r; i++) {
      [X, Y] = [h - Y, X];
      [w, h] = [h, w];
    }
    return [at.x + X, z, at.y + Y];
  };
  const wn = (n: V3): V3 => {
    let x = n[0];
    let y = n[2];
    for (let i = 0; i < r; i++) [x, y] = [-y, x];
    return [x, n[1], y];
  };
  const g = out.lit;
  // a triangle in item space (x, y, z), lit from `n` (item space; its own face when left out)
  const tri = (a: V3, b: V3, c: V3, ca: C4, cb: C4 = ca, cc: C4 = ca, n?: V3) => {
    const A = wp(a[0], a[1], a[2]);
    const B = wp(b[0], b[1], b[2]);
    const C = wp(c[0], c[1], c[2]);
    // (n comes in item axes x, y, up → three's x, up, y)
    const N = n ? wn([n[0], n[2], n[1]]) : norm(cross(sub(B, A), sub(C, A)));
    const ok = dot(cross(sub(B, A), sub(C, A)), N) >= 0;
    const order: [V3, C4][] = ok
      ? [
          [A, ca],
          [B, cb],
          [C, cc],
        ]
      : [
          [A, ca],
          [C, cc],
          [B, cb],
        ];
    for (const [p, k] of order) {
      g.pos.push(p[0], p[1], p[2]);
      g.nor.push(N[0], N[1], N[2]);
      g.col.push(k[0], k[1], k[2], k[3]);
    }
  };
  // a quad a b c d (going round), facing `n` (item axes), one colour or one per corner
  const quad = (a: V3, b: V3, c: V3, d: V3, n: V3, ca: C4, cb = ca, cc = ca, cd = ca) => {
    tri(a, b, c, ca, cb, cc, n);
    tri(a, c, d, ca, cc, cd, n);
  };
  const ink = col("#2a1a12", 1, 0.5);
  const line = (a: V3, b: V3, alpha = 0.5) => {
    out.lines.push(...wp(a[0], a[1], a[2]), ...wp(b[0], b[1], b[2]));
    const k: C4 = [ink[0], ink[1], ink[2], alpha];
    out.lineCol.push(...k, ...k);
  };
  // a flat polygon at height z (facing up or down)
  const flat = (poly: P2[], z: number, c: C4, up = true, holes: P2[][] = []) => {
    for (const t of triangulate(poly, holes))
      tri([t[0], t[1], z], [t[2], t[3], z], [t[4], t[5], z], c, c, c, [0, 0, up ? 1 : -1]);
  };
  // a box (item tiles), all six faces but the ones asked off
  const box = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    c: C4,
    o: { top?: C4; noTop?: boolean; noBottom?: boolean; inked?: boolean } = {},
  ) => {
    const t = o.top ?? c;
    const side = (k: number): C4 => [c[0] * k, c[1] * k, c[2] * k, c[3]];
    if (!o.noTop) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], t);
    if (!o.noBottom) quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], side(0.6));
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], side(0.94));
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], side(0.97));
    quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], side(0.92));
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], side(0.9));
    if (o.inked) {
      const c4: P2[] = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ];
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = c4[i];
        const [bx, by] = c4[(i + 1) % 4];
        line([ax, ay, z1], [bx, by, z1], 0.45);
        line([ax, ay, z0], [bx, by, z0], 0.45);
        line([ax, ay, z0], [ax, ay, z1], 0.35);
      }
    }
  };

  const cloth = col(look.cloth);
  const wood = col(look.wood);
  const woodDark = col(look.woodDark);
  const brass = col("#b48a3e");
  const pearl = col("#f3ead8");
  const leather = col("#3b2619");
  const dark = col("#0b0807");

  // contact shadow on the floor
  {
    const a = wp(OX0 + 0.1, OY0 + 0.1, 0);
    const b = wp(OX1 - 0.1, OY1 - 0.1, 0);
    out.soft.rects.push({
      x0: Math.min(a[0], b[0]),
      y0: Math.min(a[2], b[2]),
      x1: Math.max(a[0], b[0]),
      y1: Math.max(a[2], b[2]),
      op: 0.42,
      round: 0.3,
    });
  }

  // ── the cloth: the bed's top out to the cushions' backs, bitten round the pockets ──
  const clothRim = bite(
    [
      [BX0, BY0],
      [BX1, BY0],
      [BX1, BY1],
      [BX0, BY1],
    ],
    HOLES,
    false,
  );
  flat(
    clothRim.map((q) => q.p),
    ZC,
    cloth,
  );
  // the head string and the spots (a hair over the cloth)
  {
    const zl = ZC + 0.0015;
    const hs = CX - HL / 2;
    const ivory = col("#f4ecd8", 0.8);
    quad(
      [hs - 0.004, Y0 + 0.02, zl],
      [hs + 0.004, Y0 + 0.02, zl],
      [hs + 0.004, Y1 - 0.02, zl],
      [hs - 0.004, Y1 - 0.02, zl],
      [0, 0, 1],
      col(look.cloth, 1.35),
    );
    for (const x of [hs, CX + HL / 2, CX]) {
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        tri(
          [x, CY, zl],
          [x + Math.cos(a0) * 0.018, CY + Math.sin(a0) * 0.018, zl],
          [x + Math.cos(a1) * 0.018, CY + Math.sin(a1) * 0.018, zl],
          ivory,
          ivory,
          ivory,
          [0, 0, 1],
        );
      }
    }
  }

  // ── the cushions: their tops slope from the nose up to the back; walls down to the cloth ──
  for (const c of CUSHIONS) {
    const rim = bite(c.poly, HOLES, false);
    const top = col(look.cloth, 1.04);
    const face = col(look.cloth, 0.8);
    for (const t of triangulate(rim.map((q) => q.p))) {
      const a: P2 = [t[0], t[1]];
      const b: P2 = [t[2], t[3]];
      const d: P2 = [t[4], t[5]];
      tri(
        [a[0], a[1], cushionZ(c, a)],
        [b[0], b[1], cushionZ(c, b)],
        [d[0], d[1], cushionZ(c, d)],
        top,
        top,
        top,
        norm([-c.o[0] * 0.15, -c.o[1] * 0.15, 1]),
      );
    }
    // the walls round it (not its back on the rail; the bites are the throats')
    const back = (p: P2) =>
      (c.o[0] ? Math.abs(p[0] - (c.nose + c.o[0] * CUSH)) : Math.abs(p[1] - (c.nose + c.o[1] * CUSH))) < 1e-4;
    for (let i = 0; i < rim.length; i++) {
      const A = rim[i];
      const B = rim[(i + 1) % rim.length];
      if (A.arc >= 0 && B.arc >= 0) continue;
      if (back(A.p) && back(B.p)) continue;
      const za = cushionZ(c, A.p);
      const zb = cushionZ(c, B.p);
      // facing out of the cushion
      const ex = B.p[0] - A.p[0];
      const ey = B.p[1] - A.p[1];
      let n: V3 = [ey, -ex, 0];
      const mid: P2 = [(A.p[0] + B.p[0]) / 2 + n[0] * 1e-3, (A.p[1] + B.p[1]) / 2 + n[1] * 1e-3];
      if (inPoly(mid, c.poly)) n = [-ey, ex, 0];
      quad([A.p[0], A.p[1], ZC], [B.p[0], B.p[1], ZC], [B.p[0], B.p[1], zb], [A.p[0], A.p[1], za], norm(n), face);
      line([A.p[0], A.p[1], za], [B.p[0], B.p[1], zb], 0.4);
    }
  }

  // ── the rails: the top (round the pockets, inside the rounded edge), the
  // rounded outer edge down the outside, the step down to the cushions ──
  const outer = (d: number): P2[] => [
    [OX0 + d, OY0 + d],
    [OX1 - d, OY0 + d],
    [OX1 - d, OY1 - d],
    [OX0 + d, OY1 - d],
  ];
  const railHole = bite(
    [
      [BX0, BY0],
      [BX1, BY0],
      [BX1, BY1],
      [BX0, BY1],
    ],
    HOLES,
    true,
  );
  const railTop = col(look.wood, 1.08);
  flat(outer(RR), ZR, railTop, true, [railHole.map((q) => q.p)]);
  // the step down from the rail's top to the cushion's back (where there is cushion)
  for (let i = 0; i < railHole.length; i++) {
    const A = railHole[i];
    const B = railHole[(i + 1) % railHole.length];
    if (A.arc >= 0 || B.arc >= 0) continue;
    const ex = B.p[0] - A.p[0];
    const ey = B.p[1] - A.p[1];
    let n: V3 = [ey, -ex, 0];
    if (!inBack([(A.p[0] + B.p[0]) / 2 + n[0] * 1e-3, (A.p[1] + B.p[1]) / 2 + n[1] * 1e-3])) n = [-ey, ex, 0];
    quad(
      [A.p[0], A.p[1], ZC],
      [B.p[0], B.p[1], ZC],
      [B.p[0], B.p[1], ZR],
      [A.p[0], A.p[1], ZR],
      norm(n),
      col(look.wood, 0.75),
    );
    line([A.p[0], A.p[1], ZR], [B.p[0], B.p[1], ZR], 0.4);
  }
  // the outer edge: rounded over, then straight down to the underside
  const AI = 0.045; // the apron, in from the rail's outside
  const prof: [number, number][] = [];
  for (let k = 0; k <= 3; k++) {
    const f = (k / 3) * (Math.PI / 2);
    prof.push([RR * (1 - Math.sin(f)), ZR - RR * (1 - Math.cos(f))]);
  }
  prof.push([0, ZA + 0.012], [0.012, ZA], [AI, ZA]);
  for (let k = 0; k + 1 < prof.length; k++) {
    const a = outer(prof[k][0]);
    const b = outer(prof[k + 1][0]);
    const za = prof[k][1];
    const zb = prof[k + 1][1];
    for (let s = 0; s < 4; s++) {
      const s1 = (s + 1) % 4;
      const out2: V3 = s === 0 ? [0, -1, 0] : s === 1 ? [1, 0, 0] : s === 2 ? [0, 1, 0] : [-1, 0, 0];
      // the face's own slope for the light
      const dz = za - zb;
      const dd = prof[k + 1][0] - prof[k][0];
      // (the profile runs out and down: its normal is out and up)
      const n = norm([out2[0] * dz, out2[1] * dz, -dd]);
      const shade = k === prof.length - 2 ? 0.55 : 1;
      quad(
        [a[s][0], a[s][1], za],
        [a[s1][0], a[s1][1], za],
        [b[s1][0], b[s1][1], zb],
        [b[s][0], b[s][1], zb],
        n,
        col(look.wood, shade * (s === 0 || s === 2 ? 1 : 0.92)),
      );
    }
  }
  for (const k of [0, 3, 5])
    for (let s = 0; s < 4; s++) {
      const a = outer(prof[k][0]);
      line([a[s][0], a[s][1], prof[k][1]], [a[(s + 1) % 4][0], a[(s + 1) % 4][1], prof[k][1]], k === 0 ? 0.35 : 0.5);
    }

  // the sights: mother-of-pearl diamonds, three a side between the pockets, three on each end
  const zs = ZR + 0.0012;
  const diamond = (x: number, y: number, along: boolean) => {
    const a = along ? 0.026 : 0.016;
    const b = along ? 0.016 : 0.026;
    quad([x - a, y, zs], [x, y - b, zs], [x + a, y, zs], [x, y + b, zs], [0, 0, 1], pearl);
  };
  const L = X1 - X0;
  const Wd = Y1 - Y0;
  for (const k of [1, 2, 3, 5, 6, 7]) {
    diamond(X0 + (k * L) / 8, BY0 - RAIL / 2, true);
    diamond(X0 + (k * L) / 8, BY1 + RAIL / 2, true);
  }
  for (const k of [1, 2, 3]) {
    diamond(BX0 - RAIL / 2, Y0 + (k * Wd) / 4, false);
    diamond(BX1 + RAIL / 2, Y0 + (k * Wd) / 4, false);
  }

  // ── the pockets ──
  const N = 96;
  for (const h of HOLES) {
    // the iron round it on the rail: brass, where the rail is
    const capR = h.r + 0.048;
    const exit = (a: number, x0: number, y0: number, x1: number, y1: number) => {
      // how far along the ray from the hole's centre it leaves the rectangle
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let t = Number.POSITIVE_INFINITY;
      if (dx > 1e-9) t = Math.min(t, (x1 - h.x) / dx);
      if (dx < -1e-9) t = Math.min(t, (x0 - h.x) / dx);
      if (dy > 1e-9) t = Math.min(t, (y1 - h.y) / dy);
      if (dy < -1e-9) t = Math.min(t, (y0 - h.y) / dy);
      return t;
    };
    const zcap = ZR + 0.0015;
    const capC = col("#a87f38");
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2;
      const a1 = ((k + 1) / N) * Math.PI * 2;
      const span = (a: number): [number, number] => [
        Math.max(h.r, exit(a, BX0, BY0, BX1, BY1)),
        Math.min(capR, exit(a, OX0 + RR, OY0 + RR, OX1 - RR, OY1 - RR)),
      ];
      const [i0, o0] = span(a0);
      const [i1, o1] = span(a1);
      if (o0 <= i0 + 1e-4 || o1 <= i1 + 1e-4) continue;
      const P = (a: number, t: number): V3 => [h.x + Math.cos(a) * t, h.y + Math.sin(a) * t, zcap];
      quad(P(a0, i0), P(a1, i1), P(a1, o1), P(a0, o0), [0, 0, 1], capC);
      line(P(a0, o0), P(a1, o1), 0.4);
    }
    // the throat: the hole's wall, from what's round it (rail, cushion, the
    // cloth at the mouth) down into the dark; leather, darker as it goes down
    const ring: { p: P2; top: number }[] = [];
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      const p: P2 = [h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r];
      ring.push({ p, top: rimZ(p) });
    }
    const lip = col("#5a3a26");
    const mid = col("#2a1a12");
    const zMid = ZC - POCKET_DEEP * 0.35;
    for (let k = 0; k < N; k++) {
      const A = ring[k];
      const B = ring[k + 1];
      const am = ((k + 0.5) / N) * Math.PI * 2;
      const n: V3 = [-Math.cos(am), -Math.sin(am), 0];
      // over the cloth (in the rail or a cushion): leather to the brim
      if (A.top > ZC + 1e-4 || B.top > ZC + 1e-4) {
        quad(
          [A.p[0], A.p[1], ZC],
          [B.p[0], B.p[1], ZC],
          [B.p[0], B.p[1], B.top],
          [A.p[0], A.p[1], A.top],
          n,
          leather,
          leather,
          lip,
          lip,
        );
        line([A.p[0], A.p[1], A.top], [B.p[0], B.p[1], B.top], 0.45);
      } else line([A.p[0], A.p[1], ZC + 0.001], [B.p[0], B.p[1], ZC + 0.001], 0.55);
      quad(
        [A.p[0], A.p[1], zMid],
        [B.p[0], B.p[1], zMid],
        [B.p[0], B.p[1], ZC],
        [A.p[0], A.p[1], ZC],
        n,
        mid,
        mid,
        leather,
        leather,
      );
      quad(
        [A.p[0], A.p[1], ZT],
        [B.p[0], B.p[1], ZT],
        [B.p[0], B.p[1], zMid],
        [A.p[0], A.p[1], zMid],
        n,
        dark,
        dark,
        mid,
        mid,
      );
      // the cup at the bottom
      tri([h.x, h.y, ZT - 0.004], [A.p[0], A.p[1], ZT], [B.p[0], B.p[1], ZT], col("#060404"), dark, dark, [0, 0, 1]);
    }
  }

  // ── the apron: a walnut skirt under the rails, raised panels, brass corners ──
  const ax0 = OX0 + AI;
  const ax1 = OX1 - AI;
  const ay0 = OY0 + AI;
  const ay1 = OY1 - AI;
  box(ax0, ay0, ax1, ay1, ZP, ZA, wood, { noTop: true });
  line([ax0, ay0, ZP], [ax1, ay0, ZP]);
  line([ax1, ay0, ZP], [ax1, ay1, ZP]);
  line([ax1, ay1, ZP], [ax0, ay1, ZP]);
  line([ax0, ay1, ZP], [ax0, ay0, ZP]);
  {
    const lo = ZP + 0.028;
    const hi = ZA - 0.03;
    const raised = col(look.wood, 1.12);
    const pd = 0.007;
    // long sides: two panels either side of the middle
    for (const [u0, u1] of [
      [ax0 + 0.18, CX - 0.12],
      [CX + 0.12, ax1 - 0.18],
    ]) {
      box(u0, ay0 - pd, u1, ay0, lo, hi, raised, { inked: true });
      box(u0, ay1, u1, ay1 + pd, lo, hi, raised, { inked: true });
    }
    // the ends
    box(ax0 - pd, ay0 + 0.16, ax0, ay1 - 0.16, lo, hi, raised, { inked: true });
    box(ax1, ay0 + 0.16, ax1 + pd, ay1 - 0.16, lo + 0.05, hi, raised, { inked: true });
    // brass plates on the corners
    for (const [x, y] of [
      [ax0, ay0],
      [ax1, ay0],
      [ax1, ay1],
      [ax0, ay1],
    ]) {
      const sx = x === ax0 ? 1 : -1;
      const sy = y === ay0 ? 1 : -1;
      box(
        Math.min(x, x + sx * 0.09),
        Math.min(y, y - sy * 0.004),
        Math.max(x, x + sx * 0.09),
        Math.max(y, y - sy * 0.004),
        ZA - 0.07,
        ZA - 0.004,
        brass,
      );
      box(
        Math.min(x, x - sx * 0.004),
        Math.min(y, y + sy * 0.09),
        Math.max(x, x - sx * 0.004),
        Math.max(y, y + sy * 0.09),
        ZA - 0.07,
        ZA - 0.004,
        brass,
      );
    }
  }

  // ── turned legs: a foot, a bun, a long baluster, a brass collar, a block under the apron ──
  const legProf: [number, number][] = [
    [0.07, 0],
    [0.072, zt(2)],
    [0.1, zt(2.6)],
    [0.1, zt(4.6)],
    [0.084, zt(5.4)],
    [0.062, zt(7)],
    [0.07, zt(9.6)],
    [0.086, zt(11.6)],
    [0.096, zt(11.7)],
    [0.096, zt(13.1)],
  ];
  const SEG = 14;
  for (const [lx, ly] of [
    [OX0 + 0.26, OY0 + 0.22],
    [OX1 - 0.26, OY0 + 0.22],
    [OX0 + 0.26, OY1 - 0.22],
    [OX1 - 0.26, OY1 - 0.22],
  ]) {
    for (let k = 0; k + 1 < legProf.length; k++) {
      const [ra, za] = legProf[k];
      const [rb, zb] = legProf[k + 1];
      const c = k >= legProf.length - 2 ? brass : k % 2 ? woodDark : wood;
      for (let s = 0; s < SEG; s++) {
        const a0 = (s / SEG) * Math.PI * 2;
        const a1 = ((s + 1) / SEG) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        const n = norm([Math.cos(am) * (zb - za), Math.sin(am) * (zb - za), ra - rb]);
        quad(
          [lx + Math.cos(a0) * ra, ly + Math.sin(a0) * ra, za],
          [lx + Math.cos(a1) * ra, ly + Math.sin(a1) * ra, za],
          [lx + Math.cos(a1) * rb, ly + Math.sin(a1) * rb, zb],
          [lx + Math.cos(a0) * rb, ly + Math.sin(a0) * rb, zb],
          n,
          c,
        );
      }
    }
    box(lx - 0.1, ly - 0.1, lx + 0.1, ly + 0.1, zt(13.1), ZP, wood, { inked: true, noTop: true });
  }

  // ── the ball return: a trough along the foot end, the potted balls lie in it ──
  {
    // (the balls lie at x 3.87, from y 0.66 on, a ball apart: tables/pool.ts)
    const tx0 = ax1 - 0.012;
    const tx1 = 3.93;
    const ty0 = 0.6;
    const ty1 = 1.99;
    const zf = zt(19.4); // its floor
    const zl = zf + 0.026;
    box(tx0, ty0, tx1, ty1, zf - 0.035, zf, woodDark, { top: col("#2a1a12"), inked: true });
    // its lips round the floor
    box(tx1 - 0.014, ty0, tx1, ty1, zf, zl, wood, { inked: true });
    box(tx0, ty0, tx1, ty0 + 0.014, zf, zl, wood, { inked: true });
    box(tx0, ty1 - 0.014, tx1, ty1, zf, zl, wood, { inked: true });
    // two brackets holding it under the apron
    for (const y of [ty0 + 0.1, ty1 - 0.1]) box(tx0, y - 0.02, tx1 - 0.02, y + 0.02, zf - 0.09, zf - 0.035, woodDark);
  }

  // a cube of chalk on the near rail by the foot (its top worn in)
  {
    const x = X1 - 0.42;
    const y = BY1 + RAIL / 2 - 0.03;
    box(x, y, x + 0.06, y + 0.06, ZR, ZR + 0.046, col("#3d6fa8"), { top: col("#2a4f7d"), inked: true });
  }
}
