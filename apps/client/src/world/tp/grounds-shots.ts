import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import { groundAt, LAMPS, MOTORS, WAYS } from "@yutopia/shared/grounds";
import { bayById, bayLabel, boardOf, type LotBay, lotLayout } from "@yutopia/shared/lot";
import type * as THREE_NS from "three";
import { loadPets } from "../art/pets-load";
import type { CarIn } from "./car/stage";
import {
  BENCH_TOP,
  chaseOf,
  KART_BOWL,
  KART_CARPARK,
  KART_DESK,
  KART_GATE,
  KART_PADDOCK,
  KART_PARK,
  KART_RACK,
  KART_SIGN,
  KART_STANDS,
  KART_TURN,
  lapHeading,
  nearLap,
  onLap,
  turnOf,
} from "./kart/shots";
import type { KartScene } from "./karts3d";
import type { PetIn } from "./pet-stage";
import * as S3 from "./spot3d";

export { drawSitePlan } from "../grounds-plan";
export { drawParkOnSitePlan, drawParkPlan } from "../kart-plan";
export { drawLotPlans } from "../lot-plan";

// The Grounds' stills — phase 0's mocks (docs/plan/27-the-grounds.md): each
// one a spot on the Grounds at an hour, built by the prototype (grounds3d.ts)
// round it, with the game's own 3D people. /dev/grounds?shot=<name>.

type THREE = typeof THREE_NS;
type Hour = "day" | "overcast" | "dusk" | "night" | "blizzard" | "pitch";
type V3 = [number, number, number];

interface Who {
  x: number;
  z: number;
  /** facing: a point they look towards */
  to: [number, number];
  a: AvatarLayers;
  walk?: number; // a stride's phase (frames walked); none: standing
  light?: boolean; // the phone's flashlight on, in the right hand
  push?: boolean; // leaning on something ahead with both hands (a stuck car's boot)
  sit?: number; // sitting: the seat's height
  y?: number; // standing on something
  me?: boolean; // the one you play: always drawn faintly in the dark (docs/plan/44-the-night.md)
}
interface Shot {
  hour: Hour;
  cam: V3;
  look: V3;
  fov?: number;
  iso?: number; // orthographic: half the view's height in tiles
  radius?: number;
  people: Who[];
  snow?: number; // flakes
  prints?: [number, number][]; // footprints along this line
  inside?: "east-block";
  cars?: CarIn[]; // the sedan (docs/plan/28-the-car.md)
  storm?: boolean; // a blizzard after dark
  near?: number; // the camera's near plane
  /** claimed bays (docs/plan/43-the-spot.md): [bay id, the name on its board] */
  boards?: [string, string][];
  /** MOTORS' forecourt on Main Street, its vehicles on show */
  motors?: boolean;
  /** the pitch dark (docs/plan/44-the-night.md): how adjusted your eyes are, 0..1 */
  eyes?: number;
  /** the fog thinned (an aerial view): its density × this */
  haze?: number;
  /** the Kart Park (docs/plan/46-the-karts.md): its karts, what flies about; the park is drawn
   *  with them (the new land must be on: /dev/karts) */
  karts?: KartScene;
  /** pets on the Grounds (docs/plan/51-the-pet.md); in a car: its `pets` */
  pets?: PetIn[];
}

const DARK = "#2b3138";
const A = (o: Partial<AvatarLayers>): AvatarLayers => ({
  ...DEFAULT_AVATAR,
  shoes: "boots",
  shoesColor: "#3a2c22",
  ...o,
});
const ANA = A({
  top: "jacket",
  topColor: "#6b2430",
  bottom: "jeans",
  hair: "long",
  hairColor: "#3b2a20",
  accessory: "beanie",
  accessoryColor: "#d8d2c4",
  extra: "scarf",
  extraColor: "#e8a33d",
  gender: "feminine",
  skin: "#e4b48e",
});
const BIA = A({
  top: "jacket",
  topColor: "#2f4a3b",
  bottom: "trousers",
  bottomColor: DARK,
  hair: "curly",
  hairColor: "#1c1410",
  skin: "#a8693f",
  gender: "feminine",
  extra: "scarf",
  extraColor: "#b5562f",
});
const CAI = A({
  top: "jacket",
  topColor: "#3d4a5c",
  bottom: "jeans",
  hair: "short",
  hairColor: "#6b4128",
  skin: "#f3d2b3",
  accessory: "beanie",
  accessoryColor: "#2a2420",
  gender: "masculine",
  beard: "stubble",
});
const DUDA = A({
  top: "hoodie",
  topColor: "#8b8f93",
  bottom: "joggers",
  bottomColor: "#2a2e33",
  hair: "bun",
  hairColor: "#a8692f",
  skin: "#c68a5e",
  gender: "feminine",
  extra: "backpack",
  extraColor: "#4a5a73",
});
const GUARD = A({
  top: "blazer",
  topColor: "#20262c",
  bottom: "trousers",
  bottomColor: "#20262c",
  hair: "crew",
  hairColor: "#e8e0d0",
  skin: "#e4b48e",
  gender: "masculine",
  accessory: "cap",
  accessoryColor: "#20262c",
});

/** A point along a way, near `z` (or x), its heading, and a spot behind it. */
function on(key: string, near: [number, number], back = 0, side = 0) {
  const w = WAYS.find((u) => u.key === key);
  if (!w) throw new Error(key);
  let bi = 0;
  let bd = Number.POSITIVE_INFINITY;
  w.line.forEach(([x, z], i) => {
    const d = Math.hypot(x - near[0], z - near[1]);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  const [x, z] = w.line[bi];
  const [x2, z2] = w.line[Math.min(w.line.length - 1, bi + 3)];
  const l = Math.hypot(x2 - x, z2 - z) || 1;
  const tx = (x2 - x) / l;
  const tz = (z2 - z) / l;
  const bx = w.line[Math.max(0, bi - back)][0] - tz * side;
  const bz = w.line[Math.max(0, bi - back)][1] + tx * side;
  return { x, z, tx, tz, bx, bz, ahead: (n: number) => w.line[Math.min(w.line.length - 1, bi + n)] };
}
const gy = (x: number, z: number) => groundAt(x, z);

export function shots(): Record<string, Shot> {
  const lamp = LAMPS.filter((l) => l.kind === "cobra").sort(
    (a, b) => Math.hypot(a.x + 64, a.z + 222) - Math.hypot(b.x + 64, b.z + 222),
  )[0];
  const d = on("driveway", [lamp.x, lamp.z], 16, 1.0);
  const r = on("ravine", [-262.6, -204], 15, 0);
  return {
    // god mode's camera (docs/plan/53-the-god-mode.md, the mocks): anywhere from overhead, aimed
    // with &cam=x,y,z&look=x,y,z (the y's over the ground there) and &fov= &radius= &haze=
    god: {
      hour: "day",
      cam: [418, 90, -300],
      look: [418, 0, -400],
      fov: 50,
      radius: 440,
      haze: 0.3,
      people: [],
      snow: 0,
    },
    "driveway-night": {
      hour: "night",
      cam: [d.bx, gy(d.bx, d.bz) + 2.3, d.bz],
      look: [d.ahead(26)[0], gy(d.x, d.z) + 3.2, d.ahead(26)[1]],
      fov: 52,
      people: [{ x: d.x + 0.6, z: d.z, to: d.ahead(10), a: ANA, walk: 23 }],
      snow: 9000,
    },
    "gatehouse-dusk": {
      hour: "dusk",
      cam: [-46, gy(-46, -334) + 1.9, -334],
      look: [-36, gy(-36, -362) + 2.6, -363],
      fov: 46,
      people: [
        { x: -31.5, z: -364, to: [-40, -364], a: GUARD, y: gy(-31.5, -364) },
        { x: -38.6, z: -352, to: [-35, -364], a: CAI, walk: 11 },
      ],
      snow: 5000,
    },
    "pond-day": {
      hour: "overcast",
      cam: [-198, gy(-198, -36) + 3.4, -36],
      look: [-250, POND_Y() + 2.6, -98],
      fov: 46,
      people: [
        { x: -219, z: -55, to: [-250, -80], a: BIA, walk: 7 },
        { x: -252, z: -86.5, to: [-232, -60], a: DUDA, y: POND_Y() + 0.62 },
      ],
      snow: 1500,
    },
    "woods-flashlight": {
      hour: "night",
      cam: [r.bx, gy(r.bx, r.bz) + 2.7, r.bz],
      look: [r.ahead(30)[0], gy(r.x, r.z) + 0.9, r.ahead(30)[1]],
      fov: 46,
      people: [
        { x: r.x, z: r.z, to: r.ahead(10), a: CAI, walk: 17, light: true },
        { x: r.ahead(56)[0], z: r.ahead(56)[1], to: r.ahead(30), a: DUDA, walk: 5, light: true },
      ],
      snow: 7000,
      prints: [
        [r.x, r.z],
        [r.bx, r.bz],
        [r.ahead(-14)[0], r.ahead(-14)[1]],
      ],
    },
    "courtyard-day": {
      hour: "day",
      cam: [55.5, 1.75, 45],
      look: [53.5, 6.2, 8],
      fov: 52,
      people: [
        { x: 52.5, z: 19.8, to: [60, 18], a: BIA, walk: 9 },
        { x: 58.3, z: 18.4, to: [62, 18], a: CAI, walk: 21 },
        { x: 55.6, z: 30, to: [55, 40], a: ANA, walk: 3 },
      ],
      snow: 1200,
    },
    "block-inside": {
      hour: "overcast",
      cam: [82, 1.6, 30.2],
      look: [60, 1.4, 27.6],
      fov: 58,
      inside: "east-block",
      people: [{ x: 61.3, z: 28.6, to: [55, 28.2], a: DUDA }],
      snow: 0,
    },
    "town-dusk": {
      hour: "dusk",
      cam: [362, gy(362, -406.5) + 2.3, -406.5],
      look: [440, gy(440, -402) + 3.2, -400.5],
      fov: 52,
      people: [
        { x: 386, z: -399.6, to: [400, -399], a: BIA, walk: 13 },
        { x: 452, z: -399.8, to: [455, -397], a: CAI },
        { x: 410, z: -411.7, to: [380, -412], a: ANA, walk: 4 },
        { x: 420, z: -392, to: [420, -386], a: DUDA },
      ],
      snow: 6000,
    },
    // (docs/plan/30-the-dark.md phase 2: searching a parked car's glove box)
    "town-glovebox": {
      hour: "night",
      cam: [376.6, gy(376.6, -403.6) + 2.0, -403.6],
      look: [380.6, gy(380.6, -408.4) + 0.7, -408.4],
      fov: 50,
      people: [
        { x: 379.2, z: -406.8, to: [379.6, -408.6], a: ANA },
        { x: 386.5, z: -403.2, to: [395, -399], a: BIA, walk: 6 },
      ],
      snow: 3000,
    },
    // (docs/plan/31-the-day.md: the farm — over it by day, the barn's doors, between the rows)
    "farm-day": {
      hour: "day",
      cam: [392, gy(392, -350) + 26, -350],
      look: [432, gy(432, -280), -280],
      fov: 55,
      people: [{ x: 433, z: -318, to: [437, -311], a: ANA, walk: 4 }],
      snow: 1500,
    },
    "farm-barn": {
      hour: "day",
      cam: [426, gy(426, -312) + 2.2, -306],
      look: [440, gy(440, -311) + 2, -312],
      fov: 55,
      people: [{ x: 434, z: -309, to: [440, -311], a: ANA }],
      snow: 1500,
    },
    "farm-corn": {
      hour: "day",
      cam: [377, gy(377, -300) + 1.7, -300],
      look: [377, gy(377, -270) + 1.2, -270],
      fov: 55,
      people: [{ x: 377.4, z: -292, to: [377.4, -280], a: BIA, walk: 3 }],
      snow: 1500,
    },
    "blizzard-lawn": {
      hour: "blizzard",
      cam: [-4, gy(-4, -52) + 2.2, -52],
      look: [-32, 14, -96],
      fov: 50,
      people: [{ x: -11.5, z: -62, to: [-30, -95], a: ANA, walk: 15 }],
      snow: 40000,
      prints: [
        [-11.5, -62],
        [-6, -50],
        [-2, -36],
      ],
    },
    "clearing-night": {
      hour: "night",
      cam: [121.5, gy(121.5, -237.5) + 1.9, -237.5],
      look: [120, gy(120, -250) + 1.7, -251],
      fov: 44,
      people: [{ x: 120.35, z: -249.72, to: [120.35, -240], a: GUARD, sit: 0.56 }],
      snow: 5000,
    },
    ...carShots(lamp),
    ...nightShots(lamp),
    ...lotShots(),
    ...spotShots(),
    ...petShots(lamp),
    ...kartShots(),
    "iso-lot-edge": {
      hour: "day",
      cam: [0, 0, 0],
      look: [-104, 0, 8],
      iso: 28,
      people: [
        { x: -103, z: 13.2, to: [-130, 5], a: ANA, walk: 9 },
        { x: -66, z: 18.4, to: [-90, 15], a: DUDA, walk: 4 },
        { x: -53, z: 22.4, to: [-60, 22], a: CAI, walk: 19 },
        { x: -40, z: 6.3, to: [-35, 6.3], a: BIA },
      ],
      snow: 0,
    },
  };
}
// ── the Kart Park's stills (docs/plan/46-the-karts.md, phase 0): /dev/karts?shot=kart-… ──
const LU = A({
  top: "sweater",
  topColor: "#e8a33d",
  bottom: "jeans",
  hair: "bob",
  hairColor: "#c25a2c",
  skin: "#f3d2b3",
  gender: "feminine",
});
const TOMAS = A({
  top: "jacket",
  topColor: "#20262c",
  bottom: "trousers",
  bottomColor: "#3a2c22",
  hair: "afro",
  hairColor: "#1c1410",
  skin: "#7a4a2a",
  gender: "masculine",
  beard: "full",
});
function kartShots(): Record<string, Shot> {
  // (read late: the park's layout from shared, the land on before it: /dev/karts)
  const B = KART_BOWL;
  const D = KART_DESK;
  const R = KART_RACK;
  const G = KART_GATE;
  const C0 = KART_PARK;
  const f = D.face; // (the desk's customers' side: the rack's open side, east or west)
  // (on the road in, ~36 m short of the gate)
  const roadIn = WAYS.find((w) => w.key === "kart-road")?.line ?? [[G.x, G.z + 36]];
  const gateCam = roadIn[Math.max(0, roadIn.length - 37)];
  const tr = turnOf(733); // (the last corner's way: the drifts lean into it)
  // (which side of the start straight the stands are: +1 its left; the close-up keeps them behind)
  const st = Math.sign((KART_STANDS[0].z - onLap(0)[2]) * -Math.cos(lapHeading(0)));
  const bowlY = gy(B.x, B.z);
  const race = chaseOf(733, -0.8, 5.6, 2.1, 14);
  const grid0 = onLap(-2.2, 2.6);
  return {
    // Ana in her kart on the grid, close: the kart and its driver, Bia's behind
    "kart-close": {
      hour: "day",
      cam: nearLap(-2.2, 3.4, 2.6 - 2.6 * st, 1.25),
      look: nearLap(-2.2, -0.1, 2.6, 0.62),
      fov: 38,
      radius: 200,
      people: [{ ...xz(nearLap(-2.2, -2.5, 2.6 + 4.6 * st)), to: [grid0[0], grid0[2]], a: CAI }],
      snow: 0,
      karts: {
        karts: [
          { s: -2.2, off: 2.6, colour: "#b5562f", number: 1, driver: ANA, steer: 0.18 },
          { s: -5.7, off: -2.6, colour: "#2f4a3b", trim: "#e8a33d", number: 2, driver: BIA },
          { s: -9.2, off: 2.6, colour: "#3d4a5c", number: 3, driver: DUDA },
        ],
        crowd: 0.7,
        lap: "1/3",
      },
    },
    // a review sheet of the kart: three-quarter front, close, by day (docs/plan/46: the model's quality pass)
    "kart-model": {
      hour: "day",
      cam: nearLap(-2.2, 2.6, 2.6 - 2.1, 1.0),
      look: nearLap(-2.2, 0, 2.6, 0.45),
      fov: 32,
      radius: 160,
      people: [],
      snow: 0,
      karts: { karts: [{ s: -2.2, off: 2.6, colour: "#b5562f", number: 1, driver: ANA, steer: 0.25 }], crowd: 0.5 },
    },
    "kart-model-back": {
      hour: "day",
      cam: nearLap(-2.2, -2.8, 2.6 + 1.6, 1.3),
      look: nearLap(-2.2, 0, 2.6, 0.5),
      fov: 32,
      radius: 160,
      people: [],
      snow: 0,
      karts: {
        karts: [
          { s: -2.2, off: 2.6, colour: "#2f4a3b", trim: "#e8a33d", number: 2, driver: BIA, sparks: 3, boost: true },
        ],
        crowd: 0.5,
      },
    },
    // the grid from behind the back row: the gantry's lights (the stills' are off: the game lights them)
    "kart-gantry": {
      hour: "dusk",
      cam: nearLap(-16, 0, 1.2, 2.2),
      look: nearLap(2, 0, 0, 4.4),
      fov: 55,
      radius: 220,
      people: [],
      snow: 0,
      karts: {
        karts: [
          { s: -2.2, off: 2.6, colour: "#b5562f", number: 1, driver: ANA },
          { s: -5.7, off: -2.6, colour: "#2f4a3b", trim: "#e8a33d", number: 2, driver: BIA },
          { s: -9.2, off: 2.6, colour: "#3d4a5c", number: 3, driver: DUDA },
        ],
        crowd: 0.8,
        gantry: 4,
      },
    },
    // the paddock: the rack of karts in its shed, the lobby's desk and race control behind it
    "kart-rack": {
      hour: "day",
      cam: [D.x + 7 * f, gy(D.x + 7 * f, D.z + 12) + 1.8, D.z + 12],
      look: [R.x + 2 * f, gy(R.x, R.z0 + 2) + 0.9, R.z0 + 2],
      fov: 50,
      radius: 220,
      people: [
        { x: D.x - 1.3 * f, z: D.z - 0.5, to: [D.x + 5 * f, D.z + 2], a: CAI },
        { x: D.x + 2.4 * f, z: D.z + 1.8, to: [D.x - 0.4 * f, D.z], a: ANA },
        { x: R.x + 2.8 * f, z: R.z0 + 8.7, to: [R.x, R.z0 + 8.7], a: DUDA },
      ],
      snow: 0,
      karts: { karts: [], rack: true, crowd: 0.4 },
    },
    // the race, from behind Ana: into the last corner in a purple drift, a snowball off at Bia, the
    // stands, the tower and the bridge ahead
    "kart-race": {
      hour: "day",
      cam: race.cam,
      look: race.look,
      fov: 60,
      radius: 260,
      people: [],
      snow: 0,
      karts: {
        karts: [
          {
            s: 733,
            off: -0.8,
            colour: "#b5562f",
            number: 1,
            driver: ANA,
            yaw: 0.42 * tr,
            steer: -0.38 * tr,
            roll: -0.07 * tr,
            sparks: 3,
            skid: 14,
          },
          {
            s: 745,
            off: 2.2,
            colour: "#2f4a3b",
            trim: "#e8a33d",
            number: 2,
            driver: BIA,
            yaw: 0.22 * tr,
            steer: -0.2 * tr,
            sparks: 1,
          },
          { s: 757, off: -2.2, colour: "#3d4a5c", number: 3, driver: CAI, boost: true },
          { s: 772, off: 1.5, colour: "#e8a33d", trim: "#2a2018", number: 5, driver: LU, dizzy: true, yaw: 1.9 },
          { s: 786, off: -3, colour: "#20262c", trim: "#e8a33d", number: 8, driver: TOMAS },
        ],
        fx: [
          { kind: "snowball", ...xyz(onLap(739, 0.6, 0.55)), a: lapHeading(739), trail: 3.4 },
          { kind: "ice", ...xz(onLap(764, 2.8)), r: 1.5 },
        ],
        crowd: 0.8,
        order: ["TOMÁS", "LU", "CAI", "BIA", "ANA", "DUDA", "VORTEX", "RAFA"],
      },
    },
    // the bowl mid-battle, from up on its terrace
    "kart-battle": {
      hour: "day",
      cam: [B.x - 15, bowlY + 9.5, B.z + 18],
      look: [B.x + 2.5, bowlY + 0.5, B.z - 3],
      fov: 56,
      radius: 220,
      people: [
        { x: B.x - 20.5, z: B.z + 19.5, y: bowlY + 3.2, to: [B.x, B.z], a: TOMAS },
        { x: B.x - 26.5, z: B.z + 4, y: bowlY + 3.2, to: [B.x, B.z], a: GUARD },
        { x: B.x + 6, z: B.z + 28, y: bowlY + 3.2, to: [B.x, B.z], a: DUDA },
      ],
      snow: 0,
      karts: {
        karts: [
          { x: B.x - 6, z: B.z + 6, a: -0.65, colour: "#b5562f", number: 1, driver: ANA, steer: 0.1 },
          {
            x: B.x + 3.5,
            z: B.z - 1.5,
            a: 2.2,
            colour: "#2f4a3b",
            trim: "#e8a33d",
            number: 2,
            driver: BIA,
            dizzy: true,
          },
          { x: B.x - 6, z: B.z - 8, a: 0.3, colour: "#3d4a5c", number: 3, driver: CAI, umbrella: true },
          {
            x: B.x + 17.6,
            z: B.z - 8.5,
            y: 0.9,
            a: Math.PI / 2 + 0.7,
            roll: -0.7,
            colour: "#e8a33d",
            trim: "#2a2018",
            number: 5,
            driver: LU,
            boost: true,
          },
          {
            x: B.x + 9,
            z: B.z + 6.5,
            y: 1.6,
            a: 2.6,
            roll: 1.2,
            pitch: 0.6,
            colour: "#20262c",
            trim: "#e8a33d",
            number: 8,
            driver: TOMAS,
          },
        ],
        fx: [
          { kind: "staples", x: B.x - 4.2, y: bowlY + 0.6, z: B.z + 4.6, a: -0.65, n: 6 },
          { kind: "smash", x: B.x + 9, z: B.z + 6.5, colour: "#20262c" },
          { kind: "blast", x: B.x + 8.5, z: B.z + 6, r: 3 },
          { kind: "drone", x: B.x - 9.5, y: bowlY + 2.4, z: B.z - 3, a: -0.9 },
          { kind: "ice", x: B.x + 2, z: B.z + 10, r: 1.7 },
          { kind: "fax", x: B.x - 12, z: B.z + 1, a: 0.4 },
          { kind: "boxes", x: B.x, z: B.z, n: 10, r: B.floor },
        ],
        crowd: 0.4,
      },
    },
    // the whole park from over the fields, its south-west corner
    "kart-park": {
      hour: "day",
      cam: [C0.x + 138, 70, C0.z + 142],
      look: [C0.x + 8, 2, C0.z + 2],
      fov: 52,
      radius: 420,
      haze: 0.3,
      people: [],
      snow: 0,
      karts: {
        karts: [
          { s: 40, off: 1.5, colour: "#b5562f", number: 1, driver: ANA },
          { s: 52, off: -2, colour: "#2f4a3b", number: 2, driver: BIA },
          { s: 300, off: 0, colour: "#3d4a5c", number: 3, driver: CAI },
          { s: 520, off: 1, colour: "#e8a33d", number: 5, driver: LU },
        ],
        rack: true,
        crowd: 0.7,
      },
    },
    // a night race: down the floodlit start straight, the bridge ahead, the stands lit
    "kart-night": {
      hour: "night",
      cam: onLap(-17, 3.2, 1.7),
      look: onLap(22, -1.5, 1.6),
      fov: 58,
      radius: 240,
      people: [],
      snow: 0,
      karts: {
        karts: [
          { s: -9, off: 1.2, colour: "#b5562f", number: 1, driver: ANA, boost: true },
          { s: -1, off: -2.6, colour: "#e8a33d", trim: "#2a2018", number: 5, driver: LU },
          { s: 86, off: 2.2, colour: "#2f4a3b", trim: "#e8a33d", number: 2, driver: BIA },
          { s: 80, off: -2.2, colour: "#3d4a5c", number: 3, driver: CAI },
        ],
        crowd: 0.7,
        lap: "3/3",
      },
    },
    // arriving: on the Kart Park road at dusk, the gate's sign lit
    "kart-gate": {
      hour: "dusk",
      cam: [gateCam[0] - 1.5, gy(gateCam[0] - 1.5, gateCam[1]) + 1.7, gateCam[1]],
      look: [G.x + 1, gy(G.x, G.z) + 3.6, G.z - 4],
      fov: 55,
      radius: 260,
      people: [
        { x: G.x - 1, z: G.z + 13, to: [G.x - 1, G.z], a: ANA, walk: 12 },
        { x: G.x + 1.4, z: G.z + 11.4, to: [G.x + 1.4, G.z], a: BIA, walk: 30 },
      ],
      cars: [{ x: KART_CARPARK.x1 - 4, z: KART_CARPARK.z0 + 3.2, a: -Math.PI / 2, colour: 0x6b2430, snowy: 0.2 }],
      snow: 250,
      karts: { karts: [], crowd: 0.5 },
    },
    // the way in (docs/plan/46: "the way in"): the billboard on the county road's corner, from the
    // town's side over the bridge (its east face) and the campus's (its west face)
    "kart-sign": {
      hour: "day",
      cam: [266, gy(266, -404.5) + 1.5, -404.5],
      look: [KART_SIGN.x, gy(KART_SIGN.x, KART_SIGN.z) + 3.8, KART_SIGN.z - 3],
      fov: 50,
      radius: 220,
      people: [],
      cars: [{ x: 244, z: -402.4, a: Math.PI, colour: 0x2f4a3b, snowy: 0.2 }],
      snow: 0,
      karts: { karts: [] },
    },
    "kart-sign-west": {
      hour: "dusk",
      cam: [170, gy(170, -401.5) + 1.5, -401.5],
      look: [KART_SIGN.x, gy(KART_SIGN.x, KART_SIGN.z) + 3.8, KART_SIGN.z - 3],
      fov: 50,
      radius: 220,
      people: [{ x: KART_SIGN.fx - 1.5, z: KART_SIGN.fz + 1.2, to: [KART_SIGN.fx, KART_SIGN.fz - 4], a: BIA }],
      snow: 120,
      karts: { karts: [] },
    },
    // the car park, the turning circle and its kart on the plinth, the gate beyond
    "kart-carpark": {
      hour: "day",
      cam: [KART_TURN.x + 16, gy(KART_TURN.x, KART_TURN.z) + 9, KART_TURN.z + 22],
      look: [KART_CARPARK.x0 + 26, gy(KART_TURN.x, KART_TURN.z), KART_TURN.z - 4],
      fov: 55,
      radius: 220,
      people: [
        { x: KART_CARPARK.x1 - 8, z: KART_CARPARK.walk[0] + 1.2, to: [KART_GATE.x, KART_GATE.z], a: ANA, walk: 12 },
        { x: KART_CARPARK.x1 - 6.5, z: KART_CARPARK.walk[0] + 1.6, to: [KART_GATE.x, KART_GATE.z], a: CAI, walk: 30 },
      ],
      cars: [
        { x: KART_CARPARK.bx + 2.7 * 9.5, z: KART_CARPARK.z0 + 2.6, a: -Math.PI / 2, colour: 0x6b2430, snowy: 0.3 },
        { x: KART_CARPARK.bx + 2.7 * 5.5, z: KART_CARPARK.z1 - 2.6, a: Math.PI / 2, colour: 0x3d4a5c, snowy: 0.6 },
        { x: KART_CARPARK.bx + 2.7 * 2.5, z: KART_CARPARK.z0 + 2.6, a: -Math.PI / 2, colour: 0xcdbf9f, snowy: 0.8 },
      ],
      snow: 0,
      karts: { karts: [], rack: true },
    },
    // the paddock from the way in: the podium, the fire, the shed and its karts, race control
    "kart-paddock": {
      hour: "day",
      cam: [KART_PADDOCK.x1 - 1, gy(KART_PADDOCK.x1, KART_PADDOCK.z1) + 6.5, KART_PADDOCK.z1 + 6],
      look: [KART_RACK.x + 6, gy(KART_RACK.x, KART_RACK.z0) + 0.5, KART_RACK.z0 + 12],
      fov: 58,
      radius: 220,
      people: [
        { x: KART_GATE.x, z: KART_GATE.z - 6, to: [KART_GATE.x, KART_DESK.z], a: ANA, walk: 8 },
        {
          x: KART_PARK.x + 168.5,
          z: KART_PARK.z + 45.5,
          to: [KART_PARK.x + 170.5, KART_PARK.z + 45.5],
          a: BIA,
          sit: BENCH_TOP,
        },
        {
          x: KART_PARK.x + 172.5,
          z: KART_PARK.z + 44.5,
          to: [KART_PARK.x + 170.5, KART_PARK.z + 44.5],
          a: TOMAS,
          sit: BENCH_TOP,
        },
        { x: KART_PARK.x + 173.8, z: KART_PARK.z + 30, to: [KART_PARK.x + 175, KART_PARK.z + 29], a: LU },
        { x: KART_DESK.x - 1.3 * f, z: KART_DESK.z - 0.5, to: [KART_DESK.x + 5 * f, KART_DESK.z + 2], a: CAI },
      ],
      snow: 60,
      karts: { karts: [], rack: true, crowd: 0.3 },
    },
    // in among it: the fire and its benches, the shed's karts, race control and its desk
    "kart-paddock-mid": {
      hour: "day",
      cam: [KART_PADDOCK.x1 - 2, gy(KART_PADDOCK.x1, KART_PARK.z + 54) + 3, KART_PARK.z + 54],
      look: [KART_RACK.x + 7, gy(KART_RACK.x, KART_RACK.z0) + 1.1, KART_RACK.z0 + 4],
      fov: 55,
      radius: 220,
      people: [
        { x: KART_PARK.x + 169.6, z: KART_PARK.z + 46.4, to: [KART_PARK.x + 170.5, KART_PARK.z + 44.5], a: BIA },
        { x: KART_PARK.x + 171.6, z: KART_PARK.z + 46.3, to: [KART_PARK.x + 170.5, KART_PARK.z + 44.5], a: TOMAS },
        { x: KART_PARK.x + 174, z: KART_PARK.z + 30.2, to: [KART_PARK.x + 175, KART_PARK.z + 29], a: LU },
        { x: KART_DESK.x - 1.3 * f, z: KART_DESK.z - 0.5, to: [KART_DESK.x + 5 * f, KART_DESK.z + 2], a: CAI },
        { x: KART_DESK.x + 2.2 * f, z: KART_DESK.z + 1.4, to: [KART_DESK.x, KART_DESK.z], a: ANA },
      ],
      snow: 40,
      karts: { karts: [], rack: true },
    },
    "kart-paddock-night": {
      hour: "night",
      cam: [KART_PADDOCK.x1 - 1, gy(KART_PADDOCK.x1, KART_PADDOCK.z1) + 6.5, KART_PADDOCK.z1 + 6],
      look: [KART_RACK.x + 6, gy(KART_RACK.x, KART_RACK.z0) + 0.5, KART_RACK.z0 + 12],
      fov: 58,
      radius: 220,
      people: [
        {
          x: KART_PARK.x + 168.5,
          z: KART_PARK.z + 45.5,
          to: [KART_PARK.x + 170.5, KART_PARK.z + 45.5],
          a: BIA,
          sit: BENCH_TOP,
        },
        {
          x: KART_PARK.x + 172.5,
          z: KART_PARK.z + 44.5,
          to: [KART_PARK.x + 170.5, KART_PARK.z + 44.5],
          a: TOMAS,
          sit: BENCH_TOP,
        },
      ],
      snow: 60,
      karts: { karts: [], rack: true },
    },
    // iso: the paddock, the gate, the car park and the circle; the billboard on the corner
    "kart-iso-paddock": {
      hour: "day",
      cam: [0, 0, 0],
      look: [KART_GATE.x - 6, 0, KART_GATE.z - 22],
      iso: 30,
      people: [{ x: KART_GATE.x, z: KART_GATE.z - 8, to: [KART_GATE.x, KART_DESK.z], a: ANA }],
      snow: 0,
      karts: { karts: [], rack: true },
    },
    "kart-iso-sign": {
      hour: "day",
      cam: [0, 0, 0],
      look: [KART_SIGN.x - 6, 0, KART_SIGN.z + 4],
      iso: 16,
      people: [],
      snow: 0,
      karts: { karts: [] },
    },
    // iso: the start straight, the stands, the tower
    "kart-iso": {
      hour: "day",
      cam: [0, 0, 0],
      look: [C0.x + 80, 0, C0.z + 48],
      iso: 26,
      people: [{ x: C0.x + 90, z: C0.z + 66, to: [C0.x + 90, C0.z + 50], a: CAI }],
      snow: 0,
      karts: {
        karts: [
          { s: -2.2, off: 2.6, colour: "#b5562f", number: 1, driver: ANA },
          { s: -5.7, off: -2.6, colour: "#2f4a3b", number: 2, driver: BIA },
          { s: -9.2, off: 2.6, colour: "#3d4a5c", number: 3, driver: DUDA },
          { s: -12.7, off: -2.6, colour: "#e8a33d", number: 5, driver: LU },
        ],
        crowd: 0.8,
        lap: "1/3",
      },
    },
  };
}
const xyz = ([x, y, z]: [number, number, number]) => ({ x, y, z });
const xz = ([x, , z]: [number, number, number]) => ({ x, z });

// ── the pitch dark's stills (docs/plan/44-the-night.md, phase 0) ──
function nightShots(lamp: { x: number; z: number }): Record<string, Shot> {
  // the driveway halfway between two lamps: a car coming with its low beams, Ana on the verge in them
  const l = on("driveway", [lamp.x, lamp.z], 0, 0);
  const d = on("driveway", l.ahead(18), 4, 0.7);
  const side = (p: [number, number], k: number): [number, number] => [p[0] - d.tz * k, p[1] + d.tx * k];
  const [cx, cz] = d.ahead(13);
  const ca = Math.atan2(-d.tz, -d.tx); // (its nose towards the camera)
  const car = { x: cx + 1.6 * Math.sin(ca), z: cz - 1.6 * Math.cos(ca), a: ca };
  const [ax, az] = side(d.ahead(6), -3.2);
  // the ravine trail: you (Cai) a few steps ahead of the camera, the torch the only light
  const r = on("ravine", [-262.6, -204], 7, -1.3);
  const rs = (n: number, k: number): [number, number] => {
    const [x, z] = r.ahead(n);
    return [x - r.tz * k, z + r.tx * k];
  };
  const woods = (bia: [number, number] | null): Shot => ({
    hour: "pitch",
    cam: [r.bx, gy(r.bx, r.bz) + 2.5, r.bz],
    look: [r.ahead(16)[0], gy(r.x, r.z) + 0.9, r.ahead(16)[1]],
    fov: 50,
    people: [
      { x: r.x, z: r.z, to: r.ahead(10), a: CAI, walk: 17, light: true, me: true },
      ...(bia ? [{ x: bia[0], z: bia[1], to: [r.x, r.z] as [number, number], a: BIA }] : []),
    ],
    snow: 7000,
    prints: [
      [r.x, r.z],
      [r.bx, r.bz],
    ],
  });
  return {
    "night-driveway": {
      hour: "pitch",
      cam: [d.bx, gy(d.bx, d.bz) + 1.9, d.bz],
      look: [d.ahead(16)[0], gy(d.x, d.z) + 1.2, d.ahead(16)[1]],
      fov: 52,
      people: [{ x: ax, z: az, to: [d.bx, d.bz], a: ANA, walk: 23 }],
      cars: [
        {
          ...car,
          colour: SEDAN_RED,
          snowy: 0.2,
          lights: { beams: "low", tail: true, dash: 1 },
          exhaust: 0.5,
          driver: BIA,
        },
      ],
      snow: 9000,
    },
    "night-woods": woods(null),
    // (Bia off the beam, then in it: what you see of someone in the dark)
    "night-names-out": woods(rs(9, 3.6)),
    "night-names-in": woods(rs(9, 0.3)),
    // the clearing's lamp: the guard on the bench in its pool; Bia stands just past its edge
    "night-lamp": {
      hour: "pitch",
      cam: [121.5, gy(121.5, -237.5) + 1.9, -237.5],
      look: [121.5, gy(120, -250) + 1.5, -251],
      fov: 50,
      people: [
        { x: 120.35, z: -249.72, to: [120.35, -240], a: GUARD, sit: 0.56 },
        { x: 128.5, z: -258, to: [121.5, -237.5], a: BIA },
      ],
      snow: 5000,
    },
  };
}

// ── the lot's stills (docs/plan/42-the-lot.md, phase 0) ──
function lotShots(): Record<string, Shot> {
  return {
    // from above: the whole lot, the driveway coming in at the top
    "lot-top": {
      hour: "day",
      cam: [-30, 92, 24.6],
      look: [-30, 0, 24.5],
      fov: 52,
      people: [],
      snow: 0,
      radius: 160,
    },
    // walking down the driveway into it
    "lot-mouth": {
      hour: "day",
      cam: [-39.2, gy(-39.2, -34) + 2.0, -34],
      look: [-36, 0.8, 6],
      fov: 50,
      people: [
        { x: -38.2, z: -20, to: [-40, 0], a: CAI, walk: 6 },
        { x: -24, z: -3.6, to: [-30, -3.6], a: BIA, walk: 13 },
      ],
      snow: 600,
    },
    // from the pavement by the doors: the marked bays, the island, the aisle
    "lot-doors": {
      hour: "overcast",
      cam: [-11.4, 1.75, 9],
      look: [-17, 0.6, 27],
      fov: 52,
      people: [
        { x: -11.6, z: 15.5, to: [-11.6, 30], a: ANA, walk: 3 },
        { x: -20.5, z: 30.6, to: [-12, 30.6], a: DUDA, walk: 11 },
      ],
      snow: 900,
    },
    // down aisle E towards the mouth
    "lot-aisle": {
      hour: "day",
      cam: [-23.2, 1.8, 50],
      look: [-26, 1.0, 5],
      fov: 50,
      people: [{ x: -22.4, z: 40, to: [-22.4, 20], a: BIA, walk: 7 }],
      snow: 400,
    },
    // the west edge: the plough's dump, the pond trail going out through it
    "lot-dump": {
      hour: "overcast",
      cam: [-43.5, 2.1, 57.5],
      look: [-54, 0.8, 26],
      fov: 52,
      people: [{ x: -56.5, z: 22.2, to: [-75, 19], a: CAI, walk: 9 }],
      snow: 900,
    },
    // at night: the lamps on their islands
    "lot-night": {
      hour: "night",
      cam: [-8, 16, -14],
      look: [-30, 0, 20],
      fov: 55,
      people: [{ x: -22.2, z: 10, to: [-22.2, 30], a: ANA, walk: 4, light: true }],
      snow: 2500,
    },
    // the iso angle
    "lot-iso": {
      hour: "day",
      cam: [0, 0, 0],
      look: [-30, 0, 18],
      iso: 34,
      people: [
        { x: -22.2, z: 12, to: [-22.2, 30], a: ANA, walk: 9 },
        { x: -11.6, z: 20, to: [-11.6, 40], a: CAI, walk: 4 },
      ],
      snow: 0,
    },
  };
}
// ── someone's own bay, the dealer (docs/plan/43-the-spot.md, phase 0) ──
/** Someone's own car in a bay of the lot, nosed to its head. */
function own(b: { x: number; z: number; dir: 1 | -1 }, kind: CarIn["kind"], colour: number, plate?: string): CarIn {
  const a = b.dir > 0 ? Math.PI : 0;
  return { x: b.x, z: b.z, a, y: 0.03, colour, kind, snowy: 0.2, plate };
}
/** A bay of the lot, by its id (lot.ts: "d-03"). */
function bay(id: string): LotBay {
  const b = bayById(lotLayout(18), id);
  if (!b) throw new Error(`no bay ${id}`);
  return b;
}
const NAMES: [string, string][] = [
  ["d-01", "Rafa"],
  ["d-02", "Bia"],
  ["d-03", "Ana"],
  ["d-04", "Cai"],
  ["d-13", "Marta"],
  ["d-15", "Joel"],
  ["c-04", "Duda"],
  ["c-05", "Lia"],
  ["b-04", "Tomás"],
  ["b-05", "Noor"],
  ["c-13", "Iris"],
  ["a-07", "Pedro"],
];
const ownCars = (): CarIn[] => [
  own(bay("d-02"), "pickup", 0x2f4a6b, "BIA·77"),
  own(bay("d-03"), "sedan", 0x6b2430, "ANA·86"),
  own(bay("d-15"), "offroad", 0xcbbd98, "JOEL"),
  own(bay("b-04"), "offroad", 0x2f4a3b, "TOMÁS·1"),
  own(bay("b-05"), "sedan", 0x4a5a73, "NOOR"),
  own(bay("c-05"), "snowmobile", 0xb8282a),
];
/** The dealer's vehicles on show, swept clean. */
function motorsShow(): CarIn[] {
  const col: Record<string, number> = {
    sedan: 0xe8e6df,
    offroad: 0x6b2430,
    pickup: 0xb8702a,
    snowmobile: 0x2f4a6b,
    ploughtruck: 0xd8661a,
    snowcat: 0xd8661a,
    tractor: 0xa8231e,
    toboggan: 0x2f4a3b,
  };
  return MOTORS.show.map((v) => ({
    x: v.x,
    z: v.z,
    a: v.a,
    y: groundAt(v.x, v.z) + 0.05,
    colour: col[v.model] ?? 0x8b8f93,
    kind: v.model as CarIn["kind"],
    snowy: 0,
  }));
}
function spotShots(): Record<string, Shot> {
  const c = MOTORS.collect;
  return {
    // walking to your car down aisle E: row D's boards by the doors
    "spot-arrive": {
      hour: "day",
      cam: [-23.6, 1.75, 0.4],
      look: [-14.5, 0.9, 10.5],
      fov: 50,
      boards: NAMES,
      cars: ownCars(),
      people: [
        { x: -20.4, z: 6.2, to: [-17.5, 9.4], a: ANA, walk: 9 },
        { x: -22.6, z: 17, to: [-22.6, 30], a: DUDA, walk: 3 },
      ],
      snow: 500,
    },
    // close: Ana's board from the pavement, her car's nose behind it
    "spot-board": {
      hour: "overcast",
      cam: [-10.75, 1.75, 7.45],
      look: [-12.95, 1.45, 9.25],
      fov: 42,
      boards: NAMES,
      cars: ownCars(),
      people: [],
      snow: 700,
      near: 0.05,
    },
    // the pair: one post for two facing bays (Duda's empty, Tomás's 4x4 nosed in behind)
    "spot-pair": {
      hour: "day",
      cam: [-25.2, 1.65, 9.6],
      look: [-31.4, 0.95, 12.6],
      fov: 46,
      boards: NAMES,
      cars: ownCars(),
      people: [{ x: -27.4, z: 16.4, to: [-30, 14.8], a: BIA, walk: 5 }],
      snow: 400,
    },
    // after dark: row D's boards under the island's lamp, Ana's flashlight on hers
    "spot-night": {
      hour: "dusk",
      cam: [-23.4, 1.8, 2.2],
      look: [-13.5, 1.4, 9.4],
      fov: 50,
      boards: NAMES,
      cars: ownCars(),
      people: [{ x: -19.8, z: 7.6, to: [-12.9, 9.4], a: ANA, walk: 3 }],
      snow: 2500,
    },
    // from above: the lot's east half, the regulars' bays by name
    "spot-row": {
      hour: "day",
      cam: [-4, 13, -10],
      look: [-24, 0, 20],
      fov: 52,
      boards: NAMES,
      cars: ownCars(),
      people: [{ x: -22.4, z: 10, to: [-22.4, 20], a: CAI, walk: 7 }],
      snow: 0,
    },
    // standing in a free bay (D-05): where the HUD offers to claim it
    "spot-claim": {
      hour: "overcast",
      cam: [-23.2, 2.3, 12.2],
      look: [-14.2, 0.9, 15.2],
      fov: 48,
      boards: NAMES,
      cars: ownCars(),
      people: [{ x: -16.4, z: 14.8, to: [-13, 14.8], a: CAI }],
      snow: 600,
    },
    // the iso angle
    "spot-iso": {
      hour: "day",
      cam: [0, 0, 0],
      look: [-30, 0, 13],
      iso: 15,
      boards: NAMES,
      cars: ownCars(),
      people: [
        { x: -20.4, z: 6.2, to: [-17.5, 9.4], a: ANA, walk: 9 },
        { x: -11.6, z: 16, to: [-11.6, 30], a: CAI, walk: 4 },
      ],
      snow: 0,
    },
    // MOTORS from across Main Street
    "motors-day": {
      hour: "day",
      cam: [502.5, 4.4, -406.2],
      look: [513, 0.9, -388.5],
      fov: 56,
      motors: true,
      people: [
        { x: 510.8, z: -393.4, to: [509.6, -390.6], a: BIA },
        { x: 495, z: -397.2, to: [505, -397.2], a: CAI, walk: 11 },
      ],
      snow: 300,
    },
    // after dark: the flood lamps, the sign lit
    "motors-night": {
      hour: "night",
      cam: [502, 3.4, -412.5],
      look: [513.5, 1.6, -388],
      fov: 54,
      motors: true,
      people: [{ x: 515.4, z: -393.6, to: [514, -390.5], a: DUDA }],
      snow: 2200,
    },
    // a new car waiting in the collection bay: Ana's, by its open door
    "motors-new": {
      hour: "day",
      cam: [518.6, gy(518.6, -394.2) + 1.75, -394.2],
      look: [523.6, gy(523.6, -389.4) + 0.9, -389.4],
      fov: 46,
      motors: true,
      cars: [
        {
          x: c.x,
          z: c.z,
          a: c.a,
          y: groundAt(c.x, c.z) + 0.05,
          colour: SEDAN_RED,
          snowy: 0,
          plate: "ANA·86",
          doors: [0.9, 0, 0, 0],
        },
      ],
      people: [{ x: 522.3, z: -389.2, to: [523.4, -389.6], a: ANA }],
      snow: 200,
    },
  };
}
// ── the pet's stills (docs/plan/51-the-pet.md, phase 0): it stays, it rides, it gets lost ──
const REX: PetIn = {
  species: "dog",
  name: "Rex",
  look: { breed: "beagle", color: "#d9a349", mark: "patch", markColor: "#efe4cc" },
  pose: "sit",
};
const MIA: PetIn = {
  species: "cat",
  name: "Mia",
  look: { breed: "tabby", color: "#e8a33d", mark: "stripes" },
  pose: "sit",
};
const BUN: PetIn = { species: "rabbit", name: "Bun", look: { color: "#efe4cc" }, pose: "sit" };
const KIWI: PetIn = { species: "parrot", name: "Kiwi", look: { color: "#6e9b4a" }, pose: "idle" };
const PERRY: PetIn = { species: "platypus", name: "Perry", look: { color: "#1fb2a6" }, pose: "sit" };
const CAPY: PetIn = { species: "capybara", name: "Capy", look: { color: "#a8692f" }, pose: "chill" };
function petShots(lamp: { x: number; z: number }): Record<string, Shot> {
  // the lot's aisle E, Ana's car nosed north (as the car's stills)
  const lot = { x: -22.2, z: 14, a: -Math.PI / 2 };
  const L = (lx: number, lz: number): [number, number] => {
    const [x, , z] = local(lot, lx, 0, lz);
    return [x, z];
  };
  // the driveway: the car leaving under its lamp
  const d = on("driveway", [lamp.x, lamp.z], 0, 0);
  const leave = { x: d.ahead(9)[0], z: d.ahead(9)[1], a: Math.atan2(d.tz, d.tx) };
  const behind = (k: number, side = 0): [number, number] => [
    d.x - d.tx * k - d.tz * side,
    d.z - d.tz * k + d.tx * side,
  ];
  // the ravine's trail, in the woods (as the pitch dark's stills)
  const r = on("ravine", [-262.6, -204], 7, -1.3);
  const rs = (n: number, k: number): [number, number] => {
    const [x, z] = r.ahead(n);
    return [x - r.tz * k, z + r.tx * k];
  };
  const pick = (p: PetIn, o: Partial<PetIn>): PetIn => ({ ...p, ...o });
  const up = ([x, z]: [number, number], h: number): V3 => [x, gy(x, z) + h, z];
  const sedan = (o: Partial<CarIn> = {}): CarIn => ({ ...lot, colour: SEDAN_RED, snowy: 0.35, plate: "ANA·86", ...o });
  const [rx, rz] = L(1.1, 2.4); // by the rear door, the driver's side
  return {
    // the owner in, the door held: Rex running to it, the HUD's "Waiting for Rex…"
    "pet-board": {
      hour: "day",
      cam: local(lot, 4.4, 1.6, 3.3),
      look: local(lot, -0.2, 0.7, 0.4),
      fov: 46,
      cars: [sedan({ driver: ANA, doors: [0, 0, 1.0, 0], lights: { dash: 0.35 } })],
      pets: [pick(REX, { x: rx, z: rz, to: L(0.9, 0.6), pose: "walk", t: 0.35, face: "happy" })],
      people: [],
      snow: 400,
    },
    // in: Rex in the back looking out of the window, Mia on the passenger seat
    "pet-ride-sedan": {
      hour: "day",
      cam: local(lot, 1.9, 1.55, 4.3),
      look: local(lot, 0.4, 0.9, 0),
      fov: 44,
      near: 0.05,
      cars: [
        sedan({
          driver: ANA,
          pets: [
            pick(REX, { seat: 2, pose: "sit", face: "happy", turn: 1.3, look3: 0.3, at: [0, 0.04, -0.34] }),
            pick(MIA, { seat: 1, pose: "sit", face: "sleepy" }),
          ],
        }),
      ],
      people: [],
      snow: 300,
    },
    // every species rides: the pickup's bed (Capy and Perry), Bun in the cab
    "pet-ride-pickup": {
      hour: "overcast",
      cam: local(lot, 4.6, 2.3, 3.4),
      look: local(lot, 0.6, 0.9, 0),
      fov: 44,
      cars: [
        {
          ...lot,
          kind: "pickup",
          colour: 0x3d4a5c,
          snowy: 0.3,
          driver: CAI,
          pets: [
            pick(CAPY, { seat: 2, pose: "chill", face: "sleepy" }),
            pick(PERRY, { seat: 3, pose: "sit", face: "happy", turn: 0.6 }),
            pick(BUN, { seat: 1, pose: "sit", face: "open" }),
          ],
        },
      ],
      people: [],
      snow: 500,
    },
    // the 4x4: Kiwi on the passenger's headrest, Rex in the back
    "pet-ride-offroad": {
      hour: "day",
      cam: local(lot, 1.2, 1.95, 3.0),
      look: local(lot, 0.6, 0.95, 0),
      fov: 46,
      near: 0.05,
      cars: [
        {
          ...lot,
          kind: "offroad",
          colour: 0x2f4a3b,
          snowy: 0.3,
          driver: BIA,
          pets: [
            pick(KIWI, { seat: 3, pose: "idle", face: "happy", at: [0.32, 0.5, 0.05], turn: 0.9, scale: 0.5 }),
            pick(REX, { seat: 2, pose: "sit", face: "happy", turn: 1.3, at: [0, 0.04, -0.34] }),
          ],
        },
      ],
      people: [],
      snow: 300,
    },
    // driven off without it: Rex after the car down the driveway, falling behind
    "pet-left": {
      hour: "dusk",
      cam: up(behind(14, 1.2), 1.6),
      look: [leave.x, gy(leave.x, leave.z) + 0.8, leave.z],
      fov: 48,
      cars: [
        {
          ...leave,
          colour: SEDAN_RED,
          snowy: 0.3,
          driver: ANA,
          lights: { tail: true, dash: 1, beams: "low" },
          exhaust: 0.8,
        },
      ],
      pets: [
        pick(REX, { x: behind(5)[0], z: behind(5)[1], to: [leave.x, leave.z], pose: "walk", t: 0.6, face: "sad" }),
      ],
      people: [],
      snow: 1800,
    },
    // lost, by day: off the trail in the woods, sniffing, the "?" over its head
    "pet-lost-day": {
      hour: "overcast",
      cam: up(rs(1, -0.6), 1.3),
      look: up(rs(5, 2.4), 0.45),
      fov: 44,
      pets: [pick(REX, { x: rs(5, 2.4)[0], z: rs(5, 2.4)[1], to: rs(3, -1), pose: "sniff", face: "sad", lost: true })],
      people: [],
      snow: 900,
    },
    // lost, at night: in the one lamp's pool on the driveway, shivering, the dark all round
    "pet-lost-night": {
      hour: "night",
      cam: up(behind(-9, 3), 1.7),
      look: [lamp.x, gy(lamp.x, lamp.z) + 0.6, lamp.z],
      fov: 46,
      pets: [
        pick(REX, { x: lamp.x + 0.6, z: lamp.z + 0.4, to: behind(-9, 3), pose: "sit", face: "scared", lost: true }),
      ],
      people: [],
      snow: 4000,
    },
    // found: Cai on the trail at dusk, Rex running to him
    "pet-found": {
      hour: "dusk",
      cam: up(rs(3, -5.5), 1.6),
      look: up(rs(5, 0), 0.7),
      fov: 46,
      people: [{ x: rs(2, 0)[0], z: rs(2, 0)[1], to: rs(9, 0), a: CAI }],
      pets: [pick(REX, { x: rs(6, 0.2)[0], z: rs(6, 0.2)[1], to: rs(2, 0), pose: "walk", t: 0.2, face: "excited" })],
      snow: 5000,
    },
    // its owner gone home: Rex waiting by her car, Bia stopped to say hello
    "pet-waiting": {
      hour: "day",
      cam: local(lot, 3.8, 1.5, 3.3),
      look: local(lot, -0.2, 0.6, 2.1),
      fov: 46,
      cars: [sedan({ snowy: 0.6 })],
      pets: [pick(REX, { x: L(0.6, 1.9)[0], z: L(0.6, 1.9)[1], to: L(-0.8, 2.9), pose: "idle", face: "happy" })],
      people: [{ x: L(-0.9, 3.0)[0], z: L(-0.9, 3.0)[1], to: L(0.6, 1.9), a: BIA }],
      snow: 500,
    },
  };
}
// ── the car's stills (docs/plan/28-the-car.md, phase 0) ──
const SEDAN_RED = 0x6b2430;
/** Circles clearing the trees along the line from the camera to what it looks at (the first 12 tiles). */
function corridor(cam: V3, look: V3): { x: number; z: number; r: number }[] {
  const dx = look[0] - cam[0];
  const dz = look[2] - cam[2];
  const l = Math.hypot(dx, dz) || 1;
  const out: { x: number; z: number; r: number }[] = [];
  for (let t = 0; t <= Math.min(12, l); t += 2.5)
    out.push({ x: cam[0] + (dx / l) * t, z: cam[2] + (dz / l) * t, r: 6 });
  return out;
}
/** A car's local point (model coords: nose −x, +z its left) in the world. */
function local(c: { x: number; z: number; a: number; y?: number }, lx: number, ly: number, lz: number): V3 {
  const th = Math.PI - c.a;
  const y = c.y ?? groundAt(c.x, c.z);
  return [c.x + lx * Math.cos(th) + lz * Math.sin(th), y + ly, c.z - lx * Math.sin(th) + lz * Math.cos(th)];
}
function carShots(lamp: { x: number; z: number }): Record<string, Shot> {
  // the lot's aisle E, a car pulling out towards the north
  const lot = { x: -22.2, z: 14, a: -Math.PI / 2 };
  // the driveway: a car leaving, under a lamp; another, the lamp 22 tiles ahead
  const d = on("driveway", [lamp.x, lamp.z], 0, 0);
  const way = WAYS.find((w) => w.key === "driveway") as (typeof WAYS)[number];
  const at = (n: number) => {
    let bi = 0;
    let bd = Number.POSITIVE_INFINITY;
    way.line.forEach(([x, z], i) => {
      const k = Math.hypot(x - d.x, z - d.z);
      if (k < bd) {
        bd = k;
        bi = i;
      }
    });
    const i = Math.max(1, Math.min(way.line.length - 4, bi + n));
    const [x, z] = way.line[i];
    const [x2, z2] = way.line[i + 3];
    return { x, z, a: Math.atan2(z2 - z, x2 - x) };
  };
  const leave = at(5);
  const chase = { x: leave.x + 0.9 * Math.sin(leave.a), z: leave.z - 0.9 * Math.cos(leave.a), a: leave.a };
  const storm = at(-24);
  const stormCar = { x: storm.x + 1.6 * Math.sin(storm.a), z: storm.z - 1.6 * Math.cos(storm.a), a: storm.a };
  // the pond: sliding west, the nose swung out
  const pond = { x: -236, z: -66, a: Math.PI - 1.0, y: POND_Y() + 0.04 };
  // (in the car's frame: it came sliding in along its velocity, 1 rad right of its nose, curving)
  const pondPath: [number, number][] = [];
  for (let s = 16; s >= 0; s -= 0.8) {
    const b = 1.0 - s * 0.035;
    pondPath.push([0.9 + Math.cos(b) * s, Math.sin(b) * s + 0.02 * s * s]);
  }
  // the woods by the ravine's trail: off it, sunk in deep snow
  const r = on("ravine", [-262.6, -204], 0, 0);
  const deep = { x: r.x - r.tz * 6.5, z: r.z + r.tx * 6.5, a: Math.atan2(r.tz, r.tx) + 0.35 };
  // (in the car's frame: from the rear wheels straight back, then bending off towards the trail)
  const deepPath: [number, number][] = [];
  for (let s = 12; s >= 0; s -= 0.5) deepPath.push([1.42 + s, -0.025 * s * s]);
  const eye: V3 = [0.35, 1.19, 0.42];
  // every kind of vehicle on its own in the lot's aisle by day, from its front and its back
  // (docs/plan/34-the-vehicles.md: `veh-<kind>-f|r`)
  const KINDS: [NonNullable<CarIn["kind"]>, number, number, number][] = [
    ["sedan", 4.9, 1.5, SEDAN_RED],
    ["offroad", 4.4, 1.8, 0x2f4a3b],
    ["pickup", 5.1, 1.8, 0x2f4a6b],
    ["snowmobile", 3.0, 1.2, 0xb8282a],
    ["snowcat", 4.6, 2.7, 0xd8661a],
    ["ploughtruck", 6.6, 3.0, 0xd8661a],
    ["tractor", 3.3, 2.5, 0xa8231e],
    ["toboggan", 1.8, 0.5, 0xa8231e],
  ];
  const vehicles: Record<string, Shot> = {};
  for (const [kind, len, h, colour] of KINDS)
    for (const [v, sx, sz] of [
      ["f", -1, 1],
      ["r", 1, -1],
      ["s", 0.15, 1.25],
    ] as const) {
      const d = Math.max(3.2, len * 0.95);
      vehicles[`veh-${kind}-${v}`] = {
        hour: "day",
        cam: local(lot, sx * d, h * 0.55 + 0.9, sz * d * 0.8),
        look: local(lot, 0, h * 0.42, 0),
        fov: 40,
        people: [],
        cars: [{ ...lot, y: groundAt(lot.x, lot.z) + 0.08, colour, kind, snowy: 0.25 }],
        snow: 300,
      };
    }
  return {
    ...vehicles,
    "car-lot-day": {
      hour: "day",
      cam: local(lot, -6.9, 1.5, 2.1),
      look: local(lot, 0.3, 0.75, 0.2),
      fov: 40,
      people: [
        {
          x: local(lot, 0.6, 0, 1.8)[0],
          z: local(lot, 0.6, 0, 1.8)[2],
          to: [local(lot, 0.4, 0, 0.8)[0], local(lot, 0.4, 0, 0.8)[2]],
          a: ANA,
          walk: 18,
        },
      ],
      cars: [{ ...lot, colour: SEDAN_RED, snowy: 0.55, doors: [1.05, 0, 0, 0], lights: { dash: 0.35 } }],
      snow: 600,
    },
    "car-driveway-night": {
      hour: "night",
      cam: local(chase, 7.6, 2.25, -0.5),
      look: local(chase, -11, 0.9, 0),
      fov: 56,
      people: [],
      cars: [
        {
          ...chase,
          colour: SEDAN_RED,
          snowy: 0.25,
          lights: { beams: "low", tail: true, dash: 1 },
          exhaust: 0.7,
          driver: CAI,
          steer: 0.04,
        },
      ],
      snow: 9000,
    },
    "car-cabin-blizzard": {
      hour: "night",
      storm: true,
      cam: local(stormCar, ...eye),
      look: local(stormCar, eye[0] - 20, -2.0, -0.6),
      fov: 60,
      near: 0.03,
      people: [],
      cars: [
        {
          ...stormCar,
          colour: SEDAN_RED,
          lights: { beams: "low", tail: true, dash: 1 },
          driver: ANA,
          cockpit: true,
          steer: 0.012,
          wipers: [1.95, 2.1],
          screenSnow: 1,
          cluster: {
            kmh: 48,
            rpm: 2350,
            gear: "3",
            clock: "23:14",
            outside: -14,
            temp: 0.62,
            fuel: 0.58,
            beams: "low",
          },
          radio: ["FM", 98.7, 3],
          freshener: [0.05, 0.22],
        },
      ],
      snow: 26000,
    },
    "car-cabin-day": {
      hour: "overcast",
      cam: local(lot, 0.42, 1.28, -0.5),
      look: local(lot, -0.55, 0.88, 0.32),
      fov: 62,
      near: 0.03,
      people: [],
      cars: [
        {
          ...lot,
          colour: SEDAN_RED,
          snowy: 0.3,
          lights: { dash: 0.45 },
          driver: BIA,
          cluster: { kmh: 0, rpm: 900, gear: "N", clock: "10:42", outside: -6, temp: 0.4, hand: true },
          radio: ["FM", 98.7, 3],
        },
      ],
      snow: 400,
    },
    "car-pond-drift": {
      hour: "overcast",
      cam: local(pond, -5.5, 2.7, 8.2),
      look: local(pond, 2.6, 0.2, 1.4),
      fov: 42,
      people: [],
      cars: [
        {
          ...pond,
          colour: SEDAN_RED,
          snowy: 0.15,
          steer: -0.5,
          roll: 0.04,
          lights: { beams: "low", tail: true, dash: 0.8 },
          driver: CAI,
          tracks: { path: pondPath, kind: "ice", local: true },
          spray: 0.45,
          sprayTo: Math.PI * 0.08,
        },
      ],
      snow: 2500,
    },
    "car-deep-snow": {
      hour: "overcast",
      cam: local({ ...deep }, 6.8, 1.55, -3.4),
      look: local({ ...deep }, -0.6, 0.45, 0),
      fov: 44,
      people: [
        {
          x: local(deep, 3.12, 0, 0.35)[0],
          z: local(deep, 3.12, 0, 0.35)[2],
          to: [deep.x, deep.z],
          a: DUDA,
          push: true,
        },
      ],
      cars: [
        {
          ...deep,
          colour: SEDAN_RED,
          snowy: 0.45,
          sink: 0.2,
          pitch: 0.035,
          roll: -0.03,
          lights: { tail: true, dash: 0.6 },
          driver: CAI,
          tracks: { path: deepPath, kind: "deep", local: true },
          spray: 0.85,
          exhaust: 0.9,
        },
      ],
      snow: 1800,
    },
    "car-offroad-day": {
      hour: "day",
      cam: local(lot, -5.6, 1.35, 3.9),
      look: local(lot, 0.3, 0.85, 0.2),
      fov: 40,
      people: [{ x: local(lot, 1.2, 0, 2.0)[0], z: local(lot, 1.2, 0, 2.0)[2], to: [lot.x, lot.z], a: CAI, walk: 6 }],
      cars: [{ ...lot, kind: "offroad", colour: 0x2f4a3b, snowy: 0.5, doors: [0.9, 0, 0, 0], lights: { dash: 0.35 } }],
      snow: 600,
    },
    // review stills: the flanks, the arches, the pillars (both bodies, from behind on the right)
    ...Object.fromEntries(
      (["sedan", "offroad"] as const).flatMap((kind) => {
        const axle = kind === "sedan" ? 1.35 : 1.05;
        const car: CarIn = {
          ...lot,
          kind,
          colour: kind === "sedan" ? 0x1d1f22 : 0xa9abad,
          snowy: 0.5,
          lights: { dash: 0.35 },
        };
        return [
          [
            `car-check-${kind}`,
            {
              hour: "day",
              cam: local(lot, 5.4, 2.2, -3.6),
              look: local(lot, 0.2, 0.75, 0),
              fov: 40,
              people: [],
              cars: [car],
            },
          ],
          [
            `car-check-${kind}-arch`,
            {
              hour: "day",
              cam: local(lot, axle + 0.9, 0.55, -2.4),
              look: local(lot, axle, 0.6, -0.5),
              fov: 45,
              people: [],
              cars: [car],
            },
          ],
          [
            `car-check-${kind}-bench`,
            {
              hour: "day",
              cam: local(lot, kind === "sedan" ? 0.85 : 0.98, kind === "sedan" ? 1.38 : 1.56, -0.1),
              look: local(lot, kind === "sedan" ? 1.25 : 1.38, kind === "sedan" ? 0.45 : 0.63, 0.45),
              fov: 70,
              near: 0.05,
              people: [],
              cars: [car],
            },
          ],
        ] as [string, Shot][];
      }),
    ),
    "car-offroad-woods": {
      hour: "overcast",
      cam: local({ ...deep }, 6.0, 1.6, -3.6),
      look: local({ ...deep }, -0.6, 0.7, 0),
      fov: 44,
      people: [],
      cars: [
        {
          ...deep,
          kind: "offroad",
          colour: 0x6b2430,
          snowy: 0.3,
          sink: 0.1,
          lights: { tail: true, dash: 0.6 },
          driver: BIA,
          tracks: { path: deepPath, kind: "deep", local: true },
          spray: 0.5,
          exhaust: 0.7,
        },
      ],
      snow: 1800,
    },
    "car-iso": {
      hour: "day",
      cam: [0, 0, 0],
      look: [-40, 0, 16],
      iso: 8,
      people: [{ x: -41.6, z: 11.2, to: [-39, 13], a: BIA, walk: 6 }],
      cars: [
        {
          x: -40.6,
          z: 17,
          a: -Math.PI / 2 - 0.45,
          colour: SEDAN_RED,
          snowy: 0.3,
          steer: 0.4,
          exhaust: 0.5,
          driver: ANA,
        },
      ],
      snow: 0,
    },
  };
}

// the pond's ice (from the shared Grounds, read late: the module is lazy)
let pondY = 0;
const POND_Y = () => pondY;

interface Preset {
  top: string;
  horizon: string;
  fog: string;
  density: number;
  hemi: [string, string, number];
  sun: [string, number, V3];
  night: number;
  bloom: [number, number, number]; // strength, radius, threshold
  exposure: number;
  tint: number; // people's unlit share
}
const PRESETS: Record<Hour, Preset> = {
  day: {
    top: "#8f9ca8",
    horizon: "#d5dbe0",
    fog: "#cfd6dc",
    density: 0.0045,
    hemi: ["#e8edf2", "#8d97a1", 1.5],
    sun: ["#fff4e6", 1.7, [-0.45, 0.42, 0.78]],
    night: 0,
    bloom: [0.15, 0.4, 0.95],
    exposure: 1.0,
    tint: 1,
  },
  overcast: {
    top: "#9aa5af",
    horizon: "#d2d8dd",
    fog: "#c8d0d6",
    density: 0.0062,
    hemi: ["#e4e9ee", "#8a949e", 1.75],
    sun: ["#f2f2f2", 0.55, [-0.3, 0.6, 0.7]],
    night: 0,
    bloom: [0.12, 0.4, 0.95],
    exposure: 1.0,
    tint: 1,
  },
  dusk: {
    top: "#1d2738",
    horizon: "#7c7480",
    fog: "#525b69",
    density: 0.0075,
    hemi: ["#7d8aa3", "#2f343c", 0.62],
    sun: ["#ffb98a", 0.28, [-0.9, 0.12, 0.2]],
    night: 0.85,
    bloom: [0.75, 0.55, 0.62],
    exposure: 1.05,
    tint: 0.5,
  },
  night: {
    top: "#04070c",
    horizon: "#141c27",
    fog: "#111924",
    density: 0.0115,
    hemi: ["#33405a", "#05070a", 0.16],
    sun: ["#a9bddc", 0.07, [0.3, 0.7, -0.5]],
    night: 1,
    bloom: [0.95, 0.6, 0.5],
    exposure: 1.1,
    tint: 0.12,
  },
  // the pitch dark (docs/plan/44-the-night.md): no moon, no sky's fill — what's lit is lit by a
  // lamp, a beam, headlights or a window, and the rest is black (the eyes put a little back)
  pitch: {
    top: "#010102",
    horizon: "#020203",
    fog: "#000000",
    density: 0.0115,
    hemi: ["#33405a", "#05070a", 0.0],
    sun: ["#a9bddc", 0.0, [0.3, 0.7, -0.5]],
    night: 1,
    bloom: [0.55, 0.45, 0.82],
    exposure: 1.1,
    tint: 0.04,
  },
  blizzard: {
    top: "#b6bec6",
    horizon: "#cbd2d8",
    fog: "#c5ccd2",
    density: 0.026,
    hemi: ["#e4e9ee", "#9aa3ab", 1.6],
    sun: ["#f2f2f2", 0.25, [-0.3, 0.6, 0.7]],
    night: 0,
    bloom: [0.12, 0.4, 0.95],
    exposure: 1.0,
    tint: 1,
  },
};

export async function runShot(
  el: HTMLElement,
  name: string,
  W: number,
  H: number,
  status: (s: string) => void,
): Promise<() => void> {
  const T3: THREE = await import("three");
  const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
  const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
  const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");
  const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
  const { ShaderPass } = await import("three/addons/postprocessing/ShaderPass.js");
  const S = await import("@yutopia/shared/grounds");
  pondY = S.POND_LEVEL;
  // god mode's buildings (docs/plan/53-the-god-mode.md, phase 9): every kind put down in the
  // woods north-west, &prefabs=min (each at its smallest), max (its biggest, its most floors) or
  // turn (between, their doors north and west) — to see each builder at any size
  const pf = new URLSearchParams(location.search).get("prefabs");
  if (pf) S.applyEdits({ rev: 1, buildings: { add: prefabSet(S, pf as "min" | "max" | "turn") } });
  const { Grounds3 } = await import("./grounds3d");
  const Themes = await import("../art/themes");
  const C = await import("../chars");
  const all = shots();
  const base = all[name];
  if (!base) {
    status(`no shot "${name}": ${Object.keys(all).join(", ")}`);
    return () => {};
  }
  // overrides while looking: &snow=0 &hour=night &people=0 (and the pitch dark's &eyes=0..1 &storm=1)
  const q = new URLSearchParams(location.search);
  const shot: Shot = {
    ...base,
    snow: q.has("snow") ? Number(q.get("snow")) : base.snow,
    hour: (q.get("hour") as Hour) ?? base.hour,
    people: q.get("people") === "0" ? [] : base.people,
    eyes: q.has("eyes") ? Number(q.get("eyes")) : base.eyes,
    storm: q.has("storm") ? q.get("storm") === "1" : base.storm,
  };
  const v3 = (k: string): V3 | undefined => {
    const v = q.get(k)?.split(",").map(Number);
    return v?.length === 3 && v.every(Number.isFinite) ? [v[0], gy(v[0], v[2]) + v[1], v[2]] : undefined;
  };
  shot.cam = v3("cam") ?? shot.cam;
  shot.look = v3("look") ?? shot.look;
  for (const k of ["fov", "radius", "haze"] as const) if (q.has(k)) shot[k] = Number(q.get(k));
  const pitch = shot.hour === "pitch";
  const eyes = shot.eyes ?? 0.6;
  if (shot.motors) shot.cars = [...(shot.cars ?? []), ...motorsShow()];
  const P = PRESETS[shot.hour];
  const dark = shot.hour === "night" || pitch;
  const t0 = performance.now();

  const renderer = new T3.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  C.inkResolution(W, H);

  const scene = new T3.Scene();
  scene.fog = new T3.FogExp2(
    P.fog,
    (shot.iso !== undefined ? P.density * 0.12 : P.density * (shot.storm ? 1.7 : 1)) * (shot.haze ?? 1),
  );
  scene.background = new T3.Color(P.horizon);
  // the sky: a gradient dome (overcast: no sun disc; night: a faint glow low down)
  const dome = new T3.Mesh(
    new T3.SphereGeometry(2600, 32, 16),
    new T3.ShaderMaterial({
      side: T3.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new T3.Color(P.top) }, hor: { value: new T3.Color(P.horizon) } },
      vertexShader:
        "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 top; uniform vec3 hor; varying vec3 p; void main(){ float k = smoothstep(-0.02, 0.45, p.y); gl_FragColor = vec4(mix(hor, top, k), 1.0); }",
    }),
  );
  dome.renderOrder = -2;
  scene.add(dome);
  // the sky as an environment for the car's paint, chrome and glass
  let env: THREE_NS.Texture | null = null;
  if (shot.cars) {
    const pm = new T3.PMREMGenerator(renderer);
    const es = new T3.Scene();
    es.add(new T3.Mesh(new T3.SphereGeometry(60, 32, 16), dome.material));
    const gnd = new T3.Mesh(
      new T3.CircleGeometry(80, 24).rotateX(-Math.PI / 2),
      new T3.MeshBasicMaterial({ color: P.night > 0.5 ? "#0b1016" : shot.hour === "dusk" ? "#4a5260" : "#dfe5ea" }),
    );
    gnd.position.y = -1.5;
    es.add(gnd);
    if (P.night > 0.5)
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const b = new T3.Mesh(new T3.SphereGeometry(0.9, 8, 6), new T3.MeshBasicMaterial({ color: "#ffd9a0" }));
        b.position.set(Math.cos(a) * 40, 8 + (i % 3) * 3, Math.sin(a) * 40);
        es.add(b);
      }
    env = pm.fromScene(es, 0.03, 0.1, 200).texture;
    pm.dispose();
  }

  // ── the Grounds round the shot ──
  const ortho = shot.iso !== undefined;
  const tx = shot.look[0];
  const tz = shot.look[2];
  const mid = ortho ? { x: tx, z: tz } : { x: (shot.cam[0] * 2 + tx) / 3, z: (shot.cam[2] * 2 + tz) / 3 };
  const grounds = new Grounds3(Themes, {
    cx: mid.x,
    cz: mid.z,
    radius: shot.radius ?? (ortho ? 120 : 380),
    near: ortho ? 120 : 130,
    clear: [
      ...(ortho ? [] : [{ x: shot.cam[0], z: shot.cam[2], r: 5.5 }]),
      ...(shot.cars ?? []).map((c) => ({ x: c.x, z: c.z, r: 4.5 })),
      // (and the way from the camera to a car: nothing between them)
      ...(shot.cars && !ortho ? corridor(shot.cam, shot.look) : []),
    ],
    parked: (shot.cars ?? []).filter((c) => c.x < -10 && c.x > -56 && c.z > -8 && c.z < 60),
  });
  scene.add(grounds.root);
  grounds.setNight(P.night);
  // ── the claimed bays' boards, the dealer (docs/plan/43-the-spot.md) ──
  const spot = shot.boards ? S3 : null;
  if (spot && shot.boards) {
    const l = lotLayout(18);
    const posts = new Set<string>();
    const list = shot.boards.flatMap(([id, name]) => {
      const b = bayById(l, id);
      if (!b) throw new Error(`no bay ${id}`);
      const w = boardOf(l, b);
      const k = `${w.x},${w.z}`;
      const post = !posts.has(k);
      posts.add(k);
      // (on the kerbs: rows A and D; the pair's post on the asphalt between their noses)
      const y = 0.03 + (b.row === "w" || b.row === "e" ? 0.15 : 0);
      const one = { x: w.x, z: w.z, ry: w.ry, y, name, label: bayLabel(b), post };
      // (row D's read from the pavement too: a second plank on the post's back)
      return b.row === "e" ? [one, { ...one, ry: w.ry + Math.PI, post: false }] : [one];
    });
    scene.add(spot.boards(Themes, list));
  }

  // the far ridges take the horizon's colour, a little darker
  {
    const hz = new T3.Color(P.horizon);
    const fg = new T3.Color(P.fog);
    grounds.ridgeMat.color.copy(
      hz
        .clone()
        .lerp(fg, 0.5)
        .multiplyScalar(pitch ? 0.25 : shot.hour === "night" ? 0.7 : 0.86),
    );
    if (shot.hour === "blizzard") grounds.ridgeMat.visible = false;
  }

  // ── light ──
  // (the pitch dark: only what the eyes give back, a little, cold)
  scene.add(new T3.HemisphereLight(P.hemi[0], P.hemi[1], pitch ? 0.02 + 0.6 * eyes : P.hemi[2]));
  const sun = new T3.DirectionalLight(P.sun[0], P.sun[1]);
  const sd = new T3.Vector3(...P.sun[2]).normalize();
  const focus = ortho ? new T3.Vector3(tx, 0, tz) : new T3.Vector3(mid.x, shot.cam[1], mid.z);
  sun.position.copy(focus).addScaledVector(sd, 200);
  sun.target.position.copy(focus);
  sun.castShadow = P.sun[1] > 0.2;
  sun.shadow.mapSize.set(2048, 2048);
  const sr = ortho ? 50 : 90;
  Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 10, far: 500 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  // overcast: soft shadows; clear: full
  sun.shadow.intensity = shot.hour === "overcast" ? 0.35 : shot.hour === "day" ? 0.8 : 0.6;
  scene.add(sun, sun.target);

  // the nearest lamps lit for real (the rest: their heads, glows and pools)
  const camV = new T3.Vector3(...shot.cam);
  if (P.night > 0) {
    const near = [...grounds.lights].sort((a, b) => a.p.distanceTo(camV) - b.p.distanceTo(camV)).slice(0, 12);
    for (const l of near) {
      if (l.kind === "cobra") {
        const s = new T3.SpotLight(l.color, 55 * P.night, 30, 0.95, 0.8, 1.5);
        s.position.copy(l.p);
        s.target.position.set(l.p.x, l.p.y - 9, l.p.z);
        scene.add(s, s.target);
      } else {
        const p = new T3.PointLight(
          l.color,
          (l.kind === "porch" ? 10 : l.kind === "gate" ? 18 : 22) * P.night,
          l.r * 3,
          1.7,
        );
        p.position.copy(l.p);
        scene.add(p);
      }
    }
  }

  // ── the inside of the east block (its blank ground floor) ──
  if (shot.inside === "east-block") inside(T3, scene, grounds);

  // ── the people ──
  const f = new C.CharFactory();
  // (the pitch dark: nobody gives off light of their own — only you, faintly)
  const bodyMat = new T3.MeshLambertMaterial({ vertexColors: true, emissive: pitch ? "#000000" : "#10141b" });
  const meMat = new T3.MeshLambertMaterial({ vertexColors: true, emissive: "#07090d" });
  const flatMat = new T3.MeshBasicMaterial({ vertexColors: true, color: new T3.Color(P.tint, P.tint, P.tint) });
  const lit = dark || shot.hour === "dusk";
  const people = shot.people.map((w) => {
    const body = lit ? (pitch && w.me ? meMat : bodyMat) : flatMat;
    const m = new C.PersonModel(f, w.a, 0, { body, ink: C.inkMaterial() });
    const y = w.y ?? groundAt(w.x, w.z);
    m.root.position.set(w.x, y, w.z);
    m.root.rotation.y = Math.atan2(w.to[0] - w.x, w.to[1] - w.z);
    scene.add(m.root);
    return { w, m, mo: new C.Motion3(0.3) };
  });
  // flashlights: a spot from the hand, its beam in the air
  const beams: { s: THREE_NS.SpotLight; cone: THREE_NS.Mesh; who: (typeof people)[number] }[] = [];
  for (const p of people) {
    if (!p.w.light) continue;
    const s = new T3.SpotLight("#fff1dc", 260, 90, 0.26, 0.55, 1.2);
    s.castShadow = false; // (the walker's own body would split the beam)
    scene.add(s, s.target);
    const L = 24;
    const geo = new T3.ConeGeometry(Math.tan(0.22) * L, L, 32, 1, true).translate(0, -L / 2, 0).rotateX(-Math.PI / 2);
    const cone = new T3.Mesh(
      geo,
      new T3.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T3.AdditiveBlending,
        side: T3.DoubleSide,
        uniforms: { len: { value: L } },
        vertexShader:
          "varying float d; varying vec3 n; varying vec3 v; void main(){ d = -position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); v = normalize(-mv.xyz); n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }",
        fragmentShader: `uniform float len; varying float d; varying vec3 n; varying vec3 v; void main(){ float k = 1.0 - smoothstep(0.0, len, d); float edge = pow(abs(dot(n, v)), 1.4); gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * ${pitch ? "0.035" : "0.12"} * k * edge, 1.0); }`,
      }),
    );
    scene.add(cone);
    beams.push({ s, cone, who: p });
  }
  const phones = people
    .filter((p) => p.w.light)
    .map((p) => {
      const prop = C.buildProp("phone", "#2a2e33", (c: string) => new T3.MeshLambertMaterial({ color: c }));
      C.inHand(prop.root, "phone");
      return { p, prop };
    });

  // ── the cars ──
  const cars = shot.cars
    ? (await import("./car/stage")).stageCars(T3, scene, shot.cars, {
        night: P.night,
        storm: !!shot.storm,
        lit,
        f,
        C,
        bodyMat,
        flatMat,
        env,
      })
    : null;
  // ── the Kart Park (docs/plan/46-the-karts.md) ──
  const karts = shot.karts
    ? (await (await import("./grounds3d")).loadKarts()).stageKarts(T3, scene, shot.karts, {
        night: P.night,
        lit,
        f,
        C,
        bodyMat,
        flatMat,
        cam: camV,
      })
    : null;
  // ── the pets (docs/plan/51-the-pet.md): on the Grounds, and in the cars' seats ──
  const petList = [
    ...(shot.pets ?? []).map((p) => ({ p: { ...p, y: p.y ?? groundAt(p.x ?? 0, p.z ?? 0) } })),
    ...(cars?.petSeats ?? []),
  ];
  const pets = petList.length
    ? // (the pets' models through the page's own loader: an import of their own copied the pets chunk)
      (await import("./pet-stage")).stagePets(T3, await loadPets(), scene, petList)
    : null;
  // (no flakes inside a car)
  const inCar = (x: number, y: number, z: number) =>
    (shot.cars ?? []).some((c) => {
      const th = Math.PI - c.a;
      const dx = x - c.x;
      const dz = z - c.z;
      const lx = dx * Math.cos(th) - dz * Math.sin(th);
      const lz = dx * Math.sin(th) + dz * Math.cos(th);
      return Math.abs(lx) < 2.9 && Math.abs(lz) < 1.4 && y - (c.y ?? groundAt(c.x, c.z)) < 1.8;
    });

  // ── snow falling, footprints ──
  if (shot.snow) {
    const n = shot.snow;
    const box = shot.hour === "blizzard" || shot.storm ? 46 : 60;
    const pos = new Float32Array(n * 3);
    const rr = S.groundsRng(55);
    const fwd = new T3.Vector3(...shot.look).sub(camV).normalize();
    for (let i = 0; i < n; i++) {
      const k = rr();
      // more flakes ahead of the camera than behind it
      const along = k * k * box;
      pos[i * 3] = camV.x + fwd.x * along + (rr() - 0.5) * box;
      pos[i * 3 + 1] = camV.y - 3 + rr() * 22;
      pos[i * 3 + 2] = camV.z + fwd.z * along + (rr() - 0.5) * box;
      if (inCar(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) pos[i * 3 + 1] += 40;
    }
    const g = new T3.BufferGeometry();
    g.setAttribute("position", new T3.BufferAttribute(pos, 3));
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const cg = cv.getContext("2d") as CanvasRenderingContext2D;
    const grd = cg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    cg.fillStyle = grd;
    cg.fillRect(0, 0, 32, 32);
    const flakeTex = new T3.CanvasTexture(cv);
    const night = dark;
    const pts = new T3.Points(
      g,
      new T3.PointsMaterial({
        size: shot.hour === "blizzard" || shot.storm ? 0.16 : 0.11,
        map: flakeTex,
        transparent: true,
        depthWrite: false,
        // (the pitch dark: a flake shows in a light only; here, as dark as what's behind it)
        color: pitch ? "#1a1e24" : night ? "#c9d4e4" : "#ffffff",
        opacity: night ? 0.75 : 0.9,
        fog: true,
      }),
    );
    scene.add(pts);
    if (shot.hour === "blizzard" || shot.storm) {
      // streaks: snow driven sideways
      const m = 9000;
      const lp = new Float32Array(m * 6);
      for (let i = 0; i < m; i++) {
        const x = camV.x + (rr() - 0.5) * 50 + fwd.x * rr() * 30;
        const y = camV.y - 2 + rr() * 14;
        const z = camV.z + (rr() - 0.5) * 50 + fwd.z * rr() * 30;
        if (inCar(x, y, z) || inCar(x + 0.9, y - 0.25, z + 0.35)) continue;
        lp.set([x, y, z, x + 0.9, y - 0.25, z + 0.35], i * 6);
      }
      const lg = new T3.BufferGeometry();
      lg.setAttribute("position", new T3.BufferAttribute(lp, 3));
      scene.add(
        new T3.LineSegments(
          lg,
          new T3.LineBasicMaterial({
            color: pitch ? "#14181e" : shot.storm ? "#aab6c8" : "#ffffff",
            transparent: true,
            opacity: shot.storm ? 0.35 : 0.55,
          }),
        ),
      );
    }
  }
  if (shot.prints) {
    const g = new T3.BufferGeometry();
    const pos: number[] = [];
    const line = shot.prints;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (let t = 0.6; t < len; t += 0.42) {
        const s = Math.round(t / 0.42) % 2 ? 1 : -1;
        const x = ax + ux * t - uz * s * 0.13;
        const z = az + uz * t + ux * s * 0.13;
        const y = groundAt(x, z) + 0.05;
        const a = 0.09;
        const b = 0.15;
        const P2 = (p: number, q: number) => [x + ux * q - uz * p, y, z + uz * q + ux * p];
        pos.push(...P2(-a, -b), ...P2(a, b), ...P2(a, -b), ...P2(-a, -b), ...P2(-a, b), ...P2(a, b));
      }
    }
    g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
    const fm = new T3.MeshBasicMaterial({
      color: dark ? "#2d3a4f" : "#8494a8",
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const pm = new T3.Mesh(g, fm);
    pm.renderOrder = 1;
    scene.add(pm);
  }

  // ── the camera ──
  let cam: THREE_NS.Camera;
  if (ortho) {
    const k = shot.iso ?? 20;
    const o = new T3.OrthographicCamera((-k * W) / H, (k * W) / H, k, -k, 1, 900);
    // the iso view's angle: from the south-east, 30° down
    const yaw = Math.PI * 0.25;
    const pitch = Math.PI / 6;
    const tgt = new T3.Vector3(tx, groundAt(tx, tz), tz);
    o.position.set(
      tgt.x + Math.cos(yaw) * 300 * Math.cos(pitch),
      tgt.y + 300 * Math.sin(pitch),
      tgt.z + Math.sin(yaw) * 300 * Math.cos(pitch),
    );
    o.lookAt(tgt);
    cam = o;
  } else {
    const p = new T3.PerspectiveCamera(shot.fov ?? 50, W / H, shot.near ?? 0.1, 5000);
    p.position.copy(camV);
    p.lookAt(new T3.Vector3(...shot.look));
    cam = p;
  }
  scene.add(cam);
  grounds.faceCards(cam.position);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  // (a stray NaN in a pixel — a degenerate normal somewhere — would be smeared
  // over the whole frame by the bloom's blur: cleared first)
  composer.addPass(
    new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(48.0)); }",
    }),
  );
  composer.addPass(new UnrealBloomPass(new T3.Vector2(W, H), P.bloom[0], P.bloom[1], P.bloom[2]));
  composer.addPass(new OutputPass());
  (window as unknown as { __g?: unknown }).__g = { scene, cam, grounds, renderer, composer, people: shot.people };
  status(`${name}: built in ${Math.round(performance.now() - t0)} ms`);

  // ── draw once the people are in ──
  let raf = 0;
  let frames = 0;
  const v = new T3.Vector3();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    f.pump(12);
    let ready = 0;
    for (const p of people) if (p.m.update()) ready++;
    if (ready < people.length) return;
    if (cars && !cars.ready()) return;
    if (karts && !karts.ready()) return;
    for (const p of people) {
      const walking = p.w.walk !== undefined;
      let mo = p.mo.update(1 / 60, {
        dist: 0,
        walking: false,
        speed: 0,
        sit: false,
        typing: false,
        speaking: false,
        emote: "",
        reduced: false,
      });
      // (settled first: a figure's first pose isn't one)
      const sit = p.w.sit !== undefined;
      if (!walking)
        for (let i = 0; i < 90; i++)
          mo = p.mo.update(1 / 60, {
            dist: 0,
            walking: false,
            speed: 0,
            sit,
            typing: false,
            speaking: false,
            emote: "",
            reduced: false,
          });
      if (walking)
        for (let i = 0; i <= (p.w.walk ?? 0); i++)
          mo = p.mo.update(1 / 60, {
            dist: 4.2 / 60,
            walking: true,
            speed: 4.2,
            sit: false,
            typing: false,
            speaking: false,
            emote: "",
            reduced: false,
          });
      const pose = { ...mo.pose };
      if (p.w.push) {
        // bent forward into it, arms out, one leg back
        pose.spine = [0.42, 0, 0];
        pose.neck = [-0.2, 0, 0];
        pose.shoulderL = [-1.35, 0, 0.18];
        pose.shoulderR = [-1.35, 0, -0.18];
        pose.elbowL = [-0.35, 0, 0];
        pose.elbowR = [-0.35, 0, 0];
        pose.thighL = [-0.45, 0, 0.04];
        pose.kneeL = [0.5, 0, 0];
        pose.thighR = [0.35, 0, -0.04];
        pose.kneeR = [0.15, 0, 0];
      }
      if (p.w.light) {
        // the phone held out ahead, low, lighting the way
        pose.shoulderR = [-1.05, 0, 0.12];
        pose.elbowR = [-0.4, 0, 0];
        pose.wristR = [0.25, 0, 0];
      }
      const drop = sit ? p.m.sitDrop(p.w.sit ?? 0.5) * mo.settle : 0;
      p.m.setPose(pose, [mo.lift[0], mo.lift[1] + drop, mo.lift[2]], mo.reach);
      p.m.setFace(1, 0);
    }
    cars?.pose();
    karts?.pose();
    pets?.pose();
    if (cars?.eye(v) && cam instanceof T3.PerspectiveCamera) {
      cam.position.copy(v);
      cam.lookAt(new T3.Vector3(...shot.look));
    }
    for (const ph of phones) {
      const hand = ph.p.m.bone("wristR");
      if (hand && !ph.prop.root.parent) hand.add(ph.prop.root);
    }
    for (const b of beams) {
      const m = b.who.m;
      m.root.updateMatrixWorld(true);
      const hand = m.bone("wristR");
      if (hand) hand.getWorldPosition(v);
      else v.copy(m.root.position).add(new T3.Vector3(0, 1.2, 0));
      const dir = new T3.Vector3(Math.sin(m.root.rotation.y), -0.05, Math.cos(m.root.rotation.y)).normalize();
      b.s.position.copy(v).addScaledVector(dir, 0.3);
      b.s.target.position.copy(v).addScaledVector(dir, 20);
      b.cone.position.copy(b.s.position);
      b.cone.lookAt(b.s.target.position);
    }
    cars?.prerender(renderer);
    composer.render();
    if (++frames === 4) {
      // where the pets' name tags go over the still (the HUD's mocks lay them on: pet-shots.spec.ts)
      if (pets)
        (window as unknown as { __g: { tags?: unknown } }).__g.tags = pets.pets.map((s) => {
          const h = s.head(new T3.Vector3()).project(cam);
          return { name: s.p.name, lost: !!s.p.lost, x: ((h.x + 1) / 2) * W, y: ((1 - h.y) / 2) * H, z: h.z };
        });
      (window as unknown as { __shot?: boolean }).__shot = true;
      status(
        `${name}: drawn in ${Math.round(performance.now() - t0)} ms · ${renderer.info.render.triangles} tris · ${renderer.info.render.calls} calls`,
      );
      cancelAnimationFrame(raf);
    }
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    cars?.dispose();
    karts?.dispose();
    pets?.dispose();
    grounds.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

// The east block's ground floor, blank: polished concrete, columns, the
// curtain wall from inside, a ceiling of fluorescent panels, the core with its
// lifts shut and the stairs' door marked restricted, one chair left behind.
function inside(T3: THREE, scene: THREE_NS.Scene, _g: unknown) {
  const x0 = 60;
  const x1 = 88;
  const z0 = -30;
  const z1 = 48;
  const H = 3.25;
  const grp = new T3.Group();
  const conc = new T3.MeshStandardMaterial({ color: "#a9a69f", roughness: 0.35, metalness: 0 });
  const floor = new T3.Mesh(new T3.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), conc);
  floor.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
  floor.receiveShadow = true;
  grp.add(floor);
  const ceil = new T3.Mesh(
    new T3.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2),
    new T3.MeshLambertMaterial({ color: "#d9d8d3" }),
  );
  ceil.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
  grp.add(ceil);
  // the fluorescent panels, in a grid, a few dead
  const panel = new T3.MeshBasicMaterial({ color: "#eef4ff", toneMapped: false });
  const dead = new T3.MeshLambertMaterial({ color: "#bfc2c4" });
  let i = 0;
  for (let x = x0 + 3; x < x1 - 1; x += 4)
    for (let z = z0 + 3; z < z1 - 1; z += 4) {
      const m = new T3.Mesh(new T3.PlaneGeometry(1.2, 0.6).rotateX(Math.PI / 2), ++i % 11 === 4 ? dead : panel);
      m.position.set(x, H - 0.01, z);
      grp.add(m);
    }
  for (const [x, z] of [
    [66, 14],
    [76, 22],
    [70, 30],
    [80, 8],
    [66, 2],
  ]) {
    const l = new T3.PointLight("#e6eeff", 5, 16, 1.2);
    l.position.set(x, H - 1.1, z);
    grp.add(l);
  }
  // columns
  const colMat = new T3.MeshLambertMaterial({ color: "#c9c6bf" });
  for (let x = x0 + 8; x < x1; x += 8)
    for (let z = z0 + 8; z < z1; z += 8) {
      const c = new T3.Mesh(new T3.BoxGeometry(0.6, H, 0.6), colMat);
      c.position.set(x, H / 2, z);
      c.castShadow = true;
      grp.add(c);
    }
  // the curtain wall from inside (the west wall: mullions, transom, a band over)
  const dark = new T3.MeshLambertMaterial({ color: "#1f262c" });
  const band = new T3.MeshLambertMaterial({ color: "#c9c5bb" });
  for (const [ax, az, bx, bz] of [
    [x0, z0, x0, z1],
    [x0, z1, x1, z1],
  ]) {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    for (let t = 0; t <= len; t += 2) {
      const m = new T3.Mesh(new T3.BoxGeometry(0.1, 2.65, 0.1), dark);
      m.position.set(ax + ux * t - uz * 0.15, 1.33, az + uz * t + ux * 0.15);
      grp.add(m);
    }
    const tr = new T3.Mesh(new T3.BoxGeometry(Math.abs(bx - ax) + 0.1, 0.07, Math.abs(bz - az) + 0.1), dark);
    tr.position.set((ax + bx) / 2 - uz * 0.15, 0.95, (az + bz) / 2 + ux * 0.15);
    grp.add(tr);
    const bd = new T3.Mesh(new T3.BoxGeometry(Math.abs(bx - ax) + 0.1, H - 2.65, Math.abs(bz - az) + 0.1), band);
    bd.position.set((ax + bx) / 2 - uz * 0.15, 2.65 + (H - 2.65) / 2, (az + bz) / 2 + ux * 0.15);
    grp.add(bd);
    const sill = new T3.Mesh(new T3.BoxGeometry(Math.abs(bx - ax) + 0.1, 0.1, Math.abs(bz - az) + 0.1), dark);
    sill.position.set((ax + bx) / 2 - uz * 0.15, 0.05, (az + bz) / 2 + ux * 0.15);
    grp.add(sill);
  }
  // the glass itself (a faint tint and reflection)
  const glass = new T3.MeshStandardMaterial({
    color: "#9fb3c2",
    transparent: true,
    opacity: 0.16,
    roughness: 0.05,
    metalness: 0.2,
    side: T3.DoubleSide,
  });
  const gw = new T3.Mesh(new T3.PlaneGeometry(z1 - z0, 2.65).rotateY(Math.PI / 2), glass);
  gw.position.set(x0 + 0.13, 1.33, (z0 + z1) / 2);
  grp.add(gw);
  // the inner walls: east and north plaster (the other faces, beyond the view, closed)
  const plaster = new T3.MeshLambertMaterial({ color: "#e6e3dc" });
  const east = new T3.Mesh(new T3.PlaneGeometry(z1 - z0, H).rotateY(-Math.PI / 2), plaster);
  east.position.set(x1 - 0.1, H / 2, (z0 + z1) / 2);
  grp.add(east);
  const north = new T3.Mesh(new T3.PlaneGeometry(x1 - x0, H), plaster);
  north.position.set((x0 + x1) / 2, H / 2, z0 + 0.1);
  grp.add(north);
  // the core: two lift doors shut, the stairs' door — restricted
  const core = new T3.Mesh(new T3.BoxGeometry(8, H, 7), plaster);
  core.position.set(78, H / 2, 6);
  grp.add(core);
  const steel = new T3.MeshStandardMaterial({ color: "#b8bcc0", roughness: 0.3, metalness: 0.85 });
  for (const z of [3.6, 6.4]) {
    const d = new T3.Mesh(new T3.BoxGeometry(0.06, 2.3, 1.9), steel);
    d.position.set(73.97, 1.15, z);
    grp.add(d);
  }
  const fd = new T3.Mesh(new T3.BoxGeometry(0.08, 2.2, 1.1), new T3.MeshLambertMaterial({ color: "#6b2a24" }));
  fd.position.set(73.96, 1.1, 8.6);
  grp.add(fd);
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 96;
  const cg = cv.getContext("2d") as CanvasRenderingContext2D;
  cg.fillStyle = "#efe9dc";
  cg.fillRect(0, 0, 256, 96);
  cg.fillStyle = "#8b2a22";
  cg.font = "700 34px Inter, Helvetica, sans-serif";
  cg.textAlign = "center";
  cg.fillText("RESTRICTED", 128, 44);
  cg.font = "500 20px Inter, Helvetica, sans-serif";
  cg.fillText("NO ACCESS BEYOND THIS DOOR", 128, 76);
  const st = new T3.CanvasTexture(cv);
  st.colorSpace = T3.SRGBColorSpace;
  const sign = new T3.Mesh(
    new T3.PlaneGeometry(0.75, 0.28).rotateY(-Math.PI / 2),
    new T3.MeshLambertMaterial({ map: st }),
  );
  sign.position.set(73.9, 1.6, 8.6);
  grp.add(sign);
  // one office chair, left behind, turned to the window
  const chair = new T3.Group();
  const cm = new T3.MeshLambertMaterial({ color: "#2c3036" });
  const seat = new T3.Mesh(new T3.BoxGeometry(0.55, 0.08, 0.55), cm);
  seat.position.y = 0.48;
  const back = new T3.Mesh(new T3.BoxGeometry(0.5, 0.6, 0.06), cm);
  back.position.set(0, 0.85, 0.26);
  const post = new T3.Mesh(new T3.CylinderGeometry(0.03, 0.03, 0.42), cm);
  post.position.y = 0.24;
  const base = new T3.Mesh(new T3.CylinderGeometry(0.3, 0.3, 0.04, 5), cm);
  base.position.y = 0.04;
  chair.add(seat, back, post, base);
  chair.position.set(66.5, 0, 31.4);
  chair.rotation.y = 2.1;
  for (const m of chair.children) m.castShadow = true;
  grp.add(chair);
  scene.add(grp);
}

/** God mode's buildings for the stills (`&prefabs=`): each kind in a cell 45 m a side, from
 *  (−400, −580), four a row. */
export function prefabSet(
  S: typeof import("@yutopia/shared/grounds"),
  how: "min" | "max" | "turn",
): import("@yutopia/shared/grounds-edits").BuildingDef[] {
  const kinds = Object.keys(S.PREFABS) as (keyof typeof S.PREFABS)[];
  return kinds.map((kind, i) => {
    const p = S.PREFABS[kind] as { min: number; max: number; floors: number };
    const w = how === "min" ? p.min : how === "max" ? p.max : Math.round((p.min + p.max) / 2);
    const d = how === "min" ? p.min : how === "max" ? Math.round((p.min + p.max) / 2) : p.min + 2;
    const [sw, sd] = how === "turn" ? [d, w] : [w, d];
    const cx = -400 + (i % 4) * 45 + 22;
    const cz = -580 + Math.floor(i / 4) * 45 + 22;
    const x0 = Math.round(cx - sw / 2);
    const z0 = Math.round(cz - sd / 2);
    return {
      key: `god-shot-${kind}`,
      kind,
      name: `Test ${kind}`,
      x0,
      z0,
      x1: x0 + sw,
      z1: z0 + sd,
      floors: how === "max" ? p.floors : 1,
      face: how === "turn" ? (i % 2 ? "w" : "n") : how === "max" ? "e" : "s",
      sign: kind === "shop" || kind === "bar" || kind === "diner" || kind === "hotel" ? "TEST" : undefined,
    };
  });
}
