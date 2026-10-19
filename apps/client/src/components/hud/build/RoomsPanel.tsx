"use client";

import { type AreaDef, doorRoom, isDoorKind } from "@yutopia/shared";
import { useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { toast, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";
import type { Member } from "./BuildMode";
import { WALL_MATERIALS } from "./WallsPanel";

const KIND_COLOR: Record<string, string> = {
  open: "#7a5233",
  private: "#8a5a36",
  booth: "#7b3424",
  standup: "#5d6a2f",
  stage: "#4a3324",
};
const DRESSINGS: [string, Key][] = [
  ["", "buildBare"],
  ["tidy", "buildTidy"],
  ["lived", "buildLived"],
  ["busy", "buildBusy"],
];

export function RoomsPanel({ members }: { members: Member[] }) {
  const t = useTr();
  const w = useWorld();
  useHud((s) => s.mapVersion);
  useHud((s) => s.objectsVersion);
  const [open, setOpen] = useState<string | null>(null);
  const rooms = w?.map.areas ?? [];
  return (
    <>
      <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h2 className="lcd text-2xl leading-none">{t("buildRooms").toUpperCase()}</h2>
        <span className="mono text-[11px] uppercase" style={{ color: "var(--muted)" }}>
          {rooms.length} {t("buildRooms").toLowerCase()}
        </span>
      </header>
      <div className="px-3 pb-2">
        <button
          type="button"
          className="deck-btn w-full"
          style={{ background: "linear-gradient(180deg,#ffc274,#e8952d)", boxShadow: "0 3px 0 #9a5c17" }}
          onClick={() => toast(t("buildDrawRoomHint"))}
        >
          <Icon name="plus" size={16} /> {t("buildDrawRoom")}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3 space-y-2">
        {rooms.map((r) => (
          <RoomCard
            key={r.key}
            room={r}
            members={members}
            open={open === r.key}
            onToggle={() => setOpen((o) => (o === r.key ? null : r.key))}
          />
        ))}
      </div>
    </>
  );
}

function RoomCard({
  room,
  members,
  open,
  onToggle,
}: {
  room: AreaDef;
  members: Member[];
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTr();
  const w = useWorld();
  const locked = useHud((s) => !!s.locks[room.key]);
  const doors = (w?.engine?.allObjects() ?? []).filter(
    (o) => isDoorKind(o.kind) && w && doorRoom(w.map, o)?.key === room.key,
  ).length;
  const meta = [
    room.kind,
    `${room.w}×${room.h}`,
    doors === 1 ? t("buildDoor") : doors ? t("buildDoors").replace("{n}", String(doors)) : null,
    room.ownerName ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className="well"
      style={open ? { borderColor: "var(--vfd)", boxShadow: "0 0 0 3px rgba(255,166,48,.12)" } : undefined}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <i className="w-2.5 h-7 rounded-[3px] shrink-0" style={{ background: KIND_COLOR[room.kind] ?? "#7a5233" }} />
        <span className="flex-1 min-w-0">
          <span className="lcd text-xl leading-none block truncate">{room.name.toUpperCase()}</span>
          <span className="mono text-[10.5px] uppercase block truncate" style={{ color: "var(--muted)" }}>
            {meta}
          </span>
        </span>
        <span
          className="mono text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0"
          style={{ border: "1px solid var(--edge)", color: locked ? "var(--vfd)" : "var(--cream-dim)" }}
        >
          <Icon name={locked ? "lock" : "unlock"} size={12} />
          {t(locked ? "buildLocked" : "buildUnlocked")}
        </span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2.5">
          <Row label={t("buildOwner")}>
            <select
              className="field"
              style={{ padding: "4px 8px", fontSize: 13, borderRadius: 999 }}
              value={room.ownerId ?? ""}
              aria-label={`${t("buildOwner")}: ${room.name}`}
              onChange={(e) => {
                const id = Number(e.target.value) || null;
                w?.send("map:room:update", {
                  key: room.key,
                  ownerId: id,
                  ownerName: members.find((m) => m.id === id)?.name ?? null,
                });
              }}
            >
              <option value="">{t("buildNoOwner")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t("buildDressing")}>
            <div className="seg flex-1">
              {DRESSINGS.map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={(room.dressing ?? "") === d}
                  onClick={() => w?.send("map:room:update", { key: room.key, dressing: d || null })}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t("buildWalls")}>
            <div className="flex gap-1.5">
              {WALL_MATERIALS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  title={m.label}
                  aria-label={`${t("buildWalls")}: ${m.label}`}
                  className="w-5 h-5 rounded hover:outline hover:outline-2 hover:outline-[var(--vfd)] outline-offset-1"
                  style={{ background: m.color, border: "1px solid #0008" }}
                  onClick={() => w?.send("map:room:walls", { key: room.key, wall: m.key })}
                />
              ))}
            </div>
          </Row>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="ghost-btn flex-1"
              onClick={() => w?.teleport({ x: room.x + room.w / 2, y: room.y + room.h / 2 })}
            >
              {t("buildGoThere")}
            </button>
            <button
              type="button"
              className="ghost-btn flex-1"
              style={{ borderStyle: "dashed", borderColor: "#9e4a2e", color: "#e79a7c" }}
              onClick={() => {
                if (window.confirm(t("buildRemoveRoom").replace("{name}", room.name)))
                  w?.send("map:room:remove", { key: room.key });
              }}
            >
              {t("buildRemove")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mono text-[10px] uppercase tracking-wider w-[64px] shrink-0" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
