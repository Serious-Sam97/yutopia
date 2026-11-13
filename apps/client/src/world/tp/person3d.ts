import { drinkAs, type HeldKind, heldState, isDrink, isHeld, isSocial, SOCIAL_MS } from "@yutopia/shared";
import { AIM_BLADE, BEAM } from "@yutopia/shared/beam";
import { flowOfCode, KH_FEEL, KH_MOVE, unpackMv } from "@yutopia/shared/move";
import type { PhysicsWorld } from "@yutopia/shared/physics";
import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  type Ray,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import type { chars } from "../art/chars-load";
import { COCOA_MUG, ICE_TUB, MUG_COLORS } from "../art/held";
import { phoneColors } from "../art/phone-art";
import type { HandFrame } from "../chars/props";
import type { JointName, Pose } from "../chars/rig";

const puffAt = new Vector3();
const puffDir = new Vector3();

import {
  AK_CLOSE,
  AK_LOAD_BLADE,
  AK_LOAD_GUN,
  AK_LONG,
  AK_POUCH,
  AK_LOAD as AK_RL,
  akLoadAt,
  DROP,
  MAG,
  MAG_HAND,
  RACK_HAND,
} from "./ak-hold";
import {
  cueModel,
  type GunFx,
  type GunKind,
  type GunModel,
  gunModel,
  isLongGun,
  lifeGunModel,
  poseGun,
  shellGeometry,
} from "./guns3d";
import { levelHands } from "./level3d";
import { type LongSpec, longHold, longInHand, type SlingSpec } from "./long-hold";
import type { PersonIn } from "./person-in";
import {
  at,
  type BodyFrame,
  bodyDir,
  CYL_PALM,
  cantOf,
  DRAW_LIFT,
  DRAW_MEET,
  FIST,
  gunQuat,
  HARRIES,
  holsterHold,
  INDEX,
  KICK,
  LOADER_IN_HAND,
  LOADER_START,
  legAt,
  MOCK_ARM,
  newHold,
  RELOAD_CLOSE,
  RELOAD_GUN,
  RELOAD_KEYS,
  RELOAD_LEFT,
  RELOAD_LEN,
  RELOAD_RIGHT,
  reloadAt,
  revolverHold,
  SUPPORT,
  SUPPORT_THUMB,
} from "./revolver-hold";
import { ANKLE_M, SEATS, seatFit, seatShape } from "./seats3d";
import {
  CARRIER,
  CHAMBER,
  LEVER_THUMB,
  SG_HINGE,
  SG_LOAD_BLADE,
  SG_LOAD_CLOSE,
  SG_LOAD_GUN,
  SG_LOAD_GUN_LEGS,
  SG_LOAD_LEN,
  SG_LOAD_RIGHT,
  SG_LONG,
  SG_PORT,
  SHELL_MOUTH,
  SHELL_PALM,
  sgLoadAt,
} from "./shotgun-hold";

type Chars = NonNullable<ReturnType<typeof chars>>;
type SwimM = NonNullable<ReturnType<Chars["swimNow"]>>;
type SwimHands = ReturnType<SwimM["wade2"]>["hands"];
// (the sprint's place in shared move GAITS: the crawl — packMv's low bits)
const SPRINT_GAIT = 3;
type Model = InstanceType<Chars["PersonModel"]>;
const snowA = new Vector3();
const snowB = new Vector3();
const snowC = new Vector3();
const snowQ = new Quaternion();
const snowQ2 = new Quaternion();
type Prop = ReturnType<Chars["buildProp"]>;
type MotionOut = ReturnType<InstanceType<Chars["Motion3"]>["update"]>;

// A person in 3D (docs/plan/22-people-3d.md, P4): their Ligne claire model
// (world/chars), posed every frame by its motion layers (chars/motion.ts),
// lit by the room's light map, sitting on real seat heights, holding real
// things. Vortex stays his drawing (stand3d.ts Vortex3): he must look exactly like
// Yondra's.

const SIT_IN = 0.3; // s: sitting down / getting up
const STAND_RISER = 0.45; // m: a stand's row over the one before (shared/kart/park.ts kartSeats)
const PICK_R = 0.26; // tiles: how wide a person is to a click
const LIFE_GUN_SCALE = 1;
/** (shared ARMS.revolver.aim: the revolver up from the ready, s) */
const AIM_S = 0.18;
const ARM_BOLT = 4;
/** (plans 81–82) The long guns on the gun-as-anchor hold (tp/long-hold.ts), by their key */
const LONG: Record<string, LongSpec> = { shotgun: SG_LONG, ak47: AK_LONG };
/** (plan 80) past this (m from the camera) the revolver's hold is a cheaper one: the bodies' far detail */
const FAR_HOLD = 11;
/** (shared ARM.reload, ARM.open: the gun being reloaded, opened — Player.arm) */
const ARM_RELOAD = 2;
const hdTo = new Vector3();
const ARM_OPEN = 3;
/** (shared ARM.shut, ARM.rack: the AK's closing — shouldered, or its charging handle racked first: plan 82) */
const ARM_SHUT = 6;
const ARM_RACK = 7;
/** (plan 82) Where a long gun hangs slung on her back (her chest bone's space): over the other one, if she
 *  carries both */
function slungAt(SL: SlingSpec, p: PersonIn, out: Vector3): Vector3 {
  out.copy(SL.at);
  if (SL.over && p.sling && p.slingAk) out.z -= SL.over;
  return out;
}
const lgSlung = new Vector3();
/** (plan 82 phase 4) the AK reload's */
const akV1 = new Vector3();
const akV2 = new Vector3();
const akV3 = new Vector3();
const akV4 = new Vector3();
const akS = new Vector3();
const akS3 = new Vector3();
const akS4 = new Vector3();
const akQ1 = new Quaternion();
const akQ2 = new Quaternion();
const akQ3 = new Quaternion();
const akQ4 = new Quaternion();
const akQA = new Quaternion();
const akQB = new Quaternion();
const akAtA = new Vector3();
const akAtB = new Vector3();
const akForeAt = new Vector3();
const akForeQ = new Quaternion();
const akM1 = new Matrix4();
const akM2 = new Matrix4();
const akM3 = new Matrix4();
const akM4 = new Matrix4();
const akMW = new Matrix4();
/** (plan 82) Aimed, a cheek on the stock: her neck turned at most this far (rad); the gun brought up and in
 *  to her face the rest — at most this far (its up, its right: m), this much of what's left a frame */
const CHEEK_NECK = 0.52;
const CHEEK_GUN = { y: [-0.02, 0.07] as const, z: [-0.06, 0.02] as const, gain: 0.25, back: 0.03 };
/** (plan 82) cheekTo's */
const chP = new Vector3();
const chQ = new Quaternion();
const chS = new Vector3();
const chX = new Vector3();
const chY = new Vector3();
const chZ = new Vector3();
const chE = new Vector3();
const chQ0 = new Quaternion();
const chT = new Quaternion();
/** (plan 82) the long gun's hold eased in this frame: her root's turn, from her right shoulder */
const lgFW = new Matrix4();
/** (plan 81) the stock the right arm keeps out of, reloading and carried */
const sgAvoid = { a: new Vector3(), b: new Vector3(), r: 0.045 };
/** (plan 81 phase 4) A shell's mesh, one for everyone */
let SG_SHELL_GEO: BufferGeometry | null = null; // (shared ARM.bolt: the sniper's bolt worked — Player.arm)
/** The model a gun's id draws (the pool cue's carried as the double-barrel is). */
const gunKind = (key: string): GunKind =>
  key === "shotgun" || key === "cue"
    ? "shotgun"
    : key === "ak47" || key === "sniper" || key === "daybreak"
      ? key
      : "revolver";
/** The sniper's bolt worked (plan 79 phase 6): its time (shared ARMS.sniper.bolt, the server's
 *  ARM.bolt), the knob in the bolt's own frame; its reload's rounds thumbed in at the port, one each
 *  `each` s after the bolt's back (`open`). */
const SNIPER = { bolt: 0.85, knob: [-0.006, -0.03, 0.065], port: [0.06, 0.11, 0.04], open: 0.35, each: 0.5 } as const;
/** The AK's reload, the left hand's times (s from its start — plan 79 phase 5, in time with shared
 *  ARMS.ak47's steps: the magazine out by 0.8, the new one in by 1.8, racked by 2.8) and the magazine's
 *  rock on its lug (rad). */
const AK_LOAD = {
  reach: 0.25,
  out: 0.45,
  down: 0.8,
  at: 0.95,
  up: 1.45,
  in: 1.75,
  done: 1.8,
  over: 2.1,
  pull: 2.3,
  let: 2.4,
  back: 2.8,
  tilt: 0.35,
  slide: 0,
  grab: [0.13, -0.075, -0.03],
  lift: 0.09,
  part: "magazine",
  pouch: [0.24, 0.98, 0.34],
};
/** The Daybreak's (plan 79 phase 7): the cell out underneath by 0.7, the new one in by 1.6 (shared
 *  ARMS.daybreak: 0.7, 0.9, 0.4) — it slides, it doesn't rock; never racked. */
const CELL_LOAD: typeof AK_LOAD = {
  reach: 0.2,
  out: 0.4,
  down: 0.7,
  at: 0.8,
  up: 1.25,
  in: 1.5,
  done: 1.6,
  over: 9,
  pull: 9,
  let: 9,
  back: 9,
  tilt: 0,
  slide: 0.07,
  grab: [0.17, -0.02, -0.04],
  lift: 0.03,
  part: "cell",
  pouch: [0.24, 0.98, 0.34],
};
// (plan 79 phase 4) a gun's draw — the hands up from the side (shared ARMS' draw) — and its put-away (s)
const DRAW_S = 0.35;
const HOLSTER_S = 0.25; // the life look's guns in the hand (plan 79: life size, as the life people are)

export interface Mats {
  body: Material;
  bodyAway: Material;
  ink: Material;
  inkAway: Material;
  /** a held thing's flat colours, lit by the room */
  prop: (color: string) => Material;
  /** a pet toy in the hand (the pets chunk makes those), when it's loaded */
  toy?: (kind: string) => Object3D | null;
  /** a pool ball in the hand (shared/pool-throw.ts held "pball:<n>") */
  pball?: (n: number) => Object3D;
  /** a gun's life-look model (plan 79: public/life/guns/<kind>.glb), once the view has it — till then
   *  null (the drawn one stands in) */
  gun?: (kind: string) => Object3D | null;
  /** the shadowed, wrapped in the dark (docs/plan/30-the-dark.md D5) */
  shade?: Material;
  shadeInk?: Material;
}

export interface Seen {
  camX: number;
  camZ: number;
  onScreen: boolean;
  lowQuality: boolean;
  /** (plan 58) the mood: 0 day … 1 the dark */
  mood?: number;
  /** (plan 58 4f) the ground's height under a spot (the floor's x, y; from a height there), or null */
  groundAt?: (x: number, y: number, from: number) => number | null;
  /** (plan 58 5d) the world's physics for a ragdoll, and its origin in the scene */
  rag?: () => { world: PhysicsWorld; origin: () => { x: number; y: number; z: number } } | null;
  /** (plan 61) their joints swung on Jolt this frame: the springs leave them be */
  sway?: ReadonlySet<JointName>;
  /** (plan 63) a foot of theirs put down, as it lands: a step heard */
  step?: (id: string, side: "L" | "R") => void;
  /** (plan 63) both feet down at once out of the body's own hop (a turn round from a run) */
  hop?: (id: string, hard: number) => void;
  /** (plan 63) limp on the ragdoll, it hit something (`hard` 0..1: by how much it was stopped) */
  thud?: (id: string, hard: number) => void;
}
// (the speed a gait goes for: the body with weight's — walker.ts)
function goalOf(mv: number): number | undefined {
  const g = unpackMv(mv).gait;
  return g === "walk" || g === "jog" || g === "sprint" || g === "crouch" || g === "aim" ? KH_FEEL[g] : undefined;
}

const gq = new Quaternion();
const hu = new Vector3();
const hs = new Vector3();
const hp = new Vector3();
const ht = new Vector3();
const hb = new Vector3();
const hq = new Vector3();
const hv = new Vector3();
const hx = new Vector3();
const hw = new Vector3();
const hf = new Vector3();
const hz = new Vector3();
const tm = new Matrix4();
const tq3 = new Quaternion();
const gx = new Vector3();
const gy = new Vector3();
const gz = new Vector3();
const gm = new Matrix4();
// the gun's frame (x along the barrel, y up, z right) into the wrist's (the barrel −y, up +z)
const GUN_IN_WRIST = new Matrix4().makeBasis(new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0));
// (plan 79 phase 4) a life gun in its hand: the grip across the palm, raked forward this much going up (rad,
// the models' own: tools/art/guns), its middle (the gun's frame) at the fingers' roots, out of the palm by
// its half thickness; the palm on its right side, the barrel along the knuckles
const GUN_RAKE = 0.38;
const GUN_GRIP_MID = new Vector3(-0.012, -0.012, 0);
const GUN_GRIP_R = 0.017;
const GUN_GRIP_SHAPE = { round: true as const, r: GUN_GRIP_R, y0: 0, hy: 0.045 };
const gA = new Vector3();
const gB = new Vector3();
const gC = new Vector3();
const gG = new Matrix4();
const gT = new Matrix4();
const UP_GRIP = new Vector3(Math.sin(GUN_RAKE), Math.cos(GUN_RAKE), 0);
function gunInHand(_kind: GunKind, f: HandFrame, q: Quaternion, p: Vector3) {
  const A = gA.copy(f.across).addScaledVector(f.n, -f.across.dot(f.n)).normalize();
  const C = gC.copy(f.n).normalize().negate();
  const B = gB.crossVectors(A, C);
  gG.makeBasis(tv4.crossVectors(UP_GRIP, Z3), UP_GRIP, Z3);
  gT.makeBasis(B, A, C);
  q.setFromRotationMatrix(gT.multiply(gG.transpose()));
  p.copy(f.mid)
    .multiplyScalar(0.9)
    .addScaledVector(f.n, 0.013 + GUN_GRIP_R)
    .sub(tv4.copy(GUN_GRIP_MID).applyQuaternion(q));
}
/** The grip's shape for the fingers (its +y up the grip), in the wrist's space, the gun placed q, p. */
function gripShapeAt(q: Quaternion, p: Vector3, pos: Vector3, quat: Quaternion) {
  pos.copy(GUN_GRIP_MID).applyQuaternion(q).add(p);
  quat.setFromUnitVectors(Y3, UP_GRIP).premultiply(q);
}
const Z3 = new Vector3(0, 0, 1);
// (plan 80: the revolver hold's)
const FIST_SHAPE = { round: true as const, r: FIST.r, y0: 0, hy: FIST.hy };
const rv1 = new Vector3();
const rv2 = new Vector3();
const rv3 = new Vector3();
const rAt = new Vector3();
const rLAt = new Vector3();
const rs1 = new Vector3();
const rs2 = new Vector3();
const rq1 = new Quaternion();
const rq2 = new Quaternion();
const rTurn = new Quaternion();
const rq3 = new Quaternion();
const rv4 = new Vector3();
const rv5 = new Vector3();
const rL = new Matrix4();
const rM2 = new Matrix4();
/** (plan 81) one strap segment: a unit box, scaled to it */
const STRAP_BOX = new BoxGeometry(1, 1, 1);
// (plan 80 phase 4: the reload's)
const rL0 = new Matrix4();
const rL1 = new Matrix4();
const rLh = new Matrix4();
const rMg = new Matrix4();
const rgA = new Vector3();
const rgB = new Vector3();
const rqA = new Quaternion();
const rqB = new Quaternion();
const rqRoot = new Quaternion();
const rhA = new Vector3();
const rhB = new Vector3();
const rhqA = new Quaternion();
const rhqB = new Quaternion();
const rh = new Vector3();
const rx = new Vector3();
const ry = new Vector3();
const rn = new Vector3();
const ra = new Vector3();
const rc = new Vector3();
const rp = new Vector3();
const ZERO3 = new Vector3();
const IDQ = new Quaternion();
const X3 = new Vector3(1, 0, 0);
/** the speedloader's body in the fingertips; the cylinder in the left hand (round, along their axes) */
const LOADER_SHAPE = { round: true as const, r: 0.0215, y0: 0, hy: 0.009 };
const CYL_SHAPE = { round: true as const, r: 0.023, y0: 0, hy: 0.021 };
// (the pouch on the hips: at the belt on her right hip's front, its back to her)
const POUCH_AT = new Vector3(-0.15, 0.0, 0.1);
const POUCH_TURN = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(new Vector3(0.51, 0, 0.86), new Vector3(0, 1, 0), new Vector3(-0.86, 0, 0.51)),
);
// (plan 80) the holster on the hips (their own space: x her left, y up, z ahead): on her right hip at the
// belt, the gun in it muzzle down (a touch forward), its left side against her
const HOLSTER_AT = new Vector3(-0.2, 0.03, -0.02);
const HOLSTER_TURN = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(
    new Vector3(0, -1, 0.12).normalize(),
    new Vector3(0, 0.12, 1).normalize(),
    new Vector3(-1, 0, 0),
  ),
);
const rM = new Matrix4();
const sgD = new Vector3();
const sgP = new Vector3();
/** How far a point is from a segment */
function segGap(p: Vector3, a: Vector3, b: Vector3): number {
  const d = sgD.subVectors(b, a);
  const k = Math.max(0, Math.min(1, sgP.subVectors(p, a).dot(d) / Math.max(1e-12, d.lengthSq())));
  return sgP.copy(a).addScaledVector(d, k).distanceTo(p);
}
const Y3 = new Vector3(0, 1, 0);
const tv4 = new Vector3();

/** an angle into −π…π */
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

// shot down, burning away (deathPose): the outline gone, the body lit from within
const NO_INK = new MeshBasicMaterial({ visible: false });
const DARK = new Color(0x0c0d10);
const HOT = new Color(3, 2.9, 2.6); // the shot's flash, through it
const BURN = new Color(1.3, 0.94, 0.54); // pale gold
const ASH = new Color(0.62, 0.58, 0.54);
const ramp = (x: number, a: number, b: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const tq = new Quaternion();
const tq2 = new Quaternion();
const tv = new Vector3();
const tv2 = new Vector3();
const tv3 = new Vector3();

/** (plan 62) Playing the piano: sat on its stool, facing its keys, the hands on them (wide, along
 *  them) — as sat at a desk typing. Its parts (tp/view.ts): the keys, then the stool. */
function atPiano(p: PersonIn): PersonIn {
  const [keys, stool] = p.parts ?? [];
  if (p.busy !== "piano" || !keys || !stool) return p;
  return {
    ...p,
    a: 2,
    seat: "stool",
    x: stool.x,
    y: stool.y,
    angle: Math.atan2(keys.y - stool.y, keys.x - stool.x),
    typing: true,
    keys: { ...keys, spread: PIANO_SPREAD },
  };
}
const PIANO_SPREAD = 0.2; // m: the hands apart along the keys, at most

/** (plan 62) Where someone on a pool shot stands, turned along its cue, and their hands on it in their
 *  own space: the bridge on the cloth behind the tip, the back hand at the butt (beside the hip). */
interface Stance {
  x: number;
  z: number;
  a: number;
  parts: [number, number, number][];
}
const BRIDGE = 0.22; // m: the bridge hand behind the tip
const GRIP = 0.16; // m: the back hand in from the butt
function cueStance(cue: { tip: [number, number, number]; butt: [number, number, number] }): Stance {
  const [tx, ty, tz] = cue.tip;
  const [bx, by, bz] = cue.butt;
  const len = Math.hypot(tx - bx, ty - by, tz - bz) || 1;
  const at = (d: number): [number, number, number] => {
    const u = d / len;
    return [bx + (tx - bx) * u, by + (ty - by) * u, bz + (tz - bz) * u];
  };
  const a = Math.atan2(ty - by, tx - bx);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const grip = at(GRIP);
  const bridge = at(len - BRIDGE);
  // (the cue under the right side of the chin: the body a little left of it, the back hand a little
  // behind the hip)
  const x = grip[0] + c * 0.2 + s * 0.15;
  const z = grip[1] + s * 0.2 - c * 0.15;
  // (into her own space: x her left, y up, z ahead)
  const own = (q: [number, number, number], dy = 0): [number, number, number] => {
    const dx = q[0] - x;
    const dz = q[1] - z;
    return [dx * s - dz * c, q[2] + dy, dx * c + dz * s];
  };
  return { x, z, a, parts: [own(bridge, -0.025), own(grip)] };
}

// (the legs' parts and how far their skin reaches under the joint: legsUnder)
const LEG_SKIN: [JointName, number][] = [
  ["kneeL", 0.07],
  ["kneeR", 0.07],
  ["ankleL", 0.08],
  ["ankleR", 0.08],
  ["toeL", 0.03],
  ["toeR", 0.03],
];
const LEG_AT = new Vector3();

export class Person3D {
  readonly root = new Group();
  readonly model: Model;
  private motion: InstanceType<Chars["Motion3"]>;
  private turned: number | null = null;
  private last: { x: number; y: number } | null = null;
  // how they've been moving (smoothed): the velocity, the speed and its change, the feet
  private vx = 0;
  private vy = 0;
  private spd = 0;
  private acc = 0;
  private turnRate = 0;
  private lastH = 0;
  private vz = 0;
  private wasUp = false;
  private sitW: number | null = null;
  // (plan 62) sat: the seat's fit (the hips along it, the lean, the floor under the feet); sitting
  // down from where she stood, getting up from the seat; how far down onto it the motion has her
  private sat: { seat: string; along: number; fit: import("../chars/anim/acts").SitFit } | null = null;
  private sitFrom: { x: number; z: number } | null = null;
  private seatOff = { x: 0, z: 0 };
  private wasSitting = false;
  private stanceW = 0;
  private stance: Stance | null = null;
  private settled = 0;
  private ring: Mesh;
  private shadow: Mesh;
  private held: { key: string; kind: string; prop: Prop | null; toy: Object3D | null } | null = null;
  private phone: { key: string; prop: Prop } | null = null;
  private actKey = "";
  private actSeen = 0;
  private due = 0; // motion time not stepped yet (off screen, far away)
  private away = false;
  private dark = false;
  private burning: MeshBasicMaterial | null = null;
  private crawlPh = 0;
  private downW = 0;
  // the swim (plan 66): its driver while in the water, how much of the body it has
  private swim2: InstanceType<SwimM["Swim2"]> | null = null;
  private swimW = 0;
  private jumpH = 0; // off the floor (a jump), tiles
  private jumpOn = false;
  private headUp = 0; // the head's height standing as they last stood (the tag stays over it through a flip)
  /** what posed them last (first person's hands take mine from here) */
  motionOut: MotionOut | null = null;
  /** what the body was last drawn doing (a verb, a jump, a Flowmotion move: "" none) — tests */
  drawn = { verb: "", jump: "", flow: "" };
  /** (plan 61) how far from the camera, if what they wear may swing on Jolt (seen whole, motion not
   *  reduced, plan 58's animations): else never */
  swayD = Number.POSITIVE_INFINITY;
  /** plan 58's tension as eased (-1: not yet) */
  private mood = -1;
  /** (plan 58 4f) the ground under a spot in her own space (x her left, z ahead), off her feet's height */
  /** (plan 62) How long she's been at what she's busy at (s): a machine's press first, then its drink. */
  private busyWas = "";
  private busySince = 0;
  private busyT(busy: string): number {
    const now = performance.now() / 1000;
    if (busy !== this.busyWas) {
      this.busyWas = busy;
      this.busySince = now;
    }
    return now - this.busySince;
  }
  /** (plan 62) The keys she types on, in her own space (x her left, y up from her feet, z ahead). */
  private keysIn(
    k: { x: number; y: number; h: number; spread?: number },
    p: PersonIn,
    h: number,
  ): [number, number, number, number?] | undefined {
    if (this.turned === null) return undefined;
    const r = this.root.position;
    const dx = k.x - (this.part === "all" ? r.x : p.x);
    const dy = k.y - (this.part === "all" ? r.z : p.y);
    const c = Math.cos(this.turned);
    const sn = Math.sin(this.turned);
    return [dx * sn - dy * c, k.h - h, dx * c + dy * sn, k.spread];
  }
  /** (plan 62) The seat she's on, fitted to her: where her hips go along it, how far she leans back,
   *  the floor under her feet (a room's floor; out on the land the ground or the step below, by the
   *  world's ray once she's near, kept within her legs' reach). */
  private seatOf(p: PersonIn, h: number, seen: Seen): { along: number } {
    const kind = p.seat ?? "";
    const m = this.model;
    if (this.sat?.seat === kind && m.ready) return this.sat;
    const s = seatShape(p.seat);
    const leg = m.leg();
    const { along, recline } = seatFit(s, leg.thigh);
    const drop = m.sitDrop(s.top);
    const hip = leg.hipY + drop;
    // (a seat's footrest, a bar stool's ring: the feet on it — plan 67)
    let floor = s.rest ?? 0;
    if (!SEATS[kind]) {
      // (ahead of the seat's front, from under its top: the lowest of a few — a stand's footwell, not
      // the ledge before it)
      let g: number | null = null;
      for (const ahead of [0.35, 0.5, 0.65]) {
        const x = p.x + Math.cos(p.angle) * (along + ahead);
        const y = p.y + Math.sin(p.angle) * (along + ahead);
        const at = seen.groundAt?.(x, y, h + s.top - 0.06) ?? null;
        if (at !== null && (g === null || at < g)) g = at;
      }
      // (a seat solid to its front at its own height — a stand's row, a block in the physics — has
      // its feet a riser down, in the row's footwell as it's drawn: tp/kart/park3d.ts)
      if (g !== null && g - h > s.top - 0.12) g -= STAND_RISER;
      const reach = hip - ANKLE_M - 1.9 * leg.thigh;
      floor = g === null || g - h < reach ? hip - ANKLE_M - 0.47 : Math.min(g - h, hip - ANKLE_M - 0.3);
    }
    const fit = {
      drop,
      stand: leg.hipY,
      thigh: leg.thigh,
      floor,
      recline,
      ahead: s.solid ? s.front - along + 0.06 : 0,
      arms: s.arms ?? null,
    };
    const out = { seat: kind, along, fit };
    if (m.ready && (SEATS[kind] || seen.groundAt)) this.sat = out;
    return out;
  }
  // how far the legs' lowest part is under the ground she stands on (the root's height), skin and
  // all (a knee's, an ankle's over its sole, a toe's): 0 when none is
  private legsUnder(): number {
    this.root.updateMatrixWorld(true);
    const g = this.root.getWorldPosition(LEG_AT).y;
    let under = 0;
    for (const [j, r] of LEG_SKIN) {
      const b = this.model.bone(j);
      if (b) under = Math.max(under, g + r - b.getWorldPosition(LEG_AT).y);
    }
    return under;
  }
  private groundFn(p: PersonIn, at: (x: number, y: number, from: number) => number | null) {
    const a = this.turned ?? p.angle;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const h = p.z ?? 0;
    return (lx: number, lz: number) => {
      // (ahead is the facing's way; her left, the floor's y being south, is (sin, −cos))
      const x = p.x + c * lz + s * lx;
      const y = p.y + s * lz - c * lx;
      const g = at(x, y, h + 0.6);
      // (the ray looks 1.4 m down: higher, what's under her as the world has it — the controller's
      // Jolt ground, a roof or the land — so a fall's height is its own, not 1.4 m at most)
      return g === null ? (p.ground ?? h) - h : g - h;
    };
  }
  /** (plan 58 5d) down on the ragdoll and up again (the world's physics), a fall's top, the facing
   *  while getting up, one of the shadowed shot down already laid on it */
  limp: InstanceType<NonNullable<ReturnType<Chars["airNow"]>>["Downed"]> | null = null;
  private fallTop: number | null = null;
  private limpYaw: number | null = null;
  // (plan 63) the ragdoll's speed last frame (its impacts heard)
  private ragSpeed = 0;
  /** (plan 58 5d) Getting up off the ragdoll: the way the body's turned (as `angle`), or null. */
  upFacing(): number | null {
    return this.limpYaw !== null ? this.turned : null;
  }
  private shotDown = false;
  /** (plan 58 8) one of the shadowed's body as it was when its time caught: held a beat */
  private shadeHeld: { pose: Pose; lift: [number, number, number] } | null = null;
  /** (plan 58 9) the breath's puffs in the cold */
  private puffs: {
    update(dt: number, at: Vector3, dir: Vector3, breath: number, cold: number): void;
    dispose(): void;
  } | null = null;

  constructor(
    readonly id: string,
    private C: Chars,
    factory: InstanceType<Chars["CharFactory"]>,
    private mats: Mats,
    p: PersonIn,
    /** "arms": only shoulder to fingertips — my own, in front of my eyes (hands1p.ts) */
    readonly part: "all" | "arms" = "all",
  ) {
    this.model = new C.PersonModel(
      factory,
      p.avatar,
      part === "arms" ? 0 : 1,
      { body: mats.body, ink: mats.ink, away: mats.bodyAway },
      part,
    );
    this.model.seed = C.nameSeed(p.name || id);
    this.motion = new C.Motion3(hashSeed(p.name || id));
    this.root.add(this.model.root);
    this.shadow = new Mesh(
      new CircleGeometry(0.26, 24),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.root.add(this.shadow);
    this.ring = new Mesh(
      new RingGeometry(0.3, 0.36, 40),
      new MeshBasicMaterial({ color: 0xffb43c, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.006;
    this.root.add(this.ring);
  }

  get ready() {
    return this.model.ready;
  }

  /** Step and pose them; `given` poses them with someone else's motion (my hands with my body's). */
  update(p: PersonIn, dt: number, seen: Seen, given?: MotionOut) {
    p = atPiano(p);
    const sitting = p.a === 2;
    // detail by distance (low quality never builds the closest level)
    const d = Math.hypot(seen.camX - p.x, seen.camZ - p.y);
    let lod: 0 | 1 | 2 = d < 3.5 ? 0 : d < 11 ? 1 : 2;
    // (plan 80: far off, the revolver's hold a cheaper one — the elbows where the poles put them, the fingers
    // as they are)
    this.farHold = d > FAR_HOLD;
    if (seen.lowQuality && lod === 0) lod = 1;
    if (this.model.avatar !== p.avatar || this.model.lod !== lod) this.model.set(p.avatar, lod);
    this.model.update(d);
    // (how they walk is their look's: plan 58 4e)
    // (plan 58 8: the shadowed limp, heavy)
    this.motion.gait = p.shade ? "heavy" : (p.avatar.gait ?? "calm");
    // (plan 58's animations; the mood the hour's dark and the dark's own, a shade's the dark itself)
    // (eased: in and out of a door, a shade coming on — over a second or two, not at a step)
    const mood = p.shade ? 1 : (seen.mood ?? 0);
    this.mood =
      this.mood < 0 ? mood : this.mood + (mood - this.mood) * Math.min(1, dt * (mood > this.mood ? 1.5 : 0.5));
    this.motion.tension = this.mood;

    // the facing turns smoothly (others only send 8 directions)
    if (this.turned === null) this.turned = p.angle;
    let dA = p.angle - this.turned;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    const turnBy = this.limpYaw !== null ? 0 : dA * Math.min(1, dt * 14);
    this.turned += turnBy;
    // (plan 58 5d: getting up off the ragdoll, turned the way they lay — the root's yaw is the scene's)
    if (this.limpYaw !== null) this.turned = Math.PI / 2 - this.limpYaw;
    // (my hands in first person are placed by hands1p.ts)
    if (this.part === "all") this.root.rotation.y = Math.PI / 2 - this.turned;

    // sitting down / getting up eases the hips onto the cushion
    if (this.sitW === null || p.reduced) this.sitW = sitting ? 1 : 0;
    else this.sitW = Math.max(0, Math.min(1, this.sitW + (sitting ? dt : -dt) / SIT_IN));
    const w = this.sitW * this.sitW * (3 - 2 * this.sitW);
    // off the floor (in a jump, up on something): the shadow and the ring stay on what's under them
    const jump = !sitting ? (p.jump ?? null) : null;
    // (a sitter's at the seat's height: 0 on a floor's chair, up a stand's row out on the land)
    const h = p.z ?? 0;
    const ground = sitting ? h : Math.min(h, p.ground ?? 0);
    // (plan 62) sat where the seat has her — the knees at its front, the back to its back —, gone
    // there from where she stood as the hips go down (and back off it getting up)
    const liveSit = !p.reduced; // (plan 58's sitting: settled into; reduced motion: as it was)
    const k = liveSit ? this.settled : w;
    if (sitting) {
      if (!this.wasSitting) this.sat = null;
      const fit = this.seatOf(p, h, seen);
      this.seatOff.x = Math.cos(p.angle) * fit.along;
      this.seatOff.z = Math.sin(p.angle) * fit.along;
      if (!this.wasSitting) {
        const r = this.root.position;
        this.sitFrom =
          this.last && this.part === "all" && Math.hypot(r.x - p.x - this.seatOff.x, r.z - p.y - this.seatOff.z) < 1.2
            ? { x: r.x, z: r.z }
            : null;
      }
    } else this.sat = k > 0 ? this.sat : null;
    this.wasSitting = sitting;
    if (this.part === "all") {
      const sx = p.x + this.seatOff.x * (sitting ? 1 : k);
      const sz = p.y + this.seatOff.z * (sitting ? 1 : k);
      const from = sitting && k < 1 ? this.sitFrom : null;
      if (from) this.root.position.set(from.x + (sx - from.x) * k, h, from.z + (sz - from.z) * k);
      else this.root.position.set(sx, h, sz);
      if (!sitting && k <= 0) this.seatOff.x = this.seatOff.z = 0;
    }
    // (plan 62) on a pool shot: drawn at its cue — behind the shot, beside its line, turned along it
    // — eased there and back
    this.stanceW = Math.max(0, Math.min(1, this.stanceW + (p.cue ? dt : -dt) / 0.35));
    if (p.cue) this.stance = cueStance(p.cue);
    const sw = this.stanceW * this.stanceW * (3 - 2 * this.stanceW);
    if (this.stance && sw > 0 && this.part === "all") {
      const r = this.root.position;
      r.x += (this.stance.x - r.x) * sw;
      r.z += (this.stance.z - r.z) * sw;
      let dA = this.stance.a - this.turned;
      dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      this.root.rotation.y = Math.PI / 2 - (this.turned + dA * sw);
    } else if (sw <= 0) this.stance = null;
    this.jumpH = h;
    this.jumpOn = !!jump;
    this.shadow.position.y = 0.004 + ground - h;
    this.shadow.scale.setScalar(1 / (1 + (h - ground) * 1.6));
    this.ring.position.y = 0.006 + ground - h;

    // the motion: stepped every frame on screen, caught up when it comes back
    let dx = this.last ? p.x - this.last.x : 0;
    let dy = this.last ? p.y - this.last.y : 0;
    let dist = Math.hypot(dx, dy);
    if (dist > 1.5) dist = dx = dy = 0;
    this.last = { x: p.x, y: p.y };
    // how they move (docs/plan/29-the-move.md M6), from where they've been: the velocity in
    // their own frame, the turn, the speed's change, the feet leaving and meeting the ground
    if (dt > 0) {
      const a = 1 - Math.exp(-dt * 12);
      this.vx += (dx / dt - this.vx) * a;
      this.vy += (dy / dt - this.vy) * a;
      const spd = Math.hypot(this.vx, this.vy);
      this.acc += ((spd - this.spd) / dt - this.acc) * a;
      this.spd = spd;
      this.turnRate += (turnBy / dt - this.turnRate) * a;
      this.vz += ((h - this.lastH) / dt - this.vz) * Math.min(1, dt * 20);
    }
    this.lastH = h;
    // (afloat isn't in the air: plan 66 — the feet over the bed, the body on the water)
    const up = !!jump || (h > ground + 0.03 && !p.swim);
    const landed = this.wasUp && !up ? Math.min(1, Math.max(0, -this.vz) / 10.5) : undefined;
    this.wasUp = up;
    this.due += dt;
    if (!given && !seen.onScreen && this.due < 0.5) return;
    const step = Math.min(this.due, 0.1);
    this.due = 0;
    const fc = Math.cos(this.turned);
    const fs = Math.sin(this.turned);
    const mv = p.mv ?? 0;
    const held =
      isHeld(p.held) && p.heldAt && !p.phone ? { kind: p.held as HeldKind, since: Date.now() - p.heldAt } : null;
    const verb = this.C.verbAt(p.verb, performance.now());
    // (mine as it is; someone's from its byte, timed from when it shows here)
    const flow =
      p.flow ?? (p.flowCode ? flowOfCode(p.flowCode, (performance.now() - (p.flowAt ?? 0)) / 1000, KH_MOVE) : null);
    const LF = !p.reduced ? this.C.lifeNow() : null;
    // (plan 80 phase 5: a whole-body move — a vault, a mantle, a roll, a slide, Flowmotion, sat, swimming,
    // busy at something: the hands are the move's, the revolver's two-handed hold lets go of them)
    this.bodyBusy = !!verb || !!flow || sitting || (p.swim ?? 0) > 0 || !!p.busy;
    // (plan 81 phase 5: …of them the ones the double-barrel's kept through, pulled in across the chest — all but
    // a mantle's, its hands on the ledge)
    this.portMove = (!!verb && verb.kind !== "mantle") || !!flow;
    const mo =
      given ??
      this.motion.update(step, {
        dist,
        walking: p.a === 1,
        speed: this.spd,
        sit: sitting,
        typing: !!p.typing && sitting,
        seat: this.sat?.fit,
        keys: p.keys ? this.keysIn(p.keys, p, h) : undefined,
        busyT: this.busyT(p.busy ?? ""),
        parts:
          p.cue && this.stance
            ? this.stance.parts
            : p.parts?.map((k) => this.keysIn(k, p, h) as [number, number, number]),
        speaking: !!p.speaking,
        emote: p.emote ?? "",
        reduced: !!p.reduced,
        held,
        busy: p.busy ?? "",
        act: this.actOf(p),
        phone: p.phone || p.ringing ? { state: p.phone ?? "", pose: p.phonePose ?? "", ringing: !!p.ringing } : null,
        jump,
        loco: {
          ahead: this.vx * fc + this.vy * fs,
          left: this.vx * fs - this.vy * fc,
          crouch: (mv & 8) !== 0,
          aim: (mv & 16) !== 0,
          gun: !!p.gun,
          reload: (this.gunFx?.reload ?? 0) > 0.3,
          speedloader: p.gun === "revolver",
          longGun: isLongGun(p.gun ?? ""),
          kick: this.gunFx?.kick ?? 0,
          hurt: p.shade ? 0.7 : p.hp !== undefined ? Math.max(0, 1 - p.hp / 100) : undefined,
          // (plan 58 4c: the gait it's going for — its first step's keyed by it; 4f: the ground under
          // each foot, by the world's own rays, near only)
          goal: goalOf(p.mv ?? 0),
          ground: seen.groundAt && d < 12 && this.part === "all" ? this.groundFn(p, seen.groundAt) : undefined,
          // (plan 58 9: cold and spent by the vitals; a sound heard, from where it came)
          cold: LF ? LF.coldOf(p.wm ?? 100) : 0,
          spent: LF ? LF.spentOf(p.st ?? 100) : 0,
          // (its way off her facing, −π…π: unwrapped, a sound just ahead across the seam read as nearly a whole
          // turn — the chest twisted round and the head looking back. Aiming, her eyes stay on what she aims at;
          // a gun out, a glance but no startle)
          heard:
            p.heard && ((p.mv ?? 0) & 16) === 0
              ? {
                  yaw: wrapAngle(this.turned - Math.atan2(p.heard.y - p.y, p.heard.x - p.x)),
                  pitch: 0,
                  t: p.heard.t,
                  loud: p.heard.loud && !p.gun,
                }
              : null,
          // (struck: thrown from where it came from — off the facing, + to the left)
          hit: p.hit ? { from: this.turned - p.hit.yaw, t: p.hit.t, k: 1 } : null,
          torch: !!p.torch && !p.phone && !p.shade,
          pitch: p.pitch ?? 0,
          // (aiming, bladed: the shoulders and the arms twist back along the look, left of the body)
          yaw: (mv & 16) !== 0 ? AIM_BLADE : 0,
          turn: this.turnRate,
          accel: this.acc,
          up,
          landed,
          verb,
          flow,
        },
      });
    this.motionOut = mo;
    // the feet it put down this frame: the steps (docs/plan/63-the-steps.md) — each heard once, and
    // only from a body stepped every frame (off screen it's caught up in jumps: the host's way-gone
    // steps stand in)
    const down = this.motion.loco?.lock?.down;
    if (down?.length) {
      if (!given && seen.onScreen) for (const S of down) seen.step?.(this.id, S);
      down.length = 0;
    }
    // (out of a turn round from a run: down on both feet, the foot lock let go through it)
    const about = this.motion.loco?.about;
    if (about?.landed) {
      if (!given && seen.onScreen) seen.hop?.(this.id, 0.35);
      about.landed = false;
    }
    this.drawn = { verb: verb?.kind ?? "", jump: jump?.kind ?? "", flow: flow?.kind ?? "" };
    // one of the shadowed: its own arms, back and head over the walk
    let pose = mo.pose;
    let lift = mo.lift;
    const SN = p.shade && !p.reduced ? this.C.nightNow() : null;
    const dying = p.shade?.state === "dissolve" && p.shade.killed ? p.shade.t : -1;
    if (p.shade && SN) {
      // (plan 58 8: their own — hunched, lolling, clawed, twitching, their time catching; stood to
      // fight or reeling, all of them; a beam on it from where it shines; shot down, thrown back, then
      // the old fall)
      const sh = p.shade;
      const b = sh.burn;
      const from = b ? this.turned - Math.atan2(b.y - p.y, b.x - p.x) : 0;
      const s =
        dying >= 0
          ? { m: dying < SN.LIMP ? SN.shadeShot(dying, sh.seed) : this.C.deathPose(dying, sh.seed), legs: true }
          : SN.shade2(sh.pose, sh.t, sh.seed, this.spd > 0.2, from);
      if (s.legs) {
        pose = s.m.pose;
        lift = s.m.lift;
      } else {
        pose = { ...mo.pose };
        for (const [j, r] of Object.entries(s.m.pose))
          if (!/^(thigh|knee|ankle|toe|hips)/.test(j)) pose[j as keyof typeof pose] = r;
      }
      // (their time catching: the whole body held a beat, then on)
      if (SN.glitch(sh.t, sh.seed) !== sh.t && this.shadeHeld) ({ pose, lift } = this.shadeHeld);
      else this.shadeHeld = { pose, lift };
    } else {
      if (p.shade) pose = this.C.blend(mo.pose, this.C.shadePose(p.shade.pose, p.shade.t, p.shade.seed), 1);
      // one of the day's, asleep in its nest: squatting, folded over its knees (docs/plan/31-the-day.md)
      if (p.shade?.pose === "lurk") {
        const m = this.C.lurkPose(p.shade.t, p.shade.seed);
        pose = this.C.blend(pose, m.pose, 1);
        lift = m.lift;
      }
      // shot down: it dies (staggers, drops to its knees, folds over onto the snow)
      if (p.shade && dying >= 0) {
        const m = this.C.deathPose(dying, p.shade.seed);
        pose = this.C.blend(mo.pose, m.pose, 1);
        lift = m.lift;
      }
    }
    // down: on hands and knees, crawling as they go; by someone down, kneeling (D7)
    let downHands: {
      L?: { at: [number, number, number]; w: number };
      R?: { at: [number, number, number]; w: number };
    } | null = null;
    if (p.down) {
      this.crawlPh = (this.crawlPh + dist / 0.45) % 1;
      // (plan 58 7: the hands and knees set on the ground and held as she goes over them; kneeling, a
      // hand on their back)
      const N = !p.reduced ? this.C.nightNow() : null;
      const now = performance.now() / 1000;
      const r = N ? (p.down === "down" ? N.crawl2(this.crawlPh, now, dist > 1e-4) : N.kneel2(now, 1)) : null;
      downHands = r?.hands ?? null;
      const m = r ? r.m : p.down === "down" ? this.C.crawlPose(this.crawlPh) : this.C.kneelPose();
      this.downW = Math.min(1, this.downW + step * 4);
      pose = this.C.blend(pose, m.pose, this.downW);
      lift = [lift[0] + (m.lift[0] - lift[0]) * this.downW, lift[1] + (m.lift[1] - lift[1]) * this.downW, lift[2]];
    } else this.downW = 0;
    // in the water (docs/plan/66-the-water.md, phase 4 — signed off on /dev/anim): wading over the
    // walk by how deep (fed afloat too: no pop as the swim takes over), and the swim laid over it —
    // the stroke by the water covered, the crawl at a sprint, under by the way it's going
    let swimHands: SwimHands | null = null;
    this.swimW = 0;
    const SW = !p.reduced && !sitting ? this.C.swimNow() : null;
    const over = p.waterOver ?? 0;
    if (SW && over > 0.3) {
      const wd = SW.wade2({ pose, lift }, over);
      pose = wd.m.pose;
      swimHands = wd.hands;
    }
    if (SW && ((p.swim ?? 0) >= 2 || this.swim2)) {
      this.swim2 ??= new SW.Swim2();
      const sw = this.swim2.update(step, {
        swim: p.swim ?? 0,
        speed: this.spd,
        fast: ((p.mv ?? 0) & 7) === SPRINT_GAIT,
        sea: over > 0 ? over : SW.SEA,
        pitch: Math.max(-1.2, Math.min(1.2, Math.atan2(this.vz, Math.max(this.spd, 0.3)))),
      });
      if (sw) {
        this.swimW = sw.w;
        pose = this.C.blend(pose, sw.m.pose, sw.w);
        lift = [
          lift[0] + (sw.m.lift[0] - lift[0]) * sw.w,
          lift[1] + (sw.m.lift[1] - lift[1]) * sw.w,
          lift[2] + (sw.m.lift[2] - lift[2]) * sw.w,
        ];
        for (const h of Object.values(sw.hands)) if (h) h.w *= sw.w;
        swimHands = sw.w > 0.5 ? sw.hands : swimHands;
      } else this.swim2 = null;
    } else this.swim2 = null;
    // knocked down by a pool ball: thrown back onto the floor, up again (chars FALL_LEN)
    if (p.fell !== undefined && p.fell < this.C.FALL_LEN) {
      const m = this.C.fellPose(p.fell);
      this.fellW = Math.min(1, this.fellW + step * 14);
      pose = this.C.blend(pose, m.pose, this.fellW);
      const k = this.fellW;
      lift = [
        lift[0] + (m.lift[0] - lift[0]) * k,
        lift[1] + (m.lift[1] - lift[1]) * k,
        lift[2] + (m.lift[2] - lift[2]) * k,
      ];
    } else this.fellW = 0;
    // (plan 58 5d: limp on the ragdoll — one of the shadowed shot down (and lying there as it burns
    // away), anyone down from 6 m or more (up again after) — Jolt's, the world's own; near only)
    let limpHands: {
      L?: { at: [number, number, number]; w: number };
      R?: { at: [number, number, number]; w: number };
    } | null = null;
    const RS = !p.reduced && this.part === "all" && d < 30 && seen.rag ? seen.rag() : null;
    const AR = RS ? this.C.airNow() : null;
    const hz = p.z ?? 0;
    // (a fall's height by the body's own, over what's under it — not the jump's stages: a fall's
    // hop has a land stage after the feet are down, and limp only after it the body stood up first)
    const airborne = !sitting && hz > ground + 0.03 && !p.swim;
    let fellFrom = 0;
    let falling = false;
    if (airborne) {
      this.fallTop = Math.max(this.fallTop ?? hz, hz);
      // limp a moment before the ground, as it comes: down from 6 m or more, a sixth of a second off
      // (on the ragdoll it lands as a body — limp with the feet down, the legs took it all and folded)
      falling = this.vz < -1 && this.fallTop - ground >= 6 && hz - ground <= -this.vz * 0.16;
    } else {
      if (this.fallTop !== null) fellFrom = this.fallTop - hz;
      this.fallTop = null;
    }
    const shot = !!SN && dying >= SN.LIMP && !this.shotDown;
    // (a fall into deep water is caught by it: plan 66)
    const caught = !!p.overWater || !!p.swim;
    if (AR && RS && !this.limp?.on && (shot || ((falling || fellFrom >= 6) && !caught))) {
      this.limp = new AR.Downed(RS.world, this.model, RS.origin, true);
      const c = Math.cos(this.turned);
      const sn = Math.sin(this.turned);
      // (the scene's: x, up, the floor's y; shot, thrown back off its feet; falling, as it goes — on
      // across too, the speed it fell at but no more than the height gives; down already (it came
      // too quickly to see), a little, tipped on the way it went)
      const vel: [number, number, number] = shot
        ? [-c * 2.2, 0.4, -sn * 2.2]
        : falling
          ? [this.vx, Math.max(this.vz, -Math.sqrt(2 * 9.8 * (this.fallTop ?? hz) - 2 * 9.8 * ground), -16), this.vy]
          : [this.vx * 0.5 + c * 0.8, -3.5, this.vy * 0.5 + sn * 0.8];
      // (straight down, the trunk tipped back off the feet: it came down onto the legs and folded
      // into a crouched ball — on the run, the run carries it over)
      const tip =
        !shot && Math.hypot(this.vx, this.vy) < 2
          ? { part: 2, impulse: [-c * 22, 0, -sn * 22] as [number, number, number] }
          : undefined;
      if (!this.limp.fall(pose, vel, tip, shot)) this.limp = null;
      this.shotDown = shot;
      if (falling) this.fallTop = null;
    }
    if (!p.shade?.killed) this.shotDown = false;
    if (this.limp?.on && AR) {
      const r = this.limp.update(step, () => h, AR.getUp2Pose, AR.GETUP_LEN);
      // (stopped short — the ground, a wall — : a thud, by how much of its speed it lost)
      const sp = this.limp.rig.on ? this.limp.rig.speed() : 0;
      if (this.ragSpeed - sp > 2) seen.thud?.(this.id, Math.min(1, (this.ragSpeed - sp) / 6));
      this.ragSpeed = sp;
      if (r) {
        pose = r.m.pose;
        lift = r.m.lift;
        limpHands = r.hands;
        // (standing up: the root turned the way it lay — now, with the get-up's first pose: a frame
        // later the whole body spun round for one frame)
        if (r.root && this.limpYaw === null && !this.limp.rig.on) {
          this.limpYaw = r.root.yaw;
          this.turned = Math.PI / 2 - this.limpYaw;
          if (this.part === "all") this.root.rotation.y = Math.PI / 2 - this.turned;
        }
      } else this.limpYaw = null;
    } else {
      this.limp = null;
      this.limpYaw = null;
    }
    // (plan 58 6a: the new sitting lowers the hips by its own settle, its legs solved for it)
    const drop = this.model.sitDrop(seatShape(p.seat).top) * (liveSit ? mo.settle : w);
    this.settled = mo.settle;
    // (one of the shadowed under plan 58: its arms its own — no hands put on things, no reach: the
    // wind-up's cocked arm was pulled onto whoever it struck)
    const own = !!p.shade && !p.reduced;
    // (limp on the ragdoll: its pose read off the bones as they lie, the life legs already their own)
    this.model.fitLegs = !this.limp?.rig.on;
    this.model.setPose(pose, [lift[0], lift[1] + drop, lift[2]], own ? undefined : mo.reach);
    // (getting up off the ragdoll: nothing of the legs under the ground — the get-up's keyed for a
    // body lying flat; off its side, its knees and feet went half a metre through the snow)
    if (this.limp?.on && !this.limp.rig.on) {
      const under = this.legsUnder();
      if (under > 0.005) this.model.setPose(pose, [lift[0], lift[1] + drop + under, lift[2]], mo.reach);
    }
    // (plan 58 6: the hands on the keys, the pad, the knees, the other one's hand)
    // (swimming: nothing in the hands — the drink, the phone, a wave: plan 66)
    let put = limpHands ?? (this.limp?.on || own || this.swimW > 0.3 ? null : (mo.hands ?? null));
    // (plan 62) sat with a drink: held at the waist between sips — the waist down on the seat with
    // the hips, not stood's height over the floor
    const R = put?.R;
    if (put && R && held && sitting && !p.typing && !limpHands)
      put = { ...put, R: { ...R, at: [R.at[0], R.at[1] + drop, R.at[2]] } };
    this.model.handsTo(put);
    levelHands((j) => this.model.bone(j), put);
    if (downHands && this.downW > 0) {
      for (const h of Object.values(downHands)) if (h) h.w *= this.downW;
      this.model.handsTo(downHands);
    }
    if (swimHands && !limpHands) this.model.handsTo(swimHands);
    this.gunHands(p, step);
    this.akDropFrame(step);
    // (the springs — hair, a skirt, a scarf, a pack: near only, and not with reduced motion)
    this.model.step(step, d > 12 || !!p.reduced || this.part !== "all", seen.sway);
    this.swayD = !p.reduced && this.part === "all" ? d : Number.POSITIVE_INFINITY;
    // (plan 58 9: the breath a puff in the cold air — near only; the air's own cold: none over 8 °C,
    // docs/plan/65 W9)
    const cold = LF && this.part === "all" && d < 12 ? LF.coldOf(p.wm ?? 100) * Person3D.airCold : 0;
    const head = cold > 0.15 || this.puffs ? this.model.bone("head") : null;
    if (LF && head) {
      this.puffs ??= new LF.Puffs(this.root.parent ?? this.root);
      puffDir.set(Math.cos(this.turned), 0, Math.sin(this.turned));
      head.getWorldPosition(puffAt).addScaledVector(puffDir, 0.1).y += 0.04;
      this.puffs.update(step, puffAt, puffDir, this.motion.breath(), cold);
    }
    this.model.setFace(mo.blink, mo.talk);
    this.model.setEyes(mo.eyes?.[0] ?? 0, mo.eyes?.[1] ?? 0);

    this.props(p, held, mo.sip);
    // away: faded
    const away = p.status === "away";
    // (the shadowed: dark while their shield holds; bare — their office clothes — exposed)
    const dark = !!p.shade && p.shade.dark > 0.5 && !!this.mats.shade;
    const burnt = dying >= 0 && !!this.mats.shade;
    if (!burnt && this.burning) {
      this.burning.dispose();
      this.burning = null;
      this.dark = !dark; // (its own materials back)
    }
    if (burnt) this.burn(dying);
    else if (away !== this.away || dark !== this.dark) {
      this.away = away;
      this.dark = dark;
      if (dark) this.model.setMaterials(this.mats.shade as Material, this.mats.shadeInk ?? this.mats.ink);
      else
        this.model.setMaterials(away ? this.mats.bodyAway : this.mats.body, away ? this.mats.inkAway : this.mats.ink);
    }
    // the blob shadow when the sun casts none; the speaking ring pulses
    this.shadow.visible = seen.lowQuality && !sitting && this.part === "all";
    this.ring.visible = !!p.speaking && this.part === "all";
    if (this.ring.visible)
      (this.ring.material as MeshBasicMaterial).opacity = p.reduced
        ? 0.7
        : 0.55 + Math.sin(performance.now() / 83) * 0.25;
  }

  // dying: white-hot as the shot goes through, dark again as it staggers, then lit from
  // within, pale gold, as it goes down — and burning out to nothing on the snow
  private burn(t: number) {
    if (!this.burning) {
      // (one colour all over, not the clothes': a figure of light, not someone lit)
      const m = new MeshBasicMaterial({ transparent: true });
      this.burning = m;
    }
    const m = this.burning;
    const base = DARK;
    const flash = 1 - ramp(t, 0, 0.18);
    const glow = ramp(t, 0.45, 1.25);
    const out = ramp(t, 1.15, 1.95);
    m.color.copy(base).lerp(BURN, glow).lerp(ASH, out).lerp(HOT, flash);
    m.opacity = 1 - out;
    this.model.setMaterials(m, NO_INK);
  }

  // what's in the right hand: a drink (its level going down sip by sip), a toy, the phone
  private props(p: PersonIn, held: { kind: HeldKind; since: number } | null, sip: number) {
    const hand = this.model.bone("wristR");
    // the drink or toy
    const key = held ? `${held.kind}` : "";
    if ((this.held?.key ?? "") !== key) {
      this.dropHeld();
      if (held && hand) {
        const kind = held.kind as string;
        if (isDrink(kind)) {
          // (plan 68: a hot cocoa in the station's red mug, a tea in a white one, an ice-cream tub)
          const color =
            kind === "mug"
              ? MUG_COLORS[Math.floor(hashSeed(p.name) * MUG_COLORS.length)]
              : kind === "soda"
                ? "#c4402b"
                : kind === "cocoa"
                  ? COCOA_MUG
                  : kind === "icecream"
                    ? ICE_TUB
                    : "#efe4cc";
          const as = drinkAs(kind);
          const prop = this.C.buildProp(as, color, this.mats.prop);
          this.C.inHand(prop.root, as, this.model.handFrame("R"));
          hand.add(prop.root);
          this.held = { key, kind, prop, toy: null };
        } else {
          const toy = this.mats.toy?.(kind) ?? null;
          if (toy) {
            this.C.inHand(toy as Group, "toy");
            hand.add(toy);
          }
          this.held = { key, kind, prop: null, toy };
        }
      }
    }
    if (held && this.held?.prop) {
      this.held.prop.setLevel?.(heldState(held.kind, held.since).level);
      // upright, however the wrist turns; tipped to the mouth for a sip
      this.C.keepUpright(
        this.held.prop.root,
        drinkAs(this.held.kind),
        this.root,
        sip * 1.05,
        this.model.handFrame("R"),
      );
    }
    // the phone in its case
    // (plan 78 phase 5: texting, in both of a life body's hands — the body's root holds it, where the model's
    // two-handed hold puts it)
    const both = (p.phone === "text" || p.phone === "photo") && !!this.model.handFrame("R");
    const phoneKey = p.phone ? `${p.phoneCase ?? "walnut"}${both ? "|both" : ""}` : "";
    if ((this.phone?.key ?? "") !== phoneKey) {
      this.dropPhone();
      if (phoneKey && hand) {
        const prop = this.C.buildProp("phone", phoneColors(p.phoneCase)[0], this.mats.prop);
        this.C.inHand(prop.root, "phone");
        (both ? this.root : hand).add(prop.root);
        this.phone = { key: phoneKey, prop };
      }
    }
    // (in one life hand: along its palm — its frame known once the body's loaded)
    const phoneFrame = this.phone && !both ? this.model.handFrame("R") : null;
    if (this.phone && phoneFrame) this.C.inHand(this.phone.prop.root, "phone", phoneFrame);
    this.gunFrame(p, hand);
    this.toolFrame(p);
    this.twoFrame(both ? (p.phone === "photo" ? "photo" : "phone") : this.tool?.key === "pad" ? "pad" : null);
    this.ballFrame(p, hand);
    // aiming: the gun along the look too, whatever the wrist is doing (its barrel's −y)
    // (held in both hands — the hands placed by gunHands: the gun along the way it set)
    // (in a life hand, plan 79: the wrist turned so the barrel goes along it — within a wrist's reach)
    if (this.gun?.inHand) {
      if (!this.revFree) this.gun.root.quaternion.identity();
      const dir = this.gunDirOn && this.gunHandsW > 0.3 ? this.gunDir : (p.mv ?? 0) & 16 ? this.lookDir(p, tv2) : null;
      // (plan 80: the revolver's hold turned the wrist already — the gun upright, the left hand on it)
      if (dir && !this.revHeld)
        this.model.aimHand("R", tv3.set(1, 0, 0).applyQuaternion(this.gun.model.root.quaternion), dir, 1.4);
    } else if (this.gun && this.gunDirOn && this.gunHandsW > 0.3) this.aimGun(this.gun.root, this.gunDir);
    else if (this.gun && ((p.mv ?? 0) & 16) !== 0) this.aimGun(this.gun.root, this.lookDir(p, tv2));
    else this.gun?.root.quaternion.identity();
    if (this.gun) this.gunMoves(this.gun);
    this.gripOnFore();
    this.magFrame();
    this.budFrame(p);
    this.torchFrame(p);
    this.holsterFrame(p);
    this.slingFrame(p);
    this.carrierFrame(p);
    this.akPouchFrame(p);
    this.holdFrame();
    if (this.phone?.prop.rec)
      this.phone.prop.rec.visible = !!p.recording && Math.floor(performance.now() / 500) % 2 === 0;
  }

  // a pool ball off a table, in the right hand to throw (shared/pool-throw.ts)
  private ball: { n: number; o: Object3D } | null = null;
  private ballFrame(p: PersonIn, hand: Object3D | null) {
    const m = /^pball:(\d{1,2})$/.exec(p.held ?? "");
    const n = m ? Number(m[1]) : -1;
    if ((this.ball?.n ?? -1) === n) return;
    this.ball?.o.removeFromParent();
    this.ball = null;
    const o = n >= 0 && hand ? this.mats.pball?.(n) : undefined;
    if (!o || !hand) return;
    this.C.inHand(o as Group, "toy");
    hand.add(o);
    this.ball = { n, o };
  }

  /** (plan 78 phase 5) What each hand holds, told the model: a life hand's fingers close on it (and a reach
   *  goes by it — the phone's speaker to the ear, a drink's rim to the lips). As it sits now: the next pose's. */
  /** (plan 78 phase 5) A thing in both of a life body's hands — the phone texting, a pad: the model holds
   *  it (its thumbs tapping by turns) and the thing's drawn where it is (the body's root space) */
  private twoKind: "phone" | "photo" | "pad" | null = null;
  private twoFrame(kind: "phone" | "photo" | "pad" | null) {
    if (!this.model.handFrame("R")) kind = null;
    if (this.twoKind !== kind) {
      this.twoKind = kind;
      if (!kind) this.model.holdTwo(null);
    }
    if (!kind) return;
    const t = performance.now() / 1000;
    this.model.holdTwo(kind, kind === "photo" ? 0 : Math.sin(t * (kind === "pad" ? 7 : 11)));
    const place = this.model.twoPlace;
    const thing = kind === "pad" ? this.tool?.mesh : this.phone?.prop.root;
    if (thing && place.on) {
      thing.position.copy(place.pos);
      thing.quaternion.copy(place.quat);
    }
  }

  private holdFrame() {
    const m = this.model;
    const shapes = this.C.HELD_SHAPE;
    const R = this.held?.prop
      ? { root: this.held.prop.root, kind: drinkAs(this.held.kind) as keyof typeof shapes }
      : this.phone
        ? { root: this.phone.prop.root, kind: "phone" as const }
        : null;
    // (two-handed — the phone texting, a pad: the model's own hold, twoFrame)
    if (this.twoKind) return;
    const G = !R && this.gun?.inHand ? this.gun : null;
    if (G) {
      // (plan 79: the revolver's grip, for the fingers to close round — in the wrist's space)
      const inner = G.model.root;
      const LS = LONG[G.key];
      if (LS) {
        // (plans 81–82: the long gun's own grip — the double-barrel's stock's wrist, the AK's pistol grip)
        const W = LS.wristShape;
        tv3.copy(W.at).applyQuaternion(inner.quaternion).add(inner.position);
        tq2.setFromUnitVectors(Y3, W.axis).premultiply(inner.quaternion);
        m.hold("R", { shape: W.shape, pos: tv3, quat: tq2, kind: "gun" });
      } else {
        gripShapeAt(inner.quaternion, inner.position, tv3, tq2);
        m.hold("R", { shape: GUN_GRIP_SHAPE, pos: tv3, quat: tq2, kind: "gun" });
      }
    } else
      m.hold("R", R ? { shape: shapes[R.kind], pos: R.root.position, quat: R.root.quaternion, kind: R.kind } : null);
    const T = this.torch;
    // (plan 80: the support grip's left hand closes round the right fist — the revolver hold's own)
    if (this.revHeld && !T) return;
    m.hold("L", T ? { shape: shapes.torch, pos: T.root.position, quat: T.root.quaternion, kind: "torch" } : null);
  }

  private dropHeld() {
    if (!this.held) return;
    this.held.prop?.root.removeFromParent();
    this.held.prop?.dispose();
    this.held.toy?.removeFromParent();
    this.held = null;
  }
  // the gun in the right hand (docs/plan/32-the-arms.md): its model (tp/guns3d.ts) turned into the
  // wrist's frame — the barrel along the hand's way out of the fist (−y), its top to the back of
  // the hand (+z) — the grip in the fist
  private gun: { key: string; root: Group; model: GunModel; inHand: boolean } | null = null;
  private gunFrame(p: PersonIn, hand: Object3D | null) {
    const key = p.gun ?? "";
    const kind = gunKind(key);
    const cue = key === "cue";
    // (the life look's model once the view has it — plan 79; the drawn one till then, swapped when it comes)
    const tpl = key && !cue ? (this.mats.gun?.(kind) ?? null) : null;
    // (plan 79 phase 4: the life look's revolver held by its hand's own frame — known once the body's loaded)
    // (plan 81: the double-barrel's too — by the stock's wrist)
    // (plan 82: the AK's — by its pistol grip)
    const frame = tpl && (kind === "revolver" || LONG[key]) ? this.model.handFrame("R") : null;
    // (plan 79: put away — a life gun kept in the hand while the hands go down to the side, then gone)
    if (!key && this.gun?.model.life && this.gun.key !== "cue") {
      if (this.holsterT < 0) this.holsterT = 0;
      // (a slung long gun's own — put back on her back)
      if (this.holsterT < (LONG[this.gun.key]?.sling?.away ?? HOLSTER_S)) return;
    }
    this.holsterT = -1;
    if ((this.gun?.key ?? "") === key && !!this.gun?.model.life === !!tpl && !!this.gun?.inHand === !!frame) return;
    // (a gun taken out — not one swapped for its life look's model: its draw's rise starts)
    if (key && !this.gun) this.drawT = 0;
    this.dropGun();
    if (!key || !hand) return;
    const root = new Group();
    // (in front of my eyes: every bevel; anyone else's, a few thousand triangles)
    // (the pool cue taken down: a gun that fires the balls — carried and shouldered like the double-barrel)
    const detail = this.part === "arms" ? "near" : "far";
    const model = cue
      ? cueModel(this.mats.prop("vertex"), detail)
      : tpl
        ? lifeGunModel(kind, tpl)
        : gunModel(kind, this.mats.prop("vertex"), detail);
    if (!cue) poseGun(model, kind, { cock: 1 });
    const inner = model.root;
    if (frame && LONG[key]) longInHand(LONG[key], frame, inner.quaternion, inner.position);
    else if (frame) gunInHand(kind, frame, inner.quaternion, inner.position);
    else {
      inner.quaternion.setFromRotationMatrix(GUN_IN_WRIST);
      inner.position
        .set(...model.grip.at)
        .applyQuaternion(inner.quaternion)
        .negate();
      inner.position.z += 0.01;
    }
    root.add(inner);
    root.position.set(0, frame ? 0 : -0.05, 0);
    // (the drawn ones a little larger than life, as the old people's hands were; the life look's life size)
    root.scale.setScalar(model.life ? LIFE_GUN_SCALE : kind !== "revolver" || cue ? 1.2 : 1.4);
    hand.add(root);
    this.gun = { key, root, model, inHand: !!frame };
  }

  /** What the gun's doing (docs/plan/32-the-arms.md), mine as Arms says (`gunFx`): the hammer,
   *  the cylinder, the gate or the barrels, the rounds; a shot's kick back along the arm and up;
   *  reloading, tipped up and turned in. Without it, at rest — cocked while aiming. */
  gunFx: GunFx | null = null;
  private gunMoves(gun: { key: string; root: Group; model: GunModel; inHand: boolean }) {
    const kind = gunKind(gun.key);
    const fx = this.gunFx;
    if (fx) fx.bolt = kind === "sniper" ? this.boltCycle : this.akBolt;
    // (plan 80: the revolver reloading — its parts as the reload's timeline has them)
    if (this.revPose) poseGun(gun.model, kind, { ...(fx ?? {}), cock: 0, ...this.revPose });
    // (plan 82: the AK's handle racked — everyone's, from the reload's timeline)
    else if (gun.key !== "cue") poseGun(gun.model, kind, fx ?? { cock: 1, bolt: this.akBolt });
    // (in a life hand: the hand carries it — its kick is the arms', its turn the wrist's)
    if (gun.inHand) return;
    gun.root.position.set(0, -0.05, 0);
    if (!fx) return;
    if (fx.kick > 0) {
      // (back: the root's +y; up: the barrel's −y turned toward its top, +z)
      gun.root.position.add(
        tv2
          .set(
            0,
            fx.kick *
              (kind === "shotgun" || kind === "sniper" || kind === "daybreak" ? 0.06 : kind === "ak47" ? 0.03 : 0.035),
            0,
          )
          .applyQuaternion(gun.root.quaternion),
      );
      gun.root.rotateX(
        -fx.kick *
          (kind === "shotgun" ? 0.22 : kind === "ak47" ? 0.09 : kind === "sniper" || kind === "daybreak" ? 0.16 : 0.3),
      );
    }
    // reloading: the muzzle up and the gun rolled in, its side (the gate, the breech) to me
    // (the double-barrel's reload is the hands' — gunHands)
    if (fx.reload > 0 && kind === "revolver") gun.root.rotateX(-fx.reload * 0.7).rotateY(-fx.reload * 0.9);
  }

  // The hands where the gun's held (docs/plan/32-the-arms.md), after the body's pose — by the arms'
  // IK, so they stay on it walking and running:
  // - the revolver aimed: the left hand cupped round the right on the grip (the torch on: its wrist
  //   under the right instead, back to back, the beam along the barrel);
  // - the double-barrel, heavy, always in both hands: the right on the grip, the left under the
  //   fore-end (with the torch there too). Aimed: shouldered, along the look. Carried (heavy): the butt
  //   against the right side of the chest, the gun across the body, the muzzle ahead and left, a little
  //   down — walking and running too (running, a touch closer in).
  //   Reloading: under the right arm, the muzzle at the ground, broken open — the left hand to the
  //   pocket for a shell and back to the breech, one after another.
  // The gun's way (`L` rad left of the body's facing, `P` up) and the butt's drop below the right
  // shoulder are eased between them.
  private fellW = 0;
  private gunHandsW = 0;
  private drawT = 9; // s since a gun was taken out (its draw's rise)
  private holsterT = -1; // s into putting one away (-1: not)
  private gunWay = { L: 0, P: 0, drop: 0, fwd: 0, in: 0, turn: 0 };
  private gunDir = new Vector3();
  private gunDirOn = false;
  private loadT = 0; // s into a double-barrel's reload
  private foreW = 0; // the left hand under the double-barrel's fore-end (gripOnFore), this much
  private shellInHand: Mesh | null = null;
  private gunHands(p: PersonIn, dt: number) {
    const gun = this.gun;
    // (the left shoulder at rest — the double-barrel's hold brings it forward again, this frame's)
    const sLb = this.model.bone("shoulderL");
    if (sLb && this.sLRest.bone === sLb) sLb.position.copy(this.sLRest.pos);
    const aiming = !!p.gun && ((p.mv ?? 0) & 16) !== 0;
    // (the pool cue: held as the double-barrel is, in both hands; the AK too — plan 79 phase 5)
    const shotgun = isLongGun(p.gun ?? "") || p.gun === "cue";
    const ak = p.gun === "ak47" || p.gun === "daybreak";
    const sniper = p.gun === "sniper";
    // (the AK's magazine and the Daybreak's cell: the same hands, their own times — plan 79 phases 5, 7)
    this.loadSpec = p.gun === "daybreak" ? CELL_LOAD : AK_LOAD;
    // (the AK's and the sniper's reloads keep the server's time from their start — opened while still
    // aiming, the hands join it where it's got to once the gun comes down)
    const akOpen = (ak || sniper) && (this.gunFx?.open ?? 0) > 0.3;
    const loading =
      (p.gun === "shotgun" || ak || sniper) && !aiming && (ak || sniper ? akOpen : (this.gunFx?.reload ?? 0) > 0.3);
    // (the sniper's bolt worked after a shot — Player.arm: the left hand over to it, up, back, home)
    this.boltT = sniper && p.arm === ARM_BOLT ? this.boltT + dt : 0;
    const cyc = Math.min(1, this.boltT / SNIPER.bolt);
    const smooth = (x: number) => x * x * (3 - 2 * x);
    this.boltCycle = this.boltT > 0 ? (cyc < 0.5 ? smooth(cyc / 0.5) : 1 - smooth((cyc - 0.5) / 0.5)) : 0;
    // (plan 79: a life revolver held at the low ready too, not aimed — both hands, AW2's)
    const ready = !!gun?.inHand && !shotgun && !aiming && (this.gunFx?.reload ?? 0) < 0.3;
    // (put away: the hands down to the side first — gunFrame drops it after HOLSTER_S)
    const away = this.holsterT >= 0;
    if (away) this.holsterT += dt;
    const want = gun && !away && (shotgun || aiming || ready) && !p.down && p.fell === undefined ? 1 : 0;
    this.gunHandsW += (want - this.gunHandsW) * (1 - Math.exp(-dt * (away ? 10 : 14)));
    // (taken out: the hands rise from the side at the gun's own draw — shared ARMS' 0.35 s)
    this.drawT += dt;
    // (plan 81: the double-barrel's own — off her back, over the shoulder)
    // (plan 82: the AK's — off her back round her right side)
    const drawn = Math.min(1, this.drawT / ((gun && LONG[gun.key]?.sling?.draw) || DRAW_S));
    const w = Math.min(this.gunHandsW, drawn * drawn * (3 - 2 * drawn));
    // (the AK's reload begun with it empty: the charging handle racked at the end — mine only: the others'
    // rounds aren't known)
    const timing = ak || sniper ? akOpen : loading;
    if (timing && this.loadT === 0) this.akDry = p.gun === "ak47" && (this.gunFx?.loaded ?? 1) <= 0;
    this.loadT = timing ? this.loadT + dt : 0;
    this.magInHand = false;
    this.magTilt = 0;
    this.akBolt = 0;
    if (this.shellInHand) this.shellInHand.visible = false;
    this.gunDirOn = false;
    this.foreW = 0;
    this.revHeld = false;
    this.revHarries = false;
    // (plan 80: the life revolver's own — drawn out of the holster at her right hip into the hold and put back
    // the same way: the hold's own weight, not the hands' rise from the side)
    if (gun?.inHand && gunKind(gun.key) === "revolver" && this.model.handFrame("L")) {
      // (plan 80 phase 4: the reload — the server's step open, Player.arm: everyone's — run as one timeline;
      // ended early (a shot snapped it shut, the step done sooner): on from the closing)
      const opening = p.arm === ARM_RELOAD || p.arm === ARM_OPEN;
      if (opening && this.revLoadT < 0 && !away) this.revLoadT = 0;
      if (this.revLoadT >= 0) {
        this.revLoadT += dt;
        if (!opening && this.revLoadT < RELOAD_CLOSE) this.revLoadT = RELOAD_CLOSE;
        if (opening) this.revLoadT = Math.min(this.revLoadT, RELOAD_LEN - 0.02);
        else if (this.revLoadT >= RELOAD_LEN) this.revLoadT = -1;
      }
      this.revPose = null;
      this.revFree = false;
      // (the gun back at rest under the wrist — a reload's left it off it)
      if (this.revLoadT < 0) gun.root.position.set(0, 0, 0);
      const hold =
        (aiming || ready || away || this.revLoadT >= 0) &&
        !p.down &&
        p.fell === undefined &&
        !this.bodyBusy &&
        !this.limp?.on;
      this.revW += ((hold ? 1 : 0) - this.revW) * (1 - Math.exp(-dt * 14));
      // (struck: the hands thrown off it a moment — the body's own flinch — and back on)
      const hitT = p.hit?.t ?? 9;
      const struck = hitT < 0.7 ? 1 - (hitT / 0.7) ** 2 : 0;
      // (running: tucked in, from a jog on)
      const run = Math.max(0, Math.min(1, (this.spd - 2.8) / 2));
      const draw = away ? Math.max(0, 1 - this.holsterT / HOLSTER_S) : drawn;
      const rw = this.revW * (1 - 0.8 * struck);
      if (rw > 0.01 && this.revLoadT >= 0) this.revolverReload(p, rw, this.revLoadT);
      else if (rw > 0.01) this.revolverHands(p, rw, aiming && !away, run, draw, dt);
      // (let go mid-reload: the gun back at rest in the hand, the loader gone)
      if (!this.revFree) {
        gun.root.position.set(0, 0, 0);
        gun.root.scale.setScalar(LIFE_GUN_SCALE);
      }
      if (!(rw > 0.01 && this.revLoadT >= 0) && this.revLoaderState === "hand") this.revLoaderAt("none", 0, false);
      this.loaderFrame(dt);
      return;
    }
    // (plan 81: the life double-barrel the same way — the gun placed by its butt in the shoulder's pocket, both
    // hands put on it; reloading, for now, as it's carried with the barrels dropped: phase 4's)
    // (another gun out, or none: no double-barrel's reload going; no AK's)
    if (gun?.key !== "shotgun") this.sgLoadT = -1;
    if (gun?.key !== "ak47") this.akLoadT = -1;
    // (plan 82: the AK on the same hold, its own numbers — tp/ak-hold.ts; its draw, sling and reload for now
    // as it was: held at the ready through them)
    const LS = gun?.inHand ? LONG[gun.key] : undefined;
    if (gun && LS && this.model.handFrame("L")) {
      const sg = LS === SG_LONG;
      this.lgSpec = LS;
      // (off its grip only this frame's say: the draw's start sets it)
      this.revFree = false;
      this.revPose = null;
      this.lgTorchX = -1;
      if (this.sgShell) this.sgShell.visible = false;
      // (plan 81 phase 4: the reload — the server's step open, Player.arm, its shutting its own: everyone's —
      // run as one timeline; cut short (a shot snapped it shut, the steps done sooner): on from the closing)
      const opening = sg && (p.arm === ARM_RELOAD || p.arm === ARM_OPEN);
      if (opening && this.sgLoadT < 0 && !away) this.sgLoadT = 0;
      if (this.sgLoadT >= 0) {
        this.sgLoadT += dt;
        if (!opening && this.sgLoadT < SG_LOAD_CLOSE) this.sgLoadT = SG_LOAD_CLOSE;
        if (opening) this.sgLoadT = Math.min(this.sgLoadT, SG_LOAD_CLOSE - 0.02);
        else if (this.sgLoadT >= SG_LOAD_LEN) this.sgLoadT = -1;
      }
      // (plan 82 phase 4: the AK's — opened (Player.arm ARM.open), its magazine out and the new one in, then
      // closed as everyone's told: shouldered (ARM.shut) or racked (ARM.rack); seen mid-way, on from its
      // closing; cut short (a shot snapped it shut, the steps done sooner), on from the closing too)
      if (!sg) {
        const open = p.arm === ARM_RELOAD || p.arm === ARM_OPEN;
        const closing = p.arm === ARM_SHUT || p.arm === ARM_RACK;
        if ((open || closing) && this.akLoadT < 0 && !away) {
          this.akLoadT = open ? 0 : AK_CLOSE;
          this.akRack = false;
          this.akPrevT = -1;
        }
        if (p.arm === ARM_RACK) this.akRack = true;
        if (this.akLoadT >= 0) {
          this.akPrevT = this.akLoadT;
          this.akLoadT += dt;
          if (open) this.akLoadT = Math.min(this.akLoadT, AK_CLOSE - 0.02);
          else if (this.akLoadT < AK_CLOSE) this.akLoadT = AK_CLOSE;
          if (!open && this.akLoadT >= AK_CLOSE + (this.akRack ? AK_RL.rack : AK_RL.shut)) this.akLoadT = -1;
        }
      }
      const reloading = this.sgLoadT >= 0 || this.akLoadT >= 0;
      // (plan 81 phase 5: let go — sat, swimming, busy, a mantle, the ragdoll; a roll, a vault, a slide,
      // Flowmotion, struck: kept, pulled in across her chest — both hands on)
      // (one with no sling let go of as it's put away — it goes)
      const hold =
        !p.down && p.fell === undefined && (!this.bodyBusy || this.portMove) && !this.limp?.on && (!!LS.sling || !away);
      this.revW += ((hold ? 1 : 0) - this.revW) * (1 - Math.exp(-dt * 14));
      const run = Math.max(0, Math.min(1, (this.spd - 2.8) / 2));
      const hitT = p.hit?.t ?? 9;
      const struck = hitT < 0.7 ? 1 - (hitT / 0.7) ** 2 : 0;
      const port = this.portMove || struck > 0.2 ? 1 : 0;
      this.lgPortW += (port - this.lgPortW) * (1 - Math.exp(-dt * 12));
      // (drawn off her back, put back on it: the draw's path — plan 81 phase 2)
      const draw = !LS.sling ? 1 : away ? Math.max(0, 1 - this.holsterT / LS.sling.away) : drawn;
      const sw = this.revW;
      const ported = this.lgPortW > 0.5;
      if (sw <= 0.01) this.lgForeOn = false;
      if (sw > 0.01)
        this.longHands(p, sw, aiming && !loading && !away && !reloading && !ported, run, dt, draw, this.lgPortW);
      if (!this.revFree) {
        gun.root.position.set(0, 0, 0);
        gun.root.scale.setScalar(LIFE_GUN_SCALE);
      }
      return;
    }
    if (w < 0.01 || !gun) return;
    // the gun's way and the butt's drop, by what's being done
    const run = Math.max(0, Math.min(1, (this.spd - 3.6) / 1.4));
    // (`fwd`, `in`: the butt that far ahead of the shoulder, and in toward the chest)
    const to = aiming
      ? { L: AIM_BLADE, P: p.pitch ?? 0, drop: 0, fwd: 0, in: 0 }
      : loading && (ak || sniper)
        ? // (the AK, the sniper: kept up at the shoulder, the muzzle lowered and turned a little left — the magazine
          // well to the left hand)
          { L: 0.32, P: -0.2, drop: 0.1, fwd: 0.03, in: 0.02 }
        : loading
          ? { L: 0.45, P: -0.3, drop: 0.22, fwd: 0, in: 0 }
          : shotgun
            ? // carried, heavy: the butt against the right side of the chest, the gun across the body —
              // the muzzle ahead and to the left, a little down (and the gun turned further left in the
              // hands: gunWay.turn); running, a touch closer in
              { L: 0.7 - 0.1 * run, P: -0.22 + 0.06 * run, drop: 0.13 - 0.03 * run, fwd: -0.05, in: 0.03 }
            : ready
              ? // the low ready: the muzzle ahead and down ~40° (running: tucked closer, steeper)
                { L: 0.12, P: -0.6 - 0.25 * run, drop: 0, fwd: 0, in: 0 }
              : { L: 0, P: 0, drop: 0, fwd: 0, in: 0 };
    const k = 1 - Math.exp(-dt * 10);
    const gw = this.gunWay;
    gw.L += (to.L - gw.L) * k;
    gw.P += (to.P - gw.P) * k;
    gw.drop += (to.drop - gw.drop) * k;
    gw.fwd += (to.fwd - gw.fwd) * k;
    gw.in += (to.in - gw.in) * k;
    gw.turn += ((aiming || loading || !shotgun ? 0 : 0.4) - gw.turn) * k;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(tq);
    // the way the hands hold it (`d`); the gun itself turned `turn` further left in them (carried:
    // across the body, the hands where they were)
    const c = Math.cos(gw.P);
    const d = hw.set(Math.sin(gw.L) * c, Math.sin(gw.P), Math.cos(gw.L) * c).applyQuaternion(tq);
    const gl = gw.L + gw.turn;
    this.gunDir.set(Math.sin(gl) * c, Math.sin(gw.P), Math.cos(gl) * c).applyQuaternion(tq);
    this.gunDirOn = true;
    const up = hu.set(0, 1, 0).addScaledVector(d, -d.y);
    if (up.lengthSq() < 1e-6) up.set(0, 0, 1).applyQuaternion(tq);
    up.normalize();
    // (sizes: the gun's model metres times the hand's scale; the body's, the person's own)
    const gs = gun.root.getWorldScale(hs).x;
    // (the life look's guns are life size, at the person's own scale; the drawn ones were 1.2 / 1.4 of it)
    const life = gun.model.life ? gun.model : null;
    const body = life ? gs : gs / (shotgun ? 1.2 : 1.4);
    if (shotgun) {
      // the butt: in the right shoulder's pocket, dropped below it as carried
      this.model.bone("shoulderR")?.getWorldPosition(hp);
      hp
        .addScaledVector(d, 0.02 * gs)
        .addScaledVector(hv.set(0, 0, 1).applyQuaternion(tq), gw.fwd * body)
        .addScaledVector(hv.set(1, 0, 0).applyQuaternion(tq), gw.in * body).y -= gw.drop * body;
      // (a life gun's butt in the shoulder's pocket — under the joint, not on top of it: plan 79)
      if (life) hp.y -= 0.05 * body;
      // from the butt: the grip 0.30 along and 0.045 up, the fore-end's underside 0.535 along, 0.07 up
      // (a life gun's: from its own points)
      const ga = life?.butt ? life.grip.at[0] - life.butt[0] : 0.301 - 0.05;
      const gu = life?.butt ? life.grip.at[1] - life.butt[1] : 0.045;
      ht.copy(hp)
        .addScaledVector(d, ga * gs)
        .addScaledVector(up, gu * gs);
      this.model.reachTo("R", ht, w, [-1, -0.25, -0.15]);
      // the left: reloading, to the pocket and the breech; else under the fore-end — of the gun as
      // it ends up turned in the hand, so once it's turned (gripOnFore, after aimGun)
      if (this.boltT > 0 && !loading) {
        this.boltHand(cyc);
        this.model.reachTo("L", ht, w, [-0.5, -1, 0.2]);
      } else if (this.loadT > 0 && loading) {
        if (ak) this.magHand(gs, body, tq);
        else if (sniper) this.roundHand();
        else this.loadHand(hp, d, up, gs, body, tq);
        this.model.reachTo("L", ht, w, [-0.5, -1, 0.2]);
      } else this.foreW = w;
      return;
    }
    const wrist = this.model.bone("wristR");
    if (!wrist) return;
    if (ready) {
      // (the right fist before the chest, low: under the shoulder, ahead of it, a little in — running,
      // nearer the chest)
      this.model.bone("shoulderR")?.getWorldPosition(hp);
      hp
        .addScaledVector(hv.set(0, 0, 1).applyQuaternion(tq), (0.34 - 0.08 * run) * body)
        .addScaledVector(hv.set(1, 0, 0).applyQuaternion(tq), 0.12 * body).y -= 0.17 * body;
      this.model.reachTo("R", hp, w, [-0.6, -1, -0.3]);
    } else wrist.getWorldPosition(hp);
    if (p.torch && !p.phone) {
      // (the left wrist under the right, back to back)
      ht.copy(hp)
        .addScaledVector(up, -0.05 * gs)
        .addScaledVector(d, -0.015 * gs);
      this.model.reachTo("L", ht, w, [-0.5, -1, 0.3]);
    } else {
      // (the left hand round the right on the grip: just left of it, a little under)
      hx.crossVectors(d, up); // (the gun's right)
      ht.copy(hp)
        .addScaledVector(hx, -0.03 * gs)
        .addScaledVector(up, -0.025 * gs)
        .addScaledVector(d, -0.01 * gs);
      this.model.reachTo("L", ht, w, [-0.3, -1, 0.1]);
    }
  }

  /** (plan 80) This frame the hands are the revolver hold's: what comes after (props) leaves them be. */
  private revHeld = false;
  private revHold = newHold();
  private revBody: BodyFrame = {
    mid: new Vector3(),
    left: new Vector3(),
    up: new Vector3(),
    ahead: new Vector3(),
    k: 1,
  };
  /** (plan 80) The revolver's hold (tp/revolver-hold.ts): the gun placed in front of her by what she's
   *  doing; the right wrist put where the gun — held as it is in the hand — comes to that place, turned so;
   *  the left on the gun in the support grip, its fingers closed round the right fist (or holding the torch). */
  private revW = 0;
  /** (plan 80 phase 5) far off: the hold's cheaper one */
  private farHold = false;
  /** (plan 80 phase 5) this frame the body's in a whole-body move: the hold lets go */
  private bodyBusy = false;
  private portMove = false;
  /** (plan 81 phase 5) the double-barrel pulled in across her chest, this much */
  private lgPortW = 0;
  private revHolster = { grip: new Vector3(), f: new Vector3(), u: new Vector3() };
  private revolverHands(p: PersonIn, w: number, aiming: boolean, run: number, draw: number, dt: number) {
    const m = this.model;
    const gun = this.gun;
    const sL = m.bone("shoulderL");
    const sR = m.bone("shoulderR");
    const el = m.bone("elbowR");
    const wr = m.bone("wristR");
    const wl = m.bone("wristL");
    if (!gun || !sL || !sR || !el || !wr || !wl) return;
    // aiming, square to the look (isosceles): her feet and hips as she faces (AIM_BLADE right of the look,
    // the world's rule: shared beam.ts), her spine and chest turned the rest of the way — by what's left
    // between her shoulders' line, as the clip has it, and square to the look
    if (aiming) {
      m.root.updateMatrixWorld(true);
      sR.getWorldPosition(rv1).sub(sL.getWorldPosition(rv2));
      this.lookDir(p, rv3);
      // (her front: up × the line from her left shoulder to her right — its yaw, as the look's: atan2(x, z))
      const front = Math.atan2(rv1.z, -rv1.x);
      const look = Math.atan2(rv3.x, rv3.z);
      let turn = look - front;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      for (const [j, k] of [
        ["spine", 0.4],
        ["chest", 0.6],
      ] as const) {
        const b = m.bone(j);
        if (!b?.parent) continue;
        b.parent.getWorldQuaternion(rq1);
        rq2.setFromAxisAngle(Y3, turn * k * w);
        b.quaternion.premultiply(rq2.premultiply(rTurn.copy(rq1).invert()).multiply(rq1));
      }
    }
    const B = this.revFrame(p, aiming);
    const H = revolverHold(B, { aiming, pitch: p.pitch ?? 0, torch: !!p.torch && !p.phone, run }, this.revHold);
    // the right wrist: the gun's place less the gun's own place under the wrist (its root's and its model's)
    const g = gun.root;
    const inner = gun.model.root;
    inner.updateMatrix();
    // (its root at rest under the wrist — the draw's start, a reload, may have left it off it)
    rL.compose(ZERO3, IDQ, g.scale).multiply(inner.matrix);
    rL.decompose(rv1, rq1, rs1);
    const sw = wr.getWorldScale(rs2).x;
    rL.invert();
    const gs = sw * rs1.x;
    gunQuat(H.f, H.u, rq2);
    rM.compose(H.grip, rq2, rs2.setScalar(gs)).multiply(rL);
    rM.decompose(rAt, rTurn, rs1);
    if (H.reach > 0) {
      // the arms out as far as the hold has them, whoever she is: the gun moved along its way till the arm
      // nearer its reach has its wrist that much of the way out (the wrists' places move with it) — the
      // right's, and the left's on the gun at the support grip
      const reachR = (el.position.length() + wr.position.length()) * sR.getWorldScale(rv1).x * H.reach;
      const eL = m.bone("elbowL");
      // (the support arm a touch straighter: its wrist sits ahead of the gun hand's, on the grip's side)
      const kL = Math.min(0.998, H.reach + 0.013);
      const reachL = eL ? (eL.position.length() + wl.position.length()) * sL.getWorldScale(rv1).x * kL : reachR;
      for (let i = 0; i < 3; i++) {
        // (the left wrist's place, the gun where it's wanted)
        rM.compose(H.grip, rq2, rs2.setScalar(gs));
        rv1.copy(SUPPORT.palm).applyMatrix4(rM);
        rv2.copy(SUPPORT.along).applyQuaternion(rq2);
        rv3.copy(SUPPORT.index).applyQuaternion(rq2);
        const left = H.left === "support" && m.wristFor("L", rv1, rv2, rv3, rLAt, rq1);
        const dR = rv1.copy(rAt).sub(sR.getWorldPosition(rv2));
        const kR = (reachR - dR.length()) / Math.max(0.4, dR.normalize().dot(H.f));
        let step = kR;
        if (left) {
          const dL = rv1.copy(rLAt).sub(sL.getWorldPosition(rv2));
          step = Math.min(kR, (reachL - dL.length()) / Math.max(0.4, dL.normalize().dot(H.f)));
        }
        H.grip.addScaledVector(H.f, step);
        rAt.addScaledVector(H.f, step);
      }
    }
    // the gun's turn as the hold has it
    gunQuat(H.f, H.u, rq2);
    // (drawn or put away: along the draw's path from the holster — the right hand on it all the way, the left
    // meeting it late)
    let lw = w;
    if (draw < 1) {
      const ease = (x: number) => {
        const c = Math.max(0, Math.min(1, x));
        return c * c * (3 - 2 * c);
      };
      // (from the holster on her hip where she wears one; else where it would be)
      const hol = this.revHolster;
      if (this.holster) {
        this.holster.root.updateWorldMatrix(true, false);
        this.holster.root.matrixWorld.decompose(hol.grip, rq1, rs1);
        hol.f.set(1, 0, 0).applyQuaternion(rq1);
        hol.u.set(0, 1, 0).applyQuaternion(rq1);
      } else holsterHold(B, hol);
      const turn = ease((draw - DRAW_LIFT) / (1 - DRAW_LIFT));
      gunQuat(H.f, H.u, rq1);
      gunQuat(hol.f, hol.u, rq2).slerp(rq1, turn);
      rv1.copy(hol.grip).addScaledVector(B.up, 0.13 * B.k * ease(draw / DRAW_LIFT));
      H.grip.lerpVectors(rv1, H.grip, turn);
      lw = w * ease((draw - DRAW_MEET) / (1 - DRAW_MEET));
      w *= ease(draw / 0.08);
    }
    // (eased to it — the ready to the aim, and back, in the gun's own time, AIM_S; in her own frame, so
    // walking doesn't leave it behind; the draw's path is its own)
    this.root.updateWorldMatrix(true, false);
    const RW = this.root.matrixWorld;
    rv1.copy(H.grip).applyMatrix4(rM.copy(RW).invert());
    this.root.getWorldQuaternion(rq1);
    rq3.copy(rq1).invert().multiply(rq2);
    const E = this.revEase;
    if (!E.on || draw < 1 || p.reduced) {
      E.pos.copy(rv1);
      E.quat.copy(rq3);
      E.on = true;
    } else {
      const k = 1 - Math.exp(-dt / (AIM_S / 3));
      E.pos.lerp(rv1, k);
      E.quat.slerp(rq3, k);
    }
    H.grip.copy(E.pos).applyMatrix4(RW);
    rq2.copy(rq1).multiply(E.quat);
    // a shot's kick on the new hold: the muzzle up, the gun back — the wrists giving
    const kick = this.gunFx?.kick ?? 0;
    if (kick > 0) {
      H.grip
        .addScaledVector(rv2.set(1, 0, 0).applyQuaternion(rq2), -KICK.back * B.k * kick)
        .addScaledVector(rv3.set(0, 1, 0).applyQuaternion(rq2), KICK.up * B.k * kick);
      rq2.multiply(rq3.setFromAxisAngle(Z3, KICK.flip * kick));
    }
    rMg.compose(H.grip, rq2, rs2.setScalar(gs));
    rM.copy(rMg).multiply(rL);
    rM.decompose(rAt, rTurn, rs1);
    const cheap = this.farHold;
    m.gripTo("R", rAt, rTurn, w, H.poleR, cheap);
    // (the draw's start, the put-away's end: the gun on its path — in the holster — the hand coming to it)
    if (draw < 1 && w < this.revW * 0.98) {
      this.placeGun(rMg);
      this.revFree = true;
    }
    if (H.left === "support" && lw > 0.01) {
      // the left on the gun where it now is: its palm on the grip's left panel, over the right's fingers
      inner.updateWorldMatrix(true, false);
      const G = inner.matrixWorld;
      G.decompose(rv1, rq1, rs1);
      rv1.copy(SUPPORT.palm).applyMatrix4(G);
      rv2.copy(SUPPORT.along).applyQuaternion(rq1);
      rv3.copy(SUPPORT.index).applyQuaternion(rq1);
      if (m.wristFor("L", rv1, rv2, rv3, rAt, rTurn)) {
        // (its fingers closed round the right fist — that, in the left wrist's space as it'll be)
        rM.compose(rAt, rTurn, rs2.setScalar(wl.getWorldScale(rs1).x))
          .invert()
          .multiply(G);
        rM.decompose(rv1, rq1, rs1);
        rv2.copy(FIST.at).applyMatrix4(rM);
        rq2.setFromUnitVectors(Y3, UP_GRIP).premultiply(rq1);
        m.hold("L", { shape: FIST_SHAPE, pos: rv2, quat: rq2, kind: "support" });
        m.gripTo("L", rAt, rTurn, lw, H.poleL, cheap);
        if (lw > 0.5 && !cheap) m.thumbTo("L", rv1.copy(SUPPORT_THUMB).applyMatrix4(G));
      }
    } else if (H.left === "torch" && aiming) {
      // Harries: the left fist crossed under the right wrist, the back of the hand up against it, the torch
      // held ice-pick — its own line ahead along the barrel (the lens out of the little finger's side)
      const Ft = m.handFrame("L");
      const f = rv2.set(1, 0, 0).applyQuaternion(rq2);
      const u = rv3.set(0, 1, 0).applyQuaternion(rq2);
      wr.getWorldPosition(rv1)
        .addScaledVector(u, -HARRIES.under * B.k)
        .addScaledVector(f, HARRIES.ahead * B.k)
        .addScaledVector(rv4.crossVectors(f, u), HARRIES.right * B.k);
      if (Ft && m.wristTo("L", rv1, this.C.gripLine("torch", Ft, rv4), f, Ft.n, rv5.copy(u).negate(), rLAt, rq1)) {
        m.gripTo("L", rLAt, rq1, lw, H.poleL, cheap);
        this.revHarries = true;
      }
    } else if (H.left === "torch") m.reachTo("L", H.torchAt, lw, H.poleL);
    // the trigger finger: straight along the frame at the ready, on the trigger aimed — curled on with a pull
    this.revAimK += ((aiming ? 1 : 0) - this.revAimK) * (1 - Math.exp(-dt / (AIM_S / 3)));
    const aimK = this.revAimK;
    if (!cheap)
      m.indexTo("R", INDEX.ready + (INDEX.aim - INDEX.ready) * aimK + INDEX.pull * (this.gunFx?.trigger ?? 0));
    // aimed, the head down onto the sights
    if (aimK > 0.01 && !cheap) this.headToSights(p, aimK * w);
    this.revHeld = true;
  }
  private revEase = { on: false, pos: new Vector3(), quat: new Quaternion() };
  /** (plan 80) Her frame for the hold: her shoulders' middle, her size against the mocks' man, up, ahead
   *  (the look's way aiming, else the way she faces) and her left */
  private revFrame(p: PersonIn, aiming: boolean): BodyFrame {
    const m = this.model;
    const B = this.revBody;
    const sL = m.bone("shoulderL");
    const sR = m.bone("shoulderR");
    const el = m.bone("elbowR");
    const wr = m.bone("wristR");
    m.root.updateMatrixWorld(true);
    if (sL && sR && el && wr) {
      sL.getWorldPosition(B.mid);
      B.mid.add(sR.getWorldPosition(rv1)).multiplyScalar(0.5);
      B.k = ((el.position.length() + wr.position.length()) * sR.getWorldScale(rv1).x) / MOCK_ARM;
    }
    B.up.set(0, 1, 0);
    if (aiming) {
      this.lookDir(p, B.ahead).y = 0;
      B.ahead.normalize();
    } else B.ahead.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(rq1));
    B.left.crossVectors(B.up, B.ahead).normalize();
    return B;
  }

  // ── the reload (plan 80 phase 4): the gun through its keys, both hands working it (tp/revolver-hold.ts) ──
  /** s into the reload's timeline (-1: not reloading) */
  private revLoadT = -1;
  /** the gun's parts as the reload has them (gunMoves poses it so); null: as Arms says */
  private revPose: { open: number; loaded: number; rod: number } | null = null;
  /** this frame the gun's off the right hand's grip: placed where the reload has it (props leaves it be) */
  private revFree = false;
  private revLoader: { root: Group; model: GunModel; fall: number; v: number } | null = null;
  private revLoaderHand = new Matrix4();
  private revolverReload(p: PersonIn, w: number, t: number) {
    const m = this.model;
    const gun = this.gun;
    const wr = m.bone("wristR");
    const wl = m.bone("wristL");
    const FR = m.handFrame("R");
    const FL = m.handFrame("L");
    if (!gun || !wr || !wl || !FR || !FL) return;
    const B = this.revFrame(p, false);
    const st = reloadAt(t);
    const g = gun.root;
    const inner = gun.model.root;
    // the gun's place between its keys (the ready: the hold as she is now — the hold eases on from the end)
    this.root.updateWorldMatrix(true, false);
    const RW = this.root.matrixWorld;
    this.root.getWorldQuaternion(rqRoot);
    const E = this.revEase;
    const H = revolverHold(B, { aiming: false, pitch: 0, torch: !!p.torch && !p.phone, run: 0 }, this.revHold);
    const key = (name: string, pos: Vector3, quat: Quaternion) => {
      if (name === "hold") {
        pos.copy(H.grip);
        gunQuat(H.f, H.u, quat);
        return;
      }
      const K = RELOAD_KEYS[name];
      at(B, K.at[0], K.at[1], K.at[2], pos);
      gunQuat(bodyDir(B, K.f, rv1), bodyDir(B, K.u, rv2), quat);
    };
    const leg = legAt(RELOAD_GUN, t);
    key(leg.a, rgA, rqA);
    key(leg.b, rgB, rqB);
    rgA.lerp(rgB, leg.k);
    rqA.slerp(rqB, leg.k);
    // its parts: the crane, the rod, the rounds (out once the rod's struck, in with the loader)
    const loaded = this.gunFx?.loaded ?? 6;
    this.revPose = {
      open: st.crane,
      loaded: st.rounds < 0 ? loaded : st.rounds > 0 ? Math.max(loaded, 6) : 0,
      rod: st.rod,
    };
    poseGun(gun.model, "revolver", { cock: 0, ...this.revPose });
    // the gun held as it is in the hand (its root at rest under the wrist), and placed there for now
    inner.updateMatrix();
    rL0.compose(ZERO3, IDQ, g.scale).multiply(inner.matrix);
    rL0.decompose(rv1, rq1, rs1);
    const gs = wr.getWorldScale(rs2).x * rs1.x;
    rMg.compose(rgA, rqA, rs2.setScalar(gs));
    this.placeGun(rMg);
    inner.updateWorldMatrix(true, true);
    const f = rv3.set(1, 0, 0).applyQuaternion(rqA);
    const u = rv4.set(0, 1, 0).applyQuaternion(rqA);
    // the loader in the right hand (its wrist's space): its rims behind the palm's middle, pointing out of it
    const n = rn.copy(FR.n).normalize();
    rLh.makeBasis(n, ra.copy(FR.along).addScaledVector(n, -FR.along.dot(n)).normalize(), rc.crossVectors(n, ra));
    rLh.setPosition(
      rp
        .copy(FR.mid)
        .multiplyScalar(0.55)
        .addScaledVector(n, 0.022 + LOADER_IN_HAND),
    );
    this.revLoaderHand.copy(rLh);
    // each hand's place and turn for a part of the timeline
    const cyl = gun.model.parts.cylinder;
    const place = (name: string, pos: Vector3, quat: Quaternion): boolean => {
      if (name === "grip") {
        rM.copy(rMg).multiply(rL1.copy(rL0).invert()).decompose(pos, quat, rs1);
        return true;
      }
      if (name === "rod") {
        // (the flat palm on the rod's head — struck down along the barrel)
        const head = gun.model.parts.rod?.localToWorld(rh.set(0.065, 0, 0)) ?? rh.copy(rgA);
        head.addScaledVector(f, 0.004);
        // (the fingers across her, to her left and away — the forearm level over it, not the wrist bent back)
        rx.copy(B.left).addScaledVector(u, -0.6).normalize();
        return m.wristTo("R", head, FR.along, rx, FR.n, ry.copy(f).negate(), pos, quat);
      }
      if (name === "pouch") {
        // (the fingers down into it, the palm in)
        const top = this.pouch ? this.pouch.root.localToWorld(rh.set(0, 0.066, 0)) : at(B, -0.15, -0.5, 0.12, rh);
        top.addScaledVector(B.up, 0.03 * B.k);
        return m.wristTo("R", top, FR.along, rx.copy(B.up).negate(), FR.n, B.left, pos, quat);
      }
      if (name === "load" && cyl) {
        // (the loader square to the chambers, short of them, pushed home; the knob turned — the hand with it)
        cyl.updateWorldMatrix(true, false);
        rM.copy(cyl.matrixWorld).multiply(rL1.makeTranslation(0.0175 - LOADER_START * (1 - st.push), 0, 0));
        rM.multiply(rL1.makeRotationX(0.6 * st.twist));
        rM.multiply(rL1.copy(rLh).invert()).decompose(pos, quat, rs1);
        return true;
      }
      if (name === "support") {
        rv1.copy(SUPPORT.palm).applyMatrix4(rMg);
        return m.wristFor(
          "L",
          rv1,
          rx.copy(SUPPORT.along).applyQuaternion(rqA),
          ry.copy(SUPPORT.index).applyQuaternion(rqA),
          pos,
          quat,
        );
      }
      if (name === "cyl" && cyl) {
        // (the left hand round the cylinder like a can, from the side toward her left shoulder — its thumb up
        // along it toward its rear, the fingers round its far side, the middle ones through the frame's
        // window — however the gun's turned)
        const c = cyl.localToWorld(rh.set(CYL_PALM.along, 0, 0));
        const sh = m.bone("shoulderL")?.getWorldPosition(rx) ?? rx.copy(B.mid);
        const d = sh.sub(c);
        d.addScaledVector(f, -d.dot(f)).normalize();
        c.addScaledVector(d, CYL_PALM.under * B.k);
        return m.wristTo("L", c, FL.across, ry.copy(f).negate(), FL.n, d.negate(), pos, quat);
      }
      return false;
    };
    const blend = (legs: [string, string, number, number][]) => {
      const h = legAt(legs, t);
      if (!place(h.a, rhA, rhqA)) return h;
      if (h.b !== h.a && h.k > 0 && place(h.b, rhB, rhqB)) {
        rhA.lerp(rhB, h.k);
        rhqA.slerp(rhqB, h.k);
      }
      return h;
    };
    // both hands' places first (the right's IK moves the gun with the wrist: read where it is before)
    const hr = blend(RELOAD_RIGHT);
    const rNow = hr.k < 0.5 ? hr.a : hr.b;
    rAt.copy(rhA);
    rTurn.copy(rhqA);
    const hl = blend(RELOAD_LEFT);
    const lNow = hl.k < 0.5 ? hl.a : hl.b;
    rLAt.copy(rhA);
    rq3.copy(rhqA);
    // what the left's fingers close round — in its wrist's space as it'll be
    rM.compose(rLAt, rq3, rs2.setScalar(wl.getWorldScale(rs1).x)).invert();
    if (lNow === "support") {
      rM.multiply(rMg);
      rM.decompose(rv1, rq1, rs1);
      rhB.copy(FIST.at).applyMatrix4(rM);
      rhqB.setFromUnitVectors(Y3, UP_GRIP).premultiply(rq1);
      m.hold("L", { shape: FIST_SHAPE, pos: rhB, quat: rhqB, kind: "support" });
    } else if (cyl) {
      rM.multiply(cyl.matrixWorld);
      rM.decompose(rv1, rq1, rs1);
      rhB.set(0.03, 0, 0).applyMatrix4(rM);
      rhqB.setFromUnitVectors(Y3, X3).premultiply(rq1);
      m.hold("L", { shape: CYL_SHAPE, pos: rhB, quat: rhqB, kind: "cyl" });
    }
    // …the right's
    if (rNow === "grip") {
      gripShapeAt(inner.quaternion, inner.position, rv1, rq1);
      m.hold("R", { shape: GUN_GRIP_SHAPE, pos: rv1, quat: rq1, kind: "gun" });
    } else if (rNow === "pouch" || rNow === "load") {
      // (the loader's body in the fingertips)
      rv1.set(-0.009, 0, 0).applyMatrix4(rLh);
      rq1.setFromRotationMatrix(rLh).multiply(rq2.setFromUnitVectors(Y3, X3));
      m.hold("R", { shape: LOADER_SHAPE, pos: rv1, quat: rq1, kind: "loader" });
    } else m.hold("R", null);
    const cheap = this.farHold;
    m.gripTo("R", rAt, rTurn, w, [-0.8, -1, -0.4], cheap);
    m.gripTo("L", rLAt, rq3, w, [-0.8, -1, -0.4], cheap);
    if (lNow === "support" && hl.k > 0.5 && !cheap) m.thumbTo("L", rv1.copy(SUPPORT_THUMB).applyMatrix4(rMg));
    // the fingers: along the frame on the grip, flat on the rod
    if (rNow === "grip" && !cheap) m.indexTo("R", INDEX.ready);
    else if (rNow === "rod" && !cheap) m.fingersTo("R", 0.1);
    // the gun: on the grip, held by it at rest; off it, where the timeline has it
    if (rNow === "grip" && hr.a === hr.b) {
      g.position.set(0, 0, 0);
      g.quaternion.identity();
      g.scale.setScalar(rs1.set(1, 1, 1).x * LIFE_GUN_SCALE);
    } else {
      this.placeGun(rMg);
      this.revFree = true;
    }
    // the loader: from the pouch in the hand, then into the chambers, let go
    this.revLoaderAt(st.loader, st.twist, st.loaderRounds);
    // (the hold's ease follows the gun, so it eases on from here when the reload's done)
    E.pos.copy(rgA).applyMatrix4(rM.copy(RW).invert());
    E.quat.copy(rqRoot).invert().multiply(rqA);
    E.on = true;
    this.revHeld = true;
  }
  /** (plan 80) The gun (its model's frame) at a place in the world, whatever the right wrist's doing: its root
   *  set under the wrist so */
  private placeGun(M: Matrix4) {
    const g = this.gun;
    const wr = this.model.bone("wristR");
    if (!g || !wr) return;
    wr.updateWorldMatrix(true, false);
    g.model.root.updateMatrix();
    rM.copy(wr.matrixWorld)
      .invert()
      .multiply(M)
      .multiply(rL1.copy(g.model.root.matrix).invert())
      .decompose(g.root.position, g.root.quaternion, g.root.scale);
    g.root.updateMatrixWorld(true);
  }
  /** (plan 80) The speedloader: in the right hand (its fingertips) from the pouch to the chambers, its rounds in
   *  it till they go in, its knob twisted; then let go — it falls to her feet and is gone */
  private revLoaderState: "none" | "hand" | "fall" = "none";
  private revLoaderAt(state: "none" | "hand" | "fall", twist: number, rounds: boolean) {
    this.revLoaderState = state;
    if (state === "none") {
      if (this.revLoader) this.revLoader.root.visible = false;
      return;
    }
    const tpl = this.mats.gun?.("speedloader") ?? null;
    if (!this.revLoader && tpl) {
      const model = lifeGunModel("speedloader" as GunKind, tpl);
      const root = new Group();
      root.add(model.root);
      this.revLoader = { root, model, fall: -1, v: 0 };
    }
    const L = this.revLoader;
    const wr = this.model.bone("wristR");
    if (!L || !wr) return;
    const parent = this.root.parent ?? this.root;
    if (L.root.parent !== parent) parent.add(L.root);
    L.root.visible = true;
    if (L.model.parts.knob) L.model.parts.knob.rotation.x = 0.6 * twist;
    for (const r of L.model.rounds) r.visible = rounds;
    if (L.model.parts.rounds) L.model.parts.rounds.visible = rounds;
    if (state === "hand") {
      L.fall = -1;
      L.v = 0;
      wr.updateWorldMatrix(true, false);
      parent.updateWorldMatrix(true, false);
      rM.copy(parent.matrixWorld).invert().multiply(wr.matrixWorld).multiply(this.revLoaderHand);
      rM.decompose(L.root.position, L.root.quaternion, L.root.scale);
    } else if (L.fall < 0) L.fall = 0;
  }
  /** (…its fall, each frame: down to her feet, a moment there, gone) */
  private loaderFrame(dt: number) {
    const L = this.revLoader;
    if (!L || L.fall < 0 || this.revLoaderState === "hand") return;
    L.fall += dt;
    L.v += 9.8 * dt;
    const floor = (this.root.parent ? this.root.position.y : this.root.getWorldPosition(rv1).y) + 0.02;
    L.root.position.y = Math.max(floor, L.root.position.y - L.v * dt);
    if (L.fall > 0.9) {
      L.root.visible = false;
      L.fall = -1;
    }
  }

  private revAimK = 0;
  /** (plan 80) This frame the left hand is Harries' (torchFrame leaves its wrist be) */
  private revHarries = false;

  // ── plans 81–82: the long guns' hold (tp/long-hold.ts, tp/shotgun-hold.ts, tp/ak-hold.ts) ─────────────────
  private lgEase = { on: false, pos: new Vector3(), quat: new Quaternion() };
  private lgHold = { grip: new Vector3(), f: new Vector3(), u: new Vector3(), q: new Quaternion() };
  /** (plans 81–82) A long gun's hold, by its LongSpec (this.lgSpec — tp/long-hold.ts): her trunk turned a little
   *  right of where it points, the gun placed by its butt in her right shoulder's pocket (aimed, or the AK's low
   *  ready) or carried at her side (the double-barrel), eased between them in its own time; the right wrist put
   *  where the gun — held in the fist by its grip — comes to that place; the left palm up under the fore part as
   *  far out as her arm reaches, its fingers closed round it */
  private longHands(p: PersonIn, w: number, aiming: boolean, run: number, dt: number, draw = 1, port = 0) {
    const m = this.model;
    const gun = this.gun;
    const LS = this.lgSpec;
    const sL = m.bone("shoulderL");
    const sR = m.bone("shoulderR");
    const eL = m.bone("elbowL");
    const wr = m.bone("wristR");
    const wl = m.bone("wristL");
    // (the part the left hand's on — the double-barrel's barrels, they drop with it; the AK itself)
    const fore = LS.fore.part ? gun?.model.parts[LS.fore.part] : gun?.model.root;
    const barrels = gun?.model.parts.barrels;
    if (!gun || !sL || !sR || !eL || !wr || !wl || !fore) return;
    const pivot = LS.fore.pivot;
    // (plan 81 phase 4: reloading — where the timeline has the gun, the hands, the parts)
    const LT = this.sgLoadT;
    const L = LT >= 0 && barrels ? sgLoadAt(LT) : null;
    // (plan 82 phase 4: the AK's reload — where its timeline has the gun, the magazine, the left hand)
    const AL = this.akLoadT >= 0 && LS === AK_LONG ? akLoadAt(this.akLoadT, this.akRack) : null;
    this.akMagOwn = !!AL;
    const gLeg = L ? legAt(SG_LOAD_GUN_LEGS, LT) : null;
    const kLoad = !gLeg ? 0 : gLeg.a === "load" ? (gLeg.b === "load" ? 1 : 1 - gLeg.k) : gLeg.k;
    // (pulled in across her chest — not mid-reload: the reload's hands have it)
    const pw = L || AL ? 0 : port;
    // her trunk turned right of the gun's way: square, her left arm couldn't reach the fore-end (loading, less)
    m.root.updateMatrixWorld(true);
    sR.getWorldPosition(rv1).sub(sL.getWorldPosition(rv2));
    const front = Math.atan2(rv1.z, -rv1.x);
    this.lookDir(p, rv3);
    const way = aiming ? Math.atan2(rv3.x, rv3.z) : Math.atan2(...this.facingXZ());
    const blade = LS.blade.ready + (LS.blade.aim - LS.blade.ready) * this.lgAimK;
    const kL = AL ? AL.gun : kLoad;
    let turn = way - (blade + ((AL ? AK_LOAD_BLADE : SG_LOAD_BLADE) - blade) * kL) - front;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    // (aimed, the trunk takes the pitch: a long gun's raised and lowered by the body bending at the waist —
    // the gun, the shoulders and the head one piece, the arms as they are level)
    // (a shot's kick, aimed: her trunk rocked back by it — the gun with it, below)
    const kick = aiming ? (this.gunFx?.kick ?? 0) : 0;
    const lean = (-LS.aim.trunk * (p.pitch ?? 0) * this.lgAimK - LS.kick.rock * kick) * w;
    rv5.set(rv3.z, 0, -rv3.x).normalize();
    for (const [j, k] of [
      ["spine", 0.4],
      ["chest", 0.6],
    ] as const) {
      const b = m.bone(j);
      if (!b?.parent) continue;
      b.parent.getWorldQuaternion(rq1);
      rq2.setFromAxisAngle(Y3, turn * k * w * Math.min(1, draw * 1.5) * (1 - pw));
      if (lean) rq2.premultiply(rq3.setFromAxisAngle(rv5, lean * k * (1 - pw)));
      b.quaternion.premultiply(rq2.premultiply(rTurn.copy(rq1).invert()).multiply(rq1));
    }
    // her left shoulder forward, reaching for the fore-end (its rest put back each frame, gunHands)
    if (this.sLRest.bone !== sL) {
      this.sLRest.bone = sL;
      this.sLRest.pos.copy(sL.position);
    }
    sL.position
      .copy(this.sLRest.pos)
      .addScaledVector(Z3, (LS.protract * w * this.lgLeftW * (1 - pw)) / (sL.parent?.getWorldScale(rv5).x || 1));
    sL.updateMatrixWorld(true);
    const B = this.revFrame(p, aiming);
    const H = this.lgHold;
    longHold(
      LS,
      B,
      sR.getWorldPosition(rv4),
      {
        aiming,
        pitch: p.pitch ?? 0,
        run,
        bust: p.avatar.gender === "feminine" ? 1 : 0,
        // (her trunk's lean back with the aim's pitch)
        lean: LS.aim.trunk * (p.pitch ?? 0) * this.lgAimK,
      },
      H,
    );
    // (eased to it in the gun's own time — ARMS.shotgun.aim — in her own frame, from her right shoulder: the
    // butt against it, the gun goes with it — eased from her root, it lagged the shoulder's bob running and the
    // AK's near-straight left arm threw its elbow 3 cm a frame)
    this.root.updateWorldMatrix(true, false);
    const RW = lgFW.copy(this.root.matrixWorld).setPosition(rv4);
    rv1.copy(H.grip).applyMatrix4(rM.copy(RW).invert());
    this.root.getWorldQuaternion(rq1);
    rq3.copy(rq1).invert().multiply(H.q);
    const E = this.lgEase;
    if (!E.on || p.reduced) {
      E.pos.copy(rv1);
      E.quat.copy(rq3);
      E.on = true;
    } else {
      const k = 1 - Math.exp(-dt / (LS.aimS / 3));
      E.pos.lerp(rv1, k);
      E.quat.slerp(rq3, k);
    }
    H.grip.copy(E.pos).applyMatrix4(RW);
    H.q.copy(rq1).multiply(E.quat);
    // (aimed with a cheek on the stock: the gun up and in to her face as far as her neck didn't bring her eye
    // down to the sights — cheekTo's)
    if (LS.cheek && this.lgAimK > 0.01)
      H.grip
        .addScaledVector(rv1.set(0, 1, 0).applyQuaternion(H.q), this.lgCheek.y * this.lgAimK)
        .addScaledVector(rv1.set(0, 0, 1).applyQuaternion(H.q), this.lgCheek.z * this.lgAimK);
    // a shot's kick (past the ease — it's quicker): the muzzle up about the butt, the gun back into the shoulder
    if (kick > 0) {
      const butt = rv1.copy(LS.butt).multiplyScalar(B.k).applyQuaternion(H.q).add(H.grip);
      rq2.setFromAxisAngle(rv2.set(0, 0, 1).applyQuaternion(H.q), LS.kick.flip * kick);
      H.grip.sub(butt).applyQuaternion(rq2).add(butt);
      H.q.premultiply(rq2);
      H.grip.addScaledVector(rv2.set(1, 0, 0).applyQuaternion(H.q), -LS.kick.back * B.k * kick);
    }
    // a whole-body move or struck: pulled in across her chest (port arms — her chest's frame: it goes round with
    // her), both hands on
    if (pw > 0.001) {
      const chest = m.bone("chest");
      if (chest) {
        chest.updateWorldMatrix(true, false);
        rM.compose(SG_PORT.at, SG_PORT.turn, rs2.set(1, 1, 1))
          .premultiply(chest.matrixWorld)
          .decompose(rgA, rqA, rs1);
        H.grip.lerp(rgA, pw);
        H.q.slerp(rqA, pw);
        // (the hold's ease follows it, so it eases back from here)
        E.pos.copy(H.grip).applyMatrix4(rM.copy(RW).invert());
        E.quat.copy(this.root.getWorldQuaternion(rqRoot)).invert().multiply(H.q);
      }
    }
    // reloading: the gun between the hold and down under the right arm for loading — shut by the stock lifted
    // about the hinge up to the barrels (they stay where the left hand has them)
    if (L && gLeg) {
      const keyAt = (name: string, pos: Vector3, quat: Quaternion) => {
        if (name === "hold") {
          pos.copy(H.grip);
          quat.copy(H.q);
          return;
        }
        const K = SG_LOAD_GUN;
        at(B, K.at[0], K.at[1], K.at[2], pos);
        gunQuat(bodyDir(B, K.f, rv1), bodyDir(B, K.u, rv2), quat);
        if (LT >= SG_LOAD_CLOSE) {
          const hinge = rv3.copy(SG_HINGE).multiplyScalar(B.k).applyQuaternion(quat).add(pos);
          rq1.setFromAxisAngle(rv4.set(0, 0, 1).applyQuaternion(quat), -0.52 * (1 - L.open));
          pos.sub(hinge).applyQuaternion(rq1).add(hinge);
          quat.premultiply(rq1);
        }
      };
      keyAt(gLeg.a, rgA, rqA);
      keyAt(gLeg.b, rgB, rqB);
      H.grip.copy(rgA).lerp(rgB, gLeg.k);
      H.q.copy(rqA).slerp(rqB, gLeg.k);
      // (the hold's ease follows the gun, so it eases on from here when the reload's done)
      E.pos.copy(H.grip).applyMatrix4(rM.copy(RW).invert());
      E.quat.copy(this.root.getWorldQuaternion(rqRoot)).invert().multiply(H.q);
      E.on = true;
      // its parts: the barrels dropped (the lever across with them), the shells — kicked out, each pushed home
      const had = Math.min(2, this.gunFx?.loaded ?? 2);
      this.revPose = { open: L.open, loaded: L.ejected ? L.home : had, rod: 0 };
      poseGun(gun.model, "shotgun", { cock: 0, ...this.revPose });
    }
    // (plan 82: the AK in close for loading — its butt under her right arm, the well turned to her left hand —
    // and back up; the hold's ease follows it)
    if (AL && AL.gun > 0.001) {
      const K = AK_LOAD_GUN;
      sR.getWorldPosition(akV1)
        .addScaledVector(B.left, K.butt[0] * B.k)
        .addScaledVector(B.up, K.butt[1] * B.k)
        .addScaledVector(B.ahead, K.butt[2] * B.k);
      gunQuat(bodyDir(B, K.f, rv1), bodyDir(B, K.u, rv2), akQ1);
      akV1.sub(akV2.copy(LS.butt).multiplyScalar(B.k).applyQuaternion(akQ1));
      H.grip.lerp(akV1, AL.gun);
      H.q.slerp(akQ1, AL.gun);
      E.pos.copy(H.grip).applyMatrix4(rM.copy(RW).invert());
      E.quat.copy(this.root.getWorldQuaternion(rqRoot)).invert().multiply(H.q);
      E.on = true;
    }
    // (drawn off her back or put back on it: along the draw's keys — the right hand on it from the start, the
    // left meeting it at the end)
    // (her left hand on the gun aimed, reloading, or pulled in across her chest — carried at her side it's
    // free: eased on and off)
    // (reloading, on till the gun goes back to her side — then it lets go)
    // (the AK's on it carried too: the low ready in both hands, F1b)
    const leftOn =
      LS.leftCarried || aiming || (!!L && LT < SG_LOAD_GUN_LEGS[SG_LOAD_GUN_LEGS.length - 1][2]) || pw > 0.5 ? 1 : 0;
    this.lgLeftW = p.reduced ? leftOn : this.lgLeftW + (leftOn - this.lgLeftW) * (1 - Math.exp(-dt * 12));
    let lw = w * this.lgLeftW;
    const SL = LS.sling;
    if (draw < 1 && SL) {
      E.on = false;
      const chest = m.bone("chest");
      if (chest) {
        chest.updateWorldMatrix(true, false);
        rM.compose(slungAt(SL, p, lgSlung), SL.turn, rs2.set(1, 1, 1));
        rM.premultiply(chest.matrixWorld).decompose(rgA, rqA, rs1);
      } else {
        rgA.copy(H.grip);
        rqA.copy(H.q);
      }
      // (the keys: slung, its own between — the double-barrel's lifted, over the shoulder, before the chest; the
      // AK's round her right side — the hold)
      const n = SL.keys.length + 1;
      const seg = Math.min(n - 1, Math.floor(draw * n));
      const kk = draw * n - seg;
      const ease = kk * kk * (3 - 2 * kk);
      const keyAt = (i: number, pos: Vector3, quat: Quaternion) => {
        if (i <= 0) {
          pos.copy(rgA);
          quat.copy(rqA);
        } else if (i >= n) {
          pos.copy(H.grip);
          quat.copy(H.q);
        } else {
          const K = SL.keys[i - 1];
          at(B, K.at[0], K.at[1], K.at[2], pos);
          const f = bodyDir(B, K.f, rv1);
          // (its top: the key's, or the way it turns over — about her left-right line)
          if (K.u) bodyDir(B, K.u, rv2);
          else rv2.crossVectors(rv3.copy(B.left).negate(), f).normalize();
          gunQuat(f, rv2, quat);
        }
      };
      keyAt(seg, rgB, rqB);
      keyAt(seg + 1, rv4, rq2);
      H.grip.copy(rgB).lerp(rv4, ease);
      H.q.copy(rqB).slerp(rq2, ease);
      lw *= Math.max(0, Math.min(1, (draw - 0.75) / 0.25));
    }
    // the right wrist: the gun's place less the gun's own under the wrist (its root at rest)
    const g = gun.root;
    const inner = gun.model.root;
    inner.updateMatrix();
    rL.compose(ZERO3, IDQ, g.scale).multiply(inner.matrix);
    rL.decompose(rv1, rq2, rs1);
    const gs = wr.getWorldScale(rs2).x * rs1.x;
    rMg.compose(H.grip, H.q, rs2.setScalar(gs));
    rM.copy(rMg).multiply(rL.invert());
    rM.decompose(rAt, rTurn, rs1);
    const cheap = this.farHold;
    // (reaching back for it at the draw's start, putting it back at its end: the gun on its path, the hand
    // coming to it)
    const rw = draw < 1 ? w * Math.min(1, draw / 0.12) : w;
    // reloading: the gun off the right hand's grip (the left and the stock under the arm have it); the right
    // to the timeline's places — the wrist, a loop on the carrier, a chamber's mouth, home — the shell in it
    let rNow = "grip";
    if (L && barrels) {
      this.placeGun(rMg);
      this.revFree = true;
      rNow = this.sgRight(B, LT, L.inHand, barrels, gs);
    } else this.sgShellIn = false;
    // (off the wrist, its fingers closed round nothing — a shell's pinched, below)
    if (L && rNow !== "grip") m.hold("R", null);
    // (reloading, the stock's along her side under her arm: the arm kept out of it — the butt to behind the
    // hand on the wrist)
    let avoid: { a: Vector3; b: Vector3; r: number } | undefined;
    // (…and carried at her side: the stock back under her forearm)
    const A = LS.avoid;
    if (A && (L || (!aiming && pw < 0.5))) {
      sgAvoid.a.set(A.a[0], A.a[1], 0).applyMatrix4(rMg);
      sgAvoid.b.set(A.b[0], A.b[1], 0).applyMatrix4(rMg);
      sgAvoid.r = A.r * B.k;
      avoid = sgAvoid;
    }
    m.gripTo("R", rAt, rTurn, rw, [-1, -0.5, -0.5], cheap, avoid);
    if (L) {
      this.placeGun(rMg);
      this.sgShellPlace();
      // (the shell pinched by its brass: the fingertips curled on it, the thumb on its rim's side)
      if (this.sgShellIn && this.sgShell && !cheap) {
        m.fingersTo("R", 1.15);
        this.sgShell.updateWorldMatrix(true, false);
        m.thumbTo("R", this.sgShell.localToWorld(rv1.set(-0.004, 0, 0.012)));
      }
    } else if (rw < w * 0.98) {
      this.placeGun(rMg);
      this.revFree = true;
    }
    // the left under the fore-end, where the gun now is (the barrels' — dropped with them, opening)
    g.updateMatrixWorld(true);
    const BW = fore.matrixWorld;
    BW.decompose(rv5, rq2, rs1);
    // (the torch on: held under the fore-end in the same fist — the palm under it, F3a)
    const T = this.torch;
    const torch = !!T && lw > 0.5;
    const F = LS.fore;
    const palmY = torch ? LS.torch.palm : F.y;
    // (as far out as the arm reaches: where along the fore-end the WRIST is exactly the arm's length from the
    // shoulder — the hand's turn there is the fore-end's whatever the place, so the wrist is the palm less one
    // offset; a palm's reach plus a slack fell 3 cm short palm up. Smoothly, then eased: stepped a centimetre
    // at a time, walking, the hand flicked between two steps and the nearly straight arm threw the elbow 3 cm)
    const reach = (eL.position.length() + wl.position.length()) * sL.getWorldScale(rs2).x - 0.004 * B.k;
    rv2.copy(F.along).applyQuaternion(rq2);
    rv3.copy(F.index).applyQuaternion(rq2);
    rv1.set(0, palmY, 0).sub(pivot).applyMatrix4(BW);
    const off = m.wristFor("L", rv1, rv2, rv3, rLAt, rq3) ? rgB.copy(rLAt).sub(rv1) : rgB.set(0, 0, 0);
    sL.getWorldPosition(rv4);
    const p0 = rv1.add(off).sub(rv4);
    const dx = rv2.set(1, palmY, 0).sub(pivot).applyMatrix4(BW).add(off).sub(rv4).sub(p0);
    const qa = dx.lengthSq();
    const qb = 2 * p0.dot(dx);
    const qc = p0.lengthSq() - reach * reach;
    const disc = qb * qb - 4 * qa * qc;
    const want = Math.max(
      F.x[0],
      Math.min(F.x[1], disc >= 0 && qa > 1e-9 ? (-qb + Math.sqrt(disc)) / (2 * qa) : F.x[0]),
    );
    this.lgForeX = this.lgForeOn && !p.reduced ? this.lgForeX + (want - this.lgForeX) * (1 - Math.exp(-dt * 18)) : want;
    this.lgForeOn = true;
    const x = this.lgForeX;
    this.lgTorchX = torch ? x : -1;
    rv1.set(x, palmY, 0).sub(pivot).applyMatrix4(BW);
    rv2.copy(F.along).applyQuaternion(rq2);
    rv3.copy(F.index).applyQuaternion(rq2);
    const foreOk = m.wristFor("L", rv1, rv2, rv3, rLAt, rq3);
    // (plan 82: the AK's reload — her left hand to the magazine, the pouch, the well, the charging handle)
    if (AL && foreOk) this.akLeft(AL, lw, cheap, F, x, pivot, BW);
    else if (foreOk) {
      // (its fingers closed round the fore-end — in the left wrist's space as it'll be)
      rM.compose(rLAt, rq3, rs2.setScalar(wl.getWorldScale(rs1).x))
        .invert()
        .multiply(BW);
      rM.decompose(rv4, rq1, rs1);
      rv2.set(x, F.shape.y, 0).sub(pivot).applyMatrix4(rM);
      rq2.setFromUnitVectors(Y3, X3).premultiply(rq1);
      if (lw > 0.3) m.hold("L", { shape: torch ? LS.torch.held : F.shape.shape, pos: rv2, quat: rq2, kind: "fore" });
      else if (!T) m.hold("L", null);
      if (lw > 0.01) m.gripTo("L", rLAt, rq3, lw, [-0.6, -1, -0.2], cheap);
      // (the thumb laid along the fore-end's left side, ahead — closed round the box it went into it; the torch
      // in the fist, along the torch's)
      if (!cheap && lw > 0.5) {
        const th = torch ? LS.torch.thumb : F.thumb;
        m.thumbTo(
          "L",
          rv1
            .set(x + th[0], th[1], th[2])
            .sub(pivot)
            .applyMatrix4(BW),
        );
      }
    }
    // the trigger finger: along the guard carried, on the front trigger aimed; reloading, the thumb across the
    // top lever opening it
    if (!cheap && rNow === "grip") m.indexTo("R", aiming ? 0.6 + 0.3 * (this.gunFx?.trigger ?? 0) : 0.12);
    if (!cheap && L && L.lever > 0.5) m.thumbTo("R", rv1.copy(LEVER_THUMB).applyMatrix4(rMg));
    // (plan 82: loading the AK, her eyes on the well)
    if (AL && AL.look > 0.01 && !cheap) {
      const head = m.bone("head");
      if (head) {
        rv1.copy(MAG.lug).applyMatrix4(gun.model.root.matrixWorld);
        this.headToward(rv1.sub(head.getWorldPosition(rv2)).normalize(), 0.7 * AL.look * w);
      }
    }
    // (the magazine put back home once it's done)
    if (!AL && LS === AK_LONG) this.akMagHome();
    // (loading, her eyes on the breech)
    if (L && barrels && kLoad > 0.01 && !cheap) {
      const head = m.bone("head");
      if (head) {
        rv1.set(0.142, 0.066, 0).sub(SG_HINGE).applyMatrix4(barrels.matrixWorld);
        this.headToward(rv1.sub(head.getWorldPosition(rv2)).normalize(), 0.7 * kLoad * w);
      }
    }
    this.lgAimK += ((aiming ? 1 : 0) - this.lgAimK) * (1 - Math.exp(-dt / (LS.aimS / 3)));
    if (this.lgAimK > 0.01 && !cheap) {
      this.headToSights(p, this.lgAimK * w, LS.cheek ? 0.8 : 1);
      // (plan 82: her cheek down on the stock, her eye on the sights)
      this.cheekTo(LS, this.lgAimK * w);
    }
    this.revHeld = true;
    // (the torch the left hand's — under the fore-end in it, placed there by torchFrame)
    this.revHarries = !!this.torch && lw > 0.5;
  }
  private lgAimK = 0;
  /** (plan 82) the long gun in hand's own numbers (tp/long-hold.ts) */
  private lgSpec: LongSpec = SG_LONG;
  /** (plan 81) her left hand on the gun, this much (eased) — carried at her side it's free */
  private lgLeftW = 0;
  /** (plan 81) the left shoulder's rest place, its bone's (longHands brings it forward holding the double-barrel) */
  private sLRest: { bone: Object3D | null; pos: Vector3 } = { bone: null, pos: new Vector3() };
  /** where along the fore-end the left hand is this frame (the barrels' frame, m), eased */
  private lgForeX = 0;
  private lgForeOn = false;
  /** (plan 81 phase 4) s into the double-barrel's reload (−1: not reloading) */
  private sgLoadT = -1;
  /** (plan 82 phase 4) s into the AK's reload (−1: not reloading), last frame's; its closing racks the handle */
  private akLoadT = -1;
  private akPrevT = -1;
  private akRack = false;
  /** this frame the AK's magazine is the reload's to place (magFrame leaves it be) */
  private akMagOwn = false;
  /** the shell in the right hand, loading (its place in the wrist's space this frame: sgShellAt) */
  private sgShell: Mesh | null = null;
  private sgShellIn = false;
  private sgShellAt = new Matrix4();
  /** (plan 81 phase 4) The right hand's place on the reload's timeline (into rAt, rTurn — `grip` already
   *  there): the stock's wrist, a loop on the carrier, a chamber's mouth, home; and the shell in it (its
   *  place in the wrist's space, sgShellAt). Which it's at, about. */
  private sgRight(B: BodyFrame, t: number, inHand: number, barrels: Object3D, gs: number): string {
    const m = this.model;
    const wr = m.bone("wristR");
    barrels.updateWorldMatrix(true, false);
    const BW = barrels.matrixWorld;
    BW.decompose(rv5, rq2, rs1);
    const fb = rx.set(1, 0, 0).applyQuaternion(rq2);
    const ub = ry.set(0, 1, 0).applyQuaternion(rq2);
    const k = B.k;
    // (a chamber: the shell at its mouth half in, or home; the hand's palm behind its rim, the fingers along
    // the bore — the shell's place in the hand read off it)
    const chamber = (i: number, home: boolean, pos: Vector3, quat: Quaternion, shell?: Matrix4): boolean => {
      const mouth = CHAMBER(i, rh).sub(SG_HINGE).applyMatrix4(BW);
      const o = rn.copy(mouth).addScaledVector(fb, -(home ? SHELL_MOUTH.home : SHELL_MOUTH.out) * gs);
      rc.copy(o)
        .addScaledVector(fb, -(0.0102 + SHELL_PALM) * k)
        .addScaledVector(ub, 0.005 * k);
      ra.copy(fb).multiplyScalar(0.9).addScaledVector(ub, 0.1).normalize();
      rp.copy(B.left).multiplyScalar(-0.3).add(ub).normalize();
      if (!m.wristFor("R", rc, ra, rp, pos, quat)) return false;
      if (shell) {
        // the shell's place in the hand: the wrist's frame there, the shell's in the world
        rLh.compose(pos, quat, rs2.setScalar(wr?.getWorldScale(rs1).x ?? 1)).invert();
        rq1.setFromRotationMatrix(rL0.makeBasis(fb, ub, rv5.crossVectors(fb, ub)));
        shell.multiplyMatrices(rLh, rL1.compose(o, rq1, rs2.setScalar(gs)));
      }
      return true;
    };
    // (a loop on the carrier: the fingers down at its shell's brass, the palm to her hip, the index side to her
    // front)
    const loop = (i: number, pos: Vector3, quat: Quaternion): boolean => {
      const C = this.carrier?.root;
      if (!C) return false;
      C.updateWorldMatrix(true, false);
      const j = CARRIER.take[i];
      const head = C.localToWorld(rh.set(CARRIER.loops[j], CARRIER.y + 0.011, CARRIER.out));
      C.getWorldQuaternion(rq1);
      const upC = rn.set(0, 1, 0).applyQuaternion(rq1);
      const outC = rc.set(0, 0, 1).applyQuaternion(rq1);
      head.addScaledVector(upC, SHELL_PALM * k).addScaledVector(outC, 0.004 * k);
      ra.copy(upC).multiplyScalar(-0.9).addScaledVector(outC, 0.25).normalize();
      rp.set(1, 0, 0).applyQuaternion(rq1);
      return m.wristFor("R", head, ra, rp, pos, quat);
    };
    const place = (name: string, pos: Vector3, quat: Quaternion): boolean => {
      if (name === "grip") {
        pos.copy(rAt);
        quat.copy(rTurn);
        return true;
      }
      const i = Number(name.slice(-1));
      if (name.startsWith("loop")) return loop(i, pos, quat);
      return chamber(i, name.startsWith("home"), pos, quat);
    };
    const h = legAt(SG_LOAD_RIGHT, t);
    if (place(h.a, rhA, rhqA)) {
      if (h.b !== h.a && h.k > 0 && place(h.b, rhB, rhqB)) {
        rhA.lerp(rhB, h.k);
        rhqA.slerp(rhqB, h.k);
      }
      rAt.copy(rhA);
      rTurn.copy(rhqA);
    }
    // the shell in it: its place in the hand (as it'll be at the chamber)
    this.sgShellIn = inHand >= 0 && chamber(inHand, false, rhB, rhqB, this.sgShellAt);
    return h.k < 0.5 ? h.a : h.b;
  }
  /** (plan 81 phase 4) The shell in the right hand, where sgRight put it (after the hand's IK) */
  private sgShellPlace() {
    const wr = this.model.bone("wristR");
    if (!this.sgShellIn || !wr) {
      if (this.sgShell) this.sgShell.visible = false;
      return;
    }
    if (!this.sgShell) {
      SG_SHELL_GEO ??= shellGeometry();
      this.sgShell = new Mesh(SG_SHELL_GEO, this.mats.prop("vertex"));
      this.sgShell.castShadow = false;
    }
    if (this.sgShell.parent !== wr) wr.add(this.sgShell);
    this.sgShellAt.decompose(this.sgShell.position, this.sgShell.quaternion, this.sgShell.scale);
    this.sgShell.visible = true;
  }
  /** (F3a) this frame the torch is under the fore-end in the left fist, the palm this far along (the barrels'
   *  frame; −1: in the hand as ever) */
  private lgTorchX = -1;
  /** her facing's way on the floor (x, z) */
  private facingXZ(): [number, number] {
    this.root.getWorldQuaternion(rq1);
    rv5.set(0, 0, 1).applyQuaternion(rq1);
    return [rv5.x, rv5.z];
  }

  /** (plan 80 phase 3) Aimed: the neck and the head turned onto the sights — the look, a touch down to the
   *  sight line under the eyes (`k` of the way) */
  private headToSights(p: PersonIn, k: number, pitchShare = 1) {
    this.lookDir(p, hdTo);
    // (plan 82: her cheek down on the stock — the face less far up or down with the aim than the look, her
    // eyes the rest: turned all the way, the eye rose off the sights 4–7 cm aiming up)
    if (pitchShare !== 1) {
      const a = Math.asin(Math.max(-1, Math.min(1, hdTo.y))) * pitchShare;
      const h = Math.hypot(hdTo.x, hdTo.z) || 1;
      hdTo.set((hdTo.x / h) * Math.cos(a), Math.sin(a), (hdTo.z / h) * Math.cos(a));
    }
    hdTo.y -= 0.12;
    this.headToward(hdTo.normalize(), k);
  }
  /** (plan 82) Aimed, her cheek down on the stock: her neck tipped over toward it (about the bore) and down
   *  (about the gun's right) till her right eye is on its sight line (LongSpec.cheek, the gun's frame) — solved
   *  a step at a time from where the eye is, each turn at most so far; `k` of the way */
  private cheekTo(LS: LongSpec, k: number) {
    const C = LS.cheek;
    const m = this.model;
    const neck = m.bone("neck");
    const g = this.gun?.model.root;
    if (!C || !neck?.parent || !g || k <= 0) return;
    g.updateWorldMatrix(true, false);
    g.matrixWorld.decompose(chP, chQ, chS);
    const s = chS.x;
    const ax = chX.set(1, 0, 0).applyQuaternion(chQ);
    const ay = chY.set(0, 1, 0).applyQuaternion(chQ);
    const az = chZ.set(0, 0, 1).applyQuaternion(chQ);
    chQ0.copy(neck.quaternion);
    chT.identity();
    for (let it = 0; it < 3; it++) {
      neck.updateWorldMatrix(true, true);
      const eye = m.eyeAt("R", chE);
      if (!eye) break;
      const rel = rv1.copy(eye).sub(chP);
      const dy = C.y * s - rel.dot(ay);
      const dz = C.z * s - rel.dot(az);
      const v = rv2.copy(eye).sub(neck.getWorldPosition(rv3));
      // (a turn t about an axis moves the eye t × (axis × v): about the bore — over; about its right — down)
      const j1 = rv4.crossVectors(ax, v);
      const j2 = rv5.crossVectors(az, v);
      const a11 = j1.dot(ay);
      const a12 = j2.dot(ay);
      const a21 = j1.dot(az);
      const a22 = j2.dot(az);
      const det = a11 * a22 - a12 * a21;
      if (Math.abs(det) < 1e-6) break;
      const t1 = Math.max(-0.3, Math.min(0.3, (dy * a22 - a12 * dz) / det));
      const t2 = Math.max(-0.3, Math.min(0.3, (a11 * dz - a21 * dy) / det));
      rq1.setFromAxisAngle(ax, t1).multiply(rq2.setFromAxisAngle(az, t2));
      chT.premultiply(rq1);
      neck.parent.getWorldQuaternion(rq2);
      neck.quaternion.premultiply(rq3.copy(rq1).premultiply(rTurn.copy(rq2).invert()).multiply(rq2));
    }
    // (her neck at most ~30° all told — a cheek on a stock, not a head bent double; `k` of it)
    const ang = 2 * Math.acos(Math.min(1, Math.abs(chT.w)));
    this.cheekAng = ang;
    const most = ang > CHEEK_NECK ? CHEEK_NECK / ang : 1;
    rq1.identity().slerp(chT, k * most);
    neck.quaternion.copy(chQ0);
    neck.parent.getWorldQuaternion(rq2);
    neck.quaternion.premultiply(rq1.premultiply(rTurn.copy(rq2).invert()).multiply(rq2));
    // what her neck left: the gun brought up to her face the rest (the butt up and in on her shoulder) — the
    // next frames', a little at a time (longHands); her neck short of its most, the gun let back down a little
    // a frame — so her neck does what it can and the gun only the rest
    if (k < 0.9) return;
    const o = this.lgCheek;
    if (most >= 1) {
      o.multiplyScalar(1 - CHEEK_GUN.back);
      return;
    }
    neck.updateWorldMatrix(true, true);
    const eye = m.eyeAt("R", chE);
    if (!eye) return;
    const rel = rv1.copy(eye).sub(chP);
    const dy = C.y * s - rel.dot(ay);
    const dz = C.z * s - rel.dot(az);
    o.y = Math.max(CHEEK_GUN.y[0], Math.min(CHEEK_GUN.y[1], o.y - dy * CHEEK_GUN.gain));
    o.z = Math.max(CHEEK_GUN.z[0], Math.min(CHEEK_GUN.z[1], o.z - dz * CHEEK_GUN.gain));
  }
  /** (plan 82) how far the neck turned for the cheek this frame (rad); the gun brought to her face (its up, its
   *  right — m) */
  cheekAng = 0;
  private lgCheek = new Vector3();
  /** The neck and the head turned toward a way (the world's, unit) — `k` of the way */
  private headToward(dir: Vector3, k: number) {
    const m = this.model;
    const head = m.bone("head");
    const neck = m.bone("neck");
    if (!head?.parent || !neck?.parent) return;
    rv2.copy(dir);
    head.getWorldQuaternion(rq1);
    rv1.set(0, 0, 1).applyQuaternion(rq1);
    rq2.setFromUnitVectors(rv1, rv2);
    for (const [b, share] of [
      [neck, 0.4],
      [head, 0.6],
    ] as const) {
      (b.parent as Object3D).getWorldQuaternion(rq1);
      rq3.identity().slerp(rq2, share * k);
      b.quaternion.premultiply(rq3.premultiply(rTurn.copy(rq1).invert()).multiply(rq1));
    }
  }

  /** (plan 80) The revolver hold's checks, as she is now: how far the gun leans off upright (rad), how far
   *  its barrel is off the look while aiming (rad), the nearest the left hand's fingers come to the right's
   *  and to the gun's grip (m; less than 0: through them), and what gripTo left each hand (how far short,
   *  how far past a wrist's reach). Null: no life revolver in the hand. */
  revolverCheck(p: PersonIn) {
    const g = this.gun;
    if (!g?.inHand || (gunKind(g.key) !== "revolver" && !LONG[g.key])) return null;
    const LS = LONG[g.key];
    const sg = !!LS;
    const inner = g.model.root;
    inner.updateWorldMatrix(true, false);
    inner.matrixWorld.decompose(rv1, rq1, rs1);
    const f = new Vector3(1, 0, 0).applyQuaternion(rq1);
    const u = new Vector3(0, 1, 0).applyQuaternion(rq1);
    const aiming = ((p.mv ?? 0) & 16) !== 0;
    const off = aiming ? f.angleTo(this.lookDir(p, new Vector3())) : 0;
    const L = this.model.fingerPoints("L");
    const R = this.model.fingerPoints("R");
    // (a finger is ~1.7 cm thick: two halves between the bones' lines)
    let hands = Number.POSITIVE_INFINITY;
    let where = "";
    const FINGERS = ["thumb", "index", "middle", "ring", "little"];
    const JOINT = ["knuckle", "middle joint", "last joint", "tip"];
    for (let li = 0; li < L.length; li++)
      for (let ai = 0; ai < L[li].length; ai++)
        for (let ri = 0; ri < R.length; ri++)
          for (let i = 0; i < 3; i++) {
            const g = segGap(L[li][ai], R[ri][i], R[ri][i + 1]) - 0.017;
            if (g < hands) {
              hands = g;
              where = `left ${FINGERS[li]}'s ${JOINT[ai]} on the right ${FINGERS[ri]}`;
            }
          }
    // the grip: its line in the world (the rake's, ±4.5 cm round its middle), 1.7 cm round, and a finger's half
    const mid = rv2.copy(GUN_GRIP_MID).applyMatrix4(inner.matrixWorld);
    const along = rv3
      .copy(UP_GRIP)
      .applyQuaternion(rq1)
      .multiplyScalar(0.045 * rs1.x);
    const a0 = mid.clone().sub(along);
    const a1 = mid.clone().add(along);
    let grip = Number.POSITIVE_INFINITY;
    let whereGrip = "";
    let arms: number | null = null;
    const bar = LS?.fore.part ? g.model.parts[LS.fore.part] : inner;
    if (LS && bar) {
      // (plans 81–82: the left fingers against the gun's boxes — the double-barrel's fore-end on the barrels, as
      // they've dropped; the AK's receiver and handguard, its magazine — and the forearms against its rods —
      // the stock, the barrel, the magazine — but their wrist ends, which hold them)
      bar.updateWorldMatrix(true, false);
      const BW = bar.matrixWorld;
      const inv = new Matrix4().copy(BW).invert();
      const invG = new Matrix4().copy(inner.matrixWorld).invert();
      const piv = LS.fore.pivot;
      const lp = new Vector3();
      for (let li = 0; li < L.length; li++)
        for (let ai = 0; ai < L[li].length; ai++)
          for (const bx of LS.check.boxes) {
            const a = L[li][ai];
            if (bx.fore) lp.copy(a).applyMatrix4(inv).add(piv);
            else lp.copy(a).applyMatrix4(invG);
            const qx = Math.abs(lp.x - bx.c[0]) - bx.h[0];
            const qy = Math.abs(lp.y - bx.c[1]) - bx.h[1];
            const qz = Math.abs(lp.z) - bx.h[2];
            const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
            if (d * rs1.x - 0.0085 < grip) {
              grip = d * rs1.x - 0.0085;
              whereGrip = `left ${FINGERS[li]}'s ${JOINT[ai]}`;
            }
          }
      const rods = LS.check.rods.map((r) => {
        const M = r.fore ? BW : inner.matrixWorld;
        const sub = r.fore ? piv : ZERO3;
        return {
          a: new Vector3(r.a[0], r.a[1], 0).sub(sub).applyMatrix4(M),
          b: new Vector3(r.b[0], r.b[1], 0).sub(sub).applyMatrix4(M),
          r: r.r,
        };
      });
      arms = Number.POSITIVE_INFINITY;
      for (const S of ["L", "R"] as const) {
        const e = this.model.bone(`elbow${S}`)?.getWorldPosition(new Vector3());
        const wv = this.model.bone(`wrist${S}`)?.getWorldPosition(new Vector3());
        if (!e || !wv) continue;
        for (let i = 0; i <= 6; i++) {
          // (elbow to three quarters down the forearm; a forearm ~3.5 cm round)
          const q = e.clone().lerp(wv, (i / 6) * 0.75);
          for (const r of rods) arms = Math.min(arms, segGap(q, r.a, r.b) - r.r * rs1.x - 0.035);
        }
      }
    } else
      for (const fl of L) for (const a of fl) grip = Math.min(grip, segGap(a, a0, a1) - GUN_GRIP_R * rs1.x - 0.0085);
    return {
      arms,
      whereGrip,
      cant: cantOf(f, u),
      off,
      hands: L.length && R.length ? hands : null,
      where,
      grip: L.length ? grip : null,
      // (the left's only when it's on the gun)
      // (the double-barrel's left hand: on it aimed, reloading, across her chest — carried at her side it's free)
      L: (sg && this.lgLeftW > 0.5) || (!sg && this.revHold.left === "support") ? { ...this.model.gripLeft.L } : null,
      R: { ...this.model.gripLeft.R },
      held: this.revHeld,
    };
  }

  // The left hand under the double-barrel's fore-end, where the gun really is (turned in the right
  // hand, kicked): its underside, a third of the way along it, in the gun's own frame.
  private gripOnFore() {
    const g = this.gun?.model;
    if (this.foreW < 0.01 || !g) return;
    g.root.updateWorldMatrix(true, false);
    // (a life gun's own fore point, plan 79 — moved back to where the arm reaches)
    if (g.fore) hf.set(g.fore[0], g.fore[1] - 0.045, g.fore[2]);
    else hf.set(0.15, -0.045, 0);
    hf.applyMatrix4(g.root.matrixWorld);
    this.model.reachTo("L", hf, this.foreW, [-0.5, -1, 0.2]);
  }

  // Reloading the double-barrel: the left hand's way (into `ht`) from the breech down to the pocket
  // at the left hip and back with a shell — a shell every ARMS.shotgun.reload, after the opening.
  private loadHand(butt: Vector3, d: Vector3, up: Vector3, gs: number, body: number, q: Quaternion) {
    const OPEN = 0.3;
    const EACH = 0.45;
    // the breech, open: just above the chambers' mouths (0.39 along from the butt, 0.12 up)
    hb.copy(butt)
      .addScaledVector(d, 0.37 * gs)
      .addScaledVector(up, 0.14 * gs);
    if (this.loadT < OPEN) {
      // (opening it: the left hand comes off the fore-end to the breech)
      ht.lerp(hb, this.loadT / OPEN);
      return;
    }
    const ph = ((this.loadT - OPEN) / EACH) % 1;
    // the pocket: down the left thigh, out to its side, a little ahead
    const thigh = this.model.bone("thighL");
    if (thigh) thigh.getWorldPosition(hq);
    else hq.copy(butt);
    hq
      .addScaledVector(hv.set(0, 0, 1).applyQuaternion(q), 0.06 * body)
      .addScaledVector(hv.set(1, 0, 0).applyQuaternion(q), 0.08 * body).y -= 0.2 * body;
    // down to it (0–0.35), a moment there (–0.5), up with a shell (–0.88), pushed in (–1)
    const ease = (x: number) => x * x * (3 - 2 * x);
    if (ph < 0.35) ht.copy(hb).lerp(hq, ease(ph / 0.35));
    else if (ph < 0.5) ht.copy(hq);
    else if (ph < 0.88) ht.copy(hq).lerp(hb, ease((ph - 0.5) / 0.38));
    else ht.copy(hb).addScaledVector(d, -0.02 * gs * Math.sin(((ph - 0.88) / 0.12) * Math.PI));
    // the shell in the hand on the way back
    if (ph > 0.42 && ph < 0.95) {
      const hand = this.model.bone("wristL");
      if (!hand) return;
      if (!this.shellInHand) {
        this.shellInHand = new Mesh(shellGeometry(), this.mats.prop("vertex"));
        this.shellInHand.position.set(0, -0.07, 0.015);
        this.shellInHand.rotation.set(0, 0, Math.PI / 2);
        this.shellInHand.scale.setScalar(1.2);
      }
      if (this.shellInHand.parent !== hand) hand.add(this.shellInHand);
      this.shellInHand.visible = true;
    }
  }

  // Reloading the AK (plan 79 phase 5): the left hand's way (into `ht`) off the fore-end to the magazine,
  // rocking it out on its front lug, down to the left hip's pocket with it and back with another, rocked
  // in; then — run dry — over the top to the charging handle on the right, racked; back to the fore-end.
  // In time with the server's steps (shared ARMS.ak47: out 0.8, in 1.0, shut 0.4 or racked 1.0). The
  // magazine follows the hand while it's off the gun (magFrame).
  private akDry = false;
  private loadSpec = AK_LOAD;
  private magInHand = false;
  private magTilt = 0; // 0..1: rocked on its lug (the bottom forward) — the cell, slid out
  private akBolt = 0; // the carrier racked back, 0..1
  private magHand(gs: number, body: number, q: Quaternion) {
    const g = this.gun?.model;
    if (!g) return;
    g.root.updateWorldMatrix(true, false);
    const W = g.root.matrixWorld;
    const t = this.loadT;
    const ease = (x: number) => {
      const c = Math.max(0, Math.min(1, x));
      return c * c * (3 - 2 * c);
    };
    // (the points, in the gun's frame: the fore-end; the magazine's middle, the hand at its left side;
    // the charging handle, the hand over the top to it)
    const fore = g.fore ?? [0.34, 0.03, 0];
    hb.set(fore[0], fore[1] - 0.045, fore[2]).applyMatrix4(W);
    const L = this.loadSpec;
    hf.set(L.grab[0], L.grab[1], L.grab[2]).applyMatrix4(W);
    // the magazine pouch: at the belt, front left — out in front of the coat, the magazine seen going in
    // and out (in her own frame: x her left, y up, z ahead)
    this.root.updateWorldMatrix(true, false);
    this.root.localToWorld(hq.set(L.pouch[0], L.pouch[1], L.pouch[2]));
    void q;
    void body;
    const T = L;
    if (t < T.reach) ht.copy(hb).lerp(hf, ease(t / T.reach));
    else if (t < T.out) {
      ht.copy(hf);
      this.magTilt = ease((t - T.reach) / (T.out - T.reach));
    } else if (t < T.down) {
      this.magInHand = true;
      ht.copy(hf).lerp(hq, ease((t - T.out) / (T.down - T.out)));
    } else if (t < T.at) {
      this.magInHand = true;
      ht.copy(hq);
    } else if (t < T.up) {
      this.magInHand = true;
      ht.copy(hq).lerp(hf, ease((t - T.at) / (T.up - T.at)));
    } else if (t < T.in) {
      ht.copy(hf);
      this.magTilt = 1 - ease((t - T.up) / (T.in - T.up));
    } else if (!this.akDry) ht.copy(hf).lerp(hb, ease((t - T.done) / 0.35));
    else {
      // (run dry: over the top to the charging handle, racked back and let go, back to the fore-end)
      const h0 = hx.set(0.21, 0.1, 0.05).applyMatrix4(W);
      const h1 = hz.set(0.21 - 0.075, 0.1, 0.05).applyMatrix4(W);
      if (t < T.over) ht.copy(hf).lerp(h0, ease((t - T.done) / (T.over - T.done)));
      else if (t < T.pull) {
        const k = ease((t - T.over) / (T.pull - T.over));
        ht.copy(h0).lerp(h1, k);
        this.akBolt = k;
      } else if (t < T.let) {
        ht.copy(h1);
        this.akBolt = 1 - (t - T.pull) / (T.let - T.pull);
      } else ht.copy(h1).lerp(hb, ease((t - T.let) / (T.back - T.let)));
    }
    void gs;
  }

  // The sniper's bolt (plan 79 phase 6): the left hand off the fore-end over to its knob (the first
  // 15%), with it as it turns up and runs back and home, back to the fore-end (the last 15%).
  private boltT = 0;
  private boltCycle = 0;
  private boltHand(c: number) {
    const g = this.gun?.model;
    const bolt = g?.parts.bolt;
    if (!g || !bolt) return;
    g.root.updateWorldMatrix(true, false);
    const fore = g.fore ?? [0.36, 0.03, 0];
    hb.set(fore[0], fore[1] - 0.045, fore[2]).applyMatrix4(g.root.matrixWorld);
    bolt.updateWorldMatrix(true, false);
    hf.set(...SNIPER.knob).applyMatrix4(bolt.matrixWorld);
    const ease = (x: number) => {
      const k = Math.max(0, Math.min(1, x));
      return k * k * (3 - 2 * k);
    };
    if (c < 0.15) ht.copy(hb).lerp(hf, ease(c / 0.15));
    else if (c < 0.85) ht.copy(hf);
    else ht.copy(hf).lerp(hb, ease((c - 0.85) / 0.15));
  }

  // The sniper's reload (plan 79 phase 6): the bolt back (the gun's own `open`), the left hand off the
  // fore-end to the port, then a round at a time from the belt's pouch, thumbed in.
  private roundHand() {
    const g = this.gun?.model;
    if (!g) return;
    g.root.updateWorldMatrix(true, false);
    const fore = g.fore ?? [0.36, 0.03, 0];
    hb.set(fore[0], fore[1] - 0.045, fore[2]).applyMatrix4(g.root.matrixWorld);
    hf.set(...SNIPER.port).applyMatrix4(g.root.matrixWorld);
    this.root.updateWorldMatrix(true, false);
    this.root.localToWorld(hq.set(AK_LOAD.pouch[0], AK_LOAD.pouch[1], AK_LOAD.pouch[2]));
    const ease = (x: number) => {
      const k = Math.max(0, Math.min(1, x));
      return k * k * (3 - 2 * k);
    };
    const t = this.loadT;
    if (t < SNIPER.open) {
      ht.copy(hb).lerp(hf, ease(t / SNIPER.open));
      return;
    }
    const ph = ((t - SNIPER.open) / SNIPER.each) % 1;
    // down to the pouch (0–0.35), a moment there (–0.5), up with a round (–0.85), pressed in (–1)
    if (ph < 0.35) ht.copy(hf).lerp(hq, ease(ph / 0.35));
    else if (ph < 0.5) ht.copy(hq);
    else if (ph < 0.85) ht.copy(hq).lerp(hf, ease((ph - 0.5) / 0.35));
    else ht.copy(hf);
  }

  /** The AK's magazine: on its lug (rocked `magTilt`), or in the left hand while it's off the gun. */
  private magFrame() {
    // (plan 82: the AK on the long hold — its reload places its magazine, akLeft)
    if (this.akMagOwn || (this.gun && LONG[this.gun.key])) return;
    const L = this.loadSpec;
    const mag = this.gun?.model.parts[L.part];
    if (!mag) return;
    mag.userData.p0 ??= mag.position.clone();
    const hand = this.magInHand ? this.model.bone("wristL") : null;
    if (!hand || !mag.parent) {
      mag.position.copy(mag.userData.p0);
      mag.position.y -= L.slide * this.magTilt;
      mag.rotation.set(0, 0, L.tilt * this.magTilt);
      return;
    }
    // (held at its middle: its lug ~9 cm over the hand, upright as the gun is, still rocked)
    const root = this.gun?.model.root;
    if (!root) return;
    root.updateWorldMatrix(true, false);
    root.getWorldQuaternion(gq);
    hand.getWorldPosition(hx);
    const gsc = root.getWorldScale(hs).x;
    hx.addScaledVector(hz.set(0, 1, 0).applyQuaternion(gq), L.lift * gsc).addScaledVector(
      hz.set(0, 0, 1).applyQuaternion(gq),
      0.03 * gsc,
    );
    mag.parent.updateWorldMatrix(true, false);
    mag.position.copy(hx).applyMatrix4(tm.copy(mag.parent.matrixWorld).invert());
    mag.parent.getWorldQuaternion(tq2);
    mag.quaternion
      .copy(tq2)
      .invert()
      .multiply(gq)
      .multiply(tq3.setFromAxisAngle(hz.set(0, 0, 1), L.tilt));
  }

  /** Aiming: the barrel (the root's −y) along `dir` (world, unit), its top (+z) up — level, not
   *  rolled however the wrist turns. */
  private aimGun(root: Object3D, dir: Vector3) {
    const hand = root.parent;
    if (!hand) return;
    hand.updateWorldMatrix(true, false);
    hand.getWorldQuaternion(gq);
    gy.copy(dir).negate();
    gz.set(0, 1, 0).addScaledVector(dir, -dir.y);
    if (gz.lengthSq() < 1e-6) gz.set(0, 0, 1);
    gz.normalize();
    gx.crossVectors(gy, gz);
    gm.makeBasis(gx, gy, gz);
    root.quaternion.setFromRotationMatrix(gm).premultiply(gq.invert());
  }

  /** The gun's muzzle in the world (the view's coords); false: no gun in the hand. */
  gunMuzzle(out: Vector3): boolean {
    const g = this.gun?.model;
    if (!g || !this.root.visible) return false;
    g.root.updateWorldMatrix(true, false);
    out.set(...g.muzzle).applyMatrix4(g.root.matrixWorld);
    return true;
  }

  /** The gun's sights in the world (the rear notch or the rib's end, the front blade or bead); false:
   *  no gun in the hand. */
  gunSights(rear: Vector3, front: Vector3, up?: Vector3): boolean {
    const g = this.gun?.model;
    if (!g) return false;
    g.root.updateWorldMatrix(true, false);
    rear.set(...g.sight.rear).applyMatrix4(g.root.matrixWorld);
    front.set(...g.sight.front).applyMatrix4(g.root.matrixWorld);
    // (its top's way, in the world)
    up?.set(0, 1, 0).transformDirection(g.root.matrixWorld);
    return true;
  }

  private dropGun() {
    this.shellInHand?.removeFromParent();
    this.shellInHand?.geometry.dispose();
    this.shellInHand = null;
    if (!this.gun) return;
    this.gun.root.removeFromParent();
    // (a life-look gun's geometry is every copy's: kept)
    if (!this.gun.model.life) this.gun.root.traverse((o) => (o as Mesh).geometry?.dispose());
    this.gun = null;
  }

  /** (plan 80) The revolver's holster on her right hip while she carries one (Player.holster) — the gun in
   *  it when it isn't in her hand. On the hips (it goes with them walking); its frame is the holstered
   *  gun's, where the draw starts and the put-away ends. */
  private holster: { root: Group; gun: GunModel | null } | null = null;
  /** (plan 80 F5a) the speedloader's pouch on the belt at her right hip's front, worn with the holster */
  private pouch: { root: Group } | null = null;
  private holsterFrame(p: PersonIn) {
    const hips = this.model.bone("hips");
    const tpl = this.mats.gun?.("holster") ?? null;
    if (!p.holster || !hips || !tpl || this.part !== "all") {
      this.dropHolster();
      return;
    }
    if (!this.holster) {
      const root = new Group();
      root.add((tpl.getObjectByName("holster") ?? tpl).clone(true));
      root.position.copy(HOLSTER_AT);
      root.quaternion.copy(HOLSTER_TURN);
      hips.add(root);
      this.holster = { root, gun: null };
    }
    // the gun in it, while it isn't in her hand
    const out = !!this.gun && gunKind(this.gun.key) === "revolver";
    const gtpl = this.mats.gun?.("revolver") ?? null;
    if (!this.holster.gun && gtpl) {
      const g = lifeGunModel("revolver", gtpl);
      poseGun(g, "revolver", {});
      this.holster.root.add(g.root);
      this.holster.gun = g;
    }
    if (this.holster.gun) this.holster.gun.root.visible = !out;
    const ptpl = this.mats.gun?.("pouch") ?? null;
    if (!this.pouch && ptpl) {
      const root = new Group();
      root.add((ptpl.getObjectByName("pouch") ?? ptpl).clone(true));
      root.position.copy(POUCH_AT);
      root.quaternion.copy(POUCH_TURN);
      hips.add(root);
      this.pouch = { root };
    }
  }
  /** (plan 81 F6a) The double-barrel slung on her back while she carries one (Player.sling) and it isn't in her
   *  hands: on her chest bone, its strap over her right shoulder, across her chest to her left hip and round
   *  to the barrels — the strap's points her bones', each frame. (plan 82) The AK too (Player.slingAk), mirrored:
   *  the muzzle up past her left shoulder, its strap over that one — both crossed on her back */
  private slings = new Map<string, { root: Group; gun: GunModel; strap: Mesh[] }>();
  private slingFrame(p: PersonIn) {
    const chest = this.model.bone("chest");
    for (const LS of Object.values(LONG)) {
      const SL = LS.sling;
      if (!SL) continue;
      const tpl = this.mats.gun?.(gunKind(LS.key)) ?? null;
      if (!p[SL.flag] || !chest || !tpl || this.part !== "all") {
        this.dropSling(LS.key);
        continue;
      }
      let S = this.slings.get(LS.key);
      if (!S) {
        const root = new Group();
        const gun = lifeGunModel(gunKind(LS.key), tpl);
        poseGun(gun, gunKind(LS.key), {});
        root.add(gun.root);
        root.position.copy(SL.at);
        root.quaternion.copy(SL.turn);
        chest.add(root);
        const mat = this.mats.prop("#3a2414");
        const strap: Mesh[] = [];
        for (let i = 0; i <= SL.strap.length; i++) {
          const sm = new Mesh(STRAP_BOX, mat);
          sm.castShadow = false;
          this.root.add(sm);
          strap.push(sm);
        }
        S = { root, gun, strap };
        this.slings.set(LS.key, S);
      }
      const on = !(this.gun && this.gun.key === LS.key);
      slungAt(SL, p, S.root.position);
      S.root.visible = on;
      for (const sm of S.strap) sm.visible = on;
      if (!on) continue;
      // the strap: from one end on the gun, by her bones, to the other — in her root's space
      this.root.updateMatrixWorld(true);
      const B = this.revFrame(p, false);
      const pts: Vector3[] = [S.gun.root.localToWorld(rv1.copy(SL.ends[0])).clone()];
      for (const q of SL.strap) {
        const b = this.model.bone(q.bone);
        if (!b) continue;
        const o = b.getWorldPosition(new Vector3());
        const out = q.bone === "chest" && p.avatar.gender === "feminine" ? SL.bust : 0;
        pts.push(
          o
            .addScaledVector(B.left, q.at[0] * B.k)
            .addScaledVector(B.up, q.at[1] * B.k)
            .addScaledVector(B.ahead, (q.at[2] + out) * B.k),
        );
      }
      pts.push(S.gun.root.localToWorld(rv1.copy(SL.ends[1])).clone());
      const inv = rM.copy(this.root.matrixWorld).invert();
      const mid = chest.getWorldPosition(rv5);
      for (let i = 0; i < S.strap.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const sm = S.strap[i];
        if (!a || !b) {
          sm.visible = false;
          continue;
        }
        // (flat on her: its width across the way it goes, its face out from her middle)
        const x = rv2.subVectors(b, a);
        const len = x.length();
        x.normalize();
        const out = rv3.copy(a).add(b).multiplyScalar(0.5).sub(mid);
        out.addScaledVector(x, -out.dot(x)).normalize();
        const y = rv4.crossVectors(out, x);
        rM2.makeBasis(x, y, out).setPosition(a.clone().add(b).multiplyScalar(0.5));
        rM2.premultiply(inv).decompose(sm.position, sm.quaternion, sm.scale);
        sm.scale.set(len + 0.01, 0.032, 0.004);
      }
    }
  }

  // ── plan 82 phase 4: the AK's reload (tp/ak-hold.ts) ──────────────────────────────────────────────────
  /** The left hand through the AK's reload: from the receiver (the hold's place, solved already: rLAt, rq3) to
   *  the magazine and with it — rocked out on its lug, pulled clear, let fall — down to the pouch and up with a
   *  new one, hooked in the well and rocked home; then back to the receiver, or under the rifle to the charging
   *  handle first, swept back with it. Its fingers round what it holds. The magazine where the timeline has it
   *  — while it's in her hand, where her hand really is. */
  private akLeft(
    A: ReturnType<typeof akLoadAt>,
    lw: number,
    cheap: boolean,
    F: LongSpec["fore"],
    x: number,
    pivot: Vector3,
    BW: Matrix4,
  ) {
    const m = this.model;
    const gun = this.gun;
    const wl = m.bone("wristL");
    const mag = gun?.model.parts.magazine;
    if (!gun || !wl || !mag?.parent) return;
    mag.parent.updateWorldMatrix(true, false);
    const GW = gun.model.root.matrixWorld;
    akForeAt.copy(rLAt);
    akForeQ.copy(rq3);
    // the magazine (its part: its origin the lug) where the timeline has it
    this.akMagWorld(A.mag, akMW);
    // (the empty let fall: from where it is in her hand)
    if (this.akPrevT < AK_RL.drop && this.akLoadT >= AK_RL.drop) this.akDropFrom(mag);
    // the hand's places: the receiver; round the magazine (as it is now, as it was let go, waiting in the
    // pouch); the charging handle (swept back with the carrier)
    const place = (name: string, at: Vector3, q: Quaternion): boolean => {
      if (name === "fore") {
        at.copy(akForeAt);
        q.copy(akForeQ);
        return true;
      }
      if (name === "knob") {
        GW.decompose(akV3, akQ3, akS);
        akV1.copy(RACK_HAND.palm);
        akV1.x -= RACK_HAND.back * A.bolt;
        akV1.applyMatrix4(GW);
        return m.wristFor(
          "L",
          akV1,
          akV2.copy(RACK_HAND.along).applyQuaternion(akQ3),
          akV3.copy(RACK_HAND.index).applyQuaternion(akQ3),
          at,
          q,
        );
      }
      const W =
        name === "mag"
          ? akMW
          : name === "let"
            ? this.akMagWorld({ at: "gun", rock: MAG.out, slide: MAG.clear, k: 0 }, akM2)
            : this.akMagWorld({ at: "pouch", rock: 0, slide: 0, k: AK_POUCH.grab }, akM2);
      W.decompose(akV3, akQ3, akS);
      akV1.copy(MAG_HAND.palm).sub(MAG.lug).applyMatrix4(W);
      return m.wristFor(
        "L",
        akV1,
        akV2.copy(MAG_HAND.along).applyQuaternion(akQ3),
        akV3.copy(MAG_HAND.index).applyQuaternion(akQ3),
        at,
        q,
      );
    };
    const H = A.hand;
    if (!place(H.a, akAtA, akQA) || !place(H.b, akAtB, akQB)) return;
    const at = akAtA.lerp(akAtB, H.k);
    const q = akQA.slerp(akQB, H.k);
    // its fingers round what it holds: the magazine, the receiver; on the handle, loosely
    const on = H.k < 0.5 ? H.a : H.b;
    const ws = wl.getWorldScale(akS).x;
    akM1.compose(at, q, akS.setScalar(ws)).invert();
    if (lw > 0.3 && (on === "mag" || on === "let" || on === "pouch") && A.mag.at !== "gone") {
      akV1.copy(MAG_HAND.at).sub(MAG.lug).applyMatrix4(akMW).applyMatrix4(akM1);
      akMW.decompose(akV2, akQ2, akS);
      akQ2.premultiply(akQ3.copy(q).invert());
      m.hold("L", { shape: MAG_HAND.shape, pos: akV1, quat: akQ2, kind: "fore" });
    } else if (lw > 0.3 && on === "fore") {
      rM.copy(akM1).multiply(BW);
      rM.decompose(rv4, rq1, rs1);
      rv2.set(x, F.shape.y, 0).sub(pivot).applyMatrix4(rM);
      rq2.setFromUnitVectors(Y3, X3).premultiply(rq1);
      m.hold("L", { shape: F.shape.shape, pos: rv2, quat: rq2, kind: "fore" });
    } else m.hold("L", null);
    // (going from one place to the next, its elbow free to swing round as fast as it needs)
    if (lw > 0.01) m.gripTo("L", at, q, lw, [-0.6, -1, -0.2], cheap, undefined, H.a !== H.b ? 0.25 : undefined);
    // (the thumb on the catch, rocking it out and in)
    if (!cheap && lw > 0.5 && A.mag.at === "gun" && on === "mag")
      m.thumbTo("L", akV1.copy(MAG_HAND.thumb).applyMatrix4(GW));
    if (!cheap && on === "knob") m.fingersTo("L", 0.9);
    // the magazine: on the gun as rocked, gone, or in her hand where it really is
    mag.userData.p0 ??= mag.position.clone();
    mag.userData.akMoved = true;
    mag.visible = A.mag.at !== "gone";
    if (A.mag.at === "gun") {
      mag.position.copy(mag.userData.p0).add(akV1.set(0, -A.mag.slide, 0).applyAxisAngle(Z3, A.mag.rock));
      mag.quaternion.setFromAxisAngle(Z3, A.mag.rock);
    } else if (A.mag.at !== "gone") {
      wl.updateWorldMatrix(true, false);
      // (where her hand is less where it was to be, the magazine's place in it kept)
      akM2.copy(wl.matrixWorld).multiply(akM1).multiply(akMW);
      akM2.premultiply(akM1.copy(mag.parent.matrixWorld).invert());
      akM2.decompose(mag.position, mag.quaternion, mag.scale);
    }
    // (the carrier swept back with the handle — posed by gunMoves for everyone)
    this.akBolt = A.bolt;
  }
  /** The AK's magazine part (its origin the front lug) in the world, as the timeline's state has it: on the
   *  gun (rocked, slid along itself), waiting in the pouch (drawn up `k`), carried between the pouch and the
   *  well (`k`) — into `out` */
  private akMagWorld(M: { at: string; rock: number; slide: number; k: number }, out: Matrix4): Matrix4 {
    const mag = this.gun?.model.parts.magazine;
    const hips = this.model.bone("hips");
    if (!mag?.parent) return out.identity();
    const p0 = (mag.userData.p0 as Vector3 | undefined) ?? mag.position;
    const onGun = (rock: number, slide: number, o: Matrix4) =>
      o
        .compose(
          akV1.copy(p0).add(akV2.set(0, -slide, 0).applyAxisAngle(Z3, rock)),
          akQ1.setFromAxisAngle(Z3, rock),
          akS.set(1, 1, 1),
        )
        .premultiply(mag.parent?.matrixWorld ?? akM3.identity());
    const inPouch = (k: number, o: Matrix4) => {
      if (!hips) return o.identity();
      hips.updateWorldMatrix(true, false);
      // (standing in it mouth up, its curve along the belt)
      return o
        .compose(
          akV1.copy(AK_POUCH.mags[AK_POUCH.take]).addScaledVector(Y3, AK_POUCH.draw * k),
          akQ1.copy(AK_POUCH.magTurn),
          akS.set(1, 1, 1),
        )
        .premultiply(akM3.compose(AK_POUCH.at, AK_POUCH.turn, akS.set(1, 1, 1)))
        .premultiply(hips.matrixWorld);
    };
    if (M.at === "pouch") return inPouch(M.k, out);
    if (M.at === "carry") {
      inPouch(1, akM4).decompose(akV3, akQ3, akS3);
      onGun(MAG.hook, MAG.hookDown, out).decompose(akV4, akQ4, akS4);
      return out.compose(akV3.lerp(akV4, M.k), akQ3.slerp(akQ4, M.k), akS3.lerp(akS4, M.k));
    }
    return onGun(M.rock, M.slide, out);
  }
  /** (the magazine back home on the gun, shown, once the reload's done) */
  private akMagHome() {
    const mag = this.gun?.model.parts.magazine;
    if (!mag?.userData.akMoved) return;
    mag.position.copy(mag.userData.p0);
    mag.quaternion.identity();
    mag.scale.set(1, 1, 1);
    mag.visible = true;
    mag.userData.akMoved = false;
    this.akBolt = 0;
  }
  /** The empty let fall from her hand: a copy of it in the world, falling and turning till it lies on the
   *  floor at her feet a moment (DROP) */
  private akDrop: { o: Object3D; v: Vector3; ax: Vector3; floor: number; t: number } | null = null;
  private akDropFrom(mag: Object3D) {
    const into = this.root.parent;
    if (!into || this.part !== "all") return;
    this.akDropGone();
    mag.updateWorldMatrix(true, false);
    const o = mag.clone(true);
    o.visible = true;
    into.updateWorldMatrix(true, false);
    akM1.copy(into.matrixWorld).invert().multiply(mag.matrixWorld);
    akM1.decompose(o.position, o.quaternion, o.scale);
    into.add(o);
    // (let go: falling, a little ahead, turning end over end)
    const ax = new Vector3(0, 0, 1).applyQuaternion(mag.getWorldQuaternion(akQ1));
    const v = new Vector3(1, 0, 0).applyQuaternion(akQ1).multiplyScalar(0.25);
    v.y = -0.4;
    this.root.updateWorldMatrix(true, false);
    const floor = new Vector3().setFromMatrixPosition(this.root.matrixWorld).y;
    this.akDrop = { o, v, ax, floor: into.worldToLocal(akV1.set(0, floor, 0)).y, t: 0 };
  }
  private akDropFrame(dt: number) {
    const D = this.akDrop;
    if (!D) return;
    D.t += dt;
    if (D.o.position.y > D.floor + 0.03) {
      D.v.y -= 9.8 * dt;
      D.o.position.addScaledVector(D.v, dt);
      D.o.quaternion.premultiply(akQ1.setFromAxisAngle(D.ax, DROP.spin[0] * dt));
      if (D.o.position.y <= D.floor + 0.03) {
        D.o.position.y = D.floor + 0.03;
        D.t = 0;
      }
    } else if (D.t > DROP.lie) this.akDropGone();
  }
  private akDropGone() {
    this.akDrop?.o.removeFromParent();
    this.akDrop = null;
  }
  /** (plan 82 F5a) The magazine pouch on her belt at her left hip's front while she carries an AK (slung or in
   *  her hands): a leather box, two magazines standing in it — the one she draws gone from it till it's in */
  private akPouch: { root: Group; mags: Object3D[] } | null = null;
  private akPouchFrame(p: PersonIn) {
    const hips = this.model.bone("hips");
    const tpl = this.mats.gun?.("ak47") ?? null;
    const magT = tpl?.getObjectByName("magazine") ?? null;
    if (!hips || !magT || this.part !== "all" || !(p.slingAk || this.gun?.key === "ak47")) {
      this.dropAkPouch();
      return;
    }
    if (!this.akPouch) {
      const root = new Group();
      const box = new Mesh(STRAP_BOX, this.mats.prop("#3a2414"));
      box.scale.set(...AK_POUCH.box);
      box.castShadow = false;
      root.add(box);
      const mags: Object3D[] = [];
      for (const at of AK_POUCH.mags) {
        const o = magT.clone(true);
        o.position.copy(at);
        o.quaternion.copy(AK_POUCH.magTurn);
        root.add(o);
        mags.push(o);
      }
      root.position.copy(AK_POUCH.at);
      root.quaternion.copy(AK_POUCH.turn);
      hips.add(root);
      this.akPouch = { root, mags };
    }
    // (the one she draws gone from it once it's up out of it, till the reload's done)
    const t = this.akLoadT;
    this.akPouch.mags.forEach((o, i) => {
      o.visible = !(i === AK_POUCH.take && t >= 0.92 && t < AK_CLOSE + 1.5);
    });
  }
  private dropAkPouch() {
    this.akPouch?.root.removeFromParent();
    this.akPouch = null;
  }
  /** (plan 81 F5a) The shell carrier on her belt at the right hip's side while she carries a double-barrel
   *  (slung or in her hands): a leather strip, four shells upright in its loops, their brass up — the ones
   *  she's drawn loading gone from them till it's shut */
  private carrier: { root: Group; shells: Mesh[] } | null = null;
  private carrierFrame(p: PersonIn) {
    const hips = this.model.bone("hips");
    if (!hips || this.part !== "all" || !(p.sling || this.gun?.key === "shotgun")) {
      this.carrier?.root.removeFromParent();
      this.carrier = null;
      return;
    }
    if (!this.carrier) {
      const root = new Group();
      const leather = this.mats.prop("#3a2414");
      const strip = new Mesh(STRAP_BOX, leather);
      strip.scale.set(0.09, 0.05, 0.006);
      strip.position.set(0, 0, 0.003);
      const band = new Mesh(STRAP_BOX, leather);
      band.scale.set(0.094, 0.02, 0.004);
      band.position.set(0, -0.006, 2 * CARRIER.out - 0.004);
      root.add(strip, band);
      SG_SHELL_GEO ??= shellGeometry();
      const shells: Mesh[] = [];
      for (const x of CARRIER.loops) {
        const sh = new Mesh(SG_SHELL_GEO, this.mats.prop("vertex"));
        // (upright, its brass up: its hull's way down)
        sh.position.set(x, CARRIER.y, CARRIER.out);
        sh.quaternion.setFromUnitVectors(X3, rv1.set(0, -1, 0));
        root.add(sh);
        shells.push(sh);
      }
      for (const o of root.children) o.castShadow = false;
      root.position.copy(CARRIER.at);
      root.quaternion.copy(CARRIER.turn);
      hips.add(root);
      this.carrier = { root, shells };
    }
    // (loading: the ones drawn out of it gone till it's shut)
    const drawn = this.sgLoadT >= 0 && this.sgLoadT < SG_LOAD_CLOSE ? sgLoadAt(this.sgLoadT).drawn : 0;
    this.carrier.shells.forEach((sh, i) => {
      sh.visible = !CARRIER.take.slice(0, drawn).includes(i);
    });
  }
  private dropSling(key?: string) {
    for (const [k, S] of this.slings) {
      if (key && k !== key) continue;
      S.root.removeFromParent();
      for (const sm of S.strap) sm.removeFromParent();
      this.slings.delete(k);
    }
  }
  private dropHolster() {
    this.holster?.root.removeFromParent();
    this.holster = null;
    this.pouch?.root.removeFromParent();
    this.pouch = null;
  }

  // on a call with the phone put away: an earbud in the right ear (the head's own space)
  private bud: Prop | null = null;
  private budFrame(p: PersonIn) {
    const at = p.bud ? this.model.earPoint() : null;
    const head = this.model.bone("head");
    if (!!this.bud === !!(at && head)) return;
    this.dropBud();
    if (!at || !head) return;
    this.bud = this.C.buildProp("bud", "#f4f2ec", this.mats.prop);
    this.bud.root.position.set(at[0], at[1], at[2]);
    head.add(this.bud.root);
  }
  private dropBud() {
    if (!this.bud) return;
    this.bud.root.removeFromParent();
    this.bud.dispose();
    this.bud = null;
  }

  // the torch on: a flashlight in the left hand (docs/plan/30-the-dark.md) — not while the
  // phone's out (both hands on it)
  private torch: Prop | null = null;
  private torchFrame(p: PersonIn) {
    const hand = this.model.bone("wristL");
    const on = !!p.torch && !p.phone && !!hand;
    if (!!this.torch !== on) {
      this.dropTorch();
      if (on && hand) {
        this.torch = this.C.buildProp("torch", "#2b2e33", this.mats.prop);
        this.C.inHand(this.torch.root, "torch");
        // (no shadow of its own: the light comes out of it)
        this.torch.root.traverse((o) => {
          o.castShadow = false;
        });
        hand.add(this.torch.root);
      }
    }
    if (!this.torch) return;
    // (plan 80: reloading the revolver, the left hand's on the cylinder — the torch out of it meanwhile, its
    // light still on)
    this.torch.root.visible = !(this.revLoadT > 0.08 && this.revLoadT < 2.05);
    // along the beam (shared beam.ts): ahead, tipped at the ground — or up as they aim — whatever
    // the wrist is doing, so the light comes out of it where it points
    // (plan 78 phase 5: a life hand turned at its wrist to aim it — the torch across the palm, its barrel in
    // the fist — and only what the wrist can't, turned in the hand)
    // (plan 81 F3a: under the double-barrel's fore-end in the left fist, along the barrels, its lens ahead)
    // (plan 82: the AK's against the receiver, ahead under the handguard)
    const LS = this.lgSpec;
    const fore = this.lgTorchX < 0 ? null : LS.fore.part ? this.gun?.model.parts[LS.fore.part] : this.gun?.model.root;
    if (fore) {
      fore.updateWorldMatrix(true, false);
      fore.matrixWorld.decompose(tv, tq, tv2);
      const at = tv3
        .set(this.lgTorchX + LS.torch.ahead, LS.torch.y, 0)
        .sub(LS.fore.pivot)
        .applyMatrix4(fore.matrixWorld);
      tq.multiply(tq2.setFromUnitVectors(Y3, X3));
      hand?.updateWorldMatrix(true, false);
      hand?.worldToLocal(this.torch.root.position.copy(at));
      hand?.getWorldQuaternion(tq2);
      this.torch.root.quaternion.copy(tq2.invert().multiply(tq));
      this.lgTorchX = -1;
      return;
    }
    const look = this.lookDir(p, tv);
    const frame = this.model.handFrame("L");
    // (plan 80: held Harries under the revolver, the hold turned the hand already)
    if (frame && !this.revHarries) this.model.aimHand("L", this.C.gripLine("torch", frame, tv2), look);
    this.C.pointAlong(this.torch.root, look, frame, "torch");
  }
  /** Where the beam goes, in the world (unit): ahead and tipped at the ground — or, aiming, along the
   *  look (bladed: AIM_BLADE left of the body's facing) and up as they aim. */
  private lookDir(p: PersonIn, out: Vector3): Vector3 {
    const aiming = ((p.mv ?? 0) & 16) !== 0;
    const pitch = aiming ? (p.pitch ?? 0) : BEAM.tilt;
    const b = aiming ? AIM_BLADE : 0;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(tq);
    const c = Math.cos(pitch);
    return out.set(Math.sin(b) * c, Math.sin(pitch), Math.cos(b) * c).applyQuaternion(tq);
  }
  /** The flashlight's lens, in the world (the light comes out of it), or null: none in the hand. */
  // ── snow settling on them outside (docs/plan/33-the-look.md): on the shoulders and the top of
  // the head, as deep as `snowK` (0..1; the view keeps it, by how long they've been out) ──
  static snowMat: Material | null = null;
  /** How cold the air is for a breath to show, 0 … 1 (1 by 0 °C, none over 8: the view sets it). */
  static airCold = 1;
  snowK = 0;
  private snow: { pad: Mesh; cap: Mesh } | null = null;
  updateSnow() {
    const k = this.snowK;
    const m = this.model;
    if (k < 0.03 || !m.ready || !Person3D.snowMat || this.part !== "all") {
      if (this.snow) this.snow.pad.visible = this.snow.cap.visible = false;
      return;
    }
    if (!this.snow) {
      const dome = new SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      const pad = new Mesh(dome, Person3D.snowMat);
      const cap = new Mesh(dome, Person3D.snowMat);
      this.root.add(pad, cap);
      this.snow = { pad, cap };
    }
    const sL = m.bone("shoulderL");
    const sR = m.bone("shoulderR");
    const head = m.bone("head");
    const spine = m.bone("spine");
    if (!sL || !sR || !head || !spine) return;
    this.root.updateWorldMatrix(true, true);
    const a = sL.getWorldPosition(snowA);
    const b = sR.getWorldPosition(snowB);
    const { pad, cap } = this.snow;
    // across the shoulders: a low drift over them and the yoke between
    pad.visible = true;
    pad.position.copy(this.root.worldToLocal(snowC.copy(a).add(b).multiplyScalar(0.5)));
    pad.position.y += 0.07;
    this.root.getWorldQuaternion(snowQ).invert();
    pad.quaternion.copy(snowQ).multiply(spine.getWorldQuaternion(snowQ2));
    pad.scale.set(a.distanceTo(b) / 2 + 0.08, 0.02 + 0.06 * k, 0.1);
    // a cap on the crown, tilting with the head
    cap.visible = true;
    cap.position.copy(this.root.worldToLocal(head.localToWorld(snowC.set(0, m.crown - 0.04, 0))));
    this.root.getWorldQuaternion(snowQ).invert();
    cap.quaternion.copy(snowQ).multiply(head.getWorldQuaternion(snowQ2));
    cap.scale.set(0.1 + 0.05 * k, 0.015 + 0.045 * k, 0.1 + 0.05 * k);
  }
  torchLens(out: Vector3): Vector3 | null {
    if (!this.torch || !this.root.visible) return null;
    this.torch.root.updateWorldMatrix(true, false);
    return this.torch.root.localToWorld(out.set(0, 0.1, 0));
  }
  private dropTorch() {
    if (!this.torch) return;
    this.torch.root.removeFromParent();
    this.torch.dispose();
    this.torch = null;
  }

  // (plan 62) What a use puts in the hands: a marker at the whiteboard (its tip ahead of the right
  // hand, along it), a pad in both for a game or the slot cars (between them, flat ahead)
  private tool: { key: string; mesh: Object3D; dispose: () => void } | null = null;
  private toolFrame(p: PersonIn) {
    const busy = p.busy ?? "";
    const key = busy === "whiteboard" ? "marker" : busy === "gamepad" || busy === "slotcar" ? "pad" : "";
    if ((this.tool?.key ?? "") !== key) {
      this.dropTool();
      if (key) {
        if (key === "marker") {
          const geo = new CylinderGeometry(0.009, 0.009, 0.13, 8).rotateX(Math.PI / 2);
          const mesh = new Mesh(geo, this.mats.prop("#2f5fb3"));
          this.root.add(mesh);
          this.tool = { key, mesh, dispose: () => geo.dispose() };
        } else {
          // (plan 78 phase 5: a pad as one's held — its handles in the fists)
          const pad = this.C.buildPad(this.mats.prop);
          this.root.add(pad.root);
          this.tool = { key, mesh: pad.root, dispose: pad.dispose };
        }
      }
    }
    const t = this.tool;
    if (!t) return;
    const wl = this.model.bone("wristL");
    const wr = this.model.bone("wristR");
    const fr = this.model.bone("fingersR");
    if (!wl || !wr || !fr) return;
    this.root.updateMatrixWorld(true);
    wr.getWorldPosition(hw);
    if (t.key === "marker") {
      fr.getWorldPosition(hf);
      hf.sub(hw).normalize();
      // (gripped: from the knuckles on, its tip a hand ahead)
      hw.addScaledVector(hf, 0.07);
      this.root.worldToLocal(hw);
      t.mesh.position.copy(hw);
      t.mesh.lookAt(this.root.localToWorld(hv.copy(hw)).add(hf));
    } else {
      wl.getWorldPosition(hf);
      hw.add(hf).multiplyScalar(0.5);
      this.root.worldToLocal(hw);
      t.mesh.position.set(hw.x, hw.y - 0.01, hw.z + 0.05);
      t.mesh.rotation.set(0, 0, 0);
    }
  }
  private dropTool() {
    if (!this.tool) return;
    this.tool.mesh.removeFromParent();
    this.tool.dispose();
    this.tool = null;
  }

  private dropPhone() {
    if (!this.phone) return;
    this.phone.prop.root.removeFromParent();
    this.phone.prop.dispose();
    this.phone = null;
  }

  // A move with someone (shared SOCIAL): what, and how far into it.
  private actOf(p: PersonIn): { what: string; t: number; len: number } | null {
    if (!p.act) {
      this.actKey = "";
      return null;
    }
    const key = `${p.act}|${p.actAt}`;
    if (this.actKey !== key) {
      this.actKey = key;
      this.actSeen = performance.now();
    }
    const kind = p.act === "take" ? "give" : p.act;
    const len = (isSocial(kind) ? SOCIAL_MS[kind] : 1500) / 1000;
    return { what: p.act, t: (performance.now() - this.actSeen) / 1000, len };
  }

  /** How far along `ray` it meets this person (a standing capsule), or null. */
  hitDistance(ray: Ray): number | null {
    if (!this.root.visible || !this.model.ready) return null;
    const x = this.root.position.x;
    const z = this.root.position.z;
    const h = this.tagY() - 0.25;
    // closest approach between the ray and the person's upright axis
    const o = ray.origin;
    const d = ray.direction;
    const wx = o.x - x;
    const wz = o.z - z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) {
      return Math.hypot(wx, wz) < PICK_R && o.y > 0 ? Math.max(0, o.y - h) : null;
    }
    const t = -(wx * d.x + wz * d.z) / a;
    if (t < 0) return null;
    const px = wx + d.x * t;
    const pz = wz + d.z * t;
    const y = o.y + d.y * t;
    if (Math.hypot(px, pz) > PICK_R || y < 0 || y > h) return null;
    return t;
  }

  /** The name tag's height: over the head (seated too; in a jump, up with them — over where the head
   *  was standing, as a flip turns them over). */
  tagY(): number {
    if (!this.model.ready) return 2.0;
    const head = this.model.jointPosition("head").y;
    if (!this.jumpOn) this.headUp = head;
    return this.jumpH + Math.max(head, this.jumpOn ? this.headUp : 0) + 0.46;
  }

  /** A hand, in the world (game pads, the photo flash). */
  hand(side: "L" | "R" = "R"): Vector3 {
    const v = this.model.jointPosition(`wrist${side}`);
    return this.root.localToWorld(v);
  }

  // Out on the land, past the floor's light map (it lights only the floor), the light on them as
  // a tint of their own (view.ts: the lamps', the beams', the headlamps', what's seen round me;
  // docs/plan/44-the-night.md): the body's materials copied for them, the same shader.
  private own = new Map<Material, MeshBasicMaterial>();
  /** Wading (plan 66): the water this far up over the feet — the clothes wet under it (with a tint
   *  only: out on the land); null, none. */
  setWater(over: number | null) {
    if (over === null) {
      this.waterU.value = -1e6;
      if (this.model.isLife) this.model.setWater(null);
      return;
    }
    this.waterU.value = this.root.getWorldPosition(this.waterAt).y + over;
    if (this.model.isLife) this.model.setWater(this.waterU.value);
  }
  private readonly waterU = { value: -1e6 };
  private readonly waterAt = new Vector3();

  setTint(c: Color | null) {
    // (the life look: their materials are their own already — the tint a uniform of theirs, chars/life.ts)
    if (this.model.isLife) {
      this.model.setTint(c);
      return;
    }
    if (!c && !this.own.size) return;
    const swap = new Map<Material, Material>();
    for (const shared of [this.mats.body, this.mats.bodyAway]) {
      let mine = this.own.get(shared);
      if (c && !mine) {
        const m = (shared as MeshBasicMaterial).clone();
        // (and a waterline of its own: wading, wet below it — plan 66)
        const was = shared.onBeforeCompile;
        const key = shared.customProgramCacheKey;
        const water = this.waterU;
        m.onBeforeCompile = (sh, r) => {
          was.call(m, sh, r);
          sh.uniforms.uWaterW = water;
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "#include <common>\nvarying float vWlY;")
            .replace(
              "#include <project_vertex>",
              "#include <project_vertex>\nvWlY = (modelMatrix * vec4(transformed, 1.0)).y;",
            );
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying float vWlY;\nuniform float uWaterW;")
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\nif (vWlY < uWaterW) diffuseColor.rgb *= 0.66;\nelse if (vWlY < uWaterW + 0.02) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8), 0.35);",
            );
        };
        m.customProgramCacheKey = () => `${key.call(m)}|wl`;
        mine = m;
        this.own.set(shared, mine);
      }
      if (!mine) continue;
      if (c) mine.color.copy(c);
      swap.set(c ? shared : mine, c ? mine : shared);
    }
    this.root.traverse((o) => {
      const m = o as Mesh;
      const to = m.isMesh ? swap.get(m.material as Material) : undefined;
      if (to) m.material = to;
    });
  }

  dispose() {
    this.puffs?.dispose();
    for (const m of this.own.values()) m.dispose();
    this.burning?.dispose();
    this.dropHeld();
    this.dropPhone();
    this.dropGun();
    this.dropHolster();
    this.dropSling();
    this.dropAkPouch();
    this.akDropGone();
    this.carrier?.root.removeFromParent();
    this.sgShell?.removeFromParent();
    this.revLoader?.root.removeFromParent();
    this.dropBud();
    this.dropTorch();
    this.dropTool();
    this.model.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as Material).dispose();
    this.root.removeFromParent();
  }
}
