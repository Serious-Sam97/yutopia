import { terrainAt } from "@yutopia/shared/grounds";
import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, type Scene } from "three";

// A thing as god mode's things tool shows it (docs/plan/53-the-god-mode.md, phase 8; the mock
// 06-things): the box it takes up, on the land, turned; green where it can go, red where it
// can't, the lamp's colour for one picked; over everything (a tool's, not the world's).

const COLOURS = { ok: 0x8aa04a, no: 0xc8553f, picked: 0xf1d79a }; // (--good, --rust, --amber)

export class ThingGhost {
  readonly root = new Group();
  private readonly box: LineSegments;
  private readonly mat = new LineBasicMaterial({ color: COLOURS.ok, depthTest: false, transparent: true });
  private key = "";

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
    f: { x: number; z: number; y: number },
  ) {
    if (!at) {
      this.root.visible = false;
      this.key = "";
      return;
    }
    this.root.visible = true;
    const k = `${at.x},${at.z},${ry},${foot},${s},${tone},${f.x},${f.z},${f.y}`;
    if (k === this.key) return;
    this.key = k;
    this.mat.color.setHex(COLOURS[tone]);
    const [x0, z0, x1, z1, h] = foot;
    this.root.position.set(at.x - f.x, terrainAt(at.x, at.z) + f.y, at.z - f.z);
    this.root.rotation.y = ry;
    this.box.scale.set(Math.max(0.1, (x1 - x0) * s), Math.max(0.1, h * s), Math.max(0.1, (z1 - z0) * s));
    this.box.position.set(((x0 + x1) / 2) * s, 0, ((z0 + z1) / 2) * s);
  }

  dispose() {
    this.root.removeFromParent();
    this.box.geometry.dispose();
    this.mat.dispose();
  }
}
