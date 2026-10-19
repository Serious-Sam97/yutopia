"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/api";
import { mixer } from "@/world/audio";
import { WorldController } from "@/world/controller";
import { radio, sound } from "@/world/sound";
import { hud, useHud } from "@/world/store";
import { extraPanels } from "./panels";

// the panels PanelHost draws itself (the rest come from ./panels)
const OWN_PANELS = new Set(["settings", "avatar", "pets"]);

import { ActionMenu, ActionQueueBar, ArrivalChip, FocusChip } from "./Actions";
import { WorldCtx } from "./ctx";
import { Dock } from "./Dock";
import {
  CableChip,
  ConnectionOverlay,
  HeldChip,
  Knocks,
  LookHint,
  Minimap,
  Prompt,
  Toasts,
  VideoBubbles,
} from "./Overlays";
import { PanelHost } from "./PanelHost";
import { PersonCard } from "./PersonCard";
import { Rituals } from "./Rituals";
import { ScreenTray } from "./Screens";
import { TopBar } from "./TopBar";

// loaded the first time someone builds
const BuildMode = dynamic(() => import("./build/BuildMode").then((m) => m.BuildMode), { ssr: false });
// chat · people · room: loaded the first time the panel opens
const SidePanel = dynamic(() => import("./SidePanel").then((m) => m.SidePanel), { ssr: false });

// The phone (Vortex Mobile): its screens load with the phone's chunk, soon after arriving.
const PhoneLayerLazy = dynamic(() => import("./phone/PhoneLayer").then((m) => m.PhoneLayer), { ssr: false });
function PhoneLayer() {
  const on = useHud((s) => s.phone.loaded);
  return on ? <PhoneLayerLazy /> : null;
}

// A battle proposed to me, or one going on: their chunk loads when there is one.
const PetOverlaysLazy = dynamic(() => import("./PetOverlays").then((m) => m.PetOverlays), { ssr: false });
function PetOverlays() {
  const on = useHud((s) => !!s.challenge || !!s.battle);
  return on ? <PetOverlaysLazy /> : null;
}

export function WorldView({ to }: { to?: string | null }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const [ctrl, setCtrl] = useState<WorldController | null>(null);
  const phase = useHud((s) => s.phase);
  // build mode takes over the screen (its own top bar, panels and bottom bar)
  const building = useHud((s) => s.build.on && s.canBuild);
  const side = useHud((s) => s.side);
  // the phone's camera: the screen is the viewfinder, the HUD steps aside
  const camera = useHud((s) => s.phone.camera);
  // at the slot-car track's controls, a console or a TV: their console takes the screen
  const racing = useHud(
    (s) =>
      s.panel.kind === "slotcar" ||
      s.panel.kind === "pool" ||
      s.panel.kind === "pong" ||
      s.panel.kind === "console" ||
      s.panel.kind === "tv",
  );

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const c = new WorldController(host.current as HTMLDivElement);
    c.onOpenPanel = (kind, objectId) => {
      // only a panel that exists: an unknown kind would sit open unseen and swallow the keys
      if (!(kind in extraPanels) && !OWN_PANELS.has(kind)) return;
      hud.set({ panel: { kind: kind as never, objectId } });
    };
    setCtrl(c);
    void c.start();
    // handy for debugging and the e2e/perf tools
    Object.assign(window as object, { __yutopia: c, __hud: hud, __audio: { mixer, radio, sound } });
    return () => {
      c.stop();
      setCtrl(null);
    };
  }, [router]);

  // "Join them" deep link: /?to=user:5
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
        <div className="pointer-events-none absolute inset-0" style={camera ? { display: "none" } : undefined}>
          {!building && <TopBar />}
          {!building && <Rituals />}
          {!building && side && <SidePanel />}
          <PersonCard />
          <Knocks />
          <Toasts />
          {!building && <Prompt />}
          {!building && <HeldChip />}
          {!building && <CableChip />}
          {!building && <LookHint />}
          {!building && <FocusChip />}
          {!building && <ArrivalChip />}
          {!building && <ActionQueueBar />}
          {!building && <PetOverlays />}
          {!building && <ScreenTray />}
          {building && <BuildMode />}
          {!racing && <Minimap />}
          {!building && !racing && <Dock />}
          <PanelHost />
          {!building && <ActionMenu />}
        </div>
        {!building && <PhoneLayer />}
        <ConnectionOverlay />
      </main>
    </WorldCtx.Provider>
  );
}
