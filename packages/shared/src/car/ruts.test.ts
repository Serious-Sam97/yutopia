import assert from "node:assert/strict";
import { test } from "node:test";
import { RUT_PASS, type RutHit, Ruts } from "./ruts.ts";

// (docs/plan/93 S6) ruts: pressed by a wheel, deeper on a second pass, found from beside them, filled by the snow.
const hit = (): RutHit => ({ off: 0, k: 0, dx: 0, dz: 0 });

test("a wheel's steps through deep snow: a rut, found 10 cm beside it (and which side), not 40 cm off", () => {
  const r = new Ruts();
  for (let x = 0; x < 5; x += 0.4) r.lay(x, 0, x + 0.4, 0);
  const h = r.at(2, 0.1, hit());
  assert.ok(h, "in it");
  assert.equal(h.k, RUT_PASS);
  assert.ok(Math.abs(h.off - 0.1) < 1e-9, `off ${h.off}`);
  assert.ok(Math.abs(h.dx - 1) < 1e-9);
  assert.equal(r.at(2, 0.4, hit()), null, "beside it");
});

test("a second pass along it (either way) deepens it, never another rut beside; the snow fills it back in", () => {
  const r = new Ruts();
  for (let x = 0; x < 4; x += 0.4) r.lay(x, 0, x + 0.4, 0);
  const n = r.count;
  for (let x = 4; x > 0.2; x -= 0.4) r.lay(x, 0.03, x - 0.4, 0.03);
  assert.equal(r.count, n, "deepened, not more of them");
  assert.equal(r.at(1.9, 0, hit())?.k, 1);
  r.fill(0.6);
  assert.ok(Math.abs((r.at(1.9, 0, hit())?.k ?? 0) - 0.4) < 1e-9);
  r.fill(0.5);
  assert.equal(r.count, 0, "filled");
});
