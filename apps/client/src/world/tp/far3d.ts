import { editsVersion, underfoot } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Fog,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  Vector4,
  type WebGLRenderer,
} from "three";
import type { Quality } from "@/lib/prefs";
import type { FarAsk, FarLandData } from "./far-land.worker";

// The far land (docs/plan/69-the-long-road.md L5, L6): past the near land (grounds-stream.ts, 440 m),
// the land out to the horizon in rings round the camera — 16 m a sample out to 2 km, 64 m to 8 km,
// 256 m to 24 km (High; fewer below) — the forest's canopy in its colour, and far trees out to
// 1.8 km. Worked out in a worker (far-land.worker.ts), made again as the camera moves on.
// Drawn first in the frame, after the sky: in its own projection (near 20 m, far 60 km — the near
// scene's depth untouched), in the scene's own haze (the same fog, its colour and reach), then the
// depth cleared for everything else: the near scene's always in front of it; it has no ink. A ring
// isn't drawn where the one inside it is now (`farHole`, each draw: the inner one's made again far
// more often — cut where it was when made, the seam opened behind you, overlapped ahead).

interface RingSpec {
  size: number;
  step: number;
}
const RINGS: Record<Quality, RingSpec[]> = {
  high: [
    { size: 4096, step: 16 },
    { size: 16384, step: 64 },
    { size: 49152, step: 256 },
  ],
  medium: [
    { size: 4096, step: 16 },
    { size: 16384, step: 64 },
  ],
  low: [
    { size: 4096, step: 32 },
    { size: 12288, step: 96 },
  ],
  lowest: [{ size: 8192, step: 64 }],
};
// (a cell a tree at most: past 500 m a tree's a few pixels — at 10 m, ~40k of them on High)
const TREES: Record<Quality, { r1: number; cell: number } | null> = {
  high: { r1: 1800, cell: 14 },
  medium: { r1: 1200, cell: 16 },
  low: null,
  lowest: null,
};
/** The near land's reach (grounds-stream.ts RADIUS): the far land's under it there. */
const NEAR = 440;

interface Ring {
  spec: RingSpec;
  mesh: Mesh | null;
  at: { x: number; z: number } | null;
  asked: boolean;
  /** the edits it was made under (grounds' editsVersion) */
  v: number;
  /** its own material (the one program): its own `farHole` */
  mat: MeshLambertMaterial;
  hole: { value: Vector4 };
}

export class FarLand {
  readonly root = new Group();
  private readonly mat: MeshLambertMaterial;
  private readonly treeMat: MeshLambertMaterial;
  private readonly u = {
    farProj: { value: new Matrix4() },
    hazeNear: { value: 120 },
    hazeFar: { value: 520 },
    hazeCol: { value: new Color() },
  };
  private readonly farCam = new PerspectiveCamera();
  private rings: Ring[] = [];
  private trees: InstancedMesh | null = null;
  private worker: Worker | null = null;
  private seq = 0;
  private waiting = new Map<number, (d: FarLandData) => void>();
  private quality: Quality = "high";
  private iced = false;
  private gone = false;

  constructor(
    private readonly treeGeo: BufferGeometry | null,
    private readonly edits: () => GroundsEdits | null,
  ) {
    this.mat = this.patch(new MeshLambertMaterial({ vertexColors: true }), "far-land");
    this.treeMat = this.patch(new MeshLambertMaterial({ vertexColors: true }), "far-trees");
    // (its depth cleared once it's drawn: the near scene in front of it, its own depth)
    const clear = new Mesh(new BufferGeometry(), this.mat);
    clear.geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    clear.renderOrder = -4;
    clear.frustumCulled = false;
    clear.onBeforeRender = (r: WebGLRenderer) => r.clearDepth();
    this.root.add(clear);
    this.setQuality("high");
  }

  /** Its own projection and the scene's haze, in its shaders. */
  private patch(
    m: MeshLambertMaterial,
    key: string,
    hole: { value: Vector4 } = { value: new Vector4(1, 0, 0, 0) },
  ): MeshLambertMaterial {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u, { farHole: hole });
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform mat4 farProj;\nvarying float vFarD;\nvarying vec2 vFarXZ;",
        )
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\ngl_Position = farProj * mvPosition;\nvFarD = length( mvPosition.xyz );\nvFarXZ = transformed.xz;",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float hazeNear;\nuniform float hazeFar;\nuniform vec3 hazeCol;\nuniform vec4 farHole;\nvarying float vFarD;\nvarying vec2 vFarXZ;",
        )
        .replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nif ( vFarXZ.x > farHole.x && vFarXZ.x < farHole.z && vFarXZ.y > farHole.y && vFarXZ.y < farHole.w ) discard;",
        )
        .replace(
          "#include <fog_fragment>",
          "gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeCol, smoothstep( hazeNear, hazeFar, vFarD ) );",
        );
    };
    m.customProgramCacheKey = () => key;
    return m;
  }

  setQuality(q: Quality) {
    if (q === this.quality && this.rings.length) return;
    this.quality = q;
    for (const r of this.rings) {
      this.drop(r.mesh);
      r.mat.dispose();
    }
    this.rings = RINGS[q].map((spec) => {
      // (the land not drawn: the inner ring's square, x0 z0 x1 z1 — none: x0 > x1)
      const hole = { value: new Vector4(1, 0, 0, 0) };
      const mat = this.patch(new MeshLambertMaterial({ vertexColors: true }), "far-land", hole);
      return { spec, mesh: null, at: null, asked: false, v: -1, mat, hole };
    });
    this.dropTrees();
  }
  private drop(m: Mesh | null) {
    if (!m) return;
    m.geometry.dispose();
    m.removeFromParent();
  }
  // (the trees' geometry is the near stream's own: only their instances freed)
  private dropTrees() {
    this.trees?.dispose();
    this.trees?.removeFromParent();
    this.trees = null;
  }

  private ask(a: Omit<FarAsk, "id" | "edits" | "v" | "iced">): Promise<FarLandData> {
    if (!this.worker) {
      this.worker = new Worker(new URL("./far-land.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<FarLandData>) => {
        const f = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        f?.(e.data);
      };
    }
    const id = ++this.seq;
    return new Promise((done) => {
      this.waiting.set(id, done);
      this.worker?.postMessage({ ...a, id, v: editsVersion, edits: this.edits(), iced: this.iced } satisfies FarAsk);
    });
  }

  /** The camera (the Grounds' coords): the rings made again round it as it moves on. */
  update(x: number, z: number) {
    if (this.gone) return;
    // (the lakes iced over or open again: drawn again, their colour the room's — iced only once
    // they're all but frozen over: nearer, the ice comes in from the shores, their middle open)
    const iced = underfoot().ice > 0.95;
    if (iced !== this.iced) {
      this.iced = iced;
      for (const r of this.rings) r.v = -1;
    }
    for (const [n, r] of this.rings.entries()) {
      const { size, step } = r.spec;
      // (again once it's gone a tenth of the ring's way from where it was made — the first, with the
      // far trees, every 80 m: none of them ever in the near land, drawn over it with no depth)
      // (and with god mode's edits laid again: what's grown seen from afar)
      const again = n === 0 ? 80 : size / 10;
      if (r.asked || (r.at && r.v === editsVersion && Math.hypot(x - r.at.x, z - r.at.z) < again)) continue;
      const cx = Math.round(x / (step * 4)) * step * 4;
      const cz = Math.round(z / (step * 4)) * step * 4;
      const v = editsVersion;
      r.asked = true;
      const tr = n === 0 ? TREES[this.quality] : null;
      void this.ask({
        x0: cx - size / 2,
        z0: cz - size / 2,
        n: size / step + 1,
        step,
        near: { cx: x, cz: z, r: NEAR },
        trees: tr ? { cx: x, cz: z, r0: NEAR + 80, r1: tr.r1, cell: tr.cell } : null,
      }).then((d) => {
        if (this.gone || !this.rings.includes(r)) return;
        r.asked = false;
        r.at = { x: cx, z: cz };
        r.v = v;
        this.drop(r.mesh);
        r.mesh = this.ringMesh(r, n, d);
        this.root.add(r.mesh);
        if (n === 0 && tr) this.treesFrom(d.trees);
      });
    }
  }

  private ringMesh(r: Ring, n: number, d: FarLandData): Mesh {
    const { size, step } = r.spec;
    const N = size / step + 1;
    const x0 = (r.at?.x ?? 0) - size / 2;
    const z0 = (r.at?.z ?? 0) - size / 2;
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        pos[k * 3] = x0 + i * step;
        pos[k * 3 + 1] = d.h[k];
        pos[k * 3 + 2] = z0 + j * step;
        // (sRGB bytes to three's linear)
        for (let q = 0; q < 3; q++) col[k * 3 + q] = (d.c[k * 3 + q] / 255) ** 2.2;
      }
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) {
        const p = j * N + i;
        idx.push(p, p + N, p + 1, p + 1, p + N, p + N + 1);
      }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new Mesh(g, r.mat);
    m.frustumCulled = false;
    m.renderOrder = -5;
    // (where the ring inside is now — a step in from its edge, the two a little over each other there)
    m.onBeforeRender = () => {
      const inner = this.rings[n - 1];
      const h = r.hole.value;
      if (!inner?.at || !inner.mesh) h.set(1, 0, 0, 0);
      else {
        const e = inner.spec.size / 2 - inner.spec.step;
        h.set(inner.at.x - e, inner.at.z - e, inner.at.x + e, inner.at.z + e);
      }
    };
    return m;
  }

  private treesFrom(t: Float32Array) {
    if (!this.treeGeo) return;
    this.dropTrees();
    const n = t.length / 4;
    const im = new InstancedMesh(this.treeGeo, this.treeMat, Math.max(1, n));
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const p = new Vector3();
    const s = new Vector3();
    for (let i = 0; i < n; i++) {
      q.setFromAxisAngle(up, (t[i * 4] * 7.3 + t[i * 4 + 2] * 3.1) % (Math.PI * 2));
      p.set(t[i * 4], t[i * 4 + 1], t[i * 4 + 2]);
      s.setScalar(t[i * 4 + 3] * 1.45);
      im.setMatrixAt(i, m.compose(p, q, s));
    }
    im.count = n;
    im.frustumCulled = false;
    im.renderOrder = -5;
    this.trees = im;
    this.root.add(im);
  }

  /** A frame: its projection from the camera's, its haze the scene fog's (hidden in the morning
   *  fog's wall and a storm: `seen` 0). */
  frame(camera: PerspectiveCamera, fog: Fog | null, seen: number) {
    this.root.visible = seen > 0.02 && !!fog;
    if (!fog || !this.root.visible) return;
    const c = this.farCam;
    c.fov = camera.fov;
    c.aspect = camera.aspect;
    c.zoom = camera.zoom;
    c.near = 20;
    c.far = 60000;
    c.updateProjectionMatrix();
    this.u.farProj.value.copy(c.projectionMatrix);
    this.u.hazeNear.value = fog.near;
    this.u.hazeFar.value = fog.far;
    this.u.hazeCol.value.copy(fog.color);
  }

  dispose() {
    this.gone = true;
    this.worker?.terminate();
    for (const r of this.rings) {
      this.drop(r.mesh);
      r.mat.dispose();
    }
    this.dropTrees();
    this.mat.dispose();
    this.treeMat.dispose();
    this.root.removeFromParent();
  }
}
