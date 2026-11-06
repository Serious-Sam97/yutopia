// One world, one unit (docs/plan/72-the-3d-core.md, phase 5): metres everywhere — x/y the ground
// plane, z up; a tile is a metre. Every height the model, the server and the views pass round is
// in metres; the building's measures live here and nowhere else.

/** Floor to floor: a storey (its walls, then the ceiling and the slab over them). */
export const STOREY = 3.5;
/** A wall's height over its floor (the old art's 128 px, as walls have always stood). */
export const WALL_H = 3.266;
/** A half wall's (the old art's 34 px). */
export const HALF_WALL_H = 0.868;
/** The slab under each storey's floor: what's left of a storey over its walls. */
export const SLAB = +(STOREY - WALL_H).toFixed(3);
/** A wall's thickness, centred on its line. */
export const WALL_T = 0.2;
