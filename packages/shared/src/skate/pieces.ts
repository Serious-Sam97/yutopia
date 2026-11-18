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
  | "bowlcorner"
  // (plan 104 F6a: the parks on Tony Hawk's 10 ft module and 4 ft height steps)
  | "qp4"
  | "qp8"
  | "qp4corner"
  | "hip"
  | "bowlhip"
  | "bank"
  | "pyramid"
  | "spine4"
  | "deck4"
  | "deck8"
  | "stairs"
  | "stairs8"
  | "halfext"
  | "railing";

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
 *  u = −rIn (`sweep: "turn"`, w the angle ∈ [w0, w1], rad: a bowl's corner, the ramp rising outward) — or, `inward`,
 *  round a centre at u = +rIn, the ramp rising toward it (a hip: a convex corner, plan 104). */
export interface Surface {
  prof: Profile;
  sweep: "line" | "turn";
  w0: number;
  w1: number;
  /** turn: the radius at u = 0 */
  rIn?: number;
  /** turn: the radius is rIn − u (the centre up the ramp: a hip's rounded corner), not rIn + u */
  inward?: boolean;
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
  /** its ground in its own plan (u0, w0, u1, w1): what it stands on — a park's pieces don't overlap (the
   *  across scaled by a placed width, as the surfaces) */
  foot: [number, number, number, number];
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
  if (deck > 0) segs.push({ k: "line", a: lip, b: [lip[0] + deck, lip[1]] });
  const p = new Profile(segs);
  // (the coping: at the deck's start — the profile's end when it has none, a spine's crest)
  const lens = p.lens;
  const cop = lens.slice(0, deck > 0 ? segs.length - 1 : segs.length).reduce((a, b) => a + b, 0);
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
/** A flat at height h from u0 to u1 (a deck, a stair's tread). */
const flatProf = (u0: number, u1: number, h: number) => new Profile([{ k: "line", a: [u0, h], b: [u1, h] }]);

/** The lines along a surface's sweep at a profile point (u, z): its two ends across. */
const along = (u: number, z: number, w0: number, w1: number, what: GrindLine["what"]): GrindLine => ({
  pts: [
    [u, w0, z],
    [u, w1, z],
  ],
  what,
});
/** A piece's ground from its run along u and its width (centred across). */
const footOf = (u0: number, u1: number, width: number): PieceDef["foot"] => [u0, -width / 2, u1, width / 2];

function quarterDef(r: number, deg: number, ext: number, deck: number, width: number): PieceDef {
  const prof = quarterProf(r, deg, ext, deck);
  const lip = prof.at(prof.copings[0]);
  return {
    size: [lip.u + deck, width],
    height: lip.z,
    surfaces: [{ prof, sweep: "line", w0: -width / 2, w1: width / 2 }],
    lines: [along(lip.u, lip.z, -width / 2, width / 2, "coping")],
    foot: footOf(0, lip.u + deck, width),
  };
}

/** Two quarters facing, a flat `flat` between (the piece's origin at the middle of its flat; +u to one wall). */
function pipeDef(r: number, deg: number, ext: number, deck: number, flat: number, width: number): PieceDef {
  const q = quarterDef(r, deg, ext, deck, width);
  const lipU = q.surfaces[0].prof.at(q.surfaces[0].prof.copings[0]).u;
  const half = flat / 2;
  const flatP = new Profile([{ k: "line", a: [-half, 0], b: [half, 0] }]);
  const size: [number, number] = [flat + 2 * (lipU + deck), width];
  return {
    size,
    height: q.height,
    surfaces: [
      { prof: flatP, sweep: "line", w0: -width / 2, w1: width / 2 },
      { ...q.surfaces[0], du: half },
      { ...q.surfaces[0], du: -half, turn: Math.PI },
    ],
    lines: [
      along(half + lipU, q.height, -width / 2, width / 2, "coping"),
      along(-half - lipU, q.height, -width / 2, width / 2, "coping"),
    ],
    foot: footOf(-size[0] / 2, size[0] / 2, width),
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
    foot: footOf(0, len + 2 * run, width),
  };
}

/** A rail on posts: its points (u, w, z), the ground it stands on as wide as `wide`. */
function railDef(pts: [number, number, number][], wide = 0.3): PieceDef {
  const us = pts.map((p) => p[0]);
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  return {
    size: [u1 - u0, wide],
    height: Math.max(...pts.map((p) => p[2])),
    surfaces: [],
    lines: [{ pts, what: "rail" }],
    foot: footOf(u0, u1, wide),
  };
}

// ── plan 104 (docs/plan/104-the-skate-again.md F6a): the parks' own pieces, on Tony Hawk's 10 ft (3.05 m) module
// and 4 ft (1.22 m) height steps ──

/** The module: 10 ft across, 4 ft up (m). */
export const MODULE = { across: 3.05, step: 1.22 } as const;
/** A 4 ft quarter: a 6 ft transition (1.83 m) to the 4 ft coping (70.5°, no vert). */
const QP4: [number, number, number] = [1.83, (Math.acos(1 - 1.22 / 1.83) * 180) / Math.PI, 0];
/** An 8 ft quarter: a 7.5 ft transition to upright, 6 in of vert. */
const QP8: [number, number, number] = [2.29, 90, 0.15];
/** The bowl's (a street quarter's: plan 103's bowl corners are its arc revolved). */
const BOWL_Q: [number, number, number] = [2.2, 78, 0];
/** A hip's rounded coping: its radius (m). */
const HIP_RHO = 0.3;

/** A quarter's convex corner, a whole unit (plan 104): two quarters of the profile at right angles (A facing +u,
 *  over w ∈ [−legs, 0]; B facing +w, over u ∈ [−legs, 0]), the rounded hip between them (round the origin, its
 *  coping a ring of radius ρ), and the deck behind them all — the copings one line, round the hip. Its decks never
 *  overlap: A's and B's are ρ deep, the rest of the platform a flat of its own. */
function hipDef([r, deg, ext]: [number, number, number], legs: number): PieceDef {
  const rho = HIP_RHO;
  const q = quarterProf(r, deg, ext, rho);
  const lip = q.at(q.copings[0]);
  const L = lip.u;
  const h = lip.z;
  const rIn = L + rho;
  const ring: [number, number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Q;
    ring.push([rho * Math.cos(a), rho * Math.sin(a), h]);
  }
  return {
    size: [legs + rIn, legs + rIn],
    height: h,
    surfaces: [
      // A: its foot at u = ρ + L, up toward −u (turned π), across w ∈ [−legs, 0] (its own w flipped by the turn)
      { prof: q, sweep: "line", w0: 0, w1: legs, du: rIn, turn: Math.PI },
      // B: its foot at w = ρ + L, up toward −w
      { prof: q, sweep: "line", w0: -legs, w1: 0, dw: rIn, turn: -Q },
      // the hip: round the origin, rising inward to its ring
      { prof: q, sweep: "turn", inward: true, w0: 0, w1: Q, rIn },
      // the platform behind (u, w ∈ [−legs, 0])
      { prof: flatProf(-legs, 0, h), sweep: "line", w0: -legs, w1: 0 },
    ],
    lines: [
      {
        pts: [[rho, -legs, h], ...ring, [-legs, rho, h]],
        what: "coping",
      },
    ],
    foot: [-legs, -legs, rIn, rIn],
  };
}

/** A concave corner of a quarter's profile (a bowl corner): revolved a quarter turn round a flat of radius rIn. */
function cornerDef([r, deg, ext]: [number, number, number], rIn: number, deck: number): PieceDef {
  const prof = quarterProf(r, deg, ext, deck);
  const lip = prof.at(prof.copings[0]);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Q;
    pts.push([(rIn + lip.u) * Math.cos(a), (rIn + lip.u) * Math.sin(a), lip.z]);
  }
  const R = rIn + lip.u + deck;
  return {
    size: [R, R],
    height: lip.z,
    surfaces: [{ prof, sweep: "turn", w0: 0, w1: Q, rIn }],
    lines: [{ pts, what: "coping" }],
    foot: [0, 0, R, R],
  };
}

/** A bank: up `slope`° to h, a deck `deck` deep behind. */
function bankDef(h: number, slope: number, deck: number, width: number): PieceDef {
  const run = h / Math.tan((slope * Math.PI) / 180);
  const prof = new Profile([
    { k: "line", a: [0, 0], b: [run, h] },
    { k: "line", a: [run, h], b: [run + deck, h] },
  ]);
  return {
    size: [run + deck, width],
    height: h,
    surfaces: [{ prof, sweep: "line", w0: -width / 2, w1: width / 2 }],
    lines: [],
    foot: footOf(0, run + deck, width),
  };
}

/** A pyramid: a square top `top` across at h, a bank down each side at `slope`°, a cone at each corner; its top's
 *  four edges steel (ground). The origin at its middle. */
function pyramidDef(h: number, slope: number, top: number): PieceDef {
  const run = h / Math.tan((slope * Math.PI) / 180);
  const a = top / 2;
  const up = new Profile([{ k: "line", a: [0, 0], b: [run, h] }]);
  const surfaces: Surface[] = [{ prof: flatProf(-a, a, h), sweep: "line", w0: -a, w1: a }];
  for (let k = 0; k < 4; k++) {
    const f = k * Q;
    const [c, s] = [Math.cos(f), Math.sin(f)];
    // a side: its foot `a + run` out along f, up toward the middle
    surfaces.push({ prof: up, sweep: "line", w0: -a, w1: a, du: (a + run) * c, dw: (a + run) * s, turn: f + Math.PI });
  }
  for (let k = 0; k < 4; k++) {
    const f = k * Q;
    // a corner: round the top's corner between f and f + 90°, rising inward to it
    const cx = a * (Math.cos(f) - Math.sin(f));
    const cy = a * (Math.sin(f) + Math.cos(f));
    surfaces.push({ prof: up, sweep: "turn", inward: true, w0: 0, w1: Q, rIn: run, du: cx, dw: cy, turn: f });
  }
  const c: [number, number][] = [
    [a, -a],
    [a, a],
    [-a, a],
    [-a, -a],
  ];
  const lines: GrindLine[] = c.map((p, i) => {
    const q = c[(i + 1) % 4];
    return {
      pts: [
        [p[0], p[1], h],
        [q[0], q[1], h],
      ],
      what: "ledge",
    };
  });
  const R = a + run;
  return { size: [2 * R, 2 * R], height: h, surfaces, lines, foot: [-R, -R, R, R] };
}

/** A deck: flat at h, `len` along u, `width` across (stood on, rolled across; its back joins others). */
function deckDef(h: number, len: number, width: number): PieceDef {
  return {
    size: [len, width],
    height: h,
    surfaces: [{ prof: flatProf(0, len, h), sweep: "line", w0: -width / 2, w1: width / 2 }],
    lines: [],
    foot: footOf(0, len, width),
  };
}

/** A stair set: down from a deck at h (its nosing at u = 0) in `n` risers of h / n (7 a 4 ft deck: 17.4 cm), each
 *  tread `run` deep, the last onto the floor; a handrail each side (`inset` in from the edge), 0.8 m over the
 *  nosings, flat 0.9 m over the deck behind and past the foot. Its ground: the treads and the rails' feet past them. */
export const STAIRS = { run: 0.32, width: 3.05, rail: 0.8, inset: 0.28, over: 0.9 } as const;
function stairsDef(h: number, n: number): PieceDef {
  const { run, width, rail, inset, over } = STAIRS;
  const rise = h / n;
  const surfaces: Surface[] = [];
  for (let k = 1; k < n; k++)
    surfaces.push({
      prof: flatProf((k - 1) * run, k * run, h - k * rise),
      sweep: "line",
      w0: -width / 2,
      w1: width / 2,
    });
  const foot = (n - 1) * run;
  const rails: GrindLine[] = [-1, 1].map((s) => {
    const w = s * (width / 2 - inset);
    return {
      pts: [
        [-over, w, h + rail],
        [0, w, h + rail],
        [foot, w, h - (n - 1) * rise + rail],
        [foot + over, w, h - (n - 1) * rise + rail],
      ],
      what: "rail",
    };
  });
  return { size: [foot + over, width], height: h + rail, surfaces, lines: rails, foot: footOf(0, foot + over, width) };
}

/** The hall's vert ramp (plan 104): plan 103's half-pipe at 12.2 m wide over 4.88 m of flat, its −u wall with an
 *  extension (1.22 m more vert) over its middle 3.66 m. */
function halfExtDef(): PieceDef {
  const [r, ext, deck, flat, width, mid] = [3.2, 0.35, 1.6, 4.88, 12.2, 3.66];
  const base = pipeDef(r, 90, ext, deck, flat, width);
  const hi = quarterProf(r, 90, ext + MODULE.step, deck);
  const lo = base.surfaces[2];
  const half = flat / 2;
  const [w0, w1] = [-width / 2, width / 2];
  const [m0, m1] = [-mid / 2, mid / 2];
  const hz = hi.at(hi.copings[0]).z;
  const lipU = half + r;
  return {
    ...base,
    height: hz,
    surfaces: [
      base.surfaces[0],
      base.surfaces[1],
      { ...lo, w0, w1: m0 },
      { prof: hi, sweep: "line", w0: m0, w1: m1, du: -half, turn: Math.PI },
      { ...lo, w0: m1, w1 },
    ],
    lines: [
      base.lines[0],
      // (the −u wall's copings: low, the extension's, low — in the piece's own w, the turned surfaces' flipped)
      along(-lipU, base.height, -m0, -w0, "coping"),
      along(-lipU, hz, -m1, -m0, "coping"),
      along(-lipU, base.height, -w1, -m1, "coping"),
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
    foot: footOf(0, 1.3, 1.6),
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
      foot: footOf(-lipU, lipU, 4.8),
    } satisfies PieceDef;
  })(),
  // a flat rail: 0.38 m, 5 m
  rail: railDef([
    [0, 0, 0.38],
    [5, 0, 0.38],
  ]),
  // a kinked rail: 1.5 m flat at 0.95 m, down 30° over 3 m, 1.5 m flat at the foot
  kinkrail: railDef([
    [0, 0, 0.95],
    [1.5, 0, 0.95],
    [4.5, 0, 0.95 - 3 * Math.tan(Math.PI / 6)],
    [6, 0, 0.95 - 3 * Math.tan(Math.PI / 6)],
  ]),
  // a bowl's corner: the street quarter's arc (2.2 m to 78°: its lip level with theirs), revolved a quarter turn
  // round a 1.5 m flat
  bowlcorner: cornerDef(BOWL_Q, 1.5, 0.8),

  // ── plan 104 ──
  // a 4 ft quarter, 20 ft across, a 4 ft deck
  qp4: quarterDef(...QP4, 1.22, 2 * MODULE.across),
  // an 8 ft quarter (a roll-in off the mezzanine), 20 ft across
  qp8: quarterDef(...QP8, 1.22, 2 * MODULE.across),
  // the 4 ft quarter's concave corner, round a 0.6 m flat
  qp4corner: cornerDef(QP4, 0.6, 1.22),
  // the 4 ft quarter's convex corner: a hip, its legs 10 ft
  hip: hipDef(QP4, MODULE.across),
  // the bowl's convex corner (its pocket's), legs 2 m
  bowlhip: hipDef(BOWL_Q, 2),
  // a 4 ft bank at 30°, a 4 ft deck, 10 ft across
  bank: bankDef(MODULE.step, 30, 1.22, MODULE.across),
  // a 3 ft pyramid: 26° banks round an 8 ft top
  pyramid: pyramidDef(0.91, 26, 2 * MODULE.step),
  // a 4 ft spine
  spine4: (() => {
    const q = quarterDef(...QP4, 0, 2 * MODULE.across);
    const lipU = q.surfaces[0].prof.at(q.surfaces[0].prof.copings[0]).u;
    return {
      size: [2 * lipU, q.size[1]],
      height: q.height,
      surfaces: [
        { ...q.surfaces[0], du: -lipU },
        { ...q.surfaces[0], du: lipU, turn: Math.PI },
      ],
      lines: [along(0, q.height, -q.size[1] / 2, q.size[1] / 2, "coping")],
      foot: footOf(-lipU, lipU, q.size[1]),
    } satisfies PieceDef;
  })(),
  // decks: a 10 ft square at 4 ft, at 8 ft (the mezzanine)
  deck4: deckDef(MODULE.step, MODULE.across, MODULE.across),
  deck8: deckDef(2 * MODULE.step, MODULE.across, MODULE.across),
  // a seven-stair down from a 4 ft deck, its handrails; fourteen down from the 8 ft mezzanine
  stairs: stairsDef(MODULE.step, 7),
  stairs8: stairsDef(2 * MODULE.step, 14),
  // the hall's vert, its extension
  halfext: halfExtDef(),
  // a guard railing: 1 m, 20 ft (its top bar ground)
  railing: railDef([
    [0, 0, 1.0],
    [2 * MODULE.across, 0, 1.0],
  ]),
};

/** A placed piece's ground (the floor's plan): its foot's corners. */
export function pieceFoot(pc: PiecePlace): [number, number][] {
  const d = PIECES[pc.kind];
  const turn = d.surfaces[0]?.sweep === "turn" && d.surfaces.length === 1;
  const W = turn ? 1 : (pc.width ?? d.size[1]) / d.size[1];
  const [u0, w0, u1, w1] = d.foot;
  const c = Math.cos(pc.yaw);
  const s = Math.sin(pc.yaw);
  return (
    [
      [u0, w0 * W],
      [u1, w0 * W],
      [u1, w1 * W],
      [u0, w1 * W],
    ] as [number, number][]
  ).map(([u, w]) => [pc.x + u * c - w * s, pc.y + u * s + w * c]);
}

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
  // (a hip's: up the ramp is in toward the centre)
  if (p.s.inward) return { u: (p.s.rIn ?? 0) - r, w: a, ux: -dx / r, uy: -dy / r };
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
  const r = radiusAt(p.s, u);
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  const k = p.s.inward ? -1 : 1;
  return { x: p.ox + r * cx, y: p.oy + r * cy, ux: k * cx, uy: k * cy, wx: -cy, wy: cx };
}

/** A turn sweep's radius at u: rIn + u outward (a bowl's corner), rIn − u inward (a hip's). */
export const radiusAt = (s: Surface, u: number) => (s.inward ? (s.rIn ?? 0) - u : u + (s.rIn ?? 0));

/** How far a w step is in metres at u (a turn sweep's arc). */
export const wScale = (p: Placed, u: number) => (p.s.sweep === "line" ? 1 : Math.max(0.05, radiusAt(p.s, u)));

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
        // (a turn's centre: where its radius is nought)
        if (surf.sweep === "turn") us.unshift(surf.inward ? (surf.rIn ?? 0) : -(surf.rIn ?? 0));
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
            // (a widened piece's lines across it move out with it — its copings, a box's edges; a rail is one line)
            const [x, y] = P(u, w * (ln.what !== "rail" && def.surfaces[0]?.sweep !== "turn" ? W : 1));
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
      (p.s.sweep === "line" || radiusAt(p.s, u) >= 0)
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
