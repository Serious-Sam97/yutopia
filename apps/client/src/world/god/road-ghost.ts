import { type P, smoothLine, terrainAt } from "@yutopia/shared/grounds";
import {
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
} from "three";

// A way as god mode's roads tool shows it (docs/plan/53-the-god-mode.md, phase 7; the mock
// 04-roads): its line smoothed as the generator will, a band as wide as it'll be, a dashed middle,
// a dot at each of its points, a ring where an end joins another way; the lamp's colour, red
// where it can't go (over what's anchored), over everything (a tool's, not the world's).

const AMBER = 0xf1d79a; // (the HUD's lamp: --amber)
const RED = 0xc8553f; // (--rust)
const GREEN = 0x8aa04a; // (--good)
const MAX_LINE = 1500;
const UP = 0.45;

type Frame = { x: number; z: number; y: number };

export class RoadGhost {
  readonly root = new Group();
  private readonly band: Mesh;
  private readonly middle: Line;
  // (both faces: the strip's winding is whichever way the line runs)
  private readonly bandMat = new MeshBasicMaterial({
    color: AMBER,
    transparent: true,
    opacity: 0.28,
    depthTest: false,
    side: DoubleSide,
  });
  private readonly lineMat = new LineDashedMaterial({
    color: AMBER,
    transparent: true,
    depthTest: false,
    dashSize: 2.4,
    gapSize: 1.6,
  });
  private readonly dotMat = new MeshBasicMaterial({ color: AMBER, depthTest: false, transparent: true });
  private readonly dotGeo = new CircleGeometry(0.9, 20).rotateX(-Math.PI / 2);
  private readonly dots: Mesh[] = [];
  private readonly join: Mesh;
  private key = "";

  constructor(scene: Scene) {
    const bg = new BufferGeometry();
    bg.setAttribute("position", new Float32BufferAttribute(new Float32Array(MAX_LINE * 6), 3));
    this.band = new Mesh(bg, this.bandMat);
    const lg = new BufferGeometry();
    lg.setAttribute("position", new Float32BufferAttribute(new Float32Array(MAX_LINE * 3), 3));
    this.middle = new Line(lg, this.lineMat);
    this.join = new Mesh(
      new RingGeometry(1.6, 2.2, 32).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: GREEN, depthTest: false, transparent: true }),
    );
    for (const o of [this.band, this.middle, this.join]) {
      o.renderOrder = 21;
      o.frustumCulled = false;
      this.root.add(o);
    }
    this.root.visible = false;
    scene.add(this.root);
  }

  /** The way through `pts` (the Grounds' coords), `w` m wide; red if `ok` is false; a ring at
   *  `joined` (an end on another way). Null: not shown. */
  show(pts: P[] | null, w: number, ok: boolean, joined: P | null, f: Frame) {
    if (!pts?.length) {
      this.root.visible = false;
      this.key = "";
      return;
    }
    this.root.visible = true;
    const k = `${JSON.stringify(pts)}|${w}|${ok}|${joined}|${f.x},${f.z},${f.y}`;
    if (k === this.key) return;
    this.key = k;
    const c = ok ? AMBER : RED;
    this.bandMat.color.setHex(c);
    this.lineMat.color.setHex(c);
    this.dotMat.color.setHex(c);
    const line = pts.length > 1 ? smoothLine(pts).slice(0, MAX_LINE) : pts;
    const y = (x: number, z: number) => terrainAt(x, z) + UP + f.y;
    // the band: a strip either side of the middle
    const bp = this.band.geometry.getAttribute("position") as Float32BufferAttribute;
    const idx: number[] = [];
    for (let i = 0; i < line.length; i++) {
      const [x, z] = line[i];
      const [ax, az] = line[Math.max(0, i - 1)];
      const [bx, bz] = line[Math.min(line.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / l) * (w / 2);
      const nz = ((bx - ax) / l) * (w / 2);
      bp.setXYZ(i * 2, x + nx - f.x, y(x + nx, z + nz), z + nz - f.z);
      bp.setXYZ(i * 2 + 1, x - nx - f.x, y(x - nx, z - nz), z - nz - f.z);
      if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    }
    bp.needsUpdate = true;
    this.band.geometry.setIndex(idx);
    this.band.geometry.setDrawRange(0, idx.length);
    const lp = this.middle.geometry.getAttribute("position") as Float32BufferAttribute;
    for (let i = 0; i < line.length; i++)
      lp.setXYZ(i, line[i][0] - f.x, y(line[i][0], line[i][1]) + 0.05, line[i][1] - f.z);
    lp.needsUpdate = true;
    this.middle.geometry.setDrawRange(0, line.length);
    this.middle.computeLineDistances();
    // a dot a point
    while (this.dots.length < pts.length) {
      const d = new Mesh(this.dotGeo, this.dotMat);
      d.renderOrder = 22;
      d.frustumCulled = false;
      this.root.add(d);
      this.dots.push(d);
    }
    for (const [i, d] of this.dots.entries()) {
      d.visible = i < pts.length;
      if (d.visible) d.position.set(pts[i][0] - f.x, y(pts[i][0], pts[i][1]) + 0.1, pts[i][1] - f.z);
    }
    this.join.visible = !!joined;
    if (joined) this.join.position.set(joined[0] - f.x, y(joined[0], joined[1]) + 0.1, joined[1] - f.z);
  }

  dispose() {
    this.root.removeFromParent();
    this.band.geometry.dispose();
    this.middle.geometry.dispose();
    this.dotGeo.dispose();
    (this.join.geometry as BufferGeometry).dispose();
    for (const m of [this.bandMat, this.lineMat, this.dotMat, this.join.material as MeshBasicMaterial]) m.dispose();
  }
}
