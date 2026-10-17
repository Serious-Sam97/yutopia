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
  ],
  // facial hair (in the hair's colour): a shadow of stubble, a moustache, a goatee, a full beard
  beard: ["none", "stubble", "mustache", "goatee", "full"],
  top: ["tee", "hoodie", "shirt", "jacket", "sweater", "dress", "polo", "turtleneck", "blazer", "cardigan", "tank"],
  bottom: ["jeans", "trousers", "shorts", "skirt", "cargo", "longskirt", "joggers"],
  // on the head
  accessory: ["none", "headphones", "cap", "beanie", "beret", "bucket", "bandana", "headband"],
  eyewear: ["none", "glasses", "round", "sunglasses"],
  // one more thing: round the neck, on the ears, the wrist, the back…
  extra: ["none", "walkman", "scarf", "earrings", "necklace", "backpack", "watch"],
  shoes: ["sneakers", "hightops", "boots", "loafers", "sandals"],
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
}

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
};

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
    const color = k === "skin" || k.endsWith("Color");
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
    top: pick(AVATAR_OPTIONS.top),
    topColor: pick(CLOTH_COLORS),
    bottom: pick(AVATAR_OPTIONS.bottom),
    bottomColor: pick(CLOTH_COLORS),
    accessory: pick(AVATAR_OPTIONS.accessory),
    accessoryColor: pick(CLOTH_COLORS),
    // (still one draw from the old two-style list, so every pick after it — and
    // so each bot's look — stays as it was)
    style: pick(["ligne", "ligne"]),
    gender: pick(AVATAR_OPTIONS.gender),
    // (picked after the rest: bots keep the looks they had)
    eyewear: pick(["none", "none", ...AVATAR_OPTIONS.eyewear]),
    eyewearColor: pick(["#2a2420", "#5b3a26", "#b5562f", "#3d4a5c"]),
    extra: pick(["none", "none", ...AVATAR_OPTIONS.extra]),
    extraColor: pick(CLOTH_COLORS),
    shoes: pick(AVATAR_OPTIONS.shoes),
    shoesColor: pick(["#efe4cc", "#2a2420", "#5b3a26", "#b5562f", "#efe4cc"]),
    beard: "none",
  };
  // (the last draw: everything above stays as it was) some masculine bots grow one
  const beard = pick(["none", "none", "stubble", "mustache", "goatee", "full"]);
  if (a.gender === "masculine") a.beard = beard;
  return a;
}
