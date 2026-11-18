import { entry, isFreeThing, type WorldObjectDef } from "@yutopia/shared";
import { Group, LOD, type Material, Matrix4, Mesh, type MeshStandardMaterial, type Object3D } from "three";
import { asset } from "@/lib/asset";
import { modelOf, placeOf } from "../furn/native";
import { loadLifeGLTF } from "../look/life-assets";
import { kitRenderer } from "./kit-mats";

// Plan 104 (docs/plan/104-the-skate-again.md F6a): the build menu's skate pieces (`sk_*`, furn/fam/skate.ts) drawn
// as Blender built them — the very GLBs of the parks' kit (tools/art/skate-parks, public/life/skate-parks/kind-*:
// each kind's riding face its piece's profile, in its footprint's frame), one placed where each thing is, as the
// chess men stand apart from their tables (tp/build.ts: the floor's merged buffers leave these out, their picks
// kept). Till a kind's model is in, its kit model (the same profile) stands in. Loaded with the first piece built.

const BASE = "/life/skate-parks/";
interface KindsManifest {
  kinds: Record<string, Record<string, { near: { file: string }; mid: { file: string } }>>;
}
let manifest: Promise<KindsManifest | null> | null = null;
function loadManifest(): Promise<KindsManifest | null> {
  manifest ??= fetch(asset(`${BASE}manifest.json`))
    .then((r) => (r.ok ? (r.json() as Promise<KindsManifest>) : null))
    .catch(() => null);
  return manifest;
}
const scenes = new Map<string, Promise<Group | null>>();
function scene(file: string): Promise<Group | null> {
  let p = scenes.get(file);
  if (!p) {
    const r = kitRenderer();
    p = !r
      ? Promise.resolve(null)
      : loadLifeGLTF(r, asset(BASE + file))
          .then((g) => {
            g.scene.traverse((o) => {
              const m = o as Mesh;
              if (!m.isMesh) return;
              m.castShadow = true;
              m.receiveShadow = true;
              m.geometry.userData.shared = true;
              (m.material as Material).userData.shared = true;
            });
            return g.scene as Group;
          })
          .catch(() => null);
    scenes.set(file, p);
  }
  return p;
}

/** A look's model: the wood or the concrete one, and what's tinted (the grey composite's face, a painted rail). */
function styleOf(o: WorldObjectDef): { style: string; tint: Record<string, number> } {
  const look = Number(o.props?.variant ?? 0) || 0;
  const rail = o.kind === "sk_rail" || o.kind === "sk_kinkrail";
  if (rail) return { style: "wood", tint: look === 1 ? { tube: 0x2f5f9a, galv: 0x2f5f9a } : {} };
  if (look === 2) return { style: "concrete", tint: {} };
  if (look === 1) return { style: "wood", tint: { masonite: 0x5d6268, mastop: 0x55595e, ply: 0x7d8c99 } };
  return { style: "wood", tint: {} };
}
const tinted = new Map<string, Material>();
function tint(root: Object3D, t: Record<string, number>) {
  if (!Object.keys(t).length) return;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MeshStandardMaterial;
    const name = mat.name.split(".")[0];
    const c = t[name];
    if (c === undefined) return;
    const key = `${name}|${c}`;
    let tm = tinted.get(key) as MeshStandardMaterial | undefined;
    if (!tm) {
      tm = mat.clone();
      tm.color.setHex(c);
      tm.userData.shared = true;
      tinted.set(key, tm);
    }
    m.material = tm;
  });
}

/** Where a thing's model goes in the floor's frame: placed as its kit model is (a free one turned about its
 *  middle, as tp/build.ts drawObject turns it). */
function matrixOf(o: WorldObjectDef): Matrix4 {
  if (!isFreeThing(o)) return placeOf(o);
  const e = entry(o.kind);
  const at = placeOf({ ...o, x: -e.w / 2, y: -e.h / 2, yaw: 0, props: { ...(o.props ?? {}), free: false } });
  return new Matrix4()
    .makeRotationY(-(o.yaw ?? 0))
    .setPosition(o.x, 0, o.y)
    .multiply(at);
}

const sigOf = (o: WorldObjectDef) =>
  `${o.kind}|${o.x}|${o.y}|${o.yaw ?? ""}|${o.props?.free ?? ""}|${o.props?.variant ?? 0}|${o.props?.level ?? ""}`;

export class SkateThings3 {
  readonly root = new Group();
  private items = new Map<string, { sig: string; g: Group }>();
  /** `stand`: the kit model's material while the GLB loads (the floor's lit). */
  constructor(private stand: Material) {
    this.root.name = "skate-things";
  }
  /** How many pieces are drawn (tests). */
  get drawn(): number {
    return this.items.size;
  }
  sync(objects: WorldObjectDef[]) {
    const seen = new Set<string>();
    for (const o of objects) {
      if (!o.kind.startsWith("sk_")) continue;
      seen.add(o.id);
      const sig = sigOf(o);
      const had = this.items.get(o.id);
      if (had?.sig === sig) continue;
      if (had) this.root.remove(had.g);
      const g = new Group();
      g.matrixAutoUpdate = false;
      g.matrix.copy(matrixOf(o));
      // (its kit model meanwhile)
      const stand = new Mesh(modelOf(o), this.stand);
      stand.castShadow = true;
      stand.receiveShadow = true;
      g.add(stand);
      this.root.add(g);
      g.updateMatrixWorld(true);
      this.items.set(o.id, { sig, g });
      const { style, tint: t } = styleOf(o);
      void loadManifest().then(async (man) => {
        const k = man?.kinds?.[o.kind]?.[style];
        if (!k) return;
        const [near, mid] = await Promise.all([scene(k.near.file), scene(k.mid.file)]);
        if (!near || this.items.get(o.id)?.g !== g) return;
        const lod = new LOD();
        const n = near.clone(true);
        tint(n, t);
        lod.addLevel(n, 0);
        if (mid) {
          const m = mid.clone(true);
          tint(m, t);
          lod.addLevel(m, 45);
        }
        g.remove(stand);
        g.add(lod);
        g.updateMatrixWorld(true);
      });
    }
    for (const [id, it] of this.items)
      if (!seen.has(id)) {
        this.root.remove(it.g);
        this.items.delete(id);
      }
  }
  dispose() {
    this.root.removeFromParent();
    this.items.clear();
  }
}

/** Are the pieces drawn here, apart from the floor's buffers (a renderer to load them through)? */
export const skateThingsApart = (): boolean => !!kitRenderer();
