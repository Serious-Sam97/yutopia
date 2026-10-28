"use client";

import { useEffect, useMemo, useState } from "react";
import { admin, type Member, type PerfDetail, perf } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { hud, toast, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Face } from "../Face";
import { Icon } from "../icons";
import { ago, Card, Note, Row, Seg, Switch, Tag, useLive, useWords } from "./ui";

// People (docs/plan/48-the-admin.md): who's in now, above everyone who has an account; one of
// them opened — going to them, bringing them, muting, removing for a while or letting back in,
// holding still, sending home, out of the car, healing, handing something, their role, how the
// game runs for them. The world server and the API refuse all of it to anyone but an admin.
const W = {
  search: ["Search by name or email", "Buscar por nome ou e-mail"],
  everyone: ["Everyone", "Todos"],
  inNow: ["In now", "Aqui agora"],
  admins: ["Admins", "Admins"],
  removedF: ["Removed", "Removidos"],
  inNowN: ["In now · {n}", "Aqui agora · {n}"],
  notInN: ["Not in · {n}", "Fora · {n}"],
  removedN: ["Removed · {n}", "Removidos · {n}"],
  you: ["you", "você"],
  admin: ["admin", "admin"],
  muted: ["muted", "mudo"],
  removed: ["removed · {m} min", "removido · {m} min"],
  frozen: ["held still", "parado"],
  hidden: ["invisible", "invisível"],
  seen: ["Last seen {when}", "Visto {when}"],
  never: ["Never came in · joined {when}", "Nunca entrou · chegou {when}"],
  goTo: ["Go to", "Ir até"],
  letIn: ["Let back in", "Deixar voltar"],
  none: ["Nobody here.", "Ninguém aqui."],
  back: ["People", "Pessoas"],
  joined: ["joined {when}", "chegou {when}"],
  inAt: ["in now, {where}", "aqui agora, {where}"],
  bring: ["Bring here", "Trazer aqui"],
  follow: ["Follow", "Seguir"],
  unfollow: ["Stop following", "Parar de seguir"],
  moderation: ["Moderation", "Moderação"],
  mutedT: ["Muted", "Mudo"],
  mutedS: [
    "Their mic stays off until you unmute them or they leave.",
    "O microfone fica desligado até você liberar ou a pessoa sair.",
  ],
  talk: ["Can talk", "Pode falar"],
  talkS: ["Mute them: their mic goes off, and stays off.", "Silenciar: o microfone desliga, e fica assim."],
  mute: ["Mute", "Silenciar"],
  unmute: ["Unmute", "Liberar"],
  remove: ["Remove", "Remover"],
  removeS: ["Sends them out and keeps them out for a while.", "Manda a pessoa embora e a mantém fora por um tempo."],
  removeAsk: ["Remove {who} for {how}?", "Remover {who} por {how}?"],
  m10: ["10 min", "10 min"],
  h1: ["1 h", "1 h"],
  day: ["A day", "Um dia"],
  removedT: ["Removed", "Removido"],
  removedS: ["Out for {m} more min.", "Fora por mais {m} min."],
  on: ["Powers on them", "Poderes sobre a pessoa"],
  freeze: ["Hold still", "Segurar"],
  letGo: ["Let go", "Soltar"],
  frozenS: ["Held still for {m} more min.", "Parado por mais {m} min."],
  home: ["Send home", "Mandar para a entrada"],
  unseat: ["Out of the car", "Tirar do carro"],
  heal: ["Heal / get up", "Curar / levantar"],
  give: ["Give", "Dar"],
  role: ["Role", "Papel"],
  adminT: ["Admin", "Admin"],
  adminS: [
    "Can do everything on this panel. Takes hold the next time they come in.",
    "Pode tudo neste painel. Vale a partir da próxima vez que entrar.",
  ],
  adminSelf: ["You can't change your own role.", "Você não pode mudar o seu próprio papel."],
  runs: ["How it runs for them", "Como roda para a pessoa"],
  lastReport: ["Last report", "Último relatório"],
  frames: ["Frames", "Quadros"],
  version: ["Version", "Versão"],
  noReport: ["No reports this week.", "Nenhum relatório esta semana."],
  reports: ["Their reports", "Os relatórios"],
  notInHint: [
    "Not in the world now: the rest waits till they are.",
    "Fora do mundo agora: o resto espera a pessoa entrar.",
  ],
} as const;

type Filter = "all" | "in" | "admins" | "removed";
const GIVE = [
  "mug",
  "cup",
  "soda",
  "ball",
  "frisbee",
  "revolver",
  "shotgun",
  "r38",
  "shell",
  "flare",
  "battery",
  "aid",
  "fuse",
];

interface Live {
  sid: string;
  uid: number;
  name: string;
  avatar: string;
  where: string;
  status: string;
  admin: boolean;
  muted: boolean;
  powers: number;
  frozenUntil: number;
  busy: string;
}

export function People() {
  const w = useWorld();
  const t = useWords(W);
  const pt = useLang() === "pt";
  const people = useHud((s) => s.people);
  const me = useHud((s) => s.me);
  const removed = useHud((s) => s.removed);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  // the room's own word on each player (admin, powers, held still), read again every second
  const state = useLive(w, (w) => {
    const m = new Map<number, { admin: boolean; powers: number; frozenUntil: number; busy: string }>();
    w.room?.state.players.forEach(
      (p: { uid: number; admin: boolean; powers: number; frozenUntil: number; busy: string }) => {
        m.set(p.uid, { admin: p.admin, powers: p.powers, frozenUntil: p.frozenUntil, busy: p.busy });
      },
    );
    return m;
  });
  useEffect(() => {
    const id = setTimeout(
      () =>
        void admin
          .members(q.trim())
          .then((r) => setMembers(r.members))
          .catch(() => {}),
      q ? 250 : 0,
    );
    return () => clearTimeout(id);
  }, [q]);

  const live: Live[] = useMemo(
    () =>
      [...(me ? [me] : []), ...people]
        .filter((p) => !p.bot)
        .map((p) => ({
          sid: p.sid,
          uid: p.uid,
          name: p.name,
          avatar: p.avatar,
          where: p.areaName,
          status: p.status,
          muted: p.muted,
          admin: state?.get(p.uid)?.admin ?? false,
          powers: state?.get(p.uid)?.powers ?? 0,
          frozenUntil: state?.get(p.uid)?.frozenUntil ?? 0,
          busy: state?.get(p.uid)?.busy ?? "",
        })),
    [me, people, state],
  );
  const needle = q.trim().toLowerCase();
  const match = (name: string, email = "") =>
    !needle || name.toLowerCase().includes(needle) || email.toLowerCase().includes(needle);
  const liveUids = new Set(live.map((p) => p.uid));
  const removedOf = (uid: number) => removed.find((r) => r.uid === uid && r.until > Date.now());
  const memberOf = (uid: number) => members.find((m) => m.id === uid);

  if (open !== null)
    return (
      <Person
        uid={open}
        live={live.find((p) => p.uid === open) ?? null}
        member={memberOf(open) ?? null}
        removedUntil={removedOf(open)?.until ?? 0}
        mine={open === me?.uid}
        onBack={() => setOpen(null)}
        onRole={(on) => setMembers((ms) => ms.map((m) => (m.id === open ? { ...m, admin: on } : m)))}
      />
    );

  const inRows = live.filter(
    (p) => match(p.name, memberOf(p.uid)?.email) && (filter !== "admins" || p.admin) && filter !== "removed",
  );
  const outRows = members.filter(
    (m) =>
      !liveUids.has(m.id) &&
      match(m.name, m.email) &&
      (filter === "all" || (filter === "admins" && m.admin) || (filter === "removed" && removedOf(m.id))),
  );
  const tags = (p: { uid: number; admin: boolean; muted?: boolean; powers?: number; frozenUntil?: number }) => {
    const r = removedOf(p.uid);
    return (
      <>
        {p.uid === me?.uid && <Tag tone="you">{t("you")}</Tag>}
        {p.admin && <Tag tone="lamp">{t("admin")}</Tag>}
        {p.muted && <Tag tone="bad">{t("muted")}</Tag>}
        {(p.frozenUntil ?? 0) > Date.now() && <Tag tone="bad">{t("frozen")}</Tag>}
        {(p.powers ?? 0) & 8 ? <Tag>{t("hidden")}</Tag> : null}
        {r && <Tag tone="bad">{t("removed", { m: Math.ceil((r.until - Date.now()) / 60_000) })}</Tag>}
      </>
    );
  };
  return (
    <>
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }}>
            <Icon name="search" size={16} />
          </span>
          <input
            className="field"
            style={{ paddingLeft: 34 }}
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "in", "admins", "removed"] as const).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(f === "all" ? "everyone" : f === "in" ? "inNow" : f === "admins" ? "admins" : "removedF")}
            </button>
          ))}
        </div>
      </div>
      {filter !== "removed" && (
        <List label={t("inNowN", { n: inRows.length })} empty={t("none")}>
          {inRows.map((p) => (
            <PersonRow
              key={p.sid}
              name={p.name}
              avatar={p.avatar}
              status={p.status}
              sub={p.where || "—"}
              tags={tags(p)}
              onOpen={() => setOpen(p.uid)}
            >
              {p.uid !== me?.uid && (
                <button
                  type="button"
                  className="ghost-btn flex items-center gap-1.5"
                  onClick={() => w?.send("teleport", { to: { userId: p.uid } })}
                >
                  <Icon name="walk" size={14} />
                  {t("goTo")}
                </button>
              )}
            </PersonRow>
          ))}
        </List>
      )}
      {filter !== "in" && (
        <List label={t(filter === "removed" ? "removedN" : "notInN", { n: outRows.length })} empty={t("none")}>
          {outRows.map((m) => (
            <PersonRow
              key={m.id}
              name={m.name}
              avatar={m.avatar}
              status="offline"
              dim
              sub={
                m.seenAt
                  ? t("seen", { when: ago(m.seenAt, pt) })
                  : t("never", { when: m.joinedAt ? ago(m.joinedAt, pt) : "—" })
              }
              tags={tags({ uid: m.id, admin: m.admin })}
              onOpen={() => setOpen(m.id)}
            >
              {removedOf(m.id) && (
                <button type="button" className="ghost-btn" onClick={() => w?.send("mod:unremove", { userId: m.id })}>
                  {t("letIn")}
                </button>
              )}
            </PersonRow>
          ))}
        </List>
      )}
    </>
  );
}

function List({ label, empty, children }: { label: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <p className="grp mt-1 mb-1">{label}</p>
      {children.length ? children : <Note>{empty}</Note>}
    </section>
  );
}

function PersonRow({
  name,
  avatar,
  status,
  sub,
  tags,
  dim,
  onOpen,
  children,
}: {
  name: string;
  avatar: string;
  status: string;
  sub: string;
  tags: React.ReactNode;
  dim?: boolean;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-3 px-2.5 py-2 rounded"
      style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}
    >
      <button type="button" className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onOpen}>
        <Face avatar={avatar} name={name} status={status as "online"} size={34} />
        <span className="min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[14.5px] font-medium truncate"
              style={{ color: dim ? "var(--cream-dim)" : "var(--cream)" }}
            >
              {name}
            </span>
            {tags}
          </span>
          <span className="block text-[12.5px] truncate" style={{ color: "var(--cream-dim)" }}>
            {sub}
          </span>
        </span>
      </button>
      {children}
      <button type="button" className="ghost-btn" onClick={onOpen} aria-label={name}>
        <Icon name="follow" size={14} />
      </button>
    </div>
  );
}

function Person({
  uid,
  live,
  member,
  removedUntil,
  mine,
  onBack,
  onRole,
}: {
  uid: number;
  live: Live | null;
  member: Member | null;
  removedUntil: number;
  mine: boolean;
  onBack: () => void;
  onRole: (on: boolean) => void;
}) {
  const w = useWorld();
  const t = useWords(W);
  const pt = useLang() === "pt";
  const following = useHud((s) => s.following);
  const [mins, setMins] = useState(10);
  const [freezeFor, setFreezeFor] = useState(5);
  const [item, setItem] = useState("mug");
  const [report, setReport] = useState<PerfDetail | null | undefined>(undefined);
  useEffect(() => {
    perf
      .player(uid, 7)
      .then(setReport)
      .catch(() => setReport(null));
  }, [uid]);
  const name = live?.name ?? member?.name ?? "—";
  const isAdmin = live?.admin ?? member?.admin ?? false;
  const last = report?.series.at(-1);
  const send = w?.send.bind(w);
  const how = mins >= 1440 ? t("day") : mins >= 60 ? t("h1") : t("m10");
  const frozenLeft = Math.ceil(((live?.frozenUntil ?? 0) - Date.now()) / 60_000);

  async function role(on: boolean) {
    try {
      await admin.setAdmin(uid, on);
      onRole(on);
    } catch (e) {
      const msg = e instanceof ApiError ? (JSON.parse(e.message || "{}").message ?? e.message) : String(e);
      toast(msg, "warn");
    }
  }

  return (
    <>
      <button type="button" className="ghost-btn flex items-center gap-1.5" onClick={onBack}>
        ‹ {t("back")}
      </button>
      <div className="flex items-center gap-4">
        <Face
          avatar={live?.avatar ?? member?.avatar ?? ""}
          name={name}
          status={(live?.status ?? "offline") as "online"}
          size={64}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="title text-[24px]" style={{ letterSpacing: ".06em", textTransform: "none" }}>
              {name}
            </span>
            {isAdmin && <Tag tone="lamp">{t("admin")}</Tag>}
            {live?.muted && <Tag tone="bad">{t("muted")}</Tag>}
          </div>
          <p className="text-[13.5px] mt-1" style={{ color: "var(--cream-dim)" }}>
            {[
              member?.email,
              member?.joinedAt ? t("joined", { when: ago(member.joinedAt, pt) }) : null,
              live
                ? t("inAt", { where: live.where || "—" })
                : member?.seenAt
                  ? t("seen", { when: ago(member.seenAt, pt) })
                  : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {live && !mine && (
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="deck-btn" onClick={() => send?.("teleport", { to: { userId: uid } })}>
            <Icon name="walk" size={15} />
            {t("goTo")}
          </button>
          <button type="button" className="deck-btn" onClick={() => send?.("mod:bring", { userId: uid })}>
            <Icon name="follow" size={15} />
            {t("bring")}
          </button>
          <button
            type="button"
            className="deck-btn"
            aria-pressed={following === uid}
            onClick={() => hud.set({ following: following === uid ? null : uid })}
          >
            <Icon name="people" size={15} />
            {following === uid ? t("unfollow") : t("follow")}
          </button>
        </div>
      )}
      {!mine && (
        <Card label={t("moderation")}>
          {live && (
            <Row first title={live.muted ? t("mutedT") : t("talk")} sub={live.muted ? t("mutedS") : t("talkS")}>
              <button
                type="button"
                className={live.muted ? "deck-btn lit" : "deck-btn"}
                onClick={() => send?.("mod:mute", { userId: uid, muted: !live.muted })}
              >
                <Icon name={live.muted ? "mic" : "micOff"} size={15} />
                {live.muted ? t("unmute") : t("mute")}
              </button>
            </Row>
          )}
          {removedUntil > Date.now() ? (
            <Row
              first={!live}
              title={t("removedT")}
              sub={t("removedS", { m: Math.ceil((removedUntil - Date.now()) / 60_000) })}
            >
              <button type="button" className="deck-btn lit" onClick={() => send?.("mod:unremove", { userId: uid })}>
                {t("letIn")}
              </button>
            </Row>
          ) : (
            live && (
              <Row title={t("remove")} sub={t("removeS")}>
                <Seg
                  value={mins}
                  onPick={setMins}
                  options={[
                    { v: 10, label: t("m10") },
                    { v: 60, label: t("h1") },
                    { v: 1440, label: t("day") },
                  ]}
                />
                <button
                  type="button"
                  className="deck-btn danger"
                  aria-pressed="false"
                  onClick={() => {
                    if (window.confirm(t("removeAsk", { who: name, how })))
                      send?.("mod:kick", { userId: uid, minutes: mins });
                  }}
                >
                  <Icon name="leave" size={15} />
                  {t("remove")}
                </button>
              </Row>
            )
          )}
          {!live && removedUntil <= Date.now() && <Note>{t("notInHint")}</Note>}
        </Card>
      )}
      {live && !mine && (
        <Card label={t("on")}>
          <Row first title={t("freeze")} sub={frozenLeft > 0 ? t("frozenS", { m: frozenLeft }) : undefined}>
            {frozenLeft > 0 ? (
              <button
                type="button"
                className="deck-btn lit"
                onClick={() => send?.("mod:freeze", { userId: uid, minutes: 0 })}
              >
                {t("letGo")}
              </button>
            ) : (
              <>
                <Seg
                  value={freezeFor}
                  onPick={setFreezeFor}
                  options={[1, 5, 10].map((v) => ({ v, label: `${v} min` }))}
                />
                <button
                  type="button"
                  className="deck-btn"
                  onClick={() => send?.("mod:freeze", { userId: uid, minutes: freezeFor })}
                >
                  <Icon name="lock" size={15} />
                  {t("freeze")}
                </button>
              </>
            )}
          </Row>
          <div className="flex gap-2 flex-wrap pt-2.5" style={{ borderTop: "1px solid var(--well-edge)" }}>
            <button type="button" className="deck-btn" onClick={() => send?.("mod:home", { userId: uid })}>
              <Icon name="home" size={15} />
              {t("home")}
            </button>
            {/^(drive|ride):/.test(live.busy) && (
              <button type="button" className="deck-btn" onClick={() => send?.("mod:unseat", { userId: uid })}>
                <Icon name="leave" size={15} />
                {t("unseat")}
              </button>
            )}
            <button type="button" className="deck-btn" onClick={() => send?.("mod:heal", { userId: uid })}>
              <Icon name="plus" size={15} />
              {t("heal")}
            </button>
            <span className="flex gap-2">
              <select
                className="field"
                style={{ width: 150, height: 44 }}
                value={item}
                onChange={(e) => setItem(e.target.value)}
              >
                {GIVE.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="deck-btn"
                onClick={() => send?.("mod:give", { userId: uid, item, n: 1 })}
              >
                {t("give")}
              </button>
            </span>
          </div>
        </Card>
      )}
      <Card label={t("role")}>
        <Row first title={t("adminT")} sub={mine ? t("adminSelf") : t("adminS")}>
          {!mine && <Switch on={isAdmin} label={t("adminT")} onFlip={() => void role(!isAdmin)} />}
        </Row>
      </Card>
      <Card label={t("runs")}>
        {report === undefined ? (
          <Note>…</Note>
        ) : !last ? (
          <Note>{t("noReport")}</Note>
        ) : (
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
            <dt style={{ color: "var(--cream-dim)" }}>{t("lastReport")}</dt>
            <dd>
              {ago(last.at.includes("T") ? last.at : `${last.at.replace(" ", "T")}Z`, pt)} · {last.view} ·{" "}
              {last.quality}
            </dd>
            <dt style={{ color: "var(--cream-dim)" }}>{t("frames")}</dt>
            <dd>
              {Math.round(last.fps)} fps · p95 {Math.round(last.frameP95)} ms
            </dd>
            <dt style={{ color: "var(--cream-dim)" }}>{t("version")}</dt>
            <dd>{last.version || "—"}</dd>
          </dl>
        )}
        <a
          href="/admin/perf"
          target="_blank"
          rel="noopener"
          className="ghost-btn inline-flex items-center gap-1.5 mt-3"
        >
          <Icon name="external" size={14} />
          {t("reports")}
        </a>
      </Card>
    </>
  );
}
