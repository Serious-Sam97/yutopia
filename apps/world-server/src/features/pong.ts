import type { ServerMessages } from "@yutopia/shared";
import {
  ballAt,
  cpuPlan,
  cpuServe,
  flightEnd,
  flightEvents,
  isPongLevel,
  newMatch,
  newRally,
  type PongBall,
  type PongFlight,
  type PongLevel,
  type PongScore,
  plausibleHit,
  type RacketAt,
  type Rally,
  type RallyEvent,
  rallyStep,
  scorePoint,
  seeded,
  serveToss,
} from "@yutopia/shared/pong";
import { TABLE_REACH, TABLE_WALK_AWAY, tableAway } from "@yutopia/shared/tables";
import { config } from "../config.ts";
import { fromSchema, type WorldClient, type WorldRoom, toSchema } from "../WorldRoom.ts";
import { PongSeat, PongTable } from "../schema.ts";
import { api } from "../api.ts";
import { registerFeature } from "./index.ts";

// Ping-pong tables. A match between two seats — people, or Vortex at a level
// (each match its own Vortex). The ball is always one flight: an event the
// server and every client run through the same physics. The player whose turn
// it is to hit sees their own racket meet the ball with no lag and reports the
// hit; we check it (the ball was there then, their racket near it) and it
// becomes the next flight. The table's bounces, the net, the floor are judged
// here a moment after they happen (GRACE: a hit that came before them may
// still be on its way). Vortex reads the flight coming to him and hits back
// at his moment, through the same path.

const GRACE = 280; // ms we wait before judging a bounce (a hit before it may be in flight)
const LATE = 450; // a reported hit older than this is too late
const BETWEEN = 1700; // ms after a point before the next serve
const CPU_SERVE_AFTER = 900; // Vortex waits this long before tossing
const RESULT_MS = 8000;
const RECORD_KEEP = 10;

interface Ref {
  seq: number; // the flight this is about
  done: number; // how many of its events are judged
  samples: [RacketAt[], RacketAt[]]; // recent racket reports per seat
  plan: { seq: number; t: number; ball: PongBall; whiff: boolean } | null;
  serveAt: number; // Vortex's serve: when he hits his toss
  serveBall: PongBall | null;
  rnd: () => number;
}

const toBall = (a: number[]): PongBall => ({
  x: a[0],
  y: a[1],
  z: a[2],
  vx: a[3],
  vy: a[4],
  vz: a[5],
  wx: a[6],
  wy: a[7],
  wz: a[8],
});

registerFeature((room: WorldRoom) => {
  const refs = new Map<string, Ref>();
  const ref = (id: string): Ref => {
    let r = refs.get(id);
    if (!r) {
      r = {
        seq: -1,
        done: 0,
        samples: [[], []],
        plan: null,
        serveAt: 0,
        serveBall: null,
        rnd: seeded(Date.now() & 0xffffff),
      };
      refs.set(id, r);
    }
    return r;
  };
  const table = (id: string) => {
    const o = room.state.objects.get(id);
    return o?.kind === "pingpong_table" ? o : undefined;
  };
  const away = (id: string, sid: string) => {
    const o = table(id);
    const p = room.state.players.get(sid);
    return o && p ? tableAway(o, p.x, p.y) : Number.POSITIVE_INFINITY;
  };
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const seatOf = (t: PongTable, sid: string): 0 | 1 | -1 => {
    for (const [k, s] of t.seats) if (s.sid === sid && !s.vortex) return Number(k) as 0 | 1;
    return -1;
  };
  const nameIn = (t: PongTable, seat: number) => {
    const s = t.seats.get(String(seat));
    return s ? (s.vortex ? "Vortex" : s.name) : "";
  };
  const parse = <T>(s: string): T | null => {
    if (!s) return null;
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  const save = async (o: ReturnType<typeof fromSchema>) => {
    const saved = config.offline ? o : (await api.putObject(o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };
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

  const setFlight = (id: string, t: PongTable, f: PongFlight | null) => {
    t.flight = f ? JSON.stringify(f) : "";
    t.seq = (t.seq + 1) & 0xffff;
    const r = ref(id);
    r.seq = t.seq;
    r.done = 0;
    r.plan = null;
    t.cpu = "";
  };

  // a point: the score, a moment, the next serve (or the match)
  const award = (id: string, t: PongTable, winner: 0 | 1, why: string, now: number) => {
    const s = parse<PongScore>(t.score);
    if (!s) return;
    const { score, game, match } = scorePoint(s, winner);
    t.score = JSON.stringify(score);
    t.pointNo = (t.pointNo + 1) & 0xffff;
    t.point = JSON.stringify({ no: t.pointNo, winner, why, game, match });
    const rally = parse<Rally>(t.rally);
    if (rally) t.rally = JSON.stringify({ ...rally, phase: "over" });
    t.wait = now + BETWEEN + (game ? 1200 : 0);
    ref(id).serveAt = 0;
    if (match) {
      t.phase = "done";
      record(id, nameIn(t, winner), nameIn(t, 1 - winner), "match");
    }
  };
  const replay = (id: string, t: PongTable, now: number) => {
    t.pointNo = (t.pointNo + 1) & 0xffff;
    t.point = JSON.stringify({ no: t.pointNo, winner: -1, why: "let" });
    const rally = parse<Rally>(t.rally);
    if (rally) t.rally = JSON.stringify({ ...rally, phase: "over" });
    t.wait = now + BETWEEN;
    ref(id).serveAt = 0;
  };

  // judge one rally event; true when the rally ended
  const judgeEvent = (id: string, t: PongTable, e: RallyEvent, now: number): boolean => {
    const r = parse<Rally>(t.rally);
    if (!r || r.phase === "over") return true;
    const out = rallyStep(r, e);
    t.rally = JSON.stringify(out.rally);
    if (out.point) {
      award(id, t, out.point.winner, out.point.why, now);
      return true;
    }
    if (out.let) {
      replay(id, t, now);
      return true;
    }
    return false;
  };
  // the flight's bounces up to `until` (server ms), in order
  const judgeUntil = (id: string, t: PongTable, until: number, now: number): boolean => {
    const f = parse<PongFlight>(t.flight);
    if (!f) return false;
    const r = ref(id);
    const evs = flightEvents(f);
    while (r.done < evs.length && evs[r.done].t <= until) {
      const e = evs[r.done++];
      const ev: RallyEvent =
        e.k === "table" ? { k: "table", side: e.side ?? 0 } : e.k === "net" ? { k: "net" } : { k: "floor" };
      if (judgeEvent(id, t, ev, now)) return true;
    }
    return false;
  };

  // a hit (a player's, or Vortex's): what came before it, then it. False when
  // the point was already decided (the ball bounced twice before it, a volley…)
  const hit = (id: string, t: PongTable, seat: 0 | 1, at: number, ball: PongBall, now: number): boolean => {
    if (judgeUntil(id, t, at - 1, now)) return false;
    const r = parse<Rally>(t.rally);
    if (!r) return false;
    const serving = r.phase === "toss";
    if (judgeEvent(id, t, { k: "hit", by: seat }, now)) return false;
    setFlight(id, t, { t0: Math.round(at), ball, by: seat, kind: serving ? "serve" : "hit" });
    return true;
  };

  const leaveSeat = (id: string, t: PongTable, seat: number) => {
    t.seats.delete(String(seat));
    if (t.phase === "play") {
      const other = 1 - seat;
      if (t.seats.has(String(other))) {
        const s = parse<PongScore>(t.score);
        if (s) t.score = JSON.stringify({ ...s, winner: other });
        t.pointNo = (t.pointNo + 1) & 0xffff;
        t.point = JSON.stringify({ no: t.pointNo, winner: other, why: "left", match: true });
        t.phase = "done";
        t.wait = Date.now();
        record(id, nameIn(t, other), "", "left");
      } else t.phase = "lobby";
    }
    if ([...t.seats.values()].every((s) => s.vortex)) t.seats.clear();
    if (seat === 0) t.r0 = "";
    else t.r1 = "";
  };

  room.on("pong:sit", (client, m) => {
    const id = String(m?.id ?? "");
    const seat = Number(m?.seat);
    const p = room.state.players.get(client.sessionId);
    if (!p || !table(id) || (seat !== 0 && seat !== 1)) return;
    if (away(id, client.sessionId) > TABLE_REACH) return warn(client, "Get closer to the table to play.");
    let t = room.state.pong.get(id);
    if (!t) {
      t = new PongTable();
      room.state.pong.set(id, t);
    }
    if (t.phase === "play") return warn(client, "Wait for this match to finish.");
    const taken = t.seats.get(String(seat));
    if (taken && taken.sid !== client.sessionId && !taken.vortex) return warn(client, `${taken.name} is playing.`);
    for (const [tid, other] of room.state.pong) {
      const mine = seatOf(other, client.sessionId);
      if (mine >= 0 && (tid !== id || mine !== seat)) other.seats.delete(String(mine));
    }
    const s = new PongSeat();
    s.sid = client.sessionId;
    s.uid = p.uid;
    s.name = p.name;
    t.seats.set(String(seat), s);
    if (t.phase === "done") t.phase = "lobby";
  });

  room.on("pong:leave", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pong.get(id);
    const seat = t ? seatOf(t, client.sessionId) : -1;
    if (t && seat >= 0) leaveSeat(id, t, seat);
  });

  room.on("pong:vortex", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pong.get(id);
    if (!t || t.phase === "play") return;
    const seat = seatOf(t, client.sessionId);
    if (seat < 0) return warn(client, "Take an end first.");
    const other = String(1 - seat);
    if (m?.level == null) {
      if (t.seats.get(other)?.vortex) t.seats.delete(other);
      return;
    }
    if (!isPongLevel(m.level)) return;
    const there = t.seats.get(other);
    if (there && !there.vortex) return warn(client, `${there.name} is at the other end.`);
    const s = new PongSeat();
    s.name = "Vortex";
    s.vortex = m.level;
    t.seats.set(other, s);
    if (t.phase === "done") t.phase = "lobby";
  });

  room.on("pong:start", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pong.get(id);
    if (!t || t.phase === "play" || seatOf(t, client.sessionId) < 0) return;
    if (!t.seats.has("0") || !t.seats.has("1")) return warn(client, "Two players needed — or play Vortex.");
    const to = Number(m?.to) === 21 ? 21 : 11;
    const bestOf = [1, 3, 5].includes(Number(m?.bestOf)) ? (Number(m?.bestOf) as 1 | 3 | 5) : 1;
    t.to = to;
    t.bestOf = bestOf;
    const first = (t.first & 1) as 0 | 1;
    t.first = (t.first + 1) & 1;
    t.score = JSON.stringify(newMatch(to as 11 | 21, bestOf, first));
    t.rally = JSON.stringify({ ...newRally(first), phase: "over" });
    t.point = "";
    t.wait = Date.now() + 600;
    t.phase = "play";
    setFlight(id, t, null);
    const r = ref(id);
    r.serveAt = 0;
    r.samples = [[], []];
  });

  room.on("pong:racket", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pong.get(id);
    const seat = t ? seatOf(t, client.sessionId) : -1;
    if (!t || seat === -1 || !Array.isArray(m?.r) || m.r.length !== 10) return;
    const a = m.r.map(Number);
    if (!a.every(Number.isFinite)) return;
    const s: RacketAt = {
      x: a[0],
      y: a[1],
      z: a[2],
      nx: a[3],
      ny: a[4],
      nz: a[5],
      vx: a[6],
      vy: a[7],
      vz: a[8],
      t: a[9],
    };
    const buf = ref(id).samples[seat];
    buf.push(s);
    if (buf.length > 16) buf.shift();
    const str = JSON.stringify(a.map((n: number) => Math.round(n * 1000) / 1000));
    if (seat === 0) t.r0 = str;
    else t.r1 = str;
  });

  room.on("pong:toss", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pong.get(id);
    if (!t || t.phase !== "play") return;
    const seat = seatOf(t, client.sessionId);
    const now = Date.now();
    const score = parse<PongScore>(t.score);
    if (!score || seat !== score.server || now < t.wait || t.flight) return;
    const at = Math.max(now - LATE, Math.min(now + 50, Number(m?.t) || now));
    t.rally = JSON.stringify(newRally(score.server));
    judgeEvent(id, t, { k: "toss" }, now);
    setFlight(id, t, { t0: Math.round(at), ball: serveToss(seat, Number(m?.y) || 0), by: seat, kind: "toss" });
  });

  room.on("pong:hit", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pong.get(id);
    if (!t || t.phase !== "play") return;
    const seat = seatOf(t, client.sessionId);
    if (seat === -1) return;
    const f = parse<PongFlight>(t.flight);
    const r = parse<Rally>(t.rally);
    // (a refused hit is told back at once: that player's ball returns to its real path)
    const no = (why: ServerMessages["pong:no"]["why"]) =>
      room.send(client, "pong:no", { id, seq: Number(m?.seq), why });
    if (!f || !r || r.phase === "over") return no("over");
    if (Number(m?.seq) !== t.seq) return no("seq");
    // whose hit it is: your own toss, else the ball coming to you
    const mine = f.kind === "toss" ? f.by === seat : f.by !== seat;
    if (!mine || !Array.isArray(m?.b) || m.b.length !== 9) return no("turn");
    const now = Date.now();
    const at = Number(m.t);
    if (!Number.isFinite(at) || at > now + 80) return no("early");
    if (at < now - LATE) return no("late");
    const ball = toBall(m.b.map(Number));
    if (!plausibleHit(f, at, ball, ref(id).samples[seat])) return no("check");
    if (!hit(id, t, seat, at, ball, now)) no("over");
  });

  room.on("pong:concede", (client, m) => {
    const id = String(m?.id ?? "");
    const t = room.state.pong.get(id);
    const seat = t ? seatOf(t, client.sessionId) : -1;
    if (!t || seat < 0 || t.phase !== "play") return;
    const other = 1 - seat;
    const s = parse<PongScore>(t.score);
    if (s) t.score = JSON.stringify({ ...s, winner: other });
    t.pointNo = (t.pointNo + 1) & 0xffff;
    t.point = JSON.stringify({ no: t.pointNo, winner: other, why: "conceded", match: true });
    t.phase = "done";
    t.wait = Date.now();
    record(id, nameIn(t, other), nameIn(t, seat), "conceded");
  });

  // Vortex at his end: serve when it's his, read the ball coming, hit it back
  const vortex = (id: string, t: PongTable, seat: 0 | 1, level: PongLevel, now: number) => {
    const r = ref(id);
    const score = parse<PongScore>(t.score);
    const rally = parse<Rally>(t.rally);
    if (!score || !rally) return;
    const f = parse<PongFlight>(t.flight);
    // his serve
    if (score.server === seat && (rally.phase === "over" || !f) && now >= t.wait + CPU_SERVE_AFTER && !r.serveAt) {
      const sv = cpuServe(seat, level, r.rnd);
      t.rally = JSON.stringify(newRally(seat));
      judgeEvent(id, t, { k: "toss" }, now);
      setFlight(id, t, { t0: now, ball: sv.toss, by: seat, kind: "toss" });
      r.serveAt = now + sv.hitAfter;
      r.serveBall = sv.ball;
      t.cpu = JSON.stringify({
        seq: t.seq,
        t: r.serveAt,
        ...ballAt(parse<PongFlight>(t.flight) as PongFlight, r.serveAt).ball,
        whiff: false,
      });
      return;
    }
    if (r.serveAt && f?.kind === "toss" && f.by === seat) {
      if (now >= r.serveAt && r.serveBall) {
        const at = r.serveAt;
        const ball = r.serveBall;
        r.serveAt = 0;
        r.serveBall = null;
        hit(id, t, seat, at, ball, now);
      }
      return;
    }
    // the ball coming to him: plan once per flight, hit at his moment
    if (!f || f.by === seat || f.kind === "toss" || rally.phase === "over") return;
    if (!r.plan || r.plan.seq !== t.seq) {
      const p = cpuPlan(f, seat, level, r.rnd);
      r.plan = p
        ? { seq: t.seq, t: p.t, ball: p.ball, whiff: p.whiff }
        : { seq: t.seq, t: Number.POSITIVE_INFINITY, ball: f.ball, whiff: true };
      if (p) t.cpu = JSON.stringify({ seq: t.seq, t: p.t, x: p.at.x, y: p.at.y, z: p.at.z, whiff: p.whiff });
    }
    if (!r.plan.whiff && now >= r.plan.t) {
      const plan = r.plan;
      r.plan = { ...plan, whiff: true }; // once
      hit(id, t, seat, plan.t, plan.ball, now);
    }
  };

  return {
    tick(_dt, now) {
      for (const [id, t] of room.state.pong) {
        if (!table(id)) {
          room.state.pong.delete(id);
          refs.delete(id);
          continue;
        }
        for (const [k, s] of [...t.seats]) {
          if (s.vortex) continue;
          if (!room.state.players.has(s.sid) || away(id, s.sid) > TABLE_WALK_AWAY) leaveSeat(id, t, Number(k));
        }
        if (t.phase === "done" && now - t.wait > RESULT_MS && !t.seats.size) t.phase = "lobby";
        if (t.phase !== "play") continue;
        // judge what the ball did, a moment late
        const f = parse<PongFlight>(t.flight);
        if (f) {
          judgeUntil(id, t, now - GRACE, now);
          const rally = parse<Rally>(t.rally);
          if (rally && rally.phase !== "over" && now - GRACE > flightEnd(f)) judgeEvent(id, t, { k: "dead" }, now);
        }
        // after a point: the ball back to the server's hand
        const rally = parse<Rally>(t.rally);
        if (rally?.phase === "over" && now >= t.wait && t.flight && !ref(id).serveAt) setFlight(id, t, null);
        for (const [k, s] of t.seats)
          if (s.vortex && isPongLevel(s.vortex) && t.phase === "play") vortex(id, t, Number(k) as 0 | 1, s.vortex, now);
      }
    },
    leave(client) {
      for (const [id, t] of room.state.pong) {
        const seat = seatOf(t, client.sessionId);
        if (seat >= 0) leaveSeat(id, t, seat);
      }
    },
  };
});
