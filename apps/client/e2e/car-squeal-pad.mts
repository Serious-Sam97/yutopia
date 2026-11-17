// (plan 95 phase 3) The tyres' voice on the sandbox's open test pad (/dev/car): no kerbs, no parked cars — taps,
// a pull-away, a launch, a stop, a corner at ~40 and at ~65 km/h, a handbrake turn; each tyre bed's peak and the
// chirps against speed, grip used, slip and the ground. Put back where it started before each.
//   node --experimental-strip-types e2e/car-squeal-pad.mts [url]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.goto(`${base}/dev/car${process.env.Q ?? ""}`);
await page.waitForFunction(() => !!(window as any).__car?.car, null, { timeout: 180_000 });
await page.waitForTimeout(2500);
await page.mouse.click(640, 400);
await page.keyboard.press("KeyH");
await page.waitForFunction(() => !!(window as any).__car?.sound, null, { timeout: 20_000 });
await page.waitForTimeout(1500);
const home = await page.evaluate(() => {
  const c = (window as any).__car.car;
  const X = { x: 1 - 2 * (c.q.y * c.q.y + c.q.z * c.q.z), z: 2 * (c.q.x * c.q.z - c.q.w * c.q.y) };
  return { x: c.p.x, z: c.p.z, a: Math.atan2(X.z, X.x), ground: c.wheels.map((w: any) => w.ground).join(",") };
});
console.log("home", JSON.stringify(home));
await page.evaluate(() => {
  const W = window as any;
  W.__sq = [];
  let chirp = 0;
  const tick = () => {
    const c = W.__car.car;
    const snd = W.__car.sound;
    if (c && snd) {
      const lv = (k: string) => snd.beds?.get(k)?.g.gain.value ?? 0;
      W.__sq.push({
        kmh: Math.hypot(c.v.x, c.v.z) * 3.6,
        used: Math.max(...c.wheels.map((w: any) => w.used ?? 0)),
        slip: Math.max(...c.wheels.map((w: any) => w.slip ?? 0)),
        ground: [...new Set(c.wheels.map((w: any) => w.ground))].join("+"),
        scrub: lv("scrub"),
        held: lv("squeal-loop"),
        skid: lv("skid"),
        squeak: lv("snow-squeak"),
        chirp: snd.chirpAt,
        help: c.helping,
      });
      chirp = snd.chirpAt;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const key = async (k: string, ms: number) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
};
const back = async () => {
  await page.evaluate((h) => (window as any).__car.place(h.x, h.z, h.a), home);
  await page.waitForTimeout(1500);
};
const run = async (name: string, f: () => Promise<void>) => {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  await back();
  const from = await page.evaluate(() => (window as any).__sq.length);
  await f();
  await page.waitForTimeout(500);
  const r = await page.evaluate((f0) => {
    const a = (window as any).__sq.slice(f0);
    const pk = (k: string) => {
      let b: any = null;
      for (const x of a) if (!b || x[k] > b[k]) b = x;
      return b && b[k] > 0.005 ? `${b[k].toFixed(2)} @${b.kmh.toFixed(0)} km/h` : "0";
    };
    return {
      top: Math.max(...a.map((x: any) => x.kmh)).toFixed(0),
      chirps: new Set(a.map((x: any) => x.chirp)).size - 1,
      skid: pk("skid"),
      held: pk("held"),
      scrub: pk("scrub"),
      squeak: pk("squeak"),
      ground: [...new Set(a.map((x: any) => x.ground))].join(","),
    };
  }, from);
  console.log(`${name}: ${JSON.stringify(r)}`);
  // (DUMP=1: its loud frames)
  if (process.env.DUMP)
    console.log(
      (
        await page.evaluate(
          (f0) =>
            (window as any).__sq
              .slice(f0)
              .map((x: any, i: number) => ({ i, ...x }))
              .filter((x: any) => x.skid > 0.03 || x.held > 0.03)
              .map(
                (x: any) =>
                  `    f${x.i} ${x.kmh.toFixed(1)} km/h used ${x.used.toFixed(2)} slip ${x.slip.toFixed(2)} skid ${x.skid.toFixed(2)} held ${x.held.toFixed(2)} help ${x.help}`,
              ),
          from,
        )
      ).join("\n"),
    );
};
await run("tap W 0.3 s ×3", async () => {
  for (let i = 0; i < 3; i++) {
    await key("KeyW", 300);
    await page.waitForTimeout(1200);
  }
});
await run("full lock D, W pulses", async () => {
  await page.keyboard.down("KeyD");
  for (let i = 0; i < 5; i++) {
    await key("KeyW", 250);
    await page.waitForTimeout(550);
  }
  await page.keyboard.up("KeyD");
});
await run("pull away W 2 s", () => key("KeyW", 2000));
await run("stop: W 3.5 s, S till still", async () => {
  await key("KeyW", 3500);
  await key("KeyS", 3000);
});
for (const [secs, label] of [
  [2.8, "~40"],
  [5.5, "~65"],
] as const)
  await run(`corner at ${label} km/h: W ${secs} s, then W + D 1.5 s`, async () => {
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(secs * 1000);
    await key("KeyD", 1500);
    await page.keyboard.up("KeyW");
  });
await run("gentle bend at ~40: W 2.8 s, D 0.25 s", async () => {
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2800);
  await key("KeyD", 250);
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");
});
await run("handbrake turn at ~45: W 3.5 s, D + Space 1.5 s", async () => {
  await key("KeyW", 3500);
  await page.keyboard.down("KeyD");
  await key("Space", 1500);
  await page.keyboard.up("KeyD");
});
await browser.close();
