import { type BufferGeometry, CylinderGeometry } from "three";
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

// Plan 68 phase 16 (docs/plan/68-more-furniture.md): Pets — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/pets2.ts. At a cat's and a dog's size, as decor.ts's
// pet bed, bowls, house, scratching post and toy box: a cat tree (its toy dangling), the agility
// course (a bar jump, a tunnel, weave poles), a ball launcher (its light blinking), a litter box, a pet
// gate with a flap (swinging), an auto-feeder, a bird cage (its bird bobbing, its swing), a hamster
// cage (the wheel going round, the hamster running in it) and a pet sofa.

export const LOOKS: Record<string, readonly string[]> = {
  cat_tree: ["Grey carpet", "Beige with a hammock", "Modern wood"],
  agility_jump: ["Red and white", "Blue and yellow"],
  agility_tunnel: ["Blue", "Rainbow", "Red"],
  weave_poles: ["Red and white", "Blue and white"],
  ball_launcher: ["Green", "Grey"],
  litter_box: ["Hooded", "Open tray"],
  pet_door: ["White steel", "Wooden"],
  auto_feeder: ["White", "Steel"],
  bird_cage: ["Brass dome", "White Victorian", "Bamboo"],
  hamster_wheel: ["Wire cage", "Glass tank"],
  pet_sofa: ["Chesterfield", "Mid-century", "Daybed"],
};

const GOLDEN = 2.39996;
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const TENNIS = 0xc8dc3a;

/** A tennis ball, its seam. */
function tennisBall(m: Model, at: V3, r = 0.033) {
  m.add(ball(r, 8), TENNIS, { at });
  m.add(ring(r * 0.98, 0.0025, 3, 14), P.paperWhite, { at, rot: [0.6, 0.3, 0.4] });
}

// ── the cat tree (1×1) ─────────────────────────────────────────────────────────────────────────────
function catTree(m: Model, o: Look) {
  const look = o.look;
  const carpet = o.fabric ?? [0x8a8a90, 0xc9b89a, 0xd8d2c4][look] ?? 0x8a8a90;
  // (the life look: its carpet is carpet, its sisal rope matte)
  m.finishes([
    [carpet, "carpet"],
    [0xc9a46a, "matte"],
    [0xa98252, "matte"],
  ]);
  const wood = look === 2 ? P.oakLight : carpet;
  const sisal = 0xc9a46a;
  /** A sisal post from y0 to y1 at (x, z), its rope wound round it. */
  const post = (x: number, z: number, y0: number, y1: number, r = 0.05) => {
    m.add(cyl(r, r, y1 - y0, 12), sisal, { at: [x, y0, z] });
    for (let y = y0 + 0.03; y < y1 - 0.01; y += 0.045)
      m.add(ring(r + 0.002, 0.005, 3, 10), 0xa98252, { at: [x, y, z] });
  };
  /** A platform (a carpeted board, or a wooden one with a cushion). */
  const deck = (x: number, z: number, y: number, w: number, d: number, round = false) => {
    if (round) m.add(cyl(w / 2, w / 2, 0.035, 20), wood, { at: [x, y, z] });
    else m.add(box([w, 0.035, d], 0.008), wood, { at: [x, y + 0.0175, z] });
    if (look === 2)
      if (round) m.add(cyl(w / 2 - 0.03, w / 2 - 0.03, 0.025, 18), carpet, { at: [x, y + 0.035, z] });
      else m.add(cushion([w - 0.06, 0.03, d - 0.06], 0.3), carpet, { at: [x, y + 0.05, z] });
  };
  // the base
  m.add(box([0.62, 0.05, 0.62], 0.012), wood, { at: [0.5, 0.025, 0.5] });
  if (look === 2) m.add(box([0.56, 0.012, 0.56]), carpet, { at: [0.5, 0.056, 0.5] });
  // the cubby: a box with a round door, on the base's back right
  const [hx, hz] = [0.62, 0.4];
  m.add(box([0.34, 0.3, 0.32], 0.01), wood, { at: [hx, 0.2, hz] });
  m.add(cyl(0.085, 0.085, 0.01, 18), 0x2a2420, { at: [hx, 0.2, hz + 0.161], rot: [Math.PI / 2, 0, 0] });
  m.add(ring(0.085, 0.008, 4, 18).rotateX(Math.PI / 2), shade(wood, 0.85), { at: [hx, 0.2, hz + 0.163] });
  // the posts
  post(0.28, 0.32, 0.05, 1.1);
  post(0.7, 0.66, 0.05, 0.82);
  post(0.66, 0.38, 0.35, 1.4, 0.045);
  // the platforms
  deck(0.34, 0.46, 0.45, 0.4, 0.4);
  deck(0.64, 0.6, 0.82, 0.36, 0.36);
  // the top perch: a round bed with a rim to curl up in
  m.add(cyl(0.2, 0.2, 0.035, 20), wood, { at: [0.6, 1.4, 0.42] });
  m.add(ring(0.165, 0.035, 6, 22), look === 2 ? shade(carpet, 0.9) : shade(carpet, 1.08), { at: [0.6, 1.47, 0.42] });
  m.add(cyl(0.15, 0.15, 0.03, 18), shade(carpet, 0.95), { at: [0.6, 1.435, 0.42] });
  // a hammock (look 1) or a second ledge, slung between the long post and the first
  if (look === 1) {
    m.add(
      lathe(
        [
          [0.001, -0.06],
          [0.08, -0.05],
          [0.14, -0.02],
          [0.16, 0.01],
        ],
        14,
      ),
      shade(carpet, 0.9),
      { at: [0.45, 1.08, 0.36], scale: [1.2, 1, 0.85] },
    );
    for (const [x, z] of [
      [0.28, 0.32],
      [0.64, 0.38],
    ])
      m.add(
        tube(
          [
            [x, 1.12, z],
            [(x + 0.45) / 2, 1.06, (z + 0.36) / 2],
            [0.45 + (x - 0.45) * 0.4, 1.08, 0.36],
          ],
          0.006,
          4,
          4,
        ),
        0x6a5a4a,
      );
  } else deck(0.28, 0.32, 1.1, 0.24, 0.24, true);
  // the toy on its string, swinging from the first platform's edge (live)
  const toy: BufferGeometry[] = [
    cyl(0.0015, 0.0015, 0.2, 3).translate(0, -0.2, 0),
    ball(0.025, 7).translate(0, -0.22, 0),
  ];
  for (let i = 0; i < 5; i++)
    toy.push(
      box([0.004, 0.04, 0.012])
        .rotateZ(-0.6 + i * 0.3)
        .translate(Math.sin(-0.6 + i * 0.3) * 0.02, -0.25, 0),
    );
  m.live(
    merged(toy),
    look === 1 ? 0x3a8ae0 : P.rust,
    { kind: "nod", amp: 0.3, period: 2.6, phase: o.seed },
    { at: [0.2, 0.45, 0.62] },
  );
  // (story) a cat's toy mouse on the base
  if (o.seed > 0.5) {
    m.add(ball(0.025, 6), 0x9a948a, { at: [0.3, 0.07, 0.7], scale: [1, 0.8, 1.6] });
    m.add(
      tube(
        [
          [0.3, 0.06, 0.74],
          [0.33, 0.055, 0.78],
          [0.36, 0.055, 0.76],
        ],
        0.002,
        3,
        4,
      ),
      0x6a645a,
    );
  }
}

// ── the agility course: a bar jump (2×1), a tunnel (3×1), weave poles (4×1) ─────────────────────────
const AGILITY = [
  [0xd03a2a, 0xf4f2ee],
  [0x2a5ad0, 0xf0d040],
];
/** A striped rod along x between x0 and x1 at (y, z), `n` bands. */
function stripedBar(
  m: Model,
  x0: number,
  x1: number,
  y: number,
  z: number,
  r: number,
  n: number,
  a: number,
  b: number,
) {
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) m.add(rod(r, r, step, "x", 8), i % 2 ? b : a, { at: [x0 + (i + 0.5) * step, y, z] });
}
function agilityJump(m: Model, o: Look) {
  const [a, b] = AGILITY[o.look] ?? AGILITY[0];
  for (const x of [0.32, 1.68]) {
    // a wing: its upright and a short one, the feet crosswise, a lattice of rails between
    for (const dx of [0, x < 1 ? -0.07 : 0.07]) {
      m.add(box([0.04, 0.9, 0.04], 0.006), b, { at: [x + dx, 0.45 + 0.02, 0.5] });
      m.add(box([0.05, 0.03, 0.44], 0.006), a, { at: [x + dx, 0.015, 0.5] });
    }
    for (const y of [0.3, 0.6]) m.add(box([0.07, 0.025, 0.02]), a, { at: [x + (x < 1 ? -0.035 : 0.035), y, 0.5] });
    // its cups up it, the bar resting in a pair
    for (const y of [0.25, 0.4, 0.55, 0.7])
      m.add(box([0.03, 0.02, 0.04]), 0x2b2b2e, { at: [x + (x < 1 ? 0.035 : -0.035), y, 0.5] });
    m.add(cyl(0.025, 0.025, 0.02, 8), a, { at: [x, 0.92, 0.5] });
  }
  stripedBar(m, 0.37, 1.63, 0.425, 0.5, 0.017, 8, a, b);
  // (story) a second bar lying on the grass by it
  if (o.seed > 0.5) stripedBar(m, 0.45, 1.55, 0.017, 0.68, 0.017, 7, a, b);
}

function agilityTunnel(m: Model, o: Look) {
  const R = 0.3;
  const [x0, x1] = [0.1, 2.9];
  const fabrics = [[0x2a5ad0], [0xd03a2a, 0xf0b030, 0x3aa05a, 0x2a5ad0, 0x8a4ad0], [0xc4302a]][o.look] ?? [0x2a5ad0];
  const n = 14;
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * step;
    const c = fabrics[o.look === 1 ? Math.floor(i / 2) % fabrics.length : 0];
    m.add(new CylinderGeometry(R + 0.012, R + 0.012, step, 16, 1, true).rotateZ(Math.PI / 2), c, {
      at: [cx, R + 0.022, 0.5],
      tone: i % 2 ? 1 : 0.92,
    });
    // its inside: the same, darker, facing in
    m.add(new CylinderGeometry(R, R, step, 16, 1, true).rotateZ(Math.PI / 2).scale(1, 1, -1), shade(c, 0.45), {
      at: [cx, R + 0.022, 0.5],
    });
  }
  // the hoops (wire in its seams)
  for (let i = 0; i <= n; i++) {
    m.add(ring(R + 0.014, 0.008, 4, 18).rotateZ(Math.PI / 2), shade(fabrics[0], 0.7), {
      at: [x0 + i * step, R + 0.022, 0.5],
    });
  }
  // the sandbags slung over it, holding it down
  // (a strap over the top, a bag either side on the floor)
  for (const x of [0.75, 2.25]) {
    const pts: V3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      pts.push([x, R + 0.022 + Math.sin(a) * (R + 0.03), 0.5 + Math.cos(a) * (R + 0.03)]);
    }
    m.add(tube(pts, 0.012, 4, 12), 0x3a3a3e);
    for (const s of [-1, 1])
      m.add(cushion([0.24, 0.1, 0.09], 0.35), 0x2b2b2e, { at: [x, 0.065, 0.5 + s * (R + 0.075)] });
  }
}

function weavePoles(m: Model, o: Look) {
  const [a, b] = AGILITY[o.look] ?? AGILITY[0];
  // the base: a flat steel bar, a foot crosswise at each end and in the middle
  m.add(box([3.36, 0.02, 0.06], 0.004), 0x6e7376, { at: [2, 0.01, 0.5] });
  for (const x of [0.35, 2, 3.65]) m.add(box([0.05, 0.02, 0.3], 0.004), 0x6e7376, { at: [x, 0.01, 0.5] });
  for (let i = 0; i < 6; i++) {
    const x = 0.5 + i * 0.6;
    m.add(cyl(0.022, 0.022, 0.04, 8), 0x2b2b2e, { at: [x, 0.02, 0.5] });
    // the pole, taped in bands
    m.add(cyl(0.0125, 0.0125, 0.96, 8), b, { at: [x, 0.04, 0.5] });
    for (let k = 0; k < 4; k++) m.add(cyl(0.0135, 0.0135, 0.08, 8), a, { at: [x, 0.16 + k * 0.22, 0.5] });
    m.add(ball(0.016, 6), a, { at: [x, 1.0 - 0.008, 0.5] });
  }
}

// ── the ball launcher (1×1) ────────────────────────────────────────────────────────────────────────
function ballLauncher(m: Model, o: Look) {
  const body = o.look === 1 ? 0x8a8f94 : 0x3a9a5a;
  const trim = o.look === 1 ? 0x2b2b2e : 0xe9e6df;
  // a squat drum, a funnel on top for the ball, a mouth out front
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.17, 0],
        [0.18, 0.02],
        [0.18, 0.22],
        [0.15, 0.28],
        [0.1, 0.3],
        [0.06, 0.3],
        [0.05, 0.27],
        [0.001, 0.26],
      ],
      20,
    ),
    body,
    { at: [0.5, 0, 0.48] },
  );
  m.add(ring(0.181, 0.008, 4, 20), trim, { at: [0.5, 0.03, 0.48] });
  m.add(
    lathe(
      [
        [0.05, 0.3],
        [0.075, 0.33],
        [0.13, 0.355],
        [0.12, 0.355],
        [0.065, 0.335],
        [0.045, 0.31],
      ],
      18,
    ),
    trim,
    { at: [0.5, 0, 0.48] },
  );
  // the mouth: a short chute out the front, dark inside
  m.add(box([0.12, 0.1, 0.08], 0.012), trim, { at: [0.5, 0.11, 0.66] });
  m.add(box([0.08, 0.065, 0.01]), 0x18181b, { at: [0.5, 0.11, 0.7] });
  // the dial and the power light (blinking: it's ready)
  m.add(cyl(0.024, 0.024, 0.012, 12), trim, { at: [0.54, 0.19, 0.655], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.004, 0.018, 0.003]), 0x2b2b2e, { at: [0.54, 0.19, 0.668], rot: [0, 0, 0.6] });
  m.add(ball(0.007, 5), 0x1a3a1a, { at: [0.45, 0.19, 0.656] });
  m.live(
    ball(0.008, 5),
    0x7fe08a,
    { kind: "blink", period: 2, on: 0.5, phase: o.seed },
    { at: [0.45, 0.19, 0.657], glow: true },
  );
  // balls: one in the funnel, one or two waiting by it
  tennisBall(m, [0.5, 0.34, 0.48]);
  tennisBall(m, [0.76, 0.033, 0.58]);
  if (o.seed > 0.4) tennisBall(m, [0.3, 0.033, 0.7]);
}

// ── the litter box (1×1) ───────────────────────────────────────────────────────────────────────────
function litterBox(m: Model, o: Look) {
  const tray = o.look === 1 ? 0x5a8aa0 : 0x8a8f94;
  // a mat in front to catch the litter
  m.add(box([0.6, 0.006, 0.18], 0.002), 0x3a3d40, { at: [0.5, 0.003, 0.76] });
  for (let i = 0; i < 9; i++) m.add(box([0.56, 0.002, 0.006]), 0x4a4d50, { at: [0.5, 0.0065, 0.69 + i * 0.017] });
  if (o.look === 1) {
    // an open tray: high sides, litter in it, a scoop
    m.add(box([0.54, 0.16, 0.4], 0.02, 2), tray, { at: [0.5, 0.08, 0.45] });
    m.add(box([0.58, 0.02, 0.44], 0.01), shade(tray, 1.15), { at: [0.5, 0.165, 0.45] });
    m.add(box([0.5, 0.004, 0.36]), 0xd8d0bc, { at: [0.5, 0.13, 0.45] });
    for (let i = 0; i < 24; i++)
      m.add(ball(0.008, 4), shade(0xd8d0bc, 0.85 + rnd(i, 1, o.seed) * 0.25), {
        at: [0.28 + rnd(i, 2, o.seed) * 0.44, 0.134, 0.29 + rnd(i, 3, o.seed) * 0.32],
      });
    // the scoop, leaning on its side
    m.add(box([0.1, 0.006, 0.12], 0.002), 0x3a8ae0, { at: [0.82, 0.12, 0.45], rot: [0, 0, 1.25] });
    m.add(box([0.025, 0.006, 0.12]), 0x3a8ae0, { at: [0.8, 0.22, 0.45], rot: [Math.PI / 2, 0, 0.2] });
    return;
  }
  // hooded: the tray, a dome of a hood clipped on, a swinging flap door, a handle, a vent on top
  m.add(box([0.58, 0.14, 0.44], 0.02, 2), shade(tray, 0.9), { at: [0.5, 0.07, 0.45] });
  m.add(box([0.6, 0.02, 0.46], 0.008), 0x2b2b2e, { at: [0.5, 0.14, 0.45] });
  m.add(box([0.56, 0.25, 0.42], 0.07, 3), 0xe9e6df, { at: [0.5, 0.265, 0.45] });
  m.add(box([0.24, 0.21, 0.01], 0.012), 0xd8d4cc, { at: [0.5, 0.25, 0.662] });
  m.add(box([0.2, 0.18, 0.012], 0.01), 0x6a8a9a, { at: [0.5, 0.245, 0.668], tone: 0.95 });
  m.add(box([0.24, 0.012, 0.02]), 0x8a8f94, { at: [0.5, 0.345, 0.668] });
  m.add(
    tube(
      [
        [0.42, 0.39, 0.45],
        [0.5, 0.42, 0.45],
        [0.58, 0.39, 0.45],
      ],
      0.012,
      5,
      8,
    ),
    0x8a8f94,
  );
  for (let i = 0; i < 4; i++) m.add(box([0.012, 0.004, 0.1]), 0x8a8f94, { at: [0.36 + i * 0.03, 0.385, 0.45] });
  // (story) a paw print on the flap
  if (o.seed > 0.5) {
    m.add(cyl(0.02, 0.02, 0.003, 10), 0x5a6a72, { at: [0.5, 0.23, 0.68], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 4; i++)
      m.add(cyl(0.008, 0.008, 0.003, 8), 0x5a6a72, {
        at: [0.47 + i * 0.02, 0.26 + (i % 3 ? 0.008 : 0), 0.68],
        rot: [Math.PI / 2, 0, 0],
      });
  }
}

// ── the pet gate with a flap (1×1) ─────────────────────────────────────────────────────────────────
function petDoor(m: Model, o: Look) {
  const wood = o.look === 1;
  const frame = wood ? P.oak : 0xeeebe4;
  const H = 0.82;
  const [x0, x1] = [0.06, 0.94];
  const z = 0.5;
  // the posts, their feet, the top and bottom rails
  for (const x of [x0, x1]) {
    m.add(box([0.05, H, 0.05], 0.008), frame, { at: [x, H / 2, z] });
    m.add(box([0.06, 0.03, 0.34], 0.008), frame, { at: [x, 0.015, z] });
  }
  for (const y of [0.06, H - 0.03]) m.add(box([x1 - x0, 0.04, 0.035], 0.006), frame, { at: [0.5, y, z] });
  // the flap's frame in the middle, low
  const [fw, fh, fy] = [0.26, 0.3, 0.1];
  for (const x of [0.5 - fw / 2 - 0.02, 0.5 + fw / 2 + 0.02])
    m.add(box([0.03, fh + 0.06, 0.04], 0.004), 0x2b2b2e, { at: [x, fy + fh / 2, z] });
  m.add(box([fw + 0.07, 0.03, 0.04], 0.004), 0x2b2b2e, { at: [0.5, fy + fh + 0.03, z] });
  m.add(box([fw + 0.07, 0.02, 0.04], 0.004), 0x2b2b2e, { at: [0.5, fy - 0.01, z] });
  // the infill: bars (steel) or slats (wood), round the flap
  const n = wood ? 7 : 13;
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.06 + (i * (x1 - x0 - 0.12)) / (n - 1);
    const inFlap = Math.abs(x - 0.5) < fw / 2 + 0.04;
    const y0 = inFlap ? fy + fh + 0.045 : 0.08;
    const y1 = H - 0.05;
    if (wood)
      m.add(box([0.07, y1 - y0, 0.018], 0.004), shade(frame, 0.92 + (i % 2) * 0.1), { at: [x, (y0 + y1) / 2, z] });
    else m.add(cyl(0.008, 0.008, y1 - y0, 6), frame, { at: [x, y0, z] });
  }
  // the flap (live): hung from its top, swinging to and fro as if something just went through
  m.live(
    box([0.006, fh, fw]).translate(0, -fh / 2, 0),
    0x9ab8c8,
    { kind: "nod", amp: 0.22, period: 3.2, phase: o.seed },
    {
      at: [0.5, fy + fh, z],
      rot: [0, Math.PI / 2, 0],
      glass: true,
    },
  );
  m.live(
    box([0.01, 0.02, fw]).translate(0, -fh + 0.01, 0),
    0x2b2b2e,
    { kind: "nod", amp: 0.22, period: 3.2, phase: o.seed },
    {
      at: [0.5, fy + fh, z],
      rot: [0, Math.PI / 2, 0],
    },
  );
}

// ── the auto-feeder (1×1) ──────────────────────────────────────────────────────────────────────────
function autoFeeder(m: Model, o: Look) {
  const body = o.look === 1 ? 0xb8bdc4 : 0xeeebe4;
  const trim = o.look === 1 ? 0x2b2b2e : 0x8a8f94;
  // the base and its bowl out front
  m.add(box([0.3, 0.12, 0.34], 0.02, 2), body, { at: [0.5, 0.06, 0.45] });
  m.add(box([0.3, 0.05, 0.18], 0.02, 2), body, { at: [0.5, 0.025, 0.68] });
  m.add(
    lathe(
      [
        [0.001, 0.05],
        [0.07, 0.05],
        [0.09, 0.085],
        [0.08, 0.085],
        [0.06, 0.06],
        [0.001, 0.06],
      ],
      16,
    ),
    P.chrome,
    { at: [0.5, 0, 0.7] },
  );
  for (let i = 0; i < 10; i++)
    m.add(ball(0.011, 4), i % 2 ? 0xb5773f : 0x6b4128, {
      at: [0.5 + Math.cos(i * GOLDEN) * 0.04, 0.068, 0.7 + Math.sin(i * GOLDEN) * 0.035],
    });
  // the hopper: a clear tank, kibble in it, a lid
  m.live(box([0.24, 0.24, 0.24], 0.015), 0xd8eef0, { kind: "still" }, { at: [0.5, 0.24, 0.42], glass: true });
  m.add(box([0.22, 0.1, 0.22], 0.01), 0x9a6a3e, { at: [0.5, 0.17, 0.42] });
  for (let i = 0; i < 30; i++)
    m.add(ball(0.016, 4), [0xb5773f, 0x6b4128, 0x8a5a36][i % 3], {
      at: [0.4 + rnd(i, 1, 0.3) * 0.2, 0.222 + rnd(i, 3, 0.3) * 0.012, 0.33 + rnd(i, 2, 0.3) * 0.18],
    });
  m.add(box([0.27, 0.04, 0.27], 0.012), body, { at: [0.5, 0.38, 0.42] });
  m.add(box([0.06, 0.012, 0.02], 0.004), trim, { at: [0.5, 0.405, 0.42] });
  // the panel: a little display (lit, its colon blinking), two buttons
  m.add(box([0.12, 0.05, 0.006]), 0x101214, { at: [0.5, 0.075, 0.623] });
  m.add(box([0.06, 0.02, 0.002]), 0x7fe0ff, { at: [0.48, 0.075, 0.627], glow: true });
  m.live(
    box([0.004, 0.012, 0.002]),
    0x7fe0ff,
    { kind: "blink", period: 1, on: 0.5, phase: 0 },
    { at: [0.525, 0.075, 0.627], glow: true },
  );
  for (const x of [0.43, 0.57])
    m.add(cyl(0.01, 0.01, 0.006, 8), trim, { at: [x, 0.1, 0.623], rot: [Math.PI / 2, 0, 0] });
}

// ── the bird cage on its stand (1×1) ───────────────────────────────────────────────────────────────
function birdCage(m: Model, o: Look) {
  const look = o.look;
  const metal = [P.brass, 0xeeebe4, 0x8a6a3a][look] ?? P.brass;
  // (the cage hangs at (cx, cz), its stand's pole off to its side, the foot under both)
  const [cx, cz] = [0.56, 0.5];
  const px = 0.2;
  // the stand: a weighted foot, a pole, a hook arching over, a chain down to the cage's loop
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.24, 0],
        [0.25, 0.02],
        [0.12, 0.05],
        [0.03, 0.08],
        [0.001, 0.08],
      ],
      18,
    ),
    look === 2 ? P.walnut : metal,
    { at: [0.38, 0, cz] },
  );
  const pole = 1.2;
  const stand = look === 2 ? P.walnut : metal;
  m.add(cyl(0.015, 0.015, pole, 10), stand, { at: [px, 0.0, cz] });
  m.add(
    tube(
      [
        [px, pole, cz],
        [px + 0.02, pole + 0.32, cz],
        [px + 0.16, pole + 0.5, cz],
        [cx, pole + 0.48, cz],
      ],
      0.013,
      6,
      12,
    ),
    stand,
  );
  m.add(ball(0.018, 6), stand, { at: [cx, pole + 0.48, cz] });
  const cy = 0.98; // the cage's floor
  const loop = look === 2 ? cy + 0.42 + 0.16 : cy + (look === 1 ? 0.36 : 0.3) + 0.19;
  m.add(cyl(0.003, 0.003, pole + 0.47 - loop, 4), P.steel, { at: [cx, loop, cz] });
  const bird = [0x7ac04a, 0x5a8ae0, 0xf0d040][Math.floor(o.seed * 3) % 3];
  if (look === 2) {
    // bamboo: a square cage of canes, a pagoda roof
    const [w, h] = [0.38, 0.42];
    m.add(box([w + 0.04, 0.04, w + 0.04], 0.006), 0x8a6a3a, { at: [cx, cy - 0.02, cz] });
    for (let i = 0; i < 11; i++)
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
      ]) {
        const t = -w / 2 + (i * w) / 10;
        for (const s of [-1, 1])
          m.add(cyl(0.004, 0.004, h, 4), 0xc8a86a, {
            at: [cx + (dx ? t : (s * w) / 2), cy, cz + (dz ? t : (s * w) / 2)],
          });
      }
    for (const y of [cy + 0.12, cy + h])
      for (const s of [-1, 1]) {
        m.add(box([w, 0.012, 0.012]), 0x8a6a3a, { at: [cx, y, cz + (s * w) / 2] });
        m.add(box([0.012, 0.012, w]), 0x8a6a3a, { at: [cx + (s * w) / 2, y, cz] });
      }
    m.add(cyl(0.3, 0.02, 0.12, 4), 0x6a4a2a, { at: [cx, cy + h, cz], rot: [0, Math.PI / 4, 0] });
    m.add(cyl(0.02, 0.02, 0.04, 6), 0x6a4a2a, { at: [cx, cy + h + 0.12, cz] });
  } else {
    // a dome: a base tray, bars curving up to a crown, rings round, a finial with its loop
    const R = 0.21;
    const H = look === 1 ? 0.36 : 0.3;
    m.add(cyl(R + 0.03, R + 0.02, 0.06, 20), metal, { at: [cx, cy - 0.06, cz] });
    m.add(ring(R + 0.02, 0.008, 4, 20), shade(metal, 0.85), { at: [cx, cy, cz] });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const pts: V3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const r = t < 0.55 ? R : R * Math.cos(((t - 0.55) / 0.45) * (Math.PI / 2)) + 0.01;
        pts.push([cx + Math.cos(a) * r, cy + t * (H + 0.12), cz + Math.sin(a) * r]);
      }
      m.add(tube(pts, 0.003, 3, 10), metal);
    }
    for (const y of [cy + 0.06, cy + 0.2]) m.add(ring(R, 0.004, 3, 22), metal, { at: [cx, y, cz] });
    m.add(ball(0.025, 8), metal, { at: [cx, cy + H + 0.13, cz] });
    m.add(ring(0.02, 0.004, 3, 10).rotateX(Math.PI / 2), metal, { at: [cx, cy + H + 0.17, cz] });
    if (look === 1) {
      // Victorian: scrolls round its waist and a little door
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        m.add(ring(0.02, 0.003, 3, 10).rotateX(Math.PI / 2), metal, {
          at: [cx + Math.cos(a) * (R + 0.005), cy + 0.13, cz + Math.sin(a) * (R + 0.005)],
          rot: [0, -a + Math.PI / 2, 0],
        });
      }
      m.add(box([0.08, 0.1, 0.004]), shade(metal, 0.9), { at: [cx, cy + 0.1, cz + R + 0.004] });
    }
  }
  // inside: a seed cup, a perch, the bird on it (bobbing), a swing above it (swaying)
  m.add(cyl(0.025, 0.02, 0.03, 10), 0xd8d0bc, { at: [cx + 0.12, cy + 0.02, cz + 0.06] });
  m.add(rod(0.006, 0.006, 0.3, "x", 6), 0x8a6a3a, { at: [cx, cy + 0.1, cz] });
  const birdy: BufferGeometry[] = [
    ball(0.032, 8).scale(0.9, 1.05, 1.25).translate(0, 0.035, 0),
    ball(0.022, 8).translate(0, 0.075, 0.025),
    box([0.012, 0.035, 0.05]).rotateX(0.7).translate(0, 0.03, -0.055),
  ];
  m.live(
    merged(birdy),
    bird,
    { kind: "nod", amp: 0.2, period: 1.7, phase: o.seed },
    { at: [cx - 0.03, cy + 0.106, cz] },
  );
  m.live(
    merged([
      cyl(0.006, 0.0001, 0.012, 4)
        .rotateX(Math.PI / 2)
        .translate(0, 0.072, 0.05),
      ball(0.005, 4).translate(0.016, 0.082, 0.038),
      ball(0.005, 4).translate(-0.016, 0.082, 0.038),
    ]),
    P.ink,
    { kind: "nod", amp: 0.2, period: 1.7, phase: o.seed },
    { at: [cx - 0.03, cy + 0.106, cz] },
  );
  const swing: BufferGeometry[] = [rod(0.004, 0.004, 0.09, "x", 4).translate(0, -0.12, 0)];
  for (const s of [-1, 1]) swing.push(cyl(0.0015, 0.0015, 0.12, 3).translate(s * 0.045, -0.12, 0));
  m.live(
    merged(swing),
    0x8a6a3a,
    { kind: "nod", amp: 0.18, period: 2.4, phase: o.seed + 0.3 },
    { at: [cx + 0.06, cy + 0.32, cz - 0.04] },
  );
}

// ── the hamster cage (on a surface) ────────────────────────────────────────────────────────────────
function hamsterWheel(m: Model, o: Look) {
  const glassTank = o.look === 1;
  const [w, d, h] = [0.44, 0.28, 0.26];
  const base = glassTank ? 0x2b2b2e : 0x3a8ae0;
  // the base tray, the bedding in it
  m.add(box([w, glassTank ? 0.012 : 0.07, d], 0.01), base, { at: [0.5, glassTank ? 0.006 : 0.035, 0.5] });
  m.add(box([w - 0.02, 0.025, d - 0.02]), 0xe8d8a8, { at: [0.5, 0.0375, 0.5] });
  for (let i = 0; i < 18; i++)
    m.add(box([0.02, 0.006, 0.01]), shade(0xe8d8a8, 0.85 + rnd(i, 1, o.seed) * 0.2), {
      at: [0.3 + rnd(i, 2, o.seed) * 0.4, 0.052, 0.38 + rnd(i, 3, o.seed) * 0.24],
      rot: [0, rnd(i, 4, o.seed) * 3, 0],
    });
  const top = 0.05;
  if (glassTank) {
    // glass sides, a wooden-framed mesh lid
    m.live(
      box([w - 0.004, h, d - 0.004]),
      0xd8eef0,
      { kind: "still" },
      { at: [0.5, top + h / 2 - 0.04, 0.5], glass: true },
    );
    m.add(box([w + 0.01, 0.02, d + 0.01], 0.004), P.oak, { at: [0.5, top + h - 0.03, 0.5] });
    for (let i = 0; i < 12; i++)
      m.add(box([0.003, 0.003, d - 0.02]), P.steel, { at: [0.5 - w / 2 + 0.02 + i * 0.036, top + h - 0.018, 0.5] });
  } else {
    // a wire top: bars all round, a roof of them, a carry handle
    for (let i = 0; i <= 14; i++) {
      const x = 0.5 - w / 2 + 0.01 + (i * (w - 0.02)) / 14;
      for (const z of [0.5 - d / 2 + 0.01, 0.5 + d / 2 - 0.01])
        m.add(cyl(0.0018, 0.0018, h - 0.04, 3), 0xd8d8dc, { at: [x, 0.07, z] });
      m.add(cyl(0.0018, 0.0018, d - 0.02, 3), 0xd8d8dc, {
        at: [x, top + h - 0.02, 0.5 - d / 2 + 0.01],
        rot: [Math.PI / 2, 0, 0],
      });
    }
    for (let i = 0; i <= 8; i++) {
      const z = 0.5 - d / 2 + 0.01 + (i * (d - 0.02)) / 8;
      for (const x of [0.5 - w / 2 + 0.01, 0.5 + w / 2 - 0.01])
        m.add(cyl(0.0018, 0.0018, h - 0.04, 3), 0xd8d8dc, { at: [x, 0.07, z] });
    }
    // its rims, top and foot
    for (const y of [0.075, top + h - 0.02]) {
      for (const z of [0.5 - d / 2 + 0.01, 0.5 + d / 2 - 0.01])
        m.add(box([w - 0.02, 0.004, 0.004]), 0xd8d8dc, { at: [0.5, y, z] });
      for (const x of [0.5 - w / 2 + 0.01, 0.5 + w / 2 - 0.01])
        m.add(box([0.004, 0.004, d - 0.02]), 0xd8d8dc, { at: [x, y, 0.5] });
    }
    m.add(
      tube(
        [
          [0.42, top + h - 0.02, 0.5],
          [0.5, top + h + 0.03, 0.5],
          [0.58, top + h - 0.02, 0.5],
        ],
        0.004,
        4,
        8,
      ),
      0xd8d8dc,
    );
  }
  // a little wooden house, a water bottle on the side
  m.add(box([0.09, 0.06, 0.08]), P.oakLight, { at: [0.64, top + 0.03, 0.46] });
  m.add(
    extrude(
      [
        [-0.055, 0],
        [0.055, 0],
        [0, 0.04],
      ],
      0.09,
    ),
    shade(P.oakLight, 0.85),
    { at: [0.64, top + 0.06, 0.46] },
  );
  m.add(cyl(0.022, 0.022, 0.003, 10), 0x2a2420, { at: [0.64, top + 0.03, 0.501], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(0.018, 0.018, 0.11, 10), 0xd8eef0, { at: [0.5 + w / 2 - 0.03, top + 0.09, 0.5 - d / 2 + 0.03] });
  m.add(cyl(0.004, 0.004, 0.05, 6), P.chrome, { at: [0.5 + w / 2 - 0.03, top + 0.05, 0.5 - d / 2 + 0.03] });
  // the wheel on its stand: rim, spokes and treads, going round (live)
  const [wx, wy, wz] = [0.4, top + 0.105, 0.5];
  const W = 0.09;
  m.add(box([0.012, wy - top, 0.012]), 0xd8d8dc, { at: [wx, (wy + top) / 2, wz - 0.05] });
  m.add(box([0.05, 0.006, 0.05]), 0xd8d8dc, { at: [wx, top + 0.003, wz - 0.05] });
  const wheel: BufferGeometry[] = [
    ring(W, 0.004, 3, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.025),
    ring(W, 0.004, 3, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.025),
  ];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    wheel.push(
      box([0.006, 0.004, 0.05])
        .rotateZ(a)
        .translate(Math.cos(a) * W, Math.sin(a) * W, 0),
    );
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    wheel.push(
      box([W, 0.004, 0.004])
        .translate(W / 2, 0, -0.03)
        .rotateZ(a),
    );
  }
  wheel.push(
    cyl(0.012, 0.012, 0.012, 8)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.035),
  );
  m.live(
    merged(wheel),
    o.look === 1 ? 0xf06a9a : 0xf0b030,
    { kind: "spin", axis: "z", speed: -5 },
    { at: [wx, wy, wz] },
  );
  // the hamster, running in it (bobbing as it goes)
  const ham: BufferGeometry[] = [
    ball(0.03, 8).scale(1.3, 0.85, 0.9).translate(0, 0.024, 0),
    ball(0.01, 5).translate(0.03, 0.04, 0.016),
    ball(0.01, 5).translate(0.03, 0.04, -0.016),
  ];
  m.live(merged(ham), 0xd8964a, { kind: "nod", amp: 0.18, period: 0.3, phase: 0 }, { at: [wx, wy - W + 0.006, wz] });
  m.live(
    merged([
      ball(0.016, 6).scale(1.2, 0.8, 0.9).translate(0.012, 0.012, 0),
      ball(0.004, 4).translate(0.046, 0.032, 0.01),
      ball(0.004, 4).translate(0.046, 0.032, -0.01),
    ]),
    0xf4ead8,
    { kind: "nod", amp: 0.18, period: 0.3, phase: 0 },
    { at: [wx, wy - W + 0.006, wz] },
  );
}

// ── the pet sofa (1×1) ─────────────────────────────────────────────────────────────────────────────
function petSofa(m: Model, o: Look) {
  const c = o.fabric ?? [0x6e2f22, 0x3f5a6a, 0xb8a888][o.look] ?? 0x6e2f22;
  const [cx, cz] = [0.5, 0.52];
  const [w, d] = [0.74, 0.54];
  if (o.look === 2) {
    // a daybed: a low frame, a thick cushion, round bolsters at its ends and back
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        m.add(cyl(0.015, 0.012, 0.06, 8), P.walnut, { at: [cx + x * (w / 2 - 0.05), 0, cz + z * (d / 2 - 0.05)] });
    m.add(box([w, 0.05, d], 0.01), P.walnut, { at: [cx, 0.085, cz] });
    m.add(cushion([w - 0.04, 0.09, d - 0.04], 0.3), c, { at: [cx, 0.155, cz] });
    for (const s of [-1, 1])
      m.add(rod(0.06, 0.06, d - 0.08, "z", 12), shade(c, 0.9), { at: [cx + s * (w / 2 - 0.07), 0.25, cz] });
    m.add(rod(0.065, 0.065, w - 0.1, "x", 12), shade(c, 0.85), { at: [cx, 0.26, cz - d / 2 + 0.08] });
    for (const s of [-1, 1])
      m.add(cyl(0.062, 0.062, 0.006, 12), shade(c, 0.7), {
        at: [cx + s * (w / 2 - 0.05), 0.26, cz - d / 2 + 0.08],
        rot: [0, 0, Math.PI / 2],
      });
  } else {
    const chester = o.look === 0;
    // legs: buns (Chesterfield) or tapered (mid-century)
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        m.add(chester ? ball(0.025, 8) : cyl(0.012, 0.018, 0.1, 8), chester ? P.walnutDark : P.oak, {
          at: [cx + x * (w / 2 - 0.06), chester ? 0.02 : 0, cz + z * (d / 2 - 0.06)],
          rot: chester ? [0, 0, 0] : [z * 0.15, 0, -x * 0.15],
        });
    const y0 = chester ? 0.04 : 0.1;
    m.add(box([w, 0.1, d], 0.03, 2), c, { at: [cx, y0 + 0.05, cz] });
    m.add(cushion([w - 0.16, 0.08, d - 0.14], 0.35), shade(c, 1.08), { at: [cx, y0 + 0.13, cz + 0.04] });
    // the back and arms
    m.add(cushion([w, 0.24, 0.1], 0.2), c, { at: [cx, y0 + 0.2, cz - d / 2 + 0.05] });
    for (const s of [-1, 1]) {
      m.add(box([0.08, chester ? 0.16 : 0.12, d - 0.04], 0.03, 2), c, {
        at: [cx + s * (w / 2 - 0.04), y0 + (chester ? 0.16 : 0.14), cz + 0.01],
      });
      if (chester)
        m.add(rod(0.05, 0.05, d - 0.04, "z", 12), c, { at: [cx + s * (w / 2 - 0.04), y0 + 0.24, cz + 0.01] });
    }
    if (chester) {
      // buttons tufted into the back, in diamonds
      for (let i = 0; i < 7; i++)
        for (let k = 0; k < 2; k++) {
          const x = cx - 0.27 + i * 0.09 + (k % 2) * 0.045;
          if (x > cx + 0.29) continue;
          m.add(ball(0.007, 5), shade(c, 0.6), { at: [x, y0 + 0.24 + k * 0.07, cz - d / 2 + 0.101] });
        }
    } else
      for (let i = 0; i < 3; i++)
        m.add(ball(0.01, 5), shade(c, 0.65), { at: [cx - 0.18 + i * 0.18, y0 + 0.24, cz - d / 2 + 0.1] });
  }
  // a bone cushion on it
  const bone = (at: V3) => {
    m.add(rod(0.025, 0.025, 0.12, "x", 8), P.cream, { at });
    for (const s of [-1, 1])
      for (const k of [-1, 1]) m.add(ball(0.026, 7), P.cream, { at: [at[0] + s * 0.07, at[1], at[2] + k * 0.02] });
  };
  bone([cx + 0.1, o.look === 2 ? 0.225 : o.look === 0 ? 0.245 : 0.305, cz + 0.06]);
  // (story) a paw-print blanket over its arm
  if (o.seed > 0.5)
    m.add(box([0.2, 0.012, 0.3], 0.004), 0xd8cfbc, {
      at: [cx - 0.2, o.look === 2 ? 0.215 : 0.23, cz + 0.04],
      rot: [0, 0.2, 0.05],
    });
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  cat_tree: catTree,
  agility_jump: agilityJump,
  agility_tunnel: agilityTunnel,
  weave_poles: weavePoles,
  ball_launcher: ballLauncher,
  litter_box: litterBox,
  pet_door: petDoor,
  auto_feeder: autoFeeder,
  bird_cage: birdCage,
  hamster_wheel: hamsterWheel,
  pet_sofa: petSofa,
};
