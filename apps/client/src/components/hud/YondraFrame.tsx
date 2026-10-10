"use client";

import { useEffect, useRef } from "react";
import { getToken, YONDRA_APP } from "@/lib/api";
import { hud } from "@/world/store";

// Any Yondra page, embedded chrome-less. Yondra's /embed/yutopia bootstrap asks
// for our token (same account) over postMessage, then opens `path`.
export function YondraFrame({ path, title }: { path: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = new URL(YONDRA_APP).origin;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow || typeof e.data !== "object" || !e.data)
        return;
      if (e.data.type === "yondra:ready")
        frame.current?.contentWindow?.postMessage({ type: "yutopia:auth", token: getToken() }, origin);
      else if (e.data.type === "yondra:close") hud.set({ panel: { kind: null } });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [origin]);

  return (
    <iframe
      ref={frame}
      title={title}
      src={`${YONDRA_APP}/embed/yutopia?embed=yutopia&to=${encodeURIComponent(path)}`}
      className="flex-1 w-full rounded-lg border-0"
      style={{ background: "#1a1410", minHeight: 420 }}
      allow="clipboard-write; autoplay"
    />
  );
}
