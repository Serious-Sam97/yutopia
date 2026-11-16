import assert from "node:assert/strict";
import { test } from "node:test";
import { noDamage, PART, steamOf } from "./damage.ts";
import { holesWithout, mayMend, mend, nextMend } from "./repair.ts";

// (docs/plan/93 S7) mending: in order under the bonnet, a part at a time; where each may be done.
test("under the bonnet in order: the engine, the lamps, the panels (worst side first, its holes), the glass at the garage", () => {
  let dm = noDamage();
  dm.zones = [0.95, 0, 0.4, 0.7, 0];
  dm.parts = PART.engineDead | PART.headL | PART.sideR | PART.bumperHang;
  assert.ok(steamOf(dm) > 0);
  assert.equal(nextMend(dm, false), "engine");
  dm = mend(dm, "engine").dm;
  assert.equal(dm.parts & PART.engineDead, 0);
  assert.equal(steamOf(dm), 0, "no more steam");
  assert.equal(nextMend(dm, false), "lamps");
  dm = mend(dm, "lamps").dm;
  assert.equal(nextMend(dm, false), "panels");
  const m = mend(dm, "panels");
  assert.equal(m.zone, 0, "the front first: worst");
  dm = m.dm;
  assert.equal(dm.parts & PART.bumperHang, 0);
  assert.equal(mend(dm, "panels").zone, 3, "then the right");
  dm = mend(mend(dm, "panels").dm, "panels").dm;
  assert.equal(nextMend(dm, false), null, "the glass waits for the garage");
  assert.equal(nextMend(dm, true), "glass");
  assert.equal(mend(dm, "glass").dm.parts, 0);
});

test("where: the garage all of it; a wrench but no glass; a flat the spare's", () => {
  assert.ok(mayMend("glass", { garage: true, wrench: false, spare: 0 }));
  assert.ok(!mayMend("glass", { garage: false, wrench: true, spare: 1 }));
  assert.ok(!mayMend("engine", { garage: false, wrench: false, spare: 1 }));
  assert.ok(mayMend("engine", { garage: false, wrench: true, spare: 0 }));
  assert.ok(mayMend("tyre", { garage: false, wrench: false, spare: 1 }));
  assert.ok(!mayMend("tyre", { garage: false, wrench: true, spare: 0 }));
  const dm = noDamage();
  dm.parts = PART.flatRL | PART.flatFR;
  assert.equal(mend(dm, "tyre", 2).dm.parts, PART.flatFR);
  assert.equal(holesWithout("1,2,3,0;4,5,6,3;7,8,9,0", 0), "4,5,6,3");
});
