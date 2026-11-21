// How the Grounds' buildings look was decided here (docs/plan/33-the-look.md) till plan 110: a building's look is
// its style and colours now (shared building-styles.ts). What's left: a colour as a number.

/** "#rrggbb" as 0xrrggbb. */
export const hexOf = (c: string) => Number.parseInt(c.slice(1), 16);
