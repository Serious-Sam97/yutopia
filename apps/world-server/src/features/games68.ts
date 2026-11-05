import { chairAt, entry, footprint, HELD, isHeld, objLevel, quarterOf, type WorldObjectDef } from "@yutopia/shared";
import { legal, type Move, outcome, parseFen, play, START, toFen } from "@yutopia/shared/games68/chess";
import { clawDrop, prizesOf } from "@yutopia/shared/games68/claw";
import { DARTS_A_TURN, dartScore } from "@yutopia/shared/games68/darts";
import { chessThink, isChessLevel } from "@yutopia/shared/games68/engine";
import { type Foos, foosWon, newFoos, stepFoos } from "@yutopia/shared/games68/foosball";
import { type Hockey, hockeyWon, newHockey, placeMallet, stepHockey } from "@yutopia/shared/games68/hockey";
import { uciOf } from "@yutopia/shared/games68/san";
import { api } from "../api.ts";
import { config } from "../config.ts";
import type { Player } from "../schema.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The small games (docs/plan/68-more-furniture.md, phases 21–25), each at its own piece of the game
// room (by its catalog `interact`):
// - chess: the table keeps the game (`props.fen`, its last move, who's white and black); a move is
//   taken from whoever's side it is, if it's legal (shared games68/chess.ts). Plan 70: the side's
//   taken by sitting in its chair (the client sends it), the move's time kept (`lastAt`: the men
//   play it out on every client from then), a side can resign (`over: "resign"`, `loser`), or
//   offer a draw the other accepts (`offer`: the side offering; `over: "agreed"`); sat alone, Vortex
//   can be asked to play the other side (`vx`: his level, `vxSide`) — he thinks here, a few ms a tick
//   (shared games68/engine.ts), after a look at the board while the last move plays out, and his
//   move goes the way a player's does; he goes when his opponent gets up or walks off; on a life-size
//   board (phase 9) anyone else can stand in for a man (`si`: square → who): carried with it when it
//   moves, thrown down when it's taken and set back by the board's edge;
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
// (Vortex at chess: his thinking a tick, the look he takes first — the last move played out on the
// board, ~2 s — and the least his move takes, so it never comes the moment yours lands)
const VX_THINK_MS = 9;
const VX_LOOK_MS = 2600;
const VX_LEAST_MS = 3200;
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
    const { w, h } = footprint(o.kind, quarterOf(o));
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
      // (a side Vortex had: he gives it up to whoever sits there)
      if (props.vxSide === side) vxGone(props);
      props[side] = p.uid;
      props[`${side}n`] = p.name;
    }
    // (nobody left playing him: Vortex goes too)
    if (props.vx && !props.w && !props.b) vxGone(props);
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
    playMove(o, props, mv);
  });
  /** A move played at a table (a player's, Vortex's): the position, its time and log, the end. */
  const playMove = (o: WorldObjectDef, props: Record<string, unknown>, mv: Move) => {
    const pos = parseFen(String(props.fen ?? START));
    const next = play(pos, mv);
    // (the stand-ins: carried with their men; one whose man's taken, thrown down)
    if (props.si && typeof props.si === "object") {
      const si = { ...(props.si as Record<string, number>) };
      const piece = pos.board[mv.from].toLowerCase();
      const ep = piece === "p" && mv.to === pos.ep ? (mv.to % 8) + Math.floor(mv.from / 8) * 8 : -1;
      const taken = ep >= 0 ? ep : pos.board[mv.to] ? mv.to : -1;
      if (taken >= 0 && si[taken] !== undefined) {
        knock(o, si[taken], mv.from);
        delete si[taken];
      }
      const carry = (a: number, b: number) => {
        if (si[a] === undefined) return;
        si[b] = si[a];
        delete si[a];
      };
      carry(mv.from, mv.to);
      // (castling: the rook too)
      if (piece === "k" && Math.abs(mv.to - mv.from) === 2) {
        const right = mv.to > mv.from;
        carry(right ? mv.from + 3 : mv.from - 4, right ? mv.from + 1 : mv.from - 1);
      }
      props.si = si;
    }
    const end = outcome(next);
    props.fen = toFen(next);
    props.last = [mv.from, mv.to];
    props.lastAt = Date.now();
    // (the game's moves so far, for its notation: shared games68/san.ts)
    props.log = `${props.log ? `${String(props.log)} ` : ""}${uciOf(mv)}`;
    // (a move answers a draw offered: it's turned down)
    delete props.offer;
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
  };
  // plan 70 phase 9: a stand-in whose man's taken: thrown from the blow (as everyone sees it: plan 58's
  // hit), then set back on the board's edge, unhurt
  const knock = (o: WorldObjectDef, uid: number, from: number) => {
    const q = [...room.state.players.values()].find((x) => x.uid === uid);
    if (!q) return;
    const { w, h } = footprint(o.kind, quarterOf(o));
    // (the blow from the taker's square: ranks along the board's x, 1.1 m a square past its 0.6 m edge)
    const f = chairAt(o, {
      u: 0.6 + (7 - Math.floor(from / 8) + 0.5) * 1.1,
      v: 0.6 + ((from % 8) + 0.5) * 1.1,
      face: 0,
    });
    q.hitAt = Date.now();
    q.hitYaw = Math.atan2(f.y - q.y, f.x - q.x);
    const sid = [...room.state.players.entries()].find(([, x]) => x.uid === uid)?.[0];
    setTimeout(() => {
      const p = sid ? room.state.players.get(sid) : undefined;
      const c = (room.clients as WorldClient[]).find((x) => x.sessionId === sid);
      if (!p || !c) return;
      // (to the nearer long edge, just off the board)
      const off = p.y - o.y < h / 2 ? o.y - 0.6 : o.y + h + 0.6;
      p.x = Math.max(o.x + 0.5, Math.min(o.x + w - 0.5, p.x));
      p.y = off;
      room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
    }, 2200);
  };
  room.on("chess:standin", (client, m) => {
    const g = at(client, m?.id, "chess");
    if (!g || g.o.kind !== "wizard_chess") return;
    const { p, o } = g;
    const props = { ...(o.props ?? {}) };
    const si = { ...((props.si as Record<string, number>) ?? {}) };
    for (const [k, v] of Object.entries(si)) if (v === p.uid) delete si[k];
    const sq = m?.sq;
    if (typeof sq === "number" && sq >= 0 && sq < 64) {
      const pos = parseFen(String(props.fen ?? START));
      if (props.w === p.uid || props.b === p.uid) return warn(client, "You're commanding a side.");
      if (!pos.board[sq]) return warn(client, "Nobody to stand in for there.");
      if (si[sq] !== undefined) return warn(client, "Someone's standing in for that one.");
      si[sq] = p.uid;
    }
    props.si = si;
    save({ ...o, props });
  });
  // plan 70: Vortex to play the side across from me (a level), or gone (null)
  const vxThink = new Map<
    string,
    { gen: Generator<void, Move | null>; fen: string; from: number; ready?: Move | null }
  >();
  const vxGone = (props: Record<string, unknown>) => {
    const side = props.vxSide === "w" || props.vxSide === "b" ? props.vxSide : null;
    if (side) delete props[`${side}n`];
    delete props.vx;
    delete props.vxSide;
  };
  room.on("chess:vortex", (client, m) => {
    const g = at(client, m?.id, "chess");
    if (!g) return;
    const { p, o } = g;
    const props = { ...(o.props ?? {}) };
    const mine = props.w === p.uid ? "w" : props.b === p.uid ? "b" : null;
    if (!mine) return warn(client, "Sit at the table first.");
    vxThink.delete(o.id);
    if (m?.level === null || m?.level === undefined) {
      vxGone(props);
      return save({ ...o, props });
    }
    if (!isChessLevel(m.level)) return;
    const other = mine === "w" ? "b" : "w";
    // (a side kept by someone who's gone or walked off is free for him, as for anyone)
    const holder = props[other] ? [...room.state.players.values()].find((q) => q.uid === props[other]) : undefined;
    if (holder && near(holder, o)) return warn(client, `${String(props[`${other}n`])} is playing that side.`);
    props.vx = m.level;
    props.vxSide = other;
    props[`${other}n`] = "Vortex";
    delete props[other];
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
    for (const k of ["over", "last", "lastAt", "offer", "loser", "log", "si"]) delete props[k];
    save({ ...o, props });
  });
  // plan 70: giving up — the king takes off his crown (the clients play it), the other side wins
  room.on("chess:resign", (client, m) => {
    const g = at(client, m?.id, "chess");
    if (!g) return;
    const { p, o } = g;
    const props = { ...(o.props ?? {}) };
    const side = props.w === p.uid ? "w" : props.b === p.uid ? "b" : null;
    if (!side || props.over) return;
    props.over = "resign";
    props.loser = side;
    props.lastAt = Date.now();
    delete props.offer;
    const winner = side === "w" ? props.bn : props.wn;
    room.broadcastMsg("toast", { text: `${p.name} resigns — ${String(winner || "the other side")} wins at chess ♟` });
    save({ ...o, props });
  });
  // plan 70: a draw offered (`offer`: true) by one side, agreed when the other offers too; taken back
  // (`offer`: false) by the side that made it
  room.on("chess:draw", (client, m) => {
    const g = at(client, m?.id, "chess");
    if (!g) return;
    const { p, o } = g;
    const props = { ...(o.props ?? {}) };
    const side = props.w === p.uid ? "w" : props.b === p.uid ? "b" : null;
    if (!side || props.over || !props.fen) return;
    if (m?.offer === false) {
      if (props.offer !== side) return;
      delete props.offer;
    } else if (props.offer && props.offer !== side) {
      props.over = "agreed";
      props.lastAt = Date.now();
      delete props.offer;
      room.broadcastMsg("toast", {
        text: `A draw at chess, agreed between ${String(props.wn)} and ${String(props.bn)}.`,
      });
    } else props.offer = side;
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
      // Vortex at chess: his move when it's his turn, thought a few ms a tick
      for (const s of room.state.objects.values()) {
        if (entry(s.kind).interact !== "chess") continue;
        const o = fromSchema(s);
        const props = o.props ?? {};
        const side = props.vxSide;
        if (!props.vx || (side !== "w" && side !== "b")) continue;
        // (his opponent walked off or gone: he goes too)
        const human = props[side === "w" ? "b" : "w"];
        const holder = human ? [...room.state.players.values()].find((q) => q.uid === human) : undefined;
        if (!holder || !near(holder, o)) {
          const next = { ...props };
          vxGone(next);
          vxThink.delete(o.id);
          save({ ...o, props: next });
          continue;
        }
        const fen = String(props.fen ?? START);
        const pos = parseFen(fen);
        const end = outcome(pos);
        if (props.over || pos.turn !== side || (end !== "play" && end !== "check")) {
          vxThink.delete(o.id);
          continue;
        }
        const wall = Date.now();
        if (wall - (Number(props.lastAt) || 0) < VX_LOOK_MS) continue;
        let t = vxThink.get(o.id);
        if (!t || t.fen !== fen) {
          const level = isChessLevel(props.vx) ? props.vx : "medium";
          t = { gen: chessThink(fen, level, (fen.length * 7919 + wall) | 0), fen, from: wall };
          vxThink.set(o.id, t);
        }
        if (t.ready === undefined) {
          const until = performance.now() + VX_THINK_MS;
          let r = t.gen.next();
          while (!r.done && performance.now() < until) r = t.gen.next();
          if (!r.done) continue;
          t.ready = r.value;
        }
        // (thought: played, though never sooner than a beat after the move it answers)
        if (wall - (Number(props.lastAt) || 0) < VX_LEAST_MS) continue;
        vxThink.delete(o.id);
        if (!t.ready) continue;
        playMove(o, { ...props }, t.ready);
      }
      void now;
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
