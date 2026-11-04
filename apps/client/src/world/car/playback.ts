import { Quaternion, Vector3 } from "three";

// Someone else's car, played back (2026-11-04: riding with a driver whose laptop ran at 9 fps, the
// passenger was pulled back over and over). Its states are put on the driver's own sim clock
// (shared car/net.ts CarWire.st), not on when they happen to arrive here: a driver's frame of half a
// second only moves their car a quarter of one (cars.ts' 0.25 s cap), and their states come in
// bursts, so a car drawn by arrival ran on along its velocity and was then put back where it
// really was. Played on the driver's clock, a buffer as deep as their states' lateness has lately
// been (110 ms for a smooth one, up to half a second), at a pace eased (never stepped) to it, the
// car moves as it did for them — in slow motion when theirs was. What's still got wrong (a state
// later than the buffer allowed) is eased out over ~150 ms, never back along the way it's going.

export interface PlaybackSample {
  st: number; // ms on the sender's clock
  p: Vector3;
  q: Quaternion;
  v: Vector3;
}

export interface PlaybackPose {
  p: Vector3;
  q: Quaternion;
  v: Vector3;
}

const KEEP = 16; // samples
const MIN_DELAY = 110; // ms behind: a smooth sender's (as people are drawn)
const MAX_DELAY = 600; // ms: deeper, the car's too far behind its people's voices
const BASE_WINDOW = 1500; // ms: the fastest a state's come lately (the clock's offset)
const JITTER_WINDOW = 3000; // ms: how late they've come lately
const JITTER_MARGIN = 40; // ms over the lateness seen
const PCT = 0.95;
const EASE_MS = 500; // the playback clock eased to where it should be over about this long
const RATE_MIN = 0.75;
const RATE_MAX = 1.25;
const RESYNC_MS = 1500; // further off than this (a tab back from the background): there at once
const EXTRAP_MS = 500; // past the newest state: on along its velocity at most this long, then held
const ERR_TAU = 150; // ms: a correction eased out
const ERR_SNAP = 30; // m: a bigger one isn't eased, it's a jump (the server's own say so: `jump`)
const CATCH_UP = 1; // a correction eased out at most this much faster than the car goes (+2 m/s)
const ERR_SNAP_ANGLE = 1; // rad
const MOVING = 0.5; // m/s: going, so never drawn going back

const v3 = new Vector3();
const dir = new Vector3();
const qa = new Quaternion();

export class CarPlayback<S extends PlaybackSample> {
  readonly buf: S[] = [];
  /** the playback clock: ms on the sender's clock */
  rt = 0;
  /** how far behind the sender it plays (ms), as it is now */
  delay = MIN_DELAY;
  rate = 1;
  // each state's offset (when it came less its clock) and what the one before it had to cover (when
  // this one came less the clock the one before had reached): how deep the buffer had to be
  private offs: { at: number; off: number; need: number }[] = [];
  private jump = -1;
  private legacy = false;
  private started = false;
  // what's drawn: the curve's pose plus a correction easing out
  private raw: PlaybackPose = { p: new Vector3(), q: new Quaternion(), v: new Vector3() };
  private errP = new Vector3();
  private errQ = new Quaternion();
  readonly shown: PlaybackPose = { p: new Vector3(), q: new Quaternion(), v: new Vector3() };

  /** A new state, come in at `arrival` (ms, this client's clock). `jump`: the server's count of the
   *  times it put the car somewhere (a new driver, pulled out): a change starts the playback again. */
  push(s: S, arrival: number, jump = 0) {
    // (a sender from before the clock: its states on when they come, as before)
    if (!(s.st > 0)) {
      s.st = arrival;
      if (!this.legacy) this.reset();
      this.legacy = true;
    } else if (this.legacy) {
      this.legacy = false;
      this.reset();
    }
    const newest = this.buf[this.buf.length - 1];
    if (jump !== this.jump || (newest && s.st < newest.st)) {
      this.jump = jump;
      this.reset();
    } else if (newest && s.st === newest.st) return; // (one we have)
    // where it's drawn now, before this state changes the curve
    const before = this.started && this.buf.length ? this.rawAt(this.rt) : null;
    const bp = before ? before.p.clone() : null;
    const bq = before ? before.q.clone() : null;
    this.buf.push(s);
    if (this.buf.length > KEEP) this.buf.shift();
    const had = this.buf.length > 1 ? this.buf[this.buf.length - 2].st : s.st;
    this.offs.push({ at: arrival, off: arrival - s.st, need: arrival - had });
    while (this.offs.length && this.offs[0].at < arrival - JITTER_WINDOW) this.offs.shift();
    if (!this.started) {
      this.started = true;
      this.rt = s.st;
      this.delay = MIN_DELAY;
      this.rt = this.target(arrival);
      this.rawAt(this.rt);
      this.errP.set(0, 0, 0);
      this.errQ.identity();
      this.copyShown();
      return;
    }
    // the curve changed under the drawn pose: the difference carried as a correction, eased out
    if (bp && bq) {
      const r = this.rawAt(this.rt);
      this.errP.add(bp.sub(r.p));
      // (shown = errQ · raw: so errQ' = errQ · old raw · new raw⁻¹)
      qa.copy(r.q).invert();
      this.errQ.multiply(bq.multiply(qa)).normalize();
      if (this.errP.length() > ERR_SNAP || angleOf(this.errQ) > ERR_SNAP_ANGLE) {
        this.errP.set(0, 0, 0);
        this.errQ.identity();
      }
    }
  }

  /** Where it's drawn at `now` (ms, this client's clock), `dt` (s) after the last frame; the newest
   *  state up to the playback clock (its lamps, its wheels' steer). */
  pose(now: number, dt: number): { pose: PlaybackPose; at: S | undefined } {
    if (!this.buf.length) return { pose: this.shown, at: undefined };
    const goal = this.target(now);
    const off = goal - this.rt;
    if (Math.abs(off) > RESYNC_MS) {
      this.rt = goal;
      this.rate = 1;
      this.errP.set(0, 0, 0);
      this.errQ.identity();
    } else {
      let want = Math.min(RATE_MAX, Math.max(RATE_MIN, 1 + off / EASE_MS));
      // (past the newest state: slowed right down, a deeper buffer while it waits)
      if (this.rt > this.buf[this.buf.length - 1].st) want = RATE_MIN;
      // (the pace itself eased, so it never lurches)
      this.rate += (want - this.rate) * Math.min(1, dt * 4);
      this.rt += dt * 1000 * this.rate;
    }
    const prev = v3.copy(this.shown.p);
    const r = this.rawAt(this.rt);
    // the correction easing out — but never so fast the car's drawn going back the way it came
    // (and no faster than the car's own pace again: a long-late state caught up to, not leapt to)
    const sp = r.v.length();
    const k = Math.exp((-dt * 1000) / ERR_TAU);
    const e = this.errP.length();
    const most = (CATCH_UP * sp + 2) * dt;
    this.errP.multiplyScalar(e * (1 - k) > most ? (e - most) / e : k);
    qa.identity();
    this.errQ.slerp(qa, 1 - k);
    if (sp > MOVING) {
      dir.copy(r.v).divideScalar(sp);
      const along =
        (r.p.x + this.errP.x - prev.x) * dir.x +
        (r.p.y + this.errP.y - prev.y) * dir.y +
        (r.p.z + this.errP.z - prev.z) * dir.z;
      if (along < 0) this.errP.addScaledVector(dir, -along);
    }
    this.copyShown();
    return { pose: this.shown, at: this.sampleAt(this.rt) };
  }

  /** Where the playback clock should be at `now`: as far behind the fastest a state's come lately
   *  as they've been late lately. */
  private target(now: number): number {
    if (!this.offs.length) return this.rt;
    let base = Infinity;
    for (const o of this.offs) if (o.at >= now - BASE_WINDOW && o.off < base) base = o.off;
    if (base === Infinity) base = this.offs[this.offs.length - 1].off;
    // how deep the buffer had to be lately (a state late, or none for a while: the driver's frame
    // of half a second): the PCT-th percentile over the fastest
    const late = this.offs.map((o) => Math.max(0, o.need - base)).sort((a, b) => a - b);
    const pc = late[Math.min(late.length - 1, Math.floor(late.length * PCT))] ?? 0;
    this.delay = Math.min(MAX_DELAY, Math.max(MIN_DELAY, pc + JITTER_MARGIN));
    return now - base - this.delay;
  }

  /** The curve at `t` (sender ms): a Hermite curve through the two states round it, with their
   *  velocities on the sender's own time; past the newest, on along its velocity a little way. */
  private rawAt(t: number): PlaybackPose {
    const b = this.buf;
    const p = this.raw;
    let s0 = b[0];
    let s1 = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++)
      if (b[i].st <= t && b[i + 1].st >= t) {
        s0 = b[i];
        s1 = b[i + 1];
        break;
      }
    if (t >= s1.st) {
      const ex = Math.min(EXTRAP_MS, t - s1.st) / 1000;
      p.p.copy(s1.p).addScaledVector(s1.v, ex);
      p.q.copy(s1.q);
      p.v.copy(s1.v);
    } else if (t <= s0.st || s1 === s0) {
      p.p.copy(s0.p);
      p.q.copy(s0.q);
      p.v.copy(s0.v);
    } else {
      const T = (s1.st - s0.st) / 1000;
      const u = (t - s0.st) / (s1.st - s0.st);
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      p.p.set(
        h00 * s0.p.x + h10 * T * s0.v.x + h01 * s1.p.x + h11 * T * s1.v.x,
        h00 * s0.p.y + h10 * T * s0.v.y + h01 * s1.p.y + h11 * T * s1.v.y,
        h00 * s0.p.z + h10 * T * s0.v.z + h01 * s1.p.z + h11 * T * s1.v.z,
      );
      p.q.slerpQuaternions(s0.q, s1.q, u);
      p.v.lerpVectors(s0.v, s1.v, u);
    }
    return p;
  }

  /** The newest state at or before `t` (the oldest if none is). */
  private sampleAt(t: number): S | undefined {
    const b = this.buf;
    for (let i = b.length - 1; i >= 0; i--) if (b[i].st <= t) return b[i];
    return b[0];
  }

  private copyShown() {
    this.shown.p.copy(this.raw.p).add(this.errP);
    this.shown.q.copy(this.errQ).multiply(this.raw.q).normalize();
    this.shown.v.copy(this.raw.v);
  }

  private reset() {
    this.buf.length = 0;
    this.offs.length = 0;
    this.started = false;
    this.rate = 1;
    this.errP.set(0, 0, 0);
    this.errQ.identity();
  }
}

function angleOf(q: Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
}
