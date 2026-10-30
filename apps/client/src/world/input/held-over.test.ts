import assert from "node:assert/strict";
import { test } from "node:test";
import { MoveClock, NO_INPUT } from "@yutopia/shared/move";
import { afterFirstStep, HeldOver } from "./controls";

// A jump pressed in a frame that ran no fixed step (a 120 Hz screen's, now and then) isn't lost:
// the next frame's first step takes it.
test("a press in a frame with no fixed step goes to the next frame's first step", () => {
  const clock = new MoveClock();
  const held = new HeldOver();
  const frame = (dt: number, press: boolean) => {
    const move = { ...NO_INPUT, jumpPressed: press };
    const took: boolean[] = [];
    let first = true;
    held.add(move);
    clock.advance(dt, () => {
      took.push(move.jumpPressed);
      if (first) {
        afterFirstStep(move);
        first = false;
      }
    });
    held.after(move, !first);
    return took;
  };
  // (a short frame: no step — the press waits)
  assert.deepEqual(frame(0.004, true), []);
  // (the next frame's first step takes it, once)
  assert.deepEqual(frame(0.012, false), [true]);
  assert.deepEqual(frame(0.009, false), [false, false]);
});
