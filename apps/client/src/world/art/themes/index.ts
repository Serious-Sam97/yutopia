// The third-person view's surroundings: the snow campus's sky and trees.
export { canvas, keyed, rng } from "./common";
export { SKY as SNOW_SKY, tree as bareTree } from "./snow";

// Marks this chunk for `pnpm budget` (it loads lazily).
export const THEME_CHUNK = "yutopia-themes";
