import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOT as G_LOT,
  LOT_MOUTH as G_MOUTH,
  LOT_PAVE as G_PAVE,
  LOT_ROWS as G_ROWS,
  groundSurfaceAt,
  WAYS,
} from "./grounds.ts";
import {
  bayById,
  bayId,
  bayLabel,
  boardOf,
  claimable,
  LOT,
  LOT_MOUTH,
  type LotLayout,
  type LotRect,
  lotBanksOf,
  lotLayout,
  lotStripes,
} from "./lot.ts";

// The lot (docs/plan/42-the-lot.md): a car can get from the driveway to every
// bay and back, nothing stands where cars park or drive, and the geometry is
// the same whatever the doors.

const inside = (r: LotRect, x: number, z: number, m = 0) =>
  x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const overlaps = (a: LotRect, b: LotRect) =>
  a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const bayRect = (l: LotLayout, b: LotLayout["bays"][number]): LotRect => ({
  x0: b.x - l.bayL / 2,
  x1: b.x + l.bayL / 2,
  z0: b.z - l.bayW / 2,
  z1: b.z + l.bayW / 2,
});

/** Where a car's middle can be in an empty lot: a disc of its half-width clear of the islands,
 *  the dump, the pavement, the hatches, every bay but `into`, and the lot's edges (but the mouth). */
function drivable(l: LotLayout, into: LotRect | null) {
  const R = 1.05;
  const blocked: LotRect[] = [
    ...l.islands,
    l.dump,
    l.pavement,
    ...l.hatches,
    ...l.bays.map((b) => bayRect(l, b)).filter((r) => !(into && r.x0 === into.x0 && r.z0 === into.z0)),
  ];
  return (x: number, z: number) => {
    if (z < l.z0 + R && !(Math.abs(x - l.mouth.x) < l.mouth.w / 2 - R && z > l.z0 - 3)) return false;
    if (x < l.x0 + R || x > l.x1 - R || z > l.z1 - R) return false;
    return !blocked.some((r) => inside(r, x, z, R));
  };
}
/** Breadth first on a fine grid from the mouth: the cells reached. */
function reach(ok: (x: number, z: number) => boolean) {
  const S = 0.35;
  const seen = new Set<string>();
  const start: [number, number] = [LOT_MOUTH.x, LOT.z0 - 2];
  const q: [number, number][] = [start];
  const k = (x: number, z: number) => `${Math.round(x / S)},${Math.round(z / S)}`;
  seen.add(k(...start));
  while (q.length) {
    const [x, z] = q.pop() as [number, number];
    for (const [dx, dz] of [
      [S, 0],
      [-S, 0],
      [0, S],
      [0, -S],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      const key = k(nx, nz);
      if (seen.has(key) || !ok(nx, nz)) continue;
      seen.add(key);
      q.push([nx, nz]);
    }
  }
  return (x: number, z: number) => seen.has(k(x, z));
}

test("the lot: every bay is driven to from the driveway's mouth", () => {
  const l = lotLayout(18);
  // the aisles alone, every bay shut: both aisles and both cross aisles reached
  const open = reach(drivable(l, null));
  for (const [x, z] of [
    [l.aisles[0], 25],
    [l.aisles[1], 25],
    [-30, l.cross[0].z0 + 3],
    [-30, l.cross[1].z0 + 3],
  ])
    assert.ok(open(Math.round(x / 0.35) * 0.35, Math.round(z / 0.35) * 0.35), `reached ${x}, ${z}`);
  // each bay: into it from the mouth, its middle reached
  for (const b of l.bays) {
    const r = bayRect(l, b);
    const got = reach(drivable(l, r));
    const near = [0, 0.35, -0.35].some((d) => got(Math.round(b.x / 0.35) * 0.35, Math.round((b.z + d) / 0.35) * 0.35));
    assert.ok(near, `bay ${b.row}:${b.slot} reached`);
  }
});

test("the lot: nothing stands in a bay or an aisle", () => {
  const l = lotLayout(18);
  const bays = l.bays.map((b) => bayRect(l, b));
  const aisles: LotRect[] = [
    ...l.cross,
    ...l.aisles.map((x) => ({ x0: x - l.aisleW / 2, x1: x + l.aisleW / 2, z0: l.z0, z1: l.z1 })),
  ];
  for (const m of l.lamps) {
    assert.ok(
      l.islands.some((i) => inside(i, m.x, m.z)),
      `lamp ${m.x}, ${m.z} on an island`,
    );
    for (const r of [...bays, ...aisles]) assert.ok(!inside(r, m.x, m.z, 0.2), `lamp ${m.x}, ${m.z} clear`);
  }
  for (const [i, a] of bays.entries()) {
    for (const r of [l.dump, l.pavement, ...l.islands, ...l.hatches, ...aisles])
      assert.ok(!overlaps(a, r), `bay ${i} clear of the dump, the pavement, the islands, the aisles`);
    for (const [j, b] of bays.entries()) if (j !== i) assert.ok(!overlaps(a, b), `bays ${i} and ${j} apart`);
    assert.ok(a.x0 >= l.x0 && a.x1 <= l.x1 && a.z0 >= l.z0 && a.z1 <= l.z1, `bay ${i} on the lot`);
  }
  // the banks off the asphalt but for the dump's, and none in the mouth
  for (const k of lotBanksOf(l)) {
    assert.ok(inside(l.dump, k.x, k.z, 0.5) || !inside(l, k.x, k.z), `bank ${k.x}, ${k.z} off the asphalt`);
    assert.ok(!(Math.abs(k.x - l.mouth.x) < l.mouth.w / 2 + 2 && k.z < l.z0 + 0.5 && k.z > l.z0 - 4), "the mouth open");
  }
  // every parked car in a plain bay, none twice
  const used = new Set<number>();
  for (const c of l.cars) {
    const i = l.bays.findIndex((b) => b.x === c.x && Math.abs(b.z - c.z) < 0.5);
    assert.ok(i >= 0, "a car in a bay");
    assert.equal(l.bays[i].kind, "plain");
    assert.ok(!used.has(i));
    used.add(i);
  }
  assert.equal(l.cars.length, 16);
  assert.ok(l.bays.length >= 60, `${l.bays.length} bays`);
  assert.ok(lotStripes(l).length > l.bays.length);
});

test("the lot: the driveway lands on aisle W", () => {
  const d = WAYS.find((w) => w.key === "driveway");
  assert.ok(d);
  const [x, z] = d.line[0];
  const l = lotLayout();
  assert.ok(Math.abs(x - l.aisles[0]) < 0.05, `the driveway's end at x ${x}, aisle W at ${l.aisles[0]}`);
  assert.ok(Math.abs(z - l.z0) < 0.01, "on the lot's north edge, flush");
  // and runs on into the lot straight (its first few tiles within the aisle)
  for (const [px] of d.line.slice(0, 12)) assert.ok(Math.abs(px - l.aisles[0]) < 1.5);
});

test("the lot: the doors pick the visitor's bay, nothing else", () => {
  const a = lotLayout(10);
  for (const ez of [18, 24, 30, 40]) {
    const b = lotLayout(ez);
    assert.deepEqual(
      b.bays.map((x) => [x.x, x.z, x.dir]),
      a.bays.map((x) => [x.x, x.z, x.dir]),
    );
    assert.deepEqual(b.islands, a.islands);
    assert.deepEqual(b.lamps, a.lamps);
    assert.deepEqual(b.cars, a.cars);
    // the visitors' bay the visitor's car takes: within a few bays of the doors
    assert.equal(b.bays[b.visitorBay].kind, "visitor");
    assert.ok(Math.abs(b.bays[b.visitorBay].z - ez) < 12, `visitor bay by the doors at ${ez}`);
    assert.equal(b.bays.filter((x) => x.kind === "accessible").length, 2);
    assert.equal(b.bays.filter((x) => x.kind === "visitor").length, 3);
  }
});

test("the lot: the Grounds' copy of it agrees (grounds.ts keeps its own: it's lazy on the client)", () => {
  const l = lotLayout();
  assert.deepEqual(G_LOT, LOT);
  assert.deepEqual(G_MOUTH, LOT_MOUTH);
  assert.equal(G_PAVE, Math.round(l.pavement.x0));
  assert.ok(Math.abs(G_PAVE - l.pavement.x0) < 1e-6);
  assert.equal(groundSurfaceAt(l.aisles[1], 20), "asphalt");
  assert.equal(groundSurfaceAt(-11.5, 20), "walk", "the pavement");
  const spans = [
    ["w", "w"],
    ["mid-w", "mid-e"],
    ["e", "e"],
  ].map(([a, b]) => {
    const ra = l.rows.find((r) => r.key === a) as (typeof l.rows)[number];
    const rb = l.rows.find((r) => r.key === b) as (typeof l.rows)[number];
    const xs = [ra.aisle, ra.back, rb.aisle, rb.back];
    return [Math.min(...xs), Math.max(...xs)];
  });
  for (const [i, [x0, x1]] of spans.entries()) {
    assert.ok(Math.abs(G_ROWS.xs[i][0] - x0) < 1e-6 && Math.abs(G_ROWS.xs[i][1] - x1) < 1e-6, `row ${i}`);
  }
  assert.ok(Math.abs(G_ROWS.z0 - l.cross[0].z1) < 1e-6 && Math.abs(G_ROWS.z1 - l.cross[1].z0) < 1e-6);
  assert.equal(G_ROWS.bay, l.bayW);
});

test("the claimed bays: a label each, boards at their heads clear of a parked car", () => {
  const l = lotLayout();
  const labels = new Set(l.bays.map(bayLabel));
  assert.equal(labels.size, l.bays.length, "every bay its own label");
  for (const b of l.bays) {
    assert.match(bayLabel(b), /^[A-D]-\d\d$/);
    assert.equal(bayById(l, bayId(b)), b);
    const w = boardOf(l, b);
    // at the head's end, never inside the 4.9 a car takes in the middle of its bay
    const fromMid = (w.x - b.x) * -b.dir;
    assert.ok(fromMid > 4.9 / 2 + 0.2, `${bayLabel(b)}: the board ${fromMid.toFixed(2)} from its middle`);
    // its face looks into the bay
    assert.ok(Math.sin(w.ry) * (b.x - w.x) > 0, `${bayLabel(b)} faces its bay`);
    // off every island and aisle, and out of every other bay
    for (const o of l.bays)
      if (o !== b) assert.ok(!(Math.abs(w.x - o.x) < 4.9 / 2 && Math.abs(w.z - o.z) < l.bayW / 2));
  }
  // the pair share a post: C-03's board stands where B-03's does
  const b3 = bayById(l, "b-03");
  const c3 = bayById(l, "c-03");
  assert.ok(b3 && c3);
  assert.deepEqual([boardOf(l, b3).x, boardOf(l, b3).z], [boardOf(l, c3).x, boardOf(l, c3).z]);
  assert.ok(boardOf(l, b3).shared);
  // only the plain bays are anyone's
  assert.ok(l.bays.filter(claimable).every((b) => b.kind === "plain"));
  assert.ok(l.bays.some((b) => !claimable(b)));
});
