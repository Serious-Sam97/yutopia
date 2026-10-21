// Guns and flares (docs/plan/30-the-dark.md, D3 and D6): the numbers, and the
// tests the server makes (a shot's ray against one of the shadowed where the
// shooter saw it; where a thrown flare lands) and the clients draw from. Pure.

export const ARMS = {
  revolver: {
    /** s between shots; s a round to reload (one at a time, a shot stops it) */
    rate: 0.42,
    reload: 0.35,
    damage: 50,
    range: 40,
    pellets: 1,
    spread: 0.006,
  },
  shotgun: { rate: 0.95, reload: 0.6, damage: 18, range: 14, pellets: 8, spread: 0.09 },
} as const;
export type GunId = keyof typeof ARMS;

/** One of us hit by another's shot (the HQ armed, plan 30): half what the shadowed take. */
export const PVP = 0.5;
export const pvpDamage = (gun: GunId) => Math.round(ARMS[gun].damage * PVP);

/** The shadowed as a target: a column this wide round where it stands, this tall. */
export const BODY = { r: 0.38, h: 1.8 };
/** A shot is taken against where the shooter saw them: the playback's delay (world/dark
 *  shades.ts) plus the line's lag, give or take this (ms), and this far (tiles). */
export const REWIND = { delay: 150, maxLag: 300, slackMs: 60, slack: 0.15, people: 110 };
// (`people`: the others are drawn this far behind (the world's INTERP_MS), not the shadowed's 150)

/** Where something was at `t` along its last second (`hist`, oldest first), between the two
 *  samples round it; before the first, the first; past the last, the last. */
export function pastAt<T extends { t: number; x: number; y: number; z: number }>(
  hist: readonly T[],
  t: number,
): { x: number; y: number; z: number; at: T } | null {
  if (!hist.length) return null;
  let i = hist.length - 1;
  while (i > 0 && hist[i].t > t) i--;
  const a = hist[i];
  const b = hist[Math.min(hist.length - 1, i + 1)];
  const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, at: a };
}
/** The muzzle the shooter says must be within this of where the server has them. */
export const MUZZLE_REACH = 1;

export const FLARE = {
  /** its light reaches this far; it burns this long (s) */
  radius: 6,
  secs: 12,
  /** thrown: this fast (tiles / s), the air's pull (tiles / s²), from the hand's height */
  speed: 9,
  gravity: 14,
  hand: 1.35,
  /** how long it flies before it's lit where it lands (s) */
  max: 1.6,
} as const;

export interface Ray {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** The way a ray goes, a unit vector (x, y on the floor; z up). */
export function rayDir(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const c = Math.cos(pitch);
  return { x: Math.cos(yaw) * c, y: Math.sin(yaw) * c, z: Math.sin(pitch) };
}

/** How far along the ray it meets a body standing at (x, y) on ground `z0` (null: it
 *  doesn't, within `range`), the body `slack` wider; `h` tall (one of us crouched: less). */
export function rayMeets(
  r: Ray,
  x: number,
  y: number,
  z0: number,
  range: number,
  slack = 0,
  h: number = BODY.h,
): number | null {
  const d = rayDir(r.yaw, r.pitch);
  const flat = Math.hypot(d.x, d.y);
  if (flat < 1e-6) return null;
  // the nearest the ray's line passes the column's axis, on the floor
  const fx = x - r.x;
  const fy = y - r.y;
  const along = (fx * d.x + fy * d.y) / (flat * flat); // (in the ray's own length)
  if (along < 0) return null;
  const px = r.x + d.x * along;
  const py = r.y + d.y * along;
  const miss = Math.hypot(px - x, py - y);
  const rad = BODY.r + slack;
  if (miss > rad) return null;
  // into the column's edge, and the height it's at there
  const back = Math.sqrt(Math.max(0, rad * rad - miss * miss)) / flat;
  const t = Math.max(0, along - back);
  if (t > range) return null;
  const z = r.z + d.z * t;
  // (over its head or under its feet across the whole column: missed)
  const zEnd = r.z + d.z * (along + back);
  const lo = Math.min(z, zEnd);
  const hi = Math.max(z, zEnd);
  if (hi < z0 - slack || lo > z0 + h + slack) return null;
  return t;
}

/** A shotgun's pellets (or the revolver's one): the ways they go, spread round the aim,
 *  from a seed (the same on the server and in the shooter's tracers). */
export function pellets(gun: GunId, yaw: number, pitch: number, seed: number): { yaw: number; pitch: number }[] {
  const g = ARMS[gun];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = Math.imul(s ^ (s >>> 13), 0x5bd1e995) >>> 0;
    s ^= s >>> 15;
    return (s >>> 0) / 4294967296;
  };
  const out: { yaw: number; pitch: number }[] = [];
  for (let i = 0; i < g.pellets; i++) {
    const a = rnd() * Math.PI * 2;
    const m = g.spread * Math.sqrt(rnd());
    out.push({ yaw: yaw + Math.cos(a) * m, pitch: pitch + Math.sin(a) * m });
  }
  return out;
}

/** Where a flare thrown from (x, y) — the hand at z — lands: along `yaw`, up at `pitch` (a
 *  little more, as an arm throws), down to `ground(x, y)`; stopped by `blocked(x, y)` (a
 *  wall, a trunk: it drops there). And how long it flies. */
export function flareFlight(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  ground: (x: number, y: number) => number,
  blocked: (x: number, y: number) => boolean,
): { x: number; y: number; z: number; secs: number } {
  const up = Math.max(-0.2, Math.min(1.1, pitch + 0.35));
  const vx = Math.cos(yaw) * Math.cos(up) * FLARE.speed;
  const vy = Math.sin(yaw) * Math.cos(up) * FLARE.speed;
  let vz = Math.sin(up) * FLARE.speed;
  let px = x;
  let py = y;
  let pz = z;
  const dt = 1 / 60;
  for (let t = 0; t < FLARE.max; t += dt) {
    const nx = px + vx * dt;
    const ny = py + vy * dt;
    if (blocked(nx, ny)) return { x: px, y: py, z: ground(px, py), secs: t };
    vz -= FLARE.gravity * dt;
    px = nx;
    py = ny;
    pz += vz * dt;
    const g = ground(px, py);
    if (pz <= g) return { x: px, y: py, z: g, secs: t };
  }
  return { x: px, y: py, z: ground(px, py), secs: FLARE.max };
}

/** In a flare's light at (x, y) (the floor's coords) on `level` (a flare's: 0 if it has none). */
export const inFlare = (f: { x: number; y: number; level?: number }, x: number, y: number, level = 0) =>
  (f.level ?? 0) === level && Math.hypot(f.x - x, f.y - y) < FLARE.radius;
