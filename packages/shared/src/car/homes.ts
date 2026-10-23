import { BUILDINGS, TOWN_CARS, TRACTOR } from "../grounds.ts";
import type { CarKind } from "./specs.ts";

// The cars that live away from the lot (docs/plan/34-the-vehicles.md, wave 1): every car parked
// along Main Street, and one or two where people are — the farm's pickup, two on Church Street by
// the townhouses, a 4x4 behind the boathouse, the gas station's rental. Each is a lot car like the
// others (anyone takes any free one), but its home is here: the tow brings it back to this spot,
// not to the lot. A few have a role: a police car by the town hall, two taxis by the hotel.
// Positions are the Grounds' (the building's coords), `a` its heading (atan2 of z, x).

export type CarRole = "police" | "taxi" | "rental";
export interface HomeCar {
  id: string;
  x: number;
  z: number;
  a: number;
  model: CarKind;
  colour: number; // building.ts CAR_COLOURS
  wagon?: boolean;
  snowy?: boolean;
  role?: CarRole;
}

export const HOME_CARS: HomeCar[] = (() => {
  // (Main Street's, as they were drawn: nosed as the lot's are at rot 0 / 2)
  const out: HomeCar[] = TOWN_CARS.map((c, i) => ({
    id: `town-car-${i}`,
    x: c.x,
    z: c.z,
    a: c.dir > 0 ? Math.PI : 0,
    model: "sedan",
    colour: c.colour,
    wagon: c.wagon,
    snowy: c.snowy,
  }));
  // the police car: on the town hall's side of the street, before it; the taxis: by the hotel
  const hall = BUILDINGS.find((b) => b.key === "hall");
  const hotel = BUILDINGS.find((b) => b.key === "hotel");
  const near = (b: { x0: number; x1: number } | undefined, z: number) =>
    b ? out.filter((c) => !c.wagon && c.z < z && c.x > b.x0 - 6 && c.x < b.x1 + 6) : [];
  const police = near(hall, -405)[0];
  if (police) Object.assign(police, { role: "police", colour: 4 });
  // (the two nearest the hotel's door: the square takes its side of the street)
  const door = hotel ? (hotel.x0 + hotel.x1) / 2 : 440;
  for (const c of out
    .filter((c) => c !== police && !c.wagon)
    .sort((p, q) => Math.abs(p.x - door) - Math.abs(q.x - door))
    .slice(0, 2))
    Object.assign(c, { role: "taxi" });
  out.push(
    { id: "farm-pickup", x: 447, z: -268, a: 0, model: "pickup", colour: 7, snowy: true },
    { id: "church-car-0", x: 418, z: -452, a: -Math.PI / 2, model: "sedan", colour: 2, snowy: true },
    { id: "church-car-1", x: 422, z: -472, a: Math.PI / 2, model: "sedan", colour: 1, wagon: true, snowy: true },
    { id: "boathouse-4x4", x: -265, z: -113, a: 0, model: "offroad", colour: 0, snowy: true },
    { id: "gas-rental", x: 322.5, z: -381, a: Math.PI, model: "sedan", colour: 3, role: "rental" },
    // (wave 2) two snowmobiles out on the pond's ice by the boathouse, one and the snowcat at
    // the Grounds shed
    // (west of the boathouse's dock — x −254 to −251 — nosed south, out over the ice)
    { id: "pond-sled-0", x: -262, z: -88, a: Math.PI / 2, model: "snowmobile", colour: 1 },
    { id: "pond-sled-1", x: -266.5, z: -88, a: Math.PI / 2, model: "snowmobile", colour: 8 },
    { id: "shed-sled", x: -143, z: 106, a: Math.PI / 2, model: "snowmobile", colour: 2 },
    { id: "shed-snowcat", x: -155, z: 104, a: 0, model: "snowcat", colour: 8 },
    // (wave 3) the town's plough truck at the kerb on Main Street's south side (its long free stretch); the farm's
    // tractor where it always stood (shared grounds.ts TRACTOR: nose along its turn); a toboggan
    // on the pond's west bank, nosed down it to the ice
    { id: "town-plough", x: 484, z: -410.7, a: 0, model: "ploughtruck", colour: 8 },
    { id: "farm-tractor", x: TRACTOR.x, z: TRACTOR.z, a: TRACTOR.ry, model: "tractor", colour: 1, snowy: true },
    { id: "pond-toboggan", x: -306, z: -54, a: 0, model: "toboggan", colour: 5 },
  );
  return out;
})();
