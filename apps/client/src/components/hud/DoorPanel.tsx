"use client";

import { doorLockable, doorRoom, doorSlides, doorStartState, entry, mayLockDoor } from "@yutopia/shared";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// A door: anyone opens or closes it; only the room's owner locks and unlocks it
// (an admin only when the room has no owner) — and while locked, only the
// room's owner can go in or out, and nobody else changes that room.
export function DoorPanel({ objectId }: { objectId: string }) {
  const w = useWorld();
  useHud((s) => s.mapVersion); // re-render when the map (rooms/owners) changes
  const door = w?.model?.getObject(objectId);
  const isAdmin = useHud((s) => s.isAdmin);
  if (!w || !door) return null;
  const room = doorRoom(w.map, door);
  const state = String(door.props?.state ?? doorStartState(door.kind) ?? "open");
  const label = entry(door.kind).label;
  const mine = room?.ownerId != null && room.ownerId === w.myUid();
  const mayLock = mayLockDoor(w.map, door, { uid: w.myUid(), admin: isAdmin });
  const set = (s: "open" | "closed" | "locked") => w.send("door:set", { id: objectId, state: s });
  return (
    <Panel title={room ? `${label} · ${room.name}` : label}>
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
            ? "Locked. Only you can walk in or out — and only you can unlock it."
            : room?.ownerId
              ? `Locked. Only ${room.ownerName ?? "the room's owner"} can walk in or out, or unlock it.`
              : "Locked by an admin."
          : doorSlides(door.kind)
            ? "Anyone can walk through. Closed, it rolls aside as people pass."
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
      {!mayLock && room?.ownerId && doorLockable(door.kind) && (
        <p className="mono text-[11px] mt-3" style={{ color: "var(--muted)" }}>
          Only {room.ownerName ?? "the owner"} can lock or unlock this door.
        </p>
      )}
    </Panel>
  );
}
