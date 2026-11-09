import type { Material, MeshPhysicalMaterial, MeshStandardMaterial, WebGLRenderer } from "three";
import { PLAIN_ROUGH } from "../furn/life-mats";
import { libMaterial } from "../look/life-matlib";
import { LIBRARY, type MatId } from "../look/life-matlib-list";
import { adoptLife, litMaterial } from "../look/lit";

// Plan 73 phase 6 — the kit's materials in the life look (furn/life-mats.ts KIT_MATS): a library
// material (its textures; the parts' colours multiplied through it) or a plain finish of its own
// roughness. A floor (tp/build.ts) makes one of each it draws, lit by its room's light as the rest.

let renderer: WebGLRenderer | null = null;
/** The renderer the library's textures load through (the view's, at start in the life look). */
export function setKitRenderer(r: WebGLRenderer | null): void {
  renderer = r;
}

/** A kit material by its name: its vertex colours through it. */
export function kitMaterial(name: string): Material {
  if (name in LIBRARY && renderer) {
    const m = libMaterial(name as MatId, renderer, { color: 0xffffff });
    m.vertexColors = true;
    // (a weave's sheen: its colour can't follow the parts' — vertex colours don't reach it — so a soft
    // grey one, weaker than the library's own on a tinted cloth: white washed a dark sofa out)
    const ph = m as MeshPhysicalMaterial;
    if (ph.isMeshPhysicalMaterial && ph.sheen > 0) {
      ph.sheen = Math.min(ph.sheen, 0.3);
      ph.sheenColor.setScalar(0.28);
    }
    // (a metal of the kit's: part metal (0.4), so its colour — brass, chrome's grey — shows in a room's dim
    // sky, not only what it reflects: all metal, a brass lamp's pole went black)
    const st = m as MeshStandardMaterial;
    if (st.metalness > 0.5) st.metalness = 0.4;
    adoptLife(st);
    m.userData.kitMat = name;
    return m;
  }
  const m = litMaterial({ vertexColors: true, roughness: PLAIN_ROUGH[name] ?? 0.6 });
  m.userData.kitMat = name;
  return m;
}
