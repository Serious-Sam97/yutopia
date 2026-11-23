import type { GroundsEdits, Section } from "../grounds-edits.ts";
import type { NpcDef, NpcType } from "./cast.ts";

// NPCs on the map (docs/plan/121-npcs-on-the-map.md): where God mode put each of the cast — the draft's `npcs`
// section of the Grounds' edits, published with revisions and rollback (F1a), one place each, keyed by the cast NPC's
// own key (F2a). A town NPC placed does what their placement says instead of their own way (F3.1a); Vortex is never
// placed (F3.2a). Their place may be out on the land, on a town building's storey or on a studio floor (F4c): `level`
// is the floor (0 the land and the studio's ground floor — plan 72's one frame —, a studio floor above, a town
// building's storey from SPACE_BASE — plan 112). What their type needs comes with it: a seat (sit: the place is the
// seat's), a circle's radius (wander), a route (route); and a home they walk to out of their hours (F8).

/** A route's stop: where, on which floor. */
export interface RoutePoint {
  x: number;
  z: number;
  level: number;
}

export interface NpcPlaceDef {
  /** the cast NPC's key */
  key: string;
  x: number;
  z: number;
  /** which way they face (radians, atan2(dz, dx)) */
  a: number;
  level: number;
  /** what they do while placed: a town NPC's — their own way set aside (F3.1a) —, or anyone's in place of their cast
   *  type; none: their cast type (a town NPC: standing) */
  type?: PlacedType;
  /** wander: the circle's radius round the place (m) */
  r?: number;
  /** route: the stops after the place, in order */
  route?: RoutePoint[];
  /** route: round again from the last to the first (else back the way they came) */
  loop?: boolean;
  /** route: seconds at each stop */
  pause?: number;
  /** a town building's key: out of their hours they walk to it and stay in (F8); none: their hours don't matter (F8.2) */
  home?: string;
}

/** What a placed NPC can do. */
export const PLACED_TYPES = ["stand", "wander", "route", "counter", "sit"] as const;
export type PlacedType = (typeof PLACED_TYPES)[number];

export const PLACE_LIMITS = { r: [1, 40], route: 40, pause: [0, 120], count: 2000 } as const;
const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Every NPC placed, as these edits have them (the section's entries with their changes; those taken away gone). */
export function placesOf(e: GroundsEdits | null | undefined): NpcPlaceDef[] {
  const s = e?.npcs;
  if (!s?.add?.length) return [];
  const gone = new Set(s.remove ?? []);
  const out: NpcPlaceDef[] = [];
  const seen = new Set<string>();
  for (const d of s.add) {
    if (gone.has(d.key) || seen.has(d.key)) continue;
    seen.add(d.key);
    out.push({ ...d, ...(s.change?.[d.key] ?? {}), key: d.key });
  }
  return out;
}

/** Placed somewhere, as these edits have it. */
export function placeOf(e: GroundsEdits | null | undefined, key: string): NpcPlaceDef | undefined {
  return placesOf(e).find((p) => p.key === key);
}

/** The draft's NPCs, put right: each one a cast NPC (not Vortex), numbers that are numbers, their type's needs within
 *  bounds, a home that's a town building. Problems, said for the admin. */
export function checkNpcPlaces(
  e: GroundsEdits,
  ok: {
    /** the cast NPC of a key (undefined: not in the cast) */
    npc: (key: string) => NpcDef | undefined;
    /** a town building's key */
    home: (key: string) => boolean;
    /** a floor that's there */
    level: (level: number) => boolean;
  },
): string[] {
  const out: string[] = [];
  const no = (m: string) => out.length < 30 && out.push(m);
  const s = e.npcs as Section<NpcPlaceDef> | undefined;
  if (!s) return out;
  if ((s.add?.length ?? 0) > PLACE_LIMITS.count) no(`Too many NPCs placed: at most ${PLACE_LIMITS.count}`);
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  for (const d of placesOf(e)) {
    const who = ok.npc(d.key);
    const name = who?.name || who?.role.en || d.key;
    if (!KEY.test(d.key)) {
      no(`An NPC's key isn't one: ${String(d.key).slice(0, 20)}`);
      continue;
    }
    if (!who) {
      no(`${d.key}: not in the cast (deleted?)`);
      continue;
    }
    if (who.behaviour.type === "vortex") no(`${name}: Vortex isn't placed: he keeps his own ways`);
    if (!num(d.x) || !num(d.z) || !num(d.a)) no(`${name}: their place isn't a number`);
    if (d.type !== undefined && !(PLACED_TYPES as readonly string[]).includes(d.type))
      no(`${name}: no such thing to do (${d.type})`);
    if (!Number.isInteger(d.level) || !ok.level(d.level)) no(`${name}: no such floor (${d.level})`);
    if (d.r !== undefined && (!num(d.r) || d.r < PLACE_LIMITS.r[0] || d.r > PLACE_LIMITS.r[1]))
      no(`${name}: a wander's circle is ${PLACE_LIMITS.r[0]}–${PLACE_LIMITS.r[1]} m`);
    if (d.route !== undefined) {
      if (!Array.isArray(d.route) || d.route.length > PLACE_LIMITS.route)
        no(`${name}: a route has ${PLACE_LIMITS.route} stops at most`);
      else
        for (const p of d.route)
          if (!p || !num(p.x) || !num(p.z) || !Number.isInteger(p.level) || !ok.level(p.level)) {
            no(`${name}: a route's stop isn't a place`);
            break;
          }
    }
    if (d.pause !== undefined && (!num(d.pause) || d.pause < PLACE_LIMITS.pause[0] || d.pause > PLACE_LIMITS.pause[1]))
      no(`${name}: a pause is ${PLACE_LIMITS.pause[0]}–${PLACE_LIMITS.pause[1]} s`);
    if (d.home !== undefined && !ok.home(d.home)) no(`${name}: their home isn't a town building (${d.home})`);
  }
  return out;
}

/** What a placed NPC does: the placement's, else their cast type — a town NPC's own way set aside while they're placed
 *  (F3.1a): standing, unless the placement gives them another. */
export function placedType(d: Pick<NpcDef, "behaviour">, place?: Pick<NpcPlaceDef, "type">): PlacedType {
  if (place?.type && (PLACED_TYPES as readonly string[]).includes(place.type)) return place.type;
  const t: NpcType = d.behaviour.type;
  return (PLACED_TYPES as readonly string[]).includes(t) ? (t as PlacedType) : "stand";
}

/** Whether the world's hour is within their hours (a shift past midnight when `to` < `from`). */
export function onDuty(b: Pick<NpcDef["behaviour"], "hours" | "from" | "to">, hour: number, night = 0): boolean {
  if (b.hours === "always") return true;
  if (b.hours === "day") return night < 0.5;
  if (b.hours === "night") return night >= 0.5;
  return b.from <= b.to ? hour >= b.from && hour < b.to : hour >= b.from || hour < b.to;
}
