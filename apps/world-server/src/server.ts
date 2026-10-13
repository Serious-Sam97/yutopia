import { createServer } from "node:http";
import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@yutopia/shared";
import "./features/all.ts";
import { handleMedia } from "./media/http.ts";
import { metrics } from "./metrics.ts";
import { SpaceRoom } from "./SpaceRoom.ts";

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
  server.define(ROOM_NAME, SpaceRoom).filterBy(["spaceId"]);
  await server.listen(port);
  return server;
}
