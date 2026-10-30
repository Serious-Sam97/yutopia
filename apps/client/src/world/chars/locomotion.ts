import type { JumpNow } from "@yutopia/shared";
import { type Body, type FlowLook, KH_MOVE, type MoveSpec, speedOf, verbProgress } from "@yutopia/shared/move";
import { blend, ease, jumpPose, STRIDE, walkPose } from "./motion";
import {
  aimPose,
  BACK_STRIDE,
  backpedalPose,
  crouchPose,
  crouchWalkPose,
  flowPose,
  landPose,
  type Moved,
  reloadPose,
  runPose,
  runStride,
  SNEAK_STRIDE,
  STRAFE_STRIDE,
  smoother,
  spinPose,
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
  /** reloading the gun, not aiming (docs/plan/32-the-arms.md): it's brought up before the chest */
  reload?: boolean;
  yaw: number;
  /** the facing's turn, rad / s, and the speed's change, tiles / s² */
  turn: number;
  accel: number;
  up: boolean;
  jump: JumpNow | null;
  /** landed this frame: how hard (0..1) */
  landed?: number;
  verb: { kind: Verb; t: number } | null;
  /** a Flowmotion move (docs/plan/56-the-controls.md F): its own body, over everything; a flow
   *  jump's spin (shared move/flow.ts FlowLook), over the jump's arc */
  flow?: FlowLook | null;
  /** plan 58 G.D: someone or something looked at, from the facing: yaw + to the left, pitch + up */
  look?: { yaw: number; pitch: number } | null;
  reduced: boolean;
}

const UPPER: JointName[] = [
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "elbowL",
  "wristL",
  "shoulderR",
  "elbowR",
  "wristR",
];
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

// plan 58's animations (chars/anim/hero.ts): their own chunk, loaded the first time a body asks
// for them; till they're in, the old ones
type Hero = typeof import("./anim/hero");
let hero: Hero | null = null;
let heroLoading: Promise<Hero> | null = null;
export function loadHero(): Promise<Hero> {
  heroLoading ??= import("./anim/hero").then((m) => {
    hero = m;
    return m;
  });
  return heroLoading;
}
/** …if they're in (null while they load, or never asked for). */
export const heroNow = (): Hero | null => hero;

// plan 58: follow-through — the upper body comes after the move (each joint a damped spring onto
// its keyed pose: a hair late, a touch past, settling), so nothing snaps from pose to pose like a
// robot. Stiffer near the trunk, looser out to the hands. The legs and the hips stay exact (the
// feet planted, a flip's turn).
const FOLLOW: [JointName, number][] = [
  ["spine", 40],
  ["chest", 36],
  ["neck", 32],
  ["head", 26],
  ["shoulderL", 36],
  ["shoulderR", 36],
  ["elbowL", 30],
  ["elbowR", 30],
  ["wristL", 22],
  ["wristR", 22],
];
const DAMP = 0.7;
class FollowThrough {
  private x = new Map<JointName, number[]>();
  private v = new Map<JointName, number[]>();
  apply(src: Pose, dt: number): Pose {
    const p: Pose = { ...src };
    const h = Math.min(Math.max(dt, 0), 1 / 30);
    for (const [j, w] of FOLLOW) {
      const tgt = p[j] ?? [0, 0, 0];
      const x = this.x.get(j);
      const v = this.v.get(j);
      if (!x || !v) {
        this.x.set(j, [tgt[0], tgt[1], tgt[2]]);
        this.v.set(j, [0, 0, 0]);
        continue;
      }
      const n = Math.max(1, Math.ceil((h * w) / 0.4));
      const s = h / n;
      for (let i = 0; i < 3; i++) {
        // (a long way off — a teleport, a pose far from the last: there at once)
        if (Math.abs(tgt[i] - x[i]) > 1.6) {
          x[i] = tgt[i];
          v[i] = 0;
          continue;
        }
        for (let k = 0; k < n; k++) {
          v[i] += (w * w * (tgt[i] - x[i]) - 2 * DAMP * w * v[i]) * s;
          x[i] += v[i] * s;
        }
      }
      p[j] = [x[0], x[1], x[2]];
    }
    return p;
  }
}

// plan 58 G.E: a slow wander, the same for a seed — three sines that never line up
const wander = (t: number, s: number) =>
  (Math.sin(t * 0.73 + s * 5.1) + 0.6 * Math.sin(t * 1.37 + s * 2.3) + 0.35 * Math.sin(t * 2.91 + s * 7.7)) / 1.95;
const seeded = (n: number, s: number) => {
  const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

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
  private reloadW = 0;
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
  // a Flowmotion move's: the pose it came from, eased out of into it
  private flowFrom: Moved | null = null;
  private flowT = 1;
  private last: Moved | null = null;

  /** plan 58's animations (docs/plan/58-the-animation.md, phase 0): the new walk, run and jump,
   *  beside the old till they're signed off; `tension` the mood (0 day … 1 the dark) */
  v2 = false;
  tension = 0;
  // plan 58 G (the feel): one phase for the walk and the run (they meet on the same foot); the
  // trunk's inertia (a pitch and a roll, each a spring); a skid; a stop's settle; steps turning
  // in place
  private gaitPh = 0;
  private inert = { p: 0, pv: 0, r: 0, rv: 0 };
  private leadY = 0;
  private skidW = 0;
  private driveW = 0;
  private turnSide = 1;
  private skidFrom = 0;
  private moving = false;
  private turnPh = 0;
  private turnW = 0;
  /** plan 58 G.E: whose body this is (their quirks: one arm swinging more, a head carried on one
   *  side, a stride a little long or short) */
  seed = 0;
  private walked = 0;
  private quirk(n: number, span: number) {
    return (seeded(n, this.seed) - 0.5) * 2 * span;
  }

  constructor(private spec: MoveSpec = KH_MOVE) {}

  private follow = new FollowThrough();
  // (3b: the breath's place in its cycle, and how winded — up as she sprints, back down over a
  // quarter of a minute's rest)
  private breath = 0;
  private puff = 0;
  /** The breath for the standing pose (`idle2Pose`'s `life`). */
  life(): { breath: number; puff: number } {
    return { breath: this.breath, puff: this.puff };
  }

  /** This frame's pose; `standing`: the pose they'd have standing still (Motion3's, with its
   *  breathing and glances), else a plain stand. */
  update(dt: number, m: LocoIn, standing?: Moved): Moved {
    if (this.v2 && !hero) void loadHero();
    const out = this.compose(dt, m, standing);
    if (!this.v2 || !hero || m.reduced) {
      this.gazeOut = null;
      return out;
    }
    const pose = this.follow.apply(out.pose, dt);
    // the gaze (G.D): the eyes leading, the head after them — laid on after the follow-through,
    // its own spring the head's
    this.gaze ??= new hero.Gaze(this.seed);
    const ahead = m.up ? 0 : Math.max(-0.6, Math.min(0.6, -m.turn * 0.25)) * Math.min(1, m.speed / 2);
    const idle = this.moveW < 0.5 ? hero.idleGlance(this.t, this.tension, this.seed) : 0;
    const g = this.gaze.update(dt, { target: m.look ?? null, idle, ahead, tension: this.tension });
    add(pose, "head", -g.headPitch, g.head, 0);
    add(pose, "neck", 0, g.neck, 0);
    add(pose, "chest", 0, g.chest, 0);
    this.gazeOut = g;
    // the last layer (plan 58 phase 2e): a foot the pose has down stays where it landed, whatever the
    // layers above did — let go of in the air, a verb or a Flowmotion move
    this.lock ??= new hero.FootLock();
    const moved = { ahead: m.ahead * dt, left: m.left * dt, yaw: -m.turn * dt };
    return this.lock.apply({ pose, lift: out.lift }, dt, moved, m.up || !!m.verb || !!m.flow, this.base);
  }

  private lock: InstanceType<Hero["FootLock"]> | null = null;
  private base: { L: [number, number, number]; R: [number, number, number] } | null = null;
  private gaze: InstanceType<Hero["Gaze"]> | null = null;
  /** plan 58 G.D: this frame's gaze — the eyes' morphs and a blink (null: none) */
  gazeOut: { eyes: [number, number]; blink: number } | null = null;

  private compose(dt: number, m: LocoIn, standing?: Moved): Moved {
    // (plan 58's, when they're on and in)
    const H = this.v2 ? hero : null;
    const S = this.spec;
    this.t += dt;
    // the breath: quicker in the dark, and winded after a run (a sprint most)
    const hard = clamp((m.speed - S.jog * 0.9) / (S.sprint - S.jog * 0.9), 0, 1);
    this.puff = clamp(this.puff + (hard > 0.05 ? 0.12 * hard : -0.07) * dt, 0, 1);
    this.breath = (this.breath + (dt * (1 + 1.6 * this.puff)) / lerp(4.2, 2.6, clamp(this.tension, 0, 1))) % 1;
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
    this.reloadW += ((m.reload && !m.aim ? 1 : 0) - this.reloadW) * k(10);
    this.airW += ((m.up && !m.verb ? 1 : 0) - this.airW) * k(18);

    // a Flowmotion move takes the whole body, eased into from whatever it was
    const spin = m.flow?.kind === "spin" ? m.flow.t : null;
    if (m.flow && m.flow.kind !== "spin") {
      if (!this.flowFrom) {
        this.flowFrom = this.last;
        this.flowT = 0;
      }
      // (onto a pole or along a wall the body turns over a long way: eased in slower)
      const into = m.flow.kind === "swing" || m.flow.kind === "wallside" ? 0.16 : 0.09;
      this.flowT = Math.min(1, this.flowT + dt / into);
      const f = flowPose({ ...m.flow, kind: m.flow.kind });
      const out = this.flowFrom && this.flowT < 1 ? mix(this.flowFrom, f, ease(this.flowT)) : f;
      this.landT = 1;
      this.lastJump = null;
      this.verbOut = out;
      this.outT = 0;
      this.last = out;
      return out;
    }
    this.flowFrom = null;
    // a verb takes the whole body
    if (m.verb) {
      this.landT = 1;
      this.verbOut = H && m.verb.kind === "slide" ? H.slide2Pose(m.verb.t) : verbPose(m.verb.kind, m.verb.t, m.reduced);
      this.outT = 0;
      this.last = this.verbOut;
      return this.verbOut;
    }

    // ── on the feet: standing, or the gait by speed
    const breath = (this.t / 3.6) % 1;
    const still: Moved = standing ?? { pose: { ...REST }, lift: [0, 0, 0] };
    if (!standing) add(still.pose, "spine", 0.012 * Math.sin(breath * Math.PI * 2));
    let gaitPose: Moved;
    const T = this.tension;
    const runW = clamp((m.speed - (S.walk + 0.4)) / 1.2, 0, 1);
    // (plan 58: the walk and the run on one phase, its stride between theirs — no foot jumps
    // from one cycle's place to the other's as the speed goes through)
    // (plan 58 G.B: driving up to speed, short quick steps — the stride shorter, the effort more;
    // coming to a stop, the stride finishes on both feet, not frozen mid-step)
    const drive = H && m.accel > 3 && m.speed < S.jog * 1.1 ? clamp(m.accel / 30, 0, 1) : 0;
    this.driveW += (drive - this.driveW) * k(drive > this.driveW ? 20 : 6);
    // (G.E: each stride its own — a few percent longer or shorter by a slow wander over the ground
    // covered — and each person's own a little long or short; the walk's: the run's feet are
    // planted by its stride, and a stride that isn't the one they're keyed to slides them)
    this.walked += d;
    const vary = H ? 1 + (this.quirk(3, 0.03) + 0.035 * wander(this.walked * 0.55, this.seed)) * (1 - runW) : 1;
    const strideNow =
      lerp(H ? H.walk2Stride(T) : 1, H ? H.run2Stride(effort) : runStride(effort), runW) *
      (1 - 0.35 * this.driveW) *
      vary;
    if (H) {
      this.gaitPh = (this.gaitPh + d / strideNow) % 1;
      // (slowing to a stop, or as the stride fades out: onto both feet, quickly — no foot left up
      // in the air once she's stood)
      const settling = (m.accel < -3 && m.speed < S.walk + 0.4) || (m.speed < 1.2 && this.moveW < 0.95);
      if (settling && this.moveW > 0.02) {
        const both = Math.round(this.gaitPh * 2) / 2;
        this.gaitPh = (this.gaitPh + (both - this.gaitPh) * k(18) + 1) % 1;
      }
    }
    const walkNow = (): Moved => (H ? H.walk2Pose(this.gaitPh, T) : (walkPose(this.walkPh, 1) as Moved));
    if (m.speed < S.walk + 0.4) gaitPose = walkNow();
    else {
      const pump = clamp(effort + 0.6 * this.driveW + 0.06 * wander(this.walked * 0.4, this.seed + 2), 0, 1);
      const run = H ? H.run2Pose(this.gaitPh, pump, T, effort) : runPose(this.runPh, effort);
      gaitPose = mix(walkNow(), run, runW);
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

    if (H && !m.up) {
      // turning on the spot: the feet step round with it (two steps a half turn), not a turntable
      const spinning = m.speed < 0.8 && Math.abs(m.turn) > 1.2;
      if (spinning) {
        // (a turn begun from standing starts on both feet: not wherever the last one's step was)
        if (this.turnW < 0.02) this.turnPh = 0;
        this.turnPh = (this.turnPh + (Math.abs(m.turn) * dt) / Math.PI) % 1;
        this.turnSide = m.turn > 0 ? -1 : 1;
      }
      // (in over 0.15 s and out over 0.25, eased at both ends: it snapped in over 30 ms, a pop)
      this.turnW = clamp(this.turnW + (spinning ? dt / 0.15 : -dt / 0.25), 0, 1);
      if (this.turnW > 0.001) body = mix(body, H.turnStepPose(this.turnPh, this.turnSide), 0.85 * smoother(this.turnW));
      // slowing hard from speed: a skid
      // (begun braking from speed, held till nearly stopped: a sprint's stop skids all the way, a
      // run's a little)
      if (!this.skidFrom && -m.accel > 6 && m.speed > 4) this.skidFrom = m.speed;
      if (this.skidFrom && (m.speed < 0.8 || m.accel > 2)) this.skidFrom = 0;
      const skidTo = this.skidFrom ? clamp((this.skidFrom - 3) / (S.sprint - 3), 0, 1) : 0;
      this.skidW += (skidTo - this.skidW) * k(skidTo > this.skidW ? 16 : 6);
      if (this.skidW > 0.01) body = mix(body, H.skid2Pose(this.skidW, this.t), ease(this.skidW));
      // come to a stop from a run: the weight settles (a small give in the knees)
      if (m.speed > 2.5) this.moving = true;
      else if (this.moving && m.speed < 0.6) {
        this.moving = false;
        this.landT = 0;
        this.landK = 0.22;
      }
    }

    // crouched: the crouch, sneaking when moving
    if (this.crouchW > 0.01) {
      const low = mix(crouchPose(breath), crouchWalkPose(this.sneakPh), ease(this.moveW));
      body = mix(body, low, ease(this.crouchW));
    }

    // the torch on: the left forearm out ahead (over the arm's swing)
    if (this.torchW > 0.01) body = { pose: blend(body.pose, torchPose(breath), ease(this.torchW)), lift: body.lift };
    // reloading: the gun up before the chest, both hands at it
    if (this.reloadW > 0.01) body = { pose: blend(body.pose, reloadPose(breath), ease(this.reloadW)), lift: body.lift };

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
    if (spin !== null && m.up) {
      body = spinPose(spin, m.reduced);
    } else if (jump) {
      const j = H ? H.jump2Pose(jump, !m.reduced) : jumpPose(jump, !m.reduced);
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

    // ── in the dark (plan 58): on the move, the head checks round now and then
    if (H && this.tension > 0 && !m.reduced && this.moveW > 0.1) {
      const scan = Math.sin(this.t * 0.9) * Math.max(0, Math.sin(this.t * 0.37 + 1));
      add(body.pose, "head", 0, 0.4 * this.tension * scan * ease(this.moveW));
      add(body.pose, "neck", 0, 0.15 * this.tension * scan * ease(this.moveW));
    }

    // (plan 58 phase 2e: where the base has the feet — the cycle, its transitions — before the layers
    // lean and twist the body: the foot lock takes them on the ground from here, and keeps them there)
    this.base = H && !m.up && !m.verb ? { L: H.ankleOf(body, "L").at, R: H.ankleOf(body, "R").at } : null;

    // ── plan 58 G.E: whose it is, and never twice the same — one arm swinging more than the other,
    // each stride's swing its own; the head carried a little to one side; a slow wander through the
    // head and the chest, moving or not
    if (H && !m.reduced) {
      const swing = ease(this.moveW);
      const n = 0.07 * wander(this.walked * 0.5, this.seed + 4) * swing;
      const bias = this.quirk(5, 0.12) * swing;
      const sL = body.pose.shoulderL;
      const sR = body.pose.shoulderR;
      if (sL) body.pose.shoulderL = [sL[0] * (1 + bias + n), sL[1], sL[2]];
      if (sR) body.pose.shoulderR = [sR[0] * (1 - bias + n), sR[1], sR[2]];
      const nod = 0.012 * wander(this.t * 0.9, this.seed + 6);
      add(body.pose, "head", nod, 0.015 * wander(this.t * 0.7, this.seed + 7), this.quirk(6, 0.05));
      add(body.pose, "spine", 0, 0.01 * wander(this.t * 0.6, this.seed + 8), 0);
    }

    // ── plan 58: the trunk's inertia — leant forward driving up to speed, back braking, each a
    // spring that overshoots and settles; leant into a turn, the head held level against both.
    // Taken at the hips, the legs keeping their way (the waist opens at a spine's bend).
    if (H && !m.reduced) {
      const I = this.inert;
      const pTo = m.up ? 0 : clamp(m.accel * 0.011, -0.2, 0.18);
      // (the turn: + to the right — the floor's y is south — leant into it)
      const rTo = m.up ? 0 : clamp(m.turn * m.speed * 0.011, -0.28, 0.28);
      const h = Math.min(dt, 1 / 30) / 2;
      for (let n = 0; n < 2; n++) {
        I.pv += (100 * (pTo - I.p) - 2 * 0.45 * 10 * I.pv) * h;
        I.p += I.pv * h;
        I.rv += (64 * (rTo - I.r) - 2 * 0.55 * 8 * I.rv) * h;
        I.r += I.rv * h;
      }
      add(body.pose, "hips", I.p, 0, I.r);
      add(body.pose, "thighL", -I.p, 0, -I.r);
      add(body.pose, "thighR", -I.p, 0, -I.r);
      add(body.pose, "head", -0.5 * I.p, 0, -0.6 * I.r);
      add(body.pose, "neck", 0, 0, -0.2 * I.r);
      // the arms carried by it: forward braking, back driving; the outer arm out on a turn
      add(body.pose, "shoulderL", 0.9 * I.p, 0, 0.9 * Math.max(0, I.r));
      add(body.pose, "shoulderR", 0.9 * I.p, 0, 0.9 * Math.min(0, I.r));
      // the chest and the head lead a turn: they look round it before the hips have gone
      // (a turn to the right: the head turns to the right, its −y)
      const lead = clamp(-m.turn * 0.045, -0.3, 0.3) * clamp(m.speed / 2, 0.3, 1);
      this.leadY += (lead - this.leadY) * k(10);
      // (the head and neck: the gaze's, leading into the turn — G.D)
      add(body.pose, "chest", 0, this.leadY * 0.5, 0);
    }
    // ── leaning: into a turn (by how fast it turns at speed), forward speeding up, back slowing
    if (!m.reduced && !H) {
      // (into the turn: + is to the right, the floor's y being south — it leant out of it till plan 58)
      const bank = clamp(m.turn * m.speed * 0.012, -0.22, 0.22);
      this.lean += (bank - this.lean) * k(8);
      const pitchLean = clamp(m.accel * 0.012, -0.12, 0.14) * (1 - this.aimW);
      add(body.pose, "spine", pitchLean, 0, this.lean);
      add(body.pose, "head", -pitchLean * 0.6, 0, -this.lean * 0.6);
      add(body.pose, "hips", 0, 0, this.lean * 0.5);
    }
    this.last = body;
    return body;
  }
}

/** The jump's stage for the pose, from the body: the crouch while taking off, then the arc by
 *  how far its rise has turned into a fall. */
export function jumpNowOf(b: Body, spec: MoveSpec = KH_MOVE): JumpNow | null {
  if (b.takeoff >= 0 && b.jump) return { kind: b.jump, stage: "crouch", k: clamp(1 - b.takeoff / spec.takeoff, 0, 1) };
  if (!b.up || !b.jump) return null;
  const v0 = Math.sqrt(2 * spec.g * (b.jump === "hop" ? spec.hop : spec.flip));
  return { kind: b.jump, stage: "air", k: clamp((v0 - b.vz) / (2 * v0), 0, 0.95) };
}

/** How far through its verb a body is, for the pose (0..1): a slide's middle lasts as long as
 *  it slides (by the speed it has lost), its getting up is eased out of by `Locomotion`. */
export function verbT(b: Body, spec: MoveSpec = KH_MOVE): number {
  return b.verb ? verbProgress(b.verb, spec) : 0;
}

/** A body's velocity in its own frame (ahead, to its left), for `LocoIn`. */
export function localVel(b: Body): { ahead: number; left: number; speed: number } {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  // the floor's y is south: the body's left is its facing turned the other way round
  return { ahead: b.vx * c + b.vy * s, left: b.vx * s - b.vy * c, speed: speedOf(b) };
}
