import { defineConfig, devices } from "@playwright/test";

// The smoke e2e (docs/plan/72-the-3d-core.md, phase 3): no local stack — the page built
// (`NEXT_DIST_DIR=.next-prod next build`) served by `next start`, an offline world-server of its
// own, the API answered by the spec itself (e2e/ci/api.ts). For CI, and runnable here beside the
// dev stack (its own ports).
//   NEXT_DIST_DIR=.next-prod pnpm --filter @yutopia/client build && pnpm --filter @yutopia/client test:smoke
const PORT = Number(process.env.SMOKE_PORT ?? 3199);
const WORLD = Number(process.env.SMOKE_WORLD_PORT ?? 2681);

export default defineConfig({
  testDir: "./e2e/ci",
  timeout: 240_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      // (tsx itself, not through pnpm: stopping pnpm left the server running on its port)
      command: "./node_modules/.bin/tsx src/index.ts",
      cwd: "../world-server",
      url: `http://localhost:${WORLD}/health`,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      env: {
        PORT: String(WORLD),
        YUTOPIA_OFFLINE: "1",
        YUTOPIA_WORLD_SECRET: "smoke",
        YUTOPIA_INTERNAL_SECRET: "smoke",
        YUTOPIA_WEATHER: "winter",
      },
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: `./node_modules/.bin/next start -p ${PORT}`,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      url: `http://localhost:${PORT}/login`,
      env: { NEXT_DIST_DIR: ".next-prod" },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
