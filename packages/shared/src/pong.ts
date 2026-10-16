// Ping-pong (table tennis) physics and rules (Fita 13), in real units — metres,
// seconds. The table's frame (shared/tables.ts): the playing surface's centre
// at 0, x along the length (side 0 plays from −x, side 1 from +x), y across,
// z UP FROM THE TABLE'S TOP (the floor is at −0.76).
//
// The ball: gravity, a strong air drag (a 2.7 g ball slows a lot), the Magnus
// force from its spin (topspin dips, backspin floats, sidespin curves), spin
// wearing off in the air. Off the table it keeps 90% of its bounce and the
// table's friction trades spin for speed (topspin kicks on, backspin checks
// up). The net: into the mesh it dies; on the tape it can dribble over. Off
// a racket: the rubber throws it back and grips it — brushing up makes topspin,
// chopping down backspin, sweeping across sidespin.
//
// Every flight is ONE EVENT (when, where, how fast, how it spins) + this
// physics in fixed 1 ms steps, so every client and the server compute the same
// flight from the same event. No Math.exp / sin / cos inside the steps.

export const PONG_L = 2.74;
export const PONG_W = 1.525;
export const NET_H = 0.1525;
export const NET_OUT = 0.1525; // the net runs past each side
export const TABLE_H = 0.76; // the top above the floor
export const PONG_R = 0.02;
export const RACKET_R = 0.08; // the blade's reach from its centre (a bit generous: it's a mouse)
const HL = PONG_L / 2;
const HW = PONG_W / 2;
const G = 9.81;

export const PONG_PHYS = {
  drag: 0.125, // ½ρC_dA/m, per metre
  magnus: 0.0042, // a = k (ω × v)
  spinTau: 2.6, // s: spin wears off
  tableE: 0.9,
  tableMu: 0.5, // enough that a plain ball grips: backspin checks, topspin runs
  floorE: 0.75,
  racketE: 0.86,
  racketMu: 0.9, // grippy rubber
  netE: 0.25,
};

export interface PongBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}
export type PongKind = "toss" | "serve" | "hit" | "dead";
export interface PongFlight {
  t0: number; // server ms
  ball: PongBall;
  by: 0 | 1; // who tossed / served / hit it
  kind: PongKind;
}
export type PongBounce = { t: number; k: "table" | "net" | "floor"; side?: 0 | 1; x: number; y: number; speed: number };

const DT = 0.001;
export const sideOf = (x: number): 0 | 1 => (x < 0 ? 0 : 1);
export const clone = (b: PongBall): PongBall => ({ ...b });

// One 1 ms step; returns what it touched (or null).
function step(b: PongBall): Omit<PongBounce, "t"> | null {
  const P = PONG_PHYS;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  // drag, Magnus (ω × v), gravity
  const ax = -P.drag * sp * b.vx + P.magnus * (b.wy * b.vz - b.wz * b.vy);
  const ay = -P.drag * sp * b.vy + P.magnus * (b.wz * b.vx - b.wx * b.vz);
  const az = -P.drag * sp * b.vz + P.magnus * (b.wx * b.vy - b.wy * b.vx) - G;
  b.vx += ax * DT;
  b.vy += ay * DT;
  b.vz += az * DT;
  const k = 1 - DT / P.spinTau;
  b.wx *= k;
  b.wy *= k;
  b.wz *= k;
  const px = b.x;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;

  // the net: the plane x = 0, up to the tape, across past the sides
  if (px < 0 !== b.x < 0 || Math.abs(b.x) < PONG_R) {
    if (Math.abs(b.y) <= HW + NET_OUT && b.z < NET_H + PONG_R && b.z > -0.02) {
      if (b.z < NET_H - 0.004) {
        // into the mesh: it stops dead and drops on the hitter's side
        const back = b.vx > 0 ? -1 : 1;
        b.x = back * (PONG_R + 0.001);
        b.vx = -b.vx * 0.12;
        b.vy *= 0.4;
        b.vz *= 0.4;
        b.wx *= 0.3;
        b.wy *= 0.3;
        b.wz *= 0.3;
        return { k: "net", x: b.x, y: b.y, speed: Math.abs(b.vx) };
      }
      // on the tape: a little round top it bounces off
      let nx = b.x;
      let nz = b.z - NET_H;
      const nl = Math.sqrt(nx * nx + nz * nz);
      if (nl < PONG_R + 0.003) {
        if (nl < 1e-6) {
          nx = 0;
          nz = 1;
        } else {
          nx /= nl;
          nz /= nl;
        }
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          b.vx -= (1 + P.netE) * vn * nx;
          b.vz -= (1 + P.netE) * vn * nz;
          b.vx *= 0.82;
          b.vy *= 0.9;
          b.x = nx * (PONG_R + 0.003);
          b.z = NET_H + nz * (PONG_R + 0.003);
          return { k: "net", x: b.x, y: b.y, speed: -vn };
        }
      }
    }
  }

  // the table top
  if (b.z < PONG_R && b.vz < 0 && Math.abs(b.x) <= HL && Math.abs(b.y) <= HW && b.z > -0.03) {
    const vz = -b.vz;
    const e = Math.max(0.78, P.tableE - 0.006 * vz);
    b.z = PONG_R;
    b.vz = e * vz;
    // the contact point's slide: v + ω × (0, 0, −r)
    const ux = b.vx - PONG_R * b.wy;
    const uy = b.vy + PONG_R * b.wx;
    const u = Math.sqrt(ux * ux + uy * uy);
    if (u > 1e-9) {
      const J = Math.min(P.tableMu * (1 + e) * vz, u / 2.5);
      const dx = ux / u;
      const dy = uy / u;
      b.vx -= J * dx;
      b.vy -= J * dy;
      // a hollow ball: Δω = (3J / 2r)(ẑ × û)·…
      b.wx += ((1.5 * J) / PONG_R) * -dy;
      b.wy += ((1.5 * J) / PONG_R) * dx;
    }
    return { k: "table", side: sideOf(b.x), x: b.x, y: b.y, speed: vz };
  }
  // the floor
  if (b.z < -TABLE_H + PONG_R && b.vz < 0) {
    const vz = -b.vz;
    b.z = -TABLE_H + PONG_R;
    b.vz = vz * PONG_PHYS.floorE;
    b.vx *= 0.8;
    b.vy *= 0.8;
    return { k: "floor", x: b.x, y: b.y, speed: vz };
  }
  return null;
}

// ── a flight, worked out once ────────────────────────────────────────────────
const MAX_MS = 4000;
interface Track {
  states: Float64Array; // per ms: x y z vx vy vz wx wy wz
  events: PongBounce[];
  ms: number;
}
const N = 9;
const tracks = new Map<string, Track>();
const keyOf = (f: PongFlight) =>
  `${f.t0}|${f.by}|${f.kind}|${[f.ball.x, f.ball.y, f.ball.z, f.ball.vx, f.ball.vy, f.ball.vz, f.ball.wx, f.ball.wy, f.ball.wz].join(",")}`;

function track(f: PongFlight): Track {
  const key = keyOf(f);
  const have = tracks.get(key);
  if (have) return have;
  const states = new Float64Array((MAX_MS + 1) * N);
  const events: PongBounce[] = [];
  const b = clone(f.ball);
  const put = (i: number) => {
    const o = i * N;
    states[o] = b.x;
    states[o + 1] = b.y;
    states[o + 2] = b.z;
    states[o + 3] = b.vx;
    states[o + 4] = b.vy;
    states[o + 5] = b.vz;
    states[o + 6] = b.wx;
    states[o + 7] = b.wy;
    states[o + 8] = b.wz;
  };
  put(0);
  let ms = MAX_MS;
  let floors = 0;
  for (let i = 1; i <= MAX_MS; i++) {
    const e = step(b);
    put(i);
    if (e) {
      events.push({ ...e, t: f.t0 + i });
      if (e.k === "floor" && ++floors >= 3) {
        ms = i;
        break;
      }
    }
    if (Math.abs(b.x) > 8 || Math.abs(b.y) > 8) {
      ms = i;
      break;
    }
  }
  const t: Track = { states, events, ms };
  tracks.set(key, t);
  if (tracks.size > 48) tracks.delete(tracks.keys().next().value as string);
  return t;
}

const read = (t: Track, i: number): PongBall => {
  const o = Math.max(0, Math.min(t.ms, i)) * N;
  const s = t.states;
  return {
    x: s[o],
    y: s[o + 1],
    z: s[o + 2],
    vx: s[o + 3],
    vy: s[o + 4],
    vz: s[o + 5],
    wx: s[o + 6],
    wy: s[o + 7],
    wz: s[o + 8],
  };
};

// Where the ball is at server time `t` (ms), and what it has touched by then.
export function ballAt(f: PongFlight, t: number): { ball: PongBall; events: PongBounce[]; over: boolean } {
  const tr = track(f);
  const i = Math.floor(t - f.t0);
  return { ball: read(tr, i), events: tr.events.filter((e) => e.t <= t), over: i >= tr.ms };
}
// All the touches of a flight (for the referee and the CPU)
export const flightEvents = (f: PongFlight): PongBounce[] => track(f).events;
export const flightEnd = (f: PongFlight): number => f.t0 + track(f).ms;

// ── rackets ──────────────────────────────────────────────────────────────────
export interface Racket {
  x: number;
  y: number;
  z: number;
  nx: number; // the face's normal (either side plays)
  ny: number;
  nz: number;
  vx: number;
  vy: number;
  vz: number;
}
export type RacketAt = Racket & { t: number };

// When the ball meets a racket moving from r0 to r1 (server ms), or null.
export function contactAt(f: PongFlight, r0: RacketAt, r1: RacketAt): number | null {
  const tr = track(f);
  const a = Math.max(f.t0, Math.min(r0.t, r1.t));
  const b = Math.min(f.t0 + tr.ms, Math.max(r0.t, r1.t));
  for (let t = Math.ceil(a); t <= b; t++) {
    const k = r1.t === r0.t ? 1 : (t - r0.t) / (r1.t - r0.t);
    const rx = r0.x + (r1.x - r0.x) * k;
    const ry = r0.y + (r1.y - r0.y) * k;
    const rz = r0.z + (r1.z - r0.z) * k;
    let nx = r0.nx + (r1.nx - r0.nx) * k;
    let ny = r0.ny + (r1.ny - r0.ny) * k;
    let nz = r0.nz + (r1.nz - r0.nz) * k;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const p = read(tr, t - f.t0);
    const dx = p.x - rx;
    const dy = p.y - ry;
    const dz = p.z - rz;
    const along = dx * nx + dy * ny + dz * nz;
    const across = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
    if (Math.abs(along) < PONG_R + 0.025 && across < RACKET_R) return t;
  }
  return null;
}

// ── shooting at a spot: the solver (the assist, the serve, Vortex) ───────────
// Where a ball launched like this first lands (table or floor), whether it
// cleared the net.
function land(b0: PongBall): { x: number; y: number; table: boolean; net: boolean; t: number } {
  const b = clone(b0);
  for (let i = 1; i < 3000; i++) {
    const e = step(b);
    if (e?.k === "net") return { x: b.x, y: b.y, table: false, net: true, t: i };
    if (e?.k === "table") return { x: e.x, y: e.y, table: true, net: false, t: i };
    if (e?.k === "floor") return { x: e.x, y: e.y, table: false, net: false, t: i };
  }
  return { x: b.x, y: b.y, table: false, net: false, t: 3000 };
}

export interface ShotOpts {
  speed?: number; // m/s off the racket
  top?: number; // rad/s of topspin (− backspin), about the axis across the flight
  side?: number; // rad/s about z (sidespin)
}

// A launch from `from` that lands on (tx, ty) on the table (clearing the net if
// it has to cross it), with this speed and spin — solved through the physics.
export function solveShot(
  from: { x: number; y: number; z: number },
  tx: number,
  ty: number,
  o: ShotOpts = {},
): PongBall {
  let speed = Math.max(2, Math.min(28, o.speed ?? 8));
  const top = o.top ?? 0;
  const sideSpin = o.side ?? 0;
  const crosses = sideOf(from.x) !== sideOf(tx);
  let yaw = Math.atan2(ty - from.y, tx - from.x);
  const launch = (pitch: number): PongBall => {
    const c = Math.cos(pitch);
    const dx = Math.cos(yaw);
    const dy = Math.sin(yaw);
    // topspin turns about the axis across the flight, (−dy, dx) — the way a
    // rolling ball turns — so ω × v points down
    return {
      ...from,
      vx: speed * c * dx,
      vy: speed * c * dy,
      vz: speed * Math.sin(pitch),
      wx: -dy * top,
      wy: dx * top,
      wz: sideSpin,
    };
  };
  let best = launch(0.2);
  const dist = () => Math.hypot(tx - from.x, ty - from.y);
  // how far it carries along the aim at a pitch, and whether that's a clean landing
  const reach = (p: number) => {
    const l = land(launch(p));
    const along = (l.x - from.x) * Math.cos(yaw) + (l.y - from.y) * Math.sin(yaw);
    // a landing counts if it got over the net to the spot's side (or past the end)
    return { along, ok: !l.net && (!crosses || sideOf(l.x) === sideOf(tx)), l };
  };
  for (let attempt = 0; attempt < 10; attempt++) {
    let found = false;
    let tooFar = true;
    for (let iter = 0; iter < 4; iter++) {
      const d = dist();
      // the lowest pitch that clears and carries to the spot (bracketed, then halved)
      let lo = 0;
      let hi = 0;
      found = false;
      let prev = reach(-0.6);
      if (prev.ok && prev.along < d) tooFar = false;
      for (let p = -0.55; p <= 1.25; p += 0.05) {
        const r = reach(p);
        if (r.ok && r.along < d) tooFar = false;
        if (prev.ok && r.ok && (prev.along - d) * (r.along - d) <= 0) {
          lo = p - 0.05;
          hi = p;
          found = true;
          break;
        }
        prev = r;
      }
      if (!found) break;
      const rising = reach(hi).along > reach(lo).along;
      for (let k = 0; k < 16; k++) {
        const mid = (lo + hi) / 2;
        if (reach(mid).along < d === rising) lo = mid;
        else hi = mid;
      }
      best = launch((lo + hi) / 2);
      // sideways: Magnus and sidespin curve it; aim off by what it missed
      const l = land(best);
      const lat = (l.x - tx) * -Math.sin(yaw) + (l.y - ty) * Math.cos(yaw);
      if (Math.abs(lat) < 0.003 && l.table) return best;
      yaw -= lat / Math.max(0.3, d);
    }
    if (found) {
      const l = land(best);
      if (l.table && Math.hypot(l.x - tx, l.y - ty) < 0.015) return best;
    }
    // it can't get there like this: slower if everything went long, else harder
    speed = Math.max(1.5, Math.min(30, speed * (tooFar ? 0.85 : 1.15)));
  }
  return best;
}

// ── off the racket ───────────────────────────────────────────────────────────
// The rubber's bounce and grip on the ball's relative motion, then (assist > 0)
// a gentle steer towards a good landing on the other side: the assist only
// bends a real hit, it never makes one.
export function hitBall(
  ball: PongBall,
  r: Racket,
  o: { side: 0 | 1; assist: number; aim?: { x: number; y: number }; serve?: boolean },
): PongBall {
  const P = PONG_PHYS;
  let nx = r.nx;
  let ny = r.ny;
  let nz = r.nz;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  // the face that meets the ball looks towards the other side
  const toward = o.side === 0 ? 1 : -1;
  if (nx * toward < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const wx = ball.vx - r.vx;
  const wy = ball.vy - r.vy;
  const wz = ball.vz - r.vz;
  let wn = wx * nx + wy * ny + wz * nz;
  if (wn > 0) wn = 0;
  const e = Math.max(0.7, P.racketE - 0.004 * -wn);
  let ox = wx - (1 + e) * wn * nx;
  let oy = wy - (1 + e) * wn * ny;
  let oz = wz - (1 + e) * wn * nz;
  // grip: the contact point (−r n) slides across the rubber; friction takes it
  const tx = wx - wn * nx;
  const ty = wy - wn * ny;
  const tz = wz - wn * nz;
  // ω × (−r n)
  const cx = -PONG_R * (ball.wy * nz - ball.wz * ny);
  const cy = -PONG_R * (ball.wz * nx - ball.wx * nz);
  const cz = -PONG_R * (ball.wx * ny - ball.wy * nx);
  const ux = tx + cx;
  const uy = ty + cy;
  const uz = tz + cz;
  const u = Math.sqrt(ux * ux + uy * uy + uz * uz);
  let swx = ball.wx;
  let swy = ball.wy;
  let swz = ball.wz;
  if (u > 1e-9) {
    const J = Math.min(P.racketMu * (1 + e) * -wn, u / 2.5);
    const dx = ux / u;
    const dy = uy / u;
    const dz = uz / u;
    ox -= J * dx;
    oy -= J * dy;
    oz -= J * dz;
    // Δω = (3J / 2r)(n × û)
    const k = (1.5 * J) / PONG_R;
    swx += k * (ny * dz - nz * dy);
    swy += k * (nz * dx - nx * dz);
    swz += k * (nx * dy - ny * dx);
  }
  const raw: PongBall = {
    x: ball.x,
    y: ball.y,
    z: ball.z,
    vx: ox + r.vx,
    vy: oy + r.vy,
    vz: oz + r.vz,
    wx: swx,
    wy: swy,
    wz: swz,
  };
  const a = Math.max(0, Math.min(1, o.assist));
  if (a <= 0) return raw;
  // only a hit that goes the right way gets help
  if (raw.vx * toward <= 0.5) return raw;
  const l = land(raw);
  const far = o.side === 0 ? 1 : -1;
  // where it should land: where the swing sent it, kept on the other half (a
  // serve: first on your own half, from where it carries over)
  const want = o.aim ?? { x: l.x, y: l.y };
  const tx2 = o.serve
    ? -far * HL * 0.5
    : far * Math.max(0.25, Math.min(HL - 0.12, Math.abs(want.x) * (want.x * far > 0 ? 1 : 0) || HL * 0.65));
  const ty2 = Math.max(-HW + 0.1, Math.min(HW - 0.1, o.serve ? want.y * 0.5 : want.y));
  const good = o.serve ? sideOf(l.x) === o.side : sideOf(l.x) !== o.side;
  if (l.table && good && Math.abs(l.x - tx2) < 0.02 && Math.abs(l.y - ty2) < 0.02) return raw;
  const sp = Math.sqrt(raw.vx * raw.vx + raw.vy * raw.vy + raw.vz * raw.vz);
  // its spin about the axis across the flight (topspin +) carries over
  const dx = raw.vx / (Math.hypot(raw.vx, raw.vy) || 1);
  const dy = raw.vy / (Math.hypot(raw.vx, raw.vy) || 1);
  const top = raw.wx * -dy + raw.wy * dx;
  const solved = o.serve
    ? solveServe(ball, o.side, want.y, { speed: Math.min(sp, 8), top, side: raw.wz })
    : solveShot(ball, tx2, ty2, { speed: Math.min(sp, 24), top, side: raw.wz });
  const mix = (p: number, q: number) => p + (q - p) * a;
  return {
    ...raw,
    vx: mix(raw.vx, solved.vx),
    vy: mix(raw.vy, solved.vy),
    vz: mix(raw.vz, solved.vz),
    wx: mix(raw.wx, solved.wx),
    wy: mix(raw.wy, solved.wy),
    wz: mix(raw.wz, solved.wz),
  };
}

// ── the serve ────────────────────────────────────────────────────────────────
// The toss: from behind your end, at about the table's height, straight up.
export function serveToss(side: 0 | 1, y = 0): PongBall {
  const x = side === 0 ? -HL - 0.12 : HL + 0.12;
  // up ~30 cm and back down past the table's edge in about 0.8 s
  return { x, y: Math.max(-HW + 0.1, Math.min(HW - 0.1, y)), z: 0.12, vx: 0, vy: 0, vz: 2.5, wx: 0, wy: 0, wz: 0 };
}
// A serve that bounces on your side first, then theirs (the assist and Vortex):
// the first bounce near your end line, at the speed (around `speed`) whose
// second bounce lands best on their half, near `ty` across.
export function solveServe(
  from: { x: number; y: number; z: number },
  side: 0 | 1,
  ty: number,
  o: ShotOpts = {},
): PongBall {
  const own = side === 0 ? -1 : 1;
  const want = o.speed ?? 6;
  let best: { b: PongBall; score: number } | null = null;
  for (const x1 of [HL * 0.78, HL * 0.62, HL * 0.48])
    for (let sp = 3.5; sp <= 10; sp += 0.75) {
      const b = solveShot(from, own * x1, ty * 0.45, { speed: sp, top: o.top ?? 0, side: o.side ?? 0 });
      const ev = flightEvents({ t0: 0, ball: b, by: side, kind: "serve" });
      const t1 = ev.findIndex((e) => e.k === "table");
      if (t1 < 0 || ev[t1].side !== side) continue;
      const second = ev.slice(t1 + 1).find((e) => e.k !== "net");
      if (second?.k !== "table" || second.side === side) continue;
      const deep = Math.abs(second.x) / HL; // 0 at the net, 1 at the end
      const score = Math.abs(deep - 0.62) * 2 + Math.abs(second.y - ty) + Math.abs(sp - want) * 0.08;
      if (!best || score < best.score) best = { b, score };
    }
  return best?.b ?? solveShot(from, own * HL * 0.5, ty * 0.5, { speed: want, top: o.top ?? 0 });
}

// ── what the server takes ────────────────────────────────────────────────────
// A hit someone reports: the ball was there then, their racket near it, the new
// ball sane (no teleports, no rockets).
export function plausibleHit(f: PongFlight, t: number, nb: PongBall, rackets: RacketAt[]): boolean {
  const nums = [nb.x, nb.y, nb.z, nb.vx, nb.vy, nb.vz, nb.wx, nb.wy, nb.wz, t];
  if (!nums.every(Number.isFinite)) return false;
  if (t < f.t0 || t > flightEnd(f) + 60) return false;
  const at = ballAt(f, t).ball;
  if (Math.hypot(at.x - nb.x, at.y - nb.y, at.z - nb.z) > 0.06) return false;
  if (Math.hypot(nb.vx, nb.vy, nb.vz) > 40) return false;
  if (Math.hypot(nb.wx, nb.wy, nb.wz) > 1200) return false;
  // a racket near it around then (reports come 30 a second: a little slack)
  const near = rackets.some(
    (r) => Math.abs(r.t - t) < 140 && Math.hypot(r.x - at.x, r.y - at.y, r.z - at.z) < RACKET_R + 0.35,
  );
  return near;
}

// ── the rules ────────────────────────────────────────────────────────────────
// A rally, event by event: who must do what next.
export interface Rally {
  server: 0 | 1;
  phase: "toss" | "serve" | "rally" | "over";
  hitter: 0 | 1; // who touched it last
  bounced: number; // table bounces since the last touch, on the side it must reach
  ownBounce: boolean; // the serve's first bounce (on the server's side) happened
  netServe: boolean; // the serve touched the net
}
export type PointWhy = "net" | "out" | "double" | "volley" | "miss" | "serve" | "own";
export type RallyEvent =
  | { k: "toss" }
  | { k: "hit"; by: 0 | 1 }
  | { k: "table"; side: 0 | 1 }
  | { k: "net" }
  | { k: "floor" }
  | { k: "dead" };

export const newRally = (server: 0 | 1): Rally => ({
  server,
  phase: "toss",
  hitter: server,
  bounced: 0,
  ownBounce: false,
  netServe: false,
});

export function rallyStep(
  r: Rally,
  e: RallyEvent,
): { rally: Rally; point?: { winner: 0 | 1; why: PointWhy }; let?: boolean } {
  const n: Rally = { ...r };
  const opp = (s: 0 | 1) => (1 - s) as 0 | 1;
  const lose = (loser: 0 | 1, why: PointWhy) => ({
    rally: { ...n, phase: "over" as const },
    point: { winner: opp(loser), why },
  });
  if (r.phase === "over") return { rally: n };
  if (e.k === "toss") {
    n.phase = "toss";
    return { rally: n };
  }
  if (e.k === "hit") {
    if (r.phase === "toss") {
      if (e.by !== r.server) return { rally: n };
      n.phase = "serve";
      n.hitter = e.by;
      n.bounced = 0;
      n.ownBounce = false;
      n.netServe = false;
      return { rally: n };
    }
    // hitting it again before it crossed / before it bounced on your side
    if (e.by === r.hitter) return lose(e.by, "double");
    if (r.phase === "serve" && !r.ownBounce) return lose(r.hitter, "serve");
    if (r.bounced === 0) return lose(e.by, "volley");
    n.phase = "rally";
    n.hitter = e.by;
    n.bounced = 0;
    return { rally: n };
  }
  if (e.k === "net") {
    if (r.phase === "serve") n.netServe = true;
    return { rally: n };
  }
  if (e.k === "table") {
    if (r.phase === "toss") return lose(r.server, "serve");
    if (r.phase === "serve" && !r.ownBounce) {
      if (e.side !== r.hitter) return lose(r.hitter, "serve");
      n.ownBounce = true;
      return { rally: n };
    }
    if (e.side === r.hitter) {
      // back on your own side
      return lose(r.hitter, r.phase === "serve" ? "serve" : "own");
    }
    // on the other side
    if (r.phase === "serve" && r.netServe && n.bounced === 0) return { rally: { ...n, phase: "over" }, let: true };
    n.bounced++;
    if (n.bounced >= 2) return lose(opp(r.hitter), "double");
    return { rally: n };
  }
  // the floor, or it died (never came back to life)
  if (e.k === "floor" || e.k === "dead") {
    if (r.phase === "toss") return lose(r.server, "miss");
    if (r.bounced >= 1) return lose(opp(r.hitter), "miss");
    return lose(r.hitter, r.phase === "serve" ? "serve" : "out");
  }
  return { rally: n };
}

// The score: points, games, who serves.
export interface PongScore {
  to: 11 | 21;
  bestOf: 1 | 3 | 5;
  points: [number, number];
  games: [number, number];
  first: 0 | 1; // who served first this game
  server: 0 | 1;
  winner: -1 | 0 | 1;
}
export function newMatch(to: 11 | 21, bestOf: 1 | 3 | 5, first: 0 | 1): PongScore {
  return { to, bestOf, points: [0, 0], games: [0, 0], first, server: first, winner: -1 };
}
// who serves at this score (every 2 points — 5 to 21 — and every point at deuce)
export function serverAt(s: Pick<PongScore, "to" | "points" | "first">): 0 | 1 {
  const [a, b] = s.points;
  const n = a + b;
  const per = s.to === 21 ? 5 : 2;
  const deuce = a >= s.to - 1 && b >= s.to - 1;
  const turns = deuce ? Math.floor(((s.to - 1) * 2) / per) + (n - (s.to - 1) * 2) : Math.floor(n / per);
  return ((s.first + turns) % 2) as 0 | 1;
}
export function scorePoint(s: PongScore, winner: 0 | 1): { score: PongScore; game: boolean; match: boolean } {
  const points: [number, number] = [...s.points];
  points[winner]++;
  const [a, b] = points;
  const game = (a >= s.to || b >= s.to) && Math.abs(a - b) >= 2;
  if (!game) {
    const next = { ...s, points };
    return { score: { ...next, server: serverAt(next) }, game: false, match: false };
  }
  const games: [number, number] = [...s.games];
  games[winner]++;
  const match = games[winner] > s.bestOf / 2;
  const first = (1 - s.first) as 0 | 1;
  const score: PongScore = {
    ...s,
    points: match ? points : [0, 0],
    games,
    first,
    server: first,
    winner: match ? winner : -1,
  };
  return { score, game, match };
}

// ── Vortex at the far end ────────────────────────────────────────────────────
export const PONG_LEVELS = ["easy", "medium", "hard", "turbo"] as const;
export type PongLevel = (typeof PONG_LEVELS)[number];
export const isPongLevel = (l: unknown): l is PongLevel =>
  typeof l === "string" && (PONG_LEVELS as readonly string[]).includes(l);
const CPU: Record<
  PongLevel,
  { whiff: number; aim: number; speed: [number, number]; top: [number, number]; wide: number; reach: number }
> = {
  easy: { whiff: 0.16, aim: 0.22, speed: [6, 8], top: [0, 40], wide: 0.25, reach: 7 },
  medium: { whiff: 0.08, aim: 0.14, speed: [7.5, 10], top: [20, 90], wide: 0.45, reach: 11 },
  hard: { whiff: 0.035, aim: 0.08, speed: [9, 14], top: [40, 160], wide: 0.7, reach: 16 },
  turbo: { whiff: 0.01, aim: 0.045, speed: [11, 18], top: [60, 220], wide: 0.85, reach: 24 },
};

export interface CpuHit {
  t: number; // server ms of the contact
  at: { x: number; y: number; z: number }; // where (the racket's centre)
  ball: PongBall; // the ball as it leaves
  whiff: boolean; // he swings and misses (no hit)
}

// Vortex plays the ball coming to him (`side`): when it has bounced on his side
// and comes up to a good height, he hits it back at a spot by his level.
export function cpuPlan(f: PongFlight, side: 0 | 1, level: PongLevel, rnd: () => number): CpuHit | null {
  const tr = track(f);
  const c = CPU[level];
  const bounce = tr.events.find((e) => e.k === "table" && e.side === side);
  if (!bounce) return null;
  // after the bounce: the first moment it's at a good height, or as it leaves the end
  const from = bounce.t - f.t0 + 30;
  let pick = -1;
  let best = -1;
  for (let i = from; i <= tr.ms; i++) {
    const b = read(tr, i);
    if (b.z < 0.02) break;
    const past = side === 0 ? b.x < -HL - 0.55 : b.x > HL + 0.55;
    if (past) break;
    // the top of the bounce, behind the end line or over the table
    const score = b.z - Math.abs(b.vz) * 0.04;
    if (score > best) {
      best = score;
      pick = i;
    }
  }
  if (pick < 0) return null;
  const ball = read(tr, pick);
  const incoming = Math.hypot(ball.vx, ball.vy, ball.vz);
  const whiff = rnd() < c.whiff + Math.max(0, (incoming - c.reach) / 20);
  const far = side === 0 ? 1 : -1;
  const g = (s: number) => {
    let u = 0;
    for (let k = 0; k < 6; k++) u += rnd();
    return (u - 3) * s;
  };
  const tx = far * (HL * (0.45 + 0.4 * rnd()) + g(c.aim));
  const ty = (rnd() * 2 - 1) * HW * c.wide + g(c.aim);
  const speed = c.speed[0] + (c.speed[1] - c.speed[0]) * rnd();
  // a high ball gets put away; a low one gets topspin over
  const top = c.top[0] + (c.top[1] - c.top[0]) * rnd() * (ball.z > 0.3 ? 1 : 0.6);
  const out = solveShot(ball, tx, ty, { speed: ball.z > 0.35 ? speed * 1.25 : speed, top });
  return { t: f.t0 + pick, at: { x: ball.x, y: ball.y, z: ball.z }, ball: out, whiff };
}
export function cpuServe(
  side: 0 | 1,
  level: PongLevel,
  rnd: () => number,
): { toss: PongBall; hitAfter: number; ball: PongBall } {
  const toss = serveToss(side, (rnd() * 2 - 1) * 0.3);
  // hit it on the way down, about 0.35 s after the toss
  const b = clone(toss);
  for (let i = 0; i < 440; i++) step(b);
  const c = CPU[level];
  const ball = solveServe(b, side, (rnd() * 2 - 1) * HW * c.wide, {
    speed: 5.5 + rnd() * 2,
    top: (rnd() - 0.5) * c.top[1],
  });
  return { toss, hitAfter: 440, ball };
}
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
