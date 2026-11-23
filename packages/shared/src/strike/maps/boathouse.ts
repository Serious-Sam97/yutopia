// Boathouse (docs/plan/114-the-strike-park.md, S-M6): Wingman (2 v 2, one site) on a frozen lake's
// shore. Our own map:
//   - A, the Boathouse (north-east): a timber hall half over the ice, boats on trestles and canoe racks
//     for cover; in by the Boat Door off the Jetty, the Lake Door off the ice, the Yard Door off the yard
//     and the Wardens' own door east; the Lake Window looks in from the ice;
//   - the Raiders' two ways from the Roadhead (south-west): north up the Shore Path and east across the
//     Ice (the shanty, the frozen dinghy, the shore rocks), or east down the Back Road, through the Shed
//     and over the Yard past the woodpile;
//   - the Slipway between the Cottage and the Boat Shop joins the two.
// The Wardens start at the Landing, east of the hall. 2 m cells, 80 × 80 m.

import { Carver } from "../carve.ts";
import type { Mat, P, Piece, StrikeMap } from "../map.ts";

const C = new Carver({ cell: 2, x0: -40, z0: -40, nx: 40, nz: 40 }, 6, "rock", "shore-rocks");

// the playable ground inside a 4 m ring
C.open([2, 2, 37, 37]);
// the ring: the lake's far ridge north, shore rocks east and west, the road's fence south
C.style([0, 0, 39, 1], 5, "rock", "ice-ridge");
C.style([0, 38, 39, 39], 3.5, "wood", "fence");
// the Cottage (x −26…−6, z −10…22) and the Boat Shop (x −6…8, z −2…22): the land's middle, the Slipway
// left open north of the shop
C.fill([7, 15, 16, 30], 6.5, "wood", "cottage");
C.fill([17, 19, 23, 30], 7, "plank", "boat-shop");

const extra: Piece[] = [];

/** An axis-aligned run of wall from a to b with doorways cut out of it (`gaps`: along its axis), a
 *  lintel over each when `lintel` is given (its foot). */
function run(a: P, b: P, gaps: [number, number][], y1: number, m: Mat, t = 0.3, look?: string, lintel?: number) {
  const along = a[1] === b[1];
  const s0 = along ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]);
  const s1 = along ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const fixed = along ? a[1] : a[0];
  const seg = (u: number, v: number, y0?: number) =>
    extra.push({
      k: "wall",
      a: along ? [u, fixed] : [fixed, u],
      b: along ? [v, fixed] : [fixed, v],
      t,
      y1,
      m,
      ...(y0 !== undefined ? { y0 } : {}),
      ...(look ? { look } : {}),
    });
  let s = s0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > s) seg(s, g0);
    if (lintel !== undefined) seg(g0, g1, lintel);
    s = g1;
  }
  if (s < s1) seg(s, s1);
}
const crate = (x: number, z: number, s = 1.1, n = 1, ry = 0, y?: number) =>
  extra.push({ k: "crate", x, z, s, n, ry, ...(y !== undefined ? { y } : {}) });
const block = (x0: number, z0: number, x1: number, z1: number, y1: number, m: Mat, look: string, y0?: number) =>
  extra.push({ k: "box", x0, z0, x1, z1, y1, m, look, ...(y0 !== undefined ? { y0 } : {}) });

// ── A, the Boathouse: x 8…26, z −24…−6, walls 4.5, a roof at 5.2 ──
{
  run([8, -24], [26, -24], [[15, 20]], 4.5, "wood", 0.3, "boathouse", 3.6); // the Boat Door
  run([8, -6], [26, -6], [[11, 13.5]], 4.5, "wood", 0.3, "boathouse", 2.4); // the Yard Door
  run(
    [8, -24],
    [8, -6],
    [
      [-17, -15],
      [-11, -8],
    ],
    4.5,
    "wood",
    0.3,
    "boathouse",
    2.4,
  ); // the Lake Door
  // the Lake Window (its panes long gone, a sill at 1 m: seen and shot through, not climbed): the hall's south corner
  // watched from the ice — the anchor in there saw every entry first and won three rounds in four (plan 117)
  extra.push({ k: "wall", a: [8, -11], b: [8, -8], t: 0.3, y1: 1, m: "wood", look: "boathouse" });
  // (its head at 2.1: 1.1 m open, under a crouched person's 1.25 — nobody squeezes through)
  extra.push({ k: "wall", a: [8, -11], b: [8, -8], t: 0.3, y0: 2.1, y1: 2.4, m: "wood", look: "boathouse" });
  run([26, -24], [26, -6], [[-16, -14]], 4.5, "wood", 0.3, "boathouse", 2.4); // the Wardens' door
  extra.push({ k: "floor", x0: 8, z0: -24, x1: 26, z1: -6, y: 5.2, t: 0.3, m: "plank", look: "roof" });
  // two boats up on trestles (shots and feet pass under their hulls)
  for (const [x0, z0] of [
    [10, -21],
    [18, -11],
  ] as P[]) {
    block(x0, z0, x0 + 6, z0 + 1.6, 1.6, "wood", "boat", 0.7);
    block(x0 + 0.6, z0, x0 + 1, z0 + 1.6, 0.7, "wood", "trestle");
    block(x0 + 5, z0, x0 + 5.4, z0 + 1.6, 0.7, "wood", "trestle");
  }
  // the canoe racks: one along the east wall, one standing in the middle
  block(24.6, -23.5, 25.7, -17.5, 2.4, "plank", "canoe-rack");
  block(19.5, -19, 21.5, -16, 2, "plank", "canoe-rack");
  crate(11.5, -14, 1.4, 2);
  crate(22.8, -13, 1.1, 1, 0.3);
  crate(10, -8, 1.1);
  crate(23.6, -7.6, 1.4);
}
// ── the Jetty: planks at 0.45 out onto the ice from the Boat Door, a frozen-in boat by it ──
extra.push({ k: "floor", x0: 15.5, z0: -34, x1: 19.5, z1: -24, y: 0.45, t: 0.3, m: "plank", look: "jetty" });
crate(17.5, -31, 1.1, 1, 0.2, 0.45);
block(21.5, -33, 24, -27, 1.2, "wood", "boat-iced");
// ── the Ice: the shanty, a frozen dinghy, the shore's rocks ──
extra.push({ k: "prop", kind: "ice", x: 0, z: -25, s: 72 });
block(-16, -30, -12, -26, 2.6, "plank", "ice-shanty");
block(-2, -24, 1, -20.5, 1.1, "wood", "boat-iced");
block(4, -31, 7, -28.5, 1.5, "rock", "shore-rock");
block(-21, -15, -17.5, -12.5, 1.4, "rock", "shore-rock");
block(-9, -16.5, -6, -13.5, 1.2, "rock", "shore-rock");
block(2, -14, 4.5, -12, 1.6, "rock", "shore-rock");
block(-34, -20, -31, -17, 1.8, "rock", "shore-rock");
// ── the Shed: x 12…20, z 8…16, walls 3, a dogleg through it (in south, out north); the yard's fence
// runs from the Boat Shop to the shed and on to the east rocks ──
{
  run([12, 16], [20, 16], [[13, 15]], 3, "plank", 0.25, "shed");
  run([12, 8], [20, 8], [[17, 19]], 3, "plank", 0.25, "shed");
  run([12, 8], [12, 16], [], 3, "plank", 0.25, "shed");
  run([20, 8], [20, 16], [], 3, "plank", 0.25, "shed");
  extra.push({ k: "floor", x0: 12, z0: 8, x1: 20, z1: 16, y: 3.3, t: 0.25, m: "sheet", look: "shed-roof" });
  block(15.5, 12, 19.6, 13.2, 1, "wood", "bench");
  run([8, 12], [12, 12], [], 2.6, "wood", 0.3, "fence");
  run([20, 12], [36, 12], [], 2.6, "wood", 0.3, "fence");
}
// ── the Yard (north of the fence): the woodpile, the chopping block ──
block(22, -2, 24, 6, 1.9, "wood", "woodpile");
crate(19.5, 2, 1.1, 1, 0.4);
crate(12, 2, 1.4);
crate(31, 6, 1.1);
crate(1, -6, 1.1, 1, 0.2); // the Slipway's
// ── the Woodyard and the Back Road (south of the fence) ──
block(24, 17, 32, 19, 1.7, "wood", "woodpile");
crate(16, 20, 1.1);
crate(6, 26, 1.1, 1, 0.3);
crate(0, 31, 1.4, 2);
// ── the Shore Path and the Roadhead ──
crate(-31, 10, 1.4);
crate(-29, -2, 1.1);
block(-14, 28, -10, 34, 2.4, "metal", "truck");
// lamps (drawn only)
for (const [x, z] of [
  [17, -15],
  [17.5, -33],
  [16, 0],
  [20, 24],
  [-24, 30],
  [-31, 0],
  [-10, -12],
  [32, -8],
  [16, 12],
] as P[])
  extra.push({ k: "prop", kind: "lamp", x, z });

const R = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });

export const BOATHOUSE: StrikeMap = {
  key: "boathouse",
  name: "Boathouse",
  mode: "wingman",
  blurb: "A boathouse on a frozen lake's shore: one site among the boats, a jetty out onto the ice.",
  plays: "2 v 2, one site; the ice or the shed",
  size: { x0: -40, z0: -40, x1: 40, z1: 40 },
  pieces: [...C.pieces(), ...extra],
  spawns: {
    r: [
      [-32, 32],
      [-29, 32],
      [-26, 33],
      [-32, 28.5],
      [-29, 28.5],
    ],
    w: [
      [32, -20],
      [32, -16],
      [32, -12],
      [34.5, -18],
      [34.5, -14],
    ],
  },
  buy: { r: R(-36, 22, -20, 36), w: R(28, -24, 36, -2) },
  sites: { A: R(8.5, -23.5, 25.5, -6.5) },
  calls: [
    { name: "Roadhead", r: R(-36, 22, -16, 36) },
    { name: "Landing", r: R(27, -24, 36, -2) },
    { name: "Boathouse", r: R(8, -24, 26, -6) },
    { name: "Boat Door", r: R(15, -26, 20, -23) },
    { name: "Lake Door", r: R(5, -17, 9, -15) },
    { name: "Yard Door", r: R(10, -7, 14, -3) },
    { name: "Jetty", r: R(15.5, -34, 19.5, -26) },
    { name: "Ice", r: R(-26, -36, 15, -16) },
    { name: "Shanty", r: R(-18, -32, -10, -24) },
    { name: "Shore Path", r: R(-36, -16, -26, 22) },
    { name: "Slipway", r: R(-6, -10, 8, -2) },
    { name: "Yard", r: R(8, -6, 36, 12) },
    { name: "Woodpile", r: R(21, -3, 25, 7) },
    { name: "Shed", r: R(12, 8, 20, 16) },
    { name: "Woodyard", r: R(8, 12, 36, 22) },
    { name: "Back Road", r: R(-16, 22, 36, 36) },
  ],
  ground: "snow",
  floods: 4,
};
