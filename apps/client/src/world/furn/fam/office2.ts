import { SURFACE } from "@yutopia/shared";
import { glyphDots } from "@yutopia/shared/glyphs";
import { type BufferGeometry, Float32BufferAttribute, BufferGeometry as Geo } from "three";
import { ball, box, cushion, cyl, extrude, type Look, lathe, type Model, ring, rod, tube, type V3 } from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 6 (docs/plan/68-more-furniture.md): Office — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/office2.ts. As the plan 67 staples (staples.ts): what
// an office still lacked, each with its story by the seed; a wall piece in the wall's frame (its face
// at z 0.1), a thing reaching the ceiling up to 3.27.

export const LOOKS: Record<string, readonly string[]> = {
  mobile_whiteboard: ["Whiteboard on wheels", "Glass board on wheels"],
  punch_clock: ["Punch clock, cream", "Punch clock, green"],
  tube_station: ["Tube station, brass", "Tube station, steel"],
  paper_shredder: ["Paper shredder"],
  plotter: ["Plotter"],
  drinks_fridge: ["Drinks fridge, steel", "Drinks fridge, black"],
  security_desk: ["Security desk"],
  fire_extinguisher: ["Foam extinguisher", "CO₂ extinguisher"],
  first_aid_cabinet: ["First aid, white", "First aid, green"],
  sorting_desk: ["Mail sorting desk"],
};

const FACE = 0.1; // a wall's face
const CEILING = 3.27;
const INK = [0xc4402b, 0x2f4a8a, 0x2f6a3d, 0x2b2a26];
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
function rng(seed: number): () => number {
  let s = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
/** Words in the shared dot face on a face looking +z, centred on x, its top at y: each dot `p`. */
function words(m: Model, text: string, x: number, y: number, z: number, p: number, c: number, glow = false) {
  const pos: number[] = [];
  const d = p * 0.82;
  const left = x - (text.length * 6 - 1) * p * 0.5;
  for (let i = 0; i < text.length; i++)
    for (const [cc, r] of glyphDots(text[i])) {
      const x0 = left + (i * 6 + cc) * p;
      const y1 = y - r * p;
      pos.push(x0, y1 - d, z, x0 + d, y1 - d, z, x0 + d, y1, z, x0, y1 - d, z, x0 + d, y1, z, x0, y1, z);
    }
  if (pos.length) m.add(geo(pos), c, { glow });
}
/** A marker's line on a face at z (looking +z): through the points (x, y), `w` wide. */
function stroke(m: Model, pts: [number, number][], z: number, c: number, w = 0.008) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    m.add(box([len + w * 0.6, w, 0.0015]), c, {
      at: [(ax + bx) / 2, (ay + by) / 2, z],
      rot: [0, 0, Math.atan2(by - ay, bx - ax)],
    });
  }
}
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
/** Handwriting: a wavy line across (x0..x1) at y. */
function scrawl(m: Model, x0: number, x1: number, y: number, z: number, c: number, s: number) {
  const pts: [number, number][] = [];
  const n = Math.max(3, Math.round((x1 - x0) / 0.025));
  for (let i = 0; i <= n; i++)
    pts.push([x0 + ((x1 - x0) * i) / n, y + (i % 2 ? 0.012 : -0.004) * (0.6 + rnd(i, 3, s))]);
  stroke(m, pts, z, c, 0.005);
}
/** A castor: its swivel plate under (x, y, z), the fork, the wheel along x. */
function castor(m: Model, x: number, y: number, z: number) {
  m.add(cyl(0.022, 0.022, 0.01, 10), P.steel, { at: [x, y - 0.01, z] });
  m.add(box([0.034, 0.04, 0.03]), P.steel, { at: [x, y - 0.035, z - 0.01] });
  m.add(rod(0.035, 0.035, 0.024, "x", 12), P.rubber, { at: [x, 0.035, z - 0.015] });
}

// ── the mobile whiteboard (2×1) ───────────────────────────────────────────────────────────────────
/** A double-sided board between two posts on castored feet, pivoting on its knobs: an aluminium
 *  frame round white melamine, or frosted glass with its green edge; its marker tray; on it by the
 *  seed a flow chart, a bar chart going up, or a to-do list with its ticks, and the ghosts of what
 *  was rubbed out. (Its board's face, front: x 0.22–1.78, y 0.87–1.89, at z 0.516 — for a live
 *  picture, when the whiteboard's drawing comes to boards on the floor.) */
export function mobileWhiteboard(m: Model, o: Look) {
  const glass = o.look === 1;
  const frame = P.alum;
  for (const x of [0.13, 1.87]) {
    m.add(cyl(0.02, 0.02, 1.9, 10), frame, { at: [x, 0.09, 0.5] });
    m.add(ball(0.024, 8), frame, { at: [x, 2.0, 0.5] });
    m.add(box([0.05, 0.04, 0.74], 0.008), shade(frame, 0.85), { at: [x, 0.1, 0.5] });
    for (const z of [0.15, 0.85]) castor(m, x, 0.08, z + (z < 0.5 ? 0.015 : 0));
    // the pivot's knob
    m.add(rod(0.03, 0.03, 0.03, "x", 12), P.plastic, { at: [x + (x < 1 ? 0.035 : -0.035), 1.38, 0.5] });
  }
  m.add(rod(0.014, 0.014, 1.72, "x", 8), frame, { at: [1, 0.3, 0.5] });
  const [x0, x1, y0, y1] = [0.22, 1.78, 0.87, 1.89];
  const Z = 0.5;
  if (glass) {
    m.add(box([x1 - x0 + 0.04, y1 - y0 + 0.04, 0.012]), 0x9fc7b8, { at: [1, (y0 + y1) / 2, Z] });
    m.add(box([x1 - x0 + 0.02, y1 - y0 + 0.02, 0.014]), 0xeef3f0, { at: [1, (y0 + y1) / 2, Z] });
    for (const x of [x0 - 0.035, x1 + 0.035]) m.add(box([0.05, 0.05, 0.04], 0.006), frame, { at: [x, 1.38, Z] });
  } else {
    m.add(box([x1 - x0, y1 - y0, 0.022]), 0xf6f3ea, { at: [1, (y0 + y1) / 2, Z] });
    for (const y of [y0 - 0.013, y1 + 0.013])
      m.add(box([x1 - x0 + 0.052, 0.026, 0.034], 0.004), frame, { at: [1, y, Z] });
    for (const x of [x0 - 0.013, x1 + 0.013])
      m.add(box([0.026, y1 - y0, 0.034], 0.004), frame, { at: [x, (y0 + y1) / 2, Z] });
    for (const [x, y] of [
      [x0 - 0.013, y0 - 0.013],
      [x1 + 0.013, y0 - 0.013],
      [x0 - 0.013, y1 + 0.013],
      [x1 + 0.013, y1 + 0.013],
    ])
      m.add(box([0.04, 0.04, 0.038], 0.006), P.plastic, { at: [x, y, Z] });
  }
  // the tray, the markers, the eraser
  m.add(box([1.1, 0.02, 0.08], 0.004), frame, { at: [1, y0 - 0.04, Z + 0.05] });
  m.add(box([1.1, 0.03, 0.006]), frame, { at: [1, y0 - 0.03, Z + 0.087] });
  for (const [x, c] of [
    [0.6, INK[0]],
    [0.72, INK[1]],
    [0.84, INK[3]],
  ] as const) {
    m.add(rod(0.008, 0.008, 0.11, "x", 8), c, { at: [x, y0 - 0.02, Z + 0.06] });
    m.add(rod(0.0085, 0.0085, 0.025, "x", 8), shade(c, 0.7), { at: [x + 0.065, y0 - 0.02, Z + 0.06] });
  }
  m.add(box([0.16, 0.035, 0.05], 0.006), P.graphite, { at: [1.3, y0 - 0.012, Z + 0.05] });
  m.add(box([0.16, 0.01, 0.05]), 0x8a7a6a, { at: [1.3, y0 - 0.032, Z + 0.05] });
  // what's on it
  const F = Z + (glass ? 0.0075 : 0.0115);
  const s = o.seed;
  // (the ghosts of the rubbed out)
  for (let i = 0; i < 3; i++)
    m.add(box([0.25 + rnd(i, 1, s) * 0.2, 0.06, 0.001]), glass ? 0xe2e9e5 : 0xebe7dc, {
      at: [0.4 + rnd(i, 2, s) * 1.2, 1.0 + rnd(i, 3, s) * 0.7, F - 0.0004],
      rot: [0, 0, (rnd(i, 4, s) - 0.5) * 0.3],
    });
  const pick = Math.floor(s * 3);
  if (pick === 0) {
    // a flow chart: three boxes and a diamond, arrowed
    const B: [number, number, number, number][] = [
      [0.32, 1.6, 0.62, 1.78],
      [0.86, 1.6, 1.16, 1.78],
      [1.4, 1.6, 1.7, 1.78],
    ];
    B.forEach(([a, b, c, d], i) => {
      stroke(m, rect(a, b, c, d), F, INK[i === 1 ? 0 : 1]);
      scrawl(m, a + 0.04, c - 0.04, (b + d) / 2 - 0.004, F + 0.0002, INK[3], s + i);
    });
    for (const [a, c] of [
      [0.62, 0.86],
      [1.16, 1.4],
    ]) {
      stroke(
        m,
        [
          [a + 0.02, 1.69],
          [c - 0.02, 1.69],
        ],
        F,
        INK[3],
      );
      stroke(
        m,
        [
          [c - 0.05, 1.71],
          [c - 0.02, 1.69],
          [c - 0.05, 1.67],
        ],
        F,
        INK[3],
      );
    }
    stroke(
      m,
      [
        [1.01, 1.58],
        [1.01, 1.42],
      ],
      F,
      INK[3],
    );
    stroke(
      m,
      [
        [1.01, 1.4],
        [1.13, 1.3],
        [1.01, 1.2],
        [0.89, 1.3],
        [1.01, 1.4],
      ],
      F,
      INK[2],
    );
    stroke(
      m,
      [
        [1.15, 1.3],
        [1.5, 1.3],
        [1.5, 1.58],
      ],
      F,
      INK[3],
    );
    scrawl(m, 0.36, 0.7, 1.05, F, INK[0], s + 7);
    scrawl(m, 0.36, 0.6, 0.98, F, INK[3], s + 8);
  } else if (pick === 1) {
    // a bar chart going up, its trend line arrowed
    stroke(
      m,
      [
        [0.4, 1.8],
        [0.4, 1.02],
        [1.3, 1.02],
      ],
      F,
      INK[3],
    );
    [0.22, 0.34, 0.31, 0.5, 0.62].forEach((h, i) => {
      const x = 0.5 + i * 0.16;
      stroke(m, rect(x, 1.02, x + 0.1, 1.02 + h), F, INK[1]);
      m.add(box([0.09, h - 0.01, 0.001]), 0xc8d4ec, { at: [x + 0.05, 1.02 + h / 2, F - 0.0002] });
    });
    stroke(
      m,
      [
        [0.52, 1.3],
        [0.7, 1.42],
        [0.86, 1.4],
        [1.02, 1.58],
        [1.2, 1.72],
      ],
      F,
      INK[0],
      0.01,
    );
    stroke(
      m,
      [
        [1.14, 1.73],
        [1.2, 1.72],
        [1.19, 1.66],
      ],
      F,
      INK[0],
      0.01,
    );
    scrawl(m, 0.45, 0.95, 1.85, F, INK[3], s);
    for (let i = 0; i < 3; i++) scrawl(m, 1.42, 1.72, 1.6 - i * 0.08, F, INK[i === 0 ? 2 : 3], s + i);
    stroke(m, rect(1.4, 1.1, 1.72, 1.32), F, INK[2]);
    scrawl(m, 1.44, 1.68, 1.2, F, INK[2], s + 5);
  } else {
    // a to-do list, ticked, and a smiley
    scrawl(m, 0.34, 0.74, 1.8, F, INK[0], s);
    for (let i = 0; i < 5; i++) {
      const y = 1.66 - i * 0.13;
      stroke(m, rect(0.34, y - 0.04, 0.4, y + 0.02), F, INK[3]);
      if (i < 3)
        stroke(
          m,
          [
            [0.335, y - 0.0],
            [0.365, y - 0.04],
            [0.42, y + 0.05],
          ],
          F,
          INK[2],
          0.01,
        );
      scrawl(m, 0.46, 0.8 + rnd(i, 9, s) * 0.35, y - 0.014, F, INK[3], s + i);
    }
    const c: [number, number][] = [];
    for (let i = 0; i <= 16; i++)
      c.push([1.45 + Math.cos((i / 16) * Math.PI * 2) * 0.16, 1.5 + Math.sin((i / 16) * Math.PI * 2) * 0.16]);
    stroke(m, c, F, INK[1]);
    for (const x of [1.39, 1.51]) m.add(box([0.016, 0.03, 0.0015]), INK[1], { at: [x, 1.55, F] });
    const smile: [number, number][] = [];
    for (let i = 0; i <= 6; i++)
      smile.push([
        1.45 + Math.cos(Math.PI + (i / 6) * Math.PI) * 0.09,
        1.45 + Math.sin(Math.PI + (i / 6) * Math.PI) * 0.06,
      ]);
    stroke(m, smile, F, INK[1]);
  }
  // a sticky note or two on its frame
  for (let i = 0; i < 1 + Math.floor(s * 2.99); i++)
    m.add(box([0.075, 0.075, 0.002]), [0xe8c25a, 0xf08a8a, 0x8ad0e0][i], {
      at: [1.55 + i * 0.09, 1.0 + (i % 2) * 0.05, F + 0.002],
      rot: [0, 0, (rnd(i, 5, s) - 0.5) * 0.2],
    });
}

// ── the punch clock (wall, 1×1) ───────────────────────────────────────────────────────────────────
/** A time recorder on the wall between its two card racks: an enamel case, cream or green, its round
 *  head with the clock (its hands live: the time where you are, the second hand sweeping), the card slot with its chrome bezel, the date and time in a
 *  little window, the press bar and the maker's plate; the racks either side, "OUT" and "IN", their
 *  pockets holding the cards — some out, some in, by the seed. */
export function punchClock(m: Model, o: Look) {
  const green = o.look === 1;
  const c = green ? 0x4f6b55 : 0xe2d8bf;
  const trim = P.chrome;
  // the case: its body, a neck, the round head
  m.add(box([0.27, 0.36, 0.17], 0.014, 2), c, { at: [0.5, 1.18, FACE + 0.085] });
  m.add(box([0.25, 0.08, 0.16], 0.01), shade(c, 0.94), { at: [0.5, 1.39, FACE + 0.08] });
  m.add(cyl(0.15, 0.15, 0.16, 28).rotateX(Math.PI / 2), c, { at: [0.5, 1.5, FACE] });
  m.add(ring(0.128, 0.008, 4, 28).rotateX(Math.PI / 2), trim, { at: [0.5, 1.5, FACE + 0.164] });
  m.add(cyl(0.122, 0.122, 0.004, 28).rotateX(Math.PI / 2), P.paperWhite, { at: [0.5, 1.5, FACE + 0.158] });
  const FZ = FACE + 0.163;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    m.add(box([big ? 0.006 : 0.0025, big ? 0.018 : 0.008, 0.001]), P.ink, {
      at: [0.5 + Math.sin(a) * (big ? 0.103 : 0.108), 1.5 + Math.cos(a) * (big ? 0.103 : 0.108), FZ],
      rot: [0, 0, -a],
    });
  }
  m.add(box([0.06, 0.012, 0.001]), green ? 0x4f6b55 : 0x8a2f2a, { at: [0.5, 1.44, FZ] });
  // the hands (live), the cap over their pivot
  const hand = (len: number, w: number, tail: number) => box([w, len + tail, 0.003]).translate(0, (len - tail) / 2, 0);
  const PV: V3 = [0.5, 1.5, FZ + 0.004];
  const hands: [BufferGeometry, number, number, number, number][] = [
    [hand(0.06, 0.012, 0.012), P.ink, 43200, 0, 0],
    [hand(0.09, 0.008, 0.014), P.ink, 3600, 0.003, 0],
    [hand(0.1, 0.003, 0.025), 0xc4402b, 60, 0.006, 0],
  ];
  for (const [g, col, period, dz] of hands)
    m.live(g, col, { kind: "clock", period }, { at: [PV[0], PV[1], PV[2] + dz] });
  m.add(cyl(0.008, 0.008, 0.012, 8).rotateX(Math.PI / 2), P.ink, { at: [0.5, 1.5, FZ + 0.002] });
  // the card slot, the date window, the press bar, the plate
  m.add(box([0.14, 0.03, 0.01], 0.003), trim, { at: [0.5, 1.33, FACE + 0.172] });
  m.add(box([0.11, 0.007, 0.004]), P.ink, { at: [0.5, 1.33, FACE + 0.178] });
  m.add(box([0.13, 0.04, 0.004]), P.ink, { at: [0.5, 1.24, FACE + 0.172] });
  words(m, `${10 + Math.floor(o.seed * 18)} 09`, 0.5, 1.254, FACE + 0.1745, 0.0034, P.cream);
  m.add(box([0.2, 0.04, 0.03], 0.008), trim, { at: [0.5, 1.12, FACE + 0.185] });
  m.add(box([0.16, 0.012, 0.004]), shade(trim, 0.7), { at: [0.5, 1.12, FACE + 0.2] });
  m.add(box([0.09, 0.025, 0.003]), P.brass, { at: [0.5, 1.04, FACE + 0.171] });
  // the racks: OUT on its left, IN on its right
  const r = rng(o.seed);
  for (const [cx, label] of [
    [0.19, "OUT"],
    [0.81, "IN"],
  ] as const) {
    m.add(box([0.25, 0.6, 0.012], 0.003), 0x8d9296, { at: [cx, 1.27, FACE + 0.006] });
    m.add(box([0.12, 0.035, 0.004]), P.ink, { at: [cx, 1.6, FACE + 0.014] });
    words(m, label, cx, 1.612, FACE + 0.0165, 0.0035, P.paperWhite);
    for (let i = 0; i < 7; i++) {
      const y = 1.02 + i * 0.075;
      m.add(box([0.25, 0.05, 0.008]), shade(0x8d9296, 1.1), { at: [cx, y, FACE + 0.03], rot: [-0.35, 0, 0] });
      m.add(box([0.25, 0.008, 0.026]), shade(0x8d9296, 0.9), { at: [cx, y - 0.024, FACE + 0.024] });
      if (r() < 0.55) {
        const lean = -0.35;
        m.add(box([0.18, 0.13, 0.002]), P.cream, { at: [cx, y + 0.045, FACE + 0.022], rot: [lean, 0, 0] });
        m.add(box([0.18, 0.016, 0.0015]), [0xc4402b, 0x3f5f8a, P.olive][Math.floor(r() * 3)], {
          at: [cx, y + 0.1, FACE + 0.0425],
          rot: [lean, 0, 0],
        });
        m.add(box([0.06 + r() * 0.06, 0.004, 0.001]), P.ink, {
          at: [cx - 0.02, y + 0.075, FACE + 0.035],
          rot: [lean, 0, 0],
        });
      }
    }
  }
}

// ── the pneumatic tube station (1×1) ──────────────────────────────────────────────────────────────
/** A floor station of the building's tube post: a cabinet with a sloping desk, the tube rising out of
 *  its back to the ceiling (its joints, its bracket), the dispatch head on the tube with its hinged
 *  hatch, a carrier waiting in its cradle (felt-banded, capped), the floor selector, the send button,
 *  the arrival lamp blinking, a basket for what comes in. Brass on walnut, or steel on grey. */
export function tubeStation(m: Model, o: Look) {
  const steel = o.look === 1;
  const metal = steel ? P.steelLight : P.brass;
  const cab = steel ? 0x7d8a8e : P.walnut;
  const [x0, x1, z0, z1] = [0.2, 0.8, 0.22, 0.74];
  const SLOPE = 0.11;
  const slopeY = (z: number) => 0.985 - (z - z0) * Math.tan(SLOPE);
  // the cabinet, its sloping desk, the plinth
  m.add(box([0.58, 0.06, 0.5]), P.ink, { at: [0.5, 0.03, (z0 + z1) / 2] });
  m.add(box([x1 - x0, 0.86, z1 - z0], 0.008, 2), cab, { at: [0.5, 0.06 + 0.43, (z0 + z1) / 2] });
  // (its desk slopes down to the front: slopeY)
  m.add(
    extrude(
      [
        [z0, 0.9],
        [z1 + 0.02, 0.9],
        [z1 + 0.02, slopeY(z1 + 0.02)],
        [z0, slopeY(z0)],
      ],
      x1 - x0 + 0.02,
      0.004,
    ).rotateY(-Math.PI / 2),
    shade(cab, 1.12),
    { at: [0.5, 0, 0] },
  );
  // its door: a raised panel over a louvred vent (the blower's), the handle
  m.add(box([0.52, 0.56, 0.014], 0.004), shade(cab, 1.06), { at: [0.5, 0.4, z1 + 0.007] });
  m.add(box([0.42, 0.22, 0.008], 0.003), shade(cab, 1.14), { at: [0.5, 0.52, z1 + 0.016] });
  for (let i = 0; i < 6; i++)
    m.add(box([0.4, 0.014, 0.014]), shade(cab, 0.7), { at: [0.5, 0.17 + i * 0.03, z1 + 0.016], rot: [0.5, 0, 0] });
  m.add(box([0.018, 0.1, 0.02], 0.004), metal, { at: [0.7, 0.4, z1 + 0.024] });
  // the tube: up from the cabinet's back to the ceiling
  const TX = 0.5;
  const TZ = 0.33;
  m.add(cyl(0.062, 0.062, CEILING - 0.98, 16), metal, { at: [TX, 0.98, TZ] });
  for (const y of [1.0, 1.95, 2.6]) m.add(cyl(0.074, 0.074, 0.04, 16), shade(metal, 0.85), { at: [TX, y, TZ] });
  m.add(cyl(0.12, 0.12, 0.03, 16), shade(metal, 0.8), { at: [TX, CEILING - 0.03, TZ] });
  m.add(box([0.05, 0.03, TZ - 0.02]), shade(metal, 0.8), { at: [TX, 2.25, TZ / 2 + 0.01] });
  m.add(ring(0.066, 0.01, 4, 16), shade(metal, 0.8), { at: [TX, 2.25, TZ] });
  // the dispatch head: a wider barrel, its hatch, the latch, a little window
  m.add(cyl(0.1, 0.1, 0.36, 18), metal, { at: [TX, 1.18, TZ] });
  for (const y of [1.18, 1.54]) m.add(cyl(0.108, 0.108, 0.02, 18), shade(metal, 0.82), { at: [TX, y - 0.01, TZ] });
  // (its mouth, tipped toward you, where a carrier goes in: a flared lip, dark inside)
  const MY = 1.36;
  const tipM: V3 = [1.0, 0, 0];
  m.add(cyl(0.07, 0.07, 0.17, 16), metal, { at: [TX, MY, TZ + 0.04], rot: tipM });
  m.add(cyl(0.07, 0.085, 0.03, 16).translate(0, 0.17, 0), shade(metal, 1.1), { at: [TX, MY, TZ + 0.04], rot: tipM });
  m.add(cyl(0.062, 0.062, 0.004, 16).translate(0, 0.198, 0), 0x1a1d1c, { at: [TX, MY, TZ + 0.04], rot: tipM });
  m.add(box([0.1, 0.03, 0.002]), P.paperWhite, { at: [TX, 1.25, TZ + 0.101] });
  words(m, "SEND", TX, 1.262, TZ + 0.1025, 0.0032, P.ink);
  // the carrier in its cradle on the desk
  const CZ = 0.6;
  const CY = slopeY(CZ) + 0.02;
  for (const x of [0.36, 0.64]) m.add(box([0.03, 0.05, 0.08], 0.004), shade(metal, 0.8), { at: [x, CY - 0.0, CZ] });
  m.add(rod(0.042, 0.042, 0.24, "x", 14), 0xcfe0e6, { at: [0.5, CY + 0.025, CZ] });
  for (const s of [-1, 1]) {
    m.add(rod(0.045, 0.045, 0.03, "x", 14), metal, { at: [0.5 + s * 0.13, CY + 0.025, CZ] });
    m.add(rod(0.047, 0.047, 0.016, "x", 14), 0x8a2f2a, { at: [0.5 + s * 0.095, CY + 0.025, CZ] });
  }
  m.add(box([0.1, 0.04, 0.002]), P.paperWhite, { at: [0.5, CY + 0.025, CZ + 0.043] });
  // the selector: a brass plate, its numbers round a pointer; the send button; the lamp
  const SZ = 0.42;
  const SY = slopeY(SZ);
  const tip: V3 = [SLOPE, 0, 0];
  m.add(cyl(0.065, 0.065, 0.01, 18), shade(metal, 0.9), { at: [0.68, SY, SZ], rot: tip });
  for (let i = 0; i < 6; i++) {
    const a = -1.2 + i * 0.48;
    m.add(box([0.008, 0.006, 0.016]).translate(Math.sin(a) * 0.05, 0.012, -Math.cos(a) * 0.05), P.ink, {
      at: [0.68, SY, SZ],
      rot: tip,
    });
  }
  const pick = -1.2 + Math.floor(o.seed * 6) * 0.48;
  m.add(
    box([0.012, 0.012, 0.05])
      .rotateY(pick)
      .translate(Math.sin(pick) * 0.02, 0.016, -Math.cos(pick) * 0.02),
    P.ink,
    { at: [0.68, SY, SZ], rot: tip },
  );
  m.add(cyl(0.024, 0.024, 0.016, 12), shade(metal, 0.8), { at: [0.3, slopeY(0.44), 0.44], rot: tip });
  m.add(cyl(0.017, 0.017, 0.022, 12), 0xc4402b, { at: [0.3, slopeY(0.44) + 0.004, 0.44], rot: tip });
  m.add(cyl(0.016, 0.016, 0.012, 10), 0x2b2a28, { at: [0.3, slopeY(0.34), 0.34], rot: tip });
  m.live(
    ball(0.014, 8),
    0x7fe08a,
    { kind: "blink", period: 1.6, on: 0.5, phase: o.seed },
    {
      at: [0.3, slopeY(0.34) + 0.014, 0.34],
      glow: true,
    },
  );
  // the basket for what comes in, on the cabinet's front
  // (a wire tray: its rim, its bars, hung on two hooks)
  const wire = steel ? P.chrome : shade(P.brass, 0.85);
  for (const [y, z] of [
    [0.84, z1 + 0.09],
    [0.73, z1 + 0.085],
  ])
    m.add(rod(0.005, 0.005, 0.36, "x", 4), wire, { at: [0.5, y, z] });
  for (let i = 0; i <= 8; i++) {
    const x = 0.32 + i * 0.045;
    m.add(box([0.006, 0.11, 0.006]), wire, { at: [x, 0.785, z1 + 0.088] });
    m.add(box([0.006, 0.006, 0.085]), wire, { at: [x, 0.73, z1 + 0.045] });
  }
  for (const x of [0.32, 0.68]) m.add(box([0.006, 0.11, 0.085]), wire, { at: [x, 0.785, z1 + 0.045] });
  if (o.seed > 0.4) m.add(rod(0.04, 0.04, 0.24, "x", 12), 0xcfe0e6, { at: [0.5, 0.775, z1 + 0.045] });
  // a brass plate: what floor this is
  m.add(box([0.14, 0.04, 0.004]), metal, { at: [0.5, 0.86, z1 + 0.002] });
}

// ── the paper shredder (1×1) ─────────────────────────────────────────────────────────────────────
/** A bin with its cutting head on top: the feed slot, the switch, the ready light; through its window
 *  the strips piling up; a sheet half fed in, by the seed. */
export function paperShredder(m: Model, o: Look) {
  const H = 0.62;
  const [x0, x1, z0, z1] = [0.29, 0.71, 0.34, 0.66];
  m.add(box([x1 - x0, H - 0.14, z1 - z0], 0.014, 2), P.graphite, { at: [0.5, (H - 0.14) / 2, 0.5] });
  m.add(box([0.36, 0.28, 0.004]), 0x1a1d1c, { at: [0.5, 0.25, z1 + 0.001] });
  // the strips behind its window, piled
  for (let i = 0; i < 26; i++) {
    const x = 0.34 + rnd(i, 1, o.seed) * 0.32;
    const h = 0.04 + rnd(i, 2, o.seed) * 0.14;
    m.add(box([0.006, h, 0.002]), [P.paperWhite, P.cream, 0xd8e0d0][i % 3], {
      at: [x, 0.13 + h / 2, z1 + 0.0035],
      rot: [0, 0, (rnd(i, 3, o.seed) - 0.5) * 0.5],
    });
  }
  m.add(box([0.38, 0.02, 0.006]), P.graphite, { at: [0.5, 0.11, z1 + 0.003] });
  m.add(box([0.38, 0.02, 0.006]), P.graphite, { at: [0.5, 0.39, z1 + 0.003] });
  m.add(box([0.12, 0.025, 0.012], 0.004), P.plastic, { at: [0.5, 0.44, z1 + 0.004] });
  // the head
  m.add(box([0.44, 0.14, 0.34], 0.02, 2), 0x2b2c30, { at: [0.5, H - 0.07, 0.5] });
  m.add(box([0.3, 0.008, 0.012]), P.ink, { at: [0.5, H + 0.001, 0.47] });
  m.add(box([0.32, 0.004, 0.03]), shade(0x2b2c30, 1.3), { at: [0.5, H - 0.002, 0.47] });
  m.add(box([0.05, 0.016, 0.03], 0.004), P.chrome, { at: [0.64, H + 0.002, 0.58] });
  m.add(box([0.012, 0.004, 0.012]), P.ledGreen, { at: [0.36, H + 0.001, 0.58], glow: true });
  for (let i = 0; i < 4; i++) m.add(box([0.06, 0.004, 0.006]), P.ink, { at: [0.5, H - 0.04 - i * 0.02, z1 + 0.012] });
  // a sheet going in: a letter, or a page of figures, by the seed
  const tilt: V3 = [0.1, 0, (o.seed - 0.5) * 0.12];
  m.add(box([0.21, 0.14, 0.002]), o.seed > 0.6 ? 0xf4f0e2 : P.paperWhite, { at: [0.5, H + 0.07, 0.47], rot: tilt });
  for (let i = 0; i < 4; i++)
    m.add(
      box([o.seed > 0.6 ? 0.14 : 0.04, 0.004, 0.001]).translate(
        o.seed > 0.6 ? -0.02 : -0.06 + (i % 2) * 0.08,
        0.04 - i * 0.02,
        0.0016,
      ),
      0x9a9a9a,
      {
        at: [0.5, H + 0.07, 0.47],
        rot: tilt,
      },
    );
}

// ── the plotter (2×1) ────────────────────────────────────────────────────────────────────────────
/** A wide-format plotter on its stand: the long body with its window over the carriage, the roll at
 *  its back, the panel's screen lit at its end, a print coming out and curling down into the cloth
 *  basket between its legs — a blueprint, a map or a poster, by the seed; the carriage's light
 *  blinking. */
export function plotter(m: Model, o: Look) {
  const B = 0.86;
  // the stand: two legs on T-feet with castors, a cross bar
  for (const x of [0.22, 1.78]) {
    m.add(box([0.06, B - 0.1, 0.06], 0.006), P.graphite, { at: [x, 0.08 + (B - 0.1) / 2, 0.46] });
    m.add(box([0.07, 0.04, 0.6], 0.008), P.graphite, { at: [x, 0.1, 0.46] });
    for (const z of [0.2, 0.72]) castor(m, x, 0.08, z + 0.015);
  }
  m.add(box([1.56, 0.05, 0.05], 0.006), P.graphite, { at: [1, 0.4, 0.36] });
  // the body
  m.add(box([1.8, 0.24, 0.34], 0.03, 2), 0xe6e4de, { at: [1, B + 0.12, 0.46] });
  m.add(box([1.5, 0.05, 0.3], 0.01), P.graphite, { at: [1, B + 0.24, 0.46] });
  m.add(box([1.4, 0.035, 0.2]), 0x2a3236, { at: [1, B + 0.262, 0.47] });
  // the carriage under its window, its light (live)
  const cx = 0.4 + o.seed * 1.0;
  m.add(box([0.1, 0.03, 0.1], 0.006), 0x3f5f8a, { at: [cx, B + 0.268, 0.47] });
  m.live(
    box([0.012, 0.006, 0.012]),
    0x7fe08a,
    { kind: "blink", period: 0.8, on: 0.5, phase: 0 },
    { at: [cx, B + 0.287, 0.5], glow: true },
  );
  // the roll behind
  m.add(rod(0.06, 0.06, 1.66, "x", 16), P.paperWhite, { at: [1, B + 0.14, 0.24] });
  for (const x of [0.12, 1.88]) m.add(rod(0.07, 0.07, 0.04, "x", 12), P.graphite, { at: [x, B + 0.14, 0.24] });
  // its panel at the right-hand end
  m.add(box([0.22, 0.1, 0.02], 0.006), P.plastic, { at: [1.72, B + 0.2, 0.635], rot: [-0.3, 0, 0] });
  m.add(box([0.12, 0.06, 0.002]), 0x7fb0d0, { at: [1.69, B + 0.203, 0.646], rot: [-0.3, 0, 0], glow: true });
  for (let i = 0; i < 3; i++)
    m.add(box([0.016, 0.012, 0.006]), P.alum, { at: [1.79, B + 0.23 - i * 0.022, 0.646], rot: [-0.3, 0, 0] });
  m.add(box([1.5, 0.012, 0.012]), P.ink, { at: [0.94, B + 0.04, 0.635] });
  // the print, out of its front and curling down into the basket
  const pick = Math.floor(o.seed * 3);
  const paper = pick === 0 ? 0x2f5f9a : P.paperWhite;
  const PX = 0.9;
  const PW = 0.9;
  const pts: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 1.15;
    pts.push([0, B + 0.03 - Math.sin(a) * 0.32, 0.64 + (1 - Math.cos(a)) * 0.08 + i * 0.002]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [, ay, az] = pts[i];
    const [, by, bz] = pts[i + 1];
    const len = Math.hypot(by - ay, bz - az);
    const rot: V3 = [Math.atan2(bz - az, by - ay), 0, 0];
    const at: V3 = [PX, (ay + by) / 2, (az + bz) / 2];
    // (the sheet's face toward the room: its local −z where it's turned past a quarter)
    const out = Math.cos(rot[0]) < 0 ? -1 : 1;
    m.add(box([PW, len + 0.004, 0.003]), paper, { at, rot });
    // what's drawn on it, a hair out from its sheet toward the room
    if (pick === 0)
      for (let k = 0; k < 4; k++)
        m.add(
          box([0.12 + rnd(i, k, o.seed) * 0.4, 0.004, 0.001]).translate(-0.3 + rnd(k, i, o.seed) * 0.5, 0, out * 0.002),
          0xdce8f4,
          { at, rot },
        );
    else
      for (let k = 0; k < 3; k++)
        m.add(
          box([0.1 + rnd(i, k, o.seed) * 0.16, len * 0.8, 0.001]).translate(-0.3 + k * 0.28, 0, out * 0.002),
          pick === 1 ? [0x8fb07a, 0x7aa0c8, 0xd9c49a][k] : [0xc4402b, 0xe8c25a, 0x2f4a8a][k],
          { at, rot },
        );
  }
  // the cloth basket
  m.add(
    tube(
      [
        [0.25, 0.62, 0.72],
        [1.0, 0.5, 0.82],
        [1.75, 0.62, 0.72],
      ],
      0.008,
      4,
      10,
    ),
    P.graphite,
  );
  m.add(
    tube(
      [
        [0.25, 0.62, 0.36],
        [1.0, 0.5, 0.34],
        [1.75, 0.62, 0.36],
      ],
      0.008,
      4,
      10,
    ),
    P.graphite,
  );
  for (let i = 0; i < 10; i++) {
    const x = 0.27 + i * 0.163;
    m.add(
      tube(
        [
          [x, 0.6, 0.36],
          [x, 0.32, 0.55],
          [x, 0.6, 0.76],
        ],
        0.004,
        3,
        6,
      ),
      0x3a3d42,
    );
  }
  m.add(cushion([1.46, 0.02, 0.32], 0.1, 1).rotateX(0).translate(1, 0.35, 0.55), 0x3a3d42);
}

// ── the glass-door drinks fridge (1×1) ───────────────────────────────────────────────────────────
/** A tall cooler: a lit header, a glass door (see-through) on shelves of cans and bottles in their
 *  colours (by the seed), lit from inside, its handle, the vent grille at its foot. Gives a cold drink
 *  (catalog interact "vending"). */
export function drinksFridge(m: Model, o: Look) {
  const black = o.look === 1;
  const c = black ? 0x232427 : 0xb7bbbe;
  const [x0, x1, z0, z1] = [0.2, 0.8, 0.18, 0.78];
  const H = 1.96;
  // its shell, open at the front behind the door: the sides, back, top and foot
  for (const x of [x0 + 0.025, x1 - 0.025]) m.add(box([0.05, H, z1 - z0], 0.01), c, { at: [x, H / 2, (z0 + z1) / 2] });
  m.add(box([x1 - x0, H, 0.05], 0.01), c, { at: [0.5, H / 2, z0 + 0.025] });
  m.add(box([x1 - x0, 0.24, z1 - z0], 0.012, 2), c, { at: [0.5, H - 0.12, (z0 + z1) / 2] });
  m.add(box([x1 - x0, 0.22, z1 - z0], 0.01), c, { at: [0.5, 0.11, (z0 + z1) / 2] });
  // the lit inside: its back and walls, the light strip, five shelves
  m.add(box([0.5, 1.48, 0.01]), 0xe8f2ff, { at: [0.5, 0.97, z0 + 0.06], glow: true });
  for (const x of [0.253, 0.747]) m.add(box([0.006, 1.48, 0.46]), 0xdbe6f0, { at: [x, 0.97, 0.5] });
  m.add(box([0.48, 0.01, 0.02]), 0xf4f8ff, { at: [0.5, 1.7, z1 - 0.06], glow: true });
  const shelves = [0.26, 0.55, 0.84, 1.13, 1.42];
  for (const y of shelves) {
    m.add(box([0.48, 0.008, 0.44]), P.steelLight, { at: [0.5, y - 0.004, 0.48] });
    m.add(box([0.48, 0.03, 0.008]), P.chrome, { at: [0.5, y + 0.01, z1 - 0.06] });
    m.add(box([0.44, 0.012, 0.0015]), [0xe8c25a, 0xc4402b, 0x7fe08a][Math.floor(y * 10) % 3], {
      at: [0.5, y + 0.01, z1 - 0.0555],
    });
  }
  // what's in it: a row of cans or bottles on each shelf, another behind
  const CANS = [0xc4402b, 0x2f6a3d, 0x2f4a8a, 0xe8c25a, 0xe6e4de, 0xd9734a, 0x6a4a7a, 0x2b2a28];
  const r = rng(o.seed);
  for (const [k, y] of shelves.entries()) {
    const bottles = k < 2 ? r() < 0.7 : r() < 0.25;
    const c1 = CANS[Math.floor(r() * CANS.length)];
    const c2 = CANS[Math.floor(r() * CANS.length)];
    const n = bottles ? 6 : 7;
    for (const [row, z] of [
      [0, 0.6],
      [1, 0.48],
    ] as const)
      for (let i = 0; i < n; i++) {
        if (row === 0 && r() < 0.12) continue;
        const x = 0.29 + (i * 0.42) / (n - 1);
        const cc = i < n / 2 ? c1 : c2;
        if (bottles) {
          m.add(
            lathe(
              [
                [0, 0],
                [0.028, 0],
                [0.03, 0.14],
                [0.012, 0.2],
                [0.011, 0.23],
                [0, 0.23],
              ],
              8,
            ),
            row ? shade(cc, 0.8) : cc,
            { at: [x, y, z] },
          );
          if (!row) m.add(cyl(0.031, 0.031, 0.05, 8), P.paperWhite, { at: [x, y + 0.06, z] });
        } else {
          m.add(cyl(0.031, 0.031, 0.12, row ? 6 : 8), row ? shade(cc, 0.8) : cc, { at: [x, y, z] });
          if (!row) m.add(cyl(0.026, 0.026, 0.008, 8), P.chrome, { at: [x, y + 0.12, z] });
          if (!row) m.add(cyl(0.0315, 0.0315, 0.02, 8), P.paperWhite, { at: [x, y + 0.05, z] });
        }
      }
  }
  // the header, its words lit
  m.add(box([0.58, 0.2, 0.012]), black ? 0xb8382a : 0x2f4a8a, { at: [0.5, 1.83, z1 + 0.006], glow: true });
  words(m, "COLD", 0.5, 1.88, z1 + 0.0125, 0.0105, P.paperWhite, true);
  m.add(box([0.4, 0.012, 0.002]), P.paperWhite, { at: [0.5, 1.765, z1 + 0.013], glow: true });
  // the door's frame round its glass, the handle
  for (const x of [x0 + 0.022, x1 - 0.022])
    m.add(box([0.044, 1.52, 0.03], 0.006), shade(c, 1.1), { at: [x, 0.97, z1 + 0.015] });
  for (const y of [0.2, 1.72]) m.add(box([0.6, 0.044, 0.03], 0.006), shade(c, 1.1), { at: [0.5, y, z1 + 0.015] });
  m.add(box([0.024, 0.6, 0.03], 0.006), P.chrome, { at: [x1 - 0.045, 1.0, z1 + 0.05] });
  for (const y of [0.72, 1.28]) m.add(box([0.016, 0.02, 0.03]), P.chrome, { at: [x1 - 0.045, y, z1 + 0.03] });
  // the grille at its foot
  m.add(box([0.58, 0.15, 0.006]), P.ink, { at: [0.5, 0.09, z1 + 0.003] });
  for (let i = 0; i < 6; i++)
    m.add(box([0.54, 0.008, 0.008]), shade(c, 0.9), { at: [0.5, 0.035 + i * 0.022, z1 + 0.007] });
  // the glass
  m.live(box([0.5, 1.48, 0.006]).translate(0.5, 0.97, z1 + 0.012), 0xcfe6f4, { kind: "still" }, { glass: true });
}

// ── the security desk (2×1) ───────────────────────────────────────────────────────────────────────
/** One camera's view on a monitor, glowing: a corridor, the car park, the lobby, the snow outside, a
 *  stairwell, a door — drawn in the screen's own tint, the time stamped over it, REC in a corner. */
function camView(m: Model, x: number, y: number, z: number, w: number, h: number, view: number, tint: number) {
  const base = shade(tint, 0.55);
  const lite = shade(tint, 1.15);
  const mid = shade(tint, 0.85);
  const g = (cx: number, cy: number, ww: number, hh: number, c: number, rot = 0) =>
    m.add(box([ww * w, hh * h, 0.001]), c, { at: [x + cx * w, y + cy * h, z + 0.0006], rot: [0, 0, rot], glow: true });
  m.add(box([w, h, 0.002]), base, { at: [x, y, z], glow: true });
  switch (view % 6) {
    case 0: // a corridor going away, its door at the end, a light over it
      g(0, -0.3, 0.9, 0.35, mid);
      for (const s of [-1, 1]) g(s * 0.32, 0.05, 0.3, 0.9, shade(tint, 0.7), s * 0.35);
      g(0, 0.02, 0.18, 0.34, lite);
      g(0, 0.36, 0.3, 0.05, lite);
      break;
    case 1: // the car park: its lines, two cars
      g(0, -0.2, 1, 0.55, mid);
      for (let i = 0; i < 5; i++) g(-0.4 + i * 0.2, -0.22, 0.02, 0.4, lite, 0.3);
      g(-0.3, -0.1, 0.22, 0.14, shade(tint, 0.4));
      g(0.12, -0.12, 0.22, 0.14, shade(tint, 0.4));
      g(0.3, 0.3, 0.08, 0.3, lite);
      break;
    case 2: // the lobby: its desk, a plant, someone crossing
      g(0, -0.32, 1, 0.3, mid);
      g(-0.2, -0.12, 0.5, 0.18, lite);
      g(0.32, -0.05, 0.12, 0.35, shade(tint, 0.7));
      g(0.12, -0.04, 0.05, 0.3, shade(tint, 0.3));
      g(0.12, 0.15, 0.06, 0.06, shade(tint, 0.3));
      break;
    case 3: // the snow out front: the ground white, a fir, a lamp post
      g(0, -0.25, 1, 0.48, shade(tint, 1.3));
      g(-0.25, 0.0, 0.16, 0.36, shade(tint, 0.35), 0);
      g(-0.25, 0.2, 0.08, 0.16, shade(tint, 0.35));
      g(0.3, 0.05, 0.02, 0.6, shade(tint, 0.35));
      g(0.33, 0.34, 0.08, 0.04, lite);
      break;
    case 4: // a stairwell: steps going up
      for (let i = 0; i < 6; i++) g(-0.3 + i * 0.1, -0.38 + i * 0.12, 0.5, 0.06, i % 2 ? mid : lite);
      g(0.38, 0.1, 0.04, 0.8, shade(tint, 0.7));
      break;
    default: // a door at the back of a room, a chair
      g(0, -0.3, 1, 0.35, mid);
      g(0.15, 0.05, 0.22, 0.6, lite);
      g(0.21, 0.05, 0.02, 0.02, shade(tint, 0.4));
      g(-0.25, -0.18, 0.14, 0.16, shade(tint, 0.4));
  }
  // the time stamped on it, REC
  g(-0.28, 0.42, 0.36, 0.05, shade(tint, 1.5));
}

/** A guard's desk: a long top (things stand on its front, at SURFACE), a pedestal of drawers, its
 *  modesty panel; behind, six camera monitors in two rows on their frame, each a view of somewhere
 *  in the building (glowing), REC lit on each, blinking; the camera keyboard with its joystick, a
 *  phone, a radio in its charger, the logbook open. */
export function securityDesk(m: Model, o: Look) {
  const T = SURFACE.security_desk;
  const top = 0x8d8a82;
  m.add(box([1.9, 0.035, 0.9], 0.006, 2), top, { at: [1, T - 0.0175, 0.5] });
  m.add(box([1.92, 0.01, 0.92]), shade(top, 0.7), { at: [1, T - 0.036, 0.5] });
  m.add(box([1.86, T - 0.24, 0.02]), P.graphite, { at: [1, 0.2 + (T - 0.24) / 2, 0.08] });
  // a pedestal of three drawers on its left, a panel leg on its right
  m.add(box([0.44, T - 0.05, 0.84], 0.006), P.graphite, { at: [0.29, (T - 0.05) / 2, 0.5] });
  for (let i = 0; i < 3; i++) {
    const y = 0.13 + i * 0.22;
    m.add(box([0.4, 0.2, 0.016], 0.004), shade(P.graphite, 1.2), { at: [0.29, y, 0.92] });
    m.add(box([0.14, 0.016, 0.02], 0.004), P.chrome, { at: [0.29, y + 0.06, 0.935] });
  }
  m.add(box([0.04, T - 0.05, 0.84], 0.006), P.graphite, { at: [1.92, (T - 0.05) / 2, 0.5] });
  // the monitors' frame and the six of them
  for (const x of [0.3, 1.7]) m.add(box([0.04, 0.68, 0.04]), P.steel, { at: [x, T + 0.34, 0.22] });
  m.add(box([1.4, 0.04, 0.04]), P.steel, { at: [1, T + 0.36, 0.22] });
  m.add(box([1.4, 0.04, 0.04]), P.steel, { at: [1, T + 0.66, 0.22] });
  for (const x of [0.3, 1.7]) m.add(box([0.12, 0.02, 0.24]), P.steel, { at: [x, T + 0.01, 0.22] });
  const r = rng(o.seed);
  const order = [0, 1, 2, 3, 4, 5].sort(() => r() - 0.5);
  const TINTS = [0x6a9a8a, 0x7a8ea0, 0x8aa07a, 0x6a8aa0, 0x90a0a8, 0x7a9a94];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 3; i++) {
      const k = row * 3 + i;
      const x = 0.55 + i * 0.45;
      const y = T + 0.22 + row * 0.3;
      m.add(box([0.43, 0.28, 0.05], 0.008), P.plastic, { at: [x, y, 0.26] });
      m.add(box([0.12, 0.08, 0.06], 0.004), P.plastic, { at: [x, y, 0.21] });
      camView(m, x, y + 0.005, 0.2865, 0.39, 0.24, order[k], TINTS[k]);
      m.live(
        box([0.012, 0.012, 0.001]),
        0xff4a3a,
        { kind: "blink", period: 1.2, on: 0.55, phase: k * 0.17 },
        {
          at: [x + 0.165, y + 0.105, 0.2875],
          glow: true,
        },
      );
      m.add(box([0.012, 0.008, 0.002]), P.ledGreen, { at: [x + 0.18, y - 0.13, 0.286], glow: true });
    }
  // the camera keyboard and its joystick, behind the free front of the top
  m.add(box([0.44, 0.03, 0.16], 0.008), P.plastic, { at: [1, T + 0.015, 0.43], rot: [0.08, 0, 0] });
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      m.add(box([0.03, 0.008, 0.025]), P.alum, { at: [0.85 + i * 0.04, T + 0.033, 0.39 + j * 0.035] });
  m.add(cyl(0.03, 0.03, 0.012, 12), P.steel, { at: [1.13, T + 0.03, 0.43] });
  m.add(cyl(0.01, 0.012, 0.09, 8), P.ink, { at: [1.13, T + 0.04, 0.43], rot: [0.15, 0, 0.1] });
  m.add(ball(0.02, 8), 0xc4402b, { at: [1.14, T + 0.13, 0.443] });
  // the phone, the radio in its charger, the logbook (on the back of the top)
  m.add(box([0.18, 0.05, 0.2], 0.012), P.plastic, { at: [0.2, T + 0.025, 0.36] });
  m.add(box([0.2, 0.04, 0.05], 0.014), P.plastic, { at: [0.2, T + 0.065, 0.33] });
  m.add(box([0.07, 0.02, 0.07], 0.004), P.ink, { at: [1.55, T + 0.01, 0.4] });
  m.add(box([0.05, 0.13, 0.03], 0.008), 0x2b2c30, { at: [1.55, T + 0.08, 0.4] });
  m.add(cyl(0.004, 0.004, 0.08, 6), P.ink, { at: [1.565, T + 0.14, 0.4] });
  m.add(box([0.012, 0.006, 0.004]), 0xff4a3a, { at: [1.54, T + 0.13, 0.417], glow: true });
  m.add(box([0.22, 0.015, 0.16], 0.003), 0x2f4a6a, { at: [1.75, T + 0.008, 0.38], rot: [0, 0.15, 0] });
  m.add(box([0.2, 0.004, 0.15]), P.paperWhite, { at: [1.75, T + 0.017, 0.38], rot: [0, 0.15, 0] });
  for (let i = 0; i < 5; i++)
    m.add(box([0.12, 0.001, 0.003]), P.ink, { at: [1.75, T + 0.02, 0.33 + i * 0.022], rot: [0, 0.15, 0] });
}

// ── the fire extinguisher (wall, 1×1) ────────────────────────────────────────────────────────────
/** A red extinguisher on its wall bracket under its sign: foam (a cream band, its gauge, a hose
 *  clipped down its side) or CO₂ (a black band, its horn on a swivel); the squeeze handle, the pin and
 *  its tag. */
export function fireExtinguisher(m: Model, o: Look) {
  const co2 = o.look === 1;
  const RED = 0xc4302b;
  const X = 0.5;
  const Z = FACE + 0.12;
  // the sign over it
  const SY = 1.42;
  m.add(box([0.22, 0.22, 0.006]), RED, { at: [X, SY, FACE + 0.003] });
  m.add(box([0.2, 0.2, 0.002]), P.paperWhite, { at: [X, SY, FACE + 0.007] });
  m.add(box([0.18, 0.18, 0.002]), RED, { at: [X, SY, FACE + 0.009] });
  // (its picture: a flame by an extinguisher)
  m.add(
    extrude(
      [
        [0, 0.06],
        [0.03, 0.0],
        [0.025, -0.05],
        [-0.025, -0.05],
        [-0.035, 0.0],
        [-0.01, 0.02],
      ],
      0.002,
    ),
    P.paperWhite,
    { at: [X + 0.035, SY - 0.01, FACE + 0.011] },
  );
  m.add(box([0.04, 0.09, 0.002]), P.paperWhite, { at: [X - 0.04, SY - 0.02, FACE + 0.011] });
  m.add(box([0.02, 0.02, 0.002]), P.paperWhite, { at: [X - 0.04, SY + 0.04, FACE + 0.011] });
  // the bracket
  m.add(box([0.1, 0.16, 0.012]), P.steel, { at: [X, 1.06, FACE + 0.006] });
  m.add(box([0.06, 0.03, 0.06]), P.steel, { at: [X, 1.1, FACE + 0.035] });
  m.add(ring(0.092, 0.008, 4, 16), P.steel, { at: [X, 0.84, Z] });
  // the cylinder
  m.add(
    lathe(
      [
        [0, 0.55],
        [0.03, 0.55],
        [0.07, 0.56],
        [0.085, 0.6],
        [0.087, 0.9],
        [0.085, 1.04],
        [0.07, 1.09],
        [0.03, 1.11],
        [0, 1.11],
      ].map(([r, y]) => [r, y - 0.55] as [number, number]),
      18,
    ),
    RED,
    { at: [X, 0.55, Z] },
  );
  m.add(cyl(0.088, 0.088, 0.1, 18), co2 ? P.ink : P.cream, { at: [X, 0.88, Z] });
  m.add(box([0.06, 0.05, 0.002]), co2 ? P.paperWhite : RED, { at: [X, 0.93, Z + 0.088] });
  m.add(box([0.05, 0.004, 0.002]), co2 ? P.ink : P.paperWhite, { at: [X, 0.92, Z + 0.0895] });
  // the head: the valve, the handles, the pin and its tag, a gauge
  m.add(cyl(0.022, 0.026, 0.06, 10), P.ink, { at: [X, 1.1, Z] });
  m.add(box([0.03, 0.025, 0.14], 0.004), P.ink, { at: [X, 1.155, Z + 0.03], rot: [-0.12, 0, 0] });
  m.add(box([0.028, 0.02, 0.13], 0.004), P.ink, { at: [X, 1.19, Z + 0.035], rot: [-0.35, 0, 0] });
  m.add(ring(0.014, 0.003, 3, 10).rotateZ(Math.PI / 2), 0xe8c25a, { at: [X + 0.02, 1.165, Z + 0.0] });
  m.add(box([0.002, 0.03, 0.02]), 0xe8c25a, { at: [X + 0.03, 1.14, Z] });
  if (!co2) m.add(rod(0.018, 0.018, 0.012, "x", 12), P.paperWhite, { at: [X - 0.032, 1.12, Z] });
  // the hose clipped down its side, or the horn
  if (co2) {
    m.add(
      tube(
        [
          [X, 1.12, Z - 0.02],
          [X - 0.08, 1.1, Z - 0.03],
          [X - 0.11, 0.98, Z - 0.02],
        ],
        0.012,
        6,
        8,
      ),
      P.ink,
    );
    m.add(cyl(0.014, 0.045, 0.24, 12).rotateZ(Math.PI), P.ink, { at: [X - 0.11, 0.98, Z - 0.02] });
  } else {
    m.add(
      tube(
        [
          [X + 0.02, 1.11, Z + 0.01],
          [X + 0.09, 1.07, Z + 0.02],
          [X + 0.095, 0.85, Z + 0.03],
          [X + 0.092, 0.66, Z + 0.03],
        ],
        0.009,
        6,
        12,
      ),
      P.ink,
    );
    m.add(cyl(0.012, 0.009, 0.06, 8), P.ink, { at: [X + 0.092, 0.62, Z + 0.03] });
    m.add(box([0.03, 0.012, 0.012]), P.steel, { at: [X + 0.08, 0.7, Z + 0.03] });
  }
}

// ── the first-aid cabinet (wall, 1×1) ────────────────────────────────────────────────────────────
/** A steel box on the wall, white with its green cross or green with a white one, its words over the
 *  cross, the latch, the hinge down its side; by the seed its inspection tag hung on the latch. */
export function firstAidCabinet(m: Model, o: Look) {
  const green = o.look === 1;
  const body = green ? 0x2f8a4f : P.paperWhite;
  const mark = green ? P.paperWhite : 0x2f8a4f;
  const [x0, x1, y0, y1] = [0.26, 0.74, 1.18, 1.64];
  m.add(box([x1 - x0, y1 - y0, 0.13], 0.012, 2), shade(body, 0.92), { at: [0.5, (y0 + y1) / 2, FACE + 0.065] });
  m.add(box([x1 - x0 - 0.02, y1 - y0 - 0.02, 0.02], 0.006), body, { at: [0.5, (y0 + y1) / 2, FACE + 0.135] });
  const S = FACE + 0.146;
  m.add(box([0.16, 0.05, 0.002]), mark, { at: [0.5, 1.39, S] });
  m.add(box([0.05, 0.16, 0.002]), mark, { at: [0.5, 1.39, S] });
  words(m, "FIRST AID", 0.5, 1.6, S + 0.0005, 0.0042, mark);
  m.add(box([0.3, 0.01, 0.0015]), mark, { at: [0.5, 1.255, S] });
  // the latch, the hinge
  m.add(box([0.03, 0.05, 0.016], 0.004), P.chrome, { at: [x1 - 0.04, 1.39, S + 0.008] });
  m.add(box([0.012, y1 - y0 - 0.06, 0.012]), P.chrome, { at: [x0 + 0.004, (y0 + y1) / 2, FACE + 0.14] });
  if (o.seed > 0.35) {
    m.add(rod(0.0015, 0.0015, 0.05, "z", 4).rotateX(Math.PI / 2), P.ink, { at: [x1 - 0.04, 1.34, S + 0.017] });
    m.add(box([0.04, 0.06, 0.002]), 0xe8c25a, { at: [x1 - 0.04, 1.29, S + 0.017], rot: [0, 0, 0.12] });
    m.add(box([0.03, 0.003, 0.001]), P.ink, { at: [x1 - 0.04, 1.3, S + 0.0185], rot: [0, 0, 0.12] });
  }
}

// ── the mailroom sorting desk (2×1) ──────────────────────────────────────────────────────────────
/** A standing desk for the post (things stand on its front, at SURFACE): a hutch of pigeonholes
 *  across its back (labelled, letters in them by the seed), a postal scale at one end and the stamp
 *  and its pad at the other, a shelf under with parcels and a mail sack. Oak top on grey steel. */
export function sortingDesk(m: Model, o: Look) {
  const T = SURFACE.sorting_desk;
  const steel = 0x8d9296;
  m.add(box([1.9, 0.035, 0.9], 0.006, 2), P.oak, { at: [1, T - 0.0175, 0.5] });
  for (const x of [0.08, 1.92])
    for (const z of [0.1, 0.9]) m.add(box([0.04, T - 0.035, 0.04], 0.004), steel, { at: [x, (T - 0.035) / 2, z] });
  for (const x of [0.08, 1.92]) m.add(box([0.03, 0.04, 0.8]), steel, { at: [x, 0.25, 0.5] });
  m.add(box([1.84, 0.02, 0.78]), steel, { at: [1, 0.25, 0.5] });
  m.add(box([1.84, 0.06, 0.02]), steel, { at: [1, T - 0.065, 0.92] });
  // on the shelf: parcels, a sack
  const r = rng(o.seed);
  let x = 0.18;
  while (x < 1.4) {
    const w = 0.18 + r() * 0.18;
    const h = 0.1 + r() * 0.16;
    const d = 0.26 + r() * 0.2;
    const turn = (r() - 0.5) * 0.2;
    m.add(box([w, h, d], 0.004), [0xb8935e, 0xc9a273, 0xa8814f][Math.floor(r() * 3)], {
      at: [x + w / 2, 0.26 + h / 2, 0.5],
      rot: [0, turn, 0],
    });
    m.add(box([0.06, 0.04, 0.002]).translate(0, 0, d / 2 + 0.001), P.paperWhite, {
      at: [x + w / 2, 0.26 + h * 0.6, 0.5],
      rot: [0, turn, 0],
    });
    x += w + 0.05;
  }
  m.add(cushion([0.36, 0.32, 0.3], 0.3, 2), 0x8a8060, { at: [1.65, 0.42, 0.5], rot: [0, 0.2, 0.06] });
  m.add(cyl(0.035, 0.05, 0.08, 8), 0x8a8060, { at: [1.65, 0.58, 0.5] });
  // the hutch of pigeonholes
  const [hx0, hx1, hy0, hy1, hz0, hz1] = [0.08, 1.92, T, 1.62, 0.06, 0.36];
  const cols = 9;
  const rows = 3;
  const cw = (hx1 - hx0) / cols;
  const rh = (hy1 - hy0) / rows;
  m.add(box([hx1 - hx0, hy1 - hy0, 0.012]), shade(P.oak, 0.7), { at: [1, (hy0 + hy1) / 2, hz0 + 0.006] });
  m.add(box([hx1 - hx0 + 0.02, 0.022, hz1 - hz0], 0.004), P.oak, { at: [1, hy1 + 0.011, (hz0 + hz1) / 2] });
  for (let i = 0; i <= cols; i++)
    m.add(box([0.012, hy1 - hy0, hz1 - hz0]), P.oak, { at: [hx0 + i * cw, (hy0 + hy1) / 2, (hz0 + hz1) / 2] });
  for (let j = 1; j < rows; j++)
    m.add(box([hx1 - hx0, 0.012, hz1 - hz0]), P.oak, { at: [1, hy0 + j * rh, (hz0 + hz1) / 2] });
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const cx = hx0 + (i + 0.5) * cw;
      const fy = hy0 + j * rh + 0.006;
      m.add(box([0.1, 0.018, 0.002]), P.paperWhite, { at: [cx, fy + 0.012, hz1 + 0.001] });
      m.add(box([0.05, 0.003, 0.001]), P.ink, { at: [cx, fy + 0.012, hz1 + 0.0025] });
      // letters lying in it, their edges out over its front; one stood up at the back
      const n = Math.floor(r() * 4);
      for (let e = 0; e < n; e++)
        m.add(box([0.16, 0.004, 0.11]), [P.paperWhite, P.cream, 0xd9c49a, 0xe6dcc4][Math.floor(r() * 4)], {
          at: [cx + (r() - 0.5) * 0.02, fy + 0.03 + e * 0.005, hz1 - 0.04 + r() * 0.02],
          rot: [0, (r() - 0.5) * 0.3, 0],
        });
      if (n && r() < 0.4)
        m.add(box([0.15, 0.1, 0.003]), r() < 0.5 ? P.paperWhite : 0xd9c49a, {
          at: [cx, fy + 0.07, hz0 + 0.04],
          rot: [-0.18, 0, 0],
        });
    }
  // a postal scale on the left end, the stamp and its pad on the right (off the free top)
  m.add(box([0.18, 0.04, 0.2], 0.008), P.paperWhite, { at: [0.13, T + 0.02, 0.6] });
  m.add(box([0.16, 0.012, 0.18], 0.004), P.chrome, { at: [0.13, T + 0.046, 0.6] });
  m.add(box([0.06, 0.02, 0.002]), 0x2a3236, { at: [0.13, T + 0.02, 0.701] });
  m.add(box([0.04, 0.012, 0.001]), P.ledGreen, { at: [0.13, T + 0.02, 0.7025], glow: true });
  m.add(box([0.1, 0.02, 0.07], 0.004), P.ink, { at: [1.87, T + 0.01, 0.55] });
  m.add(box([0.08, 0.004, 0.05]), 0x8a2f2a, { at: [1.87, T + 0.022, 0.55] });
  m.add(cyl(0.015, 0.02, 0.07, 10), P.walnut, { at: [1.87, T, 0.7] });
  m.add(ball(0.022, 8), P.walnut, { at: [1.87, T + 0.085, 0.7] });
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  mobile_whiteboard: mobileWhiteboard,
  punch_clock: punchClock,
  tube_station: tubeStation,
  paper_shredder: paperShredder,
  plotter,
  drinks_fridge: drinksFridge,
  security_desk: securityDesk,
  fire_extinguisher: fireExtinguisher,
  first_aid_cabinet: firstAidCabinet,
  sorting_desk: sortingDesk,
};
