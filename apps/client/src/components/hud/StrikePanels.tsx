"use client";

// The Strike Park's menus (docs/plan/115-the-strike-park-again.md, arcs A–B): the game's own panels (hud.panel), fed
// by the park's snapshot (hud.strike, written by world/strike/strike.ts as the room changes) — so every choice shows
// the moment the room takes it. The desk's terminal (PLAY · MAPS · RECORD · HOW TO PLAY · SETTINGS · LEAVE), the buy
// grid (B), the match's Esc menu, the Map Board. Their skin: the park's own (StrikePanels.module.css, F1).

import { ARMS } from "@yutopia/shared/dark";
import type { ItemId } from "@yutopia/shared/inventory";
import {
  dayOf,
  MODES,
  type ModeId,
  missionsOf,
  rankOf,
  SHOP,
  STRIKE_MAPS,
  type StrikeCard,
  strikeMap,
  TEAMS,
} from "@yutopia/shared/strike";
import {
  DEFAULT_KIT,
  KIT_CHARMS,
  KIT_PATTERNS,
  KIT_SHADES,
  kitOf,
  kitString,
  type StrikeKit,
} from "@yutopia/shared/strike/kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { artSrc } from "@/world/dark/icons";
import { hud, type StrikeView, useHud } from "@/world/store";
import { strikeKeys } from "@/world/strike/flag";
import { GLYPH } from "@/world/strike/look";
import { radar } from "@/world/strike/radar";
import { useWorld } from "./ctx";
import s from "./StrikePanels.module.css";

type Send = (type: string, m: unknown) => void;
const useSend = (): Send => {
  const w = useWorld();
  return (type, m) => (w as unknown as { send: Send } | null)?.send(type, m);
};
const close = () => hud.set({ panel: { kind: null } });
const strikeMod = () => (window as unknown as { __strike?: { setFollowing(on: boolean): void } }).__strike;

/** Esc closes (and the pointer stays free while a menu's up). */
function useEsc(on: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        on();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
}

const CLIMATE: Record<string, string> = {
  sawmill: "Autumn rain",
  freight: "Hot · golden hour",
  lodge: "Snow · night",
  tower: "Rain · city",
  boathouse: "Snow · frozen lake",
  range: "Hot · desert",
};
const MODE_LINE: Record<string, string> = {
  bomb: "Bomb defusal",
  hostage: "Hostage rescue",
  wingman: "Wingman",
  range: "Aim & Deathmatch",
};
const PHASE: Record<string, string> = {
  idle: "No match on",
  warmup: "Warmup",
  freeze: "Buy time",
  live: "Round on",
  planted: "Charge planted",
  after: "Round over",
  half: "Half time",
  over: "Match over",
};

function Radar({ map }: { map: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.height = 220;
    const g = c.getContext("2d");
    if (g) radar(g, strikeMap(map), 0, 0, 220, 220);
  }, [map]);
  return <canvas ref={ref} aria-hidden />;
}

// ── the desk's terminal ──
type Tab = "play" | "maps" | "record" | "how" | "settings";

export function StrikeTerminal() {
  const v = useHud((st) => st.strike);
  // (plan 118, F10a: opened from the trophy hall on its record)
  const from = useHud((st) => st.panel.objectId);
  const [tab, setTab] = useState<Tab>(from === "strike:record" ? "record" : "play");
  const send = useSend();
  useEsc(close);
  // (plan 115 phase 96) my card, fresh
  useEffect(() => send("strike:card", {}), [send]);
  const tabs: [Tab, string][] = [
    ["play", "Play"],
    ["maps", "Maps"],
    ["record", "Record"],
    ["how", "How to play"],
    ["settings", "Settings"],
  ];
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className={s.frame} role="dialog" aria-modal="true" aria-label="The Strike Park">
        <nav className={s.nav}>
          <div className={`${s.brand} ${s.stencil}`}>
            <b>Strike Park</b>
            <span>Yutopia · est. 2026</span>
          </div>
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`${s.navItem} ${s.stencil}`}
              aria-current={tab === k}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
          {v?.me && (
            <button
              type="button"
              className={`${s.navItem} ${s.stencil}`}
              style={{ color: "var(--strike-leave)" }}
              onClick={() => {
                send("strike:leave", {});
                close();
              }}
            >
              Leave the match
            </button>
          )}
          <div className={s.navFoot}>
            Esc closes. In a match: B buys, Tab the scores, Esc the match menu. Walk out of the gate to leave too.
          </div>
        </nav>
        <div className={s.body}>
          {tab === "play" && <Play v={v} send={send} />}
          {tab === "maps" && <Maps v={v} send={send} />}
          {tab === "record" && <Record v={v} />}
          {tab === "how" && <How />}
          {tab === "settings" && <Settings />}
        </div>
      </section>
    </div>
  );
}

function Head({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className={s.head}>
      <div>
        <h2 className={s.stencil}>{title}</h2>
        {sub && <small>{sub}</small>}
      </div>
      <div className={s.row}>
        {children}
        <button type="button" className={s.close} onClick={close}>
          ✕ ESC
        </button>
      </div>
    </header>
  );
}

/** (the join, rebuilt after the user's "make it more robust, show that you've joined"): a card per team — its people
 *  and bots, a look at who's on it — a click that waits for the server's answer ("Joining…"), and once in, a banner
 *  that says so, which side, what's next. */
function JoinDesk({ v, send, phase }: { v: StrikeView | null; send: Send; phase: string }) {
  const me = v?.me ?? null;
  const [joining, setJoining] = useState<{ squad: 0 | 1 | -1; at: number } | null>(null);
  const [late, setLate] = useState(false);
  const isIn = !!me;
  useEffect(() => {
    if (!joining) return;
    if (isIn) {
      // (in: the banner shows a moment, then the panel gets out of the way)
      const t = setTimeout(close, 1400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLate(true), 3000);
    return () => clearTimeout(t);
  }, [joining, isIn]);
  const join = (squad: 0 | 1 | -1, extra: Record<string, unknown> = {}) => {
    setLate(false);
    setJoining({ squad, at: Date.now() });
    send("strike:join", { ...(squad >= 0 ? { squad } : {}), mode: v?.mode, ...extra });
  };
  const of = (t: "r" | "w") => (v?.members ?? []).filter((m) => m.team === t);
  const sideName = me ? TEAMS[me.team as "r" | "w"].name : "";
  if (me)
    return (
      <div className={s.section}>
        <div className={`${s.joined} ${me.team === "w" ? s.joinedW : s.joinedR}`}>
          <span className={s.joinedTick} aria-hidden>
            ✓
          </span>
          <div>
            <div className={`${s.stencil} ${s.joinedTitle}`}>You're in · {sideName}</div>
            <div className={s.joinedSub}>
              {phase === "warmup"
                ? "Warmup: shoot about, buy freely, vote the map (V). The match starts 5 s after everyone's ready (F3) or someone starts it."
                : phase === "over"
                  ? "The match is over: vote for the next map (1–3)."
                  : `${PHASE[phase] ?? phase} · round ${v?.round ?? 0} · B buys, Tab the scores, Esc the menu.`}
            </div>
          </div>
        </div>
        <div className={s.row} style={{ marginTop: 12 }}>
          {phase === "warmup" && (
            <button
              type="button"
              className={`${s.btn} ${s.primary} ${s.stencil}`}
              onClick={() => (send("strike:start", {}), close())}
            >
              Start the match
            </button>
          )}
          <button type="button" className={`${s.btn} ${s.stencil}`} onClick={close}>
            Back to it
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.danger} ${s.stencil}`}
            onClick={() => (send("strike:leave", {}), close())}
          >
            Leave the match
          </button>
        </div>
      </div>
    );
  const card = (t: "r" | "w", squad: 0 | 1) => {
    const list = of(t);
    const people = list.filter((m) => !m.bot);
    const bots = list.length - people.length;
    const busy = joining?.squad === squad && !late;
    return (
      <button
        type="button"
        className={`${s.joinCard} ${t === "r" ? s.joinR : s.joinW}`}
        aria-busy={busy}
        disabled={!!joining && !late}
        onClick={() => join(squad)}
      >
        <span className={`${s.stencil} ${s.joinName}`}>{TEAMS[t].name}</span>
        <span className={s.joinCount}>
          {phase === "idle"
            ? "No one yet — be the first"
            : `${people.length} ${people.length === 1 ? "player" : "players"}${bots ? ` · ${bots} bots` : ""}`}
        </span>
        <span className={s.joinRoster}>
          {people.slice(0, 5).map((m) => (
            <i key={m.id}>{m.name}</i>
          ))}
        </span>
        <span className={`${s.stencil} ${s.joinGo}`}>{busy ? "Joining…" : `Join the ${TEAMS[t].name} ›`}</span>
      </button>
    );
  };
  return (
    <div className={s.section}>
      <p className={`${s.label} ${s.stencil}`}>Join · pick a side</p>
      <div className={s.joinCards}>
        {card("r", 0)}
        {card("w", 1)}
      </div>
      {late && (
        <p className={s.warn}>
          Didn't take — the reason's in the message at the top of the screen. Try again, or pick the other side.
        </p>
      )}
      <div className={s.row} style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`${s.btn} ${s.stencil}`}
          disabled={!!joining && !late}
          onClick={() => join(-1)}
        >
          Auto-pick a side
        </button>
        {/* (plan 115 phase 19) a guided first match: Casual, the checklist on */}
        <button
          type="button"
          className={`${s.btn} ${s.stencil}`}
          disabled={!!joining && !late}
          onClick={() => {
            dispatchEvent(new CustomEvent("strike:tutorial", { detail: "start" }));
            join(0, { mode: phase === "idle" ? "casual" : v?.mode });
          }}
        >
          Tutorial match
        </button>
        {phase !== "idle" && (
          <button
            type="button"
            className={`${s.btn} ${s.stencil}`}
            onClick={() => (strikeMod()?.setFollowing(true), close())}
          >
            Watch the match
          </button>
        )}
      </div>
    </div>
  );
}

function Play({ v, send }: { v: StrikeView | null; send: Send }) {
  const map = strikeMap(v?.map ?? "sawmill");
  const phase = v?.phase ?? "idle";
  const open = phase === "idle" || phase === "warmup" || phase === "over";
  const me = v?.me ?? null;
  const team = (t: "r" | "w") => (v?.members ?? []).filter((m) => m.team === t);
  return (
    <>
      <Head title="Play" sub={`${map.name} · ${MODE_LINE[map.mode]} · ${CLIMATE[map.key] ?? ""}`}>
        <span className={s.status}>
          <span>
            <span
              className={s.dot}
              style={phase === "idle" ? { background: "var(--muted)", boxShadow: "none" } : undefined}
            />
            <b>{PHASE[phase] ?? phase}</b>
          </span>
          {phase !== "idle" && (
            <span>
              Round <b>{v?.round ?? 0}</b> · <b style={{ color: "var(--strike-raiders)" }}>{v?.scoreR ?? 0}</b> –{" "}
              <b style={{ color: "var(--strike-wardens)" }}>{v?.scoreW ?? 0}</b>
            </span>
          )}
        </span>
      </Head>
      <div className={s.scroll}>
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>The mode</p>
          <div className={s.cards}>
            {Object.values(MODES).map((m) => {
              const fits = m.on.includes(map.mode);
              const off = !fits || !open;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={s.card}
                  aria-pressed={v?.mode === m.id}
                  aria-disabled={off}
                  title={
                    !fits
                      ? `${m.name} isn't played on ${map.name}: change the map`
                      : !open
                        ? "Change it in the warmup"
                        : ""
                  }
                  onClick={() => !off && send("strike:settings", { mode: m.id })}
                >
                  <span className={`${s.cardTitle} ${s.stencil}`}>{m.name}</span>
                  <span className={s.cardMeta}>{m.blurb}</span>
                  {!fits && <span className={s.tag}>Not on {map.name}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>Vortex bots fill the teams</p>
          <div className={s.row}>
            <div className={s.seg}>
              <button
                type="button"
                aria-pressed={!!v?.fill}
                onClick={() => send("strike:settings", { fill: true })}
                disabled={!open}
              >
                On
              </button>
              <button
                type="button"
                aria-pressed={!v?.fill}
                onClick={() => send("strike:settings", { fill: false })}
                disabled={!open}
              >
                Off
              </button>
            </div>
            {v?.fill && <Quota v={v} send={send} open={open} />}
            <div className={s.seg}>
              {["easy", "normal", "hard", "expert"].map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={v?.level === l}
                  onClick={() => send("strike:settings", { level: l })}
                  disabled={!open}
                >
                  {l[0].toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <JoinDesk v={v} send={send} phase={phase} />
        {phase !== "idle" && (
          <div className={s.teams}>
            {(["r", "w"] as const).map((t) => (
              <div key={t} className={`${s.team} ${t === "r" ? s.teamR : s.teamW}`}>
                <div className={`${s.teamHead} ${s.stencil}`}>
                  <span>{TEAMS[t].name}</span>
                  <span>{t === "r" ? v?.scoreR : v?.scoreW}</span>
                </div>
                {team(t).map((m) => (
                  <div key={m.id} className={`${s.player} ${m.me ? s.me : ""}`}>
                    <span>
                      {m.name}
                      {m.bot && <em> · bot</em>}
                    </span>
                    <em>
                      {m.kills}/{m.assists}/{m.deaths}
                    </em>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Maps({ v, send }: { v: StrikeView | null; send: Send }) {
  const phase = v?.phase ?? "idle";
  const busy = !(phase === "idle" || phase === "warmup" || phase === "over");
  return (
    <>
      <Head
        title="Maps"
        sub={busy ? "A match is on: the map changes when it's over" : "Pick the map that stands in the arena"}
      />
      <div className={s.scroll}>
        <div className={s.cards} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {STRIKE_MAPS.map((m) => {
            const standing = m.key === v?.map;
            const going = m.key === v?.next;
            return (
              <button
                key={m.key}
                type="button"
                className={`${s.card} ${s.mapCard}`}
                aria-pressed={standing}
                aria-disabled={busy || standing || !!v?.next}
                onClick={() => !(busy || standing || v?.next) && send("strike:map", { key: m.key })}
              >
                <Radar map={m.key} />
                <span className={`${s.cardTitle} ${s.stencil}`}>{m.name}</span>
                <span className={s.cardMeta}>
                  {MODE_LINE[m.mode]} · {CLIMATE[m.key]}
                </span>
                <span className={s.cardText}>{m.plays}</span>
                {going && <span className={s.tag}>Going up…</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Record({ v }: { v: StrikeView | null }) {
  let last: { map: string; mode: string; score: number[]; top: string; kills: number; at: number }[] = [];
  try {
    last = v?.record ? (JSON.parse(v.record).last ?? []) : [];
  } catch {
    last = [];
  }
  let card: StrikeCard | null = null;
  try {
    card = v?.card ? (JSON.parse(v.card) as StrikeCard) : null;
  } catch {
    card = null;
  }
  const today = dayOf(Date.now());
  const missions = missionsOf(today);
  const r = rankOf(card?.xp ?? 0);
  return (
    <>
      <Head
        title="Record"
        sub={card ? `${card.name} · ${r.rank.name} · ${card.xp} XP` : "Your rank, your stats, the day's missions"}
      />
      <div className={s.scroll}>
        {/* (plan 115 phase 96) my rank: its badge, how far to the next */}
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>Rank</p>
          <div className={s.row} style={{ alignItems: "center", gap: 16 }}>
            <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">
              <path
                d="M27 3 L49 14 V34 C49 44 38 50 27 52 C16 50 5 44 5 34 V14 Z"
                style={{ fill: "var(--strike-badge)" }}
                stroke={r.rank.colour}
                strokeWidth="2.5"
              />
              {Array.from({ length: r.rank.marks }, (_, i) => (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: the rank's chevrons are alike; their place is all they are
                  key={i}
                  d={`M15 ${16 + i * 5.5} L27 ${22 + i * 5.5} L39 ${16 + i * 5.5}`}
                  fill="none"
                  stroke={r.rank.colour}
                  strokeWidth="2.6"
                />
              ))}
            </svg>
            <div style={{ flex: 1 }}>
              <div className={s.stencil} style={{ fontSize: 22 }}>
                {r.rank.name}
              </div>
              <div style={{ height: 6, background: "rgba(233,220,192,.12)", borderRadius: 3, margin: "6px 0" }}>
                <div
                  style={{
                    width: `${Math.round(r.into * 100)}%`,
                    height: "100%",
                    background: r.rank.colour,
                    borderRadius: 3,
                  }}
                />
              </div>
              <span className={s.note}>
                {r.next ? `${r.next.xp - (card?.xp ?? 0)} XP to ${r.next.name}` : "The top of the ladder"}
              </span>
            </div>
          </div>
        </div>
        {/* (phase 97) the day's missions: the same three for everyone today */}
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>Today's missions</p>
          {missions.map((m) => {
            const fresh = card?.day === today;
            const got = fresh ? (card?.progress[m.id] ?? 0) : 0;
            const done = fresh && !!card?.paid.includes(m.id);
            return (
              <div
                key={m.id}
                className={s.player}
                style={{ fontSize: 15, padding: "8px 4px", opacity: done ? 0.6 : 1 }}
              >
                <span>
                  {done ? "✓ " : ""}
                  {m.text}
                </span>
                <span>
                  <b>
                    {Math.min(got, m.need)}/{m.need}
                  </b>{" "}
                  <em>· {m.xp} XP</em>
                </span>
              </div>
            );
          })}
        </div>
        {card && card.matches > 0 && (
          <div className={s.section}>
            <p className={`${s.label} ${s.stencil}`}>Stats</p>
            <div className={s.player} style={{ fontSize: 15, padding: "8px 4px" }}>
              <span>
                {card.matches} matches · {card.wins} won
              </span>
              <span>
                <b>
                  {card.kills} / {card.deaths}
                </b>{" "}
                <em>
                  · K/D {(card.kills / Math.max(1, card.deaths)).toFixed(2)} ·{" "}
                  {Math.round((card.heads / Math.max(1, card.kills)) * 100)}% heads
                </em>
              </span>
            </div>
            {Object.entries(card.guns)
              .sort((a, b) => b[1] - a[1])
              .map(([g, n]) => (
                <div key={g} className={s.player} style={{ fontSize: 14, padding: "6px 4px" }}>
                  <span>{GUN_NAME[g] ?? g}</span>
                  <span>
                    <b>{n}</b> <em>kills</em>
                  </span>
                </div>
              ))}
            {Object.entries(card.maps).map(([k, [n, w]]) => (
              <div key={k} className={s.player} style={{ fontSize: 14, padding: "6px 4px" }}>
                <span>{strikeMap(k).name}</span>
                <span>
                  <b>
                    {w}/{n}
                  </b>{" "}
                  <em>won</em>
                </span>
              </div>
            ))}
          </div>
        )}
        {card && card.history.length > 0 && (
          <div className={s.section}>
            <p className={`${s.label} ${s.stencil}`}>Your last matches</p>
            {card.history.map((h) => (
              <div key={h.at} className={s.player} style={{ fontSize: 14, padding: "6px 4px" }}>
                <span>
                  {h.won ? "Won" : "Lost"} · {strikeMap(h.map).name} · {MODES[h.mode as ModeId]?.name ?? h.mode}
                </span>
                <span>
                  <b>
                    {h.k}–{h.d}
                  </b>{" "}
                  <em>· +{h.xp} XP</em>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>On the wall here</p>
          {!last.length && <p className={s.note}>No match finished yet. Be the first on the wall.</p>}
          {last.map((r) => (
            <div key={r.at} className={s.player} style={{ fontSize: 15, padding: "10px 4px" }}>
              <span>
                {strikeMap(r.map).name} · {MODES[r.mode as ModeId]?.name ?? r.mode}
              </span>
              <span>
                <b>{r.score.join(" – ")}</b>{" "}
                <em>
                  · top {r.top} ({r.kills})
                </em>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const GUN_NAME: Record<string, string> = {
  revolver: "Revolver",
  shotgun: "Double-barrel",
  ak47: "AK",
  sniper: "Sniper",
  daybreak: "Daybreak",
  knife: "Knife",
  he: "HE grenade",
  molotov: "Molotov",
};

/** (plan 119, F1a) CS's bot_quota with fill: how many players the match keeps — people first, Vortex bots the rest,
 *  split evenly. From 1 (me alone) to the mode's full size. */
function Quota({ v, send, open }: { v: StrikeView; send: Send; open: boolean }) {
  const mode = MODES[v.mode as ModeId] ?? MODES.competitive;
  const full = mode.max + (mode.maxW ?? mode.max);
  const n = v.quota > 0 ? Math.min(v.quota, full) : full;
  const people = v.members.filter((m) => !m.bot).length;
  const set = (k: number) => send("strike:settings", { quota: k >= full ? 0 : Math.max(1, k) });
  const bots = Math.max(0, n - people);
  return (
    <div className={s.seg} title="Players in the match: people first, Vortex bots fill the rest (CS's bot quota)">
      <button type="button" aria-label="Fewer players" onClick={() => set(n - 1)} disabled={!open || n <= 1}>
        −
      </button>
      <button type="button" aria-pressed="false" tabIndex={-1} className={s.quotaN}>
        {n} players{people > 0 && bots > 0 ? ` · ${bots} bot${bots === 1 ? "" : "s"}` : ""}
      </button>
      <button type="button" aria-label="More players" onClick={() => set(n + 1)} disabled={!open || n >= full}>
        +
      </button>
    </div>
  );
}

function How() {
  const keys: [string, string][] = [
    ["E at the desk", "this terminal: join, the mode, the bots"],
    ["W A S D", "move; Shift sprints, Alt (⌃ on a Mac) walks quietly, C or Ctrl crouches"],
    ["Mouse", "aim; left fires (from the hip too), right the sights"],
    ["1 · 2 · 3 · Q", "your primary · your pistol · the knife · the last one"],
    ["3, then the mouse", "the knife: left a quick slash (90 in the back), right a heavy stab (a kill in the back)"],
    ["5, then left (hold)", "the charge out, planted on a site: 3 s, still and crouched"],
    ["R", "reload"],
    ["B", "buy (in your spawn, in the buy time)"],
    ["E (hold)", "defuse the charge (10 s, 5 s with a kit) · take a hostage"],
    ["G", "drop the gun in hand (5 then G: the charge)"],
    ["F", "inspect your gun"],
    ["4 / N", "a grenade in hand (again: the next) · click to throw, right click lobs it (or hold J; Shift: short)"],
    ["K", "first person ↔ over the shoulder"],
    ["U then 1–9, 0", "the radio: ten calls and commands"],
    ["Tab", "the scoreboard"],
    ["F3", "ready up in the warmup (everyone ready: a 5 s count, then it starts)"],
    ["V then 1–3", "the warmup's map vote: the map we play"],
    ["1–3 (at the end)", "vote the next map"],
    ["Esc", "the match menu: leave, settings"],
  ];
  return (
    <>
      <Head title="How to play" sub="Two teams, rounds, money — the first to win the rounds needed takes the match" />
      <div className={s.scroll}>
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>The rules</p>
          <p className={s.note}>
            The <b style={{ color: "var(--strike-raiders)" }}>Raiders</b> carry the charge: plant it on site A or B and
            keep it there 40 s, or take out every Warden. The <b style={{ color: "var(--strike-wardens)" }}>Wardens</b>{" "}
            stop them: hold the sites, defuse the charge (10 s, 5 s with a kit), or let the clock run out. On hostage
            maps the Wardens bring a hostage out. Win rounds to earn money; lose and you still get a bonus that grows.
            Buy at the start of each round. The sides swap at half time.
          </p>
          <p className={s.note}>
            The lobby: the armory sets your kit and loadout, the briefing hall flies you over the map, the trophy hall
            keeps the records, the war room watches the match; the range has an aim drill, the painted pad a plant and
            defuse drill (E at each).
          </p>
        </div>
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>The keys</p>
          <div className={s.keys}>
            {keys.map(([k, d]) => (
              <span key={k} style={{ display: "contents" }}>
                <kbd>{k}</kbd>
                <span>{d}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** The park's own settings (kept on this device). */
export function strikePrefs(): {
  crosshair: string;
  size: number;
  color: string;
  hitmarker: boolean;
  blood: boolean;
  flash: string;
  loadout: { r: string[]; w: string[] };
} {
  // (plan 118, F7a/F9a: the hit marker and the blood each a choice, on by default; F10a: the armory's loadout —
  // each side's buy, in order, bought with one key in the buy screen)
  const base = {
    crosshair: "cross",
    size: 1,
    color: "#9cf06a",
    hitmarker: true,
    blood: true,
    flash: "white",
    loadout: { r: ["ak47", "helmet", "smoke", "flash"], w: ["ak47", "helmet", "kit", "smoke"] },
  };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem("yutopia:strike") ?? "{}") };
  } catch {
    return base;
  }
}
/** Some prefs changed, kept (a private window: for now only). */
function putPrefs(patch: Partial<ReturnType<typeof strikePrefs>>) {
  const n = { ...strikePrefs(), ...patch };
  try {
    localStorage.setItem("yutopia:strike", JSON.stringify(n));
  } catch {
    /* private window */
  }
  return n;
}
function Settings() {
  const [p, setP] = useState(strikePrefs);
  const put = (patch: Partial<ReturnType<typeof strikePrefs>>) => {
    const n = { ...p, ...patch };
    setP(n);
    try {
      localStorage.setItem("yutopia:strike", JSON.stringify(n));
    } catch {
      /* private window: for now only */
    }
  };
  return (
    <>
      <Head title="Settings" sub="The park's own — kept on this device" />
      <div className={s.scroll}>
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>Crosshair</p>
          <div className={s.row}>
            <div className={s.seg}>
              {["cross", "dot", "circle"].map((c) => (
                <button key={c} type="button" aria-pressed={p.crosshair === c} onClick={() => put({ crosshair: c })}>
                  {c}
                </button>
              ))}
            </div>
            <div className={s.seg}>
              {[0.8, 1, 1.4].map((z) => (
                <button key={z} type="button" aria-pressed={p.size === z} onClick={() => put({ size: z })}>
                  {z === 0.8 ? "small" : z === 1 ? "medium" : "large"}
                </button>
              ))}
            </div>
            <div className={s.seg}>
              {["#9cf06a", "#ffffff", "#f5d33a", "#5ad1ff", "#ff6a8a"].map((c) => (
                <button key={c} type="button" aria-pressed={p.color === c} onClick={() => put({ color: c })}>
                  <span style={{ display: "inline-block", width: 14, height: 14, background: c, borderRadius: 2 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={s.section}>
          <p className={`${s.label} ${s.stencil}`}>Hits</p>
          <div className={s.row}>
            <div className={s.seg}>
              <button type="button" aria-pressed={p.hitmarker} onClick={() => put({ hitmarker: true })}>
                Hit marker on
              </button>
              <button type="button" aria-pressed={!p.hitmarker} onClick={() => put({ hitmarker: false })}>
                Off (CS's: sound and blood only)
              </button>
            </div>
            <div className={s.seg}>
              <button type="button" aria-pressed={p.blood} onClick={() => put({ blood: true })}>
                Blood
              </button>
              <button type="button" aria-pressed={!p.blood} onClick={() => put({ blood: false })}>
                No blood
              </button>
            </div>
            <div className={s.seg}>
              <button type="button" aria-pressed={p.flash !== "dark"} onClick={() => put({ flash: "white" })}>
                Flash: white
              </button>
              <button type="button" aria-pressed={p.flash === "dark"} onClick={() => put({ flash: "dark" })}>
                Flash: dark (easier on the eyes)
              </button>
            </div>
          </div>
        </div>
        <p className={s.note}>First person or over the shoulder: K in the match.</p>
      </div>
    </>
  );
}

// ── the Map Board ──
export function StrikeBoard() {
  const v = useHud((st) => st.strike);
  const send = useSend();
  useEsc(close);
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className={`${s.frame} ${s.wide}`} role="dialog" aria-modal="true" aria-label="The Map Board">
        <div className={s.body}>
          <Maps v={v} send={send} />
        </div>
      </section>
    </div>
  );
}

// ── the match's Esc menu ──
export function StrikeEsc() {
  const v = useHud((st) => st.strike);
  const send = useSend();
  const [sure, setSure] = useState(false);
  useEsc(close);
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className={`${s.frame} ${s.small}`} role="dialog" aria-modal="true" aria-label="The match">
        <Head
          title="The match"
          sub={`${strikeMap(v?.map ?? "sawmill").name} · ${MODES[(v?.mode ?? "competitive") as ModeId]?.name} · ${v?.scoreR ?? 0} – ${v?.scoreW ?? 0}`}
        />
        <div className={s.big}>
          <button type="button" className={`${s.btn} ${s.primary} ${s.stencil}`} onClick={close}>
            Back to the match
          </button>
          {v?.phase === "warmup" && (
            <button
              type="button"
              className={`${s.btn} ${s.stencil}`}
              onClick={() => (send("strike:ready", { on: true }), close())}
            >
              I'm ready (F3)
            </button>
          )}
          <button
            type="button"
            className={`${s.btn} ${s.stencil}`}
            onClick={() => hud.set({ panel: { kind: "strike", objectId: "strike" } })}
          >
            The terminal (mode, bots, how to play)
          </button>
          {/* (plan 118, phase 17) the team votes */}
          {v?.me && v.timeouts >= 0 && v.phase !== "warmup" && v.phase !== "over" && (
            <div className={s.section} style={{ width: "100%" }}>
              <p className={`${s.label} ${s.stencil}`}>Team votes</p>
              {v.call ? (
                <div className={s.row} style={{ justifyContent: "center" }}>
                  <span className={s.note}>
                    {v.call.by} calls{" "}
                    {v.call.kind === "timeout"
                      ? "a timeout"
                      : v.call.kind === "surrender"
                        ? "to surrender"
                        : `to kick ${v.call.target}`}{" "}
                    · {v.call.yes}/{v.call.need}
                  </span>
                  {v.call.team === v.me.team && (
                    <>
                      <button
                        type="button"
                        className={`${s.btn} ${s.stencil}`}
                        onClick={() => send("strike:ballot", { yes: true })}
                      >
                        Yes (F1)
                      </button>
                      <button
                        type="button"
                        className={`${s.btn} ${s.stencil}`}
                        onClick={() => send("strike:ballot", { yes: false })}
                      >
                        No (F2)
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className={s.row} style={{ justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`${s.btn} ${s.stencil}`}
                    disabled={v.timeouts <= 0}
                    onClick={() => (send("strike:call", { kind: "timeout" }), close())}
                  >
                    Timeout · {v.timeouts} left
                  </button>
                  <button
                    type="button"
                    className={`${s.btn} ${s.danger} ${s.stencil}`}
                    onClick={() => (send("strike:call", { kind: "surrender" }), close())}
                  >
                    Surrender
                  </button>
                  {v.members
                    .filter((m) => m.bot && m.team === v.me?.team)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`${s.btn} ${s.stencil}`}
                        onClick={() => (send("strike:call", { kind: "kick", target: m.id }), close())}
                      >
                        Kick {m.name}
                      </button>
                    ))}
                </div>
              )}
              <p className={s.note}>
                Your side votes: a timeout (30 s, at the next freeze), a surrender (everyone on your side), a bot out
                (most of you). F1 yes, F2 no.
              </p>
            </div>
          )}
          {/* (plan 115 phase 19) the first match's checklist: again, or away */}
          <div className={s.row} style={{ justifyContent: "center" }}>
            <button
              type="button"
              className={`${s.btn} ${s.stencil}`}
              onClick={() => (dispatchEvent(new CustomEvent("strike:tutorial", { detail: "start" })), close())}
            >
              Tutorial again
            </button>
            <button
              type="button"
              className={`${s.btn} ${s.stencil}`}
              onClick={() => (dispatchEvent(new CustomEvent("strike:tutorial", { detail: "skip" })), close())}
            >
              Skip the tutorial
            </button>
          </div>
          {!sure ? (
            <button type="button" className={`${s.btn} ${s.danger} ${s.stencil}`} onClick={() => setSure(true)}>
              Leave the match
            </button>
          ) : (
            <div className={s.row} style={{ justifyContent: "center" }}>
              <span className={s.note}>A Vortex bot takes your place. Your pockets come back.</span>
              <button
                type="button"
                className={`${s.btn} ${s.danger} ${s.stencil}`}
                onClick={() => (send("strike:leave", {}), close())}
              >
                Yes, leave
              </button>
              <button type="button" className={`${s.btn} ${s.stencil}`} onClick={() => setSure(false)}>
                Stay
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** (plan 118, F3a) the buy screen, one screen as the user's pick "A" has it (design/strike118/mocks/a-buy.png): each
 *  item a picture, a stats panel for the one under the pointer, two key presses (a column, then the item), a refund
 *  in the buy time (right click), a teammate's "buy me this" shown and bought for them (click their name, then the
 *  item), mine asked of them (Alt + click). */
const BUY_COLS = [
  ["pistols", "Pistols"],
  ["mid", "Mid-tier"],
  ["rifles", "Rifles"],
  ["gear", "Gear"],
  ["nades", "Grenades"],
] as const;
/** each gun's magazine (the world's: shared strike/bots/aim.ts MAG) */
const MAG: Record<string, number> = { revolver: 6, shotgun: 2, ak47: 30, sniper: 5, daybreak: 3 };
const BLURB: Record<string, string> = {
  revolver: "Six rounds, a heavy hit · deadly to the head close in",
  shotgun: "Two barrels, a fistful of pellets · close quarters only",
  ak47: "Full auto · tap it at range · climbs fast in a spray",
  sniper: "One shot, one kill to the body · slow, scoped, loud",
  daybreak: "Charged, then a burst of light · one a team",
  kevlar: "Takes half of a shot to the body · back to 100",
  helmet: "The vest and a helmet: a headshot no longer one-taps",
  kit: "Defuse in 5 s, not 10",
  he: "98 at its heart, 9 m round · for a group at a corner",
  flash: "Blinds whoever looks at it · up to 4.8 s",
  smoke: "18 s of cover, 4 m round · puts out fire",
  molotov: "Fire on the floor, 7 s · stops a push",
  incendiary: "Fire on the floor, 7 s · stops a push",
  decoy: "Sounds like a gun for 15 s",
};
function itemPic(id: string, big = false) {
  if (id in ARMS)
    return <img src={artSrc(id as ItemId)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
  const g = id === "kevlar" ? "vest" : id === "helmet" ? "helmet" : id === "kit" ? "kit" : id;
  return (
    <span
      style={{ display: "block", height: big ? 56 : 30, color: "var(--paper-dim)", margin: "auto" }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: our own glyphs (look.ts)
      dangerouslySetInnerHTML={{ __html: GLYPH[g] ?? "" }}
    />
  );
}
export function StrikeBuy() {
  const v = useHud((st) => st.strike);
  const send = useSend();
  useEsc(close);
  const me = v?.me;
  const items = SHOP.filter((it) => !it.team || it.team === me?.team);
  const [forId, setFor] = useState("");
  const [col, setCol] = useState(-1);
  const [hover, setHover] = useState("ak47");
  const buyIt = (id: string, alt: boolean) => {
    if (alt) return send("strike:want", { item: me?.want === id ? "" : id });
    // (the teammate chosen died with the screen open: it's for me again, as the screen shows — or every pick was
    // refused unseen; the double check 2)
    const mate = forId ? v?.members.find((m) => m.id === forId && m.alive && !m.me) : undefined;
    send("strike:buy", { item: id, ...(mate ? { for: mate.id } : {}) });
  };
  // (plan 118, F10a) the armory's loadout: what I haven't got of it, in its order, as far as the money goes
  const loadout = (me ? strikePrefs().loadout[me.team] : []) ?? [];
  const buyLoadout = () => {
    if (!me) return;
    let money = me.money;
    const free0 = v?.phase === "warmup" || v?.mode === "deathmatch";
    for (const id of loadout) {
      const it = SHOP.find((x) => x.id === id);
      if (!it || (it.team && it.team !== me.team)) continue;
      if (me.primary === id || me.pistol === id || (id === "helmet" && me.helmet) || (id === "kit" && me.kit)) continue;
      if (id === "kevlar" && me.armor >= 100) continue;
      if (!free0 && money < it.price) continue;
      if (!free0) money -= it.price;
      send("strike:buy", { item: id });
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "KeyB") {
        e.preventDefault();
        close();
        return;
      }
      if (e.code === "Backspace") return setCol(-1);
      if (e.code === "KeyR" && col < 0) {
        e.preventDefault();
        buyLoadout();
        return;
      }
      const n = Number(e.key);
      if (!(n >= 1 && n <= 9)) return;
      e.preventDefault();
      if (col < 0) {
        if (n <= BUY_COLS.length) setCol(n - 1);
        return;
      }
      const list = items.filter((it) => it.col === BUY_COLS[col][0]);
      const it = list[n - 1];
      if (it) {
        setHover(it.id);
        buyIt(it.id, false);
      }
      setCol(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  if (!me || !v) return null;
  const mates = v.members.filter((m) => m.team === me.team && !m.me);
  const target = mates.find((m) => m.id === forId && m.alive) ?? me;
  const has = (id: string) =>
    target.primary === id ||
    target.pistol === id ||
    (id === "kevlar" && target.armor >= 100) ||
    (id === "helmet" && target.helmet) ||
    (id === "kit" && target.kit);
  const free = v.phase === "warmup" || v.mode === "deathmatch";
  const shown = SHOP.find((it) => it.id === hover) ?? items[0];
  const A = shown && shown.id in ARMS ? ARMS[shown.id as keyof typeof ARMS] : null;
  const bar = (label: string, val: number, max: number, text: string) => (
    <div className={s.bsBar}>
      <span>{label}</span>
      <b>{text}</b>
      <i>
        <i style={{ width: `${Math.min(100, (val / max) * 100)}%` }} />
      </i>
    </div>
  );
  const tc = me.team === "r" ? "var(--strike-raiders)" : "var(--strike-wardens)";
  return (
    <div className={s.bsScrim} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className={s.bs} role="dialog" aria-modal="true" aria-label="Buy">
        <header className={s.bsHead}>
          <h2 className={s.stencil}>
            Buy <span style={{ color: tc }}>· {TEAMS[me.team].name}</span>
          </h2>
          <p>
            {free ? (
              "Free in the warmup"
            ) : v.canBuy ? (
              <>
                Buy time <b>{`${Math.floor(v.buyLeft / 60)}:${String(v.buyLeft % 60).padStart(2, "0")}`}</b> · next
                round at least <b className={s.bsGood}>${v.nextLeast.toLocaleString("en-US")}</b>
              </>
            ) : (
              "You can't buy here or now — in your spawn, in the buy time"
            )}
          </p>
          <span className={`${s.stencil} ${s.bsMoney}`}>${me.money.toLocaleString("en-US")}</span>
        </header>
        <div className={s.bsBody}>
          {BUY_COLS.map(([c, title], ci) => (
            <div key={c} className={s.bsCol} data-on={col === ci || undefined}>
              <h4 className={s.stencil}>
                <kbd>{ci + 1}</kbd> {title}
              </h4>
              {items
                .filter((it) => it.col === c)
                .map((it, ii) => {
                  const owned = has(it.id);
                  const poor = !free && me.money < it.price;
                  const off = owned || !v.canBuy || poor;
                  const refundable = target === me && me.refunds.includes(it.id);
                  const wanted = mates.filter((m) => m.want === it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={s.bsItem}
                      data-off={off || undefined}
                      data-hover={hover === it.id || undefined}
                      onPointerEnter={() => setHover(it.id)}
                      onClick={(e) => {
                        if (e.altKey) return buyIt(it.id, true);
                        if (!off) buyIt(it.id, false);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (refundable) send("strike:refund", { item: it.id });
                      }}
                    >
                      <kbd>{ii + 1}</kbd>
                      {owned && (
                        <em className={s.bsOwned}>
                          {target !== me ? "They have it" : refundable ? "Bought · right click: refund" : "Owned"}
                        </em>
                      )}
                      {me.want === it.id && <em className={s.bsWant}>Asked for</em>}
                      <span className={s.bsPic}>{itemPic(it.id)}</span>
                      <span className={s.bsName}>
                        <span>{it.name}</span>
                        <b data-poor={poor || undefined}>${it.price}</b>
                      </span>
                      {wanted.length > 0 && (
                        <span className={s.bsWanted}>{wanted.map((m) => m.name).join(", ")} wants it</span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
          {shown && (
            <aside className={s.bsStats}>
              <div className={s.bsStatsPic}>{itemPic(shown.id, true)}</div>
              <h3 className={s.stencil}>{shown.name}</h3>
              <p>{BLURB[shown.id] ?? ""}</p>
              {A && (
                <>
                  {bar(
                    "Damage",
                    A.damage * Math.max(1, A.pellets),
                    120,
                    A.pellets > 1 ? `${A.damage}×${A.pellets}` : String(A.damage),
                  )}
                  {bar("Fire rate (rpm)", 60 / A.rate, 700, String(Math.round(60 / A.rate)))}
                  {bar("Range (m)", A.range, 150, String(A.range))}
                  {bar("Moving speed", shown.speed ?? 6, 6.4, `${Math.round(((shown.speed ?? 6) / 6.35) * 250)}`)}
                </>
              )}
              <dl>
                {shown.reward ? (
                  <>
                    <dt>Kill reward</dt>
                    <dd className={s.bsGood}>+${shown.reward}</dd>
                  </>
                ) : null}
                {MAG[shown.id] ? (
                  <>
                    <dt>Magazine</dt>
                    <dd>{MAG[shown.id]}</dd>
                  </>
                ) : null}
                {shown.carry ? (
                  <>
                    <dt>Carry</dt>
                    <dd>{shown.carry}</dd>
                  </>
                ) : null}
                <dt>Price</dt>
                <dd>${shown.price}</dd>
              </dl>
            </aside>
          )}
        </div>
        <div className={s.bsTeam}>
          {loadout.length > 0 && (
            <button type="button" onClick={buyLoadout} title="Set it in the armory">
              <kbd>R</kbd> <b>My loadout</b>{" "}
              <span>
                · {loadout.map((id) => SHOP.find((x) => x.id === id)?.name ?? id).join(", ")} · $
                {loadout.reduce((t, id) => t + (SHOP.find((x) => x.id === id)?.price ?? 0), 0).toLocaleString("en-US")}
              </span>
            </button>
          )}
          <button type="button" aria-pressed={!forId} onClick={() => setFor("")}>
            <b style={{ color: tc }}>Me</b> ${me.money.toLocaleString("en-US")}
          </button>
          {mates.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={forId === m.id}
              disabled={!m.alive}
              onClick={() => setFor(forId === m.id ? "" : m.id)}
              data-want={m.want || undefined}
            >
              <b style={{ color: tc }}>{m.name}</b> ${m.money.toLocaleString("en-US")}
              {m.want ? <span> · wants {SHOP.find((x) => x.id === m.want)?.name ?? m.want}</span> : null}
            </button>
          ))}
        </div>
        <p className={s.bsKeys}>
          <kbd>1</kbd>–<kbd>5</kbd> a column, then <kbd>1</kbd>–<kbd>5</kbd> the item · <kbd>R</kbd> my loadout · right
          click: refund in the buy time · a teammate's name, then an item: buy it for them · <kbd>Alt</kbd> + click: ask
          your team for it · <kbd>B</kbd> or <kbd>Esc</kbd> closes
        </p>
      </section>
    </div>
  );
}

/** (plan 118, F10a) The armory's loadout: each side's buy, picked in order — R in the buy screen buys it. */
function Loadout({ team }: { team: "r" | "w" }) {
  const [lo, setLo] = useState(() => strikePrefs().loadout);
  const mine = lo[team] ?? [];
  const toggle = (id: string) => {
    const it = SHOP.find((x) => x.id === id);
    let next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
    // (one primary, one of the two vests)
    if (it?.slot === "primary" && !mine.includes(id))
      next = next.filter((x) => x === id || SHOP.find((y) => y.id === x)?.slot !== "primary");
    if ((id === "kevlar" || id === "helmet") && !mine.includes(id))
      next = next.filter((x) => x === id || (x !== "kevlar" && x !== "helmet"));
    const n = { ...lo, [team]: next };
    setLo(n);
    putPrefs({ loadout: n });
  };
  const total = mine.reduce((t, id) => t + (SHOP.find((x) => x.id === id)?.price ?? 0), 0);
  return (
    <div className={s.section}>
      <p className={`${s.label} ${s.stencil}`}>
        Loadout · {TEAMS[team].name} · ${total.toLocaleString("en-US")}
      </p>
      <div className={s.seg} style={{ flexWrap: "wrap" }}>
        {SHOP.filter((it) => !it.team || it.team === team).map((it) => (
          <button key={it.id} type="button" aria-pressed={mine.includes(it.id)} onClick={() => toggle(it.id)}>
            {mine.includes(it.id) ? `${mine.indexOf(it.id) + 1}. ` : ""}
            {it.name}
          </button>
        ))}
      </div>
      <p className={s.note}>
        Bought in this order with <b>R</b> in the buy screen, as far as your money goes (what you have is skipped).
      </p>
    </div>
  );
}

// ── the customization corner's panel (plan 115 phase 55) ──
const CHARM_NAME: Record<string, string> = {
  none: "None",
  pine: "Pine",
  flake: "Snowflake",
  die: "Die",
  paw: "Bear paw",
  vortex: "Vortex",
};
const PATTERN_NAME: Record<string, string> = {
  none: "Plain",
  stripes: "Stripes",
  check: "Check",
  trim: "Trim",
  dots: "Dots",
};
export function StrikeKitPanel() {
  const v = useHud((st) => st.strike);
  const send = useSend();
  useEsc(close);
  const [k, setK] = useState<StrikeKit>(() =>
    kitOf(strikeKeys.myKit || (v?.card ? (JSON.parse(v.card) as { kit?: string }).kit : "") || ""),
  );
  const [team, setTeam] = useState<"r" | "w">((strikeKeys.kitTry as "r" | "w" | null) ?? "r");
  const put = (next: StrikeKit) => {
    setK(next);
    strikeKeys.myKit = kitString(next);
    send("strike:kit", { kit: kitString(next) });
  };
  const pick = (t: "r" | "w") => {
    setTeam(t);
    strikeKeys.kitTry = t;
  };
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className={`${s.frame} ${s.small}`} role="dialog" aria-modal="true" aria-label="Your kit">
        <Head title="Your kit" sub="Worn in every match · look in the mirror · your loadout below" />
        <div className={s.scroll}>
          <div className={s.section}>
            <p className={`${s.label} ${s.stencil}`}>Try it in</p>
            <div className={s.seg}>
              <button type="button" aria-pressed={team === "r"} onClick={() => pick("r")}>
                {TEAMS.r.name}
              </button>
              <button type="button" aria-pressed={team === "w"} onClick={() => pick("w")}>
                {TEAMS.w.name}
              </button>
            </div>
          </div>
          <div className={s.section}>
            <p className={`${s.label} ${s.stencil}`}>Vest</p>
            <div className={s.row}>
              {KIT_SHADES[team].map((c, i) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Shade ${i + 1}`}
                  aria-pressed={k.shade === i}
                  onClick={() => put({ ...k, shade: i })}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 4,
                    background: c,
                    border: k.shade === i ? "3px solid var(--cream)" : "1px solid rgba(233,220,192,.25)",
                  }}
                />
              ))}
            </div>
            <div className={s.seg} style={{ marginTop: 10 }}>
              {KIT_PATTERNS.map((p) => (
                <button key={p} type="button" aria-pressed={k.pattern === p} onClick={() => put({ ...k, pattern: p })}>
                  {PATTERN_NAME[p]}
                </button>
              ))}
            </div>
          </div>
          <div className={s.section}>
            <p className={`${s.label} ${s.stencil}`}>Cap</p>
            <div className={s.seg}>
              <button type="button" aria-pressed={!k.cap} onClick={() => put({ ...k, cap: false })}>
                Your own
              </button>
              <button type="button" aria-pressed={k.cap} onClick={() => put({ ...k, cap: true })}>
                Team cap
              </button>
            </div>
          </div>
          <div className={s.section}>
            <p className={`${s.label} ${s.stencil}`}>Charm on your gun</p>
            <div className={s.seg}>
              {KIT_CHARMS.map((c) => (
                <button key={c} type="button" aria-pressed={k.charm === c} onClick={() => put({ ...k, charm: c })}>
                  {CHARM_NAME[c]}
                </button>
              ))}
            </div>
            <p className={s.note}>Draw a gun at the mirror to see it hang.</p>
          </div>
          <Loadout team={team} />
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.stencil}`} onClick={() => put(DEFAULT_KIT)}>
              Back to plain
            </button>
            <button type="button" className={`${s.btn} ${s.primary} ${s.stencil}`} onClick={close}>
              Done
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
