// The torches' beams (docs/plan/30-the-dark.md, D4): one test for both views
// and the server. Pure: nothing of the Grounds in it.
//
// The flashlight: a cone from the left hand along where you look. Wide when
// you're just walking (tilted down at the ground ahead); focused while you aim
// with it — narrower, further, and it drains the battery (vitals.ts) and burns
// the shadowed's shield (phase 4).
export const BEAM = {
  wide: { len: 10, half: 0.36 },
  focus: { len: 14, half: 0.2 },
  /** not aiming, the beam points down at the ground a few tiles ahead (rad) */
  tilt: -0.13,
  /** where the flashlight's lens is (the left hand: the right one's the gun's), measured on the
   *  model (world/chars torchPose, aimPose): tiles over the feet, ahead, to the left of the body's
   *  line — low in the hand, and held out along the look, aiming */
  hand: 0.9,
  ahead: 0.5,
  side: 0.2,
  held: 1.05,
  heldAhead: 0.72,
  heldSide: 0.03,
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

/** Aiming, the body stands bladed: turned this far (rad) to the right of where it looks, the
 *  shoulders and the arms twisted back along the look (world/chars aimPose) — so over the right
 *  shoulder the flashlight and the gun are out where they're seen, as Alan Wake holds them. A
 *  body's facing (Player.yaw) is the look plus this; the beam goes along the look. */
export const AIM_BLADE = 0.45;

/** The beam of someone at (x, y), feet at z, facing `yaw` (their body: aiming, bladed — the beam's
 *  AIM_BLADE left of it, along the look); `pitch` while aiming (null: not aiming — tilted at the
 *  ground); focused (aiming, with battery left). */
export function beamOf(x: number, y: number, z: number, facing: number, pitch: number | null, focus: boolean): Beam {
  const aiming = pitch !== null;
  const yaw = aiming ? facing - AIM_BLADE : facing;
  const ahead = aiming ? BEAM.heldAhead : BEAM.ahead;
  const side = aiming ? BEAM.heldSide : BEAM.side;
  return {
    // (left of the facing: (sin, −cos) — the right hand's (−sin, cos), world/dark/arms.ts)
    x: x + Math.cos(yaw) * ahead + Math.sin(yaw) * side,
    y: y + Math.sin(yaw) * ahead - Math.cos(yaw) * side,
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
