import { type HomeLotDef, lotGround, lotSign } from "@yutopia/shared";
import { HOME_LOTS, terrainAt } from "@yutopia/shared/grounds";
import type { Structure } from "@yutopia/shared/structure";
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";

// Home lots on the land (docs/plan/130-the-house-build.md, phase 1): a free lot staked out — white dashes along its
// edges, a peg at each corner — with a For Sale sign by its front; a claimed one's stakes shown only in build mode, to
// whoever builds there. Made again when the lots, their claims or build mode change (cheap: a few hundred boxes).

const DASH = 0.8;

export class HomeLots3 {
  readonly root = new Group();
  private sig = "";
  private readonly white = new MeshLambertMaterial({ color: 0xf4f4f0 });
  private readonly blue = new MeshLambertMaterial({ color: 0x2a84dc });
  private readonly mats: Material[] = [];

  constructor() {
    this.root.name = "home-lots";
  }

  /** Drawn as `st` has them: free lots staked with their signs; `build` the lot I'm building on (its stakes too). */
  update(st: Structure | null, build: string | null): void {
    const claimed = HOME_LOTS.map((l) => (st && lotGround(st, l.key) ? 1 : 0)).join("");
    const sig = `${JSON.stringify(HOME_LOTS)}|${claimed}|${build ?? ""}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.clear();
    for (const l of HOME_LOTS) {
      const free = !st || !lotGround(st, l.key);
      if (free) {
        this.stakes(l);
        this.sign(l);
      } else if (l.key === build) this.stakes(l);
    }
  }

  private add(m: Mesh) {
    m.castShadow = m.receiveShadow = true;
    this.root.add(m);
    return m;
  }
  private box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Material) {
    const m = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(m);
  }

  private stakes(l: HomeLotDef) {
    const ring: [number, number][] = [
      [l.x0, l.z0],
      [l.x1, l.z0],
      [l.x1, l.z1],
      [l.x0, l.z1],
    ];
    for (let i = 0; i < 4; i++) {
      const [p, q] = [ring[i], ring[(i + 1) % 4]];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = Math.floor(len / DASH);
      for (let k = 0; k < n; k += 2) {
        const a = k / n;
        const b = Math.min(1, (k + 1) / n);
        const [ax, az] = [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a];
        const [bx, bz] = [p[0] + (q[0] - p[0]) * b, p[1] + (q[1] - p[1]) * b];
        const y = terrainAt((ax + bx) / 2, (az + bz) / 2);
        const w = 0.09;
        this.box(
          Math.min(ax, bx) - w / 2,
          y + 0.01,
          Math.min(az, bz) - w / 2,
          Math.max(ax, bx) + w / 2,
          y + 0.06,
          Math.max(az, bz) + w / 2,
          this.white,
        );
      }
    }
    for (const [x, z] of ring) {
      const y = terrainAt(x, z);
      this.box(x - 0.05, y - 0.1, z - 0.05, x + 0.05, y + 0.5, z + 0.05, this.white);
      this.box(x - 0.06, y + 0.4, z - 0.06, x + 0.06, y + 0.52, z + 0.06, this.blue);
    }
  }

  private sign(l: HomeLotDef) {
    const s = lotSign(l);
    const y = terrainAt(s.x, s.z);
    // (drawn round its post, then turned to run along the lot's edge nearest it and set where it stands)
    const at = this.root.children.length;
    this.box(-0.05, y - 0.2, -0.05, 0.05, y + 1.9, 0.05, this.white);
    this.box(-0.05, y + 1.76, -0.05, 1.05, y + 1.85, 0.05, this.white);
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 320;
    const g = cv.getContext("2d");
    if (g) {
      g.fillStyle = "#fdfbf6";
      g.fillRect(0, 0, 512, 320);
      g.fillStyle = "#1f74cf";
      g.fillRect(0, 0, 512, 86);
      g.textAlign = "center";
      g.fillStyle = "#fff";
      g.font = "900 58px Nunito, system-ui, sans-serif";
      g.fillText("FOR SALE", 256, 64);
      g.fillStyle = "#123e6a";
      g.font = "900 56px Nunito, system-ui, sans-serif";
      g.fillText(l.name, 256, 170);
      g.font = "800 32px Nunito, system-ui, sans-serif";
      g.fillText(`${l.area ?? ""} · ${Math.round(l.x1 - l.x0)} × ${Math.round(l.z1 - l.z0)} m`, 256, 228);
      g.fillStyle = "#3fae3a";
      g.font = "900 32px Nunito, system-ui, sans-serif";
      g.fillText("FREE · CLAIM IT", 256, 290);
    }
    const t = new CanvasTexture(cv);
    t.colorSpace = SRGBColorSpace;
    const face = new MeshStandardMaterial({ map: t, roughness: 0.75 });
    this.mats.push(face);
    const b = this.add(
      new Mesh(new BoxGeometry(0.95, 0.6, 0.04), [this.white, this.white, this.white, this.white, face, face]),
    );
    b.position.set(0.55, y + 1.38, 0);
    b.rotation.y = Math.PI;
    const sg = new Group();
    for (const c of this.root.children.slice(at)) sg.add(c);
    sg.position.set(s.x, 0, s.z);
    sg.rotation.y = -s.yaw;
    this.root.add(sg);
  }

  private clear() {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      // (a sign's a group of its parts)
      c.traverse((o) => (o as Mesh).geometry?.dispose());
    }
    for (const m of this.mats) {
      (m as MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
    this.mats.length = 0;
  }

  dispose() {
    this.clear();
    this.white.dispose();
    this.blue.dispose();
  }
}
