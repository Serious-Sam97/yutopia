import type { AvatarLayers } from "@yutopia/shared";
import {
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  type Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import { type VortexMood, vortexSvg } from "../art/vortex/vortexArt";

// Who's drawn while their 3D person isn't (docs/plan/72-the-3d-core.md, phase 12: the paper people
// retired): a low figure in their own colours — legs, a body in their top's colour, a head in their
// skin's — till their model's built; and Vortex, who's his drawing (exactly as in Yondra), turned to
// the camera, floating.

/** What the view gives a stand-in each frame (tp/person3d.ts PersonIn's part of it). */
export interface StandIn {
  avatar: AvatarLayers;
  x: number;
  y: number;
  z?: number;
  angle: number;
  a: number;
  speaking?: boolean;
  npc?: boolean;
  vortexMood?: string;
  vortexSit?: number;
}

/** A shadow and the speaking ring at someone's feet. */
function feet(root: Group): Mesh {
  const shadow = new Mesh(
    new CircleGeometry(0.26, 20).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0x1a100a, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.position.y = 0.004;
  shadow.name = "shadow";
  const ring = new Mesh(
    new RingGeometry(0.3, 0.36, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xffa630, transparent: true, depthWrite: false, toneMapped: false }),
  );
  ring.position.y = 0.006;
  ring.visible = false;
  root.add(shadow, ring);
  return ring;
}
function disposeAll(root: Group) {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
  });
}

/** Someone whose 3D person isn't built yet: a low figure in their colours, standing or sat, turned
 *  their way. */
export class Proxy3 {
  readonly root = new Group();
  private body = new Group();
  private ring: Mesh;
  private look = "";
  private mats: { m: MeshLambertMaterial; base: string }[] = [];
  shown = true;

  constructor(readonly id: string) {
    this.ring = feet(this.root);
    this.root.add(this.body);
  }

  private build(av: AvatarLayers) {
    const key = `${av.skin}|${av.topColor}|${av.bottomColor}|${av.hairColor}`;
    if (key === this.look) return;
    this.look = key;
    for (const c of [...this.body.children]) {
      this.body.remove(c);
      (c as Mesh).geometry.dispose();
    }
    for (const x of this.mats) x.m.dispose();
    this.mats = [];
    const mat = (c: string) => {
      const m = new MeshLambertMaterial({ color: c });
      this.mats.push({ m, base: c });
      return m;
    };
    const legs = new Mesh(new CapsuleGeometry(0.11, 0.62, 2, 8), mat(av.bottomColor));
    legs.position.y = 0.44;
    const torso = new Mesh(new CapsuleGeometry(0.19, 0.42, 2, 10), mat(av.topColor));
    torso.position.y = 1.12;
    const head = new Mesh(new SphereGeometry(0.12, 12, 10), mat(av.skin));
    head.position.y = 1.58;
    const hair = new Mesh(new SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(av.hairColor));
    hair.position.y = 1.6;
    this.body.add(legs, torso, head, hair);
  }

  update(p: StandIn, tint: Color) {
    this.build(p.avatar);
    this.root.position.set(p.x, p.z ?? 0, p.y);
    // (its front along its facing: three's yaw turns −angle)
    this.body.rotation.y = -p.angle + Math.PI / 2;
    // (sat: down by the seat's height, its legs folded under)
    this.body.position.y = p.a === 2 ? -0.42 : 0;
    this.body.scale.y = p.a === 2 ? 0.92 : 1;
    this.ring.visible = !!p.speaking;
    if (p.speaking) (this.ring.material as MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(performance.now() / 160);
    // (in the light on them: their own colours by the view's tint)
    for (const x of this.mats) x.m.color.set(x.base).multiply(tint);
  }

  dispose() {
    disposeAll(this.root);
  }
}

// ── Vortex: his drawing, floating, turned to the camera ──
// m: his drawing's width (its 240 × 225) — the size he always was: 120 of the old board's units at
// its 0.585 a unit, a person 1/1.3 of the world, in the old art's px a tile
const VW = 1.378;
const VH = (VW * 225) / 240;
const vortexImgs = new Map<string, HTMLImageElement | null>();
function vortexImage(mood: string): HTMLImageElement | null {
  const have = vortexImgs.get(mood);
  if (have !== undefined) return have;
  vortexImgs.set(mood, null);
  const svg = vortexSvg(mood as VortexMood, `tp${mood}`).replace("<svg ", '<svg width="240" height="225" ');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  img
    .decode()
    .then(() => vortexImgs.set(mood, img))
    .catch(() => vortexImgs.delete(mood));
  return null;
}

export class Vortex3 {
  readonly root = new Group();
  private pivot = new Group();
  private canvas = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private mat: MeshBasicMaterial;
  readonly plane: Mesh;
  private mood = "";
  shown = false;

  constructor(readonly id: string) {
    this.canvas.width = 384;
    this.canvas.height = 360;
    this.g = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, alphaTest: 0.45, side: DoubleSide });
    // (its feet line at the origin)
    this.plane = new Mesh(new PlaneGeometry(VW, VH).translate(0, VH / 2, 0), this.mat);
    this.plane.visible = false;
    feet(this.root);
    this.pivot.rotation.order = "YXZ";
    this.pivot.add(this.plane);
    this.root.add(this.pivot);
  }

  /** `face`: the way the drawings face (back along the camera's view); `lean`: how far it tips back
   *  to a camera looking down. */
  update(p: StandIn, face: number, camPitch: number, lean: number, tint: Color) {
    const mood = p.vortexMood || "smug";
    const img = vortexImage(mood);
    if (img && mood !== this.mood) {
      this.mood = mood;
      this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.g.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      this.tex.needsUpdate = true;
      this.shown = true;
    }
    this.plane.visible = this.shown;
    this.root.position.set(p.x, 0, p.y);
    // (sat at a chess table — plan 70: a sitter's size, low over the seat so his face is over the far
    // rank, bobbing a little)
    const sit = p.vortexSit;
    this.pivot.scale.setScalar(sit === undefined ? 1 : 0.62);
    this.pivot.position.set(
      0,
      sit === undefined
        ? 0.12 + Math.sin(performance.now() / 420) * 0.05
        : sit - 0.04 + Math.sin(performance.now() / 520) * 0.012,
      0,
    );
    this.pivot.rotation.set(-camPitch * lean, -face + Math.PI / 2, 0);
    (this.root.getObjectByName("shadow") as Mesh).visible = this.shown;
    this.mat.color.copy(tint);
  }

  /** Is his drawing there (not its transparent margin) at a point of its plane? */
  opaqueAt(u: number, v: number): boolean {
    const x = Math.floor(u * this.canvas.width);
    const y = Math.floor((1 - v) * this.canvas.height);
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return false;
    return this.g.getImageData(x, y, 1, 1).data[3] > 60;
  }

  dispose() {
    this.tex.dispose();
    disposeAll(this.root);
  }
}
