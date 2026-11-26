import {
  DOOR_LOOKS,
  entry,
  isDoorKind,
  OPENING_HEIGHTS,
  OPENING_SILLS,
  OPENING_WIDTHS,
  openingCut,
  WINDOW_LOOKS,
} from "@yutopia/shared";
import { addStrings, type Key, trMaybe, useTr } from "@/lib/i18n";
import { FABRICS } from "./Catalog";

// (docs/plan/130-the-house-build.md, phase 8) A door's or window's own: its width, its height, a window's sill (slid up
// and down the wall), its leaf's or glazing's look, a window's shutters and curtains. For one going into a wall drawn
// free (the tile lines' openings keep the catalog's size); picked for the one in hand, or changed on one put down.

addStrings(
  {
    opWidth: ["Width", "Largura"],
    opHeight: ["Height", "Altura"],
    opSill: ["Sill", "Peitoril"],
    opLook: ["Look", "Estilo"],
    opShutters: ["Shutters", "Venezianas"],
    opCurtains: ["Curtains", "Cortinas"],
    opNone: ["None", "Nenhuma"],
    opKeys: ["PgUp / PgDn slide it up and down the wall.", "PgUp / PgDn sobem e descem na parede."],
    opLook_panel: ["Panelled", "Almofadada"],
    opLook_six: ["Six panel", "Seis almofadas"],
    opLook_flush: ["Flush", "Lisa"],
    opLook_glass: ["Glazed", "Vidrada"],
    opLook_half: ["Half glass", "Meio vidro"],
    opLook_french: ["French", "Francesa"],
    opLook_plank: ["Plank", "Tábuas"],
    opLook_dutch: ["Dutch", "Holandesa"],
    opLook_craftsman: ["Craftsman", "Artesanal"],
    opLook_modern: ["Modern", "Moderna"],
    opLook_casement: ["Casement", "De abrir"],
    opLook_grid: ["Colonial grid", "Quadriculada"],
    opLook_hung: ["Double-hung", "Guilhotina"],
    opLook_picture: ["Picture", "Fixa"],
    opLook_transom: ["Transom", "Com bandeira"],
    opLook_awning: ["Awning", "Maxim-ar"],
    opLook_louvre: ["Louvre", "Basculante"],
    opLook_diamond: ["Leaded", "Losangos"],
    opLook_prairie: ["Prairie", "Pradaria"],
    opLook_slider: ["Slider", "De correr"],
  },
  "opening-options",
);

const round = (v: number) => Math.round(v * 100) / 100;

export function OpeningOptions({
  kind,
  props,
  apply,
}: {
  kind: string;
  props: Record<string, unknown>;
  apply: (patch: Record<string, unknown>) => void;
}) {
  const t = useTr();
  const door = isDoorKind(kind);
  const [c0, c1] = openingCut(kind);
  const w = typeof props.ow === "number" ? props.ow : Math.max(1, entry(kind).w);
  const h = typeof props.oh === "number" ? props.oh : round(c1 - c0);
  const sill = typeof props.sill === "number" ? props.sill : round(c0);
  const look = typeof props.look === "string" ? props.look : null;
  const looks: readonly string[] = door ? DOOR_LOOKS : WINDOW_LOOKS;
  const round_ = kind === "window_round" || kind === "window_stained" || kind === "window_studio";
  const leafed = !door || kind === "door" || kind === "door_double";
  const row = (label: Key, opts: readonly number[], on: number, key: string, unit = " m") => (
    <fieldset
      className="flex items-center gap-1.5 border-0 m-0 min-w-0"
      aria-label={t(label)}
      data-testid={`op-${key}`}
    >
      <span className="gl-lab w-[52px] shrink-0">{t(label)}</span>
      <div className="gl-seg flex-wrap min-w-0">
        {opts.map((v) => (
          <button
            key={v}
            type="button"
            className="gl-btn gl-sm"
            aria-pressed={Math.abs(on - v) < 1e-3}
            onClick={() => apply({ [key]: v })}
          >
            {v}
            {unit}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const colours = (label: Key, key: "shutters" | "curtains") => (
    <fieldset
      className="flex items-center gap-1.5 border-0 m-0 min-w-0"
      aria-label={t(label)}
      data-testid={`op-${key}`}
    >
      <span className="gl-lab w-[52px] shrink-0">{t(label)}</span>
      <div className="flex gap-1 flex-wrap">
        <button
          type="button"
          className="gl-btn gl-sm !px-1.5"
          aria-pressed={props[key] == null}
          onClick={() => apply({ [key]: null })}
        >
          {t("opNone" as Key)}
        </button>
        {FABRICS.map(([c, name]) => (
          <button
            key={c}
            type="button"
            className="w-[20px] h-[20px] rounded-full"
            style={{
              background: c,
              boxShadow:
                props[key] === c
                  ? "0 0 0 2px var(--glass-hi), 0 0 0 4px var(--glass-acc)"
                  : "0 1px 3px rgba(0,0,0,.35)",
            }}
            title={name}
            aria-label={name}
            aria-pressed={props[key] === c}
            onClick={() => apply({ [key]: c })}
          />
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="flex flex-col gap-1.5" data-testid="opening-options">
      {row("opWidth" as Key, door ? OPENING_WIDTHS.door : OPENING_WIDTHS.window, w, "ow")}
      {row("opHeight" as Key, door ? OPENING_HEIGHTS.door : OPENING_HEIGHTS.window, h, "oh")}
      {!door && row("opSill" as Key, OPENING_SILLS, sill, "sill")}
      {leafed && !round_ && (
        <fieldset
          className="flex items-center gap-1.5 border-0 m-0 min-w-0"
          aria-label={t("opLook" as Key)}
          data-testid="op-look"
        >
          <span className="gl-lab w-[52px] shrink-0">{t("opLook" as Key)}</span>
          <div className="gl-seg flex-wrap min-w-0">
            {looks.map((k) => (
              <button
                key={k}
                type="button"
                className="gl-btn gl-sm"
                aria-pressed={look === k || (!look && k === looks[0])}
                onClick={() => apply({ look: k })}
              >
                {trMaybe(`opLook_${k}`) ?? k}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {!door && colours("opShutters" as Key, "shutters")}
      {!door && colours("opCurtains" as Key, "curtains")}
      {!door && (
        <p className="text-[11.5px] font-semibold" style={{ color: "var(--glass-dim)" }}>
          {t("opKeys" as Key)}
        </p>
      )}
    </div>
  );
}
