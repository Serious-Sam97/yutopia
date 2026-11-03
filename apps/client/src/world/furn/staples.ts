import { SEAT_SPEC, SURFACE } from "@yutopia/shared";
import { ball, box, cushion, cyl, type Look, lathe, type Model, ring, rod, tube, type V3 } from "./kit";
import { P, shade } from "./palette";

// The office staples (docs/plan/67-the-furniture.md, phase 8b): new kinds, each from the start with
// its spec (shared furniture.ts: the bar stool's and the phone booth's seats, the standing desk's,
// the high table's and the shelving's tops), its shapes and the catalog's entry. In the kit's
// frame: x across, z down, y up; facing the room (+z). The chair's task chairs (mesh, padded) are
// its own looks already; these are what an office still lacked.

export const STAPLE_LOOKS = {
  standing_desk: ["Standing desk, oak", "Standing desk, white"],
  filing_cabinet: ["Filing cabinet, grey", "Filing cabinet, green"],
  printer: ["Copier"],
  shelving: ["Open shelving, oak", "Open shelving, black steel"],
  fridge: ["Fridge, cream", "Fridge, steel"],
  microwave: ["Microwave"],
  bar_stool: ["Bar stool, walnut", "Bar stool, chrome"],
  high_table: ["High table"],
  phone_booth: ["Phone booth"],
  coat_rack: ["Coat rack"],
  wall_shelf: ["Wall shelf"],
  pendant_light: ["Pendant light"],
  panel_light: ["Ceiling panel"],
} as const;

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const CEILING = 3.27; // the walls' height (shared levels.ts: 3.5 floor to floor, the slab over them)
const BOOK = [P.rust, P.olive, 0x3f4a5a, P.mustard, P.cream, P.oxblood, P.teak];

/** A standing desk (2×1) at SURFACE: a top on two telescoping legs with their motors, a cross bar,
 *  the controls under its front edge. */
export function standingDesk(m: Model, o: Look) {
  const top = SURFACE.standing_desk;
  const wood = o.look === 1 ? P.white : P.oak;
  const steel = o.look === 1 ? P.white : P.steel;
  m.add(box([1.9, 0.03, 0.86], 0.006, 2), wood, { at: [1, top - 0.015, 0.5] });
  m.add(box([1.86, 0.008, 0.82]), shade(wood, 0.85), { at: [1, top - 0.034, 0.5] });
  for (const x of [0.3, 1.7]) {
    m.add(box([0.07, 0.05, 0.7], 0.006), steel, { at: [x, 0.025, 0.5] });
    m.add(box([0.08, top * 0.5, 0.06], 0.004), steel, { at: [x, 0.05 + (top * 0.5) / 2, 0.42] });
    m.add(box([0.065, top * 0.48, 0.05], 0.004), shade(steel, 1.15), { at: [x, top * 0.5 + (top * 0.48) / 2, 0.42] });
    m.add(box([0.06, 0.04, 0.68], 0.004), steel, { at: [x, top - 0.06, 0.5] });
  }
  m.add(box([1.3, 0.05, 0.05]), steel, { at: [1, top - 0.08, 0.3] });
  // the controls
  m.add(box([0.12, 0.03, 0.06], 0.006), P.plastic, { at: [1.6, top - 0.05, 0.9] });
  for (const [x, c] of [
    [1.57, P.alum],
    [1.63, P.alum],
  ] as const)
    m.add(box([0.025, 0.006, 0.02]), c, { at: [x, top - 0.068, 0.91] });
  m.add(box([0.012, 0.006, 0.004]), P.ledGreen, { at: [1.6, top - 0.05, 0.931], glow: true });
}

/** A four-drawer filing cabinet, 1.32 m: each drawer's label holder and handle; one drawer ajar,
 *  the files in it (by its seed). */
export function filingCabinet(m: Model, o: Look) {
  const c = o.look === 1 ? P.lockerGreen : 0x8d9296;
  m.add(box([0.48, 1.32, 0.66], 0.01), c, { at: [0.5, 0.66, 0.47] });
  const ajar = Math.floor(o.seed * 4);
  for (let i = 0; i < 4; i++) {
    const y = 0.18 + i * 0.32;
    const out = i === ajar ? 0.14 : 0;
    m.add(box([0.44, 0.3, 0.02], 0.004), shade(c, 1.08), { at: [0.5, y, 0.81 + out] });
    m.add(box([0.16, 0.02, 0.02], 0.004), P.chrome, { at: [0.5, y + 0.05, 0.83 + out] });
    m.add(box([0.08, 0.04, 0.004]), P.paperWhite, { at: [0.5, y + 0.1, 0.822 + out] });
    if (out) {
      m.add(box([0.4, 0.24, out + 0.02]), shade(c, 0.6), { at: [0.5, y - 0.02, 0.8 + out / 2 - 0.01] });
      for (let k = 0; k < 6; k++)
        m.add(box([0.36, 0.22, 0.006]), [P.mustard, 0xd8e0d0, P.cream][k % 3], {
          at: [0.5, y + 0.02, 0.77 + k * 0.025 + out * 0.6],
        });
    }
  }
}

/** A floor copier, 1.1 m: its paper drawers, the glass lid, the touch panel lit, a sheet in the
 *  out tray. */
export function printer(m: Model) {
  m.add(box([0.62, 0.58, 0.58], 0.01), 0xd8d6d0, { at: [0.5, 0.29, 0.5] });
  for (let i = 0; i < 3; i++) {
    m.add(box([0.58, 0.16, 0.01], 0.004), 0xc9c6bf, { at: [0.5, 0.1 + i * 0.18, 0.795] });
    m.add(box([0.2, 0.02, 0.02], 0.004), P.graphite, { at: [0.5, 0.15 + i * 0.18, 0.8] });
  }
  m.add(box([0.62, 0.36, 0.56], 0.012), 0xe6e4de, { at: [0.5, 0.76, 0.49] });
  m.add(box([0.6, 0.04, 0.54], 0.006), P.graphite, { at: [0.5, 0.96, 0.49] });
  m.add(box([0.6, 0.02, 0.54], 0.004), 0xe6e4de, { at: [0.5, 0.99, 0.49] });
  // the out tray, a sheet on it
  m.add(box([0.3, 0.012, 0.3]), P.graphite, { at: [0.62, 0.62, 0.5], rot: [0, 0, 0.1] });
  m.add(box([0.21, 0.004, 0.29]), P.paperWhite, { at: [0.62, 0.63, 0.5], rot: [0, 0, 0.1] });
  // the panel, tipped up on its arm
  m.add(box([0.22, 0.14, 0.02], 0.006), P.plastic, { at: [0.72, 1.06, 0.76], rot: [-0.7, 0, 0] });
  m.add(box([0.18, 0.1, 0.004]), 0x7fb0d0, { at: [0.72, 1.063, 0.77], rot: [-0.7, 0, 0], glow: true });
  m.add(box([0.012, 0.012, 0.004]), P.ledGreen, { at: [0.28, 0.92, 0.775], glow: true });
}

/** Open shelving (2×1) to SURFACE: two ends, three shelves (things stand on its top), on them
 *  binders, boxes and books by its seed. */
export function shelving(m: Model, o: Look) {
  const top = SURFACE.shelving;
  const frame = o.look === 1 ? P.ash : P.oak;
  for (const x of [0.06, 1.94]) m.add(box([0.03, top, 0.4], 0.004), frame, { at: [x, top / 2, 0.5] });
  for (const y of [0.04, 0.42, 0.81, top - 0.015]) m.add(box([1.85, 0.03, 0.4], 0.004), frame, { at: [1, y, 0.5] });
  for (const [k, y] of [0.06, 0.44].entries()) {
    let x = 0.12;
    let i = 0;
    while (x < 1.85) {
      const r = rnd(i, k, o.seed);
      if (r < 0.15) {
        x += 0.12;
      } else if (r < 0.45) {
        m.add(box([0.06, 0.3, 0.26], 0.004), BOOK[i % BOOK.length], { at: [x + 0.03, y + 0.15, 0.5] });
        m.add(ring(0.018, 0.004, 3, 8), P.chrome, { at: [x + 0.03, y + 0.22, 0.633], rot: [Math.PI / 2, 0, 0] });
        x += 0.065;
      } else if (r < 0.6 && x + 0.32 <= 1.9) {
        m.add(box([0.3, 0.22, 0.3], 0.006), 0xb8935e, { at: [x + 0.15, y + 0.11, 0.5] });
        x += 0.32;
      } else {
        const h = 0.2 + rnd(i, 7, o.seed) * 0.1;
        m.add(box([0.035, h, 0.22], 0.002), BOOK[(i * 3) % BOOK.length], { at: [x + 0.018, y + h / 2, 0.5] });
        x += 0.038;
      }
      i++;
    }
  }
  // a plant trailing off the middle shelf
  m.add(cyl(0.07, 0.08, 0.12, 10), P.terracotta, { at: [1.6, 0.825, 0.5] });
  for (let i = 0; i < 4; i++)
    m.add(
      tube(
        [
          [1.6, 0.94, 0.5],
          [1.62 + i * 0.03, 0.9, 0.62 + i * 0.02],
          [1.64 + i * 0.05, 0.62 - i * 0.05, 0.7],
        ],
        0.004,
        3,
        6,
      ),
      P.leaf,
    );
}

/** A tall fridge, cream or steel: its freezer door over the fridge door, long handles, a magnet or
 *  two and a note. */
export function fridge(m: Model, o: Look) {
  const c = o.look === 1 ? 0xb7bbbe : 0xe9e1cc;
  m.add(box([0.66, 1.8, 0.64], 0.03, 2), c, { at: [0.5, 0.92, 0.46] });
  m.add(box([0.62, 0.02, 0.62]), P.plastic, { at: [0.5, 0.02, 0.45] });
  m.add(box([0.64, 0.012, 0.02]), shade(c, 0.7), { at: [0.5, 1.28, 0.785] });
  for (const [y0, y1] of [
    [0.1, 1.27],
    [1.29, 1.8],
  ]) {
    m.add(box([0.62, y1 - y0, 0.03], 0.012), shade(c, 1.04), { at: [0.5, (y0 + y1) / 2, 0.795] });
    m.add(box([0.025, Math.min(0.5, y1 - y0 - 0.2), 0.03], 0.008), o.look === 1 ? P.steel : P.chrome, {
      at: [0.76, y0 + (y1 < 1.5 ? y1 - y0 - 0.35 : 0.15), 0.83],
    });
  }
  for (const [x, y, c2] of [
    [0.35, 1.5, 0xc4402b],
    [0.45, 1.08, P.mustard],
  ] as const)
    m.add(cyl(0.018, 0.018, 0.012, 10), c2, { at: [x, y, 0.81], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.12, 0.16, 0.002]), P.paperWhite, { at: [0.45, 1.0, 0.812], rot: [0, 0, 0.05] });
}

/** A microwave on a counter (on a surface, round its tile's middle): its door's dark window, the
 *  clock lit, the keypad. */
export function microwave(m: Model) {
  m.add(box([0.48, 0.28, 0.36], 0.012), 0xe6e4de, { at: [0.5, 0.14, 0.5] });
  m.add(box([0.32, 0.22, 0.012], 0.006), P.graphite, { at: [0.42, 0.145, 0.684] });
  m.add(box([0.24, 0.15, 0.004]), 0x1a1d1c, { at: [0.42, 0.145, 0.692] });
  m.add(box([0.02, 0.18, 0.02], 0.004), P.alum, { at: [0.6, 0.145, 0.7] });
  m.add(box([0.08, 0.025, 0.004]), P.ledGreen, { at: [0.67, 0.23, 0.682], glow: true });
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 2; c++)
      m.add(box([0.022, 0.016, 0.006]), P.cream, { at: [0.65 + c * 0.03, 0.18 - r * 0.03, 0.682] });
  for (const x of [0.3, 0.7])
    for (const z of [0.36, 0.64]) m.add(cyl(0.012, 0.012, 0.01, 6), P.rubber, { at: [x, -0.0, z] });
}

/** A bar stool, its seat at the spec: a round padded top on a walnut or chrome stand, a footrest
 *  ring. */
export function barStool(m: Model, o: Look) {
  const top = SEAT_SPEC.bar_stool.top;
  const chrome = o.look === 1;
  if (chrome) {
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.2, 0],
          [0.19, 0.02],
          [0.03, 0.04],
          [0.001, 0.04],
        ],
        20,
      ),
      P.chrome,
      { at: [0.5, 0, 0.5] },
    );
    m.add(cyl(0.025, 0.025, top - 0.09), P.chrome, { at: [0.5, 0.04, 0.5] });
    m.add(ring(0.17, 0.01, 4, 20), P.chrome, { at: [0.5, 0.3, 0.5] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      m.add(rod(0.007, 0.007, 0.15, "x", 4), P.chrome, {
        at: [0.5 + Math.cos(a) * 0.09, 0.3, 0.5 + Math.sin(a) * 0.09],
        rot: [0, -a, 0],
      });
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      m.add(
        tube(
          [
            [0.5 + Math.cos(a) * 0.12, top - 0.05, 0.5 + Math.sin(a) * 0.12],
            [0.5 + Math.cos(a) * 0.18, 0, 0.5 + Math.sin(a) * 0.18],
          ],
          0.016,
          6,
          2,
        ),
        P.walnut,
      );
    }
    m.add(ring(0.16, 0.012, 4, 20), P.walnutDark, { at: [0.5, 0.28, 0.5] });
  }
  m.add(cyl(0.17, 0.17, 0.03, 20), chrome ? P.steel : P.walnutDark, { at: [0.5, top - 0.06, 0.5] });
  // (a round pad, its top the seat)
  m.add(
    lathe(
      [
        [0.001, top - 0.045],
        [0.165, top - 0.045],
        [0.18, top - 0.025],
        [0.17, top - 0.006],
        [0.1, top],
        [0.001, top],
      ],
      24,
    ),
    o.fabric ?? (chrome ? P.oxblood : P.cognac),
    { at: [0.5, 0, 0.5] },
  );
}

/** A high bistro table at SURFACE: a round top on a column over a heavy foot. */
export function highTable(m: Model) {
  const top = SURFACE.high_table;
  m.add(cyl(0.38, 0.38, 0.03, 28), P.walnut, { at: [0.5, top - 0.03, 0.5] });
  m.add(cyl(0.34, 0.34, 0.01, 24), P.walnutDark, { at: [0.5, top - 0.04, 0.5] });
  m.add(cyl(0.035, 0.035, top - 0.07), P.steel, { at: [0.5, 0.03, 0.5] });
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.24, 0],
        [0.23, 0.02],
        [0.05, 0.035],
        [0.001, 0.035],
      ],
      24,
    ),
    P.steel,
    { at: [0.5, 0, 0.5] },
  );
}

/** A one-person phone booth (1×1): felt-lined walls on three sides, a glass front left open, a roof
 *  with its light, the bench seat inside at the spec, a little shelf for the laptop. */
export function phoneBooth(m: Model, o: Look) {
  const c = o.fabric ?? P.olive;
  const H = 2.2;
  m.add(box([0.96, 0.04, 0.96], 0.006), P.walnut, { at: [0.5, 0.02, 0.5] });
  m.add(box([0.96, H - 0.04, 0.04], 0.008), c, { at: [0.5, H / 2, 0.04] });
  for (const x of [0.04, 0.96]) m.add(box([0.04, H - 0.04, 0.92], 0.008), c, { at: [x, H / 2, 0.5] });
  m.add(box([1.0, 0.06, 1.0], 0.01), P.walnut, { at: [0.5, H + 0.01, 0.5] });
  m.add(box([0.4, 0.01, 0.2]), 0xfff2cc, { at: [0.5, H - 0.04, 0.5], glow: true });
  // the felt's panels, the glass door's frame (left open: its posts and its head)
  for (const y of [0.6, 1.2, 1.8]) m.add(box([0.88, 0.012, 0.004]), shade(c, 0.8), { at: [0.5, y, 0.062] });
  for (const x of [0.07, 0.93]) m.add(box([0.03, H - 0.06, 0.04], 0.004), P.ash, { at: [x, H / 2, 0.96] });
  m.add(box([0.86, 0.06, 0.04], 0.004), P.ash, { at: [0.5, H - 0.03, 0.96] });
  // the seat (its top at the spec), the shelf
  const s = SEAT_SPEC.phone_booth;
  m.add(box([0.8, s.top - 0.1, 0.42], 0.01), P.walnutDark, {
    at: [0.5, (s.top - 0.1) / 2 + 0.04, 0.5 + s.front - 0.21],
  });
  m.add(cushion([0.8, 0.07, 0.44], 0.2, 2), shade(c, 1.2), { at: [0.5, s.top - 0.035, 0.5 + s.front - 0.22] });
  m.add(cushion([0.8, 0.07, 0.5], 0.2, 2), shade(c, 1.2), {
    at: [0.5, s.top + 0.35, 0.08],
    rot: [Math.PI / 2 - 0.12, 0, 0],
  });
  m.add(box([0.06, 0.024, 0.3], 0.004), P.oak, { at: [0.12, 0.98, 0.55] });
}

/** A bentwood coat rack, 1.8 m: its splayed feet, the post, hooks with a coat (its colour by the
 *  seed), a scarf and a hat. */
export function coatRack(m: Model, o: Look) {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    m.add(
      tube(
        [
          [0.5, 0.25, 0.5],
          [0.5 + Math.cos(a) * 0.18, 0.06, 0.5 + Math.sin(a) * 0.18],
          [0.5 + Math.cos(a) * 0.26, 0.01, 0.5 + Math.sin(a) * 0.26],
        ],
        0.014,
        5,
        6,
      ),
      P.walnutDark,
    );
  }
  m.add(cyl(0.022, 0.018, 1.75), P.walnutDark, { at: [0.5, 0.05, 0.5] });
  m.add(ball(0.035, 8), P.walnutDark, { at: [0.5, 1.81, 0.5] });
  const hooks: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tip: V3 = [0.5 + Math.cos(a) * 0.17, 1.66, 0.5 + Math.sin(a) * 0.17];
    m.add(
      tube([[0.5, 1.62, 0.5], [0.5 + Math.cos(a) * 0.12, 1.6, 0.5 + Math.sin(a) * 0.12], tip], 0.009, 4, 6),
      P.walnutDark,
    );
    hooks.push(tip);
  }
  // what hangs on it
  const coat = [P.oxblood, 0x3f4a5a, P.mustard, P.olive][Math.floor(o.seed * 4)];
  const h0 = hooks[1];
  m.add(cushion([0.36, 0.9, 0.16], 0.15, 2), coat, { at: [h0[0] + 0.02, 1.2, h0[2] + 0.05], rot: [0.08, -1.0, 0] });
  m.add(box([0.12, 0.08, 0.1], 0.02), shade(coat, 0.85), { at: [h0[0], 1.62, h0[2]] });
  {
    const h1 = hooks[4];
    m.add(box([0.06, 0.7, 0.02], 0.004), P.rust, { at: [h1[0], 1.32, h1[2]], rot: [0.05, 0.3, 0] });
    m.add(box([0.06, 0.6, 0.02], 0.004), P.rust, { at: [h1[0] + 0.05, 1.36, h1[2] + 0.02], rot: [-0.05, 0.3, 0] });
  }
  {
    const h2 = hooks[3];
    m.add(cyl(0.14, 0.14, 0.012, 16), 0x2b2a26, { at: [h2[0], 1.67, h2[2]] });
    m.add(cyl(0.08, 0.075, 0.1, 14), 0x2b2a26, { at: [h2[0], 1.68, h2[2]] });
  }
}

/** A wall shelf (2×1, on the wall: its face at z 0.1): an oak board on two brackets 1.45 m up,
 *  books, a little plant and a photo on it by its seed. */
export function wallShelf(m: Model, o: Look) {
  const Y = 1.45;
  m.add(box([1.6, 0.03, 0.24], 0.004), P.oak, { at: [1, Y, 0.22] });
  for (const x of [0.4, 1.6]) {
    m.add(box([0.03, 0.18, 0.02], 0.002), P.steel, { at: [x, Y - 0.1, 0.11] });
    m.add(box([0.03, 0.02, 0.2], 0.002), P.steel, { at: [x, Y - 0.025, 0.2] });
  }
  let x = 0.3;
  for (let i = 0; x < 0.95; i++) {
    const h = 0.17 + rnd(i, 1, o.seed) * 0.08;
    m.add(box([0.035, h, 0.18], 0.002), BOOK[(i + Math.floor(o.seed * 7)) % BOOK.length], {
      at: [x, Y + 0.015 + h / 2, 0.22],
    });
    x += 0.04;
  }
  m.add(box([0.035, 0.2, 0.18], 0.002), P.cream, { at: [x + 0.03, Y + 0.11, 0.22], rot: [0, 0, -0.35] });
  m.add(cyl(0.06, 0.07, 0.1, 10), P.terracotta, { at: [1.35, Y + 0.015, 0.22] });
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4;
    m.add(
      tube(
        [
          [1.35, Y + 0.11, 0.22],
          [1.35 + Math.cos(a) * 0.06, Y + 0.08, 0.22 + Math.sin(a) * 0.04],
          [1.35 + Math.cos(a) * 0.1, Y - 0.05 - i * 0.03, 0.26 + Math.sin(a) * 0.03],
        ],
        0.004,
        3,
        6,
      ),
      P.leaf,
    );
  }
  m.add(box([0.16, 0.2, 0.015], 0.003), P.walnutDark, { at: [1.65, Y + 0.115, 0.2], rot: [-0.12, 0, 0] });
  m.add(box([0.12, 0.15, 0.002]), 0x8a9a7a, { at: [1.65, Y + 0.117, 0.209], rot: [-0.12, 0, 0] });
}

/** A pendant light hung from the ceiling on its cord: an enamel dome, the bulb glowing under it
 *  when on. */
export function pendantLight(m: Model, o: Look) {
  const on = o.on !== false;
  const y = 2.3;
  m.add(cyl(0.05, 0.05, 0.03, 12), P.ink, { at: [0.5, CEILING - 0.03, 0.5] });
  m.add(cyl(0.004, 0.004, CEILING - 0.03 - (y + 0.2)), P.ink, { at: [0.5, y + 0.2, 0.5] });
  const c = o.fabric ?? 0x2f4a3a;
  m.add(
    lathe(
      [
        [0.001, 0.22],
        [0.04, 0.22],
        [0.06, 0.18],
        [0.16, 0.06],
        [0.2, 0],
        [0.19, 0],
      ],
      22,
    ),
    c,
    { at: [0.5, y, 0.5] },
  );
  m.add(
    lathe(
      [
        [0.185, 0.002],
        [0.155, 0.06],
        [0.055, 0.175],
        [0.001, 0.2],
      ],
      22,
    ),
    on ? 0xfff2cc : P.white,
    { at: [0.5, y, 0.5], glow: on },
  );
  m.add(ball(0.05, 10), on ? P.vfd : P.paperWhite, { at: [0.5, y + 0.06, 0.5], glow: on });
}

/** A flat LED panel set in the ceiling: its frame, the diffuser lit when on. */
export function panelLight(m: Model, o: Look) {
  const on = o.on !== false;
  m.add(box([0.62, 0.03, 0.62], 0.004), P.white, { at: [0.5, CEILING - 0.015, 0.5] });
  m.add(box([0.56, 0.004, 0.56]), on ? 0xf4f8ff : 0xdadcd8, { at: [0.5, CEILING - 0.032, 0.5], glow: on });
}
