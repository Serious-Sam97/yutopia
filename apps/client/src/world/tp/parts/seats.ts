import { entry, type MapDef, placedFootprint, type WorldObjectDef } from "@yutopia/shared";
import { type Object3D, Quaternion } from "three";
import { isNative, seatMotion } from "../../furn/native";
import type { ThirdPersonView } from "../view";

/** What Seats reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type SeatsHost = Pick<ThirdPersonView, "time" | "world">;

export class Seats {
  constructor(private readonly c: SeatsHost) {}

  // What seat is on each tile (its catalog kind): a sitter's hips rest at its
  // cushion's height.
  seatKinds = new Map<number, string>();

  seatObjs = new Map<number, WorldObjectDef>();

  indexSeats(map: MapDef, objects: WorldObjectDef[]) {
    this.seatKinds.clear();
    this.seatObjs.clear();
    for (const o of objects) {
      if (!entry(o.kind).seat) continue;
      const { w, h } = placedFootprint(o);
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
          this.seatKinds.set((o.y + dy) * map.width + o.x + dx, o.kind);
          this.seatObjs.set((o.y + dy) * map.width + o.x + dx, o);
        }
    }
  }

  /** A sitter goes with a seat that moves while sat in (plan 68: the egg chair swivels, the rocking
   *  chair rocks, the hanging chair and the hammock sway — furn/native.ts seatMotion), turned about
   *  the same point by the same amount as its live part, this frame. Anyone else: upright. */
  rideSeat(root: Object3D, seat: WorldObjectDef | undefined) {
    // (the person sets only its heading each frame: a tilt from the seat is this frame's alone)
    if (root.rotation.x || root.rotation.z) root.rotation.set(0, root.rotation.y, 0);
    if (!seat || !isNative(seat.kind)) return;
    const m = seatMotion(seat, this.c.time);
    if (!m || !m.angle) return;
    const q = this.rideQ.setFromAxisAngle(m.axis, m.angle);
    const pivot = m.pivot.add(this.c.world.root.position);
    root.position.sub(pivot).applyQuaternion(q).add(pivot);
    root.quaternion.premultiply(q);
  }

  rideQ = new Quaternion();
}
