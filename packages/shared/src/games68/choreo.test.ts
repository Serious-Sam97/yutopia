import assert from "node:assert/strict";
import { test } from "node:test";
import { legal, parseFen, play, START, sq, toFen } from "./chess.ts";
import { actorAt, type Fr, type MovePlan, planMove, restYaw, sqToFr, victimAt } from "./choreo.ts";

// Plan 70 phases 3–4: the living chessmen's choreography, checked as numbers.

/** The FEN after playing `moves` ("e2e4", "e7e8n") from `fen`. */
function after(fen: string, ...moves: string[]): string {
  let p = parseFen(fen);
  for (const mv of moves) {
    const m = legal(p, sq(mv.slice(0, 2)), sq(mv.slice(2, 4)), mv[4] ?? "q");
    assert.ok(m, `legal: ${mv}`);
    p = play(p, m);
  }
  return toFen(p);
}
function plan(fen: string, mv: string): MovePlan {
  const pl = planMove(fen, after(fen, mv), [sq(mv.slice(0, 2)), sq(mv.slice(2, 4))]);
  assert.ok(pl, `a plan for ${mv}`);
  return pl;
}
const near = (a: Fr, b: Fr, eps = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;
const d = (a: Fr, b: Fr) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Every actor: no jump over 0.2 squares (or 1 cm of lift, or 0.5 rad) in 0.01 s; at rest on its
 *  to-square from the plan's end on. */
function checkWhole(pl: MovePlan, name: string) {
  pl.actors.forEach((a, i) => {
    let prev = actorAt(pl, i, -0.01);
    assert.ok(near(prev.at, a.from), `${name}: actor ${i} starts on its square`);
    for (let t = 0; t <= pl.duration + 0.05; t += 0.01) {
      const now = actorAt(pl, i, t);
      assert.ok(d(prev.at, now.at) <= 0.2, `${name}: actor ${i} jumps at ${t.toFixed(2)}`);
      assert.ok(Math.abs(prev.lift - now.lift) <= 0.01, `${name}: actor ${i} lift jumps at ${t.toFixed(2)}`);
      assert.ok(Math.abs(prev.yaw - now.yaw) <= 0.5, `${name}: actor ${i} spins at ${t.toFixed(2)}`);
      assert.ok(now.lift >= 0 && now.k >= 0 && now.k <= 1, `${name}: actor ${i} in range at ${t.toFixed(2)}`);
      prev = now;
    }
    for (const t of [pl.duration, pl.duration + 1]) {
      const e = actorAt(pl, i, t);
      assert.ok(near(e.at, a.to), `${name}: actor ${i} on its square at the end`);
      assert.equal(e.pose, "rest");
      assert.equal(e.lift, 0);
      assert.ok(angle(e.yaw, restYaw(a.side)) < 1e-9, `${name}: actor ${i} faces the enemy at the end`);
    }
    assert.ok(a.end <= pl.duration);
  });
}

test("choreo: a pawn push marches straight, in hops, no turning", () => {
  const pl = plan(START, "e2e4");
  checkWhole(pl, "e2e4");
  assert.equal(pl.actors.length, 1);
  const a = pl.actors[0];
  assert.deepEqual([a.kind, a.side, a.role], ["p", "w", "mover"]);
  assert.deepEqual(a.from, [4, 1]);
  assert.deepEqual(a.to, [4, 3]);
  assert.equal(pl.victim, null);
  assert.equal(pl.promo, null);
  assert.equal(pl.end, "play");
  assert.equal(pl.check, false);
  assert.ok(pl.duration >= 0.8 - 1e-9 && pl.duration <= 2, `duration ${pl.duration}`);
  const lifts: number[] = [];
  for (let t = 0; t < a.end; t += 0.002) {
    const m = actorAt(pl, 0, t);
    assert.equal(m.yaw, 0, "faces up the board all the way");
    lifts.push(m.lift);
  }
  const maxLift = Math.max(...lifts);
  // a hop: a peak of the lift
  let hops = 0;
  for (let i = 1; i < lifts.length - 1; i++) if (lifts[i] > lifts[i - 1] && lifts[i] >= lifts[i + 1]) hops++;
  assert.equal(hops, 4, `small hops (${hops})`);
  assert.ok(maxLift > 0 && maxLift < 0.02, `a little lift (${maxLift})`);
  // black's pawn faces down the board
  const b = plan(after(START, "e2e4"), "e7e5");
  checkWhole(b, "e7e5");
  assert.equal(actorAt(b, 0, b.actors[0].end / 2).yaw, Math.PI);
});

test("choreo: the knight turns, rears, leaps in an arc and lands", () => {
  const pl = plan(START, "g1f3");
  checkWhole(pl, "g1f3");
  const a = pl.actors[0];
  assert.equal(a.kind, "n");
  const leap = a.legs.find((l) => l.kind === "go");
  assert.ok(leap);
  const mid = actorAt(pl, 0, (leap.t0 + leap.t1) / 2);
  assert.equal(mid.pose, "leap");
  assert.ok(mid.lift > 0.03, `high at the middle (${mid.lift})`);
  assert.ok(near(mid.at, [5.5, 1], 1e-6), "halfway between g1 and f3");
  assert.equal(actorAt(pl, 0, leap.t0).lift, 0);
  assert.equal(actorAt(pl, 0, leap.t1).lift, 0);
  assert.ok(a.legs.some((l) => l.pose === "rear") && a.legs.some((l) => l.pose === "land"));
  // the way it faces while leaping: toward f3 from g1, (−1, +2)
  assert.ok(angle(mid.yaw, Math.atan2(-1, 2)) < 1e-9, `faces its way (${mid.yaw})`);
  const end = actorAt(pl, 0, pl.duration);
  assert.equal(end.pose, "rest");
  assert.equal(end.yaw, 0);
  assert.equal(end.lift, 0);
  assert.ok(pl.duration >= 0.8 - 1e-9 && pl.duration <= 2);
});

test("choreo: yaw — 0 is +rank, +π/2 is +file", () => {
  // a rook going to the h-file faces +file
  const pl = plan("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1d1");
  checkWhole(pl, "a1d1");
  const go = pl.actors[0].legs.find((l) => l.kind === "go");
  assert.ok(go);
  assert.ok(Math.abs(actorAt(pl, 0, (go.t0 + go.t1) / 2).yaw - Math.PI / 2) < 1e-9);
  assert.equal(actorAt(pl, 0, (go.t0 + go.t1) / 2).lift, 0, "the rook grinds, no lift");
  // the same for black, kept in (0, 2π]: facing −file is 3π/2, turned to from π the short way
  const pb = plan("r3k3/8/8/8/8/8/8/4K3 b - - 0 1", "a8c8");
  const gb = pb.actors[0].legs.find((l) => l.kind === "go");
  assert.ok(gb);
  assert.ok(Math.abs(actorAt(pb, 0, (gb.t0 + gb.t1) / 2).yaw - Math.PI / 2) < 1e-9);
  const pc = plan("4k2r/8/8/8/8/8/8/4K3 b - - 0 1", "h8f8");
  const gc = pc.actors[0].legs.find((l) => l.kind === "go");
  assert.ok(gc);
  assert.ok(Math.abs(actorAt(pc, 0, (gc.t0 + gc.t1) / 2).yaw - (3 * Math.PI) / 2) < 1e-9);
  checkWhole(pc, "h8f8");
});

test("choreo: a capture — stop short, strike, the blow breaks him, step in", () => {
  const fen = after(START, "e2e4", "d7d5");
  const pl = plan(fen, "e4d5");
  checkWhole(pl, "exd5");
  const v = pl.victim;
  assert.ok(v);
  assert.deepEqual(v.at, [3, 4], "the victim on the to-square");
  assert.deepEqual([v.kind, v.side, v.by], ["p", "b", 0]);
  const a = pl.actors[0];
  assert.ok(v.breakAt > a.start && v.breakAt < a.end, "the blow lands within the move");
  const atBlow = actorAt(pl, 0, v.breakAt);
  assert.equal(atBlow.pose, "thrust", "a pawn thrusts");
  const short = d(atBlow.at, v.at);
  assert.ok(short > 0.3 && short < 0.4, `stopped short (${short})`);
  // short of the square from when it sets off till the blow
  for (let t = 0; t <= v.breakAt; t += 0.01) assert.ok(d(actorAt(pl, 0, t).at, v.at) >= 0.34);
  assert.ok(near(actorAt(pl, 0, pl.duration).at, [3, 4]));
  // the victim: whole, flinching, breaking, gone
  assert.equal(victimAt(pl, -0.1).state, "whole");
  assert.equal(victimAt(pl, v.breakAt - 0.01).state, "flinch");
  assert.ok(victimAt(pl, v.breakAt - 0.01).k > 0.9);
  const br = victimAt(pl, v.breakAt + 0.3);
  assert.equal(br.state, "breaking");
  assert.ok(br.k > 0 && br.k < 1);
  assert.equal(victimAt(pl, pl.duration).state, "gone");
  // he turns to face the blow (from e4's side: down-left of him, +file −rank for a black man)
  assert.ok(angle(v.yaw, Math.atan2(1, -1)) < 1e-9);
  // a queen strikes with her sword
  const q = plan(after(START, "e2e4", "d7d5", "d1g4", "c8d7"), "g4d7");
  checkWhole(q, "Qxd7");
  assert.ok(q.victim);
  assert.equal(actorAt(q, 0, q.victim.breakAt).pose, "strike");
  assert.equal(q.end, "check");
  assert.equal(q.check, true);
  // a knight leaps short, strikes, trots in
  const n = plan("4k3/8/8/3p4/8/4N3/8/4K3 w - - 0 1", "e3d5");
  checkWhole(n, "Nxd5");
  assert.ok(n.victim);
  assert.ok(d(actorAt(n, 0, n.victim.breakAt).at, [3, 4]) > 0.3);
});

test("choreo: en passant — the victim is the passed pawn, struck from the side", () => {
  const fen = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";
  const pl = plan(fen, "e5d6");
  checkWhole(pl, "exd6 e.p.");
  const v = pl.victim;
  assert.ok(v);
  assert.deepEqual(v.at, [3, 4], "d5, not d6");
  assert.deepEqual(pl.actors[0].to, [3, 5]);
  const atBlow = actorAt(pl, 0, v.breakAt);
  assert.equal(atBlow.pose, "thrust");
  // facing the passed pawn as it strikes
  const toV = Math.atan2(v.at[0] - atBlow.at[0], v.at[1] - atBlow.at[1]);
  assert.ok(angle(atBlow.yaw, toV) < 1e-9);
  // and black's
  const pb = plan("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1", "d4e3");
  checkWhole(pb, "dxe3 e.p.");
  assert.ok(pb.victim);
  assert.deepEqual(pb.victim.at, [4, 3]);
});

test("choreo: castling — the king walks two, the rook steps round in front of him", () => {
  const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  const cases: [string, string, Fr, Fr, Fr][] = [
    [fen, "e1g1", [6, 0], [7, 0], [5, 0]],
    [fen, "e1c1", [2, 0], [0, 0], [3, 0]],
    [fen.replace(" w ", " b "), "e8g8", [6, 7], [7, 7], [5, 7]],
    [fen.replace(" w ", " b "), "e8c8", [2, 7], [0, 7], [3, 7]],
  ];
  for (const [f, mv, kTo, rFrom, rTo] of cases) {
    const pl = plan(f, mv);
    checkWhole(pl, mv);
    assert.equal(pl.actors.length, 2);
    const [k, r] = pl.actors;
    assert.deepEqual([k.kind, k.role, r.kind, r.role], ["k", "mover", "r", "castle-rook"]);
    assert.deepEqual(k.to, kTo);
    assert.deepEqual(r.from, rFrom);
    assert.deepEqual(r.to, rTo);
    assert.equal(pl.victim, null);
    // the rook starts when the king's halfway
    const walk = k.legs.find((l) => l.kind === "go");
    assert.ok(walk);
    assert.ok(Math.abs(r.start - (walk.t0 + walk.t1) / 2) < 1e-9);
    let closest = Infinity;
    let outward = 0;
    for (let t = 0; t <= pl.duration; t += 0.005) {
      const kp = actorAt(pl, 0, t).at;
      const rp = actorAt(pl, 1, t).at;
      closest = Math.min(closest, d(kp, rp));
      outward = Math.max(outward, Math.abs(rp[1] - rFrom[1]));
      // toward the centre, never off the board's edge
      assert.ok(rp[1] >= -1e-9 && rp[1] <= 7 + 1e-9);
    }
    assert.ok(closest >= 0.3, `${mv}: the rook kept clear of the king (${closest})`);
    assert.ok(outward > 0.3, `${mv}: the rook arcs out (${outward})`);
    assert.ok(pl.duration <= 2.6, `${mv}: ${pl.duration}`);
  }
});

test("choreo: promotion — the pawn arrives, then turns into the new man", () => {
  const pl = plan("7k/P7/8/8/8/8/8/K7 w - - 0 1", "a7a8");
  checkWhole(pl, "a8=Q");
  assert.ok(pl.promo);
  assert.deepEqual(pl.promo.at, [0, 7]);
  assert.equal(pl.promo.to, "q");
  assert.equal(pl.promo.side, "w");
  assert.ok(pl.promo.at_s >= pl.actors[0].end, "after the pawn's arrived");
  assert.ok(pl.promo.at_s < pl.duration);
  assert.equal(pl.actors[0].kind, "p");
  // with a capture, under-promoting
  const fen = "1r5k/P7/8/8/8/8/8/K7 w - - 0 1";
  const pc = plan(fen, "a7b8n");
  checkWhole(pc, "axb8=N");
  assert.ok(pc.promo && pc.victim);
  assert.equal(pc.promo.to, "n");
  assert.deepEqual(pc.victim.at, [1, 7]);
  assert.equal(pc.victim.kind, "r");
  assert.ok(pc.victim.breakAt < pc.actors[0].end && pc.actors[0].end <= pc.promo.at_s);
  // a knight and a queen promotion give different positions: `after` picks the man
  const pq = planMove(fen, after(fen, "a7b8q"));
  assert.ok(pq?.promo);
  assert.equal(pq.promo.to, "q");
  // black's
  const pb = plan("k7/8/8/8/8/8/p7/7K b - - 0 1", "a2a1r");
  checkWhole(pb, "a1=R");
  assert.ok(pb.promo);
  assert.deepEqual([pb.promo.at, pb.promo.to, pb.promo.side], [[0, 0], "r", "b"]);
});

test("choreo: no plan for positions not one move apart", () => {
  assert.equal(planMove(START, START), null, "identical");
  assert.equal(planMove(START, after(START, "e2e4", "e7e5")), null, "two moves");
  assert.equal(planMove(START, "4k3/8/8/8/8/8/8/4K3 b - - 0 1"), null, "unrelated");
  assert.equal(planMove(START, "not a fen"), null, "nonsense");
  // the board right but the turn not
  assert.equal(planMove(START, after(START, "e2e4").replace(" b ", " w ")), null);
});

test("choreo: check and mate", () => {
  const fen = after(START, "f2f3", "e7e5", "g2g4");
  const pl = plan(fen, "d8h4");
  checkWhole(pl, "fool's mate");
  assert.equal(pl.end, "mate");
  assert.equal(pl.check, true);
  assert.equal(pl.move.name, "d8h4");
  assert.ok(pl.duration >= 0.8 - 1e-9 && pl.duration <= 2);
  // stalemate
  const st = plan("7k/8/5Q2/6K1/8/8/8/8 w - - 0 1", "f6f7");
  assert.equal(st.end, "stalemate");
  assert.equal(st.check, false);
});

test("choreo: every man's move from the start and a busy middle game stays whole", () => {
  const kiwi = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
  for (const fen of [START, kiwi, kiwi.replace(" w ", " b ")]) {
    const p = parseFen(fen);
    // every legal move here
    for (let from = 0; from < 64; from++)
      for (let to = 0; to < 64; to++) {
        const m = legal(p, from, to);
        if (!m) continue;
        const pl = planMove(fen, toFen(play(p, m)), [from, to]);
        assert.ok(pl, `${from}-${to}`);
        checkWhole(pl, pl.move.name);
        assert.deepEqual(pl.actors[0].from, sqToFr(from));
        assert.ok(pl.duration >= 0.8 - 1e-9 && pl.duration <= 3, `${pl.move.name}: ${pl.duration}`);
        if (pl.victim) assert.ok(pl.victim.breakAt > 0 && pl.victim.breakAt < pl.actors[0].end);
      }
  }
});
