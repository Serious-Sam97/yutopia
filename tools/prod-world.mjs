// Play in another server's world here (docs/plan/38-the-lag.md, round 4): an offline
// world-server on :2667 loaded from a saved world (the API's /internal/world, e.g. prod's),
// and a Chromium window whose session is pointed at it — the dev world isn't touched.
//
//   node tools/prod-world.mjs ~/Downloads/yutopia-world.json.gz [uid] [name]
//
// Needs the dev stack up (the API on :8100, the client on :3100: the page and the login
// come from them). You're signed in as Ana (the dev demo login); in that world you are
// `uid` (default 1, Sam: the Serious Office's owner) with builder rights. Close the window
// (or Ctrl+C) to stop both.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const [file, uid = "1", name = "Sam"] = process.argv.slice(2);
if (!file) {
  console.error("usage: node tools/prod-world.mjs <world.json[.gz]> [uid] [name]");
  process.exit(1);
}
const API = process.env.YUTOPIA_API ?? "http://localhost:8100";
const APP = process.env.YUTOPIA_APP ?? "http://localhost:3100";
const PORT = Number(process.env.PORT ?? 2667);

// the world, unzipped where the server can read it
const raw = readFileSync(file);
const json = file.endsWith(".gz") ? gunzipSync(raw) : raw;
const dir = mkdtempSync(path.join(tmpdir(), "yutopia-world-"));
const worldFile = path.join(dir, "world.json");
writeFileSync(worldFile, json);
const objects = JSON.parse(json.toString()).objects?.length ?? 0;
console.log(`[prod-world] ${objects} objects → an offline world-server on :${PORT}`);

const server = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: path.join(root, "apps/world-server"),
  env: {
    ...process.env,
    PORT: String(PORT),
    YUTOPIA_OFFLINE: "1",
    YUTOPIA_WORLD_SECRET: "x",
    YUTOPIA_INTERNAL_SECRET: "x",
    YUTOPIA_WORLD_FILE: worldFile,
  },
  stdio: ["ignore", "inherit", "inherit"],
  // (its own process group: npx starts tsx, which starts node — all of them go with it)
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // (gone already)
  }
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
await new Promise((r) => setTimeout(r, 4000));

const require = createRequire(path.join(root, "apps/client/package.json"));
const { chromium } = require("@playwright/test");
const login = await fetch(`${API}/api/login`, {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify({ email: "ana@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" }),
});
const { token } = await login.json();
const browser = await chromium.launch({
  headless: process.env.HEADLESS === "1", // (a check without a window)
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--start-maximized"],
});
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
// the session the page asks for, pointed at this world (as `uid`, a builder)
await page.route("**/api/session", async (route) => {
  const res = await route.fetch();
  const j = await res.json();
  j.worldUrl = `ws://localhost:${PORT}`;
  j.worldToken = `dev:${uid}:${name}:member,builder`;
  await route.fulfill({ response: res, json: j });
});
await page.addInitScript((t) => localStorage.setItem("yutopia:token", t), token);
await page.goto(`${APP}/`);
console.log(`[prod-world] open — you're ${name} (uid ${uid}); close the window to stop`);
if (process.env.HEADLESS === "1") {
  await page.waitForFunction(() => window.__hud?.get().phase === "ready", null, { timeout: 120000 });
  const at = await page.evaluate(() => ({
    level: window.__yutopia.level,
    at: window.__yutopia.meTile(),
    objects: window.__yutopia.room.state.objects.size,
  }));
  console.log("[prod-world] check:", JSON.stringify(at));
  await browser.close();
  stop();
}
browser.on("disconnected", stop);
page.on("close", () => browser.close());
