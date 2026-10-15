import type { PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { type Face3, PetModel, type PoseKind, plainMat, type RigIn, rigOf, toyMesh } from "./pets3d";

// The pet models drawn for the iso view (pets3d.ts): rendered from the iso
// camera — 30° down, the viewer at +x +y, 8 facings — into sprites, one per
// look × facing × pose frame, on demand, kept for the session. Also the
// turntable the panel shows and small portraits. One small WebGL renderer for
// all of it.

export const LPX = 45.25; // iso px per tile of horizontal length (tp/kit3d.ts)
export const SPRITE_PX = 3; // render px per iso px (mipmapped: crisp lines at any zoom)
const W = 288;
const H = 312;
const LOOK_AT = 0.42; // tiles above the feet the camera looks at
// the 8 facings (shared/iso.ts DIRS) as world vectors (x, y)
const DIR_VEC: [number, number][] = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
];
export const dirAngle = (d: number) => {
  const [x, y] = DIR_VEC[((d % 8) + 8) % 8];
  return Math.atan2(y, x);
};

// frames per cycle for each pose (the iso sprites)
const FRAMES: Record<PoseKind, number> = {
  idle: 6,
  walk: 8,
  sit: 1,
  sleep: 6,
  jump: 6,
  roll: 8,
  spin: 8,
  playdead: 1,
  speak: 6,
  highfive: 6,
  dance: 8,
  pounce: 8,
  hop: 6,
  dive: 6,
  chill: 1,
  eat: 6,
  pet: 6,
  lesson: 6,
  battle: 1,
  attack: 8,
  special: 8,
  defend: 1,
  hurt: 4,
  ko: 1,
  scratch: 6,
  pant: 6,
  groom: 6,
  stretch: 6,
  twitch: 6,
  binky: 8,
  slide: 4,
  shake: 6,
  yawn: 6,
  flat: 4,
  preen: 6,
  wing: 6,
};

export interface PetSprite {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
  scale: number; // sprite scale in iso px per texture px
  lift: number; // how far off the ground the pose puts it (tiles)
}

class SpriteRenderer {
  renderer: WebGLRenderer | null = null;
  scene = new Scene();
  camera: OrthographicCamera;
  persp = new PerspectiveCamera(32, 1, 0.1, 20);
  private sun: DirectionalLight;
  private models = new Map<string, PetModel>();
  private sprites = new Map<string, PetSprite>();
  private order: string[] = [];
  private mounted: PetModel | null = null;

  constructor() {
    const hw = W / 2 / (LPX * SPRITE_PX);
    const hh = H / 2 / (LPX * SPRITE_PX);
    this.camera = new OrthographicCamera(-hw, hw, hh, -hh, 0.1, 30);
    const a = 6;
    this.camera.position.set(a, Math.SQRT2 * a * Math.tan(Math.PI / 6), a);
    this.camera.lookAt(0, LOOK_AT, 0);
    this.scene.add(new HemisphereLight(0xfff4e0, 0x6b4a33, 1.15));
    this.sun = new DirectionalLight(0xfff1dc, 1.7);
    this.sun.position.set(-3, 6, 2.5);
    this.scene.add(this.sun);
    this.persp.position.set(0, 0.55, 1.9);
  }

  gl(): WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    try {
      const r = new WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
      r.setSize(W, H, false);
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
        for (const k of [...this.sprites.keys()]) if (k.startsWith(`${oldKey}|`)) this.sprites.delete(k);
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

  // The sprite for a pet as it is now (null while WebGL isn't there).
  sprite(
    species: Species,
    look: PetLook,
    outfit: PetOutfit,
    dir: number,
    rig: RigIn,
    now: number,
    name = "",
  ): PetSprite | null {
    const r = rigOf(rig, now);
    const n = FRAMES[r.kind];
    const frame = r.once ? Math.min(n - 1, Math.floor(r.t * n)) : Math.floor(r.t * n) % n;
    const lookKey = `${species}|${JSON.stringify(look)}|${JSON.stringify(outfit)}|${name}`;
    const key = `${lookKey}|${((dir % 8) + 8) % 8}|${r.kind}|${frame}|${r.face}|${rig.carry ?? ""}`;
    const have = this.sprites.get(key);
    if (have) return have;
    const gl = this.gl();
    if (!gl) return null;
    const m = this.model(species, look, outfit, name);
    this.mount(m);
    m.pose({ kind: r.kind, t: (frame + 0.5) / n, face: r.face, look: 0, carry: rig.carry ?? null });
    m.root.rotation.y -= dirAngle(dir); // (posing resets the turn: a spin is part of a pose)
    gl.render(this.scene, this.camera);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(gl.domElement, 0, 0);
    // the feet: LOOK_AT tiles under the middle, foreshortened by the 30° camera
    const feetY = H / 2 + LOOK_AT * Math.cos(Math.PI / 6) * LPX * SPRITE_PX;
    const sp: PetSprite = { canvas, anchorX: 0.5, anchorY: feetY / H, scale: 1 / SPRITE_PX, lift: m.root.position.y };
    this.sprites.set(key, sp);
    this.order.push(key);
    if (this.order.length > 1200) {
      const old = this.order.shift() as string;
      this.sprites.delete(old);
    }
    return sp;
  }

  // The pet turning on a stand, into a canvas of the panel's (square).
  turntable(
    target: HTMLCanvasElement,
    species: Species,
    look: PetLook,
    outfit: PetOutfit,
    yaw: number,
    pose: { kind: PoseKind; t: number; face: Face3 },
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
    gl.setSize(W, H, false);
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
    gl.setSize(W, H, false);
    return c.toDataURL();
  }
}

// A toy on the floor or in the air (shared/pets.ts), as the iso view draws it.
export interface ToySprite {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
  scale: number;
}
const TOY_W = 64;
const TOY_H = 64;
const toyCache = new Map<string, ToySprite>();
export function toySpriteOf(r: SpriteRenderer, kind: string, spin = 0): ToySprite | null {
  const cache = toyCache;
  const key = `${kind}|${spin}`;
  const have = cache.get(key);
  if (have) return have;
  const gl = r.gl();
  if (!gl) return null;
  const scene = new Scene();
  scene.add(new HemisphereLight(0xfff4e0, 0x6b4a33, 1.15));
  const sun = new DirectionalLight(0xfff1dc, 1.7);
  sun.position.set(-3, 6, 2.5);
  scene.add(sun);
  const m = toyMesh(kind, plainMat, true);
  if (!m) return null;
  m.rotation.y = spin;
  m.position.y = kind === "frisbee" ? 0.02 : kind === "ball" ? 0.15 : 0.015;
  scene.add(m);
  const hw = TOY_W / 2 / (LPX * SPRITE_PX);
  const hh = TOY_H / 2 / (LPX * SPRITE_PX);
  const cam = new OrthographicCamera(-hw, hw, hh, -hh, 0.1, 30);
  const a = 6;
  cam.position.set(a, Math.SQRT2 * a * Math.tan(Math.PI / 6), a);
  cam.lookAt(0, 0.06, 0);
  gl.setSize(TOY_W, TOY_H, false);
  gl.render(scene, cam);
  const canvas = document.createElement("canvas");
  canvas.width = TOY_W;
  canvas.height = TOY_H;
  (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(gl.domElement, 0, 0);
  gl.setSize(W, H, false);
  const sp: ToySprite = {
    canvas,
    anchorX: 0.5,
    anchorY: (TOY_H / 2 + 0.06 * Math.cos(Math.PI / 6) * LPX * SPRITE_PX) / TOY_H,
    scale: 1 / SPRITE_PX, // (drawn 1.5× life-size: readable from the iso camera)
  };
  cache.set(key, sp);
  return sp;
}

let shared: SpriteRenderer | null = null;
export function petRenderer(): SpriteRenderer {
  shared ??= new SpriteRenderer();
  return shared;
}

export const WHITE = new Color(0xffffff);
