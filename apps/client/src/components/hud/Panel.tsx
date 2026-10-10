"use client";

import { useEffect } from "react";
import { useTr } from "@/lib/i18n";
import { hud } from "@/world/store";

// Walnut cabinet modal used by every in-world panel. Esc closes.
export function Panel({
  title,
  children,
  wide = false,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
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
      className="pointer-events-auto absolute inset-0 flex items-center justify-center p-3 bg-[#0d0906aa]"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`cabinet flex flex-col rise w-full ${wide ? "max-w-6xl h-[min(860px,92vh)]" : "max-w-lg max-h-[86vh]"}`}
      >
        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div className="vfd-window px-3 py-1 min-w-0">
            <h2 className="lcd text-xl truncate">{title.toUpperCase()}</h2>
          </div>
          <button type="button" className="ghost-btn" onClick={close} aria-label={t("close")}>
            ✕ <span className="hidden sm:inline">Esc</span>
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-4 pb-4">{children}</div>
      </section>
    </div>
  );
}
