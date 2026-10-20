import assert from "node:assert/strict";
import { test } from "node:test";
import { spHour } from "./clock.ts";

test("spHour: São Paulo's hour, UTC−3 all year", () => {
  assert.equal(spHour(Date.UTC(2026, 9, 20, 3, 0)), 0);
  assert.equal(spHour(Date.UTC(2026, 9, 20, 15, 30)), 12.5);
  assert.equal(spHour(Date.UTC(2026, 0, 1, 1, 45)), 22.75); // the day before, there
  assert.equal(spHour(0), 21); // 1970: the offset reaches back before the epoch
  assert.equal(spHour(Date.UTC(1969, 11, 31, 2)), 23); // and before it (negative ms)
  for (let ms = 0; ms < 3 * 86_400_000; ms += 3_600_000 / 7) {
    const h = spHour(ms);
    assert.ok(h >= 0 && h < 24, `${ms}: ${h}`);
  }
});

test("spHour agrees with Intl's America/Sao_Paulo (summer and winter)", () => {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let d = 0; d < 365; d += 5) {
    const ms = Date.UTC(2026, 0, 1) + d * 86_400_000 + d * 977_777;
    const [hh, mm] = fmt.format(ms).split(":").map(Number);
    assert.equal(Math.floor(spHour(ms) * 60 + 1e-6), hh * 60 + mm, new Date(ms).toISOString());
  }
});
