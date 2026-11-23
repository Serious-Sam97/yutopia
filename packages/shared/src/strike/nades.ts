// The Strike Park's grenades (docs/plan/114-the-strike-park.md, S-M3): thrown on an arc, bouncing off the map
// as it's built (its boxes, the pad), then what each does — the HE's blast, the flash's whiteout by how near
// and how squarely you looked, the smoke's volume that blocks sight (people's and the bots'), the fire that
// burns on the floor and a smoke puts out, the decoy's shots. Deterministic: the same throw lands in the same
// place (lineups). Local metres (the map's), y up.

import { type MapBox, mapBoxes, rayBox, type StrikeMap, shotThrough } from "./map.ts";

export type NadeKind = "he" | "flash" | "smoke" | "molotov" | "incendiary" | "decoy";
export const NADE = {
  /** throw speeds (m/s): far (left click's), short (right's) */
  far: 17,
  short: 7.5,
  g: 15,
  bounce: 0.42,
  slide: 0.72,
  /** HE: its fuse, its reach and its most */
  he: { fuse: 1.6, r: 9, dmg: 98 },
  flash: { fuse: 1.6, r: 32, most: 4.8 },
  /** smoke: comes out when it's still, grows in `grow` s to `r`, lasts `secs` */
  smoke: { r: 4.2, grow: 1.0, secs: 18 },
  /** fire: on the floor where it lands (or after `fuse` in the air), `r` round, `secs`, damage a second */
  fire: { r: 3, secs: 7, dps: 40, fuse: 2.0 },
  decoy: { secs: 15 },
} as const;

export interface Nade {
  id: number;
  kind: NadeKind;
  by: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** seconds since thrown */
  t: number;
  /** fly → (smoke | fire | decoy | burst) → done */
  state: "fly" | "smoke" | "fire" | "decoy" | "done";
  /** seconds left of the smoke, fire, decoy */
  left: number;
  /** on the ground and still */
  rest: boolean;
  /** (plan 118, F9a) a fire's run: the way the bottle was going as it burst (unit, flat; 0 0 a round pool) */
  fx?: number;
  fz?: number;
  /** (plan 118, F9a) a smoke blown open by an HE: 1 just now, back to 0 over FIRE/SMOKE's `thinSecs` */
  thin?: number;
}
/** (plan 118) a fire runs this far on along the way it was thrown; a smoke an HE opens fills back in this long (s) */
export const FIRE_RUN = 2.5;
export const THIN_SECS = 3;
/** Whether (x, z) is in a fire: within its radius of the line it runs along. */
export function inFire(n: Nade, x: number, z: number): boolean {
  const fx = n.fx ?? 0;
  const fz = n.fz ?? 0;
  const t = Math.max(0, Math.min(FIRE_RUN, (x - n.x) * fx + (z - n.z) * fz));
  return Math.hypot(x - (n.x + fx * t), z - (n.z + fz * t)) < NADE.fire.r;
}
/** The way a burst bottle's fire runs: its flat velocity's, if it was going anywhere. */
export function fireRun(n: Nade): void {
  const v = Math.hypot(n.vx, n.vz);
  n.fx = v > 0.5 ? n.vx / v : 0;
  n.fz = v > 0.5 ? n.vz / v : 0;
}

/** A throw from the eye along yaw/pitch (yaw: atan2(z, x) as the match's; pitch up +). */
export function throwNade(
  id: number,
  kind: NadeKind,
  by: string,
  eye: [number, number, number],
  yaw: number,
  pitch: number,
  short: boolean,
): Nade {
  const v = short ? NADE.short : NADE.far;
  // (thrown a little up of where you look: a lob)
  const p = Math.min(1.3, pitch + 0.12);
  const c = Math.cos(p);
  return {
    id,
    kind,
    by,
    x: eye[0] + Math.cos(yaw) * 0.4,
    y: eye[1] - 0.1,
    z: eye[2] + Math.sin(yaw) * 0.4,
    vx: Math.cos(yaw) * c * v,
    vy: Math.sin(p) * v,
    vz: Math.sin(yaw) * c * v,
    t: 0,
    state: "fly",
    left: 0,
    rest: false,
  };
}

const R = 0.06;
/** One step of a flying grenade: gravity, the map's boxes and the pad bounced off. Returns whether it
 *  touched something this step (a molotov breaks on its first touch of a floor). */
export function stepNade(map: StrikeMap, n: Nade, dt: number): { hitFloor: boolean } {
  let hitFloor = false;
  if (n.rest) return { hitFloor };
  const boxes = mapBoxes(map);
  const sub = 4;
  const h = dt / sub;
  for (let k = 0; k < sub; k++) {
    n.vy -= NADE.g * h;
    const d: [number, number, number] = [n.vx * h, n.vy * h, n.vz * h];
    const L = Math.hypot(d[0], d[1], d[2]);
    if (L < 1e-6) continue;
    const o: [number, number, number] = [n.x, n.y, n.z];
    const u: [number, number, number] = [d[0] / L, d[1] / L, d[2] / L];
    // the nearest box it meets on this sub-step
    let best: { t: number; b: MapBox } | null = null;
    for (const b of boxes) {
      const t = rayBox({ ...b, hx: b.hx + R, hy: b.hy + R, hz: b.hz + R }, o, u);
      if (t && t[0] <= L && t[0] > 1e-5 && (!best || t[0] < best.t)) best = { t: t[0], b };
    }
    // the pad
    const tPad = n.vy < 0 && n.y + d[1] < R ? (n.y - R) / -u[1] : Number.POSITIVE_INFINITY;
    if (best && best.t < tPad) {
      n.x += u[0] * (best.t - 1e-3);
      n.y += u[1] * (best.t - 1e-3);
      n.z += u[2] * (best.t - 1e-3);
      // which face: the box's local axis the hit point is furthest along (its frame turned)
      const b = best.b;
      const c = Math.cos(b.a);
      const s = Math.sin(b.a);
      const lx = (n.x - b.x) * c - (n.z - b.z) * s;
      const lz = (n.x - b.x) * s + (n.z - b.z) * c;
      const ly = n.y - b.y;
      const fx = Math.abs(lx) / (b.hx + R);
      const fy = Math.abs(ly) / (b.hy + R);
      const fz = Math.abs(lz) / (b.hz + R);
      if (fy >= fx && fy >= fz) {
        if (ly > 0) hitFloor = true;
        n.vy = -n.vy * NADE.bounce;
        n.vx *= NADE.slide;
        n.vz *= NADE.slide;
      } else {
        // a wall: the velocity's part along its normal turned back (in the box's frame)
        let vlx = n.vx * c - n.vz * s;
        let vlz = n.vx * s + n.vz * c;
        if (fx >= fz) vlx = -vlx * NADE.bounce;
        else vlz = -vlz * NADE.bounce;
        n.vx = vlx * c + vlz * s;
        n.vz = -vlx * s + vlz * c;
      }
    } else if (Number.isFinite(tPad) && tPad <= L) {
      n.x += u[0] * tPad;
      n.z += u[2] * tPad;
      n.y = R;
      hitFloor = true;
      n.vy = -n.vy * NADE.bounce;
      n.vx *= NADE.slide;
      n.vz *= NADE.slide;
    } else {
      n.x += d[0];
      n.y += d[1];
      n.z += d[2];
    }
    if (hitFloor && Math.abs(n.vy) < 1.2 && Math.hypot(n.vx, n.vz) < 0.6) {
      n.vx = n.vy = n.vz = 0;
      n.rest = true;
      break;
    }
  }
  return { hitFloor };
}

/** Whether the segment a→b passes through a smoke (its sphere, grown as far as it has). */
export function throughSmoke(smokes: Nade[], a: [number, number, number], b: [number, number, number]): boolean {
  for (const s of smokes) {
    if (s.state !== "smoke") continue;
    const r = smokeR(s);
    if (r <= 0.2) continue;
    // (the volume: a sphere on the floor, its middle at r × 0.6 up)
    const c = [s.x, s.y + r * 0.6, s.z];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1] + (c[2] - a[2]) * d[2]) / L2));
    const q = [a[0] + d[0] * t - c[0], a[1] + d[1] * t - c[1], a[2] + d[2] * t - c[2]];
    if (q[0] ** 2 + q[1] ** 2 + q[2] ** 2 < r * r) return true;
  }
  return false;
}
/** A smoke's radius now (grown in, thinning out its last two seconds). */
export function smokeR(s: Nade): number {
  const age = NADE.smoke.secs - s.left;
  const grow = Math.min(1, age / NADE.smoke.grow);
  const fade = Math.min(1, s.left / 2);
  return NADE.smoke.r * grow * (0.6 + 0.4 * fade) * (1 - 0.85 * (s.thin ?? 0));
}

/** How long a flash whites someone out (s): by distance, by how squarely they faced it, nothing through a
 *  wall. `eye` theirs, `yaw`/`pitch` where they look. */
export function flashFor(
  map: StrikeMap,
  at: [number, number, number],
  eye: [number, number, number],
  yaw: number,
  pitch: number,
): number {
  const dx = at[0] - eye[0];
  const dy = at[1] - eye[1];
  const dz = at[2] - eye[2];
  const d = Math.hypot(dx, dy, dz);
  if (d > NADE.flash.r) return 0;
  if (shotThrough(map, eye, at).walls > 0) return 0;
  const look = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
  const cos = (look[0] * dx + look[1] * dy + look[2] * dz) / Math.max(1e-6, d);
  // (facing it: full; side on: a third; behind: a little)
  const facing = cos > 0.5 ? 1 : cos > -0.2 ? 0.35 : 0.12;
  const near = 1 - (d / NADE.flash.r) ** 1.5;
  return Math.round(NADE.flash.most * facing * near * 100) / 100;
}
/** The HE's damage at distance d (before armor). */
export const heDamage = (d: number) => (d >= NADE.he.r ? 0 : Math.round(NADE.he.dmg * (1 - d / NADE.he.r) ** 1.4));
