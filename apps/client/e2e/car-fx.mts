// The car's damage and effects driven by a script (docs/plan/92-the-cars.md, phase 9): a drift's tyre smoke on
// the runway, a wall struck at night (sparks, the dents, the bumper, steam), the damaged car on the sheet;
// frame times with and without them. The dev client on :3100, the GPU.
//   node --experimental-strip-types e2e/car-fx.mts [out dir]
import { chromium, type Page } from "@playwright/test";

const out = process.argv[2] ?? "/tmp";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("  error:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text()));

type Car = {
  car: { v: { x: number; z: number }; p: { x: number; y: number; z: number }; wheels: { slip: number }[] };
  renderer: { info: { render: { triangles: number; calls: number } } };
  place(x: number, z: number, a: number): void;
};
const sample = (p: Page, label: string, ms = 1500) =>
  p.evaluate(
    async ([label, ms]) => {
      const C = (window as unknown as { __car: Car }).__car;
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
          if (now - s < (ms as number)) requestAnimationFrame(f);
          else r();
        };
        requestAnimationFrame(f);
      });
      const c = C.car;
      const slip = Math.max(...c.wheels.map((w) => w.slip));
      return `${label}: ${((n * 1000) / (ms as number)).toFixed(0)} fps, worst ${worst.toFixed(0)} ms, ${C.renderer.info.render.calls} calls · v ${Math.hypot(c.v.x, c.v.z).toFixed(1)} m/s, slip ${slip.toFixed(1)}`;
    },
    [label, ms] as const,
  );

await page.goto(`${base}/dev/car?v=saloon-base`);
await page.waitForFunction(() => !!(window as unknown as { __car?: unknown }).__car, null, { timeout: 120_000 });
await page.waitForTimeout(4000);
const place = (x: number, z: number, a: number) =>
  page.evaluate(([x, z, a]) => (window as unknown as { __car: Car }).__car.place(x, z, a), [x, z, a] as const);

// ── a drift on the runway's asphalt, by day ──
await place(0, -150, Math.PI / 2);
await page.waitForTimeout(800);
console.log(await sample(page, "standing"));
await page.keyboard.down("KeyW");
console.log(await sample(page, "go", 2500));
await page.keyboard.down("KeyA");
await page.keyboard.down("Space");
await page.waitForTimeout(450);
await page.keyboard.up("Space");
console.log(await sample(page, "drift (smoke)", 700));
await page.screenshot({ path: `${out}/fx-drift.png` });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/fx-drift-2.png` });
await page.keyboard.up("KeyA");
await page.keyboard.up("KeyW");
await page.waitForTimeout(1500);

// ── a burnout: the brake and the throttle at once, standing ──
await place(0, -60, Math.PI / 2);
await page.waitForTimeout(800);
await page.keyboard.down("KeyW");
await page.keyboard.down("Space");
console.log(await sample(page, "burnout (handbrake held)", 2000));
await page.screenshot({ path: `${out}/fx-burnout.png` });
await page.keyboard.up("Space");
await page.keyboard.up("KeyW");

// ── night: along the posts beside the runway (sparks down its right side), then one square on (its front:
// dents, the bumper, a lamp, steam) ──
await page.keyboard.press("KeyN");
await page.waitForTimeout(500);
const z = () => page.evaluate(() => (window as unknown as { __car: Car }).__car.car.p.z);
await place(23.2, -212, Math.PI / 2);
await page.waitForTimeout(800);
await page.keyboard.down("KeyW");
for (let i = 0; i < 60 && (await z()) < -190; i++) await page.waitForTimeout(100);
for (let i = 0; i < 5; i++) {
  await page.screenshot({ path: `${out}/fx-sparks-${i}.png` });
  await page.waitForTimeout(150);
}
console.log(await sample(page, "along the posts (sparks)", 1000));
await page.keyboard.up("KeyW");
const dmgNow = () =>
  page.evaluate(() => {
    const m = (window as unknown as { __car: { model: unknown } }).__car.model as { dmg?: number[]; partBits?: number };
    return JSON.stringify({ zones: m.dmg?.map((x) => +x.toFixed(2)), parts: m.partBits });
  });
console.log("  damage after the posts:", await dmgNow());
// (three runs at it, from further back each time: the front gives more each time — a bumper hanging, then
// gone and a lamp out, then steam)
for (const from of [-230, -250, -275]) {
  await place(24, from, Math.PI / 2);
  await page.waitForTimeout(700);
  await page.keyboard.down("KeyW");
  for (let i = 0; i < 300 && (await z()) < -203.2; i++) await page.waitForTimeout(40);
  await page.screenshot({ path: `${out}/fx-crash-${from}.png` });
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(900);
  console.log(`  damage after the run from ${from}:`, await dmgNow());
}
console.log("  damage after the post:", await dmgNow());
console.log(await sample(page, "after the crash (steam)", 1500));
await page.screenshot({ path: `${out}/fx-crash-night.png` });
// (the hood's camera: its bonnet, steam, a lamp out)
await page.keyboard.press("KeyC");
await page.keyboard.press("KeyC");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/fx-crash-hood.png` });

// ── the cockpit of each body: the eye where a driver's is, the wheel turned right (its top to the right) ──
for (const v of (process.env.COCKPITS ?? "saloon-base,hatch-hot,4x4-long,pickup-single,van-minibus,estate-gl").split(
  ",",
)) {
  await page.goto(`${base}/dev/car?v=${v}`);
  await page.waitForFunction(() => !!(window as unknown as { __car?: unknown }).__car, null, { timeout: 120_000 });
  await page.waitForTimeout(3500);
  await page.keyboard.press("KeyC");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/cockpit-${v}.png` });
  await page.keyboard.up("KeyD");
}

// ── the damaged car on the sheet, by day ──
await page.goto(
  `${base}/dev/cars?v=saloon-gl&dent=0.7&broken=bumperHang,headL,mirrorL,sideL,screen&yaw=-2.4&dist=6.2&pitch=0.2`,
);
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/fx-damaged-day.png` });
await page.goto(`${base}/dev/cars?v=hatch-hot&dent=1&broken=bumperGone,headR,screenBad,sideR&yaw=2.4&dist=6&pitch=0.2`);
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/fx-damaged-day-2.png` });
await browser.close();
