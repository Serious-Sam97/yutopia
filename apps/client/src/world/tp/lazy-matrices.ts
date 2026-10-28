// The scene's matrices made again only where something moved (Low and Lowest: the CPU's the
// limit there). three's own pass composes every object's matrix from its position, turn and
// scale and multiplies it into its parent's, every frame, ~9000 of them — most never move
// (the campus, the Grounds, the floors, the parked cars). Here each keeps what its matrix was
// made from; one whose inputs, matrix and parent are as they were is left as it is. The same
// matrices as three's, at a few compares an object — and a still model (view.stillModel:
// nothing on it moves) that hasn't moved isn't looked into at all.
import { Box3, type Matrix4, Object3D, type Quaternion, type Vector3 } from "three";

const base = Object3D.prototype.updateMatrixWorld;

// what an object's world matrix was made from (kept on it: one lookup, then the same shape for all)
class Kept {
  /** position, quaternion, scale — or, set by hand (not auto), the matrix */
  k: Float64Array;
  /** bumped each time its world matrix is made again (its children compare theirs) */
  v = 1;
  /** the parent it was made under, and that parent's `v` then */
  parent: Object3D | null = null;
  pv = -1;
  /** a still model's root (`seal`) */
  sealed = false;
  /** its world box (`gather`), as of world matrix `boxV`; null: its bounds can't be trusted */
  box: Box3 | null = null;
  boxV = 0;
  constructor(
    readonly o: Object3D,
    readonly p: Vector3,
    readonly q: Quaternion,
    readonly s: Vector3,
    readonly kids: Object3D[],
    /** a kind with its own pass (a camera, a skinned mesh) or a pivot: three's own, as it would */
    readonly own: boolean,
  ) {
    this.k = new Float64Array(o.matrixAutoUpdate ? 10 : 16);
  }
}

type Lz = Object3D & { _lz?: Kept; pivot?: unknown };

/** What the pass also gathers, on the way (tp/view.ts's below-cull): under `root`, every shown mesh
 *  and line whose world box's top is under `below` — into `out`, each thing then its box. */
export interface Gather {
  root: Object3D;
  below: number;
  out: (Object3D | Box3)[];
}
let G: Gather | null = null;

/** `scene`'s world matrices as three's `updateMatrixWorld()` would make them. */
export function lazyMatrices(root: Object3D, gather: Gather | null = null) {
  G = gather;
  try {
    step(root as Lz, false);
  } finally {
    G = null;
  }
}

/** A still model's root: while it doesn't move, nothing under it is looked at (view.stillModel). */
export function seal(root: Object3D) {
  const c = kept(root as Lz);
  c.sealed = true;
  c.pv = -3; // (looked into once more: what was merged into it is new)
}

function kept(o: Lz): Kept {
  let c = o._lz;
  if (!c) {
    c = new Kept(o, o.position, o.quaternion, o.scale, o.children, o.updateMatrixWorld !== base || !!o.pivot);
    o._lz = c;
  }
  return c;
}

function step(o: Lz, gathering: boolean) {
  const c = kept(o);
  const parent = o.parent as Lz | null;
  const pk = parent?._lz;
  let changed = o.matrixWorldNeedsUpdate || c.parent !== parent || (pk ? c.pv !== pk.v : parent !== null);
  const k = c.k;
  if (o.matrixAutoUpdate) {
    const p = c.p;
    const q = c.q;
    const s = c.s;
    if (k.length !== 10) {
      c.k = new Float64Array(10);
      return step(o, gathering);
    }
    if (
      changed ||
      k[0] !== p.x ||
      k[1] !== p.y ||
      k[2] !== p.z ||
      k[3] !== q.x ||
      k[4] !== q.y ||
      k[5] !== q.z ||
      k[6] !== q.w ||
      k[7] !== s.x ||
      k[8] !== s.y ||
      k[9] !== s.z
    ) {
      k[0] = p.x;
      k[1] = p.y;
      k[2] = p.z;
      k[3] = q.x;
      k[4] = q.y;
      k[5] = q.z;
      k[6] = q.w;
      k[7] = s.x;
      k[8] = s.y;
      k[9] = s.z;
      o.updateMatrix();
      changed = true;
    }
  } else {
    // (its matrix set by hand: three multiplied it in every frame)
    const e = o.matrix.elements;
    if (k.length !== 16) {
      c.k = new Float64Array(16);
      return step(o, gathering);
    }
    if (!changed)
      for (let i = 0; i < 16; i++)
        if (k[i] !== e[i]) {
          changed = true;
          break;
        }
    if (changed) k.set(e);
  }
  if (changed || c.v === 1) {
    if (o.matrixWorldAutoUpdate) {
      if (parent === null) o.matrixWorld.copy(o.matrix);
      else o.matrixWorld.multiplyMatrices(parent.matrixWorld, o.matrix as Matrix4);
    }
    o.matrixWorldNeedsUpdate = false;
    c.parent = parent;
    c.pv = pk ? pk.v : -1;
    c.v++;
  } else if (c.sealed) return;
  if (gathering) {
    if (!o.visible) gathering = false;
    else if ((o as { isMesh?: boolean }).isMesh || (o as { isLine?: boolean }).isLine) {
      if (c.boxV !== c.v) {
        c.boxV = c.v;
        c.box = boxOf(o, c.box);
      }
      const b = c.box;
      if (b && b.max.y <= (G as Gather).below) (G as Gather).out.push(o, b);
    }
  }
  const kids = c.kids;
  for (let i = 0, n = kids.length; i < n; i++) {
    const x = kids[i] as Lz;
    const xk = x._lz;
    if (xk ? xk.own : x.updateMatrixWorld !== base || !!x.pivot) {
      // (three's own: forced when this one moved, as three would — and a version for its children)
      x.updateMatrixWorld(c.v !== (xk?.pv ?? -2));
      const xc = kept(x);
      xc.pv = c.v;
      xc.parent = o;
    } else step(x, gathering || (G !== null && x === G.root && x.visible));
  }
}

// (as tp/view.ts's stillBox: none for what three doesn't cull by its box — particles, sprites,
// instances, skinned or unculled meshes —, their points move without the box knowing)
function boxOf(o: Object3D, into: Box3 | null): Box3 | null {
  let ok = true;
  o.traverse((x) => {
    const d = x as Object3D & {
      isMesh?: boolean;
      isLine?: boolean;
      isPoints?: boolean;
      isSprite?: boolean;
      isInstancedMesh?: boolean;
      isSkinnedMesh?: boolean;
    };
    if (d.isPoints || d.isSprite || d.isInstancedMesh || d.isSkinnedMesh) ok = false;
    else if ((d.isMesh || d.isLine) && !d.frustumCulled) ok = false;
  });
  if (!ok) return null;
  const b = (into ?? new Box3()).setFromObject(o);
  return b.isEmpty() ? null : b;
}
