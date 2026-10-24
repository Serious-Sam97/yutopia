// Still pieces drawn merged, one mesh per material (docs/plan/38-the-lag.md).
//
// Draws are what an indoor 3D frame is made of: every mesh is one (twice with the sun's
// shadow), and the stairwells, the lifts, the floors' walls and the parked cars are built
// of hundreds of small ones. Pieces that never move, never change material and never hide
// on their own are drawn the same merged: their triangles where they stand, one mesh per
// material and shadow settings. What moves (doors, wheels), switches (lit buttons) or is
// see-through (drawn in order with what's behind it) stays as it was.
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type Side,
} from "three";

const plain = new Mesh().onBeforeRender;
const IDENTITY = new Matrix4();

// a mesh that may be drawn merged: plain, opaque, one material, nothing hanging off it
function mergeable(m: Mesh, root: Object3D): boolean {
  return (
    !!m.isMesh &&
    !(m as { isSkinnedMesh?: boolean }).isSkinnedMesh &&
    !(m as { isInstancedMesh?: boolean }).isInstancedMesh &&
    !Array.isArray(m.material) &&
    !m.material.transparent &&
    !m.morphTargetInfluences &&
    m.onBeforeRender === plain &&
    m.frustumCulled &&
    m.layers.mask === root.layers.mask &&
    !m.children.length
  );
}

// `list` grouped by material, shadows and attributes; each group of two or more drawn as one
// mesh added to `into` (`xf`: a mesh's matrix into `into`, or null: its points as they are).
// Returns the new meshes and the ones that went into them.
function mergeGroups(
  list: Mesh[],
  into: Object3D,
  xf: ((m: Mesh) => Matrix4) | null,
): { meshes: Mesh[]; used: Mesh[] } {
  const groups = new Map<string, Mesh[]>();
  for (const m of list) {
    const attrs = Object.keys(m.geometry.attributes).sort().join(",");
    const key = `${(m.material as { uuid: string }).uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${attrs}`;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(m);
  }
  const meshes: Mesh[] = [];
  const used: Mesh[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const geos = g.map((m) => {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.clearGroups();
      const t = xf?.(m);
      if (t && !t.equals(IDENTITY)) geo.applyMatrix4(t);
      return geo;
    });
    const one = concat(geos);
    for (const geo of geos) geo.dispose();
    if (!one) continue;
    one.computeBoundingSphere();
    const first = g[0];
    const mesh = new Mesh(one, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.name = "still";
    into.add(mesh);
    meshes.push(mesh);
    used.push(...g);
  }
  return { meshes, used };
}

// gone for good: out of the scene, their geometry freed unless something left still draws it
function drop(root: Object3D, gone: Mesh[]) {
  for (const m of gone) m.removeFromParent();
  const kept = new Set<BufferGeometry>();
  root.traverse((o) => {
    if ((o as Mesh).isMesh) kept.add((o as Mesh).geometry);
  });
  for (const m of gone) if (!kept.has(m.geometry)) m.geometry.dispose();
}

const ownMatrix = (m: Mesh) => {
  m.updateMatrix();
  return m.matrix;
};

/** Merges the still meshes that are `root`'s own children (not those in `keep`; nothing
 *  inside a group — a group may be moved). Returns how many meshes went into merged ones. */
export function mergeStatic(root: Object3D, keep: Iterable<Object3D> = []): number {
  const kept = new Set(keep);
  const list = root.children.filter((c) => !kept.has(c) && c.visible && mergeable(c as Mesh, root)) as Mesh[];
  const { used } = mergeGroups(list, root, ownMatrix);
  drop(root, used);
  return used.length;
}

/** The given meshes drawn as one mesh per material and shadow settings in `into`'s space
 *  (`xf`: a mesh's matrix into it), added to `into`; the originals are left as they are —
 *  `used` says which went in (hide them). See-through ones, and ones alone with their
 *  material, aren't merged. */
export function mergeWith(meshes: Mesh[], into: Object3D, xf: (m: Mesh) => Matrix4): { meshes: Mesh[]; used: Mesh[] } {
  return mergeGroups(
    meshes.filter((m) => mergeable(m, into)),
    into,
    xf,
  );
}

/** The given meshes (each `into`'s own child) drawn as one mesh per material and shadow
 *  settings, added to `into`; the originals are left as they are (hide them). See-through
 *  ones (merged, they'd blend in another order), and ones alone with their material,
 *  aren't merged. */
export function mergeMeshes(meshes: Mesh[], into: Object3D): Mesh[] {
  const list = meshes.filter((m) => m.parent === into && mergeable(m, into));
  return mergeGroups(list, into, ownMatrix).meshes;
}

// Non-indexed geometries one after the other, attribute by attribute (what three's
// mergeGeometries does for these, without pulling its module into this chunk: ~12 KB).
// null if they don't line up (another attribute, size, type or morphs).
function concat(geos: BufferGeometry[]): BufferGeometry | null {
  const first = geos[0];
  const names = Object.keys(first.attributes);
  for (const g of geos) {
    if (g.index || Object.keys(g.morphAttributes).length) return null;
    if (Object.keys(g.attributes).length !== names.length) return null;
    for (const n of names) {
      const a = g.getAttribute(n) as BufferAttribute | undefined;
      const b = first.getAttribute(n) as BufferAttribute;
      if (!a?.isBufferAttribute || a.itemSize !== b.itemSize || a.normalized !== b.normalized) return null;
      if (a.array.constructor !== b.array.constructor) return null;
    }
  }
  const out = new BufferGeometry();
  for (const n of names) {
    const b = first.getAttribute(n) as BufferAttribute;
    let len = 0;
    for (const g of geos) len += (g.getAttribute(n) as BufferAttribute).array.length;
    const Arr = b.array.constructor as Float32ArrayConstructor;
    const arr = new Arr(len);
    let at = 0;
    for (const g of geos) {
      const src = (g.getAttribute(n) as BufferAttribute).array as Float32Array;
      arr.set(src, at);
      at += src.length;
    }
    out.setAttribute(n, new BufferAttribute(arr, b.itemSize, b.normalized));
  }
  return out;
}

/** A model that stands still from now on (a parked car): its meshes that already sit at its
 *  origin — every group between them and `root` at its origin too — merged one mesh per
 *  material and shadow settings, their points kept to the bit (shaders that work from a
 *  mesh's own coordinates, like a car's wear, see the same numbers). Fewer meshes to draw and
 *  fewer nodes for every pass to walk. Nothing in `keep` is touched. */
export function mergeStill(root: Object3D, keep: Iterable<Object3D> = []): number {
  const kept = new Set(keep);
  const found: Mesh[] = [];
  const walk = (o: Object3D) => {
    for (const c of o.children) {
      if (kept.has(c) || !c.visible) continue;
      c.updateMatrix();
      if (!c.matrix.equals(IDENTITY)) continue;
      if ((c as Mesh).isMesh) {
        if (mergeable(c as Mesh, root)) found.push(c as Mesh);
      } else walk(c);
    }
  };
  walk(root);
  const { used } = mergeGroups(found, root, null);
  drop(root, used);
  return used.length;
}

/** A still model's shadow drawn in a few draws (docs/plan/38-the-lag.md): the meshes under
 *  `root` that cast one (not those in `keep`, nor inside them) give their triangles — where
 *  they stand in the model — to one shadow-only mesh per shadow side, on a layer only the
 *  shadow pass draws (below-cull.ts' HIDDEN_LAYER), and stop casting themselves. The shadow
 *  map holds the same triangles from the sun; a mesh three draws into it some other way
 *  (alpha-tested, displaced, clipped, its own depth material) keeps casting as it was. */
export function shadowProxy(root: Object3D, layer: number, keep: Iterable<Object3D> = []): number {
  const kept = new Set(keep);
  const groups = new Map<number, { geos: BufferGeometry[]; meshes: Mesh[] }>();
  const rel = new Matrix4();
  const walk = (o: Object3D) => {
    for (const c of o.children) {
      if (kept.has(c) || !c.visible) continue;
      const m = c as Mesh & { customDepthMaterial?: unknown };
      if (m.isMesh && m.castShadow && !Array.isArray(m.material)) {
        const mat = m.material as Material & {
          map?: unknown;
          alphaMap?: unknown;
          displacementMap?: unknown;
          displacementScale?: number;
          wireframe?: boolean;
        };
        const special =
          (mat.alphaTest > 0 && (mat.map || mat.alphaMap)) ||
          (mat.displacementMap && mat.displacementScale !== 0) ||
          mat.alphaToCoverage ||
          (mat.clippingPlanes?.length ?? 0) > 0 ||
          mat.wireframe ||
          !mat.visible ||
          !!m.customDepthMaterial ||
          (m as { isSkinnedMesh?: boolean }).isSkinnedMesh ||
          (m as { isInstancedMesh?: boolean }).isInstancedMesh ||
          !!m.morphTargetInfluences ||
          m.layers.mask !== root.layers.mask;
        if (!special) {
          const side = mat.shadowSide ?? ({ 0: 1, 1: 0, 2: 2 } as Record<number, number>)[mat.side];
          let g = groups.get(side);
          if (!g) {
            g = { geos: [], meshes: [] };
            groups.set(side, g);
          }
          rel.identity();
          for (let x: Object3D | null = m; x && x !== root; x = x.parent) {
            x.updateMatrix();
            rel.premultiply(x.matrix);
          }
          const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
          const geo = new BufferGeometry();
          geo.setAttribute("position", (src.getAttribute("position") as BufferAttribute).clone());
          if (src !== m.geometry) src.dispose();
          if (!rel.equals(IDENTITY)) geo.applyMatrix4(rel);
          g.geos.push(geo);
          g.meshes.push(m);
        }
      }
      walk(c);
    }
  };
  walk(root);
  let n = 0;
  for (const [side, g] of groups) {
    const one = concat(g.geos);
    for (const geo of g.geos) geo.dispose();
    if (!one) continue;
    one.computeBoundingSphere();
    // (its material only sets the side the depth pass draws: the shadow side as it was)
    const proxy = new Mesh(
      one,
      new MeshBasicMaterial({ side: side === 1 ? FrontSide : side === 0 ? BackSide : DoubleSide }),
    );
    (proxy.material as Material).shadowSide = side as Side;
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    proxy.layers.set(layer);
    proxy.name = "shadow";
    proxy.userData.from = g.meshes; // (what it casts for: tests swap them back)
    root.add(proxy);
    for (const m of g.meshes) m.castShadow = false;
    n += g.meshes.length;
  }
  // (its parts that cast nothing now: the shadow pass need not walk them — tp/view.ts)
  if (n) {
    const casts = (o: Object3D) => {
      let any = false;
      o.traverse((x) => {
        if ((x as Mesh).isMesh && x.castShadow) any = true;
      });
      return any;
    };
    root.userData.shadowSkip = root.children.filter((c) => c.name !== "shadow" && !casts(c));
    PROXIED.add(root);
  }
  return n;
}

/** The models with shadow proxies (their `userData.shadowSkip`: parts the shadow pass can skip). */
export const PROXIED = new Set<Object3D>();
