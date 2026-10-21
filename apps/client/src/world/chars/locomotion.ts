import type { JumpNow } from "@yutopia/shared";
import { type Body, MOVE, type MoveSpec, speedOf, verbProgress } from "@yutopia/shared/move";
import { blend, ease, jumpPose, STRIDE, walkPose } from "./motion";
import {
  aimPose,
  BACK_STRIDE,
  backpedalPose,
  crouchPose,
  crouchWalkPose,
  landPose,
  type Moved,
  runPose,
  runStride,
  SNEAK_STRIDE,
  STRAFE_STRIDE,
  strafePose,
  torchPose,
  type Verb,
  verbPose,
} from "./moves";
import { type Euler3, type JointName, type Pose, REST } from "./rig";

// The body's locomotion (docs/plan/29-the-move.md, M6): one pose from what the
// movement core says the body is doing — standing, the walk into the jog into
// the run into the sprint by speed, crouching and sneaking, aiming over legs
// that step the way you go (ahead, aside, backing up), the jump's arc, a
// landing's squash by how hard it was, a verb; leaning into turns and speed.
// Each cycle's phase follows the ground covered, so the feet don't slide.

export interface LocoIn {
  /** tiles moved this frame */
  dist: number;
  speed: number;
  /** the velocity in the body's own frame: ahead, to its left (tiles / s) */
  ahead: number;
  left: number;
  crouch: boolean;
  aim: boolean;
  /** aiming: up (rad) and the look off the body's facing */
  pitch: number;
  /** a gun in the right hand (docs/plan/30-the-dark.md D6): both arms out */
  gun?: boolean;
  /** the torch on, a flashlight in the left hand: its forearm out ahead (aiming: aimPose's own) */
  torch?: boolean;
  yaw: number;
  /** the facing's turn, rad / s, and the speed's change, tiles / s² */
  turn: number;
  accel: number;
  up: boolean;
  jump: JumpNow | null;
  /** landed this frame: how hard (0..1) */
  landed?: number;
  verb: { kind: Verb; t: number } | null;
  reduced: boolean;
}

const UPPER: JointName[] = ["spine", "neck", "head", "shoulderL", "elbowL", "wristL", "shoulderR", "elbowR", "wristR"];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** `b` over `a` at weight w, the hips' lift too. */
function mix(a: Moved, b: Moved, w: number): Moved {
  if (w <= 0) return a;
  if (w >= 1) return b;
  return {
    pose: blend(a.pose, b.pose, w),
    lift: [lerp(a.lift[0], b.lift[0], w), lerp(a.lift[1], b.lift[1], w), lerp(a.lift[2], b.lift[2], w)],
  };
}
function add(p: Pose, j: JointName, dx: number, dy = 0, dz = 0) {
  const r = p[j] ?? [0, 0, 0];
  p[j] = [r[0] + dx, r[1] + dy, r[2] + dz] as Euler3;
}

export class Locomotion {
  private walkPh = 0;
  private runPh = 0;
  private sneakPh = 0;
  private sidePh = 0;
  private backPh = 0;
  private moveW = 0;
  private crouchW = 0;
  private aimW = 0;
  private torchW = 0;
  private backW = 0;
  private sideW = 0;
  private airW = 0;
  private landT = 1;
  private landK = 0;
  private lean = 0;
  private pitch = 0;
  private t = 0;
  private lastJump: JumpNow | null = null;
  // a verb's last pose, eased out of into whatever comes next
  private verbOut: Moved | null = null;
  private outT = 1;

  constructor(private spec: MoveSpec = MOVE) {}

  /** This frame's pose; `standing`: the pose they'd have standing still (Motion3's, with its
   *  breathing and glances), else a plain stand. */
  update(dt: number, m: LocoIn, standing?: Moved): Moved {
    const S = this.spec;
    this.t += dt;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    // the cycles, each by its own stride (the ground covered, so the feet stay put)
    const effort = clamp((m.speed - S.jog) / (S.sprint - S.jog), 0, 1);
    const d = m.dist;
    this.walkPh = (this.walkPh + d / STRIDE) % 1;
    this.runPh = (this.runPh + d / runStride(effort)) % 1;
    this.sneakPh = (this.sneakPh + d / SNEAK_STRIDE) % 1;
    this.sidePh = (this.sidePh + d / STRAFE_STRIDE) % 1;
    this.backPh = (this.backPh + d / BACK_STRIDE) % 1;
    this.moveW += (clamp(m.speed / 0.7, 0, 1) - this.moveW) * k(12);
    this.crouchW += ((m.crouch ? 1 : 0) - this.crouchW) * k(10);
    this.aimW += ((m.aim ? 1 : 0) - this.aimW) * k(14);
    this.torchW += ((m.torch && !m.aim ? 1 : 0) - this.torchW) * k(8);
    this.airW += ((m.up && !m.verb ? 1 : 0) - this.airW) * k(18);

    // a verb takes the whole body
    if (m.verb) {
      this.landT = 1;
      this.verbOut = verbPose(m.verb.kind, m.verb.t, m.reduced);
      this.outT = 0;
      return this.verbOut;
    }

    // ── on the feet: standing, or the gait by speed
    const breath = (this.t / 3.6) % 1;
    const still: Moved = standing ?? { pose: { ...REST }, lift: [0, 0, 0] };
    if (!standing) add(still.pose, "spine", 0.012 * Math.sin(breath * Math.PI * 2));
    let gaitPose: Moved;
    if (m.speed < S.walk + 0.4) gaitPose = walkPose(this.walkPh, 1) as Moved;
    else {
      const run = runPose(this.runPh, effort);
      const w = clamp((m.speed - (S.walk + 0.4)) / 1.2, 0, 1);
      gaitPose = mix(walkPose(this.walkPh, 1) as Moved, run, w);
    }
    // going aside or backing up (first person's A / D and S): the legs step that way
    const sp = Math.hypot(m.ahead, m.left);
    const backTo = sp > 0.3 ? clamp((-m.ahead / sp) * 1.4 - 0.3, 0, 1) : 0;
    const sideTo = sp > 0.3 ? clamp((Math.abs(m.left) / sp - 0.6) * 2.5, 0, 1) * (1 - backTo) : 0;
    this.backW += (backTo - this.backW) * k(10);
    this.sideW += (sideTo - this.sideW) * k(10);
    if (this.backW > 0.01) gaitPose = mix(gaitPose, backpedalPose(this.backPh), ease(this.backW));
    if (this.sideW > 0.01) gaitPose = mix(gaitPose, strafePose(this.sidePh, m.left > 0 ? 1 : -1), ease(this.sideW));
    let body = mix(still, gaitPose, ease(this.moveW));

    // crouched: the crouch, sneaking when moving
    if (this.crouchW > 0.01) {
      const low = mix(crouchPose(breath), crouchWalkPose(this.sneakPh), ease(this.moveW));
      body = mix(body, low, ease(this.crouchW));
    }

    // the torch on: the left forearm out ahead (over the arm's swing)
    if (this.torchW > 0.01) body = { pose: blend(body.pose, torchPose(breath), ease(this.torchW)), lift: body.lift };

    // aiming: the legs step the way the body goes (ahead, aside, backing up), the top aims
    if (this.aimW > 0.01) {
      const sp = Math.max(1e-6, Math.hypot(m.ahead, m.left));
      let legs: Moved;
      if (m.speed < 0.2) legs = aimPose(0, 0, false, breath);
      else if (-m.ahead > Math.abs(m.left) * 0.8) legs = backpedalPose(this.backPh);
      else if (Math.abs(m.left) > Math.abs(m.ahead)) legs = strafePose(this.sidePh, m.left > 0 ? 1 : -1);
      else legs = walkPose(this.walkPh, 0.85) as Moved;
      legs = mix(aimPose(0, 0, false, breath), legs, ease(clamp(sp / 0.7, 0, 1)));
      this.pitch += (m.pitch - this.pitch) * k(16);
      const top = aimPose(this.pitch, m.yaw, !!m.gun, breath);
      const both: Moved = { pose: { ...legs.pose }, lift: legs.lift };
      for (const j of UPPER) if (top.pose[j]) both.pose[j] = top.pose[j];
      body = mix(body, both, ease(this.aimW));
    }

    // ── in the air: the jump's own arc (a sprint's flip turns over), or falling
    const jump = m.jump ?? (m.up ? this.lastJump : null);
    if (m.jump) this.lastJump = m.jump;
    if (!m.up && !m.jump) this.lastJump = null;
    if (jump) {
      const j = jumpPose(jump, !m.reduced);
      if (j.w > 0)
        body = {
          pose: blend(body.pose, j.pose, j.w),
          lift: [body.lift[0], lerp(body.lift[1], j.lift[1], j.w), body.lift[2]],
        };
    } else if (this.airW > 0.01) {
      // off an edge: the legs reaching down, the arms out
      const fall = landPose(0.15);
      add(fall.pose, "shoulderL", -0.3, 0, 0.5);
      add(fall.pose, "shoulderR", -0.3, 0, -0.5);
      body = mix(body, { pose: fall.pose, lift: [0, 0, 0] }, ease(this.airW) * 0.8);
    }

    // ── landing: a squash by how hard it was, gone in a moment
    if (m.landed !== undefined && m.landed > 0.04) {
      this.landT = 0;
      this.landK = m.landed;
    }
    if (this.landT < 1) {
      this.landT = Math.min(1, this.landT + dt / (0.18 + 0.22 * this.landK));
      const w = this.landK * (1 - ease(this.landT)) * (this.landT < 0.15 ? ease(this.landT / 0.15) : 1);
      body = mix(body, landPose(this.landK), clamp(w * 1.3, 0, 1));
    }

    // ── out of a verb: from its last pose into this one
    if (this.verbOut && this.outT < 1) {
      this.outT = Math.min(1, this.outT + dt / 0.2);
      body = mix(this.verbOut, body, ease(this.outT));
      if (this.outT >= 1) this.verbOut = null;
    }

    // ── leaning: into a turn (by how fast it turns at speed), forward speeding up, back slowing
    if (!m.reduced) {
      const bank = clamp(-m.turn * m.speed * 0.012, -0.22, 0.22);
      this.lean += (bank - this.lean) * k(8);
      const pitchLean = clamp(m.accel * 0.012, -0.12, 0.14) * (1 - this.aimW);
      add(body.pose, "spine", pitchLean, 0, this.lean);
      add(body.pose, "head", -pitchLean * 0.6, 0, -this.lean * 0.6);
      add(body.pose, "hips", 0, 0, this.lean * 0.5);
    }
    return body;
  }
}

/** The jump's stage for the pose, from the body: the crouch while taking off, then the arc by
 *  how far its rise has turned into a fall. */
export function jumpNowOf(b: Body, spec: MoveSpec = MOVE): JumpNow | null {
  if (b.takeoff >= 0 && b.jump) return { kind: b.jump, stage: "crouch", k: clamp(1 - b.takeoff / spec.takeoff, 0, 1) };
  if (!b.up || !b.jump) return null;
  const v0 = Math.sqrt(2 * spec.g * (b.jump === "flip" ? spec.flip : spec.hop));
  return { kind: b.jump, stage: "air", k: clamp((v0 - b.vz) / (2 * v0), 0, 0.95) };
}

/** How far through its verb a body is, for the pose (0..1): a slide's middle lasts as long as
 *  it slides (by the speed it has lost), its getting up is eased out of by `Locomotion`. */
export function verbT(b: Body, spec: MoveSpec = MOVE): number {
  return b.verb ? verbProgress(b.verb, spec) : 0;
}

/** A body's velocity in its own frame (ahead, to its left), for `LocoIn`. */
export function localVel(b: Body): { ahead: number; left: number; speed: number } {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  // the floor's y is south: the body's left is its facing turned the other way round
  return { ahead: b.vx * c + b.vy * s, left: b.vx * s - b.vy * c, speed: speedOf(b) };
}
