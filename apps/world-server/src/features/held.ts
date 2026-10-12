import { entry, footprint, HELD, type HeldKind, heldState, isHeld } from "@yutopia/shared";
import type { SpaceRoom } from "../SpaceRoom.ts";
import { registerFeature } from "./index.ts";

// Things people carry (shared/held.ts): taken from what hands them out — a mug
// from the coffee machine — when you're close enough, used little by little on
// a schedule everyone shares, and put away once finished (or when you put it
// down). One thing at a time; taking another swaps it.
const REACH = 2.2; // tiles from the thing's footprint

registerFeature((room: SpaceRoom) => {
  room.on("item:take", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !o) return;
    const how = entry(o.kind).interact;
    const kind = (Object.keys(HELD) as HeldKind[]).find(
      (k) => how && (HELD[k].from as readonly string[]).includes(how),
    );
    if (!kind) return;
    const { w, h } = footprint(o.kind, o.rot);
    const cx = Math.max(o.x, Math.min(p.x, o.x + w));
    const cy = Math.max(o.y, Math.min(p.y, o.y + h));
    if (Math.hypot(p.x - cx, p.y - cy) > REACH) return;
    p.held = kind;
    p.heldAt = Date.now();
  });
  room.on("item:drop", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    p.held = "";
    p.heldAt = 0;
  });
  let at = 0;
  return {
    // finished things are put away (checked twice a second)
    tick(_dt, now) {
      if (now - at < 500) return;
      at = now;
      for (const p of room.state.players.values())
        if (p.held && (!isHeld(p.held) || heldState(p.held, now - p.heldAt).done)) {
          p.held = "";
          p.heldAt = 0;
        }
    },
  };
});
