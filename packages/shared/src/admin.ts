// The admins' powers and the limits on them (docs/plan/48-the-admin.md): one table the world
// server checks, the client moves by and the admin panel shows. Every power is an admin's
// alone — the server refuses anyone else (Player.admin), and drops them all when they leave.

/** The switches an admin holds on themselves (Player.powers, a bitmask). */
export const POWERS = {
  /** no gravity: up and down at will, run ×3 */
  fly: 1,
  /** walls, furniture and locked doors don't stop them */
  clip: 2,
  /** every pace ×2 */
  fast: 4,
  /** nobody but other admins sees or hears them */
  hidden: 8,
  /** the shades and falls don't hurt; breath and battery never run out */
  unhurt: 16,
} as const;
export type PowerName = keyof typeof POWERS;
export const POWER_NAMES = Object.keys(POWERS) as PowerName[];
export const isPower = (k: unknown): k is PowerName => typeof k === "string" && Object.hasOwn(POWERS, k);
export const hasPower = (powers: number | undefined, k: PowerName): boolean => ((powers ?? 0) & POWERS[k]) !== 0;

/** How fast a flier goes (tiles / s): across at a run's pace ×3 sprinting, up and down. */
export const FLY = { across: 4.2, sprint: 3, rise: 5, top: 180 } as const;
/** Fast: every pace times this. */
export const FAST = 2;

/** How long a removal lasts (minutes): the person page's choices. */
export const REMOVE_MINUTES = [10, 60, 1440] as const;
/** How long a freeze lasts (minutes). */
export const FREEZE_MINUTES = [1, 5, 10] as const;
/** A notice to everyone: this long at most. */
export const NOTICE_MAX = 140;
/** A called-up storm, or a sent-off one, lasts this long before the schedule's back. */
export const STORM_CALL_MS = 20 * 60_000;

/** What an admin did, for the log (the API's admin_actions.kind). */
export const LOG_KINDS = [
  "mute",
  "unmute",
  "remove",
  "unremove",
  "lock",
  "unlock",
  "admin",
  "unadmin",
  "hour",
  "storm",
  "notice",
  "power",
  "spawn",
  "clear",
  "freeze",
  "home",
  "bring",
  "unseat",
  "heal",
  "give",
  "cars",
  "shuttle",
  "dark",
  "invite",
  // god mode (docs/plan/53-the-god-mode.md): a publish, a roll back, in and out
  "publish",
  "rollback",
  "god",
] as const;
export type LogKind = (typeof LOG_KINDS)[number];
