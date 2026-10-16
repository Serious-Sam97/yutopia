"use client";

import { useEffect, useRef, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { usePhone } from "@/world/phone/store";
import { useWorld } from "../../ctx";
import s from "../phone.module.css";
import { cx, Ic, PFace, secs, VxFace } from "../ui";

// A call: coming in (answer, decline, a text instead, remind me), going out
// (calling…, ringing…), on the line (mute, speaker, add someone, the camera,
// hang up), a video call (their picture, mine in the corner), and Vortex
// (his face, his words as he says them).

export function CallScreen() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const c = usePhone((p) => p.call);
  const contacts = usePhone((p) => p.contacts);
  const [, tick] = useState(0);
  const [picking, setPicking] = useState<"text" | "add" | null>(null);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  if (!ph || !c) return null;
  const calls = ph.calls;
  const peers = c.peers.filter((p) => p.state !== "left" || c.phase === "ended");
  const main = c.vortex ? null : (peers.find((p) => p.uid === c.from) ?? peers[0]);
  const name = c.vortex
    ? (c.peers[0]?.name || "Vortex").toUpperCase()
    : peers.length > 1
      ? peers.map((p) => p.name.split(" ")[0]).join(", ")
      : (main?.name ?? "");
  const live = c.phase === "live";
  const showVideo = live && !c.vortex && (c.video || c.camOn);
  const status =
    c.phase === "incoming"
      ? t(c.video ? "phIncomingVideo" : "phIncomingCall")
      : c.phase === "dialing"
        ? c.vortex
          ? t("phVortexCalling")
          : t("phCalling")
        : c.phase === "ringing"
          ? c.vortex
            ? t("phVortexCalling")
            : t("phRinging")
          : c.phase === "ended"
            ? t(`phEnd_${c.end ?? "answered"}` as Key)
            : c.vortex
              ? `${secs(Math.floor((Date.now() - c.startedAt) / 1000))} · ${t("phVortexPicked")}`
              : secs(Math.floor((Date.now() - c.startedAt) / 1000));

  if (showVideo && main) return <VideoCall name={name} uid={main.uid} />;

  return (
    <>
      <div
        className={s.callBg}
        style={
          c.vortex
            ? {
                background:
                  "radial-gradient(70% 45% at 50% 34%,rgba(0,229,208,.25),transparent 70%),linear-gradient(180deg,#14002b,#05000c)",
              }
            : undefined
        }
      />
      <div className={s.call} data-call-phase={c.phase}>
        <div className={s.callK}>
          {c.phase === "incoming" ? status : c.vortex ? "Vortex Mobile" : c.video ? t("phVideo") : t("phCall")}
        </div>
        <div className={s.halo} style={{ width: 128, height: 128 }}>
          {(c.phase === "incoming" || c.phase === "ringing" || c.phase === "dialing") && (
            <>
              <i />
              <i />
              <i />
            </>
          )}
          {c.vortex ? (
            <VxFace size={128} mood={(c.vortex.mood as never) || "smug"} />
          ) : (
            <PFace avatar={main?.avatar ?? "{}"} name={name} size={128} />
          )}
        </div>
        <div className={cx(s.callNm, c.vortex && s.holoText)} style={c.vortex ? { letterSpacing: ".2em" } : undefined}>
          {name}
        </div>
        <div className={s.callWh} style={live ? { color: "var(--cya)" } : undefined} data-call-status>
          {c.phase === "incoming" ? (main?.space ?? "") : status}
        </div>
        {live && <Wave level={c.level} />}
        {c.vortex?.line && live && <div className={s.subt}>“{c.vortex.line}”</div>}

        {c.phase === "incoming" && !picking && (
          <>
            <div className={s.quick}>
              {!c.vortex && (
                <button type="button" onClick={() => setPicking("text")} data-nav>
                  <b>
                    <Ic n="chat" size={19} />
                  </b>
                  {t("phTextInstead")}
                </button>
              )}
              {!c.vortex && (
                <button
                  type="button"
                  data-nav
                  onClick={() => {
                    ph.remind(c.from, main?.name ?? "");
                    calls.decline();
                  }}
                >
                  <b>
                    <Ic n="clock" size={19} />
                  </b>
                  {t("phRemindMe")}
                </button>
              )}
            </div>
            <div className={s.btns}>
              <button
                type="button"
                className={s.cbtnWrap}
                onClick={() => (c.vortex ? ph.vortex.decline() : calls.decline())}
                data-nav
                data-call-decline
              >
                <span className={cx(s.cbtn, s.red)} style={{ width: 66, height: 66 }}>
                  <Ic n="end" size={32} fill />
                </span>
                {t("phDecline")}
              </button>
              <button
                type="button"
                className={s.cbtnWrap}
                onClick={() => (c.vortex ? ph.vortex.answer() : calls.answer())}
                data-nav
                data-call-answer
              >
                <span className={cx(s.cbtn, s.green)} style={{ width: 66, height: 66 }}>
                  <Ic n={c.video ? "video" : "phone"} size={28} />
                </span>
                {t("phAnswer")}
              </button>
            </div>
          </>
        )}
        {c.phase === "incoming" && picking === "text" && (
          <div className={cx(s.list, s.glass)} style={{ marginTop: "auto", width: "100%", marginBottom: 12 }}>
            {(["phBusyNow", "phOnMyWay", "phCantTalk"] as const).map((k) => (
              <button key={k} type="button" className={s.row} data-nav onClick={() => calls.decline(t(k))}>
                <Ic n="send" size={14} />
                <span className={s.sub} style={{ color: "inherit" }}>
                  {t(k)}
                </span>
              </button>
            ))}
            <button type="button" className={s.row} data-nav onClick={() => setPicking(null)}>
              <Ic n="back" size={14} />
              {t("phBack")}
            </button>
          </div>
        )}

        {(c.phase === "dialing" || c.phase === "ringing" || live) && !picking && (
          <>
            <div className={s.cgrid}>
              <button
                type="button"
                className={s.cbtnWrap}
                onClick={() => void calls.toggleMute()}
                data-nav
                aria-pressed={c.muted}
              >
                <span className={cx(s.cbtn, c.muted && s.onBtn)}>
                  <Ic n={c.muted ? "micOff" : "mic"} size={22} />
                </span>
                {t("phMuteMic")}
              </button>
              <button
                type="button"
                className={s.cbtnWrap}
                onClick={() => calls.toggleSpeaker()}
                data-nav
                aria-pressed={c.speaker}
              >
                <span className={cx(s.cbtn, c.speaker && s.onBtn)}>
                  <Ic n="speaker" size={22} />
                </span>
                {t("phSpeaker")}
              </button>
              {c.vortex ? (
                <button type="button" className={s.cbtnWrap} onClick={() => void ph.openThreadWith([0])} data-nav>
                  <span className={s.cbtn}>
                    <Ic n="chat" size={22} />
                  </span>
                  {t("phText")}
                </button>
              ) : (
                <button
                  type="button"
                  className={s.cbtnWrap}
                  onClick={() => void calls.toggleCam()}
                  data-nav
                  aria-pressed={c.camOn}
                >
                  <span className={cx(s.cbtn, c.camOn && s.onBtn)}>
                    <Ic n={c.camOn ? "video" : "videoOff"} size={22} />
                  </span>
                  {t("phCamOn")}
                </button>
              )}
              {!c.vortex && live && (
                <button type="button" className={s.cbtnWrap} onClick={() => setPicking("add")} data-nav>
                  <span className={s.cbtn}>
                    <Ic n="addPerson" size={22} />
                  </span>
                  {t("phAddPerson")}
                </button>
              )}
            </div>
            <button type="button" className={s.cbtnWrap} onClick={() => calls.hangup()} data-nav data-call-end>
              <span className={cx(s.cbtn, s.red)}>
                <Ic n="end" size={30} fill />
              </span>
            </button>
          </>
        )}
        {picking === "add" && (
          <div
            className={cx(s.list, s.glass)}
            style={{ marginTop: "auto", width: "100%", maxHeight: 220, overflowY: "auto", marginBottom: 12 }}
          >
            {contacts
              .filter((x) => x.online && x.uid !== 0 && !c.peers.some((p) => p.uid === x.uid && p.state !== "left"))
              .map((x) => (
                <button
                  key={x.uid}
                  type="button"
                  className={s.row}
                  data-nav
                  onClick={() => {
                    calls.add(x.uid);
                    setPicking(null);
                  }}
                >
                  <PFace avatar={x.avatar} name={x.name} size={30} status="on" />
                  <span className={s.nm}>{x.name}</span>
                </button>
              ))}
            <button type="button" className={s.row} data-nav onClick={() => setPicking(null)}>
              <Ic n="back" size={14} />
              {t("phBack")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Wave({ level }: { level: number }) {
  const bars = [0.3, 0.6, 0.9, 0.45, 0.75, 1, 0.55, 0.3, 0.7, 0.95, 0.5, 0.25, 0.6, 0.35];
  const [k, setK] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setK((n) => n + 1), 120);
    return () => clearInterval(i);
  }, []);
  return (
    <div className={s.wave} aria-hidden>
      {bars.map((b, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars
          key={i}
          style={{ height: 4 + 26 * level * b * (0.55 + 0.45 * Math.abs(Math.sin(k * 0.7 + i))) }}
        />
      ))}
    </div>
  );
}

// a video call: their camera full screen, mine in the corner
function VideoCall({ name, uid }: { name: string; uid: number }) {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const c = usePhone((p) => p.call);
  const [, bump] = useState(0);
  useEffect(() => ph?.calls.onVideos(() => bump((n) => n + 1)), [ph]);
  const theirs = ph?.calls.videoOf(uid) ?? null;
  const myCam = ph?.calls.myCamera() ?? null;
  if (!ph || !c) return null;
  return (
    <div style={{ position: "absolute", inset: 0 }} data-video-call>
      <VideoSlot el={theirs} className={s.far} />
      {!theirs && (
        <div
          className={s.far}
          style={{
            flexDirection: "column",
            gap: 10,
            background: "radial-gradient(80% 60% at 50% 40%,#5a2b7a,#1a0a2c)",
          }}
        >
          <PFace avatar={ph.avatarOf(uid)} name={name} size={140} />
          <span className={s.sub}>{t("phTheirCamera").replace("{name}", name.split(" ")[0] ?? "")}</span>
        </div>
      )}
      <div className={s.vname}>
        <div className={s.nm} style={{ fontSize: 18 }}>
          {name}
        </div>
        <div className={s.sub} style={{ color: "var(--cya)" }}>
          {t("phVideo").toLowerCase()} · {secs(Math.floor((Date.now() - c.startedAt) / 1000))}
        </div>
      </div>
      <div className={s.pip}>
        {myCam ? (
          <VideoSlot el={myCam} className={s.pipVideo} />
        ) : (
          <PFace avatar={ph.avatarOf(ph.ctl.myUid())} name="" size={64} />
        )}
      </div>
      <div className={s.vbar}>
        <button
          type="button"
          className={cx(s.cbtn, c.muted && s.onBtn)}
          onClick={() => void ph.calls.toggleMute()}
          aria-label={t("phMuteMic")}
          data-nav
        >
          <Ic n={c.muted ? "micOff" : "mic"} size={21} />
        </button>
        <button
          type="button"
          className={cx(s.cbtn, c.camOn && s.onBtn)}
          onClick={() => void ph.calls.toggleCam()}
          aria-label={t("phCamOn")}
          data-nav
        >
          <Ic n={c.camOn ? "video" : "videoOff"} size={21} />
        </button>
        <button
          type="button"
          className={cx(s.cbtn, c.speaker && s.onBtn)}
          onClick={() => ph.calls.toggleSpeaker()}
          aria-label={t("phSpeaker")}
          data-nav
        >
          <Ic n="speaker" size={21} />
        </button>
        <button
          type="button"
          className={cx(s.cbtn, s.red)}
          onClick={() => ph.calls.hangup()}
          aria-label={t("phEnd")}
          data-nav
          data-call-end
        >
          <Ic n="end" size={26} fill />
        </button>
      </div>
    </div>
  );
}

// A live <video> from LiveKit, in a box React never fills (React mustn't own
// what's moved in and out of it).
function VideoSlot({ el, className }: { el: HTMLVideoElement | null; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    if (el && el.parentElement !== b) b.replaceChildren(el);
    if (!el) b.replaceChildren();
    void el?.play().catch(() => {});
  }, [el]);
  return <div ref={box} className={className} />;
}
