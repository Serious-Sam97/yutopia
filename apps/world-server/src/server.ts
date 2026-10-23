import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@yutopia/shared";
import { signInternal } from "./api.ts";
import { config } from "./config.ts";
import "./features/all.ts";
import { handleMedia } from "./media/http.ts";
import { metrics } from "./metrics.ts";
import { WorldRoom } from "./WorldRoom.ts";

const PUSH_MAX_BYTES = 2 * 1024 * 1024;

// A signed call from the API (signed like ours to it, the path included): its
// JSON body, or null once it has answered with an error.
async function signedBody(req: IncomingMessage, res: ServerResponse, path: string): Promise<unknown | null> {
  if (req.method !== "POST") return answer(res, 405, { error: "POST" });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > PUSH_MAX_BYTES) return answer(res, 413, { error: "too big" });
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const ts = String(req.headers["x-yutopia-timestamp"] ?? "");
  const sig = String(req.headers["x-yutopia-signature"] ?? "");
  let secret = "";
  try {
    secret = config.internalSecret();
  } catch {
    return answer(res, 401, { error: "unsigned" });
  }
  const fresh = /^\d+$/.test(ts) && Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
  const want = secret && fresh ? Buffer.from(signInternal(ts, "POST", path, raw)) : null;
  if (!want || want.length !== sig.length || !timingSafeEqual(want, Buffer.from(sig)))
    return answer(res, 401, { error: "bad signature" });
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return answer(res, 422, { error: "not JSON" });
  }
}

function answer(res: ServerResponse, status: number, body: unknown): null {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
  return null;
}

// The API's live phone events (apps/api Push): a batch of {uid, event}, each
// handed to that person's client in the world.
async function handlePush(req: IncomingMessage, res: ServerResponse) {
  const body = await signedBody(req, res, "/internal/push");
  if (body === null) return;
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events)) return answer(res, 422, { error: "events" });
  let delivered = 0;
  for (const e of events.slice(0, 2000)) {
    const uid = Number((e as { uid?: unknown })?.uid);
    const event = (e as { event?: unknown })?.event;
    if (!Number.isInteger(uid) || !event || typeof event !== "object") continue;
    if (WorldRoom.current?.relay(uid, event as Record<string, unknown>)) delivered += 1;
  }
  metrics.inc("pushes_total", delivered);
  return answer(res, 200, { ok: true, delivered });
}

// The API is about to replace the world's stored data (apps/api WorldSnapshot):
// {hold: true} closes the room (everyone out, its pending saves written first)
// and keeps it closed; {hold: false} lets the next join open it from the new data.
async function handleHold(req: IncomingMessage, res: ServerResponse) {
  const body = await signedBody(req, res, "/internal/hold");
  if (body === null) return;
  const hold = (body as { hold?: unknown }).hold;
  if (typeof hold !== "boolean") return answer(res, 422, { error: "hold" });
  WorldRoom.held = hold;
  const room = WorldRoom.current;
  if (hold && room) await room.disconnect().catch(() => {});
  return answer(res, 200, { ok: true, held: WorldRoom.held, closed: hold && !!room });
}

export async function startWorldServer(port: number): Promise<Server> {
  const http = createServer(async (req, res) => {
    if (req.url === "/metrics") {
      const rooms = await matchMaker.query({ name: ROOM_NAME });
      metrics.gauge("rooms", () => rooms.length);
      metrics.gauge("clients", () => rooms.reduce((n, r) => n + r.clients, 0));
      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
      res.end(metrics.render());
      return;
    }
    // The server's clock, for synced media (clients estimate their offset from
    // a few round trips and keep the one with the shortest).
    if (req.url === "/time") {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      res.end(String(Date.now()));
      return;
    }
    if (req.url?.startsWith("/media/") && (await handleMedia(req, res))) return;
    // a page's goodbye on its way out (a beacon: WorldRoom.bye)
    if (req.url === "/bye" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 200) break;
      }
      WorldRoom.bye(body.trim());
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" }).end();
      return;
    }
    if (req.url === "/internal/push") return void (await handlePush(req, res));
    if (req.url === "/internal/hold") return void (await handleHold(req, res));
    if (req.url === "/health") {
      const rooms = await matchMaker.query({ name: ROOM_NAME });
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.length, clients: rooms.reduce((n, r) => n + r.clients, 0) }));
      return;
    }
    res.writeHead(404).end();
  });
  const server = new Server({
    transport: new WebSocketTransport({ server: http, pingInterval: 5000, pingMaxRetries: 3 }),
    greet: false,
  });
  // one world: no filter, so every join lands in the same room (WorldRoom.CAPACITY).
  // Offline (tests, the bot swarm) a `sandbox` option opens a separate copy, so
  // each test starts from a fresh studio; nothing is stored offline anyway.
  const world = server.define(ROOM_NAME, WorldRoom);
  if (config.offline) world.filterBy(["sandbox"]);
  await server.listen(port);
  return server;
}
