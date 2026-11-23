// Plan 114 stills: the Strike Park in the game — the gate from the road in, the lobby and the Map Board, the
// arena from the gallery, in a match (the HUD), the buy grid. node --experimental-strip-types e2e/strike-shots.mts [base]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "../../design/strike";
const only = process.argv[4] ?? "";
const P = { x: -270, z: -735, h: 2 };
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "bia@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.addInitScript(
  ([t]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "medium", view: "3p", cam3p: "chase", maxFps: 0 }));
  },
  [tok] as const,
);
await page.goto(`${base}/`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 240_000 },
);
// (the hour held: 13 by default; STRIKE_HOUR=21 for the night)
const hour = Number(process.env.STRIKE_HOUR ?? 13);
await page.evaluate((hh) => {
  const c = (window as any).__yutopia;
  c.updateNight = () => {};
  c.hour = hh;
  c.model.setClock(hh);
  c.tp?.setHour(hh);
}, hour);
const cam = (eye: number[], look: number[]) =>
  page.evaluate(([e, l]) => {
    (window as any).__strike.stillCam = { eye: e, look: l, showMe: true, snap: true };
  }, [eye, look] as const);
const uncam = () => page.evaluate(() => { (window as any).__strike.stillCam = null; });
const tele = (x: number, y: number) => page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), { x, y });
const send = (t: string, m: unknown) => page.evaluate(([a, b]) => (window as any).__yutopia.room.send(a, b), [t, m] as const);
const face = (yaw: number, pitch = 0) =>
  page.evaluate(([y, p]) => {
    const c = (window as any).__yutopia;
    c.me.yaw = y;
    const tp = c.tp ?? c.view;
    if (tp?.setLook) tp.setLook(y, p);
  }, [yaw, pitch] as const);
const shot = async (name: string, wait = 6000) => {
  if (only && !name.startsWith(only)) return;
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
};
// the gate, from the road in
await tele(P.x + 60, P.z + 140 + 26);
await face(-Math.PI / 2);
await shot("strike-gate", 16000);
// the lobby: the desk and the Map Board
await tele(P.x + 4, P.z + 104 + 24);
await face(-Math.PI / 2);
await shot("strike-lobby", 9000);
// join: the arena (warmup)
await tele(P.x + 20, P.z + 104 + 18);
await page.waitForTimeout(2000);
await send("strike:join", { squad: 0, mode: "competitive" });
await page.waitForTimeout(3000);
await shot("strike-arena-warmup", 8000);
await page.evaluate(() => (window as any).__strike?.act("strike:lobby"));
await shot("strike-lobby-panel", 1500);
await page.evaluate(() => (window as any).__strike?.act("strike:lobby"));
await page.keyboard.press("KeyB");
await shot("strike-buy", 1500);
await page.keyboard.press("KeyB");
await send("strike:start", {});
await shot("strike-round", 6000);
// a smoke bought and thrown down the lane once the round's live (first person: the match's own camera)
await send("strike:buy", { item: "smoke" });
await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.phase === "live", null, { timeout: 30000 });
await page.keyboard.press("KeyJ");
await shot("strike-smoke", 3500);
await page.keyboard.down("Tab");
await shot("strike-scoreboard", 800);
await page.keyboard.up("Tab");
console.log(JSON.stringify(await page.evaluate(() => {
  const a = (window as any).__yutopia.room.state.strike;
  const bots = [...((window as any).__strike?.bots?.values() ?? [])];
  return {
    map: a.map,
    phase: a.phase,
    round: a.round,
    members: a.members.size,
    bots: bots.length,
    botsShown: bots.filter((v: any) => v.shown && v.root.visible).length,
  };
})));
await send("strike:leave", {});
await page.waitForTimeout(1500);
// the map from over the gallery's south-west corner, and the swap's show: Sawmill down, the cranes, Freight up
await cam([P.x - 110, P.z + 120, 60], [P.x, P.z, 0]);
await shot("strike-overview-sawmill", 5000);
await send("strike:map", { key: "freight" });
await shot("strike-show", 6000);
await page.waitForFunction(() => {
  const s = (window as any).__strike;
  return s.mapKey === "freight" && s.mapUp && !s.rising && !s.show3d;
}, null, { timeout: 60_000 });
await shot("strike-overview-freight", 3000);
await cam([P.x + 30, P.z + 60, 14], [P.x - 10, P.z, 2]);
await shot("strike-freight-yard", 3000);
await send("strike:map", { key: "sawmill" });
await page.waitForFunction(() => (window as any).__strike.mapKey === "sawmill" && (window as any).__strike.mapUp && !(window as any).__strike.show3d, null, { timeout: 60_000 });
await uncam();
await browser.close();
