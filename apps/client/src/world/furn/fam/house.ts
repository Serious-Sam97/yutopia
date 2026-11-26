import { ball, box, cyl, type Look, lathe, type Model } from "../kit";
import { ornateInto } from "../ornate";
import { P, shade } from "../palette";

// Plan 130 phase 3 (docs/plan/130-the-house-build.md): the house's columns, in the kit's frame (x across the tile, z
// down it, y up, metres), each a storey high (STOREY_H) centred on its tile: a porch's round and square ones (three
// paints each), the classic orders (Tuscan, Doric with its flutes, Ionic with its scrolls), a log post, brick and stone
// piers, a steel lally pole, a pergola's post, a newel post. Their entries and solids in the shared fam/house.ts.

const H = 3.266;
const PAINTS = [P.white, 0x2f4060, 0x3e5a3a];

export const LOOKS: Record<string, readonly string[]> = {
  porch_column: ["White", "Navy", "Sage"],
  square_post: ["White", "Navy", "Sage"],
  tuscan_column: ["Tuscan"],
  doric_column: ["Doric"],
  ionic_column: ["Ionic"],
  log_post: ["Log"],
  brick_pier: ["Brick"],
  stone_pier: ["Fieldstone"],
  steel_pole: ["Steel"],
  pergola_post: ["Cedar"],
  newel_post: ["Oak"],
  // (plan 130 phase 10)
  awning_stripe: ["Green stripe", "Red stripe", "Navy stripe"],
  house_numbers: ["Brass", "Black", "Ceramic"],
  wall_mailbox: ["Black", "Copper", "Red"],
};

/** A turned shaft: a plinth, a torus base, a tapering shaft, an echinus and an abacus — the orders' outline. */
function order(m: Model, r: number, col: number, cap: "tuscan" | "doric" | "ionic") {
  m.add(box([r * 2.6, 0.1, r * 2.6]), shade(col, 0.92), { at: [0.5, 0.05, 0.5] });
  m.add(
    lathe(
      [
        [r * 1.22, 0.1],
        [r * 1.24, 0.16],
        [r * 1.12, 0.21],
        [r * 1.05, 0.24],
      ],
      28,
    ),
    col,
    { at: [0.5, 0, 0.5] },
  );
  m.add(cyl(r, r * 0.84, H - 0.58, 28), col, { at: [0.5, 0.24, 0.5] });
  m.add(
    lathe(
      [
        [r * 0.86, H - 0.34],
        [r * 0.92, H - 0.3],
        [r * 1.18, H - 0.2],
        [r * 1.22, H - 0.18],
      ],
      28,
    ),
    col,
    { at: [0.5, 0, 0.5] },
  );
  m.add(box([r * 2.7, 0.14, r * 2.7]), shade(col, 0.95), { at: [0.5, H - 0.07, 0.5] });
  if (cap === "doric")
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      m.add(box([0.018, H - 0.66, 0.01]), shade(col, 0.82), {
        at: [0.5 + Math.cos(a) * r * 0.93, 0.24 + (H - 0.66) / 2, 0.5 + Math.sin(a) * r * 0.93],
        rot: [0, -a + Math.PI / 2, 0],
      });
    }
  if (cap === "ionic")
    for (const s of [-1, 1]) {
      m.add(cyl(0.07, 0.07, r * 2.4, 16), shade(col, 0.96), {
        at: [0.5 + s * r * 1.1, H - 0.27, 0.5 - r * 1.2],
        rot: [Math.PI / 2, 0, 0],
      });
    }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  porch_column: (m, o) => {
    const c = PAINTS[o.look] ?? P.white;
    m.add(box([0.34, 0.2, 0.34], 0.01), c, { at: [0.5, 0.1, 0.5] });
    m.add(cyl(0.13, 0.11, H - 0.38, 20), c, { at: [0.5, 0.2, 0.5] });
    m.add(box([0.32, 0.18, 0.32], 0.01), c, { at: [0.5, H - 0.09, 0.5] });
  },
  square_post: (m, o) => {
    const c = PAINTS[o.look] ?? P.white;
    m.add(box([0.3, 0.16, 0.3], 0.01), c, { at: [0.5, 0.08, 0.5] });
    m.add(box([0.2, H - 0.3, 0.2], 0.008), c, { at: [0.5, 0.16 + (H - 0.3) / 2, 0.5] });
    m.add(box([0.3, 0.14, 0.3], 0.01), c, { at: [0.5, H - 0.07, 0.5] });
    for (const y of [0.42, H - 0.34]) m.add(box([0.23, 0.04, 0.23]), shade(c, 0.94), { at: [0.5, y, 0.5] });
  },
  tuscan_column: (m) => order(m, 0.2, P.stone, "tuscan"),
  doric_column: (m) => order(m, 0.22, P.paperWhite, "doric"),
  ionic_column: (m) => order(m, 0.2, P.cream, "ionic"),
  log_post: (m) => {
    m.add(cyl(0.16, 0.14, H, 14), P.teak, { at: [0.5, 0, 0.5] });
    for (const y of [0.5, 1.3, 2.1, 2.8]) m.add(cyl(0.17, 0.17, 0.03, 14), shade(P.teak, 0.8), { at: [0.5, y, 0.5] });
    m.add(box([0.5, 0.18, 0.36], 0.02), shade(P.teak, 0.9), { at: [0.5, H - 0.09, 0.5] });
  },
  brick_pier: (m) => {
    const B = P.terracotta;
    for (let y = 0, i = 0; y < H - 0.12; y += 0.075, i++)
      m.add(box([0.46, 0.065, 0.46]), shade(B, 0.86 + ((i * 37) % 9) * 0.03), { at: [0.5, y + 0.0325, 0.5] });
    m.add(box([0.54, 0.12, 0.54], 0.01), P.stone, { at: [0.5, H - 0.06, 0.5] });
  },
  stone_pier: (m) => {
    for (let y = 0, i = 0; y < H - 0.14; y += 0.27, i++)
      m.add(
        box([0.5 - (i % 2) * 0.03, 0.25, 0.5 - ((i + 1) % 2) * 0.03], 0.02),
        shade(P.pebble, 0.85 + (i % 3) * 0.08),
        {
          at: [0.5, y + 0.125, 0.5],
        },
      );
    m.add(box([0.58, 0.14, 0.58], 0.015), P.stone, { at: [0.5, H - 0.07, 0.5] });
  },
  steel_pole: (m) => {
    m.add(box([0.2, 0.012, 0.2]), P.steel, { at: [0.5, 0.006, 0.5] });
    m.add(cyl(0.045, 0.045, H - 0.024, 12), P.steelLight, { at: [0.5, 0.012, 0.5] });
    m.add(box([0.2, 0.012, 0.2]), P.steel, { at: [0.5, H - 0.006, 0.5] });
  },
  pergola_post: (m) => {
    m.add(box([0.16, 2.6, 0.16], 0.01), P.oak, { at: [0.5, 1.3, 0.5] });
    m.add(box([0.9, 0.18, 0.08], 0.01), shade(P.oak, 0.9), { at: [0.5, 2.5, 0.42] });
    m.add(box([0.9, 0.18, 0.08], 0.01), shade(P.oak, 0.9), { at: [0.5, 2.5, 0.58] });
  },
  newel_post: (m) => {
    m.add(box([0.18, 1.0, 0.18], 0.008), P.walnut, { at: [0.5, 0.5, 0.5] });
    m.add(box([0.22, 0.06, 0.22], 0.01), shade(P.walnut, 0.9), { at: [0.5, 1.03, 0.5] });
    m.add(
      lathe(
        [
          [0.06, 1.06],
          [0.08, 1.1],
          [0.06, 1.16],
          [0.001, 1.2],
        ],
        14,
      ),
      P.walnut,
      { at: [0.5, 0, 0.5] },
    );
  },
  // ── (plan 130 phase 10) fireplaces ─────────────────────────────────────────────────────────────────────────────
  fp_brick: (m) => mantelFire(m, 2, "brick"),
  fp_stone: (m) => mantelFire(m, 2, "stone"),
  fp_marble: (m) => mantelFire(m, 2, "marble"),
  fp_rustic: (m) => mantelFire(m, 2, "rustic"),
  fp_tiled: (m) => mantelFire(m, 2, "tiled"),
  fp_modern: (m) => {
    m.add(box([1.9, 1.35, 0.35], 0.01), P.graphite, { at: [1, 0.675, 0.225] });
    m.add(box([1.5, 0.32, 0.02]), 0x111111, { at: [1, 0.55, 0.405] });
    fire(m, 1, 0.53, 0.36, 1.3);
    m.add(box([1.9, 0.04, 0.4]), P.stone, { at: [1, 1.37, 0.24] });
  },
  fp_stove: (m) => {
    const iron = 0x262626;
    m.add(box([0.56, 0.6, 0.5], 0.03), iron, { at: [0.5, 0.42, 0.53] });
    for (const [x, z] of [
      [0.28, 0.33],
      [0.72, 0.33],
      [0.28, 0.73],
      [0.72, 0.73],
    ])
      m.add(cyl(0.02, 0.025, 0.12, 6), iron, { at: [x, 0, z] });
    m.add(box([0.34, 0.26, 0.02]), 0x111111, { at: [0.5, 0.42, 0.79] });
    fire(m, 0.5, 0.92, 0.3, 0.28, 0.32);
    m.add(cyl(0.075, 0.075, 2.24, 14), iron, { at: [0.5, 0.72, 0.5] });
    m.add(box([0.9, 0.04, 0.9]), P.stone, { at: [0.5, 0.02, 0.5] });
  },
  fp_corner: (m) => {
    // a kiva in the corner: a rounded plaster breast to the ceiling, its arched mouth
    m.add(cyl(0.38, 0.32, 2.4, 20), P.cream, { at: [0.36, 0, 0.36] });
    m.add(box([0.5, 0.5, 0.05]), 0x1a1210, { at: [0.5, 0.45, 0.7], rot: [0, Math.PI / 4, 0] });
    fire(m, 0.56, 0.86, 0.24, 0.34);
    m.add(box([0.8, 0.05, 0.8]), P.terracotta, { at: [0.4, 0.025, 0.4] });
  },
  // ── porches, pergolas, the garden's ──────────────────────────────────────────────────────────────────────────
  pergola_cedar: (m) => pergola(m, P.oak, false),
  pergola_white: (m) => pergola(m, P.white, false),
  pergola_louvre: (m) => pergola(m, P.alumDark, true),
  porch_roof: (m) => {
    const c = P.white;
    for (const x of [0.15, 2.85]) m.add(box([0.16, 2.6, 0.16], 0.01), c, { at: [x, 1.3, 1.85] });
    m.add(box([3, 0.16, 0.12], 0.01), c, { at: [1.5, 2.6, 1.85] });
    // its roof: a shed from the wall down to the beam, shingled
    m.add(box([3.2, 0.06, 2.3], 0.01), 0x5a5e66, { at: [1.5, 2.86, 1.05], rot: [-0.17, 0, 0] });
    m.add(box([3.2, 0.14, 0.04]), c, { at: [1.5, 2.66, 2.18] });
  },
  gazebo: (m) => {
    const c = P.white;
    const r = 1.35;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      m.add(box([0.12, 2.5, 0.12], 0.01), c, { at: [1.5 + Math.cos(a) * r, 1.25, 1.5 + Math.sin(a) * r] });
      // its rail between, but at the way in
      if (i !== 2) {
        const b = a + Math.PI / 8;
        m.add(box([2 * r * Math.sin(Math.PI / 8), 0.06, 0.06]), c, {
          at: [1.5 + Math.cos(b) * r * 0.93, 0.9, 1.5 + Math.sin(b) * r * 0.93],
          rot: [0, -b + Math.PI / 2, 0],
        });
      }
    }
    m.add(cyl(1.55, 1.55, 0.16, 8), P.oak, { at: [1.5, 0, 1.5] });
    m.add(cyl(1.6, 0.05, 1.0, 8), 0x5a5e66, { at: [1.5, 2.5, 1.5] });
    m.add(ball(0.08, 6), P.brass, { at: [1.5, 3.52, 1.5] });
  },
  pavilion: (m) => {
    for (const [x, z] of [
      [0.2, 0.2],
      [2.8, 0.2],
      [0.2, 2.8],
      [2.8, 2.8],
    ])
      m.add(box([0.22, 2.6, 0.22], 0.02), P.teak, { at: [x, 1.3, z] });
    m.add(box([3.1, 0.2, 3.1], 0.02), shade(P.teak, 0.85), { at: [1.5, 2.7, 1.5] });
    // a hip roof: four slopes to a point
    m.add(cyl(2.35, 0.04, 1.2, 4), 0x6a3f2c, { at: [1.5, 2.8, 1.5], rot: [0, Math.PI / 4, 0] });
  },
  garden_arbor: (m) => {
    const c = P.white;
    for (const x of [0.12, 1.88]) {
      m.add(box([0.1, 2.3, 0.1], 0.005), c, { at: [x, 1.15, 0.4] });
      m.add(box([0.1, 2.3, 0.1], 0.005), c, { at: [x, 1.15, 0.6] });
      for (let y = 0.3; y < 2.1; y += 0.3) m.add(box([0.03, 0.03, 0.26]), c, { at: [x, y, 0.5] });
    }
    // the arch over the way through
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      m.add(box([0.06, 0.06, 0.36]), c, { at: [1 + Math.cos(a) * 0.88, 2.3 + Math.sin(a) * 0.38, 0.5] });
    }
    for (const z of [0.38, 0.62])
      for (let i = 0; i < 10; i++) {
        const a0 = Math.PI - (i / 10) * Math.PI;
        const a1 = Math.PI - ((i + 1) / 10) * Math.PI;
        const [x0, y0, x1, y1] = [Math.cos(a0) * 0.88, Math.sin(a0) * 0.38, Math.cos(a1) * 0.88, Math.sin(a1) * 0.38];
        m.add(box([Math.hypot(x1 - x0, y1 - y0) + 0.01, 0.05, 0.04]), c, {
          at: [1 + (x0 + x1) / 2, 2.3 + (y0 + y1) / 2, z],
          rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)],
        });
      }
    leaves(m, 1, 2.55, 0.5, 0.9, 7);
  },
  carport: (m) => {
    for (const [x, z] of [
      [0.15, 0.15],
      [2.85, 0.15],
      [0.15, 4.85],
      [2.85, 4.85],
      [0.15, 2.5],
      [2.85, 2.5],
    ])
      m.add(cyl(0.05, 0.05, 2.5, 10), P.steelLight, { at: [x, 0, z] });
    for (const x of [0.15, 2.85]) m.add(box([0.1, 0.18, 5], 0.005), P.steel, { at: [x, 2.5, 2.5] });
    m.add(box([3.3, 0.05, 5.4], 0.01), P.alum, { at: [1.5, 2.62, 2.5] });
  },
  trellis: (m) => {
    for (const x of [0.06, 1.94]) m.add(box([0.08, 2.1, 0.08]), P.oak, { at: [x, 1.05, 0.5] });
    for (let x = 0.25; x < 1.9; x += 0.25) m.add(box([0.025, 2.0, 0.025]), P.oak, { at: [x, 1.0, 0.5] });
    for (let y = 0.25; y < 2.0; y += 0.25) m.add(box([1.9, 0.025, 0.025]), P.oak, { at: [1, y, 0.5] });
    leaves(m, 1, 1.4, 0.5, 0.85, 9);
  },
  lattice_screen: (m) => {
    for (const x of [0.04, 1.96]) m.add(box([0.08, 1.9, 0.08]), P.white, { at: [x, 0.95, 0.5] });
    m.add(box([2, 0.06, 0.08]), P.white, { at: [1, 1.87, 0.5] });
    // (its lattice: laths across and up, one face's over the other's, inside its frame)
    for (let x = 0.2; x < 1.9; x += 0.2) m.add(box([0.03, 1.72, 0.015]), P.white, { at: [x, 0.94, 0.488] });
    for (let y = 0.2; y < 1.8; y += 0.2) m.add(box([1.84, 0.03, 0.015]), P.white, { at: [1, y, 0.512] });
  },
  // ── hung on the wall ──────────────────────────────────────────────────────────────────────────────────────────
  awning_stripe: (m, o) => {
    const c = [0x3e6a4a, 0xa83a34, 0x2f4060][o.look] ?? 0x3e6a4a;
    const n = 10;
    for (let i = 0; i < n; i++)
      m.add(box([2 / n, 0.02, 0.92]), i % 2 ? P.linen : c, {
        at: [(i + 0.5) * (2 / n), 2.48, 0.55],
        rot: [0.5, 0, 0],
      });
    // its valance, scalloped by the stripes
    for (let i = 0; i < n; i++)
      m.add(box([2 / n - 0.004, 0.16, 0.01]), i % 2 ? P.linen : c, { at: [(i + 0.5) * (2 / n), 2.18, 0.94] });
    for (const x of [0.06, 1.94]) m.add(box([0.02, 0.02, 0.9]), P.steel, { at: [x, 2.3, 0.55], rot: [0.5, 0, 0] });
  },
  awning_metal: (m) => {
    m.add(box([1.9, 0.03, 0.75], 0.005), P.alumDark, { at: [1, 2.5, 0.47], rot: [0.12, 0, 0] });
    for (let x = 0.1; x < 1.95; x += 0.2)
      m.add(box([0.012, 0.02, 0.75]), P.alum, { at: [x, 2.52, 0.47], rot: [0.12, 0, 0] });
    // (its braces back to the wall, under it)
    for (const x of [0.15, 1.85]) m.add(box([0.012, 0.012, 0.8]), P.steel, { at: [x, 2.3, 0.5], rot: [-0.5, 0, 0] });
  },
  door_hood: (m) => {
    const c = P.white;
    m.add(box([0.58, 0.04, 0.55], 0.005), 0x5a5e66, { at: [0.25, 2.66, 0.4], rot: [0, 0, 0.5] });
    m.add(box([0.58, 0.04, 0.55], 0.005), 0x5a5e66, { at: [0.75, 2.66, 0.4], rot: [0, 0, -0.5] });
    for (const x of [0.06, 0.94]) {
      m.add(box([0.06, 0.4, 0.06]), c, { at: [x, 2.45, 0.14] });
      m.add(box([0.06, 0.06, 0.5]), c, { at: [x, 2.42, 0.38], rot: [-0.7, 0, 0] });
    }
    m.add(box([1, 0.08, 0.06]), c, { at: [0.5, 2.36, 0.66] });
  },
  house_numbers: (m, o) => {
    const c = [P.brass, P.ink, 0x2f5fa8][o.look] ?? P.brass;
    m.add(box([0.56, 0.18, 0.012]), o.look === 2 ? P.white : shade(P.cream, 0.9), { at: [0.5, 1.7, 0.106] });
    for (let i = 0; i < 3; i++) {
      const x = 0.32 + i * 0.18;
      m.add(box([0.1, 0.13, 0.008]), c, { at: [x, 1.7, 0.116] });
      m.add(box([0.06, 0.09, 0.009]), o.look === 2 ? P.white : shade(P.cream, 0.9), { at: [x, 1.7, 0.118] });
    }
  },
  porch_lantern: (m) => {
    m.add(box([0.1, 0.2, 0.03]), P.ink, { at: [0.5, 1.9, 0.115] });
    m.add(box([0.03, 0.03, 0.14]), P.ink, { at: [0.5, 2.0, 0.19] });
    m.add(box([0.17, 0.26, 0.17]), P.ink, { at: [0.5, 1.9, 0.26] });
    m.add(box([0.14, 0.22, 0.14]), 0xffd39a, { at: [0.5, 1.9, 0.26], glow: true });
    m.add(cyl(0.13, 0.02, 0.1, 4), P.ink, { at: [0.5, 2.03, 0.26], rot: [0, Math.PI / 4, 0] });
  },
  wall_mailbox: (m, o) => {
    const c = [P.ink, 0xb87333, 0xa83a34][o.look] ?? P.ink;
    m.add(box([0.36, 0.34, 0.1], 0.01), c, { at: [0.5, 1.2, 0.16] });
    m.add(box([0.3, 0.04, 0.12], 0.005), shade(c, 1.15), { at: [0.5, 1.37, 0.17], rot: [-0.25, 0, 0] });
    m.add(box([0.2, 0.02, 0.012]), P.brass, { at: [0.5, 1.25, 0.215] });
  },
  // ── (the quality pass) the ornate ones: their Blender models (furn/ornate.ts), a stand-in till they're in ────────
  fp_victorian: (m) => {
    if (!ornateInto(m, "fp_victorian")) mantelFire(m, 2, "marble");
    fire(m, 1, 0.62, 0.6, 0.7);
  },
  corinthian_column: (m) => {
    if (!ornateInto(m, "corinthian_column")) order(m, 0.2, P.stone, "ionic");
  },
  porch_bracket: (m) => {
    if (ornateInto(m, "porch_bracket")) return;
    m.add(box([0.05, 0.06, 0.5]), P.white, { at: [0.5, 2.82, 0.35] });
    m.add(box([0.05, 0.5, 0.06]), P.white, { at: [0.5, 2.56, 0.13] });
  },
  baluster_rail: (m) => {
    if (ornateInto(m, "baluster_rail")) return;
    for (let k = 0; k < 8; k++) m.add(cyl(0.03, 0.03, 0.78, 8), P.white, { at: [0.28 + k * 0.206, 0.08, 0.5] });
    m.add(box([1.84, 0.06, 0.1]), P.white, { at: [1, 0.89, 0.5] });
    for (const x of [0.06, 1.94]) m.add(box([0.12, 1.0, 0.12]), P.white, { at: [x, 0.5, 0.5] });
  },
};

// (plan 130 phase 10) a fire in its grate: logs, the flames glowing; `w` wide at x, its mouth at z
function fire(m: Model, x: number, z: number, w: number, top: number, y0 = 0.08) {
  for (const s of [-1, 1])
    m.add(cyl(0.04, 0.04, w * 0.8, 6), 0x3a2416, {
      at: [x + s * 0.03, y0 + 0.05, z - 0.1],
      rot: [0, 0, Math.PI / 2 + s * 0.2],
    });
  void top;
  for (let i = 0; i < 4; i++) {
    const fx = x - w * 0.3 + (i / 3) * w * 0.6;
    m.add(cyl(0.05, 0.005, 0.22 + (i % 2) * 0.08, 6), i % 2 ? 0xffb04a : 0xff7a2a, {
      at: [fx, y0 + 0.08, z - 0.1],
      glow: true,
    });
  }
}
/** A fireplace's breast and mantel against the wall, its firebox and hearth: in brick, stone, marble, logs, tiles. */
function mantelFire(m: Model, w: number, kind: "brick" | "stone" | "marble" | "rustic" | "tiled") {
  const cx = w / 2;
  const face =
    kind === "marble"
      ? 0xece8e2
      : kind === "stone"
        ? P.pebble
        : kind === "tiled"
          ? P.walnutDark
          : kind === "rustic"
            ? P.pebble
            : P.terracotta;
  // its breast: courses for brick and stone
  if (kind === "brick" || kind === "stone" || kind === "rustic") {
    const h = kind === "brick" ? 0.075 : 0.22;
    for (let y = 0, i = 0; y < 1.2; y += h, i++)
      m.add(box([1.86, h - 0.008, 0.5], kind === "brick" ? 0 : 0.02), shade(face, 0.85 + ((i * 37) % 9) * 0.03), {
        at: [cx, y + h / 2, 0.3],
      });
  } else m.add(box([1.86, 1.2, 0.5], 0.01), face, { at: [cx, 0.6, 0.3] });
  // its firebox, dark; the hearth before it
  m.add(box([0.8, 0.7, 0.02]), 0x140d0a, { at: [cx, 0.43, 0.555] });
  if (kind === "tiled")
    for (let i = 0; i < 5; i++)
      for (const s of [-1, 1])
        m.add(box([0.14, 0.14, 0.012]), i % 2 ? 0x2f6a6a : 0x7fb5a1, { at: [cx + s * 0.5, 0.18 + i * 0.15, 0.572] });
  fire(m, cx, 0.7, 0.7, 0.7);
  m.add(box([w, 0.06, 0.45], 0.01), kind === "marble" ? 0xf4f1ec : P.stone, { at: [cx, 0.03, 0.75] });
  // its mantel shelf
  const shelf = kind === "rustic" ? P.teak : kind === "marble" ? 0xf4f1ec : kind === "tiled" ? P.walnut : P.oak;
  m.add(box([w, kind === "rustic" ? 0.18 : 0.07, 0.6], 0.01), shelf, { at: [cx, 1.24, 0.32] });
  if (kind === "marble")
    for (const s of [-1, 1]) m.add(box([0.14, 1.2, 0.08], 0.01), 0xf4f1ec, { at: [cx + s * 0.78, 0.6, 0.58] });
}
/** A pergola: four posts, two beams, rafters across; louvres (a modern one's) or open slats. */
function pergola(m: Model, c: number, louvre: boolean) {
  for (const [x, z] of [
    [0.15, 0.15],
    [2.85, 0.15],
    [0.15, 2.85],
    [2.85, 2.85],
  ])
    m.add(box([louvre ? 0.14 : 0.16, 2.6, louvre ? 0.14 : 0.16], 0.008), c, { at: [x, 1.3, z] });
  for (const z of [0.15, 2.85]) m.add(box([3.3, 0.2, 0.1], 0.008), shade(c, 0.94), { at: [1.5, 2.5, z] });
  if (louvre)
    for (let x = 0.2; x < 2.9; x += 0.18)
      m.add(box([0.14, 0.02, 2.9]), shade(c, 1.12), { at: [x, 2.62, 1.5], rot: [0, 0, 0.5] });
  else for (let x = 0.1; x < 3; x += 0.32) m.add(box([0.06, 0.16, 3.3], 0.005), c, { at: [x, 2.68, 1.5] });
}
/** A climber's leaves over a frame: clusters at (x ± spread, y, z). */
function leaves(m: Model, x: number, y: number, z: number, spread: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (i * 2.4) % (Math.PI * 2);
    m.add(ball(0.16 + (i % 3) * 0.04, 6), i % 2 ? P.leaf : P.leafYoung, {
      at: [x + Math.cos(a) * spread * ((i % 4) / 4 + 0.2), y + Math.sin(a * 1.7) * 0.4, z + (i % 2 ? 0.08 : -0.08)],
    });
  }
}
