// The Strike Park's customization corner (docs/plan/115-the-strike-park-again.md, phase 55): your team kit — the vest's
// shade and pattern, the cap — and a charm hung on your gun (our own: a pine, a snowflake, a die, a paw, Vortex's
// face). Kept on your card (ranks.ts StrikeCard.kit) as "shade.pattern.cap.charm"; worn in the match.

export const KIT_SHADES: Record<"r" | "w", string[]> = {
  r: ["#b9781f", "#8c5a1a", "#d09a3a"],
  w: ["#3e5d72", "#2c4456", "#5b7f96"],
};
/** The pattern's second colour by team (the stripes', the check's). */
export const KIT_SECOND: Record<"r" | "w", string> = { r: "#3a2a14", w: "#c9d6de" };
export const KIT_PATTERNS = ["none", "stripes", "check", "trim", "dots"] as const;
export const KIT_CHARMS = ["none", "pine", "flake", "die", "paw", "vortex"] as const;
export type KitPattern = (typeof KIT_PATTERNS)[number];
export type KitCharm = (typeof KIT_CHARMS)[number];

export interface StrikeKit {
  shade: number;
  pattern: KitPattern;
  cap: boolean;
  charm: KitCharm;
}
export const DEFAULT_KIT: StrikeKit = { shade: 0, pattern: "none", cap: false, charm: "none" };

export function kitOf(s: string | undefined | null): StrikeKit {
  const [a, b, c, d] = String(s ?? "").split(".");
  const shade = Math.max(0, Math.min(2, Number(a) || 0));
  const pattern = (KIT_PATTERNS as readonly string[]).includes(b) ? (b as KitPattern) : "none";
  const charm = (KIT_CHARMS as readonly string[]).includes(d) ? (d as KitCharm) : "none";
  return { shade, pattern, cap: c === "1", charm };
}
export const kitString = (k: StrikeKit): string => `${k.shade}.${k.pattern}.${k.cap ? 1 : 0}.${k.charm}`;
/** A kit sent from a client, made safe (anything else: the default's). */
export const cleanKit = (s: unknown): string => kitString(kitOf(typeof s === "string" ? s.slice(0, 40) : ""));

/** The avatar's layers a kit puts on (over the person's own clothes): the team's vest, its pattern, the cap. */
export function kitLook(k: StrikeKit, team: "r" | "w"): Record<string, string> {
  const out: Record<string, string> = {
    outer: "vest",
    outerColor: KIT_SHADES[team][k.shade] ?? KIT_SHADES[team][0],
    outerPattern: k.pattern,
    outerColor2: KIT_SECOND[team],
  };
  if (k.cap) {
    out.accessory = "cap";
    out.accessoryColor = KIT_SHADES[team][k.shade] ?? KIT_SHADES[team][0];
  }
  return out;
}

/** The corner in the yard: against the outer wall, west of the desk. Its locker, mirror, the spot to stand. */
export const STRIKE_KIT = { x: -262, z: -602.3, stand: { x: -261, z: -605 } };
