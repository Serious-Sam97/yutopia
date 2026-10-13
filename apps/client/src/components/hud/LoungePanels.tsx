"use client";

import { type RadioState, radioOf } from "@yutopia/shared/media";
import { useState } from "react";
import { useLang, useTr } from "@/lib/i18n";
import { STATIONS } from "@/world/sound";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { MediaRemote, PlaylistChips } from "./MediaPanel";
import { Panel } from "./Panel";

// A radio or record player: its own lo-fi station or YouTube queue (the
// others in the space play theirs).
export function RadioPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  useHud((s) => s.objectsVersion);
  const pt = useLang() === "pt";
  const r = radioOf(w?.engine?.getObject(objectId));
  const [tab, setTab] = useState<"lofi" | "yt">(r.source);
  return (
    <Panel title={t("radio")}>
      <div className="flex gap-2 mb-3">
        {(["lofi", "yt"] as const).map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {k === "lofi" ? (pt ? "Lo-fi (estações)" : "Lo-fi stations") : "YouTube"}
            {r.playing && r.source === k ? " ●" : ""}
          </button>
        ))}
      </div>
      {tab === "yt" ? <MediaRemote id={objectId} /> : <LofiStations objectId={objectId} r={r} />}
    </Panel>
  );
}

function LofiStations({ objectId, r }: { objectId: string; r: RadioState }) {
  const t = useTr();
  const w = useWorld();
  const pt = useLang() === "pt";
  const lofi = r.playing && r.source === "lofi";
  const st = STATIONS[r.station % STATIONS.length];
  return (
    <>
      <div className="vfd-window p-4 text-center">
        <p className="lcd text-3xl">{lofi ? st.name : "— OFF AIR —"}</p>
        <p className="mono text-xs mt-1" style={{ color: "var(--cream-dim)" }}>
          {lofi ? `${st.bpm} BPM · ${r.by}` : t("radioStation")}
        </p>
        {lofi && (
          <div className="flex justify-center gap-1 mt-3" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
                key={i}
                className="w-2 rounded-sm"
                style={{ height: 6 + ((i * 7) % 18), background: i > 9 ? "var(--rust)" : "var(--vfd)", opacity: 0.85 }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {STATIONS.map((s, i) => (
          <button
            key={s.name}
            type="button"
            className="deck-btn"
            aria-pressed={lofi && r.station === i}
            style={{ height: 52, fontSize: 10 }}
            onClick={() => w?.send("radio:set", { id: objectId, playing: true, station: i })}
          >
            <span className="led" />
            {s.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="deck-btn danger w-full mt-3"
        aria-pressed={false}
        onClick={() => w?.send("radio:set", { id: objectId, playing: false })}
        disabled={!lofi}
      >
        ■ {t("radioStop")}
      </button>
      <PlaylistChips id={objectId} />
      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        {pt
          ? `Quem está perto deste rádio ouve a mesma estação, sincronizada; os outros rádios tocam a deles. Volume: ⚙ → ${t("music")}.`
          : `Everyone near this radio hears the same station, in sync; other radios play their own. Volume: ⚙ → ${t("music")}.`}
      </p>
    </>
  );
}

export function NoticePanel() {
  const t = useTr();
  const name = useHud((s) => s.spaceName);
  const people = useHud((s) => s.people.filter((p) => !p.bot));
  const me = useHud((s) => s.me);
  const status = useHud((s) => s.status);
  const boards = useHud((s) => s.boards);
  const all = me ? [me, ...people] : people;
  const blocked = Object.values(status)
    .flat()
    .filter((c) => c.blocked);
  return (
    <Panel title={t("notice")}>
      <div className="faceplate p-4 space-y-4" style={{ background: "linear-gradient(180deg,#d9b98c,#c49a6c)" }}>
        <section className="rounded-md p-3 shadow" style={{ background: "var(--paper)", transform: "rotate(-0.6deg)" }}>
          <h3 className="font-bold">
            {t("welcome")} {name}
          </h3>
          <p className="text-sm">
            {all.length} {t("online")}: {all.map((p) => p.name).join(", ")}
          </p>
        </section>
        <section className="rounded-md p-3 shadow" style={{ background: "#f3d27a", transform: "rotate(0.8deg)" }}>
          <h3 className="font-bold">Boards</h3>
          <ul className="text-sm">
            {boards.map((b) => (
              <li key={b.id}>
                ▸ {b.name}: {b.sections.map((s) => `${s.name} ${s.count}`).join(" · ")}
              </li>
            ))}
          </ul>
        </section>
        {blocked.length > 0 && (
          <section className="rounded-md p-3 shadow" style={{ background: "#f1b9a0", transform: "rotate(-0.4deg)" }}>
            <h3 className="font-bold">⚠ Jammed</h3>
            <ul className="text-sm">
              {blocked.map((c) => (
                <li key={c.id}>
                  {c.ticket} {c.name}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          className="rounded-md p-3 shadow text-sm"
          style={{ background: "var(--paper)", transform: "rotate(0.3deg)" }}
        >
          <h3 className="font-bold">{t("controls")}</h3>
          <p>{t("controlsHelp")}</p>
        </section>
      </div>
    </Panel>
  );
}
