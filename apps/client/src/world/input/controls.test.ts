import assert from "node:assert/strict";
import { test } from "node:test";

// A slide is a crouch pressed on a sprint (shared/move/step.ts): that press isn't a crouch, so out
// of the slide — run on or jumped out of — you're up, not crouched (2026-10-30). The walker and
// /dev/move call controls.stand() on the slide's start, as here.

// (a pad plugged in, for the tests that want one: its buttons pressed by index)
const pads: unknown[] = [];
const padWith = (...down: number[]) => {
  pads[0] = {
    connected: true,
    mapping: "standard",
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
  };
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { platform: "MacIntel", getGamepads: () => pads },
});

async function slide(hold: boolean, after: "run" | "jump") {
  const { KH_MOVE, NO_INPUT, newBody, openFloor, stepBody, STEP_DT } = await import("@yutopia/shared/move");
  const { khBindings } = await import("./bindings");
  const { MoveControls } = await import("./controls");
  const env = { grid: openFloor(), footing: () => "floor" as const };
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

// The prompt's stack on a pad: LB held, ↑ ↓ go round it — not the lantern and first aid they are
// on their own.
test("LB and the d-pad's ↑ ↓: the one before / after in reach, not the torch or first aid", async () => {
  const { khBindings } = await import("./bindings");
  const { MoveControls } = await import("./controls");
  const c = new MoveControls({ ...khBindings(), pad: { ...khBindings().pad, torch: 12 } });
  const frame = (...down: number[]) => {
    padWith(...down);
    return c.read(0).presses;
  };
  frame();
  assert.deepEqual([...frame(12)], ["torch"], "↑ alone: the torch");
  frame();
  assert.deepEqual([...frame(13)], ["aid"], "↓ alone: first aid");
  frame();
  frame(4);
  assert.deepEqual([...frame(4, 13)], ["focusNext"]);
  frame(4);
  assert.deepEqual([...frame(4, 12)], ["focusPrev"]);
  pads.length = 0;
});
