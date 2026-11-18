// The boards to borrow (docs/plan/103-the-skate.md F10a): racks at the parks, one of each board on them for whoever
// asks (`skate:take` {variant}, the server's survival feature) — no money in the game. Placed by the parks.

/** A rack: where it stands — x, z on the ground plane (the buildings' coords: a Player's x, y), y its floor's height
 *  (a Player's z), m — and the way it faces (rad). */
export interface SkateRack {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** One in each park (skate/parks.ts TOWN_PARKS: their floors at 1.5 — parks.test.ts holds them to it): the hall's
 *  inside its door, west of it, against the south wall; the outdoor park's by its south-west corner. `yaw` the plan
 *  way it faces, (cos yaw, sin yaw) over (x, z): −π/2 faces north, into each park. */
export const SKATE_RACKS: SkateRack[] = [
  { id: "rack:hall", x: 485.5, y: 1.5, z: -509.3, yaw: -Math.PI / 2 },
  { id: "rack:yard", x: 464, y: 1.5, z: -449.4, yaw: -Math.PI / 2 },
];

/** How close to a rack a board is taken from, m. */
export const RACK_REACH = 3;
/** How many boards one may carry (the pack, at hand and the left hand together) and still take another. */
export const BOARDS_MAX = 2;

/** The rack a body at (x, y) on the ground plane, its feet at height z (a Player's coords), is in reach of, or null. */
export function rackNear(x: number, y: number, z: number, racks: readonly SkateRack[] = SKATE_RACKS): SkateRack | null {
  let best: SkateRack | null = null;
  let bd = RACK_REACH;
  for (const r of racks) {
    const d = Math.hypot(x - r.x, y - r.z, z - r.y);
    if (d <= bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

/** (the boards stood in each rack, west to east: one of each shape) and their names (the Blender manifest's) */
export const RACK_BOARDS: Record<string, { variant: string; name: string }[]> = {
  "rack:hall": [
    { variant: "vert-classic", name: "Varlow Comet" },
    { variant: "street-pop", name: "Larch Kerb" },
    { variant: "cruiser-classic", name: "Sandell Coaster" },
  ],
  "rack:yard": [
    { variant: "vert-fish", name: "Varlow Marlin" },
    { variant: "street-slick", name: "Larch Slick" },
    { variant: "cruiser-wood", name: "Sandell Grove" },
  ],
};
/** Each board's place along its rack (m from its middle, along x), west to east. */
export const RACK_SLOTS = [-0.5, 0, 0.5];
/** The rack's board nearest someone standing at (x, y): the one they'd take. */
export function rackBoard(r: SkateRack, x: number): { variant: string; name: string } | null {
  const bs = RACK_BOARDS[r.id];
  if (!bs?.length) return null;
  let i = 0;
  for (let k = 1; k < bs.length; k++) if (Math.abs(r.x + RACK_SLOTS[k] - x) < Math.abs(r.x + RACK_SLOTS[i] - x)) i = k;
  return bs[i];
}
