// The torches' beams (docs/plan/30-the-dark.md, D4): one test for both views
// and the server. Pure: nothing of the Grounds in it.
//
// The phone's flashlight: a cone from the hand along where you look. Wide when
// you're just walking (tilted down at the ground ahead); focused while you aim
// with it — narrower, further, and it drains the battery (vitals.ts) and burns
// the shadowed's shield (phase 4).
export const BEAM = {
  wide: { len: 10, half: 0.36 },
  focus: { len: 14, half: 0.2 },
  /** not aiming, the beam points down at the ground a few tiles ahead (rad) */
  tilt: -0.16,
  /** where the phone is, tiles over the feet: in the hand at the chest; held out, aiming */
  hand: 1.2,
  held: 1.35,
} as const;

export interface Beam {
  /** where it starts (the floor's coords, tiles; z up) */
  x: number;
  y: number;
  z: number;
  /** where it points: round (atan2 in the floor's x / y) and up from level, rad */
  yaw: number;
  pitch: number;
  focus: boolean;
}

/** The beam of someone at (x, y), feet at z, facing `yaw`; `pitch` while aiming
 *  (null: not aiming — tilted at the ground); focused (aiming, with battery left). */
export function beamOf(x: number, y: number, z: number, yaw: number, pitch: number | null, focus: boolean): Beam {
  const aiming = pitch !== null;
  return {
    x: x + Math.cos(yaw) * 0.32,
    y: y + Math.sin(yaw) * 0.32,
    z: z + (aiming ? BEAM.held : BEAM.hand),
    yaw,
    pitch: aiming ? pitch : BEAM.tilt,
    focus,
  };
}

/** How much of a beam reaches (px, py): 0 … 1, strongest near and on its line,
 *  nothing past its length or outside its cone. With `pz` (a height) the cone is
 *  tested in 3D — aimed up, it passes over the snow and lights a face; without,
 *  only round (what lights someone standing on the land). No line of sight here:
 *  `beamReaches`. */
export function beamAt(b: Beam, px: number, py: number, pz?: number): number {
  const { len, half } = b.focus ? BEAM.focus : BEAM.wide;
  const dx = px - b.x;
  const dy = py - b.y;
  let d: number;
  let off: number;
  if (pz === undefined) {
    d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) - b.yaw;
    off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  } else {
    const dz = pz - b.z;
    d = Math.hypot(dx, dy, dz);
    const cp = Math.cos(b.pitch);
    const dot = (dx * cp * Math.cos(b.yaw) + dy * cp * Math.sin(b.yaw) + dz * Math.sin(b.pitch)) / (d || 1);
    off = Math.acos(Math.max(-1, Math.min(1, dot)));
  }
  if (d > len || d < 0.3 || off > half) return 0;
  return (1 - d / len) * (1 - (off / half) ** 2);
}

/** Nothing solid between a beam and (px, py) (a wall, a trunk: whatever the grid
 *  won't let through). */
export function beamReaches(
  grid: { clear(a: { x: number; y: number }, b: { x: number; y: number }, r: number, z: number): boolean },
  b: Beam,
  px: number,
  py: number,
): boolean {
  return grid.clear({ x: b.x, y: b.y }, { x: px, y: py }, 0.02, b.z);
}
