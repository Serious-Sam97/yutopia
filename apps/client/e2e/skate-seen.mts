// (plan 103) Someone else's board: Ana skates on Main Street, Bia beside her sees it — Ana's `sk` on the wire, her
// board drawn under her in Bia's scene, sideways; then Ana bails and Bia sees her go down (OUT=dir: a still of each).
//   OUT=dir node --experimental-strip-types e2e/skate-seen.mts [url]
import { writeFileSync } from "node:fs";
import { type Browser, chromium, type Page, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const ctx = await request.newContext();
async function login(email: string) {
  const r = await ctx.post("http://localhost:8100/api/login", {
    data: { email, password: "yutopia-demo" },
    headers: { Accept: "application/json" },
  });
  return (await r.json()).token as string;
}
const browser: Browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
async function open(email: string): Promise<Page> {
  const tok = await login(email);
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on("pageerror", (e) => console.log(`  ${email} page:`, e.message));
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0 }));
  }, tok);
  await page.goto(`${base}/`);
  await page.waitForFunction(() => (window as any).__hud?.get()?.phase === "ready" && !(window as any).__hud.get().loading?.on, null, {
    timeout: 300_000,
  });
  return page;
}
const ana = await open("ana@yutopia.test");
const bia = await open("bia@yutopia.test");
await ana.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
await ana.evaluate(() => (window as any).__yutopia.teleport({ x: 330, y: -405, level: 0 }));
await bia.evaluate(() => (window as any).__yutopia.teleport({ x: 336, y: -400, level: 0 }));
await ana.waitForTimeout(3000);
await ana.evaluate(() => {
  const c = (window as any).__yutopia;
  c.walker.faceYaw?.(0);
  c.skateHand("cruiser-classic");
});
await ana.keyboard.down("KeyW");
await ana.waitForTimeout(1200);
await ana.keyboard.up("KeyW");
await bia.waitForTimeout(800);
const seen = await bia.evaluate(() => {
  const c = (window as any).__yutopia;
  let sk = 0;
  let sid = "";
  c.room.state.players.forEach((p: any, id: string) => {
    if (p.name?.startsWith?.("Ana") || p.sk) {
      if (p.sk) {
        sk = p.sk;
        sid = id;
      }
    }
  });
  // her board in Bia's scene: a "board" group under someone
  let boards = 0;
  c.tp.scene.traverse((o: any) => {
    if (o.name === "board" || (o.children?.some?.((k: any) => k.name === "deck") && o.parent?.type === "Group")) boards++;
  });
  return { sk, sid, boards };
});
console.log("Bia sees:", JSON.stringify(seen));
const still = async (p: Page, name: string) => {
  const url = await p.evaluate(() => {
    const c = (window as any).__yutopia;
    c.tp.renderer.render(c.tp.scene, c.tp.camera);
    return c.tp.renderer.domElement.toDataURL("image/png");
  });
  writeFileSync(`${out}/seen-${name}.png`, Buffer.from(url.split(",")[1], "base64"));
};
await still(bia, "riding");
// Ana bails: an ollie, a quarter spin, down sideways
await ana.keyboard.down("Space");
await ana.waitForTimeout(250);
await ana.keyboard.up("Space");
await ana.keyboard.down("KeyD");
await ana.waitForTimeout(240);
await ana.keyboard.up("KeyD");
await bia.waitForTimeout(1800);
const after = await bia.evaluate(() => {
  const c = (window as any).__yutopia;
  const out: number[] = [];
  c.room.state.players.forEach((p: any) => out.push(p.sk));
  return out;
});
console.log("after the bail, sk:", JSON.stringify(after));
await still(bia, "bail");
await browser.close();
