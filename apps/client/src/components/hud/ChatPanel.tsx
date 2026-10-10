"use client";

import { type ChatScope, MAX_CHAT } from "@yutopia/shared";
import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";

export function ChatPanel() {
  const t = useTr();
  const w = useWorld();
  const open = useHud((s) => s.chatOpen);
  const chat = useHud((s) => s.chat);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<ChatScope>("nearby");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 20);
  }, [open]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages arrive or the panel opens
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.length, open]);

  if (!open) return null;
  const placeholder = scope === "nearby" ? t("sayNearby") : scope === "area" ? t("sayArea") : t("saySpace");

  return (
    <section
      aria-label={t("chat")}
      className="pointer-events-auto cabinet absolute right-3 bottom-24 w-[min(360px,calc(100vw-24px))] h-[min(440px,55vh)] flex flex-col rise"
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex gap-1" role="tablist">
          {(["nearby", "area", "space"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className="ghost-btn"
              style={scope === s ? { background: "var(--amber)", color: "var(--ink)" } : {}}
            >
              {t(s)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => hud.set({ chatOpen: false })}
          aria-label={t("close")}
        >
          ✕
        </button>
      </div>
      <div ref={list} className="flex-1 overflow-y-auto scroll-thin px-3 py-2 space-y-2" aria-live="polite">
        {chat.length === 0 && (
          <p className="text-sm text-center mt-8" style={{ color: "var(--muted)" }}>
            {t("noMessages")}
          </p>
        )}
        {chat.map((m) => (
          <div key={m.id} className={m.mine ? "text-right" : ""}>
            <p className="mono text-[11px]" style={{ color: m.vortex ? "#ff6a4d" : "var(--cream-dim)" }}>
              {m.fromName}
              {m.scope !== "nearby" && <span style={{ color: "var(--muted)" }}> · {t(m.scope)}</span>}
            </p>
            <p
              className="inline-block text-sm rounded-xl px-3 py-1.5 max-w-[85%] text-left break-words"
              style={
                m.vortex
                  ? { background: "#1a0f0c", color: "#ffb35c", border: "1px solid #6b2a1e" }
                  : m.mine
                    ? { background: "var(--amber)", color: "var(--ink)" }
                    : { background: "var(--paper)", color: "var(--ink)" }
              }
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>
      <form
        className="p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          w?.chat(v, scope);
          setText("");
        }}
      >
        <input
          ref={input}
          className="field"
          maxLength={MAX_CHAT}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              hud.set({ chatOpen: false });
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <button type="submit" className="deck-btn">
          ↵
        </button>
      </form>
    </section>
  );
}
