"use client";

import dynamic from "next/dynamic";
import { useHud } from "@/world/store";
import { extraPanels } from "./panels";

const BoardPanel = dynamic(() => import("./BoardPanel").then((m) => m.BoardPanel), { ssr: false });
const SettingsPanel = dynamic(() => import("./SettingsPanel").then((m) => m.SettingsPanel), { ssr: false });

// the avatar editor loads on demand (the world page is close to its size budget)
const AvatarPanel = dynamic(() => import("./AvatarPanel").then((m) => m.AvatarPanel), { ssr: false });
const PetPanel = dynamic(() => import("./PetPanel").then((m) => m.PetPanel), { ssr: false });

export function PanelHost() {
  const panel = useHud((s) => s.panel);
  if (!panel.kind) return null;
  if (panel.kind === "settings") return <SettingsPanel />;
  if (panel.kind === "avatar") return <AvatarPanel />;
  if (panel.kind === "pets") return <PetPanel />;
  if (panel.kind === "board" || (panel.kind === "screen" && panel.objectId)) {
    const Extra = extraPanels[panel.kind];
    if (panel.kind === "screen" && Extra) return <Extra objectId={panel.objectId ?? ""} />;
    return <BoardPanel objectId={panel.objectId ?? ""} />;
  }
  const Extra = extraPanels[panel.kind];
  return Extra ? <Extra objectId={panel.objectId ?? ""} /> : null;
}
