// An animal's body for a shot (docs/plan/126-animal-life.md, phase 7): a capsule along its back, nose to tail, as
// high as its back over the ground it stands on (or the air it's in). Pure: the server's shots and the client's
// hit marks both ask it.
import { ANIMALS, type AnimalKind, YOUNG } from "./species.ts";

export interface BodyAt {
  kind: AnimalKind;
  young: boolean;
  /** where it stands (x, y on the floor as the server has it) and the ground's height there plus its height over it */
  x: number;
  y: number;
  z: number;
  /** which way it faces (radians) */
  yaw: number;
  /** lying down (resting, dead): flatter */
  lying?: boolean;
}

/** Its capsule: the spine's two ends (x, y, z) and its radius. */
export function capsuleOf(b: BodyAt): { a: [number, number, number]; b: [number, number, number]; r: number } {
  const d = ANIMALS[b.kind];
  const k = b.young ? YOUNG.scale : 1;
  const len = d.len * k;
  const h = d.height * k * (b.lying ? 0.45 : 1);
  const r = Math.max(0.06, Math.min(h * 0.45, len * 0.3));
  const half = Math.max(0, len / 2 - r);
  const cx = Math.cos(b.yaw);
  const cy = Math.sin(b.yaw);
  const z = b.z + Math.max(r, h - r);
  return { a: [b.x - cx * half, b.y - cy * half, z], b: [b.x + cx * half, b.y + cy * half, z], r };
}

/** How far along a ray (from o, unit dir d) it meets the capsule a–b of radius r, or null within `range`. */
export function rayCapsule(
  o: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  c: { a: [number, number, number]; b: [number, number, number]; r: number },
  range: number,
  slack = 0,
): number | null {
  // closest approach between the ray and the segment, then into the sphere there (good enough for a body)
  const ax = c.a[0];
  const ay = c.a[1];
  const az = c.a[2];
  const ux = c.b[0] - ax;
  const uy = c.b[1] - ay;
  const uz = c.b[2] - az;
  const wx = o.x - ax;
  const wy = o.y - ay;
  const wz = o.z - az;
  const A = d.x * d.x + d.y * d.y + d.z * d.z;
  const B = d.x * ux + d.y * uy + d.z * uz;
  const C = ux * ux + uy * uy + uz * uz;
  const D = d.x * wx + d.y * wy + d.z * wz;
  const E = ux * wx + uy * wy + uz * wz;
  const den = A * C - B * B;
  let s = 0; // along the segment, 0..1
  let t = 0; // along the ray
  if (C < 1e-9) {
    t = -D / A;
  } else if (den < 1e-9) {
    s = 0;
    t = -D / A;
  } else {
    s = Math.max(0, Math.min(1, (A * E - B * D) / den));
    t = (B * s - D) / A;
  }
  // (with s clamped, the ray's nearest point to that spot of the spine)
  const px = ax + ux * s;
  const py = ay + uy * s;
  const pz = az + uz * s;
  t = Math.max(0, (d.x * (px - o.x) + d.y * (py - o.y) + d.z * (pz - o.z)) / A);
  const qx = o.x + d.x * t - px;
  const qy = o.y + d.y * t - py;
  const qz = o.z + d.z * t - pz;
  const miss2 = qx * qx + qy * qy + qz * qz;
  const R = c.r + slack;
  if (miss2 > R * R) return null;
  const back = Math.sqrt(R * R - miss2) / Math.sqrt(A);
  const hit = Math.max(0, t - back);
  return hit <= range ? hit : null;
}

/** Did it go in at the head (the front fifth of the body)? */
export function atHeadOf(c: { a: [number, number, number]; b: [number, number, number] }, x: number, y: number): boolean {
  const ux = c.b[0] - c.a[0];
  const uy = c.b[1] - c.a[1];
  const l2 = ux * ux + uy * uy;
  if (l2 < 1e-9) return false;
  const s = ((x - c.a[0]) * ux + (y - c.a[1]) * uy) / l2;
  return s > 0.8;
}
