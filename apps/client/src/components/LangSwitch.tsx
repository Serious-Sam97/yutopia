"use client";

import { setLang, useLang } from "@/lib/i18n";

export function LangSwitch() {
  const l = useLang();
  return (
    <fieldset className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--edge)" }}>
      <legend className="sr-only">Language</legend>
      {(["en", "pt"] as const).map((x) => (
        <button
          key={x}
          type="button"
          aria-pressed={l === x}
          onClick={() => setLang(x)}
          className="mono text-xs px-2.5 py-1.5 uppercase"
          style={{
            background: l === x ? "var(--amber)" : "transparent",
            color: l === x ? "var(--ink)" : "var(--cream)",
          }}
        >
          {x}
        </button>
      ))}
    </fieldset>
  );
}
