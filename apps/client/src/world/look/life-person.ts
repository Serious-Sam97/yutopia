// Plan 73 — a life-look person posed by our own rig (phase 0b; on life-people.ts since 4.2): a base's
// joints give where each bone sits; the bones are made again as chars/model.ts makes them (unturned at
// rest, the person facing +z, its left +x), its parts bound to them (their skin's joints already in
// chars/rig.ts's JOINTS order, the two eyes after). So any pose of ours — Locomotion's, the clips' —
// drives it as it drives today's people, and the gaze's blink and look (setFace, setEyes) too. The
// benches' person; the game's is PersonModel's (phase 4.3).
import type { AvatarLayers } from "@yutopia/shared";
import { Bone, Group, Matrix4, type Mesh, Quaternion, Skeleton, SkinnedMesh, Vector3, type WebGLRenderer } from "three";
import { type Euler3, JOINTS, type Pose, REST } from "../chars/rig";
import {
  ALL_BONES,
  ARM_OUT,
  type BoneName,
  EXTRA,
  EYE_PITCH,
  EYE_YAW,
  hasSoftEdge,
  type LifeBase,
  type LifeBody,
  type LifeGender,
  type LifeWorn,
  lifeBody,
  lifeWornOf,
  loadLifeBase,
  parentOf,
  softEdgeMaterial,
  softEdgeMesh,
} from "./life-people";

// (the file's arms hang this far out from straight down — build_person.py ARM_OUT: all the way down
// pushed its shoulders up into pads — so each pose's shoulder takes it back first)
export { ARM_OUT };
export const IN_L = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -ARM_OUT);
export const IN_R = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), ARM_OUT);
export { EYE_PITCH, EYE_YAW };

export class LifePerson {
  readonly root = new Group();
  readonly bones = {} as Record<BoneName, Bone>;
  readonly meshes: SkinnedMesh[] = [];
  readonly restHips = new Vector3();
  height = 1.7;
  /** the hip joints' height, standing (PersonModel's baked hipY) */
  hipY = 0.9;
  private body: LifeBody;

  constructor(
    readonly base: LifeBase,
    avatar: AvatarLayers | null = null,
    worn: LifeWorn | null = null,
  ) {
    this.body = lifeBody(base, avatar, worn);
    const b = this.body;
    for (const j of ALL_BONES) {
      const bone = new Bone();
      bone.name = j;
      bone.position.copy(b.rest[j]);
      this.bones[j] = bone;
      const p = parentOf(j);
      if (p) this.bones[p].add(bone);
    }
    this.restHips.copy(b.at.hips);
    this.hipY = b.hipY;
    this.height = b.height;
    this.root.add(this.bones.hips);
    this.root.updateMatrixWorld(true);
    const skeleton = new Skeleton(ALL_BONES.map((j) => this.bones[j]));
    for (const p of b.parts) {
      const sm = new SkinnedMesh(p.geometry, p.material);
      sm.name = p.name;
      sm.castShadow = true;
      sm.receiveShadow = true;
      sm.frustumCulled = false;
      if (p.name === "brows" || /beard/.test(p.name)) sm.renderOrder = 2;
      sm.updateMorphTargets();
      sm.morphTargetDictionary = { ...p.morphs };
      sm.bind(skeleton, new Matrix4());
      this.root.add(sm);
      this.meshes.push(sm);
      // (plan 74 phase 1: hair and lashes, their soft edge a second draw)
      if (hasSoftEdge(p.name)) softEdgeMesh(sm, softEdgeMaterial(p.material));
    }
    this.setMorph("slim", b.morph.slim);
    this.setMorph("broad", b.morph.broad);
    this.setPose({});
  }

  private setMorph(k: string, v: number) {
    for (const m of this.meshes) {
      const i = m.morphTargetDictionary?.[k];
      if (i !== undefined && m.morphTargetInfluences) m.morphTargetInfluences[i] = v;
    }
  }

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
    this.setMorph("blink", blink);
    this.setMorph("talk", talk);
    this.setMorph("smile", smile);
  }

  /** The build alone (the benches: slim, regular, broad), as an avatar's `body` sets it. */
  setBody(body: string) {
    this.setMorph("slim", body === "slim" ? 1 : 0);
    this.setMorph("broad", body === "broad" ? 1 : 0);
  }

  /** Where the eyes look, as PersonModel.setEyes: x + to the person's left, y + up; −1…1. */
  setEyes(x: number, y: number) {
    for (const e of EXTRA) this.bones[e].rotation.set(-y * EYE_PITCH, x * EYE_YAW, 0);
  }

  /** Its own (this avatar's materials); the base's geometry and textures stay for others. */
  dispose() {
    this.body.dispose();
  }
}

/** A person from a file (the benches): its gender from its name; dressed as `avatar` if given. */
export async function loadLifePerson(
  url: string,
  renderer: WebGLRenderer,
  avatar: AvatarLayers | null = null,
  worn: Pick<LifeWorn, "names" | "pattern"> | null = null,
): Promise<LifePerson> {
  const gender: LifeGender = /woman/.test(url) ? "woman" : "man";
  const base = await loadLifeBase(url, renderer, gender);
  const w = worn ? await lifeWornOf(base, worn.names, renderer, worn.pattern) : null;
  return new LifePerson(base, avatar, w);
}

/** Every mesh of a three object (for counting what the person costs). */
export function trisOf(p: LifePerson): number {
  let n = 0;
  for (const m of p.meshes as Mesh[]) n += (m.geometry.index?.count ?? m.geometry.getAttribute("position").count) / 3;
  return Math.round(n);
}
