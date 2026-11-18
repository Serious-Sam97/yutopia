import { BIKE_SEATS, BIKE_SPECS, type BikeKind, type BikeSpec } from "../bike/specs.ts";
import { CAR_BODY } from "./body.ts";
import type { Foot } from "./grip.ts";

// The cars' numbers (docs/plan/28-the-car.md, M1–M5): every part as data, so
// a second car is a new spec and a new model, not new physics.
//
// Units: metres, kilograms, seconds, newtons, radians. Car-local axes: x
// forward, y up, z to the right; points measured from the centre of gravity.

export type CarKind =
  | "sedan"
  | "estate"
  | "hatch"
  | "van"
  | "offroad"
  | "pickup"
  | "snowmobile"
  | "snowcat"
  | "ploughtruck"
  | "tractor"
  | "toboggan"
  // (plan 101) the bicycles
  | BikeKind;

export interface AxleSpec {
  k: number; // spring rate per wheel (N/m)
  bump: number; // damper, compressing (N·s/m)
  rebound: number; // damper, extending (N·s/m)
  travel: number; // compression to the bump stop (m)
  droop: number; // how far the wheel hangs below its rest (m)
  arb: number; // anti-roll bar (N per m of difference between the sides)
  roll: number; // roll centre's height above the ground (m): where the tyres' side forces act
  brake: number; // max brake torque per wheel (N·m)
}

export interface CarSpec {
  kind: CarKind;
  mass: number;
  /** principal inertia about the car's own x (roll), y (yaw), z (pitch) */
  inertia: [number, number, number];
  cog: number; // centre of gravity above the ground at rest
  wheelbase: number;
  front: number; // centre of gravity to the front axle (the rest of the wheelbase is behind)
  track: number; // between the wheels' centres
  clearance: number; // the underside above the ground at rest
  body: { ahead: number; behind: number; width: number; height: number }; // the box round it, from the CoG
  wheel: { r: number; width: number; inertia: number };
  axles: [AxleSpec, AxleSpec]; // front, rear
  hand: number; // the handbrake's torque on each rear wheel
  steer: { max: number; ratio: number };
  engine: {
    idle: number; // rpm
    limit: number; // the rev limiter
    redline: number;
    inertia: number; // kg·m²
    curve: [number, number][]; // [rpm, N·m] at full throttle
    drag: [number, number]; // engine braking off throttle: a + b·rpm (N·m)
  };
  gears: number[]; // [reverse (negative), neutral (0), 1st, 2nd, …]
  final: number;
  low?: number; // a low range (the 4x4)
  efficiency: number;
  shift: number; // seconds without drive while changing gear
  clutch: number; // the clutch's torque when fully in (N·m)
  /** the automatic's shift up (rpm; none: by the throttle, short of the limiter) — the tractor's
   *  low-revving diesel, early */
  shiftAt?: number;
  /** where the clutch starts to bite pulling away and over how many rpm it's fully in (none: from
   *  just over idle, over 900 — a car's; the snowmobile's belt drive holds it up in its power) */
  engage?: [number, number];
  drive: "rear" | "front" | "all";
  /** what each axle stands on (front, rear): tyres when not said (grip.ts Foot) */
  feet?: [Foot, Foot];
  /** no engine (the toboggan): pushed along by its riders' feet — no fuel, no sound, no starter */
  pushed?: boolean;
  /** a blade on its nose (the plough truck): the road's fresh snow cleared where it goes */
  blade?: boolean;
  aero: { cda: number };
  fuel: { litres: number; perKm: number }; // tank, and use at a steady 80 km/h
  /** (plan 101) a bicycle: ridden on two wheels (shared bike/drive.ts BikeDrive), pedalled */
  bike?: BikeSpec;
}

/** The 80s rear-wheel-drive saloon: 2.3 L straight-four, 5-speed, open diff. */
export const SEDAN: CarSpec = {
  kind: "sedan",
  mass: 1280,
  inertia: [520, 2450, 2350],
  cog: 0.52,
  wheelbase: 2.85,
  front: 1.37, // 52 % of the weight on the front wheels
  track: 1.52,
  clearance: 0.16,
  body: CAR_BODY.sedan,
  wheel: { r: 0.317, width: 0.195, inertia: 1.1 },
  axles: [
    { k: 32000, bump: 2900, rebound: 4300, travel: 0.13, droop: 0.09, arb: 15000, roll: 0.08, brake: 1700 },
    { k: 29000, bump: 2600, rebound: 3900, travel: 0.14, droop: 0.1, arb: 8500, roll: 0.11, brake: 900 },
  ],
  hand: 1500,
  steer: { max: 0.6, ratio: 15.9 },
  engine: {
    idle: 850,
    limit: 6200,
    redline: 5800,
    inertia: 0.2,
    curve: [
      [0, 80],
      [800, 128],
      [1500, 152],
      [2750, 185],
      [4000, 179],
      [5400, 152],
      [6200, 124],
      [6800, 60],
    ],
    drag: [18, 0.0065],
  },
  gears: [-3.68, 0, 3.71, 2.16, 1.37, 1.0, 0.83],
  final: 3.73,
  efficiency: 0.9,
  shift: 0.25,
  clutch: 420,
  drive: "rear",
  aero: { cda: 0.86 },
  fuel: { litres: 60, perKm: 0.085 },
};

/** The 80s 4x4 (phase 6): short, tall, light; 1.6 L, a centre diff with a lock, a low range. */
export const OFFROAD: CarSpec = {
  kind: "offroad",
  mass: 1180,
  inertia: [560, 1650, 1550],
  cog: 0.66,
  wheelbase: 2.2,
  front: 1.0,
  track: 1.42,
  clearance: 0.24,
  body: CAR_BODY.offroad,
  wheel: { r: 0.36, width: 0.185, inertia: 1.4 },
  axles: [
    { k: 26000, bump: 2600, rebound: 3800, travel: 0.17, droop: 0.13, arb: 9000, roll: 0.14, brake: 1500 },
    { k: 25000, bump: 2400, rebound: 3500, travel: 0.18, droop: 0.14, arb: 5000, roll: 0.22, brake: 850 },
  ],
  hand: 1400,
  steer: { max: 0.6, ratio: 17 },
  engine: {
    idle: 800,
    limit: 5800,
    redline: 5400,
    inertia: 0.18,
    curve: [
      [0, 70],
      [800, 100],
      [1500, 112],
      [3000, 121],
      [4500, 112],
      [5400, 98],
      [5800, 82],
      [6400, 40],
    ],
    drag: [16, 0.006],
  },
  gears: [-3.53, 0, 3.67, 2.1, 1.36, 1.0, 0.82],
  final: 4.3,
  low: 2.13,
  efficiency: 0.86,
  shift: 0.28,
  clutch: 360,
  drive: "all",
  aero: { cda: 1.05 },
  fuel: { litres: 42, perKm: 0.11 },
};

/** The estate (docs/plan/92: the town's wagons, a body of their own): the saloon's chassis and engine,
 *  a little heavier over the back. */
export const ESTATE: CarSpec = {
  ...SEDAN,
  kind: "estate",
  mass: 1340,
  inertia: [540, 2600, 2500],
  front: 1.37,
  body: CAR_BODY.estate,
  axles: [SEDAN.axles[0], { ...SEDAN.axles[1], k: 31000 }],
  aero: { cda: 0.9 },
};

/** The hatch (docs/plan/92, new): a small front-driven three-door; a revvy 1.6 L four on five speeds,
 *  light, quick to turn. */
export const HATCH: CarSpec = {
  kind: "hatch",
  mass: 920,
  inertia: [330, 1350, 1300],
  cog: 0.5,
  wheelbase: 2.4,
  front: 0.96, // (60 % on the front wheels: its engine over them)
  track: 1.4,
  clearance: 0.15,
  body: CAR_BODY.hatch,
  wheel: { r: 0.29, width: 0.175, inertia: 0.8 },
  axles: [
    { k: 26000, bump: 2300, rebound: 3500, travel: 0.13, droop: 0.09, arb: 11000, roll: 0.07, brake: 1400 },
    { k: 21000, bump: 2000, rebound: 3100, travel: 0.13, droop: 0.1, arb: 9000, roll: 0.1, brake: 650 },
  ],
  hand: 1200,
  steer: { max: 0.62, ratio: 15 },
  engine: {
    idle: 900,
    limit: 7000,
    redline: 6600,
    inertia: 0.13,
    curve: [
      [0, 60],
      [900, 92],
      [2000, 118],
      [3500, 134],
      [4600, 140],
      [6000, 128],
      [7000, 104],
      [7600, 50],
    ],
    drag: [14, 0.005],
  },
  gears: [-3.42, 0, 3.55, 2.04, 1.32, 1.03, 0.85],
  final: 3.94,
  efficiency: 0.91,
  shift: 0.22,
  clutch: 320,
  drive: "front",
  aero: { cda: 0.68 },
  fuel: { litres: 45, perKm: 0.07 },
};

/** The van (docs/plan/92, new): front-driven, tall, the minibus's eight seats; a 2.0 L four that
 *  pulls more than it revs. */
export const VAN: CarSpec = {
  kind: "van",
  mass: 1480,
  inertia: [700, 2900, 2800],
  cog: 0.75,
  wheelbase: 2.88,
  front: 1.28,
  track: 1.56,
  clearance: 0.18,
  body: CAR_BODY.van,
  wheel: { r: 0.31, width: 0.185, inertia: 1.1 },
  axles: [
    { k: 36000, bump: 3100, rebound: 4500, travel: 0.13, droop: 0.1, arb: 16000, roll: 0.1, brake: 1900 },
    { k: 34000, bump: 2900, rebound: 4300, travel: 0.14, droop: 0.11, arb: 9000, roll: 0.14, brake: 1000 },
  ],
  hand: 1500,
  steer: { max: 0.58, ratio: 17 },
  engine: {
    idle: 800,
    limit: 5600,
    redline: 5200,
    inertia: 0.22,
    curve: [
      [0, 90],
      [800, 132],
      [1800, 168],
      [2600, 176],
      [3800, 168],
      [4800, 146],
      [5600, 118],
      [6200, 50],
    ],
    drag: [20, 0.007],
  },
  gears: [-3.6, 0, 3.8, 2.2, 1.4, 1.0, 0.82],
  final: 4.3,
  efficiency: 0.88,
  shift: 0.3,
  clutch: 460,
  drive: "front",
  aero: { cda: 1.2 },
  fuel: { litres: 70, perKm: 0.11 },
};

/** The 80s pickup (wave 1): long, heavy, light over its rear wheels (tail-happy empty); a 5.0 L
 *  V8, all torque, four speeds. */
export const PICKUP: CarSpec = {
  kind: "pickup",
  mass: 1560,
  inertia: [640, 3300, 3200],
  cog: 0.62,
  wheelbase: 3.15,
  front: 1.41, // 55 % on the front wheels: the bed's light
  track: 1.54,
  clearance: 0.21,
  body: CAR_BODY.pickup,
  wheel: { r: 0.34, width: 0.215, inertia: 1.5 },
  axles: [
    { k: 38000, bump: 3200, rebound: 4700, travel: 0.14, droop: 0.1, arb: 14000, roll: 0.1, brake: 2000 },
    { k: 30000, bump: 2700, rebound: 4000, travel: 0.16, droop: 0.12, arb: 4000, roll: 0.16, brake: 1000 },
  ],
  hand: 1600,
  steer: { max: 0.58, ratio: 17.5 },
  engine: {
    idle: 700,
    limit: 5000,
    redline: 4600,
    inertia: 0.32,
    curve: [
      [0, 150],
      [800, 260],
      [1500, 335],
      [2800, 380],
      [4000, 350],
      [4600, 300],
      [5000, 240],
      [5600, 110],
    ],
    drag: [24, 0.008],
  },
  gears: [-2.26, 0, 2.84, 1.55, 1.0, 0.7],
  final: 3.08,
  efficiency: 0.88,
  shift: 0.32,
  clutch: 720,
  drive: "rear",
  aero: { cda: 1.0 },
  fuel: { litres: 80, perKm: 0.16 },
};

/** The snowmobile (wave 2): one rider, skis in front, a track behind; a 600 cc two-stroke twin
 *  that screams to 8600 on a belt drive (four close steps here). Light, quick, at home on deep
 *  snow and the pond; on a road it grinds along (its track and skis on bare ground). */
export const SNOWMOBILE: CarSpec = {
  kind: "snowmobile",
  mass: 300,
  inertia: [60, 230, 210],
  cog: 0.5,
  wheelbase: 1.55,
  front: 0.62, // (60 % on the track)
  track: 1.0,
  clearance: 0.22,
  body: CAR_BODY.snowmobile,
  wheel: { r: 0.22, width: 0.14, inertia: 0.25 },
  axles: [
    { k: 9000, bump: 900, rebound: 1300, travel: 0.18, droop: 0.12, arb: 2000, roll: 0.2, brake: 0 },
    { k: 12000, bump: 1100, rebound: 1600, travel: 0.2, droop: 0.12, arb: 0, roll: 0.15, brake: 450 },
  ],
  hand: 300,
  steer: { max: 0.42, ratio: 1 },
  engine: {
    idle: 1600,
    limit: 8600,
    redline: 8200,
    inertia: 0.04,
    curve: [
      [0, 24],
      [1500, 36],
      [3000, 54],
      [5000, 74],
      [7000, 94],
      [8000, 89],
      [8600, 72],
      [9200, 24],
    ],
    drag: [3, 0.0006],
  },
  gears: [-4, 0, 3.0, 2.0, 1.45, 1.1],
  final: 4.2,
  efficiency: 0.85,
  shift: 0.12,
  clutch: 160,
  engage: [3800, 1500],
  drive: "rear",
  feet: ["ski", "track"],
  aero: { cda: 0.7 },
  fuel: { litres: 30, perKm: 0.08 },
};

/** The snowcat (wave 2): a groomer's heated cab on four tracks; a 3.2 t diesel crawler that
 *  goes anywhere, slowly (about 33 km/h), climbs what nothing else can, seats four. */
export const SNOWCAT: CarSpec = {
  kind: "snowcat",
  mass: 3200,
  inertia: [2600, 9000, 8800],
  cog: 0.95,
  wheelbase: 2.6,
  front: 1.25,
  track: 2.0,
  clearance: 0.35,
  body: CAR_BODY.snowcat,
  wheel: { r: 0.45, width: 0.6, inertia: 6 },
  axles: [
    { k: 120000, bump: 9000, rebound: 12000, travel: 0.12, droop: 0.08, arb: 40000, roll: 0.3, brake: 5000 },
    { k: 120000, bump: 9000, rebound: 12000, travel: 0.12, droop: 0.08, arb: 40000, roll: 0.3, brake: 5000 },
  ],
  hand: 4000,
  steer: { max: 0.5, ratio: 12 },
  engine: {
    idle: 750,
    limit: 2800,
    redline: 2600,
    inertia: 0.8,
    curve: [
      [0, 350],
      [800, 520],
      [1400, 640],
      [2000, 620],
      [2600, 520],
      [3000, 200],
    ],
    drag: [40, 0.02],
  },
  gears: [-6, 0, 6.0, 3.5, 2.2],
  final: 6,
  efficiency: 0.8,
  shift: 0.4,
  clutch: 2000,
  drive: "all",
  feet: ["track", "track"],
  aero: { cda: 2.5 },
  fuel: { litres: 120, perKm: 0.6 },
};

/** The plough truck (wave 3): the town's, drivable — a 6.5 t diesel on six speeds, a blade on its
 *  nose, a salt hopper behind; where it goes in a storm the road's fresh snow is cleared. */
export const PLOUGHTRUCK: CarSpec = {
  kind: "ploughtruck",
  mass: 6500,
  inertia: [6000, 30000, 29000],
  cog: 1.1,
  wheelbase: 4.2,
  front: 1.8,
  track: 1.9,
  clearance: 0.3,
  body: CAR_BODY.ploughtruck,
  wheel: { r: 0.5, width: 0.3, inertia: 8 },
  axles: [
    { k: 260000, bump: 18000, rebound: 24000, travel: 0.12, droop: 0.08, arb: 90000, roll: 0.4, brake: 9000 },
    { k: 260000, bump: 18000, rebound: 24000, travel: 0.12, droop: 0.08, arb: 90000, roll: 0.4, brake: 9000 },
  ],
  hand: 8000,
  steer: { max: 0.6, ratio: 20 },
  engine: {
    idle: 650,
    limit: 2600,
    redline: 2400,
    inertia: 1.2,
    curve: [
      [0, 600],
      [800, 1100],
      [1300, 1500],
      [1800, 1450],
      [2400, 1200],
      [2800, 400],
    ],
    drag: [80, 0.04],
  },
  gears: [-6, 0, 6.5, 4.2, 2.8, 1.9, 1.35, 1.0],
  final: 4.8,
  efficiency: 0.85,
  shift: 0.5,
  clutch: 3500,
  drive: "rear",
  blade: true,
  aero: { cda: 6 },
  fuel: { litres: 200, perKm: 0.4 },
};

/** The farm's tractor (wave 3): slow, big rear wheels, one seat in the open; a diesel four. */
export const TRACTOR: CarSpec = {
  kind: "tractor",
  mass: 2600,
  inertia: [1500, 3200, 3000],
  cog: 0.9,
  wheelbase: 2.3,
  front: 1.35, // (the weight on its big rear wheels)
  track: 1.6,
  clearance: 0.4,
  body: CAR_BODY.tractor,
  wheel: { r: 0.6, width: 0.4, inertia: 4 },
  axles: [
    { k: 90000, bump: 7000, rebound: 9000, travel: 0.08, droop: 0.06, arb: 20000, roll: 0.4, brake: 2500 },
    { k: 110000, bump: 8000, rebound: 10000, travel: 0.06, droop: 0.05, arb: 30000, roll: 0.4, brake: 3500 },
  ],
  hand: 3000,
  steer: { max: 0.6, ratio: 16 },
  engine: {
    idle: 800,
    limit: 2800,
    redline: 2600,
    inertia: 0.6,
    curve: [
      [0, 200],
      [800, 280],
      [1400, 320],
      [2000, 300],
      [2500, 240],
      [2900, 80],
    ],
    drag: [30, 0.015],
  },
  gears: [-8, 0, 8, 5, 3, 2],
  final: 9,
  efficiency: 0.85,
  shift: 0.4,
  clutch: 900,
  shiftAt: 2000,
  drive: "rear",
  feet: ["tyre", "lug"],
  aero: { cda: 2 },
  fuel: { litres: 60, perKm: 0.2 },
};

/** The toboggan (wave 3): a wooden sled for three, no engine — it runs downhill on its runners,
 *  steered by leaning (a little); W pushes it on with the riders' feet, at a walk. */
export const TOBOGGAN: CarSpec = {
  kind: "toboggan",
  mass: 150, // (its riders with it)
  inertia: [10, 50, 46],
  cog: 0.2,
  wheelbase: 1.2,
  front: 0.55,
  track: 0.45,
  clearance: 0.05,
  body: CAR_BODY.toboggan,
  wheel: { r: 0.1, width: 0.08, inertia: 0.02 },
  axles: [
    // (stiff: wood on snow — the board never down on it)
    { k: 22000, bump: 900, rebound: 1200, travel: 0.05, droop: 0.03, arb: 0, roll: 0.05, brake: 40 },
    { k: 26000, bump: 1000, rebound: 1300, travel: 0.05, droop: 0.03, arb: 0, roll: 0.05, brake: 60 },
  ],
  hand: 80,
  steer: { max: 0.18, ratio: 1 },
  engine: {
    idle: 1,
    limit: 450,
    redline: 430,
    inertia: 0.05,
    curve: [
      [0, 14],
      [300, 14],
      [450, 0],
    ],
    drag: [0, 0],
  },
  gears: [-1, 0, 1],
  final: 6,
  efficiency: 1,
  shift: 0.1,
  clutch: 20,
  drive: "rear",
  feet: ["runner", "runner"],
  pushed: true,
  aero: { cda: 1.4 },
  fuel: { litres: 1, perKm: 0 },
};

export const SPECS: Record<CarKind, CarSpec> = {
  sedan: SEDAN,
  estate: ESTATE,
  hatch: HATCH,
  van: VAN,
  offroad: OFFROAD,
  pickup: PICKUP,
  snowmobile: SNOWMOBILE,
  snowcat: SNOWCAT,
  ploughtruck: PLOUGHTRUCK,
  tractor: TRACTOR,
  toboggan: TOBOGGAN,
  ...BIKE_SPECS,
};

/** Is a vehicle of this kind one of the cars people drive (not the shuttle, the plough…)? */
export const isCarKind = (k: string): k is CarKind => k in SPECS;

/** Where people sit in each car: car-local from its CoG (x forward, z to the right; the driver's
 *  on the left), their hip's height over the ground, and the ways out for each seat in turn (its
 *  door, the other side's, round the back). The pickup's last two are in its open bed. */
export const SEATS_OF: Record<CarKind, { at: [number, number][]; hip: number[]; out: [number, number][][] }> = (() => {
  const four = {
    at: [
      [-0.48, -0.42],
      [-0.48, 0.42],
      [-1.15, -0.45],
      [-1.15, 0.45],
    ] as [number, number][],
    hip: [0.47, 0.47, 0.47, 0.47],
    out: [
      [
        [-0.35, -1.7],
        [-0.35, 1.7],
        [-3.4, 0],
      ],
      [
        [-0.35, 1.7],
        [-0.35, -1.7],
        [-3.4, 0],
      ],
      [
        [-1.3, -1.7],
        [-1.3, 1.7],
        [-3.4, 0],
      ],
      [
        [-1.3, 1.7],
        [-1.3, -1.7],
        [-3.4, 0],
      ],
    ] as [number, number][][],
  };
  // (the hatch's: its cabin further ahead of its CoG; reached from its two doors)
  const hatch = {
    at: four.at.map(([x, z]) => [x - 0.03, z]) as [number, number][],
    hip: [0.44, 0.44, 0.43, 0.43],
    out: four.out,
  };
  // the van: two in front; the minibus's three and three behind (in the panel van, its load space),
  // out by the sliding door on the right
  const back = (x: number): [number, number][] => [
    [x, 1.75],
    [x, -1.75],
    [-3.4, 0],
  ];
  const van = {
    at: [
      [0.05, -0.42],
      [0.05, 0.42],
      [-0.75, -0.5],
      [-0.75, 0],
      [-0.75, 0.5],
      [-1.7, -0.5],
      [-1.7, 0],
      [-1.7, 0.5],
    ] as [number, number][],
    hip: [0.68, 0.68, 0.66, 0.66, 0.66, 0.66, 0.66, 0.66],
    out: [
      [
        [0.1, -1.75],
        [0.1, 1.75],
        [-3.4, 0],
      ],
      [
        [0.1, 1.75],
        [0.1, -1.75],
        [-3.4, 0],
      ],
      back(-0.75),
      back(-0.75),
      back(-0.75),
      back(-1.7),
      back(-1.7),
      back(-1.7),
    ] as [number, number][][],
  };
  return {
    sedan: four,
    estate: four,
    hatch,
    van,
    offroad: four,
    pickup: {
      at: [
        [-0.44, -0.42],
        [-0.44, 0.42],
        [-1.6, -0.5],
        [-1.6, 0.5],
      ],
      hip: [0.5, 0.5, 1.0, 1.0],
      out: [
        [
          [-0.3, -1.75],
          [-0.3, 1.75],
          [-3.6, 0],
        ],
        [
          [-0.3, 1.75],
          [-0.3, -1.75],
          [-3.6, 0],
        ],
        [
          [-1.7, -1.75],
          [-3.6, 0],
          [-1.7, 1.75],
        ],
        [
          [-1.7, 1.75],
          [-3.6, 0],
          [-1.7, -1.75],
        ],
      ],
    },
    // one rider, astride (the rest of the seat string stays empty)
    snowmobile: {
      at: [[-0.3, 0]],
      hip: [0.78],
      out: [
        [
          [-0.3, -1.3],
          [-0.3, 1.3],
          [-2.4, 0],
        ],
      ],
    },
    // the plough truck's cab, high over its front wheels: two
    ploughtruck: {
      at: [
        [0.8, -0.5],
        [0.8, 0.5],
      ],
      hip: [1.6, 1.6],
      out: [
        [
          [0.8, -2.0],
          [0.8, 2.0],
          [-3.6, 0],
        ],
        [
          [0.8, 2.0],
          [0.8, -2.0],
          [-3.6, 0],
        ],
      ],
    },
    // the tractor: its one seat, up over the back axle
    tractor: {
      at: [[-0.55, 0]],
      hip: [1.35],
      out: [
        [
          [-0.2, -1.6],
          [-0.2, 1.6],
          [-2.4, 0],
        ],
      ],
    },
    // the toboggan: three in a row on its boards, low; off to either side
    toboggan: {
      at: [
        [0.25, 0],
        [-0.3, 0],
        [-0.85, 0],
      ],
      hip: [0.28, 0.28, 0.28],
      out: [
        [
          [0.25, -0.9],
          [0.25, 0.9],
          [1.4, 0],
        ],
        [
          [-0.3, -0.9],
          [-0.3, 0.9],
          [-1.8, 0],
        ],
        [
          [-0.85, 0.9],
          [-0.85, -0.9],
          [-1.8, 0],
        ],
      ],
    },
    // the cab up on its tracks: two in front, two on the bench behind; a door each side
    snowcat: {
      at: [
        [0.35, -0.5],
        [0.35, 0.5],
        [-0.55, -0.5],
        [-0.55, 0.5],
      ],
      hip: [1.38, 1.38, 1.38, 1.38],
      out: [
        [
          [0.2, -2.1],
          [0.2, 2.1],
          [-3.2, 0],
        ],
        [
          [0.2, 2.1],
          [0.2, -2.1],
          [-3.2, 0],
        ],
        [
          [-0.4, -2.1],
          [-0.4, 2.1],
          [-3.2, 0],
        ],
        [
          [-0.4, 2.1],
          [-0.4, -2.1],
          [-3.2, 0],
        ],
      ],
    },
    ...BIKE_SEATS,
  };
})();

/** Full-throttle torque at `rpm`. */
export function torqueAt(spec: CarSpec, rpm: number): number {
  const c = spec.engine.curve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++)
    if (rpm <= c[i + 1][0]) {
      const k = (rpm - c[i][0]) / (c[i + 1][0] - c[i][0]);
      return c[i][1] + (c[i + 1][1] - c[i][1]) * k;
    }
  return Math.max(0, c[c.length - 1][1]);
}
