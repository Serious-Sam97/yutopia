"use client";

import { doorRoom } from "@yutopia/shared";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// A door: anyone opens or closes it; only the room's owner (or a project owner)
// locks it — and while locked, only the room's owner can go in or out.
export function DoorPanel({ objectId }: { objectId: string }) {
  const w = useWorld();
  useHud((s) => s.mapVersion); // re-render when the map (rooms/owners) changes
  const door = w?.engine?.getObject(objectId);
  const isAdmin = useHud((s) => s.isAdmin);
  if (!w || !door) return null;
  const room = doorRoom(w.map, door);
  const state = String(door.props?.state ?? "open");
  const mine = room?.ownerId != null && room.ownerId === w.myUid();
  const mayLock = mine || isAdmin;
  const set = (s: "open" | "closed" | "locked") => w.send("door:set", { id: objectId, state: s });
  return (
    <Panel title={room ? `Door · ${room.name}` : "Door"}>
      <div className="vfd-window p-4 flex items-center justify-between">
        <span className="lcd text-3xl">
          {state === "locked" ? "🔒 LOCKED" : state === "closed" ? "▮ CLOSED" : "▯ OPEN"}
        </span>
        <span className="mono text-xs" style={{ color: "var(--cream-dim)" }}>
          {room?.ownerName ? `owner: ${room.ownerName}${mine ? " (you)" : ""}` : "no owner"}
        </span>
      </div>
      <p className="text-sm mt-3" style={{ color: "var(--cream-dim)" }}>
        {state === "locked"
          ? mine
            ? "Locked. Only you can walk in or out."
            : `Locked. Only ${room?.ownerName ?? "the room's owner"} can walk in or out.`
          : "Anyone can walk through. Closed doors swing open as people pass."}
      </p>
      <div className="flex gap-2 mt-4">
        {state !== "locked" && (
          <button type="button" className="deck-btn flex-1" onClick={() => set(state === "open" ? "closed" : "open")}>
            {state === "open" ? "Close" : "Open"}
          </button>
        )}
        {mayLock && (
          <button
            type="button"
            className="deck-btn flex-1"
            aria-pressed={state === "locked"}
            onClick={() => set(state === "locked" ? "closed" : "locked")}
          >
            <span className="led" />
            {state === "locked" ? "🔓 Unlock" : "🔒 Lock"}
          </button>
        )}
      </div>
      {!mayLock && room?.ownerId && (
        <p className="mono text-[11px] mt-3" style={{ color: "var(--muted)" }}>
          Only {room.ownerName ?? "the owner"} can lock this door.
        </p>
      )}
    </Panel>
  );
}
