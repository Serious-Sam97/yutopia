// Stills of /dev/anim with the sway on (docs/plan/61): a clip played, a shot every `every` s.
//   node --experimental-strip-types e2e/sway-look.mts <dir> "start, jog, stop" 0.5 6 [query]
import { chromium } from "@playwright/test";

const [dir, clip, every, n, query = "view=three-quarter"] = process.argv.slice(2);
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
p.on("console", (m) => (m.type() === "error" || m.type() === "warning" ? console.log("  console:", m.text()) : 0));
await p.goto(`http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&live=1&sway=1&trail=0&${query}`);
await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
  timeout: 120_000,
});
await p.waitForTimeout(1500);
for (let i = 0; i < Number(n); i++) {
  await p.waitForTimeout(Number(every) * 1000);
  await p.screenshot({ path: `${dir}/${String(i).padStart(2, "0")}.png` });
}
await b.close();
