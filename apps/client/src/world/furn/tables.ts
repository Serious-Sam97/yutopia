import { ball, box, cushion, cyl, extrude, type Look, lathe, type Model, rod, roundRect, taper, tube } from "./kit";
import { P, shade } from "./palette";

// Desks and tables (docs/plan/67-the-furniture.md, phase 3), in the kit's frame: x across the
// footprint, z down it, y up. A desk's sitters are on its −z side (the catalog's rot 0: its chairs
// to the north); a 2×1 desk often seats two, a tile each, so nothing hangs under it where knees go.
// Tops reach to a tenth of a tile from the footprint's edge: every quarter-tile cell a tabletop
// stands in (shared tops.ts) has its middle on the top. Heights: shared furniture.ts SURFACE_NEXT.

export const TABLE_LOOKS = {
  desk: ["Walnut desk", "Oak sled desk", "Cream desk", "Black ash desk"],
  meeting_table: ["Boardroom table"],
  coffee_table: ["Coffee table"],
  side_table: ["Side table"],
  reception: ["Reception desk"],
  counter: ["Stone counter", "Teak counter"],
} as const;

const DESK = 0.74;

// ── the desk (2×1) ──────────────────────────────────────────────────────────────────────────────
interface DeskFinish {
  top: number;
  edge: number;
  frame: number;
  panel: number;
  foot: number;
}
const DESKS: DeskFinish[] = [
  // walnut with a teak top, slab ends, brass shoes
  { top: P.teak, edge: shade(P.teak, 1.18), frame: P.walnut, panel: P.walnutDark, foot: P.brass },
  // light oak on white steel sleds
  { top: P.oakLight, edge: shade(P.oakLight, 1.1), frame: P.white, panel: shade(P.oakLight, 0.86), foot: P.rubber },
  // cream laminate, a rust modesty panel, chrome C-legs
  { top: P.cream, edge: P.rust, frame: P.chrome, panel: P.rust, foot: P.rubber },
  // black ash with a graphite top on A-frame trestles
  { top: P.graphite, edge: P.ash, frame: P.ash, panel: P.ash, foot: P.steel },
];

export function desk(m: Model, o: Look) {
  const f = DESKS[o.look] ?? DESKS[0];
  const x0 = 0.03;
  const x1 = 1.97;
  const z0 = 0.06;
  const z1 = 0.94;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const th = 0.032;
  const under = DESK - th;
  // the top, its front edge banded, two grommets at the back for the cables
  m.add(box([x1 - x0, th, z1 - z0], 0.006, 2), f.top, { at: [cx, DESK - th / 2, cz] });
  m.add(box([x1 - x0 - 0.01, th * 0.75, 0.012], 0.003), f.edge, { at: [cx, DESK - th / 2, z0 + 0.002] });
  for (const x of [x0 + 0.35, x1 - 0.35]) {
    m.add(cyl(0.032, 0.032, 0.004, 16), P.plastic, { at: [x, DESK, z1 - 0.1] });
    m.add(cyl(0.022, 0.022, 0.005, 12), P.ink, { at: [x, DESK + 0.001, z1 - 0.1] });
  }
  // the ends: each look's own legs, at the far left and right (the knees between them free)
  for (const s of [-1, 1]) {
    const x = s < 0 ? x0 + 0.05 : x1 - 0.05;
    if (o.look === 1) {
      // a steel sled: two uprights on a foot, a rail under the top
      for (const z of [z0 + 0.06, z1 - 0.06])
        m.add(box([0.04, under - 0.03, 0.04], 0.008), f.frame, { at: [x, under / 2 + 0.015, z] });
      m.add(box([0.04, 0.03, z1 - z0 - 0.04], 0.008), f.frame, { at: [x, 0.015, cz] });
      m.add(box([0.04, 0.03, z1 - z0 - 0.1], 0.008), f.frame, { at: [x, under - 0.015, cz] });
    } else if (o.look === 2) {
      // a chrome C: down the back, along the floor to the front
      m.add(
        tube(
          [
            [x, under, z0 + 0.12],
            [x, under - 0.04, z1 - 0.1],
            [x, under * 0.5, z1 - 0.06],
            [x, 0.06, z1 - 0.08],
            [x, 0.02, z1 - 0.3],
            [x, 0.02, z0 + 0.1],
          ],
          0.019,
          8,
          24,
        ),
        f.frame,
      );
      m.add(box([0.05, 0.02, 0.06], 0.006), f.foot, { at: [x, 0.01, z0 + 0.1] });
    } else if (o.look === 3) {
      // an A-frame trestle: two legs leaning to the floor, a bar between them
      for (const t of [-1, 1])
        m.add(box([0.045, under / Math.cos(0.18), 0.045], 0.008), f.frame, {
          at: [x, under / 2, cz + t * (0.18 + Math.tan(0.18) * under * 0.0)],
          rot: [-t * 0.18, 0, 0],
        });
      m.add(box([0.04, 0.035, z1 - z0 - 0.2], 0.008), f.frame, { at: [x, under - 0.02, cz] });
      m.add(box([0.035, 0.035, 0.56], 0.008), f.frame, { at: [x, 0.22, cz] });
    } else {
      // a walnut slab end, a brass shoe under it
      m.add(box([0.05, under, z1 - z0 - 0.04], 0.008, 2), f.frame, { at: [x, under / 2, cz] });
      m.add(box([0.058, 0.025, z1 - z0 - 0.02], 0.004), f.foot, { at: [x, 0.0125, cz] });
    }
  }
  // the modesty panel at the back, a cable tray hung under the top behind the knees
  m.add(box([x1 - x0 - 0.16, 0.34, 0.016], 0.004), f.panel, { at: [cx, under - 0.2, z1 - 0.05] });
  m.add(box([x1 - x0 - 0.5, 0.008, 0.12], 0.002), P.steel, { at: [cx, under - 0.09, z1 - 0.13] });
  for (const s of [-1, 1])
    m.add(box([0.008, 0.07, 0.12], 0.002), P.steel, { at: [cx + s * ((x1 - x0 - 0.5) / 2), under - 0.055, z1 - 0.13] });
  m.add(
    tube(
      [
        [cx - 0.6, under - 0.08, z1 - 0.12],
        [cx - 0.1, under - 0.075, z1 - 0.14],
        [cx + 0.5, under - 0.08, z1 - 0.12],
      ],
      0.008,
      5,
      12,
    ),
    P.ink,
  );
}

// ── the meeting table (6×2) ───────────────────────────────────────────────────────────────────────
/** The War Room's: a walnut top with an inlaid border (its corners round only so far that every
 *  cell a tabletop uses stays on it), two walnut columns on aluminium
 *  feet, the planning-poker VFD strip down its middle (lit). */
export function meetingTable(m: Model, _o: Look) {
  const th = 0.045;
  // the top: a long slab, a lighter band inlaid round it
  const top = extrude(roundRect(5.9, 1.86, 0.22, 4), th, 0.008, 2).rotateX(Math.PI / 2);
  m.add(top, P.walnut, { at: [3, DESK - th / 2, 1] });
  const band = extrude(roundRect(5.6, 1.56, 0.16, 4), 0.004, 0, 1).rotateX(Math.PI / 2);
  m.add(band, shade(P.walnut, 1.25), { at: [3, DESK + 0.0005, 1] });
  m.add(extrude(roundRect(5.52, 1.48, 0.13, 4), 0.004, 0, 1).rotateX(Math.PI / 2), P.walnut, {
    at: [3, DESK + 0.001, 1],
  });
  // the VFD strip: a dark well, the lit digits' band in it
  m.add(box([3.4, 0.006, 0.09], 0.002), P.ink, { at: [3, DESK + 0.003, 1] });
  m.add(box([3.3, 0.004, 0.05]), P.vfd, { at: [3, DESK + 0.0065, 1], glow: true });
  // the columns and their feet
  for (const x of [0.95, 5.05]) {
    m.add(box([0.32, DESK - th - 0.04, 0.9], 0.02, 2), P.walnutDark, { at: [x, (DESK - th - 0.04) / 2 + 0.04, 1] });
    m.add(box([0.56, 0.04, 1.24], 0.01, 2), P.alum, { at: [x, 0.02, 1] });
    m.add(box([0.44, 0.03, 1.1], 0.008), P.walnut, { at: [x, DESK - th - 0.015, 1] });
  }
}

// ── the coffee table (2×1) ────────────────────────────────────────────────────────────────────────
/** Walnut, rounded, on splayed tapered legs; a shelf under it with a magazine or two. Top 0.42. */
export function coffeeTable(m: Model, o: Look) {
  const H = 0.42;
  const th = 0.035;
  m.add(extrude(roundRect(1.9, 0.9, 0.1, 4), th, 0.01, 2).rotateX(Math.PI / 2), P.walnut, {
    at: [1, H - th / 2, 0.5],
  });
  for (const [x, z, sx, sz] of [
    [0.24, 0.22, -1, -1],
    [1.76, 0.22, 1, -1],
    [0.24, 0.78, -1, 1],
    [1.76, 0.78, 1, 1],
  ])
    m.add(taper(cyl(0.024, 0.024, H - th, 10), 1.5, 0, H - th), P.walnut, {
      at: [x, 0, z],
      rot: [-sz * 0.1, 0, sx * 0.1],
    });
  // the shelf, and what's on it
  m.add(box([1.5, 0.018, 0.56], 0.004), shade(P.walnut, 0.9), { at: [1, 0.14, 0.5] });
  if (o.seed > 0.3) {
    m.add(box([0.3, 0.008, 0.22], 0.002), P.rust, { at: [0.6, 0.153, 0.48], rot: [0, 0.2, 0] });
    m.add(box([0.28, 0.006, 0.21], 0.002), P.paper, { at: [0.62, 0.16, 0.47], rot: [0, -0.1, 0] });
  }
}

// ── the side table (1×1) ──────────────────────────────────────────────────────────────────────────
/** A small square table on turned legs, a drawer, a shelf low down. Top 0.55. */
export function sideTable(m: Model, _o: Look) {
  const H = 0.55;
  m.add(box([0.82, 0.03, 0.82], 0.008, 2), P.walnut, { at: [0.5, H - 0.015, 0.5] });
  m.add(box([0.7, 0.09, 0.7], 0.006), shade(P.walnut, 0.88), { at: [0.5, H - 0.075, 0.5] });
  m.add(box([0.36, 0.06, 0.012], 0.003), P.walnut, { at: [0.5, H - 0.075, 0.855] });
  m.add(cyl(0.012, 0.012, 0.012, 8).rotateX(Math.PI / 2), P.brass, { at: [0.5, H - 0.075, 0.862] });
  for (const [x, z] of [
    [0.17, 0.17],
    [0.83, 0.17],
    [0.17, 0.83],
    [0.83, 0.83],
  ])
    m.add(
      lathe(
        [
          [0, 0],
          [0.018, 0],
          [0.024, 0.04],
          [0.018, 0.1],
          [0.02, 0.3],
          [0.026, 0.38],
          [0.02, 0.44],
          [0, 0.44],
        ],
        10,
      ),
      P.walnut,
      { at: [x, 0, z] },
    );
  m.add(box([0.66, 0.016, 0.66], 0.004), shade(P.walnut, 0.9), { at: [0.5, 0.16, 0.5] });
}

// ── the reception desk (3×1) ──────────────────────────────────────────────────────────────────────
/** The lobby's: a work surface at 0.74 for whoever sits behind it (−z), a raised ledge for visitors
 *  at 1.05 along the front, its front panel in fluted walnut. */
export function reception(m: Model, _o: Look) {
  const x0 = 0.04;
  const x1 = 2.96;
  const cx = 1.5;
  // the work surface, and its ends
  m.add(box([x1 - x0, 0.032, 0.62], 0.006, 2), P.teak, { at: [cx, DESK - 0.016, 0.36] });
  for (const x of [x0 + 0.04, x1 - 0.04])
    m.add(box([0.05, DESK - 0.032, 0.6], 0.008), P.walnut, { at: [x, (DESK - 0.032) / 2, 0.36] });
  // the front: a tall walnut panel, fluted, on a dark plinth; the ledge over it
  const fz = 0.82;
  m.add(box([x1 - x0, 1.0, 0.1], 0.01, 2), P.walnut, { at: [cx, 0.53, fz] });
  m.add(box([x1 - x0 - 0.04, 0.05, 0.08], 0.006), P.walnutDark, { at: [cx, 0.025, fz + 0.005] });
  for (let i = 0; i < 28; i++)
    m.add(rod(0.012, 0.012, 0.88, "x", 6).rotateZ(Math.PI / 2), shade(P.walnut, 0.82 + (i % 2) * 0.1), {
      at: [x0 + 0.08 + i * 0.1, 0.52, fz + 0.05],
    });
  m.add(box([x1 - x0 + 0.04, 0.04, 0.3], 0.008, 2), P.stone, { at: [cx, 1.05 - 0.02, fz + 0.02] });
  m.add(box([x1 - x0 + 0.03, 0.012, 0.012]), P.brass, { at: [cx, 1.0, fz + 0.175] });
}

// ── the counter (2×1) ─────────────────────────────────────────────────────────────────────────────
/** A kitchen counter: painted shaker cabinets (cream unless painted), a worktop of stone or teak, a
 *  sink in its right half with its tap; things stand on the left half. Worktop at 0.90. */
export function counter(m: Model, o: Look) {
  const H = 0.9;
  const c = o.fabric ?? P.cream;
  const top = o.look === 1 ? P.teak : P.stone;
  // the plinth, set back; the cabinets; three shaker doors with their knobs
  m.add(box([1.9, 0.1, 0.72], 0.004), P.walnutDark, { at: [1, 0.05, 0.47] });
  m.add(box([1.96, H - 0.14, 0.8], 0.006, 2), shade(c, 0.94), { at: [1, 0.1 + (H - 0.14) / 2, 0.48] });
  for (const [u0, u1] of [
    [0.04, 0.66],
    [0.69, 1.31],
    [1.34, 1.96],
  ]) {
    const w = u1 - u0;
    const u = (u0 + u1) / 2;
    const y = 0.1 + (H - 0.14) / 2;
    m.add(box([w - 0.02, H - 0.2, 0.022], 0.004), c, { at: [u, y, 0.885] });
    m.add(box([w - 0.14, H - 0.34, 0.01], 0.002), shade(c, 0.9), { at: [u, y, 0.898] });
    m.add(ball(0.016), P.brass, { at: [u1 - 0.07, y + 0.2, 0.905] });
  }
  // the worktop: the left half solid, the right half round the sink
  const th = 0.04;
  m.add(box([1.0, th, 0.86], 0.006, 2), top, { at: [0.52, H - th / 2, 0.5] });
  m.add(box([0.96, th, 0.16], 0.006, 2), top, { at: [1.5, H - th / 2, 0.11] });
  m.add(box([0.96, th, 0.16], 0.006, 2), top, { at: [1.5, H - th / 2, 0.89] });
  for (const x of [1.06, 1.94]) m.add(box([0.12, th, 0.54], 0.004), top, { at: [x, H - th / 2, 0.5] });
  // the sink: a steel bowl, its drain; a drainer's grooves to its left
  m.add(box([0.78, 0.16, 0.54], 0.012, 2), P.alumDark, { at: [1.5, H - 0.08, 0.5] });
  m.add(box([0.74, 0.004, 0.5]), P.alum, { at: [1.5, H - 0.155, 0.5] });
  m.add(cyl(0.03, 0.03, 0.003, 12), P.ink, { at: [1.5, H - 0.153, 0.5] });
  for (let i = 0; i < 6; i++) m.add(box([0.012, 0.003, 0.5]), shade(top, 0.86), { at: [0.62 + i * 0.06, H, 0.5] });
  // the tap: a column, a swan neck over the sink, a lever
  m.add(cyl(0.022, 0.02, 0.06, 12), P.chrome, { at: [1.5, H, 0.16] });
  m.add(
    tube(
      [
        [1.5, H + 0.05, 0.16],
        [1.5, H + 0.26, 0.18],
        [1.5, H + 0.28, 0.3],
        [1.5, H + 0.2, 0.38],
      ],
      0.012,
      8,
      16,
    ),
    P.chrome,
  );
  m.add(box([0.012, 0.012, 0.08], 0.003), P.chrome, { at: [1.54, H + 0.07, 0.14], rot: [0.3, 0, 0] });
  // a tea towel over a door (one in two)
  if (o.seed > 0.5) m.add(cushion([0.2, 0.32, 0.012], 0.15, 2), P.white, { at: [0.36, 0.66, 0.9] });
}
