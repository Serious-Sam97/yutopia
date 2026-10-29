import { ANCHORED, BUILDINGS, type BuildingKind, checkEdits, NATIVE_FACES, PREFABS, terrainAt } from "./grounds.ts";
import type { BuildingDef, GroundsEdits } from "./grounds-edits.ts";

// God mode's buildings (docs/plan/53-the-god-mode.md, phase 9): a prefab put down — any kind god
// mode builds, sized within its limits, its floors, its door's side (turned in quarters), its
// walls' colour, its sign, whether you walk in (its generated inside) — moved, changed, taken
// away; the generator's own changed or taken away by key (what's anchored stays). Where one
// can't go: the rule book's, and land too steep for a pad.

export const BUILDING_NAMES: Partial<Record<BuildingKind, string>> = {
  house: "House",
  shop: "Shop",
  bar: "Bar",
  diner: "Diner",
  hotel: "Hotel",
  church: "Church",
  barn: "Barn",
  farmhouse: "Farmhouse",
  silo: "Silo",
  shed: "Shed",
  gas: "Gas station",
  boathouse: "Boathouse",
};
/** The kinds that have a sign over their door. */
export const SIGNED = new Set<BuildingKind>(["shop", "bar", "diner", "hotel"]);
/** How much the land may fall across a plot before a pad would be a cutting (m). */
export const PAD_STEEP = 4;

/** The building at (x, z) (on its plot), its key; or null. */
export function buildingAt(x: number, z: number): string | null {
  for (const b of BUILDINGS) if (b.kind !== "hq" && x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) return b.key;
  return null;
}
/** A building as it is now (laid: the draft's). */
export function buildingDefOf(key: string): BuildingDef | null {
  const b = BUILDINGS.find((u) => u.key === key);
  if (!b) return null;
  const { stored: _s, ...d } = b;
  return { ...d };
}
/** Why a building can't be moved or taken away, or null. */
export function buildingLocked(key: string): string | null {
  return ANCHORED[`building:${key}`] ?? null;
}

const isNew = (e: GroundsEdits, key: string) => !!e.buildings?.add?.some((d) => d.key === key);
export function newBuildingKey(e: GroundsEdits): string {
  let n = 1;
  const taken = new Set((e.buildings?.add ?? []).map((d) => d.key));
  while (taken.has(`god-building-${n}`)) n++;
  return `god-building-${n}`;
}
export function newBuildingName(e: GroundsEdits, kind: BuildingKind): string {
  const n = (e.buildings?.add ?? []).filter((d) => d.kind === kind).length + 1;
  return `${BUILDING_NAMES[kind] ?? "Building"} ${n}`;
}
export function addBuilding(e: GroundsEdits, d: BuildingDef): GroundsEdits {
  return { ...e, buildings: { ...e.buildings, add: [...(e.buildings?.add ?? []), d] } };
}
export function changeBuilding(e: GroundsEdits, key: string, patch: Partial<Omit<BuildingDef, "key">>): GroundsEdits {
  if (isNew(e, key))
    return {
      ...e,
      buildings: { ...e.buildings, add: (e.buildings?.add ?? []).map((d) => (d.key === key ? { ...d, ...patch } : d)) },
    };
  return {
    ...e,
    buildings: {
      ...e.buildings,
      change: { ...(e.buildings?.change ?? {}), [key]: { ...e.buildings?.change?.[key], ...patch } },
    },
  };
}
export function removeBuilding(e: GroundsEdits, key: string): GroundsEdits {
  if (isNew(e, key)) {
    const change = { ...(e.buildings?.change ?? {}) };
    delete change[key];
    return { ...e, buildings: { ...e.buildings, add: (e.buildings?.add ?? []).filter((d) => d.key !== key), change } };
  }
  return { ...e, buildings: { ...e.buildings, remove: [...new Set([...(e.buildings?.remove ?? []), key])] } };
}

/** A plot `w` × `d` round (x, z), its corners on whole metres. */
export function plotAt(x: number, z: number, w: number, d: number) {
  const x0 = Math.round(x - w / 2);
  const z0 = Math.round(z - d / 2);
  return { x0, z0, x1: x0 + w, z1: z0 + d };
}
/** Why `next` (the draft with a building put down, moved or changed) can't have building `key`
 *  as it is: the rule book's first word on it, or land too steep for its pad; null: it can. */
export function buildingBlocked(next: GroundsEdits, key: string): string | null {
  const base = next.buildings?.add?.find((u) => u.key === key) ?? buildingDefOf(key);
  if (!base) return null;
  const d: BuildingDef = { ...base, ...next.buildings?.change?.[key] };
  const hs = [
    [d.x0, d.z0],
    [d.x1, d.z0],
    [d.x0, d.z1],
    [d.x1, d.z1],
    [(d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2],
  ].map(([x, z]) => terrainAt(x, z));
  if (Math.max(...hs) - Math.min(...hs) > PAD_STEEP) return "too steep for a building";
  const said = checkEdits(next).find((p) => p.startsWith(`${key}:`) || p.startsWith(`${key} `));
  return said ? said.slice(key.length + 1).trim() : null;
}

/** The kinds god mode puts down, and their limits. */
export const PREFAB_KINDS = Object.keys(PREFABS) as BuildingKind[];
/** The sides a kind's door may face when you walk in (its inside's). */
export const enterFaces = (kind: BuildingKind) => NATIVE_FACES[kind] ?? ["n", "e", "s", "w"];
