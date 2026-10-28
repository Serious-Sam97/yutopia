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
  S("lot", [-22, 18], [20, 14], 13, 0.25, 8),
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
  S("townhouses", [415, -436], [432, -462], 13, 0.12, 7),
  S("townhouses-w", [425, -440], [410, -470], 13, 0.12, 7),
  S("town-hall", [391, -405], [391, -420], 13, 0.1, 9),
  S("diner", [345, -408], [345, -392], 13, 0.12, 8),
  S("hotel", [442, -403], [442, -418], 13, 0.2, 9),
  S("square", [420, -397], [420, -380], 13, 0.25, 9),
  S("main-east", [455, -402], [500, -408], 13, 0.12, 7),
  S("church", [420, -514], [420, -545], 13, 0.0, 9),
  S("boathouse", [-238, -82], [-255, -103], 13, 0.12, 7),
  S("shed", [-152, 104], [-155, 115], 13, 0.15, 6),
  S("tower", [-10, -30], [-34, -96], 13, -0.18, 8),
  S("road-bridge", [236, -402], [262, -404], 13, 0.1, 8),
  S("footbridge", [-248, -230], [-262, -236], 13, 0.12, 9),
  S("fence", [-44, -352], [-80, -360], 13, 0.12, 6),
  S("statue", [414, -395], [420, -386], 13, -0.12, 9),
  S("road-closed", [512, -405], [528, -405], 13, 0.12, 7),
  S("tower-night", [-10, -30], [-34, -96], 22, -0.18, 8),
  S("gatehouse", [-44, -338], [-32, -363], 13, 0.1, 7),
  S("gas", [302, -405], [317, -390], 13, 0.12, 7),
  S("pond", [-212, -44], [-250, -78], 13, 0.15, 8),
  S("road-junction", [420, -404], [420, -420], 13, 1.25, 26),
  S("road-kerb", [400, -409.2], [380, -409.2], 13, 0.35, 3.5),
  S("road-county", [100, -403], [60, -408], 13, 0.25, 10),
  S("road-county-top", [100, -403], [60, -408], 13, 1.3, 30),
  S("road-driveway-bend", [-20, -150], [-60, -200], 13, 0.9, 30),
  S("bug-gate", [-40, -364], [-40, -380], 13, 1.25, 22),
  S("bug-gate-late", [-40, -364], [-40, -380], 16.5, 1.25, 22),
  S("bug-lot", [-40.6, -16], [-40.6, 4], 13, 0.9, 20),
  S("bug-town-edge", [300, -405], [280, -405], 13, 1.25, 26),
  S("bug-town-kerb", [304, -410], [304, -398], 13, 0.6, 9),
  S("bug-bridge", [252, -404], [262, -404], 13, 1.25, 22),
  S("shrubs", [-189, -40], [-194, -34], 13, 0.32, 5),
  S("pond-trail", [-188, -34], [-200, -20], 13, 0.14, 6),
  S("woods", [-188, -34], [-200, -20], 13, 0.45, 11),
  S("ravine-rocks", [-258, -214], [-266, -234], 13, 0.3, 9),
  S("woods-edge", [-30, -60], [-200, -120], 13, 0.02, 7),
];

test("the look: review shots in the game", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "free", quality: "high" }));
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
    // (the land round you is built nearest first, a step a frame: its full detail takes a while
    // after a long jump)
    await page.waitForTimeout(8000);
    await page.evaluate(
      (p) => {
        const t = (window as any).__yutopia.tp;
        t.setHour(p.hour);
        t.yaw = Math.atan2(p.look.y - p.at.y, p.look.x - p.at.x);
        t.pitch = p.pitch;
        t.dist = p.dist;
        // (the roads' snow: as it is, or after a storm — YUTOPIA_ROAD_SNOW=0..1)
        const rs = (window as any).__roadSnow;
        if (rs && p.roadSnow !== undefined) rs.value = p.roadSnow;
      },
      {
        ...s,
        roadSnow: process.env.YUTOPIA_ROAD_SNOW === undefined ? undefined : Number(process.env.YUTOPIA_ROAD_SNOW),
      },
    );
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${dir}/${s.name}.png` });
  }
});
