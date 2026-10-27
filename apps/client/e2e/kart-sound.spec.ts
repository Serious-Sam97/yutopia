import { expect, test } from "@playwright/test";

// The kart's sounds (docs/plan/46-the-karts.md): every scene of /dev/kart-sound rendered offline
// (the engine through a lap, every item, the lights and the flag, someone going by): something
// to hear in each, nothing NaN, nothing clipping.

test("the kart's sounds render: audible, finite, under full scale", async ({ page }) => {
  await page.goto("/dev/kart-sound");
  await page.waitForFunction(() => !!(window as unknown as { __kartSound?: unknown }).__kartSound, null, {
    timeout: 120_000,
  });
  type Board = { scenes: string[]; level(n: string): Promise<{ peak: number; rms: number; nan: boolean }> };
  const scenes = await page.evaluate(() => (window as unknown as { __kartSound: Board }).__kartSound.scenes);
  expect(scenes.length).toBeGreaterThanOrEqual(4);
  for (const n of scenes) {
    const l = await page.evaluate((n) => (window as unknown as { __kartSound: Board }).__kartSound.level(n), n);
    console.log(
      `[kart-sound] ${n}: peak ${(20 * Math.log10(l.peak)).toFixed(1)} dB, rms ${(20 * Math.log10(l.rms)).toFixed(1)} dB`,
    );
    expect(l.nan, n).toBe(false);
    expect(l.peak, `${n} peak`).toBeLessThan(0.7);
    expect(l.rms, `${n} rms`).toBeGreaterThan(0.003);
  }
});
