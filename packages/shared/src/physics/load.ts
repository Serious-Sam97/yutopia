// Jolt (jolt-physics, pinned at 1.1.1 with the bench's hashes: tools/physics-bench), loaded once
// per process — the server's at start, the browser's with the 3D view, never the page
// (docs/plan/50-the-volume.md, guardrail 5).
import type Jolt from "jolt-physics";

export type JoltModule = typeof Jolt;

let loading: Promise<JoltModule> | null = null;
export function loadJolt(): Promise<JoltModule> {
  loading ??= import("jolt-physics/wasm-compat").then((m) => m.default());
  return loading;
}
