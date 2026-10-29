import { terrainAt } from "@yutopia/shared/grounds";
import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  type Scene,
} from "three";

// The brush on the ground (docs/plan/53-the-god-mode.md, phase 6; the mock 02-land): a ring at its
// size, laid over the land's rolls, a dashed one where its strength has fallen to half, a dot in
// the middle; in the lamp's colour, over everything (it's a tool's, not the world's).

const SEG = 72;
const AMBER = 0xf1d79a; // (the HUD's lamp: --amber)

export class BrushRing {
  readonly root = new Group();
  private readonly outer: LineLoop;
  private readonly inner: LineLoop;
  private readonly dot: Mesh;
  private key = "";

  constructor(scene: Scene) {
    const mat = new LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, depthTest: false });
    const dash = new LineDashedMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      dashSize: 1.2,
      gapSize: 0.9,
    });
    this.outer = new LineLoop(this.loop(), mat);
    this.inner = new LineLoop(this.loop(), dash);
    this.dot = new Mesh(
      new CircleGeometry(0.35, 16).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: AMBER, depthTest: false, transparent: true }),
    );
    for (const o of [this.outer, this.inner, this.dot]) {
      o.renderOrder = 20;
      o.frustumCulled = false;
      this.root.add(o);
    }
    this.root.visible = false;
    scene.add(this.root);
  }
  private loop(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(SEG * 3), 3));
    return g;
  }

  /** At (x, z) on the land (the Grounds' coords), `r` m round; `f`: the floor's frame (the scene's
   *  x, z are the Grounds' less f.x, f.z; its height the land's plus f.y). Null: not shown. */
  show(at: { x: number; z: number } | null, r: number, f: { x: number; z: number; y: number }) {
    if (!at) {
      this.root.visible = false;
      this.key = "";
      return;
    }
    this.root.visible = true;
    const k = `${at.x.toFixed(2)},${at.z.toFixed(2)},${r},${f.x},${f.z},${f.y}`;
    if (k === this.key) return;
    this.key = k;
    for (const [line, rr] of [
      [this.outer, r],
      [this.inner, r / 2],
    ] as const) {
      const p = line.geometry.getAttribute("position") as Float32BufferAttribute;
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const x = at.x + Math.cos(a) * rr;
        const z = at.z + Math.sin(a) * rr;
        p.setXYZ(i, x - f.x, terrainAt(x, z) + 0.25 + f.y, z - f.z);
      }
      p.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      if (line === this.inner) line.computeLineDistances();
    }
    this.dot.position.set(at.x - f.x, terrainAt(at.x, at.z) + 0.3 + f.y, at.z - f.z);
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of [this.outer, this.inner, this.dot]) {
      o.geometry.dispose();
      (o.material as LineBasicMaterial).dispose();
    }
  }
}
