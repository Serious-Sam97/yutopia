"use client";

import { DECOR, entry, TEXT_DEFAULT } from "@yutopia/shared";
import { addStrings, trMaybe, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";
import type { Member } from "./BuildMode";
import { FABRICS, ItemCard, Layouts, Setups } from "./Catalog";
import { DesksPanel } from "./DesksPanel";
import { MapPanel } from "./MapPanel";
import { labelOf } from "./shop";
import { type LotPart, lotPatch } from "./tabs";
import { ItemThumb } from "./thumbs";

// Build mode's Lot tab (docs/plan/124-the-build-view.md, F3a): what's done to the whole place — a room furnished by a
// plan, the setups I saved, whose desk is whose, the floor's size and where people arrive. And the Design tool's panel
// (F8a, The Sims 3's Create a Style): a placed thing's looks, fabric and words, changed live.

addStrings(
  {
    bvLot_layouts: ["Layouts", "Layouts"],
    bvLot_setups: ["My setups", "Meus conjuntos"],
    bvLot_desks: ["Desks", "Mesas"],
    bvLot_map: ["The floor", "O andar"],
    bvLotHint_layouts: [
      "Furnish the room you're standing in from a plan — Undo puts it back.",
      "Mobilie o cômodo onde você está com um plano — Desfazer volta.",
    ],
    bvLotHint_setups: [
      "Groups of things you saved: select some in the room, then Save as setup.",
      "Grupos de coisas que você salvou: selecione algumas no cômodo e Salvar como conjunto.",
    ],
    bvLotHint_desks: [
      "Drag a name onto a seat, or click a seat.",
      "Arraste um nome para um assento, ou clique num assento.",
    ],
    bvLotHint_map: ["Where people arrive, and the floor's size.", "Onde as pessoas chegam, e o tamanho do andar."],
    bvDesignTitle: ["{name} · restyle", "{name} · estilo"],
    bvDesignLive: ["Changes show live · ⌘Z undoes", "Muda na hora · ⌘Z desfaz"],
    bvDesignPick: ["Click a thing in the room to restyle it.", "Clique numa coisa no cômodo para mudar o estilo."],
    bvDesignNone: ["This one has no other looks.", "Este não tem outros estilos."],
    bvDesignDone: ["Done", "Pronto"],
    bvFabric: ["Fabric", "Tecido"],
    bvLooks: ["Looks", "Estilos"],
    bvAsItCame: ["As it came", "Original"],
    bvCustomizeTitle: ["{name} · before it goes down", "{name} · antes de colocar"],
    bvCustomizeLive: ["Shown on the one in hand · every copy takes it", "Aparece no que está na mão · toda cópia leva"],
    bvBackToCatalog: ["Back to the catalog", "Voltar ao catálogo"],
    bvCustomize: ["Customize", "Personalizar"],
  },
  "yutopia-build",
);
const lw = (k: string) => trMaybe(k) ?? k;

const PARTS: { key: LotPart; icon: IconName }[] = [
  { key: "layouts", icon: "home" },
  { key: "setups", icon: "pin" },
  { key: "desks", icon: "tag" },
  { key: "map", icon: "map" },
];

export function LotColumn({ lot }: { lot: LotPart }) {
  const t = useTr();
  const w = useWorld();
  return (
    <div className="flex flex-col gap-1.5 p-3 min-w-0" style={{ borderRight: "1px solid var(--glass-hair)" }}>
      <span className="gl-lab">{t("buildMode")}</span>
      {PARTS.map((p) => (
        <button
          key={p.key}
          type="button"
          className="gl-btn !justify-start !h-[38px]"
          aria-pressed={p.key === lot}
          data-testid={`lot-part-${p.key}`}
          onClick={() => {
            w?.clearRoomGhost();
            w?.build?.setMode("hand");
            hud.set((s) => ({ build: { ...s.build, ...lotPatch(p.key) } }));
          }}
        >
          <Icon name={p.icon} size={18} />
          {lw(`bvLot_${p.key}`)}
        </button>
      ))}
    </div>
  );
}

export function LotMain({ lot, members }: { lot: LotPart; members: Member[] }) {
  return (
    <div className="flex flex-col min-h-0 min-w-0 overflow-y-auto gl-scroll py-2.5 px-3.5">
      {lot === "layouts" && <Layouts />}
      {lot === "setups" && <Setups />}
      {lot === "desks" && <DesksPanel members={members} />}
      {lot === "map" && <MapPanel />}
    </div>
  );
}

export function LotCard({ lot }: { lot: LotPart }) {
  const b = useHud((s) => s.build);
  if (b.mode === "place" || b.held.length) return <ItemCard />;
  return (
    <div className="flex flex-col gap-2 p-3.5">
      <span className="gl-title">{lw(`bvLot_${lot}`)}</span>
      <p className="text-[12.5px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {lw(`bvLotHint_${lot}`)}
      </p>
    </div>
  );
}

const LOOKS = [0, 1, 2, 3, 4, 5, 6, 7];

/** The Design tool's panel: the picked thing's looks, its fabric, its words — each applied as it's clicked. */
export function DesignMain() {
  const w = useWorld();
  const sel = useHud((s) => s.build.selected);
  useHud((s) => s.objectsVersion);
  const o = sel[0] ? w?.model?.getObject(sel[0]) : null;
  if (!o)
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <Icon name="brush" size={30} />
        <p className="text-[14px] font-extrabold">{lw("bvDesignPick")}</p>
      </div>
    );
  return (
    <DesignPanel
      id={o.id}
      kind={o.kind}
      props={(o.props ?? {}) as Record<string, unknown>}
      apply={(patch) => w?.build?.setLook(patch)}
      done={() => w?.build?.setMode("hand")}
      doneLabel={lw("bvDesignDone")}
    />
  );
}

/** (plan 124 follow-up) Customize what's on the pointer before it goes down: the same panel, on the piece in hand —
 *  every copy put down after takes it. */
export function DesignHeld() {
  const w = useWorld();
  const b = useHud((s) => s.build);
  if (b.mode !== "place" || !b.kind) return null;
  return (
    <DesignPanel
      id={`held:${b.kind}`}
      kind={b.kind}
      props={b.props ?? {}}
      apply={(patch) => w?.build?.placeLook(patch === "shuffle" ? { seed: Math.random() } : patch)}
      done={() => hud.set((s) => ({ build: { ...s.build, styling: false } }))}
      doneLabel={lw("bvBackToCatalog")}
      held
    />
  );
}

/** The design tool's panel: a thing's looks (or its decor kinds and Shuffle), its fabric with names, its words — each
 *  applied as it's clicked. */
function DesignPanel({
  id,
  kind,
  props,
  apply,
  done,
  doneLabel,
  held = false,
}: {
  id: string;
  kind: string;
  props: Record<string, unknown>;
  apply: (patch: Record<string, unknown> | "shuffle") => void;
  done: () => void;
  doneLabel: string;
  held?: boolean;
}) {
  const t = useTr();
  const e = entry(kind);
  const looks = e.variants ?? 1;
  const decorOpts = kind in DECOR ? (DECOR[kind as keyof typeof DECOR] as readonly string[]) : null;
  const words = e.text ?? 0;
  const none = looks <= 1 && !decorOpts && !e.paint && !words;
  return (
    <div className="flex flex-col gap-2 py-2.5 px-3.5 min-w-0 min-h-0" data-testid="design-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="gl-title !text-[17px] truncate">
          {lw(held ? "bvCustomizeTitle" : "bvDesignTitle").replace("{name}", labelOf({ key: id, kind, props }))}
        </span>
        <span className="gl-lab shrink-0">{lw(held ? "bvCustomizeLive" : "bvDesignLive")}</span>
        <button type="button" className="gl-btn gl-sm gl-go shrink-0" onClick={done} data-testid="design-done">
          <Icon name={held ? "chev" : "check"} size={14} className={held ? "rotate-90" : undefined} />
          {doneLabel}
        </button>
      </div>
      {none && (
        <p className="text-[13px] font-bold" style={{ color: "var(--glass-dim)" }}>
          {lw("bvDesignNone")}
        </p>
      )}
      <div className="flex-1 min-h-0 flex gap-5 overflow-x-auto gl-scroll">
        {(looks > 1 || decorOpts) && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <span className="gl-lab">{lw("bvLooks")}</span>
            <div className="grid grid-rows-2 grid-flow-col gap-1.5">
              {decorOpts
                ? decorOpts.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="gl-tile w-[66px] h-[62px]"
                      aria-pressed={props.d === d}
                      title={trMaybe(`decor_${d}`) ?? d}
                      onClick={() => apply({ d })}
                    >
                      <span className="absolute inset-1 flex items-center justify-center">
                        <ItemThumb kind={kind} props={{ ...props, d }} />
                      </span>
                    </button>
                  ))
                : LOOKS.slice(0, looks).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="gl-tile w-[66px] h-[62px]"
                      aria-pressed={(props.variant ?? e.look ?? 0) === v}
                      title={`${t("buildLook")} ${v + 1}`}
                      onClick={() => apply({ variant: v })}
                    >
                      <span className="absolute inset-1 flex items-center justify-center">
                        <ItemThumb kind={kind} props={{ ...props, variant: v }} />
                      </span>
                    </button>
                  ))}
              {decorOpts && (
                <button
                  type="button"
                  className="gl-tile w-[66px] h-[62px] flex-col gap-1"
                  title={t("buildShuffle")}
                  onClick={() => apply("shuffle")}
                >
                  <Icon name="shuffle" size={20} />
                  <span className="text-[10px] font-bold">{t("buildShuffle")}</span>
                </button>
              )}
            </div>
          </div>
        )}
        {e.paint && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <span className="gl-lab">{lw("bvFabric")}</span>
            <div className="grid grid-cols-7 gap-x-2 gap-y-1.5">
              <button
                type="button"
                className="flex flex-col items-center gap-1"
                aria-pressed={!props.color}
                onClick={() => apply({ color: "" })}
              >
                <span
                  className="w-[28px] h-[28px] rounded-full grid place-items-center text-[13px] font-black"
                  style={{
                    background: "var(--glass-hi)",
                    boxShadow: !props.color
                      ? "0 0 0 2px var(--glass-hi), 0 0 0 4px var(--glass-acc)"
                      : "0 1px 3px rgba(0,0,0,.35)",
                  }}
                >
                  ×
                </span>
                <span className="text-[9.5px] font-bold" style={{ color: "var(--glass-dim)" }}>
                  {lw("bvAsItCame")}
                </span>
              </button>
              {FABRICS.map(([c, name]) => {
                const on = props.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    className="flex flex-col items-center gap-1"
                    aria-pressed={on}
                    aria-label={name}
                    onClick={() => apply({ color: c })}
                  >
                    <span
                      className="w-[28px] h-[28px] rounded-full"
                      style={{
                        background: c,
                        boxShadow: on
                          ? "0 0 0 2px var(--glass-hi), 0 0 0 4px var(--glass-acc)"
                          : "0 1px 3px rgba(0,0,0,.35)",
                      }}
                    />
                    <span className="text-[9.5px] font-bold" style={{ color: "var(--glass-dim)" }}>
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {words > 0 && (
          <label className="flex flex-col gap-1.5 min-w-[240px]">
            <span className="gl-lab">{t("buildWords")}</span>
            <input
              key={id}
              defaultValue={String(props.text ?? TEXT_DEFAULT[kind] ?? "")}
              maxLength={words}
              aria-label={t("buildWords")}
              className="gl-field uppercase"
              onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
              }}
              onBlur={(ev) => apply({ text: ev.target.value })}
            />
            <span className="text-[11px] font-semibold" style={{ color: "var(--glass-dim)" }}>
              {t(kind === "split_flap" ? "buildWordsRows" : "buildWordsHint")}
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
