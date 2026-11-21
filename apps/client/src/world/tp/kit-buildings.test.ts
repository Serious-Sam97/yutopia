import assert from "node:assert/strict";
import { test } from "node:test";
import { coloursOf, layoutOf } from "@yutopia/shared/building-styles";
import { BUILDINGS, groundAt } from "@yutopia/shared/grounds";
import { kitBatches } from "./kit-buildings";

// The kit's buildings as drawn (plan 110): what's seen from below and from in.
test("a gas station's canopy has an underside: seen from the forecourt it's a roof, not a hole (plan 113 review)", () => {
  const b = BUILDINGS.find((q) => q.kind === "gas");
  assert.ok(b);
  const L = layoutOf(b);
  assert.ok(L);
  const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  const { near } = kitBatches(L, y0, coloursOf(b), null);
  // (its deck: the canopy's box, a face down at its foot over the islands, a few metres up)
  let down = 0;
  for (const a of near.values())
    for (let i = 0; i < a.nor.length; i += 3)
      if (a.nor[i + 1] < -0.99 && a.pos[i + 1] - y0 > 4 && a.pos[i + 1] - y0 < 5.2) down++;
  assert.ok(down >= 4, `${down} vertices facing down under it`);
  // (one on the ground has none: what's on the ground has no underside to see)
  for (const a of near.values())
    for (let i = 0; i < a.nor.length; i += 3) if (a.nor[i + 1] < -0.99) assert.ok(a.pos[i + 1] - y0 > 0.05);
});
