import { BackSide, DoubleSide, FrontSide, type Material, Mesh, type Object3D } from "three";

// A see-through two-sided material is drawn by three in two passes, back faces then front — its side flipped and
// marked changed for each, so every such draw has its shader worked out again (the program's parameters, its key:
// docs/plan/90-the-friends-machines.md phase 4 — a parked car's glass, 114 of them in the lot every frame). Here the
// same two passes as two meshes, each with a material of its own side that never changes: the back faces' mesh,
// then right after it — the same place, so the same depth, and made after, so drawn after — the front faces'.
// For what stands still and keeps its materials as they are (a parked car: Culling.stillModel).

const twins = new WeakMap<Material, { back: Material; front: Material }>();

function sided(m: Material, side: typeof BackSide | typeof FrontSide): Material {
  const c = m.clone();
  c.side = side;
  // (what clone leaves behind: the shader's own pieces and their key)
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  c.userData = { ...m.userData };
  // (its shadow cast as the two-sided one's, were it to cast one)
  c.shadowSide = m.shadowSide ?? DoubleSide;
  return c;
}

const twoPass = (m: Material) => m.transparent && m.side === DoubleSide && !m.forceSinglePass;

/** Each mesh under `root` drawn in three's two passes, as two meshes. Returns how many were split. */
export function splitTwoPass(root: Object3D): number {
  const found: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || Array.isArray(m.material) || !twoPass(m.material)) return;
    if ((m as { isSkinnedMesh?: boolean }).isSkinnedMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh)
      return;
    if (m.morphTargetInfluences || m.children.length) return;
    found.push(m);
  });
  for (const m of found) {
    const mat = m.material as Material;
    let t = twins.get(mat);
    if (!t) {
      t = { back: sided(mat, BackSide), front: sided(mat, FrontSide) };
      twins.set(mat, t);
    }
    const front = new Mesh(m.geometry, t.front);
    front.name = m.name;
    front.position.copy(m.position);
    front.quaternion.copy(m.quaternion);
    front.scale.copy(m.scale);
    front.matrix.copy(m.matrix);
    front.matrixAutoUpdate = m.matrixAutoUpdate;
    front.renderOrder = m.renderOrder;
    front.castShadow = false;
    front.receiveShadow = m.receiveShadow;
    front.frustumCulled = m.frustumCulled;
    front.layers.mask = m.layers.mask;
    front.visible = m.visible;
    front.userData = { ...m.userData, twoPassFront: true };
    m.material = t.back;
    const parent = m.parent;
    if (!parent) continue;
    // (right after it among its parent's children: drawn after it where the depth's the same)
    parent.add(front);
    const kids = parent.children;
    kids.splice(kids.indexOf(front), 1);
    kids.splice(kids.indexOf(m) + 1, 0, front);
  }
  return found.length;
}
