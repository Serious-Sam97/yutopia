import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { paintSphere, type Q } from "../tables/ballart";

// The game tables in 3D (world/tables draws the same in iso): the pool balls
// (their numbers and stripes turning as the physics turns them), the cues —
// the shooter's along the aim, the others' standing by their players — the
// shooter's guideline and ghost ball, the called pocket, the billiard lamp over
// each table; the ping-pong ball and rackets.
// Positions: world tiles, z = height in tiles.

type V = [number, number, number];
export interface TableScene3 {
  balls: { key: string; id: number; x: number; y: number; z: number; r: number; q: Q; alpha: number }[];
  cues: { key: string; tip: V; butt: V }[];
  lines: { key: string; pts: V[]; color: number; alpha: number }[];
  rings: { key: string; x: number; y: number; z: number; r: number; color: number; alpha: number; face?: boolean }[];
  // thick lines (the ping-pong reach bar, a marker's drop to the floor)
  bars?: { key: string; a: V; b: V; r: number; color: number; alpha: number }[];
  lamps: { key: string; x: number; y: number; z: number; along: number; len: number; ghost: number }[];
  // a racket: its blade centre, the face normal and the blade's "up" (towards
  // its tip, away from the handle), three's world axes
  rackets: { key: string; x: number; y: number; z: number; n: V; up: V; rubber: number }[];
  // the ping-pong ball, its shadow on whatever's under it (z: that surface), its trail
  pongBalls: { key: string; x: number; y: number; z: number; shadowZ?: number; trail?: V[] }[];
}

const CUE_TIP_R = 0.0065; // m (× tpm on the way in: tiles)
const CUE_BUTT_R = 0.015;

export class TablesIn3D {
  readonly root = new Group();
  private balls = new Map<string, Mesh>();
  private cues = new Map<string, Group>();
  private lines = new Map<string, Line>();
  private rings = new Map<string, Mesh>();
  private bars = new Map<string, Mesh>();
  private lamps = new Map<string, Group>();
  private rackets = new Map<string, Group>();
  private pongBalls = new Map<string, Mesh>();
  private pongShadows = new Map<string, Mesh>();
  private pongTrails = new Map<string, Group>();
  private ballMats = new Map<number, MeshPhongMaterial>();
  private ballGeo = new SphereGeometry(1, 28, 18);

  constructor(private patch: (m: Material) => void) {}

  private ballMat(id: number) {
    let m = this.ballMats.get(id);
    if (!m) {
      const tex = new CanvasTexture(paintSphere(id));
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      m = new MeshPhongMaterial({ map: tex, shininess: 90, specular: 0x5a5a5a, transparent: true });
      this.patch(m);
      this.ballMats.set(id, m);
    }
    return m;
  }

  sync(s: TableScene3) {
    // the balls
    const seen = new Set<string>();
    for (const b of s.balls) {
      seen.add(b.key);
      let m = this.balls.get(b.key);
      if (!m) {
        m = new Mesh(this.ballGeo, this.ballMat(b.id));
        m.castShadow = true;
        m.receiveShadow = true;
        this.root.add(m);
        this.balls.set(b.key, m);
      }
      m.position.set(b.x, b.z, b.y);
      m.scale.setScalar(b.r);
      m.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      m.visible = b.alpha > 0.02;
    }
    this.prune(this.balls, seen);

    // cues
    const cueSeen = new Set<string>();
    for (const c of s.cues) {
      cueSeen.add(c.key);
      let g = this.cues.get(c.key);
      if (!g) {
        g = this.cue();
        this.root.add(g);
        this.cues.set(c.key, g);
      }
      const a = new Vector3(c.tip[0], c.tip[2], c.tip[1]);
      const b = new Vector3(c.butt[0], c.butt[2], c.butt[1]);
      const len = a.distanceTo(b);
      g.position.copy(a);
      g.scale.set(1, len, 1);
      // the stick runs along its local +y from the tip
      g.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.sub(a).normalize());
    }
    this.prune(this.cues, cueSeen);

    // the guideline
    const lineSeen = new Set<string>();
    for (const l of s.lines) {
      lineSeen.add(l.key);
      let line = this.lines.get(l.key);
      if (!line) {
        line = new Line(
          new BufferGeometry(),
          new LineBasicMaterial({ transparent: true, depthTest: true, toneMapped: false }),
        );
        line.renderOrder = 3;
        this.root.add(line);
        this.lines.set(l.key, line);
      }
      const pos: number[] = [];
      for (const p of l.pts) pos.push(p[0], p[2], p[1]);
      line.geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
      line.geometry.computeBoundingSphere();
      const mat = line.material as LineBasicMaterial;
      mat.color.setHex(l.color);
      mat.opacity = l.alpha;
    }
    this.prune(this.lines, lineSeen);

    // rings: the ghost ball, the called pocket
    const ringSeen = new Set<string>();
    for (const r of s.rings) {
      ringSeen.add(r.key);
      let m = this.rings.get(r.key);
      if (!m) {
        m = new Mesh(
          new RingGeometry(0.86, 1, 40),
          new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false, toneMapped: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 3;
        this.root.add(m);
        this.rings.set(r.key, m);
      }
      m.position.set(r.x, r.z, r.y);
      m.scale.setScalar(r.r);
      // a marker that faces the camera (it turns with it as it's drawn), or flat on the table
      if (r.face && !m.userData.face) {
        m.userData.face = true;
        m.onBeforeRender = (_r, _s, cam) => {
          m.quaternion.copy(cam.quaternion);
        };
      } else if (!r.face && m.userData.face) {
        m.userData.face = false;
        m.onBeforeRender = () => {};
        m.quaternion.identity();
        m.rotation.x = -Math.PI / 2;
      }
      const mat = m.material as MeshBasicMaterial;
      mat.color.setHex(r.color);
      mat.opacity = r.alpha;
    }
    this.prune(this.rings, ringSeen);

    // bars
    const barSeen = new Set<string>();
    for (const b of s.bars ?? []) {
      barSeen.add(b.key);
      let m = this.bars.get(b.key);
      if (!m) {
        m = new Mesh(
          new CylinderGeometry(1, 1, 1, 10, 1),
          new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
        );
        m.renderOrder = 3;
        this.root.add(m);
        this.bars.set(b.key, m);
      }
      const A = new Vector3(b.a[0], b.a[2], b.a[1]);
      const B = new Vector3(b.b[0], b.b[2], b.b[1]);
      const len = A.distanceTo(B) || 1e-3;
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.scale.set(b.r, len, b.r);
      m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), B.sub(A).normalize());
      const mat = m.material as MeshBasicMaterial;
      mat.color.setHex(b.color);
      mat.opacity = b.alpha;
    }
    this.prune(this.bars, barSeen);

    // the lamps
    const lampSeen = new Set<string>();
    for (const l of s.lamps) {
      lampSeen.add(l.key);
      let g = this.lamps.get(l.key);
      if (!g) {
        g = this.lamp(l.len);
        this.root.add(g);
        this.lamps.set(l.key, g);
      }
      g.position.set(l.x, l.z, l.y);
      g.rotation.y = -l.along;
      // looking straight down past it: out of the way altogether
      g.visible = l.ghost < 0.99;
      const op = 1 - l.ghost * 0.8;
      g.traverse((o) => {
        const m = (o as Mesh).material as Material | undefined;
        if (m) {
          m.transparent = op < 1;
          m.opacity = op;
          m.depthWrite = op >= 1;
        }
      });
    }
    this.prune(this.lamps, lampSeen);

    // ping-pong rackets and balls
    const rk = new Set<string>();
    for (const r of s.rackets) {
      rk.add(r.key);
      let g = this.rackets.get(r.key);
      if (!g) {
        g = this.racket(r.rubber);
        this.root.add(g);
        this.rackets.set(r.key, g);
      }
      g.position.set(r.x, r.z, r.y);
      g.scale.setScalar(1.25);
      // local z = the face, local y = up the blade
      const zA = new Vector3(...r.n).normalize();
      const yA = new Vector3(...r.up).normalize();
      const xA = new Vector3().crossVectors(yA, zA).normalize();
      g.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xA, yA, zA));
    }
    this.prune(this.rackets, rk);
    const pb = new Set<string>();
    for (const b of s.pongBalls) {
      pb.add(b.key);
      let m = this.pongBalls.get(b.key);
      if (!m) {
        // a bright, slightly self-lit ball (it must read against the table and the floor)
        const mat = new MeshPhongMaterial({ color: 0xfffaf0, emissive: 0x6b5c44, shininess: 40 });
        this.patch(mat);
        m = new Mesh(new SphereGeometry(1, 16, 12), mat);
        m.castShadow = true;
        this.root.add(m);
        this.pongBalls.set(b.key, m);
      }
      m.position.set(b.x, b.z, b.y);
      // bigger than true (a 4 cm ball has to read from behind the end), lit from within a little
      m.scale.setScalar(0.042 * 1.26);
      // its shadow: a dark blob on the table (or the floor) — how high it is, at a glance
      let sh = this.pongShadows.get(b.key);
      if (!sh) {
        sh = new Mesh(
          new CircleGeometry(1, 20),
          new MeshBasicMaterial({ color: 0x0c0806, transparent: true, depthWrite: false, toneMapped: false }),
        );
        sh.rotation.x = -Math.PI / 2;
        sh.renderOrder = 2;
        this.root.add(sh);
        this.pongShadows.set(b.key, sh);
      }
      const h = Math.max(0, b.z - (b.shadowZ ?? 0));
      sh.visible = b.shadowZ !== undefined;
      sh.position.set(b.x, (b.shadowZ ?? 0) + 0.004, b.y);
      sh.scale.setScalar(0.05 * (1 - Math.min(0.5, h * 0.4)));
      (sh.material as MeshBasicMaterial).opacity = 0.55 - Math.min(0.35, h * 0.3);
      // the trail: fading ghosts of the ball behind it (a comet you can follow)
      let tr = this.pongTrails.get(b.key);
      if (!tr) {
        tr = new Group();
        for (let k = 0; k < 6; k++) {
          const gm = new Mesh(
            new SphereGeometry(1, 10, 8),
            new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, toneMapped: false }),
          );
          tr.add(gm);
        }
        this.root.add(tr);
        this.pongTrails.set(b.key, tr);
      }
      const pts = b.trail ?? [];
      tr.children.forEach((o, k) => {
        const q = pts[pts.length - 2 - k];
        const gm = o as Mesh;
        gm.visible = !!q;
        if (!q) return;
        gm.position.set(q[0], q[2], q[1]);
        gm.scale.setScalar(0.042 * 1.26 * (0.85 - k * 0.11));
        (gm.material as MeshBasicMaterial).opacity = 0.42 - k * 0.065;
      });
    }
    this.prune(this.pongBalls, pb);
    this.prune(this.pongShadows, pb);
    this.prune(this.pongTrails, pb);
  }

  private prune<T extends { removeFromParent(): unknown }>(map: Map<string, T>, keep: Set<string>) {
    for (const [k, o] of map)
      if (!keep.has(k)) {
        o.removeFromParent();
        map.delete(k);
      }
  }

  // A two-piece cue, 1 long along +y from the tip (scaled to its length):
  // the blue chalked tip, the white ferrule, a maple shaft, the joint, the
  // dark butt with its rings and the rubber bumper.
  private cue(): Group {
    const g = new Group();
    const tpm = 1.55;
    const r0 = CUE_TIP_R * tpm;
    const r1 = CUE_BUTT_R * tpm;
    const part = (from: number, to: number, color: number, shiny = 30) => {
      const ra = r0 + (r1 - r0) * from;
      const rb = r0 + (r1 - r0) * to;
      const mat = new MeshPhongMaterial({ color, shininess: shiny, specular: 0x333333 });
      this.patch(mat);
      const m = new Mesh(new CylinderGeometry(rb, ra, to - from, 10, 1), mat);
      m.position.y = (from + to) / 2;
      m.castShadow = true;
      g.add(m);
    };
    part(0, 0.008, 0x3d6fa8);
    part(0.008, 0.026, 0xf4efe2, 60);
    part(0.026, 0.5, 0xe6cf9c, 40);
    part(0.5, 0.515, 0xc39a4a, 90);
    part(0.515, 0.6, 0x2a1810, 60);
    part(0.6, 0.61, 0xf4efe2, 60);
    part(0.61, 0.92, 0x5b2a1c, 70);
    part(0.92, 0.985, 0x1c1a17, 40);
    part(0.985, 1, 0x111111, 10);
    return g;
  }

  // The billiard lamp: three green glass shades on a walnut bar, chains up.
  private lamp(len: number): Group {
    const g = new Group();
    const wood = new MeshLambertMaterial({ color: 0x5b3a26 });
    const brass = new MeshPhongMaterial({ color: 0xc39a4a, shininess: 80 });
    const shade = new MeshPhongMaterial({ color: 0x2f6a4c, shininess: 60, side: DoubleSide });
    const inside = new MeshBasicMaterial({ color: 0xffe3b0, side: DoubleSide, toneMapped: false });
    for (const m of [wood, brass, shade]) this.patch(m);
    const bar = new Mesh(new CylinderGeometry(0.03, 0.03, len, 8), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.32;
    g.add(bar);
    for (const k of [-1, 0, 1]) {
      const x = (k * len) / 3;
      const s = new Mesh(new CylinderGeometry(0.07, 0.24, 0.2, 18, 1, true), shade);
      s.position.set(x, 0.12, 0);
      g.add(s);
      const glow = new Mesh(new CylinderGeometry(0.068, 0.232, 0.19, 18, 1, true), inside);
      glow.position.set(x, 0.12, 0);
      g.add(glow);
      const cap = new Mesh(new CylinderGeometry(0.035, 0.05, 0.06, 10), brass);
      cap.position.set(x, 0.25, 0);
      g.add(cap);
      const stem = new Mesh(new CylinderGeometry(0.008, 0.008, 0.08, 6), brass);
      stem.position.set(x, 0.29, 0);
      g.add(stem);
    }
    // two chains up to the ceiling
    for (const k of [-0.35, 0.35]) {
      const ch = new Mesh(new CylinderGeometry(0.006, 0.006, 2, 4), brass);
      ch.position.set(k * len, 1.32, 0);
      g.add(ch);
    }
    return g;
  }

  // A racket: a rounded blade (red rubber one side, black the other), the
  // wooden handle. Its face is local ±z, the handle along −y.
  private racket(rubber: number): Group {
    const g = new Group();
    const s = 1.26;
    const blade = 0.075 * s;
    const red = new MeshLambertMaterial({ color: rubber || 0xb3261e });
    const black = new MeshLambertMaterial({ color: 0x1c1a17 });
    const wood = new MeshLambertMaterial({ color: 0xd8b07a });
    for (const m of [red, black, wood]) this.patch(m);
    const face = (mat: Material, z: number) => {
      const m = new Mesh(new CylinderGeometry(blade, blade, 0.003 * s, 28), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(0, 0, z);
      m.scale.set(1, 1, 1.08);
      m.castShadow = true;
      g.add(m);
    };
    face(red, 0.003 * s);
    face(black, -0.003 * s);
    const edge = new Mesh(new CylinderGeometry(blade * 1.01, blade * 1.01, 0.004 * s, 28), wood);
    edge.rotation.x = Math.PI / 2;
    edge.position.set(0, 0, 0);
    g.add(edge);
    const handle = new Mesh(new CylinderGeometry(0.014 * s, 0.016 * s, 0.1 * s, 10), wood);
    handle.position.set(0, -blade - 0.045 * s, 0);
    handle.castShadow = true;
    g.add(handle);
    return g;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
