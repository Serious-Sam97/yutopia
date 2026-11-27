// Modular avatar: shape choices + colors. Stored in Laravel (yutopia_avatars) and
// drawn procedurally by the client, so new options are code, not art files.

export const AVATAR_OPTIONS = {
  // how the person is drawn: Ligne claire (one even line, flat colour) — the
  // only style since City-pop was retired (docs/plan/22-people-3d.md, P0)
  style: ["ligne"],
  // shapes the body and face only (shoulders, waist, jaw, lashes); neutral = the original figure
  gender: ["neutral", "feminine", "masculine"],
  body: ["regular", "broad", "slim"],
  hair: [
    "short",
    "long",
    "curly",
    "bun",
    "afro",
    "bob",
    "mohawk",
    "bald",
    "ponytail",
    "buzz",
    "crew",
    "slick",
    "spiky",
    // (the wardrobe's second set: docs/plan/60)
    "braids",
    "pixie",
    "wavy",
    "curtain",
    "locs",
    "topknot",
    "undercut",
    "fade",
    "pigtails",
    "highpony",
    "cornrows",
    "swept",
  ],
  // facial hair (in the hair's colour): a shadow of stubble, a moustache, a goatee, a full beard
  beard: ["none", "stubble", "mustache", "goatee", "full", "chinstrap", "muttonchops", "boxed"],
  top: [
    "tee",
    "hoodie",
    "shirt",
    "jacket",
    "sweater",
    "dress",
    "polo",
    "turtleneck",
    "blazer",
    "cardigan",
    "tank",
    "longtee",
    "henley",
    "sweatshirt",
    "flannel",
    "crop",
    "fleece",
    "puffer",
    "shirttie",
  ],
  // a layer over the top (docs/plan/60)
  outer: ["none", "parka", "coat", "puffer", "denim", "raincoat", "vest", "sportcoat"],
  bottom: [
    "jeans",
    "trousers",
    "shorts",
    "skirt",
    "cargo",
    "longskirt",
    "joggers",
    "chinos",
    "wide",
    "leggings",
    "overalls",
    "pleated",
    "snowpants",
    "suit",
  ],
  // a garment's pattern, over its colour in its second one ("trim": the second colour on its trims)
  pattern: ["none", "plaid", "stripes", "check", "dots", "tweed", "trim"],
  // on the head
  accessory: [
    "none",
    "headphones",
    "cap",
    "beanie",
    "beret",
    "bucket",
    "bandana",
    "headband",
    "earmuffs",
    "pompom",
    "trapper",
    "flatcap",
    "visor",
    "hairclip",
  ],
  eyewear: ["none", "glasses", "round", "sunglasses", "aviators", "cateye", "halfrim", "goggles"],
  // one more thing: round the neck, on the ears, the wrist, the back…
  extra: [
    "none",
    "walkman",
    "scarf",
    "earrings",
    "necklace",
    "backpack",
    "watch",
    "crossbody",
    "mittens",
    "bracelets",
    "tie",
    "lanyard",
    "tote",
    "fannypack",
    "satchel",
  ],
  shoes: [
    "sneakers",
    "hightops",
    "boots",
    "loafers",
    "sandals",
    "snowboots",
    "runners",
    "chelsea",
    "flats",
    "slipons",
    "laceboots",
  ],
  // how you walk (docs/plan/58-the-animation.md, decision 6): yours to choose; the folk have their
  // own too (brisk, tired, old — not offered here)
  gait: ["calm", "bouncy", "heavy"],
  // which foot goes forward on a board (docs/plan/103-the-skate.md F12a): the left (regular) or the right (goofy)
  stance: ["regular", "goofy"],
} as const;

export const SKIN_TONES = ["#f3d2b3", "#e4b48e", "#c68a5e", "#a8693f", "#7c4a2b", "#4f2e1c"];
export const HAIR_COLORS = ["#1c1410", "#3b2a20", "#6b4128", "#a8692f", "#d9b26a", "#e8e0d0", "#b5562f", "#6e7b3a"];
// Yondra's palette first: rust, olive, amber, cream, walnut, slate…
export const CLOTH_COLORS = [
  "#b5562f",
  "#6e7b3a",
  "#e8a33d",
  "#efe4cc",
  "#5b3a26",
  "#3d4a5c",
  "#2a2420",
  "#8a3b2e",
  "#c9b28a",
  "#4f6b5a",
  "#7a5c8a",
  "#d97a4a",
];

export interface AvatarLayers {
  body: string;
  skin: string;
  hair: string;
  hairColor: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  accessory: string;
  accessoryColor: string;
  style: string;
  gender: string;
  eyewear: string;
  eyewearColor: string;
  extra: string;
  extraColor: string;
  shoes: string;
  shoesColor: string;
  beard: string;
  /** how they walk (plan 58, 4e): calm, bouncy, heavy; the folk's brisk, tired, old */
  gait: string;
  /** on a board, the foot forward (plan 103): regular (the left) or goofy */
  stance: string;
  /** a layer over the top, its colour (docs/plan/60) */
  outer: string;
  outerColor: string;
  /** each garment's pattern (AVATAR_OPTIONS.pattern) and its second colour; the shoes' second (the sole) */
  topPattern: string;
  topColor2: string;
  bottomPattern: string;
  bottomColor2: string;
  outerPattern: string;
  outerColor2: string;
  shoesColor2: string;
  /** (plan 131) the face and age on the new body: "" — from their name's seed; else 24 whole numbers −9…9,
   *  ×0.15 each — the 22 face axes (life-people.ts FACE_AXES' order), then age (0…9 ÷ 9) and firmness */
  face: string;
}

// (the wardrobe's second set's slots, as no one had chosen them: docs/plan/60)
const WARDROBE_DEFAULTS = {
  outer: "none",
  outerColor: "#4f6b5a",
  topPattern: "none",
  topColor2: "#2a2420",
  bottomPattern: "none",
  bottomColor2: "#2a2420",
  outerPattern: "none",
  outerColor2: "#2a2420",
  shoesColor2: "#f4efe6",
  // (plan 131: from their name's seed)
  face: "",
};

export const DEFAULT_AVATAR: AvatarLayers = {
  body: "regular",
  skin: "#c68a5e",
  hair: "short",
  hairColor: "#3b2a20",
  top: "tee",
  topColor: "#b5562f",
  bottom: "jeans",
  bottomColor: "#3d4a5c",
  accessory: "none",
  accessoryColor: "#e8a33d",
  style: "ligne",
  gender: "neutral",
  eyewear: "none",
  eyewearColor: "#2a2420",
  extra: "none",
  extraColor: "#e8a33d",
  shoes: "sneakers",
  shoesColor: "#efe4cc",
  beard: "none",
  gait: "calm",
  stance: "regular",
  ...WARDROBE_DEFAULTS,
};

/** (plan 131) a face's code: "" or 24 whole numbers −9…9, comma-separated (the API checks the same) */
export const FACE_RE = /^$|^-?[0-9](,-?[0-9]){23}$/;

export function parseAvatar(raw: unknown): AvatarLayers {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = {};
    }
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_AVATAR };
  // same rules as Yondra's validation: colours are #rrggbb, options are plain slugs
  // (these values end up inside the SVG the client draws)
  for (const k of Object.keys(DEFAULT_AVATAR) as (keyof AvatarLayers)[]) {
    const v = o[k];
    if (typeof v !== "string") continue;
    if (k === "face") {
      if (FACE_RE.test(v)) out.face = v;
      continue;
    }
    const color = k === "skin" || k.includes("Color");
    if (color ? /^#[0-9a-f]{6}$/i.test(v) : /^[a-z0-9_-]{1,24}$/i.test(v)) out[k] = v;
  }
  // one style for everyone: a City-pop look (an old token, an old tab) is Ligne claire
  out.style = "ligne";
  // looks saved before glasses and the walkman had slots of their own
  // (Yondra fills missing slots with their defaults, so an empty slot is "none")
  if (out.accessory === "glasses") {
    if (out.eyewear === "none") {
      out.eyewear = "glasses";
      out.eyewearColor = out.accessoryColor;
    }
    out.accessory = "none";
  } else if (out.accessory === "walkman") {
    if (out.extra === "none") {
      out.extra = "walkman";
      out.extraColor = out.accessoryColor;
    }
    out.accessory = "none";
  }
  return out;
}

// Deterministic "random" avatar for bots and Vortex-touched guests.
// the hair styles there were when bots got their looks (newer ones aren't drawn
// for them, so each bot keeps its hair)
const SEED_HAIR = ["short", "long", "curly", "bun", "afro", "bob", "mohawk", "bald", "ponytail", "buzz"] as const;
// (and every other slot's options as they were then: a new option would shift each bot's pick)
const SEED = {
  top: ["tee", "hoodie", "shirt", "jacket", "sweater", "dress", "polo", "turtleneck", "blazer", "cardigan", "tank"],
  bottom: ["jeans", "trousers", "shorts", "skirt", "cargo", "longskirt", "joggers"],
  accessory: ["none", "headphones", "cap", "beanie", "beret", "bucket", "bandana", "headband"],
  eyewear: ["none", "glasses", "round", "sunglasses"],
  extra: ["none", "walkman", "scarf", "earrings", "necklace", "backpack", "watch"],
  shoes: ["sneakers", "hightops", "boots", "loafers", "sandals"],
} as const;

export function avatarFromSeed(seed: number): AvatarLayers {
  let s = seed * 9301 + 49297;
  const pick = <T>(arr: readonly T[]): T => {
    s = (s * 9301 + 49297) % 233280;
    return arr[Math.floor((s / 233280) * arr.length)];
  };
  const a: AvatarLayers = {
    body: pick(AVATAR_OPTIONS.body),
    skin: pick(SKIN_TONES),
    hair: pick(SEED_HAIR),
    hairColor: pick(HAIR_COLORS),
    top: pick(SEED.top),
    topColor: pick(CLOTH_COLORS),
    bottom: pick(SEED.bottom),
    bottomColor: pick(CLOTH_COLORS),
    accessory: pick(SEED.accessory),
    accessoryColor: pick(CLOTH_COLORS),
    // (still one draw from the old two-style list, so every pick after it — and
    // so each bot's look — stays as it was)
    style: pick(["ligne", "ligne"]),
    gender: pick(AVATAR_OPTIONS.gender),
    // (picked after the rest: bots keep the looks they had)
    eyewear: pick(["none", "none", ...SEED.eyewear]),
    eyewearColor: pick(["#2a2420", "#5b3a26", "#b5562f", "#3d4a5c"]),
    extra: pick(["none", "none", ...SEED.extra]),
    extraColor: pick(CLOTH_COLORS),
    shoes: pick(SEED.shoes),
    shoesColor: pick(["#efe4cc", "#2a2420", "#5b3a26", "#b5562f", "#efe4cc"]),
    beard: "none",
    gait: "calm",
    stance: "regular",
    ...WARDROBE_DEFAULTS,
  };
  // (the last draw: everything above stays as it was) some masculine bots grow one
  const beard = pick(["none", "none", "stubble", "mustache", "goatee", "full"]);
  if (a.gender === "masculine") a.beard = beard;
  // (after that: their walks — most calm)
  a.gait = pick(["calm", "calm", "calm", "bouncy", "heavy", "brisk"]);
  // (after that, the wardrobe's second set — docs/plan/60: only a coat for the cold, over what each
  // bot already wears, so each keeps its look)
  a.outer = pick(["none", "none", "none", "parka", "coat", "puffer", "denim", "raincoat", "vest"]);
  a.outerColor = pick(CLOTH_COLORS);
  return a;
}

// ── plan 131: faces on the new body ───────────────────────────────────────────────────────────────

/** Plan 131 (F2): a face and an age from a seed — each face axis of the new body's file (`f…`, −1…1), its age
 *  (`old`, 0…1: most young, some middle-aged, a few old) and its build's firmness (`muscle`). The same seed gives
 *  the same person wherever they're drawn; a file without the shapes ignores them. */
export const FACE_AXES = [
  "fNoseW",
  "fNoseL",
  "fNoseHump",
  "fNoseTip",
  "fNostrils",
  "fJawW",
  "fChinOut",
  "fChinH",
  "fCheekBones",
  "fCheekFull",
  "fEyeSize",
  "fEyeTilt",
  "fEyeOpen",
  "fBrowH",
  "fBrowAngle",
  "fMouthW",
  "fLipUpper",
  "fLipLower",
  "fFaceFat",
  "fHeadLong",
  "fEarSize",
  "fEarOut",
] as const; // fmt: skip
export function faceGenes(seed: number): Record<string, number> {
  // (a small PRNG of its own: mulberry32)
  let a = (seed ^ 0x9e3779b9) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Record<string, number> = {};
  // (triangular, −1.3…1.3: most faces near the middle, some far off it)
  for (const k of FACE_AXES) out[k] = (rnd() + rnd() - 1) * 1.3;
  const r = rnd();
  out.old = r < 0.62 ? rnd() * 0.12 : r < 0.9 ? 0.3 + rnd() * 0.25 : 0.75 + rnd() * 0.25;
  out.muscle = (rnd() - 0.4) * 0.9;
  return out;
}

/** (plan 131) a face's code (AvatarLayers.face) ↔ its weights: 22 axes ×0.15, age ÷9, firmness ×0.1 */
export function faceOf(a: { face?: string } | null | undefined, seed: number): Record<string, number> {
  const code = a?.face ?? "";
  if (!code) return faceGenes(seed);
  const n = code.split(",").map(Number);
  if (n.length !== FACE_AXES.length + 2 || n.some((x) => !Number.isFinite(x))) return faceGenes(seed);
  const out: Record<string, number> = {};
  FACE_AXES.forEach((k, i) => {
    out[k] = n[i] * 0.15;
  });
  out.old = Math.max(0, n[FACE_AXES.length]) / 9;
  out.muscle = n[FACE_AXES.length + 1] * 0.1;
  return out;
}
export function faceCode(g: Record<string, number>): string {
  const q = (v: number, k: number, lo = -9) => Math.max(lo, Math.min(9, Math.round(v / k)));
  return [...FACE_AXES.map((k) => q(g[k] ?? 0, 0.15)), q((g.old ?? 0) * 9, 1, 0), q(g.muscle ?? 0, 0.1)].join(",");
}

/** (plan 131 F2) premade faces to start from — the editor's (phase 6): face axes and an age; a seed fills the rest */
export const PREMADE_FACES: Record<string, Partial<Record<(typeof FACE_AXES)[number] | "old" | "muscle", number>>> = {
  classic: { fJawW: 0.4, fChinOut: 0.3, fNoseW: -0.2, fCheekBones: 0.4, fBrowH: -0.2 },
  gentle: { fFaceFat: 0.4, fCheekFull: 0.5, fJawW: -0.4, fEyeSize: 0.4, fNoseTip: 0.4 },
  rugged: { fJawW: 0.8, fChinOut: 0.6, fNoseHump: 0.7, fBrowH: -0.5, fBrowAngle: -0.4, old: 0.35 },
  narrow: { fHeadLong: 0.8, fJawW: -0.6, fNoseL: 0.6, fNoseW: -0.5, fMouthW: -0.4 },
  round: { fHeadLong: -0.7, fFaceFat: 0.7, fCheekFull: 0.7, fNoseW: 0.5, fChinH: -0.4 },
  elder: { old: 0.9, fCheekFull: -0.4, fEyeOpen: -0.3, fNoseL: 0.3 },
};

/** A seed from a name (who a neutral avatar is drawn as, and — plan 131 — their face: the same wherever they're
 *  drawn; chars/life.ts re-exports it) */
export function nameSeed(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}
