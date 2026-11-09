import { P } from "./palette";

// Plan 73 phase 6 — what each of the kit's parts is made of in the life look, from its paint: every
// palette finish is a material from the library (look/life-matlib-list.ts — woods, weaves, leather,
// metals), or a plain finish of its own sheen (plastic, ceramic, rubber, paper, a leaf), no texture.
// A part's colour that's a palette finish made lighter or darker (`shade`, a piping, an underside) is
// that finish's; the look's own picked colour (a sofa's fabric) is cloth. Families refine a part the
// paint guessed wrong with the kit's `mat` (PartOpts). No imports from the library here: this sits on
// the page with the kit; the world maps the names to materials (tp/build.ts).

/** The library's ids the kit uses, and its plain finishes. */
export const KIT_MATS = [
  "plain",
  "gloss",
  "matte",
  "oak",
  "walnut",
  "cherry",
  "pine",
  "birch",
  "ash",
  "linen",
  "twill",
  "velvet",
  "boucle",
  "tweed",
  "herringbone",
  "leather",
  "metal-brushed",
  "metal-cast",
  "metal-polished",
  "bark",
  "carpet",
] as const;
export type KitMat = (typeof KIT_MATS)[number];
/** The plain finishes' roughness (no texture: the colour, a sheen). */
export const PLAIN_ROUGH: Record<string, number> = { plain: 0.55, gloss: 0.22, matte: 0.92 };
/** The self-coloured (woods): their texture carries the colour; a part's paint only lightens or darkens it. */
export const SELF_COLOURED = new Set<KitMat>(["oak", "walnut", "cherry", "pine", "birch", "ash", "bark"]);

const BY_NAME: Partial<Record<keyof typeof P, KitMat>> = {
  walnut: "walnut",
  walnutDark: "walnut",
  walnutEdge: "walnut",
  walnutTop: "walnut",
  oak: "oak",
  oakLight: "oak",
  teak: "cherry",
  steel: "metal-cast",
  chrome: "metal-polished",
  brass: "metal-polished",
  alum: "metal-brushed",
  alumDark: "metal-brushed",
  steelLight: "metal-brushed",
  plastic: "gloss",
  vinyl: "gloss",
  glass: "gloss",
  rubber: "matte",
  fabric: "twill",
  fabricDark: "twill",
  mesh: "twill",
  moss: "linen",
  mossDark: "linen",
  mustard: "linen",
  olive: "linen",
  rust: "velvet",
  linen: "linen",
  wool: "boucle",
  lace: "linen",
  oxblood: "leather",
  cognac: "leather",
  ceramic: "gloss",
  ceramicBand: "gloss",
  terracotta: "matte",
  soil: "matte",
  pebble: "matte",
  paper: "matte",
  paperWhite: "matte",
  ink: "matte",
  leaf: "plain",
  leafYoung: "plain",
  stem: "plain",
  cream: "plain",
  creamDark: "plain",
  putty: "plain",
  puttyDark: "plain",
  white: "plain",
  stone: "matte",
  ash: "plain",
  graphite: "plain",
  lockerGreen: "plain",
};

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
// the finishes to match against, each with its colour (the palette's, once)
const REFS: { mat: KitMat; c: [number, number, number] }[] = (Object.keys(BY_NAME) as (keyof typeof P)[]).map((k) => ({
  mat: BY_NAME[k] as KitMat,
  c: rgb(P[k]),
}));

/** A finish to match a paint against: its colour, its material, and (a wood stained darker than its
 *  texture: black ash) the tone it's drawn in whatever the paint's scale. */
export interface FinishRef {
  mat: KitMat;
  c: [number, number, number];
  tone?: number;
}
/** A colour, what it's made of, and its tone (a stain) — a family's or a model's own. */
export type Finish = [number, KitMat] | [number, KitMat, number];
export const refsOf = (list: Finish[]): FinishRef[] =>
  list.map(([c, mat, tone]) => ({ mat, c: rgb(c), ...(tone !== undefined ? { tone } : {}) }));
// (a family's own finishes — its file's named colours — registered as it loads: `finishes`)
const EXTRA: FinishRef[] = [];
/** A family's own colours and what each is made of (refining what the paint guesses: its file's `C`). */
export function finishes(list: Finish[]): void {
  EXTRA.push(...refsOf(list));
}
// (each wood's texture's mean colour, near enough: a wood part is drawn as light as its paint)
const WOOD_MEAN: Partial<Record<KitMat, number>> = {
  oak: 0xb98a5a,
  walnut: 0x6b4128,
  cherry: 0x8a5a36,
  pine: 0xd8b98a,
  birch: 0xd9b98a,
  ash: 0xbdb8ae,
};
const lum = (c: number) => {
  const [r, g, b] = rgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** How light a self-coloured material (a wood) is drawn for a paint: its luminance over the texture's. */
export function woodTone(mat: KitMat, paint: number): number {
  const m = WOOD_MEAN[mat];
  return m ? Math.max(0.3, Math.min(1.5, lum(paint) / lum(m))) : 1;
}

/** What a cushion is made of when its paint is no finish of cloth or leather (the kit's `cushion`). */
export const CLOTHS = new Set<KitMat>(["linen", "twill", "velvet", "boucle", "tweed", "herringbone", "leather"]);

/** A part's material by its paint, and how much lighter or darker than the finish it's painted (its
 *  colour's scale: 1 the finish itself) — a palette finish or a `shade` of one; `fabric` the look's own
 *  picked colour (cloth, `cloth` the weave). None found: plain, as it is. */
export function matOfPaint(
  color: number,
  fabric: number | null = null,
  cloth: KitMat = "linen",
  local: FinishRef[] = [],
): { mat: KitMat; k: number; stain?: number } {
  const c = rgb(color);
  let best: { mat: KitMat; k: number; stain?: number } = { mat: "plain", k: 1 };
  let err = 6; // (sRGB steps: a shade rounds each channel)
  const test = (mat: KitMat, r: [number, number, number], tone?: number) => {
    const n = r[0] + r[1] + r[2];
    if (n < 6) return;
    // the scale that best takes the finish to this colour, and how far off it is then
    const k = (c[0] * r[0] + c[1] * r[1] + c[2] * r[2]) / (r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    if (k < 0.45 || k > 1.6) return;
    // (a metal is only its own colour, near enough: a white or a pale grey a little lighter than
    // aluminium is paint, glass or snow, not brushed metal)
    if (mat.startsWith("metal") && (k < 0.8 || k > 1.2)) return;
    const e = Math.max(Math.abs(c[0] - r[0] * k), Math.abs(c[1] - r[1] * k), Math.abs(c[2] - r[2] * k));
    // (the finish itself beats a shade of another that comes as close)
    const e2 = e + Math.abs(1 - k) * 2;
    if (e2 < err) {
      err = e2;
      best = tone !== undefined ? { mat, k, stain: tone } : { mat, k };
    }
  };
  // (a model's own first, then the look's picked colour, a family's, the palette's)
  for (const r of local) test(r.mat, r.c, r.tone);
  if (fabric !== null && err > 0) test(cloth, rgb(fabric));
  for (const r of EXTRA) test(r.mat, r.c, r.tone);
  for (const r of REFS) test(r.mat, r.c);
  return best;
}
