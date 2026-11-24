// The build camera (docs/plan/124-the-build-view.md, F4a): build mode's own, The Sims 3's — it looks at a
// point of its own on the floor, not at me (I stand idle where I was). W A S D and the arrows pan it, Q / E
// turn it, T looks straight down (and back), the wheel zooms, the right button's drag orbits (the view's own).
// Opened where my camera was; on Done the view's own target eases back to me.
import type { Vector3 } from "three";
import type { ThirdPersonView } from "../tp/view";

/** How far from me the camera's point may wander (m): the lot, not the town. */
export const BUILD_REACH = 45;
/** Panning speed, per metre the camera stands back (m/s per m): far out it pans further. */
const PAN = 0.95;
/** Turning, rad/s. */
const TURN = 1.9;
/** Looking straight down (T): the pitch. */
export const TOP_PITCH = 1.52;
/** Where it starts: pulled back and over, a Sims camera's (eased in from mine). */
const START = { pitch: 0.82, dist: 11 };

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const TURN_KEYS: Record<string, number> = { KeyQ: -1, KeyE: 1 };

export class BuildCam {
  private keys = new Set<string>();
  private fast = false;
  private ease: { pitch: number; dist: number; t: number } | null = null;
  private before: { pitch: number; dist: number } | null = null;
  private top: number | null = null; // the pitch before T looked down
  private eased: { pitch: number; dist: number } | null = null; // where the ease left the camera last frame
  private lastMe: { x: number; y: number } | null = null;
  on = false;

  constructor(private readonly view: () => ThirdPersonView | null) {}

  /** Build mode opened: the camera's point is where mine looked; it pulls back and over. */
  start() {
    const tp = this.view();
    if (!tp || this.on) return;
    this.on = true;
    tp.buildAt = tp.target.clone();
    this.before = { pitch: tp.pitch, dist: tp.dist };
    // (the follow camera's view pulls back and over; one set by hand — the free camera, a spec's held view — stays as set)
    // (first person too: building is always the follow camera, from the next frame)
    this.ease =
      tp.mode !== "free" ? { pitch: Math.max(tp.pitch, START.pitch), dist: Math.max(tp.dist, START.dist), t: 0 } : null;
    this.eased = null;
    this.top = null;
  }

  /** Build mode closed: back to me (the view's own target eases there; its own camera takes the pitch). */
  stop() {
    const tp = this.view();
    this.keys.clear();
    this.ease = null;
    this.top = null;
    this.turnLeft = 0;
    this.lastMe = null;
    this.eased = null;
    if (!this.on) return;
    this.on = false;
    if (!tp) return;
    tp.buildAt = null;
    if (this.before) {
      tp.pitch = this.before.pitch;
      tp.dist = this.before.dist;
    }
  }

  private turnLeft = 0; // rad still to turn (the view cluster's buttons), eased
  /** Turn by an angle, eased over a moment. */
  turnBy(a: number) {
    this.turnLeft += a;
  }

  /** A key down or up while building: the camera's (true) or not. */
  key(code: string, down: boolean, shift: boolean): boolean {
    this.fast = shift;
    if (code === "ShiftLeft" || code === "ShiftRight") return false;
    if (!(code in PAN_KEYS) && !(code in TURN_KEYS)) return false;
    if (!down) {
      this.keys.delete(code);
      return true;
    }
    this.keys.add(code);
    return true;
  }

  /** T: straight down, and back to where it was. */
  topDown() {
    const tp = this.view();
    if (!tp) return;
    if (this.top === null) {
      this.top = tp.pitch;
      this.ease = { pitch: TOP_PITCH, dist: tp.dist, t: 0 };
    } else {
      this.ease = { pitch: this.top, dist: tp.dist, t: 0 };
      this.top = null;
    }
  }
  get looksDown(): boolean {
    return this.top !== null;
  }

  blur() {
    this.keys.clear();
  }

  /** Each frame while building. */
  frame(dt: number, me: { x: number; y: number } | null) {
    const tp = this.view();
    if (!tp || !this.on || !tp.buildAt) return;
    // (something else set the camera since — a drag, the wheel, a test's held view —: it's theirs, the ease stops)
    if (
      this.ease &&
      this.eased &&
      (Math.abs(tp.pitch - this.eased.pitch) > 1e-4 || Math.abs(tp.dist - this.eased.dist) > 1e-4)
    )
      this.ease = null;
    if (this.ease) {
      const e = this.ease;
      e.t = Math.min(1, e.t + dt / 0.45);
      const k = 1 - (1 - e.t) ** 3;
      tp.pitch += (e.pitch - tp.pitch) * k;
      tp.dist += (e.dist - tp.dist) * k;
      tp.clampCam();
      this.eased = { pitch: tp.pitch, dist: tp.dist };
      if (e.t >= 1) this.ease = null;
    } else this.eased = null;
    let px = 0;
    let py = 0;
    let turn = 0;
    for (const k of this.keys) {
      const p = PAN_KEYS[k];
      if (p) {
        px += p[0];
        py += p[1];
      }
      turn += TURN_KEYS[k] ?? 0;
    }
    if (turn) tp.yaw += turn * TURN * dt;
    if (this.turnLeft) {
      const step = Math.abs(this.turnLeft) < 0.002 ? this.turnLeft : this.turnLeft * (1 - Math.exp(-dt * 9));
      tp.yaw += step;
      this.turnLeft -= step;
    }
    if (px || py) {
      const n = Math.hypot(px, py);
      const v = PAN * Math.max(3, tp.dist) * (this.fast ? 2.5 : 1) * dt;
      // (away from the camera along its yaw is up; its right is right — the view's frame: x, z)
      const fx = Math.cos(tp.yaw);
      const fz = Math.sin(tp.yaw);
      const at = tp.buildAt;
      at.x += ((fx * py - fz * px) / n) * v;
      at.z += ((fz * py + fx * px) / n) * v;
    }
    // (I can't walk while building: if I moved, I was taken there — "Go there", a teleport, the server —: the camera
    // comes along, over where I am now)
    if (me && this.lastMe && Math.hypot(me.x - this.lastMe.x, me.y - this.lastMe.y) > 0.5) {
      tp.buildAt.x = me.x;
      tp.buildAt.z = me.y;
    }
    this.lastMe = me ? { x: me.x, y: me.y } : null;
    // (kept to the lot round me)
    if (me) {
      const dx = tp.buildAt.x - me.x;
      const dz = tp.buildAt.z - me.y;
      const d = Math.hypot(dx, dz);
      if (d > BUILD_REACH) {
        tp.buildAt.x = me.x + (dx / d) * BUILD_REACH;
        tp.buildAt.z = me.y + (dz / d) * BUILD_REACH;
      }
    }
  }

  /** (tests, the stills) where it looks. */
  at(): Vector3 | null {
    return this.view()?.buildAt ?? null;
  }
}
