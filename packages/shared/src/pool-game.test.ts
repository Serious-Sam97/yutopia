import assert from "node:assert/strict";
import { test } from "node:test";
import { BALL_R, newBall, type PoolBall, type PoolEvent, rack, simulate } from "./pool.ts";
import { judge, newGame, onTheEight, type PoolGame, placeCue, vortexBreak, vortexShot } from "./pool-game.ts";

// a game after the break, with these groups and these balls on the table
function midGame(groups: PoolGame["groups"], ids: number[], turn: 0 | 1 = 0): PoolGame {
  const balls: PoolBall[] = [newBall(0, -0.6, 0)];
  ids.forEach((id, i) => {
    balls.push(newBall(id, -0.2 + (i % 5) * 0.15, -0.3 + Math.floor(i / 5) * 0.15));
  });
  return { balls, turn, groups, broken: true, inHand: "", winner: -1, shots: 3 };
}
const ev = (k: PoolEvent["k"], a: number, b?: number, t = 0.1): PoolEvent => ({ t, k, a, b, speed: 1 });
const sunk = (g: PoolGame, ids: number[]) => g.balls.map((b) => (ids.includes(b.id) ? { ...b, down: 2 } : b));

test("a legal shot that pots one of mine keeps me on; the table's groups set on the first pot", () => {
  const g = midGame([null, null], [1, 2, 9, 10, 8]);
  const v = judge(g, sunk(g, [9]), [ev("cue", 0), ev("ball", 0, 9), ev("pocket", 9, 2, 0.5)], -1);
  assert.equal(v.foul, null);
  assert.equal(v.assigned, "stripes");
  assert.deepEqual(v.game.groups, ["stripes", "solids"]);
  assert.ok(v.keeps);
  assert.equal(v.game.turn, 0);
});

test("fouls: scratch, nothing hit, wrong ball first, the 8 first on an open table, no cushion — ball in hand to the other", () => {
  const g = midGame(["solids", "stripes"], [1, 2, 9, 10, 8]);
  const cases: [PoolEvent[], number[], string][] = [
    [[ev("cue", 0), ev("ball", 0, 1), ev("pocket", 0, 3, 0.4)], [0], "scratch"],
    [[ev("cue", 0), ev("rail", 0, 2)], [], "noHit"],
    [[ev("cue", 0), ev("ball", 0, 9), ev("rail", 9, 1)], [], "wrongFirst"],
    [[ev("cue", 0), ev("ball", 0, 1)], [], "noRail"],
  ];
  for (const [events, down, foul] of cases) {
    const v = judge(g, sunk(g, down), events, -1);
    assert.equal(v.foul, foul);
    assert.equal(v.game.turn, 1);
    assert.equal(v.game.inHand, "anywhere");
    assert.equal(v.game.balls.find((b) => b.id === 0)?.down, -1, "the cue ball is back on the table");
  }
  const open = midGame([null, null], [1, 9, 8]);
  assert.equal(judge(open, open.balls, [ev("cue", 0), ev("ball", 0, 8), ev("rail", 8, 0)], -1).foul, "eightFirst");
  // potting the other player's ball (after hitting mine first) is legal but I don't stay
  const v = judge(g, sunk(g, [9]), [ev("cue", 0), ev("ball", 0, 1), ev("ball", 1, 9), ev("pocket", 9, 1, 0.4)], -1);
  assert.equal(v.foul, null);
  assert.ok(!v.keeps);
});

test("the 8: early loses, wrong pocket loses, with a scratch loses, called and clean wins", () => {
  const notYet = midGame(["solids", "stripes"], [1, 9, 8]);
  assert.equal(
    judge(notYet, sunk(notYet, [8]), [ev("cue", 0), ev("ball", 0, 1), ev("pocket", 8, 2)], -1).outcome,
    "eightEarly",
  );
  const on = midGame(["solids", "stripes"], [9, 8]);
  assert.ok(onTheEight(on));
  const hit8 = [ev("cue", 0), ev("ball", 0, 8)];
  const win = judge(on, sunk(on, [8]), [...hit8, ev("pocket", 8, 2, 0.6)], 2);
  assert.equal(win.outcome, "win");
  assert.equal(win.game.winner, 0);
  const wrong = judge(on, sunk(on, [8]), [...hit8, ev("pocket", 8, 3, 0.6)], 2);
  assert.equal(wrong.outcome, "eightWrongPocket");
  assert.equal(wrong.game.winner, 1);
  const scratch = judge(on, sunk(on, [8, 0]), [...hit8, ev("pocket", 8, 2, 0.6), ev("pocket", 0, 4, 0.9)], 2);
  assert.equal(scratch.outcome, "eightScratch");
  // potting my last ball and the 8 together: still early
  const last = midGame(["solids", "stripes"], [1, 9, 8]);
  assert.equal(
    judge(last, sunk(last, [1, 8]), [ev("cue", 0), ev("ball", 0, 1), ev("pocket", 1, 0), ev("pocket", 8, 2)], 2)
      .outcome,
    "eightEarly",
  );
});

test("the break: a weak one is a foul, the 8 comes back, a scratch gives ball in hand anywhere", () => {
  const g = newGame(4, 0);
  const weak = judge(g, g.balls, [ev("cue", 0), ev("ball", 0, 1), ev("rail", 3, 2), ev("rail", 5, 2)], -1);
  assert.equal(weak.foul, "badBreak");
  assert.equal(weak.game.turn, 1);
  const eight = judge(g, sunk(g, [8]), [ev("cue", 0), ev("ball", 0, 1), ev("pocket", 8, 2)], -1);
  assert.ok(eight.respotted);
  assert.equal(eight.game.balls.find((b) => b.id === 8)?.down, -1);
  assert.equal(eight.outcome, null);
  const scr = judge(g, sunk(g, [0, 3]), [ev("cue", 0), ev("ball", 0, 1), ev("pocket", 3, 0), ev("pocket", 0, 1)], -1);
  assert.equal(scr.foul, "scratch");
  assert.equal(scr.game.inHand, "anywhere");
  assert.equal(scr.game.turn, 1);
  // a real break, through the physics
  const real = simulate(g.balls, vortexBreak("hard", 1, g.balls[0]));
  const v = judge(g, real.balls, real.events, -1);
  assert.ok(v.game.broken);
  assert.equal(v.game.groups[0], null, "the table stays open after the break");
});

test("ball in hand: only where it's allowed", () => {
  const g = { ...midGame(["solids", "stripes"], [1, 9, 8]), inHand: "kitchen" as const };
  assert.ok(!placeCue(g, 0.3, 0));
  assert.ok(placeCue(g, -0.7, 0.2));
  const one = g.balls.find((b) => b.id === 1) as PoolBall;
  const anywhere = { ...g, inHand: "anywhere" as const };
  assert.ok(!placeCue(anywhere, one.x + BALL_R, one.y));
});

test("Vortex: Turbo pots an easy ball nearly every time, Easy misses more; a whole game ends", () => {
  // a straight-ish shot into the corner
  const easyShot = (): PoolGame => {
    const balls = [newBall(0, 0.2, -0.1), newBall(1, 0.6, -0.3), newBall(9, -0.5, 0.3), newBall(8, -0.2, 0.35)];
    return { balls, turn: 0, groups: ["solids", "stripes"], broken: true, inHand: "", winner: -1, shots: 4 };
  };
  const rate = (level: "easy" | "turbo") => {
    let made = 0;
    for (let s = 1; s <= 8; s++) {
      const g = easyShot();
      const vs = vortexShot(g, level, s * 31);
      const r = simulate(g.balls, vs.shot);
      if (r.events.some((e) => e.k === "pocket" && e.a === 1)) made++;
    }
    return made / 8;
  };
  const turbo = rate("turbo");
  const easy = rate("easy");
  assert.ok(turbo >= 0.85, `turbo ${turbo}`);
  assert.ok(easy <= turbo, `easy ${easy}`);

  // Vortex against himself, a whole rack: it ends, and quickly enough to run on a server
  let g = newGame(12, 0);
  let longest = 0;
  for (let n = 0; n < 120 && g.winner < 0; n++) {
    const t0 = performance.now();
    const vs = g.broken
      ? vortexShot(g, "hard", n)
      : { shot: vortexBreak("hard", n, g.balls[0]), called: -1, place: undefined };
    longest = Math.max(longest, performance.now() - t0);
    if (vs.place) assert.ok(placeCue(g, vs.place.x, vs.place.y));
    const r = simulate(g.balls, vs.shot);
    g = judge(g, r.balls, r.events, vs.called).game;
  }
  assert.ok(g.winner >= 0, "someone won");
  assert.ok(longest < 1500, `a turn took ${longest} ms to think`);
  void rack;
});
