// Freight (docs/plan/114-the-strike-park.md, S-M6): bomb defusal in a snowed-in rail freight yard. Our own
// map, the long-sightline one: rows of stacked shipping containers, and a freight train standing north to
// south down the middle that every lane has to cross.
//   - the Raiders start in the west (the Raider Yard), the Wardens in the east (the Yard Office);
//   - A, the Depot (north-east): a brick goods shed with its loading platform; in by the North Road (over
//     the train at the Buffer Stop, through the Depot Gate) or the Depot Alley off the Switchyard;
//   - B, the Gantry (south-east): a tall steel crane frame over the site, its deck at 6 m up a stair; in by
//     Coal Lane (up over the Flatbed, through the Crane Gate) or the Crane Alley off the Switchyard;
//   - the middle: Reefer Row to the train, through the Coupling (the one gap between wagons) into the
//     Switchyard, the Wardens' hub between the sites, watched from the Signal Box on the containers above it (a
//     stair up from the Wardens' Yard Office).
// Beside the train the West and East Sidings run its whole length (relay huts break their lines). 5 m
// cells, 180 × 180 m.

import { Carver } from "../carve.ts";
import type { P, Piece, StrikeMap } from "../map.ts";

const C = new Carver({ cell: 5, x0: -90, z0: -90, nx: 36, nz: 36 }, 5.2, "sheet", "containers");

C.open(
  [2, 15, 5, 20], // Raider Yard (spawn)
  [2, 5, 3, 14], // Signal Path (north out of the yard)
  [2, 3, 15, 4], // North Road
  [6, 16, 6, 17], // the Reefer Row's mouth
  [7, 16, 15, 18], // Reefer Row (the middle, west of the train)
  [4, 21, 5, 28], // Ash Path (south out of the yard)
  [4, 29, 15, 30], // Coal Lane
  [16, 3, 18, 31], // the tracks: the train and its two sidings
  [19, 4, 19, 4], // Depot Gate
  [20, 3, 27, 9], // A: the Depot
  [23, 10, 23, 13], // Depot Alley
  [19, 16, 19, 17], // the Coupling's east mouth
  [20, 14, 24, 19], // Switchyard
  [20, 20, 20, 24], // Crane Alley
  [20, 25, 27, 31], // B: the Gantry
  [19, 30, 19, 30], // Crane Gate
  [25, 15, 27, 16], // Office Run (Wardens → Switchyard)
  [28, 14, 31, 20], // Yard Office (Warden spawn)
  [28, 8, 29, 13], // Office Steps (Wardens → A)
  [30, 21, 31, 24], // Weigh Lane (Wardens → B)
  [28, 25, 31, 26],
);
// the outer ring: the yard's high concrete wall
C.style([0, 0, 35, 1], 9, "concrete", "yard-wall");
C.style([0, 34, 35, 35], 9, "concrete", "yard-wall");
C.style([0, 0, 1, 35], 9, "concrete", "yard-wall");
C.style([34, 0, 35, 35], 9, "concrete", "yard-wall");
// the Wardens' side: the yard office and the weigh house in brick
C.style([24, 10, 27, 13], 7, "brick", "office");
C.style([24, 20, 27, 24], 6.5, "brick", "weigh-house");
C.style([30, 21, 33, 33], 7, "brick", "warehouse");
C.style([30, 2, 33, 13], 7, "brick", "warehouse");

const at = (c: number, r: number): P => C.at(c, r);
const extra: Piece[] = [];
const crate = (x: number, z: number, s = 1.1, n = 1, ry = 0) => {
  extra.push({ k: "crate", x, z, s, n, ry });
};
/** a single shipping container (2.6 high) lying in a lane: cover you can't climb */
const can = (x0: number, z0: number, x1: number, z1: number, look = "container") => {
  extra.push({ k: "box", x0, z0, x1, z1, y1: 2.6, m: "sheet", look });
};

// ── the train: standing on the track down the middle (x −4…−1), wagons coupled tight (0.3 m: no way
// through), two flatcars you jump onto (1.1), the one open gap at the Coupling, the buffer stop north ──
{
  const X0 = -4;
  const X1 = -1;
  const car = (z0: number, z1: number, y1: number, look: string, m: "metal" | "concrete" = "metal") =>
    extra.push({ k: "box", x0: X0, z0, x1: X1, z1, y1, m, look });
  car(-75, -73, 1.3, "buffer-stop", "concrete");
  // (z −73…−69: the Buffer Stop crossing, 4 m)
  car(-69, -55, 3.8, "wagon");
  car(-54.7, -40.7, 3.8, "wagon");
  car(-40.4, -26.4, 1.1, "flatcar");
  car(-26.1, -12.1, 3.8, "wagon");
  car(-11.8, -4, 3.8, "brake-van");
  // (z −4…−1: the Coupling, 3 m)
  car(-1, 13, 3.6, "tanker");
  car(13.3, 27.3, 3.8, "wagon");
  car(27.6, 41.6, 3.8, "wagon");
  car(41.9, 55.9, 3.8, "wagon");
  car(56.2, 70, 1.1, "flatcar"); // the Flatbed: Coal Lane's way over
  // the sidings' relay huts (the long lines beside the train broken, a 3 m way past each)
  const hut = (x0: number, z0: number, x1: number, z1: number) =>
    extra.push({ k: "box", x0, z0, x1, z1, y1: 2.8, m: "concrete", look: "relay-hut" });
  hut(-10, -52, -7, -48);
  hut(-7, 22, -4, 26);
  hut(-10, 44, -7, 47);
  hut(-10, 8, -7, 11);
  hut(2, -48, 5, -44);
  hut(-1, 30, 2, 34);
  hut(2, -24, 5, -20);
  hut(-7, -15, -4, -12);
  hut(-1, -36, 2, -33);
  hut(2, 38, 5, 41);
  crate(-8, -30, 1.1);
  crate(-6.2, 8, 1.4);
  crate(0.8, -60, 1.1, 1, 0.3);
  crate(3.4, 16, 1.4);
  crate(-8.4, 62, 1.1, 1, 0.2);
  crate(3.2, 52, 1.1);
}

// ── A, the Depot: the goods shed (brick, floor at the platform's 1.1, two doors onto it, roofed at 6.3),
// the loading platform along its front with ramps at both ends, the yard before it ──
{
  const S = { x0: 16, z0: -74, x1: 44, z1: -62 };
  extra.push({ k: "box", ...S, y1: 1.1, m: "concrete", look: "shed-floor" });
  const w = (a: P, b: P, y0 = 0) => extra.push({ k: "wall", a, b, y0, y1: 6, t: 0.4, m: "brick", look: "depot" });
  w([S.x0, S.z0], [S.x1, S.z0]);
  w([S.x0, S.z0], [S.x0, S.z1]);
  w([S.x1, S.z0], [S.x1, S.z1]);
  w([S.x0, S.z1], [24, S.z1]);
  w([28, S.z1], [36, S.z1]);
  w([40, S.z1], [S.x1, S.z1]);
  w([24, S.z1], [28, S.z1], 3.1);
  w([36, S.z1], [40, S.z1], 3.1);
  extra.push({ k: "floor", ...S, y: 6.3, t: 0.3, m: "sheet", look: "shed-roof" });
  // inside: parcels and a goods cage
  extra.push({ k: "crate", x: 19, z: -71, s: 1.4, n: 1, y: 1.1 });
  extra.push({ k: "crate", x: 33, z: -71.5, s: 1.4, n: 1, y: 1.1 });
  extra.push({ k: "crate", x: 22, z: -65, s: 1.1, n: 1, y: 1.1, ry: 0.4 });
  extra.push({ k: "box", x0: 29, z0: -73.5, x1: 35, z1: -72.5, y0: 1.1, y1: 3.1, m: "metal", look: "cage" });
  // the platform and its ramps
  extra.push({ k: "box", x0: 14, z0: -62, x1: 46, z1: -57, y1: 1.1, m: "concrete", look: "platform" });
  extra.push({ k: "ramp", x0: 10, z0: -62, x1: 14, z1: -57, y0: 0, y1: 1.1, up: "e", m: "concrete" });
  extra.push({ k: "ramp", x0: 46, z0: -62, x1: 50, z1: -57, y0: 0, y1: 1.1, up: "w", m: "concrete" });
  extra.push({ k: "crate", x: 20, z: -59, s: 1.1, n: 1, y: 1.1 });
  extra.push({ k: "crate", x: 38, z: -58.6, s: 1.4, n: 1, y: 1.1 });
  // the yard before the platform: a container lying across, crates
  can(24, -51, 30.5, -48.5);
  crate(40, -50, 1.4, 2);
  crate(14, -47, 1.1, 1, 0.3);
  crate(34, -43, 1.4);
  crate(46, -44, 1.1);
}

// ── B, the Gantry: four legs, the deck at 6 m across the site (its stair up the east side), a crane
// cab on the deck, containers waiting to be lifted ──
{
  const leg = (x: number, z: number) =>
    extra.push({ k: "box", x0: x - 0.6, z0: z - 0.6, x1: x + 0.6, z1: z + 0.6, y1: 6, m: "metal", look: "gantry-leg" });
  leg(20, 49);
  leg(20, 55);
  leg(43, 49);
  leg(43, 55);
  extra.push({ k: "floor", x0: 19.4, z0: 48.4, x1: 46.5, z1: 55.6, y: 6.4, t: 0.4, m: "metal", look: "gantry-deck" });
  extra.push({ k: "stairs", x0: 44.5, z0: 55.6, x1: 46.5, z1: 66, y0: 0, y1: 6.4, up: "n", m: "metal" });
  extra.push({ k: "box", x0: 30, z0: 48.6, x1: 33, z1: 51, y0: 6.4, y1: 8.6, m: "sheet", look: "crane-cab" });
  for (const [x, z] of [
    [19.4, 52],
    [46.3, 50],
  ] as P[])
    extra.push({ k: "wall", a: [x, 48.6], b: [x, 55.4], y0: 6.4, y1: 7.6, t: 0.12, m: "metal", look: "rail" });
  extra.push({ k: "wall", a: [19.6, 48.5], b: [46.3, 48.5], y0: 6.4, y1: 7.6, t: 0.12, m: "metal", look: "rail" });
  // the site's cover: containers set down under the crane, crates
  can(24, 57.5, 30, 60);
  can(16, 59, 22, 61.5, "gate-box");
  can(34, 42, 36.5, 48);
  crate(16, 44, 1.4, 2);
  crate(39, 60, 1.1);
  crate(27, 46, 1.1, 1, 0.4);
  crate(14, 64.5, 1.4, 2);
  can(30, 63, 36, 65.6);
  crate(48, 40, 1.1);
}

// ── the lanes' cover ──
// North Road
can(-50, -75, -44, -71.5);
can(-30, -71.6, -24, -66);
crate(-64, -67, 1.4, 2);
crate(-38, -70, 1.1);
crate(-14, -72, 1.1, 1, 0.3);
// Signal Path, Ash Path
crate(-72, -40, 1.4, 2);
crate(-78.5, -36, 1.1);
crate(-68, 30, 1.4, 2);
crate(-63, 45, 1.1);
can(-65, 33, -60, 38);
can(-70, 21, -66, 26);
// Reefer Row: two reefers lying staggered, crates
can(-46, -9.5, -40, -7);
can(-36, -6, -33.5, 1);
can(-27, 0, -21, 5);
crate(-54, 2, 1.1);
crate(-15, 1.5, 1.1, 1, 0.2);
// Coal Lane: coal bins and a container
can(-50, 59.6, -44, 65);
can(-34, 55, -28, 60.4);
extra.push({ k: "box", x0: -22, z0: 61, x1: -18, z1: 65, y1: 1.6, m: "wood", look: "coal-bin" });
crate(-62, 58, 1.4, 2);
crate(-16, 62, 1.1);
// Switchyard: the points' lever frame, a container end-on, crates
// (a stack of containers standing in its middle: no line from the Coupling to the office, nor A to B)
extra.push({ k: "box", x0: 10, z0: -5, x1: 18, z1: 3, y1: 5.2, m: "sheet", look: "containers" });
can(26, -15, 28.5, -9);
crate(30, 4, 1.4, 2);
crate(18, 6, 1.1);
crate(21, -17, 1.1, 1, 0.4);
// the Wardens' side
crate(56, -30, 1.1);
crate(54, 30, 1.4);
can(53, 40, 55.5, 45);
crate(41, -8, 1.4, 2);
can(-72, -3, -68, 3);
can(52, 2, 68, 4.5, "containers-low");
can(-80, -50, -77, -44);
can(-77, -30, -72.5, -24);
// the Signal Box: a stair from the Yard Office up onto the containers' tops (5.2), a walk along them to a parapet
// over the Switchyard — the Wardens' eye on the Coupling and Depot Alley, a way up only from their side (no way
// down but the stair: 5.2 m is past a drop). Plan 117's balance pass: the Wardens lost three before every plant
// at A, the Switchyard taking whoever stood in it; from up here the Switchyard's watched without standing in it.
extra.push({ k: "stairs", x0: 50, z0: -20, x1: 58, z1: -18, y0: 0, y1: 5.2, up: "w", m: "metal" });
extra.push({ k: "wall", a: [37, -20], b: [37, -15], y0: 5.2, y1: 6.3, t: 0.4, m: "concrete", look: "parapet" });
extra.push({ k: "wall", a: [37, -15.4], b: [43, -15.4], y0: 5.2, y1: 6.3, t: 0.4, m: "concrete", look: "parapet" });
extra.push({ k: "box", x0: 44, z0: -20, x1: 47, z1: -17.5, y0: 5.2, y1: 7.6, m: "plank", look: "signal-box" });
// lamps (drawn only): the yards', the lanes', the train's
for (const [x, z] of [
  [-70, 0],
  [-70, -68],
  [-40, -2],
  [-70, 60],
  [-7, -70],
  [2, -2],
  [-7, 64],
  [12, -55],
  [48, -46],
  [18, 40],
  [48, 64],
  [22, -4],
  [60, -2],
] as P[])
  extra.push({ k: "prop", kind: "lamp", x, z });
extra.push({ k: "prop", kind: "signal", x: -9, z: -1 });
extra.push({ k: "prop", kind: "signal", x: 4, z: -72 });

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

export const FREIGHT: StrikeMap = {
  key: "freight",
  name: "Freight",
  mode: "bomb",
  blurb: "A snowed-in rail freight yard: the Depot and the Gantry, a freight train standing across the middle.",
  plays: "long lines over the containers' lanes; every way in crosses the train",
  size: { x0: -90, z0: -90, x1: 90, z1: 90 },
  pieces: [...C.pieces(), ...extra],
  spawns: { r: spread(2, 15, 5, 20, 10), w: spread(28, 14, 31, 20, 10) },
  buy: { r: C.rect([2, 15, 5, 20]), w: C.rect([28, 14, 31, 20]) },
  sites: { A: { x0: 16, z0: -62, x1: 44, z1: -48 }, B: { x0: 18, z0: 42, x1: 44, z1: 62 } },
  calls: [
    { name: "Raider Yard", r: C.rect([2, 15, 5, 20]) },
    { name: "Yard Office", r: C.rect([28, 14, 31, 20]) },
    { name: "Signal Box", r: { x0: 35, z0: -20, x1: 50, z1: -15 } },
    { name: "Depot", r: C.rect([20, 3, 27, 9]) },
    { name: "Platform", r: { x0: 10, z0: -62, x1: 50, z1: -57 } },
    { name: "Goods Shed", r: { x0: 16, z0: -74, x1: 44, z1: -62 } },
    { name: "Gantry", r: C.rect([20, 25, 27, 31]) },
    { name: "Crane Deck", r: { x0: 19.4, z0: 48.4, x1: 46.5, z1: 55.6 } },
    { name: "North Road", r: C.rect([2, 3, 15, 4]) },
    { name: "Buffer Stop", r: { x0: -10, z0: -75, x1: 5, z1: -69 } },
    { name: "Depot Gate", r: C.rect([19, 4, 19, 4]) },
    { name: "Signal Path", r: C.rect([2, 5, 3, 14]) },
    { name: "Reefer Row", r: C.rect([6, 16, 15, 18]) },
    { name: "Coupling", r: { x0: -10, z0: -6, x1: 10, z1: 1 } },
    { name: "Switchyard", r: C.rect([20, 14, 24, 19]) },
    { name: "Depot Alley", r: C.rect([23, 10, 23, 13]) },
    { name: "Crane Alley", r: C.rect([20, 20, 20, 24]) },
    { name: "Ash Path", r: C.rect([4, 21, 5, 28]) },
    { name: "Coal Lane", r: C.rect([4, 29, 15, 30]) },
    { name: "Flatbed", r: { x0: -10, z0: 56, x1: 5, z1: 70 } },
    { name: "Crane Gate", r: C.rect([19, 30, 19, 30]) },
    { name: "West Siding", r: { x0: -10, z0: -69, x1: -4, z1: 56 } },
    { name: "East Siding", r: { x0: -1, z0: -69, x1: 5, z1: 56 } },
    { name: "Office Steps", r: C.rect([28, 8, 29, 13]) },
    { name: "Weigh Lane", r: C.rect([28, 21, 31, 26]) },
  ],
  ground: "snow",
  floods: 8,
};
