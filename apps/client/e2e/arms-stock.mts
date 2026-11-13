/* biome-ignore-all lint/suspicious/noExplicitAny: reads the bench's window hooks */
// Plan 81's feedback (2026-11-12): is the double-barrel's stock in her? On the arms bench, for each pose: how
// many points through the stock's wood are inside her shirt (the bench's stockIn(): a ray along her chest's
// forward, an odd count of the shirt's own crossings — the body mesh is open under clothes, only the shirt's
// count is trusted), the deepest (cm), which; where the left hand is along the fore-end (m); each wrist short
// of its place and the forearms' clearance of the gun (cm).
//   (GUN=ak47: the AK's — plan 82)
//   GENDERS=feminine,masculine TOP=tee POSES='[{"name":"ready"},{"name":"load","pose":"reload","t":0.18}]' \
//   node --experimental-strip-types e2e/arms-stock.mts
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
for (const g of (process.env.GENDERS ?? "feminine,masculine").split(",")) {
  await page.goto(
    `http://localhost:3100/dev/arms?gun=${process.env.GUN ?? "shotgun"}&view=side&top=${process.env.TOP ?? "tee"}&gender=${g}`,
  );
  await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  for (const s of JSON.parse(process.env.POSES ?? "[]")) {
    await page.evaluate(
      (s) =>
        (window as any).__revolver.set({
          pose: "ready",
          pitch: 0,
          move: 0,
          draw: 1,
          away: false,
          torch: false,
          kick: 0,
          trigger: 0,
          act: "",
          actT: 0,
          ...s,
        }),
      s,
    );
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const R = (window as any).__revolver;
      const c = R.check();
      const st = R.stockIn();
      const tee = st.pts.filter((x: string) => x.startsWith("-tee"));
      const td = Math.max(0, ...tee.map((x: string) => Number(x.split(" d")[1])));
      return {
        pts: tee,
        x: +R.person.lgForeX.toFixed(3),
        tee: tee.length,
        teeDeep: td,
        butt: tee.filter((x: string) => x.includes("x-0.40") || x.includes("x-0.37")).length,
        L: +(c.L.short * 100).toFixed(1),
        R: +(c.R.short * 100).toFixed(1),
        arms: +(c.arms * 100).toFixed(1),
      };
    });
    console.log(g.padEnd(10), (s.name ?? "").padEnd(10), JSON.stringify(r));
  }
}
await browser.close();
