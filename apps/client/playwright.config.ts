import { defineConfig, devices } from "@playwright/test";

// e2e against the running local stack (Yutopia's API on :8100 with YUTOPIA_E2E=1,
// world-server :2567, LiveKit :7880, this client on :3100). Uses the demo seed
// accounts, and puts the one world back to a fixture (e2e/worlds) as specs need.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
