"use client";

import { type AvatarLayers, parseAvatar } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { AvatarEditor } from "@/components/AvatarEditor";
import { yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { hud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// Change your look without leaving the studio: saved in the API (so it sticks),
// then sent to the room so everyone sees it right away.
export function AvatarPanel() {
  const t = useTr();
  const w = useWorld();
  // start from the look saved in the API (the room's copy can be older)
  const [initial, setInitial] = useState<AvatarLayers>(() => parseAvatar(w?.personByUid(w.myUid())?.avatar));
  useEffect(() => {
    yutopia
      .avatar()
      .then((r) => setInitial(parseAvatar(r.avatar)))
      .catch(() => {});
  }, []);
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
