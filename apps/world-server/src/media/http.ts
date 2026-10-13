import type { IncomingMessage, ServerResponse } from "node:http";
import { JF_ID, YT_LIST } from "@yutopia/shared/media";
import { metrics } from "../metrics.ts";
import { browse, image, jellyfinOn, stream } from "./jellyfin.ts";
import { verifyMediaKey } from "./key.ts";
import { ytPlaylist, ytSearch, ytSearchOn } from "./youtube.ts";

// The media routes (everything needs the key from media:key, in the path):
//   /media/jf/api/<key>/browse?parent=&q=&start=   Jellyfin: libraries, folders, search
//   /media/jf/img/<key>/<item>?w=                  an item's picture
//   /media/jf/s/<key>/<tv>/<item>/<rest>           a TV's stream (playlists, segments)
//   /media/yt/api/<key>/search?q= · list?id=        YouTube (with a Data API key)
// CORS is open: nothing here works without the key, and the page (another
// origin) draws pictures and video from it into WebGL.

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

function send(res: ServerResponse, status: number, body: string | Buffer | ArrayBuffer, type: string, extra = {}) {
  res.writeHead(status, { ...CORS, "Content-Type": type, ...extra });
  res.end(body instanceof ArrayBuffer ? Buffer.from(body) : body);
}
const sendJson = (res: ServerResponse, status: number, v: unknown) =>
  send(res, status, JSON.stringify(v), "application/json");

// a little budget per person for browsing / searching (not for streams)
const buckets = new Map<number, { n: number; at: number }>();
function allow(userId: number, now = Date.now()): boolean {
  const b = buckets.get(userId) ?? { n: 30, at: now };
  b.n = Math.min(30, b.n + ((now - b.at) / 1000) * 2);
  b.at = now;
  buckets.set(userId, b);
  if (b.n < 1) return false;
  b.n -= 1;
  return true;
}

export async function handleMedia(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  if (!url.pathname.startsWith("/media/")) return false;
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" });
    res.end();
    return true;
  }
  const parts = url.pathname.split("/").slice(2); // [jf|yt, api|img|s, key, …]
  const [src, what, key, ...rest] = parts;
  const who = verifyMediaKey(decodeURIComponent(key ?? ""));
  if (!who) {
    sendJson(res, 401, { error: "bad key" });
    return true;
  }
  try {
    if (src === "jf") {
      if (!jellyfinOn()) {
        sendJson(res, 404, { error: "no Jellyfin here" });
        return true;
      }
      if (what === "api" && rest[0] === "browse") {
        if (!allow(who.userId)) {
          sendJson(res, 429, { error: "slow down" });
          return true;
        }
        const parent = url.searchParams.get("parent") ?? undefined;
        if (parent && !JF_ID.test(parent)) {
          sendJson(res, 400, { error: "bad parent" });
          return true;
        }
        const r = await browse({
          parent,
          q: url.searchParams.get("q") ?? undefined,
          start: Number(url.searchParams.get("start") ?? 0),
        });
        sendJson(res, 200, r);
        return true;
      }
      if (what === "img" && JF_ID.test(rest[0] ?? "")) {
        const img = await image(rest[0], Number(url.searchParams.get("w") ?? 320));
        if (!img) {
          sendJson(res, 404, { error: "no picture" });
          return true;
        }
        send(res, 200, img.body, img.type, { "Cache-Control": "private, max-age=86400" });
        return true;
      }
      if (what === "s") {
        const [tv, item, ...path] = rest;
        if (!tv || !JF_ID.test(item ?? "") || !path.length) {
          sendJson(res, 400, { error: "bad path" });
          return true;
        }
        const tail = path.join("/") + url.search;
        const r = await stream(who.spaceId, decodeURIComponent(tv), item, tail);
        if (!r) {
          sendJson(res, 410, { error: "not on that TV now" });
          return true;
        }
        metrics.inc("media_bytes_total", typeof r.body === "string" ? r.body.length : r.body.length);
        send(res, 200, r.body, r.type);
        return true;
      }
    }
    if (src === "yt" && what === "api") {
      if (!ytSearchOn()) {
        sendJson(res, 404, { error: "no YouTube key here" });
        return true;
      }
      if (!allow(who.userId)) {
        sendJson(res, 429, { error: "slow down" });
        return true;
      }
      if (rest[0] === "search") {
        const q = (url.searchParams.get("q") ?? "").trim();
        sendJson(res, 200, { items: q ? await ytSearch(q) : [] });
        return true;
      }
      if (rest[0] === "list") {
        const id = url.searchParams.get("id") ?? "";
        if (!YT_LIST.test(id)) {
          sendJson(res, 400, { error: "bad list" });
          return true;
        }
        sendJson(res, 200, { items: await ytPlaylist(id) });
        return true;
      }
    }
    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    console.warn("[media]", url.pathname.split("/").slice(0, 4).join("/"), (e as Error).message);
    if (!res.headersSent) sendJson(res, 502, { error: "the media server didn't answer" });
  }
  return true;
}
