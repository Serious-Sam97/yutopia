import {
  laneOffset,
  SLOT_COLORS,
  SLOT_HALF_WIDTH,
  SLOT_LANES,
  SLOT_TOP,
  type SlotTrackId,
  slotDistance,
  slotLap,
  slotPoint,
  slotStops,
  slotTrackOf,
} from "@yutopia/shared/slotcar";
import { fr, INK, rnd, type Sketch, sh, te, tr, type V3 } from "./kit";
import { K, M } from "./pal";

// The slot-car track (autorama): a 4 × 3 walnut table on turned legs, its top a
// mown felt field with the circuit on it — speckled asphalt, four slots with
// steel rails, red-and-white kerbs and sand traps on the corners, tyre stacks
// in the table's corners, a chequered line with grid boxes — a grandstand with
// its crowd and a floodlight along the far side, a pit garage and pines in the
// infield, sponsor boards along the front, the lap tower in the far
// corner. Under it: the controllers hanging from the power box, and the set's
// own box on the shelf (the story detail). The cars and the start gantry are
// drawn live (`world/slots.ts`) on the same lines (shared/slotcar.ts).
//
// What stands on the table sits behind the cars it could overlap (the cars are
// drawn over the table): the grandstand and the floodlight behind the far
// straight, the infield pieces clear of the far side's lanes on screen.
//
// The table shows the track in its `props.track` (shared SLOT_TRACKS; the
// classic for none). The pit garage and the pines go wherever that track
// leaves room (first free spot of a few), so a figure of eight or a cloverleaf
// through the middle isn't built over.

const Z = SLOT_TOP;
const FELT = "#5f7a3a";
const ASPHALT = "#3b3a36";
const RAIL = "#a39c8e"; // steel
const KERB = [K.red, "#f2e8d2"];
const SAND = "#d8c08c";
const HW = SLOT_HALF_WIDTH;

// Where the pit garage (with its apron) could stand, first choice first; and
// where pines could, the first three with room taken.
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
// a rectangle on the table with nothing of the track under it (or near it)
function roomFor(id: SlotTrackId, x0: number, y0: number, x1: number, y1: number, pad = 0.1): boolean {
  const pts: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
    [(x0 + x1) / 2, (y0 + y1) / 2],
    [(x0 + x1) / 2, y0],
    [(x0 + x1) / 2, y1],
    [x0, (y0 + y1) / 2],
    [x1, (y0 + y1) / 2],
  ];
  return pts.every(([x, y]) => slotDistance(x, y, id) > HW + pad);
}

export function slotTrack(s: Sketch, p: Record<string, unknown> = {}) {
  const id = slotTrackOf(p);
  const stops = slotStops(0.05, id);
  const lap = slotLap(id);
  // a point beside the track at progress s, `off` left of the centre line
  const at = (s: number, off: number, z: number): V3 => {
    const q = slotPoint(s, off, id);
    return [q.x, q.y, z];
  };
  // a strip along the track between two offsets, from s0 to s1
  const strip = (s0: number, s1: number, o0: number, o1: number, z: number): V3[] => [
    at(s0, o0, z),
    at(s1, o0, z),
    at(s1, o1, z),
    at(s0, o1, z),
  ];

  // ── the table ──────────────────────────────────────────────────────────────
  for (const [x, y] of [
    [0.14, 0.14],
    [3.86, 0.14],
    [0.14, 2.86],
    [3.86, 2.86],
  ]) {
    s.cyl({ x, y, z: 0, r: 0.045, r2: 0.06, h: 6, mat: M.walnutDark, line: 0.6 });
    s.cyl({ x, y, z: 6, r: 0.07, h: 1.6, mat: M.walnut, line: 0.5 });
    s.cyl({ x, y, z: 7.6, r: 0.05, r2: 0.055, h: Z - 12.6, mat: M.walnutDark, line: 0.6 });
  }
  // the shelf low between the legs, the set's box on it (the story detail)
  s.box({ x: 0.22, y: 0.4, w: 3.56, d: 2.2, z: 6.2, h: 1.2, mat: M.walnut, line: 0.7 });
  s.box({ x: 0.55, y: 1.35, w: 1.25, d: 0.85, z: 7.4, h: 4.2, mat: { c: K.paper, top: "#fffaf0" }, line: 0.8 }, (d) => {
    d.poly("t", tr(11.62, 0.6, 1.62, 1.75, 1.8), K.red);
    d.poly("t", tr(11.64, 0.68, 1.45, 1.05, 1.58), SLOT_COLORS[1]);
    d.poly("t", tr(11.64, 1.1, 1.45, 1.6, 1.58), SLOT_COLORS[0]);
    d.poly("s", fr("s", 2.2, 0.6, 1.75, 8.6, 10), K.red);
    d.poly("s", fr("s", 2.201, 0.68, 0.98, 9, 9.6), "#f2e8d2");
  });
  s.box({ x: 1.95, y: 1.6, w: 0.7, d: 0.55, z: 7.4, h: 2.2, mat: { c: K.creamDark }, line: 0.6 }); // spare track pieces

  // the top: layered plywood under a walnut lip, the felt
  s.box(
    { x: -0.02, y: -0.02, w: 4.04, d: 3.04, z: Z - 5.5, h: 2.2, mat: { c: "#d9b98a", top: "#e4c79a" }, line: 0.7 },
    (d) => {
      for (const z of [Z - 4.8, Z - 4.1]) {
        d.line("s", [-0.02, 3.02, z], [4.02, 3.02, z], "#b8955f", 0.4);
        d.line("e", [4.02, -0.02, z], [4.02, 3.02, z], "#b8955f", 0.4);
      }
    },
  );
  // the power box under the front lip: four jacks, the controllers hanging by their cords
  s.box({ x: 2.92, y: 2.86, w: 0.66, d: 0.12, z: Z - 10.5, h: 5, mat: M.graphite, line: 0.7 }, (d) => {
    for (let lane = 0; lane < SLOT_LANES; lane++) {
      const u = 3.0 + lane * 0.15;
      d.poly("s", fr("s", 2.981, u, u + 0.07, Z - 8.4, Z - 7), SLOT_COLORS[lane], { stroke: INK, sw: 0.3 });
      d.line("s", [u + 0.035, 2.99, Z - 8.4], [u + 0.03 + (lane - 1.5) * 0.02, 2.99, Z - 15], "#1c1a17", 0.7);
    }
    d.poly("s", fr("s", 2.981, 2.95, 2.99, Z - 6.6, Z - 6.1), K.red, { glow: true }); // power on
  });
  for (let lane = 0; lane < SLOT_LANES; lane++) {
    const u = 3.0 + lane * 0.15 + (lane - 1.5) * 0.02;
    s.box({ x: u - 0.035, y: 2.97, w: 0.07, d: 0.05, z: Z - 18.5, h: 3.6, mat: { c: SLOT_COLORS[lane] }, line: 0.5 });
  }

  // the infield: the garage (with its apron) where the track leaves room, if anywhere
  const garage = GARAGE_SPOTS.find(([x, y]) => roomFor(id, x - 0.1, y - 0.04, x + 0.9, y + 0.5));
  const pines = PINE_SPOTS.filter(([x, y, k]) =>
    roomFor(id, x - 0.14 * k, y - 0.14 * k, x + 0.14 * k, y + 0.14 * k, 0.04),
  ).slice(0, 3);

  s.box({ x: 0, y: 0, w: 4, d: 3, z: Z - 3.3, h: 3.3, mat: { c: K.walnut, top: FELT, gloss: 0.4 } }, (d) => {
    // mown stripes and a mottle of darker and lighter grass
    for (let i = 0; i < 16; i++)
      if (i % 2) d.poly("t", tr(Z + 0.005, i * 0.25, 0.02, i * 0.25 + 0.25, 2.98), "#ffffff", { op: 0.035 });
    for (let i = 0; i < 26; i++) {
      const x = 0.2 + rnd(i, 1, 0.31) * 3.6;
      const y = 0.2 + rnd(i, 2, 0.31) * 2.6;
      d.poly("t", te(Z + 0.01, x, y, 0.05 + rnd(i, 3, 0.31) * 0.12, 10), i % 3 ? "#435a28" : "#86a352", {
        op: 0.14,
      });
    }

    // sand traps outside every corner
    for (let i = 0; i < stops.length - 1; i++)
      if (stops[i].curve)
        d.poly("t", strip(stops[i].s, stops[i + 1].s, -HW - 0.05, -HW - 0.14, Z + 0.02), SAND, {
          stroke: SAND,
          sw: 0.4,
        });
    for (let i = 0; i < 60; i++) {
      const j = Math.floor(rnd(i, 7, 0.5) * (stops.length - 1));
      if (!stops[j].curve) continue;
      const q = slotPoint(stops[j].s + rnd(i, 8, 0.5) * 0.05, -HW - 0.06 - rnd(i, 9, 0.5) * 0.07, id);
      d.poly("t", te(Z + 0.03, q.x, q.y, 0.008, 5), i % 2 ? "#b89c66" : "#efe0b8");
    }

    // the asphalt (one gradient over the whole table, so the strips join),
    // speckled
    const tarmac = s.gradAt(sh(ASPHALT, 1.18), sh(ASPHALT, 0.86), d.m(0, 0, Z), d.m(4, 3, Z));
    for (let i = 0; i < stops.length - 1; i++)
      d.poly("t", strip(stops[i].s, stops[i + 1].s, -HW, HW, Z + 0.04), tarmac, { stroke: tarmac, sw: 0.5 });
    for (let i = 0; i < 220; i++) {
      const q = slotPoint(rnd(i, 4, 0.7) * lap, (rnd(i, 5, 0.7) * 2 - 1) * (HW - 0.03), id);
      d.poly("t", te(Z + 0.06, q.x, q.y, 0.006, 5), i % 2 ? "#57544c" : "#2a2925", { op: 0.8 });
    }
    // darker racing line through the corners (rubber laid down)
    for (let i = 0; i < stops.length - 1; i++)
      if (stops[i].curve)
        d.poly("t", strip(stops[i].s, stops[i + 1].s, -0.08, 0.08, Z + 0.07), "#1f1e1b", { op: 0.25 });

    // kerbs on both sides of every corner, edge lines along it all
    for (let i = 0; i < stops.length - 1; i++) {
      if (!stops[i].curve) continue;
      for (const side of [-1, 1])
        d.poly("t", strip(stops[i].s, stops[i + 1].s, side * HW, side * (HW + 0.055), Z + 0.08), KERB[i % 2]);
    }
    for (const side of [-1, 1])
      for (let i = 0; i < stops.length - 1; i++)
        d.line(
          "t",
          at(stops[i].s, side * (HW - 0.022), Z + 0.1),
          at(stops[i + 1].s, side * (HW - 0.022), Z + 0.1),
          "#d9d2bf",
          0.55,
        );

    // the lanes: a dark slot with a thin steel rail either side (opaque lines:
    // see-through ones overlap into dots where the pieces meet)
    for (let lane = 0; lane < SLOT_LANES; lane++) {
      const off = laneOffset(lane);
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i].s;
        const b = stops[i + 1].s;
        for (const side of [-1, 1])
          d.line("t", at(a, off + side * 0.017, Z + 0.12), at(b, off + side * 0.017, Z + 0.12), RAIL, 0.5);
        d.line("t", at(a, off, Z + 0.14), at(b, off, Z + 0.14), "#141210", 0.55);
      }
    }

    // the start line, chequered, and the grid: a box and a colour per lane
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 10; c++) {
        const o0 = -HW + (c * 2 * HW) / 10;
        const o1 = o0 + (2 * HW) / 10;
        d.poly("t", strip(r * 0.04, r * 0.04 + 0.04, o0, o1, Z + 0.2), (r + c) % 2 ? "#f2e8d2" : "#1c1a17");
      }
    for (let lane = 0; lane < SLOT_LANES; lane++) {
      const off = laneOffset(lane);
      d.poly("t", strip(-0.34, -0.31, off - 0.05, off + 0.05, Z + 0.2), "#e9e1cc", { op: 0.85 });
      d.poly("t", strip(-0.07, -0.04, off - 0.05, off + 0.05, Z + 0.2), SLOT_COLORS[lane], { op: 0.9 });
    }

    // the pit lane in front of the garage: grey apron, a white line
    if (garage) {
      const [gx, gy] = garage;
      d.poly("t", tr(Z + 0.05, gx - 0.1, gy + 0.32, gx + 0.9, gy + 0.49), "#5e5a52");
      d.line("t", [gx - 0.1, gy + 0.48, Z + 0.07], [gx + 0.9, gy + 0.48, Z + 0.07], "#e9e1cc", 0.5);
      d.poly("t", tr(Z + 0.06, gx - 0.03, gy + 0.35, gx + 0.83, gy + 0.4), "#4b4841", { op: 0.6 });
    }
  });

  // ── on the table ───────────────────────────────────────────────────────────
  // tyre stacks in the four corners
  for (const [x, y] of [
    [0.1, 0.1],
    [3.9, 0.1],
    [0.1, 2.9],
    [3.9, 2.9],
  ])
    for (let k = 0; k < 2; k++)
      s.cyl({ x, y, z: Z + k * 2.2, r: 0.055, h: 2.2, mat: { c: "#24221f", top: "#3a3733" }, line: 0.5 }, (d) => {
        if (k === 1) d.poly("t", te(Z + 4.42, x, y, 0.03, 10), "#141210");
      });

  // the grandstand behind the far straight: three tiers full of people, a roof
  const crowd = ["#c4402b", "#efe4cc", "#4f86c6", "#f0a12c", "#7fa34a", "#2b2a26", "#b5562f", "#d6c9a6"];
  const tiers: [number, number, number][] = [
    [0.03, 0.08, 8],
    [0.08, 0.13, 5.5],
    [0.13, 0.18, 3],
  ];
  for (const [y0, y1, h] of tiers)
    s.box({ x: 0.8, y: y0, w: 2.3, d: y1 - y0, z: Z, h, mat: M.cream, line: 0.6 }, (d) => {
      for (let i = 0; i < 26; i++) {
        const x = 0.86 + i * 0.085 + rnd(i, Math.round(h), 0.2) * 0.02;
        const c = crowd[Math.floor(rnd(i, Math.round(h * 3), 0.9) * crowd.length)];
        d.poly("t", te(Z + h + 0.9, x, (y0 + y1) / 2, 0.018, 8), c, { stroke: INK, sw: 0.25 });
        d.poly("t", te(Z + h + 1.9, x, (y0 + y1) / 2 - 0.004, 0.012, 8), "#e0b48c"); // heads
      }
    });
  for (const x of [0.82, 3.06]) s.box({ x, y: 0.02, w: 0.04, d: 0.04, z: Z, h: 13, mat: M.aluminium, line: 0.5 });
  s.box({ x: 0.76, y: 0.0, w: 2.38, d: 0.16, z: Z + 13, h: 1.4, mat: M.rust, line: 0.7 }, (d) => {
    for (let i = 0; i < 6; i++) {
      const x = 0.9 + i * 0.38;
      d.poly("s", fr("s", 0.16, x, x + 0.18, Z + 13.1, Z + 14.3), i % 2 ? "#f2e8d2" : K.red, { op: 0.9 });
    }
  });
  // a floodlight at the far-left corner of the stand
  s.cyl({ x: 0.42, y: 0.08, z: Z, r: 0.025, h: 26, mat: M.aluminium, line: 0.5 });
  s.box({ x: 0.3, y: 0.05, w: 0.24, d: 0.07, z: Z + 26, h: 4, mat: M.graphite, line: 0.6 }, (d) => {
    for (let i = 0; i < 3; i++)
      d.poly("s", fr("s", 0.121, 0.33 + i * 0.07, 0.38 + i * 0.07, Z + 26.8, Z + 29.2), K.amber, { glow: true });
  });

  // the lap tower in the far corner: a row per lane, the lap count lit
  s.box({ x: 3.4, y: 0.06, w: 0.44, d: 0.2, z: Z, h: 22, mat: M.graphite }, (d) => {
    d.poly("s", fr("s", 0.26, 3.44, 3.8, 3 + Z, 19.5 + Z), K.screen);
    for (let lane = 0; lane < SLOT_LANES; lane++) {
      const z = Z + 16 - lane * 3.4;
      d.poly("s", fr("s", 0.261, 3.47, 3.53, z, z + 2.2), SLOT_COLORS[lane]);
      d.poly("s", fr("s", 0.261, 3.58, 3.77, z, z + 2.2), K.vfd, { glow: true, op: 0.85 });
    }
    d.poly("s", fr("s", 0.261, 3.44, 3.8, Z + 20, Z + 21.4), K.red, { glow: true });
  });

  // the pit garage: three bays, the doors up, a car nose in each; a rust roof
  if (garage) {
    const [gx, gy] = garage;
    const front = gy + 0.3;
    s.box({ x: gx, y: gy, w: 0.8, d: 0.3, z: Z, h: 6.5, mat: M.cream }, (d) => {
      for (let i = 0; i < 3; i++) {
        const u = gx + 0.06 + i * 0.25;
        d.poly("s", fr("s", front, u, u + 0.2, Z + 0.4, Z + 4.8), "#2b2a26");
        d.poly("s", fr("s", front + 0.001, u + 0.03, u + 0.17, Z + 0.5, Z + 1.8), SLOT_COLORS[i + 1], { op: 0.85 });
        d.poly("s", fr("s", front + 0.001, u, u + 0.2, Z + 4.8, Z + 5.4), "#9a948a");
      }
    });
    s.box({ x: gx - 0.04, y: gy - 0.04, w: 0.88, d: 0.38, z: Z + 6.5, h: 1.3, mat: M.rust, line: 0.8 }, (d) => {
      d.poly("s", fr("s", front + 0.04, gx + 0.25, gx + 0.55, Z + 6.6, Z + 7.6), "#f2e8d2"); // the PIT sign
      d.line("s", [gx + 0.3, front + 0.041, Z + 7.1], [gx + 0.5, front + 0.041, Z + 7.1], K.red, 0.6);
    });
  }

  // pines
  for (const [x, y, k] of pines) {
    s.cyl({ x, y, z: Z, r: 0.025, h: 2.5, mat: M.walnutDark, line: 0.5 });
    s.cyl({ x, y, z: Z + 2.5, r: 0.13 * k, r2: 0.05 * k, h: 5 * k, mat: { c: K.leafDark, top: K.leaf }, line: 0.6 });
    s.cyl({
      x,
      y,
      z: Z + 2.5 + 4 * k,
      r: 0.09 * k,
      r2: 0.01,
      h: 6 * k,
      mat: { c: K.leafDark, top: K.leaf },
      line: 0.6,
    });
  }
  // sponsor boards along the front edge
  const boards = ["#f2e8d2", K.rust, K.slate, K.olive, "#f2e8d2", K.red];
  for (let i = 0; i < 6; i++) {
    const x0 = 0.5 + i * 0.5;
    s.box({ x: x0, y: 2.93, w: 0.44, d: 0.03, z: Z, h: 2.6, mat: { c: boards[i] }, line: 0.5 }, (d) => {
      const ink = boards[i] === "#f2e8d2" ? K.red : "#f2e8d2";
      d.poly("s", fr("s", 2.961, x0 + 0.06, x0 + 0.2, Z + 0.8, Z + 1.8), ink);
      d.line("s", [x0 + 0.24, 2.961, Z + 1.3], [x0 + 0.38, 2.961, Z + 1.3], ink, 0.6);
    });
  }

  s.shadow(0, 0, 4, 3, 0.16, 0.8);
  for (const [x, y] of [
    [0.14, 0.14],
    [3.86, 0.14],
    [0.14, 2.86],
    [3.86, 2.86],
  ])
    s.shadowDot(x, y, 0.12, 0.4);
}
