import { type HeldKind, heldState } from "@yutopia/shared";
import { type ArmPose, type LegPose, type Pose, type Rig, restArm, restLeg, restPose } from "./avatar-rig";

// How people move: a pose for every frame from what they're doing — walking
// (the cycle follows the distance covered, so feet never slide), standing
// (breathing, blinking, shifting their weight, looking about), sitting (hands
// on the lap, or typing at a desk), talking (the mouth and little nods) and
// the emotes (a wave, a clap, a laugh…). Shared by the world and the previews.

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function lerpArm(a: ArmPose, b: ArmPose, t: number): ArmPose {
  return { sh: lerp(a.sh, b.sh, t), el: lerp(a.el, b.el, t), su: lerp(a.su, b.su, t), sf: lerp(a.sf, b.sf, t) };
}
function lerpLeg(a: LegPose, b: LegPose, t: number): LegPose {
  return { hip: lerp(a.hip, b.hip, t), knee: lerp(a.knee, b.knee, t), s: lerp(a.s, b.s, t) };
}
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    body: { x: lerp(a.body.x, b.body.x, t), y: lerp(a.body.y, b.body.y, t), rot: lerp(a.body.rot, b.body.rot, t) },
    head: { x: lerp(a.head.x, b.head.x, t), y: lerp(a.head.y, b.head.y, t), rot: lerp(a.head.rot, b.head.rot, t) },
    armL: lerpArm(a.armL, b.armL, t),
    armR: lerpArm(a.armR, b.armR, t),
    legL: lerpLeg(a.legL, b.legL, t),
    legR: lerpLeg(a.legR, b.legR, t),
    face: t < 0.5 ? a.face : b.face,
    armLFront: t < 0.5 ? a.armLFront : b.armLFront,
  };
}

// Front views: a leg's length so its foot stays on the floor while the hips
// bob (`lift` raises the foot).
const LEG = 64; // hip (104) to the floor (168)
const legLen = (bodyY: number, lift: number, reach = 0) => (LEG - bodyY - lift) / LEG + reach;

// In profile: how low an ankle hangs (board y) for a leg's hip and knee angles
// (thigh hip 104 → knee 132, shin knee → ankle 160).
const ANKLE = 160;
const rad = (d: number) => (d * Math.PI) / 180;
const ankleY = (l: LegPose) => 104 + 28 * Math.cos(rad(l.hip)) + 28 * Math.cos(rad(l.hip + l.knee));

// ── still poses ───────────────────────────────────────────────────────────────
// Standing at rest, or seated: hands on the lap (or, `typing`, on a desk).
export function stillPose(rig: Rig, typing = false): Pose {
  const p = restPose();
  if (!rig.sit) {
    if (rig.side) {
      // in profile: a relaxed stance, the far leg and arm a little back
      p.legR.hip = 5;
      p.legL.hip = -4;
      p.armL.sh = -6;
      p.armR.sh = 3;
      return p;
    }
    // arms hang a hair away from the body
    p.armL.sh = 2;
    p.armR.sh = -2;
    return p;
  }
  if (rig.side) {
    // forearm forward: on the lap, or out to the keyboard
    p.armR = { sh: typing ? 14 : 6, el: typing ? 66 : 74, su: 1, sf: 1 };
  } else if (rig.back) {
    // elbows out, forearms in towards the desk (seen from behind)
    p.armL = { sh: 20, el: -92, su: 0.94, sf: 0.56 };
    p.armR = { sh: -20, el: 92, su: 0.94, sf: 0.56 };
    p.head.y = 2.2; // looking down at the screen
  } else if (typing) {
    // facing out over a desk: hands forward to the keys
    p.armL = { sh: -10, el: -64, su: 0.95, sf: 0.5 };
    p.armR = { sh: 10, el: 64, su: 0.95, sf: 0.5 };
    p.armLFront = true;
  } else {
    // hands on the lap
    p.armL = { sh: -5, el: -30, su: 0.97, sf: 0.74 };
    p.armR = { sh: 5, el: 30, su: 0.97, sf: 0.74 };
  }
  return p;
}

// ── the walk ──────────────────────────────────────────────────────────────────
// `phase` 0..1 is one full cycle (two steps); `w` how much of it (blending in
// and out of a stop).
export function walkPose(rig: Rig, phase: number, w = 1): Pose {
  const base = stillPose(rig);
  if (rig.sit) return base;
  const s = Math.sin(phase * TAU);
  const c = Math.cos(phase * TAU);
  const p = restPose();
  // down on each contact (|s| = 1), up as the legs pass (|c| = 1)
  p.body.y = 0.7 - 1.9 * Math.abs(c);
  p.head.y = -0.25 * p.body.y;
  if (rig.side) {
    // facing −x: + swings a limb's end forward
    p.body.rot = -3;
    p.head.rot = 1.5 + 0.8 * s;
    p.legR.hip = 22 * s; // near leg
    p.legL.hip = -22 * s;
    p.legR.knee = -(5 + 46 * Math.max(0, c) ** 1.3);
    p.legL.knee = -(5 + 46 * Math.max(0, -c) ** 1.3);
    // the hips ride as low as the planted leg lets them: down when the legs
    // are apart, up as they pass — so the foot on the floor stays on it
    p.body.y = ANKLE - Math.max(ankleY(p.legL), ankleY(p.legR));
    p.head.y = -0.25 * p.body.y;
    p.armR = { sh: -20 * s, el: 14 + 18 * Math.max(0, -s), su: 1, sf: 1 };
    p.armL = { sh: 20 * s, el: 14 + 18 * Math.max(0, s), su: 1, sf: 1 };
  } else {
    // towards the viewer (S) or away (N): reaching legs read longer / shorter,
    // the swinging foot lifts, the hips sway over the planted leg
    const dir = rig.back ? -1 : 1;
    const liftL = 6.6 * Math.max(0, c) ** 1.4;
    const liftR = 6.6 * Math.max(0, -c) ** 1.4;
    p.legL.s = legLen(p.body.y, liftL, 0.085 * s * dir);
    p.legR.s = legLen(p.body.y, liftR, -0.085 * s * dir);
    // the swinging foot travels out a touch, the reaching one steps in under
    // the body's middle
    p.legL.hip = -0.45 * liftL - 2.4 * Math.max(0, s);
    p.legR.hip = 0.45 * liftR + 2.4 * Math.max(0, -s);
    p.body.x = 1.2 * s;
    p.body.rot = -1.7 * s;
    p.head.rot = 0.9 * s;
    // arms swing against the legs: the one coming forward bends at the elbow
    // and shortens towards the viewer, the one going back opens a little
    const fL = Math.max(0, -s); // left arm forward (right leg forward)
    const fR = Math.max(0, s);
    const bL = Math.max(0, s);
    const bR = Math.max(0, -s);
    p.armL = { sh: 2 + 8 * bL - 6 * fL, el: -34 * fL, su: 1 - 0.1 * fL, sf: 1 - 0.36 * fL };
    p.armR = { sh: -2 - 8 * bR + 6 * fR, el: 34 * fR, su: 1 - 0.1 * fR, sf: 1 - 0.36 * fR };
    if (rig.quarter) {
      // on a diagonal the stride runs along it (the heading is −x on screen;
      // + swings a limb's end that way): legs reach forward and back, the arms
      // swing against them with the forearm bending forward, the body leans in
      p.legL.hip += 10 * s;
      p.legR.hip -= 10 * s;
      p.armL = { sh: 1 - 11 * s, el: 14 * fL, su: 1 - 0.04 * fL, sf: 1 - 0.12 * fL };
      p.armR = { sh: -1 + 11 * s, el: 14 * fR, su: 1 - 0.04 * fR, sf: 1 - 0.12 * fR };
      p.body.rot = -2.2 - 1.1 * s;
      p.body.x = 0.7 * s;
      p.head.rot = 1 + 0.6 * s;
    }
  }
  return lerpPose(base, p, w);
}

// ── a person's motion over time ───────────────────────────────────────────────
export interface MotionIn {
  dist: number; // tiles moved this frame
  walking: boolean;
  speed: number; // tiles / s while walking
  typing: boolean; // seated at a desk
  speaking: boolean;
  emote: string; // the current emote ("" for none)
  reduced: boolean; // reduced motion: no idle life, short gestures
  held?: { kind: HeldKind; since: number } | null; // carrying something, `since` ms
  busy?: string; // using something (shared USES): the arcade, the piano…
  // with someone (shared SOCIAL, or "take"): what, `t` s into it, `len` s long
  act?: { what: string; t: number; len: number } | null;
}

// Carrying a mug in the right hand, at the waist…
export function holdArm(rig: Rig): ArmPose {
  return rig.side ? { sh: 10, el: 80, su: 1, sf: 1 } : { sh: 7, el: 78, su: 0.96, sf: 0.62 };
}
// …and up at the mouth for a sip (the elbow comes forward: towards you in the
// front views, ahead of the body in the side view)
export function sipArm(rig: Rig): ArmPose {
  return rig.side ? { sh: 70, el: 148, su: 1, sf: 1 } : { sh: 40, el: 140, su: 0.35, sf: 1 };
}
// a sip's shape over 0..1: up, a drink, back down
export const sipEnv = (s: number) => (s < 0 ? 0 : ease(s / 0.28) * (1 - ease((s - 0.72) / 0.28)));

const STRIDE = 1.9; // tiles per walk cycle at walking speed

function rnd(seed: number) {
  let a = Math.floor(seed * 2 ** 31) >>> 0 || 1;
  return () => {
    a = (a * 1103515245 + 12345) >>> 0;
    return ((a >>> 8) & 0xffff) / 0x10000;
  };
}

export class Motion {
  private t = 0;
  private phase = 0;
  private walkW = 0;
  private r: () => number;
  // idle life
  private blinkAt: number;
  private blinkUntil = 0;
  private shift = 0;
  private shiftTo = 0;
  private shiftAt: number;
  private look = 0;
  private lookTo = 0;
  private lookAt: number;
  // talking
  private mouthAt = 0;
  private mouthOpen = false;
  private gestureAt = 0;
  private gestureUntil = 0;
  // emotes
  private emote = "";
  private emoteT = 0;
  private sipping = false;
  private busyW = 0;
  private busyWhat = "";
  // sitting down / getting up: a short settle
  private seated: boolean | null = null;
  private settleT = 1;

  constructor(seed: number) {
    this.r = rnd(seed);
    this.t = this.r() * 10;
    this.blinkAt = this.t + 1 + this.r() * 3;
    this.shiftAt = this.t + 2 + this.r() * 5;
    this.lookAt = this.t + 3 + this.r() * 5;
  }

  update(rig: Rig, dt: number, m: MotionIn): Pose {
    this.t += dt;
    const t = this.t;
    const r = this.r;
    // the walk: phase from distance, blended in and out over ~0.12 s
    if (m.walking && m.dist > 0) this.phase = (this.phase + m.dist / (STRIDE + Math.max(0, m.speed - 4.2) * 0.22)) % 1;
    this.walkW = Math.max(0, Math.min(1, this.walkW + (m.walking ? dt : -dt) * 8));
    if (!m.walking && this.walkW === 0) {
      // settle into the nearer standing phase so the next start is clean
      this.phase = this.phase < 0.5 ? 0 : 0.5;
    }

    if (this.seated !== null && this.seated !== rig.sit) this.settleT = 0;
    this.seated = rig.sit;
    this.settleT = Math.min(1, this.settleT + dt / 0.32);

    // ── standing / seated life
    let p = stillPose(rig, m.typing);
    if (!m.reduced) {
      const breath = Math.sin(t * 2.1);
      p.body.y += -0.32 * breath;
      p.head.y += -0.1 * breath;
      if (!rig.sit) {
        p.armL.sh += 0.7 * Math.sin(t * 1.1 + 1);
        p.armR.sh -= 0.7 * Math.sin(t * 1.1 + 2.4);
        // weight from foot to foot every few seconds
        if (t > this.shiftAt) {
          this.shiftTo = this.shiftTo === 0 ? (r() < 0.5 ? -1 : 1) : r() < 0.4 ? 0 : -this.shiftTo;
          this.shiftAt = t + 4 + r() * 6;
        }
        this.shift += (this.shiftTo - this.shift) * Math.min(1, dt * 2.2);
        if (rig.side) {
          p.body.x += -0.6 * this.shift;
          p.legR.hip += 3 * this.shift;
          p.legR.knee += -4 * Math.max(0, this.shift);
          p.legL.knee += -4 * Math.max(0, -this.shift);
        } else {
          p.body.x += 1.1 * this.shift;
          p.body.rot += -0.9 * this.shift;
          // the free leg bends a little
          p.legL.s = legLen(p.body.y, 0.9 * Math.max(0, this.shift));
          p.legR.s = legLen(p.body.y, 0.9 * Math.max(0, -this.shift));
          p.legL.hip = -1.2 * Math.max(0, this.shift);
          p.legR.hip = 1.2 * Math.max(0, -this.shift);
        }
      } else if (m.typing) {
        // typing in bursts: the hands tap, with pauses to read
        const burst = Math.sin(t * 0.9) > -0.2;
        if (burst) {
          const k = rig.side ? 3 : 4;
          p.armR.el += k * Math.sin(t * 19);
          p.armL.el -= k * Math.sin(t * 19 + 1.7);
        }
        p.head.rot += 1.2 * Math.sin(t * 0.7);
      }
      // a glance about now and then
      if (t > this.lookAt) {
        this.lookTo = this.lookTo === 0 ? (r() - 0.5) * 9 : 0;
        this.lookAt = t + (this.lookTo === 0 ? 3 + r() * 6 : 1.2 + r() * 2);
      }
      this.look += (this.lookTo - this.look) * Math.min(1, dt * 5);
      p.head.rot += this.look;
    }
    // walking takes over the legs, the hips and the swing of the arms
    if (this.walkW > 0) p = lerpPose(p, walkPose(rig, this.phase, 1), ease(this.walkW));

    // carrying: the right hand holds it (no swing, no typing with it), and
    // brings it up for each sip
    if (m.held) {
      const st = heldState(m.held.kind, m.held.since);
      const up = sipEnv(st.sip);
      p.armR = lerpArm(holdArm(rig), sipArm(rig), up);
      if (up > 0) {
        p.head.rot += (rig.side ? 7 : 0) * up;
        p.head.y += -0.8 * up;
      }
      this.sipping = st.sip >= 0.32 && st.sip <= 0.68;
    } else this.sipping = false;

    // using something: the body shows it, blended in and out
    if (m.busy) this.busyWhat = m.busy;
    this.busyW = Math.max(0, Math.min(1, this.busyW + (m.busy && !rig.sit ? dt : -dt) * 5));
    if (this.busyW > 0 && this.busyWhat) p = lerpPose(p, atWork(rig, this.busyWhat, p, t), ease(this.busyW));

    // lowering onto the seat (from a little higher) or rising off it (from a crouch)
    if (this.settleT < 1 && !m.reduced) {
      const k = 1 - ease(this.settleT);
      p.body.y += (rig.sit ? -5 : 3.5) * k;
      p.head.y += (rig.sit ? -1 : 1) * k;
      if (!rig.sit && !rig.side) {
        p.legL.s = legLen(p.body.y, 0);
        p.legR.s = legLen(p.body.y, 0);
      }
    }

    // ── the face: blinking, talking
    if (!m.reduced && t > this.blinkAt) {
      this.blinkUntil = t + 0.11;
      this.blinkAt = t + (r() < 0.2 ? 0.25 : 2.2 + r() * 4);
    }
    // (eyes closed while drinking)
    let face: Pose["face"] = t < this.blinkUntil || this.sipping ? "blink" : "open";
    if (m.speaking) {
      if (t > this.mouthAt) {
        this.mouthOpen = !this.mouthOpen;
        this.mouthAt = t + (this.mouthOpen ? 0.07 + r() * 0.1 : 0.05 + r() * 0.12);
      }
      if (this.mouthOpen && face === "open") face = "talk";
      if (!m.reduced) {
        p.head.rot += 1.6 * Math.sin(t * 4.3);
        p.head.y += 0.35 * Math.sin(t * 8.1);
        // a hand comes up to make a point, now and then
        if (t > this.gestureAt && !rig.sit && this.walkW < 0.5 && !m.held) {
          this.gestureUntil = t + 1 + r() * 0.8;
          this.gestureAt = t + 3 + r() * 4;
        }
        const g = gestureEnv(t, this.gestureUntil - 1.4, this.gestureUntil);
        if (g > 0 && !m.held) p.armR = lerpArm(p.armR, explain(rig, t), g);
      }
    } else this.mouthOpen = false;
    p.face = face;

    // ── with someone: a high five, a fist bump, cheers, a drink handed over
    if (m.act && !rig.sit) {
      const { what, t: at, len } = m.act;
      const w = m.reduced ? 1 : ease(at / 0.3) * (1 - ease((at - (len - 0.35)) / 0.35));
      if (w > 0) p = what === "wave" ? emotePose(rig, "wave", p, at, w) : together(rig, what, p, at / len, w);
    }

    // ── emotes: a short gesture for each
    if (m.emote !== this.emote) {
      this.emote = m.emote;
      this.emoteT = 0;
    }
    if (this.emote) {
      this.emoteT += dt;
      const len = m.reduced ? 1.2 : 3.2;
      const e = ease(this.emoteT / 0.28) * (1 - ease((this.emoteT - (len - 0.4)) / 0.4));
      if (e > 0) p = emotePose(rig, this.emote, p, this.emoteT, e);
    }
    return p;
  }
}

// Using something, standing at it.
function atWork(rig: Rig, what: string, base: Pose, t: number): Pose {
  const p: Pose = {
    ...base,
    body: { ...base.body },
    head: { ...base.head },
    armL: { ...base.armL },
    armR: { ...base.armR },
  };
  const side = rig.side;
  switch (what) {
    case "coffee":
    case "water":
    case "vending":
      // reaching out to press its button
      p.armR = side
        ? { sh: 55, el: 18 + 6 * Math.sin(t * 6), su: 1, sf: 1 }
        : { sh: 12, el: 62 + 6 * Math.sin(t * 6), su: 0.9, sf: 0.66 };
      p.head.rot += side ? -2 : 2;
      break;
    case "throw":
      // the follow-through of a throw: the arm out and up, the body leaning in
      p.armR = side ? { sh: 118, el: 6, su: 1, sf: 1 } : { sh: 48, el: 24, su: 0.9, sf: 0.62 };
      p.body.rot += side ? 3 : 1;
      p.head.rot += side ? -3 : 1;
      break;
    case "arcade": {
      // both hands on the controls, mashing
      const mash = Math.sin(t * 17);
      p.armR = side ? { sh: 32, el: 52 + 6 * mash, su: 1, sf: 1 } : { sh: 10, el: 58 + 6 * mash, su: 0.95, sf: 0.55 };
      p.armL = side
        ? { sh: 32, el: 52 - 6 * mash, su: 1, sf: 1 }
        : { sh: -10, el: -58 + 6 * Math.sin(t * 13), su: 0.95, sf: 0.55 };
      p.armLFront = !side;
      p.body.x += 0.5 * Math.sin(t * 3);
      p.head.rot += 1.5 * Math.sin(t * 2.2);
      break;
    }
    case "piano": {
      // hands along the keys, swaying with it
      const run = Math.sin(t * 2.3);
      p.armR = side
        ? { sh: 28 + 4 * run, el: 50 + 5 * Math.sin(t * 9), su: 1, sf: 1 }
        : { sh: 9 + 4 * run, el: 52 + 5 * Math.sin(t * 9), su: 0.95, sf: 0.55 };
      p.armL = side
        ? { sh: 28 - 4 * run, el: 50 + 5 * Math.sin(t * 7), su: 1, sf: 1 }
        : { sh: -9 + 4 * run, el: -52 - 5 * Math.sin(t * 7), su: 0.95, sf: 0.55 };
      p.armLFront = !side;
      p.body.rot += 1.2 * Math.sin(t * 1.4);
      p.head.rot += 3 * Math.sin(t * 1.4 + 0.6);
      break;
    }
    case "slotcar":
    case "gamepad": {
      // the hand controller held in front, the thumb working the trigger,
      // leaning into the corners
      const thumb = Math.sin(t * 9);
      p.armR = side ? { sh: 30, el: 66 + 4 * thumb, su: 1, sf: 1 } : { sh: 8, el: 70 + 4 * thumb, su: 0.95, sf: 0.5 };
      p.armL = side ? { sh: 30, el: 64, su: 1, sf: 1 } : { sh: -8, el: -70, su: 0.95, sf: 0.5 };
      p.armLFront = !side;
      p.body.rot += 2.2 * Math.sin(t * 1.7);
      p.head.rot += 2.5 * Math.sin(t * 1.7 + 0.4);
      break;
    }
    case "whiteboard":
      // a hand up at the board, writing
      p.armR = side
        ? { sh: 118, el: 12 + 10 * Math.sin(t * 5), su: 1, sf: 1 }
        : { sh: -96, el: -32 + 12 * Math.sin(t * 5), su: 0.95, sf: 0.92 };
      break;
    default:
      return base;
  }
  return p;
}

// Two people at it: the right arm (the drink's hand) reaches for the other
// one; the hands meet at CONTACT (0.45 of the way) — a slap, a bump, a clink.
function together(rig: Rig, what: string, base: Pose, k: number, w: number): Pose {
  const p: Pose = { ...base, body: { ...base.body }, head: { ...base.head }, armR: { ...base.armR } };
  const side = rig.side;
  // the moment the hands meet: a little push forward
  const hit = Math.max(0, 1 - Math.abs(k - 0.45) / 0.1);
  let arm: ArmPose;
  switch (what) {
    case "highfive":
      // up high, open hand
      arm = side ? { sh: 140 - 14 * hit, el: 12, su: 1, sf: 1 } : { sh: -148, el: -18 + 10 * hit, su: 0.92, sf: 0.95 };
      p.body.y += -0.8 * hit;
      p.face = hit > 0.2 ? "talk" : p.face;
      break;
    case "fistbump":
      // a fist at chest height, out towards them
      arm = side
        ? { sh: 78 + 8 * hit, el: 18 - 10 * hit, su: 1, sf: 1 }
        : { sh: 9, el: 74 - 8 * hit, su: 0.9, sf: 0.5 };
      break;
    case "cheers":
      // the drink up between you
      arm = side ? { sh: 96 + 6 * hit, el: 46, su: 1, sf: 1 } : { sh: 22, el: 118 - 6 * hit, su: 0.92, sf: 0.66 };
      p.face = hit > 0.2 ? "talk" : p.face;
      break;
    case "give":
    case "take":
      // arm out, hand open (the drink goes across as the hands meet)
      arm = side ? { sh: 66, el: 14, su: 1, sf: 1 } : { sh: 8, el: 70, su: 0.9, sf: 0.52 };
      break;
    default:
      return base;
  }
  p.armR = arm;
  p.head.rot += side ? -2 : 1.5;
  return lerpPose(base, p, w);
}

// in over 0.3 s, out over 0.4 s
function gestureEnv(t: number, from: number, to: number) {
  if (t < from || t > to) return 0;
  return ease((t - from) / 0.3) * (1 - ease((t - (to - 0.4)) / 0.4));
}

// making a point while talking: the forearm up, the hand open
function explain(rig: Rig, t: number): ArmPose {
  if (rig.side) return { sh: 18, el: 70 + 8 * Math.sin(t * 3), su: 1, sf: 1 };
  return { sh: 6, el: 58 + 8 * Math.sin(t * 3), su: 0.96, sf: 0.7 };
}

// One emote's gesture over the pose, weighted by `w`.
function emotePose(rig: Rig, emote: string, base: Pose, t: number, w: number): Pose {
  const p: Pose = {
    ...base,
    body: { ...base.body },
    head: { ...base.head },
    armL: { ...base.armL },
    armR: { ...base.armR },
    legL: { ...base.legL },
    legR: { ...base.legR },
  };
  const side = rig.side;
  const sit = rig.sit;
  switch (emote) {
    case "wave": {
      const swing = Math.sin(t * 11);
      p.armR = side
        ? { sh: 150, el: 25 + 22 * swing, su: 1, sf: 1 }
        : { sh: -150, el: -28 + 24 * swing, su: 0.96, sf: 0.95 };
      p.head.rot += side ? -2 : 3;
      break;
    }
    case "clap": {
      const hit = Math.abs(Math.sin(t * 8));
      if (side) {
        p.armR = { sh: 30, el: 76 - 10 * hit, su: 1, sf: 1 };
        p.armL = { sh: 30, el: 76 - 10 * hit, su: 1, sf: 1 };
      } else {
        p.armL = { sh: -16, el: -92 + 12 * hit, su: 0.95, sf: 0.8 };
        p.armR = { sh: 16, el: 92 - 12 * hit, su: 0.95, sf: 0.8 };
        p.armLFront = true;
      }
      p.face = "talk";
      break;
    }
    case "laugh":
      p.body.rot += 1.6 * Math.sin(t * 22);
      p.body.y += 0.5 * Math.sin(t * 22);
      p.head.rot += side ? 4 : -5;
      p.face = Math.sin(t * 18) > 0 ? "talk" : "blink";
      if (!side) {
        p.armL = { sh: -14, el: -100, su: 0.95, sf: 0.75 };
        p.armL.el += 4 * Math.sin(t * 22);
        p.armLFront = true;
      }
      break;
    case "heart":
      if (side) p.armR = { sh: 20, el: 110, su: 1, sf: 1 };
      else {
        p.armL = { sh: -18, el: -112, su: 0.95, sf: 0.72 };
        p.armR = { sh: 18, el: 112, su: 0.95, sf: 0.72 };
        p.armLFront = true;
      }
      p.head.rot += 4;
      p.face = "blink";
      break;
    case "question":
      p.armR = side ? { sh: 22, el: 128, su: 1, sf: 1 } : { sh: 8, el: 140, su: 0.95, sf: 0.75 };
      p.head.rot += side ? -5 : 7;
      break;
    case "fire": {
      const pump = Math.sin(t * 9);
      p.armR = side
        ? { sh: 165 + 12 * pump, el: 10, su: 1, sf: 1 }
        : { sh: -165 - 12 * pump, el: -12, su: 0.95, sf: 0.95 };
      if (!sit) p.body.y += -1.2 * Math.max(0, pump);
      p.face = "talk";
      break;
    }
    case "coffee":
      // a sip (the mug itself comes with build of held things)
      p.armR = side ? { sh: 26, el: 112, su: 1, sf: 1 } : { sh: 8, el: 132, su: 0.95, sf: 0.72 };
      p.head.rot += side ? 6 : -3;
      break;
    case "tape": {
      // a little dance
      const beat = Math.sin(t * 7);
      if (!sit) {
        p.body.x += 2.2 * beat;
        p.body.rot += 3.5 * beat;
        p.body.y += -1.4 * Math.abs(Math.cos(t * 7));
        const lift = 2.4 * Math.max(0, Math.cos(t * 7));
        if (!side) {
          p.legL.s = legLen(p.body.y, beat > 0 ? lift : 0);
          p.legR.s = legLen(p.body.y, beat > 0 ? 0 : lift);
        }
      }
      p.armL = side
        ? { sh: -40, el: 60 + 20 * beat, su: 1, sf: 1 }
        : { sh: 40 + 15 * beat, el: -60, su: 0.95, sf: 0.9 };
      p.armR = side ? { sh: 40, el: 60 - 20 * beat, su: 1, sf: 1 } : { sh: -40 + 15 * beat, el: 60, su: 0.95, sf: 0.9 };
      p.head.rot += 6 * beat;
      p.face = "talk";
      break;
    }
    default:
      return base;
  }
  return lerpPose(base, p, w);
}

export { restArm, restLeg };
