import { glyphDots } from "@yutopia/shared/glyphs";
import {
  type BufferGeometry,
  Float32BufferAttribute,
  BufferGeometry as Geo,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { ball, box, cyl, extrude, type Look, lathe, leaf, type Model, merged, ring, rod, tube, type V3 } from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 7 (docs/plan/68-more-furniture.md): On desks — the new kinds' models, in a thing on a
// surface's frame (one tile, its middle at (0.5, 0.5), y up from the top it stands on), Rich and cel;
// their catalog entries, shapes and measures in the shared fam/desktop2.ts. Each is drawn facing +z
// and turned to face −z — whoever sits at the desk, as every desk thing does (furn/desktop.ts) — by
// the model's `facing` (half a turn, and a little more for the things put down casually: the camera,
// the walkman, the cube). Moving parts: the cradle's end balls swing in turn, the globe and the fan
// turn, the snow globe's flakes and the aquarium's fish go round, its bubbles rise, the hourglass's
// grains fall, the Vortex bobblehead bobbles.

export const LOOKS: Record<string, readonly string[]> = {
  newtons_cradle: ["Chrome on black", "Brass on walnut"],
  desk_globe: ["Antique", "Blue ocean", "Black and gold"],
  desk_fan: ["Chrome", "Mint", "Black"],
  desk_snow_globe: ["Cabin", "Snowman", "Clock tower"],
  desk_aquarium: ["Tropical", "Planted", "Goldfish bowl"],
  typewriter: ["Black office", "Mint portable", "Red portable"],
  headphones_stand: ["Black studio", "White", "Walnut and tan"],
  film_camera: ["Silver and black", "All black", "Tan rangefinder"],
  walkman: ["Blue and silver", "Yellow sports", "Red"],
  rolodex: ["Black", "Chrome", "Beige"],
  pencil_cup: ["Mesh steel", "Ceramic", "Tin can"],
  hourglass: ["Walnut", "Brass"],
  bonsai: ["Juniper", "Maple", "Blossom"],
  rubiks_cube: ["Classic", "Pocket cube"],
  vortex_figurine: ["Classic", "Gold", "Twin"],
};

const C = 0.5; // the frame's middle
const TURN = Math.PI; // (drawn facing +z, turned to the sitter)
const D = {
  glass: 0xcfe6ff,
  snow: 0xf4f4f0,
  water: 0x5fb8d8,
  sand: 0xe0c48a,
  rubberCream: 0xe8e0c8,
  magenta: 0xe0157f,
  magentaLight: 0xff7ac8,
  vxInk: 0x1a0033,
  vxArm: 0x2a0a40,
  tongue: 0xff5fa8,
  teal: 0x00e5d0,
  gold: 0xd4a540,
};

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};

/** Words in the shared dot face, flat on a face looking +z: from (x, y) its top-left, each dot `p`
 *  across, as one geometry — or null for none. (xmas.ts's, copied.) */
function dotText(text: string, x: number, y: number, z: number, p: number): BufferGeometry | null {
  const pos: number[] = [];
  const d = p * 0.82;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) {
      const x0 = x + (i * 6 + c) * p;
      const y1 = y - r * p;
      pos.push(x0, y1 - d, z, x0 + d, y1 - d, z, x0 + d, y1, z, x0, y1 - d, z, x0 + d, y1, z, x0, y1, z);
    }
  return pos.length ? geo(pos) : null;
}
/** …centred on x. */
const dotsAt = (text: string, cx: number, y: number, z: number, p: number) =>
  dotText(text, cx - (text.length * 6 - 1) * p * 0.5, y, z, p);

/** A straight tube between two points. */
const bar = (a: V3, b: V3, r: number, radial = 5) => tube([a, b], r, radial, 1);

// ── Newton's cradle ───────────────────────────────────────────────────────────────────────────────
/** Five steel balls on their V of threads from a frame on a plinth; the end ones swing out in turn
 *  (live: each tipped round its rails' line — out and back, the other as it lands). Chrome on a black
 *  plinth, or brass on walnut with an engraved plate. */
function newtonsCradle(m: Model, o: Look) {
  m.facing = TURN;
  const brass = o.look === 1;
  const metal = brass ? P.brass : P.chrome;
  const plinth = brass ? P.walnut : P.plastic;
  const R = 0.015;
  const TOP = 0.165;
  const BY = 0.06; // a ball's middle
  const DZ = 0.042; // the rails either side
  m.add(box([0.22, 0.016, 0.13], 0.004, 2), plinth, { at: [C, 0.008, C] });
  m.add(box([0.2, 0.006, 0.11], 0.002), shade(plinth, brass ? 1.2 : 1.5), { at: [C, 0.018, C] });
  // the frame: four posts, a rail along each side, bowed over the ends
  for (const s of [-1, 1]) {
    const z = C + s * DZ;
    m.add(
      tube(
        [
          [C - 0.095, 0.02, z],
          [C - 0.095, 0.08, z],
          [C - 0.095, TOP - 0.03, z],
          [C - 0.093, TOP - 0.009, z],
          [C - 0.084, TOP, z],
          [C - 0.04, TOP, z],
          [C + 0.04, TOP, z],
          [C + 0.084, TOP, z],
          [C + 0.093, TOP - 0.009, z],
          [C + 0.095, TOP - 0.03, z],
          [C + 0.095, 0.08, z],
          [C + 0.095, 0.02, z],
        ],
        0.0035,
        5,
        48,
      ),
      metal,
    );
    for (const x of [C - 0.095, C + 0.095]) m.add(cyl(0.008, 0.007, 0.006, 8), metal, { at: [x, 0.02, z] });
  }
  // a ball hung from its rails' line at the pivot (0, 0, 0): its two threads
  const hung = (): BufferGeometry[] => [
    ball(R, 12).translate(0, BY - TOP, 0),
    ...[-1, 1].map((s) => bar([0, 0, s * DZ], [0, BY - TOP + R * 0.9, 0], 0.0006, 3)),
    cyl(0.0022, 0.0022, 0.004, 6).translate(0, BY - TOP + R - 0.0005, 0),
  ];
  const A = 0.3;
  for (let i = 0; i < 5; i++) {
    const x = C + (i - 2) * (2 * R + 0.0004);
    if (i === 0 || i === 4) {
      // (tipped out by A at rest and A more and back: out to 2A, then in — the other going out)
      const s = i === 0 ? -1 : 1;
      m.live(
        merged(hung()),
        P.chrome,
        { kind: "nod", amp: A, period: 1.5, phase: 0 },
        { at: [x, TOP, C], rot: [0, 0, s * A] },
      );
    } else for (const g of hung()) m.add(g, P.chrome, { at: [x, TOP, C] });
  }
  // (story) brass: an engraved plate on its front; chrome: a sticky note on the plinth
  if (brass) m.add(box([0.07, 0.012, 0.002]), P.brass, { at: [C, 0.009, C + 0.066] });
  else if (o.seed > 0.6)
    m.add(box([0.04, 0.001, 0.04]), 0xf2e27a, { at: [C + 0.075, 0.0215, C + 0.03], rot: [0, 0.3, 0] });
}

// ── the desk globe ────────────────────────────────────────────────────────────────────────────────
// (its land: rough continents as patches in latitude and longitude, degrees: [lon, lat, rLon, rLat])
const LAND: [number, number, number, number][] = [
  [-102, 48, 30, 17],
  [-88, 22, 10, 9],
  [-62, -14, 14, 24],
  [-70, -42, 6, 12],
  [-42, 72, 12, 8],
  [14, 52, 17, 9],
  [20, 6, 19, 24],
  [24, -22, 12, 12],
  [88, 50, 44, 17],
  [78, 20, 8, 11],
  [104, 18, 9, 10],
  [134, -25, 16, 10],
  [138, 37, 4, 7],
  [46, 24, 10, 8],
];
function isLand(lon: number, lat: number): boolean {
  if (lat < -72) return true;
  const wob = 0.18 * Math.sin(lon * 0.21 + lat * 0.13) + 0.12 * Math.sin(lon * 0.07 - lat * 0.31);
  for (const [x, y, rx, ry] of LAND) {
    let dx = lon - x;
    if (dx > 180) dx -= 360;
    if (dx < -180) dx += 360;
    if ((dx / rx) ** 2 + ((lat - y) / ry) ** 2 < 1 + wob) return true;
  }
  return false;
}
/** The land of a globe of radius r: a finer ball's faces kept where they're land, raised a hair, its
 *  poles along z (the axis it turns on). */
function landOf(r: number): BufferGeometry {
  const s = new SphereGeometry(r * 1.012, 56, 32).toNonIndexed();
  const p = s.attributes.position;
  const keep: number[] = [];
  for (let t = 0; t < p.count; t += 3) {
    const x = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const z = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const lat = (Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(x, y, z)))) * 180) / Math.PI;
    const lon = (Math.atan2(z, x) * 180) / Math.PI;
    if (isLand(lon, lat)) for (let k = 0; k < 3; k++) keep.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
  }
  s.dispose();
  return geo(keep).rotateX(Math.PI / 2);
}
const GLOBE: { sea: number; land: number; stand: number; meridian: number }[] = [
  { sea: 0xd9c9a0, land: 0xa8794a, stand: P.walnut, meridian: P.brass },
  { sea: 0x3f78a8, land: 0x8fae62, stand: P.plastic, meridian: P.chrome },
  { sea: 0x1d1f24, land: D.gold, stand: P.plastic, meridian: D.gold },
];
/** A globe on its stand: a turned foot, the arm up to its half meridian, the globe tipped 23° on it
 *  (its land turning slowly, live). Antique parchment, a blue sea, or black and gold. A red pin in it
 *  for some (seeded). */
function deskGlobe(m: Model, o: Look) {
  m.facing = TURN;
  const g = GLOBE[o.look] ?? GLOBE[0];
  const R = 0.088;
  const cy = 0.2;
  const tilt = 0.41;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.07, 0],
        [0.07, 0.008],
        [0.055, 0.02],
        [0.02, 0.03],
        [0.012, 0.045],
        [0.001, 0.046],
      ],
      20,
    ),
    g.stand,
    { at: [C, 0, C] },
  );
  // the meridian: half a ring in the axis's plane, from pole to pole round the −x side
  const MR = R + 0.008;
  m.add(new TorusGeometry(MR, 0.0035, 4, 28, Math.PI).rotateZ(Math.PI / 2 - tilt), g.meridian, { at: [C, cy, C] });
  const sx = C - MR * Math.sin(tilt);
  const sy = cy - MR * Math.cos(tilt);
  m.add(
    tube(
      [
        [C, 0.04, C],
        [C - 0.006, 0.06, C],
        [sx, sy, C],
      ],
      0.005,
      6,
      6,
    ),
    g.meridian,
  );
  // the pins at its poles
  for (const k of [-1, 1])
    m.add(ball(0.006, 6), g.meridian, { at: [C + k * MR * Math.sin(tilt), cy + k * MR * Math.cos(tilt), C] });
  // the sea, and the land turning on the tipped axis (its poles along its own z: tipped, then turned
  // a quarter so it leans to the side)
  m.add(ball(R, 20), g.sea, { at: [C, cy, C] });
  const axis: V3 = [-(Math.PI / 2 - tilt), Math.PI / 2, 0];
  const spin = { kind: "spin", axis: "z", speed: 0.3 } as const;
  m.live(landOf(R), g.land, spin, { at: [C, cy, C], rot: axis });
  if (o.seed > 0.55) {
    // (a pin: where someone's going, or from — on the land, turning with it)
    const lat = 0.75;
    const lon = 0.4;
    const n: V3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    const pin = merged([
      cyl(0.0012, 0.0012, 0.02, 4)
        .rotateX(Math.PI / 2)
        .translate(0, 0, 0.01),
      ball(0.004, 6).translate(0, 0, 0.021),
    ]);
    // (the pin's own +z out along n: turned off z toward n)
    pin.rotateX(-Math.asin(n[1]));
    pin.rotateY(Math.atan2(n[0], n[2]));
    pin.translate(n[0] * R, n[1] * R, n[2] * R);
    m.live(pin, 0xd8302a, spin, { at: [C, cy, C], rot: axis });
  }
}

// ── the desk fan ──────────────────────────────────────────────────────────────────────────────────
/** An oscillating desk fan in the old manner: a domed foot, the yoke, the motor's bullet behind, a
 *  wire guard of rings and spokes round four blades (live: turning). Chrome, mint enamel or black; a
 *  ribbon tied to its guard streams and flutters in its wind for some (seeded). */
function deskFan(m: Model, o: Look) {
  m.facing = TURN;
  const body = [P.chrome, 0x9fd3c0, 0x2b2a28][o.look] ?? P.chrome;
  const wire = o.look === 2 ? 0x3a3936 : P.chrome;
  const blade = [0xc9cdd2, 0xe6ddcb, 0x4a4844][o.look] ?? 0xc9cdd2;
  const HY = 0.205; // the hub's height
  const FZ = C + 0.035; // the blades' plane
  const GR = 0.11; // the guard's radius
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.075, 0],
        [0.075, 0.01],
        [0.06, 0.03],
        [0.03, 0.045],
        [0.016, 0.05],
        [0.001, 0.05],
      ],
      20,
    ),
    body,
    { at: [C, 0, C - 0.02] },
  );
  // a speed switch on the foot's front
  m.add(box([0.016, 0.008, 0.01], 0.002), P.ink, { at: [C, 0.04, C + 0.035], rot: [-0.6, 0, 0] });
  // the neck and the yoke round the motor
  m.add(cyl(0.012, 0.01, 0.07, 10), body, { at: [C, 0.045, C - 0.02] });
  m.add(
    tube(
      [
        [C - 0.05, HY, C - 0.03],
        [C - 0.045, HY - 0.07, C - 0.025],
        [C, HY - 0.09, C - 0.02],
        [C + 0.045, HY - 0.07, C - 0.025],
        [C + 0.05, HY, C - 0.03],
      ],
      0.005,
      6,
      16,
    ),
    body,
  );
  // the motor: a bullet, its back louvred
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.03, 0.004],
        [0.045, 0.025],
        [0.048, 0.06],
        [0.04, 0.08],
        [0.02, 0.086],
        [0.001, 0.086],
      ],
      18,
    ),
    body,
    { at: [C, HY, FZ - 0.012], rot: [-Math.PI / 2, 0, 0] },
  );
  for (let i = 0; i < 4; i++)
    m.add(ring(0.032 - i * 0.006, 0.0015, 3, 18), shade(body, 0.7), {
      at: [C, HY, FZ - 0.098 + i * 0.002],
      rot: [Math.PI / 2, 0, 0],
    });
  // the guard: rings front and back, its spokes, the wires over its rim between them
  const rings: [number, number][] = [
    [GR, FZ - 0.018],
    [GR, FZ + 0.022],
    [GR * 0.68, FZ + 0.034],
    [GR * 0.36, FZ + 0.04],
  ];
  for (const [r, z] of rings) m.add(new TorusGeometry(r, 0.0016, 3, 32), wire, { at: [C, HY, z] });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    m.add(
      tube(
        [
          [C + ca * 0.012, HY + sa * 0.012, FZ + 0.044],
          [C + ca * GR * 0.5, HY + sa * GR * 0.5, FZ + 0.037],
          [C + ca * GR, HY + sa * GR, FZ + 0.022],
          [C + ca * GR * 1.02, HY + sa * GR * 1.02, FZ + 0.002],
          [C + ca * GR, HY + sa * GR, FZ - 0.018],
          [C + ca * 0.03, HY + sa * 0.03, FZ - 0.024],
        ],
        0.0011,
        3,
        12,
      ),
      wire,
    );
  }
  // the badge at the guard's middle
  m.add(rod(0.016, 0.016, 0.006, "z", 16), body, { at: [C, HY, FZ + 0.046] });
  m.add(rod(0.011, 0.011, 0.002, "z", 14), o.look === 2 ? P.brass : 0x8a2f2a, { at: [C, HY, FZ + 0.05] });
  // the blades: four, pitched, round the hub (live: turning)
  const blades: BufferGeometry[] = [rod(0.014, 0.014, 0.018, "z", 12)];
  for (let i = 0; i < 4; i++) {
    const b = extrude(
      [
        [0.012, -0.012],
        [0.05, -0.03],
        [0.088, -0.026],
        [0.098, 0],
        [0.085, 0.024],
        [0.05, 0.022],
        [0.012, 0.01],
      ],
      0.002,
    );
    b.rotateX(0.35).rotateZ((i * Math.PI) / 2);
    blades.push(b);
  }
  m.live(merged(blades), blade, { kind: "spin", axis: "z", speed: -11 }, { at: [C, HY, FZ] });
  if (o.seed > 0.45) {
    // (story) a ribbon tied on its guard's top, streaming off in its wind and fluttering (live: along
    // the wind, its own z turned to the world's x so it flaps up and down)
    const rib = merged([
      box([0.03, 0.008, 0.0008]).translate(0.015, 0, 0),
      box([0.03, 0.008, 0.0008]).rotateZ(-0.25).translate(0.044, -0.004, 0),
      box([0.028, 0.007, 0.0008]).rotateZ(0.15).translate(0.072, -0.006, 0),
    ]);
    m.live(
      rib,
      0xc8302c,
      { kind: "nod", amp: 0.22, period: 0.28, phase: o.seed },
      { at: [C + 0.02, HY + GR, FZ + 0.024], rot: [0, -Math.PI / 2, 0] },
    );
    m.add(ball(0.004, 5), 0xc8302c, { at: [C + 0.02, HY + GR, FZ + 0.022] });
  }
}

// ── the desk snow globe ───────────────────────────────────────────────────────────────────────────
/** A snow globe for a desk: a turned base with its brass plate, the glass ball (see-through), inside a
 *  snowy mound and a cabin by its firs, a snowman in his scarf, or the campus's clock tower; flakes
 *  drifting round it (live). */
function deskSnowGlobe(m: Model, o: Look) {
  m.facing = TURN;
  const base = [P.walnut, 0x8a1f22, 0x24324a][o.look] ?? P.walnut;
  const R = 0.062;
  const cy = 0.04 + R * 0.82;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.064, 0],
        [0.066, 0.006],
        [0.058, 0.03],
        [0.05, 0.042],
        [0.001, 0.042],
      ],
      22,
    ),
    base,
    { at: [C, 0, C] },
  );
  m.add(ring(0.061, 0.0025, 4, 24), P.brass, { at: [C, 0.008, C] });
  m.add(box([0.04, 0.014, 0.002]), P.brass, { at: [C, 0.022, C + 0.061], rot: [-0.25, 0, 0] });
  // the snow inside
  const floor = cy - R * 0.62;
  m.add(
    lathe(
      [
        [0.001, 0.014],
        [0.025, 0.012],
        [0.042, 0.005],
        [0.048, 0],
      ],
      18,
    ),
    D.snow,
    { at: [C, floor, C] },
  );
  const f = floor + 0.01;
  if (o.look === 0) {
    m.add(box([0.034, 0.022, 0.026]), 0x7a4a2a, { at: [C + 0.006, f + 0.011, C - 0.004] });
    m.add(
      extrude(
        [
          [-0.023, 0],
          [0.023, 0],
          [0, 0.018],
        ],
        0.036,
      ),
      D.snow,
      { at: [C + 0.006, f + 0.022, C - 0.004], rot: [0, Math.PI / 2, 0] },
    );
    m.add(box([0.008, 0.008, 0.001]), 0xffd28a, { at: [C + 0.012, f + 0.012, C + 0.0095], glow: true });
    for (const [x, z, h] of [
      [-0.026, 0.006, 0.04],
      [-0.016, -0.02, 0.032],
      [0.03, 0.016, 0.028],
    ]) {
      m.add(cyl(h * 0.3, 0.001, h, 7), 0x2c5a35, { at: [C + x, f - 0.004, C + z] });
      m.add(cyl(h * 0.17, 0.001, h * 0.35, 7), D.snow, { at: [C + x, f - 0.004 + h * 0.65, C + z] });
    }
  } else if (o.look === 1) {
    m.add(ball(0.016, 10), D.snow, { at: [C, f + 0.012, C] });
    m.add(ball(0.011, 10), D.snow, { at: [C, f + 0.034, C] });
    m.add(ring(0.009, 0.003, 4, 14), 0xc8302c, { at: [C, f + 0.025, C] });
    m.add(box([0.004, 0.014, 0.002]), 0xc8302c, { at: [C + 0.006, f + 0.018, C + 0.01], rot: [0, 0, 0.2] });
    m.add(cyl(0.0018, 0.0005, 0.008, 5).rotateX(Math.PI / 2), 0xe8803a, { at: [C, f + 0.034, C + 0.014] });
    for (const x of [-0.004, 0.004]) m.add(ball(0.0014, 4), P.ink, { at: [C + x, f + 0.038, C + 0.0095] });
    m.add(cyl(0.008, 0.008, 0.002, 10), P.ink, { at: [C, f + 0.043, C] });
    m.add(cyl(0.0055, 0.0055, 0.012, 10), P.ink, { at: [C, f + 0.043, C] });
    for (const s of [-1, 1])
      m.add(bar([C + s * 0.013, f + 0.016, C], [C + s * 0.03, f + 0.03, C], 0.0008, 3), 0x5a3a22);
  } else {
    // the campus's clock tower: its shaft, the clock faces, a pitched cap, the snow on it
    m.add(box([0.026, 0.05, 0.026]), 0xcfc4ae, { at: [C, f + 0.025, C] });
    m.add(box([0.03, 0.006, 0.03]), 0xa89a80, { at: [C, f + 0.05, C] });
    m.add(rod(0.008, 0.008, 0.002, "z", 12), 0xfff1c9, { at: [C, f + 0.04, C + 0.0135], glow: true });
    m.add(cyl(0.022, 0.001, 0.026, 4), 0x3d4f6a, { at: [C, f + 0.053, C], rot: [0, Math.PI / 4, 0] });
    m.add(cyl(0.012, 0.001, 0.014, 4), D.snow, { at: [C, f + 0.066, C], rot: [0, Math.PI / 4, 0] });
    for (const x of [-0.03, 0.03]) m.add(cyl(0.008, 0.001, 0.022, 6), 0x2c5a35, { at: [C + x, f - 0.004, C + 0.01] });
  }
  m.live(ball(R, 22), D.glass, { kind: "still" }, { at: [C, cy, C], glass: true });
  for (let k = 0; k < 2; k++) {
    const flakes: BufferGeometry[] = [];
    for (let i = 0; i < 22; i++) {
      const a = rnd(i, k, 1) * Math.PI * 2;
      const rr = 0.01 + rnd(i, k, 2) * 0.038;
      const y = -0.025 + rnd(i, k, 3) * 0.06;
      flakes.push(
        box([0.0035, 0.0035, 0.001])
          .rotateY(a)
          .translate(Math.cos(a) * rr, y, Math.sin(a) * rr),
      );
    }
    m.live(
      merged(flakes),
      D.snow,
      { kind: "swirl", speed: [0.5, -0.35][k], bob: 0.006, period: 3.5 + k * 1.3, phase: k * 0.4 },
      { at: [C, cy, C], glow: true },
    );
  }
}

// ── the small aquarium ────────────────────────────────────────────────────────────────────────────
/** A fish shape along +x: its body, a tail, a dorsal fin. */
function fish(len: number, deep: number): BufferGeometry[] {
  return [
    ball(0.5, 8).scale(len * 0.62, deep, deep * 0.55),
    extrude(
      [
        [0, 0],
        [-len * 0.32, deep * 0.55],
        [-len * 0.26, 0],
        [-len * 0.32, -deep * 0.55],
      ],
      0.0012,
    ).translate(-len * 0.26, 0, 0),
    extrude(
      [
        [-len * 0.1, 0],
        [len * 0.06, 0],
        [-len * 0.14, deep * 0.45],
      ],
      0.001,
    ).translate(0, deep * 0.4, 0),
  ];
}
/** A school going round (swirl: its own y, at `speed`): fish set round a circle of radius r, each
 *  heading the way it's carried, at heights a little apart. */
function school(n: number, r: number, len: number, deep: number, speed: number, k: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(i, k, 4) * 0.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // (turning +y carries a point at (x, z) toward (z, −x): +x turned to that, back when it's −)
    const head = Math.atan2(x, z) + (speed < 0 ? Math.PI : 0);
    const y = (rnd(i, k, 5) - 0.5) * 0.03;
    for (const g of fish(len, deep)) parts.push(g.rotateY(head).translate(x, y, z));
  }
  return merged(parts);
}
/** Bubbles rising from an airstone: sets lit in turn up the column (blink), so they climb. */
function bubbles(m: Model, x: number, z: number, y0: number, y1: number, glow: boolean) {
  const N = 3;
  const step = (y1 - y0) / 12;
  for (let s = 0; s < N; s++) {
    const bs: BufferGeometry[] = [];
    for (let k = s; k < 12; k += N)
      bs.push(
        ball(0.0022 + k * 0.00012, 5).translate(
          (rnd(k, s, 1) - 0.5) * 0.006,
          y0 + k * step,
          (rnd(k, s, 2) - 0.5) * 0.004,
        ),
      );
    m.live(merged(bs), 0xe8f6ff, { kind: "blink", period: 0.9, on: 0.25, phase: 1 - s / N }, { at: [x, 0, z], glow });
  }
}
/** A nano tank on a desk: a black-rimmed glass box of water (see-through, lit by its lid's lamp while
 *  on), gravel, rocks and plants, a school of neons and a pair of clownfish going round, bubbles from
 *  its airstone; planted: a carpet of moss balls and tall grasses, shrimp-sized tetras; or a round
 *  goldfish bowl. A story piece by its seed: a diver, a treasure chest, a little castle. */
function deskAquarium(m: Model, o: Look) {
  m.facing = TURN;
  const on = o.on !== false;
  const bowl = o.look === 2;
  const planted = o.look === 1;
  const W = 0.32;
  const Dz = 0.19;
  const H = 0.2;
  const B = 0.016; // the base rim's height
  if (bowl) {
    // the bowl: glass with a lip, a little water under it
    const prof: [number, number][] = [
      [0.04, 0],
      [0.075, 0.02],
      [0.095, 0.07],
      [0.088, 0.12],
      [0.06, 0.155],
      [0.064, 0.162],
    ];
    m.live(lathe(prof, 26), D.glass, { kind: "still" }, { at: [C, 0, C], glass: true });
    m.live(
      lathe(
        [
          [0.038, 0.004],
          [0.072, 0.022],
          [0.091, 0.07],
          [0.084, 0.12],
          [0.001, 0.125],
        ],
        26,
      ),
      0x7ac8e8,
      { kind: "still" },
      { at: [C, 0, C], glass: true, glow: on },
    );
    m.add(cyl(0.04, 0.045, 0.012, 20), 0xd9a441, { at: [C, 0.003, C] });
    for (let i = 0; i < 14; i++)
      m.add(ball(0.007, 5), [0x4a8cff, 0xffc24a, 0xff4a4a, 0x4ad06a][i % 4], {
        at: [C + (rnd(i, 1, 1) - 0.5) * 0.06, 0.016, C + (rnd(i, 1, 2) - 0.5) * 0.06],
      });
    for (let i = 0; i < 5; i++)
      m.add(leaf(0.06 + i * 0.008, 0.012, 0.2, -0.3, 4), P.leafYoung, {
        at: [C + 0.02, 0.018, C - 0.01],
        rot: [-1.2 + i * 0.1, i * 1.3, 0],
      });
    m.live(
      school(2, 0.045, 0.034, 0.016, 0.6, 1),
      0xf07a2a,
      { kind: "swirl", speed: 0.6, bob: 0.01, period: 5, phase: 0 },
      { at: [C, 0.07, C] },
    );
    bubbles(m, C - 0.03, C + 0.02, 0.025, 0.12, false);
    return;
  }
  const rim = P.plastic;
  // the base and the lid, the rims at the glass's edges
  m.add(box([W + 0.008, B, Dz + 0.008], 0.003), rim, { at: [C, B / 2, C] });
  for (const s of [-1, 1]) {
    m.add(box([0.006, H, 0.006]), rim, { at: [C + s * (W / 2), B + H / 2, C - Dz / 2] });
    m.add(box([0.006, H, 0.006]), rim, { at: [C + s * (W / 2), B + H / 2, C + Dz / 2] });
  }
  m.add(box([W + 0.01, 0.018, Dz + 0.01], 0.004, 2), rim, { at: [C, B + H + 0.009, C] });
  // the lid's lamp, along its front, lit while on; its switch
  m.add(box([W - 0.04, 0.004, 0.03]), on ? 0xe8f6ff : 0x3a3936, { at: [C, B + H - 0.001, C + 0.03], glow: on });
  m.add(box([0.012, 0.004, 0.008], 0.001), on ? P.ledGreen : P.ink, {
    at: [C + W / 2 - 0.02, B + H + 0.019, C + 0.06],
    glow: on,
  });
  // the gravel, its rocks and its plants
  const G = B + 0.02;
  m.add(box([W - 0.004, 0.018, Dz - 0.004]), planted ? 0x4a3a2a : 0xd2c4a2, { at: [C, B + 0.009, C] });
  for (let i = 0; i < 26; i++)
    m.add(ball(0.006 + rnd(i, 2, 1) * 0.004, 5), shade(planted ? 0x5a4632 : 0xc9b48a, 0.8 + rnd(i, 2, 2) * 0.4), {
      at: [C + (rnd(i, 2, 3) - 0.5) * (W - 0.03), G - 0.002, C + (rnd(i, 2, 4) - 0.5) * (Dz - 0.03)],
      scale: [1, 0.55, 1],
    });
  m.add(ball(0.03, 7), 0x7a7468, { at: [C + 0.08, G + 0.008, C - 0.04], scale: [1.3, 0.8, 0.9] });
  m.add(ball(0.02, 6), 0x8a8478, { at: [C + 0.11, G + 0.004, C - 0.01], scale: [1, 0.7, 0.8] });
  const fronds = planted ? 22 : 9;
  for (let i = 0; i < fronds; i++) {
    const x = C - W / 2 + 0.02 + rnd(i, 3, 1) * (W - 0.04);
    const z = C - Dz / 2 + 0.015 + rnd(i, 3, 2) * (planted ? Dz - 0.03 : 0.05);
    const h = 0.07 + rnd(i, 3, 3) * (planted ? 0.12 : 0.08);
    const c = [P.leaf, P.leafYoung, 0x2f6a3d, 0x7a9a3a][i % 4];
    m.add(leaf(h, 0.012 + rnd(i, 3, 4) * 0.01, 0.15, -0.25, 4), c, {
      at: [x, G - 0.004, z],
      rot: [-1.35 + rnd(i, 3, 5) * 0.3, rnd(i, 3, 6) * Math.PI * 2, 0],
    });
  }
  if (planted)
    for (let i = 0; i < 9; i++)
      m.add(ball(0.009, 6), 0x3f7a3a, {
        at: [C - 0.12 + i * 0.03, G + 0.004, C + 0.05 + rnd(i, 4, 1) * 0.02],
      });
  // (story) a diver, a treasure chest, a little castle
  if (o.seed < 0.34) {
    m.add(box([0.026, 0.016, 0.018], 0.002), 0x7a4a2a, { at: [C - 0.09, G + 0.006, C - 0.03] });
    m.add(box([0.028, 0.004, 0.02], 0.001), D.gold, { at: [C - 0.09, G + 0.016, C - 0.035], rot: [-0.4, 0, 0] });
  } else if (o.seed < 0.67) {
    m.add(ball(0.009, 8), D.gold, { at: [C - 0.09, G + 0.036, C - 0.03] });
    m.add(rod(0.004, 0.004, 0.002, "z", 8), P.glass, { at: [C - 0.09, G + 0.036, C - 0.021] });
    m.add(box([0.016, 0.022, 0.012], 0.003), 0x6a6a6a, { at: [C - 0.09, G + 0.016, C - 0.03] });
    m.add(box([0.006, 0.012, 0.006]), 0x6a6a6a, { at: [C - 0.094, G + 0.002, C - 0.03] });
  } else {
    m.add(box([0.03, 0.04, 0.022]), 0xb8a888, { at: [C - 0.09, G + 0.018, C - 0.03] });
    for (const s of [-1, 1])
      m.add(cyl(0.007, 0.007, 0.05, 6), 0xb8a888, { at: [C - 0.09 + s * 0.016, G - 0.002, C - 0.03] });
    m.add(box([0.008, 0.012, 0.002]), P.ink, { at: [C - 0.09, G + 0.006, C - 0.018] });
  }
  // the water (see-through, lit while on)
  m.live(
    box([W - 0.004, H - 0.024, Dz - 0.004]),
    planted ? 0x8fd8b8 : D.water,
    { kind: "still" },
    {
      at: [C, B + (H - 0.024) / 2 + 0.002, C],
      glass: true,
      glow: on,
    },
  );
  // the fish: a school of neons one way, a pair of clownfish (or tetras) the other
  m.live(
    school(5, 0.055, 0.026, 0.009, 0.5, 2),
    planted ? 0xd84a3a : 0x3fd0ff,
    { kind: "swirl", speed: 0.5, bob: 0.012, period: 4.2, phase: 0 },
    { at: [C - 0.07, B + 0.11, C] },
  );
  m.live(
    school(planted ? 4 : 2, 0.05, planted ? 0.024 : 0.034, planted ? 0.009 : 0.016, -0.4, 3),
    planted ? 0xffd36a : 0xf07a2a,
    { kind: "swirl", speed: -0.4, bob: 0.01, period: 5.1, phase: 0.3 },
    { at: [C + 0.07, B + 0.09, C] },
  );
  bubbles(m, C + 0.13, C + 0.06, G, B + H - 0.03, false);
}

// ── the typewriter ────────────────────────────────────────────────────────────────────────────────
/** A manual typewriter: its body stepping up to the carriage, four rows of round keys on their stalks
 *  (cream rimmed in chrome; black for the office one), the space bar, the type basket's fan of bars
 *  under its hood, the platen and its knobs, the return lever, the ribbon spools, a sheet in it with
 *  lines typed (as many as its seed). */
function typewriter(m: Model, o: Look) {
  m.facing = TURN;
  const body = [0x24231f, 0x9fcfbc, 0xb8352c][o.look] ?? 0x24231f;
  const office = o.look === 0;
  const keyTop = office ? 0x1a1a1a : D.rubberCream;
  const keyRim = office ? P.chrome : shade(body, 0.75);
  const W = 0.34;
  // its body: a profile from the keys (front, +z) up to the carriage, pushed across
  // (the outline's x runs from the back (−) to the front (+): its depth along z once turned)
  const side: [number, number][] = [
    [0.13, 0],
    [0.135, 0.02],
    [0.08, 0.05],
    [0.0, 0.08],
    [-0.06, 0.1],
    [-0.13, 0.1],
    [-0.135, 0.08],
    [-0.135, 0],
  ];
  m.add(extrude(side, W - 0.02, 0.006, 2), body, { at: [C, 0.006, C], rot: [0, -Math.PI / 2, 0] });
  // its side panels, a little darker, and the feet
  for (const s of [-1, 1]) {
    m.add(extrude(side, 0.012, 0.003), shade(body, 0.82), {
      at: [C + s * (W / 2 - 0.006), 0.003, C],
      rot: [0, -Math.PI / 2, 0],
    });
    for (const z of [-0.11, 0.11]) m.add(cyl(0.01, 0.01, 0.006, 8), P.rubber, { at: [C + s * 0.14, -0.0, C + z] });
  }
  // a badge on its front
  m.add(box([0.05, 0.008, 0.002]), D.gold, { at: [C, 0.012, C + 0.137], rot: [-0.2, 0, 0] });
  // the keys: four rows stepping back and up, on stalks
  const rows = [11, 11, 10, 9];
  const slope = Math.atan2(0.05, 0.08);
  for (let r = 0; r < 4; r++) {
    const z = C + 0.105 - r * 0.024;
    const y = 0.03 + r * 0.012 + 0.012;
    for (let i = 0; i < rows[r]; i++) {
      const x = C - ((rows[r] - 1) * 0.024) / 2 + i * 0.024 + (r % 2) * 0.006;
      m.add(cyl(0.0095, 0.0095, 0.004, 8), keyRim, { at: [x, y, z] });
      m.add(cyl(0.0078, 0.0078, 0.005, 8), keyTop, { at: [x, y + 0.0005, z] });
      // (its letter)
      m.add(box([0.005, 0.0004, 0.006]), office ? P.paperWhite : P.ink, { at: [x, y + 0.0057, z] });
      m.add(box([0.002, 0.016, 0.002]), P.steel, { at: [x, y - 0.008, z + 0.002], rot: [slope, 0, 0] });
    }
  }
  // the space bar and the shift keys
  m.add(box([0.15, 0.008, 0.014], 0.003), keyRim, { at: [C, 0.035, C + 0.125] });
  for (const s of [-1, 1]) m.add(cyl(0.011, 0.011, 0.005, 10), keyTop, { at: [C + s * 0.15, 0.044, C + 0.1] });
  // the type basket under its hood: the bars fanned to the printing point
  m.add(box([0.22, 0.004, 0.04]), P.ink, { at: [C, 0.093, C - 0.03] });
  for (let i = 0; i < 22; i++) {
    const a = -1.2 + (i / 21) * 2.4;
    m.add(
      bar(
        [C + Math.sin(a) * 0.1, 0.095, C - 0.03 + Math.cos(a) * 0.012],
        [C + Math.sin(a) * 0.012, 0.097, C - 0.05],
        0.0012,
        3,
      ),
      P.chrome,
    );
  }
  // the carriage: its rail, the platen and knobs, the paper bail, the return lever
  const PY = 0.125;
  const PZ = C - 0.075;
  m.add(box([W + 0.04, 0.014, 0.05], 0.003), shade(body, 0.9), { at: [C, 0.106, PZ] });
  m.add(rod(0.019, 0.019, W - 0.02, "x", 16), P.rubber, { at: [C, PY, PZ] });
  for (const s of [-1, 1]) {
    m.add(rod(0.016, 0.016, 0.02, "x", 14), shade(body, 0.75), { at: [C + s * (W / 2 + 0.01), PY, PZ] });
    m.add(rod(0.02, 0.02, 0.012, "x", 14), P.chrome, { at: [C + s * (W / 2 + 0.026), PY, PZ] });
  }
  m.add(rod(0.003, 0.003, W - 0.06, "x", 6), P.chrome, { at: [C, PY + 0.016, PZ + 0.02] });
  for (const x of [-0.06, 0.06])
    m.add(rod(0.005, 0.005, 0.012, "x", 8), P.rubber, { at: [C + x, PY + 0.016, PZ + 0.02] });
  m.add(
    tube(
      [
        [C - W / 2 - 0.01, PY + 0.01, PZ + 0.02],
        [C - W / 2 - 0.02, PY + 0.03, PZ + 0.05],
        [C - W / 2 + 0.01, PY + 0.035, PZ + 0.09],
      ],
      0.003,
      5,
      8,
    ),
    P.chrome,
  );
  m.add(ball(0.006, 6), P.chrome, { at: [C - W / 2 + 0.01, PY + 0.035, PZ + 0.09] });
  // the ribbon spools either side of the basket
  for (const s of [-1, 1]) {
    m.add(cyl(0.022, 0.022, 0.006, 14), P.chrome, { at: [C + s * 0.12, 0.096, C - 0.035] });
    m.add(cyl(0.017, 0.017, 0.008, 14), office ? 0x2a1a1a : 0xb8352c, { at: [C + s * 0.12, 0.1, C - 0.035] });
  }
  // a sheet in it, rising behind the platen, lines typed on it
  const sheetTilt = 0.28;
  const SH = 0.2;
  const sx = C - 0.02;
  m.add(box([0.21, SH, 0.0008]), P.paperWhite, {
    at: [sx, PY - 0.01 + Math.cos(sheetTilt) * (SH / 2), PZ - 0.012 - Math.sin(sheetTilt) * (SH / 2)],
    rot: [-sheetTilt, 0, 0],
  });
  const lines = 2 + Math.floor(o.seed * 7);
  for (let i = 0; i < lines; i++) {
    const len = i === lines - 1 ? 0.04 + rnd(i, 5, 1) * 0.06 : 0.12 + rnd(i, 5, 2) * 0.05;
    const up = SH - 0.035 - i * 0.012;
    m.add(box([len, 0.004, 0.0004]), P.ink, {
      at: [
        sx - 0.08 + len / 2,
        PY - 0.01 + up * Math.cos(sheetTilt) + 0.0008 * Math.sin(sheetTilt),
        PZ - 0.012 - Math.sin(sheetTilt) * up + 0.0008 * Math.cos(sheetTilt),
      ],
      rot: [-sheetTilt, 0, 0],
    });
  }
}

// ── headphones on a stand ─────────────────────────────────────────────────────────────────────────
/** Over-ear headphones hung on their stand: a weighted foot, the post, the saddle; the band's padding
 *  over it, the yokes, the cups and their cushions, the lead coiled round the foot. Black, white, or
 *  walnut cups with tan leather. */
function headphonesStand(m: Model, o: Look) {
  m.facing = TURN;
  const [cup, pad, metal, stand] = [
    [0x1f1f22, 0x2b2b2e, P.alumDark, P.graphite],
    [0xe9e6df, 0xc9c6c0, P.chrome, 0xd9d6cf],
    [P.walnut, 0xc49a6a, P.brass, P.walnutDark],
  ][o.look] ?? [0x1f1f22, 0x2b2b2e, P.alumDark, P.graphite];
  const TOP = 0.255;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.055, 0],
        [0.055, 0.01],
        [0.045, 0.016],
        [0.001, 0.016],
      ],
      20,
    ),
    stand,
    { at: [C, 0, C] },
  );
  m.add(cyl(0.008, 0.008, TOP - 0.04, 10), stand, { at: [C, 0.016, C] });
  // the saddle: a short round bar the band's padding rests on
  m.add(rod(0.012, 0.012, 0.06, "z", 12), stand, { at: [C, TOP - 0.025, C] });
  // the band: its steel arc, the padding on top
  const arc = (r: number, n: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (0.06 + (0.88 * i) / n);
      pts.push([C + Math.cos(a) * r, TOP - 0.085 + Math.sin(a) * r, C]);
    }
    return pts;
  };
  m.add(tube(arc(0.09, 16), 0.004, 5, 32), metal);
  m.add(tube(arc(0.08, 12).slice(3, 10), 0.008, 7, 18), pad);
  // the yokes and cups, each side
  for (const s of [-1, 1]) {
    const x = C + s * 0.088;
    m.add(
      tube(
        [
          [x - s * 0.002, TOP - 0.085 + 0.016, C],
          [x + s * 0.004, TOP - 0.13, C],
        ],
        0.004,
        5,
        2,
      ),
      metal,
    );
    m.add(new TorusGeometry(0.036, 0.003, 4, 18), metal, { at: [x + s * 0.006, 0.105, C], rot: [0, Math.PI / 2, 0] });
    m.add(rod(0.038, 0.034, 0.026, "x", 18), cup, { at: [x + s * 0.008, 0.105, C], rot: [0, s < 0 ? Math.PI : 0, 0] });
    m.add(rod(0.03, 0.03, 0.004, "x", 16), shade(cup, 1.25), { at: [x + s * 0.022, 0.105, C] });
    m.add(ring(0.032, 0.012, 5, 18), pad, { at: [x - s * 0.01, 0.105, C], rot: [0, 0, Math.PI / 2] });
  }
  // (story) its lead: down from the left cup, coiled round the foot
  const lead: V3[] = [[C - 0.11, 0.09, C]];
  lead.push([C - 0.12, 0.05, C + 0.01], [C - 0.1, 0.02, C + 0.03]);
  const loops = 1 + Math.floor(o.seed * 2);
  for (let i = 0; i <= 10 * loops; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 2;
    lead.push([C + Math.cos(a) * 0.07, 0.004 + i * 0.0005, C + Math.sin(a) * 0.07]);
  }
  m.add(tube(lead, 0.0018, 4, 20 * loops + 12), P.rubber);
}

// ── the film camera ───────────────────────────────────────────────────────────────────────────────
/** A 35 mm camera set down on the desk: its body in leatherette between a chrome top and bottom, the
 *  prism's hump (the rangefinder's windows instead), the lens and its rings, the shutter button, the
 *  wind lever, the rewind knob, the strap. A film can by it for some (seeded). */
function filmCamera(m: Model, o: Look) {
  m.facing = TURN + 0.5;
  const rf = o.look === 2;
  const plate = o.look === 1 ? 0x232325 : P.chrome;
  const skin = rf ? 0x8a6a48 : 0x1e1e20;
  const W = rf ? 0.13 : 0.138;
  const H = 0.072;
  const DZ = 0.042;
  const y0 = 0.004;
  const z = C - 0.01;
  m.add(box([W, 0.012, DZ], 0.004, 2), plate, { at: [C, y0 + 0.006, z] });
  m.add(box([W - 0.004, H - 0.024, DZ - 0.002], 0.003), skin, { at: [C, y0 + 0.012 + (H - 0.024) / 2, z] });
  m.add(box([W, 0.014, DZ], 0.004, 2), plate, { at: [C, y0 + H - 0.007, z] });
  if (rf) {
    // the rangefinder's windows across its top front
    for (const [x, w] of [
      [-0.045, 0.02],
      [0.0, 0.012],
      [0.04, 0.016],
    ])
      m.add(box([w, 0.012, 0.002]), shade(P.glass, 1.6), { at: [C + x, y0 + H - 0.007, z + DZ / 2 + 0.001] });
  } else {
    // the prism's hump, its badge
    m.add(
      extrude(
        [
          [-0.028, 0],
          [0.028, 0],
          [0.016, 0.028],
          [-0.016, 0.028],
        ],
        0.036,
        0.002,
      ),
      plate,
      { at: [C, y0 + H, z] },
    );
    m.add(box([0.024, 0.006, 0.002]), o.look === 1 ? P.chrome : P.ink, {
      at: [C, y0 + H + 0.016, z + 0.016],
      rot: [-0.4, 0, 0],
    });
    m.add(box([0.012, 0.004, 0.012]), P.ink, { at: [C, y0 + H + 0.03, z] });
  }
  // the lens: its mount, the barrel and its focusing grip, the glass and its glint
  const LY = y0 + H / 2 + 0.004;
  const lz = z + DZ / 2;
  const L = rf ? 0.03 : 0.045;
  m.add(rod(0.026, 0.026, 0.006, "z", 20), P.chrome, { at: [C, LY, lz + 0.003] });
  m.add(rod(0.023, 0.024, L, "z", 20), 0x1a1a1c, { at: [C, LY, lz + 0.006 + L / 2] });
  for (let i = 0; i < 3; i++)
    m.add(new TorusGeometry(0.0245, 0.0018, 3, 20), 0x2e2e30, { at: [C, LY, lz + 0.012 + i * 0.005] });
  m.add(new TorusGeometry(0.0225, 0.0015, 3, 20), P.chrome, { at: [C, LY, lz + 0.006 + L] });
  m.add(rod(0.018, 0.018, 0.002, "z", 18), P.glass, { at: [C, LY, lz + 0.004 + L] });
  m.add(box([0.012, 0.003, 0.001]), shade(P.glass, 3), {
    at: [C - 0.006, LY + 0.007, lz + 0.0055 + L],
    rot: [0, 0, 0.5],
  });
  // the top's controls: the shutter, the wind lever, the rewind knob, the shoe
  const TY = y0 + H;
  m.add(cyl(0.008, 0.008, 0.006, 12), plate, { at: [C + 0.045, TY, z] });
  m.add(cyl(0.0035, 0.0035, 0.004, 8), P.chrome, { at: [C + 0.045, TY + 0.006, z] });
  m.add(box([0.03, 0.002, 0.008], 0.001), P.chrome, { at: [C + 0.055, TY + 0.009, z - 0.008], rot: [0, 0.4, 0] });
  m.add(cyl(0.009, 0.009, 0.008, 12), plate, { at: [C - 0.048, TY, z] });
  m.add(cyl(0.005, 0.005, 0.004, 8), P.ink, { at: [C - 0.048, TY + 0.008, z] });
  // the strap: its lugs, lying in a loop behind
  for (const s of [-1, 1])
    m.add(box([0.004, 0.008, 0.008]), P.chrome, { at: [C + s * (W / 2 + 0.002), TY - 0.012, z] });
  const strap: V3[] = [
    [C - W / 2 - 0.004, TY - 0.012, z],
    [C - W / 2 - 0.02, 0.008, z - 0.02],
    [C - 0.04, 0.0045, z - 0.08],
    [C + 0.04, 0.0045, z - 0.085],
    [C + W / 2 + 0.02, 0.008, z - 0.02],
    [C + W / 2 + 0.004, TY - 0.012, z],
  ];
  m.add(tube(strap, 0.004, 4, 24), o.look === 2 ? 0x5a3a22 : 0x2a2a2c);
  if (o.seed > 0.5) {
    // (story) a film can lying by it
    m.add(rod(0.0125, 0.0125, 0.045, "x", 14), 0xf2c23a, { at: [C + 0.06, 0.0125, z + 0.065] });
    m.add(rod(0.0128, 0.0128, 0.012, "x", 14), P.ink, { at: [C + 0.035, 0.0125, z + 0.065] });
    m.add(rod(0.004, 0.004, 0.008, "x", 8), P.ink, { at: [C + 0.086, 0.0125, z + 0.065] });
  }
}

// ── the walkman ───────────────────────────────────────────────────────────────────────────────────
/** A cassette player lying on its back: the tape behind its window (two reels, the label), the piano
 *  keys along its end, the volume wheel; its foam headphones beside it on their thin band, the lead
 *  to its jack. */
function walkman(m: Model, o: Look) {
  m.facing = TURN - 0.35;
  const body = [0x3d5f9a, 0xf2c23a, 0xb8352c][o.look] ?? 0x3d5f9a;
  const trim = [P.chrome, 0x2b2a28, 0x2b2a28][o.look] ?? P.chrome;
  const W = 0.088;
  const L = 0.118;
  const T = 0.03;
  const cx = C - 0.03;
  m.add(box([W, T, L], 0.005, 2), body, { at: [cx, T / 2, C] });
  m.add(box([W - 0.01, 0.002, L - 0.03], 0.002), trim, { at: [cx, T + 0.0005, C - 0.006] });
  // the window, the tape in it: its smoked shell, the label across its top, the brown tape wound on
  // one reel more than the other (as far as it's played: its seed), the white hubs and their teeth
  m.add(box([0.066, 0.002, 0.044]), 0x3a3430, { at: [cx, T + 0.0015, C - 0.01] });
  m.add(box([0.06, 0.0005, 0.011]), [P.cream, 0xe6ddcb, 0xf0ebe0][o.look] ?? P.cream, {
    at: [cx, T + 0.0028, C - 0.0255],
  });
  m.add(box([0.044, 0.0006, 0.002]), 0xc8302c, { at: [cx, T + 0.0032, C - 0.0255] });
  for (const s of [-1, 1]) {
    const wound = 0.008 + (s < 0 ? o.seed : 1 - o.seed) * 0.007;
    m.add(cyl(wound, wound, 0.0012, 16), 0x4a2a1a, { at: [cx + s * 0.017, T + 0.0022, C - 0.004] });
    m.add(cyl(0.0058, 0.0058, 0.0016, 12), P.paperWhite, { at: [cx + s * 0.017, T + 0.0026, C - 0.004] });
    m.add(cyl(0.0028, 0.0028, 0.0018, 6), 0x1a1c20, { at: [cx + s * 0.017, T + 0.0028, C - 0.004] });
  }
  // the keys along its end, the volume wheel on its side, the jack
  const keys = [0xd8d4cc, 0xd8d4cc, 0xd8d4cc, 0xd8d4cc, 0xc8302c];
  for (const [i, c] of keys.entries())
    m.add(box([0.014, 0.008, 0.012], 0.002), c, { at: [cx - 0.032 + i * 0.016, T - 0.004, C + L / 2 + 0.004] });
  m.add(rod(0.01, 0.01, 0.005, "x", 14), trim, { at: [cx + W / 2 + 0.002, T / 2, C - 0.02] });
  m.add(rod(0.003, 0.003, 0.006, "z", 8), P.ink, { at: [cx + 0.03, T / 2, C - L / 2 - 0.002] });
  // the headphones: the band, the foam pads, the lead to the jack
  const hx = C + 0.07;
  const band: V3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    band.push([hx + Math.sin(a) * 0.05, 0.004, C - 0.06 * Math.cos(a)]);
  }
  m.add(tube(band, 0.0022, 4, 24), trim);
  for (const s of [-1, 1]) {
    m.add(cyl(0.012, 0.012, 0.01, 10), 0x2b2a28, { at: [hx, 0, C + s * 0.06] });
    m.add(ball(0.022, 10), 0xe8803a, { at: [hx, 0.014, C + s * 0.06], scale: [1, 0.55, 1] });
  }
  m.add(
    tube(
      [
        [hx, 0.006, C + 0.06],
        [hx - 0.03, 0.003, C + 0.075],
        [cx + 0.06, 0.003, C - 0.075],
        [cx + 0.03, T / 2, C - L / 2 - 0.006],
      ],
      0.0012,
      3,
      18,
    ),
    P.rubber,
  );
}

// ── the rolodex ───────────────────────────────────────────────────────────────────────────────────
/** A rotary card file: its sled foot, the side discs and their knobs, the cards fanned round the axle
 *  between, every few with an A-to-Z tab. */
function rolodex(m: Model, o: Look) {
  m.facing = TURN;
  const frame = [0x1f1f22, P.chrome, 0xd9cfb4][o.look] ?? 0x1f1f22;
  const AY = 0.07;
  const W = 0.12;
  // the foot: two runners and a crossbar
  for (const s of [-1, 1]) {
    m.add(box([0.008, 0.008, 0.11], 0.002), frame, { at: [C + s * (W / 2 + 0.006), 0.004, C] });
    // the side discs, their knobs
    m.add(rod(0.05, 0.05, 0.008, "x", 24), frame, { at: [C + s * (W / 2 + 0.008), AY, C] });
    m.add(rod(0.016, 0.014, 0.014, "x", 14), shade(frame, 0.8), { at: [C + s * (W / 2 + 0.019), AY, C] });
    m.add(
      extrude(
        [
          [-0.05, 0],
          [0.05, 0],
          [0.012, AY],
          [-0.012, AY],
        ],
        0.008,
      ),
      frame,
      { at: [C + s * (W / 2 + 0.008), 0, C], rot: [0, Math.PI / 2, 0] },
    );
  }
  m.add(rod(0.006, 0.006, W + 0.01, "x", 10), P.chrome, { at: [C, AY, C] });
  // the cards: round the axle, fanned on the upper side
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a = -1.65 + (i / (N - 1)) * 3.3;
    const lift = Math.abs(i - N / 2) < 1 ? 0.004 : 0;
    const card = i % 9 === 4 ? 0xf0ebe0 : shade(P.paperWhite, 0.94 + rnd(i, 6, 1) * 0.08);
    m.add(box([W - 0.008, 0.044, 0.0009]), card, {
      at: [C, AY + Math.cos(a) * (0.03 + lift), C + Math.sin(a) * (0.03 + lift)],
      rot: [a, 0, 0],
    });
    if (i % 4 === 1) {
      const tx = -0.045 + ((i * 7) % 10) * 0.01;
      m.add(box([0.014, 0.008, 0.0011]), [0xc8302c, 0x3d6aa8, 0xd9a441, 0x4a8a4a][(i >> 2) % 4], {
        at: [C + tx, AY + Math.cos(a) * 0.055, C + Math.sin(a) * 0.055],
        rot: [a, 0, 0],
      });
    }
  }
}

// ── the pencil cup ────────────────────────────────────────────────────────────────────────────────
/** A cup of what's needed at a desk: pencils (sharpened, their erasers down in it), pens with their
 *  clips, a highlighter, scissors, a ruler; in a steel mesh cup, a glazed one, or a tin can with its
 *  label. What's in it by its seed. */
function pencilCup(m: Model, o: Look) {
  m.facing = TURN;
  const R = 0.037;
  const H = 0.095;
  if (o.look === 0) {
    m.add(cyl(R, R, 0.004, 18), P.graphite, { at: [C, 0, C] });
    m.add(
      lathe(
        [
          [R, 0],
          [R + 0.001, H],
          [R - 0.002, H],
          [R - 0.003, 0.004],
        ],
        22,
      ),
      0x2b2c30,
      { at: [C, 0, C] },
    );
    for (let i = 0; i < 9; i++) m.add(ring(R + 0.0012, 0.0008, 3, 22), 0x5a5c60, { at: [C, 0.01 + i * 0.01, C] });
    m.add(ring(R + 0.0008, 0.0022, 4, 22), 0x5a5c60, { at: [C, H, C] });
  } else if (o.look === 1) {
    m.add(
      lathe(
        [
          [0.001, 0],
          [R - 0.004, 0],
          [R, 0.008],
          [R + 0.002, H],
          [R - 0.003, H],
          [R - 0.004, 0.01],
          [0.001, 0.01],
        ],
        20,
      ),
      0x3d6a8a,
      {
        at: [C, 0, C],
      },
    );
    m.add(ring(R + 0.0015, 0.003, 4, 20), P.ceramic, { at: [C, H * 0.62, C] });
  } else {
    m.add(
      lathe(
        [
          [0.001, 0],
          [R, 0],
          [R, H],
          [R - 0.001, H],
          [R - 0.001, 0.004],
          [0.001, 0.004],
        ],
        20,
      ),
      P.chrome,
      { at: [C, 0, C] },
    );
    for (const y of [0.01, H - 0.01]) m.add(ring(R + 0.0006, 0.0014, 3, 20), P.chrome, { at: [C, y, C] });
    m.add(cyl(R + 0.0008, R + 0.0008, 0.05, 20), [0xc8302c, 0x3d6a8a, 0xd9a441, 0x4a8a4a][Math.floor(o.seed * 4)], {
      at: [C, 0.022, C],
    });
    m.add(cyl(R + 0.0012, R + 0.0012, 0.012, 20), P.cream, { at: [C, 0.04, C] });
  }
  // what's in it: each leaning out from the bottom's middle
  const items = 5 + Math.floor(o.seed * 3);
  for (let i = 0; i < items; i++) {
    const a = (i / items) * Math.PI * 2 + 0.4;
    const lean = 0.12 + rnd(i, 7, 1) * 0.1;
    const kind = (i + Math.floor(o.seed * 5)) % 5;
    const at: V3 = [C + Math.cos(a) * 0.012, 0.01, C + Math.sin(a) * 0.012];
    // (tipped out toward its side: round the axis across that way)
    const rot: V3 = [Math.sin(a) * lean, 0, -Math.cos(a) * lean];
    if (kind === 0 || kind === 3) {
      // a pencil: its hex body, the cone, the lead
      const len = 0.15 + rnd(i, 7, 2) * 0.03;
      const c = kind === 0 ? 0xf2c23a : 0x3d6a8a;
      m.add(cyl(0.0035, 0.0035, len, 6), c, { at, rot });
      m.add(cyl(0.0035, 0.0006, 0.014, 6).translate(0, len, 0), 0xe2c69a, { at, rot });
      m.add(cyl(0.0012, 0.0002, 0.004, 4).translate(0, len + 0.011, 0), P.ink, { at, rot });
    } else if (kind === 1) {
      // a pen: its barrel, the cap's clip
      const len = 0.14;
      const c = [P.ink, 0x2e5fc0, 0xc8302c][i % 3];
      m.add(cyl(0.0042, 0.0038, len, 10), c, { at, rot });
      m.add(box([0.0015, 0.03, 0.003]).translate(0.0045, len - 0.02, 0), P.chrome, { at, rot });
      m.add(cyl(0.0038, 0.002, 0.008, 10).translate(0, len, 0), c, { at, rot });
    } else if (kind === 2) {
      // scissors: blades down in the cup, the loops of their handles up
      m.add(box([0.004, 0.09, 0.0015]).translate(-0.002, 0.045, 0), P.chrome, { at, rot });
      m.add(box([0.004, 0.09, 0.0015]).translate(0.002, 0.045, 0.0016), P.chrome, { at, rot });
      for (const s of [-1, 1])
        m.add(new TorusGeometry(0.009, 0.0022, 4, 12).translate(s * 0.009, 0.1, 0), 0xc8302c, { at, rot });
    } else {
      // a ruler or a highlighter
      if (i % 2) m.add(box([0.022, 0.15, 0.0015]).translate(0, 0.075, 0), 0xd9cfb4, { at, rot });
      else {
        m.add(cyl(0.006, 0.006, 0.11, 8), 0xe8f04a, { at, rot });
        m.add(cyl(0.0063, 0.0063, 0.025, 8).translate(0, 0.11, 0), P.ink, { at, rot });
      }
    }
  }
}

// ── the hourglass ─────────────────────────────────────────────────────────────────────────────────
/** An hourglass in its turned frame: two discs, three posts, the glass bulbs between (see-through),
 *  the sand fallen below and what's left above (how far by its seed), the thin stream through the
 *  neck, its grains falling (live: lit in turn down it). Walnut, or brass. */
function hourglass(m: Model, o: Look) {
  m.facing = TURN;
  const wood = o.look === 1 ? P.brass : P.walnut;
  const H = 0.2;
  const NY = 0.012 + (H - 0.024) / 2; // the neck
  for (const y of [0, H - 0.012]) {
    m.add(cyl(0.048, 0.048, 0.012, 20), wood, { at: [C, y, C] });
    m.add(ring(0.048, 0.003, 4, 20), shade(wood, 0.8), { at: [C, y + 0.006, C] });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const [x, z] = [C + Math.cos(a) * 0.039, C + Math.sin(a) * 0.039];
    m.add(
      lathe(
        [
          [0.004, 0],
          [0.006, 0.012],
          [0.0045, 0.03],
          [0.0045, H - 0.054],
          [0.006, H - 0.042],
          [0.004, H - 0.024],
        ],
        8,
      ),
      wood,
      { at: [x, 0.012, z] },
    );
  }
  // the glass: two bulbs and the neck; a bulb's radius `y` m from the neck (bulbR)
  const G0 = 0.012;
  const half = NY - G0;
  const bulbR = (d: number) => 0.0025 + 0.027 * Math.sin(Math.PI * 0.88 * Math.min(1, Math.abs(d) / half)) ** 0.8;
  const prof: [number, number][] = [[0.001, 0]];
  for (let i = 0; i <= 16; i++) {
    const y = (i / 16) * 2 * half;
    prof.push([bulbR(y - half), y]);
  }
  prof.push([0.001, 2 * half]);
  m.live(lathe(prof, 18), D.glass, { kind: "still" }, { at: [C, G0, C], glass: true });
  // the sand: fallen below as a mound in its bulb, the rest above on the funnel round the neck, dimpled
  // where it runs (its seed: how far it's run)
  const run = 0.25 + o.seed * 0.6;
  const low = 0.012 + run * 0.04;
  const heap: [number, number][] = [[0.001, 0]];
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * low * 0.55;
    heap.push([bulbR(half - y) - 0.0012, y]);
  }
  heap.push([bulbR(half - low * 0.6) * 0.45, low * 0.9], [0.001, low]);
  m.add(lathe(heap, 16), D.sand, { at: [C, G0, C] });
  const up = (1 - run) * 0.055;
  if (up > 0.006) {
    const rest: [number, number][] = [[0.0015, 0]];
    for (let i = 1; i <= 4; i++) {
      const y = (i / 4) * up;
      rest.push([bulbR(y) - 0.0012, y]);
    }
    rest.push([0.006, up - 0.004], [0.001, up - 0.007]);
    m.add(lathe(rest, 16), D.sand, { at: [C, NY, C] });
  }
  // the stream through the neck, its grains falling
  m.add(cyl(0.0008, 0.0008, NY - G0 - low + 0.002, 4), D.sand, { at: [C, G0 + low - 0.002, C] });
  const fall = NY - G0 - low;
  for (let s = 0; s < 3; s++) {
    const gs: BufferGeometry[] = [];
    for (let k = s; k < 9; k += 3)
      gs.push(box([0.0022, 0.0022, 0.0022]).translate((rnd(k, 8, 1) - 0.5) * 0.002, NY - (k / 9) * fall, 0));
    m.live(merged(gs), shade(D.sand, 1.1), { kind: "blink", period: 0.36, on: 0.34, phase: s / 3 }, { at: [C, 0, C] });
  }
}

// ── the bonsai ────────────────────────────────────────────────────────────────────────────────────
/** A little tree in a shallow glazed pot on its feet: moss over the soil, a stone, the trunk twisting
 *  up and over, its branches out to pads of foliage — juniper green, maple red, or pink blossom with
 *  petals fallen on the moss. */
function bonsai(m: Model, o: Look) {
  m.facing = TURN;
  const pot = [0x4f6a7a, 0xd9cfb4, 0x2b2622][o.look] ?? 0x4f6a7a;
  const foliage = [0x3f6b3a, 0xb5452f, 0xf2b8c6][o.look] ?? 0x3f6b3a;
  const deep = [0x2f5a30, 0x8a2f22, 0xd88aa0][o.look] ?? 0x2f5a30;
  const bark = o.look === 2 ? 0x3a2a22 : 0x6a4a32;
  const W = 0.2;
  const DZ = 0.13;
  const PH = 0.045;
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    m.add(box([0.018, 0.008, 0.014], 0.002), shade(pot, 0.8), {
      at: [C + x * (W / 2 - 0.016), 0.004, C + z * (DZ / 2 - 0.014)],
    });
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.06, 0],
        [0.068, PH],
        [0.064, PH],
        [0.058, 0.01],
        [0.001, 0.01],
      ],
      4,
    ).rotateY(Math.PI / 4),
    pot,
    // (the lathe's four sides turned square on, stretched to its oblong)
    { at: [C, 0.008, C], scale: [W / (0.136 * Math.SQRT1_2), 1, DZ / (0.136 * Math.SQRT1_2)] },
  );
  const top = 0.008 + PH - 0.006;
  m.add(box([W - 0.02, 0.006, DZ - 0.02], 0.002), 0x5a7a3a, { at: [C, top, C] });
  for (let i = 0; i < 6; i++)
    m.add(ball(0.012, 6), shade(0x6a8a3a, 0.85 + rnd(i, 9, 1) * 0.3), {
      at: [C + (rnd(i, 9, 2) - 0.5) * (W - 0.05), top + 0.002, C + (rnd(i, 9, 3) - 0.5) * (DZ - 0.05)],
      scale: [1, 0.35, 1],
    });
  m.add(ball(0.016, 6), 0x8a8478, { at: [C + 0.055, top + 0.006, C + 0.025], scale: [1.4, 0.8, 1] });
  // the trunk: thick at its root, twisting up and over, thinner as it goes
  const t0: V3 = [C - 0.03, top, C];
  const t1: V3 = [C - 0.02, top + 0.05, C + 0.01];
  const t2: V3 = [C + 0.035, top + 0.1, C - 0.005];
  const t3: V3 = [C + 0.01, top + 0.15, C + 0.005];
  const t4: V3 = [C - 0.03, top + 0.18, C];
  m.add(tube([t0, t1, t2], 0.012, 7, 12), bark);
  m.add(tube([t1, t2, t3], 0.008, 6, 12), bark);
  m.add(tube([t2, t3, t4], 0.005, 5, 10), bark);
  m.add(ball(0.016, 7), bark, { at: [t0[0], top + 0.004, t0[2]], scale: [1.3, 0.5, 1.1] });
  // branches out to the pads
  const pads: [V3, number][] = [
    [[C + 0.075, top + 0.09, C + 0.01], 0.042],
    [[C - 0.075, top + 0.125, C - 0.01], 0.038],
    [[C + 0.035, top + 0.165, C + 0.01], 0.034],
    [[C - 0.045, top + 0.2, C], 0.03],
  ];
  const from: V3[] = [t2, [t2[0] - 0.02, t2[1] + 0.03, t2[2]], t3, t4];
  pads.forEach(([p, r], i) => {
    m.add(tube([from[i], [(from[i][0] + p[0]) / 2, (from[i][1] + p[1]) / 2 + 0.008, p[2]], p], 0.0035, 4, 6), bark);
    // a pad: a cloud of flattened balls, darker under
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + i;
      const d = k === 0 ? 0 : r * 0.55;
      m.add(ball(r * (k === 0 ? 0.62 : 0.45), 7), k % 2 ? foliage : shade(foliage, 1.08), {
        at: [
          p[0] + Math.cos(a) * d * (k ? 1 : 0),
          p[1] + 0.006 + (k ? 0 : 0.008),
          p[2] + Math.sin(a) * d * 0.6 * (k ? 1 : 0),
        ],
        scale: [1, 0.45, 0.8],
      });
    }
    m.add(ball(r * 0.85, 7), deep, { at: [p[0], p[1] - 0.002, p[2]], scale: [1, 0.25, 0.7] });
  });
  if (o.look === 2)
    for (let i = 0; i < 8; i++)
      m.add(box([0.005, 0.0008, 0.005]), foliage, {
        at: [C + (rnd(i, 10, 1) - 0.5) * (W - 0.03), top + 0.004, C + (rnd(i, 10, 2) - 0.5) * (DZ - 0.03)],
        rot: [0, rnd(i, 10, 3) * 3, 0],
      });
}

// ── the Rubik's cube ──────────────────────────────────────────────────────────────────────────────
const FACES = [0xf2f2ee, 0xf2d43a, 0xc8302c, 0xf07a2a, 0x2e5fc0, 0x2f9a52];
/** A twisty puzzle cube: its black body of cubies, a sticker on every outer face — solved, or
 *  scrambled by its seed, its top layer caught mid-turn for some. 3×3 or the pocket 2×2. */
function rubiksCube(m: Model, o: Look) {
  m.facing = TURN + 0.4;
  const n = o.look === 1 ? 2 : 3;
  const S = 0.057;
  const c = S / n;
  const solved = o.seed < 0.25;
  const twist = o.seed > 0.6 ? 0.42 : 0;
  // each face's normal and its colour when solved: +y −y +z −z +x −x
  const NORMALS: V3[] = [
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
  ];
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < n; l++) {
        const p: V3 = [(i - (n - 1) / 2) * c, (j - (n - 1) / 2) * c, (l - (n - 1) / 2) * c];
        const turn = j === n - 1 ? twist : 0;
        const place = (q: V3): V3 => {
          const [x, y, z] = q;
          const [ct, st] = [Math.cos(turn), Math.sin(turn)];
          return [C + x * ct + z * st, S / 2 + y, C - x * st + z * ct];
        };
        m.add(box([c * 0.97, c * 0.97, c * 0.97], c * 0.12), 0x161618, { at: place(p), rot: [0, turn, 0] });
        NORMALS.forEach((nn, f) => {
          // (a sticker on each outer face; none under it, on the desk)
          const edge = (v: number, at: number) => v !== 0 && at === (v > 0 ? n - 1 : 0);
          if (nn[1] < 0 || !(edge(nn[0], i) || edge(nn[1], j) || edge(nn[2], l))) return;
          const col = solved ? FACES[f] : FACES[Math.floor(rnd(k++, Math.floor(o.seed * 20), 11) * 6)];
          const q: V3 = [p[0] + nn[0] * c * 0.49, p[1] + nn[1] * c * 0.49, p[2] + nn[2] * c * 0.49];
          const size: V3 = [nn[0] ? 0.0012 : c * 0.8, nn[1] ? 0.0012 : c * 0.8, nn[2] ? 0.0012 : c * 0.8];
          m.add(box(size, 0.0004), col, { at: place(q), rot: [0, turn, 0] });
        });
      }
}

// ── the Vortex figurine ───────────────────────────────────────────────────────────────────────────
/** Vortex, the campus's own orb, as a bobblehead on a desk: a round plinth with his name in brass dots,
 *  a spring, and him on it — his magenta orb with its sheen and swirl, the big white eyes, the grin
 *  and its pink tongue, his thin arms and white gloves — bobbling (live), two motes going round him.
 *  Classic, solid gold, or his twin's green. */
function vortexFigurine(m: Model, o: Look) {
  m.facing = TURN;
  const pal =
    [
      {
        body: D.magenta,
        sheen: D.magentaLight,
        swirl: 0xffffff,
        inner: D.teal,
        eye: 0xffffff,
        ink: D.vxInk,
        arm: D.vxArm,
      },
      { body: D.gold, sheen: 0xf2d27a, swirl: 0xf8e6a8, inner: 0xb8862a, eye: 0xf8e6a8, ink: 0x6a4a1a, arm: 0xb8862a },
      {
        body: 0x8fbf5a,
        sheen: 0xd8f2a8,
        swirl: 0xe9ffd0,
        inner: 0x6aa8ff,
        eye: 0xffffff,
        ink: 0x13240c,
        arm: 0x2a3a1a,
      },
    ][o.look] ?? null;
  if (!pal) throw new Error(`vortex_figurine: no look ${o.look}`);
  // the plinth, his name on it
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.05, 0],
        [0.052, 0.006],
        [0.046, 0.022],
        [0.001, 0.022],
      ],
      22,
    ),
    o.look === 1 ? P.walnut : 0x1a1420,
    { at: [C, 0, C] },
  );
  m.add(box([0.05, 0.012, 0.002]), P.brass, { at: [C, 0.012, C + 0.047], rot: [-0.13, 0, 0] });
  const name = dotsAt("VORTEX", 0, 0.0035, 0, 0.0013);
  if (name) m.add(name, P.ink, { at: [C, 0.012, C + 0.0485], rot: [-0.13, 0, 0] });
  // the spring
  const coil: V3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 10;
    coil.push([C + Math.cos(a) * 0.008, 0.022 + t * 0.022, C + Math.sin(a) * 0.008]);
  }
  m.add(tube(coil, 0.0012, 3, 120), P.chrome);
  // him, round the spring's top (each colour its own part, bobbling together)
  const PY = 0.044;
  const R = 0.042;
  const cy = R + 0.002; // his middle over the spring
  const bob = { kind: "nod", amp: 0.13, period: 1.7, phase: o.seed } as const;
  const at: V3 = [C, PY, C];
  // (each colour one live part, bobbling with the rest: his body, the whites, the inks…)
  const groups = new Map<number, BufferGeometry[]>();
  const part = (gs: BufferGeometry[], c: number) => groups.set(c, [...(groups.get(c) ?? []), ...gs]);
  const on = (x: number, y: number, out = 0): [number, number, number] => {
    // a point on his front, (x, y) across it from his middle
    const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
    return [x, cy + y, z + out];
  };
  part([ball(R, 20).translate(0, cy, 0)], pal.body);
  // his sheen: a soft cap at his upper left
  part(
    [
      ball(R * 0.42, 10)
        .scale(1, 0.62, 0.5)
        .rotateZ(0.5)
        .translate(...on(-0.016, 0.024, -0.006)),
    ],
    pal.sheen,
  );
  // the swirl: an arc round his front, the inner one
  const arc = (r: number, a0: number, a1: number, out: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      pts.push(on(Math.cos(a) * r, Math.sin(a) * r, out));
    }
    return pts;
  };
  part([tube(arc(0.031, 1.6, 5.4, 0.0005), 0.0016, 4, 20)], pal.swirl);
  part([tube(arc(0.019, 1.7, 4.8, 0.0005), 0.001, 3, 14)], pal.inner);
  // the eyes: big white ovals, their pupils, a glint each
  const eyes: BufferGeometry[] = [];
  const pupils: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    eyes.push(
      ball(0.0105, 10)
        .scale(0.8, 1, 0.38)
        .translate(...on(s * 0.011, 0.006, -0.0015)),
    );
    pupils.push(
      ball(0.0058, 8)
        .scale(0.9, 1, 0.4)
        .translate(...on(s * 0.0105, 0.0055, 0.0018)),
    );
  }
  part(eyes, pal.eye);
  part(pupils, pal.ink);
  part(
    [-1, 1].map((s) => ball(0.0016, 5).translate(...on(s * 0.0105 - 0.002, 0.0085, 0.0034))),
    0xffffff,
  );
  // the grin and its tongue
  const smile: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = -1 + (2 * i) / 8;
    smile.push(on(t * 0.013, -0.012 - (1 - t * t) * 0.006, 0.0004));
  }
  part([tube(smile, 0.0022, 4, 16)], pal.ink);
  part(
    [
      ball(0.004, 6)
        .scale(1, 0.5, 0.4)
        .translate(...on(0.001, -0.0175, 0.0012)),
    ],
    D.tongue,
  );
  // his arms, the white gloves
  const arms: BufferGeometry[] = [];
  const gloves: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    arms.push(
      tube(
        [
          [s * R * 0.92, cy - 0.012, 0.006],
          [s * (R + 0.012), cy - 0.026, 0.008],
          [s * (R + 0.008), cy - 0.042, 0.012],
        ],
        0.0022,
        4,
        8,
      ),
    );
    gloves.push(ball(0.0055, 7).translate(s * (R + 0.008), cy - 0.045, 0.012));
  }
  part(arms, pal.arm);
  part(gloves, 0xffffff);
  for (const [c, gs] of groups) m.live(merged(gs), c, bob, { at });
  // two motes going round him (his aura's)
  m.live(
    merged([ball(0.0025, 5).translate(R + 0.014, 0.01, 0), ball(0.002, 5).translate(-(R + 0.01), -0.008, 0.01)]),
    o.look === 2 ? 0x6aa8ff : D.teal,
    { kind: "spin", axis: "y", speed: 1.1 },
    { at: [C, PY + cy, C], glow: true },
  );
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  newtons_cradle: newtonsCradle,
  desk_globe: deskGlobe,
  desk_fan: deskFan,
  desk_snow_globe: deskSnowGlobe,
  desk_aquarium: deskAquarium,
  typewriter,
  headphones_stand: headphonesStand,
  film_camera: filmCamera,
  walkman,
  rolodex,
  pencil_cup: pencilCup,
  hourglass,
  bonsai,
  rubiks_cube: rubiksCube,
  vortex_figurine: vortexFigurine,
};
