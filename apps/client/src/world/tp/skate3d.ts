import { parkPieces, TOWN_PARKS, type TownPark } from "@yutopia/shared/skate/parks";
import { RACK_BOARDS, RACK_SLOTS, SKATE_RACKS, type SkateRack } from "@yutopia/shared/skate/racks";
import type { BoardVariant } from "@yutopia/shared/skate/spec";
import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  LOD,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import { asset } from "@/lib/asset";
import { Model } from "../furn/kit";
import type { KitMat } from "../furn/life-mats";
import { pieceGeometry } from "../furn/skate-piece";
import { loadLifeGLTF } from "../look/life-assets";
import { BoardObj } from "../skate/board3d";
import { kitRenderer } from "./kit-mats";

// Plan 103 F7c (docs/plan/103-the-skate.md): the town's two skate parks drawn with the Grounds (tp/grounds3d.ts
// `skateParks`, this module loaded when its step comes — the skate's profiles stay off the page): every piece of
// shared skate/parks.ts TOWN_PARKS from its own profile (furn/skate-piece.ts, as the build menu's are), in the
// world's frame (x east, y up, z the Grounds' z). The hall's masonite faces on birch-ply sides, the outdoor park's
// poured concrete; galvanised coping, edges and rails. A park's geometry a bucket each: its face, its body, its
// steel (the Grounds give each its material).

export type SkateSlot = "face" | "side" | "steel";
export const SKATE_SLOTS: SkateSlot[] = ["face", "side", "steel"];
/** Each park's finish: its paint and (the life look's kit) material a slot. */
export const PARK_FINISH: Record<"indoor" | "outdoor", Record<SkateSlot, [number, KitMat]>> = {
  indoor: { face: [0x7b644c, "plain"], side: [0xd6b88c, "birch"], steel: [0xa9b1bb, "metal-brushed"] },
  outdoor: { face: [0xcfcac0, "matte"], side: [0xc2bdb2, "matte"], steel: [0xa9b1bb, "metal-brushed"] },
};

/** A park's pieces, a geometry a slot (null: none), in the world's frame. */
export function skateParkGeometry(p: TownPark): Record<SkateSlot, BufferGeometry | null> {
  const fin = PARK_FINISH[p.indoor ? "indoor" : "outdoor"];
  const models: Record<SkateSlot, Model> = { face: new Model(2), side: new Model(2), steel: new Model(2) };
  const any: Record<SkateSlot, boolean> = { face: false, side: false, steel: false };
  for (const [i, pc] of parkPieces(p).entries()) {
    const rel = p.pieces[i].z;
    const [c, s] = [Math.cos(pc.yaw), Math.sin(pc.yaw)];
    const g = pieceGeometry(pc.kind, {
      to: (u, w, z) => [pc.x + u * c - w * s, pc.z + z, pc.y + u * s + w * c],
      width: pc.width,
      // (a stair set's treads and its rail stood up off the floor: their sides and posts down to it)
      base: -rel,
    });
    for (const k of SKATE_SLOTS)
      for (const x of g[k]) {
        models[k].add(x, fin[k][0], { mat: fin[k][1] });
        any[k] = true;
      }
  }
  return {
    face: any.face ? models.face.geometry() : null,
    side: any.side ? models.side.geometry() : null,
    steel: any.steel ? models.steel.geometry() : null,
  };
}

/** The parks (their keys, rectangles, indoors or not). */
export const PARKS = TOWN_PARKS;

// ── plan 104 (docs/plan/104-the-skate-again.md F6a): the parks as Blender built them (tools/art/skate-parks →
// public/life/skate-parks/: each park's ramps from the board's own profiles, the hall inside and out, the racks;
// near and mid) — the procedural ones above till they're in, or with no renderer to load them ──

interface Glb {
  file: string;
  tris: number;
  bytes: number;
}
interface ParksManifest {
  parks: Record<string, { origin: [number, number, number]; near: Glb; mid: Glb }>;
  hall: {
    origin: [number, number, number];
    in: { near: Glb; mid: Glb };
    out: { near: Glb; mid: Glb };
    lights: [number, number, number][];
    glow: Record<string, string>;
  };
  racks: Record<string, Glb>;
  snow: string[];
}
const BASE = "/life/skate-parks/";
let manifest: Promise<ParksManifest | null> | null = null;
function parksManifest(): Promise<ParksManifest | null> {
  manifest ??= fetch(asset(`${BASE}manifest.json`))
    .then((r) => (r.ok ? (r.json() as Promise<ParksManifest>) : null))
    .catch(() => null);
  return manifest;
}
/** Can the parks' models load here (a renderer to read their textures through)? */
export const parksLoadable = (): boolean => !!kitRenderer();

const scenes = new Map<string, Promise<Group | null>>();
/** One GLB's scene, loaded once (everything in it shared: the Grounds' rebuilds dispose none of it). */
function glbScene(file: string): Promise<Group | null> {
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
              m.geometry.userData.shared = true;
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              for (const x of mats) x.userData.shared = true;
            });
            return g.scene as Group;
          })
          .catch(() => null);
    scenes.set(file, p);
  }
  return p;
}

/** What the Grounds do with a model's materials: the night's glow (its windows, its sign), the snow's kind. */
export interface ParkHooks {
  glow?: (m: MeshStandardMaterial, on: number, kind: string) => void;
}
const seen = new WeakSet<Material>();
/** A loaded model's materials readied once: outdoors the concrete dusted as the ways are, indoors no snow; the
 *  windows and the lit sign dark by day (the night lights them through `glow`). */
function ready(root: Object3D, outdoor: boolean, man: ParksManifest, hooks: ParkHooks) {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of mats) {
      const name = x.name.split(".")[0];
      const glow = man.hall?.glow?.[name];
      // (see-through and lit: no shadows of their own)
      if (x.transparent || name === "tube_lit" || name === "skylight") m.castShadow = false;
      if (seen.has(x)) continue;
      seen.add(x);
      x.userData.wx = outdoor ? (man.snow.includes(name) ? "way" : undefined) : "none";
      if (!x.userData.wx) delete x.userData.wx;
      if (glow && x instanceof MeshStandardMaterial) {
        x.emissiveIntensity = 0;
        hooks.glow?.(x, name === "winglow" ? 1.0 : 1.4, glow);
      }
    }
  });
}

/** A model near and mid (three's LOD, swapping at `far` m), in a group at `origin` — filled when they're in. */
function lodModel(near: Glb, mid: Glb | null, origin: [number, number, number], far: number, then: (g: Group) => void) {
  const g = new Group();
  g.position.set(...origin);
  void Promise.all([glbScene(near.file), mid ? glbScene(mid.file) : Promise.resolve(null)]).then(([n, m]) => {
    if (!n) return;
    const lod = new LOD();
    lod.addLevel(n.clone(true), 0);
    if (m && mid && mid.file !== near.file) lod.addLevel(m.clone(true), far);
    g.add(lod);
    then(g);
  });
  return g;
}

/** A park's ramps, built (an empty group till they're in; `onReady` when they are, false if they won't come). */
export function parkModel(key: string, outdoor: boolean, hooks: ParkHooks, onReady?: (ok: boolean) => void): Group {
  const g = new Group();
  g.name = `skate-park-${key}`;
  void parksManifest().then((man) => {
    const p = man?.parks?.[key];
    if (!man || !p) return onReady?.(false);
    g.add(
      lodModel(p.near, p.mid, p.origin, 70, (m) => {
        ready(m, outdoor, man, hooks);
        onReady?.(true);
      }),
    );
  });
  return g;
}

/** The hall inside or out, built (an empty group till it's in). */
export function hallModel(which: "in" | "out", hooks: ParkHooks): Group {
  const g = new Group();
  g.name = `skate-hall-${which}`;
  void parksManifest().then((man) => {
    const h = man?.hall;
    if (!man || !h) return;
    const lv = h[which];
    g.add(lodModel(lv.near, lv.mid, h.origin, 90, (m) => ready(m, which === "out", man, hooks)));
  });
  return g;
}

// ── the racks (plan 103 F10a): a galvanised frame against the wall, three boards stood on their tails in it, the
// grip facing the park — the boards themselves (the Blender GLBs: skate/board3d.ts) ──
const RACK_STEEL = new MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.38, metalness: 0.85 });
RACK_STEEL.userData.shared = true;
// (one box for every bar, scaled: the Grounds' rebuilds dispose nothing of it)
const UNIT_BOX = new BoxGeometry(1, 1, 1);
UNIT_BOX.userData.shared = true;
const _basis = new Matrix4();
const _lean = new Quaternion();
export function rackGroup(r: SkateRack): Group {
  const g = new Group();
  g.name = `skate-${r.id}`;
  g.position.set(r.x, r.y, r.z);
  // (plan 104: its frame as built — the hall's a shop's wall rack, the yard's galvanised; till it's in, or with
  // nothing to load it: posts, the bar the boards lean on, the rail at their tails, 1.7 m wide, behind them south)
  const plain = new Group();
  g.add(plain);
  const style = r.id === "rack:hall" ? "hall" : "yard";
  if (parksLoadable())
    void parksManifest().then(async (man) => {
      const f = man?.racks?.[style];
      const s = f ? await glbScene(f.file) : null;
      if (!s || !man) return;
      const m = s.clone(true);
      ready(m, style === "yard", man, {});
      g.remove(plain);
      g.add(m);
    });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new Mesh(UNIT_BOX, RACK_STEEL);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    plain.add(m);
  };
  for (const x of [-0.85, 0.85]) box(0.05, 1.0, 0.05, x, 0.5, 0.18);
  box(1.75, 0.04, 0.04, 0, 0.72, 0.18);
  box(1.75, 0.04, 0.04, 0, 0.12, 0.02);
  const boards = RACK_BOARDS[r.id] ?? [];
  boards.forEach((b, i) => {
    const o = new BoardObj(b.variant as BoardVariant);
    // the nose up, the grip to the north (the park), the deck leant back on the bar
    _basis.makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, -1), new Vector3(-1, 0, 0));
    o.root.quaternion.setFromRotationMatrix(_basis);
    _lean.setFromAxisAngle(new Vector3(1, 0, 0), 0.2);
    o.root.quaternion.premultiply(_lean);
    o.root.position.set(RACK_SLOTS[i] ?? 0, 0.37, 0.1);
    g.add(o.root);
  });
  return g;
}
export { SKATE_RACKS };
