import { discFits, type GameInfo, type GameSystem, isDiscSystem, SYSTEMS } from "@yutopia/shared/games";
import { BUILTIN_GAMES, type BuiltinGame, builtinGame } from "@yutopia/shared/library";
import { API, getToken } from "@/lib/api";
import { cachedFiles } from "./discs";

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

// A game's bytes (and a file name the core recognises); a disc's other files
// (its tracks) in `more`. Discs come from this browser's copy (world/games/discs.ts).
export async function romOf(
  spaceId: number,
  id: string,
  system: GameSystem,
  o: { game?: Cartridge; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<{ blob: Blob; name: string; more: File[] }> {
  const b = builtinGame(id);
  if (b) {
    const all = await Promise.all(
      [b.file, ...(b.more ?? [])].map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        return new File([await res.blob()], url.split("/").pop() ?? "game");
      }),
    );
    return { blob: all[0], name: all[0].name, more: all.slice(1) };
  }
  const g = o.game;
  if (isDiscSystem(system) && g?.files?.length && g.sha1) {
    const files = await cachedFiles(
      g.sha1,
      g.files.map((f, i) => ({
        name: f.name,
        bytes: f.bytes,
        url: `${API}/api/yutopia/spaces/${spaceId}/games/${id.slice(2)}/files/${i}`,
      })),
      auth(),
      o.onProgress,
      o.signal,
    );
    return { blob: files[0], name: files[0].name, more: files.slice(1) };
  }
  const res = await get(`/api/yutopia/spaces/${spaceId}/games/${id.slice(2)}/rom`);
  // (the console's own extension: some cores tell systems apart by it)
  return { blob: await res.blob(), name: `game.${SYSTEMS[system].ext[0]}`, more: [] };
}

// ── bringing a game in chunks (discs: hundreds of MB, a .cue and its tracks) ──
interface UploadState {
  id: string;
  chunk: number;
  files: { name: string; size: number; chunks: number; have: number[] }[];
}
async function send(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...auth(), ...init.headers },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).message ?? msg;
    } catch {}
    throw Object.assign(new Error(msg), {
      status: res.status,
      retryAfter: Number(res.headers.get("Retry-After")) || 0,
    });
  }
  return res;
}
// what a stopped upload is remembered by: the space and the files (pick the same ones again to carry on)
const upKey = (spaceId: number, files: File[]) =>
  `yutopia:upload:${spaceId}:${files.map((f) => `${f.name}|${f.size}|${f.lastModified}`).join("/")}`;
const remember = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {}
  },
};

// Bring a game: start (or carry on where it stopped — the same files picked
// again), send the pieces that aren't there yet (each retried; a busy server
// waited for), then finish. `signal` pauses it: what's sent stays.
export async function bringGame(
  spaceId: number,
  f: { files: File[]; system: GameSystem; title: string; color: string; players: number },
  onProgress?: (sent: number, total: number) => void,
  signal?: AbortSignal,
): Promise<GameInfo> {
  const base = `/api/yutopia/spaces/${spaceId}/games/uploads`;
  const fit = isDiscSystem(f.system)
    ? discFits(
        f.system,
        f.files.map((x) => ({ name: x.name, size: x.size })),
      )
    : null;
  if (fit?.why) throw new Error(fit.why);
  const files = fit ? fit.ordered.map((o) => f.files.find((x) => x.name === o.name) as File) : f.files;
  const key = upKey(spaceId, files);
  let up: UploadState | null = null;
  const known = remember.get(key);
  if (known)
    up = await send(`${base}/${known}`, { signal })
      .then((r) => r.json().then((j) => j.upload))
      .catch(() => null);
  if (!up) {
    up = (
      await (
        await send(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: f.system,
            title: f.title,
            color: f.color,
            players: f.players,
            files: files.map((x) => ({ name: x.name, size: x.size })),
          }),
          signal,
        })
      ).json()
    ).upload as UploadState;
    remember.set(key, up.id);
  }
  const u = up;
  const total = files.reduce((n, x) => n + x.size, 0);
  const size = (i: number, n: number) => Math.min(u.chunk, files[i].size - n * u.chunk);
  let sent = u.files.reduce((n, x, i) => n + x.have.reduce((m, c) => m + size(i, c), 0), 0);
  onProgress?.(sent, total);
  for (const [i, file] of u.files.entries())
    for (let n = 0; n < file.chunks; n++) {
      if (file.have.includes(n)) continue;
      // (errors: a few tries; "too many": wait as long as the server says, a while)
      for (let tries = 0, waits = 0; ; ) {
        signal?.throwIfAborted();
        try {
          await send(`${base}/${u.id}/${i}/${n}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: files[i].slice(n * u.chunk, n * u.chunk + size(i, n)),
            signal,
          });
          break;
        } catch (e) {
          const { status, retryAfter = 0 } = e as { status?: number; retryAfter?: number };
          if (signal?.aborted || (status && status !== 429 && status < 500)) throw e;
          if (status === 429 ? ++waits > 30 : ++tries > 4) throw e;
          await new Promise((r) => setTimeout(r, status === 429 ? Math.max(1, retryAfter) * 1000 : 800 * 2 ** tries));
        }
      }
      sent += size(i, n);
      onProgress?.(sent, total);
    }
  try {
    const game = (await (await send(`${base}/${u.id}/finish`, { method: "POST", signal })).json()).game as GameInfo;
    remember.set(key, null);
    return game;
  } catch (e) {
    if ((e as { status?: number }).status === 422) remember.set(key, null); // (refused: it's gone on the server)
    throw e;
  }
}

// ── the disc console's BIOS (the team brings it; known retail dumps only) ──
export interface BiosInfo {
  id: number;
  fileName: string;
  model: string;
  region: string;
  version: string;
  md5: string;
  mine: boolean;
}
export async function listBios(spaceId: number): Promise<BiosInfo[]> {
  return (await (await get(`/api/yutopia/spaces/${spaceId}/bios`)).json()).bios;
}
export async function bringBios(spaceId: number, file: File): Promise<BiosInfo> {
  const body = new FormData();
  body.set("file", file);
  return (await (await send(`/api/yutopia/spaces/${spaceId}/bios`, { method: "POST", body })).json()).bios;
}
export async function removeBios(spaceId: number, id: number): Promise<void> {
  await send(`/api/yutopia/spaces/${spaceId}/bios/${id}`, { method: "DELETE" });
}
// The space's BIOS files, for the core's system folder (kept in this browser too).
export async function biosFiles(spaceId: number, list?: BiosInfo[]): Promise<File[]> {
  const all = list ?? (await listBios(spaceId));
  const out: File[] = [];
  for (const b of all)
    out.push(
      ...(await cachedFiles(
        `bios-${b.md5}`,
        [{ name: b.fileName, bytes: 512 * 1024, url: `${API}/api/yutopia/spaces/${spaceId}/bios/${b.id}/file` }],
        auth(),
      )),
    );
  return out;
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
