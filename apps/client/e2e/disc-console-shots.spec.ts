/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { type Page, test } from "@playwright/test";
import { ANA, enter, spaceId, token } from "./helpers";

// Review shots of the disc console's look (docs/plan/23-disc-console.md P1):
// a disc corner put down in the Lab — a TV, the grey console with its lid open
// (a disc, a memory card, on), the small white one with its screen up and a
// plain one, both disc racks — shot in iso and in 3D, by day and night, then
// taken away. Off by default:
//   YUTOPIA_SHOTS=design/disc-console npx playwright test disc-console-shots
const OUT = process.env.YUTOPIA_SHOTS;
const WORLD = 'canvas[aria-label="Yutopia world"]';
test.skip(!OUT, "set YUTOPIA_SHOTS=<folder> to take the disc console shots");

const stamp = Date.now().toString(36);
const corner = (x: number, y: number) => [
  { id: `dc-tv-${stamp}`, kind: "crt_tv", x, y, rot: 0 },
  {
    id: `dc-grey-${stamp}`,
    kind: "console_ps1",
    x,
    y: y + 2,
    rot: 0,
    props: { lid: "open", cart: 1, cartColor: "#c4402b", card: 1, on: true },
  },
  { id: `dc-lcd-${stamp}`, kind: "console_ps1_slim", x: x + 1, y: y + 2, rot: 0, props: { variant: 1, on: true } },
  { id: `dc-slim-${stamp}`, kind: "console_ps1_slim", x: x + 2, y: y + 1, rot: 0, props: { variant: 0, card: 1 } },
  { id: `dc-rack-${stamp}`, kind: "disc_rack", x: x + 2, y, rot: 0, props: { variant: 0 } },
  { id: `dc-rack2-${stamp}`, kind: "disc_rack", x: x + 3, y, rot: 0, props: { variant: 1 } },
];

// Put the corner down near the arrival point (the server says no to a bad spot).
async function putCorner(page: Page): Promise<{ x: number; y: number }> {
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  for (const [dx, dy] of [
    [-2, -6],
    [1, -6],
    [-6, -5],
    [3, 2],
    [-6, 2],
    [2, -3],
    [-9, -6],
    [5, -6],
    [-9, 2],
    [6, 3],
  ]) {
    const at = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
    // (consoles aren't solid: the server would let one land on another's tile)
    const busy = await page.evaluate(
      (a) =>
        (window as any).__yutopia.engine
          .allObjects()
          .some(
            (o: any) => !o.id.startsWith("dc-") && o.x >= a.x - 1 && o.x <= a.x + 4 && o.y >= a.y - 1 && o.y <= a.y + 3,
          ),
      at,
    );
    if (busy) continue;
    const items = corner(at.x, at.y);
    for (const o of items) await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), o);
    await page.waitForTimeout(800);
    const all = await page.evaluate(
      (ids) => ids.every((i: string) => !!(window as any).__yutopia.room.state.objects.get(i)),
      items.map((o) => o.id),
    );
    if (all) return at;
    await takeAway(page);
  }
  throw new Error("no room for the disc corner");
}
// Take every disc corner away (this run's, and any a failed run left), and
// wait until they're gone (the server deletes them one by one).
async function takeAway(page: Page) {
  const ours = () =>
    page.evaluate(() =>
      [...(window as any).__yutopia.room.state.objects.values()]
        .map((o: any) => o.id as string)
        .filter((id) => id.startsWith("dc-")),
    );
  for (let i = 0; i < 40; i++) {
    const left = await ours();
    if (!left.length) return;
    if (i % 10 === 0) await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), left);
    await page.waitForTimeout(500);
  }
  throw new Error(`left behind: ${(await ours()).join(", ")}`);
}

test("disc console shots: iso and 3D, day and night", async ({ browser }) => {
  test.setTimeout(240_000);
  const dir = resolve(__dirname, "../../..", OUT ?? ".");
  mkdirSync(dir, { recursive: true });
  const tok = await token(ANA);
  const space = await spaceId(tok, "Yutopia Lab");
  const open = async (view: "iso" | "1p") => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((v) => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, quality: "high", view: v }));
    }, view);
    await enter(page, tok, space);
    return page;
  };

  const iso = await open("iso");
  let live = iso;
  const at = await putCorner(iso);
  try {
    await iso.addStyleTag({ content: `*{visibility:hidden!important}${WORLD}{visibility:visible!important}` });
    await iso.evaluate(() => {
      (window as any).__yutopia.updateNight = () => {};
    });
    await iso.waitForTimeout(1500);
    for (const [when, level] of [
      ["day", 0],
      ["night", 0.85],
    ] as const)
      for (const [name, zoom] of [
        ["iso-corner", 2.2],
        ["iso-close", 4],
      ] as const) {
        await iso.evaluate(
          ([p, night, z]) => {
            const e = (window as any).__yutopia.engine;
            e.setNight(night);
            e.pinCamera({ x: p.x + 2, y: p.y + 2.2, z: 10, zoom: z });
          },
          [at, level, zoom] as const,
        );
        await iso.waitForTimeout(600);
        await iso.locator(WORLD).screenshot({ path: `${dir}/${name}-${when}.png` });
      }

    // 3D: from the sofa side, then close over the consoles, from both sides
    // (the same person again: this page takes over Ana's session, so the
    // corner is taken away from here)
    live = await open("1p");
    const tp = live;
    await tp.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    // (the 3D view draws on its own canvas, over the iso one: shoot the page, the HUD hidden)
    await tp.addStyleTag({ content: "[data-hud], .hud, nav, aside { visibility: hidden !important }" });
    await tp.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1.5, y: p.y + 4.5 }), at);
    await tp.waitForTimeout(2500);
    // first person (nobody in the way): where Ana stands, where she looks
    const VIEWS = [
      { name: "3d-corner", x: 1.6, y: 5.6, yaw: -Math.PI / 2, pitch: 0.35 },
      { name: "3d-consoles", x: 1.1, y: 3.7, yaw: -Math.PI / 2 - 0.15, pitch: 0.8 },
      { name: "3d-consoles-side", x: -0.7, y: 2.6, yaw: 0.1, pitch: 0.7 },
      { name: "3d-racks", x: 3.2, y: 2.3, yaw: -Math.PI / 2, pitch: 0.2 },
    ];
    for (const [when, level] of [
      ["day", 0],
      ["night", 0.85],
    ] as const)
      for (const v of VIEWS) {
        await tp.evaluate(
          ([p, view, night]) => {
            const y = (window as any).__yutopia;
            y.updateNight = () => {};
            y.tp.setHour(night ? 22 : 12); // (3D takes its light from the hour)
            y.teleport({ x: p.x + view.x, y: p.y + view.y });
            y.tp.yaw = view.yaw;
            y.tp.pitch = view.pitch;
          },
          [at, v, level] as const,
        );
        await tp.waitForTimeout(1800);
        await tp.screenshot({ path: `${dir}/${v.name}-${when}.png` });
      }
  } finally {
    await takeAway(live);
    await live.context().close();
    if (live !== iso) await iso.context().close();
  }
});
