// The people rig: the same figure as avatar-svg.ts's drawing, cut into parts
// that move — hips and knees, shoulders and elbows, the head on the neck — so
// the world can pose people every frame (a real walk, breathing, blinking,
// gestures, a mug in hand) instead of swapping whole-body drawings.
//
// Everything is in board units (the 120×180 figure board, feet on y = 168).
// A part is an SVG fragment plus the box it's cropped to; a pose is a few
// angles and offsets; `bones()` turns a pose into one affine per part, used by
// by the 3D people and by `composeSvg` (portraits, the dev sheet).

export type Face = "open" | "blink" | "talk";
export type Box = [number, number, number, number]; // x, y, w, h
export type Pt = [number, number];

export type PartName =
  | "hairBack"
  | "legL"
  | "legR"
  | "thighL"
  | "shinL"
  | "thighR"
  | "shinR"
  | "lap"
  | "armLu"
  | "armLf"
  | "torso"
  | "armRu"
  | "armRf"
  | "head";

export interface PartArt {
  name: PartName;
  svg: string; // board-unit SVG fragment (its own defs included)
  box: Box;
}

// Where the joints are at rest (board units). Side views: L = the far limbs,
// R = the near ones.
export interface Joints {
  hip: Pt; // the body sways about here
  hipL: Pt;
  hipR: Pt;
  kneeL: Pt;
  kneeR: Pt;
  shL: Pt;
  elL: Pt;
  shR: Pt;
  elR: Pt;
  hand: Pt; // the right hand at rest (what it holds hangs here)
  handL: Pt;
  neck: Pt;
  mouth: Pt;
}

export interface Rig {
  side: boolean;
  quarter: boolean; // a ¾ view (SW, NW): walks run along the diagonal
  sit: boolean;
  back: boolean;
  parts: PartArt[]; // drawing order
  heads: Record<Face, string>; // the head part's SVG per face
  headBox: Box;
  joints: Joints;
}

// ── a pose ───────────────────────────────────────────────────────────────────
// Angles in degrees, clockwise on screen (for a limb hanging down, + swings its
// end towards −x: forward in the side view, which faces −x).
export interface ArmPose {
  sh: number; // shoulder
  el: number; // elbow (relative to the upper arm)
  su: number; // upper arm length (foreshortening towards / away from the viewer)
  sf: number; // forearm length
}
export interface LegPose {
  hip: number;
  knee: number; // side views
  s: number; // front views: length (1 = rest; < 1 lifts the foot)
}
export interface Pose {
  body: { x: number; y: number; rot: number };
  head: { x: number; y: number; rot: number };
  armL: ArmPose;
  armR: ArmPose;
  legL: LegPose;
  legR: LegPose;
  face: Face;
  // the left arm in front of the torso (a clap, both hands at the chest)
  armLFront?: boolean;
}

export const restArm = (): ArmPose => ({ sh: 0, el: 0, su: 1, sf: 1 });
export const restLeg = (): LegPose => ({ hip: 0, knee: 0, s: 1 });
export function restPose(): Pose {
  return {
    body: { x: 0, y: 0, rot: 0 },
    head: { x: 0, y: 0, rot: 0 },
    armL: restArm(),
    armR: restArm(),
    legL: restLeg(),
    legR: restLeg(),
    face: "open",
  };
}

// ── affine maths ─────────────────────────────────────────────────────────────
// [a, b, c, d, tx, ty]: x' = a·x + c·y + tx, y' = b·x + d·y + ty
export type Aff = [number, number, number, number, number, number];
export const IDENT: Aff = [1, 0, 0, 1, 0, 0];
export function mul(p: Aff, q: Aff): Aff {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}
const T = (x: number, y: number): Aff => [1, 0, 0, 1, x, y];
const S = (x: number, y: number): Aff => [x, 0, 0, y, 0, 0];
function R(deg: number): Aff {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}
// about a point: T(p) · M · T(−p)
const about = (p: Pt, m: Aff): Aff => mul(T(p[0], p[1]), mul(m, T(-p[0], -p[1])));
export function apply(m: Aff, p: Pt): Pt {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

// One transform per part, from a pose (board → board).
export function bones(rig: Rig, pose: Pose): Record<PartName, Aff> {
  const j = rig.joints;
  const body = mul(T(pose.body.x, pose.body.y), about(j.hip, R(pose.body.rot)));
  const head = mul(body, mul(T(pose.head.x, pose.head.y), about(j.neck, R(pose.head.rot))));
  const arm = (sh: Pt, el: Pt, a: ArmPose): [Aff, Aff] => {
    const up = mul(body, about(sh, mul(R(a.sh), S(1, a.su))));
    return [up, mul(up, about(el, mul(R(a.el), S(1, a.sf))))];
  };
  const [armLu, armLf] = arm(j.shL, j.elL, pose.armL);
  const [armRu, armRf] = arm(j.shR, j.elR, pose.armR);
  // legs hang from the hips, which ride with the body (not its sway)
  const hips = T(pose.body.x, pose.body.y);
  const leg = (hip: Pt, l: LegPose) => mul(hips, about(hip, mul(R(l.hip), S(1, l.s))));
  const thigh = (hip: Pt, l: LegPose) => mul(hips, about(hip, R(l.hip)));
  const thighL = thigh(j.hipL, pose.legL);
  const thighR = thigh(j.hipR, pose.legR);
  return {
    hairBack: head,
    head,
    torso: body,
    lap: IDENT,
    armLu,
    armLf,
    armRu,
    armRf,
    legL: leg(j.hipL, pose.legL),
    legR: leg(j.hipR, pose.legR),
    thighL,
    thighR,
    shinL: mul(thighL, about(j.kneeL, R(pose.legL.knee))),
    shinR: mul(thighR, about(j.kneeR, R(pose.legR.knee))),
  };
}

// Where the right hand is in a pose (board units), for what it holds.
export function handAt(rig: Rig, pose: Pose, left = false): Pt {
  const b = bones(rig, pose);
  return apply(left ? b.armLf : b.armRf, left ? rig.joints.handL : rig.joints.hand);
}

// The parts in the order they're drawn for this pose.
export function drawOrder(rig: Rig, pose: Pose): PartArt[] {
  if (!pose.armLFront) return rig.parts;
  const lifted = rig.parts.filter((p) => p.name === "armLu" || p.name === "armLf");
  const rest = rig.parts.filter((p) => p.name !== "armLu" && p.name !== "armLf");
  const at = rest.findIndex((p) => p.name === "torso") + 1;
  return [...rest.slice(0, at), ...lifted, ...rest.slice(at)];
}

const f2 = (n: number) => (Math.abs(n) < 1e-6 ? "0" : n.toFixed(3));
export const svgMatrix = (m: Aff) => `matrix(${m.map(f2).join(" ")})`;

// A posed figure as one SVG fragment (board units).
export function composeSvg(rig: Rig, pose: Pose): string {
  const b = bones(rig, pose);
  let s = "";
  for (const p of drawOrder(rig, pose)) {
    const svg = p.name === "head" ? rig.heads[pose.face] : p.svg;
    if (svg) s += `<g transform="${svgMatrix(b[p.name])}">${svg}</g>`;
  }
  return s;
}

// A tapered limb from (x0, y0) to (x1, y1) with round ends.
export function capsule(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return `M${p(x0 + nx * r0, y0 + ny * r0)} L${p(x1 + nx * r1, y1 + ny * r1)} A${r1} ${r1} 0 0 0 ${p(x1 - nx * r1, y1 - ny * r1)} L${p(x0 - nx * r0, y0 - ny * r0)} A${r0} ${r0} 0 0 0 ${p(x0 + nx * r0, y0 + ny * r0)}Z`;
}

// A limb's two side edges (outline it without its round ends: the lower
// segment of a joint covers the joint seamlessly).
export function capsuleSides(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return `M${p(x0 + nx * r0, y0 + ny * r0)} L${p(x1 + nx * r1, y1 + ny * r1)} M${p(x0 - nx * r0, y0 - ny * r0)} L${p(x1 - nx * r1, y1 - ny * r1)}`;
}
