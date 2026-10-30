"use client";

import {
  AVATAR_OPTIONS,
  type AvatarLayers,
  avatarFromSeed,
  CLOTH_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
} from "@yutopia/shared";
import { useEffect, useState } from "react";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { type Key, useLang, useTr } from "@/lib/i18n";

type ShapeKey = keyof typeof AVATAR_OPTIONS;
// shoes: cream, black, walnut, rust, olive, slate; frames: dark, tortoise, gold, rust, slate
// options whose slug isn't how you'd say it
const NAMES: Record<string, string> = {
  longskirt: "long skirt",
  hightops: "high-tops",
  crew: "crew cut",
  slick: "slicked back",
  full: "full beard",
};
const SHOE_COLORS = ["#efe4cc", "#2a2420", "#5b3a26", "#b5562f", "#6e7b3a", "#3d4a5c"];
const FRAME_COLORS = ["#2a2420", "#5b3a26", "#c39a4a", "#b5562f", "#3d4a5c"];
type Tab = "body" | "hair" | "clothes" | "extras";
// (the tabs' names live here, not in i18n.ts: the editor is out of the world page)
const TABS: { id: Tab; name: [string, string] }[] = [
  { id: "body", name: ["Body", "Corpo"] },
  { id: "hair", name: ["Hair", "Cabelo"] },
  { id: "clothes", name: ["Clothes", "Roupas"] },
  { id: "extras", name: ["Extras", "Extras"] },
];
const ROWS: { shape?: ShapeKey; color?: keyof AvatarLayers; palette?: string[]; label: Key; tab: Tab }[] = [
  { shape: "gender", label: "gender", tab: "body" },
  { shape: "body", label: "body", tab: "body" },
  // (plan 58 4e: kept with the look, seen by everyone; the preview walks it)
  { shape: "gait", label: "gait", tab: "body" },
  { color: "skin", palette: SKIN_TONES, label: "skin", tab: "body" },
  { shape: "hair", label: "hair", tab: "hair" },
  { color: "hairColor", palette: HAIR_COLORS, label: "hairColor", tab: "hair" },
  { shape: "beard", label: "beard", tab: "hair" },
  { shape: "top", label: "top", tab: "clothes" },
  { color: "topColor", palette: CLOTH_COLORS, label: "topColor", tab: "clothes" },
  { shape: "bottom", label: "bottom", tab: "clothes" },
  { color: "bottomColor", palette: CLOTH_COLORS, label: "bottomColor", tab: "clothes" },
  { shape: "shoes", label: "shoes", tab: "clothes" },
  { color: "shoesColor", palette: SHOE_COLORS, label: "shoesColor", tab: "clothes" },
  { shape: "accessory", label: "accessory", tab: "extras" },
  { color: "accessoryColor", palette: CLOTH_COLORS, label: "accessoryColor", tab: "extras" },
  { shape: "eyewear", label: "eyewear", tab: "extras" },
  { color: "eyewearColor", palette: FRAME_COLORS, label: "eyewearColor", tab: "extras" },
  { shape: "extra", label: "extra", tab: "extras" },
  { color: "extraColor", palette: CLOTH_COLORS, label: "extraColor", tab: "extras" },
];

// The avatar editor: turntable preview + every option. Used by the /avatar page
// (side by side) and in the world (stacked, inside a panel).
export function AvatarEditor({
  initial,
  onSave,
  stacked = false,
}: {
  initial: AvatarLayers;
  onSave: (a: AvatarLayers) => Promise<void>;
  stacked?: boolean;
}) {
  const t = useTr();
  const pt = useLang() === "pt";
  const [tab, setTab] = useState<Tab>("body");
  const [a, setA] = useState<AvatarLayers>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [walk, setWalk] = useState(false);
  useEffect(() => setA(initial), [initial]);

  const set = (patch: Partial<AvatarLayers>) => {
    setA((x) => ({ ...x, ...patch }));
    setState("idle");
  };

  async function save() {
    setState("saving");
    try {
      await onSave(a);
      setState("saved");
    } catch {
      setState("failed"); // never fail silently: say so, keep the edits
    }
  }

  const preview = (
    <div className={stacked ? "flex gap-3 items-stretch" : "cabinet p-4 h-max md:sticky md:top-6"}>
      <div
        className="flex justify-center shrink-0 rounded"
        style={{
          background: "radial-gradient(70% 60% at 50% 70%, var(--tile-hi), var(--pit-2) 75%)",
          border: "1px solid var(--well-edge)",
        }}
      >
        <AvatarCanvas avatar={a} size={stacked ? 150 : 300} walk={walk} />
      </div>
      <div className={stacked ? "flex flex-col gap-2 flex-1 justify-end" : ""}>
        <div className={stacked ? "flex flex-col gap-2" : "flex gap-2 mt-3"}>
          <button
            type="button"
            className={`deck-btn ${stacked ? "" : "flex-1"}`}
            aria-pressed={walk}
            onClick={() => setWalk((w) => !w)}
          >
            <span className="led" />▶ Walk
          </button>
          <button
            type="button"
            className={`deck-btn ${stacked ? "" : "flex-1"}`}
            onClick={() => set(avatarFromSeed(Math.floor(Math.random() * 1e6)))}
          >
            ⟳ {t("randomize")}
          </button>
        </div>
        <button
          type="button"
          className={`deck-btn lit w-full ${stacked ? "" : "mt-3"}`}
          onClick={save}
          disabled={state === "saving"}
        >
          {state === "saved" ? `✓ ${t("saved")}` : t("save")}
        </button>
        {state === "failed" && (
          <p role="alert" className="mono text-xs mt-2" style={{ color: "var(--alert)" }}>
            {t("lookNotSaved")}
          </p>
        )}
      </div>
    </div>
  );

  const options = (
    <div className={stacked ? "mt-4" : "cabinet px-6 py-5"}>
      {!stacked && (
        <>
          <h1 className="title text-[26px]">{t("myLook")}</h1>
          <div className="zigzag w-[150px] mt-3" aria-hidden />
        </>
      )}
      <div className="flex gap-1 mt-3 mb-4" role="tablist" style={{ borderBottom: "1px solid var(--edge)" }}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className="relative px-3.5 pt-2 pb-2.5 text-sm font-medium"
            style={{ color: tab === x.id ? "var(--amber)" : "var(--cream-dim)" }}
            onClick={() => setTab(x.id)}
          >
            {x.name[pt ? 1 : 0]}
            {tab === x.id && (
              <span
                className="absolute left-2.5 right-2.5 -bottom-px h-0.5"
                style={{ background: "var(--amber)", boxShadow: "0 0 8px var(--lamp-glow)" }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="space-y-5" role="tabpanel">
        {ROWS.filter((row) => row.tab === tab).map((row) => (
          <fieldset key={row.label}>
            <legend className="mono text-[11.5px] uppercase tracking-[.06em] mb-2.5" style={{ color: "var(--amber)" }}>
              {t(row.label)}
            </legend>
            <div className="flex flex-wrap gap-2">
              {row.shape &&
                AVATAR_OPTIONS[row.shape].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={a[row.shape as ShapeKey] === opt}
                    onClick={() => {
                      set({ [row.shape as string]: opt });
                      // (a walk chosen: the preview walks it)
                      if (row.shape === "gait") setWalk(true);
                    }}
                    className="deck-btn"
                    style={{ height: 34, fontSize: 12.5 }}
                  >
                    {row.shape === "gender" || row.shape === "gait"
                      ? t(`${row.shape}_${opt}` as Key)
                      : (NAMES[opt] ?? opt)}
                  </button>
                ))}
              {row.color &&
                row.palette?.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    aria-pressed={a[row.color as keyof AvatarLayers] === c}
                    onClick={() => set({ [row.color as string]: c })}
                    className="h-9 w-9 rounded-full border-2 transition"
                    style={{
                      background: c,
                      borderColor: a[row.color as keyof AvatarLayers] === c ? "var(--amber)" : "#0006",
                      boxShadow:
                        a[row.color as keyof AvatarLayers] === c
                          ? "0 0 0 3px color-mix(in srgb, var(--amber) 33%, transparent)"
                          : "none",
                    }}
                  />
                ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );

  if (stacked)
    return (
      <div>
        {preview}
        {options}
      </div>
    );
  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      {preview}
      {options}
    </div>
  );
}
