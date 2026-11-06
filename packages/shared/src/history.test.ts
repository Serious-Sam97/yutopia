import assert from "node:assert/strict";
import { test } from "node:test";
import { quarterYaw } from "./catalog.ts";
import { applyStep, diffStep, snapshot } from "./history.ts";
import { studio } from "./maps/studio.ts";

// The things' half of a step (the structure's is its operations, undone by them: structure tests).

const plant = { id: "p1", kind: "plant", x: 10, y: 3, yaw: quarterYaw(0) };

test("undo/redo: a thing put down goes back and forth", () => {
  const before = snapshot(studio.objects);
  const after = snapshot([...studio.objects, plant]);
  const step = diffStep(before, after, "placed furniture");
  assert.ok(step);
  assert.deepEqual(
    step.objects.map((o) => o.id),
    ["p1"],
  );
  const back = applyStep([...studio.objects, plant], step, "back");
  assert.deepEqual(back.remove, ["p1"]);
  assert.equal(back.skipped, 0);
  const fwd = applyStep(studio.objects, step, "forward");
  assert.deepEqual(fwd.put, [plant]);
});

test("undo skips what someone else changed since; nothing changed is no step", () => {
  const moved = { ...plant, x: 12 };
  const step = diffStep(snapshot([plant]), snapshot([moved]), "x");
  assert.ok(step);
  // someone moves the plant again
  const back = applyStep([{ ...plant, x: 14 }], step, "back");
  assert.deepEqual(back.put, [], "their move wins");
  assert.equal(back.skipped, 1);
  assert.equal(diffStep(snapshot([plant]), snapshot([plant]), "nothing"), null);
});
