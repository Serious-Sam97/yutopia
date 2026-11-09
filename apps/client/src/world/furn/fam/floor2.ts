import { glyphDots } from "@yutopia/shared/glyphs";
import { type BufferGeometry, Float32BufferAttribute, BufferGeometry as Geo } from "three";
import { box, cyl, extrude, type Look, type Model, merged, quads, ring, type V3 } from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 15 (docs/plan/68-more-furniture.md): Rugs & floor — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/floor2.ts. Rugs flat on the floor as decor.ts lays
// its rug (a round one, a runner, a cowhide), a puzzle mat, a welcome mat, a dance floor whose tiles
// light in patterns, stage risers and their steps (stood on), tape lanes and decals on the floor.

export const LOOKS: Record<string, readonly string[]> = {
  round_rug: ["Medallion round", "Braided", "Shag round"],
  runner_rug: ["Kilim runner", "Striped runner", "Persian runner"],
  cowhide: ["Black and white", "Brown and white", "Speckled tan"],
  puzzle_mat: ["Rainbow ABC", "Pastel", "Grey and white"],
  welcome_mat: ["Coir, WELCOME", "Rubber, HELLO", "Striped cotton"],
  dance_floor: ["Disco", "Warm white", "Neon grid"],
  stage_riser: ["Black carpet", "Oak boards", "Steel deck"],
  stage_steps: ["Black carpet", "Oak boards", "Steel deck"],
  floor_tape: ["Yellow lane", "Hazard stripes", "Walkway"],
  floor_decal: ["Arrow", "Star", "Stand here", "X marks the spot"],
};

const GOLDEN = 2.39996;
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
/** Words in the shared dot face, flat on the floor reading toward +z: from (x, z) its top-left, each
 *  dot `p` across, at height y — or null for none (xmas.ts's dotText, laid down). */
function floorText(text: string, x: number, z: number, y: number, p: number): BufferGeometry | null {
  const pos: number[] = [];
  const d = p * 0.82;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) {
      const x0 = x + (i * 6 + c) * p;
      const z0 = z + r * p;
      pos.push(x0, y, z0, x0, y, z0 + d, x0 + d, y, z0 + d, x0, y, z0, x0 + d, y, z0 + d, x0 + d, y, z0);
    }
  return pos.length ? geo(pos) : null;
}
/** Words centred on (cx, cz), `p` a dot. */
function centredText(m: Model, text: string, cx: number, cz: number, y: number, p: number, c: number) {
  const w = (text.length * 6 - 1) * p;
  const g = floorText(text, cx - w / 2, cz - 3.5 * p, y, p);
  if (g) m.add(g, c);
}
/** A flat patch on the floor, x0..x1 × z0..z1, at height y (its top). */
const flat = (m: Model, x0: number, z0: number, x1: number, z1: number, y: number, c: number) =>
  m.add(box([x1 - x0, 0.002, z1 - z0]), c, { at: [(x0 + x1) / 2, y - 0.001, (z0 + z1) / 2] });
/** A diamond lying flat, rx across, rz down. */
const diamond = (m: Model, x: number, z: number, rx: number, rz: number, y: number, c: number) =>
  m.add(cyl(rz, rz, 0.002, 4), c, { at: [x, y - 0.002, z], scale: [rx / rz, 1, 1] });

// ── the round rug (3×3) ────────────────────────────────────────────────────────────────────────────
function roundRug(m: Model, o: Look) {
  m.only("carpet");
  const [cx, cz] = [1.5, 1.5];
  const R = 1.4;
  if (o.look === 1) {
    // braided: a rope coiled round and round, its strands in turn
    const c = o.fabric ?? 0x8a6a4a;
    const cols = [c, P.cream, shade(c, 0.7), 0xb8a888];
    m.add(cyl(R - 0.02, R - 0.02, 0.008, 40), shade(c, 0.6), { at: [cx, 0, cz] });
    for (let k = 1; k <= 20; k++) {
      const r = k * 0.069;
      m.add(ring(r, 0.036, 3, Math.max(12, Math.round(r * 40))), cols[(k + (k > 16 ? 1 : 0)) % cols.length], {
        at: [cx, 0.018, cz],
        scale: [1, 0.5, 1],
        tone: 0.92 + (k % 2) * 0.1,
      });
    }
    return;
  }
  if (o.look === 2) {
    // shag: a deep pile, its tufts every way
    const c = o.fabric ?? 0xd8cfbc;
    m.add(cyl(R, R, 0.028, 48), c, { at: [cx, 0, cz] });
    for (let i = 0; i < 230; i++) {
      const a = i * GOLDEN;
      const r = Math.sqrt((i + 0.5) / 230) * (R - 0.06);
      m.add(cyl(0.035, 0.012, 0.035, 4), shade(c, 0.85 + rnd(i, 3, 0.4) * 0.3), {
        at: [cx + Math.cos(a) * r, 0.022, cz + Math.sin(a) * r],
        rot: [rnd(i, 1, 0.4) * 0.5, rnd(i, 4, 0.4) * 3, rnd(i, 2, 0.4) * 0.5],
      });
    }
    return;
  }
  // a medallion: its border, the field (the paint), rings and a star of petals round its middle
  const field = o.fabric ?? 0x2f4a6a;
  m.add(cyl(R, R, 0.008, 56), 0x6e2f22, { at: [cx, 0, cz] });
  const disc = (r: number, y: number, c: number, n = 48) => m.add(cyl(r, r, 0.002, n), c, { at: [cx, y - 0.002, cz] });
  disc(R - 0.06, 0.0095, P.cream);
  disc(R - 0.1, 0.01, 0x6e2f22);
  // the border's little diamonds
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    m.add(cyl(0.025, 0.025, 0.002, 4), 0xd9a441, {
      at: [cx + Math.cos(a) * (R - 0.08), 0.0098, cz + Math.sin(a) * (R - 0.08)],
      rot: [0, -a, 0],
    });
  }
  disc(R - 0.16, 0.0105, field);
  disc(0.75, 0.011, 0xd9a441);
  disc(0.71, 0.0115, field);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    m.add(cyl(0.18, 0.18, 0.002, 4), i % 2 ? P.cream : 0xd9a441, {
      at: [cx + Math.cos(a) * 0.42, 0.0118, cz + Math.sin(a) * 0.42],
      rot: [0, -a, 0],
      scale: [1.6, 1, 0.55],
    });
  }
  disc(0.24, 0.012, 0x6e2f22);
  disc(0.16, 0.0125, P.cream);
  disc(0.08, 0.013, field);
  // a ring of leaves out in the field
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    m.add(cyl(0.06, 0.06, 0.002, 6), i % 2 ? P.olive : shade(field, 1.35), {
      at: [cx + Math.cos(a) * 1.02, 0.0112, cz + Math.sin(a) * 1.02],
      rot: [0, -a, 0],
      scale: [1, 1, 2],
    });
  }
}

// ── the runner (4×1) ───────────────────────────────────────────────────────────────────────────────
function runnerRug(m: Model, o: Look) {
  m.only("carpet");
  const [x0, x1, z0, z1] = [0.2, 3.8, 0.1, 0.9];
  const fringe = (c: number) => {
    for (let i = 0; i < 14; i++)
      for (const x of [x0 - 0.06, x1 + 0.06])
        m.add(box([0.12, 0.004, 0.012]), c, { at: [x, 0.002, z0 + 0.04 + i * 0.056] });
  };
  if (o.look === 1) {
    // striped: a woven flatweave, bands across it
    const c = o.fabric ?? 0x3f5a6a;
    m.add(box([x1 - x0, 0.008, z1 - z0]), P.cream, { at: [2, 0.004, 0.5] });
    for (let i = 0; i < 9; i++) {
      const x = x0 + 0.2 + i * 0.4;
      flat(m, x, z0, x + 0.12, z1, 0.0095, i % 3 === 1 ? 0xd9a441 : c);
      flat(m, x + 0.16, z0, x + 0.19, z1, 0.0095, shade(c, 0.6));
    }
    for (const z of [z0 + 0.05, z1 - 0.05]) flat(m, x0, z - 0.012, x1, z + 0.012, 0.01, shade(c, 0.6));
    fringe(P.cream);
    return;
  }
  if (o.look === 2) {
    // Persian: a border round a field (the paint) with three medallions down it
    const field = o.fabric ?? 0x7a2a26;
    m.add(box([x1 - x0, 0.008, z1 - z0]), 0x2a2a3a, { at: [2, 0.004, 0.5] });
    flat(m, x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05, 0.0095, 0xd9a441);
    flat(m, x0 + 0.08, z0 + 0.08, x1 - 0.08, z1 - 0.08, 0.01, field);
    for (const x of [0.9, 2, 3.1]) {
      diamond(m, x, 0.5, 0.42, 0.27, 0.0115, 0x2a2a3a);
      diamond(m, x, 0.5, 0.32, 0.2, 0.012, P.cream);
      diamond(m, x, 0.5, 0.2, 0.12, 0.0125, field);
      m.add(cyl(0.04, 0.04, 0.002, 8), 0xd9a441, { at: [x, 0.0125, 0.5] });
    }
    for (let i = 0; i < 18; i++)
      m.add(box([0.05, 0.002, 0.03]), P.cream, { at: [x0 + 0.15 + i * 0.193, 0.0105, z0 + 0.065] });
    for (let i = 0; i < 18; i++)
      m.add(box([0.05, 0.002, 0.03]), P.cream, { at: [x0 + 0.15 + i * 0.193, 0.0105, z1 - 0.065] });
    fringe(P.cream);
    return;
  }
  // kilim: bands along it, stepped diamonds down its middle
  const field = o.fabric ?? P.rust;
  m.add(box([x1 - x0, 0.008, z1 - z0]), field, { at: [2, 0.004, 0.5] });
  const bands: [number, number, number][] = [
    [z0, z0 + 0.06, P.ink],
    [z0 + 0.06, z0 + 0.12, P.cream],
    [z0 + 0.12, z0 + 0.16, 0xd9a441],
    [z1 - 0.16, z1 - 0.12, 0xd9a441],
    [z1 - 0.12, z1 - 0.06, P.cream],
    [z1 - 0.06, z1, P.ink],
  ];
  for (const [a, b, c] of bands) flat(m, x0, a, x1, b, 0.0095, c);
  for (let i = 0; i < 8; i++) {
    const x = x0 + 0.25 + i * 0.444;
    diamond(m, x, 0.5, 0.18, 0.2, 0.0105, i % 2 ? P.cream : 0x3f4a5a);
    diamond(m, x, 0.5, 0.1, 0.11, 0.011, i % 2 ? 0x3f4a5a : 0xd9a441);
    if (i < 7) diamond(m, x + 0.222, 0.5, 0.05, 0.06, 0.0105, P.ink);
  }
  fringe(P.cream);
}

// ── the cowhide (2×2) ──────────────────────────────────────────────────────────────────────────────
/** The hide's outline round (1, 1), metres (x, z): its shoulders, the four legs, the neck, the tail. */
const HIDE: [number, number][] = [
  [0.0, -0.78],
  [0.22, -0.72],
  [0.34, -0.84],
  [0.52, -0.88],
  [0.56, -0.7],
  [0.6, -0.45],
  [0.66, -0.2],
  [0.68, 0.15],
  [0.64, 0.42],
  [0.7, 0.66],
  [0.84, 0.86],
  [0.6, 0.86],
  [0.36, 0.74],
  [0.1, 0.8],
  [0.0, 0.88],
  [-0.1, 0.8],
  [-0.36, 0.74],
  [-0.6, 0.86],
  [-0.84, 0.86],
  [-0.7, 0.66],
  [-0.64, 0.42],
  [-0.68, 0.15],
  [-0.66, -0.2],
  [-0.6, -0.45],
  [-0.56, -0.7],
  [-0.52, -0.88],
  [-0.34, -0.84],
  [-0.22, -0.72],
];
/** An outline (x, z) laid flat, `d` thick, its top at y. */
const lay = (pts: [number, number][], d: number) => extrude(pts, d).rotateX(Math.PI / 2);
function cowhide(m: Model, o: Look) {
  // (the life look: hair on hide, not the walnut its brown would be)
  m.only("matte");
  const [cx, cz] = [1, 1];
  const s = o.seed;
  const base = o.look === 2 ? 0xc49a6a : 0xf0ebe0;
  const patch = o.fabric ?? [0x1d1b1a, 0x6b4128, 0x4a3020][o.look] ?? 0x1d1b1a;
  m.add(lay(HIDE, 0.006), base, { at: [cx, 0.003, cz] });
  if (o.look === 2) {
    // speckled: soft freckles all over, bigger and darker toward the spine
    for (let i = 0; i < 46; i++) {
      const x = (rnd(i, 1, s) - 0.5) * 1.05;
      const z = (rnd(i, 2, s) - 0.5) * 1.35;
      const r = 0.03 + rnd(i, 3, s) * 0.05 * (1.2 - Math.abs(x));
      m.add(cyl(r, r, 0.002, 7), shade(patch, 0.85 + rnd(i, 4, s) * 0.4), {
        at: [cx + x, 0.0065, cz + z],
        scale: [1, 1, 1.3],
        rot: [0, rnd(i, 5, s) * 3, 0],
      });
    }
    return;
  }
  // patches: blobs of irregular outline, none past the hide's edge
  const blobs: [number, number, number][] = [
    [-0.3, -0.55, 0.26],
    [0.32, -0.3, 0.3],
    [-0.36, 0.2, 0.28],
    [0.3, 0.52, 0.26],
    [0.02, -0.02, 0.16],
    [-0.5, 0.62, 0.16],
    [0.5, 0.05, 0.14],
    [0.0, 0.7, 0.14],
  ];
  blobs.forEach(([x, z, r], i) => {
    if (i > 4 && rnd(i, 5, s) < 0.35) return;
    const pts: [number, number][] = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2;
      const rr = r * (0.7 + rnd(i, k, s) * 0.5);
      pts.push([x + (rnd(i, 9, s) - 0.5) * 0.1 + Math.cos(a) * rr, z + Math.sin(a) * rr * 1.2]);
    }
    // (kept inside the hide: pulled in toward the spine where they'd reach out past it)
    const lim = (pz: number) => (Math.abs(pz) > 0.7 ? 0.5 : 0.6);
    m.add(
      lay(
        pts.map(
          ([px, pz]) =>
            [Math.max(-lim(pz), Math.min(lim(pz), px)), Math.max(-0.74, Math.min(0.78, pz))] as [number, number],
        ),
        0.002,
      ),
      patch,
      { at: [cx, 0.0065, cz] },
    );
  });
}

// ── the puzzle mat (2×2) ───────────────────────────────────────────────────────────────────────────
function puzzleMat(m: Model, o: Look) {
  m.only("matte");
  const n = 4;
  const T = 2 / n;
  const H = 0.012;
  const pal =
    o.look === 2
      ? [0x8a8f94, 0xe9e6df]
      : o.look === 1
        ? [0xf4c2c2, 0xbfe0d0, 0xf6e3a8, 0xc8d4f0, 0xe0c8f0]
        : [0xe04a3a, 0xf0b030, 0x4fae6a, 0x3a8ae0, 0xb86ad0, 0xf07a30];
  const colourAt = (i: number, j: number) => {
    if (o.fabric !== null) return shade(o.fabric, (i + j) % 2 ? 1.12 : 0.92);
    return o.look === 2 ? pal[(i + j) % 2] : pal[(i * 3 + j * 2 + ((i * j) % 3)) % pal.length];
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const c = colourAt(i, j);
      const [x, z] = [(i + 0.5) * T, (j + 0.5) * T];
      m.add(box([T - 0.004, H, T - 0.004]), c, { at: [x, H / 2, z] });
      // its knobs into the next tile (right, down): the neighbour's cut showing this one's colour
      if (i < n - 1)
        for (const k of [-0.25, 0.25]) m.add(cyl(0.035, 0.035, 0.001, 8), c, { at: [x + T / 2 + 0.03, H, z + k * T] });
      if (j < n - 1)
        for (const k of [-0.25, 0.25]) m.add(cyl(0.035, 0.035, 0.001, 8), c, { at: [x + k * T, H, z + T / 2 + 0.03] });
      // a letter on each (the ABC mat)
      if (o.look === 0 && o.fabric === null)
        centredText(m, String.fromCharCode(65 + i + j * n), x, z, H + 0.0012, 0.035, P.paperWhite);
    }
  // the straight edging strips round it
  for (const [x, z, w, d] of [
    [1, 0.01, 2, 0.02],
    [1, 1.99, 2, 0.02],
    [0.01, 1, 0.02, 2],
    [1.99, 1, 0.02, 2],
  ])
    m.add(box([w, H, d]), o.look === 2 ? 0x6a6f74 : 0xe9e6df, { at: [x, H / 2, z] });
}

// ── the welcome mat (1×1) ──────────────────────────────────────────────────────────────────────────
function welcomeMat(m: Model, o: Look) {
  m.only("carpet");
  const [w, d] = [0.86, 0.56];
  if (o.look === 1) {
    // rubber, ribbed, HELLO raised on it
    const c = o.fabric ?? 0x2b2b2e;
    m.add(box([w, 0.012, d], 0.004), c, { at: [0.5, 0.006, 0.5] });
    for (let i = 0; i < 12; i++)
      m.add(box([w - 0.08, 0.004, 0.012]), shade(c, 1.3), { at: [0.5, 0.013, 0.28 + i * 0.04] });
    m.add(box([0.6, 0.002, 0.14]), c, { at: [0.5, 0.016, 0.5] });
    centredText(m, "HELLO", 0.5, 0.5, 0.0175, 0.016, 0xe8c25a);
    return;
  }
  if (o.look === 2) {
    // striped cotton, tassels at its ends
    const c = o.fabric ?? 0x3f5a8a;
    m.add(box([w, 0.008, d]), P.cream, { at: [0.5, 0.004, 0.5] });
    for (let i = 0; i < 7; i++)
      flat(m, 0.07 + 0.02 + i * 0.12, 0.22, 0.07 + 0.08 + i * 0.12, 0.78, 0.0095, i % 2 ? shade(c, 0.7) : c);
    for (let i = 0; i < 9; i++)
      for (const z of [0.2, 0.8])
        m.add(cyl(0.008, 0.002, 0.004, 4), P.cream, { at: [0.1 + i * 0.1, 0.002, z + (z < 0.5 ? -0.03 : 0.03)] });
    return;
  }
  // coir, a rubber border, WELCOME in black
  const c = o.fabric ?? 0xb88a4e;
  m.add(box([w, 0.01, d], 0.003), 0x2b2b2e, { at: [0.5, 0.005, 0.5] });
  m.add(box([w - 0.05, 0.016, d - 0.05], 0.004), c, { at: [0.5, 0.008, 0.5] });
  // the coir's bristle rows
  for (let i = 0; i < 18; i++)
    m.add(box([w - 0.07, 0.001, 0.004]), shade(c, 0.85), { at: [0.5, 0.0162, 0.26 + i * 0.028] });
  centredText(m, "WELCOME", 0.5, 0.5, 0.0168, 0.016, 0x1d1b1a);
}

// ── the dance floor (3×3) ──────────────────────────────────────────────────────────────────────────
function danceFloor(m: Model, o: Look) {
  const on = o.on !== false;
  const n = 6;
  const T = 3 / n;
  const top = 0.035;
  // the frame: an aluminium edge round a dark deck
  m.add(box([3, top - 0.004, 3], 0.004), 0x1d1d20, { at: [1.5, (top - 0.004) / 2, 1.5] });
  for (const [x, z, w, d] of [
    [1.5, 0.015, 3, 0.03],
    [1.5, 2.985, 3, 0.03],
    [0.015, 1.5, 0.03, 3],
    [2.985, 1.5, 0.03, 3],
  ])
    m.add(box([w, top + 0.004, d], 0.003), P.alum, { at: [x, (top + 0.004) / 2, z] });
  // each tile: its colour, its pattern's set
  const sets = new Map<string, { c: number; at: V3[]; phase: number; period: number; on: number }>();
  const disco = [0xff3aa0, 0x3ad8ff, 0xffd83a, 0x6ad04a];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const at: V3 = [(i + 0.5) * T, top, (j + 0.5) * T];
      let c: number;
      let key: string;
      let phase: number;
      let period = 1.2;
      let lit = 0.4;
      if (o.look === 1) {
        // warm white, chasing across on the diagonals
        c = 0xffc870;
        const k = (i + j) % 6;
        key = `${k}`;
        phase = (1 - k / 6) % 1;
        period = 1.5;
        lit = 0.34;
      } else if (o.look === 2) {
        // neon: a checker swapping
        const k = (i + j) % 2;
        c = k ? 0xff3aa0 : 0x3ad8ff;
        key = `${k}`;
        phase = k * 0.5;
        period = 1.0;
        lit = 0.5;
      } else {
        // disco: a colour a corner of each four, rings pulsing out from the middle
        const ci = (i % 2) + 2 * (j % 2);
        const ringN = Math.floor(Math.max(Math.abs(i - 2.5), Math.abs(j - 2.5)));
        c = disco[ci];
        key = `${ci}|${ringN}`;
        phase = (1 - ringN / 3 + ci * 0.13) % 1;
      }
      // the tile's frosted face, dim (lit as its set comes round)
      m.add(box([T - 0.03, 0.004, T - 0.03]), shade(c, on ? 0.32 : 0.2), { at: [at[0], top - 0.002, at[2]] });
      const s = sets.get(key) ?? { c, at: [], phase, period, on: lit };
      s.at.push(at);
      sets.set(key, s);
    }
  if (o.look === 2)
    // the grid between the tiles, lit
    for (let k = 1; k < n; k++) {
      m.add(box([0.012, 0.003, 3 - 0.06]), on ? 0xb06aff : 0x3a2a4a, { at: [k * T, top + 0.0005, 1.5], glow: on });
      m.add(box([3 - 0.06, 0.003, 0.012]), on ? 0xb06aff : 0x3a2a4a, { at: [1.5, top + 0.0005, k * T], glow: on });
    }
  if (!on) return;
  for (const s of sets.values())
    m.live(
      merged(s.at.map((a) => box([T - 0.04, 0.004, T - 0.04]).translate(a[0], a[1] + 0.0008, a[2]))),
      s.c,
      { kind: "blink", period: s.period, on: s.on, phase: s.phase },
      { glow: true },
    );
}

// ── stage risers (2×1) and their steps (1×1) ──────────────────────────────────────────────────────
const RISE = 0.4;
/** A deck's top (its finish by the look) over x0..x1 × z0..z1 at height y, its frame or skirt under. */
function deck(m: Model, look: number, x0: number, x1: number, z0: number, z1: number, y: number, seed: number) {
  const [w, d] = [x1 - x0, z1 - z0];
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const frame = look === 2 ? 0x8a8f94 : 0x1d1d20;
  // the frame: legs at its corners (and mid-length), rails round
  const legs = w > 1.5 ? [x0 + 0.06, cx, x1 - 0.06] : [x0 + 0.06, x1 - 0.06];
  for (const x of legs)
    for (const z of [z0 + 0.06, z1 - 0.06]) m.add(box([0.05, y - 0.04, 0.05]), frame, { at: [x, (y - 0.04) / 2, z] });
  for (const z of [z0 + 0.03, z1 - 0.03]) m.add(box([w - 0.004, 0.06, 0.03]), frame, { at: [cx, y - 0.06, z] });
  for (const x of [x0 + 0.03, x1 - 0.03]) m.add(box([0.03, 0.06, d - 0.004]), frame, { at: [x, y - 0.06, cz] });
  if (look === 0) {
    // black carpet, a pleated skirt round the open sides
    m.add(box([w - 0.002, 0.025, d - 0.002], 0.004), 0x232326, { at: [cx, y - 0.0125, cz] });
    // (soft pleats: a fold every 10 cm, catching the light a little)
    m.add(box([w - 0.01, y - 0.03, 0.006]), 0x1d1d20, { at: [cx, (y - 0.03) / 2, z1 - 0.012] });
    for (let x = x0 + 0.05; x < x1 - 0.02; x += 0.1)
      m.add(box([0.04, y - 0.03, 0.01]), 0x1d1d20, { at: [x, (y - 0.03) / 2, z1 - 0.006], tone: 1.12 });
    for (const x of [x0 + 0.006, x1 - 0.006]) {
      m.add(box([0.006, y - 0.03, d - 0.01]), 0x1d1d20, { at: [x + (x < cx ? 0.006 : -0.006), (y - 0.03) / 2, cz] });
      for (let z = z0 + 0.05; z < z1 - 0.02; z += 0.1)
        m.add(box([0.01, y - 0.03, 0.04]), 0x1d1d20, { at: [x, (y - 0.03) / 2, z], tone: 1.12 });
    }
  } else if (look === 1) {
    // oak boards along it on a ply deck, a black fascia
    m.add(box([w - 0.004, 0.012, d - 0.004]), 0x2b2b2e, { at: [cx, y - 0.01, cz] });
    const n = Math.round(d / 0.125);
    for (let i = 0; i < n; i++)
      m.add(box([w - 0.002, 0.022, d / n - 0.003], 0.002), shade(P.oak, 0.92 + rnd(i, 1, seed) * 0.16), {
        at: [cx, y - 0.011, z0 + (i + 0.5) * (d / n)],
      });
    // closed round with black fascia boards
    m.add(box([w, y - 0.022, 0.012]), 0x1d1d20, { at: [cx, (y - 0.022) / 2, z1 - 0.006] });
    m.add(box([w, y - 0.022, 0.012]), 0x1d1d20, { at: [cx, (y - 0.022) / 2, z0 + 0.006] });
    for (const x of [x0 + 0.006, x1 - 0.006])
      m.add(box([0.012, y - 0.022, d - 0.024]), 0x1d1d20, { at: [x, (y - 0.022) / 2, cz] });
  } else {
    // steel deck: grey anti-slip with a raised diamond tread; the legs braced crosswise
    for (const z of [z0 + 0.06, z1 - 0.06])
      for (let i = 0; i < legs.length - 1; i++) {
        const [a, b] = [legs[i], legs[i + 1]];
        const len = Math.hypot(b - a, y - 0.1);
        for (const sgn of [-1, 1])
          m.add(box([len, 0.02, 0.012]), frame, {
            at: [(a + b) / 2, (y - 0.05) / 2, z],
            rot: [0, 0, sgn * Math.atan2(y - 0.1, b - a)],
          });
      }
    m.add(box([w - 0.002, 0.02, d - 0.002], 0.003), 0x6a6f74, { at: [cx, y - 0.01, cz] });
    for (let i = 0; i < Math.floor(w / 0.1); i++)
      for (let k = 0; k < Math.floor(d / 0.1); k++)
        m.add(box([0.04, 0.003, 0.012]), 0x8a8f94, {
          at: [x0 + 0.05 + i * 0.1, y + 0.0015, z0 + 0.05 + k * 0.1],
          rot: [0, (i + k) % 2 ? 0.7 : -0.7, 0],
        });
  }
  // (story) white gaffer tape along its front edge, or a spike mark
  if (seed > 0.5) m.add(box([w - 0.04, 0.002, 0.04]), P.paperWhite, { at: [cx, y + 0.001, z1 - 0.03] });
  else if (seed > 0.25) {
    m.add(box([0.12, 0.002, 0.02]), 0xe8c25a, { at: [cx, y + 0.001, cz] });
    m.add(box([0.02, 0.002, 0.12]), 0xe8c25a, { at: [cx, y + 0.001, cz] });
  }
}
function stageRiser(m: Model, o: Look) {
  deck(m, o.look, 0, 2, 0, 1, RISE, o.seed);
}
function stageSteps(m: Model, o: Look) {
  // the top step behind (toward the stage), the bottom one in front, each a deck
  // (no tape marks on steps)
  deck(m, o.look, 0, 1, 0, 0.5, RISE, 0);
  deck(m, o.look, 0, 1, 0.5, 1, RISE / 2, 0);
}

// ── tape lanes (4×1) and decals (1×1) on the floor ──────────────────────────────────────────────────
function floorTape(m: Model, o: Look) {
  const y = 0.003;
  if (o.look === 1) {
    // hazard: a band of yellow with black diagonals
    const c = o.fabric ?? 0xf0c020;
    flat(m, 0.1, 0.3, 3.9, 0.7, y, c);
    const q: V3[][] = [];
    for (let x = 0.1; x < 3.9 - 0.15; x += 0.2)
      q.push(
        [
          [x, y + 0.0005, 0.7],
          [x + 0.08, y + 0.0005, 0.7],
          [x + 0.08 + 0.15, y + 0.0005, 0.3],
          [x + 0.15, y + 0.0005, 0.3],
        ].map((p) => [Math.min(3.9, p[0]), p[1], p[2]] as V3),
      );
    m.add(quads(q), 0x1d1b1a);
    return;
  }
  if (o.look === 2) {
    // a walkway: green edges, a white dashed line down its middle, walking feet
    const c = o.fabric ?? 0x3a9a5a;
    for (const z of [0.15, 0.85]) flat(m, 0.1, z - 0.025, 3.9, z + 0.025, y, c);
    for (let x = 0.2; x < 3.8; x += 0.4) flat(m, x, 0.49, x + 0.2, 0.51, y, P.paperWhite);
    for (const [x, z, s] of [
      [1.0, 0.36, -1],
      [1.3, 0.64, 1],
      [2.7, 0.36, -1],
      [3.0, 0.64, 1],
    ]) {
      m.add(cyl(0.035, 0.035, 0.002, 10), c, { at: [x, y - 0.002, z], scale: [1.9, 1, 1], rot: [0, 0.1 * s, 0] });
      for (let k = 0; k < 4; k++)
        m.add(cyl(0.01, 0.01, 0.002, 6), c, { at: [x + 0.09, y - 0.002, z - 0.03 + k * 0.02] });
    }
    return;
  }
  // a lane: two lines of yellow tape, arrows down its middle
  const c = o.fabric ?? 0xf0c020;
  for (const z of [0.12, 0.88]) flat(m, 0.1, z - 0.025, 3.9, z + 0.025, y, c);
  for (const x of [0.8, 2.0, 3.2]) {
    flat(m, x - 0.25, 0.48, x + 0.1, 0.52, y, c);
    m.add(
      extrude(
        [
          [0, 0.1],
          [0.16, 0],
          [0, -0.1],
        ],
        0.002,
      ).rotateX(Math.PI / 2),
      c,
      { at: [x + 0.1, y - 0.001, 0.5] },
    );
  }
}

function floorDecal(m: Model, o: Look) {
  const y = 0.003;
  const at: V3 = [0.5, y - 0.001, 0.5];
  if (o.look === 1) {
    const c = o.fabric ?? 0xe8c25a;
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.15 : 0.36;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    m.add(extrude(pts, 0.002).rotateX(Math.PI / 2), c, { at });
    m.add(
      extrude(
        pts.map(([x, z]) => [x * 0.75, z * 0.75] as [number, number]),
        0.002,
      ).rotateX(Math.PI / 2),
      shade(c, 1.2),
      { at: [0.5, y + 0.0005, 0.5] },
    );
    return;
  }
  if (o.look === 2) {
    // stand here: a ring, two footprints in it
    const c = o.fabric ?? 0x3a8ae0;
    m.add(ring(0.34, 0.03, 3, 40).scale(1, 0.05, 1), c, { at: [0.5, y, 0.5] });
    for (const s of [-1, 1]) {
      const x = 0.5 + s * 0.09;
      m.add(cyl(0.045, 0.045, 0.002, 12), c, { at: [x, y - 0.002, 0.53], scale: [1, 1, 2] });
      m.add(cyl(0.035, 0.035, 0.002, 10), c, { at: [x, y - 0.002, 0.38], scale: [1, 1, 0.9] });
    }
    centredText(m, "STAND HERE", 0.5, 0.74, y + 0.0004, 0.009, c);
    return;
  }
  if (o.look === 3) {
    // X marks the spot: two strips of tape crossed
    const c = o.fabric ?? 0xc4402b;
    for (const a of [Math.PI / 4, -Math.PI / 4]) m.add(box([0.7, 0.002, 0.08]), c, { at, rot: [0, a, 0] });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      m.add(box([0.08, 0.002, 0.004]), shade(c, 0.8), {
        at: [0.5 + Math.cos(a) * 0.35, y + 0.0004, 0.5 + Math.sin(a) * 0.35],
        rot: [0, -a + Math.PI / 2, 0],
      });
    }
    return;
  }
  // an arrow, pointing on (+z, the way the thing faces)
  const c = o.fabric ?? 0xf0f0e8;
  m.add(
    extrude(
      [
        [-0.08, -0.38],
        [0.08, -0.38],
        [0.08, 0.06],
        [0.2, 0.06],
        [0, 0.38],
        [-0.2, 0.06],
        [-0.08, 0.06],
      ],
      0.002,
    ).rotateX(Math.PI / 2),
    c,
    { at },
  );
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  round_rug: roundRug,
  runner_rug: runnerRug,
  cowhide,
  puzzle_mat: puzzleMat,
  welcome_mat: welcomeMat,
  dance_floor: danceFloor,
  stage_riser: stageRiser,
  stage_steps: stageSteps,
  floor_tape: floorTape,
  floor_decal: floorDecal,
};
