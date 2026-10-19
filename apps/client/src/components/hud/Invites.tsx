"use client";

import { useEffect, useState } from "react";
import { ApiError, type Invite, yutopia } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { toast } from "@/world/store";

// Admins: single-use sign-up links (the API's YUTOPIA_SIGNUP=invite), made here and
// copied to whoever should come in. Words live here (EN / PT-BR), not in i18n.ts.
const W = {
  title: ["Invite people", "Convidar pessoas"],
  help: [
    "Each link lets one person make an account. It lasts two weeks; tie it to an email if you like.",
    "Cada link deixa uma pessoa criar uma conta. Vale duas semanas; amarre a um e-mail se quiser.",
  ],
  email: ["Their email (optional)", "E-mail da pessoa (opcional)"],
  make: ["Make a link", "Criar link"],
  copy: ["Copy", "Copiar"],
  copied: ["Link copied.", "Link copiado."],
  drop: ["Drop", "Apagar"],
  used: ["used", "usado"],
  expired: ["expired", "expirou"],
  anyone: ["anyone", "qualquer um"],
} as const;

export function Invites() {
  const pt = useLang() === "pt";
  const w = (k: keyof typeof W) => W[k][pt ? 1 : 0];
  const [list, setList] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // the link last made or copied, shown to select by hand when the clipboard says no
  const [shown, setShown] = useState("");

  const load = () =>
    void yutopia
      .invites()
      .then((r) => setList(r.invites))
      .catch(() => {});
  useEffect(load, []);

  const copy = (url: string) => {
    setShown(url);
    void Promise.resolve(navigator.clipboard?.writeText(url)).then(
      () => navigator.clipboard && toast(w("copied")),
      () => {},
    );
  };

  async function make() {
    setBusy(true);
    try {
      const { invite } = await yutopia.makeInvite(email.trim() || null);
      setEmail("");
      setList((l) => [invite, ...l]);
      copy(invite.url);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't make the link.", "warn");
    }
    setBusy(false);
  }

  return (
    <section>
      <h3 className="mono text-xs uppercase tracking-widest mb-1" style={{ color: "var(--vfd)" }}>
        {w("title")}
      </h3>
      <p className="text-sm mb-2" style={{ color: "var(--cream-dim)" }}>
        {w("help")}
      </p>
      <div className="flex gap-2">
        <input
          className="field flex-1"
          type="email"
          placeholder={w("email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="button" className="deck-btn" disabled={busy} onClick={() => void make()}>
          {w("make")}
        </button>
      </div>
      {shown && (
        <input
          className="field mt-2 mono text-xs"
          readOnly
          value={shown}
          aria-label={w("copy")}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <ul className="mt-2 space-y-1">
        {list.slice(0, 8).map((i) => {
          const gone = i.usedAt ? w("used") : new Date(i.expiresAt) < new Date() ? w("expired") : null;
          return (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate" style={{ color: gone ? "var(--muted)" : "var(--cream)" }}>
                {i.email ?? w("anyone")}
                {gone && ` · ${gone}`}
              </span>
              {!gone && (
                <button type="button" className="ghost-btn" onClick={() => copy(i.url)}>
                  {w("copy")}
                </button>
              )}
              {!i.usedAt && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void yutopia.dropInvite(i.id).then(load, () => {})}
                >
                  {w("drop")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
