import {
  CanvasTexture,
  type Group,
  type Material,
  type Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  ShaderChunk,
  SRGBColorSpace,
  type Texture,
  type Vector3,
} from "three";
import { skyLeft } from "../sky-left";
import { type Cluster, drawCluster, drawRadio } from "./vfd";

// A car's model, as the rest of the car's code sees it (docs/plan/28-the-car.md; since plan 92 made in
// Blender: glb.ts): the sprung body, the wheels that steer, spin and ride, the doors on their hinges,
// the steering wheel, the wipers, the lamps, the cabin's seats, the driver's eye and the pedals.
//
// Its frame (the "model's"): metres, standing on the ground at y = 0, its nose to −x, +z its left (the
// driver's side). The physics' frame is the other way round (x forward, z right): the rig turns one into
// the other (rig.ts FLIP).

/** What a car's built from: which kind, its paint, the snow on it, its plate and its role. */
export interface SedanOpts {
  colour: number;
  kind?: string;
  /** snow lying on it, 0..1 */
  snowy?: number;
  plate?: string;
  /** its role (shared car/homes.ts): the taxi's sign, the police car's bar */
  role?: string;
}
export interface Lights {
  beams: "off" | "low" | "high";
  tail: boolean; // the side and tail lamps (with the beams, or alone)
  brake: number; // 0..1
  reverse: boolean;
  ind: -1 | 0 | 1; // an indicator lit this instant (both: hazards are drawn by calling with each)
  hazard?: boolean;
  dash: number; // the cluster and switches' brightness (0 off, 1 full; dimmer by day)
  dome: boolean;
}
export interface Wheel {
  steer: Group; // turns about y
  spin: Group; // turns about z (the axle)
  front: boolean;
  side: 1 | -1;
  rest: Vector3; // its centre at rest (its parent's coords)
  /** how much it turns for the sim's wheel (a drawn tyre bigger or smaller than the sim's turns less or
   *  more; a model made the other way round about its axle, negative); 1 if left out */
  turnK?: number;
}
export interface Door {
  group: Group; // its hinge; rotation.y opens it (`open(a)`)
  side: 1 | -1;
  front: boolean;
  open(a: number): void;
}
/** (plan 98) a door's opening in the body's frame: front (hinge) and back edges along x, foot and top, outer face */
export interface Opening {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  out: number;
  /** the window's top (its glass's): the roof's edge just over it */
  glass: number;
  slide: boolean;
}
export interface Wiper {
  arm: Group; // turns about z (on the glass): rotation.z from `park` to `sweep`
  park: number;
  sweep: number;
  pivot: number; // z (the model's)
  len: number;
  blade: number;
  /** its fan on the windscreen's picture (fx.ts ScreenSnow): 0 lying along +z, π along −z; `park` and
   *  `sweep` if left out */
  fan?: { park: number; sweep: number };
}

export interface Sedan {
  root: Group;
  body: Group; // the model's frame: people sit in it, the cabin's light hangs in it
  wheels: Wheel[]; // FL, FR, RL, RR
  doors: Door[]; // FL (the driver's), FR, RL, RR (and the van's slide)
  steering: Group; // the steering wheel: rotation.z turns it
  wipers: Wiper[];
  freshener: Group; // rotation.x / z swing it
  snow: Mesh[];
  /** where people sit: the hip point and the side (model coords) */
  /** (plan 96) `floor`: its footwell's floor (model coords' height), where its model has one */
  seats: { hip: Vector3; side: 1 | -1; front: boolean; floor?: number }[];
  /** which door a seat's person gets in by (an index in `doors`, -1: none) */
  doorOf?: (seat: number) => number;
  /** the driver's eyes (model coords, sitting back) */
  eye: Vector3;
  /** over the bonnet: the hood camera's eye (model coords) */
  hood?: Vector3;
  /** the cluster's middle (model coords), once its model's in: the cockpit framed by it (camera.ts) */
  clusterAt?(out: Vector3): Vector3 | null;
  /** (plan 62) the pedals' faces — clutch, brake, throttle — and the footwell floor's height (model coords) */
  pedals?: Vector3[];
  floor?: number;
  /** the body: its length, where its front axle is (the profile's u: so `axleF + spec.front - L / 2` is
   *  the model's origin from the CoG along x), which */
  dims: { L: number; axleF: number; kind: string };
  /** the lamps (model coords): headlamps' centres; tail lamps; the exhaust's end */
  lamps: { head: Vector3[]; tail: Vector3[]; exhaust: Vector3 };
  /** the rear-view mirror's glass (model coords: it faces +x, the driver) */
  rearView: Mesh;
  /** the windscreen: its foot and top (u from the nose, y), half-widths, its length up the glass */
  screen: { u0: number; y0: number; u1: number; y1: number; hw0: number; hw1: number; len: number };
  /** whether its model is in (a Blender car comes a moment after it's asked for), and when */
  ready?: boolean;
  loaded?: Promise<void>;
  /** a point on the steering wheel's rim (body coords): `phi` from 12 o'clock towards the driver's right */
  rim(phi: number, out?: Vector3): Vector3;
  /** (plan 93) the gear lever's knob (body coords), if it has one */
  leverAt?(out: Vector3): Vector3 | null;
  /** (plan 93 S2) a door's window wound down (its glass gone from the frame) or up */
  /** (plan 95 F1a) wound down or up over `secs` (1.5 s by default); true: a move began (the motor's heard) */
  windowDown?(door: number, down: boolean, secs?: number): boolean;
  /** (plan 95 F1a) each frame: the windows on their way */
  windowsTick?(dt: number): void;
  /** (plan 93 S6) snow chains on its wheels (bits FL FR RL RR), its tyres' radius and width (m) */
  setChains?(bits: number, r: number, width: number): void;
  /** (plan 93 S5) a door's sill: its glass's foot (the body's frame), how far out its outer face is */
  sillOf?(door: number): { y: number; out: number } | null;
  /** (plan 98) a door's opening, measured off the shut door */
  openingOf?(door: number): Opening | null;
  /** a lid or a back door opened `a` (radians): the bonnet, the boot */
  setPart?(name: string, a: number): void;
  setSteer(road: number): void;
  setLights(l: Lights): void;
  setCluster(c: Cluster): void;
  setRadio(band: "FM" | "AM" | "TAPE", f: number, preset: number): void;
  setScreenSnow(t: Texture | null): void;
  setEnv(t: Texture | null): void;
  /** its role's light: the taxi's sign lit (free), the police car's bar flashing (`t` seconds) */
  setBeacon(on: boolean, t: number): void;
  /** its wear: the road's dirt up its sides (0..1), its dents (front, rear, left, right[, roof]: 0..1); a
   *  front badly hit, a headlamp cracked (dim); (plan 92) the parts it broke — shared car/damage.ts PART:
   *  the bumper hanging or gone, a mirror folded, a lamp out, the glass cracked or shattered */
  setWear(grime: number, dmg: readonly number[], parts?: number, wreck?: number, fire?: number): void;
  /** (plan 94 G5) a corner jacked up (wheel FL FR RL RR, 0..1 of 6 cm), and a wheel off or on */
  liftCorner?(i: number, k: number): void;
  wheelShown?(i: number, on: boolean): void;
  /** (plan 94 P1) where its engine burns (the middle of its bay), its own coords */
  engineAt?(out: Vector3): Vector3;
  /** (plan 93 S1) where it's been shot: its own frame (u forward, w right, h up from the ground; the face it came in by) */
  setHoles?(list: readonly import("@yutopia/shared/car").Hole[]): void;
  /** (plan 95 F6a) each wheel's hub's rise for its flats (its body's sag undone, the flat's down: m) */
  flatY?: readonly number[];
  /** (plan 95 F6a) each frame it moves: its flat tyres' squash where they are */
  flatsTick?(wheels?: boolean): void;
  /** (plan 96 F5a) a blowout's collapse under way */
  flatsBusy?(): boolean;
  /** (plan 95 F5a) a point on it (its own frame: u forward, w right, h up) where its root has it */
  skinAt?(u: number, w: number, h: number, out: import("three").Vector3): import("three").Vector3;
  /** Parked for good: its dents pressed in and its pieces drawn merged (Blender cars: glb.ts). */
  bakeStill?(): number;
  /** (plan 92) a copy of one of its parts as it is now (the bumper falling off), in world coords; null if
   *  it has none */
  partCopy?(name: string): Object3D | null;
  /** (plan 94 P3) the middle of one of its panes of glass (shared car/damage.ts PANES), its own coords; null if
   *  it has none */
  paneAt?(i: number): Vector3 | null;
  /** the snow lying on it (since it last moved: docs/plan/65), 0..1 — its paint's frost */
  setSnow(k: number): void;
  dispose(): void;
}
/** (plan 92) the same thing, by its name now */
export type CarModel = Sedan;

// the light chunk with the scene's sun and the sky's fill scaled by what's left of them
const SKY_LIT = ShaderChunk.lights_fragment_begin
  .replace(
    "getDirectionalLightInfo( directionalLight, directLight );",
    "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= skyLeft;",
  )
  .replace(
    "irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );",
    "irradiance += skyLeft * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );",
  );
/** A lit material of a vehicle: in the pitch dark only what's left of the sky's sun and fill
 *  (sky-left.ts); the lamps', the headlights' and the torches' light stay. On top of what it has. */
export function skyLit(m: Material) {
  if (m.userData.skyLit || !(m instanceof MeshStandardMaterial || m instanceof MeshLambertMaterial)) return;
  m.userData.skyLit = true;
  const prev = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.skyLeft = skyLeft;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float skyLeft;")
      .replace("#include <lights_fragment_begin>", SKY_LIT);
  };
  m.customProgramCacheKey = () => `${key.call(m)}|sky`;
}

/** The dash a parked car shows, one for them all: never let go by one. */
let parked: { cluster: CanvasTexture; radio: CanvasTexture } | null = null;
export function parkedDash(): { cluster: CanvasTexture; radio: CanvasTexture } {
  if (parked) return parked;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  drawCluster(c, {
    kmh: 0,
    rpm: 0,
    gear: "N",
    fuel: 0.7,
    temp: 0.1,
    clock: "12:00",
    outside: -8,
    odo: 87412,
    beams: "off",
    ind: 0,
    hand: true,
    helps: false,
  });
  const r = document.createElement("canvas");
  r.width = 512;
  r.height = 128;
  drawRadio(r, "FM", 98.7, 3);
  const cluster = new CanvasTexture(c);
  cluster.colorSpace = SRGBColorSpace;
  cluster.anisotropy = 8;
  const radio = new CanvasTexture(r);
  radio.colorSpace = SRGBColorSpace;
  for (const t of [cluster, radio]) t.dispose = () => {};
  parked = { cluster, radio };
  return parked;
}
