// The arcade layer (docs/plan/92-the-cars.md, "The arcade layer"): what turns Jolt's car into the
// open-world middle — it turns in on the first touch, a slide is asked for (the handbrake, a lift, a
// flick) and held with one hand, it comes back without a snap, it holds the road over a crest,
// lands level, and rolls only when it's really asked to. Every number here; nothing else in the
// car's physics is ours but the tyres' grip (drive.ts).
//
// Pure: from how the car is and what the driver does, the torques and forces to add this step and
// how much grip each tyre has (multipliers on the surface's).

export const ASSIST = {
  /** (plan 93 F1a) the tyres turn it: the yaw torques below act only past the grip — turn-in once the front's
   *  at its limit, the stability once the body slides; false: plan 92's (they turned it in its grip too, the
   *  tail swung out to follow — `?feel=92`) */
  tyreLed: true,
  /** turn-in: a yaw torque toward the steering's yaw rate, × the car's yaw inertia (1/s) — with tyreLed, only
   *  while the front's pushing past its peak (`frontUsed` over `pushFrom`) */
  turnIn: 1.6,
  pushFrom: 0.9,
  /** stability, tyreLed: from this body slip (rad) on, an oversteer's extra yaw damped */
  stabFrom: 0.1,
  /** a lift's slide, tyreLed: only steering past this share of the lock, above this speed (m/s) — a flick */
  liftSteer: 0.6,
  liftV: 14,
  /** in a slide on the throttle: past this body slip (rad) the rear's held a little loose */
  slideFrom: 0.26,
  /** the yaw rate the grip allows, × this (more: tighter) */
  turnGrip: 1.15,
  /** stability: an unasked yaw past what's asked damped (1/s), the drift angle held under `driftCap` */
  damp: 3,
  driftCap: 0.62, // rad (~35°) on the keyboard
  driftCapPad: 0.8,
  capK: 9,
  /** drift entry: the rear tyres' side grip while the handbrake's on, and just after */
  handGrip: 0.3,
  /** …and the handbrake's own yaw, steering with it (× yaw inertia, 1/s²): the swing round */
  handYaw: 2.4,
  handHold: 0.35, // s after it's let go
  /** a lift (off the throttle, turning, quick): the rear's side grip */
  liftGrip: 0.86,
  liftHold: 0.4,
  /** held in a slide on the throttle: the rear's side grip (a slide you can hold) */
  driftGrip: 0.78,
  /** grip back as the slide comes in (per s) */
  back: 2.6,
  /** the speed hold: down force at speed (× weight at 33 m/s, as v²) */
  hold: 0.28,
  /** in the air: levelled (1/s²) and damped (1/s); the steering's yaw in the air (rad/s) */
  airLevel: 14, // (plan 92 feedback: at 6 and 3.2 a crest taken fast threw it nose-up past 60°)
  airDamp: 7,
  airYaw: 0.6,
  /** the roll stabiliser: past `lean` (rad) on its wheels, held back (× roll inertia, 1/s²) — a bump
   *  stop (plan 92 feedback: the bars softened for a lean you see, ~3° in a sedan's hard turn, the tall
   *  ones held here, ~4.5°, never over on the flat) */
  lean: 0.07,
  leanK: 400,
  leanDamp: 12,
  /** righting: upside down or on its side this long, at a stand (s) */
  rightAfter: 2,
};

/** (plan 93) Plan 92's arcade layer as the user drove it on 2026-11-16 — `?feel=92` on /dev/car and in the
 *  world, for an A/B against the tyre-led one. */
export function feel92(): void {
  Object.assign(ASSIST, { tyreLed: false, turnIn: 4.2, damp: 2.2, liftGrip: 0.82 });
}
const A93 = { ...ASSIST };
/** …and back to plan 93's (the tyre-led) */
export function feel93(): void {
  Object.assign(ASSIST, A93);
}

export interface AssistIn {
  dt: number;
  mass: number;
  inertia: [number, number, number];
  wheelbase: number;
  /** the car's axes in the world */
  X: [number, number, number];
  Y: [number, number, number];
  Z: [number, number, number];
  v: [number, number, number];
  w: [number, number, number];
  /** speed along, across (to the right), m/s */
  vf: number;
  vs: number;
  /** the front tyres' angle (rad, + right), the front's peak grip (μ) */
  steer: number;
  mu: number;
  thr: number;
  brk: number;
  hand: number;
  /** wheels touching the ground (of n) */
  touching: number;
  n: number;
  /** a pad (analog): a wider slide allowed */
  pad: boolean;
  /** (plan 93) the front tyres' grip used (1: at the peak), the steering asked (−1..1 of the lock) */
  frontUsed: number;
  steerK: number;
}

/** What the layer keeps between steps. */
export interface AssistState {
  handT: number; // since the handbrake was let go (s)
  liftT: number;
  rear: number; // the rear's side grip now (×)
  upset: number; // seconds upside down or on its side
  lastThr: number;
}
export const assistState = (): AssistState => ({ handT: 9, liftT: 9, rear: 1, upset: 0, lastThr: 0 });

export interface AssistOut {
  /** torque to add (world axes, N·m) and force (N) */
  t: [number, number, number];
  f: [number, number, number];
  /** grip multipliers: the front's and the rear's side grip, the rears' along */
  front: number;
  rear: number;
  /** may it be righted (R) */
  canRight: boolean;
  /** the drift angle (rad, + the tail out to the left: turning right) */
  beta: number;
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function assist(a: AssistIn, st: AssistState, out: AssistOut): AssistOut {
  const A = ASSIST;
  const g = 9.81;
  const [X, Y, Z] = [a.X, a.Y, a.Z];
  out.t[0] = out.t[1] = out.t[2] = 0;
  out.f[0] = out.f[1] = out.f[2] = 0;
  const speed = Math.hypot(a.v[0], a.v[1], a.v[2]);
  // (turning right: +, about the car's own up)
  const yaw = -(a.w[0] * Y[0] + a.w[1] * Y[1] + a.w[2] * Y[2]);
  const beta = Math.atan2(a.vs, Math.max(0.5, Math.abs(a.vf)));
  out.beta = beta;
  const addYaw = (k: number) => {
    // a torque turning it right by k (N·m): about −Y
    out.t[0] -= Y[0] * k;
    out.t[1] -= Y[1] * k;
    out.t[2] -= Y[2] * k;
  };
  const grounded = a.touching >= Math.max(2, a.n - 1);

  // ── the slide asked for: the handbrake, a lift ──
  st.handT = a.hand > 0.3 ? 0 : st.handT + a.dt;
  const lifted = A.tyreLed
    ? st.lastThr > 0.5 && a.thr < 0.15 && Math.abs(a.steerK) > A.liftSteer && a.vf > A.liftV
    : st.lastThr > 0.5 && a.thr < 0.15 && Math.abs(a.steer) > 0.08 && a.vf > 8;
  st.liftT = lifted ? 0 : st.liftT + a.dt;
  st.lastThr = a.thr;
  let want = 1;
  if (st.handT < A.handHold && a.vf > 3) want = Math.min(want, A.handGrip);
  if (st.liftT < A.liftHold) want = Math.min(want, A.liftGrip);
  // (in a slide on the throttle, steering into it: held, a little loose)
  const sliding = Math.abs(beta) > (A.tyreLed ? A.slideFrom : 0.18) && a.vf > 5;
  if (sliding && a.thr > 0.3) want = Math.min(want, A.driftGrip);
  // grip back by itself as it comes straight: at once down, gently up
  st.rear = want < st.rear ? want : Math.min(want, st.rear + A.back * a.dt * (0.4 + smooth(0.4, 0.05, Math.abs(beta))));
  out.rear = st.rear;
  out.front = sliding && !A.tyreLed ? 1.08 : 1;

  if (grounded && a.vf > 1.5) {
    const k = smooth(1.5, 6, a.vf);
    // ── turn-in: the yaw the steering asks for, as far as the grip allows ──
    const ask = (a.vf * Math.tan(a.steer)) / a.wheelbase;
    const can = (a.mu * g * A.turnGrip) / Math.max(3, a.vf);
    const ref = clamp(ask, -can, can);
    const Iy = a.inertia[1];
    // (tyreLed: only while the front's pushing wide past its peak — a nudge, the understeer still felt)
    const push = A.tyreLed ? smooth(A.pushFrom, A.pushFrom + 0.3, a.frontUsed) : 1;
    if (!sliding && push > 0 && Math.abs(ref) > 0.02 && Math.sign(yaw) !== -Math.sign(ref)) {
      // (only adding to the turn: never against a driver turning in)
      const short = ref - yaw;
      if (Math.sign(short) === Math.sign(ref)) addYaw(Iy * A.turnIn * k * short * push);
    }
    // ── stability: yaw nobody asked for, damped; a drift held under its cap ──
    const drifting = st.rear < 0.95 || (sliding && a.thr > 0.3);
    const extra = yaw - ref;
    if (A.tyreLed) {
      // (only an oversteer — more yaw than asked, the same way — and only once the body's sliding)
      const over = Math.sign(extra) === Math.sign(yaw) && Math.abs(yaw) > Math.abs(ref);
      const gate = smooth(A.stabFrom * 0.6, A.stabFrom * 1.4, Math.abs(beta));
      // (not in a slide asked for: the handbrake's swing, and a second after it, are the driver's)
      const asked = st.handT < 1 || a.hand > 0.3;
      if (over && gate > 0 && !asked) addYaw(-Iy * A.damp * k * extra * gate * (drifting ? 0.3 : 1));
    } else if (!drifting) addYaw(-Iy * A.damp * k * extra * smooth(0.05, 0.25, Math.abs(extra)));
    else if (!A.tyreLed) addYaw(-Iy * A.damp * 0.3 * k * extra * smooth(0.3, 0.8, Math.abs(extra)));
    // (the handbrake's swing: helped round, uncapped — a hairpin, a handbrake turn)
    const handing = st.handT < 0.15;
    if (a.hand > 0.3 && Math.abs(a.steer) > 0.05 && Math.abs(yaw) < 2.2)
      addYaw(Iy * A.handYaw * Math.sign(a.steer) * smooth(0, 0.3, Math.abs(a.steer)) * smooth(2, 6, a.vf));
    const cap = a.pad ? A.driftCapPad : A.driftCap;
    const past = Math.abs(beta) - cap;
    if (past > 0 && !handing) {
      // (turning further into the spin: stopped, and pulled back toward the cap)
      const into = Math.sign(beta) === Math.sign(yaw) ? 0 : 1;
      addYaw(-Math.sign(yaw || -beta) * Iy * A.capK * past * (0.5 + into) * k);
    }
    // ── the speed hold ──
    const down = (A.hold * a.mass * g * speed * speed) / (33 * 33);
    out.f[0] -= Y[0] * down;
    out.f[1] -= Y[1] * down;
    out.f[2] -= Y[2] * down;
  }

  // ── in the air: levelled for the landing, the steering a little say ──
  if (a.touching === 0 && speed > 2) {
    // (the car's up turned toward the world's: about Y × up; its tumbling damped)
    const I = (a.inertia[0] + a.inertia[2]) / 2;
    const wy = a.w[0] * Y[0] + a.w[1] * Y[1] + a.w[2] * Y[2];
    const px = a.w[0] - Y[0] * wy;
    const py = a.w[1] - Y[1] * wy;
    const pz = a.w[2] - Y[2] * wy;
    out.t[0] += I * (A.airLevel * -Y[2] - A.airDamp * px);
    out.t[1] += I * -A.airDamp * py;
    out.t[2] += I * (A.airLevel * Y[0] - A.airDamp * pz);
    const yawWant = (a.steer / 0.6) * A.airYaw;
    addYaw(a.inertia[1] * 2 * (yawWant - yaw));
  }

  // ── the roll stabiliser: on its wheels, a lean past `lean` held back ──
  if (a.touching > 0) {
    // the lean about its own x (+: the right side up); a turn about +X takes the right side down
    const lean = Math.asin(clamp(Z[1], -1, 1));
    const over = Math.abs(lean) - A.lean;
    if (over > 0) {
      const rate = a.w[0] * X[0] + a.w[1] * X[1] + a.w[2] * X[2];
      const growing = Math.sign(rate) === -Math.sign(lean);
      const k = a.inertia[0] * (A.leanK * over * Math.sign(lean) - (growing ? A.leanDamp * rate : 0));
      out.t[0] += X[0] * k;
      out.t[1] += X[1] * k;
      out.t[2] += X[2] * k;
    }
  }

  // ── on its roof or its side, still: it may be righted ──
  st.upset = Y[1] < 0.45 && speed < 2.5 ? st.upset + a.dt : 0;
  out.canRight = st.upset > A.rightAfter;
  return out;
}

export const assistOut = (): AssistOut => ({ t: [0, 0, 0], f: [0, 0, 0], front: 1, rear: 1, canRight: false, beta: 0 });
