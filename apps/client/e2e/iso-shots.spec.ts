/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { ANA, enter, test, token } from "./helpers";

// The look, phase 7 (docs/plan/33-the-look.md): review shots of the iso view at the Grounds'
// places the 3D view was refined at (opt-in: YUTOPIA_SHOTS=<dir>; YUTOPIA_SHOT=<name> for one).
const dir = process.env.YUTOPIA_SHOTS;
if (dir) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const G = (x: number, z: number) => ({ x: x + 60, y: z + 10, level: 0 });
const SPOTS: { name: string; at: [number, number] }[] = [
  { name: "main-street", at: [372, -406] },
  { name: "town-hall", at: [391, -400] },
  { name: "hotel", at: [442, -405] },
  { name: "square", at: [420, -394] },
  { name: "townhouses", at: [420, -470] },
  { name: "main-north", at: [455, -404] },
  { name: "church", at: [420, -527] },
  { name: "gas", at: [316, -402] },
  { name: "tower", at: [-28, -88] },
  { name: "road-bridge", at: [262, -398] },
  { name: "footbridge", at: [-256, -236] },
  { name: "road-closed", at: [520, -405] },
  { name: "shed", at: [-150, 126] },
  { name: "farm", at: [436, -300] },
];

test("the look: review shots in iso", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso" }));
  });
  await enter(page, await token(ANA));
  await page.waitForTimeout(4000);
  // (zoomed out: whole buildings in the frame)
  await page.mouse.move(800, 450);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(80);
  }
  const only = process.env.YUTOPIA_SHOT;
  for (const s of SPOTS) {
    if (only && !s.name.includes(only)) continue;
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), G(...s.at));
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${dir}/${s.name}.png` });
  }
});
