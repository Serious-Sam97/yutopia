import { glyphDots } from "@yutopia/shared/glyphs";
import {
  type BufferGeometry,
  Euler,
  Float32BufferAttribute,
  BufferGeometry as Geo,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import {
  ball,
  box,
  cushion,
  cyl,
  extrude,
  type Look,
  lathe,
  type Model,
  merged,
  type PartOpts,
  ring,
  rod,
  tube,
  type V3,
} from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 10 (docs/plan/68-more-furniture.md): Play & music — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/music.ts. A drum kit on its rug with the drummer's
// stool, an electric guitar on its stand by its amp, a DJ booth on its riser (the records spinning),
// a synth on an X stand, a karaoke machine with its screen and a light going round, a gong in its
// frame, a theremin, a metronome ticking. Where they're played from: PLAY.

export const LOOKS: Record<string, readonly string[]> = {
  drum_kit: ["Red sparkle", "Natural maple", "Black and brass"],
  guitar_amp: ["Sunburst and tweed", "Cherry and black", "Arctic white and cream"],
  dj_booth: ["Club black", "Walnut", "White studio"],
  synth_stand: ["Vintage wood", "Stage red", "Black workstation"],
  karaoke: ["Party black", "Bubblegum pink", "Retro silver"],
  gong: ["Red lacquer", "Teak", "Iron ring"],
  theremin: ["Walnut", "Black", "Art deco cabinet"],
  metronome: ["Walnut", "Black lacquer", "Cherry red"],
};

/** Where each is played from, m in its own frame (rot 0): for the behaviours to come. */
export const PLAY = {
  // the drummer's stool (its middle, its top), facing +z over the kit; the snare's head, the bass
  // drum's pedal
  drum_kit: { stool: [1, 0.36], top: 0.5, snare: [0.55, 0.66, 0.72], pedal: [1, 0.02, 0.92] },
  // the guitar's middle on its stand (picked up from here), the amp's middle
  guitar_amp: { guitar: [0.5, 0.36, 0.52], amp: [1.38, 0.35] },
  // the DJ's spot on the riser (facing +z over the decks), the riser's top, the decks' platters
  dj_booth: {
    dj: [1, 0.65],
    riser: 0.15,
    decks: [
      [0.51, 1.07, 1.45],
      [1.41, 1.07, 1.45],
    ],
  },
  // the keys' top and their front edge, across x0..x1 (played standing, from +z)
  synth_stand: { keys: 0.985, front: 0.66, x0: 0.17, x1: 0.85 },
  // the screen's picture: across x0..x1 at z (its face), y0..y1 m up (for a media glass)
  karaoke: { x0: 0.25, x1: 0.75, z: 0.42, y0: 1.13, y1: 1.41 },
  // the gong's middle, its radius, its face (z)
  gong: { at: [0.5, 0.95], r: 0.35, face: 0.52 },
  // the pitch antenna (x, z, top), the volume loop's middle (x, y, z)
  theremin: { pitch: [0.72, 0.5, 1.47], loop: [0.12, 0.97, 0.5] },
} as const;

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
const mat = (at: V3, rot: V3 = [0, 0, 0], s?: V3) =>
  new Matrix4().compose(
    new Vector3(...at),
    new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], "YXZ")),
    s ? new Vector3(...s) : new Vector3(1, 1, 1),
  );
/** Parts placed in a frame of their own (a tilted tom, a leaning guitar): `at`/`rot` in it. */
function framed(m: Model, base: Matrix4) {
  return (g: BufferGeometry, c: number, o: PartOpts = {}) => {
    g.applyMatrix4(mat(o.at ?? [0, 0, 0], o.rot, o.scale)).applyMatrix4(base);
    m.add(g, c, { tone: o.tone, glow: o.glow });
  };
}
const placed = (g: BufferGeometry, base: Matrix4, at: V3 = [0, 0, 0], rot?: V3) =>
  g.applyMatrix4(mat(at, rot)).applyMatrix4(base);
const pt = (base: Matrix4, p: V3): V3 => {
  const v = new Vector3(...p).applyMatrix4(base);
  return [v.x, v.y, v.z];
};

/** Words in the shared dot face, flat on a face looking +z, centred on (cx, cy): each dot `p`. */
function dotsAt(text: string, cx: number, cy: number, z: number, p: number): BufferGeometry | null {
  const pos: number[] = [];
  const d = p * 0.82;
  const x = cx - (text.length * 6 - 1) * p * 0.5;
  const y = cy + 3.5 * p;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) {
      const x0 = x + (i * 6 + c) * p;
      const y1 = y - r * p;
      pos.push(x0, y1 - d, z, x0 + d, y1 - d, z, x0 + d, y1, z, x0, y1 - d, z, x0 + d, y1, z, x0, y1, z);
    }
  return pos.length ? geo(pos) : null;
}

/** A side's profile (z, y) cut from a panel `t` thick, standing at x. */
function side(m: Model, profile: [number, number][], x: number, t: number, color: number, o: PartOpts = {}) {
  m.add(extrude(profile, t), color, { ...o, at: [x, 0, 0], rot: [0, -Math.PI / 2, 0] });
}

// ── the drum kit (2×2, its stool behind it) ───────────────────────────────────────────────────────
/** A drum in its own frame: its axis up y, its middle at 0 — the shell, the heads, the hoops and the
 *  lugs round it. */
function drum(
  add: ReturnType<typeof framed>,
  r: number,
  depth: number,
  shell: number,
  hw: number,
  head: number,
  front?: number,
) {
  add(cyl(r, r, depth, 20), shell, { at: [0, -depth / 2, 0] });
  add(cyl(r * 0.985, r * 0.985, 0.003, 20), head, { at: [0, depth / 2, 0] });
  add(cyl(r * 0.985, r * 0.985, 0.003, 20), front ?? head, { at: [0, -depth / 2 - 0.003, 0] });
  for (const y of [depth / 2 - 0.006, -depth / 2 + 0.006]) add(ring(r + 0.004, 0.007, 3, 20), hw, { at: [0, y, 0] });
  const n = r > 0.2 ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    add(box([0.014, Math.min(0.07, depth * 0.4), 0.018]), hw, {
      at: [Math.cos(a) * (r + 0.008), 0, Math.sin(a) * (r + 0.008)],
      rot: [0, -a, 0],
    });
  }
}
/** A cymbal: its bell and its bow, `r` across, in its own frame. */
const cymbal = (r: number) =>
  lathe(
    [
      [0.001, 0.024],
      [0.03, 0.022],
      [0.045, 0.01],
      [r, -0.004],
      [r - 0.004, -0.007],
      [0.045, 0.006],
      [0.03, 0.018],
      [0.001, 0.02],
    ],
    20,
  );
/** A stand's three legs from (x, y, z) to the floor, `spread` out. */
function tripod(m: Model, x: number, y: number, z: number, spread: number, c: number, turn = 0.4, r = 0.007) {
  for (let i = 0; i < 3; i++) {
    const a = turn + (i / 3) * Math.PI * 2;
    m.add(
      tube(
        [
          [x, y, z],
          [x + Math.cos(a) * spread * 0.55, y * 0.4, z + Math.sin(a) * spread * 0.55],
          [x + Math.cos(a) * spread, 0.01, z + Math.sin(a) * spread],
        ],
        r,
        4,
        5,
      ),
      c,
    );
    m.add(ball(r * 1.6, 5), P.rubber, { at: [x + Math.cos(a) * spread, r * 1.4, z + Math.sin(a) * spread] });
  }
}

function drumKit(m: Model, o: Look) {
  const v = o.look;
  const shell = [0xa3202a, P.oakLight, 0x1a191b][v] ?? 0xa3202a;
  const hw = v === 2 ? P.brass : P.chrome;
  const head = 0xeee8da;
  const brass = 0xd4a540;
  // the rug under it
  m.add(box([1.9, 0.01, 1.76], 0.003), [0x3a2e4a, 0x5a3a2a, 0x2a2e33][v] ?? 0x3a2e4a, { at: [1, 0.005, 0.95] });
  // the bass drum on its side, its front head out to the room with the band's name
  const BD: V3 = [1, 0.29, 1.27];
  const bdr = 0.28;
  const bdd = 0.42;
  drum(framed(m, mat(BD, [Math.PI / 2, 0, 0])), bdr, bdd, shell, hw, head, head);
  const fz = BD[2] + bdd / 2 + 0.004;
  const front = [0x15141a, P.cream, 0x15141a][v] ?? 0x15141a;
  m.add(cyl(bdr * 0.985, bdr * 0.985, 0.004, 22), front, { at: [BD[0], BD[1], fz - 0.002], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(0.06, 0.06, 0.002, 14), 0x0c0c0e, {
    at: [BD[0] + 0.14, BD[1] - 0.12, fz + 0.002],
    rot: [Math.PI / 2, 0, 0],
  });
  const NAMES = ["YUTOPIA", "SNOWDAYS", "NIGHTSHIFT", "VORTEX"];
  const name = NAMES[Math.floor(o.seed * NAMES.length) % NAMES.length];
  const p = Math.min(0.0095, 0.38 / (name.length * 6));
  const word = dotsAt(name, BD[0], BD[1] + 0.03, fz + 0.003, p);
  if (word) m.add(word, [P.mustard, 0xa3202a, brass][v] ?? P.mustard);
  for (const s of [-1, 1])
    m.add(ring(0.12, 0.004, 3, 22).rotateX(Math.PI / 2), [P.mustard, 0xa3202a, brass][v] ?? P.mustard, {
      at: [BD[0], BD[1] + 0.03, fz + 0.003],
      scale: [1.78, 0.52 + s * 0.03, 1],
    });
  // its spurs, the pedal and its beater
  for (const s of [-1, 1])
    m.add(
      tube(
        [
          [BD[0] + s * 0.27, 0.18, BD[2] + 0.1],
          [BD[0] + s * 0.33, 0.06, BD[2] + 0.16],
          [BD[0] + s * 0.35, 0.01, BD[2] + 0.18],
        ],
        0.007,
        4,
        4,
      ),
      hw,
    );
  const [px, , pz] = PLAY.drum_kit.pedal;
  m.add(box([0.09, 0.02, 0.24], 0.004), P.graphite, { at: [px, 0.04, pz], rot: [-0.18, 0, 0] });
  m.add(box([0.14, 0.12, 0.03], 0.004), P.graphite, { at: [px, 0.08, BD[2] - bdd / 2 - 0.03] });
  m.add(rod(0.004, 0.004, 0.16, "x", 4).rotateZ(Math.PI / 2), hw, {
    at: [px, 0.2, BD[2] - bdd / 2 - 0.05],
    rot: [0.3, 0, 0],
  });
  m.add(ball(0.025, 8), P.cream, { at: [px, 0.28, BD[2] - bdd / 2 - 0.03], scale: [1, 1, 0.7] });
  // the toms on their holder over the bass drum, tipped to the drummer
  m.add(cyl(0.012, 0.012, 0.2), hw, { at: [BD[0], BD[1] + bdr - 0.02, BD[2] - 0.02] });
  for (const [x, r, d, rz] of [
    [0.83, 0.155, 0.2, 0.18],
    [1.18, 0.17, 0.22, -0.18],
  ] as const) {
    const at: V3 = [x, 0.8, BD[2] - 0.12];
    drum(framed(m, mat(at, [-0.4, 0, rz])), r, d, shell, hw, head);
    m.add(
      tube(
        [
          [BD[0], BD[1] + bdr + 0.17, BD[2] - 0.02],
          [(x + BD[0]) / 2, 0.74, BD[2] - 0.06],
          [x, 0.72, BD[2] - 0.08],
        ],
        0.008,
        4,
        4,
      ),
      hw,
    );
  }
  // the floor tom on its legs, to the drummer's right
  const FT: V3 = [1.52, 0.42, 0.8];
  drum(framed(m, mat(FT)), 0.2, 0.36, shell, hw, head);
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + (i / 3) * Math.PI * 2;
    m.add(
      tube(
        [
          [FT[0] + Math.cos(a) * 0.215, FT[1] + 0.1, FT[2] + Math.sin(a) * 0.215],
          [FT[0] + Math.cos(a) * 0.25, 0.01, FT[2] + Math.sin(a) * 0.25],
        ],
        0.007,
        4,
        2,
      ),
      hw,
    );
    m.add(ball(0.012, 5), P.rubber, { at: [FT[0] + Math.cos(a) * 0.25, 0.012, FT[2] + Math.sin(a) * 0.25] });
  }
  // the snare on its stand: its wires under, its throw-off
  const [sx, sy, sz] = PLAY.drum_kit.snare;
  const sn = mat([sx, sy - 0.07, sz], [-0.12, 0, 0.08]);
  drum(framed(m, sn), 0.178, 0.13, shell, hw, head);
  for (let i = -3; i <= 3; i++) framed(m, sn)(box([0.004, 0.003, 0.22]), P.alum, { at: [i * 0.02, -0.07, 0] });
  m.add(cyl(0.01, 0.01, sy - 0.15), hw, { at: [sx, 0.2, sz] });
  tripod(m, sx, 0.25, sz, 0.24, hw, 1.1);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    m.add(
      tube(
        [
          [sx, sy - 0.16, sz],
          [sx + Math.cos(a) * 0.12, sy - 0.15, sz + Math.sin(a) * 0.12],
        ],
        0.005,
        3,
        2,
      ),
      hw,
    );
  }
  // the hi-hat: its stand, the pair of cymbals, the pedal
  const HH: V3 = [0.24, 0.92, 0.66];
  m.add(cyl(0.011, 0.011, HH[1] - 0.28), hw, { at: [HH[0], 0.28, HH[2]] });
  m.add(cyl(0.005, 0.005, 0.1), hw, { at: [HH[0], HH[1], HH[2]] });
  tripod(m, HH[0], 0.3, HH[2], 0.2, hw, 0.9);
  m.add(box([0.08, 0.015, 0.2], 0.004), P.graphite, { at: [HH[0], 0.03, HH[2] - 0.14], rot: [-0.15, 0, 0] });
  m.add(cymbal(0.18), brass, { at: [HH[0], HH[1], HH[2]] });
  m.add(cymbal(0.18), brass, { at: [HH[0], HH[1] + 0.035, HH[2]] });
  // the crash on its boom, and the ride
  for (const [stx, stz, top, at, r, tilt] of [
    [0.3, 1.2, 1.22, [0.44, 1.38, 1.06] as V3, 0.2, [-0.3, 0, 0.15] as V3],
    [1.74, 1.24, 1.0, [1.62, 1.13, 1.04] as V3, 0.23, [-0.25, 0, -0.12] as V3],
  ] as const) {
    m.add(cyl(0.011, 0.011, top - 0.3), hw, { at: [stx, 0.3, stz] });
    tripod(m, stx, 0.32, stz, 0.2, hw, 0.2);
    m.add(
      tube(
        [
          [stx, top, stz],
          [(stx + at[0]) / 2, at[1] - 0.02, (stz + at[2]) / 2],
          [at[0], at[1] - 0.04, at[2]],
        ],
        0.008,
        4,
        5,
      ),
      hw,
    );
    m.add(cymbal(r), brass, { at, rot: tilt });
  }
  // the stool: its round seat, its post and legs
  const [tx, tz] = PLAY.drum_kit.stool;
  const top = PLAY.drum_kit.top;
  m.add(cushion([0.34, 0.08, 0.34], 0.3), P.ink, { at: [tx, top - 0.04, tz] });
  m.add(cyl(0.16, 0.16, 0.02, 16), P.graphite, { at: [tx, top - 0.09, tz] });
  m.add(cyl(0.016, 0.016, top - 0.35), hw, { at: [tx, 0.26, tz] });
  tripod(m, tx, 0.27, tz, 0.24, hw, 0.6, 0.009);
  // (story) the sticks crossed on the snare
  const stick = (a: number, dx: number) =>
    m.add(rod(0.006, 0.0045, 0.4, "x", 6), P.oakLight, { at: [sx + dx, sy + 0.012, sz + 0.02], rot: [0, a, 0] });
  if (o.seed > 0.3) {
    stick(0.5, -0.02);
    stick(0.75, 0.02);
  }
}

// ── the electric guitar on its stand, and its amp (2×1) ───────────────────────────────────────────
/** A double-cut body's outline, its middle at 0, the neck up +y. */
const BODY: [number, number][] = [
  [0, -0.235],
  [0.08, -0.226],
  [0.14, -0.19],
  [0.165, -0.12],
  [0.158, -0.05],
  [0.125, 0.0],
  [0.118, 0.04],
  [0.127, 0.09],
  [0.122, 0.13],
  [0.104, 0.15],
  [0.086, 0.137],
  [0.068, 0.105],
  [0.048, 0.078],
  [0.028, 0.07],
  [-0.028, 0.07],
  [-0.05, 0.088],
  [-0.074, 0.138],
  [-0.093, 0.185],
  [-0.112, 0.204],
  [-0.132, 0.192],
  [-0.14, 0.13],
  [-0.13, 0.05],
  [-0.138, -0.01],
  [-0.165, -0.07],
  [-0.165, -0.13],
  [-0.14, -0.19],
  [-0.08, -0.226],
];
function guitarAmp(m: Model, o: Look) {
  const v = o.look;
  const body = [0x4a1e10, 0x9a1c22, 0xeee8dc][v] ?? 0x4a1e10;
  const guard = [0xf0ebe0, 0x1a1a1c, 0x6a3a26][v] ?? 0xf0ebe0;
  const board = [0x3a2418, 0x3a2418, 0xe0c08a][v] ?? 0x3a2418;
  const neckC = 0xd9b07a;
  const tolex = [0xc9b48a, 0x1c1c1e, 0xe6dcc4][v] ?? 0xc9b48a;
  const cloth = [0x6a3a2a, 0xb8b8b0, 0x5e2a24][v] ?? 0x6a3a2a;
  // the guitar: its frame, leant back on its stand
  const [gx, gy, gz] = PLAY.guitar_amp.guitar;
  const base = mat([gx, gy, gz], [-0.2, 0, 0]);
  const g = framed(m, base);
  g(extrude(BODY, 0.045, 0.006, 2), body);
  if (v === 0)
    g(
      extrude(
        BODY.map(([x, y]) => [x * 0.72, y * 0.72 - 0.015] as [number, number]),
        0.0462,
        0,
        1,
      ),
      0xd9922a,
      { tone: 0.95 },
    );
  // the guard, the pickups, the bridge, the knobs and the switch, the jack
  const GUARD: [number, number][] = [
    [0.03, 0.088],
    [0.075, 0.12],
    [0.095, 0.1],
    [0.1, 0.03],
    [0.13, -0.05],
    [0.12, -0.13],
    [0.06, -0.17],
    [-0.02, -0.15],
    [-0.11, -0.11],
    [-0.125, -0.05],
    [-0.1, 0.02],
    [-0.1, 0.07],
    [-0.03, 0.088],
  ];
  g(extrude(GUARD, 0.003), guard, { at: [0, 0, 0.0235] });
  for (const y of [0.05, -0.005, -0.065])
    g(box([0.075, 0.018, 0.006], 0.003), v === 1 ? P.ink : P.cream, {
      at: [0, y, 0.027],
      rot: [0, 0, y < -0.04 ? 0.15 : 0],
    });
  g(box([0.075, 0.03, 0.007], 0.002), P.chrome, { at: [0, -0.115, 0.027] });
  for (const [x, y] of [
    [0.085, -0.085],
    [0.1, -0.12],
    [0.11, -0.155],
  ])
    g(cyl(0.011, 0.01, 0.014, 10), v === 1 ? P.ink : P.cream, { at: [x, y, 0.025], rot: [Math.PI / 2, 0, 0] });
  g(box([0.004, 0.012, 0.02]), P.ink, { at: [0.075, -0.035, 0.03], rot: [0, 0, -0.5] });
  // the neck, its board, frets and dots, the nut, the headstock and its tuners
  const NUT = 0.54;
  const BR = -0.11;
  const scale = NUT - BR;
  g(box([0.052, NUT - 0.06, 0.022], 0.004), neckC, { at: [0, (NUT + 0.06) / 2, 0.006] });
  g(box([0.054, NUT - 0.1, 0.006]), board, { at: [0, (NUT + 0.1) / 2, 0.02] });
  for (let n = 1; n <= 20; n++) {
    const y = NUT - scale * (1 - 2 ** (-n / 12));
    if (y < 0.1) break;
    g(box([0.054, 0.002, 0.0015]), P.alum, { at: [0, y, 0.0235] });
    if ([3, 5, 7, 9, 15, 17].includes(n) || n === 12) {
      const yy = NUT - scale * (1 - 2 ** (-(n - 0.5) / 12));
      for (const dx of n === 12 ? [-0.012, 0.012] : [0])
        g(cyl(0.0035, 0.0035, 0.001, 8), v === 2 ? P.ink : P.cream, { at: [dx, yy, 0.0235], rot: [Math.PI / 2, 0, 0] });
    }
  }
  g(box([0.054, 0.006, 0.008]), P.cream, { at: [0, NUT, 0.022] });
  g(
    extrude(
      [
        [-0.027, 0],
        [0.027, 0],
        [0.034, 0.05],
        [0.05, 0.12],
        [0.046, 0.19],
        [0.018, 0.2],
        [-0.008, 0.17],
        [-0.028, 0.08],
      ],
      0.016,
      0.003,
    ),
    v === 1 ? body : neckC,
    { at: [0, NUT, 0.004] },
  );
  for (let i = 0; i < 6; i++) {
    const y = NUT + 0.035 + i * 0.026;
    g(cyl(0.005, 0.005, 0.01, 8), P.chrome, { at: [-0.012 + i * 0.006, y, 0.012], rot: [Math.PI / 2, 0, 0] });
    g(box([0.016, 0.01, 0.008], 0.003), P.chrome, { at: [-0.036 + i * 0.006, y, -0.002] });
  }
  // the strings, from the bridge to the nut
  for (let i = 0; i < 6; i++) {
    const [xb, xn] = [(-2.5 + i) * 0.0105, (-2.5 + i) * 0.0075];
    const len = NUT - BR;
    g(box([0.0009, len, 0.0009]), P.alum, {
      at: [(xb + xn) / 2, (NUT + BR) / 2, 0.0275],
      rot: [0, 0, Math.atan2(xb - xn, len)],
    });
  }
  // the stand: three legs, the cradle the body rests in, the post to the yoke round the neck
  const hub: V3 = [gx, 0.24, gz - 0.06];
  tripod(m, hub[0], hub[1], hub[2], 0.24, P.ink, Math.PI / 2 + 0.6, 0.008);
  for (const s of [-1, 1]) {
    const cr = pt(base, [s * 0.11, -0.23, 0.04]);
    m.add(tube([hub, [cr[0], cr[1] - 0.02, cr[2] - 0.01], [cr[0], cr[1] + 0.03, cr[2] + 0.01]], 0.008, 4, 6), P.ink);
  }
  const yoke = pt(base, [0, 0.36, -0.03]);
  m.add(tube([hub, [gx, (hub[1] + yoke[1]) / 2, (hub[2] + yoke[2]) / 2 - 0.04], yoke], 0.009, 5, 8), P.ink);
  g(
    ring(0.036, 0.006, 3, 12)
      .rotateX(Math.PI / 2)
      .scale(1, 0.4, 1),
    P.rubber,
    { at: [0, 0.36, 0.004] },
  );
  // the amp: its tolex, the grille and its piping, the control plate, knobs, the jewel lit, handle
  const [ax, az] = PLAY.guitar_amp.amp;
  const [AW, AH, AD] = [0.62, 0.48, 0.26];
  const AF = az + AD / 2;
  m.add(box([AW, AH, AD], 0.025, 2), tolex, { at: [ax, AH / 2 + 0.015, az] });
  if (v === 0) for (const y of [0.05, 0.45]) m.add(box([AW + 0.002, 0.012, AD + 0.002]), 0x6a4a2a, { at: [ax, y, az] });
  m.add(box([AW - 0.08, AH - 0.14, 0.006]), cloth, { at: [ax, 0.2, AF] });
  m.add(box([AW - 0.07, AH - 0.13, 0.004]), shade(cloth, 0.7), { at: [ax, 0.2, AF - 0.002] });
  for (let i = 0; i < 9; i++)
    m.add(box([AW - 0.08, 0.0015, 0.002]), shade(cloth, 0.8), { at: [ax, 0.06 + i * 0.035, AF + 0.004] });
  m.add(box([AW - 0.06, 0.065, 0.006]), v === 1 ? P.ink : P.chrome, { at: [ax, AH - 0.045, AF] });
  for (let i = 0; i < 6; i++)
    m.add(cyl(0.012, 0.011, 0.014, 10), v === 1 ? P.chrome : P.ink, {
      at: [ax - 0.12 + i * 0.05, AH - 0.045, AF + 0.003],
      rot: [Math.PI / 2, 0, 0],
    });
  m.add(ball(0.011, 8), 0xff3a2a, { at: [ax + 0.2, AH - 0.045, AF + 0.004], glow: true });
  for (const x of [ax - 0.23, ax - 0.19])
    m.add(cyl(0.007, 0.007, 0.01, 8), P.ink, { at: [x, AH - 0.045, AF + 0.002], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.1, 0.022, 0.004]), v === 1 ? P.white : P.cream, {
    at: [ax - 0.15, 0.36, AF + 0.005],
    rot: [0, 0, 0.12],
  });
  m.add(box([0.16, 0.02, 0.04], 0.008), v === 0 ? 0x5a3a20 : P.ink, { at: [ax, AH + 0.025, az] });
  for (const sx of [-1, 1])
    for (const sy of [0, 1])
      m.add(box([0.04, 0.04, 0.04], 0.008), v === 0 ? 0x5a3a20 : P.ink, {
        at: [ax + sx * (AW / 2 - 0.012), 0.025 + sy * (AH - 0.02), AF - 0.012],
      });
  // the lead: from the guitar's jack down, across the floor (through a pedal, by its seed), up to the
  // amp's input
  const jack = pt(base, [0.13, -0.17, 0]);
  const input: V3 = [ax - 0.21, AH - 0.045, AF + 0.01];
  const pedal = o.seed > 0.4;
  const PD: V3 = [0.98, 0, 0.64];
  if (pedal) {
    m.add(box([0.075, 0.05, 0.12], 0.008), [P.mustard, 0x2f7a43, 0xd8322b][v] ?? P.mustard, {
      at: [PD[0], 0.025, PD[2]],
    });
    m.add(cyl(0.01, 0.01, 0.014, 8), P.chrome, { at: [PD[0], 0.05, PD[2] + 0.03] });
    m.add(ball(0.004, 4), 0xff3a2a, { at: [PD[0], 0.051, PD[2] - 0.035], glow: true });
    for (const dx of [-0.02, 0.02]) m.add(cyl(0.008, 0.008, 0.01, 8), P.ink, { at: [PD[0] + dx, 0.05, PD[2] - 0.01] });
  }
  m.add(
    tube(
      [
        jack,
        [jack[0] + 0.06, 0.05, jack[2] + 0.1],
        [0.72, 0.008, 0.72],
        ...(pedal
          ? ([
              [PD[0] - 0.05, 0.02, PD[2]],
              [PD[0] + 0.05, 0.02, PD[2]],
            ] as V3[])
          : ([[0.95, 0.008, 0.72]] as V3[])),
        [1.12, 0.008, 0.66],
        [input[0] - 0.02, 0.06, AF + 0.06],
        [input[0], input[1] - 0.03, input[2] + 0.02],
        input,
      ],
      0.0045,
      4,
      40,
    ),
    P.ink,
  );
}

// ── the DJ booth (2×2, on its riser) ──────────────────────────────────────────────────────────────
/** A booth on a low riser, the DJ behind it: its front lit in panels flashing to the room, two decks
 *  with their records turning, the mixer between them (its meters lit), headphones on it; a crate of
 *  records on the riser. */
function djBooth(m: Model, o: Look) {
  const v = o.look;
  const face = [0x18181c, P.walnut, 0xe9e6df][v] ?? 0x18181c;
  const ledA = [0x26e0f0, 0xffb347, 0xff3ac0][v] ?? 0x26e0f0;
  const ledB = [0xff3ac0, 0xffd28a, 0x4a8cff][v] ?? 0xff3ac0;
  const R = PLAY.dj_booth.riser;
  // the riser: its carpet, its lit nose
  m.add(box([1.96, R - 0.01, 1.96], 0.01), P.graphite, { at: [1, (R - 0.01) / 2, 1] });
  m.add(box([1.94, 0.012, 1.94]), [0x26262c, 0x3a2a22, 0x4a4a52][v] ?? 0x26262c, { at: [1, R - 0.006, 1] });
  m.add(box([1.9, 0.02, 0.006]), ledA, { at: [1, R / 2, 1.983], glow: true });
  // the booth: its front leaning out to the room, the desk on top
  const [Z0, Z1, Y1] = [1.15, 1.86, 1.0];
  side(
    m,
    [
      [Z0, R],
      [Z1 - 0.05, R],
      [Z1, Y1 - 0.03],
      [Z0, Y1 - 0.03],
    ],
    1,
    1.7,
    face,
  );
  m.add(box([1.76, 0.035, Z1 - Z0 + 0.04], 0.008), v === 1 ? P.walnutDark : P.ink, {
    at: [1, Y1 - 0.0175, (Z0 + Z1) / 2],
  });
  // the front's lit panels: a grid, half of it flashing at a time
  const fa = Math.atan2(0.05, Y1 - 0.03 - R);
  const fb = mat([1, R + (Y1 - 0.03 - R) / 2, Z1 - 0.025 + 0.004], [fa, 0, 0]);
  framed(m, fb)(box([1.6, 0.66, 0.006]), 0x0c0c10, { at: [0, 0, 0] });
  const tiles: [BufferGeometry[], BufferGeometry[]] = [[], []];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 12; c++) {
      const g = box([0.11, 0.13, 0.004]);
      framed(m, fb)(box([0.11, 0.13, 0.004]), shade((r + c) % 2 ? ledA : ledB, 0.35), {
        at: [-0.715 + c * 0.13, -0.24 + r * 0.16, 0.004],
      });
      tiles[(r + c) % 2].push(placed(g, fb, [-0.715 + c * 0.13, -0.24 + r * 0.16, 0.0055]));
    }
  m.live(merged(tiles[0]), ledB, { kind: "blink", period: 0.94, on: 0.5, phase: 0 }, { glow: true });
  m.live(merged(tiles[1]), ledA, { kind: "blink", period: 0.94, on: 0.5, phase: 0.5 }, { glow: true });
  // the decks: plinth, the platter and its record turning (33⅓), the arm resting on it, the pitch
  const SPIN = (33.33 / 60) * Math.PI * 2;
  for (const [i, [dx, dy, dz]] of PLAY.dj_booth.decks.entries()) {
    const px = dx + 0.04;
    m.add(box([0.45, 0.07, 0.35], 0.008), v === 2 ? P.white : P.graphite, { at: [px, Y1 + 0.035, dz] });
    m.add(cyl(0.158, 0.158, 0.008, 24), P.alumDark, { at: [dx, dy - 0.006, dz] });
    const lab = [0xd8322b, P.mustard, 0x2f7a43, 0x4a8cff][Math.floor(rnd(i, 3, o.seed) * 4)];
    const spin = { kind: "spin", axis: "y", speed: SPIN * (i ? 1 : 0.995) } as const;
    m.live(cyl(0.15, 0.15, 0.004, 28), P.vinyl, spin, { at: [dx, dy + 0.002, dz] });
    m.live(merged([cyl(0.05, 0.05, 0.001, 16).translate(0, 0.004, 0)]), lab, spin, { at: [dx, dy + 0.002, dz] });
    m.live(
      merged([
        box([0.02, 0.0015, 0.008]).translate(0.03, 0.0052, 0),
        box([0.04, 0.0006, 0.004]).translate(0.11, 0.0042, 0),
      ]),
      P.cream,
      spin,
      {
        at: [dx, dy + 0.002, dz],
      },
    );
    for (const r of [0.09, 0.115, 0.135])
      m.add(ring(r, 0.0007, 2, 28), 0x2a2a2e, { at: [dx, dy + 0.0065, dz], rot: [0, 0, 0] });
    m.add(cyl(0.004, 0.004, 0.02, 6), P.chrome, { at: [dx, dy, dz] });
    // the tonearm
    const ab: V3 = [dx + 0.18, dy + 0.0, dz - 0.12];
    m.add(cyl(0.025, 0.025, 0.02, 12), P.alumDark, { at: ab });
    m.add(
      tube(
        [
          [ab[0], ab[1] + 0.03, ab[2]],
          [ab[0] - 0.02, ab[1] + 0.03, ab[2] + 0.12],
          [dx + 0.08, dy + 0.02, dz + 0.1],
        ],
        0.004,
        4,
        8,
      ),
      P.chrome,
    );
    m.add(box([0.02, 0.012, 0.035], 0.003), P.ink, { at: [dx + 0.075, dy + 0.014, dz + 0.105], rot: [0, 0.4, 0] });
    // the pitch slider and the start button, lit
    m.add(box([0.012, 0.004, 0.13]), 0x0c0c0e, { at: [dx + 0.2, Y1 + 0.071, dz + 0.04] });
    m.add(box([0.026, 0.012, 0.016], 0.003), P.cream, {
      at: [dx + 0.2, Y1 + 0.077, dz + 0.04 + (rnd(i, 7, o.seed) - 0.5) * 0.08],
    });
    m.add(box([0.04, 0.01, 0.03], 0.003), ledA, { at: [px - 0.17, Y1 + 0.073, dz + 0.14], glow: true });
  }
  // the mixer: its faders, crossfader, knobs, the meters lit
  const MX: V3 = [0.96, Y1, 1.45];
  m.add(box([0.24, 0.09, 0.36], 0.008), P.graphite, { at: [MX[0], Y1 + 0.045, MX[2]] });
  for (const dx of [-0.05, 0.05]) {
    m.add(box([0.008, 0.003, 0.1]), 0x0c0c0e, { at: [MX[0] + dx, Y1 + 0.091, MX[2] + 0.06] });
    m.add(box([0.024, 0.014, 0.014], 0.003), P.cream, {
      at: [MX[0] + dx, Y1 + 0.097, MX[2] + 0.04 + rnd(dx, 1, o.seed) * 0.04],
    });
    for (let k = 0; k < 4; k++)
      m.add(cyl(0.01, 0.009, 0.012, 8), [P.rust, P.mustard, P.alum, P.alum][k], {
        at: [MX[0] + dx, Y1 + 0.09, MX[2] - 0.14 + k * 0.04],
      });
    for (let k = 0; k < 7; k++) {
      const lit = k < 3 + Math.floor(rnd(dx, 2, o.seed) * 4);
      m.add(box([0.012, 0.003, 0.008]), lit ? (k > 5 ? 0xff3a2a : k > 4 ? P.led : P.ledGreen) : 0x2a2a20, {
        at: [MX[0] + dx * 0.4, Y1 + 0.091, MX[2] + 0.12 - k * 0.025 - 0.12],
        glow: lit,
      });
    }
  }
  m.add(box([0.11, 0.003, 0.008]), 0x0c0c0e, { at: [MX[0], Y1 + 0.091, MX[2] + 0.155] });
  m.add(box([0.016, 0.014, 0.026], 0.003), P.cream, { at: [MX[0] + (o.seed - 0.5) * 0.08, Y1 + 0.097, MX[2] + 0.155] });
  // (story) the headphones on the desk's end, a crate of records on the riser
  const HP: V3 = [1.76, Y1, 1.42];
  for (const dz of [-0.06, 0.06]) m.add(cyl(0.045, 0.045, 0.03, 14), P.ink, { at: [HP[0], HP[1], HP[2] + dz] });
  const band: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    band.push([HP[0] + Math.sin(a) * 0.01, HP[1] + 0.03 + Math.sin(a) * 0.012, HP[2] - Math.cos(a) * 0.065]);
  }
  m.add(tube(band, 0.008, 4, 10), P.graphite);
  if (o.seed > 0.35) {
    const CR: V3 = [0.32, R, 0.34];
    m.add(box([0.36, 0.3, 0.36], 0.008), [P.oak, P.walnut, 0xe08a2a][v] ?? P.oak, { at: [CR[0], R + 0.15, CR[2]] });
    m.add(box([0.32, 0.26, 0.32]), 0x1a1612, { at: [CR[0], R + 0.155, CR[2]] });
    for (let i = 0; i < 9; i++)
      m.add(
        box([0.31, 0.31, 0.006]),
        [0xd8322b, P.cream, 0x2f5f9e, P.mustard, P.ink, 0x7a5c8a][Math.floor(rnd(i, 5, o.seed) * 6)],
        {
          at: [CR[0], R + 0.17, CR[2] - 0.13 + i * 0.03],
          rot: [-0.25 + i * 0.03, 0, 0],
        },
      );
  }
}

// ── the synth keyboard on its X stand (1×1) ───────────────────────────────────────────────────────
/** A forty-nine-key synth on an X stand, its keys at a standing player's hands: wood cheeks or red or
 *  black, the pitch and mod wheels, a panel of knobs and sliders behind the keys, its display lit;
 *  the sustain pedal on the floor. */
function synthStand(m: Model, o: Look) {
  const v = o.look;
  const bodyC = [0x1c1c1e, 0xc4302b, 0x1c1c1e][v] ?? 0x1c1c1e;
  const panel = [0x26262a, 0x1c1c1e, 0x2a2c33][v] ?? 0x26262a;
  const knob = [P.cream, P.alum, P.chrome][v] ?? P.cream;
  const disp = [0xffb347, 0xff3a2a, 0x5fb8ff][v] ?? 0xffb347;
  const { keys: KT, front: KF, x0: K0, x1: K1 } = PLAY.synth_stand;
  // the stand: an X of two bars, feet along z, arms along z on top
  const XS = 0.5;
  const leg = Math.hypot(0.62, 0.86);
  const la = Math.atan2(0.86, 0.62);
  for (const s of [-1, 1])
    m.add(box([leg, 0.035, 0.03], 0.004), P.graphite, { at: [0.5, 0.45, XS + s * 0.022], rot: [0, 0, s * la] });
  m.add(rod(0.018, 0.018, 0.08, "z", 10), P.chrome, { at: [0.5, 0.45, XS] });
  for (const x of [0.19, 0.81]) {
    m.add(box([0.035, 0.03, 0.44], 0.004), P.graphite, { at: [x, 0.03, XS] });
    for (const z of [XS - 0.22, XS + 0.22]) m.add(box([0.04, 0.04, 0.03], 0.008), P.rubber, { at: [x, 0.02, z] });
    m.add(box([0.03, 0.03, 0.34], 0.004), P.graphite, { at: [x, 0.88, XS] });
    for (const z of [XS - 0.17, XS + 0.17]) m.add(box([0.035, 0.05, 0.03], 0.006), P.rubber, { at: [x, 0.9, z] });
  }
  // the synth: its body, the key bed, the cheeks, the keys
  const BY0 = 0.905;
  const [Z0, Z1] = [0.34, KF + 0.005];
  m.add(box([0.92, KT - BY0 - 0.02, Z1 - Z0], 0.01), bodyC, { at: [0.5, (BY0 + KT - 0.02) / 2, (Z0 + Z1) / 2] });
  m.add(box([0.88, 0.05, 0.16], 0.008), panel, { at: [0.5, KT + 0.008, Z0 + 0.08], rot: [0.12, 0, 0] });
  if (v === 0)
    for (const x of [0.03, 0.97])
      m.add(box([0.035, 0.11, Z1 - Z0 + 0.01], 0.008), P.walnut, { at: [x, BY0 + 0.055, (Z0 + Z1) / 2] });
  const n = 29;
  const kw = (K1 - K0) / n;
  for (let i = 0; i < n; i++)
    m.add(box([kw - 0.002, 0.02, 0.15]), 0xf2ece0, { at: [K0 + (i + 0.5) * kw, KT - 0.01, KF - 0.075] });
  for (let i = 0; i < n - 1; i++)
    if ([0, 1, 3, 4, 5].includes(i % 7))
      m.add(box([kw * 0.55, 0.016, 0.09], 0.002), 0x141416, { at: [K0 + (i + 1) * kw, KT + 0.006, KF - 0.105] });
  m.add(box([K1 - K0 + 0.01, 0.012, 0.012]), panel, { at: [(K0 + K1) / 2, KT + 0.002, KF - 0.155] });
  // the wheels, left of the keys
  for (const x of [0.075, 0.12]) {
    m.add(box([0.03, 0.02, 0.1]), 0x0c0c0e, { at: [x, KT - 0.01, KF - 0.07] });
    m.add(rod(0.032, 0.032, 0.018, "x", 14), 0x3a3a3e, { at: [x, KT - 0.02, KF - 0.07] });
  }
  // the panel: knobs in rows, sliders, the display, LEDs
  const pz = Z0 + 0.08;
  const py = KT + 0.034;
  const onPanel = (x: number, dz: number): V3 => [x, py + dz * Math.sin(0.12) * -1, pz + dz];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 8; c++) {
      const x = 0.1 + c * 0.05 + (c > 3 ? 0.27 : 0);
      m.add(cyl(0.011, 0.009, 0.016, 8), knob, { at: onPanel(x, -0.035 + r * 0.05), rot: [0.12, 0, 0] });
    }
  for (let i = 0; i < 4; i++) {
    m.add(box([0.006, 0.002, 0.06]), 0x0c0c0e, { at: onPanel(0.38 + i * 0.025, 0.02), rot: [0.12, 0, 0] });
    m.add(box([0.016, 0.01, 0.01], 0.002), knob, {
      at: onPanel(0.38 + i * 0.025, 0.0 + rnd(i, 2, o.seed) * 0.04),
      rot: [0.12, 0, 0],
    });
  }
  m.add(box([0.12, 0.004, 0.05]), 0x0c0c0e, { at: onPanel(0.5 + 0.02, -0.035), rot: [0.12, 0, 0] });
  m.add(box([0.1, 0.002, 0.035]), disp, { at: onPanel(0.52, -0.035), rot: [0.12, 0, 0], glow: true, tone: 0.8 });
  for (let i = 0; i < 6; i++)
    m.add(box([0.008, 0.004, 0.006]), i % 3 ? 0x3a2a1a : 0xff3a2a, {
      at: onPanel(0.62 + i * 0.03, 0.05),
      rot: [0.12, 0, 0],
      glow: i % 3 === 0,
    });
  m.add(box([0.12, 0.002, 0.012]), v === 1 ? P.white : P.cream, { at: onPanel(0.82, -0.05), rot: [0.12, 0, 0] });
  // (story) the sustain pedal on the floor, its lead up to the back
  if (o.seed > 0.4) {
    m.add(box([0.08, 0.03, 0.14], 0.01), P.ink, { at: [0.62, 0.02, 0.68], rot: [0.1, -0.2, 0] });
    m.add(
      tube(
        [
          [0.62, 0.03, 0.6],
          [0.72, 0.01, 0.5],
          [0.78, 0.4, 0.36],
          [0.76, BY0 + 0.03, Z0 + 0.005],
        ],
        0.004,
        4,
        16,
      ),
      P.ink,
    );
  }
}

// ── the karaoke machine (1×1) ─────────────────────────────────────────────────────────────────────
/** A speaker cabinet on castors, its woofer ringed in lights flashing in turn, two mics in their
 *  cradles, a screen on a neck with the words lit on it (the line being sung picked out), and on top
 *  a party light turning. */
function karaoke(m: Model, o: Look) {
  const v = o.look;
  const body = [0x1c1c22, 0xf08bb4, 0xb8bdc4][v] ?? 0x1c1c22;
  const trim = [0x2a2a30, P.white, 0x3a3a3e][v] ?? 0x2a2a30;
  const ledA = [0xff3ac0, 0x46e8ff, 0xffb347][v] ?? 0xff3ac0;
  const ledB = [0x46e8ff, 0xffd24a, 0xff5f5f][v] ?? 0x46e8ff;
  const [cx, cz] = [0.5, 0.5];
  const F = 0.7;
  // the castors, the cabinet, its top
  for (const x of [0.29, 0.71]) for (const z of [0.34, 0.66]) m.add(ball(0.022, 8), P.rubber, { at: [x, 0.022, z] });
  m.add(box([0.52, 0.84, 0.4], 0.02, 2), body, { at: [cx, 0.46, cz] });
  m.add(box([0.53, 0.03, 0.41], 0.01), trim, { at: [cx, 0.885, cz] });
  // the woofer, its ring of lights, the tweeter
  const WY = 0.36;
  m.add(cyl(0.17, 0.17, 0.006, 22), trim, { at: [cx, WY, F], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(0.14, 0.14, 0.006, 22), 0x14120f, { at: [cx, WY, F + 0.003], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(0.09, 0.09, 0.004, 20), 0x24221e, { at: [cx, WY, F + 0.006], rot: [Math.PI / 2, 0, 0] });
  m.add(ball(0.035, 8), P.alumDark, { at: [cx, WY, F + 0.004], scale: [1, 1, 0.4] });
  for (const [r, c] of [
    [0.155, ledA],
    [0.172, ledB],
  ] as const)
    m.add(ring(r, 0.006, 3, 30).rotateX(Math.PI / 2), shade(c, 0.4), { at: [cx, WY, F + 0.007] });
  m.live(
    ring(0.155, 0.0065, 3, 30).rotateX(Math.PI / 2),
    ledA,
    { kind: "blink", period: 0.8, on: 0.5, phase: 0 },
    { at: [cx, WY, F + 0.0075], glow: true },
  );
  m.live(
    ring(0.172, 0.0065, 3, 30).rotateX(Math.PI / 2),
    ledB,
    { kind: "blink", period: 0.8, on: 0.5, phase: 0.5 },
    { at: [cx, WY, F + 0.0075], glow: true },
  );
  m.add(ball(0.03, 8), P.alum, { at: [cx, 0.64, F - 0.01] });
  m.add(ring(0.045, 0.006, 3, 16).rotateX(Math.PI / 2), trim, { at: [cx, 0.64, F + 0.004] });
  // the front panel: knobs, a little display, the mic inputs
  m.add(box([0.44, 0.08, 0.006]), 0x14141a, { at: [cx, 0.78, F] });
  m.add(box([0.12, 0.035, 0.004]), 0x46e8ff, { at: [cx, 0.785, F + 0.004], glow: true, tone: 0.7 });
  for (const x of [cx - 0.17, cx - 0.12, cx + 0.12, cx + 0.17])
    m.add(cyl(0.012, 0.011, 0.014, 10), P.alum, { at: [x, 0.78, F + 0.003], rot: [Math.PI / 2, 0, 0] });
  for (const x of [cx - 0.08, cx + 0.08])
    m.add(cyl(0.01, 0.01, 0.006, 10), P.ink, { at: [x, 0.76, F + 0.003], rot: [Math.PI / 2, 0, 0] });
  // the two mics in their cradles on the top's front corners
  for (const [i, x] of [cx - 0.19, cx + 0.19].entries()) {
    m.add(cyl(0.028, 0.028, 0.02, 12), trim, { at: [x, 0.9, F - 0.05] });
    m.add(cyl(0.018, 0.015, 0.15, 10), [P.ink, P.white, P.alumDark][v] ?? P.ink, {
      at: [x, 0.905, F - 0.05],
      rot: [0.12, 0, 0],
    });
    m.add(ball(0.028, 10), P.alum, { at: [x, 1.08, F - 0.03] });
    m.add(ring(0.024, 0.004, 3, 12), i ? ledB : ledA, { at: [x, 1.055, F - 0.032] });
  }
  // the screen on its neck, the words on it
  const { x0, x1, z, y0, y1 } = PLAY.karaoke;
  const SY = (y0 + y1) / 2;
  m.add(box([0.06, y0 - 0.88, 0.04]), trim, { at: [cx, (y0 + 0.88) / 2, z - 0.03] });
  m.add(box([x1 - x0 + 0.04, y1 - y0 + 0.04, 0.03], 0.008), P.ink, { at: [cx, SY, z - 0.016] });
  m.add(box([x1 - x0, y1 - y0, 0.003]), [0x1a2a6a, 0x3a1a5a, 0x1a3a4a][v] ?? 0x1a2a6a, {
    at: [cx, SY, z],
    glow: true,
    tone: 0.7,
  });
  const LINES = [
    ["SING IT", "OUT LOUD", "ALL NIGHT"],
    ["LA LA LA", "OH YEAH", "ONE MORE"],
    ["SNOW IS", "FALLING", "SING ON"],
  ][Math.floor(o.seed * 3) % 3];
  LINES.forEach((t, i) => {
    const w = dotsAt(t, cx, SY + 0.08 - i * 0.08, z + 0.002, 0.0062);
    if (w) m.add(w, i === 1 ? 0xffd24a : P.white, { glow: true });
  });
  m.add(ball(0.007, 6), 0xff5fa8, { at: [cx - 0.2, SY, z + 0.004], glow: true });
  // the party light on top: a dome, coloured lamps going round under it
  const LY = 0.9;
  const LX = cx;
  const LZ = z + 0.12;
  m.add(cyl(0.05, 0.055, 0.03, 14), trim, { at: [LX, LY, LZ] });
  const spin = { kind: "spin", axis: "y", speed: 1.6 } as const;
  for (const [k, c] of [ledA, ledB, 0xffd24a].entries())
    m.live(
      merged(
        [0, 1].map((h) =>
          ball(0.016, 6).translate(
            Math.cos(((k + h * 1.5) / 3) * Math.PI * 2) * 0.026,
            0.05,
            Math.sin(((k + h * 1.5) / 3) * Math.PI * 2) * 0.026,
          ),
        ),
      ),
      c,
      spin,
      { at: [LX, LY, LZ], glow: true },
    );
  m.live(
    lathe(
      [
        [0.048, 0],
        [0.047, 0.03],
        [0.035, 0.065],
        [0.001, 0.08],
      ],
      14,
    ),
    0xf0f4ff,
    { kind: "still" },
    { at: [LX, LY + 0.028, LZ], glass: true },
  );
}

// ── the gong (1×1) ────────────────────────────────────────────────────────────────────────────────
/** A bronze gong hung on its cords in a lacquered or teak frame (a beam with upturned ends) or in an
 *  iron ring; its mallet leant against the post. */
function gong(m: Model, o: Look) {
  const v = o.look;
  const bronze = [0xc89a48, 0xb8863a, 0xd4b060][v] ?? 0xc89a48;
  const frame = [0x9a1c22, 0x6a4a2a, 0x24221f][v] ?? 0x9a1c22;
  const gold = [0xd4a540, 0x2a1d14, P.brass][v] ?? 0xd4a540;
  const {
    at: [gx, gy],
    r: GR,
    face,
  } = PLAY.gong;
  const gz = 0.5;
  // the gong itself, turned to face the room; its rim, the hammered rings, its middle
  const facing: V3 = [Math.PI / 2, 0, 0];
  m.add(
    lathe(
      [
        [0.001, 0.012],
        [GR - 0.06, 0.012],
        [GR - 0.02, 0.004],
        [GR, -0.03],
        [GR - 0.012, -0.034],
        [GR - 0.028, -0.004],
        [GR - 0.07, 0.004],
        [0.001, 0.004],
      ],
      36,
    ),
    bronze,
    { at: [gx, gy, face - 0.012], rot: facing },
  );
  for (const [r, t] of [
    [0.08, 0.86],
    [0.15, 1.08],
    [0.22, 0.9],
  ] as const)
    m.add(
      ring(r, 0.006, 3, 30)
        .rotateX(Math.PI / 2)
        .scale(1, 1, 0.3),
      bronze,
      { at: [gx, gy, face], tone: t },
    );
  if (v === 0) m.add(cyl(0.09, 0.09, 0.002, 24), 0x2a1d14, { at: [gx, gy, face + 0.001], rot: facing });
  if (v === 1) m.add(ball(0.07, 14), shade(bronze, 1.08), { at: [gx, gy, face - 0.005], scale: [1, 1, 0.45] });
  // its cords up to the frame
  const TOP = v === 2 ? gy + GR + 0.11 : 1.56;
  for (const s of [-1, 1]) {
    const a = s * 0.42;
    const hole: V3 = [gx + Math.sin(a) * (GR - 0.03), gy + Math.cos(a) * (GR - 0.03), face - 0.02];
    m.add(
      tube([hole, [gx + s * 0.1, (hole[1] + TOP) / 2, gz], [gx + s * 0.12, TOP, gz]], 0.004, 3, 4),
      [0xc4302b, 0x8a6a3a, 0x24221f][v] ?? 0xc4302b,
    );
  }
  if (v === 2) {
    // the iron ring round it, on two legs and a foot
    m.add(ring(GR + 0.11, 0.014, 5, 40).rotateX(Math.PI / 2), frame, { at: [gx, gy, gz] });
    for (const s of [-1, 1]) {
      const at: V3 = [gx + s * Math.sin(0.55) * (GR + 0.11), gy - Math.cos(0.55) * (GR + 0.11), gz];
      m.add(tube([at, [gx + s * 0.3, 0.3, gz], [gx + s * 0.34, 0.03, gz]], 0.014, 5, 6), frame);
      m.add(box([0.06, 0.03, 0.42], 0.008), frame, { at: [gx + s * 0.34, 0.015, gz] });
    }
    m.add(ball(0.03, 8), P.brass, { at: [gx, gy + GR + 0.135, gz] });
    m.add(box([0.68, 0.025, 0.04], 0.006), frame, { at: [gx, 0.03, gz] });
  } else {
    // two posts on their feet, the beam with its ends upturned, brass caps
    for (const x of [0.1, 0.9]) {
      m.add(box([0.07, 1.6, 0.07], 0.008), frame, { at: [x, 0.8, gz] });
      m.add(box([0.09, 0.07, 0.46], 0.01), frame, { at: [x, 0.035, gz] });
      for (const s of [-1, 1])
        m.add(box([0.03, 0.12, 0.02], 0.004), frame, { at: [x, 0.12, gz + s * 0.06], rot: [s * 0.6, 0, 0] });
      m.add(box([0.08, 0.04, 0.08], 0.006), gold, { at: [x, 0.4, gz] });
    }
    const beam: [number, number][] = [
      [-0.48, 0.1],
      [-0.44, 0.03],
      [-0.36, 0],
      [0.36, 0],
      [0.44, 0.03],
      [0.48, 0.1],
      [0.42, 0.085],
      [0.36, 0.06],
      [-0.36, 0.06],
      [-0.42, 0.085],
    ];
    m.add(extrude(beam, 0.08, 0.006), frame, { at: [0.5, 1.56, gz] });
    m.add(box([0.6, 0.04, 0.06], 0.006), gold, { at: [0.5, 1.5, gz] });
    for (const x of [0.04, 0.96]) m.add(ball(0.022, 8), gold, { at: [x, 1.66, gz] });
  }
  // the mallet, leant against the left
  const mx = v === 2 ? 0.22 : 0.2;
  m.add(
    tube(
      [
        [mx, 0.01, gz + 0.2],
        [mx - 0.03, 0.5, gz + 0.08],
      ],
      0.009,
      5,
      2,
    ),
    P.oak,
  );
  m.add(ball(0.05, 10), [P.cream, 0xc4302b, P.ink][v] ?? P.cream, { at: [mx - 0.035, 0.54, gz + 0.07] });
  // (story) a tassel hung from the mallet's handle
  if (o.seed > 0.5)
    m.add(cyl(0.004, 0.012, 0.06, 6), 0xc4302b, { at: [mx - 0.025, 0.36, gz + 0.115], rot: [0, 0, 0.05] });
}

// ── the theremin (1×1) ────────────────────────────────────────────────────────────────────────────
/** Its cabinet on a stand — a tripod, or for the art deco one a cabinet on four tapered legs — the
 *  pitch antenna standing up on the right, the volume loop out to the left, knobs and a lamp lit. */
function theremin(m: Model, o: Look) {
  const v = o.look;
  const wood = [P.walnut, 0x1c1c1e, P.cream][v] ?? P.walnut;
  const [px, pz, ptop] = PLAY.theremin.pitch;
  const [lx, ly, lz] = PLAY.theremin.loop;
  const deco = v === 2;
  const [CW, CH, CD] = deco ? [0.56, 0.2, 0.3] : [0.5, 0.13, 0.22];
  const CY = deco ? 0.86 : 0.9;
  if (deco) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const at: V3 = [0.5 + sx * (CW / 2 - 0.04), 0, 0.5 + sz * (CD / 2 - 0.04)];
        m.add(cyl(0.012, 0.022, CY, 8), wood, { at });
        m.add(cyl(0.024, 0.024, 0.02, 8), P.brass, { at });
      }
    m.add(box([CW - 0.1, 0.02, CD - 0.1]), wood, { at: [0.5, 0.25, 0.5] });
  } else {
    m.add(cyl(0.018, 0.018, CY - 0.3), P.ink, { at: [0.5, 0.3, 0.5] });
    tripod(m, 0.5, 0.32, 0.5, 0.28, P.ink, 0.5, 0.01);
    m.add(box([0.14, 0.02, 0.1]), P.ink, { at: [0.5, CY - 0.01, 0.5] });
  }
  // the cabinet: its box, a lid's edge, the front panel and its knobs, the lamp
  m.add(box([CW, CH, CD], 0.012), wood, { at: [0.5, CY + CH / 2, 0.5] });
  m.add(box([CW + 0.01, 0.015, CD + 0.01], 0.005), deco ? P.brass : shade(wood, 0.8), {
    at: [0.5, CY + CH - 0.004, 0.5],
  });
  const F = 0.5 + CD / 2;
  m.add(box([CW - 0.1, CH - 0.04, 0.004]), deco ? 0x2a2622 : 0x1a1a1c, { at: [0.5, CY + CH / 2, F + 0.002] });
  for (let i = 0; i < 4; i++)
    m.add(cyl(0.014, 0.012, 0.016, 10), deco ? P.brass : P.cream, {
      at: [0.36 + i * 0.07, CY + CH / 2 - 0.01, F + 0.003],
      rot: [Math.PI / 2, 0, 0],
    });
  m.add(ball(0.009, 8), 0xff6a3a, { at: [0.66, CY + CH / 2 + 0.015, F + 0.004], glow: true });
  if (deco)
    for (let i = 0; i < 5; i++)
      m.add(box([0.004, CH - 0.06, 0.004]), P.brass, { at: [0.29 + i * 0.012, CY + CH / 2, F + 0.005] });
  // the pitch antenna, on its mount
  m.add(cyl(0.02, 0.016, 0.04, 10), P.ink, { at: [px, CY + CH, pz] });
  m.add(cyl(0.005, 0.004, ptop - CY - CH - 0.04, 8), P.chrome, { at: [px, CY + CH + 0.04, pz] });
  m.add(ball(0.007, 6), P.chrome, { at: [px, ptop, pz] });
  // the volume loop, out to the left
  const lp: V3[] = [
    [0.5 - CW / 2 + 0.01, ly, lz - 0.06],
    [lx + 0.06, ly, lz - 0.065],
  ];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 - (i / 8) * Math.PI;
    lp.push([lx + Math.cos(a) * 0.065, ly, lz + Math.sin(a) * 0.065]);
  }
  lp.push([lx + 0.06, ly, lz + 0.065], [0.5 - CW / 2 + 0.01, ly, lz + 0.06]);
  m.add(tube(lp, 0.005, 4, 24), P.chrome);
  m.add(cyl(0.016, 0.016, 0.03, 8), P.ink, { at: [0.5 - CW / 2 + 0.01, ly, lz], rot: [0, 0, Math.PI / 2] });
  // its lead to the floor
  m.add(
    tube(
      [
        [0.5, CY + 0.02, 0.5 - CD / 2],
        [0.52, 0.5, 0.36],
        [0.6, 0.008, 0.3],
        [0.8, 0.008, 0.22],
      ],
      0.004,
      4,
      12,
    ),
    P.ink,
  );
  // (story) a little score on a music clip on its lid
  if (o.seed > 0.5)
    m.add(box([0.12, 0.002, 0.16]), P.paperWhite, { at: [0.42, CY + CH + 0.003, 0.5], rot: [0, 0.2, 0] });
}

// ── the metronome (on a surface) ──────────────────────────────────────────────────────────────────
/** A wind-up metronome: its pyramid narrowing up, the scale behind its arm, the arm ticking side to
 *  side with its weight, the key on its side. */
function metronome(m: Model, o: Look) {
  const v = o.look;
  const wood = [P.walnut, 0x1c1a19, 0x9a1c22][v] ?? P.walnut;
  const [cx, cz] = [0.5, 0.5];
  const H = 0.22;
  // the body: narrowing up, its front upright, its back leaning in
  const b = box([0.11, H, 0.08], 0, 1);
  b.translate(0, H / 2, 0);
  const pos = b.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / H;
    pos.setX(i, pos.getX(i) * (1 - 0.68 * t));
    if (pos.getZ(i) < 0) pos.setZ(i, pos.getZ(i) + 0.05 * t);
  }
  m.add(box([0.13, 0.02, 0.1], 0.004), shade(wood, 0.85), { at: [cx, 0.01, cz] });
  m.add(b, wood, { at: [cx, 0.02, cz] });
  m.add(
    lathe(
      [
        [0.012, 0],
        [0.008, 0.006],
        [0.001, 0.012],
      ],
      4,
    ),
    wood,
    { at: [cx, H + 0.02, cz], rot: [0, Math.PI / 4, 0] },
  );
  // the scale behind the arm, the pivot
  const FZ = cz + 0.041;
  m.add(box([0.024, 0.15, 0.002]), [P.cream, 0xc9a24a, P.cream][v] ?? P.cream, { at: [cx, 0.115, FZ] });
  for (let i = 0; i < 8; i++) m.add(box([0.012, 0.0015, 0.001]), P.ink, { at: [cx, 0.06 + i * 0.016, FZ + 0.0015] });
  m.add(cyl(0.006, 0.006, 0.006, 8), P.brass, { at: [cx, 0.045, FZ], rot: [Math.PI / 2, 0, 0] });
  // the key on its side
  m.add(rod(0.003, 0.003, 0.02, "x", 5), P.brass, { at: [cx + 0.055, 0.06, cz] });
  m.add(box([0.004, 0.02, 0.012], 0.002), P.brass, { at: [cx + 0.068, 0.06, cz] });
  // the arm and its weight, ticking (two ticks a beat round: 120 to the minute)
  const wy = 0.07 + o.seed * 0.06;
  m.live(
    merged([
      box([0.003, 0.17, 0.003]).translate(0, 0.085, 0),
      box([0.018, 0.014, 0.01]).translate(0, wy, 0.003),
      cyl(0.002, 0.002, 0.012, 4).translate(0, 0.17, 0),
    ]),
    P.chrome,
    { kind: "nod", amp: 0.38, period: 1, phase: o.seed },
    { at: [cx, 0.045, FZ + 0.006] },
  );
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  drum_kit: drumKit,
  guitar_amp: guitarAmp,
  dj_booth: djBooth,
  synth_stand: synthStand,
  karaoke,
  gong,
  theremin,
  metronome,
};
