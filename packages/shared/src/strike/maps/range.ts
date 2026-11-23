// The Range (docs/plan/114-the-strike-park.md, S-M6): aim practice and Deathmatch in a training yard.
// Our own map:
//   - the Firing Lane (west): a roofed Firing Line of benches and booths, target stands out at 10, 20,
//     40 and 60 m, a few barricades and crates down the lane (Deathmatch's cover), the Berm behind;
//   - the Kill House (east): twelve drywall rooms in a timber shell, doorways between, open to the sky;
//   - the Muster Yard (south-east): the range hut, a container, crates.
// Everyone may buy anywhere. 2 m cells, 100 × 80 m.

import { Carver } from "../carve.ts";
import type { Mat, P, Piece, StrikeMap } from "../map.ts";

const C = new Carver({ cell: 2, x0: -50, z0: -40, nx: 50, nz: 40 }, 4, "concrete", "range-wall");

// the yard inside a 4 m ring: the Berm north, the range's walls east and west, a fence south
C.open([2, 2, 47, 37]);
C.style([0, 0, 49, 1], 6, "rock", "berm");
C.style([0, 38, 49, 39], 3.5, "wood", "fence");

const extra: Piece[] = [];

/** An axis-aligned run of wall from a to b with doorways cut out (`gaps`: along its axis). */
function run(a: P, b: P, gaps: [number, number][], y1: number, m: Mat, t = 0.3, look?: string) {
  const along = a[1] === b[1];
  const s0 = along ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]);
  const s1 = along ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const fixed = along ? a[1] : a[0];
  const seg = (u: number, v: number) =>
    extra.push({
      k: "wall",
      a: along ? [u, fixed] : [fixed, u],
      b: along ? [v, fixed] : [fixed, v],
      t,
      y1,
      m,
      ...(look ? { look } : {}),
    });
  let s = s0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > s) seg(s, g0);
    s = g1;
  }
  if (s < s1) seg(s, s1);
}
const crate = (x: number, z: number, s = 1.1, n = 1, ry = 0) => extra.push({ k: "crate", x, z, s, n, ry });
const block = (x0: number, z0: number, x1: number, z1: number, y1: number, m: Mat, look: string) =>
  extra.push({ k: "box", x0, z0, x1, z1, y1, m, look });

// ── the Firing Line: benches along z 26…27 in five booths, the dividers, a roof at 3.2 over it ──
const LINE = 27.5; // where a shooter stands's front (the distances are measured from here)
const BOOTHS = [-40, -28, -16, -4, 7];
{
  for (const x of BOOTHS) block(x - 4, 26, x + 4, 27, 1, "wood", "bench");
  for (const x of [-34, -22, -10, 1.5]) run([x, 24.5], [x, 29.5], [], 2, "plank", 0.2, "booth");
  extra.push({ k: "floor", x0: -46, z0: 25.5, x1: 12, z1: 33, y: 3.2, t: 0.25, m: "sheet", look: "firing-roof" });
}
// ── the targets: a stand per booth at each distance, staggered, and the distance boards ──
for (const [k, d] of [10, 20, 40, 60].entries()) {
  const z = LINE - d;
  BOOTHS.forEach((x, i) => {
    const dx = ((i + k) % 3) - 1;
    extra.push({ k: "prop", kind: "target", x: x + dx * 1.8, z, ry: 0 });
  });
  extra.push({ k: "prop", kind: "sign", x: -45, z, ry: Math.PI / 2, s: d });
}
// ── the lane's cover (Deathmatch): plank barricades, sandbags, crates ──
run([-38, -2], [-32, -2], [], 1.3, "plank", 0.3, "barricade");
run([-14, 4], [-8, 4], [], 1.3, "plank", 0.3, "barricade");
run([-26, -22], [-20, -22], [], 1.3, "plank", 0.3, "barricade");
run([2, -8], [2, -2], [], 1.3, "plank", 0.3, "barricade");
block(-4, -6, 0, -5, 1, "snow", "sandbags");
block(-44, 14, -41, 15, 1, "snow", "sandbags");
crate(-42, 4, 1.4, 2);
crate(-20, 12, 1.1);
crate(-19, 12.2, 1.1, 1, 0.4);
crate(6, -20, 1.4);
crate(-34, -27, 1.1);
crate(-6, -30, 1.4, 2);
crate(8, 12, 1.1, 1, 0.3);
// ── the Kill House: x 16…42, z −32…10; three columns (x 16 | 25 | 33 | 42), four rows
// (z −32 | −21 | −10 | 0 | 10); timber outside, drywall inside, every room reached ──
{
  const H = 3;
  // the shell
  run(
    [16, -32],
    [16, 10],
    [
      [-17, -15.5],
      [3, 4.5],
    ],
    H,
    "plank",
    0.3,
    "killhouse",
  );
  run(
    [42, -32],
    [42, 10],
    [
      [-27, -25.5],
      [-7, -5.5],
    ],
    H,
    "plank",
    0.3,
    "killhouse",
  );
  run([16, -32], [42, -32], [[36, 37.5]], H, "plank", 0.3, "killhouse");
  run(
    [16, 10],
    [42, 10],
    [
      [19, 20.5],
      [28, 29.5],
    ],
    H,
    "plank",
    0.3,
    "killhouse",
  );
  // the rooms
  run(
    [25, -32],
    [25, 10],
    [
      [-27, -25.5],
      [-16, -14.5],
      [6, 7.5],
    ],
    H,
    "drywall",
    0.15,
    "drywall",
  );
  run(
    [33, -32],
    [33, 10],
    [
      [-24, -22.5],
      [-6, -4.5],
      [2, 3.5],
    ],
    H,
    "drywall",
    0.15,
    "drywall",
  );
  run(
    [16, -21],
    [42, -21],
    [
      [19, 20.5],
      [29, 30.5],
      [37, 38.5],
    ],
    H,
    "drywall",
    0.15,
    "drywall",
  );
  run(
    [16, -10],
    [42, -10],
    [
      [27, 28.5],
      [38, 39.5],
    ],
    H,
    "drywall",
    0.15,
    "drywall",
  );
  run(
    [16, 0],
    [42, 0],
    [
      [21, 22.5],
      [35, 36.5],
    ],
    H,
    "drywall",
    0.15,
    "drywall",
  );
  // what's in them: tables, a cot, crates
  block(18, -30.5, 21, -29.5, 0.8, "wood", "table");
  block(29, -17, 31, -14, 0.8, "wood", "table");
  block(38.5, -2, 41, -1, 0.6, "wood", "cot");
  block(19, -6, 20, -3, 0.8, "wood", "table");
  crate(23.5, 8.5, 1.1);
  crate(31.5, -30.5, 1.1, 1, 0.3);
  crate(40.5, -19.5, 1.4);
  crate(27, -1.5, 1.1);
}
// ── the Muster Yard: the range hut, a container, crates ──
block(26, 22, 34, 31, 3.2, "plank", "range-hut");
block(37, 18, 43, 20.6, 2.6, "sheet", "container");
crate(20, 16, 1.4);
crate(14, 30, 1.1, 1, 0.5);
crate(40, 30, 1.1);
// lamps (drawn only)
for (const [x, z] of [
  [-40, 30],
  [-16, 30],
  [7, 30],
  [-30, 6],
  [-6, -16],
  [29, -15],
  [29, 5],
  [37, -26],
  [22, 20],
  [38, 26],
] as P[])
  extra.push({ k: "prop", kind: "lamp", x, z });

const R = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });
const ALL = R(-46, -36, 46, 36);

export const RANGE: StrikeMap = {
  key: "range",
  name: "The Range",
  mode: "range",
  blurb: "A training yard: a firing lane with targets out to 60 m, a kill house of drywall rooms.",
  plays: "warm-up: aim on the lane, Deathmatch through the rooms",
  size: { x0: -50, z0: -40, x1: 50, z1: 40 },
  pieces: [...C.pieces(), ...extra],
  spawns: {
    r: [
      [-40, 31],
      [-28, 31],
      [-16, 31],
      [-4, 31],
      [7, 31],
      [-40, 0],
      [-20, -30],
      [-2, 10],
    ],
    w: [
      [20.5, -26],
      [29, -26],
      [37.5, -15],
      [20.5, -5],
      [29, 5],
      [37.5, 5],
      [22, 22],
      [40, 33],
    ],
  },
  buy: { r: ALL, w: ALL },
  calls: [
    { name: "Firing Line", r: R(-46, 24, 12, 36) },
    { name: "Ten", r: R(-46, 13, 12, 22) },
    { name: "Twenty", r: R(-46, 3, 12, 13) },
    { name: "Forty", r: R(-46, -20, 12, 3) },
    { name: "Sixty", r: R(-46, -36, 12, -20) },
    { name: "Berm", r: R(-46, -36, 46, -33) },
    { name: "Kill House", r: R(16, -32, 42, 10) },
    { name: "Breach", r: R(16, -32, 25, -21) },
    { name: "Middle Room", r: R(25, -32, 33, -21) },
    { name: "Long Room", r: R(33, -32, 42, -21) },
    { name: "Hall", r: R(25, -21, 33, -10) },
    { name: "Office", r: R(33, -10, 42, 0) },
    { name: "Bunks", r: R(33, 0, 42, 10) },
    { name: "Foyer", r: R(16, 0, 25, 10) },
    { name: "Muster Yard", r: R(12, 10, 46, 36) },
    { name: "Range Hut", r: R(26, 22, 34, 31) },
    { name: "East Alley", r: R(42, -36, 46, 10) },
  ],
  ground: "snow",
  floods: 6,
};
