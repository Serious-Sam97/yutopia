import { type AvatarLayers, DEFAULT_AVATAR, parseAvatar } from "../avatar.ts";

// The world's cast (docs/plan/120-god-mode-npcs.md): every NPC the world has, kept by the API (`npcs`), edited on
// the admins' page (/admin/npcs), read by the world server, which draws the town's people from it (their name, look
// and lines, live on save). The town's (those that were code: the guard, the Kart Park's, Vortex, the Strike Park's)
// keep their own behaviour, said by a type of their own; the ones made here wait off the map for the next ticket,
// which gives them a place: their behaviour is stored, not played yet.

/** Words in both languages: PT empty falls back to EN. */
export interface Words {
  en: string;
  pt: string;
}
/** A line they say, and when (`ambient`: on their own, now and then; `greet`: someone coming near; `answer`: talked
 *  to; Vortex's by his events). */
export interface NpcLine extends Words {
  when: string;
}

export type NpcVoice = "man" | "woman";
/** What anyone made here can be. */
export const NPC_TYPES = ["stand", "wander", "route", "counter", "sit"] as const;
/** The town's own: each played by its feature, shown as its own, never swapped. */
export const TOWN_TYPES = [
  "guard-rounds",
  "kart-control",
  "kart-mechanic",
  "kart-cocoa",
  "kart-visitor",
  "vortex",
  "strike-quartermaster",
  "strike-instructor",
  "strike-cook",
  "strike-keeper",
  "strike-officer",
  "strike-recruit",
] as const;
export type NpcType = (typeof NPC_TYPES)[number] | (typeof TOWN_TYPES)[number];
export const NPC_HOURS = ["always", "day", "night", "shift"] as const;
export type NpcHours = (typeof NPC_HOURS)[number];
export const NPC_TALK = ["never", "rarely", "sometimes", "often"] as const;
export type NpcTalk = (typeof NPC_TALK)[number];
export const NPC_SHOTS = ["ignore", "duck", "flee"] as const;
export type NpcShots = (typeof NPC_SHOTS)[number];

export interface NpcBehaviour {
  type: NpcType;
  /** when they're in the world: always, by day, by night, or a shift (`from`–`to`, the world's hours, 0–24; past
   *  midnight when `to` < `from`) */
  hours: NpcHours;
  from: number;
  to: number;
  /** walking pace, 0.5–1.5 × a person's; null: by their gait */
  pace: number | null;
  /** how often they say a line on their own */
  talk: NpcTalk;
  /** a hello to someone coming near */
  greet: boolean;
  /** X to talk gets a line */
  answer: boolean;
  /** shots near them */
  shots: NpcShots;
  /** who they are (plan 123: 0…1 each — outgoing, active, neat, cheerful); null: from their key (npc/mind.ts
   *  traitsOf) */
  traits: Record<(typeof TRAIT_KEYS)[number], number> | null;
}
/** The traits' names (npc/mind.ts TRAIT_NAMES: the same, here for the cast's parse). */
export const TRAIT_KEYS = ["outgoing", "active", "neat", "cheerful"] as const;

export interface NpcDef {
  /** its id: a town NPC's is the one the world gives them (`guard`, `folk-rosa`, `vortex`, `strike-marta`…) */
  key: string;
  name: string;
  /** what they do, shown after the name ("Rosa · Race control") */
  role: Words;
  /** their look; null for Vortex alone (his mascot's) */
  look: AvatarLayers | null;
  voice: NpcVoice;
  lines: NpcLine[];
  /** for admins only */
  notes: string;
  behaviour: NpcBehaviour;
  /** moved from code: shown as the town's */
  town: boolean;
  /** when (ISO), the API's */
  made?: string;
  changed?: string;
}

export const NPC_LIMITS = { name: 40, role: 40, line: 140, lines: 120, notes: 1000, cast: 500 } as const;
export const NPC_KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** The lines' moments anyone has (plan 123: what's done with them too — a joke, a compliment, asked about their day or
 *  their job, a chat with another NPC, an order taken, something refused; npc/lines.ts has the defaults). */
export const LINE_WHEN = [
  "ambient",
  "greet",
  "answer",
  "joke",
  "laugh",
  "compliment",
  "day",
  "job",
  "chat",
  "order",
  "served",
  "refuse",
  "thanks",
] as const;
/** Vortex's public moments (apps/api Vortex::PUBLIC): his lines by what's going on. */
export const VORTEX_WHEN = [
  "ambient",
  "radio",
  "night",
  "standup",
  "sleep",
  "vortexos",
  "hit",
  "dodge",
  "whip",
  "rew",
  "pause",
  "steal",
  "blast",
  "dark",
  "clones",
  "shades",
  "possess",
  "glitch",
  "down",
] as const;
/** The moments a type's lines can have. */
export function linesWhen(type: NpcType): readonly string[] {
  return type === "vortex" ? VORTEX_WHEN : LINE_WHEN;
}

/** The separator between EN and PT where one string carries both (an `Npc`'s role and line on the wire). */
export const BI = "\u001f";
/** Both languages in one string: "en" alone when PT's empty or the same. */
export function biOf(w: Words): string {
  return w.pt && w.pt !== w.en ? `${w.en}${BI}${w.pt}` : w.en;
}
/** One language out of `biOf`'s string. */
export function biIn(s: string, pt: boolean): string {
  const i = s.indexOf(BI);
  if (i < 0) return s;
  const p = s.slice(i + 1);
  return pt && p ? p : s.slice(0, i);
}
/** How they're named over their head: "Name · Role", or whichever they have. */
export function npcLabel(name: string, role: string): string {
  return name && role ? `${name} · ${role}` : name || role;
}

/** A look as the wire carries it: only what isn't the default (`parseAvatar` gives the rest back). */
export function packLook(look: AvatarLayers | null): string {
  if (!look) return "";
  const out: Record<string, string> = {};
  for (const k of Object.keys(DEFAULT_AVATAR) as (keyof AvatarLayers)[])
    if (look[k] !== DEFAULT_AVATAR[k]) out[k] = look[k];
  return JSON.stringify(out);
}

/** How long between their lines, × their feature's own (Infinity: never). */
export const TALK_EVERY: Record<NpcTalk, number> = {
  never: Number.POSITIVE_INFINITY,
  rarely: 2,
  sometimes: 1,
  often: 0.5,
};
/** A person's pace by their gait (plan 58 4e), × the walk's: the old slower, the tired too, the brisk quicker. */
export const GAIT_PACE: Record<string, number> = { old: 0.7, tired: 0.85, brisk: 1.15, bouncy: 1.05, heavy: 0.95 };
/** Their pace, × a person's: as set, or by their gait. */
export function paceOf(d: Pick<NpcDef, "look" | "behaviour">): number {
  return d.behaviour.pace ?? GAIT_PACE[d.look?.gait ?? ""] ?? 1;
}

export function defaultBehaviour(type: NpcType = "stand"): NpcBehaviour {
  return {
    type,
    hours: "always",
    from: 8,
    to: 18,
    pace: null,
    talk: "sometimes",
    greet: false,
    answer: false,
    shots: "ignore",
    traits: null,
  };
}

// (control characters — BI among them — out: spaces)
const str = (v: unknown, max: number): string => {
  if (typeof v !== "string") return "";
  let s = "";
  for (const ch of v) {
    const c = ch.charCodeAt(0);
    s += c < 32 || c === 127 ? " " : ch;
  }
  // (cut by characters — code points —, as the API's mb_substr: never mid-surrogate)
  return Array.from(s.trim()).slice(0, max).join("");
};
const words = (v: unknown, max: number): Words => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { en: str(o.en, max), pt: str(o.pt, max) };
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], or: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : or;
const hour = (v: unknown, or: number): number => {
  // (a number, or a number written out: anything else — null, "", true — is the default, as the API has it)
  const n = typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(24, Math.round(n * 2) / 2)) : or;
};

// (traits as sent: each 0…1 in tenths; none given — or none a number — null, from their key)
function traitsIn(v: unknown): NpcBehaviour["traits"] {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out = {} as Record<(typeof TRAIT_KEYS)[number], number>;
  let any = false;
  for (const k of TRAIT_KEYS) {
    const n = typeof o[k] === "number" ? (o[k] as number) : Number.NaN;
    if (Number.isFinite(n)) any = true;
    out[k] = Number.isFinite(n) ? Math.max(0, Math.min(1, Math.round(n * 10) / 10)) : 0.5;
  }
  return any ? out : null;
}
/** An NPC as anyone sent it, cleaned: null if it can't be one (no key, neither a name nor a role). A town type only
 *  for a town NPC (`town` is the stored one's, never what was sent: pass `town` from what's kept). */
export function parseNpc(raw: unknown, keep?: { town: boolean; type?: NpcType }): NpcDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key : "";
  if (!NPC_KEY.test(key)) return null;
  const town = keep ? keep.town : o.town === true;
  const b = (o.behaviour && typeof o.behaviour === "object" ? o.behaviour : {}) as Record<string, unknown>;
  // (a town NPC's type is theirs: kept as it was; anyone else's is one of NPC_TYPES)
  const type: NpcType =
    town && keep?.type
      ? keep.type
      : town
        ? oneOf<NpcType>(b.type, [...TOWN_TYPES, ...NPC_TYPES], "stand")
        : oneOf<NpcType>(b.type, NPC_TYPES, "stand");
  const paceRaw = b.pace === null || b.pace === undefined || b.pace === "" ? null : Number(b.pace);
  const behaviour: NpcBehaviour = {
    type,
    hours: oneOf(b.hours, NPC_HOURS, "always"),
    from: hour(b.from, 8),
    to: hour(b.to, 18),
    pace:
      paceRaw === null || !Number.isFinite(paceRaw)
        ? null
        : Math.max(0.5, Math.min(1.5, Math.round(paceRaw * 20) / 20)),
    talk: oneOf(b.talk, NPC_TALK, "sometimes"),
    greet: b.greet === true,
    answer: b.answer === true,
    shots: oneOf(b.shots, NPC_SHOTS, "ignore"),
    traits: traitsIn(b.traits),
  };
  const when = linesWhen(type);
  const lines: NpcLine[] = [];
  for (const l of Array.isArray(o.lines) ? o.lines : []) {
    if (lines.length >= NPC_LIMITS.lines) break;
    const w = words(l, NPC_LIMITS.line);
    if (!w.en && !w.pt) continue;
    // (EN is the one said when PT's missing: a line in PT alone is said in PT to everyone)
    lines.push({
      when: oneOf((l as Record<string, unknown>)?.when, when, "ambient"),
      en: w.en || w.pt,
      pt: w.en ? w.pt : "",
    });
  }
  const name = str(o.name, NPC_LIMITS.name);
  const role = words(o.role, NPC_LIMITS.role);
  if (!name && !role.en && !role.pt) return null;
  const look = type === "vortex" ? null : parseAvatar(o.look ?? {});
  return {
    key,
    name,
    role: { en: role.en || role.pt, pt: role.en ? role.pt : "" },
    look,
    voice: oneOf<NpcVoice>(o.voice, ["man", "woman"], look?.gender === "feminine" ? "woman" : "man"),
    lines,
    notes: str(o.notes, NPC_LIMITS.notes),
    behaviour,
    town,
    ...(typeof o.made === "string" ? { made: o.made } : {}),
    ...(typeof o.changed === "string" ? { changed: o.changed } : {}),
  };
}

/** A whole cast as anyone sent it: the ones that can be, each key once. */
export function parseCast(raw: unknown): NpcDef[] {
  const out: NpcDef[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw) ? raw.slice(0, NPC_LIMITS.cast) : []) {
    const d = parseNpc(r);
    if (!d || seen.has(d.key)) continue;
    seen.add(d.key);
    out.push(d);
  }
  return out;
}

/** A new NPC's key. */
export function newNpcKey(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rand() * 36)];
  return `npc-${s}`;
}

/** Their lines for a moment (EN|PT, `biOf`), or none. */
export function linesFor(d: Pick<NpcDef, "lines">, when = "ambient"): string[] {
  return d.lines.filter((l) => l.when === when).map(biOf);
}
