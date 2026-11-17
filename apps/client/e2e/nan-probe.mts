// (2026-11-17) Bia's place and camera NaN beside Ana's driven town car: a frame-by-frame record on Bia's page up
// to the first NaN (her walker's in and out, the cars' drawn poses and Jolt bodies), the snaps she got, and the world
// loop's frames stepped back in time (dt < 0: what made a car's playback NaN — controller.ts loop, car/playback.ts).
// Fails (exit 1) on any NaN or any frame back in time. Shares the dev world: run one at a time.
//   node --experimental-strip-types e2e/nan-probe.mts [url]
import { type Browser, chromium, type Page, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
async function token(email: string) {
  const ctx = await request.newContext();
  const r = await ctx.post("http://localhost:8100/api/login", {
    data: { email, password: "yutopia-demo" },
    headers: { Accept: "application/json" },
  });
  return (await r.json()).token as string;
}
const errs = new Map<string, number>();
async function open(browser: Browser, email: string, watch: boolean): Promise<Page> {
  const tok = await token(email);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => {
    const k = `${email}: ${e.message.slice(0, 100)}`;
    const n = (errs.get(k) ?? 0) + 1;
    errs.set(k, n);
    if (n === 1) console.log(`  ${email} page:`, e.message, (e.stack ?? "").split("\n").slice(1, 4).join(" | "));
  });
  if (watch)
    await page.addInitScript(() => {
      const W = window as any;
      const ring: any[] = [];
      W.__ring = ring;
      W.__snaps = [];
      const bad = (a: any[]) => a.some((v) => typeof v === "number" && !Number.isFinite(v));
      const r3 = (v: any) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
      const tick = () => {
        const y = W.__yutopia;
        if (y && !W.__bad) {
          const w = y.walker;
          if (w && !w.__wrapped) {
            w.__wrapped = true;
            const was = w.frame;
            w.frame = function (dt: number, c: any) {
              const b = { ...this.body };
              const prev = { ...this.prev };
              const last = { ...this.last };
              const o = was.call(this, dt, c);
              if (!W.__wbad && bad([o.x, o.y, o.z, o.vz])) {
                W.__wbad = {
                  dt,
                  at: c.at,
                  camYaw: c.camYaw,
                  camPitch: c.camPitch,
                  path: c.path,
                  before: b,
                  prevBefore: prev,
                  last,
                  after: { ...this.body },
                  out: { x: o.x, y: o.y, z: o.z, vz: o.vz, up: o.up },
                  t: performance.now(),
                };
              }
              return o;
            };
          }
          // (the world loop's frames: any stepped back in time — a dt below 0)
          if (!y.__dtw && typeof y.frame === "function") {
            y.__dtw = true;
            W.__dt = { n: 0, back: 0, min: 0 };
            const fr = y.frame;
            y.frame = function (dt: number, t: number) {
              W.__dt.n++;
              if (!(dt >= 0)) {
                W.__dt.back++;
                W.__dt.min = Math.min(W.__dt.min, dt);
              }
              return fr.call(this, dt, t);
            };
          }
          if (y.room && !y.room.__snapw) {
            y.room.__snapw = true;
            y.room.onMessage("snap", (m: any) => W.__snaps.push({ t: performance.now() | 0, m }));
          }
          const cam = y.tp?.camera?.position;
          const bd = w?.body;
          const s = {
            t: performance.now() | 0,
            me: [y.me?.x, y.me?.y].map(r3),
            h: r3(y.height?.z),
            lvl: y.level,
            body: bd ? [bd.x, bd.y, bd.z, bd.vx, bd.vy, bd.vz].map(r3) : null,
            cam: cam ? [cam.x, cam.y, cam.z].map(r3) : null,
            cars: [] as any[],
          };
          try {
            y.cars?.live?.forEach((l: any, id: string) => {
              const P = l.pose?.p;
              const Q = l.pose?.q;
              let jb: any = null;
              try {
                const g = l.pulled?.body?.GetPosition?.();
                if (g) jb = [g.GetX(), g.GetY(), g.GetZ()].map(r3);
              } catch {}
              s.cars.push({
                id,
                p: P ? [P.x, P.y, P.z].map(r3) : null,
                q: Q ? [Q.x, Q.y, Q.z, Q.w].map(r3) : null,
                jb,
                n: l.pb?.buf?.length,
              });
            });
          } catch {}
          ring.push(s);
          if (ring.length > 30) ring.shift();
          if (
            bad([...s.me, s.h, ...(s.body ?? []), ...(s.cam ?? [])]) ||
            s.cars.some((c: any) => bad([...(c.p ?? []), ...(c.q ?? []), ...(c.jb ?? [])]))
          )
            W.__bad = { ring: [...ring] };
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase" }));
  }, tok);
  await page.goto(base);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 240_000 },
  );
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));
  return page;
}
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const ana = await open(browser, "ana@yutopia.test", false);
await ana.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.send("mod:cars", {});
  y.room.send("mod:hour", { h: 12 });
});
await ana.waitForTimeout(1500);
const car = await ana.evaluate(() => {
  const c = (window as any).__yutopia;
  const out: any[] = [];
  c.room.state.objects.forEach((o: any) => {
    if (o.kind === "car" && o.id === "town-car-0") out.push({ id: o.id, x: o.x, y: o.y });
  });
  return out[0];
});
console.log("car", JSON.stringify(car));
const bia = await open(browser, "bia@yutopia.test", true);
const t0 = await bia.evaluate(() => performance.now() | 0);
const enter = async (p: Page, seat: number) => {
  const at = await p.evaluate((q) => {
    const y = (window as any).__yutopia;
    const v = y.room.state.vehicles.get(`car:${q.id}`);
    const at = v ? { x: v.x, y: v.z } : { x: q.x, y: q.y };
    y.teleport({ x: at.x + 1.6, y: at.y + 1.6, level: 0 });
    return { at, v: v ? { x: v.x, y: v.y, z: v.z } : null, t: performance.now() | 0 };
  }, car);
  console.log(`  teleport (${seat})`, JSON.stringify(at));
  await p.waitForTimeout(2500);
  await p.evaluate(([id, s]) => (window as any).__yutopia.room.send("car:enter", { id, seat: s }), [
    car.id,
    seat,
  ] as const);
  await p.waitForTimeout(4500);
};
await enter(ana, 0);
await ana.waitForTimeout(1500);
// (as car-feet does: on the throttle, the brake, then the handbrake held)
await ana.keyboard.down("KeyW");
await ana.waitForTimeout(500);
await ana.keyboard.up("KeyW");
await ana.keyboard.down("KeyS");
await ana.waitForTimeout(700);
await ana.keyboard.up("KeyS");
await ana.keyboard.down("Space");
await enter(bia, 1);
await bia.evaluate(() => (window as any).__yutopia.room.send("car:leave", {}));
await bia.waitForTimeout(3000);
await ana.keyboard.up("Space");
await ana.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
for (const [k, n] of errs) console.log(`  errors ×${n}: ${k}`);
const rep = await bia.evaluate(() => {
  const W = window as any;
  return {
    dt: W.__dt ?? null,
    bad: W.__bad ?? null,
    wbad: W.__wbad ?? null,
    snaps: W.__snaps,
    me: W.__yutopia.me,
    h: W.__yutopia.height,
  };
});
console.log("  bia frames", JSON.stringify(rep.dt));
console.log("  bia t0", t0, "snaps", JSON.stringify(rep.snaps));
console.log("  end me", JSON.stringify(rep.me), "h", JSON.stringify(rep.h));
if (rep.wbad) console.log("  WALKER first NaN out:", JSON.stringify(rep.wbad));
if (rep.bad) {
  console.log("  FIRST NaN frame ring:");
  for (const s of rep.bad.ring) console.log("   ", JSON.stringify(s));
} else console.log("  no NaN");
await browser.close();
if (rep.bad || rep.wbad || rep.dt?.back) {
  console.log("  FAIL: a NaN or a frame back in time on Bia's page");
  process.exitCode = 1;
}
