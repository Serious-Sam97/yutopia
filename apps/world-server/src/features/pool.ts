import { type PoolShot, simulate } from "@yutopia/shared/pool";
import {
  isPoolLevel,
  judge,
  newGame,
  onTheEight,
  type PoolGame,
  type PoolLevel,
  packBalls,
  packGame,
  placeCue,
  unpackGame,
  type VortexShot,
  vortexBreak,
  vortexThink,
} from "@yutopia/shared/pool-game";
import { TABLE_REACH, TABLE_WALK_AWAY, tableAway } from "@yutopia/shared/tables";
import { config } from "../config.ts";
import { fromSchema, type SpaceClient, type SpaceRoom, toSchema } from "../SpaceRoom.ts";
import { PoolSeat, PoolTable } from "../schema.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Pool tables (8-ball, shared/pool.ts + pool-game.ts). Two seats — people, or
// Vortex at a level in one of them (a Vortex for every table: each game gets
// its own). The shooter aims (streamed so everyone sees the cue move), shoots;
// we run the shot through the physics from the layout everyone has, judge it,
// and publish the shot + the new layout: every client replays the same shot
// and eases to our layout at the end. Vortex thinks on the server in slices
// (a few ms a tick) and shoots through the same path. Walking away from the
// table gives your seat back (mid-game: the other player wins).

const THINK_MS = 9; // Vortex's thinking per tick
const VORTEX_PAUSE = 1100; // he looks at the table a moment before thinking
const VORTEX_DRAW = 900; // and draws the cue back before he shoots
const RESULT_MS = 7000; // the result stays up
const MAX_GAME_MS = 45 * 60_000;
const CLOCKS = [0, 30, 60];
const GUIDES = ["long", "short", "pro"];
const RECORD_KEEP = 10;

interface Mind {
  think: Generator<void, VortexShot> | null;
  plan: VortexShot | null;
  shootAt: number;
  sweep: number; // his aim wandering while he thinks
}

registerFeature((room: SpaceRoom) => {
  const minds = new Map<string, Mind>();
  const mind = (id: string): Mind => {
    let m = minds.get(id);
    if (!m) {
      m = { think: null, plan: null, shootAt: 0, sweep: 0 };
      minds.set(id, m);
    }
    return m;
  };
  const table = (id: string) => {
    const o = room.state.objects.get(id);
    return o?.kind === "pool_table" ? o : undefined;
  };
  const away = (id: string, sid: string) => {
    const o = table(id);
    const p = room.state.players.get(sid);
    return o && p ? tableAway(o, p.x, p.y) : Number.POSITIVE_INFINITY;
  };
  const warn = (c: SpaceClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const seatOf = (t: PoolTable, sid: string): 0 | 1 | -1 => {
    for (const [k, s] of t.seats) if (s.sid === sid && !s.vortex) return Number(k) as 0 | 1;
    return -1;
  };
  const gameOf = (t: PoolTable): PoolGame | null => unpackGame(t.game);
  const vortexIn = (t: PoolTable, seat: number) => t.seats.get(String(seat))?.vortex ?? "";
  const nameIn = (t: PoolTable, seat: number) => {
    const s = t.seats.get(String(seat));
    return s ? (s.vortex ? "Vortex" : s.name) : "";
  };
  const save = async (o: ReturnType<typeof fromSchema>) => {
    const saved = config.offline ? o : (await yondra.putObject(room.spaceId, o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };

  // the table's chalkboard: the last games and wins per player, kept with the table
  const record = (id: string, winner: string, loser: string, how: string) => {
    const o = table(id);
    if (!o) return;
    const def = fromSchema(o);
    const props = (def.props ?? {}) as Record<string, unknown>;
    const old = (props.record ?? {}) as { last?: unknown[]; wins?: Record<string, number> };
    const last = [{ w: winner, l: loser, how, at: Date.now() }, ...(Array.isArray(old.last) ? old.last : [])].slice(
      0,
      RECORD_KEEP,
    );
    const wins = { ...(old.wins ?? {}) };
    wins[winner] = (wins[winner] ?? 0) + 1;
    void save({ ...def, props: { ...props, record: { last, wins } } });
  };

  const toLobby = (t: PoolTable) => {
    t.phase = "lobby";
    t.aim = "";
  };

  // A shot: from the layout everyone has, through the physics, judged.
  const play = (id: string, t: PoolTable, game: PoolGame, shot: PoolShot, called: number, clock = false) => {
    const now = Date.now();
    // exactly the layout the clients have (packed, rounded): they replay this shot from it
    const g = unpackGame(packGame(game)) as PoolGame;
    const seat = g.turn;
    const res = clock ? null : simulate(g.balls, shot);
    const v = judge(g, res?.balls ?? g.balls, res?.events ?? [], called, clock);
    t.before = JSON.stringify(packBalls(g.balls));
    t.game = packGame(v.game);
    t.shot = clock ? "" : JSON.stringify({ ...shot, called, seat });
    t.shotNo = (t.shotNo + 1) & 0xffff;
    t.shotAt = now;
    t.until = now + Math.round((res?.duration ?? 0) * 1000) + 250;
    t.result = JSON.stringify({
      no: t.shotNo,
      seat,
      foul: v.foul,
      potted: v.potted,
      outcome: v.outcome,
      assigned: v.assigned,
      respotted: v.respotted,
      keeps: v.keeps,
      winner: v.game.winner,
      miscue: res?.miscue ?? false,
    });
    t.aim = "";
    t.turnAt = t.until;
    const m = mind(id);
    m.think = null;
    m.plan = null;
    if (v.game.winner >= 0) {
      t.phase = "done";
      record(id, nameIn(t, v.game.winner), nameIn(t, 1 - v.game.winner), v.outcome ?? "win");
    }
  };

  const leaveSeat = (id: string, t: PoolTable, seat: number) => {
    t.seats.delete(String(seat));
    if (t.phase === "play") {
      // walked out mid-game: the other side wins (if anyone's there)
      const g = gameOf(t);
      const other = 1 - seat;
      if (g && t.seats.has(String(other))) {
        g.winner = other as 0 | 1;
        t.game = packGame(g);
        t.result = JSON.stringify({ no: t.shotNo, seat, outcome: "left", winner: other });
        t.phase = "done";
        t.until = Date.now();
        record(id, nameIn(t, other), "", "left");
      } else toLobby(t);
    }
    // nobody but Vortex: he goes too
    if ([...t.seats.values()].every((s) => s.vortex)) t.seats.clear();
    minds.delete(id);
  };

  room.on("pool:sit", (client, m) => {
    const id = String(m?.id ?? "");
    const seat = Number(m?.seat);
    const p = room.state.players.get(client.sessionId);
    if (!p || !table(id) || (seat !== 0 && seat !== 1)) return;
    if (away(id, client.sessionId) > TABLE_REACH) return warn(client, "Get closer to the table to play.");
    let t = room.state.pool.get(id);
    if (!t) {
      t = new PoolTable();
      room.state.pool.set(id, t);
    }
    if (t.phase === "play") return warn(client, "Wait for this game to finish.");
    const taken = t.seats.get(String(seat));
    if (taken && taken.sid !== client.sessionId && !taken.vortex) return warn(client, `${taken.name} is playing.`);
    // one seat (and one table) at a time
    for (const [tid, other] of room.state.pool) {
      const mine = seatOf(other, client.sessionId);
      if (mine >= 0 && (tid !== id || mine !== seat)) other.seats.delete(String(mine));
    }
    const s = new PoolSeat();
    s.sid = client.sessionId;
    s.uid = p.uid;
    s.name = p.name;
    t.seats.set(String(seat), s);
    if (t.phase === "done") toLobby(t);
  });

  room.on("pool:leave", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pool.get(id);
    const seat = t ? seatOf(t, client.sessionId) : -1;
    if (t && seat >= 0) leaveSeat(id, t, seat);
  });

  room.on("pool:vortex", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pool.get(id);
    if (!t || t.phase === "play") return;
    const seat = seatOf(t, client.sessionId);
    if (seat < 0) return warn(client, "Take a seat first.");
    const other = String(1 - seat);
    if (m?.level == null) {
      if (t.seats.get(other)?.vortex) t.seats.delete(other);
      return;
    }
    if (!isPoolLevel(m.level)) return;
    const there = t.seats.get(other);
    if (there && !there.vortex) return warn(client, `${there.name} is in the other seat.`);
    const s = new PoolSeat();
    s.name = "Vortex";
    s.vortex = m.level;
    t.seats.set(other, s);
    if (t.phase === "done") toLobby(t);
  });

  room.on("pool:start", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pool.get(id);
    if (!t || t.phase === "play" || seatOf(t, client.sessionId) < 0) return;
    if (!t.seats.has("0") || !t.seats.has("1")) return warn(client, "Two players needed — or play Vortex.");
    const clock = Number(m?.clock);
    t.clock = CLOCKS.includes(clock) ? clock : 0;
    t.guide = GUIDES.includes(String(m?.guide)) ? String(m?.guide) : "short";
    const g = newGame(Math.floor(Math.random() * 2 ** 31), (t.breaker & 1) as 0 | 1);
    t.breaker = (t.breaker + 1) & 1;
    // the layout everyone has is the packed one: the server plays from it too
    t.game = packGame(g);
    t.before = "";
    t.shot = "";
    t.result = "";
    t.aim = "";
    t.until = Date.now();
    t.turnAt = Date.now();
    t.phase = "play";
    t.by = room.state.players.get(client.sessionId)?.name ?? "";
    minds.delete(id);
  });

  const myTurn = (client: SpaceClient, id: string): { t: PoolTable; g: PoolGame } | null => {
    const t = room.state.pool.get(id);
    if (!t || t.phase !== "play") return null;
    const g = gameOf(t);
    if (!g || seatOf(t, client.sessionId) !== g.turn || Date.now() < t.until) return null;
    return { t, g };
  };

  room.on("pool:aim", (client, m) => {
    const id = String(m?.id ?? "");
    const mine = myTurn(client, id);
    if (!mine) return;
    const num = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
    const aim: Record<string, number | boolean> = {
      a: num(m.a, -10, 10),
      p: num(m.p, 0, 1),
      sx: num(m.sx, -1, 1),
      sy: num(m.sy, -1, 1),
    };
    if (m.cx != null && m.cy != null) {
      aim.cx = num(m.cx, -1.2, 1.2);
      aim.cy = num(m.cy, -0.6, 0.6);
    }
    if (m.drag) aim.drag = true;
    mine.t.aim = JSON.stringify(aim);
  });

  room.on("pool:place", (client, m) => {
    const id = String(m?.id ?? "");
    const mine = myTurn(client, id);
    if (!mine || !mine.g.inHand) return;
    if (!placeCue(mine.g, Number(m.x), Number(m.y))) return warn(client, "The cue ball can't go there.");
    mine.t.game = packGame(mine.g);
  });

  room.on("pool:shot", (client, m) => {
    const id = String(m?.id ?? "");
    const mine = myTurn(client, id);
    if (!mine) return;
    const shot: PoolShot = {
      angle: Number(m.angle),
      power: Math.max(0, Math.min(1, Number(m.power))),
      spinX: Math.max(-1, Math.min(1, Number(m.spinX) || 0)),
      spinY: Math.max(-1, Math.min(1, Number(m.spinY) || 0)),
    };
    if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power)) return;
    const called = Number.isInteger(m.called) && m.called >= 0 && m.called < 6 ? m.called : -1;
    if (onTheEight(mine.g) && called < 0) return warn(client, "Call a pocket for the 8 first.");
    play(id, mine.t, mine.g, shot, called);
  });

  room.on("pool:concede", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pool.get(id);
    const seat = t ? seatOf(t, client.sessionId) : -1;
    if (!t || seat < 0 || t.phase !== "play") return;
    const g = gameOf(t);
    if (!g) return;
    g.winner = (1 - seat) as 0 | 1;
    t.game = packGame(g);
    t.result = JSON.stringify({ no: t.shotNo, seat, outcome: "conceded", winner: g.winner });
    t.phase = "done";
    t.until = Date.now();
    record(id, nameIn(t, g.winner), nameIn(t, seat), "conceded");
  });

  // Vortex's turn: look, think (in slices), draw the cue back, shoot.
  const vortexTurn = (id: string, t: PoolTable, g: PoolGame, level: PoolLevel, now: number) => {
    const m = mind(id);
    if (now < t.until + VORTEX_PAUSE) return;
    const cue = g.balls.find((b) => b.id === 0);
    if (!m.plan && !m.think) {
      m.think = g.broken ? vortexThink(g, level, (t.shotNo * 7919 + now) | 0) : null;
      if (!g.broken && cue) m.plan = { shot: vortexBreak(level, now | 0, cue), called: -1, target: -1 };
      m.sweep = Math.atan2(-(cue?.y ?? 0), -(cue?.x ?? 0));
    }
    if (m.think) {
      const stop = performance.now() + THINK_MS;
      while (performance.now() < stop) {
        const s = m.think.next();
        if (s.done) {
          m.plan = s.value;
          m.think = null;
          break;
        }
      }
      // his cue wanders over the table while he thinks
      m.sweep += 0.035;
      t.aim = JSON.stringify({ a: m.sweep, p: 0, sx: 0, sy: 0 });
      if (m.plan) m.shootAt = now + VORTEX_DRAW;
      return;
    }
    if (!m.plan) return;
    if (!m.shootAt) m.shootAt = now + VORTEX_DRAW;
    if (m.plan.place) {
      placeCue(g, m.plan.place.x, m.plan.place.y);
      t.game = packGame(g);
      m.plan = { ...m.plan, place: undefined };
    }
    // drawing the cue back, then through
    const left = Math.max(0, m.shootAt - now) / VORTEX_DRAW;
    t.aim = JSON.stringify({
      a: m.plan.shot.angle,
      p: m.plan.shot.power * (1 - left),
      sx: m.plan.shot.spinX,
      sy: m.plan.shot.spinY,
    });
    if (now >= m.shootAt) {
      const plan = m.plan;
      m.shootAt = 0;
      play(id, t, g, plan.shot, plan.called);
    }
  };

  return {
    tick(_dt, now) {
      for (const [id, t] of room.state.pool) {
        if (!table(id)) {
          room.state.pool.delete(id);
          minds.delete(id);
          continue;
        }
        // who walked away (or left) gives the seat back
        for (const [k, s] of [...t.seats]) {
          if (s.vortex) continue;
          if (!room.state.players.has(s.sid) || away(id, s.sid) > TABLE_WALK_AWAY) leaveSeat(id, t, Number(k));
        }
        if (t.phase === "done" && now - t.until > RESULT_MS && !t.seats.size) toLobby(t);
        if (t.phase !== "play") continue;
        const g = gameOf(t);
        if (!g) {
          toLobby(t);
          continue;
        }
        if (now - t.turnAt > MAX_GAME_MS) {
          toLobby(t);
          continue;
        }
        const level = vortexIn(t, g.turn);
        if (level && isPoolLevel(level)) {
          vortexTurn(id, t, g, level, now);
          continue;
        }
        // the shot clock
        if (t.clock && now >= t.until && now - t.turnAt > t.clock * 1000)
          play(id, t, g, { angle: 0, power: 0, spinX: 0, spinY: 0 }, -1, true);
      }
    },
    leave(client) {
      for (const [id, t] of room.state.pool) {
        const seat = seatOf(t, client.sessionId);
        if (seat >= 0) leaveSeat(id, t, seat);
      }
    },
  };
});
