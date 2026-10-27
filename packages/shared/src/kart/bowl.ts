// The battle bowl as a world for the kart (docs/plan/46-the-karts.md, K-M2/phase 5): a flat floor,
// banked snow walls rising round it to the rim (karts ride up them: the ground's height there is
// the bank's), the rim's rail the wall. Its spawns, round the floor's edge, facing in.

import { KART_PARK } from "./land.ts";
import { KART_BOWL } from "./park.ts";
import type { KartUnder, KartWorld } from "./sim.ts";

/** The bank's height `d` metres from the bowl's middle (0 on the floor, its wall at the rim). */
export function bankAt(d: number): number {
  const B = KART_BOWL;
  if (d <= B.floor) return 0;
  const u = Math.min(1, (d - B.floor) / (B.r - B.floor));
  // (a quarter-pipe: 1 − cos, as tp/karts3d.ts draws it)
  return B.wall * (1 - Math.cos((u * Math.PI) / 2));
}

export function kartBowlWorld(base = KART_PARK.h): KartWorld {
  const B = KART_BOWL;
  return {
    under(x: number, z: number): KartUnder {
      const d = Math.hypot(x - B.x, z - B.z);
      return { y: base + bankAt(d), ground: d < B.floor ? "asphalt" : "snow" };
    },
    wall(x: number, z: number, _y: number, r: number) {
      const dx = x - B.x;
      const dz = z - B.z;
      const d = Math.hypot(dx, dz);
      const lim = B.r - 0.4 - r;
      if (d <= lim) return null;
      return { nx: -dx / d, nz: -dz / d, depth: d - lim };
    },
  };
}

/** The bowl's spawns: eight round the floor's edge, facing its middle. */
export function bowlSpawns(): { x: number; z: number; a: number }[] {
  const B = KART_BOWL;
  return Array.from({ length: 8 }, (_, i) => {
    const t = (i / 8) * Math.PI * 2;
    const x = B.x + Math.cos(t) * B.floor * 0.88;
    const z = B.z + Math.sin(t) * B.floor * 0.88;
    return { x, z, a: Math.atan2(B.z - z, B.x - x) };
  });
}
/** The bowl's crates: ten on the floor, in two rings. */
export function bowlCrates(): { x: number; z: number }[] {
  const B = KART_BOWL;
  return Array.from({ length: 10 }, (_, i) => {
    const t = (i / 10) * Math.PI * 2 + 0.3;
    const r = (i % 2 ? 0.55 : 0.25) * B.floor;
    return { x: B.x + Math.cos(t) * r, z: B.z + Math.sin(t) * r };
  });
}
