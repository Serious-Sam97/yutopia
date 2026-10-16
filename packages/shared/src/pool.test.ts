import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aimGuide,
  BALL_R,
  HEAD_STRING,
  newBall,
  POOL_L,
  POOL_POCKETS,
  POOL_W,
  type PoolBall,
  PoolSim,
  placeOk,
  rack,
  simulate,
} from "./pool.ts";

const energy = (balls: PoolBall[]) =>
  balls.reduce((e, b) => {
    if (b.down >= 0) return e;
    const I = 0.4 * BALL_R * BALL_R;
    return e + 0.5 * (b.vx * b.vx + b.vy * b.vy) + 0.5 * I * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
  }, 0);

test("the rack: 16 balls, 8 in the middle, a solid and a stripe in the back corners, racked tight", () => {
  for (const seed of [1, 7, 99]) {
    const b = rack(seed);
    assert.equal(b.length, 16);
    assert.deepEqual(
      b.map((x) => x.id).sort((a, c) => a - c),
      [...Array(16).keys()],
    );
    const eight = b.find((x) => x.id === 8) as PoolBall;
    const back = b.filter((x) => Math.abs(x.x - Math.max(...b.map((y) => y.x))) < 1e-3).sort((p, q) => p.y - q.y);
    assert.equal(back.length, 5);
    const kinds = [back[0].id, back[4].id].map((id) => (id < 8 ? "solid" : "stripe")).sort();
    assert.deepEqual(kinds, ["solid", "stripe"]);
    assert.ok(Math.abs(eight.y) < 1e-3, "the 8 in the middle of its row");
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++)
        assert.ok(Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y) >= 2 * BALL_R - 2e-4);
  }
  assert.notDeepEqual(
    rack(1).map((b) => b.id),
    rack(2).map((b) => b.id),
  );
});

test("a full-power break: never tunnels, energy only goes down, ends in sane time, spreads the rack", () => {
  let rails = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = new PoolSim(rack(seed), { angle: 0, power: 1, spinX: 0, spinY: 0 });
    let e = energy(sim.balls);
    while (sim.step(1 / 60)) {
      const now = energy(sim.balls);
      assert.ok(now <= e + 1e-9, `energy rose at ${sim.t}`);
      e = now;
      const on = sim.balls.filter((b) => b.down < 0);
      for (let i = 0; i < on.length; i++) {
        const a = on[i];
        assert.ok(Math.abs(a.x) <= POOL_L / 2 + 0.06 && Math.abs(a.y) <= POOL_W / 2 + 0.06, "stays on the table");
        for (let j = i + 1; j < on.length; j++)
          assert.ok(
            Math.hypot(a.x - on[j].x, a.y - on[j].y) > 2 * BALL_R - 2e-4,
            "balls never pass through each other",
          );
      }
    }
    assert.ok(sim.duration < 15, `break took ${sim.duration} s`);
    rails += new Set(sim.events.filter((x) => x.k === "rail").map((x) => x.a)).size;
  }
  assert.ok(rails / 6 >= 8, `on average ${rails / 6} balls reach a cushion`);
});

// the cue ball 0.25 m short of an object ball, straight on
const straight = (spinY: number, power = 0.5) =>
  simulate([newBall(0, -0.6, 0), newBall(1, -0.35, 0)], { angle: 0, power, spinX: 0, spinY }).balls;
const firstHit = (spinY: number, power = 0.5) => {
  const sim = new PoolSim([newBall(0, -0.6, 0), newBall(1, -0.35, 0)], { angle: 0, power, spinX: 0, spinY });
  while (sim.step(0.001) && !sim.events.some((e) => e.k === "ball")) {}
  sim.step(0.8);
  return sim.balls;
};

test("stun stops the cue ball, draw brings it back, follow goes through", () => {
  // where the cue ball is 0.8 s after hitting the object ball
  const stun = firstHit(-0.25, 0.45)[0]; // a touch low to arrive sliding with no spin
  const draw = firstHit(-1)[0];
  const follow = firstHit(1)[0];
  const contact = -0.35 - 2 * BALL_R;
  assert.ok(Math.abs(stun.x - contact) < 0.06, `stun: ${stun.x - contact}`);
  assert.ok(draw.x < contact - 0.1, `draw: ${draw.x - contact}`);
  assert.ok(follow.x > contact + 0.1, `follow: ${follow.x - contact}`);
  void straight;
});

test("throw: a slow half-ball cut sends the object ball a few degrees off the line of centres, a hard one barely", () => {
  const throwAt = (power: number) => {
    const cut = Math.PI / 6;
    const sim = new PoolSim(
      [newBall(0, -2 * BALL_R * Math.cos(cut) - 0.2, 2 * BALL_R * Math.sin(cut)), newBall(1, 0, 0)],
      {
        angle: 0,
        power,
        spinX: 0,
        spinY: 0,
      },
    );
    while (sim.step(0.001) && !sim.events.some((e) => e.k === "ball")) {}
    sim.step(0.002);
    const o = sim.balls[1];
    return (Math.atan2(o.vy, o.vx) * 180) / Math.PI + 30;
  };
  const slow = throwAt(0.1);
  const hard = throwAt(0.8);
  assert.ok(slow > 2.5 && slow < 6.5, `slow: ${slow}°`);
  assert.ok(hard > 0 && hard < 1.5, `hard: ${hard}°`);
});

test("english changes the angle off a cushion: running opens it, check closes it", () => {
  // the cue ball sent into the +y cushion at 45°, heading +x +y
  const off = (spinX: number) => {
    const sim = new PoolSim([newBall(0, -0.6, 0.1)], { angle: Math.PI / 4, power: 0.35, spinX, spinY: 0 });
    while (sim.step(0.001) && !sim.events.some((e) => e.k === "rail")) {}
    sim.step(0.004);
    const b = sim.balls[0];
    return Math.atan2(-b.vy, b.vx); // the angle between its way and the rail: smaller = wider off it
  };
  const plain = off(0);
  const running = off(1); // heading up-right and coming off to the right: right english runs
  const check = off(-1);
  assert.ok(running < plain - 0.08, `running english widens the angle off the rail: ${running} vs ${plain}`);
  assert.ok(check > plain - 0.04, `check english doesn't widen it: ${check} vs ${plain}`);
});

test("a ball sent straight at a corner pocket drops; one hitting the jaw hard and wide rattles out", () => {
  const p = POOL_POCKETS[3];
  const ang = Math.atan2(p.y, p.x);
  const dead = simulate([newBall(0, 0, 0)], { angle: ang, power: 0.4, spinX: 0, spinY: 0 });
  assert.equal(dead.balls[0].down, 3);
  // a little off the line from the table's middle, firm: catches the end rail's jaw and stays out
  const jawed = simulate([newBall(0, 0.3, -0.2)], {
    angle: Math.atan2(p.y + 0.2, p.x - 0.3),
    power: 0.7,
    spinX: 0,
    spinY: 0,
  });
  assert.equal(jawed.balls[0].down, -1, "rattled out");
  assert.ok(jawed.events.some((e) => e.k === "jaw"));
  // …and a hair further in it drops
  const inside = simulate([newBall(0, 0.3, -0.2)], {
    angle: Math.atan2(p.y + 0.2, p.x - 0.3) + 0.02,
    power: 0.7,
    spinX: 0,
    spinY: 0,
  });
  assert.equal(inside.balls[0].down, 3);
});

test("deterministic: the same shot twice is identical, and stepping unevenly gives what simulate gives", () => {
  const shot = { angle: 0.013, power: 0.93, spinX: 0.2, spinY: -0.4 };
  const a = simulate(rack(5), shot);
  const b = simulate(rack(5), shot);
  assert.deepEqual(a, b);
  const sim = new PoolSim(rack(5), shot);
  let k = 0;
  while (sim.step([0.016, 0.0071, 0.033, 0.1][k++ % 4])) {}
  assert.deepEqual(sim.balls, a.balls);
  assert.deepEqual(sim.events, a.events);
});

test("ball in hand: on the cloth, not on a ball, behind the head string when asked", () => {
  const balls = rack(3);
  assert.ok(placeOk(balls, -0.6, 0.1));
  assert.ok(!placeOk(balls, POOL_L / 2, 0), "off the cloth");
  const one = balls.find((b) => b.id === 1) as PoolBall;
  assert.ok(!placeOk(balls, one.x + BALL_R, one.y), "on a ball");
  assert.ok(placeOk(balls, HEAD_STRING + 0.1, 0.3));
  assert.ok(!placeOk(balls, HEAD_STRING + 0.1, 0.3, true), "the kitchen");
});

test("the guideline's first contact is the shot's first contact", () => {
  for (const seed of [1, 2]) {
    const balls = rack(seed);
    for (const angle of [0, 0.02, -0.03, 0.1]) {
      const g = aimGuide(balls, angle);
      const r = simulate(balls, { angle, power: 0.3, spinX: 0, spinY: 0 });
      const first = r.events.find((e) => e.k === "ball" || e.k === "rail");
      if (g.hit >= 0) {
        assert.equal(first?.k, "ball");
        assert.equal(first?.b, g.hit);
      }
    }
  }
  // a plain cut: the object ball's way is the line from the ghost ball through it
  const g = aimGuide([newBall(0, -0.5, 0), newBall(1, 0, 0.03)], 0);
  assert.equal(g.hit, 1);
  assert.ok(Math.abs(Math.hypot(g.gx - 0, g.gy - 0.03) - 2 * BALL_R) < 1e-9);
  assert.ok(g.oy > 0 && g.cy < 0, "object one way, cue ball the other");
});
