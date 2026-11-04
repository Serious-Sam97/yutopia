// The site plan's heavy part (grounds-plan.ts): the land's colour per tile, shaded, with its
// contours, and every tree of the Grounds. Plain numbers, no canvas: the phone's GPS works it
// out in a worker (grounds-plan.worker.ts) — on the main thread it froze the world for ~4 s
// the first time the map opened (docs/plan/38-the-lag.md) — and draws it as before.
import { CHUNK, groundSurfaceAt, isLandChunk, landBounds, terrainAt, treesIn } from "@yutopia/shared/grounds";

/** The land's surfaces' colours (RGB). */
export const LAND_PAL = {
  snow: [236, 240, 244],
  deep: [212, 222, 217],
  rock: [150, 156, 162],
  ice: [178, 197, 211],
  path: [205, 198, 186],
  asphalt: [72, 77, 84],
  walk: [196, 196, 192],
  floor: [42, 46, 52],
};
export const TREE_KINDS = ["pine", "birch", "bare"] as const;

export interface PlanData {
  /** the land, RGBA a sample (`step` m apart over the rect drawn: the Grounds', or a tile's) */
  land: Uint8ClampedArray;
  /** every tree, in the order drawn: x, z, scale, kind (TREE_KINDS index) */
  trees: Float64Array;
}

/** A rect of the Grounds (building coords). */
export interface PlanRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** The land and trees over `rect` (the land's box: all of it), a sample every `step` m — the GPS's
 *  tiles (docs/plan/69, L2: the land is long, drawn a square at a time). */
export function planData(rect: PlanRect = landBounds(), step = 1): PlanData {
  const G0 = rect;
  const GW = Math.round((G0.x1 - G0.x0) / step);
  const GH = Math.round((G0.z1 - G0.z0) / step);
  // ── the land: surface colours, shaded from the north-west ──
  const land = new Uint8ClampedArray(GW * GH * 4);
  const hs = new Float32Array((GW + 1) * (GH + 1));
  for (let j = 0; j <= GH; j++)
    for (let i = 0; i <= GW; i++) hs[j * (GW + 1) + i] = terrainAt(G0.x0 + i * step, G0.z0 + j * step);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = G0.x0 + (i + 0.5) * step;
      const z = G0.z0 + (j + 0.5) * step;
      const s = groundSurfaceAt(x, z);
      const col = LAND_PAL[s as keyof typeof LAND_PAL] as number[];
      const h00 = hs[j * (GW + 1) + i];
      const h10 = hs[j * (GW + 1) + i + 1];
      const h01 = hs[(j + 1) * (GW + 1) + i];
      const dx = (h10 - h00) / step;
      const dz = (h01 - h00) / step;
      // light from the north-west, up high
      const shade = Math.max(0.42, Math.min(1.14, 1 + (-dx * 0.7 - dz * 0.7) * 0.5 - 0.04));
      // contours every 2 tiles (thin, on the land only)
      const h = h00;
      const every = step > 1 ? 10 : 2;
      const cont = s !== "floor" && s !== "asphalt" && Math.floor(h / every) !== Math.floor(h10 / every) ? 0.9 : 1;
      const k = (j * GW + i) * 4;
      land[k] = col[0] * shade * cont;
      land[k + 1] = col[1] * shade * cont;
      land[k + 2] = col[2] * shade * cont;
      land[k + 3] = 255;
    }
  // ── the woods: the land's chunks over the rect (and a few metres round it: a dot on its edge) ──
  const trees: number[] = [];
  for (let cz = Math.floor((G0.z0 - 4) / CHUNK); cz * CHUNK < G0.z1 + 4; cz++)
    for (let cx = Math.floor((G0.x0 - 4) / CHUNK); cx * CHUNK < G0.x1 + 4; cx++) {
      if (!isLandChunk(cx, cz, CHUNK)) continue;
      for (const t of treesIn(cx, cz))
        if (t.x > G0.x0 - 4 && t.x < G0.x1 + 4 && t.z > G0.z0 - 4 && t.z < G0.z1 + 4)
          trees.push(t.x, t.z, t.s, TREE_KINDS.indexOf(t.kind));
    }
  return { land, trees: new Float64Array(trees) }; // (full precision: the dots land where they did)
}
