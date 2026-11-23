// The Strike Park's rules as numbers (docs/plan/114-the-strike-park.md, S-M4, S-M5): the round's clock,
// the economy, the shop, the modes. CS2's rules, carried over exactly (F1); the guns are the world's
// own five (plans 79–84), priced by the role each fills.

import type { Team } from "./map.ts";

/** The round's clock (s). */
export const ROUND = {
  warmup: 60,
  freeze: 15,
  buy: 20,
  round: 115,
  /** after the round's decided, before the next freeze */
  after: 7,
  /** the charge: planting, its fuse, defusing with and without a kit */
  plant: 3.2,
  fuse: 40,
  defuse: 10,
  defuseKit: 5,
  /** half time's pause */
  half: 15,
  /** a timeout (Competitive: four a team) */
  timeout: 30,
} as const;

/** Money. */
export const MONEY = {
  start: 800,
  max: 16000,
  winElim: 3250,
  winTime: 3250,
  winBomb: 3500,
  winDefuse: 3500,
  winRescue: 3500,
  /** the loss bonus: from `loss0`, +`lossStep` a loss in a row, to `lossMax`; a win steps it down one */
  loss0: 1400,
  lossStep: 500,
  lossMax: 3400,
  /** the Raiders lose a round after planting: this to each */
  plantedLoss: 800,
  plant: 300,
  defuse: 300,
  /** a hostage: hurting one, rescuing one (the rescuer), a team's share when one is rescued */
  hostageHurt: -30,
  hostageKilled: -1000,
  rescue: 1000,
  rescueTeam: 600,
  /** a teammate killed */
  teamKill: -300,
  /** overtime's start */
  overtime: 10000,
} as const;

/** The loss bonus after `streak` losses in a row (1 = the first loss). */
export const lossBonus = (streak: number) =>
  Math.min(MONEY.lossMax, MONEY.loss0 + MONEY.lossStep * Math.max(0, streak - 1));

/** What's for sale. `slot`: what it fills (one primary, one pistol; gear and grenades their own). */
export type ItemId =
  | "revolver"
  | "shotgun"
  | "ak47"
  | "sniper"
  | "daybreak"
  | "kevlar"
  | "helmet"
  | "kit"
  | "he"
  | "flash"
  | "smoke"
  | "molotov"
  | "incendiary"
  | "decoy";
export type Slot = "primary" | "pistol" | "gear" | "nade";
export interface ShopItem {
  id: ItemId;
  name: string;
  price: number;
  slot: Slot;
  /** only this team may buy it */
  team?: Team;
  /** the grid's column (F10, CS2's grid by role) */
  col: "pistols" | "mid" | "rifles" | "gear" | "nades";
  /** the kill reward with it (guns), CS's for its role */
  reward?: number;
  /** a team may hold this many at once (the Daybreak: one) */
  perTeam?: number;
  /** how many one person may carry (the flashes: two) */
  carry?: number;
  /** the zone's run speed with it out (m/s, CS's for its role: 250 u/s = 6.35) */
  speed?: number;
}

export const SHOP: ShopItem[] = [
  { id: "revolver", name: "Revolver", price: 500, slot: "pistol", col: "pistols", reward: 300, speed: 6.1 },
  { id: "shotgun", name: "Double-barrel", price: 1100, slot: "primary", col: "mid", reward: 900, speed: 5.72 },
  { id: "ak47", name: "AK", price: 2700, slot: "primary", col: "rifles", reward: 300, speed: 5.46 },
  { id: "sniper", name: "Sniper", price: 4750, slot: "primary", col: "rifles", reward: 100, speed: 5.08 },
  {
    id: "daybreak",
    name: "Daybreak",
    price: 5200,
    slot: "primary",
    col: "rifles",
    reward: 100,
    perTeam: 1,
    speed: 5.08,
  },
  { id: "kevlar", name: "Kevlar vest", price: 650, slot: "gear", col: "gear" },
  { id: "helmet", name: "Kevlar + helmet", price: 1000, slot: "gear", col: "gear" },
  { id: "kit", name: "Defuse kit", price: 400, slot: "gear", col: "gear", team: "w" },
  { id: "he", name: "HE grenade", price: 300, slot: "nade", col: "nades", reward: 300, carry: 1 },
  { id: "flash", name: "Flashbang", price: 200, slot: "nade", col: "nades", carry: 2 },
  { id: "smoke", name: "Smoke grenade", price: 300, slot: "nade", col: "nades", carry: 1 },
  { id: "molotov", name: "Molotov", price: 400, slot: "nade", col: "nades", team: "r", reward: 300, carry: 1 },
  { id: "incendiary", name: "Incendiary", price: 500, slot: "nade", col: "nades", team: "w", reward: 300, carry: 1 },
  { id: "decoy", name: "Decoy", price: 50, slot: "nade", col: "nades", carry: 1 },
];
export const shopItem = (id: ItemId) => SHOP.find((s) => s.id === id) as ShopItem;
/** Grenades one may carry at once (CS's four). */
export const NADES_MAX = 4;
export const GUNS = ["revolver", "shotgun", "ak47", "sniper", "daybreak"] as const;
export type StrikeGun = (typeof GUNS)[number];
export const isGun = (id: string): id is StrikeGun => (GUNS as readonly string[]).includes(id);

/** Run speeds (m/s): nothing out, scoped (the sniper's), walking's and crouching's shares. */
export const SPEED = { bare: 6.35, scoped: 2.54, walk: 0.52, crouch: 0.34 } as const;
export const speedWith = (gun: StrikeGun | null) => (gun ? (shopItem(gun).speed ?? SPEED.bare) : SPEED.bare);

/** Armor: what it takes of a hit on what it covers (the rest to health), and the armor it costs. CS's:
 *  a gun's armor penetration — the heavy ones (`pierce`) go through most of it. */
export const ARMOR = {
  ratio: 0.5,
  bonus: 0.5,
  pierce: { sniper: 0.85, daybreak: 0.9 } as Record<string, number>,
} as const;

/** Damage `d` on `where` against `armor` (0–100) and a helmet: [to health, off the armor]. */
export function armored(
  d: number,
  where: "head" | "body" | "legs",
  armor: number,
  helmet: boolean,
  gun: string,
): [number, number] {
  const covered = where === "legs" ? false : where === "head" ? helmet : true;
  if (!covered || armor <= 0) return [d, 0];
  const through = ARMOR.pierce[gun] ?? ARMOR.ratio;
  let health = d * through;
  let off = (d - health) * ARMOR.bonus;
  if (off > armor) {
    // (the armor runs out: what it couldn't take goes to health)
    health = d - armor / ARMOR.bonus;
    off = armor;
  }
  return [Math.round(health), Math.round(off)];
}

/** The modes (S-M5). `first`: rounds to win; `half`: rounds a half (sides swap); `max`: a team's size. */
export type ModeId = "competitive" | "casual" | "wingman" | "deathmatch" | "armsrace" | "retakes";
export interface ModeRules {
  id: ModeId;
  name: string;
  /** what maps it's played on */
  on: ("bomb" | "hostage" | "wingman" | "range")[];
  max: number;
  /** the Wardens' size when it isn't `max` (Retakes: three retake from four, CS's own split the other way round) */
  maxW?: number;
  first: number;
  half: number;
  start: number;
  friendlyFire: boolean;
  freeArmor: boolean;
  /** rounds (false: a clock, respawns) */
  rounds: boolean;
  /** overtime: rounds a half and to win */
  ot?: { half: number; first: number };
  minutes?: number;
  blurb: string;
}
export const MODES: Record<ModeId, ModeRules> = {
  competitive: {
    id: "competitive",
    name: "Competitive",
    on: ["bomb", "hostage"],
    max: 5,
    first: 13,
    half: 12,
    start: MONEY.start,
    friendlyFire: true,
    freeArmor: false,
    rounds: true,
    ot: { half: 3, first: 4 },
    blurb: "5 v 5 · first to 13 · overtime",
  },
  casual: {
    id: "casual",
    name: "Casual",
    on: ["bomb", "hostage"],
    max: 10,
    first: 8,
    half: 7,
    start: 1000,
    friendlyFire: false,
    freeArmor: true,
    rounds: true,
    blurb: "up to 10 v 10 · first to 8 · free armor",
  },
  wingman: {
    id: "wingman",
    name: "Wingman",
    on: ["wingman"],
    max: 2,
    first: 9,
    half: 8,
    start: MONEY.start,
    friendlyFire: true,
    freeArmor: false,
    rounds: true,
    ot: { half: 3, first: 4 },
    blurb: "2 v 2 · one site · first to 9",
  },
  deathmatch: {
    id: "deathmatch",
    name: "Deathmatch",
    on: ["bomb", "hostage", "wingman", "range"],
    max: 8,
    first: 0,
    half: 0,
    start: MONEY.max,
    friendlyFire: false,
    freeArmor: true,
    rounds: false,
    minutes: 10,
    blurb: "free for all · 10 minutes · respawn at once",
  },
  armsrace: {
    id: "armsrace",
    name: "Arms Race",
    on: ["bomb", "hostage", "wingman", "range"],
    max: 8,
    first: 0,
    half: 0,
    start: 0,
    friendlyFire: false,
    freeArmor: true,
    rounds: false,
    minutes: 15,
    blurb: "a kill moves you up the guns · the revolver last",
  },
  retakes: {
    id: "retakes",
    name: "Retakes",
    on: ["bomb"],
    max: 4,
    maxW: 3,
    first: 8,
    half: 0,
    start: 0,
    friendlyFire: false,
    freeArmor: true,
    rounds: true,
    blurb: "the charge is down · 3 Wardens retake from 4 Raiders",
  },
};

/** Arms Race's ladder: two kills a gun, the revolver last (the plan's: the five guns). */
export const ARMS_LADDER: StrikeGun[] = ["daybreak", "sniper", "ak47", "shotgun", "revolver"];
export const ARMS_KILLS = 2;

/** Deathmatch's points: a kill, a headshot's extra, by gun (CS's: less for the easy ones). */
export const DM_POINTS: Record<StrikeGun, number> = { revolver: 15, shotgun: 10, ak47: 10, sniper: 5, daybreak: 5 };

/** Where damage lands: each gun's own (plans 79–84, untouched — the user, 2026-11-21): its `damage`,
 *  falloff and `HEAD.mult`, through `damageAt`. The zone only takes off PvP's half (S-M2) and adds armor. */
export const FULL_DAMAGE = true;

/** Tagging: a hit slows you to this share of your speed for this long. */
export const TAG = { share: 0.45, secs: 0.4 } as const;

/** (plan 115 phase 24, F5) The combat knife: its reach (m), its cone (rad either side of the facing), its damage from
 *  the front and from behind (a back within 60° of the attacker's own facing), its swing's time (s), its kill reward. */
export const KNIFE = { reach: 1.8, cone: 0.6, front: 40, back: 90, swing: 0.5, reward: 1500 } as const;
