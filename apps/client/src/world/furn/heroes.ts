import { SEAT_SPEC } from "@yutopia/shared";
import type { BufferGeometry } from "three";
import { ball, box, cushion, cyl, lathe, leaf, Model, type Tier, taper, tube, type V3 } from "./kit";
import { P } from "./palette";
import { rectLoop, taskChair, threeSeat } from "./seating";

// Phase 0's four heroes (docs/plan/67-the-furniture.md): the chair, the desk, the sofa and the plant
// made in the kit, at true scale for the 1.79 m people, each in three tiers of detail — clean (few
// facets), crafted, rich — to choose the language from. Footprints as the catalog's (chair 1×1,
// desk 2×1, sofa 3×1, plant 1×1); each faces +z (a seat's front; the desk's user side).

export type Hero = "chair" | "desk" | "sofa" | "plant";
export const HEROES: Hero[] = ["chair", "desk", "sofa", "plant"];
export const FOOT: Record<Hero, [number, number]> = { chair: [1, 1], desk: [2, 1], sofa: [3, 1], plant: [1, 1] };

/** Where a person sits on it (seats3d.ts SeatShape's numbers, m): its top, its front and back
 *  from its middle, how far back she leans. */
export interface SeatSpec {
  top: number;
  front: number;
  back: number | null;
  lean: [number, number];
  solid?: boolean;
  arms?: number;
}
export const SEAT: Partial<Record<Hero, SeatSpec>> = {
  chair: SEAT_SPEC.chair,
  sofa: { top: 0.45, front: 0.42, back: -0.12, lean: [0.2, 0.3], solid: true },
};
/** The desk's top (m). */
export const DESK_TOP = 0.74;

export function heroModel(h: Hero, t: Tier): BufferGeometry {
  const m = new Model(t);
  if (h === "chair") taskChair(m, t);
  else if (h === "desk") desk(m, t);
  else if (h === "sofa") threeSeat(m, t, P.moss);
  else plant(m, t);
  return m.geometry();
}

// ── the desk: 1.6 × 0.8, its top at 0.74; the user's side −z (the catalog's: its chair to the north) ──────────────────────────────────────
function desk(m: Model, t: Tier) {
  const x0 = 0.2;
  const x1 = 1.8;
  const z0 = 0.1;
  const z1 = 0.9;
  const W = x1 - x0;
  const D = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const th = t === 0 ? 0.04 : 0.032;
  // the top
  m.add(box([W, th, D], t === 0 ? 0.004 : 0.008, t === 2 ? 2 : 1), P.walnutTop, { at: [cx, DESK_TOP - th / 2, cz] });
  if (t === 2) {
    // a lighter edge band along the front, and a cable grommet at the back
    m.add(box([W - 0.01, th * 0.7, 0.012], 0.003), P.walnutEdge, { at: [cx, DESK_TOP - th / 2, z0 + 0.003] });
    m.add(cyl(0.03, 0.03, 0.004, 14), P.plastic, { at: [x0 + 0.2, DESK_TOP, z1 - 0.08] });
  }
  if (t === 0) {
    for (const [x, z] of [
      [x0 + 0.06, z0 + 0.06],
      [x1 - 0.06, z0 + 0.06],
      [x0 + 0.06, z1 - 0.06],
      [x1 - 0.06, z1 - 0.06],
    ])
      m.add(box([0.05, DESK_TOP - th, 0.05]), P.walnutDark, { at: [x, (DESK_TOP - th) / 2, z] });
    return;
  }
  // left: a steel sled leg (two uprights on a foot, a rail under the top)
  const lx = x0 + 0.07;
  for (const z of [z0 + 0.08, z1 - 0.08])
    m.add(box([0.05, DESK_TOP - th - 0.03, 0.04], 0.006), P.steel, { at: [lx, (DESK_TOP - th) / 2 + 0.01, z] });
  m.add(box([0.05, 0.03, D - 0.06], 0.006), P.steel, { at: [lx, 0.015, cz] });
  m.add(box([0.05, 0.03, D - 0.12], 0.006), P.steel, { at: [lx, DESK_TOP - th - 0.015, cz] });
  if (t === 2)
    for (const z of [z0 + 0.06, z1 - 0.06]) m.add(cyl(0.018, 0.018, 0.01, 8), P.rubber, { at: [lx, -0.004, z] });
  // a modesty panel at the back
  m.add(box([W - 0.62, 0.36, 0.018], 0.004), P.walnutDark, { at: [cx - 0.12, DESK_TOP - th - 0.2, z1 - 0.05] });
  // right: a pedestal of three drawers, their fronts proud of it with a gap between
  const pw = 0.44;
  const px = x1 - pw / 2 - 0.02;
  const ph = DESK_TOP - th - 0.04;
  m.add(box([pw, ph, D - 0.04], 0.006), P.walnutDark, { at: [px, 0.04 + ph / 2, cz] });
  m.add(box([pw - 0.02, 0.04, D - 0.08]), P.rubber, { at: [px, 0.02, cz] }); // (the plinth, set back)
  const drawers = [0.14, 0.16, 0.28];
  let y = DESK_TOP - th - 0.012;
  for (const h of drawers) {
    const yc = y - h / 2;
    m.add(box([pw - 0.024, h - 0.012, 0.022], t === 2 ? 0.005 : 0.003), P.walnut, { at: [px, yc, z0 + 0.01] });
    if (t === 2)
      m.add(
        tube(
          [
            [-0.07, 0, 0],
            [-0.07, 0, -0.025],
            [0.07, 0, -0.025],
            [0.07, 0, 0],
          ],
          0.006,
          5,
          12,
        ),
        P.brass,
        { at: [px, yc + h * 0.2, z0] },
      );
    else m.add(box([0.12, 0.012, 0.016], 0.003), P.brass, { at: [px, yc + h * 0.22, z0 - 0.006] });
    y -= h;
  }
}

// ── the plant: a monstera in a ceramic pot, ~1.2 m ─────────────────────────────────────────────────
function plant(m: Model, t: Tier) {
  const cx = 0.5;
  const cz = 0.5;
  const seg = t === 0 ? 8 : t === 1 ? 12 : 16;
  const potH = 0.36;
  const profile: [number, number][] =
    t === 0
      ? [
          [0.15, 0],
          [0.19, potH],
          [0.17, potH],
        ]
      : [
          [0.0, 0],
          [0.14, 0],
          [0.155, 0.02],
          [0.19, potH - 0.04],
          [0.205, potH - 0.035],
          [0.205, potH],
          [0.185, potH],
          [0.18, potH - 0.03],
        ];
  m.add(lathe(profile, seg), P.ceramic, { at: [cx, t === 2 ? 0.02 : 0, cz] });
  const lift = t === 2 ? 0.02 : 0;
  if (t === 2) {
    // a band round it, a saucer under it
    m.add(
      lathe(
        [
          [0.168, 0.12],
          [0.176, 0.15],
          [0.176, 0.16],
          [0.168, 0.12],
        ],
        seg,
      ),
      P.ceramicBand,
      { at: [cx, 0.02, cz] },
    );
    m.add(
      lathe(
        [
          [0, 0],
          [0.2, 0],
          [0.21, 0.025],
          [0.2, 0.025],
        ],
        seg,
      ),
      P.ceramic,
      { at: [cx, 0, cz], tone: 0.92 },
    );
  }
  m.add(cyl(0.172, 0.172, 0.01, seg), P.soil, { at: [cx, lift + potH - 0.04, cz] });
  if (t === 2)
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const r = 0.05 + (i % 3) * 0.04;
      m.add(ball(0.014, 5), P.pebble, {
        at: [cx + Math.cos(a) * r, lift + potH - 0.028, cz + Math.sin(a) * r],
        tone: 0.9 + (i % 3) * 0.06,
      });
    }
  // the leaves: on stems out of the soil, spiralling round, the young ones lighter and higher
  const n = t === 0 ? 9 : t === 1 ? 13 : 17;
  const base: V3 = [cx, lift + potH - 0.035, cz];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + 0.3; // (the golden angle)
    const k = i / (n - 1);
    const reach = 0.2 + 0.26 * (1 - k) + 0.05 * Math.sin(i * 1.7);
    const height = 0.36 + 0.62 * k + 0.08 * Math.cos(i * 2.3);
    const tip: V3 = [base[0] + Math.cos(a) * reach, base[1] + height, base[2] + Math.sin(a) * reach];
    const mid: V3 = [
      base[0] + Math.cos(a) * reach * 0.35,
      base[1] + height * 0.75,
      base[2] + Math.sin(a) * reach * 0.35,
    ];
    m.add(tube([base, mid, tip], t === 0 ? 0.008 : 0.007, t === 0 ? 4 : 5, t === 0 ? 4 : 8), P.stem);
    const len = 0.46 * (0.7 + 0.4 * (1 - k));
    const g = leaf(
      len,
      len * 1.0,
      t === 0 ? 0.12 : 0.22,
      0.18 + 0.1 * (1 - k),
      t === 0 ? 4 : t === 1 ? 6 : 9,
      t === 2 && k < 0.8 ? 3 : 0,
    );
    // out from the stalk's tip, away from the middle, tipped down a little
    const col = k > 0.8 ? P.leafYoung : P.leaf;
    m.add(g, col, { at: tip, rot: [0.15 + 0.35 * (1 - k), Math.PI / 2 - a, 0], tone: 0.9 + 0.12 * Math.sin(i * 3.1) });
  }
}
