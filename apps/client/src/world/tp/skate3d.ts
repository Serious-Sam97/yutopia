import { parkPieces, TOWN_PARKS, type TownPark } from "@yutopia/shared/skate/parks";
import { RACK_BOARDS, RACK_SLOTS, SKATE_RACKS, type SkateRack } from "@yutopia/shared/skate/racks";
import type { BoardVariant } from "@yutopia/shared/skate/spec";
import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { Model } from "../furn/kit";
import type { KitMat } from "../furn/life-mats";
import { pieceGeometry } from "../furn/skate-piece";
import { BoardObj } from "../skate/board3d";

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
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new Mesh(UNIT_BOX, RACK_STEEL);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  // (its posts, the bar the boards lean on, the rail at their tails — 1.7 m wide, behind them to the south)
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
