import { isLifeKit } from "./kit";

/** (the furniture tests) how many times the classic kit's triangle limits the life look's kit may draw:
 *  plan 73 phase 6's rounded boxes and a cushion's cuts across for its sag — 27.9k the most measured (a
 *  ladder bookcase's books, each one rounded), 17.3k a bus shelter, 14.2k a slot track (2026-11-10); the
 *  world's frames with them measured in phases 6 and 11. */
export const TRIS_X = isLifeKit() ? 4 : 1;
/** What one thing's model may draw: 8k triangles in the classic kit, ×TRIS_X in the life look's. */
export const MAX_TRIS = 8000 * TRIS_X;
