import { isHeld } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { Group, PerspectiveCamera as Lens, type PerspectiveCamera, Quaternion, Scene, Vector3 } from "three";
import type { chars } from "../art/chars-load";
import type { PersonIn } from "./people3d";
import { type Mats, Person3D } from "./person3d";

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

const FOV = 62; // the hands' own lens: they look the same whatever the room's zoom
const SHOW_IN = 0.22; // s: coming up into view / going down out of it
const DROP = 0.5; // m: how far below the eyes they go when there's nothing to do
const LAG = 18; // how quickly they catch up with a mouse-look turn (1/s)
const LAG_MAX = 0.14; // rad: at most this far behind
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
  torch: [0.36, 0.06, 0.3, 0.04], // (held low: raised into view)
  "torch:aim": [0.3, 0.04, 0.14, 0.02], // (raised along the look: the forearm at the bottom, as it was)
};
const FRAME_ANY: Frame = [0.42, 0.06, 0.14, 0];
// emotes that use the arms (laugh, coffee and tape are the face's or the body's)
const ARM_EMOTES = new Set(["wave", "heart", "clap", "fire", "question"]);

/** What my hands are busy with right now ("" = nothing: they stay out of view). */
export function handsDoing(
  p: Pick<PersonIn, "phone" | "held" | "heldAt" | "typing" | "a" | "busy" | "act" | "emote" | "gun" | "torch" | "mv">,
): string {
  if (p.phone) return p.phone === "photo" || p.phone === "selfie" ? "" : p.phone;
  if (isHeld(p.held) && p.heldAt) return p.held === "mug" || p.held === "cup" || p.held === "soda" ? "drink" : "toy";
  if (p.typing && p.a === 2) return "type";
  if (p.busy) return p.busy === "throw" ? "throw" : "use";
  if (p.act) return `act:${p.act}`;
  if (p.emote && ARM_EMOTES.has(p.emote)) return `emote:${p.emote}`;
  if (p.gun) return "gun";
  if (p.torch) return (p.mv ?? 0) & 16 ? "torch:aim" : "torch";
  return "";
}

const eye = new Vector3();
const want = new Quaternion();

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
  private last: { x: number; y: number } | null = null;
  private lagReady = false;

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

  /** Anything to draw this frame. */
  get shown(): boolean {
    return this.vis > 0.001 && this.person.ready;
  }
  get avatar() {
    return this.person.model.avatar;
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
    const doing = off || !mo ? "" : handsDoing(p);
    this.now = doing;
    if (doing) this.doing = doing;
    const reduced = !!p.reduced;
    const target = doing ? 1 : 0;
    this.vis = reduced ? target : Math.max(0, Math.min(1, this.vis + ((target ? 1 : -1) * dt) / SHOW_IN));
    // the lens: where the room's camera is, its own field of view
    this.camera.position.copy(cam.position);
    this.camera.quaternion.copy(cam.quaternion);
    if (this.camera.aspect !== cam.aspect) {
      this.camera.aspect = cam.aspect;
      this.camera.updateProjectionMatrix();
    }
    if (!this.shown && !doing) {
      this.lagReady = false;
      this.last = null;
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
    root.rotation.set(0, Math.PI - ((p.mv ?? 0) & 16 ? AIM_BLADE * 0.65 : 0), 0);

    // posed by my body's motion (what they hold stays upright to this frame's framing)
    this.person.update(p, dt, { camX: p.x, camZ: p.y, onScreen: true, lowQuality: low }, mo);

    // the eyes on the pivot
    root.position.set(0, 0, 0);
    root.updateMatrix();
    this.person.model.eyePosition(eye).applyMatrix4(root.matrix);
    root.position.copy(eye).negate();

    // walking: a little bob; coming and going: up from below
    let dist = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y) : 0;
    if (dist > 1.5) dist = 0;
    this.last = { x: p.x, y: p.y };
    this.phase += (dist / 1.2) * Math.PI * 2;
    this.bobW += ((p.a === 1 && !reduced ? 1 : 0) - this.bobW) * (1 - Math.exp(-dt * 6));
    const ease = this.vis * this.vis * (3 - 2 * this.vis);
    this.tilt.position.set(
      this.frame[3] + Math.sin(this.phase) * BOB[0] * this.bobW,
      this.frame[2] - Math.abs(Math.sin(this.phase)) * BOB[1] * this.bobW - (1 - ease) * DROP,
      -this.frame[1],
    );
  }

  /** Let go of the arms and what they hold. */
  dispose() {
    this.person.dispose();
    this.scene.clear();
  }
}
