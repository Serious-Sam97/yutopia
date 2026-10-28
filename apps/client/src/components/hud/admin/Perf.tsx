"use client";

import { useEffect, useState } from "react";
import { type PerfPlayer, type PerfVersion, perf } from "@/lib/admin";
import { useLang } from "@/lib/i18n";
import { Icon } from "../icons";

// How it runs for everyone this week, in brief (docs/plan/48-the-admin.md): the full
// page, every player and place with the charts, stays at /admin/perf.
const W = {
  played: ["played this week", "jogaram esta semana"],
  fps: ["fps, typical", "fps, o normal"],
  worst: ["worst frame", "pior quadro"],
  versions: ["versions about", "versões por aí"],
  slowest: ["Slowest this week", "Os mais lentos da semana"],
  byVersion: ["Versions", "Versões"],
  players: ["{n} people", "{n} pessoas"],
  person: ["1 person", "1 pessoa"],
  open: ["Open the full page", "Abrir a página inteira"],
  full: ["Every player, every place, the charts.", "Cada jogador, cada lugar, os gráficos."],
  loading: ["Loading…", "Carregando…"],
  none: ["Nothing recorded this week yet.", "Nada registrado esta semana ainda."],
  failed: ["Couldn't load the numbers.", "Não deu para carregar os números."],
} as const;

const lab = "mono text-[11.5px] uppercase tracking-[.06em] mb-3";
// (a stall of seconds reads better as seconds)
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

export function Perf() {
  const pt = useLang() === "pt";
  const w = (k: keyof typeof W) => W[k][pt ? 1 : 0];
  const [data, setData] = useState<{ players: PerfPlayer[]; versions: PerfVersion[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    perf
      .summary(7)
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Note>{w("failed")}</Note>;
  if (!data) return <Note>{w("loading")}</Note>;
  const { players, versions } = data;
  // (the API sends players slowest first)
  const fpsAll = players.map((p) => p.fps).sort((a, b) => a - b);
  const worst = players.reduce<PerfPlayer | null>((m, p) => (!m || p.frameWorst > m.frameWorst ? p : m), null);
  const windows = versions.reduce((n, v) => n + v.windows, 0) || 1;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat big={String(players.length)} small={w("played")} />
        <Stat big={fpsAll.length ? String(Math.round(fpsAll[fpsAll.length >> 1])) : "—"} small={w("fps")} />
        <Stat
          big={worst ? ms(worst.frameWorst) : "—"}
          small={
            worst ? `${w("worst")}, ${worst.name.split(" ")[0]}${worst.view ? ` · ${worst.view}` : ""}` : w("worst")
          }
        />
        <Stat big={String(versions.length)} small={w("versions")} />
      </div>
      {!players.length ? (
        <Note>{w("none")}</Note>
      ) : (
        <>
          <div className="card">
            <p className={lab} style={{ color: "var(--amber)" }}>
              {w("slowest")}
            </p>
            {players.slice(0, 3).map((p, i) => (
              <div
                key={p.userId}
                className="flex items-center gap-3 py-2"
                style={i ? { borderTop: "1px solid var(--well-edge)" } : undefined}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] truncate">{p.name}</p>
                  <p className="text-[12.5px]" style={{ color: "var(--cream-dim)" }}>
                    {[p.view, p.quality, `${Math.round(p.fps)} fps`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Bar of={p.fps / 60} className="w-28 sm:w-44" />
              </div>
            ))}
          </div>
          <div className="card">
            <p className={lab} style={{ color: "var(--amber)" }}>
              {w("byVersion")}
            </p>
            {versions.map((v) => (
              <div key={v.version} className="flex items-center gap-3 my-2">
                <span className="mono w-28 text-sm truncate">{v.version || "—"}</span>
                <Bar of={v.windows / windows} className="flex-1" />
                <span className="text-xs w-28 text-right" style={{ color: "var(--muted)" }}>
                  {Math.round((v.windows / windows) * 100)}% ·{" "}
                  {v.players === 1 ? w("person") : w("players").replace("{n}", String(v.players))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <a href="/admin/perf" target="_blank" rel="noopener" className="deck-btn lit">
          <Icon name="external" size={15} />
          {w("open")}
        </a>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          /admin/perf: {w("full")}
        </span>
      </div>
    </>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="card">
      <b className="block text-[30px] leading-none" style={{ fontFamily: "var(--font-title)", fontWeight: 600 }}>
        {big}
      </b>
      <span className="mono text-[11px] uppercase tracking-[.06em] leading-snug" style={{ color: "var(--cream-dim)" }}>
        {small}
      </span>
    </div>
  );
}

function Bar({ of, className }: { of: number; className: string }) {
  return (
    <div className={`h-1.5 rounded overflow-hidden ${className}`} style={{ background: "var(--track)" }}>
      <i className="block h-full" style={{ width: `${Math.min(100, of * 100)}%`, background: "var(--amber)" }} />
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}
