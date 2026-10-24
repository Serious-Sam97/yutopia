// What my own floor hides (docs/plan/38-the-lag.md, round 2): the floors below mine, the
// stairwells and lift stops on them, are under my floor's floor — an opaque slab at its
// level over every floor tile but the stairwells' wells. From a camera above that level, a
// thing wholly below it shows only where a line from the camera to it crosses the level
// off the slab: down a well, or past the building's edge (out of a window, from outside).
// Each candidate's box is projected from the camera onto the level; if every tile it lands
// on is slab, nothing of it can be seen, and the main pass leaves it out. The sun's shadow
// still has it (a shadow cast by it onto the ground outside shows from a window): it goes
// onto a layer the main pass doesn't draw but the shadow pass does (the camera takes that
// layer for the shadow pass only: tp/view.ts), for that one render, and back after.
import { type Box3, type Camera, type Mesh, type Object3D, Vector3 } from "three";

export const HIDDEN_LAYER = 2; // (drawn into the shadows only: the main pass skips it)

export interface Slab {
  /** where tile (0, 0)'s corner is in the world (x, level's height, z) */
  at: Vector3;
  w: number;
  h: number;
  /** the slab is drawn on this tile (opaque, at the level) */
  covers(x: number, y: number): boolean;
}

export interface Shell {
  /** a sight line could leave the floor by this tile below the walls' top (a well, a window…) */
  bad(x: number, y: number): boolean;
  /** the walls' top over the level (tiles) */
  top: number;
}

export class BelowCull {
  private open: Int32Array | null = null; // summed table of tiles NOT covered
  private out: Int32Array | null = null; // summed table of tiles not floor (outside the walls)
  private bad: Int32Array | null = null; // summed table of tiles a line may leave the floor by
  private top = 0;
  private shellKey: unknown = null;
  /** walls see-through this frame (faded: plan boxes, tiles) — no help hiding anything */
  faded: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private w = 0;
  private h = 0;
  private origin = new Vector3();
  private slabKey: unknown = null;
  private hidden: Object3D[] = [];
  private q = new Vector3();
  private corner = new Vector3();
  /** what was left out of the last render (tests, the overlay) */
  count = 0;

  /** My floor's slab (null: none drawn yet — nothing is left out). `key` changes with it. */
  setSlab(slab: Slab | null, key: unknown) {
    if (key === this.slabKey && (slab ? this.open : !this.open)) {
      if (slab) this.origin.copy(slab.at);
      return;
    }
    this.slabKey = key;
    if (!slab) {
      this.open = null;
      return;
    }
    const { w, h } = slab;
    const t = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        t[(y + 1) * (w + 1) + x + 1] =
          (slab.covers(x, y) ? 0 : 1) + t[y * (w + 1) + x + 1] + t[(y + 1) * (w + 1) + x] - t[y * (w + 1) + x];
    this.open = t;
    this.w = w;
    this.h = h;
    this.origin.copy(slab.at);
  }

  /** My floor's walls (null: the slab alone). `key` changes with them. */
  setShell(shell: Shell | null, key: unknown, isOut: (x: number, y: number) => boolean) {
    if (key === this.shellKey && (shell ? this.bad : !this.bad)) return;
    this.shellKey = key;
    if (!shell || !this.open) {
      this.bad = null;
      this.out = null;
      return;
    }
    this.top = shell.top;
    this.bad = this.table((x, y) => shell.bad(x, y));
    this.out = this.table(isOut);
  }

  private table(f: (x: number, y: number) => boolean): Int32Array {
    const w = this.w;
    const t = new Int32Array((w + 1) * (this.h + 1));
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < w; x++)
        t[(y + 1) * (w + 1) + x + 1] =
          (f(x, y) ? 1 : 0) + t[y * (w + 1) + x + 1] + t[(y + 1) * (w + 1) + x] - t[y * (w + 1) + x];
    return t;
  }

  // any marked tile in [x0..x1] × [y0..y1] (off the map counts as marked)
  private any(t: Int32Array, x0: number, y0: number, x1: number, y1: number): boolean {
    if (x0 < 0 || y0 < 0 || x1 >= this.w || y1 >= this.h) return true;
    const W = this.w + 1;
    return t[(y1 + 1) * W + x1 + 1] - t[y0 * W + x1 + 1] - t[(y1 + 1) * W + x0] + t[y0 * W + x0] > 0;
  }
  private anyOpen(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.any(this.open as Int32Array, x0, y0, x1, y1);
  }

  // the box's corners seen from the eye, where their lines cross the height `lv`: their plan bounds
  private bounds = { x0: 0, z0: 0, x1: 0, z1: 0 };
  private across(eye: Vector3, box: Box3, lv: number) {
    const b = this.bounds;
    b.x0 = b.z0 = Number.POSITIVE_INFINITY;
    b.x1 = b.z1 = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 8; i++) {
      const c = this.corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      );
      const k = (eye.y - lv) / (eye.y - c.y);
      const q = this.q.copy(c).sub(eye).multiplyScalar(k).add(eye);
      if (q.x < b.x0) b.x0 = q.x;
      if (q.x > b.x1) b.x1 = q.x;
      if (q.z < b.z0) b.z0 = q.z;
      if (q.z > b.z1) b.z1 = q.z;
    }
    return b;
  }

  /** Is every point of `box` (world) hidden from `eye` by my floor (its slab, its walls)? */
  hides(eye: Vector3, box: Box3): boolean {
    if (!this.open) return false;
    const lv = this.origin.y;
    // (wholly below the level, with room to spare; the eye above it)
    if (box.max.y > lv - 0.02 || eye.y < lv + 0.3) return false;
    const e = 0.01;
    const ox = this.origin.x;
    const oz = this.origin.z;
    // the slab: every line crosses the level on it (a box's projection lies inside its
    // corners' hull, inside their bounds)
    const q = this.across(eye, box, lv);
    const qx0 = Math.floor(q.x0 - e - ox);
    const qz0 = Math.floor(q.z0 - e - oz);
    const qx1 = Math.floor(q.x1 + e - ox);
    const qz1 = Math.floor(q.z1 + e - oz);
    if (!this.anyOpen(qx0, qz0, qx1, qz1)) return true;
    // the walls: each line starts down from over the floor (where it crosses the walls' top
    // height — or at the eye, under it) and, between there and the level, passes only tiles
    // with no way out: whatever it crosses there is solid wall below its top, or the slab
    if (!this.bad || !this.out) return false;
    const h = Math.min(this.top, eye.y - lv - e);
    const r = this.across(eye, box, lv + h);
    const rx0 = Math.floor(r.x0 - e - ox);
    const rz0 = Math.floor(r.z0 - e - oz);
    const rx1 = Math.floor(r.x1 + e - ox);
    const rz1 = Math.floor(r.z1 + e - oz);
    if (this.any(this.out, rx0, rz0, rx1, rz1)) return false;
    const x0 = Math.min(qx0, rx0);
    const z0 = Math.min(qz0, rz0);
    const x1 = Math.max(qx1, rx1);
    const z1 = Math.max(qz1, rz1);
    if (this.any(this.bad, x0, z0, x1, z1)) return false;
    // (a wall faded see-through there: no help)
    for (const f of this.faded)
      if (f.x1 >= x0 + ox && f.x0 <= x1 + 1 + ox && f.y1 >= z0 + oz && f.y0 <= z1 + 1 + oz) return false;
    return true;
  }

  /** Before the main render: what's hidden is switched off — three then skips it, its whole
   *  subtree, as it collects what to draw. Its shadow pass comes after that collection: there
   *  it's switched back on (`shadowPass`), so every shadow is as it was. A thing with a light
   *  in it is never switched off (the light would leave the scene's lighting). */
  begin(eye: Camera, units: Iterable<{ obj: Object3D; box: Box3 }>) {
    this.count = 0;
    if (!this.open) return;
    const at = eye.getWorldPosition(this.q.clone());
    for (const u of units) {
      const o = u.obj;
      if (!o.visible || hasLight(o) || !this.hides(at, u.box)) continue;
      o.visible = false;
      this.hidden.push(o);
      this.count++;
    }
  }

  /** Also left out of this render (known hidden some other way: a card's back turned away). */
  hideAlso(o: Object3D) {
    if (!o.visible || hasLight(o)) return;
    o.visible = false;
    this.hidden.push(o);
    this.count++;
  }

  /** The shadow pass starts (true: all of it on again) or ends (false: off again). */
  shadowPass(on: boolean) {
    for (const o of this.hidden) o.visible = on;
  }

  /** After the render: everything back as it was. */
  end() {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
}

// does it hold a light (lights are looked up once: a model's lights are made with it)
const lit = new WeakMap<Object3D, boolean>();
function hasLight(o: Object3D): boolean {
  let v = lit.get(o);
  if (v === undefined) {
    v = false;
    o.traverse((x) => {
      if ((x as { isLight?: boolean }).isLight) v = true;
    });
    lit.set(o, v);
  }
  return v;
}

// A mesh's box, in its parent's space (its matrix as it is: still meshes keep theirs).
const local = new WeakMap<Object3D, Box3>();
export function boxInParent(m: Mesh, out: Box3): Box3 | null {
  let b = local.get(m);
  if (!b) {
    const g = m.geometry;
    if (!g) return null;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox || g.boundingBox.isEmpty()) return null;
    b = g.boundingBox.clone();
    local.set(m, b);
  }
  if (m.matrixAutoUpdate) {
    // (it may turn — the cards face the camera — : round it, wide enough for any turn about y)
    const c = b.getCenter(out.min);
    const r = b.getSize(out.max).length() / 2 + Math.hypot(c.x, c.z);
    const p = m.position;
    out.min.set(p.x - r, p.y + b.min.y - 0.01, p.z - r);
    out.max.set(p.x + r, p.y + b.max.y + 0.01, p.z + r);
    if (m.scale.x !== 1 || m.scale.y !== 1 || m.scale.z !== 1 || m.rotation.x || m.rotation.z) return null;
    return out;
  }
  return out.copy(b).applyMatrix4(m.matrix);
}
