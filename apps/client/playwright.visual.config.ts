import { defineConfig, devices } from "@playwright/test";

// Screenshot regression + budgets against /dev/shots (no backend needed).
// Baselines are per platform: visual/__screenshots__/<name>-<platform>.png.
//   pnpm visual                       (against the dev client on :3100)
//   VISUAL_SERVE=1 pnpm visual        (starts its own dev server on :3101 — CI)
//   pnpm visual --update-snapshots    (accept new baselines)
const serve = process.env.VISUAL_SERVE === "1";
export default defineConfig({
  testDir: "./visual",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{platform}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.08, animations: "disabled" } },
  use: {
    baseURL: process.env.VISUAL_URL ?? (serve ? "http://localhost:3101" : "http://localhost:3100"),
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  webServer: serve
    ? {
        // next directly (a pnpm/npx wrapper doesn't pass the stop signal on,
        // and the server would outlive the run)
        command: "node node_modules/next/dist/bin/next dev -p 3101",
        gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
        url: "http://localhost:3101/dev/shots",
        timeout: 240_000,
        env: { NEXT_DIST_DIR: ".next-visual" },
        reuseExistingServer: false,
      }
    : undefined,
});
