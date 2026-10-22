/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { ANA, enter, test, token } from "./helpers";

// The look (docs/plan/33-the-look.md): review shots of the game itself — not the
// /dev/grounds stills, which light their own way — at the Grounds' spots and
// indoors, by day and at dusk (opt-in: YUTOPIA_SHOTS=<dir>; YUTOPIA_SHOT=<name>
// for one). Ana, the camera set by hand, the machine's GPU.
const dir = process.env.YUTOPIA_SHOTS;
if (dir) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

// the Grounds' coords → the ground floor's (its corner at -60, -10)
const G = (x: number, z: number) => ({ x: x + 60, y: z + 10, level: 0 });
interface Spot {
  name: string;
  at: { x: number; y: number; level?: number };
  look: { x: number; y: number };
  hour: number;
  pitch: number;
  dist: number;
}
const S = (name: string, at: [number, number], look: [number, number], hour = 13, pitch = 0.18, dist = 7): Spot => ({
  name,
  at: G(...at),
  look: G(...look),
  hour,
  pitch,
  dist,
});
const SPOTS: Spot[] = [
  S("lot", [-30, 18], [20, 14], 13, 0.25, 8),
  S("courtyard", [55.5, 40], [53.5, 8], 13, 0.12, 7),
  S("driveway", [-62, -222], [-58, -262], 13, 0.14, 7),
  S("main-street", [372, -406.5], [440, -402], 13, 0.12, 7),
  S("main-street-dusk", [372, -406.5], [440, -402], 17.6, 0.12, 7),
  S("farm", [420, -300], [452, -311], 13, 0.2, 9),
  S("ravine", [-262.6, -204], [-230, -186], 13, 0.16, 7),
  S("lobby", [24, 22], [10, 14], 13, 0.5, 6),
  S("bridge", [62, 34], [62, 10], 13, -0.35, 6),
  S("barn", [432, -311], [440, -311], 13, 0.05, 5),
  S("driveway-night", [-62, -222], [-58, -262], 22, 0.14, 7),
  S("pond-night", [-232, -70], [-252, -96], 22, 0.2, 8),
  S("main-street-night", [372, -406.5], [440, -402], 21, 0.12, 7),
];

test("the look: review shots in the game", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "free", quality: "high" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.evaluate(() => {
    (window as any).__yutopia.updateNight = () => {};
  });
  const only = process.env.YUTOPIA_SHOT;
  for (const s of SPOTS) {
    if (only && !s.name.includes(only)) continue;
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), s.at);
    if (s.at.level !== undefined)
      await page.waitForFunction((l) => (window as any).__yutopia.level === l, s.at.level, { timeout: 20_000 });
    await page.waitForTimeout(3500);
    await page.evaluate((p) => {
      const t = (window as any).__yutopia.tp;
      t.setHour(p.hour);
      t.yaw = Math.atan2(p.look.y - p.at.y, p.look.x - p.at.x);
      t.pitch = p.pitch;
      t.dist = p.dist;
    }, s);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${dir}/${s.name}.png` });
  }
});
