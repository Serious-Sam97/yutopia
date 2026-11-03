// Phase 0 of docs/plan/67-the-furniture.md: the bench's stills (/dev/furniture on the dev stack,
// the machine's GPU), each hero's row and its columns close, Lambert and cel, day and night.
//   node --experimental-strip-types e2e/furniture-shots.mts [out dir]
//   HEROES=chair,desk  LOOKS=toon  CLOSE=0 (no close-ups)  NIGHT=0
//   THUMBS=1: only the catalog pictures (thumbs/), each tier on nothing
//   DESKTOP=1: phase 4's desk scenes, hosts and things (<out>/desktop/)
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
if (process.env.DESKTOP === "1") {
  // phase 4: a dressed desk (today's, the new) with someone typing at each; the radio, the coffee
  // machine and the turntable on their tables; each desk thing on its own — into <out>/desktop/
  const { mkdirSync } = await import("node:fs");
  mkdirSync(`${out}/desktop/things`, { recursive: true });
  const shots: [string, string][] = [
    ["scene=desk&look=toon", "desk-row"],
    ["scene=desk&look=toon&night=1", "desk-row-night"],
    ["scene=desk&look=toon&col=0&labels=0&turn=-0.25", "desk-today"],
    ["scene=desk&look=toon&col=1&labels=0&turn=-0.25", "desk-new"],
    ["scene=desk&look=toon&col=1&labels=0&turn=-1.1", "desk-side"],
    ["scene=desk&look=toon&col=1&labels=0&turn=1.25&sitters=1", "desk-typing"],
    ["scene=hosts&look=toon", "hosts-row"],
    ["scene=hosts&look=toon&night=1", "hosts-row-night"],
  ];
  for (const [i, t] of ["radio", "coffee", "turntable"].entries())
    for (const c of [2 * i, 2 * i + 1])
      shots.push([`scene=hosts&look=toon&col=${c}&labels=0&turn=0.45`, `${t}-${c % 2 ? "new" : "today"}`]);
  for (const [q, name] of shots) await shot(q, `desktop/${name}`);
  const S = 320;
  const tp = await browser.newPage({ viewport: { width: S, height: S } });
  const things: [string, string][] = [
    ...[
      "keyboard",
      "desklamp",
      "phone",
      "mug",
      "papers",
      "book",
      "binder",
      "tapes",
      "vinyl",
      "photo",
      "succulent",
      "cards",
      "bell",
      "monitor",
    ].map((d) => [`kind=tabletop&d=${d}`, d] as [string, string]),
    ["kind=computer", "computer"],
    ["kind=computer&variant=1", "computer-graphite"],
    ["kind=radio", "radio"],
    ["kind=turntable", "turntable"],
    ["kind=coffee_machine", "coffee_machine"],
  ];
  for (const [q, name] of things) {
    // (what faces whoever sits at the desk is seen from their side)
    const sitter = /computer|monitor|keyboard|phone|photo|desklamp/.test(name);
    await tp.goto(`${base}/dev/furniture?thumb=2&${q}&look=toon&size=${S}&turn=${sitter ? 3.6 : 0.5}`);
    await tp.waitForFunction(() => (window as unknown as { __shot?: boolean }).__shot === true, null, {
      timeout: 120_000,
    });
    await tp.screenshot({ path: `${out}/desktop/things/${name}.png`, omitBackground: true });
    console.log(name);
  }
  await browser.close();
  process.exit(0);
}
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
    crt_tv: 2,
    tv_console: 2,
    tv_portable: 2,
    projector: 1,
    tv_wall: 2,
    tv_hd: 1,
    tv_giant: 1,
    projector_screen: 1,
    cinema_screen: 2,
    console_2600: 1,
    console_nes: 2,
    console_snes: 1,
    console_md: 1,
    console_gb: 1,
    console_ps1: 1,
    console_ps1_slim: 2,
    piano: 2,
    pingpong_table: 3,
    server_rack: 3,
    lamp: 3,
    vending: 2,
    notice_board: 3,
    neon: 3,
    plant: 5,
    partition: 3,
    column: 2,
    rug: 3,
    pet_bed: 2,
    pet_house: 2,
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
