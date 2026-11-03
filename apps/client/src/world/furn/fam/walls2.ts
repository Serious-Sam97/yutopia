import { glyphDots } from "@yutopia/shared/glyphs";
import { type BufferGeometry, Float32BufferAttribute, BufferGeometry as Geo, Quaternion, Vector3 } from "three";
import { ball, box, cyl, extrude, type Look, lathe, leaf, type Model, merged, ring, rod, tube, type V3 } from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 12 (docs/plan/68-more-furniture.md): On the walls — the new kinds' models, in the wall's
// frame as walls.ts has them (x along the wall across the footprint, y up — the height it hangs at, m —
// z out into the room, the wall's face at z 0.1), Rich and cel; their catalog entries, shapes and hang
// sizes in the shared fam/walls2.ts. What would be live off the world's own state (a clock's hands, the
// calendar's day, the thermostat's reading, the members' pins) is drawn as a plausible moment here — the
// calendar's from the client's date when it's built; see each piece.

export const LOOKS: Record<string, readonly string[]> = {
  cuckoo_clock: ["Black Forest", "Painted chalet", "Modern"],
  world_clocks: ["Brass station", "Black & white", "Walnut"],
  wall_calendar: ["Photo calendar", "Botanical kraft", "Tear-off day"],
  thermostat: ["Smart dial", "Round dial", "Digital"],
  members_map: ["Campus map", "Blueprint", "Vintage"],
  pegboard: ["Pine", "Black steel", "Mint"],
  wall_skateboard: ["Flames", "Checker", "Sunset"],
  framed_records: ["Black frames", "Oak frames", "Gold & platinum"],
  tapestry: ["Mountains", "Mandala", "Macramé"],
  wall_mirror: ["Round brass", "Arched black", "Sunburst"],
  carved_antlers: ["Carved oak", "White painted", "Gold leaf"],
  exit_sign: ["Running man", "EXIT"],
  fire_alarm: ["Bell & pull station", "Break-glass point", "Horn & T-bar"],
  guitar_hooks: ["Oak rail", "Black hooks"],
};

const FACE = 0.1; // the wall's face
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
const UP = new Vector3(0, 1, 0);

/** A board out from the wall: x0..x1 across, y0..y1 up, `d` deep from the wall's face. */
function slab(m: Model, x0: number, x1: number, y0: number, y1: number, d: number, c: number, bevel = 0.006) {
  m.add(box([x1 - x0, y1 - y0, d], bevel), c, { at: [(x0 + x1) / 2, (y0 + y1) / 2, FACE + d / 2] });
}
/** A frame's four bars round x0..x1 × y0..y1 (its inside), `w` wide, its front at `front`. */
function bars(m: Model, x0: number, x1: number, y0: number, y1: number, w: number, front: number, c: number) {
  const d = front - FACE;
  const z = FACE + d / 2;
  m.add(box([x1 - x0 + 2 * w, w, d], 0.004), c, { at: [(x0 + x1) / 2, y1 + w / 2, z] });
  m.add(box([x1 - x0 + 2 * w, w, d], 0.004), c, { at: [(x0 + x1) / 2, y0 - w / 2, z] });
  m.add(box([w, y1 - y0, d], 0.004), c, { at: [x0 - w / 2, (y0 + y1) / 2, z] });
  m.add(box([w, y1 - y0, d], 0.004), c, { at: [x1 + w / 2, (y0 + y1) / 2, z] });
}
/** Something flat on a face at z (a label, a stripe): its middle (x, y), w × h, tipped `tilt` rad. */
function sheet(m: Model, x: number, y: number, z: number, w: number, h: number, c: number, tilt = 0, glow = false) {
  m.add(box([w, h, 0.002]), c, { at: [x, y, z + 0.001], rot: [0, 0, tilt], glow });
}
/** A disc facing the room at (x, y), its back at z. */
function disc(m: Model, x: number, y: number, z: number, r: number, c: number, d = 0.002, seg = 24, glow = false) {
  m.add(cyl(r, r, d, seg), c, { at: [x, y, z], rot: [Math.PI / 2, 0, 0], glow });
}
/** A strip along a line on a face at z, `w` wide (a road, a river, a string). */
function strip(m: Model, pts: [number, number][], w: number, z: number, c: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    m.add(box([len + w * 0.6, w, 0.002]), c, {
      at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z + 0.001],
      rot: [0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])],
    });
  }
}
/** Words in the shared dot face on a face at z, centred on (cx, cy), each dot `p` across, as one
 *  geometry — or null for none. */
function words(text: string, cx: number, cy: number, z: number, p: number): BufferGeometry | null {
  const pos: number[] = [];
  const d = p * 0.82;
  const x = cx - (text.length * 6 * p - p) / 2;
  const y = cy + 3.5 * p;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) {
      const x0 = x + (i * 6 + c) * p;
      const y1 = y - r * p;
      pos.push(x0, y1 - d, z, x0 + d, y1 - d, z, x0 + d, y1, z, x0, y1 - d, z, x0 + d, y1, z, x0, y1, z);
    }
  return pos.length ? geo(pos) : null;
}
function say(m: Model, text: string, cx: number, cy: number, z: number, p: number, c: number, glow = false) {
  const g = words(text, cx, cy, z, p);
  if (g) m.add(g, c, { glow });
}
/** A clock's hand from (x, y) at angle `a` (0 up, clockwise), `len` long, `w` wide, at z. */
function hand(m: Model, x: number, y: number, z: number, a: number, len: number, w: number, c: number) {
  m.add(box([w, len, 0.002]), c, {
    at: [x + (Math.sin(a) * len) / 2 - Math.sin(a) * 0.012, y + (Math.cos(a) * len) / 2 - Math.cos(a) * 0.012, z],
    rot: [0, 0, -a],
  });
}
/** A rod from a to b, tapering r0 → r1 (an antler's beam, a tine). */
/** A hand that keeps the time (live): pointing up at rest, turned by the clock (kit.ts "clock"). */
function liveHand(
  m: Model,
  x: number,
  y: number,
  z: number,
  period: number,
  len: number,
  w: number,
  c: number,
  zone?: number,
) {
  m.live(box([w, len, 0.002]).translate(0, len / 2 - 0.012, 0), c, { kind: "clock", period, zone }, { at: [x, y, z] });
}
function limb(m: Model, a: V3, b: V3, r0: number, r1: number, c: number, seg = 7) {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = cyl(r0, r1, len, seg).applyQuaternion(new Quaternion().setFromUnitVectors(UP, d.normalize()));
  m.add(g, c, { at: a });
}
/** A run of chain from (x, y0) down to y1: links turned alternately, at z. */
function chain(m: Model, x: number, y0: number, y1: number, z: number, c: number) {
  const n = Math.max(1, Math.round((y0 - y1) / 0.013));
  for (let i = 0; i < n; i++)
    m.add(box([0.007, 0.014, 0.0025]), c, {
      at: [x, y0 - (i + 0.5) * ((y0 - y1) / n), z],
      rot: [0, i % 2 ? Math.PI / 2 : 0, 0],
    });
}

// ── the cuckoo clock (1×1) ────────────────────────────────────────────────────────────────────────
/** A chalet with a pitched roof: the dial under the gable, the bird peeking out of its little door,
 *  carved leaves (Black Forest), shingles, shutters and a balcony (painted), or a plain white house
 *  (modern); the pendulum swinging under it, the two weights on their chains — pinecones or plain
 *  cylinders — one wound higher than the other by its seed. The world could send the bird out on the
 *  hour (needs the world's clock: see the family's report). */
function cuckooClock(m: Model, o: Look) {
  const L = o.look;
  const X = 0.5;
  const body = [0x5a3620, 0xefe3c8, 0xf2f0ea][L] ?? 0x5a3620;
  const roof = [0x3e2414, 0xa83a2a, 0x2b2b2e][L] ?? 0x3e2414;
  const trim = [0x7a4a2a, 0x5a3a24, 0xd8d4cc][L] ?? 0x7a4a2a;
  const D = 0.13; // the case's depth
  const F = FACE + D; // its front
  const [y0, y1] = [1.58, 1.9];
  // the case, the gable over it
  m.add(box([0.3, y1 - y0, D], 0.006), body, { at: [X, (y0 + y1) / 2, FACE + D / 2] });
  m.add(
    extrude(
      [
        [-0.15, 0],
        [0.15, 0],
        [0, 0.14],
      ],
      D - 0.004,
    ),
    body,
    { at: [X, y1, FACE + D / 2] },
  );
  // the roof: two boards out over the gable and the front
  const slope = Math.atan2(0.14, 0.15);
  const [cs, sn] = [Math.cos(slope), Math.sin(slope)];
  for (const s of [-1, 1]) {
    // (its middle half way down the gable's edge, out by half its thickness, over the eave a little)
    const at: V3 = [X + s * (0.075 + 0.0225 * cs + 0.008 * sn), y1 + 0.07 - 0.0225 * sn + 0.008 * cs, FACE + 0.085];
    const th = -s * slope;
    m.add(box([0.25, 0.016, 0.17], 0.003), roof, { at, rot: [0, 0, th] });
    if (L === 1)
      // (shingles in rows down it)
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 5; k++) {
          const u = -0.09 + r * 0.06;
          const v = -0.07 + k * 0.035 + (r % 2) * 0.017;
          if (v > 0.08) continue;
          m.add(box([0.055, 0.008, 0.032]), shade(roof, 0.85 + 0.15 * ((r + k) % 2)), {
            at: [
              at[0] + u * Math.cos(th) - Math.sin(th) * 0.011,
              at[1] + u * Math.sin(th) + Math.cos(th) * 0.011,
              at[2] + v,
            ],
            rot: [0, 0, th],
          });
        }
  }
  // the ridge, a finial (a bird carved on it in the Black Forest's)
  if (L === 0) {
    m.add(ball(0.022, 8), trim, { at: [X, y1 + 0.17, FACE + 0.1], scale: [1.4, 0.9, 0.8] });
    m.add(ball(0.014, 8), trim, { at: [X + 0.03, y1 + 0.19, FACE + 0.1] });
    m.add(cyl(0.006, 0.001, 0.02, 5), 0xc9a24a, { at: [X + 0.045, y1 + 0.19, FACE + 0.1], rot: [0, 0, -Math.PI / 2] });
    m.add(box([0.04, 0.012, 0.01], 0.002), trim, { at: [X - 0.03, y1 + 0.175, FACE + 0.1], rot: [0, 0, 0.4] });
    // leaves along the eaves, fanned round the dial
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const a = s * (0.3 + t * 1.6);
        const g = leaf(0.07, 0.035, 0.12, 0.05, 4)
          .rotateX(-Math.PI / 2)
          .rotateZ(a);
        m.add(g, i % 2 ? 0x4a2a16 : 0x6b4128, { at: [X + s * (0.11 + 0.02 * t), 1.82 - t * 0.17, F + 0.005] });
      }
      for (let i = 0; i < 3; i++) {
        const g = leaf(0.06, 0.03, 0.12, 0.04, 4)
          .rotateX(-Math.PI / 2)
          .rotateZ(-s * (0.6 + i * 0.5));
        m.add(g, 0x4a2a16, { at: [X + s * (0.07 + i * 0.03), y1 + 0.02 + i * 0.005, F + 0.004] });
      }
    }
  } else if (L === 1) {
    // timbers over the plaster, shutters by the dial, a balcony with its rail and flowers
    for (const [x, y, w, h] of [
      [X, y1 - 0.01, 0.3, 0.014],
      [X, y0 + 0.08, 0.3, 0.014],
      [X - 0.144, (y0 + y1) / 2, 0.012, y1 - y0],
      [X + 0.144, (y0 + y1) / 2, 0.012, y1 - y0],
    ])
      sheet(m, x, y, F, w, h, trim);
    for (const s of [-1, 1]) {
      m.add(box([0.035, 0.11, 0.008], 0.002), 0x3f6b4a, { at: [X + s * 0.115, 1.765, F + 0.004] });
      for (let k = 0; k < 4; k++) sheet(m, X + s * 0.115, 1.73 + k * 0.024, F + 0.008, 0.026, 0.004, 0x2f5238);
    }
    m.add(box([0.32, 0.012, 0.05], 0.002), trim, { at: [X, y0 + 0.02, F + 0.02] });
    for (let k = 0; k < 9; k++)
      m.add(box([0.008, 0.05, 0.008]), trim, { at: [X - 0.14 + k * 0.035, y0 + 0.05, F + 0.04] });
    m.add(box([0.32, 0.01, 0.01]), trim, { at: [X, y0 + 0.078, F + 0.04] });
    for (let k = 0; k < 6; k++)
      m.add(ball(0.009, 5), [0xd8402a, 0xf2d24a, 0xe86a9a][k % 3], {
        at: [X - 0.12 + k * 0.048, y0 + 0.088, F + 0.035],
      });
  } else {
    // (a modern one's door ringed in its colour)
    m.add(ring(0.028, 0.003, 3, 16).rotateX(Math.PI / 2), 0xf2b630, { at: [X, 1.955, F + 0.002] });
  }
  // the bird's door under the gable, swung open, the bird looking out
  m.add(box([0.044, 0.05, 0.004]), 0x1a1210, { at: [X, 1.955, F + 0.001] });
  m.add(box([0.044, 0.05, 0.006], 0.001), L === 2 ? body : trim, {
    at: [X - 0.022 + Math.cos(1.6) * 0.022, 1.955, F + 0.004 + Math.sin(1.6) * 0.022],
    rot: [0, -1.6, 0],
  });
  const bird = [0x8a5a32, 0x4a6aa0, 0xf2c230][L] ?? 0x8a5a32;
  m.add(ball(0.017, 8), bird, { at: [X, 1.948, F + 0.018], scale: [1, 0.9, 1.3] });
  m.add(ball(0.012, 8), bird, { at: [X, 1.968, F + 0.03] });
  m.add(cyl(0.006, 0.001, 0.018, 5), 0xf0b030, { at: [X, 1.966, F + 0.04], rot: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) m.add(ball(0.0035, 4), P.ink, { at: [X + s * 0.008, 1.973, F + 0.036] });
  // the dial: its carved surround, the cream face, the hours, the hands (live: the time where you are)
  const [dy, dr] = [1.735, 0.072];
  m.add(ring(dr + 0.008, 0.009, 4, 28).rotateX(Math.PI / 2), L === 2 ? P.graphite : trim, { at: [X, dy, F + 0.004] });
  disc(m, X, dy, F, dr, L === 2 ? P.white : P.cream, 0.004);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 3 ? 0.01 : 0.018;
    m.add(box([i % 3 ? 0.004 : 0.007, len, 0.002]), P.ink, {
      at: [X + Math.sin(a) * (dr - 0.01 - len / 2), dy + Math.cos(a) * (dr - 0.01 - len / 2), F + 0.005],
      rot: [0, 0, -a],
    });
  }
  liveHand(m, X, dy, F + 0.007, 43200, 0.045, 0.007, L === 0 ? 0x1a1a1a : P.ink);
  liveHand(m, X, dy, F + 0.009, 3600, 0.062, 0.005, L === 0 ? 0x1a1a1a : P.ink);
  disc(m, X, dy, F + 0.009, 0.006, P.brass, 0.003, 8);
  // the pendulum: a rod and its bob (a carved leaf, a brass disc, a black disc), swinging
  const bob = L === 0 ? 0x5a3620 : L === 1 ? P.brass : 0x1e1e20;
  const pend: BufferGeometry[] = [box([0.006, 0.3, 0.003]).translate(0, -0.15, 0)];
  if (L === 0)
    pend.push(
      leaf(0.09, 0.07, 0.1, 0, 4)
        .rotateX(Math.PI / 2)
        .translate(0, -0.27, 0.004),
    );
  else
    pend.push(
      cyl(0.04, 0.04, 0.006, 20)
        .rotateX(Math.PI / 2)
        .translate(0, -0.33, 0),
    );
  m.live(
    merged(pend),
    bob,
    { kind: "nod", amp: 0.18, period: 1.1, phase: o.seed },
    { at: [X, y0 + 0.02, FACE + 0.03] },
  );
  // the weights on their chains, one wound higher (its seed); their chains' free ends with rings
  const hang = [0.3 + o.seed * 0.12, 0.42 - o.seed * 0.1];
  for (const [k, s] of [-1, 1].entries()) {
    const x = X + s * 0.06;
    const bottom = y0 - hang[k];
    chain(m, x, y0, bottom, FACE + 0.075, P.brass);
    chain(m, x + s * 0.026, y0, y0 - 0.5 + hang[k] * 0.6, FACE + 0.075, P.brass);
    m.add(ring(0.012, 0.0025, 3, 10).rotateX(Math.PI / 2), P.brass, {
      at: [x + s * 0.026, y0 - 0.5 + hang[k] * 0.6 - 0.012, FACE + 0.075],
    });
    if (L === 2) {
      m.add(cyl(0.02, 0.02, 0.12, 14), 0x1e1e20, { at: [x, bottom - 0.12, FACE + 0.075] });
      m.add(cyl(0.004, 0.004, 0.012, 5), P.brass, { at: [x, bottom - 0.004, FACE + 0.075] });
    } else {
      // a pinecone: its scales in bands
      m.add(
        lathe(
          [
            [0.001, 0],
            [0.014, 0.012],
            [0.022, 0.04],
            [0.023, 0.075],
            [0.016, 0.1],
            [0.004, 0.115],
          ],
          10,
        ),
        0x5a3a1e,
        { at: [x, bottom - 0.115, FACE + 0.075] },
      );
      for (let b = 0; b < 6; b++) {
        const yb = bottom - 0.105 + b * 0.017;
        const r = [0.012, 0.019, 0.023, 0.023, 0.02, 0.013][b];
        m.add(ring(r, 0.004, 3, 10), shade(0x6b4826, 1 + (b % 2) * 0.12), { at: [x, yb, FACE + 0.075] });
      }
    }
  }
}

// ── world-time clocks (3×1) ───────────────────────────────────────────────────────────────────────
/** Three round clocks in a row, each over its city's name plate, their hands an hour apart as their
 *  zones are (live, each by its city's zone), a red seconds hand sweeping each. */
const CITIES: [string, number][][] = [
  [
    ["LONDON", 0],
    ["NEW YORK", -5],
    ["TOKYO", 9],
  ],
  [
    ["PARIS", 1],
    ["SYDNEY", 11],
    ["RIO", -3],
  ],
];
/** The zones' cities and offsets a world-time row shows (by its seed): for the live hook. */
export const worldCities = (seed: number) => CITIES[seed < 0.5 ? 0 : 1];
function worldClocks(m: Model, o: Look) {
  const L = o.look;
  const rim = [P.brass, 0x1c1c1e, P.walnutDark][L] ?? P.brass;
  const face = [P.cream, 0xf6f4ee, P.cream][L] ?? P.cream;
  const plate = [0x1c1c1e, 0xf6f4ee, P.walnut][L] ?? 0x1c1c1e;
  const text = [P.brass, 0x1c1c1e, P.brass][L] ?? P.brass;
  const ink = L === 1 ? 0x1c1c1e : P.ink;
  const R = 0.15;
  const Y = 1.86;
  const utc = (Date.now() / 3_600_000) % 24; // (day or night there as it's drawn)
  worldCities(o.seed).forEach(([city, off], i) => {
    const X = 0.55 + i * 0.95;
    m.add(ring(R + 0.012, 0.016, 6, 36).rotateX(Math.PI / 2), rim, { at: [X, Y, FACE + 0.022] });
    disc(m, X, Y, FACE, R + 0.01, shade(rim, 0.8), 0.022, 36);
    disc(m, X, Y, FACE + 0.022, R, face, 0.004, 36);
    const z = FACE + 0.027;
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2;
      const big = k % 5 === 0;
      const len = big ? (k % 15 === 0 ? 0.028 : 0.018) : 0.006;
      m.add(box([big ? 0.007 : 0.0025, len, 0.002]), ink, {
        at: [X + Math.sin(a) * (R - 0.01 - len / 2), Y + Math.cos(a) * (R - 0.01 - len / 2), z],
        rot: [0, 0, -a],
      });
    }
    // (day or night there: a little sun or moon on the face)
    const h = (((utc + off) % 24) + 24) % 24;
    const day = h >= 7 && h < 19;
    disc(m, X, Y - 0.06, z, 0.012, day ? 0xf2b630 : 0x5a6a9a, 0.002, 12);
    if (!day) disc(m, X + 0.006, Y - 0.056, z + 0.001, 0.01, face, 0.002, 12);
    liveHand(m, X, Y, z + 0.003, 43200, R * 0.55, 0.011, ink, off);
    liveHand(m, X, Y, z + 0.005, 3600, R * 0.82, 0.007, ink, off);
    disc(m, X, Y, z + 0.006, 0.01, rim, 0.004, 10);
    // the seconds hand, sweeping round (live)
    m.live(
      merged([
        box([0.003, R * 0.95, 0.002]).translate(0, R * 0.35, 0),
        cyl(0.007, 0.007, 0.002, 10).rotateX(Math.PI / 2),
      ]),
      0xc4402b,
      { kind: "clock", period: 60, zone: off },
      { at: [X, Y, z + 0.009] },
    );
    // the name plate under it
    m.add(box([0.34, 0.06, 0.012], 0.003), plate, { at: [X, 1.62, FACE + 0.006] });
    m.add(box([0.32, 0.044, 0.002]), shade(plate, L === 1 ? 0.92 : 1.2), { at: [X, 1.62, FACE + 0.013] });
    say(m, city, X, 1.62, FACE + 0.0165, 0.0052, text);
  });
}

// ── the wall calendar (1×1) ───────────────────────────────────────────────────────────────────────
const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
/** The page a calendar's open at: the client's date when it's built (the live hook: the day turning
 *  over while you're in the world, the weather's season — see the family's report). */
export function calendarPage(now = new Date()) {
  const y = now.getFullYear();
  const mo = now.getMonth();
  return {
    month: mo,
    day: now.getDate(),
    weekday: now.getDay(),
    first: new Date(y, mo, 1).getDay(),
    days: new Date(y, mo + 1, 0).getDate(),
  };
}
function wallCalendar(m: Model, o: Look) {
  const cal = calendarPage();
  const X = 0.5;
  // the nail, its string
  m.add(cyl(0.004, 0.004, 0.02, 6), P.steelLight, { at: [X, 1.83, FACE], rot: [Math.PI / 2, 0, 0] });
  m.add(cyl(0.007, 0.007, 0.003, 8), P.steelLight, { at: [X, 1.83, FACE + 0.02], rot: [Math.PI / 2, 0, 0] });
  if (o.look === 2) {
    // a tear-off day: the pad on its board, the month and the big day, the stubs of torn pages
    slab(m, 0.37, 0.63, 1.38, 1.8, 0.012, P.oak, 0.004);
    m.add(box([0.2, 0.3, 0.018], 0.002), P.paperWhite, { at: [X, 1.56, FACE + 0.021] });
    const F = FACE + 0.031;
    sheet(m, X, 1.67, F, 0.2, 0.075, 0xc4402b);
    say(m, MONTHS[cal.month].slice(0, 3), X, 1.67, F + 0.003, 0.0085, P.paperWhite);
    say(m, String(cal.day), X, 1.56, F + 0.001, 0.013, P.ink);
    say(m, DAYS[cal.weekday], X, 1.45, F + 0.001, 0.0055, 0x7a7a7a);
    for (let k = 0; k < 6; k++)
      sheet(m, 0.42 + k * 0.034, 1.712, F - 0.001, 0.02, 0.008, P.paperWhite, (k % 2 ? 0.2 : -0.15) * 1);
    m.add(cyl(0.006, 0.006, 0.012, 8), P.brass, { at: [X, 1.77, FACE + 0.012], rot: [Math.PI / 2, 0, 0] });
    return;
  }
  const kraft = o.look === 1;
  const paper = kraft ? 0xc8a87a : P.paperWhite;
  const ink = kraft ? 0x4a3420 : P.ink;
  const [x0, x1] = [0.33, 0.67];
  // the string to the top page's hole, the two pages, the wire binding between them
  for (const s of [-1, 1])
    limb(m, [X + s * 0.025, 1.765, FACE + 0.007], [X, 1.826, FACE + 0.016], 0.0012, 0.0012, 0x6a5a4a, 3);
  m.add(box([x1 - x0, 0.28, 0.003]), paper, { at: [X, 1.64, FACE + 0.004] });
  m.add(box([x1 - x0, 0.31, 0.003]), paper, { at: [X, 1.345, FACE + 0.006] });
  for (let k = 0; k < 14; k++)
    m.add(ring(0.006, 0.0012, 3, 8).rotateY(Math.PI / 2), P.steelLight, {
      at: [x0 + 0.02 + k * 0.023, 1.5, FACE + 0.007],
    });
  disc(m, X, 1.76, FACE + 0.0055, 0.006, 0x3a3a3a, 0.001, 8);
  // the picture: the season's (northern: the snow campus's own) or a pressed fern on the kraft
  const F = FACE + 0.0056;
  const [px0, px1, py0, py1] = [x0 + 0.02, x1 - 0.02, 1.52, 1.74];
  const rect = (a: number, b: number, c: number, d: number, col: number, dz = 0) =>
    m.add(box([b - a, d - c, 0.001]), col, { at: [(a + b) / 2, (c + d) / 2, F + 0.0006 + dz] });
  if (kraft) {
    for (let i = 0; i < 7; i++) {
      const g = leaf(0.06 - Math.abs(i - 3) * 0.008, 0.026, 0.05, 0, 4)
        .rotateX(-Math.PI / 2)
        .rotateZ((i - 3) * 0.32);
      m.add(g, [0x4f6b3a, 0x5f7f43][i % 2], { at: [X, 1.56, F + 0.001], scale: [1, 1, 0.2] });
    }
    m.add(box([0.004, 0.14, 0.001]), 0x4a5a30, { at: [X, 1.6, F + 0.0015] });
  } else {
    const season = Math.floor(((cal.month + 1) % 12) / 3); // 0 winter, 1 spring, 2 summer, 3 autumn
    const sky = [0xb8cfe0, 0xa8d0e8, 0x7ab8e8, 0xd8c0a0][season];
    rect(px0, px1, py0, py1, sky);
    if (season === 0) {
      for (const [x, w, h, c] of [
        [0.42, 0.16, 0.13, 0x8a9aac],
        [0.56, 0.2, 0.16, 0x9aaabc],
      ] as const) {
        m.add(
          extrude(
            [
              [-w / 2, 0],
              [w / 2, 0],
              [0, h],
            ],
            0.001,
          ),
          c,
          { at: [x, py0 + 0.03, F + 0.0012] },
        );
        m.add(
          extrude(
            [
              [-w / 6, 0],
              [w / 6, 0],
              [0, h / 3],
            ],
            0.001,
          ),
          P.paperWhite,
          { at: [x, py0 + 0.03 + (h * 2) / 3, F + 0.0016] },
        );
      }
      rect(px0, px1, py0, py0 + 0.04, 0xf4f4f0, 0.001);
      for (let k = 0; k < 4; k++)
        m.add(
          extrude(
            [
              [-0.012, 0],
              [0.012, 0],
              [0, 0.05],
            ],
            0.001,
          ),
          0x2c5a35,
          { at: [0.38 + k * 0.025, py0 + 0.02, F + 0.002] },
        );
    } else if (season === 1) {
      rect(px0, px1, py0, py0 + 0.09, 0x7aa84a, 0.001);
      for (let k = 0; k < 14; k++)
        disc(
          m,
          px0 + 0.01 + rnd(k, 1, 3) * 0.28,
          py0 + 0.01 + rnd(k, 2, 3) * 0.07,
          F + 0.0018,
          0.005,
          [0xf2d24a, 0xe86a9a, P.paperWhite][k % 3],
          0.001,
          6,
        );
    } else if (season === 2) {
      rect(px0, px1, py0, py0 + 0.08, 0x2a6aa8, 0.001);
      rect(px0, px1, py0, py0 + 0.03, 0xe8d4a0, 0.0015);
      disc(m, 0.58, 1.69, F + 0.0018, 0.025, 0xf2c230, 0.001, 16);
    } else {
      rect(px0, px1, py0, py0 + 0.05, 0x8a6a3a, 0.001);
      for (let k = 0; k < 5; k++) {
        const x = 0.37 + k * 0.065;
        m.add(box([0.005, 0.05, 0.001]), 0x4a3020, { at: [x, py0 + 0.06, F + 0.002] });
        m.add(ball(0.03, 6), [0xc4502a, 0xe0902a, 0xb03a20][k % 3], {
          at: [x, py0 + 0.105, F + 0.002],
          scale: [1, 1, 0.05],
        });
      }
    }
  }
  // the month's page: its name, the days' heads, the grid; today ringed, a few days written in
  const G = FACE + 0.0085;
  say(m, MONTHS[cal.month], X, 1.465, G, 0.0036, kraft ? ink : 0xc4402b);
  const [gx0, gy0, cw, ch] = [x0 + 0.02, 1.44, (x1 - x0 - 0.04) / 7, 0.038];
  for (let c = 0; c < 7; c++) sheet(m, gx0 + (c + 0.5) * cw, gy0 - 0.004, G, cw * 0.6, 0.004, c === 0 ? 0xc4402b : ink);
  for (let d = 1; d <= cal.days; d++) {
    const k = cal.first + d - 1;
    const [c, r] = [k % 7, Math.floor(k / 7)];
    const cx = gx0 + (c + 0.5) * cw;
    const cy = gy0 - 0.02 - r * ch;
    say(m, String(d), cx, cy, G, 0.0016, c === 0 ? 0xc4402b : ink);
    if (d === cal.day) m.add(ring(0.015, 0.0016, 3, 16).rotateX(Math.PI / 2), 0xc4402b, { at: [cx, cy, G + 0.0015] });
    else if (rnd(d, 7, o.seed) < 0.12)
      sheet(m, cx, cy - 0.011, G, cw * 0.75, 0.005, [0x3f6aa8, 0x4f8a4a, 0xe0902a][d % 3]);
  }
  for (let r = 0; r <= 6; r++)
    sheet(m, X, gy0 - 0.008 - r * ch + 0.0, G - 0.0005, x1 - x0 - 0.04, 0.0008, shade(paper, 0.82));
}

// ── the thermostat (1×1) ──────────────────────────────────────────────────────────────────────────
/** By the light switch's height: a smart dial (its ring glowing orange as it heats, 21°), an old round
 *  dial with its needle, or a digital box with its LCD. What it reads — the room or the weather — is
 *  the world's to say (see the family's report). */
function thermostat(m: Model, o: Look) {
  const X = 0.5;
  const Y = 1.45;
  if (o.look === 0) {
    disc(m, X, Y, FACE, 0.048, 0xe9e6df, 0.006, 28);
    m.add(cyl(0.042, 0.042, 0.032, 32), 0xc4c8cc, { at: [X, Y, FACE + 0.006], rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 40; k++)
      m.add(box([0.002, 0.03, 0.003]), 0xa8acb0, {
        at: [X + Math.sin((k / 40) * Math.PI * 2) * 0.042, Y + Math.cos((k / 40) * Math.PI * 2) * 0.042, FACE + 0.022],
        rot: [0, 0, -(k / 40) * Math.PI * 2],
        scale: [1, 0.5, 1],
      });
    const F = FACE + 0.038;
    disc(m, X, Y, F, 0.036, 0x0e1012, 0.002, 32);
    // the heating arc, lit, and the reading in it
    for (let k = 0; k < 22; k++) {
      const a = -2.3 + (k / 21) * 2.0;
      m.add(box([0.003, 0.006, 0.001]), k < 15 ? 0xff8a3a : 0x3a3a3a, {
        at: [X + Math.sin(a) * 0.03, Y + Math.cos(a) * 0.03, F + 0.002],
        rot: [0, 0, -a],
        glow: k < 15,
      });
    }
    say(m, "21", X, Y + 0.002, F + 0.0025, 0.0032, 0xf6f4ee, true);
    say(m, "HEAT", X, Y - 0.019, F + 0.0025, 0.0012, 0xff8a3a, true);
    return;
  }
  if (o.look === 1) {
    disc(m, X, Y, FACE, 0.05, 0xd8cfb8, 0.014, 28);
    m.add(cyl(0.046, 0.046, 0.014, 32), 0xe6ddc6, { at: [X, Y, FACE + 0.014], rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      m.add(box([0.003, 0.012, 0.003]), 0xcfc4a8, {
        at: [X + Math.sin(a) * 0.046, Y + Math.cos(a) * 0.046, FACE + 0.021],
        rot: [0, 0, -a],
      });
    }
    const F = FACE + 0.028;
    disc(m, X, Y, F, 0.034, 0xf4efe0, 0.002, 28);
    for (let k = 0; k <= 10; k++) {
      const a = -1.2 + (k / 10) * 2.4;
      m.add(box([0.0018, k % 5 ? 0.006 : 0.01, 0.001]), k > 6 ? 0xc4402b : 0x3a6aa8, {
        at: [X + Math.sin(a) * 0.026, Y + 0.004 + Math.cos(a) * 0.026, F + 0.0025],
        rot: [0, 0, -a],
      });
    }
    hand(m, X, Y + 0.004, F + 0.0035, 0.25, 0.03, 0.0025, 0xc4402b);
    disc(m, X, Y + 0.004, F + 0.0035, 0.004, P.ink, 0.002, 8);
    sheet(m, X, Y - 0.02, F + 0.002, 0.03, 0.006, 0xd8cfb8);
    return;
  }
  m.add(box([0.12, 0.085, 0.022], 0.008, 2), 0xf2f0ea, { at: [X, Y, FACE + 0.011] });
  const F = FACE + 0.022;
  m.add(box([0.075, 0.036, 0.002]), 0x9fd8c8, { at: [X, Y + 0.012, F + 0.001], glow: true });
  say(m, "21.5", X - 0.005, Y + 0.012, F + 0.0025, 0.0028, 0x1e2a28);
  sheet(m, X + 0.03, Y + 0.022, F + 0.0015, 0.008, 0.004, 0x1e2a28);
  for (const [k, c] of [0xd8d4cc, 0xd8d4cc, 0xc4402b].entries())
    m.add(box([0.016, 0.01, 0.004], 0.002), c, { at: [X - 0.024 + k * 0.024, Y - 0.024, F + 0.002] });
  m.live(
    box([0.003, 0.003, 0.002]),
    0xff8a3a,
    { kind: "blink", period: 2.4, on: 0.5, phase: o.seed },
    {
      glow: true,
      at: [X + 0.05, Y + 0.032, F + 0.001],
    },
  );
}

// ── the members' map (2×1) ────────────────────────────────────────────────────────────────────────
/** A framed map of the snow campus — the river running north to south, the pond, the roads, the
 *  buildings, the woods — with members' pins in it (scattered by its seed: the world could put one
 *  where each member is, see the family's report), a red string between three, a compass rose, its
 *  plate. Natural paper in oak, a blueprint in black, or vintage parchment in walnut. */
function membersMap(m: Model, o: Look) {
  const L = o.look;
  const frame = [P.oak, 0x1c1c1e, P.walnutDark][L] ?? P.oak;
  const land = [0xe8e2cc, 0x23466e, 0xd9c49a][L] ?? 0xe8e2cc;
  const snow = [0xf8f6ee, 0x2c5280, 0xe6d6b0][L] ?? 0xf8f6ee;
  const water = [0x8ab8d8, 0xd8e6f2, 0x8a9a8a][L] ?? 0x8ab8d8;
  const road = [0xb8b0a0, 0xa8c4e0, 0xa08a62][L] ?? 0xb8b0a0;
  const bldg = [0xa87a5a, 0xe8f0f8, 0x7a5a3a][L] ?? 0xa87a5a;
  const wood = [0x5f7f4a, 0x5a7aa0, 0x6a6a42][L] ?? 0x5f7f4a;
  const [x0, x1, y0, y1] = [0.2, 1.8, 1.14, 1.9];
  slab(m, x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, 0.016, shade(frame, 0.85));
  m.add(box([x1 - x0, y1 - y0, 0.004]), land, { at: [(x0 + x1) / 2, (y0 + y1) / 2, FACE + 0.018] });
  bars(m, x0, x1, y0, y1, 0.04, FACE + 0.04, frame);
  const F = FACE + 0.02;
  const P2 = (u: number, v: number): [number, number] => [x0 + u * (x1 - x0), y0 + v * (y1 - y0)];
  // snow lying in patches, the woods in dots
  for (let k = 0; k < 7; k++) {
    const [x, y] = P2(0.08 + rnd(k, 1, 2) * 0.84, 0.1 + rnd(k, 2, 2) * 0.8);
    m.add(cyl(0.07 + rnd(k, 3, 2) * 0.05, 0.07, 0.001, 12), snow, {
      at: [x, y, F],
      rot: [Math.PI / 2, 0, 0],
      scale: [1.6, 1, 1],
    });
  }
  for (let k = 0; k < 46; k++) {
    const u = k < 26 ? 0.03 + rnd(k, 4, 1) * 0.22 : 0.74 + rnd(k, 4, 1) * 0.23;
    const v = 0.06 + rnd(k, 5, 1) * 0.88;
    const [x, y] = P2(u, v);
    disc(m, x, y, F + 0.0012, 0.011 + rnd(k, 6, 1) * 0.006, k % 3 ? wood : shade(wood, 0.8), 0.001, 7);
  }
  // the river, north to south, and the pond off it
  strip(
    m,
    [
      [0.47, 1],
      [0.42, 0.85],
      [0.5, 0.68],
      [0.45, 0.5],
      [0.52, 0.32],
      [0.48, 0.15],
      [0.53, 0],
    ].map(([u, v]) => P2(u, v)),
    0.035,
    F + 0.0015,
    water,
  );
  const [px, py] = P2(0.66, 0.66);
  m.add(cyl(0.06, 0.06, 0.001, 18), water, { at: [px, py, F + 0.0016], rot: [Math.PI / 2, 0, 0], scale: [1.5, 1, 1] });
  // roads, a bridge, the buildings of the campus
  strip(m, [P2(0, 0.42), P2(0.3, 0.44), P2(0.7, 0.4), P2(1, 0.42)], 0.016, F + 0.002, road);
  strip(m, [P2(0.62, 0.42), P2(0.64, 0.2), P2(0.8, 0.12)], 0.012, F + 0.002, road);
  strip(m, [P2(0.3, 0.44), P2(0.28, 0.75), P2(0.36, 0.92)], 0.012, F + 0.002, road);
  sheet(m, ...P2(0.475, 0.425), F + 0.003, 0.06, 0.03, shade(road, 0.8));
  for (const [u, v, w, h] of [
    [0.6, 0.3, 0.14, 0.09],
    [0.75, 0.28, 0.07, 0.07],
    [0.35, 0.3, 0.08, 0.06],
    [0.2, 0.55, 0.06, 0.08],
    [0.62, 0.5, 0.05, 0.05],
    [0.83, 0.52, 0.08, 0.05],
    [0.36, 0.58, 0.05, 0.07],
  ])
    sheet(m, ...P2(u, v), F + 0.0025, w * (x1 - x0) * 0.6, h * (y1 - y0) * 1.2, bldg);
  // a compass rose, the title plate
  const [cx, cy] = P2(0.92, 0.84);
  for (let k = 0; k < 4; k++)
    m.add(
      extrude(
        [
          [-0.012, 0],
          [0.012, 0],
          [0, 0.05],
        ],
        0.001,
      ),
      k ? shade(bldg, 0.8) : 0xc4402b,
      {
        at: [cx, cy, F + 0.003],
        rot: [0, 0, (-k * Math.PI) / 2],
      },
    );
  m.add(box([0.36, 0.05, 0.006], 0.002), L === 1 ? P.chrome : P.brass, { at: [1, y0 - 0.03, FACE + 0.043] });
  say(m, "MEMBERS", 1, y0 - 0.03, FACE + 0.0465, 0.0045, P.ink);
  // the pins: a needle, a round head; a red string round three of them
  const PIN = [0xd8402a, 0x3f6aa8, 0xf2c230, 0x4f8a4a, 0xe86a9a, 0xf6f4ee, 0x7a4ab0];
  const pins: V3[] = [];
  const n = 9 + Math.floor(o.seed * 6);
  for (let k = 0; k < n; k++) {
    const [x, y] = P2(0.08 + rnd(k, 8, o.seed) * 0.84, 0.1 + rnd(k, 9, o.seed) * 0.8);
    const lean = (rnd(k, 10, o.seed) - 0.5) * 0.4;
    const tip: V3 = [x - Math.sin(lean) * 0.012, y + lean * 0.006, F + 0.032];
    limb(m, [x, y, F], tip, 0.0018, 0.0018, P.steelLight, 4);
    m.add(ball(0.014, 8), PIN[k % PIN.length], { at: tip });
    pins.push(tip);
  }
  if (pins.length >= 3)
    m.add(
      tube(
        [pins[0], pins[1], pins[2]].map((p) => [p[0], p[1], p[2] - 0.006] as V3),
        0.0012,
        3,
        20,
      ),
      0xc4402b,
    );
}

// ── the pegboard (2×1) ────────────────────────────────────────────────────────────────────────────
/** A perforated board on standoffs, its tools hung on hooks: a hammer, three wrenches, screwdrivers
 *  in a rack, pliers, a saw, a tape measure, a level, scissors, a coil of cord, jars of screws on a
 *  little shelf. By its seed one tool's out — its painted outline left where it hangs. */
function pegboard(m: Model, o: Look) {
  const L = o.look;
  const board = [0xd6b88a, 0x2a2a2c, 0x9ad0bc][L] ?? 0xd6b88a;
  const hole = [0x5a4632, 0x0e0e10, 0x3a5a50][L] ?? 0x5a4632;
  const hook = L === 1 ? 0x9a9d9f : 0x6a6e72;
  const [x0, x1, y0, y1] = [0.1, 1.9, 0.95, 1.85];
  const B = FACE + 0.025; // the board's back (on its standoffs)
  const F = B + 0.006; // its front
  m.add(box([x1 - x0, y1 - y0, 0.006], 0.002), board, { at: [(x0 + x1) / 2, (y0 + y1) / 2, B + 0.003] });
  // (a folded edge round the steel ones, a timber batten round the pine)
  if (L === 0) bars(m, x0 + 0.02, x1 - 0.02, y0 + 0.02, y1 - 0.02, 0.02, F + 0.006, 0xb8955f);
  else
    for (const [x, y, w, h] of [
      [(x0 + x1) / 2, y1 - 0.005, x1 - x0, 0.01],
      [(x0 + x1) / 2, y0 + 0.005, x1 - x0, 0.01],
      [x0 + 0.005, (y0 + y1) / 2, 0.01, y1 - y0],
      [x1 - 0.005, (y0 + y1) / 2, 0.01, y1 - y0],
    ])
      m.add(box([w, h, 0.012]), shade(board, 1.12), { at: [x, y, F + 0.002] });
  for (const [x, y] of [
    [x0 + 0.04, y0 + 0.04],
    [x1 - 0.04, y0 + 0.04],
    [x0 + 0.04, y1 - 0.04],
    [x1 - 0.04, y1 - 0.04],
  ])
    disc(m, x, y, F, 0.008, P.steelLight, 0.003, 8);
  // the holes: one flat square a hole, one geometry
  const pos: number[] = [];
  const h = 0.0045;
  for (let x = x0 + 0.075; x < x1 - 0.05; x += 0.05)
    for (let y = y0 + 0.075; y < y1 - 0.05; y += 0.05)
      pos.push(
        x - h,
        y - h,
        F + 0.0004,
        x + h,
        y - h,
        F + 0.0004,
        x + h,
        y + h,
        F + 0.0004,
        x - h,
        y - h,
        F + 0.0004,
        x + h,
        y + h,
        F + 0.0004,
        x - h,
        y + h,
        F + 0.0004,
      );
  m.add(geo(pos), hole);
  const peg = (x: number, y: number, len = 0.05) => {
    m.add(cyl(0.0025, 0.0025, len, 5), hook, { at: [x, y, F], rot: [Math.PI / 2, 0, 0] });
    m.add(cyl(0.0025, 0.0025, 0.014, 5), hook, { at: [x, y, F + len], rot: [0, 0, 0] });
  };
  const outline = (x: number, y: number, w: number, hh: number) => {
    const c = L === 1 ? 0xe9e6df : 0x2a2a2c;
    for (const [a, b, ww, hhh] of [
      [x, y + hh / 2, w, 0.004],
      [x, y - hh / 2, w, 0.004],
      [x - w / 2, y, 0.004, hh],
      [x + w / 2, y, 0.004, hh],
    ])
      sheet(m, a, b, F, ww, hhh, c);
  };
  const STEEL = 0x8a8e92;
  const missing = Math.floor(o.seed * 4); // (0: the hammer's out, 1: the saw's, 2–3: all in)
  // the hammer: its head on two pegs, the handle down
  peg(0.27, 1.62);
  peg(0.39, 1.62);
  if (missing === 0) {
    outline(0.33, 1.65, 0.16, 0.035);
    outline(0.33, 1.5, 0.03, 0.26);
  } else {
    m.add(box([0.16, 0.032, 0.026], 0.004), STEEL, { at: [0.33, 1.65, F + 0.03] });
    m.add(box([0.05, 0.026, 0.024], 0.004), STEEL, { at: [0.42, 1.655, F + 0.03], rot: [0, 0, 0.35] });
    m.add(box([0.028, 0.28, 0.02], 0.008), 0xb8885a, { at: [0.33, 1.495, F + 0.03] });
    m.add(box([0.032, 0.09, 0.024], 0.008), 0x2a2a2c, { at: [0.33, 1.4, F + 0.03] });
  }
  // the wrenches, longest first: a ring at the top on its peg, an open jaw at the foot
  for (let k = 0; k < 3; k++) {
    const x = 0.55 + k * 0.06;
    const len = 0.26 - k * 0.04;
    const top = 1.7;
    peg(x, top);
    m.add(ring(0.018 - k * 0.002, 0.006, 3, 12).rotateX(Math.PI / 2), STEEL, { at: [x, top, F + 0.03] });
    m.add(box([0.016 - k * 0.002, len - 0.04, 0.006], 0.002), STEEL, { at: [x, top - len / 2, F + 0.03] });
    for (const s of [-1, 1])
      m.add(box([0.008, 0.028, 0.006], 0.002), STEEL, {
        at: [x + s * 0.013, top - len + 0.004, F + 0.03],
        rot: [0, 0, s * 0.25],
      });
  }
  // the screwdrivers through their rack
  m.add(box([0.24, 0.016, 0.05], 0.003), hook, { at: [0.96, 1.66, F + 0.025] });
  for (let k = 0; k < 5; k++) {
    const x = 0.86 + k * 0.05;
    const c = [0xd8402a, 0xf2c230, 0x3f6aa8, 0xd8402a, 0x4f8a4a][k];
    m.add(cyl(0.012, 0.014, 0.09, 8), c, { at: [x, 1.668, F + 0.032] });
    m.add(cyl(0.0035, 0.0035, 0.1 - (k % 2) * 0.03, 6), STEEL, { at: [x, 1.668 - 0.1 + (k % 2) * 0.03, F + 0.032] });
  }
  // the pliers: two arms crossed on a pivot, red grips
  peg(1.2, 1.7);
  for (const s of [-1, 1]) {
    m.add(box([0.012, 0.07, 0.006], 0.002), STEEL, { at: [1.2 + s * 0.006, 1.665, F + 0.03], rot: [0, 0, s * 0.12] });
    m.add(box([0.016, 0.13, 0.01], 0.004), 0xc4402b, { at: [1.2 + s * 0.022, 1.56, F + 0.03], rot: [0, 0, -s * 0.12] });
  }
  disc(m, 1.2, 1.635, F + 0.033, 0.008, STEEL, 0.004, 8);
  // the saw, hung by its handle: the blade's taper, its teeth
  peg(1.5, 1.77);
  if (missing === 1) outline(1.62, 1.74, 0.44, 0.1);
  else {
    m.add(
      extrude(
        [
          [0, -0.045],
          [0.36, -0.03],
          [0.36, 0.0],
          [0, 0.045],
        ],
        0.002,
      ),
      0xb8bcc0,
      { at: [1.52, 1.74, F + 0.03] },
    );
    for (let k = 0; k < 24; k++) sheet(m, 1.53 + k * 0.015, 1.703 + k * 0.0006, F + 0.031, 0.008, 0.006, 0x8a8e92, 0.7);
    m.add(
      extrude(
        [
          [-0.1, -0.05],
          [0.02, -0.05],
          [0.02, 0.05],
          [-0.06, 0.06],
          [-0.11, 0.02],
        ],
        0.024,
        0.004,
      ),
      0x8a5a32,
      { at: [1.52, 1.74, F + 0.03] },
    );
    m.add(box([0.06, 0.035, 0.026]), shade(board, 0.4), { at: [1.465, 1.738, F + 0.03] });
  }
  // the tape measure, the level, the scissors, the cord on its peg
  peg(1.72, 1.44);
  m.add(box([0.07, 0.07, 0.035], 0.012, 2), 0xf2c230, { at: [1.72, 1.4, F + 0.035] });
  disc(m, 1.72, 1.4, F + 0.052, 0.018, 0x2a2a2c, 0.003, 14);
  m.add(box([0.02, 0.006, 0.02]), 0xb8bcc0, { at: [1.735, 1.362, F + 0.04] });
  peg(1.05, 1.13, 0.04);
  peg(1.35, 1.13, 0.04);
  m.add(box([0.42, 0.04, 0.028], 0.004), 0xe8b830, { at: [1.2, 1.1, F + 0.03] });
  m.add(box([0.06, 0.016, 0.004]), 0x2a2a2c, { at: [1.2, 1.1, F + 0.045] });
  m.add(box([0.03, 0.009, 0.004]), 0x9ae07a, { at: [1.2, 1.1, F + 0.047], glow: false });
  peg(0.72, 1.22, 0.035);
  for (const s of [-1, 1]) {
    m.add(ring(0.016, 0.004, 3, 10).rotateX(Math.PI / 2), 0x3a3a3c, { at: [0.72 + s * 0.02, 1.19, F + 0.03] });
    m.add(box([0.008, 0.1, 0.004], 0.001), 0xb8bcc0, {
      at: [0.72 + s * 0.006, 1.115, F + 0.03],
      rot: [0, 0, s * 0.09],
    });
  }
  peg(1.78, 1.7);
  for (let k = 0; k < 4; k++)
    m.add(ring(0.045 - k * 0.002, 0.007, 4, 18).rotateX(Math.PI / 2), 0xe0702a, {
      at: [1.78 + (k - 1.5) * 0.004, 1.64 - k * 0.002, F + 0.022 + k * 0.012],
    });
  // a little shelf, jars of screws on it
  m.add(box([0.32, 0.012, 0.08], 0.002), L === 0 ? 0xb8955f : shade(board, 1.12), { at: [0.36, 1.05, F + 0.04] });
  for (const s of [-1, 1]) m.add(box([0.008, 0.05, 0.07]), hook, { at: [0.36 + s * 0.14, 1.025, F + 0.035] });
  for (let k = 0; k < 3; k++) {
    const x = 0.27 + k * 0.09;
    m.add(cyl(0.028, 0.028, 0.07, 12), 0xc8d4d8, { at: [x, 1.056, F + 0.04] });
    m.add(cyl(0.025, 0.025, 0.04, 12), [0x9a9d9f, P.brass, 0x6a6e72][k], { at: [x, 1.058, F + 0.04] });
    m.add(cyl(0.03, 0.03, 0.014, 12), [0xd8402a, 0x3f6aa8, 0x2a2a2c][k], { at: [x, 1.126, F + 0.04] });
  }
}

// ── the mounted skateboard (1×1) ──────────────────────────────────────────────────────────────────
/** A deck on two brackets, its graphic to the room — flames, a checker or a sunset — its nose and tail
 *  kicked back to the wall, its trucks and wheels out (their colour by its seed). */
function wallSkateboard(m: Model, o: Look) {
  const L = o.look;
  const Y = 1.52;
  const Dz = FACE + 0.07; // the deck's middle
  const T = 0.012;
  const front = Dz + T / 2;
  const base = [0x1a1a1c, 0xf2f0ea, 0x3a2a4a][L] ?? 0x1a1a1c;
  // the deck: its middle, its kicked ends (the griptape's black at its back)
  m.add(box([0.52, 0.2, T]), base, { at: [0.5, Y, Dz] });
  m.add(box([0.52, 0.2, 0.002]), 0x111113, { at: [0.5, Y, Dz - T / 2 - 0.001] });
  const end: [number, number][] = [[0, -0.1]];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    end.push([0.02 + Math.cos(a) * 0.1, Math.sin(a) * 0.1]);
  }
  end.push([0, 0.1]);
  for (const s of [-1, 1]) {
    const pts = end.map(([u, v]) => [s * u, v] as [number, number]);
    if (s < 0) pts.reverse();
    m.add(extrude(pts, T), base, { at: [0.5 + s * 0.26, Y, Dz], rot: [0, s * 0.32, 0] });
  }
  // (its plies' edge showing)
  for (const y of [Y - 0.1, Y + 0.1]) m.add(box([0.52, 0.004, T + 0.001]), 0xe0c08a, { at: [0.5, y, Dz] });
  // the graphic
  const G = front + 0.0005;
  if (L === 0) {
    for (let k = 0; k < 7; k++) {
      const x = 0.27 + k * 0.075;
      const h = 0.05 + rnd(k, 1, 4) * 0.08;
      for (const [c, sc, dz] of [
        [0xd8402a, 1, 0],
        [0xf28a2a, 0.7, 0.0008],
        [0xf2d24a, 0.4, 0.0016],
      ] as const)
        m.add(
          extrude(
            [
              [-0.035 * sc, 0],
              [0.035 * sc, 0],
              [0.012 * sc, h * sc * 0.6],
              [0.03 * sc, h * sc],
              [-0.01 * sc, h * sc * 0.55],
            ],
            0.001,
          ),
          c,
          { at: [x, Y - 0.095, G + dz] },
        );
    }
    say(m, "BURN", 0.5, Y + 0.06, G + 0.002, 0.007, 0xf2f0ea);
  } else if (L === 1) {
    for (let i = 0; i < 13; i++)
      for (let j = 0; j < 5; j++)
        if ((i + j) % 2) sheet(m, 0.26 + i * 0.04, Y - 0.08 + j * 0.04, G, 0.04, 0.04, 0x1a1a1c);
  } else {
    for (const [k, c] of [0x3a2a4a, 0x8a3a5a, 0xd8602a, 0xf2a03a, 0xf2d24a].entries())
      sheet(m, 0.5, Y - 0.08 + k * 0.04, G, 0.52, 0.04, c);
    disc(m, 0.5, Y + 0.0, G + 0.003, 0.06, 0xfff0c0, 0.001, 20);
    for (let k = 0; k < 4; k++) sheet(m, 0.5, Y - 0.05 + k * 0.012, G + 0.0045, 0.2 - k * 0.04, 0.005, 0x3a2a4a);
  }
  // the trucks and wheels, standing out to the room
  const wheel = [0xf2f0ea, 0xd8402a, 0x3ab8b0, 0xf2c230][Math.floor(o.seed * 4)] ?? 0xf2f0ea;
  for (const x of [0.32, 0.68]) {
    m.add(box([0.06, 0.06, 0.006], 0.002), 0x9a9d9f, { at: [x, Y, front + 0.003] });
    m.add(cyl(0.012, 0.012, 0.03, 8), 0x7a7d80, { at: [x, Y, front + 0.006], rot: [Math.PI / 2, 0, 0] });
    m.add(box([0.03, 0.17, 0.026], 0.008), 0xb8bcc0, { at: [x, Y, front + 0.042] });
    m.add(cyl(0.005, 0.005, 0.22, 6), 0x7a7d80, { at: [x, Y - 0.11, front + 0.045] });
    for (const s of [-1, 1]) {
      m.add(cyl(0.027, 0.027, 0.032, 14), wheel, { at: [x, s > 0 ? Y + 0.088 : Y - 0.12, front + 0.045] });
      m.add(cyl(0.012, 0.012, 0.034, 10), shade(wheel, 0.75), {
        at: [x, s > 0 ? Y + 0.087 : Y - 0.121, front + 0.045],
      });
    }
  }
  // the brackets it rests on
  for (const x of [0.36, 0.64]) {
    m.add(box([0.03, 0.01, Dz + T / 2 - FACE + 0.01]), 0x2a2a2c, {
      at: [x, Y - 0.105, FACE + (Dz + T / 2 - FACE + 0.01) / 2],
    });
    m.add(box([0.03, 0.02, 0.006]), 0x2a2a2c, { at: [x, Y - 0.1, front + 0.007] });
    m.add(box([0.03, 0.04, 0.006]), 0x2a2a2c, { at: [x, Y - 0.12, FACE + 0.003] });
  }
}

// ── framed records (2×1) ──────────────────────────────────────────────────────────────────────────
/** Three records framed with their sleeves (the labels and the covers by its seed), or a gold and two
 *  platinum discs on black velvet with their plaques. */
function framedRecords(m: Model, o: Look) {
  const L = o.look;
  const frame = [0x1a1a1c, P.oak, 0x1a1a1c][L] ?? 0x1a1a1c;
  const mat = [P.paperWhite, P.paperWhite, 0x141416][L] ?? P.paperWhite;
  const W = 0.2; // half its inside
  const Y = 1.6;
  for (let i = 0; i < 3; i++) {
    const X = 0.38 + i * 0.62;
    slab(m, X - W, X + W, Y - W, Y + W, 0.016, mat, 0.002);
    bars(m, X - W, X + W, Y - W, Y + W, 0.022, FACE + 0.036, frame);
    const F = FACE + 0.016;
    let dx = 0;
    if (L < 2) {
      // its sleeve, its cover art: bands, a circle, a square of colour
      const art = Math.floor(rnd(i, 1, o.seed) * 3);
      const c = [0xd8602a, 0x3f6aa8, 0x4f8a4a, 0xe86a9a, 0xf2c230, 0x3a2a4a][Math.floor(rnd(i, 2, o.seed) * 6)];
      const s = 0.3;
      const sx = X - 0.04;
      m.add(box([s, s, 0.003]), c, { at: [sx, Y, F + 0.0015] });
      if (art === 0)
        for (let k = 0; k < 4; k++) sheet(m, sx, Y - 0.1 + k * 0.06, F + 0.003, s, 0.025, shade(c, 0.7 + k * 0.12));
      else if (art === 1) disc(m, sx - 0.03, Y + 0.03, F + 0.003, 0.08, P.paperWhite, 0.001, 20);
      else sheet(m, sx + 0.04, Y - 0.04, F + 0.003, 0.14, 0.14, 0x1a1a1c);
      dx = 0.06;
    }
    const rx = X + dx;
    const gold = L === 2 ? (i === 1 ? 0xd4af37 : 0xd8dce0) : 0x141416;
    const r = L === 2 ? 0.135 : 0.15;
    const ry = L === 2 ? Y + 0.03 : Y;
    disc(m, rx, ry, F + 0.006, r, gold, 0.002, 36);
    for (const k of [0.45, 0.65, 0.85])
      m.add(ring(r * k, 0.0012, 3, 32).rotateX(Math.PI / 2), shade(gold, L === 2 ? 0.85 : 1.8), {
        at: [rx, ry, F + 0.008],
      });
    const label =
      L === 2
        ? i === 1
          ? 0x1a1a1c
          : 0x8a1a1e
        : [0xc4402b, 0xf2d24a, 0xe9e6df, 0x3f6aa8][Math.floor(rnd(i, 3, o.seed) * 4)];
    disc(m, rx, ry, F + 0.008, 0.05, label, 0.001, 24);
    sheet(m, rx, ry + 0.022, F + 0.009, 0.05, 0.006, shade(label, 0.6));
    disc(m, rx, ry, F + 0.0095, 0.004, 0x0a0a0a, 0.001, 8);
    if (L === 2) {
      m.add(box([0.2, 0.035, 0.004], 0.001), P.brass, { at: [X, Y - 0.15, F + 0.005] });
      for (let k = 0; k < 2; k++) sheet(m, X, Y - 0.145 - k * 0.011, F + 0.007, 0.14 - k * 0.04, 0.004, 0x3a2a14);
    }
  }
}

// ── the tapestry (2×1) ────────────────────────────────────────────────────────────────────────────
/** A woven hanging on a dowel with its brackets: boho mountains under a sun, an indigo mandala — each
 *  in soft folds, a fringe of tassels under it — or a macramé of knotted cord, its fringe in a V. */
function tapestry(m: Model, o: Look) {
  const L = o.look;
  const ROD = 2.02;
  const RZ = FACE + 0.05;
  // the dowel, its ends, its brackets
  m.add(rod(0.014, 0.014, 1.72, "x", 10), L === 2 ? 0xc8a070 : P.walnut, { at: [1, ROD, RZ] });
  for (const s of [-1, 1]) {
    m.add(ball(0.022, 8), L === 2 ? 0xc8a070 : P.walnut, { at: [1 + s * 0.87, ROD, RZ] });
    m.add(box([0.02, 0.03, RZ - FACE], 0.003), P.graphite, { at: [1 + s * 0.74, ROD - 0.005, FACE + (RZ - FACE) / 2] });
  }
  const [x0, x1, y0, y1] = [0.24, 1.76, 0.98, ROD - 0.01];
  if (L === 2) {
    // macramé: cords from the dowel, a band of half hitches, a net of square knots narrowing to a
    // point, the cords hanging on from it as a fringe in a V
    const cord = 0xf0e6d0;
    const Z = RZ + 0.006;
    const n = 24;
    for (let k = 0; k < n; k++) {
      const x = 0.32 + (k / (n - 1)) * 1.36;
      m.add(ring(0.009, 0.004, 3, 6).rotateY(Math.PI / 2), cord, { at: [x, ROD, RZ] });
      m.add(cyl(0.0045, 0.0045, ROD - 1.9, 5), cord, { at: [x, 1.9, Z] });
    }
    m.add(rod(0.011, 0.011, 1.4, "x", 6), shade(cord, 0.96), { at: [1, 1.9, Z + 0.004] });
    for (let k = 0; k < 14; k++)
      m.add(ball(0.013, 5), cord, { at: [0.34 + k * 0.1, 1.9, Z + 0.01], scale: [1.3, 0.8, 0.6] });
    // the net: knots in rows, each row offset by half, the rows narrowing; two cords from a knot to
    // each of the two under it
    const at = (r: number, c: number): V3 => [0.32 + c * 0.12 + (r % 2) * 0.06, 1.84 - r * 0.07, Z + 0.008];
    const inNet = (r: number, c: number) => {
      const [x] = at(r, c);
      return c >= 0 && x <= 1.69 && Math.abs(x - 1) <= 0.7 - r * 0.075 + 0.001;
    };
    const lowest = new Map<number, number>();
    for (let r = 0; r < 10; r++)
      for (let c = -1; c < 12; c++) {
        if (!inNet(r, c)) continue;
        const p = at(r, c);
        m.add(ball(0.017, 5), cord, { at: p, scale: [1.2, 1.3, 0.55] });
        lowest.set(Math.round(p[0] * 100), r);
        for (const [rr, cc] of [
          [r + 1, c - ((r + 1) % 2)],
          [r + 1, c + (r % 2)],
        ])
          if (inNet(rr, cc))
            limb(
              m,
              [p[0], p[1], p[2] - 0.002],
              [...at(rr, cc)].map((v, i) => (i === 2 ? v - 0.002 : v)) as V3,
              0.0058,
              0.0058,
              shade(cord, 0.96),
              4,
            );
        // (the top row hangs from the band)
        if (r === 0) for (const s of [-1, 1]) limb(m, [p[0] + s * 0.02, 1.9, Z], p, 0.0045, 0.0045, cord, 4);
      }
    // the fringe: from each lowest knot down to a V, frayed at its end
    for (const [xk, r] of lowest) {
      const x = xk / 100;
      const y0 = 1.84 - r * 0.07;
      const bottom = 0.98 + Math.abs(x - 1) * 0.5;
      for (const s of [-1, 1]) {
        m.add(cyl(0.0042, 0.0042, y0 - bottom, 5), s > 0 ? cord : shade(cord, 0.95), {
          at: [x + s * 0.006, bottom, Z],
        });
        m.add(cyl(0.0065, 0.0042, 0.035, 6), shade(cord, 0.97), { at: [x + s * 0.006, bottom - 0.035, Z] });
      }
    }
    return;
  }
  // the cloth: panels in soft folds, the hem over the dowel
  const base = L === 0 ? 0xeadfc8 : 0x2a3266;
  const n = 8;
  const pw = (x1 - x0) / n;
  for (let k = 0; k < n; k++)
    m.add(box([pw + 0.002, y1 - y0, 0.005]), base, {
      at: [x0 + (k + 0.5) * pw, (y0 + y1) / 2, RZ - 0.012 + (k % 2) * 0.008],
      rot: [0, (k % 2 ? 1 : -1) * 0.07, 0],
      tone: k % 2 ? 1 : 0.94,
    });
  m.add(box([x1 - x0, 0.05, 0.034], 0.008), base, { at: [1, ROD - 0.01, RZ], tone: 0.92 });
  const Z = RZ + 0.004;
  const tri = (cx: number, by: number, w: number, h: number, c: number, dz: number) =>
    m.add(
      extrude(
        [
          [-w / 2, 0],
          [w / 2, 0],
          [0, h],
        ],
        0.001,
      ),
      c,
      { at: [cx, by, Z + dz] },
    );
  if (L === 0) {
    disc(m, 1, 1.64, Z, 0.12, 0xd9a441, 0.001, 28);
    for (let k = 0; k < 3; k++)
      disc(m, 1, 1.64, Z + 0.0004 + k * 0.0002, 0.15 + k * 0.035, k % 2 ? base : 0xe8c070, 0.0004, 28);
    disc(m, 1, 1.64, Z + 0.0012, 0.12, 0xd9a441, 0.001, 28);
    tri(0.62, 1.12, 0.7, 0.48, 0x4a7a7a, 0.002);
    tri(1.35, 1.12, 0.8, 0.56, 0xb5653f, 0.003);
    tri(1.0, 1.12, 0.6, 0.36, 0x8a3a2a, 0.004);
    tri(1.35, 1.6, 0.18, 0.08, 0xf6f0e4, 0.0035);
    sheet(m, 1, 1.07, Z + 0.004, x1 - x0, 0.1, 0x6a5a3a);
    // zigzag bands top and foot
    for (const by of [1.86, 1.0])
      for (let k = 0; k < 16; k++) tri(x0 + 0.05 + k * 0.095, by, 0.08, 0.05, k % 2 ? 0xb5653f : 0x4a7a7a, 0.005);
  } else {
    // the mandala: rings of petals round a sun, a quarter in each corner, a border
    const C: [number, number] = [1, 1.5];
    disc(m, C[0], C[1], Z, 0.05, 0xf2c230, 0.001, 20);
    for (const [r, k, len, c] of [
      [0.08, 10, 0.05, P.paperWhite],
      [0.15, 16, 0.07, 0xd8c8f0],
      [0.25, 20, 0.09, P.paperWhite],
      [0.35, 24, 0.07, 0xe8a07a],
    ] as const) {
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        m.add(ball(1, 6), c, {
          at: [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r, Z + 0.002],
          rot: [0, 0, a],
          scale: [len, len * 0.35, 0.002],
        });
      }
      m.add(ring(r + len * 0.6, 0.002, 3, 48).rotateX(Math.PI / 2), shade(c, 0.9), { at: [C[0], C[1], Z + 0.002] });
    }
    for (const [cx, cy] of [
      [x0, y1],
      [x1, y1],
      [x0, y0],
      [x1, y0],
    ])
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const [px, py] = [cx + Math.cos(a) * 0.1, cy + Math.sin(a) * 0.1];
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        m.add(ball(1, 6), P.paperWhite, { at: [px, py, Z + 0.002], rot: [0, 0, a], scale: [0.05, 0.018, 0.002] });
      }
    for (const y of [y0 + 0.04, y1 - 0.07]) sheet(m, 1, y, Z + 0.001, x1 - x0 - 0.04, 0.008, P.paperWhite);
  }
  // the fringe: tassels along the foot
  const tc = L === 0 ? 0xd8c8a8 : P.paperWhite;
  for (let k = 0; k < 22; k++) {
    const x = x0 + 0.03 + k * ((x1 - x0 - 0.06) / 21);
    m.add(cyl(0.006, 0.003, 0.012, 5), tc, { at: [x, y0 - 0.012, Z - 0.004] });
    m.add(cyl(0.004, 0.009, 0.07, 6), tc, { at: [x, y0 - 0.085, Z - 0.004] });
  }
}

// ── the mirror (1×1) ──────────────────────────────────────────────────────────────────────────────
/** A round mirror in a brass ring hung on a leather strap, a tall arched one in a black frame, or a
 *  small round one in a sunburst of gilt rays: the glass a pale grey-blue, the room's glints and its
 *  floor's warmth across it (the kit draws no reflections). */
function wallMirror(m: Model, o: Look) {
  const X = 0.5;
  const G = 0xb8c8d2;
  if (o.look === 0) {
    const Y = 1.52;
    const R = 0.3;
    m.add(cyl(R, R, 0.012, 40), G, { at: [X, Y, FACE + 0.012], rot: [Math.PI / 2, 0, 0] });
    // (the glints kept inside its round: a disc's worth cut by the ring)
    m.add(box([0.05, 0.42, 0.001]), 0xe4eef4, { at: [X - 0.05, Y + 0.02, FACE + 0.0245], rot: [0, 0, -0.7] });
    m.add(box([0.022, 0.34, 0.001]), 0xe4eef4, { at: [X + 0.07, Y + 0.0, FACE + 0.0245], rot: [0, 0, -0.7] });
    m.add(
      extrude(
        Array.from({ length: 17 }, (_, i) => {
          const a = Math.PI + 0.62 + (i / 16) * (Math.PI - 1.24);
          return [Math.cos(a) * (R - 0.01), Math.sin(a) * (R - 0.01)] as [number, number];
        }),
        0.001,
      ),
      0xa89a8a,
      { at: [X, Y, FACE + 0.0245] },
    );
    m.add(ring(R + 0.008, 0.018, 6, 48).rotateX(Math.PI / 2), P.brass, { at: [X, Y, FACE + 0.022] });
    // the strap up to its knob, buckled
    m.add(cyl(0.016, 0.016, 0.03, 10), P.brass, { at: [X, 2.02, FACE], rot: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1])
      m.add(box([0.03, 0.22, 0.004], 0.001), 0x6a3a1e, {
        at: [X + s * 0.05, 1.92, FACE + 0.035],
        rot: [0, 0, s * 0.42],
      });
    m.add(box([0.03, 0.03, 0.006]), 0x6a3a1e, { at: [X, 2.02, FACE + 0.033] });
    m.add(box([0.036, 0.024, 0.004]), P.brass, { at: [X + 0.08, 1.85, FACE + 0.04], rot: [0, 0, 0.42] });
    return;
  }
  if (o.look === 1) {
    const [w, y0, y1] = [0.46, 1.0, 1.95];
    const arch = (hw: number, top: number, bot: number): [number, number][] => {
      const out: [number, number][] = [[-hw, bot]];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI - (i / 16) * Math.PI;
        out.push([Math.cos(a) * hw, top - hw + Math.sin(a) * hw]);
      }
      out.push([hw, bot]);
      return out;
    };
    m.add(extrude(arch(w / 2 + 0.03, y1 + 0.03 - 1.5, y0 - 0.03 - 1.5), 0.03, 0.004), 0x1c1c1e, {
      at: [X, 1.5, FACE + 0.015],
    });
    m.add(extrude(arch(w / 2, y1 - 1.5, y0 - 1.5), 0.004), G, { at: [X, 1.5, FACE + 0.031] });
    // two bright streaks across it, the floor's warmth along its foot
    const z = FACE + 0.0335;
    m.add(box([0.06, 0.4, 0.001]), 0xe4eef4, { at: [X - 0.03, 1.6, z], rot: [0, 0, -0.55] });
    m.add(box([0.025, 0.34, 0.001]), 0xe4eef4, { at: [X + 0.07, 1.55, z], rot: [0, 0, -0.55] });
    m.add(box([w - 0.01, 0.2, 0.001]), 0xa89a8a, { at: [X, y0 + 0.11, z - 0.0004] });
    return;
  }
  const Y = 1.6;
  const R = 0.13;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const len = k % 2 ? 0.18 : 0.27;
    m.add(cyl(0.005, 0.003, len, 5), P.brass, {
      at: [X + Math.cos(a) * (R + 0.02), Y + Math.sin(a) * (R + 0.02), FACE + 0.02],
      rot: [0, 0, a - Math.PI / 2],
    });
    if (!(k % 2))
      m.add(ball(0.011, 6), P.brass, {
        at: [X + Math.cos(a) * (R + 0.02 + len), Y + Math.sin(a) * (R + 0.02 + len), FACE + 0.02],
      });
  }
  m.add(ring(R + 0.012, 0.016, 6, 36).rotateX(Math.PI / 2), P.brass, { at: [X, Y, FACE + 0.022] });
  disc(m, X, Y, FACE + 0.006, R + 0.02, 0x8a6a2a, 0.014, 32);
  disc(m, X, Y, FACE + 0.02, R, G, 0.003, 32);
  m.add(box([0.03, 0.2, 0.001]), 0xe4eef4, { at: [X - 0.03, Y + 0.01, FACE + 0.0235], rot: [0, 0, -0.7] });
}

// ── carved antlers (1×1) ──────────────────────────────────────────────────────────────────────────
/** A pair of antlers carved from wood on a shield — plainly carved: smooth turned beams with rounded
 *  tips, a carved ring at each base, the grain's bands — in oiled oak, painted white on green, or gold
 *  leaf on black. */
function carvedAntlers(m: Model, o: Look) {
  const L = o.look;
  const horn = [P.oakLight, 0xf2f0ea, 0xd4a540][L] ?? P.oakLight;
  const shield = [P.walnut, 0x2f5a44, 0x1c1c1e][L] ?? P.walnut;
  const X = 0.5;
  const Y = 1.62;
  // the shield, its bevelled edge
  const sh: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    sh.push([-0.12 + 0.02 * Math.sin(t * Math.PI), 0.14 - t * 0.2]);
  }
  sh.push([-0.06, -0.12], [0, -0.17], [0.06, -0.12]);
  for (let i = 12; i >= 0; i--) {
    const t = i / 12;
    sh.push([0.12 - 0.02 * Math.sin(t * Math.PI), 0.14 - t * 0.2]);
  }
  m.add(extrude(sh, 0.03, 0.006, 2), shield, { at: [X, Y, FACE + 0.015] });
  sheet(m, X, Y - 0.12, FACE + 0.03, 0.06, 0.012, L === 2 ? P.brass : shade(shield, 1.3));
  // the carved boss the beams come out of
  m.add(ball(0.05, 10), horn, { at: [X, Y + 0.02, FACE + 0.035], scale: [1.3, 1, 0.7] });
  for (const s of [-1, 1]) {
    // the burr: a carved ring at the base
    const base: V3 = [X + s * 0.05, Y + 0.05, FACE + 0.06];
    m.add(ring(0.022, 0.009, 4, 12), shade(horn, 0.85), { at: base, rot: [0, 0, -s * 0.85] });
    const beam: V3[] = [
      base,
      [X + s * 0.13, Y + 0.12, FACE + 0.09],
      [X + s * 0.22, Y + 0.24, FACE + 0.1],
      [X + s * 0.27, Y + 0.38, FACE + 0.09],
      [X + s * 0.26, Y + 0.52, FACE + 0.07],
    ];
    const rr = [0.02, 0.017, 0.014, 0.011, 0.008];
    for (let i = 0; i < beam.length - 1; i++) {
      limb(m, beam[i], beam[i + 1], rr[i], rr[i + 1], horn);
      m.add(ball(rr[i + 1], 7), horn, { at: beam[i + 1] });
    }
    // tines up off the beam, each tip rounded
    for (const [i, len, a] of [
      [1, 0.12, 0.15],
      [2, 0.14, -0.05],
      [3, 0.1, -0.3],
    ] as const) {
      const p = beam[i];
      const tip: V3 = [p[0] - s * Math.sin(a) * len * 0.6 - s * 0.01, p[1] + len, p[2] + 0.025];
      limb(m, p, tip, rr[i] * 0.8, 0.006, horn);
      m.add(ball(0.007, 6), horn, { at: tip });
    }
    // (the grain's bands round the beam: carved, not grown)
    for (const t of [0.3, 0.55])
      m.add(ring(0.016, 0.0022, 3, 10), shade(horn, 0.82), {
        at: [
          base[0] + (beam[2][0] - base[0]) * t,
          base[1] + (beam[2][1] - base[1]) * t,
          base[2] + (beam[2][2] - base[2]) * t,
        ],
        rot: [0, 0, -s * 0.73],
      });
  }
}

// ── the exit sign (1×1) ───────────────────────────────────────────────────────────────────────────
/** Over a door: lit from inside — the green running man by his door, or red EXIT on white with its
 *  chevrons. Always lit (on its own battery: no switch). */
function exitSign(m: Model, o: Look) {
  const X = 0.5;
  const Y = 2.3;
  const red = o.look === 1;
  m.add(box([0.38, 0.18, 0.05], 0.008), red ? 0xf2f0ea : 0xe0e2e0, { at: [X, Y, FACE + 0.025] });
  const F = FACE + 0.05;
  if (!red) {
    m.add(box([0.34, 0.14, 0.002]), 0x1fa04a, { at: [X, Y, F + 0.001], glow: true });
    const W = 0xf4fff6;
    const Z = F + 0.003;
    // his door: its frame, the opening
    for (const [x, y, w, h] of [
      [0.6, Y, 0.006, 0.1],
      [0.66, Y, 0.006, 0.1],
      [0.63, Y + 0.047, 0.066, 0.006],
    ])
      sheet(m, x, y, Z, w, h, W, 0, true);
    // the running man: head, body leaning in, his arms and legs mid-stride
    disc(m, 0.52, Y + 0.04, Z, 0.012, W, 0.001, 12, true);
    sheet(m, 0.505, Y + 0.005, Z, 0.016, 0.05, W, -0.45, true);
    for (const [x, y, len, a] of [
      [0.52, Y + 0.015, 0.035, 1.2],
      [0.48, Y + 0.012, 0.035, -1.0],
      [0.52, Y - 0.03, 0.04, 0.6],
      [0.48, Y - 0.032, 0.04, -0.5],
    ])
      sheet(m, x, y, Z, 0.012, len, W, a, true);
    // the arrow the way to go
    sheet(m, 0.38, Y, Z, 0.06, 0.016, W, 0, true);
    m.add(
      extrude(
        [
          [0, -0.03],
          [0, 0.03],
          [0.035, 0],
        ],
        0.001,
      ),
      W,
      { at: [0.405, Y, Z + 0.0005], glow: true },
    );
    return;
  }
  m.add(box([0.34, 0.14, 0.002]), 0xfaf6ee, { at: [X, Y, F + 0.001] });
  say(m, "EXIT", X, Y, F + 0.003, 0.011, 0xff3a2a, true);
  for (const s of [-1, 1])
    m.add(
      extrude(
        [
          [0, -0.022],
          [0, 0.022],
          [s * 0.022, 0],
        ],
        0.001,
      ),
      0xff3a2a,
      {
        at: [X + s * 0.138, Y, F + 0.003],
        glow: true,
      },
    );
}

// ── the fire alarm (1×1) ──────────────────────────────────────────────────────────────────────────
/** The alarm's call point and its sounder over it, joined by their conduit: a red bell and a pull
 *  station, a break-glass point and a round sounder, or a horn with its strobe and a T-bar pull; a
 *  green LED blinking on the call point that it's armed. */
function fireAlarm(m: Model, o: Look) {
  const L = o.look;
  const X = 0.5;
  const R = 0xc4202a;
  const W = 0xf4f2ec;
  // the conduit from the call point up to the sounder
  m.add(cyl(0.008, 0.008, 0.66, 8), 0xb8b4ac, { at: [X + 0.075, 1.35, FACE + 0.009] });
  m.add(box([0.03, 0.02, 0.02], 0.003), 0xb8b4ac, { at: [X + 0.075, 1.36, FACE + 0.01] });
  m.add(box([0.03, 0.02, 0.02], 0.003), 0xb8b4ac, { at: [X + 0.075, 2.0, FACE + 0.01] });
  if (L === 0) {
    // the bell: its backplate, the dome, the striker under it
    disc(m, X, 2.06, FACE, 0.05, R, 0.012, 20);
    m.add(
      lathe(
        [
          [0.082, 0],
          [0.078, 0.012],
          [0.06, 0.04],
          [0.03, 0.058],
          [0.001, 0.06],
        ],
        24,
      ),
      R,
      { at: [X, 2.06, FACE + 0.012], rot: [Math.PI / 2, 0, 0] },
    );
    disc(m, X, 2.06, FACE + 0.072, 0.012, 0xb8bcc0, 0.006, 10);
    m.add(box([0.016, 0.03, 0.02], 0.003), 0x2a2a2c, { at: [X, 1.97, FACE + 0.03] });
    m.add(ball(0.009, 6), 0x2a2a2c, { at: [X, 1.985, FACE + 0.05] });
  } else if (L === 1) {
    disc(m, X, 2.06, FACE, 0.06, R, 0.03, 24);
    disc(m, X, 2.06, FACE + 0.03, 0.048, shade(R, 0.85), 0.012, 24);
    for (let k = 0; k < 4; k++) sheet(m, X, 2.03 + k * 0.02, FACE + 0.043, 0.06, 0.006, 0x5a1014);
  } else {
    m.add(box([0.11, 0.15, 0.05], 0.008), R, { at: [X, 2.08, FACE + 0.025] });
    for (let k = 0; k < 5; k++) sheet(m, X, 2.03 + k * 0.014, FACE + 0.05, 0.08, 0.005, 0x5a1014);
    m.add(box([0.06, 0.03, 0.02], 0.004), 0xf8f8f8, { at: [X, 2.14, FACE + 0.06] });
    say(m, "FIRE", X, 2.105, FACE + 0.0505, 0.0028, W);
  }
  // the call point
  const Y = 1.3;
  if (L === 1) {
    m.add(box([0.1, 0.1, 0.04], 0.006), R, { at: [X, Y, FACE + 0.02] });
    m.add(box([0.065, 0.065, 0.002]), 0xe8eef0, { at: [X, Y - 0.006, FACE + 0.041] });
    for (const [x, y, w, h, t] of [
      [X, Y - 0.006, 0.03, 0.004, 0],
      [X - 0.012, Y + 0.004, 0.004, 0.02, 0],
      [X + 0.012, Y + 0.004, 0.004, 0.02, 0],
      [X, Y + 0.016, 0.034, 0.004, 0],
    ] as const)
      sheet(m, x, y, FACE + 0.042, w, h, 0x2a2a2c, t);
    say(m, "FIRE", X, Y + 0.038, FACE + 0.041, 0.0022, W);
  } else {
    m.add(box([0.1, 0.14, 0.04], 0.008), R, { at: [X, Y, FACE + 0.02] });
    say(m, "FIRE", X, Y + 0.048, FACE + 0.041, 0.0032, W);
    if (L === 0) {
      m.add(box([0.06, 0.018, 0.022], 0.004), W, { at: [X, Y + 0.0, FACE + 0.048] });
      say(m, "PULL", X, Y - 0.04, FACE + 0.041, 0.0022, W);
    } else {
      m.add(box([0.07, 0.014, 0.018], 0.004), W, { at: [X, Y - 0.005, FACE + 0.05] });
      m.add(box([0.014, 0.03, 0.014], 0.003), W, { at: [X, Y - 0.025, FACE + 0.045] });
      say(m, "PULL DOWN", X, Y - 0.05, FACE + 0.041, 0.0013, W);
    }
  }
  m.live(
    box([0.006, 0.006, 0.003], 0.001),
    0x5aff7a,
    { kind: "blink", period: 3.2, on: 0.12, phase: o.seed },
    {
      glow: true,
      at: [X + 0.036, Y + (L === 1 ? 0.038 : 0.058), FACE + 0.041],
    },
  );
}

// ── guitars on wall hooks (2×1) ───────────────────────────────────────────────────────────────────
type Axe = "acoustic" | "electric" | "bass";
const FINISH = [0xb8302a, 0x1a1a1c, 0xf2f0ea, 0x3a7ab8, 0x4a8a6a];
/** A guitar hung by its headstock, its nut at (x, nutY) resting in a hook's yoke: an acoustic (its waisted body, the sound hole and
 *  its rosette, the bridge, sunburst or natural), an electric (double cutaway, pickguard, three
 *  pickups, knobs) or a bass (longer, four strings) — its finish by `c`. */
function guitar(m: Model, x: number, yNut: number, kind: Axe, c: number, burst: boolean) {
  const z = FACE + 0.1; // its face's middle
  const head = kind === "bass" ? 0.2 : 0.17;
  const neck = kind === "bass" ? 0.5 : kind === "acoustic" ? 0.33 : 0.36;
  const nw = kind === "bass" ? 0.042 : 0.046;
  const top = yNut + head;
  const yJoin = yNut - neck;
  // the headstock and its tuners
  const hc = kind === "acoustic" ? 0x2a1a10 : c;
  m.add(box([0.075, head, 0.016], 0.006), hc, { at: [x, top - head / 2, z - 0.012] });
  const nt = kind === "bass" ? 2 : 3;
  for (let k = 0; k < nt; k++)
    for (const s of [-1, 1]) {
      const y = top - 0.04 - (k * (head - 0.06)) / Math.max(1, nt - 1);
      m.add(cyl(0.006, 0.006, 0.02, 6), P.chrome, {
        at: [x + s * 0.0375, y, z - 0.012],
        rot: [0, 0, s * (Math.PI / 2)],
      });
      m.add(box([0.012, 0.018, 0.004], 0.002), P.chrome, { at: [x + s * 0.06, y, z - 0.012] });
    }
  // the neck, its fretboard, the frets, the nut
  m.add(box([nw, neck + 0.04, 0.024], 0.008), kind === "acoustic" ? 0xb8885a : 0xd8b07a, {
    at: [x, yJoin + neck / 2, z - 0.006],
  });
  m.add(box([nw - 0.004, neck + 0.04, 0.006]), 0x2a1a12, { at: [x, yJoin + neck / 2, z + 0.008] });
  m.add(box([nw, 0.006, 0.01]), P.cream, { at: [x, yNut, z + 0.008] });
  for (let k = 1; k < 14; k++) {
    const y = yNut - neck * (1 - 2 ** (-k / 12)) * 1.75;
    if (y < yJoin) break;
    m.add(box([nw - 0.004, 0.0016, 0.002]), P.chrome, { at: [x, y, z + 0.012] });
    if ([3, 5, 7, 9].includes(k)) disc(m, x, y + 0.012, z + 0.011, 0.003, P.cream, 0.001, 6);
  }
  // the body
  const D = kind === "acoustic" ? 0.1 : 0.045;
  const bz = z + 0.012 - D / 2; // its middle (its top flush with the board)
  let bodyTop = 0;
  let bodyBottom = 0;
  if (kind === "acoustic") {
    const hw = (y: number) =>
      Math.max(
        Math.sqrt(Math.max(0, 0.2 ** 2 - (y + 0.08) ** 2)),
        Math.sqrt(Math.max(0, 0.155 ** 2 - (y - 0.12) ** 2)),
        y > -0.06 && y < 0.1 ? 0.13 : 0,
      );
    const pts: [number, number][] = [];
    const [lo, hi] = [-0.278, 0.273];
    for (let i = 0; i <= 24; i++) {
      const y = lo + ((hi - lo) * i) / 24;
      pts.push([hw(y), y]);
    }
    for (let i = 24; i >= 0; i--) {
      const y = lo + ((hi - lo) * i) / 24;
      pts.push([-hw(y), y]);
    }
    const cy = yJoin - 0.25;
    bodyTop = cy + hi;
    bodyBottom = cy + lo;
    m.add(extrude(pts, D, 0.006, 2), burst ? 0x3a1a0e : 0xd8b07a, { at: [x, cy, bz] });
    if (burst)
      m.add(
        extrude(
          pts.map(([u, v]) => [u * 0.78, v * 0.82 - 0.02] as [number, number]),
          0.002,
        ),
        0xd88a2a,
        { at: [x, cy, bz + D / 2 + 0.0005] },
      );
    m.add(
      extrude(
        pts.map(([u, v]) => [u * 0.55, v * 0.62 - 0.04] as [number, number]),
        0.002,
      ),
      burst ? 0xf2b04a : 0xe6c48a,
      {
        at: [x, cy, bz + D / 2 + 0.001],
      },
    );
    // the sound hole, its rosette; the bridge and its pins
    disc(m, x, cy + 0.1, bz + D / 2, 0.045, 0x140c08, 0.003, 24);
    m.add(ring(0.052, 0.004, 3, 24).rotateX(Math.PI / 2), P.cream, { at: [x, cy + 0.1, bz + D / 2 + 0.002] });
    m.add(box([0.12, 0.028, 0.008], 0.003), 0x2a1a12, { at: [x, cy - 0.12, bz + D / 2 + 0.003] });
    m.add(box([0.06, 0.005, 0.004]), P.cream, { at: [x, cy - 0.11, bz + D / 2 + 0.007] });
  } else {
    const k = kind === "bass" ? 1.1 : 1;
    const pts: [number, number][] = (
      [
        [0, -0.25],
        [0.12, -0.235],
        [0.165, -0.17],
        [0.17, -0.08],
        [0.14, 0.0],
        [0.13, 0.06],
        [0.15, 0.12],
        [0.155, 0.19],
        [0.13, 0.22],
        [0.1, 0.17],
        [0.06, 0.12],
        [0.03, 0.115],
        [-0.03, 0.115],
        [-0.07, 0.14],
        [-0.1, 0.25],
        [-0.125, 0.27],
        [-0.15, 0.22],
        [-0.15, 0.12],
        [-0.13, 0.05],
        [-0.15, -0.02],
        [-0.17, -0.1],
        [-0.16, -0.18],
        [-0.12, -0.235],
      ] as [number, number][]
    ).map(([u, v]) => [u * k, v * k]);
    const cy = yJoin - 0.115 * k;
    bodyTop = cy + 0.27 * k;
    bodyBottom = cy - 0.25 * k;
    m.add(extrude(pts, D, 0.008, 2), burst ? 0x2a120a : c, { at: [x, cy, bz] });
    if (burst)
      m.add(
        extrude(
          pts.map(([u, v]) => [u * 0.7, v * 0.72] as [number, number]),
          0.002,
        ),
        0xd88a2a,
        { at: [x, cy - 0.01, bz + D / 2 + 0.0005] },
      );
    // the pickguard, the pickups, the bridge, the knobs, the jack
    const guard = c === 0xf2f0ea ? 0x1a1a1c : 0xf2f0ea;
    m.add(
      extrude(
        [
          [-0.1 * k, -0.12 * k],
          [0.08 * k, -0.15 * k],
          [0.12 * k, -0.07 * k],
          [0.06 * k, 0.1 * k],
          [-0.05 * k, 0.11 * k],
          [-0.12 * k, 0.02 * k],
        ],
        0.002,
      ),
      guard,
      { at: [x, cy, bz + D / 2 + 0.001] },
    );
    for (let i = 0; i < (kind === "bass" ? 2 : 3); i++)
      m.add(box([kind === "bass" ? 0.06 : 0.075, 0.018, 0.006], 0.003), kind === "bass" ? 0x1a1a1c : 0xf2f0ea, {
        at: [x, cy + 0.06 - i * 0.055, bz + D / 2 + 0.004],
        rot: [0, 0, i === 2 ? 0.15 : 0],
      });
    m.add(box([0.075, 0.03, 0.008], 0.002), P.chrome, { at: [x, cy - 0.12 * k, bz + D / 2 + 0.004] });
    for (let i = 0; i < 3; i++)
      m.add(cyl(0.011, 0.011, 0.012, 10), P.chrome, {
        at: [x + 0.06 * k + i * 0.012, cy - 0.06 * k - i * 0.035, bz + D / 2],
        rot: [Math.PI / 2, 0, 0],
      });
  }
  // the strings: nut to bridge
  const ns = kind === "bass" ? 4 : 6;
  const yb = kind === "acoustic" ? yJoin - 0.25 - 0.115 : bodyBottom + (kind === "bass" ? 0.15 : 0.125);
  for (let i = 0; i < ns; i++) {
    const u0 = (i - (ns - 1) / 2) * ((nw - 0.012) / (ns - 1));
    const u1 = (i - (ns - 1) / 2) * (0.05 / (ns - 1));
    const len = yNut - yb;
    m.add(box([kind === "bass" ? 0.0022 : 0.0012, len, 0.0012]), 0xd8dcdf, {
      at: [x + (u0 + u1) / 2, (yNut + yb) / 2, z + (kind === "acoustic" ? 0.016 : 0.015)],
      rot: [0, 0, (u1 - u0) / len],
    });
  }
  // (a strap button at its foot)
  m.add(cyl(0.006, 0.006, 0.01, 8), P.chrome, { at: [x, bodyBottom - 0.008, bz] });
  void bodyTop;
}
function guitarHooks(m: Model, o: Look) {
  const rail = o.look === 0;
  const H = 1.9; // the hooks' yokes
  if (rail) {
    m.add(box([1.7, 0.09, 0.022], 0.005), P.oak, { at: [1, H, FACE + 0.011] });
    for (const x of [0.2, 1.8]) disc(m, x, H, FACE + 0.022, 0.007, P.brass, 0.003, 8);
  }
  const kinds: Axe[] = ["acoustic", "electric", "bass"];
  const pick = Math.floor(o.seed * 6);
  const pair: Axe[] = [kinds[pick % 3], kinds[(pick + 1 + (pick > 2 ? 1 : 0)) % 3]];
  pair.forEach((kind, i) => {
    const x = 0.55 + i * 0.9;
    // the hook: its foot on the rail or the wall, the stem out, the yoke's two padded prongs either
    // side of the neck, turned up at their tips
    const foot = rail ? FACE + 0.022 : FACE;
    if (!rail) disc(m, x, H, FACE, 0.026, 0x1a1a1c, 0.01, 14);
    m.add(cyl(0.008, 0.008, FACE + 0.05 - foot, 8), 0x1a1a1c, { at: [x, H, foot], rot: [Math.PI / 2, 0, 0] });
    m.add(cyl(0.007, 0.007, 0.07, 8), 0x1a1a1c, { at: [x - 0.035, H, FACE + 0.05], rot: [0, 0, -Math.PI / 2] });
    for (const s of [-1, 1]) {
      m.add(cyl(0.007, 0.007, 0.08, 8), 0x2a2a2c, { at: [x + s * 0.034, H, FACE + 0.05], rot: [Math.PI / 2, 0, 0] });
      m.add(cyl(0.008, 0.007, 0.025, 8), 0x2a2a2c, { at: [x + s * 0.034, H, FACE + 0.128] });
      m.add(ball(0.009, 6), 0x2a2a2c, { at: [x + s * 0.034, H + 0.025, FACE + 0.128] });
    }
    const c = FINISH[Math.floor(rnd(i, 1, o.seed) * FINISH.length)];
    guitar(m, x, H + 0.012, kind, c, rnd(i, 2, o.seed) < 0.4);
  });
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  cuckoo_clock: cuckooClock,
  world_clocks: worldClocks,
  wall_calendar: wallCalendar,
  thermostat,
  members_map: membersMap,
  pegboard,
  wall_skateboard: wallSkateboard,
  framed_records: framedRecords,
  tapestry,
  wall_mirror: wallMirror,
  carved_antlers: carvedAntlers,
  exit_sign: exitSign,
  fire_alarm: fireAlarm,
  guitar_hooks: guitarHooks,
};
