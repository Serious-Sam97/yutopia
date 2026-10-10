"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type PlanningSnapshot, type YondraCard, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

export function StandupPanel() {
  const t = useTr();
  const w = useWorld();
  const st = useHud((s) => s.standup);
  const me = useHud((s) => s.me);
  const inRing = me?.area === "standup";
  return (
    <Panel title={t("standup")}>
      <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
        Everyone standing in the ring gets a turn, in random order, with a timer. Your Yondra cards in progress show up
        while you talk. The ring is a private room: only people inside hear it.
      </p>
      {!inRing && (
        <p className="mono text-xs mt-3" style={{ color: "var(--vfd)" }}>
          Step into the ring first.
        </p>
      )}
      <div className="flex gap-2 mt-4">
        {!st.active ? (
          <button
            type="button"
            className="deck-btn flex-1"
            disabled={!inRing}
            onClick={() => {
              w?.send("standup:start", {});
              hud.set({ panel: { kind: null } });
            }}
          >
            ▶ {t("standupStart")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="deck-btn flex-1"
              disabled={!inRing}
              onClick={() => w?.send("standup:next", {})}
            >
              ⏭ {t("standupNext")}
            </button>
            <button
              type="button"
              className="deck-btn danger"
              aria-pressed={false}
              disabled={!inRing}
              onClick={() => w?.send("standup:stop", {})}
            >
              ■ {t("standupStop")}
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}

// Planning poker on the War Room table, backed by Yondra's planning session.
export function PokerPanel() {
  const t = useTr();
  const w = useWorld();
  const poker = useHud((s) => s.poker);
  const boards = useHud((s) => s.boards);
  const myUid = w?.myUid() ?? 0;
  const [snap, setSnap] = useState<PlanningSnapshot | null>(null);
  const [error, setError] = useState("");
  const [cards, setCards] = useState<{ board: { id: number; name: string }; cards: YondraCard[] }[]>([]);
  const [picking, setPicking] = useState(false);

  const call = useCallback(
    async (action: Parameters<typeof yutopia.planning>[2], body?: unknown) => {
      if (!poker.open) return;
      try {
        setError("");
        setSnap(await yutopia.planning(poker.boardId, poker.cardId, action, body));
      } catch (e) {
        const msg = (e as { body?: string }).body ?? "";
        try {
          setError(JSON.parse(msg).message ?? "Yondra said no.");
        } catch {
          setError("Yondra said no.");
        }
      }
    },
    [poker.open, poker.boardId, poker.cardId],
  );

  // join the round when a card is on the table; live updates over the board channel
  useEffect(() => {
    if (!poker.open) return setSnap(null);
    void call("join");
    const off = w?.onBoardEvent((boardId, e) => {
      const p = e.payload as PlanningSnapshot;
      if (boardId === poker.boardId && e.type === "planning.updated" && p?.card_id === poker.cardId)
        setSnap((cur) => ({ ...p, my_value: cur?.my_value }));
    });
    const poll = setInterval(() => void call("show"), 8000);
    return () => {
      off?.();
      clearInterval(poll);
    };
  }, [poker.open, poker.boardId, poker.cardId, call, w]);

  async function loadCards() {
    setPicking(true);
    const scrum = boards.filter((b) => b.type === "scrum");
    const out = [];
    for (const b of scrum) {
      try {
        const full = await yutopia.board(b.id);
        const open = full.cards.filter((c) => !c.archived_at && !c.is_done && c.section_id !== full.done_section_id);
        out.push({ board: { id: b.id, name: b.name }, cards: open });
      } catch {}
    }
    setCards(out);
  }

  const revealed = snap?.revealed;
  const values = useMemo(
    () =>
      (snap?.participants ?? [])
        .map((p) => p.value)
        .filter((v): v is string => !!v && !Number.isNaN(Number(v)))
        .map(Number),
    [snap],
  );
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const suggestion =
    avg == null
      ? null
      : (snap?.hand ?? [])
          .map(Number)
          .filter((n) => !Number.isNaN(n))
          .reduce((best, n) => (Math.abs(n - avg) < Math.abs(best - avg) ? n : best), Number.POSITIVE_INFINITY);

  return (
    <Panel title={t("poker")}>
      {!poker.open ? (
        <div>
          <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
            Put a card from a Scrum board on the table. Everyone at the table votes; the result is saved to the card in
            Yondra.
          </p>
          {!picking ? (
            <button type="button" className="deck-btn w-full mt-4" onClick={loadCards}>
              {t("pokerPickCard")}
            </button>
          ) : (
            <div className="mt-3 space-y-3 max-h-80 overflow-y-auto scroll-thin">
              {cards.length === 0 && <p className="text-sm">No open cards on Scrum boards in this project.</p>}
              {cards.map((g) => (
                <div key={g.board.id}>
                  <h3 className="mono text-xs uppercase" style={{ color: "var(--vfd)" }}>
                    {g.board.name}
                  </h3>
                  <ul className="space-y-1 mt-1">
                    {g.cards.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full text-left rounded px-2 py-1.5 text-sm hover:brightness-125"
                          style={{ background: "#120d09" }}
                          onClick={() => w?.send("poker:open", { cardId: c.id, boardId: g.board.id, title: c.name })}
                        >
                          {c.name}
                          {c.story_points != null && (
                            <span className="mono text-xs float-right" style={{ color: "var(--vfd)" }}>
                              {c.story_points} pts
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="vfd-window px-3 py-2">
            <p className="lcd text-xl">{poker.title}</p>
            <p className="mono text-[11px]" style={{ color: "var(--cream-dim)" }}>
              round {snap?.round ?? 1} · {snap?.participants.filter((p) => p.has_voted).length ?? 0}/
              {snap?.participants.filter((p) => !p.is_spectator).length ?? 0} {t("pokerWaiting")}
            </p>
          </div>
          <ul className="flex flex-wrap gap-2 mt-3" aria-label="Table">
            {snap?.participants.map((p) => (
              <li key={p.user_id} className="text-center">
                <div
                  className="w-12 h-16 rounded-md flex items-center justify-center lcd text-2xl"
                  style={{
                    background: p.has_voted ? (revealed ? "var(--paper)" : "var(--rust)") : "#120d09",
                    color: revealed ? "var(--ink)" : "var(--cream)",
                    border: "1px solid #5a412f",
                  }}
                >
                  {revealed ? (p.value ?? "–") : p.has_voted ? "✓" : "…"}
                </div>
                <span className="mono text-[10px] block mt-1 max-w-12 truncate">{p.name}</span>
              </li>
            ))}
          </ul>
          {!revealed && (
            <fieldset className="flex flex-wrap gap-1.5 mt-4">
              <legend className="sr-only">Your card</legend>
              {(snap?.hand ?? []).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="deck-btn"
                  aria-pressed={snap?.my_value === v}
                  style={{ minWidth: 44, height: 52, fontSize: 16 }}
                  onClick={() => call("vote", { value: v })}
                >
                  {v}
                </button>
              ))}
            </fieldset>
          )}
          {revealed && avg != null && (
            <p className="mt-3 text-sm">
              avg <b>{avg.toFixed(1)}</b> · suggest <b>{suggestion}</b>
              {snap?.applied_value != null && (
                <span style={{ color: "var(--vfd)" }}> · saved: {snap.applied_value} pts</span>
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm mt-2" style={{ color: "#ff8a66" }}>
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            {!revealed ? (
              <button type="button" className="deck-btn flex-1" onClick={() => call("reveal")}>
                {t("pokerReveal")}
              </button>
            ) : (
              <>
                {suggestion != null && Number.isFinite(suggestion) && (
                  <button
                    type="button"
                    className="deck-btn flex-1"
                    onClick={() => call("apply", { value: suggestion })}
                  >
                    {t("pokerSave")} ({suggestion})
                  </button>
                )}
                <button type="button" className="deck-btn" onClick={() => call("reset")}>
                  ↺
                </button>
              </>
            )}
            <button type="button" className="ghost-btn" onClick={() => w?.send("poker:close", {})}>
              {t("pokerClose")}
            </button>
          </div>
          {myUid === snap?.facilitator_id && (
            <p className="mono text-[10px] mt-2" style={{ color: "var(--muted)" }}>
              you're facilitating
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
