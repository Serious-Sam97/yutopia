/* biome-ignore-all lint/suspicious/noExplicitAny: probe */
// Scratch (plan 124 phase 0): the catalog's pictures, as the game renders them, for the build view's mocks.
// npx tsx e2e/zz-bv-items.mts <out dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post("http://localhost:8100/api/login", {
      data: { email: "ana@yutopia.test", password: "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([t]) => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p" }));
  },
  [tok] as const,
);
await page.goto("http://localhost:3100");
await page.waitForFunction(
  () => (window as any).__hud?.get()?.phase === "ready" && !(window as any).__hud?.get()?.loading?.on,
  null,
  { timeout: 240_000 },
);
await page.evaluate(() =>
  (window as any).__hud.set((h: any) => ({ build: { ...h.build, on: true, tool: "furniture", mode: "hand" } })),
);
await page.waitForSelector(".tile-card", { timeout: 60_000 });
const tabs = await page.$$eval('div.overflow-x-auto[role="tablist"] [role="tab"]', (ts) => ts.map((t) => (t.textContent ?? "").trim()));
console.log("tabs", tabs.length);
const index: Record<string, string[]> = {};
const slugOf = (s: string) =>
  s
    .toLowerCase()
    .split("")
    .map((ch) => (/[a-z0-9]/.test(ch) ? ch : "-"))
    .join("")
    .split("-")
    .filter(Boolean)
    .join("-");
for (let i = 0; i < tabs.length; i++) {
  const tab = (await page.$$('div.overflow-x-auto[role="tablist"] [role="tab"]'))[i];
  await tab.click();
  await page.waitForTimeout(400);
  // scroll the grid to the end so every card's picture is asked for, then wait for them
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll(".scroll-thin")) (el as HTMLElement).scrollTop = 1e6;
    });
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2500);
  const cards = await page.$$eval(".tile-card", (cs) =>
    cs.map((c) => ({
      label: c.getAttribute("aria-label") ?? "",
      src: c.querySelector("img")?.getAttribute("src") ?? "",
    })),
  );
  const name = tabs[i].split(" ").filter((w) => !/^\d+$/.test(w)).join(" ").trim();
  index[name] = [];
  for (const c of cards) {
    if (!c.src.startsWith("data:image")) continue;
    const slug = slugOf(c.label);
    const png = c.src.startsWith("data:image/png");
    const svg = c.src.startsWith("data:image/svg");
    const ext = png ? "png" : svg ? "svg" : "jpg";
    const body = c.src.slice(c.src.indexOf(",") + 1);
    const b64 = c.src.slice(0, c.src.indexOf(",")).includes("base64");
    writeFileSync(`${OUT}/${slug}.${ext}`, b64 ? Buffer.from(body, "base64") : decodeURIComponent(body));
    index[name].push(`${slug}.${ext}|${c.label}`);
  }
  console.log(name, cards.length, index[name].length);
}
writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
await page.evaluate(() => (window as any).__hud.set((h: any) => ({ build: { ...h.build, on: false } })));
await browser.close();
