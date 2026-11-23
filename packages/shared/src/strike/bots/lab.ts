// The bot lab (docs/plan/117-bot-brains.md, phase 0, F10a): a whole match of bots in simulated time — the same driver
// the server runs — and what it shows, measured: the radio (lines, repeats), the bunching, deaths not looking at the
// killer, plants and defuses, trades, standing about, the plays, the side balance, what a bot's step costs.

import { gridOf, nodeNear, nodePos } from "../grid.ts";
import type { Team } from "../map.ts";
import { hit, join, type Match, newMatch, squadSize, startMatch, teamOf, tick } from "../match.ts";
import { flashFor, heDamage, NADE, type Nade, stepNade, throwNade } from "../nades.ts";
import type { ModeId } from "../rules.ts";
import { spawnPoint } from "../spawn.ts";
import { wrap } from "./aim.ts";
import { Bots } from "./drive.ts";
import type { BotLevel } from "./level.ts";

export interface LabOpts {
  map: string;
  mode?: ModeId;
  /** each squad's level (squad 0 starts as the Raiders) */
  levels?: [BotLevel, BotLevel];
  /** a side's size */
  size?: number;
  seed?: number;
  /** simulated minutes at most */
  minutes?: number;
  /** stop after this many rounds */
  rounds?: number;
  /** each step, for the dev page's playback */
  onStep?: (m: Match, bots: Bots, nades: Nade[]) => void;
  /** keep a frame every quarter second (the dev page's playback) */
  record?: boolean;
  /** everyone's money each round (both sides on a full buy: the tactics measured without the economy) */
  money?: number;
}
/** A moment of a lab match (the dev page draws it). */
export interface LabFrame {
  t: number;
  round: number;
  phase: string;
  bots: {
    id: string;
    team: Team;
    x: number;
    z: number;
    yaw: number;
    alive: boolean;
    hp: number;
    kind: string;
    why: string;
    on: string;
    crouch: boolean;
    still: boolean;
    path: [number, number][];
  }[];
  nades: { kind: string; state: string; x: number; z: number }[];
  charge: { x: number; z: number; state: string } | null;
  plays: Record<Team, string>;
}
export interface LabResult {
  map: string;
  over: boolean;
  rounds: number;
  why: Record<string, number>;
  /** rounds won by side, and by squad */
  sides: Record<Team, number>;
  squads: [number, number];
  /** radio lines a side says a round (what one player hears), and the same words said again by a side within 10 s */
  linesPerRound: number;
  repeats: number;
  /** share of live time with 3+ of a side each within 4 m of two of its mates */
  bunched: number;
  /** mean distance to the nearest mate (m) */
  nearest: number;
  /** deaths of a bot not looking toward its killer (> 60° off) */
  blindDeaths: number;
  /** bomb rounds with a plant */
  plantShare: number;
  /** kills answered by a teammate of the fallen within 5 s */
  tradeShare: number;
  /** share of alive time standing about with nothing to do (no fight, no spot held, not moving, > 2 s) */
  idle: number;
  /** plays picked, per side's first call */
  plays: Record<string, number>;
  /** grenades thrown a round */
  nadesPerRound: number;
  /** a bot's step (ms) */
  stepMs: number;
  /** stuck > 3 s, times */
  stuck: number;
  /** shots (pellets) fired, and that met someone */
  fired: number;
  hits: number;
  log: string[];
  frames: LabFrame[];
}

/** The mode a map's played in by default (its own: Wingman's 2 v 2, the Range's Deathmatch, else Competitive). */
export function labMode(map: string): { mode: ModeId; size: number } {
  const m = newMatch(map, "competitive");
  if (m.map.mode === "wingman") return { mode: "wingman", size: 2 };
  if (m.map.mode === "range") return { mode: "deathmatch", size: 4 };
  return { mode: "competitive", size: 5 };
}
export function lab(o: LabOpts): LabResult {
  const def = labMode(o.map);
  const m: Match = newMatch(o.map, o.mode ?? def.mode);
  const size = o.size ?? def.size;
  let seed = o.seed ?? 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const levels = o.levels ?? ["normal", "normal"];
  const ids: string[] = [];
  // (a squad's size: the mode's own split when it has one — Retakes' 4 Raiders, 3 Wardens —, else `size` each)
  const sizes = [0, 1].map((q) => (m.mode.maxW && o.size === undefined ? squadSize(m, q as 0 | 1) : size));
  for (let i = 0; i < size * 2; i++) {
    const squad = (i % 2) as 0 | 1;
    if (Math.floor(i / 2) >= sizes[squad]) continue;
    const id = `bot:${squad}${Math.floor(i / 2)}`;
    join(m, id, id, squad, true);
    ids.push(id);
  }
  startMatch(m);
  const nades: Nade[] = [];
  const blind = new Map<string, number>();
  const log: string[] = [];
  let nadeId = 0;
  let thrown = 0;
  const said: { t: Team; text: string; at: number }[] = [];
  let lines = 0;
  let repeats = 0;
  let fired = 0;
  let hits = 0;
  const bots: Bots = new Bots(m, {
    rand,
    level: (id) => levels[Number(id.charAt(4)) as 0 | 1] ?? "normal",
    other: () => null,
    smokes: () => nades.filter((n) => n.state === "smoke"),
    blindTo: (id) => blind.get(id) ?? 0,
    shot: (by, s) => {
      fired++;
      if (!s.victim) return;
      hits++;
      bots.hurt(s.victim, by);
      hit(m, by, s.victim, s.gun, s.dmg, s.head ? "head" : "body", s.walls);
    },
    nade: (by, kind, eye, yaw, pitch, short) => {
      nades.push(throwNade(++nadeId, kind, by, eye, yaw, pitch, short));
      thrown++;
    },
    say: (by, text, t) => {
      lines++;
      if (said.some((q) => q.t === t && q.text === text && m.clock - q.at < 10)) repeats++;
      said.push({ t, text, at: m.clock });
      if (log.length < 4000) log.push(`${m.round}:${m.clock.toFixed(1)} ${t} ${by}: ${text}`);
    },
    budget: () => 1e9,
  });
  for (const id of ids) bots.add(id);
  const g = gridOf(m.map);
  const placeAll = () => {
    if (o.money !== undefined) for (const id of ids) m.players.get(id)!.money = o.money;
    const n = { r: 0, w: 0 };
    for (const id of ids) {
      const p = m.players.get(id);
      if (!p) continue;
      const t = teamOf(m, p);
      const [x, y, z] = spawnPoint(m, t, n[t]++);
      bots.place(id, x, y, z);
    }
    bots.buys();
  };
  placeAll();
  // metrics
  const dt = 1 / 20;
  let liveSteps = 0;
  let bunchedSteps = 0;
  let nnSum = 0;
  let nnN = 0;
  let deaths = 0;
  let blindDeaths = 0;
  let kills = 0;
  let traded = 0;
  let aliveSteps = 0;
  let idleSteps = 0;
  let stuck = 0;
  let rounds = 0;
  let bombRounds = 0;
  let plantRounds = 0;
  let planted = false;
  const why: Record<string, number> = {};
  const sides: Record<Team, number> = { r: 0, w: 0 };
  const plays: Record<string, number> = {};
  const idleFor = new Map<string, number>();
  const recentKills: { by: string; victim: string; at: number; byTeam: Team }[] = [];
  let playsSeen = false;
  const maxSteps = (o.minutes ?? 40) * 60 * 20;
  const frames: LabFrame[] = [];
  for (let step = 0; step < maxSteps && m.phase !== "over"; step++) {
    bots.step(dt);
    // grenades
    for (const n of nades) {
      if (n.state === "fly") {
        n.t += dt;
        const { hitFloor } = stepNade(m.map, n, dt);
        const molly = n.kind === "molotov" || n.kind === "incendiary";
        if (
          (molly && (hitFloor || n.t > NADE.fire.fuse)) ||
          ((n.kind === "he" || n.kind === "flash") && n.t >= NADE.he.fuse)
        ) {
          if (molly) {
            n.state = nades.some((s) => s.state === "smoke" && Math.hypot(s.x - n.x, s.z - n.z) < NADE.smoke.r)
              ? "done"
              : "fire";
            n.left = NADE.fire.secs;
          } else {
            for (const id of ids) {
              const p = m.players.get(id);
              const v = bots.view(id);
              if (!p?.alive || !v) continue;
              if (n.kind === "flash") {
                const secs = flashFor(m.map, [n.x, n.y, n.z], [v.x, v.y + 1.6, v.z], v.yaw, v.pitch);
                if (secs > 0) blind.set(id, m.clock + secs);
              } else {
                const d = Math.hypot(v.x - n.x, v.y + 1 - n.y, v.z - n.z);
                const dmg = heDamage(d);
                if (dmg > 0) hit(m, n.by, id, "he", dmg, "body");
              }
            }
            n.state = "done";
          }
        } else if ((n.kind === "smoke" || n.kind === "decoy") && n.rest) {
          n.state = n.kind === "smoke" ? "smoke" : "done";
          n.left = NADE.smoke.secs;
        }
        continue;
      }
      if (n.state === "smoke" || n.state === "fire") {
        n.left -= dt;
        if (n.left <= 0) n.state = "done";
      }
      if (n.state === "fire")
        for (const id of ids) {
          const p = m.players.get(id);
          const v = bots.view(id);
          if (p?.alive && v && Math.hypot(v.x - n.x, v.z - n.z) < NADE.fire.r && Math.abs(v.y - n.y) < 1.2)
            hit(m, n.by, id, n.kind, NADE.fire.dps * dt, "legs");
        }
    }
    for (let i = nades.length - 1; i >= 0; i--) if (nades[i].state === "done") nades.splice(i, 1);
    // measures, while live
    if (m.phase === "live" || m.phase === "planted") {
      liveSteps++;
      if (!playsSeen && bots.liveAt >= 0) {
        playsSeen = true;
        for (const t of ["r", "w"] as Team[])
          plays[`${t}:${bots.sides[t].play || "?"}`] = (plays[`${t}:${bots.sides[t].play || "?"}`] ?? 0) + 1;
      }
      for (const t of ["r", "w"] as Team[]) {
        const al = ids
          .filter((id) => m.players.get(id)?.alive && teamOf(m, m.players.get(id)!) === t)
          .map((id) => bots.view(id)!);
        let crowd = 0;
        for (const a of al) {
          let nn = Number.POSITIVE_INFINITY;
          let near = 0;
          for (const c of al)
            if (c !== a) {
              const d = Math.hypot(a.x - c.x, a.z - c.z);
              nn = Math.min(nn, d);
              if (d < 4) near++;
            }
          if (Number.isFinite(nn)) {
            nnSum += nn;
            nnN++;
          }
          if (near >= 2) crowd++;
        }
        if (crowd >= 3) bunchedSteps++;
      }
      for (const id of ids) {
        const p = m.players.get(id);
        const b = bots.bots.get(id);
        if (!p?.alive || !b) continue;
        aliveSteps++;
        const sp = Math.hypot(b.feet.vx, b.feet.vz);
        const idle = !b.fighting && !b.holdStill && !b.using && !b.throwing && sp < 0.1;
        const f = idle ? (idleFor.get(id) ?? 0) + dt : 0;
        idleFor.set(id, f);
        if (f > 2) idleSteps++;
        if (b.feet.stuck > 3) {
          stuck++;
          b.feet.stuck = 0;
        }
      }
    }
    for (const e of tick(m, dt)) {
      bots.event(e);
      if (e.e === "kill") {
        kills++;
        const v = bots.bots.get(e.victim);
        const kv = bots.view(e.by);
        const vv = bots.view(e.victim);
        if (v && kv && vv) {
          deaths++;
          const a = Math.atan2(kv.z - vv.z, kv.x - vv.x);
          if (Math.abs(wrap(a - vv.yaw)) > 1.05) blindDeaths++;
        }
        const vp = m.players.get(e.victim);
        const bp = m.players.get(e.by);
        if (vp && bp) {
          // (a trade: the fallen's side kills this killer within 5 s)
          const vt = teamOf(m, vp);
          if (recentKills.some((q) => q.victim === e.by && false)) traded++;
          for (const q of recentKills)
            if (q.by === e.victim && teamOf(m, bp) !== q.byTeam && m.clock - q.at < 5) traded++;
          recentKills.push({ by: e.by, victim: e.victim, at: m.clock, byTeam: teamOf(m, bp) });
          void vt;
        }
      }
      if (e.e === "planted") planted = true;
      if (e.e === "win") {
        rounds++;
        why[e.why] = (why[e.why] ?? 0) + 1;
        sides[e.team]++;
        if (m.map.sites) {
          bombRounds++;
          if (planted) plantRounds++;
        }
        planted = false;
        if (o.rounds && rounds >= o.rounds) step = maxSteps;
      }
      if (e.e === "round") {
        placeAll();
        nades.length = 0;
        blind.clear();
        playsSeen = false;
        idleFor.clear();
      }
      if (e.e === "respawn") {
        const p = m.players.get(e.id);
        if (p) {
          const t = teamOf(m, p);
          const sp = m.map.spawns[t][Math.floor(rand() * m.map.spawns[t].length)];
          const k = nodeNear(g, sp[0], sp[1]);
          bots.place(e.id, sp[0], k >= 0 ? nodePos(g, k)[1] : 0, sp[1]);
        }
      }
    }
    o.onStep?.(m, bots, nades);
    if (o.record && step % 5 === 0 && bots.k) {
      const k = bots.k;
      frames.push({
        t: m.clock,
        round: m.round,
        phase: m.phase,
        bots: ids.map((id) => {
          const b = bots.bots.get(id)!;
          const p = m.players.get(id)!;
          const path: [number, number][] = [];
          for (let i = b.feet.pi; i < b.feet.path.length; i += 8) {
            const q = nodePos(k.g, b.feet.path[i]);
            path.push([Math.round(q[0] * 10) / 10, Math.round(q[2] * 10) / 10]);
          }
          return {
            id,
            team: teamOf(m, p),
            x: Math.round(b.feet.x * 100) / 100,
            z: Math.round(b.feet.z * 100) / 100,
            yaw: Math.round(b.aim.yaw * 100) / 100,
            alive: p.alive,
            hp: p.hp,
            kind: b.order?.kind ?? "",
            why: b.order?.why ?? "",
            on: b.fighting,
            crouch: b.crouch,
            still: b.holdStill,
            path,
          };
        }),
        nades: nades.map((n) => ({ kind: n.kind, state: n.state, x: n.x, z: n.z })),
        charge: m.charge ? { x: m.charge.x, z: m.charge.z, state: m.charge.state } : null,
        plays: { r: bots.sides.r.play, w: bots.sides.w.play },
      });
    }
  }
  return {
    map: o.map,
    over: m.phase === "over",
    rounds,
    why,
    sides,
    squads: [m.score[0], m.score[1]],
    linesPerRound: lines / 2 / Math.max(1, rounds),
    repeats,
    bunched: bunchedSteps / Math.max(1, liveSteps * 2),
    nearest: nnSum / Math.max(1, nnN),
    blindDeaths: blindDeaths / Math.max(1, deaths),
    plantShare: plantRounds / Math.max(1, bombRounds),
    tradeShare: traded / Math.max(1, kills),
    idle: idleSteps / Math.max(1, aliveSteps),
    plays,
    nadesPerRound: thrown / Math.max(1, rounds),
    stepMs: bots.stepMs,
    stuck,
    fired,
    hits,
    log,
    frames,
  };
}
