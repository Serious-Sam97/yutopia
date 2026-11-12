// Plan 80 — the revolver held as a person holds one (docs/plan/80-the-revolver.md). The gun is the anchor:
// placed in front of her by what she's doing (RE4 Remake's low ready, the isosceles aim, AW2's Harries with
// the torch), the right hand turned so it holds the gun there, the left put on the gun at a place on it with
// its own turn (chars/model.ts gripTo, wristFor) — the numbers the phase 0 mocks' (tools/art/guns/mock80.py,
// signed off 2026-11-12), in her frame: from her shoulders' middle, x her left, y up, z ahead, in the mocks'
// man's metres (scaled by her arms' length against his: 0.501 m shoulder to wrist).
import { Matrix4, type Quaternion, Vector3 } from "three";

/** Her frame (the world's): the shoulders' middle; her left, up and ahead (unit); her size against the
 *  mocks' man */
export interface BodyFrame {
  mid: Vector3;
  left: Vector3;
  up: Vector3;
  ahead: Vector3;
  k: number;
}

/** How far ahead of the shoulders the aimed gun's grip is (m, the mocks' man's): the mocks had 0.48 for the
 *  palm's middle; the game's grip sits further out in the hand (at the fingers' roots), so further — the
 *  elbows a little soft, not folded (at 0.48 they bent 66° and the wrists turned past their reach) */
export const AIM_REACH = 0.55;
/** The aimed grip over the shoulders (m, the mocks' man's): about level with them — the arms out level, the
 *  bore a hand over them, the head down to it (the mocks' 6 cm over had the forearms rising to wrists bent
 *  50° down to the grip) */
export const AIM_HIGH = -0.01;
/** Aimed, the right wrist this much of the arm's reach from the shoulder: nearly straight, the elbow soft (~25°:
 *  at 0.94 it bent 42°) */
export const AIM_ARM = 0.985;
/** The low ready (RE4 Remake's): the isosceles lowered this much (rad) — the muzzle at the ground ~2 m ahead */
export const READY_PITCH = -0.8;
/** …the elbows a little softer than aimed */
export const READY_ARM = 0.93;
/** The mocks' man's arm, shoulder to wrist (m) */
export const MOCK_ARM = 0.501;

/** Where the gun goes (its grip point — the model's origin — the barrel's way, its top's: the world's), and
 *  the left hand: on the gun in the support grip, or holding the torch (its wrist's place, the world's). */
export interface RevolverHold {
  grip: Vector3;
  f: Vector3;
  u: Vector3;
  left: "support" | "torch";
  torchAt: Vector3;
  /** the gun moved along its way till the right wrist is this much of the arm's reach from the shoulder (0:
   *  where it's put) */
  reach: number;
  /** the elbows' poles (the right arm's terms: chars/model.ts reachTo mirrors the left's) */
  poleR: [number, number, number];
  poleL: [number, number, number];
}

/** (in the gun's own frame: x along the barrel, y its top, z its right; m) The support hand on the grip's
 *  left panel over the right's fingers: its palm's middle, the fingers' way (forward and down, round the
 *  grip's front), its index side (forward and up: the thumb along the frame). The mocks' support_hand. */
export const SUPPORT = {
  // (4 cm further back than the mocks': the game's right hand sits further back on the grip — its fingers'
  // roots on it, not its palm's middle — and the support hand fills what it leaves of the panel; 4 cm out
  // to its left, over the right's fingertips wrapped round to that side)
  palm: new Vector3(-0.042, -0.034, -0.04),
  // (the mocks' had the fingers 51° down: with the forearms level the wrist bent 57° sideways — 36° here)
  along: new Vector3(0.78, -0.57, 0.12).normalize(),
  index: new Vector3(0.57, 0.78, 0).normalize(),
};
/** (the gun's frame) Where the support thumb's pad goes: along the frame's left side under the cylinder's
 *  front — thumbs forward */
export const SUPPORT_THUMB = new Vector3(0.06, 0.036, -0.027);
/** (plan 80 phase 3) Harries, aimed with the torch: the left fist under the right wrist (its palm's middle this
 *  far under the wrist, m), the back of the hand up against it, the torch held ice-pick — its lens out of the
 *  little finger's side, ahead along the barrel */
export const HARRIES = { under: 0.072, ahead: 0.0, right: 0.01 };
/** A shot's kick on the hold: the muzzle up (rad), the gun back and up (m) — the wrists giving */
export const KICK = { flip: 0.32, back: 0.03, up: 0.012 };
/** The trigger finger: straight along the frame at the ready, in the guard on the trigger aimed (and how much
 *  further a pull curls it) — the library's curls */
export const INDEX = { ready: 0.12, aim: 0.62, pull: 0.3 };
/** (the gun's frame) What the support hand's fingers close round: the right fist on the grip — a round
 *  thing along the grip's rake, a little ahead of the grip's own middle (the right fingers round its front) */
export const FIST = { at: new Vector3(-0.004, -0.024, 0), r: 0.037, hy: 0.045 };

const _v = new Vector3();
const _a = new Vector3();
const _u = new Vector3();
const _m = new Matrix4();
/** A point in her frame (from her shoulders' middle: x her left, y up, z ahead; the mocks' man's m), the
 *  world's */
export const at = (B: BodyFrame, x: number, y: number, z: number, out: Vector3) =>
  out
    .copy(B.mid)
    .addScaledVector(B.left, x * B.k)
    .addScaledVector(B.up, y * B.k)
    .addScaledVector(B.ahead, z * B.k);

/** The hold for what she's doing: aiming (`pitch` up, rad) or at the low ready (`run` 0..1: tucked closer
 *  running), the torch on or not. Into `out`. */
export function revolverHold(
  B: BodyFrame,
  s: { aiming: boolean; pitch: number; torch: boolean; run: number },
  out: RevolverHold,
): RevolverHold {
  const { left, up, ahead } = B;
  const r = s.run;
  if (s.aiming || !s.torch) {
    // isosceles, thumbs forward: the grip at the shoulders' height (AIM_HIGH), ahead of them (the arms nearly
    // straight: AIM_ARM), the sights under the eyes; the whole of it turned up about the shoulders as she aims
    // up. The low ready (RE4 Remake's): the same, lowered — the arms out and down READY_PITCH, the elbows
    // softer (READY_ARM), the muzzle at the ground a couple of metres ahead; running, tucked in and steeper.
    const pitch = s.aiming ? s.pitch : READY_PITCH - 0.22 * r;
    const c = Math.cos(pitch);
    const sn = Math.sin(pitch);
    const fwd = _a.copy(ahead).multiplyScalar(c).addScaledVector(up, sn);
    const top = _u.copy(up).multiplyScalar(c).addScaledVector(ahead, -sn);
    out.grip
      .copy(B.mid)
      .addScaledVector(left, -0.03 * B.k)
      .addScaledVector(top, AIM_HIGH * B.k)
      .addScaledVector(fwd, AIM_REACH * B.k);
    out.f.copy(fwd);
    out.u.copy(top);
    out.reach = s.aiming ? AIM_ARM : READY_ARM - 0.1 * r;
    out.poleR = [-1, -0.7, -0.2];
    out.poleL = [-1, -0.7, -0.2];
    if (s.torch) {
      // (Harries: the torch hand crossed under the gun hand, the backs of the wrists pressed)
      out.left = "torch";
      out.torchAt
        .copy(out.grip)
        .addScaledVector(top, -0.1 * B.k)
        .addScaledVector(fwd, -0.11 * B.k)
        .addScaledVector(left, 0.01 * B.k);
      out.poleL = [-0.5, -1, 0.3];
    } else out.left = "support";
    return out;
  }
  // at the ready with the torch on (F3a): the gun low in the right hand alone, the muzzle down at the ground,
  // further right; the torch out ahead in the left
  const down = 0.9 + 0.25 * r;
  at(B, -0.17, -0.378 + 0.03 * r, 0.231 - 0.06 * r, out.grip);
  out.f
    .copy(ahead)
    .multiplyScalar(Math.cos(down))
    .addScaledVector(up, -Math.sin(down))
    .addScaledVector(left, -0.12)
    .normalize();
  out.u.copy(up).addScaledVector(out.f, -up.dot(out.f)).normalize();
  out.reach = 0;
  out.poleR = [-1, -0.6, -0.6];
  out.left = "torch";
  // (the torch's wrist: out ahead, at the chest's height, a little left)
  at(B, 0.12, -0.2, 0.4 - 0.08 * r, out.torchAt);
  out.poleL = [-0.8, -1, -0.3];
  return out;
}

/** (plan 80 phase 2) The revolver in its holster at her right hip: the grip up at the belt, the muzzle down
 *  (a touch forward), its left side against the hip — where the draw starts and the put-away ends. */
export function holsterHold(B: BodyFrame, out: { grip: Vector3; f: Vector3; u: Vector3 }) {
  at(B, -0.21, -0.47, -0.03, out.grip);
  out.f.copy(B.up).negate().addScaledVector(B.ahead, 0.12).normalize();
  out.u.copy(B.ahead).addScaledVector(out.f, -B.ahead.dot(out.f)).normalize();
  return out;
}
/** The draw's path (0 in the holster … 1 at the hold): straight up out of it first (DRAW_LIFT of the way, 13
 *  cm), then turned muzzle-forward and out to the hold; the support hand meets it from DRAW_MEET on */
export const DRAW_LIFT = 0.3;
export const DRAW_MEET = 0.55;

export function newHold(): RevolverHold {
  return {
    grip: new Vector3(),
    f: new Vector3(),
    u: new Vector3(),
    left: "support",
    torchAt: new Vector3(),
    reach: 0,
    poleR: [-0.8, -1, -0.6],
    poleL: [-0.8, -1, -0.6],
  };
}

/** How far a gun's top leans off upright (rad): its top against the world's up, both across the barrel */
export function cantOf(f: Vector3, u: Vector3): number {
  const want = _v.set(0, 1, 0).addScaledVector(f, -f.y);
  if (want.lengthSq() < 1e-8) return 0;
  want.normalize();
  const top = _a.copy(u).addScaledVector(f, -u.dot(f)).normalize();
  return Math.acos(Math.max(-1, Math.min(1, top.dot(want))));
}

/** The gun's turn (the world's) for its barrel along f and its top along u */
export function gunQuat(f: Vector3, u: Vector3, out: Quaternion): Quaternion {
  const x = _v.copy(f).normalize();
  const y = _a.copy(u).addScaledVector(x, -u.dot(x)).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(x, y, _u.crossVectors(x, y)));
}

// ── the reload (plan 80 phase 4: F4a, F5a) ───────────────────────────────────────────────────────────
// The real speedloader reload as one timeline, s from the server's step opening it (Player.arm: everyone
// sees it), in time with its steps (shared ARMS.revolver: open 0.7, speed 1.1, shut 0.4):
//   0–0.3    in close, rolled left; the left fingers under the cylinder roll it out (the crane's swing)
//   0.3–0.72 muzzle up, its top toward her; the right hand off the grip, its flat palm strikes the rod —
//            the empties out (the server dumps them at 0.7)
//   0.72–1.8 muzzle down at the belly, its top ahead; the right hand to the pouch on her hip and back with
//            the speedloader, its rounds into the chambers, the knob twisted, let go — it falls (the
//            server's rounds in at 1.8)
//   1.8–2.2  the right hand on the grip again, the left thumb rolls the cylinder shut, up to the ready
// A shot while it's out (the server snaps it shut) or the step ending early: on from the closing.
export const RELOAD_LEN = 2.2;
/** the closing's start: where a reload cut short goes on from */
export const RELOAD_CLOSE = 1.86;
/** The gun's keys in her frame (from her shoulders' middle: x her left, y up, z ahead; the mocks' man's m),
 *  its barrel's way and its top's (her frame's) */
export const RELOAD_KEYS: Record<
  string,
  { at: [number, number, number]; f: [number, number, number]; u: [number, number, number] }
> = {
  in: { at: [-0.04, -0.27, 0.27], f: [0.25, -0.3, 0.92], u: [0.45, 1, 0] },
  up: { at: [0.0, -0.18, 0.22], f: [0.1, 1, 0.22], u: [0, 0.22, -1] },
  down: { at: [0.03, -0.36, 0.24], f: [0, -1, 0.3], u: [0, 0.3, 1] },
};
/** The gun's legs: from a key to a key over [start, end] s ("hold": the ready as it was) */
export const RELOAD_GUN: [string, string, number, number][] = [
  ["hold", "in", 0, 0.28],
  ["in", "up", 0.28, 0.44],
  ["up", "up", 0.44, 0.72],
  ["up", "down", 0.72, 0.92],
  ["down", "down", 0.92, RELOAD_CLOSE],
  ["down", "hold", RELOAD_CLOSE, RELOAD_LEN],
];
/** The right hand's: the grip, the rod (struck), the pouch, the loader at the cylinder */
export const RELOAD_RIGHT: [string, string, number, number][] = [
  ["grip", "grip", 0, 0.48],
  ["grip", "rod", 0.48, 0.58],
  ["rod", "rod", 0.58, 0.7],
  ["rod", "pouch", 0.7, 0.98],
  ["pouch", "pouch", 0.98, 1.08],
  ["pouch", "load", 1.08, 1.5],
  ["load", "load", 1.5, 1.8],
  ["load", "grip", 1.8, 1.96],
  ["grip", "grip", 1.96, RELOAD_LEN],
];
/** The left's: the support grip, under the cylinder */
export const RELOAD_LEFT: [string, string, number, number][] = [
  ["support", "support", 0, 0.1],
  ["support", "cyl", 0.1, 0.3],
  ["cyl", "cyl", 0.3, 2.0],
  ["cyl", "support", 2.0, RELOAD_LEN],
];
const smooth01 = (a: number, b: number, t: number) => {
  const c = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return c * c * (3 - 2 * c);
};
/** Where a timeline's legs have it at `t`: from, to, and how far between */
export function legAt(legs: [string, string, number, number][], t: number) {
  for (const [a, b, t0, t1] of legs) if (t < t1) return { a, b, k: smooth01(t0, t1, t) };
  const [a, b] = legs[legs.length - 1];
  return { a, b, k: 1 };
}
/** The gun's moving parts and the loader at `t`: the crane out (0..1), the rod pushed (0..1), the
 *  rounds in the cylinder (-1: as loaded; else how many of a full one), the loader pushed in and its knob
 *  twisted (0..1), the loader's own rounds still in it, where it is */
export function reloadAt(t: number) {
  return {
    crane: smooth01(0.1, 0.3, t) * (1 - smooth01(2.02, 2.16, t)),
    rod: smooth01(0.56, 0.62, t) * (1 - smooth01(0.7, 0.8, t)),
    rounds: t < 0.62 ? -1 : t < 1.66 ? 0 : 1,
    push: smooth01(1.5, 1.68, t),
    twist: smooth01(1.68, 1.78, t),
    loaderRounds: t < 1.66,
    loader: t < 1.0 ? "none" : t < 1.8 ? "hand" : t < 2.5 ? "fall" : "none",
  } as const;
}
/** (the gun's frame) The left hand round the cylinder: its palm's middle this far out from the cylinder's axis
 *  (its radius and a little), and along it from its rear */
export const CYL_PALM = { under: 0.024, along: 0.025 };
/** (the speedloader's own frame: +x its rounds' noses) Held in the right fingertips by its body, its knob in
 *  the palm: the palm's middle this far behind its rounds' rims */
export const LOADER_IN_HAND = 0.043;
/** The speedloader started this far short of the chambers, then pushed home */
export const LOADER_START = 0.045;

/** A way in her frame (x her left, y up, z ahead), the world's (unit) */
export function bodyDir(B: BodyFrame, d: [number, number, number], out: Vector3): Vector3 {
  return out.copy(B.left).multiplyScalar(d[0]).addScaledVector(B.up, d[1]).addScaledVector(B.ahead, d[2]).normalize();
}
