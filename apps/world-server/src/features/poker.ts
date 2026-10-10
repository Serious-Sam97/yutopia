import type { SpaceRoom } from "../SpaceRoom.ts";
import { registerFeature } from "./index.ts";

// Which Yondra card is on the War Room table. Everyone at the table votes through
// Yondra's own planning session, so Yondra and Yutopia show the same round.
registerFeature((room: SpaceRoom) => {
  const table = () => [...room.state.objects.values()].find((o) => o.kind === "meeting_table");
  const atTable = (sid: string) => {
    const p = room.state.players.get(sid);
    const t = table();
    if (!p || !t) return false;
    const area = room.map.areas.find((a) => a.x <= t.x && t.x < a.x + a.w && a.y <= t.y && t.y < a.y + a.h);
    return p.area === (area?.key ?? p.area);
  };
  room.on("poker:open", (client, m) => {
    if (!atTable(client.sessionId)) return;
    const cardId = Number(m.cardId);
    const boardId = Number(m.boardId);
    if (!Number.isInteger(cardId) || cardId <= 0 || !Number.isInteger(boardId) || boardId <= 0) return;
    const pk = room.state.poker;
    pk.cardId = cardId;
    pk.boardId = boardId;
    pk.title = String(m.title ?? "").slice(0, 200);
    pk.by = room.state.players.get(client.sessionId)?.name ?? "";
    pk.open = true;
  });
  room.on("poker:close", (client) => {
    if (!atTable(client.sessionId)) return;
    const pk = room.state.poker;
    pk.open = false;
    pk.cardId = 0;
    pk.boardId = 0;
    pk.title = "";
  });
  return {};
});
