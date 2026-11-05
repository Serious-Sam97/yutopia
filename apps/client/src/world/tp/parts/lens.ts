import { AdditiveBlending, CanvasTexture, Sprite, SpriteMaterial } from "three";
import type { ThirdPersonView } from "../view";
import { FOV, LIMITS } from "./common";

/** What Lens reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type LensHost = Pick<
  ThirdPersonView,
  | "buildPick"
  | "camera"
  | "clampCam"
  | "dist"
  | "follow"
  | "live"
  | "mode"
  | "pageRect"
  | "people"
  | "people3"
  | "post"
  | "renderer"
  | "scene"
  | "tags"
>;

export class Lens {
  constructor(private readonly c: LensHost) {}

  fov1p = FOV; // first person's own lens (the wheel zooms it), down the sights closer

  // The phone's camera in first person: its zoom (1 = the eye's lens). null lets go.
  lensFov: number | null = null;

  lens(zoom: number | null) {
    this.lensFov = zoom === null ? null : Math.max(14, FOV / zoom);
    if (zoom === null && this.c.mode !== "first") this.c.camera.fov = FOV;
  }

  // The frame as it is (the phone's camera): drawn now and copied in the same
  // task, so it's there without keeping the drawing buffer.
  snapshot(): HTMLCanvasElement | null {
    const tags = this.c.tags.tagLayer?.style.display ?? "";
    // (the canvas alone: a glass with a player behind it gets its picture back for this one)
    this.c.live.holes(this.c.camera, this.c.pageRect, true);
    if (this.c.post) this.c.post.render(false);
    else this.c.renderer.render(this.c.scene, this.c.camera);
    this.c.live.holes(this.c.camera, this.c.pageRect);
    const src = this.c.renderer.domElement;
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d");
    if (!g) return null;
    g.drawImage(src, 0, 0);
    if (this.c.tags.tagLayer) this.c.tags.tagLayer.style.display = tags;
    return c;
  }

  // Someone took a photo: the flash, at their hand.
  flashes: { s: Sprite; t: number }[] = [];

  flashTex: CanvasTexture | null = null;

  flash(id: string) {
    const p3 = this.c.people3.get(id);
    const p = this.c.people.get(id);
    if (!p && !p3?.ready) return;
    if (!this.flashTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.2, "rgba(255,250,235,.8)");
      r.addColorStop(1, "rgba(255,240,210,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      this.flashTex = new CanvasTexture(c);
    }
    const s = new Sprite(
      new SpriteMaterial({ map: this.flashTex, blending: AdditiveBlending, depthWrite: false, transparent: true }),
    );
    if (p3?.ready) s.position.copy(p3.hand("R"));
    else if (p) s.position.set(p.root.position.x, 1.5, p.root.position.z);
    s.scale.setScalar(0.2);
    s.renderOrder = 999;
    this.c.scene.add(s);
    this.flashes.push({ s, t: 0 });
  }

  stepFlashes(dt: number) {
    for (const f of this.flashes) {
      f.t += dt;
      const k = f.t / 0.3;
      f.s.scale.setScalar(0.25 + k * 1.6);
      (f.s.material as SpriteMaterial).opacity = Math.max(0, 1 - k * k);
    }
    for (const f of this.flashes.filter((x) => x.t > 0.3)) {
      this.c.scene.remove(f.s);
      (f.s.material as SpriteMaterial).dispose();
    }
    this.flashes = this.flashes.filter((x) => x.t <= 0.3);
  }

  zoomBy(k: number) {
    // (first person: the lens, not the distance)
    if (this.c.mode === "first") {
      this.fov1p = Math.max(40, Math.min(80, this.fov1p * k));
      return;
    }
    // (the chase camera: how far back it rests — it eases there, and further in a dash)
    if (this.c.mode === "chase" && !this.c.buildPick.buildMode) {
      const L = LIMITS.chase.dist;
      this.c.follow.tune.dist = Math.max(L[0], Math.min(L[1] - 3, this.c.follow.tune.dist * k));
      return;
    }
    this.c.dist *= k;
    this.c.clampCam();
  }
}
