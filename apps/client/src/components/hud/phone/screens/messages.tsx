"use client";

import { EMOTES } from "@yutopia/shared";
import { GROUP_MAX, MAX_TEXT, preview } from "@yutopia/shared/phone";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { emoteUrl } from "@/world/art/emotes";
import type { Msg, Thread as ThreadT } from "@/world/phone/store";
import { usePhone } from "@/world/phone/store";
import { useHud } from "@/world/store";
import { useWorld } from "../../ctx";
import s from "../phone.module.css";
import { cx, dayLabel, Head, hhmm, Ic, PFace, secs, Thumb, VxFace, Wallpaper, when } from "../ui";

// Messages: threads (1:1, groups, the space's #thread, Vortex), a thread with
// its bubbles, and starting a new one. Yondra keeps them (world/phone/data.ts).

function useThreadLabel() {
  const w = useWorld();
  const t = useTr();
  return (th: ThreadT) => {
    const ph = w?.phone;
    if (!ph) return "";
    if (th.kind === "space") return `# ${th.name}`;
    return ph.threadName(th) || t("phMessage");
  };
}

function lastLine(th: ThreadT, me: number, nameOf: (u: number | null) => string, t: (k: Key) => string): string {
  const m = th.last;
  if (!m) return th.kind === "space" ? t("phSpaceThread").replace("{space}", th.name) : "";
  const who =
    m.from === me
      ? `${t("phYou")}: `
      : th.kind === "group" || th.kind === "space"
        ? `${nameOf(m.from).split(" ")[0]}: `
        : "";
  if (m.kind === "photo") return `${who}${t("phPhoto")}`;
  if (m.kind === "call")
    return t(m.call?.end === "missed" && m.from !== me ? (m.call.video ? "phMissedVideo" : "phMissed") : "phCallEnded");
  return `${who}${preview(m.body, 48)}`;
}

export function ThreadIcon({ th, size = 38 }: { th: ThreadT; size?: number }) {
  const w = useWorld();
  const ph = w?.phone;
  if (th.kind === "vortex") return <VxFace size={size} mood="sideeye" />;
  if (th.kind === "space")
    return (
      <span className={s.grp} style={{ width: size, height: size }}>
        #
      </span>
    );
  if (th.kind === "group")
    return (
      <span className={s.stack} style={{ width: size, height: size }}>
        <span style={{ left: 0, top: 0 }}>
          <PFace avatar={ph?.avatarOf(th.members[0] ?? 0) ?? "{}"} name="" size={size * 0.68} />
        </span>
        <span style={{ left: size * 0.32, top: size * 0.32 }}>
          <PFace avatar={ph?.avatarOf(th.members[1] ?? 0) ?? "{}"} name="" size={size * 0.68} />
        </span>
      </span>
    );
  const uid = th.members[0] ?? 0;
  const c = ph?.contact(uid);
  return (
    <PFace
      avatar={ph?.avatarOf(uid) ?? "{}"}
      name={ph?.nameOf(uid) ?? ""}
      size={size}
      status={c?.online ? "on" : "off"}
    />
  );
}

export function Messages() {
  const t = useTr();
  const w = useWorld();
  const threads = usePhone((p) => p.threads);
  const loaded = usePhone((p) => p.threadsLoaded);
  const me = usePhone((p) => p.me.uid);
  const wp = usePhone((p) => p.settings.wallpaper);
  const [q, setQ] = useState("");
  const label = useThreadLabel();
  const ph = w?.phone;
  useEffect(() => {
    void ph?.loadThreads();
  }, [ph]);
  if (!ph) return null;
  const list = threads.filter((th) => !q || label(th).toLowerCase().includes(q.toLowerCase()));
  // the space's thread first, then by the last message
  list.sort((a, b) => (a.kind === "space" ? -1 : b.kind === "space" ? 1 : (b.last?.at ?? 0) - (a.last?.at ?? 0)));
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title={t("app_messages")} ph={ph}>
          <button
            type="button"
            className={s.act}
            data-nav
            onClick={() => ph.go({ app: "messages", view: "new" })}
            aria-label={t("phNewMessage")}
          >
            <Ic n="edit" size={15} w={2.2} />
          </button>
        </Head>
        <label className={s.srch}>
          <Ic n="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("phSearch")} data-nav />
        </label>
        <div className={s.scroll}>
          {!loaded && <p className={s.empty}>{t("phLoading")}</p>}
          {loaded && !list.length && <p className={s.empty}>{t("phNoThreads")}</p>}
          {list.length > 0 && (
            <div className={cx(s.list, s.glass)}>
              {list.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  className={s.row}
                  data-nav
                  onClick={() => ph.openThread(th.id)}
                  data-thread={th.id}
                >
                  <ThreadIcon th={th} />
                  <div className={s.col}>
                    <div className={s.nm}>{label(th)}</div>
                    <div
                      className={cx(s.sub, th.unread > 0 && th.last?.kind === "call" && s.subMissed)}
                      style={th.unread ? { color: "#fff" } : undefined}
                    >
                      {lastLine(th, me, (u) => ph.nameOf(u), t)}
                    </div>
                  </div>
                  <div className={s.tm}>
                    {th.last ? when(th.last.at) : ""}
                    {th.unread > 0 && !th.muted && <span className={s.cnt}>{th.unread}</span>}
                    {th.muted && <Ic n="bellOff" size={12} />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── one thread ─────────────────────────────────────────────────────────────
export function Thread({ id }: { id: number }) {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const th = usePhone((p) => p.threads.find((x) => x.id === id) ?? null);
  const msgs = usePhone((p) => p.msgs[id]);
  const more = usePhone((p) => p.more[id] ?? false);
  const me = usePhone((p) => p.me.uid);
  const typing = usePhone((p) => p.typing[id]);
  const vxTyping = usePhone((p) => p.vortexTyping);
  const wp = usePhone((p) => p.settings.wallpaper);
  const people = useHud((h) => h.people);
  const contacts = usePhone((p) => p.contacts);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Msg | null>(null);
  const [reacting, setReacting] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const label = useThreadLabel();

  useEffect(() => {
    if (ph && !msgs) void ph.loadMessages(id);
  }, [ph, id, msgs]);
  // read what's on screen
  // biome-ignore lint/correctness/useExhaustiveDependencies: when new ones arrive
  useEffect(() => {
    ph?.markRead(id);
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs?.length, ph, id]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1500);
    return () => clearInterval(i);
  }, []);

  const byId = useMemo(() => new Map((msgs ?? []).map((m) => [m.id, m])), [msgs]);
  if (!ph || !th) return null;
  const vortex = th.kind === "vortex";
  const other = th.kind === "direct" ? th.members[0] : null;
  const contact = other ? (contacts.find((c) => c.uid === other) ?? null) : null;
  const stranger = th.kind === "direct" && !!other && !contact;
  const inRoom = other ? people.find((p) => p.uid === other) : null;
  const where = vortex
    ? t("phVortexWhere")
    : th.kind === "direct"
      ? stranger
        ? t("phNotContact")
        : contact?.online
          ? [contact.area, contact.here ? null : contact.space].filter(Boolean).join(" · ") || "Yutopia"
          : t("phOfflineNow")
      : t("phMembers").replace("{n}", String(th.members.length + 1));
  const lastMine = [...(msgs ?? [])].reverse().find((m) => m.from === me && m.id > 0);
  const readBy = lastMine
    ? Object.entries(th.readAt).filter(([u, upto]) => Number(u) !== me && upto >= lastMine.id).length
    : 0;
  const send = () => {
    const v = text.trim();
    if (!v) return;
    void ph.send(id, v, { replyTo: reply?.id ?? null });
    setText("");
    setReply(null);
  };
  let lastDay = "";
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content} style={{ paddingTop: 42 }}>
        <div className={s.thHead}>
          <button type="button" className={s.round} onClick={() => ph.back()} aria-label={t("phBack")} data-nav>
            <Ic n="back" size={16} />
          </button>
          <ThreadIcon th={th} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={s.nm}>{label(th)}</div>
            <div className={cx(s.sub, (contact?.online || inRoom) && s.subLive)} style={{ fontSize: 11 }}>
              {where}
            </div>
          </div>
          {stranger && other && (
            <button
              type="button"
              className={s.act}
              data-nav
              aria-label={t("phAddToContacts")}
              title={t("phAddToContacts")}
              onClick={() => void ph.addContact(other)}
            >
              <Ic n="addPerson" size={15} w={2.1} />
            </button>
          )}
          {(th.kind === "direct" || vortex) && (
            <button
              type="button"
              className={s.round}
              data-nav
              aria-label={t("phCall")}
              onClick={() => ph.calls.start([other ?? 0])}
            >
              <Ic n="phone" size={16} />
            </button>
          )}
          {th.kind === "direct" && (
            <button
              type="button"
              className={s.round}
              data-nav
              aria-label={t("phVideo")}
              onClick={() => ph.calls.start([other ?? 0], true)}
            >
              <Ic n="video" size={16} />
            </button>
          )}
          {(th.kind === "group" || th.kind === "space") && (
            <button
              type="button"
              className={s.round}
              data-nav
              aria-label={th.muted ? t("phUnmute") : t("phMute")}
              onClick={() => {
                void ph.setMuted(th.id, !th.muted);
              }}
            >
              <Ic n={th.muted ? "bellOff" : "bell"} size={16} />
            </button>
          )}
        </div>
        <div className={s.msgs} ref={list} data-msgs>
          {more && (
            <button type="button" className={s.callLine} onClick={() => void ph.loadMessages(id, true)} data-nav>
              {t("phOlder")}
            </button>
          )}
          {msgs && !msgs.length && <p className={s.empty}>{t("phNoMsgs")}</p>}
          {(msgs ?? []).map((m) => {
            const day = dayLabel(m.at);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.from === me;
            const showWho = !mine && (th.kind === "group" || th.kind === "space");
            const quoted = m.replyTo ? byId.get(m.replyTo) : null;
            return (
              <Fragment key={m.id}>
                {showDay && <div className={s.day}>{day}</div>}
                {m.kind === "call" ? (
                  <div className={s.callLine}>
                    <Ic n={m.call?.video ? "video" : "phone"} size={13} />
                    {m.call?.end === "answered"
                      ? `${t(m.call.from === me ? "phOutgoing" : "phIncoming")} · ${secs(m.call.secs)}`
                      : m.call?.from === me
                        ? t("phNoAnswer")
                        : t(m.call?.video ? "phMissedVideo" : "phMissed")}
                    <span style={{ opacity: 0.7 }}>· {hhmm(m.at)}</span>
                  </div>
                ) : (
                  <>
                    {showWho && <div className={s.who}>{ph.nameOf(m.from)}</div>}
                    {m.kind === "photo" && m.photo ? (
                      <button
                        type="button"
                        className={s.photoBub}
                        style={{ alignSelf: mine ? "flex-end" : "flex-start" }}
                        onClick={() => m.photo && ph.viewPhoto(m.photo)}
                        data-nav
                        data-photo-msg={m.id}
                      >
                        <Thumb p={m.photo} />
                        {m.body && (
                          <div style={{ padding: "7px 10px", font: "12.5px var(--font-body)", textAlign: "left" }}>
                            {m.body}
                          </div>
                        )}
                      </button>
                    ) : (
                      // biome-ignore lint/a11y/useSemanticElements: a bubble of text (tap: react, or retry)
                      <div
                        className={cx(
                          s.bub,
                          vortex && !mine ? s.vx : mine ? s.out : s.in,
                          m.pending && s.pending,
                          m.failed && s.failed,
                        )}
                        onClick={() => (m.failed ? ph.retry(m) : setReacting(reacting === m.id ? null : m.id))}
                        onKeyDown={() => {}}
                        role="button"
                        tabIndex={-1}
                        data-msg={m.id}
                      >
                        {quoted && (
                          <div
                            style={{
                              fontSize: 11,
                              opacity: 0.75,
                              borderLeft: "2px solid currentColor",
                              paddingLeft: 6,
                              marginBottom: 4,
                            }}
                          >
                            {ph.nameOf(quoted.from)}: {preview(quoted.body || t("phPhoto"), 40)}
                          </div>
                        )}
                        {m.body}
                      </div>
                    )}
                    {m.failed && (
                      <div className={s.meta} style={{ color: "#ff6b86" }}>
                        {t("phFailed")}
                      </div>
                    )}
                    {Object.keys(m.reactions).some((e) => (m.reactions[e]?.length ?? 0) > 0) && (
                      <div className={s.reacts} style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
                        {Object.entries(m.reactions)
                          .filter(([, us]) => us.length)
                          .map(([e, us]) => (
                            <button
                              key={e}
                              type="button"
                              className={cx(us.includes(me) && s.mine)}
                              onClick={() => void ph.react(m, e)}
                            >
                              {/* biome-ignore lint/performance/noImgElement: drawn emote */}
                              <img alt={e} src={emoteUrl(e as never)} />
                              {us.length}
                            </button>
                          ))}
                      </div>
                    )}
                    {reacting === m.id && !m.pending && !vortex && (
                      <div className={s.reactBar} style={{ alignSelf: mine ? "flex-end" : "flex-start" }}>
                        {EMOTES.map((e) => (
                          <button
                            key={e}
                            type="button"
                            aria-label={e}
                            onClick={() => {
                              void ph.react(m, e);
                              setReacting(null);
                            }}
                          >
                            {/* biome-ignore lint/performance/noImgElement: drawn emote */}
                            <img alt="" src={emoteUrl(e)} />
                          </button>
                        ))}
                        <button
                          type="button"
                          aria-label={t("phReply")}
                          onClick={() => {
                            setReply(m);
                            setReacting(null);
                            input.current?.focus();
                          }}
                          style={{ color: "#fff" }}
                        >
                          <Ic n="reply" size={18} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </Fragment>
            );
          })}
          {lastMine && msgs?.[msgs.length - 1]?.id === lastMine.id && (
            <div className={s.meta}>
              {hhmm(lastMine.at)} <span className={s.tick}>{readBy ? "✓✓" : "✓"}</span> {readBy ? t("phRead") : ""}
            </div>
          )}
          {((typing && typing.until > now) || (vortex && vxTyping)) && (
            <div className={s.typing} title={t("phTyping")}>
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        {reply && (
          <div className={s.replying}>
            <Ic n="reply" size={13} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t("phReplyTo").replace("{name}", ph.nameOf(reply.from))}: {preview(reply.body, 30)}
            </span>
            <button
              type="button"
              className={s.round}
              style={{ width: 22, height: 22 }}
              onClick={() => setReply(null)}
              aria-label={t("phBack")}
            >
              ×
            </button>
          </div>
        )}
        <form
          className={s.comp}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {!vortex && (
            <button
              type="button"
              className={s.round}
              data-nav
              aria-label={t("app_gallery")}
              onClick={() => ph.go({ app: "gallery", view: "send", arg: `thread:${id}` })}
            >
              <Ic n="camera" size={16} />
            </button>
          )}
          <input
            ref={input}
            value={text}
            maxLength={MAX_TEXT}
            placeholder={t("phMessage")}
            aria-label={t("phMessage")}
            data-nav
            data-composer
            onChange={(e) => {
              setText(e.target.value);
              ph.typing(id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Backspace" && !text) {
                (e.target as HTMLInputElement).blur();
              }
              e.stopPropagation();
            }}
          />
          <button type="submit" className={s.send} disabled={!text.trim()} aria-label={t("phSend")} data-nav>
            <Ic n="send" size={16} />
          </button>
        </form>
      </div>
    </>
  );
}

// ── a new message (one person) or a group ─────────────────────────────────
export function NewThread({ group }: { group: boolean }) {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const contacts = usePhone((p) => p.contacts);
  const wp = usePhone((p) => p.settings.wallpaper);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [name, setName] = useState("");
  useEffect(() => {
    void ph?.loadContacts(true);
  }, [ph]);
  if (!ph) return null;
  const list = contacts.filter((c) => c.uid !== 0 && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title={group ? t("phNewGroup") : t("phNewMessage")} ph={ph}>
          {!group && (
            <button
              type="button"
              className={s.round}
              data-nav
              aria-label={t("phNewGroup")}
              onClick={() => ph.go({ app: "messages", view: "new", arg: "group" })}
            >
              <Ic n="people" size={16} />
            </button>
          )}
        </Head>
        {group && (
          <label className={s.srch}>
            <Ic n="edit" size={14} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("phGroupName")}
              maxLength={40}
              data-nav
            />
          </label>
        )}
        <label className={s.srch}>
          <span style={{ fontSize: 12, color: "var(--mute)" }}>{t("phTo")}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("phSearchTeam")} data-nav />
        </label>
        <div className={s.scroll}>
          <div className={cx(s.list, s.glass)}>
            {!group && (
              <button type="button" className={s.row} data-nav onClick={() => void ph.openThreadWith([0])}>
                <VxFace size={34} />
                <div className={s.col}>
                  <div className={s.nm}>Vortex</div>
                  <div className={s.sub}>{t("phVortexWhere")}</div>
                </div>
              </button>
            )}
            {list.map((c) => {
              const on = picked.includes(c.uid);
              return (
                <button
                  key={c.uid}
                  type="button"
                  className={s.row}
                  data-nav
                  onClick={() =>
                    group
                      ? setPicked(on ? picked.filter((u) => u !== c.uid) : [...picked, c.uid].slice(0, GROUP_MAX - 1))
                      : void ph.openThreadWith([c.uid])
                  }
                >
                  <PFace avatar={c.avatar} name={c.name} size={34} status={c.online ? "on" : "off"} />
                  <div className={s.col}>
                    <div className={s.nm}>{c.name}</div>
                    <div className={s.sub}>{c.online ? (c.area ?? c.space ?? "") : t("phOfflineNow")}</div>
                  </div>
                  {group &&
                    (on ? (
                      <span className={s.check}>
                        <Ic n="check" size={18} w={2.4} />
                      </span>
                    ) : null)}
                </button>
              );
            })}
          </div>
        </div>
        {group && (
          <button
            type="button"
            className={s.get}
            style={{ margin: "8px auto 0", padding: "9px 22px", background: "var(--holo)" }}
            disabled={picked.length < 2}
            data-nav
            onClick={() => void ph.openThreadWith(picked, name.trim() || undefined)}
          >
            {t("phCreate")} ({picked.length})
          </button>
        )}
      </div>
    </>
  );
}
