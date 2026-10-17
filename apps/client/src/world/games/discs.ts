// This browser's copy of the team's big games (docs/plan/23-disc-console.md):
// a disc is hundreds of MB, so whoever hosts one downloads it once per computer
// into the origin's private file system (OPFS), streamed to disk — never whole
// in memory — and carried on with Range when a download stopped halfway. What
// comes back are disk-backed Files (the emulator reads them in; nothing else
// holds them). Oldest-played games go when the copies pass LIMIT.
// Without OPFS (an old browser, some private windows) it's a plain download.

export interface RemoteFile {
  name: string;
  bytes: number;
  url: string; // with the headers below
}

const ROOT = "yutopia-games";
const INDEX = "index.json"; // { key: last played (ms) }
export const LIMIT = 4 * 1024 ** 3;
const COMMIT = 32 * 1024 * 1024; // written in steps this big: a stop keeps what came

type Progress = (done: number, total: number) => void;
// (a directory's entries: async-iterable in every browser with OPFS; not in this TS lib)
const entries = (d: FileSystemDirectoryHandle) =>
  (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();

async function root(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const opfs = await navigator.storage?.getDirectory?.();
    if (!opfs) return null;
    void navigator.storage.persist?.().catch(() => {});
    return await opfs.getDirectoryHandle(ROOT, { create: true });
  } catch {
    return null;
  }
}

async function readIndex(dir: FileSystemDirectoryHandle): Promise<Record<string, number>> {
  try {
    return JSON.parse(await (await (await dir.getFileHandle(INDEX)).getFile()).text());
  } catch {
    return {};
  }
}
async function writeIndex(dir: FileSystemDirectoryHandle, index: Record<string, number>) {
  const w = await (await dir.getFileHandle(INDEX, { create: true })).createWritable();
  await w.write(JSON.stringify(index));
  await w.close();
}

// One file into a directory, carrying on from what's there (Range).
async function fetchInto(
  dir: FileSystemDirectoryHandle,
  f: RemoteFile,
  headers: Record<string, string>,
  progress: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  const handle = await dir.getFileHandle(f.name, { create: true });
  let have = (await handle.getFile()).size;
  if (have > f.bytes) have = 0;
  progress(have);
  if (have === f.bytes) return handle.getFile();
  const res = await fetch(f.url, { headers: { ...headers, ...(have ? { Range: `bytes=${have}-` } : {}) }, signal });
  if (!res.ok || !res.body) throw new Error(`${res.status}`);
  if (res.status !== 206) have = 0; // (the whole file came: start over)
  const reader = res.body.getReader();
  let w = await handle.createWritable({ keepExistingData: have > 0 });
  if (have) await w.seek(have);
  else await w.truncate(0);
  let since = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await w.write(value);
      have += value.byteLength;
      since += value.byteLength;
      progress(have);
      // close (commit) now and then: a stop or a crash keeps what's written
      if (since >= COMMIT) {
        await w.close();
        w = await handle.createWritable({ keepExistingData: true });
        await w.seek(have);
        since = 0;
      }
    }
    await w.close();
  } catch (e) {
    await w.close().catch(() => {});
    throw e;
  }
  const file = await handle.getFile();
  if (file.size !== f.bytes) throw new Error(`${f.name}: ${file.size} of ${f.bytes} bytes`);
  return file;
}

// A game's files, from this browser's copy (downloaded first when missing).
// `key`: what it's kept under (the game's hash).
export async function cachedFiles(
  key: string,
  files: RemoteFile[],
  headers: Record<string, string>,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<File[]> {
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const got = files.map(() => 0);
  const tick = (i: number) => (bytes: number) => {
    got[i] = bytes;
    onProgress?.(
      got.reduce((a, b) => a + b, 0),
      total,
    );
  };
  const top = await root();
  if (!top) {
    // no OPFS: straight into memory
    const out: File[] = [];
    for (const [i, f] of files.entries()) {
      const res = await fetch(f.url, { headers, signal });
      if (!res.ok) throw new Error(`${res.status}`);
      out.push(new File([await res.blob()], f.name));
      tick(i)(f.bytes);
    }
    return out;
  }
  const dir = await top.getDirectoryHandle(key, { create: true });
  const out: File[] = [];
  for (const [i, f] of files.entries()) out.push(await fetchInto(dir, f, headers, tick(i), signal));
  const index = await readIndex(top);
  index[key] = Date.now();
  await writeIndex(top, index);
  void evict(top, index, key).catch(() => {});
  return out;
}

// What this browser keeps (bytes), and dropping one or all of it.
export async function cacheSize(): Promise<number> {
  const top = await root();
  if (!top) return 0;
  let n = 0;
  for await (const [, h] of entries(top))
    if (h.kind === "directory")
      for await (const [, f] of entries(h as FileSystemDirectoryHandle))
        if (f.kind === "file") n += (await (f as FileSystemFileHandle).getFile()).size;
  return n;
}
export async function forget(key?: string): Promise<void> {
  const top = await root();
  if (!top) return;
  const index = await readIndex(top);
  for (const k of key ? [key] : Object.keys(index)) {
    await top.removeEntry(k, { recursive: true }).catch(() => {});
    delete index[k];
  }
  await writeIndex(top, index);
}

// Over the limit: the longest unplayed go first (never the one just played).
async function evict(top: FileSystemDirectoryHandle, index: Record<string, number>, keep: string) {
  const sizes: Record<string, number> = {};
  for (const k of Object.keys(index)) {
    let n = 0;
    try {
      for await (const [, f] of entries(await top.getDirectoryHandle(k)))
        if (f.kind === "file") n += (await (f as FileSystemFileHandle).getFile()).size;
    } catch {
      delete index[k];
      continue;
    }
    sizes[k] = n;
  }
  let total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const old = Object.keys(sizes)
    .filter((k) => k !== keep)
    .sort((a, b) => index[a] - index[b]);
  for (const k of old) {
    if (total <= LIMIT) break;
    await top.removeEntry(k, { recursive: true }).catch(() => {});
    total -= sizes[k];
    delete index[k];
  }
  await writeIndex(top, index);
}
