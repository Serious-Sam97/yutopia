"use client";

import {
  AVATAR_OPTIONS,
  type AvatarLayers,
  avatarFromSeed,
  CLOTH_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
} from "@yutopia/shared";
import { useEffect, useState } from "react";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { useChars } from "@/components/useChars";
import { type Key, useLang, useTr } from "@/lib/i18n";

type ShapeKey = keyof typeof AVATAR_OPTIONS;
// shoes: cream, black, walnut, rust, olive, slate; frames: dark, tortoise, gold, rust, slate
const SHOE_COLORS = ["#efe4cc", "#2a2420", "#5b3a26", "#b5562f", "#6e7b3a", "#3d4a5c"];
const FRAME_COLORS = ["#2a2420", "#5b3a26", "#c39a4a", "#b5562f", "#3d4a5c"];
// every option's name, English and Portuguese (docs/plan/60: the slugs aren't how you'd say them)
const NAMES: Record<string, [string, string]> = {
  none: ["None", "Nenhum"],
  regular: ["Regular", "Normal"],
  broad: ["Broad", "Largo"],
  slim: ["Slim", "Magro"],
  short: ["Short", "Curto"],
  long: ["Long", "Longo"],
  curly: ["Curly", "Cacheado"],
  bun: ["Bun", "Coque"],
  afro: ["Afro", "Black power"],
  bob: ["Bob", "Chanel"],
  mohawk: ["Mohawk", "Moicano"],
  bald: ["Bald", "Careca"],
  ponytail: ["Ponytail", "Rabo de cavalo"],
  buzz: ["Buzz", "Raspado"],
  crew: ["Crew cut", "Militar"],
  slick: ["Slicked back", "Para trás"],
  spiky: ["Spiky", "Espetado"],
  braids: ["Braids", "Tranças"],
  pixie: ["Pixie", "Joãozinho"],
  wavy: ["Wavy", "Ondulado"],
  curtain: ["Curtain bangs", "Franja aberta"],
  locs: ["Locs", "Dreads"],
  topknot: ["Top knot", "Coque alto"],
  undercut: ["Undercut", "Undercut"],
  fade: ["Fade", "Degradê"],
  pigtails: ["Pigtails", "Maria-chiquinha"],
  highpony: ["High ponytail", "Rabo alto"],
  cornrows: ["Cornrows", "Nagô"],
  stubble: ["Stubble", "Barba por fazer"],
  mustache: ["Moustache", "Bigode"],
  goatee: ["Goatee", "Cavanhaque"],
  full: ["Full beard", "Barba cheia"],
  chinstrap: ["Chinstrap", "Barba de contorno"],
  muttonchops: ["Mutton chops", "Costeletas"],
  tee: ["Tee", "Camiseta"],
  hoodie: ["Hoodie", "Moletom com capuz"],
  shirt: ["Shirt", "Camisa"],
  jacket: ["Jacket", "Jaqueta"],
  sweater: ["Sweater", "Suéter"],
  dress: ["Dress", "Vestido"],
  polo: ["Polo", "Polo"],
  turtleneck: ["Turtleneck", "Gola alta"],
  blazer: ["Blazer", "Blazer"],
  cardigan: ["Cardigan", "Cardigã"],
  tank: ["Tank", "Regata"],
  longtee: ["Long-sleeve tee", "Manga longa"],
  henley: ["Henley", "Henley"],
  sweatshirt: ["Sweatshirt", "Moletom"],
  flannel: ["Flannel", "Camisa xadrez"],
  crop: ["Crop top", "Cropped"],
  fleece: ["Fleece", "Fleece"],
  puffer: ["Puffer", "Puffer"],
  parka: ["Parka", "Parka"],
  coat: ["Coat", "Sobretudo"],
  denim: ["Denim jacket", "Jaqueta jeans"],
  raincoat: ["Raincoat", "Capa de chuva"],
  vest: ["Vest", "Colete"],
  jeans: ["Jeans", "Jeans"],
  trousers: ["Trousers", "Calça social"],
  shorts: ["Shorts", "Bermuda"],
  skirt: ["Skirt", "Saia"],
  cargo: ["Cargo", "Cargo"],
  longskirt: ["Long skirt", "Saia longa"],
  joggers: ["Joggers", "Jogger"],
  chinos: ["Chinos", "Chino"],
  wide: ["Wide-leg", "Pantalona"],
  leggings: ["Leggings", "Legging"],
  overalls: ["Overalls", "Macacão"],
  pleated: ["Pleated skirt", "Saia plissada"],
  snowpants: ["Snow pants", "Calça de neve"],
  sneakers: ["Sneakers", "Tênis"],
  hightops: ["High-tops", "Cano alto"],
  boots: ["Boots", "Botas"],
  loafers: ["Loafers", "Mocassim"],
  sandals: ["Sandals", "Sandálias"],
  snowboots: ["Snow boots", "Botas de neve"],
  runners: ["Runners", "Tênis de corrida"],
  chelsea: ["Chelsea boots", "Botina"],
  flats: ["Flats", "Sapatilha"],
  slipons: ["Slip-ons", "Slip-on"],
  headphones: ["Headphones", "Fones"],
  cap: ["Cap", "Boné"],
  beanie: ["Beanie", "Gorro"],
  beret: ["Beret", "Boina"],
  bucket: ["Bucket hat", "Chapéu bucket"],
  bandana: ["Bandana", "Bandana"],
  headband: ["Headband", "Faixa"],
  earmuffs: ["Earmuffs", "Protetor de orelha"],
  pompom: ["Pom-pom beanie", "Gorro com pompom"],
  trapper: ["Trapper hat", "Gorro de pele"],
  flatcap: ["Flat cap", "Boina inglesa"],
  visor: ["Visor", "Viseira"],
  hairclip: ["Hair clip", "Presilha"],
  glasses: ["Glasses", "Óculos"],
  round: ["Round", "Redondo"],
  sunglasses: ["Sunglasses", "Óculos escuros"],
  aviators: ["Aviators", "Aviador"],
  cateye: ["Cat-eye", "Gatinho"],
  halfrim: ["Half-rim", "Meio aro"],
  goggles: ["Snow goggles", "Óculos de neve"],
  walkman: ["Walkman", "Walkman"],
  scarf: ["Scarf", "Cachecol"],
  earrings: ["Earrings", "Brincos"],
  necklace: ["Necklace", "Colar"],
  backpack: ["Backpack", "Mochila"],
  watch: ["Watch", "Relógio"],
  crossbody: ["Crossbody bag", "Bolsa transversal"],
  mittens: ["Mittens", "Luvas"],
  bracelets: ["Bracelets", "Pulseiras"],
  tie: ["Tie", "Gravata"],
  lanyard: ["Lanyard", "Crachá"],
  tote: ["Tote bag", "Ecobag"],
  fannypack: ["Fanny pack", "Pochete"],
  plaid: ["Plaid", "Xadrez"],
  stripes: ["Stripes", "Listras"],
  check: ["Check", "Vichy"],
  dots: ["Dots", "Bolinhas"],
  trim: ["Trims", "Detalhes"],
  tweed: ["Tweed", "Tweed"],
  sportcoat: ["Sport coat", "Paletó esporte"],
  shirttie: ["Shirt and tie", "Camisa e gravata"],
  suit: ["Suit trousers", "Calça de alfaiataria"],
  laceboots: ["Lace-up boots", "Botas de cadarço"],
  swept: ["Swept back", "Penteado para trás"],
  boxed: ["Boxed beard", "Barba aparada"],
  satchel: ["Leather satchel", "Bolsa de couro"],
};
type Tab = "body" | "hair" | "top" | "bottom" | "feet" | "extras";
// (the tabs' names live here, not in i18n.ts: the editor is out of the world page)
const TABS: { id: Tab; name: [string, string] }[] = [
  { id: "body", name: ["Body", "Corpo"] },
  { id: "hair", name: ["Hair", "Cabelo"] },
  { id: "top", name: ["Top", "Em cima"] },
  { id: "bottom", name: ["Bottom", "Embaixo"] },
  { id: "feet", name: ["Shoes", "Sapatos"] },
  { id: "extras", name: ["Extras", "Extras"] },
];
type Focus = "head" | "chest" | "legs" | "feet";
interface Row {
  /** the options (AVATAR_OPTIONS) in `field`; pictured, framed on `focus` */
  shape?: ShapeKey;
  field?: keyof AvatarLayers;
  focus?: Focus;
  /** a colour in `color`, from the palette or any (the picker) */
  color?: keyof AvatarLayers;
  palette?: string[];
  /** its name: a key in i18n.ts, or its own */
  label?: Key;
  name?: [string, string];
  tab: Tab;
  /** shown only while this is worn */
  when?: (a: AvatarLayers) => boolean;
}
const worn = (k: keyof AvatarLayers) => (a: AvatarLayers) => !!a[k] && a[k] !== "none";
const ROWS: Row[] = [
  { shape: "gender", label: "gender", tab: "body" },
  { shape: "body", label: "body", tab: "body", focus: "chest" },
  // (plan 58 4e: kept with the look, seen by everyone; the preview walks it)
  { shape: "gait", label: "gait", tab: "body" },
  { color: "skin", palette: SKIN_TONES, label: "skin", tab: "body" },
  { shape: "hair", label: "hair", tab: "hair", focus: "head" },
  { color: "hairColor", palette: HAIR_COLORS, label: "hairColor", tab: "hair" },
  { shape: "beard", label: "beard", tab: "hair", focus: "head" },
  { shape: "top", label: "top", tab: "top", focus: "chest" },
  { color: "topColor", palette: CLOTH_COLORS, label: "topColor", tab: "top" },
  { shape: "pattern", field: "topPattern", name: ["Pattern", "Estampa"], tab: "top", focus: "chest" },
  {
    color: "topColor2",
    palette: CLOTH_COLORS,
    name: ["Second colour", "Segunda cor"],
    tab: "top",
    when: worn("topPattern"),
  },
  { shape: "outer", name: ["Over it", "Por cima"], tab: "top", focus: "chest" },
  { color: "outerColor", palette: CLOTH_COLORS, name: ["Its colour", "Cor"], tab: "top", when: worn("outer") },
  {
    shape: "pattern",
    field: "outerPattern",
    name: ["Its pattern", "Estampa"],
    tab: "top",
    focus: "chest",
    when: worn("outer"),
  },
  {
    color: "outerColor2",
    palette: CLOTH_COLORS,
    name: ["Second colour", "Segunda cor"],
    tab: "top",
    when: (a) => worn("outer")(a) && worn("outerPattern")(a),
  },
  { shape: "bottom", label: "bottom", tab: "bottom", focus: "legs" },
  { color: "bottomColor", palette: CLOTH_COLORS, label: "bottomColor", tab: "bottom" },
  { shape: "pattern", field: "bottomPattern", name: ["Pattern", "Estampa"], tab: "bottom", focus: "legs" },
  {
    color: "bottomColor2",
    palette: CLOTH_COLORS,
    name: ["Second colour", "Segunda cor"],
    tab: "bottom",
    when: worn("bottomPattern"),
  },
  { shape: "shoes", label: "shoes", tab: "feet", focus: "feet" },
  { color: "shoesColor", palette: SHOE_COLORS, label: "shoesColor", tab: "feet" },
  { color: "shoesColor2", palette: SHOE_COLORS, name: ["Sole colour", "Cor da sola"], tab: "feet" },
  { shape: "accessory", label: "accessory", tab: "extras", focus: "head" },
  { color: "accessoryColor", palette: CLOTH_COLORS, label: "accessoryColor", tab: "extras", when: worn("accessory") },
  { shape: "eyewear", label: "eyewear", tab: "extras", focus: "head" },
  { color: "eyewearColor", palette: FRAME_COLORS, label: "eyewearColor", tab: "extras", when: worn("eyewear") },
  { shape: "extra", label: "extra", tab: "extras", focus: "chest" },
  { color: "extraColor", palette: CLOTH_COLORS, label: "extraColor", tab: "extras", when: worn("extra") },
];

// An option's picture: the look with it on, framed on what it's about (rendered by the 3D people, a few
// a frame, kept); its name under it. Text alone where WebGL can't draw.
const thumbs = new Map<string, string | null>();
const waiting: (() => void)[] = [];
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    // (two a frame: a tab of twenty fills in a few frames, the preview keeps turning)
    for (let i = 0; i < 2 && waiting.length; i++) waiting.shift()?.();
    if (waiting.length) requestAnimationFrame(step);
    else pumping = false;
  };
  requestAnimationFrame(step);
}
function OptionThumb({ look, focus }: { look: AvatarLayers; focus: Focus }) {
  const C = useChars();
  const key = `${focus}|${JSON.stringify(look)}`;
  const [src, setSrc] = useState(thumbs.get(key) ?? null);
  useEffect(() => {
    if (!C || thumbs.has(key)) return setSrc(thumbs.get(key) ?? null);
    let live = true;
    waiting.push(() => {
      if (!thumbs.has(key)) thumbs.set(key, C.isoPeople().canDraw() ? C.isoPeople().thumb(look, focus, 96) : null);
      if (live) setSrc(thumbs.get(key) ?? null);
    });
    pump();
    return () => {
      live = false;
    };
  }, [C, key, look, focus]);
  if (!src) return <span className="block h-16" />;
  // biome-ignore lint/performance/noImgElement: a rendered data URL, nothing for next/image to optimise
  return <img src={src} alt="" width={64} height={64} className="block mx-auto" />;
}

// The avatar editor: turntable preview + every option. Used by the /avatar page
// (side by side) and in the world (stacked, inside a panel).
export function AvatarEditor({
  initial,
  onSave,
  stacked = false,
}: {
  initial: AvatarLayers;
  onSave: (a: AvatarLayers) => Promise<void>;
  stacked?: boolean;
}) {
  const t = useTr();
  const pt = useLang() === "pt";
  const [tab, setTab] = useState<Tab>("body");
  const [a, setA] = useState<AvatarLayers>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [walk, setWalk] = useState(false);
  useEffect(() => setA(initial), [initial]);

  const set = (patch: Partial<AvatarLayers>) => {
    setA((x) => ({ ...x, ...patch }));
    setState("idle");
  };

  async function save() {
    setState("saving");
    try {
      await onSave(a);
      setState("saved");
    } catch {
      setState("failed"); // never fail silently: say so, keep the edits
    }
  }

  const preview = (
    <div className={stacked ? "flex gap-3 items-stretch" : "cabinet p-4 h-max md:sticky md:top-6"}>
      <div
        className="flex justify-center shrink-0 rounded"
        style={{
          background: "radial-gradient(70% 60% at 50% 70%, var(--tile-hi), var(--pit-2) 75%)",
          border: "1px solid var(--well-edge)",
        }}
      >
        <AvatarCanvas avatar={a} size={stacked ? 150 : 300} walk={walk} />
      </div>
      <div className={stacked ? "flex flex-col gap-2 flex-1 justify-end" : ""}>
        <div className={stacked ? "flex flex-col gap-2" : "flex gap-2 mt-3"}>
          <button
            type="button"
            className={`deck-btn ${stacked ? "" : "flex-1"}`}
            aria-pressed={walk}
            onClick={() => setWalk((w) => !w)}
          >
            <span className="led" />▶ Walk
          </button>
          <button
            type="button"
            className={`deck-btn ${stacked ? "" : "flex-1"}`}
            onClick={() => set(avatarFromSeed(Math.floor(Math.random() * 1e6)))}
          >
            ⟳ {t("randomize")}
          </button>
        </div>
        <button
          type="button"
          className={`deck-btn lit w-full ${stacked ? "" : "mt-3"}`}
          onClick={save}
          disabled={state === "saving"}
        >
          {state === "saved" ? `✓ ${t("saved")}` : t("save")}
        </button>
        {state === "failed" && (
          <p role="alert" className="mono text-xs mt-2" style={{ color: "var(--alert)" }}>
            {t("lookNotSaved")}
          </p>
        )}
      </div>
    </div>
  );

  const options = (
    <div className={stacked ? "mt-4" : "cabinet px-6 py-5"}>
      {!stacked && (
        <>
          <h1 className="title text-[26px]">{t("myLook")}</h1>
          <div className="zigzag w-[150px] mt-3" aria-hidden />
        </>
      )}
      <div className="flex gap-1 mt-3 mb-4" role="tablist" style={{ borderBottom: "1px solid var(--edge)" }}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className="relative px-3.5 pt-2 pb-2.5 text-sm font-medium"
            style={{ color: tab === x.id ? "var(--amber)" : "var(--cream-dim)" }}
            onClick={() => setTab(x.id)}
          >
            {x.name[pt ? 1 : 0]}
            {tab === x.id && (
              <span
                className="absolute left-2.5 right-2.5 -bottom-px h-0.5"
                style={{ background: "var(--amber)", boxShadow: "0 0 8px var(--lamp-glow)" }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="space-y-5" role="tabpanel">
        {ROWS.filter((row) => row.tab === tab && (!row.when || row.when(a))).map((row) => {
          const field = (row.field ?? row.shape) as keyof AvatarLayers;
          const title = row.name ? row.name[pt ? 1 : 0] : t(row.label as Key);
          return (
            <fieldset key={`${row.field ?? row.shape ?? row.color}`}>
              <legend
                className="mono text-[11.5px] uppercase tracking-[.06em] mb-2.5"
                style={{ color: "var(--amber)" }}
              >
                {title}
              </legend>
              <div className="flex flex-wrap gap-2">
                {row.shape &&
                  AVATAR_OPTIONS[row.shape].map((opt) => {
                    const on = a[field] === opt;
                    const named =
                      row.shape === "gender" || row.shape === "gait"
                        ? t(`${row.shape}_${opt}` as Key)
                        : (NAMES[opt]?.[pt ? 1 : 0] ?? opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          set({ [field]: opt });
                          // (a walk chosen: the preview walks it)
                          if (row.shape === "gait") setWalk(true);
                        }}
                        className="deck-btn"
                        style={
                          row.focus
                            ? {
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                width: 84,
                                height: "auto",
                                padding: "4px 2px 6px",
                                fontSize: 11,
                                overflow: "hidden",
                              }
                            : { height: 34, fontSize: 12.5 }
                        }
                      >
                        {row.focus && <OptionThumb look={{ ...a, [field]: opt }} focus={row.focus} />}
                        <span className="block leading-tight">{named}</span>
                      </button>
                    );
                  })}
                {row.color && (
                  <>
                    {row.palette?.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        aria-pressed={a[row.color as keyof AvatarLayers] === c}
                        onClick={() => set({ [row.color as string]: c })}
                        className="h-9 w-9 rounded-full border-2 transition"
                        style={{
                          background: c,
                          borderColor: a[row.color as keyof AvatarLayers] === c ? "var(--amber)" : "var(--edge)",
                          boxShadow:
                            a[row.color as keyof AvatarLayers] === c
                              ? "0 0 0 3px color-mix(in srgb, var(--amber) 33%, transparent)"
                              : "none",
                        }}
                      />
                    ))}
                    {/* (any colour at all: docs/plan/60) */}
                    <label
                      className="h-9 w-9 rounded-full border-2 relative overflow-hidden cursor-pointer"
                      title={pt ? "Outra cor" : "Any colour"}
                      style={{
                        borderColor: row.palette?.includes(String(a[row.color])) ? "var(--edge)" : "var(--amber)",
                        background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                      }}
                    >
                      <input
                        type="color"
                        aria-label={pt ? "Outra cor" : "Any colour"}
                        value={String(a[row.color])}
                        onChange={(e) => set({ [row.color as string]: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                  </>
                )}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );

  if (stacked)
    return (
      <div>
        {preview}
        {options}
      </div>
    );
  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      {preview}
      {options}
    </div>
  );
}
