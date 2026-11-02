import assert from "node:assert/strict";
import { test } from "node:test";
import { mixer } from "./audio";
import { loopable, mixOf, thunderOf, WeatherSound, type WxHere } from "./weather-sound";

// The weather's sound (docs/plan/65-the-weather.md, W8): which beds, how loud and how muffled, by the
// weather and by where I am.

const H: WxHere = {
  out: true,
  car: false,
  woods: 0,
  water: 0,
  river: 0,
  night: 0,
  storm: 0,
  fog: 0,
  hour: 12,
  rain: 0,
  sleet: false,
  thunder: 0,
  temp: 14,
  wet: 0,
  ice: 0,
  cloud: 0.5,
};
const lv = (h: Partial<WxHere>) => {
  const m = mixOf({ ...H, ...h });
  return Object.fromEntries(Object.entries(m).map(([b, v]) => [b, v.level])) as Record<keyof typeof m, number>;
};
const RAIN = ["rain-light", "rain-heavy", "rain-trees", "rain-roof", "rain-car", "rain-water", "sleet"] as const;

test("weather sound: a dry day has no rain; the birds on a warm one, loudest in the morning, none at night or in the cold", () => {
  const noon = lv({});
  for (const b of RAIN) assert.equal(noon[b], 0, b);
  assert.ok(noon.birds > 0);
  assert.ok(lv({ hour: 6.5 }).birds > noon.birds * 1.5);
  assert.equal(lv({ night: 1 }).birds, 0);
  assert.equal(lv({ temp: -3 }).birds, 0);
  assert.equal(lv({ rain: 0.3 }).birds, 0);
  assert.ok(lv({ fog: 1 }).birds < noon.birds * 0.2);
});

test("weather sound: the rain by how hard — light, then heavy over it", () => {
  const light = lv({ rain: 0.2 });
  const hard = lv({ rain: 1 });
  assert.ok(light["rain-light"] > 0 && light["rain-heavy"] < 0.01);
  assert.ok(hard["rain-heavy"] > hard["rain-light"]);
  assert.equal(hard["rain-roof"], 0);
  assert.equal(hard["rain-car"], 0);
  assert.equal(hard["rain-trees"], 0);
});

test("weather sound: by where I am — the trees, indoors, a car, open water", () => {
  const open = lv({ rain: 0.6 });
  const woods = lv({ rain: 0.6, woods: 1 });
  assert.ok(woods["rain-trees"] > 0 && woods["rain-light"] < open["rain-light"]);
  const inside = mixOf({ ...H, rain: 0.6, out: false });
  assert.ok(inside["rain-roof"].level > 0);
  assert.ok(inside["rain-light"].level <= open["rain-light"] * 0.25 + 1e-9);
  assert.ok(inside["rain-light"].lp < 2000, "the open's rain muffled through the walls");
  const car = mixOf({ ...H, rain: 0.6, out: false, car: true });
  assert.ok(car["rain-car"].level > 0 && car["rain-roof"].level === 0);
  // the pond: rain on it while it's open, none on the ice
  assert.ok(lv({ rain: 0.6, water: 1, ice: 0 })["rain-water"] > 0);
  assert.equal(lv({ rain: 0.6, water: 1, ice: 1 })["rain-water"], 0);
});

test("weather sound: sleet hisses in the rain's place; the drips after it; the river runs till it's frozen", () => {
  const sleet = lv({ rain: 0.6, sleet: true });
  const rain = lv({ rain: 0.6 });
  assert.ok(sleet.sleet > 0 && rain.sleet === 0);
  assert.ok(sleet["rain-light"] < rain["rain-light"]);
  // (the drips: just after it stops, more under the trees, gone in five minutes — not for the hours
  // the ground takes to dry, and none after a melt that no rain made)
  assert.ok(lv({ wet: 0.8, after: 30 }).drips > 0);
  assert.ok(lv({ wet: 0.8, after: 30, woods: 1 }).drips > lv({ wet: 0.8, after: 30 }).drips);
  assert.ok(lv({ wet: 0.8, after: 200 }).drips < lv({ wet: 0.8, after: 30 }).drips * 0.4);
  assert.equal(lv({ wet: 0.8, after: 301 }).drips, 0, "gone after five minutes");
  assert.equal(lv({ wet: 0.8 }).drips, 0, "a melt's wet, no rain seen");
  assert.equal(lv({ wet: 0.8, after: 30, rain: 0.5 }).drips, 0);
  assert.equal(lv({ wet: 0.1, after: 30 }).drips, 0);
  assert.ok(lv({ river: 1, ice: 0 }).river > 0);
  assert.equal(lv({ river: 1, ice: 0.8 }).river, 0);
});

test("weather sound: thunder — later, quieter and duller the farther; muffled indoors", () => {
  const near = thunderOf(0.05, true, false);
  const far = thunderOf(0.9, true, false);
  assert.ok(far.delay > near.delay + 4);
  assert.ok(far.gain < near.gain && far.lp < near.lp);
  const inside = thunderOf(0.05, false, false);
  assert.ok(inside.gain < near.gain && inside.lp <= 900);
});

test("weather sound: a bed loops with no seam", () => {
  // (a stand-in for the audio's buffers: a slow sine that doesn't fit the length)
  const mk = (ch: number, len: number, sr: number) => {
    const d = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (c: number) => d[c] };
  };
  const ctx = { createBuffer: mk } as unknown as BaseAudioContext;
  const sr = 8000;
  const src = mk(2, sr * 4, sr);
  for (let c = 0; c < 2; c++) for (let i = 0; i < src.length; i++) src.getChannelData(c)[i] = Math.sin(i * 0.0137 + c);
  const out = loopable(ctx, src as unknown as AudioBuffer, 0.05, 0.5);
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    // the jump from its end round to its start no bigger than one sample's step anywhere else
    assert.ok(Math.abs(d[0] - d[d.length - 1]) < 0.02, `${c}: ${d[0]} vs ${d[d.length - 1]}`);
  }
});

test("weather sound: up off the ground the ground's sounds fade — the rain round me only in part", () => {
  const ground = lv({ rain: 0.6, woods: 0.6, water: 1, river: 1 });
  const high = lv({ rain: 0.6, woods: 0.6, water: 1, river: 1, up: 25 });
  for (const b of ["rain-trees", "rain-water", "river"] as const) {
    assert.ok(ground[b] > 0, b);
    assert.equal(high[b], 0, `${b} gone 25 m up`);
  }
  assert.ok(high["rain-light"] > ground["rain-light"] * 0.5 && high["rain-light"] < ground["rain-light"]);
  // (the drips too, and on a roof's height the same as on the ground)
  assert.equal(lv({ wet: 0.8, after: 30, up: 25 }).drips, 0);
  assert.equal(lv({ wet: 0.8, after: 30, up: 2 }).drips, lv({ wet: 0.8, after: 30 }).drips);
});

test("weather sound: the admins' volume — everything it plays goes out through it, set before or after", () => {
  const node = () => ({
    connect: (n: unknown) => n,
    gain: {
      value: 1,
      setTargetAtTime(v: number) {
        this.value = v;
      },
    },
  });
  const made: ReturnType<typeof node>[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => {
      const g = node();
      made.push(g);
      return g;
    },
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    }),
  } as unknown as AudioContext;
  const was = { buses: mixer.buses, ctx: mixer.ctx };
  (mixer as unknown as { buses: unknown }).buses = { ambience: node() };
  (mixer as unknown as { ctx: unknown }).ctx = ctx;
  try {
    const W = new WeatherSound();
    W.volume(0.4);
    assert.equal(W.vol, 0.4);
    // (its way out made: the beds' and the peals' — at the volume set)
    const out = (W as unknown as { out(c: AudioContext): { gain: { value: number } } }).out(ctx);
    assert.equal(out.gain.value, 0.4);
    W.volume(1.5);
    assert.equal(out.gain.value, 1.5, "and changed on it after");
  } finally {
    (mixer as unknown as { buses: unknown }).buses = was.buses;
    (mixer as unknown as { ctx: unknown }).ctx = was.ctx;
  }
});
