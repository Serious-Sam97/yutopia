import { SEAT_SPEC, STAND, SURFACE } from "@yutopia/shared";
import type { BufferGeometry } from "three";
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
  tube,
  type V3,
} from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 18 (docs/plan/68-more-furniture.md): Kitchen & café — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/kitchen.ts. At the kitchen counter's 0.90 (tables.ts),
// with the fridge's and the microwave's care (staples.ts): an island and its counter stools, a range
// cooker (its hob's flames live while it's on), a sink unit, a dishwasher, a fruit bowl, a toaster, a
// kettle, a café counter with its lit pastry case, an ice-cream freezer.

export const LOOKS: Record<string, readonly string[]> = {
  kitchen_island: ["White and marble", "Walnut and butcher block", "Sage and terrazzo"],
  counter_stool: ["Oak and rush", "Black steel, leather", "Bentwood"],
  kitchen_stove: ["Cream range", "Steel range", "Black enamel"],
  kitchen_sink: ["Belfast sink", "Steel sink", "Copper sink"],
  dishwasher: ["Steel", "White", "Integrated oak"],
  fruit_bowl: ["Olive wood bowl", "Blue glazed bowl", "Wire basket"],
  toaster: ["Cream retro", "Chrome", "Red"],
  kettle: ["Steel jug", "Cream dome", "Stovetop whistler"],
  cafe_counter: ["Oak and white tile", "Black and brass", "Mint and marble"],
  ice_cream_freezer: ["White, blue sign", "Pastel", "Red"],
};

const K = {
  shaker: 0xece8df,
  marble: 0xe8e6e2,
  vein: 0xa9a7a6,
  walnut: P.walnut,
  block: 0xc89a62,
  blockDark: 0xa87a46,
  sage: 0x8fa38a,
  terrazzo: 0xe6dfd2,
  enamel: 0x232528,
  steel: 0xb7bbbe,
  steelDark: 0x7d8286,
  ceramic: 0xf2efe8,
  copper: 0xb8693a,
  copperDark: 0x8a4a26,
  flameBlue: 0x4f7dff,
  flameCore: 0xbfd8ff,
  bread: 0xd9a35e,
  crust: 0x8a5a2e,
  tile: 0xf0eee8,
  mint: 0x9fd1bd,
  brass: P.brass,
  frost: 0xd6ecf5,
  glass: 0xcfe6ff,
};
const SCOOPS = [0xf3e3b8, 0xf4a6b8, 0x6b3f2a, 0xb7d68a, 0xffc35a, 0x9fd6f0, 0xe9e6df, 0xd85a6a];

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A bar handle on stand-offs, along x (`len` long) at `at`, out toward +z (or −z: `s` −1). */
function barHandle(m: Model, at: V3, len: number, c: number, s = 1) {
  m.add(rod(0.009, 0.009, len, "x", 8), c, { at: [at[0], at[1], at[2] + s * 0.03] });
  for (const dx of [-len / 2 + 0.02, len / 2 - 0.02])
    m.add(rod(0.006, 0.006, 0.03, "z", 6), c, { at: [at[0] + dx, at[1], at[2] + s * 0.015] });
}

/** A shaker door or drawer front on a face looking +z (`s` −1: −z): its frame and its sunk panel. */
function shaker(m: Model, at: V3, w: number, h: number, c: number, s = 1) {
  m.add(box([w, h, 0.02], 0.003), c, { at });
  if (w > 0.12 && h > 0.12)
    m.add(box([w - 0.11, h - 0.11, 0.006]), shade(c, 0.9), { at: [at[0], at[1], at[2] + s * 0.009] });
}

// ── the island (2×1) ──────────────────────────────────────────────────────────────────────────────
/** A kitchen island at the counter's 0.90: the cook's side (−z) drawers and doors with bar handles,
 *  the stools' side (+z) panelled under a top that overhangs it for their knees, on corbels; white
 *  shaker under marble, walnut under butcher block, or sage under terrazzo (its cabinets painted). A
 *  tea towel on its end rail by its seed. */
function island(m: Model, o: Look) {
  const H = SURFACE.kitchen_island ?? 0.9;
  const cab = o.fabric ?? (o.look === 0 ? K.shaker : o.look === 1 ? K.walnut : K.sage);
  const topC = o.look === 0 ? K.marble : o.look === 1 ? K.block : K.terrazzo;
  const pull = o.look === 1 ? P.chrome : P.brass;
  const [z0, z1] = [0.04, 0.72];
  const th = 0.04;
  // the plinth set in, the carcass, its ends
  m.add(box([1.88, 0.1, z1 - z0 - 0.08]), P.walnutDark, { at: [1, 0.05, (z0 + z1) / 2] });
  m.add(box([1.92, H - th - 0.1, z1 - z0 - 0.04], 0.004), shade(cab, 0.9), {
    at: [1, 0.1 + (H - th - 0.1) / 2, (z0 + z1) / 2],
  });
  for (const x of [0.04, 1.96])
    m.add(box([0.03, H - th, z1 - z0], 0.004), cab, { at: [x, (H - th) / 2, (z0 + z1) / 2] });
  // the cook's side: three drawers, two doors, a deep pan drawer under a shallow one
  const fz = z0 + 0.01;
  const yb = 0.12;
  const yt = H - th - 0.02;
  const span = yt - yb;
  for (let i = 0; i < 3; i++) {
    const h = span / 3 - 0.01;
    const y = yb + h / 2 + i * (span / 3);
    shaker(m, [0.36, y, fz], 0.56, h, cab, -1);
    barHandle(m, [0.36, y + h / 2 - 0.05, fz - 0.01], 0.22, pull, -1);
  }
  for (const x of [0.83, 1.17]) {
    shaker(m, [x, yb + span / 2, fz], 0.33, span - 0.01, cab, -1);
    m.add(rod(0.008, 0.008, 0.16, "x", 6), pull, {
      at: [x + (x < 1 ? 0.1 : -0.1), yt - 0.12, fz - 0.035],
      rot: [0, 0, Math.PI / 2],
    });
  }
  shaker(m, [1.64, yb + span * 0.35, fz], 0.56, span * 0.7 - 0.01, cab, -1);
  barHandle(m, [1.64, yb + span * 0.7 - 0.06, fz - 0.01], 0.3, pull, -1);
  shaker(m, [1.64, yb + span * 0.85, fz], 0.56, span * 0.3 - 0.01, cab, -1);
  barHandle(m, [1.64, yb + span * 0.85, fz - 0.01], 0.22, pull, -1);
  // the stools' side: three sunk panels; corbels under the overhang
  for (const x of [0.36, 1, 1.64]) shaker(m, [x, yb + span / 2, z1], 0.6, span, cab);
  for (const x of [0.2, 1, 1.8])
    m.add(
      extrude(
        [
          [0, 0],
          [0.2, 0],
          [0.2, -0.04],
          [0.05, -0.2],
          [0, -0.2],
        ],
        0.05,
        0.004,
      ),
      cab,
      { at: [x, H - th, z1], rot: [0, -Math.PI / 2, 0] },
    );
  // the top, overhanging the stools' side
  m.add(box([1.96, th, 0.96], 0.006, 2), topC, { at: [1, H - th / 2, 0.5] });
  if (o.look === 0) {
    // the marble's veins
    for (let i = 0; i < 8; i++)
      m.add(box([0.3 + rnd(i, 2, 3) * 0.3, 0.0015, 0.006]), K.vein, {
        at: [0.45 + rnd(i, 1, 3) * 1.1, H + 0.0005, 0.3 + rnd(i, 3, 3) * 0.4],
        rot: [0, (rnd(i, 4, 3) - 0.5) * 1.2, 0],
      });
  } else if (o.look === 1) {
    // the block's staves
    for (let i = 0; i < 12; i++)
      m.add(box([1.96, 0.0015, 0.074]), i % 2 ? K.blockDark : shade(K.block, 1.05), {
        at: [1, H + 0.0005, 0.06 + i * 0.08],
      });
  } else {
    // the terrazzo's chips
    const chips = [0x6b8a6a, 0xc4622b, 0x2f3a3c, 0xd9a441, 0xa9a7a6];
    const g: BufferGeometry[] = [];
    for (let i = 0; i < 70; i++)
      g.push(
        box([0.02 + rnd(i, 1, 4) * 0.025, 0.0015, 0.015 + rnd(i, 2, 4) * 0.02])
          .rotateY(rnd(i, 3, 4) * 3)
          .translate(0.06 + rnd(i, 4, 4) * 1.88, H + 0.0005, 0.06 + rnd(i, 5, 4) * 0.88),
      );
    for (let k = 0; k < chips.length; k++) m.add(merged(g.filter((_, i) => i % chips.length === k)), chips[k]);
  }
  // the end's towel rail, a towel by its seed
  m.add(rod(0.008, 0.008, 0.4, "z", 6), pull, { at: [1.995, 0.7, 0.38] });
  for (const z of [0.2, 0.56]) m.add(rod(0.006, 0.006, 0.02, "x", 6), pull, { at: [1.985, 0.7, z] });
  if (o.seed > 0.45) {
    m.add(box([0.012, 0.36, 0.2], 0.004), o.seed > 0.75 ? 0xc4402b : 0x3f6b8a, { at: [1.99, 0.55, 0.38] });
    for (const y of [0.45, 0.62]) m.add(box([0.013, 0.012, 0.2]), P.white, { at: [1.991, y, 0.38] });
  }
}

// ── the counter stool (1×1) ───────────────────────────────────────────────────────────────────────
/** A counter stool, its seat at the spec (0.65: an island's or a counter's): four splayed legs and a
 *  footrest, a low back that hoops behind; oak with a rush seat, black steel with a leather pad, or
 *  bentwood with a cane seat and a ring for the feet. */
function counterStool(m: Model, o: Look) {
  const spec = SEAT_SPEC.counter_stool;
  const top = spec?.top ?? 0.65;
  const rest = spec?.rest ?? 0.25;
  const [u, v] = [0.5, 0.5];
  const wood = o.look === 0 ? P.oak : o.look === 1 ? 0x1f1f22 : 0x4a2c1b;
  const seatR = 0.19;
  const legR = o.look === 1 ? 0.012 : 0.017;
  const seatY = top - 0.04;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    m.add(
      tube(
        [
          [u + sx * 0.12, seatY, v + sz * 0.12],
          [u + sx * 0.16, seatY * 0.5, v + sz * 0.16],
          [u + sx * 0.2, 0.01, v + sz * 0.2],
        ],
        legR,
        6,
        6,
      ),
      wood,
    );
    m.add(cyl(legR + 0.003, legR + 0.003, 0.012, 6), P.rubber, { at: [u + sx * 0.2, 0, v + sz * 0.2] });
  }
  // the footrest: a ring (bentwood, steel) or stretchers (oak)
  const k = 0.16 + ((0.2 - 0.16) * (seatY * 0.5 - rest)) / (seatY * 0.5);
  if (o.look === 0)
    for (const [a, b] of [
      [
        [-1, 1],
        [1, 1],
      ],
      [
        [-1, -1],
        [1, -1],
      ],
      [
        [-1, -1],
        [-1, 1],
      ],
      [
        [1, -1],
        [1, 1],
      ],
    ] as const) {
      const len = 2 * k;
      const along = a[0] === b[0] ? "z" : "x";
      m.add(rod(0.012, 0.012, len, along, 6), wood, {
        at: [u + (along === "x" ? 0 : a[0] * k), rest, v + (along === "z" ? 0 : a[1] * k)],
      });
    }
  else m.add(ring(k * 1.3, 0.011, 5, 20), o.look === 1 ? P.chrome : wood, { at: [u, rest, v] });
  // the seat
  if (o.look === 0) {
    m.add(box([0.36, 0.035, 0.36], 0.006), wood, { at: [u, seatY + 0.0175, v] });
    const rush = o.fabric ?? 0xc9a86a;
    m.add(cushion([0.32, 0.03, 0.32], 0.15, 2), rush, { at: [u, top - 0.012, v] });
    for (let i = 0; i < 7; i++)
      m.add(box([0.3, 0.002, 0.008]), shade(rush, 0.8), {
        at: [u, top + 0.003, v - 0.135 + i * 0.045],
        rot: [0, 0.78, 0],
      });
  } else if (o.look === 1) {
    m.add(cyl(seatR - 0.02, seatR - 0.02, 0.02, 16), wood, { at: [u, seatY, v] });
    m.add(cushion([seatR * 2, 0.045, seatR * 2], 0.15, 2), o.fabric ?? P.cognac, {
      at: [u, top - 0.02, v],
      scale: [1, 1, 1],
    });
    m.add(ring(seatR - 0.01, 0.006, 3, 20), shade(o.fabric ?? P.cognac, 0.75), { at: [u, top - 0.02, v] });
  } else {
    m.add(cyl(seatR, seatR, 0.03, 18), wood, { at: [u, seatY + 0.005, v] });
    m.add(cyl(seatR - 0.025, seatR - 0.025, 0.004, 18), o.fabric ?? 0xd8bf8a, { at: [u, top - 0.004, v] });
    for (let i = 0; i < 6; i++)
      m.add(box([0.3, 0.0015, 0.006]), 0xb59a6a, { at: [u, top + 0.0005, v - 0.13 + i * 0.052], rot: [0, 0.6, 0] });
  }
  // the low back: two posts and a rail curved round the sitter, behind (−z)
  const bz = v + (spec?.rear ?? -0.17);
  const backTop = top + 0.22;
  for (const sx of [-1, 1])
    m.add(
      tube(
        [
          [u + sx * 0.12, seatY, bz + 0.03],
          [u + sx * 0.13, backTop - 0.04, bz - 0.005],
        ],
        0.011,
        6,
        4,
      ),
      wood,
    );
  const pts: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.15 + (0.7 * i) / 8);
    pts.push([u + Math.cos(a) * 0.17, backTop - 0.03, v - Math.sin(a) * 0.15 - 0.02]);
  }
  if (o.look === 2) m.add(tube(pts, 0.014, 6, 16), wood);
  else m.add(tube(pts, 0.03, 4, 16), o.look === 1 ? (o.fabric ?? P.cognac) : wood, { scale: [1, 1, 1] });
}

// ── the range cooker (1×1) ────────────────────────────────────────────────────────────────────────
/** A range cooker: an oven with a window and a towel rail, a drawer under, knobs along a fascia, a gas
 *  hob of four burners under cast-iron trivets, a backguard with its clock; two burners lit (live
 *  flames, blue, while it's on: `props.on`, switched as a lamp is), the oven's window glowing. Cream,
 *  steel or black enamel. A tea towel over the rail by its seed. */
function stove(m: Model, o: Look) {
  const top = (SURFACE.kitchen_stove ?? 0.93) - 0.03; // (the hob; the trivets over it)
  const body = o.look === 0 ? 0xe6dcc4 : o.look === 1 ? K.steel : K.enamel;
  const trim = o.look === 1 ? K.steelDark : o.look === 2 ? P.brass : P.chrome;
  const on = o.on !== false;
  const [x0, x1, z0, z1] = [0.06, 0.94, 0.08, 0.9];
  // feet, the carcass
  for (const x of [0.12, 0.88])
    for (const z of [0.14, 0.84]) m.add(cyl(0.02, 0.02, 0.04, 8), P.rubber, { at: [x, 0, z] });
  m.add(box([x1 - x0, top - 0.04, z1 - z0], 0.008), body, { at: [0.5, 0.04 + (top - 0.04) / 2, (z0 + z1) / 2] });
  // the drawer at the foot
  m.add(box([0.82, 0.13, 0.02], 0.004), shade(body, 1.05), { at: [0.5, 0.12, z1 + 0.01] });
  barHandle(m, [0.5, 0.15, z1 + 0.02], 0.4, trim);
  // the oven door: its frame, its window (lit inside while on), the rail across its top
  m.add(box([0.82, 0.5, 0.025], 0.006), shade(body, 1.04), { at: [0.5, 0.47, z1 + 0.0125] });
  m.add(box([0.56, 0.26, 0.006], 0.004), 0x1a1c1d, { at: [0.5, 0.45, z1 + 0.026] });
  // (while it's on, its light inside: a glow behind the window's racks and a dish on them)
  if (on) m.add(box([0.5, 0.2, 0.002]), 0x5a2e14, { at: [0.5, 0.45, z1 + 0.027], glow: true });
  for (const y of [0.4, 0.5]) m.add(box([0.52, 0.008, 0.003]), 0x0e0e0f, { at: [0.5, y, z1 + 0.029] });
  m.add(box([0.24, 0.05, 0.003], 0.004), 0x2a1a10, { at: [0.5, 0.428, z1 + 0.03] });
  m.add(rod(0.012, 0.012, 0.72, "x", 8), trim, { at: [0.5, 0.69, z1 + 0.045] });
  for (const x of [0.16, 0.84]) m.add(box([0.02, 0.02, 0.045]), trim, { at: [x, 0.69, z1 + 0.022] });
  if (o.seed > 0.5) {
    const t = o.seed > 0.75 ? 0xc4402b : 0x3f6b8a;
    m.add(box([0.22, 0.02, 0.014], 0.004), t, { at: [0.36, 0.7, z1 + 0.05] });
    m.add(box([0.22, 0.24, 0.008], 0.003), t, { at: [0.36, 0.58, z1 + 0.06] });
    for (const y of [0.52, 0.64]) m.add(box([0.222, 0.012, 0.009]), P.white, { at: [0.36, y, z1 + 0.061] });
  }
  // the fascia's knobs and the ignition button
  for (let i = 0; i < 5; i++) {
    const x = 0.18 + i * 0.16;
    m.add(cyl(0.022, 0.026, 0.025, 12), i === 2 ? shade(body, 0.6) : trim, {
      at: [x, 0.8, z1],
      rot: [Math.PI / 2, 0, 0],
    });
    m.add(box([0.006, 0.026, 0.004]), P.ink, { at: [x, 0.8, z1 + 0.026], rot: [0, 0, i * 0.7] });
  }
  // the hob: its plate, four burners, the trivets
  m.add(box([x1 - x0 + 0.01, 0.012, z1 - z0 + 0.02], 0.004), o.look === 1 ? K.enamel : shade(body, 0.92), {
    at: [0.5, top + 0.006, (z0 + z1) / 2],
  });
  const burners: [number, number, number][] = [
    [0.29, 0.38, 0.05],
    [0.71, 0.38, 0.04],
    [0.29, 0.72, 0.04],
    [0.71, 0.72, 0.055],
  ];
  for (const [x, z, r] of burners) {
    m.add(cyl(r + 0.012, r + 0.008, 0.012, 14), 0x2a2a2c, { at: [x, top + 0.012, z] });
    m.add(cyl(r - 0.01, r - 0.012, 0.008, 14), o.look === 2 ? P.brass : 0x1b1b1d, { at: [x, top + 0.024, z] });
  }
  const iron = 0x1c1c1e;
  for (const zc of [0.38, 0.72]) {
    m.add(box([0.84, 0.018, 0.018]), iron, { at: [0.5, top + 0.035, zc - 0.15] });
    m.add(box([0.84, 0.018, 0.018]), iron, { at: [0.5, top + 0.035, zc + 0.15] });
    for (const x of [0.08, 0.29, 0.5, 0.71, 0.92]) m.add(box([0.018, 0.018, 0.3]), iron, { at: [x, top + 0.035, zc] });
    for (const x of [0.29, 0.71]) m.add(box([0.12, 0.016, 0.014]), iron, { at: [x, top + 0.038, zc] });
  }
  // the backguard: its clock
  m.add(box([x1 - x0, 0.17, 0.04], 0.006), body, { at: [0.5, top + 0.085 + 0.012, 0.11] });
  m.add(box([0.8, 0.012, 0.05], 0.004), trim, { at: [0.5, top + 0.18, 0.11] });
  m.add(cyl(0.05, 0.05, 0.01, 16), trim, { at: [0.5, top + 0.1, 0.13], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(0.042, 0.042, 0.004, 16), P.paperWhite, { at: [0.5, top + 0.1, 0.136], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.003, 0.03, 0.002]), P.ink, { at: [0.5, top + 0.112, 0.14] });
  m.add(box([0.024, 0.003, 0.002]), P.ink, { at: [0.51, top + 0.1, 0.14] });
  // the flames: two burners lit (by its seed), a ring of blue tongues round each, live
  if (on) {
    const lit = o.seed > 0.5 ? [1, 2] : [0, 3];
    for (const b of lit) {
      const [x, z, r] = burners[b];
      const outer: BufferGeometry[] = [];
      const inner: BufferGeometry[] = [];
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const [cx, cz] = [Math.cos(a) * (r - 0.004), Math.sin(a) * (r - 0.004)];
        outer.push(cyl(0.008, 0, 0.032, 5).rotateZ(-0.35).rotateY(-a).translate(cx, 0, cz));
        inner.push(cyl(0.005, 0, 0.016, 4).rotateZ(-0.35).rotateY(-a).translate(cx, 0, cz));
      }
      m.live(
        merged(outer),
        K.flameBlue,
        { kind: "flame", phase: b * 0.37 + o.seed },
        { at: [x, top + 0.028, z], glow: true },
      );
      m.live(
        merged(inner),
        K.flameCore,
        { kind: "flame", phase: b * 0.37 + o.seed + 0.2 },
        { at: [x, top + 0.028, z], glow: true },
      );
    }
  }
}

// ── the sink unit (1×1) ───────────────────────────────────────────────────────────────────────────
/** A sink unit at the counter's height: a deep Belfast basin in white fireclay with its apron out
 *  front over cream doors, an inset steel bowl in white doors, or a hammered copper apron over walnut;
 *  its bridge tap, the worktop round it, a washing-up bottle and a sponge by its seed. Its doors
 *  painted. */
function sink(m: Model, o: Look) {
  const H = STAND.kitchen_sink ?? 0.9;
  const cab = o.fabric ?? (o.look === 0 ? 0xe6dcc4 : o.look === 1 ? P.white : P.walnut);
  const topC = o.look === 2 ? K.block : o.look === 1 ? P.graphite : P.stone;
  const basin = o.look === 0 ? K.ceramic : o.look === 1 ? K.steel : K.copper;
  const tap = o.look === 2 ? P.brass : P.chrome;
  const th = 0.04;
  const apron = o.look !== 1;
  // the plinth, the carcass, two doors
  m.add(box([0.9, 0.1, 0.8]), P.walnutDark, { at: [0.5, 0.05, 0.47] });
  m.add(box([0.96, H - th - 0.1, 0.86], 0.004), shade(cab, 0.92), { at: [0.5, 0.1 + (H - th - 0.1) / 2, 0.5] });
  const doorTop = apron ? 0.6 : H - th - 0.02;
  for (const x of [0.265, 0.735]) {
    shaker(m, [x, 0.11 + (doorTop - 0.11) / 2, 0.94], 0.45, doorTop - 0.12, cab);
    m.add(ball(0.016, 6), tap, { at: [x + (x < 0.5 ? 0.17 : -0.17), doorTop - 0.1, 0.96] });
  }
  // the worktop round the basin's hole
  const [bx0, bx1, bz0, bz1] = [0.2, 0.8, 0.34, 0.97];
  m.add(box([0.98, th, bz0 - 0.03], 0.004), topC, { at: [0.5, H - th / 2, (0.03 + bz0) / 2] });
  for (const [a, b] of [
    [0.01, bx0],
    [bx1, 0.99],
  ])
    m.add(box([b - a, th, 0.94 - bz0 + 0.03], 0.004), topC, {
      at: [(a + b) / 2, H - th / 2, (bz0 + 0.97) / 2 - 0.015],
    });
  if (!apron) m.add(box([bx1 - bx0, th, 0.06], 0.004), topC, { at: [0.5, H - th / 2, 0.94] });
  // the basin: its walls and floor, hollow; a Belfast's apron out to the front
  const by = apron ? 0.62 : H - 0.2;
  const bzEnd = apron ? bz1 : 0.9;
  const wall = 0.025;
  m.add(box([bx1 - bx0, wall, bzEnd - bz0]), basin, { at: [0.5, by + wall / 2, (bz0 + bzEnd) / 2] });
  for (const x of [bx0 + wall / 2, bx1 - wall / 2])
    m.add(box([wall, H - by, bzEnd - bz0]), basin, { at: [x, (by + H) / 2, (bz0 + bzEnd) / 2] });
  for (const z of [bz0 + wall / 2, bzEnd - wall / 2])
    m.add(box([bx1 - bx0, H - by, wall]), basin, { at: [0.5, (by + H) / 2, z] });
  m.add(box([bx1 - bx0 - 0.05, 0.002, bzEnd - bz0 - 0.05]), shade(basin, 0.9), {
    at: [0.5, by + wall + 0.001, (bz0 + bzEnd) / 2],
  });
  m.add(cyl(0.03, 0.03, 0.003, 12), o.look === 1 ? P.ink : K.steelDark, {
    at: [0.5, by + wall + 0.002, (bz0 + bzEnd) / 2],
  });
  if (o.look === 2)
    for (let i = 0; i < 26; i++)
      m.add(cyl(0.011, 0.011, 0.002, 6), shade(K.copper, i % 2 ? 0.88 : 1.12), {
        at: [bx0 + 0.05 + rnd(i, 1, 2) * 0.5, by + 0.05 + rnd(i, 2, 2) * (H - by - 0.1), bzEnd + 0.001],
        rot: [Math.PI / 2, 0, 0],
      });
  // the bridge tap: two pillars, the bridge, the swan neck, cross handles
  const tz = 0.18;
  for (const x of [0.4, 0.6]) {
    m.add(cyl(0.02, 0.018, 0.12, 10), tap, { at: [x, H, tz] });
    m.add(rod(0.006, 0.006, 0.08, "x", 6), tap, { at: [x, H + 0.15, tz] });
    m.add(rod(0.006, 0.006, 0.08, "z", 6), tap, { at: [x, H + 0.15, tz] });
    m.add(cyl(0.008, 0.008, 0.03, 6), tap, { at: [x, H + 0.12, tz] });
  }
  m.add(rod(0.014, 0.014, 0.22, "x", 8), tap, { at: [0.5, H + 0.09, tz] });
  m.add(
    tube(
      [
        [0.5, H + 0.09, tz],
        [0.5, H + 0.3, tz + 0.02],
        [0.5, H + 0.32, tz + 0.1],
        [0.5, H + 0.26, tz + 0.15],
      ],
      0.012,
      8,
      14,
    ),
    tap,
  );
  // a washing-up bottle and a sponge
  if (o.seed > 0.4) {
    m.add(cyl(0.03, 0.028, 0.17, 10), o.seed > 0.7 ? 0x4fa84a : 0xe2b93a, { at: [0.88, H, 0.2] });
    m.add(cyl(0.012, 0.008, 0.03, 8), P.white, { at: [0.88, H + 0.17, 0.2] });
    m.add(box([0.1, 0.03, 0.065], 0.008), 0xe8d24a, { at: [0.1, H + 0.015, 0.55] });
    m.add(box([0.1, 0.012, 0.065], 0.004), 0x3f8a4a, { at: [0.1, H + 0.034, 0.55] });
  }
}

// ── the dishwasher (1×1) ──────────────────────────────────────────────────────────────────────────
/** A dishwasher under the worktop with a cutlery drawer unit beside it: its door and handle, the
 *  control strip along its top edge, a light on the floor while it runs (blinking, by its seed);
 *  steel, white, or behind an oak door to match the cabinets. */
function dishwasher(m: Model, o: Look) {
  const H = SURFACE.dishwasher ?? 0.9;
  const door = o.look === 0 ? K.steel : o.look === 1 ? P.white : P.oak;
  const cab = o.look === 2 ? P.oak : P.cream;
  const th = 0.04;
  m.add(box([0.92, 0.1, 0.8]), P.walnutDark, { at: [0.5, 0.05, 0.47] });
  m.add(box([0.96, H - th - 0.1, 0.86], 0.004), shade(cab, 0.92), { at: [0.5, 0.1 + (H - th - 0.1) / 2, 0.5] });
  m.add(box([0.98, th, 0.94], 0.004, 2), P.stone, { at: [0.5, H - th / 2, 0.5] });
  // the machine's door (x 0.03–0.63) and its strip
  const dx = 0.33;
  const dh = H - th - 0.12;
  m.add(box([0.59, dh, 0.03], 0.005), door, { at: [dx, 0.11 + dh / 2, 0.945] });
  if (o.look === 0)
    for (let i = 0; i < 9; i++)
      m.add(box([0.58, 0.002, 0.001]), shade(door, 0.94), { at: [dx, 0.15 + i * 0.07, 0.961] });
  if (o.look !== 2) {
    m.add(box([0.59, 0.06, 0.02], 0.004), o.look === 0 ? 0x2a2c2e : 0xd8d6d0, { at: [dx, H - th - 0.04, 0.95] });
    for (let i = 0; i < 4; i++)
      m.add(box([0.03, 0.012, 0.004]), o.look === 0 ? K.steelDark : 0xb0aea8, {
        at: [dx - 0.2 + i * 0.06, H - th - 0.04, 0.961],
      });
    m.add(box([0.06, 0.016, 0.004]), P.ledGreen, { at: [dx + 0.18, H - th - 0.04, 0.961], glow: true });
    barHandle(m, [dx, H - th - 0.11, 0.96], 0.4, o.look === 0 ? K.steelDark : P.chrome);
  } else {
    shaker(m, [dx, 0.11 + dh / 2, 0.96], 0.58, dh - 0.01, door);
    m.add(ball(0.016, 6), P.brass, { at: [dx, H - th - 0.1, 0.98] });
  }
  // the drawers (x 0.64–0.97)
  for (let i = 0; i < 3; i++) {
    const h = dh / 3 - 0.01;
    const y = 0.11 + h / 2 + (i * dh) / 3;
    shaker(m, [0.805, y, 0.94], 0.31, h, cab);
    m.add(ball(0.014, 6), P.brass, { at: [0.805, y + h / 2 - 0.06, 0.96] });
  }
  // running: its spot on the floor, blinking
  if (o.seed > 0.4)
    m.live(
      cyl(0.025, 0.025, 0.002, 12),
      0xff4a3a,
      { kind: "blink", period: 2.4, on: 0.7, phase: o.seed },
      { at: [dx, 0.002, 0.97], glow: true },
    );
}

// ── on a surface: fruit bowl, toaster, kettle ─────────────────────────────────────────────────────
const FRUIT = {
  apple: (m: Model, at: V3, i: number) => {
    m.add(ball(0.038, 8), i % 2 ? 0xc4302b : 0x8fbf4a, { at, scale: [1, 0.92, 1] });
    m.add(cyl(0.003, 0.003, 0.018, 4), 0x5a3a1c, { at: [at[0], at[1] + 0.03, at[2]], rot: [0.3, 0, 0.2] });
  },
  orange: (m: Model, at: V3) => {
    m.add(ball(0.04, 8), 0xf08a2a, { at });
    m.add(cyl(0.006, 0.006, 0.004, 5), 0x4a6a2a, { at: [at[0], at[1] + 0.038, at[2]] });
  },
  lemon: (m: Model, at: V3, i: number) =>
    m.add(ball(0.03, 7), 0xf2d23a, { at, scale: [1.35, 0.95, 0.95], rot: [0, i, 0] }),
  pear: (m: Model, at: V3) =>
    m.add(
      lathe(
        [
          [0.001, -0.03],
          [0.03, -0.02],
          [0.036, 0.0],
          [0.022, 0.03],
          [0.012, 0.05],
          [0.001, 0.058],
        ],
        8,
      ),
      0xb8c44a,
      { at },
    ),
  grapes: (m: Model, at: V3) => {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const l = Math.floor(i / 4);
      m.add(ball(0.012, 5), 0x6b2f5a, {
        at: [at[0] + Math.cos(a) * 0.022, at[1] - l * 0.016, at[2] + Math.sin(a) * 0.022],
      });
    }
  },
};
/** A fruit bowl, filled by its seed: apples, oranges, lemons, a pear, grapes, a bunch of bananas over
 *  the top; olive wood, a blue glazed bowl, or a wire basket. */
function fruitBowl(m: Model, o: Look) {
  const [u, v] = [0.5, 0.5];
  if (o.look === 2) {
    // a wire basket on its foot ring
    m.add(ring(0.08, 0.004, 3, 16), P.ink, { at: [u, 0.004, v] });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      m.add(
        tube(
          [
            [u + Math.cos(a) * 0.08, 0.004, v + Math.sin(a) * 0.08],
            [u + Math.cos(a) * 0.15, 0.06, v + Math.sin(a) * 0.15],
            [u + Math.cos(a) * 0.19, 0.1, v + Math.sin(a) * 0.19],
          ],
          0.003,
          3,
          4,
        ),
        P.ink,
      );
    }
    for (const [r, y] of [
      [0.12, 0.035],
      [0.165, 0.075],
      [0.19, 0.1],
    ])
      m.add(ring(r, 0.004, 3, 24), P.ink, { at: [u, y, v] });
  } else {
    const c = o.look === 0 ? 0x9a6a3e : 0x3b6ea5;
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.07, 0],
          [0.075, 0.012],
          [0.14, 0.05],
          [0.19, 0.095],
          [0.18, 0.1],
          [0.13, 0.058],
          [0.07, 0.03],
          [0.001, 0.03],
        ],
        20,
      ),
      c,
      { at: [u, 0, v] },
    );
    if (o.look === 0)
      for (const r of [0.1, 0.15]) m.add(ring(r, 0.002, 3, 20), 0x7a4e2a, { at: [u, r * 0.6 - 0.01, v] });
    else m.add(ring(0.185, 0.006, 3, 24), P.white, { at: [u, 0.098, v] });
  }
  // the fruit, piled
  const kinds = ["apple", "orange", "lemon", "pear", "grapes"] as const;
  const pick = (i: number) => kinds[Math.floor(rnd(i, 7, o.seed) * kinds.length)];
  const spots: V3[] = [
    [u - 0.07, 0.07, v - 0.05],
    [u + 0.07, 0.07, v - 0.04],
    [u, 0.07, v + 0.08],
    [u - 0.08, 0.07, v + 0.06],
    [u + 0.08, 0.07, v + 0.06],
    [u, 0.12, v],
  ];
  for (const [i, at] of spots.entries()) FRUIT[pick(i)](m, at, i);
  // bananas over the top, by its seed
  if (o.seed > 0.35)
    for (let i = 0; i < 3; i++)
      m.add(
        tube(
          [
            [u - 0.11, 0.14, v - 0.02 + i * 0.025],
            [u - 0.03, 0.17, v + i * 0.02],
            [u + 0.06, 0.165, v + 0.01 + i * 0.02],
            [u + 0.12, 0.13, v - 0.01 + i * 0.025],
          ],
          0.016,
          5,
          8,
        ),
        i === 1 ? 0xf2d23a : 0xe8c83a,
      );
}

/** A two-slice toaster: its rounded body, the slots, the lever and its dial on the end, two slices up
 *  by its seed; cream with chrome, all chrome, or red. */
function toaster(m: Model, o: Look) {
  const [u, v] = [0.5, 0.5];
  const body = o.look === 0 ? 0xe6dcc4 : o.look === 1 ? 0xc8ccd1 : 0xb3262b;
  const trim = o.look === 1 ? 0x2a2a2c : P.chrome;
  m.add(box([0.3, 0.17, 0.18], 0.035, 3), body, { at: [u, 0.105, v] });
  m.add(box([0.31, 0.02, 0.19], 0.006), trim, { at: [u, 0.012, v] });
  // the slots
  for (const dz of [-0.035, 0.035]) {
    m.add(box([0.2, 0.004, 0.026], 0.002), 0x1a1a1a, { at: [u, 0.19, v + dz] });
    m.add(box([0.21, 0.003, 0.034], 0.002), trim, { at: [u, 0.188, v + dz] });
  }
  // the lever and the dial on the end
  m.add(box([0.012, 0.1, 0.012]), 0x1a1a1a, { at: [u + 0.151, 0.12, v] });
  m.add(box([0.02, 0.015, 0.03], 0.004), trim, { at: [u + 0.158, 0.15, v] });
  m.add(cyl(0.016, 0.016, 0.008, 10), trim, { at: [u + 0.152, 0.07, v + 0.05], rot: [0, 0, Math.PI / 2] });
  m.add(box([0.003, 0.008, 0.024]), body, { at: [u + 0.157, 0.07, v + 0.05] });
  // its badge on the front
  m.add(box([0.06, 0.016, 0.002]), trim, { at: [u, 0.1, v + 0.091] });
  // toast, by its seed
  if (o.seed > 0.4)
    for (const dz of [-0.035, 0.035]) {
      m.add(box([0.11, 0.1, 0.012], 0.006), K.bread, { at: [u - 0.01, 0.17, v + dz] });
      m.add(box([0.115, 0.012, 0.013], 0.004), K.crust, { at: [u - 0.01, 0.222, v + dz] });
    }
}

/** A kettle (it makes a hot drink, as the coffee machine pours): a steel jug on its base, a cream dome
 *  on chrome, or a stovetop whistler in enamel with its handle over the top. */
function kettle(m: Model, o: Look) {
  const [u, v] = [0.5, 0.5];
  if (o.look === 0) {
    m.add(cyl(0.09, 0.09, 0.02, 16), 0x1f1f22, { at: [u, 0, v] });
    m.add(
      lathe(
        [
          [0.001, 0.02],
          [0.08, 0.02],
          [0.085, 0.04],
          [0.08, 0.16],
          [0.068, 0.21],
          [0.001, 0.21],
        ],
        16,
      ),
      K.steel,
      { at: [u, 0, v] },
    );
    m.add(cyl(0.055, 0.05, 0.015, 14), 0x1f1f22, { at: [u, 0.205, v] });
    m.add(box([0.03, 0.012, 0.016], 0.004), 0x1f1f22, { at: [u, 0.226, v] });
    // the water window, the handle, the spout, the switch lit
    m.add(box([0.012, 0.11, 0.024], 0.004), 0x9fc8e0, { at: [u + 0.084, 0.1, v + 0.035], rot: [0, -0.4, 0] });
    m.add(
      tube(
        [
          [u - 0.06, 0.19, v],
          [u - 0.12, 0.17, v],
          [u - 0.12, 0.07, v],
          [u - 0.075, 0.045, v],
        ],
        0.012,
        6,
        10,
      ),
      0x1f1f22,
    );
    m.add(cyl(0.025, 0.012, 0.06, 8), K.steel, { at: [u + 0.07, 0.15, v], rot: [0, 0, -0.9] });
    m.add(box([0.016, 0.01, 0.02]), 0xff6a3a, { at: [u - 0.115, 0.06, v], glow: true });
  } else if (o.look === 1) {
    m.add(cyl(0.085, 0.09, 0.022, 16), P.chrome, { at: [u, 0, v] });
    m.add(
      lathe(
        [
          [0.001, 0.02],
          [0.095, 0.02],
          [0.1, 0.06],
          [0.09, 0.13],
          [0.06, 0.18],
          [0.03, 0.195],
          [0.001, 0.198],
        ],
        18,
      ),
      0xe6dcc4,
      { at: [u, 0, v] },
    );
    m.add(ball(0.016, 8), P.chrome, { at: [u, 0.205, v] });
    m.add(
      tube(
        [
          [u - 0.07, 0.17, v],
          [u - 0.125, 0.15, v],
          [u - 0.13, 0.08, v],
          [u - 0.095, 0.045, v],
        ],
        0.012,
        6,
        10,
      ),
      P.chrome,
    );
    m.add(cyl(0.022, 0.01, 0.07, 8), 0xe6dcc4, { at: [u + 0.08, 0.06, v], rot: [0, 0, -0.85] });
  } else {
    const c = o.seed > 0.5 ? 0xc4402b : 0x2f7a7a;
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.105, 0],
          [0.112, 0.02],
          [0.1, 0.09],
          [0.065, 0.14],
          [0.035, 0.155],
          [0.001, 0.157],
        ],
        18,
      ),
      c,
      { at: [u, 0, v] },
    );
    m.add(cyl(0.03, 0.032, 0.012, 12), P.chrome, { at: [u, 0.155, v] });
    m.add(ball(0.012, 6), 0x1f1f22, { at: [u, 0.175, v] });
    // the handle over the top, the whistling spout
    m.add(
      tube(
        [
          [u - 0.07, 0.11, v],
          [u - 0.06, 0.24, v],
          [u + 0.04, 0.25, v],
          [u + 0.06, 0.13, v],
        ],
        0.008,
        5,
        12,
      ),
      P.chrome,
    );
    m.add(box([0.09, 0.02, 0.028], 0.008), 0x1f1f22, { at: [u - 0.01, 0.25, v] });
    m.add(cyl(0.022, 0.013, 0.08, 8), c, { at: [u + 0.08, 0.06, v], rot: [0, 0, -1.0] });
    m.add(cyl(0.016, 0.016, 0.022, 8), P.chrome, { at: [u + 0.125, 0.11, v], rot: [0, 0, -1.0] });
  }
}

// ── the café counter (3×1) ────────────────────────────────────────────────────────────────────────
type Pastry = (m: Model, at: V3, i: number) => void;
const PASTRY: Pastry[] = [
  // croissant
  (m, [x, y, z], i) =>
    m.add(
      tube(
        [
          [x - 0.06, y + 0.012, z + 0.02],
          [x - 0.03, y + 0.025, z - 0.01],
          [x + 0.03, y + 0.025, z - 0.01],
          [x + 0.06, y + 0.012, z + 0.02],
        ],
        0.022,
        5,
        5,
      ),
      i % 2 ? 0xd28c3a : 0xc47a2e,
    ),
  // muffin
  (m, [x, y, z]) => {
    m.add(cyl(0.03, 0.036, 0.04, 8), 0xe8e0d0, { at: [x, y, z] });
    m.add(ball(0.042, 6), 0x7a4a2a, { at: [x, y + 0.045, z], scale: [1, 0.65, 1] });
  },
  // doughnut
  (m, [x, y, z], i) => {
    m.add(ring(0.035, 0.018, 4, 10), 0xd9a35e, { at: [x, y + 0.018, z] });
    m.add(cyl(0.05, 0.05, 0.006, 10), [0xf4a6b8, 0x6b3f2a, 0xf3e3b8][i % 3], { at: [x, y + 0.03, z] });
  },
  // a slice of cake
  (m, [x, y, z], i) => {
    m.add(
      extrude(
        [
          [0, 0],
          [0.1, -0.03],
          [0.1, 0.03],
        ],
        0.07,
      ),
      0xf3e3b8,
      { at: [x - 0.05, y + 0.035, z], rot: [Math.PI / 2, i, 0] },
    );
    m.add(
      extrude(
        [
          [0, 0],
          [0.1, -0.03],
          [0.1, 0.03],
        ],
        0.012,
      ),
      [0x6b3f2a, 0xf4a6b8, 0xe9e6df][i % 3],
      {
        at: [x - 0.05, y + 0.076, z],
        rot: [Math.PI / 2, i, 0],
      },
    );
  },
  // cinnamon roll
  (m, [x, y, z]) => {
    m.add(cyl(0.045, 0.045, 0.035, 10), 0xc4823a, { at: [x, y, z] });
    m.add(ring(0.025, 0.006, 3, 8), 0x8a5a2e, { at: [x, y + 0.036, z] });
    m.add(cyl(0.03, 0.03, 0.004, 10), P.white, { at: [x + 0.01, y + 0.035, z] });
  },
];
/** A café counter at the counter's 0.90: the customers' side (+z) panelled, its top clear at the
 *  till's end, a pastry case on the left — glass on three sides over two decks of croissants, muffins,
 *  doughnuts, cake and rolls (as its seed sets them out), a cake on a stand, lit under its cap; oak
 *  slats and white tile, black fluting and brass, or mint tile and marble. */
function cafeCounter(m: Model, o: Look) {
  const H = SURFACE.cafe_counter ?? 0.9;
  const th = 0.04;
  const [front, topC, trim] =
    o.look === 0
      ? [P.oak, P.stone, P.chrome]
      : o.look === 1
        ? [0x1f1f22, 0x2b2a28, P.brass]
        : [K.mint, K.marble, P.brass];
  // the plinth, the carcass
  m.add(box([2.9, 0.1, 0.8]), o.look === 1 ? P.brass : P.walnutDark, { at: [1.5, 0.05, 0.5] });
  m.add(box([2.96, H - th - 0.1, 0.88], 0.004), shade(front, 0.92), { at: [1.5, 0.1 + (H - th - 0.1) / 2, 0.5] });
  // the customers' face
  const fz = 0.945;
  const fh = H - th - 0.1;
  if (o.look === 0) {
    for (let i = 0; i < 37; i++)
      m.add(box([0.065, fh, 0.02]), i % 3 ? front : shade(front, 0.92), { at: [0.06 + i * 0.08, 0.1 + fh / 2, fz] });
  } else if (o.look === 1) {
    for (let i = 0; i < 49; i++) m.add(cyl(0.025, 0.025, fh, 6), front, { at: [0.05 + i * 0.06, 0.1, fz - 0.01] });
    m.add(rod(0.012, 0.012, 2.9, "x", 8), P.brass, { at: [1.5, 0.22, 0.975] });
    for (const x of [0.2, 1.5, 2.8]) m.add(rod(0.008, 0.008, 0.04, "z", 6), P.brass, { at: [x, 0.22, 0.955] });
  } else {
    // tiles: rows of little bricks, offset
    const tiles: BufferGeometry[] = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 15; c++) {
        const x = 0.12 + c * 0.2 + (r % 2 ? 0.1 : 0);
        if (x > 2.9) continue;
        tiles.push(box([0.19, 0.085, 0.012]).translate(x, 0.155 + r * 0.095, fz));
      }
    m.add(merged(tiles), front);
    m.add(box([2.96, fh, 0.004]), shade(front, 0.75), { at: [1.5, 0.1 + fh / 2, fz - 0.007] });
  }
  // the top
  m.add(box([2.96, th, 0.92], 0.006, 2), topC, { at: [1.5, H - th / 2, 0.5] });
  if (o.look === 2)
    for (let i = 0; i < 6; i++)
      m.add(box([0.3 + rnd(i, 2, 7) * 0.3, 0.0015, 0.006]), K.vein, {
        at: [1.65 + rnd(i, 1, 7) * 1.0, H + 0.0005, 0.3 + rnd(i, 3, 7) * 0.4],
        rot: [0, (rnd(i, 4, 7) - 0.5) * 1.2, 0],
      });
  // the staff's side: an open shelf of cups under the top
  m.add(box([1.4, 0.02, 0.3]), shade(front, 0.8), { at: [2.2, 0.5, 0.2] });
  m.add(box([1.4, 0.4, 0.004]), shade(front, 0.6), { at: [2.2, 0.32, 0.055] });
  for (let i = 0; i < 9; i++) m.add(cyl(0.04, 0.035, 0.08, 10), P.white, { at: [1.6 + i * 0.14, 0.51, 0.06 + 0.11] });
  // the pastry case: its base, posts, cap (lit under), the glass, two decks
  const [cx0, cx1, cz0, cz1] = [0.06, 1.24, 0.1, 0.9];
  const cy1 = 1.4;
  const cw = cx1 - cx0;
  const cm = (cx0 + cx1) / 2;
  m.add(box([cw, 0.03, cz1 - cz0], 0.004), trim, { at: [cm, H + 0.015, (cz0 + cz1) / 2] });
  for (const x of [cx0 + 0.012, cx1 - 0.012])
    for (const z of [cz0 + 0.012, cz1 - 0.012])
      m.add(box([0.022, cy1 - H, 0.022]), trim, { at: [x, (H + cy1) / 2, z] });
  m.add(box([cw, 0.04, cz1 - cz0], 0.006), o.look === 1 ? 0x1f1f22 : shade(front, 0.95), {
    at: [cm, cy1 - 0.02, (cz0 + cz1) / 2],
  });
  m.add(box([cw - 0.06, 0.008, 0.04]), 0xfff1d0, { at: [cm, cy1 - 0.045, cz1 - 0.08], glow: true });
  m.add(box([cw - 0.06, 0.008, 0.04]), 0xfff1d0, { at: [cm, 1.13, cz1 - 0.12], glow: true });
  const deck = (y: number) => {
    m.add(box([cw - 0.04, 0.01, cz1 - cz0 - 0.06]), y < 1 ? P.white : 0xd8eef2, { at: [cm, y, (cz0 + cz1) / 2] });
    m.add(box([cw - 0.04, 0.02, 0.006]), trim, { at: [cm, y + 0.005, cz1 - 0.035] });
  };
  deck(H + 0.035);
  deck(1.14);
  // the pastries, in rows by its seed: on doilies, their tags
  for (const [d, y] of [
    [0, H + 0.04],
    [1, 1.145],
  ] as const)
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 4; c++) {
        if (d === 0 && r === 0 && c >= 2) continue; // (the cake's stand)
        const x = cx0 + 0.16 + c * 0.28;
        const z = 0.36 + r * 0.26;
        const kind = Math.floor(rnd(c + r * 4, d, o.seed) * PASTRY.length);
        m.add(cyl(0.11, 0.11, 0.002, 12), P.paperWhite, { at: [x, y, z] });
        for (let k = 0; k < 3; k++) PASTRY[kind](m, [x - 0.05 + k * 0.05, y + 0.002, z + (k % 2) * 0.03 - 0.015], k);
        m.add(box([0.05, 0.03, 0.004]), P.paperWhite, { at: [x, y + 0.02, cz1 - 0.06], rot: [-0.4, 0, 0] });
      }
  // a whole cake on its stand
  const kx = cx0 + 0.86;
  m.add(cyl(0.02, 0.06, 0.08, 10), P.white, { at: [kx, H + 0.04, 0.4] });
  m.add(cyl(0.13, 0.13, 0.012, 16), P.white, { at: [kx, H + 0.12, 0.4] });
  m.add(cyl(0.11, 0.11, 0.08, 16), o.seed > 0.5 ? 0x6b3f2a : 0xf3e3b8, { at: [kx, H + 0.132, 0.4] });
  m.add(cyl(0.112, 0.112, 0.012, 16), o.seed > 0.5 ? 0xf3e3b8 : 0xf4a6b8, { at: [kx, H + 0.212, 0.4] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    m.add(ball(0.012, 5), 0xc4302b, { at: [kx + Math.cos(a) * 0.08, H + 0.232, 0.4 + Math.sin(a) * 0.08] });
  }
  // the glass: front (sloped), ends, the staff's sliding doors (live: see-through)
  const glass: BufferGeometry[] = [];
  const gh = cy1 - H - 0.07;
  glass.push(
    box([cw - 0.03, gh / Math.cos(0.18), 0.006])
      .rotateX(-0.18)
      .translate(cm, H + 0.03 + gh / 2, cz1 - 0.01 - (Math.tan(0.18) * gh) / 2),
  );
  for (const x of [cx0 + 0.01, cx1 - 0.01])
    glass.push(box([0.006, gh, cz1 - cz0 - 0.03]).translate(x, H + 0.03 + gh / 2, (cz0 + cz1) / 2));
  glass.push(box([cw / 2, gh, 0.006]).translate(cm - cw / 4, H + 0.03 + gh / 2, cz0 + 0.015));
  glass.push(box([cw / 2, gh, 0.006]).translate(cm + cw / 4, H + 0.03 + gh / 2, cz0 + 0.025));
  m.live(merged(glass), K.glass, { kind: "still" }, { glass: true });
}

// ── the ice-cream freezer (2×1) ───────────────────────────────────────────────────────────────────
/** A shop's ice-cream chest freezer (it hands out an ice cream, as a vending machine does): its body on
 *  castors, a cone on its front, the frosty well inside full of tubs in every flavour and boxes of
 *  lollies, two sliding glass lids; white with a blue band, pastel, or red. */
function iceCreamFreezer(m: Model, o: Look) {
  const [body, band, rim] =
    o.look === 0
      ? [P.white, 0x2f62a8, 0xb7bbbe]
      : o.look === 1
        ? [0xb9e3d3, 0xf4a6b8, 0xf3e3b8]
        : [0xc4302b, P.white, 0xd8d6d0];
  const [x0, x1, z0, z1] = [0.24, 1.76, 0.16, 0.84];
  const H = 0.84;
  const [u, v] = [(x0 + x1) / 2, (z0 + z1) / 2];
  for (const x of [x0 + 0.08, x1 - 0.08])
    for (const z of [z0 + 0.08, z1 - 0.08])
      m.add(cyl(0.025, 0.025, 0.03, 8), P.rubber, { at: [x, 0.03, z], rot: [0, 0, Math.PI / 2] });
  m.add(box([x1 - x0, H - 0.06, z1 - z0], 0.04, 3), body, { at: [u, 0.06 + (H - 0.06) / 2, v] });
  // the band, the cone on the front
  m.add(box([x1 - x0 + 0.004, 0.12, z1 - z0 + 0.004], 0.02, 2), band, { at: [u, 0.6, v] });
  const fz = z1 + 0.002;
  m.add(
    extrude(
      [
        [-0.08, 0.12],
        [0.08, 0.12],
        [0, -0.1],
      ],
      0.008,
    ),
    0xd9a35e,
    { at: [u - 0.4, 0.3, fz] },
  );
  for (let i = 0; i < 4; i++)
    m.add(box([0.12, 0.004, 0.003]), 0xa87a46, {
      at: [u - 0.4, 0.33 + i * 0.03 - 0.02, fz + 0.005],
      rot: [0, 0, i % 2 ? 0.5 : -0.5],
    });
  for (const [dx, dy, c] of [
    [-0.05, 0.45, SCOOPS[1]],
    [0.05, 0.45, SCOOPS[3]],
    [0, 0.52, SCOOPS[2]],
  ] as const)
    m.add(cyl(0.06, 0.06, 0.012, 14), c, { at: [u - 0.4 + dx, dy, fz], rot: [Math.PI / 2, 0, 0] });
  // its badge, the side handles
  m.add(box([0.36, 0.08, 0.004], 0.002), band, { at: [u + 0.35, 0.36, fz] });
  m.add(box([0.28, 0.02, 0.002]), body, { at: [u + 0.35, 0.36, fz + 0.003] });
  for (const x of [x0, x1]) m.add(rod(0.012, 0.012, 0.3, "z", 8), rim, { at: [x + (x < 1 ? -0.012 : 0.012), 0.72, v] });
  // the rim; the well inside, frosted; tubs and lolly boxes
  m.add(box([x1 - x0, 0.03, z1 - z0], 0.01), rim, { at: [u, H + 0.015, v] });
  m.add(box([x1 - x0 - 0.1, 0.008, z1 - z0 - 0.1]), K.frost, { at: [u, H + 0.025, v] });
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 6; c++) {
      const x = x0 + 0.17 + c * 0.235;
      const z = z0 + 0.19 + r * 0.3;
      const k = Math.floor(rnd(c + r * 6, 1, o.seed + 1) * SCOOPS.length);
      m.add(box([0.2, 0.004, 0.27]), 0xb7bbbe, { at: [x, H + 0.03, z] });
      m.add(cushion([0.18, 0.03, 0.24], 0.4, 2), SCOOPS[k], { at: [x, H + 0.045, z] });
      if (rnd(c, r, o.seed) > 0.5)
        m.add(box([0.012, 0.004, 0.08]), 0xd8d6d0, { at: [x + 0.04, H + 0.066, z], rot: [0.5, 0.3, 0] });
    }
  // the lids: two shallow arches of glass, a handle each
  const lid: BufferGeometry[] = [];
  for (const [a, b] of [
    [x0 + 0.03, u + 0.02],
    [u - 0.02, x1 - 0.03],
  ]) {
    for (const [s, zz] of [
      [-1, v - (z1 - z0) / 4],
      [1, v + (z1 - z0) / 4],
    ])
      lid.push(
        box([b - a, 0.006, (z1 - z0) / 2 - 0.01])
          .rotateX(s * 0.08)
          .translate((a + b) / 2, H + 0.05, zz),
      );
  }
  m.live(merged(lid), K.glass, { kind: "still" }, { glass: true });
  for (const x of [x0 + 0.1, x1 - 0.1]) m.add(box([0.1, 0.014, 0.03], 0.005), rim, { at: [x, H + 0.067, v] });
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  kitchen_island: island,
  counter_stool: counterStool,
  kitchen_stove: stove,
  kitchen_sink: sink,
  dishwasher,
  fruit_bowl: fruitBowl,
  toaster,
  kettle,
  cafe_counter: cafeCounter,
  ice_cream_freezer: iceCreamFreezer,
};
