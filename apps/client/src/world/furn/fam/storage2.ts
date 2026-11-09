import { SURFACE } from "@yutopia/shared";
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
} from "../kit";
import { finishes } from "../life-mats";
import { P, shade } from "../palette";

// Plan 68 phase 5 (docs/plan/68-more-furniture.md): Storage — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/storage2.ts. As storage.ts: small things repeated by
// the dozen (sleeves, spines, tapes, letters) are plain boxes; what's in them comes from the seed (the
// same piece always the same). A wall piece in the wall's frame (its face at z 0.1).
//
// Two of them answer the weather (a hook for the world, not wired yet): a `wet` look (Look & { wet })
// puts snow on the rack's boots and a puddle in its tray, rain on the umbrellas and a drip pool round
// the stand. Unset, they're dry.

export const LOOKS: Record<string, readonly string[]> = {
  record_crates: ["Wooden crates", "Plastic crates"],
  plan_chest: ["Oak plan chest", "Green steel plan chest"],
  display_cabinet: ["Walnut display cabinet", "White display cabinet"],
  ladder_bookcase: ["Walnut library", "Black library"],
  mail_cubbies: ["Oak cubbies", "Grey steel cubbies"],
  office_safe: ["Green safe", "Black safe"],
  shoe_rack: ["Oak shoe rack", "Black steel shoe rack"],
  umbrella_stand: ["Brass umbrella stand", "Blue-and-white ceramic"],
  cassette_rack: ["Walnut cassette rack", "Black cassette rack"],
};

/** A look the weather can wet (a hook: the world would set it from the room's weather). */
export type WetLook = Look & { wet?: boolean };

// (plan 73 phase 6.3: what the finishes are in the life look — the grey steel is painted, not bare)
finishes([[0x8d9296, "plain"]]);

const FACE = 0.1; // a wall's face
const SPINES = [0x8a2f2a, 0xc9a24a, 0x3f5f8a, 0x5f7a3a, 0xe6dcc4, 0x6a4a7a, 0xb5562f, 0x2b2a28, 0xd6c9a6, 0x3d7f8a];
const ALBUM = [
  0x1f3a5f, 0xc4402b, 0xe8c25a, 0x2f6a5a, 0xe6dcc4, 0x7a3b6a, 0x2b2a28, 0xd9734a, 0x5f8a9a, 0xf0ebe0, 0x8a2f2a,
  0x3d4f2a,
];
const SNOW = 0xf4f4f0;
const PUDDLE = 0x8fa6b2;

/** A seeded run of numbers (0..1), the same for the same seed. */
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

/** Words in the shared dot face, flat on a face looking +z: from (x, y) its top-left, each dot `p`
 *  across, as one geometry — or null for none. */
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
/** Words centred on x. */
function words(m: Model, text: string, x: number, y: number, z: number, p: number, c: number, glow = false) {
  const g = dotText(text, x - (text.length * 6 - 1) * p * 0.5, y, z, p);
  if (g) m.add(g, c, { glow });
}

/** An open carcass (x0..x1, its depth d from z0, h tall): sides, top, a plinth, a back, shelves. */
function carcass(m: Model, x0: number, x1: number, z0: number, d: number, h: number, ys: number[], wood: number) {
  const th = 0.024;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const cz = z0 + d / 2;
  for (const x of [x0 + th / 2, x1 - th / 2]) m.add(box([th, h, d], 0.004), wood, { at: [x, h / 2, cz] });
  m.add(box([w, th, d], 0.004, 2), wood, { at: [cx, h - th / 2, cz] });
  m.add(box([w - 2 * th, 0.07, d - 0.02], 0.004), shade(wood, 0.8), { at: [cx, 0.035, cz + 0.01] });
  m.add(box([w - 2 * th, h - 0.07, 0.01]), shade(wood, 0.6), { at: [cx, h / 2 + 0.035, z0 + 0.005] });
  for (const y of ys) m.add(box([w - 2 * th, th * 0.8, d - 0.02], 0.003), wood, { at: [cx, y, cz + 0.01] });
}

/** A run of books standing and stacked along a shelf from x0 to x1 (bottom y0, `room` up to the
 *  shelf over it, their spines at zf). */
function books(m: Model, r: () => number, x0: number, x1: number, y0: number, room: number, zf: number) {
  let x = x0;
  while (x < x1 - 0.03) {
    if (r() < 0.07 && x + 0.26 < x1) {
      // a stack lying flat, a bookend's worth
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++)
        m.add(box([0.2 + r() * 0.03, 0.032, 0.22]), SPINES[Math.floor(r() * SPINES.length)], {
          at: [x + 0.12, y0 + 0.016 + i * 0.032, zf - 0.12],
          rot: [0, (r() - 0.5) * 0.15, 0],
        });
      x += 0.27;
      continue;
    }
    const w = Math.min(0.03 + r() * 0.036, x1 - x);
    const h = Math.min(room - 0.03, 0.21 + r() * 0.11);
    const c = SPINES[Math.floor(r() * SPINES.length)];
    const d = 0.18 + r() * 0.05;
    m.add(box([w, h, d]), c, { at: [x + w / 2, y0 + h / 2, zf - d / 2] });
    if (r() < 0.25)
      m.add(box([w + 0.001, 0.012, 0.002]), shade(c, 1.5), { at: [x + w / 2, y0 + h * 0.78, zf + 0.001] });
    x += w + 0.002 + (r() < 0.05 ? 0.06 : 0);
  }
}

// ── the record crates (1×1) ───────────────────────────────────────────────────────────────────────
/** A crate open at the top, its front low (a bin flipped through): wooden slats or a coloured milk
 *  crate, x0..x0+w, z0..z0+d, its floor at y0. */
function crate(
  m: Model,
  x0: number,
  z0: number,
  y0: number,
  w: number,
  d: number,
  h: number,
  c: number,
  wood: boolean,
) {
  const cx = x0 + w / 2;
  const cz = z0 + d / 2;
  m.add(box([w, 0.014, d]), shade(c, 0.8), { at: [cx, y0 + 0.007, cz] });
  if (wood) {
    for (const x of [x0 + 0.012, x0 + w - 0.012])
      for (const z of [z0 + 0.012, z0 + d - 0.012])
        m.add(box([0.024, h, 0.024]), shade(c, 0.85), { at: [x, y0 + h / 2, z] });
    for (let i = 0; i < 3; i++) {
      const y = y0 + 0.02 + i * h * 0.33 + h * 0.13;
      for (const x of [x0 + 0.006, x0 + w - 0.006])
        m.add(box([0.012, h * 0.26, d - 0.02]), shade(c, 1 - i * 0.04), { at: [x, y, cz] });
      m.add(box([w - 0.02, h * 0.26, 0.012]), shade(c, 0.96 - i * 0.04), { at: [cx, y, z0 + 0.006] });
      if (i < 2) m.add(box([w - 0.02, h * 0.24, 0.012]), shade(c, 1.02 - i * 0.04), { at: [cx, y, z0 + d - 0.006] });
    }
    // the hand holds in its sides
    for (const x of [x0 - 0.0005, x0 + w + 0.0005])
      m.add(box([0.002, 0.03, 0.12]), P.ink, { at: [x, y0 + h * 0.8, cz] });
    // a stencilled mark on its front
    m.add(box([0.12, 0.022, 0.002]), shade(c, 0.6), { at: [cx, y0 + h * 0.3, z0 + d + 0.001] });
  } else {
    // moulded walls, their holes a grid, the rim round its top
    for (const s of [-1, 1]) {
      m.add(box([0.012, h, d], 0.003), c, { at: [cx + s * (w / 2 - 0.006), y0 + h / 2, cz] });
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 2; j++)
          m.add(box([0.002, h * 0.22, d * 0.24]), shade(c, 0.45), {
            at: [cx + s * (w / 2 + 0.0005), y0 + h * (0.3 + j * 0.36), z0 + d * (0.2 + i * 0.3)],
          });
    }
    m.add(box([w, h, 0.012], 0.003), c, { at: [cx, y0 + h / 2, z0 + 0.006] });
    m.add(box([w, h * 0.55, 0.012], 0.003), c, { at: [cx, y0 + h * 0.275, z0 + d - 0.006] });
    for (let i = 0; i < 3; i++)
      m.add(box([w * 0.22, h * 0.2, 0.002]), shade(c, 0.45), {
        at: [x0 + w * (0.2 + i * 0.3), y0 + h * 0.28, z0 + d + 0.0005],
      });
    m.add(box([w + 0.01, 0.014, 0.014]), shade(c, 1.08), { at: [cx, y0 + h, z0] });
    for (const x of [x0 - 0.002, x0 + w + 0.002])
      m.add(box([0.014, 0.014, d + 0.01]), shade(c, 1.08), { at: [x, y0 + h, cz] });
  }
}

/** The sleeves in a crate: flipped through — the front few tipped toward you, the rest leaning back;
 *  a divider with its letter, and (by the seed) one pulled up, its record peeking out. */
function sleeves(m: Model, r: () => number, cx: number, z0: number, d: number, y0: number, pulled: boolean) {
  const n = 17;
  const fwd = 2 + Math.floor(r() * 4);
  const div = 4 + Math.floor(r() * 9);
  const up = pulled ? 7 + Math.floor(r() * 7) : -1;
  for (let i = 0; i < n; i++) {
    // (from the back of the crate to its front)
    const k = n - 1 - i;
    const forward = k < fwd;
    const a = forward ? 0.3 + (fwd - k) * 0.06 : -0.1 - r() * 0.06;
    const z = z0 + 0.03 + (i / (n - 1)) * (d - 0.12) + (forward ? 0.05 + (fwd - k) * 0.012 : 0);
    const lift = i === up ? 0.13 : 0;
    const at: V3 = [cx + (r() - 0.5) * 0.01, y0 + 0.016 + 0.156 * Math.cos(a) + lift, z];
    const rot: V3 = [a, (r() - 0.5) * 0.04, 0];
    const c = ALBUM[Math.floor(r() * ALBUM.length)];
    m.add(box([0.31, 0.31, 0.005]), c, { at, rot });
    if (i === up) {
      // its record half out of its sleeve
      m.add(
        cyl(0.148, 0.148, 0.003, 22)
          .rotateX(Math.PI / 2)
          .translate(0, 0.07, 0),
        P.vinyl,
        { at, rot },
      );
      m.add(
        cyl(0.05, 0.05, 0.004, 14)
          .rotateX(Math.PI / 2)
          .translate(0, 0.07, 0),
        ALBUM[(i * 5) % ALBUM.length],
        {
          at,
          rot,
        },
      );
    }
    if (forward && k === 0) {
      // the front one's cover: a disc on a band, bold stripes, or a portrait in a frame
      const art = ALBUM[Math.floor(r() * ALBUM.length)];
      const design = Math.floor(r() * 3);
      if (design === 0) {
        m.add(box([0.31, 0.1, 0.002]).translate(0, -0.06, 0.0035), shade(c, 0.6), { at, rot });
        m.add(
          cyl(0.07, 0.07, 0.002, 18)
            .rotateX(Math.PI / 2)
            .translate(0.04, 0.05, 0.0035),
          art,
          { at, rot },
        );
      } else if (design === 1) {
        for (let s = 0; s < 3; s++)
          m.add(box([0.31, 0.04, 0.002]).translate(0, -0.09 + s * 0.07, 0.0035), s === 1 ? art : shade(c, 0.6), {
            at,
            rot,
          });
      } else {
        m.add(box([0.17, 0.17, 0.002]).translate(0, 0.02, 0.0035), shade(art, 0.8), { at, rot });
        m.add(
          cyl(0.045, 0.045, 0.002, 14)
            .rotateX(Math.PI / 2)
            .translate(0, 0.04, 0.0045),
          P.cream,
          { at, rot },
        );
        m.add(box([0.09, 0.05, 0.002]).translate(0, -0.03, 0.0045), art, { at, rot });
      }
    }
    if (i === div) {
      // a divider card, taller, its tab lettered
      const L = "ABCDEFGHJKLMNPRSTW"[Math.floor(r() * 18)];
      const card = box([0.33, 0.33, 0.003]).translate(0, 0.01, -0.006);
      m.add(card, P.cream, { at, rot });
      m.add(box([0.07, 0.05, 0.003]).translate(-0.08, 0.19, -0.006), P.cream, { at, rot });
      const t = dotText(L, -0.093, 0.205, -0.004, 0.005);
      if (t) m.add(t, P.ink, { at, rot });
    }
  }
}

export function recordCrates(m: Model, o: Look) {
  const wood = o.look !== 1;
  const S = 0.46; // the stand's top
  const frame = wood ? P.oak : P.ash;
  const r = rng(o.seed);
  // the stand: four legs, aprons, its top board, a slatted shelf low down
  const leg = wood ? 0.045 : 0.03;
  for (const x of [0.085, 0.915])
    for (const z of [0.26, 0.74]) m.add(box([leg, S, leg], 0.004), frame, { at: [x, S / 2, z] });
  for (const z of [0.26, 0.74]) m.add(box([0.86, 0.06, 0.022], 0.003), frame, { at: [0.5, S - 0.055, z] });
  for (const x of [0.085, 0.915]) m.add(box([0.022, 0.06, 0.5], 0.003), frame, { at: [x, S - 0.055, 0.5] });
  m.add(box([0.88, 0.025, 0.54], 0.005), wood ? P.oakLight : P.steel, { at: [0.5, S - 0.0125, 0.5] });
  for (let i = 0; i < 5; i++)
    m.add(box([0.82, 0.018, 0.08]), wood ? shade(P.oak, 0.92) : P.steel, { at: [0.5, 0.09, 0.3 + i * 0.1] });
  for (const z of [0.26, 0.74]) m.add(box([0.82, 0.03, 0.02]), frame, { at: [0.5, 0.075, z] });
  // two crates up top
  const cols = wood ? [0xc9a273, 0xbf9566] : [[0xd9a441, 0x3d7f8a][Math.floor(o.seed * 2)], 0xc4402b];
  const pulled = Math.floor(r() * 2);
  for (const [i, x0] of [0.11, 0.53].entries()) {
    crate(m, x0, 0.3, S, 0.36, 0.4, 0.27, cols[i], wood);
    sleeves(m, r, x0 + 0.18, 0.3, 0.4, S, i === pulled);
  }
  // under: a stack of LPs lying flat, or a third crate
  if (r() < 0.5) {
    crate(m, 0.32, 0.3, 0.1, 0.36, 0.4, 0.27, wood ? 0xb38a5c : cols[0], wood);
    sleeves(m, r, 0.5, 0.3, 0.4, 0.1, false);
  } else {
    const n = 4 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++)
      m.add(box([0.31, 0.006, 0.31]), ALBUM[Math.floor(r() * ALBUM.length)], {
        at: [0.4 + (r() - 0.5) * 0.03, 0.102 + i * 0.0065, 0.5 + (r() - 0.5) * 0.03],
        rot: [0, (r() - 0.5) * 0.3, 0],
      });
    m.add(box([0.31, 0.006, 0.31]), P.vinyl, { at: [0.72, 0.102, 0.48], rot: [0, 0.5, 0] });
  }
}

// ── the plan chest (2×1) ──────────────────────────────────────────────────────────────────────────
/** A wide, low chest of eight shallow drawers for drawings flat (things stand on its top, at
 *  SURFACE): each drawer's label holder and two pulls; by its seed one's left out, a blueprint and a
 *  map in it, a sheet's corner curling up. Oak with brass cups, or green steel with chrome bars. */
export function planChest(m: Model, o: Look) {
  const steel = o.look === 1;
  const H = SURFACE.plan_chest;
  const c = steel ? 0x4f6b58 : P.oak;
  const metal = steel ? P.chrome : P.brass;
  m.add(box([1.5, 0.08, 0.64]), steel ? P.ink : P.walnutDark, { at: [1, 0.04, 0.44] });
  m.add(box([1.6, H - 0.11, 0.72], steel ? 0.012 : 0.006, 2), shade(c, 0.9), { at: [1, 0.08 + (H - 0.11) / 2, 0.44] });
  m.add(box([1.66, 0.03, 0.8], steel ? 0.01 : 0.006, 2), steel ? shade(c, 1.05) : P.oakLight, {
    at: [1, H - 0.015, 0.44],
  });
  if (!steel) m.add(box([1.62, 0.012, 0.76]), shade(c, 0.8), { at: [1, H - 0.036, 0.44] });
  const n = 8;
  const dh = (H - 0.05 - 0.1) / n;
  const ajar = Math.floor(o.seed * 7) % n;
  for (let i = 0; i < n; i++) {
    const y = 0.1 + dh * (i + 0.5);
    const out = i === ajar && o.seed > 0.3 ? 0.15 : 0;
    const zf = 0.8 + 0.011 + out;
    m.add(box([1.52, dh - 0.008, 0.022], 0.004), c, { at: [1, y, zf] });
    // the label holder, its card
    m.add(box([0.12, 0.046, 0.004]), metal, { at: [1, y + 0.004, zf + 0.013] });
    m.add(box([0.1, 0.032, 0.002]), P.paperWhite, { at: [1, y + 0.004, zf + 0.016] });
    m.add(box([0.06, 0.004, 0.001]), P.ink, { at: [0.99, y + 0.006, zf + 0.0175] });
    for (const x of [0.48, 1.52]) {
      if (steel) {
        m.add(rod(0.007, 0.007, 0.2, "x", 6), metal, { at: [x, y, zf + 0.03] });
        for (const s of [-1, 1]) m.add(box([0.012, 0.012, 0.02]), metal, { at: [x + s * 0.09, y, zf + 0.02] });
      } else {
        // a brass cup pull: its plate and the cup under it
        m.add(box([0.11, 0.035, 0.005]), metal, { at: [x, y + 0.004, zf + 0.013] });
        m.add(rod(0.035, 0.035, 0.1, "x", 10).scale(1, 0.6, 0.5), shade(metal, 0.85), {
          at: [x, y - 0.002, zf + 0.016],
        });
      }
    }
    if (out) {
      // its sides and inside, and what's in it
      for (const x of [0.26, 1.74])
        m.add(box([0.012, dh - 0.02, out + 0.02]), shade(c, 0.75), { at: [x, y, 0.8 + out / 2] });
      m.add(box([1.46, 0.006, out]), shade(c, 0.5), { at: [1, y - dh / 2 + 0.012, 0.8 + out / 2 - 0.01] });
      m.add(box([0.84, 0.004, out + 0.02]), 0x2f5f9a, { at: [0.78, y - dh / 2 + 0.02, 0.8 + out / 2] });
      for (let k = 0; k < 5; k++)
        m.add(box([0.6, 0.0015, 0.004]), 0xdce8f4, { at: [0.78, y - dh / 2 + 0.023, 0.73 + k * 0.035] });
      m.add(box([0.66, 0.004, out]), 0xe9dcb4, { at: [1.32, y - dh / 2 + 0.026, 0.8 + out / 2 - 0.02] });
      // (a corner curling up out of it)
      m.add(box([0.14, 0.003, 0.08]), 0xe9dcb4, { at: [1.6, y - dh / 2 + 0.05, 0.8 + out - 0.04], rot: [0, 0, 0.5] });
    }
  }
  // its maker's plate on the plinth
  m.add(box([0.16, 0.03, 0.003]), metal, { at: [1, 0.05, 0.765] });
}

// ── the glass display cabinet (1×1) ──────────────────────────────────────────────────────────────
type Show = (m: Model, x: number, y: number, z: number, r: () => number) => void;
const GOLD = 0xd4a540;
/** The things in the cabinet, by its seed: a cup, a shield, a medal on its stand, a sailing boat, a
 *  vase, a star, a plate on its stand, a framed photo. */
const SHOWN: Show[] = [
  (m, x, y, z) => {
    m.add(
      lathe(
        [
          [0, 0],
          [0.05, 0],
          [0.05, 0.035],
          [0.03, 0.04],
          [0.012, 0.07],
          [0.012, 0.1],
          [0.03, 0.11],
          [0.055, 0.15],
          [0.06, 0.2],
          [0.054, 0.2],
        ],
        14,
      ),
      GOLD,
      { at: [x, y, z] },
    );
    m.add(box([0.1, 0.035, 0.1]), P.walnutDark, { at: [x, y + 0.0175, z] });
    for (const s of [-1, 1])
      m.add(
        tube(
          [
            [x + s * 0.05, y + 0.18, z],
            [x + s * 0.085, y + 0.165, z],
            [x + s * 0.06, y + 0.12, z],
          ],
          0.006,
          4,
          6,
        ),
        GOLD,
      );
    m.add(box([0.05, 0.012, 0.002]), P.brass, { at: [x, y + 0.018, z + 0.051] });
  },
  (m, x, y, z) => {
    const sh = extrude(
      [
        [-0.07, 0.1],
        [0.07, 0.1],
        [0.07, 0.0],
        [0.0, -0.09],
        [-0.07, 0.0],
      ],
      0.02,
      0.004,
    );
    m.add(sh, P.walnut, { at: [x, y + 0.11, z], rot: [-0.2, 0, 0] });
    m.add(cyl(0.035, 0.035, 0.006, 14).rotateX(Math.PI / 2), GOLD, { at: [x, y + 0.13, z + 0.012], rot: [-0.2, 0, 0] });
    m.add(box([0.012, 0.11, 0.012]), P.walnutDark, { at: [x, y + 0.055, z - 0.035], rot: [0.3, 0, 0] });
  },
  (m, x, y, z) => {
    m.add(box([0.012, 0.16, 0.012]), P.walnutDark, { at: [x, y + 0.08, z - 0.03], rot: [0.25, 0, 0] });
    for (const s of [-1, 1])
      m.add(box([0.028, 0.09, 0.003]), s < 0 ? 0x2f4a8a : 0xc4402b, {
        at: [x + s * 0.012, y + 0.14, z - 0.005],
        rot: [-0.25, 0, s * 0.25],
      });
    m.add(cyl(0.032, 0.032, 0.006, 16).rotateX(Math.PI / 2), GOLD, { at: [x, y + 0.08, z + 0.01], rot: [-0.25, 0, 0] });
    m.add(box([0.06, 0.008, 0.05]), P.walnutDark, { at: [x, y + 0.004, z] });
  },
  (m, x, y, z) => {
    m.add(
      extrude(
        [
          [-0.09, 0.03],
          [0.1, 0.03],
          [0.07, 0],
          [-0.07, 0],
        ],
        0.04,
        0.004,
      ).rotateY(0.4),
      0x7a3b2a,
      { at: [x, y + 0.03, z] },
    );
    m.add(rod(0.003, 0.003, 0.17, "x", 4).rotateZ(Math.PI / 2), P.walnutDark, { at: [x, y + 0.14, z] });
    m.add(
      extrude(
        [
          [0, 0],
          [0.07, 0],
          [0, 0.13],
        ],
        0.003,
      ).rotateY(0.4),
      P.paperWhite,
      { at: [x + 0.004, y + 0.07, z] },
    );
    m.add(
      extrude(
        [
          [0, 0],
          [-0.05, 0],
          [0, 0.1],
        ],
        0.003,
      ).rotateY(0.4),
      P.cream,
      { at: [x - 0.004, y + 0.07, z] },
    );
    m.add(box([0.06, 0.02, 0.04]), P.walnutDark, { at: [x, y + 0.01, z] });
  },
  (m, x, y, z, r) => {
    const c = [0x3f6a8a, 0xb5653f, 0x5f7a3a][Math.floor(r() * 3)];
    m.add(
      lathe(
        [
          [0, 0],
          [0.04, 0],
          [0.06, 0.06],
          [0.055, 0.12],
          [0.025, 0.17],
          [0.03, 0.2],
          [0.026, 0.2],
        ],
        12,
      ),
      c,
      { at: [x, y, z] },
    );
    m.add(ring(0.058, 0.006, 3, 14), P.cream, { at: [x, y + 0.085, z] });
  },
  (m, x, y, z) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 0.026 : 0.06;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    m.add(extrude(pts, 0.018, 0.003), GOLD, { at: [x, y + 0.17, z] });
    m.add(cyl(0.012, 0.012, 0.1, 8), GOLD, { at: [x, y + 0.04, z] });
    m.add(box([0.08, 0.04, 0.08], 0.004), 0x2b2a28, { at: [x, y + 0.02, z] });
  },
  (m, x, y, z, r) => {
    m.add(cyl(0.09, 0.09, 0.008, 20).rotateX(Math.PI / 2), P.ceramic, { at: [x, y + 0.1, z], rot: [-0.25, 0, 0] });
    m.add(ring(0.065, 0.005, 3, 18).rotateX(Math.PI / 2), [0x2f4a8a, 0x8a2f2a][Math.floor(r() * 2)], {
      at: [x, y + 0.1, z + 0.006],
      rot: [-0.25, 0, 0],
    });
    m.add(box([0.06, 0.03, 0.04]), P.walnutDark, { at: [x, y + 0.015, z - 0.01] });
  },
  (m, x, y, z, r) => {
    m.add(box([0.13, 0.17, 0.014], 0.003), P.brass, { at: [x, y + 0.085, z], rot: [-0.2, 0, 0] });
    m.add(box([0.1, 0.13, 0.002]), [0x8a9a7a, 0x9a8a7a, 0x7a8a9a][Math.floor(r() * 3)], {
      at: [x, y + 0.085, z + 0.008],
      rot: [-0.2, 0, 0],
    });
  },
];

/** A cabinet of glass on a plinth, under a cornice (1.86 m): the glass shelves lit from a strip
 *  under its top when on (interact "lamp"), its back velvet or pale, the door's slim frame with its
 *  knob and key; on each shelf two or three things by its seed. Walnut or white. */
export function displayCabinet(m: Model, o: Look) {
  const white = o.look === 1;
  const wood = white ? P.white : P.walnut;
  const on = o.on !== false;
  const [x0, x1, z0, z1] = [0.15, 0.85, 0.32, 0.8];
  const cz = (z0 + z1) / 2;
  m.add(box([0.7, 0.1, 0.46], 0.006), shade(wood, 0.82), { at: [0.5, 0.05, cz] });
  m.add(box([0.72, 0.04, 0.48], 0.005), wood, { at: [0.5, 0.12, cz] });
  for (const x of [x0 + 0.02, x1 - 0.02])
    for (const z of [z0 + 0.02, z1 - 0.02]) m.add(box([0.036, 1.6, 0.036], 0.004), wood, { at: [x, 0.94, z] });
  m.add(box([0.74, 0.08, 0.5], 0.008, 2), wood, { at: [0.5, 1.78, cz] });
  m.add(box([0.7, 0.03, 0.46], 0.004), shade(wood, 0.9), { at: [0.5, 1.835, cz] });
  // the back, the floor inside
  m.add(box([0.64, 1.6, 0.01]), white ? 0xa9bcc0 : 0x5a2a2e, { at: [0.5, 0.94, z0 + 0.012] });
  m.add(box([0.64, 0.004, 0.42]), white ? 0xdcd6c8 : 0x4a2226, { at: [0.5, 0.142, cz] });
  // the light under its top
  m.add(box([0.58, 0.012, 0.03]), on ? 0xfff0cc : P.cream, { at: [0.5, 1.732, z1 - 0.07], glow: on });
  // the door's slim frame round the front glass, its knob and key
  for (const x of [x0 + 0.045, x1 - 0.045]) m.add(box([0.016, 1.58, 0.012]), wood, { at: [x, 0.94, z1 - 0.004] });
  for (const y of [0.16, 1.72]) m.add(box([0.6, 0.016, 0.012]), wood, { at: [0.5, y, z1 - 0.004] });
  m.add(ball(0.012, 8), P.brass, { at: [x1 - 0.07, 1.0, z1 + 0.01] });
  m.add(box([0.012, 0.02, 0.003]), P.brass, { at: [x1 - 0.07, 0.95, z1 + 0.0015] });
  // the shelves' clips
  const shelves = [0.56, 0.98, 1.38];
  for (const y of shelves)
    for (const x of [x0 + 0.045, x1 - 0.045])
      for (const z of [z0 + 0.06, z1 - 0.06]) m.add(box([0.012, 0.012, 0.012]), P.chrome, { at: [x, y - 0.012, z] });
  // what's in it
  const r = rng(o.seed);
  for (const y of [0.144, ...shelves.map((y) => y + 0.006)]) {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const x = n === 2 ? 0.34 + i * 0.32 : 0.28 + i * 0.22;
      SHOWN[Math.floor(r() * SHOWN.length)](m, x, y, 0.58 + (r() - 0.5) * 0.06, r);
    }
  }
  // the glass shelves (thick enough to see their green edge), then the panes round them (see-through)
  for (const y of shelves) {
    m.add(box([0.64, 0.008, 0.42]), 0xcfe3e0, { at: [0.5, y, cz] });
    m.add(box([0.64, 0.009, 0.004]), 0x8fbcb0, { at: [0.5, y, cz + 0.21] });
  }
  m.live(
    merged([
      box([0.64, 1.56, 0.006]).translate(0.5, 0.94, z1 - 0.01),
      box([0.006, 1.56, 0.42]).translate(x0 + 0.01, 0.94, cz),
      box([0.006, 1.56, 0.42]).translate(x1 - 0.01, 0.94, cz),
    ]),
    0x8fa8ae,
    { kind: "still" },
    { glass: true },
  );
}

// ── the library bookcase with its ladder (3×1) ───────────────────────────────────────────────────
/** Floor-to-cornice shelves, 2.6 m, in three bays, full of books by its seed; a brass rail along
 *  the front on its brackets, a ladder hooked on it, its wheels on the floor (left at the middle bay:
 *  sliding it along is a hook, not yet). Walnut or black. */
export const LADDER_X = 1.5;
export function ladderBookcase(m: Model, o: Look) {
  const black = o.look === 1;
  const wood = black ? P.ash : P.walnut;
  const metal = black ? P.chrome : P.brass;
  const H = 2.6;
  const z0 = 0.06;
  const d = 0.38;
  const ys = [0.46, 0.86, 1.26, 1.66, 2.06];
  carcass(m, 0.04, 2.96, z0, d, H - 0.08, ys, wood);
  for (const x of [1.0, 2.0])
    m.add(box([0.024, H - 0.15, d - 0.01]), wood, { at: [x, 0.07 + (H - 0.15) / 2, z0 + d / 2] });
  // the cornice
  m.add(box([2.98, 0.06, d + 0.04], 0.006, 2), wood, { at: [1.5, H - 0.05, z0 + d / 2 + 0.01] });
  m.add(box([2.94, 0.03, d + 0.02], 0.004), shade(wood, 1.12), { at: [1.5, H - 0.015, z0 + d / 2 + 0.005] });
  m.add(box([2.9, 0.02, 0.01]), shade(wood, 1.25), { at: [1.5, H - 0.09, z0 + d + 0.005] });
  const r = rng(o.seed);
  const plantAt = Math.floor(r() * 3);
  const bottoms = [0.07, ...ys.map((y) => y + 0.01)];
  bottoms.forEach((y0, shelf) => {
    const room = (shelf < ys.length ? ys[shelf] : H - 0.1) - y0;
    for (let bay = 0; bay < 3; bay++) {
      const bx0 = [0.07, 1.02, 2.02][bay];
      const bx1 = [0.985, 1.985, 2.935][bay];
      if (shelf === 3 && bay === plantAt) {
        // a trailing plant in its pot, books to one side
        const px = bx0 + 0.2;
        m.add(
          lathe(
            [
              [0, 0],
              [0.07, 0],
              [0.085, 0.13],
              [0.08, 0.13],
            ],
            10,
          ),
          P.terracotta,
          { at: [px, y0, z0 + 0.22] },
        );
        for (let i = 0; i < 6; i++)
          m.add(leaf(0.11, 0.07, 0.2, 0.7, 3), i % 2 ? P.leaf : P.leafYoung, {
            at: [px, y0 + 0.12, z0 + 0.22],
            rot: [0.9, i * 1.05, 0],
          });
        books(m, r, bx0 + 0.42, bx1, y0, room, z0 + d - 0.02);
        continue;
      }
      books(m, r, bx0, bx1, y0, room, z0 + d - 0.02);
    }
  });
  // the rail on its brackets
  const RY = 2.32;
  const RZ = 0.53;
  m.add(rod(0.013, 0.013, 2.86, "x", 10), metal, { at: [1.5, RY, RZ] });
  for (const x of [0.06, 1.0, 2.0, 2.94]) {
    m.add(box([0.03, 0.05, 0.012]), metal, { at: [x, RY, z0 + d + 0.006] });
    m.add(rod(0.008, 0.008, RZ - z0 - d, "z", 6), metal, { at: [x, RY, (z0 + d + RZ) / 2] });
    m.add(ball(0.02, 8), metal, { at: [x, RY, RZ] });
  }
  // the ladder: its two rails from the hooks on the rail to its wheels on the floor, eight rungs
  const top: V3 = [0, RY + 0.06, RZ + 0.02];
  const foot: V3 = [0, 0.06, 0.93];
  const L = Math.hypot(top[1] - foot[1], top[2] - foot[2]);
  const a = Math.atan2(foot[2] - top[2], top[1] - foot[1]);
  const at = (t: number, x: number): V3 => [x, foot[1] + (top[1] - foot[1]) * t, foot[2] + (top[2] - foot[2]) * t];
  const lw = black ? P.ash : P.walnutDark;
  for (const s of [-1, 1]) {
    const x = LADDER_X + s * 0.21;
    m.add(box([0.034, L, 0.06]), lw, { at: at(0.5, x), rot: [-a, 0, 0] });
    // the hook over the rail, the wheel at its foot
    m.add(
      tube(
        [
          [x, RY - 0.05, RZ + 0.05],
          [x, RY + 0.04, RZ + 0.035],
          [x, RY + 0.035, RZ - 0.03],
          [x, RY - 0.005, RZ - 0.025],
        ],
        0.008,
        5,
        8,
      ),
      metal,
    );
    m.add(box([0.022, 0.06, 0.05]), metal, { at: [x, 0.06, 0.93] });
    m.add(rod(0.035, 0.035, 0.022, "x", 12), P.rubber, { at: [x, 0.035, 0.93] });
  }
  for (let i = 1; i <= 8; i++) {
    const t = i / 9;
    const p = at(t, LADDER_X);
    m.add(box([0.4, 0.024, 0.075]), shade(lw, 1.15), { at: [p[0], p[1], p[2] + 0.005], rot: [-a, 0, 0] });
  }
}

// ── the mail cubbies (2×1) ────────────────────────────────────────────────────────────────────────
/** Pigeonholes over a cupboard: eight across and five up, a name card under each, letters in some
 *  by the seed (lying and stood on end), a parcel, a rolled magazine, a postcard. Oak, or grey steel. */
export function mailCubbies(m: Model, o: Look) {
  const steel = o.look === 1;
  const c = steel ? 0x8d9296 : P.oak;
  const metal = steel ? P.chrome : P.brass;
  const B = 0.9;
  // the cupboard: its plinth, two doors, the top
  m.add(box([1.74, 0.07, 0.5]), steel ? P.ink : P.walnutDark, { at: [1, 0.035, 0.62] });
  m.add(box([1.8, B - 0.1, 0.56], 0.006, 2), shade(c, 0.88), { at: [1, 0.07 + (B - 0.1) / 2, 0.62] });
  for (const s of [-1, 1]) {
    m.add(box([0.88, B - 0.16, 0.02], 0.004), c, { at: [1 + s * 0.445, 0.07 + (B - 0.1) / 2, 0.91] });
    m.add(box([0.7, B - 0.32, 0.006]), shade(c, 0.93), { at: [1 + s * 0.445, 0.07 + (B - 0.1) / 2, 0.922] });
    m.add(steel ? box([0.016, 0.14, 0.02], 0.004) : ball(0.016, 8), metal, { at: [1 + s * 0.05, 0.6, 0.935] });
  }
  m.add(box([1.84, 0.03, 0.6], 0.005), steel ? shade(c, 1.05) : P.oakLight, { at: [1, B - 0.015, 0.62] });
  // the pigeonholes
  const [x0, x1, y0, y1, z0, z1] = [0.12, 1.88, B, 1.86, 0.34, 0.66];
  const cols = 8;
  const rows = 5;
  const cw = (x1 - x0) / cols;
  const rh = (y1 - y0 - 0.02) / rows;
  const th = steel ? 0.008 : 0.014;
  m.add(box([x1 - x0, y1 - y0, 0.012]), shade(c, 0.65), { at: [1, (y0 + y1) / 2, z0 + 0.006] });
  for (const x of [x0, x1]) m.add(box([0.02, y1 - y0, z1 - z0], 0.003), c, { at: [x, (y0 + y1) / 2, (z0 + z1) / 2] });
  m.add(box([x1 - x0 + 0.04, 0.025, z1 - z0 + 0.02], 0.004), c, { at: [1, y1 + 0.0125, (z0 + z1) / 2] });
  for (let i = 1; i < cols; i++)
    m.add(box([th, y1 - y0, z1 - z0 - 0.01]), c, { at: [x0 + i * cw, (y0 + y1) / 2, (z0 + z1) / 2] });
  for (let j = 1; j < rows; j++) m.add(box([x1 - x0, th, z1 - z0 - 0.01]), c, { at: [1, y0 + j * rh, (z0 + z1) / 2] });
  const r = rng(o.seed);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const cx = x0 + (i + 0.5) * cw;
      const fy = y0 + j * rh + th / 2;
      // the name card on its edge
      m.add(box([0.11, 0.022, 0.003]), metal, { at: [cx, fy + 0.012, z1 - 0.004] });
      m.add(box([0.095, 0.014, 0.002]), P.paperWhite, { at: [cx, fy + 0.012, z1 - 0.002] });
      m.add(box([0.03 + r() * 0.04, 0.003, 0.001]), P.ink, { at: [cx - 0.01, fy + 0.012, z1 - 0.0005] });
      const k = r();
      if (k < 0.32) continue;
      if (k < 0.72) {
        // letters: lying, a couple stood up leaning
        const n = 1 + Math.floor(r() * 3);
        for (let e = 0; e < n; e++)
          m.add(box([0.16, 0.003, 0.11]), [P.paperWhite, P.cream, 0xd9c49a, 0xe6dcc4][Math.floor(r() * 4)], {
            at: [cx + (r() - 0.5) * 0.02, fy + 0.024 + e * 0.004, z1 - 0.1 + r() * 0.02],
            rot: [0, (r() - 0.5) * 0.25, 0],
          });
        if (r() < 0.5)
          m.add(box([0.16, 0.11, 0.003]), r() < 0.5 ? P.paperWhite : 0xd9c49a, {
            at: [cx, fy + 0.07, z0 + 0.06],
            rot: [-0.2, (r() - 0.5) * 0.1, 0],
          });
        // (a stamp on the top one)
        m.add(box([0.016, 0.001, 0.02]), [0xc4402b, 0x3f5f8a, P.olive][Math.floor(r() * 3)], {
          at: [cx + 0.06, fy + 0.036, z1 - 0.06],
        });
      } else if (k < 0.84) {
        m.add(box([0.17, Math.min(rh - 0.04, 0.1), 0.2], 0.004), 0xb8935e, {
          at: [cx, fy + 0.06, (z0 + z1) / 2 + 0.02],
        });
        m.add(box([0.172, 0.012, 0.2]), 0xcdb586, { at: [cx, fy + 0.07, (z0 + z1) / 2 + 0.02] });
      } else if (k < 0.93) {
        m.add(rod(0.025, 0.025, 0.2, "x", 8), [0xc4402b, 0x3d7f8a, P.mustard][Math.floor(r() * 3)], {
          at: [cx, fy + 0.03, z1 - 0.08],
        });
      } else {
        m.add(box([0.14, 0.09, 0.003]), [0x8ab0c8, 0xe8c25a][Math.floor(r() * 2)], {
          at: [cx, fy + 0.055, z0 + 0.05],
          rot: [-0.25, 0, 0],
        });
      }
    }
  // a bell on the top for the post, a sign over it
  m.add(box([0.36, 0.06, 0.004]), steel ? P.ink : P.walnutDark, { at: [1, y1 - 0.0, z1 + 0.012] });
  words(m, "POST", 1, y1 + 0.017, z1 + 0.015, 0.006, metal);
}

// ── the safe (1×1) ────────────────────────────────────────────────────────────────────────────────
/** A heavy safe on its feet (things stand on its top, at SURFACE): a door inset with a pinstripe,
 *  two hinges, the maker's oval, a combination dial (its numbers, its knob turned where the seed left
 *  it), a three-spoked handle, the keyhole. Green with gold lines, or black with chrome. */
export function officeSafe(m: Model, o: Look) {
  const black = o.look === 1;
  const c = black ? 0x1f2124 : 0x2f4a3a;
  const trim = black ? P.chrome : P.brass;
  const H = SURFACE.office_safe;
  const F = 0.8; // its front
  for (const x of [0.25, 0.75])
    for (const z of [0.28, 0.74])
      m.add(
        lathe(
          [
            [0, 0],
            [0.03, 0],
            [0.036, 0.02],
            [0.03, 0.05],
            [0, 0.05],
          ],
          10,
        ),
        P.ink,
        { at: [x, 0, z] },
      );
  m.add(box([0.6, H - 0.07, 0.58], 0.022, 2), c, { at: [0.5, 0.05 + (H - 0.07) / 2, F - 0.29] });
  m.add(box([0.62, 0.02, 0.6], 0.006), shade(c, 1.1), { at: [0.5, H - 0.01, F - 0.29] });
  // the door, its pinstripe
  m.add(box([0.5, 0.56, 0.026], 0.008), shade(c, 1.12), { at: [0.5, 0.41, F + 0.008] });
  const S = F + 0.0215;
  for (const y of [0.155, 0.665]) m.add(box([0.44, 0.005, 0.002]), trim, { at: [0.5, y, S] });
  for (const x of [0.28, 0.72]) m.add(box([0.005, 0.51, 0.002]), trim, { at: [x, 0.41, S] });
  for (const y of [0.17, 0.65]) m.add(cyl(0.016, 0.016, 0.1, 10), shade(c, 0.8), { at: [0.235, y - 0.05, F + 0.005] });
  // the maker's oval
  m.add(
    cyl(0.03, 0.03, 0.004, 16)
      .rotateX(Math.PI / 2)
      .scale(2, 1, 1),
    trim,
    { at: [0.5, 0.61, S] },
  );
  m.add(box([0.07, 0.006, 0.001]), P.ink, { at: [0.5, 0.612, S + 0.0045] });
  // the dial: its numbered ring, the knob, the mark it's read against
  const DY = 0.48;
  m.add(cyl(0.075, 0.075, 0.01, 24).rotateX(Math.PI / 2), black ? P.steelLight : P.cream, { at: [0.5, DY, S] });
  m.add(ring(0.075, 0.005, 3, 24).rotateX(Math.PI / 2), trim, { at: [0.5, DY, S + 0.008] });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    m.add(box([0.004, i % 5 ? 0.01 : 0.018, 0.002]), P.ink, {
      at: [0.5 + Math.sin(a) * 0.062, DY + Math.cos(a) * 0.062, S + 0.011],
      rot: [0, 0, -a],
    });
  }
  const turn = o.seed * Math.PI * 2;
  m.add(cyl(0.042, 0.038, 0.03, 16).rotateX(Math.PI / 2), black ? P.ink : 0x2b2a28, { at: [0.5, DY, S + 0.01] });
  for (let i = 0; i < 12; i++) {
    const a = turn + (i / 12) * Math.PI * 2;
    m.add(box([0.008, 0.008, 0.026]), shade(black ? P.ink : 0x2b2a28, 1.3), {
      at: [0.5 + Math.sin(a) * 0.041, DY + Math.cos(a) * 0.041, S + 0.024],
      rot: [0, 0, -a],
    });
  }
  m.add(box([0.005, 0.022, 0.002]), P.paperWhite, {
    at: [0.5 + Math.sin(turn) * 0.024, DY + Math.cos(turn) * 0.024, S + 0.041],
    rot: [0, 0, -turn],
  });
  m.add(
    extrude(
      [
        [-0.008, 0],
        [0.008, 0],
        [0, -0.014],
      ],
      0.004,
    ),
    0xc4402b,
    { at: [0.5, DY + 0.09, S + 0.003] },
  );
  // the handle: a hub, three spokes, their knobs
  const HY = 0.29;
  m.add(cyl(0.022, 0.022, 0.03, 12).rotateX(Math.PI / 2), trim, { at: [0.5, HY, S] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    m.add(box([0.012, 0.085, 0.012]), trim, {
      at: [0.5 + Math.sin(a) * 0.045, HY + Math.cos(a) * 0.045, S + 0.03],
      rot: [0, 0, -a],
    });
    m.add(ball(0.014, 8), trim, { at: [0.5 + Math.sin(a) * 0.088, HY + Math.cos(a) * 0.088, S + 0.03] });
  }
  // the keyhole's plate
  m.add(box([0.03, 0.045, 0.004]), trim, { at: [0.64, HY, S + 0.002] });
  m.add(box([0.006, 0.016, 0.002]), P.ink, { at: [0.64, HY, S + 0.005] });
}

// ── the shoe & boot rack (1×1) ───────────────────────────────────────────────────────────────────
/** A shoe: its toe to +z, its middle at (x, z), on y; trainers, brogues, a boot or a wellie. */
function shoe(m: Model, x: number, y: number, z: number, kind: number, c: number, turn: number, snow: boolean) {
  const at: V3 = [x, y, z];
  const rot: V3 = [0, turn, 0];
  const sole = kind === 0 ? P.paperWhite : kind === 3 ? shade(c, 0.7) : 0x3a2a20;
  m.add(box([0.09, 0.022, 0.27], 0.008).translate(0, 0.011, 0), sole, { at, rot });
  m.add(cushion([0.082, 0.07, 0.17], 0.22, 1).translate(0, 0.055, -0.04), c, { at, rot });
  m.add(cushion([0.078, 0.05, 0.11], 0.3, 1).translate(0, 0.042, 0.075), shade(c, 1.06), { at, rot });
  if (kind === 0) {
    for (let i = 0; i < 3; i++)
      m.add(box([0.05, 0.004, 0.008]).translate(0, 0.088, 0.02 - i * 0.025), P.paperWhite, { at, rot });
    m.add(box([0.002, 0.03, 0.08]).translate(0.042, 0.05, -0.01), P.paperWhite, { at, rot });
  } else if (kind === 1) {
    m.add(box([0.07, 0.004, 0.012]).translate(0, 0.09, 0.0), shade(c, 0.7), { at, rot });
  }
  if (kind >= 2) {
    // a boot's shaft
    const tall = kind === 3 ? 0.3 : 0.2;
    m.add(box([0.088, tall, 0.11], 0.02).translate(0, 0.06 + tall / 2, -0.07), shade(c, 0.95), { at, rot });
    m.add(box([0.092, 0.02, 0.114], 0.006).translate(0, 0.06 + tall, -0.07), kind === 3 ? shade(c, 0.8) : P.cream, {
      at,
      rot,
    });
    if (snow) {
      m.add(
        ball(0.04, 6)
          .scale(1.1, 0.4, 1)
          .translate(0, 0.07 + tall, -0.07),
        SNOW,
        { at, rot },
      );
      m.add(ball(0.03, 6).scale(1.2, 0.5, 1.4).translate(0, 0.075, 0.08), SNOW, { at, rot });
    }
  }
  if (snow && kind < 2) m.add(ball(0.025, 6).scale(1.2, 0.5, 1.4).translate(0, 0.075, 0.08), SNOW, { at, rot });
}

/** A low rack by the door: a boot tray on the floor (boots in it), a slatted shelf of shoes, a
 *  bench-top board with a pair and a hat or gloves by its seed. Oak or black steel. `wet` (the
 *  weather): snow on the boots, meltwater in the tray. */
export function shoeRack(m: Model, o: WetLook) {
  const steel = o.look === 1;
  const frame = steel ? P.ash : P.oak;
  const snow = o.wet === true;
  const [z0, z1] = [0.3, 0.68];
  const cz = (z0 + z1) / 2;
  for (const x of [0.085, 0.915]) {
    if (steel) {
      for (const z of [z0 + 0.015, z1 - 0.015]) m.add(box([0.02, 0.64, 0.02]), frame, { at: [x, 0.32, z] });
      for (const y of [0.02, 0.4]) m.add(box([0.02, 0.02, z1 - z0]), frame, { at: [x, y, cz] });
    } else m.add(box([0.03, 0.64, z1 - z0], 0.004), frame, { at: [x, 0.32, cz] });
  }
  // the bench top
  m.add(box([0.86, 0.03, z1 - z0 + 0.02], 0.005), steel ? P.oak : P.oakLight, { at: [0.5, 0.655, cz] });
  // the shelf's slats
  for (let i = 0; i < 4; i++) m.add(box([0.8, 0.016, 0.06], 0.003), frame, { at: [0.5, 0.39, z0 + 0.05 + i * 0.093] });
  // the tray on the floor
  m.add(box([0.8, 0.012, z1 - z0], 0.003), P.rubber, { at: [0.5, 0.006, cz] });
  for (const z of [z0 + 0.005, z1 - 0.005]) m.add(box([0.8, 0.026, 0.01]), P.rubber, { at: [0.5, 0.013, z] });
  for (const x of [0.105, 0.895]) m.add(box([0.01, 0.026, z1 - z0]), P.rubber, { at: [x, 0.013, cz] });
  if (snow) {
    m.add(box([0.6, 0.002, 0.26]), PUDDLE, { at: [0.48, 0.013, cz] });
    for (const [x, z] of [
      [0.3, 0.42],
      [0.66, 0.55],
      [0.5, 0.36],
    ])
      m.add(ball(0.012, 5).scale(1, 0.3, 1), SNOW, { at: [x, 0.016, z] });
  }
  const r = rng(o.seed);
  const LEATHER = [0x6b4128, 0x3a2a20, 0x8a4e2c, 0x2b2a28];
  const TRAIN = [0x3f5f8a, 0xc4402b, 0x2b2a28, 0xd9a441, 0xe6e4de];
  // two pairs of boots in the tray: walking boots, wellies
  const boots: [number, number][] = [
    [2, LEATHER[Math.floor(r() * 4)]],
    [r() < 0.5 ? 3 : 2, r() < 0.5 ? 0x2f4a3a : 0x2b2a28],
  ];
  boots.forEach(([kind, c], i) => {
    const x = 0.28 + i * 0.42;
    for (const s of [-1, 1]) shoe(m, x + s * 0.055, 0.012, cz, kind, c, s * 0.05 + (r() - 0.5) * 0.08, snow);
  });
  // shoes on the shelf, a pair on the top
  for (const [y, n] of [
    [0.398, 3],
    [0.67, 1],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const kind = r() < 0.5 ? 0 : 1;
      const c = kind === 0 ? TRAIN[Math.floor(r() * 5)] : LEATHER[Math.floor(r() * 4)];
      const x = n === 3 ? 0.22 + i * 0.28 : 0.3;
      for (const s of [-1, 1]) shoe(m, x + s * 0.05, y, cz, kind, c, s * 0.04, false);
    }
  }
  // on the top beside them: a hat, or a pair of gloves, by the seed
  if (r() < 0.5) {
    m.add(cyl(0.11, 0.11, 0.012, 16), P.ink, { at: [0.7, 0.672, cz] });
    m.add(
      lathe(
        [
          [0.07, 0],
          [0.072, 0.06],
          [0.06, 0.09],
          [0, 0.095],
        ],
        14,
      ),
      P.ink,
      { at: [0.7, 0.684, cz] },
    );
    m.add(cyl(0.073, 0.073, 0.016, 14), P.oxblood, { at: [0.7, 0.684, cz] });
  } else {
    for (const s of [-1, 1])
      m.add(cushion([0.09, 0.025, 0.17], 0.2, 1), [0xc4402b, 0x3f5f8a][Math.floor(o.seed * 2)], {
        at: [0.7 + s * 0.05, 0.683, cz],
        rot: [0, s * 0.3, 0],
      });
  }
}

// ── the umbrella stand (1×1) ─────────────────────────────────────────────────────────────────────
/** A closed umbrella from its ferrule in the stand (at its origin) up: the folded canopy (its faces
 *  the folds), its strap, the shaft and a crook handle. */
function brolly(c: number, handle: number, wet: boolean): [BufferGeometry, number][] {
  const out: [BufferGeometry, number][] = [];
  const cc = wet ? shade(c, 0.82) : c;
  out.push([cyl(0.006, 0.006, 0.07, 6), P.steelLight]);
  out.push([
    lathe(
      [
        [0.008, 0.06],
        [0.02, 0.2],
        [0.036, 0.42],
        [0.046, 0.58],
        [0.032, 0.67],
        [0.008, 0.71],
      ],
      7,
    ),
    cc,
  ]);
  out.push([box([0.1, 0.03, 0.012]).translate(0, 0.56, 0.044), shade(cc, 0.75)]);
  out.push([ball(0.008, 5).translate(0, 0.56, 0.05), P.chrome]);
  out.push([cyl(0.006, 0.006, 0.14, 6).translate(0, 0.7, 0), P.steel]);
  out.push([
    tube(
      [
        [0, 0.83, 0],
        [0, 0.9, 0],
        [0.035, 0.94, 0],
        [0.07, 0.905, 0],
        [0.068, 0.87, 0],
      ],
      0.011,
      5,
      10,
    ),
    handle,
  ]);
  if (wet)
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const y = 0.46 + ((i * 37) % 11) * 0.018;
      const rr = (y < 0.58 ? 0.036 + ((y - 0.42) / 0.16) * 0.01 : 0.046 - ((y - 0.58) / 0.09) * 0.014) + 0.003;
      out.push([ball(0.006, 4).translate(Math.cos(a) * rr, y, Math.sin(a) * rr), 0xdfe9ee]);
    }
  return out;
}

/** A tall stand by the door, brass with its bands or blue-and-white ceramic: two or three umbrellas
 *  in it leaning out (their colours by the seed), sometimes a walking stick. `wet` (the weather):
 *  rain on them, their cloth darker, a drip pool round its foot. */
export function umbrellaStand(m: Model, o: WetLook) {
  const ceramic = o.look === 1;
  const wet = o.wet === true;
  const c = ceramic ? P.paperWhite : P.brass;
  const band = ceramic ? 0x2f4a8a : shade(P.brass, 0.7);
  m.add(
    lathe(
      [
        [0, 0],
        [0.115, 0],
        [0.125, 0.02],
        [0.115, 0.06],
        [0.11, 0.42],
        [0.13, 0.48],
        [0.135, 0.5],
        [0.122, 0.5],
        [0.105, 0.48],
        [0, 0.48],
      ],
      18,
    ),
    c,
    { at: [0.5, 0, 0.5] },
  );
  for (const y of [0.08, 0.4]) m.add(ring(0.114, 0.008, 3, 18), band, { at: [0.5, y, 0.5] });
  if (ceramic) {
    // its sprigs, round the middle
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      for (let k = 0; k < 3; k++)
        m.add(box([0.018, 0.018, 0.004]), 0x2f4a8a, {
          at: [0.5 + Math.cos(a) * 0.112, 0.2 + k * 0.05 + (i % 2) * 0.025, 0.5 + Math.sin(a) * 0.112],
          rot: [0, Math.PI / 2 - a, 0.785],
        });
    }
  } else {
    // a lion's-head ring on its front
    m.add(ball(0.022, 8).scale(1, 1, 0.5), shade(P.brass, 0.8), { at: [0.5, 0.33, 0.613] });
    m.add(ring(0.022, 0.004, 3, 12).rotateX(Math.PI / 2), P.brass, { at: [0.5, 0.3, 0.617] });
  }
  m.add(cyl(0.106, 0.106, 0.004, 16), 0x1d1c1a, { at: [0.5, 0.472, 0.5] });
  if (wet) m.add(cyl(0.2, 0.2, 0.002, 18).scale(1, 1, 0.85), PUDDLE, { at: [0.5, 0.001, 0.52] });
  // the umbrellas (their slots fixed: the colours, a stick in the third by the seed)
  const r = rng(o.seed);
  const CANOPY = [0x2b2a28, 0x22324a, 0xc4402b, 0x2f5a3d, 0xd9a441, 0x6a4a7a];
  const HANDLE = [P.walnut, P.ink, P.cognac];
  const slots: [number, number][] = [
    [0.4, 0.13],
    [2.5, 0.15],
    [4.4, 0.1],
  ];
  slots.forEach(([a, tilt], i) => {
    const at: V3 = [0.5 - Math.sin(a) * 0.03, 0.03, 0.5 - Math.cos(a) * 0.03];
    const rot: V3 = [tilt, a, 0];
    if (i === 2 && r() < 0.45) {
      // a walking stick
      m.add(cyl(0.006, 0.006, 0.04, 6), P.rubber, { at, rot });
      m.add(cyl(0.011, 0.012, 0.82, 8).translate(0, 0.04, 0), P.walnutDark, { at, rot });
      m.add(
        tube(
          [
            [0, 0.86, 0],
            [0.01, 0.92, 0],
            [0.05, 0.94, 0],
            [0.08, 0.91, 0],
          ],
          0.012,
          5,
          8,
        ),
        P.walnutDark,
        { at, rot },
      );
      return;
    }
    const col = CANOPY[Math.floor(r() * CANOPY.length)];
    for (const [g, k] of brolly(col, HANDLE[Math.floor(r() * 3)], wet)) m.add(g, k, { at, rot });
  });
}

// ── the cassette wall rack (wall, 1×1) ───────────────────────────────────────────────────────────
/** A rack on the wall in two banks, five columns each, the tapes lying in their slots spines out
 *  (their J-cards' colours, a label on some, a few slots empty, one pulled out) — by the seed; on
 *  its top ledge a personal stereo and its headphones, or a little cactus. Walnut or black. */
export function cassetteRack(m: Model, o: Look) {
  // (the life look: the cassettes' cases are plastic, not cloth)
  m.finishes([...SPINES, ...ALBUM].map((c): [number, "gloss"] => [c, "gloss"]));
  const wood = o.look === 1 ? P.ash : P.walnut;
  const [x0, x1, y0, y1] = [0.14, 0.86, 1.04, 1.88];
  const D = 0.09;
  const cz = FACE + D / 2;
  m.add(box([x1 - x0, y1 - y0, 0.012]), shade(wood, 0.62), { at: [0.5, (y0 + y1) / 2, FACE + 0.006] });
  for (const x of [x0 + 0.01, x1 - 0.01]) m.add(box([0.02, y1 - y0, D], 0.003), wood, { at: [x, (y0 + y1) / 2, cz] });
  m.add(box([x1 - x0, 0.02, D], 0.003), wood, { at: [0.5, y0 + 0.01, cz] });
  m.add(box([x1 - x0 + 0.04, 0.022, D + 0.03], 0.004), wood, { at: [0.5, y1 + 0.011, FACE + (D + 0.03) / 2] });
  const MID = 1.46;
  m.add(box([x1 - x0 - 0.04, 0.016, D]), wood, { at: [0.5, MID, cz] });
  const cols = 5;
  const cw = (x1 - x0 - 0.04) / cols;
  for (let i = 1; i < cols; i++)
    m.add(box([0.006, y1 - y0 - 0.02, D - 0.004]), shade(wood, 0.85), { at: [x0 + 0.02 + i * cw, (y0 + y1) / 2, cz] });
  const r = rng(o.seed);
  const pulledCol = Math.floor(r() * cols);
  const pulledRow = Math.floor(r() * 18);
  for (const [b0, b1] of [
    [y0 + 0.02, MID - 0.008],
    [MID + 0.008, y1],
  ])
    for (let i = 0; i < cols; i++) {
      const cx = x0 + 0.02 + (i + 0.5) * cw;
      let row = 0;
      for (let y = b0; y + 0.0175 <= b1; y += 0.0195, row++) {
        if (r() < 0.08) continue;
        const out = i === pulledCol && row === pulledRow && b0 > MID ? 0.045 : 0;
        const c = SPINES[Math.floor(r() * SPINES.length)];
        const zf = FACE + D - 0.003 + out;
        m.add(box([0.109, 0.0172, 0.07]), c, { at: [cx, y + 0.0088, zf - 0.035] });
        if (r() < 0.45) {
          m.add(box([0.075, 0.008, 0.002]), P.cream, { at: [cx, y + 0.0088, zf + 0.0005] });
          if (r() < 0.7)
            m.add(box([0.02 + r() * 0.04, 0.0018, 0.001]), P.ink, { at: [cx - 0.01, y + 0.0088, zf + 0.0018] });
        }
      }
    }
  // on its top ledge
  const T = y1 + 0.022;
  if (o.seed > 0.5) {
    m.add(box([0.11, 0.08, 0.03], 0.004), [0xc9c6bf, 0x3f5f8a][Math.floor(r() * 2)], {
      at: [0.32, T + 0.04, FACE + 0.06],
    });
    m.add(box([0.07, 0.044, 0.002]), P.glass, { at: [0.32, T + 0.045, FACE + 0.0755] });
    m.add(box([0.05, 0.028, 0.002]), shade(SPINES[1], 0.9), { at: [0.32, T + 0.045, FACE + 0.0765] });
    m.add(
      tube(
        [
          [0.55, T + 0.03, FACE + 0.06],
          [0.6, T + 0.11, FACE + 0.06],
          [0.68, T + 0.11, FACE + 0.06],
          [0.73, T + 0.03, FACE + 0.06],
        ],
        0.005,
        4,
        10,
      ),
      P.ink,
    );
    for (const x of [0.55, 0.73])
      m.add(rod(0.024, 0.024, 0.016, "x", 10), 0xd9a441, { at: [x, T + 0.026, FACE + 0.06] });
  } else {
    m.add(cyl(0.03, 0.026, 0.04, 10), P.terracotta, { at: [0.7, T, FACE + 0.06] });
    m.add(
      lathe(
        [
          [0.02, 0],
          [0.024, 0.04],
          [0.016, 0.08],
          [0, 0.09],
        ],
        8,
      ),
      P.leafYoung,
      { at: [0.7, T + 0.04, FACE + 0.06] },
    );
  }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  record_crates: recordCrates,
  plan_chest: planChest,
  display_cabinet: displayCabinet,
  ladder_bookcase: ladderBookcase,
  mail_cubbies: mailCubbies,
  office_safe: officeSafe,
  shoe_rack: shoeRack,
  umbrella_stand: umbrellaStand,
  cassette_rack: cassetteRack,
};
