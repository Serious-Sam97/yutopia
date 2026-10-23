"use client";

import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { phone, top, usePhone } from "@/world/phone/store";
import { useHud } from "@/world/store";
import { useWorld } from "../ctx";
import s from "./phone.module.css";
import { CallScreen } from "./screens/call";
import { Gps, GpsHud } from "./screens/gps";
import { Boot, Home } from "./screens/home";
import { Messages, NewThread, Thread } from "./screens/messages";
import { AddContact, ContactCard, Contacts, PhoneApp, VortexCard } from "./screens/people";
import { Gallery, PhotoView, SendTo, Viewfinder } from "./screens/photos";
import { About, CasePick, Settings, Sounds, Store, Wallpapers } from "./screens/settings";
import { caseVars, cx, Ic, PFace, StatusBar, secs, useNav, VxFace } from "./ui";

// Vortex Mobile on screen (docs/plan/21-cellphone.md): the phone slides up
// bottom-right while you keep walking (P, or the dock's phone key), peeks up
// when a text arrives, keeps a pill at the top while a call goes on with it
// put away, and turns the whole screen into the viewfinder for the camera.
export function PhoneLayer() {
  return (
    <PhoneGuard>
      <PhoneLayerInner />
    </PhoneGuard>
  );
}

// A bug in the phone never takes the world down: it puts the phone away and
// comes back clean (the error is logged).
class PhoneGuard extends Component<{ children: ReactNode }, { broke: number }> {
  state = { broke: 0 };
  static getDerivedStateFromError() {
    return { broke: Date.now() };
  }
  componentDidCatch(e: unknown) {
    console.error("[phone] screen crashed", e);
    const ph = (
      window as unknown as { __yutopia?: { phone?: { camera: { close(): void }; setOpen(o: boolean): void } } }
    ).__yutopia?.phone;
    ph?.camera.close();
    ph?.setOpen(false);
    phone.set({ stack: [{ app: "home" }], sel: 0 });
    setTimeout(() => this.setState({ broke: 0 }), 300);
  }
  render() {
    return this.state.broke ? null : this.props.children;
  }
}

function PhoneLayerInner() {
  const open = usePhone((p) => p.open);
  const camera = usePhone((p) => !!p.camera);
  const theme = usePhone((p) => p.settings.theme);
  const textSize = usePhone((p) => p.settings.textSize);
  return (
    <div
      className={cx(s.layer, theme === "light" && s.light)}
      style={{ fontSize: textSize === "small" ? 13 : textSize === "large" ? 16 : 14 }}
      data-phone
    >
      {camera ? <Viewfinder /> : open ? <PhoneDock /> : <Peek />}
      {!camera && <GpsHud />}
      {!open && <CallPill />}
      <FlashFx />
    </div>
  );
}

// ── the phone, out ──────────────────────────────────────────────────────────
function PhoneDock() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone ?? null;
  const settings = usePhone((p) => p.settings);
  const screen = usePhone(top);
  const depth = usePhone((p) => p.stack.length);
  const note = usePhone((p) => p.note);
  const root = useRef<HTMLDivElement>(null);
  const key = `${screen.app}|${screen.view ?? ""}|${screen.arg ?? ""}|${depth}`;
  useNav(root, ph, key);
  const mobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;
  if (!ph) return null;
  return (
    <>
      {!mobile && (
        <div className={s.hint}>
          <span>{t("phHint")}</span>
        </div>
      )}
      <section className={s.dock} aria-label={t("phMobile")} data-phone-open>
        <div
          className={cx(s.phone, settings.case === "vortex" && s.vortexCase)}
          style={caseVars(settings.case) as never}
        >
          <span className={s.vol} />
          <div className={s.screen} ref={root} data-screen={key}>
            <span className={s.punch} />
            {screen.app !== "boot" && <StatusBar />}
            <Route />
            {note && <div className={s.note}>{note}</div>}
            <button
              type="button"
              className={s.homeInd}
              aria-label={t("phPutAway")}
              onClick={() => (screen.app === "home" ? ph.setOpen(false) : ph.home())}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function Route() {
  const sc = usePhone(top);
  const arg = sc.arg ?? "";
  switch (sc.app) {
    case "boot":
      return <Boot />;
    case "call":
      return <CallScreen />;
    case "messages":
      if (sc.view === "thread") return <Thread id={Number(arg)} key={arg} />;
      if (sc.view === "new") return <NewThread group={arg === "group"} />;
      return <Messages />;
    case "contacts":
      if (sc.view === "card") return <ContactCard uid={Number(arg)} key={arg} />;
      if (sc.view === "add") return <AddContact />;
      return <Contacts />;
    case "phone":
      return <PhoneApp tab={arg || "recents"} />;
    case "gallery":
      if (sc.view === "photo") return <PhotoView id={Number(arg)} key={arg} />;
      if (sc.view === "send") return <SendTo id={Number(arg)} />;
      return <Gallery />;
    case "settings":
      if (sc.view === "wallpaper") return <Wallpapers />;
      if (sc.view === "sounds") return <Sounds />;
      if (sc.view === "case") return <CasePick />;
      if (sc.view === "about") return <About />;
      return <Settings />;
    case "store":
      return <Store />;
    case "maps":
      return <Gps />;
    case "vortex":
      return <VortexCard />;
    default:
      return <Home />;
  }
}

// ── a text while it's away: it peeks up with a banner ─────────────────────
function Peek() {
  const w = useWorld();
  const p = usePhone((x) => x.peek);
  const c = usePhone((x) => x.settings.case);
  const wp = usePhone((x) => x.settings.lockWallpaper);
  if (!p || !w?.phone) return null;
  return (
    <button
      type="button"
      className={s.peek}
      key={p.key}
      onClick={() => w.phone?.setOpen(true)}
      aria-label={`${p.title}: ${p.body}`}
      data-phone-peek
    >
      <div className={s.phone} style={caseVars(c) as never}>
        <div className={s.screen}>
          <span className={s.punch} />
          <WallpaperLite id={wp} />
          <StatusBar />
          <div className={s.banner}>
            {p.avatar === "vortex" ? <VxFace size={34} /> : <PFace avatar={p.avatar} name={p.title} size={34} />}
            <div style={{ minWidth: 0, textAlign: "left" }}>
              <div className={s.nm}>{p.title}</div>
              <div className={s.sub} style={{ color: "#e7e0ff" }}>
                {p.body}
              </div>
            </div>
            <span className={s.bannerAp}>{p.kind === "missed" ? "☎" : "now"}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
function WallpaperLite({ id }: { id: string }) {
  return <div className={cx(s.wp, s[`wp_${id}`] ?? s.wp_portal)} />;
}

// ── a call going on with the phone put away ───────────────────────────────
function CallPill() {
  const t = useTr();
  const w = useWorld();
  const c = usePhone((p) => p.call);
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  if (!c || c.phase !== "live" || !w?.phone) return null;
  const other = c.peers.find((x) => x.state === "in") ?? c.peers[0];
  const name = c.peers.filter((x) => x.state === "in").length > 1 ? `${other?.name ?? ""} +` : (other?.name ?? "");
  return (
    // (a div: the hang-up button is inside it)
    // biome-ignore lint/a11y/useSemanticElements: it holds a button of its own
    <div
      className={s.pill}
      onClick={() => w.phone?.setOpen(true)}
      onKeyDown={() => {}}
      role="button"
      tabIndex={-1}
      data-call-pill
    >
      {other && <PFace avatar={other.avatar} name={other.name} size={30} status="call" />}
      <span>{t("phOnCallWith").replace("{name}", name.split(" ")[0] ?? "")}</span>
      <span className={s.pillT}>{secs(Math.max(0, Math.floor((Date.now() - c.startedAt) / 1000)))}</span>
      <button
        type="button"
        className={s.pillEnd}
        aria-label={t("phEnd")}
        onClick={(e) => {
          e.stopPropagation();
          w.phone?.calls.hangup();
        }}
      >
        <Ic n="end" size={16} fill />
      </button>
    </div>
  );
}

// ── the camera's flash (mine, on screen) ──────────────────────────────────
function FlashFx() {
  const [k, setK] = useState(0);
  useEffect(() => {
    const on = () => setK(Date.now());
    document.addEventListener("phone:flash", on);
    return () => document.removeEventListener("phone:flash", on);
  }, []);
  const camera = useHud((h) => h.phone.camera);
  if (!k || !camera) return null;
  return <div key={k} className={s.flash} />;
}

// for the dev pages / e2e
if (typeof window !== "undefined") (window as unknown as { __phone: unknown }).__phone = phone;
