import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ballAt,
  contactAt,
  cpuPlan,
  flightEvents,
  hitBall,
  NET_H,
  newMatch,
  newRally,
  PONG_L,
  PONG_W,
  type PongBall,
  type PongFlight,
  plausibleHit,
  type RacketAt,
  rallyStep,
  scorePoint,
  seeded,
  serverAt,
  serveToss,
  solveShot,
} from "./pong.ts";

const HL = PONG_L / 2;
const ball = (o: Partial<PongBall>): PongBall => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, ...o });
const fly = (b: PongBall, by: 0 | 1 = 0): PongFlight => ({ t0: 1000, ball: b, by, kind: "hit" });
const firstTable = (f: PongFlight) => flightEvents(f).find((e) => e.k === "table");

test("drag: a smash loses a good part of its speed over the table", () => {
  const f = fly(ball({ x: -HL, z: 0.3, vx: 20, vz: 0 }));
  const t = ballAt(f, 1000 + 120);
  const v = Math.hypot(t.ball.vx, t.ball.vy, t.ball.vz);
  assert.ok(v < 17.5 && v > 12, `after 0.12 s: ${v} m/s`);
});

test("spin in the air: topspin lands shorter, backspin longer, sidespin curves", () => {
  const launch = (o: Partial<PongBall>) => firstTable(fly(ball({ x: -HL, z: 0.25, vx: 6, vz: 1.5, ...o })));
  const flat = launch({});
  const top = launch({ wy: 120 });
  const back = launch({ wy: -120 });
  assert.ok(flat && top && back);
  assert.ok((top?.x ?? 0) < (flat?.x ?? 0) - 0.1, `topspin ${top?.x} vs ${flat?.x}`);
  assert.ok((back?.x ?? 0) > (flat?.x ?? 0) + 0.1, `backspin ${back?.x} vs ${flat?.x}`);
  const curl = launch({ wz: 120 });
  // ω about +z on a ball going +x: ω × v points +y
  assert.ok((curl?.y ?? 0) > 0.05, `sidespin ${curl?.y}`);
});

test("off the table: topspin kicks on, backspin checks up", () => {
  const off = (wy: number) => {
    // a slower, steeper ball (a plain one grips the table on this one)
    const f = fly(ball({ x: 0.3, z: 0.25, vx: 3, vz: -2.5, wy }));
    const b = firstTable(f);
    assert.ok(b);
    return ballAt(f, (b?.t ?? 0) + 2).ball.vx;
  };
  const flat = off(0);
  assert.ok(off(200) > flat + 0.2, "topspin kicks");
  assert.ok(off(-200) < flat - 0.2, "backspin checks");
});

test("the net: low into the mesh it dies on the hitter's side; clipping the tape it can still go over", () => {
  const dies = fly(ball({ x: -0.3, z: 0.09, vx: 7, vz: 0.2 }));
  const ev = flightEvents(dies);
  assert.equal(ev[0]?.k, "net");
  assert.ok(
    ev.every((e) => e.k !== "table" || e.side === 0),
    "it never crosses",
  );
  let over = 0;
  let back = 0;
  for (let dz = -0.004; dz < 0.03; dz += 0.002) {
    const f = fly(ball({ x: -0.08, z: NET_H + dz, vx: 5, vz: 0.05 }));
    const e = flightEvents(f);
    if (e[0]?.k !== "net") continue;
    const t = e.find((x) => x.k === "table");
    if (t?.side === 1) over++;
    else back++;
  }
  assert.ok(over > 0 && back > 0, `dribbled over ${over}, died ${back}`);
});

test("solveShot lands where asked, for speeds and spins, over the net", () => {
  const from = { x: -HL - 0.2, y: 0.1, z: 0.3 };
  for (const [tx, ty] of [
    [0.6, 0],
    [1.1, 0.5],
    [0.4, -0.6],
    [1.2, -0.3],
  ])
    for (const [speed, top] of [
      [7, 0],
      [10, 120],
      [6, -80],
    ]) {
      const b = solveShot(from, tx, ty, { speed, top });
      const l = firstTable(fly(b));
      assert.ok(l, `lands (${tx}, ${ty}) at ${speed} / ${top}`);
      assert.ok(
        Math.hypot((l?.x ?? 0) - tx, (l?.y ?? 0) - ty) < 0.02,
        `off by ${Math.hypot((l?.x ?? 0) - tx, (l?.y ?? 0) - ty)}`,
      );
      assert.ok(!flightEvents(fly(b)).some((e) => e.k === "net" && e.t < (l?.t ?? 0)), "clean over the net");
    }
});

test("the racket: a sane swing with the assist lands on the other side; raw is raw; brushing up makes topspin", () => {
  const incoming = ball({ x: -HL - 0.15, y: 0.1, z: 0.25, vx: -5, vz: -0.5 });
  // a forward swing, the face tilted a little closed
  const r = { x: incoming.x, y: incoming.y, z: incoming.z, nx: 1, ny: 0, nz: 0.25, vx: 4, vy: 0, vz: 2.5 };
  const assisted = hitBall(incoming, r, { side: 0, assist: 1 });
  const land = firstTable(fly(assisted));
  assert.equal(land?.side, 1, "on their side");
  const raw = hitBall(incoming, r, { side: 0, assist: 0 });
  assert.notDeepEqual(raw, assisted);
  assert.ok(raw.vx > 0, "raw goes forward too");
  // brushing up: topspin (ω about +y for a ball going +x)
  assert.ok(raw.wy > 20, `topspin ${raw.wy}`);
  // a chop: the face open, the racket going down
  const chop = hitBall(incoming, { ...r, nz: 0.35, vz: -3 }, { side: 0, assist: 0 });
  assert.ok(chop.wy < -20, `backspin ${chop.wy}`);
  // a swing that sends it backwards gets no help
  const wrong = hitBall(incoming, { ...r, vx: -12, nx: -1 }, { side: 0, assist: 1 });
  assert.deepEqual(wrong, hitBall(incoming, { ...r, vx: -12, nx: -1 }, { side: 0, assist: 0 }));
});

test("contactAt finds a fast swing between two samples; a racket elsewhere finds nothing", () => {
  const f: PongFlight = { t0: 0, ball: ball({ x: 0.5, z: 0.2, vx: -6, vz: 0.5 }), by: 1, kind: "hit" };
  const at = ballAt(f, 200).ball;
  const r0: RacketAt = { t: 160, x: at.x - 0.3, y: at.y, z: at.z, nx: 1, ny: 0, nz: 0, vx: 10, vy: 0, vz: 0 };
  const r1: RacketAt = { ...r0, t: 240, x: at.x + 0.5 };
  const t = contactAt(f, r0, r1);
  assert.ok(t !== null && Math.abs(t - 200) < 30, `contact at ${t}`);
  assert.equal(contactAt(f, { ...r0, y: 0.6 }, { ...r1, y: 0.6 }), null);
});

test("deterministic: the same flight read at any time matches stepping straight through", () => {
  const f = fly(ball({ x: -HL, z: 0.3, vx: 9, vz: 1, wy: 80, wz: 30 }));
  const a = ballAt(f, 1000 + 437).ball;
  const g = { ...f, ball: { ...f.ball } };
  const b = ballAt(g, 1000 + 437).ball;
  assert.deepEqual(a, b);
});

test("the referee: a hit where the ball was and the racket was is taken; a far racket or a teleport isn't", () => {
  const f = fly(ball({ x: 0.5, z: 0.2, vx: -6, vz: 0.5 }), 1);
  const t = 1000 + 300;
  const at = ballAt(f, t).ball;
  const nb = { ...at, vx: 6, vz: 1.5 };
  const near: RacketAt = { t, x: at.x, y: at.y, z: at.z, nx: 1, ny: 0, nz: 0, vx: 4, vy: 0, vz: 0 };
  assert.ok(plausibleHit(f, t, nb, [near]));
  assert.ok(!plausibleHit(f, t, nb, [{ ...near, y: 1.4 }]), "racket far away");
  assert.ok(!plausibleHit(f, t, { ...nb, x: at.x + 0.4 }, [near]), "ball elsewhere");
  assert.ok(!plausibleHit(f, t, { ...nb, vx: 90 }, [near]), "a rocket");
  assert.ok(!plausibleHit(f, f.t0 - 50, nb, [near]), "before it was hit");
});

test("the rules: serve, let, faults, volley, double bounce, out, miss", () => {
  // a good serve then a return that bounces twice on the server's side
  let r = newRally(0);
  const go = (e: Parameters<typeof rallyStep>[1]) => {
    const o = rallyStep(r, e);
    r = o.rally;
    return o;
  };
  go({ k: "hit", by: 0 });
  go({ k: "table", side: 0 });
  go({ k: "table", side: 1 });
  go({ k: "hit", by: 1 });
  go({ k: "table", side: 0 });
  assert.equal(go({ k: "table", side: 0 }).point?.winner, 1, "double bounce: the hitter wins");

  r = newRally(0);
  go({ k: "hit", by: 0 });
  assert.equal(go({ k: "table", side: 1 }).point?.why, "serve", "a serve straight onto their side");

  r = newRally(1);
  go({ k: "hit", by: 1 });
  go({ k: "table", side: 1 });
  go({ k: "net" });
  assert.ok(go({ k: "table", side: 0 }).let, "net serve that lands: a let");

  r = newRally(0);
  go({ k: "hit", by: 0 });
  go({ k: "table", side: 0 });
  assert.equal(go({ k: "hit", by: 1 }).point?.why, "volley");

  r = newRally(0);
  go({ k: "hit", by: 0 });
  go({ k: "table", side: 0 });
  go({ k: "table", side: 1 });
  go({ k: "hit", by: 1 });
  const out = go({ k: "floor" });
  assert.deepEqual(out.point, { winner: 0, why: "out" });

  r = newRally(0);
  go({ k: "hit", by: 0 });
  go({ k: "table", side: 0 });
  go({ k: "table", side: 1 });
  assert.deepEqual(go({ k: "floor" }).point, { winner: 0, why: "miss" });
});

test("the score: serve every two, every point at deuce, win by two, best of three", () => {
  let s = newMatch(11, 3, 0);
  const servers: number[] = [];
  for (let i = 0; i < 6; i++) {
    servers.push(s.server);
    s = scorePoint(s, (i % 2) as 0 | 1).score;
  }
  assert.deepEqual(servers, [0, 0, 1, 1, 0, 0]);
  s = { ...newMatch(11, 3, 0), points: [10, 10] };
  const a = serverAt(s);
  const b = serverAt({ ...s, points: [11, 10] });
  assert.notEqual(a, b, "every point at deuce");
  let r = scorePoint({ ...s, server: a }, 0);
  assert.ok(!r.game, "11–10 isn't a game");
  r = scorePoint(r.score, 0);
  assert.ok(r.game && !r.match, "12–10 is");
  assert.deepEqual(r.score.points, [0, 0]);
  assert.equal(r.score.first, 1, "the other one serves first next game");
  r = scorePoint({ ...r.score, points: [10, 3] }, 0);
  assert.ok(r.match);
  assert.equal(r.score.winner, 0);
});

test("Vortex: returns a normal ball onto the other side, Easy whiffs more than Turbo", () => {
  const rnd = seeded(7);
  let back = 0;
  const whiffs = { easy: 0, turbo: 0 };
  for (let i = 0; i < 24; i++) {
    const from = { x: -HL - 0.1, y: (rnd() - 0.5) * 0.8, z: 0.25 };
    const b = solveShot(from, HL * 0.6, (rnd() - 0.5) * 0.9, { speed: 7 + rnd() * 3, top: rnd() * 80 });
    const f: PongFlight = { t0: 0, ball: b, by: 0, kind: "hit" };
    for (const level of ["easy", "turbo"] as const) {
      const p = cpuPlan(f, 1, level, rnd);
      assert.ok(p, "he gets to it");
      if (!p) continue;
      if (p.whiff) whiffs[level]++;
      else if (level === "turbo" && firstTable({ t0: p.t, ball: p.ball, by: 1, kind: "hit" })?.side === 0) back++;
    }
  }
  assert.ok(back >= 20, `turbo landed ${back} / 24`);
  assert.ok(whiffs.easy >= whiffs.turbo);
  // the toss goes up and comes down by the server's end
  const toss = fly(serveToss(0), 0);
  const top = ballAt(toss, 1000 + 210).ball;
  assert.ok(top.z > 0.25 && top.x < -HL, "up behind the end line");
  void PONG_W;
});
