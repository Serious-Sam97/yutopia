"use client";

import { traitWords } from "@yutopia/shared/mind";
import {
  BREED_COAT,
  BREEDS,
  cleanLook,
  DEFAULT_OUTFIT,
  EYE_COLORS,
  feelingOf,
  learned,
  levelProgress,
  MARK_COLORS,
  type Needs,
  OUTFIT_COLORS,
  OUTFIT_OPTIONS,
  PART_COLORS,
  PART_NAMES,
  PET_MAX,
  PET_NAME_MAX,
  type PetLook,
  type PetParts,
  SPECIES,
  SPECIES_DEFS,
  type Species,
  statsOf,
  TOYS,
  type Toy,
  tricksFor,
} from "@yutopia/shared/pets";
import { useEffect, useMemo, useState } from "react";
import { type Key as TrKey, useTr } from "@/lib/i18n";
import { emoteUrl } from "@/world/art/emotes";
import { HELD_BOX, heldSvg } from "@/world/art/held";
import { svgDoc } from "@/world/art/svgdoc";
import { hud, type PetInfo, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Icon } from "./icons";
import { Panel } from "./Panel";
import { PetFace, PetTurntable } from "./PetFace";

type Tr = (k: TrKey) => string;
const fill = (s: string, v: Record<string, string | number>) =>
  Object.entries(v).reduce((t, [k, x]) => t.replace(`{${k}}`, String(x)), s);
type Tab = "status" | "play" | "tricks" | "style" | "battles";
const TABS: Tab[] = ["status", "play", "tricks", "style", "battles"];
const ON = { border: "1px solid var(--vfd)", boxShadow: "inset 0 0 20px rgba(255,166,48,.12)" } as const;
const SEGS = Array.from({ length: 20 }, (_, i) => i + 1);
const faceOf = (pet: PetInfo) => {
  if (!pet.alive) return "closed" as const;
  const f = feelingOf(pet.needs);
  return f === "happy" ? ("happy" as const) : f === "ok" || f === "bored" ? ("open" as const) : ("sad" as const);
};

// The Pets cabinet (docs/plan/14-pets-v2.md): on the left the rack of pets
// and the one picked on its turntable with a name plate and a glance at how
// it's doing; on the right the deck — Status (LED meters, the stat dials,
// commands), Play (toys you take in your hand), Tricks (lessons, progress
// rings), Style (its look and clothes, live on the turntable), Battles (its
// record). Adopting: six species on their stands, a colour, a name.
export function PetPanel() {
  const t = useTr();
  const pets = useHud((s) => s.pets);
  const focus = useHud((s) => s.petFocus);
  const mine = pets.filter((p) => p.mine);
  const others = pets.filter((p) => !p.mine);
  const [adopting, setAdopting] = useState(false);
  const [tab, setTab] = useState<Tab>("status");
  const pet = pets.find((p) => p.id === focus) ?? mine[0] ?? pets[0] ?? null;
  useEffect(() => {
    if (!pets.length) setAdopting(true);
  }, [pets.length]);
  const showAdopt = adopting || !pet;
  const pick = (id: string) => {
    hud.set({ petFocus: id });
    setAdopting(false);
  };
  return (
    <Panel title={t("pets")} size="max-w-4xl h-[min(760px,94vh)]">
      <div className="grid gap-4 h-full min-h-0" style={{ gridTemplateColumns: "250px minmax(0, 1fr)" }}>
        <aside className="flex flex-col gap-3 min-h-0">
          <div className="well p-1.5 flex flex-col gap-1">
            {mine.map((p) => (
              <RackRow key={p.id} pet={p} on={!showAdopt && p.id === pet?.id} onPick={() => pick(p.id)} t={t} />
            ))}
            {mine.length < PET_MAX && (
              <button
                type="button"
                className="tile-card flex items-center gap-2.5 px-2 h-11 text-left"
                aria-pressed={showAdopt}
                onClick={() => setAdopting(true)}
              >
                <span
                  className="w-8 h-8 rounded-full grid place-items-center"
                  style={{ border: "1px dashed var(--edge)", color: "var(--vfd)" }}
                >
                  <Icon name="plus" size={16} />
                </span>
                <span className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--cream-dim)" }}>
                  {t("petAdopt")}
                </span>
              </button>
            )}
            {others.length > 0 && (
              <>
                <div className="grp mt-1 px-1" style={{ fontSize: 10 }}>
                  {t("petNearby")}
                </div>
                {others.map((p) => (
                  <RackRow key={p.id} pet={p} on={!showAdopt && p.id === pet?.id} onPick={() => pick(p.id)} t={t} />
                ))}
              </>
            )}
          </div>
          {!showAdopt && pet && <Stand pet={pet} t={t} />}
        </aside>

        <section className="min-h-0 flex flex-col gap-3">
          {showAdopt ? (
            <Adopt onDone={() => setAdopting(false)} />
          ) : pet && !pet.alive ? (
            <Memorial pet={pet} t={t} />
          ) : pet ? (
            <>
              <div className="seg">
                {TABS.map((k) => (
                  <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
                    {t(`petTab_${k}` as TrKey)}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-1">
                {tab === "status" && <StatusTab pet={pet} t={t} />}
                {tab === "play" && <PlayTab pet={pet} t={t} />}
                {tab === "tricks" && <TricksTab pet={pet} t={t} />}
                {tab === "style" && <StyleTab pet={pet} t={t} />}
                {tab === "battles" && <BattlesTab pet={pet} t={t} />}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </Panel>
  );
}

function RackRow({ pet, on, onPick, t }: { pet: PetInfo; on: boolean; onPick: () => void; t: Tr }) {
  return (
    <button
      type="button"
      className="tile-card flex items-center gap-2.5 px-2 h-12 text-left"
      aria-pressed={on}
      onClick={onPick}
    >
      <span
        className="w-9 h-9 rounded-full overflow-hidden grid place-items-center shrink-0"
        style={{ background: "#120d09" }}
      >
        <PetFace species={pet.species} look={pet.look} outfit={pet.outfit} face={faceOf(pet)} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm truncate" style={{ color: "var(--cream)" }}>
          {pet.name}
        </span>
        <span className="block mono text-[10px] uppercase tracking-wide truncate" style={{ color: "var(--muted)" }}>
          {t(`sp_${pet.species}` as TrKey)} · Lv {pet.level}
          {!pet.mine && ` · ${pet.owner.split(" ")[0]}`}
        </span>
      </span>
      {pet.alive && <Led color={ledFor(Math.min(pet.needs.food, pet.needs.water, pet.needs.health))} />}
    </button>
  );
}

const ledFor = (v: number) => (v < 25 ? "var(--rust)" : v < 50 ? "var(--amber)" : "#8aa04a");
function Led({ color }: { color: string }) {
  return <i className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />;
}

// The pet on its stand, its name plate, how it feels at a glance.
function Stand({ pet, t }: { pet: PetInfo; t: Tr }) {
  const f = feelingOf(pet.needs);
  const lp = levelProgress(pet.xp);
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="vfd-window relative overflow-hidden" style={{ aspectRatio: "1 / 1.05" }}>
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[16%] w-[70%] h-[10%] rounded-[50%]"
          style={{ background: "radial-gradient(ellipse at center, rgba(255,166,48,.35), rgba(255,166,48,0) 70%)" }}
        />
        <div className="absolute inset-0 grid place-items-center">
          <PetTurntable
            species={pet.species}
            look={pet.look}
            outfit={pet.outfit}
            face={faceOf(pet)}
            pose={!pet.alive ? "ko" : pet.mode === "sleep" ? "sleep" : pet.act.startsWith("trick:sit") ? "sit" : "idle"}
            size={230}
          />
        </div>
        <div className="absolute top-2 left-2 chip" style={{ fontSize: 10 }}>
          Lv {pet.level}
        </div>
        <div className="absolute top-2 right-2 chip" style={{ fontSize: 10 }}>
          {t(`sp_${pet.species}` as TrKey)}
        </div>
      </div>
      <div className="faceplate px-3 py-2">
        <div className="lcd text-2xl leading-none truncate" style={{ color: "#5b3a26", textShadow: "none" }}>
          {pet.name.toUpperCase()}
        </div>
        <div className="mono text-[10px] uppercase tracking-wide mt-1 truncate" style={{ color: "#6b5a44" }}>
          {pet.alive ? `${t(`feel_${f}` as TrKey)} · ${t(`mode_${pet.mode}` as TrKey)}` : t("petGone")}
          {!pet.mine && ` · ${fill(t("petOwner"), { name: pet.owner.split(" ")[0] })}`}
        </div>
      </div>
      {pet.alive && (
        <div className="well px-2.5 py-2 flex flex-col gap-1.5">
          <MiniBar
            label="XP"
            value={lp.into / lp.need}
            color="var(--vfd)"
            right={lp.level >= 30 ? "MAX" : `${lp.into}/${lp.need}`}
          />
          {(["food", "water", "energy", "fun", "health"] as (keyof Needs)[]).map((k) => (
            <MiniBar key={k} label={t(`need_${k}` as TrKey)} value={pet.needs[k] / 100} color={ledFor(pet.needs[k])} />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniBar({ label, value, color, right }: { label: string; value: number; color: string; right?: string }) {
  return (
    <div className="flex items-center gap-2 mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
      <span className="w-14 truncate">{label}</span>
      <span className="flex-1 h-[6px] rounded overflow-hidden" style={{ background: "#0d0906" }}>
        <span
          className="block h-full"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
        />
      </span>
      {right && <span className="w-12 text-right">{right}</span>}
    </div>
  );
}

// An LED meter: twenty segments, lit to the value, in the colour of how it's going.
function Meter({ label, value, action }: { label: string; value: number; action?: React.ReactNode }) {
  const lit = Math.round((Math.max(0, Math.min(100, value)) / 100) * 20);
  const color = ledFor(value);
  return (
    <div className="flex items-center gap-3">
      <span className="mono text-[11px] uppercase tracking-wide w-16 shrink-0" style={{ color: "var(--cream-dim)" }}>
        {label}
      </span>
      <span
        className="vfd-window flex-1 flex items-center gap-[3px] px-2 py-1.5"
        role="img"
        aria-label={`${label} ${Math.round(value)}`}
      >
        {SEGS.map((n) => (
          <i
            key={n}
            className="flex-1 h-3 rounded-[2px]"
            style={{
              background: n <= lit ? color : "#2b1f16",
              boxShadow: n <= lit ? `0 0 5px ${color}` : "none",
              opacity: n <= lit ? 1 : 0.6,
            }}
          />
        ))}
      </span>
      <span className="lcd w-9 text-right text-lg leading-none">{Math.round(value)}</span>
      <span className="w-[86px] shrink-0 flex justify-end">{action}</span>
    </div>
  );
}

// A dial for a stat: an arc out of 40.
function Dial({ label, value }: { label: string; value: number }) {
  const k = Math.max(0, Math.min(1, value / 40));
  const c = Math.PI * 26; // half circle
  return (
    <div className="well flex flex-col items-center py-2 px-1">
      <svg viewBox="0 0 64 40" width={72} height={45} role="img" aria-label={`${label} ${value}`}>
        <title>{`${label} ${value}`}</title>
        <path d="M6 36 A26 26 0 0 1 58 36" fill="none" stroke="#2b1f16" strokeWidth="7" strokeLinecap="round" />
        <path
          d="M6 36 A26 26 0 0 1 58 36"
          fill="none"
          stroke="var(--vfd)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${c * k} ${c}`}
          style={{ filter: "drop-shadow(0 0 4px rgba(255,166,48,.6))" }}
        />
        <text x="32" y="34" textAnchor="middle" fontSize="15" fill="var(--vfd)" fontFamily="var(--font-lcd)">
          {value}
        </text>
      </svg>
      <span className="mono text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </span>
    </div>
  );
}

function DeckKey({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      className={`deck-btn ${tone ?? ""}`}
      style={{ height: 32, fontSize: 11, padding: "0 10px" }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// A pick that walks you over to the pet first (the action queue), closing the panel.
function useQueue(pet: PetInfo) {
  const w = useWorld();
  return (act: string) => {
    w?.actions.add(act, { type: "pet", id: pet.id }, pet.name);
    hud.set({ panel: { kind: null } });
  };
}

function StatusTab({ pet, t }: { pet: PetInfo; t: Tr }) {
  const w = useWorld();
  const stats = statsOf(pet.species, pet.level);
  const busy = !!pet.act || !!pet.battle;
  const queue = useQueue(pet);
  const cmd = (c: string) => w?.send("pet:cmd", { id: pet.id, cmd: c as never });
  const [sure, setSure] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="grp">{t("petNeeds")}</div>
        <Meter
          label={t("need_food")}
          value={pet.needs.food}
          action={
            pet.mine && (
              <DeckKey disabled={busy} onClick={() => queue("snack")}>
                {t("act_snack")}
              </DeckKey>
            )
          }
        />
        <Meter
          label={t("need_water")}
          value={pet.needs.water}
          action={
            pet.mine && (
              <DeckKey disabled={busy} onClick={() => queue("water")}>
                {t("act_water")}
              </DeckKey>
            )
          }
        />
        <Meter
          label={t("need_energy")}
          value={pet.needs.energy}
          action={
            pet.mine &&
            pet.mode !== "sleep" && (
              <DeckKey disabled={busy} onClick={() => cmd("sleep")}>
                {t("act_sleep")}
              </DeckKey>
            )
          }
        />
        <Meter
          label={t("need_fun")}
          value={pet.needs.fun}
          action={
            <DeckKey disabled={busy} onClick={() => queue("petpet")}>
              {t("act_petpet")}
            </DeckKey>
          }
        />
        <Meter label={t("need_health")} value={pet.needs.health} />
        <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>
          {t("petNeedsHint")}
        </div>
      </div>
      <Mind pet={pet} t={t} />
      <div className="flex flex-col gap-2">
        <div className="grp">{t("petStats")}</div>
        <div className="grid grid-cols-4 gap-2">
          {(["power", "speed", "wit", "heart"] as const).map((k) => (
            <Dial key={k} label={t(`stat_${k}` as TrKey)} value={stats[k]} />
          ))}
        </div>
      </div>
      {pet.mine && (
        <div className="flex flex-col gap-2">
          <div className="grp">{t("petCommands")}</div>
          <div className="flex flex-wrap gap-1.5">
            {(["come", "follow", "explore", "stay", "sleep", "speak"] as const).map((c) => (
              <DeckKey key={c} disabled={busy} onClick={() => cmd(c)}>
                {t(`act_${c === "follow" ? "followMe" : c}` as TrKey)}
              </DeckKey>
            ))}
          </div>
          <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>
            {t("petCommandsHint")}
          </div>
        </div>
      )}
      {pet.mine && (
        <div className="flex justify-end pt-2" style={{ borderTop: "1px solid var(--edge)" }}>
          {sure ? (
            <div className="flex items-center gap-2 text-xs">
              <span>{fill(t("petReleaseSure"), { name: pet.name })}</span>
              <DeckKey tone="danger" onClick={() => w?.send("pet:release", { id: pet.id })}>
                {t("petRelease")}
              </DeckKey>
              <button type="button" className="ghost-btn" style={{ height: 28 }} onClick={() => setSure(false)}>
                {t("actCancel")}
              </button>
            </div>
          ) : (
            <button type="button" className="ghost-btn text-xs" onClick={() => setSure(true)}>
              {t("petRelease")}
            </button>
          )}
        </div>
      )}
      {!pet.mine && (
        <div className="flex gap-1.5">
          <DeckKey disabled={busy} onClick={() => queue("challenge")}>
            {t("act_challenge")}
          </DeckKey>
        </div>
      )}
    </div>
  );
}

const toyPic = (kind: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoc(heldSvg(kind, "", 4), HELD_BOX, 4))}`;
const HOW: Record<Toy, TrKey> = {
  ball: "petPlay_throw",
  frisbee: "petPlay_throw",
  rope: "petPlay_tug",
  feather: "petPlay_feather",
  laser: "petPlay_laser",
};

// Its mind (shared/mind.ts): what it wants right now, who it is, who it's close to.
function Mind({ pet, t }: { pet: PetInfo; t: Tr }) {
  const people = useHud((s) => s.people);
  const words = traitWords(pet.traits as never);
  const bonds = Object.entries(pet.bonds)
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const nameOf = (uid: string) => people.find((p) => String(p.uid) === uid)?.name ?? t("petBondSomeone");
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="grp">{t("petWants")}</div>
        <div className="flex items-center gap-2 text-sm">
          {pet.want ? (
            <>
              {/* biome-ignore lint/performance/noImgElement: a drawn token */}
              <img alt="" src={emoteUrl(pet.want as never)} width={28} height={28} draggable={false} />
              <span>{t(`want_${pet.want}` as TrKey)}</span>
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>{t("petWantsNothing")}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="grp">{t("petPersonality")}</div>
        <div className="text-sm">{words.map((w) => t(`trait_${w}` as TrKey)).join(" · ")}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(pet.traits).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="mono text-[10px] uppercase w-24 shrink-0" style={{ color: "var(--cream-dim)" }}>
                {t(`trait_${k}` as TrKey)}
              </span>
              <span className="flex-1 h-1.5 rounded-full" style={{ background: "var(--edge)" }}>
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.round(v * 100)}%`, background: "var(--vfd)" }}
                />
              </span>
            </div>
          ))}
        </div>
        <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>
          {t("petPersonalityHint")}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="grp">{t("petBonds")}</div>
        {bonds.length ? (
          <div className="flex gap-3 flex-wrap">
            {bonds.map(([uid, v]) => (
              <div key={uid} className="flex flex-col items-center gap-0.5">
                <Ring value={v} done={false} />
                <span className="mono text-[10px] uppercase" style={{ color: "var(--cream-dim)" }}>
                  {nameOf(uid)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            {t("petBondsNone")}
          </div>
        )}
        <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>
          {t("petBondsHint")}
        </div>
      </div>
    </>
  );
}

function PlayTab({ pet, t }: { pet: PetInfo; t: Tr }) {
  const w = useWorld();
  const held = useHud((s) => s.held?.kind ?? "");
  const def = SPECIES_DEFS[pet.species];
  const busy = !!pet.act || !!pet.battle;
  const queue = useQueue(pet);
  if (!pet.mine)
    return (
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        {t("petPlayOthers")}
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="grp">{t("petToys")}</div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {TOYS.map((toy) => {
          const mineNow = held === toy;
          return (
            <div key={toy} className="tile-card p-2.5 flex flex-col gap-2" style={mineNow ? ON : undefined}>
              <div className="flex items-center gap-2.5">
                <span
                  className="w-12 h-12 rounded-lg grid place-items-center shrink-0"
                  style={{ background: "#120d09" }}
                >
                  {/* biome-ignore lint/performance/noImgElement: generated SVG */}
                  <img src={toyPic(toy)} alt="" width={40} height={46} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm" style={{ color: "var(--cream)" }}>
                    {t(`toy_${toy}` as TrKey)}
                    {def.favourite === toy && <span style={{ color: "var(--rust)" }}> ♥</span>}
                  </div>
                  <div className="mono text-[10px] leading-snug" style={{ color: "var(--muted)" }}>
                    {t(HOW[toy])}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {!mineNow ? (
                  <DeckKey
                    onClick={() => {
                      w?.takeToy(toy);
                      if (toy !== "rope" && toy !== "feather") hud.set({ panel: { kind: null } });
                    }}
                  >
                    {t("petTake")}
                  </DeckKey>
                ) : toy === "rope" ? (
                  <DeckKey disabled={busy} onClick={() => queue("play_rope")}>
                    {t("petTug")}
                  </DeckKey>
                ) : toy === "feather" ? (
                  <DeckKey disabled={busy} onClick={() => queue("play_feather")}>
                    {t("petWiggle")}
                  </DeckKey>
                ) : (
                  <DeckKey
                    onClick={() => {
                      w?.armThrow(true);
                      hud.set({ panel: { kind: null } });
                    }}
                  >
                    {t(toy === "laser" ? "pointArm" : "throwArm")}
                  </DeckKey>
                )}
                {mineNow && (
                  <button
                    type="button"
                    className="ghost-btn"
                    style={{ height: 32, fontSize: 11 }}
                    onClick={() => w?.putDown()}
                  >
                    {t("heldPutDown")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>
        {t("petToysHint2")} · {fill(t("petFavourite"), { toy: t(`toy_${def.favourite}` as TrKey).toLowerCase() })}
      </div>
    </div>
  );
}

function Ring({ value, done }: { value: number; done: boolean }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" width={40} height={40} role="img" aria-label={done ? "learned" : `${Math.round(value)}%`}>
      <title>{done ? "learned" : `${Math.round(value)}%`}</title>
      <circle cx="20" cy="20" r={r} fill="none" stroke="#2b1f16" strokeWidth="5" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={done ? "#8aa04a" : "var(--vfd)"}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, value / 100)} ${c}`}
        transform="rotate(-90 20 20)"
        style={{ filter: done ? "drop-shadow(0 0 4px rgba(138,160,74,.7))" : undefined }}
      />
      <text
        x="20"
        y="24"
        textAnchor="middle"
        fontSize="11"
        fill={done ? "#8aa04a" : "var(--vfd)"}
        fontFamily="var(--font-lcd)"
      >
        {done ? "✓" : Math.round(value)}
      </text>
    </svg>
  );
}

function TricksTab({ pet, t }: { pet: PetInfo; t: Tr }) {
  const w = useWorld();
  const def = SPECIES_DEFS[pet.species];
  const busy = !!pet.act || !!pet.battle;
  const queue = useQueue(pet);
  return (
    <div className="flex flex-col gap-3">
      <div className="grp">{t("petTricks")}</div>
      <div className="grid grid-cols-2 gap-2">
        {tricksFor(pet.species).map((tr) => {
          const prog = pet.tricks[tr] ?? 0;
          const done = learned(pet.tricks, tr);
          const sig = def.signature === tr;
          return (
            <div key={tr} className="tile-card p-2.5 flex items-center gap-2.5" style={done ? ON : undefined}>
              <Ring value={prog} done={done} />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate" style={{ color: "var(--cream)" }}>
                  {t(`trick_${tr}` as TrKey)}
                  {sig && <span style={{ color: "var(--vfd)" }}> ★</span>}
                </div>
                <div className="mono text-[10px] leading-snug" style={{ color: "var(--muted)" }}>
                  {sig ? t("petSignature") : done ? t("petLearned") : prog ? `${prog}%` : t("petNotYet")}
                </div>
              </div>
              {pet.mine &&
                (done ? (
                  <DeckKey disabled={busy} onClick={() => w?.send("pet:cmd", { id: pet.id, cmd: "trick", trick: tr })}>
                    {t("petDo")}
                  </DeckKey>
                ) : (
                  <DeckKey disabled={busy} onClick={() => queue(`teach_${tr}`)}>
                    {t("petTeach")}
                  </DeckKey>
                ))}
            </div>
          );
        })}
      </div>
      <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>
        {t("petTricksHint")}
      </div>
    </div>
  );
}

function StyleTab({ pet, t }: { pet: PetInfo; t: Tr }) {
  const w = useWorld();
  const def = SPECIES_DEFS[pet.species];
  const [name, setName] = useState(pet.name);
  useEffect(() => setName(pet.name), [pet.name]);
  const edit = (patch: { name?: string; look?: unknown; outfit?: unknown }) =>
    w?.send("pet:edit", { id: pet.id, ...patch });
  if (!pet.mine)
    return (
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        {t("petStyleOthers")}
      </div>
    );
  const o = pet.outfit;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="grp">{t("petAdoptName")}</span>
        <input
          className="field"
          value={name}
          maxLength={PET_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== pet.name && edit({ name: name.trim() })}
        />
      </label>
      <div className="flex flex-col gap-2">
        <div className="grp">{t("petLook")}</div>
        <Breeds
          species={pet.species}
          look={pet.look}
          onPick={(breed) => edit({ look: { ...pet.look, breed, color: BREED_COAT[breed] ?? pet.look.color } })}
          t={t}
        />
        <Swatches
          label={t("petColor")}
          colors={def.colors}
          value={pet.look.color}
          onPick={(color) => edit({ look: { ...pet.look, color } })}
        />
        <Parts look={pet.look} onChange={(look) => edit({ look })} t={t} />
        <Choice
          label={t("petMark")}
          options={def.marks}
          value={pet.look.mark}
          onPick={(mark) => edit({ look: { ...pet.look, mark } })}
          t={t}
          prefix="mark_"
        />
        {pet.look.mark !== "none" && (
          <Swatches
            label={t("petMarkColor")}
            colors={MARK_COLORS}
            value={pet.look.markColor}
            onPick={(markColor) => edit({ look: { ...pet.look, markColor } })}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="grp">{t("petOutfit")}</div>
        {(["hat", "collar", "coat"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <Choice
              label={t(k)}
              options={OUTFIT_OPTIONS[k]}
              value={o[k]}
              onPick={(v) => edit({ outfit: { ...o, [k]: v } })}
              t={t}
              prefix={`${k}_`}
            />
            {o[k] !== "none" && (
              <Swatches
                label=""
                colors={OUTFIT_COLORS}
                value={o[`${k}Color` as const]}
                onPick={(c) => edit({ outfit: { ...o, [`${k}Color`]: c } })}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BattlesTab({ pet, t }: { pet: PetInfo; t: Tr }) {
  const def = SPECIES_DEFS[pet.species];
  const sig = learned(pet.tricks, def.signature);
  const busy = !!pet.act || !!pet.battle;
  const queue = useQueue(pet);
  return (
    <div className="flex flex-col gap-3">
      <div className="grp">{t("petTab_battles")}</div>
      <div className="grid grid-cols-3 gap-2">
        {[
          [pet.wins, t("petWins")],
          [pet.losses, t("petLosses")],
          [40 + statsOf(pet.species, pet.level).heart * 4, "HP"],
        ].map(([v, label]) => (
          <div key={String(label)} className="vfd-window px-3 py-2 text-center">
            <div className="lcd text-2xl">{v}</div>
            <div className="mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="well p-3 text-xs leading-relaxed" style={{ color: "var(--cream-dim)" }}>
        <p>{t("petBattleRules")}</p>
        <p className="mt-1.5">
          <span style={{ color: "var(--vfd)" }}>★ {t(`trick_${def.signature}` as TrKey)}</span> —{" "}
          {t(`special_${pet.species}` as TrKey)}
          {!sig && <span style={{ color: "var(--muted)" }}> · {t("petSpecialLocked")}</span>}
        </p>
      </div>
      {!pet.mine && (
        <DeckKey disabled={busy} onClick={() => queue("challenge")}>
          {t("act_challenge")}
        </DeckKey>
      )}
    </div>
  );
}

function Memorial({ pet, t }: { pet: PetInfo; t: Tr }) {
  const w = useWorld();
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="text-base" style={{ color: "var(--cream)" }}>
        {fill(t("petDead"), { name: pet.name })}
      </div>
      <div className="text-xs max-w-sm" style={{ color: "var(--muted)" }}>
        {t("petDeadHint")}
      </div>
      <div className="mono text-[11px] uppercase" style={{ color: "var(--cream-dim)" }}>
        Lv {pet.level} · {fill(t("petRecord"), { w: pet.wins, l: pet.losses })}
      </div>
      {pet.mine && <DeckKey onClick={() => w?.send("pet:release", { id: pet.id })}>{t("petGoodbye")}</DeckKey>}
    </div>
  );
}

function Adopt({ onDone }: { onDone: () => void }) {
  const t = useTr();
  const w = useWorld();
  const [species, setSpecies] = useState<Species>("dog");
  const [name, setName] = useState("");
  const def = SPECIES_DEFS[species];
  const [color, setColor] = useState(def.colors[0]);
  const [mark, setMark] = useState("none");
  const [markColor, setMarkColor] = useState(MARK_COLORS[0]);
  const [breed, setBreed] = useState<string>(BREEDS.dog[0]);
  const [parts, setParts] = useState<Pick<PetLook, "parts" | "eyeColor">>({});
  const look = cleanLook(species, { color, mark, markColor, breed, ...parts });
  const pick = (sp: Species) => {
    setSpecies(sp);
    setColor(SPECIES_DEFS[sp].colors[0]);
    setMark("none");
    setBreed(BREEDS[sp][0]);
    setParts({});
  };
  const pickBreed = (b: string) => {
    setBreed(b);
    if (BREED_COAT[b]) setColor(BREED_COAT[b]);
  };
  const label = name.trim() || t(`sp_${species}` as TrKey);
  return (
    <div className="flex flex-col gap-3 min-h-0 overflow-y-auto scroll-thin pr-1">
      <div className="grp">{t("petAdoptTitle")}</div>
      <div className="grid grid-cols-3 gap-2">
        {SPECIES.map((sp) => (
          <button
            key={sp}
            type="button"
            className="tile-card flex flex-col items-center gap-1 pt-1 pb-2"
            aria-pressed={sp === species}
            onClick={() => pick(sp)}
          >
            <PetTurntable
              species={sp}
              look={cleanLook(sp, {
                color: sp === species ? color : SPECIES_DEFS[sp].colors[0],
                mark: sp === species ? mark : "none",
                markColor,
                breed: sp === species ? breed : BREEDS[sp][0],
              })}
              outfit={DEFAULT_OUTFIT}
              size={96}
              spin={sp === species}
            />
            <span
              className="mono text-[11px] uppercase tracking-wide"
              style={{ color: sp === species ? "var(--vfd)" : "var(--cream-dim)" }}
            >
              {t(`sp_${sp}` as TrKey)}
            </span>
          </button>
        ))}
      </div>
      <div className="well p-3 flex flex-col gap-2">
        <div className="mono text-[10px] leading-snug" style={{ color: "var(--muted)" }}>
          {t(`about_${species}` as TrKey)}
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="mono uppercase text-[10px]" style={{ color: "var(--cream-dim)" }}>
            {t("petAdoptName")}
          </span>
          <input
            className="field"
            value={name}
            maxLength={PET_NAME_MAX}
            placeholder={t(`sp_${species}` as TrKey)}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Breeds species={species} look={look} onPick={pickBreed} t={t} />
        <Swatches label={t("petColor")} colors={def.colors} value={color} onPick={(c) => c && setColor(c)} />
        <Parts look={look} onChange={(l) => setParts({ parts: l.parts, eyeColor: l.eyeColor })} t={t} />
        <Choice label={t("petMark")} options={def.marks} value={mark} onPick={setMark} t={t} prefix="mark_" />
        {mark !== "none" && (
          <Swatches
            label={t("petMarkColor")}
            colors={MARK_COLORS}
            value={markColor}
            onPick={(c) => c && setMarkColor(c)}
          />
        )}
      </div>
      <button
        type="button"
        className="deck-btn primary"
        onClick={() => {
          w?.send("pet:adopt", { species, name: name.trim(), look });
          onDone();
        }}
      >
        {fill(t("petAdoptGo"), { name: label })}
      </button>
    </div>
  );
}

// The breeds as chips, each with its portrait in the pet's colours.
function Breeds({
  species,
  look,
  onPick,
  t,
}: {
  species: Species;
  look: PetLook;
  onPick: (breed: string) => void;
  t: Tr;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="mono text-[10px] uppercase" style={{ color: "var(--cream-dim)" }}>
        {t("petBreed")}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {BREEDS[species].map((b) => (
          <button
            key={b}
            type="button"
            className="chip flex items-center gap-1 pl-0.5"
            aria-pressed={b === look.breed}
            onClick={() => onPick(b)}
          >
            <PetFace
              species={species}
              look={cleanLook(species, { ...look, breed: b, color: BREED_COAT[b] ?? look.color })}
              outfit={DEFAULT_OUTFIT}
              size={26}
            />
            {t(`breed_${b}` as TrKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Eye colour and the parts you colour on their own (auto = derived from the coat).
function Parts({ look, onChange, t }: { look: PetLook; onChange: (look: PetLook) => void; t: Tr }) {
  const setPart = (k: keyof PetParts, c: string | null) => {
    const parts: PetParts = { ...look.parts };
    if (c) parts[k] = c;
    else delete parts[k];
    const next: PetLook = { ...look };
    if (Object.keys(parts).length) next.parts = parts;
    else delete next.parts;
    onChange(next);
  };
  const setEyes = (c: string | null) => {
    const next: PetLook = { ...look };
    if (c) next.eyeColor = c;
    else delete next.eyeColor;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Swatches
        label={t("petEyes")}
        colors={EYE_COLORS}
        value={look.eyeColor ?? ""}
        onPick={setEyes}
        auto={t("partAuto")}
      />
      <span className="mono text-[10px] uppercase" style={{ color: "var(--cream-dim)" }}>
        {t("petParts")}
      </span>
      {PART_NAMES.map((k) => (
        <Swatches
          key={k}
          label={t(`part_${k}` as TrKey)}
          colors={PART_COLORS}
          value={look.parts?.[k] ?? ""}
          onPick={(c) => setPart(k, c)}
          auto={t("partAuto")}
        />
      ))}
    </div>
  );
}

function Swatches({
  label,
  colors,
  value,
  onPick,
  auto,
}: {
  label: string;
  colors: readonly string[];
  value: string;
  onPick: (c: string | null) => void;
  auto?: string; // with a label: an "auto" chip that clears the colour
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {label && (
        <span className="mono text-[10px] uppercase w-24 shrink-0" style={{ color: "var(--cream-dim)" }}>
          {label}
        </span>
      )}
      {auto && (
        <button type="button" className="chip" aria-pressed={!value} onClick={() => onPick(null)}>
          {auto}
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={c === value}
          className="w-6 h-6 rounded-full"
          style={{
            background: c,
            border: c === value ? "2px solid var(--vfd)" : "1px solid var(--edge)",
            boxShadow: c === value ? "0 0 6px rgba(255,166,48,.5)" : "none",
          }}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

function Choice({
  label,
  options,
  value,
  onPick,
  t,
  prefix,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onPick: (v: string) => void;
  t: Tr;
  prefix: string;
}) {
  const names = useMemo(() => options.map((o) => [o, t(`${prefix}${o}` as TrKey)] as const), [options, t, prefix]);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="mono text-[10px] uppercase w-24 shrink-0" style={{ color: "var(--cream-dim)" }}>
        {label}
      </span>
      {names.map(([o, n]) => (
        <button key={o} type="button" className="chip" aria-pressed={o === value} onClick={() => onPick(o)}>
          {n}
        </button>
      ))}
    </div>
  );
}
