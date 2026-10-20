// The feet on the ground (docs/plan/29-the-move.md, M2): how hard a body can
// speed up, slow down and turn on each footing. Speed caps stay the ground's
// (`Grid.speedAt`, grounds.ts `speedOn`); this is how you get there.

export type Footing = "floor" | "walk" | "asphalt" | "path" | "snow" | "deep" | "ice" | "rock";

export interface Grip {
  /** tiles / s² towards the speed you want */
  accel: number;
  /** tiles / s² slowing down (letting go, turning back) */
  decel: number;
  /** how quickly the facing comes round, a share of the body's turn rate */
  turn: number;
  /** tiles / s² a slide loses to the ground */
  slide: number;
}

export const GRIP: Record<Footing, Grip> = {
  floor: { accel: 30, decel: 38, turn: 1, slide: 6 },
  walk: { accel: 30, decel: 38, turn: 1, slide: 6.5 },
  asphalt: { accel: 30, decel: 38, turn: 1, slide: 7 },
  path: { accel: 24, decel: 26, turn: 0.9, slide: 4.5 },
  snow: { accel: 18, decel: 22, turn: 0.8, slide: 5.5 },
  deep: { accel: 10, decel: 16, turn: 0.6, slide: 12 },
  // you skate: speeding up and stopping both take a while, a stop is a slide
  ice: { accel: 4, decel: 2.5, turn: 0.45, slide: 1.2 },
  rock: { accel: 20, decel: 24, turn: 0.85, slide: 9 },
};

export function footGrip(s: string | undefined): Grip {
  return GRIP[(s ?? "floor") as Footing] ?? GRIP.floor;
}
