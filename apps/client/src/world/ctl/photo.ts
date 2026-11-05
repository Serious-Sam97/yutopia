import type { WorldController } from "../controller";
import type { CamMode, ThirdPersonView } from "../tp/view";

/** What Photo reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type PhotoHost = Pick<WorldController, "camWanted" | "me" | "meAngle" | "tp">;

export class Photo {
  constructor(private readonly c: PhotoHost) {}

  // ── the phone's camera (world/phone/camera.ts): the view becomes the viewfinder ──
  // Photo is your eyes (first person, the lens zooms), Selfie a camera at
  // arm's length in front of you (Q / E walk it round you).
  photo: {
    mode: "photo" | "selfie";
    angle: number; // the selfie camera, round me (world radians)
    tilt: number;
    zoom: number;
    was: { cam: CamMode | null; yaw: number; pitch: number };
  } | null = null;

  photoMode(mode: "photo" | "selfie" | null) {
    const tp = this.c.tp;
    if (!mode) {
      const was = this.photo?.was;
      this.photo = null;
      if (tp) {
        tp.lensPart.lens(null);
        tp.setMode(this.c.camWanted());
        if (was) {
          tp.yaw = was.yaw;
          tp.pitch = was.pitch;
        }
      }
      return;
    }
    const was = this.photo?.was ?? {
      cam: tp ? (this.c.tp?.mode ?? null) : null,
      yaw: tp?.yaw ?? 0,
      pitch: tp?.pitch ?? 0,
    };
    this.photo = { mode, angle: this.c.meAngle, tilt: 0, zoom: 1, was };
    tp?.mouseLook.setLook(false);
    if (tp) {
      tp.lensPart.lens(mode === "photo" ? 1 : null);
      if (mode === "photo") {
        tp.setMode("first");
        tp.yaw = this.c.meAngle;
        tp.pitch = 0.04;
      } else tp.setMode("chase");
    }
  }

  photoZoom(z: number) {
    if (!this.photo) return;
    this.photo.zoom = z;
    this.c.tp?.lensPart.lens(this.photo.mode === "photo" ? z : null);
  }

  photoTurn(dir: number) {
    if (!this.photo) return;
    if (this.photo.mode === "selfie") this.photo.angle += dir * 0.22;
    else if (this.c.tp) this.c.tp.yaw += dir * 0.09;
  }

  photoTilt(dir: number) {
    if (!this.photo) return;
    if (this.photo.mode === "selfie") this.photo.tilt = Math.max(-0.4, Math.min(0.5, this.photo.tilt + dir * 0.08));
    else if (this.c.tp) this.c.tp.pitch = Math.max(-0.6, Math.min(0.8, this.c.tp.pitch + dir * 0.05));
  }

  // the selfie camera in 3D (null otherwise): at arm's length, a little above
  photoCam(): ThirdPersonView["gameCam"] {
    const p = this.photo;
    if (!p || p.mode !== "selfie" || !this.c.tp) return null;
    const a = p.angle;
    const r = 1.35 / Math.max(1, p.zoom * 0.8);
    // the billboards face back along the camera's yaw: point it at me
    this.c.tp.yaw = a + Math.PI;
    return {
      eye: [this.c.me.x + Math.cos(a) * r, this.c.me.y + Math.sin(a) * r, 1.78 + p.tilt],
      look: [this.c.me.x, this.c.me.y, 1.42 + p.tilt * 0.4],
      showMe: true,
      fov: 56,
    };
  }

  snapshot(): HTMLCanvasElement | null {
    return this.c.tp?.lensPart.snapshot() ?? null;
  }

  flashPerson(sid: string) {
    this.c.tp?.lensPart.flash(sid);
  }
}
