"use client";

import { useEffect, useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { setToken, yutopia } from "@/lib/api";
import { type Key, useLang, useTr } from "@/lib/i18n";
import { MAX_FPS, type Prefs, setPrefs, usePrefs } from "@/lib/prefs";
import { VERSION } from "@/lib/version";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Invites } from "./Invites";
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
  setTeam: ["Team", "Equipe"],
  setTeamSub: ["Invites, and how it runs for everyone.", "Convites, e como está rodando para todos."],
  version: ["Version", "Versão"],
} as const;
type Word = keyof typeof W;

type Page = "me" | "sound" | "camera" | "view" | "graphics" | "controls" | "team";
const PAGES: { id: Page; label: Key | Word; sub: Word; icon: IconName; admin?: boolean }[] = [
  { id: "me", label: "setMe", sub: "setMeSub", icon: "people" },
  { id: "sound", label: "setSound", sub: "setSoundSub", icon: "mic" },
  { id: "camera", label: "camera", sub: "setCameraSub", icon: "cam" },
  { id: "view", label: "view", sub: "setViewSub", icon: "follow" },
  { id: "graphics", label: "quality", sub: "setGraphicsSub", icon: "screen" },
  { id: "controls", label: "controls", sub: "setControlsSub", icon: "gamepad" },
  { id: "team", label: "setTeam", sub: "setTeamSub", icon: "key", admin: true },
];

// a word of this panel's own, or the house's
function useWords() {
  const t = useTr();
  const pt = useLang() === "pt";
  return (k: Key | Word) => (k in W ? W[k as Word][pt ? 1 : 0] : t(k as Key));
}

export function SettingsPanel() {
  const t = useWords();
  const isAdmin = useHud((s) => s.isAdmin);
  const [page, setPage] = useState<Page>("me");
  const pages = PAGES.filter((p) => !p.admin || isAdmin);
  const at = pages.find((p) => p.id === page) ?? pages[0];
  return (
    <Panel title={t("settings")} size="max-w-4xl h-[min(660px,90vh)]">
      <div className="flex flex-col sm:flex-row h-full min-h-0 gap-3 sm:gap-6">
        <div className="flex sm:flex-col gap-0.5 sm:w-52 shrink-0 overflow-x-auto sm:overflow-visible scroll-thin pb-1 sm:pb-0">
          <div className="flex sm:flex-col gap-0.5" role="tablist" aria-label={t("settings")}>
            {pages.map((p) => (
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
            {at.id === "team" && <TeamPage />}
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
          options={["iso", "3p", "1p"] as const}
          value={p.view}
          cols={3}
          label={(v) => t(v === "iso" ? "viewIso" : v === "3p" ? "view3p" : "view1p")}
          onPick={(v) => setPrefs(v === "iso" ? { view: v } : { view: v, last3d: v })}
        />
        {p.view !== "iso" && (
          <p className="text-[12.5px] leading-snug mt-2.5" style={{ color: "var(--cream-dim)" }}>
            {t("view1pHelp")}
          </p>
        )}
        {p.view === "3p" && (
          <div className="mt-2.5">
            <Choice
              options={["chase", "free"] as const}
              value={p.cam3p}
              cols={2}
              label={(c) => t(c === "chase" ? "cam3pChase" : "cam3pFree")}
              onPick={(c) => setPrefs({ cam3p: c })}
            />
          </div>
        )}
      </Card>
      {p.view !== "iso" && (
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
          <Toggle label={t("lookInvert")} value={p.lookInvert} onChange={(v) => setPrefs({ lookInvert: v })} />
          {p.view === "1p" && (
            <Toggle label={t("hands1p")} value={p.hands1p} onChange={(v) => setPrefs({ hands1p: v })} />
          )}
        </Card>
      )}
    </>
  );
}

function GraphicsPage() {
  const t = useTr();
  const p = usePrefs();
  return (
    <>
      <Card>
        <Choice
          options={["auto", "high", "medium", "low"] as const}
          value={p.quality}
          cols={2}
          label={(q) =>
            t(
              q === "auto"
                ? "qualityAuto"
                : q === "high"
                  ? "qualityHigh"
                  : q === "medium"
                    ? "qualityMedium"
                    : "qualityLow",
            )
          }
          onPick={(q) => setPrefs({ quality: q })}
        />
      </Card>
      <Card label={t("maxFps")}>
        <Choice
          options={MAX_FPS}
          value={p.maxFps}
          cols={4}
          label={(f) => (f === 0 ? t("fpsUnlimited") : `${f} fps`)}
          onPick={(f) => setPrefs({ maxFps: f })}
        />
        <p className="text-[12.5px] leading-snug mt-2.5" style={{ color: "var(--cream-dim)" }}>
          {t("maxFpsHelp")}
        </p>
      </Card>
      <Card>
        <Toggle label={t("reducedMotion")} value={p.reducedMotion} onChange={(v) => setPrefs({ reducedMotion: v })} />
        <Toggle label={t("perfStats")} value={p.perfStats} onChange={(v) => setPrefs({ perfStats: v })} />
      </Card>
    </>
  );
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

function TeamPage() {
  const lang = useLang();
  return (
    <>
      <Card>
        <Invites />
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14.5px]">
            {lang === "pt" ? "Como está rodando para todos" : "How it runs for everyone"}
          </span>
          <a href="/admin/perf" target="_blank" rel="noopener" className="ghost-btn">
            {lang === "pt" ? "Desempenho" : "Performance"}
          </a>
        </div>
      </Card>
    </>
  );
}
