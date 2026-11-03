import { BufferGeometry, Float32BufferAttribute, Matrix4, TorusGeometry } from "three";
import {
  ball,
  box,
  cyl,
  extrude,
  type Look,
  lathe,
  leaf,
  type Model,
  rod,
  roundRect,
  taper,
  tube,
  type V3,
} from "../kit";
import { P, shade } from "../palette";
import { Rig } from "./seating2";

// Plan 68 phase 4 (docs/plan/68-more-furniture.md): Desks & tables — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/tables2.ts. As the desks (world/furn/tables.ts): a
// desk's sitters on its −z side (rot 0), nothing under its top where their knees go; a top reaches
// to within a tenth of a tile of its footprint's edge where things stand on it (every quarter-tile
// cell in its `top` has its middle on it), at its SURFACES height; nothing stood on those cells.

export const LOOKS: Record<string, readonly string[]> = {
  corner_desk: ["Walnut corner desk", "Oak corner desk", "Cream corner desk", "Black ash corner desk"],
  drafting_table: ["Oak drafting table", "Steel drafting table"],
  workbench: ["Birch workbench", "Steel workbench"],
  round_table: ["Walnut round table", "White round table"],
  dining_table: ["Farmhouse table", "Mid-century table"],
  nesting_tables: ["Walnut nesting tables", "Brass and marble nesting tables"],
  bedside_table: ["Oak bedside table", "White bedside table"],
  folding_table: ["White folding table", "Wooden folding table"],
};

const DESK = 0.74;
const T = {
  felt: 0x6c7a74,
  feltDark: 0x56625d,
  birch: 0xd9b98a,
  peg: 0xc8a676,
  red: 0xb8382c,
  blue: 0x2e5a8a,
  yellow: 0xe0b23a,
  marble: 0xe7e3dc,
  marbleVein: 0xbdb7ad,
  blueprint: 0x2c5c96,
  white: 0xf1efe9,
  grey: 0x8b8f93,
};

// ── the desks' finishes (as the desk's: world/furn/tables.ts) ───────────────────────────────────────
interface Finish {
  top: number;
  edge: number;
  frame: number;
  panel: number;
  foot: number;
}
const DESKS: Finish[] = [
  { top: P.teak, edge: shade(P.teak, 1.18), frame: P.walnut, panel: P.walnutDark, foot: P.brass },
  { top: P.oakLight, edge: shade(P.oakLight, 1.1), frame: P.white, panel: shade(P.oakLight, 0.86), foot: P.rubber },
  { top: P.cream, edge: P.rust, frame: P.chrome, panel: P.rust, foot: P.rubber },
  { top: P.graphite, edge: P.ash, frame: P.ash, panel: P.ash, foot: P.steel },
];

/** A desk's end, as the desk's looks have them, its depth along z round (0, 0), standing at x 0. */
function deskEnd(r: Rig, f: Finish, look: number, depth: number) {
  const under = DESK - 0.032;
  const z0 = -depth / 2;
  const z1 = depth / 2;
  if (look === 1) {
    for (const z of [z0 + 0.06, z1 - 0.06])
      r.add(box([0.04, under - 0.03, 0.04], 0.008), f.frame, { at: [0, under / 2 + 0.015, z] });
    r.add(box([0.04, 0.03, depth - 0.04], 0.008), f.frame, { at: [0, 0.015, 0] });
    r.add(box([0.04, 0.03, depth - 0.1], 0.008), f.frame, { at: [0, under - 0.015, 0] });
  } else if (look === 2) {
    r.add(
      tube(
        [
          [0, under, z0 + 0.12],
          [0, under - 0.04, z1 - 0.1],
          [0, under * 0.5, z1 - 0.06],
          [0, 0.06, z1 - 0.08],
          [0, 0.02, z1 - 0.3],
          [0, 0.02, z0 + 0.1],
        ],
        0.019,
        8,
        24,
      ),
      f.frame,
    );
    r.add(box([0.05, 0.02, 0.06], 0.006), f.foot, { at: [0, 0.01, z0 + 0.1] });
  } else if (look === 3) {
    for (const t of [-1, 1])
      r.add(box([0.045, under / Math.cos(0.18), 0.045], 0.008), f.frame, {
        at: [0, under / 2, t * 0.18],
        rot: [-t * 0.18, 0, 0],
      });
    r.add(box([0.04, 0.035, depth - 0.2], 0.008), f.frame, { at: [0, under - 0.02, 0] });
    r.add(box([0.035, 0.035, 0.5], 0.008), f.frame, { at: [0, 0.22, 0] });
  } else {
    r.add(box([0.05, under, depth - 0.04], 0.008, 2), f.frame, { at: [0, under / 2, 0] });
    r.add(box([0.058, 0.025, depth - 0.02], 0.004), f.foot, { at: [0, 0.0125, 0] });
  }
}
const placeAt = (x: number, z: number, turn: number) =>
  new Matrix4().makeTranslation(x, 0, z).multiply(new Matrix4().makeRotationY(turn));

/** A snake plant in a pot (the corner desk's crook): upright leaves, banded. */
function snakePlant(m: Model, x: number, z: number, pot: number, seed: number) {
  m.add(
    lathe(
      [
        [0, 0],
        [0.15, 0],
        [0.17, 0.04],
        [0.19, 0.34],
        [0.2, 0.36],
        [0.185, 0.36],
        [0, 0.36],
      ],
      18,
    ),
    pot,
    { at: [x, 0, z] },
  );
  m.add(cyl(0.18, 0.18, 0.01, 16), P.soil, { at: [x, 0.33, z] });
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4 + seed * 6;
    const rr = 0.03 + (i % 3) * 0.035;
    const len = 0.5 + ((i * 7) % 5) * 0.09;
    m.add(
      leaf(len, 0.075, 0.25, -0.05, 5).rotateX(-Math.PI / 2 + 0.08 + (i % 3) * 0.06),
      i % 2 ? P.leaf : P.leafYoung,
      {
        at: [x + Math.cos(a) * rr, 0.34, z + Math.sin(a) * rr],
        rot: [0, a, 0],
      },
    );
  }
}

// ── the L-shaped corner desk (2×2) ──────────────────────────────────────────────────────────────
// Two runs at a right angle: one along −z, sat at from −z (a tile each), one along −x, sat at from −x
// (its two tiles); their back edges round the crook, where felt screens stand and a snake plant
// grows. The desks' four finishes, their own ends. Things stand on the −z run (its `top`).
function cornerDesk(m: Model, o: Look) {
  const f = DESKS[o.look] ?? DESKS[0];
  const th = 0.032;
  const D = 0.8; // each run's depth
  const x0 = 0.03;
  const z0 = 0.06;
  const ix = x0 + D; // the inner corner
  const iz = z0 + D;
  const rr = 0.14;
  // (the outline's corner round, its centre at (ix + rr, iz + rr))
  const corner: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 - (i / 6) * (Math.PI / 2);
    corner.push([ix + rr + Math.cos(a) * rr, iz + rr + Math.sin(a) * rr]);
  }
  const L: [number, number][] = [[x0, z0], [1.97, z0], [1.97, iz], ...corner, [ix, 1.97], [x0, 1.97]];
  m.add(extrude(L, th, 0.006, 2).rotateX(Math.PI / 2), f.top, { at: [0, DESK - th / 2, 0] });
  // the sitters' edges, banded
  m.add(box([1.94, th * 0.75, 0.012], 0.003), f.edge, { at: [1, DESK - th / 2, z0 + 0.002] });
  m.add(box([0.012, th * 0.75, 1.9], 0.003), f.edge, { at: [x0 + 0.002, DESK - th / 2, (z0 + 1.97) / 2] });
  // the ends, each run's far one; a post at the inner corner
  const a = new Rig(placeAt(1.92, (z0 + iz) / 2, 0));
  deskEnd(a, f, o.look, D);
  a.still(m);
  const b = new Rig(placeAt((x0 + ix) / 2, 1.92, Math.PI / 2));
  deskEnd(b, f, o.look, D);
  b.still(m);
  const post = o.look === 0 ? 0.1 : 0.05;
  m.add(box([post, DESK - th, post], 0.008), f.frame, {
    at: [ix - post / 2 - 0.01, (DESK - th) / 2, iz - post / 2 - 0.01],
  });
  if (o.look === 0)
    m.add(box([post + 0.008, 0.025, post + 0.008], 0.004), f.foot, {
      at: [ix - post / 2 - 0.01, 0.0125, iz - post / 2 - 0.01],
    });
  // the modesty panels along the back edges, the felt screens over them
  const under = DESK - th;
  m.add(box([1.9 - ix, 0.34, 0.016], 0.004), f.panel, { at: [(ix + 1.9) / 2, under - 0.2, iz - 0.03] });
  m.add(box([0.016, 0.34, 1.9 - iz], 0.004), f.panel, { at: [ix - 0.03, under - 0.2, (iz + 1.9) / 2] });
  const sh = 0.42;
  m.add(box([1.94 - x0 - 0.02, sh, 0.03], 0.01, 2), T.felt, { at: [(x0 + 1.95) / 2 + 0.01, DESK + sh / 2, iz - 0.02] });
  m.add(box([0.03, sh, 1.95 - iz - 0.02], 0.01, 2), T.felt, { at: [ix - 0.02, DESK + sh / 2, (iz + 1.95) / 2 + 0.01] });
  for (const [x, z] of [
    [x0 + 0.3, iz - 0.02],
    [1.6, iz - 0.02],
    [ix - 0.02, 1.6],
  ])
    m.add(box([0.034, 0.05, 0.034], 0.004), P.alum, { at: [x, DESK + 0.025, z] });
  // a cable grommet on each run, a pinned note on a screen (story)
  for (const [x, z] of [
    [1.55, iz - 0.12],
    [ix - 0.12, 1.55],
  ]) {
    m.add(cyl(0.032, 0.032, 0.004, 16), P.plastic, { at: [x, DESK, z] });
    m.add(cyl(0.022, 0.022, 0.005, 12), P.ink, { at: [x, DESK + 0.001, z] });
  }
  if (o.seed > 0.4) {
    m.add(box([0.08, 0.08, 0.004]), o.seed > 0.7 ? T.yellow : 0xe98aa0, {
      at: [0.6, DESK + 0.3, iz - 0.037],
      rot: [0, 0, 0.06],
    });
    m.add(box([0.004, 0.08, 0.08]), T.yellow, { at: [ix - 0.037, DESK + 0.26, 1.3], rot: [-0.05, 0, 0] });
  }
  snakePlant(m, 1.42, 1.42, o.look === 3 ? P.graphite : o.look === 2 ? P.terracotta : P.ceramic, o.seed);
}

// ── the drafting table (2×1) ──────────────────────────────────────────────────────────────────────
// The board tilted toward its sitter (−z), its pencil ledge at 0.78, a drawing taped on it and a
// parallel rule across it; an architect's lamp clamped to its far corner (lit unless switched off);
// beside it a taboret of drawers whose top things stand on (0.92). Oak on trestles, or white on
// black steel.
const DRAFT_TOP = 0.92;
function draftingTable(m: Model, o: Look) {
  const steel = o.look === 1;
  const wood = steel ? P.steel : P.oak;
  const board = steel ? T.white : shade(P.oakLight, 1.05);
  const tilt = 0.32;
  const bw = 1.3;
  const bd = 0.84;
  const bx = 0.72; // the board's middle across
  const lowY = 0.79;
  const lowZ = 0.1;
  const along = (d: number, up = 0): V3 => [
    0,
    lowY + d * Math.sin(tilt) + up * Math.cos(tilt),
    lowZ + d * Math.cos(tilt) - up * Math.sin(tilt),
  ];
  // the board, its ledge, the drawing and the rule
  const mid = along(bd / 2);
  m.add(box([bw, 0.025, bd], 0.006, 2), board, {
    at: [bx, mid[1] - 0.0125 * Math.cos(tilt), mid[2] + 0.0125 * Math.sin(tilt)],
    rot: [-tilt, 0, 0],
  });
  m.add(box([bw, 0.035, 0.04], 0.006), steel ? P.alum : P.walnut, { at: [bx, lowY + 0.005, lowZ - 0.012] });
  const paper = o.seed > 0.6 ? T.blueprint : P.paperWhite;
  const pm = along(0.42, 0.002);
  m.add(box([0.84, 0.002, 0.6]), paper, { at: [bx - 0.05, pm[1], pm[2]], rot: [-tilt, 0, 0] });
  const ink = paper === T.blueprint ? 0xdfe8f2 : P.ink;
  // (the drawing: a plan's walls, a door's swing)
  for (const [u, v, w, d] of [
    [-0.2, 0, 0.5, 0.006],
    [-0.2, 0.36, 0.5, 0.006],
    [-0.45, 0.18, 0.006, 0.36],
    [0.05, 0.18, 0.006, 0.36],
    [-0.2, 0.18, 0.006, 0.2],
    [0.2, 0.05, 0.12, 0.004],
    [0.2, 0.1, 0.18, 0.004],
    [0.2, 0.15, 0.1, 0.004],
  ]) {
    const p = along(0.42 - 0.3 + v + d / 2, 0.004);
    m.add(box([w, 0.002, d]), ink, { at: [bx - 0.05 + u, p[1], p[2]], rot: [-tilt, 0, 0] });
  }
  for (const [u, v] of [
    [-0.42, 0.12],
    [0.32, 0.12],
    [-0.42, 0.72],
    [0.32, 0.72],
  ]) {
    const p = along(v, 0.003);
    m.add(box([0.05, 0.002, 0.03]), 0xe8d9a8, { at: [bx - 0.05 + u, p[1], p[2]], rot: [-tilt, 0, 0.6] });
  }
  const rule = along(0.25, 0.012);
  m.add(box([bw - 0.04, 0.012, 0.05], 0.003), steel ? P.alum : 0x3b6e8f, {
    at: [bx, rule[1], rule[2]],
    rot: [-tilt, 0, 0],
  });
  for (const s of [-1, 1]) {
    const p = along(0.25, 0.008);
    m.add(cyl(0.012, 0.012, 0.016, 8), P.chrome, { at: [bx + s * (bw / 2 - 0.03), p[1], p[2]], rot: [-tilt, 0, 0] });
    m.add(rod(0.0015, 0.0015, bd - 0.04, "z", 3), P.chrome, {
      at: [bx + s * (bw / 2 - 0.03), along(bd / 2, 0.006)[1], along(bd / 2, 0.006)[2]],
      rot: [-tilt, 0, 0],
    });
  }
  // a pencil and an eraser on the ledge
  m.add(rod(0.004, 0.004, 0.17, "x", 6), T.yellow, { at: [bx - 0.3, lowY + 0.026, lowZ - 0.01] });
  m.add(box([0.05, 0.015, 0.02], 0.004), 0xe88a8a, { at: [bx + 0.25, lowY + 0.03, lowZ - 0.01] });
  // the frame
  const fl = bx - bw / 2 + 0.08;
  const fr = bx + bw / 2 - 0.08;
  if (steel) {
    for (const x of [fl, fr]) {
      m.add(box([0.06, 0.04, 0.78], 0.008), wood, { at: [x, 0.02, 0.5] });
      m.add(box([0.05, lowY - 0.08, 0.05], 0.008), wood, { at: [x, (lowY - 0.08) / 2 + 0.04, 0.5] });
      m.add(box([0.04, 0.04, 0.7], 0.006), wood, { at: [x, lowY + 0.02, 0.48], rot: [-tilt, 0, 0] });
      for (const z of [0.14, 0.86]) m.add(cyl(0.022, 0.022, 0.012, 10), P.rubber, { at: [x, 0, z] });
    }
    m.add(box([fr - fl, 0.05, 0.04], 0.008), wood, { at: [bx, 0.5, 0.5] });
    // the height's hand wheel, its knob
    m.add(cyl(0.012, 0.012, 0.06, 8).rotateZ(Math.PI / 2), P.chrome, { at: [fr + 0.05, 0.5, 0.5] });
    m.add(new TorusGeometry(0.055, 0.008, 5, 16).rotateY(Math.PI / 2), P.ink, { at: [fr + 0.08, 0.5, 0.5] });
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3])
      m.add(box([0.006, 0.055, 0.006]), P.ink, {
        at: [fr + 0.08, 0.5 + Math.cos(a) * 0.027, 0.5 + Math.sin(a) * 0.027],
        rot: [-a, 0, 0],
      });
    m.add(cyl(0.008, 0.008, 0.04, 8).rotateZ(Math.PI / 2), P.ink, { at: [fr + 0.1, 0.555, 0.5] });
    // a gas strut up under the board
    m.add(
      tube(
        [
          [bx, 0.52, 0.52],
          [bx, 0.78, 0.7],
        ],
        0.014,
        8,
        2,
      ),
      P.chrome,
    );
  } else {
    for (const x of [fl, fr]) {
      for (const s of [-1, 1])
        m.add(box([0.05, lowY - 0.04, 0.05], 0.008), wood, {
          at: [x, (lowY - 0.04) / 2, 0.5 + s * 0.28],
          rot: [s * 0.1, 0, 0],
        });
      m.add(box([0.06, 0.05, 0.84], 0.01, 2), wood, { at: [x, 0.025, 0.5] });
      m.add(box([0.05, 0.05, 0.7], 0.008), wood, { at: [x, lowY - 0.05, 0.5] });
      // the quadrant that holds the tilt, its wing knob
      m.add(new TorusGeometry(0.2, 0.008, 4, 10, 0.9).rotateY(Math.PI / 2), P.brass, {
        at: [x + 0.03, lowY - 0.04, 0.55],
        rot: [0.6, 0, 0],
      });
      m.add(cyl(0.02, 0.02, 0.03, 8).rotateZ(Math.PI / 2), P.brass, { at: [x + 0.045, lowY + 0.08, 0.72] });
    }
    m.add(box([fr - fl, 0.05, 0.04], 0.008), wood, { at: [bx, 0.18, 0.5] });
    m.add(box([fr - fl - 0.1, 0.02, 0.32], 0.004), shade(wood, 0.9), { at: [bx, 0.205, 0.62] });
    // a roll of paper on the shelf
    m.add(rod(0.04, 0.04, 0.7, "x", 10), P.paperWhite, { at: [bx - 0.05, 0.255, 0.64] });
  }
  // the lamp, clamped to the board's far left corner: a clamp, two arms and their springs, its shade
  const on = o.on !== false;
  const hi = along(bd);
  const base: V3 = [0.14, hi[1] + 0.02, hi[2] - 0.01];
  const elbow: V3 = [0.24, hi[1] + 0.5, hi[2] - 0.1];
  const head: V3 = [0.5, hi[1] + 0.48, 0.45];
  m.add(box([0.05, 0.08, 0.06], 0.008), P.steel, { at: [base[0], hi[1] - 0.02, hi[2] - 0.01] });
  m.add(cyl(0.015, 0.015, 0.05, 8), P.steel, { at: base });
  const lampC = steel ? P.white : 0x2f5d50;
  for (const [p, q] of [
    [[base[0], base[1] + 0.05, base[2]] as V3, elbow],
    [elbow, head],
  ]) {
    for (const s of [-1, 1])
      m.add(
        tube(
          [
            [p[0] + s * 0.012, p[1], p[2]],
            [q[0] + s * 0.012, q[1], q[2]],
          ],
          0.006,
          5,
          2,
        ),
        lampC,
      );
    m.add(
      tube(
        [
          [p[0], p[1] + 0.03, p[2]],
          [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 0.03, (p[2] + q[2]) / 2],
        ],
        0.005,
        4,
        2,
      ),
      P.chrome,
    );
  }
  m.add(ball(0.02, 8), lampC, { at: elbow });
  // the shade, its rim facing down at the board
  m.add(
    lathe(
      [
        [0.012, 0],
        [0.03, 0.01],
        [0.05, 0.06],
        [0.085, 0.13],
        [0.09, 0.14],
      ],
      14,
    ).rotateX(Math.PI),
    lampC,
    { at: [head[0], head[1] + 0.14, head[2]], rot: [0.3, 0, 0] },
  );
  m.add(ball(0.03, 8), on ? 0xfff1c8 : P.paperWhite, { at: [head[0], head[1] + 0.04, head[2] + 0.01], glow: on });
  // the taboret: drawers, its top where things stand
  const tx0 = 1.5;
  const tx1 = 1.97;
  const tc = steel ? 0x8a9196 : P.oak;
  m.add(box([tx1 - tx0, DRAFT_TOP - 0.06, 0.82], 0.008, 2), tc, {
    at: [(tx0 + tx1) / 2, (DRAFT_TOP - 0.06) / 2 + 0.04, 0.5],
  });
  m.add(box([tx1 - tx0 + 0.01, 0.025, 0.88], 0.006, 2), steel ? P.steel : shade(P.oak, 1.08), {
    at: [(tx0 + tx1) / 2, DRAFT_TOP - 0.0125, 0.5],
  });
  for (const x of [tx0 + 0.04, tx1 - 0.04])
    for (const z of [0.12, 0.88]) m.add(cyl(0.022, 0.022, 0.04, 8), P.rubber, { at: [x, 0, z] });
  const n = 4;
  const dh = (DRAFT_TOP - 0.1) / n;
  for (let i = 0; i < n; i++) {
    const y = 0.06 + dh * (i + 0.5);
    m.add(box([tx1 - tx0 - 0.04, dh - 0.02, 0.012], 0.003), shade(tc, 1.05), { at: [(tx0 + tx1) / 2, y, 0.085] });
    m.add(box([0.14, 0.015, 0.02], 0.004), steel ? P.chrome : P.brass, { at: [(tx0 + tx1) / 2, y + dh * 0.2, 0.07] });
  }
}

// ── the workbench (2×1) ─────────────────────────────────────────────────────────────────────────
// A thick top at 0.90 on stout legs, a shelf under it with a toolbox, a vice's jaw flush with the
// front; a pegboard up the back with the tools hung on it. Birch on beech legs, or steel with a
// laminate top and drawers. Things stand on its top (its front three-quarters).
const BENCH = 0.9;
function workbench(m: Model, o: Look) {
  const steel = o.look === 1;
  const top = steel ? 0xc9b48e : T.birch;
  const legC = steel ? 0x3f5f7a : shade(T.birch, 0.88);
  const th = 0.06;
  const z0 = 0.11;
  const z1 = 0.86;
  m.add(box([1.94, th, z1 - z0], 0.006, 2), top, { at: [1, BENCH - th / 2, (z0 + z1) / 2] });
  if (!steel)
    for (let i = 1; i < 6; i++)
      m.add(box([1.93, 0.002, 0.004]), shade(top, 0.86), { at: [1, BENCH + 0.0005, z0 + i * 0.137] });
  else m.add(box([1.95, 0.04, 0.012], 0.004), P.steel, { at: [1, BENCH - 0.025, z0 - 0.004] });
  // the legs and rails
  for (const x of [0.1, 1.9])
    for (const z of [z0 + 0.06, z1 - 0.06])
      m.add(box([0.07, BENCH - th, 0.07], 0.008), legC, { at: [x, (BENCH - th) / 2, z] });
  for (const x of [0.1, 1.9]) m.add(box([0.05, 0.06, z1 - z0 - 0.1], 0.006), legC, { at: [x, 0.15, (z0 + z1) / 2] });
  m.add(box([1.75, 0.03, z1 - z0 - 0.12], 0.004), shade(legC, 0.9), { at: [1, 0.18, (z0 + z1) / 2] });
  m.add(box([1.75, 0.08, 0.03], 0.006), legC, { at: [1, BENCH - th - 0.04, z0 + 0.04] });
  // the vice: its jaw flush with the top's front, the screw and its bar
  const vx = 0.3;
  m.add(box([0.26, 0.12, 0.04], 0.008), steel ? P.steel : shade(T.birch, 0.8), { at: [vx, BENCH - 0.06, z0 - 0.02] });
  m.add(rod(0.012, 0.012, 0.06, "z", 8), P.chrome, { at: [vx, BENCH - 0.08, z0 - 0.07] });
  m.add(rod(0.008, 0.008, 0.24, "x", 6), P.chrome, { at: [vx, BENCH - 0.08, z0 - 0.09] });
  for (const s of [-1, 1]) m.add(ball(0.016, 6), P.chrome, { at: [vx + s * 0.12, BENCH - 0.08, z0 - 0.09] });
  // drawers (steel), or a toolbox on the shelf (birch)
  if (steel) {
    m.add(box([0.5, 0.36, z1 - z0 - 0.04], 0.006, 2), 0x8a9196, { at: [1.6, BENCH - th - 0.2, (z0 + z1) / 2] });
    for (let i = 0; i < 3; i++) {
      m.add(box([0.48, 0.1, 0.012], 0.003), shade(0x8a9196, 1.08), {
        at: [1.6, BENCH - th - 0.07 - i * 0.118, z0 + 0.018],
      });
      m.add(box([0.16, 0.012, 0.02], 0.004), P.chrome, { at: [1.6, BENCH - th - 0.05 - i * 0.118, z0 + 0.01] });
    }
  }
  m.add(box([0.44, 0.2, 0.22], 0.012, 2), T.red, { at: [0.55, 0.3, 0.45] });
  m.add(box([0.44, 0.04, 0.22], 0.012, 2), shade(T.red, 0.85), { at: [0.55, 0.42, 0.45] });
  m.add(
    tube(
      [
        [0.42, 0.44, 0.45],
        [0.45, 0.5, 0.45],
        [0.65, 0.5, 0.45],
        [0.68, 0.44, 0.45],
      ],
      0.008,
      5,
      8,
    ),
    P.ink,
  );
  m.add(box([0.5, 0.06, 0.36], 0.006), 0x9a8e7a, { at: [1.15, 0.225, 0.5] });
  // the pegboard up the back, its holes, its frame
  const py0 = BENCH;
  const py1 = 1.92;
  const pz = 0.93;
  m.add(box([1.94, py1 - py0, 0.014], 0.003), T.peg, { at: [1, (py0 + py1) / 2, pz] });
  m.add(box([1.98, 0.04, 0.03], 0.006), shade(T.peg, 0.8), { at: [1, py1, pz] });
  for (const x of [0.02, 1.98])
    m.add(box([0.03, py1 - py0, 0.03], 0.006), shade(T.peg, 0.8), { at: [x, (py0 + py1) / 2, pz] });
  const holes: number[] = [];
  for (let ix = 0; ix < 36; ix++)
    for (let iy = 0; iy < 18; iy++) {
      const x = 0.08 + ix * 0.052;
      const y = py0 + 0.06 + iy * 0.052;
      const h = 0.007;
      const z = pz - 0.0075;
      holes.push(x - h, y - h, z, x - h, y + h, z, x + h, y + h, z, x - h, y - h, z, x + h, y + h, z, x + h, y - h, z);
    }
  m.add(quadsGeo(holes), shade(T.peg, 0.45));
  // the tools hung on it
  const hz = pz - 0.03;
  // a saw
  m.add(
    extrude(
      [
        [0, 0],
        [0.42, 0.02],
        [0.42, 0.1],
        [0, 0.12],
      ],
      0.002,
      0,
      1,
    ),
    P.chrome,
    { at: [0.15, 1.6, hz] },
  );
  m.add(box([0.12, 0.1, 0.025], 0.01), P.walnut, { at: [0.62, 1.66, hz] });
  // a hammer
  m.add(box([0.03, 0.3, 0.02], 0.006), shade(T.birch, 0.7), { at: [0.85, 1.42, hz], rot: [0, 0, 0.05] });
  m.add(box([0.12, 0.035, 0.035], 0.006), P.steel, { at: [0.86, 1.58, hz] });
  // screwdrivers in a row
  [T.red, T.yellow, T.blue, T.red].forEach((c, i) => {
    const x = 1.05 + i * 0.07;
    m.add(cyl(0.014, 0.012, 0.1, 8), c, { at: [x, 1.6, hz] });
    m.add(cyl(0.004, 0.004, 0.12, 6), P.chrome, { at: [x, 1.48, hz] });
  });
  // a wrench, a pair of pliers
  m.add(box([0.025, 0.24, 0.008], 0.004), P.chrome, { at: [1.45, 1.42, hz] });
  m.add(new TorusGeometry(0.025, 0.008, 4, 10), P.chrome, { at: [1.45, 1.56, hz] });
  for (const s of [-1, 1])
    m.add(box([0.016, 0.2, 0.01], 0.004), s < 0 ? T.red : P.chrome, {
      at: [1.6 + s * 0.02, 1.45, hz],
      rot: [0, 0, s * 0.12],
    });
  // a tape measure, a square, a coil of cable
  m.add(box([0.08, 0.08, 0.04], 0.012), T.yellow, { at: [1.82, 1.6, hz] });
  m.add(box([0.3, 0.03, 0.006]), P.alum, { at: [1.75, 1.3, hz] });
  m.add(box([0.03, 0.2, 0.006]), P.alum, { at: [1.615, 1.39, hz] });
  m.add(new TorusGeometry(0.09, 0.012, 4, 14), steel ? T.yellow : 0xd2582a, { at: [0.35, 1.25, hz - 0.01] });
  // the pegs
  for (const [x, y] of [
    [0.36, 1.82],
    [0.86, 1.62],
    [1.45, 1.6],
    [1.82, 1.66],
  ])
    m.add(rod(0.004, 0.004, 0.05, "z", 4), P.chrome, { at: [x, y, pz - 0.03] });
  // (story) a lamp clamped to the pegboard's top, or a coffee mug left on the shelf
  if (o.seed > 0.55) {
    m.add(
      lathe(
        [
          [0.02, 0],
          [0.05, 0.04],
          [0.1, 0.13],
          [0, 0.13],
        ],
        12,
      ).rotateX(Math.PI),
      P.steel,
      { at: [1.2, 1.88, 0.8], rot: [0.5, 0, 0] },
    );
    m.add(ball(0.03, 8), 0xfff1c8, { at: [1.2, 1.79, 0.76] });
    m.add(
      tube(
        [
          [1.2, 1.94, 0.92],
          [1.2, 1.97, 0.86],
          [1.2, 1.9, 0.8],
        ],
        0.006,
        4,
        6,
      ),
      P.steel,
    );
  } else
    m.add(
      lathe(
        [
          [0, 0],
          [0.04, 0],
          [0.042, 0.1],
          [0, 0.1],
        ],
        12,
      ),
      P.ceramic,
      { at: [1.6, 0.24, 0.35] },
    );
}

/** Little flat squares from their corners (6 points a square), as one geometry. */
function quadsGeo(pos: number[]): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return geo;
}

// ── the round conference table (3×3) ──────────────────────────────────────────────────────────────
// A 2.8 m round top at 0.74, an inlaid ring and a brushed cable hatch at its middle (a speakerphone
// on it, by its seed), on a drum pedestal and a cross foot: the knees free all round its edge.
function roundTable(m: Model, o: Look) {
  const white = o.look === 1;
  const topC = white ? T.white : P.walnut;
  const R = 1.4;
  const c = 1.5;
  const th = 0.045;
  m.add(
    lathe(
      [
        [0, 0],
        [R - 0.01, 0],
        [R, 0.01],
        [R, th - 0.01],
        [R - 0.012, th],
        [0, th],
      ],
      64,
    ),
    topC,
    { at: [c, DESK - th, c] },
  );
  m.add(
    lathe(
      [
        [0, 0],
        [R - 0.012, 0],
      ],
      64,
    ),
    white ? shade(T.white, 0.9) : shade(P.walnut, 0.8),
    { at: [c, DESK - th - 0.001, c] },
  );
  if (!white) {
    m.add(
      lathe(
        [
          [R - 0.2, 0],
          [R - 0.16, 0],
          [R - 0.16, 0.002],
          [R - 0.2, 0.002],
        ],
        64,
      ),
      shade(P.walnut, 1.3),
      { at: [c, DESK, c] },
    );
  } else
    m.add(
      lathe(
        [
          [R - 0.02, 0],
          [R + 0.003, 0],
          [R + 0.003, th],
          [R - 0.02, th],
        ],
        64,
      ),
      P.oak,
      { at: [c, DESK - th, c] },
    );
  // the hatch at its middle (flush), its lid's seam
  m.add(cyl(0.16, 0.16, 0.002, 24), P.alum, { at: [c, DESK, c] });
  m.add(ring2(0.15, 0.003), P.alumDark, { at: [c, DESK + 0.002, c] });
  // the pedestal: a drum, a cross foot with its glides
  const pc = white ? P.white : P.walnutDark;
  m.add(cyl(0.3, 0.3, 0.04, 28), pc, { at: [c, DESK - th - 0.04, c] });
  m.add(cyl(0.22, 0.26, DESK - th - 0.1, 28), pc, { at: [c, 0.06, c] });
  for (let k = 0; k < 6; k++)
    m.add(box([0.012, DESK - th - 0.14, 0.02]), shade(pc, 0.85), {
      at: [
        c + Math.cos((k / 6) * Math.PI * 2) * 0.235,
        (DESK - th) / 2 + 0.01,
        c + Math.sin((k / 6) * Math.PI * 2) * 0.235,
      ],
      rot: [0, -(k / 6) * Math.PI * 2, 0],
    });
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4]) {
    m.add(box([1.5, 0.06, 0.1], 0.01, 2), white ? P.alum : P.walnutDark, { at: [c, 0.03, c], rot: [0, a, 0] });
    for (const s of [-1, 1])
      m.add(cyl(0.03, 0.03, 0.01, 10), P.rubber, { at: [c + Math.cos(a) * s * 0.72, 0, c - Math.sin(a) * s * 0.72] });
  }
  // (story) a speakerphone on the hatch, its three legs and LEDs
  if (o.seed > 0.5) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      m.add(box([0.1, 0.022, 0.06], 0.012, 2), P.plastic, {
        at: [c + Math.cos(a) * 0.06, DESK + 0.011, c + Math.sin(a) * 0.07],
        rot: [0, -a, 0],
      });
    }
    m.add(cyl(0.06, 0.055, 0.03, 18), P.plastic, { at: [c, DESK, c] });
    m.add(cyl(0.035, 0.035, 0.002, 14), 0x7fe08a, { at: [c, DESK + 0.03, c], glow: true });
  }
}
/** A thin ring lying flat. */
function ring2(r: number, t: number) {
  return new TorusGeometry(r, t, 3, 32).rotateX(Math.PI / 2);
}

// ── the dining table (3×2) ──────────────────────────────────────────────────────────────────────
// Top 0.75, sat at from both long sides (its legs at the corners, its apron high). Farmhouse: oak
// planks with breadboard ends on turned legs; mid-century: walnut, rounded, on splayed tapered legs.
// A runner down it, by its seed.
const DINE = 0.75;
function diningTable(m: Model, o: Look) {
  const farm = o.look === 0;
  const wood = farm ? P.oak : P.walnut;
  const th = farm ? 0.05 : 0.035;
  if (farm) {
    for (let i = 0; i < 5; i++)
      m.add(box([2.56, th, 0.372], 0.008, 2), wood, {
        at: [1.5, DINE - th / 2, 0.06 + 0.376 * (i + 0.5) + 0.002],
        tone: 0.95 + 0.06 * Math.sin(i * 2.7),
      });
    for (const x of [0.13, 2.87])
      m.add(box([0.14, th, 1.9], 0.008, 2), shade(wood, 0.94), { at: [x, DINE - th / 2, 1] });
    for (const x of [0.13, 2.87])
      for (const z of [0.4, 1.0, 1.6]) m.add(cyl(0.01, 0.01, 0.004, 8), P.walnutDark, { at: [x, DINE, z] });
  } else {
    m.add(extrude(roundRect(2.9, 1.9, 0.15, 5), th, 0.01, 2).rotateX(Math.PI / 2), wood, {
      at: [1.5, DINE - th / 2, 1],
    });
  }
  // the apron, high (the knees under it)
  const ah = 0.1;
  const ay = DINE - th - ah / 2;
  m.add(box([2.3, ah, 0.03], 0.006), shade(wood, 0.9), { at: [1.5, ay, 0.28] });
  m.add(box([2.3, ah, 0.03], 0.006), shade(wood, 0.9), { at: [1.5, ay, 1.72] });
  for (const x of [0.33, 2.67]) m.add(box([0.03, ah, 1.4], 0.006), shade(wood, 0.9), { at: [x, ay, 1] });
  // the legs
  for (const x of [0.33, 2.67])
    for (const z of [0.28, 1.72]) {
      const h = DINE - th;
      if (farm)
        m.add(
          lathe(
            [
              [0, 0],
              [0.04, 0],
              [0.045, 0.06],
              [0.032, 0.12],
              [0.04, 0.2],
              [0.03, 0.32],
              [0.034, 0.42],
              [0.045, 0.5],
              [0.045, h],
              [0, h],
            ],
            10,
          ),
          wood,
          { at: [x, 0, z] },
        );
      else {
        const sx = x < 1.5 ? -1 : 1;
        const sz = z < 1 ? -1 : 1;
        m.add(taper(cyl(0.022, 0.022, h, 10), 1.7, 0, h), wood, {
          at: [x + sx * 0.07, 0, z + sz * 0.07],
          rot: [sz * 0.1, 0, -sx * 0.1],
        });
        m.add(cyl(0.017, 0.017, 0.02, 10), P.brass, { at: [x + sx * 0.07, 0, z + sz * 0.07] });
      }
    }
  if (farm) m.add(box([2.3, 0.05, 0.06], 0.006), wood, { at: [1.5, 0.15, 1] });
  // (story) a runner down its middle, and a bowl of lemons, or candles
  if (o.seed > 0.4) {
    m.add(box([2.4, 0.003, 0.4], 0.001), farm ? P.linen : 0x3f6b62, { at: [1.5, DINE + 0.0015, 1] });
    for (const s of [-1, 1])
      m.add(box([0.003, 0.004, 0.4]), shade(farm ? P.linen : 0x3f6b62, 0.8), { at: [1.5 + s * 1.2, DINE + 0.002, 1] });
  }
}

// ── nesting tables (1×1) ─────────────────────────────────────────────────────────────────────────
// A pair: the big one at 0.55 (things stand on it), the small one at 0.45 pulled half out from under
// it. Walnut on tapered legs, or brass rod frames with marble tops.
const NEST = 0.55;
function nestingTables(m: Model, o: Look) {
  const brass = o.look === 1;
  const topC = brass ? T.marble : P.walnut;
  const frame = brass ? P.brass : P.walnut;
  const table = (x0: number, z0: number, x1: number, z1: number, h: number, back: boolean) => {
    const th = brass ? 0.02 : 0.025;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    m.add(extrude(roundRect(x1 - x0, z1 - z0, brass ? 0.03 : 0.04, 3), th, 0.004, 1).rotateX(Math.PI / 2), topC, {
      at: [cx, h - th / 2, cz],
    });
    if (brass) {
      // veins, and a brass rod frame: four legs and a rail under the top
      for (const [u, v, a] of [
        [-0.1, -0.05, 0.4],
        [0.08, 0.06, -0.7],
      ])
        m.add(box([0.25, 0.001, 0.004]), T.marbleVein, { at: [cx + u, h + 0.0005, cz + v], rot: [0, a, 0] });
      const ins = 0.02;
      for (const x of [x0 + ins, x1 - ins])
        for (const z of [z0 + ins, z1 - ins]) m.add(cyl(0.008, 0.008, h - th, 6), frame, { at: [x, 0, z] });
      for (const y of [h - th - 0.01, 0.03]) {
        m.add(rod(0.006, 0.006, x1 - x0 - 2 * ins, "x", 6), frame, { at: [cx, y, z0 + ins] });
        m.add(rod(0.006, 0.006, x1 - x0 - 2 * ins, "x", 6), frame, { at: [cx, y, z1 - ins] });
        m.add(rod(0.006, 0.006, z1 - z0 - 2 * ins, "z", 6), frame, { at: [x0 + ins, y, cz] });
        if (!back || y > 0.1) m.add(rod(0.006, 0.006, z1 - z0 - 2 * ins, "z", 6), frame, { at: [x1 - ins, y, cz] });
      }
    } else {
      m.add(box([x1 - x0 - 0.06, 0.05, z1 - z0 - 0.06], 0.004), shade(P.walnut, 0.88), {
        at: [cx, h - th - 0.025, cz],
      });
      for (const x of [x0 + 0.04, x1 - 0.04])
        for (const z of [z0 + 0.04, z1 - 0.04])
          m.add(taper(cyl(0.017, 0.017, h - th, 8), 1.4, 0, h - th), P.walnut, { at: [x, 0, z] });
    }
  };
  table(0.04, 0.04, 0.96, 0.8, NEST, true);
  table(0.13, 0.3, 0.87, 0.96, 0.45, false);
  // (story) on the small one: a stack of two books, or a plant in a little pot
  if (o.seed > 0.5) {
    m.add(box([0.22, 0.03, 0.16], 0.003), P.oxblood, { at: [0.6, 0.465, 0.86], rot: [0, 0.2, 0] });
    m.add(box([0.2, 0.025, 0.15], 0.003), 0x3f6b62, { at: [0.6, 0.493, 0.86], rot: [0, 0.05, 0] });
  } else {
    m.add(cyl(0.05, 0.045, 0.07, 12), P.terracotta, { at: [0.3, 0.45, 0.88] });
    for (let i = 0; i < 5; i++)
      m.add(ball(0.03, 6), P.leaf, {
        at: [0.3 + Math.cos(i * 1.3) * 0.03, 0.54 + (i % 2) * 0.02, 0.88 + Math.sin(i * 1.3) * 0.03],
      });
  }
}

// ── the bedside table (1×1) ─────────────────────────────────────────────────────────────────────
// A small top at 0.6, a drawer with its knob, an open shelf under it, on tapered legs. Oak, or white
// with an oak top. On the shelf, by its seed: a book, or folded glasses' case.
const BEDSIDE = 0.6;
function bedsideTable(m: Model, o: Look) {
  const white = o.look === 1;
  const body = white ? T.white : P.oak;
  const topC = white ? P.oakLight : shade(P.oak, 1.05);
  const w = 0.58;
  const d = 0.48;
  const cz = 0.5;
  m.add(box([w, 0.028, d], 0.008, 2), topC, { at: [0.5, BEDSIDE - 0.014, cz] });
  m.add(box([w - 0.02, 0.2, d - 0.02], 0.006), body, { at: [0.5, BEDSIDE - 0.128, cz] });
  m.add(box([w - 0.06, 0.15, 0.014], 0.003), shade(body, 1.04), { at: [0.5, BEDSIDE - 0.128, cz + d / 2 - 0.005] });
  m.add(ball(0.018, 10), white ? P.brass : P.walnutDark, { at: [0.5, BEDSIDE - 0.128, cz + d / 2 + 0.012] });
  // the open shelf
  m.add(box([w - 0.04, 0.02, d - 0.04], 0.004), body, { at: [0.5, 0.2, cz] });
  for (const s of [-1, 1])
    m.add(box([0.02, BEDSIDE - 0.228 - 0.2, d - 0.04], 0.004), body, {
      at: [0.5 + s * (w / 2 - 0.03), (BEDSIDE - 0.228 + 0.2) / 2, cz],
    });
  // the legs
  for (const x of [0.5 - w / 2 + 0.04, 0.5 + w / 2 - 0.04])
    for (const z of [cz - d / 2 + 0.04, cz + d / 2 - 0.04])
      m.add(taper(cyl(0.02, 0.02, 0.2, 8), 1.4, 0, 0.2), white ? P.oakLight : P.oak, {
        at: [x, 0, z],
        rot: [z < cz ? 0.08 : -0.08, 0, x < 0.5 ? -0.08 : 0.08],
      });
  if (o.seed > 0.5) {
    m.add(box([0.17, 0.035, 0.23], 0.004), 0x3f6b62, { at: [0.44, 0.228, cz], rot: [0, 0.15, 0] });
    m.add(box([0.16, 0.025, 0.22], 0.004), P.mustard, { at: [0.44, 0.258, cz], rot: [0, 0.05, 0] });
  } else m.add(box([0.16, 0.04, 0.07], 0.018, 2), P.oxblood, { at: [0.6, 0.23, cz + 0.05], rot: [0, -0.3, 0] });
}

// ── the folding table (2×1) ──────────────────────────────────────────────────────────────────────
// Six feet long at 0.74: a white moulded top on grey steel legs folded out (their braces, their
// feet), or a varnished plywood top on folding X-legs.
function foldingTable(m: Model, o: Look) {
  const wood = o.look === 1;
  const W = 1.83;
  const Dp = 0.8;
  const th = wood ? 0.022 : 0.045;
  const cz = 0.5;
  if (wood) {
    m.add(box([W, th, Dp], 0.006, 2), 0xc9a26a, { at: [1, DESK - th / 2, cz] });
    m.add(box([W - 0.06, 0.06, 0.02], 0.004), 0xa98250, { at: [1, DESK - th - 0.03, cz - Dp / 2 + 0.04] });
    m.add(box([W - 0.06, 0.06, 0.02], 0.004), 0xa98250, { at: [1, DESK - th - 0.03, cz + Dp / 2 - 0.04] });
    // X-legs at each end, crossed at their middle on a bolt
    for (const x of [0.22, 1.78]) {
      const h = DESK - th - 0.06;
      const len = Math.hypot(h, Dp - 0.14);
      const a = Math.atan2(Dp - 0.14, h);
      for (const s of [-1, 1])
        m.add(box([0.035, len, 0.035], 0.006), 0xa98250, {
          at: [x + s * 0.025, h / 2 + 0.0175 * Math.sin(a) + 0.002, cz],
          rot: [s * a, 0, 0],
        });
      m.add(cyl(0.012, 0.012, 0.09, 8).rotateZ(Math.PI / 2), P.steel, { at: [x, h / 2, cz] });
      m.add(rod(0.012, 0.012, Dp - 0.1, "z", 6), P.steel, { at: [x - 0.025, 0.02, cz] });
    }
  } else {
    // the moulded top: rounded, its rim lipped, its grained surface
    m.add(extrude(roundRect(W, Dp, 0.03, 3), th, 0.01, 2).rotateX(Math.PI / 2), T.white, {
      at: [1, DESK - th / 2, cz],
    });
    m.add(box([W - 0.1, 0.02, Dp - 0.1], 0.004), shade(T.white, 0.88), { at: [1, DESK - th - 0.01, cz] });
    // the legs: a U of grey tube each end, a brace up to the top's middle, rubber feet
    for (const s of [-1, 1]) {
      const x = 1 + s * (W / 2 - 0.15);
      for (const z of [cz - Dp / 2 + 0.07, cz + Dp / 2 - 0.07]) {
        m.add(cyl(0.014, 0.014, DESK - th - 0.02, 8), T.grey, { at: [x, 0.02, z] });
        m.add(cyl(0.018, 0.018, 0.025, 8), P.rubber, { at: [x, 0, z] });
      }
      m.add(rod(0.012, 0.012, Dp - 0.14, "z", 8), T.grey, { at: [x, 0.12, cz] });
      m.add(rod(0.01, 0.01, Dp - 0.14, "z", 8), T.grey, { at: [x, DESK - th - 0.04, cz] });
      m.add(
        tube(
          [
            [x, 0.12, cz],
            [x - s * 0.35, DESK - th - 0.03, cz],
          ],
          0.008,
          6,
          2,
        ),
        T.grey,
      );
      m.add(box([0.05, 0.02, 0.05], 0.004), T.grey, { at: [x - s * 0.36, DESK - th - 0.03, cz] });
    }
  }
  // (story) flyers left out with a pen, or a sign-up sheet
  if (o.seed > 0.6) {
    for (let i = 0; i < 2; i++)
      m.add(box([0.21, 0.001, 0.297]), i ? 0xf2d48a : P.paperWhite, {
        at: [0.4, DESK + 0.0005 + i * 0.001, 0.62],
        rot: [0, 0.08 * i, 0],
      });
    m.add(rod(0.004, 0.004, 0.14, "x", 6), T.blue, { at: [0.58, DESK + 0.004, 0.66], rot: [0, 0.3, 0] });
  } else if (o.seed < 0.3) {
    m.add(box([0.21, 0.001, 0.297]), P.paperWhite, { at: [1.5, DESK + 0.0005, 0.6], rot: [0, -0.1, 0] });
    for (let i = 0; i < 6; i++)
      m.add(box([0.15, 0.0005, 0.004]), P.ink, { at: [1.5, DESK + 0.0012, 0.5 + i * 0.035], rot: [0, -0.1, 0] });
  }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  corner_desk: cornerDesk,
  drafting_table: draftingTable,
  workbench,
  round_table: roundTable,
  dining_table: diningTable,
  nesting_tables: nestingTables,
  bedside_table: bedsideTable,
  folding_table: foldingTable,
};
