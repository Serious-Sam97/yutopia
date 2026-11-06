"use client";

import { entry } from "@yutopia/shared";
import { useState } from "react";
import { hud } from "@/world/store";
import { useWorld } from "../ctx";
import type { Member } from "./BuildMode";

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
