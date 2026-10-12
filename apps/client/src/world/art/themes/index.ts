import type { Theme } from "@yutopia/shared";
import { CityTheme } from "./city";
import { CloudsTheme } from "./clouds";
import type { ThemeView } from "./common";
import { SnowTheme } from "./snow";

export type { ThemeView };

// Marks this chunk for `pnpm budget` (it loads lazily).
export const THEME_CHUNK = "yutopia-themes";

// Fewer particles (snowflakes) below High.
export function makeTheme(theme: Theme, animate: boolean, quality: "high" | "medium" | "low" = "high"): ThemeView {
  if (theme === "city") return new CityTheme(animate);
  if (theme === "snow") return new SnowTheme(animate, quality === "high" ? 260 : quality === "medium" ? 160 : 70);
  return new CloudsTheme(animate);
}
