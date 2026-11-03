import { entry, footprint, HELD, isHeld, objLevel, type WorldObjectDef } from "@yutopia/shared";
import { legal, outcome, parseFen, play, START, toFen } from "@yutopia/shared/games68/chess";
import { clawDrop, prizesOf } from "@yutopia/shared/games68/claw";
import { DARTS_A_TURN, dartScore } from "@yutopia/shared/games68/darts";
import { type Foos, foosWon, newFoos, stepFoos } from "@yutopia/shared/games68/foosball";
import { type Hockey, hockeyWon, newHockey, placeMallet, stepHockey } from "@yutopia/shared/games68/hockey";
import { api } from "../api.ts";
import { config } from "../config.ts";
import type { Player } from "../schema.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The small games (docs/plan/68-more-furniture.md, phases 21–25), each at its own piece of the game
// room (by its catalog `interact`):
// - chess: the table keeps the game (`props.fen`, its last move, who's white and black); a move is
//   taken from whoever's side it is, if it's legal (shared games68/chess.ts);
// - darts: a dart lands where it's thrown (the board scores it as a real one: games68/darts.ts),
//   three a turn, the board keeps the last three in it and its best turn;
// - the claw machine: the claw dropped where it's steered; a toy won is in hand (games68/claw.ts);
// - air hockey and foosball: two players a table, stepped here twenty-five times a second from where
//   they hold their mallet or their rods, the state sent to the two of them (games68/hockey.ts,
//   foosball.ts) — first to seven (five) wins.
const REACH = 2.4; // tiles from the thing's footprint
const TICK = 1 / 25;
// (one go at a time: the claw's drop takes its while; a dart's throw a moment)
const CLAW_MS = 2500;
const DART_MS = 350;

interface Seat {
  sid: string;
  p: Player;
}
interface Table {
  kind: "hockey" | "foosball";
  /** who's at each end: their session, their player */
  players: [Seat | null, Seat | null];
  running: boolean;
  hockey: Hockey;
  was: Hockey["mallets"];
  foos: Foos;
  acc: number;
  sentAt: number;
}

registerFeature((room: WorldRoom) => {
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const persistFailed = (e: Error) => console.warn("[games68] save failed", e.message);
  const near = (p: Player, o: WorldObjectDef) => {
    const { w, h } = footprint(o.kind, o.rot);
    const cx = Math.max(o.x, Math.min(p.x, o.x + w));
    const cy = Math.max(o.y, Math.min(p.y, o.y + h));
    return objLevel(o, room.map) === p.level && room.reach3(p, o, Math.hypot(p.x - cx, p.y - cy)) <= REACH;
  };
  /** The player and the thing they're at, if it's the game asked for and they're near enough. */
  const at = (client: WorldClient, id: unknown, how: string): { p: Player; o: WorldObjectDef } | null => {
    const p = room.state.players.get(client.sessionId);
    const s = room.state.objects.get(String(id ?? ""));
    if (!p || !s || entry(s.kind).interact !== how) return null;
    const o = fromSchema(s);
    return near(p, o) ? { p, o } : null;
  };
  /** Whether `sid`'s last go at `what` was too lately (and if not, now it's this one). */
  const lastGo = new Map<string, number>();
  const tooSoon = (sid: string, what: string, ms: number) => {
    const k = `${sid}|${what}`;
    const now = Date.now();
    if (now - (lastGo.get(k) ?? 0) < ms) return true;
    lastGo.set(k, now);
    return false;
  };
  const save = (o: WorldObjectDef, persist = true) => {
    room.state.objects.set(o.id, toSchema(o));
    if (persist && !config.offline) api.putObject(o).catch(persistFailed);
  };

  // ── chess ──
  room.on("chess:sit", (client, m) => {
    const g = at(client, m?.id, "chess");
    if (!g) return;
    const { p, o } = g;
    const props = { ...(o.props ?? {}) };
    for (const side of ["w", "b"] as const)
      if (props[side] === p.uid) {
        delete props[side];
        delete props[`${side}n`];
      }
    const side = m?.side;
    if (side === "w" || side === "b") {
      // (a side kept by someone who's gone — logged off, another floor, walked off — is free to take)
      const holder = props[side] ? [...room.state.players.values()].find((q) => q.uid === props[side]) : undefined;
      if (holder && holder.uid !== p.uid && near(holder, o))
        return warn(client, `${String(props[`${side}n`])} is playing that side.`);
      props[side] = p.uid;
      props[`${side}n`] = p.name;
    }
    save({ ...o, props });
  });
  room.on("chess:move", (client, m) => {
    const g = at(client, m?.id, "chess");
    if (!g) return;
    const { p, o } = g;
    const props = { ...(o.props ?? {}) };
    const pos = parseFen(String(props.fen ?? START));
    if (props.over) return;
    if (props[pos.turn] !== p.uid) return warn(client, "It's not your move.");
    const mv = legal(pos, Number(m.from), Number(m.to), String(m.promo ?? "q"));
    if (!mv) return;
    const next = play(pos, mv);
    const end = outcome(next);
    props.fen = toFen(next);
    props.last = [mv.from, mv.to];
    if (end !== "play" && end !== "check") {
      props.over = end;
      const winner = end === "mate" ? (next.turn === "w" ? props.bn : props.wn) : null;
      room.broadcastMsg("toast", {
        text: winner
          ? `Checkmate — ${String(winner)} wins at chess ♟`
          : `A draw at chess (${end === "stalemate" ? "stalemate" : end === "fifty" ? "fifty moves" : "too little left to mate"}).`,
      });
    }
    save({ ...o, props });
  });
  room.on("chess:new", (client, m) => {
    const g = at(client, m?.id, "chess");
    if (!g) return;
    const { p, o } = g;
    const props = { ...(o.props ?? {}) };
    if (props.w !== p.uid && props.b !== p.uid && !p.admin && (props.w || props.b))
      return warn(client, "Only its players start a new game.");
    props.fen = START;
    delete props.over;
    delete props.last;
    save({ ...o, props });
  });

  // ── darts ──
  room.on("darts:throw", (client, m) => {
    const g = at(client, m?.id, "darts");
    if (!g || tooSoon(client.sessionId, "darts", DART_MS)) return;
    const { p, o } = g;
    const x = Number(m.x);
    const y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 0.4) return;
    const props = { ...(o.props ?? {}) };
    const turn = (props.turn as { uid: number; name: string; total: number; n: number } | undefined) ?? null;
    const mine =
      turn && turn.uid === p.uid && turn.n < DARTS_A_TURN ? turn : { uid: p.uid, name: p.name, total: 0, n: 0 };
    const had = Array.isArray(props.darts) ? (props.darts as [number, number][]) : [];
    const darts = mine.n === 0 ? [] : [...had];
    const s = dartScore(x, y);
    darts.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
    mine.total += s.points;
    mine.n++;
    props.darts = darts.slice(-DARTS_A_TURN);
    props.turn = mine;
    room.send(client, "toast", {
      text:
        s.ring === "miss"
          ? "Missed the board."
          : `${s.ring === "bull" ? "Bullseye! " : ""}${s.points}${mine.n === DARTS_A_TURN ? ` — ${mine.total} with three darts` : ""}`,
    });
    let persist = false;
    if (mine.n === DARTS_A_TURN) {
      persist = true;
      const best = props.best as { name: string; score: number } | undefined;
      if (!best || mine.total > best.score) {
        props.best = { name: p.name, score: mine.total };
        room.broadcastMsg("toast", { text: `${p.name} threw ${mine.total} — the dartboard's best 🎯` });
      }
    }
    save({ ...o, props }, persist);
  });

  // ── the claw machine ──
  room.on("claw:drop", (client, m) => {
    const g = at(client, m?.id, "claw");
    // (refused — too far, too soon: the panel told so, so its claw comes back up)
    if (!g || tooSoon(client.sessionId, "claw", CLAW_MS))
      return void room.send(client, "claw:result", { id: String(m?.id ?? ""), toy: null });
    const { p, o } = g;
    const won = Number(o.props?.won) || 0;
    const prizes = prizesOf(o.id, won);
    const i = clawDrop(prizes, Number(m.x), Number(m.z), Math.random());
    const toy = i >= 0 ? prizes[i].toy : null;
    room.send(client, "claw:result", { id: o.id, toy });
    if (!toy) return;
    p.held = toy;
    p.heldAt = Date.now();
    save({ ...o, props: { ...(o.props ?? {}), won: won + 1 } });
    const label = isHeld(toy) ? HELD[toy].label.toLowerCase() : toy;
    room.broadcastMsg("toast", { text: `${p.name} won a ${label} from the claw machine 🧸` });
  });

  // ── air hockey and foosball ──
  const tables = new Map<string, Table>();
  const send = (t: Table, id: string) => {
    for (const [side, q] of t.players.entries()) {
      if (!q) continue;
      const c = room.clients.find((cl) => cl.sessionId === q.sid);
      if (!c) continue;
      const s =
        t.kind === "hockey"
          ? [
              t.hockey.puck.x,
              t.hockey.puck.y,
              t.hockey.mallets[0].x,
              t.hockey.mallets[0].y,
              t.hockey.mallets[1].x,
              t.hockey.mallets[1].y,
            ]
          : [t.foos.ball.x, t.foos.ball.y, t.foos.slide[0], t.foos.slide[1], t.foos.kick[0], t.foos.kick[1]];
      room.send(c, "tg:state", {
        id,
        kind: t.kind,
        side,
        names: [t.players[0]?.p.name ?? "", t.players[1]?.p.name ?? ""],
        running: t.running,
        s: s.map((v) => Math.round(v * 1000) / 1000),
        score: t.kind === "hockey" ? t.hockey.score : t.foos.score,
      });
    }
  };
  const leaveAll = (sid: string) => {
    for (const [id, t] of tables) {
      const side = t.players.findIndex((q) => q?.sid === sid);
      if (side !== 0 && side !== 1) continue;
      t.players[side] = null;
      t.running = false;
      send(t, id);
      if (!t.players[0] && !t.players[1]) tables.delete(id);
    }
  };
  room.on("tg:join", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const s = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !s) return;
    const how = entry(s.kind).interact;
    if (how !== "hockey" && how !== "foosball") return;
    const o = fromSchema(s);
    if (!near(p, o)) return;
    leaveAll(client.sessionId);
    const t: Table = tables.get(o.id) ?? {
      kind: how,
      players: [null, null],
      running: false,
      hockey: newHockey(),
      was: newHockey().mallets,
      foos: newFoos(),
      acc: 0,
      sentAt: 0,
    };
    tables.set(o.id, t);
    const side = !t.players[0] ? 0 : !t.players[1] ? 1 : -1;
    if (side !== 0 && side !== 1) return warn(client, "Both sides are taken.");
    t.players[side] = { sid: client.sessionId, p };
    if (t.players[0] && t.players[1]) {
      t.hockey = newHockey();
      t.was = structuredClone(t.hockey.mallets);
      t.foos = newFoos();
      t.running = true;
    }
    send(t, o.id);
  });
  room.on("tg:input", (client, m) => {
    const t = tables.get(String(m?.id ?? ""));
    if (!t) return;
    const side = t.players.findIndex((q) => q?.sid === client.sessionId);
    if (side !== 0 && side !== 1) return;
    const x = Number(m.x);
    const y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (t.kind === "hockey") placeMallet(t.hockey, side, x, y);
    else {
      t.foos.slide[side] = Math.max(-1, Math.min(1, x));
      if (m.kick && t.foos.kick[side] < 0) t.foos.kick[side] = 0;
    }
  });
  room.on("tg:leave", (client) => leaveAll(client.sessionId));

  return {
    leave(c) {
      leaveAll(c.sessionId);
      for (const k of lastGo.keys()) if (k.startsWith(`${c.sessionId}|`)) lastGo.delete(k);
    },
    tick(dt, now) {
      for (const [id, t] of tables) {
        // (the table taken away, or someone walked off from it: they're out of the game)
        const s = room.state.objects.get(id);
        const o = s ? fromSchema(s) : null;
        for (const q of t.players) if (q && (!o || !near(q.p, o))) leaveAll(q.sid);
        if (!tables.has(id) || !t.running) continue;
        t.acc += dt;
        while (t.acc >= TICK) {
          t.acc -= TICK;
          const scored = t.kind === "hockey" ? stepHockey(t.hockey, TICK, t.was) : stepFoos(t.foos, TICK);
          t.was = structuredClone(t.hockey.mallets);
          if (scored < 0) continue;
          const won = t.kind === "hockey" ? hockeyWon(t.hockey) : foosWon(t.foos);
          if (won >= 0) {
            const score = t.kind === "hockey" ? t.hockey.score : t.foos.score;
            const [a, b] = [t.players[won]?.p.name ?? "?", t.players[1 - won]?.p.name ?? "?"];
            room.broadcastMsg("toast", {
              text: `${a} beat ${b} ${Math.max(...score)}–${Math.min(...score)} at ${t.kind === "hockey" ? "air hockey 🏒" : "foosball ⚽"}`,
            });
            t.running = false;
          }
        }
        if (now - t.sentAt >= 45 || !t.running) {
          t.sentAt = now;
          send(t, id);
        }
      }
    },
  };
});
