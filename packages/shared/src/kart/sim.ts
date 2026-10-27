// The kart (docs/plan/46-the-karts.md, K-M1): an arcade model, not the car's sim-lite. A body on
// the ground with a speed along its heading and a grip that pulls its velocity back onto it; the
// drift-hop and its mini-turbos, boosts, air off the jump, soft walls. Deterministic at a fixed
// step: the same code drives your kart in your browser, the server's checks and Vortex's karts,
// and the tests. Metres, seconds, radians; heading `a` is atan2(dz, dx) (x east, z south), so a
// turn to the right makes it grow.

export const KART_STEP = 1 / 120;

/** What's underfoot. */
export type KartGround = "asphalt" | "kerb" | "snow" | "deep" | "ice" | "blackice";
export const KART_GROUNDS: Record<KartGround, { grip: number; speed: number }> = {
  asphalt: { grip: 1, speed: 1 },
  kerb: { grip: 1, speed: 0.97 },
  snow: { grip: 0.55, speed: 0.75 },
  deep: { grip: 0.6, speed: 0.4 },
  ice: { grip: 0.14, speed: 1 },
  blackice: { grip: 0.08, speed: 1 },
};

/** The numbers that make it feel the way it does (the sandbox's sliders tune a copy). */
export interface KartSpec {
  /** top speed (m/s), and how fast it gets there (1/s: 95 % in ~3/accel s) */
  vmax: number;
  accel: number;
  /** braking (m/s²), backing up (m/s²) to `vrev` */
  brake: number;
  reverse: number;
  vrev: number;
  /** rolling off the throttle: a constant and a square term */
  coast: number;
  drag: number;
  /** the steering: its turn rate at speed (rad/s), how much it fades at the top, how fast the
   *  wheel comes round with keys (1/s) */
  yaw: number;
  yawFade: number;
  steerRate: number;
  /** how fast the velocity swings back onto the heading (1/s), gripping and drifting */
  grip: number;
  driftGrip: number;
  /** a drift's turn rate (rad/s): its base, and how much the stick tightens or opens it */
  driftYaw: number;
  driftSteer: number;
  /** the hop: its kick up (m/s); a drift needs this speed (m/s) */
  hop: number;
  driftMin: number;
  /** the mini-turbo: charge (s, at the neutral rate) for blue, amber, purple; boost (s) each */
  tiers: [number, number, number];
  turbo: [number, number, number];
  /** boosts: the top speed's share, the kick, a boost pad's and a trick's length (s) */
  boostTop: number;
  boostKick: number;
  padBoost: number;
  trickBoost: number;
  /** the slipstream: how long (s) in another kart's wake earns a boost, and how long (s) it lasts */
  draftFor: number;
  draftBoost: number;
  /** gravity (m/s², arcade-heavy) */
  gravity: number;
  /** a wall's bounce (0..1) and what a scrape keeps of the speed along it */
  bounce: number;
  scrape: number;
  /** spun out (a hit): how long (s) */
  spinFor: number;
}
export const KART: KartSpec = {
  vmax: 24,
  accel: 1.25,
  brake: 30,
  reverse: 12,
  vrev: 7,
  coast: 1.2,
  drag: 0.004,
  yaw: 2.2,
  yawFade: 0.48,
  steerRate: 7,
  grip: 9,
  driftGrip: 2.4,
  driftYaw: 0.95,
  driftSteer: 0.75,
  hop: 2.4,
  driftMin: 7,
  tiers: [0.6, 1.2, 2.0],
  turbo: [0.5, 1.0, 1.6],
  boostTop: 1.35,
  boostKick: 1.12,
  padBoost: 1.0,
  trickBoost: 0.6,
  draftFor: 1.1,
  draftBoost: 0.8,
  gravity: 20,
  bounce: 0.3,
  scrape: 0.94,
  spinFor: 1.1,
};

export interface KartInput {
  /** 0..1 */
  throttle: number;
  brake: number;
  /** −1 left … 1 right */
  steer: number;
  /** the hop / drift key, held */
  hop: boolean;
  /** keys (the steer eased in) or a stick (as it is) */
  digital?: boolean;
  /** in another kart's wake (kartInWake: the caller knows where the others are) */
  draft?: boolean;
}
export const NO_INPUT: KartInput = { throttle: 0, brake: 0, steer: 0, hop: false };

/** Where the kart is and what it's doing. */
export interface KartState {
  x: number;
  y: number;
  z: number;
  a: number;
  vx: number;
  vy: number;
  vz: number;
  /** the wheel as it's turned (−1..1), and the yaw rate now (rad/s) */
  steer: number;
  w: number;
  air: boolean;
  /** drifting: −1 left, 1 right, 0 not; its charge (s) and the tier reached */
  drift: -1 | 0 | 1;
  charge: number;
  tier: 0 | 1 | 2 | 3;
  /** a hop in the air (it becomes a drift on landing if a way is held) */
  hopping: boolean;
  /** off a lip: a hop just after earns a trick */
  launched: number;
  trick: boolean;
  /** boost left (s) */
  boost: number;
  /** how long (s) in a wake so far */
  draft: number;
  /** spun out: time left (s) */
  spin: number;
  ground: KartGround;
  /** the ground's height under it last step */
  gy: number;
  /** this step's events: a wall (its impact speed), a landing, a turbo fired (its tier) */
  hit: number;
  landed: number;
  fired: 0 | 1 | 2 | 3;
  /** this step: the slipstream paid out */
  drafted: boolean;
  t: number;
  /** the hop key last step (for its press) */
  hopWas: boolean;
}

/** Under the kart, from the world: the ground's height for a kart at height `y` (a bridge's deck
 *  or the road under it), what it is, a boost pad. */
export interface KartUnder {
  y: number;
  ground: KartGround;
  pad?: boolean;
}
export interface KartWorld {
  under(x: number, z: number, y: number): KartUnder;
  /** a wall the kart (a circle `r` round its middle) is into: the way out (unit) and how deep */
  wall(x: number, z: number, y: number, r: number): { nx: number; nz: number; depth: number } | null;
}

/** The kart's footprint for walls (a circle round its middle). */
export const KART_R = 0.8;

export function createKart(x: number, y: number, z: number, a: number): KartState {
  return {
    x,
    y,
    z,
    a,
    vx: 0,
    vy: 0,
    vz: 0,
    steer: 0,
    w: 0,
    air: false,
    drift: 0,
    charge: 0,
    tier: 0,
    hopping: false,
    launched: 0,
    trick: false,
    boost: 0,
    draft: 0,
    drafted: false,
    spin: 0,
    ground: "asphalt",
    gy: y,
    hit: 0,
    landed: 0,
    fired: 0,
    t: 0,
    hopWas: false,
  };
}

/** Speed along the heading (m/s, − backing up). */
export const kartSpeed = (k: KartState) => k.vx * Math.cos(k.a) + k.vz * Math.sin(k.a);
/** The slide: the angle between where it points and where it goes (rad, + its tail out left). */
export function kartSlip(k: KartState): number {
  const v = Math.hypot(k.vx, k.vz);
  if (v < 1) return 0;
  let d = Math.atan2(k.vz, k.vx) - k.a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const tierOf = (s: KartSpec, c: number): 0 | 1 | 2 | 3 =>
  c >= s.tiers[2] ? 3 : c >= s.tiers[1] ? 2 : c >= s.tiers[0] ? 1 : 0;

/** One fixed step (KART_STEP). */
export function stepKart(k: KartState, i: KartInput, world: KartWorld, s: KartSpec = KART): void {
  const dt = KART_STEP;
  k.hit = 0;
  k.landed = 0;
  k.fired = 0;
  k.drafted = false;
  const under = world.under(k.x, k.z, k.y);
  const g = KART_GROUNDS[under.ground];
  k.ground = under.ground;
  const hopPress = i.hop && !k.hopWas;
  k.hopWas = i.hop;

  // ── the wheel ──
  const want = Math.max(-1, Math.min(1, i.steer));
  if (i.digital === false) k.steer = want;
  else {
    const d = want - k.steer;
    const m = s.steerRate * dt * (Math.sign(d) !== Math.sign(k.steer) && k.steer !== 0 ? 1.6 : 1);
    k.steer += Math.max(-m, Math.min(m, d));
  }

  const vf0 = kartSpeed(k);
  let vf = vf0;
  const speed = Math.abs(vf);

  // ── spun out: round and round, the speed bleeding away, no say in it ──
  if (k.spin > 0) {
    k.spin = Math.max(0, k.spin - dt);
    k.w = (4 * Math.PI) / s.spinFor;
    k.a += k.w * dt;
    k.vx *= Math.exp(-2.2 * dt);
    k.vz *= Math.exp(-2.2 * dt);
    k.drift = 0;
    k.charge = 0;
    k.tier = 0;
    k.boost = 0;
  } else {
    // ── the hop, the drift and its charge ──
    if (hopPress && !k.air && k.drift === 0) {
      k.vy = s.hop;
      k.air = true;
      k.hopping = true;
      // (a hop just off a lip: a trick, a little boost on landing)
      if (k.launched > 0) k.trick = true;
    }
    if (k.drift !== 0) {
      if (!i.hop || speed < s.driftMin * 0.7 || vf < 0) {
        // let go: the turbo, by the tier it got to
        if (i.hop === false && k.tier > 0 && vf > 0) {
          k.boost = Math.max(k.boost, s.turbo[k.tier - 1]);
          k.fired = k.tier;
          vf = Math.max(vf, s.vmax * s.boostKick);
        }
        k.drift = 0;
        k.charge = 0;
        k.tier = 0;
      } else {
        const into = k.steer * k.drift;
        k.charge += dt * (1 + 0.3 * Math.max(0, into) - 0.3 * Math.max(0, -into));
        k.tier = tierOf(s, k.charge);
      }
    }

    // ── the slipstream: long enough in a wake, near the top, a boost out of it ──
    if (i.draft && !k.air && vf > s.vmax * 0.6 && k.boost === 0) {
      k.draft += dt;
      if (k.draft >= s.draftFor) {
        k.boost = s.draftBoost;
        k.drafted = true;
        k.draft = 0;
      }
    } else k.draft = Math.max(0, k.draft - 2 * dt);

    // ── the throttle, the brake, rolling ──
    const top = s.vmax * g.speed * (k.boost > 0 ? s.boostTop : 1);
    if (k.boost > 0) {
      k.boost = Math.max(0, k.boost - dt);
      if (vf < top) vf += (top - vf) * Math.min(1, 3.5 * dt);
    }
    // (a hop is a little bounce, the wheels as good as down; off the jump it's flying)
    const flying = k.air && !k.hopping;
    if (!flying) {
      if (i.throttle > 0 && vf < top * i.throttle) vf += (top * i.throttle - vf) * Math.min(1, s.accel * dt);
      if (i.brake > 0) {
        if (vf > 0.3) vf = Math.max(0, vf - s.brake * i.brake * dt);
        else vf = Math.max(-s.vrev, vf - s.reverse * i.brake * dt);
      }
      if (i.throttle === 0 && i.brake === 0) {
        const c = (s.coast + s.drag * vf * vf) * dt;
        vf = Math.abs(vf) <= c ? 0 : vf - Math.sign(vf) * c;
      }
      // over the ground's top (deep snow, a boost run out): eased down to it
      if (vf > top) vf -= (vf - top) * Math.min(1, 2.5 * dt);
    }

    // ── turning ──
    let yaw: number;
    if (k.drift !== 0) {
      const f = Math.min(1, speed / 8);
      yaw = k.drift * (s.driftYaw + s.driftSteer * k.steer * k.drift) * f;
    } else {
      // (none standing still; full by ~7 m/s; fading towards the top; the other way backing up)
      const f = Math.min(1, speed / 7) * (1 - s.yawFade * Math.min(1, speed / s.vmax));
      yaw = k.steer * s.yaw * f * (vf < -0.5 ? -1 : 1);
    }
    if (flying) yaw *= 0.35;
    // (what the throttle and brake did, along the way it pointed)
    k.vx += (vf - vf0) * Math.cos(k.a);
    k.vz += (vf - vf0) * Math.sin(k.a);
    k.w = yaw;
    k.a += yaw * dt;

    // ── the velocity swung back onto the heading: grip, or a slide; a slide scrubs speed ──
    const v = Math.hypot(k.vx, k.vz);
    if (v > 0.01) {
      const back = vf < -0.3;
      const aim = k.a + (back ? Math.PI : 0);
      let slip = Math.atan2(k.vz, k.vx) - aim;
      while (slip > Math.PI) slip -= 2 * Math.PI;
      while (slip < -Math.PI) slip += 2 * Math.PI;
      const grip = flying ? 0.3 : (k.drift !== 0 ? s.driftGrip : s.grip) * g.grip;
      const scrub = flying ? 0 : k.drift !== 0 ? 0.35 : 1;
      const nv = v * Math.max(0, 1 - scrub * Math.abs(slip) * dt);
      const na = aim + slip * Math.exp(-grip * dt);
      k.vx = nv * Math.cos(na);
      k.vz = nv * Math.sin(na);
    }
  }

  // ── a boost pad ──
  if (under.pad && !k.air && k.spin === 0) {
    if (k.boost < s.padBoost * 0.5) {
      const c = Math.cos(k.a);
      const n = Math.sin(k.a);
      const f = Math.max(kartSpeed(k), s.vmax * s.boostKick);
      const l = -k.vx * n + k.vz * c;
      k.vx = f * c - l * n;
      k.vz = f * n + l * c;
    }
    k.boost = Math.max(k.boost, s.padBoost);
  }

  // ── up and down: on the ground, or flying ──
  const gy = under.y;
  k.vy -= s.gravity * dt;
  k.y += k.vy * dt;
  if (k.y <= gy + 0.001) {
    const slopeV = (gy - k.gy) / dt;
    if (k.air) {
      k.landed = Math.max(0, slopeV - k.vy);
      k.air = false;
      // landed from a hop with a way held: the drift starts
      if (k.hopping && i.hop && Math.abs(k.steer) > 0.25 && Math.abs(kartSpeed(k)) > s.driftMin && k.spin === 0) {
        k.drift = k.steer > 0 ? 1 : -1;
        k.charge = 0;
        k.tier = 0;
      }
      k.hopping = false;
      if (k.trick) {
        k.boost = Math.max(k.boost, s.trickBoost);
        k.fired = 1;
        k.trick = false;
      }
    }
    k.y = gy;
    k.vy = slopeV;
    // (riding over a lip: the ground falls away and it flies)
  } else if (k.y > gy + 0.05 && !k.air) {
    k.air = true;
    if (!k.hopping) k.launched = 0.18;
  }
  k.launched = Math.max(0, k.launched - dt);
  k.gy = gy;

  // ── move, then out of any wall ──
  k.x += k.vx * dt;
  k.z += k.vz * dt;
  const hit = world.wall(k.x, k.z, k.y, KART_R);
  if (hit) {
    k.x += hit.nx * hit.depth;
    k.z += hit.nz * hit.depth;
    const vn = k.vx * hit.nx + k.vz * hit.nz;
    if (vn < 0) {
      k.vx -= (1 + s.bounce) * vn * hit.nx;
      k.vz -= (1 + s.bounce) * vn * hit.nz;
      // (a scrape: the speed along the wall rubbed down by how square the hit was)
      const sq = Math.min(1, -vn / Math.max(1, Math.hypot(k.vx, k.vz)));
      const keep = 1 - (1 - s.scrape) * (0.3 + 0.7 * sq);
      k.vx *= keep;
      k.vz *= keep;
      k.hit = -vn;
      if (-vn > 6 && k.drift !== 0) {
        k.drift = 0;
        k.charge = 0;
        k.tier = 0;
      }
    }
  }
  k.t += dt;
}

/** Spin it out (a hit). */
export function spinOut(k: KartState, s: KartSpec = KART) {
  k.spin = s.spinFor;
  k.drift = 0;
  k.charge = 0;
  k.tier = 0;
  k.boost = 0;
}

/** In someone's wake: a kart 2.5–14 m ahead, near enough in line, going the same way. */
export function kartInWake(k: KartState, others: Iterable<{ x: number; z: number; a: number }>): boolean {
  const fx = Math.cos(k.a);
  const fz = Math.sin(k.a);
  for (const o of others) {
    const dx = o.x - k.x;
    const dz = o.z - k.z;
    const along = dx * fx + dz * fz;
    if (along < 2.5 || along > 14) continue;
    if (Math.abs(-dx * fz + dz * fx) > 1.2 + along * 0.06) continue;
    let d = o.a - k.a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < 0.6) return true;
  }
  return false;
}

/** Two karts this near touch (between their middles, m). */
export const KART_BUMP = 1.5;
/** My kart against another's (where it is, how it moves): pushed apart, the speed along the line
 *  between them traded a little (a light shove: each side does its own). True if they touched. */
export function bumpKart(k: KartState, ox: number, oz: number, ovx: number, ovz: number): boolean {
  const dx = k.x - ox;
  const dz = k.z - oz;
  const d = Math.hypot(dx, dz);
  if (d >= KART_BUMP || d < 1e-4) return false;
  const nx = dx / d;
  const nz = dz / d;
  k.x += nx * (KART_BUMP - d);
  k.z += nz * (KART_BUMP - d);
  const rel = (k.vx - ovx) * nx + (k.vz - ovz) * nz;
  if (rel < 0) {
    k.vx -= rel * 0.65 * nx;
    k.vz -= rel * 0.65 * nz;
    k.hit = Math.max(k.hit, -rel * 0.5);
  }
  return true;
}
