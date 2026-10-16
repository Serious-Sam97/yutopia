"use client";

import { CASE_IDS, CASES, RINGTONES, type Ringtone, TEXT_TONES, WALLPAPERS } from "@yutopia/shared/phone";
import { useEffect, useRef, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { previewRing, textTone } from "@/world/phone/sounds";
import { top, usePhone } from "@/world/phone/store";
import { useHud } from "@/world/store";
import { useWorld } from "../../ctx";
import s from "../phone.module.css";
import { cx, Head, Ic, type IconName, PFace, Toggle, Wallpaper } from "../ui";

// Settings (wallpaper, sounds, the case, theme, text size, vibrate, sleep
// mode = Do-not-disturb, about), the Vortex Store (a shell for now: the
// built-ins, and what's coming) and Maps (GPS later).

export function Settings() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const st = usePhone((p) => p.settings);
  const me = usePhone((p) => p.me);
  const dnd = useHud((h) => h.me?.status === "dnd");
  if (!ph) return null;
  const row = (icon: IconName, bg: string, label: string, right: React.ReactNode, onClick: () => void) => (
    <button type="button" className={s.srow} data-nav onClick={onClick}>
      <span className={s.si} style={{ background: bg }}>
        <Ic n={icon} />
      </span>
      {label}
      {right}
    </button>
  );
  const chev = (v: string) => (
    <span className={s.sv}>
      {v}
      <Ic n="chev" size={14} />
    </span>
  );
  return (
    <>
      <Wallpaper id={st.wallpaper} dim />
      <div className={s.content}>
        <Head title={t("app_settings")} ph={ph} />
        <div className={s.scroll}>
          <div
            className={s.glass}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, marginBottom: 10 }}
          >
            <PFace avatar={me.avatar} name={me.name} size={42} />
            <div>
              <div className={s.nm}>{me.name}</div>
              <div className={s.sub}>
                {t(`case_${st.case}` as Key)} ·{" "}
                {t(`wp_${st.wallpaper.startsWith("photo:") ? "portal" : st.wallpaper}` as Key)} ·{" "}
                {t(`tone_${st.ringtone}` as Key)}
              </div>
            </div>
          </div>
          <div className={cx(s.glass, s.idCard)} data-my-id={me.uid}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={s.sec} style={{ margin: 0 }}>
                {t("phYourId")}
              </div>
              <div className={cx(s.idNum, s.holoText)}>{me.uid}</div>
              <div className={s.sub} style={{ whiteSpace: "normal", fontSize: 11 }}>
                {t("phYourIdHint")}
              </div>
            </div>
            <button
              type="button"
              className={s.get}
              data-nav
              onClick={() => {
                void navigator.clipboard?.writeText(String(me.uid)).catch(() => {});
                ph.note(t("phCopied"), 1400);
              }}
            >
              {t("phCopy")}
            </button>
          </div>
          <div className={cx(s.list, s.glass)}>
            {row("wall", "linear-gradient(150deg,#ff7ac8,#a23cf0)", t("phWallpaper"), chev(""), () =>
              ph.go({ app: "settings", view: "wallpaper" }),
            )}
            {row(
              "music",
              "linear-gradient(150deg,#41f3d9,#00766e)",
              t("phSounds"),
              chev(t(`tone_${st.ringtone}` as Key)),
              () => ph.go({ app: "settings", view: "sounds" }),
            )}
            {row(
              "palette",
              `linear-gradient(150deg,${CASES[st.case][1]},${CASES[st.case][2]})`,
              t("phCase"),
              <span className={s.sv}>
                <span className={s.sw} style={{ background: CASES[st.case][0] }} />
                <Ic n="chev" size={14} />
              </span>,
              () => ph.go({ app: "settings", view: "case" }),
            )}
            {row("text", "#2c2840", t("phTheme"), chev(t(st.theme === "light" ? "phLight" : "phDark")), () =>
              ph.setSettings({ theme: st.theme === "light" ? "dark" : "light" }),
            )}
            {row(
              "text",
              "#2c2840",
              t("phTextSize"),
              chev(t(st.textSize === "small" ? "phSmall" : st.textSize === "large" ? "phLarge" : "phNormal")),
              () =>
                ph.setSettings({
                  textSize: st.textSize === "small" ? "normal" : st.textSize === "normal" ? "large" : "small",
                }),
            )}
            {row("vibrate", "#2c2840", t("phVibrate"), <Toggle on={st.vibrate} />, () =>
              ph.setSettings({ vibrate: !st.vibrate }),
            )}
            {row("moon", "linear-gradient(150deg,#5a4bd8,#241a6a)", t("phSleep"), <Toggle on={dnd} />, () =>
              w?.setStatus(dnd ? "online" : "dnd"),
            )}
            {row("info", "#2c2840", t("phAbout"), chev(""), () => ph.go({ app: "settings", view: "about" }))}
          </div>
          <p className={s.sub} style={{ whiteSpace: "normal", fontSize: 11, margin: "8px 6px", lineHeight: 1.4 }}>
            {t("phSleepHint")}
          </p>
        </div>
      </div>
    </>
  );
}

export function Wallpapers() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const st = usePhone((p) => p.settings);
  const photos = usePhone((p) => p.photos.filter((x) => x.id > 0 && x.kind !== "video").slice(0, 8));
  const [lock, setLock] = useState(false);
  useEffect(() => {
    void ph?.loadPhotos();
  }, [ph]);
  if (!ph) return null;
  const cur = lock ? st.lockWallpaper : st.wallpaper;
  const pick = (id: string) => ph.setSettings(lock ? { lockWallpaper: id } : { wallpaper: id });
  return (
    <>
      <Wallpaper id={cur} dim />
      <div className={s.content}>
        <Head title={t("phWallpaper")} ph={ph} />
        <div className={s.seg}>
          <button type="button" className={cx(!lock && s.on)} onClick={() => setLock(false)} data-nav>
            {t("phHome")}
          </button>
          <button type="button" className={cx(lock && s.on)} onClick={() => setLock(true)} data-nav>
            {t("phLock")}
          </button>
        </div>
        <div className={s.scroll}>
          <div className={s.wps} data-cols="3">
            {WALLPAPERS.map((id) => (
              <button
                key={id}
                type="button"
                className={cx(s.wpt, cur === id && s.wptOn)}
                onClick={() => pick(id)}
                data-nav
                data-wp={id}
              >
                <Wallpaper id={id} />
                <em>{t(`wp_${id}` as Key)}</em>
              </button>
            ))}
          </div>
          {photos.length > 0 && (
            <>
              <div className={s.sec}>{t("phYourPhotos")}</div>
              <div className={s.wps}>
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cx(s.wpt, cur === `photo:${p.id}` && s.wptOn)}
                    style={{
                      height: 80,
                      backgroundImage: `url(${p.url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                    onClick={() => pick(`photo:${p.id}`)}
                    data-nav
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function Sounds() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const st = usePhone((p) => p.settings);
  const arg = usePhone((p) => top(p).arg ?? "");
  const forUid = arg.startsWith("tone:") ? Number(arg.slice(5)) : null;
  const [tab, setTab] = useState<"ring" | "text">("ring");
  const [playing, setPlaying] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  if (!ph) return null;
  const cur = forUid !== null ? (st.tones[String(forUid)] ?? null) : st.ringtone;
  const play = (id: Ringtone) => {
    stop.current?.();
    setPlaying(id);
    stop.current = previewRing(id);
    setTimeout(() => setPlaying((p) => (p === id ? null : p)), 3200);
  };
  return (
    <>
      <Wallpaper id={st.wallpaper} dim />
      <div className={s.content}>
        <Head title={forUid !== null ? ph.nameOf(forUid) : t("phSounds")} ph={ph} />
        {forUid === null && (
          <div className={s.seg}>
            <button type="button" className={cx(tab === "ring" && s.on)} onClick={() => setTab("ring")} data-nav>
              {t("phRingtone")}
            </button>
            <button type="button" className={cx(tab === "text" && s.on)} onClick={() => setTab("text")} data-nav>
              {t("phTextTone")}
            </button>
          </div>
        )}
        <div className={s.scroll}>
          <div className={cx(s.list, s.glass)}>
            {forUid !== null && (
              <button
                type="button"
                className={s.srow}
                data-nav
                onClick={() => {
                  const tones = { ...st.tones };
                  delete tones[String(forUid)];
                  ph.setSettings({ tones });
                }}
              >
                <span className={s.pb}>
                  <Ic n="music" size={12} />
                </span>
                {t("phDefaultTone").replace("{tone}", t(`tone_${st.ringtone}` as Key))}
                {cur === null && (
                  <span className={s.check}>
                    <Ic n="check" size={16} w={2.4} />
                  </span>
                )}
              </button>
            )}
            {(tab === "ring" || forUid !== null) &&
              RINGTONES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={s.srow}
                  data-nav
                  data-tone={id}
                  onClick={() => {
                    play(id);
                    if (forUid !== null) ph.setSettings({ tones: { ...st.tones, [String(forUid)]: id } });
                    else ph.setSettings({ ringtone: id });
                  }}
                >
                  <span className={cx(s.pb, playing === id && s.pbOn)}>
                    <Ic n="play" size={11} fill />
                  </span>
                  {t(`tone_${id}` as Key)}
                  {cur === id && (
                    <span className={s.check}>
                      <Ic n="check" size={16} w={2.4} />
                    </span>
                  )}
                </button>
              ))}
            {tab === "text" &&
              forUid === null &&
              TEXT_TONES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={s.srow}
                  data-nav
                  onClick={() => {
                    textTone(id);
                    ph.setSettings({ textTone: id });
                  }}
                >
                  <span className={s.pb}>
                    <Ic n="play" size={11} fill />
                  </span>
                  {t(`ttone_${id}` as Key)}
                  {st.textTone === id && (
                    <span className={s.check}>
                      <Ic n="check" size={16} w={2.4} />
                    </span>
                  )}
                </button>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function CasePick() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const st = usePhone((p) => p.settings);
  if (!ph) return null;
  return (
    <>
      <Wallpaper id={st.wallpaper} dim />
      <div className={s.content}>
        <Head title={t("phCase")} ph={ph} />
        <p className={s.sub} style={{ whiteSpace: "normal", margin: "0 4px 14px" }}>
          {t("phCaseSeen")}
        </p>
        <div className={s.cases} data-cols="4">
          {CASE_IDS.map((id) => {
            const [b, hi, lo] = CASES[id];
            return (
              <button
                key={id}
                type="button"
                className={s.caseBtn}
                data-nav
                data-case={id}
                onClick={() => ph.setSettings({ case: id })}
              >
                <span
                  className={cx(s.caseBack, st.case === id && s.caseOn)}
                  style={{
                    background:
                      id === "vortex"
                        ? "linear-gradient(160deg,rgba(255,45,149,.6),rgba(80,20,140,.8) 50%,rgba(0,229,208,.55))"
                        : `linear-gradient(145deg,${hi},${b} 40%,${lo})`,
                  }}
                />
                {t(`case_${id}` as Key)}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function About() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  if (!ph) return null;
  return (
    <>
      <Wallpaper id="orb" />
      <div className={s.content}>
        <Head title={t("phAbout")} ph={ph} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20 }}>
          <div className={s.orb} style={{ width: 90, height: 90 }} />
          <div className={cx(s.wm, s.holoText)} style={{ fontSize: 24, marginTop: 34 }}>
            VORTEX
          </div>
          <p className={s.empty} style={{ padding: "16px 12px" }}>
            {t("phAboutText")}
          </p>
        </div>
      </div>
    </>
  );
}

// ── the Vortex Store (a shell: the storefront and what's coming) ───────────
const COMING = [
  { id: "maps", icon: "maps" as IconName, bg: "linear-gradient(150deg,#4d5a5c,#2c3436)", cat: "tools" },
  { id: "tape", icon: "music" as IconName, bg: "linear-gradient(150deg,#ffb35c,#b5562f)", cat: "music" },
  { id: "snake", icon: "play" as IconName, bg: "linear-gradient(150deg,#8aa04a,#3d5a1a)", cat: "games" },
  { id: "pager", icon: "bell" as IconName, bg: "linear-gradient(150deg,#5fd8ff,#3b7bff)", cat: "tools" },
  { id: "horoscope", icon: "star" as IconName, bg: "linear-gradient(150deg,#a98bff,#4b1aa0)", cat: "weird" },
];
export function Store() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const st = usePhone((p) => p.settings);
  const [cat, setCat] = useState("all");
  const [asked, setAsked] = useState<string[]>([]);
  if (!ph) return null;
  return (
    <>
      <Wallpaper id={st.wallpaper} dim />
      <div className={s.content}>
        <Head title={t("app_store")} ph={ph} />
        <div className={s.scroll}>
          <div className={s.feat}>
            <div className={s.orb} />
            <small>{t("phSoon")}</small>
            <b>{t("phStoreFeature")}</b>
            <span>{t("phStoreBy")}</span>
          </div>
          <div className={s.chips}>
            {(["all", "games", "tools", "music", "weird"] as const).map((c) => (
              <button key={c} type="button" className={cx(cat === c && s.on)} onClick={() => setCat(c)} data-nav>
                {t(`cat_${c}` as Key)}
              </button>
            ))}
          </div>
          <div className={s.glass} style={{ borderRadius: 16 }}>
            {(cat === "all" || cat === "tools") && (
              <div className={s.sapp}>
                <span className={cx(s.tile, s.t_messages)}>
                  <Ic n="messages" />
                </span>
                <div>
                  <div className={s.nm}>{t("app_messages")}</div>
                  <div className={s.sub}>{t("phInstalled")}</div>
                </div>
                <button type="button" className={s.get} data-nav onClick={() => ph.open("messages")}>
                  {t("phOpen")}
                </button>
              </div>
            )}
            {COMING.filter((a) => cat === "all" || a.cat === cat).map((a) => (
              <div key={a.id} className={s.sapp}>
                <span className={s.tile} style={{ background: a.bg }}>
                  <Ic n={a.icon} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className={s.nm}>{t(`store_${a.id}` as Key)}</div>
                  <div className={s.sub}>{t(`store_${a.id}_d` as Key)}</div>
                </div>
                <button
                  type="button"
                  className={cx(s.get, s.later)}
                  data-nav
                  onClick={() => setAsked((x) => [...new Set([...x, a.id])])}
                >
                  {asked.includes(a.id) ? "✓" : t("phSoon")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function Maps() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const st = usePhone((p) => p.settings);
  if (!ph) return null;
  return (
    <>
      <Wallpaper id={st.wallpaper} dim />
      <div className={s.content}>
        <Head title={t("app_maps")} ph={ph} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 14,
          }}
        >
          <span className={cx(s.tile, s.t_maps)} style={{ width: 84, height: 84, borderRadius: 26 }}>
            <Ic n="maps" size={40} />
          </span>
          <span className={s.soon} style={{ position: "static" }}>
            {t("phSoon")}
          </span>
          <p className={s.empty} style={{ padding: "0 18px" }}>
            {t("phMapsSoon")}
          </p>
        </div>
      </div>
    </>
  );
}
