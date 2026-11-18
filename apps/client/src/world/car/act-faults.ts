import { Vector3 } from "three";
import {
  type ActPose,
  BODY,
  type Doorway,
  deckOf,
  type Grip,
  hipJoint,
  kneeOf,
  markAt,
  roofGrip,
  seatGrip,
  stepsOf,
  thighGrip,
} from "./getin";

// Plan 100 phase 0: what's wrong with a moment of the get-in act, worked out from the act's own pose and the car's
// measures (the body's frame) — the bench draws them, the unit tests and the probe run the acts through them:
//   a leg out of reach (a planted foot hung in the air), a knee or a foot through the door, the sill, the floor or the
//   car's side, a hand over the head (but a tall cab's grab handle), an arm out of reach, the head through the roof.

export interface Fault {
  t: number;
  what:
    | "leg out of reach"
    | "through the door"
    | "through the sill"
    | "through the floor"
    | "through the car's side"
    | "hand over the head"
    | "arm out of reach"
    | "head through the roof";
  /** which part: "L knee", "R foot", "L hand"… */
  part: string;
  /** by how much (m) */
  by: number;
}

const _a = new Vector3();
const _k = new Vector3();
const _p = new Vector3();
const _h = new Vector3();
const _t = new Vector3();
const _s = new Vector3();

/** Where a hand's grip is (the body's frame) for these checks: the door's marks swung with it, the wheel's rim by the
 *  door (a driver's), the seat's, the roof's. */
export function gripPoint(
  d: Doorway,
  at: Grip,
  doorRad: number,
  out = new Vector3(),
  p?: ActPose,
  S: "L" | "R" = "L",
): Vector3 | null {
  if (at === "thigh") return p ? thighGrip(p, S, d.k, out) : null;
  if (at === "handle" || at === "pull" || at === "edge") return markAt(d, at, doorRad, out);
  if (at === "seat") return seatGrip(d, out);
  if (at === "roof") return roofGrip(d, out);
  if (at === "wheel") return out.set(d.hip.x - 0.45, d.hip.y + 0.36, d.hip.z + d.s * 0.17);
  return null;
}

/** The faults of one moment `p` of an act through doorway `d` (`t` its time, for the report). */
export function actFaults(d: Doorway, p: ActPose, t: number): Fault[] {
  const out: Fault[] = [];
  const { op, s, k } = d;
  const o = op.out;
  const base = stepsOf(d);
  const deck = deckOf(d);
  const theta = Math.max(0, p.door) * 1.05;
  const legs = (BODY.thigh + BODY.shin) * k;
  const side = (i: number) => (i === 0 ? "L" : "R");
  // (the legs: not once the seat's own sat pose has them — it solves them itself)
  for (const i of p.sat > 0.3 ? [] : [0, 1]) {
    const hj = hipJoint(p, i, k, _h);
    const f = p.feet[i];
    const ankle = _a.copy(f).setY(f.y + BODY.ankle * k);
    const dist = ankle.distanceTo(hj);
    // (a foot swinging: its leg straight a moment reads as a stride; one down on something: not hung in the air)
    const down =
      f.y <= 0.02 ||
      Math.abs(f.y - base) < 0.02 ||
      Math.abs(f.y - base * 0.5) < 0.02 ||
      Math.abs(f.y - deck) < 0.02 ||
      Math.abs(f.y - d.floor) < 0.02;
    if (dist - legs > (down ? 0.02 : 0.05))
      out.push({ t, what: "leg out of reach", part: `${side(i)} leg`, by: dist - legs });
    const knee = kneeOf(hj, ankle, p.knee[i], BODY.thigh * k, BODY.shin * k, _k);
    // (the toes: ahead of the ankle along the foot's heading, down by its point)
    const toe = _t
      .copy(f)
      .add(_p.set(Math.sin(p.heading[i]), 0, Math.cos(p.heading[i])).multiplyScalar(0.15 * k * Math.cos(p.toe[i])))
      .setY(f.y - 0.15 * k * Math.sin(p.toe[i]) * 0.5);
    for (const [q, name] of [
      [knee, "knee"],
      [ankle, "foot"],
      [toe, "toes"],
    ] as const) {
      const part = `${side(i)} ${name}`;
      const x = q.x;
      const y = q.y;
      const w = q.z * s;
      // the door: a slab from its hinge (the opening's front edge, on the car's skin) along its way out
      if (y > op.y0 - 0.05 && y < op.y1 + 0.05) {
        const dx = Math.cos(theta);
        const dw = Math.sin(theta);
        const r = (x - op.x0) * dx + (w - o) * dw;
        const n = -(x - op.x0) * dw + (w - o) * dx;
        // (a centimetre's grace: the knee's a rounded thing, not its joint's point)
        if (r > 0.08 && r < op.x1 - op.x0 - 0.02 && n > -0.1 && n < 0.03)
          out.push({ t, what: "through the door", part, by: Math.min(n + 0.11, 0.03 - n) });
      }
      // the car's side: its skin's thickness beside the opening (the cabin's inside, behind it, is free — a back seat's
      // legs); the floor under the opening; the sill under the opening's foot
      if (w < o + 0.0 && w > o - 0.2 && (x < op.x0 - 0.02 || x > op.x1 + 0.02) && y > op.y0 - 0.1 && y < op.y1)
        out.push({
          t,
          what: "through the car's side",
          part,
          by: Math.max(op.x0 - 0.02 - x, x - (op.x1 + 0.02)),
        });
      else if (w < o - 0.12 && x > op.x0 && x < op.x1 && y < d.floor - 0.05)
        out.push({ t, what: "through the floor", part, by: d.floor - y });
      else if (
        w < o + 0.01 &&
        w > o - 0.2 &&
        x > op.x0 &&
        x < op.x1 &&
        y < op.y0 - (name === "toes" ? 0.04 : 0) &&
        y > base + 0.03 &&
        name !== "knee"
      )
        // the sill: under the opening's foot, between the skin and the floor's edge
        out.push({ t, what: "through the sill", part, by: op.y0 - y });
    }
  }
  // the hands: not over the head (a tall cab's grab handle's up there), not past an arm's reach
  const headTop = p.hips.y + BODY.head * k - 0.5 * k * p.duck;
  for (const h of p.hands) {
    if (h.w < 0.8) continue;
    const g = gripPoint(d, h.at, theta, _p, p, h.S);
    if (!g) continue;
    const brow = headTop - 0.12 * k;
    // (a tall cab's door's up there: reached up to from its steps)
    if (h.at !== "roof" && !(base > 0.1 && h.at !== "seat" && h.at !== "wheel") && g.y > brow)
      out.push({ t, what: "hand over the head", part: `${h.S} hand`, by: g.y - brow });
    // (the shoulder: over the hips, ducked forward and down, off the middle by her left or right)
    // (the shoulders turned with the trunk's twist, and shifted to the side it leans to: her right for a + lean)
    const sg = h.S === "L" ? 1 : -1;
    const ya = p.yaw + p.twist;
    const side = -Math.sin(p.lean * s) * BODY.shoulderUp * k;
    const sh = _s.set(
      p.hips.x + Math.cos(ya) * BODY.shoulderW * k * sg + Math.sin(ya) * 0.3 * p.duck * k + Math.cos(p.yaw) * side,
      p.hips.y + BODY.shoulderUp * k * (1 - 0.35 * p.duck),
      p.hips.z - Math.sin(ya) * BODY.shoulderW * k * sg + Math.cos(ya) * 0.3 * p.duck * k - Math.sin(p.yaw) * side,
    );
    const reach = g.distanceTo(sh);
    if (reach - BODY.arm * k * 1.15 > 0.005)
      out.push({ t, what: "arm out of reach", part: `${h.S} hand`, by: reach - BODY.arm * k * 1.15 });
  }
  // the head: under the roof's edge as it passes it
  const hw = Math.abs(p.hips.z) * 1;
  if (hw < o + 0.2 && hw > o - 0.45 && headTop > op.y1 + 0.01)
    out.push({ t, what: "head through the roof", part: "head", by: headTop - op.y1 });
  return out;
}
