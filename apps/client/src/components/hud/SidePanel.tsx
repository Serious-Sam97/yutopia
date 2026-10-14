"use client";

import { type ChatScope, EMOTES, type Emote, entry, isPrivate, MAX_CHAT } from "@yutopia/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { emoteUrl } from "@/world/art/emotes";
import { vortexSvg } from "@/world/art/vortex/vortexArt";
import { type ChatMsg, hud, type Person, type SideTab, useHud } from "@/world/store";
import { ItemThumb } from "./build/thumbs";
import { useWorld } from "./ctx";
import { Face, STATUS_COLOR } from "./Face";
import { Icon, type IconName } from "./icons";

const TABS: { key: SideTab; label: Key; icon: IconName }[] = [
  { key: "chat", label: "chat", icon: "chat" },
  { key: "people", label: "people", icon: "people" },
  { key: "room", label: "room", icon: "home" },
];
// reactions offered on a message (all eight are in the composer as emotes)
const REACT: Emote[] = ["heart", "laugh", "clap", "fire", "question"];
const VORTEX_FACE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(vortexSvg("curious", "chatface"))}`;

// The right-hand panel: Chat, People and Room as tabs of one drawer. It grows
// with what's in it and always stays above the dock.
export function SidePanel() {
  const t = useTr();
  const side = useHud((s) => s.side);
  const unread = useHud((s) => s.chatUnread);
  const count = useHud((s) => s.people.filter((p) => !p.bot).length + 1);
  if (!side) return null;
  return (
    <aside
      aria-label={t(TABS.find((x) => x.key === side)?.label ?? "chat")}
      className="pointer-events-auto cabinet absolute left-3 right-3 sm:left-auto top-[78px] sm:w-[372px] flex flex-col overflow-hidden rise"
      style={{ maxHeight: "calc(100vh - 78px - 96px)" }}
    >
      <div className="flex gap-1 p-2 shrink-0" role="tablist" style={{ borderBottom: "1px solid rgba(120,86,58,.5)" }}>
        {TABS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={side === x.key}
            onClick={() => hud.set({ side: x.key, ...(x.key === "chat" ? { chatUnread: 0 } : {}) })}
            className="flex-1 h-[34px] rounded-lg flex items-center justify-center gap-1.5 mono text-xs uppercase tracking-wide"
            style={
              side === x.key
                ? {
                    background: "rgba(255,179,92,.14)",
                    color: "var(--vfd)",
                    boxShadow: "inset 0 0 0 1px rgba(255,179,92,.35)",
                  }
                : { color: "var(--cream-dim)" }
            }
          >
            <Icon name={x.icon} size={16} />
            {t(x.label)}
            {x.key === "people" && <span style={{ color: "var(--muted)" }}>{count}</span>}
            {x.key === "chat" && unread > 0 && side !== "chat" && (
              <span
                className="rounded-full px-1.5 text-[10px] font-semibold"
                style={{ background: "var(--rust)", color: "var(--cream)" }}
              >
                {unread}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="w-[34px] h-[34px] rounded-lg grid place-items-center hover:bg-white/5"
          style={{ color: "var(--cream-dim)" }}
          onClick={() => hud.set({ side: null })}
          aria-label={t("close")}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {side === "chat" && <ChatTab />}
      {side === "people" && <PeopleTab />}
      {side === "room" && <RoomTab />}
    </aside>
  );
}

// "Bia and Caio", "Bia, Caio and 3 others"
function names(list: string[], t: (k: Key) => string): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} ${t("and")} ${list[1]}`;
  return `${list[0]}, ${list[1]} ${t("and")} ${t("nOthers").replace("{n}", String(list.length - 2))}`;
}

// Who hears me right now (the world-server's hearing, not a guess).
function useEarshot() {
  const heardBy = useHud((s) => s.heardBy);
  const people = useHud((s) => s.people);
  const area = useHud((s) => s.me?.area ?? "");
  const w = useWorld();
  const room = w?.map.areas.find((a) => a.key === area) ?? null;
  const set = new Set(heardBy);
  const listeners = people.filter((p) => !p.bot && set.has(p.uid));
  return { listeners, stage: room?.kind === "stage", private: isPrivate(room), roomName: room?.name ?? "" };
}

function Earshot() {
  const t = useTr();
  const { listeners, stage, private: priv, roomName } = useEarshot();
  const text = stage
    ? t("earStage")
    : listeners.length
      ? t(listeners.length === 1 ? "earOne" : "earSome").replace(
          "{who}",
          names(
            listeners.map((p) => p.name),
            t,
          ),
        )
      : t("earNone");
  const hint = stage
    ? ""
    : priv
      ? t("earPrivate").replace("{room}", roomName)
      : listeners.length
        ? t("earMore")
        : t("earWalk");
  return (
    <div className="mx-3 mt-2.5 well flex items-center gap-2.5 px-2.5 py-2">
      <span style={{ color: listeners.length || stage ? "var(--vfd)" : "var(--muted)" }}>
        <Icon name="ear" size={18} />
      </span>
      {listeners.length > 0 && (
        <span className="flex">
          {listeners.slice(0, 3).map((p, i) => (
            <span key={p.sid} style={{ marginLeft: i ? -7 : 0 }}>
              <Face avatar={p.avatar} name={p.name} size={24} />
            </span>
          ))}
        </span>
      )}
      <p className="text-xs leading-snug" style={{ color: "var(--cream-dim)" }}>
        <span style={{ color: "var(--cream)" }}>{text}</span>
        {hint && (
          <>
            <br />
            {hint}
          </>
        )}
      </p>
    </div>
  );
}

function ChatTab() {
  const t = useTr();
  const w = useWorld();
  const chat = useHud((s) => s.chat);
  const people = useHud((s) => s.people);
  const me = useHud((s) => s.me);
  const myUid = me?.uid ?? 0;
  const { listeners } = useEarshot();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<ChatScope>("nearby");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const bySid = useMemo(() => new Map([...people, ...(me ? [me] : [])].map((p) => [p.sid, p])), [people, me]);

  useEffect(() => {
    setTimeout(() => input.current?.focus(), 20);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages arrive
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.length]);

  const placeholder =
    scope === "nearby"
      ? listeners.length
        ? t("sayTo").replace(
            "{who}",
            names(
              listeners.map((p) => p.name.split(" ")[0]),
              t,
            ),
          )
        : t("sayNearby")
      : scope === "area"
        ? t("sayArea")
        : t("saySpace");

  return (
    <>
      <Earshot />
      <div className="flex gap-1.5 px-3 pt-2.5 pb-1 shrink-0">
        {(["nearby", "area", "space"] as const).map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={scope === s} onClick={() => setScope(s)}>
            {t(s)}
          </button>
        ))}
      </div>
      <div
        ref={list}
        className="flex-1 min-h-[90px] overflow-y-auto scroll-thin px-3 py-2 space-y-3"
        aria-live="polite"
      >
        {chat.length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
            {t("noMessages")}
          </p>
        )}
        {chat.map((m) => (
          <Message key={m.id} m={m} from={bySid.get(m.from)} myUid={myUid} />
        ))}
      </div>
      <form
        className="mx-3 mb-3 mt-1 rounded-xl shrink-0 focus-within:shadow-[0_0_0_3px_rgba(255,166,48,.14)]"
        style={{ background: "#140e0a", border: "1px solid var(--amber)" }}
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          w?.chat(v, scope);
          setText("");
        }}
      >
        <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5">
          <input
            ref={input}
            className="flex-1 min-w-0 bg-transparent !outline-none text-sm py-1.5"
            style={{ color: "var(--cream)" }}
            maxLength={MAX_CHAT}
            value={text}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                hud.set({ side: null });
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <button
            type="submit"
            className="w-[34px] h-[34px] rounded-[9px] grid place-items-center shrink-0"
            style={{
              background: "linear-gradient(180deg,#ffc274,#e8952d)",
              color: "var(--ink)",
              boxShadow: "0 2px 0 #9a5c17",
            }}
            aria-label={t("send")}
          >
            <Icon name="send" size={16} />
          </button>
        </div>
        <div
          className="flex items-center gap-0.5 px-1.5 pb-1.5 pt-1"
          style={{ borderTop: "1px solid rgba(120,86,58,.35)" }}
        >
          {EMOTES.map((e, i) => (
            <button
              key={e}
              type="button"
              className="w-8 h-8 rounded-md p-0.5 hover:bg-white/10"
              title={`${e} (${i + 1})`}
              aria-label={e}
              onClick={() => w?.emote(i)}
            >
              {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
              <img alt="" src={emoteUrl(e)} className="w-full h-full" draggable={false} />
            </button>
          ))}
          <span className="ml-auto mono text-[10.5px] pr-1" style={{ color: "var(--muted)" }}>
            1–8
          </span>
        </div>
      </form>
    </>
  );
}

function Message({ m, from, myUid }: { m: ChatMsg; from: Person | undefined; myUid: number }) {
  const t = useTr();
  const w = useWorld();
  const time = new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const reactions = Object.entries(m.reactions ?? {}) as [Emote, number[]][];
  const canReact = !m.vortex;
  const bubble = m.vortex
    ? { background: "#1a0f0c", color: "#ffb35c", border: "1px solid #6b2a1e" }
    : m.mine
      ? { background: "rgba(255,179,92,.12)", border: "1px solid rgba(255,179,92,.3)" }
      : undefined;
  return (
    <div className={`group flex gap-2.5 ${m.mine ? "flex-row-reverse text-right" : ""}`}>
      {!m.mine &&
        (m.vortex ? (
          // biome-ignore lint/performance/noImgElement: inline SVG data URL
          <img alt="" src={VORTEX_FACE} className="w-7 h-7 shrink-0" draggable={false} />
        ) : (
          <Face avatar={from?.avatar ?? ""} name={m.fromName} size={28} />
        ))}
      <div className={`min-w-0 ${m.mine ? "flex flex-col items-end" : ""}`}>
        {!m.mine && (
          <p className="text-xs font-semibold">
            <span style={{ color: m.vortex ? "#ff6a4d" : "var(--cream)" }}>{m.fromName}</span>
            <span className="font-normal ml-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
              {time}
              {m.scope !== "nearby" && ` · ${t(m.scope)}`}
            </span>
          </p>
        )}
        <p
          className={`text-[13px] leading-snug break-words mt-0.5 ${bubble ? "inline-block px-2.5 py-1.5 rounded-[10px] text-left" : ""}`}
          style={bubble ?? { color: "#e6dbc2" }}
        >
          {m.text}
        </p>
        {(reactions.length > 0 || canReact) && (
          <div className={`flex flex-wrap items-center gap-1 mt-1 ${m.mine ? "justify-end" : ""}`}>
            {reactions.map(([e, uids]) => {
              const mine = uids.includes(myUid);
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => w?.react(m.id, e)}
                  aria-pressed={mine}
                  aria-label={`${e} ${uids.length}`}
                  className="flex items-center gap-0.5 rounded-full pl-0.5 pr-2 py-[1px] mono text-[11px]"
                  style={{
                    background: mine ? "rgba(255,179,92,.16)" : "#2a1c13",
                    border: `1px solid ${mine ? "rgba(255,179,92,.5)" : "var(--edge)"}`,
                    color: mine ? "var(--vfd)" : "var(--cream-dim)",
                  }}
                >
                  {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
                  <img alt="" src={emoteUrl(e)} className="w-5 h-5" draggable={false} />
                  {uids.length}
                </button>
              );
            })}
            {canReact && (
              <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {REACT.filter((e) => !m.reactions?.[e]).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => w?.react(m.id, e)}
                    className="w-6 h-6 rounded-md p-[1px] hover:bg-white/10"
                    aria-label={`${t("react")}: ${e}`}
                    title={`${t("react")}: ${e}`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
                    <img alt="" src={emoteUrl(e)} className="w-full h-full" draggable={false} />
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PeopleTab() {
  const t = useTr();
  const w = useWorld();
  const me = useHud((s) => s.me);
  const people = useHud((s) => s.people);
  const status = useHud((s) => s.status);
  const following = useHud((s) => s.following);
  const heardBy = useHud((s) => s.heardBy);
  const rows = people.filter((p) => !p.bot);
  const bots = people.length - rows.length;

  const row = (p: Person, mine = false) => {
    const doing = status[p.uid] ?? [];
    const hears = heardBy.includes(p.uid);
    return (
      <li
        key={p.sid}
        className="rounded-[10px] p-2"
        style={{ background: p.hearing ? "rgba(255,166,48,0.07)" : "transparent" }}
      >
        <div className="flex items-center gap-2.5">
          <Face
            avatar={p.avatar}
            name={p.name}
            size={34}
            status={p.status}
            ring={p.speaking ? "rgba(255,166,48,.8)" : undefined}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium truncate">
              {p.name}
              {mine && <span style={{ color: "var(--muted)" }}> ({t("you")})</span>}
            </p>
            <p className="mono text-[10.5px] uppercase truncate" style={{ color: "var(--muted)" }}>
              {p.areaName || "—"}
              {p.status !== "online" && (
                <span style={{ color: STATUS_COLOR[p.status] }}> · {p.status === "dnd" ? t("focus") : t("away")}</span>
              )}
              {hears && !mine && <span style={{ color: "var(--vfd)" }}> · {t("hearsYou")}</span>}
            </p>
          </div>
          <span className="flex gap-1 shrink-0" style={{ color: "var(--cream-dim)" }}>
            {p.mic ? <Icon name="mic" size={14} /> : <Icon name="micOff" size={14} className="opacity-40" />}
            {p.cam && <Icon name="cam" size={14} />}
            {p.screen && <Icon name="screen" size={14} />}
          </span>
        </div>
        {doing.length > 0 && (
          <ul className="mt-1.5 ml-11 space-y-0.5">
            {doing.slice(0, 2).map((c) => (
              <li key={c.id} className="text-xs truncate" style={{ color: c.blocked ? "#ff8a66" : "var(--vfd)" }}>
                ▸ <span className="mono">{c.ticket}</span> {c.name}
              </li>
            ))}
          </ul>
        )}
        {!mine && (
          <div className="flex gap-1.5 mt-1.5 ml-11">
            <button type="button" className="ghost-btn" onClick={() => w?.teleport({ userId: p.uid })}>
              {t("goTo")}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => hud.set({ following: following === p.uid ? null : p.uid })}
            >
              {following === p.uid ? t("unfollow") : t("follow")}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <div className="px-3 pt-2.5 flex gap-2 shrink-0">
        <button type="button" className="ghost-btn flex items-center gap-1.5" onClick={() => w?.teleport("desk")}>
          <Icon name="desk" size={15} />
          {t("myDesk")}
        </button>
        <button type="button" className="ghost-btn flex items-center gap-1.5" onClick={() => w?.pickArrival(true)}>
          <Icon name="pin" size={15} />
          {t("myArrival")}
        </button>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto scroll-thin p-2 space-y-0.5">
        {me && row(me, true)}
        {rows.map((p) => row(p))}
        {bots > 0 && (
          <li className="mono text-[11px] px-2" style={{ color: "var(--muted)" }}>
            + {bots} bots
          </li>
        )}
      </ul>
    </>
  );
}

const KIND_HINT: Record<string, Key> = {
  open: "roomOpen",
  private: "roomPrivate",
  booth: "roomBooth",
  standup: "roomStandup",
  stage: "roomStage",
};

// The room you're in: what kind of room it is, who's here, what's in it.
function RoomTab() {
  const t = useTr();
  const w = useWorld();
  const me = useHud((s) => s.me);
  const people = useHud((s) => s.people);
  const lockedBy = useHud((s) => s.locks[s.me?.area ?? ""]);
  useHud((s) => s.objectsVersion);
  const area = w?.map.areas.find((a) => a.key === me?.area) ?? null;
  if (!area || !me)
    return (
      <p className="text-sm p-4" style={{ color: "var(--muted)" }}>
        {t("roomNone")}
      </p>
    );
  const here = [me, ...people.filter((p) => !p.bot && p.area === area.key)];
  const inside = (o: { x: number; y: number }) =>
    o.x >= area.x && o.x < area.x + area.w && o.y >= area.y && o.y < area.y + area.h;
  const things = (w?.engine?.allObjects() ?? [])
    .filter((o) => entry(o.kind).interact && o.kind !== "door" && inside(o))
    .slice(0, 8);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-thin p-3 space-y-3">
      <div className="vfd-window px-3 py-2">
        <p className="lcd text-2xl leading-none">{area.name.toUpperCase()}</p>
        <p className="mono text-[11px] mt-1" style={{ color: "var(--cream-dim)" }}>
          {t(KIND_HINT[area.kind] ?? "roomOpen")}
          {lockedBy && ` · ${t("buildLocked")}`}
        </p>
      </div>
      {area.ownerName && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {t("roomOwner").replace("{name}", area.ownerName)}
        </p>
      )}
      <section className="space-y-1.5">
        <h3 className="grp">{t("hereCount").replace("{n}", String(here.length))}</h3>
        <div className="flex flex-wrap gap-1.5">
          {here.map((p) => (
            <span
              key={p.sid}
              className="flex items-center gap-1.5 rounded-full pl-0.5 pr-2.5 py-0.5 text-xs"
              style={{ background: "#2a1c13", border: "1px solid var(--edge)" }}
            >
              <Face avatar={p.avatar} name={p.name} size={22} status={p.status} />
              {p.sid === me.sid ? t("you") : p.name.split(" ")[0]}
            </span>
          ))}
        </div>
      </section>
      {things.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="grp">{t("roomThings")}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {things.map((o) => (
              <button
                key={o.id}
                type="button"
                className="well flex items-center gap-2 p-1.5 text-left hover:border-[#8a6440]"
                onClick={() => w?.walkTo({ x: o.x + 0.5, y: o.y + 1.5 }, o.id)}
                title={t("roomGo")}
              >
                <span className="w-10 h-9 flex items-center justify-center shrink-0">
                  <ItemThumb kind={o.kind} props={o.props} />
                </span>
                <span className="text-xs truncate">{entry(o.kind).label}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
