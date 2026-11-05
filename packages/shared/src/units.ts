// One world, one unit (docs/plan/72-the-3d-core.md, phase 5): metres everywhere — x/y the ground
// plane, z up; a tile is a metre. Every height the model, the server and the views pass round is
// in metres; the building's measures live here and nowhere else.

/** Floor to floor: a storey (its walls, then the ceiling and the slab over them). */
export const STOREY = 3.5;
/** A wall's height over its floor (the iso art's 128 px, as walls have always stood). */
export const WALL_H = 3.266;
/** A half wall's (the art's 34 px). */
export const HALF_WALL_H = 0.868;
/** The slab under each storey's floor: what's left of a storey over its walls. */
export const SLAB = +(STOREY - WALL_H).toFixed(3);
/** A wall's thickness, centred on its line. */
export const WALL_T = 0.2;

/** The iso item drawings' px a metre of height (45.25 · cos 30°: the iso camera looked down 30°
 *  and a tile's edge was 45.25 px). Only the old item art measures in it — the client's `art/`
 *  sketches drawn through the 3D kit — and it turns metres into its px at its own edge
 *  (`artPx`). Retired with that art (plan 72 phase 12); nothing else may use it. */
export const ART_PX = 45.25 * Math.cos(Math.PI / 6);
/** Metres → the old item art's px (at the art's edge only), to a hundredth of a px (a quarter of a
 *  mm): its drawings were measured in whole and tenth px and test their heights against each other
 *  exactly (a window's sill against its frame), so a window's 0.9187 m comes back as their 36. */
export const artPx = (m: number): number => Math.round(m * ART_PX * 100) / 100;
/** The old item art's px → metres, to 0.1 mm (its measures, read once into the model). */
export const artM = (px: number): number => Math.round((px / ART_PX) * 1e4) / 1e4;
