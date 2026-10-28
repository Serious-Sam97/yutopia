// The item drawings load in their own chunk (the 3D view builds its things from them).
type ItemsModule = typeof import("./items");
let loading: Promise<ItemsModule> | null = null;
export function loadItemArt(): Promise<ItemsModule> {
  loading ??= import("./items");
  return loading;
}
