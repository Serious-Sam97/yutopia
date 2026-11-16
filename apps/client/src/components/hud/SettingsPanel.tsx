"use client";

import { useEffect, useState } from "react";
import { Credits } from "@/components/Credits";
import { LangSwitch } from "@/components/LangSwitch";
import { setToken, yutopia } from "@/lib/api";
import { applyGraphics as switchGraphics } from "@/lib/gfx-switch";
import { cleanGraphics, type Graphics, gfxTier, graphicsFor, isPreset } from "@/lib/graphics";
import { type Key, useLang, useTr } from "@/lib/i18n";
import { MAX_FPS, type Prefs, type Quality, type QualityPref, resolveQuality, setPrefs, usePrefs } from "@/lib/prefs";
import { VERSION } from "@/lib/version";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Icon, type IconName } from "./icons";
import { Panel } from "./Panel";

// Settings in pages (docs/plan/45-the-ui.md, phase 4): a rail on the left (on a
// phone, a row of tabs on top), and the page — its title, a line on what it's for,
// its rows in cards. Signing out at the rail's foot.
// (its own words live here, not in i18n.ts: this panel loads on demand, the page doesn't carry them)
const W = {
  setMe: ["Me & my look", "Eu e meu visual"],
  setMeSub: ["Who you are here, and the language you read it in.", "Quem você é aqui, e o idioma em que você lê."],
  setSound: ["Sound & voice", "Som e voz"],
  setSoundSub: ["How loud the world is, and how the others hear you.", "O volume do mundo, e como os outros te ouvem."],
  setCameraSub: ["What the others see of you.", "O que os outros veem de você."],
  setViewSub: [
    "How you see the world: from above, behind you, or in your head.",
    "Como você vê o mundo: de cima, atrás de você, ou pelos seus olhos.",
  ],
  setGraphicsSub: ["How it draws on this computer.", "Como ele desenha neste computador."],
  setControlsSub: ["Keys, pads and controllers.", "Teclas, pads e controles."],
  version: ["Version", "Versão"],
  setCredits: ["Credits", "Créditos"],
  setCreditsSub: [
    "The work of others in Yutopia, and its licences.",
    "O trabalho de outras pessoas no Yutopia, e suas licenças.",
  ],
} as const;
type Word = keyof typeof W;

type Page = "me" | "sound" | "camera" | "view" | "graphics" | "controls" | "credits";
const PAGES: { id: Page; label: Key | Word; sub: Word; icon: IconName }[] = [
  { id: "me", label: "setMe", sub: "setMeSub", icon: "people" },
  { id: "sound", label: "setSound", sub: "setSoundSub", icon: "mic" },
  { id: "camera", label: "camera", sub: "setCameraSub", icon: "cam" },
  { id: "view", label: "view", sub: "setViewSub", icon: "follow" },
  { id: "graphics", label: "quality", sub: "setGraphicsSub", icon: "screen" },
  { id: "controls", label: "controls", sub: "setControlsSub", icon: "gamepad" },
  // (plan 75: the works by others — their credits, the licences' terms)
  { id: "credits", label: "setCredits", sub: "setCreditsSub", icon: "heart" },
];

// a word of this panel's own, or the house's
function useWords() {
  const t = useTr();
  const pt = useLang() === "pt";
  return (k: Key | Word) => (k in W ? W[k as Word][pt ? 1 : 0] : t(k as Key));
}

export function SettingsPanel() {
  const t = useWords();
  const [page, setPage] = useState<Page>("me");
  const at = PAGES.find((p) => p.id === page) ?? PAGES[0];
  return (
    <Panel title={t("settings")} size="max-w-4xl h-[min(660px,90vh)]">
      <div className="flex flex-col sm:flex-row h-full min-h-0 gap-3 sm:gap-6">
        <div className="flex sm:flex-col gap-0.5 sm:w-52 shrink-0 overflow-x-auto sm:overflow-visible scroll-thin pb-1 sm:pb-0">
          <div className="flex sm:flex-col gap-0.5" role="tablist" aria-label={t("settings")}>
            {PAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === at.id}
                className="rail-item"
                onClick={() => setPage(p.id)}
              >
                <Icon name={p.icon} size={17} />
                {t(p.label)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rail-item sm:mt-auto"
            style={{ color: "var(--error)" }}
            onClick={async () => {
              await yutopia.logout();
              setToken(null);
              location.href = "/login";
            }}
          >
            <Icon name="leave" size={17} />
            {t("signOut")}
          </button>
        </div>
        <section className="flex-1 min-w-0 min-h-0 overflow-y-auto scroll-thin pr-1" role="tabpanel">
          <h3 className="title text-[26px]">{t(at.label)}</h3>
          <p className="text-[13.5px] mt-1.5" style={{ color: "var(--cream-dim)" }}>
            {t(at.sub)}
          </p>
          <div className="space-y-3 mt-4">
            {at.id === "me" && <MePage />}
            {at.id === "sound" && <SoundPage />}
            {at.id === "camera" && <CameraPage />}
            {at.id === "view" && <ViewPage />}
            {at.id === "graphics" && <GraphicsPage />}
            {at.id === "controls" && <ControlsPage />}
            {at.id === "credits" && <Credits />}
          </div>
        </section>
      </div>
    </Panel>
  );
}

// ── the rows ────────────────────────────────────────────────────────────────

const lab = "mono text-[11.5px] uppercase tracking-[.06em]";

function Card({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      {label && (
        <p className={`${lab} mb-2`} style={{ color: "var(--amber)" }}>
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5 [&+&]:border-t border-[color:var(--well-edge)]">
      <span>
        <span className="block text-[14.5px] font-semibold">{label}</span>
        {help && (
          <span className="block text-[12.5px] mt-0.5" style={{ color: "var(--cream-dim)" }}>
            {help}
          </span>
        )}
      </span>
      <button type="button" className="sw" aria-pressed={value} aria-label={label} onClick={() => onChange(!value)} />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  shown,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  shown: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid grid-cols-[110px_1fr_32px] items-center gap-4 h-[34px]">
      <span className="text-[14px]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider w-full"
        style={{ "--v": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        aria-label={label}
      />
      <span className="mono text-[13px] text-right" style={{ color: "var(--cream-dim)" }}>
        {shown}
      </span>
    </label>
  );
}

// a choice of a few, as keys (the lit one is picked)
function Choice<T extends string | number>({
  options,
  value,
  label,
  onPick,
  cols,
}: {
  options: readonly T[];
  value: T;
  label: (o: T) => string;
  onPick: (o: T) => void;
  cols: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          className="deck-btn"
          aria-pressed={value === o}
          onClick={() => onPick(o)}
          style={{ height: 40, fontSize: 12 }}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

// ── the pages ───────────────────────────────────────────────────────────────

function MePage() {
  const t = useWords();
  return (
    <>
      <Card>
        <button
          type="button"
          className="deck-btn w-full"
          onClick={() => hud.set({ panel: { kind: "avatar" } })}
          style={{ height: 42 }}
        >
          {t("editLook")}
        </button>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14.5px] font-semibold">{t("language")}</span>
          <LangSwitch />
        </div>
      </Card>
      <p className="mono text-xs pt-1" style={{ color: "var(--muted)" }} title={VERSION.commit}>
        {t("version")} {VERSION.version}
        {VERSION.commit && ` · ${VERSION.commit}`}
        {VERSION.date && ` · ${VERSION.date}`}
      </p>
    </>
  );
}

// The devices the browser lists (named once one's been allowed), and asking for them.
function useDevices() {
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
  return { devices, blocked, allow, named: devices.some((d) => d.kind === "audioinput" && d.label) };
}

// not named yet: the ask, on a typed slip, with the lamp's button
function Access({ blocked, allow }: { blocked: boolean; allow: () => Promise<void> }) {
  const t = useTr();
  return (
    <div className="faceplate flex flex-wrap sm:flex-nowrap items-center gap-3.5 px-4 py-3" data-devices-access>
      <Icon name="mic" size={20} />
      <p className="mono text-[13px] leading-snug flex-1 min-w-[60%]">
        {blocked ? t("devicesBlocked") : t("devicesHidden")}
      </p>
      {!blocked && (
        <button
          type="button"
          className="deck-btn shrink-0"
          aria-pressed
          style={{ height: 36 }}
          onClick={() => void allow()}
          data-devices-allow
        >
          {t("devicesAllow")}
        </button>
      )}
    </div>
  );
}

function Device({
  devices,
  kind,
  pref,
  label,
}: {
  devices: MediaDeviceInfo[];
  kind: MediaDeviceKind;
  pref: "micId" | "camId" | "speakerId";
  label: string;
}) {
  const w = useWorld();
  const p = usePrefs();
  // (not named yet, or none: "Default" still works)
  const list = devices.filter((d) => d.kind === kind);
  return (
    <label className="block py-1.5">
      <span className={lab} style={{ color: "var(--cream-dim)" }}>
        {label}
      </span>
      <select
        className="field mt-1"
        value={p[pref]}
        onChange={(e) => {
          setPrefs({ [pref]: e.target.value } as Partial<Prefs>);
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
}

function SoundPage() {
  const t = useTr();
  const p = usePrefs();
  const { devices, blocked, allow, named } = useDevices();
  const vol = (k: keyof Prefs["vol"], label: string) => (
    <Slider
      label={label}
      value={p.vol[k]}
      min={0}
      max={1}
      step={0.05}
      shown={String(Math.round(p.vol[k] * 10))}
      onChange={(v) => setPrefs({ vol: { ...p.vol, [k]: v } })}
    />
  );
  return (
    <>
      {!named && <Access blocked={blocked} allow={allow} />}
      <Card label={t("mixer")}>
        {vol("master", t("master"))}
        {vol("voices", t("voices"))}
        {vol("music", t("music"))}
        {vol("tv", t("tvVideo"))}
        {vol("effects", t("effects"))}
      </Card>
      <Card label={t("devices")}>
        <Device devices={devices} kind="audioinput" pref="micId" label={t("microphone")} />
        <Device devices={devices} kind="audiooutput" pref="speakerId" label={t("speakers")} />
      </Card>
      <Card>
        <Toggle label={t("spatialAudio")} value={p.spatial} onChange={(v) => setPrefs({ spatial: v })} />
        <Toggle
          label={t("noiseSuppression")}
          value={p.noiseSuppression}
          onChange={(v) => setPrefs({ noiseSuppression: v })}
        />
      </Card>
    </>
  );
}

function CameraPage() {
  const t = useTr();
  const { devices, blocked, allow, named } = useDevices();
  return (
    <>
      {!named && <Access blocked={blocked} allow={allow} />}
      <Card>
        <Device devices={devices} kind="videoinput" pref="camId" label={t("camera")} />
      </Card>
    </>
  );
}

function ViewPage() {
  const t = useTr();
  const p = usePrefs();
  return (
    <>
      <Card>
        <Choice
          options={["3p", "1p"] as const}
          value={p.view}
          cols={2}
          label={(v) => t(v === "3p" ? "view3p" : "view1p")}
          onPick={(v) => setPrefs({ view: v })}
        />
        <p className="text-[12.5px] leading-snug mt-2.5" style={{ color: "var(--cream-dim)" }}>
          {t("view1pHelp")}
        </p>
        {p.view === "3p" && (
          <div className="mt-2.5">
            <Choice
              options={["on", "gentle", "off"] as const}
              value={p.camFollow}
              cols={3}
              label={(c) => t(c === "on" ? "camFollowOn" : c === "gentle" ? "camFollowGentle" : "camFollowOff")}
              onPick={(c) => setPrefs({ camFollow: c })}
            />
          </div>
        )}
      </Card>
      <Card label={t("mouseLook")}>
        <Slider
          label={t("lookSpeed")}
          value={p.lookSens}
          min={0.25}
          max={3}
          step={0.05}
          shown={p.lookSens.toFixed(1)}
          onChange={(v) => setPrefs({ lookSens: v })}
        />
        <Slider
          label={t("stickSpeed")}
          value={p.stickSens}
          min={0.25}
          max={3}
          step={0.05}
          shown={p.stickSens.toFixed(1)}
          onChange={(v) => setPrefs({ stickSens: v })}
        />
        <Toggle label={t("lookInvertX")} value={p.lookInvertX} onChange={(v) => setPrefs({ lookInvertX: v })} />
        <Toggle label={t("lookInvert")} value={p.lookInvert} onChange={(v) => setPrefs({ lookInvert: v })} />
        {p.view === "1p" && (
          <Toggle label={t("hands1p")} value={p.hands1p} onChange={(v) => setPrefs({ hands1p: v })} />
        )}
      </Card>
    </>
  );
}

// The graphics (docs/plan/91-the-big-map.md phase 9): a preset — the tiers as they always drew — and each of its
// settings on its own; nothing's applied as it's picked (a change of these is a recompile, a rebuild: phase 10),
// an Apply once something's changed.
const QUALITIES = ["auto", "high", "medium", "low", "lowest", "potato"] as const;
function GraphicsPage() {
  const t = useTr();
  const p = usePrefs();
  // (what's picked, not applied yet)
  const [draft, setDraft] = useState<{ quality: QualityPref; over: Partial<Graphics> | null }>(() => ({
    quality: p.quality,
    over: cleanGraphics(p.graphics),
  }));
  const tierOf = (q: QualityPref): Quality => (q === "auto" ? (gfxTier() ?? resolveQuality("auto")) : q);
  const g = graphicsFor(tierOf(draft.quality), draft.over);
  const custom = !isPreset(tierOf(draft.quality), draft.over);
  const changed =
    draft.quality !== p.quality || JSON.stringify(draft.over) !== JSON.stringify(cleanGraphics(p.graphics));
  /** One setting set by hand: over the preset it's on (Auto's tier kept, as one picked by hand — Auto stops). */
  const set = <K extends keyof Graphics>(k: K, v: Graphics[K]) =>
    setDraft((d) => ({ quality: tierOf(d.quality), over: { ...(d.over ?? {}), [k]: v } }));
  // (the frame now, beside: a change seen to land)
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const f = (window as unknown as { __yutopia?: { tp?: { fps?: number } } }).__yutopia?.tp?.fps;
      setFps(Math.round(f ?? 0));
    }, 500);
    return () => clearInterval(id);
  }, []);
  const lvl = (o: string) => t(o === "off" ? "gOff" : o === "low" ? "gLow" : o === "medium" ? "gMedium" : "gHigh");
  const hint = (k: Key) => (
    <p className="text-[12px] leading-snug -mt-1 mb-1.5" style={{ color: "var(--cream-dim)" }}>
      {t(k)}
    </p>
  );
  const fin = g.finish;
  return (
    <>
      <Card label={t("gPreset")}>
        <Choice
          options={QUALITIES}
          value={custom ? ("" as never) : draft.quality}
          cols={2}
          label={(q) =>
            t(
              q === "auto"
                ? "qualityAuto"
                : q === "high"
                  ? "qualityHigh"
                  : q === "medium"
                    ? "qualityMedium"
                    : q === "low"
                      ? "qualityLow"
                      : q === "lowest"
                        ? "qualityLowest"
                        : "qualityPotato",
            )
          }
          onPick={(q) => setDraft({ quality: q, over: null })}
        />
        {custom && (
          <div className="flex items-center justify-between gap-3 mt-2.5">
            <span className="text-[13px]" style={{ color: "var(--amber)" }}>
              {t("gCustom")}
            </span>
            <button
              type="button"
              className="deck-btn"
              style={{ height: 32, fontSize: 12, padding: "0 10px" }}
              onClick={() => setDraft((d) => ({ ...d, over: null }))}
            >
              {t("gReset")}
            </button>
          </div>
        )}
      </Card>
      <Card label={`${t("gDisplay")} · ${t("gNow")} ${fps} fps`}>
        <Slider
          label={t("gRes")}
          value={g.res}
          min={25}
          max={200}
          step={5}
          shown={`${Math.round(g.res)}%`}
          onChange={(v) => set("res", v)}
        />
        {hint("gResHelp")}
        <Toggle label={t("gAa")} help={t("gAaHelp")} value={g.aa} onChange={(v) => set("aa", v)} />
        <p className={`${lab} mt-2 mb-1.5`} style={{ color: "var(--cream-dim)" }}>
          {t("maxFps")}
        </p>
        <Choice
          options={MAX_FPS}
          value={p.maxFps}
          cols={4}
          label={(f) => (f === 0 ? t("fpsUnlimited") : `${f} fps`)}
          onPick={(f) => setPrefs({ maxFps: f })}
        />
      </Card>
      <Card label={t("gDistance")}>
        <Slider
          label={t("gLand")}
          value={g.land}
          min={220}
          max={660}
          step={55}
          shown={`${g.land} m`}
          onChange={(v) => set("land", v)}
        />
        {hint("gLandHelp")}
        <Slider
          label={t("gDistricts")}
          value={g.districts}
          min={500}
          max={1200}
          step={100}
          shown={`${g.districts} m`}
          onChange={(v) => set("districts", v)}
        />
        {hint("gDistrictsHelp")}
        <p className={`${lab} mt-1 mb-1.5`} style={{ color: "var(--cream-dim)" }}>
          {t("gHorizon")}
        </p>
        <Choice
          options={["lowest", "low", "medium", "high"] as const}
          value={g.horizon}
          cols={4}
          label={(o) => t(o === "lowest" ? "gLow" : o === "low" ? "gMedium" : o === "medium" ? "gHigh" : "gUltra")}
          onPick={(o) => set("horizon", o)}
        />
        <p className={`${lab} mt-3 mb-1.5`} style={{ color: "var(--cream-dim)" }}>
          {t("gFarTrees")}
        </p>
        <Choice
          options={[0, 1200, 1800] as const}
          value={g.farTrees}
          cols={3}
          label={(o) => (o === 0 ? t("gOff") : `${(o / 1000).toFixed(1)} km`)}
          onPick={(o) => set("farTrees", o)}
        />
      </Card>
      <Card label={t("gLight")}>
        <p className={`${lab} mb-1.5`} style={{ color: "var(--cream-dim)" }}>
          {t("gShadows")}
        </p>
        <Choice
          options={[0, 1024, 2048, 4096] as const}
          value={g.shadows}
          cols={4}
          label={(o) => (o === 0 ? t("gOff") : o === 1024 ? t("gMedium") : o === 2048 ? t("gHigh") : t("gUltra"))}
          onPick={(o) => set("shadows", o)}
        />
        {hint("gShadowsHelp")}
        <Toggle label={t("gLightShadows")} value={g.lightShadows} onChange={(v) => set("lightShadows", v)} />
        <Slider
          label={t("gLamps")}
          value={g.lamps}
          min={0}
          max={10}
          step={1}
          shown={String(g.lamps)}
          onChange={(v) => set("lamps", v)}
        />
        {hint("gLampsHelp")}
      </Card>
      <Card label={t("gEffects")}>
        <Toggle label={t("gFinish")} help={t("gFinishHelp")} value={fin} onChange={(v) => set("finish", v)} />
        {fin && (
          <>
            <Toggle label={t("gAo")} value={g.ao} onChange={(v) => set("ao", v)} />
            <Toggle label={t("gBloom")} value={g.bloom} onChange={(v) => set("bloom", v)} />
            <Toggle label={t("gGrain")} value={g.grain} onChange={(v) => set("grain", v)} />
          </>
        )}
      </Card>
      <Card label={t("gWorld")}>
        <Toggle label={t("gFogBanks")} value={g.fogBanks} onChange={(v) => set("fogBanks", v)} />
        <p className={`${lab} mt-2 mb-1.5`} style={{ color: "var(--cream-dim)" }}>
          {t("gWeather")}
        </p>
        <Choice
          options={["low", "medium", "high"] as const}
          value={g.weather}
          cols={3}
          label={lvl}
          onPick={(o) => set("weather", o)}
        />
        <p className={`${lab} mt-3 mb-1.5`} style={{ color: "var(--cream-dim)" }}>
          {t("gMirror")}
        </p>
        <Choice
          options={["off", "low", "high"] as const}
          value={g.mirror}
          cols={3}
          label={lvl}
          onPick={(o) => set("mirror", o)}
        />
        <p className={`${lab} mt-3 mb-1.5`} style={{ color: "var(--cream-dim)" }}>
          {t("gPeople")}
        </p>
        <Choice
          options={["low", "high"] as const}
          value={g.people}
          cols={2}
          label={lvl}
          onPick={(o) => set("people", o)}
        />
      </Card>
      <Card>
        <Toggle label={t("reducedMotion")} value={p.reducedMotion} onChange={(v) => setPrefs({ reducedMotion: v })} />
        <Toggle label={t("perfStats")} value={p.perfStats} onChange={(v) => setPrefs({ perfStats: v })} />
      </Card>
      {changed && (
        // (its own bar at the foot of the page, over nothing: the settings under it scroll up past it)
        <div
          className="sticky bottom-0 z-10 flex items-center justify-end gap-3 py-2.5 px-1 -mx-1"
          style={{ background: "var(--panel)", borderTop: "1px solid var(--well-edge)" }}
        >
          <button
            type="button"
            className="deck-btn"
            style={{ height: 38, fontSize: 12, padding: "0 14px" }}
            onClick={() => setDraft({ quality: p.quality, over: cleanGraphics(p.graphics) })}
          >
            {t("gCancel")}
          </button>
          <button
            type="button"
            className="deck-btn"
            aria-pressed
            style={{ height: 38, fontSize: 13, padding: "0 18px" }}
            onClick={() => applyGraphics(draft.quality, draft.over)}
          >
            {t("gApply")}
          </button>
        </div>
      )}
    </>
  );
}

/** The graphics picked, applied: the panel closed so the change is seen to land (behind a photograph of the frame,
 *  then "Keep these settings?": lib/gfx-switch.ts). */
function applyGraphics(quality: QualityPref, over: Partial<Graphics> | null) {
  hud.set({ panel: { kind: null } });
  void switchGraphics({ quality, over });
}

function ControlsPage() {
  const t = useTr();
  return (
    <>
      <Card>
        <button
          type="button"
          className="deck-btn w-full gap-2"
          onClick={() => hud.set({ panel: { kind: "pads" } })}
          style={{ height: 42 }}
        >
          <Icon name="gamepad" size={18} />
          {t("controllers")}
        </button>
      </Card>
      <Card>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          {t("controlsHelp")}
        </p>
      </Card>
    </>
  );
}
