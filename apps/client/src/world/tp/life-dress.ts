import type { BufferGeometry, Color, Material } from "three";

// Plan 73 phase 7 — the library's dressing for what's drawn outside the floors' own (the campus, the
// stairwell, the Grounds' buildings), through hooks tp/kit-mats.ts fills as it loads (the game's view
// loads it, before any of them draw): their importing kit-mats moved light3d, the stairwell and the
// land's blocks into two new shared chunks (+122 KB in the Grounds' marker, +53 KB all told — phase 7.4).
// Unfilled (a page without the view's), they draw as they were.
export const lifeDress: {
  /** the life look's buildings (look-mode.ts isLifeBuild), as kit-mats saw it at load */
  on?: boolean;
  /** a painting's material with the library's `id` relief and sheen over it, its UVs `k` metres a unit
   *  (each way, or [along, up]) */
  relief?: (m: Material, id: string, k: number | [number, number]) => void;
  /** a material dressed in the library's `id`: albedo, relief, roughness; its colour (or `tint`) the tone */
  dress?: (m: Material, id: string, o: { tint?: number; k?: number }) => void;
  /** `hex` as a tint over the library's `id` (its colour against the material's own mean) */
  tintOver?: (id: string, hex: number) => Color;
  /** a kit material by its name: its vertex colours through it */
  material?: (name: string) => Material;
  /** (phase 8) the life look's outdoors (look-mode.ts isLifeOut), as kit-mats saw it at load */
  out?: boolean;
  /** (phase 8) the library's `id` relief and roughness laid on a ground's up-facing faces by where they
   *  are (their own UVs are their painting's): through the Grounds' per-material hook (`userData.grounds`) */
  ground?: (m: Material, id: string) => void;
  /** (phase 8.1) the life look's trees (tp/life-trees.ts, which fills this as it loads — with the
   *  Grounds' stream, before the campus is built) */
  trees?: {
    leafy: (
      r: () => number,
      o: { col: [number, number, number]; H?: number; spread?: number; bark?: number },
    ) => BufferGeometry;
    pine: (r: () => number, o?: { tiers?: number; H?: number; width?: number; snow?: number }) => BufferGeometry;
    material: (m: Material) => void;
    depth: () => Material;
    /** (phase 8.2) plants by a house: tufts, flower clumps, bushes, as one geometry */
    plants: (
      items: { kind: "tuft" | "flower" | "bush"; x: number; y: number; z: number; hex?: number; s?: number }[],
      r: () => number,
    ) => BufferGeometry;
    plantMaterial: (m: Material) => void;
  };
  /** a plain surface of the library's `id` (UVs in metres), its colour `tint` */
  surface?: (id: string, tint: number) => Material;
} = {};
