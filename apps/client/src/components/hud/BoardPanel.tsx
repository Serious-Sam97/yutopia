"use client";

import { YONDRA_APP } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";
import { YondraFrame } from "./YondraFrame";

// The real Yondra board, embedded chrome-less: exact parity, zero duplication.
export function BoardPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const board = w?.boardFor(objectId);
  if (!board) {
    return (
      <Panel title={t("openBoard")}>
        <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
          — NO BOARD — This wall isn't linked to a Yondra board yet.
        </p>
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
          <a className="ghost-btn ml-auto" href={`${YONDRA_APP}/boards/${board.id}`} target="_blank" rel="noreferrer">
            {t("openInYondra")} ↗
          </a>
        </div>
        <YondraFrame path={`/boards/${board.id}`} title={board.name} />
      </div>
    </Panel>
  );
}
