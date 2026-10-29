"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";
import { ago, Note, Tag, useLive, useWords } from "./ui";

// God mode's page (docs/plan/53-the-god-mode.md; the mock: design/god/13-history): the way in,
// my drafts (by name: plan 55), and every revision of the open world published — who, when, the
// note, the draft it came from — each one to roll back to (a revision of its own: nothing's lost).
const W = {
  drafts: ["Your drafts · {n}", "Seus rascunhos · {n}"],
  noDrafts: [
    "No drafts: your first change in god mode asks a name",
    "Sem rascunhos: sua primeira mudança no modo deus pede um nome",
  ],
  open: ["“{name}” open · {n} changes", "“{name}” aberto · {n} mudanças"],
  from: ["from “{name}”", "de “{name}”"],
  live: ["Revision {n} is live", "A revisão {n} está no ar"],
  none: ["Nothing published yet: the world as it's generated", "Nada publicado ainda: o mundo como é gerado"],
  go: ["Go into god mode", "Entrar no modo deus"],
  backTo: ["Back to god mode", "Voltar ao modo deus"],
  history: ["History · {n} revisions", "Histórico · {n} revisões"],
  liveTag: ["live", "no ar"],
  back: ["Roll back to here", "Voltar para cá"],
  backNone: ["Roll back to none", "Voltar para nenhuma"],
  rolledBack: ["roll back to {n}", "volta para {n}"],
  noNote: ["(no note)", "(sem nota)"],
  failed: ["Couldn't load the history.", "Não deu para carregar o histórico."],
  foot: [
    "A roll back is a new revision of its own, so nothing is lost.",
    "Voltar é uma revisão nova, então nada se perde.",
  ],
} as const;

interface Revision {
  rev: number;
  note: string | null;
  by: string;
  size: number;
  rollbackOf: number | null;
  /** the draft it was published from (plan 55) */
  draft: string | null;
  at: string;
}

export function God() {
  const t = useWords(W);
  const pt = useLang() === "pt";
  const w = useWorld();
  const changes = useHud((s) => s.god.changes);
  const drafts = useHud((s) => s.god.drafts.list);
  const open = useHud((s) => s.god.draft);
  const on = useHud((s) => s.god.on);
  const live = useLive(w, (w) => (w.room?.state.groundsRev as number) ?? 0, 1000) ?? 0;
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    api<{ revisions: Revision[] }>("/api/admin/grounds/revisions")
      .then((r) => setRevs(r.revisions))
      .catch(() => setFailed(true));
  }, []);
  // (the draft fetched for its count; the list again whenever what's live moves)
  useEffect(() => {
    void w?.loadGod().then((g) => g?.loadDraft());
  }, [w]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: again when the live revision moves
  useEffect(load, [load, live]);
  const go = () => {
    hud.set({ panel: { kind: null } });
    if (!on) void w?.toggleGod();
  };
  return (
    <>
      <div className="card flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <p className="text-[15px]">{drafts?.length ? t("drafts", { n: drafts.length }) : t("noDrafts")}</p>
          {open.name && <p className="text-[12.5px] mt-0.5">{t("open", { name: open.name, n: changes })}</p>}
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--cream-dim)" }}>
            {live ? t("live", { n: live }) : t("none")}
          </p>
        </div>
        <button type="button" className="deck-btn" aria-pressed onClick={go}>
          <Icon name="globe" size={16} />
          {on ? t("backTo") : t("go")}
          {!on && <span className="keycap">O</span>}
        </button>
      </div>
      {failed && <Note>{t("failed")}</Note>}
      {revs && (
        <>
          <p className="grp mt-2">{t("history", { n: revs.length })}</p>
          <ul className="card py-1">
            {revs.map((r, i) => (
              <li
                key={r.rev}
                className="flex items-center gap-4 py-2.5"
                style={i ? { borderTop: "1px solid var(--well-edge)" } : undefined}
              >
                <span className="title text-[20px] w-10 text-center normal-case tracking-normal">{r.rev}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] truncate flex items-center gap-2">
                    {r.note || t("noNote")}
                    {r.rev === live && <Tag tone="lamp">{t("liveTag")}</Tag>}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--cream-dim)" }}>
                    {r.by} · {ago(r.at, pt)}
                    {r.rollbackOf !== null ? ` · ${t("rolledBack", { n: r.rollbackOf })}` : ""}
                    {r.draft ? ` · ${t("from", { name: r.draft })}` : ""}
                  </p>
                </div>
                {r.rev !== live && (
                  <button
                    type="button"
                    className="ghost-btn flex items-center gap-1.5 shrink-0"
                    onClick={() => w?.send("god:rollback", { rev: r.rev })}
                  >
                    <Icon name="undo" size={13} />
                    {t("back")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {live > 0 && (
            <button
              type="button"
              className="ghost-btn flex items-center gap-1.5"
              onClick={() => w?.send("god:rollback", { rev: 0 })}
            >
              <Icon name="undo" size={13} />
              {t("backNone")}
            </button>
          )}
          <Note>{t("foot")}</Note>
        </>
      )}
    </>
  );
}
