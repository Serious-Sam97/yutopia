import type { CarKind } from "../car/specs.ts";

// The town's bikes (docs/plan/101-the-bicycles.md F8a): racks where people are — the town square, the boathouse, the
// bus shelter by the campus — each a rack (furniture, `bike_rack`) and the bikes standing in it. Anyone rides one; left
// anywhere, it's taken back to its rack after a while (the cars' homes: shared car/homes.ts, the server's tow).
// Positions are the Grounds' (building coords, x east, z south); a rack's tile (its footprint's corner) and turn.

export interface RackBike {
  id: string;
  model: CarKind;
  /** its look: a variant and a paint (shared car/look.ts `validLook`) */
  variant: string;
  colour: number;
}
export interface Rack {
  id: string;
  /** its footprint's corner (tiles) and its turn (quarters: 0 along x); its look (the furniture's: 3–5 empty) */
  x: number;
  z: number;
  rot: 0 | 1;
  bikes: RackBike[];
  /** no rack drawn there (the town's furniture isn't drawn on the square): its bikes stand on their kickstands */
  bare?: boolean;
}

export const RACKS: Rack[] = [
  {
    // (the town square, its east side by the benches round the statue: stood on their kickstands)
    id: "rack-square",
    bare: true,
    x: 430,
    z: -380,
    rot: 0,
    bikes: [
      { id: "rack-square-0", model: "bike_town", variant: "town-classic", colour: 0x2f4a3b },
      { id: "rack-square-1", model: "bike_town", variant: "town-step", colour: 0xe8dcc0 },
      { id: "rack-square-2", model: "bike_road", variant: "road-race", colour: 0x8e1c1c },
    ],
  },
  {
    // (the boathouse's: for the pond and the woods — the studded one for the ice; out front, west of its door, by the
    // path down to the pond)
    id: "rack-boathouse",
    x: -258,
    z: -111,
    rot: 1,
    bikes: [
      { id: "rack-boathouse-0", model: "bike_mtb", variant: "mtb-winter", colour: 0x22385e },
      { id: "rack-boathouse-1", model: "bike_mtb", variant: "mtb-trail", colour: 0xc9a227 },
      { id: "rack-boathouse-2", model: "bike_bmx", variant: "bmx-free", colour: 0x00a8c6 },
    ],
  },
  {
    // (the bus shelter's, on the road out of the campus)
    id: "rack-shelter",
    x: -8,
    z: -416,
    rot: 1,
    bikes: [
      { id: "rack-shelter-0", model: "bike_town", variant: "town-post", colour: 0x17191c },
      { id: "rack-shelter-1", model: "bike_bmx", variant: "bmx-street", colour: 0xe0287a },
    ],
  },
];

/** Where a rack's bikes stand: across it, one to each of its hoops (the rack's footprint 3 × 2 tiles, turned). */
export function rackSpots(r: Rack): { x: number; z: number; a: number }[] {
  // (along its length every 0.9 m from its middle; nosed across it)
  const long = r.rot === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 };
  const w = r.rot === 0 ? 3 : 2;
  const h = r.rot === 0 ? 2 : 3;
  const cx = r.x + w / 2;
  const cz = r.z + h / 2;
  const a = r.rot === 0 ? Math.PI / 2 : 0;
  return r.bikes.map((_b, i) => {
    const u = (i - (r.bikes.length - 1) / 2) * 0.9;
    return { x: cx + long.x * u, z: cz + long.z * u, a };
  });
}
