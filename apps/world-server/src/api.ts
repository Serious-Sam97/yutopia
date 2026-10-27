import { createHmac } from "node:crypto";
import type { Layout, WorldObjectDef } from "@yutopia/shared";
import type { Inventory } from "@yutopia/shared/inventory";
import type { PetRecord } from "@yutopia/shared/pets";
import { config } from "./config.ts";
import { metrics } from "./metrics.ts";

// A non-2xx answer from the API; `status` tells a refusal (4xx) from an outage.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// The internal calls' signature (apps/api VerifyInternalSignature): HMAC-SHA256 with
// YUTOPIA_INTERNAL_SECRET over "{ts}.{METHOD}.{path?query}.{raw body}", hex. Both
// ways: our calls to the API, and the API's pushes to us (/internal/push).
export function signInternal(ts: string, method: string, path: string, raw: string): string {
  return createHmac("sha256", config.internalSecret())
    .update(`${ts}.${method.toUpperCase()}.${path}.${raw}`)
    .digest("hex");
}

// Signed calls to Yutopia's API, /api/internal/* (apps/api InternalController).
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const full = `/api/internal${path}`;
  const res = await fetch(`${config.apiInternal}${full}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Yutopia-Timestamp": ts,
      "X-Yutopia-Signature": signInternal(ts, method, full, raw),
    },
    body: raw || undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) metrics.inc("api_errors_total");
  if (!res.ok)
    throw new ApiError(`API ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
  return (await res.json()) as T;
}

export interface WorldInfo {
  name: string;
  mapKey: string;
  seeded: boolean;
  objects: WorldObjectDef[];
  layout?: unknown;
  playlists?: unknown; // the YouTube playlists played here (features/media.ts)
  loot?: unknown; // the Grounds' loot: spots, the night's budget, drops (features/survival.ts)
  karts?: unknown; // the Kart Park's record (features/karts.ts)
}

// A survivor (docs/plan/30-the-dark.md, phase 2): what they carry, their vitals
// (stamina always comes back: not kept), the pages they've found, whether the
// gatehouse locker has given them their first (loaded) revolver, the day (shared
// dayOf) the lobby's locker last gave them its kit.
export interface SurvivorRecord {
  inventory: Omit<Inventory, "pages">;
  vitals: { hp: number; wm: number; bat: number };
  pages: string[];
  issued: boolean;
  kitDay?: number | null;
}

export interface PresenceEntry {
  user_id: number;
  name: string;
  area: string | null;
  area_name: string | null;
  status: string;
}

export const api = {
  world: () => call<WorldInfo>("GET", "/world"),
  // everyone with an account (features/spot.ts: what's left of anyone gone comes down)
  members: () => call<{ ids: number[] }>("GET", "/members"),
  seed: (objects: WorldObjectDef[]) => call<{ objects: WorldObjectDef[] }>("POST", "/world/seed", { objects }),
  putLayout: (layout: Layout) => call("PUT", "/world/layout", layout),
  putPlaylists: (playlists: unknown[]) => call("PUT", "/world/playlists", { playlists }),
  putKarts: (record: unknown) => call("PUT", "/world/karts", { record }),
  putObject: (o: WorldObjectDef) => call<{ object: WorldObjectDef }>("PUT", "/objects", o),
  deleteObject: (uid: string) => call("DELETE", `/objects/${encodeURIComponent(uid)}`),
  // a cartridge someone uploaded (game room)
  game: (gameId: number) =>
    call<{ game: { id: string; system: string; title: string; color: string; players: number } }>(
      "GET",
      `/games/${gameId}`,
    ),
  // the desk that's yours (among `desks`); `assign`: give you a free one if you have none
  desk: (userId: number, desks: string[], assign = true) =>
    call<{ desk: string | null }>("POST", "/desk", { user_id: userId, desks, assign }),
  // where this person arrives when they picked a spot of their own (null: the world's)
  spawn: (userId: number) =>
    call<{ spawn: { x: number; y: number; level?: number | null } | null }>("GET", `/spawn/${userId}`),
  putSpawn: (userId: number, spawn: { x: number; y: number; level?: number } | null) =>
    call("PUT", `/spawn/${userId}`, { spawn }),
  // where someone was when they last left (they come back there: docs/plan/36-the-ghost.md)
  lastSpot: (userId: number) =>
    call<{ spot: { x: number; y: number; level: number; d: number } | null }>("GET", `/last-spot/${userId}`),
  putLastSpots: (spots: { user_id: number; x: number; y: number; level: number; d: number }[]) =>
    call("PUT", "/last-spots", { spots }),
  // who's in the world and where (the phone's contacts show it)
  presence: (people: PresenceEntry[]) => call("POST", "/presence", { people }),
  vortexLine: (context: { event: string; user_id: number | null }) =>
    call<{ line: string | null; mood?: string; personal: boolean }>("POST", "/vortex", context),
  // someone's pets (features/pets.ts): all of them, a new one, a change, one let go
  pets: (userId: number) => call<{ pets: PetRecord[] }>("GET", `/pets/${userId}`),
  createPet: (userId: number, pet: Omit<PetRecord, "id">) => call<{ pet: PetRecord }>("POST", `/pets/${userId}`, pet),
  savePet: (userId: number, petId: number, patch: Partial<PetRecord>) =>
    call<{ pet: PetRecord }>("PUT", `/pets/${userId}/${petId}`, patch),
  deletePet: (userId: number, petId: number) => call("DELETE", `/pets/${userId}/${petId}`),
  // the dark: someone's pockets and vitals (null: never been out), saved; the Grounds' loot
  survivor: (userId: number) => call<{ survivor: SurvivorRecord | null }>("GET", `/survivors/${userId}`),
  saveSurvivor: (userId: number, s: SurvivorRecord) => call("PUT", `/survivors/${userId}`, s),
  putLoot: (loot: unknown) => call("PUT", "/world/loot", { loot }),
  // a call that ended (features/phone.ts): written into the thread, for Recents and "missed"
  phoneCall: (c: { from: number; to: number[]; end: string; secs: number; video: boolean; answered: number[] }) =>
    call("POST", "/phone/calls", c),
  // how the game ran for the players (features/perf.ts): a minute's reports at a time
  perfReports: (reports: PerfRow[]) => call<{ saved: number }>("POST", "/perf-reports", { reports }),
  // the GPS: someone's phone book (only they see where someone sharing is)
  phoneContacts: (userId: number) => call<{ ids: number[] }>("GET", `/phone/contacts/${userId}`),
};

// One player's report as the API keeps it (docs/plan/39-the-telemetry.md)
export interface PerfRow {
  user_id: number;
  at: number; // ms
  session: string;
  version: string; // the client's build (docs/plan/40-the-version.md)
  secs: number;
  view: string;
  quality: string;
  level: number;
  area: string;
  x: number;
  y: number;
  fps: number;
  frame_med: number;
  frame_p95: number;
  frame_worst: number;
  gap_p95: number;
  over33: number;
  over50: number;
  long_tasks: number;
  draws: number | null;
  ping_med: number | null;
  ping_p95: number | null;
  snaps: number;
  browser: string;
  gpu: string;
  stages: Record<string, number>;
  machine: Record<string, unknown>;
  context: Record<string, unknown>;
}
