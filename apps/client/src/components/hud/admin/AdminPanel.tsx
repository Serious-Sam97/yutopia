"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { Icon, type IconName } from "../icons";
import { Panel } from "../Panel";
import { Dark } from "./Dark";
import { God } from "./God";
import { Invites } from "./Invites";
import { Log } from "./Log";
import { People } from "./People";
import { Perf } from "./Perf";
import { Powers } from "./Powers";
import { Spawn } from "./Spawn";
import { World } from "./World";

// Run the place (docs/plan/48-the-admin.md): the admins' panel, in pages like Settings —
// a rail on the left (on a phone, a row of tabs on top), the page with its title and a
// line on what it's for. Admins only: the menu shows it to them alone, the API and the
// world server refuse anyone else. Loads on demand; its words live here (EN / PT-BR).
const W = {
  title: ["Run the place", "Cuidar do lugar"],
  people: ["People", "Pessoas"],
  peopleSub: [
    "Who's in, everyone who has an account, and what you can do about them.",
    "Quem está aqui, todos que têm conta, e o que você pode fazer com eles.",
  ],
  powers: ["Powers", "Poderes"],
  powersSub: [
    "What you can do as yourself. Each lasts until you switch it off or leave.",
    "O que você pode fazer em si mesmo. Cada um dura até você desligar ou sair.",
  ],
  spawn: ["Spawn", "Criar"],
  spawnSub: ["Put something into the world, near you.", "Pôr algo no mundo, perto de você."],
  god: ["God mode", "Modo deus"],
  godSub: [
    "Build the open world: the land, roads, trees, things and buildings. Your draft is yours until you publish it.",
    "Construir o mundo aberto: o terreno, vias, árvores, coisas e prédios. Seu rascunho é seu até você publicar.",
  ],
  world: ["The world", "O mundo"],
  worldSub: [
    "What the whole town feels: the hour, the weather, locks, vehicles, a notice.",
    "O que a cidade toda sente: a hora, o tempo, trancas, veículos, um aviso.",
  ],
  dark: ["The dark", "O escuro"],
  darkSub: ["For trying the fight: what's out there.", "Para testar a luta: o que há lá fora."],
  log: ["The log", "O registro"],
  logSub: ["What admins did, and when. Kept 90 days.", "O que os admins fizeram, e quando. Guardado 90 dias."],
  invites: ["Invites", "Convites"],
  invitesSub: [
    "Single-use sign-up links. Each lets one person make an account.",
    "Links de cadastro de uso único. Cada um deixa uma pessoa criar uma conta.",
  ],
  perf: ["Performance", "Desempenho"],
  perfSub: ["How it runs for everyone, this week.", "Como está rodando para todos, esta semana."],
  only: ["Only admins see this.", "Só admins veem isto."],
} as const;
type Word = keyof typeof W;

type Page = "people" | "powers" | "spawn" | "god" | "invites" | "world" | "dark" | "perf" | "log";
const PAGES: { id: Page; label: Word; sub: Word; icon: IconName }[] = [
  { id: "people", label: "people", sub: "peopleSub", icon: "people" },
  { id: "powers", label: "powers", sub: "powersSub", icon: "stairs" },
  { id: "spawn", label: "spawn", sub: "spawnSub", icon: "plus" },
  { id: "god", label: "god", sub: "godSub", icon: "globe" },
  { id: "invites", label: "invites", sub: "invitesSub", icon: "key" },
  { id: "world", label: "world", sub: "worldSub", icon: "home" },
  { id: "dark", label: "dark", sub: "darkSub", icon: "window" },
  { id: "perf", label: "perf", sub: "perfSub", icon: "screen" },
  { id: "log", label: "log", sub: "logSub", icon: "board" },
];

export function AdminPanel() {
  const pt = useLang() === "pt";
  const w = (k: Word) => W[k][pt ? 1 : 0];
  const isAdmin = useHud((s) => s.isAdmin);
  const me = useHud((s) => s.me);
  const [page, setPage] = useState<Page>("people");
  if (!isAdmin) return null;
  const at = PAGES.find((p) => p.id === page) ?? PAGES[0];
  return (
    <Panel title={w("title")} size="max-w-5xl h-[min(760px,92vh)]">
      <div className="flex flex-col sm:flex-row h-full min-h-0 gap-3 sm:gap-6">
        <div className="flex sm:flex-col gap-0.5 sm:w-52 shrink-0 overflow-x-auto sm:overflow-visible scroll-thin pb-1 sm:pb-0">
          <div className="flex sm:flex-col gap-0.5" role="tablist" aria-label={w("title")}>
            {PAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === at.id}
                className="rail-item"
                onClick={() => setPage(p.id)}
              >
                <Icon name={p.icon} size={17} />
                {w(p.label)}
              </button>
            ))}
          </div>
          <p className="hidden sm:block mt-auto px-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {w("only")}
            {me && (
              <>
                <br />
                {me.name}
              </>
            )}
          </p>
        </div>
        <section className="flex-1 min-w-0 min-h-0 overflow-y-auto scroll-thin pr-1" role="tabpanel">
          <h3 className="title text-[26px]">{w(at.label)}</h3>
          <p className="text-[13.5px] mt-1.5" style={{ color: "var(--cream-dim)" }}>
            {w(at.sub)}
          </p>
          <div className="space-y-3 mt-4">
            {at.id === "people" && <People />}
            {at.id === "powers" && <Powers />}
            {at.id === "spawn" && <Spawn />}
            {at.id === "god" && <God />}
            {at.id === "invites" && <Invites />}
            {at.id === "world" && <World />}
            {at.id === "dark" && <Dark />}
            {at.id === "perf" && <Perf />}
            {at.id === "log" && <Log />}
          </div>
        </section>
      </div>
    </Panel>
  );
}
