import assert from "node:assert/strict";
import { test } from "node:test";

// The keys a device saved (input/bindings.ts loadBindings): a default since given up moves to
// today's; what you'd set yourself is kept. Walk is Ctrl on a Mac and Alt on Windows and Linux.

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  },
});
// (a Mac, before the bindings are read: their defaults are made as they load)
let platform = "MacIntel";
Object.defineProperty(globalThis, "navigator", { configurable: true, get: () => ({ platform }) });

test("walk: Ctrl on a Mac, Alt on Windows and Linux; a saved given-up default moves; your own stays", async () => {
  const { DEFAULT_KEYS, loadBindings, saveBindings, walkKeys } = await import("./bindings");
  assert.deepEqual(walkKeys(true), ["ControlLeft", "ControlRight"]);
  assert.deepEqual(walkKeys(false), ["AltLeft", "AltRight"]);
  assert.deepEqual(DEFAULT_KEYS.walk, ["ControlLeft", "ControlRight"], "a Mac's default");
  const saved = (walk: string[]) => {
    store.clear();
    const b = loadBindings();
    b.keys.walk = walk;
    saveBindings(b);
    return loadBindings().keys.walk;
  };
  assert.deepEqual(saved(["AltLeft", "AltRight"]), ["ControlLeft", "ControlRight"], "on a Mac, Alt moved to Ctrl");
  assert.deepEqual(saved(["KeyG"]), ["KeyG"], "your own kept");
  // on Windows: a Ctrl saved in the hours it was everyone's isn't kept (the default there is Alt)
  platform = "Win32";
  store.clear();
  const b = loadBindings();
  b.keys.walk = ["ControlLeft", "ControlRight"];
  saveBindings(b);
  assert.deepEqual(loadBindings().keys.walk, ["AltLeft", "AltRight"], "on Windows, Ctrl not kept: Alt");
});
