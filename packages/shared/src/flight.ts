// A flight of steps up to a mezzanine (docs/plan/72-the-3d-core.md, phase 11.8): the catalog's
// `flight`, 1 × 3, straight up from its foot (v 0) to its top (v 3) — how high its own (props.rise),
// a mezzanine's height over its floor. Its steps are Jolt's (shapes.ts kindSolids) and the drawing's.
import { type BoxPart, box } from "./fam/units.ts";

/** A flight's rise when it has none of its own (m): a mezzanine's usual. */
export const FLIGHT_RISE = 1.75;

/** A flight's rise (m): its own (props.rise, 0.5–2.5), else the usual. */
export const flightRise = (o: { props?: Record<string, unknown> | null }): number => {
  const r = Number(o.props?.rise);
  return Number.isFinite(r) && r >= 0.5 && r <= 2.5 ? r : FLIGHT_RISE;
};

/** Its steps, along v from its foot to its top, `rise` up: as many as keep each under 0.2 m, each a
 *  block down to the one before (a stair you walk up, not a ramp). */
export function flightParts(rise: number): BoxPart[] {
  const n = Math.max(3, Math.ceil(rise / 0.2));
  const run = 3 / n;
  return Array.from({ length: n }, (_, i) =>
    box(0.05, i * run, 0.95, (i + 1) * run, Math.max(0, (i - 1) * (rise / n)), (i + 1) * (rise / n)),
  );
}
