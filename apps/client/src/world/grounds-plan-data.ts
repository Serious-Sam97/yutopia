// The site plan's heavy part (grounds-plan.ts): the land's colour per tile, shaded, with its
// contours, and every tree of the Grounds. Plain numbers, no canvas: the phone's GPS works it
// out in a worker (grounds-plan.worker.ts) — on the main thread it froze the world for ~4 s
// the first time the map opened (docs/plan/38-the-lag.md) — and draws it as before.
import { CHUNK, GROUNDS, groundSurfaceAt, terrainAt, treesIn } from "@yutopia/shared/grounds";

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
  /** the land, RGBA a tile (GW × GH, the Grounds' size) */
  land: Uint8ClampedArray;
  /** every tree, in the order drawn: x, z, scale, kind (TREE_KINDS index) */
  trees: Float64Array;
}

export function planData(): PlanData {
  const GW = GROUNDS.x1 - GROUNDS.x0;
  const GH = GROUNDS.z1 - GROUNDS.z0;
  // ── the land: surface colours, shaded from the north-west ──
  const land = new Uint8ClampedArray(GW * GH * 4);
  const hs = new Float32Array((GW + 1) * (GH + 1));
  for (let j = 0; j <= GH; j++)
    for (let i = 0; i <= GW; i++) hs[j * (GW + 1) + i] = terrainAt(GROUNDS.x0 + i, GROUNDS.z0 + j);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = GROUNDS.x0 + i + 0.5;
      const z = GROUNDS.z0 + j + 0.5;
      const s = groundSurfaceAt(x, z);
      const col = LAND_PAL[s as keyof typeof LAND_PAL] as number[];
      const h00 = hs[j * (GW + 1) + i];
      const h10 = hs[j * (GW + 1) + i + 1];
      const h01 = hs[(j + 1) * (GW + 1) + i];
      const dx = h10 - h00;
      const dz = h01 - h00;
      // light from the north-west, up high
      const shade = Math.max(0.42, Math.min(1.14, 1 + (-dx * 0.7 - dz * 0.7) * 0.5 - 0.04));
      // contours every 2 tiles (thin, on the land only)
      const h = h00;
      const cont = s !== "floor" && s !== "asphalt" && Math.floor(h / 2) !== Math.floor(h10 / 2) ? 0.9 : 1;
      const k = (j * GW + i) * 4;
      land[k] = col[0] * shade * cont;
      land[k + 1] = col[1] * shade * cont;
      land[k + 2] = col[2] * shade * cont;
      land[k + 3] = 255;
    }
  // ── the woods ──
  const trees: number[] = [];
  for (let cz = Math.floor(GROUNDS.z0 / CHUNK); cz < GROUNDS.z1 / CHUNK; cz++)
    for (let cx = Math.floor(GROUNDS.x0 / CHUNK); cx < GROUNDS.x1 / CHUNK; cx++)
      for (const t of treesIn(cx, cz)) trees.push(t.x, t.z, t.s, TREE_KINDS.indexOf(t.kind));
  return { land, trees: new Float64Array(trees) }; // (full precision: the dots land where they did)
}
