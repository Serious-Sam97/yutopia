// Phase 0 of docs/plan/67-the-furniture.md: the bench's stills (/dev/furniture on the dev stack,
// the machine's GPU), each hero's row and its columns close, Lambert and cel, day and night.
//   node --experimental-strip-types e2e/furniture-shots.mts [out dir]
//   HEROES=chair,desk  LOOKS=toon  CLOSE=0 (no close-ups)  NIGHT=0
//   THUMBS=1: only the catalog pictures (thumbs/), each tier on nothing
//   FAMILY=seating [KINDS=chair,sofa] [ROWS_ONLY=1]: a family look by look (<out>/<family>/)
//   SHADE=1: the rich pieces close in each shading (shade/), day and night
//   PANEL=1: only the Furnish panel's mock (mock/panel.html → panel-mock.png)
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/furniture";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const heroes = (process.env.HEROES ?? "chair,desk,sofa,plant").split(",");
const looks = (process.env.LOOKS ?? "lambert,toon").split(",");
const W = 1600;
const H = Number(process.env.H ?? 760);

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 300)));
const shot = async (q: string, name: string) => {
  await page.goto(`${base}/dev/furniture?${q}&w=${W}&h=${H}`);
  await page.waitForFunction(() => (window as unknown as { __shot?: boolean }).__shot === true, null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(600);
  const f = `${out}/${name}.png`;
  await page.screenshot({ path: f });
  console.log(f);
};
if (process.env.FAMILY) {
  // a family's kinds, look by look (phase 2 on), in the chosen cel: the row, its story details, at
  // night, and each look close — into <out>/<family>/
  const kinds = (process.env.KINDS ?? "chair,armchair,sofa,beanbag,bench").split(",");
  const dir = `${out}/${process.env.FAMILY}`;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const n: Record<string, number> = {
    chair: 4,
    armchair: 2,
    sofa: 3,
    beanbag: 1,
    bench: 1,
    desk: 4,
    meeting_table: 1,
    coffee_table: 1,
    side_table: 1,
    reception: 1,
    counter: 2,
    cupboard: 1,
    bookcase: 3,
    tape_shelf: 3,
    locker: 1,
    cart_shelf: 1,
    disc_rack: 2,
  };
  for (const k of kinds) {
    await shot(`kind=${k}&look=toon`, `${process.env.FAMILY}/${k}`);
    if (process.env.ROWS_ONLY !== "1") {
      await shot(`kind=${k}&look=toon&story=1`, `${process.env.FAMILY}/${k}-story`);
      await shot(`kind=${k}&look=toon&night=1`, `${process.env.FAMILY}/${k}-night`);
      for (let c = 0; c <= (n[k] ?? 1); c++)
        await shot(`kind=${k}&look=toon&col=${c}&turn=0.55&labels=0`, `${process.env.FAMILY}/${k}-col${c}`);
      // (a desk: whoever sits at it typing, from the side — today's and the first new one)
      if (k === "desk")
        for (const c of [0, 1])
          await shot(
            `kind=desk&look=toon&col=${c}&turn=1.25&labels=0&sitters=1`,
            `${process.env.FAMILY}/desk-typing${c}`,
          );
    }
  }
  await browser.close();
  process.exit(0);
}
if (process.env.SHADE === "1") {
  // the shading side by side: each rich piece close, turned to show its shadow side, in every look
  for (const h of heroes)
    for (const look of ["lambert", "toon", "toon2"])
      for (const night of [false, true])
        await shot(
          `hero=${h}&look=${look}&col=3&turn=0.8&labels=0${night ? "&night=1" : ""}`,
          `shade/${h}-${look}${night ? "-night" : ""}`,
        );
  await browser.close();
  process.exit(0);
}
if (process.env.PANEL === "1") {
  // the Furnish panel's mock (design/furniture/mock/panel.html, over the thumbs and a still)
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${base}/dev/furniture?hero=chair&labels=0&turn=0.5&w=1600&h=900`);
  await page.waitForFunction(() => (window as unknown as { __shot?: boolean }).__shot === true, null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/mock/room.png` });
  const pp = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await pp.goto(new URL(`${out}/mock/panel.html`, `file://${process.cwd()}/`).href);
  await pp.waitForLoadState("networkidle");
  await pp.waitForTimeout(800);
  await pp.screenshot({ path: `${out}/panel-mock.png` });
  console.log(`${out}/panel-mock.png`);
  await browser.close();
  process.exit(0);
}
if (process.env.THUMBS === "1") {
  // the catalog's pictures (the panel's mock): each hero's tiers on nothing
  const S = 320;
  const tp = await browser.newPage({ viewport: { width: S, height: S } });
  for (const h of heroes)
    for (const look of looks)
      for (const t of [0, 1, 2]) {
        await tp.goto(`${base}/dev/furniture?hero=${h}&thumb=${t}&look=${look}&size=${S}`);
        await tp.waitForFunction(() => (window as unknown as { __shot?: boolean }).__shot === true, null, {
          timeout: 120_000,
        });
        const f = `${out}/thumbs/${h}-${t}-${look}.png`;
        await tp.screenshot({ path: f, omitBackground: true });
        console.log(f);
      }
  await browser.close();
  process.exit(0);
}
for (const h of heroes)
  for (const look of looks) {
    await shot(`hero=${h}&look=${look}`, `${h}-${look}`);
    if (process.env.NIGHT !== "0") await shot(`hero=${h}&look=${look}&night=1`, `${h}-${look}-night`);
    if (process.env.CLOSE !== "0")
      for (const c of [0, 2, 3]) await shot(`hero=${h}&look=${look}&col=${c}`, `${h}-${look}-col${c}`);
  }
await browser.close();
