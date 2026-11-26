import type { BufferGeometry, Mesh } from "three";
import { asset } from "@/lib/asset";
import type { Model } from "./kit";
import { P } from "./palette";

// The house's ornate pieces (docs/plan/130-the-house-build.md's quality pass, F9a): modelled in Blender
// (tools/art/house/ornate.py → public/life/house/ornate.glb), a node a kind, its meshes by role. Loaded once, the first
// time one's to be drawn; till then the kind draws its code stand-in (fam/house.ts), and the floors are drawn again when
// it's in (World3's `ornateIn`).

export const ORNATE_KINDS = new Set(["fp_victorian", "corinthian_column", "porch_bracket", "baluster_rail"]);
const ROLE: Record<string, number> = {
  marble: 0xeeebe4,
  stone: 0xdcd6ca,
  iron: 0x2a2a2c,
  dark: 0x0e0a08,
  "tile-a": 0x2f6a6a,
  "tile-b": 0x7fb5a1,
  white: 0xf4f2ec,
  wood: 0x4a2e1a,
  brass: P.brass,
};
let parts: Map<string, { geo: BufferGeometry; color: number }[]> | null = null;
let loading: Promise<boolean> | null = null;
/** Whether the ornate pieces are in. */
export const ornateReady = (): boolean => !!parts;
/** The pieces loaded (once). */
export function loadOrnate(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/libs/meshopt_decoder.module.js"),
      ]);
      await MeshoptDecoder.ready;
      const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset("/life/house/ornate.glb"));
      g.scene.updateMatrixWorld(true);
      const out = new Map<string, { geo: BufferGeometry; color: number }[]>();
      g.scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        // (named "<kind>|<role>"; glTF's names may come with a suffix)
        const [kind, roleRaw] = (m.name || m.parent?.name || "").split("|");
        const role = (roleRaw ?? (Array.isArray(m.material) ? "" : m.material.name)).split(/[._]/)[0];
        if (!ORNATE_KINDS.has(kind)) return;
        const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (k !== "position") geo.deleteAttribute(k);
        const list = out.get(kind) ?? [];
        list.push({ geo, color: ROLE[role] ?? 0xdddddd });
        out.set(kind, list);
      });
      parts = out;
      return true;
    } catch (e) {
      console.warn("[ornate] not loaded", e);
      return false;
    }
  })();
  return loading;
}
/** A kind's ornate model into `m` (true), or false when it isn't in yet (the caller draws its stand-in). */
export function ornateInto(m: Model, kind: string): boolean {
  const list = parts?.get(kind);
  if (!list?.length) {
    void loadOrnate();
    return false;
  }
  for (const p of list) m.add(p.geo.clone(), p.color);
  return true;
}
