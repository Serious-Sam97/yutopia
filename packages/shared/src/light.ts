import { editsVersion, KART_LAND, LAMPS } from "./grounds.ts";
import { standLights } from "./kart/park.ts";

// Light on the Grounds (docs/plan/30-the-dark.md, D4): the lamps' pools (warmth
// now, the shadowed's safe islands in phase 4); flares join them in phase 5.
// The torches' beams are beam.ts (no Grounds in it: the views load it as is).

/** How far each kind of lamp's pool reaches, tiles (the views' POOL_R). */
export const LAMP_POOL_R: Record<string, number> = { cobra: 7, town: 5.5, lone: 5, porch: 3.5, flood: 14 };

// the lamps by 32-tile cell, for a quick "any near here" (again when god mode's edits are laid:
// docs/plan/53-the-god-mode.md)
const CELL = 32;
const cells = new Map<string, typeof LAMPS>();
let laid = -1;
function index() {
  if (laid === editsVersion) return;
  laid = editsVersion;
  cells.clear();
  for (const l of LAMPS) {
    const k = `${Math.floor(l.x / CELL)},${Math.floor(l.z / CELL)}`;
    const c = cells.get(k) ?? [];
    cells.set(k, c);
    c.push(l);
  }
}

// (and the Kart Park's stands: their lights aren't posts — kart/park.ts standLights)
const STAND_POOLS = KART_LAND ? standLights() : [];

/** In a lamp's pool at (x, z), the building's coords. (A blackout puts them all
 *  out: the caller asks danger.ts blackoutAt.) */
export function inLampPool(x: number, z: number): boolean {
  index();
  for (const s of STAND_POOLS) if (Math.hypot(s.x - x, s.pz - z) < s.pool) return true;
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cz - 1; j <= cz + 1; j++)
      for (const l of cells.get(`${i},${j}`) ?? [])
        if (Math.hypot(l.x - x, l.z - z) < (LAMP_POOL_R[l.kind] ?? 5)) return true;
  return false;
}
