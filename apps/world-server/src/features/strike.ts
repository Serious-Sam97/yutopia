import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import type { ServerMessages } from "@yutopia/shared";
import { ANIM, faceByte } from "@yutopia/shared";
import { type GunId, type Ray, rayMeets } from "@yutopia/shared/dark";
import { arenaChanged } from "@yutopia/shared/grounds";
import { emptyInventory, type Inventory, type Item, WEAPONS } from "@yutopia/shared/inventory";
import { unpackMv } from "@yutopia/shared/move";
import {
  addMatch,
  buy,
  canBuy,
  carryTick,
  cleanKit,
  dropCharge,
  emptierSquad,
  emptyTally,
  flashFor,
  frozen,
  grabHostage,
  gridOf,
  heDamage,
  hit,
  holdTick,
  type ItemId,
  inRect,
  inStrikeArena,
  inStrikeCompound,
  join,
  KNIFE,
  leave,
  type Match,
  type MatchEvent,
  type MatchTally,
  MODES,
  type ModeId,
  type MPlayer,
  NADE,
  type Nade,
  type NadeKind,
  newCard,
  newMatch,
  nodeNear,
  nodePos,
  pickCharge,
  SHOP,
  STRIKE_DESK,
  STRIKE_MAPS,
  STRIKE_PARK,
  type StrikeCard,
  setStrikeMap,
  shotThrough,
  spawnPoint,
  squadSize,
  startMatch,
  stepNade,
  strikeMap,
  teamOf,
  throwNade,
  tick,
  toLocal,
} from "@yutopia/shared/strike";
import {
  type BotEnv,
  Bots,
  type BotView,
  isBotLevel,
  knowFromJSON,
  knowOf,
  knowPump,
  knowReady,
  knowToJSON,
  mapPrint,
} from "@yutopia/shared/strike/bots";
import { api } from "../api.ts";
import { config } from "../config.ts";
import type { Player } from "../schema.ts";
import { Npc, StrikeHostage, StrikeMember, StrikeNade } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The Strike Park (docs/plan/114-the-strike-park.md): the match. Walk into the compound, join at the lobby's
// desk (or anywhere inside), and you're on a team; the match runs by CS's rules (shared strike/match.ts) on
// the map standing in the arena. Your pockets are put aside while you play: the park lends you its own
// (the world's five guns, as the match's money buys them) and gives yours back when you leave — nothing
// crosses the gate (S-M8). Shots between players in the match are the zone's: full damage, armor, the map's
// wallbangs (features/arms.ts asks `room.strike`). Empty places are Vortex bots (shared strike/bots: docs/plan/117). The Map
// Board swaps the map in the world (the plan 47 way, with a crew's show: F6).

const SHOW_MS = process.env.YUTOPIA_STRIKE_FAST ? 400 : 20_000; // (tests: fast)
const VOTE_MS = process.env.YUTOPIA_STRIKE_FAST ? 1500 : 15_000;
const BOT_HZ = 20;
/** CS's reserves for each of the world's guns (the rounds lent beside the magazine). */
const RESERVE: Record<GunId, number> = { revolver: 24, shotgun: 32, ak47: 90, sniper: 30, daybreak: 6 };

export interface StrikeHooks {
  /** whether sid's in the match (alive or dead): their hits are the zone's, never the world's */
  claims(sid: string): boolean;
  /** whether sid can be hit there now (in the match, alive) */
  alive(sid: string): boolean;
  /** a shot of the zone's landed: `n` its damage as the world's gun works it out, after the map's walls */
  hit(by: string, victim: string, gun: string, n: number, head: boolean, walls: number): void;
  /** the nearest bot along a shot's ray (building coords), within `range` */
  along(ray: Ray, range: number, by: string): { id: string; t: number; head: boolean } | null;
  /** what's left of a shot from a to b through the map's walls (building coords; 1 none in the way) */
  through(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ): { kept: number; walls: number };
}

/** (plan 117) Where a map's worked-out bot knowledge is kept between restarts (by its fingerprint). */
const KNOW_DIR = process.env.YUTOPIA_KNOW_DIR ?? joinPath(tmpdir(), "yutopia-strike-know");
const knowTried = new Set<string>();
const knowSaved = new Set<string>();
/** A map's bot knowledge readied: loaded if it's kept, else worked out a little (`ms`) — and kept once it's done. */
function warmKnow(map: ReturnType<typeof strikeMap>, ms: number) {
  const print = mapPrint(map);
  const file = joinPath(KNOW_DIR, `${print}.json`);
  if (knowReady(map)) {
    if (!knowSaved.has(print)) {
      knowSaved.add(print);
      try {
        mkdirSync(KNOW_DIR, { recursive: true });
        writeFileSync(file, knowToJSON(knowOf(map)));
      } catch {
        // (a read-only disk: worked out again next time)
      }
    }
    return;
  }
  if (!knowTried.has(print)) {
    knowTried.add(print);
    try {
      if (knowFromJSON(map, readFileSync(file, "utf8"))) {
        knowSaved.add(print);
        return;
      }
    } catch {
      // (none kept yet)
    }
  }
  knowPump(map, ms);
}

registerFeature((room: WorldRoom) => {
  const arena = room.state.strike;
  const putUp = (key: string, up: boolean) => {
    if (setStrikeMap(key, up)) arenaChanged();
  };
  putUp(arena.map, arena.up);
  let match: Match | null = null;
  /** (plan 117) the match's bots: one driver (shared strike/bots), made again whenever the match is */
  let brain: Bots | null = null;
  /** when each bot last fired (server ms: the members' `shotAt`) */
  const botShotAt = new Map<string, number>();
  /** The bots' world: where the people are, the smokes, the flashes; where their shots, grenades and words go. */
  const env: BotEnv = {
    rand: () => rand(),
    level: () => (isBotLevel(arena.level) ? arena.level : "normal"),
    other: (id) => {
      const p = room.state.players.get(id);
      if (!p) return null;
      const [x, z] = local(p);
      return { x, y: p.z - STRIKE_PARK.h, z, crouch: unpackMv(p.mv).crouch };
    },
    smokes: () => nades.filter((n) => n.state === "smoke"),
    blindTo: (id) => blindTo.get(id) ?? 0,
    shot: (id, s) => {
      const m = match;
      if (!m) return;
      botShotAt.set(id, Date.now());
      // (heard and seen as the world's own guns are: its sound, its flash, its tracer — the arms client's)
      armsShot(id, s.gun, s.o, s.yaw, s.pitch);
      const vc0 = clientOf(s.victim);
      if (vc0)
        room.send(vc0, "strike:shot", {
          id,
          gun: s.gun,
          o: s.o,
          yaw: s.yaw,
          pitch: s.pitch,
          victim: s.victim,
          head: s.head,
        });
      if (s.victim) {
        brain?.hurt(s.victim, id);
        hit(m, id, s.victim, s.gun, s.dmg, s.head ? "head" : "body", s.walls);
        const vc = clientOf(s.victim);
        if (vc) room.send(vc, "dark:hit", { id, n: s.dmg, shot: true });
      }
    },
    nade: (id, kind, eye, yaw, pitch, short) => {
      nades.push(throwNade(++nadeId, kind, id, eye, yaw, pitch, short));
    },
    say: (by, text, team) => {
      const m = match;
      if (!m) return;
      for (const q of m.players.values()) {
        if (q.bot || teamOf(m, q) !== team) continue;
        const c = clientOf(q.id);
        if (c) room.send(c, "strike:radio", { by, i: -1, text });
      }
    },
    // (its knowledge a little a tick: more while the match's not live — the warmup, the freeze)
    budget: () => (match && (match.phase === "live" || match.phase === "planted") ? 4 : 14),
  };
  /** The match's bots' driver (made for this match, its bots in). */
  const brainOf = (): Bots | null => {
    if (!match) {
      brain = null;
      return null;
    }
    if (!brain || brain.m !== match) {
      brain = new Bots(match, env);
      for (const p of match.players.values()) if (p.bot) brain.add(p.id);
    }
    return brain;
  };
  /** who's holding use (plant / defuse / a hostage) */
  const holding = new Set<string>();
  let botAcc = 0;
  // the grenades thrown, and who's blinded till when (bots: match seconds)
  const nades: Nade[] = [];
  let nadeId = 0;
  const blindTo = new Map<string, number>();
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const clientOf = (sid: string) => room.clients.getById(sid) as WorldClient | undefined;
  const local = (p: Player) => toLocal(p.x, p.y);
  const inArena = (p: Player) => p.level === 0 && inStrikeArena(p.x, p.y);
  const isBot = (id: string) => id.startsWith("bot:");

  // ── the loadout lent while in the match ──
  const loadoutOf = (mp: MPlayer): Inventory => {
    const inv = emptyInventory();
    const guns = [mp.primary, mp.pistol].filter(Boolean) as GunId[];
    guns.forEach((g, i) => {
      inv.quick[i] = { id: g, loaded: WEAPONS[g].mag } as Item;
    });
    let k = 0;
    for (const g of guns) {
      const ammo = WEAPONS[g].ammo;
      inv.pockets[k++] = { id: ammo, n: RESERVE[g] } as Item;
    }
    return inv;
  };
  const lend = (mp: MPlayer) => {
    if (isBot(mp.id)) return;
    room.survival?.lend?.(mp.id, loadoutOf(mp));
  };
  const giveBack = (sid: string) => room.survival?.lend?.(sid, null);

  // ── the room's state from the match ──
  const sync = () => {
    if (!match) {
      arena.phase = "idle";
      arena.members.clear();
      arena.charge = "";
      arena.hostages.clear();
      return;
    }
    const m = match;
    arena.phase = m.phase;
    arena.left = Math.max(0, m.left);
    arena.round = m.round;
    arena.scoreA = m.score[0];
    arena.scoreB = m.score[1];
    arena.swapped = m.swapped;
    arena.overtime = m.overtime;
    arena.mode = m.mode.id;
    const c = m.charge;
    arena.charge = c?.state ?? "";
    arena.cx = c?.x ?? 0;
    arena.cz = c?.z ?? 0;
    arena.site = c?.site ?? "";
    arena.fuse = c?.state === "planted" || c?.state === "planting" ? c.left : 0;
    arena.defuser = c?.defuser ?? "";
    arena.defuseLeft = c?.defuseLeft ?? 0;
    // (plan 115 phase 88) the hostages as the world's people: on their floor, or with whoever carries them
    const g = gridOf(m.map);
    m.hostages.forEach((h, i) => {
      const key = `strike-hostage:${i}`;
      if (h.rescued || h.dead) {
        room.state.npcs.delete(key);
        return;
      }
      let n = room.state.npcs.get(key);
      if (!n) {
        n = new Npc();
        n.id = key;
        n.kind = "folk";
        n.level = 0;
        room.state.npcs.set(key, n);
      }
      const carrier = h.by ? m.players.get(h.by) : undefined;
      const at = carrier ? whereOf(carrier) : null;
      const x = (at ? at[0] - 0.7 : h.x) + STRIKE_PARK.x;
      const y = (at ? at[2] - 0.7 : h.z) + STRIKE_PARK.z;
      const nn = nodeNear(g, x - STRIKE_PARK.x, y - STRIKE_PARK.z, at ? at[1] : 20);
      const moving = Math.hypot(x - n.x, y - n.y) > 0.02;
      n.yaw = moving ? faceByte(x - n.x, y - n.y, n.yaw) : n.yaw;
      n.x = x;
      n.y = y;
      n.z = (nn >= 0 ? nodePos(g, nn)[1] : 0) + STRIKE_PARK.h;
      n.a = moving ? ANIM.walk : ANIM.idle;
      n.mood = "hostage";
    });
    for (const [k] of room.state.npcs)
      if (k.startsWith("strike-hostage:") && Number(k.slice(15)) >= m.hostages.length) room.state.npcs.delete(k);
    while (arena.hostages.length > m.hostages.length) arena.hostages.pop();
    m.hostages.forEach((h, i) => {
      let s = arena.hostages[i];
      if (!s) {
        s = new StrikeHostage();
        arena.hostages.push(s);
      }
      s.x = h.x;
      s.z = h.z;
      s.by = h.by;
      s.rescued = h.rescued;
      s.dead = h.dead;
    });
    for (const id of [...arena.members.keys()]) if (!m.players.has(id)) arena.members.delete(id);
    // (a dead bot stays where it fell till the next round — plan 115 phase 85; gone when it's left the match)
    for (const [k] of room.state.npcs)
      if (k.startsWith("strike-bot:") && !m.players.has(k.slice(11))) room.state.npcs.delete(k);
    for (const p of m.players.values()) {
      let s = arena.members.get(p.id);
      if (!s) {
        s = new StrikeMember();
        arena.members.set(p.id, s);
      }
      s.name = p.name;
      s.squad = p.squad;
      s.team = teamOf(m, p);
      s.bot = p.bot;
      s.alive = p.alive;
      s.hp = Math.max(0, Math.round(p.hp));
      s.armor = Math.round(p.armor);
      s.helmet = p.helmet;
      s.kit = p.kit;
      s.money = p.money;
      s.primary = p.primary ?? "";
      s.pistol = p.pistol ?? "";
      s.nades = p.nades.join(",");
      s.bomb = p.bomb;
      s.carry = p.carry;
      s.kills = p.kills;
      s.deaths = p.deaths;
      s.assists = p.assists;
      s.mvps = p.mvps;
      s.score = p.score;
      s.level = p.level;
      if (!p.bot) {
        const k = cards.get(uidOf(p.id))?.kit ?? "";
        if (s.look !== k) s.look = k;
      }
      const b = brain?.view(p.id) ?? null;
      // (plan 115 phase 84: a bot is drawn as one of the world's people — a room NPC in its team's kit, its gun in
      // its hands — while it's alive)
      if (b) botNpc(p.id, p, b, teamOf(m, p));
      if (b) {
        s.x = b.x;
        s.y = b.y;
        s.z = b.z;
        s.yaw = b.yaw;
        s.pitch = b.pitch;
        s.crouch = b.crouch;
        s.gun = p.primary ?? p.pistol ?? "";
        s.shotAt = botShotAt.get(p.id) ?? 0;
      }
    }
    arena.last = m.last ? `${m.last.team}:${m.last.why}` : "";
  };

  /** A bot's NPC (`strike-bot:<id>`): where it is (world coords), its facing, walking or still, and in `mood` (plan
   *  115 phase 85) "<team>:<gun>:<pose>:<hit at>:<hit from>:<fell at>" — the pose's letters c crouched, a aiming
   *  (someone seen), k at the charge (planting, defusing); struck when (server ms) and from where (rad ×100); dead
   *  since when (0 alive): it lies where it fell till the round's over. */
  const botLook = new Map<string, { hp: number; hitAt: number; hitYaw: number; fellAt: number }>();
  /** (phase 86) what each team's bots know: where their own fell, where enemy fire was heard */
  /** (plan 117) a shot heard by the bots (a person's: theirs hear their own) */
  const heardBy = (shooter: string, x: number, z: number) => {
    if (!match || brain?.bots.has(shooter)) return;
    const p = room.state.players.get(shooter);
    brain?.heard(shooter, x, p ? p.z - STRIKE_PARK.h : 0, z, "shot");
  };
  const botNpc = (id: string, p: MPlayer, b: BotView, team: "r" | "w") => {
    const key = `strike-bot:${id}`;
    let n = room.state.npcs.get(key);
    if (!n) {
      if (!p.alive) return;
      n = new Npc();
      n.id = key;
      n.kind = "folk";
      n.level = 0;
      room.state.npcs.set(key, n);
    }
    const L = botLook.get(id) ?? { hp: p.hp, hitAt: 0, hitYaw: 0, fellAt: 0 };
    const now = Date.now();
    if (p.hp < L.hp - 0.5) {
      L.hitAt = now;
      // (from whoever it's facing — a bot turns to what shoots it; else behind)
      L.hitYaw = b.on ? b.yaw : b.yaw + Math.PI;
    }
    L.hp = p.hp;
    if (!p.alive && !L.fellAt) L.fellAt = now;
    if (p.alive) L.fellAt = 0;
    botLook.set(id, L);
    const x = b.x + STRIKE_PARK.x;
    const y = b.z + STRIKE_PARK.z;
    const moving = p.alive && Math.hypot(x - n.x, y - n.y) > 0.02;
    n.x = x;
    n.y = y;
    n.z = b.y + STRIKE_PARK.h;
    if (p.alive) n.yaw = faceByte(Math.cos(b.yaw), Math.sin(b.yaw), n.yaw);
    n.a = moving ? ANIM.walk : ANIM.idle;
    // (its gun up on someone, or holding an angle; k: at the charge)
    const pose = `${b.crouch && !b.using ? "c" : ""}${b.aiming ? "a" : ""}${b.using ? "k" : ""}`;
    const hitYaw = Math.round((((L.hitYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 100);
    const mood = `${team}:${p.primary ?? p.pistol ?? ""}:${pose}:${L.hitAt}:${hitYaw}:${L.fellAt}`;
    if (n.mood !== mood) n.mood = mood;
  };
  // ── places: spawns, a person put there ──
  // (plan 117: Retakes' Raiders start round the charge on its site — shared strike/spawn.ts)
  const spawnAt = (mp: MPlayer, i: number): [number, number, number] => {
    const m = match as Match;
    return spawnPoint(m, teamOf(m, mp), i);
  };
  const place = (mp: MPlayer, i: number) => {
    const [x, y, z] = spawnAt(mp, i);
    if (mp.bot && brainOf()?.bots.has(mp.id)) {
      brain?.place(mp.id, x, y, z);
      return;
    }
    const c = clientOf(mp.id);
    const p = room.state.players.get(mp.id);
    if (!c || !p) return;
    room.moveTo(c, p, { x: x + STRIKE_PARK.x, y: z + STRIKE_PARK.z, level: 0 }, { z: STRIKE_PARK.h + y + 0.05 });
  };
  const placeAll = () => {
    if (!match) return;
    const n = { r: 0, w: 0 };
    for (const mp of match.players.values()) {
      const t = teamOf(match, mp);
      place(mp, n[t]++);
    }
  };

  // ── bots ──
  const botNames = [
    "Vortex",
    "Vortex II",
    "Vortex III",
    "Vortex IV",
    "Vortex V",
    "Vortex VI",
    "Vortex VII",
    "Vortex VIII",
    "Vortex IX",
    "Vortex X",
  ];
  const fillBots = () => {
    if (!match) return;
    const m = match;
    for (const squad of [0, 1] as const) {
      // (its side's size: Retakes' Wardens three to the Raiders' four)
      const size = squadSize(m, squad);
      const have = [...m.players.values()].filter((p) => p.squad === squad);
      const people = have.filter((p) => !p.bot).length;
      const want = arena.fill ? Math.max(0, size - people) : 0;
      const botsIn = have.filter((p) => p.bot);
      for (let i = botsIn.length; i < want; i++) {
        let k = 0;
        while (m.players.has(`bot:${squad}${k}`)) k++;
        const id = `bot:${squad}${k}`;
        join(m, id, botNames[(squad * 5 + k) % botNames.length], squad, true);
        brainOf()?.add(id);
      }
      for (const b of botsIn.slice(want)) {
        leave(m, b.id);
        brain?.remove(b.id);
      }
    }
  };

  // ── the cards (plan 115 phases 96–97): each account's XP, stats, history and the day's missions, kept in the
  // world's settings (apps/api PUT /internal/world/strike); a match's tally by session while it's played ──
  const cards = new Map<string, StrikeCard>();
  {
    const saved = room.savedStrike as { cards?: Record<string, StrikeCard> } | null;
    if (saved?.cards && typeof saved.cards === "object")
      for (const [k, v] of Object.entries(saved.cards))
        if (v && typeof v === "object" && typeof v.xp === "number") cards.set(k, v);
  }
  const tallies = new Map<string, MatchTally>();
  const roundKills = new Map<string, Record<string, number>>();
  const uidOf = (sid: string) => {
    const p = room.state.players.get(sid);
    return p?.uid ? String(p.uid) : "";
  };
  const tallyOf = (sid: string): MatchTally | null => {
    if (!match) return null;
    const mp = match.players.get(sid);
    if (!mp || mp.bot || !uidOf(sid) || match.phase === "warmup") return null;
    let t = tallies.get(sid);
    // (a match left behind, another started: its tally started again)
    if (!t || t.map !== match.map.key || t.mode !== match.mode.id) {
      t = emptyTally(match.map.key, match.mode.id, teamOf(match, mp));
      tallies.set(sid, t);
    }
    return t;
  };
  const sendCard = (sid: string, extra: Omit<ServerMessages["strike:card"], "card"> = {}) => {
    const c = clientOf(sid);
    const uid = uidOf(sid);
    if (!c || !uid) return;
    const card = cards.get(uid) ?? newCard(room.state.players.get(sid)?.name ?? "");
    room.send(c, "strike:card", { card: JSON.stringify(card), ...extra });
  };
  const tallyEvent = (e: MatchEvent) => {
    if (!match) return;
    if (e.e === "round") roundKills.clear();
    if (e.e === "kill") {
      const by = e.by !== e.victim ? tallyOf(e.by) : null;
      if (by) {
        by.kills++;
        if (e.head) by.heads++;
        by.guns[e.gun] = (by.guns[e.gun] ?? 0) + 1;
        if (e.gun === "knife") by.knife++;
        const rk = roundKills.get(e.by) ?? {};
        rk[e.gun] = (rk[e.gun] ?? 0) + 1;
        roundKills.set(e.by, rk);
      }
      const v = tallyOf(e.victim);
      if (v) v.deaths++;
    }
    if (e.e === "planted") {
      const t = tallyOf(e.by);
      if (t) t.plants++;
    }
    if (e.e === "defused") {
      const t = tallyOf(e.by);
      if (t) t.defuses++;
    }
    if (e.e === "rescued") {
      const t = tallyOf(e.by);
      if (t) t.rescues++;
    }
    if (e.e === "win") {
      for (const mp of match.players.values()) {
        const t = tallyOf(mp.id);
        if (!t) continue;
        t.rounds++;
        if (teamOf(match, mp) !== e.team) continue;
        t.roundsWon++;
        const rk = roundKills.get(mp.id);
        if (rk) {
          const best = Object.entries(rk).sort((a, b) => b[1] - a[1])[0];
          if (best) t.roundsWith[best[0]] = (t.roundsWith[best[0]] ?? 0) + 1;
        }
      }
      if (e.mvp) {
        const t = tallyOf(e.mvp);
        if (t) t.mvps++;
      }
    }
    if (e.e === "over") {
      const people = [...match.players.values()];
      const top = people.slice().sort((a, b) => b.kills - a.kills)[0];
      for (const mp of people) {
        const t = tallyOf(mp.id);
        const uid = uidOf(mp.id);
        if (!t || !uid) continue;
        t.won = e.squad === -1 ? top?.id === mp.id : mp.squad === e.squad;
        const card = cards.get(uid) ?? newCard(mp.name);
        card.name = mp.name;
        const got = addMatch(card, t, Date.now());
        cards.set(uid, card);
        sendCard(mp.id, {
          xp: got.xp,
          missions: got.missions.map((m) => m.text),
          ...(got.rankUp ? { rankUp: got.rankUp.name } : {}),
        });
      }
      tallies.clear();
      if (!config.offline)
        void api
          .putStrike({ cards: Object.fromEntries(cards) })
          .catch((err) => console.warn("[strike] cards", err.message));
    }
  };

  // ── events out ──
  const toAll = <K extends "strike:ev" | "strike:show" | "strike:shot" | "strike:boom">(
    type: K,
    msg: ServerMessages[K],
  ) => {
    for (const c of room.clients as WorldClient[]) {
      const p = room.state.players.get(c.sessionId);
      if (p && (inStrikeCompound(p.x, p.y) || match?.players.has(c.sessionId))) room.send(c, type, msg);
    }
  };
  const handle = (evs: MatchEvent[]) => {
    if (!evs.length || !match) return;
    for (const e of evs) {
      tallyEvent(e);
      brainOf()?.event(e);
      if (e.e === "round") {
        nades.length = 0;
        blindTo.clear();
        placeAll();
        for (const mp of match.players.values()) lend(mp);
        // (plan 117) each side's bots buy together — eco, force, full — then their gear's lent
        brain?.buys();
        for (const mp of match.players.values()) if (mp.bot) lend(mp);
      }
      if (e.e === "respawn") {
        const mp = match.players.get(e.id);
        if (mp) {
          place(mp, Math.floor(rand() * 10));
          lend(mp);
        }
      }
      if (e.e === "kill") {
        // (plan 115 phase 94) the kill cam and the damage report, to whoever died
        const vc = clientOf(e.victim);
        const killer = match.players.get(e.by);
        const me = match.players.get(e.victim);
        if (vc && me) {
          const report = [...match.players.values()]
            .filter((q) => q.id !== me.id && ((me.dealt[q.id] ?? 0) > 0 || (q.dealt[me.id] ?? 0) > 0))
            .map((q) => ({
              name: q.name,
              dealt: Math.round(me.dealt[q.id] ?? 0),
              hits: 0,
              taken: Math.round(q.dealt[me.id] ?? 0),
            }));
          room.send(vc, "strike:death", {
            by: e.by,
            name: killer?.name ?? "",
            gun: e.gun,
            head: e.head,
            hp: killer ? Math.max(0, Math.round(killer.hp)) : 0,
            at: killer ? whereOf(killer) : null,
            report,
          });
        }
      }
      if (e.e === "level") {
        const mp = match.players.get(e.id);
        if (mp) lend(mp);
      }
      if (e.e === "half") for (const mp of match.players.values()) lend(mp);
      if (e.e === "over") endMatch();
    }
    toAll("strike:ev", evs);
  };
  const endMatch = () => {
    if (!match) return;
    // the record: the last ten, the best
    try {
      const rec = arena.record ? (JSON.parse(arena.record) as { last: unknown[] }) : { last: [] };
      const ms = [...match.players.values()].sort((a, b) => b.kills - a.kills);
      rec.last = [
        {
          map: match.map.key,
          mode: match.mode.id,
          score: match.score,
          top: ms[0]?.name ?? "",
          kills: ms[0]?.kills ?? 0,
          at: Date.now(),
        },
        ...rec.last,
      ].slice(0, 10);
      arena.record = JSON.stringify(rec);
    } catch {
      /* a bad record: started again */
      arena.record = "";
    }
    // (plan 115 phase 13) the map vote: this map and two others the mode is played on, 15 s
    const fits = STRIKE_MAPS.filter(
      (mp) => MODES[match?.mode.id ?? "competitive"].on.includes(mp.mode) && mp.key !== arena.map,
    );
    const others = fits
      .sort(() => rand() - 0.5)
      .slice(0, 2)
      .map((mp) => mp.key);
    arena.vote = [arena.map, ...others].join(",");
    arena.votes = "{}";
    arena.voteTo = Date.now() + VOTE_MS;
  };
  /** A new match on `key` in `mode` with the people kept on their sides (after the vote): the map swapped first (the
   *  show) if it's another. */
  let pending: { mode: ModeId; people: { id: string; name: string; squad: 0 | 1 }[] } | null = null;
  const again = (key: string) => {
    if (!match) return;
    const people = [...match.players.values()]
      .filter((q) => !q.bot)
      .map((q) => ({ id: q.id, name: q.name, squad: q.squad }));
    const mode = match.mode.id;
    stopMatchKeep();
    if (key !== arena.map) {
      pending = { mode, people };
      arena.next = key;
      arena.showTo = Date.now() + SHOW_MS;
      arena.up = false;
      putUp(arena.map, false);
      toAll("strike:show", { from: arena.map, to: key, ms: SHOW_MS });
    } else begin(mode, people);
  };
  /** The match made again with these people (warmup), each lent and put at a spawn. */
  const begin = (mode: ModeId, people: { id: string; name: string; squad: 0 | 1 }[]) => {
    match = newMatch(arena.map, MODES[mode].on.includes(strikeMap(arena.map).mode) ? mode : "competitive");
    for (const q of people) if (room.state.players.has(q.id)) join(match, q.id, q.name, q.squad);
    if (![...match.players.values()].length) {
      match = null;
      sync();
      return;
    }
    fillBots();
    const n = { r: 0, w: 0 };
    for (const q of match.players.values()) {
      lend(q);
      place(q, n[teamOf(match, q)]++);
    }
    arena.ready = "";
    sync();
  };
  /** The match let go, the people's pockets kept lent (they go straight into the next). */
  const stopMatchKeep = () => {
    if (!match) return;
    match = null;
    for (const [k] of room.state.npcs)
      if (k.startsWith("strike-bot:") || k.startsWith("strike-hostage:")) room.state.npcs.delete(k);
    brain = null;
    holding.clear();
    nades.length = 0;
    arena.nades.clear();
    arena.vote = "";
    arena.voteTo = 0;
    arena.votes = "";
  };
  const stopMatch = () => {
    if (!match) return;
    for (const id of match.players.keys())
      if (!isBot(id)) {
        giveBack(id);
        toLobby(clientOf(id));
      }
    match = null;
    for (const [k] of room.state.npcs)
      if (k.startsWith("strike-bot:") || k.startsWith("strike-hostage:")) room.state.npcs.delete(k);
    brain = null;
    holding.clear();
    nades.length = 0;
    arena.nades.clear();
    sync();
  };

  // ── messages ──
  room.on("strike:join", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || !inStrikeCompound(p.x, p.y)) return;
    if (!arena.up) return room.send(client, "strike:why", { why: "the crew's putting the map up" });
    if (!match) {
      const mode = MODES[String(msg?.mode ?? arena.mode) as ModeId]
        ? (String(msg?.mode ?? arena.mode) as ModeId)
        : "competitive";
      const map = strikeMap(arena.map);
      if (!MODES[mode].on.includes(map.mode))
        return room.send(client, "strike:why", { why: `${MODES[mode].name} isn't played on ${map.name}` });
      match = newMatch(map.key, mode);
    }
    if (match.players.has(client.sessionId)) return;
    const humans = [...match.players.values()].filter((q) => !q.bot);
    if (humans.length >= squadSize(match, 0) + squadSize(match, 1))
      return room.send(client, "strike:why", { why: "the match is full" });
    const want = msg?.squad === 0 || msg?.squad === 1 ? (msg.squad as 0 | 1) : emptierSquad(match);
    // (a bot gives up its place)
    const botOut = [...match.players.values()].find((q) => q.bot && q.squad === want);
    if (botOut) {
      leave(match, botOut.id);
      brain?.remove(botOut.id);
    }
    const mp = join(match, client.sessionId, p.name, want);
    fillBots();
    lend(mp);
    const n = [...match.players.values()].filter((q) => q.squad === want).length;
    place(mp, n - 1);
    sync();
  });
  room.on("strike:card", (client) => sendCard(client.sessionId));
  // (plan 115 phase 55) the kit chosen at the corner: kept on the card (saved a moment later), worn in the match
  let kitSave: ReturnType<typeof setTimeout> | null = null;
  room.on("strike:kit", (client, msg) => {
    const uid = uidOf(client.sessionId);
    if (!uid) return;
    const card = cards.get(uid) ?? newCard(room.state.players.get(client.sessionId)?.name ?? "");
    card.kit = cleanKit(msg?.kit);
    cards.set(uid, card);
    const m = arena.members.get(client.sessionId);
    if (m) m.look = card.kit;
    sendCard(client.sessionId);
    if (kitSave) clearTimeout(kitSave);
    kitSave = setTimeout(() => {
      kitSave = null;
      if (!config.offline)
        void api
          .putStrike({ cards: Object.fromEntries(cards) })
          .catch((err) => console.warn("[strike] cards", err.message));
    }, 3000);
  });
  /** Out of the match: back to the lobby yard by the desk if they're still out on the arena (each a little apart). */
  const toLobby = (c: WorldClient | undefined) => {
    const p = c ? room.state.players.get(c.sessionId) : undefined;
    if (!c || !p || p.level !== 0 || !inStrikeArena(p.x, p.y, -2)) return;
    let h = 0;
    for (const ch of c.sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const k = (h % 9) - 4;
    room.moveTo(
      c,
      p,
      { x: STRIKE_DESK.x + k * 1.6, y: STRIKE_DESK.z + 4 + ((h >> 4) % 3), level: 0 },
      { z: STRIKE_PARK.h },
    );
  };
  room.on("strike:leave", (client) => {
    // (left from the menu: back in the lobby, whether the match is still on or not — plan 115 fix)
    toLobby(client as WorldClient);
    if (!match?.players.has(client.sessionId)) return;
    tallies.delete(client.sessionId);
    leave(match, client.sessionId);
    giveBack(client.sessionId);
    if (![...match.players.values()].some((q) => !q.bot)) stopMatch();
    else {
      fillBots();
      sync();
    }
  });
  // the match's settings (plan 115 phase 1): before it starts — no match, its warmup, or after it — anyone in the
  // compound changes the mode, the bots, their level. A mode changed in warmup makes the match again with everyone
  // kept on their side (a mode its map isn't played in: refused, said why).
  room.on("strike:settings", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || !inStrikeCompound(p.x, p.y)) return;
    if (match && match.phase !== "warmup" && match.phase !== "over")
      return room.send(client, "strike:why", { why: "the match is on: change it in the warmup" });
    if (typeof msg?.fill === "boolean") arena.fill = msg.fill;
    if (msg?.level && isBotLevel(String(msg.level))) arena.level = String(msg.level);
    const mode = String(msg?.mode ?? "");
    if (mode && mode in MODES && mode !== arena.mode) {
      const map = strikeMap(arena.map);
      if (!MODES[mode as ModeId].on.includes(map.mode))
        return room.send(client, "strike:why", { why: `${MODES[mode as ModeId].name} isn't played on ${map.name}` });
      arena.mode = mode;
      if (match) {
        const people = [...match.players.values()]
          .filter((q) => !q.bot)
          .map((q) => ({ id: q.id, name: q.name, squad: q.squad }));
        brain = null;
        nades.length = 0;
        match = newMatch(map.key, mode as ModeId);
        for (const q of people) join(match, q.id, q.name, q.squad);
        fillBots();
        const n = { r: 0, w: 0 };
        for (const q of match.players.values()) {
          lend(q);
          place(q, n[teamOf(match, q)]++);
        }
      }
    }
    if (match) fillBots();
    sync();
  });
  room.on("strike:start", (client) => {
    if (!match?.players.has(client.sessionId) || match.phase !== "warmup") return;
    startMatch(match);
    handle(match.events.splice(0));
    sync();
  });
  room.on("strike:map", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || !inStrikeCompound(p.x, p.y)) return;
    const key = String(msg?.key ?? "");
    if (!STRIKE_MAPS.some((m) => m.key === key) || key === arena.map) return;
    if (match && match.phase !== "over" && match.phase !== "warmup")
      return room.send(client, "strike:why", { why: "a match is on" });
    if (arena.showTo) return;
    stopMatch();
    // the show: the old map struck (its solids gone), the arena bare, the new one up at the end
    arena.next = key;
    arena.showTo = Date.now() + SHOW_MS;
    arena.up = false;
    putUp(arena.map, false);
    toAll("strike:show", { from: arena.map, to: key, ms: SHOW_MS });
  });
  room.on("strike:buy", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!match || !p) return;
    const mp = match.players.get(client.sessionId);
    if (!mp) return;
    const [x, z] = local(p);
    const zone = inRect(match.map.buy[teamOf(match, mp)], x, z);
    const forId = String((msg as { for?: string } | undefined)?.for ?? "");
    // (plan 115 phase 36) bought for a teammate: my money, their hands
    const mate = forId && forId !== mp.id ? match.players.get(forId) : undefined;
    if (mate) {
      if (teamOf(match, mate) !== teamOf(match, mp) || !mate.alive)
        return room.send(client, "strike:why", { why: "not one of your team's" });
      const price = SHOP.find((it) => it.id === msg?.item)?.price ?? 0;
      if (mp.money < price) return room.send(client, "strike:why", { why: "not enough money" });
      if (!canBuy(match, mp, zone)) return room.send(client, "strike:why", { why: "you can't buy now" });
      const before = mate.money;
      mate.money += price;
      const why = buy(match, mate.id, String(msg?.item) as ItemId, true);
      if (why) {
        mate.money = before;
        room.send(client, "strike:why", { why: `${mate.name}: ${why}` });
      } else {
        mp.money -= price;
        lend(mate);
      }
      sync();
      return;
    }
    const why = buy(match, client.sessionId, String(msg?.item) as ItemId, zone);
    if (why) room.send(client, "strike:why", { why });
    else lend(mp);
    sync();
  });
  room.on("strike:use", (client, msg) => {
    if (!match?.players.has(client.sessionId)) return;
    if (msg?.on) holding.add(client.sessionId);
    else {
      holding.delete(client.sessionId);
      const p = room.state.players.get(client.sessionId);
      if (p) holdTick(match, client.sessionId, false, local(p), 0);
    }
    // (a hostage near: taken up)
    const p = room.state.players.get(client.sessionId);
    if (msg?.on && p) {
      const [x, z] = local(p);
      const i = match.hostages.findIndex((h) => !h.by && !h.rescued && !h.dead && Math.hypot(h.x - x, h.z - z) < 2);
      if (i >= 0) grabHostage(match, client.sessionId, i);
    }
  });
  room.on("strike:drop", (client) => {
    const p = room.state.players.get(client.sessionId);
    const mp = match?.players.get(client.sessionId);
    if (!match || !p || !mp?.bomb) return;
    const [x, z] = local(p);
    dropCharge(match, mp, x, z);
  });

  // the radio: a line to my team (and the dead of it) — our words, the client says it (strike/sound.ts RADIO)
  const radioAt = new Map<string, number>();
  room.on("strike:radio", (client, msg) => {
    const mp = match?.players.get(client.sessionId);
    const i = Number(msg?.i);
    if (!match || !mp || !Number.isInteger(i) || i < 0 || i > 9) return;
    const now = Date.now();
    if (now - (radioAt.get(client.sessionId) ?? 0) < 1200) return;
    radioAt.set(client.sessionId, now);
    // (plan 117 F8a: the bots of the side do as they're told — Follow me, Hold this spot, Go A…)
    brainOf()?.command(client.sessionId, i);
    const t = teamOf(match, mp);
    for (const q of match.players.values()) {
      if (q.bot || teamOf(match, q) !== t) continue;
      const c = clientOf(q.id);
      if (c) room.send(c, "strike:radio", { by: client.sessionId, i });
    }
  });
  room.on("strike:vote", (client, msg) => {
    if (!match?.players.has(client.sessionId) || !arena.voteTo) return;
    const key = String(msg?.key ?? "");
    if (!arena.vote.split(",").includes(key)) return;
    const v = arena.votes ? (JSON.parse(arena.votes) as Record<string, string>) : {};
    v[client.sessionId] = key;
    arena.votes = JSON.stringify(v);
  });
  // ready (plan 115 phase 14): every person in the match ready in the warmup → it starts
  room.on("strike:ready", (client, msg) => {
    if (!match?.players.has(client.sessionId) || match.phase !== "warmup") return;
    const set = new Set(arena.ready ? arena.ready.split(",") : []);
    if (msg?.on) set.add(client.sessionId);
    else set.delete(client.sessionId);
    arena.ready = [...set].join(",");
    const people = [...match.players.values()].filter((q) => !q.bot);
    if (people.length && people.every((q) => set.has(q.id))) {
      arena.ready = "";
      startMatch(match);
      handle(match.events.splice(0));
      sync();
    }
  });
  // (plan 115 phase 24, F5) the combat knife: out (slot 3: the gun away, the knife in the hand) or put back; a stab —
  // the nearest enemy in reach and in front of me, harder in the back
  const stabAt = new Map<string, number>();
  room.on("strike:knife", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    const mp = match?.players.get(client.sessionId);
    if (!p || !mp?.alive) return;
    if (msg?.on) {
      p.gun = "";
      p.held = "knife";
      p.heldAt = Date.now();
    } else if (p.held === "knife") p.held = "";
  });
  room.on("strike:stab", (client) => {
    const p = room.state.players.get(client.sessionId);
    const mp = match?.players.get(client.sessionId);
    if (!match || !p || !mp?.alive || p.held !== "knife" || frozen(match)) return;
    const now = Date.now();
    if (now - (stabAt.get(client.sessionId) ?? 0) < KNIFE.swing * 1000) return;
    stabAt.set(client.sessionId, now);
    const [x, z] = local(p);
    const yaw = (p.yaw / 256) * Math.PI * 2;
    let best: { id: string; d: number; back: boolean } | null = null;
    for (const q of match.players.values()) {
      if (!q.alive || q.id === mp.id || teamOf(match, q) === teamOf(match, mp)) continue;
      const at = whereOf(q);
      if (!at) continue;
      const dx = at[0] - x;
      const dz = at[2] - z;
      const d = Math.hypot(dx, dz);
      if (d > KNIFE.reach || Math.abs(at[1] - (p.z - STRIKE_PARK.h)) > 1.2) continue;
      const off = Math.abs(((Math.atan2(dz, dx) - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (off > KNIFE.cone) continue;
      // their facing: a bot's own, a person's byte
      const qb = brain?.view(q.id);
      const qp = room.state.players.get(q.id);
      const qyaw = qb ? qb.yaw : qp ? (qp.yaw / 256) * Math.PI * 2 : 0;
      const turned = Math.abs(((qyaw - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (!best || d < best.d) best = { id: q.id, d, back: turned < Math.PI / 3 };
    }
    toAll("strike:boom", { kind: "swing", x, y: p.z - STRIKE_PARK.h + 1.2, z });
    if (!best) return;
    hit(match, mp.id, best.id, "knife", best.back ? KNIFE.back : KNIFE.front, "body");
    handle(match.events.splice(0));
    sync();
  });
  room.on("strike:throw", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    const mp = match?.players.get(client.sessionId);
    if (!match || !p || !mp?.alive || match.phase === "freeze" || match.phase === "half" || match.phase === "over")
      return;
    const kind = String(msg?.kind) as NadeKind;
    const i = mp.nades.indexOf(kind);
    if (i < 0) return;
    mp.nades.splice(i, 1);
    const [x, z] = local(p);
    const eye: [number, number, number] = [x, p.z - STRIKE_PARK.h + 1.55, z];
    nades.push(
      throwNade(++nadeId, kind, client.sessionId, eye, Number(msg.yaw) || 0, Number(msg.pitch) || 0, !!msg.short),
    );
    lend(mp);
    sync();
  });
  // a grenade's moment: the HE's blast, the flash, the smoke out, the fire lit, the decoy's start
  const pop = (n: Nade) => {
    const m = match as Match;
    toAll("strike:boom", { kind: n.kind, x: n.x, y: n.y, z: n.z });
    if (n.kind === "he") {
      for (const q of m.players.values()) {
        if (!q.alive) continue;
        const at = whereOf(q);
        if (!at) continue;
        const d = Math.hypot(at[0] - n.x, at[1] + 1 - n.y, at[2] - n.z);
        const dmg = heDamage(d);
        if (dmg > 0 && shotThrough(m.map, [n.x, n.y + 0.2, n.z], [at[0], at[1] + 1, at[2]]).walls === 0)
          hit(m, n.by, q.id, "he", dmg, "body");
      }
      n.state = "done";
    } else if (n.kind === "flash") {
      for (const q of m.players.values()) {
        if (!q.alive) continue;
        const at = whereOf(q);
        if (!at) continue;
        const b = brain?.view(q.id);
        const p = room.state.players.get(q.id);
        // (a person's facing byte: atan2 on the floor, as the match's yaw — shared facing.ts; their pitch not
        // judged: facing it level is what counts)
        const yaw = b ? b.yaw : p ? (p.yaw / 256) * Math.PI * 2 : 0;
        const pitch = b ? b.pitch : 0;
        const secs = flashFor(m.map, [n.x, n.y, n.z], [at[0], at[1] + 1.6, at[2]], yaw, pitch);
        if (secs <= 0) continue;
        if (b) blindTo.set(q.id, m.clock + secs);
        else {
          const c = clientOf(q.id);
          if (c) room.send(c, "strike:flash", { secs });
        }
      }
      n.state = "done";
    } else if (n.kind === "smoke") {
      n.state = "smoke";
      n.left = NADE.smoke.secs;
      // (a fire in it: out)
      for (const f of nades)
        if (f.state === "fire" && Math.hypot(f.x - n.x, f.z - n.z) < NADE.smoke.r + NADE.fire.r) f.state = "done";
    } else if (n.kind === "molotov" || n.kind === "incendiary") {
      // (into a smoke: out at once)
      const smoked = nades.some((s) => s.state === "smoke" && Math.hypot(s.x - n.x, s.z - n.z) < NADE.smoke.r);
      n.state = smoked ? "done" : "fire";
      n.left = NADE.fire.secs;
    } else if (n.kind === "decoy") {
      n.state = "decoy";
      n.left = NADE.decoy.secs;
    }
  };
  /** Where someone in the match stands (local metres, feet): a bot's, or a person's. */
  const whereOf = (q: MPlayer): [number, number, number] | null => {
    const b = brain?.view(q.id);
    if (b) return [b.x, b.y, b.z];
    const p = room.state.players.get(q.id);
    if (!p) return null;
    const [x, z] = local(p);
    return [x, p.z - STRIKE_PARK.h, z];
  };
  let decoyAt = 0;
  const stepNades = (dt: number, now: number) => {
    const m = match as Match;
    for (const n of nades) {
      if (n.state === "fly") {
        n.t += dt;
        const { hitFloor } = stepNade(m.map, n, dt);
        const molly = n.kind === "molotov" || n.kind === "incendiary";
        if (
          (molly && (hitFloor || n.t > NADE.fire.fuse)) ||
          ((n.kind === "he" || n.kind === "flash") && n.t >= NADE.he.fuse)
        )
          pop(n);
        else if ((n.kind === "smoke" || n.kind === "decoy") && n.rest) pop(n);
        continue;
      }
      if (n.state === "smoke" || n.state === "fire" || n.state === "decoy") {
        n.left -= dt;
        if (n.left <= 0) n.state = "done";
      }
      if (n.state === "fire")
        for (const q of m.players.values()) {
          if (!q.alive) continue;
          const at = whereOf(q);
          if (at && Math.hypot(at[0] - n.x, at[2] - n.z) < NADE.fire.r && Math.abs(at[1] - n.y) < 1.2)
            hit(m, n.by, q.id, n.kind, NADE.fire.dps * dt, "legs");
        }
      if (n.state === "decoy" && now >= decoyAt) {
        decoyAt = now + 600 + Math.floor(rand() * 900);
        // (its shots heard as the AK's, from where it lies; aimed into the ground at its feet: no tracer to see)
        armsShot(`decoy:${n.id}`, "ak47", [n.x, n.y + 0.15, n.z], rand() * 6.28, -1.45);
      }
    }
    for (let i = nades.length - 1; i >= 0; i--) if (nades[i].state === "done") nades.splice(i, 1);
    // the room's: what's flying and what's burning
    const want = new Set(nades.map((n) => String(n.id)));
    for (const k of [...arena.nades.keys()]) if (!want.has(k)) arena.nades.delete(k);
    for (const n of nades) {
      let s = arena.nades.get(String(n.id));
      if (!s) {
        s = new StrikeNade();
        s.kind = n.kind;
        arena.nades.set(String(n.id), s);
      }
      s.state = n.state;
      s.x = n.x;
      s.y = n.y;
      s.z = n.z;
      s.left = n.left;
    }
  };

  /** A shot (a bot's, a decoy's) as the world's guns send theirs: everyone near hears and sees it (local → world). */
  const armsShot = (sid: string, gun: string, o: [number, number, number], yaw: number, pitch: number) => {
    const ox = o[0] + STRIKE_PARK.x;
    const oy = o[2] + STRIKE_PARK.z;
    const oz = o[1] + STRIKE_PARK.h;
    const msg = { sid, gun, ox, oy, oz, yaw, pitch, seed: 0, spread: 0 };
    for (const c of room.clients as WorldClient[]) {
      const p = room.state.players.get(c.sessionId);
      if (p && p.level === 0 && Math.hypot(p.x - ox, p.y - oy) < 140) room.send(c, "arms:shot", msg);
    }
  };
  // ── the hooks features/arms.ts asks ──
  const hooks: StrikeHooks = {
    claims: (sid) => !!match?.players.has(sid),
    alive: (sid) => !!match?.players.get(sid)?.alive && !frozen(match),
    hit(by, victim, gun, n, head, walls) {
      if (!match) return;
      brain?.hurt(victim, by);
      const r = hit(match, by, victim, gun, n, head ? "head" : "body", walls);
      if (r) handle(match.events.splice(0));
      sync();
    },
    along(ray, range, by) {
      if (!match) return null;
      heardBy(by, ray.x - STRIKE_PARK.x, ray.y - STRIKE_PARK.z);
      let best: { id: string; t: number; head: boolean } | null = null;
      for (const id of brain?.bots.keys() ?? []) {
        if (id === by) continue;
        const mp = match.players.get(id);
        const b = brain?.view(id);
        if (!mp?.alive || !b) continue;
        const h = b.crouch ? 1.25 : 1.8;
        const wx = b.x + STRIKE_PARK.x;
        const wy = b.z + STRIKE_PARK.z;
        const wz = b.y + STRIKE_PARK.h;
        const t = rayMeets(ray, wx, wy, wz, range, 0.1, h);
        if (t === null || (best && t >= best.t)) continue;
        const d = {
          x: Math.cos(ray.yaw) * Math.cos(ray.pitch),
          y: Math.sin(ray.yaw) * Math.cos(ray.pitch),
          z: Math.sin(ray.pitch),
        };
        const z = ray.z + d.z * t;
        best = { id, t, head: z >= wz + h * (1 - 0.3 / 1.8) };
      }
      return best;
    },
    through(a, b) {
      if (!match) return { kept: 1, walls: 0 };
      // (building coords → the map's local: x, y the plan's; z up)
      const la: [number, number, number] = [a.x - STRIKE_PARK.x, a.z - STRIKE_PARK.h, a.y - STRIKE_PARK.z];
      const lb: [number, number, number] = [b.x - STRIKE_PARK.x, b.z - STRIKE_PARK.h, b.y - STRIKE_PARK.z];
      return shotThroughMap(la, lb);
    },
  };
  const shotThroughMap = (a: [number, number, number], b: [number, number, number]) =>
    shotThrough((match as Match).map, a, b);
  room.strike = hooks;

  return {
    tick(dt, now) {
      // (plan 117) the bots' knowledge of the map that's up (or coming up) readied ahead of any match: a little a
      // tick — less while a match is live
      if (arena.map) {
        const live = !!match && (match.phase === "live" || match.phase === "planted");
        warmKnow(strikeMap(arena.next || arena.map), live ? 3 : 10);
      }
      // the swap's show
      if (arena.showTo && now >= arena.showTo) {
        arena.showTo = 0;
        arena.map = arena.next || arena.map;
        arena.next = "";
        arena.up = true;
        // (whoever's out on the bare arena is shown back to the lobby yard first: the new map's walls and
        // containers come up where they stood — never round them)
        for (const c of room.clients as WorldClient[]) {
          const p = room.state.players.get(c.sessionId);
          if (!p || p.level !== 0 || !inStrikeArena(p.x, p.y, -2)) continue;
          const k = (c.sessionId.charCodeAt(0) % 9) - 4;
          room.moveTo(c, p, { x: STRIKE_DESK.x + k * 1.6, y: STRIKE_DESK.z + 5, level: 0 }, { z: STRIKE_PARK.h });
        }
        putUp(arena.map, true);
        toAll("strike:show", { done: arena.map });
        // (a match waiting for this map: its people back in at a warmup)
        if (pending) {
          const p = pending;
          pending = null;
          begin(p.mode, p.people);
        }
      }
      // the vote closes: the most votes (a tie, a draw of them; none, the map stays)
      if (arena.voteTo && now >= arena.voteTo && match) {
        const v = arena.votes ? (JSON.parse(arena.votes) as Record<string, string>) : {};
        const n = new Map<string, number>();
        for (const k of Object.values(v)) n.set(k, (n.get(k) ?? 0) + 1);
        const most = Math.max(0, ...n.values());
        const top = [...n.entries()].filter(([, c]) => c === most).map(([k]) => k);
        const key = top.length ? top[Math.floor(rand() * top.length)] : arena.map;
        arena.voteTo = 0;
        again(key);
      }
      if (!match) return;
      const m = match;
      // people: their places for the charge, the hostages; walking over a dropped charge; leaving the arena
      for (const mp of m.players.values()) {
        if (mp.bot) continue;
        const p = room.state.players.get(mp.id);
        if (!p) continue;
        if (!inStrikeCompound(p.x, p.y) && m.phase !== "warmup") {
          // (walked out of the gate: out of the match, the pockets back)
          leave(m, mp.id);
          giveBack(mp.id);
          continue;
        }
        if (!mp.alive) continue;
        if (p.gun && p.held === "knife") p.held = "";
        const at = local(p);
        if (holding.has(mp.id) || m.charge?.planter === mp.id || m.charge?.defuser === mp.id)
          holdTick(m, mp.id, holding.has(mp.id) && inArena(p), at, dt);
        if (mp.carry >= 0) carryTick(m, mp.id, at);
        if (m.charge?.state === "dropped" && Math.hypot(m.charge.x - at[0], m.charge.z - at[1]) < 1.2)
          pickCharge(m, mp.id);
        // (a fall off something high, or out of the arena's pad: the world's — not counted here)
      }
      // the bots (plan 117: one driver — shared strike/bots — its knowledge worked out a little a tick till it's there)
      botAcc += dt;
      if (botAcc >= 1 / BOT_HZ) {
        const step = botAcc;
        botAcc = 0;
        brainOf()?.step(step);
      }
      // the charge goes where its carrier goes (so it falls where they fall)
      if (m.charge?.state === "carried")
        for (const q of m.players.values()) {
          if (!q.bomb) continue;
          const b = brain?.view(q.id);
          const p = room.state.players.get(q.id);
          const at = b ? [b.x, b.z] : p ? local(p) : null;
          if (at) [m.charge.x, m.charge.z] = at;
        }
      stepNades(dt, now);
      handle(tick(m, dt));
      if (match) sync();
    },
    leave(client) {
      if (!match?.players.has(client.sessionId)) return;
      leave(match, client.sessionId);
      giveBack(client.sessionId);
      if (![...match.players.values()].some((q) => !q.bot)) stopMatch();
    },
    drop(client) {
      // (a dropped line: their place kept a while — the world's own; their pockets are survival's to save
      // as their own, never the park's)
      void client;
    },
    dispose() {
      if (room.strike === hooks) room.strike = null;
    },
  };
});
