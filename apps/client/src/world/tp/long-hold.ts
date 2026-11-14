// Plans 81–82 — a long gun held as a person holds one, the same for each: the gun the anchor, placed by its
// butt in the right shoulder's pocket (aimed) or carried as that gun is; the right hand on its grip by a frame
// of its own (the gun fixed in the fist); the left palm on the gun's fore part as far out as the arm reaches.
// What differs gun to gun — its sockets, its carry, its blades, its kick, its checks — is its LongSpec
// (tp/shotgun-hold.ts SG_LONG, tp/ak-hold.ts AK_LONG). The gun's own frame: x along the bore, y its top, z its
// right; m.
import { Matrix4, type Quaternion, Vector3 } from "three";
import type { HandFrame, HeldShape } from "../chars/props";
import { at, type BodyFrame, bodyDir, gunQuat } from "./revolver-hold";

export interface LongSpec {
  key: string;
  /** The right hand on the gun's grip: its palm's middle, the fingers' way, its index side */
  wrist: { palm: Vector3; along: Vector3; index: Vector3 };
  /** …what its fingers close round (the shape's y along `axis`) */
  wristShape: { at: Vector3; axis: Vector3; shape: HeldShape };
  /** The left palm on the fore part: on `part` of the gun (null: the gun itself) — its origin the gun's point
   *  `pivot` — the palm's middle this high, from `x[0]` out to `x[1]` along (and `z` across — its right +: a
   *  vertical fore-grip's side, plan 84), the fingers' way, the index side; what the fingers close round (a
   *  shape along the gun — or along `axis` — its middle this high and `z` across); the thumb's place (ahead of
   *  the palm's middle, its height, across) */
  fore: {
    part: string | null;
    pivot: Vector3;
    y: number;
    x: [number, number];
    z?: number;
    along: Vector3;
    index: Vector3;
    shape: { y: number; shape: HeldShape; axis?: Vector3; z?: number };
    thumb: [number, number, number];
  };
  /** The torch in the left fist along the bore under the fore part: its axis this high, its middle this far
   *  ahead of the palm's, the palm's middle then this high; what the fingers close round; the thumb's place */
  torch: { y: number; ahead: number; palm: number; held: HeldShape; thumb: [number, number, number] };
  /** The butt pad's middle */
  butt: Vector3;
  /** Carried, not aimed: `side` — in the right hand alone at her side, the grip at `at` in her frame (x left,
   *  y up, z ahead from her shoulders' middle), the bore's way `f`, its top's `u`; `ready` — the low ready,
   *  both hands on, the butt at the shoulder's front (the pocket `pocket` from the shoulder's joint: left, up,
   *  ahead — on a fuller chest further ahead, as aimed), the muzzle `down` rad under level and `across` to
   *  her left; running, the muzzle `run` steeper */
  carry:
    | {
        kind: "side";
        at: [number, number, number];
        f: [number, number, number];
        u: [number, number, number];
        run: number;
      }
    | { kind: "ready"; pocket: [number, number, number]; down: number; across: number; run: number };
  /** Aimed: the pocket this far up (the butt's heel at the shoulder's top), the trunk bent with the pitch this
   *  much of it, on a fuller chest the pocket this much further ahead; the pocket turned with her trunk's lean
   *  this much of it (it stays on her shoulder — 0: held level from her shoulder's joint, as the double-
   *  barrel's) */
  aim: { up: number; trunk: number; bust: number; lean?: number };
  /** Aimed, her cheek down on the stock: her right eye brought onto the sight line — this high over the bore's
   *  frame (its y) and this far across (its z) — by her neck and head tipped down and over (null: the head only
   *  turned along the look) */
  cheek: { y: number; z: number } | null;
  /** Her trunk turned this far right of the gun's way: carried, aimed (rad) */
  blade: { ready: number; aim: number };
  /** Her left shoulder brought forward this far with her left hand on it (m) */
  protract: number;
  /** A shot's kick aimed (gunFx.kick 0..1): the muzzle up about the butt (rad), back into the shoulder (m),
   *  her trunk rocked back (rad) */
  kick: { flip: number; back: number; rock: number };
  /** (plan 84) Charging it aimed (gunFx.charge 0..1): her trunk leant into it (rad), her left shoulder this much
   *  further forward (m) */
  charge?: { lean: number; protract: number };
  /** Up from the carry to the aim (s; shared ARMS' aim) */
  aimS: number;
  /** The left hand on the gun carried too (else free till she aims) */
  leftCarried: boolean;
  /** The right forearm kept out of the stock — a rod from `a` to `b` (x, y), `r` round — reloading, and carried
   *  at her side; null: never */
  avoid: { a: [number, number]; b: [number, number]; r: number } | null;
  /** Slung on her back when it isn't in her hands (the Player flag that says she carries it), drawn and put
   *  back along its keys — null: none (it's gone when put away) */
  sling: SlingSpec | null;
  /** In a whole-body move or struck, pulled in across her chest (port arms — her chest's frame): its grip's
   *  place, its turn (none: the double-barrel's, tp/shotgun-hold.ts SG_PORT) */
  port?: {
    at: Vector3;
    turn: Quaternion;
    /** its left hand's place on it there, if not as held (over the top: its palm's middle this high, the
     *  fingers' way, the index side, the thumb's place) */
    fore?: { y: number; along: Vector3; index: Vector3; thumb: [number, number, number] };
    /** struck too (the default) — or held at the ready through the flinch: pulled in for its 0.7 s and back out,
     *  her left hand turned palm up to palm down and back, her forearms wrung through it */
    struck?: boolean;
  };
  /** The bench's checks: the left fingers against boxes on the gun (its middle x, y and half-sizes), the
   *  forearms against rods on it (a → b, x and y, `r` round), each in the gun's frame or (`fore`) the fore
   *  part's (less its pivot); the stock's side profile (its top and bottom lines by x, from `x[0]` to `x[1]`,
   *  `z` either side of its middle) for what of it is inside her */
  // (`part`: on a part that moves — the Daybreak's cell — in the gun's frame as it sits home, going where the part
  // goes; not checked while it's hidden)
  check: {
    boxes: { c: [number, number]; h: [number, number, number]; fore: boolean; part?: string }[];
    rods: { a: [number, number]; b: [number, number]; r: number; fore: boolean; part?: string }[];
    stock: { x: [number, number]; top: [number, number][]; bot: [number, number][]; z: number; cz?: number };
  };
}

/** A long gun slung on her back: its grip's place and its turn in her chest bone's space (x her left, y up, z
 *  ahead); the draw's keys between the back and the hold (her frame from her shoulders' middle: x left, y up,
 *  z ahead — its grip, the bore's way, its top's: given, or the way it turns over about her left-right line),
 *  each under half a turn from the next; the draw's time and the put-away's (s); the strap's way over her
 *  (each point a bone's and an offset in her frame, out on her front — a fuller chest's `bust` more) between
 *  its two ends on the gun */
/** The Player flags that say she carries a long gun slung (plans 81–84) */
export type SlingFlag = "sling" | "slingAk" | "slingSn" | "slingDb";

export interface SlingSpec {
  flag: SlingFlag;
  at: Vector3;
  turn: Quaternion;
  keys: { at: [number, number, number]; f: [number, number, number]; u?: [number, number, number] }[];
  draw: number;
  away: number;
  strap: { bone: "shoulderR" | "shoulderL" | "chest" | "hips"; at: [number, number, number] }[];
  ends: [Vector3, Vector3];
  bust: number;
  /** with others slung too, this one over them — this much further out from her back for each there (m) */
  over: { flag: SlingFlag; out: number }[];
  /** tilted this far to her back about her left-right line (rad) — on a body with a bust, without (its back
   *  straighter, further from its chest bone at the shoulders); `over`: with another long gun under it, its
   *  top brought down to her back past where they cross — else its top stood off her shoulder blades */
  lean?: { alone: [number, number]; over: [number, number] };
  /** brought this much nearer her back (m) — on a body with a bust, without; alone, over others (plan 84: the
   *  Daybreak upright down her back stood 4–10 cm off a masculine back where it touched a feminine one) */
  back?: { alone: [number, number]; over: [number, number] };
  /** drawn by another place on it first (her right hand round it — its palm's middle, the fingers' way, the
   *  index side; the gun's frame) till this much of the draw, then on to the grip by `to`; `hold`: that place
   *  is the grip itself, the hand turned another way on it (its fingers kept round it) */
  grab?: {
    /** (plan 84) her hand's way from it to the grip bowed out to the gun's right this far mid-way (m) */
    arc?: number;
    palm: Vector3;
    along: Vector3;
    index: Vector3;
    until: number;
    to: number;
    hold?: boolean;
    /** (plan 84) her hand's place on it at the draw's start, rolled round to `palm`/`along`/`index` by `by` (else
     *  `until`) —
     *  the Daybreak's carry handle, upright on her back, then level in her hanging hand */
    from?: { palm: Vector3; along: Vector3; index: Vector3; by?: number };
  };
}

/** The gun's turn (the world's) and its grip point, for its butt in the right shoulder's pocket (aimed, or at
 *  the low ready) — or carried at her side */
export function longHold(
  LS: LongSpec,
  B: BodyFrame,
  shoulderR: Vector3,
  s: { aiming: boolean; pitch: number; run: number; bust?: number; lean?: number },
  out: { grip: Vector3; f: Vector3; u: Vector3; q: Quaternion },
): void {
  const { up, ahead, left } = B;
  const K = LS.carry;
  if (!s.aiming && K.kind === "side") {
    // carried at her side; running, the muzzle steeper
    const d = Math.atan2(-K.f[1], K.f[2]) + K.run * s.run;
    bodyDir(B, [K.f[0], -Math.sin(d), Math.cos(d)], out.f);
    bodyDir(B, K.u, out.u);
    out.u.addScaledVector(out.f, -out.u.dot(out.f)).normalize();
    gunQuat(out.f, out.u, out.q);
    at(B, K.at[0], K.at[1], K.at[2], out.grip);
    return;
  }
  const pocket = _p.copy(shoulderR);
  if (!s.aiming && K.kind === "ready") {
    // the low ready: the butt at the shoulder's front, the muzzle down and a little across her
    const d = K.down + K.run * s.run;
    bodyDir(B, [K.across, -Math.sin(d), Math.cos(d)], out.f);
    out.u.copy(up).addScaledVector(out.f, -up.dot(out.f)).normalize();
    pocket
      .addScaledVector(left, K.pocket[0] * B.k)
      .addScaledVector(up, K.pocket[1] * B.k)
      .addScaledVector(ahead, (K.pocket[2] + LS.aim.bust * (s.bust ?? 0)) * B.k);
  } else {
    const c = Math.cos(s.pitch);
    const sn = Math.sin(s.pitch);
    out.f.copy(ahead).multiplyScalar(c).addScaledVector(up, sn);
    out.u.copy(up).multiplyScalar(c).addScaledVector(ahead, -sn);
    // (turned with her trunk leaning back or forward with the aim: the butt stays where it is on her)
    const L = (LS.aim.lean ?? 0) * (s.lean ?? 0);
    const cl = Math.cos(L);
    const sl = Math.sin(L);
    const a = (0.07 + LS.aim.bust * (s.bust ?? 0)) * B.k;
    const u = (LS.aim.up - 0.025) * B.k;
    pocket
      .addScaledVector(left, 0.06 * B.k)
      .addScaledVector(ahead, a * cl - u * sl)
      .addScaledVector(up, a * sl + u * cl);
  }
  gunQuat(out.f, out.u, out.q);
  // (the grip point: the pocket less the butt's place in the gun)
  out.grip.copy(pocket).sub(_b.copy(LS.butt).multiplyScalar(B.k).applyQuaternion(out.q));
}

/** The gun's frame under the right wrist (its wrist's space): held so the hand's own frame meets the grip's
 *  socket — into q, p */
export function longInHand(LS: LongSpec, F: HandFrame, q: Quaternion, p: Vector3) {
  const a = _a.copy(F.along).normalize();
  const b = _c.copy(F.across).addScaledVector(a, -F.across.dot(a)).normalize();
  _m1.makeBasis(a, b, _d.crossVectors(a, b));
  const W = LS.wrist;
  const ga = _a2.copy(W.along);
  const gb = _c2.copy(W.index).addScaledVector(ga, -W.index.dot(ga)).normalize();
  _m2.makeBasis(ga, gb, _d2.crossVectors(ga, gb));
  q.setFromRotationMatrix(_m1.multiply(_m2.transpose()));
  // (the palm's middle — 0.55 of the way to the middle knuckle, 2.2 cm out of the palm — on the socket)
  const palm = _p.copy(F.mid).multiplyScalar(0.55).addScaledVector(_d.copy(F.n).normalize(), 0.022);
  p.copy(palm).sub(_b.copy(W.palm).applyQuaternion(q));
}

const _p = new Vector3();
const _b = new Vector3();
const _a = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _a2 = new Vector3();
const _c2 = new Vector3();
const _d2 = new Vector3();
const _m1 = new Matrix4();
const _m2 = new Matrix4();

/** A piecewise line's y at x (held level past its ends) — the stock's profile */
export function lineAt(pts: [number, number][], x: number): number {
  if (x >= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++)
    if (x >= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  return pts[pts.length - 1][1];
}
