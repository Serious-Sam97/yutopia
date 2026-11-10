// The one look on live (the user, 2026-11-10: "we should have only one style on live"): the production
// build draws the life look whatever the address or a browser's kept setting says, and forgets the
// setting.
import assert from "node:assert/strict";
import { test } from "node:test";

test("look mode: live is the life look, whatever the address or the cache says", async () => {
  const removed: string[] = [];
  const g = globalThis as unknown as { window?: unknown };
  const env = process.env as Record<string, string | undefined>;
  const before = { window: g.window, env: env.NODE_ENV };
  env.NODE_ENV = "production";
  g.window = {
    location: { search: "?look=classic&build=old&out=old&pets=old" },
    localStorage: {
      getItem: () => "classic",
      removeItem: (k: string) => removed.push(k),
    },
  };
  try {
    const m = await import("./look-mode");
    m.setLookModeForTest(null);
    assert.equal(m.lookMode(), "life");
    assert.ok(m.isLifeBuild() && m.isLifeOut() && m.isLifePets(), "no old parts on live");
    assert.deepEqual(removed, ["yutopia:look"], "the kept look forgotten");
  } finally {
    g.window = before.window;
    env.NODE_ENV = before.env;
  }
});
