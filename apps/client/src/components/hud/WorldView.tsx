"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/api";
import { mixer } from "@/world/audio";
import { WorldController } from "@/world/controller";
import { radio, sound } from "@/world/sound";
import { hud, useHud } from "@/world/store";
import { WorldCtx } from "./ctx";
import { Dock } from "./Dock";
import { ConnectionOverlay, HeldChip, Knocks, Minimap, Prompt, Toasts, VideoBubbles } from "./Overlays";
import { PanelHost } from "./PanelHost";
import { PersonCard } from "./PersonCard";
import { Rituals } from "./Rituals";
import { TopBar } from "./TopBar";

// project owners only: loaded the first time someone builds
const BuildMode = dynamic(() => import("./build/BuildMode").then((m) => m.BuildMode), { ssr: false });
// chat · people · room: loaded the first time the panel opens
const SidePanel = dynamic(() => import("./SidePanel").then((m) => m.SidePanel), { ssr: false });

export function WorldView({ spaceId, to }: { spaceId: number; to?: string | null }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const [ctrl, setCtrl] = useState<WorldController | null>(null);
  const phase = useHud((s) => s.phase);
  // build mode takes over the screen (its own top bar, panels and bottom bar)
  const building = useHud((s) => s.build.on && s.canBuild);
  const side = useHud((s) => s.side);

  useEffect(() => {
    if (!getToken()) {
      router.replace(`/login?next=/s/${spaceId}`);
      return;
    }
    const c = new WorldController(host.current as HTMLDivElement, spaceId);
    c.onOpenPanel = (kind, objectId) => hud.set({ panel: { kind: kind as never, objectId } });
    setCtrl(c);
    void c.start();
    // handy for debugging and the e2e/perf tools
    Object.assign(window as object, { __yutopia: c, __hud: hud, __audio: { mixer, radio, sound } });
    return () => {
      c.stop();
      setCtrl(null);
    };
  }, [spaceId, router]);

  // "Join them" deep link from Yondra: /s/12?to=user:5
  useEffect(() => {
    if (phase !== "ready" || !ctrl || !to) return;
    const m = /^user:(\d+)$/.exec(to);
    if (m) setTimeout(() => ctrl.teleport({ userId: Number(m[1]) }), 300);
  }, [phase, ctrl, to]);

  return (
    <WorldCtx.Provider value={ctrl}>
      <main className="relative h-full w-full overflow-hidden select-none">
        <div ref={host} className="absolute inset-0" />
        <VideoBubbles />
        <div className="pointer-events-none absolute inset-0">
          {!building && <TopBar />}
          {!building && <Rituals />}
          {!building && side && <SidePanel />}
          <PersonCard />
          <Knocks />
          <Toasts />
          {!building && <Prompt />}
          {!building && <HeldChip />}
          {building && <BuildMode />}
          <Minimap />
          {!building && <Dock />}
          <PanelHost />
        </div>
        <ConnectionOverlay />
      </main>
    </WorldCtx.Provider>
  );
}
