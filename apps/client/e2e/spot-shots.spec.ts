/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// Phase 0 of docs/plan/43-the-spot.md: the HUD's mocks. The stills (/dev/grounds?shot=…) with the new
// HUD laid over them in the game's own classes (the dev pages share its stylesheet), and the GPS in
// the game itself with "My car" put on it. Saved to design/screens/spot/.
// Needs the stills of the vehicles first (VEH: grounds-shots.mts … veh-<kind>-f), for the dealer's list.
// YUTOPIA_GPU=1 VEH=<dir> npx playwright test spot-shots
if (process.env.YUTOPIA_GPU)
  test.use({
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
  });
test.use({ viewport: { width: 1600, height: 900 } });
const OUT = "../../design/screens/spot";
const VEH = process.env.VEH ?? "";

/** A still drawn, the mock's HTML over it (in the page's own stylesheet), saved. */
async function still(page: Page, shot: string, html: string, name: string) {
  await page.goto(`/dev/grounds?shot=${shot}`);
  await page.waitForFunction(() => (window as any).__shot === true, null, { timeout: 180_000 });
  await page.evaluate((h) => {
    document.querySelector("[data-status]")?.remove();
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:50;font-family:inherit";
    d.innerHTML = h;
    document.body.appendChild(d);
  }, NOTE_CSS + html);
  await page.waitForTimeout(400);
  await hideDev(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
/** The dev server's own badge, out of the picture. */
const hideDev = (page: Page) =>
  page.evaluate(() => {
    for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
  });

// the mocks' notes: numbered paper cards, as the earlier plans' mocks
const NOTE_CSS = `<style>
.mk-note{position:absolute;max-width:270px;padding:9px 12px 10px;border-radius:8px;background:#f3ead6;color:#2a1a12;
  font:500 13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.mk-note b{font-weight:700}
.mk-note .n{display:inline-grid;place-items:center;width:20px;height:20px;margin:0 7px 0 -2px;border-radius:50%;
  background:#b5562f;color:#fff3e0;font:700 11px Inter,system-ui,sans-serif;vertical-align:1px}
.mk-ring{position:absolute;border:2px dashed #ffe9a8;border-radius:10px;box-shadow:0 0 14px rgba(255,233,168,.5)}
</style>`;
const note = (n: number, x: number, y: number, html: string, w = 270) =>
  `<div class="mk-note" style="left:${x}px;top:${y}px;max-width:${w}px"><span class="n">${n}</span>${html}</div>`;
const ring = (x: number, y: number, w: number, h: number) =>
  `<div class="mk-ring" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;

// the board, as the prompt's thumbnail (the item kit draws it in the game)
const BOARD_SVG = `<svg viewBox="0 0 32 32" width="26" height="26"><rect x="14.5" y="10" width="3" height="20" fill="#6e5a44"/>
<rect x="3" y="6" width="26" height="10" rx="1" fill="#c99a62" stroke="#7a5534"/><rect x="3" y="4.6" width="26" height="2" rx="1" fill="#f3f5f7"/>
<path d="M8 11h16" stroke="#3b2414" stroke-width="2.2"/><rect x="12.5" y="19" width="7" height="4" rx="1" fill="#1f3554"/></svg>`;
const KEY_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#e8a33d" stroke-width="2" stroke-linecap="round">
<circle cx="8" cy="8" r="4.5"/><path d="M11.3 11.3 20 20M16.5 16.5l2.5-2.5M14.2 14.2l2-2"/></svg>`;

/** The use prompt, as Overlays.tsx's (bottom middle). */
const prompt = (thumb: string, label: string, hint = "press to use", bottom = 88) => `
<div class="cabinet rounded-full pl-1.5 pr-4 py-1.5 flex items-center gap-2.5" style="position:absolute;left:50%;transform:translateX(-50%);bottom:${bottom}px">
  <span class="w-9 h-9 rounded-full grid place-items-center shrink-0 p-1" style="background:radial-gradient(#4a3324,#241912);border:1px solid var(--edge)">${thumb}</span>
  <kbd class="keycap" style="color:var(--cream);opacity:1;height:20px;min-width:20px;font-size:11px">X</kbd>
  <span class="text-sm">${label}</span>
  <span class="mono text-[11px] whitespace-nowrap" style="color:var(--muted)">· ${hint}</span>
</div>`;
/** A chip over the prompt, as the held thing's. */
const chip = (icon: string, label: string, hint: string) => `
<div class="cabinet rounded-full pl-1.5 pr-4 py-1 flex items-center gap-2.5" style="position:absolute;left:50%;transform:translateX(-50%);bottom:144px">
  <span class="w-8 h-8 rounded-full grid place-items-center shrink-0" style="background:radial-gradient(#4a3324,#241912);border:1px solid var(--edge)">${icon}</span>
  <span class="text-sm">${label}</span>
  <span class="mono text-[11px] whitespace-nowrap" style="color:var(--muted)">· ${hint}</span>
</div>`;

test("the spot's HUD mocks: claiming a bay, the dealer, the keys", async ({ page }) => {
  test.setTimeout(600_000);

  // ── claiming a bay: standing in a free one ──
  await still(
    page,
    "spot-claim",
    prompt(BOARD_SVG, "Claim this bay · <b>D-05</b>") +
      ring(760, 360, 120, 260) +
      note(
        1,
        980,
        300,
        "<b>Stand in a free bay</b>, on foot: the prompt offers it. X, and your board goes up at its head with your name, for everyone. One bay each; never a visitors' or an accessible one.",
      ) +
      note(
        2,
        980,
        470,
        "<b>In your own bay</b> it says <b>Give up this bay</b> instead. Claiming another moves your board; your car stays where it is till you park it there.",
      ) +
      note(
        3,
        60,
        660,
        "A pool car in the bay you claim is towed out the next time no one's looking, and the tow never parks in a claimed bay again.",
        330,
      ),
    "hud-claim",
  );

  // ── the dealer: X at the showroom's door or a car on show ──
  const img = (kind: string) =>
    VEH ? `data:image/png;base64,${readFileSync(`${VEH}/veh-${kind}-f.png`).toString("base64")}` : "";
  const MODELS: [string, string, string][] = [
    ["sedan", "Sedan", "4 seats · rear-wheel drive · the lot's own"],
    ["offroad", "4x4", "4 seats · high, short · deep snow"],
    ["pickup", "Pickup", "3 seats · a bed for the sledges"],
    ["snowmobile", "Snowmobile", "2 seats · off the roads, the pond"],
    ["snowcat", "Snowcat", "4 seats · tracks · goes anywhere"],
    ["tractor", "Tractor", "1 seat · slow, unstoppable"],
    ["ploughtruck", "Plough truck", "2 seats · clears the road · row A only"],
    ["toboggan", "Toboggan", "2 seats · downhill only"],
  ];
  const colours = [0xcbbd98, 0x6b2430, 0x4a5a73, 0xe8e6df, 0x1f2124, 0x6a4a35, 0x8b8f93, 0x2f4a3b, 0xb8702a];
  const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
  const rows = MODELS.map(
    ([k, n, d], i) => `
    <div class="flex items-center gap-3" style="padding:6px 8px;border-radius:9px;${i === 0 ? "background:rgba(232,163,61,.14);box-shadow:inset 0 0 0 1px #e8a33d" : "border:1px solid transparent"}">
      <span style="width:84px;height:48px;border-radius:6px;overflow:hidden;flex:none;border:1px solid var(--edge);background:#000 url(${img(k)}) center/cover"></span>
      <span class="min-w-0"><span class="text-sm" style="display:block">${n}</span><span class="mono text-[11px]" style="color:var(--muted)">${d}</span></span>
    </div>`,
  ).join("");
  const swatches = colours
    .map(
      (c, i) =>
        `<span style="width:30px;height:30px;border-radius:50%;background:${hex(c)};box-shadow:0 0 0 2px #1a120c${i === 1 ? ",0 0 0 4px #e8a33d" : ""};flex:none"></span>`,
    )
    .join("");
  const dealer = `
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding-left:60px;background:#0d090655">
  <section class="cabinet flex flex-col" style="width:860px;height:640px">
    <header class="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
      <div class="vfd-window px-3 py-1"><h2 class="lcd text-xl">MOTORS</h2></div>
      <span class="mono text-xs" style="color:var(--cream-dim)">Pick one. It's yours, free: one each.</span>
      <button type="button" class="ghost-btn">✕ <span>Esc</span></button>
    </header>
    <div class="flex gap-4 px-4 pb-4" style="flex:1;min-height:0">
      <div class="flex flex-col gap-1" style="width:330px;overflow:hidden">${rows}</div>
      <div class="flex flex-col gap-3" style="flex:1;min-width:0">
        <div class="vfd-window" style="height:250px;border-radius:10px;overflow:hidden;background:#000 url(${img("sedan")}) center/cover"></div>
        <div>
          <p class="mono text-[11px]" style="color:var(--muted);letter-spacing:.08em">COLOUR</p>
          <div class="flex gap-2 mt-2" style="flex-wrap:wrap">${swatches}</div>
        </div>
        <div>
          <p class="mono text-[11px]" style="color:var(--muted);letter-spacing:.08em">PLATE</p>
          <div class="flex items-center gap-3 mt-2">
            <div class="vfd-window px-3 py-1" style="min-width:190px"><span class="lcd text-2xl">ANA·86<span style="opacity:.6">▌</span></span></div>
            <span class="mono text-[11px]" style="color:var(--muted)">8 at most · A–Z 0–9 · -</span>
          </div>
        </div>
        <div class="flex items-center gap-3" style="margin-top:auto">
          <button type="button" class="deck-btn primary" style="height:42px;padding:0 26px">Take it</button>
          <span class="text-xs" style="color:var(--cream-dim)">It's waiting beside you, in the collection bay. Drive it home.</span>
        </div>
      </div>
    </div>
  </section>
</div>`;
  await still(
    page,
    "motors-new",
    dealer +
      note(
        1,
        950,
        170,
        "<b>X at the showroom's door</b>, or at any car on show, opens it. Every drivable vehicle, nine colours, a plate of your own.",
        300,
      ) +
      note(
        2,
        950,
        330,
        "<b>Take it</b>: it appears beside you (the collection bay, or the nearest free spot) with a full tank, and you drive it home. Nobody delivers it to your bay.",
        300,
      ) +
      note(
        3,
        950,
        510,
        "<b>One each</b>: take another and the old one goes, wherever it was left. No wagon body yet: the drivable car is the sedan.",
        300,
      ),
    "hud-dealer",
  );

  // ── the keys: lending them from someone's card ──
  const card = `
<aside class="cabinet p-3" style="position:absolute;right:12px;top:96px;width:300px">
  <div class="flex gap-3">
    <div class="vfd-window shrink-0 grid place-items-center" style="width:88px;height:88px">
      <svg viewBox="0 0 40 40" width="64" height="64"><circle cx="20" cy="14" r="8" fill="#a8693f"/><path d="M12 13c0-6 4-9 8-9s8 3 8 9c-2-3-5-4-8-4s-6 1-8 4z" fill="#1c1410"/><path d="M6 40c0-9 6-14 14-14s14 5 14 14z" fill="#2f4a3b"/></svg>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2"><h2 class="lcd text-2xl leading-none">Bia</h2><button type="button" class="ghost-btn">✕</button></div>
      <p class="mono text-xs mt-1" style="color:var(--cream-dim)">The lot · online</p>
      <p class="text-xs mt-1">· nearby</p>
    </div>
  </div>
  <div class="flex gap-2 mt-3">
    <button type="button" class="deck-btn flex-1" style="height:36px">Go to</button>
    <button type="button" class="deck-btn flex-1" style="height:36px">Follow</button>
  </div>
  <div class="flex gap-2 mt-2 pt-2 items-center" style="border-top:1px solid var(--edge)">
    <button type="button" class="deck-btn flex-1 primary flex items-center justify-center gap-2" style="height:36px">${KEY_SVG.replace('stroke="#e8a33d"', 'stroke="currentColor"')} Lend my car keys</button>
  </div>
  <p class="mono text-[11px] mt-2" style="color:var(--muted)">Your sedan · ANA·86 · in D-03</p>
</aside>`;
  await still(
    page,
    "spot-arrive",
    card +
      ring(1286, 300, 300, 50) +
      note(
        1,
        900,
        440,
        "<b>Click someone</b>: your card on them has <b>Lend my car keys</b>. One borrower at a time; on the card again, <b>Take my keys back</b>.",
        320,
      ) +
      note(
        2,
        900,
        600,
        "They come back by themselves when the borrower parks it in your bay, and at the end of the world's day.",
        320,
      ),
    "hud-keys",
  );
  await still(
    page,
    "spot-board",
    chip(KEY_SVG, "Ana's car keys", "ANA·86 · back when it's in D-03") +
      prompt(BOARD_SVG.replace(/#c99a62/, "#6b2430"), "Drive · <b>Ana's car</b>") +
      note(
        1,
        40,
        150,
        "<b>Bia holds Ana's keys</b>: they sit over the prompt like something carried. X at the driver's door drives it.",
        300,
      ) +
      note(
        2,
        40,
        300,
        "<b>Anyone else</b> gets <b>Get in</b> at the other doors; at the driver's it says <b>It's Ana's</b>.",
        300,
      ),
    "hud-borrow",
  );
});

test.describe("the GPS", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  test("the spot's GPS mock: My car on the map, in the game", async ({ page }) => {
    test.setTimeout(240_000);
    const yu = (fn: (w: any) => unknown) => page.evaluate(`(${fn.toString()})(window.__yutopia)`) as Promise<any>;
    await enter(page, await token(ANA), await useWorld("demo"));
    await page.waitForFunction(() => (window as any).__yutopia?.phone, null, { timeout: 60_000 });
    await yu((w) => w.togglePhone(true));
    await page.waitForTimeout(2200);
    await yu((w) => w.phone.open("maps"));
    await expect(page.locator("[data-gps]")).toBeVisible();
    await page.waitForTimeout(1500);
    // the list: My car on top (a row like a place's, its own group)
    await page.locator("[data-gps-search]").click();
    await page.locator("[data-gps-search]").fill("mot");
    await expect(page.locator("[data-gps-place='b:motors']")).toBeVisible();
    await page.evaluate(() => {
      const row = document.querySelector("[data-gps-place='b:motors']") as HTMLElement;
      const group = row.parentElement as HTMLElement;
      const mine = group.cloneNode(true) as HTMLElement;
      (mine.querySelector("h3") as HTMLElement).textContent = "Mine";
      const r = mine.querySelector("button") as HTMLElement;
      r.removeAttribute("data-gps-place");
      for (const b of [...mine.querySelectorAll("button")].slice(1)) b.remove();
      (r.querySelector("span") as HTMLElement).textContent = "My car · Main Street";
      const ic = r.firstElementChild as HTMLElement;
      ic.outerHTML = `<span style="width:16px;height:16px;border-radius:5px;background:#6b2430;box-shadow:0 0 0 2px #fff;flex:none"></span>`;
      group.parentElement?.insertBefore(mine, group);
    });
    await page.waitForTimeout(300);
    await hideDev(page);
    await page.screenshot({ path: `${OUT}/hud-gps-list.png` });
    await page.locator("[data-gps]").screenshot({ path: `${OUT}/hud-gps-list-phone.png` });
    // picked: the card, its pin in the map's middle (where the car is)
    await page.locator("[data-gps-place='b:motors']").click();
    await expect(page.locator("[data-gps-card]")).toBeVisible();
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      const card = document.querySelector("[data-gps-card]") as HTMLElement;
      const b = card.querySelector("b") as HTMLElement;
      b.textContent = "My car";
      const span = b.nextElementSibling as HTMLElement;
      span.textContent = `${span.textContent} · Main Street, by MOTORS`;
      const map = document.querySelector("[data-gps-map]") as HTMLElement;
      const pin = document.createElement("div");
      pin.style.cssText =
        "position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);display:grid;place-items:center;width:30px;height:38px;pointer-events:none";
      pin.innerHTML = `<svg viewBox="0 0 30 38" width="30" height="38"><path d="M15 37C6 25 2 20 2 13a13 13 0 0 1 26 0c0 7-4 12-13 24z" fill="#6b2430" stroke="#fff" stroke-width="2"/>
      <path d="M8 16l2-5h10l2 5v4H8z" fill="#fff"/><circle cx="11" cy="20" r="1.6" fill="#6b2430"/><circle cx="19" cy="20" r="1.6" fill="#6b2430"/></svg>`;
      map.appendChild(pin);
    });
    await page.waitForTimeout(300);
    await hideDev(page);
    await page.screenshot({ path: `${OUT}/hud-gps-card.png` });
    await page.locator("[data-gps]").screenshot({ path: `${OUT}/hud-gps-card-phone.png` });
  });
});
