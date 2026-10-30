"use client";

import { EMOTES } from "@yutopia/shared";
import { useTr } from "@/lib/i18n";
import { emoteUrl } from "@/world/art/emotes";
import { hud } from "@/world/store";
import { useWorld } from "./ctx";
import { useWheel } from "./useWheel";

// The emotes on a wheel (docs/plan/56-the-controls.md phase 6): held open by X (a pad's d-pad ←),
// round the middle of the screen; chosen by pointing — the arrows, WASD, a stick, the pointer —
// and done on letting go. A click on one does it too.
const R = 150;

export function EmoteWheel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const close = () => hud.set({ panel: { kind: null } });
  const done = (i: number | null) => {
    close();
    if (i !== null) w?.emote(i);
  };
  // (opened on the pad: the d-pad's ← holds it — input/bindings.ts KH_PAD.emotes)
  const { hot, setHot } = useWheel(EMOTES.length, {
    keyCode: "KeyX",
    padButton: objectId === "pad" ? 14 : undefined,
    done,
    cancel: close,
  });
  return (
    <div className="fixed inset-0 z-40" data-emote-wheel>
      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "50%",
          width: R * 2 + 120,
          height: R * 2 + 120,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(rgba(20,14,10,.55), rgba(20,14,10,.15) 70%, transparent)",
        }}
      />
      <div
        className="cabinet absolute rounded-full grid place-items-center text-center"
        style={{ left: "50%", top: "50%", width: 92, height: 92, transform: "translate(-50%, -50%)" }}
      >
        <div className="title text-[15px]">{t("emote")}</div>
      </div>
      {EMOTES.map((e, i) => {
        const a = (i / EMOTES.length) * Math.PI * 2;
        const on = hot === i;
        return (
          <button
            key={e}
            type="button"
            data-wheel={e}
            aria-label={e}
            className={`cabinet rounded-full absolute grid place-items-center ${on ? "primary" : ""}`}
            style={{
              left: `calc(50% + ${Math.sin(a) * R}px)`,
              top: `calc(50% + ${-Math.cos(a) * R}px)`,
              width: 64,
              height: 64,
              transform: `translate(-50%, -50%) scale(${on ? 1.15 : 1})`,
              boxShadow: on
                ? "0 0 0 2px var(--amber), 0 0 18px color-mix(in srgb, var(--amber) 45%, transparent)"
                : undefined,
            }}
            onPointerEnter={() => setHot(i)}
            onClick={() => done(i)}
          >
            {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
            <img alt="" src={emoteUrl(e)} className="w-11 h-11" draggable={false} />
          </button>
        );
      })}
    </div>
  );
}
