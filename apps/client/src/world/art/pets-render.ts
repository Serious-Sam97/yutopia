import type { PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";
import { type BodyMood, type Face3, PetModel, type PoseKind, plainMat } from "./pets3d";

// The HUD's pictures of pets (pets3d.ts's models): the turntable the panel shows and small portraits,
// from one small WebGL renderer of their own. (It drew the iso view's sprites too, in 8 facings; they
// went with iso — docs/plan/72-the-3d-core.md, phase 12.)

const SIZE = 256; // the renderer's own canvas between pictures

class PetPictures {
  renderer: WebGLRenderer | null = null;
  scene = new Scene();
  persp = new PerspectiveCamera(32, 1, 0.1, 20);
  private models = new Map<string, PetModel>();
  private mounted: PetModel | null = null;

  constructor() {
    this.scene.add(new HemisphereLight(0xfff4e0, 0x6b4a33, 1.15));
    const sun = new DirectionalLight(0xfff1dc, 1.7);
    sun.position.set(-3, 6, 2.5);
    this.scene.add(sun);
    this.persp.position.set(0, 0.55, 1.9);
  }

  gl(): WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    try {
      const r = new WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
      r.setSize(SIZE, SIZE, false);
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = SRGBColorSpace;
      this.renderer = r;
    } catch {
      return null;
    }
    return this.renderer;
  }

  model(species: Species, look: PetLook, outfit: PetOutfit, name = ""): PetModel {
    const key = `${species}|${JSON.stringify(look)}|${JSON.stringify(outfit)}|${name}`;
    let m = this.models.get(key);
    if (!m) {
      m = new PetModel(species, look, outfit, plainMat, name);
      this.models.set(key, m);
      if (this.models.size > 24) {
        const [oldKey, old] = this.models.entries().next().value as [string, PetModel];
        this.models.delete(oldKey);
        if (this.mounted === old) this.mounted = null;
        old.dispose();
      }
    }
    return m;
  }

  private mount(m: PetModel) {
    if (this.mounted === m) return;
    if (this.mounted) this.scene.remove(this.mounted.root);
    this.scene.add(m.root);
    this.mounted = m;
  }

  // The pet turning on a stand, into a canvas of the panel's (square).
  turntable(
    target: HTMLCanvasElement,
    species: Species,
    look: PetLook,
    outfit: PetOutfit,
    yaw: number,
    // (a mood and a speed: the sheet's moods and gaits — docs/plan/52-the-pet-two.md)
    pose: { kind: PoseKind; t: number; face: Face3; mood?: BodyMood; speed?: number },
  ) {
    const gl = this.gl();
    if (!gl) return;
    const m = this.model(species, look, outfit);
    this.mount(m);
    m.pose({ ...pose, look: 0 });
    m.root.rotation.y += yaw;
    const size = Math.min(target.width, target.height);
    gl.setSize(size, size, false);
    this.persp.aspect = 1;
    const h = m.height;
    const d = Math.max(1.1, m.size * 2.6);
    this.persp.position.set(0, h * 0.62, d);
    this.persp.lookAt(0, h * 0.42, 0);
    this.persp.updateProjectionMatrix();
    gl.render(this.scene, this.persp);
    const g = target.getContext("2d") as CanvasRenderingContext2D;
    g.clearRect(0, 0, target.width, target.height);
    g.drawImage(gl.domElement, 0, 0, size, size, (target.width - size) / 2, (target.height - size) / 2, size, size);
    gl.setSize(SIZE, SIZE, false);
  }

  // A small picture of the pet (¾ view, happy) as a data URL — for faces in the HUD.
  portrait(species: Species, look: PetLook, outfit: PetOutfit, face: Face3 = "happy", px = 96): string | null {
    const gl = this.gl();
    if (!gl) return null;
    const m = this.model(species, look, outfit);
    this.mount(m);
    m.pose({ kind: "idle", t: 0, face, look: 0.3 });
    m.root.rotation.y += -Math.PI / 2 + 0.6;
    gl.setSize(px, px, false);
    const h = m.height;
    this.persp.position.set(0, h * 0.9, Math.max(0.9, m.size * 2.0));
    this.persp.lookAt(0, h * 0.66, 0);
    this.persp.updateProjectionMatrix();
    gl.render(this.scene, this.persp);
    const c = document.createElement("canvas");
    c.width = px;
    c.height = px;
    (c.getContext("2d") as CanvasRenderingContext2D).drawImage(gl.domElement, 0, 0);
    gl.setSize(SIZE, SIZE, false);
    return c.toDataURL();
  }
}

let shared: PetPictures | null = null;
/** The HUD's one renderer for pictures of pets (made on first use). */
export function petRenderer(): PetPictures {
  shared ??= new PetPictures();
  return shared;
}
