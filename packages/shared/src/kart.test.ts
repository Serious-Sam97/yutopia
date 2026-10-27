import assert from "node:assert/strict";
import { test } from "node:test";
import { rollItem } from "./kart/items.ts";
import {
  BRIDGE_H,
  KART_BOWL,
  KART_CARPARK,
  KART_FENCE,
  KART_GATE,
  KART_PADDOCK,
  KART_PARK,
  KART_ROAD,
  KART_SHED,
  KART_SIGN,
  KART_STANDS,
  KART_THINGS,
  KART_TURN,
  kartSignPosts,
  kartTrack,
  TRACK_W,
  trackAt,
} from "./kart/park.ts";
import { vortexBand } from "./kart/vortex.ts";

// The Kart Park (docs/plan/46-the-karts.md, phase 0): the circuit is a lap of ~800 m that crosses
// itself once, over a bridge high enough to drive under; nothing else of it comes near itself;
// the bowl, the stands and the paddock keep off it; it all fits inside the park's fence. And the
// land: the park's pad level, the road reaching it.

const t = kartTrack();
const inFence = (x: number, z: number, m: number) =>
  x > KART_FENCE.x0 + m && x < KART_FENCE.x1 - m && z > KART_FENCE.z0 + m && z < KART_FENCE.z1 - m;

test("the circuit: a lap of 700–900 m, a point a metre, inside the fence", () => {
  assert.ok(t.len > 700 && t.len < 900, `lap ${t.len} m`);
  for (let i = 0; i < t.len; i++) {
    const a = t.pts[i];
    const b = t.pts[(i + 1) % t.len];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(d > 0.9 && d < 1.1, `step ${d} at ${i}`);
    assert.ok(inFence(a.x, a.z, TRACK_W / 2 + 4), `off the park at ${i}: ${a.x}, ${a.z}`);
  }
  // no corner tighter than a kart can drift round
  for (const p of t.pts) assert.ok(Math.abs(p.k) < 1 / 12, `radius ${1 / Math.abs(p.k)} m at ${p.s}`);
});

test("the crossing: once, over a bridge you drive under", () => {
  const o = t.pts[t.cross.over];
  const u = t.pts[t.cross.under];
  assert.ok(Math.hypot(o.x - u.x, o.z - u.z) < 1.5);
  assert.equal(o.y, BRIDGE_H);
  assert.equal(u.y, 0);
  // the two roads cross near square (the bridge's span stays short)
  let da = Math.abs(o.a - u.a) % Math.PI;
  if (da > Math.PI / 2) da = Math.PI - da;
  assert.ok(da > 1.1, `crossing at ${da} rad`);
  // anywhere else, two parts of the lap keep a verge between them
  for (let i = 0; i < t.len; i += 2)
    for (let j = i + 2; j < t.len; j += 2) {
      if (Math.min(j - i, t.len - (j - i)) < 60) continue;
      const a = t.pts[i];
      const b = t.pts[j];
      if (Math.hypot(a.x - t.cross.x, a.z - t.cross.z) < 30) continue;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > TRACK_W + 8, `${i} and ${j} too near`);
    }
  // the ramps up are a kart's climb (under 16 %)
  for (let i = 0; i < t.len; i++) {
    const dy = Math.abs(t.pts[(i + 1) % t.len].y - t.pts[i].y);
    assert.ok(dy < 0.16, `grade ${dy} at ${i}`);
  }
});

test("the grid, the boxes, the pads, the jump: on the track, in order", () => {
  for (const g of t.grid) {
    const p = trackAt(t, t.len - 1);
    assert.ok(Math.hypot(g.x - p.x, g.z - p.z) < 40);
  }
  // the grid behind the line, on the flat
  for (const s of [...t.boxes, ...t.pads.map((p) => p.s), t.ramp.s])
    assert.ok(trackAt(t, s).y === 0, `${s} on the bridge`);
  assert.ok(t.checks.every((c, i) => i === 0 || c > t.checks[i - 1]));
});

test("around it: the bowl, the stands and the paddock keep off the circuit", () => {
  const clear = (x: number, z: number) => Math.min(...t.pts.map((p) => Math.hypot(p.x - x, p.z - z)));
  assert.ok(clear(KART_BOWL.x, KART_BOWL.z) > KART_BOWL.r + KART_BOWL.rim + TRACK_W / 2 + 4);
  for (const s of KART_STANDS)
    for (let x = s.x0; x <= s.x1; x += 2) assert.ok(clear(x, s.z) > TRACK_W / 2 + 4, `stand at ${x}`);
  for (let x = KART_PADDOCK.x0; x <= KART_PADDOCK.x1; x += 2)
    for (let z = KART_PADDOCK.z0; z <= KART_PADDOCK.z1; z += 2)
      assert.ok(clear(x, z) > TRACK_W / 2, `paddock ${x}, ${z}`);
});

test("the land: the road in off the county road to the gate, the pad level under the circuit", async () => {
  const G = await import("./grounds.ts");
  assert.ok(G.KART_LAND);
  const road = G.WAYS.find((w) => w.key === "kart-road");
  const county = G.WAYS.find((w) => w.key === "road");
  assert.ok(road && county);
  const [x0, z0] = KART_ROAD[0];
  assert.ok(Math.min(...county.line.map(([x, z]) => Math.hypot(x - x0, z - z0))) < 1, "off the county road");
  // (it ends in the turning circle, the circle's paving up to the gate)
  const [ex, ez] = KART_ROAD[KART_ROAD.length - 1];
  assert.ok(Math.hypot(ex - KART_TURN.x, ez - KART_TURN.z) < KART_TURN.r);
  assert.equal(G.groundSurfaceAt(KART_GATE.x, KART_GATE.z + 1), "walk");
  assert.equal(G.groundSurfaceAt(KART_TURN.x + KART_TURN.r - 1, KART_TURN.z), "asphalt");
  for (const [x, z] of road.line) assert.equal(G.groundSurfaceAt(x, z), "asphalt");
  for (const p of t.pts) {
    assert.ok(Math.abs(G.groundAt(p.x, p.z) - KART_PARK.h) < 0.05, `pad at ${p.s}`);
    assert.equal(G.treeDensity(p.x, p.z), 0);
  }
  // the woods round it, the river and the road clear of the fence
  assert.ok(G.treeDensity(KART_FENCE.x0 - 30, KART_PARK.z) > 0.2);
  assert.ok(G.GROUNDS.z0 < KART_FENCE.z0 - 60);
  for (let x = KART_FENCE.x0; x <= KART_FENCE.x1; x += 4)
    assert.ok(
      Math.min(...county.line.map(([cx, cz]) => Math.hypot(cx - x, cz - KART_FENCE.z1))) > 20,
      `fence by the road at ${x}`,
    );
});

test("walking in the park: round the fence (through the gate), the stands, the bowl; over the bridge", async () => {
  const G = await import("./grounds.ts");
  const P = await import("./kart/park.ts");
  const walk = (x: number, z: number) => G.walkableTile(Math.floor(x), Math.floor(z));
  // the fence, but its gate
  assert.equal(walk(KART_FENCE.x0, KART_PARK.z), false);
  assert.equal(walk(KART_GATE.x, KART_GATE.z), true);
  // the stands, the tower, the desk, the bowl's wall; its terrace's not walked up to
  const st = P.KART_STANDS[0];
  assert.equal(walk((st.x0 + st.x1) / 2, st.z + 2), false);
  assert.equal(walk(P.KART_TOWER.x, P.KART_TOWER.z), false);
  assert.equal(walk(P.KART_DESK.x, P.KART_DESK.z), false);
  assert.equal(walk(P.KART_BOWL.x + P.KART_BOWL.r, P.KART_BOWL.z), false);
  // the circuit itself walkable and asphalt
  const on = trackAt(t, 300);
  assert.equal(walk(on.x, on.z), true);
  assert.equal(G.groundSurfaceAt(on.x, on.z), "asphalt");
  // the bridge (docs/plan/47-the-track-changer.md, phase 5): up a ramp, over the span and down the
  // other, on its road all the way (asphalt, whatever's raced), a step at a time
  const up = t.pts.filter((p) => p.y > 0.05);
  const land = (x: number, z: number) => G.landAt(x, z);
  let last = G.heightAt(up[0].x, up[0].z);
  for (let s = up[0].s - 3; s <= up[up.length - 1].s + 3; s += 0.5) {
    const p = trackAt(t, s);
    for (const off of [0, 4, -4]) {
      const x = p.x + Math.sin(p.a) * off;
      const z = p.z - Math.cos(p.a) * off;
      assert.equal(walk(x, z), true, `the deck walked at ${s} (${off} off its middle)`);
      assert.ok(Math.abs(G.heightAt(x, z) - (land(x, z) + p.y)) < 0.15, `its height at ${s}`);
      if (p.y > 0.05) assert.equal(G.groundSurfaceAt(x, z), "asphalt");
    }
    const h = G.heightAt(p.x, p.z);
    assert.ok(Math.abs(h - last) < 0.2, `no step on the deck at ${s}`);
    last = h;
  }
  const top = t.pts[t.cross.over];
  assert.ok(Math.abs(G.heightAt(top.x, top.z) - land(top.x, top.z) - P.BRIDGE_H) < 0.1, "the span's deck");
  // its sides, where it's up: a guard strip nobody walks (the road under the span cut there: it's
  // gone over now), and past it the land as it is
  for (const p of up.filter((q) => q.y > 1 && q.s % 4 === 0))
    for (const sgn of [1, -1]) {
      const strip = P.DECK_HALF + 0.8;
      const sx = p.x + Math.sin(p.a) * sgn * strip;
      const sz = p.z - Math.cos(p.a) * sgn * strip;
      assert.equal(walk(sx, sz), false, `the guard strip at ${p.s}`);
      const off = P.DECK_HALF + P.DECK_RAIL + 1;
      const ox = p.x + Math.sin(p.a) * sgn * off;
      const oz = p.z - Math.cos(p.a) * sgn * off;
      if (P.kartDeck(ox, oz, 3) && !P.kartDeckAt(ox, oz)) assert.equal(G.heightAt(ox, oz), land(ox, oz), "beside it");
    }
  // the paddock's concrete; cars kept out, the gate too
  assert.equal(
    G.groundSurfaceAt((P.KART_PADDOCK.x0 + P.KART_PADDOCK.x1) / 2, (P.KART_PADDOCK.z0 + P.KART_PADDOCK.z1) / 2),
    "walk",
  );
  assert.equal(G.carBlockedTile(Math.floor(KART_GATE.x), Math.floor(KART_GATE.z)), true);
  assert.equal(G.carBlockedTile(Math.floor(on.x), Math.floor(on.z)), true);
  // and the road in is a car's
  const r = KART_ROAD[1];
  assert.equal(G.carBlockedTile(Math.floor(r[0]), Math.floor(r[1])), false);
});

test("the park and its car park named where you are", async () => {
  const G = await import("./grounds.ts");
  assert.equal(G.placeAt(KART_PARK.x, KART_PARK.z).name, "Yutopia Kart Park");
  assert.equal(G.placeAt(KART_ROAD[2][0], KART_ROAD[2][1]).name, "Kart Park road");
});

test("the items: never the same twice running nor a second plough, unless nothing else could come", () => {
  for (let u = 0; u < 1; u += 0.01) {
    assert.notEqual(rollItem(0, false, u, ["ice"]), "ice");
    assert.notEqual(rollItem(1, false, u, ["plough", "drone"]), "plough");
  }
  // (the leader's odds have no drone or plough: barring all the rest still gives something)
  assert.ok(rollItem(0, false, 0.5, ["ice", "snowball", "umbrella", "stapler", "fax", "coffee"]));
});

test("Vortex's rubber band: quicker behind, Easy and Medium easing off ahead, Hard never", () => {
  assert.equal(vortexBand("hard", 0), 1);
  assert.ok(vortexBand("hard", 200) > vortexBand("medium", 200) && vortexBand("medium", 200) > vortexBand("easy", 200));
  assert.equal(vortexBand("hard", -200), 1);
  assert.ok(vortexBand("easy", -200) < vortexBand("medium", -200) && vortexBand("medium", -200) < 1);
  assert.ok(vortexBand("hard", 1e6) <= 1.1);
});

test("outside the gate: the car park, the turning circle, the billboard on the corner", async () => {
  const G = await import("./grounds.ts");
  const walk = (x: number, z: number) => G.walkableTile(Math.floor(x), Math.floor(z));
  const C = KART_CARPARK;
  // the car park's bays and aisle level and asphalt, cars in; its footway paved; the trees cleared
  for (let x = C.x0 + 1; x < C.x1; x += 3)
    for (let z = C.z0 + 1; z < C.z1; z += 3) {
      assert.equal(G.groundSurfaceAt(x, z), "asphalt", `car park ${x}, ${z}`);
      assert.ok(Math.abs(G.groundAt(x, z) - KART_PARK.h) < 0.05, `level ${x}, ${z}`);
      assert.equal(G.carBlockedTile(Math.floor(x), Math.floor(z)), false, `cars at ${x}, ${z}`);
      assert.equal(G.treeDensity(x, z), 0);
    }
  assert.equal(G.groundSurfaceAt((C.x0 + C.x1) / 2, (C.walk[0] + C.walk[1]) / 2), "walk");
  assert.ok(C.bx + C.bays * 2.7 < C.x1 - 2, "the bays fit");
  // the circle: driven round its island, the island not
  assert.equal(G.carBlockedTile(Math.floor(KART_TURN.x), Math.floor(KART_TURN.z)), true);
  assert.equal(G.carBlockedTile(Math.floor(KART_TURN.x - KART_TURN.r + 2), Math.floor(KART_TURN.z)), false);
  // the billboard: back off the county road, its posts walked round, clear of the road in and the river
  const county = G.WAYS.find((w) => w.key === "road");
  assert.ok(county);
  for (const [x, z] of kartSignPosts()) {
    assert.equal(walk(x, z), false, `post ${x}, ${z}`);
    const d = Math.min(...county.line.map(([cx, cz]) => Math.hypot(cx - x, cz - z)));
    assert.ok(d > 6 && d < 22, `post ${x}, ${z} from the road: ${d}`);
    assert.notEqual(G.groundSurfaceAt(x, z), "ice");
  }
  assert.ok(Math.abs(KART_SIGN.x - KART_ROAD[0][0]) < 25, "by the corner");
});

test("the paddock: the shed's posts, race control, the podium walked round (the benches onto); the desk and the rack reached", async () => {
  const G = await import("./grounds.ts");
  const P = await import("./kart/park.ts");
  const walk = (x: number, z: number) => G.walkableTile(Math.floor(x), Math.floor(z));
  for (const t of KART_THINGS) {
    // (the fire's benches as the office's: walked onto, sat on)
    assert.equal(walk(t.x, t.z), t.kind === "bench", `${t.kind} at ${t.x}, ${t.z}`);
    assert.ok(t.x - t.hx > KART_PADDOCK.x0 && t.x + t.hx < KART_PADDOCK.x1, `${t.kind} in the paddock`);
    assert.ok(t.z - t.hz > KART_PADDOCK.z0 && t.z + t.hz < KART_PADDOCK.z1, `${t.kind} in the paddock`);
    assert.ok(t.x - t.hx > KART_SHED.x1 + 1 || t.z - t.hz > KART_SHED.z1 + 1, `${t.kind} clear of the shed`);
  }
  assert.equal(walk(KART_SHED.x0, (KART_SHED.z0 + KART_SHED.z1) / 2), false);
  // in front of the desk and the rack's karts, the way's clear
  assert.equal(walk(P.KART_DESK.x + 2, P.KART_DESK.z), true);
  for (let i = 0; i < P.KART_RACK.n; i++)
    assert.equal(walk(P.KART_RACK.x + 2.5, P.KART_RACK.z0 + i * P.KART_RACK.dz), true);
  // from the gate up to the desk, a way through
  for (let z = KART_GATE.z - 1; z > P.KART_DESK.z + 2; z--) assert.equal(walk(KART_GATE.x, z), true, `way at ${z}`);
  // no lamp on anything
  for (const l of G.LAMPS)
    if (l.kind !== "flood")
      assert.ok(!KART_THINGS.some((t) => Math.abs(l.x - t.x) < t.hx + 1 && Math.abs(l.z - t.z) < t.hz + 1));
});

test("the park's seats: stood up from onto open ground, the benches facing the fire, a third for the crowd", async () => {
  const G = await import("./grounds.ts");
  const P = await import("./kart/park.ts");
  const walk = (x: number, z: number) => G.walkableTile(Math.floor(x), Math.floor(z));
  const all = P.kartSeats();
  const fire = KART_THINGS.find((t) => t.kind === "fire");
  assert.ok(fire);
  for (const s of all) assert.equal(walk(s.out[0], s.out[1]), true, `up from ${s.x}, ${s.z}`);
  const benches = all.filter((s) => s.stand === undefined);
  assert.equal(benches.length, 9);
  // round the fire only its barrel's tile walked round: every bench seat walked onto, and on
  // round between them
  for (const s of benches) assert.equal(walk(s.x, s.z), true, `onto ${s.x}, ${s.z}`);
  assert.equal(walk(fire.x, fire.z), false);
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ])
    assert.equal(walk(fire.x + dx, fire.z + dz), true, `by the fire ${dx}, ${dz}`);
  for (const s of benches)
    assert.ok(Math.cos(s.a) * (fire.x - s.x) + Math.sin(s.a) * (fire.z - s.z) > 1, `${s.x}, ${s.z} faces the fire`);
  const stand = all.filter((s) => s.stand !== undefined);
  const crowd = stand.filter((s) => s.crowd).length / stand.length;
  assert.ok(crowd > 0.2 && crowd < 0.4, `the crowd's share ${crowd}`);
  assert.equal(new Set(P.KART_FOLK.map((f) => f.id)).size, P.KART_FOLK.length);
});

test("the stands: two aisles a stand with no seats on them, walked round from its front wall, lit", async () => {
  const P = await import("./kart/park.ts");
  const G = await import("./grounds.ts");
  const walk = (x: number, z: number) => G.walkableTile(Math.floor(x), Math.floor(z));
  for (const [i, st] of P.KART_STANDS.entries()) {
    const seats = P.kartSeats().filter((s) => s.stand === i);
    for (const a of P.standAisles(st))
      assert.ok(!seats.some((s) => Math.abs(s.x - a) < P.STAND_AISLE / 2), `no seat on the aisle at ${a}`);
    // the front wall's in what you walk round; where you stand up to, open
    assert.equal(walk((st.x0 + st.x1) / 2 + 0.3, st.z + 0.1), false);
    assert.equal(walk((st.x0 + st.x1) / 2 + 0.3, st.z - 0.5), true);
    for (const s of seats.filter((q) => q.row === 0)) assert.equal(walk(s.out[0], s.out[1]), true, `up from ${s.x}`);
    // under its roof three lamps, two floods on the front over the straight
    const lights = P.standLights().filter((l) => l.x > st.x0 && l.x < st.x1);
    assert.equal(lights.length, 5);
    const R = P.standRoof(st);
    assert.ok(R.front > R.back && R.zFront < st.z && R.zBack > st.z + st.rows * 1.2);
  }
});
