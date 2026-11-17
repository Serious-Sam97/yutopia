// (plan 96 phase 0) Feet through the floor: Ana at the wheel of Main Street's first town car, Bia in each other seat
// in turn — each seated person's ankles and toes against the car's own floor under them (a ray straight down from
// above each: its carpet, its underside, what else), and whether a foot is out past the body's side; at rest, on the
// throttle, on the brake. Stills from beside the driver's door at the sill's height (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-feet.mts [url]
// (the same car each run: `mod:cars` puts it home first — run one at a time)
import { type Browser, chromium, type Page, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
async function token(email: string) {
  const ctx = await request.newContext();
  const r = await ctx.post("http://localhost:8100/api/login", { data: { email, password: "yutopia-demo" }, headers: { Accept: "application/json" } });
  return (await r.json()).token as string;
}
const errs = new Map<string, number>();
async function open(browser: Browser, email: string): Promise<Page> {
  const tok = await token(email);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => {
    const k = `${email}: ${e.message.slice(0, 120)}`;
    const n = (errs.get(k) ?? 0) + 1;
    errs.set(k, n);
    if (n === 1) console.log(`  ${email} page:`, e.message, (e.stack ?? "").split("\n").slice(1, 4).join(" | "));
  });
  // (plan 96: the first sound parameter given no number — what was where then)
  await page.addInitScript(() => {
    const W = window as any;
    const P = (W.AudioParam ?? {}).prototype;
    if (!P) return;
    for (const k of ["setTargetAtTime", "setValueAtTime", "exponentialRampToValueAtTime", "linearRampToValueAtTime"]) {
      const was = P[k];
      P[k] = function (v: number, ...a: number[]) {
        if (!Number.isFinite(v) && !W.__nan) {
          const y = W.__yutopia;
          const cam = y?.tp?.camera?.position;
          const C = y?.cars;
          W.__nan = {
            k,
            stack: (new Error().stack ?? "").split("\n").slice(2, 5).join(" | "),
            cam: cam ? [cam.x, cam.y, cam.z] : null,
            me: y?.me ? [y.me.x, y.me.y, y.me.z] : null,
            mine: C?.mine ? { seat: C.mine.seat, vid: C.mine.vid } : null,
            t: performance.now(),
          };
        }
        return was.call(this, v, ...a);
      };
    }
  });
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase" }));
  }, tok);
  await page.goto(base);
  await page.waitForFunction(() => { const h = (window as any).__hud?.get(); return h?.phase === "ready" && h.loading?.on === false; }, null, { timeout: 240_000 });
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));
  return page;
}
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const ana = await open(browser, "ana@yutopia.test");
await ana.evaluate(() => { const y = (window as any).__yutopia; y.room.send("mod:cars", {}); y.room.send("mod:hour", { h: 12 }); });
await ana.waitForTimeout(1500);
const car = await ana.evaluate((want) => {
  const c = (window as any).__yutopia;
  const out: any[] = [];
  c.room.state.objects.forEach((o: any) => {
    const p = JSON.parse(o.props);
    if (o.kind !== "car" || p.driven || !new RegExp(want).test(o.id)) return;
    out.push({ id: o.id, x: o.x, y: o.y, p });
  });
  out.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  return out[0];
}, process.env.CAR ?? "^town-car-0$");
console.log("car", car.id, JSON.stringify(car.p).slice(0, 120));
const bia = await open(browser, "bia@yutopia.test");
const enter = async (p: Page, seat: number) => {
  // (by the car where it is now: driven, its vehicle's place — the three frame's x, z)
  await p.evaluate((q) => {
    const y = (window as any).__yutopia;
    const v = y.room.state.vehicles.get(`car:${q.id}`);
    const at = v ? { x: v.x, y: v.z } : { x: q.x, y: q.y };
    y.teleport({ x: at.x + 1.6, y: at.y + 1.6, level: 0 });
  }, car);
  await p.waitForTimeout(2500);
  await p.evaluate(([id, s]) => (window as any).__yutopia.room.send("car:enter", { id, seat: s }), [car.id, seat] as const);
  await p.waitForTimeout(4500);
};
await enter(ana, 0);
console.log(
  "Ana driving:",
  await ana.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.mine ? C.live.get(C.mine.vid) : null;
    return `${C.driving()} · ${l?.model.root.name} · seats' floors ${JSON.stringify(l?.model.seats.map((x: any) => x.floor === undefined ? null : +x.floor.toFixed(3)))}`;
  }),
);
// (out into the street, clear of the diner's wall by the driver's door: 4 m to its right — NOMOVE=1: left there)
if (!process.env.NOMOVE) await ana.evaluate(() => {
  const m = (window as any).__yutopia.cars.mine;
  const s = m.sim;
  const q = s.q;
  const zx = 2 * (q.x * q.z + q.w * q.y);
  const zz = 1 - 2 * (q.x * q.x + q.y * q.y);
  m.drive.car.place(s.p.x + zx * 4, s.p.y + 0.05, s.p.z + zz * 4, [q.x, q.y, q.z, q.w]);
});
await ana.waitForTimeout(1500);
// each seated person's feet against the floor, from Ana's screen
const feet = (label: string) =>
  ana.evaluate((lab) => {
    const y = (window as any).__yutopia;
    const C = y.cars;
    const l = C.live.get(C.mine.vid);
    const m = l.model;
    // (the cars' own ray caster: made by a shot's test toward this car)
    if (!C.rc) C.shotAlong({ x: l.pose.p.x + 6, y: l.pose.p.z, z: l.pose.p.y + 0.8 }, { x: -1, y: 0, z: 0 }, 12);
    const people = new Set<any>();
    for (const e of l.people.values()) e.m.root.traverse((o: any) => people.add(o));
    const meshes: any[] = [];
    m.root.traverseVisible((o: any) => {
      if (o.isMesh && !o.isInstancedMesh && !people.has(o)) meshes.push(o);
    });
    const V = m.root.position.constructor;
    m.root.updateMatrixWorld(true);
    const inv = m.body.matrixWorld.clone().invert();
    const rows: string[] = [];
    for (const [sid, e] of l.people) {
      const seat = e.seat;
      for (const b of ["ankleL", "ankleR", "toeL", "toeR"]) {
        const bone = e.m.bone(b);
        if (!bone) continue;
        const P = bone.getWorldPosition(new V());
        const rc = C.rc;
        rc.set(new V(P.x, P.y + 0.6, P.z), new V(0, -1, 0));
        rc.far = 1.4;
        const hits = rc.intersectObjects(meshes, false).map((h: any) => {
          const mat = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material;
          return { d: +(h.point.y - P.y).toFixed(3), n: mat?.name ?? "" };
        });
        // (the floor: its carpet or underside — the first such below the shin)
        const floor = hits.find((h: any) => /carpet|under|floor|fibre|vinyl/.test(h.n) && h.d < 0.25);
        const loc = P.clone().applyMatrix4(inv);
        rows.push(
          `  seat ${seat} ${b}: floor ${floor ? (floor.d > 0 ? `ABOVE it by ${floor.d.toFixed(3)} m (${floor.n})` : `below by ${(-floor.d).toFixed(3)} (${floor.n})`) : "none found"} · out ${(Math.abs(loc.z)).toFixed(2)} of half-width · hits ${hits.slice(0, 4).map((h: any) => `${h.n}@${h.d}`).join(" ")}`,
        );
      }
    }
    return `${lab}\n${rows.join("\n")}`;
  }, label);
const still = async (name: string, yaw: number) => {
  if (!process.env.OUT) return;
  await ana.evaluate((yw) => {
    const W = window as any;
    const C = W.__yutopia.cars;
    C.cam.look.yaw = yw;
    C.cam.look.pitch = 0.35;
    C.mouseAt = C.time;
  }, yaw);
  await ana.waitForTimeout(500);
  await ana.screenshot({ path: `${out}/${name}.png` });
};
console.log(await feet("== the driver alone, at rest"));
await still("feet-driver", 1.2);
await ana.keyboard.down("KeyW");
await ana.waitForTimeout(500);
console.log(await feet("== the driver, on the throttle"));
await ana.keyboard.up("KeyW");
await ana.keyboard.down("KeyS");
await ana.waitForTimeout(700);
console.log(await feet("== the driver, on the brake"));
await ana.keyboard.up("KeyS");
await ana.keyboard.down("Space");
for (const s of (process.env.SEATS ?? "1,2,3").split(",").map(Number)) {
  await enter(bia, s);
  await ana.waitForTimeout(1500);
  // (plan 96: a passenger's walker's place — once no number, every sound's level NaN)
  console.log(
    "  Bia's walker:",
    JSON.stringify(
      await bia.evaluate(() => {
        const y = (window as any).__yutopia;
        const w = y.walker ?? y.input?.walker ?? null;
        const me = y.room.state.players.get(y.room.sessionId);
        const ear = (() => {
          try {
            return y.tp?.mood?.earUp?.();
          } catch (e) {
            return String(e);
          }
        })();
        return {
          where: w?.where?.() ?? null,
          me: y.me ? { x: y.me.x, y: y.me.y, z: y.me.z } : null,
          ear,
          fog: y.tp?.fogAir,
          storm: y.storm,
          server: { x: me.x, y: me.y, z: me.z, busy: me.busy },
        };
      }),
    ),
  );
  console.log(await feet(`== Bia in seat ${s}`));
  if (s === 1) {
    await still("feet-passenger", -1.2);
    await still("feet-front-both", 1.2);
  }
  await bia.evaluate(() => (window as any).__yutopia.room.send("car:leave", {}));
  await bia.waitForTimeout(3000);
}
await ana.keyboard.up("Space");
await ana.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
for (const [k, n] of errs) console.log(`  errors ×${n}: ${k}`);
console.log("  first NaN on Bia's page:", JSON.stringify(await bia.evaluate(() => (window as any).__nan ?? null)));
await browser.close();
