import { CanvasTexture, type Object3D, Sprite, SpriteMaterial, Vector3 } from "three";
import { body, type Ch, smoother, steady } from "../moves";
import { HANDS, handPose, type JointName, type Pose } from "../rig";

// (a pulse: the sine's upper half, squared — it starts and ends at rest, no corner where it sets off:
// plan 58 10, the census's pops)
const bump = (x: number) => {
  const s = Math.sin(x);
  return s > 0 ? s * s : 0;
};

// Plan 58 phase 9 (docs/plan/58-the-animation.md): reactions and life — the cold (hunched, the arms
// hugged in, a shiver, the hands rubbed and blown into, the breath a puff in the air), catching her
// breath when spent (bent over, the hands on the knees), the idle by who she is (old, brisk, tired,
// bouncy, heavy), and a sound's turn of the head (a loud one close: a flinch, the dark's). Loaded with
// the hero's (`loadHero`), a chunk of its own. Hands as targets in her own space (x her left, y up from
// her feet, z ahead) for the model to reach last.

/** The bundle's mark (tools/budget.mjs finds it by this). */
export const LIFE_CHUNK = "yutopia-life";

export interface Hand {
  at: [number, number, number];
  w: number;
  pole?: [number, number, number];
}
export type Hands = { L?: Hand; R?: Hand };
export interface Life2 {
  /** joints laid over the body at `w`; `add` turns added on top (a tapping toe, a knee's dip) */
  pose: Pose;
  w: number;
  add?: Pose;
  /** how much (0..1) the idle's glances are held off: her eyes on her own hands */
  eyesDown?: number;
  hands: Hands | null;
  lift: [number, number, number];
}

const hash = (n: number, s: number) => {
  const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const win = (u: number, a: number, b: number, e = 0.1) => smoother((u - a) / e) * (1 - smoother((u - b) / e));
const ELBOW_OUT: [number, number, number] = [-1, -0.3, -0.3];
const TOP: JointName[] = [
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "wristL",
  "wristR",
];
const pick = (m: Pose, js: JointName[]): Pose => {
  const out: Pose = {};
  for (const j of js) if (m[j]) out[j] = m[j];
  for (const k of Object.keys(m)) if (/^(fingers|index|thumb)/.test(k)) out[k as JointName] = m[k as JointName];
  return out;
};

/** How cold (0..1) from the warmth (Player.wm, 0..100): none at 70, all of it by 20. */
export const coldOf = (wm: number) => smoother((70 - wm) / 50);
/** How spent (0..1) from the stamina (Player.st, 0..100): none over 40, all of it at 5. */
export const spentOf = (st: number) => smoother((40 - st) / 35);

/** A shiver's tremor now (0..1 of it): in bursts of most of a second, every few, harder the colder. */
function shiverAt(t: number, cold: number, seed: number): number {
  const P = 4.5 - 2 * cold + 1.5 * hash(1, seed);
  const n = Math.floor(t / P);
  const u = t - n * P;
  return hash(n + 9, seed) < 0.35 + 0.5 * cold ? win(u, 0.05, 0.85, 0.12) : 0;
}

/** The life laid over her (`still` 1 stood … 0 on the move): the cold, the breath caught, who she is. */
export function life2(o: {
  t: number;
  seed: number;
  gait: string;
  cold: number;
  spent: number;
  still: number;
  /** her hands are taken (a torch, a gun, the phone…): only the trunk's share */
  busy: number;
  breath: number;
}): Life2 {
  const { t, seed, cold, spent, still } = o;
  const free = 1 - o.busy;
  const br = Math.sin(o.breath * Math.PI * 2);
  const lift: [number, number, number] = [0, 0, 0];
  // ── spent: bent over the knees (bent, the back rounded), the hands on them, the whole body heaving
  // with each breath; the head hung, lifted to look ahead now and then
  const bent = still * smoother((spent - 0.5) / 0.3);
  if (bent > 0.01) {
    const look = win((t % 6.5) / 6.5, 0.55, 0.75, 0.06);
    const c: Ch = {
      hx: 0.22,
      sx: 0.32 + 0.05 * br,
      cx: 0.22 - 0.08 * br,
      nx: 0.05 - 0.15 * look,
      dx: 0.35 - 0.55 * look,
      tL: -0.62,
      kL: 0.95,
      fL: 0,
      tR: -0.55,
      kR: 0.9,
      fR: 0,
      aL: 0.1,
      aR: 0.1,
      sL: -0.55,
      sR: -0.55,
      up: -0.13,
    };
    const m = body(steady(c, 0.25));
    lift[1] = 0.012 * br;
    // (on each knee's top: the hips back and down, the thighs forward)
    const knee = (S: 1 | -1): [number, number, number] => [S * 0.11, 0.38, 0.17];
    const hands: Hands | null =
      free > 0.5
        ? { L: { at: knee(1), w: bent, pole: ELBOW_OUT }, R: { at: knee(-1), w: bent, pole: ELBOW_OUT } }
        : null;
    Object.assign(m.pose, handPose(1, HANDS.relaxed), handPose(-1, HANDS.relaxed));
    return { pose: m.pose, w: bent, hands, lift };
  }
  // ── the cold: hunched and sunk into the collar, the knees in; stood, hugging herself — the hands
  // tucked under the arms — rocking on her feet; now and then the hands rubbed hard before the mouth,
  // then cupped and blown into; on the move, the hands in the pockets; a shiver in bursts that shows
  if (cold > 0.05) {
    const sh = shiverAt(t, cold, seed) * cold;
    const tr = (k: number, a: number) => sh * a * Math.sin(t * 69 + k * 1.7);
    const rock = Math.sin(t * 4.6) * still;
    const c: Ch = {
      cx: 0.16 * cold + tr(1, 0.03),
      sx: 0.08 * cold,
      nx: 0.2 * cold,
      dx: 0.05 * cold + tr(2, 0.05),
      sz: tr(3, 0.03),
      sL: -0.2 * cold + tr(4, 0.07),
      sR: -0.2 * cold + tr(5, 0.07),
      oL: -0.08 * cold,
      oR: -0.08 * cold,
      eL: -1.1 * cold,
      eR: -1.1 * cold,
    };
    // (the knees in together, soft, rocking from foot to foot: added to the legs as they are)
    const knees: Pose = {
      thighL: [0, 0, -0.05 * cold * still],
      thighR: [0, 0, 0.05 * cold * still],
      kneeL: [(0.1 + 0.06 * (rock > 0 ? rock * rock : 0)) * cold * still + tr(6, 0.04), 0, 0],
      kneeR: [(0.1 + 0.06 * (rock < 0 ? rock * rock : 0)) * cold * still + tr(7, 0.04), 0, 0],
    };
    lift[0] = 0.012 * rock * cold;
    lift[1] = -0.012 * cold * still;
    // the hands: stood — hugged (under the arms) and now and then rubbed and blown into; going — in
    // the pockets
    const P = 10 + 3 * hash(3, seed);
    const u = (t % P) / P;
    const rubW = smoother((u - 0.55) / 0.04) * (1 - smoother((u - 0.88) / 0.04));
    const blow = win(u, 0.76, 0.87, 0.025);
    const hugW = smoother((cold - 0.25) / 0.3);
    const rub = (S: 1 | -1): [number, number, number] => {
      const r = Math.sin(t * 15) * (1 - blow);
      return [S * (0.012 + 0.012 * blow) + 0.022 * r * S, 1.33 + 0.03 * r * S + 0.1 * blow, 0.21 - 0.07 * blow];
    };
    const hug = (S: 1 | -1): [number, number, number] => [-S * 0.15, 1.13 + tr(8 + S, 0.01), 0.06];
    const pocket = (S: 1 | -1): [number, number, number] => [S * 0.13, 0.9, 0.11];
    const at = (S: 1 | -1): [number, number, number] => {
      const a = hug(S);
      const b = rub(S);
      const p = pocket(S);
      const stood = a.map((x, k) => x + (b[k] - x) * rubW);
      return stood.map((x, k) => p[k] + (x - p[k]) * still) as [number, number, number];
    };
    const hw = free * Math.max(hugW * still, (1 - still) * cold, rubW * still);
    let hands: Hands | null = null;
    if (hw > 0.01)
      hands = {
        L: { at: at(1), w: hw, pole: still > 0.5 ? [-0.2, -1, 0.3] : [-0.15, -1, -0.35] },
        R: { at: at(-1), w: hw, pole: still > 0.5 ? [-0.2, -1, 0.3] : [-0.15, -1, -0.35] },
      };
    // (blowing into them: the head over them a little, the chest drawing in then out)
    c.dx = (c.dx ?? 0) + 0.12 * blow;
    c.cx = (c.cx ?? 0) - 0.06 * blow * br;
    const m = body(steady(c, 0.15 * cold));
    const p = pick(m.pose, TOP);
    const cup = { fingers: 0.75, index: 0.7, thumb: 0.35 };
    const hand = rubW > 0.5 ? (blow > 0.3 ? cup : HANDS.open) : still > 0.5 ? HANDS.open : HANDS.loose;
    Object.assign(p, handPose(1, hand), handPose(-1, hand));
    return {
      pose: p,
      w: Math.min(1, cold * 1.3) * Math.max(0.5, free),
      hands,
      lift,
      add: knees,
      eyesDown: rubW * still,
    };
  }
  // ── who she is, stood (her walk's style)
  if (still < 0.05 || free < 0.5) return { pose: {}, w: 0, hands: null, lift };
  let c: Ch = {};
  let hands: Hands | null = null;
  const extra: Pose = {};
  switch (o.gait) {
    case "old": {
      // stooped, the hands held behind her; slow, the head nodding a little, a glance round now and then
      const g = win((t % 9) / 9, 0.4, 0.62, 0.08);
      c = {
        sx: 0.22,
        cx: 0.08,
        nx: 0.14,
        dx: -0.12 + 0.03 * Math.sin(t * 1.1),
        dy: 0.55 * g * (hash(Math.floor(t / 9), seed) < 0.5 ? 1 : -1),
        kL: 0.08,
        kR: 0.08,
      };
      hands = {
        L: { at: [0.03, 0.92, -0.17], w: still, pole: [-0.6, -0.5, 0.6] },
        R: { at: [-0.03, 0.9, -0.17], w: still, pole: [-0.6, -0.5, 0.6] },
      };
      break;
    }
    case "brisk": {
      // upright; a look at the watch now and then (the left forearm up across, its face turned up, the
      // head down to it); between, the right foot's toes tapping, impatient
      const P = 6 + 2 * hash(4, seed);
      const u = (t % P) / P;
      const watch = win(u, 0.08, 0.3, 0.05);
      c = { sx: -0.03, cx: -0.04, dx: 0.42 * watch, dy: 0.25 * watch };
      if (watch > 0.01) hands = { L: { at: [-0.02, 1.2, 0.3], w: watch * still, pole: [-0.9, -0.4, 0] } };
      if (watch > 0.01) extra.wristL = [0, -1.3 * watch, 0];
      const tap = (1 - watch) * win(u, 0.4, 0.95, 0.05) * bump(t * 13);
      extra.ankleR = [-0.35 * tap, 0, 0];
      break;
    }
    case "tired": {
      // slumped on one hip, the arms hanging heavy; a sigh — up and in, held, let go and down; now and
      // then a hand rubbing the back of the neck
      const P = 7 + 3 * hash(5, seed);
      const n = Math.floor(t / P);
      const u = (t - n * P) / P;
      const inhale = win(u, 0.15, 0.3, 0.06);
      const out = win(u, 0.3, 0.5, 0.06);
      const neck = hash(n + 11, seed) < 0.5 ? win(u, 0.6, 0.9, 0.05) : 0;
      c = {
        hz: 0.07,
        sz: -0.06,
        sx: 0.12 - 0.1 * inhale + 0.08 * out,
        cx: 0.06 - 0.14 * inhale + 0.1 * out,
        nx: 0.08,
        dx: 0.1 - 0.25 * inhale + 0.25 * out,
        sL: 0.06,
        sR: 0.06,
        oL: 0.03,
        oR: 0.03,
        eL: -0.12,
        eR: -0.12,
      };
      lift[0] = -0.03;
      lift[1] = -0.015 + 0.012 * inhale;
      if (neck > 0.01)
        hands = { R: { at: [-0.04 + 0.03 * Math.sin(t * 7), 1.47, -0.07], w: neck * still, pole: [-0.8, 0.4, 0] } };
      break;
    }
    case "bouncy": {
      // up on the balls of her feet to a beat, a dip in the knees on each, the shoulders grooving, the
      // head bobbing, looking round
      const b = bump(t * 7);
      const d = bump(-(t * 7));
      c = {
        sz: 0.05 * Math.sin(t * 3.5),
        dz: 0.06 * Math.sin(t * 3.5),
        dx: 0.05 * b,
        dy: 0.45 * Math.sin(t * 0.7 + seed),
        sx: -0.02,
      };
      extra.ankleL = [0.28 * b, 0, 0];
      extra.ankleR = [0.28 * b, 0, 0];
      extra.kneeL = [0.12 * d, 0, 0];
      extra.kneeR = [0.12 * d, 0, 0];
      lift[1] = 0.03 * b - 0.006 * d;
      break;
    }
    case "heavy":
      // stood wide, the arms folded, the weight on one leg, the chin up
      c = { sx: -0.05, cx: -0.04, dx: -0.06, hz: 0.04 };
      lift[0] = 0.025;
      hands = {
        L: { at: [-0.12, 1.15, 0.2], w: still, pole: ELBOW_OUT },
        R: { at: [0.12, 1.18, 0.18], w: still, pole: ELBOW_OUT },
      };
      break;
    default:
      return { pose: {}, w: 0, hands: null, lift };
  }
  const m = body(steady(c));
  const p = pick(m.pose, TOP);
  if (c.hz) p.hips = m.pose.hips;
  return { pose: p, w: still, hands, lift, add: extra, eyesDown: o.gait === "brisk" ? (extra.wristL ? 1 : 0) : 0 };
}

/** A sound sharp and close behind or beside, `t` s ago from `from` (rad off the facing, + left):
 *  ducked, the shoulders up and in, the knees dipped — then the head whipped round to it. Turns added
 *  to the pose, the arms up a little to guard (`guard`, its weight). */
export function startle(
  from: number,
  t: number,
): { add: Partial<Record<JointName, [number, number, number]>>; w: number; lift: number } {
  const k = smoother(t / 0.07) * (1 - smoother((t - 0.25) / 0.5));
  const turn = smoother((t - 0.12) / 0.2) * (1 - smoother((t - 1.4) / 0.6));
  const s = Math.max(-1.2, Math.min(1.2, from));
  return {
    add: {
      chest: [0.14 * k, 0.3 * s * turn, 0],
      spine: [0.06 * k, 0.15 * s * turn, 0],
      neck: [0.18 * k, 0.2 * s * turn, 0],
      head: [-0.05 * k, 0.4 * s * turn, 0],
      shoulderL: [-0.35 * k, 0, -0.15 * k],
      shoulderR: [-0.35 * k, 0, 0.15 * k],
      elbowL: [-0.9 * k, 0, 0],
      elbowR: [-0.9 * k, 0, 0],
      kneeL: [0.25 * k, 0, 0],
      kneeR: [0.25 * k, 0, 0],
    },
    w: k,
    lift: -0.05 * k,
  };
}

// ── the breath in the cold: a puff from the mouth with each breath out, drifting ahead and up,
// swelling and gone (the view's: one each per person, near only)
let tex: CanvasTexture | null = null;
const up = new Vector3(0, 0.12, 0);
export class Puffs {
  private readonly list: { s: Sprite; t: number; v: Vector3 }[] = [];
  private was = 0;
  constructor(private readonly parent: Object3D) {}
  /** `mouth` and `ahead` where she breathes and which way (world); `breath` 0..1 its cycle (out from
   *  0.5); `cold` 0..1 how much shows. */
  update(dt: number, mouth: Vector3, ahead: Vector3, breath: number, cold: number): void {
    if (!tex) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 32;
      const g = cv.getContext("2d");
      if (g) {
        const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, "rgba(255,255,255,0.9)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 32, 32);
      }
      tex = new CanvasTexture(cv);
    }
    // a puff as the breath turns out
    if (cold > 0.15 && this.was < 0.5 && breath >= 0.5 && this.list.length < 6) {
      const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.copy(mouth);
      s.scale.setScalar(0.05);
      this.parent.add(s);
      this.list.push({ s, t: 0, v: ahead.clone().multiplyScalar(0.35).add(up) });
    }
    this.was = breath;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(0.05 + 0.22 * p.t);
      const m = p.s.material;
      m.opacity = 0.32 * Math.min(1, cold * 1.5) * Math.min(1, p.t / 0.12) * Math.max(0, 1 - p.t / 1.1);
      if (p.t > 1.1) {
        this.parent.remove(p.s);
        m.dispose();
        this.list.splice(i, 1);
      }
    }
  }
  dispose(): void {
    for (const p of this.list) {
      this.parent.remove(p.s);
      p.s.material.dispose();
    }
    this.list.length = 0;
  }
}
