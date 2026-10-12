import { footprint, PIANO_RANGE, USES } from "@yutopia/shared";
import type { SpaceRoom } from "../SpaceRoom.ts";
import { registerFeature } from "./index.ts";

// Using things: what someone's busy with (the arcade, the piano, a drink from
// the machine…) shows on their body for everyone; and the piano: a note from
// whoever's at it reaches everyone, from where they stand.
const REACH = 2.6;
const NOTES_PER_SECOND = 24;

registerFeature((room: SpaceRoom) => {
  room.on("use", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const what = String(m?.what ?? "");
    p.busy = (USES as readonly string[]).includes(what) ? what : "";
  });
  const budget = new Map<string, { n: number; at: number }>();
  room.on("piano:note", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    const n = Number(m?.n);
    if (!p || !o || o.kind !== "piano" || !Number.isInteger(n) || n < PIANO_RANGE[0] || n > PIANO_RANGE[1]) return;
    const { w, h } = footprint(o.kind, o.rot);
    const cx = Math.max(o.x, Math.min(p.x, o.x + w));
    const cy = Math.max(o.y, Math.min(p.y, o.y + h));
    if (Math.hypot(p.x - cx, p.y - cy) > REACH) return;
    // a flood of notes is dropped (a stuck key, a script)
    const now = Date.now();
    const b = budget.get(client.sessionId) ?? { n: 0, at: now };
    if (now - b.at > 1000) {
      b.n = 0;
      b.at = now;
    }
    if (++b.n > NOTES_PER_SECOND) return;
    budget.set(client.sessionId, b);
    room.broadcast("piano:note", { sid: client.sessionId, x: p.x, y: p.y, n }, { except: client });
  });
  return {
    leave: (client) => {
      budget.delete(client.sessionId);
    },
  };
});
