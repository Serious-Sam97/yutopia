"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import type { WorldController } from "@/world/controller";

// The admins' panel's own pieces (docs/plan/48-the-admin.md): a card with a label, a row of a
// card (what, a line on it, its controls), a choice of a few, a switch — in the look Settings has.

/** A word in English or Brazilian Portuguese, from a page's own table. */
export function useWords<K extends string>(table: Record<K, readonly [string, string]>) {
  const pt = useLang() === "pt";
  return (k: K, vars?: Record<string, string | number>) => {
    let s: string = table[k][pt ? 1 : 0];
    for (const [v, x] of Object.entries(vars ?? {})) s = s.replace(`{${v}}`, String(x));
    return s;
  };
}

export const lab = "mono text-[11.5px] uppercase tracking-[.06em]";

export function Card({
  label,
  right,
  children,
}: {
  label?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      {(label || right) && (
        <div className="flex items-center gap-3 mb-2.5">
          <p className={`${lab} flex-1`} style={{ color: "var(--amber)" }}>
            {label}
          </p>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Row({
  title,
  sub,
  first,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  first?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-3 py-2.5 flex-wrap sm:flex-nowrap"
      style={first ? undefined : { borderTop: "1px solid var(--well-edge)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px]">{title}</div>
        {sub && (
          <div className="text-[12.5px] mt-0.5" style={{ color: "var(--cream-dim)" }}>
            {sub}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onPick,
  label,
}: {
  value: T;
  options: { v: T; label: string }[];
  onPick: (v: T) => void;
  label?: string;
}) {
  return (
    <fieldset className="seg" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={o.v === value} onClick={() => onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

export function Switch({ on, onFlip, label }: { on: boolean; onFlip: () => void; label: string }) {
  return <button type="button" className="sw" aria-pressed={on} aria-label={label} onClick={onFlip} />;
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}

export function Tag({ children, tone }: { children: React.ReactNode; tone?: "lamp" | "bad" | "you" }) {
  const style =
    tone === "lamp"
      ? { color: "var(--amber)", borderColor: "color-mix(in srgb, var(--amber) 45%, transparent)" }
      : tone === "bad"
        ? { color: "var(--error)", borderColor: "color-mix(in srgb, var(--rust) 70%, transparent)" }
        : tone === "you"
          ? { color: "var(--ink)", background: "var(--cream-dim)", borderColor: "transparent" }
          : { color: "var(--cream-dim)", borderColor: "var(--edge-2)" };
  return (
    <span
      className="mono text-[10.5px] uppercase tracking-[.06em] px-1.5 py-0.5 rounded-[3px] border whitespace-nowrap"
      style={style}
    >
      {children}
    </span>
  );
}

/** The world's state, read again every `ms` (the panel shows what's live: the hour, locks…). */
export function useLive<T>(w: WorldController | null, read: (w: WorldController) => T, ms = 1000): T | null {
  const [v, setV] = useState<T | null>(() => (w?.room ? read(w) : null));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `read` is a fresh closure each render; the timer reads the latest
  useEffect(() => {
    if (!w) return;
    const tick = () => w.room && setV(read(w));
    tick();
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [w, ms]);
  return v;
}

/** My powers (Player.powers: shared admin.ts) and flying now (the walker's: the fly power on,
 *  not landed by a double-tap) — read here, a few times a second, not by the world page. */
export function useMine(w: WorldController | null): { powers: number; flying: boolean } {
  return (
    useLive(
      w,
      (w) => {
        const r = w.room;
        const p = r?.state.players.get(r.sessionId);
        // (the controller keeps its walker to itself; its `flying` is plain data)
        const walker = (w as unknown as { walker?: { flying?: boolean } | null }).walker;
        return { powers: (p?.powers as number) ?? 0, flying: !!walker?.flying };
      },
      250,
    ) ?? { powers: 0, flying: false }
  );
}

/** "3 min", "2 h", "yesterday", "12 Oct": how long ago. */
export function ago(iso: string | number, pt: boolean): string {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return pt ? "agora" : "just now";
  if (m < 60) return pt ? `há ${m} min` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return pt ? `há ${h} h` : `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return pt ? "ontem" : "yesterday";
  if (d < 14) return pt ? `há ${d} dias` : `${d} days ago`;
  return new Date(t).toLocaleDateString(pt ? "pt-BR" : "en-GB", { day: "numeric", month: "short" });
}
