// Vortex at the wheel (docs/plan/46-the-karts.md, phase 6): the server drives his karts with the
// same sim as yours. On the circuit he steers his path (pure pursuit) through a point down the lap,
// lifts and brakes for what's coming, and — as well as his level lets him — drifts the bends to
// purple and snakes; in the bowl he hunts the nearest kart. Levels: how fast he dares, how well he
// drifts, how his aim wobbles.

import { KART_BOWL, trackAt } from "./park.ts";
import { KART, type KartInput, type KartSpec, type KartState, kartSpeed } from "./sim.ts";
import type { TrackWorld } from "./world.ts";

export type VortexLevel = "easy" | "medium" | "hard";
export const VORTEX_LEVELS: Record<VortexLevel, { pace: number; drifts: number; wobble: number; aim: number }> = {
  easy: { pace: 0.8, drifts: 0, wobble: 0.22, aim: 0.45 },
  medium: { pace: 0.92, drifts: 0.6, wobble: 0.1, aim: 0.25 },
  hard: { pace: 1, drifts: 1, wobble: 0.03, aim: 0.08 },
};

const clamp = (x: number) => Math.max(-1, Math.min(1, x));

/** His rubber band: his top speed's share by how far (m along the race) he is behind the leading
 *  driver (− ahead). Behind, a little quicker; ahead, Easy and Medium ease off; Hard never does. */
export const VORTEX_BAND: Record<VortexLevel, { up: number; down: number }> = {
  easy: { up: 0.04, down: 0.08 },
  medium: { up: 0.07, down: 0.04 },
  hard: { up: 0.1, down: 0 },
};
export function vortexBand(level: VortexLevel, gap: number): number {
  const b = VORTEX_BAND[level];
  const u = clamp(gap / 120);
  return 1 + (u > 0 ? u * b.up : u * b.down);
}
const wrapA = (d: number) => {
  let x = d;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

/** His driving round the circuit; `seed` his own wobble's phase, `lane` a lateral offset he keeps. */
export function vortexRacer(world: TrackWorld, level: VortexLevel, seed: number, lane = 0, s: KartSpec = KART) {
  const L = VORTEX_LEVELS[level];
  const t = world.track;
  return (k: KartState): KartInput => {
    const here = world.locate(k.x, k.z, k.y);
    const at = here ? here.s : 0;
    const v = Math.max(1, kartSpeed(k));
    const look = 5 + v * 0.45;
    const q = trackAt(t, at + look);
    // (his line: a little off the middle, his own, wobbling as his level does)
    const off = lane + Math.sin(k.t * 0.7 + seed) * L.wobble * 4;
    const qx = q.x + Math.sin(q.a) * off;
    const qz = q.z - Math.cos(q.a) * off;
    const path = v > 3 ? Math.atan2(k.vz, k.vx) : k.a;
    const d = wrapA(Math.atan2(qz - k.z, qx - k.x) - path);
    const yawWant = (v * 2 * Math.sin(d)) / look;
    const bend = (from: number, to: number) => {
      let sum = 0;
      for (let a = from; a <= to; a += 2) sum += trackAt(t, at + a).k;
      return sum / ((to - from) / 2 + 1);
    };
    const throttle = L.pace >= 1 || v < s.vmax * L.pace ? 1 : 0;
    // drifting: as well as his level lets him (some bends, not all)
    const bendNo = Math.floor(at / 40);
    const drifts = ((bendNo * 7919 + seed * 104729) % 100) / 100 < L.drifts;
    if (drifts && v > s.driftMin + 2) {
      const ahead = bend(6, 30);
      if (k.drift === 0 && Math.abs(ahead) > 1 / 90 && (!k.air || k.hopping))
        return { throttle: 1, brake: 0, steer: Math.sign(ahead), hop: true, digital: false };
      if (k.drift !== 0) {
        const near = bend(2, 14);
        const keep = Math.sign(near) === k.drift && Math.abs(near) > 1 / 140 && k.tier < 3;
        const f = Math.min(1, v / 8);
        const steer = clamp(((yawWant / f) * k.drift - s.driftYaw) / s.driftSteer) * k.drift;
        return { throttle: 1, brake: 0, steer, hop: keep, digital: false };
      }
    }
    let kmax = 0;
    for (let a = 4; a < 34; a += 2) kmax = Math.max(kmax, Math.abs(trackAt(t, at + a).k));
    const allowed = (s.yaw / (kmax + (s.yaw * s.yawFade) / s.vmax)) * (0.9 + 0.1 * L.pace);
    const f = Math.min(1, v / 7) * (1 - s.yawFade * Math.min(1, v / s.vmax));
    const steer = clamp(yawWant / (s.yaw * f));
    return {
      throttle: v > allowed + 1.5 ? 0 : throttle,
      brake: v > allowed + 4 ? 1 : 0,
      steer,
      hop: false,
      digital: false,
    };
  };
}

/** His driving in the bowl: at the nearest kart (`target`), round the floor when there's none. */
export function vortexBrawler(level: VortexLevel, seed: number) {
  const L = VORTEX_LEVELS[level];
  return (k: KartState, target: { x: number; z: number } | null): KartInput => {
    const B = KART_BOWL;
    const goal = target ?? {
      x: B.x + Math.cos(k.t * 0.4 + seed) * B.floor * 0.6,
      z: B.z + Math.sin(k.t * 0.4 + seed) * B.floor * 0.6,
    };
    const want = Math.atan2(goal.z - k.z, goal.x - k.x) + Math.sin(k.t * 1.3 + seed) * L.wobble;
    const d = wrapA(want - k.a);
    const v = kartSpeed(k);
    // (too near the bank and turned away from the middle: brake round)
    const out = Math.hypot(k.x - B.x, k.z - B.z) > B.floor + 3;
    return {
      throttle: Math.abs(d) > 2.2 && v > 6 ? 0.3 : L.pace,
      brake: out && Math.abs(d) > 1.6 ? 0.6 : 0,
      steer: clamp(d * 2),
      hop: false,
      digital: false,
    };
  };
}
