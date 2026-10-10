"use client";

import { useEffect, useRef } from "react";
import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { BoardPanel } from "./BoardPanel";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";
import { VortexTerminal } from "./VortexTerminal";

// Big screens: the War Room screen shows the board; the Live Room screen shows
// whoever is sharing (people you can hear), full size.
export function ScreenPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const source = w?.engine?.getObject(objectId)?.props?.source;
  const screens = useHud((s) => s.screens);
  const people = useHud((s) => s.people);
  const host = useRef<HTMLDivElement>(null);
  const sharer = people.find((p) => p.hearing && screens[String(p.uid)]);
  const video = sharer ? screens[String(sharer.uid)] : null;

  useEffect(() => {
    const el = host.current;
    if (!el || !video) return;
    const clone = document.createElement("video");
    clone.srcObject = video.srcObject;
    clone.muted = true;
    clone.playsInline = true;
    clone.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000;border-radius:8px";
    el.appendChild(clone);
    void clone.play().catch(() => {});
    return () => clone.remove();
  }, [video]);

  if (source === "board") return <BoardPanel objectId={objectId} />;
  return (
    <Panel title={t("screenShare")} wide>
      {video ? (
        <div className="h-full flex flex-col gap-2">
          <p className="mono text-xs" style={{ color: "var(--vfd)" }}>
            ● LIVE · {sharer?.name}
          </p>
          <div ref={host} className="flex-1 min-h-0" />
        </div>
      ) : (
        <div className="vfd-window p-6 text-center">
          <p className="lcd text-2xl">NO SIGNAL</p>
          <p className="text-sm mt-2" style={{ color: "var(--cream-dim)" }}>
            {t("screenNobody")}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function TerminalPanel() {
  return <VortexTerminal />;
}
