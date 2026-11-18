import { fitPoint, SKATE_FITS } from "@yutopia/shared/skate/parks";
import type { Look, Model } from "../kit";
import type { KitMat } from "../life-mats";
import { pieceGeometry } from "../skate-piece";

// Plan 103 F6a (docs/plan/103-the-skate.md): the skate park's pieces in the build menu, each drawn from the very
// profile the board rides (shared skate/pieces.ts, the frame shared skate/parks.ts SKATE_FITS sets it in: the kit's
// x across, z down, y up) by furn/skate-piece.ts — a masonite face on birch-ply sides, a grey composite face on
// painted sides, or poured concrete; galvanised coping and edges. The rails galvanised or painted.

export const LOOKS: Record<string, readonly string[]> = {
  sk_quarter: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_vert: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_mini: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_kicker: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_funbox: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_ledge: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_manualpad: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_spine: ["Masonite and ply", "Grey composite", "Concrete"],
  sk_rail: ["Galvanised", "Painted"],
  sk_kinkrail: ["Galvanised", "Painted"],
};

/** A finish: the riding face's, the body's and the steel's paint and material. */
export interface SkateFinish {
  face: [number, KitMat];
  side: [number, KitMat];
  steel: [number, KitMat];
}
/** The looks' finishes (a ramp's three; a rail's two: its steel alone). */
export const SKATE_FINISH: SkateFinish[] = [
  { face: [0x7b644c, "plain"], side: [0xd6b88c, "birch"], steel: [0xa9b1bb, "metal-brushed"] },
  { face: [0x4a4f55, "plain"], side: [0x55687a, "matte"], steel: [0xa9b1bb, "metal-brushed"] },
  { face: [0xb3ada2, "matte"], side: [0xa39d92, "matte"], steel: [0x9aa2ab, "metal-brushed"] },
];
const RAIL_PAINT: [number, KitMat] = [0x2f5f9a, "gloss"];

/** Draw a piece kind's model in its footprint. */
function draw(kind: string) {
  return (m: Model, o: Look) => {
    const f = SKATE_FITS[kind];
    const rail = f.piece === "rail" || f.piece === "kinkrail";
    const fin = SKATE_FINISH[rail ? 0 : Math.min(2, o.look)];
    const g = pieceGeometry(f.piece, {
      to: (u, w, z) => {
        const [x, zz] = fitPoint(f, u, w);
        return [x, f.lift + z, zz];
      },
      base: -f.lift,
    });
    m.finishes([]);
    for (const x of g.face) m.add(x, fin.face[0], { mat: fin.face[1] });
    for (const x of g.side) m.add(x, fin.side[0], { mat: fin.side[1] });
    const steel = rail && o.look === 1 ? RAIL_PAINT : fin.steel;
    for (const x of g.steel) m.add(x, steel[0], { mat: steel[1] });
  };
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = Object.fromEntries(
  Object.keys(LOOKS).map((k) => [k, draw(k)]),
);
