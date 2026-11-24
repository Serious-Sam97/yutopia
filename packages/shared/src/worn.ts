/** What she wears of her guns, for everyone to see (plans 80–84), one byte on the Player (`worn`) — five booleans
 *  once, folded into it 2026-11-16: the Player had 65 fields, and Colyseus sends only 64 (a field's index shares its
 *  byte with the operation: the 65th, sent, read as "delete field 0" — everyone's sid "" on every screen). */
export const WORN = {
  /** (plan 80) the revolver's holster on her hip */
  holster: 1,
  /** (plan 81) the double-barrel slung on her back */
  sling: 2,
  /** (plan 82) the AK slung on her back, mirrored */
  slingAk: 4,
  /** (plan 83) the sniper slung on the AK's diagonal, over it */
  slingSn: 8,
  /** (plan 84) the Daybreak upright down her back, the lens down, over the others */
  slingDb: 16,
  /** (plan 123) an umbrella in her left hand: open over her in rain out on the land, else furled */
  umbrella: 32,
} as const;
export type Worn = keyof typeof WORN;

/** Whether `worn` (Player.worn) has it on */
export const wears = (worn: number, w: Worn): boolean => (worn & WORN[w]) !== 0;

/** Colyseus's most fields on one Schema: a field's index and its operation share a byte (index | op, the op in the
 *  top two bits) */
export const SCHEMA_FIELDS = 64;
