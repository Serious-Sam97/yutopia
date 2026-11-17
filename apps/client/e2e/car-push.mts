// (plan 94 P7) A person can't move a car: Ana sat in a town car, stopped (engine idling); Bia walks into its nose,
// then its side, then its tail, ~4 s each, W held — the car's pose on Ana's screen (her sim) before and after.
//   node --experimental-strip-types e2e/car-push.mts [url]
// (the same car each run: `mod:cars` puts it home first — run one at a time)
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const ctx = await request.newContext();
const tokOf = async (email: string) =>
  (
    await (
      await ctx.post("http://localhost:8100/api/login", {
        data: { email, password: "yutopia-demo" },
        headers: { Accept: "application/json" },
      })
    ).json()
  ).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const open = async (tok: string) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on("pageerror", (e) => console.log("  page:", e.message));
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "low", view: "3p", cam3p: "chase" }));
  }, tok);
  await page.goto(`${base}/`);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 240_000 },
  );
  return page;
};
const a = await open(await tokOf("ana@yutopia.test"));
const b = await open(await tokOf("bia@yutopia.test"));
await a.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await a.waitForTimeout(1500);
const car = await a.evaluate(() => {
  const out: any[] = [];
  (window as any).__yutopia.room.state.objects.forEach((o: any) => {
    const p = JSON.parse(o.props);
    if (o.kind === "car" && !p.driven && /^town-car/.test(o.id)) out.push({ id: o.id, x: o.x, y: o.y });
  });
  out.sort((p, q) => p.x - q.x);
  return out[0];
});
let inCar = false;
for (const [dx, dy] of [
  [1.4, 1.0],
  [-1.4, 1.0],
  [1.4, -1.0],
  [-1.4, -1.0],
  [1.0, 1.4],
  [-1.0, 1.4],
]) {
  await a.evaluate(([x, y]) => (window as any).__yutopia.teleport({ x, y, level: 0 }), [car.x + 1 + dx, car.y + 1 + dy]);
  await a.waitForTimeout(1200);
  if (/^car/.test(await a.evaluate(() => (window as any).__hud.get().prompt?.kind ?? ""))) {
    await a.evaluate(() => (window as any).__yutopia.interact());
    await a.waitForTimeout(3000);
    inCar = await a.evaluate(() => (window as any).__yutopia.cars.driving());
    if (inCar) break;
  }
}
console.log("Ana driving", inCar);
if (!inCar) process.exit(1);
await a.waitForTimeout(3000);
const pose = () =>
  a.evaluate(() => {
    const s = (window as any).__yutopia.cars.mine.sim;
    const q = s.q;
    // (its nose: the car's x axis, on the ground's plane — x, and the game's y as the sim's z)
    const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
    const fz = 2 * (q.x * q.z - q.w * q.y);
    const l = Math.hypot(fx, fz);
    return { x: s.p.x, y: s.p.z, fx: fx / l, fy: fz / l, ahead: s.spec.body.ahead, behind: s.spec.body.behind, w: s.spec.body.width };
  });
const p0 = await pose();
console.log("car at", p0.x.toFixed(2), p0.y.toFixed(2));
for (const [where, along, side] of [
  ["nose", p0.ahead + 1.2, 0],
  ["side", 0, p0.w / 2 + 1.2],
  ["tail", -p0.behind - 1.2, 0],
] as const) {
  const p = await pose();
  // (the car's right: its nose turned a quarter)
  const rx = -p.fy;
  const ry = p.fx;
  const bx = p.x + p.fx * along + rx * side;
  const by = p.y + p.fy * along + ry * side;
  await b.evaluate(([x, y]) => (window as any).__yutopia.teleport({ x, y, level: 0 }), [bx, by]);
  await b.waitForTimeout(2500);
  await b.evaluate(([dx, dy]) => ((window as any).__yutopia.tp.yaw = Math.atan2(dy, dx)), [p.x - bx, p.y - by]);
  await b.waitForTimeout(300);
  await b.keyboard.down("KeyW");
  await b.waitForTimeout(4000);
  await b.keyboard.up("KeyW");
  await b.waitForTimeout(800);
  const q = await pose();
  const me = await b.evaluate(() => {
    const w = (window as any).__yutopia.walker.body;
    return { x: w.x, y: w.y };
  });
  const walked = Math.hypot(me.x - bx, me.y - by);
  console.log(
    `${where}: the car moved ${Math.hypot(q.x - p.x, q.y - p.y).toFixed(3)} m · Bia walked ${walked.toFixed(2)} m, now ${Math.hypot(me.x - q.x, me.y - q.y).toFixed(2)} m from its middle`,
  );
}
await a.evaluate(() => (window as any).__yutopia.interact());
await a.waitForTimeout(1500);
await a.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
