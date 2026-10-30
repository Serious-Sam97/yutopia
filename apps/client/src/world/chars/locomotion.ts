import type { JumpNow } from "@yutopia/shared";
import { type Body, type FlowLook, KH_MOVE, type MoveSpec, speedOf, verbProgress } from "@yutopia/shared/move";
import { blend, ease, jumpPose, STRIDE, walkPose } from "./motion";
import {
  ANKLE,
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
  /** (plan 58 7) a shot's kick, 0..1 as it goes off and fades: the arms thrown up */
  kick?: number;
  /** (plan 58 7) struck — or startled, a small `k` — from `from` (rad off the facing: 0 ahead, + to
   *  the left), `t` s ago */
  hit?: { from: number; t: number; k: number } | null;
  /** (plan 58 9) how cold (0..1: the warmth's, `coldOf`) and how spent (0..1: the stamina's, `spentOf`) */
  cold?: number;
  spent?: number;
  /** (plan 58 9) a sound heard, `t` s ago, from there (off the facing: + left, + up); `loud`: close and
   *  sharp — a flinch */
  heard?: { yaw: number; pitch: number; t: number; loud?: boolean } | null;
  yaw: number;
  /** the facing's turn, rad / s, and the speed's change, tiles / s² */
  turn: number;
  accel: number;
  up: boolean;
  jump: JumpNow | null;
  /** landed this frame: how hard (0..1) */
  landed?: number;
  /** (5b: and what it's over — the core's probe: the top, where it met it and ended, how far) */
  verb: { kind: Verb; t: number; h?: number; near?: number; far?: number; dist?: number } | null;
  /** a Flowmotion move (docs/plan/56-the-controls.md F): its own body, over everything; a flow
   *  jump's spin (shared move/flow.ts FlowLook), over the jump's arc */
  flow?: FlowLook | null;
  /** plan 58 G.D: someone or something looked at, from the facing: yaw + to the left, pitch + up */
  look?: { yaw: number; pitch: number } | null;
  /** 4c: the speed the body's going for (its gait's, tiles / s): a first step out keyed by it */
  goal?: number;
  /** 4d: how hurt (0…1: the vitals' health gone): a limp */
  hurt?: number;
  /** 4f: the ground's height (m, + up) at a spot in the body's own space (x to its left, z ahead),
   *  from the ground under it — the land, a kerb, a stair, by Jolt's rays */
  ground?: (x: number, z: number) => number;
  /** 4d: the body faces the look, not the way it goes (first person, lock-on, aiming): it goes aside
   *  and backs up — else it faces its way, and a moment's velocity off it (turning round) isn't */
  facing?: boolean;
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
// (phase 5's — getting over things, the hands placed, the ragdoll — in a chunk of their own beside it)
type Air = typeof import("./anim/air");
let air: Air | null = null;
// (phase 6's — sitting, the hands, busy, together, the emotes — another; phase 7's, the dark, another)
type Acts = typeof import("./anim/acts");
let acts: Acts | null = null;
type Night = typeof import("./anim/night");
let night: Night | null = null;
// (phase 9's: life — the cold, the breath caught, who she is, a sound's turn)
type LifeM = typeof import("./anim/life");
let lifeM: LifeM | null = null;
export function loadHero(): Promise<Hero> {
  heroLoading ??= Promise.all([
    import("./anim/hero"),
    import("./anim/air"),
    import("./anim/acts"),
    import("./anim/night"),
    import("./anim/life"),
  ]).then(([m, a, b, n, l]) => {
    hero = m;
    air = a;
    acts = b;
    night = n;
    lifeM = l;
    return m;
  });
  return heroLoading;
}
/** Phase 5's, once in. */
export const airNow = (): Air | null => air;
/** Phase 6's, once in. */
export const actsNow = (): Acts | null => acts;
/** Phase 7's, once in. */
export const nightNow = (): Night | null => night;
/** Phase 9's, once in. */
export const lifeNow = (): LifeM | null => lifeM;
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
  private skidFrom = 0;
  private moving = false;
  // 4c: the stepper — standing, stopping, setting off and turning round, by steps (hero.ts `Stepper`):
  // `idle` the standing pose has the feet, `steps` the stepper, `start` its first step out then the
  // cycle on that foot, `cycle` the gait; `stepW` how much the stepper's legs are laid on
  private steps: InstanceType<Hero["Stepper"]> | null = null;
  private stepping: "idle" | "steps" | "start" | "cycle" | "off" = "idle";
  private stepW = 0;
  private lead: "L" | "R" = "R";
  private still = 0;
  private vWas = 0;
  private ownStep = false;
  /** 4d: the way it goes off its facing (rad, + to the left) */
  private way = 0;
  /** down from a jump: its kind, and how far through its landing (0..1) */
  private landOf: { kind: string; t: number } | null = null;
  /** (5a) in the air: how long, how high over the ground, how fast that's changing, the top of it */
  private fallT = 0;
  /** (5a) how long since she was last up: a landing's check in the speed isn't a stop */
  private upAgo = 9;
  private hAir: number | null = null;
  private vzG = 0;
  private fallTop = 0;
  /** down from a fall: how, and how long since */
  private downFrom: { kind: string; t: number } | null = null;
  // (a jump from the run: up off the stride, the air's pose eased in)
  private fromRun = false;
  /** where the feet were last shown (the model's space) */
  private shown: { L: [number, number, number]; R: [number, number, number] } | null = null;
  private airT = 0;
  /** 4d: the gait at a phase and speed as it is now (the stepper's first step aims at it) */
  private gaitAt: ((ph: number, spd: number) => Moved) | null = null;
  private aNow = 0;
  private handT = 0.12;
  /** plan 58 G.E: whose body this is (their quirks: one arm swinging more, a head carried on one
   *  side, a stride a little long or short) */
  seed = 0;
  /** 4e: how they walk — their look's (`AvatarLayers.gait`) */
  gait = "calm";
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
  life(): { breath: number; puff: number; gait: string } {
    return { breath: this.breath, puff: this.puff, gait: this.gait };
  }

  /** This frame's pose; `standing`: the pose they'd have standing still (Motion3's, with its
   *  breathing and glances), else a plain stand. */
  update(dt: number, m: LocoIn, standing?: Moved): Moved {
    if (this.v2 && !hero) void loadHero();
    this.upAgo = m.up ? 0 : this.upAgo + dt;
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
    // (the idle's glances held off while her eyes are on her own hands: 9)
    const idle = this.moveW < 0.5 ? hero.idleGlance(this.t, this.tension, this.seed) * (1 - this.eyesDown) : 0;
    // (9: a sound heard turns the eyes and the head to it a while, over whoever's looked at)
    const heard = m.heard && m.heard.t < 2.2 ? { yaw: m.heard.yaw, pitch: m.heard.pitch } : null;
    // (7: the torch's beam is where the eyes are, when nothing else has them)
    const g = this.gaze.update(dt, { target: heard ?? m.look ?? this.torchLook, idle, ahead, tension: this.tension });
    add(pose, "head", -g.headPitch, g.head, 0);
    add(pose, "neck", 0, g.neck, 0);
    add(pose, "chest", 0, g.chest, 0);
    this.gazeOut = g;
    // the last layer (plan 58 phase 2e): a foot the pose has down stays where it landed, whatever the
    // layers above did — let go of in the air, a verb or a Flowmotion move
    this.lock ??= new hero.FootLock();
    const moved = { ahead: m.ahead * dt, left: m.left * dt, yaw: -m.turn * dt };
    const off = m.up || !!m.verb || !!m.flow || this.downFrom?.kind === "roll";
    const done = this.lock.apply({ pose, lift: out.lift }, dt, moved, off, this.base);
    // 4f: last, the feet on the ground under them
    this.grounded(hero, done, off ? null : (m.ground ?? null), dt);
    this.shown = { L: hero.footOf(done, "L").ankle, R: hero.footOf(done, "R").ankle };
    return done;
  }

  // 4f: the feet on the ground under each (plan 58 C2: the land, a kerb, a stair — the world's
  // own): a foot down set on its ground and tipped to it, along and across; a foot up carried over
  // what's under it and ahead of its toes (not into a step's riser); the hips let down for the
  // lower foot (never up: the body's height is the core's). The pose till now stood on the flat.
  private drop = 0;
  /** what the feet found (for /dev/move's probes): each one's ground and the hips' drop */
  groundOut: { under: [number, number]; drop: number } | null = null;
  private grounded(H: Hero, m: Moved, g: ((x: number, z: number) => number) | null, dt: number): void {
    const k = 1 - Math.exp(-14 * dt);
    if (!g) {
      this.drop += (0 - this.drop) * k;
      if (Math.abs(this.drop) > 1e-4) m.lift = [m.lift[0], m.lift[1] + this.drop, m.lift[2]];
      this.groundOut = null;
      return;
    }
    const feet = (["L", "R"] as const).map((S) => {
      const f = H.footOf(m, S);
      // (how much it's down: by its lower spot, on the flat it stood on)
      const low = Math.min(f.heel[1], f.ball[1]);
      const w = smoother(clamp(1 - low / 0.04, 0, 1));
      const fx = f.ball[0] - f.heel[0];
      const fz = f.ball[2] - f.heel[2];
      const n = Math.hypot(fx, fz) || 1;
      const [ux, uz] = [fx / n, fz / n];
      const gh = g(f.heel[0], f.heel[2]);
      const gb = g(f.ball[0], f.ball[2]);
      // (ahead of the toes: a step's riser coming)
      const ga = g(f.ball[0] + ux * 0.1, f.ball[2] + uz * 0.1);
      // (across, a sole's width each side: its left edge, its right)
      const mx = (f.heel[0] + f.ball[0]) / 2;
      const mz = (f.heel[2] + f.ball[2]) / 2;
      const gl = g(mx + uz * 0.04, mz - ux * 0.04);
      const gr = g(mx - uz * 0.04, mz + ux * 0.04);
      // down: on the higher of its heel's and its ball's (over a stair's edge it rests on the nosing,
      // flat, the rest of it over the step below); tipped to the slope where it's a slope
      const edge = Math.abs(gb - gh) > 0.03;
      const rest = Math.max(gh, gb);
      // (a foot up over what's under it and near it — ahead of its toes, behind its heel, less a
      // centimetre a centimetre off: a cone. It rises as it nears a riser and comes down past an
      // edge, never at once — over the edge itself it'd jump a riser in a frame)
      let air = Math.max(gh, gb, ga);
      if (w < 1) {
        // (out from its toes and its heel, the first rise found and its edge found between samples —
        // sampled alone, each sample crossing an edge jumped the foot by the samples' gap)
        const cone = (x: number, z: number, dx: number, dz: number, base: number) => {
          for (let d = 0.04; d <= 0.2 + 1e-6; d += 0.04) {
            const h = g(x + dx * d, z + dz * d);
            if (h <= base + 0.005) continue;
            let lo = d - 0.04;
            let hi = d;
            for (let n = 0; n < 5; n++) {
              const mid = (lo + hi) / 2;
              if (g(x + dx * mid, z + dz * mid) > base + 0.005) hi = mid;
              else lo = mid;
            }
            return h - hi;
          }
          return base;
        };
        air = Math.max(air, cone(f.ball[0], f.ball[2], ux, uz, gb), cone(f.heel[0], f.heel[2], -ux, -uz, gh));
      }
      const up = w * rest + (1 - w) * air;
      const pitch = edge ? 0 : -w * clamp(Math.atan2(gb - gh, n), -0.35, 0.35);
      const roll = w * clamp(Math.atan2(gl - gr, 0.08), -0.3, 0.3);
      return { S, ankle: f.ankle, up, w, pitch, roll, rest };
    });
    // the hips let down as far as the lower foot down needs
    let want = 0;
    // (each foot by how far it's down: a threshold jumped it as a foot crossed it)
    for (const f of feet) want = Math.min(want, f.rest * f.w);
    this.drop += (Math.max(-0.35, want) - this.drop) * k;
    m.lift = [m.lift[0], m.lift[1] + this.drop, m.lift[2]];
    // (a leg on flat ground under hips that haven't moved is left as it was)
    for (const f of feet)
      if (Math.abs(f.up - this.drop) > 1e-4 || Math.abs(this.drop) > 1e-4 || f.pitch || f.roll)
        H.groundLeg(m, f.S, [f.ankle[0], f.ankle[1] + f.up, f.ankle[2]], f.pitch, f.roll);
    this.groundOut = { under: [feet[0].rest, feet[1].rest], drop: this.drop };
  }

  private lock: InstanceType<Hero["FootLock"]> | null = null;
  private base: Record<"L" | "R", ReturnType<Hero["footOf"]>> | null = null;
  private gaze: InstanceType<Hero["Gaze"]> | null = null;
  /** plan 58 G.D: this frame's gaze — the eyes' morphs and a blink (null: none) */
  gazeOut: { eyes: [number, number]; blink: number } | null = null;
  /** (5b) where this frame's hands go — on a top, an edge, the ground — in the body's own space (x
   *  its left, y up from its feet, z ahead), for the model to reach last (`PersonModel.handsTo`) */
  handsOut: import("./anim/air").Hands | null = null;
  /** (7) a hand put somewhere at a weight, over any put before it */
  private hand(h: import("./anim/air").Hands | null | undefined, w: number): void {
    if (!h || w <= 0) return;
    this.handsOut ??= {};
    for (const S of ["L", "R"] as const) {
      const x = h[S];
      if (x) this.handsOut[S] = { ...x, w: x.w * w };
    }
  }
  private reloadT = 0;
  /** (10) a start aside: the steps of its own taken since the first */
  private taken = 0;
  /** (10) going aside — not ahead, not backing up: the feet the cycle has turned the way she goes */
  private aside(): boolean {
    const w = Math.abs(this.way);
    return w > 0.5 && w < 2.0;
  }
  private eyesDown = 0;
  private torchLook: { yaw: number; pitch: number } | null = null;

  /** Down from the air on the move: the run picked up on the foot that comes down first (the lower,
   *  as last shown), at the point of its time on the ground where the run has it where it came down —
   *  further back, further through (set at its landing it jumped there). */
  private runOnLanding(H: Hero, m: LocoIn, dt: number, stride: number): void {
    if (m.speed <= 1 || !this.gaitAt || !this.shown) return;
    const was = this.shown;
    const F = was.R[1] <= was.L[1] ? "R" : "L";
    const ph0 = F === "R" ? 0 : 0.5;
    const z0 = H.footOf(this.gaitAt(ph0, m.speed), F).ankle[2];
    const past = clamp((z0 - (was[F][2] - m.ahead * dt)) / stride, -0.08, 0.15);
    this.gaitPh = (ph0 + past + 1) % 1;
  }

  /** 4c: who has the feet — the idle, the stepper or the cycle — and the stepper's legs laid on. */
  private stepper(H: Hero, dt: number, m: LocoIn, body: Moved, T: number, stride: number): Moved {
    this.steps ??= new H.Stepper();
    const st = this.steps;
    const S = this.spec;
    const mv = { ahead: m.ahead * dt, left: m.left * dt, yaw: -m.turn * dt };
    const v = m.speed;
    // (the speed's change as it is — `m.accel` is eased, and lags a start by a tenth of a second)
    if (dt > 0) this.aNow += ((v - this.vWas) / dt - this.aNow) * Math.min(1, dt * 40);
    this.vWas = v;
    const a = this.aNow;
    // (setting off: the gait it's going for — its first step's the cycle's foot as it lands)
    const goal = m.goal ?? S.jog;
    // (where the body will be in `t` s: the way it's going, slowing to a stop or speeding up to its
    // gait's speed)
    const dir = v > 1e-3 ? [m.left / v, m.ahead / v] : [0, 0];
    const goes = (t: number): number => {
      if (a < -0.5) {
        const u = Math.min(t, v / -a);
        return v * u + 0.5 * a * u * u;
      }
      if (a > 0.5 && v < goal) {
        const u = Math.min(t, (goal - v) / a);
        return v * u + 0.5 * a * u * u + goal * (t - u);
      }
      return v * t;
    };
    const rem = a < -0.5 ? (v * v) / (-2 * a) : Number.POSITIVE_INFINITY;
    const home = this.crouchW > 0.5 ? H.crouchFeet() : H.idleFeet(this.seed, this.gait);
    const want = (F: "L" | "R", left: number) => {
      const s = goes(left);
      const at = home[F].at;
      return { at: [at[0] + dir[0] * s, at[1], at[2] + dir[1] * s] as [number, number, number], yaw: home[F].yaw };
    };
    // (the cycle's foot where it lands, for the first step out: the gait taken over on it)
    const landPh = (F: "L" | "R") => (F === "R" ? 0 : 0.5);
    const rg = clamp((goal - (S.walk + 0.4)) / 1.2, 0, 1);
    // (the gait as it'll be at the speed it's going for: any way, crouched or not)
    const gaitAt = this.gaitAt;
    const cycleAt = (ph: number): Moved => (gaitAt ? gaitAt(ph, goal) : H.walk2Pose(ph, T));
    const can = !m.up && !m.verb && !m.flow;
    const feet = { L: H.footOf(body, "L"), R: H.footOf(body, "R") };
    const quick = clamp(v / S.jog + Math.abs(m.turn) / 8, 0, 1);
    if (!can) {
      this.stepping = "off";
      this.stepW = 0;
      st.watch(feet, mv, dt);
      return body;
    }
    if (this.stepping === "off") this.stepping = v > 0.5 ? "cycle" : "idle";
    if (this.stepping === "idle" || this.stepping === "cycle") {
      st.watch(feet, mv, dt);
      // (from the cycle: a skid's brace as it begins braking from a sprint, else a stop's steps once
      // it's to stop within a step — not a landing's check in the speed)
      const skid = this.stepping === "cycle" && this.skidFrom > (S.jog + S.sprint) / 2 && v > 4;
      const take =
        this.stepping === "idle"
          ? v > 0.05 || Math.abs(m.turn) > 0.8
          : skid || (a < -4 && rem < 0.6 && !this.landOf && !this.lastJump && this.upAgo > 0.3) || v < 0.3;
      if (take) {
        st.take(body.lift);
        if (skid) {
          const ahead = st.feet.L.at[2] > st.feet.R.at[2] ? "L" : "R";
          st.brace(ahead);
        }
        this.stepping = "steps";
        this.stepW = 1;
        this.still = 0;
      }
    }
    // (the skid over — nearly stopped, or driving on again: the feet grip)
    if (st.slip > 0 && !this.skidFrom) st.brace(null);
    if (this.stepping === "steps" || this.stepping === "start") {
      // setting off: the foot behind (the way it's going) steps out first, to where the cycle will
      // have it as it lands; the cycle goes on from there
      // (a step already going the way it's setting off is taken as that first step)
      if (this.stepping === "steps" && v > 0.1 && (a > 0.5 || (v > 1 && a > -2))) {
        const going = st.feet.L.swing ? "L" : st.feet.R.swing ? "R" : null;
        const behind = (F: "L" | "R") => st.feet[F].at[0] * dir[0] + st.feet[F].at[2] * dir[1];
        this.lead = going ?? (behind("L") < behind("R") ? "L" : "R");
        this.stepping = "start";
        this.taken = 0;
        // (as long as it takes the body to carry the foot left behind back to where the cycle has it
        // as the lead lands — a short quick first step, not a long one that leaves it stretched; along
        // the way it's going)
        const F = this.lead;
        const other = F === "L" ? "R" : "L";
        const trail = H.footOf(cycleAt(landPh(F)), other).ankle;
        const o = st.feet[other].at;
        const need = Math.max(0.05, (o[0] - trail[0]) * dir[0] + (o[2] - trail[2]) * dir[1]);
        let lo = 0.08;
        let hi = 0.4;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          if (goes(mid) < need) lo = mid;
          else hi = mid;
        }
        const dur = Math.max(lerp(0.2, 0.15, rg), Math.min(0.32, hi));
        // (one already going — a catch step, a brake — is that first step, with its time and aim)
        // (a step of its own, aimed at the cycle's landing, hands over a little early; one taken over, on
        // landing)
        this.ownStep = !going;
        if (going) st.adopt(going, dur);
        else
          st.step(F, (G, left) => this.firstStep(G, left, cycleAt, landPh, goes, dir, home), dur, lerp(0.06, 0.09, rg));
      }
      const landed = st.update(
        dt,
        mv,
        this.stepping === "start" ? (F, left) => this.firstStep(F, left, cycleAt, landPh, goes, dir, home) : want,
        { quick, turn: m.turn, free: this.stepping === "start" },
      );
      if (this.stepping === "start") {
        // (the cycle takes over a little before the lead foot's down — the other's off the ground by
        // then in a run, pushed off behind — its phase set so the lead lands as it would have)
        const left = st.left(this.lead);
        // (…or one taken over, once the foot left behind is near the end of the leg's reach)
        const trailing = st.feet[this.lead === "L" ? "R" : "L"].at;
        const stretched = Math.hypot(trailing[0], trailing[2]) > 0.3;
        // (10: going aside, the cycle has the feet turned the way she goes — a quarter round from how
        // she stood — and the one left behind further out and back: taken over on the ground, it was
        // spun round and dragged (2.7 m/s). So each step lands turned as the cycle has it, and the foot
        // left behind takes its own step too — more while she's getting up to pace, four at most —
        // before the hand-over)
        if (this.aside() && (this.taken < 1 || (v < 0.9 * goal && this.taken < 4))) {
          if (landed === this.lead) {
            const G = this.lead === "L" ? "R" : "L";
            this.taken++;
            this.lead = G;
            this.ownStep = true;
            const dur = clamp((0.5 * stride) / Math.max(v, 0.8), 0.16, 0.34);
            st.step(G, (F2, l2) => this.firstStep(F2, l2, cycleAt, landPh, goes, dir, home), dur, lerp(0.06, 0.09, rg));
          } else if (v < 0.1) this.stepping = "steps";
        } else if (landed === this.lead || ((this.ownStep || stretched) && left < lerp(0.1, 0.08, rg))) {
          // (the cycle's phase from where the lead foot is: still to land, or down and as far through
          // its time on the ground as the body's gone past it)
          const F = this.lead;
          const f0 = H.footOf(cycleAt(landPh(F)), F).ankle;
          const at = st.feet[F].at;
          const past = (f0[0] - at[0]) * dir[0] + (f0[2] - at[2]) * dir[1];
          const ph =
            landed === F ? landPh(F) + Math.max(0, Math.min(0.15, past / stride)) : landPh(F) - goes(left) / stride;
          this.gaitPh = ((ph % 1) + 1) % 1;
          this.stepping = "cycle";
          this.handT = Math.max(0.06, left);
        } else if (v < 0.1) this.stepping = "steps";
      } else {
        // settled: both feet where they stand, still — the standing pose has them again
        this.still = !st.busy && v < 0.05 && Math.abs(m.turn) < 0.3 ? this.still + dt : 0;
        if (this.still > 0.15) this.stepping = "idle";
      }
    }
    // (handing over: its feet still carried with the body while they're laid on — no new steps)
    else if (this.stepW > 0)
      st.update(dt, mv, (F, left) => this.firstStep(F, left, cycleAt, landPh, goes, dir, home), {
        quick,
        turn: m.turn,
        free: true,
      });
    const to = this.stepping === "steps" || this.stepping === "start" ? 1 : 0;
    // (out to the cycle quickly, to the idle easily: their feet are where the stepper's are)
    this.stepW = to ? 1 : Math.max(0, this.stepW - dt / (this.stepping === "cycle" ? this.handT : 0.3));
    if (this.stepW > 0) st.lay(body, smoother(this.stepW), dt);
    return body;
  }
  /** The first step out: the lead foot to where the cycle has it landing (the body gone on by then);
   *  the other foot stays. */
  private firstStep(
    F: "L" | "R",
    left: number,
    cycleAt: (ph: number) => Moved,
    landPh: (F: "L" | "R") => number,
    goes: (t: number) => number,
    dir: number[],
    home: Record<"L" | "R", { at: [number, number, number]; yaw: number }>,
  ) {
    const H = hero as Hero;
    if (F !== this.lead)
      return { at: this.steps?.feet[F].at ?? home[F].at, yaw: this.steps?.feet[F].yaw ?? home[F].yaw };
    const f = H.footOf(cycleAt(landPh(F)), F);
    const s = goes(left);
    return {
      at: [f.ankle[0] + dir[0] * s, ANKLE, f.ankle[2] + dir[1] * s] as [number, number, number],
      // (10: turned as the cycle has it landing — aside, a quarter round: one put down facing ahead was
      // spun round on the ground as the cycle took it over)
      yaw: this.aside() ? H.footAngles(f).yaw : home[F].yaw,
    };
  }

  private compose(dt: number, m: LocoIn, standing?: Moved): Moved {
    this.handsOut = null;
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
      // (5c: the hands taking hold of the pole and the ledge, the toes driving off the wall)
      if (H && air && !m.reduced) this.handsOut = air.flow2(f, m.flow);
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
      // (5b: the vault, the mantle, the roll and the slide again, the hands put where they go)
      if (H && air && !m.reduced && m.verb.kind !== "adash") {
        const r = air.verb2Pose(m.verb, H.slide2Pose);
        this.handsOut = r.hands;
        this.verbOut = r.m;
      } else
        this.verbOut =
          H && m.verb.kind === "slide" ? H.slide2Pose(m.verb.t) : verbPose(m.verb.kind, m.verb.t, m.reduced);
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
    let strideNow =
      lerp(H ? H.walk2Stride(T, this.gait) : 1, H ? H.run2Stride(effort) : runStride(effort), runW) *
      (1 - 0.35 * this.driveW) *
      vary;
    // (4d: backing up, crouched — their own strides, by how far it's each)
    if (H) {
      const back = smoother(clamp((Math.abs(this.way) - 1.6) / 0.4, 0, 1));
      const bs = H.back2Stride(clamp((m.speed - S.walk) / (S.jog - S.walk), 0, 1), T);
      strideNow = lerp(strideNow, bs, back);
      strideNow = lerp(strideNow, H.crouch2Stride(T, back > 0.5), ease(this.crouchW));
    }
    // (5b: out of a verb on the move — the run picked up on the foot it came down on)
    if (H && this.verbOut && this.outT === 0) this.runOnLanding(H, m, dt, strideNow);
    if (H) {
      this.gaitPh = (this.gaitPh + d / strideNow) % 1;
      // (4c: stopping and setting off are steps of their own — the stepper's, below — not the cycle
      // run down onto both feet)
    }
    // 4d: the way it goes off its facing (first person, lock-on, aiming: aside, aslant, backing up) —
    // the hips and legs turned to it, the chest kept ahead; past a right angle, backing up
    const sp = Math.hypot(m.ahead, m.left);
    // (as it is once it's going — the core turns it smoothly — eased only near still, where it's unsure)
    if (!m.facing && !m.aim) this.way += (0 - this.way) * k(20);
    else if (sp > 0.3) {
      const to = Math.atan2(m.left, m.ahead);
      const dw = Math.atan2(Math.sin(to - this.way), Math.cos(to - this.way));
      this.way += sp > 1 ? dw : dw * k(20);
    }
    const backTo = H ? smoother(clamp((Math.abs(this.way) - 1.6) / 0.4, 0, 1)) : 0;
    const crouched = this.crouchW > 0.01;
    const life = { puff: this.puff, breath: this.breath, hurt: m.hurt ?? 0, gait: this.gait };
    const wayF = clamp(this.way, -1.75, 1.75);
    const wayB = clamp(this.way - Math.PI * Math.sign(this.way || 1), -1.2, 1.2);
    // (the gait at a phase and a speed: forward — walk, run — or backing up, crouched or not)
    const gaitAt = (ph: number, spd: number, pump = -1): Moved => {
      const Hh = H as Hero;
      const rw = clamp((spd - (S.walk + 0.4)) / 1.2, 0, 1);
      const ef = clamp((spd - S.jog) / (S.sprint - S.jog), 0, 1);
      const walk = Hh.walk2Pose(ph, T, wayF, life);
      let fwd = rw > 0 ? mix(walk, Hh.run2Pose(ph, pump < 0 ? ef : pump, T, ef, wayF), rw) : walk;
      // (mixed by where the feet are)
      if (backTo > 0) {
        const back = Hh.back2Pose(ph, clamp((spd - S.walk) / (S.jog - S.walk), 0, 1), T, wayB);
        fwd = Hh.blendLegs(mix(fwd, back, backTo), fwd, back, backTo);
      }
      if (!crouched) return fwd;
      const low = backTo > 0.5 ? Hh.crouch2Pose(ph, T, wayB, true) : Hh.crouch2Pose(ph, T, wayF);
      const cw = ease(this.crouchW);
      return Hh.blendLegs(mix(fwd, low, cw), fwd, low, cw);
    };
    this.gaitAt = H ? gaitAt : null;
    const walkNow = (): Moved => (H ? H.walk2Pose(this.gaitPh, T) : (walkPose(this.walkPh, 1) as Moved));
    let still2 = still;
    if (H) {
      const pump = clamp(effort + 0.6 * this.driveW + 0.06 * wander(this.walked * 0.4, this.seed + 2), 0, 1);
      gaitPose = gaitAt(this.gaitPh, m.speed, pump);
      // (crouched and still: low over the feet, placed)
      if (crouched) {
        const low = H.crouch2Pose0(this.t, T);
        const cw = ease(this.crouchW);
        still2 = H.blendLegs(mix(still, low, cw), still, low, cw);
      }
    } else if (m.speed < S.walk + 0.4) gaitPose = walkNow();
    else {
      const run = runPose(this.runPh, effort);
      gaitPose = mix(walkNow(), run, runW);
    }
    if (!H) {
      // going aside or backing up (first person's A / D and S): the legs step that way
      const backTo0 = sp > 0.3 ? clamp((-m.ahead / sp) * 1.4 - 0.3, 0, 1) : 0;
      const sideTo = sp > 0.3 ? clamp((Math.abs(m.left) / sp - 0.6) * 2.5, 0, 1) * (1 - backTo0) : 0;
      this.backW += (backTo0 - this.backW) * k(10);
      this.sideW += (sideTo - this.sideW) * k(10);
      if (this.backW > 0.01) gaitPose = mix(gaitPose, backpedalPose(this.backPh), ease(this.backW));
      if (this.sideW > 0.01) gaitPose = mix(gaitPose, strafePose(this.sidePh, m.left > 0 ? 1 : -1), ease(this.sideW));
    }
    let body = mix(still2, gaitPose, ease(this.moveW));

    if (H && !m.up) {
      // slowing hard from speed: a skid
      // (begun braking from speed, held till nearly stopped: a sprint's stop skids all the way, a
      // run's a little)
      // (going forward: backing up or aside, a stop's the stepper's)
      // (nor turning hard: a cut at a sprint slows as its way swings round — braced on a foot out
      // ahead, slid on it while it turned, the leg folded under her)
      if (
        !this.skidFrom &&
        -m.accel > 6 &&
        m.speed > 4 &&
        this.upAgo > 0.3 &&
        Math.abs(this.way) < 1 &&
        Math.abs(m.turn) < 1.5
      )
        this.skidFrom = m.speed;
      // (over when it's nearly stopped, or done braking — slowed from a sprint to a walk, say)
      if (this.skidFrom && (m.speed < 0.8 || m.accel > -1)) this.skidFrom = 0;
      const skidTo = this.skidFrom ? clamp((this.skidFrom - 3) / (S.sprint - 3), 0, 1) : 0;
      this.skidW += (skidTo - this.skidW) * k(skidTo > this.skidW ? 16 : 6);
      // (its lean and arms; the feet where the gait has them — the stepper's brace, while it skids)
      if (this.skidW > 0.01) {
        const pre = body;
        body = H.blendLegs(mix(body, H.skid2Pose(this.skidW, this.t), ease(this.skidW)), pre, pre, 0.5);
      }
      body = this.stepper(H, dt, m, body, T, strideNow);
      // come to a stop from a run: the weight settles (a small give in the knees)
      if (m.speed > 2.5) this.moving = true;
      else if (this.moving && m.speed < 0.6) {
        this.moving = false;
        this.landT = 0;
        this.landK = 0.22;
      }
    }

    // crouched: the crouch, sneaking when moving (plan 58's: in the gait, above)
    if (!H && this.crouchW > 0.01) {
      const low = mix(crouchPose(breath), crouchWalkPose(this.sneakPh), ease(this.moveW));
      body = mix(body, low, ease(this.crouchW));
    }

    // (plan 58 7: the dark again, once its chunk's in — the fear by the mood)
    const N = H && !m.reduced ? night : null;
    const fear = N ? N.fearOf(this.tension) : 0;
    this.reloadT = m.reload ? this.reloadT + dt : 0;
    // the torch on: the left forearm out ahead (over the arm's swing); plan 58: out along the look,
    // the hand put there, shaking with the fear
    if (N && this.torchW > 0.01) {
      const tr = N.torch2(m.yaw, m.pitch, this.t, fear, breath);
      body = { pose: blend(body.pose, tr.pose, ease(this.torchW)), lift: body.lift };
      this.hand(tr.hands, ease(this.torchW));
      this.torchLook = this.torchW > 0.5 ? tr.look : null;
    } else if (this.torchW > 0.01)
      body = { pose: blend(body.pose, torchPose(breath), ease(this.torchW)), lift: body.lift };
    if (this.torchW <= 0.5) this.torchLook = null;
    // reloading: the gun up before the chest, both hands at it; plan 58: the left to the pocket and back
    if (N && this.reloadW > 0.01) {
      const rl = N.reload2(this.reloadT, fear);
      body = { pose: blend(body.pose, { ...reloadPose(breath), ...rl.pose }, ease(this.reloadW)), lift: body.lift };
      this.hand(rl.hands, ease(this.reloadW));
    } else if (this.reloadW > 0.01)
      body = { pose: blend(body.pose, reloadPose(breath), ease(this.reloadW)), lift: body.lift };
    // (the fear's hunch, on the move and stood, not aiming)
    if (N && fear > 0.01) body = { pose: N.hunch(body.pose, fear * (1 - this.aimW)), lift: body.lift };
    // (plan 58 9: the cold, the breath caught when spent, who she is when she stands)
    if (H && lifeM && !m.reduced && !m.up) {
      const lf = lifeM.life2({
        t: this.t,
        seed: this.seed,
        gait: this.gait,
        cold: m.cold ?? 0,
        spent: m.spent ?? 0,
        still: 1 - ease(this.moveW),
        busy: Math.max(this.torchW, this.aimW, this.reloadW, this.crouchW),
        breath: this.breath,
      });
      if (lf.w > 0.01) {
        const p = blend(body.pose, lf.pose, lf.w);
        for (const [j, d] of Object.entries(lf.add ?? {}) as [JointName, [number, number, number]][]) {
          const r = p[j] ?? [0, 0, 0];
          p[j] = [r[0] + d[0] * lf.w, r[1] + d[1] * lf.w, r[2] + d[2] * lf.w];
        }
        body = { pose: p, lift: [body.lift[0] + lf.lift[0], body.lift[1] + lf.lift[1], body.lift[2] + lf.lift[2]] };
        this.hand(lf.hands, 1);
      }
      this.eyesDown += ((lf.eyesDown ?? 0) * lf.w - this.eyesDown) * k(8);
      // a sound: past the head's own reach, the chest turned to it a while; sharp and close, a startle
      const hd = m.heard;
      if (hd && hd.t < 2.4) {
        const p = { ...body.pose };
        const add = (j: JointName, d: [number, number, number]) => {
          const r = p[j] ?? [0, 0, 0];
          p[j] = [r[0] + d[0], r[1] + d[1], r[2] + d[2]];
        };
        const past = Math.sign(hd.yaw) * Math.max(0, Math.min(1.4, Math.abs(hd.yaw) - 0.8));
        const tw =
          smoother(clamp(hd.t / 0.35, 0, 1)) * (1 - smoother(clamp((hd.t - 1.7) / 0.6, 0, 1))) * (1 - this.aimW);
        add("spine", [0, 0.3 * past * tw, 0]);
        add("chest", [0, 0.3 * past * tw, 0]);
        let dl = 0;
        if (hd.loud) {
          const st = lifeM.startle(hd.yaw, hd.t);
          for (const [j, d] of Object.entries(st.add) as [JointName, [number, number, number]][]) add(j, d);
          dl = st.lift;
        }
        body = { pose: p, lift: [body.lift[0], body.lift[1] + dl, body.lift[2]] };
      }
    }

    // aiming: the legs step the way the body goes (ahead, aside, backing up), the top aims
    if (this.aimW > 0.01) {
      const sp = Math.max(1e-6, Math.hypot(m.ahead, m.left));
      let legs: Moved;
      // (plan 58: the legs the gait's — aside, backing up, by the way it goes — the top aims)
      if (H) legs = body;
      else if (m.speed < 0.2) legs = aimPose(0, 0, false, breath);
      else if (-m.ahead > Math.abs(m.left) * 0.8) legs = backpedalPose(this.backPh);
      else if (Math.abs(m.left) > Math.abs(m.ahead)) legs = strafePose(this.sidePh, m.left > 0 ? 1 : -1);
      else legs = walkPose(this.walkPh, 0.85) as Moved;
      if (!H) legs = mix(aimPose(0, 0, false, breath), legs, ease(clamp(sp / 0.7, 0, 1)));
      this.pitch += (m.pitch - this.pitch) * k(16);
      const top0 = aimPose(this.pitch, m.yaw, !!m.gun, breath);
      // (plan 58 7: the breath in the arms, the fear's shake, a shot's kick)
      const a2 = N ? N.aim2(top0.pose, this.t, fear, m.kick ?? 0, breath, this.pitch) : null;
      if (a2 && m.gun) this.hand(a2.hands, ease(this.aimW));
      const top = a2 ? { pose: a2.pose, lift: top0.lift } : top0;
      const both: Moved = { pose: { ...legs.pose }, lift: legs.lift };
      for (const j of UPPER) if (top.pose[j]) both.pose[j] = top.pose[j];
      body = mix(body, both, ease(this.aimW));
    }

    // ── in the air: the jump's own arc (a sprint's flip turns over), or falling
    // (plan 58: down from a jump, its own landing — the reach, the impact, the give — then into the
    // gait; on the run quick and light, the run picked up on a foot that's landing. The core has no
    // landing of its own: the jump's pose was dropped for the run's in a frame)
    if (H && !m.up && !m.jump && this.lastJump && this.lastJump.stage === "air") {
      this.landOf = { kind: this.lastJump.kind, t: 0 };
      // (the run picked up on the foot the jump brings down first: the lower one)
      // (…at the point of its time on the ground where the run has it where the jump put it: further
      // back, further through — set at its landing it jumped there)
      this.runOnLanding(H, m, dt, strideNow);
    }
    const running = clamp((m.speed - S.walk) / (S.jog - S.walk), 0, 1);
    // (5a) up: how high over the ground under her, how fast that's going, the top of it; down: by how
    // far it fell (else the core's own measure — it tops out at 1.5 m)
    const hNow = H && m.ground ? -m.ground(0, 0) : null;
    if (m.up) {
      this.fallT += dt;
      if (hNow !== null) {
        if (this.hAir !== null && dt > 0) this.vzG = (hNow - this.hAir) / dt;
        this.fallTop = Math.max(this.fallTop, hNow);
      }
      this.hAir = hNow;
    } else {
      if (H && m.landed !== undefined && this.fallT > 0) {
        const fell = this.hAir !== null ? this.fallTop : 1.5 * m.landed;
        if (fell >= 0.8 && !(this.landOf && fell < 1.2)) {
          this.landOf = null;
          this.downFrom = { kind: fell >= 2.2 ? (m.speed > 3 ? "roll" : "hard") : "absorb", t: 0 };
          // (on the run, its cycle picked up as a jump's is: it drifted on through the fall, both feet up)
          if (!this.lastJump) this.runOnLanding(H, m, dt, strideNow);
        }
      }
      this.fallT = 0;
      this.fallTop = 0;
      this.hAir = null;
      this.vzG = 0;
    }
    if (this.landOf) {
      this.landOf.t += dt / lerp(0.38, 0.2, running);
      if (this.landOf.t >= 1 || m.up || m.jump || m.verb || m.flow) this.landOf = null;
    }
    const landing = this.landOf
      ? { kind: this.landOf.kind as JumpNow["kind"], stage: "land" as const, k: this.landOf.t }
      : null;
    if (m.jump?.stage === "crouch") this.fromRun = running > 0.5;
    const jump = m.jump ?? (m.up ? this.lastJump : landing);
    if (m.jump) this.lastJump = m.jump;
    if (!m.up && !m.jump) this.lastJump = null;
    if (spin !== null && m.up) {
      body = spinPose(spin, m.reduced);
    } else if (jump) {
      const j = H ? H.jump2Pose(jump, !m.reduced) : jumpPose(jump, !m.reduced);
      // (on the run: landing lighter — the gait's legs take most of it; going up off the stride itself —
      // no crouch onto both feet, which dragged them at a run — the air's pose eased in as it leaves)
      if (jump.stage === "air") this.airT += dt;
      else this.airT = 0;
      const jw = !H
        ? j.w
        : jump === landing
          ? j.w * (1 - 0.45 * running)
          : jump.stage === "crouch"
            ? j.w * (1 - running)
            : j.w * (this.fromRun ? smoother(clamp(this.airT / 0.08, 0, 1)) : 1);
      if (jw > 0) {
        const pre = body;
        body = {
          pose: blend(body.pose, j.pose, jw),
          lift: [body.lift[0], lerp(body.lift[1], j.lift[1], jw), body.lift[2]],
        };
        // (landing, and crouching to go: the feet between the jump's and the gait's by where they are —
        // by the angles they dragged along the ground under a body still going)
        if (H && jump.stage === "crouch") body = H.blendLegs(body, pre, { pose: j.pose, lift: j.lift }, jw);
        // (landing: only a foot the gait has down takes the landing's height — one it has swinging stays
        // up: pulled down to the landing's, it dragged along the floor)
        if (H && jump === landing) {
          const down = (S: "L" | "R") => {
            const f = H.footOf(pre, S);
            return 1 - smoother(clamp(Math.min(f.heel[1], f.ball[1]) / 0.04, 0, 1));
          };
          body = H.blendLegs(body, pre, { pose: j.pose, lift: j.lift }, [jw * down("L"), jw * down("R")], false);
        }
      }
    } else if (this.airW > 0.01) {
      if (H) {
        // (5a) off an edge: the stride on a moment, then gathered, arms out; reaching for the ground as
        // it comes (how soon: its height and how fast it's coming, by the ground under her)
        const g = 30;
        const vz = this.vzG;
        // (its height never under nought: stepping off, the ground under her middle can still be the
        // edge's — a root of less than nought spoilt the trunk's every spring)
        const h = Math.max(0, this.hAir ?? 0);
        const soon = this.hAir !== null && vz < -0.3 ? (vz + Math.sqrt(vz * vz + 2 * g * h)) / g : 9;
        const f = H.fall2Pose(this.fallT, soon, smoother(clamp((this.fallT - 0.45) / 0.4, 0, 1)));
        body = mix(body, f, ease(this.airW) * smoother(clamp(this.fallT / 0.18, 0, 1)));
      } else {
        // off an edge: the legs reaching down, the arms out
        const fall = landPose(0.15);
        add(fall.pose, "shoulderL", -0.3, 0, 0.5);
        add(fall.pose, "shoulderR", -0.3, 0, -0.5);
        body = mix(body, { pose: fall.pose, lift: [0, 0, 0] }, ease(this.airW) * 0.8);
      }
    }
    // (5a) down from a fall: by how far — an absorb, a heavy one with a hand down, from high at a run
    // a roll — its feet where they land, the gait's on the run
    if (H && this.downFrom) {
      const D = this.downFrom;
      D.t += dt * (D.kind === "absorb" ? 1 + 1.5 * running : 1);
      const L = H.land2Pose(D.kind, D.t);
      if (L.w <= 0 && D.t > 0.2) this.downFrom = null;
      else if (L.w > 0) {
        // (on the run mostly the run's legs, a dip: the absorb's deep hips under feet left at a run's
        // stride stretched the back leg out into a lunge)
        const w = D.kind === "roll" ? L.w : L.w * (1 - 0.8 * running);
        if (D.kind === "hard" && air) this.handsOut = air.landHands(w);
        const pre = body;
        body = mix(body, L.m, w);
        if (D.kind !== "roll") body = H.blendLegs(body, pre, L.m, w, m.speed < 1);
      }
    }

    // ── landing: a squash by how hard it was, gone in a moment
    // (plan 58: a jump's landing is its own, above; off an edge, the squash — lighter on the run)
    if (m.landed !== undefined && m.landed > 0.04 && !this.landOf && !this.downFrom) {
      this.landT = 0;
      this.landK = H ? m.landed * (1 - 0.7 * running) : m.landed;
    }
    if (this.landT < 1) {
      this.landT = Math.min(1, this.landT + dt / (0.18 + 0.22 * this.landK));
      const w = this.landK * (1 - ease(this.landT)) * (this.landT < 0.15 ? ease(this.landT / 0.15) : 1);
      body = mix(body, landPose(this.landK), clamp(w * 1.3, 0, 1));
    }

    // ── struck, startled (plan 58 7): thrown from the blow, the arms up to guard, a stagger
    const hitNow = m.hit;
    if (N && hitNow) {
      const h = N.hit2(hitNow.from, hitNow.t, hitNow.k);
      const p = { ...body.pose };
      for (const [j, d] of Object.entries(h.add) as [JointName, [number, number, number]][]) {
        const r = p[j] ?? [0, 0, 0];
        p[j] = [r[0] + d[0], r[1] + d[1], r[2] + d[2]];
      }
      // (the hands let go of what they were put on while they guard)
      if (this.handsOut) for (const x of Object.values(this.handsOut)) if (x) x.w *= 1 - h.w;
      body = {
        pose: h.w > 0.01 ? blend(p, h.guard, h.w) : p,
        lift: [body.lift[0] + h.lift[0], body.lift[1] + h.lift[1], body.lift[2] + h.lift[2]],
      };
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
    this.base = H && !m.up && !m.verb ? { L: H.footOf(body, "L"), R: H.footOf(body, "R") } : null;

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

/** A body's verb for `LocoIn`: how far through it, and (getting over or onto something) what it's
 *  over — the hands go on it (5b). */
export function verbIn(b: Body, spec: MoveSpec = KH_MOVE): LocoIn["verb"] {
  const V = b.verb;
  if (!V) return null;
  const t = verbProgress(V, spec);
  return V.kind === "vault" || V.kind === "mantle"
    ? { kind: V.kind, t, h: V.h, near: V.near, far: V.far, dist: V.dist }
    : { kind: V.kind, t };
}

/** A body's velocity in its own frame (ahead, to its left), for `LocoIn`. */
export function localVel(b: Body): { ahead: number; left: number; speed: number } {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  // the floor's y is south: the body's left is its facing turned the other way round
  return { ahead: b.vx * c + b.vy * s, left: b.vx * s - b.vy * c, speed: speedOf(b) };
}
