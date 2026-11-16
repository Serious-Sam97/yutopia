import { CAR_COLOURS } from "../lot.ts";
import { type CarKind, type CarSpec, SPECS } from "./specs.ts";

// What a car looks like (docs/plan/92-the-cars.md, F10b and F13b): which of its body's variants it is
// (a model each, made in Blender: tools/art/cars → public/life/cars/<variant>.glb), its paint and second
// colour, the extras on it and its wheels. A car nobody chose for is seeded from its id — a variant its
// home suits, a colour, a few extras —; one bought may be chosen (`props.look`, checked by `validLook`).
//
// The table mirrors apps/client/public/life/cars/manifest.json: the bodies, their variants, which extras
// fit where. The geometry of each variant (its wheelbase, wheels, box and centre of gravity) is the
// model's, so the car on Jolt stands where its picture does (`variantSpec`).

/** The road bodies (each three variants) and the work vehicles (a model each, named for their kind). */
export type CarBody = "saloon" | "estate" | "hatch" | "4x4" | "pickup" | "van";

export interface CarLook {
  /** the model: a manifest key ("saloon-gl", "van-minibus"; a work vehicle's kind) */
  variant: string;
  /** the paint (0xrrggbb) */
  colour: number;
  /** the second colour, where the variant has a line for it */
  colour2?: number;
  /** the extras on it (EXTRAS' keys that fit its body) */
  extras: string[];
  /** its wheels (WHEELS) */
  wheels: string;
}

/** The extras a car may have (the police's light bar and the taxi's sign go with their role, not here). */
export const EXTRAS = ["roofrack", "skibox", "bullbar", "spots", "flaps", "chains"] as const;
export type Extra = (typeof EXTRAS)[number];
/** The wheels (each a model of its own, sized to the car's). */
export const WHEELS = ["steel", "cover", "lattice", "turbine", "sport", "winter", "offroad"] as const;
export type WheelStyle = (typeof WHEELS)[number];

/** A period palette: the lot's nine and a few of the 80s' own. */
export const PALETTE: number[] = [
  ...CAR_COLOURS,
  0x8e1c1c, // signal red
  0x22385e, // navy
  0x5d6b3a, // olive
  0xd8c27a, // sand
  0x3d5c63, // petrol
  0x7a2f4e, // burgundy
  0xc9ccc8, // silver
];

/** A variant's shape: where its wheels are (from its centre of gravity, as specs'), its box, its CoG. */
interface Geom {
  front: number;
  wheelbase: number;
  track: number;
  r: number;
  width: number;
  ahead: number;
  length: number;
  height: number;
  w: number;
  cog: number;
}
interface VariantDef {
  body: CarBody;
  kind: CarKind;
  /** its own wheels, as made */
  wheels: WheelStyle;
  /** a second colour's line (two-tone) */
  twoTone?: boolean;
  /** the extras that fit it */
  extras: Extra[];
  geom: Geom;
}

const SALOON: Geom = {
  front: 1.37,
  wheelbase: 2.85,
  track: 1.52,
  r: 0.317,
  width: 0.195,
  ahead: 2.32,
  length: 4.9,
  height: 1.53,
  w: 1.84,
  cog: 0.52,
};
const HATCH: Geom = {
  front: 0.96,
  wheelbase: 2.4,
  track: 1.4,
  r: 0.29,
  width: 0.175,
  ahead: 1.74,
  length: 3.95,
  height: 1.39,
  w: 1.66,
  cog: 0.5,
};
const RIDGE: Geom = {
  front: 1.15,
  wheelbase: 2.2,
  track: 1.42,
  r: 0.36,
  width: 0.205,
  ahead: 1.9,
  length: 3.8,
  height: 1.73,
  w: 1.7,
  cog: 0.62,
};
const RIDGE5: Geom = { ...RIDGE, front: 1.4, wheelbase: 2.75, ahead: 2.15, length: 4.45 };
const HAUL: Geom = {
  front: 1.41,
  wheelbase: 3.15,
  track: 1.54,
  r: 0.34,
  width: 0.215,
  ahead: 2.36,
  length: 5.2,
  height: 1.62,
  w: 1.88,
  cog: 0.6,
};
const DROVER: Geom = {
  front: 1.28,
  wheelbase: 2.88,
  track: 1.56,
  r: 0.31,
  width: 0.185,
  ahead: 2.0,
  length: 4.6,
  height: 1.98,
  w: 1.86,
  cog: 0.75,
};
const ROOF: Extra[] = ["roofrack", "skibox", "flaps", "chains"];

export const VARIANTS: Record<string, VariantDef> = {
  "saloon-base": { body: "saloon", kind: "sedan", wheels: "cover", extras: ROOF, geom: SALOON },
  "saloon-gl": { body: "saloon", kind: "sedan", wheels: "lattice", twoTone: true, extras: ROOF, geom: SALOON },
  "saloon-sport": { body: "saloon", kind: "sedan", wheels: "sport", extras: [...ROOF, "spots"], geom: SALOON },
  "estate-base": { body: "estate", kind: "estate", wheels: "steel", extras: ROOF, geom: SALOON },
  "estate-gl": { body: "estate", kind: "estate", wheels: "turbine", twoTone: true, extras: ROOF, geom: SALOON },
  "estate-utility": {
    body: "estate",
    kind: "estate",
    wheels: "steel",
    extras: ["roofrack", "flaps", "chains"],
    geom: SALOON,
  },
  "hatch-base": { body: "hatch", kind: "hatch", wheels: "cover", extras: ROOF, geom: HATCH },
  "hatch-gl": { body: "hatch", kind: "hatch", wheels: "lattice", twoTone: true, extras: ROOF, geom: HATCH },
  "hatch-hot": {
    body: "hatch",
    kind: "hatch",
    wheels: "sport",
    extras: [...ROOF, "spots"],
    geom: { ...HATCH, track: 1.44, width: 0.195 },
  },
  "4x4-short": { body: "4x4", kind: "offroad", wheels: "offroad", extras: [...ROOF, "bullbar", "spots"], geom: RIDGE },
  "4x4-long": {
    body: "4x4",
    kind: "offroad",
    wheels: "steel",
    twoTone: true,
    extras: [...ROOF, "bullbar", "spots"],
    geom: RIDGE5,
  },
  "4x4-expedition": {
    body: "4x4",
    kind: "offroad",
    wheels: "offroad",
    extras: ["roofrack", "bullbar", "spots", "flaps", "chains"],
    geom: { ...RIDGE5, r: 0.39, width: 0.235, height: 1.79 },
  },
  "pickup-single": {
    body: "pickup",
    kind: "pickup",
    wheels: "steel",
    extras: ["bullbar", "spots", "flaps", "chains"],
    geom: HAUL,
  },
  "pickup-crew": {
    body: "pickup",
    kind: "pickup",
    wheels: "turbine",
    twoTone: true,
    extras: ["bullbar", "spots", "flaps", "chains"],
    geom: { ...HAUL, front: 1.55, wheelbase: 3.35, ahead: 2.5, length: 5.5 },
  },
  "pickup-flatbed": {
    body: "pickup",
    kind: "pickup",
    wheels: "steel",
    extras: ["bullbar", "spots", "flaps", "chains"],
    geom: HAUL,
  },
  "van-panel": {
    body: "van",
    kind: "van",
    wheels: "steel",
    extras: ["roofrack", "bullbar", "flaps", "chains"],
    geom: DROVER,
  },
  "van-minibus": {
    body: "van",
    kind: "van",
    wheels: "cover",
    twoTone: true,
    extras: ["roofrack", "flaps", "chains"],
    geom: DROVER,
  },
  "van-camper": {
    body: "van",
    kind: "van",
    wheels: "turbine",
    twoTone: true,
    extras: ["flaps", "chains"],
    geom: DROVER,
  },
};

/** The work vehicles: one model each, named for their kind. */
const OWN_MODEL = new Set<CarKind>(["snowmobile", "snowcat", "ploughtruck", "tractor", "toboggan"]);

/** The variants a kind may be (a saloon's chassis takes the estate's body too: the town's wagons). */
export function variantsOf(kind: CarKind): string[] {
  if (OWN_MODEL.has(kind)) return [kind];
  return Object.keys(VARIANTS).filter(
    (v) => VARIANTS[v].kind === kind || (kind === "sedan" && VARIANTS[v].kind === "estate"),
  );
}
/** The body a variant is (a work vehicle: none). */
export const bodyOf = (variant: string): CarBody | null => VARIANTS[variant]?.body ?? null;
/** Whether a variant has a second colour's line. */
export const twoToneOf = (variant: string): boolean => VARIANTS[variant]?.twoTone === true;
/** The extras that fit a variant. */
export const extrasOf = (variant: string): Extra[] => VARIANTS[variant]?.extras ?? [];
/** The wheels a variant may have (the off-road ones on what stands high enough for them). */
export function wheelsOf(variant: string): WheelStyle[] {
  const v = VARIANTS[variant];
  if (!v) return [];
  const high = v.body === "4x4" || v.body === "pickup";
  return WHEELS.filter((w) => w !== "offroad" || high);
}

// ── seeded: a car nobody chose for ─────────────────────────────────────────────────────────────

function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a car object says about itself that its seeded look reads. */
export interface LookProps {
  model?: unknown;
  /** its colour (CAR_COLOURS' index: what the server sends as the vehicle's colour) */
  variant?: unknown;
  wagon?: unknown;
  role?: unknown;
  look?: unknown;
}

/** The look a car has when nobody chose one: by its id, the variant its home and role suit. */
export function seededLook(id: string, kind: CarKind, p: LookProps = {}): CarLook {
  const r = rngOf(hashOf(id));
  const role = typeof p.role === "string" ? p.role : "";
  const ci = Number.isInteger(p.variant) ? Number(p.variant) : -1;
  // (its colour: the one the server knows it by — the lot's nine —, so parked and driven agree)
  const colour = ci >= 0 ? CAR_COLOURS[ci % CAR_COLOURS.length] : PALETTE[Math.floor(r() * PALETTE.length)];
  if (OWN_MODEL.has(kind)) return { variant: kind, colour, extras: [], wheels: "steel" };
  let pool = variantsOf(kind);
  if (kind === "sedan") pool = pool.filter((v) => (p.wagon ? v.startsWith("estate") : v.startsWith("saloon")));
  let variant: string;
  if (role === "police") variant = "saloon-gl";
  else if (role === "taxi") variant = "saloon-base";
  else if (role === "rental") variant = "saloon-base";
  else if (id === "farm-pickup") variant = "pickup-flatbed";
  else if (id === "boathouse-4x4") variant = "4x4-expedition";
  else {
    // (the plainer ones commoner: base half the time, the rest split)
    const x = r();
    variant = pool[x < 0.5 ? 0 : x < 0.8 ? 1 : 2] ?? pool[0];
  }
  const def = VARIANTS[variant];
  const fits = def?.extras ?? [];
  const extras: string[] = [];
  if (!role || role === "rental") {
    // a few, now and then: the snow's chains, mud flaps, a rack or a box on the roof
    for (const e of fits) {
      const k = e === "flaps" ? 0.35 : e === "chains" ? 0.08 : e === "bullbar" ? 0.3 : e === "spots" ? 0.25 : 0.15;
      if (r() < k) extras.push(e);
    }
    if (extras.includes("roofrack") && extras.includes("skibox")) extras.splice(extras.indexOf("roofrack"), 1);
  }
  const wheels =
    r() < 0.75 ? (def?.wheels ?? "steel") : (wheelsOf(variant)[Math.floor(r() * wheelsOf(variant).length)] ?? "steel");
  const look: CarLook = { variant, colour, extras, wheels };
  // (a second colour on some of those that have the line for it)
  if (def?.twoTone && r() < 0.45) look.colour2 = PALETTE[Math.floor(r() * PALETTE.length)];
  // the police's black and white, the taxi's yellow (their roof parts: the client, by the role)
  if (role === "police") Object.assign(look, { colour: 0x16181b, colour2: 0xf2f2ee, extras: [], wheels: "steel" });
  if (role === "taxi") {
    Object.assign(look, { colour: 0xe2b42a, extras: [], wheels: "steel" });
    delete look.colour2;
  }
  return look;
}

/** A look chosen for a car of `kind`, checked: every value one its body has; null if it isn't one. */
export function validLook(kind: CarKind, x: unknown): CarLook | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const variant = typeof o.variant === "string" ? o.variant : "";
  if (!variantsOf(kind).includes(variant)) return null;
  const colour = Number(o.colour);
  if (!Number.isInteger(colour) || colour < 0 || colour > 0xffffff) return null;
  const look: CarLook = { variant, colour, extras: [], wheels: "steel" };
  if (OWN_MODEL.has(kind)) return look;
  if (o.colour2 !== undefined && o.colour2 !== null) {
    const c2 = Number(o.colour2);
    if (!twoToneOf(variant) || !Number.isInteger(c2) || c2 < 0 || c2 > 0xffffff) return null;
    look.colour2 = c2;
  }
  const fits = extrasOf(variant) as string[];
  const ex = Array.isArray(o.extras) ? o.extras : [];
  if (ex.length > fits.length || ex.some((e) => typeof e !== "string" || !fits.includes(e))) return null;
  look.extras = [...new Set(ex as string[])];
  const w = typeof o.wheels === "string" ? o.wheels : "";
  if (!(wheelsOf(variant) as string[]).includes(w)) return null;
  look.wheels = w;
  return look;
}

// ── chosen: the buy panel and "Repaint" (docs/plan/92-the-cars.md F13b) ───────────────────────────

/** The variants offered for a kind at MOTORS: its own body's three (a saloon's estate is the estate's);
 *  a work vehicle its one model. */
export function bodyVariants(kind: CarKind): string[] {
  if (OWN_MODEL.has(kind)) return [kind];
  return Object.keys(VARIANTS).filter((v) => VARIANTS[v].kind === kind);
}

/** A look someone chose for a car of `kind` (buying it, or repainting it): `validLook`, and only what the
 *  panel offers — a variant of its own body, colours from the period palette. Null if it isn't one. */
export function buyLook(kind: CarKind, x: unknown): CarLook | null {
  const look = validLook(kind, x);
  if (!look || !bodyVariants(kind).includes(look.variant)) return null;
  if (!PALETTE.includes(look.colour)) return null;
  if (look.colour2 !== undefined && !PALETTE.includes(look.colour2)) return null;
  return look;
}

/** The lot's colour (CAR_COLOURS' index: the vehicle's `colour` on the wire, the thumbnails') nearest a
 *  paint. */
export function nearestColour(c: number): number {
  let best = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (const [i, k] of CAR_COLOURS.entries()) {
    const d =
      (((k >> 16) & 255) - ((c >> 16) & 255)) ** 2 +
      (((k >> 8) & 255) - ((c >> 8) & 255)) ** 2 +
      ((k & 255) - (c & 255)) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** A look to start the panel from: the one a car has (if it's this kind's), else the kind's base. */
export function startLook(kind: CarKind, from?: CarLook | null): CarLook {
  const ok = from ? buyLook(kind, from) : null;
  if (ok) return ok;
  const variant = bodyVariants(kind)[0];
  const def = VARIANTS[variant];
  return { variant, colour: PALETTE[1], extras: [], wheels: def?.wheels ?? "steel" };
}

/** A look carried over to another variant: what still fits it kept (the colours, the extras that fit,
 *  the wheels if it may have them, else its own). */
export function lookTo(look: CarLook, variant: string): CarLook {
  const def = VARIANTS[variant];
  const fits = extrasOf(variant) as string[];
  const next: CarLook = {
    variant,
    colour: look.colour,
    extras: look.extras.filter((e) => fits.includes(e)),
    wheels: (wheelsOf(variant) as string[]).includes(look.wheels) ? look.wheels : (def?.wheels ?? "steel"),
  };
  if (look.colour2 !== undefined && twoToneOf(variant)) next.colour2 = look.colour2;
  return next;
}

/** A car object's look: the one chosen for it (`props.look`, checked) or its seeded one. */
export function lookFor(id: string, kind: CarKind, props: LookProps = {}): CarLook {
  const chosen = validLook(kind, props.look);
  // (the police's and the taxi's livery whatever was chosen)
  if (chosen && props.role !== "police" && props.role !== "taxi") return chosen;
  return seededLook(id, kind, props);
}

// ── the variant's numbers ───────────────────────────────────────────────────────────────────────

const specs = new Map<string, CarSpec>();
/** A kind's spec with its variant's shape: its wheels where the model has them, its box, its CoG. */
export function variantSpec(kind: CarKind, variant?: string): CarSpec {
  const base = SPECS[kind];
  const v = variant ? VARIANTS[variant] : undefined;
  if (!v) return base;
  const key = `${kind}|${variant}`;
  const hit = specs.get(key);
  if (hit) return hit;
  const g = v.geom;
  const s: CarSpec = {
    ...base,
    cog: g.cog,
    wheelbase: g.wheelbase,
    front: g.front,
    track: g.track,
    wheel: { ...base.wheel, r: g.r, width: g.width },
    body: { ahead: g.ahead, behind: g.length - g.ahead, width: g.w, height: g.height },
  };
  specs.set(key, s);
  return s;
}
