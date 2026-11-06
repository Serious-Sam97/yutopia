import { drinkAs, type HeldKind, heldState, isDrink, isHeld, isSocial, SOCIAL_MS } from "@yutopia/shared";
import { AIM_BLADE, BEAM } from "@yutopia/shared/beam";
import { flowOfCode, KH_FEEL, KH_MOVE, unpackMv } from "@yutopia/shared/move";
import type { PhysicsWorld } from "@yutopia/shared/physics";
import {
  BoxGeometry,
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
import type { JointName, Pose } from "../chars/rig";

const puffAt = new Vector3();
const puffDir = new Vector3();

import { cueModel, type GunFx, type GunKind, type GunModel, gunModel, poseGun, shellGeometry } from "./guns3d";
import { levelHands } from "./level3d";
import type { PersonIn } from "./person-in";
import { ANKLE_M, legOf, SEATS, seatFit, seatShape } from "./seats3d";

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
// (world/chars), posed every frame by the same motion layers as the 2D people,
// lit by the room's light map, sitting on real seat heights, holding real
// things. Vortex stays his drawing (people3d.ts): he must look exactly like
// Yondra's.

const SIT_IN = 0.3; // s: sitting down / getting up
const STAND_RISER = 0.45; // m: a stand's row over the one before (shared/kart/park.ts kartSeats)
const PICK_R = 0.26; // tiles: how wide a person is to a click

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
const gx = new Vector3();
const gy = new Vector3();
const gz = new Vector3();
const gm = new Matrix4();
// the gun's frame (x along the barrel, y up, z right) into the wrist's (the barrel −y, up +z)
const GUN_IN_WRIST = new Matrix4().makeBasis(new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0));

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
const tv = new Vector3();
const tv2 = new Vector3();

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
    const leg = legOf((j) => m.bone(j));
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
      { body: mats.body, ink: mats.ink },
      part,
    );
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
          kick: this.gunFx?.kick ?? 0,
          hurt: p.shade ? 0.7 : p.hp !== undefined ? Math.max(0, 1 - p.hp / 100) : undefined,
          // (plan 58 4c: the gait it's going for — its first step's keyed by it; 4f: the ground under
          // each foot, by the world's own rays, near only)
          goal: goalOf(p.mv ?? 0),
          ground: seen.groundAt && d < 12 && this.part === "all" ? this.groundFn(p, seen.groundAt) : undefined,
          // (plan 58 9: cold and spent by the vitals; a sound heard, from where it came)
          cold: LF ? LF.coldOf(p.wm ?? 100) : 0,
          spent: LF ? LF.spentOf(p.st ?? 100) : 0,
          heard: p.heard
            ? {
                yaw: this.turned - Math.atan2(p.heard.y - p.y, p.heard.x - p.x),
                pitch: 0,
                t: p.heard.t,
                loud: p.heard.loud,
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
    // away: faded, like iso
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
          this.C.inHand(prop.root, as);
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
      this.C.keepUpright(this.held.prop.root, drinkAs(this.held.kind), this.root, sip * 1.05);
    }
    // the phone in its case
    const phoneKey = p.phone ? `${p.phoneCase ?? "walnut"}` : "";
    if ((this.phone?.key ?? "") !== phoneKey) {
      this.dropPhone();
      if (phoneKey && hand) {
        const prop = this.C.buildProp("phone", phoneColors(p.phoneCase)[0], this.mats.prop);
        this.C.inHand(prop.root, "phone");
        hand.add(prop.root);
        this.phone = { key: phoneKey, prop };
      }
    }
    this.gunFrame(p, hand);
    this.toolFrame(p);
    this.ballFrame(p, hand);
    // aiming: the gun along the look too, whatever the wrist is doing (its barrel's −y)
    // (held in both hands — the hands placed by gunHands: the gun along the way it set)
    if (this.gun && this.gunDirOn && this.gunHandsW > 0.3) this.aimGun(this.gun.root, this.gunDir);
    else if (this.gun && ((p.mv ?? 0) & 16) !== 0) this.aimGun(this.gun.root, this.lookDir(p, tv2));
    else this.gun?.root.quaternion.identity();
    if (this.gun) this.gunMoves(this.gun);
    this.gripOnFore();
    this.budFrame(p);
    this.torchFrame(p);
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
  private gun: { key: string; root: Group; model: GunModel } | null = null;
  private gunFrame(p: PersonIn, hand: Object3D | null) {
    const key = p.gun ?? "";
    if ((this.gun?.key ?? "") === key) return;
    this.dropGun();
    if (!key || !hand) return;
    const root = new Group();
    const kind: GunKind = key === "shotgun" ? "shotgun" : "revolver";
    // (in front of my eyes: every bevel; anyone else's, a few thousand triangles)
    // (the pool cue taken down: a gun that fires the balls — carried and shouldered like the double-barrel)
    const detail = this.part === "arms" ? "near" : "far";
    const cue = key === "cue";
    const model = cue ? cueModel(this.mats.prop("vertex"), detail) : gunModel(kind, this.mats.prop("vertex"), detail);
    if (!cue) poseGun(model, kind, { cock: 1 });
    const inner = model.root;
    inner.quaternion.setFromRotationMatrix(GUN_IN_WRIST);
    inner.position
      .set(...model.grip.at)
      .applyQuaternion(inner.quaternion)
      .negate();
    inner.position.z += 0.01;
    root.add(inner);
    root.position.set(0, -0.05, 0);
    // (a little larger than life, as our people's hands are)
    root.scale.setScalar(kind === "shotgun" || cue ? 1.2 : 1.4);
    hand.add(root);
    this.gun = { key, root, model };
  }

  /** What the gun's doing (docs/plan/32-the-arms.md), mine as Arms says (`gunFx`): the hammer,
   *  the cylinder, the gate or the barrels, the rounds; a shot's kick back along the arm and up;
   *  reloading, tipped up and turned in. Without it, at rest — cocked while aiming. */
  gunFx: GunFx | null = null;
  private gunMoves(gun: { key: string; root: Group; model: GunModel }) {
    const kind: GunKind = gun.key === "shotgun" || gun.key === "cue" ? "shotgun" : "revolver";
    const fx = this.gunFx;
    if (gun.key !== "cue") poseGun(gun.model, kind, fx ?? { cock: 1 });
    gun.root.position.set(0, -0.05, 0);
    if (!fx) return;
    if (fx.kick > 0) {
      // (back: the root's +y; up: the barrel's −y turned toward its top, +z)
      gun.root.position.add(
        tv2.set(0, fx.kick * (kind === "shotgun" ? 0.06 : 0.035), 0).applyQuaternion(gun.root.quaternion),
      );
      gun.root.rotateX(-fx.kick * (kind === "shotgun" ? 0.22 : 0.3));
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
  private gunWay = { L: 0, P: 0, drop: 0, fwd: 0, in: 0, turn: 0 };
  private gunDir = new Vector3();
  private gunDirOn = false;
  private loadT = 0; // s into a double-barrel's reload
  private foreW = 0; // the left hand under the double-barrel's fore-end (gripOnFore), this much
  private shellInHand: Mesh | null = null;
  private gunHands(p: PersonIn, dt: number) {
    const gun = this.gun;
    const aiming = !!p.gun && ((p.mv ?? 0) & 16) !== 0;
    // (the pool cue: held as the double-barrel is, in both hands)
    const shotgun = p.gun === "shotgun" || p.gun === "cue";
    const loading = p.gun === "shotgun" && !aiming && (this.gunFx?.reload ?? 0) > 0.3;
    const want = gun && (shotgun || aiming) && !p.down && p.fell === undefined ? 1 : 0;
    this.gunHandsW += (want - this.gunHandsW) * (1 - Math.exp(-dt * 14));
    const w = this.gunHandsW;
    this.loadT = loading ? this.loadT + dt : 0;
    if (this.shellInHand) this.shellInHand.visible = false;
    this.gunDirOn = false;
    this.foreW = 0;
    if (w < 0.01 || !gun) return;
    // the gun's way and the butt's drop, by what's being done
    const run = Math.max(0, Math.min(1, (this.spd - 3.6) / 1.4));
    // (`fwd`, `in`: the butt that far ahead of the shoulder, and in toward the chest)
    const to = aiming
      ? { L: AIM_BLADE, P: p.pitch ?? 0, drop: 0, fwd: 0, in: 0 }
      : loading
        ? { L: 0.45, P: -0.3, drop: 0.22, fwd: 0, in: 0 }
        : shotgun
          ? // carried, heavy: the butt against the right side of the chest, the gun across the body —
            // the muzzle ahead and to the left, a little down (and the gun turned further left in the
            // hands: gunWay.turn); running, a touch closer in
            { L: 0.7 - 0.1 * run, P: -0.22 + 0.06 * run, drop: 0.13 - 0.03 * run, fwd: -0.05, in: 0.03 }
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
    const body = gs / (shotgun ? 1.2 : 1.4);
    if (shotgun) {
      // the butt: in the right shoulder's pocket, dropped below it as carried
      this.model.bone("shoulderR")?.getWorldPosition(hp);
      hp
        .addScaledVector(d, 0.02 * gs)
        .addScaledVector(hv.set(0, 0, 1).applyQuaternion(tq), gw.fwd * body)
        .addScaledVector(hv.set(1, 0, 0).applyQuaternion(tq), gw.in * body).y -= gw.drop * body;
      // from the butt: the grip 0.30 along and 0.045 up, the fore-end's underside 0.535 along, 0.07 up
      ht.copy(hp)
        .addScaledVector(d, (0.301 - 0.05) * gs)
        .addScaledVector(up, 0.045 * gs);
      this.model.reachTo("R", ht, w, [-1, -0.25, -0.15]);
      // the left: reloading, to the pocket and the breech; else under the fore-end — of the gun as
      // it ends up turned in the hand, so once it's turned (gripOnFore, after aimGun)
      if (this.loadT > 0) {
        this.loadHand(hp, d, up, gs, body, tq);
        this.model.reachTo("L", ht, w, [-0.5, -1, 0.2]);
      } else this.foreW = w;
      return;
    }
    const wrist = this.model.bone("wristR");
    if (!wrist) return;
    wrist.getWorldPosition(hp);
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

  // The left hand under the double-barrel's fore-end, where the gun really is (turned in the right
  // hand, kicked): its underside, a third of the way along it, in the gun's own frame.
  private gripOnFore() {
    const g = this.gun?.model;
    if (this.foreW < 0.01 || !g) return;
    g.root.updateWorldMatrix(true, false);
    hf.set(0.15, -0.045, 0).applyMatrix4(g.root.matrixWorld);
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
    this.gun.root.traverse((o) => (o as Mesh).geometry?.dispose());
    this.gun = null;
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
    // along the beam (shared beam.ts): ahead, tipped at the ground — or up as they aim — whatever
    // the wrist is doing, so the light comes out of it where it points
    this.C.pointAlong(this.torch.root, this.lookDir(p, tv));
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
  private tool: { key: string; mesh: Mesh } | null = null;
  private toolFrame(p: PersonIn) {
    const busy = p.busy ?? "";
    const key = busy === "whiteboard" ? "marker" : busy === "gamepad" || busy === "slotcar" ? "pad" : "";
    if ((this.tool?.key ?? "") !== key) {
      this.dropTool();
      if (key) {
        const geo =
          key === "marker"
            ? new CylinderGeometry(0.009, 0.009, 0.13, 8).rotateX(Math.PI / 2)
            : new BoxGeometry(0.15, 0.03, 0.07);
        const mesh = new Mesh(geo, this.mats.prop(key === "marker" ? "#2f5fb3" : "#2b2a28"));
        this.root.add(mesh);
        this.tool = { key, mesh };
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
    this.tool.mesh.geometry.dispose();
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
      return;
    }
    this.waterU.value = this.root.getWorldPosition(this.waterAt).y + over;
  }
  private readonly waterU = { value: -1e6 };
  private readonly waterAt = new Vector3();

  setTint(c: Color | null) {
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
