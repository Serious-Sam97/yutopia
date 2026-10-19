"use client";

import { CASES, isCase } from "@yutopia/shared/phone";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useState } from "react";
import { lang, tr } from "@/lib/i18n";
import { type VortexMood, vortexSvg } from "@/world/art/vortex/vortexArt";
import type { Phone } from "@/world/phone";
import type { PhotoRef } from "@/world/phone/store";
import { phone, usePhone } from "@/world/phone/store";
import { Face } from "../Face";
import s from "./phone.module.css";

// Small pieces every screen of Vortex Mobile uses.

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ── icons: round strokes on a 24 grid (the OS's own set) ──────────────────
const IC = {
  phone:
    "M6.5 3.5h3l1.6 4.4-2.2 1.4a11.5 11.5 0 0 0 5.8 5.8l1.4-2.2 4.4 1.6v3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.5 5.6a2 2 0 0 1 2-2.1z",
  messages:
    "M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5zM7 10.5h10M7 13.5h6",
  camera:
    "M3 8.5A1.5 1.5 0 0 1 4.5 7h3l1.6-2.5h5.8L16.5 7h3A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5zM12 9.5a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 1 0 0-7.6",
  gallery: "M3 4.5h18v15H3zM3 16l5-5 4 4 3-3 6 6M15.5 7.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 1 0 0-3.2",
  contacts: "M12 4.7a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 1 0 0-7.6M4.5 20c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6",
  settings:
    "M4 7h9M17 7h3M4 17h4M12 17h8M4 12h12M15 4.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4M10 14.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4",
  store:
    "M5 8.5h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3zM9 8.5V7a3 3 0 0 1 6 0v1.5M9.5 13.5l2.5 2.5 3-4",
  maps: "M12 21s6.5-5.8 6.5-11a6.5 6.5 0 0 0-13 0c0 5.2 6.5 11 6.5 11zM12 7.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8",
  back: "M15 5l-7 7 7 7",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  send: "M4 12l16-8-6 16-3-7z",
  mic: "M9 3h6v11H9zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21",
  micOff: "M9 3h6v11H9zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16",
  speaker: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  video: "M3 6.5h12.5v11H3zM15.5 10.5l5-3v9l-5-3",
  videoOff: "M3 6.5h12.5v11H3zM15.5 10.5l5-3v9l-5-3M3 3l18 18",
  addPerson:
    "M10 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7M3.5 19.5c.7-3.4 3.3-5.5 6.5-5.5s5.8 2.1 6.5 5.5M18.5 8v6M15.5 11h6",
  end: "M3 13.5c5-4.5 13-4.5 18 0l-2 3-3.6-1.2V12.6a9 9 0 0 0-6.8 0v2.7L5 16.5z",
  flip: "M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M20 4v4h-4M4 20v-4h4",
  bolt: "M13 3L5 13.5h6L10 21l8-10.5h-6z",
  timer: "M12 5.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 1 0 0-15M12 9.5V13l2.5 2M9.5 3h5",
  chat: "M5 5h14v10H10l-5 4z",
  search: "M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13M16 16l4.5 4.5",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17M12 7.5V12l3 2",
  moon: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z",
  chev: "M9 5l7 7-7 7",
  play: "M8 5.5v13l10-6.5z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  palette:
    "M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4h1.6a3.9 3.9 0 0 0 3.9-3.9c0-4.8-3.8-8.8-8.5-8.8z",
  music: "M9 18V6l10-2v12M7 16a2 2 0 1 0 0 4 2 2 0 1 0 0-4M17 14a2 2 0 1 0 0 4 2 2 0 1 0 0-4",
  text: "M5 6h14M12 6v13M8 19h8",
  vibrate: "M8 4h8v16H8zM4 9v6M20 9v6",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17M12 11v5M12 8v.01",
  dl: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13",
  wall: "M5 3h14v18H5zM5 15l4-4 3 3 2-2 5 5",
  walk: "M13 4.5a1.5 1.5 0 1 0 0 .01M10 21l2-6 3 3v3M8 12l3-4 3 2 3 1M11 8l1 7",
  reply: "M9 7 4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 5 5V19",
  people:
    "M9 5.3a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 1 0 0-6.4M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M16.5 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M15.5 14.2c2.6-.3 4.5 1.3 5 4.3",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0",
  bellOff: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0M4 4l16 16",
  keypad: "M6 5v.01M12 5v.01M18 5v.01M6 10v.01M12 10v.01M18 10v.01M6 15v.01M12 15v.01M18 15v.01M12 20v.01",
  leave: "M14 4H6v16h8M10 12h10M17 9l3 3-3 3",
} as const;
export type IconName = keyof typeof IC;

export function Ic({ n, size = 20, w = 1.9, fill }: { n: IconName; size?: number; w?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={IC[n]} />
    </svg>
  );
}

// ── time ───────────────────────────────────────────────────────────────────
export function useNow(every = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}
export const hhmm = (d: Date | number) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
export function when(at: number): string {
  const d = new Date(at);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(d);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return tr("phYesterday");
  return d.toLocaleDateString(lang() === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" });
}
export function dayLabel(at: number): string {
  const d = new Date(at);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return tr("phToday");
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return tr("phYesterday");
  return d.toLocaleDateString(lang() === "pt" ? "pt-BR" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
export const secs = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// ── the OS's chrome ────────────────────────────────────────────────────────
export function StatusBar() {
  const now = useNow();
  return (
    <div className={s.sb}>
      <span>{hhmm(now)}</span>
      <span className={s.sbR}>
        <span className={s.bars}>
          <i style={{ height: 4 }} />
          <i style={{ height: 6 }} />
          <i style={{ height: 8 }} />
          <i style={{ height: 10 }} />
        </span>
        <span>VTX</span>
        <span className={s.bat}>
          <i style={{ width: "100%" }} />
        </span>
      </span>
    </div>
  );
}

export function Wallpaper({ id, dim }: { id: string; dim?: boolean }) {
  const photos = usePhone((p) => p.photos);
  if (id.startsWith("photo:")) {
    const ph = photos.find((p) => `photo:${p.id}` === id);
    return (
      <div
        className={cx(s.wp, s.dim)}
        style={ph ? { backgroundImage: `url(${ph.url})` } : undefined}
        data-wallpaper={id}
      />
    );
  }
  return <div className={cx(s.wp, s[`wp_${id}`] ?? s.wp_portal, dim && s.dim)} data-wallpaper={id} />;
}

// the case's colours as CSS variables
export function caseVars(id: string): Record<string, string> {
  const c = CASES[isCase(id) ? id : "walnut"];
  return { "--case": c[0], "--caseHi": c[1], "--caseLo": c[2] };
}

// ── faces ──────────────────────────────────────────────────────────────────
const vxCache = new Map<string, string>();
export function vortexUrl(mood: VortexMood = "smug"): string {
  let u = vxCache.get(mood);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(vortexSvg(mood, `ph${mood}`, "none"))}`;
    vxCache.set(mood, u);
  }
  return u;
}
export function VxFace({ size = 38, mood = "smug" }: { size?: number; mood?: VortexMood }) {
  return (
    <span className={s.vxFace} style={{ width: size, height: size }}>
      {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
      <img alt="" src={vortexUrl(mood)} draggable={false} />
    </span>
  );
}
// a person (avatar seed) or Vortex ("vortex"), with a presence dot
export function PFace({
  avatar,
  name,
  size = 38,
  status,
}: {
  avatar: string;
  name: string;
  size?: number;
  status?: "on" | "away" | "call" | "off";
}) {
  if (avatar === "vortex") return <VxFace size={size} />;
  const color = status === "on" ? "online" : status === "away" ? "away" : status === "call" ? "dnd" : undefined;
  return <Face avatar={avatar} name={name} size={size} status={status === "off" ? undefined : color} />;
}

// ── a screen's header ──────────────────────────────────────────────────────
export function Head({
  title,
  ph,
  back = true,
  children,
}: {
  title: ReactNode;
  ph: Phone;
  back?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={s.head}>
      {back && (
        <button type="button" className={s.round} onClick={() => ph.back()} aria-label={tr("phBack")} data-nav>
          <Ic n="back" size={16} />
        </button>
      )}
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return <span className={cx(s.tog, on && s.togOn)} />;
}

// ── keyboard: arrows move over the screen's [data-nav] things, Enter clicks ─
export function useNav(root: RefObject<HTMLDivElement | null>, ph: Phone | null, key: string) {
  const [kbd, setKbd] = useState(false);
  const sel = usePhone((p) => p.sel);
  useEffect(() => {
    if (!ph) return;
    return ph.onNav((n) => {
      const el = root.current;
      if (!el) return;
      if (n === "back") return ph.back();
      const items = [...el.querySelectorAll<HTMLElement>("[data-nav]")].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      setKbd(true);
      const cur = Math.min(phone.get().sel, items.length - 1);
      if (n === "enter") {
        const it = items[cur];
        if (it instanceof HTMLInputElement) it.focus();
        else it?.click();
        return;
      }
      const cols = Number(el.querySelector<HTMLElement>("[data-cols]")?.dataset.cols ?? 1);
      const step = n === "up" ? -cols : n === "down" ? cols : n === "left" ? -1 : 1;
      phone.set({ sel: Math.max(0, Math.min(items.length - 1, cur + step)) });
    });
  }, [ph, root]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>("[data-nav]")];
    items.forEach((x, i) => {
      x.classList.toggle(s.navSel, kbd && i === sel);
    });
    if (kbd) items[sel]?.scrollIntoView({ block: "nearest" });
  });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const off = () => setKbd(false);
    el.addEventListener("pointermove", off);
    return () => el.removeEventListener("pointermove", off);
  }, [root]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new screen starts at the top
  useEffect(() => {
    phone.set({ sel: 0 });
  }, [key]);
}

// A photo or a video in a grid or a bubble (a video: its first frame, a play
// mark and its length).
export function Thumb({ p }: { p: PhotoRef }) {
  if (p.kind !== "video")
    // biome-ignore lint/performance/noImgElement: a photo from the API
    return <img alt="" src={p.url} loading="lazy" />;
  return (
    <>
      <video src={`${p.url}#t=0.1`} muted playsInline preload="metadata" />
      <span className={s.playMark}>
        <Ic n="play" size={12} fill />
        {secs(p.secs)}
      </span>
    </>
  );
}
