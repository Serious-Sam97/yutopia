"use client";

import { areaAt, entry } from "@yutopia/shared";
import { useEffect } from "react";
import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "../ctx";
import type { Member } from "./BuildMode";

const DRAG_TYPE = "application/x-yutopia-member";
const FACE_COLORS = ["#e8b07c", "#9fc0d8", "#d6c9a6", "#c99ad1", "#a9c25a", "#f0b49a", "#ffc274", "#b9b2a3"];

export function Face({ id, name, size = 26 }: { id: number; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-grid place-items-center rounded-full shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: FACE_COLORS[id % FACE_COLORS.length],
        color: "var(--ink)",
        border: "2px solid var(--panel-raised)",
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function DesksPanel({ members }: { members: Member[] }) {
  const t = useTr();
  const w = useWorld();
  useHud((s) => s.mapVersion);
  useHud((s) => s.objectsVersion);
  const seats = (w?.engine?.allObjects() ?? []).filter((o) => entry(o.kind).seat);
  const owned = seats.filter((o) => o.props?.ownerId);
  const seated = new Set(owned.map((o) => Number(o.props?.ownerId)));
  const free = members.filter((m) => !seated.has(m.id));

  // a person dragged from the panel onto a seat in the world
  useEffect(() => {
    if (!w) return;
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = w.seatAt(e.clientX, e.clientY) ? "move" : "none";
      w.showSeatDrop({ x: e.clientX, y: e.clientY });
    };
    const drop = (e: DragEvent) => {
      const raw = e.dataTransfer?.getData(DRAG_TYPE);
      w.showSeatDrop(null);
      if (!raw) return;
      e.preventDefault();
      const m = JSON.parse(raw) as Member;
      const seat = w.seatAt(e.clientX, e.clientY);
      if (seat) w.send("desk:assign", { id: seat.id, ownerId: m.id, ownerName: m.name });
    };
    const end = () => w.showSeatDrop(null);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", end);
    };
  }, [w]);

  return (
    <>
      <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h2 className="lcd text-2xl leading-none">{t("buildDesks").toUpperCase()}</h2>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3 space-y-2.5">
        <div className="flex gap-2">
          {(
            [
              [seats.length, "buildSeats"],
              [owned.length, "buildAssigned"],
              [seats.length - owned.length, "buildFreeSeats"],
            ] as const
          ).map(([n, label]) => (
            <div key={label} className="vfd-window flex-1 px-2.5 py-2">
              <p className="lcd text-3xl leading-none">{n}</p>
              <p className="mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
                {t(label)}
              </p>
            </div>
          ))}
        </div>
        <h3 className="grp">{t("buildAssigned")}</h3>
        {owned.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {t("buildNoAssigned")}
          </p>
        )}
        <ul className="space-y-1.5">
          {owned.map((o) => {
            const id = Number(o.props?.ownerId);
            const name = String(o.props?.ownerName ?? members.find((m) => m.id === id)?.name ?? "—");
            const where = w ? areaAt(w.map, o.x + 0.5, o.y + 0.5)?.name : null;
            return (
              <li key={o.id} className="well flex items-center gap-2.5 px-2 py-1.5">
                <Face id={id} name={name} />
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium block truncate">{name}</span>
                  <span className="mono text-[10.5px] uppercase block truncate" style={{ color: "var(--muted)" }}>
                    {[where, entry(o.kind).label].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ fontSize: 10, padding: "3px 8px" }}
                  onClick={() => w?.send("desk:assign", { id: o.id, ownerId: null, ownerName: null })}
                >
                  {t("buildFreeSeat")}
                </button>
              </li>
            );
          })}
        </ul>
        <h3 className="grp">{t("buildNoDesk")}</h3>
        {free.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {t("buildEveryoneSeated")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {free.map((m) => (
              <button
                type="button"
                key={m.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(m));
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="flex items-center gap-1.5 rounded-full pl-0.5 pr-2.5 py-0.5 text-[12px] cursor-grab active:cursor-grabbing"
                style={{
                  background: "var(--panel-raised)",
                  border: "1px dashed var(--lamp-glow)",
                }}
              >
                <Face id={m.id} name={m.name} size={20} />
                {m.name}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {t("buildDeskHint")}
        </p>
      </div>
    </>
  );
}
