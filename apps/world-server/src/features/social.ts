import { ANIM, answerOf, CONTACT, isHeld, isSocial, SOCIAL_MS, SOCIAL_REACH, socialFor } from "@yutopia/shared";
import { between } from "@yutopia/shared/reach";
import type { Player } from "../schema.ts";
import type { WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Between people (shared/actions.ts): a wave across the room, a high five, a
// fist bump, cheers with your drinks, handing yours over. Both bodies show it
// from the same moment (`actAt`); a drink changes hands when the hands meet.
// And focus: heads down at your desk, headphones on (others see it, and your
// own client turns the room's chatter down).

const NAMES: Record<string, string> = {
  wave: "waved at you 👋",
  highfive: "high-fived you ✋",
  fistbump: "bumped fists with you 👊",
  cheers: "said cheers 🥂",
  give: "handed you their drink",
};

registerFeature((room: WorldRoom) => {
  const last = new Map<string, number>();
  const end = (p: Player) => {
    p.act = "";
    p.actAt = 0;
    p.actWith = "";
  };
  room.on("social", (client, m) => {
    const a = room.state.players.get(client.sessionId);
    const b = room.state.players.get(String(m?.to ?? ""));
    const act = m?.act;
    if (!a || !b || a === b || !isSocial(act) || b.bot) return;
    const now = Date.now();
    // one at a time, and not while either of you is still in one
    if (now - (last.get(client.sessionId) ?? 0) < 800 || a.act || b.act) return;
    // (body to body, each its whole height: hands don't meet across a gap up or down; a wave reaches
    // across it — shared reach.ts)
    const d = act === "wave" ? Math.hypot(a.x - b.x, a.y - b.y) : between(a, b);
    if (d > SOCIAL_REACH[act]) return;
    if (!socialFor({ held: a.held, status: a.status }, { held: b.held, status: b.status }).includes(act)) return;
    last.set(client.sessionId, now);
    a.act = act;
    a.actAt = now;
    a.actWith = b.sid;
    // a wave is one-sided; the rest take both of you
    if (act !== "wave") {
      b.act = answerOf(act);
      b.actAt = now;
      b.actWith = a.sid;
    }
    const to = room.clients.find((c) => c.sessionId === b.sid);
    if (to) room.send(to, "toast", { text: `${a.name} ${NAMES[act]}` });
    if (act === "give") {
      // the drink changes hands when the hands meet, as it was (same sips left)
      const kind = a.held;
      const heldAt = a.heldAt;
      room.clock.setTimeout(() => {
        if (a.held !== kind || b.held || !isHeld(kind)) return;
        b.held = kind;
        b.heldAt = heldAt;
        a.held = "";
        a.heldAt = 0;
      }, SOCIAL_MS.give * CONTACT);
    }
  });

  room.on("focus", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    // on only while seated
    if (p) p.focus = !!m?.on && p.a === ANIM.sit;
  });

  let at = 0;
  return {
    // over: back to normal (checked a few times a second)
    tick(_dt, now) {
      if (now - at < 200) return;
      at = now;
      for (const p of room.state.players.values()) {
        // focus is for sitting at your desk: walking off ends it
        if (p.focus && p.a === ANIM.walk) p.focus = false;
        if (!p.act) continue;
        const kind = p.act === "take" ? "give" : p.act;
        if (!isSocial(kind) || now - p.actAt > SOCIAL_MS[kind]) end(p);
      }
    },
    leave: (client) => {
      last.delete(client.sessionId);
      // whoever was in one with them stops too
      for (const p of room.state.players.values()) if (p.actWith === client.sessionId) end(p);
    },
  };
});
