// The match (docs/plan/114-the-strike-park.md, S-M4, S-M5): CS's rounds, economy, the charge, the
// hostages, halves and overtime, and the respawn modes (Deathmatch, Arms Race) — pure, so the server
// runs it and the tests play it. The server says what happened (a shot's damage, who's on a site and
// holding use, who's dead) and the match says what follows: money, the round's end, the next round.
// Nothing about where people are lives here but the charge's place and the hostages'.

import { inRect, type P, type StrikeMap, type Team } from "./map.ts";
import { strikeMap } from "./maps/index.ts";
import {
  ARMS_KILLS,
  ARMS_LADDER,
  armored,
  DM_POINTS,
  type ItemId,
  isGun,
  KNIFE,
  lossBonus,
  MODES,
  MONEY,
  type ModeId,
  type ModeRules,
  NADES_MAX,
  ROUND,
  type StrikeGun,
  shopItem,
} from "./rules.ts";

export type Phase = "warmup" | "freeze" | "live" | "planted" | "after" | "half" | "over";
export type WinWhy = "elim" | "time" | "bomb" | "defuse" | "rescue" | "hostages";

export interface MPlayer {
  id: string;
  name: string;
  /** 0: started as the Raiders; 1: as the Wardens (the side follows the half: `teamOf`) */
  squad: 0 | 1;
  bot: boolean;
  alive: boolean;
  hp: number;
  armor: number;
  helmet: boolean;
  kit: boolean;
  money: number;
  primary: StrikeGun | null;
  pistol: StrikeGun | null;
  nades: ItemId[];
  /** carrying the charge */
  bomb: boolean;
  /** carrying a hostage (its index) */
  carry: number;
  kills: number;
  deaths: number;
  assists: number;
  mvps: number;
  /** Deathmatch's points; Arms Race's level (ARMS_LADDER index) and kills on it */
  score: number;
  level: number;
  levelKills: number;
  /** this round: damage dealt to each victim (assists: ≥ 41), kills */
  dealt: Record<string, number>;
  roundKills: number;
  /** Deathmatch/Arms Race: back at (match seconds) */
  respawnAt: number;
}

export interface Charge {
  state: "carried" | "dropped" | "planting" | "planted" | "defused" | "exploded";
  x: number;
  z: number;
  site?: "A" | "B";
  /** planting: seconds left; planted: the fuse's seconds left */
  left: number;
  /** who's defusing, and the seconds left of it */
  defuser?: string;
  defuseLeft: number;
  planter?: string;
}

export interface Hostage {
  x: number;
  z: number;
  /** who's carrying it ("" none) */
  by: string;
  rescued: boolean;
  dead: boolean;
}

export type MatchEvent =
  | { e: "round"; n: number }
  | { e: "live" }
  | { e: "kill"; by: string; victim: string; gun: string; head: boolean; walls: number; assist?: string }
  | { e: "planted"; by: string; site: "A" | "B" }
  | { e: "defused"; by: string }
  | { e: "exploded" }
  | { e: "win"; team: Team; why: WinWhy; mvp?: string }
  | { e: "half" }
  | { e: "overtime" }
  | { e: "over"; squad: 0 | 1 | -1 }
  | { e: "rescued"; by: string }
  | { e: "respawn"; id: string }
  | { e: "level"; id: string; level: number }
  | { e: "money"; id: string; amount: number; why: string };

export interface Match {
  map: StrikeMap;
  mode: ModeRules;
  phase: Phase;
  /** seconds left in the phase */
  left: number;
  /** seconds since the match began (the respawn modes' clock) */
  clock: number;
  /** 1-based */
  round: number;
  /** rounds won, by squad */
  score: [number, number];
  /** the sides swapped (the second half; overtime's halves too) */
  swapped: boolean;
  overtime: number;
  /** the score when this overtime began */
  otBase: [number, number];
  /** losses in a row, by side */
  streak: Record<Team, number>;
  players: Map<string, MPlayer>;
  charge: Charge | null;
  hostages: Hostage[];
  /** how the last round ended */
  last?: { team: Team; why: WinWhy };
  events: MatchEvent[];
}

const sideOf = (squad: 0 | 1, swapped: boolean): Team => ((squad === 0) !== swapped ? "r" : "w");
export const teamOf = (m: Match, p: MPlayer): Team => sideOf(p.squad, m.swapped);
const other = (t: Team): Team => (t === "r" ? "w" : "r");
/** How many a squad fields now (its side's size: Retakes' Wardens one fewer). */
export const squadSize = (m: Match, squad: 0 | 1): number =>
  sideOf(squad, m.swapped) === "w" ? (m.mode.maxW ?? m.mode.max) : m.mode.max;

export function newMatch(mapKey: string, modeId: ModeId): Match {
  const map = strikeMap(mapKey);
  return {
    map,
    mode: MODES[modeId],
    phase: "warmup",
    left: ROUND.warmup,
    clock: 0,
    round: 0,
    score: [0, 0],
    swapped: false,
    overtime: 0,
    otBase: [0, 0],
    streak: { r: 0, w: 0 },
    players: new Map(),
    charge: null,
    hostages: [],
    events: [],
  };
}

export function join(m: Match, id: string, name: string, squad: 0 | 1, bot = false): MPlayer {
  const p: MPlayer = {
    id,
    name,
    squad,
    bot,
    alive: m.phase === "warmup" || !m.mode.rounds,
    hp: 100,
    armor: 0,
    helmet: false,
    kit: false,
    money: m.mode.start,
    primary: null,
    pistol: "revolver",
    nades: [],
    bomb: false,
    carry: -1,
    kills: 0,
    deaths: 0,
    assists: 0,
    mvps: 0,
    score: 0,
    level: 0,
    levelKills: 0,
    dealt: {},
    roundKills: 0,
    respawnAt: 0,
  };
  if (!m.mode.rounds) loadout(m, p);
  m.players.set(id, p);
  return p;
}
export function leave(m: Match, id: string) {
  const p = m.players.get(id);
  if (!p) return;
  if (p.bomb) dropCharge(m, p, ...chargeAtSpawn(m));
  m.players.delete(id);
}
/** The squad with fewer players (a new player's), the Raiders' on a tie. */
export function emptierSquad(m: Match): 0 | 1 {
  let a = 0;
  let b = 0;
  for (const p of m.players.values()) p.squad === 0 ? a++ : b++;
  return b < a ? 1 : 0;
}
export const teamPlayers = (m: Match, t: Team) => [...m.players.values()].filter((p) => teamOf(m, p) === t);
export const alivePlayers = (m: Match, t: Team) => teamPlayers(m, t).filter((p) => p.alive);

/** The respawn modes' gear: Deathmatch everything, Arms Race the ladder's gun. */
function loadout(m: Match, p: MPlayer) {
  p.hp = 100;
  p.alive = true;
  if (m.mode.freeArmor) {
    p.armor = 100;
    p.helmet = true;
  }
  if (m.mode.id === "armsrace") {
    const g = ARMS_LADDER[Math.min(p.level, ARMS_LADDER.length - 1)];
    p.primary = g === "revolver" ? null : g;
    p.pistol = g === "revolver" ? "revolver" : null;
  } else if (m.mode.id === "deathmatch") {
    p.money = MONEY.max;
    p.primary ??= "ak47";
    p.pistol = "revolver";
  }
}

/** Begins the match (after warmup, or at once): round 1. */
export function startMatch(m: Match) {
  m.score = [0, 0];
  m.round = 0;
  m.swapped = false;
  m.overtime = 0;
  m.clock = 0;
  m.streak = { r: 0, w: 0 };
  for (const p of m.players.values()) {
    p.kills = p.deaths = p.assists = p.mvps = p.score = p.level = p.levelKills = 0;
    resetGear(p, m.mode.start);
  }
  if (!m.mode.rounds) {
    m.phase = "live";
    m.left = (m.mode.minutes ?? 10) * 60;
    for (const p of m.players.values()) loadout(m, p);
    m.events.push({ e: "live" });
    return;
  }
  nextRound(m);
}
function resetGear(p: MPlayer, money: number) {
  p.money = money;
  p.primary = null;
  p.pistol = "revolver";
  p.nades = [];
  p.armor = 0;
  p.helmet = false;
  p.kit = false;
}

function nextRound(m: Match) {
  m.round++;
  m.phase = "freeze";
  m.left = ROUND.freeze;
  m.charge = null;
  m.hostages = (m.map.hostages ?? []).map(([x, z]) => ({ x, z, by: "", rescued: false, dead: false }));
  for (const p of m.players.values()) {
    if (!p.alive) {
      // the dead lose what they carried
      p.primary = null;
      p.pistol = "revolver";
      p.nades = [];
      p.armor = 0;
      p.helmet = false;
      p.kit = false;
    }
    p.alive = true;
    p.hp = 100;
    p.bomb = false;
    p.carry = -1;
    p.dealt = {};
    p.roundKills = 0;
    if (m.mode.freeArmor) {
      p.armor = 100;
      p.helmet = true;
      if (teamOf(m, p) === "w") p.kit = true;
    }
  }
  // the charge to a Raider (a person before a bot)
  if (m.map.sites && m.mode.id !== "retakes") {
    const rs = teamPlayers(m, "r").sort((a, b) => Number(a.bot) - Number(b.bot));
    const pick = rs[(m.round * 7) % Math.max(1, rs.length)];
    if (pick) {
      pick.bomb = true;
      m.charge = { state: "carried", x: 0, z: 0, left: 0, defuseLeft: 0 };
    }
  }
  if (m.mode.id === "retakes" && m.map.sites) {
    // the charge is down already, on a site by the round
    const site: "A" | "B" = m.map.sites.B && m.round % 2 === 0 ? "B" : "A";
    const r = site === "A" ? m.map.sites.A : (m.map.sites.B ?? m.map.sites.A);
    m.charge = {
      state: "planted",
      x: (r.x0 + r.x1) / 2,
      z: (r.z0 + r.z1) / 2,
      site,
      left: ROUND.fuse,
      defuseLeft: 0,
    };
    for (const p of m.players.values()) {
      // (both sides rifles, as CS's Retakes: the double-barrel a post-plant held against AKs out-ranged it — the
      // Wardens took every round; plan 117's balance pass)
      p.primary = "ak47";
      p.armor = 100;
      p.helmet = true;
      p.kit = teamOf(m, p) === "w";
      // (and CS's Retakes cards' utility: the retakers a smoke and a flash to break the post-plant's crossfire, the
      // holders a flash)
      p.nades = teamOf(m, p) === "w" ? ["smoke", "flash"] : ["flash"];
    }
  }
  m.events.push({ e: "round", n: m.round });
}

/** Whether `p` may buy now (the buy time, in their buy zone: `inZone` the server's say). */
export function canBuy(m: Match, p: MPlayer, inZone: boolean): boolean {
  if (!p.alive || !inZone) return false;
  if (!m.mode.rounds) return m.mode.id === "deathmatch";
  if (m.phase === "warmup") return true;
  if (m.phase === "freeze") return true;
  if (m.phase === "live") return ROUND.round - m.left <= ROUND.buy;
  return false;
}

/** Buys `item` for p: null, or why not. */
export function buy(m: Match, id: string, item: ItemId, inZone: boolean): string | null {
  const p = m.players.get(id);
  if (!p) return "not in the match";
  if (!canBuy(m, p, inZone)) return "you can't buy now";
  const s = shopItem(item);
  if (!s) return "no such thing";
  const t = teamOf(m, p);
  if (s.team && s.team !== t) return `the ${s.team === "r" ? "Raiders'" : "Wardens'"} only`;
  const free = m.phase === "warmup" || m.mode.id === "deathmatch";
  if (!free && p.money < s.price) return "not enough money";
  switch (s.slot) {
    case "primary":
      if (p.primary === item) return "you have one";
      if (s.perTeam && teamPlayers(m, t).filter((q) => q.primary === item).length >= s.perTeam)
        return "your team has one";
      p.primary = item as StrikeGun;
      break;
    case "pistol":
      if (p.pistol === item) return "you have one";
      p.pistol = item as StrikeGun;
      break;
    case "gear":
      if (item === "kevlar") {
        if (p.armor >= 100) return "your armor's full";
        p.armor = 100;
      } else if (item === "helmet") {
        if (p.armor >= 100 && p.helmet) return "you have both";
        // (CS: armor full already, the helmet alone costs the difference)
        const price = p.armor >= 100 ? s.price - shopItem("kevlar").price : s.price;
        if (!free && p.money < price) return "not enough money";
        if (!free) p.money -= price;
        p.armor = 100;
        p.helmet = true;
        return null;
      } else if (item === "kit") {
        if (p.kit) return "you have one";
        p.kit = true;
      }
      break;
    case "nade": {
      if (p.nades.length >= NADES_MAX) return "you can't carry more";
      if (p.nades.filter((n) => n === item).length >= (s.carry ?? 1)) return "you can't carry more of those";
      p.nades.push(item);
      break;
    }
  }
  if (!free) p.money -= s.price;
  return null;
}

/** A hit on `victimId` by `byId` with `gun` (its damage as the world's guns work it out, `dmg`), on
 *  the head or not: what it took. Kills, rewards, the round's end follow. */
export function hit(
  m: Match,
  byId: string,
  victimId: string,
  gun: string,
  dmg: number,
  where: "head" | "body" | "legs",
  walls = 0,
): { hp: number; armor: number; killed: boolean } | null {
  const v = m.players.get(victimId);
  const by = m.players.get(byId);
  if (!v?.alive) return null;
  if (!(m.phase === "live" || m.phase === "planted" || m.phase === "after" || m.phase === "warmup")) return null;
  if (by && by !== v && teamOf(m, by) === teamOf(m, v) && !m.mode.friendlyFire) return null;
  const [hp, off] = armored(dmg, where, v.armor, v.helmet, gun);
  v.armor = Math.max(0, v.armor - off);
  if (v.armor === 0) v.helmet = where === "head" ? false : v.helmet;
  const took = Math.min(v.hp, hp);
  v.hp -= took;
  if (by && by !== v) by.dealt[victimId] = (by.dealt[victimId] ?? 0) + took;
  if (v.hp <= 0) {
    kill(m, byId, victimId, gun, where === "head", walls);
    return { hp: 0, armor: v.armor, killed: true };
  }
  return { hp: v.hp, armor: v.armor, killed: false };
}

/** Someone dies (a hit, the fire, the charge's blast, a fall): the kill's rewards and what it decides. */
export function kill(m: Match, byId: string, victimId: string, gun: string, head = false, walls = 0) {
  const v = m.players.get(victimId);
  if (!v?.alive) return;
  v.alive = false;
  v.hp = 0;
  v.deaths++;
  const by = m.players.get(byId);
  // the charge falls where they fell (the server gives the place: `dropCharge`)
  if (v.bomb) {
    v.bomb = false;
    if (m.charge) m.charge.state = "dropped";
  }
  if (v.carry >= 0) {
    const h = m.hostages[v.carry];
    if (h) h.by = "";
    v.carry = -1;
  }
  if (m.charge?.defuser === victimId) {
    m.charge.defuser = undefined;
    m.charge.defuseLeft = 0;
  }
  let assist: string | undefined;
  for (const q of m.players.values())
    if (q !== by && q !== v && (q.dealt[victimId] ?? 0) >= 41 && teamOf(m, q) !== teamOf(m, v)) {
      q.assists++;
      assist = q.id;
      break;
    }
  if (by && by !== v) {
    if (teamOf(m, by) === teamOf(m, v)) {
      by.kills--;
      pay(m, by, MONEY.teamKill, "team kill");
    } else {
      by.kills++;
      by.roundKills++;
      const reward =
        gun === "knife"
          ? KNIFE.reward
          : isGun(gun)
            ? (shopItem(gun).reward ?? 300)
            : (shopItem(gun as ItemId)?.reward ?? 300);
      if (m.mode.rounds) pay(m, by, reward, `kill with the ${gun}`);
      if (m.mode.id === "deathmatch") by.score += (isGun(gun) ? DM_POINTS[gun] : 10) + (head ? 5 : 0);
      if (m.mode.id === "armsrace") armsUp(m, by);
    }
  }
  m.events.push({ e: "kill", by: byId, victim: victimId, gun, head, walls, ...(assist ? { assist } : {}) });
  // (the respawn modes, and every mode's warmup: back in 2 s)
  if (!m.mode.rounds || m.phase === "warmup") v.respawnAt = m.clock + 2;
  else decide(m);
}

function armsUp(m: Match, p: MPlayer) {
  p.levelKills++;
  if (p.levelKills < ARMS_KILLS && p.level < ARMS_LADDER.length - 1) return;
  if (p.level >= ARMS_LADDER.length - 1) {
    // the revolver's kill: the race is won
    m.phase = "over";
    m.events.push({ e: "over", squad: p.squad });
    return;
  }
  p.level++;
  p.levelKills = 0;
  loadout(m, p);
  m.events.push({ e: "level", id: p.id, level: p.level });
}

function pay(m: Match, p: MPlayer, amount: number, why: string) {
  const before = p.money;
  p.money = Math.max(0, Math.min(MONEY.max, p.money + amount));
  if (p.money !== before) m.events.push({ e: "money", id: p.id, amount: p.money - before, why });
}

/** Where the charge drops when its carrier leaves without dying (their spawn's first point). */
function chargeAtSpawn(m: Match): [number, number] {
  const [x, z] = m.map.spawns.r[0];
  return [x, z];
}
/** The charge on the ground at (x, z) (its carrier killed or dropping it: G). */
export function dropCharge(m: Match, p: MPlayer, x: number, z: number) {
  p.bomb = false;
  if (!m.charge) return;
  if (m.charge.state === "carried" || m.charge.state === "dropped" || m.charge.state === "planting")
    Object.assign(m.charge, { state: "dropped", x, z, left: 0, planter: undefined });
}
/** A Raider walks over the dropped charge. */
export function pickCharge(m: Match, id: string): boolean {
  const p = m.players.get(id);
  if (!p?.alive || teamOf(m, p) !== "r" || m.charge?.state !== "dropped") return false;
  p.bomb = true;
  m.charge.state = "carried";
  return true;
}

/** Each tick, for whoever's holding use: the carrier on a site, still (`at`), plants; a Warden by the
 *  planted charge, still, defuses. `holding` false lets go. */
export function holdTick(m: Match, id: string, holding: boolean, at: P, dt: number) {
  const p = m.players.get(id);
  const c = m.charge;
  if (!p?.alive || !c) return;
  const t = teamOf(m, p);
  if (t === "r" && p.bomb && (m.phase === "live" || m.phase === "planted")) {
    const site = siteAt(m.map, at[0], at[1]);
    if (!holding || !site || m.phase !== "live") {
      if (c.state === "planting" && c.planter === id)
        Object.assign(c, { state: "carried", left: 0, planter: undefined });
      return;
    }
    if (c.state !== "planting") Object.assign(c, { state: "planting", left: ROUND.plant, planter: id, site });
    c.left -= dt;
    c.x = at[0];
    c.z = at[1];
    if (c.left <= 0) {
      p.bomb = false;
      Object.assign(c, { state: "planted", left: ROUND.fuse, site });
      m.phase = "planted";
      pay(m, p, MONEY.plant, "planting");
      m.events.push({ e: "planted", by: id, site });
    }
    return;
  }
  if (t === "w" && c.state === "planted") {
    const near = Math.hypot(at[0] - c.x, at[1] - c.z) <= 1.6;
    if (!holding || !near) {
      if (c.defuser === id) Object.assign(c, { defuser: undefined, defuseLeft: 0 });
      return;
    }
    if (c.defuser && c.defuser !== id) return;
    if (c.defuser !== id) Object.assign(c, { defuser: id, defuseLeft: p.kit ? ROUND.defuseKit : ROUND.defuse });
    c.defuseLeft -= dt;
    if (c.defuseLeft <= 0) {
      c.state = "defused";
      pay(m, p, MONEY.defuse, "defusing");
      m.events.push({ e: "defused", by: id });
      endRound(m, "w", "defuse", id);
    }
  }
}
export function siteAt(map: StrikeMap, x: number, z: number): "A" | "B" | undefined {
  if (!map.sites) return undefined;
  if (inRect(map.sites.A, x, z)) return "A";
  if (map.sites.B && inRect(map.sites.B, x, z)) return "B";
  return undefined;
}

/** A Warden grabs a hostage (by its index) or brings one to the rescue zone. */
export function grabHostage(m: Match, id: string, i: number): boolean {
  const p = m.players.get(id);
  const h = m.hostages[i];
  if (!p?.alive || !h || h.by || h.rescued || h.dead || teamOf(m, p) !== "w" || p.carry >= 0) return false;
  if (m.phase !== "live") return false;
  h.by = id;
  p.carry = i;
  return true;
}
export function carryTick(m: Match, id: string, at: P) {
  const p = m.players.get(id);
  if (!p?.alive || p.carry < 0) return;
  const h = m.hostages[p.carry];
  h.x = at[0];
  h.z = at[1];
  if (m.map.rescue && inRect(m.map.rescue, at[0], at[1])) {
    h.rescued = true;
    h.by = "";
    p.carry = -1;
    pay(m, p, MONEY.rescue, "a rescue");
    for (const q of teamPlayers(m, "w")) if (q !== p) pay(m, q, MONEY.rescueTeam, "a rescue");
    m.events.push({ e: "rescued", by: id });
    // (CS2: one rescued wins the round)
    endRound(m, "w", "rescue", id);
  }
}
/** A hostage hurt by `byId` (a shot through them): money off; dead at `dmg` ≥ its 100. */
export function hurtHostage(m: Match, byId: string, i: number, dmg: number) {
  const p = m.players.get(byId);
  const h = m.hostages[i];
  if (!p || !h || h.dead) return;
  if (dmg >= 100) {
    h.dead = true;
    pay(m, p, MONEY.hostageKilled, "a hostage killed");
  } else pay(m, p, MONEY.hostageHurt, "a hostage hurt");
}

/** Whether a side's been wiped out (it has players and none alive). */
const wiped = (m: Match, t: Team) => teamPlayers(m, t).length > 0 && alivePlayers(m, t).length === 0;

/** After a death: does it decide the round? */
function decide(m: Match) {
  if (!(m.phase === "live" || m.phase === "planted")) return;
  if (m.phase === "live") {
    if (wiped(m, "r")) return endRound(m, "w", "elim");
    if (wiped(m, "w")) return endRound(m, "r", "elim");
  } else {
    // the charge planted: the Raiders dead don't end it; the Wardens dead do
    if (wiped(m, "w")) return endRound(m, "r", "elim");
  }
}

function endRound(m: Match, team: Team, why: WinWhy, hero?: string) {
  if (m.phase === "after" || m.phase === "over") return;
  m.phase = "after";
  m.left = ROUND.after;
  m.last = { team, why };
  const winners = teamPlayers(m, team);
  const losers = teamPlayers(m, other(team));
  // the MVP: the planter/defuser/rescuer when that won it, else the most kills on the winning side
  let mvp = hero ? m.players.get(hero) : undefined;
  if (!mvp) mvp = [...winners].sort((a, b) => b.roundKills - a.roundKills)[0];
  if (mvp) mvp.mvps++;
  m.events.push({ e: "win", team, why, ...(mvp ? { mvp: mvp.id } : {}) });
  const squad = winners[0]?.squad ?? (team === "r" ? (m.swapped ? 1 : 0) : m.swapped ? 0 : 1);
  m.score[squad]++;
  // money
  const reward =
    why === "bomb"
      ? MONEY.winBomb
      : why === "defuse"
        ? MONEY.winDefuse
        : why === "rescue" || why === "hostages"
          ? MONEY.winRescue
          : why === "time"
            ? MONEY.winTime
            : MONEY.winElim;
  for (const p of winners) pay(m, p, reward, "the round won");
  m.streak[other(team)]++;
  m.streak[team] = Math.max(0, m.streak[team] - 1);
  const bonus = lossBonus(m.streak[other(team)]);
  const planted =
    m.charge && (m.charge.state === "planted" || m.charge.state === "defused" || m.charge.state === "exploded");
  for (const p of losers) {
    // (CS: the Raiders alive when the clock runs out get nothing)
    if (why === "time" && other(team) === "r" && p.alive) continue;
    pay(m, p, bonus + (other(team) === "r" && planted ? MONEY.plantedLoss : 0), "the round lost");
  }
}

/** The clock. Returns the events since the last tick (and clears them). */
export function tick(m: Match, dt: number): MatchEvent[] {
  m.clock += dt;
  if (m.phase === "over") return flush(m);
  if (!m.mode.rounds) {
    if (m.phase === "warmup") {
      m.left -= dt;
      if (m.left <= 0) startMatch(m);
      return flush(m);
    }
    m.left -= dt;
    for (const p of m.players.values())
      if (!p.alive && m.clock >= p.respawnAt) {
        loadout(m, p);
        m.events.push({ e: "respawn", id: p.id });
      }
    if (m.left <= 0) {
      m.phase = "over";
      const best = [...m.players.values()].sort((a, b) => b.score - a.score || b.kills - a.kills)[0];
      m.events.push({ e: "over", squad: best ? best.squad : -1 });
    }
    return flush(m);
  }
  m.left -= dt;
  switch (m.phase) {
    case "warmup":
      for (const p of m.players.values())
        if (!p.alive && m.clock >= p.respawnAt) {
          p.alive = true;
          p.hp = 100;
          m.events.push({ e: "respawn", id: p.id });
        }
      if (m.left <= 0) startMatch(m);
      break;
    case "freeze":
      if (m.left <= 0) {
        m.phase = m.charge?.state === "planted" ? "planted" : "live";
        m.left = ROUND.round;
        m.events.push({ e: "live" });
      }
      break;
    case "live":
      if (m.left <= 0) {
        // the clock: the Wardens hold (bomb maps), the Raiders hold (hostage maps)
        endRound(m, m.map.mode === "hostage" ? "r" : "w", "time");
      }
      break;
    case "planted":
      if (m.charge) {
        m.charge.left -= dt;
        if (m.charge.left <= 0) {
          m.charge.state = "exploded";
          m.events.push({ e: "exploded" });
          endRound(m, "r", "bomb", m.charge.planter);
        }
      }
      break;
    case "after":
      if (m.left <= 0) afterRound(m);
      break;
    case "half":
      if (m.left <= 0) nextRound(m);
      break;
  }
  return flush(m);
}
function flush(m: Match): MatchEvent[] {
  const out = m.events;
  m.events = [];
  return out;
}

/** After a round: the match over, half time, overtime, or the next round. */
function afterRound(m: Match) {
  const R = m.mode;
  const [a, b] = m.score;
  const played = a + b;
  if (m.overtime === 0) {
    if (a >= R.first || b >= R.first) return over(m, a > b ? 0 : 1);
    if (played === R.half * 2) {
      if (R.ot) return startOvertime(m);
      return over(m, a === b ? -1 : a > b ? 0 : 1);
    }
    if (R.half && played === R.half) return halfTime(m, R.start);
    return nextRound(m);
  }
  // overtime: each `ot.half` rounds the sides swap; first to `ot.first` of the overtime's rounds wins it
  const ot = R.ot as { half: number; first: number };
  const base = R.half * 2 + (m.overtime - 1) * ot.half * 2;
  const won = [a - m.otBase[0], b - m.otBase[1]];
  if (won[0] >= ot.first || won[1] >= ot.first) return over(m, won[0] > won[1] ? 0 : 1);
  if (played === base + ot.half * 2) return startOvertime(m);
  if (played === base + ot.half) return halfTime(m, MONEY.overtime);
  return nextRound(m);
}
function startOvertime(m: Match) {
  m.overtime++;
  m.otBase = [...m.score] as [number, number];
  m.events.push({ e: "overtime" });
  halfTime(m, MONEY.overtime);
}
function halfTime(m: Match, money: number) {
  m.swapped = !m.swapped;
  m.streak = { r: 0, w: 0 };
  for (const p of m.players.values()) {
    resetGear(p, money);
    p.alive = true;
  }
  m.phase = "half";
  m.left = ROUND.half;
  m.events.push({ e: "half" });
}
function over(m: Match, squad: 0 | 1 | -1) {
  m.phase = "over";
  m.left = 0;
  m.events.push({ e: "over", squad });
}

/** Whether people may move (not in freeze time). */
export const frozen = (m: Match) => m.phase === "freeze";
/** A player's gun out by default: the primary, else the pistol. */
export const gunOf = (p: MPlayer): StrikeGun | null => p.primary ?? p.pistol;
