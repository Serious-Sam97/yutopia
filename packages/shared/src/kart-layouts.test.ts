import assert from "node:assert/strict";
import { test } from "node:test";
import { LapCounter } from "./kart/lap.ts";
import { checkLayout } from "./kart/layout-check.ts";
import { KART_LAYOUTS, kartFloods, kartTrack, TRACK_W } from "./kart/park.ts";
import { createKart, stepKart } from "./kart/sim.ts";
import { vortexRacer } from "./kart/vortex.ts";
import { kartTrackWorld } from "./kart/world.ts";

// The track changer's layouts (docs/plan/47-the-track-changer.md, phase 1): each, either way round,
// down the same start straight, clear of what's built (the fence, the bowl, the stands, the tower,
// the paddock, the bridge's ramps — on its own road or under its span, else round its ends), no
// turn a kart can't take, nowhere near itself; and Vortex laps it at every level.

const ways = KART_LAYOUTS.flatMap((l) => [false, true].map((r) => ({ key: l.key, reverse: r })));

test("today's circuit is the Figure Eight, as it was", () => {
  const t = kartTrack();
  assert.equal(t.key, "eight");
  assert.equal(t.reverse, false);
  assert.equal(t.len, 794);
  assert.deepEqual([t.cross.over, t.cross.under], [95, 489]);
  assert.deepEqual(t.ramp, { s: 192, len: 7, h: 1.3 });
  assert.deepEqual(t.boxes, [607, 256, 390, 698]);
  assert.equal(kartTrack("eight"), t, "the same one");
});

for (const { key, reverse } of ways)
  test(`${key}${reverse ? ", reversed" : ""}: clear of everything built, down the start straight`, () => {
    const r = checkLayout(key, reverse);
    assert.deepEqual(r.faults, [], `${key} ${JSON.stringify(r.margins)} tightest ${r.tightest}`);
    const t = kartTrack(key, reverse);
    assert.ok(t.len > 600 && t.len < 1200, `length ${t.len}`);
    // the line, the grid behind it on the straight, the checkpoints in order
    assert.equal(t.grid.length, 8);
    assert.deepEqual(
      [...t.checks].sort((a, b) => a - b),
      t.checks,
    );
    // a jump each (off the bridge), the item rows apart
    assert.ok(t.jumps.length >= 1);
    for (const j of t.jumps) assert.equal(t.pts[j.s].y, 0, "a jump on the flat");
    assert.equal(new Set(t.boxes).size, t.boxes.length);
    // over the bridge where it takes it both ways
    const lay = KART_LAYOUTS.find((l) => l.key === key);
    const top = Math.max(...t.pts.map((p) => p.y));
    assert.ok(lay?.bridge === "both" ? top > 5 : top === 0, `top ${top}`);
  });

for (const { key, reverse } of ways)
  test(`${key}${reverse ? ", reversed" : ""}: Vortex laps it, Easy slower than Hard`, () => {
    const t = kartTrack(key, reverse);
    const world = kartTrackWorld(t);
    const lapOf = (level: "easy" | "medium" | "hard") => {
      const g = t.grid[0];
      const k = createKart(g.x, world.under(g.x, g.z, 10).y, g.z, g.a);
      const lc = new LapCounter(t);
      const d = vortexRacer(world, level, 1);
      for (let n = 0; n < 200 * 150 && lc.lap < 2; n++) {
        stepKart(k, d(k), world);
        const on = world.locate(k.x, k.z, k.y);
        if (on) lc.update(on.s, k.t);
      }
      return { laps: lc.lap, best: lc.best ?? 999 };
    };
    const easy = lapOf("easy");
    const hard = lapOf("hard");
    assert.equal(hard.laps, 2, "Hard round");
    assert.equal(easy.laps, 2, "Easy round");
    // (about a kart's pace: under 30 m/s on the best lap, over 9)
    assert.ok(hard.best > t.len / 30 && hard.best < t.len / 9, `Hard ${hard.best.toFixed(1)} s for ${t.len} m`);
    assert.ok(easy.best > hard.best, `Easy ${easy.best.toFixed(1)} vs Hard ${hard.best.toFixed(1)}`);
    console.log(
      `  ${key}${reverse ? " r" : ""}: ${t.len} m, Hard ${hard.best.toFixed(1)} s, Easy ${easy.best.toFixed(1)} s`,
    );
  });

test("the layout raced: what's asphalt in the park follows it; what's walked round doesn't", async () => {
  const G = await import("./grounds.ts");
  const P = await import("./kart/park.ts");
  // a tile on the Oval's north straight, off the Figure Eight's road
  const oval = kartTrack("oval");
  const eight = kartTrack();
  const spot = oval.pts.find((p) => !eight.pts.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 14));
  assert.ok(spot, "a stretch of the Oval's own");
  if (!spot) return;
  const tx = Math.floor(spot.x);
  const tz = Math.floor(spot.z);
  const walkBefore = new Map<string, boolean>();
  for (const [x, z] of [
    [tx, tz],
    [Math.floor(eight.pts[150].x), Math.floor(eight.pts[150].z)],
  ])
    walkBefore.set(`${x},${z}`, G.walkableTile(x, z));
  assert.notEqual(G.surfaceTileAt(tx, tz), "asphalt", "snow while the Figure Eight's raced");
  assert.equal(G.setParkLayout("oval", false), true);
  assert.equal(G.setParkLayout("oval", false), false, "the same: nothing to do");
  assert.deepEqual(P.kartLayoutNow(), { key: "oval", reverse: false });
  assert.equal(P.kartTrackNow(), oval);
  assert.equal(G.surfaceTileAt(tx, tz), "asphalt", "the Oval's asphalt now");
  // the rest as it was
  for (const [k, w] of walkBefore) {
    const [x, z] = k.split(",").map(Number);
    assert.equal(G.walkableTile(x, z), w, `walk at ${k}`);
  }
  // no bridge on the Oval: where its ramps and span stood, and their guard strips, the land, walked
  // on (snow, but where the Oval's own road is)
  const up = eight.pts.filter((p) => p.y > 1 && p.s % 3 === 0);
  const sides = (p: (typeof up)[number]) =>
    [0, P.DECK_HALF + 0.8, -P.DECK_HALF - 0.8].map((o) => [p.x + Math.sin(p.a) * o, p.z - Math.cos(p.a) * o]);
  for (const p of up)
    for (const [x, z] of sides(p)) {
      assert.equal(P.kartDeckAt(x, z), null, `no deck at ${p.s}`);
      assert.equal(G.heightAt(x, z), G.landAt(x, z), `the land's height at ${p.s}`);
      assert.equal(G.walkableTile(Math.floor(x), Math.floor(z)), true, `walked at ${p.s}`);
      if (!P.kartOnCircuit(x, z, 0)) assert.notEqual(G.groundSurfaceAt(x, z), "asphalt", `snow at ${p.s}`);
    }
  G.setParkLayout("nope", false);
  assert.deepEqual(P.kartLayoutNow(), { key: "eight", reverse: false }, "a key not known: the Figure Eight");
  assert.notEqual(G.surfaceTileAt(tx, tz), "asphalt");
  // (and back: the bridge with it, its span up and its strips not walked)
  const top = eight.pts[eight.cross.over];
  assert.ok(Math.abs(G.heightAt(top.x, top.z) - G.landAt(top.x, top.z) - P.BRIDGE_H) < 0.1, "the span's deck");
  const [sx, sz] = sides(top)[1];
  assert.equal(G.walkableTile(Math.floor(sx), Math.floor(sz)), false, "its guard strip");
});

test("the floodlights: off every layout's road, and every layout lit", () => {
  const floods = kartFloods();
  for (const l of KART_LAYOUTS) {
    const t = kartTrack(l.key);
    for (const f of floods) {
      const d = Math.min(...t.pts.map((p) => Math.hypot(p.x - f.x, p.z - f.z)));
      assert.ok(d >= TRACK_W / 2 + 4, `a mast at (${f.x}, ${f.z}) ${d.toFixed(1)} m off ${l.key}'s middle`);
    }
    // (the bridge's deck too; the darkest, the Figure Eight's ramp's foot: the masts kept off the ramps)
    for (const p of t.pts) {
      const d = Math.min(...floods.map((f) => Math.hypot(p.x - f.x, p.z - f.z)));
      assert.ok(d < 41, `${l.key} at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}): the nearest mast ${d.toFixed(0)} m`);
    }
  }
  for (const [i, f] of floods.entries())
    for (const g of floods.slice(i + 1)) assert.ok(Math.hypot(f.x - g.x, f.z - g.z) >= 30, "masts ≥ 30 m apart");
});
