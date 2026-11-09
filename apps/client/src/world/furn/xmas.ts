import { glyphDots } from "@yutopia/shared/glyphs";
import { type BufferGeometry, Float32BufferAttribute, BufferGeometry as Geo } from "three";
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
} from "./kit";
import { finishes } from "./life-mats";
import { P, shade } from "./palette";

// Christmas (docs/plan/68-more-furniture.md, phase 2): the tree and its little one on a table,
// presents, stockings with a name on, a wreath, a garland of lights, mistletoe, a hot cocoa station,
// a gingerbread house, a lit village with its train going round, a nutcracker, a candle arch, a
// poinsettia, an advent calendar opened to today, a gift-wrapping table; out of doors candy canes, a
// light-up reindeer nodding, a sleigh, an inflatable snowman and a giant snow globe, its flakes
// drifting. Each in its kind's frame as the rest of the kit (x across, z out toward the room, y up,
// metres); a wall piece on the wall's face at z 0.1 (walls.ts), a ceiling one up to 3.27 (staples.ts).

export const XMAS_LOOKS = {
  xmas_tree: ["Classic fir", "Flocked", "Silver tinsel"],
  xmas_tree_small: ["Fir, red pot", "Flocked, white pot", "Gold tinsel"],
  present: ["Red and gold", "Green and red", "Kraft and twine"],
  stocking: ["Red", "Green", "Knitted"],
  wreath: ["Fir and bow", "Holly", "Gold"],
  garland: ["Warm white", "Multicolour", "Candy cane"],
  mistletoe: ["Mistletoe"],
  cocoa_station: ["Red and oak", "White and pine"],
  gingerbread_house: ["Gingerbread house"],
  xmas_village: ["Christmas village"],
  nutcracker: ["Red coat", "Blue coat", "Green coat"],
  candle_arch: ["Pine", "White"],
  poinsettia: ["Red", "Cream", "Pink"],
  advent_calendar: ["Wooden", "Red and gold", "Little house"],
  wrapping_table: ["Gift-wrapping table"],
  candy_cane: ["Red and white", "Light-up", "Green and white"],
  reindeer: ["Warm white", "Ice blue", "Gold"],
  sleigh: ["Red and gold", "White and silver", "Green and gold"],
  inflatable_snowman: ["Inflatable snowman"],
  snow_globe: ["Giant snow globe"],
} as const;

const FACE = 0.1; // a wall's face
const CEILING = 3.27;
const X = {
  red: 0xb3262b,
  redDark: 0x7d1a1e,
  green: 0x2f6a3d,
  fir: 0x2c5a35,
  firDark: 0x1f4429,
  firLight: 0x3f7a45,
  frost: 0x86a592,
  gold: 0xd4a540,
  silver: 0xc4cad1,
  snow: 0xf4f4f0,
  berry: 0xc0222a,
  kraft: 0xb08a5a,
  twine: 0x6b4a2a,
  ginger: 0x9a5b2e,
  icing: 0xf7f3ea,
  skin: 0xe8c4a0,
  glass: 0xcfe6ff,
};
// (plan 73 phase 6.8: what Christmas's finishes are in the life look — painted and papered, the baubles
// polished)
finishes([
  [X.red, "plain"],
  [X.redDark, "plain"],
  [X.green, "plain"],
  [X.fir, "plain"],
  [X.firDark, "plain"],
  [X.firLight, "plain"],
  [X.frost, "plain"],
  [X.gold, "metal-polished"],
  [X.silver, "metal-polished"],
  [X.snow, "matte"],
  [X.berry, "gloss"],
  [X.kraft, "matte"],
  [X.twine, "matte"],
  [X.ginger, "matte"],
  [X.icing, "matte"],
  [X.glass, "gloss"],
]);
const WARM = 0xffd28a;
const COOL = 0xdcecff;
const MULTI = [0xff4a4a, 0x4ad06a, 0x4a8cff, 0xffc24a];
const CANDY = [0xff3a3a, 0xfff4ee];

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
 *  across (dots drawn a little smaller), as one geometry — or null for none. */
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

/** A tier of a fir: a cone `r` round and `h` tall, its rim in `n` points that droop, closed under. */
function skirt(r: number, h: number, n: number, droop: number, twist: number): BufferGeometry {
  const pos: number[] = [];
  const rim: V3[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = twist + (i * Math.PI) / n;
    const out = i % 2 === 0;
    const rr = out ? r : r * 0.8;
    rim.push([Math.cos(a) * rr, out ? -droop : droop * 0.4, Math.sin(a) * rr]);
  }
  const top: V3 = [0, h, 0];
  const under: V3 = [0, h * 0.22, 0];
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i];
    const b = rim[(i + 1) % rim.length];
    pos.push(...top, ...b, ...a, ...under, ...a, ...b);
  }
  return geo(pos);
}

/** A bow lying on top of something at `at` (its knot), turned `turn`: two loops standing up and
 *  leaning out, two tails trailing down its top, the knot; `k` its size (a loop's radius). */
function topBow(m: Model, at: V3, k: number, c: number, turn: number) {
  for (const s of [-1, 1]) {
    m.add(
      ring(k, k * 0.24, 4, 12)
        .rotateX(Math.PI / 2)
        .scale(1, 0.75, 1)
        .translate(s * k * 0.95, k * 0.62, 0)
        .rotateZ(-s * 0.35),
      c,
      { at, rot: [0, turn, 0] },
    );
    m.add(
      box([k * 0.55, 0.003, k * 1.7])
        .translate(0, 0.002, k * 0.8)
        .rotateY(s * 0.45),
      shade(c, 0.9),
      {
        at,
        rot: [0, turn, 0],
      },
    );
  }
  m.add(ball(k * 0.32, 6), shade(c, 0.85), { at: [at[0], at[1] + k * 0.12, at[2]], scale: [1.2, 0.8, 1] });
}
/** A bow on a face looking +z (a wreath's, a stocking's): two loops out to the sides, two tails
 *  hanging, the knot. */
function faceBow(m: Model, at: V3, k: number, c: number) {
  for (const s of [-1, 1]) {
    m.add(
      ring(k, k * 0.26, 4, 12)
        .rotateX(-Math.PI / 2)
        .scale(1, 0.7, 1)
        .translate(s * k * 0.95, 0, 0)
        .rotateZ(s * 0.25),
      c,
      { at },
    );
    m.add(
      box([k * 0.55, k * 2.4, 0.005])
        .translate(0, -k * 1.2, 0)
        .rotateZ(s * 0.3),
      shade(c, 0.9),
      {
        at: [at[0], at[1], at[2] - 0.004],
      },
    );
  }
  m.add(ball(k * 0.36, 6), shade(c, 0.85), { at, scale: [1.1, 1, 0.7] });
}
/** A tuft of needles: a cone `len` long from (0,0,0) out along +x, drooping `droop` rad. */
const tuft = (r: number, len: number, droop: number) => cyl(r, 0.0015, len, 4).rotateZ(-Math.PI / 2 - droop);

/** A star, flat (x, y) and `d` thick, `r` to its points. */
const star = (r: number, d: number) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return extrude(pts, d, 0.003);
};

/** String lights: every bulb dim and still; lit, the bulbs in sets (by colour, and every other
 *  one), each set blinking on its own clock — out of step, they twinkle. One live part a set. */
function lights(m: Model, bulbs: { at: V3; c: number }[], on: boolean, r = 0.016) {
  for (const b of bulbs) m.add(ball(r, 5), shade(b.c, on ? 0.5 : 0.35), { at: b.at });
  if (!on) return;
  const sets = new Map<string, { c: number; at: V3[] }>();
  bulbs.forEach((b, i) => {
    const k = `${b.c}|${i % 2}`;
    const s = sets.get(k) ?? { c: b.c, at: [] };
    s.at.push(b.at);
    sets.set(k, s);
  });
  [...sets.values()].forEach((s, k) => {
    m.live(
      merged(s.at.map((a) => ball(r * 1.15, 5).translate(...a))),
      s.c,
      { kind: "blink", period: 1.3 + k * 0.41, on: 0.78, phase: (k * 0.37) % 1 },
      { glow: true },
    );
  });
}

// ── the tree (2×2) and the tabletop one ─────────────────────────────────────────────────────────

/** A fir of tiers round (cx, cz) from y0, `height` tall to its tip, `r` round at its foot: the
 *  look's needles (fir, flocked, tinsel), baubles by its seed, lights spiralling up (twinkling when
 *  on), a star on top. */
function fir(m: Model, o: Look, cx: number, cz: number, y0: number, height: number, r: number, small: boolean) {
  const on = o.on !== false;
  const tiers = small ? 4 : 7;
  const step = (height * 0.78) / tiers;
  const th = height * 0.3;
  const needle = [
    [X.fir, X.firDark, X.firLight],
    [X.frost, shade(X.frost, 0.84), shade(X.frost, 1.12)],
    [X.silver, shade(X.silver, 0.82), 0xe4e8ec],
  ][o.look] ?? [X.fir, X.firDark, X.firLight];
  const tinsel = o.look === 2;
  const pts = tinsel ? 18 : 13;
  const sc = small ? 0.2 : 1;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const rr = r * (1 - t * 0.82);
    const y = y0 + k * step;
    const tw = k * 0.41;
    // (each tier two layers, the under one darker and turned half a point: depth between the tips)
    m.add(skirt(rr, th, pts, rr * 0.08, tw), needle[0], { at: [cx, y, cz] });
    m.add(skirt(rr * 0.9, th * 0.96, pts, rr * 0.1, tw + Math.PI / pts), needle[1], { at: [cx, y - th * 0.06, cz] });
    // its tips drawn out in tufts of needles, drooping; snow lying on them when flocked
    for (let i = 0; i < pts; i++) {
      const a = tw + (i * 2 * Math.PI) / pts;
      const tip: V3 = [cx + Math.cos(a) * rr * 0.97, y - rr * 0.08, cz + Math.sin(a) * rr * 0.97];
      m.add(tuft(0.035 * sc + rr * 0.04, rr * 0.22, 0.35).rotateY(-a), needle[(i + k) % 3 === 0 ? 2 : 0], {
        at: [tip[0] - Math.cos(a) * rr * 0.12, tip[1] + rr * 0.03, tip[2] - Math.sin(a) * rr * 0.12],
      });
      if (o.look === 1 && i % 2 === 0)
        m.add(ball(0.04 * sc + rr * 0.05, 6), X.snow, {
          at: [tip[0] - Math.cos(a) * rr * 0.16, tip[1] + rr * 0.1, tip[2] - Math.sin(a) * rr * 0.16],
          scale: [1.3, 0.5, 1.3],
          rot: [0, -a, 0],
        });
    }
  }
  const tip = y0 + (tiers - 1) * step + th;
  // (on the tiers' faces: at a height, the widest tier there)
  const surface = (y: number) => {
    let w = 0;
    for (let k = 0; k < tiers; k++) {
      const u = (y - (y0 + k * step)) / th;
      if (u >= 0 && u <= 1) w = Math.max(w, r * (1 - (k / (tiers - 1)) * 0.82) * (1 - u));
    }
    return w;
  };
  // a bead garland round it, draped from tier to tier
  const beads: V3[] = [];
  const turns = small ? 2 : 3.2;
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const y = y0 + step * 0.5 + t * (tip - y0 - step * 1.4) - Math.sin(t * turns * 2 * Math.PI * 3) * step * 0.12;
    const a = t * turns * Math.PI * 2 + 1.1;
    const rr = surface(y) * 1.0 + 0.004;
    beads.push([cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr]);
  }
  m.add(tube(beads, small ? 0.003 : 0.008, 3, 100), [X.gold, X.silver, 0xe0609a][o.look] ?? X.gold);
  // the baubles, hung at the tiers' rims
  const balls = [
    [X.red, X.gold, X.silver],
    [X.silver, 0x4a78b8, X.snow],
    [0xe0609a, 0x3fb8b0, X.gold],
  ][o.look] ?? [X.red, X.gold, X.silver];
  for (let k = 0; k < tiers - 1; k++) {
    const n = small ? 3 : 4 - Math.floor(k / 3);
    for (let i = 0; i < n; i++) {
      const a = k * 1.3 + (i / n) * Math.PI * 2 + rnd(k, i, o.seed) * 0.6;
      const br = small ? 0.018 : 0.058;
      const y = y0 + k * step + th * 0.18;
      const at: V3 = [cx + Math.cos(a) * (surface(y) + br * 0.3), y - br, cz + Math.sin(a) * (surface(y) + br * 0.3)];
      m.add(ball(br, 7), balls[(k + i) % 3], { at });
      // (its cap)
      m.add(cyl(br * 0.3, br * 0.3, br * 0.25, 6), X.gold, { at: [at[0], at[1] + br * 0.9, at[2]] });
    }
  }
  // the lights, round and up it
  const lit = [MULTI, [COOL], [WARM]][o.look] ?? MULTI;
  const N = small ? 16 : 54;
  const bulbs: { at: V3; c: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const y = y0 + step * 0.35 + t * (tip - y0 - step * 1.1);
    const rr = surface(y) * 0.98;
    const a = t * (small ? 3 : 5.5) * Math.PI * 2;
    bulbs.push({ at: [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr], c: lit[i % lit.length] });
  }
  lights(m, bulbs, on, small ? 0.007 : 0.017);
  // the star, on its spike
  const st = small ? 0.035 : 0.12;
  m.add(cyl(st * 0.12, st * 0.04, st * 0.6, 5), X.gold, { at: [cx, tip - st * 0.1, cz] });
  m.add(star(st, small ? 0.012 : 0.035), on ? 0xffd86a : X.gold, { at: [cx, tip + st * 0.8, cz], glow: on });
}

/** The tree (2×2): on its skirt, in its stand, its tiers to 2.4 m. */
export function xmasTree(m: Model, o: Look) {
  m.add(cyl(0.66, 0.66, 0.015, 22), [X.red, X.snow, 0x5a2a6e][o.look] ?? X.red, { at: [1, 0, 1] });
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.18, 0],
        [0.21, 0.24],
        [0.001, 0.24],
      ],
      14,
    ),
    o.look === 2 ? X.silver : X.redDark,
    { at: [1, 0.015, 1] },
  );
  m.add(ring(0.205, 0.012, 5, 18), X.gold, { at: [1, 0.2, 1] });
  m.add(cyl(0.05, 0.04, 0.24, 8), P.walnutDark, { at: [1, 0.24, 1] });
  fir(m, o, 1, 1, 0.36, 1.88, 0.85, false);
}

/** The tabletop tree, in its pot (red, white, brass). */
export function xmasTreeSmall(m: Model, o: Look) {
  const pot = [0xa82a2a, P.white, P.brass][o.look] ?? 0xa82a2a;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.055, 0],
        [0.07, 0.085],
        [0.076, 0.09],
        [0.001, 0.09],
      ],
      14,
    ),
    pot,
    { at: [0.5, 0, 0.5] },
  );
  m.add(cyl(0.012, 0.012, 0.04, 6), P.walnutDark, { at: [0.5, 0.09, 0.5] });
  fir(m, o, 0.5, 0.5, 0.12, 0.36, 0.16, true);
}

// ── presents ────────────────────────────────────────────────────────────────────────────────────

/** One present: wrapped `w`×`h`×`d`, its ribbon both ways round, a bow on top. */
function present(
  m: Model,
  at: V3,
  size: V3,
  turn: number,
  paper: number,
  ribbon: number,
  twine: boolean,
  tag = false,
  bow = true,
) {
  const [w, h, d] = size;
  const [x, y, z] = at;
  const rot: V3 = [0, turn, 0];
  m.add(box([w, h, d], 0.006, 2), paper, { at: [x, y + h / 2, z], rot });
  // (the paper's pattern: stripes on some, dots on others)
  const band = twine ? 0.006 : 0.03;
  m.add(box([w + 0.004, h + 0.004, band]), ribbon, { at: [x, y + h / 2, z], rot });
  m.add(box([band, h + 0.004, d + 0.004]), ribbon, { at: [x, y + h / 2, z], rot });
  const top = y + h + 0.003;
  if (twine) {
    // (twine knotted where it crosses, a sprig of fir and berries in the knot)
    for (const s of [-1, 1])
      m.add(ring(0.018, 0.003, 3, 10).rotateX(Math.PI / 2), X.twine, {
        at: [x, top + 0.012, z],
        rot: [0, turn + s * 0.6, 0],
      });
    for (let i = 0; i < 5; i++)
      m.add(leaf(0.07, 0.016, 0.25, 0.05, 3), i % 2 ? X.fir : X.firLight, {
        at: [x, top + 0.004, z],
        rot: [0, turn + i * 1.26, 0],
      });
    for (let i = 0; i < 3; i++)
      m.add(ball(0.009, 5), X.berry, { at: [x + (i - 1) * 0.01, top + 0.01, z + (i % 2) * 0.01] });
  } else if (bow) topBow(m, [x, top, z], Math.min(w, d) * 0.15, ribbon, turn);
  if (tag) {
    // a name tag, tied on
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    m.add(box([0.06, 0.003, 0.04], 0.002), P.paperWhite, {
      at: [x + c * (w * 0.3) + sn * (d * 0.25), top + 0.002, z - sn * (w * 0.3) + c * (d * 0.25)],
      rot: [0, turn + 0.4, 0],
    });
  }
}

/** A few presents together (1×1), in the look's papers, set down as its seed has them. */
export function presents(m: Model, o: Look) {
  const papers = [
    [X.red, X.gold, X.redDark],
    [X.green, X.red, X.snow],
    [X.kraft, shade(X.kraft, 0.9), X.kraft],
  ][o.look] ?? [X.red, X.gold, X.redDark];
  const ribbons = [
    [X.gold, X.red, X.gold],
    [X.red, X.gold, X.red],
    [X.twine, X.twine, X.twine],
  ][o.look] ?? [X.gold, X.red, X.gold];
  const twine = o.look === 2;
  const s = o.seed;
  const stacked = rnd(3, 0, s) > 0.5;
  present(
    m,
    [0.38, 0, 0.42],
    [0.4, 0.28, 0.34],
    (rnd(1, 0, s) - 0.5) * 0.5,
    papers[0],
    ribbons[0],
    twine,
    true,
    !stacked,
  );
  present(m, [0.68, 0, 0.62], [0.26, 0.2, 0.24], 0.6 + rnd(2, 0, s) * 0.6, papers[1], ribbons[1], twine);
  // (a small one on the big one, or in front of them)
  if (stacked) present(m, [0.36, 0.284, 0.42], [0.18, 0.14, 0.16], rnd(4, 0, s) * 1.5, papers[2], ribbons[2], twine);
  else present(m, [0.42, 0, 0.78], [0.2, 0.15, 0.18], rnd(4, 0, s) * 1.5, papers[2], ribbons[2], twine);
}

// ── on the walls: a stocking, the wreath, the garland, the advent calendar ──────────────────────

/** A stocking (red, green or knitted) on its hook, its cuff with a name on it (props.text). */
export function stocking(m: Model, o: Look, name: string, full = false) {
  // (the life look: knitted)
  m.only("boucle");
  const body = [X.red, X.green, X.icing][o.look] ?? X.red;
  const cuff = o.look === 2 ? X.red : X.snow;
  const sock: [number, number][] = [
    [-0.09, 0],
    [0.09, 0],
    [0.09, -0.34],
    [0.13, -0.37],
    [0.18, -0.42],
    [0.18, -0.47],
    [0.13, -0.51],
    [-0.02, -0.51],
    [-0.08, -0.48],
    [-0.11, -0.43],
    [-0.09, -0.36],
  ];
  const top = 1.19;
  // (full on Christmas Day: it swells, and what's in it shows over the cuff)
  m.add(extrude(sock, 0.07, 0.018, 2), body, { at: [0.5, top, FACE + 0.036], scale: [1, 1, full ? 1.45 : 1] });
  if (full) {
    const cane: V3[] = [];
    for (let i = 0; i <= 6; i++) cane.push([0.46, top + 0.02 + i * 0.022, FACE + 0.06]);
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * Math.PI;
      cane.push([0.46 + 0.025 - Math.cos(a) * 0.025, top + 0.152 + Math.sin(a) * 0.025, FACE + 0.06]);
    }
    for (let i = 0; i < cane.length - 1; i++) m.add(tube([cane[i], cane[i + 1]], 0.008, 6, 1), i % 2 ? X.red : X.snow);
    m.add(box([0.07, 0.06, 0.05], 0.004), X.gold, { at: [0.53, top + 0.1, FACE + 0.065], rot: [0, 0, -0.2] });
    m.add(box([0.075, 0.012, 0.052]), X.red, { at: [0.53, top + 0.1, FACE + 0.065], rot: [0, 0, -0.2] });
    m.add(ball(0.03, 7), 0xe8892a, { at: [0.57, top + 0.08, FACE + 0.07] });
  }
  if (o.look === 2)
    // (the knit's bands)
    for (const y of [-0.16, -0.24, -0.32]) m.add(box([0.2, 0.025, 0.004]), X.red, { at: [0.5, top + y, FACE + 0.073] });
  // (its heel and toe in the cuff's colour; the knitted one's in red)
  m.add(ball(0.06, 7), cuff, { at: [0.5 + 0.13, top - 0.455, FACE + 0.052], scale: [1, 0.85, 0.42] });
  m.add(ball(0.05, 7), cuff, { at: [0.5 - 0.075, top - 0.45, FACE + 0.052], scale: [1, 0.9, 0.42] });
  m.add(cushion([0.23, 0.1, 0.085], 0.35), cuff, { at: [0.5, top + 0.04, FACE + 0.043] });
  // the fur's edge, in tufts
  for (let i = 0; i < 9; i++) m.add(ball(0.016, 5), cuff, { at: [0.5 - 0.11 + i * 0.0275, top - 0.008, FACE + 0.07] });
  m.add(ball(0.016, 6), X.gold, { at: [0.5 + 0.1, top - 0.03, FACE + 0.09] });
  // the hook and its loop
  m.add(box([0.03, 0.03, 0.03], 0.004), P.brass, { at: [0.5, 1.3, FACE + 0.015] });
  m.add(ring(0.018, 0.004, 4, 10).rotateX(-Math.PI / 2), cuff, { at: [0.5, 1.27, FACE + 0.035] });
  // the name, stitched across the cuff
  if (name) {
    const p = Math.min(0.012, 0.2 / (name.length * 6));
    const g = dotText(name, 0.5 - (name.length * 6 * p - p) / 2, top + 0.04 + 3.5 * p, FACE + 0.091, p);
    if (g) m.add(g, o.look === 1 ? X.green : o.look === 2 ? X.snow : X.red);
  }
}

/** A wreath: needles round a ring (fir, holly or gilt), berries or cones, a bow below. */
export function wreath(m: Model, o: Look) {
  const [cx, cy, z] = [0.5, 1.6, FACE + 0.05];
  const base = [X.firDark, 0x1d3a26, 0x9c7a32][o.look] ?? X.firDark;
  m.add(ring(0.235, 0.085, 6, 30).rotateX(-Math.PI / 2), base, { at: [cx, cy, z] });
  const leafC = [
    [X.fir, X.firLight, X.firDark],
    [0x1f4a2c, 0x2c5e38, 0x173a22],
    [X.gold, 0xe9cf7a, 0xb8902f],
  ][o.look] ?? [X.fir, X.firLight, X.firDark];
  // needles (or holly leaves) in three rings, every one swept the same way round
  for (const [rr, n, dz] of [
    [0.16, 26, 0.03],
    [0.235, 34, 0.07],
    [0.31, 38, 0.035],
  ] as const) {
    for (let i = 0; i < (o.look === 1 ? Math.round(n * 0.6) : n); i++) {
      const nn = o.look === 1 ? Math.round(n * 0.6) : n;
      const a = (i / nn) * Math.PI * 2 + rr * 3;
      const g = o.look === 1 ? leaf(0.1, 0.055, 0.25, 0.04, 4, 2) : leaf(0.12, 0.026, 0.4, 0.04, 3);
      g.rotateX(Math.PI / 2).rotateZ(a + Math.PI / 2 + 0.6 + (rr - 0.235) * 3);
      m.add(g, leafC[(i + Math.round(rr * 10)) % 3], { at: [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z + dz] });
    }
  }
  if (o.look === 0)
    // pine cones and berries, here and there
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.6;
      const at: V3 = [cx + Math.cos(a) * 0.25, cy + Math.sin(a) * 0.25, z + 0.1];
      m.add(
        lathe(
          [
            [0.001, 0],
            [0.022, 0.012],
            [0.026, 0.035],
            [0.016, 0.06],
            [0.001, 0.07],
          ],
          7,
        ),
        0x6b4428,
        { at, rot: [Math.PI / 2, 0, a + 1.2] },
      );
      for (let k = 0; k < 3; k++)
        m.add(ball(0.016, 6), X.berry, {
          at: [at[0] + Math.cos(a + k * 2) * 0.04, at[1] + Math.sin(a + k * 2) * 0.04, at[2] + 0.01],
        });
    }
  if (o.look === 1)
    // berries in threes
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      for (let k = 0; k < 3; k++)
        m.add(ball(0.017, 6), X.berry, {
          at: [cx + Math.cos(a) * 0.24 + (k - 1) * 0.018, cy + Math.sin(a) * 0.24 + (k % 2) * 0.016, z + 0.1],
        });
    }
  if (o.look === 2)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      m.add(ball(i % 2 ? 0.026 : 0.019, 7), i % 2 ? X.snow : 0xf1d8a0, {
        at: [cx + Math.cos(a) * 0.25, cy + Math.sin(a) * 0.25, z + 0.1],
      });
    }
  // the bow, below
  faceBow(m, [cx, cy - 0.27, z + 0.1], 0.055, o.look === 2 ? X.gold : X.red);
}

/** A garland (3 wide) swagged from three hooks over heads, its lights in the look's colours. */
export function garland(m: Model, o: Look) {
  const on = o.on !== false;
  const z = FACE + 0.07;
  const swag = (x0: number, x1: number): V3[] =>
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return [x0 + (x1 - x0) * t, 2.24 - 0.26 * Math.sin(t * Math.PI), z];
    });
  const halves = [swag(0.12, 1.5), swag(1.5, 2.88)];
  const path = (t: number, h: V3[]): V3 => {
    const f = t * (h.length - 1);
    const i = Math.min(h.length - 2, Math.floor(f));
    const k = f - i;
    return [h[i][0] + (h[i + 1][0] - h[i][0]) * k, h[i][1] + (h[i + 1][1] - h[i][1]) * k, z];
  };
  const bulbs: { at: V3; c: number }[] = [];
  const cols = [[WARM], MULTI, CANDY][o.look] ?? [WARM];
  for (const h of halves) {
    m.add(tube(h, 0.055, 6, 16), X.firDark, {});
    // (its needles in tufts, every way out from it)
    for (let i = 0; i < 44; i++) {
      const p = path((i + 0.5) / 44, h);
      const a = i * 2.399;
      const b = 0.9 + (i % 3) * 0.35;
      m.add(cyl(0.05, 0.003, 0.15, 5), [X.fir, X.firLight, X.firDark][i % 3], {
        at: [p[0], p[1], p[2] + 0.01],
        rot: [Math.cos(a) * b, 0, Math.sin(a) * b],
      });
    }
    for (let i = 0; i < 14; i++) {
      const p = path((i + 0.5) / 14, h);
      bulbs.push({ at: [p[0], p[1] - 0.03 - (i % 2) * 0.03, p[2] + 0.075], c: cols[(bulbs.length + i) % cols.length] });
    }
    if (o.look === 2)
      // (a red and white ribbon wound round it)
      for (let i = 0; i < 12; i++) {
        const p = path((i + 0.5) / 12, h);
        m.add(box([0.06, 0.15, 0.012]), i % 2 ? X.red : X.snow, { at: [p[0], p[1], p[2] + 0.06], rot: [0, 0, 0.7] });
      }
  }
  lights(m, bulbs, on, 0.021);
  // the hooks, a bow at each
  for (const x of [0.12, 1.5, 2.88]) {
    m.add(box([0.03, 0.03, 0.03], 0.004), P.brass, { at: [x, 2.26, FACE + 0.015] });
    for (const s of [-1, 1])
      m.add(ring(0.04, 0.011, 4, 12).rotateX(-Math.PI / 2), o.look === 0 ? X.gold : X.red, {
        at: [x + s * 0.04, 2.27, z + 0.04],
        rot: [0, 0, s * 0.4],
      });
  }
}

/** The advent calendar: 24 little doors, numbered, those up to today open (December's own date;
 *  every door shut before it), today's with its treat. Wooden, red and gold, or a little house. */
export function adventCalendar(m: Model, o: Look, today: number) {
  const [x0, x1, y0, y1] = [0.1, 0.9, 1.16, 1.78];
  const board = [P.oak, X.redDark, 0x9fb7c6][o.look] ?? P.oak;
  const door = [P.cream, X.red, P.cream][o.look] ?? P.cream;
  const edge = [P.walnut, X.gold, X.snow][o.look] ?? P.walnut;
  const ink = [P.ink, X.gold, X.redDark][o.look] ?? P.ink;
  m.add(box([x1 - x0, y1 - y0, 0.03], 0.006), board, { at: [(x0 + x1) / 2, (y0 + y1) / 2, FACE + 0.015] });
  if (o.look === 2) {
    // (a gable over it, snow on its roof)
    m.add(
      extrude(
        [
          [-0.44, 0],
          [0.44, 0],
          [0, 0.16],
        ],
        0.03,
      ),
      board,
      { at: [0.5, y1, FACE + 0.015] },
    );
    m.add(box([0.5, 0.025, 0.05], 0.006), X.snow, { at: [0.29, y1 + 0.085, FACE + 0.03], rot: [0, 0, 0.35] });
    m.add(box([0.5, 0.025, 0.05], 0.006), X.snow, { at: [0.71, y1 + 0.085, FACE + 0.03], rot: [0, 0, -0.35] });
  } else
    for (const [w, h, x, y] of [
      [x1 - x0 + 0.03, 0.02, 0.5, y1],
      [x1 - x0 + 0.03, 0.02, 0.5, y0],
      [0.02, y1 - y0, x0, (y0 + y1) / 2],
      [0.02, y1 - y0, x1, (y0 + y1) / 2],
    ])
      m.add(box([w, h, 0.04], 0.004), edge, { at: [x, y, FACE + 0.02] });
  // the doors: six across, four down, the days scattered
  const ORDER = [7, 15, 3, 22, 11, 18, 1, 24, 13, 5, 20, 9, 16, 2, 23, 10, 6, 19, 14, 21, 4, 12, 17, 8];
  const F = FACE + 0.03;
  for (let i = 0; i < 24; i++) {
    const day = ORDER[i];
    const cx = x0 + 0.075 + (i % 6) * 0.13;
    const cy = y1 - 0.09 - Math.floor(i / 6) * 0.14;
    const s = 0.1;
    if (day <= today) {
      // open: its hollow, the door swung out on its left hinge, today's treat in it
      m.add(box([s, s, 0.004]), 0x2a1d16, { at: [cx, cy, F + 0.002] });
      m.add(box([s, s, 0.006]), door, {
        at: [cx - s / 2 + Math.cos(1.9) * (s / 2), cy, F + 0.004 + Math.sin(1.9) * (s / 2)],
        rot: [0, -1.9, 0],
      });
      if (day === today) m.add(star(0.03, 0.01), X.gold, { at: [cx, cy, F + 0.012] });
    } else {
      m.add(box([s, s, 0.006]), door, { at: [cx, cy, F + 0.003] });
      const txt = String(day);
      const p = 0.0058;
      const g = dotText(txt, cx - (txt.length * 6 * p - p) / 2, cy + 3.5 * p, F + 0.0065, p);
      if (g) m.add(g, ink);
    }
  }
}

/** Today's day for the advent calendar: in December its date (to 24; all open after), else none. */
export function adventDay(now = new Date()): number {
  return now.getMonth() === 11 ? Math.min(25, now.getDate()) : 0;
}

// ── hung from the ceiling ───────────────────────────────────────────────────────────────────────

/** Mistletoe: a red ribbon down from the ceiling to a sprig — its leaves in pairs, white berries. */
export function mistletoe(m: Model) {
  m.add(cyl(0.03, 0.03, 0.02, 10), P.white, { at: [0.5, CEILING - 0.02, 0.5] });
  m.add(box([0.018, CEILING - 0.02 - 2.5, 0.003]), X.red, { at: [0.5, (CEILING - 0.02 + 2.5) / 2, 0.5] });
  for (const s of [-1, 1])
    m.add(ring(0.035, 0.009, 4, 10).rotateX(-Math.PI / 2), X.red, {
      at: [0.5 + s * 0.035, 2.5, 0.5],
      rot: [0, 0, s * 0.4],
    });
  m.add(ball(0.014, 6), X.red, { at: [0.5, 2.5, 0.5] });
  // the sprig: forked twigs, their leaves in pairs every way, round white berries among them
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399;
    const tilt = 0.2 + (i % 4) * 0.38;
    const g = leaf(0.13, 0.045, 0.15, -0.04, 4);
    g.rotateX(tilt).rotateY(a);
    m.add(g, [0x7a9a4a, 0x5f7f3a, 0x8aa85a][i % 3], { at: [0.5, 2.43 - (i % 3) * 0.025, 0.5] });
  }
  for (let i = 0; i < 18; i++) {
    const a = i * 1.7;
    const r = 0.03 + (i % 3) * 0.025;
    m.add(ball(0.016, 6), 0xf3f1e4, { at: [0.5 + Math.cos(a) * r, 2.4 - (i % 4) * 0.025, 0.5 + Math.sin(a) * r] });
  }
}

// ── on the floor indoors ────────────────────────────────────────────────────────────────────────

/** The hot cocoa station (2×1): a cabinet, its top at 0.9, an urn with its tap, mugs, marshmallows
 *  and candy canes in jars, a chalk board saying so. */
export function cocoaStation(m: Model, o: Look) {
  const body = o.look === 1 ? P.white : X.red;
  const top = o.look === 1 ? 0xd8b98a : P.oak;
  m.add(box([1.9, 0.82, 0.76], 0.01), body, { at: [1, 0.45, 0.5] });
  m.add(box([1.86, 0.06, 0.72], 0.004), shade(body, 0.7), { at: [1, 0.03, 0.5] });
  for (const x of [0.52, 1.48]) m.add(box([0.86, 0.66, 0.01], 0.006), shade(body, 0.9), { at: [x, 0.47, 0.885] });
  for (const x of [0.92, 1.08]) m.add(box([0.012, 0.12, 0.02], 0.003), P.brass, { at: [x, 0.62, 0.9] });
  m.add(box([1.96, 0.04, 0.82], 0.006), top, { at: [1, 0.88, 0.5] });
  // candy-cane corners
  for (const x of [0.06, 1.94])
    for (let i = 0; i < 8; i++)
      m.add(cyl(0.025, 0.025, 0.1, 8), i % 2 ? X.red : X.snow, { at: [x, 0.06 + i * 0.1, 0.89], rot: [0, 0, 0] });
  // a string of lights swagged along its front edge
  const bulbs: { at: V3; c: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const t = (i + 0.5) / 24;
    const sag = Math.abs(Math.sin(t * Math.PI * 4)) * 0.06;
    bulbs.push({ at: [0.08 + t * 1.84, 0.84 - sag, 0.92], c: MULTI[i % 4] });
  }
  m.add(
    tube(
      bulbs.map((b) => [b.at[0], b.at[1] + 0.012, b.at[2] - 0.005]),
      0.004,
      3,
      60,
    ),
    P.ink,
  );
  lights(m, bulbs, o.on !== false, 0.014);
  // the urn
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.11, 0],
        [0.13, 0.04],
        [0.14, 0.36],
        [0.12, 0.42],
        [0.05, 0.45],
        [0.001, 0.47],
      ],
      16,
    ),
    P.chrome,
    { at: [0.42, 0.9, 0.45] },
  );
  m.add(rod(0.012, 0.012, 0.08, "z"), P.ink, { at: [0.42, 0.98, 0.62] });
  m.add(ball(0.025, 8), P.ink, { at: [0.42, 1.37, 0.45] });
  m.add(cyl(0.141, 0.141, 0.05, 16), X.red, { at: [0.42, 1.12, 0.45] });
  for (const s of [-1, 1])
    m.add(ring(0.04, 0.008, 4, 10), P.ink, { at: [0.42 + s * 0.15, 1.22, 0.45], rot: [0, 0, Math.PI / 2] });
  // a plate of cookies
  m.add(cyl(0.1, 0.09, 0.012, 14), X.snow, { at: [1.05, 0.9, 0.72] });
  for (let i = 0; i < 6; i++)
    m.add(cyl(0.028, 0.028, 0.008, 8), X.ginger, {
      at: [1.05 + Math.cos(i) * 0.05, 0.912 + (i % 2) * 0.006, 0.72 + Math.sin(i) * 0.05],
    });
  m.add(box([0.03, 0.04, 0.03]), P.ink, { at: [0.42, 0.96, 0.66] });
  // mugs, stacked two high
  for (let i = 0; i < 4; i++) {
    const x = 0.78 + (i % 2) * 0.1;
    const y = 0.9 + Math.floor(i / 2) * 0.1;
    m.add(cyl(0.04, 0.035, 0.095, 10), i % 3 === 1 ? X.snow : X.red, { at: [x, y, 0.62] });
    m.add(ring(0.025, 0.006, 4, 8).rotateX(-Math.PI / 2), i % 3 === 1 ? X.snow : X.red, {
      at: [x + 0.045, y + 0.05, 0.62],
      rot: [0, Math.PI / 2, 0],
    });
  }
  // the jars
  for (const [x, fill] of [
    [1.18, X.icing],
    [1.42, X.red],
  ] as const) {
    m.add(cyl(0.07, 0.07, 0.2, 12), 0xd9e4e6, { at: [x, 0.9, 0.5] });
    m.add(cyl(0.074, 0.074, 0.03, 12), P.walnut, { at: [x, 1.1, 0.5] });
    for (let i = 0; i < 5; i++)
      m.add(box([0.03, 0.03, 0.03]), fill, { at: [x - 0.03 + (i % 3) * 0.03, 0.93 + Math.floor(i / 3) * 0.035, 0.5] });
  }
  for (let i = 0; i < 4; i++) {
    const x = 1.62 + (i % 2) * 0.04;
    const z = 0.48 + Math.floor(i / 2) * 0.04;
    m.add(cyl(0.008, 0.008, 0.22, 6), i % 2 ? X.snow : X.red, { at: [x, 0.9, z] });
    m.add(ring(0.025, 0.008, 4, 8).rotateX(-Math.PI / 2), i % 2 ? X.red : X.snow, { at: [x + 0.025, 1.12, z] });
  }
  // the chalk board, on an easel at the back
  m.add(box([0.36, 0.24, 0.02], 0.004), P.walnut, { at: [1.75, 1.08, 0.24], rot: [-0.15, 0, 0] });
  m.add(box([0.32, 0.2, 0.004]), 0x23302a, { at: [1.75, 1.08, 0.252], rot: [-0.15, 0, 0] });
  const g = dotText("COCOA", 1.75 - (5 * 6 * 0.009 - 0.009) / 2, 0.031, 0, 0.009);
  if (g) m.add(g.rotateX(-0.15).translate(0, 1.08, 0.256), P.paperWhite);
}

/** The gift-wrapping table (2×1): its top at 0.9, a rack of paper rolls along the back, a sheet laid
 *  out with a present half wrapped on it, scissors and tape, spools of ribbon. */
export function wrappingTable(m: Model) {
  m.add(box([1.9, 0.04, 0.8], 0.006), P.oak, { at: [1, 0.88, 0.5] });
  for (const [x, z] of [
    [0.1, 0.15],
    [1.9, 0.15],
    [0.1, 0.85],
    [1.9, 0.85],
  ])
    m.add(box([0.05, 0.86, 0.05], 0.006), P.oakLight, { at: [x, 0.43, z] });
  m.add(box([1.8, 0.03, 0.66], 0.004), P.oakLight, { at: [1, 0.2, 0.5] });
  // boxes waiting under it
  for (let i = 0; i < 3; i++)
    m.add(box([0.3, 0.16, 0.28], 0.004), P.cream, { at: [0.35 + i * 0.36, 0.295, 0.5], rot: [0, i * 0.2, 0] });
  // the rack: two uprights, the rolls on their rods
  for (const x of [0.08, 1.92]) m.add(box([0.04, 0.58, 0.04], 0.004), P.oakLight, { at: [x, 1.19, 0.14] });
  [X.red, X.green, X.gold].forEach((c, i) => {
    const y = 1.0 + i * 0.16;
    m.add(rod(0.008, 0.008, 1.84, "x"), P.steel, { at: [1, y, 0.14] });
    m.add(rod(0.045, 0.045, 1.5, "x"), c, { at: [1, y, 0.14] });
    for (let k = 0; k < 6; k++)
      m.add(rod(0.0465, 0.0465, 0.03, "x"), i === 2 ? X.red : X.snow, { at: [0.35 + k * 0.26, y, 0.14] });
  });
  // the sheet, the present on it, its ribbon cut
  m.add(box([0.7, 0.003, 0.5]), X.green, { at: [0.75, 0.902, 0.55], rot: [0, 0.1, 0] });
  m.add(box([0.3, 0.18, 0.24], 0.004), P.cream, { at: [0.75, 0.99, 0.55], rot: [0, 0.1, 0] });
  m.add(box([0.3, 0.12, 0.004]), X.green, { at: [0.75, 0.96, 0.67], rot: [-0.9, 0.1, 0] });
  m.add(box([0.6, 0.003, 0.025]), X.gold, { at: [1.3, 0.902, 0.62], rot: [0, -0.3, 0] });
  // scissors and the tape
  for (const s of [-1, 1])
    m.add(box([0.16, 0.006, 0.014]), P.steelLight, { at: [1.3, 0.905, 0.42], rot: [0, s * 0.18, 0] });
  for (const s of [-1, 1]) m.add(ring(0.018, 0.005, 4, 8), X.red, { at: [1.21, 0.906, 0.42 + s * 0.014] });
  m.add(box([0.12, 0.06, 0.05], 0.008), P.plastic, { at: [1.55, 0.93, 0.4] });
  m.add(cyl(0.025, 0.025, 0.02, 10).rotateX(Math.PI / 2), 0xd9e4e6, { at: [1.55, 0.95, 0.4] });
  // ribbon spools
  [X.red, X.gold, X.silver, X.green].forEach((c, i) => {
    m.add(cyl(0.035, 0.035, 0.03, 10), c, { at: [1.72 + (i % 2) * 0.09, 0.9, 0.62 + Math.floor(i / 2) * 0.09] });
  });
}

/** A nutcracker (1.2 m) on his plinth: boots, white breeches, the look's coat, his staff, a beard,
 *  a tall black hat with its plume. */
export function nutcracker(m: Model, o: Look) {
  const coat = [X.red, 0x2c4a8a, 0x2d5e3a][o.look] ?? X.red;
  const [cx, cz] = [0.5, 0.5];
  m.add(box([0.34, 0.08, 0.34], 0.01), X.gold, { at: [cx, 0.04, cz] });
  for (const s of [-1, 1]) {
    m.add(cyl(0.045, 0.05, 0.22, 10), P.ink, { at: [cx + s * 0.06, 0.08, cz] });
    m.add(cyl(0.05, 0.045, 0.18, 10), X.snow, { at: [cx + s * 0.06, 0.3, cz] });
  }
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.13, 0],
        [0.12, 0.12],
        [0.11, 0.3],
        [0.12, 0.34],
        [0.06, 0.37],
        [0.001, 0.37],
      ],
      12,
    ),
    coat,
    { at: [cx, 0.46, cz] },
  );
  m.add(cyl(0.122, 0.122, 0.04, 12), P.ink, { at: [cx, 0.56, cz] });
  m.add(box([0.05, 0.04, 0.01]), X.gold, { at: [cx, 0.58, cz + 0.122] });
  for (let i = 0; i < 4; i++) m.add(ball(0.012, 5), X.gold, { at: [cx, 0.64 + i * 0.045, cz + 0.112] });
  for (const s of [-1, 1]) {
    m.add(ball(0.04, 6), X.gold, { at: [cx + s * 0.13, 0.79, cz], scale: [1, 0.5, 1] });
    m.add(cyl(0.035, 0.03, 0.28, 8), coat, { at: [cx + s * 0.15, 0.5, cz + 0.02] });
    m.add(ball(0.03, 6), X.snow, { at: [cx + s * 0.15, 0.49, cz + 0.03] });
  }
  // his staff, in the right hand
  m.add(cyl(0.012, 0.012, 0.8, 6), X.gold, { at: [cx + 0.15, 0.12, cz + 0.05] });
  m.add(ball(0.025, 6), X.gold, { at: [cx + 0.15, 0.93, cz + 0.05] });
  // the head: his jaw and teeth, a beard, eyes, red cheeks
  m.add(cyl(0.075, 0.08, 0.17, 12), X.skin, { at: [cx, 0.82, cz] });
  m.add(box([0.1, 0.03, 0.02]), X.snow, { at: [cx, 0.87, cz + 0.075] });
  m.add(cushion([0.16, 0.07, 0.06], 0.3), X.snow, { at: [cx, 0.83, cz + 0.06] });
  for (const s of [-1, 1]) {
    m.add(ball(0.009, 5), P.ink, { at: [cx + s * 0.03, 0.93, cz + 0.074] });
    m.add(ball(0.014, 5), 0xd9706a, { at: [cx + s * 0.05, 0.9, cz + 0.068], scale: [1, 0.6, 0.4] });
  }
  m.add(cyl(0.01, 0.006, 0.04, 5).rotateX(Math.PI / 2), X.skin, { at: [cx, 0.91, cz + 0.095] });
  // white hair down his back and sides, a moustache
  m.add(box([0.17, 0.16, 0.05], 0.02), X.snow, { at: [cx, 0.9, cz - 0.06] });
  for (const s of [-1, 1])
    m.add(ball(0.035, 6), X.snow, { at: [cx + s * 0.075, 0.95, cz - 0.01], scale: [0.7, 1.2, 1] });
  m.add(box([0.09, 0.022, 0.025], 0.008), X.snow, { at: [cx, 0.895, cz + 0.08] });
  // the hat
  m.add(cyl(0.09, 0.085, 0.24, 12), P.ink, { at: [cx, 0.99, cz] });
  m.add(cyl(0.091, 0.091, 0.03, 12), X.gold, { at: [cx, 1.02, cz] });
  m.add(ball(0.02, 6), X.gold, { at: [cx, 1.12, cz + 0.085] });
  m.add(cyl(0.035, 0.005, 0.07, 6), X.red, { at: [cx, 1.23, cz] });
}

/** A poinsettia (1×1) in its pot wrapped in foil: dark leaves under, the bracts over (red, cream or
 *  pink), the little yellow flowers in their middles. */
export function poinsettia(m: Model, o: Look) {
  const bract = [X.berry, 0xf0e8d0, 0xe78aa8][o.look] ?? X.berry;
  const foil = [X.gold, X.silver, 0xe7a9bd][o.look] ?? X.gold;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.1, 0],
        [0.125, 0.16],
        [0.145, 0.2],
        [0.115, 0.18],
        [0.001, 0.18],
      ],
      12,
    ),
    foil,
    { at: [0.5, 0, 0.5] },
  );
  m.add(cyl(0.115, 0.115, 0.01, 12), P.soil, { at: [0.5, 0.17, 0.5] });
  // the leaves, out round under the bracts
  for (let i = 0; i < 10; i++) {
    const g = leaf(0.22, 0.1, 0.2, 0.12, 5);
    g.rotateX(-0.1).rotateY(i * 0.63 + 0.3);
    m.add(g, i % 2 ? P.leaf : 0x2f5a2e, { at: [0.5, 0.22, 0.5] });
  }
  // the bracts in three rings, the outer ones spread, the inner ones up
  const rings: [number, number, number, number][] = [
    [7, 0.2, 0.09, -0.12],
    [6, 0.16, 0.075, -0.35],
    [5, 0.1, 0.05, -0.65],
  ];
  rings.forEach(([n, len, wid, tilt], r) => {
    for (let i = 0; i < n; i++) {
      const g = leaf(len, wid, 0.18, 0.05, 5);
      g.rotateX(tilt).rotateY((i / n) * Math.PI * 2 + r * 0.5);
      m.add(g, (i + r) % 2 ? bract : shade(bract, 0.86), { at: [0.5, 0.27 + r * 0.02, 0.5] });
    }
  });
  for (let i = 0; i < 6; i++)
    m.add(ball(0.009, 5), 0xd8c23a, { at: [0.5 + Math.cos(i) * 0.02, 0.33, 0.5 + Math.sin(i) * 0.02] });
}

// ── on a surface ────────────────────────────────────────────────────────────────────────────────

/** A gingerbread house on its iced board: the walls, a roof under icing, sweets along it, a door,
 *  iced windows, a candy cane by the door. */
export function gingerbreadHouse(m: Model) {
  m.add(box([0.32, 0.012, 0.26], 0.004), X.icing, { at: [0.5, 0.006, 0.5] });
  m.add(box([0.2, 0.12, 0.15], 0.004), X.ginger, { at: [0.5, 0.072, 0.5] });
  for (const s of [-1, 1])
    m.add(
      extrude(
        [
          [-0.075, 0],
          [0.075, 0],
          [0, 0.08],
        ],
        0.012,
      ),
      X.ginger,
      { at: [0.5 + s * 0.094, 0.132, 0.5], rot: [0, Math.PI / 2, 0] },
    );
  for (const s of [-1, 1]) {
    m.add(box([0.24, 0.012, 0.115], 0.003), X.ginger, { at: [0.5, 0.17, 0.5 + s * 0.045], rot: [s * 0.82, 0, 0] });
    m.add(box([0.25, 0.008, 0.11], 0.003), X.icing, { at: [0.5, 0.176, 0.5 + s * 0.049], rot: [s * 0.82, 0, 0] });
  }
  for (let i = 0; i < 6; i++)
    m.add(ball(0.009, 5), [X.red, 0x4ad06a, 0xffc24a][i % 3], { at: [0.39 + i * 0.044, 0.215, 0.5] });
  // icing dripping off the eaves, piped up the corners
  for (const s of [-1, 1])
    for (let i = 0; i < 9; i++)
      m.add(ball(0.006, 4), X.icing, {
        at: [0.385 + i * 0.029, 0.125 - (i % 2) * 0.006, 0.5 + s * 0.098],
        scale: [1, 1.6, 1],
      });
  for (const [x, zz] of [
    [0.4, 0.575],
    [0.6, 0.575],
    [0.4, 0.425],
    [0.6, 0.425],
  ])
    m.add(cyl(0.005, 0.005, 0.12, 5), X.icing, { at: [x, 0.012, zz] });
  m.add(ring(0.01, 0.003, 3, 10).rotateX(-Math.PI / 2), X.green, { at: [0.5, 0.07, 0.58] });
  m.add(box([0.04, 0.07, 0.004]), shade(X.ginger, 0.6), { at: [0.5, 0.047, 0.577] });
  for (const s of [-1, 1]) {
    m.add(box([0.034, 0.034, 0.004]), 0xffd28a, { at: [0.5 + s * 0.06, 0.09, 0.577], glow: true });
    m.add(box([0.042, 0.006, 0.006]), X.icing, { at: [0.5 + s * 0.06, 0.109, 0.578] });
  }
  for (let i = 0; i < 8; i++) m.add(ball(0.008, 5), [X.red, X.snow][i % 2], { at: [0.4 + i * 0.028, 0.018, 0.6] });
  m.add(cyl(0.004, 0.004, 0.06, 5), X.red, { at: [0.45, 0.012, 0.6] });
}

/** A Christmas village on its snow: three little houses and a church, their windows lit, firs, and a
 *  train going round on its ring of track (live: it turns while the village is on). */
export function xmasVillage(m: Model, o: Look) {
  const on = o.on !== false;
  m.add(cushion([0.6, 0.03, 0.5], 0.15), X.snow, { at: [0.5, 0.015, 0.5] });
  m.add(ring(0.21, 0.004, 4, 32), P.steel, { at: [0.5, 0.033, 0.5] });
  const house = (x: number, z: number, w: number, h: number, c: number, roof: number, turn: number) => {
    m.add(box([w, h, w * 0.8]), c, { at: [x, 0.03 + h / 2, z], rot: [0, turn, 0] });
    m.add(
      extrude(
        [
          [-w * 0.62, 0],
          [w * 0.62, 0],
          [0, w * 0.5],
        ],
        w * 0.86,
      ),
      roof,
      { at: [x, 0.03 + h, z], rot: [0, turn + Math.PI / 2, 0] },
    );
    for (const s of [-1, 1])
      m.add(box([w * 0.2, h * 0.25, 0.003]), on ? 0xffd28a : 0x3a3530, {
        at: [
          x + Math.cos(turn) * s * w * 0.22 + Math.sin(turn) * w * 0.41,
          0.03 + h * 0.55,
          z - Math.sin(turn) * s * w * 0.22 + Math.cos(turn) * w * 0.41,
        ],
        rot: [0, turn, 0],
        glow: on,
      });
  };
  house(0.42, 0.44, 0.08, 0.07, X.redDark, X.snow, 0.2);
  house(0.58, 0.45, 0.07, 0.06, P.cream, X.snow, -0.3);
  house(0.5, 0.58, 0.075, 0.065, 0x6f8aa0, X.snow, 0);
  // a frozen pond, lamps either side of it
  m.add(cyl(0.06, 0.06, 0.004, 16), 0xbfd8e6, { at: [0.5, 0.03, 0.5] });
  for (const x of [0.43, 0.57]) {
    m.add(cyl(0.002, 0.002, 0.05, 4), P.ink, { at: [x, 0.03, 0.52] });
    m.add(ball(0.006, 5), on ? 0xffd28a : 0xd8d0c0, { at: [x, 0.083, 0.52], glow: on });
  }
  // the church, its steeple
  m.add(box([0.06, 0.12, 0.06]), P.stone, { at: [0.5, 0.09, 0.36] });
  m.add(cyl(0.045, 0.001, 0.08, 4), X.snow, { at: [0.5, 0.15, 0.36], rot: [0, Math.PI / 4, 0] });
  m.add(box([0.02, 0.03, 0.003]), on ? 0xffd28a : 0x3a3530, { at: [0.5, 0.1, 0.391], glow: on });
  for (const [x, z, h] of [
    [0.25, 0.32, 0.1],
    [0.76, 0.34, 0.12],
    [0.74, 0.68, 0.09],
    [0.27, 0.66, 0.11],
    [0.38, 0.7, 0.07],
  ]) {
    m.add(cyl(h * 0.3, 0.001, h, 7), X.fir, { at: [x, 0.03, z] });
    m.add(cyl(h * 0.18, 0.001, h * 0.4, 7), X.snow, { at: [x, 0.03 + h * 0.62, z] });
  }
  // the train: an engine and two cars on the ring, round its middle
  const train: BufferGeometry[] = [];
  const car = (a: number, len: number, hgt: number) =>
    box([0.04, hgt, len], 0.003)
      .rotateY(-a)
      .translate(Math.cos(a) * 0.21, 0.036 + hgt / 2, Math.sin(a) * 0.21);
  train.push(car(0, 0.07, 0.04), car(-0.42, 0.06, 0.035), car(-0.78, 0.06, 0.035));
  train.push(cyl(0.008, 0.008, 0.03, 6).translate(0.21, 0.076, 0.02));
  const t = merged(train);
  if (on) m.live(t, X.redDark, { kind: "spin", axis: "y", speed: -0.6 }, { at: [0.5, 0, 0.5] });
  else m.add(t, X.redDark, { at: [0.5, 0, 0.5] });
}

/** A candle arch: a stepped arch of seven candles (pine or white), their bulbs lit when on. */
export function candleArch(m: Model, o: Look) {
  const on = o.on !== false;
  const wood = o.look === 1 ? P.white : 0xc8955a;
  const carve = o.look === 1 ? 0xd9d4ca : 0x8a5a32;
  const z = 0.5;
  // the frame: a step under each candle, the two feet, the sill; open between
  const tops: V3[] = [];
  for (let i = 0; i < 7; i++) {
    const x = -0.18 + i * 0.06;
    const h = 0.1 + (3 - Math.abs(i - 3)) * 0.035;
    // (a step a candle, deep enough to reach the next one down: one stepped band)
    m.add(box([0.066, 0.06, 0.05], 0.004), wood, { at: [0.5 + x, h - 0.03, z] });
    tops.push([0.5 + x, h, z]);
  }
  for (const s of [-1, 1]) m.add(box([0.03, 0.12, 0.05], 0.004), wood, { at: [0.5 + s * 0.205, 0.06, z] });
  m.add(box([0.44, 0.03, 0.06], 0.005), wood, { at: [0.5, 0.015, z] });
  // inside it, a little scene cut from the same wood: firs either side of a cottage
  for (const s of [-1, 1])
    m.add(
      extrude(
        [
          [-0.03, 0],
          [0.03, 0],
          [0, 0.08],
        ],
        0.012,
      ),
      carve,
      { at: [0.5 + s * 0.11, 0.03, z] },
    );
  m.add(
    extrude(
      [
        [-0.035, 0],
        [0.035, 0],
        [0.035, 0.045],
        [0, 0.075],
        [-0.035, 0.045],
      ],
      0.012,
    ),
    carve,
    { at: [0.5, 0.03, z] },
  );
  m.add(box([0.016, 0.016, 0.004]), on ? 0xffd28a : 0x3a2a1a, { at: [0.5, 0.055, z + 0.008], glow: on });
  // the candles, their bulbs
  for (const [x, y, zz] of tops) {
    m.add(cyl(0.007, 0.007, 0.004, 8), X.gold, { at: [x, y, zz] });
    m.add(cyl(0.0075, 0.0075, 0.04, 8), X.snow, { at: [x, y + 0.004, zz] });
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.008, 0.008],
          [0.006, 0.018],
          [0.001, 0.026],
        ],
        6,
      ),
      on ? 0xffd28a : 0xe8e0c8,
      { at: [x, y + 0.044, zz], glow: on },
    );
  }
}

// ── out of doors ────────────────────────────────────────────────────────────────────────────────

/** A big candy cane (1×1) in a drift of snow: banded red and white, green and white, or lit. */
export function candyCane(m: Model, o: Look) {
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.2, 0],
        [0.15, 0.04],
        [0.08, 0.075],
        [0.001, 0.09],
      ],
      12,
    ),
    X.snow,
    { at: [0.5, 0, 0.5] },
  );
  const [stripe, core] = [
    [X.red, X.snow],
    [0xd8303a, 0xfff4ee],
    [X.green, X.snow],
  ][o.look] ?? [X.red, X.snow];
  const lit = o.look === 1;
  // its line: up, then round the hook
  const path: V3[] = [];
  for (let i = 0; i <= 24; i++) path.push([0.5, 0.04 + (i / 24) * 0.85, 0.5]);
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    path.push([0.5 + 0.13 - Math.cos(a) * 0.13, 0.89 + Math.sin(a) * 0.13, 0.5]);
  }
  // (lit: the red glows through; the white stays white, or the whole cane is a smear of light)
  m.add(tube(path, 0.035, 10, 60), core);
  // the stripes wound round it: each a ribbon on its skin, turning as it goes
  for (const k of [0, Math.PI]) {
    const spiral: V3[] = [];
    for (let i = 0; i < path.length - 1; i++)
      for (let j = 0; j < 4; j++) {
        const f = j / 4;
        const a: V3 = path[i];
        const b: V3 = path[i + 1];
        const p: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.5];
        const tx = b[0] - a[0];
        const ty = b[1] - a[1];
        const tl = Math.hypot(tx, ty) || 1;
        // (round the line: its normal in the cane's plane, and out of it along z)
        const nx = -ty / tl;
        const ny = tx / tl;
        const th = k + (i + f) * 0.55;
        spiral.push([p[0] + nx * Math.cos(th) * 0.031, p[1] + ny * Math.cos(th) * 0.031, p[2] + Math.sin(th) * 0.031]);
      }
    m.add(tube(spiral, 0.014, 4, 200), stripe, { glow: lit });
  }
}

/** A light-up reindeer (2×1): a wire body traced in bulbs (warm, ice blue or gold), on its stakes;
 *  its head and antlers nod (live) while it's on. */
export function reindeer(m: Model, o: Look) {
  const on = o.on !== false;
  const c = [0xfff0d0, X.glass, 0xffcf6a][o.look] ?? 0xfff0d0;
  const wire = on ? c : 0x7a7a7a;
  const z = 0.5;
  const r = 0.015;
  const body: V3[][] = [
    // back and rump, belly
    [
      [1.45, 0.95, z],
      [1.1, 1.0, z],
      [0.7, 0.98, z],
      [0.45, 0.9, z],
      [0.38, 0.75, z],
    ],
    [
      [0.38, 0.75, z],
      [0.6, 0.62, z],
      [1.0, 0.6, z],
      [1.35, 0.66, z],
      [1.45, 0.8, z],
      [1.45, 0.95, z],
    ],
    // the tail
    [
      [0.4, 0.86, z],
      [0.3, 0.92, z],
      [0.28, 0.88, z],
    ],
  ];
  // the legs, a little bent at the knee
  for (const [x, k] of [
    [0.5, -1],
    [0.66, 1],
    [1.28, -1],
    [1.42, 1],
  ])
    body.push([
      [x, 0.68, z + k * 0.04],
      [x + 0.02, 0.36, z + k * 0.06],
      [x, 0.02, z + k * 0.08],
    ]);
  for (const p of body) {
    m.add(tube(p, r, 5, 10), wire, { glow: on });
    // (a bulb every hand's width along it)
    for (let i = 0; i < p.length - 1; i++)
      for (let f = 0; f < 1; f += 0.5)
        m.add(ball(r * 1.9, 5), wire, {
          at: [
            p[i][0] + (p[i + 1][0] - p[i][0]) * f,
            p[i][1] + (p[i + 1][1] - p[i][1]) * f,
            p[i][2] + (p[i + 1][2] - p[i][2]) * f,
          ],
          glow: on,
        });
  }
  // a red bow at the neck, a bell under it
  faceBow(m, [1.43, 0.9, z + 0.03], 0.035, X.red);
  m.add(ball(0.022, 7), X.gold, { at: [1.43, 0.84, z + 0.04] });
  // the head: neck, the head's loop, its antlers — round the shoulder
  const head: BufferGeometry[] = [
    tube(
      [
        [0, 0, 0],
        [0.1, 0.25, 0],
        [0.18, 0.45, 0],
      ],
      r,
      5,
      8,
    ),
    tube(
      [
        [0.18, 0.45, 0],
        [0.3, 0.5, 0],
        [0.42, 0.42, 0],
        [0.38, 0.36, 0],
        [0.22, 0.38, 0],
        [0.14, 0.42, 0],
      ],
      r,
      5,
      10,
    ),
  ];
  for (const s of [-1, 1])
    head.push(
      tube(
        [
          [0.2, 0.5, s * 0.03],
          [0.18, 0.66, s * 0.08],
          [0.1, 0.78, s * 0.12],
          [0.02, 0.84, s * 0.14],
        ],
        r * 0.8,
        4,
        8,
      ),
      tube(
        [
          [0.18, 0.66, s * 0.08],
          [0.28, 0.76, s * 0.1],
          [0.3, 0.84, s * 0.1],
        ],
        r * 0.8,
        4,
        6,
      ),
    );
  head.push(ball(0.028, 6).translate(0.43, 0.41, 0));
  const g = merged(head);
  if (on) m.live(g, c, { kind: "nod", amp: 0.12, period: 3.6, phase: o.seed }, { at: [1.45, 0.95, z], glow: true });
  else m.add(g, wire, { at: [1.45, 0.95, z] });
  // the stakes it stands on
  for (const x of [0.5, 0.66, 1.28, 1.42]) m.add(cyl(0.008, 0.004, 0.05, 4), P.steel, { at: [x, 0, z + 0.08] });
}

/** A sleigh (3×1): its body sweeping up to a curled front, a padded seat, runners curling, presents
 *  piled in front. */
export function sleigh(m: Model, o: Look) {
  const body = [X.red, P.white, X.green][o.look] ?? X.red;
  const trim = o.look === 1 ? X.silver : X.gold;
  const out: [number, number][] = [
    [0.3, 0.25],
    [2.35, 0.25],
    [2.62, 0.4],
    [2.74, 0.68],
    [2.66, 0.9],
    [2.52, 0.86],
    [2.48, 0.62],
    [1.4, 0.6],
    [1.32, 0.76],
    [0.6, 0.76],
    [0.5, 1.08],
    [0.34, 1.14],
    [0.24, 0.92],
  ];
  m.add(extrude(out, 0.6, 0.02, 2), body, { at: [0, 0, 0.5] });
  // the trim along both sides' top
  for (const s of [-1, 1])
    m.add(
      tube(
        [
          [0.26, 0.92, 0.5 + s * 0.305],
          [0.36, 1.13, 0.5 + s * 0.305],
          [0.6, 0.76, 0.5 + s * 0.305],
          [1.35, 0.74, 0.5 + s * 0.305],
          [1.42, 0.6, 0.5 + s * 0.305],
          [2.46, 0.62, 0.5 + s * 0.305],
          [2.6, 0.88, 0.5 + s * 0.305],
          [2.72, 0.7, 0.5 + s * 0.305],
        ],
        0.014,
        5,
        30,
      ),
      trim,
    );
  m.add(cushion([0.72, 0.1, 0.56], 0.3), shade(body, 0.6), { at: [0.96, 0.8, 0.5] });
  // a plaid blanket over the seat's back, its fold hanging
  const plaid = o.look === 2 ? X.red : X.green;
  m.add(cushion([0.05, 0.36, 0.58], 0.2), plaid, { at: [0.57, 0.95, 0.5], rot: [0, 0, 0.35] });
  for (const k of [-0.1, 0, 0.1])
    m.add(box([0.056, 0.012, 0.58]), X.gold, { at: [0.57 - k * 0.34, 0.95 + k, 0.5], rot: [0, 0, 0.35] });
  for (const k of [-0.18, 0, 0.18])
    m.add(box([0.056, 0.34, 0.012]), shade(plaid, 0.7), { at: [0.57, 0.95, 0.5 + k], rot: [0, 0, 0.35] });
  // the scrolls, curling at the back's top and the front's
  for (const [x0, y0, sz] of [
    [0.38, 1.05, 0.08],
    [2.66, 0.82, 0.07],
  ])
    for (const sd of [-1, 1]) {
      const pts: V3[] = [];
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * Math.PI * 3;
        const rr = sz * (1 - i / 22);
        pts.push([x0 + Math.cos(a) * rr, y0 + Math.sin(a) * rr, 0.5 + sd * 0.31]);
      }
      m.add(tube(pts, 0.012, 4, 30), trim);
    }
  // a lantern hung at the front
  // (on a post up from the front, an arm out, the lantern hung from it)
  const [lx, ly] = [2.66, 1.06];
  m.add(cyl(0.01, 0.01, 0.3, 6), trim, { at: [2.56, 0.88, 0.5] });
  m.add(box([0.12, 0.014, 0.014]), trim, { at: [2.61, 1.17, 0.5] });
  m.add(cyl(0.004, 0.004, 0.04, 4), P.ink, { at: [lx, ly + 0.07, 0.5] });
  m.add(cyl(0.012, 0.042, 0.03, 6), P.ink, { at: [lx, ly + 0.045, 0.5] });
  m.add(box([0.058, 0.08, 0.058]), 0xffd28a, { at: [lx, ly, 0.5], glow: true });
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    m.add(box([0.008, 0.09, 0.008]), P.ink, { at: [lx + dx * 0.031, ly, 0.5 + dz * 0.031] });
  m.add(cyl(0.04, 0.035, 0.012, 6), P.ink, { at: [lx, ly - 0.052, 0.5] });
  m.add(cushion([0.12, 0.3, 0.56], 0.2), shade(body, 0.6), { at: [0.5, 0.96, 0.5], rot: [0, 0, 0.35] });
  // the runners, on their struts
  for (const s of [-1, 1]) {
    const z = 0.5 + s * 0.38;
    m.add(
      tube(
        [
          [0.15, 0.12, z],
          [0.3, 0.03, z],
          [1.5, 0.03, z],
          [2.6, 0.03, z],
          [2.9, 0.22, z],
          [2.88, 0.46, z],
          [2.72, 0.5, z],
          [2.7, 0.38, z],
        ],
        0.022,
        6,
        34,
      ),
      trim,
    );
    for (const x of [0.5, 1.2, 1.9, 2.4])
      m.add(cyl(0.014, 0.014, 0.24, 6), trim, { at: [x, 0.03, z], rot: [-s * 0.4, 0, 0] });
  }
  // presents piled in front
  present(m, [1.75, 0.6, 0.45], [0.36, 0.3, 0.32], 0.2, X.gold, X.red, false);
  present(m, [2.15, 0.6, 0.55], [0.28, 0.22, 0.26], -0.3, X.green, X.gold, false);
  present(m, [1.85, 0.9, 0.48], [0.2, 0.16, 0.18], 0.5, X.snow, X.red, false);
}

/** An inflatable snowman (2 m): three swells of white, a black hat, a red scarf, coal buttons, a
 *  carrot nose, stick arms; its blower at its foot. */
export function inflatableSnowman(m: Model) {
  const [cx, cz] = [0.5, 0.5];
  m.add(box([0.26, 0.1, 0.22], 0.01), 0x2b2b30, { at: [cx, 0.05, cz + 0.22] });
  m.add(ball(0.38, 16), X.snow, { at: [cx, 0.46, cz], scale: [1, 1.08, 1] });
  m.add(ball(0.29, 14), X.snow, { at: [cx, 1.06, cz] });
  m.add(ball(0.22, 14), X.snow, { at: [cx, 1.52, cz] });
  m.add(ring(0.2, 0.05, 6, 18), X.red, { at: [cx, 1.32, cz] });
  m.add(box([0.09, 0.3, 0.03], 0.01), X.red, { at: [cx + 0.12, 1.18, cz + 0.2], rot: [0.2, 0, 0.15] });
  m.add(cyl(0.18, 0.18, 0.02, 14), P.ink, { at: [cx, 1.68, cz] });
  m.add(cyl(0.13, 0.12, 0.24, 14), P.ink, { at: [cx, 1.69, cz] });
  m.add(cyl(0.131, 0.131, 0.04, 14), X.red, { at: [cx, 1.72, cz] });
  m.add(cyl(0.035, 0.002, 0.16, 8).rotateX(Math.PI / 2), 0xe0782a, { at: [cx, 1.52, cz + 0.28] });
  for (const s of [-1, 1]) m.add(ball(0.025, 6), P.ink, { at: [cx + s * 0.08, 1.6, cz + 0.19] });
  for (let i = 0; i < 3; i++) m.add(ball(0.03, 6), P.ink, { at: [cx, 0.95 + i * 0.13 - 0.25, cz + 0.33 - i * 0.02] });
  for (const s of [-1, 1])
    m.add(
      tube(
        [
          [cx + s * 0.26, 1.12, cz],
          [cx + s * 0.4, 1.24, cz],
          [cx + s * 0.47, 1.36, cz + 0.02],
        ],
        0.016,
        5,
        6,
      ),
      0x5a3a22,
    );
}

/** The giant snow globe (2×2): on its plinth, under the glass (live, see-through) a snowy hill with a
 *  cottage lit and firs; its flakes drifting round inside (live: three swirls out of step). */
export function snowGlobe(m: Model, o: Look) {
  const on = o.on !== false;
  const [cx, cz] = [1, 1];
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.82, 0],
        [0.8, 0.08],
        [0.7, 0.16],
        [0.68, 0.42],
        [0.62, 0.5],
        [0.001, 0.5],
      ],
      24,
    ),
    X.redDark,
    { at: [cx, 0, cz] },
  );
  m.add(ring(0.69, 0.02, 5, 28), X.gold, { at: [cx, 0.3, cz] });
  const g = dotText("NOEL", cx - (4 * 6 * 0.022 - 0.022) / 2, 0.29 + 3 * 0.022, cz + 0.705, 0.022);
  if (g) m.add(g, X.gold);
  m.add(
    lathe(
      [
        [0.001, 0.12],
        [0.3, 0.1],
        [0.55, 0.03],
        [0.62, 0],
      ],
      22,
    ),
    X.snow,
    { at: [cx, 0.5, cz] },
  );
  // the cottage, the firs, a lamp post
  m.add(box([0.26, 0.2, 0.22]), P.cream, { at: [cx + 0.05, 0.69, cz - 0.05] });
  m.add(
    extrude(
      [
        [-0.17, 0],
        [0.17, 0],
        [0, 0.14],
      ],
      0.26,
    ),
    X.redDark,
    { at: [cx + 0.05, 0.79, cz - 0.05], rot: [0, Math.PI / 2, 0] },
  );
  m.add(
    extrude(
      [
        [-0.15, 0],
        [0.15, 0],
        [0, 0.13],
      ],
      0.27,
    ),
    X.snow,
    { at: [cx + 0.05, 0.81, cz - 0.05], rot: [0, Math.PI / 2, 0] },
  );
  for (const s of [-1, 1])
    m.add(box([0.05, 0.05, 0.004]), on ? 0xffd28a : 0x3a3530, {
      at: [cx + 0.05 + s * 0.07, 0.7, cz + 0.062],
      glow: on,
    });
  for (const [x, z, h] of [
    [-0.3, 0.1, 0.36],
    [-0.2, -0.25, 0.3],
    [0.32, 0.2, 0.28],
  ]) {
    m.add(cyl(h * 0.32, 0.001, h, 8), X.fir, { at: [cx + x, 0.56, cz + z] });
    m.add(cyl(h * 0.2, 0.001, h * 0.4, 8), X.snow, { at: [cx + x, 0.56 + h * 0.6, cz + z] });
  }
  m.add(cyl(0.01, 0.01, 0.3, 5), P.ink, { at: [cx - 0.15, 0.6, cz + 0.22] });
  m.add(ball(0.03, 6), on ? 0xffd28a : 0xd8d0c0, { at: [cx - 0.15, 0.92, cz + 0.22], glow: on });
  // the glass
  m.live(ball(0.86, 28), X.glass, { kind: "still" }, { at: [cx, 1.3, cz], glass: true });
  // the flakes, in three drifts
  for (let k = 0; k < 3; k++) {
    const flakes: BufferGeometry[] = [];
    for (let i = 0; i < 36; i++) {
      const a = rnd(i, k, 1) * Math.PI * 2;
      const rr = 0.12 + rnd(i, k, 2) * 0.45;
      const y = -0.15 + rnd(i, k, 3) * 0.75;
      flakes.push(
        box([0.025, 0.025, 0.006])
          .rotateY(a)
          .translate(Math.cos(a) * rr, y, Math.sin(a) * rr),
      );
    }
    m.live(
      merged(flakes),
      X.snow,
      { kind: "swirl", speed: [0.22, -0.16, 0.3][k], bob: 0.06, period: 5 + k * 1.7, phase: k * 0.3 },
      { at: [cx, 1.3, cz], glow: true },
    );
  }
}
