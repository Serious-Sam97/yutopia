import { WB_H, WB_MAX_ITEMS, WB_MAX_POINTS, WB_W, type WbItem, type WbOp } from "@yutopia/shared";
import { config } from "../config.ts";
import { fromSchema, type SpaceRoom, safeJson, toSchema } from "../SpaceRoom.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Shared whiteboards: ops in, ops out. The scene lives in memory and is saved
// into the object's props in Laravel (debounced), so it survives restarts and
// the in-world whiteboard shows a live preview.
registerFeature((room: SpaceRoom) => {
  const scenes = new Map<string, WbItem[]>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const scene = (id: string): WbItem[] | null => {
    const o = room.state.objects.get(id);
    if (!o || o.kind !== "whiteboard") return null;
    if (!scenes.has(id)) {
      const items = safeJson(o.props).scene;
      scenes.set(id, Array.isArray(items) ? (items as WbItem[]) : []);
    }
    return scenes.get(id) ?? null;
  };

  const persist = (id: string) => {
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(async () => {
        const o = room.state.objects.get(id);
        const items = scenes.get(id);
        if (!o || !items) return;
        const def = fromSchema(o);
        def.props = { ...(def.props ?? {}), scene: items };
        try {
          const saved = config.offline ? def : (await yondra.putObject(room.spaceId, def)).object;
          room.state.objects.set(id, toSchema(saved));
        } catch (e) {
          console.warn("[whiteboard] save failed", (e as Error).message);
        }
      }, 2500),
    );
  };

  room.on("wb:get", (client, m) => {
    const items = scene(String(m.objectId));
    if (items) room.send(client, "wb:scene", { objectId: m.objectId, items });
  });

  room.on("wb:op", (client, m) => {
    const id = String(m.objectId);
    const items = scene(id);
    const p = room.state.players.get(client.sessionId);
    const op = clean(m.op);
    if (!items || !p || !op) return;
    if (op.t === "add") {
      if (items.length >= WB_MAX_ITEMS) items.shift();
      items.push(op.item);
    } else if (op.t === "del") {
      const i = items.findIndex((x) => x.id === op.id);
      if (i >= 0) items.splice(i, 1);
    } else items.splice(0, items.length);
    room.broadcastMsg("wb:op", { objectId: id, op, by: client.sessionId });
    persist(id);
  });

  return {
    dispose() {
      for (const t of timers.values()) clearTimeout(t);
    },
  };
});

const hex = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : "#2a2420");
const num = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const sid = (v: unknown) => (typeof v === "string" ? v.slice(0, 40) : "");

// Never trust the shape of an op: rebuild it field by field.
function clean(op: unknown): WbOp | null {
  if (!op || typeof op !== "object") return null;
  const o = op as Record<string, unknown>;
  if (o.t === "clear") return { t: "clear" };
  if (o.t === "del") return sid(o.id) ? { t: "del", id: sid(o.id) } : null;
  if (o.t !== "add" || !o.item || typeof o.item !== "object") return null;
  const it = o.item as Record<string, unknown>;
  const id = sid(it.id);
  if (!id) return null;
  if (it.k === "stroke" && Array.isArray(it.p)) {
    const p: number[] = [];
    for (let i = 0; i + 1 < Math.min(it.p.length, WB_MAX_POINTS * 2); i += 2)
      p.push(num(it.p[i], WB_W), num(it.p[i + 1], WB_H));
    if (p.length < 2) return null;
    return { t: "add", item: { id, k: "stroke", c: hex(it.c), w: Math.max(1, Math.min(40, Number(it.w) || 3)), p } };
  }
  if (it.k === "note" || it.k === "text") {
    const text = typeof it.text === "string" ? it.text.slice(0, 280) : "";
    if (!text) return null;
    return { t: "add", item: { id, k: it.k, c: hex(it.c), x: num(it.x, WB_W), y: num(it.y, WB_H), text } };
  }
  return null;
}
