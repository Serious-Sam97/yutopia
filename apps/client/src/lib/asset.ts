// A public file's URL with its folder's version in it (docs/plan/89-the-weight.md phase 5): `/a/<hash>/life/…` —
// next.config.ts makes the hashes (each folder's own files' contents) and rewrites the URL to the file, kept for a year
// in a production build. A file whose folder has no version (not one the game loads from) is asked for as it is.
// A folder works too ("/sfx/steps/"): what's added to it after is in the same folder, the same version.

const V: Record<string, string> = JSON.parse(process.env.NEXT_PUBLIC_ASSET_V || "{}");

export function asset(path: string): string {
  const dir = path.endsWith("/") ? path.slice(0, -1) : path.slice(0, path.lastIndexOf("/"));
  const v = V[dir];
  return v ? `/a/${v}${path}` : path;
}
