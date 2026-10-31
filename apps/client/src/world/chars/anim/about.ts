import { body, type Ch, clamp01, type Key, type Moved, mirror, sample, smoother, steady } from "../moves";

// Plan 58 (docs/plan/58-the-animation.md), the user's "a sprint one way then the other — do it
// properly, the whole body": turning round from a run as KH3 does, a hop-turn, keyed whole — no leg
// solved to a spot on the ground (a leg pinned while the hips went round was twisted out of its
// socket). Out of the skid she drops into a crouch with the head and the chest already going round
// and the arms winding; springs into a small hop, the legs tucked and the arms pulled in as the body
// turns in the air; comes down low facing the new way, a foot ahead and the trunk thrown forward over
// it, the arms as a sprint's start; and the run has her on that stride. The core turns her round in a
// tenth of a second as it stops: the hips are turned against that so she goes round as this has it.
// In the air chunk (`loadHero`).

/** How long, s: from the skid to the landing's drive. */
export const ABOUT_LEN = 0.34;
/** handed to the run, landed and up to this pace the new way (m/s): the run's own strides from there */
export const ABOUT_RUN = 3;
/** Landed by here (0..1): the feet down again, the foot lock's to hold. */
export const ABOUT_DOWN = 0.62;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// turning round to her left (mirrored to her right); the hips' turn is its own (`yawAt`)
const ABOUT: Key[] = [
  // the skid as she comes out of it (hero's SKID, hard): sat back, the right foot a little ahead, the
  // knees bent, the arms forward
  {
    at: 0,
    c: {
      tR: -0.87,
      kR: 0.95,
      fR: -0.12,
      tL: -0.18,
      kL: 1.1,
      fL: 0.4,
      aL: 0.08,
      aR: 0.12,
      sx: -0.1,
      sL: -0.8,
      sR: -0.45,
      oL: 0.3,
      oR: 0.25,
      eL: -1,
      eR: -1.1,
      hL: 0.4,
      hR: 0.4,
    },
  },
  // the gather: down onto both knees, over them; the head and the chest gone round ahead of the hips,
  // the right arm swung across, the left back — wound up
  {
    at: 0.24,
    c: {
      tR: -1.0,
      kR: 1.75,
      fR: 0.35,
      tL: -0.6,
      kL: 1.8,
      fL: 0.45,
      aL: 0.08,
      aR: 0.08,
      sx: 0.35,
      sy: 0.55,
      dy: 0.35,
      sR: -1.05,
      oR: 0.15,
      eR: -1.35,
      sL: 0.55,
      oL: 0.45,
      eL: -0.7,
      hL: 0.6,
      hR: 0.6,
    },
  },
  // the hop: off both feet, a little way up, the legs tucked under her and the arms pulled in tight as
  // she goes round
  {
    at: 0.43,
    c: {
      tR: -1.0,
      kR: 1.55,
      fR: 0.5,
      tL: -0.75,
      kL: 1.45,
      fL: 0.5,
      aL: 0.06,
      aR: 0.06,
      sx: 0.22,
      sy: 0.2,
      dy: 0.15,
      sR: -0.55,
      oR: 0.2,
      eR: -1.7,
      sL: -0.35,
      oL: 0.2,
      eL: -1.7,
      hL: 0.8,
      hR: 0.8,
      air: 0.17,
    },
    ease: 0.4,
  },
  // down: low, facing the new way, the left foot ahead and the right behind on its toes; the trunk
  // thrown forward over the front knee, the right arm forward and the left back
  {
    at: ABOUT_DOWN,
    c: {
      tL: -0.6,
      kL: 1.25,
      fL: -0.05,
      tR: 0.2,
      kR: 1.15,
      fR: 0.65,
      aL: 0.08,
      aR: 0.08,
      sx: 0.6,
      sy: -0.1,
      sR: -1.0,
      oR: 0.15,
      eR: -1.35,
      sL: 0.7,
      oL: 0.2,
      eL: -1.05,
      hL: 0.8,
      hR: 0.8,
    },
  },
  // the drive: the back leg pushing off behind (its knee still soft), the front knee over the foot
  {
    at: 0.82,
    c: {
      tL: -0.25,
      kL: 0.8,
      fL: 0.15,
      tR: 0.45,
      kR: 0.55,
      fR: 0.95,
      sx: 0.55,
      sR: -1.05,
      oR: 0.15,
      eR: -1.3,
      sL: 0.8,
      oL: 0.18,
      eL: -1.1,
      hL: 0.8,
      hR: 0.8,
    },
  },
  // the first stride: the right leg coming through, the arms swapping over
  {
    at: 1,
    c: {
      tL: 0.35,
      kL: 0.45,
      fL: 0.55,
      tR: -0.55,
      kR: 1.35,
      fR: 0.25,
      sx: 0.45,
      sR: 0.55,
      oR: 0.14,
      eR: -1.15,
      sL: -0.75,
      oL: 0.14,
      eL: -1.3,
      hL: 0.6,
      hR: 0.6,
    },
  },
];
const ABOUT_R = ABOUT.map((k) => ({ ...k, c: mirror(k.c) }));

/** How far round she's gone by `u` (rad): a little twist in the gather, most of it in the air, round
 *  as she lands. */
const yawAt = (u: number) => Math.PI * (0.12 * smoother(u / 0.24) + 0.88 * smoother((u - 0.18) / (ABOUT_DOWN - 0.18)));

export class AboutTurn {
  /** how far through (0..1); on while it's going */
  u = 0;
  on = false;
  /** + to her left */
  side = 1;
  /** the core's own turn since it began (+ to the left) */
  private turned = 0;

  /** Begun, turning to `side` (+ left). */
  start(side: number): void {
    this.on = true;
    this.u = 0;
    this.side = side;
    this.turned = 0;
  }

  /** The foot ahead as she lands — the run's stride is taken up on it. */
  lead(): "L" | "R" {
    return this.side > 0 ? "L" : "R";
  }

  /** This frame's body (over `m`, what it'd be otherwise, by `w`): the core turned `yaw` (rad, + to
   *  the left) since the last frame, going `speed` (m/s). */
  update(m: Moved, dt: number, yaw: number, speed: number, w: number): Moved {
    this.u = Math.min(1, this.u + dt / ABOUT_LEN);
    this.turned += yaw;
    const u = this.u;
    // (down, round and up to pace: the run has her — this plays on under its blend, not jumped to its
    // end)
    if (u >= 1 || (u > ABOUT_DOWN && speed > ABOUT_RUN && Math.abs(wrap(this.side * Math.PI - this.turned)) < 0.5))
      this.on = false;
    const ch: Ch = sample(this.side > 0 ? ABOUT : ABOUT_R, clamp01(u), false);
    // (the hips turned so she's round as far as this has it — whatever the core's done)
    ch.hy = wrap(this.side * yawAt(u) - this.turned);
    const a = body(steady(ch));
    if (w >= 1) return a;
    // (in from the skid: by the joints' angles — it starts where the skid is)
    const out: Moved = { pose: { ...m.pose }, lift: [0, 0, 0] };
    for (let i = 0; i < 3; i++) out.lift[i] = m.lift[i] + (a.lift[i] - m.lift[i]) * w;
    for (const [j, r] of Object.entries(a.pose)) {
      const b = m.pose[j as keyof typeof m.pose];
      out.pose[j as keyof typeof out.pose] = b
        ? [b[0] + (r[0] - b[0]) * w, b[1] + (r[1] - b[1]) * w, b[2] + (r[2] - b[2]) * w]
        : r;
    }
    return out;
  }
}
