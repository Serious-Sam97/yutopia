// Plan 117: the bots' lab as tests — every map played by bots in simulated time, with the plan's limits on what the
// user found wrong (the radio repeating, the bunching, deaths not looking at the killer, a bomb mode with no plants,
// standing about), the levels in order, the maps understood, the radio's rules, and nothing sensed that couldn't be.

import assert from "node:assert/strict";
import { test } from "node:test";
import { gridOf, nodeNear, nodePos } from "../grid.ts";
import { STRIKE_MAPS } from "../maps/index.ts";
import { hit, join, newMatch, startMatch, teamOf, tick } from "../match.ts";
import { Bots } from "./drive.ts";
import { knowOf, routesTo } from "./know.ts";
import { lab } from "./lab.ts";
import { Radio } from "./radio.ts";

for (const map of ["sawmill", "lodge", "freight", "tower", "boathouse"])
  test(`bots play ${map}: no repeats, apart, looking, planting, busy`, () => {
    // (a whole match: each squad on both sides — a half alone can snowball one way; Freight's long lanes and late
    // plants want more than 40 simulated minutes for 24 rounds. Two matches, the rates over both: one match can
    // snowball 18–1 and plant little)
    const two = [7, 11].map((seed) => lab({ map, rounds: 24, seed, minutes: 50 }));
    const mean = (f: (x: (typeof two)[number]) => number) => (f(two[0]) + f(two[1])) / 2;
    const r = {
      ...two[0],
      rounds: Math.min(two[0].rounds, two[1].rounds),
      over: two[0].over && two[1].over,
      repeats: two[0].repeats + two[1].repeats,
      linesPerRound: mean((x) => x.linesPerRound),
      bunched: mean((x) => x.bunched),
      blindDeaths: mean((x) => x.blindDeaths),
      idle: mean((x) => x.idle),
      plantShare: mean((x) => x.plantShare),
      why: Object.fromEntries(
        [...new Set([...Object.keys(two[0].why), ...Object.keys(two[1].why)])].map((k) => [
          k,
          (two[0].why[k as "elim"] ?? 0) + (two[1].why[k as "elim"] ?? 0),
        ]),
      ),
      squads: [two[0].squads[0] + two[1].squads[0], two[0].squads[1] + two[1].squads[1]],
      sides: { r: two[0].sides.r + two[1].sides.r, w: two[0].sides.w + two[1].sides.w },
    };
    const why = JSON.stringify({ ...r, log: undefined, frames: undefined });
    assert.ok(
      two.every((x) => x.rounds >= 24 || x.over),
      `played (${why})`,
    );
    assert.equal(r.repeats, 0, `no line said again within 10 s (${why})`);
    assert.ok(r.linesPerRound <= 12, `the radio a side hears a round (${r.linesPerRound.toFixed(1)})`);
    assert.ok(r.bunched < 0.2, `bunched (${r.bunched.toFixed(2)})`);
    assert.ok(r.blindDeaths < 0.2, `deaths not looking at the killer (${r.blindDeaths.toFixed(2)})`);
    assert.ok(r.idle < 0.12, `standing about (${r.idle.toFixed(2)})`);
    if (map !== "tower" && map !== "boathouse") assert.ok(r.plantShare >= 0.4, `plants (${r.plantShare.toFixed(2)})`);
    if (map === "tower")
      assert.ok(
        (r.why.rescue ?? 0) + (r.why.elim ?? 0) >= 12,
        `the hostage rounds decided by play (two matches) (${why})`,
      );
    // (neither squad shut out, nor either side)
    assert.ok(r.squads[0] >= 1 && r.squads[1] >= 1, `both squads win rounds (${JSON.stringify(r.squads)})`);
    assert.ok(r.sides.r >= 1 && r.sides.w >= 1, `both sides win rounds (${JSON.stringify(r.sides)})`);
  });

test("Retakes: four Raiders on the site, three Wardens round it; both sides take rounds", () => {
  let first = true;
  const r = lab({
    map: "sawmill",
    mode: "retakes",
    rounds: 16,
    seed: 7,
    onStep: (m) => {
      if (!first || (m.phase !== "live" && m.phase !== "planted")) return;
      first = false;
      const n = { r: 0, w: 0 };
      for (const p of m.players.values()) n[teamOf(m, p)]++;
      assert.deepEqual(n, { r: 4, w: 3 });
    },
  });
  assert.equal(first, false, "a round was played");
  assert.ok(r.sides.r >= 3 && r.sides.w >= 3, `both sides win (${JSON.stringify(r.sides)})`);
});

test("Casual's ten a side: the radio no busier, nobody in a crowd", () => {
  const r = lab({ map: "sawmill", mode: "casual", size: 10, rounds: 8, seed: 7 });
  assert.ok(r.linesPerRound <= 13, `the radio a side hears a round (${r.linesPerRound.toFixed(1)})`);
  assert.ok(r.bunched < 0.2, `bunched (${r.bunched.toFixed(2)})`);
  assert.equal(r.repeats, 0);
});

test("the levels in order: Hard beats Easy, Expert beats Hard over a match", () => {
  const a = lab({ map: "sawmill", rounds: 24, seed: 3, levels: ["hard", "easy"] });
  assert.ok(a.squads[0] > a.squads[1] * 3, `hard ${a.squads[0]} – easy ${a.squads[1]}`);
  const b = lab({ map: "lodge", rounds: 24, seed: 3, levels: ["expert", "hard"] });
  assert.ok(b.squads[0] > b.squads[1], `expert ${b.squads[0]} – hard ${b.squads[1]}`);
});

test("each map understood: every bomb site has ≥ 2 routes a side, ≥ 4 spots to hold, a stage unseen by them", () => {
  for (const map of STRIKE_MAPS) {
    if (map.mode === "range") continue;
    const k = knowOf(map);
    for (const [goal, holder] of Object.entries(k.holds)) {
      const att = holder === "w" ? "r" : "w";
      const rs = routesTo(k, att, goal as "A");
      assert.ok(rs.length >= (map.mode === "wingman" ? 1 : 2), `${map.key} ${goal}: ${rs.length} routes`);
      assert.ok(
        rs.every((r) => r.via),
        `${map.key} ${goal}: every route named`,
      );
      const holds = k.spots.filter((s) => s.to === goal && s.team === holder && s.kind !== "info");
      assert.ok(holds.length >= 4, `${map.key} ${goal}: ${holds.length} spots`);
      assert.ok(
        rs.some((r) => r.seen.some((v, m) => m >= 8 && !v)),
        `${map.key} ${goal}: somewhere to stage unseen`,
      );
    }
    assert.ok(k.areas.filter((a) => a.nodes > 0).length >= k.areas.length - 1, `${map.key}: the callouts have ground`);
  }
});

test("the radio: an event once, a bigger contact again, nobody talking over the last line", () => {
  const r = new Radio();
  // (two at once on Catwalk; the second's news only for its count — said as one line, "Two at Catwalk")
  assert.equal(r.ask("a", { k: "contact", n: 1, area: "Catwalk" }, 0), true);
  assert.equal(r.ask("b", { k: "contact", n: 1, area: "Catwalk" }, 0), false);
  assert.equal(r.ask("b", { k: "contact", n: 2, area: "Catwalk" }, 0), true);
  assert.equal(r.ask("c", { k: "contact", n: 1, area: "Mill Door" }, 0), true);
  const alive = () => true;
  const said: string[] = [];
  for (let t = 0; t < 6; t += 0.1) {
    const l = r.step(t, alive);
    if (l) said.push(`${t.toFixed(1)} ${l.text}`);
  }
  assert.equal(said.length, 2, said.join(" | "));
  // (and the same again within its window: not news)
  assert.equal(r.ask("a", { k: "contact", n: 1, area: "Catwalk" }, 5), false);
  assert.ok(said[0].includes("Two at Catwalk"), said.join(" | "));
  // (the next 1.2 s later at least)
  assert.ok(Number(said[1].split(" ")[0]) - Number(said[0].split(" ")[0]) >= 1.19, said.join(" | "));
});

test("fair: a bot doesn't sense someone walking quietly behind a wall; it hears them run", () => {
  for (const run of [false, true]) {
    const m = newMatch("range", "deathmatch");
    join(m, "bot:0a", "a", 0, true);
    join(m, "p1", "p", 1, false);
    startMatch(m);
    const g = gridOf(m.map);
    const bots = new Bots(m, {
      rand: Math.random,
      level: () => "expert",
      // (the person: 12 m behind the bot, moving along at a walk or a run)
      other: (id) => (id === "p1" ? where : null),
      smokes: () => [],
      blindTo: () => 0,
      shot: (by, s) => {
        if (s.victim) hit(m, by, s.victim, s.gun, s.dmg, "body");
      },
      nade: () => {},
      say: () => {},
      budget: () => 1e9,
    });
    bots.add("bot:0a");
    const n = nodeNear(g, -20, 20);
    const [x, y, z] = nodePos(g, n);
    bots.place("bot:0a", x, y, z);
    const b = bots.bots.get("bot:0a")!;
    b.aim.yaw = 0;
    let where = { x: x - 12, y, z, crouch: false };
    const speed = run ? 5.5 : 1.5;
    for (let i = 0; i < 40; i++) {
      where = { ...where, z: where.z + speed * 0.05 };
      bots.step(0.05);
      tick(m, 0.05);
      b.order = { kind: "hold", role: "free", to: n, watch: [x + 10, y + 1.5, z], why: "test" };
    }
    const heard = b.mem.has("p1");
    assert.equal(heard, run, run ? "a run's heard" : "a walk isn't");
  }
});
