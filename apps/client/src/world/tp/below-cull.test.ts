import assert from "node:assert/strict";
import { test } from "node:test";
import { Box3, Vector3 } from "three";
import { BelowCull } from "./below-cull";

// The window portal (below-cull.ts aim/hidesFar): from inside my floor, what's far outside behind its solid walls
// is left out; what's seen through a window, or over the walls, or inside them, isn't.

// a 20 × 20 map: a 10 × 10 room in its middle (5…14), walled all round; one window on its east wall (x = 15 edge,
// rows 9–10): its tiles either side are ways out
function floor(): BelowCull {
  const b = new BelowCull();
  const inside = (x: number, y: number) => x >= 5 && x < 15 && y >= 5 && y < 15;
  b.setSlab({ at: new Vector3(0, 0, 0), w: 20, h: 20, covers: inside }, 1);
  const win = (x: number, y: number) => (x === 14 || x === 15) && (y === 9 || y === 10);
  b.setShell({ bad: win, top: 3 }, 1, (x, y) => !inside(x, y));
  return b;
}
const eye = new Vector3(8, 1.5, 10);
const box = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 2) =>
  new Box3(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1));

test("far outside behind a solid wall: left out", () => {
  const b = floor();
  b.aim(eye);
  assert.ok(b.hidesFar(box(-200, 0, -190, 20)), "west, behind the wall");
  assert.ok(b.hidesFar(box(0, -300, 20, -290)), "north");
});

test("through the window, inside the walls, over their top: kept", () => {
  const b = floor();
  b.aim(eye);
  assert.ok(!b.hidesFar(box(100, 9, 110, 11)), "east, through the window");
  assert.ok(!b.hidesFar(box(9, 9, 10, 10)), "in the room");
  assert.ok(!b.hidesFar(box(-200, 0, -190, 20, 0, 400)), "a tower over the walls' line");
});

test("no aim — the eye out of the room, a wall faded, switched off — nothing left out", () => {
  const b = floor();
  b.aim(new Vector3(2, 1.5, 2));
  assert.ok(!b.hidesFar(box(-200, 0, -190, 20)), "the eye outside");
  b.faded = [{ x0: 5, y0: 5, x1: 6, y1: 6 }];
  b.aim(eye);
  assert.ok(!b.hidesFar(box(-200, 0, -190, 20)), "a wall faded");
  b.faded = [];
  b.portalOff = true;
  b.aim(eye);
  assert.ok(!b.hidesFar(box(-200, 0, -190, 20)), "off");
});
