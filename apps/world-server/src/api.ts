import { createHmac } from "node:crypto";
import type { Layout, WorldObjectDef } from "@yutopia/shared";
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
  return createHmac("sha256", config.internalSecret()).update(`${ts}.${method.toUpperCase()}.${path}.${raw}`).digest("hex");
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
  if (!res.ok) throw new ApiError(`API ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
  return (await res.json()) as T;
}

export interface WorldInfo {
  name: string;
  mapKey: string;
  seeded: boolean;
  objects: WorldObjectDef[];
  layout?: unknown;
  playlists?: unknown; // the YouTube playlists played here (features/media.ts)
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
  seed: (objects: WorldObjectDef[]) => call<{ objects: WorldObjectDef[] }>("POST", "/world/seed", { objects }),
  putLayout: (layout: Layout) => call("PUT", "/world/layout", layout),
  putPlaylists: (playlists: unknown[]) => call("PUT", "/world/playlists", { playlists }),
  putObject: (o: WorldObjectDef) => call<{ object: WorldObjectDef }>("PUT", "/objects", o),
  deleteObject: (uid: string) => call("DELETE", `/objects/${encodeURIComponent(uid)}`),
  // a cartridge someone uploaded (game room)
  game: (gameId: number) =>
    call<{ game: { id: string; system: string; title: string; color: string; players: number } }>("GET", `/games/${gameId}`),
  // the desk that's yours (among `desks`); `assign`: give you a free one if you have none
  desk: (userId: number, desks: string[], assign = true) =>
    call<{ desk: string | null }>("POST", "/desk", { user_id: userId, desks, assign }),
  // where this person arrives when they picked a spot of their own (null: the world's)
  spawn: (userId: number) => call<{ spawn: { x: number; y: number } | null }>("GET", `/spawn/${userId}`),
  putSpawn: (userId: number, spawn: { x: number; y: number } | null) => call("PUT", `/spawn/${userId}`, { spawn }),
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
  // a call that ended (features/phone.ts): written into the thread, for Recents and "missed"
  phoneCall: (c: { from: number; to: number[]; end: string; secs: number; video: boolean; answered: number[] }) =>
    call("POST", "/phone/calls", c),
};
