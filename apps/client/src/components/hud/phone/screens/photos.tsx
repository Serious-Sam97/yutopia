"use client";

import { EMOTES } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { emoteUrl } from "@/world/art/emotes";
import { FILTERS, MAX_REC_S, POSES } from "@/world/phone/camera";
import { usePhone } from "@/world/phone/store";
import { useHud } from "@/world/store";
import { useWorld } from "../../ctx";
import s from "../phone.module.css";
import { cx, dayLabel, Head, Ic, secs, Thumb, Wallpaper } from "../ui";
import { ThreadIcon } from "./messages";

// The Gallery (photos kept in the API), one photo (send it, make it the
// wallpaper, save the file, delete it), sending one to a thread, and the
// camera's viewfinder over the world.

export function Gallery() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const photos = usePhone((p) => p.photos);
  const loaded = usePhone((p) => p.photosLoaded);
  const wp = usePhone((p) => p.settings.wallpaper);
  const [tab, setTab] = useState<"all" | "selfies" | "videos" | "sent">("all");
  useEffect(() => {
    void ph?.loadPhotos();
  }, [ph]);
  if (!ph) return null;
  const list = photos.filter(
    (p) =>
      p.id > 0 && (tab === "all" || (tab === "selfies" ? p.selfie : tab === "videos" ? p.kind === "video" : p.sent)),
  );
  const groups: { day: string; items: typeof list }[] = [];
  for (const p of list) {
    const day = dayLabel(p.at);
    const g = groups[groups.length - 1];
    if (g?.day === day) g.items.push(p);
    else groups.push({ day, items: [p] });
  }
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title={t("app_gallery")} ph={ph}>
          <button
            type="button"
            className={s.act}
            data-nav
            aria-label={t("app_camera")}
            onClick={() => ph.camera.open()}
          >
            <Ic n="camera" size={15} w={2.1} />
          </button>
        </Head>
        <div className={s.seg}>
          {(["all", "selfies", "videos", "sent"] as const).map((x) => (
            <button key={x} type="button" className={cx(tab === x && s.on)} onClick={() => setTab(x)} data-nav>
              {t(x === "all" ? "phAll" : x === "selfies" ? "phSelfies" : x === "videos" ? "phVideos" : "phSent")}
            </button>
          ))}
        </div>
        <div className={s.scroll} data-cols="3">
          {!loaded && <p className={s.empty}>{t("phLoading")}</p>}
          {loaded && !list.length && <p className={s.empty}>{t("phNoPhotos")}</p>}
          {groups.map((g) => (
            <div key={g.day}>
              <div className={s.sec}>{g.day}</div>
              <div className={s.gg}>
                {g.items.map((p) => (
                  <button key={p.id} type="button" data-nav onClick={() => ph.viewPhoto(p)} data-photo={p.id}>
                    <Thumb p={p} />
                    {p.selfie && <span className={s.selfieDot} />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function PhotoView({ id }: { id: number }) {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  // mine (in my Gallery), or one sent to me (opened from a thread)
  const p = usePhone(
    (x) => x.photos.find((y) => y.id === id) ?? (x.viewing?.id === id ? x.viewing : null) ?? x.camera?.last ?? null,
  );
  const me = usePhone((x) => x.me.uid);
  const [sure, setSure] = useState(false);
  if (!ph) return null;
  if (!p)
    return (
      <div className={s.viewer}>
        <div style={{ position: "absolute", top: 44, left: 12 }}>
          <button type="button" className={s.round} onClick={() => ph.back()} aria-label={t("phBack")} data-nav>
            <Ic n="back" size={16} />
          </button>
        </div>
        <p className={s.empty} style={{ marginTop: 120 }}>
          {t("phLoading")}
        </p>
      </div>
    );
  const mine = !p.owner || p.owner === me;
  const video = p.kind === "video";
  const date = new Date(p.at).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
  return (
    <div className={s.viewer} data-photo-view={id}>
      <div
        style={{ position: "absolute", top: 44, left: 12, right: 12, display: "flex", justifyContent: "space-between" }}
      >
        <button type="button" className={s.round} onClick={() => ph.back()} aria-label={t("phBack")} data-nav>
          <Ic n="back" size={16} />
        </button>
      </div>
      {video ? (
        // biome-ignore lint/a11y/useMediaCaption: a clip from the world, no speech track to caption
        <video src={p.url} controls autoPlay playsInline />
      ) : (
        // biome-ignore lint/performance/noImgElement: a photo from the API
        <img alt="" src={p.url} />
      )}
      <div style={{ padding: "12px 16px", font: "11.5px/1.5 var(--font-body)", color: "var(--dim)" }}>
        <b style={{ color: "#fff", font: "600 13px var(--font-body)", display: "block" }}>
          {mine ? "" : `${ph.nameOf(p.owner)} · `}
          {video ? t("phVideos").replace(/s$/, "") : p.selfie ? "Selfie" : t("app_camera")} ·{" "}
          {t(`filter_${p.filter}` as Key)}
        </b>
        {p.where} · {date}
      </div>
      {!mine ? (
        <div className={s.vact}>
          <button type="button" data-nav onClick={() => void ph.keepPhoto(p)}>
            <b className={s.hl}>
              <Ic n="gallery" size={19} />
            </b>
            {t("phKeep")}
          </button>
          <a
            href={p.url}
            download={`yutopia-${id}.${video ? "webm" : "jpg"}`}
            target="_blank"
            rel="noreferrer"
            data-nav
            className={s.cbtnWrap}
            style={{ fontSize: 10 }}
          >
            <b className={s.cbtn} style={{ width: 44, height: 44, background: "rgba(255,255,255,.1)" }}>
              <Ic n="dl" size={19} />
            </b>
            {t("phSaveFile")}
          </a>
        </div>
      ) : sure ? (
        <div className={s.vact}>
          <span className={s.sub} style={{ alignSelf: "center" }}>
            {t("phDeleteSure")}
          </span>
          <button type="button" data-nav onClick={() => void ph.deletePhoto(id).then(() => ph.back())}>
            <b className={s.red}>
              <Ic n="trash" size={19} />
            </b>
            {t("phDelete")}
          </button>
          <button type="button" data-nav onClick={() => setSure(false)}>
            <b>
              <Ic n="back" size={19} />
            </b>
            {t("phBack")}
          </button>
        </div>
      ) : (
        <div className={s.vact}>
          <button type="button" data-nav onClick={() => ph.go({ app: "gallery", view: "send", arg: String(id) })}>
            <b className={s.hl}>
              <Ic n="send" size={19} />
            </b>
            {t("phSend")}
          </button>
          {!video && (
            <button
              type="button"
              data-nav
              onClick={() => {
                ph.setSettings({ wallpaper: `photo:${id}` });
                ph.note(t("phWallpaperSet"));
              }}
            >
              <b>
                <Ic n="wall" size={19} />
              </b>
              {t("phSetWallpaper")}
            </button>
          )}
          <a
            href={p.url}
            download={`yutopia-${id}.${video ? "webm" : "jpg"}`}
            target="_blank"
            rel="noreferrer"
            data-nav
            className={s.cbtnWrap}
            style={{ fontSize: 10 }}
          >
            <b className={s.cbtn} style={{ width: 44, height: 44, background: "rgba(255,255,255,.1)" }}>
              <Ic n="dl" size={19} />
            </b>
            {t("phSaveFile")}
          </a>
          <button type="button" data-nav onClick={() => setSure(true)}>
            <b>
              <Ic n="trash" size={19} />
            </b>
            {t("phDelete")}
          </button>
        </div>
      )}
    </div>
  );
}

// send a photo: pick the thread (arg "thread:<id>" comes from a thread's camera
// key: then it's the photo to pick)
export function SendTo({ id }: { id: number | string }) {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const threads = usePhone((p) => p.threads.filter((x) => x.kind !== "vortex"));
  const photos = usePhone((p) => p.photos.filter((x) => x.id > 0));
  const wp = usePhone((p) => p.settings.wallpaper);
  const arg = String(id);
  useEffect(() => {
    void ph?.loadPhotos();
  }, [ph]);
  if (!ph) return null;
  // from a thread: pick the photo
  if (arg.startsWith("thread:")) {
    const thread = Number(arg.slice(7));
    return (
      <>
        <Wallpaper id={wp} dim />
        <div className={s.content}>
          <Head title={t("app_gallery")} ph={ph}>
            <button
              type="button"
              className={s.act}
              data-nav
              aria-label={t("app_camera")}
              onClick={() => ph.camera.open()}
            >
              <Ic n="camera" size={15} w={2.1} />
            </button>
          </Head>
          <div className={s.scroll} data-cols="3">
            {!photos.length && <p className={s.empty}>{t("phNoPhotos")}</p>}
            <div className={s.gg}>
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-nav
                  onClick={() => {
                    void ph.send(thread, "", { photoId: p.id });
                    ph.markSent(p.id);
                    ph.back();
                  }}
                >
                  <Thumb p={p} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }
  const photoId = Number(arg);
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title={t("phSendTo")} ph={ph} />
        <div className={s.scroll}>
          <div className={cx(s.list, s.glass)}>
            {threads.map((th) => (
              <button
                key={th.id}
                type="button"
                className={s.row}
                data-nav
                onClick={() => {
                  void ph.send(th.id, "", { photoId });
                  ph.markSent(photoId);
                  ph.openThread(th.id);
                }}
              >
                <ThreadIcon th={th} size={34} />
                <div className={s.col}>
                  <div className={s.nm}>{th.kind === "everyone" ? `# ${th.name}` : ph.threadName(th)}</div>
                </div>
                <Ic n="send" size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── the viewfinder ─────────────────────────────────────────────────────────
const POSE_LABEL: Record<string, Key> = {
  "": "pose_",
  peace: "pose_peace",
  point: "pose_point",
  thumbs: "pose_thumbs",
};
export function Viewfinder() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const c = usePhone((p) => p.camera);
  const name = useHud((h) => h.me?.name ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const lastId = c?.last?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new photo flies into the thumbnail
  useEffect(() => {
    if (!c?.last || !lastId) return;
    setSaved(c.last.url);
    const tm = setTimeout(() => setSaved(null), 1400);
    return () => clearTimeout(tm);
  }, [lastId]);
  if (!ph || !c) return null;
  const cam = ph.camera;
  return (
    <div className={s.vf} data-viewfinder={c.mode}>
      <div className={s.thirds} />
      {c.filter !== "none" && <div className={s[`tint_${c.filter}`]} />}
      <span
        className={s.corner}
        style={{ left: 18, top: 18, borderRight: 0, borderBottom: 0, borderRadius: "12px 0 0 0" }}
      />
      <span
        className={s.corner}
        style={{ right: 18, top: 18, borderLeft: 0, borderBottom: 0, borderRadius: "0 12px 0 0" }}
      />
      <span
        className={s.corner}
        style={{ left: 18, bottom: 18, borderRight: 0, borderTop: 0, borderRadius: "0 0 0 12px" }}
      />
      <span
        className={s.corner}
        style={{ right: 18, bottom: 18, borderLeft: 0, borderTop: 0, borderRadius: "0 0 12px 0" }}
      />
      <div className={s.vfTL}>
        <button type="button" className={cx(s.chipb, s.vfGlass)} onClick={() => cam.close()} aria-label={t("phBack")}>
          <Ic n="back" size={16} />
        </button>
        <button
          type="button"
          className={cx(s.chipb, s.vfGlass, c.flash && s.chipOn)}
          onClick={() => cam.toggleFlash()}
          aria-pressed={c.flash}
        >
          <Ic n="bolt" size={16} />
          {t("phFlash")}
        </button>
        <button
          type="button"
          className={cx(s.chipb, s.vfGlass, c.timer > 0 && s.chipOn)}
          onClick={() => cam.cycleTimer()}
        >
          <Ic n="timer" size={16} />
          {c.timer ? `${c.timer} s` : t("phTimer")}
        </button>
      </div>
      <div className={cx(s.vfTop, s.vfGlass)}>
        <button type="button" className={cx(!c.video && s.on)} onClick={() => cam.setVideo(false)} disabled={!!c.rec}>
          {t("phPhotoMode")}
        </button>
        <button
          type="button"
          className={cx(c.video && s.on)}
          onClick={() => cam.setVideo(true)}
          disabled={!!c.rec}
          data-video-mode
        >
          {t("phVideoMode")}
        </button>
      </div>
      {c.rec > 0 && <RecTimer since={c.rec} />}
      <div className={cx(s.rail, s.vfGlass)}>
        <button
          type="button"
          className={cx(s.rb, c.mode === "selfie" && s.onBtn)}
          onClick={() => cam.setMode(c.mode === "selfie" ? "photo" : "selfie")}
          aria-label={t("phSelfieMode")}
          aria-pressed={c.mode === "selfie"}
          title={t("phSelfieMode")}
          disabled={!!c.rec}
        >
          <Ic n="flip" size={22} />
        </button>
        <button
          type="button"
          className={cx(s.shut, c.video && s.shutVideo, c.rec > 0 && s.shutRec)}
          onClick={() => void cam.shoot()}
          aria-label={c.video ? t("phRecord") : t("phShoot")}
          disabled={c.busy}
          data-shutter
        >
          <i />
        </button>
        <button
          type="button"
          className={s.thumb}
          onClick={() => {
            cam.close();
            if (c.last && c.last.id > 0) ph.viewPhoto(c.last);
            else ph.open("gallery");
          }}
          aria-label={t("app_gallery")}
        >
          {c.last && <Thumb p={c.last} />}
        </button>
      </div>
      <div className={cx(s.poses, s.vfGlass)}>
        <div className={s.vfH}>{t("phPose")}</div>
        <div className={s.prow}>
          {POSES.map((p, i) => (
            <button
              key={p || "none"}
              type="button"
              className={cx(s.pz, c.pose === p && s.pzOn)}
              onClick={() => cam.setPose(p)}
              title={`${i + 1}`}
            >
              {(EMOTES as readonly string[]).includes(p) ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: drawn emote */}
                  <img alt="" src={emoteUrl(p as never)} />
                  {p[0].toUpperCase() + p.slice(1)}
                </>
              ) : (
                t(POSE_LABEL[p] ?? "pose_")
              )}
            </button>
          ))}
        </div>
      </div>
      <div className={cx(s.filters, s.vfGlass)}>
        <div className={s.vfH}>{t("phFilter")}</div>
        <div className={s.frow}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={cx(s.fl, c.filter === f && s.flOn)}
              onClick={() => cam.setFilter(f)}
            >
              <b
                style={
                  f === "bw"
                    ? { filter: "grayscale(1)" }
                    : f === "vhs"
                      ? {
                          filter: "saturate(1.8) hue-rotate(-12deg)",
                          backgroundImage:
                            "repeating-linear-gradient(180deg,rgba(0,0,0,.3) 0 1px,transparent 1px 3px),linear-gradient(160deg,#ffd36b,#ff2d95 60%,#7a3bdc)",
                        }
                      : f === "film"
                        ? { filter: "sepia(.4) saturate(1.3)" }
                        : f === "polaroid"
                          ? { boxShadow: "inset 0 0 0 5px #f4efe4, inset 0 -14px 0 5px #f4efe4" }
                          : undefined
                }
              />
              {t(`filter_${f}` as Key)}
            </button>
          ))}
        </div>
      </div>
      <div className={cx(s.vfKeys, s.vfGlass)}>
        <span className={s.kc}>Space</span>
        {t("phShoot")} &nbsp; <span className={s.kc}>Q</span>
        <span className={s.kc}>E</span>
        {t("phTurn")}
        <br />
        <span className={s.kc}>+</span>
        <span className={s.kc}>−</span>
        {t("phZoom")} &nbsp; <span className={s.kc}>V</span>
        {t("phVideoMode").toLowerCase()} &nbsp; <span className={s.kc}>1–8</span>
        {t("phPose")} &nbsp; <span className={s.kc}>Esc</span>
        {t("phBack")}
      </div>
      {c.count > 0 && (
        <div className={s.count} key={c.count}>
          {c.count}
        </div>
      )}
      {saved && (
        <div className={s.saved}>
          {/* biome-ignore lint/performance/noImgElement: the photo just taken */}
          <img alt="" src={saved} />
        </div>
      )}
      <span hidden data-me={name} />
    </div>
  );
}

// recording: the red light and how long, against the 30 s
function RecTimer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  const s0 = Math.min(MAX_REC_S, Math.floor((now - since) / 1000));
  return (
    <div className={s.rec} data-rec>
      <i />
      {secs(s0)} / {secs(MAX_REC_S)}
    </div>
  );
}
