"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { type PerfArea, type PerfDetail, type PerfPlayer, type PerfSpot, type PerfVersion, perf } from "@/lib/admin";
import { getToken, yutopia } from "@/lib/api";
import { useLang } from "@/lib/i18n";

// The admins' look at how the game runs for everyone (docs/plan/39-the-telemetry.md): each
// player's frames over the window picked, one player in detail (fps over time, their
// places, what a frame costs them, their machine), and the places slow for everyone.
// Words live here (EN / PT-BR), as in Invites.
const W = {
  title: ["How it runs", "Como está rodando"],
  back: ["Back", "Voltar"],
  notAllowed: ["Only admins can see this page.", "Só admins podem ver esta página."],
  loading: ["Loading…", "Carregando…"],
  failed: ["Couldn't load the numbers.", "Não deu para carregar os números."],
  range: ["Window", "Período"],
  d1: ["24 h", "24 h"],
  d7: ["7 days", "7 dias"],
  d30: ["30 days", "30 dias"],
  players: ["Players, slowest first", "Jogadores, os mais lentos primeiro"],
  none: ["Nothing recorded in this window yet.", "Nada registrado neste período ainda."],
  name: ["Player", "Jogador"],
  fps: ["fps", "fps"],
  p95: ["Frame p95", "Quadro p95"],
  worst: ["Worst frame", "Pior quadro"],
  slow: ["Under 30 fps", "Abaixo de 30 fps"],
  played: ["Played", "Jogou"],
  ping: ["Ping", "Ping"],
  snaps: ["Put back", "Corrigido"],
  browser: ["Browser", "Navegador"],
  gpu: ["GPU", "GPU"],
  worstArea: ["Slowest place", "Lugar mais lento"],
  last: ["Last seen", "Visto"],
  pick: ["Pick a player to see them in detail.", "Escolha um jogador para ver em detalhe."],
  overTime: ["fps over time", "fps ao longo do tempo"],
  asTable: ["The windows as a table", "Os períodos em tabela"],
  at: ["When", "Quando"],
  view: ["View", "Vista"],
  quality: ["Quality", "Qualidade"],
  place: ["Place", "Lugar"],
  floor: ["Floor", "Andar"],
  windows: ["Windows", "Períodos"],
  draws: ["Draw calls", "Draw calls"],
  theirPlaces: ["Their places, slowest first", "Os lugares dele(a), os mais lentos primeiro"],
  stages: ["What a frame costs them (ms)", "Quanto custa um quadro (ms)"],
  machine: ["Their machine", "A máquina"],
  machines: ["Seen on", "Visto em"],
  spots: ["Where it's slow, for everyone", "Onde fica lento, para todos"],
  who: ["Players", "Jogadores"],
  close: ["Close", "Fechar"],
  version: ["Version", "Versão"],
  versions: ["By version, newest first", "Por versão, a mais nova primeiro"],
  first: ["First seen", "Primeira vez"],
} as const;
type Key = keyof typeof W;

// the API's times: ISO from a model, "Y-m-d H:i:s" (UTC) from an aggregate
const when = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
const pctOf = (v: number) => `${Math.round(v * 100)}%`;
const mins = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
const placeOf = (a: { level: number; area: string }, w: (k: Key) => string) =>
  `${w("floor")} ${a.level}${a.area ? ` · ${a.area}` : ""}`;

export default function PerfPage() {
  const pt = useLang() === "pt";
  const w = (k: Key) => W[k][pt ? 1 : 0];
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [days, setDays] = useState(7);
  const [players, setPlayers] = useState<PerfPlayer[] | null>(null);
  const [spots, setSpots] = useState<PerfSpot[] | null>(null);
  const [versions, setVersions] = useState<PerfVersion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [detail, setDetail] = useState<PerfDetail | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/admin/perf");
      return;
    }
    yutopia
      .me()
      .then((m) => setAllowed(m.user.isAdmin))
      .catch(() => setAllowed(false));
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    setFailed(false);
    setPlayers(null);
    setSpots(null);
    setVersions(null);
    Promise.all([perf.summary(days), perf.spots(days)])
      .then(([s, p]) => {
        setPlayers(s.players);
        setVersions(s.versions);
        setSpots(p.spots);
      })
      .catch(() => setFailed(true));
  }, [allowed, days]);

  useEffect(() => {
    setDetail(null);
    if (!allowed || picked === null) return;
    perf
      .player(picked, days)
      .then(setDetail)
      .catch(() => setFailed(true));
  }, [allowed, picked, days]);

  return (
    <main className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <header className="flex items-center justify-between mb-6 gap-4">
          <Brand small />
          <Link href="/" className="ghost-btn">
            ← {w("back")}
          </Link>
        </header>
        <h1 className="mono text-xs uppercase tracking-widest mb-4" style={{ color: "var(--vfd)" }}>
          {w("title")}
        </h1>
        {allowed === null && <Note>{w("loading")}</Note>}
        {allowed === false && <Note>{w("notAllowed")}</Note>}
        {allowed && (
          <>
            <fieldset className="flex items-center gap-2 mb-6 flex-wrap">
              <legend className="sr-only">{w("range")}</legend>
              <span className="text-sm mr-1" style={{ color: "var(--muted)" }} aria-hidden>
                {w("range")}
              </span>
              {([1, 7, 30] as const).map((d) => (
                <button key={d} type="button" className="deck-btn" aria-pressed={days === d} onClick={() => setDays(d)}>
                  {w(d === 1 ? "d1" : d === 7 ? "d7" : "d30")}
                </button>
              ))}
            </fieldset>
            {failed && <Note>{w("failed")}</Note>}
            <Section title={w("players")}>
              {!players ? (
                <Note>{w("loading")}</Note>
              ) : !players.length ? (
                <Note>{w("none")}</Note>
              ) : (
                <Players players={players} picked={picked} onPick={setPicked} w={w} pt={pt} />
              )}
            </Section>
            {picked !== null && (
              <Section title={detail?.user.name ?? players?.find((p) => p.userId === picked)?.name ?? "…"}>
                <div className="mb-3">
                  <button type="button" className="ghost-btn" onClick={() => setPicked(null)}>
                    {w("close")}
                  </button>
                </div>
                {!detail ? <Note>{w("loading")}</Note> : <Detail d={detail} w={w} pt={pt} />}
              </Section>
            )}
            {players && !picked && players.length > 0 && <Note>{w("pick")}</Note>}
            <Section title={w("spots")}>
              {!spots ? (
                <Note>{w("loading")}</Note>
              ) : !spots.length ? (
                <Note>{w("none")}</Note>
              ) : (
                <Places areas={spots} w={w} everyone />
              )}
            </Section>
            <Section title={w("versions")}>
              {!versions ? (
                <Note>{w("loading")}</Note>
              ) : !versions.length ? (
                <Note>{w("none")}</Note>
              ) : (
                <Versions versions={versions} w={w} pt={pt} />
              )}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cabinet p-4 mb-6">
      <h2 className="mono text-xs uppercase tracking-widest mb-3" style={{ color: "var(--cream-dim)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const th = "text-left font-normal py-1 pr-4 whitespace-nowrap";
const td = "py-1 pr-4 whitespace-nowrap";
const num = `${td} text-right tabular-nums`;
const thNum = `${th} text-right`;

function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-sm" style={{ color: "var(--cream)" }}>
        <thead className="mono text-xs" style={{ color: "var(--muted)" }}>
          {head}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Players({
  players,
  picked,
  onPick,
  w,
  pt,
}: {
  players: PerfPlayer[];
  picked: number | null;
  onPick: (id: number) => void;
  w: (k: Key) => string;
  pt: boolean;
}) {
  return (
    <Table
      head={
        <tr>
          <th className={th}>{w("name")}</th>
          <th className={thNum}>{w("fps")}</th>
          <th className={thNum}>{w("p95")}</th>
          <th className={thNum}>{w("worst")}</th>
          <th className={thNum}>{w("slow")}</th>
          <th className={thNum}>{w("played")}</th>
          <th className={thNum}>{w("ping")}</th>
          <th className={thNum}>{w("snaps")}</th>
          <th className={th}>{w("version")}</th>
          <th className={th}>{w("browser")}</th>
          <th className={th}>{w("gpu")}</th>
          <th className={th}>{w("worstArea")}</th>
          <th className={th}>{w("last")}</th>
        </tr>
      }
    >
      {players.map((p) => (
        <tr
          key={p.userId}
          className="cursor-pointer"
          style={{ background: picked === p.userId ? "var(--panel-2)" : undefined, borderTop: "1px solid var(--edge)" }}
          onClick={() => onPick(p.userId)}
        >
          <td className={td}>
            <button type="button" className="underline" onClick={() => onPick(p.userId)}>
              {p.name}
            </button>
          </td>
          <td className={num}>{p.fps.toFixed(1)}</td>
          <td className={num}>{p.frameP95.toFixed(1)} ms</td>
          <td className={num}>{p.frameWorst.toFixed(0)} ms</td>
          <td className={num}>{pctOf(p.slowShare)}</td>
          <td className={num}>{mins(p.minutes)}</td>
          <td className={num}>{p.ping === null ? "—" : `${p.ping} ms`}</td>
          <td className={num}>{p.snaps}</td>
          <td className={td}>{p.version || "—"}</td>
          <td className={td}>{p.browser ?? "—"}</td>
          <td
            className={td}
            title={p.gpu ?? ""}
            style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {p.gpu || "—"}
          </td>
          <td className={td}>{p.worstArea ? `${placeOf(p.worstArea, w)} (${p.worstArea.fps.toFixed(0)})` : "—"}</td>
          <td className={td}>{when(p.last).toLocaleString(pt ? "pt-BR" : "en-GB")}</td>
        </tr>
      ))}
    </Table>
  );
}

function Places({ areas, w, everyone }: { areas: PerfArea[]; w: (k: Key) => string; everyone?: boolean }) {
  return (
    <Table
      head={
        <tr>
          <th className={th}>{w("place")}</th>
          <th className={thNum}>{w("fps")}</th>
          <th className={thNum}>{w("p95")}</th>
          <th className={thNum}>{w("slow")}</th>
          <th className={thNum}>{w("draws")}</th>
          <th className={thNum}>{w("windows")}</th>
          {everyone && <th className={thNum}>{w("who")}</th>}
        </tr>
      }
    >
      {areas.map((a) => (
        <tr key={`${a.level}:${a.area}`} style={{ borderTop: "1px solid var(--edge)" }}>
          <td className={td}>{placeOf(a, w)}</td>
          <td className={num}>{a.fps.toFixed(1)}</td>
          <td className={num}>{a.frameP95.toFixed(1)} ms</td>
          <td className={num}>{pctOf(a.slowShare)}</td>
          <td className={num}>{a.draws ?? "—"}</td>
          <td className={num}>{a.windows}</td>
          {everyone && <td className={num}>{a.players}</td>}
        </tr>
      ))}
    </Table>
  );
}

function Versions({ versions, w, pt }: { versions: PerfVersion[]; w: (k: Key) => string; pt: boolean }) {
  const locale = pt ? "pt-BR" : "en-GB";
  return (
    <Table
      head={
        <tr>
          <th className={th}>{w("version")}</th>
          <th className={thNum}>{w("fps")}</th>
          <th className={thNum}>{w("p95")}</th>
          <th className={thNum}>{w("slow")}</th>
          <th className={thNum}>{w("who")}</th>
          <th className={thNum}>{w("windows")}</th>
          <th className={th}>{w("first")}</th>
          <th className={th}>{w("last")}</th>
        </tr>
      }
    >
      {versions.map((v) => (
        <tr key={v.version} style={{ borderTop: "1px solid var(--edge)" }}>
          <td className={`${td} mono`}>{v.version || "—"}</td>
          <td className={num}>{v.fps.toFixed(1)}</td>
          <td className={num}>{v.frameP95.toFixed(1)} ms</td>
          <td className={num}>{pctOf(v.slowShare)}</td>
          <td className={num}>{v.players}</td>
          <td className={num}>{v.windows}</td>
          <td className={td}>{when(v.first).toLocaleString(locale)}</td>
          <td className={td}>{when(v.last).toLocaleString(locale)}</td>
        </tr>
      ))}
    </Table>
  );
}

function Detail({ d, w, pt }: { d: PerfDetail; w: (k: Key) => string; pt: boolean }) {
  const stages = Object.entries(d.stages);
  const top = Math.max(0.01, ...stages.map(([, v]) => v));
  const m = (d.machine ?? {}) as {
    os?: string;
    screen?: [number, number];
    canvas?: [number, number];
    dpr?: number;
    cores?: number;
    memory?: number | null;
  };
  const locale = pt ? "pt-BR" : "en-GB";
  return (
    <>
      <h3 className="mono text-xs mb-2" style={{ color: "var(--muted)" }}>
        {w("overTime")}
      </h3>
      <FpsChart series={d.series} w={w} locale={locale} />
      <details className="mt-2 mb-6">
        <summary className="text-sm cursor-pointer" style={{ color: "var(--muted)" }}>
          {w("asTable")}
        </summary>
        <div className="mt-2 max-h-80 overflow-y-auto scroll-thin">
          <Table
            head={
              <tr>
                <th className={th}>{w("at")}</th>
                <th className={thNum}>{w("fps")}</th>
                <th className={thNum}>{w("p95")}</th>
                <th className={thNum}>{w("worst")}</th>
                <th className={thNum}>{w("ping")}</th>
                <th className={th}>{w("view")}</th>
                <th className={th}>{w("quality")}</th>
                <th className={th}>{w("place")}</th>
                <th className={th}>{w("version")}</th>
              </tr>
            }
          >
            {[...d.series].reverse().map((r) => (
              <tr key={`${r.session}:${r.at}`} style={{ borderTop: "1px solid var(--edge)" }}>
                <td className={td}>{when(r.at).toLocaleString(locale)}</td>
                <td className={num}>{r.fps.toFixed(1)}</td>
                <td className={num}>{r.frameP95.toFixed(1)} ms</td>
                <td className={num}>{r.frameWorst.toFixed(0)} ms</td>
                <td className={num}>{r.ping === null ? "—" : `${r.ping} ms`}</td>
                <td className={td}>{r.view}</td>
                <td className={td}>{r.quality}</td>
                <td className={td}>{placeOf(r, w)}</td>
                <td className={td}>{r.version || "—"}</td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mono text-xs mb-2" style={{ color: "var(--muted)" }}>
            {w("theirPlaces")}
          </h3>
          <Places areas={d.areas} w={w} />
        </div>
        <div>
          <h3 className="mono text-xs mb-2" style={{ color: "var(--muted)" }}>
            {w("stages")}
          </h3>
          <ul className="text-sm mb-6">
            {stages.map(([k, v]) => (
              <li key={k} className="flex items-center gap-3 py-1">
                <span className="w-28 shrink-0 mono text-xs" style={{ color: "var(--cream-dim)" }}>
                  {k}
                </span>
                <span className="flex-1 h-2" aria-hidden>
                  <span
                    className="block h-2"
                    style={{ width: `${(v / top) * 100}%`, background: "var(--vfd)", borderRadius: "0 4px 4px 0" }}
                  />
                </span>
                <span className="w-14 text-right tabular-nums" style={{ color: "var(--cream)" }}>
                  {v.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mono text-xs mb-2" style={{ color: "var(--muted)" }}>
            {w("machine")}
          </h3>
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mb-4" style={{ color: "var(--cream)" }}>
            {m.os && <Row k="OS" v={m.os} />}
            {m.cores ? <Row k="CPU" v={`${m.cores} cores`} /> : null}
            {m.memory ? <Row k="RAM" v={`≥ ${m.memory} GB`} /> : null}
            {m.screen && <Row k="Screen" v={`${m.screen[0]} × ${m.screen[1]} @${m.dpr ?? 1}x`} />}
            {m.canvas && <Row k="Canvas" v={`${m.canvas[0]} × ${m.canvas[1]}`} />}
          </dl>
          <h3 className="mono text-xs mb-2" style={{ color: "var(--muted)" }}>
            {w("machines")}
          </h3>
          <ul className="text-sm" style={{ color: "var(--cream)" }}>
            {d.machines.map((x) => (
              <li key={`${x.browser}|${x.gpu}`} className="py-1">
                {x.browser || "?"} · <span style={{ color: "var(--cream-dim)" }}>{x.gpu || "?"}</span>{" "}
                <span style={{ color: "var(--muted)" }}>
                  ({x.windows} · {when(x.last).toLocaleDateString(locale)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt style={{ color: "var(--muted)" }}>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

// fps over time: one line, broken where play stopped (more than 2 min between windows);
// a dashed 30 fps mark; hover for that window.
const H = 200;
const PAD = { l: 36, r: 12, t: 10, b: 24 };
function FpsChart({ series, w, locale }: { series: PerfDetail["series"]; w: (k: Key) => string; locale: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pts = useMemo(() => series.map((r) => ({ t: when(r.at).getTime(), r })), [series]);
  if (!pts.length) return null;
  const t0 = pts[0].t;
  const t1 = Math.max(t0 + 60_000, pts[pts.length - 1].t);
  const yMax = Math.max(60, Math.ceil(Math.max(...pts.map((p) => p.r.fps)) / 30) * 30);
  const iw = width - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * iw;
  const y = (v: number) => PAD.t + ih - (Math.min(v, yMax) / yMax) * ih;
  let path = "";
  for (let i = 0; i < pts.length; i++) {
    const gap = i === 0 || pts[i].t - pts[i - 1].t > 120_000;
    path += `${gap ? "M" : "L"}${x(pts[i].t).toFixed(1)},${y(pts[i].r.fps).toFixed(1)}`;
  }
  // lone points (a window with none either side) show as dots
  const lone = pts.filter(
    (p, i) => (i === 0 || p.t - pts[i - 1].t > 120_000) && (i === pts.length - 1 || pts[i + 1].t - p.t > 120_000),
  );
  const ticks = [0, 30, 60, 90, 120, 150, 180, 240].filter((v) => v <= yMax);
  const span = t1 - t0;
  const fmt: Intl.DateTimeFormatOptions =
    span > 2 * 86_400_000 ? { day: "numeric", month: "short" } : { hour: "2-digit", minute: "2-digit" };
  const tickLabel = (t: number) => new Date(t).toLocaleString(locale, fmt);
  // (five across, fewer when they'd read the same: a short window)
  const xTicks = Array.from({ length: 5 }, (_, i) => t0 + (span * i) / 4).filter(
    (t, i, all) => i === 0 || tickLabel(t) !== tickLabel(all[i - 1]),
  );
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width) * span;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
    setHover(best);
  };
  const h = hover === null ? null : pts[hover];
  return (
    <div ref={box} className="relative" style={{ height: H }}>
      <svg width={width} height={H} role="img" aria-label={w("overTime")} className="block">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--edge)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        <line
          x1={PAD.l}
          x2={width - PAD.r}
          y1={y(30)}
          y2={y(30)}
          stroke="var(--muted)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        {xTicks.map((t, i) => (
          <text
            key={t}
            x={x(t)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="var(--muted)"
          >
            {tickLabel(t)}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--vfd)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {lone.map((p) => (
          <circle key={p.t} cx={x(p.t)} cy={y(p.r.fps)} r={4} fill="var(--vfd)" />
        ))}
        {h && (
          <g pointerEvents="none">
            <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--cream-dim)" strokeWidth={1} />
            <circle cx={x(h.t)} cy={y(h.r.fps)} r={5} fill="var(--vfd)" stroke="var(--bg)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={iw}
          height={ih}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && (
        <div
          className="absolute pointer-events-none text-xs p-2 rounded"
          style={{
            left: Math.min(x(h.t) + 10, width - 190),
            top: 4,
            width: 180,
            background: "var(--panel-2)",
            border: "1px solid var(--edge)",
            color: "var(--cream)",
          }}
        >
          <div style={{ color: "var(--muted)" }}>{new Date(h.t).toLocaleString(locale)}</div>
          <div className="tabular-nums">
            {h.r.fps.toFixed(1)} fps · p95 {h.r.frameP95.toFixed(1)} ms
          </div>
          <div style={{ color: "var(--cream-dim)" }}>
            {h.r.view} · {h.r.quality} · {placeOf(h.r, w)}
          </div>
          {h.r.ping !== null && <div style={{ color: "var(--cream-dim)" }}>ping {h.r.ping} ms</div>}
          {h.r.version && (
            <div style={{ color: "var(--cream-dim)" }}>
              {w("version")} {h.r.version}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
