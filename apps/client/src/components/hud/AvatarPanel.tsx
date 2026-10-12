"use client";

import { parseAvatar } from "@yutopia/shared";
import { useMemo } from "react";
import { AvatarEditor } from "@/components/AvatarEditor";
import { yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { hud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// Change your look without leaving the studio: saved in Yondra (so it sticks),
// then sent to the room so everyone sees it right away.
export function AvatarPanel() {
  const t = useTr();
  const w = useWorld();
  const initial = useMemo(() => parseAvatar(w?.personByUid(w.myUid())?.avatar), [w]);
  return (
    <Panel title={t("myLook")}>
      <AvatarEditor
        stacked
        initial={initial}
        onSave={async (a) => {
          const saved = (await yutopia.saveAvatar(a)).avatar;
          w?.send("avatar", { avatar: saved });
          setTimeout(() => hud.set({ panel: { kind: null } }), 500);
        }}
      />
    </Panel>
  );
}
