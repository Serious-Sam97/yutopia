"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/api";
import { installCrashHandlers } from "@/lib/crash";
import { prefs, subscribePrefs } from "@/lib/prefs";
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
import { Guard } from "./Guard";
import {
  CableChip,
  ConnectionOverlay,
  HeldChip,
  Knocks,
  LockChip,
  LookHint,
  Minimap,
  Prompt,
  Toasts,
  VideoBubbles,
  WrapPicker,
} from "./Overlays";
import { PanelHost } from "./PanelHost";
import { PersonCard } from "./PersonCard";
import { Rituals } from "./Rituals";
import { ScreenTray } from "./Screens";
import { TopBar } from "./TopBar";

// (the lift's panel, its pad's floors among it: only in an elevator's car — loaded then)
const LiftPanel = dynamic(() => import("./LiftPanel").then((m) => m.LiftPanel), { ssr: false });

// God mode's HUD (docs/plan/53-the-god-mode.md): an admin's, loaded the first time they go in
const GodHud = dynamic(() => import("./god/GodHud").then((m) => m.GodHud), { ssr: false });
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
// the admins' own HUD (docs/plan/48-the-admin.md): their powers' strip, the ` quick box — an admin's only
const AdminHud = dynamic(() => import("./admin/AdminHud").then((m) => m.AdminHud), { ssr: false });
function PetOverlays() {
  const on = useHud((s) => !!s.challenge || !!s.battle);
  return on ? <PetOverlaysLazy /> : null;
}

export function WorldView({ to }: { to?: string | null }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const [ctrl, setCtrl] = useState<WorldController | null>(null);
  const phase = useHud((s) => s.phase);
  // build mode takes over the screen (its own top bar, panels and bottom bar); god mode too, on
  // foot in its draft a strip of its own over a bare world
  const god = useHud((s) => s.god.on);
  const godWalking = useHud((s) => s.god.on && s.god.walking);
  const building = useHud((s) => (s.build.on && s.canBuild) || s.god.on);
  const admin = useHud((s) => s.isAdmin);
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
    installCrashHandlers();
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
    // (plan 73, phase 0a: the life look's light on today's models, for the mock stills — dev only)
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window as object, {
        __lifeProbe: (on: boolean, o?: object) =>
          import("@/world/look/life-probe").then((m) => m.lifeProbe(c.tp, on, o)),
      });
    }
    // the frame's stages in a corner, while Settings → Graphics → Show frame stats is on
    let offPerf: (() => void) | null = null;
    let gone = false;
    let want = false;
    const syncPerf = () => {
      if (prefs().perfStats === want) return;
      want = prefs().perfStats;
      if (!want) {
        offPerf?.();
        offPerf = null;
        return;
      }
      void import("@/world/perf-overlay").then((m) => {
        if (!gone && want && !offPerf) offPerf = m.mountPerfOverlay(c);
      });
    };
    syncPerf();
    const offPrefs = subscribePrefs(syncPerf);
    return () => {
      gone = true;
      offPrefs();
      offPerf?.();
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
      {/* (isolate: YouTube's player on a TV sits under the canvas at z -1 — media/card.ts — over
          the body's background, which would hide it outside a stacking context of its own) */}
      <main className="relative isolate h-full w-full overflow-hidden select-none">
        <div ref={host} className="absolute inset-0" />
        <Guard name="VideoBubbles">
          <VideoBubbles />
        </Guard>
        <div className="pointer-events-none absolute inset-0" style={camera ? { display: "none" } : undefined}>
          {(!building || godWalking) && (
            <Guard name="TopBar">
              <TopBar />
            </Guard>
          )}
          {!building && (
            <Guard name="Rituals">
              <Rituals />
            </Guard>
          )}
          {!building && side && (
            <Guard name="SidePanel">
              <SidePanel />
            </Guard>
          )}
          <Guard name="PersonCard">
            <PersonCard />
          </Guard>
          <Guard name="Knocks">
            <Knocks />
          </Guard>
          <Guard name="Toasts">
            <Toasts />
          </Guard>
          {!building && (
            <Guard name="Prompt">
              <Prompt />
            </Guard>
          )}
          {!building && (
            <Guard name="LiftPanel">
              <LiftPanel />
            </Guard>
          )}
          {!building && (
            <Guard name="HeldChip">
              <HeldChip />
            </Guard>
          )}
          {!building && (
            <Guard name="WrapPicker">
              <WrapPicker />
            </Guard>
          )}
          {!building && (
            <Guard name="CableChip">
              <CableChip />
            </Guard>
          )}
          {!building && (
            <Guard name="LookHint">
              <LookHint />
            </Guard>
          )}
          {!building && (
            <Guard name="LockChip">
              <LockChip />
            </Guard>
          )}
          {!building && (
            <Guard name="FocusChip">
              <FocusChip />
            </Guard>
          )}
          {!building && (
            <Guard name="ArrivalChip">
              <ArrivalChip />
            </Guard>
          )}
          {!building && (
            <Guard name="ActionQueueBar">
              <ActionQueueBar />
            </Guard>
          )}
          {!building && (
            <Guard name="PetOverlays">
              <PetOverlays />
            </Guard>
          )}
          {!building && (
            <Guard name="ScreenTray">
              <ScreenTray />
            </Guard>
          )}
          {building && !god && (
            <Guard name="BuildMode">
              <BuildMode />
            </Guard>
          )}
          {god && (
            <Guard name="GodHud">
              <GodHud />
            </Guard>
          )}
          {!racing && (
            <Guard name="Minimap">
              <Minimap />
            </Guard>
          )}
          {!building && !racing && (
            <Guard name="Dock">
              <Dock />
            </Guard>
          )}
          {admin && !building && (
            <Guard name="AdminHud">
              <AdminHud />
            </Guard>
          )}
          <Guard name="PanelHost">
            <PanelHost />
          </Guard>
          {!building && (
            <Guard name="ActionMenu">
              <ActionMenu />
            </Guard>
          )}
        </div>
        {!building && (
          <Guard name="PhoneLayer">
            <PhoneLayer />
          </Guard>
        )}
        <Guard name="ConnectionOverlay">
          <ConnectionOverlay />
        </Guard>
      </main>
    </WorldCtx.Provider>
  );
}
