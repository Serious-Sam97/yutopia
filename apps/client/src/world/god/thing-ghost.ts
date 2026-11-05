import { terrainAt } from "@yutopia/shared/grounds";
import {
  BoxGeometry,
  type BufferGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  type Scene,
} from "three";

// A thing as god mode's things tool shows it (docs/plan/53-the-god-mode.md, phase 8; the mock
// 06-things): the box it takes up, on the land, turned; green where it can go, red where it
// can't, the lamp's colour for one picked; over everything (a tool's, not the world's). One held
// or dragged has itself drawn in the box too (`setModel`), as the Grounds draw it.

const COLOURS = { ok: 0x8aa04a, no: 0xc8553f, picked: 0xf1d79a }; // (--good, --rust, --amber)

export class ThingGhost {
  readonly root = new Group();
  private readonly box: LineSegments;
  private readonly mat = new LineBasicMaterial({ color: COLOURS.ok, depthTest: false, transparent: true });
  private key = "";
  private model: Group | null = null;
  private modelKey = "";
  // (over everything, as the box: what's held is seen through the trees it'd stand among)
  private readonly modelMat = new MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });

  constructor(scene: Scene) {
    this.box = new LineSegments(new EdgesGeometry(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), this.mat);
    this.box.renderOrder = 21;
    this.box.frustumCulled = false;
    this.root.add(this.box);
    this.root.visible = false;
    scene.add(this.root);
  }

  /** At (x, z) (the Grounds' coords: where it stands), turned `ry`, taking up `foot` (x0, z0, x1,
   *  z1, its height) times `s`; `f` the floor's frame. Null: not shown. */
  show(
    at: { x: number; z: number } | null,
    ry: number,
    foot: readonly [number, number, number, number, number],
    s: number,
    tone: keyof typeof COLOURS,
    f: { y: number },
  ) {
    if (!at) {
      this.root.visible = false;
      this.key = "";
      return;
    }
    this.root.visible = true;
    const k = `${at.x},${at.z},${ry},${foot},${s},${tone},${f.y}`;
    if (k === this.key) return;
    this.key = k;
    this.mat.color.setHex(COLOURS[tone]);
    const [x0, z0, x1, z1, h] = foot;
    this.root.position.set(at.x, terrainAt(at.x, at.z) + f.y, at.z);
    this.root.rotation.y = ry;
    this.box.scale.set(Math.max(0.1, (x1 - x0) * s), Math.max(0.1, h * s), Math.max(0.1, (z1 - z0) * s));
    this.box.position.set(((x0 + x1) / 2) * s, 0, ((z0 + z1) / 2) * s);
  }

  /** The thing itself in the box (its parts round where it stands, unturned), made again when
   *  `key` changes; null: the box alone. */
  setModel(key: string, make: (() => BufferGeometry[]) | null) {
    if (key === this.modelKey) return;
    this.modelKey = key;
    this.dropModel();
    if (!make) return;
    const g = new Group();
    for (const geo of make()) {
      const m = new Mesh(geo, this.modelMat);
      m.renderOrder = 20;
      g.add(m);
    }
    this.model = g;
    this.root.add(g);
  }
  private dropModel() {
    if (!this.model) return;
    this.root.remove(this.model);
    for (const m of this.model.children) (m as Mesh).geometry.dispose();
    this.model = null;
  }

  dispose() {
    this.dropModel();
    this.root.removeFromParent();
    this.box.geometry.dispose();
    this.mat.dispose();
    this.modelMat.dispose();
  }
}
