"use client";

import dynamic from "next/dynamic";
import { hud, useHud } from "@/world/store";
import { extraPanels } from "./panels";

const SettingsPanel = dynamic(() => import("./SettingsPanel").then((m) => m.SettingsPanel), { ssr: false });
const ControllersPanel = dynamic(() => import("./ControllersPanel").then((m) => m.ControllersPanel), { ssr: false });

// the avatar editor loads on demand (the world page is close to its size budget)
const AvatarPanel = dynamic(() => import("./AvatarPanel").then((m) => m.AvatarPanel), { ssr: false });
const PetPanel = dynamic(() => import("./PetPanel").then((m) => m.PetPanel), { ssr: false });
// (plan 123) a placed NPC's card
const NpcCard = dynamic(() => import("./NpcCard").then((m) => m.NpcCard), { ssr: false });
// (plan 130) a home lot's card
const LotCard = dynamic(() => import("./LotCard").then((m) => m.LotCard), { ssr: false });
const EmoteWheel = dynamic(() => import("./EmoteWheel").then((m) => m.EmoteWheel), { ssr: false });
// the admins' panel (docs/plan/48-the-admin.md): only ever loaded for an admin
// (plan 125 phase 6) the new UI's pause menu: its own chunk (the map's drawing)
const LampPause = dynamic(() => import("./lamp/LampPause").then((m) => m.LampPause), { ssr: false });
const LampCase = dynamic(() => import("./lamp/LampCase").then((m) => m.LampCase), { ssr: false });
const AdminPanel = dynamic(() => import("./admin/AdminPanel").then((m) => m.AdminPanel), { ssr: false });

export function PanelHost() {
  const panel = useHud((s) => s.panel);
  if (!panel.kind) return null;
  if (panel.kind === "pause") return <LampPause />;
  if (panel.kind === "case") return <LampCase />;
  if (panel.kind === "settings") return <SettingsPanel />;
  if (panel.kind === "pads") return <ControllersPanel onClose={() => hud.set({ panel: { kind: "settings" } })} />;
  if (panel.kind === "avatar") return <AvatarPanel />;
  if (panel.kind === "pets") return <PetPanel />;
  if (panel.kind === "npc") return <NpcCard objectId={panel.objectId ?? ""} />;
  if (panel.kind === "lot") return <LotCard objectId={panel.objectId ?? ""} />;
  if (panel.kind === "emotes") return <EmoteWheel objectId={panel.objectId ?? ""} />;
  if (panel.kind === "admin") return <AdminPanel />;
  const Extra = extraPanels[panel.kind];
  return Extra ? <Extra objectId={panel.objectId ?? ""} /> : null;
}
