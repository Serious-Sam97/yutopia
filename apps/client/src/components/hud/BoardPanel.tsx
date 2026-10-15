"use client";

import { useState } from "react";
import { YONDRA_APP } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { toast, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";
import { YondraFrame } from "./YondraFrame";

// The real Yondra board, embedded chrome-less: exact parity, zero duplication.
// A wall without a board (fresh from the catalog) asks which one it shows;
// builders can change it from the header.
export function BoardPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  useHud((s) => s.objectsVersion);
  useHud((s) => s.boards);
  const canBuild = useHud((s) => s.canBuild);
  const [picking, setPicking] = useState(false);
  const board = w?.boardFor(objectId);
  if (!board || picking) {
    return (
      <Panel title={board ? t("boardChange") : t("boardPick")}>
        {!board && (
          <p className="text-sm mb-3" style={{ color: "var(--cream-dim)" }}>
            {t("boardNone")}
          </p>
        )}
        {canBuild ? (
          <BoardPicker objectId={objectId} onDone={() => setPicking(false)} />
        ) : (
          <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
            {t("boardNoneAsk")}
          </p>
        )}
        {board && (
          <button type="button" className="ghost-btn mt-3" onClick={() => setPicking(false)}>
            {t("actCancel")}
          </button>
        )}
      </Panel>
    );
  }

  return (
    <Panel title={board.name} wide>
      <div className="h-full flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {board.sections.map((s) => (
            <span
              key={s.id}
              className="mono text-xs px-2 py-1 rounded"
              style={{ background: "#120d09", color: "var(--vfd)" }}
            >
              {s.name} · {s.count}
            </span>
          ))}
          <span className="ml-auto flex gap-2">
            {canBuild && (
              <button type="button" className="ghost-btn" onClick={() => setPicking(true)}>
                ⇄ {t("boardChange")}
              </button>
            )}
            <a className="ghost-btn" href={`${YONDRA_APP}/boards/${board.id}`} target="_blank" rel="noreferrer">
              {t("openInYondra")} ↗
            </a>
          </span>
        </div>
        <YondraFrame key={board.id} path={`/boards/${board.id}`} title={board.name} />
      </div>
    </Panel>
  );
}

// The space's boards, one click puts one up; or a new one, made in Yondra and
// put up. Also in build mode's item toolbar (compact).
export function BoardPicker({
  objectId,
  onDone,
  compact = false,
}: {
  objectId: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const t = useTr();
  const w = useWorld();
  const boards = useHud((s) => s.boards);
  const projectId = useHud((s) => s.projectId);
  useHud((s) => s.objectsVersion);
  const current = w?.engine?.getObject(objectId)?.refId ?? null;
  const shown = w?.boardsOnShow() ?? new Map<number, number>();
  const [name, setName] = useState("");
  const [type, setType] = useState<"kanban" | "scrum">("kanban");
  const [busy, setBusy] = useState(false);

  const pick = (id: number) => {
    if (id !== current) w?.setBoard(objectId, id);
    onDone?.();
  };
  const create = async () => {
    const n = name.trim();
    if (!n || busy || !w) return;
    setBusy(true);
    try {
      const id = await w.createBoard(n, type);
      if (id) {
        setName("");
        pick(id);
      }
    } catch {
      toast(t("boardFailed"), "warn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${compact ? "w-[300px]" : ""}`}>
      {boards.length === 0 && (
        <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
          {projectId ? t("boardEmpty") : t("boardNoProject")}
        </p>
      )}
      {boards.length > 0 && (
        <ul
          className={`flex flex-col gap-1.5 ${compact ? "max-h-[260px] overflow-y-auto scroll-thin" : ""}`}
          aria-label={t("boardPick")}
        >
          {boards.map((b) => {
            const here = b.id === current;
            const elsewhere = (shown.get(b.id) ?? 0) - (here ? 1 : 0);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className="tile-card w-full text-left px-3 py-2 flex flex-col gap-1"
                  aria-pressed={here}
                  onClick={() => pick(b.id)}
                >
                  <span className="flex items-center gap-2 w-full">
                    <span className="font-bold truncate">{b.name}</span>
                    <span className="mono text-[10px] uppercase opacity-70">{b.type}</span>
                    <span
                      className="ml-auto mono text-[10px] whitespace-nowrap"
                      style={{ color: here ? "var(--vfd)" : "var(--amber)" }}
                    >
                      {here
                        ? t("boardHere")
                        : elsewhere === 1
                          ? t("boardOnWall")
                          : elsewhere > 1
                            ? t("boardOnWalls").replace("{n}", String(elsewhere))
                            : ""}
                    </span>
                  </span>
                  {!compact && (
                    <span className="mono text-[11px] opacity-80 truncate w-full">
                      {b.sections.map((s) => `${s.name} ${s.count}`).join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {projectId && (
        <form
          className="flex flex-col gap-1.5 mt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <span className="text-xs" style={{ color: "var(--cream-dim)" }}>
            {boards.length ? t("boardNew") : t("boardNewFirst")}
          </span>
          <div className="flex gap-1.5">
            <input
              className="field flex-1 min-w-0"
              value={name}
              maxLength={255}
              placeholder={t("boardNewName")}
              aria-label={t("boardNewName")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button type="submit" className="deck-btn" disabled={!name.trim() || busy}>
              {busy ? "…" : t("boardCreate")}
            </button>
          </div>
          <div className="flex gap-1.5">
            {(["kanban", "scrum"] as const).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={type === k} onClick={() => setType(k)}>
                {k === "kanban" ? "Kanban" : "Scrum"}
              </button>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
