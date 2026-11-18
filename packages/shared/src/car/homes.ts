import { RACKS, rackSpots } from "../bike/racks.ts";
import { BUILDINGS, MOTORS, TOWN_CARS, TRACTOR } from "../grounds.ts";
import type { GroundsEdits, VehicleDef } from "../grounds-edits.ts";
import type { CarKind } from "./specs.ts";

// The cars that live away from the lot (docs/plan/34-the-vehicles.md, wave 1): every car parked
// along Main Street, and one or two where people are — the farm's pickup, two on Church Street by
// the townhouses, a 4x4 behind the boathouse, the gas station's rental. Each is a lot car like the
// others (anyone takes any free one), but its home is here: the tow brings it back to this spot,
// not to the lot. A few have a role: a police car by the town hall, two taxis by the hotel.
// Positions are the Grounds' (the building's coords), `a` its heading (atan2 of z, x).

// (`show`: one of MOTORS' vehicles on its forecourt — docs/plan/43-the-spot.md — looked at, never driven)
export type CarRole = "police" | "taxi" | "rental" | "show";
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
  /** (plan 101) its look as made (a rack's bike: its variant and paint); (plan 102) God mode's, whole */
  look?: { variant: string; colour: number; colour2?: number; extras?: string[]; wheels?: string };
  /** (plan 102) its plate, God mode's */
  plate?: string;
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
    // (wave 2) two snowmobiles on the pond's bank by the boathouse, one and the snowcat at the
    // Grounds shed
    // (west of the boathouse, on the bank above the water — plan 66: it's deep where they stood —
    // nosed down towards it)
    { id: "pond-sled-0", x: -280, z: -103, a: Math.PI / 2, model: "snowmobile", colour: 1 },
    { id: "pond-sled-1", x: -284.5, z: -103, a: Math.PI / 2, model: "snowmobile", colour: 8 },
    { id: "shed-sled", x: -143, z: 106, a: Math.PI / 2, model: "snowmobile", colour: 2 },
    { id: "shed-snowcat", x: -155, z: 104, a: 0, model: "snowcat", colour: 8 },
    // (wave 3) the town's plough truck at the kerb on Main Street's south side (its long free stretch); the farm's
    // tractor where it always stood (shared grounds.ts TRACTOR: nose along its turn); a toboggan
    // on the pond's west bank, nosed down it to the ice
    { id: "town-plough", x: 484, z: -410.7, a: 0, model: "ploughtruck", colour: 8 },
    { id: "farm-tractor", x: TRACTOR.x, z: TRACTOR.z, a: TRACTOR.ry, model: "tractor", colour: 1, snowy: true },
    { id: "pond-toboggan", x: -306, z: -54, a: 0, model: "toboggan", colour: 5 },
  );
  // (plan 101) the town's bikes, each in its rack
  for (const r of RACKS)
    rackSpots(r).forEach((p, i) => {
      const b = r.bikes[i];
      out.push({
        id: b.id,
        x: p.x,
        z: p.z,
        a: p.a,
        model: b.model,
        colour: 0,
        look: { variant: b.variant, colour: b.colour },
      });
    });
  // (wave 4) the car dealer's forecourt: one of each, swept clean (docs/plan/43-the-spot.md)
  const SHOW: Record<string, number> = {
    sedan: 3,
    offroad: 1,
    pickup: 8,
    snowmobile: 2,
    ploughtruck: 8,
    snowcat: 8,
    tractor: 1,
    toboggan: 7,
  };
  for (const v of MOTORS.show)
    out.push({
      id: `motors-${v.model}`,
      x: v.x,
      z: v.z,
      a: v.a,
      model: v.model as CarKind,
      colour: SHOW[v.model] ?? 6,
      role: "show",
    });
  return out;
})();

// ── God mode's (docs/plan/102-god-mode-vehicles.md) ─────────────────────────────────────────────────

/** A town vehicle's home as God mode has it (its fields over the code's). */
function withDef(h: HomeCar, d: Partial<Omit<VehicleDef, "key">>): HomeCar {
  const out: HomeCar = { ...h };
  if (typeof d.x === "number") out.x = d.x;
  if (typeof d.z === "number") out.z = d.z;
  if (typeof d.a === "number") out.a = d.a;
  if (typeof d.model === "string") out.model = d.model as CarKind;
  if (d.look) out.look = { ...d.look };
  if (d.role !== undefined) out.role = (d.role || undefined) as CarRole | undefined;
  if (d.plate !== undefined) out.plate = d.plate || undefined;
  return out;
}
/** A vehicle God mode placed, as a home. */
export function homeOfDef(d: VehicleDef): HomeCar {
  return withDef({ id: d.key, x: d.x, z: d.z, a: d.a, model: d.model as CarKind, colour: 0 }, d);
}
/** A home as God mode's own (its draft's entry). */
export function defOfHome(h: HomeCar): VehicleDef {
  const d: VehicleDef = { key: h.id, model: h.model, x: h.x, z: h.z, a: h.a };
  if (h.look) d.look = { ...h.look };
  if (h.role) d.role = h.role;
  if (h.plate) d.plate = h.plate;
  return d;
}
/** The vehicles that live in the world with God mode's edits laid over the code's: the town's own (moved, changed, taken
 *  away by their ids) and those it placed. With none, `HOME_CARS`. */
export function homesOf(e: GroundsEdits | null | undefined): HomeCar[] {
  const s = e?.vehicles;
  if (!s || (!s.add?.length && !s.remove?.length && !Object.keys(s.change ?? {}).length)) return HOME_CARS;
  const gone = new Set(s.remove ?? []);
  const own = new Set(HOME_CARS.map((h) => h.id));
  const out: HomeCar[] = [];
  for (const h of HOME_CARS) {
    if (gone.has(h.id)) continue;
    const c = s.change?.[h.id];
    out.push(c ? withDef(h, c) : h);
  }
  for (const d of s.add ?? [])
    if (!gone.has(d.key) && !own.has(d.key)) out.push(withDef(homeOfDef(d), s.change?.[d.key] ?? {}));
  return out;
}
/** A home vehicle's object props as its home has them, over what it had (`was`): what a home says it is, its alone
 *  (an older look, role or plate dropped — plan 102's rollbacks), and set down standing (a bike that lay where it fell
 *  stands at home). Its place is parkAt's. */
export function homeProps(h: HomeCar, was: Record<string, unknown> = {}): Record<string, unknown> {
  const { model: _m, wagon: _w, snowy: _s, role: _r, look: _l, plate: _p, down: _d, lie: _q, ly: _y, ...rest } = was;
  const props: Record<string, unknown> = { ...rest, level: 0, variant: h.colour, home: 1 };
  if (h.model !== "sedan") props.model = h.model;
  if (h.wagon) props.wagon = 1;
  if (h.snowy) props.snowy = 1;
  if (h.role) props.role = h.role;
  // (plan 101: a rack's bike as it was made, its variant and paint; plan 102: God mode's, whole)
  if (h.look) props.look = { extras: [], wheels: "steel", ...h.look };
  if (h.plate) props.plate = h.plate;
  return props;
}
/** A vehicle that isn't a home (a lot's car, a player's own, a spawn) moved by God mode: its props then — not
 *  someone's own, its look, role and plate too; set down standing, as if just left there. */
export function movedProps(was: Record<string, unknown>, c: Partial<VehicleDef>, now: number): Record<string, unknown> {
  const props: Record<string, unknown> = { ...was };
  delete props.down;
  delete props.lie;
  delete props.ly;
  if (!props.ownerId) {
    if (c.look) props.look = { extras: [], wheels: "steel", ...c.look };
    if (c.role !== undefined) {
      if (c.role) props.role = c.role;
      else delete props.role;
    }
    if (c.plate) props.plate = c.plate;
  }
  props.parkedAt = now;
  return props;
}

/** What laying `now` over `was` does to the world's vehicles (plan 102): a home made or changed (`home`), one taken
 *  away (`gone`), and any other vehicle moved or taken away once (`once`: its change; null, taken away). */
export type VehicleStep =
  | { id: string; home: HomeCar }
  | { id: string; gone: true }
  | { id: string; once: Partial<VehicleDef> | null };
export function vehicleSteps(
  was: GroundsEdits | null | undefined,
  now: GroundsEdits | null | undefined,
  effects: (
    s: GroundsEdits["vehicles"],
  ) => Map<string, { add: Record<string, unknown> } | { change: Record<string, unknown> } | { remove: true }>,
): VehicleStep[] {
  const out: VehicleStep[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (same(was?.vehicles ?? null, now?.vehicles ?? null)) return out;
  const before = new Map(homesOf(was).map((h) => [h.id, h]));
  const after = homesOf(now);
  const ids = new Set(after.map((h) => h.id));
  for (const h of after) if (!same(before.get(h.id) ?? null, h)) out.push({ id: h.id, home: h });
  for (const id of before.keys()) if (!ids.has(id)) out.push({ id, gone: true });
  const e0 = effects(was?.vehicles);
  for (const [k, e] of effects(now?.vehicles)) {
    if (ids.has(k) || before.has(k) || same(e0.get(k) ?? null, e)) continue;
    out.push({ id: k, once: "remove" in e ? null : (("change" in e ? e.change : e.add) as Partial<VehicleDef>) });
  }
  return out;
}

// God mode's steps on its vehicles (as grounds-things' on things): a new one's own entry changed, any other's by its key
const placed = (e: GroundsEdits, key: string) => !!e.vehicles?.add?.some((d) => d.key === key);
/** Placed. */
export function addVehicle(e: GroundsEdits, d: VehicleDef): GroundsEdits {
  return { ...e, vehicles: { ...e.vehicles, add: [...(e.vehicles?.add ?? []), d] } };
}
/** Moved, turned, repainted, its role or plate changed. */
export function changeVehicle(e: GroundsEdits, key: string, patch: Partial<Omit<VehicleDef, "key">>): GroundsEdits {
  if (placed(e, key))
    return {
      ...e,
      vehicles: {
        ...e.vehicles,
        add: (e.vehicles?.add ?? []).map((d) => (d.key === key ? { ...d, ...patch } : d)),
      },
    };
  return {
    ...e,
    vehicles: {
      ...e.vehicles,
      change: { ...(e.vehicles?.change ?? {}), [key]: { ...e.vehicles?.change?.[key], ...patch } },
    },
  };
}
/** Taken away (a placed one: as if never placed). */
export function removeVehicle(e: GroundsEdits, key: string): GroundsEdits {
  if (placed(e, key)) {
    const change = { ...(e.vehicles?.change ?? {}) };
    delete change[key];
    return {
      ...e,
      vehicles: { ...e.vehicles, add: (e.vehicles?.add ?? []).filter((d) => d.key !== key), change },
    };
  }
  return { ...e, vehicles: { ...e.vehicles, remove: [...new Set([...(e.vehicles?.remove ?? []), key])] } };
}

/** Whether an id is one of the town's own (from the code) or one God mode placed. */
export const isHome = (homes: readonly HomeCar[], id: string): boolean => homes.some((h) => h.id === id);

/** A new vehicle's key in these edits. */
export function newVehicleKey(e: GroundsEdits): string {
  const used = new Set([...(e.vehicles?.add ?? []).map((d) => d.key), ...HOME_CARS.map((h) => h.id)]);
  let i = (e.vehicles?.add?.length ?? 0) + 1;
  while (used.has(`god-car-${i}`)) i++;
  return `god-car-${i}`;
}

const ROLES = new Set(["", "police", "taxi", "rental"]);
/** God mode's vehicles, checked (the server's, before a publish): each a kind there is, a place that's a number, a
 *  look that kind may have, a role there is, a plate as plates are; not too many. Problems, said. */
export function checkVehicles(
  e: GroundsEdits,
  ok: { kind: (k: string) => boolean; look: (kind: string, look: unknown) => boolean },
): string[] {
  const out: string[] = [];
  const s = e.vehicles;
  if (!s) return out;
  const no = (m: string) => out.length < 30 && out.push(m);
  if ((s.add?.length ?? 0) > 400) no("Too many vehicles placed: at most 400");
  const one = (key: string, d: Partial<VehicleDef>, whole: boolean) => {
    if (!/^[\w-]{1,64}$/.test(key)) no(`A vehicle's key isn't one: ${key.slice(0, 20)}`);
    if (whole || d.model !== undefined) if (!ok.kind(String(d.model))) no(`${key}: no such vehicle (${d.model})`);
    for (const f of ["x", "z", "a"] as const)
      if ((whole || d[f] !== undefined) && !Number.isFinite(d[f])) no(`${key}: its place isn't a number`);
    if (d.look !== undefined && d.model !== undefined && !ok.look(String(d.model), d.look))
      no(`${key}: a look it can't have`);
    if (d.role !== undefined && !ROLES.has(d.role)) no(`${key}: no such role (${d.role})`);
    if (d.plate !== undefined && (typeof d.plate !== "string" || d.plate.length > 8)) no(`${key}: a plate's 8 at most`);
  };
  for (const d of s.add ?? []) one(d.key, d, true);
  for (const [k, c] of Object.entries(s.change ?? {})) one(k, c, false);
  return out;
}
