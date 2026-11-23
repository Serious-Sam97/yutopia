// The Strike Park's ranks, stats and missions (docs/plan/115-the-strike-park-again.md, phases 96–97): XP for each
// match played (more for a win, for kills, for the round's objectives), a ladder of our own rank names, stats kept per
// gun and per map, a match history, and three daily missions from a pool (the same three for everyone on a day).
// Kept by the world-server in the world's settings (apps/api PUT /internal/world/strike), by account.

export interface StrikeRank {
  name: string;
  /** XP to reach it */
  xp: number;
  /** its badge: a colour and how many chevrons */
  colour: string;
  marks: number;
}

/** The ladder (our own names): recruit to legend, steeper as it climbs. */
export const RANKS: StrikeRank[] = [
  { name: "Recruit", xp: 0, colour: "#8c8a7e", marks: 0 },
  { name: "Private", xp: 300, colour: "#8c8a7e", marks: 1 },
  { name: "Corporal", xp: 800, colour: "#a78a5a", marks: 2 },
  { name: "Sergeant", xp: 1600, colour: "#a78a5a", marks: 3 },
  { name: "Staff Sergeant", xp: 2800, colour: "#c9a24a", marks: 3 },
  { name: "Lieutenant", xp: 4500, colour: "#c9a24a", marks: 4 },
  { name: "Captain", xp: 7000, colour: "#e8a33a", marks: 4 },
  { name: "Major", xp: 10500, colour: "#e8a33a", marks: 5 },
  { name: "Colonel", xp: 15000, colour: "#d9653f", marks: 5 },
  { name: "Snowline Legend", xp: 22000, colour: "#7fb4d9", marks: 6 },
];

export function rankOf(xp: number): { i: number; rank: StrikeRank; next: StrikeRank | null; into: number } {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1] ?? null;
  const into = next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1;
  return { i, rank: RANKS[i], next, into };
}

/** What one match did for one player (the server tallies it as it goes). */
export interface MatchTally {
  map: string;
  mode: string;
  won: boolean;
  /** -1: no winner (a draw, Deathmatch) */
  side: "r" | "w";
  kills: number;
  deaths: number;
  heads: number;
  rounds: number;
  /** rounds won */
  roundsWon: number;
  plants: number;
  defuses: number;
  rescues: number;
  mvps: number;
  /** kills by gun */
  guns: Record<string, number>;
  /** rounds won by gun held most of the round's kills (for "win 2 rounds with the AK") */
  roundsWith: Record<string, number>;
  knife: number;
}

export function emptyTally(map: string, mode: string, side: "r" | "w"): MatchTally {
  return {
    map,
    mode,
    won: false,
    side,
    kills: 0,
    deaths: 0,
    heads: 0,
    rounds: 0,
    roundsWon: 0,
    plants: 0,
    defuses: 0,
    rescues: 0,
    mvps: 0,
    guns: {},
    roundsWith: {},
    knife: 0,
  };
}

/** XP for a match: 100 for playing it out, +150 a win, 10 a kill, 5 a headshot more, 20 each objective, 25 an MVP. */
export function xpOf(t: MatchTally): number {
  return (
    100 +
    (t.won ? 150 : 0) +
    t.kills * 10 +
    t.heads * 5 +
    (t.plants + t.defuses + t.rescues) * 20 +
    t.mvps * 25 +
    t.roundsWon * 4
  );
}

// ── the missions ──
export type MissionKey =
  | "wins"
  | "roundsWon"
  | "kills"
  | "heads"
  | "plants"
  | "defuses"
  | "rescues"
  | "knife"
  | `gun:${string}`
  | `with:${string}`
  | `map:${string}`;
export interface Mission {
  id: string;
  text: string;
  key: MissionKey;
  need: number;
  xp: number;
}

/** The pool the day's three come from. */
export const MISSIONS: Mission[] = [
  { id: "win1", text: "Win a match", key: "wins", need: 1, xp: 200 },
  { id: "rounds6", text: "Win 6 rounds", key: "roundsWon", need: 6, xp: 150 },
  { id: "ak2", text: "Win 2 rounds with the AK", key: "with:ak47", need: 2, xp: 150 },
  { id: "sniper5", text: "5 kills with the sniper", key: "gun:sniper", need: 5, xp: 150 },
  { id: "rev5", text: "5 kills with the revolver", key: "gun:revolver", need: 5, xp: 150 },
  { id: "sg4", text: "4 kills with the shotgun", key: "gun:shotgun", need: 4, xp: 120 },
  { id: "day3", text: "3 kills with the Daybreak", key: "gun:daybreak", need: 3, xp: 150 },
  { id: "heads5", text: "5 headshots", key: "heads", need: 5, xp: 150 },
  { id: "kills15", text: "15 kills", key: "kills", need: 15, xp: 150 },
  { id: "plant2", text: "Plant the charge twice", key: "plants", need: 2, xp: 120 },
  { id: "defuse1", text: "Defuse the charge", key: "defuses", need: 1, xp: 150 },
  { id: "rescue2", text: "Rescue 2 hostages", key: "rescues", need: 2, xp: 150 },
  { id: "knife1", text: "A knife kill", key: "knife", need: 1, xp: 200 },
  { id: "lodge", text: "Win a match on Lodge", key: "map:lodge", need: 1, xp: 180 },
  { id: "freight", text: "Win a match on Freight", key: "map:freight", need: 1, xp: 180 },
];

/** The day (UTC) as a number: the missions' seed. */
export const dayOf = (ms: number) => Math.floor(ms / 86_400_000);

/** The day's three missions (everyone's the same three): a seeded pick from the pool. */
export function missionsOf(day: number): Mission[] {
  let s = (day * 2654435761) >>> 0;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pool = [...MISSIONS];
  const out: Mission[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** How far a match took a mission. */
export function missionStep(m: Mission, t: MatchTally): number {
  const k = m.key;
  if (k === "wins") return t.won ? 1 : 0;
  if (k.startsWith("gun:")) return t.guns[k.slice(4)] ?? 0;
  if (k.startsWith("with:")) return t.roundsWith[k.slice(5)] ?? 0;
  if (k.startsWith("map:")) return t.won && t.map === k.slice(4) ? 1 : 0;
  return (t as unknown as Record<string, number>)[k] ?? 0;
}

/** One account's record. */
export interface StrikeCard {
  name: string;
  xp: number;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  heads: number;
  /** by gun: kills */
  guns: Record<string, number>;
  /** by map: [played, won] */
  maps: Record<string, [number, number]>;
  /** the last ten matches */
  history: { at: number; map: string; mode: string; won: boolean; k: number; d: number; xp: number }[];
  /** the day the missions are for, and each one's progress (by id); done ones paid */
  day: number;
  progress: Record<string, number>;
  paid: string[];
  /** (phase 55) the kit chosen at the customization corner (kit.ts, "shade.pattern.cap.charm") */
  kit?: string;
}

export function newCard(name: string): StrikeCard {
  return {
    name,
    xp: 0,
    matches: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    heads: 0,
    guns: {},
    maps: {},
    history: [],
    day: 0,
    progress: {},
    paid: [],
  };
}

/** A match into a card: XP, stats, history, the day's missions (paid once each). What changed, for the toast. */
export function addMatch(
  c: StrikeCard,
  t: MatchTally,
  now: number,
): { xp: number; missions: Mission[]; rankUp: StrikeRank | null } {
  const before = rankOf(c.xp).i;
  let xp = xpOf(t);
  c.matches++;
  if (t.won) c.wins++;
  c.kills += t.kills;
  c.deaths += t.deaths;
  c.heads += t.heads;
  for (const [g, n] of Object.entries(t.guns)) c.guns[g] = (c.guns[g] ?? 0) + n;
  const mp = c.maps[t.map] ?? [0, 0];
  c.maps[t.map] = [mp[0] + 1, mp[1] + (t.won ? 1 : 0)];
  const day = dayOf(now);
  if (c.day !== day) {
    c.day = day;
    c.progress = {};
    c.paid = [];
  }
  const done: Mission[] = [];
  for (const m of missionsOf(day)) {
    if (c.paid.includes(m.id)) continue;
    c.progress[m.id] = Math.min(m.need, (c.progress[m.id] ?? 0) + missionStep(m, t));
    if (c.progress[m.id] >= m.need) {
      c.paid.push(m.id);
      xp += m.xp;
      done.push(m);
    }
  }
  c.xp += xp;
  c.history = [{ at: now, map: t.map, mode: t.mode, won: t.won, k: t.kills, d: t.deaths, xp }, ...c.history].slice(
    0,
    10,
  );
  const after = rankOf(c.xp).i;
  return { xp, missions: done, rankUp: after > before ? RANKS[after] : null };
}
