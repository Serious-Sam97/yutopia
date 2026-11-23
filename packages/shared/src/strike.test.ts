// The Strike Park (docs/plan/114-the-strike-park.md): every map measured, CS's economy and rounds played
// through, the charge, the hostages, armor, CS's movement.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  armored,
  buy,
  CSMOVE,
  checkMap,
  hit,
  holdTick,
  join,
  kill,
  lossBonus,
  type Match,
  MONEY,
  mapBoxes,
  moveInaccuracy,
  newMatch,
  ROUND,
  STRIKE_ARENA,
  STRIKE_MAPS,
  shotThrough,
  startMatch,
  stepMove,
  teamOf,
  tick,
} from "./strike/index.ts";

describe("the maps", () => {
  for (const map of STRIKE_MAPS)
    it(`${map.name} passes the map checks`, () => {
      const r = checkMap(map);
      assert.deepEqual(r.fails, [], JSON.stringify(r.times));
    });
  it("every map fits the arena, with names, spawns and buy zones", () => {
    for (const m of STRIKE_MAPS) {
      for (const v of [m.size.x0, m.size.z0, m.size.x1, m.size.z1]) assert.ok(Math.abs(v) <= STRIKE_ARENA, m.key);
      assert.ok(m.calls.length >= 3, m.key);
      assert.ok(mapBoxes(m).length > 4, m.key);
    }
  });
  it("concrete stops a shot, drywall lets it through weaker", () => {
    const map = STRIKE_MAPS[0];
    const solid = mapBoxes(map).find((b) => b.m === "brick" && b.hx > 4 && b.hz > 4);
    assert.ok(solid);
    const through = shotThrough(map, [solid.x - solid.hx - 2, 1.5, solid.z], [solid.x + solid.hx + 2, 1.5, solid.z]);
    assert.equal(through.kept, 0);
    const open = shotThrough(map, [0, 40, 0], [1, 40, 0]);
    assert.equal(open.kept, 1);
  });
});

/** A match of two a side on Sawmill, warmup skipped. */
function two(mode: "competitive" | "casual" = "competitive"): Match {
  const m = newMatch("sawmill", mode);
  join(m, "ana", "Ana", 0);
  join(m, "bia", "Bia", 0);
  join(m, "cai", "Cai", 1);
  join(m, "duda", "Duda", 1);
  startMatch(m);
  return m;
}
const run = (m: Match, secs: number) => {
  const out = [];
  for (let t = 0; t < secs; t += 0.1) out.push(...tick(m, 0.1));
  return out;
};

describe("the economy", () => {
  it("the loss bonus climbs 1400 → 3400 by 500", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(lossBonus), [1400, 1900, 2400, 2900, 3400, 3400]);
  });
  it("everyone starts on 800 with the revolver, and buys in the freeze", () => {
    const m = two();
    const ana = m.players.get("ana");
    assert.equal(ana?.money, MONEY.start);
    assert.equal(ana?.pistol, "revolver");
    assert.equal(buy(m, "ana", "ak47", true), "not enough money");
    assert.equal(buy(m, "ana", "kevlar", true), null);
    assert.equal(ana?.money, 150);
    assert.equal(buy(m, "cai", "kit", true), null);
    assert.equal(buy(m, "ana", "kit", true), "the Wardens' only");
    assert.equal(buy(m, "bia", "smoke", false), "you can't buy now");
  });
  it("a round won by elimination pays 3250, the losers 1400, a kill 300", () => {
    const m = two();
    run(m, ROUND.freeze + 0.2);
    assert.equal(m.phase, "live");
    kill(m, "ana", "cai", "ak47");
    kill(m, "bia", "duda", "revolver");
    assert.equal(m.phase, "after");
    assert.equal(m.last?.team, "r");
    assert.equal(m.players.get("ana")?.money, 800 + 300 + 3250);
    assert.equal(m.players.get("cai")?.money, 800 + 1400);
    assert.deepEqual(m.score, [1, 0]);
  });
  it("a knife kill pays 1500 (CS's)", () => {
    const m = two();
    run(m, ROUND.freeze + 0.2);
    kill(m, "ana", "cai", "knife");
    assert.equal(m.players.get("ana")?.money, 800 + 1500);
  });
  it("the sniper's kill pays 100, the double-barrel's 900", () => {
    const m = two();
    run(m, ROUND.freeze + 0.2);
    kill(m, "ana", "cai", "sniper");
    kill(m, "bia", "duda", "shotgun");
    assert.equal(m.players.get("ana")?.money, 800 + 100 + 3250);
    assert.equal(m.players.get("bia")?.money, 800 + 900 + 3250);
  });
});

describe("the charge", () => {
  it("one Raider carries it; planted on a site it goes off in 40 s and pays the plant", () => {
    const m = two();
    run(m, ROUND.freeze + 0.2);
    const carrier = [...m.players.values()].find((p) => p.bomb);
    assert.ok(carrier && teamOf(m, carrier) === "r");
    const A = m.map.sites?.A;
    assert.ok(A);
    const at: [number, number] = [(A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2];
    for (let t = 0; t < ROUND.plant + 0.2; t += 0.1) holdTick(m, carrier.id, true, at, 0.1);
    assert.equal(m.phase, "planted");
    assert.equal(carrier.money, 800 + MONEY.plant);
    const ev = run(m, ROUND.fuse + 0.5);
    assert.ok(ev.some((e) => e.e === "exploded"));
    assert.equal(m.last?.why, "bomb");
    // the losers planted on: +800
    assert.equal(m.players.get("cai")?.money, 800 + 1400);
  });
  it("defused in 5 s with a kit; let go and it starts over", () => {
    const m = two();
    buy(m, "cai", "kit", true);
    run(m, ROUND.freeze + 0.2);
    const carrier = [...m.players.values()].find((p) => p.bomb);
    assert.ok(carrier);
    const A = m.map.sites?.A;
    assert.ok(A);
    const at: [number, number] = [(A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2];
    for (let t = 0; t < ROUND.plant + 0.2; t += 0.1) holdTick(m, carrier.id, true, at, 0.1);
    for (let t = 0; t < 3; t += 0.1) holdTick(m, "cai", true, at, 0.1);
    holdTick(m, "cai", false, at, 0.1);
    assert.equal(m.charge?.defuser, undefined);
    for (let t = 0; t < ROUND.defuseKit + 0.2; t += 0.1) holdTick(m, "cai", true, at, 0.1);
    assert.equal(m.last?.why, "defuse");
    assert.equal(m.last?.team, "w");
  });
  it("the Raiders dead after the plant don't end the round", () => {
    const m = two();
    run(m, ROUND.freeze + 0.2);
    const carrier = [...m.players.values()].find((p) => p.bomb);
    assert.ok(carrier);
    const A = m.map.sites?.A;
    assert.ok(A);
    for (let t = 0; t < ROUND.plant + 0.2; t += 0.1)
      holdTick(m, carrier.id, true, [(A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2], 0.1);
    kill(m, "cai", "ana", "ak47");
    kill(m, "cai", "bia", "ak47");
    assert.equal(m.phase, "planted");
  });
  it("the clock running out wins it for the Wardens; the Raiders alive get nothing", () => {
    const m = two();
    run(m, ROUND.freeze + ROUND.round + 0.5);
    assert.equal(m.last?.why, "time");
    assert.equal(m.last?.team, "w");
    assert.equal(m.players.get("ana")?.money, 800);
  });
});

describe("the match", () => {
  it("sides swap at 12 rounds with money reset; first to 13 wins", () => {
    const m = two();
    const sideAt = () => teamOf(m, m.players.get("ana") as never);
    for (let r = 0; r < 12; r++) {
      run(m, ROUND.freeze + 0.2);
      kill(m, "ana", "cai", "ak47");
      kill(m, "ana", "duda", "ak47");
      run(m, ROUND.after + 0.2);
    }
    assert.deepEqual(m.score, [12, 0]);
    assert.equal(m.phase, "half");
    assert.equal(sideAt(), "w");
    assert.equal(m.players.get("ana")?.money, MONEY.start);
    run(m, ROUND.half + 0.2);
    run(m, ROUND.freeze + 0.2);
    kill(m, "ana", "cai", "ak47");
    kill(m, "ana", "duda", "ak47");
    const ev = run(m, ROUND.after + 0.2);
    assert.ok(ev.some((e) => e.e === "over" && e.squad === 0));
  });
  it("12–12 goes to overtime at 10 000 each", () => {
    const m = two();
    for (let r = 0; r < 24; r++) {
      run(m, ROUND.freeze + 0.2);
      // squad 0 wins the first 12, squad 1 the next 12 (each side wins its own)
      const killers = r < 12 ? ["ana", ["cai", "duda"]] : ["cai", ["ana", "bia"]];
      for (const v of killers[1]) kill(m, killers[0] as string, v, "ak47");
      run(m, ROUND.after + 0.2);
      if (m.phase === "half") run(m, ROUND.half + 0.2);
    }
    assert.deepEqual(m.score, [12, 12]);
    assert.equal(m.overtime, 1);
    assert.equal(m.players.get("ana")?.money, MONEY.overtime);
  });
  it("Casual gives armor, a helmet and the Wardens a kit each round", () => {
    const m = two("casual");
    const cai = m.players.get("cai");
    assert.equal(cai?.armor, 100);
    assert.equal(cai?.kit, true);
    assert.equal(m.players.get("ana")?.kit, false);
  });
  it("Deathmatch respawns in 2 s and scores by gun", () => {
    const m = newMatch("sawmill", "deathmatch");
    join(m, "ana", "Ana", 0);
    join(m, "bia", "Bia", 1);
    startMatch(m);
    kill(m, "ana", "bia", "revolver", true);
    assert.equal(m.players.get("ana")?.score, 20);
    const ev = run(m, 2.2);
    assert.ok(ev.some((e) => e.e === "respawn" && e.id === "bia"));
  });
  it("Arms Race climbs the ladder and the revolver's kill wins", () => {
    const m = newMatch("sawmill", "armsrace");
    join(m, "ana", "Ana", 0);
    join(m, "bia", "Bia", 1);
    startMatch(m);
    assert.equal(m.players.get("ana")?.primary, "daybreak");
    let over = false;
    for (let k = 0; k < 20 && !over; k++) {
      kill(m, "ana", "bia", "x");
      over = m.phase === "over";
      run(m, 2.2);
    }
    assert.ok(over);
    assert.equal(m.players.get("ana")?.level, 4);
  });
});

describe("armor and hits", () => {
  it("kevlar takes half a body hit; legs aren't covered; the sniper goes through", () => {
    assert.deepEqual(armored(40, "body", 100, false, "ak47"), [20, 10]);
    assert.deepEqual(armored(40, "legs", 100, true, "ak47"), [40, 0]);
    assert.deepEqual(armored(40, "head", 100, false, "ak47"), [40, 0]);
    assert.equal(armored(170, "body", 100, true, "sniper")[0], 145);
  });
  it("friendly fire off in Casual, on in Competitive", () => {
    const c = two("casual");
    run(c, ROUND.freeze + 0.2);
    assert.equal(hit(c, "ana", "bia", "ak47", 22, "body"), null);
    const k = two();
    run(k, ROUND.freeze + 0.2);
    assert.equal(hit(k, "ana", "bia", "ak47", 22, "body")?.hp, 78);
  });
});

describe("CS's movement", () => {
  const go = (v: { x: number; z: number }, wx: number, max: number, secs: number) => {
    for (let t = 0; t < secs; t += 1 / 64)
      v = stepMove(v, { wx, wz: 0, walk: false, crouch: false, max, onGround: true, tagged: 0 }, 1 / 64);
    return v;
  };
  it("reaches the AK's run speed (5.46) and never passes it", () => {
    const v = go({ x: 0, z: 0 }, 1, 5.46, 2);
    assert.ok(Math.abs(v.x - 5.46) < 0.05, `${v.x}`);
  });
  it("a counter-strafe stops you accurate in ≤ 0.12 s", () => {
    let v = go({ x: 0, z: 0 }, 1, 5.46, 2);
    let t = 0;
    while (moveInaccuracy(Math.abs(v.x), 5.46, true) > 0 && t < 1) {
      v = stepMove(v, { wx: -1, wz: 0, walk: false, crouch: false, max: 5.46, onGround: true, tagged: 0 }, 1 / 64);
      t += 1 / 64;
    }
    assert.ok(t <= 0.12, `${t}`);
  });
  it("a jump's 57 u high", () => {
    const h = CSMOVE.jumpV ** 2 / (2 * CSMOVE.gravity);
    assert.ok(Math.abs(h - 57 * 0.0254) < 0.01);
  });
});

import { flashFor, heDamage, NADE, SAWMILL, stepNade, throughSmoke, throwNade } from "./strike/index.ts";

describe("the grenades", () => {
  const land = () => {
    const n = throwNade(1, "smoke", "ana", [0, 1.6, 60], -Math.PI / 2, 0.5, false);
    for (let i = 0; i < 64 * 8 && !n.rest; i++) stepNade(SAWMILL, n, 1 / 64);
    return n;
  };
  it("a lineup: the same throw lands in the same place, 100 of 100", () => {
    const a = land();
    assert.ok(a.rest);
    for (let k = 0; k < 100; k++) {
      const b = land();
      assert.equal(b.x, a.x);
      assert.equal(b.z, a.z);
    }
  });
  it("it bounces off a wall, never through one", () => {
    // thrown hard at the brick block east of the middle (the kiln), from the middle lane
    const n = throwNade(2, "he", "ana", [3, 1.6, 20], 0, 0, false);
    for (let i = 0; i < 64 * 4 && !n.rest; i++) stepNade(SAWMILL, n, 1 / 64);
    assert.ok(n.x < 12, `${n.x}`);
  });
  it("a smoke blocks the line through it; the HE hurts less further off", () => {
    const s = {
      ...throwNade(3, "smoke", "x", [0, 0, 0], 0, 0, false),
      x: 0,
      y: 0,
      z: 0,
      state: "smoke" as const,
      left: 10,
    };
    assert.ok(throughSmoke([s], [-10, 1.6, 0], [10, 1.6, 0]));
    assert.ok(!throughSmoke([s], [-10, 1.6, 9], [10, 1.6, 9]));
    assert.ok(heDamage(1) > heDamage(5) && heDamage(5) > 0 && heDamage(NADE.he.r) === 0);
  });
  it("a flash whites out who faces it, less side on, none through a wall", () => {
    const at: [number, number, number] = [0, 1.5, 20];
    const facing = flashFor(SAWMILL, at, [0, 1.6, 26], -Math.PI / 2, 0);
    const away = flashFor(SAWMILL, at, [0, 1.6, 26], Math.PI / 2, 0);
    assert.ok(facing > 3, `${facing}`);
    assert.ok(away < facing / 3);
  });
});

// (plan 115 phases 96–97) ranks, stats, the day's missions
import { addMatch, emptyTally, MISSIONS, missionsOf, newCard, RANKS, rankOf, xpOf } from "./strike/index.ts";

describe("the Strike Park's ranks and missions", () => {
  it("climbs the ladder by XP", () => {
    assert.equal(rankOf(0).rank.name, RANKS[0].name);
    assert.equal(rankOf(RANKS[3].xp).i, 3);
    assert.equal(rankOf(RANKS[3].xp - 1).i, 2);
    assert.equal(rankOf(1e9).next, null);
    for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].xp > RANKS[i - 1].xp);
  });
  it("picks the same three missions for a day, all different", () => {
    for (let d = 20000; d < 20030; d++) {
      const a = missionsOf(d);
      assert.equal(a.length, 3);
      assert.equal(new Set(a.map((m) => m.id)).size, 3);
      assert.deepEqual(a, missionsOf(d));
    }
    assert.equal(new Set(MISSIONS.map((m) => m.id)).size, MISSIONS.length);
  });
  it("adds a match: XP, stats, history, a mission paid once, a rank up after wins", () => {
    const c = newCard("Bia");
    const now = Date.UTC(2026, 10, 22, 12);
    const t = emptyTally("lodge", "competitive", "r");
    Object.assign(t, {
      won: true,
      kills: 20,
      deaths: 8,
      heads: 6,
      roundsWon: 13,
      rounds: 20,
      plants: 2,
      defuses: 1,
      rescues: 2,
      mvps: 3,
      knife: 1,
    });
    t.guns = { ak47: 10, sniper: 5, revolver: 5 };
    t.roundsWith = { ak47: 4 };
    const got = addMatch(c, t, now);
    assert.ok(got.xp >= xpOf(t));
    assert.equal(c.matches, 1);
    assert.equal(c.wins, 1);
    assert.equal(c.kills, 20);
    assert.deepEqual(c.maps.lodge, [1, 1]);
    assert.equal(c.history.length, 1);
    assert.ok(got.rankUp, "a big win moves you up");
    // (the same day again: the missions done aren't paid twice)
    const paid = c.paid.length;
    const again = addMatch(c, t, now + 1000);
    assert.equal(c.paid.length, paid + again.missions.length);
    for (const m of again.missions) assert.ok(!got.missions.includes(m));
  });
});
