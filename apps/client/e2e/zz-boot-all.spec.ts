/* biome-ignore-all lint/suspicious/noExplicitAny: review */
import { test } from "@playwright/test";
import { BUILTIN_GAMES } from "@yutopia/shared/library";
const DIR = process.env.YUTOPIA_SHOTS as string;
for (const g of BUILTIN_GAMES)
  test(`boot ${g.id}`, async ({ page }) => {
    test.setTimeout(60_000);
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    const t0 = Date.now();
    await page.goto(`/dev/emu?system=${g.system}&rom=${g.file}`);
    await page.getByRole("button", { name: "Start from URL" }).click();
    await page.waitForFunction(() => /running|failed/.test(document.querySelector("[data-testid=status]")?.textContent ?? ""), null, { timeout: 30000 });
    const boot = Date.now() - t0;
    await page.waitForTimeout(4000);
    // press start a couple of times (title screens)
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => (window as any).__emuDev.emu?.press(1, "start", true));
      await page.waitForTimeout(150);
      await page.evaluate(() => (window as any).__emuDev.emu?.press(1, "start", false));
      await page.waitForTimeout(1200);
    }
    const info = await page.evaluate(() => {
      const v = document.querySelector("video") as HTMLVideoElement;
      const c = document.createElement("canvas"); c.width = 64; c.height = 48;
      const x = c.getContext("2d")!; x.drawImage(v, 0, 0, 64, 48);
      const d = x.getImageData(0, 0, 64, 48).data;
      const seen = new Set<string>();
      for (let i = 0; i < d.length; i += 16) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      return { colours: seen.size, status: document.querySelector("[data-testid=status]")?.textContent };
    });
    console.log(`BOOT ${g.id.padEnd(16)} ${g.system.padEnd(5)} ${String(boot).padStart(5)}ms colours=${info.colours} ${info.status} ${errs.slice(0, 1).join("")}`);
    await page.locator("video").screenshot({ path: `${DIR}/boot-${g.id.replace(":", "-")}.png` });
  });
