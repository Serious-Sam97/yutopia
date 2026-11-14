// The fight with Vortex (docs/plan/88-vortex-fight.md): his health a fraction of a pool that scales with how many
// are shooting him, three acts by how much is left, who's in it. Pure: the server keeps it, the client reads its
// numbers (the HUD's cassette, the act's ticks).

export const VORTEX_FIGHT = {
  /** health a shooter brings (as the shadowed take damage: `damageAt`) — a steady revolver's minute or two each */
  perShooter: 1500,
  /** shooters counted over this long (ms) — a scale that follows who's really in it */
  window: 30_000,
  /** the acts' thresholds, health left: act II under the first, act III under the second */
  acts: [0.7, 0.35] as const,
  /** no shot at him this long (ms): he calms down, healed */
  calm: 40_000,
  /** beaten: on the floor this long (ms), then away */
  fall: 8000,
  /** …and away this long (ms) before he's back in the server room */
  away: 10 * 60_000,
  /** his body for a shot: a column on his floor (m) — his drawing's ball, a little wider than a person */
  r: 0.55,
  z0: 0.1,
  h: 1.15,
} as const;

export type Act = 0 | 1 | 2 | 3;

/** The act at `k` health left (1 full … 0) — never back up within a fight (`was`). */
export function actOf(k: number, was: Act = 0): Act {
  const [a2, a3] = VORTEX_FIGHT.acts;
  const now: Act = k > a2 ? 1 : k > a3 ? 2 : 3;
  return (Math.max(now, was) as Act) || 1;
}

/** How many count as shooting him at `now`: their last hits within the window — one at least. */
export function shooters(lastHits: Iterable<number>, now: number): number {
  let n = 0;
  for (const t of lastHits) if (now - t <= VORTEX_FIGHT.window) n++;
  return Math.max(1, n);
}

/** His health left after `damage`, at `k`, with `n` shooting: the pool `perShooter × n`. */
export function hurtBy(k: number, damage: number, n: number): number {
  return Math.max(0, k - Math.max(0, damage) / (VORTEX_FIGHT.perShooter * Math.max(1, n)));
}
