import { HANDS_AT, PIANO_STOOL, SEAT_SPEC, TABLE_TOP } from "@yutopia/shared";
import {
  laneOffset,
  SLOT_COLORS,
  SLOT_HALF_WIDTH,
  SLOT_LANES,
  type SlotTrackId,
  slotDistance,
  slotPoint,
  slotStops,
} from "@yutopia/shared/slotcar";
import { TABLES } from "@yutopia/shared/tables";
import { ball, box, cyl, extrude, type Look, lathe, type Model, quads, ring, rod, tube, type V3 } from "./kit";
import { P, shade } from "./palette";

// Play, tech, music and the lights (docs/plan/67-the-furniture.md, phase 6), in the kit's frame: x
// across the footprint, z down it, y up; each faces the room (+z, the catalog's rot 0: south). At true
// scale for the 1.79 m people: the arcade's controls at 0.98, the vending machine 1.8 tall, the piano's
// keys at 0.74 (its bench 0.5), the game tables' tops where shared furniture.ts TABLE_TOP has them (the
// balls, the cars and the gantry drawn live on the same numbers), the hands where HANDS_AT puts them.

export const PLAY_LOOKS = {
  arcade: ["Arcade cabinet"],
  vending: ["Slate vending machine", "Rust vending machine"],
  water_cooler: ["Water cooler"],
  piano: ["Walnut upright", "Black lacquer upright"],
  pingpong_table: ["Blue table", "Green table", "Slate table"],
  server_rack: ["Glass-door rack", "Mesh-door rack", "Open frame"],
  crt_terminal: ["Terminal"],
  mixing_desk: ["Mixing desk"],
  speaker_cab: ["Speaker cabinet"],
  mic_stand: ["Mic stand"],
  lamp: ["Drum floor lamp", "Arc lamp", "Paper globe"],
  lamp_post: ["Lamp post"],
  slot_track: ["Slot-car track"],
} as const;

const CAN = [P.rust, P.mustard, 0x4f86c6, P.olive, P.cream, 0x7a5c8a, 0xc4402b];
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A side's profile (z, y) cut from a panel `t` thick, standing at x. */
function side(m: Model, profile: [number, number][], x: number, t: number, color: number, tone = 1) {
  m.add(extrude(profile, t), color, { at: [x, 0, 0], rot: [0, -Math.PI / 2, 0], tone });
}

// ── the arcade cabinet (1×1) ──────────────────────────────────────────────────────────────────────
/** An upright cabinet: rust sides with an amber stripe, a lit marquee, the attract screen tipped back
 *  in its bezel, a stick and three buttons on the panel at 0.98, the coin door; a stack of coins. */
export function arcade(m: Model, o: Look) {
  const prof: [number, number][] = [
    [0.1, 0],
    [0.78, 0],
    [0.78, 0.86],
    [0.92, 0.9],
    [0.92, 0.97],
    [0.72, 1.02],
    [0.6, 1.5],
    [0.74, 1.56],
    [0.74, 1.8],
    [0.1, 1.8],
  ];
  // the body between the sides, the sides proud of it
  side(
    m,
    prof.map(([z, y]) => [Math.min(z, 0.9), y] as [number, number]),
    0.5,
    0.66,
    0x2e1d14,
  );
  for (const x of [0.16, 0.84]) side(m, prof, x, 0.02, P.rust);
  // the side art: an amber stripe and a cream one, climbing to the front
  for (const x of [0.145, 0.855])
    for (const [y, c, w] of [
      [0.62, P.mustard, 0.1],
      [0.8, P.cream, 0.035],
    ] as const)
      m.add(box([0.004, w, 0.72]), c, { at: [x, y, 0.42], rot: [-0.5, 0, 0] });
  // the marquee, lit, its letters' bars over it
  m.add(box([0.64, 0.2, 0.01]), P.led, { at: [0.5, 1.68, 0.745], glow: true });
  for (let i = 0; i < 6; i++) m.add(box([0.06, 0.08, 0.004]), 0x8a3b10, { at: [0.29 + i * 0.084, 1.68, 0.752] });
  // the screen, tipped back in its bezel: dark glass, the attract mode on it
  const tilt = -Math.atan2(0.12, 0.48);
  const sc: V3 = [0.5, 1.26, 0.66 + 0.008];
  m.add(box([0.6, 0.5, 0.01]), 0x14100c, { at: [sc[0], sc[1], sc[2] - 0.004], rot: [tilt, 0, 0] });
  m.add(box([0.5, 0.4, 0.004]), 0x0f1410, { at: sc, rot: [tilt, 0, 0] });
  const onScreen = (u: number, v: number): V3 => [
    0.5 + u,
    sc[1] + v * Math.cos(tilt),
    sc[2] + 0.004 - v * Math.sin(tilt),
  ];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 5; c++)
      m.add(box([0.04, 0.025, 0.002]), [0xc4402b, P.mustard, P.ledGreen][r], {
        at: onScreen(-0.16 + c * 0.08, 0.12 - r * 0.05),
        rot: [tilt, 0, 0],
        glow: true,
      });
  m.add(box([0.06, 0.02, 0.002]), P.ledGreen, { at: onScreen(0, -0.14), rot: [tilt, 0, 0], glow: true });
  m.add(box([0.26, 0.012, 0.002]), P.vfd, { at: onScreen(0, -0.08), rot: [tilt, 0, 0], glow: true });
  // the control panel: a stick, three buttons
  const pt = Math.atan2(0.05, 0.2);
  m.add(box([0.68, 0.03, 0.22], 0.006), P.graphite, { at: [0.5, 0.965, 0.82], rot: [pt, 0, 0] });
  m.add(cyl(0.006, 0.006, 0.07), P.chrome, { at: [0.33, 0.97, 0.84] });
  m.add(ball(0.022), 0xc4402b, { at: [0.33, 1.05, 0.84] });
  m.add(cyl(0.03, 0.03, 0.01), P.ink, { at: [0.33, 0.97, 0.84] });
  for (const [x, c] of [
    [0.55, P.mustard],
    [0.63, 0xc4402b],
    [0.71, P.cream],
  ] as const)
    m.add(cyl(0.017, 0.017, 0.014), c, { at: [x, 0.972 - (x - 0.5) * 0, 0.835] });
  // the coin door, its slots lit
  m.add(box([0.26, 0.24, 0.01], 0.003), 0x2a1d14, { at: [0.5, 0.42, 0.785] });
  for (const x of [0.45, 0.55]) m.add(box([0.03, 0.05, 0.004]), 0xc4402b, { at: [x, 0.46, 0.792], glow: true });
  m.add(box([0.66, 0.08, 0.01]), P.rust, { at: [0.5, 0.04, 0.785] });
  // (story) a stack of coins on the panel
  if (o.seed > 0.3) m.add(cyl(0.012, 0.012, 0.025), P.brass, { at: [0.76, 0.985, 0.86] });
}

// ── the vending machine (1×1) ─────────────────────────────────────────────────────────────────────
/** A tall machine, slate or rust: rows of cans and snacks behind its lit window, the keypad and its
 *  display where the hand goes (HANDS_AT), the coin slot, the flap low down. */
export function vending(m: Model, o: Look) {
  const body = o.look === 1 ? P.rust : 0x3f4a5a;
  const F = 0.88; // its front
  const B = 0.8; // the window's back, its shelves in front of it
  const [w0, w1, y0, y1] = [0.11, 0.66, 0.46, 1.7];
  // the cabinet: its body, and round the window the front's frame, the panel on its right
  m.add(box([0.86, 1.8, B - 0.12], 0.02, 2), body, { at: [0.5, 0.9, (0.12 + B) / 2] });
  m.add(box([0.93 - w1, 1.8, F - B], 0.01), body, { at: [(w1 + 0.93) / 2, 0.9, (B + F) / 2] });
  m.add(box([w0 - 0.07, 1.8, F - B], 0.006), body, { at: [(0.07 + w0) / 2, 0.9, (B + F) / 2] });
  m.add(box([w1 - w0, y0, F - B]), body, { at: [(w0 + w1) / 2, y0 / 2, (B + F) / 2] });
  m.add(box([w1 - w0, 1.8 - y1, F - B]), body, { at: [(w0 + w1) / 2, (1.8 + y1) / 2, (B + F) / 2] });
  m.add(box([0.84, 0.04, 0.74], 0.01), P.ink, { at: [0.5, 0.02, 0.5] });
  // the window: lit from inside, its shelves and what's on them
  // (lit, but not so bright the night blooms it white: the cans read against it)
  m.add(box([w1 - w0, y1 - y0, 0.01]), 0xc9b48c, { at: [(w0 + w1) / 2, (y0 + y1) / 2, B + 0.004], glow: true });
  for (const x of [w0 - 0.012, w1 + 0.012])
    m.add(box([0.024, y1 - y0 + 0.04, 0.03]), shade(body, 0.7), { at: [x, (y0 + y1) / 2, F - 0.005] });
  for (const y of [y0 - 0.012, y1 + 0.012])
    m.add(box([w1 - w0 + 0.04, 0.024, 0.03]), shade(body, 0.7), { at: [(w0 + w1) / 2, y, F - 0.005] });
  for (let row = 0; row < 5; row++) {
    const y = y0 + 0.04 + row * 0.24;
    m.add(box([w1 - w0, 0.012, 0.16]), P.alumDark, { at: [(w0 + w1) / 2, y, (B + F) / 2] });
    for (let i = 0; i < 5; i++) {
      const c = CAN[Math.floor(rnd(row, i, o.seed) * CAN.length)];
      const x = w0 + 0.06 + i * 0.108;
      if (row < 2) m.add(cyl(0.032, 0.032, 0.12, 8), c, { at: [x, y + 0.006, B + 0.04], glow: true, tone: 0.62 });
      else
        m.add(box([0.08, 0.14, 0.02]), c, { at: [x, y + 0.08, B + 0.04], rot: [-0.12, 0, 0], glow: true, tone: 0.62 });
      m.add(box([0.04, 0.012, 0.004]), P.cream, { at: [x, y - 0.004, F - 0.018] });
    }
  }
  // the glass over it all (a faint sheen at the edge)
  m.add(box([0.04, y1 - y0 - 0.1, 0.002]), 0xffffff, {
    at: [w0 + 0.06, (y0 + y1) / 2, F - 0.012],
    rot: [0, 0, -0.08],
    tone: 0.95,
  });
  // the panel: the display, the keypad (HANDS_AT), the coin slot, the return
  const [kx, , ky] = HANDS_AT.vending.keypad;
  m.add(box([0.17, 0.08, 0.012]), P.ink, { at: [kx, ky + 0.18, F + 0.004] });
  m.add(box([0.14, 0.05, 0.004]), P.vfd, { at: [kx, ky + 0.18, F + 0.011], glow: true });
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      m.add(box([0.032, 0.026, 0.012], 0.003), P.cream, {
        at: [kx - 0.045 + c * 0.045, ky + 0.08 - r * 0.042, F + 0.004],
      });
  m.add(box([0.06, 0.1, 0.012], 0.003), P.alum, { at: [kx, ky - 0.18, F + 0.004] });
  m.add(box([0.008, 0.05, 0.004]), P.ink, { at: [kx, ky - 0.17, F + 0.011] });
  m.add(box([0.08, 0.05, 0.03], 0.004), P.ink, { at: [kx, ky - 0.36, F + 0.01] });
  // the flap, low down
  const [fx, , fy] = HANDS_AT.vending.flap;
  m.add(box([0.48, 0.18, 0.014], 0.004), P.ink, { at: [fx, fy, F + 0.004] });
  m.add(box([0.44, 0.03, 0.012], 0.003), shade(P.graphite, 1.4), { at: [fx, fy + 0.06, F + 0.012] });
  // a lit strip along the top
  m.add(box([0.8, 0.06, 0.004]), o.look === 1 ? P.cream : P.led, { at: [0.5, 1.76, F + 0.002], glow: true });
}

// ── the water cooler (1×1) ────────────────────────────────────────────────────────────────────────
/** A cream dispenser with its blue bottle upside down on it, hot and cold taps over a drip tray (the
 *  cold one where the hand goes: HANDS_AT), the paper cups in a holder on its side. */
export function waterCooler(m: Model) {
  const [tx, , ty] = HANDS_AT.water_cooler.tap;
  const F = 0.67;
  m.add(box([0.34, 0.96, 0.34], 0.02, 2), P.cream, { at: [0.5, 0.48, 0.5] });
  m.add(box([0.36, 0.04, 0.36], 0.012), P.creamDark, { at: [0.5, 0.98, 0.5] });
  // the recess with the taps, the drip tray
  m.add(box([0.24, 0.2, 0.01]), 0x3d4a5c, { at: [0.5, ty - 0.03, F + 0.003] });
  for (const [x, c] of [
    [tx - 0.12, 0xc4402b],
    [tx, 0x5b8fc7],
  ] as const) {
    m.add(box([0.034, 0.04, 0.05], 0.008), c, { at: [x, ty + 0.01, F + 0.03] });
    m.add(cyl(0.008, 0.008, 0.02), P.alumDark, { at: [x, ty - 0.03, F + 0.04] });
  }
  m.add(box([0.22, 0.02, 0.08], 0.004), P.graphite, { at: [0.5, ty - 0.13, F + 0.04] });
  // the bottle, see-through blue: its neck in the collar, ribbed
  m.add(cyl(0.05, 0.05, 0.04), P.creamDark, { at: [0.5, 1.0, 0.5] });
  m.add(
    lathe(
      [
        [0.02, 1.0],
        [0.05, 1.02],
        [0.07, 1.06],
        [0.15, 1.12],
        [0.155, 1.2],
        [0.148, 1.24],
        [0.155, 1.28],
        [0.15, 1.38],
        [0.12, 1.42],
        [0.001, 1.43],
      ],
      14,
    ),
    0x8fc0ea,
    { at: [0.5, 0, 0.5] },
  );
  m.add(box([0.012, 0.22, 0.04]), 0xd8ecf9, { at: [0.42, 1.27, 0.63] });
  // the cups: a tube on its side, the paper ones peeping out of its foot
  const [cx, , cy] = HANDS_AT.water_cooler.cups;
  m.add(cyl(0.035, 0.035, 0.3, 10), 0xf0ebe0, { at: [cx, cy - 0.02, 0.5], tone: 0.95 });
  m.add(cyl(0.028, 0.032, 0.04, 10), P.paperWhite, { at: [cx, cy - 0.06, 0.5] });
  m.add(box([0.02, 0.06, 0.02]), P.creamDark, { at: [cx - 0.03, cy + 0.18, 0.5] });
}

// ── the upright piano (2×1, its bench out in front) ───────────────────────────────────────────────
/** An upright, walnut or black lacquer: the case, its top, the panels and the music on its desk, the
 *  keys at 0.74 (black ones in twos and threes), the cheeks, the toes and three brass pedals; its
 *  bench at PIANO_STOOL, the top padded to the stool's seat. */
export function piano(m: Model, o: Look) {
  const lac = o.look === 1;
  const wood = lac ? 0x1e1c1a : P.walnut;
  const edge = lac ? 0x2e2b28 : P.walnutDark;
  const [, kz0, kh] = HANDS_AT.piano.keys;
  const [, front, under] = HANDS_AT.piano.ledge;
  const kz = kz0 - 0.04; // (the keys' middle; the hands over their front half)
  const CF = kz - 0.2; // the case's front
  // the case: its back, the top, the panels on its front, the knee board under the keys
  m.add(box([1.6, 1.24, CF - 0.08], 0.012), wood, { at: [1, 0.62, (CF + 0.08) / 2] });
  m.add(box([1.66, 0.035, CF - 0.04], 0.008), edge, { at: [1, 1.255, (CF + 0.06) / 2] });
  for (const x of [0.62, 1.38]) m.add(box([0.58, 0.28, 0.02], 0.006), shade(wood, 1.18), { at: [x, 1.02, CF + 0.005] });
  m.add(box([1.5, under - 0.1, 0.02], 0.004), shade(wood, 0.9), { at: [1, (under + 0.08) / 2, CF] });
  // the music desk, leant back, a sheet of music on it
  m.add(box([0.66, 0.18, 0.02], 0.004), edge, { at: [1, 0.92, CF + 0.03], rot: [-0.2, 0, 0] });
  m.add(box([0.42, 0.26, 0.004]), P.paperWhite, { at: [1, 0.98, CF + 0.048], rot: [-0.2, 0, 0] });
  for (let i = 0; i < 4; i++)
    m.add(box([0.34, 0.004, 0.002]), 0x8a7a5a, { at: [1, 0.93 + i * 0.04, CF + 0.052 - i * 0.008], rot: [-0.2, 0, 0] });
  // the keybed (its front edge and underside where HANDS_AT has the knees clear them), the
  // fallboard open behind the keys, the cheeks either end
  m.add(box([1.5, kh - 0.012 - under, front - CF], 0.004), wood, {
    at: [1, (kh - 0.012 + under) / 2, (front + CF) / 2],
  });
  m.add(box([1.42, 0.08, 0.02], 0.004), edge, { at: [1, kh + 0.05, kz - 0.12] });
  for (const x of [0.28, 1.72]) m.add(box([0.08, 0.14, front - CF], 0.01), wood, { at: [x, kh, (front + CF) / 2] });
  // the keys: 36 white, the black ones in twos and threes towards the back
  const n = 36;
  const k0 = 0.33;
  const kw = 1.34 / n;
  for (let i = 0; i < n; i++)
    m.add(box([kw - 0.003, 0.022, 0.15]), 0xf4ecd8, { at: [k0 + (i + 0.5) * kw, kh - 0.011, kz] });
  for (let i = 0; i < n - 1; i++)
    if ([0, 1, 3, 4, 5].includes(i % 7))
      m.add(box([kw * 0.55, 0.018, 0.09]), 0x1a1816, { at: [k0 + (i + 1) * kw, kh + 0.004, kz - 0.03] });
  // the toes, the pedals
  for (const x of [0.3, 1.7]) {
    m.add(box([0.06, under, 0.06], 0.006), wood, { at: [x, under / 2, front - 0.05] });
    m.add(box([0.07, 0.03, 0.12], 0.006), edge, { at: [x, 0.015, front - 0.05] });
  }
  for (const x of [0.92, 1, 1.08]) m.add(box([0.034, 0.012, 0.09], 0.003), P.brass, { at: [x, 0.05, CF + 0.04] });
  // the bench: four legs, a rail, the padded top at the stool's seat
  const [sx, sz] = PIANO_STOOL;
  const top = SEAT_SPEC.stool.top;
  for (const [dx, dz] of [
    [-0.26, -0.12],
    [0.26, -0.12],
    [-0.26, 0.12],
    [0.26, 0.12],
  ])
    m.add(cyl(0.022, 0.016, top - 0.06), wood, { at: [sx + dx, 0, sz + dz] });
  m.add(box([0.62, 0.06, 0.3], 0.008), wood, { at: [sx, top - 0.09, sz] });
  m.add(box([0.58, 0.06, 0.27], 0.02, 2), lac ? 0x2a2522 : 0x3a2a22, { at: [sx, top - 0.03, sz] });
  // (story) a pencil on the keybed's end
  if (o.seed > 0.55)
    m.add(rod(0.004, 0.004, 0.16, "x"), P.mustard, { at: [1.6, kh + 0.004, kz - 0.1], rot: [0, 0.3, 0] });
}

// ── the ping-pong table (4×2) ─────────────────────────────────────────────────────────────────────
/** A regulation table to the game's scale (shared tables.ts: 2.74 × 1.525 m at its tiles a metre), its
 *  top at TABLE_TOP, white lines round it and down the middle, the net across on its posts, two
 *  folding frames on castors. */
export function pingpongTable(m: Model, o: Look) {
  const g = TABLES.pingpong_table;
  const top = TABLE_TOP.pingpong_table;
  const L = g.len * g.tpm;
  const W = g.wid * g.tpm;
  const [cx, cz] = [g.w / 2, g.h / 2];
  const c = [0x1f4f86, 0x2b6a4a, 0x56616c][o.look] ?? 0x1f4f86;
  m.add(box([L, 0.03, W], 0.004), c, { at: [cx, top - 0.015, cz] });
  m.add(box([L - 0.06, 0.04, W - 0.06]), shade(c, 0.7), { at: [cx, top - 0.05, cz] });
  const line = 0.02 * g.tpm;
  for (const z of [cz - W / 2 + line / 2, cz + W / 2 - line / 2])
    m.add(box([L, 0.002, line]), P.white, { at: [cx, top + 0.003, z] });
  for (const x of [cx - L / 2 + line / 2, cx + L / 2 - line / 2])
    m.add(box([line, 0.002, W]), P.white, { at: [x, top + 0.003, cz] });
  m.add(box([L, 0.002, 0.003 * g.tpm]), P.white, { at: [cx, top + 0.003, cz] });
  // the net: its posts beyond the sides, the mesh, the white tape along its top
  const nh = 0.1525 * g.tpm;
  const out = 0.1525 * g.tpm;
  for (const z of [cz - W / 2 - out, cz + W / 2 + out]) {
    m.add(box([0.03, nh + 0.02, 0.03], 0.004), P.graphite, { at: [cx, top + nh / 2 - 0.01, z] });
    m.add(box([0.05, 0.03, 0.06]), P.graphite, { at: [cx, top - 0.005, z + (z < cz ? 0.03 : -0.03)] });
  }
  m.add(box([0.006, nh - 0.02, W + 2 * out]), 0x2a2a2c, { at: [cx, top + nh / 2 - 0.01, cz], tone: 0.9 });
  m.add(box([0.012, 0.02, W + 2 * out]), P.white, { at: [cx, top + nh - 0.01, cz] });
  // the frames: legs splayed under each half, a stretcher, castors
  for (const x of [cx - L / 2 + 0.38, cx + L / 2 - 0.38]) {
    for (const z of [cz - W / 2 + 0.22, cz + W / 2 - 0.22]) {
      m.add(box([0.05, top - 0.12, 0.05], 0.006), P.graphite, { at: [x, (top - 0.12) / 2 + 0.05, z] });
      m.add(cyl(0.035, 0.035, 0.03, 8), P.rubber, { at: [x, 0.035, z - 0.015], rot: [Math.PI / 2, 0, 0] });
      m.add(box([0.05, 0.03, 0.05]), P.alumDark, { at: [x, 0.085, z] });
    }
    m.add(box([0.04, 0.04, W - 0.44]), P.graphite, { at: [x, 0.22, cz] });
    m.add(box([0.04, 0.04, W - 0.44]), P.graphite, { at: [x, top - 0.09, cz] });
  }
  m.add(box([L - 0.9, 0.04, 0.04]), P.graphite, { at: [cx, 0.22, cz] });
  // (story) a pair of bats on the end
  if (o.seed > 0.4)
    for (const [dx, k] of [
      [0.06, 0xc4402b],
      [-0.06, P.ink],
    ] as const) {
      m.add(cyl(0.075, 0.075, 0.012, 14), k, { at: [cx + L / 2 - 0.2 + dx, top, cz + 0.3 + dx] });
      m.add(box([0.03, 0.02, 0.1]), P.oak, { at: [cx + L / 2 - 0.2 + dx, top + 0.006, cz + 0.4 + dx] });
    }
}

// ── the server rack (1×1) ─────────────────────────────────────────────────────────────────────────
/** A 42U cabinet, 2 m: a smoked glass door, a perforated one or an open frame with its patch cables;
 *  the units' LEDs blinking (seeded), a vented side, "DO NOT TOUCH — V." taped on it. */
export function serverRack(m: Model, o: Look) {
  const F = 0.88;
  const H = 1.98;
  const open = o.look === 2;
  if (open) {
    for (const [x, z] of [
      [0.13, 0.15],
      [0.87, 0.15],
      [0.13, 0.85],
      [0.87, 0.85],
    ])
      m.add(box([0.05, H, 0.05], 0.004), P.graphite, { at: [x, H / 2, z] });
    for (const y of [0.04, H - 0.03]) m.add(box([0.8, 0.06, 0.76], 0.006), P.graphite, { at: [0.5, y, 0.5] });
  } else {
    // the cabinet: its back, sides, top and plinth (open to its door: the units seen through glass)
    m.add(box([0.8, H, 0.04], 0.004), P.graphite, { at: [0.5, H / 2, 0.14] });
    for (const x of [0.115, 0.885]) m.add(box([0.03, H, 0.76], 0.006), P.graphite, { at: [x, H / 2, 0.5] });
    for (const y of [0.04, H - 0.025])
      m.add(box([0.8, y < 1 ? 0.08 : 0.05, 0.76], 0.006), P.graphite, { at: [0.5, y, 0.5] });
    for (let i = 0; i < 9; i++) m.add(box([0.003, 0.012, 0.42]), 0x1a1916, { at: [0.902, 0.4 + i * 0.12, 0.5] });
  }
  // the units: blanks and servers, their LEDs
  const units = 11;
  for (let r = 0; r < units; r++) {
    const y = 0.14 + r * 0.16;
    const tall = rnd(r, 1, o.seed) > 0.7;
    m.add(box([0.66, tall ? 0.14 : 0.08, 0.02], 0.003), r % 3 ? 0x2c2a26 : 0x34322d, { at: [0.5, y, F - 0.05] });
    for (let i = 0; i < 4; i++) {
      if (rnd(r, i, o.seed) < 0.3) continue;
      m.add(box([0.016, 0.008, 0.004]), rnd(i, r, 0.3) > 0.7 ? P.led : 0xd84a3a, {
        at: [0.22 + i * 0.04, y + 0.015, F - 0.038],
        glow: true,
      });
    }
    for (let i = 0; i < 5; i++) m.add(box([0.024, 0.04, 0.004]), 0x45413a, { at: [0.52 + i * 0.05, y, F - 0.038] });
    if (open && rnd(r, 7, o.seed) > 0.4)
      m.add(
        tube(
          [
            [0.3 + rnd(r, 2, 0) * 0.3, y, F - 0.03],
            [0.4, Math.max(0.1, y - 0.05), F + 0.02],
            [0.82, Math.max(0.08, y - 0.1), F - 0.02],
            [0.86, Math.max(0.06, y - 0.3), F - 0.05],
          ],
          0.006,
          4,
          10,
        ),
        CAN[r % CAN.length],
      );
  }
  if (!open) {
    // the door: smoked glass or perforated steel, in its frame; a handle
    const glass = o.look === 0;
    // (the kit draws no see-through: smoked glass is its frame, the units seen as through it)
    if (!glass) {
      m.add(box([0.74, H - 0.06, 0.006]), 0x26252a, { at: [0.5, H / 2, F + 0.004] });
      for (let r = 0; r < 24; r++)
        m.add(box([0.66, 0.012, 0.002]), 0x1a191c, { at: [0.5, 0.12 + r * 0.075, F + 0.008] });
    } else for (const y of [0.04, H - 0.04]) m.add(box([0.74, 0.04, 0.02]), P.graphite, { at: [0.5, y, F + 0.004] });
    for (const x of [0.135, 0.865]) m.add(box([0.03, H - 0.04, 0.02]), P.graphite, { at: [x, H / 2, F + 0.004] });
    m.add(box([0.02, 0.2, 0.02], 0.004), P.alum, { at: [0.82, 1.05, F + 0.02] });
  }
  // (story) the note on its side
  if (!open) {
    m.add(box([0.003, 0.14, 0.22]), 0xe8dbb5, { at: [0.902, 1.35, 0.5] });
    m.add(box([0.002, 0.008, 0.16]), 0xc4402b, { at: [0.905, 1.38, 0.5] });
    m.add(box([0.002, 0.006, 0.12]), 0x3b2a1c, { at: [0.905, 1.33, 0.48] });
  }
}

// ── Vortex's terminal (1×1) ───────────────────────────────────────────────────────────────────────
/** A putty terminal glowing amber text on a walnut cart (its top at desk height) on castors, its
 *  keyboard in front; a cassette labelled LAST TAKE by it. */
export function crtTerminal(m: Model) {
  // the cart: castors, legs, a shelf, the top
  for (const [x, z] of [
    [0.1, 0.2],
    [0.9, 0.2],
    [0.1, 0.86],
    [0.9, 0.86],
  ]) {
    m.add(ball(0.025, 6), P.rubber, { at: [x, 0.025, z] });
    m.add(box([0.035, 0.66, 0.035], 0.004), P.walnutDark, { at: [x, 0.38, z] });
  }
  m.add(box([0.86, 0.025, 0.7], 0.004), P.walnutDark, { at: [0.5, 0.2, 0.53] });
  m.add(box([0.92, 0.04, 0.76], 0.006, 2), P.walnut, { at: [0.5, 0.7, 0.53] });
  const T = 0.72;
  // the terminal: its body tapering to the back, its screen in a bezel
  m.add(box([0.48, 0.06, 0.38], 0.01), P.puttyDark, { at: [0.5, T + 0.03, 0.46] });
  m.add(box([0.54, 0.38, 0.32], 0.03, 2), P.putty, { at: [0.5, T + 0.25, 0.48] });
  m.add(box([0.42, 0.3, 0.22], 0.04, 2), P.puttyDark, { at: [0.5, T + 0.25, 0.28] });
  m.add(box([0.46, 0.3, 0.012], 0.006), 0xa89a76, { at: [0.5, T + 0.26, 0.645] });
  m.add(box([0.4, 0.25, 0.006]), 0x1a120a, { at: [0.5, T + 0.26, 0.652] });
  for (let r = 0; r < 6; r++) {
    const len = 0.08 + rnd(r, 2, 0) * 0.22;
    m.add(box([len, 0.012, 0.002]), P.vfd, { at: [0.33 + len / 2, T + 0.35 - r * 0.032, 0.656], glow: true });
  }
  m.add(box([0.02, 0.016, 0.002]), P.led, { at: [0.33, T + 0.16, 0.656], glow: true });
  m.add(box([0.012, 0.012, 0.004]), P.led, { at: [0.72, T + 0.09, 0.645], glow: true });
  // the keyboard
  m.add(box([0.46, 0.03, 0.15], 0.006), P.putty, { at: [0.48, T + 0.015, 0.79], rot: [0.06, 0, 0] });
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 10; k++)
      m.add(box([0.032, 0.012, 0.03]), 0xe9dfc4, { at: [0.29 + k * 0.042, T + 0.034, 0.75 + r * 0.038] });
  // (story) the cassette
  m.add(box([0.1, 0.014, 0.065], 0.002), P.graphite, { at: [0.84, T + 0.007, 0.8], rot: [0, 0.3, 0] });
  m.add(box([0.07, 0.002, 0.03]), P.cream, { at: [0.84, T + 0.015, 0.8], rot: [0, 0.3, 0] });
}

// ── the mixing desk (3×1) ─────────────────────────────────────────────────────────────────────────
/** A studio console on its stand: fourteen channel strips down a sloped face (a fader, three knobs
 *  each), the meter bridge's VU LEDs lit to a mix, the jacks along the front; masking tape with the
 *  channels' names. */
export function mixingDesk(m: Model) {
  // the stand: two frames, a rail
  for (const x of [0.25, 2.75]) {
    m.add(box([0.06, 0.66, 0.06], 0.006), P.graphite, { at: [x, 0.33, 0.82] });
    m.add(box([0.06, 0.66, 0.06], 0.006), P.graphite, { at: [x, 0.33, 0.24] });
    m.add(box([0.06, 0.05, 0.7], 0.006), P.graphite, { at: [x, 0.03, 0.53] });
  }
  m.add(box([2.5, 0.05, 0.05]), P.graphite, { at: [1.5, 0.2, 0.3] });
  // the console's body: a wedge, low at the front, its bridge at the back
  const prof: [number, number][] = [
    [0.96, 0.66],
    [0.96, 0.82],
    [0.42, 0.97],
    [0.42, 1.18],
    [0.16, 1.18],
    [0.16, 0.66],
  ];
  side(m, prof, 1.5, 2.96, P.graphite);
  for (const x of [0.01, 2.99]) side(m, prof, x, 0.02, P.walnut);
  const slope = Math.atan2(0.15, 0.54);
  const on = (z: number) => 0.82 + (0.96 - z) * Math.tan(slope);
  for (let i = 0; i < 14; i++) {
    const x = 0.17 + i * 0.205;
    // the fader: its slot and cap
    m.add(box([0.012, 0.004, 0.26]), 0x14120f, { at: [x, on(0.74) + 0.002, 0.74], rot: [slope, 0, 0] });
    const fz = 0.66 + rnd(i, 1, 0) * 0.16;
    m.add(box([0.05, 0.022, 0.03], 0.004), P.cream, { at: [x, on(fz) + 0.012, fz], rot: [slope, 0, 0] });
    // the knobs up the strip
    for (const [z, c] of [
      [0.56, P.rust],
      [0.49, P.mustard],
      [0.44, P.alum],
    ] as const)
      m.add(cyl(0.017, 0.014, 0.022, 8), c, { at: [x, on(z), z], rot: [slope, 0, 0] });
    // the meters on the bridge's face, lit to a fixed mix
    const lit = 2 + Math.floor(rnd(i, 9, 0) * 5);
    for (let k = 0; k < 6; k++) {
      const col = k >= 5 ? 0xd84a3a : k >= 4 ? P.led : P.vfd;
      m.add(box([0.08, 0.016, 0.004]), k < lit ? col : 0x3a2c1f, { at: [x, 1.0 + k * 0.026, 0.422], glow: k < lit });
    }
    // the jacks along the front
    m.add(cyl(0.01, 0.01, 0.006, 8), 0x14120f, { at: [x, 0.74, 0.963], rot: [Math.PI / 2, 0, 0] });
  }
  // (story) the masking tape, the names in pen on it
  m.add(box([2.86, 0.002, 0.04]), 0xe8dbb5, { at: [1.5, on(0.9) + 0.002, 0.9], rot: [slope, 0, 0] });
  for (let i = 0; i < 14; i++) {
    const w = 0.05 + rnd(i, 4, 0) * 0.08;
    m.add(box([w, 0.002, 0.006]), 0x3b2a1c, { at: [0.15 + i * 0.205, on(0.9) + 0.004, 0.9], rot: [slope, 0, 0] });
  }
}

// ── the speaker cabinet (1×1) ─────────────────────────────────────────────────────────────────────
/** A floor-standing monitor: graphite baffle, walnut sides, a woofer and a mid in their surrounds, a
 *  tweeter, the port; on spikes. A little Yondra sticker on the side. */
export function speakerCab(m: Model) {
  const F = 0.8;
  m.add(box([0.6, 1.1, 0.6], 0.012), P.graphite, { at: [0.5, 0.6, 0.5] });
  for (const x of [0.19, 0.81]) m.add(box([0.025, 1.1, 0.6], 0.006), P.walnut, { at: [x, 0.6, 0.5] });
  m.add(box([0.66, 0.025, 0.62], 0.006), P.walnutDark, { at: [0.5, 1.16, 0.5] });
  for (const [x, z] of [
    [0.24, 0.24],
    [0.76, 0.24],
    [0.24, 0.76],
    [0.76, 0.76],
  ])
    m.add(cyl(0.02, 0.004, 0.05, 6), P.alumDark, { at: [x, 0, z] });
  m.add(box([0.66, 0.02, 0.66]), P.ink, { at: [0.5, 0.055, 0.5] });
  // the drivers: a surround, the cone, the dust cap
  const driver = (y: number, r: number) => {
    m.add(ring(r, r * 0.08, 5, 20), P.alumDark, { at: [0.5, y, F + 0.006], rot: [Math.PI / 2, 0, 0] });
    m.add(cyl(r * 0.95, r * 0.95, 0.004, 20), 0x14120f, { at: [0.5, y, F], rot: [Math.PI / 2, 0, 0] });
    m.add(cyl(r * 0.6, r * 0.6, 0.002, 18), 0x24221e, { at: [0.5, y, F + 0.004], rot: [Math.PI / 2, 0, 0] });
    m.add(ball(r * 0.22, 8), P.alumDark, { at: [0.5, y, F], scale: [1, 1, 0.4] });
  };
  driver(0.36, 0.2);
  driver(0.78, 0.11);
  m.add(ball(0.03, 8), P.alum, { at: [0.5, 1.0, F - 0.01] });
  m.add(ring(0.045, 0.006, 4, 16), P.alumDark, { at: [0.5, 1.0, F + 0.004], rot: [Math.PI / 2, 0, 0] });
  m.add(box([0.22, 0.04, 0.01], 0.008), 0x0c0b0a, { at: [0.5, 0.12, F + 0.002] });
  // (story) the sticker
  m.add(box([0.004, 0.06, 0.1]), P.mustard, { at: [0.824, 0.86, 0.6] });
}

// ── the mic stand (1×1) ───────────────────────────────────────────────────────────────────────────
/** A tripod, the chrome pole, a boom out to the mic in its clip with a pop filter in front; its cable
 *  coiled on the floor. */
export function micStand(m: Model) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    m.add(
      tube(
        [
          [0.5, 0.3, 0.5],
          [0.5 + Math.cos(a) * 0.15, 0.1, 0.5 + Math.sin(a) * 0.15],
          [0.5 + Math.cos(a) * 0.28, 0.01, 0.5 + Math.sin(a) * 0.28],
        ],
        0.009,
        5,
        6,
      ),
      P.ink,
    );
    m.add(ball(0.014, 6), P.rubber, { at: [0.5 + Math.cos(a) * 0.28, 0.012, 0.5 + Math.sin(a) * 0.28] });
  }
  m.add(cyl(0.02, 0.02, 0.06), P.ink, { at: [0.5, 0.28, 0.5] });
  m.add(cyl(0.011, 0.011, 1.0), P.chrome, { at: [0.5, 0.3, 0.5] });
  m.add(cyl(0.018, 0.018, 0.04), P.ink, { at: [0.5, 1.28, 0.5] });
  // the boom, out and up towards the room; the mic and its pop filter
  const a: V3 = [0.5, 1.3, 0.5];
  const b: V3 = [0.5, 1.5, 0.82];
  m.add(tube([a, [0.5, 1.4, 0.66], b], 0.008, 5, 6), P.chrome);
  m.add(
    tube(
      [
        [0.5, 1.28, 0.5],
        [0.5, 1.2, 0.36],
        [0.5, 1.16, 0.3],
      ],
      0.008,
      5,
      4,
    ),
    P.chrome,
  );
  m.add(ball(0.03, 8), P.ink, { at: [0.5, 1.16, 0.3] });
  m.add(rod(0.02, 0.024, 0.14, "z"), P.graphite, { at: [0.5, 1.5, 0.86] });
  m.add(ball(0.026, 8), P.alum, { at: [0.5, 1.5, 0.93] });
  m.add(ring(0.06, 0.005, 4, 18), P.ink, { at: [0.5, 1.5, 0.98], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(0.056, 0.056, 0.002, 18), 0x1a1612, { at: [0.5, 1.5, 0.98], rot: [Math.PI / 2, 0, 0], tone: 0.8 });
  // (story) the cable, coiled on the floor
  for (const r of [0.08, 0.065, 0.075]) m.add(ring(r, 0.007, 4, 18), 0x24221e, { at: [0.74, 0.008 + r * 0.02, 0.74] });
}

// ── the floor lamps (1×1) ─────────────────────────────────────────────────────────────────────────
/** A floor lamp (`props.on`, unset on; its shade's colour `props.color`): a drum shade on a brass pole
 *  over a walnut foot, a pull chain, the cord across the floor; an arc lamp's marble foot and brass
 *  arc with its dome hanging over; a paper globe on a slim pole. Lit, the shade glows. */
export function lamp(m: Model, o: Look) {
  const on = o.on !== false;
  if (o.look === 1) return arcLamp(m, o, on);
  if (o.look === 2) return globeLamp(m, on);
  const fab = o.fabric ?? P.cream;
  m.add(
    lathe(
      [
        [0.17, 0],
        [0.17, 0.02],
        [0.15, 0.04],
        [0.06, 0.05],
        [0.001, 0.055],
      ],
      18,
    ),
    P.walnutDark,
    { at: [0.5, 0, 0.5] },
  );
  m.add(cyl(0.012, 0.012, 1.34), P.brass, { at: [0.5, 0.05, 0.5] });
  m.add(cyl(0.025, 0.025, 0.05), P.brass, { at: [0.5, 1.3, 0.5] });
  // the shade, lit from inside when on; the bulb in its opening
  const shadeC = on ? (o.fabric ? shade(fab, 1.25) : 0xf2c27a) : fab;
  m.add(
    lathe(
      [
        [0.2, 1.24],
        [0.205, 1.25],
        [0.16, 1.62],
        [0.155, 1.63],
      ],
      20,
    ),
    shadeC,
    { at: [0.5, 0, 0.5], glow: on },
  );
  // (its inside, seen from above)
  m.add(
    lathe(
      [
        [0.152, 1.625],
        [0.197, 1.245],
      ],
      20,
    ),
    on ? 0xf6d9a0 : shade(fab, 0.8),
    { at: [0.5, 0, 0.5], glow: on },
  );
  m.add(ball(0.04, 8), on ? P.vfd : P.paperWhite, { at: [0.5, 1.4, 0.5], glow: on });
  // the pull chain
  m.add(cyl(0.002, 0.002, 0.14), P.brass, { at: [0.56, 1.18, 0.5] });
  m.add(ball(0.008, 6), P.brass, { at: [0.56, 1.175, 0.5] });
  // the cord over the floor
  m.add(
    tube(
      [
        [0.52, 0.01, 0.56],
        [0.66, 0.008, 0.6],
        [0.7, 0.008, 0.7],
        [0.76, 0.008, 0.74],
      ],
      0.005,
      4,
      10,
    ),
    0x4a3a2c,
  );
}

function arcLamp(m: Model, o: Look, on: boolean) {
  m.add(cyl(0.2, 0.19, 0.05, 20), 0xd8d2c6, { at: [0.5, 0, 0.5] });
  const arc: V3[] = [
    [0.5, 0.05, 0.5],
    [0.52, 1.0, 0.5],
    [0.4, 1.85, 0.5],
    [0.2, 2.02, 0.5],
    [0.08, 1.92, 0.5],
  ];
  m.add(tube(arc, 0.012, 6, 24), P.brass);
  const dome = o.fabric ?? P.graphite;
  m.add(
    lathe(
      [
        [0.2, 1.62],
        [0.19, 1.67],
        [0.13, 1.76],
        [0.04, 1.8],
        [0.001, 1.81],
      ],
      20,
    ),
    dome,
    { at: [0.06, 0, 0.5] },
  );
  m.add(
    lathe(
      [
        [0.001, 1.8],
        [0.12, 1.755],
        [0.185, 1.665],
        [0.195, 1.625],
      ],
      20,
    ),
    on ? 0xf6d9a0 : shade(dome, 0.6),
    { at: [0.06, 0, 0.5], glow: on },
  );
  m.add(cyl(0.17, 0.17, 0.004, 20), on ? P.vfd : 0x2a2826, { at: [0.06, 1.63, 0.5], glow: on });
}

function globeLamp(m: Model, on: boolean) {
  m.add(cyl(0.14, 0.13, 0.035, 18), P.walnutDark, { at: [0.5, 0, 0.5] });
  m.add(cyl(0.008, 0.008, 1.2), P.brass, { at: [0.5, 0.035, 0.5] });
  m.add(ball(0.24, 16), on ? 0xffd7a0 : 0xf3ead8, { at: [0.5, 1.45, 0.5], glow: on });
  for (const y of [-0.16, -0.08, 0, 0.08, 0.16]) {
    const r = Math.sqrt(0.243 ** 2 - y * y);
    m.add(ring(r, 0.003, 3, 24), on ? 0xe0b07a : 0xd9c9aa, { at: [0.5, 1.45 + y, 0.5], glow: on });
  }
}

// ── the lot's lamp post (1×1, its head out over the cars) ──────────────────────────────────────────
/** A street light: a stone foot, the pole tapering to 8.9 m, an arm out along x to the head, its
 *  lamp lit under it (shared light.ts: the light out at its head's end). */
export function lampPost(m: Model) {
  m.add(cyl(0.16, 0.14, 0.2, 12), 0x9a9690, { at: [0.5, 0, 0.5] });
  m.add(cyl(0.09, 0.055, 8.7, 10), 0x6c7074, { at: [0.5, 0.2, 0.5] });
  m.add(
    tube(
      [
        [0.5, 8.8, 0.5],
        [0.9, 8.86, 0.5],
        [1.6, 8.84, 0.5],
        [2.0, 8.78, 0.5],
      ],
      0.04,
      6,
      14,
    ),
    0x6c7074,
  );
  m.add(box([0.62, 0.16, 0.3], 0.03, 2), 0x6c7074, { at: [2.25, 8.73, 0.5] });
  m.add(box([0.52, 0.02, 0.22]), 0xfff2cc, { at: [2.25, 8.645, 0.5], glow: true });
}

// ── the slot-car track (4×3) ──────────────────────────────────────────────────────────────────────
/** The autorama on its table (the board at TABLE_TOP, where the cars race: shared slotcar.ts): the
 *  turned legs, the shelf with the set's box on it; the felt field, the circuit of `track` on it —
 *  tarmac, four slots with their rails, kerbs and sand on the corners, the chequered line and the
 *  grid — the grandstand full of people with its floodlight, the lap tower, a pit garage and pines
 *  where the track leaves room, tyre stacks in the corners, sponsor boards along the front, the power
 *  box with its controllers. The cars and the gantry are drawn live (world/slots.ts). */
export function slotTrack(m: Model, id: SlotTrackId) {
  const Z = TABLE_TOP.slot_track;
  const HW = SLOT_HALF_WIDTH;
  const stops = slotStops(0.05, id);
  const at = (s: number, off: number, y: number): V3 => {
    const q = slotPoint(s, off, id);
    return [q.x, y, q.y];
  };
  const strips = (o0: number, o1: number, y: number, only?: (i: number) => boolean): V3[][] => {
    const out: V3[][] = [];
    for (let i = 0; i < stops.length - 1; i++)
      if (!only || only(i)) {
        const [a, b] = [stops[i].s, stops[i + 1].s];
        out.push([at(a, o0, y), at(b, o0, y), at(b, o1, y), at(a, o1, y)]);
      }
    return out;
  };
  const curve = (i: number) => stops[i].curve;
  // the table: turned legs, the shelf, the set's box and spare track on it
  for (const [x, z] of [
    [0.14, 0.14],
    [3.86, 0.14],
    [0.14, 2.86],
    [3.86, 2.86],
  ])
    m.add(
      lathe(
        [
          [0.05, 0],
          [0.06, 0.12],
          [0.075, 0.16],
          [0.075, 0.2],
          [0.05, 0.24],
          [0.045, Z - 0.16],
          [0.06, Z - 0.12],
          [0.06, Z - 0.09],
        ],
        10,
      ),
      P.walnutDark,
      { at: [x, 0, z] },
    );
  m.add(box([3.6, 0.03, 2.4], 0.006), P.walnut, { at: [2, 0.2, 1.5] });
  m.add(box([1.2, 0.12, 0.8], 0.006), P.paperWhite, { at: [1.15, 0.275, 1.7] });
  m.add(box([1.1, 0.004, 0.12]), 0xc4402b, { at: [1.15, 0.337, 1.95] });
  m.add(box([0.4, 0.004, 0.12]), 0x4f86c6, { at: [0.9, 0.337, 1.6] });
  m.add(box([0.4, 0.004, 0.12]), 0xc4402b, { at: [1.35, 0.337, 1.6] });
  m.add(box([0.7, 0.06, 0.55], 0.004), P.creamDark, { at: [2.3, 0.245, 1.85] });
  // the board: plywood under a walnut lip, the felt on it, mown in stripes
  m.add(box([3.99, 0.06, 2.99], 0.004), 0xd9b98a, { at: [2, Z - 0.11, 1.5] });
  m.add(box([4.0, 0.08, 3.0], 0.006), P.walnut, { at: [2, Z - 0.04, 1.5] });
  m.add(box([3.96, 0.004, 2.96]), 0x5f7a3a, { at: [2, Z + 0.002, 1.5] });
  for (let i = 1; i < 16; i += 2) m.add(box([0.25, 0.002, 2.94]), 0x6a8742, { at: [0.125 + i * 0.25, Z + 0.004, 1.5] });
  // the sand outside the corners, the tarmac, the rubber through them, the kerbs, the edge lines
  m.add(quads(strips(-HW - 0.05, -HW - 0.14, Z + 0.006, curve)), 0xd8c08c);
  m.add(quads(strips(-HW, HW, Z + 0.008)), 0x3b3a36);
  m.add(quads(strips(-0.08, 0.08, Z + 0.009, curve)), 0x2c2b28);
  for (const s of [-1, 1]) {
    m.add(quads(strips(s * HW, s * (HW + 0.055), Z + 0.01, (i) => curve(i) && i % 2 === 0)), 0xc4402b);
    m.add(quads(strips(s * HW, s * (HW + 0.055), Z + 0.01, (i) => curve(i) && i % 2 === 1)), 0xf2e8d2);
    m.add(quads(strips(s * (HW - 0.03), s * (HW - 0.018), Z + 0.0095)), 0xd9d2bf);
  }
  // the lanes: a dark slot, a steel rail either side
  for (let lane = 0; lane < SLOT_LANES; lane++) {
    const off = laneOffset(lane);
    m.add(quads(strips(off - 0.006, off + 0.006, Z + 0.011)), 0x141210);
    for (const s of [-1, 1]) m.add(quads(strips(off + s * 0.014, off + s * 0.022, Z + 0.0105)), 0xa39c8e);
  }
  // the chequered line and the grid: a box and a colour per lane
  const chq: V3[][][] = [[], []];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 10; c++) {
      const o0 = -HW + (c * 2 * HW) / 10;
      const o1 = o0 + (2 * HW) / 10;
      const [a, b] = [r * 0.04, r * 0.04 + 0.04];
      chq[(r + c) % 2].push([at(a, o0, Z + 0.012), at(b, o0, Z + 0.012), at(b, o1, Z + 0.012), at(a, o1, Z + 0.012)]);
    }
  m.add(quads(chq[0]), 0x1c1a17);
  m.add(quads(chq[1]), 0xf2e8d2);
  for (let lane = 0; lane < SLOT_LANES; lane++) {
    const off = laneOffset(lane);
    const q = (a: number, b: number): V3[] => [
      at(a, off - 0.05, Z + 0.012),
      at(b, off - 0.05, Z + 0.012),
      at(b, off + 0.05, Z + 0.012),
      at(a, off + 0.05, Z + 0.012),
    ];
    m.add(quads([q(-0.34, -0.31)]), 0xe9e1cc);
    m.add(quads([q(-0.07, -0.04)]), Number.parseInt(SLOT_COLORS[lane].slice(1), 16));
  }
  // tyre stacks in the corners
  for (const [x, z] of [
    [0.1, 0.1],
    [3.9, 0.1],
    [0.1, 2.9],
    [3.9, 2.9],
  ])
    for (let k = 0; k < 3; k++) m.add(ring(0.04, 0.018, 4, 12), 0x24221f, { at: [x, Z + 0.018 + k * 0.034, z] });
  // the grandstand behind the far straight: three tiers full of people, its roof on posts
  const crowd = [0xc4402b, 0xefe4cc, 0x4f86c6, 0xf0a12c, 0x7fa34a, 0x2b2a26, 0xb5562f, 0xd6c9a6];
  for (const [z0, z1, h] of [
    [0.03, 0.08, 0.2],
    [0.08, 0.13, 0.14],
    [0.13, 0.18, 0.08],
  ]) {
    m.add(box([2.3, h, z1 - z0]), P.cream, { at: [1.95, Z + h / 2, (z0 + z1) / 2] });
    for (let i = 0; i < 26; i++) {
      const x = 0.86 + i * 0.085 + rnd(i, h * 100, 0.2) * 0.02;
      const c = crowd[Math.floor(rnd(i, h * 300, 0.9) * crowd.length)];
      m.add(box([0.03, 0.03, 0.02]), c, { at: [x, Z + h + 0.015, (z0 + z1) / 2] });
      m.add(ball(0.012, 5), 0xe0b48c, { at: [x, Z + h + 0.042, (z0 + z1) / 2] });
    }
  }
  for (const x of [0.84, 3.08]) m.add(box([0.03, 0.34, 0.03]), P.alum, { at: [x, Z + 0.17, 0.04] });
  m.add(box([2.38, 0.035, 0.18], 0.004), P.rust, { at: [1.95, Z + 0.35, 0.095], rot: [0.12, 0, 0] });
  // the floodlight at the stand's far end
  m.add(cyl(0.012, 0.012, 0.66), P.alum, { at: [0.42, Z, 0.08] });
  m.add(box([0.24, 0.1, 0.05], 0.004), P.graphite, { at: [0.42, Z + 0.7, 0.09], rot: [0.4, 0, 0] });
  for (let i = 0; i < 3; i++)
    m.add(box([0.05, 0.06, 0.004]), P.led, { at: [0.35 + i * 0.07, Z + 0.69, 0.117], rot: [0.4, 0, 0], glow: true });
  // the lap tower in the far corner: a row a lane, the laps lit
  m.add(box([0.44, 0.56, 0.2], 0.006), P.graphite, { at: [3.62, Z + 0.28, 0.16] });
  m.add(box([0.36, 0.42, 0.004]), 0x1a1d1c, { at: [3.62, Z + 0.28, 0.262] });
  for (let lane = 0; lane < SLOT_LANES; lane++) {
    const y = Z + 0.44 - lane * 0.087;
    m.add(box([0.06, 0.055, 0.004]), Number.parseInt(SLOT_COLORS[lane].slice(1), 16), { at: [3.5, y, 0.266] });
    m.add(box([0.19, 0.055, 0.004]), P.vfd, { at: [3.67, y, 0.266], glow: true });
  }
  m.add(box([0.36, 0.035, 0.004]), 0xd84a3a, { at: [3.62, Z + 0.53, 0.266], glow: true });
  // the pit garage where the track leaves room, the pines
  const room = (x0: number, z0: number, x1: number, z1: number, pad = 0.1) =>
    [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
      [(x0 + x1) / 2, (z0 + z1) / 2],
      [(x0 + x1) / 2, z0],
      [(x0 + x1) / 2, z1],
      [x0, (z0 + z1) / 2],
      [x1, (z0 + z1) / 2],
    ].every(([x, z]) => slotDistance(x, z, id) > HW + pad);
  const garage = GARAGE_SPOTS.find(([x, z]) => room(x - 0.1, z - 0.04, x + 0.9, z + 0.5));
  if (garage) {
    const [gx, gz] = garage;
    m.add(box([1.0, 0.004, 0.17]), 0x5e5a52, { at: [gx + 0.4, Z + 0.006, gz + 0.405] });
    m.add(box([0.8, 0.165, 0.3]), P.cream, { at: [gx + 0.4, Z + 0.0825, gz + 0.15] });
    for (let i = 0; i < 3; i++) {
      const u = gx + 0.16 + i * 0.25;
      m.add(box([0.2, 0.11, 0.004]), 0x2b2a26, { at: [u, Z + 0.065, gz + 0.302] });
      m.add(box([0.12, 0.03, 0.05], 0.004), Number.parseInt(SLOT_COLORS[i + 1].slice(1), 16), {
        at: [u, Z + 0.02, gz + 0.29],
      });
    }
    m.add(box([0.88, 0.033, 0.38], 0.004), P.rust, { at: [gx + 0.4, Z + 0.181, gz + 0.15] });
    m.add(box([0.3, 0.025, 0.004]), 0xf2e8d2, { at: [gx + 0.4, Z + 0.181, gz + 0.342] });
  }
  for (const [x, z, k] of PINE_SPOTS.filter(([x, z, k]) =>
    room(x - 0.14 * k, z - 0.14 * k, x + 0.14 * k, z + 0.14 * k, 0.04),
  ).slice(0, 3)) {
    m.add(cyl(0.012, 0.012, 0.07), P.walnutDark, { at: [x, Z, z] });
    m.add(cyl(0.13 * k, 0.05 * k, 0.13 * k, 8), P.mossDark, { at: [x, Z + 0.06, z] });
    m.add(cyl(0.09 * k, 0.005, 0.16 * k, 8), P.moss, { at: [x, Z + 0.06 + 0.1 * k, z] });
  }
  // sponsor boards along the front edge
  const boards = [0xf2e8d2, P.rust, 0x3f4a5a, P.olive, 0xf2e8d2, 0xc4402b];
  for (let i = 0; i < 6; i++) {
    const x = 0.72 + i * 0.5;
    m.add(box([0.44, 0.066, 0.02]), boards[i], { at: [x, Z + 0.033, 2.95] });
    m.add(box([0.14, 0.026, 0.004]), boards[i] === 0xf2e8d2 ? 0xc4402b : 0xf2e8d2, {
      at: [x - 0.08, Z + 0.033, 2.962],
    });
  }
  // the power box under the front lip: four jacks, the controllers hanging by their cords
  m.add(box([0.66, 0.13, 0.12], 0.008), P.graphite, { at: [3.25, Z - 0.21, 2.92] });
  m.add(box([0.02, 0.012, 0.004]), 0xd84a3a, { at: [2.97, Z - 0.18, 2.982], glow: true });
  for (let lane = 0; lane < SLOT_LANES; lane++) {
    const u = 3.03 + lane * 0.15;
    const c = Number.parseInt(SLOT_COLORS[lane].slice(1), 16);
    m.add(box([0.06, 0.03, 0.006]), c, { at: [u, Z - 0.2, 2.982] });
    m.add(
      tube(
        [
          [u, Z - 0.22, 2.985],
          [u + 0.01, Z - 0.32, 3.0],
          [u + (lane - 1.5) * 0.02, Z - 0.42, 2.975],
        ],
        0.004,
        4,
        6,
      ),
      0x1c1a17,
    );
    m.add(box([0.06, 0.1, 0.045], 0.01), c, { at: [u + (lane - 1.5) * 0.02, Z - 0.47, 2.975] });
  }
}

// where the pit garage could stand, first choice first; where pines could, the first three with room
const GARAGE_SPOTS: [number, number][] = [
  [2.15, 1.46],
  [1.55, 1.5],
  [2.45, 1.7],
  [1.1, 1.4],
  [2.75, 1.3],
  [0.95, 1.95],
];
const PINE_SPOTS: [number, number, number][] = [
  [1.3, 1.62, 1],
  [1.78, 1.9, 0.8],
  [1.48, 1.92, 0.65],
  [2.35, 1.2, 0.9],
  [0.78, 1.55, 0.8],
  [3.22, 1.7, 0.7],
  [1.95, 1.05, 0.75],
  [0.72, 2.05, 0.65],
  [3.3, 1.2, 0.8],
  [2.6, 1.95, 0.7],
  [0.7, 1.1, 0.7],
  [3.25, 2.1, 0.65],
];
