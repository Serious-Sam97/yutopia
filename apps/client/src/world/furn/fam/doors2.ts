import { box, type Look, type Model } from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 13 (docs/plan/68-more-furniture.md): Doors & windows — the openings are drawn by
// ../openings.ts; here the skylight: a deep lined well in the ceiling, its glass bright with the day
// (lit by day, a soft blue at night — the world's light does the rest).
const CEILING = 3.27;

export const LOOKS: Record<string, readonly string[]> = {
  skylight: ["Skylight"],
};
export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  skylight: (m: Model) => {
    const [x0, x1, z0, z1] = [0.12, 1.88, 0.12, 1.88];
    const y = CEILING - 0.17;
    // the well's lining, its four sides
    for (const [w, d, x, z] of [
      [x1 - x0, 0.04, 1, z0 + 0.02],
      [x1 - x0, 0.04, 1, z1 - 0.02],
      [0.04, z1 - z0, x0 + 0.02, 1],
      [0.04, z1 - z0, x1 - 0.02, 1],
    ])
      m.add(box([w, 0.17, d]), P.white, { at: [x, y + 0.085, z] });
    // its trim on the ceiling
    for (const [w, d, x, z] of [
      [x1 - x0 + 0.16, 0.08, 1, z0 - 0.04],
      [x1 - x0 + 0.16, 0.08, 1, z1 + 0.04],
      [0.08, z1 - z0, x0 - 0.04, 1],
      [0.08, z1 - z0, x1 + 0.04, 1],
    ])
      m.add(box([w, 0.02, d], 0.004), shade(P.white, 0.95), { at: [x, CEILING - 0.01, z] });
    // the glass, the daylight through it, and its glazing bars
    m.add(box([x1 - x0 - 0.08, 0.01, z1 - z0 - 0.08]), 0xe8f1ff, { at: [1, CEILING - 0.005, 1], glow: true });
    for (const t of [0.5, 1, 1.5]) m.add(box([0.03, 0.03, z1 - z0 - 0.08]), P.alumDark, { at: [t, CEILING - 0.02, 1] });
    m.add(box([x1 - x0 - 0.08, 0.03, 0.03]), P.alumDark, { at: [1, CEILING - 0.02, 1] });
  },
};
