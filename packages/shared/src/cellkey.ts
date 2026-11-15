// A grid cell (cx, cz) as one number, for a Map's key (docs/plan/91-the-big-map.md phase 7, F2b): ±2^20 cells
// each way — at the land's 32 m chunks ±33,000 km; the packing before was ±2,048 (±65 km at 32 m), past it two
// places had one key. Exact while it's under 2^53 (here under 2^42).
const HALF = 2 ** 20;
export const cellKey = (cx: number, cz: number): number => (cx + HALF) * (2 * HALF) + (cz + HALF);
