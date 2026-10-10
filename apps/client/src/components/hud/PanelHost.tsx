"use client";

import { useHud } from "@/world/store";
import { BoardPanel } from "./BoardPanel";
import { extraPanels } from "./panels";
import { SettingsPanel } from "./SettingsPanel";

export function PanelHost() {
  const panel = useHud((s) => s.panel);
  if (!panel.kind) return null;
  if (panel.kind === "settings") return <SettingsPanel />;
  if (panel.kind === "board" || (panel.kind === "screen" && panel.objectId)) {
    const Extra = extraPanels[panel.kind];
    if (panel.kind === "screen" && Extra) return <Extra objectId={panel.objectId ?? ""} />;
    return <BoardPanel objectId={panel.objectId ?? ""} />;
  }
  const Extra = extraPanels[panel.kind];
  return Extra ? <Extra objectId={panel.objectId ?? ""} /> : null;
}
