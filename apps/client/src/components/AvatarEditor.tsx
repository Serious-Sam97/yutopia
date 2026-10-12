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
import { type Key, useTr } from "@/lib/i18n";

type ShapeKey = keyof typeof AVATAR_OPTIONS;
// shoes: cream, black, walnut, rust, olive, slate; frames: dark, tortoise, gold, rust, slate
// options whose slug isn't how you'd say it
const NAMES: Record<string, string> = { longskirt: "long skirt", hightops: "high-tops" };
const SHOE_COLORS = ["#efe4cc", "#2a2420", "#5b3a26", "#b5562f", "#6e7b3a", "#3d4a5c"];
const FRAME_COLORS = ["#2a2420", "#5b3a26", "#c39a4a", "#b5562f", "#3d4a5c"];
const ROWS: { shape?: ShapeKey; color?: keyof AvatarLayers; palette?: string[]; label: Key }[] = [
  { shape: "style", label: "style" },
  { shape: "gender", label: "gender" },
  { shape: "body", label: "body" },
  { color: "skin", palette: SKIN_TONES, label: "skin" },
  { shape: "hair", label: "hair" },
  { color: "hairColor", palette: HAIR_COLORS, label: "hairColor" },
  { shape: "top", label: "top" },
  { color: "topColor", palette: CLOTH_COLORS, label: "topColor" },
  { shape: "bottom", label: "bottom" },
  { color: "bottomColor", palette: CLOTH_COLORS, label: "bottomColor" },
  { shape: "shoes", label: "shoes" },
  { color: "shoesColor", palette: SHOE_COLORS, label: "shoesColor" },
  { shape: "accessory", label: "accessory" },
  { color: "accessoryColor", palette: CLOTH_COLORS, label: "accessoryColor" },
  { shape: "eyewear", label: "eyewear" },
  { color: "eyewearColor", palette: FRAME_COLORS, label: "eyewearColor" },
  { shape: "extra", label: "extra" },
  { color: "extraColor", palette: CLOTH_COLORS, label: "extraColor" },
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
      <div className="vfd-window flex justify-center shrink-0">
        <AvatarCanvas avatar={a} size={stacked ? 150 : 240} walk={walk} />
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
          className={`deck-btn w-full ${stacked ? "" : "mt-3"}`}
          onClick={save}
          disabled={state === "saving"}
        >
          {state === "saved" ? `✓ ${t("saved")}` : t("save")}
        </button>
        {state === "failed" && (
          <p role="alert" className="mono text-xs mt-2" style={{ color: "#ff8a66" }}>
            {t("lookNotSaved")}
          </p>
        )}
      </div>
    </div>
  );

  const options = (
    <div className={stacked ? "space-y-4 mt-4" : "cabinet p-4 space-y-4"}>
      {ROWS.map((row) => (
        <fieldset key={row.label}>
          <legend className="mono text-xs uppercase tracking-widest mb-2" style={{ color: "var(--cream-dim)" }}>
            {t(row.label)}
          </legend>
          <div className="flex flex-wrap gap-2">
            {row.shape &&
              AVATAR_OPTIONS[row.shape].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={a[row.shape as ShapeKey] === opt}
                  onClick={() => set({ [row.shape as string]: opt })}
                  className="deck-btn"
                  style={{ height: 36, fontSize: 11 }}
                >
                  {row.shape === "style" || row.shape === "gender"
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
                    boxShadow: a[row.color as keyof AvatarLayers] === c ? "0 0 0 3px #ffa63055" : "none",
                  }}
                />
              ))}
          </div>
        </fieldset>
      ))}
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
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      {preview}
      {options}
    </div>
  );
}
