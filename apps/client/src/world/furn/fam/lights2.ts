import { type BufferGeometry, CylinderGeometry, Float32BufferAttribute, BufferGeometry as Geo } from "three";
import { ball, box, cyl, extrude, type Look, lathe, type Model, merged, ring, rod, tube, type V3 } from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 11 (docs/plan/68-more-furniture.md): Lights — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/lights2.ts. Every one a lamp (catalog `interact:
// "lamp"`): switched off (`o.on === false`) its bulbs, shades and flames go dark and its live parts
// stop. A wall piece on the wall's face at z 0.1, a ceiling one up to 3.27, a thing on a surface in a
// 1×1 frame round (0.5, 0.5) from the top it stands on.

export const LOOKS: Record<string, readonly string[]> = {
  fairy_lights: ["Warm fairy lights", "Coloured globes", "Photo clips"],
  chandelier: ["Brass candle arms", "Crystal tiers", "Iron wagon wheel"],
  paper_lanterns: ["White rice paper", "Pastels", "Red festival"],
  edison_cluster: ["Black cords", "Brass & braided", "Cage bulbs"],
  bankers_lamp: ["Emerald", "Cobalt", "Oxblood"],
  salt_lamp: ["Pink rock", "White salt", "Basket of chunks"],
  candles: ["Ivory pillars", "Brass candlesticks", "Jar candles"],
  uplighter: ["Brass torchiere", "Black & opal glass", "Alabaster bowl"],
  track_lights: ["Black", "White", "Brass"],
  festoon_lights: ["Timber posts", "Black steel poles", "Birch logs"],
};

const FACE = 0.1; // a wall's face
const CEILING = 3.27;
const AMBER = 0xffb45a;
const DIM = 0xe8e0c8; // an unlit bulb
const IRON = 0x232326;
const COPPER = 0xb87a4b;

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
/** Its faces turned the other way round (seen from inside: a shade's lining). */
function flip(g: BufferGeometry): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  const p = n.attributes.position;
  const out: number[] = [];
  for (let i = 0; i < p.count; i += 3) for (const k of [0, 2, 1]) out.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
  return geo(out);
}
/** A cord, a chain or a rod straight down from (x, y1, z) to y0. */
const drop = (m: Model, x: number, z: number, y0: number, y1: number, c: number, r = 0.003) =>
  m.add(cyl(r, r, y1 - y0, 5), c, { at: [x, y0, z] });
/** A ceiling rose: the cup the cords come out of. */
const rose = (m: Model, x: number, z: number, r: number, c: number) =>
  m.add(cyl(r, r * 0.85, 0.035, 14), c, { at: [x, CEILING - 0.035, z] });

/** Bulbs that twinkle: every bulb dim and still; lit, the bulbs in `n` sets (by colour and turn),
 *  each set blinking on its own clock, out of step. One live part a set. */
function twinkle(m: Model, bulbs: { at: V3; c: number }[], on: boolean, r: number, n = 3, steady = 0.82) {
  // (n 0: lit steady, in the model's glow)
  if (on && n === 0) {
    for (const b of bulbs) m.add(ball(r, 7), b.c, { at: b.at, glow: true });
    return;
  }
  // (lit, every bulb glows softly and its set brightens over it in turn; out, they're grey glass)
  for (const b of bulbs) m.add(ball(r, 6), on ? shade(b.c, 0.72) : shade(b.c, 0.42), { at: b.at, glow: on });
  if (!on) return;
  const sets = new Map<string, { c: number; at: V3[] }>();
  bulbs.forEach((b, i) => {
    const k = `${b.c}|${i % n}`;
    const s = sets.get(k) ?? { c: b.c, at: [] };
    s.at.push(b.at);
    sets.set(k, s);
  });
  [...sets.values()].forEach((s, k) => {
    m.live(
      merged(s.at.map((a) => ball(r * 1.3, 6).translate(...a))),
      s.c,
      { kind: "blink", period: 1.7 + k * 0.53, on: steady, phase: (k * 0.29) % 1 },
      { glow: true },
    );
  });
}

// ── string / fairy lights (3×1, on a wall) ──────────────────────────────────────────────────────────
/** Fairy lights swagged along a wall from three cup hooks: warm rice bulbs on copper wire, coloured
 *  globes on a white flex, or warm ones with photos pegged along them (by its seed); they twinkle. */
function fairyLights(m: Model, o: Look) {
  const on = o.on !== false;
  const z = FACE + 0.035;
  const hooks = [0.16, 1.5, 2.84];
  const top = 2.16;
  const sag = o.look === 1 ? 0.2 : 0.24;
  const swag = (x0: number, x1: number, n: number): V3[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return [x0 + (x1 - x0) * t, top - sag * Math.sin(t * Math.PI), z];
    });
  const wire = o.look === 1 ? P.white : COPPER;
  const bulbs: { at: V3; c: number }[] = [];
  const PASTEL = [0xffb3a0, 0xfff0a0, 0xa8e6b8, 0xa8c8ff, 0xffc0e0];
  for (let h = 0; h < 2; h++) {
    const pts = swag(hooks[h], hooks[h + 1], 12);
    m.add(tube(pts, o.look === 1 ? 0.0035 : 0.0016, 4, 24), wire);
    const n = o.look === 1 ? 9 : 22;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = hooks[h] + (hooks[h + 1] - hooks[h]) * t;
      const y = top - sag * Math.sin(t * Math.PI);
      if (o.look === 1) {
        // a globe on its socket, hanging under the flex
        m.add(cyl(0.011, 0.011, 0.03, 8), P.white, { at: [x, y - 0.03, z] });
        bulbs.push({ at: [x, y - 0.055, z], c: PASTEL[(i + h * 4) % PASTEL.length] });
      } else {
        // a rice bulb on the wire, its drop of solder
        bulbs.push({ at: [x, y - 0.01, z + 0.003], c: 0xffe2a0 });
      }
    }
    if (o.look === 2)
      // photos on little wooden pegs between every few bulbs
      for (let k = 0; k < 3; k++) {
        const t = 0.22 + k * 0.28 + (rnd(k, h, o.seed) - 0.5) * 0.06;
        const x = hooks[h] + (hooks[h + 1] - hooks[h]) * t;
        const y = top - sag * Math.sin(t * Math.PI);
        const tilt = (rnd(k, h + 3, o.seed) - 0.5) * 0.2;
        m.add(box([0.012, 0.04, 0.012], 0.002), P.oakLight, { at: [x, y - 0.012, z + 0.006], rot: [0, 0, tilt] });
        const py = y - 0.03 - 0.07;
        m.add(box([0.11, 0.13, 0.003]), P.paperWhite, { at: [x, py, z + 0.004], rot: [0, 0, tilt] });
        const pic = [0x8aa8c0, 0xc79a63, 0x7a9a6a, 0xd98a7a, 0x9a8ac0][Math.floor(rnd(k, h + 7, o.seed) * 5)];
        m.add(box([0.094, 0.094, 0.002]), pic, {
          at: [x - Math.sin(tilt) * 0.012, py + 0.012, z + 0.0065],
          rot: [0, 0, tilt],
        });
        m.add(box([0.05, 0.03, 0.001]), shade(pic, 0.7), {
          at: [x - Math.sin(tilt) * 0.006, py, z + 0.008],
          rot: [0, 0, tilt],
        });
      }
  }
  // the cup hooks, the plug's lead down the wall at the end
  for (const x of hooks) {
    m.add(cyl(0.006, 0.006, 0.03, 6), P.brass, { at: [x, top + 0.008, FACE], rot: [Math.PI / 2, 0, 0] });
    m.add(ring(0.01, 0.003, 4, 10).rotateX(Math.PI / 2), P.brass, { at: [x, top + 0.004, z] });
  }
  m.add(cyl(0.0025, 0.0025, 0.5, 4), wire, { at: [hooks[2], top - 0.5, z - 0.02] });
  m.add(box([0.045, 0.07, 0.025], 0.006), on ? 0x3a3a3c : 0x2a2a2c, { at: [hooks[2], top - 0.52, FACE + 0.013] });
  m.add(box([0.008, 0.008, 0.002]), on ? P.ledGreen : 0x2a3a2c, {
    at: [hooks[2], top - 0.5, FACE + 0.027],
    glow: on,
  });
  twinkle(m, bulbs, on, o.look === 1 ? 0.022 : 0.01, o.look === 1 ? 0 : 3, 0.6);
}

// ── the chandelier (from the ceiling) ───────────────────────────────────────────────────────────────
/** Brass with eight S-curved arms and candle bulbs, tiers of crystal drops round candle bulbs, or a
 *  black iron wagon wheel on chains — its lowest point at 2.35 m, over heads. */
function chandelier(m: Model, o: Look) {
  const on = o.on !== false;
  const [cx, cz] = [0.5, 0.5];
  const candle = (x: number, y: number, z: number, cup: number, sleeve = 0xf0e8d8) => {
    m.add(cyl(0.022, 0.034, 0.014, 12), cup, { at: [x, y, z] });
    m.add(cyl(0.013, 0.013, 0.07, 8), sleeve, { at: [x, y + 0.014, z] });
    m.add(cyl(0.004, 0.004, 0.012, 5), 0x8a7a5a, { at: [x, y + 0.084, z] });
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.014, 0.012],
          [0.016, 0.026],
          [0.01, 0.045],
          [0.001, 0.06],
        ],
        8,
      ),
      on ? 0xffe2a6 : DIM,
      { at: [x, y + 0.092, z], glow: on },
    );
  };
  if (o.look === 0) {
    const B = P.brass;
    rose(m, cx, cz, 0.07, B);
    // the chain, link by link
    for (let y = 2.98; y < CEILING - 0.04; y += 0.04)
      m.add(ring(0.012, 0.003, 3, 8).rotateX(Math.PI / 2), shade(B, 0.85), {
        at: [cx, y, cz],
        rot: [0, Math.round((y - 2.98) / 0.04) % 2 ? Math.PI / 2 : 0, 0],
      });
    // the turned column: a crown, the stem, the bowl the arms come from, the finial
    m.add(
      lathe(
        [
          [0.001, 2.35],
          [0.018, 2.37],
          [0.03, 2.42],
          [0.012, 2.47],
          [0.016, 2.5],
          [0.09, 2.56],
          [0.1, 2.6],
          [0.06, 2.63],
          [0.018, 2.66],
          [0.016, 2.82],
          [0.035, 2.86],
          [0.02, 2.92],
          [0.03, 2.96],
          [0.012, 2.99],
        ],
        16,
      ),
      B,
      { at: [cx, 0, cz] },
    );
    m.add(ball(0.03, 10), shade(B, 1.1), { at: [cx, 2.74, cz], scale: [1, 1.5, 1] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const [s, c] = [Math.sin(a), Math.cos(a)];
      const p = (d: number, y: number): V3 => [cx + c * d, y, cz + s * d];
      m.add(tube([p(0.07, 2.6), p(0.13, 2.53), p(0.24, 2.52), p(0.32, 2.58), p(0.35, 2.64)], 0.008, 5, 14), B);
      // (a little scroll under each arm)
      m.add(tube([p(0.1, 2.54), p(0.12, 2.48), p(0.15, 2.47), p(0.16, 2.5)], 0.004, 4, 8), B);
      candle(...p(0.35, 2.64), B);
    }
    // a few drops of glass hung from the bowl
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      crystal(m, cx + Math.cos(a) * 0.095, 2.52, cz + Math.sin(a) * 0.095, 0.7, on);
    }
  } else if (o.look === 1) {
    const F = P.chrome;
    rose(m, cx, cz, 0.08, F);
    drop(m, cx, cz, 2.9, CEILING - 0.03, F, 0.006);
    // the frame: a crown ring and a wider one under it, joined by curved bars, a bowl at the foot
    m.add(ring(0.17, 0.006, 4, 32), F, { at: [cx, 2.88, cz] });
    m.add(ring(0.34, 0.008, 4, 40), F, { at: [cx, 2.58, cz] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = (d: number, y: number): V3 => [cx + Math.cos(a) * d, y, cz + Math.sin(a) * d];
      m.add(
        tube([p(0.04, 2.92), p(0.17, 2.88), p(0.3, 2.72), p(0.34, 2.58), p(0.2, 2.5), p(0.05, 2.47)], 0.006, 4, 16),
        F,
      );
      candle(...p(0.34, 2.585), F, 0xf4f0ea);
    }
    m.add(
      lathe(
        [
          [0.001, 2.42],
          [0.05, 2.46],
          [0.06, 2.49],
          [0.02, 2.5],
        ],
        14,
      ),
      F,
      { at: [cx, 0, cz] },
    );
    // the drops: a swag of strands from ring to ring, the hanging drops round the rim, a strand
    // down the middle
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      crystal(m, cx + Math.cos(a) * 0.34, 2.53, cz + Math.sin(a) * 0.34, 1.1, on && i % 3 !== 1);
      if (i % 2 === 0) crystal(m, cx + Math.cos(a + 0.11) * 0.17, 2.83, cz + Math.sin(a + 0.11) * 0.17, 0.9, on);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const strand: V3[] = [0, 1, 2, 3, 4].map((k) => {
        const t = k / 4;
        const d = 0.17 + (0.34 - 0.17) * t;
        return [cx + Math.cos(a) * d, 2.86 - 0.28 * t + 0.06 * Math.sin(t * Math.PI) * -1, cz + Math.sin(a) * d];
      });
      for (const p of strand.slice(1, 4)) m.add(ball(0.008, 4), on ? 0xf4f8ff : 0xe9f1fb, { at: p, glow: on });
    }
    for (let k = 0; k < 4; k++) crystal(m, cx, 2.44 - k * 0.025, cz, 0.8 - k * 0.1, on);
    // (lit, a few of the drops catch it: two sets of glints, out of step)
    if (on)
      for (let s = 0; s < 2; s++)
        m.live(
          merged(
            Array.from({ length: 7 }, (_, i) => {
              const a = ((i * 4 + s * 2) / 28) * Math.PI * 2;
              return ball(0.006, 4).translate(Math.cos(a) * 0.345, 2.5, Math.sin(a) * 0.345 + 0.003);
            }),
          ),
          0xffffff,
          { kind: "blink", period: 1.9 + s * 0.7, on: 0.3, phase: s * 0.5 },
          { glow: true, at: [cx, 0, cz] },
        );
  } else {
    const I = IRON;
    m.add(box([0.12, 0.03, 0.12], 0.006), I, { at: [cx, CEILING - 0.015, cz] });
    m.add(ring(0.025, 0.006, 4, 10).rotateX(Math.PI / 2), I, { at: [cx, CEILING - 0.055, cz] });
    // three chains down to the wheel, link by link
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      const [x1, z1] = [cx + Math.cos(a) * 0.36, cz + Math.sin(a) * 0.36];
      const n = 16;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const [x, y, z] = [cx + (x1 - cx) * t, CEILING - 0.07 - (CEILING - 0.07 - 2.58) * t, cz + (z1 - cz) * t];
        m.add(ring(0.011, 0.0028, 3, 8).rotateX(Math.PI / 2), I, {
          at: [x, y, z],
          rot: [0, i % 2 ? a : a + Math.PI / 2, 0],
        });
      }
    }
    // the wheel: its rim and hub, eight spokes, a scroll between each
    m.add(ring(0.4, 0.014, 4, 40), I, { at: [cx, 2.54, cz] });
    m.add(ring(0.37, 0.006, 4, 40), I, { at: [cx, 2.56, cz] });
    m.add(cyl(0.05, 0.05, 0.05, 12), I, { at: [cx, 2.51, cz] });
    m.add(ball(0.03, 8), I, { at: [cx, 2.48, cz] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      m.add(box([0.33, 0.012, 0.016]), I, {
        at: [cx + Math.cos(a) * 0.215, 2.54, cz + Math.sin(a) * 0.215],
        rot: [0, -a, 0],
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      candle(cx + Math.cos(a) * 0.4, 2.555, cz + Math.sin(a) * 0.4, I, 0xe9dcc0);
    }
  }
}
/** A cut glass drop hung at (x, y, z): its top cone and its longer point under. */
function crystal(m: Model, x: number, y: number, z: number, k: number, lit = false) {
  // (lit, the glass catches the candles' light: it glows, facet by facet a shade apart)
  m.add(cyl(0.012 * k, 0.001, 0.008 * k, 6), lit ? 0xfff8ec : 0xdfeaf7, { at: [x, y, z], glow: lit });
  m.add(cyl(0.001, 0.012 * k, 0.028 * k, 6), lit ? 0xd8e6ff : 0xc9d8ec, { at: [x, y - 0.028 * k, z], glow: lit });
  m.add(cyl(0.0015, 0.0015, 0.012, 3), P.chrome, { at: [x, y + 0.006 * k, z] });
}

// ── paper lanterns (a cluster, from the ceiling) ────────────────────────────────────────────────────
/** Three to five paper globes on their cords at different heights (white rice paper, pastels, or red
 *  festival lanterns with gold caps and tassels), glowing from inside when lit. */
function paperLanterns(m: Model, o: Look) {
  const on = o.on !== false;
  const red = o.look === 2;
  const PAST = [0xf6c6c0, 0xcfe8d0, 0xf6e3a6, 0xd8cdf0, 0xbfe0ea];
  const LIT_PAST = [0xe8b4a4, 0xc4e6c0, 0xeed8a0, 0xd2c4e8, 0xb4dae8];
  const set: [number, number, number, number][] = red
    ? [
        [0.5, 0.5, 2.62, 0.16],
        [0.24, 0.32, 2.42, 0.12],
        [0.76, 0.66, 2.48, 0.12],
      ]
    : [
        [0.5, 0.48, 2.55, 0.2],
        [0.24, 0.3, 2.78, 0.13],
        [0.76, 0.32, 2.42, 0.15],
        [0.3, 0.74, 2.36, 0.11],
        [0.74, 0.76, 2.7, 0.12],
      ];
  set.forEach(([x0, z0, y0, r], i) => {
    // (each hung a little higher or lower by its seed: no two clusters alike)
    const [x, z] = [x0, z0];
    const y = y0 + (rnd(i, 4, o.seed) - 0.5) * 0.1;
    const sy = red ? 0.82 : 0.94;
    const paper = red ? 0xc8322a : o.look === 1 ? PAST[i % 5] : P.paperWhite;
    const lit = red ? 0xe85a32 : o.look === 1 ? LIT_PAST[i % 5] : 0xf4dcb4;
    rose(m, x, z, 0.022, P.white);
    drop(m, x, z, y + r * sy, CEILING - 0.035, red ? 0x8a1a16 : P.white, 0.0025);
    m.add(ball(r, 14), on ? lit : paper, { at: [x, y, z], scale: [1, sy, 1], glow: on });
    if (red) {
      // its ribs round it, the gold caps, a tassel under
      for (let k = 0; k < 8; k++)
        m.add(ring(r * 1.005, 0.0025, 3, 20).rotateX(Math.PI / 2), on ? 0xd8502a : 0x8a1e18, {
          at: [x, y, z],
          rot: [0, (k / 8) * Math.PI, 0],
          scale: [1, sy, 1],
          glow: on,
        });
      for (const s of [-1, 1])
        m.add(cyl(r * 0.42, r * 0.42, 0.03, 14), P.brass, { at: [x, y + s * r * sy - (s > 0 ? 0.012 : 0.018), z] });
      m.add(cyl(0.003, 0.003, 0.05, 4), 0xd8a03a, { at: [x, y - r * sy - 0.068, z] });
      m.add(ball(0.012, 6), P.brass, { at: [x, y - r * sy - 0.07, z] });
      m.add(cyl(0.02, 0.007, 0.11, 10), 0xc8322a, { at: [x, y - r * sy - 0.18, z] });
    } else {
      // the wire ribs round it, the openings top and bottom
      for (const k of [-0.6, -0.2, 0.2, 0.6]) {
        const rr = r * Math.sqrt(1 - k * k) * 1.005;
        m.add(ring(rr, 0.0022, 3, 20), on ? shade(lit, 0.86) : shade(paper, 0.86), {
          at: [x, y + k * r * sy, z],
          glow: on,
        });
      }
      for (const s of [-1, 1]) m.add(ring(r * 0.26, 0.004, 3, 12), P.graphite, { at: [x, y + s * r * sy * 0.965, z] });
    }
  });
}

// ── an Edison bulb cluster (from the ceiling) ───────────────────────────────────────────────────────
/** A round canopy with seven cords dropping to bare filament bulbs at their own heights: on black
 *  flex, on braided cloth with brass holders, or caged in black wire. The glass apart (one still
 *  part), the filaments glowing amber in it when lit. */
function edisonCluster(m: Model, o: Look) {
  const on = o.on !== false;
  const brass = o.look === 1;
  const hold = brass ? P.brass : IRON;
  const cord = brass ? 0x9a6a3a : 0x1a1a1c;
  m.add(cyl(0.17, 0.16, 0.03, 24), hold, { at: [0.5, CEILING - 0.03, 0.5] });
  m.add(cyl(0.05, 0.05, 0.015, 12), shade(hold, 0.8), { at: [0.5, CEILING - 0.045, 0.5] });
  const spots: [number, number, number][] = [[0.5, 0.5, 2.4]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + o.seed * 2;
    spots.push([0.5 + Math.cos(a) * 0.12, 0.5 + Math.sin(a) * 0.12, 2.5 + rnd(i, 3, o.seed) * 0.3]);
  }
  const glass: BufferGeometry[] = [];
  const fil: BufferGeometry[] = [];
  spots.forEach(([x, z, yb], i) => {
    const globe = i % 3 === 1;
    const top = yb + (globe ? 0.12 : 0.13);
    drop(m, x, z, top + 0.06, CEILING - 0.045, cord, brass ? 0.0045 : 0.003);
    // the holder: a knurled cap, its collar
    m.add(cyl(0.016, 0.018, 0.055, 10), hold, { at: [x, top + 0.005, z] });
    m.add(ring(0.018, 0.003, 3, 10), shade(hold, 1.2), { at: [x, top + 0.04, z] });
    m.add(cyl(0.013, 0.013, 0.015, 10), 0xb8a888, { at: [x, top - 0.008, z] });
    const shape: [number, number][] = globe
      ? [
          [0.001, 0],
          [0.03, 0.01],
          [0.045, 0.045],
          [0.044, 0.075],
          [0.03, 0.105],
          [0.013, 0.12],
        ]
      : [
          [0.001, 0],
          [0.016, 0.006],
          [0.029, 0.028],
          [0.032, 0.055],
          [0.027, 0.085],
          [0.016, 0.11],
          [0.013, 0.13],
        ];
    glass.push(lathe(shape, 10).translate(x, yb, z));
    // the filament: a zigzag cage of glowing wire from its stem
    const fy = yb + (globe ? 0.055 : 0.05);
    const zig: V3[] = Array.from({ length: 9 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      return [x + Math.cos(a) * 0.013, fy + (k % 2 ? 0.022 : -0.012), z + Math.sin(a) * 0.013];
    });
    fil.push(tube(zig, 0.0012, 3, 24));
    // (lit, the warm haze round the filament: what reads across a room)
    if (on) m.add(ball(0.019, 6), 0xffc878, { at: [x, fy + 0.008, z], scale: [1, 1.5, 1], glow: true });
    m.add(cyl(0.0015, 0.0015, top - fy - 0.01, 3), 0x6a5a4a, { at: [x, fy + 0.01, z] });
    if (o.look === 2) {
      // a wire cage round it: rings and ribs
      const cr = (globe ? 0.05 : 0.038) + 0.008;
      for (const k of [0.3, 0.65]) m.add(ring(cr, 0.0018, 3, 16), IRON, { at: [x, yb + k * 0.12, z] });
      for (let r = 0; r < 6; r++) {
        const a = (r / 6) * Math.PI * 2;
        m.add(
          tube(
            [
              [x + Math.cos(a) * 0.01, yb - 0.012, z + Math.sin(a) * 0.01],
              [x + Math.cos(a) * cr, yb + 0.03, z + Math.sin(a) * cr],
              [x + Math.cos(a) * cr, yb + 0.09, z + Math.sin(a) * cr],
              [x + Math.cos(a) * 0.016, top, z + Math.sin(a) * 0.016],
            ],
            0.0016,
            3,
            8,
          ),
          IRON,
        );
      }
    }
  });
  if (on) m.add(merged(fil), 0xffa040, { glow: true });
  else m.add(merged(fil), 0x5a4030);
  m.live(merged(glass), on ? 0xffcf8a : 0xd9d2c2, { kind: "still" }, { glass: true });
}

// ── the banker's lamp (on a surface) ────────────────────────────────────────────────────────────────
/** A brass banker's lamp: its oval foot, the stem and the arm over to the cased glass shade — green,
 *  blue or red outside, white inside, lit under — the pull chain at its end, the switch. */
function bankersLamp(m: Model, o: Look) {
  const on = o.on !== false;
  const glassC = [0x1f6b44, 0x22407e, 0x6e1f24][o.look] ?? 0x1f6b44;
  const B = P.brass;
  const [cx, cz] = [0.5, 0.5];
  // the foot: an oval, stepped, a ring of beading
  m.add(cyl(0.1, 0.095, 0.022, 28), shade(B, 0.85), { at: [cx, 0, cz + 0.02], scale: [1.25, 1, 0.7] });
  m.add(cyl(0.088, 0.07, 0.022, 28), B, { at: [cx, 0.022, cz + 0.02], scale: [1.25, 1, 0.7] });
  m.add(ring(0.071, 0.004, 3, 28), shade(B, 1.15), { at: [cx, 0.044, cz + 0.02], scale: [1.25, 1, 0.7] });
  // the stem from the back of the foot, the harp holding the shade
  m.add(
    lathe(
      [
        [0.016, 0.044],
        [0.01, 0.06],
        [0.008, 0.26],
        [0.014, 0.275],
        [0.008, 0.29],
        [0.008, 0.33],
      ],
      10,
    ),
    B,
    { at: [cx, 0, cz - 0.02] },
  );
  m.add(
    tube(
      [
        [cx - 0.1, 0.36, cz + 0.02],
        [cx - 0.06, 0.335, cz - 0.01],
        [cx, 0.33, cz - 0.02],
        [cx + 0.06, 0.335, cz - 0.01],
        [cx + 0.1, 0.36, cz + 0.02],
      ],
      0.005,
      5,
      14,
    ),
    B,
  );
  // the shade: a half-round of cased glass along x, lying open side down, tipped toward the reader
  const L = 0.26;
  const R = 0.07;
  const at: V3 = [cx, 0.37, cz + 0.03];
  const tip = 0.18;
  const half: [number, number][] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    half.push([Math.cos(a) * R, Math.sin(a) * R * 0.8]);
  }
  for (let i = 14; i >= 0; i--) {
    const a = (i / 14) * Math.PI;
    half.push([Math.cos(a) * (R - 0.005), Math.sin(a) * (R - 0.005) * 0.8]);
  }
  m.add(extrude(half, L, 0.002), glassC, { at, rot: [0, Math.PI / 2, tip] });
  // (its lining, lit under it)
  const lining = flip(
    new CylinderGeometry(R - 0.006, R - 0.006, L - 0.012, 14, 1, true, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .scale(1, 0.8, 1),
  );
  m.add(lining, on ? 0xfff2d0 : 0xe8e2d4, { at, rot: [tip, 0, 0], glow: on });
  // the brass ends round the glass, a finial each end
  for (const s of [-1, 1]) {
    const arc: V3[] = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8) * Math.PI;
      return [0, Math.sin(a) * R * 0.8, Math.cos(a) * R];
    });
    m.add(tube(arc, 0.0045, 4, 12), B, { at: [at[0] + s * (L / 2), at[1], at[2]], rot: [tip, 0, 0] });
    m.add(ball(0.009, 6), B, { at: [at[0] + s * (L / 2 + 0.006), at[1] + 0.02, at[2] - 0.003] });
  }
  // the bulb under it
  m.add(ball(0.024, 8), on ? P.vfd : P.paperWhite, { at: [cx, 0.386, cz + 0.03], scale: [1.6, 0.8, 0.8], glow: on });
  // the pull chain, its bead
  const chain = 0.07 + o.seed * 0.03;
  m.add(cyl(0.0016, 0.0016, chain, 4), B, { at: [cx + 0.11, 0.37 - chain, cz + 0.06] });
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.007, 0.006],
        [0.004, 0.018],
        [0.001, 0.022],
      ],
      6,
    ),
    B,
    {
      at: [cx + 0.11, 0.37 - chain - 0.022, cz + 0.06],
    },
  );
  // (the cord off the back of the foot)
  m.add(
    tube(
      [
        [cx, 0.01, cz - 0.04],
        [cx + 0.02, 0.005, cz - 0.09],
        [cx + 0.07, 0.004, cz - 0.12],
      ],
      0.003,
      4,
      8,
    ),
    0x3a2a1e,
  );
}

// ── the salt lamp (on a surface) ────────────────────────────────────────────────────────────────────
/** A rough crystal of a rock, faceted unevenly, glowing from within; facet by facet its tone. */
function rock(m: Model, at: V3, r: number, sy: number, seed: number, lit: number, dull: number, on: boolean) {
  const g = ball(r, 9).toNonIndexed();
  const p = g.attributes.position;
  // (each point pushed in or out by where it is: a rock, the same every time)
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const k = 0.78 + 0.4 * rnd(Math.round(x * 900), Math.round(y * 900) + Math.round(z * 700), seed);
    const top = y > 0 ? 1 - 0.22 * (y / r) : 1;
    p.setXYZ(i, x * k * top, y * k * sy, z * k * top);
  }
  for (let i = 0; i < p.count; i += 3) {
    const tri: number[] = [];
    for (let k = 0; k < 3; k++) tri.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
    const tone = 0.82 + 0.3 * rnd(i, 5, seed);
    m.add(geo(tri), on ? lit : dull, { at, tone, glow: on });
  }
}
function saltLamp(m: Model, o: Look) {
  const on = o.on !== false;
  const white = o.look === 1;
  const lit = white ? 0xffe2c0 : 0xff9466;
  const dull = white ? 0xe6dccc : 0xd89a86;
  if (o.look === 2) {
    // a black wire basket on its foot, heaped with chunks
    m.add(cyl(0.04, 0.05, 0.02, 14), IRON, { at: [0.5, 0, 0.5] });
    m.add(cyl(0.06, 0.06, 0.008, 14), IRON, { at: [0.5, 0.02, 0.5] });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      m.add(
        tube(
          [
            [0.5 + Math.cos(a) * 0.06, 0.026, 0.5 + Math.sin(a) * 0.06],
            [0.5 + Math.cos(a) * 0.11, 0.07, 0.5 + Math.sin(a) * 0.11],
            [0.5 + Math.cos(a) * 0.13, 0.11, 0.5 + Math.sin(a) * 0.13],
          ],
          0.002,
          3,
          6,
        ),
        IRON,
      );
    }
    m.add(ring(0.13, 0.003, 3, 24), IRON, { at: [0.5, 0.11, 0.5] });
    m.add(ring(0.1, 0.002, 3, 24), IRON, { at: [0.5, 0.07, 0.5] });
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4 + o.seed;
      const d = i < 6 ? 0.07 : 0.03;
      const y = i < 6 ? 0.09 : 0.13;
      rock(
        m,
        [0.5 + Math.cos(a) * d, y, 0.5 + Math.sin(a) * d],
        0.032 + rnd(i, 1, o.seed) * 0.012,
        0.9,
        i + o.seed,
        lit,
        dull,
        on,
      );
    }
    return;
  }
  // a block of wood, the rock on it, the switch on its lead
  m.add(box([0.13, 0.04, 0.13], 0.008, 2), P.walnut, { at: [0.5, 0.02, 0.5] });
  m.add(box([0.12, 0.004, 0.12], 0.002), P.walnutEdge, { at: [0.5, 0.041, 0.5] });
  rock(m, [0.5, 0.15, 0.5], 0.085, 1.35, 3 + o.seed * 7, lit, dull, on);
  m.add(
    tube(
      [
        [0.5, 0.01, 0.43],
        [0.47, 0.004, 0.37],
        [0.4, 0.004, 0.35],
      ],
      0.0025,
      4,
      8,
    ),
    0xe9e6df,
  );
  m.add(box([0.045, 0.012, 0.025], 0.004), 0xe9e6df, { at: [0.38, 0.006, 0.35], rot: [0, 0.3, 0] });
}

// ── candles (on a surface) ──────────────────────────────────────────────────────────────────────────
/** A flame on its wick at `at` (live: flickering), when lit. */
function flame(m: Model, at: V3, k: number, phase: number) {
  // (its body and its bright heart as one part: they flicker together, one draw)
  m.live(
    merged([
      lathe(
        [
          [0.001, 0],
          [0.007 * k, 0.006 * k],
          [0.009 * k, 0.014 * k],
          [0.006 * k, 0.026 * k],
          [0.001, 0.042 * k],
        ],
        7,
      ),
      ball(0.0045 * k, 5).translate(0, 0.011 * k, 0.004 * k),
    ]),
    0xffc45a,
    { kind: "flame", phase },
    { glow: true, at },
  );
}
/** A pillar of wax `h` tall, `r` round at (x, z) from y0: its top melted down round the wick, drips
 *  down its side. */
function pillar(m: Model, x: number, z: number, y0: number, r: number, h: number, wax: number, seed: number) {
  m.add(
    lathe(
      [
        [r, 0],
        [r, h - 0.006],
        [r * 0.97, h],
        [r * 0.85, h - 0.004],
        [r * 0.3, h - 0.012],
        [0.001, h - 0.012],
      ],
      16,
    ),
    wax,
    { at: [x, y0, z] },
  );
  for (let i = 0; i < 3; i++) {
    const a = rnd(i, 1, seed) * Math.PI * 2;
    const len = 0.015 + rnd(i, 2, seed) * 0.03;
    m.add(cyl(0.003, 0.004, len, 5), shade(wax, 0.97), {
      at: [x + Math.cos(a) * r * 0.98, y0 + h - len, z + Math.sin(a) * r * 0.98],
    });
    m.add(ball(0.0045, 5), shade(wax, 0.97), {
      at: [x + Math.cos(a) * r * 0.98, y0 + h - len, z + Math.sin(a) * r * 0.98],
    });
  }
}
function candles(m: Model, o: Look) {
  const on = o.on !== false;
  const wick = (x: number, y: number, z: number) =>
    m.add(cyl(0.0012, 0.001, 0.01, 4), on ? 0x2a1a10 : 0x1a1210, { at: [x, y - 0.002, z], rot: [0, 0, 0.15] });
  if (o.look === 0) {
    // a round slate on the table, three ivory pillars of three heights
    m.add(cyl(0.15, 0.15, 0.012, 24), 0x3a3c3e, { at: [0.5, 0, 0.5] });
    m.add(ring(0.15, 0.003, 3, 24), 0x4a4c4e, { at: [0.5, 0.012, 0.5] });
    const set: [number, number, number, number][] = [
      [0.44, 0.46, 0.038, 0.18],
      [0.56, 0.44, 0.034, 0.13],
      [0.5, 0.58, 0.032, 0.085],
    ];
    set.forEach(([x, z, r, h], i) => {
      pillar(m, x, z, 0.012, r, h, 0xf1e8d4, i + o.seed * 9);
      wick(x, 0.012 + h - 0.012 + 0.004, z);
      if (on) flame(m, [x, 0.012 + h - 0.004, z], 1, i * 0.37 + o.seed);
    });
    return;
  }
  if (o.look === 1) {
    // two turned brass candlesticks of two heights, white tapers in them
    for (const [x, z, k] of [
      [0.42, 0.48, 1],
      [0.58, 0.52, 0.78],
    ] as const) {
      m.add(
        lathe(
          [
            [0.045, 0],
            [0.045, 0.008],
            [0.03, 0.02],
            [0.012, 0.05 * k],
            [0.02, 0.07 * k],
            [0.008, 0.1 * k],
            [0.011, 0.16 * k],
            [0.018, 0.17 * k],
            [0.014, 0.18 * k],
            [0.026, 0.188 * k],
            [0.026, 0.194 * k],
            [0.012, 0.196 * k],
          ],
          14,
        ),
        P.brass,
        { at: [x, 0, z] },
      );
      const y0 = 0.194 * k;
      const h = 0.19 * k;
      m.add(cyl(0.011, 0.0095, h, 10), 0xf4f1ea, { at: [x, y0, z] });
      m.add(cyl(0.0095, 0.004, 0.008, 10), 0xf4f1ea, { at: [x, y0 + h, z] });
      wick(x, y0 + h + 0.008, z);
      if (on) flame(m, [x, y0 + h + 0.006, z], 0.85, k * 2 + o.seed);
    }
    return;
  }
  // three jars of poured wax, kraft labels round them; a lid beside
  const jars: [number, number, number, number, number][] = [
    [0.43, 0.46, 0.04, 0.1, 0xe8dcc0],
    [0.57, 0.47, 0.034, 0.08, 0xd9a66a],
    [0.5, 0.58, 0.03, 0.065, 0xc9d6c0],
  ];
  const glass: BufferGeometry[] = [];
  jars.forEach(([x, z, r, h, wax], i) => {
    m.add(cyl(r * 0.92, r * 0.92, h * 0.62, 16), wax, { at: [x, 0.004, z] });
    // (a kraft label round it, its printed square on the front)
    m.add(cyl(r * 1.02, r * 1.02, h * 0.34, 16), 0xb89a6a, { at: [x, h * 0.2, z] });
    m.add(box([r * 0.9, h * 0.2, 0.002]), P.paperWhite, { at: [x, h * 0.37, z + r * 1.03] });
    glass.push(
      lathe(
        [
          [r * 0.8, 0],
          [r, 0.004],
          [r, h - 0.006],
          [r * 0.94, h],
          [r * 0.9, h],
        ],
        16,
      ).translate(x, 0, z),
    );
    wick(x, 0.004 + h * 0.62 + 0.004, z);
    if (on) flame(m, [x, 0.004 + h * 0.62 + 0.002, z], 0.8, i * 0.41 + o.seed);
  });
  m.add(cyl(0.038, 0.038, 0.012, 16), P.alum, { at: [0.36, 0, 0.6], rot: [0, 0, 0] });
  m.add(cyl(0.03, 0.03, 0.002, 16), 0x6a6e70, { at: [0.36, 0.012, 0.6] });
  m.live(merged(glass), 0xe6eef0, { kind: "still" }, { glass: true });
}

// ── the floor uplighter (1×1) ───────────────────────────────────────────────────────────────────────
/** A torchiere throwing its light up at the ceiling: a weighted foot, a slim pole with its dimmer,
 *  the bowl at 1.8 m — brass, black with an opal glass bowl, or alabaster on bronze with three feet
 *  — glowing inside when lit. */
function uplighter(m: Model, o: Look) {
  const on = o.on !== false;
  const metal = [P.brass, 0x1e1e20, 0x6a4a2c][o.look] ?? P.brass;
  const [cx, cz] = [0.5, 0.5];
  const Y = 1.74;
  if (o.look === 2) {
    // three splayed feet, the pole up
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      m.add(
        tube(
          [
            [cx, 0.16, cz],
            [cx + Math.cos(a) * 0.1, 0.06, cz + Math.sin(a) * 0.1],
            [cx + Math.cos(a) * 0.16, 0.01, cz + Math.sin(a) * 0.16],
          ],
          0.008,
          5,
          8,
        ),
        metal,
      );
      m.add(ball(0.012, 6), metal, { at: [cx + Math.cos(a) * 0.16, 0.012, cz + Math.sin(a) * 0.16] });
    }
    m.add(ball(0.025, 8), metal, { at: [cx, 0.16, cz] });
  } else
    m.add(
      lathe(
        [
          [0.16, 0],
          [0.16, 0.014],
          [0.14, 0.03],
          [0.05, 0.045],
          [0.02, 0.06],
          [0.001, 0.062],
        ],
        24,
      ),
      metal,
      { at: [cx, 0, cz] },
    );
  m.add(cyl(0.011, 0.011, Y - 0.05, 8), metal, { at: [cx, 0.05, cz] });
  // the dimmer on the pole
  m.add(cyl(0.02, 0.02, 0.05, 10), shade(metal, 0.8), { at: [cx, 1.02, cz] });
  m.add(cyl(0.012, 0.012, 0.012, 10), shade(metal, 1.15), { at: [cx, 1.045, cz + 0.024], rot: [Math.PI / 2, 0, 0] });
  // the cup at the pole's top, the bowl in it
  m.add(cyl(0.015, 0.035, 0.05, 12), metal, { at: [cx, Y - 0.02, cz] });
  const bowl = o.look === 0 ? metal : o.look === 1 ? 0xf0ece4 : 0xe8dcc4;
  const profile: [number, number][] = [
    [0.03, Y],
    [0.09, Y + 0.02],
    [0.16, Y + 0.06],
    [0.2, Y + 0.11],
    [0.205, Y + 0.12],
  ];
  // (opal glass and alabaster let the light through: lit, they glow)
  m.add(lathe(profile, 24), on && o.look === 1 ? bowl : on && o.look === 2 ? 0xf6d8b0 : bowl, {
    at: [cx, 0, cz],
    glow: on && o.look > 0,
  });
  // its rim
  m.add(ring(0.204, 0.005, 3, 28), o.look === 1 ? metal : shade(bowl, 1.08), { at: [cx, Y + 0.12, cz] });
  if (o.look === 2)
    // (the stone's veins)
    for (let i = 0; i < 4; i++)
      m.add(ring(0.12 + i * 0.022, 0.0016, 3, 24), shade(bowl, 0.86), {
        at: [cx, Y + 0.035 + i * 0.022, cz],
        rot: [0.06 * (i % 2 ? 1 : -1), 0, 0.05 * i],
      });
  // inside, seen from over it: lit, it glows
  m.add(
    lathe(
      [
        [0.198, Y + 0.118],
        [0.155, Y + 0.065],
        [0.085, Y + 0.028],
        [0.001, Y + 0.012],
      ],
      24,
    ),
    on ? 0xfff0c8 : shade(bowl, 0.7),
    { at: [cx, 0, cz], glow: on },
  );
  // the cord out of the foot's back, curling away behind it
  m.add(
    tube(
      [
        [cx, 0.03, cz - 0.1],
        [cx + 0.02, 0.006, cz - 0.17],
        [cx + 0.08, 0.005, cz - 0.21],
        [cx + 0.16, 0.005, cz - 0.2],
      ],
      0.004,
      4,
      10,
    ),
    0x2a2624,
  );
}

// ── track lights (2×1, on the ceiling) ──────────────────────────────────────────────────────────────
/** A track along the ceiling, its feed at one end, four spot heads on it, each on its yoke and turned
 *  its own way, their lenses lit. */
function trackLights(m: Model, o: Look) {
  const on = o.on !== false;
  const body = [0x1e1e20, 0xeceae4, 0x1e1e20][o.look] ?? 0x1e1e20;
  const can = o.look === 2 ? P.brass : body;
  const z = 0.5;
  const Y = CEILING - 0.02;
  m.add(box([1.8, 0.035, 0.036], 0.004), body, { at: [1, Y, z] });
  m.add(box([1.78, 0.006, 0.012]), shade(body, o.look === 1 ? 0.8 : 1.4), { at: [1, Y - 0.018, z] });
  for (const x of [0.1, 1.9]) m.add(box([0.012, 0.04, 0.04], 0.003), shade(body, 0.85), { at: [x, Y, z] });
  // the feed: a canopy at the end
  m.add(box([0.12, 0.03, 0.08], 0.008), body, { at: [0.2, CEILING - 0.015 - 0.028, z] });
  const heads: [number, number, number][] = [
    [0.45, 0.62, 0.4],
    [0.85, 0.72, -0.5],
    [1.25, 0.55, 0.9],
    [1.65, 0.68, -0.2],
  ];
  heads.forEach(([x, tilt, yaw0], i) => {
    const yaw = yaw0 + (rnd(i, 2, o.seed) - 0.5) * 0.5;
    // the adapter on the track, the stem down to the yoke
    m.add(box([0.05, 0.03, 0.045], 0.005), body, { at: [x, Y - 0.03, z] });
    m.add(cyl(0.006, 0.006, 0.05, 6), body, { at: [x, Y - 0.095, z] });
    const hy = Y - 0.16;
    m.add(box([0.1, 0.008, 0.012], 0.002), body, { at: [x, hy + 0.065, z], rot: [0, yaw, 0] });
    for (const s of [-1, 1]) {
      const [ox, oz] = [Math.cos(yaw) * 0.048 * s, -Math.sin(yaw) * 0.048 * s];
      m.add(box([0.008, 0.075, 0.012], 0.002), body, { at: [x + ox, hy + 0.03, z + oz], rot: [0, yaw, 0] });
    }
    // the can, tipped down toward the room on its yoke, its lens and a ring
    const dir = { rot: [-tilt, yaw, 0] as V3 };
    const g = lathe(
      [
        [0.04, -0.07],
        [0.046, -0.07],
        [0.044, -0.06],
        [0.042, 0.04],
        [0.03, 0.068],
        [0.001, 0.07],
      ],
      16,
    );
    m.add(g, can, { at: [x, hy, z], ...dir });
    m.add(cyl(0.039, 0.039, 0.004, 16).translate(0, -0.066, 0), on ? 0xfff4d8 : 0x6a6a6a, {
      at: [x, hy, z],
      ...dir,
      glow: on,
    });
    // (cooling fins round its back)
    for (const y of [0.035, 0.05])
      m.add(ring(0.04, 0.003, 3, 16).translate(0, y, 0), shade(can, 0.8), { at: [x, hy, z], ...dir });
  });
}

// ── outdoor festoon lights (4×1) ────────────────────────────────────────────────────────────────────
/** Two posts, a festoon swagged between them over heads: big globes hanging off a black cable on
 *  their sockets, warm or clear, lit at night a pool under them. Timber posts in half barrels, black
 *  steel poles on plates, or birch logs in drifts of snow. */
function festoonLights(m: Model, o: Look) {
  const on = o.on !== false;
  const z = 0.5;
  const H = 2.8;
  const posts = [0.22, 3.78];
  for (const x of posts) {
    if (o.look === 0) {
      // a half barrel with its hoops, soil in it, a timber post up out of it
      m.add(cyl(0.19, 0.2, 0.4, 16), 0x8a5a36, { at: [x, 0, z] });
      for (const y of [0.06, 0.32]) m.add(ring(0.2, 0.008, 3, 20), 0x3a3a3c, { at: [x, y, z] });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        m.add(box([0.003, 0.4, 0.004]), 0x6a4426, {
          at: [x + Math.cos(a) * 0.2, 0.2, z + Math.sin(a) * 0.2],
          rot: [0, -a, 0],
        });
      }
      m.add(cyl(0.18, 0.18, 0.012, 16), P.soil, { at: [x, 0.38, z] });
      m.add(box([0.1, H - 0.38, 0.1], 0.008), 0x9a6a3e, { at: [x, 0.38 + (H - 0.38) / 2, z] });
      m.add(box([0.13, 0.03, 0.13], 0.006), 0x7a5232, { at: [x, H + 0.015, z] });
    } else if (o.look === 1) {
      m.add(box([0.2, 0.012, 0.2], 0.003), 0x2a2a2c, { at: [x, 0.006, z] });
      for (const [dx, dz] of [
        [-0.07, -0.07],
        [0.07, -0.07],
        [-0.07, 0.07],
        [0.07, 0.07],
      ])
        m.add(cyl(0.008, 0.008, 0.01, 6), P.steelLight, { at: [x + dx, 0.012, z + dz] });
      m.add(cyl(0.035, 0.03, H, 10), 0x1e1e20, { at: [x, 0.012, z] });
      m.add(ball(0.04, 8), 0x1e1e20, { at: [x, H + 0.01, z] });
    } else {
      // a birch log, its bark's dark marks, a drift of snow round its foot
      m.add(cyl(0.065, 0.055, H, 10), 0xe8e4da, { at: [x, 0, z] });
      for (let i = 0; i < 12; i++) {
        const a = rnd(i, 1, x) * Math.PI * 2;
        const y = 0.2 + rnd(i, 2, x) * (H - 0.4);
        m.add(box([0.05, 0.012, 0.01], 0.002), 0x2a2622, {
          at: [x + Math.cos(a) * 0.061, y, z + Math.sin(a) * 0.061],
          rot: [0, -a + Math.PI / 2, 0],
        });
      }
      m.add(cyl(0.064, 0.064, 0.006, 10), 0xc8a87a, { at: [x, H, z] });
      m.add(
        lathe(
          [
            [0.2, 0],
            [0.16, 0.05],
            [0.08, 0.1],
            [0.06, 0.12],
          ],
          14,
        ),
        0xf4f4f0,
        { at: [x, 0, z] },
      );
    }
    // the eye bolt the cable's hung from, its shackle
    m.add(rod(0.006, 0.006, 0.06, "x"), P.steelLight, { at: [x + (x < 2 ? 0.06 : -0.06), H - 0.1, z] });
    m.add(ring(0.016, 0.004, 3, 10).rotateX(Math.PI / 2), P.steelLight, { at: [x + (x < 2 ? 0.1 : -0.1), H - 0.1, z] });
  }
  // the cable's swag, the globes hanging off it
  const x0 = posts[0] + 0.1;
  const x1 = posts[1] - 0.1;
  const top = H - 0.11;
  const sag = 0.4;
  const yAt = (t: number) => top - sag * Math.sin(t * Math.PI);
  const pts: V3[] = Array.from({ length: 17 }, (_, i) => [x0 + ((x1 - x0) * i) / 16, yAt(i / 16), z]);
  m.add(tube(pts, 0.004, 4, 40), 0x1a1a1c);
  const n = 11;
  const MULTI = [0xff8a6a, 0xffd27a, 0x9ad8a0, 0x8ab8ff, 0xffa8d8];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const y = yAt(t);
    m.add(cyl(0.013, 0.013, 0.045, 8), 0x1a1a1c, { at: [x, y - 0.05, z] });
    m.add(cyl(0.016, 0.016, 0.012, 8), 0x2a2a2c, { at: [x, y - 0.052, z] });
    const c = o.look === 2 ? MULTI[i % MULTI.length] : o.look === 1 ? 0xfff0d0 : AMBER;
    m.add(ball(0.05, 10), on ? c : shade(c === AMBER ? 0xe8d8b8 : 0xe8e4dc, 0.9), {
      at: [x, y - 0.105, z],
      scale: [1, 1.08, 1],
      glow: on,
    });
    // (its filament, a darker loop when it's out)
    if (!on) m.add(ring(0.012, 0.0015, 3, 8).rotateX(Math.PI / 2), 0x6a5a40, { at: [x, y - 0.1, z + 0.002] });
  }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  fairy_lights: fairyLights,
  chandelier,
  paper_lanterns: paperLanterns,
  edison_cluster: edisonCluster,
  bankers_lamp: bankersLamp,
  salt_lamp: saltLamp,
  candles,
  uplighter,
  track_lights: trackLights,
  festoon_lights: festoonLights,
};
