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
  private headV = new Vector3();
  /** free look (mouse / right stick), radians */
  look = { yaw: 0, pitch: 0 };
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
    const shakeAmp = (this.reduced ? 0.3 : 1) * (this.shake * 0.12 + Math.min(1, speed / 25) * rough * 0.4);
    if (this.mode === "chase") {
      // the camera's yaw follows the heading with a lag, leaning towards where it's going
      let want = heading;
      if (speed > 3) {
        const course = Math.atan2(s.v.z, s.v.x);
        const d = Math.atan2(Math.sin(course - heading), Math.cos(course - heading));
        want = heading + d * 0.35;
      }
      if (back) want += Math.PI;
      if (!this.ready) this.yaw = want;
      const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      this.yaw += d * (1 - Math.exp(-dt * (back ? 12 : 3.2)));
      const yaw = this.yaw + this.look.yaw;
      // (sized to the vehicle: the sedan's 1; the plough truck's further back and up, a sled's close)
      const b = s.spec.body;
      const k = Math.max(0.6, Math.min(1.8, ((b.ahead + b.behind) / 4.9 + b.height / 1.53) / 2));
      const dist = (6.4 + Math.min(1.2, speed * 0.03)) * k;
      const h = 2.0 * k + this.look.pitch * -3;
      const target = v.copy(at).addScaledVector(up, 0.9 * k);
      const want3 = new Vector3(target.x - Math.cos(yaw) * dist, target.y + h, target.z - Math.sin(yaw) * dist);
      if (!this.ready) this.pos.copy(want3);
      this.pos.lerp(want3, 1 - Math.exp(-dt * 9));
      cam.position.copy(this.pos);
      cam.position.x += (Math.random() - 0.5) * shakeAmp;
      cam.position.y += (Math.random() - 0.5) * shakeAmp;
      // look a little ahead of the car along its velocity
      target.x += s.v.x * 0.12;
      target.z += s.v.z * 0.12;
      cam.lookAt(target);
      cam.fov += (62 + 10 * Math.min(1, Math.max(0, (speed - 8) / 30)) - cam.fov) * (1 - Math.exp(-dt * 2));
    } else {
      // the cockpit: the driver's eyes, swaying with the car's g; the hood: over the bonnet
      // (the hood's: the cars' own spot over their bonnet; the others', ahead of the driver's eyes)
      const kind = rig.model.dims.kind;
      const car = kind === "sedan" || kind === "offroad" || kind === "pickup";
      const eye =
        this.mode === "cockpit"
          ? rig.model.eye.clone()
          : car
            ? new Vector3(-1.05, 1.18, 0)
            : rig.model.eye
                .clone()
                .add(new Vector3(-0.9, -0.15, 0))
                .setZ(0);
      if (this.mode === "cockpit") {
        // a sprung head: forward g tips it forward, sideways g leans it out
        const gx = this.reduced ? 0 : rig.g.x;
        const gz = this.reduced ? 0 : rig.g.z;
        const want = new Vector3(gx * 0.035, -Math.abs(gx) * 0.01, gz * 0.03); // (model: x back, z left)
        this.headV.addScaledVector(new Vector3().subVectors(want, this.head), 90 * dt);
        this.headV.multiplyScalar(Math.exp(-dt * 14));
        this.head.addScaledVector(this.headV, dt);
        eye.add(this.head);
      }
      cam.position.copy(eye).applyMatrix4(root.matrixWorld);
      // look ahead, into the corners, with the free look on top
      const steerLook = this.mode === "cockpit" ? s.str * 0.35 : 0;
      const yaw = (back ? Math.PI : 0) + this.look.yaw + steerLook;
      const dir = new Vector3(-Math.cos(yaw), -0.13 + this.look.pitch, -Math.sin(yaw)).applyQuaternion(q);
      cam.position.y += (Math.random() - 0.5) * shakeAmp * 0.25;
      cam.lookAt(v.copy(cam.position).add(dir));
      cam.fov += ((this.mode === "cockpit" ? 64 : 66) - cam.fov) * (1 - Math.exp(-dt * 4));
    }
    cam.updateProjectionMatrix();
    this.ready = true;
    return cam.position;
  }
}
