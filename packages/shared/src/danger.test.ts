import assert from "node:assert/strict";
import { test } from "node:test";
import { BLACKOUT_WINDOW_MS, blackoutAt, blackoutIn, DANGER_DAY, DANGER_NIGHT, dangerAt, HQ_DOORS } from "./danger.ts";
import { POND, treeDensity } from "./grounds.ts";

// out on the open snow by the pond: no trees, far from the HQ
const open = { x: POND.cx, z: POND.cz, storm: 0, lit: false, inHQ: false };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("danger by the hour: day, a ramp at dawn and dusk, night", () => {
  assert.equal(treeDensity(open.x, open.z), 0);
  assert.ok(near(dangerAt({ ...open, hour: 12 }), DANGER_DAY));
  assert.ok(near(dangerAt({ ...open, hour: 9 }), DANGER_DAY));
  assert.ok(near(dangerAt({ ...open, hour: 23 }), DANGER_NIGHT));
  assert.ok(near(dangerAt({ ...open, hour: 2 }), DANGER_NIGHT));
  const dusk = dangerAt({ ...open, hour: 19 });
  const dawn = dangerAt({ ...open, hour: 6.25 });
  assert.ok(dusk > DANGER_DAY && dusk < DANGER_NIGHT);
  assert.ok(dawn > DANGER_DAY && dawn < DANGER_NIGHT);
  // no step anywhere round the clock (and 24 is 0)
  for (let h = 0; h < 24; h += 0.01)
    assert.ok(Math.abs(dangerAt({ ...open, hour: h + 0.01 }) - dangerAt({ ...open, hour: h })) < 0.01, `${h}`);
  assert.ok(near(dangerAt({ ...open, hour: 24 }), dangerAt({ ...open, hour: 0 })));
});

test("a storm adds, the woods multiply, the HQ's doors halve", () => {
  assert.ok(near(dangerAt({ ...open, hour: 12, storm: 1 }), DANGER_DAY + 0.25));
  assert.ok(near(dangerAt({ ...open, hour: 12, storm: 0.5 }), DANGER_DAY + 0.125));
  // the thickest woods: up to ×1.3
  let deep = { x: 0, z: 0, d: 0 };
  for (let x = -380; x < 200; x += 7)
    for (let z = -340; z < 160; z += 7) {
      const d = treeDensity(x, z);
      if (d > deep.d) deep = { x, z, d };
    }
  assert.ok(deep.d > 0.8);
  const woods = dangerAt({ ...open, x: deep.x, z: deep.z, hour: 12 });
  assert.ok(woods > DANGER_DAY * 1.2 && woods <= DANGER_DAY * 1.3 + 1e-9, `${woods}`);
  // by the doors, halved; never over 1
  assert.ok(near(dangerAt({ ...open, x: HQ_DOORS.x - 20, z: HQ_DOORS.z, hour: 23 }), DANGER_NIGHT / 2));
  assert.ok(near(dangerAt({ ...open, x: HQ_DOORS.x - 39, z: HQ_DOORS.z, hour: 23 }), DANGER_NIGHT / 2));
  assert.ok(dangerAt({ ...open, x: deep.x, z: deep.z, hour: 23, storm: 1 }) <= 1);
});

test("nothing inside the HQ or in the light; the town's buildings aren't safe", () => {
  assert.equal(dangerAt({ ...open, hour: 23, storm: 1, inHQ: true }), 0);
  assert.equal(dangerAt({ ...open, hour: 23, storm: 1, lit: true }), 0);
  // the diner (inside it, by the town's own numbers): as dangerous as out on the street
  assert.ok(dangerAt({ ...open, x: 345, z: -391, hour: 23 }) >= DANGER_NIGHT - 1e-9);
});

test("blackouts: rare, a few minutes, only after dark", () => {
  let n = 0;
  for (let w = 0; w < 2000; w++) {
    const b = blackoutIn(w);
    if (!b) continue;
    n++;
    const len = (b.to - b.from) / 60_000;
    assert.ok(len >= 3 && len <= 6 && b.from >= 0 && b.to <= BLACKOUT_WINDOW_MS, `${w}: ${len}`);
    const mid = w * BLACKOUT_WINDOW_MS + (b.from + b.to) / 2;
    assert.equal(blackoutAt(mid, 23), true);
    assert.equal(blackoutAt(mid, 12), false); // by day: nothing to put out
    assert.equal(blackoutAt(w * BLACKOUT_WINDOW_MS + b.to + 1, 23), false);
  }
  assert.ok(n > 120 && n < 290, `${n} in 2000 windows`);
});
