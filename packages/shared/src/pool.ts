// Pool physics (Fita 13, 8-ball): the balls on a 7-ft table, in real units —
// metres, kilograms, seconds. The table's frame (shared/tables.ts): the cloth's
// centre at 0, x along the length (the head, where you break from, at −x; the
// rack on the foot spot at +x), y across, z up; right-handed seen from above.
//
// What makes it play like a table rather than air hockey:
//  · a struck ball SLIDES; the cloth's friction turns the slide into a roll —
//    so a ball hit below centre comes back (draw), above it follows through,
//    and dead centre at the right speed stops on the spot (stun);
//  · rolling balls slow on the cloth's resistance; side spin wears off on its own;
//  · ball on ball is nearly elastic, with THROW: the balls' surfaces rub, so a
//    slow cut sends the object ball a little off the line of centres;
//  · cushions give back speed by how hard they're hit, and side spin changes
//    the angle off them (running and check english); a ball rolling into a
//    cushion keeps its roll, so it comes off sliding and drags;
//  · pockets have real mouths: two angled jaws each, the cushion's noses at
//    their ends — a ball struck at the jaw can rattle and stay out.
//
// Stepping: fixed 1 ms steps; inside a step, contacts are found by their time
// of impact (earliest first), so a 10 m/s break never tunnels through a ball.
// Deterministic: plain arithmetic only inside the loop (no Math.exp/sin/cos),
// no randomness — the server runs a shot from its parameters, every client runs
// the same shot to animate it, and at rest everyone eases to the server's layout.

// ── the table ────────────────────────────────────────────────────────────────
export const POOL_L = 1.981; // cloth, nose to nose
export const POOL_W = 0.991;
export const BALL_R = 0.028575;
const HL = POOL_L / 2;
const HW = POOL_W / 2;
const G = 9.81;

// tuned constants (see the tests for what each one is checked against)
export const POOL_PHYS = {
  slide: 0.2, // ball–cloth sliding friction
  roll: 0.012, // rolling resistance
  spinDecay: 18, // rad/s² side spin (about z) wears off
  ballE: 0.95, // ball–ball restitution
  cushionE: [0.9, 0.06, 0.62] as const, // e = a − b·|vn|, at least c
  cushionMu: 0.2, // ball–cushion friction (english off the rail)
  jawE: 0.72, // jaws are deader than the cushions (× the cushion's e)
  speedMax: 9, // m/s off the cue at full power
};

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number; // unit normal, pointing onto the cloth
  ny: number;
  jaw: boolean;
  rail: number; // which cushion (0..5) or pocket (jaws: 10 + pocket)
}

// Pockets, counter-clockwise from the head's top corner (seen from above):
//   0 (−x,+y) · 1 (0,+y) · 2 (+x,+y) · 3 (+x,−y) · 4 (0,−y) · 5 (−x,−y)
// Cushions: 0 / 1 the +y rail's two halves (head, foot), 2 the foot (+x),
// 3 / 4 the −y rail's halves (foot, head), 5 the head (−x).
export interface Pocket {
  x: number; // where it is (the hole's centre, for drawing and the drop)
  y: number;
  side: boolean;
  mouth: number; // nose to nose, m
  // the drop line: past it (along `dx, dy`, pointing out of the table) the ball falls
  lx: number;
  ly: number;
  dx: number;
  dy: number;
}

const CORNER_MOUTH = 0.116; // 4.6"
const SIDE_MOUTH = 0.132; // 5.2"
const CORNER_JAW_ANGLE = (142 * Math.PI) / 180; // between the cushion's face and the jaw
const SIDE_JAW_ANGLE = (104 * Math.PI) / 180;
const JAW_LEN = 0.07;

function seg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  jaw: boolean,
  rail: number,
  inside: [number, number],
): Seg {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len;
  let ny = dx / len;
  // the normal points to the side the balls are on
  if ((inside[0] - ax) * nx + (inside[1] - ay) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { ax, ay, bx, by, nx, ny, jaw, rail };
}

function build(): { segs: Seg[]; pockets: Pocket[] } {
  const c = CORNER_MOUTH / Math.SQRT2; // a corner jaw's nose, along each cushion from the corner
  const s = SIDE_MOUTH / 2;
  const segs: Seg[] = [];
  const pockets: Pocket[] = [];
  // the six cushions, nose to nose
  const cushions: [number, number, number, number, number][] = [
    [-HL + c, HW, -s, HW, 0],
    [s, HW, HL - c, HW, 1],
    [HL, HW - c, HL, -HW + c, 2],
    [HL - c, -HW, s, -HW, 3],
    [-s, -HW, -HL + c, -HW, 4],
    [-HL, -HW + c, -HL, HW - c, 5],
  ];
  for (const [ax, ay, bx, by, rail] of cushions) segs.push(seg(ax, ay, bx, by, false, rail, [0, 0]));

  // a jaw from a nose (px, py), leaving the cushion running along (ux, uy)
  // (pointing away from the pocket) at `ang` to its face, out of the table
  const jaw = (px: number, py: number, ux: number, uy: number, ox: number, oy: number, ang: number, pocket: number) => {
    // turn u by ang towards the outside (o: outward normal of that cushion)
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const jx = ux * ca + ox * sa;
    const jy = uy * ca + oy * sa;
    const ex = px + jx * JAW_LEN;
    const ey = py + jy * JAW_LEN;
    // the jaw's inside: towards the pocket's middle (across the mouth)
    return { seg: seg(px, py, ex, ey, true, 10 + pocket, [0, 0]), ex, ey };
  };

  const corner = (sx: number, sy: number, i: number) => {
    // sx, sy: ±1, which corner
    const cx = sx * HL;
    const cy = sy * HW;
    // nose on the long cushion (along x) and on the end cushion (along y)
    const a = jaw(cx - sx * c, cy, -sx, 0, 0, sy, CORNER_JAW_ANGLE, i);
    const b = jaw(cx, cy - sy * c, 0, -sy, sx, 0, CORNER_JAW_ANGLE, i);
    // inside of each jaw: the other jaw's side
    a.seg = seg(a.seg.ax, a.seg.ay, a.ex, a.ey, true, 10 + i, [b.ex, b.ey]);
    b.seg = seg(b.seg.ax, b.seg.ay, b.ex, b.ey, true, 10 + i, [a.ex, a.ey]);
    segs.push(a.seg, b.seg);
    const k = Math.SQRT1_2;
    pockets[i] = {
      x: cx + sx * 0.018,
      y: cy + sy * 0.018,
      side: false,
      mouth: CORNER_MOUTH,
      lx: (a.ex + b.ex) / 2,
      ly: (a.ey + b.ey) / 2,
      dx: sx * k,
      dy: sy * k,
    };
  };
  const side = (sy: number, i: number) => {
    const cy = sy * HW;
    const a = jaw(-s, cy, -1, 0, 0, sy, SIDE_JAW_ANGLE, i);
    const b = jaw(s, cy, 1, 0, 0, sy, SIDE_JAW_ANGLE, i);
    a.seg = seg(a.seg.ax, a.seg.ay, a.ex, a.ey, true, 10 + i, [b.ex, b.ey]);
    b.seg = seg(b.seg.ax, b.seg.ay, b.ex, b.ey, true, 10 + i, [a.ex, a.ey]);
    segs.push(a.seg, b.seg);
    pockets[i] = {
      x: 0,
      y: cy + sy * 0.045,
      side: true,
      mouth: SIDE_MOUTH,
      lx: 0,
      ly: (a.ey + b.ey) / 2 - sy * 0.012,
      dx: 0,
      dy: sy,
    };
  };
  corner(-1, 1, 0);
  side(1, 1);
  corner(1, 1, 2);
  corner(1, -1, 3);
  side(-1, 4);
  corner(-1, -1, 5);
  return { segs, pockets };
}

const TABLE = build();
export const POOL_SEGS: readonly Seg[] = TABLE.segs;
export const POOL_POCKETS: readonly Pocket[] = TABLE.pockets;
export const HEAD_STRING = -HL / 2; // the kitchen: x below this
export const FOOT_SPOT = { x: HL / 2, y: 0 };
export const HEAD_SPOT = { x: -HL / 2, y: 0 };

// ── balls ────────────────────────────────────────────────────────────────────
export interface PoolBall {
  id: number; // 0 = the cue ball, 1–7 solids, 8, 9–15 stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  wx: number; // spin, rad/s (x/y: roll and its opposite; z: side spin)
  wy: number;
  wz: number;
  q: [number, number, number, number]; // orientation (x, y, z, w): numbers and stripes roll
  down: number; // −1 on the table, else the pocket it fell in
}

export const newBall = (id: number, x: number, y: number): PoolBall => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  wx: 0,
  wy: 0,
  wz: 0,
  q: [0, 0, 0, 1],
  down: -1,
});
export const cloneBalls = (b: readonly PoolBall[]): PoolBall[] =>
  b.map((x) => ({ ...x, q: [...x.q] as PoolBall["q"] }));

// mulberry32: the rack's shuffle and its hair-width gaps, from a seed
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a tight rack: the balls touch within a tenth of a millimetre, each a hair
// off its spot (no two breaks alike); looser racks break weakly
export const RACK = { gap: 0.00001, jitter: 0.0001 };
// The rack: a triangle with its apex on the foot spot, pointing at the head;
// the 8 in the middle of the third row, a solid and a stripe in the back
// corners, the rest shuffled, racked tight (see RACK). The cue
// ball on the head spot.
export function rack(seed: number): PoolBall[] {
  const r = rng(seed);
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  shuffle(solids);
  shuffle(stripes);
  const solidLeft = r() < 0.5;
  const corners = solidLeft
    ? [solids.pop() as number, stripes.pop() as number]
    : [stripes.pop() as number, solids.pop() as number];
  const rest = shuffle([...solids, ...stripes]);
  const gap = 2 * BALL_R + RACK.gap;
  const row = gap * (Math.sqrt(3) / 2);
  const out: PoolBall[] = [newBall(0, HEAD_SPOT.x, 0)];
  for (let k = 0; k < 5; k++)
    for (let j = 0; j <= k; j++) {
      let id: number;
      if (k === 2 && j === 1) id = 8;
      else if (k === 4 && j === 0) id = corners[0];
      else if (k === 4 && j === 4) id = corners[1];
      else id = rest.pop() as number;
      const jx = (r() - 0.5) * RACK.jitter;
      const jy = (r() - 0.5) * RACK.jitter;
      out.push(newBall(id, FOOT_SPOT.x + k * row + jx, (j - k / 2) * gap + jy));
    }
  return out;
}

// ── the shot ─────────────────────────────────────────────────────────────────
export interface PoolShot {
  angle: number; // radians, the cue's direction on the table (0 = +x)
  power: number; // 0..1
  spinX: number; // −1..1: where the tip hits across the ball (+ = right of centre, seen from behind the cue)
  spinY: number; // −1..1: up the ball (+ = follow / topspin, − = draw)
}

export type PoolEvent = {
  t: number; // s since the cue hit
  k: "cue" | "ball" | "rail" | "jaw" | "pocket" | "miscue";
  a: number; // ball id
  b?: number; // the other ball, the cushion (0..5), the pocket (0..5)
  speed: number; // m/s of the impact (normal), or off the cue
};

export const shotSpeed = (power: number) => 0.25 + POOL_PHYS.speedMax * Math.max(0, Math.min(1, power)) ** 1.5;
const TIP_MAX = 0.5; // × R: the furthest from centre the tip can hit and still hold
const MISCUE = 0.62; // × R: past this it slips

// The cue hits the cue ball: its speed, its spin from where the tip hits, the
// squirt (side spin pushes it a hair off the line). Returns a miscue flag.
export function strike(b: PoolBall, shot: PoolShot): boolean {
  let sx = Math.max(-1.3, Math.min(1.3, shot.spinX)) * TIP_MAX * BALL_R;
  let sy = Math.max(-1.3, Math.min(1.3, shot.spinY)) * TIP_MAX * BALL_R;
  let v = shotSpeed(shot.power);
  const off = Math.hypot(sx, sy);
  const miscue = off > MISCUE * BALL_R;
  if (miscue) {
    // the tip slips off: a weak, wild push and hardly any of the spin
    v *= 0.35;
    sx *= 0.3;
    sy *= 0.3;
  }
  // squirt: the cue ball leaves a little away from the side it was hit on
  // (right english → a hair to the left: counter-clockwise)
  const squirt = (sx / BALL_R) * 0.045 * (0.6 + 0.4 * Math.min(1, v / 4));
  const a = shot.angle + squirt;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  b.vx = dx * v;
  b.vy = dy * v;
  // ω = r × J / I, r from the centre to the tip's contact: across (e, to the
  // right of the direction) and up (z); J along the direction
  const k = (5 * v) / (2 * BALL_R * BALL_R);
  // e × d = +z; ẑ × d = (−dy, dx)
  b.wz = k * sx;
  b.wx = k * sy * -dy;
  b.wy = k * sy * dx;
  return miscue;
}

// ── stepping ─────────────────────────────────────────────────────────────────
const DT = 0.001;
const STOP_V = 0.004;
const STOP_W = 0.4;

export const moving = (b: PoolBall) =>
  b.down < 0 && (b.vx !== 0 || b.vy !== 0 || b.wx !== 0 || b.wy !== 0 || b.wz !== 0);
export const stopped = (balls: readonly PoolBall[]) => !balls.some(moving);

// the cloth: slide → roll → stop, side spin wearing off, the ball turning
function cloth(b: PoolBall, dt: number) {
  const R = BALL_R;
  // the contact point's speed over the cloth
  const ux = b.vx - R * b.wy;
  const uy = b.vy + R * b.wx;
  const u = Math.sqrt(ux * ux + uy * uy);
  const du = 3.5 * POOL_PHYS.slide * G * dt; // how much the slide shrinks this step
  if (u > du) {
    // sliding: friction against the slide, on the speed and on the spin
    const fx = -(ux / u) * POOL_PHYS.slide * G * dt;
    const fy = -(uy / u) * POOL_PHYS.slide * G * dt;
    b.vx += fx;
    b.vy += fy;
    // torque of the friction at the contact point (0, 0, −R): Δω = (5 / 2R)(fy, −fx)
    b.wx += (2.5 / R) * fy;
    b.wy += (2.5 / R) * -fx;
  } else {
    // rolling now: keep two sevenths of the slide's speed change, then roll
    b.vx -= (2 / 7) * ux;
    b.vy -= (2 / 7) * uy;
    const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    const dv = POOL_PHYS.roll * G * dt;
    if (v <= dv || v < STOP_V) {
      b.vx = 0;
      b.vy = 0;
    } else {
      b.vx -= (b.vx / v) * dv;
      b.vy -= (b.vy / v) * dv;
    }
    b.wx = -b.vy / R;
    b.wy = b.vx / R;
  }
  const dz = POOL_PHYS.spinDecay * dt;
  if (Math.abs(b.wz) <= dz) b.wz = 0;
  else b.wz -= b.wz > 0 ? dz : -dz;
  if (b.vx === 0 && b.vy === 0 && Math.abs(b.wz) < STOP_W && Math.abs(b.wx) < STOP_W && Math.abs(b.wy) < STOP_W) {
    b.wx = 0;
    b.wy = 0;
    b.wz = 0;
  }
}

// turn the orientation by ω for dt (q ← q + ½ (ω, 0) q dt, renormalised)
function turn(b: PoolBall, dt: number) {
  const [x, y, z, w] = b.q;
  const ox = b.wx * dt * 0.5;
  const oy = b.wy * dt * 0.5;
  const oz = b.wz * dt * 0.5;
  if (ox === 0 && oy === 0 && oz === 0) return;
  const nx = x + (ox * w + oy * z - oz * y);
  const ny = y + (oy * w + oz * x - ox * z);
  const nz = z + (oz * w + ox * y - oy * x);
  const nw = w - (ox * x + oy * y + oz * z);
  const n = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
  b.q = [nx / n, ny / n, nz / n, nw / n];
}

// time until a moving ball touches another (centres 2R apart), or Infinity
function hitBall(a: PoolBall, b: PoolBall, max: number): number {
  const px = b.x - a.x;
  const py = b.y - a.y;
  const wx = b.vx - a.vx;
  const wy = b.vy - a.vy;
  const B = px * wx + py * wy; // half of b
  if (B >= 0) return Number.POSITIVE_INFINITY; // not closing
  const A = wx * wx + wy * wy;
  const C = px * px + py * py - 4 * BALL_R * BALL_R;
  if (C <= 0) return 0; // touching and closing
  const disc = B * B - A * C;
  if (disc < 0) return Number.POSITIVE_INFINITY;
  const t = (-B - Math.sqrt(disc)) / A;
  return t >= 0 && t <= max ? t : Number.POSITIVE_INFINITY;
}

// a ball against a cushion or jaw line (its face) or its end (a nose)
function hitSeg(b: PoolBall, s: Seg, max: number): { t: number; nx: number; ny: number } | null {
  const vn = b.vx * s.nx + b.vy * s.ny;
  let best: { t: number; nx: number; ny: number } | null = null;
  if (vn < 0) {
    const d = (b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny - BALL_R;
    // only from the cloth's side (a ball behind a jaw line is in the pocket mouth)
    if (d > -BALL_R * 0.5) {
      const t = d <= 0 ? 0 : d / -vn;
      if (t <= max) {
        const cx = b.x + b.vx * t - s.nx * BALL_R;
        const cy = b.y + b.vy * t - s.ny * BALL_R;
        const ex = s.bx - s.ax;
        const ey = s.by - s.ay;
        const along = ((cx - s.ax) * ex + (cy - s.ay) * ey) / (ex * ex + ey * ey);
        if (along >= 0 && along <= 1) best = { t, nx: s.nx, ny: s.ny };
      }
    }
  }
  // the ends: points of radius 0 (centres R away)
  for (const [px, py] of [
    [s.ax, s.ay],
    [s.bx, s.by],
  ]) {
    const rx = b.x - px;
    const ry = b.y - py;
    const B = rx * b.vx + ry * b.vy;
    if (B >= 0) continue;
    const A = b.vx * b.vx + b.vy * b.vy;
    const C = rx * rx + ry * ry - BALL_R * BALL_R;
    let t: number;
    if (C <= 0) t = 0;
    else {
      const disc = B * B - A * C;
      if (disc < 0) continue;
      t = (-B - Math.sqrt(disc)) / A;
    }
    if (t > max || (best && t >= best.t)) continue;
    const hx = rx + b.vx * t;
    const hy = ry + b.vy * t;
    const hl = Math.sqrt(hx * hx + hy * hy) || 1;
    best = { t, nx: hx / hl, ny: hy / hl };
  }
  return best;
}

// friction between the balls at impact: more on slow ones (throw)
const throwMu = (v: number) => 0.01 + 0.108 / (1 + 1.088 * v + 0.6 * v * v);

function collideBalls(a: PoolBall, b: PoolBall): number {
  let nx = b.x - a.x;
  let ny = b.y - a.y;
  const d = Math.sqrt(nx * nx + ny * ny) || 1;
  nx /= d;
  ny /= d;
  const rvx = a.vx - b.vx;
  const rvy = a.vy - b.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn <= 0) return 0;
  const J = ((1 + POOL_PHYS.ballE) / 2) * vn;
  a.vx -= J * nx;
  a.vy -= J * ny;
  b.vx += J * nx;
  b.vy += J * ny;
  // throw: the surfaces' sliding at the contact, across the line of centres
  const tx = -ny;
  const ty = nx;
  const s = rvx * tx + rvy * ty + BALL_R * (a.wz + b.wz);
  if (s !== 0) {
    const sgn = s > 0 ? 1 : -1;
    const Jt = Math.min(throwMu(vn) * J, Math.abs(s) / 7);
    a.vx -= Jt * sgn * tx;
    a.vy -= Jt * sgn * ty;
    b.vx += Jt * sgn * tx;
    b.vy += Jt * sgn * ty;
    a.wz -= (2.5 / BALL_R) * Jt * sgn;
    b.wz -= (2.5 / BALL_R) * Jt * sgn;
  }
  return vn;
}

const NOSE_S = 0.4;
const NOSE_C = 0.917; // √(1 − 0.4²)

function collideCushion(b: PoolBall, nx: number, ny: number, jaw: boolean): number {
  const vn = b.vx * nx + b.vy * ny; // < 0: into it
  if (vn >= 0) return 0;
  const [e0, e1, emin] = POOL_PHYS.cushionE;
  let e = Math.max(emin, e0 - e1 * -vn);
  if (jaw) e *= POOL_PHYS.jawE;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  // side spin against the cushion: the contact point slides along it. The
  // nose is above the ball's middle (sin θ ≈ 0.4 of R up), so the roll counts too.
  const tx = -ny;
  const ty = nx;
  const s = b.vx * tx + b.vy * ty + NOSE_S * BALL_R * (b.wy * tx - b.wx * ty) - NOSE_C * BALL_R * b.wz;
  if (s !== 0) {
    const sgn = s > 0 ? 1 : -1;
    const Jt = Math.min(POOL_PHYS.cushionMu * (1 + e) * -vn, Math.abs(s) / 3.5);
    b.vx -= Jt * sgn * tx;
    b.vy -= Jt * sgn * ty;
    b.wz += (2.5 / BALL_R) * Jt * sgn;
  }
  // the roll into the cushion mostly survives (the nose is above the centre)
  b.wx *= 0.85;
  b.wy *= 0.85;
  return -vn;
}

// past a pocket's drop line?
function fallsIn(b: PoolBall): number {
  for (let i = 0; i < POOL_POCKETS.length; i++) {
    const p = POOL_POCKETS[i];
    const along = (b.x - p.lx) * p.dx + (b.y - p.ly) * p.dy;
    if (along <= 0) continue;
    const across = Math.abs((b.x - p.lx) * -p.dy + (b.y - p.ly) * p.dx);
    if (across < p.mouth * 0.7) return i;
  }
  return -1;
}

// One fixed step of everything: contacts in time order, then the cloth.
function step(balls: PoolBall[], t: number, events: PoolEvent[]) {
  let left = DT;
  let guard = 0;
  while (left > 0 && guard++ < 96) {
    let first = left;
    let kind: 0 | 1 = 0;
    let A = -1;
    let B = -1;
    let N: { nx: number; ny: number; jaw: boolean; rail: number } | null = null;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.down >= 0) continue;
      const am = a.vx !== 0 || a.vy !== 0;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.down >= 0 || (!am && b.vx === 0 && b.vy === 0)) continue;
        const h = hitBall(a, b, first);
        if (h < first || (A < 0 && h === first)) {
          first = h;
          kind = 0;
          A = i;
          B = j;
        }
      }
      if (!am) continue;
      for (const s of POOL_SEGS) {
        const h = hitSeg(a, s, first);
        if (h && (h.t < first || (A < 0 && h.t === first))) {
          first = h.t;
          kind = 1;
          A = i;
          N = { nx: h.nx, ny: h.ny, jaw: s.jaw, rail: s.rail };
        }
      }
    }
    // move everyone to the contact (or the end of the step)
    if (first > 0)
      for (const b of balls) {
        if (b.down >= 0) continue;
        b.x += b.vx * first;
        b.y += b.vy * first;
      }
    left -= first;
    const now = t + (DT - left);
    if (A < 0) break;
    if (kind === 0) {
      const v = collideBalls(balls[A], balls[B]);
      if (v > 0) events.push({ t: now, k: "ball", a: balls[A].id, b: balls[B].id, speed: v });
    } else if (N) {
      const v = collideCushion(balls[A], N.nx, N.ny, N.jaw);
      if (v > 0)
        events.push(
          N.jaw
            ? { t: now, k: "jaw", a: balls[A].id, b: N.rail - 10, speed: v }
            : { t: now, k: "rail", a: balls[A].id, b: N.rail, speed: v },
        );
    }
  }
  for (const b of balls) {
    if (b.down >= 0) continue;
    const p = fallsIn(b);
    if (p >= 0) {
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      b.down = p;
      b.x = POOL_POCKETS[p].x;
      b.y = POOL_POCKETS[p].y;
      b.vx = b.vy = b.wx = b.wy = b.wz = 0;
      events.push({ t: t + DT, k: "pocket", a: b.id, b: p, speed });
      continue;
    }
    if (b.vx !== 0 || b.vy !== 0 || b.wx !== 0 || b.wy !== 0 || b.wz !== 0) {
      turn(b, DT);
      cloth(b, DT);
    }
  }
}

const MAX_T = 40; // s: a shot always ends

// A shot in real time (the clients animate with it): stepping by any dt gives
// exactly what simulate() gives, the steps are always 1 ms.
export class PoolSim {
  balls: PoolBall[];
  events: PoolEvent[] = [];
  t = 0;
  done = false;
  miscue: boolean;
  private steps = 0;
  constructor(balls: readonly PoolBall[], shot: PoolShot) {
    this.balls = cloneBalls(balls);
    const cue = this.balls.find((b) => b.id === 0 && b.down < 0);
    this.miscue = cue ? strike(cue, shot) : false;
    this.events.push({ t: 0, k: this.miscue ? "miscue" : "cue", a: 0, speed: cue ? Math.hypot(cue.vx, cue.vy) : 0 });
  }
  // advance by dt (s); false once everything is still
  step(dt: number): boolean {
    if (this.done) return false;
    const until = Math.floor((this.t + dt) / DT + 1e-9);
    this.t += dt;
    while (this.steps < until) {
      step(this.balls, this.steps * DT, this.events);
      this.steps++;
      if (stopped(this.balls) || this.steps * DT >= MAX_T) {
        this.done = true;
        if (this.steps * DT >= MAX_T) for (const b of this.balls) b.vx = b.vy = b.wx = b.wy = b.wz = 0;
        break;
      }
    }
    return !this.done;
  }
  get duration() {
    return this.steps * DT;
  }
}

export function simulate(
  balls: readonly PoolBall[],
  shot: PoolShot,
): { balls: PoolBall[]; events: PoolEvent[]; duration: number; miscue: boolean } {
  const sim = new PoolSim(balls, shot);
  while (sim.step(1)) {}
  return { balls: sim.balls, events: sim.events, duration: sim.duration, miscue: sim.miscue };
}

// ── aiming ───────────────────────────────────────────────────────────────────
export interface AimGuide {
  hit: number; // the first ball touched (id), or −1 for a cushion / nothing
  dist: number; // how far the cue ball rolls to it, m
  gx: number; // the ghost ball: where the cue ball is at contact
  gy: number;
  ox: number; // the object ball's way (unit; zero if no ball)
  oy: number;
  cx: number; // the cue ball's way off it (unit, the tangent line — for a stun hit)
  cy: number;
  cut: number; // radians off full (0 = straight on)
}

// The guideline: the cue ball sent straight along `angle` from where it is —
// what it meets first, where, and which ways both go.
export function aimGuide(balls: readonly PoolBall[], angle: number): AimGuide {
  const cue = balls.find((b) => b.id === 0 && b.down < 0);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const none: AimGuide = { hit: -1, dist: 0, gx: 0, gy: 0, ox: 0, oy: 0, cx: dx, cy: dy, cut: 0 };
  if (!cue) return none;
  const probe: PoolBall = { ...cue, vx: dx, vy: dy, wx: 0, wy: 0, wz: 0 };
  let best = Number.POSITIVE_INFINITY;
  let hit = -1;
  for (const b of balls) {
    if (b.id === 0 || b.down >= 0) continue;
    const t = hitBall(probe, { ...b, vx: 0, vy: 0 }, 10);
    if (t < best) {
      best = t;
      hit = b.id;
    }
  }
  let rn: { nx: number; ny: number } | null = null;
  for (const s of POOL_SEGS) {
    const h = hitSeg(probe, s, Math.min(best, 10));
    if (h && h.t < best) {
      best = h.t;
      hit = -1;
      rn = h;
    }
  }
  if (!Number.isFinite(best)) return none;
  const gx = cue.x + dx * best;
  const gy = cue.y + dy * best;
  if (hit < 0) {
    // off a cushion: the mirror line
    const n = rn ?? { nx: 0, ny: 0 };
    const vn = dx * n.nx + dy * n.ny;
    return { ...none, dist: best, gx, gy, cx: dx - 2 * vn * n.nx, cy: dy - 2 * vn * n.ny };
  }
  const ob = balls.find((b) => b.id === hit) as PoolBall;
  let ox = ob.x - gx;
  let oy = ob.y - gy;
  const ol = Math.hypot(ox, oy) || 1;
  ox /= ol;
  oy /= ol;
  const along = dx * ox + dy * oy;
  let cx = dx - along * ox;
  let cy = dy - along * oy;
  const cl = Math.hypot(cx, cy);
  if (cl > 1e-6) {
    cx /= cl;
    cy /= cl;
  } else {
    cx = 0;
    cy = 0;
  }
  return { hit, dist: best, gx, gy, ox, oy, cx, cy, cut: Math.acos(Math.max(-1, Math.min(1, along))) };
}

// Can the cue ball go here (ball in hand)? On the cloth, touching nothing;
// `kitchen`: behind the head string (after a scratch on the break).
export function placeOk(balls: readonly PoolBall[], x: number, y: number, kitchen = false): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.abs(x) > HL - BALL_R || Math.abs(y) > HW - BALL_R) return false;
  if (kitchen && x > HEAD_STRING) return false;
  return !balls.some((b) => b.id !== 0 && b.down < 0 && Math.hypot(b.x - x, b.y - y) < 2 * BALL_R + 1e-4);
}
