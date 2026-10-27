// The items (docs/plan/46-the-karts.md, K-M2), in the world's own flavour: what each does, how many
// come in a crate, and the roll by place (the leader gets defence, the back the big stuff). The
// server flies them; the clients draw what it says.

export type ItemKind = "snowball" | "ice" | "stapler" | "fax" | "drone" | "coffee" | "umbrella" | "plough";

export const ITEMS: Record<ItemKind, { name: string; n: number }> = {
  snowball: { name: "Snowballs", n: 3 },
  ice: { name: "Black ice", n: 1 },
  stapler: { name: "The stapler", n: 1 },
  fax: { name: "The fax bomb", n: 1 },
  drone: { name: "Vortex's drone", n: 1 },
  coffee: { name: "Coffee", n: 3 },
  umbrella: { name: "The umbrella", n: 1 },
  plough: { name: "The plough", n: 1 },
};

/** The numbers of the things that fly (m, m/s, ms). */
export const ITEM = {
  roll: 1000, // the roulette
  crateR: 1.7, // driving through one takes it
  crateBack: 4000, // and it's back after
  snowball: { speed: 34, life: 2600, r: 1.25, bounces: 1 },
  ice: { r: 1.4, life: 45_000, behind: 2.4 },
  stapler: { every: 110, for: 1800, speed: 46, life: 900, r: 1.0, hits: 3, within: 2000 },
  fax: { ahead: 16, flight: 800, fuse: 1400, trip: 3, blast: 5.5 },
  drone: { speed: 30, life: 8000, r: 1.5 },
  umbrella: { for: 8000 },
  plough: { for: 6000, r: 2.2, top: 1.45 },
  coffee: { boost: 1.0 },
};

/** The odds (weights) by where you are: `pos` 0 the leader … 1 the back; a battle's are flat. */
export function itemOdds(pos: number, battle: boolean): [ItemKind, number][] {
  if (battle)
    return [
      ["snowball", 5],
      ["ice", 3],
      ["stapler", 4],
      ["fax", 3],
      ["drone", 2],
      ["coffee", 2],
      ["umbrella", 3],
    ];
  const f = (lead: number, back: number) => Math.max(0, lead + (back - lead) * pos);
  return [
    ["ice", f(6, 1)],
    ["snowball", f(6, 3)],
    ["umbrella", f(4, 1)],
    ["stapler", f(1, 3)],
    ["fax", f(1, 3)],
    ["coffee", f(0.5, 4)],
    ["drone", f(0, 4)],
    ["plough", pos > 0.7 ? f(0, 2.5) : 0],
  ];
}

/** A roll from the odds, `u` in 0..1; never one of `not` (the last one had, the plough while
 *  one's out) unless nothing else could come up. */
export function rollItem(pos: number, battle: boolean, u: number, not: readonly ItemKind[] = []): ItemKind {
  const all = itemOdds(pos, battle);
  const some = all.filter(([k, w]) => w > 0 && !not.includes(k));
  const odds = some.length ? some : all;
  const total = odds.reduce((a, [, w]) => a + w, 0);
  let x = u * total;
  for (const [k, w] of odds) {
    x -= w;
    if (x <= 0) return k;
  }
  return odds[0][0];
}
