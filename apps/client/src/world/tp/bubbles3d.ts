import { BufferAttribute, BufferGeometry, type Object3D, Points, PointsMaterial, type Vector3 } from "three";

// Bubbles off anyone under the water (docs/plan/66-the-water.md, S8): a few a second from the head,
// rising and wobbling, gone at the surface or in a few seconds. One small pool of points for all of
// them, re-used.
const MAX = 96;

export class Bubbles {
  private readonly pos = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX); // s left (0: free)
  private readonly top = new Float32Array(MAX); // the surface over it (the scene's)
  private readonly seed = new Float32Array(MAX);
  private readonly geo = new BufferGeometry();
  private readonly pts: Points;
  private next = 0;
  private due = new Map<string, number>();

  constructor(parent: Object3D) {
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setDrawRange(0, MAX);
    const m = new PointsMaterial({ color: 0xcfe9ea, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false });
    this.pts = new Points(this.geo, m);
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -1e5;
  }

  /** Someone under the water this frame: their head (the scene's), the surface over them. */
  emit(id: string, head: Vector3, level: number, dt: number) {
    const t = (this.due.get(id) ?? 0) - dt;
    if (t > 0) {
      this.due.set(id, t);
      return;
    }
    this.due.set(id, 0.12 + Math.random() * 0.35);
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = head.x + (Math.random() - 0.5) * 0.15;
    this.pos[i * 3 + 1] = head.y;
    this.pos[i * 3 + 2] = head.z + (Math.random() - 0.5) * 0.15;
    this.life[i] = 3;
    this.top[i] = level;
    this.seed[i] = Math.random() * 6.28;
  }

  /** On a frame: up they go. */
  step(dt: number, t: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const y = this.pos[i * 3 + 1] + dt * (0.6 + 0.2 * Math.sin(this.seed[i]));
      if (this.life[i] <= 0 || y >= this.top[i]) {
        this.life[i] = 0;
        this.pos[i * 3 + 1] = -1e5;
        continue;
      }
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3] += Math.sin(t * 4 + this.seed[i]) * dt * 0.08;
    }
    (this.geo.getAttribute("position") as BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.pts.removeFromParent();
    this.geo.dispose();
    (this.pts.material as PointsMaterial).dispose();
  }
}
