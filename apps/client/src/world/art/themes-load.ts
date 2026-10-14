// Loading the themes chunk (art/themes): once, from one place — the iso view's
// backdrops and the third-person view's surroundings share it.
type Themes = typeof import("./themes");
let loading: Promise<Themes> | null = null;

export function loadThemes(): Promise<Themes> {
  loading ??= import("./themes");
  return loading;
}
