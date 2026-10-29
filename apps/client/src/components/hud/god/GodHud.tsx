"use client";

import {
  BUILDINGS,
  type BuildingKind,
  CHUNK,
  GROUNDS,
  PREFABS,
  WALL_TINTS,
  WAYS,
  type WayKind,
} from "@yutopia/shared/grounds";
import {
  BRUSH,
  LAND_MODES,
  type LandMode,
  PAINTS,
  type Paint,
  TREE_PICKS,
  type TreePick,
} from "@yutopia/shared/grounds-brush";
import { BUILDING_NAMES, enterFaces, PREFAB_KINDS, SIGNED } from "@yutopia/shared/grounds-buildings";
import type { ThingKind } from "@yutopia/shared/grounds-edits";
import { catalogThing, THINGS } from "@yutopia/shared/grounds-things";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import type { PublishSummary } from "@/world/god/controller";
import { GOD_READY, GOD_TOOLS, type GodHud as GodState, type GodTool, useHud } from "@/world/store";
import { ago } from "../admin/ui";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";

// God mode's HUD (docs/plan/53-the-god-mode.md; the mocks: design/god/01-enter, 11-draft,
// 12-publish, 14-mobile): the plate (where the camera is, how high), the draft's strip (its
// changes, saved or not; Walk it, Discard, Publish…), the compass and the zoom, the tools along
// the bottom with undo, redo and leave, the land under the pointer and the grid's snap; the
// publish's dialog; on foot in the draft, a strip saying so. Its own chunk, an admin's only.
const W = {
  god: ["God mode", "Modo deus"],
  up: ["{n} m up", "{n} m acima"],
  over: ["over the ground", "acima do chão"],
  draft: ["Draft", "Rascunho"],
  changes: ["{n} changes", "{n} mudanças"],
  change1: ["1 change", "1 mudança"],
  nothing: ["nothing yet", "nada ainda"],
  saving: ["saving…", "salvando…"],
  saved: ["saved", "salvo"],
  failed: ["not saved: trying again", "não salvo: tentando de novo"],
  walk: ["Walk it", "Andar nele"],
  save: ["Save", "Salvar"],
  noDraft: ["No draft", "Sem rascunho"],
  draftsT: ["Your drafts", "Seus rascunhos"],
  ofMax: ["{n} of {max}", "{n} de {max}"],
  newName: ["A name for a new draft", "Um nome para um rascunho novo"],
  newDraft: ["New draft", "Rascunho novo"],
  newShort: ["New", "Novo"],
  newHint: [
    "A new one starts from what's live. Yours alone: no other admin sees them.",
    "Um novo começa do que está no ar. Só seus: nenhum outro admin os vê.",
  ],
  noDrafts: [
    "No drafts yet: your first change asks a name.",
    "Nenhum rascunho ainda: sua primeira mudança pede um nome.",
  ],
  draftsFailed: ["Couldn't load your drafts.", "Não deu para carregar seus rascunhos."],
  openTag: ["open", "aberto"],
  open: ["Open", "Abrir"],
  rename: ["Rename", "Renomear"],
  duplicate: ["Duplicate", "Duplicar"],
  deleteIt: ["Delete…", "Apagar…"],
  sureDelete: ["Delete “{name}”? It can't be undone.", "Apagar “{name}”? Não dá para desfazer."],
  yesDelete: ["Delete", "Apagar"],
  onLive: ["on revision {n} · live", "na revisão {n} · no ar"],
  onOld: [
    "made on {n} · live is {live}: brought up to date when it's opened",
    "feito na {n} · no ar é a {live}: atualizado ao abrir",
  ],
  changesAgo: ["{n} changes · saved {ago}", "{n} mudanças · salvo {ago}"],
  nameT: ["A new draft", "Um rascunho novo"],
  itsName: ["Its name", "O nome"],
  nameHint: [
    "Your first change with no draft open asks this. Up to 60 letters; rename it any time.",
    "Sua primeira mudança sem rascunho aberto pede isto. Até 60 letras; renomeie quando quiser.",
  ],
  makeIt: ["Make it", "Criar"],
  pubLeaves: [
    "Published, it leaves your drafts; the history keeps it, by its name.",
    "Publicado, ele sai dos seus rascunhos; o histórico o guarda, pelo nome.",
  ],
  publish: ["Publish…", "Publicar…"],
  publishShort: ["Publish", "Publicar"],
  undo: ["Undo", "Desfazer"],
  redo: ["Redo", "Refazer"],
  leave: ["Leave", "Sair"],
  north: ["Turn to the north", "Virar para o norte"],
  zoomIn: ["Closer", "Mais perto"],
  zoomOut: ["Further", "Mais longe"],
  pointer: ["Pointer", "Ponteiro"],
  snap: ["Snap", "Grade"],
  off: ["Off", "Não"],
  soon: ["next", "em breve"],
  walking: ["Walking the draft", "Andando no rascunho"],
  onlyYou: ["only you see them", "só você as vê"],
  backUp: ["Back up", "Voltar"],
  others: ["Others see you on the published ground.", "Os outros te veem no chão publicado."],
  othersSub: [
    "Where your draft changes the land, they'd see you walking on air, or in it.",
    "Onde o rascunho muda o terreno, eles te veriam andando no ar, ou dentro dele.",
  ],
  pubTitle: ["Publish the draft", "Publicar o rascunho"],
  pubNamed: ["Publish “{n}”", "Publicar “{n}”"],
  note: ["A note for the history", "Uma nota para o histórico"],
  notePh: ["What it changes, in a line", "O que muda, numa linha"],
  land: ["Land", "Terreno"],
  painted: ["Painted", "Pintado"],
  trees: ["Trees", "Árvores"],
  ways: ["Ways", "Vias"],
  things: ["Things", "Coisas"],
  buildings: ["Buildings", "Prédios"],
  chunks: ["{n} chunks", "{n} blocos"],
  chunk1: ["1 chunk", "1 bloco"],
  checks: ["Checks", "Verificações"],
  rulesOk: ["All inside the world, clear of what's anchored", "Tudo dentro do mundo, longe do que está ancorado"],
  sizeMb: ["Size {mb} MB of {max} MB", "Tamanho {mb} MB de {max} MB"],
  standing: [
    "{n} standing where the ground changes: they'll be lifted to it, with a toast “The ground shifts here.”",
    "{n} em pé onde o chão muda: serão erguidos até ele, com o aviso “O chão se move aqui.”",
  ],
  where: ["Where it changes", "Onde muda"],
  everyone: [
    "Everyone in gets it at once; the land rebuilds a little a frame.",
    "Todos recebem na hora; o terreno se refaz um pouco a cada quadro.",
  ],
  cancel: ["Cancel", "Cancelar"],
  pubRev: ["Publish revision {n}", "Publicar a revisão {n}"],
  sending: ["Publishing…", "Publicando…"],
  refused: ["Not published", "Não publicado"],
  was: ["was {n}", "era {n}"],
  size: ["Size", "Tamanho"],
  strength: ["Strength", "Força"],
  landHint: ["Shift inverts · hold to keep going · [ ] size", "Shift inverte · segure para continuar · [ ] tamanho"],
  paintHint: ["Drag to paint · [ ] size", "Arraste para pintar · [ ] tamanho"],
  draw: ["Draw", "Desenhar"],
  edit: ["Edit points", "Editar pontos"],
  remove: ["Remove", "Tirar"],
  selectHint: ["Click anything: generated, placed or edited", "Clique em qualquer coisa: gerada, posta ou editada"],
  selectPicked: [
    "drag it to move it · R turns · Delete takes it away · Esc lets it go",
    "arraste para mover · R gira · Delete tira · Esc solta",
  ],
  width: ["Width", "Largura"],
  pavements: ["Pavements", "Calçadas"],
  lamps: ["Lamps", "Postes"],
  drawHint: ["click: a point · double-click or Enter: the end", "clique: um ponto · clique duplo ou Enter: o fim"],
  drawing: ["{n} points · {m} m", "{n} pontos · {m} m"],
  joins: ["joins {name}", "liga em {name}"],
  notThere: ["not there: {why}", "não aí: {why}"],
  editHint: [
    "drag a point · click its line: a new one · Alt-click: take one out",
    "arraste um ponto · clique na linha: um novo · Alt-clique: tira um",
  ],
  locked: ["{name}: wider or lit, not moved", "{name}: mais larga ou iluminada, não movida"],
  removeHint: ["click a way to take it away", "clique numa via para tirá-la"],
  plant: ["Plant", "Plantar"],
  clear: ["Clear", "Limpar"],
  asMade: ["As made", "Como feito"],
  oneTree: ["One tree", "Uma árvore"],
  oneRock: ["One rock", "Uma pedra"],
  thick: ["Thick", "Densidade"],
  natureHint: ["drag to brush · [ ] size", "arraste para pincelar · [ ] tamanho"],
  treeHint: ["click: a tree there, or none", "clique: uma árvore ali, ou nenhuma"],
  rockHint: ["click: a boulder there", "clique: uma pedra ali"],
  place: ["Place", "Pôr"],
  aLine: ["A line (fences)", "Uma linha (cercas)"],
  thingsHint: [
    "R turns · drag one to move it · click: picks it · Delete takes it away · Alt-click: its kind",
    "R gira · arraste para mover · clique: escolhe · Delete tira · Alt-clique: o tipo",
  ],
  lineHint: ["click: a post · double-click or Enter: the end", "clique: um poste · clique duplo ou Enter: o fim"],
  kinds: ["{n} kinds", "{n} tipos"],
  find: ["Find a thing", "Achar uma coisa"],
  turn: ["Turn", "Girar"],
  scale: ["Scale", "Escala"],
  words: ["Words", "Palavras"],
  picked: ["picked", "escolhido"],
  takeAway: ["Take it away", "Tirar"],
  stays: ["stays where it is", "fica onde está"],
  buildingsT: ["Buildings", "Prédios"],
  theNew: ["The new {n}", "O novo {n}"],
  name: ["Name", "Nome"],
  floors: ["Floors", "Andares"],
  door: ["Door", "Porta"],
  walls: ["Walls", "Paredes"],
  its: ["its own", "o seu"],
  enterable: ["Enterable", "Dá para entrar"],
  inside: ["Inside", "Dentro"],
  generated: ["Generated", "Gerado"],
  ownFloors: ["Own floors", "Andares próprios"],
  signW: ["Sign", "Letreiro"],
  buildingsHint: [
    "click: put it down · R turns it a quarter · drag one to move it · Delete takes it away · its pad levels the land",
    "clique: põe · R gira um quarto · arraste para mover · Delete tira · a base nivela o terreno",
  ],
} as const;
type Word = keyof typeof W;
function useW() {
  const pt = useLang() === "pt";
  return (k: Word, n?: number | string) => W[k][pt ? 1 : 0].replace("{n}", String(n ?? ""));
}
const TOOL_WORDS: Record<GodTool, [string, string]> = {
  select: ["Select", "Selecionar"],
  land: ["Land", "Terreno"],
  paint: ["Paint", "Pintar"],
  roads: ["Roads", "Vias"],
  nature: ["Nature", "Natureza"],
  things: ["Things", "Coisas"],
  buildings: ["Buildings", "Prédios"],
};
const TOOL_ICONS: Record<GodTool, IconName> = {
  select: "cursor",
  land: "land",
  paint: "palette",
  roads: "road",
  nature: "leaf",
  things: "chair",
  buildings: "home",
};
const READY = GOD_READY;
const MODE_WORDS: Record<LandMode, [string, string]> = {
  raise: ["Raise", "Subir"],
  lower: ["Lower", "Baixar"],
  smooth: ["Smooth", "Suavizar"],
  flatten: ["Flatten", "Aplainar"],
  ramp: ["Ramp", "Rampa"],
  roughen: ["Roughen", "Enrugar"],
};
const SURFACE_WORDS: Record<string, [string, string]> = {
  generated: ["As made", "Como feito"],
  snow: ["Snow", "Neve"],
  deep: ["Deep snow", "Neve funda"],
  rock: ["Rock", "Rocha"],
  ice: ["Ice", "Gelo"],
  path: ["Path", "Trilha"],
  asphalt: ["Asphalt", "Asfalto"],
  walk: ["Walk", "Calçada"],
  floor: ["Floor", "Piso"],
};

export function GodHud() {
  const g = useHud((s) => s.god);
  if (!g.on) return null;
  if (g.walking) return <Walking g={g} />;
  return (
    <>
      <Plate g={g} />
      <DraftStrip g={g} />
      <Compass g={g} />
      {(g.tool === "land" || g.tool === "paint") && <ToolOptions g={g} />}
      {g.tool === "roads" && <RoadOptions g={g} />}
      {g.tool === "nature" && <NatureOptions g={g} />}
      {g.tool === "things" && <ThingsOptions g={g} />}
      {g.tool === "things" && <ThingsPanel g={g} />}
      {g.tool === "buildings" && <BuildingsOptions g={g} />}
      {g.tool === "buildings" && <BuildingsPanel g={g} />}
      {g.tool === "select" && <SelectOptions g={g} />}
      {g.tool === "select" && g.picked === "thing" && g.things.sel && <ThingsPanel g={g} />}
      {g.tool === "select" && g.picked === "building" && g.buildings.sel && <BuildingsPanel g={g} />}
      <Tools g={g} />
      <Pointer g={g} />
      {g.drafts.open && <DraftsPanel g={g} />}
      {g.naming && <NameDialog g={g} />}
      {g.publish && <PublishDialog g={g} />}
    </>
  );
}

function Plate({ g }: { g: GodState }) {
  const t = useW();
  const w = useWorld();
  // (on a phone the draft's strip is in it: its count and Publish — the mock 14-mobile)
  return (
    <header className="pointer-events-auto cabinet absolute top-3 left-3 right-3 sm:right-auto flex items-center gap-3 pl-3 pr-2 sm:pr-4 py-2 sm:max-w-[40vw]">
      <span style={{ color: "var(--amber)" }}>
        <Icon name="globe" size={22} />
      </span>
      <div className="min-w-0 hidden sm:block">
        <p className="title text-[22px] truncate">{t("god")}</p>
        <p className="text-[12.5px] leading-tight truncate mt-0.5" style={{ color: "var(--cream-dim)" }}>
          {g.place ? `${g.place} · ` : ""}
          {t("up", g.up)}
        </p>
      </div>
      {/* (on a phone: the draft's name, opening the list — the mock 18-mobile-drafts) */}
      <button
        type="button"
        className="min-w-0 text-left sm:hidden"
        aria-expanded={g.drafts.open}
        onClick={() => w?.god?.toggleDrafts()}
      >
        <p className="title text-[16px] truncate">
          {g.draft.name || t("noDraft")} <span style={{ color: "var(--amber)" }}>{g.drafts.open ? "▴" : "▾"}</span>
        </p>
        <p className="mono text-[10.5px] truncate" style={{ color: "var(--cream-dim)" }}>
          {g.changes === 1 ? t("change1") : t("changes", g.changes)} · {saveWords(g, t)}
        </p>
      </button>
      <span className="sm:hidden ml-auto lcd text-[19px]" data-god-changes={g.changes}>
        {g.changes}
      </span>
      <button
        type="button"
        className="deck-btn h-10 sm:hidden"
        aria-pressed={g.changes > 0}
        disabled={!g.changes}
        onClick={() => w?.god?.openPublish()}
      >
        <Icon name="publish" size={16} />
        {t("publishShort")}
      </button>
    </header>
  );
}

function saveWords(g: GodState, t: ReturnType<typeof useW>): string {
  if (!g.changes) return t("nothing");
  return g.save === "saving" ? t("saving") : g.save === "failed" ? t("failed") : t("saved");
}

function DraftStrip({ g }: { g: GodState }) {
  const t = useW();
  const w = useWorld();
  const n = g.changes;
  return (
    <div className="pointer-events-auto cabinet absolute top-3 left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-2 pl-3 pr-1.5 py-1.5">
      <span className="mono text-[11px] tracking-[0.12em] uppercase hidden sm:inline" style={{ color: "var(--amber)" }}>
        {t("draft")}
      </span>
      <button
        type="button"
        className="flex items-center gap-2 px-2 py-0.5 rounded max-w-[260px]"
        style={{ border: "1px solid var(--edge)" }}
        aria-expanded={g.drafts.open}
        aria-label={t("draftsT")}
        onClick={() => w?.god?.toggleDrafts()}
      >
        <span className="title text-[15px] truncate" style={{ letterSpacing: "0.08em" }}>
          {g.draft.name || t("noDraft")}
        </span>
        <span className="text-[12px]" style={{ color: "var(--amber)" }} aria-hidden>
          {g.drafts.open ? "▴" : "▾"}
        </span>
      </button>
      <span className="text-sm whitespace-nowrap">{n === 1 ? t("change1") : t("changes", n)}</span>
      <span
        className="mono text-[11px] whitespace-nowrap"
        style={{ color: g.save === "failed" ? "var(--rust)" : "var(--cream-dim)" }}
      >
        {saveWords(g, t)}
      </span>
      <span className="h-7 w-px mx-1" style={{ background: "var(--edge)" }} aria-hidden />
      <button type="button" className="deck-btn h-9" disabled={!n} onClick={() => void w?.god?.save()}>
        <Icon name="check" size={15} />
        {t("save")}
      </button>
      <button type="button" className="deck-btn h-9" onClick={() => w?.god?.walk(true)}>
        <Icon name="walk" size={16} />
        {t("walk")}
      </button>
      <button
        type="button"
        className="deck-btn h-9"
        aria-pressed={n > 0}
        disabled={!n}
        onClick={() => w?.god?.openPublish()}
      >
        <Icon name="publish" size={16} />
        {t("publish")}
      </button>
    </div>
  );
}

function Compass({ g }: { g: GodState }) {
  const t = useW();
  const w = useWorld();
  // (north is −z: the needle points there, against the way the camera looks)
  const deg = (-(g.yaw + Math.PI / 2) * 180) / Math.PI;
  return (
    <div className="pointer-events-auto cabinet absolute top-3 right-3 hidden sm:flex items-center gap-3 pl-2 pr-2 py-1.5">
      <button
        type="button"
        className="h-11 w-11 rounded-full grid place-items-center"
        style={{ border: "1px solid var(--edge-2)", background: "var(--well)" }}
        title={t("north")}
        aria-label={t("north")}
        onClick={() => w?.god?.north()}
      >
        <svg viewBox="0 0 24 24" width="30" height="30" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true">
          <path d="M12 3 15 12H9z" fill="var(--rust)" />
          <path d="M12 21 9 12h6z" fill="var(--cream-dim)" />
        </svg>
      </button>
      <div className="leading-tight">
        <p className="lcd text-[19px]">{g.up} m</p>
        <p className="mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
          {t("over")}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="deck-btn h-5 min-w-6 px-1 text-[12px]"
          aria-label={t("zoomIn")}
          onClick={() => w?.god?.zoom(1 / 1.25)}
        >
          +
        </button>
        <button
          type="button"
          className="deck-btn h-5 min-w-6 px-1 text-[12px]"
          aria-label={t("zoomOut")}
          onClick={() => w?.god?.zoom(1.25)}
        >
          −
        </button>
      </div>
    </div>
  );
}

function Tools({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  return (
    <nav className="pointer-events-auto cabinet absolute bottom-3 left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 px-2 py-1.5 flex items-center gap-1 overflow-x-auto scroll-thin">
      {GOD_TOOLS.map((k, i) => (
        <button
          key={k}
          type="button"
          className="deck-btn h-14 min-w-16 flex-col gap-0.5 px-2 shrink-0"
          aria-pressed={g.tool === k}
          style={READY.has(k) ? undefined : { opacity: 0.55 }}
          title={READY.has(k) ? undefined : `${TOOL_WORDS[k][pt ? 1 : 0]} · ${t("soon")}`}
          onClick={() => w?.god?.setTool(k)}
        >
          <span className="absolute top-1 right-1.5 text-[9px] opacity-60 hidden sm:block">{i + 1}</span>
          <Icon name={TOOL_ICONS[k]} size={18} />
          <span className="text-[11px]">{TOOL_WORDS[k][pt ? 1 : 0]}</span>
        </button>
      ))}
      <span className="h-10 w-px mx-1 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
      <button
        type="button"
        className="deck-btn h-14 min-w-14 flex-col gap-0.5 px-2 shrink-0"
        disabled={!g.undo}
        onClick={() => w?.god?.undo()}
      >
        <Icon name="undo" size={18} />
        <span className="text-[11px]">{t("undo")}</span>
      </button>
      <button
        type="button"
        className="deck-btn h-14 min-w-14 flex-col gap-0.5 px-2 shrink-0"
        disabled={!g.redo}
        onClick={() => w?.god?.redo()}
      >
        <Icon name="redo" size={18} />
        <span className="text-[11px]">{t("redo")}</span>
      </button>
      <span className="h-10 w-px mx-1 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
      <button
        type="button"
        className="deck-btn h-14 min-w-14 flex-col gap-0.5 px-2 shrink-0"
        onClick={() => w?.god?.leave()}
      >
        <span className="absolute top-1 right-1.5 text-[9px] opacity-60 hidden sm:block">0</span>
        <Icon name="leave" size={18} />
        <span className="text-[11px]">{t("leave")}</span>
      </button>
    </nav>
  );
}

/** The brush's own row over the tools (the mocks 02-land, 03-paint): what it does, how big, how
 *  strong; paint's swatches; what the draft does to what stands on the land. */
function ToolOptions({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const land = g.tool === "land";
  const size = land ? g.land.size : g.paint.size;
  const lim = land ? BRUSH.land : BRUSH.paint;
  const range = (v: number, min: number, max: number) =>
    ({ "--v": `${((v - min) / (max - min)) * 100}%` }) as React.CSSProperties;
  return (
    <div className="pointer-events-auto cabinet absolute bottom-[86px] left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 px-3 py-2 flex items-center gap-4 overflow-x-auto scroll-thin">
      {land ? (
        <div className="seg shrink-0" role="radiogroup" aria-label={TOOL_WORDS.land[pt ? 1 : 0]}>
          {LAND_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="px-2.5"
              aria-pressed={g.land.mode === m}
              onClick={() => w?.god?.setLand({ mode: m })}
            >
              {MODE_WORDS[m][pt ? 1 : 0]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-1.5 shrink-0" role="radiogroup" aria-label={TOOL_WORDS.paint[pt ? 1 : 0]}>
          {PAINTS.map((p: Paint) => (
            <button
              key={p}
              type="button"
              className="flex flex-col items-center gap-1 px-1"
              aria-pressed={g.paint.surface === p}
              aria-label={SURFACE_WORDS[p][pt ? 1 : 0]}
              onClick={() => w?.god?.setPaint({ surface: p })}
            >
              <span
                className="w-9 h-6 rounded"
                style={{
                  background:
                    p === "generated"
                      ? "repeating-linear-gradient(135deg, var(--cream-dim) 0 4px, var(--panel-raised) 4px 8px)"
                      : `var(--swatch-${p})`,
                  outline: g.paint.surface === p ? "2px solid var(--amber)" : "1px solid var(--edge-2)",
                  outlineOffset: 1,
                }}
              />
              <span
                className="text-[10.5px]"
                style={{ color: g.paint.surface === p ? "var(--cream)" : "var(--cream-dim)" }}
              >
                {SURFACE_WORDS[p][pt ? 1 : 0]}
              </span>
            </button>
          ))}
        </div>
      )}
      <span className="h-8 w-px shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
      <label className="flex items-center gap-2 shrink-0">
        <span className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
          {t("size")}
        </span>
        <input
          type="range"
          className="slider w-28"
          min={lim.min}
          max={lim.max}
          value={size}
          style={range(size, lim.min, lim.max)}
          onChange={(e) =>
            land
              ? w?.god?.setLand({ size: Number(e.target.value) })
              : w?.god?.setPaint({ size: Number(e.target.value) })
          }
        />
        <span className="mono text-[12px] w-11">{size} m</span>
      </label>
      {land && (
        <label className="flex items-center gap-2 shrink-0">
          <span className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
            {t("strength")}
          </span>
          <input
            type="range"
            className="slider w-28"
            min={BRUSH.strength.min}
            max={BRUSH.strength.max}
            value={g.land.strength}
            style={range(g.land.strength, BRUSH.strength.min, BRUSH.strength.max)}
            onChange={(e) => w?.god?.setLand({ strength: Number(e.target.value) })}
          />
          <span className="mono text-[12px] w-7">{g.land.strength}</span>
        </label>
      )}
      <span
        className="text-[12px] shrink-0 hidden xl:inline"
        style={{ color: g.issues.length ? "var(--amber)" : "var(--cream-dim)" }}
        title={g.issues.join("\n")}
      >
        {g.issues.length
          ? `! ${g.issues[0]}${g.issues.length > 1 ? ` (+${g.issues.length - 1})` : ""}`
          : land
            ? t("landHint")
            : t("paintHint")}
      </span>
    </div>
  );
}

const KIND_WORDS: Record<WayKind, [string, string]> = {
  road: ["Road", "Estrada"],
  street: ["Street", "Rua"],
  driveway: ["Driveway", "Acesso"],
  trail: ["Trail", "Trilha"],
  walk: ["Walk", "Calçada"],
};
const KINDS: WayKind[] = ["road", "street", "driveway", "trail", "walk"];

/** The roads tool's row (the mock 04-roads): what it does, a way's kind, width, pavements and
 *  lamps (a new one's, or the picked one's), and what it's doing. */
function RoadOptions({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const r = g.roads;
  const tool = () => w?.god?.roadsTool();
  const editing = r.mode === "edit" && !!r.sel;
  const W2 = (k: Word, v: Record<string, string | number>) =>
    Object.entries(v).reduce((s, [a, b]) => s.replace(`{${a}}`, String(b)), W[k][pt ? 1 : 0] as string);
  const status = r.drawing
    ? [
        W2("drawing", { n: r.drawing.n, m: r.drawing.m }),
        r.drawing.joins ? W2("joins", { name: r.drawing.joins }) : "",
        r.drawing.blocked ? W2("notThere", { why: r.drawing.blocked }) : t("drawHint"),
      ]
        .filter(Boolean)
        .join(" · ")
    : r.mode === "draw"
      ? t("drawHint")
      : r.mode === "remove"
        ? t("removeHint")
        : r.sel?.locked
          ? W2("locked", { name: r.sel.name })
          : r.sel
            ? `${r.sel.name} · ${t("editHint")}`
            : t("editHint");
  const commitW = (e: React.SyntheticEvent<HTMLInputElement>) => {
    if (editing) tool()?.setOpts({ w: Number(e.currentTarget.value) });
  };
  return (
    <div className="pointer-events-auto cabinet absolute bottom-[86px] left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 px-3 py-2 flex flex-col gap-1.5 max-w-[calc(100vw-24px)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="seg shrink-0" role="radiogroup" aria-label={TOOL_WORDS.roads[pt ? 1 : 0]}>
          {(["draw", "edit", "remove"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="px-2.5 whitespace-nowrap"
              aria-pressed={r.mode === m}
              onClick={() => w?.god?.setRoadMode(m)}
            >
              {t(m)}
            </button>
          ))}
        </div>
        <div className="flex gap-1 shrink-0">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={r.kind === k}
              disabled={r.mode === "remove" || (editing && !!r.sel?.locked)}
              onClick={() => tool()?.setOpts({ kind: k })}
            >
              {KIND_WORDS[k][pt ? 1 : 0]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 shrink-0">
          <span className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
            {t("width")}
          </span>
          <input
            type="range"
            className="slider w-20"
            min={2}
            max={16}
            step={0.5}
            value={r.w}
            disabled={r.mode === "remove"}
            style={{ "--v": `${((r.w - 2) / 14) * 100}%` } as React.CSSProperties}
            onChange={(e) =>
              editing ? tool()?.preview(Number(e.target.value)) : tool()?.setOpts({ w: Number(e.target.value) })
            }
            onPointerUp={commitW}
            onKeyUp={commitW}
          />
          <span className="mono text-[12px] w-10">{r.w} m</span>
        </label>
        {(["pave", "lamps"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 shrink-0">
            <span className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
              {t(k === "pave" ? "pavements" : "lamps")}
            </span>
            <button
              type="button"
              className="sw"
              aria-pressed={r[k]}
              aria-label={t(k === "pave" ? "pavements" : "lamps")}
              disabled={r.mode === "remove"}
              onClick={() => tool()?.setOpts({ [k]: !r[k] })}
            />
          </label>
        ))}
      </div>
      <p
        className="text-[12px] truncate"
        style={{ color: r.drawing?.blocked || r.sel?.locked ? "var(--amber)" : "var(--cream-dim)" }}
      >
        {status}
      </p>
    </div>
  );
}

const PICK_WORDS: Record<TreePick, [string, string]> = {
  pine: ["Pine", "Pinheiro"],
  birch: ["Birch", "Bétula"],
  bare: ["Bare", "Seca"],
  mix: ["A mix", "Mistura"],
};
/** The nature tool's row (the mock 05-nature): the forest brush, one tree, one rock. */
function NatureOptions({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const n = g.nature;
  const brush = n.mode === "plant" || n.mode === "clear" || n.mode === "generated";
  const modes = [
    ["plant", "plant"],
    ["clear", "clear"],
    ["generated", "asMade"],
    ["tree", "oneTree"],
    ["rock", "oneRock"],
  ] as const;
  const hint = brush ? t("natureHint") : n.mode === "tree" ? t("treeHint") : t("rockHint");
  return (
    <div className="pointer-events-auto cabinet absolute bottom-[86px] left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 px-3 py-2 flex flex-col gap-1.5 max-w-[calc(100vw-24px)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="seg shrink-0" role="radiogroup" aria-label={TOOL_WORDS.nature[pt ? 1 : 0]}>
          {modes.map(([m, k]) => (
            <button
              key={m}
              type="button"
              className="px-2.5 whitespace-nowrap"
              aria-pressed={n.mode === m}
              onClick={() => w?.god?.setNature({ mode: m })}
            >
              {t(k)}
            </button>
          ))}
        </div>
        <div className="flex gap-1 shrink-0">
          {TREE_PICKS.map((p) => (
            <button
              key={p}
              type="button"
              className="chip"
              aria-pressed={n.pick === p}
              disabled={n.mode !== "plant" && n.mode !== "tree"}
              onClick={() => w?.god?.setNature({ pick: p })}
            >
              {PICK_WORDS[p][pt ? 1 : 0]}
            </button>
          ))}
        </div>
        {n.mode === "plant" && (
          <label className="flex items-center gap-2 shrink-0">
            <span className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
              {t("thick")}
            </span>
            <input
              type="range"
              className="slider w-20"
              min={5}
              max={100}
              value={n.thick}
              style={{ "--v": `${((n.thick - 5) / 95) * 100}%` } as React.CSSProperties}
              onChange={(e) => w?.god?.setNature({ thick: Number(e.target.value) })}
            />
            <span className="mono text-[12px] w-9">{n.thick}%</span>
          </label>
        )}
        {brush && (
          <label className="flex items-center gap-2 shrink-0">
            <span className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
              {t("size")}
            </span>
            <input
              type="range"
              className="slider w-20"
              min={4}
              max={64}
              value={n.size}
              style={{ "--v": `${((n.size - 4) / 60) * 100}%` } as React.CSSProperties}
              onChange={(e) => w?.god?.setNature({ size: Number(e.target.value) })}
            />
            <span className="mono text-[12px] w-10">{n.size} m</span>
          </label>
        )}
      </div>
      <p className="text-[12px] truncate" style={{ color: "var(--cream-dim)" }}>
        {hint}
      </p>
    </div>
  );
}

const THING_ICONS: Partial<Record<ThingKind, IconName>> = {
  "lamp-town": "pin",
  "lamp-cobra": "pin",
  "lamp-lone": "pin",
  bench: "sofa",
  bin: "bin",
  hydrant: "plus",
  newsbox: "board",
  postbox: "send",
  sign: "tag",
  fence: "wall",
  snowpole: "pin",
  boulder: "move",
  planter: "leaf",
  pole: "stairs",
  stop: "close",
  streetsign: "tag",
};
const THING_WORDS: Partial<Record<ThingKind, string>> = {
  "lamp-town": "Poste da cidade",
  "lamp-cobra": "Poste de estrada",
  "lamp-lone": "Poste de trilha",
  bench: "Banco",
  bin: "Lixeira",
  hydrant: "Hidrante",
  newsbox: "Banca de jornal",
  postbox: "Caixa de correio",
  sign: "Placa",
  fence: "Cerca",
  snowpole: "Estaca de neve",
  boulder: "Pedra",
  planter: "Floreira",
  pole: "Poste de luz",
  stop: "Ponto de ônibus",
  streetsign: "Placa de rua",
};
const thingName = (k: ThingKind, pt: boolean) => (pt ? (THING_WORDS[k] ?? catalogThing(k).name) : catalogThing(k).name);

/** The things tool's row: putting one down, or a fence along a line; what's going on. */
function ThingsOptions({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const o = g.things;
  const status = o.blocked
    ? W.notThere[pt ? 1 : 0].replace("{why}", o.blocked)
    : o.mode === "line"
      ? o.drawing
        ? `${W.drawing[pt ? 1 : 0].replace("{n}", String(o.drawing.n)).replace("{m}", String(o.drawing.m))} · ${t("lineHint")}`
        : t("lineHint")
      : t("thingsHint");
  return (
    <div className="pointer-events-auto cabinet absolute bottom-[86px] left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 px-3 py-2 flex items-center gap-3 max-w-[calc(100vw-24px)] sm:max-w-[60vw]">
      <div className="seg shrink-0" role="radiogroup" aria-label={TOOL_WORDS.things[pt ? 1 : 0]}>
        {(["place", "line"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="px-2.5 whitespace-nowrap"
            aria-pressed={o.mode === m}
            onClick={() =>
              w?.god?.thingsTool()?.setKind(m === "line" ? "fence" : o.kind === "fence" ? "bench" : o.kind)
            }
          >
            {t(m === "place" ? "place" : "aLine")}
          </button>
        ))}
      </div>
      <p className="text-[12px] truncate" style={{ color: o.blocked ? "var(--amber)" : "var(--cream-dim)" }}>
        {status}
      </p>
    </div>
  );
}

/** The select tool's row (the mock 08-select): what's picked — a thing, a building, a way — and
 *  what can be done to it (its properties: the panel, as its own tool's); what's anchored, why. */
function SelectOptions({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const god = () => w?.god;
  const sel =
    g.picked === "thing"
      ? g.things.sel && { name: thingName(g.things.sel.kind, pt), locked: g.things.sel.locked }
      : g.picked === "building"
        ? g.buildings.sel && {
            name: `${g.buildings.name} · ${buildingName(g.buildings.kind, pt)}`,
            locked: g.buildings.sel.locked,
          }
        : g.picked === "way"
          ? g.roads.sel && {
              name: `${g.roads.sel.name} · ${KIND_WORDS[g.roads.kind][pt ? 1 : 0]}`,
              locked: g.roads.sel.locked,
            }
          : null;
  const blocked = g.picked === "thing" ? g.things.blocked : g.picked === "building" ? g.buildings.blocked : null;
  const status = blocked
    ? W.notThere[pt ? 1 : 0].replace("{why}", blocked)
    : sel?.locked
      ? `${sel.locked}: ${t("stays")}`
      : sel
        ? t("selectPicked")
        : t("selectHint");
  return (
    <div className="pointer-events-auto cabinet absolute bottom-[86px] left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 max-w-[calc(100vw-24px)] sm:max-w-[64vw]">
      {sel && (
        <>
          <span className="title text-[15px] truncate max-w-[220px]">{sel.name}</span>
          <div className="flex gap-1 shrink-0">
            {g.picked !== "way" && (
              <button type="button" className="chip" disabled={!!sel.locked} onClick={() => god()?.turnPicked()}>
                {t("turn")}
              </button>
            )}
            {g.picked === "way" && (
              <button type="button" className="chip" onClick={() => god()?.editWay()}>
                {t("edit")}
              </button>
            )}
            <button type="button" className="chip" disabled={!!sel.locked} onClick={() => god()?.removePicked()}>
              {t("remove")}
            </button>
          </div>
        </>
      )}
      <p
        className="text-[12px] truncate"
        style={{ color: blocked || sel?.locked ? "var(--amber)" : "var(--cream-dim)" }}
      >
        {status}
      </p>
    </div>
  );
}

/** The catalog (the mock 06-things): a kind to put down; its turn, size, words — or the picked
 *  one's, and taking it away. */
function ThingsPanel({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const o = g.things;
  const [q, setQ] = useState("");
  const [text, setText] = useState(o.text);
  useEffect(() => setText(o.text), [o.text]);
  const tool = () => w?.god?.thingsTool();
  const c = catalogThing(o.kind);
  const shown = THINGS.filter((k) => !q || thingName(k.kind, pt).toLowerCase().includes(q.toLowerCase()));
  const commitTurn = (e: React.SyntheticEvent<HTMLInputElement>) => {
    if (o.sel) tool()?.setOpts({ ry: Number(e.currentTarget.value) });
  };
  const commitScale = (e: React.SyntheticEvent<HTMLInputElement>) => {
    if (o.sel) tool()?.setOpts({ s: Number(e.currentTarget.value) });
  };
  return (
    <aside className="pointer-events-auto cabinet absolute top-[92px] right-3 w-64 max-h-[calc(100vh-200px)] overflow-y-auto scroll-thin p-3 hidden sm:block">
      <div className="flex items-baseline justify-between">
        <h3 className="title text-[18px]">{t("things")}</h3>
        <span className="mono text-[10.5px]" style={{ color: "var(--cream-dim)" }}>
          {t("kinds", THINGS.length)}
        </span>
      </div>
      <div className="zigzag w-24 mt-1.5" aria-hidden />
      <input
        className="field mt-2.5 py-1.5 text-sm"
        placeholder={t("find")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-1.5 mt-2.5" role="radiogroup" aria-label={t("things")}>
        {shown.map((k) => (
          <button
            key={k.kind}
            type="button"
            className="deck-btn h-16 flex-col gap-1 px-1"
            aria-pressed={o.kind === k.kind && !o.sel}
            onClick={() => tool()?.setKind(k.kind)}
          >
            <Icon name={THING_ICONS[k.kind] ?? "pin"} size={17} />
            <span className="text-[10.5px] leading-tight text-center">{thingName(k.kind, pt)}</span>
          </button>
        ))}
      </div>
      <p className="grp mt-3">
        {thingName(o.kind, pt)}
        {o.sel ? ` · ${t("picked")}` : ""}
      </p>
      {o.sel?.locked ? (
        <p className="text-[12px] mt-2" style={{ color: "var(--amber)" }}>
          {o.sel.locked}: {t("stays")}
        </p>
      ) : (
        <div className="space-y-2 mt-2">
          {!c.line && (
            <label className="flex items-center gap-2">
              <span className="text-[12.5px] w-12" style={{ color: "var(--cream-dim)" }}>
                {t("turn")}
              </span>
              <input
                type="range"
                className="slider flex-1"
                min={0}
                max={359}
                value={o.ry}
                style={{ "--v": `${(o.ry / 359) * 100}%` } as React.CSSProperties}
                onChange={(e) => tool()?.setOpts({ ry: Number(e.target.value) }, false)}
                onPointerUp={commitTurn}
                onKeyUp={commitTurn}
              />
              <span className="mono text-[11.5px] w-9">{Math.round(o.ry)}°</span>
            </label>
          )}
          {c.sized && (
            <label className="flex items-center gap-2">
              <span className="text-[12.5px] w-12" style={{ color: "var(--cream-dim)" }}>
                {t("scale")}
              </span>
              <input
                type="range"
                className="slider flex-1"
                min={0.5}
                max={2}
                step={0.1}
                value={o.s}
                style={{ "--v": `${((o.s - 0.5) / 1.5) * 100}%` } as React.CSSProperties}
                onChange={(e) => tool()?.setOpts({ s: Number(e.target.value) }, false)}
                onPointerUp={commitScale}
                onKeyUp={commitScale}
              />
              <span className="mono text-[11.5px] w-9">{o.s.toFixed(1)}</span>
            </label>
          )}
          {c.text && (
            <label className="block">
              <span className="text-[12.5px]" style={{ color: "var(--cream-dim)" }}>
                {t("words")}
              </span>
              <input
                className="field mt-1 py-1.5 text-sm"
                maxLength={40}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => text !== o.text && tool()?.setOpts({ text })}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              />
            </label>
          )}
          {o.sel && (
            <button type="button" className="ghost-btn w-full mt-1" onClick={() => tool()?.removePicked()}>
              {t("takeAway")}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

const BUILDING_PT: Partial<Record<BuildingKind, string>> = {
  house: "Casa",
  shop: "Loja",
  bar: "Bar",
  diner: "Lanchonete",
  hotel: "Hotel",
  church: "Igreja",
  barn: "Celeiro",
  farmhouse: "Casa da fazenda",
  silo: "Silo",
  shed: "Galpão",
  gas: "Posto",
  boathouse: "Casa de barcos",
};
const buildingName = (k: BuildingKind, pt: boolean) => (pt ? BUILDING_PT[k] : BUILDING_NAMES[k]) ?? k;

/** The buildings tool's row: what it does, what's in the way. */
function BuildingsOptions({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const o = g.buildings;
  return (
    <div className="pointer-events-auto cabinet absolute bottom-[86px] left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 px-3 py-2 max-w-[calc(100vw-24px)] sm:max-w-[60vw]">
      <p className="text-[12px] truncate" style={{ color: o.blocked ? "var(--amber)" : "var(--cream-dim)" }}>
        {o.blocked ? W.notThere[pt ? 1 : 0].replace("{why}", o.blocked) : t("buildingsHint")}
      </p>
    </div>
  );
}

/** The buildings panel (the mock 07-buildings): a kind to put down; its name, size, floors,
 *  door, walls, whether you walk in, its sign — or the picked one's, and taking it away. */
function BuildingsPanel({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const o = g.buildings;
  const tool = () => w?.god?.buildingsTool();
  const lim = PREFABS[o.kind] ?? { min: 6, max: 30, floors: 1 };
  const [name, setName] = useState(o.name);
  const [sign, setSign] = useState(o.sign);
  useEffect(() => setName(o.name), [o.name]);
  useEffect(() => setSign(o.sign), [o.sign]);
  const faces = o.enter ? enterFaces(o.kind) : (["n", "e", "s", "w"] as const);
  const size = (k: "w" | "d") => (
    <input
      type="range"
      className="slider flex-1"
      min={lim.min}
      max={lim.max}
      value={o[k]}
      aria-label={`${t("size")} ${k}`}
      style={{ "--v": `${((o[k] - lim.min) / Math.max(1, lim.max - lim.min)) * 100}%` } as React.CSSProperties}
      onChange={(e) => tool()?.setOpts({ [k]: Number(e.target.value) }, false)}
      onPointerUp={(e) => o.sel && tool()?.setOpts({ [k]: Number(e.currentTarget.value) })}
      onKeyUp={(e) => o.sel && tool()?.setOpts({ [k]: Number(e.currentTarget.value) })}
    />
  );
  return (
    <aside className="pointer-events-auto cabinet absolute top-[92px] right-3 w-72 max-h-[calc(100vh-200px)] overflow-y-auto scroll-thin p-3 hidden sm:block">
      <div className="flex items-baseline justify-between">
        <h3 className="title text-[18px]">{t("buildingsT")}</h3>
        <span className="mono text-[10.5px]" style={{ color: "var(--cream-dim)" }}>
          {t("kinds", PREFAB_KINDS.length)}
        </span>
      </div>
      <div className="zigzag w-24 mt-1.5" aria-hidden />
      <div className="grid grid-cols-4 gap-1.5 mt-2.5" role="radiogroup" aria-label={t("buildingsT")}>
        {PREFAB_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="deck-btn h-14 flex-col gap-1 px-1"
            aria-pressed={o.kind === k && !o.sel}
            onClick={() => tool()?.setKind(k)}
          >
            <Icon name="home" size={16} />
            <span className="text-[10px] leading-tight text-center">{buildingName(k, pt)}</span>
          </button>
        ))}
      </div>
      <p className="grp mt-3">
        {o.sel ? `${o.name} · ${t("picked")}` : t("theNew", buildingName(o.kind, pt).toLowerCase())}
      </p>
      {o.sel?.locked ? (
        <p className="text-[12px] mt-2" style={{ color: "var(--amber)" }}>
          {o.sel.locked}: {t("stays")}
        </p>
      ) : (
        <div className="space-y-2.5 mt-2 text-[12.5px]">
          <label className="flex items-center gap-2">
            <span className="w-16" style={{ color: "var(--cream-dim)" }}>
              {t("name")}
            </span>
            <input
              className="field py-1 text-sm flex-1"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== o.name && tool()?.setOpts({ name })}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="w-16" style={{ color: "var(--cream-dim)" }}>
              {t("size")}
            </span>
            <div className="flex-1 space-y-1">
              {size("w")}
              {size("d")}
            </div>
            <span className="mono text-[11.5px] w-16 text-right">
              {o.w} × {o.d} m
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16" style={{ color: "var(--cream-dim)" }}>
              {t("floors")}
            </span>
            <div className="seg flex-1">
              {Array.from({ length: lim.floors }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={o.floors === n}
                  onClick={() => tool()?.setOpts({ floors: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16" style={{ color: "var(--cream-dim)" }}>
              {t("door")}
            </span>
            <div className="seg flex-1">
              {(["n", "e", "s", "w"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={o.face === f}
                  disabled={!(faces as readonly string[]).includes(f)}
                  onClick={() => tool()?.setOpts({ face: f })}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16" style={{ color: "var(--cream-dim)" }}>
              {t("walls")}
            </span>
            <div className="flex gap-1.5 items-center">
              {WALL_TINTS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  className="w-6 h-6 rounded"
                  aria-label={`${t("walls")} ${i + 1}`}
                  aria-pressed={o.tint === c}
                  style={{
                    background: `var(--tint-${i + 1})`,
                    outline: o.tint === c ? "2px solid var(--amber)" : "1px solid var(--edge-2)",
                    outlineOffset: 1,
                  }}
                  onClick={() => tool()?.setOpts({ tint: c })}
                />
              ))}
              <button
                type="button"
                className="chip"
                aria-pressed={!o.tint}
                onClick={() => tool()?.setOpts({ tint: null })}
              >
                {t("its")}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16" style={{ color: "var(--cream-dim)" }}>
              {t("enterable")}
            </span>
            <button
              type="button"
              className="sw"
              aria-pressed={o.enter}
              aria-label={t("enterable")}
              onClick={() => tool()?.setOpts({ enter: !o.enter })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16" style={{ color: "var(--cream-dim)" }}>
              {t("inside")}
            </span>
            <div className="seg flex-1">
              <button type="button" aria-pressed={o.enter} disabled={!o.enter}>
                {t("generated")}
              </button>
              <button type="button" disabled title={t("soon")}>
                {t("ownFloors")}
              </button>
            </div>
          </div>
          {SIGNED.has(o.kind) && (
            <label className="flex items-center gap-2">
              <span className="w-16" style={{ color: "var(--cream-dim)" }}>
                {t("signW")}
              </span>
              <input
                className="field py-1 text-sm flex-1"
                maxLength={24}
                value={sign}
                onChange={(e) => setSign(e.target.value)}
                onBlur={() => sign !== o.sign && tool()?.setOpts({ sign })}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              />
            </label>
          )}
          {o.sel && (
            <button type="button" className="ghost-btn w-full" onClick={() => tool()?.removePicked()}>
              {t("takeAway")}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function Pointer({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const p = g.pointer;
  return (
    <div className="pointer-events-auto cabinet absolute bottom-3 right-3 hidden lg:block w-56 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--amber)" }}>
          {t("pointer")}
        </span>
        <span className="mono text-[11px]" style={{ color: "var(--cream-dim)" }}>
          {p ? `x ${p.x} · z ${p.z}` : "—"}
        </span>
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-sm">{p ? t("up", p.h.toFixed(1)) : " "}</span>
        <span className="text-[12.5px] text-right" style={{ color: "var(--cream-dim)" }}>
          {p ? (SURFACE_WORDS[p.surface]?.[pt ? 1 : 0] ?? p.surface) : ""}
          {p && (p.wasSurface !== null || p.was !== null) && (
            <>
              {" · "}
              {t(
                "was",
                p.wasSurface !== null
                  ? (SURFACE_WORDS[p.wasSurface]?.[pt ? 1 : 0] ?? p.wasSurface)
                  : (p.was?.toFixed(1) ?? ""),
              )}
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[12.5px]" style={{ color: "var(--cream-dim)" }}>
          {t("snap")}
        </span>
        <div className="seg flex-1">
          {([1, 4, 0] as const).map((s) => (
            <button key={s} type="button" aria-pressed={g.snap === s} onClick={() => w?.god?.setSnap(s)}>
              {s ? `${s} m` : t("off")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Walking({ g }: { g: GodState }) {
  const t = useW();
  const w = useWorld();
  return (
    <>
      <div className="pointer-events-auto faceplate absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 pl-4 pr-2 py-2 max-w-[calc(100vw-24px)]">
        <Icon name="walk" size={16} />
        <span className="mono text-[12px] uppercase tracking-[0.1em] whitespace-nowrap">{t("walking")}</span>
        <span className="text-[13px] hidden sm:inline whitespace-nowrap">
          · {g.changes === 1 ? t("change1") : t("changes", g.changes)} · {t("onlyYou")}
        </span>
        <button
          type="button"
          className="ml-1 rounded-md px-3 py-1.5 text-[12.5px] flex items-center gap-2"
          style={{ background: "var(--ink)", color: "var(--cream)" }}
          onClick={() => w?.god?.walk(false)}
        >
          {t("backUp")} <span className="keycap">Esc</span>
        </button>
      </div>
      <div className="pointer-events-auto cabinet absolute bottom-3 left-3 max-w-72 px-3 py-2 hidden sm:block">
        <p className="text-[13.5px] flex items-start gap-2">
          <span style={{ color: "var(--amber)" }}>
            <Icon name="ear" size={15} />
          </span>
          {t("others")}
        </p>
        <p className="text-[12px] mt-1" style={{ color: "var(--cream-dim)" }}>
          {t("othersSub")}
        </p>
      </div>
    </>
  );
}

/** My drafts (the mock 15-drafts; on a phone a sheet, 18-mobile-drafts): a new one by its name,
 *  each one's changes, when it was saved, the revision it's on; open, rename, duplicate, delete. */
function DraftsPanel({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const god = () => w?.god;
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [sure, setSure] = useState<number | null>(null);
  const list = g.drafts.list;
  const full = (list?.length ?? 0) >= g.drafts.max;
  const make = () => {
    if (!name.trim() || full) return;
    void god()?.newDraft(name);
    setName("");
  };
  const live = g.rev;
  return (
    <section
      className="pointer-events-auto cabinet absolute z-10 left-0 right-0 bottom-0 rounded-b-none sm:rounded-b-[6px] sm:bottom-auto sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:top-[76px] sm:w-[640px] max-h-[78vh] overflow-y-auto scroll-thin p-4 sm:p-5"
      role="dialog"
      aria-label={t("draftsT")}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="title text-[20px] sm:text-[22px]">{t("draftsT")}</h2>
        <span className="mono text-[11px]" style={{ color: "var(--cream-dim)" }}>
          {t("ofMax", list?.length ?? 0).replace("{max}", String(g.drafts.max))}
        </span>
      </div>
      <div className="zigzag w-28 mt-2 mb-3" aria-hidden />
      <div className="flex gap-2">
        <input
          className="field flex-1 py-2 text-sm"
          placeholder={t("newName")}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") make();
            if (e.key === "Escape") god()?.toggleDrafts(false);
          }}
        />
        <button type="button" className="deck-btn" aria-pressed disabled={!name.trim() || full} onClick={make}>
          <Icon name="plus" size={15} />
          <span className="hidden sm:inline">{t("newDraft")}</span>
          <span className="sm:hidden">{t("newShort")}</span>
        </button>
      </div>
      <p className="text-[12px] mt-1.5 mb-2" style={{ color: "var(--cream-dim)" }}>
        {t("newHint")}
      </p>
      {g.drafts.failed && !list && <p className="text-[13px] py-2">{t("draftsFailed")}</p>}
      {list && !list.length && (
        <p className="text-[13px] py-2" style={{ color: "var(--cream-dim)" }}>
          {t("noDrafts")}
        </p>
      )}
      <ul>
        {list?.map((r, i) => {
          const open = r.id === g.draft.id;
          const old = r.baseRev !== live;
          return (
            <li
              key={r.id}
              className="relative flex items-center gap-3 py-2.5 px-2 rounded"
              style={i ? { borderTop: "1px solid var(--well-edge)" } : undefined}
            >
              <div className="flex-1 min-w-0">
                {renaming?.id === r.id ? (
                  <input
                    className="field py-1 text-sm"
                    // biome-ignore lint/a11y/noAutofocus: the rename's box, opened to type in
                    autoFocus
                    maxLength={60}
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: r.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        void god()?.renameDraft(r.id, renaming.name);
                        setRenaming(null);
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={() => setRenaming(null)}
                  />
                ) : (
                  <p className="text-[15px] flex items-center gap-2 min-w-0">
                    <span className="truncate">{r.name}</span>
                    {open && (
                      <span
                        className="mono text-[10.5px] uppercase px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: "var(--amber)", border: "1px solid var(--amber-shade)" }}
                      >
                        {t("openTag")}
                      </span>
                    )}
                  </p>
                )}
                <p className="text-[12px] mt-0.5" style={{ color: "var(--cream-dim)" }}>
                  {t("changesAgo", open ? g.changes : r.changes).replace("{ago}", ago(r.updatedAt, pt))}
                </p>
                <p className="text-[12px]" style={{ color: old && !open ? "var(--warn)" : "var(--cream-dim)" }}>
                  {old && !open ? t("onOld", r.baseRev).replace("{live}", String(live)) : t("onLive", live)}
                </p>
                {sure === r.id && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[13px]">{t("sureDelete").replace("{name}", r.name)}</span>
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ color: "var(--error)" }}
                      onClick={() => {
                        setSure(null);
                        void god()?.deleteDraft(r.id);
                      }}
                    >
                      {t("yesDelete")}
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => setSure(null)}>
                      {t("cancel")}
                    </button>
                  </div>
                )}
              </div>
              {!open && (
                <button
                  type="button"
                  className="ghost-btn flex items-center gap-1"
                  onClick={() => void god()?.openDraft(r.id)}
                >
                  {t("open")}
                </button>
              )}
              <button
                type="button"
                className="ghost-btn px-2"
                aria-label={`${r.name} …`}
                aria-expanded={menu === r.id}
                onClick={() => setMenu(menu === r.id ? null : r.id)}
              >
                ⋯
              </button>
              {menu === r.id && (
                <div
                  className="absolute right-2 top-full z-20 w-44 p-1.5 rounded-[5px] -mt-1"
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--edge-cabinet)",
                    boxShadow: "0 10px 24px rgba(0,0,0,.55)",
                  }}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left text-[13.5px] px-2.5 py-2 rounded"
                    onClick={() => {
                      setMenu(null);
                      setRenaming({ id: r.id, name: r.name });
                    }}
                  >
                    {t("rename")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left text-[13.5px] px-2.5 py-2 rounded"
                    disabled={full}
                    onClick={() => {
                      setMenu(null);
                      void god()?.duplicateDraft(r.id);
                    }}
                  >
                    {t("duplicate")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left text-[13.5px] px-2.5 py-2 rounded"
                    style={{ color: "var(--error)", borderTop: "1px solid var(--edge)" }}
                    onClick={() => {
                      setMenu(null);
                      setSure(r.id);
                    }}
                  >
                    {t("deleteIt")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A new draft's name (the mock 16-named): asked by the first change with none open, or New draft. */
function NameDialog({ g }: { g: GodState }) {
  const t = useW();
  const w = useWorld();
  const n = g.naming;
  if (!n) return null;
  const ok = () => void w?.god?.named(n.name);
  return (
    <div
      className="pointer-events-auto absolute inset-0 grid place-items-center p-3"
      style={{ background: "var(--scrim)" }}
    >
      <section className="cabinet w-[min(440px,100%)] p-5" role="dialog" aria-label={t("nameT")}>
        <h2 className="title text-[20px]">{t("nameT")}</h2>
        <div className="zigzag w-28 mt-2 mb-3" aria-hidden />
        <label className="block">
          <span className="mono text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--amber)" }}>
            {t("itsName")}
          </span>
          <input
            className="field mt-1.5"
            // biome-ignore lint/a11y/noAutofocus: the dialog's one box
            autoFocus
            maxLength={60}
            value={n.name}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => w?.god?.setNaming(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") ok();
              if (e.key === "Escape") w?.god?.cancelNaming();
            }}
          />
        </label>
        <p className="text-[12px] mt-2" style={{ color: "var(--cream-dim)" }}>
          {t("nameHint")}
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="deck-btn" onClick={() => w?.god?.cancelNaming()}>
            {t("cancel")}
          </button>
          <button type="button" className="deck-btn" aria-pressed disabled={!n.name.trim()} onClick={ok}>
            <Icon name="check" size={15} />
            {t("makeIt")}
          </button>
        </div>
      </section>
    </div>
  );
}

function PublishDialog({ g }: { g: GodState }) {
  const t = useW();
  const pt = useLang() === "pt";
  const w = useWorld();
  const [note, setNote] = useState(g.draft.name);
  const input = useRef<HTMLInputElement>(null);
  const pub = g.publish;
  // (worked out once the dialog opens: the draft doesn't change under it)
  // biome-ignore lint/correctness/useExhaustiveDependencies: once a draft
  const sum = useMemo<PublishSummary | null>(() => w?.god?.summary() ?? null, [w, g.changes]);
  useEffect(() => input.current?.focus(), []);
  if (!pub || !sum) return null;
  const c = sum.count;
  const sending = pub.state === "sending";
  const problems = pub.state === "refused" ? (pub.problems ?? []) : sum.problems;
  const moves = (m: { add: number; change: number; remove: number }) =>
    [m.add && `+${m.add}`, m.change && `·${m.change}`, m.remove && `−${m.remove}`].filter(Boolean).join(" ") || "0";
  const chunks = (n: number) => (n === 1 ? t("chunk1") : t("chunks", n));
  const stats: [string, string][] = [
    [t("land"), chunks(c.height)],
    [t("painted"), chunks(c.paint)],
    [t("trees"), chunks(c.trees)],
    [t("ways"), moves(c.ways)],
    [t("things"), moves(c.things)],
    [t("buildings"), moves(c.buildings)],
  ];
  const mb = (b: number) => (b / 1e6).toFixed(b < 1e5 ? 2 : 1);
  return (
    <div
      className="pointer-events-auto absolute inset-0 grid place-items-center p-3"
      style={{ background: "var(--scrim)" }}
    >
      <section
        className="cabinet w-[min(720px,100%)] max-h-[92vh] overflow-y-auto scroll-thin p-5 sm:p-7"
        role="dialog"
        aria-label={g.draft.name ? t("pubNamed", g.draft.name) : t("pubTitle")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="title text-[26px]">{g.draft.name ? t("pubNamed", g.draft.name) : t("pubTitle")}</h2>
            <div className="zigzag w-48 mt-2" aria-hidden />
          </div>
          <button type="button" className="ghost-btn flex items-center gap-1" onClick={() => w?.god?.closePublish()}>
            <Icon name="close" size={13} /> esc
          </button>
        </div>
        <label className="block mt-5">
          <span className="mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--amber)" }}>
            {t("note")}
          </span>
          <input
            ref={input}
            className="field mt-1.5"
            maxLength={140}
            value={note}
            placeholder={t("notePh")}
            disabled={sending}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !problems.length) void w?.god?.publish(note);
              if (e.key === "Escape") w?.god?.closePublish();
            }}
          />
        </label>
        <div className="grid sm:grid-cols-[1fr_240px] gap-5 mt-5">
          <div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              {stats.map(([k, v]) => (
                <div key={k}>
                  <p className="title text-[20px] normal-case tracking-normal">{v}</p>
                  <p className="mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--cream-dim)" }}>
                    {k}
                  </p>
                </div>
              ))}
            </div>
            <p className="grp mt-5">{t("checks")}</p>
            <ul className="mt-2 space-y-1.5 text-[13.5px]">
              {problems.length ? (
                problems.slice(0, 6).map((p) => (
                  <li key={p} className="flex gap-2">
                    <span style={{ color: "var(--rust)" }}>✕</span>
                    {p}
                  </li>
                ))
              ) : (
                <li className="flex gap-2">
                  <span style={{ color: "var(--good)" }}>✓</span>
                  {t("rulesOk")}
                </li>
              )}
              <li className="flex gap-2">
                <span style={{ color: sum.bytes > sum.maxBytes ? "var(--rust)" : "var(--good)" }}>
                  {sum.bytes > sum.maxBytes ? "✕" : "✓"}
                </span>
                {W.sizeMb[pt ? 1 : 0].replace("{mb}", mb(sum.bytes)).replace("{max}", mb(sum.maxBytes))}
              </li>
              {sum.issues.slice(0, 4).map((s) => (
                <li key={s} className="flex gap-2">
                  <span style={{ color: "var(--amber)" }}>!</span>
                  {s}
                </li>
              ))}
              {sum.standing > 0 && (
                <li className="flex gap-2">
                  <span style={{ color: "var(--amber)" }}>!</span>
                  {t("standing", sum.standing)}
                </li>
              )}
              {pub.state === "refused" && pub.reason && (
                <li className="flex gap-2" style={{ color: "var(--rust)" }}>
                  <span>!</span>
                  {pub.reason}
                </li>
              )}
            </ul>
          </div>
          <div>
            <ChangeMap chunks={sum.chunks} />
            <p className="text-[12px] mt-1.5" style={{ color: "var(--cream-dim)" }}>
              {t("where")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
          <p className="text-[12.5px]" style={{ color: "var(--cream-dim)" }}>
            {t("everyone")} {t("pubLeaves")}
          </p>
          <div className="flex gap-2">
            <button type="button" className="deck-btn" disabled={sending} onClick={() => w?.god?.closePublish()}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className="deck-btn"
              aria-pressed
              disabled={sending || problems.length > 0 || sum.bytes > sum.maxBytes}
              onClick={() => void w?.god?.publish(note)}
            >
              <Icon name="publish" size={16} />
              {sending ? t("sending") : t("pubRev", g.rev + 1)}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** The Grounds drawn small (its ways and buildings), what changes outlined in the lamp's colour. */
function ChangeMap({ chunks }: { chunks: [number, number][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const css = getComputedStyle(c);
    const col = (v: string) => css.getPropertyValue(v).trim();
    const S = c.width;
    const gw = GROUNDS.x1 - GROUNDS.x0;
    const gh = GROUNDS.z1 - GROUNDS.z0;
    const k = S / Math.max(gw, gh);
    const X = (x: number) => (x - GROUNDS.x0) * k;
    const Z = (z: number) => (z - GROUNDS.z0) * k;
    g.fillStyle = col("--paper");
    g.fillRect(0, 0, S, S);
    g.strokeStyle = col("--graphite");
    g.lineCap = "round";
    for (const w of WAYS) {
      g.lineWidth = Math.max(1, w.w * k);
      g.beginPath();
      for (const [i, [x, z]] of w.line.entries()) i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z));
      g.stroke();
    }
    g.fillStyle = col("--graphite");
    for (const b of BUILDINGS)
      g.fillRect(X(b.x0), Z(b.z0), Math.max(1, (b.x1 - b.x0) * k), Math.max(1, (b.z1 - b.z0) * k));
    g.fillStyle = col("--amber");
    g.strokeStyle = col("--amber-shade");
    g.lineWidth = 1;
    for (const [cx, cz] of chunks) {
      const x = X(cx * CHUNK);
      const z = Z(cz * CHUNK);
      const s = Math.max(3, CHUNK * k);
      g.globalAlpha = 0.55;
      g.fillRect(x, z, s, s);
      g.globalAlpha = 1;
      g.strokeRect(x, z, s, s);
    }
  }, [chunks]);
  return (
    <canvas
      ref={ref}
      width={240}
      height={240}
      className="w-full aspect-square rounded"
      style={{ border: "1px solid var(--edge-2)" }}
    />
  );
}
