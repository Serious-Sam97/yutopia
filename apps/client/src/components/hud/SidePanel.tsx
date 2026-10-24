"use client";

import { entry, isOpening, isPrivate } from "@yutopia/shared";
import { type Key, useTr } from "@/lib/i18n";
import { hud, type Person, type SideTab, useHud } from "@/world/store";
import { ItemThumb } from "./build/thumbs";
import { useWorld } from "./ctx";
import { Face, STATUS_COLOR } from "./Face";
import { Icon, type IconName } from "./icons";

const TABS: { key: SideTab; label: Key; icon: IconName }[] = [
  { key: "people", label: "people", icon: "people" },
  { key: "room", label: "room", icon: "home" },
];
// The right-hand panel: People and Room as tabs of one drawer (texts and calls
// are on the phone now, world/phone). It grows
// with what's in it and always stays above the dock.
export function SidePanel() {
  const t = useTr();
  const side = useHud((s) => s.side);
  const count = useHud((s) => s.people.filter((p) => !p.bot).length + 1);
  if (!side) return null;
  return (
    <aside
      aria-label={t(TABS.find((x) => x.key === side)?.label ?? "people")}
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
            onClick={() => hud.set({ side: x.key })}
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

function PeopleTab() {
  const t = useTr();
  const w = useWorld();
  const me = useHud((s) => s.me);
  const people = useHud((s) => s.people);
  const following = useHud((s) => s.following);
  const myBay = useHud((s) => s.myBay);
  const keys = useHud((s) => s.keys);
  const heardBy = useHud((s) => s.heardBy);
  const rows = people.filter((p) => !p.bot);
  const bots = people.length - rows.length;

  const row = (p: Person, mine = false) => {
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
      <Earshot />
      <div className="px-3 pt-2.5 flex gap-2 shrink-0">
        <button type="button" className="ghost-btn flex items-center gap-1.5" onClick={() => w?.teleport("desk")}>
          <Icon name="desk" size={15} />
          {t("myDesk")}
        </button>
        {myBay && (
          <button
            type="button"
            className="ghost-btn flex items-center gap-1.5 whitespace-nowrap"
            title={t("myBay")}
            onClick={() => w?.teleport("bay")}
          >
            <Icon name="bay" size={15} />
            {myBay}
          </button>
        )}
        {keys && (
          <span
            className="ghost-btn flex items-center gap-1.5 whitespace-nowrap"
            title={t("keysOf").replace("{who}", keys.from)}
            data-keys-held
          >
            <Icon name="key" size={15} />
            {keys.plate}
          </span>
        )}
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
    .filter((o) => entry(o.kind).interact && !isOpening(o.kind) && inside(o))
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
