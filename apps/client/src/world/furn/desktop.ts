import { ISO_PX } from "@yutopia/shared";
import { COMPUTER_GLASS } from "@yutopia/shared/computer";
import { ball, box, cushion, cyl, extrude, type Look, lathe, leaf, type Model, ring, rod, tube, type V3 } from "./kit";
import { P, shade } from "./palette";

// What stands on desks and tables (docs/plan/67-the-furniture.md, phase 4), in a thing-on-a-surface's
// frame: one tile, its middle at (0.5, 0.5), y up from the top it stands on (its host's: the lift
// is the host's surface), facing −z — whoever sits at the desk (the catalog's rot 0, as the iso art
// had it). Each keeps inside the quarter-tile cells it takes (shared tops.ts TOP_SIZE), but for a
// lamp's arm or an antenna reaching over. What stays where the world needs it: the computer's
// glass exactly on shared COMPUTER_GLASS (the VortexOS picture is drawn there), the coffee
// machine's buttons and cup where the hands go (view.ts partsOf).

export const DESKTOP_LOOKS = {
  computer: ["Putty computer", "Graphite computer"],
  radio: ["Radio"],
  turntable: ["Turntable"],
  coffee_machine: ["Espresso machine"],
} as const;

const C = 0.5; // the frame's middle
const iso = (px: number) => px / ISO_PX;
const COLORS = [0x8a2f2a, 0xc9a24a, 0x3f5f8a, 0x5f7a3a, 0xe6dcc4, 0x6a4a7a, 0xb5562f, 0x2b2a28, 0x3d7f8a];
const pick = (seed: number, k = 0) => COLORS[Math.floor(((seed * 7.31 + k * 0.37) % 1) * COLORS.length)];

// ── the computer (2×2 cells) ──────────────────────────────────────────────────────────────────────
/** An all-in-one in the 1987 manner: a 4:3 tube in a tall case on a tilt foot, a chin with a floppy
 *  slot, a power LED, vents on top, a handle cut into the back. Putty or graphite. Its glass where
 *  shared COMPUTER_GLASS has it (VortexOS draws there), a hair behind that plane. */
export function computer(m: Model, o: Look) {
  const g = COMPUTER_GLASS;
  const black = o.look === 1;
  const body = black ? 0x34322d : P.putty;
  const dark = shade(body, 0.8);
  const front = g.y + 0.006; // the bezel's face
  const back = 0.72;
  const x0 = 0.28;
  const x1 = 0.72;
  const top = iso(g.z1) + 0.05;
  // the foot, and the case on it: deeper at the back for the tube
  m.add(box([0.3, 0.02, 0.3], 0.006, 2), dark, { at: [C, 0.01, 0.52] });
  m.add(box([x1 - x0, top - 0.02, 0.2], 0.012, 2), body, { at: [C, 0.02 + (top - 0.02) / 2, front + 0.1] });
  m.add(box([x1 - x0 - 0.04, top - 0.07, back - front - 0.2], 0.02, 2), shade(body, 0.95), {
    at: [C, 0.02 + (top - 0.07) / 2, front + 0.2 + (back - front - 0.2) / 2],
  });
  // the bezel round the glass, the glass set back in it, a soft reflection across its top
  const gw = g.x0 - g.x1;
  const gz0 = iso(g.z0);
  const gz1 = iso(g.z1);
  // (a frame round it, never over it: the live picture is drawn on the glass's plane, in front)
  const bz = shade(body, 0.9);
  const bw = 0.025;
  for (const y of [gz0 - bw / 2, gz1 + bw / 2])
    m.add(box([gw + 2 * bw, bw, 0.012], 0.004), bz, { at: [C, y, front - 0.004] });
  for (const x of [C - gw / 2 - bw / 2, C + gw / 2 + bw / 2])
    m.add(box([bw, gz1 - gz0, 0.012], 0.004), bz, { at: [x, (gz0 + gz1) / 2, front - 0.004] });
  m.add(box([gw, gz1 - gz0, 0.004]), P.glass, { at: [C, (gz0 + gz1) / 2, g.y + 0.0045] });
  m.add(box([gw * 0.8, 0.012, 0.002]), shade(P.glass, 2.2), {
    at: [C - 0.01, gz1 - 0.03, g.y + 0.0022],
    rot: [0, 0, 0.12],
  });
  // the chin: a floppy slot, the LED, a badge
  m.add(box([0.11, 0.008, 0.004]), P.ink, { at: [C + 0.08, 0.06, front - 0.002] });
  m.add(box([0.012, 0.006, 0.004]), P.led, { at: [C - 0.15, 0.06, front - 0.003], glow: true });
  m.add(box([0.03, 0.01, 0.003]), black ? P.chrome : P.rust, { at: [C - 0.11, 0.06, front - 0.002] });
  // vents on top, a handle in the back
  for (let i = 0; i < 6; i++) m.add(box([0.2, 0.004, 0.008]), dark, { at: [C, top + 0.001, 0.48 + i * 0.03] });
  m.add(box([0.12, 0.025, 0.01], 0.004), dark, { at: [C, top - 0.04, back - 0.002] });
}

// ── the old monitor (2×2 cells; the rooms' dressing) ──────────────────────────────────────────────
/** A beige CRT monitor, its green phosphor faintly lit, on a swivel foot. */
export function monitor(m: Model, seed: number) {
  const body = seed > 0.5 ? P.putty : 0xcfc3a3;
  m.add(cyl(0.1, 0.08, 0.025, 14), shade(body, 0.85), { at: [C, 0, 0.52] });
  m.add(box([0.36, 0.3, 0.2], 0.014, 2), body, { at: [C, 0.18, 0.4] });
  m.add(box([0.3, 0.24, 0.16], 0.03, 2), shade(body, 0.95), { at: [C, 0.18, 0.56] });
  m.add(box([0.27, 0.2, 0.004]), P.phosphor, { at: [C, 0.185, 0.297], glow: true });
  for (let i = 0; i < 4; i++)
    m.add(box([0.12 + (i % 2) * 0.06, 0.01, 0.002]), P.ledGreen, {
      at: [C - 0.06, 0.26 - i * 0.025, 0.294],
      glow: true,
    });
  m.add(box([0.01, 0.01, 0.004]), P.ledGreen, { at: [C + 0.14, 0.05, 0.3], glow: true });
  if (seed > 0.7) m.add(box([0.05, 0.05, 0.002]), 0xf2e27a, { at: [C + 0.15, 0.3, 0.299], rot: [0, 0, 0.1] }); // (a sticky note)
}

// ── the keyboard (2×1 cells) ──────────────────────────────────────────────────────────────────────
/** A clacky keyboard, its keys in rows (the function row, the space bar). Its keys' tops at 0.03:
 *  KEYBOARD_TOP. */
export function keyboard(m: Model, seed: number) {
  const body = seed > 0.6 ? 0x2b2a28 : P.putty;
  const key = seed > 0.6 ? 0x3a3936 : 0xe8e0c8;
  const mod = seed > 0.6 ? 0x4a4844 : 0xb8ad90;
  m.add(box([0.44, 0.018, 0.15], 0.006, 2), body, { at: [C, 0.0135, C], rot: [0.06, 0, 0] }); // (tilted: lifted by it)
  const rows = [14, 14, 13, 12];
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < rows[r]; i++) {
      const x = C - 0.195 + 0.012 * r + i * 0.0275;
      if (x > C + 0.2) continue;
      m.add(box([0.022, 0.012, 0.022]), i === 0 || i === rows[r] - 1 ? mod : key, {
        at: [x, 0.024 - r * 0.002, C - 0.045 + r * 0.025],
      });
    }
  m.add(box([0.16, 0.012, 0.022]), key, { at: [C - 0.02, 0.016, C + 0.058] });
  for (let i = 0; i < 12; i++) m.add(box([0.022, 0.01, 0.016]), mod, { at: [C - 0.18 + i * 0.031, 0.026, C - 0.068] });
}

// ── the desk lamp (1×1 cell) ──────────────────────────────────────────────────────────────────────
/** An anglepoise: a weighted foot, two arms and their springs, a cone shade over the desk, its bulb
 *  lit when it's on. */
export function deskLamp(m: Model, seed: number, on: boolean) {
  const c = [0x2b2a28, 0x8a2f2a, 0x3d7f8a, 0xc9a24a][Math.floor(seed * 4)];
  m.add(
    lathe(
      [
        [0, 0],
        [0.07, 0],
        [0.075, 0.012],
        [0.06, 0.03],
        [0.02, 0.035],
        [0, 0.035],
      ],
      16,
    ),
    c,
    { at: [C, 0, C + 0.03] },
  );
  const j1: V3 = [C, 0.035, C + 0.03];
  const j2: V3 = [C, 0.3, C + 0.1];
  const j3: V3 = [C, 0.42, C - 0.12];
  for (const s of [-1, 1]) {
    m.add(
      tube(
        [
          [j1[0] + s * 0.012, j1[1], j1[2]],
          [j2[0] + s * 0.012, j2[1], j2[2]],
        ],
        0.006,
        5,
        2,
      ),
      c,
    );
    m.add(
      tube(
        [
          [j2[0] + s * 0.012, j2[1], j2[2]],
          [j3[0] + s * 0.012, j3[1], j3[2]],
        ],
        0.006,
        5,
        2,
      ),
      c,
    );
  }
  // the springs: little coils beside the lower arm
  const coil: V3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = t * Math.PI * 16;
    coil.push([C + 0.03 + Math.cos(a) * 0.006, 0.08 + t * 0.16, C + 0.045 + t * 0.05 + Math.sin(a) * 0.006]);
  }
  m.add(tube(coil, 0.0018, 3, 96), P.steel);
  m.add(ball(0.014, 8), c, { at: j2 });
  // the shade, tipped down over the desk; its bulb
  m.add(
    lathe(
      [
        [0.012, 0.09],
        [0.025, 0.07],
        [0.04, 0.03],
        [0.07, 0],
        [0.068, 0.003],
        [0.038, 0.032],
        [0.022, 0.07],
        [0.01, 0.09],
      ],
      16,
    ),
    c,
    { at: [C, j3[1] - 0.08, j3[2] - 0.02], rot: [-0.6, 0, 0] },
  );
  m.add(ball(0.022, 8), on ? 0xfff1c9 : 0xd9d2c0, { at: [C, j3[1] - 0.06, j3[2] - 0.035], glow: on });
}

// ── the phone (2×2 cells) ─────────────────────────────────────────────────────────────────────────
/** A desk phone: its body sloping to the keypad, the handset on its cradle, the coiled cord. */
export function phone(m: Model, seed: number) {
  const body = seed > 0.5 ? 0x2b2a28 : 0xd9cfb4;
  // its body: low on the sitter's side (−z), rising away; its top's height along it
  const wedge = extrude(
    [
      [-0.1, 0],
      [0.1, 0],
      [0.09, 0.06],
      [-0.08, 0.035],
    ],
    0.2,
    0.006,
    2,
  ).rotateY(-Math.PI / 2);
  m.add(wedge, body, { at: [C, 0.006, C] }); // (lifted by its bevel)
  const slope = Math.atan2(0.025, 0.17);
  const topAt = (z: number) => 0.041 + ((z + 0.08) / 0.17) * 0.025;
  // the keypad on the right, its keys on the slope
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < 3; i++) {
      const z = -0.065 + r * 0.03;
      m.add(box([0.02, 0.008, 0.018], 0.002), shade(body, 0.75), {
        at: [C + 0.025 + i * 0.026, topAt(z) + 0.003, C + z],
        rot: [-slope, 0, 0],
      });
    }
  // the handset on the left, lying along the slope, its ear- and mouthpiece
  m.add(cushion([0.05, 0.035, 0.2], 0.2, 2), body, { at: [C - 0.05, topAt(0) + 0.02, C], rot: [-slope, 0, 0] });
  for (const z of [-0.08, 0.08])
    m.add(cyl(0.022, 0.022, 0.006, 10), shade(body, 0.6), {
      at: [C - 0.05, topAt(z) + 0.038, C + z],
      rot: [-slope, 0, 0],
    });
  const cord: V3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 22;
    cord.push([
      C - 0.1 - Math.sin(t * Math.PI) * 0.04 + Math.cos(a) * 0.006,
      0.01 + Math.sin(a) * 0.006 + 0.012,
      C + 0.08 - t * 0.16,
    ]);
  }
  m.add(tube(cord, 0.0025, 3, 160), shade(body, 0.8));
}

// ── the mug (1×1 cell) ────────────────────────────────────────────────────────────────────────────
/** A mug of coffee, its handle, a colour of its own. */
export function mug(m: Model, seed: number) {
  const c = pick(seed);
  m.add(
    lathe(
      [
        [0, 0],
        [0.04, 0],
        [0.043, 0.004],
        [0.044, 0.095],
        [0.04, 0.095],
        [0.039, 0.012],
        [0, 0.012],
      ],
      16,
    ),
    c,
    { at: [C, 0, C] },
  );
  m.add(cyl(0.039, 0.039, 0.004, 16), 0x3a2416, { at: [C, 0.08, C] });
  m.add(ring(0.024, 0.006, 6, 14).rotateZ(Math.PI / 2), c, { at: [C + 0.05, 0.05, C] });
}

// ── papers, a book, a binder, tapes, a record (1×1 – 2×2 cells) ───────────────────────────────────
/** A loose stack of paper, a sheet askew on top with its lines, a clip. */
export function papers(m: Model, seed: number) {
  for (let i = 0; i < 6; i++)
    m.add(box([0.2, 0.002, 0.235]), shade(P.paperWhite, 0.96 + (i % 2) * 0.04), {
      at: [C + (((i * 0.37 + seed) % 1) - 0.5) * 0.01, 0.001 + i * 0.002, C],
      rot: [0, (((i * 0.61 + seed) % 1) - 0.5) * 0.12, 0],
    });
  for (let i = 0; i < 9; i++)
    m.add(box([0.14 - (i === 0 ? 0.06 : 0), 0.0006, 0.003]), 0x8a8478, {
      at: [C, 0.0125, C - 0.08 + i * 0.02],
      rot: [0, 0.05, 0],
    });
  m.add(box([0.012, 0.003, 0.04]), P.chrome, { at: [C - 0.07, 0.014, C - 0.1] });
}

/** A hardback lying on the desk, its cover in a colour, its pages' edge. */
export function book(m: Model, seed: number) {
  const c = pick(seed, 1);
  const lay = (y: number, w: number, d: number, col: number, a: number) => {
    m.add(box([w, 0.032, d], 0.003, 2), col, { at: [C, y + 0.016, C], rot: [0, a, 0] });
    m.add(box([w - 0.012, 0.026, d - 0.008]), P.paperWhite, { at: [C + 0.004, y + 0.016, C], rot: [0, a, 0] });
  };
  lay(0, 0.24, 0.17, c, 0.04);
  if (seed > 0.5) lay(0.032, 0.21, 0.15, pick(seed, 3), -0.1);
}

/** A ring binder stood on its end, its spine label. */
export function binder(m: Model, seed: number) {
  const c = pick(seed, 2);
  m.add(box([0.06, 0.3, 0.24], 0.004, 2), c, { at: [C, 0.15, C], rot: [0, 0, 0.04] });
  m.add(box([0.062, 0.08, 0.15]), P.paperWhite, { at: [C, 0.2, C - 0.01], rot: [0, 0, 0.04] });
  m.add(ring(0.012, 0.003, 4, 10).rotateX(Math.PI / 2), P.chrome, {
    at: [C - 0.028, 0.13, C + 0.1],
    rot: [0, 0, 0.04],
  });
}

/** Three cassettes in their cases, stacked a little askew. */
export function tapes(m: Model, seed: number) {
  for (let i = 0; i < 3; i++) {
    const a = (((i * 0.43 + seed) % 1) - 0.5) * 0.4;
    m.add(box([0.11, 0.017, 0.07], 0.002), shade(0xd8d4cc, 0.9), { at: [C, 0.0085 + i * 0.017, C], rot: [0, a, 0] });
    m.add(box([0.104, 0.0172, 0.012]), pick(seed, i), { at: [C, 0.0085 + i * 0.017, C - 0.024], rot: [0, a, 0] });
  }
}

/** An LP's sleeve on the desk, the record half out of it, its label. */
export function vinyl(m: Model, seed: number) {
  const c = pick(seed, 4);
  m.add(box([0.31, 0.004, 0.31], 0.002), c, { at: [C - 0.04, 0.002, C], rot: [0, 0.08, 0] });
  m.add(box([0.18, 0.0042, 0.18]), shade(c, 1.4), { at: [C - 0.05, 0.0025, C + 0.01], rot: [0, 0.08, 0] });
  m.add(cyl(0.15, 0.15, 0.003, 32), P.vinyl, { at: [C + 0.07, 0.004, C - 0.02] });
  m.add(cyl(0.05, 0.05, 0.0035, 16), pick(seed, 5), { at: [C + 0.07, 0.004, C - 0.02] });
  for (const r of [0.08, 0.11, 0.135]) m.add(ring(r, 0.0008, 3, 32), 0x2a2a2e, { at: [C + 0.07, 0.0072, C - 0.02] });
}

// ── a photo, a succulent, cards, a bell (1×1 cell) ────────────────────────────────────────────────
/** A photo in a frame, stood on its strut, leaning back. */
export function photo(m: Model, seed: number) {
  const frame = seed > 0.5 ? P.walnut : 0x2b2a28;
  const lean = 0.25;
  m.add(box([0.13, 0.17, 0.012], 0.003, 2), frame, { at: [C, 0.085 * Math.cos(lean), C], rot: [lean, 0, 0] });
  m.add(box([0.1, 0.14, 0.004]), 0xe9e1cc, { at: [C, 0.085 * Math.cos(lean), C - 0.006], rot: [lean, 0, 0] });
  // what's in it: a horizon, a sky, a person's shape
  m.add(box([0.09, 0.06, 0.002]), [0x6f9ac0, 0xd9a441, 0x7aa36a][Math.floor(seed * 3)], {
    at: [C, 0.105, C - 0.012],
    rot: [lean, 0, 0],
  });
  m.add(box([0.09, 0.05, 0.002]), 0x5a6b4a, { at: [C, 0.05, C - 0.008], rot: [lean, 0, 0] });
  m.add(ball(0.012, 6), 0x3a2416, { at: [C + 0.015, 0.085, C - 0.012] });
  m.add(box([0.02, 0.15, 0.006]), frame, { at: [C, 0.07, C + 0.05], rot: [-0.35, 0, 0] });
}

/** A succulent in a little pot: a rosette of fat leaves. */
export function succulent(m: Model, seed: number) {
  m.add(
    lathe(
      [
        [0, 0],
        [0.04, 0],
        [0.05, 0.065],
        [0.055, 0.07],
        [0.05, 0.072],
        [0, 0.072],
      ],
      12,
    ),
    seed > 0.5 ? P.terracotta : 0xe6ddcb,
    { at: [C, 0, C] },
  );
  m.add(cyl(0.046, 0.046, 0.004, 12), P.soil, { at: [C, 0.064, C] });
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const k = i / 13;
    m.add(leaf(0.05 - k * 0.02, 0.028, 0.5, -0.3, 3), k > 0.6 ? 0x8fb07a : 0x6f9a6a, {
      at: [C + Math.cos(a) * 0.006, 0.07 + k * 0.02, C + Math.sin(a) * 0.006],
      rot: [-0.3 - k * 0.8, Math.PI / 2 - a, 0],
    });
  }
}

/** Planning-poker cards, fanned. */
export function cards(m: Model, seed: number) {
  for (let i = 0; i < 6; i++) {
    const a = -0.5 + i * 0.2 + seed * 0.1;
    m.add(box([0.058, 0.0012, 0.088], 0.001), P.paperWhite, { at: [C, 0.001 + i * 0.0012, C], rot: [0, a, 0] });
    m.add(box([0.016, 0.0013, 0.022]), [P.rust, 0x3f5f8a][i % 2], {
      at: [C + Math.sin(a) * 0.022, 0.0016 + i * 0.0012, C - Math.cos(a) * 0.022],
      rot: [0, a, 0],
    });
  }
}

/** A service bell: a dome on its base, the plunger on top. */
export function bell(m: Model, _seed: number) {
  m.add(cyl(0.05, 0.05, 0.012, 18), P.walnut, { at: [C, 0, C] });
  m.add(
    lathe(
      [
        [0.045, 0],
        [0.044, 0.01],
        [0.036, 0.03],
        [0.02, 0.042],
        [0, 0.046],
      ],
      18,
    ),
    P.brass,
    { at: [C, 0.012, C] },
  );
  m.add(cyl(0.005, 0.005, 0.016, 8), P.chrome, { at: [C, 0.056, C] });
  m.add(ball(0.008, 8), P.chrome, { at: [C, 0.074, C] });
}

// ── the radio (3×2 cells) ─────────────────────────────────────────────────────────────────────────
/** A wooden table radio: a speaker behind its grille cloth, the tuning dial's window, two knobs, a
 *  telescopic antenna up at an angle. Its dial lit when it plays. */
export function radio(m: Model, o: Look) {
  m.facing = Math.PI; // (drawn facing −z; it faces the room, as the iso art had it)
  const on = o.on === true;
  m.add(box([0.42, 0.22, 0.18], 0.02, 3), P.walnut, { at: [C, 0.12, C] });
  m.add(box([0.4, 0.012, 0.16], 0.004), P.walnutDark, { at: [C, 0.006, C] });
  // the grille cloth, its slats
  m.add(box([0.2, 0.15, 0.004], 0.003), 0xc9b48a, { at: [C - 0.08, 0.125, C - 0.091] });
  for (let i = 0; i < 6; i++)
    m.add(box([0.2, 0.006, 0.006]), P.walnutDark, { at: [C - 0.08, 0.065 + i * 0.024, C - 0.094] });
  // the dial: a lit window, its needle; the knobs
  m.add(box([0.12, 0.05, 0.004]), on ? 0xffd88a : 0xd9cba4, { at: [C + 0.11, 0.165, C - 0.092], glow: on });
  m.add(box([0.003, 0.04, 0.002]), P.rust, { at: [C + 0.1, 0.165, C - 0.095] });
  for (const x of [0.07, 0.15]) {
    m.add(rod(0.02, 0.018, 0.02, "z", 14), shade(P.cream, 0.9), { at: [C + x, 0.08, C - 0.1] });
    m.add(box([0.003, 0.012, 0.002]), P.ink, { at: [C + x, 0.088, C - 0.111] });
  }
  // the antenna, out at an angle, its tip
  m.add(
    tube(
      [
        [C + 0.17, 0.23, C + 0.06],
        [C + 0.25, 0.52, C + 0.14],
      ],
      0.003,
      5,
      2,
    ),
    P.chrome,
  );
  m.add(ball(0.006, 6), P.chrome, { at: [C + 0.25, 0.52, C + 0.14] });
}

// ── the turntable (3×3 cells) ─────────────────────────────────────────────────────────────────────
/** A walnut turntable: the platter and its mat, a record on it, the tonearm on its rest, the speed
 *  buttons and the feet. */
export function turntable(m: Model, o: Look) {
  m.facing = Math.PI; // (drawn facing −z; it faces the room, as the iso art had it)
  m.add(box([0.46, 0.06, 0.36], 0.01, 2), P.walnut, { at: [C, 0.045, C] });
  m.add(box([0.44, 0.006, 0.34]), P.steel, { at: [C, 0.078, C] });
  for (const [x, z] of [
    [-0.2, -0.15],
    [0.2, -0.15],
    [-0.2, 0.15],
    [0.2, 0.15],
  ])
    m.add(cyl(0.022, 0.025, 0.015, 10), P.rubber, { at: [C + x, 0, C + z] });
  m.add(cyl(0.15, 0.15, 0.012, 32), P.alum, { at: [C - 0.06, 0.081, C] });
  m.add(cyl(0.148, 0.148, 0.004, 32), P.vinyl, { at: [C - 0.06, 0.093, C] });
  m.add(cyl(0.045, 0.045, 0.0045, 16), pick(o.seed, 6), { at: [C - 0.06, 0.093, C] });
  m.add(cyl(0.004, 0.004, 0.015, 6), P.chrome, { at: [C - 0.06, 0.093, C] });
  // the tonearm: its pivot, the arm out over the record's edge, the headshell, the weight
  m.add(cyl(0.022, 0.018, 0.03, 12), P.steel, { at: [C + 0.16, 0.081, C + 0.1] });
  m.add(
    tube(
      [
        [C + 0.16, 0.115, C + 0.1],
        [C + 0.14, 0.115, C - 0.05],
        [C + 0.09, 0.11, C - 0.12],
      ],
      0.004,
      5,
      10,
    ),
    P.chrome,
  );
  m.add(box([0.018, 0.008, 0.03], 0.002), P.ink, { at: [C + 0.085, 0.106, C - 0.13], rot: [0, 0.6, 0] });
  m.add(rod(0.012, 0.012, 0.03, "z", 10), P.steel, { at: [C + 0.16, 0.115, C + 0.135] });
  m.add(box([0.012, 0.03, 0.012], 0.002), P.steel, { at: [C + 0.175, 0.096, C - 0.06] });
  for (const x of [-0.18, -0.15]) m.add(box([0.02, 0.008, 0.012], 0.002), P.chrome, { at: [C + x, 0.083, C - 0.16] });
}

// ── the espresso machine (3×2 cells) ──────────────────────────────────────────────────────────────
/** An espresso machine: its steel body, the group head and portafilter over the drip tray, a steam
 *  wand, the buttons on top of its front (where the hands press: 0.41 up), cups warming on top.
 *  The cup goes under the spout, on the tray (0.08). */
export function coffeeMachine(m: Model, _o: Look) {
  m.facing = Math.PI; // (drawn facing −z; it faces the room, as the iso art had it)
  const steel = P.steelLight;
  m.add(box([0.32, 0.36, 0.3], 0.02, 2), steel, { at: [C, 0.06 + 0.18, C + 0.02] });
  m.add(box([0.3, 0.06, 0.32], 0.01, 2), shade(steel, 0.8), { at: [C, 0.03, C] });
  // the drip tray, its grate; the group head, the portafilter and its handle
  m.add(box([0.26, 0.02, 0.12], 0.004), P.steel, { at: [C, 0.07, C - 0.13] });
  for (let i = 0; i < 6; i++) m.add(box([0.24, 0.003, 0.006]), steel, { at: [C, 0.081, C - 0.18 + i * 0.02] });
  m.add(cyl(0.04, 0.035, 0.04, 14), P.chrome, { at: [C, 0.22, C - 0.12] });
  m.add(cyl(0.035, 0.035, 0.03, 14), P.chrome, { at: [C, 0.19, C - 0.12] });
  m.add(rod(0.012, 0.014, 0.12, "z", 8), P.ink, { at: [C, 0.205, C - 0.2] });
  m.add(cyl(0.008, 0.006, 0.02, 8), P.chrome, { at: [C, 0.17, C - 0.12] });
  // the steam wand, the pressure gauge, the buttons on top of the front
  m.add(
    tube(
      [
        [C + 0.13, 0.32, C - 0.1],
        [C + 0.15, 0.22, C - 0.14],
        [C + 0.14, 0.12, C - 0.15],
      ],
      0.005,
      5,
      8,
    ),
    P.chrome,
  );
  m.add(rod(0.04, 0.04, 0.012, "z", 18), P.chrome, { at: [C - 0.08, 0.33, C - 0.135] });
  m.add(rod(0.033, 0.033, 0.004, "z", 18), P.paperWhite, { at: [C - 0.08, 0.33, C - 0.142] });
  for (const x of [-0.04, 0, 0.04])
    m.add(box([0.026, 0.012, 0.03], 0.004), [P.ink, P.rust, P.ink][Math.round(x * 25 + 1)], {
      at: [C + x, 0.41, C - 0.1],
    });
  // the cups on its warming tray
  for (const x of [-0.08, 0.02, 0.1]) {
    m.add(
      lathe(
        [
          [0, 0],
          [0.025, 0],
          [0.032, 0.05],
          [0.028, 0.05],
          [0, 0.008],
        ],
        12,
      ),
      P.paperWhite,
      { at: [C + x, 0.42, C + 0.08] },
    );
  }
  m.add(box([0.3, 0.004, 0.24]), P.chrome, { at: [C, 0.42, C + 0.03] });
}

/** The things one puts down on a desk (`tabletop` props.d, and the rooms' dressing), by name. */
export const DESK_THINGS: Record<string, (m: Model, seed: number, on: boolean) => void> = {
  keyboard,
  desklamp: deskLamp,
  phone,
  mug,
  papers,
  book,
  binder,
  tapes,
  vinyl,
  photo,
  succulent,
  cards,
  bell,
  monitor,
};

// ── the lava lamp (on a surface) — plan 68 ────────────────────────────────────────────────────────
export const LAVA_LOOKS = [
  "Lava lamp, red in yellow",
  "Lava lamp, violet in blue",
  "Lava lamp, green in orange",
] as const;
const LAVA: [number, number][] = [
  [0xff4a2a, 0xffd36a],
  [0xc45cff, 0x3a6cff],
  [0x6aff5a, 0xff8a2a],
];
/** A lava lamp standing round its tile's middle: its tapered metal base and cap, the glass rocket
 *  between (see-through, the liquid's tint: a live part of glass), the wax blobs rising and sinking
 *  in it (live), lit when on (`on` unset: lit). */
export function lavaLamp(m: Model, o: Look) {
  const lit = o.on !== false;
  const [blob, liquid] = LAVA[o.look] ?? LAVA[0];
  const metal = o.look === 1 ? P.chrome : P.brass;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.085, 0],
        [0.085, 0.012],
        [0.06, 0.1],
        [0.046, 0.15],
        [0.04, 0.155],
        [0.001, 0.155],
      ],
      18,
    ),
    metal,
    { at: [0.5, 0, 0.5] },
  );
  // the heater's glow at the glass's foot
  m.add(cyl(0.038, 0.038, 0.01, 14), lit ? blob : shade(blob, 0.4), { at: [0.5, 0.152, 0.5], glow: lit });
  // the glass and its liquid (see-through)
  m.live(
    lathe(
      [
        [0.04, 0],
        [0.055, 0.08],
        [0.06, 0.13],
        [0.045, 0.21],
        [0.03, 0.24],
        [0.001, 0.24],
      ],
      18,
    ),
    liquid,
    { kind: "still" },
    { at: [0.5, 0.155, 0.5], glass: true, glow: lit },
  );
  // the cap
  m.add(
    lathe(
      [
        [0.03, 0],
        [0.026, 0.03],
        [0.012, 0.06],
        [0.001, 0.062],
      ],
      14,
    ),
    metal,
    { at: [0.5, 0.39, 0.5] },
  );
  // the wax: blobs rising and sinking, out of step
  for (let i = 0; i < 4; i++) {
    const r = 0.018 + (i % 2) * 0.008;
    m.live(
      ball(r, 10),
      lit ? blob : shade(blob, 0.5),
      { kind: "lava", lo: 0, hi: 0.17 - r, period: 9 + i * 2.3, phase: i * 0.27 },
      {
        at: [0.5 + Math.cos(i * 2.1) * 0.012, 0.17 + r, 0.5 + Math.sin(i * 2.1) * 0.012],
        glow: lit,
      },
    );
  }
  m.add(cyl(0.032, 0.032, 0.012, 14), lit ? blob : shade(blob, 0.4), { at: [0.5, 0.157, 0.5], glow: lit });
}
