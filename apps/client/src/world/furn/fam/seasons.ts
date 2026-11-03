import { glyphDots } from "@yutopia/shared/glyphs";
import {
  type BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  BufferGeometry as Geo,
  SphereGeometry,
} from "three";
import { ball, box, cyl, extrude, type Look, lathe, type Model, merged, ring, tube, type V3 } from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 20 (docs/plan/68-more-furniture.md): Other seasons — pumpkins (a heap, heirlooms, or on
// a straw bale), a jack-o'-lantern (its face glowing and flickering, the candle's flame in its open top
// on one look, a light), an autumn leaves garland and bunting on the wall, paper chains hung from the
// ceiling. In the kit's frame (x across the footprint, z down it toward the room, y up, metres); a wall
// piece on the wall's face at z 0.1, a ceiling one up to 3.27. Their catalog entries, shapes and
// measures in the shared fam/seasons.ts.

export const LOOKS: Record<string, readonly string[]> = {
  pumpkins: ["Orange pumpkins", "Heirlooms", "On a straw bale"],
  jack_o_lantern: ["Classic grin", "Spooky", "Lid off"],
  leaf_garland: ["Maple", "Oak and acorns", "Harvest"],
  bunting: ["Rainbow", "Pastel polka dots", "Happy birthday"],
  paper_chains: ["Rainbow", "Pastel", "Gold and silver"],
};

const FACE = 0.1; // a wall's face
const CEILING = 3.27;
const S = {
  pumpkin: 0xe0761e,
  pumpkinDeep: 0xc8581a,
  white: 0xece6d6,
  slate: 0x8fa3a0,
  stem: 0x6b5a2e,
  vine: 0x4f6b2e,
  straw: 0xd8b56a,
  strawDark: 0xb8944a,
  twine: 0x8a6a48,
  glow: 0xffb040,
  glowDim: 0xd0601a,
  dark: 0x2a160a,
  red: 0xb8322a,
  orange: 0xd8701e,
  gold: 0xe0a52a,
  rust: 0x9a4a22,
  brown: 0x7a4a2a,
  acorn: 0x9a6a3a,
  cap: 0x6b4a2a,
  wheat: 0xd9b860,
};
const RAINBOW = [0xe8444a, 0xf59a3a, 0xf6d84a, 0x5ac06a, 0x4a8ae0, 0xa05ad0];
const PASTEL = [0xf6b4c4, 0xb4ead4, 0xf8e4a4, 0xb4d4f6, 0xdcc4f4];
const METAL = [0xe8b84a, 0xdde2e8, 0xf4d47c, 0xc4ccd4];

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};

/** Words in the shared dot face on a face looking +z, centred on (0, 0): each dot `p` across. */
function dotText(text: string, p: number): BufferGeometry | null {
  const pos: number[] = [];
  const d = p * 0.82;
  const x = -((text.length * 6 - 1) * p) / 2;
  const y = 3.5 * p;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) {
      const x0 = x + (i * 6 + c) * p;
      const y1 = y - r * p;
      pos.push(x0, y1 - d, 0, x0 + d, y1 - d, 0, x0 + d, y1, 0, x0, y1 - d, 0, x0 + d, y1, 0, x0, y1, 0);
    }
  return pos.length ? geo(pos) : null;
}

// ── pumpkins ────────────────────────────────────────────────────────────────────────────────────

/** A pumpkin `r` round: its ribs (each a swell and a groove), squashed, dimpled at its top and foot;
 *  its middle at 0. Carved (`face`): its ribs smoothed out over its front, where the face is cut. */
function pumpkinGeo(r: number, ribs: number, squash: number, face = false): BufferGeometry {
  const g = new SphereGeometry(r, ribs * 2, 9);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const a = Math.atan2(z, x);
    const smooth = face ? Math.max(0, Math.cos(a - Math.PI / 2)) ** 3 * Math.max(0, 1 - (y / r) ** 2 * 1.4) : 0;
    const k = 1 - 0.1 * (0.5 - 0.5 * Math.cos(a * ribs + Math.PI)) * (1 - smooth);
    const u = y / r;
    p.setXYZ(i, x * k, y * squash * (1 - 0.22 * u ** 4), z * k);
  }
  return g;
}
/** How far a pumpkin's foot is under its middle. */
const foot = (r: number, squash: number) => r * squash * 0.78;

/** A pumpkin sat at (x, z) on y: its skin, its stem (a curl, a flare at its foot); a tendril of
 *  vine by `vine`. */
function pumpkin(
  m: Model,
  x: number,
  y: number,
  z: number,
  r: number,
  c: number,
  turn: number,
  vine = false,
  ribs = 8,
) {
  const sq = 0.78;
  m.add(pumpkinGeo(r, ribs, sq), c, { at: [x, y + foot(r, sq), z], rot: [0, turn, 0] });
  const top = y + foot(r, sq) + r * sq * 0.78;
  m.add(cyl(r * 0.16, r * 0.1, r * 0.06, 6), shade(S.stem, 0.85), { at: [x, top - r * 0.03, z] });
  m.add(
    tube(
      [
        [x, top, z],
        [x + Math.cos(turn) * r * 0.05, top + r * 0.22, z - Math.sin(turn) * r * 0.05],
        [x + Math.cos(turn) * r * 0.16, top + r * 0.3, z - Math.sin(turn) * r * 0.16],
      ],
      r * 0.07,
      5,
      4,
    ),
    S.stem,
  );
  if (vine) {
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = turn + 2 + i * 0.7;
      const rr = r * (0.18 + i * 0.03);
      pts.push([x + Math.cos(a) * rr, top + r * 0.05 + i * 0.004, z + Math.sin(a) * rr]);
    }
    m.add(tube(pts, 0.004, 3, 24), S.vine);
    m.add(
      extrude(
        [
          [0, 0],
          [0.05, 0.03],
          [0.07, 0.07],
          [0.04, 0.1],
          [0, 0.08],
          [-0.04, 0.1],
          [-0.07, 0.07],
          [-0.05, 0.03],
        ],
        0.003,
      ),
      S.vine,
      { at: [x - r * 0.25, top + 0.01, z + r * 0.15], rot: [-1.2, turn, 0] },
    );
  }
}

/** Pumpkins (1×1): a heap of three orange ones, heirlooms (white, slate blue, deep orange), or two on
 *  a straw bale with a gourd; how they lie by the seed. */
export function pumpkins(m: Model, o: Look) {
  const t = o.seed * 6;
  if (o.look === 2) {
    // the bale: its body, its straw in tufts and stalks, the twine round it
    m.add(box([0.84, 0.4, 0.48], 0.04, 2), S.straw, { at: [0.5, 0.2, 0.5] });
    for (let i = 0; i < 40; i++) {
      const side = i % 4;
      const u = rnd(i, 1, 5);
      const v = rnd(i, 2, 5);
      const at: V3 =
        side === 0
          ? [0.1 + u * 0.8, 0.03 + v * 0.34, 0.742]
          : side === 1
            ? [0.1 + u * 0.8, 0.401, 0.28 + v * 0.44]
            : side === 2
              ? [0.08 + 0.001, 0.03 + v * 0.34, 0.28 + u * 0.44]
              : [0.919, 0.03 + v * 0.34, 0.28 + u * 0.44];
      m.add(
        box([side >= 2 ? 0.004 : 0.09, 0.006, side === 1 ? 0.06 : side >= 2 ? 0.09 : 0.004]),
        i % 3 ? S.strawDark : 0xe8cc88,
        {
          at,
          rot: [0, side === 1 ? u * 3 : 0, side === 1 ? 0 : (v - 0.5) * 0.8],
        },
      );
    }
    for (const x of [0.3, 0.7]) {
      m.add(box([0.012, 0.404, 0.484]), S.twine, { at: [x, 0.2, 0.5] });
    }
    pumpkin(m, 0.34, 0.4, 0.48, 0.2, S.pumpkin, t, true);
    pumpkin(m, 0.68, 0.4, 0.56, 0.13, S.pumpkinDeep, t + 2);
    // a striped gourd, lying
    m.add(ball(0.06, 8), 0xe8c838, { at: [0.74, 0.44, 0.34], scale: [1.6, 0.8, 0.9], rot: [0, t, 0] });
    m.add(ball(0.04, 8), 0x3f6b3a, { at: [0.8, 0.45, 0.32], scale: [1.2, 0.9, 0.9], rot: [0, t, 0] });
    // straw spilled round its foot
    for (let i = 0; i < 12; i++)
      m.add(box([0.08, 0.004, 0.006]), S.strawDark, {
        at: [0.1 + rnd(i, 4, 5) * 0.8, 0.003, 0.76 + rnd(i, 5, 5) * 0.1],
        rot: [0, rnd(i, 6, 5) * 3, 0],
      });
    return;
  }
  const heir = o.look === 1;
  const cs = heir ? [S.white, S.slate, S.pumpkinDeep] : [S.pumpkin, S.pumpkinDeep, 0xe8862a];
  // (a heap: the big one at the back, one leant on it, a little one in front — turned by the seed)
  const k = o.seed > 0.5 ? 1 : -1;
  pumpkin(m, 0.5 - k * 0.1, 0, 0.4, 0.25, cs[0], t, !heir, heir ? 10 : 8);
  pumpkin(m, 0.5 + k * 0.2, 0, 0.6, 0.17, cs[1], t + 1.3, false, heir ? 10 : 8);
  pumpkin(m, 0.5 - k * 0.12, 0, 0.76, 0.11, cs[2], t + 2.6, false);
  if (heir) {
    // a little white one on the top
    m.add(pumpkinGeo(0.06, 8, 0.7), S.white, { at: [0.5 + k * 0.22, 0.03, 0.82] });
  }
}

// ── the jack-o'-lantern (on a surface or the floor) ─────────────────────────────────────────────

/** A piece of a carved face (an outline in face metres, u across and v up from the face's middle),
 *  set into the pumpkin's skin where it falls: turned to face out from its middle at that point. */
function carve(pieces: [number, number][][], r: number, cy: number, sq: number): BufferGeometry {
  const out: BufferGeometry[] = [];
  for (const pts of pieces) {
    const [mu, mv] = pts.reduce(([a, b], [u, v]) => [a + u / pts.length, b + v / pts.length], [0, 0]);
    // (where it falls on the squashed ball, and the way its skin faces there)
    const rho = r * Math.sqrt(Math.max(0, 1 - (mv / (r * sq)) ** 2));
    const yaw = mu / rho;
    const pitch = -Math.atan2(mv / (sq * sq), rho);
    const g = extrude(
      pts.map(([u, v]) => [u - mu, v - mv] as [number, number]),
      0.008,
    );
    g.rotateX(pitch).rotateY(yaw);
    g.translate(Math.sin(yaw) * rho, cy + mv, Math.cos(yaw) * rho);
    out.push(g);
  }
  return merged(out);
}

/** The face's pieces by its look: triangle eyes and nose and a toothy grin, slanted eyes and a jagged
 *  mouth, or round eyes and an O. */
function faceOf(look: number): [number, number][][] {
  const tri = (u: number, v: number, w: number, h: number, flip = false): [number, number][] =>
    flip
      ? [
          [u - w / 2, v + h / 2],
          [u + w / 2, v + h / 2],
          [u, v - h / 2],
        ]
      : [
          [u - w / 2, v - h / 2],
          [u + w / 2, v - h / 2],
          [u, v + h / 2],
        ];
  const round = (u: number, v: number, rr: number, n = 8): [number, number][] =>
    Array.from({ length: n }, (_, i) => [
      u + Math.cos((i / n) * Math.PI * 2) * rr,
      v + Math.sin((i / n) * Math.PI * 2) * rr,
    ]);
  if (look === 1) {
    return [
      [
        [-0.075, 0.045],
        [-0.02, 0.02],
        [-0.03, 0.0],
        [-0.075, 0.015],
      ],
      [
        [0.075, 0.045],
        [0.02, 0.02],
        [0.03, 0.0],
        [0.075, 0.015],
      ],
      tri(0, -0.015, 0.025, 0.03),
      // a jagged mouth, in three pieces round the curve
      [
        [-0.09, -0.03],
        [-0.06, -0.045],
        [-0.045, -0.035],
        [-0.03, -0.05],
        [-0.03, -0.075],
        [-0.06, -0.068],
      ],
      [
        [-0.03, -0.05],
        [-0.015, -0.04],
        [0.0, -0.055],
        [0.015, -0.04],
        [0.03, -0.05],
        [0.03, -0.075],
        [0.0, -0.08],
        [-0.03, -0.075],
      ],
      [
        [0.09, -0.03],
        [0.06, -0.045],
        [0.045, -0.035],
        [0.03, -0.05],
        [0.03, -0.075],
        [0.06, -0.068],
      ],
    ];
  }
  if (look === 2)
    return [
      round(-0.045, 0.025, 0.022),
      round(0.045, 0.025, 0.022),
      tri(0, -0.01, 0.02, 0.022),
      round(0, -0.055, 0.026, 10),
    ];
  return [
    tri(-0.048, 0.025, 0.045, 0.04),
    tri(0.048, 0.025, 0.045, 0.04),
    tri(0, -0.012, 0.025, 0.025),
    // the grin: three pieces round the curve, two teeth left standing between them
    [
      [-0.09, -0.025],
      [-0.035, -0.045],
      [-0.035, -0.03],
      [-0.022, -0.03],
      [-0.022, -0.075],
      [-0.06, -0.065],
    ],
    [
      [-0.022, -0.048],
      [0.022, -0.048],
      [0.022, -0.08],
      [-0.022, -0.08],
    ],
    [
      [0.09, -0.025],
      [0.035, -0.045],
      [0.035, -0.03],
      [0.022, -0.03],
      [0.022, -0.075],
      [0.06, -0.065],
    ],
  ];
}

/** A jack-o'-lantern (on a surface, or the floor): a carved pumpkin, its face lit from within while
 *  it's lit — a glow, and over it a brighter one flickering (live) — dark when out; its lid on with
 *  its stem, or (Lid off) set down beside it and the candle's flame (live) showing in its open top. */
export function jackOLantern(m: Model, o: Look) {
  const on = o.on !== false;
  const [cx, cz] = [0.5, 0.5];
  const r = 0.135;
  const sq = 0.82;
  const cy = foot(r, sq);
  m.add(pumpkinGeo(r, 9, sq, true), S.pumpkin, { at: [cx, cy, cz], rot: [0, (o.seed - 0.5) * 0.3, 0] });
  const face = faceOf(o.look);
  const cut = carve(face, r, 0, sq);
  m.add(cut, on ? S.glowDim : S.dark, { at: [cx, cy, cz], glow: on });
  if (on) {
    // (the candle's flicker: a brighter face over it, lit and not, two beats out of step)
    const front = carve(face, r * 1.014, 0, sq);
    m.live(front, S.glow, { kind: "blink", period: 0.37, on: 0.62, phase: o.seed }, { at: [cx, cy, cz], glow: true });
    m.live(
      carve(face.slice(0, 2), r * 1.028, 0, sq),
      0xffe08a,
      { kind: "blink", period: 0.53, on: 0.4, phase: o.seed + 0.3 },
      {
        at: [cx, cy, cz],
        glow: true,
      },
    );
  }
  const top = cy + r * sq * 0.78;
  if (o.look === 2) {
    // the top cut open: its rim, the dark inside lit, the candle and its flame
    m.add(ring(0.055, 0.008, 4, 14), shade(S.pumpkin, 0.8), { at: [cx, top - 0.004, cz] });
    m.add(cyl(0.05, 0.05, 0.004, 14), on ? S.glowDim : S.dark, { at: [cx, top - 0.012, cz], glow: on });
    m.add(cyl(0.012, 0.012, 0.03, 8), P.lace, { at: [cx, top - 0.035, cz] });
    if (on)
      m.live(
        lathe(
          [
            [0.001, 0],
            [0.009, 0.01],
            [0.007, 0.025],
            [0.001, 0.04],
          ],
          6,
        ),
        0xffd06a,
        { kind: "flame", phase: o.seed * 3 },
        { at: [cx, top - 0.006, cz], glow: true },
      );
    // the lid, set down beside it, leant on it
    const lid = merged([
      lathe(
        [
          [0.001, 0],
          [0.058, 0],
          [0.05, 0.02],
          [0.02, 0.03],
          [0.001, 0.031],
        ],
        9,
      ),
      cyl(0.012, 0.008, 0.04, 6).translate(0, 0.028, 0),
    ]);
    m.add(lid, S.pumpkin, { at: [cx + 0.15, 0.018, cz + 0.08], rot: [0, 0.6, -0.4] });
    return;
  }
  // the lid's cut, its stem
  m.add(ring(0.055, 0.004, 3, 14), on ? S.glowDim : S.dark, { at: [cx, top - 0.01, cz], glow: on });
  m.add(
    tube(
      [
        [cx, top - 0.01, cz],
        [cx + 0.008, top + 0.03, cz],
        [cx + 0.025, top + 0.045, cz + 0.005],
      ],
      0.011,
      5,
      4,
    ),
    S.stem,
  );
}

// ── the autumn leaves garland (wall, 3 wide) ────────────────────────────────────────────────────

/** A maple leaf, flat (x, y), `s` across: five pointed lobes on a short stalk. */
function mapleOutline(s: number): [number, number][] {
  const pts: [number, number][] = [];
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + 0.2 + (i / (n - 1)) * (Math.PI * 2 - 0.4);
    const lobe = Math.abs(Math.cos((a + Math.PI / 2) * 2.5));
    const rr = s * (0.22 + 0.3 * lobe ** 3);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}
/** An oak leaf: long, its rounded lobes, its stalk at y 0. */
function oakOutline(s: number): [number, number][] {
  const right: [number, number][] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w =
      s * 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 * (0.75 + 0.25 * Math.abs(Math.sin(t * Math.PI * 4)));
    right.push([w, -s * 0.5 + t * s]);
  }
  return [
    ...right,
    ...right
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => [-x, y] as [number, number]),
  ];
}

/** A swag along the wall between hooks: its points, sagging `sag` from y at its ends. */
const swag = (x0: number, x1: number, y: number, sag: number, z: number, n = 12): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [x0 + (x1 - x0) * t, y - sag * Math.sin(t * Math.PI), z];
  });
/** A point along a swag, t 0..1. */
function along(h: V3[], t: number): V3 {
  const f = t * (h.length - 1);
  const i = Math.min(h.length - 2, Math.floor(f));
  const k = f - i;
  return [
    h[i][0] + (h[i + 1][0] - h[i][0]) * k,
    h[i][1] + (h[i + 1][1] - h[i][1]) * k,
    h[i][2] + (h[i + 1][2] - h[i][2]) * k,
  ];
}

/** An autumn garland (wall, 3 wide), swagged from three hooks over heads on a twine: maple leaves in
 *  their reds and golds with berries, oak leaves and acorns, or a harvest of leaves, little pumpkins and
 *  wheat. */
export function leafGarland(m: Model, o: Look) {
  const z = FACE + 0.04;
  const halves = [swag(0.12, 1.5, 2.24, 0.26, z), swag(1.5, 2.88, 2.24, 0.26, z)];
  const cols = [S.red, S.orange, S.gold, S.rust, S.brown];
  const maple = mapleOutline(0.17);
  const oak = oakOutline(0.16);
  for (const [hi, h] of halves.entries()) {
    m.add(tube(h, 0.005, 4, 20), S.twine);
    const n = 22;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = along(h, t);
      const k = hi * n + i;
      const isOak = o.look === 1 ? k % 4 !== 3 : o.look === 2 ? k % 3 === 1 : false;
      const c = cols[Math.floor(rnd(k, 1, o.seed + 1) * cols.length)];
      const turn = (rnd(k, 2, 1) - 0.5) * 2.6 + Math.PI;
      m.add(extrude(isOak ? oak : maple, 0.003), c, {
        at: [p[0] + (rnd(k, 3, 1) - 0.5) * 0.06, p[1] - 0.05 - rnd(k, 4, 1) * 0.04, p[2] + 0.02 + (k % 3) * 0.012],
        rot: [(rnd(k, 5, 1) - 0.5) * 0.7, (rnd(k, 6, 1) - 0.5) * 0.7, turn],
      });
      // (its vein, a shade darker)
      if (k % 2 === 0)
        m.add(box([0.003, 0.08, 0.002]), shade(c, 0.7), {
          at: [p[0] + (rnd(k, 3, 1) - 0.5) * 0.06, p[1] - 0.05 - rnd(k, 4, 1) * 0.04, p[2] + 0.024 + (k % 3) * 0.012],
          rot: [(rnd(k, 5, 1) - 0.5) * 0.7, (rnd(k, 6, 1) - 0.5) * 0.7, turn],
        });
    }
    // what's tucked in among them
    for (let i = 0; i < 6; i++) {
      const p = along(h, (i + 0.3) / 6);
      const at: V3 = [p[0], p[1] - 0.03, p[2] + 0.06];
      if (o.look === 1) {
        // acorns in pairs
        for (const s of [-1, 1]) {
          m.add(ball(0.013, 6), S.acorn, { at: [at[0] + s * 0.014, at[1] - 0.012, at[2]], scale: [1, 1.3, 1] });
          m.add(ball(0.014, 6), S.cap, { at: [at[0] + s * 0.014, at[1] + 0.002, at[2]], scale: [1, 0.6, 1] });
        }
      } else if (o.look === 2) {
        if (i % 2 === 0) {
          // a little pumpkin
          m.add(pumpkinGeo(0.035, 7, 0.75), i % 4 ? S.pumpkin : S.white, { at });
          m.add(cyl(0.005, 0.004, 0.02, 4), S.stem, { at: [at[0], at[1] + 0.024, at[2]] });
        } else {
          // a sheaf of wheat
          for (let s = -2; s <= 2; s++) {
            m.add(box([0.003, 0.14, 0.003]), S.wheat, {
              at: [at[0] + s * 0.008, at[1] - 0.02, at[2]],
              rot: [0, 0, s * 0.12],
            });
            m.add(ball(0.009, 4), S.wheat, {
              at: [at[0] + s * 0.018, at[1] + 0.06, at[2]],
              scale: [0.7, 2.2, 0.7],
              rot: [0, 0, s * 0.12],
            });
          }
          m.add(box([0.04, 0.012, 0.012]), S.twine, { at: [at[0], at[1] - 0.03, at[2] + 0.004] });
        }
      } else {
        // a cluster of rowan berries
        for (let b = 0; b < 5; b++)
          m.add(ball(0.009, 5), 0xc8301e, {
            at: [at[0] + Math.cos(b * 1.3) * 0.015, at[1] + Math.sin(b * 1.3) * 0.012, at[2]],
          });
      }
    }
  }
  // the hooks, a twine bow at each
  for (const x of [0.12, 1.5, 2.88]) {
    m.add(box([0.024, 0.024, 0.03], 0.004), P.brass, { at: [x, 2.25, FACE + 0.015] });
    for (const s of [-1, 1])
      m.add(ring(0.028, 0.005, 3, 10).rotateX(-Math.PI / 2), S.twine, {
        at: [x + s * 0.03, 2.25, z + 0.01],
        rot: [0, 0, s * 0.4],
      });
  }
}

// ── bunting (wall, 3 wide) ──────────────────────────────────────────────────────────────────────

/** Bunting (wall, 3 wide): triangular flags on a cord swagged in two from three hooks — in rainbow
 *  colours, pastels with polka dots, or spelling HAPPY BIRTHDAY a letter a flag. */
export function bunting(m: Model, o: Look) {
  const z = FACE + 0.03;
  const halves = [swag(0.08, 1.5, 2.28, 0.26, z), swag(1.5, 2.92, 2.28, 0.26, z)];
  const words = ["HAPPY", "BIRTHDAY"];
  for (const [hi, h] of halves.entries()) {
    m.add(tube(h, 0.004, 3, 20), P.lace);
    const n = o.look === 2 ? words[hi].length + (hi === 0 ? 2 : 0) : 7;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = along(h, t);
      const q = along(h, Math.min(1, t + 0.02));
      const slope = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const k = hi * 7 + i;
      const c =
        o.look === 1
          ? PASTEL[k % PASTEL.length]
          : o.look === 2
            ? [0x2a3f6a, 0xb8322a, 0xd9a441, 0x3a8a8a][k % 4]
            : RAINBOW[k % RAINBOW.length];
      // (each flag a little turned on the cord, as it hangs)
      const sway = (rnd(k, 1, o.seed) - 0.5) * 0.12;
      const rot: V3 = [0.05 + rnd(k, 2, 1) * 0.08, 0, slope + sway];
      m.add(
        extrude(
          [
            [-0.085, 0],
            [0.085, 0],
            [0, -0.22],
          ],
          0.002,
        ),
        c,
        { at: [p[0], p[1] - 0.004, p[2]], rot },
      );
      // the hem folded over the cord
      m.add(box([0.17, 0.016, 0.006]), shade(c, 0.85), { at: [p[0], p[1] - 0.004, p[2]], rot });
      if (o.look === 1 && k % 2 === 0)
        for (const [du, dv] of [
          [-0.035, -0.04],
          [0.03, -0.05],
          [0, -0.1],
          [-0.012, -0.15],
        ])
          m.add(
            cyl(0.011, 0.011, 0.002, 8)
              .rotateX(Math.PI / 2)
              .translate(du, dv, 0.0015),
            P.white,
            {
              at: [p[0], p[1] - 0.004, p[2]],
              rot,
            },
          );
      if (o.look === 2) {
        const ch = hi === 0 ? (i === 0 || i === n - 1 ? "" : words[0][i - 1]) : words[1][i];
        const g = ch ? dotText(ch, 0.012) : null;
        if (g) m.add(g.translate(0, -0.075, 0.0015), P.white, { at: [p[0], p[1] - 0.004, p[2]], rot });
      }
    }
  }
  for (const x of [0.08, 1.5, 2.92]) m.add(box([0.022, 0.022, 0.03], 0.004), P.brass, { at: [x, 2.29, FACE + 0.015] });
}

// ── paper chains (from the ceiling, 3 wide) ─────────────────────────────────────────────────────

/** Paper chains hung from the ceiling (3×1): two chains of paper loops, each loop through the last
 *  and turned to it, one in a long swag, one in two; rainbow, pastel, or gold and silver for the New
 *  Year. By its seed a honeycomb paper ball hung where they cross. */
export function paperChains(m: Model, o: Look) {
  const cols = [RAINBOW, PASTEL, METAL][o.look] ?? RAINBOW;
  const top = CEILING - 0.02;
  const chain = (path: (t: number) => V3, len: number, k0: number) => {
    const n = Math.round(len / 0.085);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const a = path(t);
      const b = path(Math.min(1, t + 0.01));
      const c0 = path(Math.max(0, t - 0.01));
      const slope = Math.atan2(b[1] - c0[1], b[0] - c0[0]);
      // (a loop: a band of paper, open, seen from both sides; every other one turned to its neighbours)
      // (each a band 3 cm wide, turned half one way and half the other round the chain, so both show)
      const g = new CylinderGeometry(0.034, 0.034, 0.03, 10, 1, true);
      g.scale(1.5, 1, 1).rotateX(i % 2 ? Math.PI / 4 : -Math.PI / 4);
      const c = cols[(k0 + i) % cols.length];
      m.add(g.clone(), c, { at: a, rot: [0, 0, slope] });
      m.add(g, shade(c, 0.78), { at: a, rot: [0, 0, slope], scale: [1, 1, -1] });
    }
  };
  // (from tacks in the ceiling: a catenary across, and two shorter swags)
  const ends: V3[] = [
    [0.1, top, 0.32],
    [2.9, top, 0.32],
  ];
  chain((t) => [ends[0][0] + (ends[1][0] - ends[0][0]) * t, top - 0.5 * Math.sin(t * Math.PI), 0.32], 3.1, 0);
  for (const [x0, x1] of [
    [0.1, 1.5],
    [1.5, 2.9],
  ])
    chain((t) => [x0 + (x1 - x0) * t, top - 0.32 * Math.sin(t * Math.PI), 0.68], 1.6, 3);
  for (const [x, zz] of [
    [0.1, 0.32],
    [2.9, 0.32],
    [0.1, 0.68],
    [1.5, 0.68],
    [2.9, 0.68],
  ])
    m.add(cyl(0.012, 0.012, 0.02, 6), P.white, { at: [x, CEILING - 0.02, zz] });
  if (o.seed > 0.35) {
    // a honeycomb ball, on a thread from the middle
    const c = cols[Math.floor(o.seed * 7) % cols.length];
    m.add(cyl(0.0015, 0.0015, 0.32, 3), P.white, { at: [1.5, CEILING - 0.33, 0.5] });
    const prof: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI;
      prof.push([Math.sin(a) * 0.13 * (i % 2 ? 0.94 : 1), -Math.cos(a) * 0.13]);
    }
    m.add(lathe(prof, 16), c, { at: [1.5, CEILING - 0.47, 0.5] });
    m.add(ring(0.132, 0.004, 3, 16), shade(c, 0.8), { at: [1.5, CEILING - 0.47, 0.5] });
  }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  pumpkins,
  jack_o_lantern: jackOLantern,
  leaf_garland: leafGarland,
  bunting,
  paper_chains: paperChains,
};
