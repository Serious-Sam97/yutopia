import assert from "node:assert/strict";
import { test } from "node:test";
import { spDay, spHour } from "./clock.ts";
import {
  calledSky,
  chillOf,
  DRY,
  FOG_KINDS,
  fogAt,
  fogCurve,
  fogLift,
  fogOf,
  fogOn,
  fogToday,
  type Ground,
  groundAt,
  groundFrom,
  NO_FOG,
  REPLAY_MS,
  rimeAt,
  type Sky,
  STORM_WINDOW_MS,
  skyAt,
  stepGround,
  stormAt,
  stormIn,
  strikeFar,
  strikeIn,
  tempAt,
  WEATHER_CALLS,
  weatherFrom,
} from "./weather.ts";

test("the storms: about every other hour, 6 to 14 minutes, coming up and dying down smoothly", () => {
  let storms = 0;
  for (let w = 0; w < 400; w++) {
    const s = stormIn(w);
    if (!s) continue;
    storms++;
    const len = (s.to - s.from) / 60_000;
    assert.ok(len >= 6 && len <= 14, `window ${w}: ${len} min`);
    assert.ok(s.from >= 0 && s.to < STORM_WINDOW_MS);
    // in the middle of it: a blizzard; before it: calm
    const t0 = w * STORM_WINDOW_MS;
    assert.equal(stormAt(t0 + (s.from + s.to) / 2 + 90_000), 1);
    assert.equal(stormAt(t0 + s.from - 1), 0);
  }
  assert.ok(storms > 140 && storms < 260, `${storms} storms in 400 hours`);
  // never a jump from one second to the next
  for (let t = 0; t < 48 * 3_600_000; t += 1000) assert.ok(Math.abs(stormAt(t + 1000) - stormAt(t)) < 0.03);
});

test("the morning fog: most mornings, the thick one rarest; the same day the same fog", () => {
  const n: Record<string, number> = { clear: 0, mist: 0, fog: 0, thick: 0 };
  for (let d = 0; d < 10_000; d++) {
    const m = fogOn(d);
    n[m?.kind ?? "clear"]++;
    if (m) assert.ok(m.k >= 0.7 && m.k <= 1, `day ${d}: ${m.k}`);
    assert.deepEqual(fogOn(d), m);
  }
  const share = (k: string) => n[k] / 10_000;
  assert.ok(Math.abs(share("clear") - 0.3) < 0.03, JSON.stringify(n));
  assert.ok(Math.abs(share("mist") - 0.3) < 0.03, JSON.stringify(n));
  assert.ok(Math.abs(share("fog") - 0.25) < 0.03, JSON.stringify(n));
  assert.ok(Math.abs(share("thick") - 0.15) < 0.03, JSON.stringify(n));
  // (not one kind for days on end: tomorrow's isn't today's more than by chance)
  let same = 0;
  for (let d = 0; d < 10_000; d++) if ((fogOn(d)?.kind ?? "") === (fogOn(d + 1)?.kind ?? "")) same++;
  assert.ok(same < 3500, `${same} days like the one before`);
});

test("the morning fog by the hour: none in the night or the day, thickest round sunrise, the thicker the later it goes", () => {
  for (const k of FOG_KINDS) {
    for (const h of [0, 2, 3.9, 11, 12, 15, 20, 23.9]) assert.equal(fogCurve(k, h), 0, `${k} at ${h}`);
    for (const h of [6, 6.5, 7, 7.5]) assert.equal(fogCurve(k, h), 1, `${k} at ${h}`);
    assert.ok(fogCurve(k, 5) > 0 && fogCurve(k, 5) < 1);
    // never a jump from one minute to the next
    for (let h = 0; h < 24; h += 1 / 60)
      assert.ok(Math.abs(fogCurve(k, h + 1 / 60) - fogCurve(k, h)) < 0.03, `${k} ${h}`);
  }
  // burnt off by 10:00 a mist; a fog thin by then; a thick one still there
  assert.equal(fogCurve("mist", 10), 0);
  assert.ok(fogCurve("fog", 10) > 0 && fogCurve("fog", 10) < 0.2);
  assert.ok(fogCurve("thick", 10) > 0.2 && fogCurve("thick", 10) < 0.4);
  assert.ok(fogCurve("mist", 9) < fogCurve("fog", 9) && fogCurve("fog", 9) < fogCurve("thick", 9));
});

test("the fog drawn: a mist a thin haze, a fog all of it, a thick one the wall too", () => {
  assert.deepEqual(fogOf(null), NO_FOG);
  assert.deepEqual(fogOf("mist"), { haze: 0.45, wall: 0, lift: 0 });
  assert.deepEqual(fogOf("fog"), { haze: 1, wall: 0, lift: 0 });
  assert.deepEqual(fogOf("thick"), { haze: 1, wall: 1, lift: 0 });
  let seen = 0;
  for (let d = 0; d < 400; d++) {
    const m = fogOn(d);
    assert.deepEqual(fogAt(d, 14), NO_FOG, `day ${d} at 14:00`);
    const f = fogAt(d, 7);
    if (!m) assert.deepEqual(f, NO_FOG);
    else {
      seen++;
      assert.ok(Math.abs(f.haze - fogOf(m.kind).haze * m.k) < 1e-9);
      assert.equal(f.wall > 0, m.kind === "thick");
    }
  }
  assert.ok(seen > 200);
});

test("this morning: São Paulo's day, so the morning doesn't change at midnight UTC", () => {
  // 23:00 and 01:00 UTC on one night are 20:00 and 22:00 the same day in São Paulo
  assert.deepEqual(fogToday(Date.UTC(2026, 10, 1, 23)), fogToday(Date.UTC(2026, 10, 2, 1)));
  assert.deepEqual(fogToday(Date.UTC(2026, 10, 2, 1)), fogOn(spDay(Date.UTC(2026, 10, 2, 1))));
  assert.equal(spDay(Date.UTC(2026, 10, 2, 2, 59)) + 1, spDay(Date.UTC(2026, 10, 2, 3)));
});

test("the fog lifts as it burns off: on the ground till then, its floor up as it goes", () => {
  for (const k of FOG_KINDS) {
    for (const h of [0, 4, 5, 6, 7, 7.4]) assert.equal(fogLift(k, h), 0, `${k} at ${h}`);
    assert.equal(fogLift(k, 12), 1);
    for (let h = 4; h < 12; h += 1 / 60)
      assert.ok(fogLift(k, h + 1 / 60) >= fogLift(k, h), `${k} ${h}: never back down`);
  }
  // lifting while there's still some of it: the ground clear first
  assert.ok(fogLift("fog", 9) > 0.3 && fogCurve("fog", 9) > 0.3);
  // the day's: none when the fog's gone, its lift with it while it's there
  for (let d = 0; d < 400; d++) {
    const m = fogOn(d);
    assert.equal(fogAt(d, 14).lift, 0);
    if (m) assert.equal(fogAt(d, 9).lift, fogCurve(m.kind, 9) > 0 ? fogLift(m.kind, 9) : 0);
  }
});

test("the rime on the trees: built through a foggy morning, there till noon, gone by 13:30", () => {
  for (let d = 0; d < 400; d++) {
    const m = fogOn(d);
    for (const h of [0, 3, 4.9, 13.5, 15, 22]) assert.equal(rimeAt(d, h), 0, `day ${d} at ${h}`);
    if (!m) {
      assert.equal(rimeAt(d, 10), 0);
      continue;
    }
    // all of it from 8:30 to noon, whatever the fog's done meanwhile
    assert.equal(rimeAt(d, 9), rimeAt(d, 11.9));
    assert.ok(rimeAt(d, 6) < rimeAt(d, 9));
    assert.ok(rimeAt(d, 12.75) < rimeAt(d, 12) && rimeAt(d, 12.75) > 0);
    if (m.kind === "thick") assert.ok(rimeAt(d, 10) >= 0.7);
    if (m.kind === "mist") assert.ok(rimeAt(d, 10) <= 0.35);
  }
});

// ── the weather (docs/plan/65-the-weather.md) ──

const H = 3_600_000;
const T0 = Date.UTC(2020, 0, 1);
const DAYS = 10_000;
// the sky each hour over 10,000 days (at :37, off the storm windows' edges), made once
const hourly: Sky[] = [];
for (let i = 0; i < DAYS * 24; i++) hourly.push(skyAt(T0 + i * H + 37 * 60_000));
// a day is snowy with 3 h of snow or more
const snowyDays: boolean[] = [];
for (let d = 0; d < DAYS; d++)
  snowyDays.push(hourly.slice(d * 24, d * 24 + 24).filter((s) => s.kind === "snow").length >= 3);

test("the sky's shares over 10,000 days: about a third clear, snow on one day in four", () => {
  const n: Record<string, number> = { clear: 0, cloudy: 0, rain: 0, sleet: 0, snow: 0 };
  for (const s of hourly) n[s.kind]++;
  const share = (k: string) => n[k] / hourly.length;
  const near = (k: string, want: number, by = 0.04) =>
    assert.ok(Math.abs(share(k) - want) < by, `${k}: ${JSON.stringify(n)}`);
  near("clear", 0.35);
  near("cloudy", 0.23);
  near("rain", 0.25);
  near("sleet", 0.04, 0.02);
  near("snow", 0.13);
  const snowy = snowyDays.filter(Boolean).length / DAYS;
  assert.ok(snowy > 0.22 && snowy < 0.32, `${snowy} of the days snowy`);
});

test("the weather comes in spells: a snowy day often brings another, a dry spell lasts", () => {
  const base = snowyDays.filter(Boolean).length / DAYS;
  let after = 0;
  let of = 0;
  let runs = 0;
  let days = 0;
  let run = 0;
  for (let d = 0; d < DAYS; d++) {
    if (d > 0 && snowyDays[d - 1]) {
      of++;
      if (snowyDays[d]) after++;
    }
    if (snowyDays[d]) run++;
    else if (run) {
      runs++;
      days += run;
      run = 0;
    }
  }
  assert.ok(after / of > 1.5 * base, `after a snowy day ${after / of}, any day ${base}`);
  assert.ok(days / runs > 1.6, `snowy spells ${days / runs} days on average`);
  // and a dry spell (nothing coming down) of three days or more, many times
  let dry = 0;
  let spells = 0;
  for (const s of hourly) {
    if (s.fall === 0) dry++;
    else {
      if (dry >= 72) spells++;
      dry = 0;
    }
  }
  assert.ok(spells > 300, `${spells} dry spells of 3 days or more`);
});

test("the sky never jumps: from one minute to the next, the fall, the air and the cloud", () => {
  for (let t = T0; t < T0 + 30 * 24 * H; t += 60_000) {
    const a = skyAt(t);
    const b = skyAt(t + 60_000);
    assert.ok(Math.abs(a.fall - b.fall) < 0.03, `fall at ${t}`);
    assert.ok(Math.abs(a.temp - b.temp) < 0.05, `temp at ${t}`);
    assert.ok(Math.abs(a.cloud - b.cloud) < 0.03, `cloud at ${t}`);
    // rain turns to snow only through sleet (and back)
    const turn = new Set([a.kind, b.kind]);
    assert.ok(!(turn.has("rain") && turn.has("snow")), `rain to snow at ${t}`);
  }
});

test("rain turns to snow as it cools, many times; storms only while it's coming down, thunder in warm rain", () => {
  let turns = 0;
  let lastWet: string | null = null;
  for (const s of hourly) {
    if (s.storm > 0) assert.ok(s.fall > 0);
    if (s.thunder > 0) assert.equal(s.kind, "rain");
    if (s.fall === 0) {
      lastWet = null;
      continue;
    }
    if (lastWet === "rain" && s.kind === "snow") turns++;
    if (s.kind !== "sleet") lastWet = s.kind;
  }
  assert.ok(turns > 100, `${turns} rains turned to snow within a front`);
  assert.ok(hourly.filter((s) => s.storm > 0.5 && s.kind === "snow").length > 1000, "blizzards");
  assert.ok(
    hourly.some((s) => s.thunder > 0.5),
    "thunder",
  );
});

test("the air's day (São Paulo's): coldest about 6:00, warmest at 15:00, a smaller swing under cloud", () => {
  const byHour = new Array(24).fill(0);
  const swing = { clear: [0, 0], grey: [0, 0] };
  for (let d = 0; d < 2000; d++) {
    // São Paulo's midnight on day d
    const m = T0 + 3 * H + d * 24 * H;
    for (let h = 0; h < 24; h++) byHour[h] += tempAt(m + h * H);
    const s = skyAt(m + 15 * H);
    const k = s.cloud < 0.1 ? "clear" : s.cloud > 0.9 ? "grey" : null;
    if (k) {
      swing[k][0] += tempAt(m + 15 * H, s.cloud) - tempAt(m + 6 * H, s.cloud);
      swing[k][1]++;
    }
  }
  const cold = byHour.indexOf(Math.min(...byHour));
  const warm = byHour.indexOf(Math.max(...byHour));
  assert.ok(cold >= 5 && cold <= 6, `coldest at ${cold}:00`);
  assert.equal(warm, 15);
  const clear = swing.clear[0] / swing.clear[1];
  const grey = swing.grey[0] / swing.grey[1];
  assert.ok(clear > 6 && grey < 4, `swing ${clear} clear, ${grey} grey`);
});

/** Hours under a steady `sky` for `until` to hold, stepping a second at a time (as the server). */
function hoursTill(g: Ground, sky: Partial<Sky>, until: (g: Ground) => boolean, hour = 12): number {
  const s: Sky = { kind: "snow", fall: 0, temp: 0, cloud: 1, storm: 0, thunder: 0, ...sky };
  for (let t = 0; t < 48 * 3600; t += 10) {
    if (until(g)) return t / 3600;
    g = stepGround(g, s, hour, 10_000);
  }
  return Infinity;
}

test("the ground at the user's speeds: white in hours, a blizzard's in ¾ h, melted over 6–10", () => {
  const white = (g: Ground) => g.snow >= 0.99;
  const steady = hoursTill(DRY, { kind: "snow", fall: 0.8, temp: -3 }, white);
  assert.ok(steady > 2 && steady < 3, `steady snow: white in ${steady} h`);
  const blizzard = hoursTill(DRY, { kind: "snow", fall: 1, temp: -5, storm: 1 }, white);
  assert.ok(blizzard > 0.6 && blizzard < 0.9, `a blizzard: white in ${blizzard} h`);
  // near freezing it settles slower
  assert.ok(hoursTill(DRY, { kind: "snow", fall: 0.8, temp: 0.3 }, white) > steady * 1.3);
  const deep = { ...DRY, snow: 1 };
  const gone = (g: Ground) => g.snow <= 0.01;
  const thaw = hoursTill(deep, { kind: "cloudy", temp: 5 }, gone);
  assert.ok(thaw > 6 && thaw < 10, `a grey thaw at +5: ${thaw} h`);
  assert.ok(hoursTill(deep, { kind: "clear", temp: 5, cloud: 0 }, gone) < thaw, "the sun melts it faster");
  assert.ok(hoursTill(deep, { kind: "rain", fall: 0.8, temp: 5 }, gone) < thaw, "so does the rain");
  assert.equal(hoursTill(deep, { kind: "clear", temp: -1, cloud: 0 }, gone), Infinity, "not below freezing");
  // a thaw keeps it wet; the rain soaks it in ~30 min, puddles after, all of it drying after
  const g = stepGround(deep, { kind: "cloudy", fall: 0, temp: 4, cloud: 1, storm: 0, thunder: 0 }, 12, 3600_000);
  assert.ok(g.wet >= 0.7, `thawing: wet ${g.wet}`);
  const soaked = hoursTill(DRY, { kind: "rain", fall: 0.8, temp: 8 }, (g) => g.wet >= 0.99);
  assert.ok(soaked > 0.4 && soaked < 0.75, `soaked in ${soaked} h`);
  const pooled = hoursTill(DRY, { kind: "rain", fall: 0.8, temp: 8 }, (g) => g.puddles >= 0.99);
  assert.ok(pooled > 1 && pooled < 2, `puddles full in ${pooled} h`);
  const soakedG = { ...DRY, wet: 1, puddles: 1 };
  const grey = hoursTill(soakedG, { kind: "cloudy", temp: 8 }, (g) => g.wet <= 0.01);
  const sunny = hoursTill(soakedG, { kind: "clear", temp: 8, cloud: 0 }, (g) => g.wet <= 0.01);
  assert.ok(grey > 2 && grey < 3.5 && sunny < grey && sunny > 0.8, `dry in ${grey} h grey, ${sunny} h sunny`);
  const drained = hoursTill(soakedG, { kind: "cloudy", temp: 8 }, (g) => g.puddles <= 0.01);
  assert.ok(drained > grey && drained < 4, `puddles gone in ${drained} h`);
  // the water: frozen after ~6 h at −4, thawed in ~4 at +4, neither near 0
  const frozen = hoursTill(DRY, { kind: "clear", temp: -4 }, (g) => g.ice >= 0.99);
  assert.ok(frozen > 5.5 && frozen < 6.5, `frozen in ${frozen} h`);
  const thawed = hoursTill({ ...DRY, ice: 1 }, { kind: "clear", temp: 4 }, (g) => g.ice <= 0.01);
  assert.ok(thawed > 3.5 && thawed < 4.5, `thawed in ${thawed} h`);
  assert.equal(
    hoursTill({ ...DRY, ice: 0.5 }, { kind: "clear", temp: 1 }, (g) => g.ice !== 0.5),
    Infinity,
  );
});

test("the replay agrees with the server stepping each second, and is quick", () => {
  // find times with snow lying and with a thaw running, and some with neither
  const picks: number[] = [];
  for (let d = 30; picks.length < 6 && d < DAYS; d += 7) {
    const t = T0 + d * 24 * H + 11 * H;
    const g = groundAt(t);
    if ((picks.length < 3 && g.snow > 0.3) || (picks.length >= 3 && g.wet > 0.3)) picks.push(t);
  }
  assert.equal(picks.length, 6);
  for (const t of picks) {
    // the server from the replay's a day before, each second (sampled every 10 s: the sky's that slow)
    let g = groundAt(t - 24 * H);
    for (let s = t - 24 * H; s < t; s += 10_000) g = stepGround(g, skyAt(s), spHour(s), 10_000);
    const r = groundAt(t);
    for (const k of ["snow", "wet", "puddles", "ice"] as const)
      assert.ok(Math.abs(g[k] - r[k]) < 0.05, `${new Date(t).toISOString()} ${k}: stepped ${g[k]}, replayed ${r[k]}`);
  }
  // the same answer twice, and a minute on is close
  assert.deepEqual(groundAt(picks[0]), groundAt(picks[0]));
  const a = groundAt(picks[0]);
  const b = groundAt(picks[0] + 60_000);
  assert.ok(Math.abs(a.snow - b.snow) < 0.02);
  // four days back from bare: what fell before that is gone (as the rule has it)
  assert.ok(REPLAY_MS === 4 * 24 * H);
  const t = performance.now();
  for (let i = 0; i < 200; i++) groundAt(T0 + i * 7 * H);
  const each = (performance.now() - t) / 200;
  assert.ok(each < 3, `groundAt ${each} ms`);
});

test("the weather is the same in any time zone: a function of the clock alone", () => {
  const at = [Date.UTC(2026, 10, 1, 2), Date.UTC(2026, 6, 15, 18, 30), Date.UTC(2027, 1, 3, 9)];
  const was = process.env.TZ;
  const seen = (tz: string) => {
    process.env.TZ = tz;
    return JSON.stringify(at.map((t) => [skyAt(t), groundAt(t), tempAt(t)]));
  };
  const sp = seen("America/Sao_Paulo");
  for (const tz of ["UTC", "Asia/Tokyo", "Pacific/Kiritimati", "America/Los_Angeles"]) assert.equal(seen(tz), sp, tz);
  if (was === undefined) delete process.env.TZ;
  else process.env.TZ = was;
});

test("an admin's call: a snow cold enough to be snow, a rain warm enough, a storm by the air", () => {
  for (const ms of [T0, T0 + 5 * H, T0 + 900 * H, T0 + 4000 * H]) {
    const base = skyAt(ms);
    const snow = calledSky("snow", base);
    assert.equal(snow.kind, "snow");
    assert.ok(snow.temp <= -2 && snow.fall > 0.5 && snow.storm === 0);
    const rain = calledSky("rain", base);
    assert.equal(rain.kind, "rain");
    assert.ok(rain.temp >= 6);
    const clear = calledSky("clear", base);
    assert.ok(clear.kind === "clear" && clear.fall === 0 && clear.cloud === 0 && clear.temp === base.temp);
    assert.equal(calledSky("cloudy", base).cloud, 1);
    const storm = calledSky("storm", base);
    assert.equal(storm.storm, 1);
    assert.equal(storm.kind, base.temp < 0.5 ? "snow" : base.temp < 2 ? "sleet" : "rain");
  }
  // thunder only in a warm downpour
  const warm = calledSky("storm", { ...skyAt(T0), temp: 14 });
  const cold = calledSky("storm", { ...skyAt(T0), temp: -6 });
  assert.equal(warm.thunder, 1);
  assert.equal(cold.thunder, 0);
  assert.deepEqual([...WEATHER_CALLS], ["clear", "cloudy", "rain", "snow", "storm"]);
});

test("a restart keeps the weather: the saved ground brought up to now by the rule, the call if it's running", () => {
  const now = T0 + 300 * 24 * H + 9 * H;
  const at = now - 3 * H;
  const saved = {
    snow: 1,
    wet: 0.2,
    puddles: 0,
    ice: 1,
    at,
    call: { to: "snow", by: "Ana", until: now + 20 * 60_000 },
  };
  const { ground, call } = weatherFrom(saved, now);
  assert.deepEqual(ground, groundFrom({ snow: 1, wet: 0.2, puddles: 0, ice: 1 }, at, now));
  assert.ok(ground.snow > 0.3, "an admin's snow three hours ago still lies (it melts by the rule)");
  assert.deepEqual(call, { to: "snow", by: "Ana", until: now + 20 * 60_000 });
  // a call that's run out, or isn't one: none
  assert.equal(weatherFrom({ ...saved, call: { ...saved.call, until: now - 1 } }, now).call, null);
  assert.equal(weatherFrom({ ...saved, call: { ...saved.call, to: "hail" } }, now).call, null);
  // nothing saved, nothing sound, from the future or too long ago: the schedule's
  for (const bad of [null, undefined, {}, { ...saved, snow: "x" }, { ...saved, at: now + H }, "x"])
    assert.deepEqual(weatherFrom(bad, now).ground, groundAt(now), JSON.stringify(bad));
  assert.deepEqual(weatherFrom({ ...saved, at: now - 6 * 24 * H }, now).ground, groundAt(now));
  // out of range clamped
  assert.ok(weatherFrom({ ...saved, snow: 5, at: now }, now).ground.snow === 1);
});

test("the chill: freezing 1, mild 0, bitter up to 2, the rain colder", () => {
  assert.equal(chillOf(0), 1);
  assert.equal(chillOf(12), 0);
  assert.equal(chillOf(20), 0);
  assert.equal(chillOf(-12), 2);
  assert.equal(chillOf(-40), 2);
  assert.ok(chillOf(6, 1) > chillOf(6));
});

// The lightning (docs/plan/65-the-weather.md, W7): by the clock, so everyone sees the same strikes.

test("lightning: none without thunder; the same strike for everyone at the same moment; more with more thunder", () => {
  assert.equal(strikeIn(1_800_000_000_000, 0), null);
  const t0 = Math.floor(1_800_000_000_000 / 7000) * 7000;
  let few = 0;
  let many = 0;
  for (let k = 0; k < 2000; k++) {
    const ms = t0 + k * 7000;
    const a = strikeIn(ms + 100, 0.3);
    const b = strikeIn(ms + 6900, 0.3);
    // (two clients, any time in the slot: the same strike, inside its slot)
    assert.deepEqual(a, b);
    if (a) {
      assert.ok(a.at >= Math.floor(ms / 7000) * 7000 && a.at < Math.floor(ms / 7000) * 7000 + 7000);
      few++;
    }
    if (strikeIn(ms, 1)) many++;
  }
  // (a quarter to three in four of the slots: one every ~12–28 s at 0.3, ~9 s at the most)
  assert.ok(few / 2000 > 0.3 && few / 2000 < 0.5, `${few}`);
  assert.ok(many > few && many / 2000 < 0.8, `${many}`);
});

test("lightning's distance: the same for everyone, spread from overhead to far off", () => {
  const t0 = Math.floor(1_800_000_000_000 / 7000);
  const far = Array.from({ length: 4000 }, (_, k) => strikeFar(t0 + k));
  assert.equal(strikeFar(t0 + 7), strikeFar(t0 + 7));
  assert.ok(far.every((f) => f >= 0 && f < 1));
  // (as many near as far: a quarter of them within a quarter)
  const near = far.filter((f) => f < 0.25).length / far.length;
  assert.ok(near > 0.2 && near < 0.3, `${near}`);
});
