import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits } from "@yutopia/shared/grounds";
import { type GroundsEdits, NO_EDITS } from "@yutopia/shared/grounds-edits";
import { addThing, thingDefOf } from "@yutopia/shared/grounds-things";
import { Scene } from "three";
import { type GodHud, hud } from "../store";
import { ThingsTool } from "./things";

// God mode's things tool, free (2026-11-01): put down where the pointer is, to the centimetre (a
// grid only when one's asked for), dragged keeping where it was grabbed, turned by the wheel while
// it's dragged — one step, when it's put down.

const FIELD = { x: 446.5, z: -238.5 }; // (the farm's field: in the world, nothing anchored)
const click = { clientX: 0, clientY: 0, altKey: false };

function tool(snap: GodHud["snap"] = 0) {
  let draft: GroundsEdits = NO_EDITS;
  const steps: GroundsEdits[] = [];
  const t = new ThingsTool(
    {
      draft: () => draft,
      change: (next) => {
        draft = next;
        steps.push(next);
        applyEdits(next);
      },
      up: () => 60,
      snap: () => snap,
      parts: () => [],
    },
    new Scene(),
  );
  const set = (d: GroundsEdits) => {
    draft = d;
    applyEdits(d);
  };
  return { t, steps, draft: () => draft, set };
}
const opts = (p: Partial<GodHud["things"]>) =>
  hud.set((s) => ({ god: { ...s.god, tool: "things", things: { ...s.god.things, sel: null, ...p } } }));

test("put down where the pointer is, to the centimetre; on the grid when there's one", () => {
  opts({ kind: "boulder", mode: "place", ry: 0, s: 1 });
  const free = tool(0);
  free.t.up({ x: FIELD.x + 0.237, z: FIELD.z + 0.611, h: 0 }, true, click);
  const a = free.draft().things?.add?.[0];
  assert.deepEqual(
    [a?.x, a?.z],
    [FIELD.x + 0.24, FIELD.z + 0.61].map((v) => Math.round(v * 100) / 100),
  );
  const half = tool(0.5);
  half.t.up({ x: 10.3, z: -20.2, h: 0 }, true, { ...click, clientX: 50 });
  const b = half.draft().things?.add?.[0];
  assert.deepEqual([b?.x, b?.z], [10.5, -20]);
  applyEdits(NO_EDITS);
});

test("dragged: it keeps where it was grabbed, and the wheel turns it — one step, put down", () => {
  opts({ kind: "boulder", mode: "place", ry: 0 });
  const k = tool(0);
  k.set(addThing(NO_EDITS, { key: "god-thing-1", kind: "boulder", x: FIELD.x, z: FIELD.z, ry: 0 }));
  // grabbed 0.8 m east of its middle, let go 5 m further east: it moved 5 m, not onto the pointer
  assert.ok(k.t.grab({ x: FIELD.x + 0.8, z: FIELD.z, h: 0 }));
  k.t.move({ x: FIELD.x + 5.8, z: FIELD.z, h: 0 });
  k.t.wheelTurn(5);
  k.t.wheelTurn(5);
  assert.equal(k.steps.length, 0, "no step while it's dragged");
  k.t.up({ x: FIELD.x + 5.8, z: FIELD.z, h: 0 }, false, click);
  assert.equal(k.steps.length, 1);
  const d = thingDefOf("god-thing-1");
  assert.ok(d);
  assert.ok(Math.abs(d.x - (FIELD.x + 5)) < 0.011, `x ${d.x}`);
  assert.ok(Math.abs(d.ry - (10 * Math.PI) / 180) < 1e-9, `ry ${d.ry}`);
  // turned in place (not moved): put down turned all the same
  assert.ok(k.t.grab({ x: d.x, z: d.z, h: 0 }));
  k.t.wheelTurn(-10);
  k.t.up({ x: d.x, z: d.z, h: 0 }, false, click);
  assert.ok(Math.abs(thingDefOf("god-thing-1")?.ry ?? 1) < 1e-9);
  applyEdits(NO_EDITS);
});

test("the wheel turns the kind to put down, never a picked one (a step a notch)", () => {
  opts({ kind: "bench", mode: "place", ry: 350 });
  const k = tool(0);
  k.t.wheelTurn(15);
  assert.equal(hud.get().god.things.ry, 5);
  hud.set((s) => ({ god: { ...s.god, things: { ...s.god.things, sel: { key: "x", kind: "bench", locked: null } } } }));
  k.t.wheelTurn(15);
  assert.equal(hud.get().god.things.ry, 5);
  assert.equal(k.steps.length, 0);
});
