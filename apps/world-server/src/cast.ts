import { biOf, type NpcDef, packLook, parseCast } from "@yutopia/shared/npc";
import { townCast } from "@yutopia/shared/npc/town";
import { api, type WorldInfo } from "./api.ts";
import { config } from "./config.ts";
import type { Npc } from "./schema.ts";

// The world's cast as the room has it (docs/plan/120-god-mode-npcs.md): every NPC by key, from the API (seeded once
// with the town's people by the first room that finds it never was), offline the town's or the world file's. The
// town's features make their people from it — someone not in it isn't made — and take a change live (the room's
// `cast` hook, from the API's POST /internal/cast).

export type Cast = ReadonlyMap<string, NpcDef>;

export function castMap(list: NpcDef[]): Map<string, NpcDef> {
  return new Map(list.map((d) => [d.key, d]));
}

/** The cast a room opens with: the API's, seeded first if it never was (the API down mid-seed: the town's, for now). */
export async function loadCast(info: (WorldInfo & { npcs?: unknown }) | null): Promise<NpcDef[]> {
  if (config.offline || !info) return Array.isArray(info?.npcs) ? parseCast(info.npcs) : townCast();
  if (Array.isArray(info.npcs)) return parseCast(info.npcs);
  try {
    const res = await api.seedNpcs(townCast());
    console.log(`[cast] ${res.seeded ? "seeded the town's people" : "already seeded"}: ${res.npcs.length} in the cast`);
    return parseCast(res.npcs);
  } catch (e) {
    console.warn("[cast] couldn't seed the cast, the town's for now:", (e as Error).message);
    return townCast();
  }
}

/** A string as the wire can carry it: @colyseus/schema 3.0.76 writes a str 8's length as `length % 255`, so one of
 *  exactly 255 bytes arrives as "" (and what follows it misread) — one more byte, a space, gets it there whole. */
export function wire(s: string): string {
  return Buffer.byteLength(s, "utf8") === 255 ? `${s} ` : s;
}

/** Their name, what they do and their look on their `Npc`, as the cast says (the client draws them from these). */
export function dress(npc: Npc, d: NpcDef) {
  const name = wire(d.name);
  const role = wire(biOf(d.role));
  const look = wire(packLook(d.look));
  if (npc.name !== name) npc.name = name;
  if (npc.role !== role) npc.role = role;
  if (npc.look !== look) npc.look = look;
}
