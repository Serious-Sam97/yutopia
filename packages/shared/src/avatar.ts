// Modular avatar: shape choices + colors. Stored in Laravel (yutopia_avatars) and
// drawn procedurally by the client, so new options are code, not art files.

export const AVATAR_OPTIONS = {
  // how the person is drawn: City-pop 80s anime or Ligne claire (clean line, flat colour)
  style: ["citypop", "ligne"],
  // shapes the body and face only (shoulders, waist, jaw, lashes); neutral = the original figure
  gender: ["neutral", "feminine", "masculine"],
  body: ["regular", "broad", "slim"],
  hair: ["short", "long", "curly", "bun", "afro", "bob", "mohawk", "bald"],
  top: ["tee", "hoodie", "shirt", "jacket", "sweater", "dress"],
  bottom: ["jeans", "trousers", "shorts", "skirt"],
  accessory: ["none", "headphones", "glasses", "cap", "beanie", "walkman"],
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
  style: "citypop",
  gender: "neutral",
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
  return out;
}

// Deterministic "random" avatar for bots and Vortex-touched guests.
export function avatarFromSeed(seed: number): AvatarLayers {
  let s = seed * 9301 + 49297;
  const pick = <T>(arr: readonly T[]): T => {
    s = (s * 9301 + 49297) % 233280;
    return arr[Math.floor((s / 233280) * arr.length)];
  };
  return {
    body: pick(AVATAR_OPTIONS.body),
    skin: pick(SKIN_TONES),
    hair: pick(AVATAR_OPTIONS.hair),
    hairColor: pick(HAIR_COLORS),
    top: pick(AVATAR_OPTIONS.top),
    topColor: pick(CLOTH_COLORS),
    bottom: pick(AVATAR_OPTIONS.bottom),
    bottomColor: pick(CLOTH_COLORS),
    accessory: pick(AVATAR_OPTIONS.accessory),
    accessoryColor: pick(CLOTH_COLORS),
    style: pick(AVATAR_OPTIONS.style),
    gender: pick(AVATAR_OPTIONS.gender),
  };
}
