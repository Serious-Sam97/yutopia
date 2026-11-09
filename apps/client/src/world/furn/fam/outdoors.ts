import { SEAT_SPEC } from "@yutopia/shared";
import { glyphDots } from "@yutopia/shared/glyphs";
import { type BufferGeometry, CylinderGeometry, Float32BufferAttribute, BufferGeometry as Geo } from "three";
import {
  ball,
  box,
  cushion,
  cyl,
  extrude,
  type LiveAnim,
  type Look,
  lathe,
  type Model,
  merged,
  ring,
  rod,
  tube,
  type V3,
} from "../kit";
import { finishes } from "../life-mats";
import { P, shade } from "../palette";

// Plan 68 phase 19 (docs/plan/68-more-furniture.md): Outdoors — the snow campus's own: a fire pit (its
// flames live, a light) with log seats to go round it, a picnic table with its benches, a bike rack with
// bikes in it, a bus shelter, a mailbox, a street sign, a flag pole (its flag swinging on the pole), a
// sled and ski rack, a snowman built of snow, a bird feeder (its birds pecking, one coming and going) and
// a mushroom patio heater (its head glowing, a light). In the kit's frame (x across the footprint, z down
// it toward the room, y up, metres), Rich and cel; their catalog entries, shapes and measures in the
// shared fam/outdoors.ts. What a seed picks stays inside what every one of a kind takes up (its shape).

export const LOOKS: Record<string, readonly string[]> = {
  fire_pit: ["Stone ring", "Steel bowl", "Brick"],
  log_seat: ["Pine log", "Birch log", "With a sheepskin"],
  picnic_table: ["Pine", "Weathered grey", "Red-painted"],
  bike_rack: ["Steel hoops", "Wave rack", "Timber block"],
  bus_shelter: ["Steel and glass", "Green heritage", "Timber"],
  mailbox: ["Red pillar box", "Blue collection box", "Rural, on a post"],
  street_sign: ["Street names", "Fingerpost", "Stop sign"],
  flag_pole: ["Campus flag", "Pine flag", "Stripes"],
  ski_rack: ["Pine", "Red barn", "Steel"],
  snowman: ["Top hat", "Bobble hat", "Bucket and broom"],
  bird_feeder: ["Wooden table", "Red cottage", "Tube feeder"],
  patio_heater: ["Stainless", "Black", "Glass flame tower"],
};

const O = {
  snow: 0xf2f5f8,
  snowShade: 0xdfe6ee,
  stone: 0x8e8a83,
  stoneDark: 0x6f6b65,
  stoneLight: 0xaaa59c,
  earth: 0x6b5a4a,
  ash: 0x34302c,
  char: 0x1e1a17,
  ember: 0xff5a1e,
  flame: 0xff8a2a,
  core: 0xffe08a,
  bark: 0x5b3f2b,
  barkDark: 0x3f2a1c,
  cut: 0xd2a874,
  heart: 0xa77b4c,
  birch: 0xe9e4d8,
  birchMark: 0x2e2a26,
  red: 0xb3262b,
  green: 0x2f5a3a,
  blue: 0x2a4f8a,
  coal: 0x1c1c1e,
  carrot: 0xe0782a,
  glass: 0xcfe6ff,
  brick: 0x9a4a32,
  rust: 0x7a3e22,
  galv: 0xa7adb2,
};
// (plan 73 phase 6.1, the log seat: its cut face in the life look — its bark stays its paint: the
// library's bark, laid along a log, read as camouflage — the rest at 6.8)
finishes([[O.cut, "pine"]]);

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};

/** Words in the shared dot face, flat on a face looking +z, centred on (0, 0): each dot `p` across. */
function dotText(text: string, p: number): BufferGeometry | null {
  const pos: number[] = [];
  const d = p * 0.82;
  const x = -((text.length * 6 - 1) * p) / 2;
  const y = 3.5 * p;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) {
      const x0 = x + (i * 6 + c) * p;
      const y1 = y - r * p;
      pos.push(x0, y1 - d, 0, x0 + d, y1 - d, 0, x0 + d, y1, 0, x0, y1 - d, 0, x0 + d, y1, 0, x0, y1, 0);
    }
  return pos.length ? geo(pos) : null;
}
/** Words at (x, y, z) on a face looking +z turned `turn` round y. */
function words(m: Model, text: string, at: V3, p: number, c: number, turn = 0, glow = false) {
  const g = dotText(text, p);
  if (g) m.add(g, c, { at, rot: [0, turn, 0], glow });
}

/** A beam of w × d from a to b (its length along it). */
function beam(m: Model, a: V3, b: V3, w: number, d: number, c: number, bevel = 0.006) {
  const v: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...v);
  m.add(box([w, len, d], bevel), c, {
    at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    rot: [Math.acos(v[1] / len), Math.atan2(v[0], v[2]), 0],
  });
}

/** A ball of packed snow: lumpy, not round (each point pushed in or out by where it is). */
function lump(r: number, seg: number, s: number, amt = 0.06): BufferGeometry {
  const g = ball(r, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const k = 1 + amt * (rnd(Math.round(x * 400), Math.round(y * 400) + Math.round(z * 310), s) - 0.5) * 2;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g;
}

/** A tongue of flame (its belly low, its tip drawn up), foot at 0. */
const tongue = (r: number, h: number) =>
  lathe(
    [
      [0.001, 0],
      [r * 0.8, h * 0.08],
      [r, h * 0.25],
      [r * 0.75, h * 0.5],
      [r * 0.35, h * 0.78],
      [0.001, h],
    ],
    8,
  );
/** A fire's flames round (cx, cz) from y: `n` tongues and their hot cores (live), `h` tall. */
function flames(m: Model, cx: number, y: number, cz: number, n: number, h: number, spread: number, phase: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const rr = i === 0 ? 0 : spread * (0.55 + 0.45 * ((i * 7) % 3) * 0.5);
    const big = i === 0 || i % 2 === 1;
    const hh = h * (big ? 1 : 0.7) * (i === 0 ? 1 : 0.85);
    const at: V3 = [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
    m.live(tongue(big ? 0.09 : 0.065, hh), O.flame, { kind: "flame", phase: phase + i * 0.37 }, { at, glow: true });
    m.live(
      tongue(big ? 0.05 : 0.04, hh * 0.62),
      O.core,
      { kind: "flame", phase: phase + i * 0.37 + 0.5 },
      { at: [at[0], y, at[2] + 0.04], glow: true },
    );
  }
}

/** A split log lying along x, its middle at `at`: bark round it, its ends' grain lighter. */
function log(m: Model, at: V3, len: number, r: number, turn = 0, bark = O.bark) {
  m.add(rod(r, r, len, "x", 7), bark, { at, rot: [0, turn, 0] });
  for (const s of [-1, 1])
    m.add(rod(r * 0.82, r * 0.82, 0.006, "x", 7), O.cut, {
      at: [at[0] + Math.cos(turn) * s * (len / 2), at[1], at[2] - Math.sin(turn) * s * (len / 2)],
      rot: [0, turn, 0],
    });
}

// ── the fire pit (2×2) ───────────────────────────────────────────────────────────────────────────

/** A fire pit (2×2) on its ring of trodden earth: a ring of stones, a steel bowl on legs or a brick
 *  surround; split logs in a teepee on a bed of embers, its flames (live) while it's lit, the logs
 *  charred and the embers grey when it's out. A log pile beside it; by its seed marshmallows on
 *  their sticks or a kettle on a stone. */
export function firePit(m: Model, o: Look) {
  const on = o.on !== false;
  const [cx, cz] = [1, 1];
  m.add(cyl(0.86, 0.86, 0.012, 22), O.earth, { at: [cx, 0, cz] });
  m.add(cyl(0.62, 0.62, 0.016, 20), shade(O.earth, 0.8), { at: [cx, 0, cz] });
  let bed = 0.05;
  if (o.look === 1) {
    // a steel bowl, rolled at its rim, on three legs
    const steel = 0x5a3a2a;
    m.add(
      lathe(
        [
          [0.001, 0.25],
          [0.3, 0.27],
          [0.47, 0.38],
          [0.52, 0.45],
          [0.5, 0.455],
          [0.45, 0.4],
          [0.28, 0.3],
          [0.001, 0.28],
        ],
        20,
      ),
      steel,
      { at: [cx, 0, cz] },
    );
    m.add(ring(0.515, 0.014, 4, 28), shade(steel, 0.8), { at: [cx, 0.45, cz] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      m.add(
        tube(
          [
            [cx + Math.cos(a) * 0.3, 0.3, cz + Math.sin(a) * 0.3],
            [cx + Math.cos(a) * 0.42, 0.12, cz + Math.sin(a) * 0.42],
            [cx + Math.cos(a) * 0.46, 0.0, cz + Math.sin(a) * 0.46],
          ],
          0.018,
          5,
          4,
        ),
        P.steel,
      );
      m.add(cyl(0.04, 0.04, 0.012, 8), P.steel, { at: [cx + Math.cos(a) * 0.46, 0, cz + Math.sin(a) * 0.46] });
    }
    // (rust bloomed on it)
    for (let i = 0; i < 9; i++) {
      const a = i * 0.71 + o.seed * 3;
      m.add(box([0.06, 0.03, 0.005]), O.rust, {
        at: [cx + Math.cos(a) * 0.495, 0.415, cz + Math.sin(a) * 0.495],
        rot: [0.6, -a + Math.PI / 2, 0],
      });
    }
    m.add(cyl(0.3, 0.3, 0.012, 14), O.ash, { at: [cx, 0.29, cz] });
    bed = 0.3;
  } else if (o.look === 2) {
    // a ring of brick, four courses, a stone cap
    for (let k = 0; k < 4; k++) {
      const n = 15;
      for (let i = 0; i < n; i++) {
        const a = ((i + (k % 2) * 0.5) / n) * Math.PI * 2;
        m.add(box([0.205, 0.066, 0.1]), shade(O.brick, 0.9 + 0.2 * rnd(i, k, 3)), {
          at: [cx + Math.cos(a) * 0.5, 0.036 + k * 0.072, cz + Math.sin(a) * 0.5],
          rot: [0, -a + Math.PI / 2, 0],
        });
      }
    }
    m.add(
      lathe(
        [
          [0.455, 0],
          [0.49, 0],
          [0.49, 0.29],
          [0.455, 0.29],
          [0.455, 0],
        ],
        20,
      ),
      0x3a302a,
      { at: [cx, 0, cz] },
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      m.add(box([0.27, 0.045, 0.17]), shade(O.stoneLight, 0.94 + 0.1 * rnd(i, 2, 1)), {
        at: [cx + Math.cos(a) * 0.51, 0.31, cz + Math.sin(a) * 0.51],
        rot: [0, -a + Math.PI / 2, 0],
      });
    }
    m.add(cyl(0.44, 0.44, 0.05, 18), O.ash, { at: [cx, 0, cz] });
  } else {
    // a ring of field stones, two courses, the top one set over the joints
    for (let k = 0; k < 2; k++) {
      const n = 13 - k;
      for (let i = 0; i < n; i++) {
        const a = ((i + k * 0.5) / n) * Math.PI * 2 + rnd(i, k, 1) * 0.12;
        const s = 0.85 + 0.3 * rnd(i, k, 2);
        m.add(
          box([0.22 * s, 0.15 + 0.03 * rnd(i, k, 4), 0.18], 0.045, 1),
          [O.stone, O.stoneDark, O.stoneLight][(i + k) % 3],
          {
            at: [cx + Math.cos(a) * (0.52 - k * 0.03), 0.088 + k * 0.135, cz + Math.sin(a) * (0.52 - k * 0.03)],
            rot: [rnd(i, k, 5) * 0.2 - 0.1, -a + Math.PI / 2 + rnd(i, k, 6) * 0.3, rnd(i, k, 7) * 0.2 - 0.1],
          },
        );
      }
    }
    m.add(cyl(0.44, 0.44, 0.05, 18), O.ash, { at: [cx, 0, cz] });
  }
  // the logs in a teepee, charred at their feet
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const foot: V3 = [cx + Math.cos(a) * 0.25, bed + 0.03, cz + Math.sin(a) * 0.25];
    const mid: V3 = [cx + Math.cos(a) * 0.15, bed + 0.17, cz + Math.sin(a) * 0.15];
    const top: V3 = [cx + Math.cos(a) * 0.03, bed + 0.36, cz + Math.sin(a) * 0.03];
    m.add(tube([foot, mid], 0.035, 6, 1), O.char);
    m.add(tube([mid, top], 0.03, 6, 1), i % 2 ? O.bark : O.barkDark);
  }
  // the embers' bed
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4;
    const rr = 0.04 + rnd(i, 1, 9) * 0.2;
    m.add(
      ball(0.03 + rnd(i, 2, 9) * 0.025, 5),
      on ? [O.ember, 0xff8a3a, 0xc8401a][i % 3] : [O.ash, 0x55504a, O.char][i % 3],
      {
        at: [cx + Math.cos(a) * rr, bed + 0.015, cz + Math.sin(a) * rr],
        scale: [1, 0.55, 1],
        glow: on,
      },
    );
  }
  if (on) flames(m, cx, bed + 0.03, cz, 7, 0.6, 0.12, o.seed * 3);
  // the log pile by it: three, two, one
  for (const [k, n] of [
    [0, 3],
    [1, 2],
    [2, 1],
  ]) {
    for (let i = 0; i < n; i++)
      log(m, [1.62, 0.055 + k * 0.095, 0.24 + (i - (n - 1) / 2) * 0.11 + k * 0.0], 0.46, 0.052, 0.12 * (i - 1), O.bark);
  }
  if (o.seed > 0.5) {
    // marshmallows on their sticks, leant on the rim
    for (const s of [-1, 1]) {
      const a = 2.2 + s * 0.25;
      const foot: V3 = [cx + Math.cos(a) * 0.82, 0.01, cz + Math.sin(a) * 0.82];
      const tip: V3 = [cx + Math.cos(a) * 0.38, 0.5, cz + Math.sin(a) * 0.38];
      m.add(tube([foot, tip], 0.006, 4, 1), 0x8a6a48);
      m.add(cyl(0.018, 0.018, 0.03, 8), s < 0 ? 0xf6efe2 : 0xd9a466, {
        at: [tip[0] + (foot[0] - tip[0]) * 0.06, tip[1] - 0.04, tip[2] + (foot[2] - tip[2]) * 0.06],
        rot: [0, 0, 0.9],
      });
    }
  } else {
    // a camp kettle on a flat stone
    m.add(box([0.26, 0.05, 0.22], 0.02, 2), O.stoneLight, { at: [0.36, 0.025, 1.66] });
    m.add(
      lathe(
        [
          [0.001, 0.05],
          [0.08, 0.05],
          [0.09, 0.1],
          [0.075, 0.17],
          [0.04, 0.19],
          [0.001, 0.2],
        ],
        12,
      ),
      0x2f4a5a,
      { at: [0.36, 0, 1.66] },
    );
    m.add(
      tube(
        [
          [0.29, 0.17, 1.66],
          [0.36, 0.25, 1.66],
          [0.43, 0.17, 1.66],
        ],
        0.005,
        4,
        8,
      ),
      P.steel,
    );
    m.add(cyl(0.012, 0.008, 0.09, 6), 0x2f4a5a, { at: [0.45, 0.09, 1.66], rot: [0, 0, -0.9] });
  }
}

// ── the log seat (2×1) ───────────────────────────────────────────────────────────────────────────

/** A half log lying on two rounds, its flat face up at the seat's height (SEAT_SPEC.log_seat): pine
 *  bark, birch's white with its black marks, or with a sheepskin thrown over it. By its seed an enamel
 *  mug left at one end. */
export function logSeat(m: Model, o: Look) {
  const top = SEAT_SPEC.log_seat.top;
  const R = 0.21;
  // (the cut: a chord 0.55 R over its axis, the flat that's sat on 1.67 R across)
  const cut = 0.55;
  const ay = top - cut * R;
  const half = Math.acos(cut);
  const [x0, x1] = [0.1, 1.9];
  const len = x1 - x0;
  const birch = o.look === 1;
  const bark = birch ? O.birch : 0x6e4a30;
  // the log round under its cut (open: its ends are drawn), turned to lie along x
  m.add(
    new CylinderGeometry(R, R, len, 16, 1, true, (3 * Math.PI) / 2 + half, 2 * Math.PI - 2 * half).rotateZ(
      -Math.PI / 2,
    ),
    bark,
    { at: [1, ay, 0.5] },
  );
  const w = Math.sin(half) * R;
  m.add(box([len, 0.008, 2 * w]), birch ? 0xe6d3ac : O.cut, { at: [1, top - 0.004, 0.5] });
  // its ends: the bark's rim, the sawn grain, the heartwood
  const end = (r: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const a = half + ((2 * Math.PI - 2 * half) * i) / 14;
      pts.push([Math.sin(a) * r, Math.cos(a) * r]);
    }
    return pts.map(([u, v]) => [u, Math.min(v, cut * R)] as [number, number]);
  };
  for (const s of [-1, 1]) {
    const x = 1 + s * (len / 2);
    m.add(extrude(end(R), 0.012), shade(bark, 0.85), { at: [x - s * 0.006, ay, 0.5], rot: [0, Math.PI / 2, 0] });
    m.add(extrude(end(R - 0.02), 0.004), O.cut, { at: [x + s * 0.002, ay, 0.5], rot: [0, Math.PI / 2, 0] });
    m.add(cyl(0.07, 0.07, 0.004, 10).rotateZ(Math.PI / 2), O.heart, { at: [x + s * 0.004, ay, 0.5] });
    m.add(ring(0.14, 0.003, 3, 18).rotateZ(Math.PI / 2), shade(O.cut, 0.85), {
      at: [x + s * 0.004, ay - 0.0, 0.5],
      scale: [1, 0.8, 1],
    });
  }
  // the bark's ridges (pine) or birch's black marks, round its lower side
  for (let i = 0; i < 22; i++) {
    const f = (rnd(i, 1, 3) * 2 - 1) * (Math.PI - half - 0.12);
    const l = birch ? 0.05 + rnd(i, 3, 3) * 0.1 : 0.25 + rnd(i, 3, 3) * 0.5;
    const x = x0 + 0.02 + l / 2 + rnd(i, 2, 3) * (len - 0.04 - l);
    const at: V3 = [x, ay - Math.cos(f) * R, 0.5 + Math.sin(f) * R];
    if (birch) m.add(box([l, 0.006, 0.014]), O.birchMark, { at, rot: [Math.PI - f, 0, 0] });
    else
      m.add(box([l, 0.01, 0.018]), i % 3 ? O.barkDark : 0x8a6444, {
        at,
        rot: [Math.PI - f, 0, 0],
      });
  }
  // the rounds it lies on
  for (const x of [0.42, 1.58]) {
    m.add(cyl(0.16, 0.15, ay - R + 0.03, 10), birch ? shade(O.birch, 0.9) : O.barkDark, { at: [x, 0, 0.5] });
  }
  if (o.look === 2) {
    // a sheepskin over its middle, its edge hanging down the front
    m.add(cushion([0.62, 0.035, 2 * w + 0.02], 0.5, 2), 0xeee6d6, { at: [1, top + 0.015, 0.5] });
    m.add(cushion([0.6, 0.16, 0.03], 0.3, 2), 0xe6dccb, { at: [1.02, top - 0.07, 0.5 + w + 0.03], rot: [0.3, 0, 0] });
    for (let i = 0; i < 9; i++)
      m.add(ball(0.03, 5), 0xf4eee2, {
        at: [0.75 + i * 0.062, top + 0.03, 0.5 + 0.1 * Math.sin(i * 1.7)],
        scale: [1, 0.5, 1],
      });
  }
  if (o.seed > 0.55) {
    // a pair of mittens left on its end
    for (const k of [0, 1])
      m.add(cushion([0.1, 0.022, 0.16], 0.5, 1), 0xc0392b, {
        at: [1.68 + k * 0.1, top + 0.011 + k * 0.012, 0.5 + k * 0.03],
        rot: [0, 0.3 + k * 0.5, 0],
      });
  }
}

// ── the picnic table (2×2) ───────────────────────────────────────────────────────────────────────

/** A picnic table (2×2) with its benches attached: boards on two A-frames, the benches on their
 *  bearers; pine, weathered grey or painted red. By its seed a mitten left on a bench, or a carved
 *  heart in its top. */
export function picnicTable(m: Model, o: Look) {
  const wood = [0xc49260, 0x9a948a, 0xa8392e][o.look] ?? 0xc49260;
  const frame = o.look === 2 ? 0x8a2a22 : shade(wood, 0.82);
  const top = 0.76;
  const seat = SEAT_SPEC.picnic_table.top;
  const [x0, x1] = [0.08, 1.92];
  // the top's boards, the gaps between them
  for (let i = 0; i < 5; i++)
    m.add(box([x1 - x0, 0.035, 0.112], 0.006), shade(wood, 0.95 + 0.08 * rnd(i, 1, 2)), {
      at: [1, top - 0.0175, 0.72 + i * 0.14 - 0.0],
    });
  // the benches, two boards each
  for (const zc of [0.5, 1.5])
    for (const k of [-1, 1])
      m.add(box([x1 - x0 - 0.12, 0.032, 0.126], 0.006), shade(wood, 0.96 + 0.06 * k), {
        at: [1, seat - 0.016, zc + k * 0.067],
      });
  // the A-frames: two legs crossing up to the top, the bearer under the benches, a brace
  for (const x of [0.32, 1.68]) {
    for (const s of [-1, 1]) beam(m, [x, 0.04, 1 + s * 0.68], [x, top - 0.035, 1 + s * 0.22], 0.05, 0.09, frame);
    m.add(box([0.05, 0.08, 1.36], 0.006), frame, { at: [x + 0.052, seat - 0.072, 1] });
    m.add(box([0.05, 0.07, 0.66], 0.006), frame, { at: [x, top - 0.07, 1] });
    // (a brace from the bearer up to the top's middle board)
    const k = x < 1 ? 1 : -1;
    beam(m, [x + k * 0.08, seat - 0.08, 1], [x + k * 0.5, top - 0.04, 1], 0.045, 0.05, frame);
  }
  if (o.seed > 0.6) {
    // a red mitten left on the near bench
    m.add(cushion([0.11, 0.025, 0.17], 0.5, 1), 0xb3262b, { at: [1.45, seat + 0.012, 1.5], rot: [0, 0.5, 0] });
    m.add(cushion([0.05, 0.022, 0.07], 0.5, 1), 0xb3262b, { at: [1.37, seat + 0.012, 1.45], rot: [0, 1.0, 0] });
    m.add(box([0.12, 0.028, 0.04], 0.008), 0xf2efe6, { at: [1.5, seat + 0.012, 1.58], rot: [0, 0.5, 0] });
  } else if (o.seed < 0.3) {
    // initials in a heart, cut in its top
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2;
      const hx = 0.016 * 16 * Math.sin(t) ** 3;
      const hz = -0.016 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      m.add(box([0.012, 0.002, 0.012]), shade(wood, 0.6), { at: [1.45 + hx * 0.4, top + 0.0005, 1.0 + hz * 0.4] });
    }
  }
}

// ── the bike rack (3×2), and its bikes ──────────────────────────────────────────────────────────

const BIKE_COLOURS = [0x2f6fa8, 0xc0392b, 0x3a7a4a, 0xe6dccb, 0x1e1e20, 0xe0a030];

/** A bike standing upright in the y-z plane at x, its front wheel's hub at zf (its front toward −z):
 *  a diamond frame in `c`, spoked wheels, saddle, bars and cranks; a basket on its front or
 *  mudguards by `s`. */
function bike(m: Model, x: number, zf: number, c: number, s: number) {
  const R = 0.33;
  const zr = zf + 1.05;
  const at = (y: number, z: number): V3 => [x, y, z];
  for (const z of [zf, zr]) {
    m.add(ring(R - 0.018, 0.02, 4, 22).rotateZ(Math.PI / 2), P.rubber, { at: at(R, z) });
    m.add(ring(R - 0.04, 0.007, 3, 22).rotateZ(Math.PI / 2), P.chrome, { at: at(R, z) });
    const spokes: BufferGeometry[] = [];
    for (let k = 0; k < 12; k++)
      spokes.push(
        box([0.003, R - 0.05, 0.003])
          .translate(0, (R - 0.05) / 2, 0)
          .rotateX((k / 12) * Math.PI * 2),
      );
    m.add(merged(spokes), P.chrome, { at: at(R, z) });
    m.add(rod(0.02, 0.02, 0.1, "x", 8), P.steelLight, { at: at(R, z) });
  }
  const BB = at(0.3, zr - 0.44);
  const S = at(0.84, zr - 0.6);
  const H = at(0.9, zf + 0.22);
  const Hb = at(0.74, zf + 0.18);
  const T = (a: V3, b: V3, r = 0.016) => m.add(tube([a, b], r, 6, 1), c);
  T(BB, S, 0.017);
  T(S, H, 0.016);
  T(BB, Hb, 0.019);
  T(H, Hb, 0.022);
  for (const sx of [-1, 1]) {
    T([x + sx * 0.04, 0.3, zr - 0.44], [x + sx * 0.05, R, zr], 0.011);
    T([x + sx * 0.03, 0.8, zr - 0.58], [x + sx * 0.05, R, zr], 0.01);
    // (the fork's blades)
    T([x + sx * 0.03, 0.74, zf + 0.18], [x + sx * 0.05, R, zf - 0.01], 0.012);
  }
  // the bars on their stem, its grips
  m.add(tube([H, at(1.0, zf + 0.2)], 0.014, 5, 1), P.steelLight);
  m.add(
    tube(
      [
        [x - 0.28, 1.0, zf + 0.3],
        [x - 0.2, 1.0, zf + 0.22],
        [x, 1.0, zf + 0.2],
        [x + 0.2, 1.0, zf + 0.22],
        [x + 0.28, 1.0, zf + 0.3],
      ],
      0.012,
      5,
      10,
    ),
    P.steelLight,
  );
  for (const sx of [-1, 1]) m.add(rod(0.017, 0.017, 0.1, "x", 6), P.rubber, { at: [x + sx * 0.25, 1.0, zf + 0.28] });
  // the saddle on its post
  m.add(tube([S, at(0.94, zr - 0.64)], 0.013, 5, 1), P.steelLight);
  m.add(cushion([0.14, 0.045, 0.26], 0.3, 1), P.rubber, { at: at(0.96, zr - 0.62) });
  // the chainring and cranks, a pedal each side
  m.add(ring(0.09, 0.008, 3, 16).rotateZ(Math.PI / 2), P.steelLight, { at: [x + 0.05, 0.3, zr - 0.44] });
  m.add(rod(0.004, 0.004, 0.44, "z", 4), P.steel, { at: [x + 0.05, 0.31, zr - 0.22] });
  for (const sx of [-1, 1]) {
    m.add(box([0.012, 0.17, 0.025]), P.steel, {
      at: [x + sx * 0.07, 0.3 - sx * 0.07, zr - 0.44],
      rot: [sx * 0.5, 0, 0],
    });
    m.add(box([0.09, 0.02, 0.06]), P.rubber, { at: [x + sx * 0.11, 0.3 - sx * 0.15, zr - 0.44 - sx * 0.07] });
  }
  if (s > 0.5) {
    // a wicker basket on its front, something in it
    m.add(box([0.3, 0.18, 0.22], 0.02, 1), 0xb08a52, { at: at(0.92, zf - 0.04) });
    for (let k = 0; k < 4; k++) m.add(box([0.305, 0.008, 0.225]), 0x8a6a3a, { at: at(0.85 + k * 0.045, zf - 0.04) });
    m.add(ball(0.05, 6), [0xe0782a, 0x3f6b3a, 0xf0ebe0][Math.floor(s * 7) % 3], { at: at(1.0, zf - 0.04) });
  } else {
    // mudguards over both wheels
    for (const z of [zf, zr]) {
      const pts: V3[] = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (0.15 + 0.6 * (k / 8)) + (z === zf ? -0.2 : 0.4);
        pts.push([x, R + Math.sin(a) * (R + 0.03), z + Math.cos(a) * (R + 0.03) * (z === zf ? 1 : -1)]);
      }
      m.add(tube(pts, 0.018, 4, 10), shade(c, 0.85));
    }
  }
}

/** A bike rack (3×2) with a bike or three in it (by its seed, their colours too): a row of steel
 *  hoops the bikes lean on, a wave of tube they stand in, or a timber block slotted for their front
 *  wheels. */
export function bikeRack(m: Model, o: Look) {
  let slots: number[];
  if (o.look === 1) {
    // a wave of galvanised tube along it, its feet on the ground
    const pts: V3[] = [];
    for (let i = 0; i <= 64; i++) {
      const x = 0.15 + (i / 64) * 2.7;
      pts.push([x, 0.05 + 0.4 * (1 - Math.cos(((x - 0.15) / 0.675) * Math.PI * 2)), 0.58]);
    }
    m.add(tube(pts, 0.03, 6, 120), O.galv);
    for (const x of [0.15, 1.5, 2.85]) m.add(box([0.12, 0.02, 0.12]), shade(O.galv, 0.8), { at: [x, 0.01, 0.58] });
    slots = [0.825, 1.5, 2.175];
  } else if (o.look === 2) {
    // a timber block, the slots cut in it
    m.add(box([2.7, 0.2, 0.24], 0.012), 0x8a5a36, { at: [1.5, 0.1, 0.42] });
    for (const x of [0.6, 1.5, 2.4]) m.add(box([0.07, 0.03, 0.245]), 0x2b1e14, { at: [x, 0.19, 0.42] });
    for (let i = 0; i < 6; i++)
      m.add(box([0.4, 0.004, 0.004]), 0x6b4128, { at: [0.35 + i * 0.47, 0.13 + (i % 3) * 0.02, 0.542] });
    // (a sign at its end)
    m.add(box([0.02, 0.4, 0.02]), P.steel, { at: [0.2, 0.4, 0.42] });
    m.add(box([0.2, 0.2, 0.012]), 0x2a4f8a, { at: [0.2, 0.62, 0.43] });
    words(m, "P", [0.2, 0.62, 0.437], 0.02, P.white);
    slots = [0.6, 1.5, 2.4];
  } else {
    // four Sheffield hoops, each an upturned U set in the ground, a bike's place between each two
    for (const x of [0.15, 1.05, 1.95, 2.85]) {
      const pts: V3[] = [[x, 0, 0.35]];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (k / 8);
        pts.push([x, 0.62 + Math.sin(a) * 0.2, 0.75 - Math.cos(a) * 0.4]);
      }
      pts.push([x, 0, 1.15]);
      m.add(tube(pts, 0.024, 6, 30), [P.steel, 0x2f5a3a, O.galv][Math.floor(o.seed * 5) % 3]);
      for (const z of [0.35, 1.15]) m.add(cyl(0.05, 0.05, 0.015, 8), shade(O.stone, 0.9), { at: [x, 0, z] });
    }
    slots = [0.6, 1.5, 2.4];
  }
  // the bikes: at least one, in the middle; one or two more by its seed
  const n = 1 + Math.floor(o.seed * 2.99);
  const used = n === 1 ? [1] : n === 2 ? (o.seed > 0.5 ? [0, 1] : [1, 2]) : [0, 1, 2];
  for (const k of used)
    bike(m, slots[k], 0.46, BIKE_COLOURS[Math.floor(rnd(k, 3, o.seed) * BIKE_COLOURS.length)], rnd(k, 4, o.seed));
}

// ── the bus shelter (3×1) ───────────────────────────────────────────────────────────────────────

const STOPS = ["CAMPUS", "NORTH GATE", "LAKESIDE", "THE PINES", "OLD MILL", "SKI HILL"];

/** A bus shelter (3×1), open to the front: steel and glass, its back and one end glazed, a lit advert
 *  at the other, a perch inside, the stop's name on its fascia and the bus roundel on its post; green
 *  heritage ironwork with a curved roof; or a timber shelter with a shingled roof. Its stop's name by
 *  its seed, a timetable on the post, maybe a bin. */
export function busShelter(m: Model, o: Look) {
  const timber = o.look === 2;
  const steel = [0x3a3d42, 0x24432f, 0x7a5232][o.look] ?? 0x3a3d42;
  const H = 2.25;
  const name = STOPS[Math.floor(o.seed * STOPS.length) % STOPS.length];
  // the posts
  for (const x of [0.06, 2.94])
    for (const z of [0.06, 0.8])
      m.add(box(timber ? [0.1, H, 0.1] : [0.06, H, 0.06], 0.006), steel, { at: [x, H / 2, z] });
  // the back: glass in a frame, or boards
  if (timber) {
    for (let i = 0; i < 13; i++)
      m.add(box([2.84, 0.15, 0.025], 0.004), shade(0x9a6a42, 0.92 + 0.12 * rnd(i, 1, 1)), {
        at: [1.5, 0.12 + i * 0.165, 0.05],
      });
    // and the end walls, boarded to the front post
    for (const x of [0.04, 2.96])
      for (let i = 0; i < 13; i++)
        m.add(box([0.025, 0.15, 0.72], 0.004), shade(0x9a6a42, 0.9 + 0.12 * rnd(i, x, 2)), {
          at: [x, 0.12 + i * 0.165, 0.44],
        });
  } else {
    const panes: BufferGeometry[] = [box([2.8, 1.95, 0.012]).translate(1.5, 1.15, 0.06)];
    panes.push(box([0.012, 1.95, 0.66]).translate(0.06, 1.15, 0.43));
    m.live(merged(panes), O.glass, { kind: "still" }, { glass: true });
    // (the glass's frame: rails top and bottom, a mid rail)
    for (const y of [0.16, 1.12, 2.13]) {
      m.add(box([2.88, 0.04, 0.04]), steel, { at: [1.5, y, 0.06] });
      m.add(box([0.04, 0.04, 0.74]), steel, { at: [0.06, y, 0.43] });
    }
    for (const x of [1.0, 2.0]) m.add(box([0.04, 2.0, 0.04]), steel, { at: [x, 1.15, 0.06] });
    // the advert at the far end, lit: a snowy mountain, the sun, its words
    m.add(box([0.09, 1.9, 0.72], 0.01), steel, { at: [2.92, 1.18, 0.44] });
    m.add(box([0.004, 1.6, 0.6]), 0xbfe0f2, { at: [2.87, 1.2, 0.44], glow: true });
    m.add(
      extrude(
        [
          [-0.3, 0],
          [-0.1, 0.42],
          [0.02, 0.28],
          [0.14, 0.52],
          [0.3, 0.12],
          [0.3, 0],
        ],
        0.004,
      ),
      0x3a6a8a,
      { at: [2.866, 0.5, 0.44], rot: [0, -Math.PI / 2, 0], glow: true },
    );
    m.add(
      extrude(
        [
          [-0.12, 0.3],
          [-0.1, 0.42],
          [0.02, 0.28],
          [0.07, 0.38],
          [0.08, 0.3],
        ],
        0.004,
      ),
      0xffffff,
      { at: [2.864, 0.5, 0.44], rot: [0, -Math.PI / 2, 0], glow: true },
    );
    m.add(cyl(0.07, 0.07, 0.004, 12).rotateZ(Math.PI / 2), 0xffc24a, { at: [2.866, 1.55, 0.3], glow: true });
    words(m, "SKI", [2.865, 1.3, 0.48], 0.022, 0x1e3a5a, -Math.PI / 2, true);
  }
  // the roof: a slab, a curve, or shingles to a ridge
  if (o.look === 1) {
    const arc: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      arc.push([0.5 - Math.cos(a) * 0.5, H + Math.sin(a) * 0.16]);
    }
    for (let i = 10; i >= 0; i--) {
      const a = (i / 10) * Math.PI;
      arc.push([0.5 - Math.cos(a) * 0.49, H + Math.sin(a) * 0.16 - 0.025]);
    }
    m.add(extrude(arc, 2.98), steel, { at: [1.5, 0, 0], rot: [0, -Math.PI / 2, 0] });
    // its valance, scalloped
    for (let i = 0; i < 20; i++)
      m.add(cyl(0.07, 0.07, 0.012, 8).rotateX(Math.PI / 2), steel, { at: [0.08 + i * 0.149, H - 0.07, 0.985] });
    m.add(box([2.98, 0.1, 0.014]), steel, { at: [1.5, H + 0.0, 0.985] });
  } else if (timber) {
    for (const s of [-1, 1]) {
      m.add(box([3.0, 0.035, 0.56], 0.004), 0x4a3a32, { at: [1.5, H + 0.13, 0.5 + s * 0.24], rot: [s * 0.5, 0, 0] });
      for (let i = 0; i < 4; i++)
        m.add(box([3.0, 0.012, 0.03]), 0x3a2d26, {
          at: [1.5, H + 0.15 - i * 0.065 + 0.02, 0.5 + s * (0.04 + i * 0.115)],
          rot: [s * 0.5, 0, 0],
        });
    }
    m.add(box([3.0, 0.05, 0.05]), 0x3a2d26, { at: [1.5, H + 0.28, 0.5] });
  } else {
    m.add(box([3.0, 0.07, 1.0], 0.01), shade(steel, 1.15), { at: [1.5, H + 0.035, 0.5] });
    m.add(box([3.0, 0.18, 0.03], 0.006), steel, { at: [1.5, H - 0.02, 0.975] });
  }
  // the stop's name on its fascia (the timber one on a board under its eaves)
  if (timber) {
    m.add(box([1.2, 0.16, 0.02], 0.004), P.cream, { at: [1.5, H - 0.12, 0.84] });
    words(m, name, [1.5, H - 0.12, 0.851], 0.014, 0x3a2d26);
  } else words(m, `BUS - ${name}`, [1.5, o.look === 1 ? H + 0.0 : H - 0.02, 0.994], 0.016, P.white, 0, true);
  // the perch: slats on brackets, its back rail on the back
  const top = SEAT_SPEC.bus_shelter.top;
  for (let i = 0; i < 3; i++)
    m.add(box([1.8, 0.022, 0.1], 0.005), timber ? 0x8a5a36 : 0x9aa0a6, { at: [1.5, top - 0.011, 0.2 + i * 0.135] });
  for (const x of [0.75, 2.25]) {
    m.add(box([0.04, top - 0.03, 0.04]), timber ? 0x5a3a22 : P.steel, { at: [x, (top - 0.03) / 2, 0.44] });
    m.add(box([0.04, 0.04, 0.44]), timber ? 0x5a3a22 : P.steel, { at: [x, top - 0.04, 0.3] });
  }
  m.add(box([1.8, 0.09, 0.03], 0.005), timber ? 0x8a5a36 : 0x9aa0a6, { at: [1.5, 0.78, 0.1] });
  // the timetable on the back, the roundel up on its mast
  const tz = timber ? 0.07 : 0.075;
  m.add(box([0.24, 0.34, 0.012], 0.003), P.paperWhite, { at: [0.36, 1.45, tz] });
  for (let i = 0; i < 6; i++)
    m.add(box([0.18 - (i % 2) * 0.06, 0.008, 0.002]), P.ink, {
      at: [0.36 - (i % 2) * 0.03, 1.55 - i * 0.045, tz + 0.007],
    });
  m.add(box([0.22, 0.04, 0.003]), O.red, { at: [0.36, 1.59, tz + 0.007] });
  if (!timber) {
    m.add(box([0.04, 0.34, 0.04]), steel, { at: [0.22, H + 0.17 + 0.07, 0.8] });
    m.add(cyl(0.15, 0.15, 0.02, 18).rotateX(Math.PI / 2), O.red, { at: [0.22, H + 0.5, 0.83] });
    m.add(cyl(0.11, 0.11, 0.024, 18).rotateX(Math.PI / 2), P.white, { at: [0.22, H + 0.5, 0.83] });
    words(m, "BUS", [0.22, H + 0.5, 0.843], 0.011, O.blue);
  }
  if (o.seed > 0.5) {
    // a bin by the front post
    m.add(cyl(0.15, 0.14, 0.62, 12), steel, { at: [0.3, 0, 0.84] });
    m.add(cyl(0.16, 0.16, 0.05, 12), shade(steel, 1.2), { at: [0.3, 0.62, 0.84] });
  }
}

// ── the mailbox (1×1) ───────────────────────────────────────────────────────────────────────────

/** A mailbox: a red pillar box (its domed cap, the slot under its hood, the collection plate), a blue
 *  street collection box on its legs (the chute's handle, its words), or a rural one on a post (its
 *  flag up by the seed, the house number). By its seed a letter in the slot. */
export function mailbox(m: Model, o: Look) {
  if (o.look === 1) {
    const blue = 0x2a4f8a;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      m.add(box([0.05, 0.28, 0.05]), shade(blue, 0.8), { at: [0.5 + dx * 0.22, 0.14, 0.5 + dz * 0.2] });
    m.add(box([0.52, 0.86, 0.48], 0.012), blue, { at: [0.5, 0.28 + 0.43, 0.5] });
    const dome: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      dome.push([-Math.cos(a) * 0.24, Math.sin(a) * 0.16]);
    }
    m.add(extrude(dome, 0.52, 0.006), blue, { at: [0.5, 1.14, 0.5], rot: [0, Math.PI / 2, 0] });
    // the chute: a pull-down flap and its handle
    m.add(box([0.36, 0.14, 0.03], 0.01), shade(blue, 0.85), { at: [0.5, 1.05, 0.75], rot: [-0.25, 0, 0] });
    m.add(box([0.2, 0.025, 0.035], 0.008), P.chrome, { at: [0.5, 1.12, 0.77] });
    words(m, "MAIL", [0.5, 0.62, 0.741], 0.022, P.white);
    m.add(box([0.3, 0.12, 0.004]), P.white, { at: [0.5, 0.86, 0.742] });
    for (let i = 0; i < 3; i++) m.add(box([0.22, 0.008, 0.002]), P.ink, { at: [0.5, 0.9 - i * 0.03, 0.745] });
  } else if (o.look === 2) {
    // the post, its arm, the tunnel box on it
    m.add(box([0.09, 1.0, 0.09], 0.006), 0x8a6a48, { at: [0.5, 0.5, 0.5] });
    m.add(box([0.09, 0.07, 0.4], 0.006), 0x8a6a48, { at: [0.5, 0.96, 0.5] });
    const arch: [number, number][] = [
      [-0.11, 0],
      [0.11, 0],
    ];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      arch.push([Math.cos(a) * 0.11, 0.13 + Math.sin(a) * 0.11]);
    }
    const c = [0x2b2b30, 0x2f5a3a, P.white][Math.floor(o.seed * 3) % 3];
    m.add(extrude(arch, 0.5, 0.006), c, { at: [0.5, 0.995, 0.5] });
    m.add(extrude(arch, 0.012, 0.003), shade(c, 0.8), { at: [0.5, 0.995, 0.756] });
    m.add(box([0.05, 0.02, 0.02]), P.chrome, { at: [0.5, 1.18, 0.766] });
    // the flag on its side: up (mail out) by its seed
    const up = o.seed > 0.4;
    m.add(box([0.012, 0.012, 0.2]), O.red, {
      at: [0.618, 1.1, 0.48],
      rot: [up ? -Math.PI / 2 + 0.1 : 0, 0, 0],
    });
    m.add(box([0.012, 0.09, 0.08]), O.red, { at: [0.62, up ? 1.22 : 1.1, up ? 0.47 : 0.38] });
    words(m, String(1 + Math.floor(o.seed * 40)), [0.39, 1.1, 0.5], 0.012, P.white, -Math.PI / 2);
  } else {
    // a pillar: plinth, body, the cap's lip and dome
    m.add(cyl(0.27, 0.27, 0.08, 18), P.ink, { at: [0.5, 0, 0.5] });
    m.add(cyl(0.235, 0.235, 1.18, 18), O.red, { at: [0.5, 0.08, 0.5] });
    m.add(cyl(0.27, 0.27, 0.05, 18), O.red, { at: [0.5, 1.26, 0.5] });
    m.add(
      lathe(
        [
          [0.25, 0],
          [0.24, 0.05],
          [0.19, 0.13],
          [0.1, 0.18],
          [0.001, 0.19],
        ],
        18,
      ),
      O.red,
      { at: [0.5, 1.31, 0.5] },
    );
    m.add(cyl(0.24, 0.24, 0.035, 18), shade(O.red, 0.8), { at: [0.5, 1.12, 0.5] });
    // the slot under its hood
    m.add(box([0.2, 0.03, 0.02]), P.ink, { at: [0.5, 1.05, 0.73] });
    m.add(box([0.24, 0.025, 0.05], 0.006), O.red, { at: [0.5, 1.085, 0.735], rot: [0.3, 0, 0] });
    // the collection plate, the door's outline
    m.add(box([0.14, 0.1, 0.006]), P.white, { at: [0.5, 0.9, 0.733] });
    for (let i = 0; i < 3; i++) m.add(box([0.1, 0.006, 0.002]), P.ink, { at: [0.5, 0.92 - i * 0.02, 0.737] });
    m.add(box([0.3, 0.012, 0.004]), shade(O.red, 0.7), { at: [0.5, 0.72, 0.734] });
    m.add(box([0.3, 0.012, 0.004]), shade(O.red, 0.7), { at: [0.5, 0.25, 0.734] });
    m.add(box([0.03, 0.04, 0.012]), P.brass, { at: [0.6, 0.5, 0.737] });
    if (o.seed > 0.6) m.add(box([0.12, 0.06, 0.004]), P.paperWhite, { at: [0.5, 1.06, 0.745], rot: [-0.3, 0, 0.05] });
  }
}

// ── the street sign (1×1) ───────────────────────────────────────────────────────────────────────

const STREETS = ["MAPLE ST", "ELM AVE", "BIRCH RD", "PINE ST", "OAK LANE", "CEDAR AVE", "ASPEN WAY", "WILLOW RD"];
const PLACES = [
  ["CAMPUS", "LAKE", "WOODS"],
  ["TOWN", "PARK", "HILLS"],
  ["STATION", "POND", "SKI HILL"],
];

/** A street sign: two street-name blades crossed on a pole (their names by its seed), a wooden
 *  fingerpost pointing three ways, or a stop sign. */
export function streetSign(m: Model, o: Look) {
  const [cx, cz] = [0.5, 0.5];
  if (o.look === 1) {
    m.add(box([0.09, 2.45, 0.09], 0.008), 0x7a5a3a, { at: [cx, 1.225, cz] });
    m.add(cyl(0.075, 0.001, 0.08, 4), 0x6a4a2e, { at: [cx, 2.45, cz], rot: [0, Math.PI / 4, 0] });
    const names = PLACES[Math.floor(o.seed * 3) % 3];
    for (let i = 0; i < 3; i++) {
      // an arm: a board with a point, its place on both faces
      const turn = [0.3, 2.5, -1.3][i];
      const y = 2.2 - i * 0.2;
      const arm = extrude(
        [
          [0.05, -0.055],
          [0.36, -0.055],
          [0.43, 0],
          [0.36, 0.055],
          [0.05, 0.055],
        ],
        0.025,
        0.003,
      );
      m.add(arm, P.cream, { at: [cx, y, cz], rot: [0, turn, 0] });
      const mid = 0.225;
      const [dx, dz] = [Math.cos(turn) * mid, -Math.sin(turn) * mid];
      for (const s of [1, -1]) {
        const nx = Math.sin(turn) * 0.0135 * s;
        const nz = Math.cos(turn) * 0.0135 * s;
        words(m, names[i], [cx + dx + nx, y, cz + dz + nz], 0.0085, 0x3a2d26, turn + (s < 0 ? Math.PI : 0));
      }
    }
    return;
  }
  // a galvanised pole, a collar in the ground
  const poleTop = o.look === 2 ? 2.62 : 2.24;
  m.add(cyl(0.03, 0.028, poleTop, 8), O.galv, { at: [cx, 0, cz] });
  m.add(cyl(0.045, 0.045, 0.06, 8), shade(O.galv, 0.8), { at: [cx, 0, cz] });
  if (o.look === 2) {
    // the octagon, its white rim, its word; the back plain
    const oct = (r: number): [number, number][] =>
      Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        return [Math.cos(a) * r, Math.sin(a) * r];
      });
    m.add(extrude(oct(0.32), 0.012), P.white, { at: [cx, 2.08, cz + 0.04] });
    m.add(extrude(oct(0.295), 0.006), 0xc0242a, { at: [cx, 2.08, cz + 0.049] });
    m.add(extrude(oct(0.32), 0.006), O.galv, { at: [cx, 2.08, cz + 0.032] });
    words(m, "STOP", [cx, 2.08, cz + 0.053], 0.019, P.white);
    for (const y of [1.88, 2.28]) m.add(box([0.08, 0.025, 0.03]), P.steel, { at: [cx, y, cz + 0.02] });
    m.add(cyl(0.035, 0.035, 0.03, 8), O.galv, { at: [cx, poleTop, cz] });
    return;
  }
  // the blades, crossed, on the bracket at the pole's top
  const n = STREETS.length;
  const k = Math.floor(o.seed * n) % n;
  m.add(box([0.06, 0.04, 0.06], 0.006), shade(O.galv, 0.85), { at: [cx, 2.24, cz] });
  for (const [i, y] of [
    [0, 2.5],
    [1, 2.335],
  ] as const) {
    const turn = i === 0 ? 0 : Math.PI / 2;
    const name = STREETS[(k + i * 3) % n];
    m.add(box([0.88, 0.15, 0.012], 0.004), P.white, { at: [cx, y, cz], rot: [0, turn, 0] });
    m.add(box([0.86, 0.13, 0.016], 0.003), 0x1f6b3a, { at: [cx, y, cz], rot: [0, turn, 0] });
    for (const s of [1, -1]) {
      const [nx, nz] = i === 0 ? [0, 0.0085 * s] : [0.0085 * s, 0];
      words(m, name, [cx + nx, y, cz + nz], 0.0135, P.white, turn + (s < 0 ? Math.PI : 0));
    }
    // (its clamp over the blade's top edge)
    m.add(box([0.05, 0.022, 0.05], 0.004), shade(O.galv, 0.85), { at: [cx, y + 0.083, cz] });
  }
}

// ── the flag pole (2×1) ─────────────────────────────────────────────────────────────────────────

const POLE: V3 = [1, 0, 0.5];
const FLAG = { y: 3.66, w: 0.93, h: 0.62 };
/** The flag's ripple, z off its plane at x along it (fixed at the hoist). */
const ripple = (x: number) => 0.06 * Math.sin(x * 5.4 - 0.4) * Math.min(1, x / 0.5);
/** A sheet over the flag's ripple from (x0, y0) to (x1, y1) on it, `dz` off it, seen from both sides. */
function sheet(x0: number, x1: number, y0: number, y1: number, dz: number, nx = 10): BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < nx; i++) {
    const a = x0 + ((x1 - x0) * i) / nx;
    const b = x0 + ((x1 - x0) * (i + 1)) / nx;
    const za = ripple(a) + dz;
    const zb = ripple(b) + dz;
    const droop = (x: number) => -0.05 * (x / FLAG.w) ** 2;
    const q: V3[] = [
      [a, y0 + droop(a), za],
      [b, y0 + droop(b), zb],
      [b, y1 + droop(b), zb],
      [a, y1 + droop(a), za],
    ];
    pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
    pos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
  }
  return geo(pos);
}

/** A flag pole (2×1), its pole at the middle and its flag streaming over the far half: a tapered pole on its plinth, a gold ball on top, the halyard down to its
 *  cleat; its flag (live) swinging on the pole as it streams — the campus's snowflake, a pine, or
 *  stripes. */
export function flagPole(m: Model, o: Look) {
  const [px, , pz] = POLE;
  m.add(box([0.42, 0.12, 0.42], 0.02, 2), O.stoneLight, { at: [px, 0.06, pz] });
  m.add(cyl(0.07, 0.06, 0.1, 10), P.steel, { at: [px, 0.12, pz] });
  m.add(
    lathe(
      [
        [0.045, 0],
        [0.028, 4.2],
        [0.001, 4.21],
      ],
      10,
    ),
    P.alum,
    { at: [px, 0.12, pz] },
  );
  m.add(cyl(0.035, 0.035, 0.05, 8), P.brass, { at: [px, 4.32, pz] });
  m.add(ball(0.06, 10), P.brass, { at: [px, 4.43, pz] });
  // the cleat, the halyard up to the top and down the hoist
  m.add(box([0.02, 0.14, 0.03], 0.004), P.chrome, { at: [px + 0.045, 1.25, pz] });
  m.add(
    tube(
      [
        [px + 0.05, 1.2, pz],
        [px + 0.04, 3.4, pz],
        [px + 0.035, 4.34, pz],
      ],
      0.005,
      3,
      6,
    ),
    P.paperWhite,
  );
  m.add(
    tube(
      [
        [px + 0.05, 1.3, pz],
        [px + 0.055, FLAG.y, pz + 0.004],
      ],
      0.005,
      3,
      1,
    ),
    P.paperWhite,
  );
  // the flag: its cloth and its emblem, swung together round the pole (geometry turned so the nod's
  // own axis is the pole's)
  const look = o.look;
  const cloth = [0x2a5fa8, 0x2f6a3d, P.white][look] ?? 0x2a5fa8;
  const mark = look === 2 ? O.red : P.white;
  const parts: BufferGeometry[] = [];
  const x0 = 0.04;
  const x1 = x0 + FLAG.w;
  const [y0, y1] = [0, FLAG.h];
  if (look === 2) {
    // stripes, and a gold band at the hoist
    const b = FLAG.h / 5;
    for (const dz of [0.004, -0.004])
      parts.push(sheet(x0, x1, 0, b, dz), sheet(x0, x1, 2 * b, 3 * b, dz), sheet(x0, x1, 4 * b, 5 * b, dz));
  } else {
    const mx = x0 + FLAG.w / 2;
    const my = FLAG.h / 2;
    const z = ripple(mx);
    const slope = (ripple(mx + 0.01) - ripple(mx - 0.01)) / 0.02;
    const turn = -Math.atan(slope);
    for (const dz of [0.008, -0.008]) {
      const bars: BufferGeometry[] = [];
      if (look === 0) {
        // a snowflake: three bars and their twigs
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3;
          bars.push(box([0.46, 0.035, 0.004]).rotateZ(a));
          for (const end of [-1, 1])
            for (const side of [-1, 1])
              bars.push(
                box([0.1, 0.025, 0.004])
                  .translate(0.05, 0, 0)
                  .rotateZ(a + (end < 0 ? Math.PI : 0) + side * 0.8)
                  .translate(Math.cos(a) * end * 0.15, Math.sin(a) * end * 0.15, 0),
              );
        }
        bars.push(cyl(0.05, 0.05, 0.004, 6).rotateX(Math.PI / 2));
      } else {
        // a fir: three tiers, its trunk
        for (let k = 0; k < 3; k++)
          bars.push(
            extrude(
              [
                [-0.2 + k * 0.04, 0],
                [0.2 - k * 0.04, 0],
                [0, 0.2],
              ],
              0.004,
            ).translate(0, -0.18 + k * 0.12, 0),
          );
        bars.push(box([0.06, 0.08, 0.004]).translate(0, -0.22, 0));
      }
      parts.push(
        merged(bars)
          .scale(0.78, 0.78, 1)
          .rotateY(turn)
          .translate(mx, my, z + dz),
      );
    }
  }
  const nod = { kind: "nod" as const, amp: 0.2, period: 3.4, phase: o.seed };
  const at: V3 = [px, FLAG.y, pz];
  const up = (g: BufferGeometry) => g.rotateX(Math.PI / 2);
  m.live(up(sheet(x0, x1, y0, y1, 0, 14)), cloth, nod, { at, rot: [-Math.PI / 2, 0, 0] });
  m.live(up(merged(parts)), mark, nod, { at, rot: [-Math.PI / 2, 0, 0] });
  if (look === 2)
    m.live(
      up(merged([sheet(x0, x0 + 0.13, y0, y1, 0.006, 2), sheet(x0, x0 + 0.13, y0, y1, -0.006, 2)])),
      P.brass,
      nod,
      {
        at,
        rot: [-Math.PI / 2, 0, 0],
      },
    );
}

// ── the sled and ski rack (2×1) ─────────────────────────────────────────────────────────────────

const SKI_COLOURS = [0xc0392b, 0x2f6fa8, 0xe0c030, 0x1e1e20, 0x3a8a6a, 0xe6dccb];

/** A sled and ski rack (2×1): skis in pairs leant on its top rail, their tails on the ground in front
 *  of the foot rail, a pair of poles; pine, red with a little roof, or steel tube. In front of it a
 *  wooden sled, a plastic toboggan or a snow tube by its look. Its skis' colours and how many by its
 *  seed (a snowboard among them, sometimes). */
export function skiRack(m: Model, o: Look) {
  const look = o.look;
  const wood = [0xc49a6a, 0xa8392e, O.galv][look] ?? 0xc49a6a;
  const H = 1.42;
  const zr = 0.18;
  if (look === 2) {
    for (const x of [0.12, 1.88]) {
      m.add(
        tube(
          [
            [x, 0, 0.55],
            [x, H - 0.05, zr],
            [x, H, zr - 0.02],
            [x, H - 0.05, zr - 0.05],
            [x, 0, zr - 0.1],
          ],
          0.022,
          6,
          16,
        ),
        wood,
      );
    }
    m.add(rod(0.022, 0.022, 1.76, "x", 6), wood, { at: [1, H, zr - 0.02] });
    m.add(rod(0.02, 0.02, 1.76, "x", 6), wood, { at: [1, 0.14, 0.5] });
  } else {
    for (const x of [0.1, 1.9]) {
      m.add(box([0.08, H, 0.08], 0.008), wood, { at: [x, H / 2, zr] });
      m.add(box([0.08, 0.06, 0.5], 0.008), wood, { at: [x, 0.03, 0.36] });
      // (a strut out to the foot rail)
      m.add(box([0.06, 0.5, 0.06], 0.006), shade(wood, 0.9), { at: [x, 0.25, 0.36], rot: [-0.75, 0, 0] });
    }
    m.add(box([1.9, 0.08, 0.1], 0.008), wood, { at: [1, H - 0.04, zr] });
    m.add(box([1.9, 0.06, 0.06], 0.006), wood, { at: [1, 0.12, 0.54] });
    // (its pegs, between the pairs)
    for (let i = 0; i <= 4; i++)
      m.add(rod(0.012, 0.012, 0.12, "z", 6), shade(wood, 0.8), { at: [0.24 + i * 0.36, H - 0.04, zr + 0.08] });
    if (look === 1) {
      // a little pent roof over it
      m.add(box([2.0, 0.025, 0.36], 0.004), 0x3a2d26, { at: [1, H + 0.1, zr + 0.02], rot: [0.35, 0, 0] });
      for (const x of [0.1, 1.9]) m.add(box([0.06, 0.16, 0.06]), wood, { at: [x, H + 0.06, zr] });
    }
  }
  // the skis: pairs leant on the top rail, their tips curled over it
  const pairs = 2 + Math.floor(o.seed * 2.99);
  const tilt = -Math.atan2(0.42, 1.6);
  for (let k = 0; k < pairs; k++) {
    const x = 0.42 + k * 0.36 + (pairs < 4 ? 0.18 * (4 - pairs) * 0.5 : 0);
    const c = SKI_COLOURS[Math.floor(rnd(k, 1, o.seed) * SKI_COLOURS.length)];
    const board = rnd(k, 2, o.seed) > 0.8;
    for (const s of board ? [0] : [-1, 1]) {
      const w = board ? 0.26 : 0.075;
      const sx = x + s * 0.045;
      m.add(box([w, 1.62, 0.014], 0.004), c, { at: [sx, 0.845, 0.42], rot: [tilt, 0, 0] });
      m.add(box([w * 0.6, 1.62, 0.016], 0.002), shade(c, board ? 0.7 : 1.3), {
        at: [sx, 0.845, 0.421],
        rot: [tilt, 0, 0],
      });
      // (the tip curled up, the binding)
      m.add(box([w, 0.1, 0.014], 0.004), c, { at: [sx, 1.64, 0.2], rot: [tilt - 0.5, 0, 0] });
      m.add(box([w * 0.9, 0.2, 0.05], 0.01), P.ink, { at: [sx, 0.68, 0.475], rot: [tilt, 0, 0] });
    }
  }
  // a pair of poles at the end, their baskets
  for (const s of [-1, 1]) {
    const x = 1.78 + s * 0.03;
    m.add(
      tube(
        [
          [x, 0.02, 0.5],
          [x - s * 0.01, 1.26, zr + 0.07],
        ],
        0.009,
        5,
        1,
      ),
      P.steel,
    );
    m.add(ring(0.04, 0.005, 3, 10), P.ink, { at: [x, 0.1, 0.48] });
    m.add(cyl(0.018, 0.016, 0.14, 6), P.ink, { at: [x - s * 0.01, 1.2, zr + 0.08] });
  }
  // in front, on the ground
  if (look === 1) {
    // a plastic toboggan, its front curled up, a rope through it
    const out: [number, number][] = [
      [0, 0],
      [0.9, 0],
      [1.0, 0.04],
      [1.04, 0.14],
      [1.0, 0.18],
      [0.95, 0.08],
      [0.88, 0.04],
      [0, 0.04],
    ];
    m.add(extrude(out, 0.36, 0.01, 2), 0xe0601e, { at: [0.36, 0.012, 0.8] });
    for (const s of [-1, 1])
      m.add(box([0.86, 0.06, 0.012]), shade(0xe0601e, 0.85), { at: [0.8, 0.05, 0.8 + s * 0.18] });
    m.add(
      tube(
        [
          [1.36, 0.16, 0.66],
          [1.5, 0.05, 0.75],
          [1.46, 0.01, 0.92],
        ],
        0.006,
        3,
        8,
      ),
      P.paperWhite,
    );
  } else if (look === 2) {
    // a snow tube, lying
    m.add(ring(0.16, 0.07, 8, 20), 0x2f6fa8, { at: [0.95, 0.07, 0.76] });
    m.add(cyl(0.1, 0.1, 0.02, 14), P.rubber, { at: [0.95, 0.01, 0.76] });
    for (const s of [-1, 1]) m.add(box([0.08, 0.025, 0.035], 0.01), P.ink, { at: [0.95 + s * 0.2, 0.14, 0.76] });
  } else {
    // a wooden sled on red runners, its steering bar, a rope
    for (const s of [-1, 1]) {
      const z = 0.78 + s * 0.15;
      m.add(
        tube(
          [
            [0.32, 0.08, z],
            [0.38, 0.03, z],
            [1.2, 0.03, z],
            [1.36, 0.06, z],
            [1.34, 0.13, z],
            [1.26, 0.12, z],
          ],
          0.012,
          5,
          20,
        ),
        O.red,
      );
      for (const x of [0.5, 0.85, 1.15]) m.add(box([0.02, 0.1, 0.02]), O.red, { at: [x, 0.065, z] });
    }
    for (let i = 0; i < 4; i++)
      m.add(box([0.86, 0.018, 0.07], 0.004), 0xc49a6a, { at: [0.77, 0.12, 0.67 + i * 0.075] });
    m.add(box([0.06, 0.02, 0.4], 0.006), 0xa77b4c, { at: [1.22, 0.135, 0.78] });
    m.add(
      tube(
        [
          [1.25, 0.14, 0.62],
          [1.42, 0.05, 0.7],
          [1.44, 0.035, 0.86],
          [1.25, 0.14, 0.94],
        ],
        0.006,
        3,
        10,
      ),
      0xd9c9a0,
    );
  }
}

// ── the snowman (1×1) ───────────────────────────────────────────────────────────────────────────

/** A snowman built of snow: three lumpy balls on a drift, coal eyes and smile, a carrot nose, stick
 *  arms; a top hat and a red scarf, a bobble hat and a striped scarf, or a pail and a broom with a
 *  tartan scarf. By its seed a corncob pipe, or mittens on its twigs. */
export function snowman(m: Model, o: Look) {
  const [cx, cz] = [0.5, 0.5];
  const s = o.seed * 10;
  m.add(
    lathe(
      [
        [0.001, 0],
        [0.44, 0],
        [0.36, 0.06],
        [0.2, 0.1],
        [0.001, 0.11],
      ],
      14,
    ),
    O.snowShade,
    { at: [cx, 0, cz] },
  );
  m.add(lump(0.36, 14, s), O.snow, { at: [cx, 0.335, cz], scale: [1, 0.9, 1] });
  m.add(lump(0.27, 12, s + 1), O.snow, { at: [cx, 0.83, cz] });
  m.add(lump(0.2, 12, s + 2, 0.04), O.snow, { at: [cx, 1.24, cz] });
  // the face: eyes, the smile, the carrot
  for (const sx of [-1, 1]) m.add(ball(0.022, 5), O.coal, { at: [cx + sx * 0.07, 1.29, cz + 0.175] });
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + i * 0.3;
    m.add(ball(0.015, 4), O.coal, {
      at: [cx + Math.sin(a) * 0.1, 1.17 - Math.cos(a) * 0.03, cz + 0.18 - Math.abs(a) * 0.02],
    });
  }
  m.add(cyl(0.03, 0.002, 0.17, 7).rotateX(Math.PI / 2), O.carrot, { at: [cx, 1.23, cz + 0.19], rot: [-0.1, 0, 0] });
  for (let i = 0; i < 3; i++)
    m.add(ring(0.025 - i * 0.006, 0.003, 3, 8).rotateX(Math.PI / 2), shade(O.carrot, 0.75), {
      at: [cx, 1.23 - 0.003 * i, cz + 0.22 + i * 0.035],
    });
  // its buttons
  for (let i = 0; i < 3; i++)
    m.add(ball(0.025, 5), O.coal, {
      at: [cx, 0.95 - i * 0.12, cz + 0.27 - Math.abs(i - 1) * 0.02 - (i === 2 ? 0.02 : 0)],
    });
  // the stick arms, a twig or two off each
  for (const sx of [-1, 1]) {
    const sh: V3 = [cx + sx * 0.22, 0.92, cz];
    const el: V3 = [cx + sx * 0.33, 1.02, cz + 0.04];
    const hand: V3 = [cx + sx * 0.43, 1.12, cz + 0.02];
    m.add(tube([sh, el, hand], 0.013, 5, 6), 0x5a3a22);
    m.add(tube([el, [el[0] + sx * 0.05, el[1] + 0.09, el[2]]], 0.007, 4, 1), 0x5a3a22);
    m.add(tube([hand, [hand[0] + sx * 0.03, hand[1] + 0.07, hand[2] + 0.02]], 0.006, 4, 1), 0x5a3a22);
    m.add(tube([hand, [hand[0] + sx * 0.05, hand[1] + 0.02, hand[2] - 0.03]], 0.006, 4, 1), 0x5a3a22);
    if (o.seed < 0.3)
      m.add(cushion([0.07, 0.09, 0.04], 0.4, 1), 0xc0392b, {
        at: [hand[0], hand[1] - 0.01, hand[2]],
        rot: [0, 0, sx * 0.5],
      });
  }
  // the scarf round its neck, a tail hanging
  const scarf = [O.red, 0x2f6fa8, 0x3a6a3a][o.look] ?? O.red;
  m.add(ring(0.17, 0.045, 6, 16), scarf, { at: [cx, 1.07, cz], scale: [1, 0.8, 1] });
  m.add(box([0.09, 0.32, 0.03], 0.01), scarf, { at: [cx + 0.12, 0.92, cz + 0.19], rot: [0.25, 0, 0.12] });
  if (o.look === 1)
    for (let i = 0; i < 4; i++)
      m.add(box([0.094, 0.025, 0.034]), P.white, {
        at: [cx + 0.12 - i * 0.008, 0.82 + i * 0.07, cz + 0.19 + i * 0.016],
        rot: [0.25, 0, 0.12],
      });
  if (o.look === 2)
    for (let i = 0; i < 3; i++)
      m.add(box([0.094, 0.012, 0.034]), 0xe0c030, {
        at: [cx + 0.12 - i * 0.008, 0.82 + i * 0.09, cz + 0.19 + i * 0.02],
        rot: [0.25, 0, 0.12],
      });
  // its hat
  if (o.look === 1) {
    m.add(
      lathe(
        [
          [0.17, 0],
          [0.175, 0.04],
          [0.16, 0.09],
          [0.11, 0.15],
          [0.001, 0.17],
        ],
        14,
      ),
      0x2f6fa8,
      { at: [cx, 1.35, cz] },
    );
    m.add(cyl(0.18, 0.18, 0.05, 14), P.white, { at: [cx, 1.34, cz] });
    m.add(ball(0.05, 7), P.white, { at: [cx, 1.53, cz] });
  } else if (o.look === 2) {
    // an upturned pail, its handle; the broom leant in its arm
    m.add(cyl(0.12, 0.155, 0.17, 14), O.galv, { at: [cx, 1.37, cz], rot: [0, 0, 0.12] });
    m.add(ring(0.156, 0.006, 3, 16), shade(O.galv, 0.8), { at: [cx - 0.004, 1.375, cz], rot: [0, 0, 0.12] });
    m.add(
      tube(
        [
          [cx - 0.15, 1.42, cz],
          [cx, 1.33, cz - 0.2],
          [cx + 0.15, 1.38, cz],
        ],
        0.004,
        3,
        8,
      ),
      P.steel,
    );
    m.add(
      tube(
        [
          [cx + 0.34, 0.25, cz + 0.13],
          [cx + 0.44, 1.55, cz - 0.0],
        ],
        0.013,
        5,
        1,
      ),
      0x9a7448,
    );
    m.add(cyl(0.08, 0.035, 0.28, 8), 0xc8a560, { at: [cx + 0.33, 0.0, cz + 0.14] });
    m.add(ring(0.04, 0.008, 3, 10), O.red, { at: [cx + 0.335, 0.24, cz + 0.135] });
  } else {
    m.add(cyl(0.2, 0.2, 0.02, 16), P.ink, { at: [cx, 1.39, cz] });
    m.add(cyl(0.13, 0.135, 0.24, 16), P.ink, { at: [cx, 1.4, cz] });
    m.add(cyl(0.136, 0.136, 0.04, 16), O.red, { at: [cx, 1.42, cz] });
    m.add(ball(0.03, 6), 0x2f6a3d, { at: [cx + 0.12, 1.46, cz + 0.06] });
  }
  if (o.seed > 0.65) {
    // a corncob pipe
    m.add(cyl(0.02, 0.02, 0.05, 8), 0xd8b870, { at: [cx + 0.1, 1.13, cz + 0.22] });
    m.add(
      tube(
        [
          [cx + 0.1, 1.14, cz + 0.22],
          [cx + 0.05, 1.16, cz + 0.17],
        ],
        0.005,
        4,
        1,
      ),
      0x5a3a22,
    );
  }
}

// ── the bird feeder (1×1) ───────────────────────────────────────────────────────────────────────

const BIRDS: [number, number][] = [
  [0x7a5a3a, 0xe06a2a], // a robin
  [0x4f7fb8, 0xf2d23a], // a blue tit
  [0xc0262a, 0x2a1a1a], // a cardinal
  [0x8a8a88, 0x1e1e1e], // a chickadee
];
/** A small bird (live): its feet at `at`, facing `yaw`; its body, and its breast or cap apart in
 *  their own colour, moving as `anim` has it (pecking: a nod down and up). */
function bird(m: Model, at: V3, yaw: number, kind: number, anim: LiveAnim, down: number) {
  const [body, accent] = BIRDS[kind % BIRDS.length];
  const b = merged([
    ball(0.032, 7).scale(1.5, 1, 1.05).rotateZ(0.25).translate(0, 0.045, 0),
    ball(0.024, 7).translate(0.042, 0.075, 0),
    box([0.055, 0.008, 0.03]).rotateZ(0.35).translate(-0.065, 0.05, 0),
    cyl(0.008, 0.001, 0.02, 4)
      .rotateZ(-Math.PI / 2)
      .translate(0.064, 0.074, 0),
    box([0.004, 0.025, 0.004]).translate(0.0, 0.012, 0.012),
    box([0.004, 0.025, 0.004]).translate(0.0, 0.012, -0.012),
  ]);
  const a =
    kind % BIRDS.length >= 2
      ? merged([ball(0.0245, 6).scale(1, 0.55, 1).translate(0.044, 0.088, 0)])
      : merged([ball(0.026, 6).scale(1, 1.1, 0.9).translate(0.024, 0.04, 0)]);
  for (const [g, c] of [
    [b, body],
    [a, accent],
  ] as const)
    m.live(g, c, anim, { at, rot: [0, yaw, -down] });
}

/** A bird feeder (1×1) on its post: an open table with a roof, a red cottage with its door hole and
 *  perch, or a tube feeder on a shepherd's crook; seed on it, and its birds (by its seed) — two
 *  pecking, one that comes and goes. */
export function birdFeeder(m: Model, o: Look) {
  const [cx, cz] = [0.5, 0.5];
  const species = Math.floor(o.seed * 4);
  let perches: { at: V3; yaw: number }[];
  if (o.look === 2) {
    // a shepherd's crook: up, over and down; the tube hung from it
    m.add(
      tube(
        [
          [cx - 0.15, 0, cz],
          [cx - 0.15, 1.5, cz],
          [cx - 0.12, 1.72, cz],
          [cx, 1.78, cz],
          [cx + 0.12, 1.72, cz],
          [cx + 0.14, 1.62, cz],
        ],
        0.013,
        6,
        24,
      ),
      0x1e1e20,
    );
    const tx = cx + 0.14;
    m.add(cyl(0.004, 0.004, 0.08, 4), P.steel, { at: [tx, 1.54, cz] });
    m.add(cyl(0.06, 0.03, 0.05, 10), 0x2f5a3a, { at: [tx, 1.49, cz] });
    m.add(cyl(0.05, 0.05, 0.36, 10), 0x8a6a3a, { at: [tx, 1.12, cz] });
    m.live(cyl(0.055, 0.055, 0.38, 12), O.glass, { kind: "still" }, { at: [tx, 1.11, cz], glass: true });
    m.add(cyl(0.065, 0.065, 0.04, 10), 0x2f5a3a, { at: [tx, 1.08, cz] });
    m.add(ring(0.08, 0.006, 3, 14), 0x2f5a3a, { at: [tx, 1.1, cz] });
    for (const y of [1.18, 1.33]) {
      m.add(rod(0.004, 0.004, 0.22, "z", 4), P.chrome, { at: [tx, y, cz] });
      m.add(cyl(0.016, 0.016, 0.02, 6).rotateX(Math.PI / 2), 0x2f5a3a, { at: [tx, y + 0.03, cz + 0.06] });
    }
    perches = [
      { at: [tx, 1.18, cz + 0.1], yaw: Math.PI / 2 },
      { at: [tx, 1.33, cz - 0.1], yaw: -Math.PI / 2 },
      { at: [tx + 0.08, 1.105, cz + 0.02], yaw: Math.PI },
    ];
  } else {
    const wood = 0x9a7448;
    m.add(box([0.07, 1.45, 0.07], 0.006), shade(wood, 0.85), { at: [cx, 0.725, cz] });
    m.add(box([0.1, 0.05, 0.1], 0.006), shade(wood, 0.85), { at: [cx, 0.03, cz] });
    for (const s of [-1, 1])
      m.add(box([0.03, 0.18, 0.03]), shade(wood, 0.85), { at: [cx + s * 0.06, 1.37, cz], rot: [0, 0, s * 0.7] });
    // the tray, its lip, the seed on it
    m.add(box([0.38, 0.025, 0.36], 0.004), wood, { at: [cx, 1.46, cz] });
    for (const s of [-1, 1]) {
      m.add(box([0.38, 0.03, 0.015]), shade(wood, 0.9), { at: [cx, 1.485, cz + s * 0.175] });
      m.add(box([0.015, 0.03, 0.36]), shade(wood, 0.9), { at: [cx + s * 0.185, 1.485, cz] });
    }
    for (let i = 0; i < 16; i++)
      m.add(ball(0.01, 4), [0x8a6a3a, 0x3a2d26, 0xd8c8a0][i % 3], {
        at: [cx - 0.13 + rnd(i, 1, 3) * 0.26, 1.48, cz - 0.12 + rnd(i, 2, 3) * 0.24],
        scale: [1.3, 0.6, 1],
      });
    const roof = o.look === 1 ? 0xa8392e : shade(wood, 0.75);
    if (o.look === 1) {
      // a cottage on the tray: its walls, the door hole and a perch peg
      m.add(box([0.22, 0.18, 0.18], 0.004), P.white, { at: [cx - 0.04, 1.565, cz - 0.04] });
      m.add(
        extrude(
          [
            [-0.09, 0],
            [0.09, 0],
            [0, 0.08],
          ],
          0.22,
        ),
        P.white,
        { at: [cx - 0.04, 1.655, cz - 0.04], rot: [0, Math.PI / 2, 0] },
      );
      m.add(cyl(0.03, 0.03, 0.004, 10).rotateX(Math.PI / 2), P.ink, { at: [cx - 0.04, 1.6, cz + 0.052] });
      m.add(rod(0.004, 0.004, 0.05, "z", 4), wood, { at: [cx - 0.04, 1.555, cz + 0.07] });
      for (const s of [-1, 1])
        m.add(box([0.3, 0.015, 0.18], 0.003), roof, {
          at: [cx - 0.04, 1.705, cz - 0.04 + s * 0.065],
          rot: [s * 0.78, 0, 0],
        });
    } else {
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        m.add(box([0.02, 0.2, 0.02]), shade(wood, 0.9), { at: [cx + dx * 0.16, 1.57, cz + dz * 0.15] });
      for (const s of [-1, 1])
        m.add(box([0.44, 0.015, 0.25], 0.003), roof, { at: [cx, 1.73, cz + s * 0.1], rot: [s * 0.55, 0, 0] });
      m.add(box([0.44, 0.03, 0.03]), shade(roof, 0.8), { at: [cx, 1.79, cz] });
      // a fat ball hung under it in its net
      m.add(cyl(0.002, 0.002, 0.06, 3), P.ink, { at: [cx + 0.14, 1.39, cz + 0.12] });
      m.add(ball(0.035, 7), 0xc8b080, { at: [cx + 0.14, 1.36, cz + 0.12] });
    }
    perches =
      o.look === 1
        ? [
            { at: [cx + 0.12, 1.47, cz + 0.13], yaw: Math.PI * 0.8 },
            { at: [cx - 0.15, 1.47, cz + 0.12], yaw: Math.PI * 0.1 },
            { at: [cx - 0.04, 1.555, cz + 0.095], yaw: -Math.PI / 2 },
          ]
        : [
            { at: [cx + 0.1, 1.47, cz + 0.08], yaw: Math.PI * 0.85 },
            { at: [cx - 0.12, 1.47, cz - 0.02], yaw: Math.PI * 0.15 },
            { at: [cx + 0.0, 1.8, cz], yaw: Math.PI * 0.5 },
          ];
  }
  // the birds: two pecking (each its own beat), one coming and going
  const ph = o.seed;
  bird(m, perches[0].at, perches[0].yaw, species, { kind: "nod", amp: 0.32, period: 1.3, phase: ph }, 0.32);
  bird(m, perches[1].at, perches[1].yaw, species + 1, { kind: "nod", amp: 0.3, period: 1.75, phase: ph + 0.4 }, 0.3);
  bird(m, perches[2].at, perches[2].yaw, species + 2, { kind: "blink", period: 9, on: 0.55, phase: ph }, 0);
}

// ── the patio heater (1×1) ──────────────────────────────────────────────────────────────────────

/** A patio heater (1×1): a mushroom — its tank's cover, the pole, the emitter glowing under its wide
 *  reflector while it's on — in stainless or black; or a glass flame tower, its flame (live) dancing
 *  up the tube. */
export function patioHeater(m: Model, o: Look) {
  const on = o.on !== false;
  const [cx, cz] = [0.5, 0.5];
  if (o.look === 2) {
    const frame = 0x2b2b2e;
    m.add(box([0.48, 0.06, 0.48], 0.01), frame, { at: [cx, 0.03, cz] });
    m.add(box([0.44, 0.5, 0.44], 0.01), frame, { at: [cx, 0.31, cz] });
    m.add(box([0.38, 0.03, 0.006]), P.steelLight, { at: [cx, 0.45, cz + 0.221] });
    m.add(cyl(0.02, 0.02, 0.02, 8).rotateX(Math.PI / 2), P.chrome, { at: [cx + 0.12, 0.36, cz + 0.225] });
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      m.add(
        tube(
          [
            [cx + dx * 0.2, 0.56, cz + dz * 0.2],
            [cx + dx * 0.15, 2.12, cz + dz * 0.15],
          ],
          0.014,
          5,
          1,
        ),
        frame,
      );
    m.add(box([0.46, 0.08, 0.46], 0.01), frame, { at: [cx, 2.16, cz] });
    m.add(box([0.36, 0.03, 0.36], 0.01), shade(frame, 1.3), { at: [cx, 2.215, cz] });
    // the burner at its foot, the tube of glass, the flame in it
    m.add(cyl(0.07, 0.07, 0.04, 12), P.steelLight, { at: [cx, 0.56, cz] });
    m.add(cyl(0.07, 0.07, 0.02, 12), P.steelLight, { at: [cx, 2.1, cz] });
    m.live(cyl(0.065, 0.065, 1.52, 14), O.glass, { kind: "still" }, { at: [cx, 0.58, cz], glass: true });
    if (on)
      for (let i = 0; i < 3; i++)
        m.live(
          tongue(0.04 - i * 0.008, 1.3 - i * 0.35),
          [0xff6a2a, 0xff9a3a, 0xffe08a][i],
          { kind: "flame", phase: o.seed + i * 0.3 },
          { at: [cx, 0.6, cz + 0.005 * i], glow: true },
        );
    return;
  }
  const body = o.look === 1 ? 0x2b2b2e : 0xb8bdc4;
  const trim = o.look === 1 ? 0xb87333 : 0x8a8f96;
  // the tank's cover, its foot ring, the door seam and the knob
  m.add(cyl(0.26, 0.26, 0.04, 18), shade(body, 0.85), { at: [cx, 0, cz] });
  m.add(
    lathe(
      [
        [0.23, 0],
        [0.225, 0.62],
        [0.19, 0.72],
        [0.06, 0.78],
        [0.001, 0.785],
      ],
      18,
    ),
    body,
    { at: [cx, 0.04, cz] },
  );
  m.add(box([0.006, 0.5, 0.006]), shade(body, 0.6), { at: [cx + 0.1, 0.36, cz + 0.205] });
  m.add(box([0.2, 0.006, 0.006]), shade(body, 0.6), { at: [cx, 0.61, cz + 0.225] });
  m.add(cyl(0.025, 0.025, 0.025, 10).rotateX(Math.PI / 2), trim, { at: [cx - 0.06, 0.66, cz + 0.215] });
  m.add(cyl(0.012, 0.012, 0.02, 8).rotateX(Math.PI / 2), 0xc0242a, { at: [cx + 0.04, 0.66, cz + 0.218] });
  // the pole, the emitter's guard, the glowing core in it
  m.add(cyl(0.034, 0.03, 1.12, 10), body, { at: [cx, 0.8, cz] });
  m.add(cyl(0.05, 0.05, 0.04, 10), trim, { at: [cx, 1.88, cz] });
  m.add(cyl(0.1, 0.1, 0.24, 14), on ? 0xff5a1a : 0x3a3634, { at: [cx, 1.92, cz], glow: on });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    m.add(box([0.008, 0.26, 0.008]), shade(body, 0.75), {
      at: [cx + Math.cos(a) * 0.115, 2.04, cz + Math.sin(a) * 0.115],
    });
  }
  for (const y of [1.92, 2.16]) m.add(ring(0.115, 0.006, 3, 16), shade(body, 0.75), { at: [cx, y, cz] });
  if (on)
    m.live(ring(0.07, 0.012, 3, 14), 0xffb060, { kind: "flame", phase: o.seed }, { at: [cx, 2.0, cz], glow: true });
  // the reflector, its cap
  m.add(
    lathe(
      [
        [0.001, 2.31],
        [0.42, 2.21],
        [0.43, 2.19],
        [0.06, 2.24],
        [0.001, 2.25],
      ],
      20,
    ),
    body,
    { at: [cx, 0, cz] },
  );
  m.add(cyl(0.07, 0.04, 0.06, 10), trim, { at: [cx, 2.29, cz] });
  m.add(ball(0.02, 6), trim, { at: [cx, 2.36, cz] });
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  fire_pit: firePit,
  log_seat: logSeat,
  picnic_table: picnicTable,
  bike_rack: bikeRack,
  bus_shelter: busShelter,
  mailbox,
  street_sign: streetSign,
  flag_pole: flagPole,
  ski_rack: skiRack,
  snowman,
  bird_feeder: birdFeeder,
  patio_heater: patioHeater,
};
