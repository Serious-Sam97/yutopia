import { areaAt, onLevel, quarterOf, type WorldObjectDef } from "@yutopia/shared";
import {
  furnishedIn,
  furnishRoom,
  isRoomPlan,
  type RoomPlan,
  refurnished,
  refurnishFloor,
} from "@yutopia/shared/office";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { cleanProps, fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The Office (docs/plan/67-the-furniture.md, phase 10): a builder furnishes the room they stand in by
// a plan (open plan, meeting room, kitchen, lounge, focus booths, reception — shared office.ts); an
// admin refurnishes their whole floor, each room by what it's called. Only by choice, and undone as
// any build step (the history's snapshot before and after: features/history.ts, STEP_LABELS).
registerFeature((room: WorldRoom) => {
  const objects = () => [...room.state.objects.values()].map(fromSchema);
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const persistFailed = (e: Error) => console.warn("[office] save failed", e.message);

  const furnish = (client: WorldClient, plan: RoomPlan | null, floor: boolean) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.builder) return;
    if (floor && !p.admin) return warn(client, "Only an admin refurnishes a whole floor.");
    const map = room.levelMap(p.level);
    const all = objects();
    const bodies = [...room.state.players.values()].filter((q) => q.level === p.level).map((q) => ({ x: q.x, y: q.y }));
    let work: { remove: WorldObjectDef[]; add: WorldObjectDef[] }[];
    let what: string;
    // (each furnishing its own ids: the last one's, deleted and put again at once, could race in the
    // store)
    const tag = Date.now().toString(36);
    if (floor) {
      work = refurnishFloor(map, all, bodies, tag);
      what = "the floor";
    } else {
      const a = areaAt(map, p.x, p.y);
      if (!a || !refurnished(a) || !plan) return warn(client, "Stand in a room to furnish it.");
      const remove = furnishedIn(all, a, map);
      const gone = new Set(remove.map((o) => o.id));
      work = [
        {
          remove,
          add: furnishRoom(
            plan,
            a,
            map,
            all.filter((o) => !gone.has(o.id)),
            bodies,
            tag,
          ),
        },
      ];
      what = a.name;
    }
    const remove = work.flatMap((w) => w.remove);
    const add = work.flatMap((w) => w.add);
    if (!add.length) return warn(client, "Nothing fits in there.");
    const locked = room.lockBreak(p, null, [...remove, ...add], p.level);
    if (locked) return warn(client, `${locked}.`);
    // out with the old, in with the new (saved as they land; the history sees the state change now)
    for (const o of remove) {
      room.state.objects.delete(o.id);
      if (!config.offline) api.deleteObject(o.id).catch(persistFailed);
    }
    // (a top's host found on this floor only, as placing does)
    const now = onLevel(objects(), map);
    for (const o of add) {
      const def = { ...o, props: cleanProps(o.kind, o.props ?? {}, now, o.x, o.y, quarterOf(o)) };
      room.state.objects.set(def.id, toSchema(def));
      now.push(def);
      if (!config.offline) api.putObject(def).catch(persistFailed);
    }
    room.rebuildGrid();
    room.broadcastMsg("toast", { text: `${p.name} furnished ${what} (${add.length} pieces) — Undo puts it back.` });
  };

  room.on("build:furnish", (client, m: { plan?: unknown }) =>
    furnish(client, isRoomPlan(m?.plan) ? m.plan : null, false),
  );
  room.on("build:refurnish", (client) => furnish(client, null, true));
  return {};
});
