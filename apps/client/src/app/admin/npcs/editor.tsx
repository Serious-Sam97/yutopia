"use client";

import {
  linesWhen,
  NPC_HOURS,
  NPC_LIMITS,
  NPC_SHOTS,
  NPC_TALK,
  NPC_TYPES,
  type NpcBehaviour,
  type NpcDef,
  type NpcLine,
  TRAIT_KEYS,
} from "@yutopia/shared/npc";
import { type CSSProperties, useState } from "react";
import { AvatarEditor } from "@/components/AvatarEditor";
import { CastFace } from "./face";
import { HOURS_WORDS, SHOTS_WORDS, TALK_WORDS, TYPE_WORDS, W, WHEN_WORDS, type Word } from "./words";

// One NPC's editor (docs/plan/120-god-mode-npcs.md): their name, role and voice up top, then their look (the players'
// editor), their lines (EN and PT side by side, by moment), their behaviour and the admins' notes. Every change goes
// up at once (`onChange`); the page saves it.

type Tab = "look" | "lines" | "behaviour" | "notes";
const HALF_HOURS = Array.from({ length: 49 }, (_, i) => i / 2);
const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;

export function NpcEditor({
  npc,
  pt,
  status,
  onChange,
  onCopy,
  onDelete,
  where,
}: {
  npc: NpcDef;
  pt: boolean;
  status: "" | "saving" | "saved" | "failed" | "invalid";
  onChange: (d: NpcDef) => void;
  onCopy: () => void;
  onDelete: () => void;
  /** (plan 121) where God mode put them, said */
  where?: string;
}) {
  const w = (k: Word, n?: string | number) => (W[k][pt ? 1 : 0] as string).replace("{n}", String(n ?? ""));
  const two = (x: [string, string]) => x[pt ? 1 : 0];
  const [tab, setTab] = useState<Tab>(npc.look ? "look" : "lines");
  const vortex = npc.behaviour.type === "vortex";
  const set = (patch: Partial<NpcDef>) => onChange({ ...npc, ...patch });
  const setB = (patch: Partial<NpcBehaviour>) => set({ behaviour: { ...npc.behaviour, ...patch } });
  const tabs: Tab[] = vortex ? ["lines", "behaviour", "notes"] : ["look", "lines", "behaviour", "notes"];
  const shown = tabs.includes(tab) ? tab : tabs[0];

  return (
    <section className="cabinet p-4 sm:p-5" data-npc-editor={npc.key}>
      <div className="flex items-start gap-4 flex-wrap">
        <CastFace look={npc.look} size={64} />
        <div className="flex-1 min-w-[220px] grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mono text-[11px] uppercase tracking-[.06em]" style={{ color: "var(--amber)" }}>
              {w("name")}
            </span>
            <input
              className="field mt-1"
              value={npc.name}
              maxLength={NPC_LIMITS.name}
              onChange={(e) => set({ name: e.target.value })}
              data-npc-name
            />
          </label>
          <label className="block">
            <span className="mono text-[11px] uppercase tracking-[.06em]" style={{ color: "var(--amber)" }}>
              {w("roleEn")}
            </span>
            <input
              className="field mt-1"
              value={npc.role.en}
              maxLength={NPC_LIMITS.role}
              onChange={(e) => set({ role: { ...npc.role, en: e.target.value } })}
            />
          </label>
          <label className="block">
            <span className="mono text-[11px] uppercase tracking-[.06em]" style={{ color: "var(--amber)" }}>
              {w("rolePt")}
            </span>
            <input
              className="field mt-1"
              value={npc.role.pt}
              maxLength={NPC_LIMITS.role}
              onChange={(e) => set({ role: { ...npc.role, pt: e.target.value } })}
            />
          </label>
          <p className="text-xs sm:col-span-2 -mt-1" style={{ color: "var(--muted)" }}>
            {w("roleHint")}
          </p>
        </div>
        <div className="flex flex-col gap-2 items-stretch min-w-[150px]">
          <span className="mono text-[11px] uppercase tracking-[.06em]" style={{ color: "var(--amber)" }}>
            {w("voice")}
          </span>
          <div className="seg">
            {(["man", "woman"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={npc.voice === v} onClick={() => set({ voice: v })}>
                {w(v)}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            <button type="button" className="deck-btn flex-1" onClick={onCopy} data-npc-copy>
              {w("copy")}
            </button>
            <button type="button" className="deck-btn danger flex-1" onClick={onDelete} data-npc-delete>
              {w("delete")}
            </button>
          </div>
          <output
            className="block mono text-xs text-right min-h-4"
            data-npc-status={status}
            style={{ color: status === "failed" || status === "invalid" ? "var(--alert)" : "var(--muted)" }}
          >
            {status === "saving"
              ? w("saving")
              : status === "saved"
                ? `✓ ${w("saved")}`
                : status === "failed"
                  ? w("notSaved")
                  : status === "invalid"
                    ? w("needName")
                    : ""}
          </output>
        </div>
      </div>

      {where && (
        <p className="text-sm mt-3" style={{ color: "var(--cream-dim)" }} data-npc-where>
          <span className="mono text-[11px] uppercase tracking-[.06em] mr-2" style={{ color: "var(--amber)" }}>
            {w("whereTitle")}
          </span>
          {where}
        </p>
      )}
      <div className="flex gap-1 mt-5 mb-4" role="tablist" style={{ borderBottom: "1px solid var(--edge)" }}>
        {tabs.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={shown === x}
            className="relative px-3.5 pt-2 pb-2.5 text-sm font-medium"
            style={{ color: shown === x ? "var(--amber)" : "var(--cream-dim)" }}
            onClick={() => setTab(x)}
            data-npc-tab={x}
          >
            {w(x === "look" ? "tabLook" : x === "lines" ? "tabLines" : x === "behaviour" ? "tabBehaviour" : "tabNotes")}
            {shown === x && (
              <span
                className="absolute left-2.5 right-2.5 -bottom-px h-0.5"
                style={{ background: "var(--amber)", boxShadow: "0 0 8px var(--lamp-glow)" }}
              />
            )}
          </button>
        ))}
      </div>

      {vortex && (
        <p className="text-sm mb-4" style={{ color: "var(--cream-dim)" }}>
          {w("vortexLook")}
        </p>
      )}
      {shown === "look" && npc.look && (
        // (keyed by who: a new person's editor starts from their look)
        <AvatarEditor
          key={npc.key}
          initial={npc.look}
          title={w("lookTitle")}
          onChange={(look) => set({ look })}
          seedName={npc.name}
        />
      )}
      {shown === "lines" && <Lines npc={npc} pt={pt} onLines={(lines) => set({ lines })} w={w} />}
      {shown === "behaviour" && <Behaviour npc={npc} setB={setB} w={w} two={two} />}
      {shown === "notes" && (
        <label className="block">
          <span className="mono text-[11px] uppercase tracking-[.06em]" style={{ color: "var(--amber)" }}>
            {w("notes")}
          </span>
          <textarea
            className="field mt-1 min-h-[180px]"
            value={npc.notes}
            maxLength={NPC_LIMITS.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {w("notesHint")} · {npc.notes.length}/{NPC_LIMITS.notes}
          </span>
        </label>
      )}
    </section>
  );
}

function Lines({
  npc,
  pt,
  onLines,
  w,
}: {
  npc: NpcDef;
  pt: boolean;
  onLines: (l: NpcLine[]) => void;
  w: (k: Word, n?: string | number) => string;
}) {
  const when = linesWhen(npc.behaviour.type);
  const lines = npc.lines;
  const put = (i: number, patch: Partial<NpcLine>) => onLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[i], next[j]] = [next[j], next[i]];
    onLines(next);
  };
  return (
    <div>
      <p className="text-sm mb-3" style={{ color: "var(--cream-dim)" }}>
        {npc.behaviour.type === "vortex" ? w("vortexLines") : w("linesHint", NPC_LIMITS.lines)}
        {" · "}
        {lines.length}/{NPC_LIMITS.lines}
      </p>
      {lines.length === 0 && (
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          {w("noLines")}
        </p>
      )}
      <ol className="space-y-2">
        {lines.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines have no ids; their order is the list's
          <li key={i} className="well p-2 grid gap-2 md:grid-cols-[150px_1fr_1fr_auto] items-start" data-npc-line={i}>
            <select
              className="field py-1.5 text-sm"
              aria-label={w("when")}
              value={l.when}
              onChange={(e) => put(i, { when: e.target.value })}
            >
              {when.map((k) => (
                <option key={k} value={k}>
                  {(WHEN_WORDS[k] ?? [k, k])[pt ? 1 : 0]}
                </option>
              ))}
            </select>
            <textarea
              className="field py-1.5 text-sm min-h-[38px]"
              rows={1}
              aria-label={w("en")}
              placeholder={w("en")}
              maxLength={NPC_LIMITS.line}
              value={l.en}
              onChange={(e) => put(i, { en: e.target.value })}
            />
            <textarea
              className="field py-1.5 text-sm min-h-[38px]"
              rows={1}
              aria-label={w("pt")}
              placeholder={w("pt")}
              maxLength={NPC_LIMITS.line}
              value={l.pt}
              onChange={(e) => put(i, { pt: e.target.value })}
            />
            <div className="flex gap-1">
              <button type="button" className="ghost-btn" aria-label={w("up")} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className="ghost-btn" aria-label={w("down")} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button
                type="button"
                className="ghost-btn"
                aria-label={w("remove")}
                onClick={() => onLines(lines.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="deck-btn mt-3"
        disabled={lines.length >= NPC_LIMITS.lines}
        onClick={() => onLines([...lines, { when: "ambient", en: "", pt: "" }])}
        data-npc-add-line
      >
        + {w("addLine")}
      </button>
    </div>
  );
}

function Behaviour({
  npc,
  setB,
  w,
  two,
}: {
  npc: NpcDef;
  setB: (p: Partial<NpcBehaviour>) => void;
  w: (k: Word, n?: string | number) => string;
  two: (x: [string, string]) => string;
}) {
  const b = npc.behaviour;
  const own = npc.town;
  const label = (k: Word) => (
    <legend className="mono text-[11.5px] uppercase tracking-[.06em] mb-2" style={{ color: "var(--amber)" }}>
      {w(k)}
    </legend>
  );
  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
        {own ? w("ownHint") : w("madeHint")}
      </p>
      <fieldset>
        {label("type")}
        {own ? (
          <p className="well px-3 py-2 text-sm" style={{ color: "var(--cream)" }}>
            <span className="mono text-[11px] uppercase mr-2" style={{ color: "var(--vfd)" }}>
              {w("ownType")}
            </span>
            {two(TYPE_WORDS[b.type])}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {NPC_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className="deck-btn"
                aria-pressed={b.type === t}
                onClick={() => setB({ type: t })}
              >
                {two(TYPE_WORDS[t])}
              </button>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset>
        {label("hours")}
        <div className="seg max-w-md">
          {NPC_HOURS.map((h) => (
            <button key={h} type="button" aria-pressed={b.hours === h} onClick={() => setB({ hours: h })}>
              {two(HOURS_WORDS[h])}
            </button>
          ))}
        </div>
        {b.hours === "shift" && (
          <div className="flex gap-3 mt-2 items-center text-sm">
            <label className="flex items-center gap-2">
              {w("from")}
              <select
                className="field py-1 w-24"
                value={b.from}
                onChange={(e) => setB({ from: Number(e.target.value) })}
              >
                {HALF_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hh(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              {w("to")}
              <select className="field py-1 w-24" value={b.to} onChange={(e) => setB({ to: Number(e.target.value) })}>
                {HALF_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hh(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </fieldset>
      <fieldset>
        {label("pace")}
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <button
              type="button"
              className="sw"
              aria-pressed={b.pace === null}
              aria-label={w("byGait")}
              onClick={() => setB({ pace: b.pace === null ? 1 : null })}
            />
            {w("byGait")}
          </label>
          {b.pace !== null && (
            <label className="flex items-center gap-3 text-sm">
              <input
                type="range"
                className="slider w-48"
                min={0.5}
                max={1.5}
                step={0.05}
                value={b.pace}
                style={{ "--v": `${((b.pace - 0.5) / 1) * 100}%` } as CSSProperties}
                onChange={(e) => setB({ pace: Number(e.target.value) })}
                aria-label={w("pace")}
              />
              <span className="mono">{b.pace.toFixed(2)}×</span>
            </label>
          )}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        {label("traits")}
        <label className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className="sw"
            aria-pressed={b.traits === null}
            aria-label={w("byKey")}
            onClick={() =>
              setB({ traits: b.traits === null ? { outgoing: 0.5, active: 0.5, neat: 0.5, cheerful: 0.5 } : null })
            }
            data-npc-traits-auto
          />
          {w("byKey")}
        </label>
        {b.traits !== null &&
          TRAIT_KEYS.map((k) => {
            const v = b.traits?.[k] ?? 0.5;
            return (
              <label key={k} className="flex items-center gap-3 text-sm">
                <span className="w-56">{w(k)}</span>
                <input
                  type="range"
                  className="slider w-48"
                  min={0}
                  max={1}
                  step={0.1}
                  value={v}
                  style={{ "--v": `${v * 100}%` } as CSSProperties}
                  onChange={(e) =>
                    setB({
                      traits: {
                        outgoing: b.traits?.outgoing ?? 0.5,
                        active: b.traits?.active ?? 0.5,
                        neat: b.traits?.neat ?? 0.5,
                        cheerful: b.traits?.cheerful ?? 0.5,
                        [k]: Number(e.target.value),
                      },
                    })
                  }
                  aria-label={w(k)}
                  data-npc-trait={k}
                />
                <span className="mono">{v.toFixed(1)}</span>
              </label>
            );
          })}
      </fieldset>
      <fieldset>
        {label("talk")}
        <div className="seg max-w-md">
          {NPC_TALK.map((t) => (
            <button key={t} type="button" aria-pressed={b.talk === t} onClick={() => setB({ talk: t })}>
              {two(TALK_WORDS[t])}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        {label("reactions")}
        <label className="flex items-center gap-2 text-sm">
          <button type="button" className="sw" aria-pressed={b.greet} onClick={() => setB({ greet: !b.greet })} />
          {w("greet")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <button type="button" className="sw" aria-pressed={b.answer} onClick={() => setB({ answer: !b.answer })} />
          {w("answer")}
        </label>
        <p className="text-sm mt-3" style={{ color: "var(--cream-dim)" }}>
          {w("shots")}
        </p>
        <div className="seg max-w-sm mt-1">
          {NPC_SHOTS.map((s) => (
            <button key={s} type="button" aria-pressed={b.shots === s} onClick={() => setB({ shots: s })}>
              {two(SHOTS_WORDS[s])}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
