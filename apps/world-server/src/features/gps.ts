import { offsetOf } from "@yutopia/shared";
import type { GpsFriend } from "@yutopia/shared/phone";
import { api } from "../api.ts";
import { config } from "../config.ts";
import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The GPS's friends (docs/plan/37-the-gps.md § 6): someone who turns on "Share
// my location" is seen on the map by the people in their phone book — nobody
// else, and nobody at all while they're in a booth or in focus mode. The
// phone book comes from the API (fetched when they turn it on, and now and
// then while it's on); positions only ever go to someone in it, when they ask.

interface Line {
  room: WorldRoom;
  client: WorldClient;
}
const hub = new Map<number, Line>(); // everyone in Yutopia (any room)
const sharing = new Map<number, { viewers: Set<number>; at: number }>(); // uid → who sees them
const REFRESH_MS = 60_000; // the phone book again, while sharing
const ASK_MS = 400; // a client asks at most this often

export const gpsHub = {
  hub,
  sharing,
  // (tests swap this: no API offline)
  contactsOf: async (uid: number): Promise<number[]> =>
    config.offline ? [] : (await api.phoneContacts(uid)).ids.map(Number),
};

async function share(uid: number, on: boolean) {
  if (!on) {
    sharing.delete(uid);
    return;
  }
  const ids = await gpsHub.contactsOf(uid).catch(() => null);
  // (still on, and still here: it may have been turned off meanwhile)
  if (ids && hub.has(uid)) sharing.set(uid, { viewers: new Set(ids), at: Date.now() });
}

// Where someone is, for a friend's map: on the Grounds' coords (every floor's
// corner is somewhere in them), facing (0: north, clockwise), or only where
// (a private room's name) — or nothing, while they're keeping to themselves.
function friendOf(line: Line, p: Player): GpsFriend | null {
  const room = line.room;
  const area = room.areaByKey(p.area);
  if (p.status === "dnd" || area?.kind === "booth") return null;
  const off = offsetOf(room.map, p.level);
  return {
    uid: p.uid,
    name: p.name,
    avatar: p.avatar,
    x: Math.round((p.x + off.x) * 10) / 10,
    z: Math.round((p.y + off.y) * 10) / 10,
    h: Math.round((((p.yaw & 255) / 256) * 2 * Math.PI + Math.PI / 2) * 100) / 100,
    level: p.level,
    where: room.whereIs(p),
  };
}

registerFeature((room: WorldRoom) => {
  const asked = new Map<string, number>();
  room.on("gps:share", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (p && !p.bot) void share(p.uid, !!m?.on);
  });
  room.on("gps:friends", (client) => {
    const p = room.state.players.get(client.sessionId);
    const now = Date.now();
    if (!p || now - (asked.get(client.sessionId) ?? 0) < ASK_MS) return;
    asked.set(client.sessionId, now);
    const friends: GpsFriend[] = [];
    for (const [uid, s] of sharing) {
      if (uid === p.uid || !s.viewers.has(p.uid)) continue;
      const line = hub.get(uid);
      const them = line?.room.state.players.get(line.client.sessionId);
      const f = line && them ? friendOf(line, them) : null;
      if (f) friends.push(f);
    }
    room.send(client, "gps:friends", { friends });
  });

  let at = 0;
  return {
    join(client, p) {
      if (!p.bot) hub.set(p.uid, { room, client });
    },
    back(client, p) {
      if (hub.get(p.uid)?.client.sessionId === client.sessionId) hub.set(p.uid, { room, client });
    },
    leave(client, p) {
      asked.delete(client.sessionId);
      if (hub.get(p.uid)?.client.sessionId !== client.sessionId) return;
      hub.delete(p.uid);
      // (back in Yutopia, the phone says again whether it shares)
      sharing.delete(p.uid);
    },
    // the phone books of those sharing, now and then (someone added or taken out)
    tick(_dt, now) {
      if (now - at < 5000) return;
      at = now;
      for (const [uid, s] of sharing)
        if (now - s.at > REFRESH_MS && hub.get(uid)?.room === room) {
          s.at = now;
          void share(uid, true);
        }
    },
  };
});
