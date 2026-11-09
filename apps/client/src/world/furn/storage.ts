import { ball, box, type Look, lathe, leaf, type Model, rod, tube } from "./kit";
import { P, shade } from "./palette";

// Storage (docs/plan/67-the-furniture.md, phase 3), in the kit's frame: x across the footprint, z
// down it, y up, its open front to +z (the catalog's rot 0: it faces south). Small things repeated by
// the hundred (spines, cassettes, cases) are plain boxes: a rounded one is nine times the triangles.
// What's on the shelves —
// the books' colours, how the tapes stand — comes from its seed (its id), the same piece always the
// same. Heights: shared furniture.ts SURFACE_NEXT / STAND_NEXT.

export const STORAGE_LOOKS = {
  cupboard: ["Cupboard"],
  bookcase: ["Walnut bookcase", "Oak bookcase", "Painted bookcase"],
  tape_shelf: ["Walnut tape shelf", "Oak tape shelf", "Black tape shelf"],
  locker: ["Locker"],
  cart_shelf: ["Cartridge shelf"],
  disc_rack: ["Black disc tower", "Walnut disc tower"],
} as const;

const SPINES = [0x8a2f2a, 0xc9a24a, 0x3f5f8a, 0x5f7a3a, 0xe6dcc4, 0x6a4a7a, 0xb5562f, 0x2b2a28, 0xd6c9a6, 0x3d7f8a];
const WOODS = [P.walnut, P.oakLight, P.cream];

/** A seeded run of numbers (0..1), the same for the same seed. */
function rng(seed: number): () => number {
  let s = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

/** An open carcass (x0..x1, its depth d from z0, h tall): sides, top, bottom, a back, `n` shelves
 *  at `ys`. */
function carcass(
  m: Model,
  x0: number,
  x1: number,
  z0: number,
  d: number,
  h: number,
  ys: number[],
  wood: number,
  th = 0.022,
) {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const cz = z0 + d / 2;
  for (const x of [x0 + th / 2, x1 - th / 2]) m.add(box([th, h, d], 0.004), wood, { at: [x, h / 2, cz] });
  m.add(box([w, th, d], 0.004, 2), wood, { at: [cx, h - th / 2, cz] });
  m.add(box([w - 2 * th, 0.06, d - 0.02], 0.004), shade(wood, 0.8), { at: [cx, 0.03, cz + 0.01] });
  m.add(box([w - 2 * th, h - 0.06, 0.01]), shade(wood, 0.62), { at: [cx, h / 2 + 0.03, z0 + 0.005] });
  for (const y of ys) m.add(box([w - 2 * th, th * 0.8, d - 0.02], 0.003), wood, { at: [cx, y, cz + 0.01] });
}

// ── the cupboard (1×1) ────────────────────────────────────────────────────────────────────────────
/** A cream cupboard: two panelled doors, brass knobs, a walnut top overhanging. Top 0.85 (the
 *  coffee machine's). */
export function cupboard(m: Model, _o: Look) {
  const H = 0.85;
  m.add(box([0.8, 0.07, 0.66], 0.004), P.walnutDark, { at: [0.5, 0.035, 0.49] });
  m.add(box([0.84, H - 0.1, 0.72], 0.006, 2), P.creamDark, { at: [0.5, 0.07 + (H - 0.1) / 2, 0.48] });
  for (const s of [-1, 1]) {
    const x = 0.5 + s * 0.205;
    m.add(box([0.39, H - 0.16, 0.02], 0.004), P.cream, { at: [x, 0.07 + (H - 0.1) / 2, 0.85] });
    m.add(box([0.29, H - 0.3, 0.008], 0.002), shade(P.cream, 0.93), { at: [x, 0.07 + (H - 0.1) / 2, 0.862] });
    m.add(ball(0.015), P.brass, { at: [0.5 + s * 0.04, 0.6, 0.87] });
  }
  m.add(box([0.92, 0.035, 0.8], 0.008, 2), P.walnut, { at: [0.5, H - 0.0175, 0.5] });
}

// ── the bookcase (2×1) ────────────────────────────────────────────────────────────────────────────
/** Open shelves to 1.8 m, full of books leaning and stacked, a trailing plant on one. Three
 *  finishes. Its top 1.8 takes things too (the middle of it: catalog `top`). */
export function bookcase(m: Model, o: Look) {
  const wood = WOODS[o.look] ?? WOODS[0];
  const H = 1.8;
  const z0 = 0.31;
  const d = 0.36;
  const ys = [0.42, 0.78, 1.14, 1.48];
  carcass(m, 0.04, 1.96, z0, d, H, ys, wood);
  const r = rng(o.seed);
  const plantOn = 2 + Math.floor(r() * 2);
  const bottoms = [0.06, ...ys.map((y) => y + 0.009)];
  bottoms.forEach((y0, shelf) => {
    const room = (shelf < ys.length ? ys[shelf] : H - 0.022) - y0;
    let x = 0.08;
    const end = 1.93;
    while (x < end - 0.03) {
      if (shelf === plantOn && x > 1.3 && x < 1.5) {
        // a terracotta pot, its trailing leaves over the edge
        m.add(
          lathe(
            [
              [0, 0],
              [0.06, 0],
              [0.075, 0.12],
              [0.07, 0.12],
            ],
            10,
          ),
          P.terracotta,
          { at: [x + 0.09, y0, z0 + 0.2] },
        );
        for (let i = 0; i < 5; i++)
          m.add(leaf(0.09, 0.06, 0.2, 0.6, 3), P.leaf, {
            at: [x + 0.09, y0 + 0.11, z0 + 0.2],
            rot: [0.9, i * 1.25, 0],
          });
        x += 0.2;
        continue;
      }
      if (r() < 0.12 && x + 0.26 < end) {
        // a stack lying flat
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++)
          m.add(box([0.2 + r() * 0.03, 0.03, 0.22]), SPINES[Math.floor(r() * SPINES.length)], {
            at: [x + 0.12, y0 + 0.015 + i * 0.03, z0 + 0.2],
            rot: [0, (r() - 0.5) * 0.15, 0],
          });
        x += 0.27;
        continue;
      }
      const w = Math.min(0.025 + r() * 0.035, end - x);
      const h = Math.min(room - 0.03, 0.2 + r() * 0.1);
      const lean = x > 0.1 && x < end - 0.1 && r() < 0.08 ? 0.18 : 0;
      const c = SPINES[Math.floor(r() * SPINES.length)];
      m.add(box([w, h, 0.2 + r() * 0.05]), c, { at: [x + w / 2, y0 + h / 2, z0 + 0.2], rot: [0, 0, -lean] });
      if (r() < 0.4)
        m.add(box([w + 0.001, 0.012, 0.002]), shade(c, 1.5), {
          at: [x + w / 2, y0 + h * 0.75, z0 + 0.3 + 0.026],
          rot: [0, 0, -lean],
        });
      x += w + 0.003 + (lean ? 0.04 : 0) + (r() < 0.06 ? 0.08 : 0);
    }
  });
}

// ── the tape shelf (2×1) ──────────────────────────────────────────────────────────────────────────
/** A low unit to 1.12 m, three shelves of cassettes standing in their cases. Three finishes. */
export function tapeShelf(m: Model, o: Look) {
  // (the life look: the cases' spines are plastic, not the cloth their colours are elsewhere)
  m.finishes(SPINES.map((c): [number, "gloss"] => [c, "gloss"]));
  const wood = [P.walnut, P.oakLight, P.ash][o.look] ?? P.walnut;
  const H = 1.12;
  const z0 = 0.31;
  const d = 0.36;
  const ys = [0.3, 0.56, 0.82];
  carcass(m, 0.04, 1.96, z0, d, H, ys, wood);
  const r = rng(o.seed);
  for (const y0 of [0.06, ...ys.map((y) => y + 0.009)]) {
    let x = 0.08;
    while (x < 1.9) {
      const tall = r() < 0.2;
      const c = SPINES[Math.floor(r() * SPINES.length)];
      // a case on its edge: its J-card's spine in a colour; a cream label on some
      m.add(box([0.017, tall ? 0.11 : 0.107, 0.07]), c, { at: [x + 0.0085, y0 + 0.055, z0 + 0.25] });
      if (r() < 0.35) m.add(box([0.013, 0.05, 0.002]), P.cream, { at: [x + 0.0085, y0 + 0.06, z0 + 0.286] });
      x += 0.019 + (r() < 0.07 ? 0.07 : 0);
    }
  }
}

// ── the locker (1×1) ──────────────────────────────────────────────────────────────────────────────
/** A green steel locker to 1.85 m: two doors with vents, handles and number plates, on a plinth
 *  (the night's supply kit is in it: plan 30). */
export function locker(m: Model, o: Look) {
  const H = 1.85;
  const c = o.fabric ?? P.lockerGreen;
  m.add(box([0.78, 0.08, 0.5], 0.004), P.ink, { at: [0.5, 0.04, 0.5] });
  m.add(box([0.8, H - 0.08, 0.52], 0.006, 2), shade(c, 0.88), { at: [0.5, 0.08 + (H - 0.08) / 2, 0.5] });
  for (const s of [-1, 1]) {
    const x = 0.5 + s * 0.195;
    m.add(box([0.37, H - 0.16, 0.012], 0.003), c, { at: [x, 0.08 + (H - 0.08) / 2, 0.762] });
    for (let i = 0; i < 6; i++) m.add(box([0.2, 0.008, 0.004]), P.ink, { at: [x, H - 0.2 - i * 0.025, 0.77] });
    for (let i = 0; i < 4; i++) m.add(box([0.2, 0.008, 0.004]), P.ink, { at: [x, 0.22 + i * 0.025, 0.77] });
    m.add(box([0.016, 0.12, 0.02], 0.004), P.chrome, { at: [0.5 + s * 0.03, 1.0, 0.78] });
    m.add(box([0.07, 0.03, 0.003]), P.alum, { at: [x, H - 0.1, 0.77] });
    m.add(box([0.04, 0.012, 0.002]), P.ink, { at: [x, H - 0.1, 0.772] });
  }
}

// ── the cartridge shelf (2×1) ─────────────────────────────────────────────────────────────────────
/** A low walnut shelf to 0.8 m, two rows of game cartridges standing up, labels out. */
export function cartShelf(m: Model, o: Look) {
  const H = 0.8;
  const z0 = 0.26;
  const d = 0.48;
  carcass(m, 0.06, 1.94, z0, d, H, [0.4], P.walnut);
  const r = rng(o.seed);
  for (const y0 of [0.06, 0.409]) {
    let x = 0.1;
    while (x < 1.82) {
      const grey = r() < 0.5;
      const w = 0.09;
      m.add(box([w - 0.006, 0.11, 0.022]), grey ? 0xa8a398 : 0x2b2a28, { at: [x + w / 2, y0 + 0.055, z0 + 0.3] });
      m.add(box([w - 0.03, 0.06, 0.002]), SPINES[Math.floor(r() * SPINES.length)], {
        at: [x + w / 2, y0 + 0.06, z0 + 0.312],
      });
      x += w + (r() < 0.1 ? 0.06 : 0.004);
    }
  }
}

// ── the disc tower (1×1) ──────────────────────────────────────────────────────────────────────────
/** A tower of CD cases to 1.38 m: its sides windowed, the cases' spines out front in their colours.
 *  Black or walnut. */
export function discRack(m: Model, o: Look) {
  // (the life look: the cases' spines are plastic, not the cloth their colours are elsewhere)
  m.finishes(SPINES.map((c): [number, "gloss"] => [c, "gloss"]));
  const frame = o.look === 1 ? P.walnut : P.ash;
  const H = 1.38;
  const x0 = 0.27;
  const w = 0.46;
  const z0 = 0.35;
  const d = 0.3;
  m.add(box([w, 0.05, d], 0.006), frame, { at: [0.5, 0.025, z0 + d / 2] });
  m.add(box([w, 0.03, d], 0.006), frame, { at: [0.5, H - 0.015, z0 + d / 2] });
  for (const x of [x0 + 0.0175, x0 + w - 0.0175]) {
    m.add(box([0.035, H - 0.08, d], 0.004), frame, { at: [x, H / 2, z0 + d / 2] });
    m.add(box([0.037, H - 0.3, d - 0.12]), P.ink, { at: [x, H / 2, z0 + d / 2] });
  }
  m.add(box([w - 0.07, H - 0.08, 0.01]), shade(frame, 0.7), { at: [0.5, H / 2, z0 + 0.005] });
  const r = rng(o.seed);
  for (let y = 0.06; y < H - 0.05; y += 0.0105) {
    if (r() < 0.08) continue; // a gap: one's out
    m.add(box([w - 0.08, 0.0095, 0.13]), SPINES[Math.floor(r() * SPINES.length)], {
      at: [0.5, y + 0.005, z0 + d - 0.07],
    });
  }
  for (let y = 0.3; y < H - 0.2; y += 0.38)
    m.add(rod(0.004, 0.004, w - 0.07, "x", 6), P.chrome, { at: [0.5, y, z0 + d - 0.004] });
  m.add(
    tube(
      [
        [x0 + 0.05, 0.05, z0 + d],
        [0.5, 0.04, z0 + d + 0.02],
        [x0 + w - 0.05, 0.05, z0 + d],
      ],
      0.004,
      4,
      6,
    ),
    frame,
  );
}
