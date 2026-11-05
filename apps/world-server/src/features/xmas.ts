import {
  atLevel,
  canPlace,
  entry,
  GIFTS,
  HELD,
  isHeld,
  levelMap,
  objLevel,
  onLevel,
  quarterOf,
  quarterYaw,
  type WorldObjectDef,
} from "@yutopia/shared";
import { deckBuilding, decked } from "@yutopia/shared/christmas";
import { cleanText } from "@yutopia/shared/glyphs";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { cleanProps, fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Christmas (docs/plan/68-more-furniture.md, phase 2): a present opened by who it's for — the person
// it was wrapped for, or the name on its tag; none said, anyone — what's in it put in their hand;
// what someone holds wrapped at a gift-wrapping table, for someone in the world; two people under
// the mistletoe together, hearts; an admin's switch dressing every room for Christmas, or putting it
// all away (undone as any build step: the history's snapshot, features/history.ts).
const REACH = 2.2; // tiles from the thing
const MISTLE_M = 0.9; // under it: this near its middle
const MISTLE_AGAIN_MS = 60_000; // the same two, once a minute

/** Is this name the one on the tag? The whole of it, or its first word. */
export function namedOnTag(tag: string, name: string): boolean {
  const t = cleanText(tag, 12);
  if (!t) return true;
  const full = cleanText(name, 40);
  return t === full || t === full.split(" ")[0] || t === full.slice(0, 12);
}

registerFeature((room: WorldRoom) => {
  const objects = () => [...room.state.objects.values()].map(fromSchema);
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const persistFailed = (e: Error) => console.warn("[xmas] save failed", e.message);
  const near = (p: { x: number; y: number }, o: WorldObjectDef) => {
    const { w, h } = { w: entry(o.kind).w, h: entry(o.kind).h };
    const cx = Math.max(o.x, Math.min(p.x, o.x + w));
    const cy = Math.max(o.y, Math.min(p.y, o.y + h));
    return Math.hypot(p.x - cx, p.y - cy);
  };

  room.on("present:open", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const s = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !s || s.kind !== "present") return;
    const o = fromSchema(s);
    if (objLevel(o, room.map) !== p.level || room.reach3(p, o, near(p, o)) > REACH) return;
    const to = Number(o.props?.to) || 0;
    const tag = String(o.props?.text ?? "");
    if ((to && to !== p.uid) || (!to && !namedOnTag(tag, p.name)))
      return warn(client, `That one's for ${cleanText(tag, 12) || "someone else"}.`);
    const gift = isHeld(o.props?.gift)
      ? o.props.gift
      : GIFTS[[...o.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % GIFTS.length];
    room.state.objects.delete(o.id);
    room.state.holds.delete(o.id);
    if (!config.offline) api.deleteObject(o.id).catch(persistFailed);
    room.rebuildGrid();
    p.held = gift;
    p.heldAt = Date.now();
    const from = String(o.props?.from ?? "").slice(0, 40);
    room.send(client, "present:opened", { gift, from });
    room.broadcastMsg("toast", {
      text: `${p.name} opened a present${from ? ` from ${from}` : ""}: ${HELD[gift].label.toLowerCase()}!`,
    });
  });

  room.on("present:wrap", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const s = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !s || s.kind !== "wrapping_table") return;
    const table = fromSchema(s);
    if (objLevel(table, room.map) !== p.level || room.reach3(p, table, near(p, table)) > REACH) return;
    if (!isHeld(p.held)) return warn(client, "Hold something to wrap it — a drink, a toy.");
    const map = levelMap(room.map, p.level);
    if (!map) return;
    const to = [...room.state.players.values()].find((q) => q.uid === Number(m?.to) && q.uid !== p.uid);
    // (on the floor by the table, the nearest tile it can go)
    const here = onLevel(objects(), map);
    const id = `present-${p.uid}-${Date.now().toString(36)}`;
    let def: WorldObjectDef | null = null;
    for (let r = 1; r <= 3 && !def; r++)
      for (let dy = -r; dy <= r && !def; dy++)
        for (let dx = -r; dx <= r + 1 && !def; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r && !(dx === r + 1)) continue;
          const o = atLevel(
            {
              id,
              kind: "present",
              x: table.x + dx,
              y: table.y + dy,
              yaw: quarterYaw(0),
              props: {
                variant: Math.floor(Math.random() * 3),
                gift: p.held,
                ...(to ? { to: to.uid, text: to.name.split(" ")[0] } : {}),
                from: p.name,
              },
            },
            p.level,
            map,
          );
          if (canPlace(map, here, o)) def = o;
        }
    if (!def) return warn(client, "There's no room by the table to put it down.");
    def = { ...def, props: cleanProps("present", def.props ?? {}, here, def.x, def.y, 0) };
    room.state.objects.set(def.id, toSchema(def));
    if (!config.offline) api.putObject(def).catch(persistFailed);
    room.rebuildGrid();
    p.held = "";
    p.heldAt = 0;
    room.send(client, "toast", {
      text: to ? `Wrapped for ${to.name} — it's by the table.` : "Wrapped — it's by the table.",
    });
  });

  // an admin's Christmas: every room dressed, or all of it put away
  room.on("build:christmas", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.builder) return;
    if (!p.admin) return warn(client, "Only an admin puts Christmas out.");
    const all = objects();
    const mine = all.filter(decked);
    if (!m?.on) {
      if (!mine.length) return warn(client, "There's no Christmas out to put away.");
      for (const o of mine) {
        room.state.objects.delete(o.id);
        room.state.holds.delete(o.id);
        if (!config.offline) api.deleteObject(o.id).catch(persistFailed);
      }
      room.rebuildGrid();
      room.broadcastMsg("toast", {
        text: `${p.name} put Christmas away (${mine.length} pieces) — Undo brings it back.`,
      });
      return;
    }
    if (mine.length) return warn(client, "Christmas is out already.");
    const bodies = (level: number) =>
      [...room.state.players.values()].filter((q) => q.level === level).map((q) => ({ x: q.x, y: q.y }));
    const add = deckBuilding(room.map, all, bodies, Date.now().toString(36));
    if (!add.length) return warn(client, "Nothing fits anywhere.");
    const now = [...all];
    for (const o of add) {
      const lm = levelMap(room.map, objLevel(o, room.map));
      const level = lm ? onLevel(now, lm) : now;
      const def = { ...o, props: cleanProps(o.kind, o.props ?? {}, level, o.x, o.y, quarterOf(o)) };
      room.state.objects.set(def.id, toSchema(def));
      now.push(def);
      if (!config.offline) api.putObject(def).catch(persistFailed);
    }
    room.rebuildGrid();
    room.broadcastMsg("toast", { text: `${p.name} put Christmas out (${add.length} pieces) 🎄 — Undo puts it away.` });
  });

  // two people under the mistletoe together: hearts over both, once a minute
  const kissed = new Map<string, number>();
  let at = 0;
  return {
    tick(_dt, now) {
      if (now - at < 1000) return;
      at = now;
      const sprigs = [...room.state.objects.values()].filter((o) => o.kind === "mistletoe").map(fromSchema);
      if (!sprigs.length) return;
      for (const s of sprigs) {
        const level = objLevel(s, room.map);
        const under = [...room.state.players.values()].filter(
          (q) => q.level === level && !q.downAt && Math.hypot(q.x - (s.x + 0.5), q.y - (s.y + 0.5)) < MISTLE_M,
        );
        if (under.length < 2) continue;
        const [a, b] = under;
        const key = [a.uid, b.uid].sort((x, y) => x - y).join(":");
        if (now - (kissed.get(key) ?? 0) < MISTLE_AGAIN_MS) continue;
        kissed.set(key, now);
        for (const q of [a, b]) {
          q.emote = "heart";
          q.emoteAt = now;
        }
        room.broadcastMsg("toast", { text: `${a.name} and ${b.name}, under the mistletoe 💚` });
      }
    },
  };
});
