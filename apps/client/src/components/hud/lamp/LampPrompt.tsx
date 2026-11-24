"use client";

import { useEffect, useState } from "react";
import { trMaybe, useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "../ctx";

// GTA's help box, top-left (docs/plan/125-the-new-ui.md phase 2): what you can do here and its key — the prompt and
// the things in reach (Tab steps through them, as the old prompt did: components/hud/Overlays.tsx Prompt), else the
// mouse-look hint. The same clicks as before: the box uses what it names.
const LOOK_HINT_MS = 4000;

export function LampPrompt() {
  const t = useTr();
  const w = useWorld();
  const prompt = useHud((s) => s.prompt);
  const targets = useHud((s) => s.targets);
  const pad = useHud((s) => s.padLive);
  const panel = useHud((s) => s.panel.kind);
  const menu = useHud((s) => s.menu);
  const look = useHud((s) => s.look);
  const free = useHud(
    (s) =>
      s.phase === "ready" &&
      !s.loading.on &&
      !s.menu &&
      !s.panel.kind &&
      !s.pickArrival &&
      s.side === null &&
      !s.phone.open,
  );
  const [lookShown, setLookShown] = useState(false);
  useEffect(() => {
    if (!look) return setLookShown(false);
    setLookShown(true);
    const id = setTimeout(() => setLookShown(false), LOOK_HINT_MS);
    return () => clearTimeout(id);
  }, [look]);
  if (panel || menu) return null;
  const key = (k: string) => (
    <kbd className="l-key" style={pad ? { borderRadius: 12 } : undefined}>
      {k}
    </kbd>
  );
  const own = prompt && /^(car|ride|plug)/.test(prompt.kind);
  const items = targets?.items ?? [];
  if (items.length && !own) {
    const focus = items[targets?.at ?? 0] ?? items[0];
    const verb = (it: (typeof items)[number]) =>
      it.kind === "object" && it.act === "use"
        ? t(prompt?.kind === "notice" || prompt?.kind === "screen" ? "pressToOpen" : "pressToUse")
        : (trMaybe(`act_${it.act}`) ?? it.act);
    return (
      <div className="l-help pointer-events-auto" data-lamp-help="">
        <button
          type="button"
          onClick={() => w?.interact()}
          data-focus={focus.key}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
        >
          <b>{focus.label}</b>
          <div style={{ marginTop: 4 }}>
            {key(pad ? (prompt?.padKey ?? "Y") : (prompt?.key ?? "E"))} {verb(focus)}
          </div>
        </button>
        {items.length > 1 && (
          <div style={{ marginTop: 6, fontSize: 14, color: "#cfc7b4" }}>
            {key(pad ? "LB" : "Tab")} {items.indexOf(focus) + 1}/{items.length} ·{" "}
            {items
              .filter((it) => it !== focus)
              .map((it) => (
                <button
                  type="button"
                  key={it.key}
                  onClick={() => w?.focus.pickFocus(it.key)}
                  style={{ all: "unset", cursor: "pointer", marginRight: 10, textDecoration: "underline dotted" }}
                >
                  {it.label}
                </button>
              ))}
          </div>
        )}
        {focus.kind !== "toy" && focus.kind !== "npc" && (
          <div className="l-cap" style={{ marginTop: 8, color: "#bdb7aa" }}>
            {t("holdMore")}
          </div>
        )}
      </div>
    );
  }
  if (prompt) {
    const opens = prompt.kind === "notice" || prompt.kind === "screen";
    return (
      <button
        type="button"
        className="l-help pointer-events-auto"
        onClick={() => w?.interact()}
        style={{ textAlign: "left", cursor: "pointer" }}
        data-lamp-help=""
      >
        {key(pad ? (prompt.padKey ?? "Y") : (prompt.key ?? "E"))} <b>{prompt.label}</b>
        {prompt.kind !== "plug" && opens && <span style={{ color: "#cfc7b4" }}> · {t("pressToOpen")}</span>}
      </button>
    );
  }
  // nothing in reach: how to look round, while it matters
  if ((!look && free) || lookShown)
    return (
      <div className="l-help" data-lamp-help="">
        {look ? (
          <>
            {key("Esc")} {t("lookHint")}
          </>
        ) : (
          <>
            {t("lookClick")}
            <div style={{ marginTop: 4, color: "#cfc7b4", fontSize: 14 }}>
              <span className="l-key sm">Esc</span> {t("lampMenu")}
            </div>
          </>
        )}
      </div>
    );
  return null;
}
