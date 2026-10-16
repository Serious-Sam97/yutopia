import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace, studio, type WorldObjectDef } from "./index.ts";
import {
  cleanLabel,
  computerFacing,
  computerGlass,
  isEra,
  isPhase,
  monitorsToComputers,
  nextPhaseOk,
} from "./computer.ts";

// The studio's computers (docs/plan/19-vortexos.md).
test("computers: the glass on the monitor, turned with it, lifted onto the desk", () => {
  const pc: WorldObjectDef = { id: "pc", kind: "computer", x: 10, y: 3, rot: 0, props: { c: [1, 2], z: 25 } };
  const g = computerGlass(pc);
  assert.ok(g);
  assert.equal(g.zTop, 17.6 + 25);
  assert.ok(g.zTop > g.zBot);
  // facing −y at rot 0: its left (as you look at it) is the +x side
  assert.ok(g.tl[0] > g.tr[0]);
  assert.equal(g.tl[1], g.tr[1]);
  // turned: the glass turns too, and only rot 1/2 face the iso camera
  const turned = computerGlass({ ...pc, rot: 2 });
  assert.ok(turned && turned.tl[0] < turned.tr[0]);
  assert.deepEqual([0, 1, 2, 3].map((rot) => computerFacing({ ...pc, rot })), [false, true, true, false]);
  assert.equal(computerGlass({ ...pc, kind: "tv_portable" }), null);
});

test("computers: what an OS may report", () => {
  assert.ok(isPhase("desktop") && isPhase("saver") && !isPhase("hacked"));
  assert.ok(isEra("win98") && isEra("vortex") && !isEra("amiga"));
  assert.ok(nextPhaseOk("boot", "desktop") && nextPhaseOk("desktop", "login"));
  assert.ok(!nextPhaseOk("shutdown", "desktop"), "a shutdown is final");
  assert.equal(cleanLabel("Paint\u0007<b>"), "Paintb");
  assert.equal(cleanLabel(42), "");
  assert.equal(cleanLabel("x".repeat(80)).length, 40);
});

test("computers: the desks' old monitors become computers, in place, once", () => {
  const desk: WorldObjectDef = { id: "d", kind: "desk", x: 10, y: 3, rot: 0, props: { split: 1 } };
  const mon: WorldObjectDef = { id: "m", kind: "tabletop", x: 10, y: 3, rot: 2, props: { d: "monitor", c: [1, 2], z: 25, seed: 0.7 } };
  const mug: WorldObjectDef = { id: "u", kind: "tabletop", x: 11, y: 3, rot: 0, props: { d: "mug", c: [0, 0], z: 25 } };
  const one = monitorsToComputers([desk, mon, mug]);
  assert.equal(one.changed.length, 1);
  const pc = one.objects.find((o) => o.id === "m");
  assert.deepEqual(pc, { id: "m", kind: "computer", x: 10, y: 3, rot: 2, props: { c: [1, 2], z: 25, seed: 0.7 } });
  assert.ok(canPlace(studio, [desk, mug], pc as WorldObjectDef), "still fits where the monitor was");
  assert.equal(monitorsToComputers(one.objects).changed.length, 0);
});
