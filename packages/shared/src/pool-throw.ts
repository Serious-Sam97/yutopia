// Pool balls out of a game (the user's ask, 2026-10-22): off a table that
// isn't being played, a ball can be taken and thrown at people, and the cue
// taken down turns into a gun that fires balls. Whoever a ball meets is
// knocked down on the spot: thrown back onto the floor, a moment there, up
// again. Pure: the server flies each ball tick by tick against where everyone
// is (the one it reaches first falls), every client draws the same flight from
// the same launch.
//
// World units: tiles (a body is BODY.h = 1.8 tall), seconds; z up.

export const PBALL = {
  /** tiles / s out of the hand, out of the cue */
  throwSpeed: 12,
  cueSpeed: 26,
  /** tiles / s² down (the cue's shots fly flatter: they go out faster) */
  gravity: 9.8,
  /** a ball's radius as drawn and as it hits, tiles (the table's balls are 57 mm at 1.55 a metre) */
  r: 0.045,
  /** how high it leaves the hand (the cue's tip: the gun's own muzzle, sent with the shot) */
  hand: 1.35,
  /** a flight ends by then at the latest (s) */
  maxSecs: 2.5,
  /** s between throws; between the cue's shots */
  throwRate: 0.6,
  cueRate: 0.38,
  /** how near (tiles) to take a ball off the floor, or off a table / its cue (from the table's edge) */
  reach: 1.3,
  /** a ball lying on the floor: back on its table after this (ms) untouched; one the cue fired, gone */
  restMs: 20_000,
  cueRestMs: 7_000,
  /** how wide a body is to a ball (its column's radius, tiles) */
  body: 0.3,
} as const;

/** Knocked down (Player.fellAt): thrown back, on the floor, up again — `secs` in all; they can't
 *  move or act for `still` of it. */
export const KNOCK = { secs: 3.6, still: 3.2 } as const;

export interface Launch {
  x0: number;
  y0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
}

/** A launch from (x, y, z) at `speed` along yaw (0 = +x, towards +y) and pitch (up). */
export function launch(x: number, y: number, z: number, yaw: number, pitch: number, speed: number): Launch {
  const c = Math.cos(pitch);
  return {
    x0: x,
    y0: y,
    z0: z,
    vx: Math.cos(yaw) * c * speed,
    vy: Math.sin(yaw) * c * speed,
    vz: Math.sin(pitch) * speed,
  };
}

/** Where the ball is `t` s into its flight. */
export function flightAt(f: Launch, t: number): { x: number; y: number; z: number } {
  return { x: f.x0 + f.vx * t, y: f.y0 + f.vy * t, z: f.z0 + f.vz * t - 0.5 * PBALL.gravity * t * t };
}

/** The pitch that puts a throw at `speed` onto a point `d` tiles away and `dz` up (the lower of
 *  the two arcs); out of reach: as far as it goes (45°). */
export function aimPitch(d: number, dz: number, speed: number): number {
  const g = PBALL.gravity;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * d * d + 2 * dz * v2);
  if (d < 1e-3) return dz >= 0 ? Math.PI / 2 : -Math.PI / 2;
  if (disc < 0) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * d));
}

/** Someone a ball can meet: standing at (x, y) on `z`, `h` tall. */
export interface Column {
  id: string;
  x: number;
  y: number;
  z: number;
  h: number;
}
export interface Stop {
  t: number; // s into the flight
  kind: "person" | "wall" | "ground" | "out";
  id?: string; // whom
  x: number;
  y: number;
  z: number;
}

/** The flight from t0 to t1 (s), in small steps: the first thing it meets — someone (not
 *  `skip`), a wall or anything standing that high (`blocked` at its height), the floor
 *  (`ground`) — or null, still flying. */
export function flyStep(
  f: Launch,
  t0: number,
  t1: number,
  people: readonly Column[],
  ground: (x: number, y: number) => number,
  blocked: (x: number, y: number, z: number) => boolean,
  skip = "",
): Stop | null {
  const end = Math.min(t1, PBALL.maxSecs);
  const n = Math.max(1, Math.ceil((end - t0) / 0.008));
  for (let i = 1; i <= n; i++) {
    const t = t0 + ((end - t0) * i) / n;
    const p = flightAt(f, t);
    for (const q of people) {
      if (q.id === skip) continue;
      if (Math.hypot(p.x - q.x, p.y - q.y) > PBALL.body + PBALL.r) continue;
      if (p.z < q.z - PBALL.r || p.z > q.z + q.h + PBALL.r) continue;
      return { t, kind: "person", id: q.id, ...p };
    }
    if (blocked(p.x, p.y, p.z)) return { t, kind: "wall", ...p };
    const gz = ground(p.x, p.y);
    if (p.z - PBALL.r <= gz) return { t, kind: "ground", x: p.x, y: p.y, z: gz + PBALL.r };
  }
  return end >= PBALL.maxSecs ? { t: end, kind: "out", ...flightAt(f, end) } : null;
}

/** Where a stopped ball comes to rest on the floor: it drops off whoever it hit, bounces back off
 *  a wall a little, rolls on a short way along the floor. */
export function restOf(
  f: Launch,
  s: Stop,
  ground: (x: number, y: number) => number,
  blocked: (x: number, y: number, z: number) => boolean,
): { x: number; y: number; z: number } {
  const v = Math.hypot(f.vx, f.vy) || 1;
  const ux = f.vx / v;
  const uy = f.vy / v;
  const go = s.kind === "ground" ? 0.6 : s.kind === "person" ? -0.35 : -0.25;
  let x = s.x;
  let y = s.y;
  // (along its way, or back off what it met, stopping short of a wall)
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const nx = s.x + ux * go * (i / steps);
    const ny = s.y + uy * go * (i / steps);
    if (blocked(nx, ny, ground(nx, ny))) break;
    x = nx;
    y = ny;
  }
  return { x, y, z: ground(x, y) + PBALL.r };
}

/** After it stops: from where it stopped down to where it rests, a bounce on the way
 *  (`k` s after the stop; settled at SETTLE). */
export const SETTLE = 0.5;
export function settleAt(
  stop: { x: number; y: number; z: number },
  rest: { x: number; y: number; z: number },
  k: number,
): { x: number; y: number; z: number } {
  const u = Math.max(0, Math.min(1, k / SETTLE));
  const x = stop.x + (rest.x - stop.x) * u;
  const y = stop.y + (rest.y - stop.y) * u;
  // down to the floor by 40% of the way, then a bounce a fifth as high
  const fall = Math.max(0, stop.z - rest.z);
  const z =
    u < 0.4
      ? stop.z - fall * (u / 0.4) ** 2
      : rest.z + Math.min(0.12, fall * 0.2 + 0.03) * Math.sin(((u - 0.4) / 0.6) * Math.PI);
  return { x, y, z };
}

/** A ball's `down` on its table's layout while it's off the table (out of a game). */
export const OFF_TABLE = 99;

/** Held: "pball:<n>" — ball n in the hand. */
export const heldBall = (held: string | undefined | null): number => {
  const m = /^pball:(\d{1,2})$/.exec(held ?? "");
  return m ? Number(m[1]) : -1;
};
