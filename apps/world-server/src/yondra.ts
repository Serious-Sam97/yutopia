import { createHmac } from "node:crypto";
import type { Layout, WorldObjectDef } from "@yutopia/shared";
import type { PetRecord } from "@yutopia/shared/pets";
import { config } from "./config.ts";
import { metrics } from "./metrics.ts";

// A non-2xx answer from Yondra; `status` tells a refusal (4xx) from an outage.
export class YondraError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Signed calls to Yondra's /api/internal/yutopia/* (see YutopiaInternalController).
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", config.internalSecret()).update(`${ts}.${raw}`).digest("hex");
  const res = await fetch(`${config.yondraApi}/api/internal/yutopia${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Yutopia-Timestamp": ts,
      "X-Yutopia-Signature": sig,
    },
    body: raw || undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) metrics.inc("yondra_errors_total");
  if (!res.ok)
    throw new YondraError(`Yondra ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
  return (await res.json()) as T;
}

export interface SpaceInfo {
  id: number;
  name: string;
  mapKey: string;
  projectId: number | null;
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

export const yondra = {
  space: (id: number) => call<SpaceInfo>("GET", `/spaces/${id}`),
  seed: (id: number, objects: WorldObjectDef[]) =>
    call<{ objects: WorldObjectDef[] }>("POST", `/spaces/${id}/seed`, { objects }),
  putObject: (id: number, o: WorldObjectDef) => call<{ object: WorldObjectDef }>("PUT", `/spaces/${id}/objects`, o),
  // a cartridge the team uploaded (game room)
  game: (id: number, gameId: number) =>
    call<{ game: { id: string; system: string; title: string; color: string; players: number } }>(
      "GET",
      `/spaces/${id}/games/${gameId}`,
    ),
  deleteObject: (id: number, uid: string) => call("DELETE", `/spaces/${id}/objects/${encodeURIComponent(uid)}`),
  // the desk that's yours (among `desks`); `assign`: give you a free one if you have none
  desk: (id: number, userId: number, desks: string[], assign = true) =>
    call<{ desk: string | null }>("POST", `/spaces/${id}/desk`, { user_id: userId, desks, assign }),
  // where this person arrives here when they picked a spot of their own (null: the space's)
  spawn: (id: number, userId: number) =>
    call<{ spawn: { x: number; y: number } | null }>("GET", `/spaces/${id}/spawn/${userId}`),
  putSpawn: (id: number, userId: number, spawn: { x: number; y: number } | null) =>
    call("PUT", `/spaces/${id}/spawn/${userId}`, { spawn }),
  putLayout: (id: number, layout: Layout) => call("PUT", `/spaces/${id}/layout`, layout),
  putPlaylists: (id: number, playlists: unknown[]) => call("PUT", `/spaces/${id}/playlists`, { playlists }),
  presence: (id: number, people: PresenceEntry[]) => call("POST", `/spaces/${id}/presence`, { people }),
  vortexLine: (id: number, context: { event: string; user_id: number | null }) =>
    call<{ line: string | null; mood?: string; personal: boolean }>("POST", `/spaces/${id}/vortex`, context),
  // someone's pets (features/pets.ts): all of them, a new one, a change, one let go
  pets: (userId: number) => call<{ pets: PetRecord[] }>("GET", `/pets/${userId}`),
  createPet: (userId: number, pet: Omit<PetRecord, "id">) => call<{ pet: PetRecord }>("POST", `/pets/${userId}`, pet),
  savePet: (userId: number, petId: number, patch: Partial<PetRecord>) =>
    call<{ pet: PetRecord }>("PUT", `/pets/${userId}/${petId}`, patch),
  deletePet: (userId: number, petId: number) => call("DELETE", `/pets/${userId}/${petId}`),
  grantFragment: (id: number, fragment: string, userIds: number[]) =>
    call<{ granted: number[] }>("POST", `/spaces/${id}/fragment`, { fragment, user_ids: userIds }),
  // a call that ended (features/phone.ts): written into the thread, for Recents and "missed"
  phoneCall: (c: { from: number; to: number[]; end: string; secs: number; video: boolean; answered: number[] }) =>
    call("POST", "/phone/calls", c),
};
