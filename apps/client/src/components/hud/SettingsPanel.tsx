"use client";

import { useEffect, useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { useTr } from "@/lib/i18n";
import { MAX_FPS, type Prefs, setPrefs, usePrefs } from "@/lib/prefs";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

export function SettingsPanel() {
  const t = useTr();
  const w = useWorld();
  const p = usePrefs();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // (browsers only name the devices once one is in use: list again when the mic
  // or camera comes on, and when something is plugged in or out)
  const live = useHud((s) => s.media.mic || s.media.cam);
  const [relist, setRelist] = useState(0);
  // the browser won't name them: not allowed yet (it can ask), or blocked (it won't)
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const list = () =>
      md
        .enumerateDevices()
        .then((all) => setDevices(all.filter((d) => d.deviceId)))
        .catch(() => {});
    void live;
    void relist;
    list();
    md.addEventListener("devicechange", list);
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => setBlocked(s.state === "denied"))
      .catch(() => {});
    return () => md.removeEventListener("devicechange", list);
  }, [live, relist]);

  const named = devices.some((d) => d.kind === "audioinput" && d.label);
  // ask the browser (its prompt), let go at once: from then on it names the devices
  const allow = async () => {
    const md = navigator.mediaDevices;
    if (!md) return;
    for (const want of [{ audio: true, video: true }, { audio: true }]) {
      try {
        const s = await md.getUserMedia(want);
        for (const tr of s.getTracks()) tr.stop();
        setBlocked(false);
        setRelist((n) => n + 1);
        return;
      } catch (e) {
        if ((e as Error).name === "NotAllowedError") {
          setBlocked(true);
          return;
        }
        // (no camera here: try the mic alone)
      }
    }
  };

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
    // (not named yet, or none: "Default" still works)
    const list = devices.filter((d) => d.kind === kind);
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
          {list.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
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
        <button type="button" className="deck-btn w-full" onClick={() => hud.set({ panel: { kind: "avatar" } })}>
          {t("editLook")}
        </button>
        <section className="space-y-2">
          <h3 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--vfd)" }}>
            {t("mixer")}
          </h3>
          {vol("master", t("master"))}
          {vol("voices", t("voices"))}
          {vol("music", t("music"))}
          {vol("tv", t("tvVideo"))}
          {vol("effects", t("effects"))}
        </section>
        <section className="space-y-2">
          <h3 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--vfd)" }}>
            {t("devices")}
          </h3>
          {!named && (
            <div className="mono text-xs space-y-2" style={{ color: "var(--cream-dim)" }} data-devices-access>
              <p>{blocked ? t("devicesBlocked") : t("devicesHidden")}</p>
              {!blocked && (
                <button type="button" className="btn" onClick={() => void allow()} data-devices-allow>
                  {t("devicesAllow")}
                </button>
              )}
            </div>
          )}
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
          <div className="grid grid-cols-2 gap-2">
            {(["auto", "high", "medium", "low"] as const).map((q) => (
              <button
                key={q}
                type="button"
                className="deck-btn"
                aria-pressed={p.quality === q}
                onClick={() => setPrefs({ quality: q })}
                style={{ height: 40, fontSize: 10 }}
              >
                {t(
                  q === "auto"
                    ? "qualityAuto"
                    : q === "high"
                      ? "qualityHigh"
                      : q === "medium"
                        ? "qualityMedium"
                        : "qualityLow",
                )}
              </button>
            ))}
          </div>
          {toggle(t("reducedMotion"), p.reducedMotion, (v) => setPrefs({ reducedMotion: v }))}
          <div className="mono text-[10px] uppercase tracking-widest pt-1" style={{ color: "var(--muted)" }}>
            {t("maxFps")}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MAX_FPS.map((f) => (
              <button
                key={f}
                type="button"
                className="deck-btn"
                aria-pressed={p.maxFps === f}
                onClick={() => setPrefs({ maxFps: f })}
                style={{ height: 32, fontSize: 10 }}
              >
                {f === 0 ? t("fpsUnlimited") : `${f} fps`}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
            {t("maxFpsHelp")}
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--vfd)" }}>
            {t("view")}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {(["iso", "3p", "1p"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="deck-btn"
                aria-pressed={p.view === v}
                onClick={() => setPrefs(v === "iso" ? { view: v } : { view: v, last3d: v })}
                style={{ height: 40, fontSize: 10 }}
              >
                {t(v === "iso" ? "viewIso" : v === "3p" ? "view3p" : "view1p")}
              </button>
            ))}
          </div>
          {p.view !== "iso" && (
            <p className="text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
              {t("view1pHelp")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {p.view === "3p" &&
              (["chase", "free"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="deck-btn"
                  aria-pressed={p.cam3p === c}
                  onClick={() => setPrefs({ cam3p: c })}
                  style={{ height: 40, fontSize: 10 }}
                >
                  {t(c === "chase" ? "cam3pChase" : "cam3pFree")}
                </button>
              ))}
          </div>
          {p.view !== "iso" && (
            <div className="space-y-2 pt-1">
              <div className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
                {t("mouseLook")}
              </div>
              <label className="flex items-center gap-3">
                <span className="mono text-xs uppercase w-24" style={{ color: "var(--cream-dim)" }}>
                  {t("lookSpeed")}
                </span>
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={p.lookSens}
                  onChange={(e) => setPrefs({ lookSens: Number(e.target.value) })}
                  className="flex-1 accent-[#ffa630]"
                  aria-label={t("lookSpeed")}
                />
                <span className="lcd w-10 text-right">{p.lookSens.toFixed(1)}</span>
              </label>
              {toggle(t("lookInvert"), p.lookInvert, (v) => setPrefs({ lookInvert: v }))}
              {p.view === "1p" && toggle(t("hands1p"), p.hands1p, (v) => setPrefs({ hands1p: v }))}
            </div>
          )}
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
