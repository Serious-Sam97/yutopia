"use client";

import { biIn } from "@yutopia/shared/npc";
import { useEffect, useRef } from "react";
import { useLang, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";

// A placed NPC's card, as The Sims has it (docs/plan/123-npcs-alive.md, F8b): who they are, what they're at, their
// mood and needs as bars, their work and shift, their home, who they are by nature, and how they feel about me — asked
// of the server again every couple of seconds while it's open (`npc:about`). A side card, not a modal: you walk on.

// (its own words: loaded with it, not with the page — plan 123's budget)
const WORDS: Record<string, [string, string]> = {
  npcNeeds: ["Needs", "Necessidades"],
  npcBond: ["You and them", "Vocês dois"],
  npcMet: ["met {n}×", "encontros: {n}"],
  npcLife: ["Their life", "A vida"],
  npcWorkAt: ["Work", "Trabalho"],
  npcHomeAt: ["Home", "Casa"],
  npcNoJob: ["None", "Nenhum"],
  npcNoHome: ["None", "Nenhuma"],
  npcNeed_hunger: ["Hunger", "Fome"],
  npcNeed_thirst: ["Thirst", "Sede"],
  npcNeed_energy: ["Energy", "Energia"],
  npcNeed_fun: ["Fun", "Diversão"],
  npcNeed_social: ["Social", "Social"],
  npcNeed_comfort: ["Comfort", "Conforto"],
  npcDoing_work: ["working", "trabalhando"],
  npcDoing_home: ["at home", "em casa"],
  "npcDoing_going-home": ["going home", "indo para casa"],
  npcDoing_coffee: ["having a coffee", "tomando um café"],
  npcDoing_meal: ["having a meal", "comendo"],
  npcDoing_drink: ["having a drink", "tomando um drink"],
  npcDoing_shop: ["shopping", "fazendo compras"],
  npcDoing_read: ["reading", "lendo"],
  npcDoing_bench: ["resting on a bench", "descansando num banco"],
  npcDoing_chat: ["chatting", "conversando"],
  npcDoing_sleep: ["asleep", "dormindo"],
  "npcDoing_eat-home": ["eating at home", "comendo em casa"],
  npcDoing_stroll: ["about their day", "no dia a dia"],
  npcTrait_outgoing_hi: ["Outgoing", "Extrovertido"],
  npcTrait_outgoing_lo: ["Shy", "Tímido"],
  npcTrait_active_hi: ["Active", "Ativo"],
  npcTrait_active_lo: ["Laid-back", "Tranquilo"],
  npcTrait_neat_hi: ["Neat", "Organizado"],
  npcTrait_neat_lo: ["Messy", "Bagunceiro"],
  npcTrait_cheerful_hi: ["Cheerful", "Alegre"],
  npcTrait_cheerful_lo: ["Grumpy", "Ranzinza"],
};
const NEEDS = ["hunger", "thirst", "energy", "fun", "social", "comfort"] as const;
const TRAITS = ["outgoing", "active", "neat", "cheerful"] as const;
const MOOD_ICON: Record<string, string> = { happy: "😄", fine: "🙂", uneasy: "😕", sad: "😢", cross: "😠" };

function Bar({ v, lo = 0, hi = 100 }: { v: number; lo?: number; hi?: number }) {
  const k = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const colour = k > 0.6 ? "var(--good)" : k > 0.3 ? "var(--amber)" : "var(--bad)";
  return (
    <span className="block h-2 rounded-full overflow-hidden" style={{ background: "var(--track)" }}>
      <span className="block h-full rounded-full" style={{ width: `${Math.round(k * 100)}%`, background: colour }} />
    </span>
  );
}

export function NpcCard({ objectId }: { objectId: string }) {
  const t = useTr();
  const pt = useLang() === "pt";
  const w = useWorld();
  // (theirs, kept while another's comes in — a menu opened on someone else —: the card stays as it was)
  const now = useHud((s) => (s.npcAbout?.id === objectId ? s.npcAbout : null));
  const kept = useRef<typeof now>(null);
  if (now) kept.current = now;
  else if (kept.current?.id !== objectId) kept.current = null;
  const a = now ?? kept.current;
  const close = () => hud.set({ panel: { kind: null } });
  useEffect(() => {
    if (!objectId) return;
    const ask = () => {
      // (gone — deleted, unplaced —: the card with them)
      if (w?.room && !w.room.state.npcs?.get(objectId)) return hud.set({ panel: { kind: null } });
      w?.send("npc:about", { id: objectId });
    };
    ask();
    const i = setInterval(ask, 2000);
    return () => clearInterval(i);
  }, [w, objectId]);
  if (!a) return null;
  // (the card's own words, else the page's: a job, a mood, a bond)
  const tt = (k: string) => (WORDS[k] ? WORDS[k][pt ? 1 : 0] : t(k as never));
  const role = biIn(a.role, pt);
  return (
    <aside
      className="pointer-events-auto cabinet absolute right-3 top-24 w-[min(320px,calc(100vw-24px))] p-3 rise"
      aria-label={a.name}
      data-npc-card={a.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="lcd text-2xl leading-none truncate">{a.name}</h2>
          {role && (
            <p className="mono text-xs mt-1 truncate" style={{ color: "var(--cream-dim)" }}>
              {role}
            </p>
          )}
        </div>
        <button type="button" className="ghost-btn" onClick={close} aria-label={t("close")}>
          ✕
        </button>
      </div>
      <p className="text-[13px] mt-2" data-npc-mood={a.mood}>
        <span aria-hidden>{MOOD_ICON[a.mood] ?? "🙂"}</span> {tt(`npcMood_${a.mood}`)}
        {a.doing && <span style={{ color: "var(--cream-dim)" }}> · {tt(`npcDoing_${a.doing}`)}</span>}
      </p>
      <p className="grp mt-3">{tt("npcNeeds")}</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center mt-1">
        {NEEDS.map((k) => (
          <div key={k} className="contents" data-npc-need={k} data-v={a.needs[k] ?? 0}>
            <span className="text-[12px]">{tt(`npcNeed_${k}`)}</span>
            <Bar v={a.needs[k] ?? 0} />
          </div>
        ))}
      </div>
      <p className="grp mt-3">{tt("npcBond")}</p>
      <div className="mt-1" data-npc-bond={a.bond.level}>
        <div className="flex justify-between text-[12px]">
          <span>{tt(`npcBond_${a.bond.level}`)}</span>
          <span style={{ color: "var(--cream-dim)" }}>{tt("npcMet").replace("{n}", String(a.bond.n))}</span>
        </div>
        <Bar v={a.bond.v} lo={-100} hi={100} />
      </div>
      <p className="grp mt-3">{tt("npcLife")}</p>
      <dl className="text-[12px] mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <dt style={{ color: "var(--cream-dim)" }}>{tt("npcWorkAt")}</dt>
        <dd className="truncate">
          {a.job
            ? `${tt(`job_${a.job}`)} · ${a.work}${a.shift ? ` · ${a.shift[0]}–${a.shift[1]}h` : ""}`
            : tt("npcNoJob")}
        </dd>
        <dt style={{ color: "var(--cream-dim)" }}>{tt("npcHomeAt")}</dt>
        <dd className="truncate">{a.home || tt("npcNoHome")}</dd>
      </dl>
      <div className="flex flex-wrap gap-1 mt-2">
        {TRAITS.map((k) => {
          const v = a.traits[k] ?? 0.5;
          return (
            <span key={k} className="chip text-[11px]" title={String(v)}>
              {tt(`npcTrait_${k}_${v >= 0.5 ? "hi" : "lo"}`)}
            </span>
          );
        })}
      </div>
    </aside>
  );
}
