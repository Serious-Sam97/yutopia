import { ball, box, cushion, cyl, type Look, lathe, leaf, type Model, ring, rod, tube, type V3 } from "./kit";
import { P, shade } from "./palette";

// Decor, the floor, pets and outside (docs/plan/67-the-furniture.md, phase 8), in the kit's frame:
// x across the footprint, z down it, y up; things that face somewhere face the room (+z). Real
// foliage — leaves folded and bent, never cards — the rugs flat on the floor, the pets' things at a
// cat's and a dog's size, the toy box's first drawing, the parkour pieces exactly as their shapes
// (shared shapes: Flowmotion grinds, runs up and swings on those numbers).

export const DECOR_LOOKS = {
  plant: ["Monstera", "Snake plant", "Fern on a stand", "Rubber tree", "Cactus bowl"],
  partition: ["Upholstered divider", "Slatted divider", "Frosted glass divider"],
  column: ["Column", "Column with a note"],
  rug: ["Medallion rug", "Kilim", "Shag rug"],
  standup_mat: ["Standup ring"],
  pet_bed: ["Cushion bed", "Wicker basket"],
  pet_bowl: ["Food bowl"],
  water_bowl: ["Water bowl"],
  scratch_post: ["Scratching post"],
  pet_house: ["Pet house", "Pet house, tiled roof"],
  toy_box: ["Toy box"],
  pk_rail: ["Grind rail"],
  pk_rail_long: ["Long grind rail"],
  pk_wall: ["Parkour wall"],
  pk_wall_tall: ["Tall parkour wall"],
  pk_pole: ["Swing pole"],
  pk_pole_tall: ["Tall swing pole"],
} as const;

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const GOLDEN = 2.39996;

// ── plants (1×1) ──────────────────────────────────────────────────────────────────────────────────
/** A pot turned from its profile with soil in it; returns the soil's height. */
function pot(m: Model, color: number, r0: number, r1: number, h: number, y = 0, rim = true): number {
  const prof: [number, number][] = [
    [0.001, 0],
    [r0, 0],
    [r1, h],
    ...(rim
      ? ([
          [r1 + 0.018, h],
          [r1 + 0.018, h + 0.03],
          [r1 - 0.01, h + 0.03],
        ] as [number, number][])
      : ([[r1 - 0.012, h]] as [number, number][])),
    [r1 - 0.016, h - 0.03],
  ];
  m.add(lathe(prof, 16), color, { at: [0.5, y, 0.5] });
  const top = y + h - 0.02 + (rim ? 0.01 : 0);
  m.add(cyl(r1 - 0.014, r1 - 0.014, 0.01, 14), P.soil, { at: [0.5, top - 0.01, 0.5] });
  return top;
}

/** A plant by its look: the monstera (phase 0's, its leaves split), a snake plant's swords in a
 *  glazed cream pot, a fern's fronds arching off a walnut stand, a rubber tree, a bowl of cacti
 *  (one in flower, by its seed). */
export function plant(m: Model, o: Look) {
  const s = o.seed;
  if (o.look === 1) {
    // snake plant: upright swords, banded
    m.add(cyl(0.19, 0.19, 0.12, 16), P.cream, { at: [0.5, 0, 0.5] });
    m.add(cyl(0.192, 0.192, 0.05, 16), P.rust, { at: [0.5, 0.12, 0.5] });
    const top = pot(m, P.cream, 0.19, 0.19, 0.24, 0.17, false);
    for (let i = 0; i < 11; i++) {
      const a = i * GOLDEN;
      const r = 0.03 + (i % 3) * 0.03;
      const len = 0.62 + rnd(i, 1, s) * 0.42;
      m.add(leaf(len, 0.085, 0.35, 0.04, 6), i % 2 ? P.leaf : 0x4f7a3c, {
        at: [0.5 + Math.cos(a) * r, top, 0.5 + Math.sin(a) * r],
        rot: [-Math.PI / 2 + 0.12 + rnd(i, 2, s) * 0.18, Math.PI / 2 - a, 0],
        tone: 0.9 + rnd(i, 3, s) * 0.2,
      });
    }
    // (story) a "water me" note on a stick
    if (s > 0.5) {
      m.add(cyl(0.003, 0.003, 0.16), P.oak, { at: [0.62, top - 0.02, 0.6] });
      m.add(box([0.07, 0.05, 0.004]), 0xe8c25a, { at: [0.62, top + 0.15, 0.6] });
    }
    return;
  }
  if (o.look === 2) {
    // fern on a walnut plant stand
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      m.add(
        tube(
          [
            [0.5 + Math.cos(a) * 0.14, 0.58, 0.5 + Math.sin(a) * 0.14],
            [0.5 + Math.cos(a) * 0.2, 0.25, 0.5 + Math.sin(a) * 0.2],
            [0.5 + Math.cos(a) * 0.24, 0, 0.5 + Math.sin(a) * 0.24],
          ],
          0.016,
          5,
          6,
        ),
        P.walnutDark,
      );
    }
    m.add(cyl(0.2, 0.2, 0.03, 16), P.walnut, { at: [0.5, 0.58, 0.5] });
    m.add(ring(0.17, 0.008, 4, 16), P.walnutDark, { at: [0.5, 0.25, 0.5] });
    const top = pot(m, P.terracotta, 0.12, 0.16, 0.2, 0.61);
    for (let i = 0; i < 16; i++) {
      const a = i * GOLDEN;
      const len = 0.42 + rnd(i, 1, s) * 0.2;
      m.add(leaf(len, 0.15, 0.08, 0.55, 8, 6), i % 3 ? P.leafYoung : P.leaf, {
        at: [0.5 + Math.cos(a) * 0.03, top, 0.5 + Math.sin(a) * 0.03],
        rot: [-0.7 - rnd(i, 2, s) * 0.5, Math.PI / 2 - a, 0],
        tone: 0.9 + rnd(i, 3, s) * 0.2,
      });
    }
    return;
  }
  if (o.look === 3) {
    // rubber tree: a trunk, glossy dark leaves up it
    const top = pot(m, P.rust, 0.16, 0.2, 0.36);
    m.add(
      tube(
        [
          [0.5, top, 0.5],
          [0.52, top + 0.5, 0.49],
          [0.48, top + 1.05, 0.51],
        ],
        0.02,
        6,
        8,
      ),
      P.walnut,
    );
    for (let i = 0; i < 22; i++) {
      const k = i / 21;
      const a = i * GOLDEN;
      const y = top + 0.18 + k * 0.9;
      m.add(leaf(0.34 - k * 0.1, 0.17 - k * 0.05, 0.14, 0.22, 6), k > 0.9 ? 0x6a3a2c : 0x2f4a2a, {
        at: [0.5 + Math.cos(a) * 0.03, y, 0.5 + Math.sin(a) * 0.03],
        rot: [0.05 - k * 0.45, Math.PI / 2 - a, 0],
        tone: 0.95 + rnd(i, 1, s) * 0.15,
      });
    }
    return;
  }
  if (o.look === 4) {
    // a low olive bowl of cacti, one in flower (by its seed)
    const top = pot(m, P.olive, 0.2, 0.25, 0.12);
    m.add(cyl(0.23, 0.23, 0.012, 16), P.pebble, { at: [0.5, top, 0.5] });
    const cactus = (x: number, z: number, h: number, r: number) => {
      m.add(cyl(r, r, h - r, 10), 0x5f8a43, { at: [x, top, z] });
      m.add(ball(r, 10), 0x5f8a43, { at: [x, top + h - r, z], scale: [1, 0.8, 1] });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        m.add(box([0.006, h - r, 0.006]), 0x46693a, {
          at: [x + Math.cos(a) * r, top + (h - r) / 2, z + Math.sin(a) * r],
        });
      }
    };
    cactus(0.48, 0.5, 0.42, 0.07);
    cactus(0.62, 0.42, 0.26, 0.055);
    cactus(0.38, 0.6, 0.18, 0.05);
    // an arm on the tall one
    m.add(
      tube(
        [
          [0.53, top + 0.2, 0.5],
          [0.6, top + 0.22, 0.5],
          [0.61, top + 0.32, 0.5],
        ],
        0.032,
        8,
        6,
      ),
      0x5f8a43,
    );
    m.add(ball(0.032, 8), 0x5f8a43, { at: [0.61, top + 0.32, 0.5] });
    if (s > 0.4) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        m.add(ball(0.018, 6), 0xe86a8a, {
          at: [0.48 + Math.cos(a) * 0.016, top + 0.42, 0.5 + Math.sin(a) * 0.016],
          scale: [1, 0.5, 1],
        });
      }
      m.add(ball(0.01, 6), P.mustard, { at: [0.48, top + 0.425, 0.5] });
    }
    return;
  }
  // the monstera (phase 0's rich plant): a glazed pot on its saucer, split leaves spiralling up
  const potH = 0.36;
  m.add(
    lathe(
      [
        [0, 0],
        [0.2, 0],
        [0.21, 0.025],
        [0.2, 0.025],
      ],
      16,
    ),
    P.ceramic,
    { at: [0.5, 0, 0.5], tone: 0.92 },
  );
  m.add(
    lathe(
      [
        [0.0, 0],
        [0.14, 0],
        [0.155, 0.02],
        [0.19, potH - 0.04],
        [0.205, potH - 0.035],
        [0.205, potH],
        [0.185, potH],
        [0.18, potH - 0.03],
      ],
      16,
    ),
    P.ceramic,
    { at: [0.5, 0.02, 0.5] },
  );
  m.add(
    lathe(
      [
        [0.168, 0.12],
        [0.176, 0.15],
        [0.176, 0.16],
        [0.168, 0.12],
      ],
      16,
    ),
    P.ceramicBand,
    { at: [0.5, 0.02, 0.5] },
  );
  m.add(cyl(0.172, 0.172, 0.01, 16), P.soil, { at: [0.5, 0.02 + potH - 0.04, 0.5] });
  const base: V3 = [0.5, 0.02 + potH - 0.035, 0.5];
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN + 0.3;
    const k = i / (n - 1);
    const reach = 0.18 + 0.2 * (1 - k) + 0.04 * Math.sin(i * 1.7);
    const height = 0.36 + 0.62 * k + 0.08 * Math.cos(i * 2.3);
    const tip: V3 = [base[0] + Math.cos(a) * reach, base[1] + height, base[2] + Math.sin(a) * reach];
    const mid: V3 = [
      base[0] + Math.cos(a) * reach * 0.35,
      base[1] + height * 0.75,
      base[2] + Math.sin(a) * reach * 0.35,
    ];
    m.add(tube([base, mid, tip], 0.007, 5, 8), P.stem);
    const len = 0.4 * (0.7 + 0.4 * (1 - k));
    m.add(leaf(len, len, 0.22, 0.18 + 0.1 * (1 - k), 9, k < 0.8 ? 3 : 0), k > 0.8 ? P.leafYoung : P.leaf, {
      at: tip,
      rot: [0.15 + 0.35 * (1 - k), Math.PI / 2 - a, 0],
      tone: 0.9 + 0.12 * Math.sin(i * 3.1),
    });
  }
  // (story) a plant tag
  if (s > 0.5) {
    m.add(cyl(0.003, 0.003, 0.12), P.oak, { at: [0.62, 0.3, 0.58] });
    m.add(box([0.06, 0.035, 0.004]), P.paperWhite, { at: [0.62, 0.43, 0.58] });
  }
}

// ── the room divider (2×1) ────────────────────────────────────────────────────────────────────────
/** A free-standing screen 1.25 m tall on two sled feet: upholstered (its fabric the paint, olive
 *  unset) in a walnut frame, teak slats, or frosted glass in aluminium. */
export function partition(m: Model, o: Look) {
  const H = 1.25;
  for (const x of [0.23, 1.77]) {
    m.add(box([0.06, 0.04, 0.34], 0.008), P.walnutDark, { at: [x, 0.02, 0.5] });
    m.add(box([0.04, 0.03, 0.04]), P.walnutDark, { at: [x, 0.055, 0.5] });
  }
  if (o.look === 2) {
    for (const x of [0.08, 1.92]) m.add(box([0.035, H - 0.06, 0.05], 0.004), P.alum, { at: [x, (H + 0.06) / 2, 0.5] });
    for (const y of [0.08, H - 0.0175]) m.add(box([1.88, 0.035, 0.05], 0.004), P.alum, { at: [1, y, 0.5] });
    m.add(box([1.81, H - 0.16, 0.012]), 0xdfe9e9, {
      // (frosted glass: not the brushed metal its pale grey reads as)
      mat: "gloss",
      at: [1, (H + 0.1) / 2, 0.5],
    });
    for (let i = 0; i < 4; i++)
      m.add(box([1.81, 0.012, 0.014]), 0xf0f5f5, {
        mat: "gloss",
        at: [1, 0.35 + i * 0.25, 0.5],
      });
    return;
  }
  if (o.look === 1) {
    for (const x of [0.08, 1.92]) m.add(box([0.04, H - 0.06, 0.06], 0.004), P.walnut, { at: [x, (H + 0.06) / 2, 0.5] });
    for (const y of [0.08, H - 0.02]) m.add(box([1.88, 0.04, 0.06], 0.004), P.walnut, { at: [1, y, 0.5] });
    for (let i = 0; i < 11; i++)
      m.add(box([0.11, H - 0.16, 0.04], 0.006), i % 2 ? P.teak : shade(P.teak, 1.1), {
        at: [0.19 + i * 0.162, (H + 0.1) / 2, 0.5],
      });
    return;
  }
  const c = o.fabric ?? P.olive;
  for (const x of [0.08, 1.92])
    m.add(box([0.04, H - 0.06, 0.07], 0.004), P.walnutDark, { at: [x, (H + 0.06) / 2, 0.5] });
  for (const y of [0.08, H - 0.02]) m.add(box([1.88, 0.04, 0.07], 0.004), P.walnutDark, { at: [1, y, 0.5] });
  // (each panel swelling out of the frame both sides: the cushion's puff turned to face the room)
  for (const x of [0.54, 1.46])
    m.add(cushion([0.9, 0.05, H - 0.16], 0.4, 2), c, { at: [x, (H + 0.1) / 2, 0.5], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.012, H - 0.16, 0.066]), shade(c, 0.75), { at: [1, (H + 0.1) / 2, 0.5] });
}

// ── the column (1×1) ──────────────────────────────────────────────────────────────────────────────
/** A cream column, its shaft fluted, on a walnut base under a walnut capital; (look 1) a note taped
 *  on it. */
export function column(m: Model, o: Look) {
  const H = 2.1435;
  m.add(box([0.6, 0.12, 0.6], 0.01), P.walnutDark, { at: [0.5, 0.06, 0.5] });
  m.add(
    lathe(
      [
        [0.26, 0.12],
        [0.27, 0.15],
        [0.24, 0.18],
        [0.22, 0.19],
      ],
      24,
    ),
    P.walnut,
    { at: [0.5, 0, 0.5] },
  );
  m.add(cyl(0.22, 0.21, H - 0.38, 24), P.cream, { at: [0.5, 0.19, 0.5] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    m.add(box([0.016, H - 0.46, 0.008]), shade(P.cream, 0.86), {
      at: [0.5 + Math.cos(a) * 0.212, 0.19 + (H - 0.38) / 2, 0.5 + Math.sin(a) * 0.212],
      rot: [0, -a + Math.PI / 2, 0],
    });
  }
  m.add(
    lathe(
      [
        [0.21, H - 0.19],
        [0.26, H - 0.13],
        [0.3, H - 0.09],
        [0.3, H - 0.076],
      ],
      24,
    ),
    P.walnut,
    { at: [0.5, 0, 0.5] },
  );
  m.add(box([0.62, 0.076, 0.62], 0.008), 0x857f75, { at: [0.5, H - 0.038, 0.5] });
  if (o.look === 1) {
    m.add(box([0.2, 0.25, 0.004]), 0xe8c25a, { at: [0.5, 1.15, 0.716], rot: [0, 0, 0.06] });
    m.add(ball(0.012, 6), 0xc4402b, { at: [0.5, 1.26, 0.72] });
    for (let i = 0; i < 2; i++)
      m.add(box([0.13, 0.008, 0.002]), 0x6b4a20, { at: [0.5, 1.15 - i * 0.05, 0.719], rot: [0, 0, 0.06] });
  }
}

// ── rugs (4×3) ────────────────────────────────────────────────────────────────────────────────────
/** A rug flat on the floor (its field the paint, rust unset): a bordered medallion with cream
 *  fringe on its short ends, a flat-woven kilim in bands with diamonds, a deep shag. */
export function rug(m: Model, o: Look) {
  m.only("carpet");
  const field = o.fabric ?? P.rust;
  const flat = (x0: number, z0: number, x1: number, z1: number, y: number, c: number) =>
    m.add(box([x1 - x0, 0.002, z1 - z0]), c, { at: [(x0 + x1) / 2, y, (z0 + z1) / 2] });
  const diamond = (x: number, z: number, rx: number, rz: number, y: number, c: number) =>
    m.add(cyl(rz, rz, 0.002, 4), c, { at: [x, y, z], scale: [rx / rz, 1, 1] });
  if (o.look === 2) {
    m.add(cushion([3.7, 0.035, 2.7], 0.3, 2), field, { at: [2, 0.0175, 1.5] });
    for (let i = 0; i < 160; i++) {
      const x = 0.25 + rnd(i, 1, 0.3) * 3.5;
      const z = 0.25 + rnd(i, 2, 0.3) * 2.5;
      m.add(cyl(0.025, 0.012, 0.03, 4), shade(field, 0.85 + rnd(i, 3, 0.3) * 0.35), {
        at: [x, 0.025, z],
        rot: [0, rnd(i, 4, 0.3) * 3, 0],
      });
    }
    return;
  }
  if (o.look === 1) {
    const bands = [field, P.cream, 0xd9a441, 0x3f4a5a, P.cream, field, P.olive, P.cream, field];
    m.add(box([3.9, 0.006, 2.9]), field, { at: [2, 0.003, 1.5] });
    const w = 3.9 / bands.length;
    bands.forEach((c, i) => {
      flat(0.05 + i * w, 0.05, 0.05 + (i + 1) * w, 2.95, 0.0065, c);
    });
    for (let i = 1; i < bands.length; i += 2)
      for (let k = 0; k < 6; k++)
        diamond(0.05 + (i + 0.5) * w, 0.3 + k * 0.48, w * 0.32, 0.16, 0.008, i % 4 === 1 ? field : P.ink);
    for (let i = 0; i < 18; i++)
      for (const x of [-0.05, 4.05]) m.add(box([0.1, 0.004, 0.012]), P.cream, { at: [x, 0.002, 0.12 + i * 0.16] });
    return;
  }
  m.add(box([4, 0.008, 3]), P.olive, { at: [2, 0.004, 1.5] });
  flat(0.2, 0.2, 3.8, 2.8, 0.0085, field);
  flat(0.28, 0.28, 3.72, 2.72, 0.009, 0xd9a441);
  flat(0.31, 0.31, 3.69, 2.69, 0.0095, field);
  flat(0.42, 0.42, 3.58, 2.58, 0.01, shade(field, 0.9));
  for (const [r, c, k] of [
    [1.1, 0xd9a441, 0],
    [0.8, 0x6e2f22, 1],
    [0.5, P.cream, 2],
    [0.25, P.olive, 3],
  ] as const)
    diamond(2, 1.5, r * 1.3, r, 0.0105 + k * 0.0005, c);
  for (const [x, z] of [
    [0.75, 0.75],
    [3.25, 0.75],
    [0.75, 2.25],
    [3.25, 2.25],
  ])
    m.add(cyl(0.16, 0.16, 0.002, 8), 0xd9a441, { at: [x, 0.0105, z] });
  for (let i = 0; i < 24; i++)
    for (const x of [-0.06, 4.06]) m.add(box([0.12, 0.004, 0.014]), P.cream, { at: [x, 0.002, 0.1 + i * 0.12] });
}

// ── the standup ring (4×4) ────────────────────────────────────────────────────────────────────────
/** A round felt mat with amber rings inlaid and twelve VFD dots that glow. */
export function standupMat(m: Model) {
  m.only("matte");
  m.add(cyl(1.85, 1.85, 0.012, 48), 0x3a2a20, { at: [2, 0, 2] });
  m.add(ring(1.6, 0.025, 3, 64), P.mustard, { at: [2, 0.012, 2], scale: [1, 0.2, 1] });
  m.add(ring(1.15, 0.012, 3, 48), shade(P.mustard, 0.7), { at: [2, 0.012, 2], scale: [1, 0.2, 1] });
  m.add(cyl(0.35, 0.35, 0.004, 24), 0x5a4232, { at: [2, 0.012, 2] });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.add(cyl(0.05, 0.05, 0.004, 10), P.vfd, {
      at: [2 + Math.cos(a) * 1.38, 0.013, 2 + Math.sin(a) * 1.38],
      glow: true,
    });
  }
}

// ── for pets ──────────────────────────────────────────────────────────────────────────────────────
/** A round cushion bed with a rolled rim, or a wicker basket with a cushion in it; its fabric the
 *  paint (rust unset). */
export function petBed(m: Model, o: Look) {
  const c = o.fabric ?? P.rust;
  if (o.look === 1) {
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.4, 0],
          [0.44, 0.2],
          [0.42, 0.21],
          [0.38, 0.03],
          [0.001, 0.03],
        ],
        20,
      ),
      0xb08a56,
      { at: [0.5, 0, 0.5] },
    );
    for (let i = 0; i < 4; i++)
      m.add(ring(0.405 + i * 0.01, 0.006, 3, 24), 0x9a7647, { at: [0.5, 0.04 + i * 0.045, 0.5] });
    // (a round cushion in the round basket)
    m.add(
      lathe(
        [
          [0.001, 0.03],
          [0.34, 0.03],
          [0.37, 0.06],
          [0.35, 0.1],
          [0.2, 0.115],
          [0.001, 0.11],
        ],
        24,
      ),
      c,
      { at: [0.5, 0, 0.5] },
    );
    return;
  }
  m.add(cyl(0.42, 0.44, 0.08, 24), shade(c, 0.8), { at: [0.5, 0, 0.5] });
  m.add(ring(0.36, 0.075, 8, 28), c, { at: [0.5, 0.1, 0.5] });
  m.add(
    lathe(
      [
        [0.001, 0.06],
        [0.3, 0.06],
        [0.31, 0.09],
        [0.2, 0.12],
        [0.001, 0.115],
      ],
      24,
    ),
    shade(c, 0.9),
    { at: [0.5, 0, 0.5] },
  );
}

/** A pet's bowl (its colour the paint), with what's left in it (`portions` 0..3): kibble or water. */
export function bowl(m: Model, o: Look, water: boolean, portions: number) {
  const c = o.fabric ?? (water ? 0x3f4a5a : P.olive);
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.11, 0],
        [0.135, 0.07],
        [0.125, 0.075],
        [0.095, 0.015],
        [0.001, 0.015],
      ],
      20,
    ),
    c,
    { at: [0.5, 0, 0.5] },
  );
  const left = Math.max(0, Math.min(3, Math.round(portions)));
  if (!left) return;
  if (water) {
    m.add(cyl(0.1 + left * 0.008, 0.1 + left * 0.008, 0.002, 20), 0x8fc0ea, { at: [0.5, 0.015 + left * 0.016, 0.5] });
    return;
  }
  m.add(cyl(0.09, 0.1, 0.01 + left * 0.012, 16), 0x8a5a36, { at: [0.5, 0.012, 0.5] });
  for (let i = 0; i < 4 + left * 4; i++) {
    const a = i * GOLDEN;
    const r = 0.015 + ((i * 7) % 5) * 0.016;
    m.add(ball(0.012, 5), i % 2 ? 0xb5773f : 0x6b4128, {
      at: [0.5 + Math.cos(a) * r, 0.022 + left * 0.012, 0.5 + Math.sin(a) * r],
    });
  }
}

/** A sisal post on a carpet base, a perch on top, a toy dangling on a string. */
export function scratchPost(m: Model) {
  const carpet = 0x7a7260;
  m.add(box([0.6, 0.05, 0.6], 0.012), carpet, { at: [0.5, 0.025, 0.5] });
  m.add(cyl(0.07, 0.07, 0.8, 12), 0xc9a46a, { at: [0.5, 0.05, 0.5] });
  for (let i = 0; i < 18; i++) m.add(ring(0.071, 0.005, 3, 14), 0xa98252, { at: [0.5, 0.09 + i * 0.042, 0.5] });
  m.add(box([0.44, 0.05, 0.44], 0.012), carpet, { at: [0.5, 0.875, 0.5] });
  m.add(cyl(0.002, 0.002, 0.24), P.paperWhite, { at: [0.7, 0.62, 0.38] });
  m.add(box([0.12, 0.004, 0.02]), P.paperWhite, { at: [0.64, 0.86, 0.38] });
  m.add(ball(0.03, 8), P.rust, { at: [0.7, 0.6, 0.38] });
}

/** A little house (its walls the paint, olive unset): a pitched roof, walnut or rust tiles, a round
 *  door, a window on its side, a mat in front. */
export function petHouse(m: Model, o: Look) {
  // (the life look: painted wood, not the cloth its colours are elsewhere)
  m.paint();
  const c = o.fabric ?? P.olive;
  const roof = o.look === 1 ? P.rust : P.walnutDark;
  m.add(box([0.8, 0.46, 0.76], 0.01), c, { at: [0.5, 0.23, 0.48] });
  // the gable ends, then the two slopes
  for (const z of [0.12, 0.86])
    m.add(cyl(0.4, 0.4, 0.02, 3), c, { at: [0.5, 0.54, z], rot: [-Math.PI / 2, 0, 0], scale: [1.15, 1, 0.4] });
  const pitch = Math.atan2(0.24, 0.4);
  const len = Math.hypot(0.24, 0.4) + 0.06;
  for (const s of [-1, 1])
    m.add(box([len, 0.03, 0.86], 0.006), roof, {
      at: [0.5 + ((s * len) / 2) * Math.cos(pitch) - s * 0.01, 0.46 + 0.12 + 0.01, 0.48],
      rot: [0, 0, -s * pitch],
    });
  m.add(cyl(0.015, 0.015, 0.88, 6), shade(roof, 0.8), { at: [0.5, 0.715, 0.04], rot: [Math.PI / 2, 0, 0] });
  // the door, a window, the mat
  m.add(cyl(0.15, 0.15, 0.01, 18), 0x1a100a, { at: [0.5, 0.2, 0.86], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.3, 0.2, 0.01]), 0x1a100a, { at: [0.5, 0.1, 0.865] });
  m.add(cyl(0.065, 0.065, 0.006, 14), 0xf3e6c0, { at: [0.9, 0.28, 0.48], rot: [0, 0, Math.PI / 2] });
  m.add(box([0.36, 0.01, 0.1], 0.004), 0x8a5a36, { at: [0.5, 0.005, 0.93] });
}

/** The toy box (its paint, rust unset): a wooden chest with rope handles, its lid ajar, toys
 *  peeping out — a ball, a bone, a rope knot. */
export function toyBox(m: Model, o: Look) {
  const c = o.fabric ?? P.rust;
  m.add(box([0.7, 0.4, 0.5], 0.012), c, { at: [0.5, 0.2, 0.5] });
  for (const y of [0.06, 0.34]) m.add(box([0.72, 0.03, 0.52], 0.006), shade(c, 0.75), { at: [0.5, y, 0.5] });
  for (const x of [0.17, 0.83]) m.add(box([0.03, 0.4, 0.52], 0.006), shade(c, 0.75), { at: [x, 0.2, 0.5] });
  for (const x of [0.14, 0.86])
    m.add(ring(0.04, 0.007, 4, 10), P.linen, { at: [x, 0.3, 0.5], rot: [0, 0, Math.PI / 2] });
  // the lid, propped open a little at the back
  m.add(box([0.72, 0.035, 0.52], 0.008), shade(c, 1.1), { at: [0.5, 0.43, 0.48], rot: [-0.32, 0, 0] });
  // the toys
  m.add(ball(0.07, 10), P.mustard, { at: [0.36, 0.42, 0.56] });
  m.add(rod(0.016, 0.016, 0.16, "x", 6), P.paperWhite, { at: [0.6, 0.44, 0.58], rot: [0, 0.4, 0.3] });
  for (const dx of [-0.08, 0.08])
    m.add(ball(0.024, 6), P.paperWhite, { at: [0.6 + dx * Math.cos(0.4), 0.44 + dx * 0.3, 0.58 - dx * Math.sin(0.4)] });
  m.add(ring(0.045, 0.014, 5, 12), 0xc4402b, { at: [0.72, 0.42, 0.44], rot: [0.8, 0, 0] });
}

// ── parkour, out of doors ─────────────────────────────────────────────────────────────────────────
/** A grind rail `len` tiles long: its round bar 0.9 m up on posts a little under 3 m apart, rubber
 *  ends. */
export function pkRail(m: Model, len: number) {
  const top = 0.9;
  const n = Math.max(2, Math.ceil(len / 2.8) + 1);
  for (let i = 0; i < n; i++) {
    const u = 0.25 + ((len - 0.5) * i) / (n - 1);
    m.add(box([0.2, 0.04, 0.2], 0.006), 0x4f555c, { at: [u, 0.02, 0.5] });
    m.add(cyl(0.035, 0.035, top - 0.08), 0x7d8590, { at: [u, 0.04, 0.5] });
  }
  m.add(rod(0.04, 0.04, len - 0.12, "x", 12), 0xa9b1bb, { at: [len / 2, top - 0.04, 0.5] });
  for (const x of [0.04, len - 0.04])
    m.add(cyl(0.045, 0.045, 0.04, 12), 0x2b2b2e, { at: [x, top - 0.04, 0.5], rot: [0, 0, Math.PI / 2] });
}

/** A free-standing concrete wall 4 tiles wide, `h` m tall: a plinth, the formwork's seams a metre
 *  apart, a cap. */
export function pkWall(m: Model, h: number) {
  const cap = 0.1531;
  m.add(box([4.04, 0.15, 0.36], 0.01), 0x857f75, { at: [2, 0.075, 0.5] });
  m.add(box([4, h - cap - 0.15, 0.3], 0.006), 0xb8b2a6, { at: [2, 0.15 + (h - cap - 0.15) / 2, 0.5] });
  for (let y = 1; y < h - cap - 0.1; y += 1)
    for (const z of [0.349, 0.651]) m.add(box([4, 0.012, 0.002]), 0x8f897e, { at: [2, y, z] });
  for (let x = 1; x < 4; x += 1)
    for (const z of [0.349, 0.651])
      m.add(box([0.012, h - cap - 0.2, 0.002]), 0x9a948a, { at: [x, (h - cap + 0.15) / 2, z] });
  m.add(box([4.06, cap, 0.36], 0.01), 0x857f75, { at: [2, h - cap / 2, 0.5] });
}

/** A swing pole `h` m tall on its base plate, the foot banded yellow, a rubber cap. */
export function pkPole(m: Model, h: number) {
  m.add(box([0.4, 0.04, 0.4], 0.008), 0x4f555c, { at: [0.5, 0.02, 0.5] });
  for (let i = 0; i < 4; i++)
    m.add(cyl(0.012, 0.012, 0.012, 6), 0x2b2b2e, {
      at: [0.36 + (i % 2) * 0.28, 0.04, 0.36 + Math.floor(i / 2) * 0.28],
    });
  m.add(cyl(0.085, 0.085, 0.56, 14), 0xe0b02a, { at: [0.5, 0.04, 0.5] });
  for (let i = 0; i < 4; i++) m.add(cyl(0.086, 0.086, 0.06, 14), P.ink, { at: [0.5, 0.1 + i * 0.13, 0.5] });
  m.add(cyl(0.08, 0.08, h - 0.68, 14), 0xa9b1bb, { at: [0.5, 0.6, 0.5] });
  m.add(cyl(0.1, 0.1, 0.08, 14), 0x2b2b2e, { at: [0.5, h - 0.08, 0.5] });
}

// ── the rooms' floor clutter, and `decor` placed by hand (props.d) ────────────────────────────────
/** Cardboard boxes, one on another by the seed; a mesh bin with a paper ball; a coiled cable and
 *  its plug; a plant (its look by the seed). */
export const DECOR_THINGS: Record<string, (m: Model, seed: number) => void> = {
  boxes: (m, seed) => {
    m.add(box([0.6, 0.36, 0.55], 0.008), 0xb8935e, { at: [0.48, 0.18, 0.475] });
    m.add(box([0.6, 0.004, 0.08]), 0xd9c9a6, { at: [0.48, 0.362, 0.475] });
    m.add(box([0.3, 0.12, 0.004]), P.paperWhite, { at: [0.45, 0.2, 0.752] });
    if (seed > 0.35) {
      m.add(box([0.44, 0.26, 0.4], 0.008), 0xc49e68, { at: [0.48, 0.49, 0.47], rot: [0, 0.12, 0] });
      m.add(box([0.3, 0.008, 0.002]), 0x3b2a1c, { at: [0.46, 0.52, 0.672], rot: [0, 0.12, 0] });
    }
  },
  bin: (m) => {
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.15, 0],
          [0.19, 0.38],
          [0.18, 0.38],
          [0.14, 0.012],
          [0.001, 0.012],
        ],
        16,
      ),
      P.graphite,
      { at: [0.5, 0, 0.5] },
    );
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      m.add(box([0.006, 0.34, 0.004]), 0x6f6a5e, {
        at: [0.5 + Math.cos(a) * 0.172, 0.19, 0.5 + Math.sin(a) * 0.172],
        rot: [0, -a, Math.cos(a) * 0.1],
      });
    }
    m.add(ball(0.06, 6), P.paperWhite, { at: [0.52, 0.36, 0.5], scale: [1, 0.85, 1.1] });
  },
  cable: (m) => {
    for (let i = 0; i < 3; i++)
      m.add(ring(0.16 - i * 0.025, 0.007, 4, 20), 0xd9a441, {
        at: [0.5 + i * 0.01, 0.007 + i * 0.006, 0.5],
        scale: [1, 1, 0.55],
      });
    m.add(
      tube(
        [
          [0.65, 0.007, 0.5],
          [0.76, 0.007, 0.42],
          [0.82, 0.007, 0.3],
        ],
        0.007,
        4,
        6,
      ),
      0xd9a441,
    );
    m.add(box([0.05, 0.03, 0.05], 0.006), P.graphite, { at: [0.82, 0.015, 0.29] });
  },
  plant: (m, seed) => plant(m, { look: Math.floor(seed * 5) % 5, fabric: null, seed, occupied: false }),
};

// ── the fireplace (2×1, against a wall) — plan 68 ──────────────────────────────────────────────────
export const FIREPLACE_LOOKS = ["Brick fireplace", "Marble fireplace", "Modern fireplace"] as const;
/** A fireplace standing against its wall (its back on the wall's face, z 0.1): a chimney breast
 *  built round an open firebox — its sooty back and sides, logs on their grate, the embers glowing
 *  and live flames (liveparts.ts) — the mantel shelf at the spec's height (shared SURFACE.fireplace:
 *  things stand on it), a stone hearth before it. Red brick under an oak beam; white marble with
 *  fluted pilasters and a carved shelf; modern — plaster with a long slot of fire over pebbles. Lit
 *  when on (`on` unset: lit). */
export function fireplace(m: Model, o: Look, mantel: number) {
  const lit = o.on !== false;
  const B = 0.1; // (the wall's face)
  const [x0, x1] = [0.15, 1.85];
  const F = 0.48; // the breast's face
  const H = 2.0; // its height
  const soot = 0x1a1412;
  /** The breast round an opening (ox0..ox1 across, oy0..oy1 up): its blocks, the opening's sooty back
   *  and sides — open in front. */
  const breast = (c: number, ox0: number, ox1: number, oy0: number, oy1: number) => {
    const d = F - B;
    const z = (B + F) / 2;
    m.add(box([ox0 - x0, H, d]), c, { at: [(x0 + ox0) / 2, H / 2, z] });
    m.add(box([x1 - ox1, H, d]), c, { at: [(ox1 + x1) / 2, H / 2, z] });
    m.add(box([ox1 - ox0, H - oy1, d]), c, { at: [(ox0 + ox1) / 2, (oy1 + H) / 2, z] });
    if (oy0 > 0) m.add(box([ox1 - ox0, oy0, d]), c, { at: [(ox0 + ox1) / 2, oy0 / 2, z] });
    // the firebox: its back, its sides and its top, sooty
    m.add(box([ox1 - ox0, oy1 - oy0, 0.03]), soot, { at: [(ox0 + ox1) / 2, (oy0 + oy1) / 2, B + 0.015] });
    for (const x of [ox0 + 0.01, ox1 - 0.01])
      m.add(box([0.02, oy1 - oy0, d - 0.03], 0, 1), soot, { at: [x, (oy0 + oy1) / 2, z + 0.015], tone: 1.2 });
    m.add(box([ox1 - ox0, 0.02, d - 0.03]), soot, { at: [(ox0 + ox1) / 2, oy1 - 0.01, z + 0.015] });
  };
  /** The embers' bed glowing, the flames over it (live), across w at y, z a little in from the face. */
  const fire = (cx: number, w: number, y: number, n: number, z: number) => {
    m.add(box([w, 0.02, 0.16]), lit ? 0xff6a2a : 0x2a1a14, { at: [cx, y + 0.01, z], glow: lit });
    if (!lit) return;
    // (a flame: a teardrop, its belly low and its tip drawn up; the hot core a smaller one in front)
    const tongue = (r: number, h: number) =>
      lathe(
        [
          [0.001, 0],
          [r * 0.8, h * 0.08],
          [r, h * 0.25],
          [r * 0.75, h * 0.5],
          [r * 0.35, h * 0.78],
          [0.001, h],
        ],
        8,
      );
    for (let i = 0; i < n; i++) {
      const fx = cx - w / 2 + ((i + 0.5) * w) / n;
      const big = i % 2 === 0;
      const h = big ? 0.32 : 0.22;
      m.live(
        tongue(0.065, h),
        0xff8a2a,
        { kind: "flame", phase: i * 0.37 },
        {
          at: [fx, y + 0.02, z - 0.02 + (i % 2) * 0.03],
          glow: true,
        },
      );
      m.live(
        tongue(0.035, h * 0.6),
        0xffe08a,
        { kind: "flame", phase: i * 0.37 + 0.5 },
        {
          at: [fx, y + 0.02, z + 0.04 + (i % 2) * 0.03],
          glow: true,
        },
      );
    }
  };
  if (o.look === 2) {
    // modern: a plaster breast round a long low slot, pebbles in it, a thin oak shelf
    breast(0xe6e1d8, 0.4, 1.6, 0.4, 0.68);
    for (let i = 0; i < 14; i++)
      m.add(ball(0.02 + (i % 3) * 0.006, 5), [0x8a8580, 0x6d6964, 0xb0aba3][i % 3], {
        at: [0.46 + i * 0.08, 0.42, 0.3 + (i % 2) * 0.06],
        scale: [1, 0.6, 1],
      });
    fire(1, 1.0, 0.42, 7, 0.32);
    m.add(box([x1 - x0 + 0.1, 0.04, 0.26], 0.006), P.oak, { at: [1, mantel - 0.02, F + 0.08] });
    m.add(box([x1 - x0 + 0.1, 0.06, 0.4]), 0x3a3836, { at: [1, 0.03, F + 0.2] });
    return;
  }
  const marble = o.look === 1;
  const face = marble ? 0xeceae4 : 0x9a4a32;
  const [ox0, ox1, oy] = [0.6, 1.4, 0.82];
  breast(face, ox0, ox1, 0, oy);
  if (marble) {
    // the surround: fluted pilasters, a frieze, the carved shelf
    for (const x of [ox0 - 0.1, ox1 + 0.1]) {
      m.add(box([0.16, mantel - 0.08, 0.05], 0.006), 0xf8f6f0, { at: [x, (mantel - 0.08) / 2, F + 0.025] });
      for (let k = -1; k <= 1; k++)
        m.add(box([0.012, mantel - 0.22, 0.006]), 0xd6d2c8, { at: [x + k * 0.04, (mantel - 0.08) / 2, F + 0.052] });
    }
    m.add(box([ox1 - ox0 + 0.36, mantel - 0.08 - oy, 0.04], 0.004), 0xf4f2ec, {
      at: [1, (oy + mantel - 0.08) / 2, F + 0.02],
    });
    m.add(box([x1 - x0 + 0.14, 0.06, 0.3], 0.01, 2), 0xf8f6f0, { at: [1, mantel - 0.03, F + 0.1] });
    m.add(box([x1 - x0 + 0.06, 0.04, 0.24], 0.006), 0xe0ddd5, { at: [1, mantel - 0.08, F + 0.08] });
  } else {
    // the brick: courses with their joints staggered, a lighter brick here and there
    const course = 0.075;
    for (let r = 0; r * course < H; r++) {
      const y = r * course;
      // (the bed joint: broken where the fire's opening is)
      if (y < oy)
        for (const [a, b] of [
          [x0, ox0],
          [ox1, x1],
        ])
          m.add(box([b - a, 0.008, 0.004]), 0xc9b9a8, { at: [(a + b) / 2, y + 0.004, F + 0.002] });
      else m.add(box([x1 - x0, 0.008, 0.004]), 0xc9b9a8, { at: [1, y + 0.004, F + 0.002] });
      for (let x = x0 + (r % 2 ? 0.11 : 0.22); x < x1 - 0.02; x += 0.22) {
        if (x > ox0 - 0.005 && x < ox1 + 0.005 && y < oy) continue;
        m.add(box([0.008, course - 0.008, 0.004]), 0xc9b9a8, { at: [x, y + course / 2 + 0.004, F + 0.002] });
      }
    }
    for (let i = 0; i < 26; i++) {
      const r = Math.floor(rnd(i, 1, o.seed) * 26);
      const x = x0 + 0.11 + Math.floor(rnd(i, 2, o.seed) * 7) * 0.22 + (r % 2 ? 0 : 0.11);
      if ((x > ox0 - 0.12 && x < ox1 + 0.12 && r * course < oy) || x > x1 - 0.1) continue;
      m.add(box([0.2, course - 0.012, 0.004]), shade(face, 0.82 + rnd(i, 3, o.seed) * 0.36), {
        at: [x, r * course + course / 2 + 0.004, F + 0.003],
      });
    }
    // the oak beam for a mantel
    m.add(box([x1 - x0 + 0.1, 0.14, 0.28], 0.012, 2), P.walnut, { at: [1, mantel - 0.07, F + 0.08] });
  }
  // the grate and its logs, the fire
  for (const x of [0.78, 1.22]) m.add(box([0.03, 0.1, 0.24]), P.ink, { at: [x, 0.05, 0.3] });
  m.add(rod(0.06, 0.055, 0.5, "x", 8), 0x5a3a24, { at: [1, 0.15, 0.24], rot: [0, 0.12, 0] });
  m.add(rod(0.05, 0.05, 0.44, "x", 8), 0x6b4a30, { at: [0.98, 0.14, 0.36], rot: [0, -0.2, 0] });
  m.add(rod(0.045, 0.04, 0.38, "x", 8), 0x5a3a24, { at: [1.02, 0.24, 0.3], rot: [0, 0.4, 0.1] });
  fire(1, 0.5, 0.18, 5, 0.3);
  // the hearth: a stone slab before it
  m.add(box([x1 - x0 + 0.1, 0.06, 0.42], 0.008), marble ? 0xd8d4cc : 0x5e5a55, { at: [1, 0.03, F + 0.21] });
  // (story) a basket of logs by its side, or a poker leant on it
  if (o.seed > 0.5)
    for (let i = 0; i < 4; i++)
      m.add(rod(0.04, 0.04, 0.32, "z", 7), 0x6b4a30, {
        at: [1.89, 0.1 + Math.floor(i / 2) * 0.075, F + 0.14 + (i % 2) * 0.085],
      });
  else m.add(cyl(0.008, 0.008, 0.62), P.ink, { at: [0.1, 0.06, F + 0.24], rot: [0, 0, 0.1] });
}
