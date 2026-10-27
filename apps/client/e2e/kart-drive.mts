// The kart's sandbox driven by a script (docs/plan/46-the-karts.md, phase 1): hold the keys, read
// the frame times and what the kart did, a shot or two. The dev client on :3100, the GPU.
//   node --experimental-strip-types e2e/kart-drive.mts [out dir]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "/tmp";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("  error:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text()));
await page.goto(`${base}/dev/kart${process.env.Q ?? ""}`);
await page.waitForFunction(() => !!(window as unknown as { __kart?: unknown }).__kart, null, { timeout: 120_000 });
await page.waitForTimeout(3000);
const sample = (label: string) =>
  page.evaluate(async (label) => {
    const K = (
      window as unknown as {
        __kart: { k: Record<string, number>; renderer: { info: { render: { triangles: number; calls: number } } } };
      }
    ).__kart;
    const t0 = K.k.t;
    let n = 0;
    let worst = 0;
    const s = performance.now();
    let lt = s;
    await new Promise<void>((r) => {
      const f = () => {
        const now = performance.now();
        worst = Math.max(worst, now - lt);
        lt = now;
        n++;
        if (now - s < 2000) requestAnimationFrame(f);
        else r();
      };
      requestAnimationFrame(f);
    });
    const k = K.k;
    return `${label}: ${(n / 2).toFixed(0)} fps, worst ${worst.toFixed(0)} ms, sim ${((k.t - t0) / 2).toFixed(2)}/s, ${(K.renderer.info.render.triangles / 1e6).toFixed(2)}M tris, ${K.renderer.info.render.calls} calls · v ${Math.hypot(k.vx, k.vz).toFixed(1)} drift ${k.drift} tier ${k.tier} air ${k.air}`;
  }, label);
console.log(await sample("standing"));
await page.keyboard.down("KeyW");
console.log(await sample("go"));
await page.screenshot({ path: `${out}/kart-drive-1.png` });
await page.keyboard.down("KeyD");
await page.keyboard.down("Space");
console.log(await sample("drift right"));
await page.screenshot({ path: `${out}/kart-drive-2.png` });
await page.keyboard.up("Space");
await page.keyboard.up("KeyD");
console.log(await sample("let go"));
await page.screenshot({ path: `${out}/kart-drive-3.png` });
await browser.close();
