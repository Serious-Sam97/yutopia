"use client";

import { useEffect, useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { useTr } from "@/lib/i18n";
import { type Prefs, setPrefs, usePrefs } from "@/lib/prefs";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

export function SettingsPanel() {
  const t = useTr();
  const w = useWorld();
  const p = usePrefs();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then(setDevices)
      .catch(() => {});
  }, []);

  const vol = (k: keyof Prefs["vol"], label: string) => (
    <label className="flex items-center gap-3">
      <span className="mono text-xs uppercase w-24" style={{ color: "var(--cream-dim)" }}>
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={p.vol[k]}
        onChange={(e) => setPrefs({ vol: { ...p.vol, [k]: Number(e.target.value) } })}
        className="flex-1 accent-[#ffa630]"
        aria-label={label}
      />
      <span className="lcd w-10 text-right">{Math.round(p.vol[k] * 10)}</span>
    </label>
  );

  const device = (kind: MediaDeviceKind, key: "micId" | "camId" | "speakerId", label: string) => {
    const list = devices.filter((d) => d.kind === kind);
    if (!list.length) return null;
    return (
      <label className="block">
        <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
          {label}
        </span>
        <select
          className="field mt-1"
          value={p[key]}
          onChange={(e) => {
            setPrefs({ [key]: e.target.value } as Partial<Prefs>);
            void w?.media.switchDevice(kind as "audioinput", e.target.value);
          }}
        >
          <option value="">Default</option>
          {list.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center justify-between gap-3 py-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="deck-btn"
        aria-pressed={value}
        style={{ height: 32, minWidth: 64 }}
      >
        <span className="led" />
        {value ? "ON" : "OFF"}
      </button>
    </label>
  );

  return (
    <Panel title={t("settings")}>
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--vfd)" }}>
            {t("mixer")}
          </h3>
          {vol("master", t("master"))}
          {vol("voices", t("voices"))}
          {vol("music", t("music"))}
          {vol("effects", t("effects"))}
        </section>
        <section className="space-y-2">
          <h3 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--vfd)" }}>
            {t("devices")}
          </h3>
          {device("audioinput", "micId", t("microphone"))}
          {device("videoinput", "camId", t("camera"))}
          {device("audiooutput", "speakerId", t("speakers"))}
          {toggle(t("spatialAudio"), p.spatial, (v) => setPrefs({ spatial: v }))}
          {toggle(t("noiseSuppression"), p.noiseSuppression, (v) => setPrefs({ noiseSuppression: v }))}
        </section>
        <section className="space-y-2">
          <h3 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--vfd)" }}>
            {t("quality")}
          </h3>
          <div className="flex gap-2">
            {(["high", "low"] as const).map((q) => (
              <button
                key={q}
                type="button"
                className="deck-btn flex-1"
                aria-pressed={p.quality === q}
                onClick={() => setPrefs({ quality: q })}
                style={{ height: 36 }}
              >
                {q === "high" ? t("qualityHigh") : t("qualityLow")}
              </button>
            ))}
          </div>
          {toggle(t("reducedMotion"), p.reducedMotion, (v) => setPrefs({ reducedMotion: v }))}
        </section>
        <section className="flex items-center justify-between">
          <span>{t("language")}</span>
          <LangSwitch />
        </section>
        <section>
          <h3 className="mono text-xs uppercase tracking-widest mb-1" style={{ color: "var(--vfd)" }}>
            {t("controls")}
          </h3>
          <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
            {t("controlsHelp")}
          </p>
        </section>
      </div>
    </Panel>
  );
}
