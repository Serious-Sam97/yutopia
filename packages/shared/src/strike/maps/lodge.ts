// The Lodge (docs/plan/114-the-strike-park.md, S-M6): bomb defusal in a mountain hotel. Our own map,
// close quarters and utility-heavy, 120 × 120 m on 2.5 m cells:
//   - the hotel's ground floor and terrace stand on a stone plinth 3 m up; the car park, the lanes
//     round the hotel and the cellar are at the pad's level;
//   - A, the Lift Terrace (north-east): open, by the ski lift's bottom station; low stone walls and
//     the lift's machinery for cover; in by the Lift Road's ramp (east lane), the Boot Hall from the
//     Ski Room (off the lobby) or the Glass Doors from the Dining Hall;
//   - B, the Kitchens (north-west): the cellar under the hotel, roofed; in by the Delivery Door off
//     the Service Lane (west lane), the Kitchen Stairs down from the Dining Hall, or the Staff Stairs;
//   - the middle: the Front Steps up from the car park into the Lobby, the Dining Hall behind it with
//     its drywall booths, the Bar and its balcony over the Service Lane.
// The Wardens start in the Great Hall at the back of the hotel, between the sites; the Raiders in the
// car park by the road (south).

import { Carver } from "../carve.ts";
import type { Mat, P, Piece, StrikeMap } from "../map.ts";

const FLOOR = 3;
const C = new Carver({ cell: 2.5, x0: -60, z0: -60, nx: 48, nz: 48 }, 10, "stone", "hotel");

// ── the pad's level: the car park, the roads, the lanes, the cellar ──
C.open(
  [14, 36, 33, 44], // Car Park (Raider spawn)
  [4, 38, 13, 41], // West Road
  [34, 38, 44, 41], // East Road
  [4, 20, 6, 37], // Service Lane
  [5, 19, 6, 19], // Delivery Door
  [4, 10, 13, 18], // B: the Kitchens (the cellar)
  [7, 6, 8, 9], // Staff Stairs (down to the cellar)
  [14, 12, 16, 14], // Kitchen Stairs (down to the cellar)
  [42, 16, 44, 37], // Lift Road
  [21, 30, 26, 35], // Front Steps
);
// the hotel's solid masses restyled first (the plinth's floors fill over them): the hotel's timber wings and the lift house
C.style([7, 26, 20, 35], 9, "wood", "chalet");
C.style([27, 24, 41, 35], 9, "wood", "chalet");
C.style([36, 16, 41, 21], 8, "plank", "lift-house");
C.style([34, 2, 45, 4], 12, "metal", "lift-house");
// ── the plinth's level (3 m): the hotel's floors and the terrace ──
const up = (r: [number, number, number, number], look = "floor") => C.fill(r, FLOOR, "stone", look);
up([18, 3, 29, 7], "parquet"); // Great Hall (Warden spawn)
up([7, 5, 17, 5]); // Staff Corridor west
up([30, 5, 33, 5]); // Staff Corridor east
up([22, 8, 25, 8], "parquet"); // Great Hall → Dining Hall
up([17, 9, 30, 18], "parquet"); // Dining Hall
up([31, 12, 31, 13]); // Glass Doors (Dining Hall → terrace)
up([22, 19, 25, 20], "parquet"); // Dining Hall → Lobby
up([18, 21, 29, 29], "tile"); // Lobby
up([13, 22, 17, 25], "parquet"); // Bar
up([7, 23, 12, 23]); // Bar Balcony (over the Service Lane)
up([30, 22, 35, 23]); // Ski Room
up([34, 16, 35, 21]); // Boot Hall
up([32, 6, 44, 15], "terrace"); // A: the Lift Terrace
// the Ski Room's racks narrow it
C.fill([30, 23, 31, 23], 10, "wood", "lockers");
// the outer ring: the mountain's rock
C.style([0, 0, 47, 1], 16, "rock", "cliff");
C.style([0, 46, 47, 47], 16, "rock", "cliff");
C.style([0, 0, 1, 47], 16, "rock", "cliff");
C.style([46, 0, 47, 47], 16, "rock", "cliff");
// the snowbanks round the car park and the roads (still too high to climb)
C.style([2, 42, 13, 45], 4.5, "snow", "snowbank");
C.style([34, 42, 45, 45], 4.5, "snow", "snowbank");
C.style([14, 45, 33, 45], 4.5, "snow", "snowbank");

const at = (c: number, r: number): P => C.at(c, r);
const R = (r: [number, number, number, number]) => C.rect(r);
const extra: Piece[] = [];
const crate = (c: number, r: number, s = 1.1, n = 1, ry = 0, y = 0) => {
  const [x, z] = at(c, r);
  extra.push({ k: "crate", x, z, s, n, ry, ...(y ? { y } : {}) });
};
const lamp = (c: number, r: number, y = 0) => {
  const [x, z] = at(c, r);
  extra.push({ k: "prop", kind: "lamp", x, z, ...(y ? { y } : {}) });
};
/** a block standing on a floor at `y` (a counter, a desk, a car), `h` high */
const block = (x0: number, z0: number, x1: number, z1: number, y: number, h: number, m: Mat, look: string) =>
  extra.push({ k: "box", x0, z0, x1, z1, y0: y, y1: y + h, m, look });

// ── the ways between the levels ──
{
  // Staff Stairs: from the west corridor (z −45) down south into the cellar
  const s = R([7, 6, 8, 9]);
  extra.push({ k: "stairs", x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, y0: 0, y1: FLOOR, up: "n", m: "wood" });
  // Kitchen Stairs: from the Dining Hall (x −17.5) down west into the cellar
  const k = R([14, 12, 16, 14]);
  extra.push({ k: "stairs", x0: k.x0, z0: k.z0, x1: k.x1, z1: k.z1, y0: 0, y1: FLOOR, up: "e", m: "stone" });
  // Front Steps: from the car park up north into the Lobby
  const f = R([21, 30, 26, 33]);
  extra.push({ k: "stairs", x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, y0: 0, y1: FLOOR, up: "n", m: "stone" });
  // the Lift Road's ramp: up north onto the terrace
  const l = R([42, 16, 44, 19]);
  extra.push({ k: "ramp", x0: l.x0, z0: l.z0, x1: l.x1, z1: l.z1, y0: 0, y1: FLOOR, up: "n", m: "snow" });
}

// ── B, the Kitchens: the cellar's roof (4.5), pillars, the counters, the stoves, the cold room ──
{
  const r = R([4, 10, 13, 18]);
  extra.push({ k: "floor", x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y: 4.5, t: 0.4, m: "stone", look: "vault" });
  for (const [c, rr] of [
    [7, 13],
    [10.5, 13],
    [7, 16],
    [10.5, 16],
  ] as P[]) {
    const [x, z] = at(c, rr);
    block(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0, 4.1, "stone", "pillar");
  }
  // the long steel counter across the site and the stove island
  const [cx, cz] = at(8.7, 14.5);
  block(cx - 3.5, cz - 0.5, cx + 3.5, cz + 0.5, 0, 0.95, "metal", "counter");
  const [sx, sz] = at(6, 11.2);
  block(sx - 2, sz - 0.6, sx + 2, sz + 0.6, 0, 1.0, "metal", "stove");
  // the cold room in the south-east corner: timber walls, one door
  const cr = R([11, 16, 13, 18]);
  extra.push({ k: "wall", a: [cr.x0, cr.z0], b: [cr.x1, cr.z0], y1: 2.8, m: "wood", look: "cold-room" });
  extra.push({ k: "wall", a: [cr.x0, cr.z0], b: [cr.x0, cr.z1 - 2.2], y1: 2.8, m: "wood", look: "cold-room" });
  // the scullery partition by the Staff Stairs (drywall: shot through)
  extra.push({ k: "wall", a: [-45, -35], b: [-45, -30.5], y1: 3, m: "drywall", look: "scullery" });
  crate(4.6, 17.6, 1.1, 2);
  crate(12.4, 10.6, 1.1);
  crate(9, 17.8, 1.4);
  crate(4.6, 13.5, 1.1, 1, 0.3);
}

// ── A, the Lift Terrace: the bottom station's machinery, the operator's hut, low stone walls ──
{
  const y = FLOOR;
  // the bull wheel's housing and drive (metal), along the terrace's east side
  const m = R([42, 6, 44, 9]);
  block(m.x0, m.z0, m.x1, m.z1, y, 4.5, "metal", "lift-station");
  const [bx, bz] = at(43, 10.5);
  block(bx - 1.2, bz - 0.8, bx + 1.2, bz + 0.8, y, 1.6, "metal", "lift-drive");
  extra.push({ k: "prop", kind: "bull-wheel", x: m.x0 - 1, z: (m.z0 + m.z1) / 2, y: y + 4.5, s: 5 });
  // the operator's hut
  const [hx, hz] = at(36, 7);
  block(hx - 1.4, hz - 1.4, hx + 1.4, hz + 1.4, y, 2.6, "wood", "lift-hut");
  // low stone walls (1 m: crouched behind, jumped over)
  extra.push({
    k: "wall",
    a: [27.5, -27.5],
    b: [33.5, -27.5],
    y0: y,
    y1: y + 1,
    t: 0.5,
    m: "stone",
    look: "terrace-wall",
  });
  extra.push({ k: "wall", a: [38, -33], b: [38, -26], y0: y, y1: y + 1, t: 0.5, m: "stone", look: "terrace-wall" });
  extra.push({ k: "wall", a: [41, -22.5], b: [45, -22.5], y0: y, y1: y + 1, t: 0.5, m: "stone", look: "terrace-wall" });
  // a lift chair parked off the line, ski racks, crates
  extra.push({ k: "prop", kind: "lift-chair", x: 46, z: -31, y: y + 1.2 });
  extra.push({ k: "prop", kind: "lift-chair", x: 46, z: -24, y: y + 1.2 });
  extra.push({ k: "wall", a: [23.5, -36], b: [23.5, -31], y0: y, y1: y + 1.4, t: 0.4, m: "plank", look: "ski-rack" });
  crate(39.5, 13.4, 1.4, 1, 0, y);
  crate(33, 11, 1.1, 2, 0.2, y);
  crate(40.6, 7, 1.1, 1, 0, y);
}

// ── the Dining Hall: drywall booths (shot through), the buffet, tables ──
{
  const y = FLOOR;
  const dw = (a: P, b: P) =>
    extra.push({ k: "wall", a, b, y0: y, y1: y + 2.8, t: 0.15, m: "drywall", look: "partition" });
  // a screen across the hall's middle with three gaps, and two booths on its east side
  dw([-17.5, -22.5], [-12, -22.5]);
  dw([-8, -22.5], [-2, -22.5]);
  dw([2, -22.5], [9, -22.5]);
  dw([13, -22.5], [17.5, -22.5]);
  dw([5, -37.5], [5, -29]);
  dw([12, -15], [12, -10]);
  dw([12, -15], [17, -15]);
  const [tx, tz] = at(20, 15.5);
  block(tx - 2.5, tz - 0.6, tx + 2.5, tz + 0.6, y, 0.9, "wood", "buffet");
  for (const [c, r] of [
    [19, 11],
    [27, 11],
    [27, 15.5],
    [23.5, 13],
  ] as P[]) {
    const [x, z] = at(c, r);
    block(x - 0.8, z - 0.8, x + 0.8, z + 0.8, y, 0.8, "wood", "table");
  }
}

// ── the Lobby: the reception desk, the fireplace, pillars, the double doors from the steps ──
{
  const y = FLOOR;
  const [dx, dz] = at(21, 23);
  block(dx - 2.5, dz - 0.6, dx + 2.5, dz + 0.6, y, 1.1, "wood", "reception");
  const [fx, fz] = at(29, 25.5);
  block(fx - 0.6, fz - 2, fx + 1.25, fz + 2, y, 2.2, "stone", "fireplace");
  for (const [c, r] of [
    [20, 27],
    [27, 27],
  ] as P[]) {
    const [x, z] = at(c, r);
    block(x - 0.5, z - 0.5, x + 0.5, z + 0.5, y, 4, "wood", "beam");
  }
  // the entrance's two doors
  for (const [a, b] of [
    [-7.5, -3.5],
    [-1, 1],
    [3.5, 7.5],
  ])
    extra.push({ k: "wall", a: [a, 14.2], b: [b, 14.2], y0: y, y1: y + 3.2, m: "wood", look: "doorframe" });
  extra.push({ k: "prop", kind: "sofa", x: 2, z: 5, y });
}

// ── the Bar: the counter, its balcony's rail over the Service Lane ──
{
  const y = FLOOR;
  const [bx, bz] = at(15, 22.2);
  block(bx - 3, bz - 0.4, bx + 3, bz + 0.4, y, 1.1, "wood", "bar");
  crate(14, 25, 1.1, 1, 0, y);
  const b = R([7, 23, 7, 23]);
  extra.push({
    k: "wall",
    a: [b.x0 + 0.15, b.z0],
    b: [b.x0 + 0.15, b.z0 + 1.2],
    y0: y,
    y1: y + 1,
    t: 0.2,
    m: "wood",
    look: "rail",
  });
}

// ── the Ski Room and the Boot Hall: benches, lockers ──
{
  const y = FLOOR;
  const [bx, bz] = at(33, 22.5);
  block(bx - 1.5, bz - 0.3, bx + 1.5, bz + 0.3, y, 0.5, "wood", "bench");
  crate(34.4, 18.5, 1.1, 1, 0, y);
}

// ── the car park and the roads: parked cars, the plough, the lanes' cover ──
{
  const car = (c: number, r: number, along: "x" | "z") => {
    const [x, z] = at(c, r);
    const [hx, hz] = along === "x" ? [2.3, 1] : [1, 2.3];
    block(x - hx, z - hz, x + hx, z + hz, 0, 1.5, "metal", "parked-car");
  };
  car(17, 37.5, "z");
  car(30, 37.5, "z");
  car(23.5, 38.8, "x");
  car(15, 43, "z");
  car(32.5, 43, "z");
  const [px, pz] = at(39, 39.5);
  block(px - 2.5, pz - 1.3, px + 2.5, pz + 1.3, 0, 2.4, "metal", "snow-plough");
  crate(9, 40.5, 1.4, 2);
  crate(5, 30, 1.1);
  crate(5.6, 25, 1.4, 1, 0.4);
  crate(43, 28, 1.4, 2);
  crate(43.6, 33, 1.1);
  crate(42.6, 23.5, 1.1, 1, 0.3);
  crate(22, 35, 1.1);
  // snow banks in the lanes (packed: shot through a little)
  const [sx, sz] = at(5, 34);
  block(sx - 1.2, sz - 1, sx + 1.2, sz + 1, 0, 1.0, "snow", "snowbank");
  const [ex, ez] = at(43.5, 21);
  block(ex - 1.2, ez - 1, ex + 1.2, ez + 1, 0, 1.0, "snow", "snowbank");
}

// lamps (drawn only): the car park's posts, the lanes', the halls' and the cellar's
for (const [c, r] of [
  [18, 41],
  [29, 41],
  [8, 39],
  [40, 39],
  [5, 27],
  [43, 26],
] as P[])
  lamp(c, r);
for (const [c, r] of [
  [23.5, 5],
  [23.5, 13],
  [23.5, 25],
  [15, 24],
  [38, 10],
  [34.5, 19],
  [12, 5],
] as P[])
  lamp(c, r, FLOOR);
lamp(8.5, 12);
lamp(8.5, 16.5);

const spread = (c0: number, r0: number, c1: number, r1: number, n: number): P[] => {
  const a = R([c0, r0, c1, r1]);
  const out: P[] = [];
  const cols = 5;
  for (let k = 0; k < n; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    out.push([a.x0 + 2 + ((a.x1 - a.x0 - 4) * i) / (cols - 1), a.z0 + 2 + j * 3]);
  }
  return out;
};

export const LODGE: StrikeMap = {
  key: "lodge",
  name: "The Lodge",
  mode: "bomb",
  blurb: "A mountain hotel in the snow: the Lift Terrace up top, the Kitchens in the cellar below.",
  plays: "close quarters and utility: short halls, drywall booths, stairs down to B",
  size: { x0: -60, z0: -60, x1: 60, z1: 60 },
  pieces: [...C.pieces(), ...extra],
  spawns: { r: spread(17, 40, 30, 43, 10), w: spread(19, 3, 28, 6, 10) },
  buy: { r: R([14, 39, 33, 44]), w: R([18, 3, 29, 7]) },
  sites: { A: R([35, 8, 41, 13]), B: R([5, 11, 11, 17]) },
  calls: [
    { name: "Car Park", r: R([14, 36, 33, 44]) },
    { name: "West Road", r: R([4, 38, 13, 41]) },
    { name: "East Road", r: R([34, 38, 44, 41]) },
    { name: "Front Steps", r: R([21, 30, 26, 35]) },
    { name: "Lobby", r: R([18, 21, 29, 29]) },
    { name: "Bar", r: R([13, 22, 17, 25]) },
    { name: "Bar Balcony", r: R([7, 23, 12, 23]) },
    { name: "Service Lane", r: R([4, 20, 6, 37]) },
    { name: "Delivery Door", r: R([5, 19, 6, 19]) },
    { name: "Kitchens", r: R([4, 10, 13, 18]) },
    { name: "Cold Room", r: R([11, 16, 13, 18]) },
    { name: "Kitchen Stairs", r: R([14, 12, 16, 14]) },
    { name: "Staff Stairs", r: R([7, 6, 8, 9]) },
    { name: "Staff Corridor", r: R([7, 5, 17, 5]) },
    { name: "Great Hall", r: R([18, 3, 29, 7]) },
    { name: "Dining Hall", r: R([17, 9, 30, 18]) },
    { name: "Glass Doors", r: R([31, 12, 31, 13]) },
    { name: "Lift Terrace", r: R([32, 6, 44, 15]) },
    { name: "Bull Wheel", r: R([42, 6, 44, 10]) },
    { name: "Ski Room", r: R([30, 22, 35, 23]) },
    { name: "Boot Hall", r: R([34, 16, 35, 21]) },
    { name: "Lift Road", r: R([42, 16, 44, 37]) },
  ],
  ground: "snow",
  floods: 6,
};
