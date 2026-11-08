// Plan 73, phase 0b — a life-look person (tools/art/life/build_person.py's .glb) posed by our own rig:
// the file's armature gives only where each of our joints sits; the bones are made again as
// chars/model.ts makes them (unturned at rest, the person facing +z, its left +x), its meshes bound
// to them with their skin's joints renumbered into chars/rig.ts's JOINTS order (and the two eyes,
// EXTRA, after them). So any pose of ours — Locomotion's, the clips' — drives it as it drives today's
// people, and the gaze's blink and look (setFace, setEyes) too. (Dev only, for the mocks.)
import {
  Bone,
  type BufferAttribute,
  Color,
  DoubleSide,
  Group,
  Matrix3,
  Matrix4,
  type Mesh,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  type WebGLRenderer,
} from "three";
import { type Euler3, JOINTS, type JointName, PARENT, type Pose, REST } from "../chars/rig";
import { loadLifeGLTF } from "./life-assets";

// (the file's arms hang this far out from straight down — build_person.py ARM_OUT: all the way down
// pushed its shoulders up into pads — so each pose's shoulder takes it back first)
const ARM_OUT = (9 * Math.PI) / 180; // (build_person.py ARM_OUT: the two must agree)
const IN_L = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -ARM_OUT);
const IN_R = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), ARM_OUT);

/** Bones beyond chars/rig.ts's 31: each eye, under the head, turned by the gaze. */
const EXTRA = ["eyeL", "eyeR"] as const;
type BoneName = JointName | (typeof EXTRA)[number];
const ALL: readonly BoneName[] = [...JOINTS, ...EXTRA];
const parentOf = (b: BoneName): BoneName | null => (b === "eyeL" || b === "eyeR" ? "head" : PARENT[b as JointName]);
// how far the eyes turn at the gaze's ±1 (rad): across, and up or down
const EYE_YAW = 0.38;
const EYE_PITCH = 0.22;

export class LifePerson {
  readonly root = new Group();
  readonly bones = {} as Record<BoneName, Bone>;
  readonly meshes: SkinnedMesh[] = [];
  readonly restHips = new Vector3();
  height = 1.7;
  /** the hip joints' height, standing (PersonModel's baked hipY) */
  hipY = 0.9;

  /** How far to lower the person so a seated pose rests on a seat `seatY` high (as
   *  PersonModel.sitDrop: the thighs' undersides, ~8.5 cm under the hip joints, on the seat). */
  sitDrop(seatY: number): number {
    return seatY - (this.hipY - 0.085 * 0.92);
  }

  /** Pose the joints as PersonModel.setPose does (joints not named at REST; `lift` moves the hips). */
  setPose(p: Pose, lift: Euler3 = [0, 0, 0]) {
    for (const j of JOINTS) {
      const r = p[j] ?? REST[j];
      if (r) this.bones[j].rotation.set(r[0], r[1], r[2]);
      else this.bones[j].rotation.set(0, 0, 0);
    }
    this.bones.shoulderL.quaternion.multiply(IN_L);
    this.bones.shoulderR.quaternion.multiply(IN_R);
    const h = this.restHips;
    this.bones.hips.position.set(h.x + lift[0], h.y + lift[1], h.z + lift[2]);
  }

  /** The face's shapes, as PersonModel.setFace (blink, talk 0…1) and a smile. */
  setFace(blink: number, talk: number, smile = 0) {
    for (const m of this.meshes) {
      const d = m.morphTargetDictionary;
      const inf = m.morphTargetInfluences;
      if (!d || !inf) continue;
      if (d.blink !== undefined) inf[d.blink] = blink;
      if (d.talk !== undefined) inf[d.talk] = talk;
      if (d.smile !== undefined) inf[d.smile] = smile;
    }
  }

  /** Where the eyes look, as PersonModel.setEyes: x + to the person's left, y + up; −1…1. */
  setEyes(x: number, y: number) {
    for (const e of EXTRA) this.bones[e].rotation.set(-y * EYE_PITCH, x * EYE_YAW, 0);
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      const mat = m.material as MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  }
}

/** The look of each part, for the life style: skin with a soft warm sheen (the light catching it at
 *  the edges, as painted skin has), wet eyes that catch the sky, hair with a gentle shine. */
function finish(name: string, mat: MeshStandardMaterial, hasColour: boolean): MeshStandardMaterial {
  if (/body/.test(name)) {
    const skin = new MeshPhysicalMaterial({
      map: mat.map,
      vertexColors: hasColour,
      roughness: 0.52,
      metalness: 0,
      specularIntensity: 0.55,
      sheen: 0.55,
      sheenColor: new Color(1, 0.72, 0.62),
      sheenRoughness: 0.55,
      envMapIntensity: 0.9,
    });
    mat.dispose();
    return skin;
  }
  if (/eyes/.test(name)) {
    mat.roughness = 0.04;
    mat.envMapIntensity = 1.4;
  }
  if (/hair/.test(name)) {
    const hair = new MeshPhysicalMaterial({
      map: mat.map,
      roughness: 0.48,
      metalness: 0,
      sheen: 0.35,
      sheenColor: new Color(0.9, 0.8, 0.7),
      sheenRoughness: 0.4,
    });
    mat.dispose();
    return hair;
  }
  if (!/eyes|lashes|brows/.test(name)) mat.roughness = Math.max(mat.roughness, 0.75);
  return mat;
}

export async function loadLifePerson(url: string, renderer: WebGLRenderer): Promise<LifePerson> {
  // (KTX2 textures, meshopt geometry: the life loader, life-assets.ts)
  const gltf = await loadLifeGLTF(renderer, url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const person = new LifePerson();
  // where each joint is, standing: the file's bones' places
  const at = {} as Record<BoneName, Vector3>;
  let found: SkinnedMesh | null = null;
  scene.traverse((o: Object3D) => {
    if ((o as SkinnedMesh).isSkinnedMesh && !found) found = o as SkinnedMesh;
  });
  if (!found) throw new Error(`${url}: no skinned mesh`);
  const fileBones = (found as SkinnedMesh).skeleton.bones;
  for (const b of fileBones) {
    if ((ALL as readonly string[]).includes(b.name)) at[b.name as BoneName] = b.getWorldPosition(new Vector3());
  }
  for (const j of JOINTS) if (!at[j]) throw new Error(`${url}: no joint ${j}`);
  // (a file without eyes of their own: they sit in the head)
  for (const e of EXTRA) at[e] ??= at.head.clone();
  // our bones, unturned, each at its place from its parent's
  for (const j of ALL) {
    const b = new Bone();
    b.name = j;
    const parent = parentOf(j);
    b.position.copy(parent ? at[j].clone().sub(at[parent]) : at[j]);
    person.bones[j] = b;
    if (parent) person.bones[parent].add(b);
  }
  person.restHips.copy(at.hips);
  person.hipY = at.thighL.y;
  person.root.add(person.bones.hips);
  person.root.updateMatrixWorld(true);
  const skeleton = new Skeleton(ALL.map((j) => person.bones[j]));
  // the meshes, standing as they were drawn (their own place baked in), their joints renumbered
  let top = 0;
  scene.traverse((o: Object3D) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    // (the face's shapes are offsets: turned with the mesh, never moved)
    const turn = new Matrix3().setFromMatrix4(m.matrixWorld);
    for (const a of g.morphAttributes.position ?? []) (a as BufferAttribute).applyMatrix3(turn);
    const order = m.skeleton.bones.map((b) => (ALL as readonly string[]).indexOf(b.name));
    const si = g.getAttribute("skinIndex") as BufferAttribute;
    const idx = new Uint16Array(si.count * 4);
    for (let i = 0; i < si.count * 4; i++) idx[i] = Math.max(0, order[si.array[i] as number]);
    g.setAttribute("skinIndex", new Uint16BufferAttribute(idx, 4));
    g.computeBoundingBox();
    top = Math.max(top, g.boundingBox?.max.y ?? 0);
    const mat = finish(m.name, m.material as MeshStandardMaterial, !!g.getAttribute("color"));
    // hair and the eyes' corneas: cut out by their alpha, softly (alpha to coverage on the antialiased
    // frame: no sorting, no flicker on strands — a hard cut lost the ponytail's fine ends; the lashes
    // too: see-through, they vanished). Brows: truly see-through (to coverage's few steps they were
    // solid blocks); small, drawn last
    if (/hair|eyes|lashes/.test(m.name)) {
      mat.transparent = false;
      mat.alphaToCoverage = true;
      mat.alphaTest = 0.02;
      mat.depthWrite = true;
      if (/hair|lashes/.test(m.name)) mat.side = DoubleSide;
    } else if (/brows/.test(m.name)) {
      mat.transparent = true;
      mat.alphaTest = 0;
      mat.depthWrite = false;
      mat.side = DoubleSide;
    }
    const sm = new SkinnedMesh(g, mat);
    sm.name = m.name;
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    if (/brows/.test(m.name)) sm.renderOrder = 2;
    sm.updateMorphTargets();
    // (the shapes' names are the file's: GLTFLoader keeps them on its mesh, not the geometry)
    if (m.morphTargetDictionary) sm.morphTargetDictionary = { ...m.morphTargetDictionary };
    sm.bind(skeleton, new Matrix4());
    person.root.add(sm);
    person.meshes.push(sm);
  });
  person.height = top;
  person.setPose({});
  return person;
}

/** Every mesh of a three object (for counting what the person costs). */
export function trisOf(p: LifePerson): number {
  let n = 0;
  for (const m of p.meshes as Mesh[]) n += (m.geometry.index?.count ?? m.geometry.getAttribute("position").count) / 3;
  return Math.round(n);
}
