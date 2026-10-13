import { type GameInfo, type GameSystem, SYSTEMS } from "@yutopia/shared";
import { BUILTIN_GAMES, type BuiltinGame, builtinGame } from "@yutopia/shared/library";
import { API, getToken } from "@/lib/api";

// The game room's side of Yondra: the team's cartridges (uploads), their ROMs,
// and the saves of every game played in the space. Built-in cartridges are
// static files served with the client (/emu/games, tools/emu-assets.mjs).

const auth = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function get(path: string): Promise<Response> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json", ...auth() } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res;
}

export type Cartridge = (GameInfo & { source?: string; file?: string }) | BuiltinGame;

// Everything on the shelf for this space: what ships with Yutopia, then the team's.
export async function library(spaceId: number): Promise<Cartridge[]> {
  let mine: GameInfo[] = [];
  try {
    mine = (await (await get(`/api/yutopia/spaces/${spaceId}/games`)).json()).games;
  } catch {
    // offline or no uploads: the built-in ones still play
  }
  return [...BUILTIN_GAMES, ...mine];
}

// A cartridge's bytes (and a file name the core recognises).
export async function romOf(spaceId: number, id: string, system: GameSystem): Promise<{ blob: Blob; name: string }> {
  const b = builtinGame(id);
  if (b) {
    const res = await fetch(b.file);
    if (!res.ok) throw new Error(`${res.status}`);
    return { blob: await res.blob(), name: b.file.split("/").pop() ?? "game" };
  }
  const res = await get(`/api/yutopia/spaces/${spaceId}/games/${id.slice(2)}/rom`);
  // (the console's own extension: some cores tell systems apart by it)
  return { blob: await res.blob(), name: `game.${SYSTEMS[system].ext[0]}` };
}

export async function upload(
  spaceId: number,
  f: { file: File; system: string; title: string; color: string; players: number },
): Promise<GameInfo> {
  const body = new FormData();
  body.set("file", f.file);
  body.set("system", f.system);
  body.set("title", f.title);
  body.set("color", f.color);
  body.set("players", String(f.players));
  const res = await fetch(`${API}/api/yutopia/spaces/${spaceId}/games`, {
    method: "POST",
    headers: { Accept: "application/json", ...auth() },
    body,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).message ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()).game;
}

export async function removeGame(spaceId: number, id: string): Promise<void> {
  const res = await fetch(`${API}/api/yutopia/spaces/${spaceId}/games/${id.slice(2)}`, {
    method: "DELETE",
    headers: { Accept: "application/json", ...auth() },
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

// Whether this game has saves in the space (and when the last one was made).
export async function saveInfo(spaceId: number, game: string): Promise<{ state: boolean; updatedAt: string | null }> {
  try {
    const j = await (await get(`/api/yutopia/spaces/${spaceId}/saves/${game}`)).json();
    return { state: !!j.state, updatedAt: j.updatedAt ?? null };
  } catch {
    return { state: false, updatedAt: null };
  }
}

// Where this game left off in the space (a missing save is null).
export async function loadSave(spaceId: number, game: string, kind: "state" | "sram"): Promise<Blob | null> {
  try {
    return await (await get(`/api/yutopia/spaces/${spaceId}/saves/${game}/${kind}`)).blob();
  } catch {
    return null;
  }
}

export async function putSave(spaceId: number, game: string, s: { state?: Blob | null; sram?: Blob | null }) {
  const body = new FormData();
  if (s.state) body.set("state", s.state, "state.bin");
  if (s.sram) body.set("sram", s.sram, "sram.bin");
  if (!s.state && !s.sram) return;
  await fetch(`${API}/api/yutopia/spaces/${spaceId}/saves/${game}`, {
    method: "POST",
    headers: { Accept: "application/json", ...auth() },
    body,
  }).catch(() => {});
}
