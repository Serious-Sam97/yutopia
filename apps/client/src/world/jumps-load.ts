// Loading a jump's dust and sounds (jumps.ts): once, with the first jump seen.
type Jumps = typeof import("./jumps");
let mod: Jumps | null = null;
let loading: Promise<Jumps> | null = null;

export function loadJumps(): Promise<Jumps> {
  loading ??= import("./jumps").then((m) => {
    mod = m;
    return m;
  });
  return loading;
}

// The chunk if it's here (null while it loads: that jump goes without).
export function jumps(): Jumps | null {
  return mod;
}
