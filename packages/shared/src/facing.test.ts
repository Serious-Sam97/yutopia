import assert from "node:assert/strict";
import { test } from "node:test";
import { byteFace, face8, faceByte, faceStep, SEAT_FACE } from "./facing.ts";
import { dirFromDelta } from "./iso.ts";
import { byteToYaw, yawToByte } from "./move/spec.ts";

// Plan 72 phase 5: people face by a yaw, not one of the 8 iso screen ways `d` — the same 8 angles
// the 3D view drew `d` at (its world vector for each: d 0 the diagonal +x +y).
const D_VEC: [number, number][] = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
];

test("the 8 ways: each old facing's own direction gives its angle, as a byte and in radians", () => {
  for (const [d, [x, y]] of D_VEC.entries()) {
    assert.equal(dirFromDelta(x, y), d, "(the old way judged it so)");
    const b = faceByte(x, y);
    assert.equal(b, ((d + 1) % 8) * 32, `d ${d}`);
    assert.ok(Math.abs(Math.sin((byteToYaw(b) - Math.atan2(y, x)) / 2)) < 1e-9);
    assert.equal(face8(x, y), byteFace(b), "the radians and the byte agree exactly");
    assert.deepEqual(faceStep(b), [x, y], "the step a facing takes, as the old table had it");
  }
  assert.equal(faceByte(0, 0, 77), 77, "no way: as it was");
  assert.equal(face8(-1, 0), Math.PI);
  assert.equal(face8(-1, -1e-12), Math.PI, "(never −π)");
});

test("seats face away from their backs: rot 0 faces +y, then −x, −y, +x", () => {
  assert.deepEqual(
    SEAT_FACE.map((b) => faceStep(b)),
    [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ],
  );
  // (a player's own yaw byte reads back where it was)
  for (const a of [0.3, -2.9, 3.1]) assert.ok(Math.abs(Math.sin((byteFace(yawToByte(a)) - a) / 2)) < 0.013);
});
