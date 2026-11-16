import { type Inventory, weaponIn } from "@yutopia/shared/inventory";
import { WORN } from "@yutopia/shared/worn";
import type { Player } from "./schema.ts";

/** What she holds and wears, for everyone to see, from what's equipped — her quick slots (plans 80–85): the gun out
 *  of her hand once it isn't in one (dropped; moved to the pack — plan 85 F3a, put away at once); the revolver's
 *  holster on her hip; the long guns slung on her back (their pouches with them, on everyone's screen). A weapon only
 *  in the pack shows nowhere (plan 85). No inventory known yet: nothing worn, the hand as it is. */
export function wear(p: Player, inv: Inventory | null | undefined): void {
  // (the cue's off a pool table, not out of the pockets: features/pballs.ts)
  if (p.gun && p.gun !== "cue" && inv && !weaponIn(inv, p.gun)) p.gun = "";
  // (plan 87) the torch lights only from her left hand: moved, dropped — out
  if (p.torch && inv && inv.hand?.id !== "torch") p.torch = false;
  const on = (id: string) => !!inv && !!weaponIn(inv, id);
  // (plan 80) the revolver: its holster on the hip; (plans 81–84) the long guns: slung on the back — the
  // double-barrel; the AK, mirrored; the sniper on the AK's diagonal, over it; the Daybreak upright, over the others
  const worn =
    (on("revolver") ? WORN.holster : 0) |
    (on("shotgun") ? WORN.sling : 0) |
    (on("ak47") ? WORN.slingAk : 0) |
    (on("sniper") ? WORN.slingSn : 0) |
    (on("daybreak") ? WORN.slingDb : 0);
  if (p.worn !== worn) p.worn = worn;
}
