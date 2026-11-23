import { isDrink, isHeld } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { MV_WINDED } from "@yutopia/shared/move";
import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera as Lens,
  Matrix4,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from "three";
import type { chars } from "../art/chars-load";
import { strikeKeys } from "../strike/flag";
import type { GunFx } from "./guns3d";
import type { PersonIn } from "./person-in";
import { type Mats, Person3D } from "./person3d";
import { sightsIn, VM_PLACES, type VmPlace, vmMove, vmOf } from "./viewmodel";

type Chars = NonNullable<ReturnType<typeof chars>>;
type MotionOut = NonNullable<Person3D["motionOut"]>;

// My own hands in first person (docs/plan/22-people-3d.md, P5). The camera is
// in my head and my body isn't drawn; when my hands are doing something —
// the phone, a drink, typing, a use, a wave, a gun, the flashlight — my arms come up into view:
// shoulder to fingertips, my sleeves and skin, the same ink, holding the same
// things. They're posed by the very motion that poses my body for everyone
// else, seen from my eyes, and drawn in a pass of their own over the room
// (depth cleared) so they never sink into a wall or a desk. Lit by the room's
// light map where they are, so they dim at night.

const FOV = 62; // the hands' own lens: they look the same whatever the room's zoom (a gun's: the settings' vmFov)
const SHOW_IN = 0.22; // s: coming up into view / going down out of it
const DROP = 0.5; // m: how far below the eyes they go when there's nothing to do
const LAG = 18; // how quickly they catch up with a mouse-look turn (1/s)
const LAG_MAX = 0.14; // rad: at most this far behind
/** (plan 116) the view model's ease into a reload and out of it, s */
const VM_SWITCH = 0.28;
const BOB = [0.006, 0.009]; // m: side to side, up and down while walking

// Framing, per thing they do: [tip, forward, up, right]. The arms are tipped
// back about the eyes (rad) so hands held at the chest come up into the
// picture — looking further down than that they sit where they really are
// (the tip follows the look) — and moved a little (m), as games hold them. On
// a call the hand at the ear stays out of sight (as it would), the free hand
// talks in front; a throw's follow-through comes in from the top right; hands
// raised high (a wave) are brought forward and down to be seen.
type Frame = [number, number, number, number];
const FRAME: Record<string, Frame> = {
  text: [0.32, 0.04, 0.3, 0],
  call: [0.3, 0.06, 0.12, 0],
  video: [0.3, 0.08, 0.12, 0],
  type: [0.5, 0.04, 0.22, 0],
  drink: [0.5, 0.06, 0.16, 0],
  use: [0.35, 0.06, 0.12, 0],
  throw: [0, 0.2, -0.05, -0.15],
  // gestures: at the chest (heart, clap, a hand to the chin, a fist bump, cheers, give)…
  emote: [0.55, 0.08, 0.2, 0],
  act: [0.4, 0.1, 0.12, 0],
  // …and up high (a wave, a fist pump, a high five): brought forward and down into view
  "emote:wave": [0, 0.55, -0.2, -0.12],
  "emote:fire": [0, 0.55, -0.2, -0.12],
  "act:wave": [0, 0.55, -0.2, -0.12],
  "act:highfive": [0, 0.55, -0.2, -0.12],
  // a gun out (both arms out along the look, aiming) and the flashlight (the left forearm ahead):
  // a little to the side, under the crosshair
  gun: [0.12, 0.02, 0.06, 0.05],
  "gun:reload": [0.5, 0.1, 0.16, 0.04], // (brought up before the chest: raised into view)
  "gun:carry": [0.4, 0.06, 0.16, 0.02], // (the double-barrel carried low in both hands: raised into view)
  torch: [0.36, 0.06, 0.3, 0.04], // (held low: raised into view)
  "torch:aim": [0.3, 0.04, 0.14, 0.02], // (raised along the look: the forearm at the bottom, as it was)
};
const FRAME_ANY: Frame = [0.42, 0.06, 0.14, 0];
// emotes that use the arms (laugh, coffee and tape are the face's or the body's)
const ARM_EMOTES = new Set(["wave", "heart", "clap", "fire", "question"]);

/** What my hands are busy with right now ("" = nothing: they stay out of view). */
export function handsDoing(
  p: Pick<
    PersonIn,
    "phone" | "held" | "heldAt" | "typing" | "a" | "busy" | "act" | "emote" | "gun" | "torch" | "flare" | "mv"
  >,
): string {
  if (p.phone) return p.phone === "photo" || p.phone === "selfie" ? "" : p.phone;
  if (isHeld(p.held) && p.heldAt) return isDrink(p.held) ? "drink" : "toy";
  if (p.typing && p.a === 2) return "type";
  if (p.busy) return p.busy === "throw" ? "throw" : "use";
  if (p.act) return `act:${p.act}`;
  if (p.emote && ARM_EMOTES.has(p.emote)) return `emote:${p.emote}`;
  if (p.gun) return "gun";
  // (plan 87 F3b: a flare held up as the torch is)
  if (p.torch || p.flare) return (p.mv ?? 0) & 16 ? "torch:aim" : "torch";
  return "";
}

const eye = new Vector3();
const want = new Quaternion();
const vRear = new Vector3();
const vDir = new Vector3();
const vUp = new Vector3();
const vEl = new Vector3();
const vWr = new Vector3();
const vSeg = new Vector3();
/** (plan 116) a reload's forearms kept this far from the eye at least, where they're in the picture (m) — and the
 *  gun's own box (the sniper's stock came round at the eye as the reload ended) */
const NEAR = 0.34;
const NEAR_GUN = 0.22;
/** a gun's box in its own frame (its meshes', as made) */
const gunBoxes = new WeakMap<Object3D, Box3>();
const bM = new Matrix4();
const bB = new Box3();
function gunBox(root: Object3D): Box3 {
  let b = gunBoxes.get(root);
  if (b) return b;
  b = new Box3();
  root.updateWorldMatrix(true, true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const gb = m.geometry.boundingBox;
    if (gb) b?.union(bB.copy(gb).applyMatrix4(bM.multiplyMatrices(inv, m.matrixWorld)));
  });
  gunBoxes.set(root, b);
  return b;
}
const vAt = new Vector3();
const vGrip = new Vector3();
const vQ = new Quaternion();
const vQ2 = new Quaternion();
const vP = new Vector3();
const vTmp = new Vector3();
const vPiv = new Vector3();
const FINGERS = ["thumb", "index", "fingers", "ring", "little"] as const;
/** (plan 116: the perf check's — what the arms' person and the view model cost, summed; window.__fpProf) */
const PROF = { person: 0, vm: 0, n: 0 };
if (typeof window !== "undefined") (window as unknown as { __fpProf?: typeof PROF }).__fpProf = PROF;
const AX = new Vector3(1, 0, 0);
const AY = new Vector3(0, 1, 0);
const AZ = new Vector3(0, 0, 1);
const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
/** each gun's reload, end to end (s): plans 80–84's timelines */
const RELOAD_S: Record<string, number> = { revolver: 2.2, shotgun: 2.3, ak47: 2.4, sniper: 3.5, daybreak: 2.0 };

export class Hands1P {
  readonly scene = new Scene();
  readonly camera = new Lens(FOV, 1, 0.01, 8);
  private rig = new Group(); // at the eyes, turned as the camera (a little behind a fast turn)
  private tilt = new Group(); // the framing: tipped about the eyes
  private person: Person3D;
  private vis = 0;
  private doing = ""; // (the last thing they did: framed by it while they go down)
  /** what they're doing now ("" = nothing) */
  now = "";
  private frame: Frame = [...FRAME_ANY];
  private phase = 0;
  private bobW = 0;
  private speed = 0; // tiles / s, smoothed (the bob's cadence)
  private last: { x: number; y: number } | null = null;
  private lagReady = false;
  private breath = 0; // s: a gun's sway

  // ── (plan 116) the view model: the arms and gun moved as one so the gun sits where the eye wants it ──
  /** the move now (the tilt's), eased; frozen through a reload, a draw's rise added */
  private vmQ = new Quaternion();
  private vmP = new Vector3();
  private vmOn = false;
  private vmK = 1;
  private vmReload = false;
  private vmFromQ = new Quaternion();
  private vmFromP = new Vector3();
  /** how far aimed down the sights (0 the hip, 1 on them) */
  ads = 0;
  /** the gun's own time to aim (s: shared ARMS[gun].aim — world/dark/arms.ts sets it) */
  adsSecs = 0.2;
  /** (F7a) where the view model sits: the settings' preset */
  place: VmPlace = "classic";
  /** (F7a) a gun's lens (°) and whether it bobs as I walk — the settings' */
  gunFov = FOV;
  bob = true;
  /** a reload's camera: how far the view tips down to the work and rolls (rad) — the view turns its camera by it */
  readonly beat = { pitch: 0, roll: 0 };
  /** the world's lens narrowed by this much aiming (0..0.25) — the view's */
  zoom = 0;
  private gunKey = "";
  private gunAt = 0;
  private reloadAt = -1;
  private keep = new Vector3();
  /** (the bench) the reload's progress given (0..1), not timed */
  reloadU: number | null = null;
  /** (F8a) how far the wall in front of my eyes is (m; the view's ray) — the gun's pulled back when it's near */
  wall = 9;
  private feel = { side: 0, sprint: 0, land: 0, wall: 0, lastZ: 0, px: 0, py: 0, ready: false };

  private lights: { hemi: HemisphereLight; sun: DirectionalLight } | null = null;

  /** (plan 73 4.5, the life look) My hands lit as I am: the room's sky light and — out on the land only:
   *  this picture has no shadows, indoors it lit them through the ceiling — its sun copied in, and the
   *  room's environment. (Today's take the room's light map alone, flat.) */
  lightAs(room: Scene, hemi: HemisphereLight, sun: DirectionalLight, outside: boolean): void {
    if (!this.lights) {
      this.lights = { hemi: new HemisphereLight(), sun: new DirectionalLight() };
      this.scene.add(this.lights.hemi, this.lights.sun, this.lights.sun.target);
    }
    const { hemi: h, sun: s } = this.lights;
    h.color.copy(hemi.color);
    h.groundColor.copy(hemi.groundColor);
    h.intensity = hemi.intensity;
    s.color.copy(sun.color);
    s.intensity = outside ? sun.intensity : 0;
    s.position.copy(sun.position).sub(sun.target.position);
    s.target.position.set(0, 0, 0);
    this.scene.environment = room.environment;
    this.scene.environmentIntensity = room.environmentIntensity;
  }

  constructor(C: Chars, factory: InstanceType<Chars["CharFactory"]>, mats: Mats, p: PersonIn) {
    this.person = new Person3D("hands1p", C, factory, mats, p, "arms");
    this.scene.add(this.rig);
    this.rig.add(this.tilt);
    this.tilt.add(this.person.root);
  }

  /** The flashlight's lens as the world's camera `cam` would show it where my hands' picture does:
   *  at its depth in front of the eyes, across and up so it falls on the same spot of the screen
   *  (my hands have a lens of their own). Null: none in my hands, or they're not shown. */
  lensFor(cam: PerspectiveCamera, out: Vector3): Vector3 | null {
    if (!this.shown || !this.person.torchLens(out)) return null;
    this.camera.updateMatrixWorld();
    this.camera.worldToLocal(out);
    if (out.z > -0.05) return null;
    const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.camera.fov * Math.PI) / 360);
    out.set(out.x * k, out.y * k, out.z);
    cam.updateMatrixWorld();
    return cam.localToWorld(out);
  }

  /** What the gun in my hands is doing (world/dark/arms.ts): passed to my arms' person. */
  set gunFx(fx: GunFx | null) {
    this.person.gunFx = fx;
  }

  /** My gun's muzzle as the world's camera `cam` would show it where my hands' picture does (as
   *  lensFor); false: no gun. */
  muzzleFor(cam: PerspectiveCamera, out: Vector3): boolean {
    if (!this.shown || !this.person.gunMuzzle(out)) return false;
    this.camera.updateMatrixWorld();
    this.camera.worldToLocal(out);
    if (out.z > -0.05) return false;
    const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.camera.fov * Math.PI) / 360);
    out.set(out.x * k, out.y * k, out.z);
    cam.updateMatrixWorld();
    cam.localToWorld(out);
    return true;
  }

  /** Anything to draw this frame. */
  get shown(): boolean {
    return this.vis > 0.001 && this.person.ready;
  }
  get avatar() {
    return this.person.model.avatar;
  }

  /** (plan 116) No gun in view: the view model let go — its zoom and the camera's beats off, the next gun drawn up
   *  from below (even the same one again), a reload's clock from its start. */
  private offGun() {
    this.vmOn = false;
    this.ads = 0;
    this.zoom = 0;
    this.beat.pitch = this.beat.roll = 0;
    this.gunKey = "";
    this.reloadAt = -1;
    this.keep.set(0, 0, 0);
  }

  /** Step with my state, posed by `mo` (my body's motion this frame); `cam` is the room's camera,
   *  `pitch` its look down (rad, + down). `off` hides them (the phone's camera, a game camera…). */
  update(
    p: PersonIn,
    mo: MotionOut | null,
    dt: number,
    cam: PerspectiveCamera,
    pitch: number,
    off: boolean,
    low: boolean,
  ) {
    let doing = off || !mo ? "" : handsDoing(p);
    // (a reload framed till its clip's wholly blended out: let go at 0.3, the arms took the firing grip with the frame
    // still half the reload's — the forearms came in high from the sides)
    if (doing === "gun" && (this.person.gunFx?.reload ?? 0) > (this.now === "gun:reload" ? 0.02 : 0.3))
      doing = "gun:reload";
    else if (doing === "gun" && p.gun === "shotgun" && ((p.mv ?? 0) & 16) === 0) doing = "gun:carry";
    this.now = doing;
    if (doing) this.doing = doing;
    const reduced = !!p.reduced;
    const target = doing ? 1 : 0;
    this.vis = reduced ? target : Math.max(0, Math.min(1, this.vis + ((target ? 1 : -1) * dt) / SHOW_IN));
    // the lens: where the room's camera is, its own field of view
    this.camera.position.copy(cam.position);
    this.camera.quaternion.copy(cam.quaternion);
    // (plan 116) a gun out: its own lens, the near plane out past the shoulders, and the forearms alone (a view
    // model's; their cut dissolved — chars/capcut.ts); anything else the hands do — the phone, a wave — the whole arms
    // as ever. By what they're framed by (`this.doing`), not this frame's: going (the sniper's scope up, a flip), the
    // gun's still drawn a moment — the lens jumped to 62° and the whole arms came in round it
    const gunLens = this.doing.startsWith("gun");
    const fov = gunLens ? this.gunFov : FOV;
    this.person.model.setArmsUpper(!gunLens);
    const near = gunLens ? 0.06 : 0.01;
    if (this.camera.aspect !== cam.aspect || Math.abs(this.camera.fov - fov) > 0.01 || this.camera.near !== near) {
      this.camera.aspect = cam.aspect;
      this.camera.fov = fov;
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    if (!this.shown && !doing) {
      this.lagReady = false;
      this.last = null;
      // (gone: nothing of theirs left on the world's camera — the reload's tip and roll, the aim's zoom; a gun drawn
      // again from below, its reload's clock from its start)
      this.offGun();
      return;
    }
    if (!mo) return;

    // at the eyes, turned with the look; a fast turn leaves them a touch behind
    this.rig.position.copy(cam.position);
    want.copy(cam.quaternion);
    if (!this.lagReady || reduced) this.rig.quaternion.copy(want);
    else {
      this.rig.quaternion.slerp(want, 1 - Math.exp(-dt * LAG));
      const behind = this.rig.quaternion.angleTo(want);
      if (behind > LAG_MAX) this.rig.quaternion.rotateTowards(want, behind - LAG_MAX);
    }
    this.lagReady = true;
    // the framing: eased between what they're doing; looking further down, they're where they are
    const f = FRAME[this.doing] ?? FRAME[this.doing.split(":")[0]] ?? FRAME_ANY;
    const ef = reduced ? 1 : 1 - Math.exp(-dt * 6);
    for (let i = 0; i < 4; i++) this.frame[i] += (f[i] - this.frame[i]) * ef;
    const k = 0.12;
    const tilt = k * Math.log(Math.exp(this.frame[0] / k) + Math.exp(pitch / k)); // (a smooth max)
    this.tilt.rotation.set(tilt, 0, 0);
    // the arms face the way I look (the model faces +z; the camera looks down its −z) — aiming, the
    // body's bladed right of it (shared beam.ts AIM_BLADE) and the shoulders twisted back most of
    // the way (aimPose: the hips 0.15 of it, the spine 0.5): turned so the shoulders face the look,
    // the arms in front of me as they were
    const root = this.person.root;
    root.rotation.set(
      0,
      Math.PI - ((p.mv ?? 0) & 16 || doing === "gun" || doing === "gun:carry" ? AIM_BLADE * 0.65 : 0),
      0,
    );

    // posed by my body's motion (what they hold stays upright to this frame's framing) — (plan 116) a gun out and
    // not reloading: my arms (only mine, in front of my eyes; my body for everyone else keeps its ready) in the
    // firing grip, both hands on it, level: CS's hold, the gun then put where the eye wants it (viewModel)
    const fire = doing === "gun" || doing === "gun:carry";
    // (a reload's posed level too: looking down, the clip's arms went down with the look — the AK's left hand off the
    // picture's bottom without its magazine; the camera's own beats tip it to the work)
    const holdP = fire ? { ...p, mv: (p.mv ?? 0) | 16, pitch: 0 } : doing === "gun:reload" ? { ...p, pitch: 0 } : p;
    // (their own motion then: the body's is the ready's)
    const tP0 = performance.now();
    this.person.update(
      holdP,
      dt,
      { camX: p.x, camZ: p.y, onScreen: true, lowQuality: low },
      holdP === p ? mo : undefined,
    );
    PROF.person += performance.now() - tP0;
    // (the fingers' last millimetres: each closed onto the gun's own surface, as the bench solved it for this gun —
    // the hold's grips are the third person's, made to be seen from metres off)
    if (fire && p.gun) {
      const fb = vmOf(p.gun).fingers;
      if (fb)
        for (const S of ["L", "R"] as const)
          for (let i = 0; i < FINGERS.length; i++) this.person.model.bendFinger(S, FINGERS[i], fb[S][i] ?? 0);
    }

    // the eyes on the pivot
    root.position.set(0, 0, 0);
    root.updateMatrix();
    this.person.model.eyePosition(eye).applyMatrix4(root.matrix);
    root.position.copy(eye).negate();

    // walking: a little bob; coming and going: up from below
    let dist = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y) : 0;
    if (dist > 1.5) dist = 0;
    this.last = { x: p.x, y: p.y };
    // (the phase a stride's — two steps — at a real cadence, from my speed smoothed: from each frame's step it ran at
    // 2π a 1.2 tiles, a bounce 8 times a second at a jog, and stuttered with the uneven steps — the gun shook)
    if (dt > 0) this.speed += (Math.min(12, dist / dt) - this.speed) * (1 - Math.exp(-dt * 5));
    this.phase += (this.speed / (0.8 + 0.55 * this.speed)) * Math.PI * 2 * dt;
    this.bobW += ((p.a === 1 && !reduced ? 1 : 0) - this.bobW) * (1 - Math.exp(-dt * 6));
    const ease = this.vis * this.vis * (3 - 2 * this.vis);
    const gun = this.doing.startsWith("gun") && !!p.gun ? this.person.heldGun() : null;
    if (gun) {
      const tV0 = performance.now();
      this.viewModel(p, gun, dt, reduced);
      PROF.vm += performance.now() - tV0;
      PROF.n++;
      const bk = (1 - this.ads * 0.85) * (this.bob ? 1 : 0); // (1.6 till the feedback: too much)
      this.tilt.position.x += Math.sin(this.phase) * BOB[0] * this.bobW * bk;
      this.tilt.position.y -= ((1 - Math.cos(2 * this.phase)) / 2) * BOB[1] * this.bobW * bk + (1 - ease) * DROP;
    } else {
      this.offGun();
      this.tilt.position.set(
        this.frame[3] + Math.sin(this.phase) * BOB[0] * this.bobW,
        this.frame[2] - ((1 - Math.cos(2 * this.phase)) / 2) * BOB[1] * this.bobW - (1 - ease) * DROP,
        -this.frame[1],
      );
    }
    this.sway(p, dt, reduced);
    // (the camera's turn for a reload's beats: the hands' lens turned with the world's — the view turns that one)
    if (this.beat.pitch || this.beat.roll) {
      this.camera.rotateX(this.beat.pitch);
      this.camera.rotateZ(this.beat.roll);
    }
    // (plan 115) the Strike Park's view model: a gun out, in first person, off the sights — held where CS holds it
    // (plan 119: the knife and the charge are held by the body's own gear pass — person3d strikeHands — not lifted here)
    if (gun && this.ads < 0.05) {
      // inspect (F, plan 115 phase 23): the gun brought in and turned to show its side, held, back — 2.4 s
      const it = (performance.now() - strikeKeys.inspectAt) / 2400;
      if (it >= 0 && it < 1) {
        const k = it < 0.3 ? it / 0.3 : it > 0.75 ? (1 - it) / 0.25 : 1;
        const e = k * k * (3 - 2 * k);
        const wob = it > 0.3 && it < 0.75 ? Math.sin((it - 0.3) * 14) * 0.04 : 0;
        this.tilt.position.x -= 0.12 * e;
        this.tilt.position.y += 0.14 * e;
        this.tilt.position.z += 0.06 * e;
        this.turn(AY, 0.95 * e + wob);
        this.turn(AZ, 0.45 * e);
      }
    }
  }

  /** (plan 116) The view model: the arms and gun as the body's clip has them, measured from the eye (the tilt let
   *  go), then the tilt set to the move that puts the gun's sights where they're wanted — the hip hold, or down them
   *  aiming. A reload: the move as it was when it began, the clip's own motion played through it, eased back into
   *  the frame if its work would leave it, and the camera tipped toward it. A draw: up from below. */
  private viewModel(p: PersonIn, gun: NonNullable<ReturnType<Person3D["heldGun"]>>, dt: number, reduced: boolean) {
    const now = performance.now();
    const key = p.gun ?? "";
    const g = vmOf(key);
    if (key !== this.gunKey) {
      this.gunKey = key;
      this.gunAt = now;
      this.vmOn = false;
    }
    const reloading = this.doing === "gun:reload";
    if (reloading && this.reloadAt < 0) this.reloadAt = now;
    if (!reloading) this.reloadAt = -1;
    // aiming: down the sights at the gun's own pace (not mid-reload)
    const aimed = ((p.mv ?? 0) & 16) !== 0 && !reloading;
    const rate = dt / Math.max(0.08, this.adsSecs);
    this.ads = reduced ? (aimed ? 1 : 0) : Math.max(0, Math.min(1, this.ads + (aimed ? rate : -rate * 1.3)));
    this.zoom = g.zoom * this.ads * this.ads * (3 - 2 * this.ads);
    // measured with the tilt let go
    this.tilt.position.set(0, 0, 0);
    this.tilt.quaternion.identity();
    this.tilt.updateMatrixWorld(true);
    sightsIn(gun, this.rig, vRear, vDir, vUp, vGrip);
    if (!reloading) {
      vmMove(g, this.ads, VM_PLACES[this.place], vRear, vDir, vUp, vGrip, vQ, vP);
      this.keep.multiplyScalar(Math.exp(-dt * 6));
      this.beat.pitch *= Math.exp(-dt * 6);
      this.beat.roll *= Math.exp(-dt * 6);
    } else {
      // the reload as the body's clip does it, held out in front (the gun tips and turns as the clip has it — the
      // revolver's muzzle up, the AK canted), its grip kept at a place out ahead of me — the hands' work round it, in
      // view (CS's); the forearms alone drawn, their cut closed (chars/capcut.ts)
      vQ.setFromAxisAngle(vTmp.set(1, 0, 0), g.tip);
      const r = g.rel ?? [0.06, -0.34, -0.52];
      vP.set(r[0], r[1], r[2]).sub(vTmp.copy(vGrip).applyQuaternion(vQ));
    }
    {
      // (exact every frame: the move cancels the body's own bounce as it walks — eased at 14/s it trailed it, and the
      // bounce came through as a shake, the revolver's 13–21 px; only a change of placement — into a reload, out of
      // it — is eased, from where it was drawn, over VM_SWITCH s; a swap straight there)
      if (!this.vmOn || reduced) this.vmK = 1;
      else if (reloading !== this.vmReload) {
        this.vmFromQ.copy(this.vmQ);
        this.vmFromP.copy(this.vmP);
        this.vmK = 0;
      }
      this.vmReload = reloading;
      this.vmK = Math.min(1, this.vmK + dt / VM_SWITCH);
      const e = this.vmK * this.vmK * (3 - 2 * this.vmK);
      if (e >= 1) {
        this.vmQ.copy(vQ);
        this.vmP.copy(vP);
      } else {
        this.vmQ.copy(this.vmFromQ).slerp(vQ, e);
        this.vmP.copy(this.vmFromP).lerp(vP, e);
      }
      this.vmOn = true;
    }
    this.tilt.quaternion.copy(this.vmQ);
    this.tilt.position.copy(this.vmP);
    if (reloading) {
      // keep the work in the frame: the hands' middle (and the gun) held inside a box on the screen, and each hand
      // inside the picture (the AK's left hand went off its bottom for the magazine — its sleeve alone seen)
      this.tilt.updateMatrixWorld(true);
      const wl = this.person.boneOf("wristL");
      const wr = this.person.boneOf("wristR");
      const elL = this.person.boneOf("elbowL");
      const elR = this.person.boneOf("elbowR");
      const t = Math.tan((this.camera.fov * Math.PI) / 360);
      let loX = Number.NEGATIVE_INFINITY;
      let hiX = Number.POSITIVE_INFINITY;
      let loY = Number.NEGATIVE_INFINITY;
      let hiY = Number.POSITIVE_INFINITY;
      // (the shift that puts `v` inside the box [x0, x1] × [y0, y1] of the screen: narrowed onto the others')
      const fit = (v: Vector3, x0: number, x1: number, y0: number, y1: number) => {
        const d = Math.max(0.15, -v.z);
        const w = d * t * this.camera.aspect;
        const h = d * t;
        loX = Math.max(loX, x0 * w - v.x);
        hiX = Math.min(hiX, x1 * w - v.x);
        loY = Math.max(loY, y0 * h - v.y);
        hiY = Math.min(hiY, y1 * h - v.y);
      };
      vAt.set(0, 0, 0);
      let n = 0;
      for (const b of [wl, wr, gun.root]) {
        if (!b) continue;
        // (the gun by its grip: its origin's at the stock, by the eye — read as far under the picture)
        const w =
          b === gun.root ? vTmp.set(...gun.grip.at).applyMatrix4(gun.root.matrixWorld) : b.getWorldPosition(vTmp);
        const v = this.rig.worldToLocal(w).add(this.keep);
        // (a hand come back to the body — the AK's to its pouch for the next magazine — left to dip out of the
        // picture, CS's; framed, the box hauled the whole view up and that sleeve filled the screen's bottom)
        if (b !== gun.root && -v.z < 0.3) continue;
        // (nor one whose forearm points back at the eye: framed, its sleeve's what's lifted into the picture)
        const el = b === wl ? elL : b === wr ? elR : null;
        if (el && -this.rig.worldToLocal(el.getWorldPosition(vEl)).add(this.keep).z < 0.3) continue;
        vAt.add(v);
        n++;
        if (b !== gun.root) fit(v, -0.85, 0.85, -0.95, 0.25);
      }
      // (the work's middle under the picture's middle: framed up to it, the arms rode too high — the user's feedback)
      if (n) fit(vAt.divideScalar(n), -0.35, 0.45, -0.75, -0.15);
      const pick = (lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, 0)));
      // and back from the eye: where a forearm's in the picture it's kept NEAR m off at least — nearer, its sleeve
      // filled a corner of the screen (the revolver's right hand fetching the speedloader, the sniper's bolt hand);
      // eased back in as it goes
      let nearest = Number.POSITIVE_INFINITY;
      for (const [el, wr0] of [
        [elL, wl],
        [elR, wr],
      ] as const) {
        if (!el || !wr0) continue;
        const e = this.rig.worldToLocal(el.getWorldPosition(vEl)).add(this.keep);
        const w = this.rig.worldToLocal(wr0.getWorldPosition(vWr)).add(this.keep);
        for (let i = 0; i <= 8; i++) {
          const q = vSeg.copy(e).lerp(w, i / 8);
          const d = -q.z;
          // (in the picture, give or take the sleeve's own width)
          if (d < 0.02 || Math.abs(q.x) - 0.06 > d * t * this.camera.aspect || Math.abs(q.y) - 0.06 > d * t) continue;
          nearest = Math.min(nearest, d);
        }
      }
      let nearGun = Number.POSITIVE_INFINITY;
      const box = gunBox(gun.root);
      if (!box.isEmpty())
        for (let c = 0; c < 8; c++) {
          vSeg.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z);
          const q = this.rig.worldToLocal(vSeg.applyMatrix4(gun.root.matrixWorld)).add(this.keep);
          const d = -q.z;
          if (d < 0.02 || Math.abs(q.x) > d * t * this.camera.aspect || Math.abs(q.y) > d * t) continue;
          nearGun = Math.min(nearGun, d);
        }
      const need = Math.max(NEAR - nearest, NEAR_GUN - nearGun);
      const dz = need > 0 ? -need : Math.min(-need, -this.keep.z);
      const want = vTmp.set(pick(loX, hiX), pick(loY, hiY), Number.isFinite(dz) ? dz : -this.keep.z);
      this.keep.lerp(want.add(this.keep), reduced ? 1 : 1 - Math.exp(-dt * 7));
      // (never far: the work's the clip's, only nudged into the frame — and back at most 0.1 m: further, the arms were far off the screen — the user's feedback)
      const kz = Math.max(-0.1, Math.min(0, this.keep.z));
      this.keep.z = 0;
      if (this.keep.length() > 0.2) this.keep.setLength(0.2);
      this.keep.z = kz;
      // the camera's beats: tipped down to the work and rolled a little, through the reload's middle
      const len = RELOAD_S[key] ?? 2.2;
      const u = this.reloadU ?? Math.min(1, (now - this.reloadAt) / 1000 / len);
      const env = smooth(u / 0.18) * (1 - smooth((u - 0.78) / 0.22));
      // (a jolt as it's seated: two-thirds of the way)
      const jolt = Math.max(0, 1 - Math.abs(u - 0.66) / 0.05);
      const b = reduced ? 0 : 1;
      this.beat.pitch = b * (-g.dip * env - 0.02 * jolt);
      this.beat.roll = b * (g.roll * env * Math.sin(u * Math.PI));
    }
    this.tilt.position.add(this.keep);
    // (F8a) the feel: a tilt with a strafe, the sprint's pose, a dip as I land, the gun pulled back from a wall
    {
      const f = this.feel;
      const e = (r: number) => (reduced ? 1 : 1 - Math.exp(-dt * r));
      let side = 0;
      if (f.ready && dt > 0) {
        // (my step this frame, across the look: + to the right)
        const vx = (p.x - f.px) / dt;
        const vy = (p.y - f.py) / dt;
        vTmp.set(1, 0, 0).applyQuaternion(this.rig.quaternion);
        const rx = vTmp.x;
        const rz = vTmp.z;
        const n = Math.hypot(rx, rz) || 1;
        side = Math.max(-1, Math.min(1, (vx * rx + vy * rz) / n / 4));
      }
      f.ready = true;
      f.px = p.x;
      f.py = p.y;
      f.side += (side - f.side) * e(8);
      const sprinting = ((p.mv ?? 0) & 7) === 3 && this.ads < 0.1 && !reloading;
      f.sprint += ((sprinting ? 1 : 0) - f.sprint) * e(7);
      const z = p.z ?? 0;
      if (f.lastZ > 0.25 && z < 0.05) f.land = Math.min(0.05, 0.02 + f.lastZ * 0.02);
      f.lastZ = z;
      f.land *= Math.exp(-dt * 7);
      const near = this.wall < 0.85 && !reloading ? Math.min(1, (0.85 - this.wall) / 0.45) : 0;
      f.wall += (near - f.wall) * e(9);
      const k = 1 - this.ads * 0.85;
      if (!reduced) {
        this.turn(AZ, -f.side * 0.06 * k);
        this.tilt.position.x -= f.side * 0.01 * k;
      }
      if (f.sprint > 0.001) {
        // (CS/CoD: lowered and canted in, the muzzle down and across)
        this.tilt.position.y -= 0.06 * f.sprint;
        this.tilt.position.x += 0.02 * f.sprint;
        this.turn(AY, 0.35 * f.sprint);
        this.turn(AX, -0.3 * f.sprint);
      }
      this.tilt.position.y -= f.land;
      if (f.wall > 0.001) {
        // (near a wall: drawn back toward me, the muzzle up — never through it)
        this.tilt.position.z += 0.14 * f.wall;
        this.tilt.position.y -= 0.03 * f.wall;
        this.turn(AX, 0.55 * f.wall);
      }
    }
    // a draw: up from below the frame, turned in, as it comes out
    const d = Math.min(1, (now - this.gunAt) / 1000 / 0.42);
    if (d < 1 && !reduced) {
      const k = (1 - d) * (1 - d);
      this.tilt.position.y -= 0.22 * k;
      this.tilt.position.x += 0.05 * k;
      this.turn(AX, -0.5 * k);
      this.turn(AZ, -0.3 * k);
    }
  }

  /** (plan 116) The view model turned `a` about `axis` (the eye's frame) round the gun's grip at the hip — not round
   *  the eyes, which swung a gun half a metre out of the picture. */
  private turn(axis: Vector3, a: number) {
    if (!a) return;
    const g = vmOf(this.gunKey);
    const pl = VM_PLACES[this.place];
    vPiv.set(g.hip.at[0] + pl[0], g.hip.at[1] + pl[1], g.hip.at[2] + pl[2]);
    vQ2.setFromAxisAngle(axis, a);
    this.tilt.position.sub(vPiv).applyQuaternion(vQ2).add(vPiv);
    this.tilt.quaternion.premultiply(vQ2);
  }

  // A gun out: it breathes — a slow figure-eight, wider winded, smaller crouched — and a shot kicks the arms back and the muzzle up (world/dark/arms.ts sets the kick).
  private sway(p: PersonIn, dt: number, reduced: boolean) {
    if (!this.doing.startsWith("gun") || reduced) return;
    this.breath += dt;
    const mv = p.mv ?? 0;
    const k = (mv & MV_WINDED ? 2.6 : 1) * (mv & 8 ? 0.6 : 1);
    const t = this.breath * 1.3;
    this.tilt.position.x += Math.sin(t) * 0.0035 * k;
    this.tilt.position.y += Math.sin(t * 2) * 0.0022 * k;
    const kick = this.person.gunFx?.kick ?? 0;
    if (kick > 0) {
      const shotgun = p.gun === "shotgun";
      this.tilt.position.z += kick * (shotgun ? 0.07 : 0.045);
      this.tilt.position.y += kick * (shotgun ? 0.012 : 0.02);
      this.tilt.rotateX(kick * (shotgun ? 0.07 : 0.09));
    }
  }

  /** Let go of the arms and what they hold. */
  dispose() {
    this.person.dispose();
    this.scene.clear();
  }
}
