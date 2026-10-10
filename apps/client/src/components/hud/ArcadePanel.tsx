"use client";

import { useTr } from "@/lib/i18n";
import { Panel } from "./Panel";
import { YondraFrame } from "./YondraFrame";

// The cabinet plays Yondra's own arcade (Vortex's games, shared high scores).
export function ArcadePanel() {
  const t = useTr();
  return (
    <Panel title={t("arcade")} wide>
      <div className="h-full flex flex-col">
        <YondraFrame path="/arcade" title={t("arcade")} />
      </div>
    </Panel>
  );
}
