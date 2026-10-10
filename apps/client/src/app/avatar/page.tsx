"use client";

import {
  AVATAR_OPTIONS,
  type AvatarLayers,
  avatarFromSeed,
  CLOTH_COLORS,
  DEFAULT_AVATAR,
  HAIR_COLORS,
  SKIN_TONES,
} from "@yutopia/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { Brand } from "@/components/Brand";
import { getToken, yutopia } from "@/lib/api";
import { type Key, useTr } from "@/lib/i18n";

type ShapeKey = keyof typeof AVATAR_OPTIONS;
const ROWS: { shape?: ShapeKey; color?: keyof AvatarLayers; palette?: string[]; label: Key }[] = [
  { shape: "body", label: "body" },
  { color: "skin", palette: SKIN_TONES, label: "skin" },
  { shape: "hair", label: "hair" },
  { color: "hairColor", palette: HAIR_COLORS, label: "hairColor" },
  { shape: "top", label: "top" },
  { color: "topColor", palette: CLOTH_COLORS, label: "topColor" },
  { shape: "bottom", label: "bottom" },
  { color: "bottomColor", palette: CLOTH_COLORS, label: "bottomColor" },
  { shape: "accessory", label: "accessory" },
  { color: "accessoryColor", palette: CLOTH_COLORS, label: "accessoryColor" },
];

export default function AvatarEditor() {
  const t = useTr();
  const router = useRouter();
  const [a, setA] = useState<AvatarLayers>(DEFAULT_AVATAR);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [walk, setWalk] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login?next=/avatar");
    else
      yutopia
        .spaces()
        .then((r) => setA(r.avatar))
        .catch(() => {});
  }, [router]);

  const set = (patch: Partial<AvatarLayers>) => {
    setA((x) => ({ ...x, ...patch }));
    setState("idle");
  };

  async function save() {
    setState("saving");
    try {
      await yutopia.saveAvatar(a);
      setState("saved");
      setTimeout(() => router.back(), 500);
    } catch {
      setState("idle");
    }
  }

  return (
    <main className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <header className="flex items-center justify-between mb-6">
          <Brand small />
          <Link href="/" className="ghost-btn">
            ← {t("back")}
          </Link>
        </header>
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="cabinet p-4 h-max md:sticky md:top-6">
            <div className="vfd-window flex justify-center">
              <AvatarCanvas avatar={a} size={240} walk={walk} />
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" className="deck-btn flex-1" aria-pressed={walk} onClick={() => setWalk((w) => !w)}>
                <span className="led" />▶ Walk
              </button>
              <button
                type="button"
                className="deck-btn flex-1"
                onClick={() => set(avatarFromSeed(Math.floor(Math.random() * 1e6)))}
              >
                ⟳ {t("randomize")}
              </button>
            </div>
            <button type="button" className="deck-btn w-full mt-3" onClick={save} disabled={state === "saving"}>
              {state === "saved" ? `✓ ${t("saved")}` : t("save")}
            </button>
          </div>
          <div className="cabinet p-4 space-y-4">
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
                        {opt}
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
        </div>
      </div>
    </main>
  );
}
