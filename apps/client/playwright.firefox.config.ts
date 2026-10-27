import { defineConfig, devices } from "@playwright/test";

// The same e2e in Firefox (docs/plan/46-the-karts.md, phase 7: the karts in Firefox), against
// the running local stack. Only the specs that ask for it run here:
//   YUTOPIA_FIREFOX=1 npx playwright test -c playwright.firefox.config.ts kart-play
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100",
    ...devices["Desktop Firefox"],
    viewport: { width: 1280, height: 800 },
    launchOptions: { firefoxUserPrefs: { "media.autoplay.default": 0, "webgl.force-enabled": true } },
  },
});
