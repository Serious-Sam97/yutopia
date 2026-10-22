// Phase 0 of docs/plan/32-the-arms.md: the guns' stills from /dev/guns, saved as
// PNGs (the dev client on :3100, the machine's GPU).
//   node --experimental-strip-types e2e/guns-shots.mts [out dir] [shot …]
// a shot: a /dev/guns one by name, or name=/dev/3p?… (the demo with a gun in the hands; a few
// seconds for its people to load)
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/arms";
const shots = process.argv.slice(3);
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text()));
page.on("pageerror", (e) => console.log("  error:", e.message));
for (const name of shots.length ? shots : ["sheet", "snow", "ads-revolver", "ads-shotgun", "hip-revolver"]) {
  const [file, path] = name.includes("=") ? name.split(/=(.*)/s) : [name, ""];
  if (path) {
    await page.goto(`${base}${path}`);
    await page.waitForTimeout(9000);
  } else {
    await page.goto(`${base}/dev/guns?shot=${name}`);
    await page.waitForFunction(() => (window as unknown as { __gunsReady?: boolean }).__gunsReady === true, null, {
      timeout: 120_000,
    });
  }
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${file}.png` });
  console.log(`${file}: ${out}/${file}.png`);
}
await browser.close();
