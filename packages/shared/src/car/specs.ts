// The cars' numbers (docs/plan/28-the-car.md, M1–M5): every part as data, so
// a second car is a new spec and a new model, not new physics.
//
// Units: metres, kilograms, seconds, newtons, radians. Car-local axes: x
// forward, y up, z to the right; points measured from the centre of gravity.

export type CarKind = "sedan" | "offroad";

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
  drive: "rear" | "all";
  aero: { cda: number };
  fuel: { litres: number; perKm: number }; // tank, and use at a steady 80 km/h
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
  body: { ahead: 2.32, behind: 2.58, width: 1.86, height: 1.53 },
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
  body: { ahead: 1.9, behind: 2.0, width: 1.7, height: 1.66 },
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

export const SPECS: Record<CarKind, CarSpec> = { sedan: SEDAN, offroad: OFFROAD };

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
