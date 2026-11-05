import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import { type Footprints, printLeft } from "../../footprints";
import { litBalance } from "../light3d";
import type { ThirdPersonView } from "../view";

/** What Prints reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type PrintsHost = Pick<ThirdPersonView, "camera" | "level" | "renderer" | "scene">;

export class Prints {
  constructor(private readonly c: PrintsHost) {}

  // ── footprints in the snow (world/footprints.ts): one instanced mesh, fading ──
  prints: Footprints | null = null;

  printMesh: InstancedMesh | null = null;

  printLeftAttr: InstancedBufferAttribute | null = null;

  printVersion = -1;

  printFaded = 0;

  drawPrints(now: number) {
    const f = this.prints;
    if (!f) return;
    const N = 1600;
    // (made up front, its shader compiled then: not with the first print)
    if (!this.printMesh) {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 20;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      const grd = g.createRadialGradient(16, 10, 0, 16, 10, 15);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.7, "rgba(255,255,255,0.8)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(16, 10, 15, 9, 0, 0, Math.PI * 2);
      g.fill();
      const tex = new CanvasTexture(c);
      const mat = new MeshBasicMaterial({
        color: 0x5f7290,
        map: tex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aLeft;\nvarying float vLeft;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLeft = aLeft;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vLeft;")
          .replace("#include <opaque_fragment>", "diffuseColor.a *= vLeft;\n#include <opaque_fragment>");
      };
      const geo = new PlaneGeometry(0.2, 0.12).rotateX(-Math.PI / 2);
      this.printLeftAttr = new InstancedBufferAttribute(new Float32Array(N), 1);
      geo.setAttribute("aLeft", this.printLeftAttr);
      this.printMesh = new InstancedMesh(geo, mat, N);
      this.printMesh.frustumCulled = false;
      this.printMesh.renderOrder = 1;
      this.c.scene.add(this.printMesh);
      this.printMesh.count = 1;
      this.c.renderer.compile(this.printMesh, this.c.camera);
      this.printMesh.count = 0;
    }
    const on = this.c.level === 0 && f.list.length > 0;
    this.printMesh.visible = on;
    if (!on) return;
    // (a print is a shadow in the snow: in the pitch dark, as dark as what's round it)
    (this.printMesh.material as MeshBasicMaterial).color.setHex(0x5f7290).multiplyScalar(litBalance.lmSkyLeft.value);
    const fade = now - this.printFaded > 1000;
    if (f.version === this.printVersion && !fade) return;
    this.printVersion = f.version;
    this.printFaded = now;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const at = new Vector3();
    const left = this.printLeftAttr as InstancedBufferAttribute;
    const n = Math.min(N, f.list.length);
    for (let i = 0; i < n; i++) {
      const p = f.list[f.list.length - n + i];
      m.compose(at.set(p.x, p.z + 0.035, p.y), q.setFromAxisAngle(up, -p.a), one);
      this.printMesh.setMatrixAt(i, m);
      left.setX(i, printLeft(p, now));
    }
    this.printMesh.count = n;
    this.printMesh.instanceMatrix.needsUpdate = true;
    left.needsUpdate = true;
  }
}
