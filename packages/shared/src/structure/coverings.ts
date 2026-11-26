// Coverings (docs/plan/130-the-house-build.md, phase 9 — F8a): what a wall's face or a floor's tile is covered with,
// beyond the five paints and the floors' chars. Each a material of the client's library (CC0 photo textures — the
// look's own, world/look/life-matlib-list.ts) and the colour it's tinted, picked from these, or tinted a colour of
// one's own. Kept as a key: "cov:<id>" or "cov:<id>#rrggbb" (its own tint) — on a wall's face (`coverF`, `coverB`),
// in a floor's tiles layer (tiles.ts).

export interface Covering {
  id: string;
  /** the library's material (MatId) */
  mat: string;
  /** its tint */
  color: string;
  label: string;
  /** its texture's metres a repeat (1: as the library has it) */
  scale?: number;
}
export const COVER = "cov:";

const c = (id: string, mat: string, color: string, label: string, scale?: number): Covering => ({
  id,
  mat,
  color,
  label,
  ...(scale ? { scale } : {}),
});

/** A wall's (60): plaster in colours, wallpapers, brick, sidings, shingles, stone, panelling, tile. */
export const WALL_COVERINGS: readonly Covering[] = [
  ...(
    [
      ["white", "#f4f1ea", "White"],
      ["linen", "#e8dcc4", "Linen"],
      ["sand", "#d9c4a0", "Sand"],
      ["butter", "#efd99a", "Butter"],
      ["terracotta", "#c8795a", "Terracotta"],
      ["blush", "#e3b7ad", "Blush"],
      ["sage", "#a9b89a", "Sage"],
      ["mint", "#bcd8c6", "Mint"],
      ["sky", "#b4cbe0", "Sky"],
      ["navy", "#2f3f5a", "Navy"],
      ["charcoal", "#4a4a4c", "Charcoal"],
      ["plum", "#6e4a63", "Plum"],
    ] as const
  ).map(([k, col, name]) => c(`paint-${k}`, "plaster", col, `${name} paint`)),
  ...(
    [
      ["cream", "#efe3c8", "Cream"],
      ["sage", "#b5c2a2", "Sage"],
      ["rose", "#dcaaa3", "Rose"],
      ["blue", "#9fb6cf", "Blue"],
      ["mustard", "#d9b45a", "Mustard"],
      ["grey", "#b9b6ae", "Grey"],
    ] as const
  ).map(([k, col, name]) => c(`stripe-${k}`, "wallpaper-stripe", col, `${name} stripes`)),
  ...(
    [
      ["gold", "#e2cd94", "Gold"],
      ["green", "#7f9a77", "Green"],
      ["red", "#a14a44", "Red"],
      ["teal", "#4f8a8a", "Teal"],
      ["ivory", "#f1e8d4", "Ivory"],
      ["night", "#3c4457", "Night"],
    ] as const
  ).map(([k, col, name]) => c(`damask-${k}`, "wallpaper-damask", col, `${name} damask`)),
  c("brick-red", "brick", "#ffffff", "Red brick"),
  c("brick-white", "brick", "#f2ece2", "Whitewashed brick"),
  c("brick-dark", "brick", "#8a7a70", "Dark brick"),
  c("brick-sand", "brick", "#e8cfa4", "Sand brick"),
  ...(
    [
      ["white", "#f6f3ec", "White"],
      ["grey", "#b8bcbd", "Grey"],
      ["blue", "#8fa6bd", "Blue"],
      ["green", "#8ea28a", "Green"],
      ["yellow", "#e6cf8a", "Yellow"],
      ["red", "#9c4a3e", "Barn red"],
    ] as const
  ).map(([k, col, name]) => c(`clap-${k}`, "clapboard", col, `${name} clapboard`)),
  ...(
    [
      ["cedar", "#ffffff", "Cedar"],
      ["grey", "#a9aaa8", "Weathered"],
      ["blue", "#8b9eb3", "Blue"],
      ["sage", "#a3b293", "Sage"],
    ] as const
  ).map(([k, col, name]) => c(`shingle-${k}`, "shingle-wall", col, `${name} shingles`)),
  ...(
    [
      ["white", "#f3f0e8", "White"],
      ["slate", "#6d7680", "Slate"],
      ["olive", "#7d8159", "Olive"],
      ["black", "#3a3a3a", "Black"],
    ] as const
  ).map(([k, col, name]) => c(`batten-${k}`, "batten", col, `${name} board and batten`)),
  ...(
    [
      ["white", "#f2eee6", "White"],
      ["ochre", "#d8b07a", "Ochre"],
      ["rose", "#d9a596", "Rose"],
      ["grey", "#b7b2aa", "Grey"],
    ] as const
  ).map(([k, col, name]) => c(`stucco-${k}`, "stucco", col, `${name} stucco`)),
  c("fieldstone", "fieldstone", "#ffffff", "Fieldstone"),
  c("fieldstone-grey", "fieldstone", "#c9c9c4", "Grey fieldstone"),
  c("fieldstone-warm", "fieldstone", "#e8d2b0", "Warm fieldstone"),
  c("limestone", "limestone", "#ffffff", "Limestone"),
  c("limestone-grey", "limestone", "#c4c2bc", "Grey limestone"),
  c("panel-oak", "panel", "#ffffff", "Oak panelling"),
  c("panel-walnut", "panel", "#8a6448", "Walnut panelling"),
  c("panel-white", "panel", "#f0ece4", "White panelling"),
  c("panel-green", "panel", "#5d7058", "Green panelling"),
  c("tile-white", "tile-wall", "#f7f6f2", "White wall tile"),
  c("tile-green", "tile-wall", "#9fbfa9", "Green wall tile"),
  c("tile-blue", "tile-wall", "#9fb5cf", "Blue wall tile"),
  c("tile-black", "tile-wall", "#4a4a4c", "Black wall tile"),
  c("tile-pink", "tile-wall", "#e5b8b4", "Pink wall tile"),
  c("corrugated", "corrugated", "#c9ced2", "Corrugated metal"),
  // (the quality pass: CC0 photo materials — woodchip paper takes any paint's colour, the rest their own)
  ...(
    [
      ["white", "#f4f1ea", "White"],
      ["cream", "#efe3c8", "Cream"],
      ["sage", "#b5c2a2", "Sage"],
      ["blue", "#a9bfd6", "Blue"],
      ["blush", "#e3c0b8", "Blush"],
      ["grey", "#bdbab3", "Grey"],
    ] as const
  ).map(([k, col, name]) => c(`woodchip-${k}`, "wallpaper-woodchip", col, `${name} woodchip paper`)),
  c("woodchip-fine", "wallpaper-woodchip-fine", "#f1ede4", "Fine woodchip paper"),
  c("paper-worn", "wallpaper-worn", "#ffffff", "Old worn paper"),
  c("marble-wall", "marble-tile", "#ffffff", "Marble wall tile"),
  c("marble-wall-veined", "marble-tile-veined", "#ffffff", "Veined marble wall"),
  c("mosaic-wall", "hex-mosaic", "#ffffff", "Hex mosaic wall"),
  c("mosaic-wall-green", "hex-mosaic", "#a9c9b4", "Green hex mosaic wall"),
  c("concrete-wall", "concrete-polished", "#ffffff", "Polished concrete wall"),
  c("terrazzo-wall", "terrazzo", "#ffffff", "Terrazzo wall"),
];

/** A floor's (50): woods, carpets, tiles, stone, brick pavers, metal. */
export const FLOOR_COVERINGS: readonly Covering[] = [
  ...(
    [
      ["natural", "#ffffff", "Oak"],
      ["honey", "#f0c890", "Honey oak"],
      ["white", "#eee6d8", "White oak"],
      ["grey", "#b9b2a8", "Grey oak"],
      ["red", "#d8907a", "Cherry"],
      ["dark", "#7a5a44", "Dark oak"],
    ] as const
  ).map(([k, col, name]) => c(`oak-${k}`, "floor-oak", col, name)),
  c("walnut", "floor-walnut", "#ffffff", "Walnut"),
  c("walnut-light", "floor-walnut", "#e4c8a8", "Light walnut"),
  c("walnut-ebony", "floor-walnut", "#6a5a52", "Ebony"),
  ...(
    [
      ["oat", "#c9b89a", "Oat"],
      ["grey", "#9a9a98", "Grey"],
      ["charcoal", "#4c4c50", "Charcoal"],
      ["navy", "#34405a", "Navy"],
      ["forest", "#46604a", "Forest"],
      ["wine", "#6e2f38", "Wine"],
      ["rust", "#a35a3a", "Rust"],
      ["sky", "#9fb8d0", "Sky"],
      ["blush", "#d8aaa6", "Blush"],
      ["cream", "#e8dcc0", "Cream"],
    ] as const
  ).map(([k, col, name]) => c(`carpet-${k}`, "carpet", col, `${name} carpet`)),
  ...(
    [
      ["white", "#f7f4ee", "White"],
      ["cream", "#efe3c6", "Cream"],
      ["grey", "#b4b4b0", "Grey"],
      ["black", "#4a4a4c", "Black"],
      ["terracotta", "#c77a56", "Terracotta"],
      ["blue", "#8fa9c6", "Blue"],
      ["green", "#93b49c", "Green"],
      ["sand", "#dcc49a", "Sand"],
    ] as const
  ).map(([k, col, name]) => c(`tile-${k}`, "tile-floor", col, `${name} tile`, 0.6)),
  ...(
    [
      ["white", "#f6f4f0", "White"],
      ["black", "#505052", "Black"],
      ["green", "#8fb39a", "Green"],
      ["blue", "#8ea7c2", "Blue"],
    ] as const
  ).map(([k, col, name]) => c(`small-${k}`, "tile-floor", col, `Small ${name.toLowerCase()} tile`, 1.6)),
  c("flagstone", "fieldstone", "#ffffff", "Flagstone"),
  c("flagstone-grey", "fieldstone", "#c4c4c0", "Grey flagstone"),
  c("flagstone-warm", "fieldstone", "#e6cfa8", "Warm flagstone"),
  c("limestone", "limestone", "#ffffff", "Limestone"),
  c("limestone-grey", "limestone", "#bdbab2", "Grey limestone"),
  c("travertine", "limestone", "#ead8b8", "Travertine"),
  c("pavers-red", "brick", "#ffffff", "Brick pavers"),
  c("pavers-sand", "brick", "#e8cfa4", "Sand pavers"),
  c("pavers-grey", "brick", "#a8a29a", "Grey pavers"),
  c("deck-cedar", "batten", "#c89a6a", "Cedar decking"),
  c("deck-grey", "batten", "#a4a29c", "Grey decking"),
  c("deck-teak", "batten", "#a77a4e", "Teak decking"),
  c("plank-pine", "clapboard", "#e8cc9a", "Pine planks"),
  c("plank-barn", "clapboard", "#8a6a52", "Barn planks"),
  c("plank-white", "clapboard", "#ece8e0", "Whitewashed planks"),
  c("cork", "panel", "#c49a6c", "Cork"),
  c("metal", "metal-brushed", "#ffffff", "Brushed metal"),
  c("checker-plate", "metal-cast", "#c8ccd0", "Checker plate"),
  c("corrugated", "corrugated", "#b8bcc0", "Corrugated"),
  // (the quality pass: CC0 photo materials)
  c("herringbone", "floor-herringbone", "#ffffff", "Herringbone oak"),
  c("herringbone-honey", "floor-herringbone", "#f2d2a0", "Honey herringbone"),
  c("herringbone-grey", "floor-herringbone", "#c9c4bc", "Grey herringbone"),
  c("parquet", "floor-parquet", "#ffffff", "Light parquet"),
  c("parquet-dark", "floor-parquet-dark", "#ffffff", "Dark parquet"),
  c("terrazzo", "terrazzo", "#ffffff", "Terrazzo"),
  c("terrazzo-white", "terrazzo-white", "#ffffff", "White terrazzo"),
  c("marble", "marble-tile", "#ffffff", "Marble tiles"),
  c("marble-veined", "marble-tile-veined", "#ffffff", "Veined marble"),
  c("marble-warm", "marble-tile", "#f0dcc4", "Warm marble"),
  c("hex-mosaic", "hex-mosaic", "#ffffff", "White hex mosaic"),
  c("hex-mosaic-black", "hex-mosaic", "#5a5a5c", "Black hex mosaic"),
  c("concrete-polished", "concrete-polished", "#ffffff", "Polished concrete"),
  c("pavers-hex", "pavers-hex", "#ffffff", "Hex stone pavers"),
];

const byId = (list: readonly Covering[]) => new Map(list.map((q) => [q.id, q]));
const WALLS = byId(WALL_COVERINGS);
const FLOORS = byId(FLOOR_COVERINGS);

/** A covering key's covering and tint (its own, or the covering's), for a wall or a floor; null: not one. */
export function coverOf(key: string | undefined | null, where: "wall" | "floor"): (Covering & { tint: string }) | null {
  if (!key?.startsWith(COVER)) return null;
  const [id, hex] = key.slice(COVER.length).split("#");
  const q = (where === "wall" ? WALLS : FLOORS).get(id);
  if (!q) return null;
  if (hex !== undefined && !/^[0-9a-f]{6}$/i.test(hex)) return null;
  return { ...q, tint: hex ? `#${hex.toLowerCase()}` : q.color };
}
export const isCover = (key: string | undefined | null, where: "wall" | "floor"): boolean => !!coverOf(key, where);
/** A covering's key: its id, and its own tint when not the covering's. */
export const coverKey = (id: string, tint?: string | null): string =>
  `${COVER}${id}${tint ? `#${tint.replace("#", "").toLowerCase()}` : ""}`;
