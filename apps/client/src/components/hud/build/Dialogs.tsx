"use client";

import { entry } from "@yutopia/shared";
import { useState } from "react";
import { hud } from "@/world/store";
import { useWorld } from "../ctx";
import type { Member } from "./BuildMode";
import { FLOOR_SWATCHES, WALL_MATERIALS } from "./WallsPanel";

// After a room is dragged out on the floor: name it, give it an owner, walls.
export function RoomDialog({
  draft,
  members,
}: {
  draft: { x: number; y: number; w: number; h: number };
  members: Member[];
}) {
  const w = useWorld();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("private");
  const [owner, setOwner] = useState<number | null>(null);
  const [walls, setWalls] = useState(true);
  const [floor, setFloor] = useState(",");
  const [wall, setWall] = useState("");
  const close = () => {
    w?.clearRoomGhost();
    hud.set((s) => ({ build: { ...s.build, roomDraft: null } }));
  };
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[color:var(--scrim)] p-3">
      <form
        className="cabinet p-4 w-full max-w-sm space-y-3 rise"
        aria-label="New room"
        onSubmit={(e) => {
          e.preventDefault();
          w?.send("map:room", {
            name: name.trim() || "Room",
            kind,
            ...draft,
            ownerId: owner,
            ownerName: members.find((m) => m.id === owner)?.name ?? null,
            walls,
            floor,
            ...(wall ? { wall } : {}),
          });
          close();
        }}
      >
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-xl">
            NEW ROOM · {draft.w}×{draft.h}
          </h2>
        </div>
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Name
          </span>
          <input
            className="field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ana's office"
            maxLength={40}
            required
          />
        </label>
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Owner (can lock its doors)
          </span>
          <select className="field mt-1" value={owner ?? ""} onChange={(e) => setOwner(Number(e.target.value) || null)}>
            <option value="">No owner</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mono text-xs uppercase mb-1" style={{ color: "var(--cream-dim)" }}>
            Sound
          </legend>
          <div className="flex gap-1.5">
            {[
              ["private", "Private"],
              ["open", "Open"],
              ["booth", "Booth (knock)"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                className="deck-btn flex-1"
                aria-pressed={kind === k}
                style={{ height: 32, fontSize: 10 }}
                onClick={() => setKind(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-2">
          <span>Build walls and a door</span>
          <input
            type="checkbox"
            checked={walls}
            onChange={(e) => setWalls(e.target.checked)}
            className="h-5 w-5 accent-[color:var(--amber)]"
          />
        </label>
        {walls && (
          <label className="block">
            <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
              Walls
            </span>
            <select className="field mt-1" value={wall} onChange={(e) => setWall(e.target.value)}>
              <option value="">{kind === "booth" ? "Foam (booth)" : "Plaster"}</option>
              {WALL_MATERIALS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Floor
          </span>
          <select className="field mt-1" value={floor} onChange={(e) => setFloor(e.target.value)}>
            {FLOOR_SWATCHES.filter((f) => f.ch !== " ").map((f) => (
              <option key={f.ch} value={f.ch}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="deck-btn flex-1">
            Create room
          </button>
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// After a seat is clicked with the Desks tool.
export function DeskDialog({ seatId, members }: { seatId: string; members: Member[] }) {
  const w = useWorld();
  const seat = w?.model?.getObject(seatId);
  const [owner, setOwner] = useState<number | null>((seat?.props?.ownerId as number) ?? null);
  const close = () => hud.set((s) => ({ build: { ...s.build, deskDraft: null } }));
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[color:var(--scrim)] p-3">
      <form
        className="cabinet p-4 w-full max-w-xs space-y-3 rise"
        aria-label="Assign desk"
        onSubmit={(e) => {
          e.preventDefault();
          w?.send("desk:assign", {
            id: seatId,
            ownerId: owner,
            ownerName: members.find((m) => m.id === owner)?.name ?? null,
          });
          close();
        }}
      >
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-xl">DESK · {seat ? entry(seat.kind).label.toUpperCase() : ""}</h2>
        </div>
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Whose desk is this?
          </span>
          <select className="field mt-1" value={owner ?? ""} onChange={(e) => setOwner(Number(e.target.value) || null)}>
            <option value="">Anyone (first come)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="deck-btn flex-1">
            Save
          </button>
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
