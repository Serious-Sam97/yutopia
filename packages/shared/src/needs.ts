// Levels that run 0..100 and drift with time: the pets' needs (pets.ts) and a
// survivor's vitals (vitals.ts), and later the office's needs. Rates are per
// whatever unit `t` is in (the pets' hours, the vitals' seconds), never below 0.

export const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/** `v` after `t` of falling at `rate`, never under 0. */
export const drain = (v: number, rate: number, t: number) => clamp100(v - rate * t);

/** `v` after `t` of rising at `rate` up to `upTo` (100 if not given); one above it stays. */
export const fill = (v: number, rate: number, t: number, upTo?: number) =>
  v >= (upTo ?? 100) ? v : Math.min(upTo ?? 100, v + rate * t);
