import type { ThemeView } from "./common";
import { SnowTheme } from "./snow";

export type { ThemeView };

// The third-person view's surroundings use the same sky (one copy for both views).
export { canvas, keyed, rng } from "./common";
export { SKY as SNOW_SKY, tree as bareTree } from "./snow";

// Marks this chunk for `pnpm budget` (it loads lazily).
export const THEME_CHUNK = "yutopia-themes";

// What surrounds the building in iso: the snow campus's backdrop. Fewer
// particles (snowflakes) below High.
export function makeTheme(animate: boolean, quality: "high" | "medium" | "low" = "high"): ThemeView {
  return new SnowTheme(animate, quality === "high" ? 260 : quality === "medium" ? 160 : 70);
}
