import assert from "node:assert/strict";
import { test } from "node:test";

// A slide is a crouch pressed on a sprint (shared/move/step.ts): that press isn't a crouch, so out
// of the slide — run on or jumped out of — you're up, not crouched (2026-10-30). The walker and
// /dev/move call controls.stand() on the slide's start, as here.

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { platform: "MacIntel", getGamepads: () => [] },
});

async function slide(hold: boolean, after: "run" | "jump") {
  const { Grid } = await import("@yutopia/shared");
  const { KH_MOVE, NO_INPUT, newBody, stepBody, STEP_DT } = await import("@yutopia/shared/move");
  const { khBindings } = await import("./bindings");
  const { MoveControls } = await import("./controls");
  const g = new Grid(80, 12);
  g.walk.fill(1);
  g.top.fill(0);
  const env = { grid: g, footing: () => "floor" as const };
  const c = new MoveControls({ ...khBindings(), crouchHold: hold });
  const b = newBody(2, 6);
  const frames = (secs: number) => {
    for (let i = 0; i < Math.round(secs / STEP_DT); i++) {
      // (camYaw 0: W is +x)
      const { move } = c.read(0);
      const ev = stepBody(b, { ...NO_INPUT, ...move }, env, KH_MOVE);
      if (ev.verb === "slide") c.stand();
    }
  };
  c.down("KeyW");
  c.down("ShiftLeft");
  frames(1);
  assert.equal(b.gait, "sprint");
  c.down("KeyC");
  frames(STEP_DT);
  assert.equal(b.verb?.kind, "slide", "a crouch on a sprint slides");
  // (a tap; held, the setting's crouch is held through the slide)
  if (!hold) c.up("KeyC");
  frames(0.2);
  if (after === "jump") {
    c.down("Space");
    frames(STEP_DT);
    c.up("Space");
    frames(1.2);
  } else frames(1.5);
  assert.equal(b.verb, null, "the slide's over");
  assert.equal(c.crouched, false);
  assert.equal(b.gait, "sprint", "up and running");
  // held crouch: up till it's let go, then a press crouches again
  if (hold) {
    c.up("KeyC");
    c.up("ShiftLeft");
    frames(0.1);
    c.down("KeyC");
    frames(0.1);
    assert.equal(b.gait, "crouch", "pressed again, a crouch");
  } else {
    c.up("ShiftLeft");
    // (slowed to a run first: at a sprint's speed a crouch is a slide again)
    frames(0.6);
    c.down("KeyC");
    frames(STEP_DT);
    c.up("KeyC");
    frames(0.1);
    assert.equal(b.gait, "crouch", "pressed again, a crouch");
  }
}

for (const hold of [false, true])
  for (const after of ["run", "jump"] as const)
    test(`a slide, then ${after === "run" ? "run on" : "jump out"} (crouch ${hold ? "held" : "a toggle"}): standing`, () =>
      slide(hold, after));
