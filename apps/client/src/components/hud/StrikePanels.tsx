"use client";

// The Strike Park's menus (docs/plan/115-the-strike-park-again.md, arcs A–B): the game's own panels (hud.panel), fed
// by the park's snapshot (hud.strike, written by world/strike/strike.ts as the room changes) — so every choice shows
// the moment the room takes it. The desk's terminal (PLAY · MAPS · RECORD · HOW TO PLAY · SETTINGS · LEAVE), the buy
// grid (B), the match's Esc menu, the Map Board. Their skin: the park's own (StrikePanels.module.css, F1).

import { ARMS } from "@yutopia/shared/dark";
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
import { hud, type StrikeView, useHud } from "@/world/store";
import { strikeKeys } from "@/world/strike/flag";
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
  const [tab, setTab] = useState<Tab>("play");
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
                ? "Warmup: shoot about, buy freely. The match starts when everyone's ready (F3) or someone starts it."
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
  shotgun: "Shotgun",
  ak47: "AK",
  sniper: "Sniper",
  daybreak: "Daybreak",
  knife: "Knife",
  he: "HE grenade",
  molotov: "Fire",
};

function How() {
  const keys: [string, string][] = [
    ["X at the desk", "this terminal: join, the mode, the bots"],
    ["W A S D", "move; Shift walks quietly, Ctrl crouches"],
    ["Mouse", "aim; left fires (from the hip too), right the sights"],
    ["1 · 2 · Q", "your primary · your pistol · the last one"],
    ["R", "reload"],
    ["B", "buy (in your spawn, in the buy time)"],
    ["E (hold)", "plant the charge on a site · defuse it · take a hostage"],
    ["G", "drop the charge"],
    ["4 / N · J", "pick a grenade · hold J, let go to throw (Shift: short)"],
    ["K", "first person ↔ over the shoulder"],
    ["U then 1–6", "the radio"],
    ["Tab", "the scoreboard"],
    ["F3", "ready up in the warmup"],
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
export function strikePrefs(): { crosshair: string; size: number; color: string } {
  try {
    return {
      crosshair: "cross",
      size: 1,
      color: "#9cf06a",
      ...JSON.parse(localStorage.getItem("yutopia:strike") ?? "{}"),
    };
  } catch {
    return { crosshair: "cross", size: 1, color: "#9cf06a" };
  }
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

// ── the buy grid (B): by role, CS2's way (F10 of plan 114), number keys pick ──
const ICON: Record<string, ReactNode> = {
  revolver: <path d="M6 14h22l2-3h12v5H30l-3 2v6h-5l-1-6H8z" />,
  shotgun: <path d="M2 13h40v3H26l-2 2H14l-4 6H5l3-7H2z" />,
  ak47: <path d="M2 12h28l3-2h11v3H33v3l3 8h-4l-3-7h-3l-2 4h-4l1-4H10l-4 5H2l3-6H2z" />,
  sniper: <path d="M1 13h44v2H30v2h-4l-2 2H12l-5 5H3l4-6H1zM18 9h10v3H18z" />,
  daybreak: <path d="M4 11h26l6-3h8v9h-8l-6-3h-6l-2 6h-6l2-6H4z" />,
  kevlar: <path d="M14 6h6l3 3 3-3h6l4 6-3 14H13l-3-14z" />,
  helmet: <path d="M9 20c0-8 6-13 14-13s14 5 14 13v2H9z" />,
  kit: <path d="M10 9h26v14H10zM20 5h6v4h-6z" />,
  he: <circle cx="23" cy="16" r="8" />,
  flash: <path d="M18 7h10v18H18z" />,
  smoke: <path d="M17 6h12v20H17z" />,
  molotov: <path d="M20 4h6v6l4 4v12H16V14l4-4z" />,
  incendiary: <path d="M17 6h12v20H17zM20 3h6v3h-6z" />,
  decoy: <path d="M16 8h14v16H16z" />,
};
export function StrikeBuy() {
  const v = useHud((st) => st.strike);
  const send = useSend();
  useEsc(close);
  const me = v?.me;
  const cols = [
    ["pistols", "Pistols"],
    ["mid", "Mid-tier"],
    ["rifles", "Rifles"],
    ["gear", "Gear"],
    ["nades", "Grenades"],
  ] as const;
  const items = SHOP.filter((it) => !it.team || it.team === me?.team);
  // (plan 115 phase 36) bought for a teammate: my money, their hands
  const [forId, setFor] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "KeyB") {
        e.preventDefault();
        close();
      }
      const n = Number(e.key);
      if (n >= 1 && n <= items.length) send("strike:buy", { item: items[n - 1].id, ...(forId ? { for: forId } : {}) });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  if (!me) return null;
  const mates = (v?.members ?? []).filter((m) => m.team === me.team && m.alive && !m.me);
  const target = mates.find((m) => m.id === forId) ?? me;
  const has = (id: string) =>
    target.primary === id ||
    target.pistol === id ||
    (id === "kevlar" && target.armor >= 100) ||
    (id === "helmet" && target.helmet) ||
    (id === "kit" && target.kit);
  return (
    <div
      className={s.scrim}
      style={{ background: "rgba(8,10,9,0.55)" }}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className={`${s.frame} ${s.wide}`}
        style={{ height: "auto", maxHeight: "92vh" }}
        role="dialog"
        aria-modal="true"
        aria-label="Buy"
      >
        <Head
          title={`Buy · ${TEAMS[me.team].name}`}
          sub={v?.canBuy ? "In your spawn, in the buy time" : "You can't buy here or now"}
        >
          <span className={`${s.money} ${s.stencil}`}>${me.money}</span>
        </Head>
        <div className={s.scroll}>
          {mates.length > 0 && (
            <div className={s.row} style={{ marginBottom: 12 }}>
              <span className={`${s.label} ${s.stencil}`} style={{ margin: 0 }}>
                For
              </span>
              <div className={s.seg}>
                <button type="button" aria-pressed={!forId} onClick={() => setFor("")}>
                  Me
                </button>
                {mates.map((m) => (
                  <button key={m.id} type="button" aria-pressed={forId === m.id} onClick={() => setFor(m.id)}>
                    {m.name} · ${m.money}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={s.buyGrid}>
            {cols.map(([col, title]) => (
              <div key={col} className={s.buyCol}>
                <h4 className={s.stencil}>{title}</h4>
                {items
                  .filter((it) => it.col === col)
                  .map((it) => {
                    const owned = has(it.id);
                    const off = owned || !v?.canBuy || me.money < it.price;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className={s.item}
                        aria-pressed={owned}
                        aria-disabled={off}
                        onClick={() => !off && send("strike:buy", { item: it.id, ...(forId ? { for: forId } : {}) })}
                      >
                        <svg viewBox="0 0 46 30" fill="currentColor" aria-hidden="true">
                          {ICON[it.id]}
                        </svg>
                        <span className={s.itemName}>
                          <span className={s.key}>{items.indexOf(it) + 1}</span>
                          {it.name}
                        </span>
                        <span className={s.itemPrice}>${it.price}</span>
                        <span className={s.itemMeta}>
                          {owned
                            ? forId
                              ? "They have it"
                              : "Yours"
                            : it.reward
                              ? `Kill reward $${it.reward}`
                              : it.carry
                                ? `Carry ${it.carry}`
                                : ""}
                        </span>
                        {it.id in ARMS && (
                          <span className={s.itemMeta}>
                            {(() => {
                              const A = ARMS[it.id as keyof typeof ARMS];
                              return `dmg ${A.damage}${A.pellets > 1 ? `×${A.pellets}` : ""} · ${Math.round(60 / A.rate)} rpm · ${A.range} m`;
                            })()}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          <p className={s.note} style={{ marginTop: 10 }}>
            B or Esc closes. The number on each picks it.
          </p>
        </div>
      </section>
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
        <Head title="Your kit" sub="Worn in every match · look in the mirror" />
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
