// (plan 94 P2) The wreck as built, on /dev/cars: its damage's wreck bits through setWear — the front-left door
// hanging, the rear-left gone, the bonnet sprung, the boot lid off, the rear bumper hanging, the left mirror off;
// then the front-left door and the rear bumper off too. What's shown, and stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-wreck-check.mts [url]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.goto(`${base}/dev/cars`);
await page.waitForFunction(() => !!(window as any).__sheet?.car?.ready, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const snap = async (name: string, yaw: number, pitch: number, dist: number) => {
  const url = await page.evaluate(
    ([y, p, d]) => {
      const S = (window as any).__sheet;
      const c = S.cam;
      // (round the car's middle: yaw 0 its right side, + toward its nose)
      c.position.set(Math.sin(y) * Math.cos(p) * d, 0.8 + Math.sin(p) * d, Math.cos(y) * Math.cos(p) * d);
      c.lookAt(0, 0.7, 0);
      S.renderer.render(S.scene, c);
      return S.renderer.domElement.toDataURL("image/png");
    },
    [yaw, pitch, dist] as const,
  );
  const fs = await import("node:fs");
  fs.writeFileSync(`${out}/${name}`, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", name);
};
await page.evaluate(() => (window as any).__sheet.car.loaded);
await page.waitForTimeout(500);
const state = async (wreck: number, parts: number) =>
  page.evaluate(
    ([w, p]) => {
      const S = (window as any).__sheet;
      const car = S.car;
      S.st.dent = 1;
      S.st.parts = p;
      S.pose();
      car.setWear(0.3, [1, 0.6, 0.8, 0.2, 0.4], p, w);
      for (const d of car.doors) d.open(0);
      const seen: Record<string, boolean> = {};
      for (const n of ["door_fl", "door_rl", "bonnet", "boot", "bumper_r", "mirror_l"]) {
        const pp = car.parts.get(n);
        seen[n] = pp ? pp.outer.visible : (null as any);
      }
      return { seen, rear: !!car.parts.get("bumper_r"), copy: !!car.partCopy("bumper_r") };
    },
    [wreck, parts] as const,
  );
// WRECK: hangFL 1, goneRL 64, bonnetLoose 256, bootLoose 1024, bootGone 2048, bumperRHang 4096, bumperRGone 8192, mirrorLOff 16384
const s1 = await state(1 | 4 | 64 | 256 | 1024 | 2048 | 4096 | 16384, 2 | 1 | 256 | 512);
console.log("step 1", JSON.stringify(s1));
await page.waitForTimeout(600);
await snap("w1-front.png", -0.7, 0.18, 7.5);
await snap("w1-side.png", -1.55, 0.12, 7.5);
await snap("w1-rear.png", 2.4, 0.2, 7.5);
const s2 = await state(1 | 16 | 4 | 64 | 256 | 1024 | 2048 | 4096 | 8192 | 16384, 2 | 1 | 256 | 512);
console.log("step 2", JSON.stringify(s2));
await page.waitForTimeout(600);
await snap("w2-side.png", -1.55, 0.12, 7.5);
await snap("w2-rear.png", 2.4, 0.2, 7.5);
await browser.close();
