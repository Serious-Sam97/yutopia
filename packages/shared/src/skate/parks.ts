// The skate's parks (docs/plan/103-the-skate.md F6a, F7c): the town's two — an indoor hall in a disused warehouse
// and an outdoor concrete park east of Church Street — as pieces (pieces.ts) placed on their floors; the build
// menu's park pieces (`sk_*`, fam/skate.ts) as pieces; and every piece's solids for the walkers (Jolt: stepped
// boxes under its riding surface, walked up where it's gentle, a wall where it's steep). Our own layouts, no
// game's level copied. Light: pieces.ts only (grounds.ts reads the parks' rectangles from here).
//
// Frames: the floor's (x east, y south = the Grounds' z, z up), metres; a piece's yaw is the plan way of its +u.

import { PIECES, type PieceKind, type PiecePlace, type Profile } from "./pieces.ts";

const Q = Math.PI / 2;

/** A park of the town's: its ground (the Grounds' x, z), the height its floor's levelled to, its pieces (their z
 *  over the floor: a stair set's steps stand on each other). */
export interface TownPark {
  key: string;
  name: string;
  indoor: boolean;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** its floor's height (the Grounds' pad: the town's flat, 1.5) */
  h: number;
  pieces: PiecePlace[];
}

/** The hall's warehouse (grounds.ts BUILDINGS `skatehall`, a `warehouse`): its plot, its walls' height, its door's
 *  side. East of the townhouses, its door to the south (the outdoor park over the way). */
export const SKATE_HALL = {
  key: "skatehall",
  x0: 456,
  z0: -536,
  x1: 500,
  z1: -508,
  h: 1.5,
  walls: 9,
  face: "s",
} as const;
/** The outdoor park's ground: concrete, ploughed (grounds.ts groundSurfaceAt `walk`), levelled to `h`. */
export const SKATE_YARD = { x0: 462, z0: -492, x1: 508, z1: -448, h: 1.5 } as const;
/** On the outdoor park's concrete (`pad` m round it)? */
export const inSkateYard = (x: number, z: number, pad = 0) =>
  x >= SKATE_YARD.x0 - pad && x < SKATE_YARD.x1 + pad && z >= SKATE_YARD.z0 - pad && z < SKATE_YARD.z1 + pad;

const BOWL_R = PIECES.bowlcorner.surfaces[0].rIn ?? 1.5;

/** A bowl round (cx, cy): its flat 2(a + r) × 2(b + r), four corners (bowlcorner) and a quarter along each side
 *  between them (`quarter`, as wide as the side's straight). */
function bowl(cx: number, cy: number, a: number, b: number): PiecePlace[] {
  const r = BOWL_R;
  return [
    { kind: "bowlcorner", x: cx + a, y: cy + b, z: 0, yaw: 0 },
    { kind: "bowlcorner", x: cx - a, y: cy + b, z: 0, yaw: Q },
    { kind: "bowlcorner", x: cx - a, y: cy - b, z: 0, yaw: Math.PI },
    { kind: "bowlcorner", x: cx + a, y: cy - b, z: 0, yaw: -Q },
    { kind: "quarter", x: cx + a + r, y: cy, z: 0, yaw: 0, width: 2 * b },
    { kind: "quarter", x: cx - a - r, y: cy, z: 0, yaw: Math.PI, width: 2 * b },
    { kind: "quarter", x: cx, y: cy + b + r, z: 0, yaw: Q, width: 2 * a },
    { kind: "quarter", x: cx, y: cy - b - r, z: 0, yaw: -Q, width: 2 * a },
  ];
}

/** The step a stair set's treads are: a ledge's height (0.45) and its run (0.75: 31°, the kinked rail's 30°). */
export const STAIR = { rise: PIECES.ledge.height, run: 0.75, steps: 3, deck: 2, across: 4 } as const;
/** A stair set going down `dir` (plan, rad) from its top deck's front edge at (x, y): the deck (`STAIR.deck` deep)
 *  and three treads, each a ledge widened to its depth and stood on the one under it, and a kinked rail beside
 *  them on their left (seen going down), its kink at the top nosing — its top flat 0.38 over the deck, its foot
 *  over the floor. */
function stairSet(x: number, y: number, dir: number): PiecePlace[] {
  const D: [number, number] = [Math.cos(dir), Math.sin(dir)];
  // (a ledge's u across the stairs, its w down them)
  const U: [number, number] = [Math.cos(dir - Q), Math.sin(dir - Q)];
  const half = STAIR.across / 2;
  const out: PiecePlace[] = [];
  const tread = (d0: number, d1: number, top: number) => {
    const d = (d0 + d1) / 2;
    out.push({
      kind: "ledge",
      x: x + D[0] * d - U[0] * half,
      y: y + D[1] * d - U[1] * half,
      z: top - STAIR.rise,
      yaw: dir - Q,
      width: d1 - d0,
    });
  };
  const H = (STAIR.steps + 1) * STAIR.rise;
  tread(-STAIR.deck, 0, H);
  for (let k = 1; k <= STAIR.steps; k++) tread((k - 1) * STAIR.run, k * STAIR.run, H - k * STAIR.rise);
  // the kinked rail: its kink (1.5 along) at the nosing, 0.4 past the treads' far side
  const k = PIECES.kinkrail.lines[0].pts;
  const top = k[0][2];
  out.push({
    kind: "kinkrail",
    x: x - D[0] * k[1][0] + U[0] * (half + 0.4),
    y: y - D[1] * k[1][0] + U[1] * (half + 0.4),
    z: H + 0.38 - top,
    yaw: dir,
  });
  return out;
}

/** The town's two parks (F7c). */
export const TOWN_PARKS: TownPark[] = [
  {
    key: "hall",
    name: "Skate hall",
    indoor: true,
    x0: SKATE_HALL.x0,
    z0: SKATE_HALL.z0,
    x1: SKATE_HALL.x1,
    z1: SKATE_HALL.z1,
    h: SKATE_HALL.h,
    pieces: [
      // the vert half-pipe along the north wall, west
      { kind: "half", x: 464, y: -530.8, z: 0, yaw: 0 },
      // the small bowl south of it, by the west wall
      ...bowl(464, -514.8, 1.5, 1),
      // the street course, east: a quarter facing the east bank over a fun box; a ledge and a flat rail; a manual
      // pad; a stair set down east with its kinked rail; the bank along the whole east wall
      { kind: "quarter", x: 478, y: -529, z: 0, yaw: Math.PI },
      { kind: "funbox", x: 484.5, y: -529, z: 0, yaw: 0 },
      { kind: "ledge", x: 482, y: -523.5, z: 0, yaw: 0 },
      { kind: "rail", x: 489, y: -523.5, z: 0, yaw: 0 },
      { kind: "manualpad", x: 483, y: -518, z: 0, yaw: 0 },
      ...stairSet(486, -512, 0),
      { kind: "quarter", x: 496.45, y: -521.8, z: 0, yaw: 0, width: 26.4 },
    ],
  },
  {
    key: "yard",
    name: "Skate park",
    indoor: false,
    ...SKATE_YARD,
    pieces: [
      // the mini ramp and the spine along the north side, a quarter past the spine
      { kind: "mini", x: 470, y: -484, z: 0, yaw: 0 },
      { kind: "spine", x: 486, y: -484, z: 0, yaw: 0 },
      { kind: "quarter", x: 500, y: -484, z: 0, yaw: 0 },
      // two kickers facing, a manual pad
      { kind: "kicker", x: 470, y: -470, z: 0, yaw: 0 },
      { kind: "kicker", x: 484, y: -470, z: 0, yaw: Math.PI },
      { kind: "manualpad", x: 476, y: -464, z: 0, yaw: 0 },
      // ledges and rails, west and south
      { kind: "ledge", x: 466, y: -466, z: 0, yaw: Q },
      { kind: "ledge", x: 468, y: -456, z: 0, yaw: 0 },
      { kind: "rail", x: 474, y: -458, z: 0, yaw: 0 },
      { kind: "rail", x: 474, y: -452, z: 0, yaw: 0 },
      // the bowl, south-east
      ...bowl(498, -462, 2.5, 2),
    ],
  },
];

/** A park's pieces in the world: their z its floor's (or `heightAt` there) plus their own. */
export function parkPieces(p: TownPark, heightAt?: (x: number, z: number) => number): PiecePlace[] {
  return p.pieces.map((pc) => ({ ...pc, z: (heightAt ? heightAt(pc.x, pc.y) : p.h) + pc.z }));
}

/** Both parks' pieces (F7c), z the ground's there: the parks' floors are levelled to their `h` (grounds.ts pads
 *  them; `heightAt` — terrainAt — to read it off the land instead). */
export function townSkatePieces(heightAt?: (x: number, z: number) => number): PiecePlace[] {
  return TOWN_PARKS.flatMap((p) => parkPieces(p, heightAt));
}

// ── the build menu's pieces (F6a: fam/skate.ts `sk_*`) ───────────────────────────────────────────────────────

/** How a buildable piece sits in its footprint (the kind's frame: x across 0..w, z down it 0..h, as the kit and
 *  fam/units.ts box parts have it): which way its +u runs (`u`: along x; `-v`: toward the back, its riding face
 *  to the front, as the parkour's quarter pipe), where its origin is in that frame, and how far it's raised. */
export interface SkateFit {
  piece: PieceKind;
  label: string;
  w: number;
  h: number;
  along: "u" | "-v";
  /** its origin in the kind's frame (x, z) */
  at: [number, number];
  /** its z over the floor (a kinked rail stands up off it: its foot 0.3 over the floor) */
  lift: number;
}

/** A piece's run along its +u (from its origin) and its half-width across. */
function spanOf(kind: PieceKind): { lo: number; hi: number; across: number } {
  const d = PIECES[kind];
  const centred = kind === "half" || kind === "mini" || kind === "spine";
  return centred
    ? { lo: -d.size[0] / 2, hi: d.size[0] / 2, across: d.size[1] }
    : { lo: 0, hi: d.size[0], across: d.size[1] };
}
function fit(piece: PieceKind, label: string, along: SkateFit["along"], flush = false, lift = 0): SkateFit {
  const { lo, hi, across } = spanOf(piece);
  const len = hi - lo;
  const tiles = (m: number) => Math.ceil(m - 1e-6);
  if (along === "u") {
    const w = tiles(len);
    const h = tiles(across);
    return { piece, label, w, h, along, at: [(w - len) / 2 - lo, h / 2], lift };
  }
  const w = tiles(across);
  const h = tiles(len);
  // (back flush with the footprint's back edge — a deck against a wall —, or in the middle of it)
  return { piece, label, w, h, along, at: [w / 2, flush ? hi : hi + (h - len) / 2], lift };
}
const KINK = PIECES.kinkrail.lines[0].pts;
export const SKATE_FITS: Record<string, SkateFit> = {
  sk_quarter: fit("quarter", "Quarter pipe (skate)", "-v", true),
  sk_vert: fit("vert", "Vert ramp", "-v", true),
  sk_mini: fit("mini", "Mini ramp", "u"),
  sk_kicker: fit("kicker", "Kicker", "-v"),
  sk_funbox: fit("funbox", "Fun box", "u"),
  sk_ledge: fit("ledge", "Skate ledge", "u"),
  sk_manualpad: fit("manualpad", "Manual pad", "u"),
  sk_spine: fit("spine", "Spine", "-v"),
  sk_rail: fit("rail", "Flat rail", "u"),
  // (its foot flat 0.3 over the floor, its top flat 2 m up)
  sk_kinkrail: fit("kinkrail", "Kinked rail", "u", false, 0.3 - KINK[KINK.length - 1][2]),
};
export const SKATE_KINDS = Object.keys(SKATE_FITS);

/** A point of a piece (its u, w) in its kind's frame (x across, z down it). */
export function fitPoint(f: SkateFit, u: number, w: number): [number, number] {
  return f.along === "u" ? [f.at[0] + u, f.at[1] + w] : [f.at[0] + w, f.at[1] - u];
}

/** What a placed thing (the world's objects: x, y its footprint's corner and `yaw` its quarter turn; or with
 *  props.free its middle and any yaw — shared free-things.ts) is as a piece: where its origin and +u are. */
function thingPiece(
  o: { kind: string; x: number; y: number; rot?: number; yaw?: number; props?: Record<string, unknown> | null },
  f: SkateFit,
): { x: number; y: number; yaw: number } {
  const yaw = o.yaw ?? (o.rot ?? 0) * Q;
  const [fx, fz] = fitPoint(f, 0, 0);
  const plus = f.along === "u" ? 0 : -Q;
  if (o.props?.free === true) {
    const [du, dv] = [fx - f.w / 2, fz - f.h / 2];
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    return { x: o.x + du * c - dv * s, y: o.y + du * s + dv * c, yaw: yaw + plus };
  }
  // (a quarter turn, as shapes turnPoint: each turn (u, v) → (h − v, u))
  const q = (((Math.round(yaw / Q) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  let [X, Y, W, H] = [fx, fz, f.w, f.h];
  for (let i = 0; i < q; i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  return { x: o.x + X, y: o.y + Y, yaw: q * Q + plus };
}

/** The built park pieces (F6a, `sk_*`) among a floor's things, as pieces: those on the ground floor (props.level
 *  0 or none — out of doors), z the floor's (`groundAt` there, else 0) plus the kind's lift. */
export function piecesOfThings(
  objects: Iterable<{
    kind: string;
    x: number;
    y: number;
    rot?: number;
    yaw?: number;
    props?: { level?: unknown; free?: unknown } | Record<string, unknown> | null;
  }>,
  groundAt?: (x: number, y: number) => number,
): PiecePlace[] {
  const out: PiecePlace[] = [];
  for (const o of objects) {
    const f = SKATE_FITS[o.kind];
    if (!f) continue;
    const level = Number((o.props as { level?: unknown } | null | undefined)?.level ?? 0);
    if (level !== 0) continue;
    const p = thingPiece(o as Parameters<typeof thingPiece>[0], f);
    out.push({ kind: f.piece, x: p.x, y: p.y, z: (groundAt?.(p.x, p.y) ?? 0) + f.lift, yaw: p.yaw });
  }
  return out;
}

// ── the walkers' solids: stepped boxes under the riding surface ───────────────────────────────────────────────

/** A box of a piece, in its own plan (u, w) and z over its z: its middle, half-sizes, the plan way of its +u
 *  (rad, from the piece's +u); `rail`: a rail's (Flowmotion grinds it), else the ramp's body. */
export interface PieceBox {
  cu: number;
  cw: number;
  hu: number;
  hw: number;
  a: number;
  z0: number;
  z1: number;
  rail: boolean;
}

/** The tops of a profile as steps along u: gentle stretches (≤ 45°) in steps `rise` high, each as high as the
 *  surface's lowest over it (walked up: never over the ramp, under it by a step at most); steep stretches one
 *  block to their highest (a wall: run up, as the parkour's quarter pipe). [u0, u1, top], none on the ground. */
export function profileSteps(prof: Profile, rise = 0.12): [number, number, number][] {
  const du = 0.02;
  const n = Math.max(1, Math.ceil((prof.uMax - prof.uMin) / du));
  const us: number[] = [];
  const hs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = prof.uMin + ((prof.uMax - prof.uMin) * i) / n;
    us.push(u);
    // (just inside its ends: the top there, not the ground past them)
    const t = prof.topAt(Math.min(prof.uMax - 1e-6, Math.max(prof.uMin + 1e-6, u)));
    hs.push(t ? t.z : 0);
  }
  const sl = (i: number) => (hs[i + 1] - hs[i]) / (us[i + 1] - us[i]);
  // (a stretch's kind: steep, flat, or gentle up or down — a step is one kind: a box's flat top its own height)
  const kind = (i: number) => {
    const s = sl(i);
    return Math.abs(s) > 1 ? 2 : Math.abs(s) < 0.02 ? 0 : Math.sign(s);
  };
  const steps: [number, number, number][] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    let top: number;
    if (kind(i) === 2) {
      while (j < n && kind(j) === 2) j++;
      top = Math.max(...hs.slice(i, j + 1));
    } else {
      const k0 = kind(i);
      let lo = Math.min(hs[i], hs[j]);
      let hi = Math.max(hs[i], hs[j]);
      while (j < n && kind(j) === k0) {
        const nlo = Math.min(lo, hs[j + 1]);
        const nhi = Math.max(hi, hs[j + 1]);
        if (nhi - nlo > rise) break;
        lo = nlo;
        hi = nhi;
        j++;
      }
      top = lo;
    }
    const last = steps[steps.length - 1];
    if (last && Math.abs(last[2] - top) < 1e-6) last[1] = us[j];
    else steps.push([us[i], us[j], top]);
    i = j;
  }
  return steps.filter((s) => s[2] > 0.03);
}

/** A piece's solids (its own frame): its surfaces' steps (a line sweep's across its width; a bowl corner's in
 *  7.5° sectors, each a box tangent to its ring) and its rails (a thin wall to the bar, a piece a segment, the
 *  slopes in 1.5 m pieces at their middle's height). */
export function pieceBoxes(pc: { kind: PieceKind; width?: number }): PieceBox[] {
  const def = PIECES[pc.kind];
  const W = (pc.width ?? def.size[1]) / def.size[1];
  const out: PieceBox[] = [];
  for (const s of def.surfaces) {
    const steps = profileSteps(s.prof);
    if (s.sweep === "line") {
      const turn = s.turn ?? 0;
      const k = Math.abs(turn) > 1e-6 ? -1 : 1;
      const [w0, w1] = [s.w0 * W, s.w1 * W];
      for (const [u0, u1, top] of steps)
        out.push({
          cu: (s.du ?? 0) + (k * (u0 + u1)) / 2,
          cw: (s.dw ?? 0) + (k * (w0 + w1)) / 2,
          hu: (u1 - u0) / 2,
          hw: (w1 - w0) / 2,
          a: 0,
          z0: 0,
          z1: top,
          rail: false,
        });
      continue;
    }
    const rIn = s.rIn ?? 0;
    // (each as wide as its sector at its inner edge: none over the sector's sides — into a neighbour's)
    const N = 12;
    const da = (s.w1 - s.w0) / N;
    for (let j = 0; j < N; j++) {
      const t = s.w0 + (j + 0.5) * da;
      // (a long step — a steep wall and its deck — in rings 0.4 deep: the slivers between sectors narrow)
      const rings = steps.flatMap(([u0, u1, top]) => {
        const k = Math.max(1, Math.ceil((u1 - u0) / 0.4 - 1e-6));
        return Array.from({ length: k }, (_, i): [number, number, number] => [
          u0 + ((u1 - u0) * i) / k,
          u0 + ((u1 - u0) * (i + 1)) / k,
          top,
        ]);
      });
      for (const [u0, u1, top] of rings) {
        const r0 = rIn + u0;
        const r1 = rIn + u1;
        const rm = (r0 + r1) / 2;
        out.push({
          cu: rm * Math.cos(t),
          cw: rm * Math.sin(t),
          hu: (r1 - r0) / 2,
          hw: Math.tan(da / 2) * r0,
          a: t,
          z0: 0,
          z1: top,
          rail: false,
        });
      }
    }
  }
  for (const ln of def.lines) {
    if (ln.what !== "rail") continue;
    for (let i = 0; i + 1 < ln.pts.length; i++) {
      const [au, aw, az] = ln.pts[i];
      const [bu, bw, bz] = ln.pts[i + 1];
      const L = Math.hypot(bu - au, bw - aw);
      const n = Math.max(1, Math.ceil(L / 1.5 - 1e-6));
      const a = Math.atan2(bw - aw, bu - au);
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        out.push({
          cu: au + (bu - au) * ((t0 + t1) / 2),
          cw: aw + (bw - aw) * ((t0 + t1) / 2),
          // (a little past each end: the pieces overlapping at their joints, no gap in the wall)
          hu: L / n / 2 + 0.03,
          hw: 0.03,
          a,
          z0: 0,
          z1: az + (bz - az) * ((t0 + t1) / 2),
          rail: true,
        });
      }
    }
  }
  return out;
}

/** A piece's box in the floor's plan: its middle (x, y) and the plan way of its +u. */
export function boxInPlan(pc: PiecePlace, b: PieceBox): { x: number; y: number; a: number } {
  const c = Math.cos(pc.yaw);
  const s = Math.sin(pc.yaw);
  return { x: pc.x + b.cu * c - b.cw * s, y: pc.y + b.cu * s + b.cw * c, a: pc.yaw + b.a };
}

/** A build menu kind's solids (fam/skate.ts SHAPES, kept there as plain numbers — the page's catalog doesn't
 *  load the skate: parks.test.ts holds the two together): its piece's boxes in its frame (u across, v down, y up),
 *  the tallest first. A ledge's 0.45 a hair more, so it's plainly a wall to a walker (jumped onto, not climbed). */
export function skateKindParts(
  kind: string,
): { u0: number; v0: number; u1: number; v1: number; y0: number; y1: number }[] {
  const f = SKATE_FITS[kind];
  const parts = pieceBoxes({ kind: f.piece }).map((b) => {
    const [x0, z0] = fitPoint(f, b.cu - b.hu, b.cw - b.hw);
    const [x1, z1] = fitPoint(f, b.cu + b.hu, b.cw + b.hw);
    const top = f.lift + b.z1;
    return {
      u0: Math.min(x0, x1),
      v0: Math.min(z0, z1),
      u1: Math.max(x0, x1),
      v1: Math.max(z0, z1),
      y0: 0,
      y1: top === PIECES.ledge.height ? top + 0.01 : top,
    };
  });
  // (boxes side by side as high — a spine's two walls at its crest — one box)
  const e = 1e-6;
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const [a, b] = [parts[i], parts[j]];
      if (Math.abs(a.y1 - b.y1) > e) continue;
      const sameU = Math.abs(a.u0 - b.u0) < e && Math.abs(a.u1 - b.u1) < e;
      const sameV = Math.abs(a.v0 - b.v0) < e && Math.abs(a.v1 - b.v1) < e;
      if (sameU && (Math.abs(a.v1 - b.v0) < e || Math.abs(b.v1 - a.v0) < e)) {
        a.v0 = Math.min(a.v0, b.v0);
        a.v1 = Math.max(a.v1, b.v1);
      } else if (sameV && (Math.abs(a.u1 - b.u0) < e || Math.abs(b.u1 - a.u0) < e)) {
        a.u0 = Math.min(a.u0, b.u0);
        a.u1 = Math.max(a.u1, b.u1);
      } else continue;
      parts.splice(j, 1);
      j = i;
    }
  return parts.sort((a, b) => b.y1 - a.y1);
}
