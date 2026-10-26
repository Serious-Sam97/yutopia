"use client";

import { useEffect } from "react";
import { useTr } from "@/lib/i18n";
import { hud } from "@/world/store";

// The framed modal every in-world panel uses: its title, the zigzag, Esc closes.
export function Panel({
  title,
  children,
  wide = false,
  size,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  size?: string; // the cabinet's own size classes (instead of wide / the default)
  onClose?: () => void;
}) {
  const t = useTr();
  const close = onClose ?? (() => hud.set({ panel: { kind: null } }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div
      className="pointer-events-auto absolute inset-0 flex items-center justify-center p-3 bg-[color:var(--scrim)]"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`cabinet flex flex-col rise w-full ${size ?? (wide ? "max-w-6xl h-[min(860px,92vh)]" : "max-w-lg max-h-[86vh]")}`}
      >
        <header className="px-4 pt-3.5 pb-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="title text-[22px] truncate min-w-0">{title}</h2>
            <button type="button" className="ghost-btn shrink-0" onClick={close} aria-label={t("close")}>
              ✕ <span className="hidden sm:inline">esc</span>
            </button>
          </div>
          <div className="zigzag mt-2.5 w-40" aria-hidden />
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-4 pb-4">{children}</div>
      </section>
    </div>
  );
}
