import { bladeCells, PLOUGHED_MS } from "@yutopia/shared/car";
import type { WorldState } from "../schema.ts";

/** Fresh snow coming down (docs/plan/65-the-weather.md): what a blade clears and what covers it again. */
const snowing = (state: WorldState) => (state.weather.kind === "snow" ? Math.max(state.storm, state.weather.fall) : 0);

/** A blade's pass (docs/plan/34-the-vehicles.md wave 3): the cells under it cleared now — the road's
 *  fresh snow gone there, for every car's grip, till the storm lays it again (shared car/world.ts). */
export function ploughAt(
  state: WorldState,
  x: number,
  z: number,
  a: number,
  ahead: number,
  width: number,
  now: number,
) {
  if (snowing(state) < 0.05) return;
  for (const c of bladeCells(x, z, a, ahead, width))
    if ((state.ploughed.get(c) ?? 0) < now - 1000) state.ploughed.set(c, now);
}

/** Cells snowed over again forgotten; all of them once it's stopped snowing (no fresh snow to clear). */
export function ploughedSweep(state: WorldState, now: number) {
  if (state.ploughed.size === 0) return;
  if (snowing(state) < 0.05) {
    state.ploughed.clear();
    return;
  }
  for (const [c, at] of state.ploughed) if (now - at > PLOUGHED_MS) state.ploughed.delete(c);
}
