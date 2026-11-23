// Glass Tower (docs/plan/114-the-strike-park.md, S-M6): hostage rescue in an office block half built,
// snowed in on its site. Our own map, built up rather than out:
//   - four storeys (the ground at 0, then 3.4, 6.8 and 10.2), a roof over the west half only, the east
//     half of the top floor open to the sky behind a parapet;
//   - the Raiders hold the top floor: they start on the Core Deck (the concrete core poured to the 3rd
//     floor and no further), the hostages in the Boardroom (north-west) and the Corner Suite
//     (north-east), each sat over a concrete pier that runs the building's height;
//   - the Wardens start in the Street (south) and climb: the West Stair (in by the lobby or the loading
//     bay), the East Stair (in by the side door), or the Scaffold up the south face (in at the 2nd
//     and 3rd floors where the glass isn't in yet); a fourth way, the Pallet Climb in the Back Alley,
//     boosts onto the 1st floor through the unglazed bay the Raiders drop out of;
//   - the hostages go out to the Loading Dock (west, by the roller door), on the Wardens' side.
// Lifts are off. Drywall partitions (shot through), glass curtain walls (shot through), a concrete core
// and stairwells (not). 88 × 82 m, the site's hoarding round it.

import type { Mat, P, Piece, Rect, StrikeMap } from "../map.ts";
import { rect } from "../map.ts";

/** the storeys' floor heights: ground, 1st, 2nd, 3rd (the hostages'), the roof */
const LV = [0, 3.4, 6.8, 10.2, 13.6];
/** a storey's walls, up to the slab's underside */
const WALL_H = 3.1;
/** the building's footprint */
const B: Rect = { x0: -24, z0: -18, x1: 24, z1: 18 };
/** the core: poured to the 3rd floor, solid (its lifts are off) */
const CORE: Rect = { x0: -6, z0: -4, x1: 6, z1: 4 };

const pieces: Piece[] = [];
const add = (...ps: Piece[]) => pieces.push(...ps);

/** a storey's wall from a to b (lv: 0–3), `h` its height over that floor */
const wall = (lv: number, a: P, b: P, m: Mat, look?: string, h = WALL_H, t = 0.2) =>
  add({ k: "wall", a, b, y0: LV[lv], y1: LV[lv] + h, t, m, ...(look ? { look } : {}) });
/** a run of wall along x (at z) from x0 to x1 with doors [from, to] left open */
const runX = (
  lv: number,
  z: number,
  x0: number,
  x1: number,
  doors: [number, number][],
  m: Mat,
  look?: string,
  h = WALL_H,
) => {
  let x = x0;
  for (const [d0, d1] of [...doors].sort((a, b) => a[0] - b[0])) {
    if (d0 > x) wall(lv, [x, z], [d0, z], m, look, h);
    x = d1;
  }
  if (x1 > x) wall(lv, [x, z], [x1, z], m, look, h);
};
/** the same along z (at x) */
const runZ = (
  lv: number,
  x: number,
  z0: number,
  z1: number,
  doors: [number, number][],
  m: Mat,
  look?: string,
  h = WALL_H,
) => {
  let z = z0;
  for (const [d0, d1] of [...doors].sort((a, b) => a[0] - b[0])) {
    if (d0 > z) wall(lv, [x, z], [x, d0], m, look, h);
    z = d1;
  }
  if (z1 > z) wall(lv, [x, z], [x, z1], m, look, h);
};

/** A slab over the footprint at `y` with holes cut (the stairwells, the atrium, the core): split on
 *  the holes' edges into as few rectangles as rows allow. */
function slab(y: number, holes: Rect[], m: Mat, look: string, over: Rect = B) {
  const xs = [...new Set([over.x0, over.x1, ...holes.flatMap((h) => [h.x0, h.x1])])]
    .filter((x) => x >= over.x0 && x <= over.x1)
    .sort((a, b) => a - b);
  const zs = [...new Set([over.z0, over.z1, ...holes.flatMap((h) => [h.z0, h.z1])])]
    .filter((z) => z >= over.z0 && z <= over.z1)
    .sort((a, b) => a - b);
  const inHole = (x: number, z: number) => holes.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
  for (let j = 0; j + 1 < zs.length; j++) {
    let i = 0;
    while (i + 1 < xs.length) {
      if (inHole((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)) {
        i++;
        continue;
      }
      let k = i + 1;
      while (k + 1 < xs.length && !inHole((xs[k] + xs[k + 1]) / 2, (zs[j] + zs[j + 1]) / 2)) k++;
      add({ k: "floor", x0: xs[i], z0: zs[j], x1: xs[k], z1: zs[j + 1], y, t: 0.3, m, look });
      i = k;
    }
  }
}

// ── the stairwells: two lanes 2.5 m wide either side of a concrete divider, a flight a storey (3.4 m
// over 6 m, 0.2 m risers), landings 2.5 m deep at both ends open to the floor. The flights switch lanes
// each storey: lane a rises north (ground → 1st, 2nd → 3rd), lane b south (1st → 2nd). Over each
// flight the slab it climbs into is left open, and railed at the far end ──
interface Well {
  name: string;
  /** lane a's and lane b's x ranges (a by the façade) */
  a: [number, number];
  b: [number, number];
  /** the flights' z range (north, south); the landings 2.5 m beyond each end */
  f: [number, number];
}
const WELLS: Well[] = [
  { name: "West Stair", a: [-23.5, -21], b: [-21, -18.5], f: [-12, -6] },
  { name: "East Stair", a: [21, 23.5], b: [18.5, 21], f: [6.5, 12.5] },
];
const laneRect = (w: Well, lane: "a" | "b"): Rect => rect(w[lane][0], w.f[0], w[lane][1], w.f[1]);
/** the hole each slab needs over its stairwells: over the flight that climbs into it */
const wellHoles = (lv: number): Rect[] =>
  lv === 2 ? WELLS.map((w) => laneRect(w, "b")) : WELLS.map((w) => laneRect(w, "a"));
const wellBox = (w: Well): Rect => rect(Math.min(w.a[0], w.b[0]), w.f[0] - 2.5, Math.max(w.a[1], w.b[1]), w.f[1] + 2.5);

for (const w of WELLS) {
  const [n, s] = w.f;
  const ar = laneRect(w, "a");
  const br = laneRect(w, "b");
  add({ k: "stairs", ...ar, y0: LV[0], y1: LV[1], up: "n", m: "concrete" });
  add({ k: "stairs", ...br, y0: LV[1], y1: LV[2], up: "s", m: "concrete" });
  add({ k: "stairs", ...ar, y0: LV[2], y1: LV[3], up: "n", m: "concrete" });
  // the divider between the lanes, the flights' height (0 to the 3rd floor's walls)
  const xd = w.a[0] < w.b[0] ? w.a[1] : w.a[0];
  add({ k: "wall", a: [xd, n], b: [xd, s], t: 0.3, y0: 0, y1: LV[3] + WALL_H, m: "concrete", look: "core" });
  // the well's inner side (the façade is its outer side)
  const xi = w.a[0] < w.b[0] ? w.b[1] + 0.15 : w.b[0] - 0.15;
  add({
    k: "wall",
    a: [xi, n - 2.5],
    b: [xi, s + 2.5],
    t: 0.3,
    y0: 0,
    y1: LV[3] + WALL_H,
    m: "concrete",
    look: "core",
  });
  // rails over the holes, at the end the flight doesn't arrive at: 1st and 3rd (lane a, arriving
  // north) railed south; the 2nd (lane b, arriving south) railed north
  for (const lv of [1, 3]) wall(lv, [ar.x0, s], [ar.x1, s], "metal", "rail", 1.2);
  wall(2, [br.x0, n], [br.x1, n], "metal", "rail", 1.2);
}
const [WS, ES] = WELLS;

// ── the hostages, each held over a pier: a concrete column 2.5 m square from the ground to the 3rd
// floor (so the floors below can't be stood on under them, and they're cover on every storey) ──
const HOSTAGES: P[] = [
  [-13.25, -14.25], // the Boardroom, by the window
  [-8.75, -11.25], // the Boardroom, by its table
  [13.25, -14.25], // the Corner Suite, north
  [18.75, -9.75], // the Corner Suite, by the east glass
];
for (const [x, z] of HOSTAGES)
  add({ k: "box", x0: x - 1.25, z0: z - 1.25, x1: x + 1.25, z1: z + 1.25, y1: LV[3], m: "concrete", look: "pier" });

// ── the core: solid to the 3rd floor; its top the Core Deck (the Raiders' start) ──
add({ k: "box", ...CORE, y1: LV[3], m: "concrete", look: "core" });

// ── the slabs ──
const ATRIUM: Rect = { x0: -10, z0: 8, x1: 10, z1: 16 };
slab(LV[1], [...wellHoles(1), ATRIUM, CORE], "concrete", "slab");
slab(LV[2], [...wellHoles(2), CORE], "concrete", "slab");
slab(LV[3], [...wellHoles(3), CORE], "concrete", "slab");
// the roof: the west half only (the east half's still open to the sky)
add({ k: "floor", x0: B.x0, z0: B.z0, x1: 0, z1: B.z1, y: LV[4], t: 0.3, m: "concrete", look: "roof" });

// ── the façades. Each storey's: its sides from corner to corner, gaps where there's a way in or the
// glass isn't in; the stairwells' bays concrete ──
const facade = (
  lv: number,
  m: Mat,
  look: string,
  gaps: { n?: [number, number][]; s?: [number, number][]; w?: [number, number][]; e?: [number, number][] },
  h = WALL_H,
) => {
  runX(lv, B.z0, B.x0, B.x1, gaps.n ?? [], m, look, h);
  runX(lv, B.z1, B.x0, B.x1, gaps.s ?? [], m, look, h);
  runZ(lv, B.x0, B.z0, B.z1, gaps.w ?? [], m, look, h);
  runZ(lv, B.x1, B.z0, B.z1, gaps.e ?? [], m, look, h);
};
const wsBox = wellBox(WS);
const esBox = wellBox(ES);
// (the stairwells' bays: concrete over the glass, all storeys)
for (let lv = 0; lv <= 3; lv++) {
  wall(lv, [B.x0, wsBox.z0], [B.x0, wsBox.z1], "concrete", "core");
  wall(lv, [B.x1, esBox.z0], [B.x1, esBox.z1], "concrete", "core");
}
// ground: the lobby's glass front with its doors; the loading bay's roller door (west); the side
// door (east); the back door (north)
runX(0, B.z1, B.x0, B.x1, [[-2, 2]], "glass", "curtain");
runZ(
  0,
  B.x0,
  B.z0,
  B.z1,
  [
    [wsBox.z0, wsBox.z1],
    [8, 13],
  ],
  "concrete",
  "plinth",
);
runZ(
  0,
  B.x1,
  B.z0,
  B.z1,
  [
    [-1.5, 1.5],
    [esBox.z0, esBox.z1],
  ],
  "concrete",
  "plinth",
);
runX(0, B.z0, B.x0, B.x1, [[8, 11]], "concrete", "plinth");
// 1st: glazed, but for the north bay over the back alley (the Drop)
facade(1, "glass", "curtain", { n: [[-4, 4]], w: [[wsBox.z0, wsBox.z1]], e: [[esBox.z0, esBox.z1]] });
// 2nd: glazed, the scaffold's way in on the south face
facade(2, "glass", "curtain", { s: [[-2.5, 2.5]], w: [[wsBox.z0, wsBox.z1]], e: [[esBox.z0, esBox.z1]] });
// 3rd: glazed under the roof (the west half); the east half a parapet, the scaffold's top way in
runX(3, B.z0, B.x0, 0, [], "glass", "curtain");
runX(3, B.z1, B.x0, 0, [], "glass", "curtain");
runZ(3, B.x0, B.z0, B.z1, [[wsBox.z0, wsBox.z1]], "glass", "curtain");
runX(3, B.z0, 0, B.x1, [], "concrete", "parapet", 1.2);
runX(3, B.z1, 0, B.x1, [[11.5, 14.5]], "concrete", "parapet", 1.2);
runZ(3, B.x1, B.z0, B.z1, [[esBox.z0, esBox.z1]], "concrete", "parapet", 1.2);

// ── the scaffold up the south face: two lanes (inner by the glass, outer) parted by netting, ramps
// a storey each (8 m), decks at each end. Ground → 1st up the outer lane east, 1st → 2nd the inner
// lane west, 2nd → 3rd the outer lane east; in at the 2nd (west deck) and the 3rd (east deck) ──
const SC = {
  x0: -3,
  x1: 15,
  deckW: 3,
  rampX: [3, 11] as [number, number],
  inner: [18, 21] as [number, number],
  outer: [21, 23.5] as [number, number],
};
add({
  k: "ramp",
  x0: SC.rampX[0],
  z0: SC.outer[0],
  x1: SC.rampX[1],
  z1: SC.outer[1],
  y0: LV[0],
  y1: LV[1],
  up: "e",
  m: "plank",
});
add({
  k: "ramp",
  x0: SC.rampX[0],
  z0: 18.5,
  x1: SC.rampX[1],
  z1: SC.inner[1],
  y0: LV[1],
  y1: LV[2],
  up: "w",
  m: "plank",
});
add({
  k: "ramp",
  x0: SC.rampX[0],
  z0: SC.outer[0],
  x1: SC.rampX[1],
  z1: SC.outer[1],
  y0: LV[2],
  y1: LV[3],
  up: "e",
  m: "plank",
});
add({
  k: "floor",
  x0: SC.rampX[1],
  z0: 18,
  x1: SC.x1,
  z1: SC.outer[1],
  y: LV[1],
  t: 0.25,
  m: "plank",
  look: "scaffold",
});
add({
  k: "floor",
  x0: SC.x0,
  z0: 18,
  x1: SC.rampX[0],
  z1: SC.outer[1],
  y: LV[2],
  t: 0.25,
  m: "plank",
  look: "scaffold",
});
add({
  k: "floor",
  x0: SC.rampX[1],
  z0: 18,
  x1: SC.x1,
  z1: SC.outer[1],
  y: LV[3],
  t: 0.25,
  m: "plank",
  look: "scaffold",
});
// the netting between the lanes (the flights' length), and the standards at the corners
add({
  k: "wall",
  a: [SC.rampX[0] + 0.5, 21],
  b: [SC.rampX[1] - 0.5, 21],
  t: 0.2,
  y0: 0,
  y1: LV[3] + 1.2,
  m: "sheet",
  look: "netting",
});
for (const x of [SC.x0, SC.rampX[0], SC.rampX[1], SC.x1])
  add({
    k: "box",
    x0: x - 0.1,
    z0: SC.outer[1] - 0.1,
    x1: x + 0.1,
    z1: SC.outer[1] + 0.1,
    y1: LV[3] + 2,
    m: "metal",
    look: "standard",
  });

// ── ground floor: the lobby (its atrium open to the 1st), the loading bay (west), the back hall ──
// the loading bay's wall to the lobby, and its north wall
runZ(0, -14, 4, 18, [[10, 13]], "drywall", "partition");
runX(0, 4, -24, -14, [[-21, -17]], "drywall", "partition");
// the security desk, the turnstiles
add({ k: "box", x0: -3, z0: 9.5, x1: 3, z1: 10.5, y1: 1.1, m: "wood", look: "desk" });
add({ k: "box", x0: -9, z0: 6.5, x1: -5, z1: 7, y1: 1.0, m: "metal", look: "turnstile" });
add({ k: "box", x0: 5, z0: 6.5, x1: 9, z1: 7, y1: 1.0, m: "metal", look: "turnstile" });
// the back hall's mail room (drywall: shot through)
runX(0, -10, -6, 6, [[-1.5, 1.5]], "drywall", "partition");
runZ(0, -6, -18, -10, [], "drywall", "partition");
runZ(0, 6, -18, -10, [], "drywall", "partition");

// columns on every storey (concrete, 0.6 square) where nothing else stands
const COLS: P[] = [
  [-12, 0],
  [12, 0],
  [-12, 12],
  [12, 12],
  [0, -14],
  [-16, -4],
  [16, -2],
];
for (let lv = 0; lv <= 3; lv++)
  for (const [x, z] of COLS) {
    if (lv === 3 && x > 0) continue; // (the open half's columns stop at the parapet's height: rebar)
    add({
      k: "box",
      x0: x - 0.3,
      z0: z - 0.3,
      x1: x + 0.3,
      z1: z + 0.3,
      y0: LV[lv],
      y1: LV[lv] + WALL_H,
      m: "concrete",
      look: "column",
    });
  }

// ── 1st floor, the fit-out: open plan, studs half up, plasterboard on pallets; the atrium railed (a
// gap in its north rail: jump down into the lobby) ──
runX(1, ATRIUM.z1, ATRIUM.x0, ATRIUM.x1, [], "glass", "balustrade", 1.2);
runX(1, ATRIUM.z0, ATRIUM.x0, ATRIUM.x1, [[-1.5, 1.5]], "glass", "balustrade", 1.2);
runZ(1, ATRIUM.x0, ATRIUM.z0, ATRIUM.z1, [], "glass", "balustrade", 1.2);
runZ(1, ATRIUM.x1, ATRIUM.z0, ATRIUM.z1, [], "glass", "balustrade", 1.2);
runZ(1, -10, -16, -6, [[-12, -9]], "drywall", "studs");
runX(1, -6, -18, -10, [], "drywall", "studs");
runZ(1, 10, -16, -6, [[-12, -9]], "drywall", "studs");
runX(1, 4, 12, 18, [], "drywall", "studs");

// ── 2nd floor, the drywall floor: offices round a corridor ring ──
// south offices (the scaffold comes in to the middle one)
runX(
  2,
  12,
  -24,
  18.35,
  [
    [-15, -12],
    [4, 7],
    [12, 15],
  ],
  "drywall",
  "partition",
);
runZ(2, -8, 12, 18, [[14, 17]], "drywall", "partition");
runZ(2, 8, 12, 18, [[14, 17]], "drywall", "partition");
// north offices
runX(
  2,
  -10,
  -18.35,
  24,
  [
    [-6, -3],
    [9, 12],
  ],
  "drywall",
  "partition",
);
runZ(2, 0, -18, -10, [[-16, -13]], "drywall", "partition");
// stub walls in the halls either side of the core
runZ(2, -12, -6, 6, [], "drywall", "partition");
runZ(2, 12, -4, 6, [], "drywall", "partition");

// ── 3rd floor, the hostages' ──
// the Boardroom (north-west): drywall, its south side glass
runZ(3, -16, -18, -7, [[-12, -9]], "drywall", "partition");
runX(3, -7, -16, -6, [[-15, -12]], "glass", "partition");
runZ(3, -6, -18, -7, [[-17, -14]], "drywall", "partition");
add({ k: "box", x0: -12, z0: -15.5, x1: -10.5, z1: -10.5, y0: LV[3], y1: LV[3] + 0.75, m: "wood", look: "table" });
// the Corner Suite (north-east, roofless): its west and south walls
runZ(3, 8, -18, -5, [[-16, -13]], "drywall", "partition");
runX(
  3,
  -5,
  8,
  24,
  [
    [10, 13],
    [20, 23],
  ],
  "drywall",
  "partition",
);
// the Bullpen (south): desk pods and low screens
for (const [x, z] of [
  [-18, 9],
  [-12, 9],
  [-18, 14.5],
  [-6, 14.5],
  [6, 9],
  [6, 14.5],
  [14, 9],
] as P[]) {
  add({
    k: "box",
    x0: x - 1.5,
    z0: z - 0.8,
    x1: x + 1.5,
    z1: z + 0.8,
    y0: LV[3],
    y1: LV[3] + 0.75,
    m: "wood",
    look: "desk",
  });
  add({
    k: "wall",
    a: [x - 1.5, z],
    b: [x + 1.5, z],
    t: 0.1,
    y0: LV[3] + 0.75,
    y1: LV[3] + 1.3,
    m: "drywall",
    look: "screen",
  });
}
// the Spine's (north corridor) reception counter
add({ k: "box", x0: 0, z0: -12, x1: 3, z1: -11, y0: LV[3], y1: LV[3] + 1.1, m: "wood", look: "counter" });

// ── crates: the outside's and each storey's ──
const crate = (x: number, z: number, s = 1.1, n = 1, y = 0, ry = 0) =>
  add({ k: "crate", x, z, s, n, ry, ...(y ? { y } : {}) });
// the Back Alley's pallet climb (a crate, a stack of two, the bay's sill at 3.1: up to the 1st)
crate(0.5, -19.4, 1.1, 2);
crate(0.5, -20.6, 1.1, 1);
crate(-9, -22, 1.4, 2);
crate(14, -21, 1.1, 1, 0, 0.3);
// the Loading Dock
crate(-30, 6, 1.4, 2);
crate(-33, 2, 1.1);
crate(-29, 22, 1.1, 2);
crate(-36, 26, 1.4);
// the Street
crate(-14, 30, 1.1);
crate(18, 34, 1.4, 2);
crate(-4, 36, 1.1, 1, 0, 0.4);
// the Side Lane
crate(32, -6, 1.4, 2);
crate(30, 10, 1.1);
crate(36, -20, 1.1, 2);
// inside: the loading bay, the lobby, the 1st's pallets, the 2nd's, the Core Deck's
crate(-20, 14, 1.4);
crate(-17.5, 8, 1.1, 2);
crate(-17, 2, 1.1, 1, LV[1]);
crate(-4, -12, 1.4, 1, LV[1]);
crate(16, 8, 1.1, 2, LV[1]);
crate(-14, -2, 1.1, 1, LV[1]);
crate(-16, 4, 1.1, 1, LV[2]);
crate(16, -6, 1.4, 1, LV[2]);
crate(-4.2, 5.5, 1.1, 1, LV[3]);
crate(4.5, -5.5, 1.1, 1, LV[3]);

// ── outside: the site's hoarding round it all, the neighbours' blocks, a van, the site cabins ──
const S: Rect = { x0: -44, z0: -30, x1: 44, z1: 52 };
add({ k: "box", x0: S.x0, z0: S.z0, x1: S.x1, z1: S.z0 + 2, y1: 8, m: "concrete", look: "hoarding" });
add({ k: "box", x0: S.x0, z0: S.z1 - 2, x1: S.x1, z1: S.z1, y1: 8, m: "concrete", look: "hoarding" });
add({ k: "box", x0: S.x0, z0: S.z0 + 2, x1: S.x0 + 2, z1: S.z1 - 2, y1: 8, m: "concrete", look: "hoarding" });
add({ k: "box", x0: S.x1 - 2, z0: S.z0 + 2, x1: S.x1, z1: S.z1 - 2, y1: 8, m: "concrete", look: "hoarding" });
add({ k: "box", x0: 28, z0: 28, x1: 42, z1: 50, y1: 14, m: "brick", look: "neighbour" });
add({ k: "box", x0: -42, z0: 34, x1: -32, z1: 50, y1: 12, m: "brick", look: "neighbour" });
add({ k: "box", x0: 30, z0: -28, x1: 42, z1: -24, y1: 2.8, m: "sheet", look: "cabin" });
add({ k: "box", x0: -40, z0: -28, x1: -30, z1: -24, y1: 2.8, m: "sheet", look: "cabin" });
add({ k: "box", x0: 6, z0: 28, x1: 8.4, z1: 34, y1: 2.3, m: "sheet", look: "van" });
add({ k: "box", x0: -38, z0: 14, x1: -35.6, z1: 21, y1: 2.6, m: "sheet", look: "truck" });
add({ k: "box", x0: 26, z0: 14, x1: 28, z1: 18, y1: 1.4, m: "metal", look: "skip" });
add({ k: "box", x0: -22, z0: 26, x1: -16, z1: 27.5, y1: 1.2, m: "snow", look: "bank" });
add({ k: "box", x0: 14, z0: 24, x1: 20, z1: 25.5, y1: 1.2, m: "snow", look: "bank" });

// lamps (drawn only): the street's, the dock's, the alleys', a work light a storey
for (const [x, z, y] of [
  [-10, 30, 0],
  [10, 40, 0],
  [-30, 12, 0],
  [32, 0, 0],
  [0, -24, 0],
  [-20, 0, LV[1]],
  [18, -12, LV[2]],
  [0, 10, LV[3]],
  [-12, -12, LV[3]],
] as [number, number, number][])
  add({ k: "prop", kind: "lamp", x, z, ...(y ? { y } : {}) });
add({ k: "prop", kind: "crane", x: 34, z: -14, s: 1 });

const spread = (r: Rect, n: number, cols = 5, dz = 3): P[] => {
  const out: P[] = [];
  for (let k = 0; k < n; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    out.push([r.x0 + 2 + ((r.x1 - r.x0 - 4) * i) / (cols - 1), r.z0 + 1.5 + j * dz]);
  }
  return out;
};

const RAID_START = CORE;
const WARD_START: Rect = { x0: -12, z0: 42, x1: 12, z1: 49 };

export const TOWER: StrikeMap = {
  key: "tower",
  name: "Glass Tower",
  mode: "hostage",
  blurb: "An office block half built in the snow: the hostages on the top floor, the way up by stair or scaffold.",
  plays: "tight and vertical: two stairwells and a scaffold, drywall to shoot through",
  size: S,
  pieces,
  spawns: { r: spread(RAID_START, 10, 5, 5), w: spread(WARD_START, 10) },
  buy: { r: RAID_START, w: WARD_START },
  hostages: HOSTAGES,
  rescue: { x0: -36, z0: 6, x1: -28, z1: 14 },
  calls: [
    { name: "Street", r: rect(-32, 24, 28, 50) },
    { name: "Loading Dock", r: rect(-42, -2, -24, 24) },
    { name: "Back Alley", r: rect(-42, -28, 42, -18) },
    { name: "Side Lane", r: rect(24, -24, 42, 26) },
    { name: "Scaffold", r: rect(SC.x0, 18, SC.x1, SC.outer[1]) },
    { name: "Lobby", r: rect(-14, 4, 18.5, 18) },
    { name: "Loading Bay", r: rect(-24, 4, -14, 18) },
    { name: "Atrium", r: ATRIUM },
    { name: "West Stair", r: wsBox },
    { name: "East Stair", r: esBox },
    { name: "Core Deck", r: CORE },
    { name: "Boardroom", r: rect(-16, -18, -6, -7) },
    { name: "Corner Suite", r: rect(8, -18, 24, -5) },
    { name: "Spine", r: rect(-6, -18, 8, -4) },
    { name: "Bullpen", r: rect(-24, 4, 18.5, 18) },
    { name: "The Drop", r: rect(-4, -19.5, 4, -16.5) },
  ],
  ground: "snow",
  floods: 6,
};
