// The skate camera (docs/plan/104-the-skate-again.md F5a), after Tony Hawk's (Neversoft's SkaterCameraComponent):
// behind the way the board goes (the velocity's heading, not her facing — she stands sideways), lagging softly (0.25 a
// 60 Hz frame across, 0.5 up), pulled back with the speed; on a vert air and at a lip, out over the pipe looking at her
// against the coping (where you see the air); rolled with a grind's lean (up to 30°); never inside a ramp nor under
// the ground. Presets Normal / Far / Low / Near (C cycles them). It drives the view as a game camera (tp/view.ts
// `gameCam`): its eye and look in the floor's frame (x, y south, z up).

import type { Body } from "@yutopia/shared/move";
import type { SkatePark } from "@yutopia/shared/skate";

export const CAM_PRESETS = {
  normal: { back: 3.6, up: 1.6, look: 0.9, fov: 72 },
  far: { back: 5.2, up: 2.2, look: 1.0, fov: 70 },
  low: { back: 3.2, up: 0.7, look: 0.8, fov: 76 },
  near: { back: 2.6, up: 1.2, look: 0.95, fov: 74 },
} as const;
export type CamPreset = keyof typeof CAM_PRESETS;
const ORDER: CamPreset[] = ["normal", "far", "low", "near"];

const lerpK = (perFrame: number, dt: number) => 1 - (1 - perFrame) ** (dt * 60);

export class SkateCamera {
  preset: CamPreset = "normal";
  private eye: [number, number, number] | null = null;
  private look: [number, number, number] = [0, 0, 0];
  private heading = 0;
  private roll = 0;
  constructor() {
    try {
      const p = localStorage.getItem("yutopia.skate.cam") as CamPreset | null;
      if (p && p in CAM_PRESETS) this.preset = p;
    } catch {
      /* (a private window) */
    }
  }
  /** The next preset (C while riding). */
  cycle(): CamPreset {
    this.preset = ORDER[(ORDER.indexOf(this.preset) + 1) % ORDER.length];
    try {
      localStorage.setItem("yutopia.skate.cam", this.preset);
    } catch {
      /* (a private window) */
    }
    return this.preset;
  }
  /** Off the board: the next ride starts from behind her again. */
  reset() {
    this.eye = null;
  }

  /** This frame's camera for the body on its board, or null (not on one). */
  frame(b: Body, park: SkatePark, dt: number) {
    const k = b.skate;
    if (!k) return null;
    const P = CAM_PRESETS[this.preset];
    const sp = Math.hypot(b.vx, b.vy);
    // the heading: the way it goes (a grind's along its rail); slow or straight up a wall, kept as it was
    if (sp > 1.2 && !(k.air?.vert ?? false)) {
      const want = Math.atan2(b.vy, b.vx);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * lerpK(0.12, dt);
    } else if (!this.eye) this.heading = b.yaw;
    const hx = Math.cos(this.heading);
    const hy = Math.sin(this.heading);
    const back = P.back + Math.min(1.6, sp * 0.06);
    const look: [number, number, number] = [b.x, b.y, b.z + P.look];
    let want: [number, number, number] = [b.x - hx * back, b.y - hy * back, b.z + P.up];
    // a vert air, a lip trick: out over the pipe, a little above her, looking back at her and the coping
    const vertAir = k.mode === "air" && k.air?.vert && k.air.inYaw !== undefined;
    if (vertAir || k.mode === "lip") {
      const inYaw = k.air?.inYaw ?? b.yaw;
      const ix = Math.cos(inYaw);
      const iy = Math.sin(inYaw);
      want = [b.x + ix * (back + 1.2), b.y + iy * (back + 1.2), b.z + P.up * 0.6];
    }
    // (never inside a ramp: walked in from her to it, stopped short of a piece's body; never under the ground)
    want = this.clear(look, want, park);
    if (!this.eye) this.eye = [...want];
    const e = this.eye;
    const kxy = lerpK(vertAir ? 0.12 : 0.25, dt);
    const kz = lerpK(0.5, dt);
    e[0] += (want[0] - e[0]) * kxy;
    e[1] += (want[1] - e[1]) * kxy;
    e[2] += (want[2] - e[2]) * kz;
    this.look = look;
    // a grind's lean: the camera rolled with it (π/6 at full lean)
    const bal = k.grind?.bal ?? 0;
    this.roll += (bal * (Math.PI / 6) - this.roll) * lerpK(0.1, dt);
    return {
      eye: [e[0], e[1], e[2]] as [number, number, number],
      look: [this.look[0], this.look[1], this.look[2]] as [number, number, number],
      fov: P.fov,
      showMe: true,
      snap: true,
      roll: this.roll,
      lens: 0.4,
    };
  }

  /** The eye kept out of the park's pieces along the line from what it looks at: the first point inside one, less a
   *  little — and over whatever's under it. */
  private clear(
    from: [number, number, number],
    to: [number, number, number],
    park: SkatePark,
  ): [number, number, number] {
    const n = 16;
    let ok = to;
    let inside = 0;
    // (from a third of the way out: next to her the ramp she's on is right under the line — on vert, just below it)
    for (let i = Math.ceil(n / 3); i <= n; i++) {
      const t = i / n;
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      const z = from[2] + (to[2] - from[2]) * t;
      const top = park.topAt(x, y, z + 50, 0);
      if (top && top.z > z + 0.1) inside++;
      else inside = 0;
      // (inside a ramp's body for two samples running: the eye kept short of it, up over it)
      if (inside >= 2) {
        const tb = Math.max(1 / 3, (i - 2) / n);
        ok = [from[0] + (to[0] - from[0]) * tb, from[1] + (to[1] - from[1]) * tb, Math.max(to[2], top ? top.z + 0.6 : to[2])];
        break;
      }
    }
    return ok;
  }
}
