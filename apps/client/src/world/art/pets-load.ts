// Loading the pets' drawings (art/pets.ts): once, on demand, like the people.
type Pets = typeof import("./pets");
let mod: Pets | null = null;
let loading: Promise<Pets> | null = null;

export function loadPets(): Promise<Pets> {
  loading ??= import("./pets").then((m) => {
    mod = m;
    return m;
  });
  return loading;
}

// The chunk if it's here (null while it loads).
export function pets(): Pets | null {
  return mod;
}
