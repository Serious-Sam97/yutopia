import assert from "node:assert/strict";
import { test } from "node:test";
import { mixer } from "./audio";
import { DRIPS_FOR, mixOf, STROKE, splashOf, voiceOf, type Wader, WaterSound, type WetHere } from "./water-sound";

// The water's sound (docs/plan/66-the-water.md, S9): its beds by where I am, and what's heard of
// someone going in, swimming, under and out, a car going in, the ice giving way.

const H: WetHere = { swim: 0, speed: 0, out: true, pond: 0, rapid: 1e9, falls: 1e9, current: 0, ice: 0 };
const lv = (h: Partial<WetHere>) => mixOf({ ...H, ...h });

test("water sound: dry land far from the water has none; the pond laps at its shore, open — not frozen over", () => {
  for (const [b, v] of Object.entries(lv({}))) assert.equal(v, 0, b);
  assert.ok(lv({ pond: 1 })["pond-lap"] > 0);
  assert.equal(lv({ pond: 1, ice: 1 })["pond-lap"], 0, "frozen");
  assert.ok(lv({ pond: 1, out: false })["pond-lap"] < lv({ pond: 1 })["pond-lap"] * 0.2, "indoors");
  assert.ok(lv({ pond: 1, up: 30 })["pond-lap"] < 0.01, "flying high over it");
});

test("water sound: the rapid and the falls where they are — louder the nearer, gone past their reach", () => {
  assert.ok(lv({ rapid: 5 }).rapid > lv({ rapid: 40 }).rapid);
  assert.equal(lv({ rapid: 80 }).rapid, 0);
  assert.ok(lv({ falls: 60 }).falls > 0, "the falls carry further");
  assert.equal(lv({ falls: 110 }).falls, 0);
});

test("water sound: afloat, treading still and quieter swimming; under, its bed (and the river's current), the shore's lapping not", () => {
  assert.ok(lv({ swim: 2 }).tread > lv({ swim: 2, speed: 1.3 }).tread);
  assert.equal(lv({ swim: 3 }).tread, 0);
  const under = lv({ swim: 3, pond: 1 });
  assert.ok(under.under > 0);
  assert.equal(under["pond-lap"], 0);
  assert.equal(under.current, 0, "still water");
  assert.ok(lv({ swim: 3, current: 1.2 }).current > 0, "in the river");
  assert.equal(lv({ swim: 2, current: 1.2 }).current, 0, "up top");
});

test("water sound: out of it soaked, the drips — most just out, gone after a while, none dry", () => {
  const just = lv({ after: 1, soaked: 1 })["drip-body"];
  assert.ok(just > 0);
  assert.ok(lv({ after: DRIPS_FOR / 2, soaked: 1 })["drip-body"] < just);
  assert.equal(lv({ after: DRIPS_FOR + 1, soaked: 1 })["drip-body"], 0);
  assert.equal(lv({ after: 1, soaked: 0.1 })["drip-body"], 0);
  assert.equal(lv({ swim: 2, after: 1, soaked: 1 })["drip-body"], 0, "still in it");
});

test("water sound: the splash going in by how hard — none walked in, a step, a jump, a fall, a dive taking me under", () => {
  assert.equal(splashOf(0.5, false), null);
  assert.equal(splashOf(2, false)?.slot, "in-step");
  assert.equal(splashOf(5, false)?.slot, "in-jump");
  assert.equal(splashOf(9, false)?.slot, "in-fall");
  assert.equal(splashOf(9, true)?.slot, "in-dive");
  assert.ok((splashOf(9, false)?.gain ?? 0) > (splashOf(2, false)?.gain ?? 0));
});

// the player with no audio: what it'd play, in order
function heard(run: (W: WaterSound, step: (w: Partial<Wader>, s?: number) => void) => void, gender?: string): string[] {
  const out: string[] = [];
  const was = { ctx: mixer.ctx, muffle: mixer.muffle };
  (mixer as unknown as { ctx: unknown }).ctx = { state: "running", currentTime: 0 };
  mixer.muffle = () => {};
  try {
    const W = new WaterSound("/none/");
    W.shot = (slot) => {
      out.push(slot);
    };
    let me: Wader = { id: "me", swim: 0, x: 0, y: 0, z: 0, gain: 1, pan: 0, gender, me: true };
    const step = (w: Partial<Wader>, s = 1 / 30) => {
      me = { ...me, ...w };
      W.update(s, { ...H, swim: me.swim }, [me]);
    };
    run(W, step);
  } finally {
    (mixer as unknown as { ctx: unknown }).ctx = was.ctx;
    mixer.muffle = was.muffle;
  }
  return out;
}

test("water sound: jumping in from the bank splashes; walking in off the shelf doesn't; nor a teleport into it", () => {
  const jump = heard((_, step) => {
    step({ z: 2 });
    for (let z = 2; z > -1.2; z -= 0.2) step({ z });
    step({ z: -1.25, swim: 2 });
  });
  assert.ok(jump.includes("in-jump"), jump.join());
  const walked = heard((_, step) => {
    for (let x = 0; x < 4; x += 0.05) step({ x, z: -x * 0.3, swim: x < 2 ? 1 : 2 });
  });
  assert.ok(!walked.some((s) => s.startsWith("in-")), walked.join());
  const tp = heard((_, step) => {
    step({ x: 0, z: 5 });
    step({ x: 200, z: -1.25, swim: 2 });
  });
  assert.ok(!tp.some((s) => s.startsWith("in-")), tp.join());
});

test("water sound: under and up — my breath out under, a gasp after a while under, out of breath after long", () => {
  const under = (n: number) => (_: WaterSound, step: (w: Partial<Wader>, s?: number) => void) => {
    step({ swim: 2 });
    for (let i = 0; i < n; i++) step({ swim: 3 }, 0.1);
    step({ swim: 2 });
  };
  const short = heard((_, step) => {
    step({ swim: 2 });
    step({ swim: 3 });
    for (let i = 0; i < 30; i++) step({ swim: 3 });
    step({ swim: 2 });
  });
  assert.ok(short.includes("bubbles"));
  assert.ok(!short.includes("gasp"), "a second under");
  const long = heard(under(200), "masculine");
  assert.ok(long.includes("gasp-man"));
  assert.equal(long.filter((s) => s === "breathless-man").length, 3);
  const hers = heard(under(200), "feminine");
  assert.ok(hers.includes("gasp-woman") && !hers.includes("gasp-man"), hers.join());
  assert.equal(hers.filter((s) => s === "breathless-woman").length, 3);
});

test("water sound: whose voice — the avatar's gender; a neutral one's by who they are, the same each time", () => {
  assert.equal(voiceOf("masculine", "a"), "man");
  assert.equal(voiceOf("feminine", "a"), "woman");
  assert.equal(voiceOf("neutral", "abc"), voiceOf("neutral", "abc"));
  const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
  const women = ids.filter((id) => voiceOf("neutral", id) === "woman").length;
  assert.ok(women > 10 && women < 30, `${women} of 40`);
});

test("water sound: swimming, a stroke a pull — breast's slow, crawl's going fast; still, none; climbing out", () => {
  const swim = (v: number) =>
    heard((_, step) => {
      step({ swim: 2 });
      for (let i = 0; i < 100; i++) step({ swim: 2, x: (i + 1) * v * 0.1 }, 0.1);
    });
  const breast = swim(1.3).filter((s) => s === "stroke-breast").length;
  assert.ok(Math.abs(breast - 10 / STROKE.breast) <= 2, `${breast} in 10 s`);
  const crawl = swim(2.3).filter((s) => s === "stroke-crawl").length;
  assert.ok(Math.abs(crawl - 10 / STROKE.crawl) <= 3, `${crawl} in 10 s`);
  assert.equal(swim(0).filter((s) => s.startsWith("stroke")).length, 0);
  const out = heard((_, step) => {
    step({ swim: 2 });
    step({ swim: 0, z: 0.4 });
  });
  assert.ok(out.includes("climb-out"));
});

test("water sound: a car going in splashes and sinks, once; the ice giving way — not the holes there when I came", () => {
  const out: string[] = [];
  const was = { ctx: mixer.ctx, muffle: mixer.muffle };
  (mixer as unknown as { ctx: unknown }).ctx = { state: "running", currentTime: 0 };
  mixer.muffle = () => {};
  try {
    const W = new WaterSound("/none/");
    W.shot = (slot) => {
      out.push(slot);
    };
    const car = (wet: boolean) => [{ id: "c", wet, gain: 1, pan: 0 }];
    const hole = (...k: string[]) => k.map((key) => ({ key, gain: 1, pan: 0 }));
    W.update(0.03, H, [], car(false), hole("1,1"));
    W.update(0.03, H, [], car(true), hole("1,1"));
    W.update(0.03, H, [], car(true), hole("1,1"));
    W.update(0.03, H, [], car(true), hole("1,1", "5,5"));
    assert.deepEqual(out, ["in-fall", "car-sink", "ice-crack"]);
  } finally {
    (mixer as unknown as { ctx: unknown }).ctx = was.ctx;
    mixer.muffle = was.muffle;
  }
});
