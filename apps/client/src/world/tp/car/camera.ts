import type { CarState } from "@yutopia/shared/car";
import { type PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { CarRig } from "./rig";

// The car's cameras (docs/plan/28-the-car.md, Cameras): the chase camera
// sprung behind it (its yaw lags so a drift shows its angle; it looks ahead
// with the velocity; the field widens with speed; it shakes on rough ground
// and at a knock), the hood, and the cockpit — the driver's own eyes, the head
// leaning with the car's g and looking into the corners, free look on top.

export type CarCam = "chase" | "hood" | "cockpit";
const up = new Vector3(0, 1, 0);
const v = new Vector3();
const q = new Quaternion();
const fwd = new Vector3();

export class CarCamera {
  mode: CarCam = "chase";
  private yaw = 0;
  private pos = new Vector3();
  private ready = false;
  private shake = 0;
  private head = new Vector3(); // the sprung head offset (cockpit)
  // (docs/plan/92 phase 9) a landing: the camera dips with the car and springs back
  private airT = 0;
  private dip = 0;
  private dipV = 0;
  private vy = 0;
  private headV = new Vector3();
  /** free look (mouse / right stick), radians */
  look = { yaw: 0, pitch: 0 };
  /** (plan 98 phase 8) the world's sight: how far from a point along a direction the first wall or the land is
   *  (the scene's coords), or null — the chase camera kept out of them */
  ray: ((x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number) => number | null) | null =
    null;
  /** (plan 98) the chase camera's distance as walls let it be (eased in fast, out slowly); looking back last frame;
   *  the shake's own clock */
  private reach = -1;
  private backWas = false;
  private st = 0;
  /** ease towards 0 when not used */
  reduced = false;

  cycle() {
    this.mode = this.mode === "chase" ? "cockpit" : this.mode === "cockpit" ? "hood" : "chase";
    this.ready = false;
  }
  knock(k: number) {
    this.shake = Math.min(1, this.shake + k);
  }

  /** Place `cam` this frame. `back`: looking back. Returns the eye's world position. */
  update(cam: PerspectiveCamera, rig: CarRig, s: CarState, dt: number, back: boolean, rough: number): Vector3 {
    const root = rig.model.root;
    root.updateWorldMatrix(true, false);
    // (world: the model may sit in a group placed in the view's frame)
    const at = new Vector3().setFromMatrixPosition(root.matrixWorld);
    root.getWorldQuaternion(q);
    fwd.set(-1, 0, 0).applyQuaternion(q); // (the model's nose is −x)
    const heading = Math.atan2(fwd.z, fwd.x);
    const speed = Math.hypot(s.v.x, s.v.z);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const shakeAmp = (this.reduced ? 0.3 : 1) * (this.shake * 0.16 + Math.min(1, speed / 25) * rough * 0.4);
    // (plan 98 phase 8: the shake a smooth noise at 8–15 Hz — a random each frame was a jitter at the frame rate)
    this.st += dt;
    const nz = (a: number) =>
      (Math.sin(this.st * 13.1 + a) + 0.6 * Math.sin(this.st * 8.3 + a * 2.1) + 0.4 * Math.sin(this.st * 17.9 + a * 3.7)) /
      2;
    // in the air, then down: a dip by how hard it came down, sprung back (none for a passenger's
    // stand-in state: it has no wheels)
    const wheels = (s as Partial<CarState>).wheels;
    if (wheels?.length) {
      const air = wheels.every((w) => !w.contact);
      if (air) this.airT += dt;
      else {
        // (plan 98: a short hop's landing too)
        if (this.airT > 0.12 && !this.reduced) this.dipV -= Math.min(6, Math.abs(this.vy) * 0.9 + this.airT * 1.5);
        this.airT = 0;
      }
      this.vy = s.v.y;
    }
    this.dipV += (-this.dip * 60 - this.dipV * 9) * dt;
    this.dip += this.dipV * dt;
    if (this.mode === "chase") {
      // the camera's yaw follows the heading with a lag, leaning towards where it's going
      let want = heading;
      // (plan 98 phase 8: leaning toward the course only going forward — backing, the course is behind it, and the
      // camera swung ~99° to the side, flipping sides at straight back)
      const vf = s.v.x * fwd.x + s.v.z * fwd.z;
      if (speed > 3 && vf > 1) {
        // (into a drift: toward where it's going more than where it points — docs/plan/92's feel)
        const course = Math.atan2(s.v.z, s.v.x);
        const d = Math.atan2(Math.sin(course - heading), Math.cos(course - heading));
        want = heading + d * 0.55 * Math.min(1, (speed - 3) / 6) * Math.min(1, (vf - 1) / 3);
      }
      if (back) want += Math.PI;
      // (looking back and again: a cut, not a swing through the side)
      const cut = !this.ready || back !== this.backWas;
      this.backWas = back;
      if (cut) this.yaw = want;
      const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      // (stiffer at a crawl: parking, a tight turn — loose only as it goes)
      this.yaw += d * (1 - Math.exp(-dt * (3.2 + 3.4 * Math.max(0, 1 - speed / 8))));
      const yaw = this.yaw + this.look.yaw;
      // (sized to the vehicle: the sedan's 1; the plough truck's further back and up, a sled's close)
      const b = s.spec.body;
      const k = Math.max(0.6, Math.min(1.8, ((b.ahead + b.behind) / 4.9 + b.height / 1.53) / 2));
      // (lower and closer than plan 28's, a little further out as it goes)
      let dist = (5.6 + Math.min(1.3, speed * 0.032)) * k;
      // (on a slope: behind it down (or up) the slope with it, most of the way — uphill the road ahead not hidden)
      const slope = Math.max(-0.35, Math.min(0.35, fwd.y)) * 0.65;
      const h = 1.62 * k + this.look.pitch * -3 - slope * dist;
      const target = v.copy(at).addScaledVector(up, 0.82 * k);
      // (walls and the land between it and the eye: in short of them — fast in, slowly back out)
      const ex = -Math.cos(yaw) * dist;
      const ey = h;
      const ez = -Math.sin(yaw) * dist;
      const len = Math.hypot(ex, ey, ez);
      const hit = this.ray?.(target.x, target.y, target.z, ex / len, ey / len, ez / len, len + 0.3) ?? null;
      const free = hit === null ? len : Math.max(1.4 * k, hit - 0.3);
      if (this.reach < 0 || cut) this.reach = free;
      this.reach += (free - this.reach) * (1 - Math.exp(-dt * (free < this.reach ? 22 : 3)));
      const kk = Math.min(1, this.reach / len);
      dist *= kk;
      const want3 = new Vector3(target.x + ex * kk, target.y + ey * kk, target.z + ez * kk);
      if (cut) this.pos.copy(want3);
      this.pos.lerp(want3, 1 - Math.exp(-dt * 9));
      cam.position.copy(this.pos);
      cam.position.x += nz(0) * shakeAmp * 0.5;
      cam.position.y += nz(1.7) * shakeAmp * 0.5 + this.dip * 0.12;
      target.y += this.dip * 0.06;
      // look a little ahead of the car along its velocity
      target.x += s.v.x * 0.12;
      target.z += s.v.z * 0.12;
      cam.lookAt(target);
      cam.fov += (62 + 14 * Math.min(1, Math.max(0, (speed - 6) / 34)) - cam.fov) * (1 - Math.exp(-dt * 2));
    } else {
      // the cockpit: the driver's eyes, swaying with the car's g; the hood: over the bonnet
      // (over the bonnet: the model's own spot for it, if it says; else ahead of the driver's eyes)
      const hood = rig.model.hood;
      const eye =
        this.mode === "cockpit"
          ? rig.model.eye.clone()
          : hood
            ? hood.clone()
            : rig.model.eye
                .clone()
                .add(new Vector3(-0.9, -0.15, 0))
                .setZ(0);
      {
        // a sprung head: forward g tips it forward, sideways g leans it out; (plan 98 phase 9) the hood's a stiffer
        // spring of its own — the body's dive and squat, its bumps
        const hoodK = this.mode === "cockpit" ? 1 : 0.45;
        const gx = this.reduced ? 0 : rig.g.x;
        const gz = this.reduced ? 0 : rig.g.z;
        const gy = this.reduced ? 0 : rig.g.y;
        const want = new Vector3(gx * 0.035, -Math.abs(gx) * 0.01 - gy * 0.02, gz * 0.03).multiplyScalar(hoodK);
        this.headV.addScaledVector(new Vector3().subVectors(want, this.head), (this.mode === "cockpit" ? 90 : 160) * dt);
        this.headV.multiplyScalar(Math.exp(-dt * 14));
        this.head.addScaledVector(this.headV, dt);
        eye.add(this.head);
      }
      cam.position.copy(eye).applyMatrix4(root.matrixWorld);
      // look ahead, into the corners, with the free look on top
      const steerLook = this.mode === "cockpit" ? s.str * 0.35 : 0;
      const yaw = (back ? Math.PI : 0) + this.look.yaw + steerLook;
      // (the cockpit looks down a little more than the hood, as far as its own cluster needs: that ~17° under
      // the picture's middle — above the hints, through the wheel —, the road over the dash in the top two
      // thirds; each body's dash its own height — docs/plan/92 polish)
      let down = -0.13;
      if (this.mode === "cockpit") {
        down = -0.2;
        const c = rig.model.clusterAt?.(v);
        if (c) {
          const e = rig.model.eye;
          const below = Math.atan2(e.y - c.y, Math.hypot(c.x - e.x, c.z - e.z));
          down = -Math.tan(Math.max(0.1, Math.min(0.36, below - 0.3)));
        }
      }
      // (the hood: its nose dips braking, lifts pulling away)
      const pitchG = this.mode === "hood" && !this.reduced ? -rig.g.x * 0.04 : 0;
      const dir = new Vector3(-Math.cos(yaw), down + this.look.pitch + pitchG, -Math.sin(yaw)).applyQuaternion(q);
      cam.position.y += nz(0.9) * shakeAmp * 0.12 + this.dip * 0.03;
      cam.lookAt(v.copy(cam.position).add(dir));
      // (plan 98 phase 9: a little wider with speed here too)
      const fk = Math.min(1, Math.max(0, (speed - 6) / 34));
      cam.fov += ((this.mode === "cockpit" ? 64 + 5 * fk : 66 + 7 * fk) - cam.fov) * (1 - Math.exp(-dt * 4));
    }
    cam.updateProjectionMatrix();
    this.ready = true;
    return cam.position;
  }
}
