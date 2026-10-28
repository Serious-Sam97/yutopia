"use client";

import { mediaOf } from "@yutopia/shared/media";
import { useEffect, useRef, useState } from "react";
import { useLang, useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { MediaRemote } from "./MediaPanel";
import { Panel } from "./Panel";

// Big screens: whoever is sharing (people you can hear), full size, or the TV.
export function ScreenPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const source = w?.model?.getObject(objectId)?.props?.source;
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

  return <ScreenTabs objectId={objectId} share={!!video} stage={source === "stage"} body={<ShareView />} />;

  function ShareView() {
    return video ? (
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
    );
  }
}

// The big screen shows a screen share or, when nobody shares, the TV (YouTube /
// Jellyfin, docs/plan/10-media.md). The stage's screen is only for sharing.
function ScreenTabs({
  objectId,
  share,
  stage,
  body,
}: {
  objectId: string;
  share: boolean;
  stage: boolean;
  body: React.ReactNode;
}) {
  const t = useTr();
  const w = useWorld();
  const pt = useLang() === "pt";
  const hasMedia = !!mediaOf(w?.model?.getObject(objectId));
  const [tab, setTab] = useState<"share" | "tv">(!share && hasMedia ? "tv" : "share");
  if (stage)
    return (
      <Panel title={t("screenShare")} wide>
        {body}
      </Panel>
    );
  return (
    <Panel title={t("screenShare")} wide={tab === "share"}>
      <div className="flex gap-2 mb-3">
        <button type="button" className="chip" aria-pressed={tab === "share"} onClick={() => setTab("share")}>
          {t("screenShare")}
        </button>
        <button type="button" className="chip" aria-pressed={tab === "tv"} onClick={() => setTab("tv")}>
          TV · YouTube{w?.mediaKey?.jf ? " / Jellyfin" : ""}
        </button>
      </div>
      <div hidden={tab !== "tv"}>
        {share && (
          <p className="text-xs mb-2" style={{ color: "var(--amber)" }}>
            {pt
              ? "Alguém está compartilhando a tela: ela passa na frente da TV."
              : "Someone is sharing their screen: it shows instead of the TV."}
          </p>
        )}
        <MediaRemote id={objectId} />
      </div>
      <div hidden={tab !== "share"} className="h-full">
        {body}
      </div>
    </Panel>
  );
}
