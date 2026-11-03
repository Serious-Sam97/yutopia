import { type BufferGeometry, CylinderGeometry } from "three";
import {
  ball,
  box,
  cushion,
  cyl,
  extrude,
  type Look,
  lathe,
  leaf,
  type Model,
  merged,
  ring,
  rod,
  tube,
  type V3,
} from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 14 (docs/plan/68-more-furniture.md): Decor — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/decor2.ts. A big aquarium (fish swimming round,
// bubbles rising, its light), a wood stove (flames behind its door), an indoor fig and olive, a
// fountain (its jet playing, water falling and rippling), a sculpture on its plinth, vases on the
// floor and on tables, a terrarium, a trophy, a stack of books, a plant hung from the ceiling and a
// moss wall. Plants as decor.ts grows them: real leaves, folded and bent, never cards.

export const LOOKS: Record<string, readonly string[]> = {
  big_aquarium: ["Planted, walnut cabinet", "Reef, black cabinet", "River stones, white cabinet"],
  wood_stove: ["Cast iron", "Red enamel", "Round Scandi"],
  indoor_tree: ["Fiddle-leaf fig", "Olive tree"],
  fountain: ["Tiered stone", "Slate water wall"],
  sculpture: ["Marble bust", "Bronze loop", "Balanced stones"],
  floor_vase: ["Pampas in an urn", "Branches in a tall vase", "Pair of floor vases"],
  vase: ["Tulips in a jug", "Celadon vase", "Bud vases"],
  terrarium: ["Glass globe", "Geometric", "Bell jar"],
  trophy: ["Gold cup", "Silver star", "Crystal award"],
  book_stack: ["Hardbacks", "Paperbacks", "Coffee-table books"],
  hanging_plant: ["Pothos in macramé", "Fern in a basket", "String of pearls"],
  moss_wall: ["Moss panel", "Moss and ferns", "Round moss"],
};

const FACE = 0.1; // a wall's face
const CEILING = 3.27;
const GOLDEN = 2.39996;
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A leaf from `at` out toward angle `a` (round y, 0 along +x), pitched `pitch` (< 0 up, > 0 down). */
function leafAt(m: Model, g: BufferGeometry, c: number, at: V3, a: number, pitch: number, tone = 1) {
  m.add(g, c, { at, rot: [pitch, Math.PI / 2 - a, 0], tone });
}

/** A pot turned from its profile, soil in it (decor.ts's): returns the soil's height. */
function pot(m: Model, color: number, cx: number, cz: number, r0: number, r1: number, h: number, y = 0): number {
  m.add(
    lathe(
      [
        [0.001, 0],
        [r0, 0],
        [r1, h],
        [r1 + 0.015, h],
        [r1 + 0.015, h + 0.025],
        [r1 - 0.012, h + 0.025],
        [r1 - 0.016, h - 0.03],
      ],
      18,
    ),
    color,
    { at: [cx, y, cz] },
  );
  const top = y + h - 0.01;
  m.add(cyl(r1 - 0.014, r1 - 0.014, 0.01, 16), P.soil, { at: [cx, top - 0.01, cz] });
  return top;
}

/** String-of-chase: `n` sets of points, set k lit for 1/n of `period` s after set k−1 (a marquee's
 *  chase): bubbles rising, drops falling, ripples spreading. `at` each set's points (round 0). */
function chase(
  m: Model,
  sets: BufferGeometry[][],
  c: number,
  period: number,
  origin: V3,
  o: { glow?: boolean; on?: number } = {},
) {
  const n = sets.length;
  sets.forEach((s, k) => {
    if (!s.length) return;
    m.live(
      merged(s),
      c,
      { kind: "blink", period, on: o.on ?? 1.6 / n, phase: (1 - k / n) % 1 },
      { at: origin, glow: !!o.glow },
    );
  });
}

// ── the big aquarium (2×1) ─────────────────────────────────────────────────────────────────────────
interface Fishy {
  len: number;
  body: number;
  fin: number;
  /** stripes across it (a clownfish's), in the fin's colour */
  stripes?: number;
}
/** A fish facing −z round its middle: its body (one colour) and its fins (the other), as geometry. */
function fishParts(f: Fishy): { body: BufferGeometry[]; fin: BufferGeometry[] } {
  const L = f.len;
  const body = [ball(L / 2, 8).scale(0.36, 0.58, 1)];
  const fin: BufferGeometry[] = [];
  // the tail: a forked fin behind (+z), thin across x
  fin.push(
    extrude(
      [
        [0, 0],
        [-0.42 * L, 0.26 * L],
        [-0.3 * L, 0],
        [-0.42 * L, -0.26 * L],
      ],
      0.004,
    )
      .rotateY(Math.PI / 2)
      .translate(0, 0, 0.4 * L),
  );
  // the dorsal fin, an eye each side
  fin.push(
    extrude(
      [
        [0.15 * L, 0],
        [-0.12 * L, 0.16 * L],
        [-0.22 * L, 0],
      ],
      0.003,
    )
      .rotateY(Math.PI / 2)
      .translate(0, 0.26 * L, 0),
  );
  for (const s of [-1, 1]) body.push(ball(0.06 * L, 4).translate(s * 0.17 * L, 0.06 * L, -0.3 * L));
  for (let i = 0; i < (f.stripes ?? 0); i++) {
    const z = -0.18 * L + i * 0.24 * L;
    fin.push(
      ball(L / 2, 8)
        .scale(0.37, 0.59, 0.08)
        .translate(0, 0, z),
    );
  }
  return { body, fin };
}

/** A school going round (cx, y, cz): fish at radius r, spread round, swimming the way `speed` turns. */
function school(m: Model, at: V3, r: number, speed: number, n: number, f: Fishy, phase: number, bob = 0.03) {
  const bodies: BufferGeometry[] = [];
  const fins: BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + phase;
    const rr = r * (0.8 + 0.4 * rnd(i, 1, phase));
    const dy = (rnd(i, 2, phase) - 0.5) * 0.08;
    const p = fishParts(f);
    // (built at (rr, dy, 0) facing −z, the way a positive turn carries it; a negative one the other)
    const place = (g: BufferGeometry) =>
      g
        .rotateY(speed < 0 ? Math.PI : 0)
        .translate(rr, dy, 0)
        .rotateY(a);
    bodies.push(...p.body.map(place));
    fins.push(...p.fin.map(place));
  }
  const anim = { kind: "swirl" as const, speed, bob, period: 5 + phase * 3, phase };
  m.live(merged(bodies), f.body, anim, { at });
  m.live(merged(fins), f.fin, anim, { at });
}

function bigAquarium(m: Model, o: Look) {
  const on = o.on !== false;
  const look = o.look;
  const cab = [P.walnut, 0x1d1d20, 0xe9e6df][look] ?? P.walnut;
  const trim = [P.walnutDark, 0x101012, 0xcfcac0][look] ?? P.walnutDark;
  // the cabinet: a plinth, two doors, a top
  m.add(box([1.8, 0.04, 0.56]), shade(cab, 0.6), { at: [1, 0.02, 0.5] });
  m.add(box([1.84, 0.7, 0.6], 0.01), cab, { at: [1, 0.39, 0.5] });
  for (const x of [0.55, 1.45]) {
    m.add(box([0.86, 0.6, 0.012], 0.004), shade(cab, 1.08), { at: [x, 0.39, 0.806] });
    m.add(box([0.012, 0.16, 0.02], 0.004), look === 2 ? P.oak : P.brass, {
      at: [x + (x < 1 ? 0.38 : -0.38), 0.44, 0.82],
    });
  }
  m.add(box([1.88, 0.03, 0.62], 0.006), trim, { at: [1, 0.765, 0.5] });
  // the tank: a black rim at its foot and lip, its corners siliconed
  const [x0, x1, z0, z1, y0, y1] = [0.11, 1.89, 0.25, 0.75, 0.78, 1.36];
  m.add(box([x1 - x0 + 0.02, 0.03, z1 - z0 + 0.02]), 0x141416, { at: [1, y0 + 0.015, 0.5] });
  m.add(box([x1 - x0 + 0.02, 0.02, z1 - z0 + 0.02]), 0x141416, { at: [1, y1 - 0.01, 0.5] });
  for (const x of [x0, x1])
    for (const z of [z0, z1]) m.add(box([0.014, y1 - y0, 0.014]), 0x202224, { at: [x, (y0 + y1) / 2, z] });
  // the hood, its feeding hatch, the light under its front
  m.add(box([1.82, 0.07, 0.54], 0.012), trim, { at: [1, y1 + 0.035, 0.5] });
  m.add(box([0.4, 0.004, 0.18]), shade(trim, 1.3), { at: [1.45, y1 + 0.072, 0.42] });
  m.add(box([1.7, 0.014, 0.02]), on ? 0xeaf6ff : 0x3a3d40, { at: [1, y1 - 0.024, z1 - 0.03], glow: on });
  // the backdrop: frosted and backlit while it's on
  m.add(box([x1 - x0 - 0.02, y1 - y0 - 0.04, 0.006]), on ? [0x2f6f7a, 0x1f4f8a, 0x4a7f86][look] : 0x101418, {
    at: [1, (y0 + y1) / 2, z0 + 0.008],
    glow: on,
  });
  // the bed
  const bed = y0 + 0.03;
  const sand = [0x6b5a44, 0xe8dcc0, 0xb9b2a4][look] ?? 0x6b5a44;
  m.add(box([x1 - x0 - 0.02, 0.05, z1 - z0 - 0.02]), sand, { at: [1, bed + 0.025, 0.5] });
  const top = bed + 0.05;
  for (let i = 0; i < 40; i++) {
    const x = x0 + 0.05 + rnd(i, 1, 0.4) * (x1 - x0 - 0.1);
    const z = z0 + 0.05 + rnd(i, 2, 0.4) * (z1 - z0 - 0.1);
    m.add(ball(look === 2 ? 0.025 : 0.012, 5), shade(sand, 0.75 + rnd(i, 3, 0.4) * 0.5), {
      at: [x, top - 0.004, z],
      scale: [1, 0.55, 1],
    });
  }
  if (look === 1) {
    // a reef: live rock, branching corals, a brain coral, an anemone
    for (const [x, z, r, c] of [
      [0.45, 0.4, 0.13, 0x6e5a72],
      [0.7, 0.36, 0.1, 0x7a6a6a],
      [1.35, 0.38, 0.14, 0x6a5e70],
      [1.6, 0.42, 0.09, 0x80706a],
    ] as const)
      m.add(ball(r, 7), c, { at: [x, top + r * 0.4, z], scale: [1.4, 0.9, 1] });
    const branch = (x: number, z: number, c: number, h: number) => {
      for (let i = 0; i < 6; i++) {
        const a = i * GOLDEN;
        const tip: V3 = [x + Math.cos(a) * 0.06, top + h * (0.6 + rnd(i, 1, x) * 0.4), z + Math.sin(a) * 0.04];
        m.add(
          tube(
            [[x, top + 0.08, z], [x + Math.cos(a) * 0.025, top + h * 0.45, z + Math.sin(a) * 0.02], tip],
            0.008,
            5,
            5,
          ),
          c,
        );
        m.add(ball(0.011, 5), shade(c, 1.2), { at: tip });
      }
    };
    branch(0.48, 0.42, 0xe86a8a, 0.26);
    branch(1.38, 0.4, 0xf0a040, 0.3);
    branch(0.98, 0.34, 0xb86ad0, 0.2);
    m.add(ball(0.06, 8), 0x9ab85a, { at: [1.15, top + 0.03, 0.6], scale: [1.2, 0.7, 1] });
    for (let i = 0; i < 6; i++)
      m.add(ring(0.01 + i * 0.008, 0.003, 3, 10), 0x6a8a3a, { at: [1.15, top + 0.065, 0.6], scale: [1.2, 1, 1] });
    for (let i = 0; i < 14; i++) {
      const a = i * GOLDEN;
      m.add(cyl(0.006, 0.004, 0.07, 4), 0xff9ab0, {
        at: [0.72 + Math.cos(a) * 0.03, top + 0.04, 0.6 + Math.sin(a) * 0.03],
        rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5],
      });
    }
    m.add(cyl(0.04, 0.035, 0.04, 10), 0xd06a8a, { at: [0.72, top, 0.6] });
  } else {
    // a rock or two, driftwood (planted), and the plants
    for (const [x, z, r] of [
      [0.62, 0.42, 0.1],
      [1.48, 0.4, 0.08],
    ] as const)
      m.add(ball(r, 6), look === 2 ? 0x8a8a84 : 0x6a6660, { at: [x, top + r * 0.3, z], scale: [1.3, 0.8, 1] });
    if (look === 0) {
      // driftwood: a forked root leaning up out of the bed
      const wood = 0x5a4030;
      m.add(
        tube(
          [
            [0.8, top + 0.01, 0.55],
            [0.95, top + 0.06, 0.5],
            [1.1, top + 0.16, 0.44],
            [1.22, top + 0.32, 0.4],
          ],
          0.02,
          6,
          10,
        ),
        wood,
      );
      m.add(
        tube(
          [
            [0.95, top + 0.06, 0.5],
            [1.05, top + 0.05, 0.6],
            [1.2, top + 0.09, 0.64],
          ],
          0.012,
          5,
          6,
        ),
        shade(wood, 1.1),
      );
      m.add(
        tube(
          [
            [1.1, top + 0.16, 0.44],
            [1.2, top + 0.2, 0.52],
            [1.34, top + 0.22, 0.55],
          ],
          0.01,
          5,
          6,
        ),
        shade(wood, 0.9),
      );
      m.add(
        tube(
          [
            [1.0, top + 0.1, 0.47],
            [0.98, top + 0.24, 0.42],
            [1.02, top + 0.36, 0.38],
          ],
          0.009,
          5,
          6,
        ),
        wood,
      );
      // a carpet of tiny plants across the front of the bed
      for (let i = 0; i < 22; i++)
        m.add(ball(0.035, 5), i % 3 ? 0x5a9a3a : 0x6aaa45, {
          at: [x0 + 0.1 + rnd(i, 6, 0.2) * (x1 - x0 - 0.2), top, z1 - 0.08 - rnd(i, 7, 0.2) * 0.08],
          scale: [1.3, 0.45, 1],
        });
    }
    // tall grass at the back
    const nGrass = look === 0 ? 34 : 14;
    for (let i = 0; i < nGrass; i++) {
      const x = x0 + 0.06 + rnd(i, 1, 0.7) * (x1 - x0 - 0.12);
      if (look === 2 && x > 0.7 && x < 1.3) continue;
      const len = 0.24 + rnd(i, 2, 0.7) * 0.22;
      leafAt(
        m,
        leaf(len, 0.03, 0.1, 0.02, 4),
        i % 2 ? 0x4f8a3a : 0x3f7a35,
        [x, top, z0 + 0.04 + rnd(i, 3, 0.7) * 0.08],
        rnd(i, 4, 0.7) * 6,
        -Math.PI / 2 + 0.08 + rnd(i, 5, 0.7) * 0.15,
      );
    }
    // bushy stems (rotala) in front, mid height: a stem, little leaves up it
    if (look === 0)
      // bushy stem plants, red tipped: puffs of little leaves up a few stems
      for (const [x, z] of [
        [0.3, 0.58],
        [1.7, 0.6],
        [1.25, 0.55],
      ])
        for (let s = 0; s < 4; s++) {
          const sx = x + (s - 1.5) * 0.035;
          const sz = z + (s % 2) * 0.03;
          const h = 0.12 + s * 0.03;
          m.add(cyl(0.004, 0.004, h, 4), 0x5a8a3a, { at: [sx, top, sz] });
          m.add(ball(0.04, 6), 0x5a9a3a, { at: [sx, top + h * 0.55, sz], scale: [1, 1.3, 1] });
          m.add(ball(0.032, 6), 0xc0603a, { at: [sx, top + h, sz], scale: [1, 1.2, 1] });
          for (let k = 0; k < 4; k++)
            leafAt(
              m,
              leaf(0.035, 0.016, 0.1, 0.1, 3),
              k % 2 ? 0xd07040 : 0x6aa040,
              [sx, top + h * (0.5 + k * 0.15), sz],
              k * GOLDEN + s,
              -0.2,
            );
        }
    // java ferns on the stones
    else
      for (const [x, z] of [
        [0.62, 0.42],
        [1.48, 0.4],
      ])
        for (let i = 0; i < 7; i++)
          leafAt(
            m,
            leaf(0.12, 0.03, 0.2, 0.2, 4),
            0x3f6b3a,
            [x, top + 0.09, z],
            i * GOLDEN,
            -0.7,
            0.9 + rnd(i, 1, x) * 0.2,
          );
  }
  // (story) a diver or a little castle, else a tub of food on the hood
  if (o.seed > 0.6) {
    m.add(box([0.08, 0.08, 0.06]), look === 1 ? 0xb8b2a8 : 0x9a948a, { at: [1.72, top + 0.04, 0.6] });
    for (const dx of [-0.03, 0.03]) m.add(cyl(0.015, 0.015, 0.06, 6), 0x9a948a, { at: [1.72 + dx, top + 0.06, 0.6] });
    m.add(box([0.02, 0.03, 0.004]), 0x1a1a1a, { at: [1.72, top + 0.02, 0.632] });
  } else if (o.seed < 0.35) {
    m.add(cyl(0.035, 0.035, 0.05, 12), 0xe8c25a, { at: [0.4, y1 + 0.07, 0.4] });
    m.add(cyl(0.037, 0.037, 0.012, 12), 0xc4402b, { at: [0.4, y1 + 0.12, 0.4] });
  }
  // the fish: schools going round, each fish its body and its fins
  const fishes: Fishy[][] = [
    [
      { len: 0.045, body: 0x3a8ae0, fin: 0xe04a3a }, // neon tetras
      { len: 0.07, body: 0xe8c860, fin: 0xb88a30 },
      { len: 0.09, body: 0x9aa0b8, fin: 0x6a7090 }, // a gourami
    ],
    [
      { len: 0.07, body: 0xf07a20, fin: 0xf4f2ee, stripes: 3 }, // clownfish
      { len: 0.1, body: 0x2a5ad0, fin: 0xf0d040 }, // a blue tang
      { len: 0.08, body: 0xf0d830, fin: 0xe0c020 }, // a yellow tang
    ],
    [
      { len: 0.09, body: 0xf08030, fin: 0xf4e0c0 }, // goldfish
      { len: 0.06, body: 0xd0d0c8, fin: 0x8a8a84 },
      { len: 0.1, body: 0xe85a20, fin: 0xf0f0e8 },
    ],
  ];
  const [a, b, c] = fishes[look] ?? fishes[0];
  school(m, [0.55, 1.12, 0.5], 0.12, 0.7, look === 0 ? 7 : 2, a, 0.1);
  school(m, [1.35, 1.0, 0.5], 0.14, -0.45, look === 1 ? 2 : 3, b, 0.45);
  school(m, [1.0, 1.2, 0.5], 0.13, 0.32, look === 0 ? 1 : 2, c, 0.8, 0.05);
  // bubbles rising from the air stone in the back corner (a chase, set by set up the water)
  m.add(cyl(0.02, 0.02, 0.015, 8), 0x3a3d40, { at: [1.78, top, z0 + 0.05] });
  const sets: BufferGeometry[][] = Array.from({ length: 8 }, () => []);
  for (let i = 0; i * 0.025 < y1 - top - 0.07; i++) {
    const y = 0.03 + i * 0.025;
    sets[i % 8].push(
      ball(0.006 + (i % 3) * 0.002, 5).translate(Math.sin(i * 1.7) * 0.01, y, Math.cos(i * 1.3) * 0.008),
    );
  }
  chase(m, sets, 0xe8f6ff, 1.1, [1.78, top, z0 + 0.05], { on: 0.3, glow: on });
  // the water: a tinted block of it, see-through
  m.live(
    box([x1 - x0 - 0.012, y1 - y0 - 0.06, z1 - z0 - 0.012]),
    [0x9fd8c8, 0x8fd0f0, 0xb8e0e8][look] ?? 0x9fd8c8,
    { kind: "still" },
    { at: [1, (y0 + y1 - 0.04) / 2, 0.5], glass: true },
  );
}

// ── the wood stove (1×1) ───────────────────────────────────────────────────────────────────────────
/** A flat front from x0..x1, y0..y1, z0..z1 with an opening (ox0..ox1, oy0..oy1) through it: four
 *  slabs round it. */
function framed(
  m: Model,
  c: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  o: [number, number, number, number],
) {
  const [ox0, ox1, oy0, oy1] = o;
  const z = (z0 + z1) / 2;
  const d = z1 - z0;
  m.add(box([ox0 - x0, y1 - y0, d]), c, { at: [(x0 + ox0) / 2, (y0 + y1) / 2, z] });
  m.add(box([x1 - ox1, y1 - y0, d]), c, { at: [(ox1 + x1) / 2, (y0 + y1) / 2, z] });
  m.add(box([ox1 - ox0, y1 - oy1, d]), c, { at: [(ox0 + ox1) / 2, (oy1 + y1) / 2, z] });
  m.add(box([ox1 - ox0, oy0 - y0, d]), c, { at: [(ox0 + ox1) / 2, (y0 + oy0) / 2, z] });
}

/** A stove on its hearth pad: a firebox behind a glass door — its logs, the embers and live flames
 *  (lit unless switched off) — the flue from its top up through the ceiling. Cast iron (ribbed, on
 *  turned legs), red enamel, or a round Scandi drum on a pedestal. */
function woodStove(m: Model, o: Look) {
  const lit = o.on !== false;
  const look = o.look;
  const body = [0x2a2a2c, 0xb3262b, 0x3a3c3e][look] ?? 0x2a2a2c;
  const metal = 0x1a1a1b;
  const soot = 0x14100e;
  const cx = 0.5;
  // the hearth pad
  m.add(box([0.9, 0.02, 0.9], 0.004), [0x3a3836, 0x4a4542, 0x8a8580][look] ?? 0x3a3836, { at: [0.5, 0.01, 0.5] });
  const [bw, bh, by] = [0.5, 0.48, 0.17];
  // (its front's face, the firebox's depth behind it, the door's opening)
  const front = 0.7;
  const deep = 0.16;
  const [dw, dh] = look === 2 ? [0.26, 0.24] : [0.34, 0.27];
  const dy = by + 0.08;
  const opening: [number, number, number, number] = [cx - dw / 2, cx + dw / 2, dy, dy + dh];
  let cz: number;
  if (look === 2) {
    // round: an open drum (its front cut away for the firebox) on a pedestal foot, a flat front
    cz = 0.46;
    const R = 0.25;
    const cut = 0.8;
    m.add(cyl(0.12, 0.14, by - 0.02, 16), metal, { at: [cx, 0.02, cz] });
    m.add(new CylinderGeometry(R, R, bh, 22, 1, true, cut, Math.PI * 2 - 2 * cut), body, { at: [cx, by + bh / 2, cz] });
    m.add(cyl(R + 0.01, R + 0.01, 0.03, 22), metal, { at: [cx, by + bh, cz] });
    m.add(cyl(R + 0.01, R + 0.01, 0.02, 22), metal, { at: [cx, by - 0.01, cz] });
    const fx = R * Math.sin(cut);
    framed(m, body, cx - fx, cx + fx, by, by + bh, front - 0.03, front, opening);
    // its cheeks, from the drum's cut edge to the flat front
    for (const s of [-1, 1])
      m.add(box([0.012, bh, front - 0.03 - (cz + R * Math.cos(cut)) + 0.01]), body, {
        at: [cx + s * (fx - 0.006), by + bh / 2, (front - 0.03 + cz + R * Math.cos(cut)) / 2],
      });
    m.add(box([2 * fx, bh, 0.02]), soot, { at: [cx, by + bh / 2, front - deep] });
  } else {
    cz = 0.46;
    const back = 0.24;
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        m.add(
          lathe(
            [
              [0.001, 0],
              [0.03, 0],
              [0.022, 0.05],
              [0.03, by - 0.04],
              [0.001, by - 0.02],
            ],
            8,
          ),
          metal,
          { at: [cx + x * (bw / 2 - 0.04), 0.02, (back + front) / 2 + z * ((front - back) / 2 - 0.04)] },
        );
    // the body behind its firebox, the front round the opening, the box's sooty back and sides
    m.add(box([bw, bh, front - deep - back], 0.01, 2), body, { at: [cx, by + bh / 2, (back + front - deep) / 2] });
    framed(m, body, cx - bw / 2, cx + bw / 2, by, by + bh, front - deep, front, opening);
    m.add(box([dw, dh, 0.01]), soot, { at: [cx, dy + dh / 2, front - deep + 0.005] });
    for (const x of [opening[0] + 0.005, opening[1] - 0.005])
      m.add(box([0.01, dh, deep - 0.01]), soot, { at: [x, dy + dh / 2, front - deep / 2] });
    m.add(box([bw + 0.04, 0.03, front - back + 0.04], 0.006), metal, { at: [cx, by + bh + 0.015, (back + front) / 2] });
    m.add(box([bw + 0.02, 0.025, front - back + 0.02], 0.004), metal, { at: [cx, by + 0.01, (back + front) / 2] });
    // cast ribs down its sides
    if (look === 0)
      for (const s of [-1, 1])
        for (let i = 0; i < 4; i++)
          m.add(box([0.012, bh - 0.08, 0.02]), shade(body, 1.25), {
            at: [cx + s * (bw / 2 + 0.004), by + bh / 2, back + 0.08 + i * 0.1],
          });
  }
  // the door's frame on the front, a handle, the air wash knob over it
  framed(
    m,
    look === 1 ? 0x1c1c1e : shade(body, 0.7),
    cx - dw / 2 - 0.03,
    cx + dw / 2 + 0.03,
    dy - 0.03,
    dy + dh + 0.03,
    front,
    front + 0.02,
    opening,
  );
  m.add(rod(0.008, 0.008, 0.05, "z", 6), look === 1 ? P.cream : P.chrome, {
    at: [cx + dw / 2 + 0.012, dy + dh / 2, front + 0.045],
  });
  m.add(box([0.016, 0.03, 0.03]), metal, { at: [cx + dw / 2 + 0.012, dy + dh / 2, front + 0.025] });
  m.add(cyl(0.012, 0.012, 0.02, 8), metal, { at: [cx, dy + dh + 0.06, front], rot: [Math.PI / 2, 0, 0] });
  // the logs and embers inside, the flames (live)
  const iz = front - deep / 2;
  m.add(box([dw - 0.02, 0.012, deep - 0.02]), soot, { at: [cx, dy + 0.006, iz] });
  m.add(rod(0.03, 0.028, dw - 0.06, "x", 7), 0x5a3a24, { at: [cx, dy + 0.04, iz - 0.02], rot: [0, 0.2, 0] });
  m.add(rod(0.026, 0.026, dw - 0.1, "x", 7), 0x6b4a30, { at: [cx + 0.02, dy + 0.08, iz + 0.01], rot: [0, -0.3, 0.12] });
  m.add(box([dw - 0.06, 0.016, deep - 0.06]), lit ? 0xff6a2a : 0x2a1a14, { at: [cx, dy + 0.02, iz], glow: lit });
  if (lit) {
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
    const n = look === 2 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const fx = cx - (dw - 0.1) / 2 + (i * (dw - 0.1)) / (n - 1);
      const h = i % 2 ? 0.13 : 0.18;
      m.live(
        tongue(0.035, h),
        0xff8a2a,
        { kind: "flame", phase: i * 0.41 },
        { at: [fx, dy + 0.04, iz - 0.02], glow: true },
      );
      m.live(
        tongue(0.02, h * 0.6),
        0xffe08a,
        { kind: "flame", phase: i * 0.41 + 0.5 },
        { at: [fx, dy + 0.04, iz + 0.03], glow: true },
      );
    }
  }
  // smoked glass in the door
  m.live(box([dw, dh, 0.006]), 0x6a5a50, { kind: "still" }, { at: [cx, dy + dh / 2, front + 0.01], glass: true });
  // the flue: from the top's back, up through the ceiling, its collars, a damper, a ceiling plate
  const top = by + bh + 0.03;
  const flz = look === 2 ? cz : 0.36;
  m.add(cyl(0.085, 0.085, 0.05, 14), metal, { at: [cx, top, flz] });
  m.add(cyl(0.075, 0.075, CEILING - top - 0.06, 14), 0x1f1f21, { at: [cx, top + 0.05, flz] });
  for (const y of [top + 0.5, top + 1.4]) m.add(cyl(0.079, 0.079, 0.02, 14), 0x2a2a2c, { at: [cx, y, flz] });
  m.add(rod(0.006, 0.006, 0.2, "x", 5), P.chrome, { at: [cx, top + 0.6, flz] });
  m.add(cyl(0.14, 0.14, 0.012, 16), 0x2a2a2c, { at: [cx, CEILING - 0.012, flz] });
  // (story) a kettle on the top's front, else a log basket by its side
  if (o.seed > 0.5) {
    const kz = look === 2 ? cz + 0.14 : 0.58;
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.07, 0],
          [0.08, 0.04],
          [0.07, 0.09],
          [0.03, 0.11],
          [0.02, 0.13],
          [0.001, 0.13],
        ],
        14,
      ),
      look === 1 ? P.cream : 0x9a9d9f,
      { at: [cx + 0.02, top, kz] },
    );
    m.add(
      tube(
        [
          [cx - 0.04, top + 0.1, kz],
          [cx + 0.02, top + 0.19, kz],
          [cx + 0.08, top + 0.1, kz],
        ],
        0.006,
        4,
        8,
      ),
      P.ink,
    );
    m.add(rod(0.012, 0.006, 0.08, "x", 6), look === 1 ? P.cream : 0x9a9d9f, {
      at: [cx + 0.11, top + 0.07, kz],
      rot: [0, 0, 0.6],
    });
  } else {
    m.add(box([0.16, 0.14, 0.24], 0.01), 0x8a6a3a, { at: [0.85, 0.09, 0.78] });
    for (let i = 0; i < 4; i++)
      m.add(rod(0.028, 0.028, 0.28, "z", 6), 0x6b4a30, {
        at: [0.82 + (i % 2) * 0.06, 0.18 + Math.floor(i / 2) * 0.05, 0.78],
      });
  }
}

// ── the indoor tree (2×2) ──────────────────────────────────────────────────────────────────────────
function indoorTree(m: Model, o: Look) {
  const s = o.seed;
  const [cx, cz] = [1, 1];
  /** A point along a curve through three points (a branch), t 0..1. */
  const along = (p: V3[], t: number): V3 => {
    const u = 1 - t;
    return [0, 1, 2].map((i) => u * u * p[0][i] + 2 * u * t * p[1][i] + t * t * p[2][i]) as V3;
  };
  if (o.look === 1) {
    // an olive: a terracotta urn, a gnarled trunk twisting up into limbs, a crown of silver-green
    // puffs with sprays of narrow leaves out of them, olives among them
    const top = pot(m, P.terracotta, cx, cz, 0.22, 0.3, 0.5);
    m.add(ring(0.27, 0.012, 4, 20), shade(P.terracotta, 0.85), { at: [cx, 0.35, cz] });
    m.add(cyl(0.27, 0.27, 0.012, 18), P.pebble, { at: [cx, top, cz] });
    const bark = 0x6a5e50;
    const trunk: V3[] = [
      [cx, top, cz],
      [cx + 0.06, top + 0.3, cz - 0.03],
      [cx - 0.05, top + 0.6, cz + 0.04],
      [cx + 0.02, top + 0.9, cz],
    ];
    m.add(tube(trunk, 0.06, 7, 12), bark);
    m.add(
      tube([trunk[0], [cx - 0.05, top + 0.35, cz + 0.03], [cx + 0.04, top + 0.68, cz - 0.03]], 0.04, 6, 10),
      shade(bark, 0.82),
    );
    // the limbs, each ending in a puff of leaves
    const crown: { at: V3; r: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = i * GOLDEN + 0.4;
      const reach = 0.3 + rnd(i, 1, s) * 0.25;
      const y = top + 1.2 + rnd(i, 2, s) * 0.45 + (i === 5 ? 0.25 : 0);
      const end: V3 = [cx + Math.cos(a) * reach, y, cz + Math.sin(a) * reach * 0.9];
      const mid: V3 = [
        cx + Math.cos(a) * reach * 0.4,
        top + 1.0 + (y - top - 1.0) * 0.4,
        cz + Math.sin(a) * reach * 0.35,
      ];
      m.add(tube([trunk[3], mid, end], 0.028 - i * 0.002, 6, 8), bark);
      crown.push({ at: end, r: 0.15 + rnd(i, 3, s) * 0.06 });
      const half = along([trunk[3], mid, end], 0.62);
      crown.push({
        at: [half[0] + Math.cos(a + 1.2) * 0.1, half[1] + 0.12, half[2] + Math.sin(a + 1.2) * 0.1],
        r: 0.12 + rnd(i, 4, s) * 0.05,
      });
    }
    crown.push({ at: [cx, top + 1.75, cz], r: 0.2 });
    crown.push({ at: [cx + 0.12, top + 1.5, cz - 0.1], r: 0.17 });
    const greens = [0x8a9a6a, 0x7a8a5c, 0x9aa87a];
    crown.forEach((c, i) => {
      m.add(ball(c.r, 7), greens[i % 3], {
        at: c.at,
        scale: [1.2, 0.78, 1.1],
        rot: [0, i, 0],
        tone: 0.95 + (i % 2) * 0.08,
      });
    });
    // the sprays out of the puffs: narrow leaves, silver beneath
    // (lying along the puffs' faces, drooping a little: leaves, not pins)
    const narrow = leaf(0.11, 0.032, 0.25, 0.15, 3);
    let n = 0;
    for (const c of crown)
      for (let i = 0; i < 16; i++) {
        const a = i * GOLDEN + n;
        const up = (rnd(i, 2, n + s) - 0.4) * 1.4;
        const at: V3 = [
          c.at[0] + Math.cos(a) * c.r * 1.1,
          c.at[1] + up * c.r * 0.55,
          c.at[2] + Math.sin(a) * c.r * 1.05,
        ];
        leafAt(
          m,
          narrow.clone(),
          i % 3 ? 0x7d8a5c : 0xb0b89a,
          at,
          a + (i % 2 ? 1 : -1) * (1.1 + rnd(i, 5, n) * 0.5),
          0.25 + rnd(i, 3, n) * 0.4,
          0.92 + rnd(i, 4, n) * 0.16,
        );
        n += 0.013;
      }
    narrow.dispose();
    for (let i = 0; i < 16; i++) {
      const c = crown[i % crown.length];
      const a = i * 2.1;
      m.add(ball(0.016, 5), i % 3 ? 0x3a2a40 : 0x5a6a3a, {
        at: [c.at[0] + Math.cos(a) * c.r * 0.95, c.at[1] - c.r * 0.35, c.at[2] + Math.sin(a) * c.r * 0.9],
        scale: [1, 1.3, 1],
      });
    }
    return;
  }
  // a fiddle-leaf fig: a tall white planter, a straight trunk branching up, big glossy leaves
  // crowded up its branches
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.24, 0],
        [0.27, 0.04],
        [0.27, 0.56],
        [0.255, 0.58],
        [0.001, 0.58],
      ],
      20,
    ),
    0xeeebe4,
    { at: [cx, 0, cz] },
  );
  m.add(ring(0.272, 0.008, 4, 22), 0xc9a24a, { at: [cx, 0.06, cz] });
  m.add(cyl(0.25, 0.25, 0.01, 18), P.soil, { at: [cx, 0.575, cz] });
  const top = 0.585;
  const bark = 0x8a7a62;
  const trunk: V3[] = [
    [cx, top, cz],
    [cx + 0.02, top + 0.45, cz],
    [cx - 0.01, top + 0.85, cz + 0.02],
  ];
  m.add(tube(trunk, 0.04, 7, 10), bark);
  const branches: V3[][] = [];
  for (let b = 0; b < 6; b++) {
    const a = b * GOLDEN + 0.5;
    const len = 0.35 + rnd(b, 1, s) * 0.25;
    const y = top + 1.45 + rnd(b, 2, s) * 0.5;
    const from: V3 = [cx, top + 0.7 + b * 0.04, cz];
    const p: V3[] = [
      from,
      [cx + Math.cos(a) * len * 0.5, from[1] + 0.25, cz + Math.sin(a) * len * 0.45],
      [cx + Math.cos(a) * len, y, cz + Math.sin(a) * len * 0.9],
    ];
    m.add(tube(p, 0.022, 6, 8), bark);
    branches.push(p);
  }
  const lead: V3[] = [trunk[2], [cx + 0.03, top + 1.4, cz], [cx, top + 2.05, cz + 0.02]];
  m.add(tube(lead, 0.024, 6, 8), bark);
  branches.push(lead);
  // the leaves: up each branch's top two thirds, every way round it, biggest near its tip
  const big = leaf(0.34, 0.24, 0.12, 0.16, 5);
  let k = 0;
  for (const p of branches) {
    const dir = Math.atan2(p[2][2] - cz, p[2][0] - cx);
    for (let i = 0; i < 17; i++) {
      const t = 0.3 + (i / 16) * 0.72;
      const at = along(p, Math.min(1.02, t));
      const a = dir + (rnd(i, 1, k + s) - 0.5) * 3.6;
      const pitch = -0.35 + rnd(i, 2, k + s) * 0.8 - (t > 0.95 ? 0.5 : 0);
      const sz = 0.7 + t * 0.4;
      leafAt(
        m,
        big.clone().scale(sz, 1, sz),
        [0x2f5a2a, 0x3d6b30, 0x2a4f26, 0x5a8a3a][i % 4],
        at,
        a,
        pitch,
        0.9 + rnd(i, 3, k) * 0.2,
      );
      k++;
    }
  }
  big.dispose();
  // (story) a watering can at its foot
  if (s > 0.55) {
    m.add(cyl(0.07, 0.065, 0.16, 12), 0x5a7a6a, { at: [1.55, 0, 1.5] });
    m.add(
      tube(
        [
          [1.5, 0.1, 1.5],
          [1.38, 0.2, 1.5],
          [1.32, 0.26, 1.5],
        ],
        0.012,
        5,
        6,
      ),
      0x5a7a6a,
    );
    m.add(
      tube(
        [
          [1.55, 0.16, 1.45],
          [1.55, 0.25, 1.5],
          [1.55, 0.16, 1.55],
        ],
        0.006,
        4,
        6,
      ),
      0x4a6a5a,
    );
  }
}

// ── the fountain (2×2) ─────────────────────────────────────────────────────────────────────────────
function fountain(m: Model, o: Look) {
  const [cx, cz] = [1, 1];
  const stone = o.look === 1 ? 0x8a8780 : 0xd2c8b4;
  const water = 0x9ad0e0;
  const LEVEL = 0.38;
  // the basin: its wall, its rim, a teal floor so it reads deep
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.9, 0],
        [0.92, 0.04],
        [0.88, 0.07],
        [0.88, 0.4],
        [0.92, 0.42],
        [0.92, 0.46],
        [0.82, 0.46],
        [0.8, 0.43],
        [0.8, 0.08],
        [0.001, 0.08],
      ],
      32,
    ),
    stone,
    { at: [cx, 0, cz] },
  );
  m.add(cyl(0.79, 0.79, 0.01, 28), 0x2f5a62, { at: [cx, 0.08, cz] });
  for (let i = 0; i < 24; i++) {
    const a = i * GOLDEN;
    const r = 0.25 + rnd(i, 1, 0.2) * 0.5;
    m.add(ball(0.03 + (i % 3) * 0.01, 5), [0x6a6660, 0x8a857a, 0x5a5e5a][i % 3], {
      at: [cx + Math.cos(a) * r, 0.09, cz + Math.sin(a) * r],
      scale: [1, 0.5, 1],
    });
  }
  // (story) coins thrown in
  if (o.seed > 0.4)
    for (let i = 0; i < 9; i++) {
      const a = i * 1.9 + 0.3;
      const r = 0.3 + rnd(i, 2, o.seed) * 0.4;
      m.add(cyl(0.012, 0.012, 0.003, 8), i % 3 ? 0xd4a540 : 0xb8bdc4, {
        at: [cx + Math.cos(a) * r, 0.1, cz + Math.sin(a) * r],
      });
    }
  // the water's face (see-through, tinted)
  m.live(cyl(0.8, 0.8, 0.012, 32), water, { kind: "still" }, { at: [cx, LEVEL - 0.012, cz], glass: true });
  /** Drops falling round a rim of radius r from y0 to y1, in sets (a chase down). */
  const fall = (r: number, y0: number, y1: number, n = 6) => {
    // the sheet of it, see-through, flaring a little as it falls
    m.live(
      lathe(
        [
          [r + 0.045, y1 - y0],
          [r + 0.025, (y1 - y0) * 0.6],
          [r + 0.005, 0],
        ],
        28,
      ),
      water,
      { kind: "still" },
      { at: [cx, y0, cz], glass: true },
    );
    const sets: BufferGeometry[][] = Array.from({ length: n }, () => []);
    const rows = Math.max(n, Math.round((y0 - y1) / 0.05));
    const around = Math.round(r * 30);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < around; i++) {
        const a = ((i + (j % 2) * 0.5) / around) * Math.PI * 2;
        const rr = r + (j / rows) ** 2 * 0.04;
        sets[j % n].push(
          box([0.012, 0.03, 0.006])
            .rotateY(Math.PI / 2 - a)
            .translate(Math.cos(a) * rr, y0 - (j / rows) * (y0 - y1), Math.sin(a) * rr),
        );
      }
    chase(m, sets, 0xdff2fa, 0.7, [cx, 0, cz], { on: 0.34 });
  };
  /** Rings spreading out on the basin's water from radius r, in sets. */
  const ripples = (r: number, n = 3) => {
    const sets: BufferGeometry[][] = [];
    for (let k = 0; k < n; k++)
      sets.push([
        ring(r + k * 0.08, 0.006, 3, 32)
          .scale(1, 0.3, 1)
          .translate(0, LEVEL + 0.002, 0),
      ]);
    chase(m, sets, 0xe8f6fb, 1.5, [cx, 0, cz], { on: 0.45 });
  };
  if (o.look === 1) {
    // a slate water wall: a monolith rising from the pool, water sheeting down both its faces
    const [W, D, H] = [0.6, 0.12, 1.55];
    m.add(box([W + 0.12, 0.06, D + 0.12], 0.008), 0x4a4a48, { at: [cx, 0.11, cz] });
    m.add(box([W, H - 0.14, D], 0.006), 0x3a3c3e, { at: [cx, 0.14 + (H - 0.14) / 2, cz] });
    for (let i = 0; i < 9; i++)
      m.add(box([W + 0.004, 0.008, D + 0.004]), shade(0x3a3c3e, i % 2 ? 1.15 : 0.85), {
        at: [cx, 0.25 + i * 0.15, cz],
      });
    m.add(box([W + 0.04, 0.03, D + 0.04], 0.006), 0x2a2c2e, { at: [cx, H - 0.015, cz] });
    // the sheets of water (see-through) and the glints sliding down them (a chase)
    for (const s of [-1, 1]) {
      m.live(
        box([W - 0.04, H - 0.2, 0.006]),
        water,
        { kind: "still" },
        { at: [cx, 0.14 + (H - 0.2) / 2, cz + s * (D / 2 + 0.006)], glass: true },
      );
      const sets: BufferGeometry[][] = Array.from({ length: 6 }, () => []);
      for (let j = 0; j < 30; j++)
        for (let i = 0; i < 3; i++)
          sets[j % 6].push(
            box([0.012, 0.05, 0.004]).translate(
              -W / 2 + 0.05 + rnd(i, j, s) * (W - 0.1),
              H - 0.12 - j * 0.044,
              s * (D / 2 + 0.01),
            ),
          );
      chase(m, sets, 0xeaf6fb, 0.8, [cx, 0, cz], { on: 0.34 });
    }
    // a bowl of water at its foot, a few reeds
    for (let i = 0; i < 9; i++)
      leafAt(
        m,
        leaf(0.5 + rnd(i, 1, 0.3) * 0.3, 0.025, 0.1, 0.03, 4),
        i % 2 ? 0x4f7a3c : 0x6a8a45,
        [cx + 0.55 + (i % 3) * 0.03, 0.09, cz - 0.4 + Math.floor(i / 3) * 0.04],
        i * GOLDEN,
        -Math.PI / 2 + 0.15 + rnd(i, 2, 0.3) * 0.2,
      );
    ripples(0.42);
    return;
  }
  // tiered: a pedestal, a broad lower bowl, a column, a small upper bowl, a finial with its jet
  m.add(
    lathe(
      [
        [0.22, 0.08],
        [0.2, 0.14],
        [0.12, 0.2],
        [0.1, 0.5],
        [0.13, 0.62],
        [0.11, 0.7],
        [0.08, 0.8],
      ],
      16,
    ),
    stone,
    { at: [cx, 0, cz] },
  );
  const bowl = (r: number, y: number, d: number) => {
    m.add(
      lathe(
        [
          [0.06, y - d],
          [r * 0.6, y - d * 0.7],
          [r, y - 0.02],
          [r + 0.02, y],
          [r - 0.03, y + 0.005],
          [r * 0.7, y - d * 0.4],
          [0.001, y - d * 0.5],
        ],
        24,
      ),
      stone,
      { at: [cx, 0, cz] },
    );
    m.live(cyl(r - 0.035, r - 0.035, 0.008, 22), water, { kind: "still" }, { at: [cx, y - 0.018, cz], glass: true });
    // scallops round its lip
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      m.add(ball(0.025, 5), shade(stone, 0.92), {
        at: [cx + Math.cos(a) * (r + 0.005), y - 0.025, cz + Math.sin(a) * (r + 0.005)],
        scale: [1, 0.6, 1],
      });
    }
  };
  bowl(0.52, 0.9, 0.12);
  m.add(
    lathe(
      [
        [0.07, 0.84],
        [0.05, 0.95],
        [0.045, 1.15],
        [0.07, 1.22],
      ],
      14,
    ),
    stone,
    { at: [cx, 0, cz] },
  );
  bowl(0.28, 1.3, 0.08);
  m.add(
    lathe(
      [
        [0.04, 1.25],
        [0.05, 1.33],
        [0.03, 1.38],
        [0.045, 1.42],
        [0.001, 1.47],
      ],
      12,
    ),
    stone,
    { at: [cx, 0, cz] },
  );
  // the jet (a plume playing up and down, as a flame flickers), the water falling off each bowl
  m.live(
    lathe(
      [
        [0.001, 0],
        [0.018, 0.02],
        [0.014, 0.08],
        [0.006, 0.13],
        [0.001, 0.15],
      ],
      8,
    ),
    0xdff2fa,
    { kind: "flame", phase: 0.2 },
    { at: [cx, 1.46, cz], glass: true },
  );
  fall(0.29, 1.29, 0.92);
  fall(0.53, 0.89, LEVEL + 0.01);
  ripples(0.58);
  // (story) lily pads, else a sparrow on the rim
  if (o.seed > 0.5)
    for (const [a, r] of [
      [0.5, 0.7],
      [2.6, 0.68],
      [4.2, 0.72],
    ]) {
      m.add(cyl(0.07, 0.07, 0.004, 10), 0x4f7a3c, { at: [cx + Math.cos(a) * r, LEVEL + 0.002, cz + Math.sin(a) * r] });
      if (a > 4)
        m.add(ball(0.03, 6), 0xf0b0c0, {
          at: [cx + Math.cos(a) * r, LEVEL + 0.02, cz + Math.sin(a) * r],
          scale: [1, 0.6, 1],
        });
    }
  else {
    const [bx, bz] = [cx + 0.86, cz + 0.1];
    m.add(ball(0.03, 6), 0x8a6a4a, { at: [bx, 0.49, bz], scale: [1.4, 1, 1] });
    m.add(ball(0.02, 6), 0x6a4a30, { at: [bx - 0.035, 0.52, bz] });
    m.add(cyl(0.006, 0.001, 0.015, 4), P.mustard, { at: [bx - 0.055, 0.52, bz], rot: [0, 0, Math.PI / 2] });
  }
}

// ── the sculpture on its plinth (1×1) ──────────────────────────────────────────────────────────────
function sculpture(m: Model, o: Look) {
  const [cx, cz] = [0.5, 0.5];
  const H = 0.95;
  const plinth = o.look === 1 ? 0x2b2a2a : 0xe9e6df;
  m.add(box([0.44, 0.06, 0.44], 0.006), shade(plinth, 0.9), { at: [cx, 0.03, cz] });
  m.add(box([0.38, H - 0.1, 0.38], 0.004), plinth, { at: [cx, 0.06 + (H - 0.1) / 2, cz] });
  m.add(box([0.42, 0.04, 0.42], 0.006), shade(plinth, 0.94), { at: [cx, H - 0.02, cz] });
  // (story) a small brass plate on its front
  if (o.seed > 0.4) m.add(box([0.12, 0.04, 0.004]), P.brass, { at: [cx, H - 0.14, cz + 0.192] });
  if (o.look === 1) {
    // a bronze loop: a knotted ribbon on a short rod
    const bronze = 0x8a6a3a;
    m.add(cyl(0.08, 0.09, 0.03, 14), 0x2a2826, { at: [cx, H, cz] });
    m.add(cyl(0.012, 0.012, 0.13, 6), bronze, { at: [cx, H + 0.03, cz] });
    const pts: V3[] = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      // a trefoil knot, squashed upright
      const x = Math.sin(t) + 2 * Math.sin(2 * t);
      const y = Math.cos(t) - 2 * Math.cos(2 * t);
      const z = -Math.sin(3 * t);
      pts.push([cx + x * 0.055, H + 0.33 + y * 0.06, cz + z * 0.07]);
    }
    m.add(tube(pts, 0.022, 7, 120), bronze);
    // its patina in the hollows
    m.add(tube(pts.slice(10, 30), 0.0225, 7, 30), 0x5a8a7a, { tone: 0.95 });
    return;
  }
  if (o.look === 2) {
    // balanced river stones, a cairn
    let y = H;
    const stones: [number, number, number][] = [
      [0.15, 0.07, 0.02],
      [0.12, 0.065, -0.03],
      [0.1, 0.055, 0.025],
      [0.075, 0.05, -0.015],
      [0.055, 0.045, 0.01],
      [0.035, 0.035, 0],
    ];
    stones.forEach(([r, h, dx], i) => {
      m.add(ball(r, 9), [0x6a6660, 0x8a857a, 0x5a5e5a, 0x9a948a][i % 4], {
        at: [cx + dx, y + h / 2, cz - dx * 0.5],
        scale: [1, h / (2 * r), 0.85],
        rot: [0, i * 0.7, (i % 2 ? 1 : -1) * 0.06],
      });
      y += h * 0.92;
    });
    return;
  }
  // a marble bust: its socle, shoulders and chest, a neck, the head — brows, a nose, ears, curls
  const marble = 0xeceae4;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.08, 0],
        [0.08, 0.02],
        [0.05, 0.05],
        [0.04, 0.09],
        [0.07, 0.11],
        [0.001, 0.11],
      ],
      16,
    ),
    marble,
    { at: [cx, H, cz] },
  );
  const y0 = H + 0.11;
  m.add(cushion([0.32, 0.16, 0.16], 0.25, 2), marble, { at: [cx, y0 + 0.07, cz] });
  m.add(ball(0.09, 10), marble, { at: [cx, y0 + 0.15, cz + 0.01], scale: [1.7, 0.6, 0.85] });
  m.add(cyl(0.045, 0.04, 0.09, 10), marble, { at: [cx, y0 + 0.16, cz] });
  const hy = y0 + 0.33;
  m.add(ball(0.095, 12), marble, { at: [cx, hy, cz], scale: [0.85, 1.05, 1] });
  m.add(ball(0.06, 8), marble, { at: [cx, hy - 0.07, cz + 0.03], scale: [0.9, 0.7, 1] }); // (the jaw)
  m.add(
    extrude(
      [
        [0, 0.03],
        [0.016, -0.02],
        [-0.016, -0.02],
      ],
      0.035,
      0.003,
    ),
    marble,
    { at: [cx, hy - 0.01, cz + 0.1], tone: 0.98 },
  );
  m.add(box([0.11, 0.012, 0.02], 0.004), marble, { at: [cx, hy + 0.025, cz + 0.08], tone: 0.95 });
  for (const s of [-1, 1]) {
    m.add(ball(0.016, 6), shade(marble, 0.8), { at: [cx + s * 0.03, hy + 0.008, cz + 0.083], scale: [1, 0.6, 0.4] });
    m.add(ball(0.022, 6), marble, { at: [cx + s * 0.082, hy - 0.005, cz], scale: [0.4, 1, 0.8] });
  }
  m.add(box([0.04, 0.008, 0.01]), shade(marble, 0.85), { at: [cx, hy - 0.055, cz + 0.088] });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 1.6 - Math.PI * 0.3;
    const up = 0.03 + (i % 3) * 0.025;
    m.add(ball(0.026, 6), marble, {
      at: [cx + Math.cos(a) * 0.075, hy + up + 0.02, cz - Math.sin(a) * 0.07 - 0.005],
      tone: 0.94 + (i % 2) * 0.06,
    });
  }
  // (story) a laurel wreath on its head
  if (o.seed > 0.7)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      leafAt(
        m,
        leaf(0.03, 0.012, 0.1, 0, 3),
        0xc9a24a,
        [cx + Math.cos(a) * 0.088, hy + 0.04, cz + Math.sin(a) * 0.088],
        a + Math.PI / 2,
        -0.2,
      );
    }
}

// ── vases ──────────────────────────────────────────────────────────────────────────────────────────
/** A tulip: a stem bent from (x, y, z) up to its head, a cup of petals, a leaf at its foot. */
function tulip(m: Model, foot: V3, head: V3, c: number) {
  const mid: V3 = [(foot[0] + head[0]) / 2, (foot[1] + head[1]) / 2 + 0.02, (foot[2] + head[2]) / 2];
  m.add(tube([foot, mid, head], 0.003, 4, 6), P.stem);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    m.add(leaf(0.045, 0.03, -0.3, -0.25, 3).rotateX(-1.25), i % 2 ? c : shade(c, 0.85), {
      at: [head[0] + Math.cos(a) * 0.006, head[1] - 0.005, head[2] + Math.sin(a) * 0.006],
      rot: [0, Math.PI / 2 - a, 0],
    });
  }
}

function floorVase(m: Model, o: Look) {
  const s = o.seed;
  if (o.look === 2) {
    // a pair: a tall bottle and a squat moon jar, glazed
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.09, 0],
          [0.15, 0.2],
          [0.13, 0.45],
          [0.05, 0.6],
          [0.04, 0.68],
          [0.05, 0.72],
          [0.035, 0.72],
        ],
        18,
      ),
      0x2f4a5a,
      { at: [0.4, 0, 0.42] },
    );
    m.add(ring(0.142, 0.006, 4, 18), P.brass, { at: [0.4, 0.38, 0.42] });
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.1, 0],
          [0.17, 0.12],
          [0.16, 0.26],
          [0.07, 0.36],
          [0.075, 0.38],
          [0.06, 0.38],
        ],
        18,
      ),
      0xd8cfbc,
      { at: [0.64, 0, 0.6] },
    );
    return;
  }
  if (o.look === 1) {
    // a tall ribbed cylinder vase, bare branches and eucalyptus out of it
    m.add(cyl(0.11, 0.12, 0.6, 18), 0x3a3836, { at: [0.5, 0, 0.5] });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      m.add(box([0.012, 0.56, 0.01]), 0x4a4846, {
        at: [0.5 + Math.cos(a) * 0.118, 0.3, 0.5 + Math.sin(a) * 0.118],
        rot: [0, -a, 0],
      });
    }
    m.add(ring(0.12, 0.008, 4, 18), 0x2a2826, { at: [0.5, 0.6, 0.5] });
    for (let b = 0; b < 5; b++) {
      const a = b * GOLDEN + s;
      const r = 0.12 + rnd(b, 1, s) * 0.15;
      const tip: V3 = [0.5 + Math.cos(a) * r * 1.4, 1.3 + rnd(b, 2, s) * 0.25, 0.5 + Math.sin(a) * r * 1.2];
      const mid: V3 = [0.5 + Math.cos(a) * r * 0.5, 0.95, 0.5 + Math.sin(a) * r * 0.4];
      m.add(tube([[0.5, 0.55, 0.5], mid, tip], 0.006, 4, 8), 0x5a4030);
      // round eucalyptus leaves along it
      for (let k = 0; k < 9; k++) {
        const t = 0.3 + (k / 9) * 0.7;
        const at: V3 = [0.5 + (tip[0] - 0.5) * t, 0.55 + (tip[1] - 0.55) * t, 0.5 + (tip[2] - 0.5) * t];
        leafAt(m, leaf(0.075, 0.065, 0.08, 0.08, 4), b % 2 ? 0x8aa59a : 0x7a958a, at, a + (k % 2 ? 1.4 : -1.4), 0.4);
      }
    }
    return;
  }
  // pampas plumes in a big rough urn
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.1, 0],
        [0.12, 0.05],
        [0.19, 0.3],
        [0.17, 0.5],
        [0.1, 0.64],
        [0.11, 0.7],
        [0.09, 0.7],
      ],
      18,
    ),
    0xc8b49a,
    { at: [0.5, 0, 0.5] },
  );
  for (let i = 0; i < 3; i++)
    m.add(ring(0.185 - i * 0.012, 0.004, 3, 18), 0xa8947a, { at: [0.5, 0.3 + i * 0.06, 0.5] });
  for (let p = 0; p < 7; p++) {
    const a = p * GOLDEN + s * 3;
    const lean = 0.08 + rnd(p, 1, s) * 0.2;
    const tip: V3 = [0.5 + Math.cos(a) * lean, 1.35 + rnd(p, 2, s) * 0.25, 0.5 + Math.sin(a) * lean];
    m.add(
      tube([[0.5, 0.6, 0.5], [0.5 + Math.cos(a) * lean * 0.3, 1.0, 0.5 + Math.sin(a) * lean * 0.3], tip], 0.004, 4, 6),
      0xb8a888,
    );
    // the plume: a soft, fluffy feather of seed heads, leaning out the way its stem does
    const tilt = Math.atan2(Math.hypot(tip[0] - 0.5, tip[2] - 0.5), tip[1] - 1.0);
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.028, 0.04],
          [0.046, 0.12],
          [0.044, 0.2],
          [0.03, 0.27],
          [0.001, 0.33],
        ],
        10,
      ),
      [0xeee4cc, 0xe2d5b8, 0xe8dcc0][p % 3],
      { at: [tip[0], tip[1] - 0.26, tip[2]], rot: [0, -a, -tilt], scale: [1, 1, 0.8] },
    );
  }
}

function vase(m: Model, o: Look) {
  const s = o.seed;
  if (o.look === 1) {
    // a celadon bottle, a sprig of blossom
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.045, 0],
          [0.075, 0.08],
          [0.06, 0.15],
          [0.02, 0.2],
          [0.018, 0.25],
          [0.026, 0.26],
          [0.014, 0.26],
        ],
        16,
      ),
      0x9ec4ad,
      { at: [0.5, 0, 0.5] },
    );
    const tip: V3 = [0.58, 0.44, 0.48];
    m.add(tube([[0.5, 0.24, 0.5], [0.52, 0.34, 0.5], tip], 0.003, 4, 6), 0x4a3424);
    m.add(
      tube(
        [
          [0.51, 0.3, 0.5],
          [0.44, 0.38, 0.52],
        ],
        0.0025,
        4,
        3,
      ),
      0x4a3424,
    );
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      const at: V3 =
        i < 6 ? [0.52 + t * 0.09, 0.32 + t * 0.15, 0.49] : [0.47 - (i - 6) * 0.015, 0.34 + (i - 6) * 0.015, 0.515];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        m.add(ball(0.007, 4), i % 3 ? 0xf6d0d8 : 0xfff0f2, {
          at: [at[0] + Math.cos(a) * 0.007, at[1], at[2] + Math.sin(a) * 0.007],
        });
      }
    }
    return;
  }
  if (o.look === 2) {
    // three bud vases, a stem in each
    const buds: [number, number, number, number][] = [
      [0.42, 0.48, 0.12, 0xc4402b],
      [0.53, 0.44, 0.09, 0xd9a441],
      [0.6, 0.55, 0.14, 0x3f6b8a],
    ];
    buds.forEach(([x, z, h, c], i) => {
      m.add(
        lathe(
          [
            [0.001, 0],
            [0.025, 0],
            [0.03, h * 0.4],
            [0.012, h * 0.8],
            [0.014, h],
            [0.008, h],
          ],
          12,
        ),
        c,
        { at: [x, 0, z] },
      );
      const head: V3 = [x + (i - 1) * 0.02, h + 0.1 + i * 0.03, z];
      m.add(tube([[x, h - 0.02, z], head], 0.0025, 4, 3), P.stem);
      if (i === 1) {
        // a daisy
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          m.add(box([0.022, 0.002, 0.007]).translate(0.012, 0, 0), P.paperWhite, { at: head, rot: [0, a, 0.2] });
        }
        m.add(ball(0.008, 5), P.mustard, { at: head });
      } else m.add(ball(0.014, 6), i ? 0xb86ad0 : 0xf0a040, { at: head, scale: [1, 1.2, 1] });
      leafAt(m, leaf(0.04, 0.015, 0.1, 0.1, 3), P.leaf, [x, h + 0.03, z], i * 2, -0.5);
    });
    return;
  }
  // a jug of tulips: a cream jug with a handle, tulips leaning out of it
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.055, 0],
        [0.065, 0.06],
        [0.055, 0.13],
        [0.05, 0.16],
        [0.058, 0.17],
        [0.045, 0.17],
      ],
      16,
    ),
    P.cream,
    { at: [0.5, 0, 0.5] },
  );
  m.add(ring(0.062, 0.004, 3, 16), 0x3f5a8a, { at: [0.5, 0.06, 0.5] });
  m.add(
    tube(
      [
        [0.555, 0.14, 0.5],
        [0.6, 0.12, 0.5],
        [0.6, 0.05, 0.5],
        [0.56, 0.04, 0.5],
      ],
      0.008,
      4,
      8,
    ),
    P.cream,
  );
  const colours = [0xe04a5a, 0xf0a040, 0xf4d040, 0xe86a9a];
  const c0 = colours[Math.floor(s * 4) % 4];
  for (let i = 0; i < 7; i++) {
    const a = i * GOLDEN;
    const lean = 0.03 + (i % 3) * 0.035;
    tulip(
      m,
      [0.5, 0.14, 0.5],
      [0.5 + Math.cos(a) * lean, 0.3 + rnd(i, 1, s) * 0.1, 0.5 + Math.sin(a) * lean],
      i % 3 ? c0 : colours[(Math.floor(s * 4) + 1) % 4],
    );
  }
  for (let i = 0; i < 5; i++) leafAt(m, leaf(0.12, 0.03, 0.2, 0.25, 4), 0x5f8a43, [0.5, 0.16, 0.5], i * 1.3, -0.9);
}

// ── the terrarium (on a surface) ────────────────────────────────────────────────────────────────────
function succulent(m: Model, at: V3, r: number, c: number) {
  for (let i = 0; i < 9; i++) {
    const a = i * GOLDEN;
    m.add(leaf(r, r * 0.6, 0.3, -0.1, 3), shade(c, 0.85 + (i % 3) * 0.1), {
      at,
      rot: [-0.5 - (i / 9) * 0.7, Math.PI / 2 - a, 0],
    });
  }
}
function terrarium(m: Model, o: Look) {
  const glass = 0xd8eef0;
  if (o.look === 1) {
    // a geometric case: brass edges round a box with a pitched lid, plants inside
    const [w, h] = [0.24, 0.16];
    const y = 0.008;
    m.add(box([w, 0.008, w]), 0x2a2826, { at: [0.5, 0.004, 0.5] });
    m.add(box([w - 0.01, 0.03, w - 0.01]), 0x6b5a44, { at: [0.5, y + 0.015, 0.5] });
    m.add(box([w - 0.01, 0.01, w - 0.01]), 0x4f7a3c, { at: [0.5, y + 0.035, 0.5] });
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        m.add(box([0.006, h, 0.006]), P.brass, { at: [0.5 + (x * w) / 2, y + h / 2, 0.5 + (z * w) / 2] });
    for (const z of [-1, 1]) {
      m.add(box([w, 0.006, 0.006]), P.brass, { at: [0.5, y + h, 0.5 + (z * w) / 2] });
      m.add(box([0.006, 0.006, w]), P.brass, { at: [0.5 + (z * w) / 2, y + h, 0.5] });
      m.add(box([0.006, 0.006, w]), P.brass, { at: [0.5 + (z * w) / 2, y, 0.5] });
      m.add(box([w, 0.006, 0.006]), P.brass, { at: [0.5, y, 0.5 + (z * w) / 2] });
    }
    // the lid's ridge, its rafters
    m.add(box([w, 0.006, 0.006]), P.brass, { at: [0.5, y + h + 0.08, 0.5] });
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        m.add(rod(0.003, 0.003, Math.hypot(w / 2, 0.08), "z", 4), P.brass, {
          at: [0.5 + (x * w) / 2, y + h + 0.04, 0.5 + (z * w) / 4],
          rot: [z * Math.atan2(0.08, w / 2), 0, 0],
        });
    m.live(box([w - 0.006, h, w - 0.006]), glass, { kind: "still" }, { at: [0.5, y + h / 2, 0.5], glass: true });
    m.live(
      extrude(
        [
          [-w / 2, 0],
          [w / 2, 0],
          [0, 0.08],
        ],
        w - 0.006,
      ),
      glass,
      { kind: "still" },
      { at: [0.5, y + h, 0.5], glass: true },
    );
    succulent(m, [0.45, y + 0.045, 0.46], 0.04, 0x7aa08a);
    succulent(m, [0.56, y + 0.045, 0.55], 0.03, 0xa07a8a);
    for (let i = 0; i < 6; i++)
      leafAt(m, leaf(0.08, 0.03, 0.15, 0.2, 4), P.leafYoung, [0.55, y + 0.045, 0.44], i * 1.05, -0.7);
    return;
  }
  if (o.look === 2) {
    // a bell jar on a walnut base, a mossy mound with a fern and a toadstool
    m.add(cyl(0.11, 0.115, 0.03, 20), P.walnut, { at: [0.5, 0, 0.5] });
    m.add(ball(0.09, 10), 0x4f7a3c, { at: [0.5, 0.045, 0.5], scale: [1, 0.4, 1] });
    for (let i = 0; i < 16; i++) {
      const a = i * GOLDEN;
      m.add(ball(0.02, 5), [0x5f8a43, 0x4a7a35, 0x6a9a4a][i % 3], {
        at: [0.5 + Math.cos(a) * 0.06, 0.05 + (i % 2) * 0.01, 0.5 + Math.sin(a) * 0.06],
        scale: [1, 0.6, 1],
      });
    }
    for (let i = 0; i < 7; i++)
      leafAt(m, leaf(0.09, 0.035, 0.1, 0.4, 5, 3), P.leafYoung, [0.48, 0.06, 0.5], i * GOLDEN, -0.9);
    m.add(cyl(0.005, 0.006, 0.03, 6), P.cream, { at: [0.56, 0.05, 0.54] });
    m.add(ball(0.014, 6), 0xc4402b, { at: [0.56, 0.08, 0.54], scale: [1, 0.55, 1] });
    m.live(
      lathe(
        [
          [0.1, 0],
          [0.1, 0.16],
          [0.08, 0.22],
          [0.04, 0.25],
          [0.001, 0.255],
        ],
        20,
      ),
      glass,
      { kind: "still" },
      { at: [0.5, 0.03, 0.5], glass: true },
    );
    m.add(ball(0.014, 6), 0xd8eef0, { at: [0.5, 0.29, 0.5] });
    return;
  }
  // a glass globe on a brass ring: sand in layers, pebbles, succulents, a little figure by its seed
  m.add(ring(0.05, 0.006, 4, 16), P.brass, { at: [0.5, 0.006, 0.5] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    m.add(cyl(0.004, 0.004, 0.02, 4), P.brass, { at: [0.5 + Math.cos(a) * 0.05, 0, 0.5 + Math.sin(a) * 0.05] });
  }
  const R = 0.12;
  const cy = 0.018 + R;
  m.add(cyl(0.09, 0.1, 0.03, 16), 0xe0c890, { at: [0.5, cy - R * 0.85, 0.5] });
  m.add(cyl(0.1, 0.105, 0.02, 16), 0x9a8a6a, { at: [0.5, cy - R * 0.85 + 0.03, 0.5] });
  const bed = cy - R * 0.85 + 0.05;
  for (let i = 0; i < 8; i++)
    m.add(ball(0.012, 5), P.pebble, {
      at: [0.5 + Math.cos(i * 2.1) * 0.07, bed, 0.5 + Math.sin(i * 2.1) * 0.06],
      scale: [1, 0.6, 1],
    });
  succulent(m, [0.47, bed, 0.48], 0.04, 0x7aa08a);
  succulent(m, [0.56, bed, 0.53], 0.028, 0x9aa070);
  m.add(cyl(0.012, 0.012, 0.05, 8), 0x5f8a43, { at: [0.43, bed, 0.56] });
  if (o.seed > 0.5) {
    m.add(cyl(0.004, 0.004, 0.012, 4), 0xc4402b, { at: [0.53, bed, 0.44] });
    m.add(ball(0.005, 4), 0xe8c4a0, { at: [0.53, bed + 0.016, 0.44] });
  }
  // the globe, open on its front
  m.live(ball(R, 18), glass, { kind: "still" }, { at: [0.5, cy, 0.5], glass: true });
  m.add(ring(0.065, 0.004, 3, 16).rotateX(Math.PI / 2), 0xb8d8dc, {
    at: [0.5, cy + 0.03, 0.5 + R * 0.93],
    rot: [-0.25, 0, 0],
  });
}

// ── the trophy (on a surface) ───────────────────────────────────────────────────────────────────────
function trophy(m: Model, o: Look) {
  if (o.look === 1) {
    // a silver star on a stem, on a black base with its plate
    m.add(box([0.1, 0.04, 0.08], 0.004), 0x1a1a1c, { at: [0.5, 0.02, 0.5] });
    m.add(box([0.06, 0.018, 0.003]), P.brass, { at: [0.5, 0.02, 0.5415] });
    m.add(cyl(0.006, 0.006, 0.08, 6), P.chrome, { at: [0.5, 0.04, 0.5] });
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.032 : 0.075;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    m.add(extrude(pts, 0.02, 0.006, 1), 0xd8dde4, { at: [0.5, 0.19, 0.5] });
    return;
  }
  if (o.look === 2) {
    // a crystal obelisk on a walnut base
    m.add(box([0.09, 0.03, 0.09], 0.004), P.walnut, { at: [0.5, 0.015, 0.5] });
    m.add(box([0.05, 0.012, 0.003]), P.brass, { at: [0.5, 0.015, 0.5465] });
    m.live(
      cyl(0.03, 0.012, 0.26, 4).rotateY(Math.PI / 4),
      0xd8eaf4,
      { kind: "still" },
      { at: [0.5, 0.03, 0.5], glass: true },
    );
    m.add(cyl(0.012, 0.001, 0.025, 4).rotateY(Math.PI / 4), 0xeaf4fa, { at: [0.5, 0.29, 0.5] });
    m.add(box([0.03, 0.03, 0.004]), 0xc8d8e4, { at: [0.5, 0.12, 0.5], rot: [0, Math.PI / 4, 0] });
    return;
  }
  // a gold loving cup: its handles, a stepped wooden plinth, a plate
  m.add(box([0.12, 0.04, 0.12], 0.004), P.walnutDark, { at: [0.5, 0.02, 0.5] });
  m.add(box([0.1, 0.025, 0.1], 0.004), P.walnut, { at: [0.5, 0.0525, 0.5] });
  m.add(box([0.07, 0.022, 0.003]), P.brass, { at: [0.5, 0.025, 0.5615] });
  const gold = 0xd4a540;
  m.add(
    lathe(
      [
        [0.001, 0.065],
        [0.03, 0.065],
        [0.022, 0.075],
        [0.008, 0.1],
        [0.008, 0.14],
        [0.02, 0.155],
        [0.05, 0.2],
        [0.058, 0.27],
        [0.062, 0.29],
        [0.052, 0.29],
        [0.001, 0.2],
      ],
      18,
    ),
    gold,
    { at: [0.5, 0, 0.5] },
  );
  for (const s of [-1, 1])
    m.add(ring(0.032, 0.006, 4, 12).rotateX(Math.PI / 2), shade(gold, 1.05), {
      at: [0.5 + s * 0.07, 0.24, 0.5],
      scale: [0.8, 1.2, 1],
    });
  // (story) a ribbon on a handle
  if (o.seed > 0.5) m.add(box([0.012, 0.06, 0.003]), 0x2a5ad0, { at: [0.43, 0.2, 0.5], rot: [0, 0, 0.2] });
}

// ── stacked books (on a surface) ────────────────────────────────────────────────────────────────────
function bookStack(m: Model, o: Look) {
  const s = o.seed;
  const palettes = [
    [0x6e2f22, 0x2f4a5a, 0x3f5a3a, 0x8a6a3a, 0x2b2a26],
    [0xe04a3a, 0xf0c040, 0x3a8ae0, 0x4fae6a, 0xe86a9a],
    [0xe9e1cc, 0x2b2a26, 0xc4402b, 0x9a9384],
  ];
  const pal = palettes[o.look] ?? palettes[0];
  const sizes: [number, number, number][] =
    o.look === 2
      ? [
          [0.34, 0.035, 0.27],
          [0.31, 0.03, 0.24],
          [0.28, 0.025, 0.22],
        ]
      : o.look === 1
        ? [
            [0.18, 0.028, 0.11],
            [0.18, 0.032, 0.11],
            [0.17, 0.025, 0.105],
            [0.18, 0.03, 0.11],
            [0.17, 0.022, 0.1],
            [0.175, 0.028, 0.11],
          ]
        : [
            [0.26, 0.04, 0.19],
            [0.24, 0.035, 0.17],
            [0.25, 0.045, 0.18],
            [0.22, 0.03, 0.16],
            [0.21, 0.038, 0.15],
          ];
  let y = 0;
  sizes.forEach(([w, h, d], i) => {
    const turn = (rnd(i, 1, s) - 0.5) * 0.35;
    const c = pal[(i + Math.floor(s * 5)) % pal.length];
    const at: V3 = [0.5 + (rnd(i, 2, s) - 0.5) * 0.02, y + h / 2, 0.5];
    // the cover, the pages' block inset on three sides, a band on the spine
    m.add(box([w, h, d], 0.002), c, { at, rot: [0, turn, 0] });
    m.add(box([w - 0.008, h - 0.006, d - 0.006]), P.paper, {
      at: [at[0] + 0.005 * Math.cos(turn), at[1], at[2] - 0.005 * Math.sin(turn)],
      rot: [0, turn, 0],
    });
    if (o.look !== 1)
      m.add(box([0.004, h + 0.001, d * 0.8]), o.look === 2 ? shade(c, 0.7) : P.brass, {
        at: [at[0] - (w / 2 - 0.02) * Math.cos(turn), at[1], at[2] + (w / 2 - 0.02) * Math.sin(turn)],
        rot: [0, turn, 0],
      });
    y += h;
  });
  // (story) reading glasses or a small brass thing on top; the art books a candle
  if (o.look === 2) {
    m.add(cyl(0.035, 0.035, 0.07, 14), P.cream, { at: [0.58, y, 0.52] });
    m.add(cyl(0.001, 0.001, 0.012, 3), P.ink, { at: [0.58, y + 0.07, 0.52] });
    m.add(ball(0.03, 8), P.brass, { at: [0.42, y + 0.03, 0.47] });
  } else if (s > 0.4) {
    for (const dx of [-0.025, 0.025]) m.add(ring(0.018, 0.0025, 3, 12), P.ink, { at: [0.5 + dx, y + 0.003, 0.5] });
    m.add(box([0.012, 0.003, 0.003]), P.ink, { at: [0.5, y + 0.003, 0.5] });
    for (const dx of [-0.04, 0.04])
      m.add(box([0.003, 0.003, 0.07]), P.ink, { at: [0.5 + dx * 1.05, y + 0.003, 0.535] });
  } else m.add(ball(0.025, 8), 0x6a8a9a, { at: [0.55, y + 0.022, 0.5], scale: [1, 0.85, 1] });
}

// ── the hanging plant (from the ceiling) ──────────────────────────────────────────────────────────
function hangingPlant(m: Model, o: Look) {
  const s = o.seed;
  const [cx, cz] = [0.5, 0.5];
  m.add(cyl(0.035, 0.035, 0.015, 10), P.white, { at: [cx, CEILING - 0.015, cz] });
  m.add(ring(0.018, 0.004, 3, 10).rotateX(Math.PI / 2), P.brass, { at: [cx, CEILING - 0.035, cz] });
  if (o.look === 1) {
    // a wire basket on three chains, a Boston fern arching out and down
    const by = 2.38;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      m.add(
        tube(
          [
            [cx, CEILING - 0.05, cz],
            [cx + Math.cos(a) * 0.16, by + 0.14, cz + Math.sin(a) * 0.16],
          ],
          0.003,
          3,
          6,
        ),
        P.steel,
      );
    }
    m.add(
      lathe(
        [
          [0.001, by - 0.12],
          [0.08, by - 0.11],
          [0.15, by + 0.02],
          [0.17, by + 0.14],
        ],
        14,
      ),
      0x7a6a4a,
      { at: [cx, 0, cz] },
    );
    for (let i = 0; i < 4; i++)
      m.add(ring(0.09 + i * 0.027, 0.004, 3, 14), P.steel, { at: [cx, by - 0.1 + i * 0.07, cz] });
    m.add(cyl(0.16, 0.16, 0.01, 14), P.soil, { at: [cx, by + 0.12, cz] });
    for (let i = 0; i < 30; i++) {
      const a = i * GOLDEN;
      const len = 0.3 + rnd(i, 1, s) * 0.1;
      const up = i % 3 === 0;
      leafAt(
        m,
        leaf(len, 0.1, 0.08, up ? 0.5 : 0.8, 7, 6),
        i % 3 ? P.leafYoung : P.leaf,
        [cx + Math.cos(a) * 0.05, by + 0.13, cz + Math.sin(a) * 0.05],
        a,
        (up ? -0.7 : 0.05) + rnd(i, 2, s) * 0.4,
        0.9 + rnd(i, 3, s) * 0.2,
      );
    }
    return;
  }
  if (o.look === 2) {
    // a ceramic bowl on leather straps, strands of pearls spilling over its rim
    const by = 2.4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      m.add(box([0.012, CEILING - 0.05 - by, 0.003]), 0x8a5a36, {
        at: [cx + Math.cos(a) * 0.065, (CEILING - 0.05 + by) / 2, cz + Math.sin(a) * 0.065],
        rot: [Math.sin(a) * 0.15, -a + Math.PI / 2, -Math.cos(a) * 0.15],
      });
    }
    m.add(
      lathe(
        [
          [0.001, by - 0.1],
          [0.06, by - 0.09],
          [0.12, by - 0.02],
          [0.13, by + 0.03],
          [0.115, by + 0.03],
        ],
        18,
      ),
      0xe6ddcb,
      { at: [cx, 0, cz] },
    );
    m.add(ring(0.12, 0.005, 3, 18), P.terracotta, { at: [cx, by - 0.02, cz] });
    m.add(cyl(0.115, 0.115, 0.01, 16), P.soil, { at: [cx, by + 0.01, cz] });
    for (let k = 0; k < 14; k++) {
      const a = k * GOLDEN + s;
      const r = 0.1 + rnd(k, 1, s) * 0.03;
      const drop = 0.2 + rnd(k, 2, s) * 0.3;
      const pts: V3[] = [
        [cx + Math.cos(a) * 0.05, by + 0.02, cz + Math.sin(a) * 0.05],
        [cx + Math.cos(a) * (r + 0.03), by + 0.04, cz + Math.sin(a) * (r + 0.03)],
        [cx + Math.cos(a) * (r + 0.05), by - drop * 0.5, cz + Math.sin(a) * (r + 0.05)],
        [cx + Math.cos(a + 0.2) * (r + 0.04), by - drop, cz + Math.sin(a + 0.2) * (r + 0.04)],
      ];
      m.add(tube(pts, 0.0018, 3, 10), 0x4a6a3a);
      const beads: BufferGeometry[] = [];
      for (let i = 1; i < 14; i++) {
        const t = i / 14;
        const seg = Math.min(2, Math.floor(t * 3));
        const u = t * 3 - seg;
        const p0 = pts[seg];
        const p1 = pts[seg + 1];
        beads.push(
          ball(0.008, 5).translate(
            p0[0] + (p1[0] - p0[0]) * u,
            p0[1] + (p1[1] - p0[1]) * u,
            p0[2] + (p1[2] - p0[2]) * u,
          ),
        );
      }
      m.add(merged(beads), 0x7aa05a);
    }
    return;
  }
  // a pothos in a terracotta pot, a macramé hanger knotted round it, its vines trailing down
  const by = 2.32;
  const cords = 4;
  for (let i = 0; i < cords; i++) {
    const a = (i / cords) * Math.PI * 2 + 0.4;
    const knotY = by + 0.42;
    m.add(
      tube(
        [
          [cx, CEILING - 0.05, cz],
          [cx + Math.cos(a) * 0.02, knotY, cz + Math.sin(a) * 0.02],
        ],
        0.004,
        3,
        4,
      ),
      P.lace,
    );
    m.add(
      tube(
        [
          [cx + Math.cos(a) * 0.02, knotY, cz + Math.sin(a) * 0.02],
          [cx + Math.cos(a) * 0.1, by + 0.22, cz + Math.sin(a) * 0.1],
          [cx + Math.cos(a) * 0.135, by + 0.06, cz + Math.sin(a) * 0.135],
          [cx + Math.cos(a) * 0.08, by - 0.12, cz + Math.sin(a) * 0.08],
          [cx, by - 0.2, cz],
        ],
        0.004,
        3,
        12,
      ),
      P.lace,
    );
    m.add(ball(0.01, 5), P.lace, { at: [cx + Math.cos(a) * 0.1, by + 0.22, cz + Math.sin(a) * 0.1] });
  }
  m.add(ball(0.022, 6), P.lace, { at: [cx, by + 0.44, cz] });
  m.add(ball(0.018, 6), P.lace, { at: [cx, by - 0.2, cz] });
  for (let i = 0; i < 8; i++)
    m.add(cyl(0.003, 0.002, 0.12, 3), P.lace, { at: [cx + Math.cos(i) * 0.01, by - 0.33, cz + Math.sin(i) * 0.01] });
  const top = pot(m, P.terracotta, cx, cz, 0.08, 0.11, 0.13, by - 0.12);
  // the vines: from the pot's rim, over it and down, heart leaves along them
  const heart = leaf(0.07, 0.06, 0.15, 0.15, 4);
  for (let v = 0; v < 9; v++) {
    const a = v * GOLDEN + s * 2;
    const drop = 0.15 + rnd(v, 1, s) * 0.24;
    const pts: V3[] = [
      [cx + Math.cos(a) * 0.06, top + 0.02, cz + Math.sin(a) * 0.06],
      [cx + Math.cos(a) * 0.13, top + 0.03, cz + Math.sin(a) * 0.13],
      [cx + Math.cos(a) * 0.17, top - drop * 0.5, cz + Math.sin(a) * 0.17],
      [cx + Math.cos(a + 0.3) * 0.19, top - drop, cz + Math.sin(a + 0.3) * 0.19],
    ];
    m.add(tube(pts, 0.002, 3, 8), P.stem);
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.5) / 6;
      const seg = Math.min(2, Math.floor(t * 3));
      const u = t * 3 - seg;
      const p0 = pts[seg];
      const p1 = pts[seg + 1];
      const at: V3 = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u];
      leafAt(
        m,
        heart.clone(),
        k % 3 ? 0x4f8a3a : 0x8ab04a,
        at,
        a + (k % 2 ? 1.2 : -1.2),
        0.5,
        0.9 + rnd(k, v, s) * 0.2,
      );
    }
  }
  for (let i = 0; i < 8; i++) leafAt(m, heart.clone(), 0x4f8a3a, [cx, top, cz], i * GOLDEN, -0.6);
  heart.dispose();
}

// ── the moss wall (on a wall, 2 wide) ──────────────────────────────────────────────────────────────
function mossWall(m: Model, o: Look) {
  const s = o.seed;
  const greens = [0x4a6a2a, 0x5f7f35, 0x3f5a28, 0x7a9440, 0x6a8a3a];
  const [cx, cy] = [1, 1.5];
  const round = o.look === 2;
  const [W, H] = round ? [1.0, 1.0] : [1.5, 1.0];
  const frame = o.look === 1 ? 0x1d1d20 : round ? P.brass : P.oak;
  const fz = FACE + 0.03;
  if (round) {
    m.add(cyl(W / 2 - 0.01, W / 2 - 0.01, 0.02, 40), 0x2a2a1e, { at: [cx, cy, FACE + 0.01], rot: [Math.PI / 2, 0, 0] });
    m.add(ring(W / 2 - 0.01, 0.018, 5, 48).rotateX(Math.PI / 2), frame, { at: [cx, cy, fz] });
  } else {
    m.add(box([W - 0.04, H - 0.04, 0.02]), 0x2a2a1e, { at: [cx, cy, FACE + 0.01] });
    for (const y of [cy - H / 2 + 0.02, cy + H / 2 - 0.02])
      m.add(box([W, 0.04, 0.07], 0.004), frame, { at: [cx, y, FACE + 0.035] });
    for (const x of [cx - W / 2 + 0.02, cx + W / 2 - 0.02])
      m.add(box([0.04, H - 0.08, 0.07], 0.004), frame, { at: [x, cy, FACE + 0.035] });
  }
  // the moss: clumps of cushion moss, packed, swelling out of the board in their greens
  const inside = (x: number, y: number, pad: number) =>
    round ? Math.hypot(x - cx, y - cy) < W / 2 - pad : Math.abs(x - cx) < W / 2 - pad && Math.abs(y - cy) < H / 2 - pad;
  let n = 0;
  for (let i = 0; i < 400 && n < 230; i++) {
    const x = cx - W / 2 + rnd(i, 1, s) * W;
    const y = cy - H / 2 + rnd(i, 2, s) * H;
    const r = 0.045 + rnd(i, 3, s) * 0.035;
    if (!inside(x, y, r * 0.8 + 0.03)) continue;
    const sz = 0.38 + rnd(i, 4, s) * 0.14;
    m.add(ball(r, 5), greens[i % greens.length], {
      at: [x, y, FACE + r * sz + 0.003],
      scale: [1, 1, sz],
      rot: [0, 0, rnd(i, 5, s) * 3],
      tone: 0.9 + rnd(i, 6, s) * 0.2,
    });
    n++;
  }
  // reindeer moss, pale, in drifts
  for (let i = 0; i < 40; i++) {
    const x = cx - W / 2 + rnd(i, 7, s) * W;
    const y = cy - H / 2 + rnd(i, 8, s) * H;
    if (!inside(x, y, 0.06)) continue;
    m.add(ball(0.025, 5), 0xc8d0a8, { at: [x, y, FACE + 0.06], scale: [1, 1, 0.6] });
  }
  if (o.look === 1) {
    // ferns sprouting out of it
    for (const [x, y] of [
      [0.55, 1.75],
      [1.3, 1.25],
      [1.55, 1.8],
      [0.8, 1.2],
    ])
      for (let i = 0; i < 8; i++) {
        // (fanning up and out of the moss, none drooping under its frame)
        const a = -0.35 + (i / 7) * (Math.PI + 0.7);
        m.add(
          leaf(0.22, 0.08, 0.08, 0.4, 6, 5)
            .rotateX(-1.0)
            .rotateZ(a - Math.PI / 2),
          i % 2 ? P.leafYoung : P.leaf,
          { at: [x, y, FACE + 0.06], tone: 0.9 + rnd(i, x, s) * 0.2 },
        );
      }
  }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  big_aquarium: bigAquarium,
  wood_stove: woodStove,
  indoor_tree: indoorTree,
  fountain,
  sculpture,
  floor_vase: floorVase,
  vase,
  terrarium,
  trophy,
  book_stack: bookStack,
  hanging_plant: hangingPlant,
  moss_wall: mossWall,
};
