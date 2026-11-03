// Darts at the dartboard (docs/plan/68-more-furniture.md, phase 23): where a dart lands scores as a
// real board does — the twenty segments in their order, the trebles and doubles rings, the outer
// bull and the bull — three darts a turn; the board keeps the last three stuck in it and its best.

/** The board's rings, m from its middle (a regulation board: 340 mm across its doubles). */
export const RINGS = {
  bull: 0.00635,
  outer: 0.0159,
  trebleIn: 0.099,
  trebleOut: 0.107,
  doubleIn: 0.162,
  doubleOut: 0.17,
};
/** The segments clockwise from the top. */
export const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const DARTS_A_TURN = 3;

/** What a dart at (x, y) scores (m from the middle, x right, y up). */
export function dartScore(
  x: number,
  y: number,
): { points: number; ring: "bull" | "outer" | "treble" | "double" | "single" | "miss"; seg: number } {
  const r = Math.hypot(x, y);
  if (r <= RINGS.bull) return { points: 50, ring: "bull", seg: 25 };
  if (r <= RINGS.outer) return { points: 25, ring: "outer", seg: 25 };
  if (r > RINGS.doubleOut) return { points: 0, ring: "miss", seg: 0 };
  // (clockwise from the top: 20 straddles it)
  const a = (Math.atan2(x, y) + Math.PI / 20 + Math.PI * 2) % (Math.PI * 2);
  const seg = SEGMENTS[Math.floor(a / (Math.PI / 10)) % 20];
  const ring = r >= RINGS.doubleIn ? "double" : r >= RINGS.trebleIn && r <= RINGS.trebleOut ? "treble" : "single";
  return { points: seg * (ring === "double" ? 2 : ring === "treble" ? 3 : 1), ring, seg };
}

/** Where a dart aimed at (x, y) lands: the hand's wobble at the moment it's let go (`wob`, its
 *  offset), a little spread from `r0` and `r1` (0..1 each). */
export function dartLands(x: number, y: number, wob: [number, number], r0: number, r1: number): [number, number] {
  const spread = 0.012 * Math.sqrt(-2 * Math.log(Math.max(1e-6, r0)));
  return [x + wob[0] + spread * Math.cos(r1 * Math.PI * 2), y + wob[1] + spread * Math.sin(r1 * Math.PI * 2)];
}

/** The aim's wobble at time `t` (s): a slow figure of eight, bigger the longer it's held. */
export function dartWobble(t: number): [number, number] {
  const k = 0.02 + Math.min(0.03, t * 0.006);
  return [k * Math.sin(t * 2.3), k * Math.sin(t * 3.7 + 0.8) * 0.8];
}
