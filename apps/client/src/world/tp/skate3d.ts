import { parkPieces, TOWN_PARKS, type TownPark } from "@yutopia/shared/skate/parks";
import type { BufferGeometry } from "three";
import { Model } from "../furn/kit";
import type { KitMat } from "../furn/life-mats";
import { pieceGeometry } from "../furn/skate-piece";

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
