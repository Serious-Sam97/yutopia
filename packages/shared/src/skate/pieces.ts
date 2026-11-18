// The skate's ramps (docs/plan/103-the-skate.md, phase 2): every ridden shape is a profile — a run of straight
// lines and circular arcs in its own (u, z) plane, u along the way up it, z up — swept along a width (a quarter-pipe,
// a kicker, a fun box's sides) or round a centre (a bowl's corner). A board on one rides the profile by its length
// along it (ℓ) and how far across (w), so a vert wall is no harder than the flat: exact, smooth and the same on every
// machine. The world's own ground (the street, the hall's floor) stays Jolt's (the walker's mover); a piece is only
// asked about where it stands.
//
// Frame: the floor's (x east, y south, z up), metres; a piece's `yaw` is the plan way of its +u (up the ramp).

export type Seg =
  | { k: "line"; a: [number, number]; b: [number, number] }
  /** an arc round `c` (u, z), radius r, from angle a0 to a1 (rad; the point is c + r (cos a, sin a)) */
  | { k: "arc"; c: [number, number]; r: number; a0: number; a1: number };

/** A point of a profile: where, its unit tangent (the way ℓ grows), its length along. */
export interface ProfPt {
  u: number;
  z: number;
  tu: number;
  tz: number;
}

/** A profile, measured: its segments, their lengths, the copings (ℓ of each lip: lip tricks and grinds), the edges
 *  that are grindable (ℓ of each, a box's top corners). */
export class Profile {
  readonly lens: number[] = [];
  readonly total: number;
  readonly uMin: number;
  readonly uMax: number;
  constructor(
    readonly segs: Seg[],
    /** ℓ of the copings (a pipe's metal lip) */
    readonly copings: number[] = [],
    /** ℓ of other grindable edges (a box's, a ledge's) */
    readonly edges: number[] = [],
  ) {
    let t = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of segs) {
      const l = s.k === "line" ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : Math.abs(s.a1 - s.a0) * s.r;
      this.lens.push(l);
      t += l;
      for (const k of [0, 0.25, 0.5, 0.75, 1]) {
        const p = segAt(s, k);
        lo = Math.min(lo, p.u);
        hi = Math.max(hi, p.u);
      }
    }
    this.total = t;
    this.uMin = lo;
    this.uMax = hi;
  }

  /** The point ℓ along (clamped to the ends). */
  at(l: number): ProfPt {
    let rest = Math.max(0, Math.min(this.total, l));
    for (let i = 0; i < this.segs.length; i++) {
      const len = this.lens[i];
      if (rest <= len || i === this.segs.length - 1) return segAt(this.segs[i], len > 0 ? rest / len : 0);
      rest -= len;
    }
    return { u: 0, z: 0, tu: 1, tz: 0 };
  }

  /** The ridden top at u (the highest of the segments there that aren't upright), its ℓ; null off the profile. */
  topAt(u: number): { z: number; l: number } | null {
    let best: { z: number; l: number } | null = null;
    let l0 = 0;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const len = this.lens[i];
      const hit = segAtU(s, u);
      if (hit && (!best || hit.z > best.z)) best = { z: hit.z, l: l0 + hit.k * len };
      l0 += len;
    }
    return best;
  }
}

function segAt(s: Seg, k: number): ProfPt {
  if (s.k === "line") {
    const du = s.b[0] - s.a[0];
    const dz = s.b[1] - s.a[1];
    const n = Math.hypot(du, dz) || 1;
    return { u: s.a[0] + du * k, z: s.a[1] + dz * k, tu: du / n, tz: dz / n };
  }
  const a = s.a0 + (s.a1 - s.a0) * k;
  const sg = Math.sign(s.a1 - s.a0) || 1;
  return {
    u: s.c[0] + s.r * Math.cos(a),
    z: s.c[1] + s.r * Math.sin(a),
    tu: -Math.sin(a) * sg,
    tz: Math.cos(a) * sg,
  };
}

/** Where a segment is at u (k its share along), unless it's upright there (a wall: no top). */
function segAtU(s: Seg, u: number): { z: number; k: number } | null {
  if (s.k === "line") {
    const du = s.b[0] - s.a[0];
    if (Math.abs(du) < 1e-6) return null;
    const k = (u - s.a[0]) / du;
    if (k < -1e-9 || k > 1 + 1e-9) return null;
    return { z: s.a[1] + (s.b[1] - s.a[1]) * k, k: Math.max(0, Math.min(1, k)) };
  }
  // u = cx + r cos a: the two angles, the one inside [a0, a1]
  const c = (u - s.c[0]) / s.r;
  if (c < -1 || c > 1) return null;
  const base = Math.acos(c);
  const lo = Math.min(s.a0, s.a1);
  const hi = Math.max(s.a0, s.a1);
  let out: { z: number; k: number } | null = null;
  for (const a0 of [base, -base, base - 2 * Math.PI, -base + 2 * Math.PI, base + 2 * Math.PI, -base - 2 * Math.PI]) {
    if (a0 < lo - 1e-9 || a0 > hi + 1e-9) continue;
    // (upright there: no top to land on)
    if (Math.abs(Math.sin(a0)) > 0.9995) continue;
    const z = s.c[1] + s.r * Math.sin(a0);
    if (!out || z > out.z) out = { z, k: (a0 - s.a0) / (s.a1 - s.a0) };
  }
  return out;
}

// ── the pieces ─────────────────────────────────────────────────────────────────────────────────────────────

export type PieceKind =
  | "quarter"
  | "vert"
  | "half"
  | "mini"
  | "kicker"
  | "funbox"
  | "ledge"
  | "manualpad"
  | "spine"
  | "rail"
  | "kinkrail"
  | "bowlcorner";

/** A piece as placed: where its origin is (the foot of its first profile), its plan way (+u), base height. */
export interface PiecePlace {
  kind: PieceKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** across, m (the piece's own when left out) */
  width?: number;
}

/** A ridden surface of a piece: its profile, swept along w ∈ [w0, w1] (`sweep: "line"`) or round a centre at
 *  u = −rIn (`sweep: "turn"`, w the angle ∈ [w0, w1], rad: a bowl's corner, the ramp rising outward). */
export interface Surface {
  prof: Profile;
  sweep: "line" | "turn";
  w0: number;
  w1: number;
  /** turn: the radius at u = 0 */
  rIn?: number;
  /** its own frame in the piece's: an offset along the piece's u, w, and a turn of its +u (rad) */
  du?: number;
  dw?: number;
  turn?: number;
}

/** A grind line (a rail, a coping, a box's edge): its points (world), and what it is (the sound, the look). */
export interface GrindLine {
  pts: [number, number, number][];
  what: "rail" | "coping" | "ledge";
}

export interface PieceDef {
  /** footprint, for building (m): along u, across */
  size: [number, number];
  height: number;
  surfaces: Surface[];
  /** grind lines in the piece's own frame (u, w, z) */
  lines: GrindLine[];
}

const Q = Math.PI / 2;
/** A quarter's profile: up an arc of radius r to `deg` from flat, then `ext` upright, a coping, a deck `deck` deep. */
function quarterProf(r: number, deg: number, ext: number, deck: number): Profile {
  const a1 = -Q + (deg * Math.PI) / 180;
  const top: [number, number] = [r * Math.cos(a1), r + r * Math.sin(a1)];
  const segs: Seg[] = [{ k: "arc", c: [0, r], r, a0: -Q, a1 }];
  let lip = top;
  if (ext > 0) {
    lip = [top[0], top[1] + ext];
    segs.push({ k: "line", a: top, b: lip });
  }
  segs.push({ k: "line", a: lip, b: [lip[0] + deck, lip[1]] });
  const p = new Profile(segs);
  // (the coping: at the deck's start)
  const lens = p.lens;
  const cop = lens.slice(0, segs.length - 1).reduce((a, b) => a + b, 0);
  return new Profile(segs, [cop]);
}
/** A box's top: up a slope (or straight up, no slope: a ledge's side is a wall), flat, down again. */
function boxProf(h: number, len: number, slope: number): Profile {
  if (slope <= 0) {
    // (a ledge: only the top is ridden; its long edges are grindable lines, not profile edges)
    return new Profile([{ k: "line", a: [0, h], b: [len, h] }], [], [0, len]);
  }
  const run = h / Math.tan((slope * Math.PI) / 180);
  const segs: Seg[] = [
    { k: "line", a: [0, 0], b: [run, h] },
    { k: "line", a: [run, h], b: [run + len, h] },
    { k: "line", a: [run + len, h], b: [2 * run + len, 0] },
  ];
  const p = new Profile(segs);
  return new Profile(segs, [], [p.lens[0], p.lens[0] + p.lens[1]]);
}

/** The lines along a surface's sweep at a profile point (u, z): its two ends across. */
const along = (u: number, z: number, w0: number, w1: number, what: GrindLine["what"]): GrindLine => ({
  pts: [
    [u, w0, z],
    [u, w1, z],
  ],
  what,
});

function quarterDef(r: number, deg: number, ext: number, deck: number, width: number): PieceDef {
  const prof = quarterProf(r, deg, ext, deck);
  const lip = prof.at(prof.copings[0]);
  return {
    size: [lip.u + deck, width],
    height: lip.z,
    surfaces: [{ prof, sweep: "line", w0: -width / 2, w1: width / 2 }],
    lines: [along(lip.u, lip.z, -width / 2, width / 2, "coping")],
  };
}

/** Two quarters facing, a flat `flat` between (the piece's origin at the middle of its flat; +u to one wall). */
function pipeDef(r: number, deg: number, ext: number, deck: number, flat: number, width: number): PieceDef {
  const q = quarterDef(r, deg, ext, deck, width);
  const lipU = q.surfaces[0].prof.at(q.surfaces[0].prof.copings[0]).u;
  const half = flat / 2;
  const flatProf = new Profile([{ k: "line", a: [-half, 0], b: [half, 0] }]);
  return {
    size: [flat + 2 * (lipU + deck), width],
    height: q.height,
    surfaces: [
      { prof: flatProf, sweep: "line", w0: -width / 2, w1: width / 2 },
      { ...q.surfaces[0], du: half },
      { ...q.surfaces[0], du: -half, turn: Math.PI },
    ],
    lines: [
      along(half + lipU, q.height, -width / 2, width / 2, "coping"),
      along(-half - lipU, q.height, -width / 2, width / 2, "coping"),
    ],
  };
}

function boxDef(h: number, len: number, slope: number, width: number, what: GrindLine["what"]): PieceDef {
  const prof = boxProf(h, len, slope);
  const run = slope > 0 ? h / Math.tan((slope * Math.PI) / 180) : 0;
  return {
    size: [len + 2 * run, width],
    height: h,
    surfaces: [{ prof, sweep: "line", w0: -width / 2, w1: width / 2 }],
    // (a box's long top edges)
    lines: [
      {
        pts: [
          [run, -width / 2, h],
          [run + len, -width / 2, h],
        ],
        what,
      },
      {
        pts: [
          [run, width / 2, h],
          [run + len, width / 2, h],
        ],
        what,
      },
    ],
  };
}

/** Every piece's shape: true-scale, for a park (the furniture's footprints are these). */
export const PIECES: Record<PieceKind, PieceDef> = {
  // a street quarter: 1.6 m, an arc of 2.2 m to 78°, a 1.2 m deck
  quarter: quarterDef(2.2, 78, 0, 1.2, 4.8),
  // a vert quarter: an arc of 3.2 m to upright, 0.35 m of vert, a 1.6 m deck
  vert: quarterDef(3.2, 90, 0.35, 1.6, 7.2),
  // the vert half-pipe: two of them over 4.8 m of flat
  half: pipeDef(3.2, 90, 0.35, 1.6, 4.8, 9.6),
  // a mini ramp: 1.3 m, an arc of 1.9 m to 76°, 3.6 m of flat
  mini: pipeDef(1.9, 76, 0, 1.2, 3.6, 4.8),
  // a launch ramp: up 26° to 0.62 m, then nothing (off the back: air)
  kicker: {
    size: [1.3, 1.6],
    height: 0.62,
    surfaces: [
      {
        prof: new Profile([{ k: "line", a: [0, 0], b: [0.62 / Math.tan((26 * Math.PI) / 180), 0.62] }]),
        sweep: "line",
        w0: -0.8,
        w1: 0.8,
      },
    ],
    lines: [],
  },
  // a fun box: up 24°, 2.4 m flat at 0.6 m, down; its long edges are ledges
  funbox: boxDef(0.6, 2.4, 24, 2.4, "ledge"),
  // a ledge: 0.45 m high, 0.5 wide, 4 long (its top ridden, its edges ground)
  ledge: boxDef(0.45, 4, 0, 0.5, "ledge"),
  // a manual pad: 0.2 m, 1.5 wide, 4 long
  manualpad: boxDef(0.2, 4, 0, 1.5, "ledge"),
  // a spine: two street quarters back to back, the copings touching
  spine: (() => {
    const q = quarterDef(2.0, 80, 0, 0, 4.8);
    const lipU = q.surfaces[0].prof.at(q.surfaces[0].prof.copings[0]).u;
    return {
      size: [2 * lipU, 4.8],
      height: q.height,
      surfaces: [
        { ...q.surfaces[0], du: -lipU },
        { ...q.surfaces[0], du: lipU, turn: Math.PI },
      ],
      lines: [along(0, q.height, -2.4, 2.4, "coping")],
    };
  })(),
  // a flat rail: 0.38 m, 5 m
  rail: {
    size: [5, 0.3],
    height: 0.38,
    surfaces: [],
    lines: [
      {
        pts: [
          [0, 0, 0.38],
          [5, 0, 0.38],
        ],
        what: "rail",
      },
    ],
  },
  // a kinked rail: 1.5 m flat at 0.95 m, down 30° over 3 m, 1.5 m flat at the foot
  kinkrail: {
    size: [6, 0.3],
    height: 0.95,
    surfaces: [],
    lines: [
      {
        pts: [
          [0, 0, 0.95],
          [1.5, 0, 0.95],
          [4.5, 0, 0.95 - 3 * Math.tan(Math.PI / 6)],
          [6, 0, 0.95 - 3 * Math.tan(Math.PI / 6)],
        ],
        what: "rail",
      },
    ],
  },
  // a bowl's corner: a quarter of 2.2 m to 80°, revolved a quarter turn round a 1.5 m flat
  bowlcorner: (() => {
    const prof = quarterProf(2.2, 80, 0, 0.8);
    const lip = prof.at(prof.copings[0]);
    const rIn = 1.5;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Q;
      pts.push([(rIn + lip.u) * Math.cos(a), (rIn + lip.u) * Math.sin(a), lip.z]);
    }
    return {
      size: [rIn + lip.u + 0.8, rIn + lip.u + 0.8],
      height: lip.z,
      surfaces: [{ prof, sweep: "turn", w0: 0, w1: Q, rIn }],
      lines: [{ pts, what: "coping" }],
    };
  })(),
};

// ── a piece in the world ───────────────────────────────────────────────────────────────────────────────────

/** Where a body is on a surface: which, ℓ along its profile, w across; and the frame there (world). */
export interface OnSurface {
  /** the placed surface's index (SkatePark.placed) */
  pl: number;
  piece: number;
  surf: number;
  l: number;
  w: number;
}

/** A placed surface: its profile and the world frame of its u = 0 line. */
export interface Placed {
  idx: number;
  piece: number;
  surf: number;
  s: Surface;
  /** the origin (world plan) and base height */
  ox: number;
  oy: number;
  oz: number;
  /** +u's plan way (line sweeps), or the centre (turn sweeps: ox, oy) */
  ux: number;
  uy: number;
  /** a turn sweep's angle of w = 0 (world plan) */
  a0: number;
  /** a rough plan box, for finding it */
  box: [number, number, number, number];
}

/** A plan point in a placed surface's own (u, w), and the plan way of +u there. */
export function toLocal(p: Placed, x: number, y: number): { u: number; w: number; ux: number; uy: number } {
  const dx = x - p.ox;
  const dy = y - p.oy;
  if (p.s.sweep === "line") return { u: dx * p.ux + dy * p.uy, w: -dx * p.uy + dy * p.ux, ux: p.ux, uy: p.uy };
  const r = Math.hypot(dx, dy) || 1e-9;
  let a = Math.atan2(dy, dx) - p.a0;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return { u: r - (p.s.rIn ?? 0), w: a, ux: dx / r, uy: dy / r };
}

/** A surface's (u, w) back in the world's plan, and the plan ways of +u and +w there (w's a unit length). */
export function toWorld(
  p: Placed,
  u: number,
  w: number,
): { x: number; y: number; ux: number; uy: number; wx: number; wy: number } {
  if (p.s.sweep === "line")
    return { x: p.ox + u * p.ux - w * p.uy, y: p.oy + u * p.uy + w * p.ux, ux: p.ux, uy: p.uy, wx: -p.uy, wy: p.ux };
  const a = p.a0 + w;
  const r = u + (p.s.rIn ?? 0);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  return { x: p.ox + r * ux, y: p.oy + r * uy, ux, uy, wx: -uy, wy: ux };
}

/** How far a w step is in metres at u (a turn sweep's arc). */
export const wScale = (p: Placed, u: number) => (p.s.sweep === "line" ? 1 : Math.max(0.05, u + (p.s.rIn ?? 0)));

/** The pieces placed: their surfaces and grind lines in the world, found by where. */
export class SkatePark {
  readonly placed: Placed[] = [];
  readonly lines: GrindLine[] = [];
  constructor(readonly pieces: readonly PiecePlace[]) {
    pieces.forEach((pc, i) => {
      const def = PIECES[pc.kind];
      const c = Math.cos(pc.yaw);
      const s = Math.sin(pc.yaw);
      const W = (pc.width ?? def.size[1]) / def.size[1];
      // the piece's (u, w) in the world plan
      const P = (u: number, w: number): [number, number] => [pc.x + u * c - w * s, pc.y + u * s + w * c];
      def.surfaces.forEach((sf, j) => {
        const surf: Surface = {
          ...sf,
          w0: sf.sweep === "line" ? sf.w0 * W : sf.w0,
          w1: sf.sweep === "line" ? sf.w1 * W : sf.w1,
        };
        const [ox, oy] = P(sf.du ?? 0, sf.dw ?? 0);
        const yaw = pc.yaw + (sf.turn ?? 0);
        const pl: Placed = {
          idx: this.placed.length,
          piece: i,
          surf: j,
          s: surf,
          ox,
          oy,
          oz: pc.z,
          ux: Math.cos(yaw),
          uy: Math.sin(yaw),
          a0: yaw,
          box: [0, 0, 0, 0],
        };
        // its plan box: the corners of its (u, w) range
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        const us = [surf.prof.uMin, surf.prof.uMax];
        const ws =
          surf.sweep === "line"
            ? [surf.w0, surf.w1]
            : [0, 0.25, 0.5, 0.75, 1].map((k) => surf.w0 + (surf.w1 - surf.w0) * k);
        if (surf.sweep === "turn") us.unshift(-(surf.rIn ?? 0));
        for (const u of us)
          for (const w of ws) {
            const q = toWorld(pl, u, w);
            x0 = Math.min(x0, q.x);
            y0 = Math.min(y0, q.y);
            x1 = Math.max(x1, q.x);
            y1 = Math.max(y1, q.y);
          }
        pl.box = [x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05];
        this.placed.push(pl);
      });
      for (const ln of def.lines)
        this.lines.push({
          what: ln.what,
          pts: ln.pts.map(([u, w, z]) => {
            const [x, y] = P(u, w * (ln.what === "coping" && def.surfaces[0]?.sweep === "line" ? W : 1));
            return [x, y, pc.z + z] as [number, number, number];
          }),
        });
    });
  }

  /** The surfaces whose plan box holds (x, y). */
  near(x: number, y: number): Placed[] {
    const out: Placed[] = [];
    for (const p of this.placed) if (x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3]) out.push(p);
    return out;
  }

  /** Within a placed surface's sweep at (u, w) */
  static inside(p: Placed, u: number, w: number): boolean {
    return (
      u >= p.s.prof.uMin - 1e-6 &&
      u <= p.s.prof.uMax + 1e-6 &&
      w >= p.s.w0 - 1e-6 &&
      w <= p.s.w1 + 1e-6 &&
      (p.s.sweep === "line" || u + (p.s.rIn ?? 0) >= 0)
    );
  }

  /** The highest ridden top under (x, y) at or below z + up (a piece's), and where on it. */
  topAt(x: number, y: number, z: number, up = 0.05): { z: number; on: OnSurface; p: Placed } | null {
    let best: { z: number; on: OnSurface; p: Placed } | null = null;
    for (const p of this.near(x, y)) {
      const L = toLocal(p, x, y);
      if (!SkatePark.inside(p, L.u, L.w)) continue;
      const t = p.s.prof.topAt(L.u);
      if (!t) continue;
      const tz = p.oz + t.z;
      if (tz > z + up) continue;
      if (!best || tz > best.z) best = { z: tz, on: { pl: p.idx, piece: p.piece, surf: p.surf, l: t.l, w: L.w }, p };
    }
    return best;
  }

  /** Something of a piece standing higher than z + up at (x, y): a wall to the board (a box's side, a ramp's back). */
  wallAt(x: number, y: number, z: number, up: number): boolean {
    for (const p of this.near(x, y)) {
      const L = toLocal(p, x, y);
      if (!SkatePark.inside(p, L.u, L.w)) continue;
      const t = p.s.prof.topAt(L.u);
      if (t && p.oz + t.z > z + up) {
        // (a ramp's own foot rises from the ground: ridden onto, not a wall — only where its top is steep or high)
        const at = p.s.prof.at(t.l);
        if (Math.abs(at.tz) > 0.7 || p.oz + t.z - z > 0.25 || L.u > p.s.prof.uMin + 0.05) {
          if (t.l > 0.02 || p.oz + t.z - z > up) return true;
        }
      }
    }
    return false;
  }

  /** The grind line nearest (x, y, z) within `reach` (plan) and ±0.5 m up: the point on it, its way, how far to
   *  each end along it, and the line's slope (rise per metre along +way). */
  line(
    x: number,
    y: number,
    z: number,
    reach: number,
  ): {
    x: number;
    y: number;
    z: number;
    ux: number;
    uy: number;
    back: number;
    ahead: number;
    slope: number;
    what: GrindLine["what"];
  } | null {
    let best: ReturnType<SkatePark["line"]> = null;
    let bd = reach;
    for (const ln of this.lines) {
      // the whole line's length, to say how far each end is
      let total = 0;
      const segL: number[] = [];
      for (let i = 0; i + 1 < ln.pts.length; i++) {
        const [ax, ay, az] = ln.pts[i];
        const [bx, by, bz] = ln.pts[i + 1];
        const l = Math.hypot(bx - ax, by - ay, bz - az);
        segL.push(l);
        total += l;
      }
      let along0 = 0;
      for (let i = 0; i + 1 < ln.pts.length; i++) {
        const [ax, ay, az] = ln.pts[i];
        const [bx, by, bz] = ln.pts[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const pl = Math.hypot(dx, dy);
        if (pl < 1e-6) {
          along0 += segL[i];
          continue;
        }
        const k0 = ((x - ax) * dx + (y - ay) * dy) / (pl * pl);
        // (past an end: not on it — a board runs off it, a catch misses)
        if (k0 < -0.02 / pl || k0 > 1 + 0.02 / pl) {
          along0 += segL[i];
          continue;
        }
        const k = Math.max(0, Math.min(1, k0));
        const px = ax + dx * k;
        const py = ay + dy * k;
        const pz = az + (bz - az) * k;
        const d = Math.hypot(x - px, y - py);
        if (d <= bd && z > pz - 0.5 && z < pz + 0.6) {
          bd = d;
          const at = along0 + segL[i] * k;
          best = {
            x: px,
            y: py,
            z: pz,
            ux: dx / pl,
            uy: dy / pl,
            back: at,
            ahead: total - at,
            slope: (bz - az) / pl,
            what: ln.what,
          };
        }
        along0 += segL[i];
      }
    }
    return best;
  }
}
