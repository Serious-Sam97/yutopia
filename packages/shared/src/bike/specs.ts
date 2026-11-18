import { CAR_BODY } from "../car/body.ts";
import type { Ground } from "../car/grip.ts";
import type { CarSpec } from "../car/specs.ts";

// The bicycles' numbers (docs/plan/101-the-bicycles.md): four bodies — a town bike, a BMX, a mountain bike, a road
// racer — each a car kind (so the wire, owning, parking, homes and the server's seats are the cars'), with what
// makes it a bicycle in `bike`. The rider's in the mass and the centre of gravity: a bicycle is mostly its rider.
//
// Units and axes as the cars': metres, kg, s, N; the bike's own x forward, y up, z to its right, from the centre of
// gravity (the rider sat on it).

export type BikeKind = "bike_town" | "bike_bmx" | "bike_mtb" | "bike_road";
export const BIKE_KINDS: readonly BikeKind[] = ["bike_town", "bike_bmx", "bike_mtb", "bike_road"];
export const isBikeKind = (k: unknown): k is BikeKind => typeof k === "string" && k.startsWith("bike_");

/** A tyre's tread: how it takes each ground (× the car tyre's grip there, grip.ts). */
export type Tread = "city" | "bmx" | "knobbly" | "slick" | "studded";

export interface BikeSpec {
  /** the speed the rider holds pedalling (W) and sprinting (Shift + W), m/s on the flat — arcade: quicker than a run
   *  (8.2 m/s), slower than a car */
  cruise: number;
  sprint: number;
  /** the most the rider pushes it along (N, at a stand: how quick it gets going), and how soon it's at speed (s) */
  force: number;
  tau: number;
  /** each gear's development: metres it goes for a turn of the cranks, low to high (one: a single speed) */
  gears: number[];
  /** the cranks' length (m) */
  crank: number;
  /** the brakes' most (N·m at the wheel): the front (the strong one), the back */
  brakes: [number, number];
  /** how far it leans into a turn at most (rad), its fork's tilt back from upright (rad) */
  maxLean: number;
  caster: number;
  /** the hop: how fast up at a full charge (m/s), how long the charge takes (s) */
  hop: number;
  hopCharge: number;
  /** how well it takes tricks, 0..1 (the BMX 1): the wheelie's and the air's control, the tricks' speed */
  trick: number;
  /** each wheel's radius and width (front, back), m */
  wheels: [[number, number], [number, number]];
  /** its tread */
  tread: Tread;
  /** the rider's share of the mass (kg) */
  rider: number;
  /** sat upright (the town bike), crouched over the bars (the road racer): how far forward the rider bends, 0..1 */
  bend: number;
}

const G = 9.81;

/** A bicycle's car spec from its few numbers. */
function bike(
  kind: BikeKind,
  o: {
    bikeKg: number;
    wheelbase: number;
    front: number; // the centre of gravity behind the front axle (m)
    cog: number;
    width: number; // its bars
    height: number; // its rider's head, sat
    cda: number;
    b: BikeSpec;
  },
): CarSpec {
  const mass = o.bikeKg + o.b.rider;
  const [[rf, wf]] = o.b.wheels;
  const k = (mass * G * 0.5) / 0.03; // (a tyre's own give, ~3 cm: no suspension)
  return {
    kind: kind as CarSpec["kind"],
    mass,
    // (a tall thin box: the rider on the bike — roll and pitch about the hips, yaw about the upright)
    inertia: [
      (mass / 12) * (o.height ** 2 + o.width ** 2) * 0.55,
      (mass / 12) * ((o.wheelbase + 2 * rf) ** 2 + o.width ** 2),
      (mass / 12) * ((o.wheelbase + 2 * rf) ** 2 + o.height ** 2) * 0.8,
    ],
    cog: o.cog,
    wheelbase: o.wheelbase,
    front: o.front,
    track: 0,
    clearance: 0.26,
    body: CAR_BODY[kind],
    wheel: { r: rf, width: wf, inertia: 0.09 },
    axles: [
      { k, bump: 900, rebound: 1100, travel: 0.03, droop: 0.02, arb: 0, roll: 0, brake: o.b.brakes[0] },
      { k, bump: 900, rebound: 1100, travel: 0.03, droop: 0.02, arb: 0, roll: 0, brake: o.b.brakes[1] },
    ],
    hand: o.b.brakes[1],
    steer: { max: 0.62, ratio: 1 },
    // (no engine: the rider's legs — drive.ts BikeDrive; these are only what a car's code reads)
    engine: {
      idle: 1,
      limit: 160,
      redline: 150,
      inertia: 0.05,
      curve: [
        [0, 1],
        [160, 1],
      ],
      drag: [0, 0],
    },
    gears: [-1, 0, ...o.b.gears],
    final: 1,
    efficiency: 1,
    shift: 0.2,
    clutch: 20,
    drive: "rear",
    pushed: true,
    aero: { cda: o.cda },
    fuel: { litres: 1, perKm: 0 },
    bike: o.b,
  };
}

/** The town bike: a step-through roadster, sat bolt upright, heavy, a dynamo lamp, three hub gears. */
export const BIKE_TOWN = bike("bike_town", {
  bikeKg: 19,
  wheelbase: 1.12,
  front: 0.68,
  cog: 1.02,
  width: 0.62,
  height: 1.62,
  cda: 0.62,
  b: {
    cruise: 8.3,
    sprint: 11.4,
    force: 340,
    tau: 2.6,
    gears: [4.2, 5.4, 7.0],
    crank: 0.17,
    brakes: [150, 90],
    maxLean: 0.72,
    caster: 0.38,
    hop: 2.5,
    hopCharge: 0.45,
    trick: 0.3,
    wheels: [
      [0.345, 0.04],
      [0.345, 0.04],
    ],
    tread: "city",
    rider: 75,
    bend: 0.1,
  },
});

/** The BMX: 20" wheels, one gear, low and quick to throw about: the hop and the tricks. */
export const BIKE_BMX = bike("bike_bmx", {
  bikeKg: 11,
  wheelbase: 0.98,
  front: 0.56,
  cog: 0.92,
  width: 0.7,
  height: 1.5,
  cda: 0.56,
  b: {
    cruise: 8.0,
    sprint: 11.6,
    force: 400,
    tau: 2.0,
    gears: [4.5],
    crank: 0.175,
    brakes: [110, 110],
    maxLean: 0.85,
    caster: 0.28,
    hop: 4.4,
    hopCharge: 0.4,
    trick: 1,
    wheels: [
      [0.255, 0.052],
      [0.255, 0.052],
    ],
    tread: "bmx",
    rider: 75,
    bend: 0.45,
  },
});

/** The mountain bike: a 1990 rigid steel one, knobbly tyres, eighteen gears (six here). */
export const BIKE_MTB = bike("bike_mtb", {
  bikeKg: 13.5,
  wheelbase: 1.07,
  front: 0.64,
  cog: 1.0,
  width: 0.62,
  height: 1.58,
  cda: 0.52,
  b: {
    cruise: 8.9,
    sprint: 12.8,
    force: 400,
    tau: 2.2,
    gears: [2.4, 3.3, 4.3, 5.4, 6.6, 7.8],
    crank: 0.17,
    brakes: [150, 110],
    maxLean: 0.85,
    caster: 0.33,
    hop: 3.3,
    hopCharge: 0.42,
    trick: 0.6,
    wheels: [
      [0.33, 0.054],
      [0.33, 0.054],
    ],
    tread: "knobbly",
    rider: 75,
    bend: 0.35,
  },
});

/** The road racer: drop bars, skinny tyres, the fastest on a cleared road and the worst on snow. */
export const BIKE_ROAD = bike("bike_road", {
  bikeKg: 10,
  wheelbase: 1.0,
  front: 0.58,
  cog: 0.98,
  width: 0.44,
  height: 1.48,
  cda: 0.38,
  b: {
    cruise: 10.6,
    sprint: 15.5,
    force: 380,
    tau: 2.4,
    gears: [3.4, 4.3, 5.2, 6.1, 7.0, 7.9, 8.8],
    crank: 0.17,
    brakes: [140, 100],
    maxLean: 0.9,
    caster: 0.29,
    hop: 2.6,
    hopCharge: 0.45,
    trick: 0.3,
    wheels: [
      [0.336, 0.025],
      [0.336, 0.025],
    ],
    tread: "slick",
    rider: 75,
    bend: 0.75,
  },
});

export const BIKE_SPECS: Record<BikeKind, CarSpec> = {
  bike_town: BIKE_TOWN,
  bike_bmx: BIKE_BMX,
  bike_mtb: BIKE_MTB,
  bike_road: BIKE_ROAD,
};

/** Where its rider sits (the cars' SEATS_OF shape): the saddle from the centre of gravity, the hip's height; off
 *  to its left (the side one gets on by), else its right, else behind. */
export const BIKE_SEATS: Record<BikeKind, { at: [number, number][]; hip: number[]; out: [number, number][][] }> = {
  bike_town: {
    at: [[-0.2, 0]],
    hip: [0.94],
    out: [
      [
        [-0.1, -0.75],
        [-0.1, 0.75],
        [-1.5, 0],
      ],
    ],
  },
  bike_bmx: {
    at: [[-0.2, 0]],
    hip: [0.78],
    out: [
      [
        [-0.1, -0.75],
        [-0.1, 0.75],
        [-1.4, 0],
      ],
    ],
  },
  bike_mtb: {
    at: [[-0.22, 0]],
    hip: [0.96],
    out: [
      [
        [-0.1, -0.75],
        [-0.1, 0.75],
        [-1.5, 0],
      ],
    ],
  },
  bike_road: {
    at: [[-0.24, 0]],
    hip: [0.97],
    out: [
      [
        [-0.1, -0.7],
        [-0.1, 0.7],
        [-1.45, 0],
      ],
    ],
  },
};

/** A tread's take on a ground: its peak friction × this, its rolling and ploughing × these, how deep it sinks ×. */
export const TREAD: Record<
  Tread,
  Partial<Record<Ground, [number, number, number, number]>> & { all: [number, number, number, number] }
> = {
  // [mu ×, crr ×, plough ×, sink ×]
  city: { all: [1, 0.45, 1, 1], snow: [0.85, 0.5, 1, 1], deep: [0.8, 0.5, 1.1, 1.1], ice: [0.9, 0.5, 1, 1] },
  bmx: { all: [1, 0.5, 1, 1], earth: [1.1, 0.5, 1, 1], path: [1.05, 0.5, 1, 1] },
  knobbly: {
    all: [1, 0.6, 1, 1],
    asphalt: [0.95, 0.65, 1, 1],
    snow: [1.2, 0.55, 0.9, 0.9],
    deep: [1.25, 0.55, 0.85, 0.85],
    path: [1.12, 0.55, 1, 1],
    mud: [1.4, 0.6, 1, 1],
    grass: [1.2, 0.6, 1, 1],
    earth: [1.15, 0.6, 1, 1],
  },
  slick: {
    all: [1, 0.3, 1, 1],
    wet: [0.9, 0.3, 1, 1],
    slush: [0.7, 0.4, 1.4, 1.3],
    path: [0.75, 0.4, 1.3, 1.3],
    snow: [0.6, 0.4, 1.6, 1.5],
    deep: [0.5, 0.4, 1.9, 1.6],
    grass: [0.7, 0.4, 1, 1.3],
    mud: [0.5, 0.4, 1.2, 1.4],
    ice: [0.8, 0.3, 1, 1],
    blackice: [0.8, 0.3, 1, 1],
  },
  studded: {
    all: [1, 0.65, 1, 1],
    asphalt: [0.9, 0.7, 1, 1],
    snow: [1.25, 0.6, 0.9, 0.9],
    deep: [1.25, 0.6, 0.85, 0.85],
    path: [1.2, 0.6, 1, 1],
    ice: [4, 0.6, 1, 1],
    blackice: [3.4, 0.6, 1, 1],
    slush: [1.2, 0.6, 1, 1],
  },
};

/** Its tread's numbers on a ground. */
export const treadOn = (t: Tread, g: Ground): [number, number, number, number] => TREAD[t][g] ?? TREAD[t].all;

/** A tread's pace on a ground: × the speed the rider holds (the legs can't push it through deep snow as on a road). */
const PACE: Record<Tread, Partial<Record<Ground, number>>> = {
  city: { snow: 0.7, deep: 0.33, path: 0.85, slush: 0.8, mud: 0.5, grass: 0.75, earth: 0.9, rock: 0.85 },
  bmx: { snow: 0.7, deep: 0.35, path: 0.9, slush: 0.8, mud: 0.55, grass: 0.8, earth: 0.95, rock: 0.85 },
  knobbly: { snow: 0.85, deep: 0.6, path: 0.95, slush: 0.9, mud: 0.7, grass: 0.9, rock: 0.9 },
  slick: { snow: 0.45, deep: 0.18, path: 0.7, slush: 0.6, mud: 0.3, grass: 0.6, earth: 0.75, rock: 0.75 },
  studded: { snow: 0.88, deep: 0.62, path: 0.95, slush: 0.9, mud: 0.7, grass: 0.9, rock: 0.9 },
};
export const paceOn = (t: Tread, g: Ground): number => PACE[t][g] ?? 1;

/** The twelve: three of each body (a model each — tools/art/bikes → public/life/bikes/<variant>.glb), and what each
 *  has that changes how it rides or what it does: studded tyres, a fixed gear, a gyro under the bars (a barspin all
 *  the way round), its lamp. */
export interface BikeVariant {
  kind: BikeKind;
  lamp: "dynamo" | "battery" | "none";
  studs?: boolean;
  fixed?: boolean;
  gyro?: boolean;
  pegs?: boolean;
}
export const BIKE_VARIANTS: Record<string, BikeVariant> = {
  "town-classic": { kind: "bike_town", lamp: "dynamo" },
  "town-step": { kind: "bike_town", lamp: "dynamo" },
  "town-post": { kind: "bike_town", lamp: "dynamo" },
  "bmx-free": { kind: "bike_bmx", lamp: "none", gyro: true, pegs: true },
  "bmx-race": { kind: "bike_bmx", lamp: "none" },
  "bmx-street": { kind: "bike_bmx", lamp: "none", pegs: true },
  "mtb-trail": { kind: "bike_mtb", lamp: "none" },
  "mtb-winter": { kind: "bike_mtb", lamp: "battery", studs: true },
  "mtb-tour": { kind: "bike_mtb", lamp: "battery" },
  "road-race": { kind: "bike_road", lamp: "none" },
  "road-tour": { kind: "bike_road", lamp: "battery" },
  "road-fixed": { kind: "bike_road", lamp: "none", fixed: true },
};
/** A body's variants, the plainest first. */
export const bikeVariantsOf = (kind: BikeKind): string[] =>
  Object.keys(BIKE_VARIANTS).filter((v) => BIKE_VARIANTS[v].kind === kind);

/** The bikes' paint: the period's — black, the roadster's greens and creams, the racer's red and blue, the BMX's
 *  brights. */
export const BIKE_PALETTE: number[] = [
  0x17191c, // black
  0x2f4a3b, // bottle green
  0xe8dcc0, // cream
  0x8e1c1c, // red
  0x22385e, // navy
  0x9aa3a8, // silver
  0x5d6b3a, // olive
  0xc9a227, // mustard
  0x00a8c6, // BMX cyan
  0xe0287a, // magenta
  0xb5d300, // lime
  0xf06a12, // orange
  0xf2f2ee, // white
];
