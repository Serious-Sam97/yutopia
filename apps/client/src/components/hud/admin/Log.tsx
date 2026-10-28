"use client";

import { useEffect, useState } from "react";
import { admin, type LogRow } from "@/lib/admin";
import { useLang } from "@/lib/i18n";
import { Icon, type IconName } from "../icons";
import { ago, Note, useWords } from "./ui";

// The log (docs/plan/48-the-admin.md): what admins did, here and in the world, newest first —
// kept by the API for 90 days — by kind; older ones on asking.
const W = {
  all: ["All", "Tudo"],
  people: ["People", "Pessoas"],
  locks: ["Locks", "Trancas"],
  world: ["The world", "O mundo"],
  powers: ["Powers", "Poderes"],
  roles: ["Roles", "Papéis"],
  invites: ["Invites", "Convites"],
  more: ["Older", "Mais antigos"],
  none: ["Nothing yet.", "Nada ainda."],
  failed: ["Couldn't load the log.", "Não deu para carregar o registro."],
  // what each kind says (who is the admin; {t} whom or what; {d} the detail)
  k_mute: ["muted {t}", "silenciou {t}"],
  k_unmute: ["unmuted {t}", "liberou {t}"],
  k_remove: ["removed {t} {d}", "removeu {t} {d}"],
  k_unremove: ["let {t} back in", "deixou {t} voltar"],
  k_lock: ["locked {t}", "trancou {t}"],
  k_unlock: ["unlocked {t}", "destrancou {t}"],
  k_admin: ["made {t} an admin", "fez {t} admin"],
  k_unadmin: ["took {t}'s admin role", "tirou o admin de {t}"],
  k_hour: ["set the hour {d}", "mudou a hora {d}"],
  k_storm: ["called the weather: {d}", "pediu o tempo: {d}"],
  k_notice: ["sent a notice: “{d}”", "mandou um aviso: “{d}”"],
  k_power: ["used a power: {d}", "usou um poder: {d}"],
  k_spawn: ["spawned {d}", "criou {d}"],
  k_clear: ["cleared {d}", "limpou {d}"],
  k_freeze: ["held {t} still {d}", "segurou {t} {d}"],
  k_home: ["sent {t} home", "mandou {t} para a entrada"],
  k_bring: ["brought {t} over", "trouxe {t}"],
  k_unseat: ["took {t} out of the car", "tirou {t} do carro"],
  k_heal: ["healed {t}", "curou {t}"],
  k_give: ["gave {t} {d}", "deu {d} para {t}"],
  k_cars: ["parked every car home", "mandou todos os carros para casa"],
  k_shuttle: ["called the shuttle {d}", "chamou o ônibus {d}"],
  k_dark: ["set the dark to {d}", "pôs o escuro em {d}"],
  k_invite: ["made an invite {d}", "criou um convite {d}"],
} as const;
type Word = keyof typeof W;

const GROUPS: Record<string, string[]> = {
  people: ["mute", "unmute", "remove", "unremove", "freeze", "home", "bring", "unseat", "heal", "give"],
  locks: ["lock", "unlock"],
  world: ["hour", "storm", "notice", "cars", "shuttle", "dark", "spawn", "clear"],
  powers: ["power"],
  roles: ["admin", "unadmin"],
  invites: ["invite"],
};
const ICON: Record<string, IconName> = {
  mute: "micOff",
  unmute: "mic",
  remove: "leave",
  unremove: "door",
  lock: "lock",
  unlock: "unlock",
  admin: "key",
  unadmin: "key",
  hour: "clock",
  storm: "cam",
  notice: "send",
  power: "follow",
  spawn: "plus",
  clear: "bin",
  freeze: "lock",
  home: "home",
  bring: "follow",
  unseat: "leave",
  heal: "plus",
  give: "plus",
  cars: "bay",
  shuttle: "home",
  dark: "screen",
  invite: "key",
};

export function Log() {
  const t = useWords(W);
  const pt = useLang() === "pt";
  const [group, setGroup] = useState<string | null>(null);
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [end, setEnd] = useState(false);
  useEffect(() => {
    setRows(null);
    setEnd(false);
    admin
      .log(group ? GROUPS[group] : [])
      .then((r) => {
        setRows(r.log);
        setEnd(r.log.length < 60);
      })
      .catch(() => setFailed(true));
  }, [group]);
  const more = () =>
    rows?.length &&
    void admin
      .log(group ? GROUPS[group] : [], rows[rows.length - 1].id)
      .then((r) => {
        setRows([...rows, ...r.log]);
        setEnd(r.log.length < 60);
      })
      .catch(() => setFailed(true));
  const line = (r: LogRow) => {
    const k = `k_${r.kind}` as Word;
    return k in W ? t(k, { t: r.target || "—", d: r.detail }) : `${r.kind} ${r.target} ${r.detail}`;
  };
  return (
    <>
      <div className="flex gap-1.5 flex-wrap">
        {[null, ...Object.keys(GROUPS)].map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            className="chip"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
          >
            {t((g ?? "all") as Word)}
          </button>
        ))}
      </div>
      {failed && <Note>{t("failed")}</Note>}
      {rows && !rows.length && <Note>{t("none")}</Note>}
      {rows && rows.length > 0 && (
        <ul className="card py-1">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className="flex items-center gap-3 py-2.5"
              style={i ? { borderTop: "1px solid var(--well-edge)" } : undefined}
            >
              <span className="mono text-xs w-24 shrink-0" style={{ color: "var(--muted)" }}>
                {ago(r.at, pt)}
              </span>
              <span style={{ color: "var(--cream-dim)" }}>
                <Icon name={ICON[r.kind] ?? "board"} size={16} />
              </span>
              <span className="text-[14px] min-w-0">
                <span style={{ color: "var(--cream-dim)" }}>{r.admin || "—"}</span> {line(r)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows && !end && (
        <button type="button" className="ghost-btn" onClick={more}>
          {t("more")}
        </button>
      )}
    </>
  );
}
