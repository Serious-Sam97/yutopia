// The parks' named gaps (docs/plan/104-the-skate-again.md F9a): 6–12 a park, each zone in its park and on what it
// says it's on — a piece's face, a grind line, or the floor — the two zones apart, the ids one each.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GAPS, type GapZone, inZone } from "./gaps.ts";
import { parkPieces, TOWN_PARKS } from "./parks.ts";
import { SkatePark } from "./pieces.ts";

const parks = new Map(TOWN_PARKS.map((p) => [p.key, { p, park: new SkatePark(parkPieces(p)) }]));

/** What's ridden or ground within a zone: a piece's top under it (within its radius), a grind line, the floor. */
function onWhat(key: string, g: GapZone): { top: boolean; line: boolean; floor: boolean } {
  const { p, park } = parks.get(key) as NonNullable<ReturnType<typeof parks.get>>;
  let top = false;
  // (anywhere across the zone's disc: a top within its ball)
  for (let a = 0; a < 8 && !top; a++)
    for (const k of [0, 0.5, 0.9]) {
      const x = g.x + Math.cos((a * Math.PI) / 4) * g.r * k;
      const y = g.y + Math.sin((a * Math.PI) / 4) * g.r * k;
      const t = park.topAt(x, y, g.z + g.r, 0);
      if (t && inZone(g, x, y, t.z)) top = true;
    }
  const ln = park.line(g.x, g.y, g.z, g.r);
  const line = !!ln && inZone(g, ln.x, ln.y, ln.z);
  const floor = Math.abs(g.z - p.h) <= g.r && !park.topAt(g.x, g.y, p.h + 0.05, 0.05);
  return { top, line, floor };
}

test("the gaps: 6–12 a park, one id each, named, scored", () => {
  const ids = new Set<string>();
  for (const p of TOWN_PARKS) {
    const n = GAPS.filter((g) => g.park === p.key).length;
    assert.ok(n >= 6 && n <= 12, `${p.key}: ${n} gaps`);
  }
  for (const g of GAPS) {
    assert.ok(!ids.has(g.id), `${g.id}: one`);
    ids.add(g.id);
    assert.ok(parks.has(g.park), `${g.id}: its park`);
    assert.ok(g.name.length > 3 && g.pts >= 100 && g.pts <= 5000, `${g.id}: named and scored`);
    const names = GAPS.filter((o) => o.name === g.name);
    assert.equal(names.length, 1, `${g.name}: one gap of that name`);
  }
});

test("the gaps' zones: in their park, on a face, a line or the floor, apart", () => {
  for (const g of GAPS) {
    const { p } = parks.get(g.park) as NonNullable<ReturnType<typeof parks.get>>;
    for (const [end, zn] of [
      ["from", g.from],
      ["to", g.to],
    ] as const) {
      const what = `${g.id} ${end}`;
      assert.ok(zn.r >= 0.4 && zn.r <= 3, `${what}: its radius ${zn.r}`);
      assert.ok(zn.x > p.x0 && zn.x < p.x1 && zn.y > p.z0 && zn.y < p.z1, `${what}: in ${p.key}`);
      const on = onWhat(g.park, zn);
      if (g.via === "grind") {
        // (a grind's: on its rail or coping — the landing end of a rail into a bank on the bank's face)
        assert.ok(on.line || (end === "to" && on.top), `${what}: on a grind line (${JSON.stringify(on)})`);
      } else if (g.via === "manual") {
        assert.ok(on.top || on.line, `${what}: on a piece (${JSON.stringify(on)})`);
      } else assert.ok(on.top || on.floor || on.line, `${what}: on something (${JSON.stringify(on)})`);
    }
    // (the two apart: leaving one is never already being in the other)
    const d = Math.hypot(g.from.x - g.to.x, g.from.y - g.to.y, g.from.z - g.to.z);
    assert.ok(d > Math.max(g.from.r, g.to.r) * 0.9, `${g.id}: its zones ${d.toFixed(2)} apart`);
  }
});

test("a gap's air: a stair gap's landing past its stairs on the floor, a drop's lower than its take-off", () => {
  for (const g of GAPS) {
    if (g.kind === "stair" && g.via === "air") {
      assert.ok(onWhat(g.park, g.to).floor, `${g.id}: lands on the floor`);
      assert.ok(g.from.z - g.to.z > 1, `${g.id}: down a flight`);
    }
    if (g.id.endsWith("drop")) assert.ok(g.from.z - g.to.z > 2, `${g.id}: a drop`);
  }
});
