"use client";

import { useEffect, useState } from "react";
import { ApiError, type Invite, yutopia } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { toast } from "@/world/store";
import { Icon } from "../icons";

// Admins: single-use sign-up links (the API's YUTOPIA_SIGNUP=invite), made here and
// copied to whoever should come in (docs/plan/48-the-admin.md). Words live here (EN / PT-BR).
const W = {
  invite: [
    "Sign-ups are by invite. Nobody can make an account without one of these links.",
    "Cadastro só por convite. Ninguém cria uma conta sem um destes links.",
  ],
  open: [
    "Sign-ups are open: anyone can make an account. These links still work.",
    "Cadastro aberto: qualquer um cria uma conta. Estes links ainda funcionam.",
  ],
  closed: [
    "Sign-ups are closed: nobody can make an account, links or not.",
    "Cadastro fechado: ninguém cria uma conta, com link ou não.",
  ],
  newLink: ["A new link", "Um link novo"],
  email: ["Their email (optional)", "E-mail da pessoa (opcional)"],
  make: ["Make a link", "Criar link"],
  copy: ["Copy", "Copiar"],
  copied: ["Copied. It lasts two weeks.", "Copiado. Vale duas semanas."],
  drop: ["Drop", "Apagar"],
  all: ["All", "Todos"],
  opens: ["Open", "Abertos"],
  used: ["Used", "Usados"],
  expired: ["Expired", "Expirados"],
  anyone: ["anyone", "qualquer um"],
  daysLeft: ["Open · {n} days left", "Aberto · faltam {n} dias"],
  dayLeft: ["Open · less than a day left", "Aberto · falta menos de um dia"],
  usedBy: ["Used by {who} · {when}", "Usado por {who} · {when}"],
  usedAt: ["Used · {when}", "Usado · {when}"],
  expiredAt: ["Expired {when}", "Expirou {when}"],
  none: ["No links here.", "Nenhum link aqui."],
  failed: ["Couldn't make the link.", "Não deu para criar o link."],
} as const;

type State = "open" | "used" | "expired";
const stateOf = (i: Invite): State => (i.usedAt ? "used" : new Date(i.expiresAt) < new Date() ? "expired" : "open");

export function Invites() {
  const pt = useLang() === "pt";
  const w = (k: keyof typeof W) => W[k][pt ? 1 : 0];
  const day = (s: string) => new Date(s).toLocaleDateString(pt ? "pt-BR" : "en-GB", { day: "numeric", month: "short" });
  const [list, setList] = useState<Invite[]>([]);
  const [signup, setSignup] = useState<"invite" | "open" | "closed" | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState<State | null>(null);
  // the link last made or copied, shown to select by hand when the clipboard says no
  const [shown, setShown] = useState("");

  const load = () =>
    void yutopia
      .invites()
      .then((r) => {
        setList(r.invites);
        setSignup(r.signup);
      })
      .catch(() => {});
  useEffect(load, []);

  const copy = (url: string) => {
    setShown(url);
    void Promise.resolve(navigator.clipboard?.writeText(url)).catch(() => {});
  };

  async function make() {
    setBusy(true);
    try {
      const { invite } = await yutopia.makeInvite(email.trim() || null);
      setEmail("");
      setList((l) => [invite, ...l]);
      copy(invite.url);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : w("failed"), "warn");
    }
    setBusy(false);
  }

  const line = (i: Invite) => {
    const s = stateOf(i);
    if (s === "used")
      return i.usedBy
        ? w("usedBy")
            .replace("{who}", i.usedBy)
            .replace("{when}", day(i.usedAt ?? ""))
        : w("usedAt").replace("{when}", day(i.usedAt ?? ""));
    if (s === "expired") return w("expiredAt").replace("{when}", day(i.expiresAt));
    const n = Math.floor((new Date(i.expiresAt).getTime() - Date.now()) / 86_400_000);
    return n < 1 ? w("dayLeft") : w("daysLeft").replace("{n}", String(n));
  };
  const count = (s: State) => list.filter((i) => stateOf(i) === s).length;
  const shownList = only ? list.filter((i) => stateOf(i) === only) : list;

  return (
    <>
      {signup && (
        <div className="faceplate flex items-center gap-3 px-3.5 py-3 mono text-[13.5px] leading-snug">
          <Icon name="key" size={18} />
          <span>{w(signup)}</span>
        </div>
      )}
      <div className="card">
        <p className="mono text-[11.5px] uppercase tracking-[.06em] mb-2" style={{ color: "var(--amber)" }}>
          {w("newLink")}
        </p>
        <div className="flex gap-2">
          <input
            className="field flex-1"
            type="email"
            placeholder={w("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && void make()}
          />
          <button type="button" className="deck-btn lit" disabled={busy} onClick={() => void make()}>
            <Icon name="plus" size={15} />
            {w("make")}
          </button>
        </div>
        {shown && (
          <>
            <input
              className="field mt-2 mono text-xs"
              readOnly
              value={shown}
              aria-label={w("copy")}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
              {w("copied")}
            </p>
          </>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {([null, "open", "used", "expired"] as const).map((s) => (
          <button key={s ?? "all"} type="button" className="chip" aria-pressed={only === s} onClick={() => setOnly(s)}>
            {s === null ? `${w("all")} · ${list.length}` : `${w(s === "open" ? "opens" : s)} · ${count(s)}`}
          </button>
        ))}
      </div>
      <ul className="card py-1">
        {!shownList.length && (
          <li className="py-2.5 text-sm" style={{ color: "var(--muted)" }}>
            {w("none")}
          </li>
        )}
        {shownList.map((i, n) => {
          const s = stateOf(i);
          return (
            <li
              key={i.id}
              className="flex items-center gap-2 py-2.5"
              style={n ? { borderTop: "1px solid var(--well-edge)" } : undefined}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-[14.5px] truncate"
                  style={{ color: s === "open" ? "var(--cream)" : "var(--cream-dim)" }}
                >
                  {i.email ?? w("anyone")}
                </p>
                <p className="text-[12.5px]" style={{ color: "var(--cream-dim)" }}>
                  {line(i)}
                </p>
              </div>
              {s === "open" && (
                <button type="button" className="ghost-btn flex items-center gap-1.5" onClick={() => copy(i.url)}>
                  <Icon name="copy" size={14} />
                  {w("copy")}
                </button>
              )}
              {s !== "used" && (
                <button
                  type="button"
                  className="ghost-btn flex items-center gap-1.5"
                  onClick={() => void yutopia.dropInvite(i.id).then(load, () => {})}
                >
                  <Icon name="bin" size={14} />
                  {w("drop")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
