// The camera after Kingdom Hearts 3 (docs/plan/56-the-controls.md D): low and behind, turned by
// the mouse (always, in play: the pointer's locked) or the right stick or the arrows on a curve
// that ramps in, back behind your run on its own (after a
// moment's wait once you let go of it, harder the faster and the straighter ahead you go, never
// round to your face when you run at it), pulled back in a dash and up in the air, put behind you
// on a press (R / R3), and holding a locked-on target in frame. No three here: yaw, pitch and
// distance only (yaw: where it looks on the floor, atan2(y, x); pitch > 0 looks down) — the view
// places it. Tried in /dev/move first; the world's view takes it in phase 5.

export type Follow = "on" | "gentle" | "off";

export interface CamTune {
  follow: Follow;
  /** how fast it comes round behind a run, 1/s (at a run's speed, straight ahead) */
  rate: number;
  /** a share of that going across the way (a circle stays a wide circle) */
  side: number;
  /** turned by hand: rad/s at a full tilt, across and up–down; the tilt's curve (1: straight);
   *  s to come up to speed */
  across: number;
  upDown: number;
  curve: number;
  ramp: number;
  /** s after you let go before it follows again */
  hold: number;
  /** where it rests, how far it tilts, rad */
  pitch: number;
  pitchMin: number;
  pitchMax: number;
  /** tiles back; more in a dash, more up in the air */
  dist: number;
  dashPull: number;
  airPull: number;
  /** s to come round behind you on a press */
  recenter: number;
  /** the mouse: rad a pixel (× its own sensitivity: the stick's `sens` is apart) */
  mouse: number;
  mouseSens: number;
  sens: number;
  invertX: boolean;
  invertY: boolean;
}

export const CAM_TUNE: CamTune = {
  follow: "on",
  rate: 2.2,
  side: 0.45,
  across: 4.5,
  upDown: 2.2,
  curve: 1.6,
  ramp: 0.12,
  hold: 0.6,
  pitch: 0.25,
  pitchMin: -0.15,
  pitchMax: 0.75,
  dist: 4.2,
  dashPull: 1.2,
  airPull: 1.5,
  recenter: 0.2,
  mouse: 0.0024,
  mouseSens: 1,
  sens: 1,
  invertX: false,
  invertY: false,
};

export interface CamIn {
  dt: number;
  /** turned by hand: -1..1 each (the right stick past its deadzone, or the arrows) */
  look: { x: number; y: number };
  /** put it behind me (pressed this frame) */
  recenter: boolean;
  /** the body: its facing, its velocity on the floor, its feet over the ground below */
  yaw: number;
  vx: number;
  vy: number;
  air: number;
  /** the spec's run and dash speeds (the pull-back's scale) */
  run: number;
  dash: number;
  /** a locked-on target, from the body (tiles on the floor) */
  lock?: { dx: number; dy: number } | null;
  /** don't come round (aiming, skating on ice) */
  still?: boolean;
  /** held where it is: a move that goes round and round (a pole swing) — no following, no
   *  dash's pull-back (the body's speed would spin it and pump it) */
  hold?: boolean;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// (beyond this off its way it doesn't follow: running at the camera, it backs up instead)
const FOLLOW_CONE = 1.75;
// (within this it's straight ahead: the full rate)
const AHEAD = 0.44;

export class FollowCam {
  yaw = 0;
  pitch: number;
  dist: number;
  private ramped = 0;
  /** s since it was last turned by hand */
  private idle = 1e9;
  private re: { t: number; yaw0: number; pitch0: number; yaw1: number } | null = null;

  constructor(readonly tune: CamTune = { ...CAM_TUNE }) {
    this.pitch = tune.pitch;
    this.dist = tune.dist;
  }

  /** Put it behind `yaw` at once (a reset, a teleport). */
  snap(yaw: number) {
    this.yaw = yaw;
    this.pitch = this.tune.pitch;
    this.re = null;
  }

  /** The mouse moved (px, the pointer locked): turned by that much at once, no curve. Locked on, it
   *  only tilts (a sideways flick is the caller's: the next target). */
  mouse(dx: number, dy: number, locked = false) {
    const T = this.tune;
    // (some browsers send one huge jump as the lock starts)
    if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
    const k = T.mouse * T.mouseSens;
    if (!locked) this.yaw = wrap(this.yaw + dx * k * (T.invertX ? -1 : 1));
    this.pitch += dy * k * 0.8 * (T.invertY ? -1 : 1);
    this.pitch = Math.max(T.pitchMin, Math.min(T.pitchMax, this.pitch));
    this.idle = 0;
    this.re = null;
  }

  update(i: CamIn): void {
    const T = this.tune;
    const dt = i.dt;
    // turned by hand: a curve on the tilt, coming up to speed over `ramp`
    const lx = i.look.x;
    const ly = i.look.y;
    const by = Math.hypot(lx, ly) > 0.02;
    this.ramped = by ? clamp01(this.ramped + dt / Math.max(1e-3, T.ramp)) : 0;
    if (by) {
      const c = (v: number) => Math.sign(v) * Math.abs(v) ** T.curve;
      const k = this.ramped * T.sens * dt;
      if (!i.lock) this.yaw = wrap(this.yaw + c(lx) * T.across * k * (T.invertX ? -1 : 1));
      this.pitch += c(ly) * T.upDown * k * (T.invertY ? -1 : 1);
      this.idle = 0;
      this.re = null;
    } else this.idle += dt;

    if (i.recenter && !i.lock) this.re = { t: 0, yaw0: this.yaw, pitch0: this.pitch, yaw1: i.yaw };
    const speed = Math.hypot(i.vx, i.vy);
    if (this.re) {
      // behind me over `recenter`, eased
      const r = this.re;
      r.t += dt;
      const k = clamp01(r.t / Math.max(1e-3, T.recenter));
      const e = k * k * (3 - 2 * k);
      this.yaw = wrap(r.yaw0 + wrap(r.yaw1 - r.yaw0) * e);
      this.pitch = r.pitch0 + (T.pitch - r.pitch0) * e;
      if (k >= 1) this.re = null;
    } else if (i.lock) {
      // a target held: from behind me looking at it (I face it; the view frames us both)
      const want = Math.atan2(i.lock.dy, i.lock.dx);
      this.yaw = wrap(this.yaw + wrap(want - this.yaw) * Math.min(1, dt * 8));
      if (this.idle > T.hold) this.pitch += (T.pitch + 0.05 - this.pitch) * Math.min(1, dt * 3);
    } else if (T.follow !== "off" && !i.still && !i.hold && this.idle > T.hold && speed > 0.5) {
      // back behind the run, harder the faster and the straighter ahead
      const off = wrap(Math.atan2(i.vy, i.vx) - this.yaw);
      if (Math.abs(off) < FOLLOW_CONE) {
        const k =
          T.rate *
          Math.min(1.5, speed / Math.max(0.1, i.run)) *
          (Math.abs(off) < AHEAD ? 1 : T.side) *
          (T.follow === "gentle" ? 0.5 : 1);
        this.yaw = wrap(this.yaw + off * Math.min(1, k * dt));
      }
      // and down to where it rests, slower
      if (this.idle > T.hold * 2.5) this.pitch += (T.pitch - this.pitch) * Math.min(1, dt * 1.2);
    }
    this.pitch = Math.max(T.pitchMin, Math.min(T.pitchMax, this.pitch));

    // how far back: further in a dash, up in the air, and to fit a locked-on target
    const dash = i.hold ? 0 : clamp01((speed - i.run) / Math.max(0.1, i.dash - i.run));
    const lockFit = i.lock ? Math.min(4, 0.35 * Math.hypot(i.lock.dx, i.lock.dy)) : 0;
    const want = T.dist + T.dashPull * dash + T.airPull * clamp01(i.air / 2) + lockFit;
    this.dist += (want - this.dist) * Math.min(1, dt * 3);
  }
}
