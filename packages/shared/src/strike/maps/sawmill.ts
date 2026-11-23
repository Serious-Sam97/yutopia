// Sawmill (docs/plan/114-the-strike-park.md, S-M6): bomb defusal in a snowed-in mill town. Our own map,
// on the classic three lanes:
//   - A, the Log Yard (north-east): stacked logs and a loading dock; in by the Yard Road (east lane,
//     through the Yard Gate) or the Catwalk off the middle;
//   - B, the Grain Store (north-west): a roofed hall on pillars; in by the Kiln Tunnel (west lane,
//     through the Kiln Mouth) or the Gap off the middle;
//   - the middle: the frozen river under the covered bridge, up to the Mill Door and the Wardens' side.
// The Wardens start north between the sites, the Raiders south. 5 m cells, 180 × 180 m.

import { Carver } from "../carve.ts";
import type { P, Piece, StrikeMap } from "../map.ts";

const C = new Carver({ cell: 5, x0: -90, z0: -90, nx: 36, nz: 36 }, 7.5, "brick", "mill-house");

C.open(
  [14, 2, 21, 5], // Warden spawn
  [3, 3, 32, 4], // Back Lane
  [3, 5, 11, 11], // B: the Grain Store
  [24, 5, 32, 11], // A: the Log Yard
  [17, 5, 18, 12], // Mill Door (the Wardens' middle)
  [16, 13, 19, 28], // the middle, to the bridge
  [12, 14, 23, 16], // the river
  [19, 12, 24, 12], // Catwalk → A
  [11, 12, 16, 12], // the Gap → B
  [13, 29, 22, 33], // Raider spawn
  [23, 29, 31, 31], // out east
  [29, 13, 31, 28], // Yard Road
  [30, 12, 30, 12], // Yard Gate
  [4, 29, 12, 31], // out west
  [4, 13, 6, 28], // Kiln Tunnel
  [5, 12, 5, 12], // Kiln Mouth
);
// the back lane broken up (no sightline from site to site along it)
C.fill([11, 3, 12, 3], 6, "wood", "shed");
C.fill([23, 4, 24, 4], 6, "wood", "shed");
// the Mill Door's narrowing
C.fill([18, 9, 18, 9], 7.5, "wood", "mill");
// the outer ring: a rock cut and the mill's high walls
C.style([0, 0, 35, 1], 14, "rock", "cliff");
C.style([0, 34, 35, 35], 14, "rock", "cliff");
C.style([0, 0, 1, 35], 14, "rock", "cliff");
C.style([34, 0, 35, 35], 14, "rock", "cliff");
// the mill itself: the big timber hall west of the middle, its tall stack east
C.style([7, 13, 11, 27], 10, "wood", "mill");
C.style([20, 17, 28, 28], 9, "brick", "kiln");
C.style([12, 5, 16, 11], 8, "plank", "barn");
C.style([19, 5, 23, 11], 8, "plank", "barn");

const at = (c: number, r: number): P => C.at(c, r);
const extra: Piece[] = [];
const crate = (c: number, r: number, s = 1.1, n = 1, ry = 0) => {
  const [x, z] = at(c, r);
  extra.push({ k: "crate", x, z, s, n, ry });
};

// ── A, the Log Yard: the loading dock along its east wall (jumped at 1.1, a ramp at its south end),
// log stacks for cover, crates ──
{
  const r = C.rect([31, 5, 32, 9]);
  extra.push({ k: "box", x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y1: 1.1, m: "wood", look: "dock" });
  extra.push({ k: "ramp", x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1 + 4, y0: 0, y1: 1.1, up: "n", m: "wood" });
  const [lx, lz] = at(27, 7);
  extra.push({ k: "box", x0: lx - 4, z0: lz - 1.2, x1: lx + 2, z1: lz + 1.2, y1: 2.2, m: "wood", look: "logs" });
  const [mx, mz] = at(26, 10);
  extra.push({ k: "box", x0: mx - 1.2, z0: mz - 3, x1: mx + 1.2, z1: mz + 2, y1: 1.6, m: "wood", look: "logs" });
  crate(29.2, 9.6, 1.4, 2);
  crate(28.4, 9.6, 1.1);
  crate(24.6, 5.6, 1.1, 1, 0.3);
  crate(25.4, 5.6, 1.4, 2);
}
// ── B, the Grain Store: a hall roofed at 6.5 on two rows of pillars, sacks and bins ──
{
  const r = C.rect([3, 5, 11, 11]);
  extra.push({ k: "floor", x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 - 10, y: 6.5, t: 0.4, m: "plank", look: "roof" });
  for (const c of [5, 8])
    for (const rr of [6, 8]) {
      const [x, z] = at(c, rr);
      extra.push({ k: "box", x0: x - 0.4, z0: z - 0.4, x1: x + 0.4, z1: z + 0.4, y1: 6.2, m: "wood", look: "pillar" });
    }
  const [bx, bz] = at(6.5, 7);
  extra.push({ k: "box", x0: bx - 2, z0: bz - 1, x1: bx + 2, z1: bz + 1, y1: 1.3, m: "wood", look: "sacks" });
  crate(10.4, 10.4, 1.4, 2);
  crate(3.6, 10.4, 1.1, 2);
  crate(9.5, 5.6, 1.1);
  crate(4.0, 7.5, 1.4);
}
// ── the middle: the covered bridge over the river (its roof at 4), the banks' low walls with gaps,
// crates where the middle meets the river ──
{
  const r = C.rect([16, 14, 19, 16]);
  extra.push({ k: "floor", x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y: 4.2, t: 0.3, m: "plank", look: "bridge-roof" });
  for (const x of [r.x0 + 0.2, r.x1 - 0.2]) {
    extra.push({ k: "wall", a: [x, r.z0], b: [x, r.z0 + 4], y1: 1.1, t: 0.25, m: "plank", look: "rail" });
    extra.push({ k: "wall", a: [x, r.z1 - 4], b: [x, r.z1], y1: 1.1, t: 0.25, m: "plank", look: "rail" });
  }
  const bank = C.rect([12, 14, 23, 16]);
  extra.push({ k: "prop", kind: "ice", x: (bank.x0 + bank.x1) / 2, z: (bank.z0 + bank.z1) / 2, s: bank.x1 - bank.x0 });
  crate(16.4, 18, 1.1, 1, 0.2);
  crate(19.5, 22, 1.4, 2);
  crate(16.5, 26.5, 1.1);
}
// ── the lanes' cover ──
crate(30.3, 20, 1.4, 2);
crate(31.2, 15, 1.1);
crate(29.4, 25, 1.1, 2);
crate(5.5, 20, 1.4, 2);
crate(4.4, 15, 1.1);
crate(6.2, 25.5, 1.1);
crate(26, 30, 1.1, 1, 0.5);
crate(9, 30.5, 1.4);
crate(17, 3.5, 1.1);
crate(28, 3.6, 1.4, 2);
crate(7, 3.4, 1.1, 2);
// lamps (drawn only): the yard's, the lanes', the bridge's
for (const [c, r] of [
  [28, 6],
  [6, 6],
  [18, 20],
  [30, 18],
  [5, 18],
  [17, 30],
  [18, 3],
] as P[]) {
  const [x, z] = at(c, r);
  extra.push({ k: "prop", kind: "lamp", x, z });
}

const spread = (c0: number, r0: number, c1: number, r1: number, n: number): P[] => {
  const a = C.rect([c0, r0, c1, r1]);
  const out: P[] = [];
  const cols = 5;
  for (let k = 0; k < n; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    out.push([a.x0 + 3 + ((a.x1 - a.x0 - 6) * i) / (cols - 1), a.z0 + 3 + j * 3]);
  }
  return out;
};

export const SAWMILL: StrikeMap = {
  key: "sawmill",
  name: "Sawmill",
  mode: "bomb",
  blurb: "A snowed-in mill town: the Log Yard and the Grain Store, a frozen river between.",
  plays: "the classic three lanes, a long middle",
  size: { x0: -90, z0: -90, x1: 90, z1: 90 },
  pieces: [...C.pieces(), ...extra],
  spawns: { r: spread(14, 30, 21, 32, 10), w: spread(15, 2, 20, 3, 10) },
  buy: { r: C.rect([13, 29, 22, 33]), w: C.rect([14, 2, 21, 5]) },
  sites: { A: C.rect([25, 6, 31, 10]), B: C.rect([4, 6, 10, 10]) },
  calls: [
    { name: "Raider Spawn", r: C.rect([13, 29, 22, 33]) },
    { name: "Warden Spawn", r: C.rect([14, 2, 21, 5]) },
    { name: "Log Yard", r: C.rect([24, 5, 32, 11]) },
    { name: "Grain Store", r: C.rect([3, 5, 11, 11]) },
    { name: "Back Lane", r: C.rect([3, 3, 32, 4]) },
    { name: "Mill Door", r: C.rect([17, 5, 18, 12]) },
    { name: "Catwalk", r: C.rect([19, 12, 24, 12]) },
    { name: "The Gap", r: C.rect([11, 12, 16, 12]) },
    { name: "Bridge", r: C.rect([16, 14, 19, 16]) },
    { name: "River", r: C.rect([12, 14, 23, 16]) },
    { name: "Middle", r: C.rect([16, 17, 19, 28]) },
    { name: "Yard Road", r: C.rect([29, 13, 31, 28]) },
    { name: "Yard Gate", r: C.rect([30, 12, 30, 12]) },
    { name: "Kiln Tunnel", r: C.rect([4, 13, 6, 28]) },
    { name: "Kiln Mouth", r: C.rect([5, 12, 5, 12]) },
    { name: "East Street", r: C.rect([23, 29, 31, 31]) },
    { name: "West Street", r: C.rect([4, 29, 12, 31]) },
  ],
  ground: "snow",
  floods: 8,
};
