import { STAND } from "@yutopia/shared";
import { type BufferGeometry, Float32BufferAttribute, BufferGeometry as Geo, Quaternion, Vector3 } from "three";
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
  ring,
  rod,
  taper,
  tube,
  type V3,
} from "../kit";
import { finishes } from "../life-mats";
import { P, shade } from "../palette";

// Plan 68 phase 17 (docs/plan/68-more-furniture.md): Parkour — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/parkour2.ts (its TRAMPOLINE, ZIP_LINE, QUARTER_PIPE
// and TYRES are drawn here as they're measured there: the shapes test holds the two together).
// Out of doors, built to take a body: a vaulting box, a balance beam, monkey bars, a climbing wall,
// a trampoline, a quarter pipe, a zip line between its poles, a cargo net and a tyre run.

export const LOOKS: Record<string, readonly string[]> = {
  pk_vault_box: ["Vaulting box", "Foam plyo box", "Concrete block"],
  pk_beam: ["Timber beam", "Steel beam", "Log"],
  pk_monkey_bars: ["Green steel", "Galvanised", "Timber frame"],
  pk_climb_wall: ["Plywood, bright holds", "Grey panels, neon holds", "Rock face"],
  pk_trampoline: ["Blue pads", "Green pads", "Red and yellow"],
  pk_quarter_pipe: ["Plywood", "Steel", "Concrete"],
  pk_zip_line: ["Timber poles", "Steel poles"],
  pk_cargo_net: ["Hemp rope, timber", "Blue rope, steel", "Black rope, green steel"],
  pk_tyre_run: ["Black tyres", "Painted tyres", "In a timber frame"],
};

// (the shared measures, as fam/parkour2.ts has them)
const TRAMP = { u: 1.5, v: 1.5, r: 1.16, top: STAND.pk_trampoline ?? 0.76, frame: 1.42 };
const ZIP = { from: [0.2, 3.45, 0.5] as V3, to: [9.62, 2.45, 0.5] as V3, sag: 0.18, grip: 1.0, deck: 0.9 };
const QP = { r: 1.6, toe: 3, top: 1.2 };
const TYRE_R = 0.33;
const TYRE_H = 0.2;
const TYRES: [number, number][] = [0.62, 1.38].flatMap((v) =>
  [0, 1, 2, 3, 4].map((i) => [0.48 + i * 0.76, v] as [number, number]),
);

const C = {
  beech: 0xd2a86e,
  beechDark: 0xa98250,
  leather: 0x7a3f25,
  foam: 0x2d5fa8,
  foamTop: 0x3b73c2,
  hazard: 0xe0b02a,
  concrete: 0xa9a49a,
  concreteDark: 0x857f75,
  galv: 0xa9b1bb,
  galvDark: 0x7d8590,
  green: 0x2f7a4a,
  timber: 0x9a7048,
  timberDark: 0x6e4c2e,
  bark: 0x5e4330,
  barkDark: 0x46311f,
  sapwood: 0xd8b98a,
  ply: 0xcfa978,
  plyDark: 0xa98a5c,
  panel: 0x6c7176,
  mat: 0x1d1f22,
  rope: 0xc2a46e,
  ropeBlue: 0x2f62a8,
  ropeBlack: 0x2a2a2c,
  rubber: 0x222225,
  chips: 0x8a6440,
  sand: 0xb59a6a,
};
// (plan 73 phase 6.7: what the parkour's finishes are in the life look)
finishes([
  [C.beech, "birch"],
  [C.beechDark, "oak"],
  [C.leather, "leather"],
  [C.foam, "matte"],
  [C.foamTop, "matte"],
  [C.concrete, "matte"],
  [C.concreteDark, "matte"],
  [C.galv, "metal-brushed"],
  [C.galvDark, "metal-brushed"],
  [C.timber, "oak"],
  [C.timberDark, "oak"],
  [C.sapwood, "pine"],
  [C.ply, "birch"],
  [C.plyDark, "birch"],
  [C.panel, "plain"],
  [C.mat, "matte"],
  [C.rope, "matte"],
  [C.ropeBlue, "matte"],
  [C.ropeBlack, "matte"],
  [C.rubber, "matte"],
  [C.chips, "matte"],
]);
const BRIGHT = [0xe0402b, 0xf2c230, 0x2f7ad1, 0x3fa34a, 0x8a4fc4, 0xf08a2a, 0xe8e6df];
const NEON = [0xff4fa0, 0xb8f23a, 0x3ae0f2, 0xff9a2a, 0xf2f23a];

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
/** A straight rod from a to b (any way), `r` round. */
function bar(a: V3, b: V3, r: number, seg = 8): BufferGeometry {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  const g = cyl(r, r, len, seg).translate(0, -len / 2, 0);
  // (its y onto d: tipped from up by the angle between them, round the axis across both)
  const up = [0, 1, 0];
  const n = d.map((v) => v / len);
  const ax: V3 = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
  const al = Math.hypot(...ax);
  if (al > 1e-6) {
    const ang = Math.acos(Math.max(-1, Math.min(1, n[1])));
    g.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(ax[0] / al, ax[1] / al, ax[2] / al), ang));
  } else if (n[1] < 0) g.rotateX(Math.PI);
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

// ── the vaulting box (2×1) ────────────────────────────────────────────────────────────────────────
/** A vaulting box: a gym's Swedish box of four tapering beech frames, hand holes through the second,
 *  a padded leather top; a foam plyo box in vinyl, its handles and a stripe; or a park's concrete block
 *  with steel angles on its edges and its scuffs. Its top 0.72, the jump's (STAND). */
function vaultBox(m: Model, o: Look) {
  const top = STAND.pk_vault_box ?? 0.72;
  const [u, v] = [1, 0.5];
  if (o.look === 0) {
    const W = (y: number) => 1.5 - 0.18 * (y / 0.6);
    const D = (y: number) => 0.7 - 0.14 * (y / 0.6);
    for (let i = 0; i < 4; i++) {
      const y0 = i * 0.15;
      const y1 = y0 + 0.145;
      const k = W(y1) / W(y0);
      const g = taper(box([W(y0), 0.145, D(y0)], 0.008), k, -0.0725, 0.0725);
      m.add(g, i % 2 ? C.beech : shade(C.beech, 1.05), { at: [u, y0 + 0.0725, v] });
      // the seam under it, set in
      m.add(box([W(y1) - 0.03, 0.008, D(y1) - 0.03]), C.beechDark, { at: [u, y1 + 0.002, v] });
      // the frame's end grain at its corners: darker posts
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          m.add(box([0.05, 0.14, 0.05]), C.beechDark, {
            at: [u + sx * (W(y0 + 0.07) / 2 - 0.022), y0 + 0.0725, v + sz * (D(y0 + 0.07) / 2 - 0.022)],
          });
    }
    // the hand holes through the second frame, both long sides and the ends
    for (const sz of [-1, 1])
      for (const sx of [-0.35, 0.35])
        m.add(box([0.22, 0.05, 0.012], 0.006), 0x3a2a1c, { at: [u + sx, 0.225, v + sz * (D(0.225) / 2 + 0.001)] });
    for (const sx of [-1, 1])
      m.add(box([0.012, 0.05, 0.2], 0.006), 0x3a2a1c, { at: [u + sx * (W(0.225) / 2 + 0.001), 0.225, v] });
    // the padded leather top, stitched round its edge
    m.add(cushion([W(0.6) - 0.02, 0.11, D(0.6) - 0.02], 0.05, 2), C.leather, { at: [u, 0.6 + 0.055, v] });
    m.add(box([W(0.6) - 0.06, 0.004, D(0.6) - 0.06]), shade(C.leather, 1.3), { at: [u, top - 0.012, v] });
    m.add(box([W(0.6) - 0.08, 0.006, D(0.6) - 0.08]), C.leather, { at: [u, top - 0.008, v] });
    // rubber feet
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        m.add(box([0.08, 0.012, 0.06], 0.004), C.rubber, { at: [u + sx * 0.66, 0.006, v + sz * 0.28] });
  } else if (o.look === 1) {
    // vinyl over foam: soft corners, a lighter top, a hazard stripe, webbing handles at its ends
    m.add(box([1.44, top - 0.04, 0.64], 0.06, 3), C.foam, { at: [u, (top - 0.04) / 2, v] });
    m.add(cushion([1.42, 0.06, 0.62], 0.06, 2), C.foamTop, { at: [u, top - 0.035, v] });
    m.add(box([1.445, 0.06, 0.645]), C.hazard, { at: [u, 0.42, v] });
    m.add(box([1.446, 0.012, 0.646]), P.ink, { at: [u, 0.392, v] });
    m.add(box([1.446, 0.012, 0.646]), P.ink, { at: [u, 0.448, v] });
    for (const sx of [-1, 1]) {
      m.add(box([0.03, 0.05, 0.26], 0.01), P.rubber, { at: [u + sx * 0.735, 0.56, v] });
      for (const sz of [-1, 1]) m.add(box([0.03, 0.06, 0.03]), P.rubber, { at: [u + sx * 0.728, 0.56, v + sz * 0.12] });
    }
    // its maker's badge on the front
    m.add(box([0.16, 0.08, 0.004], 0.002), P.white, { at: [u - 0.45, 0.22, v + 0.322] });
    m.add(box([0.1, 0.02, 0.003]), C.foam, { at: [u - 0.45, 0.22, v + 0.325] });
  } else {
    // cast concrete: chamfered, steel angles on its long top edges, scuffed where it's vaulted
    const h = top - 0.02;
    m.add(box([1.5, h, 0.7], 0.025, 1), C.concrete, { at: [u, h / 2, v] });
    // the formwork's lines
    for (const sz of [-1, 1]) m.add(box([1.46, 0.006, 0.002]), C.concreteDark, { at: [u, h * 0.5, v + sz * 0.351] });
    for (const sz of [-1, 1]) {
      m.add(box([1.5, 0.02, 0.06]), C.galvDark, { at: [u, h + 0.01, v + sz * 0.32] });
      m.add(box([1.5, 0.06, 0.012]), C.galvDark, { at: [u, h - 0.02, v + sz * 0.352] });
    }
    // the scuffs on its top, and a sprayed mark by its seed
    for (let i = 0; i < 5; i++)
      m.add(box([0.12 + rnd(i, 1, o.seed) * 0.2, 0.002, 0.08 + rnd(i, 2, o.seed) * 0.12]), shade(C.concrete, 0.82), {
        at: [u - 0.5 + i * 0.25, h + 0.001, v + (rnd(i, 3, o.seed) - 0.5) * 0.3],
        rot: [0, rnd(i, 4, o.seed), 0],
      });
    const tag = BRIGHT[Math.floor(o.seed * 4)];
    m.add(box([0.3, 0.12, 0.003]), tag, { at: [u + 0.4, 0.28, v + 0.352], rot: [0, 0, 0.12] });
    m.add(box([0.22, 0.03, 0.003]), P.ink, { at: [u + 0.42, 0.29, v + 0.354], rot: [0, 0, 0.12] });
  }
}

// ── the balance beam (4×1) ────────────────────────────────────────────────────────────────────────
/** A balance beam 0.4 m up, 3.8 m long: a square timber on three posts and their pads, a painted
 *  steel tube on its stands, or a barked log in two stumps' cradles. Stepped up onto, walked along. */
function beam(m: Model, o: Look) {
  const top = STAND.pk_beam ?? 0.4;
  const [x0, x1] = [0.1, 3.9];
  const L = x1 - x0;
  const mid = (x0 + x1) / 2;
  if (o.look === 0) {
    m.add(box([L, 0.12, 0.13], 0.012, 2), C.timber, { at: [mid, top - 0.06, 0.5] });
    for (let i = 0; i < 5; i++)
      m.add(box([L - 0.1, 0.002, 0.008]), C.timberDark, {
        at: [mid, top + 0.0005, 0.47 + i * 0.015 + rnd(i, 1, 2) * 0.004],
      });
    for (const x of [0.4, 2, 3.6]) {
      m.add(box([0.12, top - 0.12, 0.12], 0.006), shade(C.timber, 0.9), { at: [x, (top - 0.12) / 2, 0.5] });
      m.add(box([0.24, 0.04, 0.24], 0.008), C.concrete, { at: [x, 0.02, 0.5] });
      for (const s of [-1, 1])
        m.add(cyl(0.012, 0.012, 0.01, 6), C.galvDark, {
          at: [x + s * 0.035, top - 0.18, 0.565],
          rot: [Math.PI / 2, 0, 0],
        });
    }
    // its ends' grain, a hazard band at each
    for (const x of [x0 + 0.002, x1 - 0.002]) m.add(box([0.004, 0.11, 0.12]), C.sapwood, { at: [x, top - 0.06, 0.5] });
    for (const x of [x0 + 0.1, x1 - 0.1]) m.add(box([0.06, 0.122, 0.132]), C.hazard, { at: [x, top - 0.06, 0.5] });
  } else if (o.look === 1) {
    const r = 0.05;
    m.add(rod(r, r, L, "x", 14), C.green, { at: [mid, top - r, 0.5] });
    for (const x of [x0, x1])
      m.add(cyl(r + 0.004, r + 0.004, 0.03, 14), P.rubber, { at: [x, top - r, 0.5], rot: [0, 0, Math.PI / 2] });
    for (const x of [0.4, 2, 3.6]) {
      m.add(box([0.24, 0.012, 0.24], 0.004), C.galvDark, { at: [x, 0.006, 0.5] });
      m.add(cyl(0.035, 0.035, top - 2 * r + 0.01, 10), C.galvDark, { at: [x, 0.012, 0.5] });
      m.add(box([0.1, 0.03, 0.08], 0.006), C.galvDark, { at: [x, top - 2 * r - 0.005, 0.5] });
      for (let i = 0; i < 4; i++)
        m.add(cyl(0.01, 0.01, 0.012, 6), P.ink, {
          at: [x - 0.08 + (i % 2) * 0.16, 0.012, 0.42 + Math.floor(i / 2) * 0.16],
        });
    }
    // grip tape bands where feet go
    for (let i = 0; i < 6; i++)
      m.add(rod(r + 0.002, r + 0.002, 0.22, "x", 14), P.rubber, { at: [0.7 + i * 0.52, top - r, 0.5] });
  } else {
    const r = 0.1;
    const y = top - r;
    m.add(rod(r * 0.95, r, L, "x", 11), C.bark, { at: [mid, y, 0.5] });
    // the bark's ridges, its cut ends' rings, a knot or two
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      m.add(rod(0.012, 0.012, L * (0.5 + rnd(i, 1, 3) * 0.45), "x", 4), C.barkDark, {
        at: [mid + (rnd(i, 2, 3) - 0.5) * 0.6, y + Math.sin(a) * r * 0.96, 0.5 + Math.cos(a) * r * 0.96],
      });
    }
    for (const [x, s] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      m.add(cyl(r * 0.94, r * 0.94, 0.006, 12), C.sapwood, { at: [x - s * 0.003, y, 0.5], rot: [0, 0, Math.PI / 2] });
      m.add(ring(r * 0.55, 0.004, 3, 12), shade(C.sapwood, 0.8), {
        at: [x + s * 0.001, y, 0.5],
        rot: [0, 0, Math.PI / 2],
      });
    }
    for (const x of [1.2, 2.9]) m.add(ball(0.025, 5), C.barkDark, { at: [x, y + 0.04, 0.5 + r * 0.9] });
    // two stumps, cradled
    for (const x of [0.7, 3.3]) {
      m.add(cyl(0.12, 0.11, top - 2 * r + 0.03, 10), C.bark, { at: [x, 0, 0.5] });
      m.add(cyl(0.1, 0.1, 0.004, 10), C.sapwood, { at: [x, top - 2 * r + 0.031, 0.5] });
    }
  }
}

// ── monkey bars (4×1) ─────────────────────────────────────────────────────────────────────────────
/** Monkey bars: two end ladders (their uprights at the corners, rungs up to the bars), a ladder of
 *  bars overhead at 2.22 m, walked under between the uprights; in green steel with yellow bars,
 *  galvanised, or timber posts with steel bars. A skipping rope hung on a post by its seed. */
function monkeyBars(m: Model, o: Look) {
  const Y = 2.22;
  const timber = o.look === 2;
  const post = o.look === 0 ? C.green : o.look === 1 ? C.galv : C.timber;
  const bars = o.look === 0 ? C.hazard : o.look === 1 ? shade(C.galv, 1.1) : P.chrome;
  const ends = [0.14, 3.86];
  const sides = [0.1, 0.9];
  for (const x of ends)
    for (const z of sides) {
      if (timber) m.add(box([0.1, 2.3, 0.1], 0.008), post, { at: [x, 1.15, z] });
      else {
        m.add(cyl(0.045, 0.045, 2.26, 12), post, { at: [x, 0, z] });
        m.add(ball(0.05, 8), post, { at: [x, 2.26, z] });
      }
      m.add(cyl(0.09, 0.1, 0.04, 10), C.concrete, { at: [x, 0, z] });
    }
  // the end ladders' rungs
  for (const x of ends)
    for (const y of [0.42, 0.84, 1.26, 1.68]) m.add(rod(0.022, 0.022, 0.8, "z", 8), bars, { at: [x, y, 0.5] });
  // the side rails overhead, the bars between
  for (const z of sides) {
    if (timber) m.add(box([3.82, 0.1, 0.08], 0.008), post, { at: [2, Y + 0.02, z] });
    else m.add(rod(0.04, 0.04, 3.72, "x", 12), post, { at: [2, Y, z] });
  }
  for (let i = 0; i < 10; i++) m.add(rod(0.02, 0.02, 0.8, "z", 8), bars, { at: [0.5 + i * 0.333, Y + 0.01, 0.5] });
  // corner braces
  for (const [x, s] of [
    [0.14, 1],
    [3.86, -1],
  ] as const)
    for (const z of sides) m.add(bar([x, Y - 0.32, z], [x + s * 0.32, Y, z], 0.02, 6), post);
  // a skipping rope hung on a post
  if (o.seed > 0.5) {
    m.add(
      tube(
        [
          [3.86, 1.6, 0.86],
          [3.82, 1.2, 0.83],
          [3.86, 1.0, 0.82],
          [3.9, 1.2, 0.83],
          [3.86, 1.6, 0.86],
        ],
        0.006,
        4,
        16,
      ),
      0xd04040,
    );
    for (const dx of [-0.03, 0.03]) m.add(cyl(0.012, 0.012, 0.1, 6), P.mustard, { at: [3.86 + dx, 1.5, 0.84] });
  }
}

// ── the climbing wall (4×1) ───────────────────────────────────────────────────────────────────────
/** A free-standing bouldering wall 3 m high, both faces set with holds: plywood panels and holds in
 *  every colour, grey textured panels and neon holds with a black volume or two, or a cast rock face
 *  in slabs, its holds of the same stone. A steel channel at its foot, a cap along its top. */
function climbWall(m: Model, o: Look) {
  const H = STAND.pk_climb_wall ?? 3.05;
  const h = H - 0.05;
  const [z0, z1] = [0.36, 0.64];
  const rock = o.look === 2;
  const face = o.look === 0 ? C.ply : o.look === 1 ? C.panel : 0x8c867c;
  if (rock) {
    // the core, then slabs of stone on both faces
    m.add(box([4, h, z1 - z0 - 0.02]), shade(face, 0.8), { at: [2, h / 2, 0.5] });
    for (const [s, z] of [
      [1, z1],
      [-1, z0],
    ] as const)
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 6; j++) {
          const w = 0.5;
          const t = rnd(i, j + s * 7, 5);
          m.add(box([w - 0.02, 0.48, 0.03]), shade(face, 0.85 + t * 0.3), {
            at: [0.25 + i * w, 0.27 + j * 0.49, z - s * 0.005 + s * t * 0.012],
            rot: [s * (t - 0.5) * 0.06, 0, (rnd(i, j, 9) - 0.5) * 0.06],
          });
        }
  } else {
    m.add(box([4, h, z1 - z0], 0.006), face, { at: [2, h / 2, 0.5] });
    // the panels' seams, a bolt grid (the T-nuts)
    for (const z of [z0 - 0.001, z1 + 0.001]) {
      for (let x = 1; x < 4; x++) m.add(box([0.01, h, 0.002]), shade(face, 0.72), { at: [x, h / 2, z] });
      for (const y of [1, 2]) m.add(box([4, 0.01, 0.002]), shade(face, 0.72), { at: [2, y, z] });
    }
  }
  // the holds: lumps on both faces, a few big ones; a route's start tape beside its first
  const pal = rock ? [0x9d968a, 0xb0a99b, 0x7f786d] : o.look === 1 ? NEON : BRIGHT;
  for (const [s, z] of [
    [1, z1],
    [-1, z0],
  ] as const) {
    for (let i = 0; i < 44; i++) {
      const x = 0.15 + rnd(i, s, 1) * 3.7;
      const y = 0.25 + rnd(i, s, 2) * (h - 0.45);
      const r = 0.05 + rnd(i, s, 3) * 0.035 * (i % 7 === 0 ? 1.7 : 1);
      const c = pal[Math.floor(rnd(i, s, 4) * pal.length)];
      m.add(ball(r, 5), c, {
        at: [x, y, z + s * r * 0.2],
        scale: [1.2, 0.8, 0.55],
        rot: [0, 0, rnd(i, s, 5) * 3],
      });
    }
    if (o.look === 1)
      for (const [x, y] of [
        [1.1, 1.6],
        [2.9, 0.9],
      ]) {
        const g = extrude(
          [
            [-0.25, -0.2],
            [0.25, -0.2],
            [0, 0.25],
          ],
          0.05,
        );
        m.add(g, 0x26272b, { at: [x, y, z + s * 0.025] });
      }
    if (!rock)
      for (const [x, c] of [
        [0.6, BRIGHT[0]],
        [2.3, BRIGHT[2]],
        [3.4, BRIGHT[3]],
      ] as const)
        m.add(box([0.05, 0.02, 0.002]), c, { at: [x, 0.42, z + s * 0.002] });
  }
  // the foot's channel, its feet; the cap
  m.add(box([4, 0.08, 0.36], 0.006), C.galvDark, { at: [2, 0.04, 0.5] });
  for (const x of [0.3, 2, 3.7]) m.add(box([0.12, 0.06, 0.38], 0.006), C.galvDark, { at: [x, 0.03, 0.5] });
  m.add(box([4, 0.05, z1 - z0 + 0.04], 0.01), rock ? shade(face, 0.75) : C.galvDark, { at: [2, h + 0.025, 0.5] });
  if (rock)
    for (let i = 0; i < 6; i++)
      m.add(ball(0.06, 5), 0x56643f, {
        at: [0.3 + i * 0.65, h + 0.03, 0.5 + (rnd(i, 1, 6) - 0.5) * 0.15],
        scale: [1.4, 0.4, 1],
      });
}

// ── the trampoline (3×3) ──────────────────────────────────────────────────────────────────────────
/** A round trampoline: its galvanised frame on three W legs, the black mat stitched with a mark at its
 *  middle, padding over the springs in segments, a ladder at the front corner. A ball left on the mat
 *  by its seed. */
function trampoline(m: Model, o: Look) {
  const { u, v, r, top, frame } = TRAMP;
  const y = top - 0.01;
  const pads = o.look === 0 ? [0x2f6fb5, 0x2a63a3] : o.look === 1 ? [0x3f8a4a, 0x367a40] : [0xc8352b, 0xf2c230];
  // the frame ring, the legs (each a U down to the ground and back)
  m.add(ring(frame, 0.026, 6, 40), C.galv, { at: [u, y - 0.03, v] });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const p = (da: number, rr: number, yy: number): V3 => [u + Math.cos(a + da) * rr, yy, v + Math.sin(a + da) * rr];
    m.add(
      tube([p(-0.17, frame, y - 0.03), p(-0.13, frame - 0.04, 0.3), p(-0.1, frame - 0.06, 0.025)], 0.022, 6, 8),
      C.galv,
    );
    m.add(
      tube([p(0.17, frame, y - 0.03), p(0.13, frame - 0.04, 0.3), p(0.1, frame - 0.06, 0.025)], 0.022, 6, 8),
      C.galv,
    );
    m.add(
      tube([p(-0.1, frame - 0.06, 0.025), p(0, frame - 0.07, 0.022), p(0.1, frame - 0.06, 0.025)], 0.022, 6, 6),
      C.galv,
    );
    m.add(box([0.06, 0.012, 0.06]), C.rubber, { at: p(0, frame - 0.07, 0.006) });
  }
  // the springs under the pad's edge (seen from beside it)
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    m.add(rod(0.008, 0.008, frame - r - 0.02, "x", 4), C.galvDark, {
      at: [u + Math.cos(a) * (r + frame) * 0.5, y - 0.02, v + Math.sin(a) * (r + frame) * 0.5],
      rot: [0, -a, 0],
    });
  }
  // the mat: a disc, its stitched ring, a mark at its middle
  m.add(cyl(r, r, 0.01, 40), C.mat, { at: [u, y, v] });
  m.add(ring(r - 0.06, 0.004, 3, 40), 0x55585e, { at: [u, top + 0.001, v] });
  m.add(ring(0.16, 0.012, 3, 24), pads[0], { at: [u, top + 0.001, v] });
  m.add(cyl(0.05, 0.05, 0.002, 12), pads[1], { at: [u, top, v] });
  // the pads, in eight segments
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2;
    const a1 = ((k + 1) / 8) * Math.PI * 2;
    const g = lathe(
      [
        [r - 0.02, 0],
        [r - 0.03, 0.035],
        [r + 0.01, 0.05],
        [frame + 0.01, 0.05],
        [frame + 0.04, 0.03],
        [frame + 0.04, 0],
        [r - 0.02, 0],
      ],
      64,
    );
    // (a lathe's full turn, cut to the segment: keep its triangles inside a0..a1)
    const p = g.index ? g.toNonIndexed() : g;
    const src = p.attributes.position.array;
    const pos: number[] = [];
    for (let t = 0; t < src.length; t += 9) {
      const cx = (src[t] + src[t + 3] + src[t + 6]) / 3;
      const cz = (src[t + 2] + src[t + 5] + src[t + 8]) / 3;
      let a = Math.atan2(cz, cx);
      if (a < 0) a += Math.PI * 2;
      if (a >= a0 && a < a1) for (let q = 0; q < 9; q++) pos.push(src[t + q]);
    }
    p.dispose();
    m.add(geo(pos), pads[k % 2], { at: [u, y - 0.012, v] });
  }
  // the ladder at the front-right corner: two rails up to the frame, two treads
  const d = Math.SQRT1_2;
  const at = (rr: number, yy: number, side: number): V3 => [u + d * rr - d * side, yy, v + d * rr + d * side];
  for (const s of [-0.18, 0.18]) m.add(bar(at(1.88, 0, s), at(1.44, top + 0.02, s), 0.018, 6), C.galv);
  for (const [rr, yy] of [
    [1.722, 0.28],
    [1.575, 0.54],
  ])
    m.add(box([0.12, 0.025, 0.38], 0.004), C.galvDark, { at: at(rr, yy - 0.012, 0), rot: [0, -Math.PI / 4, 0] });
  // a ball rolled under it
  if (o.seed > 0.55) m.add(ball(0.11, 10), 0xf08a2a, { at: [u - 0.5, 0.11, v + 0.45] });
}

// ── the quarter pipe (3×3) ────────────────────────────────────────────────────────────────────────
/** A quarter pipe 1.2 m high: its transition a quarter circle (1.6 m round) from the toe at the front
 *  up to the coping at its lip, a deck behind it, the side panels cut to its curve; plywood with a
 *  board left on its deck by its seed, painted steel over a frame, or poured concrete. */
function quarterPipe(m: Model, o: Look) {
  const { r, toe, top } = QP;
  const cMax = Math.acos(1 - top / r);
  const lip = toe - r * Math.sin(cMax);
  const surf = o.look === 0 ? C.ply : o.look === 1 ? 0x8d9399 : 0xb3ada2;
  const side = o.look === 0 ? C.plyDark : o.look === 1 ? 0x3a3f46 : 0x9d978c;
  const at = (c: number): [number, number] => [toe - r * Math.sin(c), r * (1 - Math.cos(c))];
  // the riding face, in strips along its curve
  const n = 14;
  for (let i = 0; i < n; i++) {
    const [z0, y0] = at((i / n) * cMax);
    const [z1, y1] = at(((i + 1) / n) * cMax);
    const len = Math.hypot(z1 - z0, y1 - y0);
    const ang = Math.atan2(y1 - y0, z0 - z1);
    m.add(box([2.92, 0.02, len + 0.004]), i % 2 ? surf : shade(surf, 0.97), {
      at: [1.5, (y0 + y1) / 2 + 0.001 * Math.cos(ang), (z0 + z1) / 2 + 0.001 * Math.sin(ang)],
      rot: [ang, 0, 0],
    });
    // (a steel face's seams; a plywood one's screw lines)
    if (i % 3 === 1)
      m.add(box([2.92, 0.003, 0.012]), o.look === 0 ? shade(surf, 0.75) : shade(surf, 0.65), {
        at: [1.5, (y0 + y1) / 2 + 0.001, (z0 + z1) / 2],
        rot: [ang, 0, 0],
      });
  }
  // the side panels cut to the curve (an outline in z, y; drawn along x)
  const outline: [number, number][] = [
    [0, 0],
    [toe, 0],
  ];
  for (let i = 1; i <= n; i++) {
    const [z, y] = at((i / n) * cMax);
    outline.push([z, y]);
  }
  outline.push([0, top]);
  const thick = o.look === 2 ? 0.12 : 0.03;
  for (const x of [thick / 2, 3 - thick / 2])
    m.add(extrude(outline, thick), side, { at: [x, 0, 0], rot: [0, -Math.PI / 2, 0] });
  // the deck, the coping at the lip, the back
  m.add(box([3, 0.03, lip], 0, 1), o.look === 2 ? shade(surf, 0.92) : shade(surf, 0.9), {
    at: [1.5, top - 0.015, lip / 2],
  });
  if (o.look === 0)
    for (let i = 1; i < 6; i++) m.add(box([3, 0.002, 0.006]), C.plyDark, { at: [1.5, top + 0.001, (i * lip) / 6] });
  m.add(rod(0.032, 0.032, 3, "x", 12), o.look === 1 ? 0xd8b02a : P.chrome, { at: [1.5, top + 0.005, lip + 0.02] });
  m.add(box([3, top, 0.03]), side, { at: [1.5, top / 2, 0.015] });
  if (o.look !== 2)
    for (const y of [0.3, 0.7, 1.05]) m.add(box([2.94, 0.06, 0.012]), shade(side, 0.85), { at: [1.5, y, 0.036] });
  // the toe's plate, flush to the ground
  m.add(box([2.94, 0.006, 0.12]), C.galvDark, { at: [1.5, 0.003, toe - 0.06] });
  // bolts down the steel face's sides
  if (o.look === 1)
    for (let i = 1; i < n; i += 2) {
      const [z, y] = at((i / n) * cMax);
      for (const x of [0.06, 2.94]) m.add(cyl(0.012, 0.012, 0.006, 6), P.ink, { at: [x, y + 0.002, z] });
    }
  // stickers on a side, by its seed
  for (let i = 0; i < 3; i++)
    if (rnd(i, 1, o.seed) > 0.4)
      m.add(
        box([0.003, 0.08 + rnd(i, 2, o.seed) * 0.06, 0.12]),
        BRIGHT[Math.floor(rnd(i, 3, o.seed) * BRIGHT.length)],
        {
          at: [3 - thick - 0.002 + thick + 0.003, 0.3 + i * 0.22, 0.5 + i * 0.35],
        },
      );
  // a skateboard rolled back down to the toe, lying on the face
  if (o.seed > 0.5) {
    const [zm] = at(0.3);
    const [, ym] = at(0.3);
    const tilt = 0.3;
    const sk = [
      box([0.2, 0.012, 0.8], 0.006, 2).translate(0, 0.08, 0),
      box([0.16, 0.02, 0.04]).translate(0, 0.064, -0.24),
      box([0.16, 0.02, 0.04]).translate(0, 0.064, 0.24),
    ];
    m.add(merged(sk), 0x2b2a26, { at: [2.3, ym + 0.004, zm], rot: [tilt, 0.15, 0] });
    m.add(box([0.19, 0.003, 0.78], 0.004).translate(0, 0.088, 0), 0xc4402b, {
      at: [2.3, ym + 0.004, zm],
      rot: [tilt, 0.15, 0],
    });
    const wheels = [-0.24, 0.24].flatMap((z) =>
      [-1, 1].map((s) =>
        cyl(0.027, 0.027, 0.032, 10)
          .rotateZ(Math.PI / 2)
          .translate(s * 0.09, 0.027, z),
      ),
    );
    m.add(merged(wheels), P.cream, { at: [2.3, ym + 0.004, zm], rot: [tilt, 0.15, 0] });
  }
}

// ── the zip line (10×1) ───────────────────────────────────────────────────────────────────────────
/** A zip line: a platform 0.9 m up with its steps and a rail round it, the start pole through it, the
 *  cable sagging 9.4 m to the end pole with a tyre for a bumper, the trolley and its T handle hanging
 *  at the start (swaying), a bed of bark under the end; timber poles or steel. */
function zipLine(m: Model, o: Look) {
  const steel = o.look === 1;
  const pole = steel ? C.galv : C.timber;
  const deckC = steel ? C.galvDark : shade(C.timber, 1.1);
  const D = ZIP.deck;
  // the platform: boards on a frame, its legs, a rail at the back and sides; the steps up
  for (let i = 0; i < 6; i++)
    m.add(box([1.0, 0.035, 0.145], 0.004), i % 2 ? deckC : shade(deckC, 0.94), {
      at: [0.55, D - 0.018, 0.115 + i * 0.154],
    });
  m.add(box([1.0, 0.14, 0.88]), shade(deckC, 0.8), { at: [0.55, D - 0.1, 0.5] });
  for (const x of [0.1, 1.0])
    for (const z of [0.1, 0.9]) m.add(box([0.09, D - 0.04, 0.09], 0.004), pole, { at: [x, (D - 0.04) / 2, z] });
  for (const [a, b] of [
    [
      [0.1, 0.1],
      [1.0, 0.9],
    ],
    [
      [0.1, 0.9],
      [1.0, 0.1],
    ],
  ] as const)
    m.add(bar([a[0], 0.08, a[1]], [b[0], D - 0.2, b[1]], 0.02, 6), shade(pole, 0.85));
  for (const z of [0.08, 0.92]) {
    for (const x of [0.48, 1.0]) m.add(cyl(0.025, 0.025, 1.0, 8), pole, { at: [x, D, z] });
    m.add(rod(0.025, 0.025, 0.94, "x", 8), pole, { at: [0.55, D + 1.0, z] });
    m.add(rod(0.018, 0.018, 0.94, "x", 8), pole, { at: [0.55, D + 0.5, z] });
  }
  for (const [x0, y] of [
    [1.06, 0.6],
    [1.34, 0.3],
  ]) {
    m.add(box([0.28, 0.035, 0.56], 0.004), deckC, { at: [x0 + 0.14, y - 0.018, 0.5] });
    for (const z of [0.24, 0.76]) m.add(box([0.05, y - 0.035, 0.05]), pole, { at: [x0 + 0.14, (y - 0.035) / 2, z] });
  }
  // the poles: the start through the platform, the end; their caps, a crossarm for the cable
  const [sx, sy, sz] = ZIP.from;
  const [ex, ey] = ZIP.to;
  const poleR = steel ? 0.11 : 0.13;
  for (const [x, h] of [
    [sx, sy + 0.17],
    [ex, ey + 0.17],
  ]) {
    m.add(cyl(poleR, poleR * 0.92, h, 12), pole, { at: [x, 0, sz] });
    m.add(cyl(poleR + 0.01, poleR + 0.01, 0.04, 12), steel ? P.ink : shade(pole, 0.7), { at: [x, h - 0.04, sz] });
    if (steel)
      for (let i = 0; i < 3; i++)
        m.add(cyl(poleR + 0.003, poleR + 0.003, 0.08, 12), i % 2 ? P.ink : C.hazard, { at: [x, 0.05 + i * 0.08, sz] });
    m.add(box([0.12, 0.08, 0.3], 0.006), C.galvDark, { at: [x, h - 0.2, sz] });
  }
  // the cable, sagging
  const pts: V3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([sx + (ex - sx) * t, sy + (ey - sy) * t - ZIP.sag * 4 * t * (1 - t), sz]);
  }
  m.add(tube(pts, 0.008, 4, 36), 0x6e7376);
  // the bumper: a tyre on the cable before the end pole, a spring
  const yAt = (x: number) => {
    const t = (x - sx) / (ex - sx);
    return sy + (ey - sy) * t - ZIP.sag * 4 * t * (1 - t);
  };
  m.add(ring(0.18, 0.07, 6, 14), C.rubber, { at: [ex - 0.45, yAt(ex - 0.45), sz], rot: [0, 0, Math.PI / 2] });
  m.add(rod(0.03, 0.03, 0.3, "x", 8), 0xd04040, { at: [ex - 0.25, yAt(ex - 0.25), sz] });
  // bark under the end, a sign at the start
  for (let i = 0; i < 9; i++)
    m.add(cyl(0.3 + rnd(i, 1, 4) * 0.1, 0.3, 0.01, 8), shade(C.chips, 0.9 + rnd(i, 2, 4) * 0.2), {
      at: [7.9 + i * 0.16, 0.004 + i * 0.0005, 0.5 + (rnd(i, 3, 4) - 0.5) * 0.1],
    });
  m.add(box([0.36, 0.24, 0.02], 0.004), C.hazard, { at: [0.55, D + 0.75, 0.94] });
  m.add(box([0.26, 0.04, 0.004]), P.ink, { at: [0.55, D + 0.78, 0.951] });
  // the trolley and its handle (live: swaying from the pulley)
  const tx = 0.9;
  const ty = yAt(tx);
  const hang = ZIP.grip;
  const swing = merged([
    box([0.14, 0.08, 0.06], 0.01).translate(0, -0.03, 0),
    rod(0.03, 0.03, 0.03, "z", 10).translate(-0.04, 0.01, 0),
    rod(0.03, 0.03, 0.03, "z", 10).translate(0.04, 0.01, 0),
    cyl(0.008, 0.008, hang - 0.1).translate(0, -hang + 0.03, 0),
    rod(0.022, 0.022, 0.52, "z", 8).translate(0, -hang, 0),
  ]);
  m.live(swing, C.galvDark, { kind: "nod", amp: 0.05, period: 3.4, phase: o.seed }, { at: [tx, ty, sz] });
  const grips = merged([
    rod(0.026, 0.026, 0.14, "z", 8).translate(0, -hang, -0.17),
    rod(0.026, 0.026, 0.14, "z", 8).translate(0, -hang, 0.17),
  ]);
  m.live(grips, 0x2b2b2e, { kind: "nod", amp: 0.05, period: 3.4, phase: o.seed }, { at: [tx, ty, sz] });
}

// ── the cargo net (4×1) ───────────────────────────────────────────────────────────────────────────
/** A cargo net to climb: two poles and a beam over them, the net hung from it in a 0.3 m mesh of
 *  rope, knotted where its ropes cross, lashed at the top and staked at its foot, swelling a little;
 *  hemp on timber, blue rope on steel, black on green steel. */
function cargoNet(m: Model, o: Look) {
  const steel = o.look !== 0;
  const pole = o.look === 0 ? C.timber : o.look === 1 ? C.galv : C.green;
  const rope = o.look === 0 ? C.rope : o.look === 1 ? C.ropeBlue : C.ropeBlack;
  const top = 2.86;
  for (const x of [0.12, 3.88]) {
    m.add(cyl(steel ? 0.08 : 0.11, steel ? 0.08 : 0.1, 3.06, 12), pole, { at: [x, 0, 0.5] });
    m.add(cyl(0.12, 0.12, 0.05, 12), steel ? C.concrete : shade(C.timber, 0.75), { at: [x, 0, 0.5] });
  }
  if (steel) m.add(box([4, 0.16, 0.16], 0.01), pole, { at: [2, 3.0, 0.5] });
  else {
    m.add(rod(0.1, 0.1, 4, "x", 12), C.timber, { at: [2, 3.0, 0.5] });
    for (const x of [0.005, 3.995])
      m.add(cyl(0.09, 0.09, 0.004, 12), C.sapwood, { at: [x, 3.0, 0.5], rot: [0, 0, Math.PI / 2] });
  }
  // the net
  const [x0, x1] = [0.28, 3.72];
  const nx = 12;
  const ny = 9;
  const bulge = (x: number, y: number) =>
    0.035 * Math.sin((Math.PI * (x - x0)) / (x1 - x0)) * Math.sin((Math.PI * y) / top);
  const ropes: BufferGeometry[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    const pts: V3[] = [];
    for (let j = 0; j <= ny; j++) {
      const y = 0.05 + ((top - 0.05) * j) / ny;
      pts.push([x, y, 0.5 + bulge(x, y)]);
    }
    ropes.push(tube(pts, 0.012, 4, 14));
  }
  for (let j = 0; j <= ny; j++) {
    const y = 0.05 + ((top - 0.05) * j) / ny;
    const pts: V3[] = [];
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      pts.push([x, y - 0.03 * Math.sin((Math.PI * i) / nx) * (j > 0 && j < ny ? 1 : 0), 0.5 + bulge(x, y)]);
    }
    ropes.push(tube(pts, 0.012, 4, 24));
  }
  m.add(merged(ropes), rope);
  const knots: BufferGeometry[] = [];
  for (let i = 0; i <= nx; i++)
    for (let j = 1; j < ny; j++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const y = 0.05 + ((top - 0.05) * j) / ny - 0.03 * Math.sin((Math.PI * i) / nx);
      knots.push(
        box([0.032, 0.032, 0.032])
          .rotateY(0.785)
          .translate(x, y, 0.5 + bulge(x, y)),
      );
    }
  m.add(merged(knots), shade(rope, 0.82));
  // lashed to the beam; staked at the foot; the net's sides tied to the poles
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    m.add(ring(0.085, 0.012, 3, 8), shade(rope, 0.9), { at: [x, 2.98, 0.5], rot: [0, 0, Math.PI / 2] });
    m.add(box([0.03, 0.06, 0.03]), C.galvDark, { at: [x, 0.03, 0.5] });
  }
  for (const [x, s] of [
    [x0, -1],
    [x1, 1],
  ] as const)
    for (let j = 1; j < ny; j += 2) {
      const y = 0.05 + ((top - 0.05) * j) / ny;
      m.add(
        tube(
          [
            [x, y, 0.5],
            [x + s * 0.08, y + 0.02, 0.5],
            [x + s * 0.16, y, 0.5],
          ],
          0.01,
          4,
          4,
        ),
        shade(rope, 0.9),
      );
    }
}

// ── the tyre run (4×2) ────────────────────────────────────────────────────────────────────────────
const TYRE = lathePts();
function lathePts(): [number, number][] {
  const [ri, ro, h] = [0.17, TYRE_R, TYRE_H];
  return [
    [ri + 0.02, 0],
    [ro - 0.03, 0],
    [ro, 0.04],
    [ro, h - 0.04],
    [ro - 0.03, h],
    [ri + 0.02, h],
    [ri, h - 0.04],
    [ri, 0.04],
    [ri + 0.02, 0],
  ];
}
/** A tyre run: ten old tyres laid in two rows, touching, their treads; plain black, painted in a
 *  playground's colours, or set in a timber frame on bark. One with a white wall by its seed. */
function tyreRun(m: Model, o: Look) {
  const white = Math.floor(o.seed * TYRES.length);
  for (const [i, [u, v]] of TYRES.entries()) {
    const c = o.look === 1 ? BRIGHT[i % 5] : C.rubber;
    const tilt = (rnd(i, 1, 8) - 0.5) * 0.04;
    m.add(lathe(TYRE, 16), c, { at: [u, 0, v], rot: [tilt, rnd(i, 2, 8), 0] });
    // the tread: blocks round its outside
    const tread: BufferGeometry[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + i;
      tread.push(
        box([0.012, 0.11, 0.05])
          .rotateY(-a)
          .translate(Math.cos(a) * (TYRE_R + 0.002), TYRE_H / 2, Math.sin(a) * (TYRE_R + 0.002)),
      );
    }
    m.add(merged(tread), o.look === 1 ? shade(c, 0.7) : 0x19191b, { at: [u, 0, v] });
    // its hole: the ground (or the bark) showing
    m.add(cyl(0.17, 0.17, 0.005, 14), o.look === 2 ? C.chips : 0x4a4236, { at: [u, 0.004, v] });
    if (i === white && o.look !== 1) m.add(ring(0.25, 0.012, 3, 24), P.white, { at: [u, TYRE_H + 0.001, v] });
  }
  if (o.look === 2) {
    // the frame's boards, and the bark between the tyres
    for (const z of [0.27, 1.73]) m.add(box([3.7, 0.12, 0.05], 0.006), C.timber, { at: [2, 0.06, z] });
    for (const x of [0.15, 3.85]) m.add(box([0.05, 0.12, 1.46], 0.006), C.timber, { at: [x, 0.06, 1] });
    m.add(box([3.66, 0.02, 1.4]), C.chips, { at: [2, 0.01, 1] });
    for (const [x, z] of [
      [0.15, 0.27],
      [3.85, 0.27],
      [0.15, 1.73],
      [3.85, 1.73],
    ])
      m.add(box([0.06, 0.14, 0.06], 0.006), C.timberDark, { at: [x, 0.07, z] });
  }
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  pk_vault_box: vaultBox,
  pk_beam: beam,
  pk_monkey_bars: monkeyBars,
  pk_climb_wall: climbWall,
  pk_trampoline: trampoline,
  pk_quarter_pipe: quarterPipe,
  pk_zip_line: zipLine,
  pk_cargo_net: cargoNet,
  pk_tyre_run: tyreRun,
};
