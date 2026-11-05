// What breaks in the page, caught and said (docs/plan/72-the-3d-core.md, phase 1):
// - an error nothing caught, or a promise no one awaited: reported to the world-server
//   (`client:error`, logged and counted there) once the world is joined, a few at most;
// - a chunk that won't load — after a deploy the page's old chunks are gone from the server —
//   offers a reload once (a toast), instead of a feature silently never opening.
// On the page: kept small, no imports beyond the store.
import { toast } from "@/world/store";

export interface ClientError {
  where: string; // "window", "promise", "hud:<region>", …
  message: string;
  stack: string;
}

const MAX_SENT = 20; // a page load's worth: a loop that throws every frame says so a few times only
let sink: ((e: ClientError) => void) | null = null;
const waiting: ClientError[] = [];
let sent = 0;
const seen = new Set<string>();

/** Where reports go once there's somewhere (the room); the ones before are sent then. */
export function setErrorSink(fn: ((e: ClientError) => void) | null) {
  sink = fn;
  if (fn) for (const e of waiting.splice(0)) send(e);
}

function send(e: ClientError) {
  if (sent >= MAX_SENT) return;
  if (!sink) {
    if (waiting.length < MAX_SENT) waiting.push(e);
    return;
  }
  sent++;
  try {
    sink(e);
  } catch {
    // (the room gone mid-send: nothing to do)
  }
}

/** A chunk of the page that didn't load (webpack's and turbopack's wordings, and the browser's
 *  for a module import). */
export function isChunkError(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  return (
    name === "ChunkLoadError" ||
    /Loading (CSS )?chunk [\w-]+ failed|Failed to load chunk|dynamically imported module|Importing a module script failed/i.test(
      msg,
    )
  );
}

let offered = false;
function offerReload() {
  if (offered) return;
  offered = true;
  toast("A new version of Yutopia is out — reload the page to get it (F5).", "warn", 30_000);
}

/** Something broke: a chunk → the reload offer; anything else → reported (each message once). */
export function reportError(where: string, e: unknown) {
  if (isChunkError(e)) {
    offerReload();
    return;
  }
  const message = String((e as { message?: string })?.message ?? e ?? "").slice(0, 300);
  const key = `${where}|${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  console.error(`[yutopia] ${where}:`, e);
  send({ where, message, stack: String((e as { stack?: string })?.stack ?? "").slice(0, 1200) });
}

let installed = false;
/** The page's own catch-alls (once). */
export function installCrashHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => reportError("window", ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => reportError("promise", ev.reason));
}
