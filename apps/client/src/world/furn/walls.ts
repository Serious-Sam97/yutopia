import { TEXT_FACE } from "@yutopia/shared";
import { glyphDots } from "@yutopia/shared/glyphs";
import { GLASS } from "@yutopia/shared/media";
import { ball, box, cyl, type Look, type Model, merged, ring, rod, type V3 } from "./kit";
import { P, shade } from "./palette";

// On the walls (docs/plan/67-the-furniture.md, phase 7), in the wall's frame (shared hang.ts): x
// along the wall across the footprint, y up from where it hangs (its lift added when placed), z out
// into the room — the wall's face at z 0.1. The live pictures land where they always have: the board
// wall's VU and the big screen's share on their glass at z 0.16 (world/model.ts keepDisplay, shared
// media.ts GLASS), the whiteboard's miniature on its board at 0.165, the clock's hands on its face
// (tp/live.ts) — each surface a hair behind, its frame round it, never over it.

export const WALL_LOOKS = {
  board_wall: ["Board wall"],
  screen_wall: ["Big screen"],
  whiteboard: ["Whiteboard"],
  notice_board: ["Cork, walnut frame", "Cork, oak frame", "Felt pinboard"],
  acoustic_panel: ["Acoustic panel"],
  clock: ["Wall clock"],
  neon: ["Coffee neon", "Heart neon", "Bolt neon"],
  poster: ["Poster"],
  light_switch: ["Light switch"],
  frame: ["Picture frame"],
} as const;

const FACE = 0.1; // the wall's face
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A board out from the wall: x0..x1 across, y0..y1 up, `d` deep from the wall's face. */
function slab(m: Model, x0: number, x1: number, y0: number, y1: number, d: number, c: number, bevel = 0.006) {
  m.add(box([x1 - x0, y1 - y0, d], bevel), c, { at: [(x0 + x1) / 2, (y0 + y1) / 2, FACE + d / 2] });
}
/** A frame's four bars round x0..x1 × y0..y1 (its inside), `w` wide, its front at `front`. */
function bars(m: Model, x0: number, x1: number, y0: number, y1: number, w: number, front: number, c: number) {
  const d = front - FACE;
  const z = FACE + d / 2;
  m.add(box([x1 - x0 + 2 * w, w, d], 0.004), c, { at: [(x0 + x1) / 2, y1 + w / 2, z] });
  m.add(box([x1 - x0 + 2 * w, w, d], 0.004), c, { at: [(x0 + x1) / 2, y0 - w / 2, z] });
  m.add(box([w, y1 - y0, d], 0.004), c, { at: [x0 - w / 2, (y0 + y1) / 2, z] });
  m.add(box([w, y1 - y0, d], 0.004), c, { at: [x1 + w / 2, (y0 + y1) / 2, z] });
}
/** Something flat on a face at z (a note, a label): its middle (x, y), w × h, tipped `tilt` rad. */
function sheet(m: Model, x: number, y: number, z: number, w: number, h: number, c: number, tilt = 0) {
  m.add(box([w, h, 0.002]), c, { at: [x, y, z + 0.001], rot: [0, 0, tilt] });
}
/** A sticky note, curling off at its foot. */
function sticky(m: Model, x: number, y: number, z: number, tilt: number) {
  sheet(m, x, y, z, 0.2, 0.18, 0xe8c25a, tilt);
  for (let i = 0; i < 2; i++)
    sheet(m, x - 0.01, y + 0.04 - i * 0.05, z + 0.002, 0.13 - i * 0.03, 0.008, 0x6b4a20, tilt);
}

// ── the board wall (3×1): a walnut frame round smoked glass, the VU on it ──────────────────────────
/** A walnut frame round smoked glass (the live VU display mounted on it: x 0.14–2.86, 27–67 px, at
 *  0.16), brass screws and a maker's plate, a marker tray with two markers and the eraser; a sticky
 *  note on the frame. */
export function boardWall(m: Model) {
  const [x0, x1, y0, y1] = [0.14, 2.86, 0.689, 1.7097];
  slab(m, 0.06, 2.94, 0.5614, 1.8373, 0.05, P.walnut);
  m.add(box([x1 - x0, y1 - y0, 0.006]), P.glass, { at: [(x0 + x1) / 2, (y0 + y1) / 2, 0.153] });
  bars(m, x0, x1, y0, y1, 0.05, 0.172, P.walnutDark);
  for (const [x, y] of [
    [0.09, 1.7863],
    [2.91, 1.7863],
    [0.09, 0.6124],
    [2.91, 0.6124],
  ])
    m.add(cyl(0.008, 0.008, 0.004, 8), P.brass, { at: [x, y, 0.172], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.28, 0.06, 0.004], 0.002), P.brass, { at: [1.5, 0.6201, 0.174] });
  // the marker tray
  m.add(box([2, 0.03, 0.1], 0.004), P.alum, { at: [1.5, 0.4976, FACE + 0.05] });
  for (const [x, c] of [
    [0.79, 0xc4402b],
    [1.04, 0x3f4a5a],
  ] as const)
    m.add(rod(0.008, 0.008, 0.16, "x", 8), c, { at: [x, 0.4976 + 0.023, 0.17] });
  m.add(box([0.24, 0.04, 0.06], 0.006), P.cream, { at: [2.17, 0.4976 + 0.035, 0.16] });
  m.add(box([0.24, 0.012, 0.06]), P.graphite, { at: [2.17, 0.4976 + 0.02, 0.16] });
  // (story) the sticky note
  sticky(m, 2.76, 1.8246, 0.172, 0.06);
}

// ── the big screen (4×1) ──────────────────────────────────────────────────────────────────────────
/** A graphite bezel round the glass (the board and the screen share on it: GLASS.screen_wall), a
 *  soundbar under it on its bracket, the ON AIR lamp over it; its red standby LED, a sticky note. */
export function screenWall(m: Model) {
  const g = GLASS.screen_wall;
  const [x0, x1, y0, y1] = [g.x0, g.x1, g.z0, g.z1];
  slab(m, 0.06, 3.94, 0.4083, 1.9904, 0.045, 0x2b2b2e);
  m.add(box([x1 - x0, y1 - y0, 0.006]), P.glass, { at: [(x0 + x1) / 2, (y0 + y1) / 2, g.y - 0.004 - 0.003] });
  bars(m, x0, x1, y0, y1, 0.035, g.y + 0.008, 0x1d1d20);
  m.add(box([0.012, 0.008, 0.004]), 0xd84a3a, { at: [3.8, 0.4593, g.y + 0.01], glow: true });
  // the soundbar and its bracket
  m.add(box([1.6, 0.1276, 0.09], 0.02, 2), P.graphite, { at: [2, 0.319, FACE + 0.06] });
  for (let i = 0; i < 24; i++)
    m.add(box([0.02, 0.05, 0.002]), 0x45413a, { at: [1.28 + i * 0.06, 0.319, FACE + 0.106] });
  m.add(box([0.3, 0.02, 0.06]), P.steel, { at: [2, 0.2552 - 0.01, FACE + 0.03] });
  // the ON AIR lamp
  m.add(box([0.6, 0.1531, 0.08], 0.01), P.graphite, { at: [2, 2.118, FACE + 0.04] });
  m.add(box([0.52, 0.1021, 0.004]), 0x5a2018, { at: [2, 2.118, FACE + 0.082] });
  for (let i = 0; i < 5; i++)
    m.add(box([0.06, 0.051, 0.002]), 0xb8705e, { at: [1.82 + i * 0.09, 2.118, FACE + 0.085] });
  // (story) the sticky note on its bezel
  sticky(m, 3.68, 1.9011, g.y + 0.008, -0.08);
}

// ── the whiteboard (2×1) ──────────────────────────────────────────────────────────────────────────
/** An aluminium frame round the board (the live miniature on it: x 0.14–1.86, 27–61 px, at 0.165),
 *  the ghosts of erased marker on it, a tray with three markers and the eraser. */
export function whiteboard(m: Model) {
  const [x0, x1, y0, y1] = [0.14, 1.86, 0.689, 1.5566];
  slab(m, 0.08, 1.92, 0.6124, 1.6332, 0.04, P.alum);
  m.add(box([x1 - x0, y1 - y0, 0.02]), 0xf6f3ea, { at: [(x0 + x1) / 2, (y0 + y1) / 2, 0.151] });
  bars(m, x0, x1, y0, y1, 0.035, 0.172, P.alum);
  for (let i = 0; i < 4; i++) {
    const x = 0.4 + rnd(i, 1, 0) * 1.0;
    const y = 0.8421 + rnd(i, 2, 0) * 0.5614;
    sheet(m, x, y, 0.161, 0.22 + rnd(i, 3, 0) * 0.2, 0.012, 0xdfe3e8, (rnd(i, 4, 0) - 0.5) * 0.2);
  }
  // the tray, the markers and the eraser
  m.add(box([1.6, 0.025, 0.1], 0.004), P.alum, { at: [1, 0.5614, FACE + 0.05] });
  for (const [x, c] of [
    [0.48, 0xc4402b],
    [0.68, 0x3f4a5a],
    [0.88, P.olive],
  ] as const) {
    m.add(rod(0.008, 0.008, 0.14, "x", 8), c, { at: [x, 0.5614 + 0.02, 0.16] });
    m.add(rod(0.0085, 0.0085, 0.03, "x", 8), shade(c, 0.7), { at: [x + 0.08, 0.5614 + 0.02, 0.16] });
  }
  m.add(box([0.2, 0.04, 0.06], 0.006), P.graphite, { at: [1.5, 0.5614 + 0.032, 0.16] });
  m.add(box([0.2, 0.012, 0.06]), P.cream, { at: [1.5, 0.5614 + 0.058, 0.16] });
}

// ── the notice board (2×1) ────────────────────────────────────────────────────────────────────────
/** Cork in a walnut or an oak frame, or a felt pinboard crossed with ribbons; notes pinned on it
 *  (seeded), a polaroid. */
export function noticeBoard(m: Model, o: Look) {
  const [x0, x1, y0, y1] = [0.14, 1.86, 0.7911, 1.5056];
  const frameC = o.look === 1 ? P.oak : P.walnut;
  const felt = o.look === 2;
  slab(m, 0.08, 1.92, 0.7145, 1.5821, 0.025, frameC);
  m.add(box([x1 - x0, y1 - y0, 0.012]), felt ? 0x4c6a6e : 0xc49a6c, {
    at: [(x0 + x1) / 2, (y0 + y1) / 2, FACE + 0.031],
  });
  bars(m, x0, x1, y0, y1, 0.06, 0.145, frameC);
  const S = FACE + 0.037; // the cork's face
  if (felt) {
    // ribbons across it, buttoned where they cross
    for (let k = 1; k < 4; k++)
      m.add(box([x1 - x0, 0.016, 0.004]), P.cream, { at: [(x0 + x1) / 2, y0 + ((y1 - y0) * k) / 4, S + 0.002] });
    for (let k = 1; k < 6; k++) {
      const x = x0 + ((x1 - x0) * k) / 6;
      m.add(box([0.016, y1 - y0, 0.004]), P.cream, { at: [x, (y0 + y1) / 2, S + 0.003] });
      for (let j = 1; j < 4; j++)
        m.add(cyl(0.012, 0.012, 0.006, 8), P.brass, {
          at: [x, y0 + ((y1 - y0) * j) / 4, S + 0.003],
          rot: [Math.PI / 2, 0, 0],
        });
    }
  } else
    for (let i = 0; i < 40; i++)
      sheet(m, x0 + 0.04 + rnd(i, 1, o.seed) * 1.64, y0 + 0.03 + rnd(i, 2, o.seed) * 0.66, S, 0.012, 0.012, 0x9c754c);
  const cols = [P.paperWhite, 0xe8c25a, P.cream, 0xd8e0d0];
  for (let i = 0; i < 6; i++) {
    const x = 0.35 + (i % 3) * 0.52 + rnd(i, 1, o.seed) * 0.12;
    const y = 0.9825 + Math.floor(i / 3) * 0.3062 + rnd(i, 2, o.seed) * 0.1021;
    const t = (rnd(i, 3, o.seed) - 0.5) * 0.12;
    sheet(m, x, y, S + 0.001, 0.3, 0.23, cols[i % 4], t);
    for (let k = 0; k < 3; k++) sheet(m, x - 0.02, y + 0.04 - k * 0.05, S + 0.003, 0.18, 0.006, 0x6b5a40, t);
    m.add(ball(0.012, 6), 0xc4402b, { at: [x, y + 0.09, S + 0.01] });
  }
  // (story) a polaroid
  sheet(m, 1.62, 1.2504, S + 0.001, 0.24, 0.26, P.paperWhite, -0.08);
  sheet(m, 1.62, 1.2759, S + 0.003, 0.18, 0.15, 0x8a9a7a, -0.08);
}

// ── the acoustic panel (1×1) ──────────────────────────────────────────────────────────────────────
/** A felt frame round a grid of foam pyramids, alternating light and dark. */
export function acousticPanel(m: Model) {
  slab(m, 0.14, 0.86, 0.5614, 1.7352, 0.03, 0x7d3a2c);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++) {
      const x = 0.28 + c * 0.22;
      const y = 0.638 + r * 0.2144 + 0.097;
      // (a four-sided cone turned square to the grid, then tipped out of the wall)
      m.add(cyl(0.14, 0.004, 0.05, 4).rotateY(Math.PI / 4), (r + c) % 2 ? 0x7d3a2c : 0x9e4a36, {
        at: [x, y, FACE + 0.03],
        rot: [Math.PI / 2, 0, 0],
      });
    }
}

// ── the clock (1×1) ───────────────────────────────────────────────────────────────────────────────
/** A round wall clock: a walnut rim, its cream face with the hours marked. The world draws its hands
 *  live (tp/live.ts: the time where you are, on CLOCK_FACE); its pictures (`thumb`) show ten past
 *  ten. */
export const CLOCK_FACE = { x: 0.5, y: 1.3269, r: 0.15, z: FACE + 0.032 } as const;
export function clock(m: Model, o: Look & { thumb?: boolean }) {
  const { x, y, r, z } = CLOCK_FACE;
  m.add(ring(r + 0.012, 0.02, 6, 32), P.walnutDark, { at: [x, y, FACE + 0.02], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(r + 0.01, r + 0.01, 0.022, 32), P.walnutDark, { at: [x, y, FACE], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(r, r, 0.002, 32), P.cream, { at: [x, y, z - 0.002], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 3 ? 0.018 : 0.032;
    m.add(box([i % 3 ? 0.005 : 0.009, len, 0.002]), P.ink, {
      at: [x + Math.sin(a) * (r - 0.012 - len / 2), y + Math.cos(a) * (r - 0.012 - len / 2), z + 0.001],
      rot: [0, 0, -a],
    });
  }
  m.add(cyl(0.008, 0.008, 0.006, 10), P.rust, { at: [x, y, z + 0.004], rot: [Math.PI / 2, 0, 0] });
  if (o.thumb)
    for (const [a, l, w] of [
      [(10 / 12) * Math.PI * 2 + (10 / 60) * (Math.PI / 6), 0.55, 0.008],
      [(10 / 60) * Math.PI * 2, 0.82, 0.005],
    ])
      m.add(box([w, r * l, 0.002]), P.ink, {
        at: [x + (Math.sin(a) * r * l) / 2, y + (Math.cos(a) * r * l) / 2, z + 0.006],
        rot: [0, 0, -a],
      });
}

// ── the neon (2×1) ────────────────────────────────────────────────────────────────────────────────
/** A neon sign on standoffs: a coffee cup (amber), a heart (pink) or a bolt (cyan), its tubes lit
 *  on a smoked backing (its light: art/light.ts NEON_LIGHT, by its look). */
export const NEON = [0xf1d79a, 0xff5fa8, 0x5ff0ff];
export function neon(m: Model, o: Look) {
  const v = o.look;
  const c = NEON[v] ?? NEON[0];
  const Z = FACE + 0.05;
  m.add(box([1.6, 0.7145, 0.012], 0.004), 0x1c1a24, { at: [1, 1.2759, FACE + 0.035] });
  for (const [x, y] of [
    [0.26, 0.9697],
    [1.74, 0.9697],
    [0.26, 1.5821],
    [1.74, 1.5821],
  ])
    m.add(cyl(0.01, 0.01, 0.035, 8), P.chrome, { at: [x, y, FACE], rot: [Math.PI / 2, 0, 0] });
  const line = (pts: [number, number][], close = false) => {
    const p: V3[] = pts.map(([u, z]) => [u, z, Z]);
    if (close) p.push(p[0]);
    for (let i = 0; i < p.length - 1; i++) {
      const [a, b] = [p[i], p[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      m.add(rod(0.011, 0.011, len + 0.011, "x", 6), c, {
        at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Z],
        rot: [0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])],
        glow: true,
      });
    }
  };
  if (v === 0) {
    line([
      [0.72, 1.429],
      [0.78, 1.0718],
      [1.12, 1.0718],
      [1.18, 1.429],
    ]);
    line(
      Array.from({ length: 9 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 8) * Math.PI;
        return [1.17 + Math.cos(a) * 0.07, 1.2759 + Math.sin(a) * -0.1021] as [number, number];
      }),
    );
    for (const u of [0.86, 1.02])
      line([
        [u, 1.4801],
        [u + 0.04, 1.5439],
        [u - 0.02, 1.5821],
      ]);
  } else if (v === 1) {
    const heart: [number, number][] = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      heart.push([1 + x * 0.019, 1.2759 + y * 0.014]);
    }
    line(heart, true);
  } else
    line(
      [
        [1.06, 1.5566],
        [0.86, 1.2504],
        [1.0, 1.2504],
        [0.92, 0.9952],
        [1.16, 1.3269],
        [1.02, 1.3269],
        [1.12, 1.5566],
      ],
      true,
    );
}

// ── the poster (1×1) ──────────────────────────────────────────────────────────────────────────────
/** A framed print by `art`: a big cassette, a VU meter, a Yondra sunset; a strip of tape on a corner. */
export function poster(m: Model, art: string) {
  m.paint();
  const [x0, x1, _y0, _y1] = [0.16, 0.84, 0.8421, 1.6076];
  slab(m, 0.12, 0.88, 0.7655, 1.6842, 0.022, 0x2b2420);
  const F = FACE + 0.023;
  const at = (u: number, z: number): V3 => [u, z, F];
  const rect = (u0: number, u1: number, z0: number, z1: number, c: number, dz = 0) =>
    m.add(box([u1 - u0, z1 - z0, 0.002]), c, {
      at: [(u0 + u1) / 2, (z0 + z1) / 2, F + 0.001 + dz],
    });
  if (art === "vu") {
    rect(x0, x1, 0.8421, 1.6076, P.cream);
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (0.15 + (i / 12) * 0.7);
      const [u, z] = [0.5 - Math.cos(a) * 0.26, 1.0718 + Math.sin(a) * 0.3828];
      const p = at(u, z);
      m.add(box([0.006, i % 2 ? 0.02 : 0.034, 0.002]), i > 8 ? 0xc4402b : P.ink, {
        at: [p[0], p[1], F + 0.003],
        rot: [0, 0, Math.PI / 2 - a],
      });
    }
    const n = Math.atan2(1.378 - 1.0718, 0.16);
    m.add(box([Math.hypot(0.16, 1.378 - 1.0718), 0.005, 0.002]), 0xc4402b, {
      at: [0.58, (1.0718 + 1.378) / 2, F + 0.004],
      rot: [0, 0, n],
    });
    rect(0.3, 0.7, 0.8931, 0.9697, P.walnut, 0.002);
  } else if (art === "yondra") {
    rect(x0, x1, 0.8421, 1.6076, P.walnutDark);
    m.add(cyl(0.18, 0.18, 0.002, 24), P.mustard, { at: [0.5, 1.1994, F + 0.002], rot: [Math.PI / 2, 0, 0] });
    for (const [z, c] of [
      [1.1228, P.rust],
      [1.2121, 0xd9a441],
      [1.3014, P.olive],
    ] as const)
      rect(x0, x1, z - 0.0868, z, c, 0.004);
    rect(x0, x1, 0.8421, 1.036, P.walnutDark, 0.005);
    for (let i = 0; i < 3; i++) rect(0.3, 0.7 - i * 0.1, 0.8931 + i * 0.0408, 0.9136 + i * 0.0408, P.cream, 0.006);
  } else {
    rect(x0, x1, 0.8421, 1.6076, 0xd9a441);
    rect(0.24, 0.76, 1.0207, 1.429, P.graphite, 0.002);
    rect(0.3, 0.7, 1.2759, 1.378, P.cream, 0.004);
    for (const u of [0.38, 0.62]) {
      m.add(cyl(0.06, 0.06, 0.002, 18), P.cream, { at: [u, 1.1738, F + 0.004], rot: [Math.PI / 2, 0, 0] });
      m.add(cyl(0.025, 0.025, 0.002, 12), P.graphite, { at: [u, 1.1738, F + 0.006], rot: [Math.PI / 2, 0, 0] });
    }
    rect(0.36, 0.64, 1.0462, 1.082, 0x4a463e, 0.004);
    for (let i = 0; i < 3; i++) rect(0.24, 0.76, 1.4801 + i * 0.0408, 1.4954 + i * 0.0408, shade(0xd9a441, 0.8), 0.002);
  }
  sheet(m, 0.76, 1.6459, F + 0.006, 0.18, 0.08, 0xe8dbb5, 0.3);
}

// ── the light switch (1×1) ────────────────────────────────────────────────────────────────────────
/** A cream plate by the door, its rocker pressed up (on) or down (off). */
export function lightSwitch(m: Model, o: Look) {
  const on = o.on !== false;
  const [y0, y1] = [0.8166, 1.1483];
  const cy = (y0 + y1) / 2;
  m.add(box([0.14, y1 - y0, 0.012], 0.004, 2), P.cream, { at: [0.5, cy, FACE + 0.006] });
  m.add(box([0.06, 0.16, 0.006], 0.002), shade(P.cream, 0.82), { at: [0.5, cy, FACE + 0.012] });
  m.add(box([0.052, 0.15, 0.012], 0.004), 0xfffaf0, { at: [0.5, cy, FACE + 0.016], rot: [on ? -0.12 : 0.12, 0, 0] });
  for (const y of [y0 + 0.02, y1 - 0.02])
    m.add(cyl(0.005, 0.005, 0.003, 6), shade(P.cream, 0.7), { at: [0.5, y, FACE + 0.012], rot: [Math.PI / 2, 0, 0] });
}

// ── the picture frame (1×1) ───────────────────────────────────────────────────────────────────────
/** A walnut frame, its width and its picture by its seed (`props.seed`): a landscape, bands of colour
 *  or a portrait, on a paper mount. */
export function pictureFrame(m: Model, seed: number) {
  // (the life look: the picture is paint, not the cloth its colours are elsewhere)
  m.paint();
  const art = Math.floor(seed * 3);
  const w = 0.22 + ((seed * 10) % 1) * 0.12;
  const [y0, y1] = [1.0207, 1.5311];
  slab(m, 0.5 - w, 0.5 + w, y0, y1, 0.03, P.walnutDark);
  const F = FACE + 0.031;
  const [u0, u1, v0, v1] = [0.5 - w + 0.04, 0.5 + w - 0.04, 1.0718, 1.4801];
  const rect = (a: number, b: number, c: number, d: number, col: number, dz = 0) =>
    m.add(box([b - a, d - c, 0.002]), col, { at: [(a + b) / 2, (c + d) / 2, F + 0.001 + dz] });
  rect(u0, u1, v0, v1, P.paperWhite);
  const [p0, p1] = [u0 + 0.012, u1 - 0.012];
  if (art === 0) {
    rect(p0, p1, 1.2504, 1.4545, 0x9fc2d8, 0.002);
    rect(p0, p1, 1.0973, 1.2759, P.olive, 0.002);
    m.add(cyl(0.022, 0.022, 0.002, 12), P.mustard, {
      at: [0.5 + w * 0.4, 1.4035, F + 0.005],
      rot: [Math.PI / 2, 0, 0],
    });
  } else if (art === 1)
    for (const [k, c] of [P.rust, 0xd9a441, P.olive, 0x3f4a5a].entries())
      rect(p0, p1, 1.0973 + k * 0.0893, 1.1738 + k * 0.0893, c, 0.002);
  else {
    rect(p0, p1, 1.0973, 1.4545, 0x6b5a4a, 0.002);
    m.add(ball(0.05, 10), 0xe4b48e, { at: [0.5, 1.2504, F + 0.004], scale: [1, 1.15, 0.1] });
    rect(0.44, 0.56, 1.0973, 1.1738, P.rust, 0.004);
  }
}

// ── words on things (plan 68 phase 1: props.text, shared glyphs.ts) ─────────────────────────────────
export const WORD_LOOKS = {
  marquee_sign: ["Marquee sign"],
  vfd_ticker: ["Ticker sign"],
  split_flap: ["Split-flap board"],
} as const;

/** A theatre marquee on the wall: a red panel in a chrome frame, its words in lit bulbs (the shared
 *  dot face, sized to fit), a border of bulbs chasing round it (live: three sets blinking in turn). */
export function marqueeSign(m: Model, text: string) {
  const [x0, x1, y0, y1] = [0.1, 2.9, 1.52, 2.23];
  slab(m, x0, x1, y0, y1, 0.06, 0x6e1f1a, 0.01);
  bars(m, x0 + 0.02, x1 - 0.02, y0 + 0.02, y1 - 0.02, 0.025, FACE + 0.07, P.chrome);
  // the words: a bulb a dot, the letters centred
  const n = Math.max(1, text.length);
  const p = Math.min(0.06, (x1 - x0 - 0.36) / (n * 6));
  const w = n * 6 * p - p;
  const sx = (x0 + x1) / 2 - w / 2;
  const sy = (y0 + y1) / 2 + 3 * p;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i]))
      m.add(cyl(p * 0.36, p * 0.36, 0.012, 6), 0xffe7b0, {
        at: [sx + (i * 6 + c) * p + p / 2, sy - r * p, FACE + 0.06],
        rot: [Math.PI / 2, 0, 0],
        glow: true,
      });
  // the chasing border: unlit bulbs all round, every third one lit with its set (one live part a
  // set: one draw), the three sets in turn
  const ring: [number, number][] = [];
  const step = 0.1;
  for (let x = x0 + 0.08; x <= x1 - 0.07; x += step) ring.push([x, y1 - 0.05], [x, y0 + 0.05]);
  for (let y = y0 + 0.15; y <= y1 - 0.14; y += step) ring.push([x0 + 0.06, y], [x1 - 0.06, y]);
  for (const [x, y] of ring) m.add(ball(0.016, 6), 0x8a6a3a, { at: [x, y, FACE + 0.07] });
  for (let k = 0; k < 3; k++)
    m.live(
      merged(ring.filter((_, i) => i % 3 === k).map(([x, y]) => ball(0.019, 6).translate(x, y, FACE + 0.071))),
      0xffd28a,
      { kind: "blink", period: 0.9, on: 0.34, phase: k / 3 },
      { glow: true },
    );
}

/** A VFD ticker strip: its black housing, the dark glass where its words scroll by (drawn live:
 *  tp/live.ts, on TEXT_FACE). */
export function vfdTicker(m: Model) {
  const f = TEXT_FACE.vfd_ticker;
  slab(m, 0.15, 1.85, 1.94, 2.16, f.z - FACE - 0.01, 0x18181a, 0.01);
  m.add(box([f.x1 - f.x0, f.y1 - f.y0, 0.004]), 0x0b120e, { at: [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, f.z - 0.004] });
  bars(m, f.x0, f.x1, f.y0, f.y1, 0.012, f.z + 0.004, 0x2a2a2d);
}

/** A split-flap departures board: its black frame, the dark face its flaps turn on (drawn live:
 *  tp/live.ts, on TEXT_FACE), a brass name plate under it. */
export function splitFlap(m: Model) {
  const f = TEXT_FACE.split_flap;
  slab(m, 0.1, 2.9, 1.44, 2.12, f.z - FACE - 0.01, 0x141416, 0.012);
  m.add(box([f.x1 - f.x0, f.y1 - f.y0, 0.004]), 0x0e0e10, { at: [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, f.z - 0.004] });
  bars(m, f.x0, f.x1, f.y0, f.y1, 0.015, f.z + 0.006, 0x26262a);
  m.add(box([0.5, 0.035, 0.006], 0.002), P.brass, { at: [1.5, 1.465, f.z + 0.002] });
}
