import { TV_SCREEN } from "@yutopia/shared/games";
import { GLASS } from "@yutopia/shared/media";
import { ball, box, cushion, cyl, type Look, lathe, type Model, ring, rod, tube } from "./kit";
import { P, shade } from "./palette";

// Screens and games (docs/plan/67-the-furniture.md, phase 5), in the kit's frame: x across the
// footprint, z down it, y up. Floor TVs and consoles face the room (+z, the catalog's rot 0: south);
// a portable TV on a surface likewise, round its tile's middle; things on a wall in the wall's frame
// (shared hang.ts): the wall's face at z 0.1 (WALL_FACE), the thing out from it, y up from where it
// hangs. Every screen's glass sits a hair behind the plane the live picture is drawn on (shared
// media.ts GLASS, games.ts TV_SCREEN) and nothing stands in front of it; the consoles' power LEDs
// where the game room puts them (world/games/room.ts LED, LED_FRONT, the slim's LCD).

export const SCREEN_LOOKS = {
  crt_tv: ["Wood-grain CRT", "Black CRT"],
  tv_console: ["Walnut console TV", "Teak console TV"],
  tv_portable: ["Red portable TV", "Cream portable TV"],
  projector: ["Projector"],
  tv_wall: ["Grey wall TV", "Black wall TV"],
  tv_hd: ["HD TV"],
  tv_giant: ["Giant TV"],
  projector_screen: ["Projector screen"],
  cinema_screen: ["Cinema screen", "Cinema screen, curtained"],
  console_2600: ["2600"],
  console_nes: ["Front loader", "Top loader"],
  console_snes: ["Super console"],
  console_md: ["16-bit console"],
  console_gb: ["Handheld"],
  console_ps1: ["Disc console"],
  console_ps1_slim: ["Slim disc console", "Slim, with its screen"],
} as const;

const BACK = 0.004; // the glass behind the picture's plane (its case further behind still: never level with it)
const WOOD_GRAIN = 0x6a4428;

/** A screen's glass and the frame round it (never over it), facing +z with the picture's plane at
 *  `face`: across x0..x1, up y0..y1; dark glass unless `matte` (a projector's cloth). */
function glass(
  m: Model,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  face: number,
  frame: number,
  fw: number,
  o: { matte?: boolean; depth?: number } = {},
) {
  const w = x1 - x0;
  const h = y1 - y0;
  m.add(box([w, h, 0.004]), o.matte ? 0xe9e6df : P.glass, { at: [(x0 + x1) / 2, (y0 + y1) / 2, face - BACK - 0.002] });
  if (!o.matte)
    m.add(box([w * 0.7, 0.01, 0.002]), shade(P.glass, 2.1), {
      at: [(x0 + x1) / 2 - w * 0.08, y1 - h * 0.12, face - BACK - 0.0002],
      rot: [0, 0, 0.06],
    });
  if (fw <= 0) return;
  const d = o.depth ?? 0.02;
  for (const y of [y0 - fw / 2, y1 + fw / 2])
    m.add(box([w + 2 * fw, fw, d], 0.003), frame, { at: [(x0 + x1) / 2, y, face - d / 2 + 0.004] });
  for (const x of [x0 - fw / 2, x1 + fw / 2])
    m.add(box([fw, h, d], 0.003), frame, { at: [x, (y0 + y1) / 2, face - d / 2 + 0.004] });
}

// ── the CRT TV (2×1, on the floor) ────────────────────────────────────────────────────────────────
/** A big CRT on a low stand with a shelf: the tube's bulk behind its face, knobs down its side, rabbit
 *  ears on top. Wood-grain or black. */
export function crtTv(m: Model, o: Look) {
  const g = TV_SCREEN;
  const body = o.look === 1 ? 0x24231f : WOOD_GRAIN;
  const trim = o.look === 1 ? 0x3a3935 : 0xc9b48a;
  const y0 = g.z0;
  const y1 = g.z1;
  const face = g.y;
  // the stand: a top, a shelf, four legs
  m.add(box([1.4, 0.03, 0.56], 0.006, 2), P.walnutDark, { at: [1, 0.4, 0.52] });
  m.add(box([1.3, 0.02, 0.5], 0.004), P.walnutDark, { at: [1, 0.14, 0.52] });
  for (const [x, z] of [
    [0.34, 0.27],
    [1.66, 0.27],
    [0.34, 0.77],
    [1.66, 0.77],
  ])
    m.add(cyl(0.02, 0.02, 0.4, 8), P.steel, { at: [x, 0, z] });
  // the cabinet round the tube, its back drawing in for the tube's neck
  m.add(box([1.12, y1 - y0 + 0.12, face - 0.42], 0.03, 2), body, {
    at: [0.94 + 0.03, (y0 + y1) / 2, (0.42 + face) / 2 - BACK - 0.006],
  });
  m.add(box([0.76, y1 - y0 - 0.06, 0.2], 0.05, 2), shade(body, 0.85), { at: [0.9, (y0 + y1) / 2, 0.33] });
  glass(m, g.x0, g.x1, y0, y1, face, trim, 0.025);
  // the control strip down its right: two knobs, the channel buttons, the brand
  m.add(box([0.12, y1 - y0, 0.01], 0.003), shade(body, 0.9), { at: [1.43, (y0 + y1) / 2, face - 0.002] });
  for (const [y, r] of [
    [y1 - 0.08, 0.035],
    [y1 - 0.2, 0.03],
  ])
    m.add(rod(r, r * 0.9, 0.03, "z", 14), trim, { at: [1.43, y, face + 0.01] });
  for (let i = 0; i < 4; i++)
    m.add(box([0.06, 0.018, 0.012], 0.002), P.ink, { at: [1.43, y0 + 0.06 + i * 0.03, face + 0.003] });
  // rabbit ears
  for (const s of [-1, 1])
    m.add(
      tube(
        [
          [0.95, y1 + 0.06, 0.55],
          [0.95 + s * 0.22, y1 + 0.42, 0.5],
        ],
        0.004,
        5,
        2,
      ),
      P.chrome,
    );
  m.add(
    lathe(
      [
        [0, 0],
        [0.06, 0],
        [0.04, 0.04],
        [0, 0.05],
      ],
      12,
    ),
    P.ink,
    { at: [0.95, y1 + 0.06, 0.55] },
  );
}

// ── the console TV (2×1, on the floor) ────────────────────────────────────────────────────────────
/** A 70s console TV: a walnut cabinet on short legs, the screen on the left, the speaker's grille cloth
 *  on the right, its dials. */
export function tvConsole(m: Model, o: Look) {
  const g = GLASS.tv_console;
  const wood = o.look === 1 ? P.teak : P.walnut;
  const face = g.y;
  const top = 1.17;
  for (const [x, z] of [
    [0.18, 0.32],
    [1.82, 0.32],
    [0.18, 0.82],
    [1.82, 0.82],
  ])
    m.add(cyl(0.025, 0.018, 0.1, 8), shade(wood, 0.7), { at: [x, 0, z] });
  m.add(box([1.84, top - 0.1, face - 0.26], 0.012, 2), wood, {
    at: [1, 0.1 + (top - 0.1) / 2, (0.26 + face) / 2 - BACK - 0.004],
  });
  m.add(box([1.86, 0.025, face - 0.24], 0.006), shade(wood, 1.12), { at: [1, top - 0.0125, (0.26 + face) / 2 - BACK] });
  glass(m, g.x0, g.x1, g.z0, g.z1, face, shade(wood, 0.8), 0.04);
  // the speaker: grille cloth, slats over it; the dials under it
  m.add(box([0.36, 0.5, 0.006]), 0xc9b48a, { at: [1.67, 0.75, face - BACK - 0.003] });
  for (let i = 0; i < 9; i++)
    m.add(box([0.012, 0.5, 0.012]), shade(wood, 0.85), { at: [1.51 + i * 0.04, 0.75, face - 0.002] });
  for (const x of [1.57, 1.77]) m.add(rod(0.04, 0.035, 0.03, "z", 16), P.brass, { at: [x, 0.36, face + 0.008] });
}

// ── the portable TV (on a surface) ────────────────────────────────────────────────────────────────
/** A little portable: a rounded case, the screen, a dial and a speaker slot to its right, a carry
 *  handle and a whip antenna. Red or cream. */
export function tvPortable(m: Model, o: Look) {
  const g = GLASS.tv_portable;
  const c = o.look === 1 ? P.cream : 0xa83a2c;
  const face = g.y;
  const y0 = g.z0;
  const y1 = g.z1;
  m.add(cushion([0.5, y1 - y0 + 0.1, face - 0.45], 0.04, 2), c, {
    at: [0.5, (y0 + y1) / 2, (0.45 + face) / 2 - BACK - 0.003],
  });
  for (const x of [0.32, 0.68]) m.add(box([0.05, y0 - 0.04, 0.16], 0.006), P.ink, { at: [x, (y0 - 0.04) / 2, 0.56] });
  glass(m, g.x0, g.x1, y0, y1, face, shade(c, 0.75), 0.018);
  m.add(rod(0.025, 0.02, 0.02, "z", 12), P.cream, { at: [0.68, y1 - 0.05, face + 0.006] });
  for (let i = 0; i < 5; i++)
    m.add(box([0.05, 0.006, 0.004]), P.ink, { at: [0.68, y0 + 0.02 + i * 0.016, face - 0.001] });
  m.add(
    tube(
      [
        [0.32, y1 + 0.05, 0.56],
        [0.36, y1 + 0.11, 0.56],
        [0.64, y1 + 0.11, 0.56],
        [0.68, y1 + 0.05, 0.56],
      ],
      0.01,
      6,
      12,
    ),
    P.ink,
  );
  m.add(
    tube(
      [
        [0.7, y1 + 0.05, 0.48],
        [0.82, y1 + 0.3, 0.42],
      ],
      0.003,
      4,
      2,
    ),
    P.chrome,
  );
}

// ── the projector (on a surface) ──────────────────────────────────────────────────────────────────
/** A video projector: its case, the lens out front (lit while it throws a picture), vents, a foot. */
export function projector(m: Model, o: Look) {
  const on = o.on === true;
  m.add(box([0.3, 0.1, 0.26], 0.02, 2), 0xd9d6cf, { at: [0.5, 0.06, 0.5] });
  m.add(box([0.32, 0.012, 0.28], 0.004), P.graphite, { at: [0.5, 0.006, 0.5] });
  m.add(rod(0.045, 0.04, 0.05, "z", 18), P.graphite, { at: [0.42, 0.065, 0.65] });
  m.add(rod(0.032, 0.032, 0.004, "z", 18), on ? 0xfff5d6 : P.glass, { at: [0.42, 0.065, 0.676], glow: on });
  for (let i = 0; i < 5; i++) m.add(box([0.004, 0.06, 0.08]), P.ink, { at: [0.651, 0.06, 0.42 + i * 0.02] });
  m.add(box([0.012, 0.006, 0.004]), on ? P.ledGreen : P.led, { at: [0.6, 0.11, 0.63], glow: true });
}

// ── the consoles (1×1, on the floor) ──────────────────────────────────────────────────────────────
// (their front faces at z 0.74, the cartridge ones' power LED at (0.3, 0.051): room.ts LED_FRONT)
const FRONT = 0.74;
const ledFront = (m: Model, on = 0xff6a3a) =>
  m.add(box([0.012, 0.008, 0.004]), on, { at: [0.3, 0.051, FRONT + 0.001], glow: true });

/** The 2600: a black ribbed top, a wood-grain front with its switches, the cartridge slot. */
export function console2600(m: Model, _o: Look) {
  m.add(box([0.48, 0.08, 0.3], 0.01, 2), P.ink, { at: [0.5, 0.045, FRONT - 0.15] });
  m.add(box([0.48, 0.045, 0.01], 0.003), WOOD_GRAIN, { at: [0.5, 0.03, FRONT - 0.004] });
  for (let i = 0; i < 6; i++)
    m.add(box([0.01, 0.006, 0.12]), shade(P.ink, 1.6), { at: [0.3 + i * 0.016, 0.088, FRONT - 0.18] });
  for (let i = 0; i < 6; i++)
    m.add(box([0.016, 0.03, 0.016], 0.003), P.chrome, {
      at: [0.36 + i * 0.05 + (i > 2 ? 0.1 : 0), 0.07, FRONT - 0.02],
    });
  m.add(box([0.12, 0.012, 0.03]), P.vinyl, { at: [0.5, 0.088, FRONT - 0.24] });
  ledFront(m);
}

/** The front loader (a grey box, its dark lid band, the door, two pad ports, the power and reset
 *  buttons) or the top loader (a dog-bone shape, the slot on top). */
export function consoleNes(m: Model, o: Look) {
  if (o.look === 1) {
    // (wide enough that the game room's power light, LED_FRONT, is on its front)
    m.add(cushion([0.44, 0.07, 0.24], 0.15, 2), 0xd8d4cc, { at: [0.5, 0.04, FRONT - 0.12] });
    m.add(box([0.12, 0.012, 0.06]), P.ink, { at: [0.5, 0.078, FRONT - 0.14] });
    m.add(box([0.06, 0.01, 0.02], 0.003), shade(0xd8d4cc, 0.6), { at: [0.38, 0.072, FRONT - 0.06] });
    ledFront(m);
    return;
  }
  m.add(box([0.46, 0.09, 0.32], 0.006, 2), 0xb8b4ac, { at: [0.5, 0.045, FRONT - 0.16] });
  m.add(box([0.462, 0.03, 0.16], 0.004), 0x5e5c58, { at: [0.5, 0.075, FRONT - 0.08] });
  m.add(box([0.24, 0.035, 0.006], 0.003), shade(0xb8b4ac, 0.9), { at: [0.56, 0.06, FRONT + 0.001] });
  for (const x of [0.36, 0.43]) m.add(box([0.05, 0.022, 0.006]), P.ink, { at: [x, 0.03, FRONT + 0.001] });
  for (const x of [0.33, 0.39]) m.add(box([0.04, 0.012, 0.012], 0.003), P.rust, { at: [x, 0.07, FRONT - 0.01] });
  ledFront(m);
}

/** The super console: a rounded grey body, its slot on top, the coloured sliders. */
export function consoleSnes(m: Model, _o: Look) {
  m.add(cushion([0.42, 0.08, 0.3], 0.1, 2), 0xc9c6c0, { at: [0.5, 0.045, FRONT - 0.15] });
  m.add(box([0.16, 0.014, 0.05]), P.ink, { at: [0.5, 0.088, FRONT - 0.2] });
  for (const [x, c] of [
    [0.38, 0x7a5c9a],
    [0.62, 0x9a88c0],
  ] as [number, number][])
    m.add(box([0.05, 0.012, 0.03], 0.003), c, { at: [x, 0.088, FRONT - 0.1] });
  ledFront(m);
}

/** The 16-bit console: black, a round dome on top round its slot, its red ring, the volume slider. */
export function consoleMd(m: Model, _o: Look) {
  m.add(box([0.42, 0.06, 0.3], 0.02, 2), 0x1d1d1f, { at: [0.5, 0.035, FRONT - 0.15] });
  m.add(
    lathe(
      [
        [0.12, 0],
        [0.12, 0.012],
        [0.09, 0.03],
        [0, 0.034],
      ],
      24,
    ),
    0x1d1d1f,
    { at: [0.5, 0.065, FRONT - 0.17] },
  );
  m.add(ring(0.1, 0.004), 0xc8402f, { at: [0.5, 0.078, FRONT - 0.17] });
  m.add(box([0.14, 0.012, 0.04]), P.ink, { at: [0.5, 0.098, FRONT - 0.17] });
  ledFront(m);
}

/** The handheld, in its dock on the floor: its grey body, the screen's green, the d-pad,
 *  the A and B buttons. */
export function consoleGb(m: Model, _o: Look) {
  // (its dock as wide as the LED's place: room.ts LED_FRONT, at x 0.3)
  m.add(box([0.46, 0.06, 0.16], 0.01, 2), P.graphite, { at: [0.5, 0.03, FRONT - 0.09] });
  m.add(box([0.09, 0.15, 0.022], 0.008, 2), 0xc9c6bc, { at: [0.5, 0.11, FRONT - 0.1], rot: [-0.3, 0, 0] });
  m.add(box([0.06, 0.05, 0.003]), 0x8a9a5b, { at: [0.5, 0.145, FRONT - 0.08], rot: [-0.3, 0, 0], glow: true });
  m.add(box([0.02, 0.006, 0.006]), P.ink, { at: [0.48, 0.09, FRONT - 0.083], rot: [-0.3, 0, 0] });
  for (const x of [0.52, 0.535])
    m.add(cyl(0.006, 0.006, 0.005, 8).rotateX(Math.PI / 2 - 0.3), 0x8a2f4a, { at: [x, 0.09, FRONT - 0.083] });
  ledFront(m);
}

/** The disc console: grey, the round lid on top, its open and power buttons, the LED on top where
 *  room.ts LED has it (0.7, 0.545, 0.115). */
export function consolePs1(m: Model, _o: Look) {
  m.add(box([0.46, 0.1, 0.36], 0.012, 2), 0xbdbab3, { at: [0.5, 0.055, 0.555] });
  m.add(
    lathe(
      [
        [0, 0],
        [0.12, 0],
        [0.12, 0.008],
        [0, 0.012],
      ],
      28,
    ),
    0xa8a59e,
    { at: [0.43, 0.105, 0.55] },
  );
  for (const [x, c] of [
    [0.66, 0x8a8780],
    [0.66, 0x8a8780],
  ] as [number, number][])
    m.add(cyl(0.02, 0.02, 0.006, 12), c, { at: [x, 0.105, 0.6] });
  m.add(cyl(0.012, 0.012, 0.006, 10), 0x7dff7a, { at: [0.7, 0.1148 - 0.006, 0.545], glow: true });
  for (const x of [0.35, 0.65]) m.add(box([0.08, 0.025, 0.004]), P.ink, { at: [x, 0.04, 0.737] });
}

/** The slim one: small and white, the lid, the LED on top (0.71, 0.67, 0.094); its second look with
 *  the flip-up screen behind, its glass on the slim's LCD (room.ts LCD). */
export function consolePs1Slim(m: Model, o: Look) {
  // (its body out to the power light where the game room puts it, LED x 0.71, its top under it)
  m.add(box([0.44, 0.086, 0.3], 0.02, 2), 0xe9e6df, { at: [0.51, 0.045, 0.58] });
  m.add(
    lathe(
      [
        [0, 0],
        [0.11, 0],
        [0.11, 0.004],
        [0, 0.007],
      ],
      24,
    ),
    0xd8d4cc,
    { at: [0.47, 0.088, 0.56] },
  );
  m.add(cyl(0.01, 0.01, 0.006, 10), 0x7dff7a, { at: [0.71, 0.0944 - 0.006, 0.67], glow: true });
  if (o.look === 1) {
    const l = { x0: 0.29, x1: 0.65, y: 0.336, z0: 0.148, z1: 0.4287 };
    m.add(box([0.38, l.z1 - l.z0 + 0.04, 0.02], 0.006, 2), 0xd8d4cc, {
      at: [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, l.y - 0.012 - BACK],
    });
    m.add(box([l.x1 - l.x0, l.z1 - l.z0, 0.003]), P.glass, {
      at: [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, l.y - BACK - 0.0015],
    });
    m.add(box([0.08, l.z0, 0.03], 0.006), 0xd8d4cc, { at: [0.47, l.z0 / 2 + 0.02, 0.33] });
  }
}

// ── on the wall: TVs and screens (the wall's face at z 0.1) ───────────────────────────────────────
/** A CRT on a wall bracket: the tube's case, its arm to the wall. Grey or black. */
export function tvWall(m: Model, o: Look) {
  const g = GLASS.tv_wall;
  const c = o.look === 1 ? 0x24231f : 0x8f8b84;
  const y0 = g.z0;
  const y1 = g.z1;
  m.add(box([0.62, y1 - y0 + 0.1, 0.2], 0.03, 2), c, { at: [0.48, (y0 + y1) / 2, g.y - 0.1 - BACK - 0.006] });
  m.add(box([0.4, y1 - y0 - 0.04, 0.1], 0.05, 2), shade(c, 0.85), { at: [0.46, (y0 + y1) / 2, g.y - 0.24] });
  glass(m, g.x0, g.x1, y0, y1, g.y, shade(c, 0.8), 0.02);
  m.add(box([0.12, 0.03, 0.2], 0.006), P.steel, { at: [0.46, y0 - 0.06, 0.2] });
  m.add(box([0.14, 0.14, 0.012], 0.004), P.steel, { at: [0.46, y0 - 0.02, 0.106] });
  m.add(box([0.03, 0.06, 0.05], 0.004), P.steel, { at: [0.46, y0 - 0.04, g.y - 0.12] });
  m.add(rod(0.02, 0.018, 0.02, "z", 12), shade(c, 1.4), { at: [0.76, y0 + 0.04, g.y + 0.006] });
}

/** A flat panel on a wall mount: its thin bezel, a little chin with its LED. */
function flatPanel(m: Model, g: { x0: number; x1: number; y: number; z0: number; z1: number }) {
  const y0 = g.z0;
  const y1 = g.z1;
  const cx = (g.x0 + g.x1) / 2;
  m.add(box([g.x1 - g.x0 + 0.04, y1 - y0 + 0.04, 0.03], 0.006, 2), 0x1b1b1d, {
    at: [cx, (y0 + y1) / 2, g.y - 0.017 - BACK - 0.004],
  });
  glass(m, g.x0, g.x1, y0, y1, g.y, 0x1b1b1d, 0);
  m.add(box([0.2, 0.015, 0.02], 0.004), 0x2a2a2d, { at: [cx, y0 - 0.025, g.y - 0.012] });
  m.add(box([0.008, 0.004, 0.004]), P.led, { at: [cx + 0.06, y0 - 0.025, g.y - 0.001], glow: true });
  m.add(box([Math.min(0.6, (g.x1 - g.x0) * 0.3), 0.3, 0.04]), P.steel, { at: [cx, (y0 + y1) / 2, 0.12] });
}
export const tvHd = (m: Model, _o: Look) => flatPanel(m, GLASS.tv_hd);
export const tvGiant = (m: Model, _o: Look) => flatPanel(m, GLASS.tv_giant);

/** A pull-down screen: its roller case across the top on two brackets, the cloth hung from it, its
 *  black border, the bar and the pull tab at its foot. */
export function projectorScreen(m: Model, _o: Look) {
  const g = GLASS.projector_screen;
  const y0 = g.z0;
  const y1 = g.z1;
  m.add(rod(0.05, 0.05, 2.96, "x", 14), P.alum, { at: [1.5, y1 + 0.08, 0.16] });
  for (const x of [0.06, 2.94]) m.add(box([0.03, 0.12, 0.08], 0.004), P.steel, { at: [x, y1 + 0.08, 0.14] });
  glass(m, g.x0, g.x1, y0, y1, g.y, P.ink, 0.04, { matte: true, depth: 0.004 });
  m.add(box([g.x1 - g.x0 + 0.04, 0.03, 0.02], 0.005), P.ink, { at: [1.5, y0 - 0.055, g.y - 0.01] });
  m.add(box([0.012, 0.08, 0.004]), P.ink, { at: [1.5, y0 - 0.11, g.y - 0.004] });
  m.add(ball(0.015, 8), P.ink, { at: [1.5, y0 - 0.16, g.y - 0.004] });
}

/** The cinema screen: a broad matte screen in a black frame, a pelmet over it; the second look draws
 *  its red velvet curtains back to either side. */
export function cinemaScreen(m: Model, o: Look) {
  const g = GLASS.cinema_screen;
  const y0 = g.z0;
  const y1 = g.z1;
  glass(m, g.x0, g.x1, y0, y1, g.y, P.ink, 0.08, { matte: true, depth: 0.03 });
  m.add(box([5.9, 0.28, 0.06], 0.01, 2), o.look === 1 ? 0x6a1a1c : P.ink, { at: [3, y1 + 0.2, g.y - 0.02] });
  if (o.look !== 1) return;
  for (const s of [-1, 1]) {
    // a curtain gathered back: folds as half-rounded rods side by side, a tie-back
    for (let i = 0; i < 6; i++) {
      const x = s < 0 ? 0.1 + i * 0.09 : 5.9 - i * 0.09;
      m.add(cyl(0.045, 0.06, y1 + 0.06, 6), shade(0x8a1f22, 0.85 + (i % 2) * 0.15), { at: [x, 0, g.y - 0.05] });
    }
    m.add(
      tube(
        [
          [s < 0 ? 0.05 : 5.95, y0 + 0.6, g.y - 0.02],
          [s < 0 ? 0.35 : 5.65, y0 + 0.55, g.y + 0.02],
          [s < 0 ? 0.6 : 5.4, y0 + 0.62, g.y - 0.02],
        ],
        0.015,
        6,
        10,
      ),
      P.brass,
    );
  }
}
