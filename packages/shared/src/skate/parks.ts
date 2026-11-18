// The skate's parks (docs/plan/103-the-skate.md F6a, F7c): the town's two — an indoor hall in a disused warehouse
// and an outdoor concrete park east of Church Street — as pieces (pieces.ts) placed on their floors; the build
// menu's park pieces (`sk_*`, fam/skate.ts) as pieces; and every piece's solids for the walkers (Jolt: stepped
// boxes under its riding surface, walked up where it's gentle, a wall where it's steep). Our own layouts, no
// game's level copied. Light: pieces.ts only (grounds.ts reads the parks' rectangles from here).
//
// Frames: the floor's (x east, y south = the Grounds' z, z up), metres; a piece's yaw is the plan way of its +u.

import { MODULE, PIECES, type PieceKind, type PiecePlace, type Profile, radiusAt } from "./pieces.ts";

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
/** The hall's pro shop counter (plan 104): east of its door against the south wall — the Grounds' only fit in the
 *  hall (a solid), drawn with the hall's model; the shop's rack beside it (racks.ts). */
export const SKATE_SHOP = { x: 480.6, z: -509.9, w: 3.2, d: 0.7, h: 1.0 } as const;
/** The outdoor park's ground: concrete, ploughed (grounds.ts groundSurfaceAt `walk`), levelled to `h`. */
export const SKATE_YARD = { x0: 462, z0: -492, x1: 508, z1: -448, h: 1.5 } as const;
/** On the outdoor park's concrete (`pad` m round it)? */
export const inSkateYard = (x: number, z: number, pad = 0) =>
  x >= SKATE_YARD.x0 - pad && x < SKATE_YARD.x1 + pad && z >= SKATE_YARD.z0 - pad && z < SKATE_YARD.z1 + pad;

// ── the layouts (plan 104 F6a): our own, on Tony Hawk's 10 ft module and 4 ft steps, dense lines, a named gap
// every few metres (skate/gaps.ts) ──

const E = MODULE.across;
/** The 4 ft corner's flat radius, a hip's (its centre this far from its walls' feet). */
const CORNER_R = PIECES.qp4corner.surfaces[0].rIn ?? 0.6;
const HIP_R = PIECES.hip.surfaces[2].rIn ?? 2;
const HIP_LEGS = -PIECES.hip.foot[0];
const BANK_LEN = PIECES.bank.size[0];

/** A bowl of 4 ft walls shaped as an L (plan 104's "pocket"): the main floor (its walls' feet) x0..x1 × y0..y1, the
 *  pocket south of its west part to x px, y py; concave corners where its walls meet, the hip at the L's inside
 *  corner. Its walls stretch between them (none where the hip's legs reach a corner). */
function lBowl(x0: number, y0: number, y1: number, px: number): PiecePlace[] {
  const r = CORNER_R;
  // (the hip's centre in the deck past the inside corner; the main floor's east end and the pocket's south end
  // where the hip's legs end at a corner)
  const ox = px + HIP_R;
  const oy = y1 + HIP_R;
  const x1 = ox + HIP_LEGS + r;
  const py = oy + HIP_LEGS + r;
  const wall = (x: number, y: number, yaw: number, a: number, b: number): PiecePlace[] =>
    b - a > 0.01 ? [{ kind: "qp4", x, y, z: 0, yaw, width: b - a }] : [];
  return [
    { kind: "qp4corner", x: x0 + r, y: y0 + r, z: 0, yaw: Math.PI },
    { kind: "qp4corner", x: x1 - r, y: y0 + r, z: 0, yaw: -Q },
    { kind: "qp4corner", x: x1 - r, y: y1 - r, z: 0, yaw: 0 },
    { kind: "qp4corner", x: px - r, y: py - r, z: 0, yaw: 0 },
    { kind: "qp4corner", x: x0 + r, y: py - r, z: 0, yaw: Q },
    { kind: "hip", x: ox, y: oy, z: 0, yaw: Math.PI },
    // north, west (the whole L's), east, the pocket's south
    ...wall((x0 + x1) / 2, y0, -Q, x0 + r, x1 - r),
    ...wall(x0, (y0 + py) / 2, Math.PI, y0 + r, py - r),
    ...wall(x1, (y0 + y1) / 2, 0, y0 + r, y1 - r),
    ...wall((x0 + px) / 2, py, Q, x0 + r, px - r),
  ];
}

/** The hall's (plan 104): the vert ramp with its extension along the west wall; the mezzanine over the pro shop
 *  in the south-west, its 8 ft roll-in east, its drop north and fourteen stairs down north off its west end; 4 ft quarters round the north and
 *  east walls, their corner; a 4 ft spine; the island (a hip on its north-west corner, a bank down its south face,
 *  a rail into the bank); the seven-stair off its deck in the east channel, a bank up to it; a manual pad into a
 *  ledge. */
const HALL_PIECES: PiecePlace[] = (() => {
  const out: PiecePlace[] = [];
  // the vert ramp: 14.48 m along x from the west wall, 12.2 across from the north wall
  out.push({ kind: "halfext", x: 463.54, y: -529.6, z: 0, yaw: 0 });
  // the mezzanine (8 ft) along the south wall: four 10 ft decks; its roll-in off the east end, the drop north
  const my = -508.2 - E / 2;
  for (let k = 0; k < 4; k++) out.push({ kind: "deck8", x: 456.3 + k * E, y: my, z: 0, yaw: 0 });
  out.push({ kind: "qp8", x: 456.3 + 4 * E + PIECES.qp8.size[0], y: my, z: 0, yaw: Math.PI, width: E });
  // its stairs down north off its west end (the fourteen)
  out.push({ kind: "stairs8", x: 456.3 + E / 2, y: -508.2 - E, z: 0, yaw: -Q });
  // the 4 ft quarters round the north and east walls, the corner between
  const north = -535.84 + PIECES.qp4.size[0];
  const east = 499.84 - PIECES.qp4.size[0];
  const cx = east - CORNER_R;
  const cy = north + CORNER_R;
  out.push({ kind: "qp4", x: (471 + cx) / 2, y: north, z: 0, yaw: -Q, width: cx - 471 });
  out.push({ kind: "qp4corner", x: cx, y: cy, z: 0, yaw: -Q });
  out.push({ kind: "qp4", x: east, y: (cy + -511) / 2, z: 0, yaw: 0, width: -511 - cy });
  // the spine, its crest north–south
  out.push({ kind: "spine4", x: 478, y: -527, z: 0, yaw: 0 });
  // the island: the hip on its north-west corner (its legs the west and north faces), a bank down its south
  // face, a flat rail running into the bank from the south
  const hx = 486.3;
  const hy = -526;
  out.push({ kind: "hip", x: hx, y: hy, z: 0, yaw: Math.PI });
  const ix0 = hx - 0.3;
  const ix1 = hx + HIP_LEGS;
  const iy1 = hy + HIP_LEGS;
  out.push({ kind: "bank", x: (ix0 + ix1) / 2, y: iy1 + BANK_LEN, z: 0, yaw: -Q, width: ix1 - ix0 });
  out.push({ kind: "rail", x: (ix0 + ix1) / 2, y: iy1 + BANK_LEN + 0.6 + 5, z: 0, yaw: -Q });
  // the seven: a 4 ft deck in the east channel, a bank up onto it from the north, the stairs down south
  const sx = 493.525;
  const sy0 = -527.5;
  out.push({ kind: "deck4", x: sx, y: sy0, z: 0, yaw: Q });
  out.push({ kind: "bank", x: sx, y: sy0 - BANK_LEN, z: 0, yaw: Q });
  out.push({ kind: "stairs", x: sx, y: sy0 + E, z: 0, yaw: Q });
  // a manual pad into a ledge, west to east, south of the spine
  out.push({ kind: "manualpad", x: 471.5, y: -517, z: 0, yaw: 0 });
  out.push({ kind: "ledge", x: 477.5, y: -517, z: 0, yaw: 0 });
  return out;
})();

/** The yard's (plan 104): the L-bowl ("the pocket") in the east, a bank up to its deck; the plaza west of it — a
 *  4 ft platform with a seven-stair and a bank down its south side, a bank up its north and a rail into that bank;
 *  a ledge, a manual pad, a ledge in a line; the mini ramp and the spine along the north edge; a pyramid; two
 *  kickers facing over a gap. */
const YARD_PIECES: PiecePlace[] = (() => {
  const out: PiecePlace[] = [];
  out.push(...lBowl(488, -478, -471, 493));
  // (its deck reached up a bank from the east)
  out.push({ kind: "bank", x: 501.62 + BANK_LEN, y: -474.5, z: 0, yaw: Math.PI });
  // the plaza's platform: two 10 ft decks; the stairs and a bank down south side by side; a bank up its north
  const px = 466;
  const py0 = -476.5;
  for (const k of [0, 1]) out.push({ kind: "deck4", x: px + E / 2 + k * E, y: py0, z: 0, yaw: Q });
  out.push({ kind: "stairs", x: px + E / 2, y: py0 + E, z: 0, yaw: Q });
  out.push({ kind: "bank", x: px + 1.5 * E, y: py0 + E + BANK_LEN, z: 0, yaw: -Q });
  out.push({ kind: "bank", x: px + E, y: py0 - BANK_LEN, z: 0, yaw: Q, width: 2 * E });
  // a rail into the north bank
  out.push({ kind: "rail", x: px + E / 2, y: py0 - BANK_LEN - 0.6 - 5, z: 0, yaw: Q });
  // a ledge, a manual pad, a ledge, north to south
  out.push({ kind: "ledge", x: 482.5, y: -488, z: 0, yaw: Q });
  out.push({ kind: "manualpad", x: 482.5, y: -482, z: 0, yaw: Q });
  out.push({ kind: "ledge", x: 482.5, y: -476, z: 0, yaw: Q });
  // the mini ramp and the spine along the north edge
  out.push({ kind: "mini", x: 468.05, y: -489.4, z: 0, yaw: 0 });
  out.push({ kind: "spine", x: 476.47, y: -489.4, z: 0, yaw: 0 });
  // the pyramid, south-west
  out.push({ kind: "pyramid", x: 473.5, y: -459.5, z: 0, yaw: 0 });
  // two kickers facing, over a gap
  out.push({ kind: "kicker", x: 465.5, y: -469.3, z: 0, yaw: Q });
  out.push({ kind: "kicker", x: 465.5, y: -461.7, z: 0, yaw: -Q });
  return out;
})();

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
    pieces: HALL_PIECES,
  },
  {
    key: "yard",
    name: "Skate park",
    indoor: false,
    ...SKATE_YARD,
    pieces: YARD_PIECES,
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
      const [w0, w1] = [s.w0 * W, s.w1 * W];
      // (straight or turned back: plan 103's, a box square to the piece; turned any other way — a hip's leg, a
      // pyramid's side — the box turned with it)
      const square = Math.abs(turn) < 1e-6 || Math.abs(Math.abs(turn) - Math.PI) < 1e-6;
      const k = Math.abs(turn) > 1e-6 ? -1 : 1;
      const [ct, st] = [Math.cos(turn), Math.sin(turn)];
      for (const [u0, u1, top] of steps) {
        const [mu, mw] = [(u0 + u1) / 2, (w0 + w1) / 2];
        out.push({
          cu: (s.du ?? 0) + (square ? k * mu : mu * ct - mw * st),
          cw: (s.dw ?? 0) + (square ? k * mw : mu * st + mw * ct),
          hu: (u1 - u0) / 2,
          hw: (w1 - w0) / 2,
          a: square ? 0 : turn,
          z0: 0,
          z1: top,
          rail: false,
        });
      }
      continue;
    }
    // (each as wide as its sector at its inner edge: none over the sector's sides — into a neighbour's; a hip's
    // inner edge is its upper one, toward its centre)
    const N = 12;
    const da = (s.w1 - s.w0) / N;
    const [cu0, cw0, t0] = [s.du ?? 0, s.dw ?? 0, s.turn ?? 0];
    for (let j = 0; j < N; j++) {
      const t = t0 + s.w0 + (j + 0.5) * da;
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
        const r0 = Math.min(radiusAt(s, u0), radiusAt(s, u1));
        const r1 = Math.max(radiusAt(s, u0), radiusAt(s, u1));
        const rm = (r0 + r1) / 2;
        out.push({
          cu: cu0 + rm * Math.cos(t),
          cw: cw0 + rm * Math.sin(t),
          hu: (r1 - r0) / 2,
          // (at a hip's apex, its middle's: nought wide at its inner edge)
          hw: Math.tan(da / 2) * (r0 > 0.05 ? r0 : rm),
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
