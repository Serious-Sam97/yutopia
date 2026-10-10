// Modular avatar: shape choices + colors. Stored in Laravel (yutopia_avatars) and
// drawn procedurally by the client, so new options are code, not art files.

export const AVATAR_OPTIONS = {
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
  for (const k of Object.keys(DEFAULT_AVATAR) as (keyof AvatarLayers)[]) {
    if (typeof o[k] === "string" && (o[k] as string).length <= 24) out[k] = o[k] as string;
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
  };
}
