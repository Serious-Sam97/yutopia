import assert from "node:assert/strict";
import { test } from "node:test";
import { FAST, FLY, POWERS } from "@yutopia/shared/admin";
import { FAST_X, FLY_ACROSS, FLY_RISE, FLY_SPRINT, FLY_TOP, P_CLIP, P_FAST, P_FLY, P_HIDDEN } from "./powers.ts";

test("the input chunk's copy of the admins' powers agrees with shared admin.ts", () => {
  assert.deepEqual(
    { fly: P_FLY, clip: P_CLIP, fast: P_FAST, hidden: P_HIDDEN },
    { fly: POWERS.fly, clip: POWERS.clip, fast: POWERS.fast, hidden: POWERS.hidden },
  );
  assert.deepEqual(
    { across: FLY_ACROSS, sprint: FLY_SPRINT, rise: FLY_RISE, top: FLY_TOP, fast: FAST_X },
    { ...FLY, fast: FAST },
  );
});
