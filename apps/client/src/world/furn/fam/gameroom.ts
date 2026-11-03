import { glyphDots } from "@yutopia/shared/glyphs";
import {
  type BufferGeometry,
  Euler,
  Float32BufferAttribute,
  BufferGeometry as Geo,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
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
  type PartOpts,
  quads,
  ring,
  rod,
  tube,
  type V3,
} from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 9 (docs/plan/68-more-furniture.md): Game room — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/gameroom.ts. Made to be played: the air hockey's puck
// and strikers on its field, the foosball's eight rods and twenty-six men, the dartboard's segments at
// regulation height, the chess set laid out, the pinball's flippers and bumpers under glass, the claw
// over its toys — the games themselves are later phases; their measures are here (PLAY).

export const LOOKS: Record<string, readonly string[]> = {
  air_hockey: ["Classic red", "Midnight neon", "Retro wood"],
  foosball: ["Walnut classic", "Pro black", "Retro red"],
  dartboard: ["Bristle board", "Oak cabinet", "Pub board"],
  chess_table: ["Walnut and maple", "Park stone", "Black lacquer"],
  pinball: ["Cosmic", "Pirate", "Seventies"],
  claw_machine: ["Candy pink", "Mint", "Neon night"],
  jukebox: ["Walnut classic", "Chrome diner", "Cherry red"],
  skee_ball: ["Maple lane", "Neon arcade", "Carnival"],
  card_table: ["Green baize", "Red poker", "Folding vinyl"],
  cornhole_board: ["Natural birch", "Red and white", "Navy team"],
};

/** The playing surfaces, m in each kind's own frame (rot 0): for the games' phases. */
export const PLAY = {
  // the field: its top, x0..x1 along it, z0..z1 across it (inside the rails); the goals' mouths
  // across z at either end; the rails' top
  air_hockey: {
    top: 0.8,
    x0: 0.42,
    x1: 2.58,
    z0: 0.445,
    z1: 1.555,
    goal: 0.3,
    rail: 0.865,
    puck: 0.041,
    striker: 0.048,
  },
  // the field's top inside the walls; the rods across it (z), at `rodY`, their x; the men's feet over
  // the field; the ball's radius
  foosball: { top: 0.74, x0: 0.34, x1: 1.66, z0: 0.66, z1: 1.34, rodY: 0.85, goal: 0.2, ball: 0.0175 },
  // the board's middle (the bull) and its double ring's outer radius, its face (z out from the wall)
  dartboard: { x: 0.5, y: 1.73, r: 0.17, face: 0.152 },
  // the board: its top, its a1 corner and a square's size (files along z, ranks along x, white at
  // low x); the two chairs' seats (middle, top)
  chess_table: {
    top: 0.7245,
    x0: 0.74,
    z0: 0.24,
    sq: 0.065,
    seats: [
      [0.34, 0.5],
      [1.66, 0.5],
    ],
    seat: 0.46,
  },
} as const;

const FACE = 0.1;
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
const mat = (at: V3, rot: V3 = [0, 0, 0], s?: V3) =>
  new Matrix4().compose(
    new Vector3(...at),
    new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], "YXZ")),
    s ? new Vector3(...s) : new Vector3(1, 1, 1),
  );
/** Parts placed in a frame of their own (a tilted playfield, a leaning guitar): `at`/`rot` in it. */
function framed(m: Model, base: Matrix4) {
  return (g: BufferGeometry, c: number, o: PartOpts = {}) => {
    g.applyMatrix4(mat(o.at ?? [0, 0, 0], o.rot, o.scale)).applyMatrix4(base);
    m.add(g, c, { tone: o.tone, glow: o.glow });
  };
}
/** …and a shape put where it goes in that frame, for a live part that doesn't move (lit, blinking). */
const placed = (g: BufferGeometry, base: Matrix4, at: V3 = [0, 0, 0], rot?: V3) =>
  g.applyMatrix4(mat(at, rot)).applyMatrix4(base);

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
/** …centred on (cx, cy). */
const dotsAt = (text: string, cx: number, cy: number, z: number, p: number) =>
  dotText(text, cx - (text.length * 6 - 1) * p * 0.5, cy + 3.5 * p, z, p);

/** A flat ring segment in the x-y plane facing +z: radii r0..r1, angles a0..a1 (from straight up,
 *  clockwise), `n` cuts. */
function sector(cx: number, cy: number, z: number, r0: number, r1: number, a0: number, a1: number, n = 2) {
  const pos: number[] = [];
  const p = (r: number, a: number): V3 => [cx + Math.sin(a) * r, cy + Math.cos(a) * r, z];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const [a, b, c, d] = [p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1)];
    // (wound to face +z: clockwise angles run the other way round in x-y)
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  return geo(pos);
}

/** A side's profile (z, y) cut from a panel `t` thick, standing at x. */
function side(m: Model, profile: [number, number][], x: number, t: number, color: number, o: PartOpts = {}) {
  m.add(extrude(profile, t), color, { ...o, at: [x, 0, 0], rot: [0, -Math.PI / 2, 0] });
}

/** Bulbs round a run of points, dim and still; then in `sets` blinking in turn (a chase). */
function chase(m: Model, at: V3[], c: number, sets: number, r: number, period: number) {
  for (const a of at) m.add(ball(r, 5), shade(c, 0.45), { at: a });
  for (let k = 0; k < sets; k++) {
    const mine = at.filter((_, i) => i % sets === k);
    if (!mine.length) continue;
    m.live(
      merged(mine.map((a) => ball(r * 1.12, 5).translate(...a))),
      c,
      { kind: "blink", period, on: 1 / sets + 0.05, phase: k / sets },
      { glow: true },
    );
  }
}

// ── the air hockey table (3×2) ────────────────────────────────────────────────────────────────────
/** A 7-ft table: the white field pricked with its air holes, the red centre line and circle, the
 *  goals' creases, rails round it with their bumpers, a slot for a goal at each end, the score in red
 *  and blue on the side rail; the puck on the centre spot and a striker before each goal. */
function airHockey(m: Model, o: Look) {
  const v = o.look;
  const body = [0xb3262b, 0x1c1e26, P.walnut][v] ?? 0xb3262b;
  const rail = [P.alum, 0x2b2d35, P.cream][v] ?? P.alum;
  const bump = [0xe9e6df, 0x26c6da, 0xb5562f][v] ?? 0xe9e6df;
  const leg = [P.ink, P.graphite, P.chrome][v] ?? P.ink;
  const surf = [0xf2f3f0, 0xe1ebf3, 0xf1ece0][v] ?? 0xf2f3f0;
  const { top: T, goal: GW, x0, x1, z0, z1 } = PLAY.air_hockey;
  const [cx, cz] = [1.5, 1];
  const L = 2.3;
  const W = 1.25;
  const R = (L - (x1 - x0)) / 2; // the rails' width
  const RH = 0.065;
  // the body, its apron round under the field
  m.add(box([L - 0.04, T - 0.52, W - 0.04], 0.02, 2), body, { at: [cx, (T + 0.52) / 2 - 0.005, cz] });
  m.add(box([L - 0.02, 0.03, W - 0.02], 0.008), shade(body, 0.75), { at: [cx, 0.53, cz] });
  if (v === 0)
    for (const z of [cz - W / 2 + 0.008, cz + W / 2 - 0.008])
      m.add(box([L - 0.2, 0.025, 0.004]), P.white, { at: [cx, 0.64, z + (z < cz ? -0.004 : 0.004)] });
  if (v === 2)
    for (const z of [cz - W / 2 + 0.008, cz + W / 2 - 0.008])
      for (const [y, c] of [
        [0.6, P.mustard],
        [0.66, P.rust],
        [0.72, P.cream],
      ] as const)
        m.add(box([L - 0.2, 0.025, 0.004]), c, { at: [cx, y, z + (z < cz ? -0.004 : 0.004)] });
  // the field and its markings, the air holes in rows
  m.add(box([x1 - x0, 0.012, z1 - z0]), surf, { at: [cx, T - 0.006, cz] });
  m.add(box([0.012, 0.001, z1 - z0]), 0xc4302b, { at: [cx, T + 0.0005, cz] });
  m.add(ring(0.14, 0.004, 3, 36), 0xc4302b, { at: [cx, T + 0.001, cz] });
  m.add(cyl(0.012, 0.012, 0.001, 10), 0xc4302b, { at: [cx, T, cz] });
  for (const s of [-1, 1]) {
    const gx = s < 0 ? x0 : x1;
    const arc: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      arc.push([gx - s * Math.cos(a) * 0.22, T + 0.002, cz + Math.sin(a) * 0.22]);
    }
    m.add(tube(arc, 0.004, 3, 14), 0x2f6fbf);
    m.add(box([0.012, 0.001, z1 - z0]), 0x2f6fbf, { at: [cx + s * 0.55, T + 0.0005, cz] });
  }
  const holes: V3[][] = [];
  const nx = 36;
  const nz = 18;
  const d = 0.0035;
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const x = x0 + ((i + 0.5) / nx) * (x1 - x0);
      const z = z0 + ((k + 0.5) / nz) * (z1 - z0);
      if (Math.abs(x - cx) < 0.012) continue;
      holes.push([
        [x - d, T + 0.0008, z - d],
        [x + d, T + 0.0008, z - d],
        [x + d, T + 0.0008, z + d],
        [x - d, T + 0.0008, z + d],
      ]);
    }
  m.add(quads(holes), shade(surf, 0.72));
  // the rails: along the sides, and at the ends either side of the goal's slot
  for (const z of [cz - W / 2 + R / 2, cz + W / 2 - R / 2]) {
    m.add(box([L, RH + 0.03, R], 0.008), rail, { at: [cx, T - 0.03 + (RH + 0.03) / 2, z] });
    m.add(box([x1 - x0, 0.026, 0.008]), bump, { at: [cx, T + 0.02, z + (z < cz ? R / 2 : -R / 2)] });
  }
  const endLen = (z1 - z0 - GW) / 2;
  for (const s of [-1, 1]) {
    const x = cx + s * (L / 2 - R / 2);
    for (const z of [z0 + endLen / 2, z1 - endLen / 2]) {
      m.add(box([R, RH + 0.03, endLen], 0.008), rail, { at: [x, T - 0.03 + (RH + 0.03) / 2, z] });
      m.add(box([0.008, 0.026, endLen]), bump, { at: [x - s * (R / 2), T + 0.02, z] });
    }
    // the goal's slot, dark, and under it the puck's return on the end
    m.add(box([R, 0.05, GW]), 0x111114, { at: [x, T - 0.02, cz] });
    m.add(box([0.03, 0.07, 0.2], 0.006), shade(body, 0.7), { at: [cx + s * (L / 2 - 0.005), T - 0.1, cz] });
    m.add(box([0.012, 0.04, 0.16]), 0x111114, { at: [cx + s * (L / 2 + 0.006), T - 0.1, cz] });
  }
  // the score on the near side rail: red and blue, lit
  const sz = cz + W / 2 - R / 2;
  m.add(box([0.38, 0.07, 0.07], 0.01), shade(body, 0.85), { at: [cx, T + RH + 0.035, sz] });
  for (const [dx, c] of [
    [-0.08, 0xff4a3a],
    [0.08, 0x4a9cff],
  ] as const) {
    for (const zz of [sz + 0.036, sz - 0.036]) {
      m.add(box([0.1, 0.048, 0.002]), 0x0c0c10, { at: [cx + dx, T + RH + 0.04, zz] });
      const t = dotsAt(String(Math.floor(rnd(dx, 3, o.seed) * 7)), cx + dx, T + RH + 0.04, 0, 0.006);
      if (t)
        m.add(
          zz > sz ? t.translate(0, 0, zz + 0.0012) : t.rotateY(Math.PI).translate(2 * (cx + dx), 0, zz - 0.0012),
          c,
          { glow: true },
        );
    }
  }
  // the legs, their feet, the blower box under the middle
  for (const sx of [-1, 1])
    for (const sz2 of [-1, 1]) {
      const [lx, lz] = [cx + sx * (L / 2 - 0.2), cz + sz2 * (W / 2 - 0.16)];
      m.add(box([0.09, 0.52, 0.09], 0.01), leg, { at: [lx, 0.27, lz] });
      m.add(cyl(0.035, 0.04, 0.02, 10), P.rubber, { at: [lx, 0, lz] });
    }
  for (const sx of [-1, 1]) m.add(box([0.05, 0.05, W - 0.4]), leg, { at: [cx + sx * (L / 2 - 0.2), 0.14, cz] });
  m.add(box([L - 0.45, 0.05, 0.05]), leg, { at: [cx, 0.14, cz] });
  m.add(box([0.44, 0.14, 0.32], 0.01), 0x26272b, { at: [cx, 0.45, cz] });
  if (v === 1)
    for (const [w, d2, dx, dz] of [
      [L - 0.1, 0.006, 0, W / 2 - 0.03],
      [L - 0.1, 0.006, 0, -W / 2 + 0.03],
      [0.006, W - 0.1, L / 2 - 0.03, 0],
      [0.006, W - 0.1, -L / 2 + 0.03, 0],
    ])
      m.add(box([w, 0.012, d2]), 0x26e0f0, { at: [cx + dx, 0.512, cz + dz], glow: true });
  // the puck on the spot, a striker before each goal
  const pc = [0xd8322b, 0xd9f03a, 0xd8322b][v] ?? 0xd8322b;
  m.add(cyl(PLAY.air_hockey.puck, PLAY.air_hockey.puck, 0.008, 18), pc, {
    at: [cx + (o.seed - 0.5) * 0.2, T, cz + (o.seed - 0.5) * 0.12],
  });
  for (const [s, c] of [
    [-1, 0xd8322b],
    [1, 0x2f6fbf],
  ] as const) {
    const at: V3 = [cx + s * 0.82, T, cz];
    m.add(cyl(PLAY.air_hockey.striker, 0.046, 0.02, 18), c, { at });
    m.add(cyl(0.022, 0.018, 0.045, 12), shade(c, 1.15), { at: [at[0], T + 0.02, at[2]] });
    m.add(ball(0.025, 10), shade(c, 1.15), { at: [at[0], T + 0.07, at[2]], scale: [1, 0.7, 1] });
  }
  // (story) a spare puck left on the rail
  if (o.seed > 0.45) m.add(cyl(0.041, 0.041, 0.008, 18), pc, { at: [cx + 0.9, T + RH, cz - W / 2 + R / 2], tone: 0.9 });
}

// ── the foosball table (2×2) ──────────────────────────────────────────────────────────────────────
/** A cabinet on four legs, the green field inside its walls with its lines and a goal at each end;
 *  eight chrome rods across it — goalie, defence, five in the middle, three up front a side, in the
 *  real order — the men on them, their grips out of each side; beads to keep the score; the ball. */
function foosball(m: Model, o: Look) {
  const v = o.look;
  const wood = [P.walnut, 0x1f1f23, 0xa8282c][v] ?? P.walnut;
  const edge = [P.walnutDark, P.chrome, P.cream][v] ?? P.walnutDark;
  const legC = [P.walnutDark, 0x2a2a2e, P.cream][v] ?? P.walnutDark;
  const teamA = [0xc4402b, 0xe8c23a, P.white][v] ?? 0xc4402b;
  const teamB = [0x2f5f9e, 0x2a2a2e, 0x22325a][v] ?? 0x2f5f9e;
  const grip = [P.oak, P.rubber, P.cream][v] ?? P.oak;
  const { top: F, rodY: RY, goal: GW, x0, x1, z0, z1 } = PLAY.foosball;
  const [cx, cz] = [1, 1];
  const L = 1.4;
  const W = 0.76;
  const TOP = 0.91;
  const BOT = 0.58;
  const t = 0.04;
  // the cabinet: its floor, the field, the walls round it and their cap rails
  m.add(box([L - 0.04, 0.03, W - 0.04]), shade(wood, 0.8), { at: [cx, BOT + 0.015, cz] });
  m.add(box([x1 - x0, 0.02, z1 - z0]), 0x2f7a43, { at: [cx, F - 0.01, cz] });
  for (const z of [cz - W / 2 + t / 2, cz + W / 2 - t / 2])
    m.add(box([L, TOP - BOT, t], 0.006), wood, { at: [cx, (TOP + BOT) / 2, z] });
  for (const x of [cx - L / 2 + t / 2, cx + L / 2 - t / 2]) {
    m.add(box([t, TOP - BOT, W - 2 * t], 0.004), wood, { at: [x, (TOP + BOT) / 2, cz] });
    // the goal's mouth in it, dark, the ball's cup out on the end
    m.add(box([0.006, 0.07, GW]), 0x111114, { at: [x + (x < cx ? t / 2 : -t / 2), F + 0.035, cz] });
    m.add(box([0.06, 0.03, 0.12], 0.006), edge, { at: [x + (x < cx ? -0.03 : 0.03), BOT + 0.05, cz] });
  }
  for (const z of [cz - W / 2 + 0.03, cz + W / 2 - 0.03])
    m.add(box([L + 0.02, 0.024, 0.07], 0.006), edge, { at: [cx, TOP - 0.012, z] });
  for (const x of [cx - L / 2 + 0.03, cx + L / 2 - 0.03])
    m.add(box([0.07, 0.024, W - 0.12], 0.006), edge, { at: [x, TOP - 0.012, cz] });
  // the lines: half-way, the centre circle, the goal areas
  m.add(box([0.006, 0.001, z1 - z0 - 0.02]), P.white, { at: [cx, F + 0.0005, cz] });
  m.add(ring(0.08, 0.003, 3, 28), P.white, { at: [cx, F + 0.001, cz] });
  for (const s of [-1, 1]) {
    const gx = s < 0 ? x0 : x1;
    m.add(box([0.006, 0.001, 0.32]), P.white, { at: [gx - s * 0.1, F + 0.0005, cz] });
    for (const z of [cz - 0.16, cz + 0.16])
      m.add(box([0.1, 0.001, 0.006]), P.white, { at: [gx - s * 0.05, F + 0.0005, z] });
  }
  // the rods, in the real order from team A's goal (low x): A goalie, A two, B three, A five, B five,
  // A three, B two, B goalie; A's grips on the far side (−z), B's on the near (+z)
  const ROWS: [string, number][] = [
    ["A", 1],
    ["A", 2],
    ["B", 3],
    ["A", 5],
    ["B", 5],
    ["A", 3],
    ["B", 2],
    ["B", 1],
  ];
  const SPREAD: Record<number, number[]> = {
    1: [0],
    2: [-0.12, 0.12],
    3: [-0.2, 0, 0.2],
    5: [-0.25, -0.125, 0, 0.125, 0.25],
  };
  const step = (x1 - x0 - 0.08) / 7;
  ROWS.forEach(([team, n], i) => {
    const x = x0 + 0.04 + i * step;
    const near = team === "B";
    const c = near ? teamB : teamA;
    // the rod: through both walls, out the grip's side a hand's reach
    const za = near ? cz - W / 2 - 0.05 : cz - W / 2 - 0.3;
    const zb = near ? cz + W / 2 + 0.3 : cz + W / 2 + 0.05;
    m.add(rod(0.0075, 0.0075, zb - za, "z", 8), P.chrome, { at: [x, RY, (za + zb) / 2] });
    const gz = near ? zb - 0.06 : za + 0.06;
    m.add(rod(0.017, 0.017, 0.12, "z", 10), grip, { at: [x, RY, gz] });
    m.add(ball(0.018, 8), grip, { at: [x, RY, near ? zb : za], scale: [1, 1, 0.6] });
    for (const z of [cz - W / 2 - 0.004, cz + W / 2 + 0.004])
      m.add(rod(0.016, 0.016, 0.008, "z", 10), P.alumDark, { at: [x, RY, z] });
    // a bumper inside each wall
    for (const z of [cz - W / 2 + t + 0.01, cz + W / 2 - t - 0.01])
      m.add(rod(0.013, 0.013, 0.02, "z", 8), P.rubber, { at: [x, RY, z] });
    // the men: head, shoulders, body round the rod, legs to just over the field, feet toward the goal
    // they attack
    const fwd = team === "A" ? 1 : -1;
    for (const dz of SPREAD[n]) {
      const z = cz + dz;
      m.add(ball(0.017, 6), c, { at: [x, RY + 0.036, z] });
      m.add(box([0.032, 0.058, 0.04]), c, { at: [x, RY - 0.005, z] });
      m.add(box([0.024, 0.016, 0.06]), c, { at: [x, RY + 0.014, z] });
      m.add(box([0.026, 0.058, 0.03]), shade(c, 0.85), { at: [x, RY - 0.06, z] });
      m.add(box([0.04, 0.014, 0.032]), shade(c, 0.7), { at: [x + fwd * 0.008, RY - 0.083, z] });
    }
  });
  // the score: ten beads on a wire over each end
  for (const s of [-1, 1]) {
    const x = cx + s * (L / 2 - 0.03);
    const scored = Math.floor(rnd(s, 7, o.seed) * 6);
    m.add(rod(0.003, 0.003, 0.3, "z", 5), P.chrome, { at: [x, TOP + 0.03, cz] });
    for (const z of [cz - 0.15, cz + 0.15]) m.add(cyl(0.005, 0.005, 0.03, 5), P.chrome, { at: [x, TOP, z] });
    for (let i = 0; i < 10; i++) {
      const z = i < scored ? cz + 0.13 - i * 0.022 : cz - 0.13 + (9 - i) * 0.022;
      m.add(ball(0.009, 6), s < 0 ? teamA : teamB, { at: [x, TOP + 0.03, z] });
    }
  }
  // the ball in the middle
  m.add(ball(PLAY.foosball.ball, 10), P.white, { at: [cx + (o.seed - 0.5) * 0.3, F + PLAY.foosball.ball, cz - 0.02] });
  // the legs, a stretcher, levelling feet
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const [lx, lz] = [cx + sx * (L / 2 - 0.08), cz + sz * (W / 2 - 0.07)];
      m.add(box([0.08, BOT, 0.08], 0.008), legC, { at: [lx, BOT / 2, lz] });
      m.add(cyl(0.03, 0.035, 0.02, 8), P.rubber, { at: [lx, 0, lz] });
    }
  for (const sx of [-1, 1]) m.add(box([0.05, 0.05, W - 0.2]), legC, { at: [cx + sx * (L / 2 - 0.08), 0.16, cz] });
  m.add(box([L - 0.2, 0.05, 0.05]), legC, { at: [cx, 0.16, cz] });
  // (story) a spare ball in the cup
  if (o.seed > 0.5) m.add(ball(0.0175, 8), P.white, { at: [cx + L / 2 + 0.02, BOT + 0.08, cz] });
}

// ── the dartboard (wall, 1) ───────────────────────────────────────────────────────────────────────
/** A bristle board, its bull 1.73 m up as the rules have it: twenty segments black and cream, the
 *  doubles and trebles red and green, the wire spider over it, the number ring; on a black surround,
 *  in an oak cabinet with its doors open on the chalk scoreboards, or on a pub's square backboard with
 *  a slate under it. Three darts in it. */
function dartboard(m: Model, o: Look) {
  const v = o.look;
  const { x: cx, y: cy, face } = PLAY.dartboard;
  const zb = face; // the board's face
  // what it hangs on
  if (v === 0) {
    m.add(cyl(0.32, 0.32, 0.03, 32), 0x1a1a1c, { at: [cx, cy, FACE], rot: [Math.PI / 2, 0, 0] });
    m.add(ring(0.32, 0.012, 4, 32).rotateX(Math.PI / 2), 0x26262a, { at: [cx, cy, FACE + 0.03] });
  } else if (v === 1) {
    const oak = P.oak;
    m.add(box([0.62, 0.62, 0.012]), shade(oak, 0.8), { at: [cx, cy, FACE + 0.006] });
    for (const [w, h, dx, dy] of [
      [0.62, 0.03, 0, 0.295],
      [0.62, 0.03, 0, -0.295],
      [0.03, 0.62, 0.295, 0],
      [0.03, 0.62, -0.295, 0],
    ])
      m.add(box([w, h, 0.1], 0.004), oak, { at: [cx + dx, cy + dy, FACE + 0.05] });
    // the doors, open, the chalk boards on their insides and the scores on them
    for (const s of [-1, 1]) {
      const hx = cx + s * 0.31;
      const a = (120 * Math.PI) / 180;
      const dir: [number, number] = [s * Math.cos(Math.PI - a), Math.sin(a)];
      const mid: V3 = [hx + dir[0] * 0.155, cy, FACE + 0.1 + dir[1] * 0.155];
      const yaw = Math.atan2(-dir[1], dir[0]);
      m.add(box([0.31, 0.62, 0.02], 0.004), oak, { at: mid, rot: [0, yaw, 0] });
      // (the inside face: toward the room's side of the door)
      const n: [number, number] = [-s * dir[1], s * dir[0]];
      const inMid: V3 = [mid[0] + n[0] * 0.011, cy, mid[2] + n[1] * 0.011];
      m.add(box([0.25, 0.54, 0.002]), 0x24302b, { at: inMid, rot: [0, yaw, 0] });
      for (let r = 0; r < 6; r++) {
        const w = 0.04 + rnd(r, s, o.seed) * 0.08;
        const off = -0.07 + (r % 2) * 0.1;
        m.add(box([w, 0.012, 0.002]), 0xe8e4d8, {
          at: [inMid[0] + n[0] * 0.0015 + dir[0] * off, cy + 0.2 - r * 0.07, inMid[2] + n[1] * 0.0015 + dir[1] * off],
          rot: [0, yaw, 0],
        });
      }
      m.add(box([0.2, 0.004, 0.002]), 0xe8e4d8, {
        at: [inMid[0] + n[0] * 0.0015, cy + 0.24, inMid[2] + n[1] * 0.0015],
        rot: [0, yaw, 0],
      });
    }
    m.add(box([0.05, 0.025, 0.03], 0.004), P.brass, { at: [cx, cy - 0.29, FACE + 0.1] });
  } else {
    m.add(box([0.66, 0.66, 0.025], 0.006), 0x23402f, { at: [cx, cy, FACE + 0.0125] });
    for (const [w, h, dx, dy] of [
      [0.66, 0.03, 0, 0.33],
      [0.66, 0.03, 0, -0.33],
      [0.03, 0.66, 0.33, 0],
      [0.03, 0.66, -0.33, 0],
    ])
      m.add(box([w, h, 0.035], 0.004), P.walnutDark, { at: [cx + dx, cy + dy, FACE + 0.0175] });
    // the slate under it, its chalk and the scores
    m.add(box([0.46, 0.26, 0.02], 0.004), P.walnutDark, { at: [cx, cy - 0.53, FACE + 0.01] });
    m.add(box([0.42, 0.22, 0.004]), 0x2a2d2e, { at: [cx, cy - 0.53, FACE + 0.022] });
    for (let r = 0; r < 4; r++)
      for (const s of [-1, 1])
        m.add(box([0.05 + rnd(r, s, o.seed) * 0.08, 0.014, 0.002]), 0xe8e4d8, {
          at: [cx + s * 0.1, cy - 0.45 - r * 0.05, FACE + 0.025],
        });
    m.add(box([0.003, 0.18, 0.002]), 0xe8e4d8, { at: [cx, cy - 0.53, FACE + 0.025] });
    m.add(box([0.06, 0.012, 0.016], 0.003), P.white, { at: [cx + 0.17, cy - 0.65, FACE + 0.03] });
  }
  // the board: its sisal edge, the black number ring, the segments
  const base = zb - 0.04;
  m.add(cyl(0.226, 0.226, 0.04, 40), 0x1b1a19, { at: [cx, cy, base], rot: [Math.PI / 2, 0, 0] });
  const R = { bull: 0.00635, outer: 0.0159, t0: 0.099, t1: 0.107, d0: 0.162, d1: 0.17 };
  const blacks: BufferGeometry[] = [];
  const creams: BufferGeometry[] = [];
  const reds: BufferGeometry[] = [];
  const greens: BufferGeometry[] = [];
  const z = zb + 0.0005;
  for (let i = 0; i < 20; i++) {
    const a0 = ((i - 0.5) / 20) * Math.PI * 2;
    const a1 = ((i + 0.5) / 20) * Math.PI * 2;
    const dark = i % 2 === 0; // (20 at the top: black)
    (dark ? blacks : creams).push(sector(cx, cy, z, R.outer, R.t0, a0, a1), sector(cx, cy, z, R.t1, R.d0, a0, a1));
    (dark ? reds : greens).push(sector(cx, cy, z, R.t0, R.t1, a0, a1), sector(cx, cy, z, R.d0, R.d1, a0, a1));
  }
  m.add(merged(blacks), 0x1d1c1b);
  m.add(merged(creams), 0xe8dcc0);
  m.add(merged(reds), 0xc23028);
  m.add(merged(greens), 0x2f7a43);
  m.add(cyl(R.outer, R.outer, 0.001, 16), 0x2f7a43, { at: [cx, cy, z], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(R.bull, R.bull, 0.0015, 12), 0xc23028, { at: [cx, cy, z], rot: [Math.PI / 2, 0, 0] });
  // the spider: its rings and its spokes, silver wire
  for (const r of [R.outer, R.t0, R.t1, R.d0, R.d1])
    m.add(ring(r, 0.0011, 3, 40).rotateX(Math.PI / 2), P.alum, { at: [cx, cy, z + 0.0012] });
  for (let i = 0; i < 20; i++) {
    const a = ((i - 0.5) / 20) * Math.PI * 2;
    const r = (R.outer + R.d1) / 2;
    m.add(box([0.0018, R.d1 - R.outer, 0.0018]), P.alum, {
      at: [cx + Math.sin(a) * r, cy + Math.cos(a) * r, z + 0.0012],
      rot: [0, 0, -a],
    });
  }
  // the numbers round it (each a little block of wire)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    m.add(box([0.016, 0.012, 0.002]), P.alum, {
      at: [cx + Math.sin(a) * 0.198, cy + Math.cos(a) * 0.198, z + 0.001],
      rot: [0, 0, -a],
    });
  }
  // the darts in it: where they were thrown (the game's: plan 68 phase 23), else where its seed
  // threw three
  const fl = [[0xc4402b, P.mustard, 0x2f6fbf][Math.floor(o.seed * 3) % 3], P.ink];
  const thrown = (o as GameLook).darts;
  for (let k = 0; k < (thrown ? thrown.length : 3); k++) {
    const good = o.seed > 0.6;
    const a = good ? (rnd(k, 1, o.seed) - 0.5) * 0.25 : rnd(k, 1, o.seed) * Math.PI * 2;
    const r = good ? 0.103 : 0.03 + rnd(k, 2, o.seed) * 0.13;
    const [x, y] = thrown ? [cx + thrown[k][0], cy + thrown[k][1]] : [cx + Math.sin(a) * r, cy + Math.cos(a) * r];
    const tilt: V3 = [(rnd(k, 3, o.seed) - 0.5) * 0.15, (rnd(k, 4, o.seed) - 0.5) * 0.15, 0];
    m.add(rod(0.0012, 0.0012, 0.03, "z", 4), P.chrome, { at: [x, y, z + 0.015], rot: tilt });
    m.add(rod(0.0035, 0.0035, 0.05, "z", 8), P.alumDark, { at: [x, y, z + 0.055], rot: tilt });
    m.add(rod(0.002, 0.002, 0.04, "z", 5), P.ink, { at: [x, y, z + 0.1], rot: tilt });
    for (const turn of [0, Math.PI / 2])
      m.add(box([0.034, 0.002, 0.035]), fl[0], { at: [x, y, z + 0.115], rot: [tilt[0], tilt[1], turn] });
  }
}

// ── the chess table (2×1, a chair each end) ───────────────────────────────────────────────────────
/** (plan 68 phases 23–24) A game piece's look, its game with it: the chess table's position (64
 *  squares, a8 first: a piece's letter or ""), the dartboard's darts (m from the bull, y up). */
export type GameLook = Look & { board?: string[]; darts?: [number, number][] };
type Piece = "p" | "r" | "n" | "b" | "q" | "k";
/** A Staunton piece turned in its wood, `s` its scale (the king 0.085 m tall), white or black. */
function piece(m: Model, kind: Piece, x: number, y: number, z: number, c: number, face: number) {
  const s = 1;
  const at: V3 = [x, y, z];
  const L = (pts: [number, number][]) =>
    lathe(
      pts.map(([r, h]) => [r * s, h * s] as [number, number]),
      6,
    );
  const base: [number, number][] = [
    [0.019, 0],
    [0.019, 0.006],
    [0.015, 0.01],
  ];
  if (kind === "p") {
    m.add(
      L([
        [0.016, 0],
        [0.016, 0.005],
        [0.012, 0.009],
        [0.007, 0.026],
        [0.011, 0.029],
        [0.006, 0.031],
        [0, 0.031],
      ]),
      c,
      { at },
    );
    m.add(ball(0.0095, 6), c, { at: [x, y + 0.038, z] });
  } else if (kind === "r") {
    m.add(L([...base, [0.012, 0.032], [0.016, 0.036], [0.016, 0.05], [0.012, 0.05], [0.012, 0.046], [0, 0.046]]), c, {
      at,
    });
    for (let i = 0; i < 4; i++)
      m.add(box([0.007, 0.007, 0.007]), c, {
        at: [x + Math.cos(i * 1.57 + 0.78) * 0.012, y + 0.052, z + Math.sin(i * 1.57 + 0.78) * 0.012],
      });
  } else if (kind === "n") {
    m.add(L([...base, [0.013, 0.016], [0, 0.016]]), c, { at });
    const head = extrude(
      [
        [-0.012, 0],
        [0.014, 0],
        [0.012, 0.016],
        [0.02, 0.026],
        [0.018, 0.034],
        [0.006, 0.046],
        [0.002, 0.052],
        [-0.004, 0.046],
        [-0.014, 0.03],
      ],
      0.013,
      0.002,
    );
    m.add(head, c, { at: [x, y + 0.014, z], rot: [0, face, 0] });
  } else if (kind === "b") {
    m.add(L([...base, [0.009, 0.034], [0.013, 0.037], [0.008, 0.04], [0, 0.04]]), c, { at });
    m.add(ball(0.011, 6), c, { at: [x, y + 0.05, z], scale: [1, 1.35, 1] });
    m.add(ball(0.004, 4), c, { at: [x, y + 0.066, z] });
  } else {
    const tall = kind === "k";
    m.add(
      L([
        ...base,
        [0.01, 0.045],
        [0.016, 0.05],
        [0.009, 0.054],
        [0.013, tall ? 0.068 : 0.064],
        [0.007, tall ? 0.072 : 0.066],
        [0, tall ? 0.072 : 0.066],
      ]),
      c,
      { at },
    );
    if (tall) {
      m.add(box([0.004, 0.016, 0.004]), c, { at: [x, y + 0.08, z] });
      m.add(box([0.012, 0.004, 0.004]), c, { at: [x, y + 0.082, z], rot: [0, face, 0] });
    } else m.add(ball(0.006, 6), c, { at: [x, y + 0.071, z] });
  }
}

/** A chair facing `dir` (+1: toward +x): its seat at `top`, its back behind it. */
function chessChair(
  m: Model,
  x: number,
  z: number,
  dir: number,
  frame: number,
  seat: number,
  look: number,
  top: number,
) {
  const sx = x; // the seat's middle
  const back = sx - dir * 0.2;
  if (look === 1) {
    // a park bistro chair: bent steel, a slatted seat and back
    for (const [dx, dz] of [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17],
    ])
      m.add(cyl(0.012, 0.012, top - 0.02, 8), frame, { at: [sx + dx, 0, z + dz], rot: [dz * 0.15, 0, -dx * 0.15] });
    for (let i = 0; i < 5; i++)
      m.add(box([0.4, 0.018, 0.06], 0.004), seat, { at: [sx, top - 0.01, z - 0.16 + i * 0.08] });
    for (const dz of [-0.17, 0.17])
      m.add(
        tube(
          [
            [back, top - 0.02, z + dz],
            [back - dir * 0.02, top + 0.2, z + dz],
            [back - dir * 0.04, top + 0.42, z + dz],
          ],
          0.011,
          6,
          6,
        ),
        frame,
      );
    for (let i = 0; i < 3; i++)
      m.add(box([0.02, 0.06, 0.38], 0.004), seat, {
        at: [back - dir * (0.025 + i * 0.006), top + 0.22 + i * 0.075, z],
        rot: [0, 0, dir * 0.1],
      });
    return;
  }
  for (const [dx, dz] of [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ])
    m.add(box([0.035, top - 0.04, 0.035], 0.004), frame, { at: [sx + dx, (top - 0.04) / 2, z + dz] });
  for (const dz of [-0.17, 0.17]) m.add(box([0.36, 0.025, 0.02]), frame, { at: [sx, 0.16, z + dz] });
  m.add(box([0.42, 0.035, 0.42], 0.006), frame, { at: [sx, top - 0.055, z] });
  m.add(cushion([0.4, 0.04, 0.4], 0.25), seat, { at: [sx, top - 0.02, z] });
  // the back: its two posts, the rails, three spindles
  for (const dz of [-0.17, 0.17])
    m.add(box([0.035, 0.46, 0.035], 0.004), frame, { at: [back, top + 0.19, z + dz], rot: [0, 0, dir * 0.08] });
  m.add(box([0.03, 0.08, 0.38], 0.006), frame, { at: [back - dir * 0.02, top + 0.38, z], rot: [0, 0, dir * 0.08] });
  for (const dz of [-0.08, 0, 0.08])
    m.add(cyl(0.008, 0.008, 0.26, 6), frame, { at: [back - dir * 0.003, top + 0.06, z + dz], rot: [0, 0, dir * 0.08] });
}

/** A pedestal table with the board inlaid, the men set up (or a game begun, by its seed), a chess
 *  clock on the side; a chair at each end, the two players facing across it. */
function chessTable(m: Model, o: Look) {
  const v = o.look;
  const top = [P.walnut, 0x8f9093, 0x1c1a19][v] ?? P.walnut;
  const ped = [P.walnutDark, 0x7a7b7e, 0x141312][v] ?? P.walnutDark;
  const dark = [0x4a2c1b, 0x2a2b2e, 0x3a2a20][v] ?? 0x4a2c1b;
  const light = [0xd9b98a, 0xe6e2da, 0xe0c9a0][v] ?? 0xd9b98a;
  const { x0, z0, sq } = PLAY.chess_table;
  const TT = PLAY.chess_table.top - 0.0025; // (the table's top, the board inlaid flush over it)
  const [cx, cz] = [1, 0.5];
  m.add(box([0.62, 0.035, 0.82], v === 1 ? 0.012 : 0.006), top, { at: [cx, TT - 0.0195, cz] });
  m.add(box([0.56, 0.06, 0.76]), shade(top, 0.8), { at: [cx, TT - 0.065, cz] });
  // the column and its feet
  m.add(
    lathe(
      v === 1
        ? [
            [0.13, 0],
            [0.12, 0.06],
            [0.07, 0.1],
            [0.07, 0.6],
            [0.11, 0.64],
            [0.0, 0.64],
          ]
        : [
            [0.06, 0.06],
            [0.05, 0.12],
            [0.035, 0.2],
            [0.045, 0.32],
            [0.035, 0.44],
            [0.035, 0.6],
            [0.06, 0.64],
            [0.0, 0.64],
          ],
      12,
    ),
    ped,
    { at: [cx, 0, cz] },
  );
  if (v !== 1)
    for (const [dx, dz, rot] of [
      [0, 0.17, 0],
      [0, -0.17, 0],
    ] as const)
      m.add(box([0.06, 0.07, 0.34], 0.01), ped, { at: [cx + dx, 0.035, cz + dz], rot: [0, rot, 0] });
  if (v !== 1) m.add(box([0.36, 0.06, 0.06], 0.01), ped, { at: [cx, 0.03, cz] });
  // the board: its frame, the squares (a1 dark, at low x and low z)
  m.add(box([8 * sq + 0.024, 0.002, 8 * sq + 0.024]), shade(dark, 0.8), { at: [cx, TT + 0.001, cz] });
  m.add(box([8 * sq, 0.002, 8 * sq]), dark, { at: [cx, TT + 0.0015, cz] });
  const lit: V3[][] = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++)
      if ((r + f) % 2 === 1) {
        const [a, b] = [x0 + r * sq, z0 + f * sq];
        const y = TT + 0.0026;
        lit.push([
          [a, y, b],
          [a + sq, y, b],
          [a + sq, y, b + sq],
          [a, y, b + sq],
        ]);
      }
  m.add(quads(lit), light);
  // the men
  const white = [0xeadcc0, 0xf0ece4, 0xe9d2a8][v] ?? 0xeadcc0;
  const black = [0x2b211c, 0x26272a, 0x8a1e22][v] ?? 0x2b211c;
  const BACK: Piece[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const at = (r: number, f: number): [number, number] => [x0 + (r + 0.5) * sq, z0 + (f + 0.5) * sq];
  const begun = o.seed > 0.5;
  const board = (o as GameLook).board;
  // (a game on it: its position, a8 first — rank 8 is the black end, at high x — plan 68 phase 24)
  if (board)
    board.forEach((c, i) => {
      if (!c) return;
      const [x, z] = at(7 - Math.floor(i / 8), i % 8);
      const w = c === c.toUpperCase();
      piece(m, c.toLowerCase() as Piece, x, TT + 0.003, z, w ? white : black, w ? 0 : Math.PI);
    });
  for (let f = 0; f < 8 && !board; f++) {
    for (const [r, k, c, face] of [
      [0, BACK[f], white, 0],
      [7, BACK[f], black, Math.PI],
    ] as const) {
      const [x, z] = at(r, f);
      piece(m, k, x, TT + 0.003, z, c, face);
    }
    const pw = begun && f === 4 ? 3 : 1;
    const pb = begun && f === 4 ? 4 : 6;
    const [wx, wz] = at(pw, f);
    const [bx, bz] = at(pb, f);
    piece(m, "p", wx, TT + 0.003, wz, white, 0);
    piece(m, "p", bx, TT + 0.003, bz, black, Math.PI);
  }
  // (story) the clock on the near side, its two faces and buttons
  if (o.seed > 0.3) {
    const z = cz + 0.33;
    m.add(box([0.17, 0.07, 0.07], 0.008), [P.walnutDark, 0x2b2b2e, 0x8a1e22][v] ?? P.walnutDark, {
      at: [cx, TT + 0.035, z],
    });
    for (const s of [-1, 1]) {
      m.add(cyl(0.024, 0.024, 0.004, 16), P.cream, {
        at: [cx + s * 0.04, TT + 0.04, z + 0.036],
        rot: [Math.PI / 2, 0, 0],
      });
      m.add(box([0.0015, 0.016, 0.002]), P.ink, { at: [cx + s * 0.04, TT + 0.046, z + 0.04], rot: [0, 0, s * 0.6] });
      m.add(cyl(0.008, 0.008, s < 0 ? 0.016 : 0.006, 8), P.chrome, { at: [cx + s * 0.04, TT + 0.07, z] });
    }
  }
  // the chairs, a player each end
  const fr = [P.walnut, 0x2f4a3a, 0x1c1a19][v] ?? P.walnut;
  const st = [0x5e2a24, 0x3f5e4a, 0xa8282c][v] ?? 0x5e2a24;
  const [[sx0, sz0], [sx1, sz1]] = PLAY.chess_table.seats;
  chessChair(m, sx0, sz0, 1, fr, st, v, PLAY.chess_table.seat);
  chessChair(m, sx1, sz1, -1, fr, st, v, PLAY.chess_table.seat);
}

// ── the pinball machine (1×2) ─────────────────────────────────────────────────────────────────────
/** A cabinet on chrome legs, its playfield under glass tilted up to the backbox: flippers and their
 *  slingshots, three pop bumpers (their caps flashing), a wire ramp, drop targets, inserts lit in
 *  chases, the ball by the plunger; the backbox's art lit with its bulbs chasing round it and the
 *  orange dot display under it. Cosmic, pirate or seventies art. */
function pinball(m: Model, o: Look) {
  const v = o.look;
  const body = [0x2b1e4a, 0x5a1a1a, 0xe08a2a][v] ?? 0x2b1e4a;
  const art = [0x26c6da, P.mustard, 0x7a3b1a][v] ?? 0x26c6da;
  const art2 = [0xff5fa8, 0xe9e6df, P.cream][v] ?? 0xff5fa8;
  const pf = [0x1a1440, 0x2a3a6a, 0xf0d8a8][v] ?? 0x1a1440;
  const lampC = [
    [0xff5fa8, 0x26e0f0, 0xffd24a],
    [0xff4a3a, 0xffd24a, 0xffffff],
    [0xff7a2a, 0xffd24a, 0x7fe08a],
  ][v] ?? [0xff5fa8, 0x26e0f0, 0xffd24a];
  // the playfield's frame: its front middle, tilted up toward the back
  const [FZ, FY, BZ, BY] = [1.62, 0.905, 0.55, 1.03];
  const tilt = Math.atan2(BY - FY, FZ - BZ);
  const len = Math.hypot(BY - FY, FZ - BZ);
  const base = mat([0.5, FY, FZ], [tilt, 0, 0]);
  const pfAdd = framed(m, base);
  const yAt = (z: number) => FY + (FZ - z) * Math.tan(tilt);
  // the cabinet: its body to the playfield, its sides proud of it, the lockdown bar
  side(
    m,
    [
      [1.75, 0.66],
      [1.75, yAt(1.75) - 0.006],
      [0.3, yAt(0.3) - 0.006],
      [0.3, 0.8],
    ],
    0.5,
    0.66,
    shade(body, 0.75),
  );
  for (const x of [0.155, 0.845])
    side(
      m,
      [
        [1.76, 0.65],
        [1.76, yAt(1.76) + 0.05],
        [0.29, yAt(0.29) + 0.05],
        [0.29, 0.79],
      ],
      x,
      0.03,
      body,
    );
  // the side art: two bands rising along the slope
  for (const x of [0.139, 0.861])
    for (const [dy, c, w] of [
      [-0.05, art, 0.05],
      [-0.1, art2, 0.018],
    ] as const)
      m.add(box([0.003, w, 1.36]), c, { at: [x, (yAt(1.03) + 0.76) / 2 + 0.06 + dy, 1.03], rot: [tilt + 0.04, 0, 0] });
  m.add(box([0.74, 0.03, 0.06], 0.008), P.chrome, { at: [0.5, yAt(1.73) + 0.06, 1.73] });
  // the front: the coin door, its slots lit, a start button
  m.add(box([0.66, yAt(1.75) - 0.66, 0.012]), shade(body, 0.9), { at: [0.5, (yAt(1.75) + 0.66) / 2, 1.755] });
  m.add(box([0.3, 0.17, 0.01], 0.003), 0x18181b, { at: [0.5, 0.77, 1.765] });
  for (const x of [0.45, 0.55]) m.add(box([0.03, 0.05, 0.004]), 0xff4a3a, { at: [x, 0.8, 1.771], glow: true });
  m.add(cyl(0.014, 0.014, 0.012, 10), lampC[2], { at: [0.24, 0.85, 1.76], rot: [Math.PI / 2, 0, 0], glow: true });
  // the flipper buttons, the plunger
  for (const x of [0.135, 0.865]) m.add(rod(0.012, 0.012, 0.02, "x", 10), P.white, { at: [x, 0.86, 1.62] });
  m.add(rod(0.006, 0.006, 0.08, "z", 8), P.chrome, { at: [0.78, 0.84, 1.79] });
  m.add(ball(0.018, 8), [P.ink, 0xc4402b, P.ink][v] ?? P.ink, { at: [0.78, 0.84, 1.83], scale: [1, 1, 0.7] });
  // the legs and their plates
  for (const [x, z, h] of [
    [0.19, 1.68, 0.66],
    [0.81, 1.68, 0.66],
    [0.19, 0.38, 0.8],
    [0.81, 0.38, 0.8],
  ]) {
    m.add(box([0.05, h, 0.05], 0.006), P.chrome, { at: [x, h / 2, z] });
    m.add(box([0.075, 0.12, 0.075], 0.006), P.chrome, { at: [x, h - 0.05, z] });
    m.add(cyl(0.03, 0.032, 0.02, 8), P.rubber, { at: [x, 0, z] });
  }
  // the playfield: its colour, the art on it, the apron
  pfAdd(box([0.62, 0.008, len]), pf, { at: [0, -0.004, -len / 2] });
  pfAdd(cyl(0.16, 0.16, 0.002, 24), art, { at: [0, 0, -0.55] });
  pfAdd(cyl(0.11, 0.11, 0.003, 24), art2, { at: [0, 0, -0.55], tone: 0.9 });
  pfAdd(box([0.6, 0.003, 0.03]), art2, { at: [0, 0, -0.33] });
  pfAdd(box([0.6, 0.012, 0.07], 0.004), [0x18181b, P.cream, 0x18181b][v] ?? 0x18181b, { at: [0, 0.006, -0.035] });
  for (const x of [-0.18, 0.18]) pfAdd(box([0.09, 0.002, 0.05]), P.paperWhite, { at: [x, 0.013, -0.035] });
  // the flippers, white with their red rubbers, resting down toward the drain
  const flip: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 + (i / 8) * Math.PI;
    flip.push([Math.cos(a) * 0.013, Math.sin(a) * 0.013]);
  }
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    flip.push([0.068 + Math.cos(a) * 0.006, Math.sin(a) * 0.006]);
  }
  for (const s of [-1, 1]) {
    const g = extrude(flip, 0.02, 0.002).rotateX(-Math.PI / 2);
    const yaw = s < 0 ? -0.52 : -(Math.PI - 0.52);
    pfAdd(g, P.white, { at: [s * 0.075, 0.01, -0.13], rot: [0, yaw, 0] });
    pfAdd(
      extrude(
        flip.map(([x, y]) => [x * 1.06, y * 1.25] as [number, number]),
        0.008,
      ).rotateX(-Math.PI / 2),
      0xd8322b,
      {
        at: [s * 0.075, 0.01, -0.13],
        rot: [0, yaw, 0],
      },
    );
    pfAdd(cyl(0.005, 0.005, 0.03, 6), P.chrome, { at: [s * 0.075, 0, -0.13] });
    // the slingshot over it, and its inlane's guide
    pfAdd(
      extrude(
        [
          [0, 0],
          [0.05 * -s, 0.03],
          [0, 0.11],
        ],
        0.03,
        0.003,
      ).rotateX(-Math.PI / 2),
      P.white,
      { at: [s * 0.16, 0.015, -0.2] },
    );
    pfAdd(
      tube(
        [
          [s * 0.24, 0.012, -0.12],
          [s * 0.21, 0.012, -0.2],
          [s * 0.205, 0.012, -0.36],
        ],
        0.003,
        4,
        8,
      ),
      P.chrome,
    );
  }
  // the pop bumpers: base, body, a cap that flashes
  const pops: V3[] = [
    [-0.09, 0, -0.78],
    [0.09, 0, -0.78],
    [0, 0, -0.9],
  ];
  for (const [x, , z] of pops) {
    pfAdd(cyl(0.03, 0.03, 0.012, 14), P.white, { at: [x, 0, z] });
    pfAdd(cyl(0.022, 0.022, 0.04, 12), art, { at: [x, 0.012, z] });
    pfAdd(ring(0.026, 0.004, 3, 14), 0xd8322b, { at: [x, 0.025, z] });
    pfAdd(cyl(0.032, 0.03, 0.01, 14), shade(lampC[0], 0.45), { at: [x, 0.052, z] });
  }
  m.live(
    merged(pops.map(([x, , z]) => placed(cyl(0.033, 0.031, 0.011, 14), base, [x, 0.0515, z]))),
    lampC[0],
    { kind: "blink", period: 0.7, on: 0.45, phase: o.seed },
    { glow: true },
  );
  // the wire ramp up the left, the drop targets on the right, the top arch, the plunger's lane
  for (const dx of [-0.018, 0.018])
    pfAdd(
      tube(
        [
          [-0.2 + dx, 0.02, -0.4],
          [-0.22 + dx, 0.05, -0.6],
          [-0.18 + dx, 0.08, -0.8],
          [-0.08 + dx, 0.09, -0.98],
          [0.05 + dx, 0.07, -1.0],
        ],
        0.0025,
        4,
        16,
      ),
      P.chrome,
    );
  for (const x of [-0.2, -0.13, -0.08, 0.05])
    pfAdd(cyl(0.003, 0.003, [0.02, 0.06, 0.09, 0.07][[-0.2, -0.13, -0.08, 0.05].indexOf(x)], 4), P.chrome, {
      at: [x, 0, [-0.4, -0.75, -0.97, -1.0][[-0.2, -0.13, -0.08, 0.05].indexOf(x)]],
    });
  for (let i = 0; i < 3; i++)
    pfAdd(box([0.03, 0.04, 0.008]), lampC[1], { at: [0.2, 0.02, -0.5 - i * 0.04], rot: [0, Math.PI / 2, 0] });
  const arc: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    arc.push([Math.cos(a) * 0.29, 0.015, -len + 0.3 + Math.sin(a) * 0.27]);
  }
  pfAdd(tube(arc, 0.006, 4, 16), P.chrome);
  pfAdd(box([0.008, 0.03, 0.8]), P.chrome, { at: [0.255, 0.015, -0.42] });
  // the ball, in the lane by the plunger or on a flipper
  pfAdd(ball(0.0135, 10), P.chrome, { at: o.seed > 0.5 ? [0.28, 0.0135, -0.06] : [-0.05, 0.0335, -0.15] });
  // the inserts: round and arrow lamps in sets, dim under, lit in a chase
  const inserts: { at: V3; c: number; set: number; arrow: boolean }[] = [];
  for (let i = 0; i < 5; i++)
    inserts.push({ at: [-0.12 + i * 0.06, 0.0012, -0.27], c: lampC[1], set: i % 3, arrow: false });
  for (let i = 0; i < 4; i++)
    inserts.push({
      at: [-0.09 + i * 0.06, 0.0012, -0.42 - (i % 2) * 0.03],
      c: lampC[2],
      set: (i + 1) % 3,
      arrow: true,
    });
  for (let i = 0; i < 3; i++)
    inserts.push({ at: [-0.05 + i * 0.05, 0.0012, -0.66], c: lampC[0], set: (i + 2) % 3, arrow: false });
  const shape = (arrow: boolean) =>
    arrow
      ? extrude(
          [
            [0, 0.022],
            [0.012, 0],
            [-0.012, 0],
          ],
          0.002,
        ).rotateX(-Math.PI / 2)
      : cyl(0.011, 0.011, 0.002, 12);
  for (const p of inserts) pfAdd(shape(p.arrow), shade(p.c, 0.4), { at: p.at });
  for (let k = 0; k < 3; k++) {
    const mine = inserts.filter((p) => p.set === k);
    for (const c of new Set(mine.map((p) => p.c)))
      m.live(
        merged(
          mine.filter((p) => p.c === c).map((p) => placed(shape(p.arrow), base, [p.at[0], p.at[1] + 0.0008, p.at[2]])),
        ),
        c,
        { kind: "blink", period: 0.9, on: 0.38, phase: k / 3 },
        { glow: true },
      );
  }
  // the glass over it all: only its sheen and the channels it slides in (so the field reads)
  pfAdd(box([0.004, 0.0015, len * 0.8]), 0xffffff, { at: [-0.18, 0.062, -len / 2], rot: [0, 0.35, 0], tone: 0.9 });
  pfAdd(box([0.004, 0.0015, len * 0.5]), 0xffffff, {
    at: [-0.13, 0.062, -len / 2 + 0.1],
    rot: [0, 0.35, 0],
    tone: 0.9,
  });
  // the backbox: its cabinet, the backglass's art lit, its bulbs chasing round, the display
  const [BZ0, BZ1, BY0, BY1] = [0.28, 0.54, yAt(0.54) + 0.02, 1.95];
  m.add(box([0.7, BY1 - BY0, BZ1 - BZ0], 0.012), body, { at: [0.5, (BY0 + BY1) / 2, (BZ0 + BZ1) / 2] });
  m.add(box([0.72, 0.03, BZ1 - BZ0 + 0.02], 0.006), P.chrome, { at: [0.5, BY1 + 0.005, (BZ0 + BZ1) / 2] });
  const gl = BZ1 + 0.002;
  const [gy0, gy1] = [BY0 + 0.27, BY1 - 0.04];
  const gmid = (gy0 + gy1) / 2;
  m.add(box([0.62, gy1 - gy0, 0.004]), [0x3a1a6a, 0xc4502b, 0xffb347][v] ?? 0x3a1a6a, {
    at: [0.5, gmid, gl],
    glow: true,
    tone: 0.75,
  });
  if (v === 0) {
    m.add(cyl(0.12, 0.12, 0.003, 24), 0x26c6da, {
      at: [0.5, gmid, gl + 0.002],
      rot: [Math.PI / 2, 0, 0],
      glow: true,
      tone: 0.85,
    });
    m.add(
      ring(0.17, 0.01, 3, 28)
        .scale(1, 1, 0.35)
        .rotateZ(0.3)
        .rotateX(Math.PI / 2),
      0xff5fa8,
      { at: [0.5, gmid, gl + 0.006], glow: true },
    );
    for (let i = 0; i < 9; i++)
      m.add(box([0.012, 0.012, 0.002]), P.white, {
        at: [0.22 + rnd(i, 1, 2) * 0.56, gy0 + 0.03 + rnd(i, 2, 2) * (gy1 - gy0 - 0.06), gl + 0.004],
        glow: true,
      });
  } else if (v === 1) {
    m.add(
      extrude(
        [
          [-0.2, 0.03],
          [0.22, 0.03],
          [0.18, -0.04],
          [-0.15, -0.04],
        ],
        0.003,
      ),
      0x3a1f10,
      { at: [0.5, gmid - 0.1, gl + 0.003], glow: true, tone: 0.6 },
    );
    for (let i = 0; i < 9; i++)
      m.add(box([0.02, 0.012, 0.003]), 0x1a0f08, {
        at: [0.36 + i * 0.033, gmid - 0.135, gl + 0.004],
        glow: true,
        tone: 0.6,
      });
    for (const [x, h] of [
      [0.42, 0.24],
      [0.56, 0.3],
    ]) {
      m.add(box([0.008, h, 0.003]), 0x3a1f10, { at: [x, gmid - 0.07 + h / 2, gl + 0.003], glow: true, tone: 0.6 });
      m.add(box([0.11, h * 0.55, 0.003]), P.cream, { at: [x, gmid - 0.02 + h * 0.3, gl + 0.004], glow: true });
    }
    m.add(ball(0.03, 8), 0xffd24a, { at: [0.72, gmid + 0.12, gl], scale: [1, 1, 0.1], glow: true });
  } else {
    for (let i = 0; i < 4; i++)
      m.add(box([0.62, 0.035, 0.003]), [0xd8322b, 0xff7a2a, 0xffd24a, P.cream][i], {
        at: [0.5, gy0 + 0.04 + i * 0.05, gl + 0.003],
        glow: true,
      });
    m.add(cyl(0.09, 0.09, 0.003, 20), 0xffd24a, {
      at: [0.5, gmid + 0.06, gl + 0.005],
      rot: [Math.PI / 2, 0, 0],
      glow: true,
    });
  }
  const bulbs: V3[] = [];
  for (let i = 0; i < 9; i++) for (const y of [gy0 - 0.012, gy1 + 0.012]) bulbs.push([0.2 + i * 0.075, y, gl + 0.006]);
  for (let i = 1; i < 5; i++) for (const x of [0.17, 0.83]) bulbs.push([x, gy0 + ((gy1 - gy0) * i) / 5, gl + 0.006]);
  chase(m, bulbs, lampC[2], 3, 0.008, 1.1);
  // the display and the speakers
  const dy = BY0 + 0.13;
  m.add(box([0.66, 0.24, 0.004]), 0x18181b, { at: [0.5, dy, gl] });
  m.add(box([0.3, 0.075, 0.003]), 0x2a1408, { at: [0.5, dy, gl + 0.002] });
  const score = dotsAt(String(1000 + Math.floor(o.seed * 8999) * 10), 0.5, dy, gl + 0.004, 0.0055);
  if (score) m.add(score, 0xff8a2a, { glow: true });
  for (const x of [0.25, 0.75]) {
    m.add(cyl(0.06, 0.06, 0.004, 16), 0x0c0c0e, { at: [x, dy, gl], rot: [Math.PI / 2, 0, 0] });
    m.add(ring(0.06, 0.004, 3, 16).rotateX(Math.PI / 2), P.chrome, { at: [x, dy, gl + 0.003] });
  }
}

// ── the claw machine (1×1) ────────────────────────────────────────────────────────────────────────
/** A crane game: its cabinet, under its glass a heap of plush — bears, bunnies, ducks — the prize
 *  chute in a corner, the claw on its gantry swinging a little where it was left; the stick, the
 *  button and the coin slot lit; the prize flap; its marquee and its light lit. */
function clawMachine(m: Model, o: Look) {
  const v = o.look;
  const body = [0xf08bb4, 0x8fd8c0, 0x1c1c22][v] ?? 0xf08bb4;
  const trim = [P.white, P.cream, 0xff3ac0][v] ?? P.white;
  const glow = [0xfff0f6, 0xf6fff8, 0x46e8ff][v] ?? 0xfff0f6;
  const [X0, X1, Z0, Z1] = [0.09, 0.91, 0.1, 0.9];
  const [cx, cz] = [(X0 + X1) / 2, (Z0 + Z1) / 2];
  const [GY0, GY1] = [0.86, 1.72];
  // the base cabinet, its ledge with the controls, the prize flap
  m.add(box([X1 - X0, GY0 - 0.04, Z1 - Z0], 0.015, 2), body, { at: [cx, (GY0 - 0.04) / 2 + 0.02, cz] });
  m.add(box([X1 - X0 + 0.01, 0.04, Z1 - Z0 + 0.01], 0.008), P.ink, { at: [cx, 0.02, cz] });
  m.add(box([X1 - X0, 0.05, 0.16], 0.01), trim, { at: [cx, GY0 - 0.06, Z1 - 0.03] });
  m.add(box([X1 - X0 - 0.06, 0.03, 0.12], 0.008), shade(body, 0.8), { at: [cx, GY0 - 0.025, Z1 + 0.0] });
  m.add(cyl(0.022, 0.022, 0.01, 10), P.ink, { at: [0.33, GY0 - 0.01, Z1] });
  m.add(cyl(0.006, 0.006, 0.07, 6), P.chrome, { at: [0.33, GY0 - 0.01, Z1] });
  m.add(ball(0.02, 8), 0xd8322b, { at: [0.33, GY0 + 0.07, Z1] });
  m.add(cyl(0.032, 0.032, 0.012, 14), shade(body, 0.6), { at: [0.6, GY0 - 0.01, Z1] });
  m.add(cyl(0.026, 0.026, 0.016, 14), 0xffd24a, { at: [0.6, GY0 - 0.006, Z1], glow: true });
  m.add(box([0.05, 0.08, 0.006]), P.ink, { at: [0.78, GY0 - 0.25, Z1 + 0.003] });
  m.add(box([0.006, 0.04, 0.004]), 0xff4a3a, { at: [0.78, GY0 - 0.24, Z1 + 0.007], glow: true });
  m.add(box([0.26, 0.2, 0.012], 0.004), P.ink, { at: [0.3, 0.3, Z1 + 0.004] });
  m.add(box([0.22, 0.16, 0.008]), 0x26262a, { at: [0.3, 0.3, Z1 + 0.01] });
  // its front panel art: a big heart, or WIN
  const sym = v === 1 ? dotsAt("WIN", 0.64, 0.42, Z1 + 0.003, 0.016) : dotsAt("*", 0.64, 0.42, Z1 + 0.003, 0.04);
  if (sym) m.add(sym, trim);
  // the corner posts, the top, the marquee lit
  for (const x of [X0 + 0.025, X1 - 0.025])
    for (const z of [Z0 + 0.025, Z1 - 0.025])
      m.add(box([0.05, GY1 - GY0, 0.05], 0.008), trim, { at: [x, (GY0 + GY1) / 2, z] });
  m.add(box([X1 - X0, 0.26, Z1 - Z0], 0.015, 2), body, { at: [cx, GY1 + 0.13, cz] });
  m.add(box([X1 - X0 - 0.08, 0.18, 0.006]), shade(glow, 0.9), { at: [cx, GY1 + 0.13, Z1 + 0.002], glow: true });
  const word = dotsAt("PRIZES", cx, GY1 + 0.13, Z1 + 0.006, 0.019);
  if (word) m.add(word, [0xd8327a, 0x2f7a63, 0xff3ac0][v] ?? 0xd8327a, { glow: true });
  chase(
    m,
    Array.from({ length: 12 }, (_, i): V3 => [X0 + 0.06 + i * 0.064, GY1 + 0.245, Z1 + 0.006]),
    [0xffd24a, 0xff5fa8, 0x46e8ff][v] ?? 0xffd24a,
    2,
    0.009,
    0.8,
  );
  // inside: the floor, a lit strip under the top, the back mirrored dark, the chute
  m.add(box([X1 - X0 - 0.1, 0.01, Z1 - Z0 - 0.1]), shade(body, 0.6), { at: [cx, GY0, cz] });
  m.add(box([X1 - X0 - 0.12, 0.012, 0.03]), glow, { at: [cx, GY1 - 0.01, Z1 - 0.08], glow: true });
  m.add(box([X1 - X0 - 0.1, GY1 - GY0, 0.008]), 0x2a3640, { at: [cx, (GY0 + GY1) / 2, Z0 + 0.05] });
  m.add(box([0.2, 0.25, 0.2]), 0xcfe6ff, { at: [0.25, GY0 + 0.125, Z1 - 0.15], tone: 0.75 });
  m.add(box([0.2, 0.012, 0.2]), trim, { at: [0.25, GY0 + 0.25, Z1 - 0.15] });
  // the toys, heaped: bears, bunnies, ducks, each a colour
  const TOY = [0xf4d35e, 0xa0d8ef, 0xf6a5c0, 0xc8a2c8, 0xb5e48c, 0xf4a261, P.cream, 0x9a6b4a];
  for (let i = 0; i < 14; i++) {
    const tx = 0.42 + (i % 4) * 0.12 + rnd(i, 1, o.seed) * 0.05 - (i % 4 === 3 ? 0.04 : 0);
    const tz = 0.25 + Math.floor(i / 4) * 0.14 + rnd(i, 2, o.seed) * 0.05;
    if (tx < 0.4 && tz > 0.55) continue;
    const ty = GY0 + 0.05 + (i % 3) * 0.03 + rnd(i, 4, o.seed) * 0.03;
    const c = TOY[Math.floor(rnd(i, 3, o.seed) * TOY.length)];
    const kind = i % 3;
    const yaw = rnd(i, 5, o.seed) * 1.2 - 0.6;
    m.add(ball(0.06, 7), c, { at: [tx, ty, tz], scale: [1, 0.85, 0.9] });
    const hy = ty + 0.07;
    if (kind === 2) {
      m.add(ball(0.035, 7), c, { at: [tx, hy, tz + 0.02] });
      m.add(box([0.03, 0.012, 0.03]), 0xf08a2a, { at: [tx, hy - 0.004, tz + 0.055], rot: [0, yaw, 0] });
    } else {
      m.add(ball(0.04, 7), c, { at: [tx, hy, tz] });
      m.add(ball(0.016, 6), shade(c, 1.15), { at: [tx + Math.sin(yaw) * 0.03, hy - 0.01, tz + Math.cos(yaw) * 0.032] });
      for (const s of [-1, 1])
        if (kind === 0) m.add(ball(0.014, 6), shade(c, 0.85), { at: [tx + s * 0.03, hy + 0.03, tz] });
        else
          m.add(box([0.016, 0.06, 0.01], 0.004), shade(c, 0.95), {
            at: [tx + s * 0.016, hy + 0.06, tz],
            rot: [0, 0, s * 0.2],
          });
      for (const s of [-1, 1])
        m.add(ball(0.005, 4), P.ink, {
          at: [tx + Math.sin(yaw) * 0.035 + s * 0.013 * Math.cos(yaw), hy + 0.01, tz + Math.cos(yaw) * 0.036],
        });
    }
  }
  // the gantry: two rails, its bridge, the carriage
  const gx = 0.4 + o.seed * 0.3;
  const gz = 0.32 + o.seed * 0.2;
  for (const x of [X0 + 0.06, X1 - 0.06])
    m.add(box([0.02, 0.02, Z1 - Z0 - 0.1]), P.alumDark, { at: [x, GY1 - 0.04, cz] });
  m.add(box([X1 - X0 - 0.1, 0.02, 0.03]), P.alum, { at: [cx, GY1 - 0.055, gz] });
  m.add(box([0.06, 0.04, 0.06], 0.006), P.graphite, { at: [gx, GY1 - 0.08, gz] });
  // the claw on its cable, swinging a little from the carriage (live)
  const drop = 0.32;
  const claw = [
    cyl(0.002, 0.002, drop, 4).translate(0, -drop, 0),
    lathe(
      [
        [0.001, -drop - 0.07],
        [0.025, -drop - 0.06],
        [0.03, -drop - 0.02],
        [0.018, -drop],
        [0.001, -drop + 0.005],
      ],
      10,
    ),
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    claw.push(
      tube(
        [
          [ca * 0.022, -drop - 0.05, sa * 0.022],
          [ca * 0.045, -drop - 0.09, sa * 0.045],
          [ca * 0.035, -drop - 0.14, sa * 0.035],
          [ca * 0.018, -drop - 0.16, sa * 0.018],
        ],
        0.0045,
        4,
        6,
      ),
    );
  }
  m.live(merged(claw), P.chrome, { kind: "nod", amp: 0.06, period: 2.6, phase: o.seed }, { at: [gx, GY1 - 0.1, gz] });
  // the glass: front and sides
  const gh = GY1 - GY0;
  m.live(
    merged([
      box([X1 - X0 - 0.05, gh, 0.004]).translate(cx, (GY0 + GY1) / 2, Z1 - 0.025),
      box([0.004, gh, Z1 - Z0 - 0.05]).translate(X0 + 0.025, (GY0 + GY1) / 2, cz),
      box([0.004, gh, Z1 - Z0 - 0.05]).translate(X1 - 0.025, (GY0 + GY1) / 2, cz),
    ]),
    0xe2eef4,
    { kind: "still" },
    { glass: true },
  );
}

// ── the jukebox (1×1) ─────────────────────────────────────────────────────────────────────────────
/** A forties jukebox: its arched cabinet, the glowing bands up its sides and over its top with bubbles
 *  rising in the tubes, the dome's window on the records — one on the turntable spinning — the title
 *  strips lit under it, the buttons, the speaker's fretwork grille, the coin slot. */
function jukebox(m: Model, o: Look) {
  const v = o.look;
  const wood = [P.walnut, P.cream, 0x9a1c22][v] ?? P.walnut;
  const band = [
    [0xff9a3a, 0xff4a3a, 0x7fe08a],
    [0xff7ac0, 0x6ad0ff, 0xfff0d0],
    [0xffd24a, 0xff9a3a, 0xfff0d0],
  ][v] ?? [0xff9a3a, 0xff4a3a, 0x7fe08a];
  const metal = v === 1 ? P.chrome : P.brass;
  const [cx, Z0, Z1] = [0.5, 0.22, 0.8];
  const HW = 0.4;
  const SH = 1.08; // where the arch springs
  // the cabinet, the plinth
  // (the body; over it the dome — its back set in for the window, the hood round it)
  const WR = HW - 0.14;
  const WB = Z1 - 0.18; // the window's back
  const half = (r: number, n = 14): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => [Math.cos((i / n) * Math.PI) * r, Math.sin((i / n) * Math.PI) * r]);
  m.add(
    extrude(
      [
        [HW, 0.012],
        [HW, SH],
        [-HW, SH],
        [-HW, 0.012],
      ],
      Z1 - Z0 - 0.04,
      0.012,
      2,
    ),
    wood,
    { at: [cx, 0, (Z0 + Z1) / 2 - 0.02] },
  );
  m.add(extrude(half(HW - 0.01), WB - Z0, 0.008), wood, { at: [cx, SH, (Z0 + WB) / 2] });
  m.add(extrude([...half(HW), ...half(WR).reverse()], Z1 - Z0 - 0.04, 0.012, 2), wood, {
    at: [cx, SH, (Z0 + Z1) / 2 - 0.02],
  });
  m.add(box([HW * 2 + 0.04, 0.06, Z1 - Z0 + 0.02], 0.01), metal, { at: [cx, 0.03, (Z0 + Z1) / 2] });
  // the glowing bands: up the sides (bubbles rising in them) and over the arch
  const F = Z1 - 0.02;
  for (const s of [-1, 1]) {
    const x = cx + s * (HW - 0.05);
    m.add(box([0.07, SH - 0.12, 0.03], 0.006), band[0], { at: [x, 0.12 + (SH - 0.12) / 2, F + 0.012], glow: true });
    m.add(box([0.016, SH - 0.14, 0.012]), shade(band[1], 1), { at: [x, 0.13 + (SH - 0.14) / 2, F + 0.03], glow: true });
    for (let i = 0; i < 4; i++)
      m.live(
        ball(0.011, 5),
        P.white,
        { kind: "lava", lo: 0, hi: SH - 0.2, period: 3.2 + i * 0.7, phase: (i * 0.29 + (s > 0 ? 0.13 : 0)) % 1 },
        { at: [x, 0.16, F + 0.04], glow: true },
      );
  }
  const arcPts = (r: number, z: number): V3[] =>
    Array.from({ length: 17 }, (_, i) => [
      cx + Math.cos((i / 16) * Math.PI) * r,
      SH + Math.sin((i / 16) * Math.PI) * r,
      z,
    ]);
  m.add(tube(arcPts(HW - 0.05, F + 0.015), 0.03, 6, 24), band[0], { glow: true });
  m.add(tube(arcPts(HW - 0.05, F + 0.04), 0.008, 4, 24), band[1], { glow: true });
  m.add(tube(arcPts(HW - 0.12, F + 0.01), 0.012, 4, 24), band[2], { glow: true });
  // the dome's window: the records inside, the one playing spinning
  const wy = SH;
  m.add(extrude(half(WR - 0.005), 0.004), [0xffb060, 0xffd0e8, 0xffd28a][v] ?? 0xffb060, {
    at: [cx, wy, WB + 0.004],
    glow: true,
    tone: 0.55,
  });
  m.add(
    tube(
      half(WR).map(([x, y]): V3 => [cx + x, wy + y, F - 0.008]),
      0.01,
      4,
      20,
    ),
    metal,
  );
  m.add(box([2 * WR, 0.016, F - WB]), metal, { at: [cx, wy + 0.008, (F + WB) / 2] });
  // the singles racked behind, the one playing on its platter, its label
  for (let i = 0; i < 7; i++) {
    m.add(cyl(0.085, 0.085, 0.004, 18), P.vinyl, {
      at: [cx - 0.12 + i * 0.04, wy + 0.17, WB + 0.03],
      rot: [Math.PI / 2 - 0.2, 0, 0],
      tone: 1.5,
    });
    m.add(cyl(0.028, 0.028, 0.005, 10), [0xc4402b, P.mustard, P.cream, 0x2f5f9e][i % 4], {
      at: [cx - 0.12 + i * 0.04, wy + 0.17, WB + 0.03],
      rot: [Math.PI / 2 - 0.2, 0, 0],
    });
  }
  m.add(cyl(0.02, 0.02, 0.03, 10), P.chrome, { at: [cx, wy + 0.016, F - 0.09] });
  const play = { kind: "spin", axis: "y", speed: 4.7 } as const;
  m.live(merged([cyl(0.08, 0.08, 0.003, 22), box([0.012, 0.0045, 0.004]).translate(0.06, 0, 0)]), P.vinyl, play, {
    at: [cx, wy + 0.046, F - 0.09],
  });
  m.live(cyl(0.03, 0.03, 0.0045, 12), [0xc4402b, 0xffd24a, P.cream][v] ?? 0xc4402b, play, {
    at: [cx, wy + 0.046, F - 0.09],
  });
  // the title strips under it, lit, and the buttons
  const ty = SH - 0.1;
  m.add(box([0.5, 0.14, 0.05], 0.008), metal, { at: [cx, ty, F - 0.005], rot: [-0.35, 0, 0] });
  m.add(box([0.44, 0.1, 0.004]), P.paperWhite, {
    at: [cx, ty + 0.008, F + 0.02],
    rot: [-0.35, 0, 0],
    glow: true,
    tone: 0.72,
  });
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++)
      m.add(box([0.075, 0.002, 0.002]), r % 2 ? 0xc4402b : 0x2f5f9e, {
        at: [cx - 0.17 + c * 0.085, ty + 0.045 - r * 0.024, F + 0.024 - r * 0.008],
        rot: [-0.35, 0, 0],
      });
  for (let i = 0; i < 10; i++)
    m.add(box([0.034, 0.02, 0.025], 0.004), P.cream, { at: [cx - 0.19 + i * 0.042, ty - 0.095, F + 0.012] });
  // the speaker: its fretwork grille over the cloth, lit under
  const gy = 0.48;
  m.add(box([0.52, 0.48, 0.01]), 0x2a1d14, { at: [cx, gy, F] });
  m.add(box([0.5, 0.46, 0.004]), [0x6a3b26, 0x3a5a7a, 0x3a1a1a][v] ?? 0x6a3b26, {
    at: [cx, gy, F + 0.006],
    glow: true,
    tone: 0.45,
  });
  for (let i = 0; i < 9; i++) m.add(box([0.012, 0.46, 0.012]), metal, { at: [cx - 0.24 + i * 0.06, gy, F + 0.014] });
  for (const y of [gy - 0.12, gy + 0.12]) m.add(box([0.5, 0.014, 0.014]), metal, { at: [cx, y, F + 0.02] });
  m.add(ring(0.12, 0.01, 4, 24).rotateX(Math.PI / 2), metal, { at: [cx, gy, F + 0.025] });
  m.add(box([0.6, 0.06, 0.03], 0.008), band[2], { at: [cx, 0.18, F + 0.01], glow: true });
  // the coin slot, its plate
  m.add(box([0.07, 0.1, 0.012], 0.004), metal, { at: [cx + 0.2, ty - 0.17, F + 0.015] });
  m.add(box([0.006, 0.04, 0.004]), P.ink, { at: [cx + 0.2, ty - 0.16, F + 0.022] });
  // (story) a coin left on the ledge
  if (o.seed > 0.5) m.add(cyl(0.012, 0.012, 0.003, 10), P.brass, { at: [cx - 0.15, ty - 0.045, F + 0.04] });
}

// ── the skee-ball lane (1×3) ──────────────────────────────────────────────────────────────────────
/** An alley lane rising away from the player to the hump, the rings behind it tilted up with their
 *  pockets (10 to 50, the 100s in the corners), the cage over them, the score lit up top and its
 *  bulbs chasing; nine balls in the gutter at the front. */
function skeeBall(m: Model, o: Look) {
  const v = o.look;
  const body = [0xb3262b, 0x1c1c24, 0xf2c037][v] ?? 0xb3262b;
  const trim = [P.cream, 0x26e0f0, 0xd8322b][v] ?? P.cream;
  const lane = [P.oakLight, 0x2a2a34, P.oakLight][v] ?? P.oakLight;
  const lamp = [0xffd28a, 0xff3ac0, 0xffd24a][v] ?? 0xffd28a;
  const [X0, X1] = [0.1, 0.9];
  const cx = 0.5;
  const LW = 0.56; // the lane between its sides
  // the lane: up from the front (z 2.6) to the hump (z 1.05)
  const [FZ, FY, HZ, HY] = [2.62, 0.74, 1.05, 0.96];
  const ln = Math.hypot(FZ - HZ, HY - FY);
  const la = Math.atan2(HY - FY, FZ - HZ);
  side(
    m,
    [
      [2.98, 0],
      [2.98, 0.8],
      [FZ, FY + 0.06],
      [HZ, HY + 0.08],
      [0.1, 1.2],
      [0.1, 0],
    ],
    cx,
    X1 - X0,
    shade(body, 0.75),
    {},
  );
  for (const x of [X0 + 0.015, X1 - 0.015])
    side(
      m,
      [
        [2.98, 0],
        [2.98, 0.84],
        [FZ, FY + 0.16],
        [HZ, HY + 0.2],
        [0.1, 1.5],
        [0.1, 0],
      ],
      x,
      0.03,
      body,
    );
  m.add(box([LW, 0.02, ln], 0.004), lane, { at: [cx, (FY + HY) / 2 + 0.07, (FZ + HZ) / 2], rot: [la, 0, 0] });
  for (let i = 1; i < 6; i++)
    m.add(box([0.003, 0.0015, ln]), shade(lane, 0.85), {
      at: [cx - LW / 2 + i * (LW / 6), (FY + HY) / 2 + 0.081, (FZ + HZ) / 2],
      rot: [la, 0, 0],
    });
  m.add(rod(0.05, 0.05, LW, "x", 12), lane, { at: [cx, HY + 0.05, HZ + 0.04] });
  // side stripes, lit edges
  for (const x of [X0 - 0.001, X1 + 0.001])
    m.add(box([0.003, 0.05, 2.2]), trim, { at: [x, 0.5 + (0.96 - 0.6) / 2, 1.82], rot: [la, 0, 0], glow: v === 1 });
  // the front: the ball gutter and its nine balls, the coin door
  m.add(box([LW + 0.06, 0.14, 0.32], 0.01), shade(body, 0.9), { at: [cx, 0.72, 2.8] });
  m.add(box([LW, 0.04, 0.28]), 0x1a1a1c, { at: [cx, 0.79, 2.8] });
  const ballC = [0x8a5a36, 0x46e8ff, 0xd8322b][v] ?? 0x8a5a36;
  for (let i = 0; i < 9; i++)
    m.add(ball(0.04, 10), ballC, {
      at: [cx - 0.22 + (i % 5) * 0.11 + (i > 4 ? 0.055 : 0), 0.84, 2.72 + (i > 4 ? 0.12 : 0)],
    });
  m.add(box([0.24, 0.18, 0.01], 0.004), 0x1a1a1c, { at: [cx, 0.42, 2.985] });
  for (const x of [cx - 0.04, cx + 0.04])
    m.add(box([0.026, 0.045, 0.004]), 0xff4a3a, { at: [x, 0.45, 2.99], glow: true });
  // the rings: a board tilted toward the player, its rings and pockets
  const [RZ0, RY0, RZ1, RY1] = [1.02, HY + 0.02, 0.18, 1.42];
  const ra = Math.atan2(RY1 - RY0, RZ0 - RZ1);
  const rl = Math.hypot(RY1 - RY0, RZ0 - RZ1);
  const rb = mat([cx, (RY0 + RY1) / 2, (RZ0 + RZ1) / 2], [ra, 0, 0]);
  const rAdd = framed(m, rb);
  rAdd(box([LW + 0.04, 0.02, rl]), shade(body, 0.6), { at: [0, -0.01, 0] });
  // (the rings round the 10 at the low end, up to the 50 at the top)
  const pocket = (x: number, z: number, r: number, c: number) => {
    rAdd(cyl(r, r, 0.004, 16), 0x0c0c0e, { at: [x, 0.001, z] });
    rAdd(ring(r + 0.008, 0.008, 4, 18), c, { at: [x, 0.006, z] });
  };
  for (const [r, h] of [
    [0.26, 0.06],
    [0.2, 0.08],
    [0.14, 0.1],
  ] as const)
    rAdd(ring(r, 0.012, 4, 26), trim, { at: [0, h, 0.12], scale: [1, 1, 1] });
  pocket(0, 0.12, 0.06, trim);
  pocket(0, -0.12, 0.05, lamp);
  pocket(0, -0.27, 0.045, lamp);
  for (const s of [-1, 1]) pocket(s * 0.21, -0.33, 0.04, 0xff4a3a);
  // the cage over the rings: its frame and its net
  const [CY] = [2.05];
  for (const x of [X0 + 0.02, X1 - 0.02])
    for (const z of [0.14, 1.06])
      m.add(box([0.03, CY - 0.9, 0.03], 0.004), P.alumDark, { at: [x, 0.9 + (CY - 0.9) / 2, z] });
  for (const z of [0.14, 1.06]) m.add(box([X1 - X0, 0.03, 0.03]), P.alumDark, { at: [cx, CY, z] });
  for (const x of [X0 + 0.02, X1 - 0.02]) m.add(box([0.03, 0.03, 0.92]), P.alumDark, { at: [x, CY, 0.6] });
  for (let i = 1; i < 6; i++) {
    m.add(box([0.004, CY - 1.45, 0.004]), 0x2a2a2e, { at: [X0 + 0.02, 1.45 + (CY - 1.45) / 2, 0.14 + i * 0.153] });
    m.add(box([0.004, CY - 1.45, 0.004]), 0x2a2a2e, { at: [X1 - 0.02, 1.45 + (CY - 1.45) / 2, 0.14 + i * 0.153] });
    m.add(box([X1 - X0, 0.004, 0.004]), 0x2a2a2e, { at: [cx, CY, 0.14 + i * 0.153] });
  }
  // the score box up top, lit, its bulbs chasing
  m.add(box([X1 - X0, 0.36, 0.14], 0.012), body, { at: [cx, CY + 0.2, 1.08] });
  m.add(box([0.6, 0.12, 0.004]), 0x14100c, { at: [cx, CY + 0.24, 1.152] });
  const sc = dotsAt(String(Math.floor(o.seed * 45) * 10 + 90), cx, CY + 0.24, 1.156, 0.014);
  if (sc) m.add(sc, 0xff4a3a, { glow: true });
  m.add(box([0.6, 0.08, 0.004]), shade(lamp, 0.9), { at: [cx, CY + 0.1, 1.152], glow: true });
  const word = dotsAt("ROLL", cx, CY + 0.1, 1.156, 0.011);
  if (word) m.add(word, shade(body, 0.6), {});
  chase(
    m,
    [
      ...Array.from({ length: 9 }, (_, i): V3 => [X0 + 0.04 + i * 0.09, CY + 0.36, 1.154]),
      ...Array.from({ length: 9 }, (_, i): V3 => [X0 + 0.04 + i * 0.09, CY + 0.04, 1.154]),
    ],
    lamp,
    3,
    0.012,
    0.9,
  );
}

// ── the card table (1×1) ──────────────────────────────────────────────────────────────────────────
/** A square card table: its felt (or vinyl) top in a rail, folding legs, and a game on it by its
 *  seed — a hand of cards and the deck, chips stacked, a patience laid out. */
function cardTable(m: Model, o: Look) {
  const v = o.look;
  const T = 0.74;
  const frame = [P.oak, P.walnut, P.steel][v] ?? P.oak;
  const felt = o.fabric ?? [0x2f6a43, 0x8a1e22, 0x26272b][v] ?? 0x2f6a43;
  const S = 0.86;
  m.add(box([S, 0.03, S], 0.01), frame, { at: [0.5, T - 0.03, 0.5] });
  m.add(box([S - 0.08, 0.012, S - 0.08]), felt, { at: [0.5, T - 0.006, 0.5] });
  // the rail round it (padded on the vinyl one)
  for (const s of [-1, 1]) {
    m.add(box([S, 0.016, 0.04], 0.006), v === 2 ? P.vinyl : shade(frame, 1.1), {
      at: [0.5, T - 0.008, 0.5 + s * (S / 2 - 0.02)],
    });
    m.add(box([0.04, 0.016, S - 0.08], 0.006), v === 2 ? P.vinyl : shade(frame, 1.1), {
      at: [0.5 + s * (S / 2 - 0.02), T - 0.008, 0.5],
    });
  }
  m.add(box([S - 0.06, 0.06, S - 0.06]), shade(frame, 0.8), { at: [0.5, T - 0.075, 0.5] });
  // the legs: square wooden ones, or folding steel with their braces
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const [x, z] = [0.5 + sx * (S / 2 - 0.05), 0.5 + sz * (S / 2 - 0.05)];
      if (v === 2) {
        m.add(cyl(0.012, 0.012, T - 0.1, 8), P.steel, { at: [x, 0, z] });
        m.add(rod(0.004, 0.004, 0.2, "x", 4), P.steel, { at: [x - sx * 0.08, T - 0.18, z], rot: [0, 0, sx * 0.7] });
        m.add(cyl(0.016, 0.016, 0.012, 8), P.rubber, { at: [x, 0, z] });
      } else {
        m.add(box([0.045, T - 0.1, 0.045], 0.004), frame, { at: [x, (T - 0.1) / 2, z] });
        m.add(box([0.03, 0.01, 0.03]), P.ink, { at: [x, 0.005, z] });
      }
    }
  // the game
  const y = T + 0.0015;
  const card = (x: number, z: number, a: number, face = true, c = P.paperWhite) => {
    m.add(box([0.063, 0.0015, 0.088]), c, { at: [x, y, z], rot: [0, a, 0] });
    if (face)
      m.add(box([0.012, 0.0012, 0.012]), rnd(x, z, 1) > 0.5 ? 0xc4302b : P.ink, {
        at: [x + Math.cos(a) * 0.012, y + 0.001, z - Math.sin(a) * 0.012 - 0.02],
        rot: [0, a, 0],
      });
  };
  const back = [0x2f5f9e, 0xc4302b, 0x2f5f9e][v] ?? 0x2f5f9e;
  const kind = Math.floor(o.seed * 3);
  if (kind === 0) {
    // a hand fanned out, the deck by it
    for (let i = 0; i < 5; i++) card(0.42 + i * 0.03, 0.62, -0.5 + i * 0.25);
    for (let i = 0; i < 6; i++)
      m.add(box([0.063, 0.0015, 0.088]), i % 2 ? back : P.paperWhite, {
        at: [0.33, y + i * 0.0015, 0.36],
        rot: [0, 0.2, 0],
      });
    card(0.6, 0.36, 0.1, false, back);
  } else if (kind === 1) {
    // poker: chips stacked, cards dealt
    for (const [x, z, c, n] of [
      [0.3, 0.3, 0xc4302b, 6],
      [0.36, 0.28, P.paperWhite, 4],
      [0.68, 0.7, 0x2f5f9e, 5],
      [0.72, 0.64, P.ink, 3],
    ] as const)
      for (let i = 0; i < n; i++) m.add(cyl(0.02, 0.02, 0.0034, 12), c, { at: [x, T + i * 0.0036, z] });
    for (let i = 0; i < 5; i++) card(0.32 + i * 0.075, 0.5, 0);
    card(0.42, 0.72, 0.15, false, back);
    card(0.45, 0.73, -0.1, false, back);
  } else {
    // patience: seven piles, the stock
    for (let i = 0; i < 7; i++) {
      for (let k = 0; k <= Math.min(i, 3); k++)
        card(0.17 + i * 0.11, 0.42 + k * 0.03, 0, k === Math.min(i, 3), k === Math.min(i, 3) ? P.paperWhite : back);
    }
    card(0.17, 0.24, 0, false, back);
    card(0.28, 0.24, 0);
  }
}

// ── the beanbag toss board (1×2) ──────────────────────────────────────────────────────────────────
/** A cornhole board: its deck sloping up from the front to the hole, on its frame and folding legs,
 *  painted; four bags in two colours — on it, one at the hole's lip, one fallen short. (Two face each
 *  other across the room.) */
function cornholeBoard(m: Model, o: Look) {
  const v = o.look;
  const deck = o.fabric ?? [0xd9b98a, 0xc4302b, 0x22325a][v] ?? 0xd9b98a;
  const frame = [P.oak, P.cream, 0x1a2440][v] ?? P.oak;
  const [cx, Z0, Z1] = [0.5, 0.39, 1.61];
  const [FY, BY] = [0.09, 0.3];
  const W = 0.61;
  const a = Math.atan2(BY - FY, Z1 - Z0);
  const len = Math.hypot(BY - FY, Z1 - Z0);
  const b = mat([cx, (FY + BY) / 2, (Z0 + Z1) / 2], [a, 0, 0]);
  const add = framed(m, b);
  add(box([W, 0.018, len], 0.004), deck, { at: [0, -0.009, 0] });
  // the frame's sides and ends, under the deck
  for (const s of [-1, 1]) add(box([0.04, 0.07, len], 0.004), frame, { at: [s * (W / 2 - 0.02), -0.053, 0] });
  // the paint: a ring round the hole, a stripe, a band
  const hz = -len / 2 + 0.23;
  if (v === 0) add(ring(0.16, 0.012, 3, 28), 0x2f5f9e, { at: [0, 0.001, hz] });
  if (v === 1) add(box([0.18, 0.002, len]), P.white, { at: [0, 0.001, 0] });
  if (v === 2) {
    add(box([W, 0.002, 0.08]), P.mustard, { at: [0, 0.001, 0.25] });
    add(box([W, 0.002, 0.02]), P.white, { at: [0, 0.001, 0.32] });
  }
  add(cyl(0.076, 0.076, 0.003, 22), 0x0c0c0e, { at: [0, 0.0005, hz] });
  add(ring(0.076, 0.004, 3, 22), shade(deck, 0.7), { at: [0, 0.002, hz] });
  // the back legs, folded down to the floor
  for (const s of [-1, 1])
    m.add(box([0.04, BY - 0.05, 0.06], 0.004), frame, {
      at: [cx + s * (W / 2 - 0.05), (BY - 0.05) / 2, Z0 + 0.06],
      rot: [-0.12, 0, 0],
    });
  m.add(box([W - 0.04, 0.06, 0.03]), frame, { at: [cx, FY - 0.04, Z1 - 0.02] });
  // the bags: two on it, one at the hole, one short
  const team = [
    [0xc4302b, 0x2f5f9e],
    [0x22325a, P.mustard],
    [0xc4302b, P.white],
  ][v] ?? [0xc4302b, 0x2f5f9e];
  const bag = (x: number, z: number, c: number, yaw: number, onDeck: boolean) => {
    const g = cushion([0.15, 0.035, 0.15], 0.4);
    if (onDeck) add(g, c, { at: [x, 0.017, z], rot: [0, yaw, 0] });
    else m.add(g, c, { at: [x, 0.017, z], rot: [0, yaw, 0] });
  };
  bag(-0.13 + o.seed * 0.08, 0.15, team[0], 0.4, true);
  bag(0.12, -0.05 - o.seed * 0.1, team[1], -0.3, true);
  bag(0.03, hz + 0.1, team[0], 0.1, true);
  bag(cx + 0.12, Z1 + 0.13, team[1], 0.9, false);
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  air_hockey: airHockey,
  foosball,
  dartboard,
  chess_table: chessTable,
  pinball,
  claw_machine: clawMachine,
  jukebox,
  skee_ball: skeeBall,
  card_table: cardTable,
  cornhole_board: cornholeBoard,
};
