import assert from "node:assert/strict";
import { test } from "node:test";
import { HQ_DOORS, onPathAt } from "./danger.ts";
import { cacheItems, dayNests, dayOf, isDay, NESTS, nestCount, revive } from "./dark/nests.ts";
import { BUILDINGS } from "./grounds.ts";
import { STACKS } from "./inventory.ts";

// The day's nests (docs/plan/31-the-day.md, phase 2): seeded by the day, the
// same for everyone; spread, never on a path or near the HQ; some at each named
// place; the shadowed capped; the caches what one of them carried.

const day = dayOf(Date.UTC(2026, 9, 22, 15));

test("the same day, the same nests; another day, others", () => {
  const t0 = performance.now();
  const a = dayNests(day);
  console.log(
    `[nests] ${a.length} laid out in ${(performance.now() - t0).toFixed(0)} ms (the woods' candidates the first time)`,
  );
  const b = dayNests(day);
  assert.deepEqual(a, b);
  const c = dayNests(day + 1);
  assert.notDeepEqual(
    a.map((n) => [n.x, n.z]),
    c.map((n) => [n.x, n.z]),
  );
});

test("spread: never on a path (the woods' 6 tiles clear), never near the HQ, never in a building; apart", () => {
  for (const d of [day, day + 1, day + 2]) {
    const all = dayNests(d);
    assert.ok(all.length >= NESTS.base, `${all.length} nests`);
    for (const n of all) {
      assert.ok(!onPathAt(n.x, n.z), `${n.id} on a path`);
      assert.ok(Math.hypot(n.x - HQ_DOORS.x, n.z - HQ_DOORS.z) >= NESTS.hq, `${n.id} by the HQ`);
      assert.ok(!BUILDINGS.some((b) => n.x > b.x0 && n.x < b.x1 && n.z > b.z0 && n.z < b.z1), `${n.id} in a building`);
      if (n.zone === "woods")
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          assert.ok(!onPathAt(n.x + Math.cos(a) * NESTS.path, n.z + Math.sin(a) * NESTS.path), `${n.id} near a path`);
        }
      for (const m of all)
        if (m !== n)
          assert.ok(
            Math.hypot(m.x - n.x, m.z - n.z) >=
              (n.zone === "woods" && m.zone === "woods" ? NESTS.apart : NESTS.apartNamed) - 1e-6,
            `${n.id} and ${m.id} too close`,
          );
    }
  }
});

test("some at each place: the farm, the town's edges, the ravine, the pond — and mostly the woods; 1–4 in each", () => {
  const all = dayNests(day);
  const zones = new Map<string, number>();
  for (const n of all) zones.set(n.zone, (zones.get(n.zone) ?? 0) + 1);
  for (const z of ["farm", "town", "ravine", "pond", "woods"]) assert.ok((zones.get(z) ?? 0) > 0, `none at the ${z}`);
  assert.ok((zones.get("woods") ?? 0) > all.length / 2, "mostly the woods");
  assert.ok((zones.get("town") ?? 0) <= 4, "only a few round the town");
  for (const n of all) assert.ok(n.n >= 1 && n.n <= 4);
  // the first 30 (a day nobody's been out) have the named places in them too
  const first = all.slice(0, NESTS.base);
  assert.ok(first.some((n) => n.zone === "farm") && first.some((n) => n.zone === "town"));
});

test("how many: 30 nests, ~60 shadowed; more with people out; never past 90", () => {
  const all = dayNests(day);
  const k0 = nestCount(all, 0);
  assert.equal(k0, NESTS.base);
  const s0 = all.slice(0, k0).reduce((a, n) => a + n.n, 0);
  assert.ok(s0 >= 45 && s0 <= 80, `${s0} shadowed`);
  const k5 = nestCount(all, 5);
  assert.ok(k5 > k0);
  const s5 = all.slice(0, k5).reduce((a, n) => a + n.n, 0);
  assert.ok(s5 <= NESTS.cap);
});

test("the caches: most nests keep one, what fits the place, twice as much in a big nest", () => {
  const all = dayNests(day);
  const kept = all.filter((n) => n.cache);
  assert.ok(kept.length > all.length * 0.4 && kept.length < all.length * 0.8);
  for (const n of kept) {
    const c = n.cache as NonNullable<typeof n.cache>;
    assert.ok(Math.hypot(c.x - n.x, c.z - n.z) < 1.2, "among them");
    for (const it of c.items) assert.ok(it.n >= 1 && it.n <= STACKS[it.id], `${c.kind}: ${it.n} ${it.id}`);
  }
  let x = 0.3;
  const r = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  assert.equal(cacheItems("lunchbox", 1, r)[0].n, 1);
  assert.equal(cacheItems("lunchbox", 4, r)[0].n, 2);
  assert.equal(cacheItems("briefcase", 1, r)[0].id, "r38");
});

test("the day: 7:30 to 17:30", () => {
  assert.equal(isDay(7), false);
  assert.equal(isDay(7.5), true);
  assert.equal(isDay(12), true);
  assert.equal(isDay(17.5), false);
  assert.equal(isDay(23), false);
});

test("a killed one back 10 minutes after it fell — not while anyone's within 40 tiles", () => {
  const alive = [true, false, false];
  const deadAt = [0, 1000, 5000];
  assert.equal(revive(alive, deadAt, 1000 + NESTS.respawnMs - 1, 100), 0);
  assert.equal(revive(alive, deadAt, 1000 + NESTS.respawnMs, 30), 0, "someone near: not yet");
  assert.equal(revive(alive, deadAt, 1000 + NESTS.respawnMs, 50), 1);
  assert.deepEqual(alive, [true, true, false]);
  assert.equal(revive(alive, deadAt, 5000 + NESTS.respawnMs, 50), 1);
  assert.deepEqual(alive, [true, true, true]);
});
