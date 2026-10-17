// Loading the 3D people (world/chars): once, on demand, like the pets.
type Chars = typeof import("../chars");
let mod: Chars | null = null;
let loading: Promise<Chars> | null = null;

export function loadChars(): Promise<Chars> {
  loading ??= import("../chars").then((m) => {
    mod = m;
    // (dev: the module for probes and review tools)
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __charsMod: m });
    return m;
  });
  return loading;
}

// The chunk if it's here (null while it loads).
export function chars(): Chars | null {
  return mod;
}
