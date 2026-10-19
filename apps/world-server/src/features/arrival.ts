import { config } from "../config.ts";
import type { WorldRoom } from "../WorldRoom.ts";
import { api } from "../api.ts";
import { registerFeature } from "./index.ts";

// Your own arrival point: anyone can pick a tile they can walk to (from where
// they stand) and arrive there next time, instead of at the world's arrival
// point — your office or booth included. Stored in the API per person; checked
// again on every arrival (WorldRoom.arrivalFor), so a spot walled off later, or
// a booth someone's talking in, falls back to the world's.

registerFeature((room: WorldRoom) => {
  const last = new Map<string, number>();
  const tell = (sid: string, uid: number) => {
    const c = room.clients.getById(sid);
    if (c) room.send(c, "spawn:mine", { at: room.mySpawns.get(uid) ?? null });
  };

  room.on("spawn:mine", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || p.bot) return;
    const now = Date.now();
    if (now - (last.get(client.sessionId) ?? 0) < 500) return;
    last.set(client.sessionId, now);
    let at: { x: number; y: number } | null = null;
    if (m.at !== null) {
      const x = Math.floor(Number(m.at?.x));
      const y = Math.floor(Number(m.at?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      at = { x: x + 0.5, y: y + 0.5 };
      const why = room.arrivalProblem(p, at, p);
      if (why) {
        tell(client.sessionId, p.uid);
        return room.send(client, "toast", { text: why, tone: "warn" });
      }
      room.mySpawns.set(p.uid, at);
    } else room.mySpawns.delete(p.uid);
    tell(client.sessionId, p.uid);
    room.send(client, "toast", {
      text: at ? "You'll arrive here from now on." : "You'll arrive at the world's arrival point again.",
    });
    if (!config.offline)
      void api.putSpawn(p.uid, at).catch((e) => {
        console.warn("[arrival] point not saved:", (e as Error).message);
        const c = room.clients.getById(p.sid);
        if (c) room.send(c, "toast", { text: "Couldn't save your arrival point — try again.", tone: "warn" });
      });
  });

  return {
    join: (client, p) => {
      if (!p.bot) tell(client.sessionId, p.uid);
    },
    leave: (client) => {
      last.delete(client.sessionId);
    },
  };
});
