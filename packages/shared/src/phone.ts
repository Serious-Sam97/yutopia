// The phone (docs/plan/21-cellphone.md): what the world needs to agree on —
// what a phone is doing in someone's hand, the cases, the ringtones, the
// settings a person keeps, the limits. Pure, shared by the world-server and the
// phone's client chunk (subpath @yutopia/shared/phone, so the world page
// doesn't carry it).

// What the phone is doing, as everyone sees it on the body:
// ""      in the pocket
// text    out, held low in both hands, head down (using it)
// call    at the ear (on a voice call)
// video   held up in front, talking to it (a video call)
// photo   raised in front, aiming (the camera)
// selfie  arm out, the screen facing you
// ring    in the pocket and ringing (a call coming in): heard by people near
export const PHONE_STATES = ["", "text", "call", "video", "photo", "selfie", "ring"] as const;
export type PhoneState = (typeof PHONE_STATES)[number];
export function isPhoneState(s: unknown): s is PhoneState {
  return typeof s === "string" && (PHONE_STATES as readonly string[]).includes(s);
}

// Poses for a photo (the free hand), everyone sees them; the eight emotes are
// the world's own gestures.
export const PHOTO_POSES = ["", "peace", "point", "thumbs"] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

// The case: everyone sees its colour in your hand. [body, highlight, shadow]
export const CASES = {
  walnut: ["#5b3a26", "#7d5438", "#3a2416"],
  cream: ["#e6dabf", "#fbf4e3", "#b9ab8a"],
  rust: ["#b5562f", "#d4774c", "#7c3519"],
  olive: ["#6e7b3a", "#8f9c55", "#48521f"],
  graphite: ["#2b2a26", "#4a4740", "#151410"],
  brass: ["#c39a4a", "#e7c47a", "#8a6a27"],
  vortex: ["#5a1f8a", "#ff2d95", "#00b8a8"],
} as const;
export type PhoneCase = keyof typeof CASES;
export const CASE_IDS = Object.keys(CASES) as PhoneCase[];
export function isCase(s: unknown): s is PhoneCase {
  return typeof s === "string" && s in CASES;
}

// Ringtones and text tones: played by a synth (the client's phone/sounds.ts);
// the ringtone is what people near you hear when you're called.
export const RINGTONES = [
  "citypop",
  "vortex",
  "rewind",
  "hifi",
  "synthbass",
  "arcade",
  "bell",
  "rotary",
  "lofi",
  "silent",
] as const;
export type Ringtone = (typeof RINGTONES)[number];
export const TEXT_TONES = ["pop", "chime", "tape", "blip", "glass", "silent"] as const;
export type TextTone = (typeof TEXT_TONES)[number];
export function isRingtone(s: unknown): s is Ringtone {
  return typeof s === "string" && (RINGTONES as readonly string[]).includes(s);
}

// Designed wallpapers; a photo of yours is "photo:<id>".
export const WALLPAPERS = [
  "portal",
  "grid",
  "golden",
  "campus",
  "vortex",
  "tape",
  "aurora",
  "night",
  "vhs",
  "orb",
  "dunes",
  "static",
] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];
export function isWallpaper(s: unknown): boolean {
  return typeof s === "string" && ((WALLPAPERS as readonly string[]).includes(s) || /^photo:\d{1,12}$/.test(s));
}

export interface PhoneSettings {
  case: PhoneCase;
  wallpaper: string; // home
  lockWallpaper: string;
  ringtone: Ringtone;
  textTone: TextTone;
  tones: Record<string, Ringtone>; // per contact (user id → ringtone)
  theme: "dark" | "light";
  textSize: "small" | "normal" | "large";
  vibrate: boolean;
  favourites: number[]; // user ids (0: Vortex)
  installed: string[]; // apps from the Store (built-ins aren't listed)
}

export const DEFAULT_PHONE: PhoneSettings = {
  case: "walnut",
  wallpaper: "portal",
  lockWallpaper: "portal",
  ringtone: "citypop",
  textTone: "pop",
  tones: {},
  theme: "dark",
  textSize: "normal",
  vibrate: true,
  favourites: [],
  installed: [],
};

// Anything from storage or the wire, made safe (unknown fields dropped, bad values defaulted).
export function parsePhoneSettings(x: unknown): PhoneSettings {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const d = DEFAULT_PHONE;
  const tones: Record<string, Ringtone> = {};
  if (o.tones && typeof o.tones === "object")
    for (const [k, v] of Object.entries(o.tones as Record<string, unknown>).slice(0, 200))
      if (/^\d{1,10}$/.test(k) && isRingtone(v)) tones[k] = v;
  const ids = (v: unknown, max: number) =>
    Array.isArray(v) ? [...new Set(v.filter((n) => Number.isInteger(n) && n >= 0).map(Number))].slice(0, max) : [];
  return {
    case: isCase(o.case) ? o.case : d.case,
    wallpaper: isWallpaper(o.wallpaper) ? (o.wallpaper as string) : d.wallpaper,
    lockWallpaper: isWallpaper(o.lockWallpaper) ? (o.lockWallpaper as string) : d.lockWallpaper,
    ringtone: isRingtone(o.ringtone) ? o.ringtone : d.ringtone,
    textTone: (TEXT_TONES as readonly unknown[]).includes(o.textTone) ? (o.textTone as TextTone) : d.textTone,
    tones,
    theme: o.theme === "light" ? "light" : "dark",
    textSize: o.textSize === "small" || o.textSize === "large" ? o.textSize : "normal",
    vibrate: typeof o.vibrate === "boolean" ? o.vibrate : d.vibrate,
    favourites: ids(o.favourites, 12),
    installed: Array.isArray(o.installed)
      ? o.installed.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,32}$/.test(s)).slice(0, 40)
      : [],
  };
}

// Limits
export const MAX_TEXT = 1000; // characters in a text
export const GROUP_MAX = 50; // people in a group thread
export const CALL_MAX = 8; // people on one call
export const RING_MS = 30_000; // unanswered after this: a missed call
export const PHOTO_MAX_PX = 1600; // the long side of a photo
export const PHOTO_QUOTA = 300; // photos per person

// Calls: how one ended, as it's written into the thread (and Recents)
export type CallEnd = "answered" | "missed" | "declined" | "busy" | "cancelled" | "unreachable";

// A call as the world-server tells its people about it.
export interface CallInfo {
  id: string;
  from: number; // who called (user id)
  video: boolean;
  members: { uid: number; name: string; avatar: string; space: string; state: "ringing" | "in" | "left" }[];
  startedAt: number; // server ms (answered), 0 while ringing
}

// Secret numbers on the keypad (the lore): what each one rings.
export const SECRET_NUMBERS: Record<string, string> = {
  "1989": "vex", // M. Vex's old line
  "0800": "vortex", // straight to Vortex
  "555": "static", // nobody, just static
  "8675309": "jenny",
  "4242": "tape", // a voicemail on an old tape
};

// A short, tidy one-line preview of a text for lists and banners.
export function preview(text: string, n = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
