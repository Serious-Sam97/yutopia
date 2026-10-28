import { bayById, GROUND_OFFSET, levelMap, lotLayout } from "@yutopia/shared";
import { BOARD_KIND, boardObject, boardOfOwner, boardsOf, cantClaim } from "@yutopia/shared/spot";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Someone's own bay (docs/plan/43-the-spot.md): standing in a free plain bay of the lot, on foot,
// they claim it (`spot:claim`) and a board with their name goes up at its head, for everyone (a
// world object, saved: shared spot.ts). One each: claiming another moves it. In their own bay
// they give it up (`spot:free`); an admin may take down anyone's. A pool car left in a claimed bay
// is towed out of it (features/cars.ts), and the tow never parks in one.

registerFeature((room: WorldRoom) => {
  const off = GROUND_OFFSET;
  const no = (c: WorldClient, why: string) => room.send(c, "spot:no", { why });
  const objects = () => [...room.state.objects.values()].map(fromSchema);
  const drop = (id: string) => {
    room.state.objects.delete(id);
    if (!config.offline) void api.deleteObject(id).catch((e) => console.warn("[spot] down", e.message));
  };

  room.on("spot:claim", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || !p.uid || !levelMap(room.map, 0)) return;
    // (on foot, on the ground floor: not riding, not in a car)
    if (p.level !== 0 || /^(drive|ride):/.test(p.busy)) return no(client, "busy");
    // (standing in it: not over it — shared reach.ts)
    if (room.upOff(p, p, 0.5) > 0) return no(client, "busy");
    const bay = String(m?.bay ?? "");
    const l = lotLayout();
    const all = objects();
    const why = cantClaim(l, all, bay, p.uid, p.x + off.x, p.y + off.y);
    if (why === "yours") return;
    if (why) return no(client, why);
    const target = bayById(l, bay);
    if (!target) return no(client, "gone");
    // (one each: their old board comes down)
    const old = boardOfOwner(all, p.uid);
    if (old) drop(old.id);
    const next = boardObject(l, target, { id: p.uid, name: p.name }, off);
    room.state.objects.set(next.id, toSchema(next));
    room.rebuildGrid();
    room.rescue();
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[spot] up", e.message));
  });

  room.on("spot:free", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const o = boardsOf(objects()).get(String(m?.bay ?? ""));
    if (!o) return;
    if (Number(o.props?.ownerId) !== p.uid && !p.admin) return no(client, "taken");
    drop(o.id);
    room.rebuildGrid();
  });

  // what's left of anyone gone (their account deleted): their board and their own car, taken down
  // once a start (the API's members; nothing if it can't say)
  let swept = config.offline;
  const sweep = async () => {
    const ids = new Set((await api.members()).ids.map(Number));
    if (!ids.size) return;
    let n = 0;
    for (const o of [...room.state.objects.values()]) {
      const def = fromSchema(o);
      const owner = Number(def.props?.ownerId) || 0;
      if (!owner || ids.has(owner) || def.props?.driven) continue;
      // (a board, someone's own car: not a desk, which has its owner too)
      if (def.kind !== BOARD_KIND && def.kind !== "car") continue;
      drop(o.id);
      n++;
    }
    if (n) {
      room.rebuildGrid();
      console.log(`[spot] ${n} things of people gone taken down`);
    }
  };

  return {
    tick() {
      if (swept || !levelMap(room.map, 0) || room.state.objects.size === 0) return;
      swept = true;
      void sweep().catch((e) => console.warn("[spot] members", e.message));
    },
  };
});
