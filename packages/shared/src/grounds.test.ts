import assert from "node:assert/strict";
import { after, test } from "node:test";
import { BLOCKS, campusBuilding, moveBlocks, upgradeGround } from "./building.ts";
import type { WorldObjectDef } from "./catalog.ts";
import { quarterYaw } from "./catalog.ts";
import { moveStep, RUN_SPEED, setOutdoors } from "./ground.ts";
import { GATE, groundsAreaAt, groundsOutdoors, heightAt, INSIDES, walkableTile, wallEdgeAt } from "./grounds.ts";
import { hearingGain } from "./hearing.ts";
import { type Height, stepHeight } from "./jump.ts";
import { levelMap } from "./levels.ts";
import { areaAt, edgeAt, type LevelDef, type MapDef, setAreasBeyond, setEdge, tileAt } from "./map.ts";
import { studio } from "./maps/studio.ts";
import { openingsIntoWalls } from "./openings.ts";
import type { Place } from "./physics/place.ts";
import { type TestWorld, testWorld } from "./physics/testing.ts";
import { foldMap, foldThings } from "./structure/fold.ts";
import { splitAll } from "./tops.ts";

// The ground floor on the Grounds (docs/plan/27-the-grounds.md): past the
// stored lobby and lot the land goes on, and you walk it.

function ground() {
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const b = campusBuilding(into.map, into.objects);
  assert.ok(b);
  const moved = new Map(b.moved.map((o) => [o.id, o]));
  const objects = [...into.objects.map((o) => moved.get(o.id) ?? o), ...b.add];
  const g0 = levelMap(b.map, 0) as MapDef;
  return { g0, map: b.map, objects };
}
// …on Jolt in the world's frame (the building's coords: structure/fold.ts), the land built round
// the floor and in each of `land`'s rectangles (x, z); its place on the ground floor, and its ways
const worlds: TestWorld[] = [];
after(() => {
  for (const w of worlds.splice(0)) w.dispose();
});
async function onJolt(land: { x0: number; z0: number; x1: number; z1: number }[] = []) {
  const { map, objects } = ground();
  const w = await testWorld(foldMap(map), foldThings(map, objects), { land });
  worlds.push(w);
  return { place: w.place(0), nav: await w.nav() };
}
setOutdoors(groundsOutdoors);
setAreasBeyond(groundsAreaAt);
after(() => {
  setOutdoors(null);
  setAreasBeyond(null);
});

// the floor's coords → the building's (its corner at ox, oy)
const B = (g0: MapDef, p: { x: number; y: number }) => ({ x: p.x + (g0.ox ?? 0), y: p.y + (g0.oy ?? 0) });
const L = (g0: MapDef, x: number, y: number) => ({ x: x - (g0.ox ?? 0), y: y - (g0.oy ?? 0) });

/** Walk a found way from `from` to `to` (the building's coords: the world's), feet on the ground. */
async function walk(
  j: { place: Place; nav: Awaited<ReturnType<TestWorld["nav"]>> },
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const grid = j.place;
  const path = await j.nav.pathSoon(0, from, to);
  assert.ok(path, `a way from ${from.x},${from.y} to ${to.x},${to.y}`);
  let pos = { ...from };
  const h: Height = { z: grid.groundAt(pos.x, pos.y, 0), vz: 0, up: false };
  let hi = h.z;
  let lo = h.z;
  for (const wp of path) {
    for (let i = 0; i < 4000; i++) {
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) break;
      const step = Math.min(d, RUN_SPEED / 60);
      const next = moveStep(grid, pos, { x: dx / d, y: dy / d }, step * 60, 1 / 60, h.z);
      assert.ok(next.x !== pos.x || next.y !== pos.y, `stuck at ${JSON.stringify(pos)} z ${h.z.toFixed(2)}`);
      pos = next;
      stepHeight(grid, pos.x, pos.y, h, 1 / 60);
      assert.ok(!h.up, `never off the ground walking (at ${JSON.stringify(pos)})`);
      if (grid.onLand(pos.x, pos.y)) {
        const b = pos;
        assert.ok(
          Math.abs(h.z - heightAt(b.x, b.y)) < 0.25,
          `feet on the land at ${b.x},${b.y}: ${h.z} vs ${heightAt(b.x, b.y)}`,
        );
      }
      hi = Math.max(hi, h.z);
      lo = Math.min(lo, h.z);
    }
  }
  return { pos, hi, lo };
}

test("the Grounds round the ground floor: out of the lot, onto the land", async () => {
  const j = await onJolt([{ x0: -200, z0: -60, x1: 0, z1: 60 }]);
  const grid = j.place;
  // the lot is the stored floor; west of it, past the floor's own tiles, the land
  const lot = { x: -30, y: 20 };
  assert.ok(grid.ok(Math.floor(lot.x), Math.floor(lot.y)));
  assert.ok(!grid.onLand(lot.x, lot.y), "the lot is the floor's own");
  const lawn = { x: -90, y: 20 };
  assert.ok(grid.onLand(lawn.x, lawn.y), "the lawn is land");
  assert.ok(grid.ok(Math.floor(lawn.x), Math.floor(lawn.y)));
  // the trail into the woods, to the pond's shore
  const r = await walk(j, lot, { x: -160, y: -6 });
  const at = r.pos;
  assert.ok(Math.hypot(at.x + 160, at.y + 6) < 1, `got there (${at.x}, ${at.y})`);
});

test("the Grounds: up the driveway to the gate, the floor never changing", async () => {
  const j = await onJolt([{ x0: -100, z0: -400, x1: 0, z1: 20 }]);
  const r = await walk(j, { x: -48, y: -6 }, { x: -40, y: -330 });
  assert.ok(r.hi > 2.9, `climbed (the driveway's top ${r.hi.toFixed(2)} — a storey's band, but it's the land)`);
  // the gate lets you through; the fence either side doesn't (a wall on the tiles' edge: thin as
  // it's drawn — docs/plan/50-the-volume.md)
  assert.ok(!wallEdgeAt("h", Math.floor(GATE.x), GATE.z));
  assert.ok(wallEdgeAt("h", Math.floor(GATE.x) + 20, GATE.z));
  const through = await walk(j, { x: -40, y: -330 }, { x: -40, y: -380 });
  assert.ok(through.pos.y < -375, "out past the gate");
});

test("the Grounds: the fence and the ridges are the edge", async () => {
  const round = (x: number, z: number) => ({ x0: x - 20, z0: z - 20, x1: x + 20, z1: z + 20 });
  const { place: grid } = await onJolt([round(-400, 0), round(0, 170), round(220, -100), round(-470, -100)]);
  // the fence: a wall on the tiles' edges (thin as it's drawn), stepped across nowhere
  for (const [x, z, dx, dz] of [
    [-400, 0, -1, 0],
    [0, 170, 0, 1],
    [220, -100, 1, 0],
  ]) {
    const p = { x: x - (dx > 0 ? 1 : 0), y: z - (dz > 0 ? 1 : 0) };
    const [tx, ty] = [Math.floor(p.x), Math.floor(p.y)];
    assert.ok(grid.ok(tx, ty), `inside the fence at ${x},${z}`);
    assert.ok(!grid.step(tx, ty, tx + dx, ty + dz), `the fence at ${x},${z}`);
  }
  // far out on the ridges: nothing to stand on
  const p = { x: -470, y: -100 };
  assert.ok(!grid.ok(Math.floor(p.x), Math.floor(p.y)));
});

test("the courtyard's blocks: their ground floors are the ground floor's own, and you walk in", async () => {
  const { g0, map } = ground();
  const j = await onJolt();
  const grid = j.place;
  assert.equal(upgradeGround(map), null, "once");
  for (const b of BLOCKS) {
    const mid = L(g0, (b.x0 + b.x1) / 2 - 6, (b.y0 + b.y1) / 2 + 3);
    assert.equal(areaAt(g0, mid.x, mid.y)?.key, b.key);
    const w = B(g0, mid);
    assert.ok(!grid.onLand(w.x, w.y), `${b.name}: the floor's own tiles`);
  }
  // from the lot, round the headquarters, across the courtyard, in at the east block's doors
  const r = await walk(j, { x: -30, y: 20 }, { x: 82, y: 18 });
  const at = L(g0, r.pos.x, r.pos.y);
  assert.equal(areaAt(g0, at.x, at.y)?.key, "east-block", `inside (${r.pos.x}, ${r.pos.y})`);
  // its glass is a wall: straight through it from the courtyard, no
  assert.ok(!grid.clear({ x: 72, y: 30 }, { x: 80, y: 30 }));
});

test("the blocks moved out of a bigger studio's way: a stored floor's old ones go, what was in them goes with them", () => {
  const { map } = ground();
  const l0 = map.levels?.find((l) => l.index === 0) as LevelDef;
  const ox = l0.ox;
  const oy = l0.oy;
  // as a world from before: the blocks where they first stood (east x 60, south y 48)
  const OLD: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {
    "east-block": { x0: 60, y0: -10, x1: 88, y1: 48 },
    "south-block": { x0: -4, y0: 48, x1: 50, y1: 72 },
  };
  const tiles = l0.tiles.map((r) => [...r]);
  const walls = { hWalls: [...l0.hWalls], vWalls: [...l0.vWalls] };
  for (const b of BLOCKS) {
    const n = { x: b.x0 - ox, y: b.y0 - oy, w: b.x1 - b.x0, h: b.y1 - b.y0 };
    for (let y = n.y; y < n.y + n.h; y++) for (let x = n.x; x < n.x + n.w; x++) tiles[y][x] = " ";
    for (let x = n.x; x <= n.x + n.w; x++)
      for (const y of [n.y, n.y + n.h]) if (x < n.x + n.w) setEdge(walls, { dir: "h", x, y }, ".");
    for (let y = n.y; y < n.y + n.h; y++) for (const x of [n.x, n.x + n.w]) setEdge(walls, { dir: "v", x, y }, ".");
    const o = OLD[b.key];
    const a = { x: o.x0 - ox, y: o.y0 - oy, w: o.x1 - o.x0, h: o.y1 - o.y0 };
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++) if (tiles[y][x] === " ") tiles[y][x] = "_";
    for (let x = a.x; x < a.x + a.w; x++) for (const y of [a.y, a.y + a.h]) setEdge(walls, { dir: "h", x, y }, "g");
    for (let y = a.y; y < a.y + a.h; y++) for (const x of [a.x, a.x + a.w]) setEdge(walls, { dir: "v", x, y }, "g");
  }
  const areas = l0.areas.map((a) => {
    const o = OLD[a.key];
    return o ? { ...a, x: o.x0 - ox, y: o.y0 - oy } : a;
  });
  const old: MapDef = {
    ...map,
    levels: (map.levels ?? []).map((l) =>
      l.index === 0 ? { ...l, tiles: tiles.map((r) => r.join("")), ...walls, areas } : l,
    ),
  };
  // a desk someone built in the old east block
  const desk: WorldObjectDef = {
    id: "d1",
    kind: "desk",
    x: 70 - ox,
    y: 20 - oy,
    yaw: quarterYaw(0),
    props: { level: 0 },
  };
  const r = moveBlocks(old, [desk]);
  assert.ok(r, "moved");
  assert.equal(moveBlocks(r.map, r.objects), null, "once");
  const g = levelMap(r.map, 0) as MapDef;
  for (const b of BLOCKS) {
    const a = g.areas.find((x) => x.key === b.key);
    assert.deepEqual([a?.x, a?.y], [b.x0 - ox, b.y0 - oy], `${b.name} where it stands now`);
  }
  // the old east block's glass is gone (its west wall, in the courtyard), its floor is land
  assert.equal(edgeAt(g, { dir: "v", x: 60 - ox, y: 30 - oy }), ".");
  assert.equal(tileAt(g, 66 - ox, 30 - oy), " ");
  // the desk went with it
  assert.deepEqual([r.moved[0]?.x, r.moved[0]?.y], [86 - ox, 20 - oy]);
});

test("the town: into the bar by its door, never through its wall; inside, you hear each other, not the street", async () => {
  const { g0, map } = ground();
  const bar = INSIDES.find((i) => i.b.sign === "BAR");
  assert.ok(bar);
  const b = bar.b;
  const j = await onJolt([{ x0: b.x0 - 40, z0: -440, x1: b.x1 + 40, z1: b.z1 + 40 }]);
  const grid = j.place;
  // its wall is a wall: from the pavement straight in, no
  assert.ok(!grid.clear({ x: b.x0 + 3, y: b.z0 - 1.5 }, { x: b.x0 + 3, y: b.z0 + 2 }));
  // by the door, yes (from Main Street to a table)
  const r = await walk(j, { x: (b.x0 + b.x1) / 2, y: -405 }, { x: b.x0 + 4.2, y: b.z0 + 6.5 });
  const inside = L(g0, r.pos.x, r.pos.y);
  const room = areaAt(g0, inside.x, inside.y);
  assert.equal(room?.name, "Bar");
  assert.equal(room?.kind, "private");
  // out on the street, the place is the street
  const street = L(g0, 430, -405);
  assert.equal(areaAt(g0, street.x, street.y)?.name, "Main Street");
  // hearing: two at the bar hear each other; someone on the pavement outside, nobody inside
  const ear = (p: { x: number; y: number }) => ({ ...p, level: 0 });
  const a = ear(L(g0, b.x0 + 4, b.z0 + 6));
  const c = ear(L(g0, b.x0 + 8, b.z0 + 10));
  const out = ear(L(g0, b.x0 + 4, b.z0 - 1.5));
  assert.ok(hearingGain(map, a, c) > 0, "inside, each other");
  assert.equal(hearingGain(map, a, out), 0, "the street can't hear the bar");
  assert.equal(hearingGain(map, out, a), 0);
});

test("the bridges: their decks flush with the way (no lip), their sides closed", async () => {
  const { WAYS, deckAt, onBridgeRail } = await import("./grounds.ts");
  // (each bridge of each way: the long road has two — docs/plan/69)
  const bridges: { w: (typeof WAYS)[number]; a: number; b: number }[] = [];
  for (const w of WAYS)
    for (const i of w.line.map((_, i) => i).filter((i) => w.bridged[i])) {
      const last = bridges[bridges.length - 1];
      if (last && last.w === w && i - last.b <= 2) last.b = i;
      else bridges.push({ w, a: i, b: i });
    }
  for (const { w, a, b } of bridges) {
    if (b - a < 1) continue;
    // walking along its line from the land before it to the land after: no step over 0.05
    let last = heightAt(...w.line[a - 6]);
    for (let i = a - 6; i < b + 6; i++)
      for (let k = 0; k < 4; k++) {
        const [x0, z0] = w.line[i];
        const [x1, z1] = w.line[i + 1];
        const h = heightAt(x0 + ((x1 - x0) * k) / 4, z0 + ((z1 - z0) * k) / 4);
        assert.ok(Math.abs(h - last) < 0.05, `${w.key}: a step of ${(h - last).toFixed(2)} at sample ${i}`);
        last = h;
      }
    // across it, mid-span: the deck to the rail, then blocked
    const m = Math.floor((a + b) / 2);
    const [px, pz] = w.line[m - 1];
    const [qx, qz] = w.line[m + 1];
    const l = Math.hypot(qx - px, qz - pz);
    const nx = -(qz - pz) / l;
    const nz = (qx - px) / l;
    const [x, z] = w.line[m];
    for (const s of [1, -1]) {
      assert.notEqual(
        deckAt(x + nx * s * (w.w / 2 - 0.2), z + nz * s * (w.w / 2 - 0.2)),
        null,
        `${w.key}: its deck to its edge`,
      );
      const o = w.w / 2 + 1;
      assert.ok(onBridgeRail(x + nx * s * o, z + nz * s * o), `${w.key}: past its rail`);
      assert.equal(
        walkableTile(Math.floor(x + nx * s * o), Math.floor(z + nz * s * o)),
        false,
        `${w.key}: nobody walks off it`,
      );
    }
  }
});

test("where two ways meet the ground doesn't step: the gatehouse, the town's edge, Church Street", async () => {
  const { WAYS } = await import("./grounds.ts");
  const W = (k: string) => WAYS.find((u) => u.key === k) as (typeof WAYS)[number];
  for (const [a, b] of [
    ["driveway", "road"],
    ["road", "main"],
  ]) {
    const [x, z] = W(a).line[W(a).line.length - 1];
    assert.ok(Math.abs(W(a).h[W(a).h.length - 1] - W(b).h[0]) < 0.02, `${a} → ${b}: their heights meet`);
    // across the join along the way's line, every 0.25: no step
    const L = [...W(a).line.slice(-8), ...W(b).line.slice(1, 8)];
    let last = heightAt(...L[0]);
    for (let i = 0; i + 1 < L.length; i++)
      for (let k = 1; k <= 4; k++) {
        const h = heightAt(L[i][0] + ((L[i + 1][0] - L[i][0]) * k) / 4, L[i][1] + ((L[i + 1][1] - L[i][1]) * k) / 4);
        assert.ok(Math.abs(h - last) < 0.05, `${a} → ${b}: a step of ${(h - last).toFixed(2)} near ${x}, ${z}`);
        last = h;
      }
  }
  const church = W("church-st");
  const main = W("main");
  const j = main.line.reduce(
    (bi, p, i) => (Math.abs(p[0] - church.line[0][0]) < Math.abs(main.line[bi][0] - church.line[0][0]) ? i : bi),
    0,
  );
  assert.ok(Math.abs(church.h[0] - main.h[j]) < 0.02, "Church Street starts at Main Street's height");
});
