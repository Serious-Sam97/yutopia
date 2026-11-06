// Loading the themes chunk (art/themes): once, from one place — the 3D view's surroundings (the
// sky, trees) take it.
type Themes = typeof import("./themes");
let loading: Promise<Themes> | null = null;

export function loadThemes(): Promise<Themes> {
  loading ??= import("./themes");
  return loading;
}
