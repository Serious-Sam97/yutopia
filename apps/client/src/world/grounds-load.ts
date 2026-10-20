// The Grounds (shared grounds.ts, docs/plan/27-the-grounds.md): the land round
// the ground floor, generated here as on the server. Fetched once when the
// world starts (not in the page: it's a few KB of code that makes the land).
type Grounds = typeof import("@yutopia/shared/grounds");
let mod: Grounds | null = null;
let loading: Promise<Grounds> | null = null;

export function loadGrounds(): Promise<Grounds> {
  loading ??= import("@yutopia/shared/grounds").then((m) => {
    mod = m;
    return m;
  });
  return loading;
}

// The module if it's here (null while it loads: the ground floor ends at its tiles).
export function grounds(): Grounds | null {
  return mod;
}
