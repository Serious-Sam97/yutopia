// Loading the people chunk (art/people.ts): once, on demand.
type People = typeof import("./people");
let mod: People | null = null;
let loading: Promise<People> | null = null;

export function loadPeople(): Promise<People> {
  loading ??= import("./people").then((m) => {
    mod = m;
    return m;
  });
  return loading;
}

// The chunk if it's here (null while it loads).
export function people(): People | null {
  return mod;
}
