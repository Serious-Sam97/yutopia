import { SURFACE } from "@yutopia/shared";
import type { BufferGeometry } from "three";
import { ball, box, cushion, cyl, type Look, type Model, merged, rod, type V3 } from "../kit";
import { P, shade } from "../palette";

// Plan 113 (docs/plan/113-the-furniture-by-hand.md, F3a): the town's buildings' own pieces, in the kit's frame (x
// across the footprint, z down it toward the room — the front at z = h — y up, metres). Measured from life
// (design/furniture-by-hand/refs.md). Their catalog entries, shapes and measures in the shared fam/town.ts.

export const LOOKS: Record<string, readonly string[]> = {
  double_bed: ["Oak, patchwork quilt", "White iron, chenille", "Walnut, wool blanket"],
  wardrobe: ["Oak, two doors", "Painted cream", "Walnut, mid-century"],
  farm_table: ["Scrubbed pine", "Painted base, oak top", "Walnut"],
  pub_table: ["Oak, four legs", "Diner: red Formica, chrome", "Dark wood pedestal"],
  booth_seat: ["Red vinyl, chrome", "Turquoise vinyl", "Oak and green leather"],
  booth_table: ["Red Formica, chrome edge", "Turquoise Formica", "Oak"],
  bar_counter: ["Mahogany and brass", "Diner: chrome and red", "Oak"],
  back_bar: ["Tavern: mirror and bottles", "Diner: urns and pie case", "Oak shelves"],
  hay_bale: ["Hay", "Straw"],
  hay_stack: ["Hay", "Straw"],
  horse_stall: ["Oak boards, black grille", "Red boards, white trim", "Weathered grey"],
  grocery_shelf: ["White steel", "General store oak", "Green steel"],
  checkout: ["Laminate and steel", "Oak counter"],
  produce_stand: ["Wooden crates", "Green steel bins"],
};

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

const T = {
  mahogany: 0x5a2618,
  mahoganyDark: 0x3c170e,
  redVinyl: 0xb3262c,
  turq: 0x3fa7a3,
  formicaRed: 0xc8473f,
  formicaTurq: 0x7cc7c0,
  greenLeather: 0x2f5a3e,
  mirror: 0x9fb2ba,
  hay: 0xd9b45a,
  hayDark: 0xb48e3a,
  straw: 0xe6cf8a,
  strawDark: 0xc9ae66,
  stallRed: 0x9c3326,
  weathered: 0x8a8378,
  quilt: [0xb3434a, 0x3f6e9a, 0xe0c26a, 0x6f9a5a, 0xe9e1cc] as const,
  chenille: 0xf2ede2,
  wool: 0x7a3a34,
  green: 0x3f6b52,
  shelfWhite: 0xe8e8e4,
  belt: 0x26272b,
};

// ── the double bed (2×3) ──────────────────────────────────────────────────────────────────────────
/** A full-size bed (its mattress 1.37 × 1.91) on its frame, its headboard against the wall (z 0), two pillows,
 *  a blanket or quilt turned down at the head; oak with a patchwork quilt, white iron with chenille, walnut with
 *  a wool blanket. */
function doubleBed(m: Model, o: Look) {
  const x0 = 0.3;
  const x1 = 1.7;
  const W = x1 - x0;
  const cx = (x0 + x1) / 2;
  const z0 = 0.06;
  const z1 = 2.1;
  const frame = o.look === 0 ? P.oak : o.look === 1 ? P.white : P.walnut;
  if (o.look === 1) {
    // the iron bedstead: posts, rails and spindles, white enamel
    for (const x of [x0 + 0.02, x1 - 0.02]) {
      m.add(cyl(0.022, 0.022, 1.18, 8), frame, { at: [x, 0, 0.035] });
      m.add(cyl(0.022, 0.022, 0.72, 8), frame, { at: [x, 0, z1 + 0.0] });
      m.add(ball(0.03, 6), P.brass, { at: [x, 1.2, 0.035] });
    }
    m.add(rod(0.016, 0.016, W, "x", 8), frame, { at: [cx, 1.12, 0.035] });
    m.add(rod(0.016, 0.016, W, "x", 8), frame, { at: [cx, 0.62, 0.035] });
    for (let i = 1; i < 9; i++) m.add(cyl(0.008, 0.008, 0.5, 6), frame, { at: [x0 + (W * i) / 9, 0.62, 0.035] });
    m.add(rod(0.016, 0.016, W, "x", 8), frame, { at: [cx, 0.68, z1] });
    m.add(rod(0.016, 0.016, W, "x", 8), frame, { at: [cx, 0.42, z1] });
    for (const x of [x0 + 0.02, x1 - 0.02])
      m.add(rod(0.014, 0.014, z1 - 0.06, "z", 6), frame, { at: [x, 0.3, (z1 + 0.06) / 2] });
  } else {
    // the headboard (panelled), the side rails, the footboard
    m.add(box([W + 0.04, 1.12, 0.06], 0.006), frame, { at: [cx, 0.06 + 0.56, 0.035] });
    m.add(box([W - 0.2, 0.5, 0.012]), shade(frame, 0.85), { at: [cx, 0.8, 0.07] });
    for (const x of [x0 - 0.0, x1]) m.add(box([0.06, 0.3, z1 - z0], 0.004), frame, { at: [x, 0.3, (z0 + z1) / 2] });
    m.add(box([W + 0.04, 0.62, 0.05], 0.006), frame, { at: [cx, 0.31, z1] });
    for (const x of [x0 + 0.02, x1 - 0.02])
      for (const z of [0.035, z1]) m.add(box([0.07, 0.06, 0.07]), shade(frame, 0.8), { at: [x, 0.03, z] });
  }
  // the mattress and box spring
  m.add(box([W - 0.04, 0.18, z1 - z0 - 0.04], 0.03), 0xe9e3d6, { at: [cx, 0.34, (z0 + z1) / 2] });
  m.add(cushion([W - 0.06, 0.16, z1 - z0 - 0.08], 0.12), P.paperWhite, { at: [cx, 0.5, (z0 + z1) / 2] });
  // the cover: over the mattress from the foot, turned down at the head
  const cover = o.look === 0 ? T.quilt[0] : o.look === 1 ? T.chenille : T.wool;
  const cz0 = 0.75;
  m.add(box([W + 0.02, 0.04, z1 - cz0 - 0.02], 0.01), cover, { at: [cx, 0.59, (cz0 + z1) / 2] });
  m.add(box([W + 0.02, 0.3, 0.02]), shade(cover, 0.9), { at: [cx, 0.46, z1 + 0.012] });
  for (const x of [x0 - 0.01, x1 + 0.01])
    m.add(box([0.02, 0.3, z1 - cz0]), shade(cover, 0.9), { at: [x, 0.46, (cz0 + z1) / 2] });
  m.add(box([W + 0.02, 0.05, 0.22], 0.012), P.paperWhite, { at: [cx, 0.6, cz0 - 0.08] });
  if (o.look === 0)
    // the quilt's patches
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 5; j++)
        m.add(box([W / 6 - 0.01, 0.004, 0.24]), T.quilt[Math.floor(rnd(i, j, o.seed) * 5)], {
          at: [x0 + (W / 6) * (i + 0.5), 0.613, cz0 + 0.14 + j * 0.25],
        });
  else if (o.look === 1)
    for (let j = 0; j < 12; j++) m.add(box([W, 0.006, 0.02]), 0xe4ddce, { at: [cx, 0.613, cz0 + 0.06 + j * 0.11] });
  else m.add(box([W + 0.02, 0.006, 0.08]), 0x2a2420, { at: [cx, 0.613, z1 - 0.2] });
  // two pillows against the headboard
  for (const s of [-1, 1])
    m.add(cushion([0.6, 0.13, 0.38], 0.35), P.paperWhite, { at: [cx + s * 0.33, 0.63, 0.3], rot: [-0.25, 0, 0] });
}

// ── the wardrobe (2×1) ────────────────────────────────────────────────────────────────────────────
/** A two-door wardrobe 1.2 wide, 0.6 deep, 2 m tall against the wall: its cornice, doors with their pulls (a
 *  mirror on one), its plinth or legs; oak, painted cream, walnut mid-century. */
function wardrobe(m: Model, o: Look) {
  const c = o.look === 0 ? P.oak : o.look === 1 ? P.cream : P.walnut;
  const x0 = 0.4;
  const x1 = 1.6;
  const cx = 1;
  const legs = o.look === 2 ? 0.18 : 0.08;
  // the carcass
  m.add(box([1.2, 2.0 - legs - 0.06, 0.58], 0.006), c, { at: [cx, legs + (2.0 - legs - 0.06) / 2, 0.32] });
  // the cornice / top
  m.add(box([1.24, 0.06, 0.62], 0.008), shade(c, 0.85), { at: [cx, 1.99, 0.32] });
  if (o.look === 2)
    for (const x of [x0 + 0.08, x1 - 0.08])
      for (const z of [0.1, 0.55]) m.add(cyl(0.02, 0.014, legs, 8), P.walnutDark, { at: [x, 0, z] });
  else m.add(box([1.22, legs, 0.6]), shade(c, 0.7), { at: [cx, legs / 2, 0.32] });
  // the doors: two, a gap down the middle, their panels and pulls
  const dy0 = legs + 0.04;
  const dy1 = 1.9;
  const dh = dy1 - dy0;
  for (const s of [-1, 1]) {
    const dx = cx + s * 0.3;
    m.add(box([0.585, dh, 0.02], 0.004), shade(c, 1.04), { at: [dx, dy0 + dh / 2, 0.62] });
    if (o.look === 1 && s === 1)
      m.add(box([0.38, 1.1, 0.006]), 0xb8c4c8, { at: [dx, dy0 + dh / 2 + 0.1, 0.632], glass: 0.95 });
    else {
      m.add(box([0.44, dh * 0.42, 0.006]), shade(c, 0.9), { at: [dx, dy0 + dh * 0.73, 0.632] });
      m.add(box([0.44, dh * 0.38, 0.006]), shade(c, 0.9), { at: [dx, dy0 + dh * 0.26, 0.632] });
    }
    m.add(cyl(0.008, 0.008, 0.12, 6), o.look === 2 ? P.brass : 0x3a3a3a, { at: [cx + s * 0.04, 1.0, 0.645] });
  }
}

// ── the table for four (1×1) ──────────────────────────────────────────────────────────────────────
/** A bar's or a diner's table for four, its top 0.76 square at 0.75: oak on four legs and an apron, red Formica with
 *  a chrome band on a chrome pedestal, or dark wood on a turned pedestal; a candle or the cruet on it. */
function pubTable(m: Model, o: Look) {
  const H = SURFACE.pub_table ?? 0.75;
  const top = o.look === 0 ? P.oak : o.look === 1 ? T.formicaRed : T.mahoganyDark;
  if (o.look === 0) {
    for (const x of [0.17, 0.83])
      for (const z of [0.17, 0.83])
        m.add(box([0.045, H - 0.04, 0.045]), shade(P.oak, 0.85), { at: [x, (H - 0.04) / 2, z] });
    for (const z of [0.17, 0.83]) m.add(box([0.62, 0.08, 0.02]), shade(P.oak, 0.85), { at: [0.5, H - 0.08, z] });
    for (const x of [0.17, 0.83]) m.add(box([0.02, 0.08, 0.62]), shade(P.oak, 0.85), { at: [x, H - 0.08, 0.5] });
  } else {
    const c = o.look === 1 ? P.chrome : T.mahoganyDark;
    m.add(cyl(0.05, 0.04, H - 0.04, 10), c, { at: [0.5, 0, 0.5] });
    m.add(cyl(0.26, 0.24, 0.03, 16), c, { at: [0.5, 0, 0.5] });
    if (o.look === 2) m.add(ball(0.07, 8), c, { at: [0.5, 0.35, 0.5], scale: [1, 1.6, 1] });
  }
  m.add(box([0.76, 0.035, 0.76], 0.006), top, { at: [0.5, H - 0.0175, 0.5] });
  if (o.look === 1) m.add(box([0.775, 0.03, 0.775]), P.chrome, { at: [0.5, H - 0.035, 0.5] });
  // what's on it, off its middle: a candle in a jar, or the cruet
  if (o.look === 1) {
    m.add(cyl(0.016, 0.016, 0.07, 8), 0xf2f2ee, { at: [0.22, H, 0.22] });
    m.add(cyl(0.016, 0.016, 0.07, 8), 0x2b2a26, { at: [0.27, H, 0.22] });
  } else {
    m.add(cyl(0.035, 0.035, 0.08, 10), 0xc98a3a, { at: [0.22, H, 0.22], glass: 0.6 });
    m.add(cyl(0.012, 0.012, 0.03, 6), 0xffe6b0, { at: [0.22, H + 0.04, 0.22], glow: true });
  }
}

// ── the farmhouse table (2×1) ─────────────────────────────────────────────────────────────────────
/** A farmhouse table for six, 1.8 × 0.9, its top at 0.76 over an apron and four turned legs; scrubbed pine, a
 *  painted base under an oak top, or walnut. */
function farmTable(m: Model, o: Look) {
  const H = SURFACE.farm_table ?? 0.76;
  const top = o.look === 0 ? 0xd9b98a : o.look === 1 ? P.oak : P.walnut;
  const base = o.look === 0 ? 0xc9a571 : o.look === 1 ? 0x56705f : P.walnutDark;
  m.add(box([1.8, 0.04, 0.9], 0.008), top, { at: [1, H - 0.02, 0.5] });
  for (const z of [0.1, 0.9]) m.add(box([1.56, 0.11, 0.025]), base, { at: [1, H - 0.1, z] });
  for (const x of [0.17, 1.83]) m.add(box([0.025, 0.11, 0.7]), base, { at: [x, H - 0.1, 0.5] });
  for (const x of [0.17, 1.83])
    for (const z of [0.12, 0.88]) {
      m.add(cyl(0.035, 0.03, H - 0.04, 8), base, { at: [x, 0, z] });
      m.add(ball(0.045, 6), base, { at: [x, 0.42, z], scale: [1, 0.6, 1] });
    }
  // a jug and a bowl at its middle
  m.add(cyl(0.06, 0.05, 0.2, 10), 0xe9e1cc, { at: [0.9, H, 0.5] });
  m.add(cyl(0.12, 0.08, 0.07, 12), 0x7a4a2a, { at: [1.2, H, 0.48] });
}

// ── the booth's bench (2×1) and table (1×2) ───────────────────────────────────────────────────────
const boothColour = (o: Look) => (o.look === 0 ? T.redVinyl : o.look === 1 ? T.turq : T.greenLeather);
/** A diner booth's bench for two (1.2 long): its seat at 0.46 and its high back, buttoned vinyl with a chrome
 *  edge, on a plinth; its back to the next booth's (z 0), facing its table. */
function boothSeat(m: Model, o: Look) {
  const c = boothColour(o);
  const trim = o.look === 2 ? P.oak : P.chrome;
  const x0 = 0.4;
  const x1 = 1.6;
  const L = x1 - x0;
  // the plinth and frame
  m.add(box([L, 0.32, 0.5], 0.006), o.look === 2 ? P.oak : 0x2a2626, { at: [1, 0.16, 0.38] });
  m.add(box([L, 0.03, 0.52]), trim, { at: [1, 0.335, 0.39] });
  // the seat cushion
  m.add(cushion([L - 0.02, 0.12, 0.5], 0.2), c, { at: [1, 0.4, 0.4] });
  // the back: its panel, its roll, the channels
  m.add(box([L, 0.66, 0.12], 0.01), o.look === 2 ? P.oak : shade(c, 0.85), { at: [1, 0.46 + 0.33, 0.08] });
  m.add(cushion([L - 0.04, 0.6, 0.1], 0.18), c, { at: [1, 0.78, 0.17], rot: [-0.08, 0, 0] });
  if (o.look !== 2)
    for (let i = 1; i < 4; i++)
      m.add(box([0.008, 0.56, 0.01]), shade(c, 0.7), { at: [x0 + (L * i) / 4, 0.78, 0.225], rot: [-0.08, 0, 0] });
  // the chrome cap along its top, a chrome edge down its back's ends
  m.add(rod(0.02, 0.02, L, "x", 8), trim, { at: [1, 1.12, 0.08] });
  for (const x of [x0 + 0.01, x1 - 0.01]) m.add(box([0.02, 0.66, 0.03]), trim, { at: [x, 0.79, 0.15] });
}
/** A booth's table: its Formica top (0.76 wide, 1.18 out from the window) with a chrome band, on a bracket at the
 *  wall and a pedestal at its far end; the napkin box, the sugar, the salt and pepper by the window. */
function boothTable(m: Model, o: Look) {
  const H = SURFACE.booth_table ?? 0.76;
  const top = o.look === 0 ? T.formicaRed : o.look === 1 ? T.formicaTurq : P.oak;
  const band = o.look === 2 ? P.walnutDark : P.chrome;
  m.add(box([0.76, 0.03, 1.16], 0.008), top, { at: [0.5, H - 0.015, 0.6] });
  m.add(box([0.775, 0.035, 1.175]), band, { at: [0.5, H - 0.03, 0.6] });
  // the wall's bracket, the pedestal and its foot
  m.add(box([0.3, 0.06, 0.1]), band, { at: [0.5, H - 0.08, 0.05] });
  m.add(cyl(0.035, 0.035, H - 0.05, 10), band, { at: [0.5, 0, 0.9] });
  m.add(cyl(0.22, 0.2, 0.03, 16), band, { at: [0.5, 0, 0.9] });
  // what's on it by the window
  m.add(box([0.1, 0.12, 0.06]), P.chrome, { at: [0.5, H + 0.06, 0.12] });
  m.add(cyl(0.035, 0.03, 0.11, 10), 0xf2f2ee, { at: [0.36, H, 0.12] });
  m.add(cyl(0.012, 0.012, 0.06, 8), P.chrome, { at: [0.64, H, 0.1] });
  m.add(cyl(0.016, 0.016, 0.07, 8), 0xf2f2ee, { at: [0.6, H, 0.12] });
  m.add(cyl(0.016, 0.016, 0.07, 8), 0x2b2a26, { at: [0.68, H, 0.12] });
}

// ── the bar counter (3×1) and the back bar (3×1) ──────────────────────────────────────────────────
/** A bar's counter, 3 m a section: its top at 1.07 overhanging the customers' side (z h) by 0.16, its front's
 *  raised panels, the brass foot rail on its brackets; the bartender's side (z 0) open over the underbar shelf
 *  and its glass rack. Mahogany and brass (the tavern's), chrome and red (the diner's), oak. */
function barCounter(m: Model, o: Look) {
  const H = SURFACE.bar_counter ?? 1.07;
  const diner = o.look === 1;
  const body = o.look === 0 ? T.mahogany : diner ? T.redVinyl : P.oak;
  const topC = o.look === 0 ? T.mahoganyDark : diner ? 0xe8e4dc : shade(P.oak, 0.85);
  const metal = diner ? P.chrome : P.brass;
  // the front (customers'): panels on the carcass, its kick
  m.add(box([2.96, H - 0.05 - 0.1, 0.06], 0.004), body, { at: [1.5, 0.1 + (H - 0.15) / 2, 0.63] });
  m.add(box([2.96, 0.1, 0.06]), diner ? P.chrome : shade(body, 0.6), { at: [1.5, 0.05, 0.62] });
  if (!diner)
    for (let i = 0; i < 6; i++)
      m.add(box([0.42, 0.62, 0.012]), shade(body, 1.12), { at: [0.27 + i * 0.49, 0.55, 0.665] });
  else for (const y of [0.3, 0.6, 0.9]) m.add(box([2.96, 0.018, 0.012]), P.chrome, { at: [1.5, y, 0.665] });
  // the ends, the underbar shelf behind
  for (const x of [0.04, 2.96]) m.add(box([0.06, H - 0.05, 0.6]), shade(body, 0.85), { at: [x, (H - 0.05) / 2, 0.36] });
  m.add(box([2.88, 0.03, 0.42]), shade(body, 0.7), { at: [1.5, 0.82, 0.3] });
  m.add(box([2.88, 0.03, 0.42]), shade(body, 0.7), { at: [1.5, 0.35, 0.3] });
  for (let i = 0; i < 14; i++)
    m.add(cyl(0.03, 0.035, 0.12, 8), 0xdce6e8, { at: [0.3 + i * 0.18, 0.835, 0.22], glass: 0.7 });
  // the top, its overhang over the customers' knees
  m.add(box([3.0, 0.05, 0.78], 0.012), topC, { at: [1.5, H - 0.025, 0.43] });
  if (diner) m.add(box([3.0, 0.05, 0.012]), P.chrome, { at: [1.5, H - 0.025, 0.825] });
  // the foot rail on its brackets
  m.add(rod(0.025, 0.025, 2.94, "x", 10), metal, { at: [1.5, 0.2, 0.86] });
  for (const x of [0.2, 1.0, 1.8, 2.7]) m.add(box([0.03, 0.03, 0.2]), metal, { at: [x, 0.2, 0.76] });
  if (!diner)
    for (const x of [0.4, 1.5, 2.6]) m.add(rod(0.012, 0.012, 0.14, "z", 6), metal, { at: [x, H - 0.08, 0.84] });
}
/** The back bar against the wall: its cabinets to 0.92, a mirror over them between pilasters, glass shelves of
 *  bottles, its crown; or the diner's: a steel back counter with the coffee urns, the milkshake mixer and a pie
 *  case, low under its windows; or plain oak shelves. */
function backBar(m: Model, o: Look) {
  const H = SURFACE.back_bar ?? 0.92;
  const c = o.look === 0 ? T.mahogany : o.look === 1 ? 0xc9ccce : P.oak;
  // the cabinets and their doors (0.6 deep: refs.md §1)
  m.add(box([2.96, H - 0.04, 0.58], 0.004), shade(c, 0.95), { at: [1.5, (H - 0.04) / 2, 0.32] });
  for (let i = 0; i < 4; i++)
    m.add(box([0.68, H - 0.2, 0.012]), shade(c, 1.08), { at: [0.39 + i * 0.74, H / 2, 0.615] });
  m.add(box([3.0, 0.04, 0.62], 0.006), o.look === 1 ? 0xb7bbbe : shade(c, 0.75), { at: [1.5, H - 0.02, 0.32] });
  if (o.look === 1) {
    // the diner's: the urns, the mixer, the pie case, the menu board
    for (const x of [0.35, 0.75]) {
      m.add(cyl(0.12, 0.12, 0.5, 14), P.chrome, { at: [x, H, 0.25] });
      m.add(cyl(0.05, 0.02, 0.08, 10), P.ink, { at: [x, H + 0.5, 0.25] });
      m.add(box([0.03, 0.05, 0.08]), P.ink, { at: [x, H + 0.12, 0.4] });
    }
    m.add(box([0.22, 0.05, 0.22]), 0x6ab0c8, { at: [1.2, H + 0.025, 0.25] });
    m.add(box([0.1, 0.5, 0.1]), 0x6ab0c8, { at: [1.2, H + 0.3, 0.2] });
    m.add(cyl(0.05, 0.04, 0.18, 10), P.chrome, { at: [1.2, H + 0.08, 0.32] });
    // the pie case
    m.add(box([0.9, 0.5, 0.4]), 0xdce6e8, { at: [2.3, H + 0.25, 0.24], glass: 0.35 });
    for (const [y, k] of [
      [H + 0.06, 0],
      [H + 0.28, 1],
    ] as const)
      for (let i = 0; i < 3; i++) {
        m.add(cyl(0.11, 0.11, 0.004, 14), P.paperWhite, { at: [2.0 + i * 0.3, y, 0.24] });
        m.add(cyl(0.1, 0.1, 0.05, 14), [0xd9a35e, 0xc4302b, 0xf3e3b8][(i + k) % 3], {
          at: [2.0 + i * 0.3, y + 0.004, 0.24],
        });
      }
    return;
  }
  // the mirror and its frame, the pilasters, the crown
  const y0 = H + 0.06;
  const y1 = 2.2;
  if (o.look === 0) {
    m.add(box([2.8, y1 - y0, 0.01]), T.mirror, { at: [1.5, (y0 + y1) / 2, 0.02], glass: 0.15 });
    for (const x of [0.05, 1.5, 2.95])
      m.add(box([0.1, y1 - y0 + 0.1, 0.08], 0.004), c, { at: [x, (y0 + y1) / 2, 0.05] });
    m.add(box([3.0, 0.2, 0.3], 0.006), c, { at: [1.5, 2.32, 0.15] });
    m.add(box([3.0, 0.04, 0.34]), shade(c, 0.75), { at: [1.5, 2.42, 0.17] });
  } else {
    for (const x of [0.05, 2.95]) m.add(box([0.05, y1 - y0, 0.3]), c, { at: [x, (y0 + y1) / 2, 0.15] });
    m.add(box([3.0, 0.04, 0.3]), c, { at: [1.5, y1, 0.15] });
  }
  // the shelves of bottles
  const colours = [0x3d6b3a, 0x7a3a1a, 0xd9c48a, 0x2b4a6b, 0xe6e2d8, 0x6b2a2a, 0xc98a3a];
  for (const y of [1.25, 1.7]) {
    m.add(box([2.8, 0.02, 0.24]), o.look === 0 ? 0xdce6e8 : c, {
      at: [1.5, y, 0.14],
      ...(o.look === 0 ? { glass: 0.5 } : {}),
    });
    const bottles: BufferGeometry[] = [];
    for (let i = 0; i < 18; i++) {
      const x = 0.18 + i * 0.15 + rnd(i, y, o.seed) * 0.03;
      const h = 0.22 + rnd(i, 2, o.seed) * 0.1;
      const k = Math.floor(rnd(i, 3 + y, o.seed) * colours.length);
      m.add(cyl(0.035, 0.035, h, 8), colours[k], { at: [x, y + 0.01, 0.13], glass: 0.85 });
      bottles.push(cyl(0.012, 0.012, 0.08, 6).translate(x, y + 0.01 + h, 0.13));
    }
    m.add(merged(bottles), 0x2a2420);
  }
  // glasses upturned on the top
  for (let i = 0; i < 10; i++) m.add(cyl(0.035, 0.03, 0.1, 8), 0xdce6e8, { at: [0.3 + i * 0.26, H, 0.36], glass: 0.6 });
}

// ── hay: a bale (1×1), a stack (2×2) ───────────────────────────────────────────────────────────────
const hayOf = (o: Look): [number, number] => (o.look === 0 ? [T.hay, T.hayDark] : [T.straw, T.strawDark]);
/** One small square bale: 0.9 long, 0.46 wide, 0.36 high, its two twines round it. */
function bale(m: Model, at: V3, o: Look, i: number, turn = 0) {
  const [c, d] = hayOf(o);
  m.add(box([0.9, 0.36, 0.46], 0.03), shade(c, 0.92 + rnd(i, 1, o.seed) * 0.16), {
    at: [at[0], at[1] + 0.18, at[2]],
    rot: [0, turn, 0],
  });
  for (const s of [-0.22, 0.22]) {
    const dx = Math.cos(turn) * s;
    const dz = -Math.sin(turn) * s;
    m.add(box([0.012, 0.37, 0.47]), d, { at: [at[0] + dx, at[1] + 0.18, at[2] + dz], rot: [0, turn, 0] });
  }
}
function hayBale(m: Model, o: Look) {
  bale(m, [0.5, 0, 0.5], o, 0);
}
/** A stack of small bales, three high, laid brick-fashion, and a top course part done. */
function hayStack(m: Model, o: Look) {
  let i = 0;
  for (let layer = 0; layer < 3; layer++) {
    const across = layer % 2 === 1;
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 4; b++) {
        const at: V3 = across
          ? [0.27 + b * 0.47, layer * 0.36, 0.5 + a * 0.92]
          : [0.5 + a * 0.92, layer * 0.36, 0.27 + b * 0.47];
        bale(m, at, o, i++, across ? Math.PI / 2 : 0);
      }
  }
  for (let b = 0; b < 2; b++) bale(m, [0.5 + b * 0.92, 1.08, 1.0], o, i++, 0);
}

// ── the horse stall (3×4) ─────────────────────────────────────────────────────────────────────────
/** A box stall 3.0 wide, 3.9 deep: its sides boarded to 1.4 with a grille over to 2.2, its front (z h) with a
 *  sliding door on a track and its grille; a water bucket and a hay net inside. Oak with black steel, red boards
 *  with white trim, weathered grey. */
function horseStall(m: Model, o: Look) {
  const boards = o.look === 0 ? P.oak : o.look === 1 ? T.stallRed : T.weathered;
  const steel = o.look === 1 ? P.white : 0x1f2022;
  const D = 3.9;
  const bars = (x0: number, x1: number, z0: number, z1: number) => {
    const geos: BufferGeometry[] = [];
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.09);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      geos.push(cyl(0.008, 0.008, 0.78, 5).translate(x0 + (x1 - x0) * t, 1.4, z0 + (z1 - z0) * t));
    }
    m.add(merged(geos), steel);
  };
  // the sides
  for (const x of [0.035, 2.965]) {
    m.add(box([0.05, 1.4, D - 0.05], 0.003), boards, { at: [x, 0.7, (D - 0.05) / 2 + 0.02] });
    for (let k = 1; k < 8; k++)
      m.add(box([0.054, 0.006, D - 0.05]), shade(boards, 0.8), { at: [x, k * 0.175, (D - 0.05) / 2 + 0.02] });
    bars(x, x, 0.05, D - 0.08);
    m.add(box([0.06, 0.04, D - 0.03]), steel, { at: [x, 2.2, (D - 0.03) / 2 + 0.02] });
    m.add(box([0.06, 0.04, D - 0.03]), steel, { at: [x, 1.41, (D - 0.03) / 2 + 0.02] });
  }
  // its back, boarded to 1.4 (stood against a wall or not)
  m.add(box([2.86, 1.4, 0.05], 0.003), shade(boards, 0.95), { at: [1.5, 0.7, 0.045] });
  // the front: a fixed panel left, the sliding door right on its track
  const z = D;
  m.add(box([1.4, 1.4, 0.05], 0.003), boards, { at: [0.75, 0.7, z] });
  m.add(box([1.5, 1.4, 0.05], 0.003), shade(boards, 1.06), { at: [2.2, 0.7, z + 0.03] });
  for (let k = 1; k < 8; k++) m.add(box([2.9, 0.006, 0.06]), shade(boards, 0.8), { at: [1.5, k * 0.175, z + 0.015] });
  bars(0.06, 2.94, z, z);
  m.add(box([2.94, 0.05, 0.08]), steel, { at: [1.5, 2.2, z] });
  m.add(box([2.94, 0.04, 0.07]), steel, { at: [1.5, 1.41, z] });
  m.add(box([3.0, 0.06, 0.06]), steel, { at: [1.5, 2.28, z + 0.04] });
  m.add(box([0.04, 0.12, 0.05]), steel, { at: [1.55, 1.0, z + 0.06] });
  // a bucket and a hay net in the corner
  m.add(cyl(0.14, 0.16, 0.3, 12), 0x3a5a7a, { at: [0.35, 0.9, 0.3] });
  m.add(ball(0.28, 6), T.hay, { at: [2.6, 1.6, 0.35], scale: [1, 1.3, 0.8] });
  // the bedding
  m.add(box([2.86, 0.04, D - 0.1]), T.straw, { at: [1.5, 0.02, D / 2] });
}

// ── the grocery's shelves (2×1), checkout (2×1), produce stand (2×1) ───────────────────────────────
const GOODS = [0xc4302b, 0xe8b830, 0x2f6fb5, 0x3d8a4a, 0xf0ebe0, 0xd9772f, 0x7a3a8a, 0x8a5a36];
/** A double-sided gondola 1.9 long, 0.9 deep, 1.6 tall: its base deck, four shelves a side full of goods (cans,
 *  boxes, jars), its price strips, an end panel each end. */
function groceryShelf(m: Model, o: Look) {
  const frame = o.look === 0 ? T.shelfWhite : o.look === 1 ? P.oak : T.green;
  m.add(box([1.88, 1.56, 0.06]), shade(frame, 0.95), { at: [1, 0.06 + 0.78, 0.5] });
  m.add(box([1.92, 0.12, 0.86]), shade(frame, 0.85), { at: [1, 0.06, 0.5] });
  for (const x of [0.06, 1.94]) m.add(box([0.04, 1.62, 0.86]), frame, { at: [x, 0.81, 0.5] });
  m.add(box([1.92, 0.05, 0.3]), frame, { at: [1, 1.62, 0.5] });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const y = 0.14 + k * 0.38;
      const z = 0.5 + side * 0.24;
      m.add(box([1.84, 0.02, 0.4]), frame, { at: [1, y, z] });
      m.add(box([1.84, 0.03, 0.006]), 0xf2f2ee, { at: [1, y - 0.01, z + side * 0.2] });
      // the goods along it
      const goods: BufferGeometry[][] = GOODS.map(() => []);
      let x = 0.12;
      let i = 0;
      while (x < 1.85) {
        const kind = Math.floor(rnd(i, k * 3 + side, o.seed) * GOODS.length);
        const tall = 0.12 + rnd(i, 7 + k, o.seed) * 0.16;
        const wide = 0.07 + rnd(i, 9, o.seed) * 0.1;
        if (x + wide > 1.88) break;
        const can = rnd(i, 11, o.seed) < 0.35;
        goods[kind].push(
          (can ? cyl(wide / 2.4, wide / 2.4, tall * 0.8, 8) : box([wide - 0.01, tall, 0.16])).translate(
            x + wide / 2,
            y + 0.01 + (can ? 0 : tall / 2),
            z + side * 0.06,
          ),
        );
        x += wide;
        i++;
      }
      goods.forEach((g, c) => {
        if (g.length) m.add(merged(g), GOODS[c]);
      });
    }
  }
}
/** A checkout: the counter (its top at 0.9) with a belt along it to the cashier's end, the till on its stand, a
 *  card reader, the bagging end (x 1.45–1.9), the gum and sweets rack on the customers' side (z h). */
function checkout(m: Model, o: Look) {
  const H = SURFACE.checkout ?? 0.9;
  const c = o.look === 0 ? 0xd6d1c6 : P.oak;
  m.add(box([1.9, H - 0.04, 0.62], 0.005), c, { at: [1, (H - 0.04) / 2, 0.42] });
  m.add(box([1.94, 0.04, 0.66], 0.006), o.look === 0 ? 0xb7bbbe : shade(P.oak, 0.85), { at: [1, H - 0.02, 0.42] });
  // the belt
  m.add(box([0.8, 0.02, 0.42]), T.belt, { at: [1.0, H + 0.01, 0.45] });
  // the till and its screen, the card reader
  m.add(box([0.38, 0.12, 0.32]), 0x2a2a2c, { at: [0.35, H + 0.06, 0.38] });
  m.add(box([0.3, 0.22, 0.03]), 0x1d2526, { at: [0.35, H + 0.25, 0.3], rot: [-0.3, 0, 0] });
  m.add(box([0.26, 0.16, 0.01]), 0x7fb0c8, { at: [0.35, H + 0.25, 0.318], rot: [-0.3, 0, 0], glow: true });
  m.add(box([0.08, 0.14, 0.05]), 0x2a2a2c, { at: [0.7, H + 0.07, 0.7] });
  // the sweets rack on the customers' side
  m.add(box([0.5, 0.7, 0.18]), 0x3a3a3c, { at: [1.6, 0.4, 0.88] });
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < 5; i++)
      m.add(box([0.08, 0.1, 0.03]), GOODS[(r * 5 + i) % GOODS.length], { at: [1.4 + i * 0.1, 0.16 + r * 0.16, 0.975] });
}
/** A produce stand: crates tilted toward the customers (z h) on a frame, full of apples, oranges, greens,
 *  potatoes; its price cards. */
function produceStand(m: Model, o: Look) {
  const c = o.look === 0 ? P.oak : T.green;
  m.add(box([1.92, 0.5, 0.86], 0.004), shade(c, 0.85), { at: [1, 0.25, 0.48] });
  const fruit = [0xc4302b, 0xe88a2a, 0x5f8a43, 0x9b7a4a, 0xe8c43a, 0x7a2a5a];
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 3; i++) {
      const cx = 0.35 + i * 0.64;
      const cz = 0.3 + r * 0.42;
      const y = 0.5 + (1 - r) * 0.22;
      m.add(box([0.6, 0.16, 0.4], 0.004), c, { at: [cx, y + 0.08, cz], rot: [0.25, 0, 0] });
      const k = (r * 3 + i) % fruit.length;
      const balls: BufferGeometry[] = [];
      for (let a = 0; a < 5; a++)
        for (let b = 0; b < 3; b++)
          balls.push(
            ball(0.045 + rnd(a, b, o.seed + k) * 0.01, 5).translate(
              cx - 0.22 + a * 0.11,
              y + 0.18 - b * 0.03,
              cz - 0.12 + b * 0.12,
            ),
          );
      m.add(merged(balls), fruit[k]);
      m.add(box([0.1, 0.06, 0.004]), P.paperWhite, { at: [cx, y + 0.12, cz + 0.21] });
    }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  double_bed: doubleBed,
  wardrobe,
  farm_table: farmTable,
  pub_table: pubTable,
  booth_seat: boothSeat,
  booth_table: boothTable,
  bar_counter: barCounter,
  back_bar: backBar,
  hay_bale: hayBale,
  hay_stack: hayStack,
  horse_stall: horseStall,
  grocery_shelf: groceryShelf,
  checkout,
  produce_stand: produceStand,
};
