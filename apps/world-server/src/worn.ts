import { type Inventory, weaponIn } from "@yutopia/shared/inventory";
import type { Player } from "./schema.ts";

/** What she holds and wears, for everyone to see, from what's equipped — her quick slots (plans 80–85): the gun out
 *  of her hand once it isn't in one (dropped; moved to the pack — plan 85 F3a, put away at once); the revolver's
 *  holster on her hip; the long guns slung on her back (their pouches with them, on everyone's screen). A weapon only
 *  in the pack shows nowhere (plan 85). No inventory known yet: nothing worn, the hand as it is. */
export function wear(p: Player, inv: Inventory | null | undefined): void {
  // (the cue's off a pool table, not out of the pockets: features/pballs.ts)
  if (p.gun && p.gun !== "cue" && inv && !weaponIn(inv, p.gun)) p.gun = "";
  const on = (id: string) => !!inv && !!weaponIn(inv, id);
  // (plan 80) the revolver: its holster on the hip
  const holster = on("revolver");
  if (p.holster !== holster) p.holster = holster;
  // (plan 81) the double-barrel: slung on the back
  const sling = on("shotgun");
  if (p.sling !== sling) p.sling = sling;
  // (plan 82) the AK: slung on the back, mirrored
  const slingAk = on("ak47");
  if (p.slingAk !== slingAk) p.slingAk = slingAk;
  // (plan 83) the sniper: slung on the AK's diagonal, over it
  const slingSn = on("sniper");
  if (p.slingSn !== slingSn) p.slingSn = slingSn;
  // (plan 84) the Daybreak: upright down the back, the lens down, over the others
  const slingDb = on("daybreak");
  if (p.slingDb !== slingDb) p.slingDb = slingDb;
}
