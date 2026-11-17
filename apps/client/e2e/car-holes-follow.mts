// (plan 95 point 6) The holes stay on what they're in: Main Street's first town car's whole model given a hole on
// its front right door and one on its body's flank, then its door knocked off and it burnt out (setWear — as the
// blast's damage string has it): the door's hole hidden with its door, the flank's dropped with the charred shell.
//   node --experimental-strip-types e2e/car-holes-follow.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const quality = process.argv[3] ?? "high";
const cpu = Number(process.argv[4] ?? 1);
const shot = process.argv[5];
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => /stall|long|slow/i.test(m.text()) && console.log("  console:", m.text().slice(0, 300)));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", cam3p: "chase", maxFps: 0 }));
    const W = window as any;
    W.__f = [];
    let last = performance.now();
    const tick = (t: number) => {
      W.__f.push(t - last);
      if (t - last > 50) {
        W.__s ??= [];
        W.__s.push([Math.round(t), Math.round(t - last)]);
      }
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  [tok, quality] as const,
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
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await page.waitForTimeout(1500);
// a town car on Main Street, parked along it
const car = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  const out: any[] = [];
  c.room.state.objects.forEach((o: any) => {
    const p = JSON.parse(o.props);
    if (o.kind !== "car" || p.driven || !/^town-car/.test(o.id)) return;
    out.push({ id: o.id, x: o.x, y: o.y, yaw: o.yaw, p });
  });
  out.sort((a, b) => a.x - b.x);
  return out[0];
});
console.log("car", JSON.stringify(car));
const pose = await page.evaluate((id) => {
  const c = (window as any).__yutopia;
  return c.cars.where().find((w: any) => w.id === id) ?? null;
}, car.id);
console.log("where", JSON.stringify(pose));



await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + 3, y: q.y + 3, level: 0 }), car);
await page.waitForFunction((id) => !!(window as any).__yutopia.cars.parked.get(id)?.full?.ready, car.id, { timeout: 30000 });
await page.waitForTimeout(1500);
const res = await page.evaluate(() => {
  const y = (window as any).__yutopia;
  const C = y.cars;
  const p = [...C.parked.values()].find((x: any) => x.full?.ready && x.level === "near") as any;
  const m = p.full;
  const S = p.spec;
  // (a hole on its right front door, one on its right flank behind the rear door — the car's frame)
  m.setHoles([
    { u: -0.2, w: S.body.width / 2, h: 0.7, face: 3, n: [0, 1, 0] },
    { u: -S.body.behind + 0.35, w: S.body.width / 2, h: 0.75, face: 3, n: [0, 1, 0] },
  ]);
  const holes = () => {
    const out: any[] = [];
    m.root.updateMatrixWorld(true);
    m.root.traverse((o: any) => {
      if (!o.isInstancedMesh || !o.userData.mark) return;
      let shown = true;
      for (let x = o; x; x = x.parent) if (!x.visible) shown = false;
      const e = new Float32Array(16);
      for (let i = 0; i < o.count; i++) {
        o.instanceMatrix.array.slice(i * 16, i * 16 + 16).forEach((v: number, k: number) => (e[k] = v));
        const w = o.matrixWorld.elements;
        const yy = w[1] * e[12] + w[5] * e[13] + w[9] * e[14] + w[13];
        out.push({ on: o.parent?.name ?? "?", y: +yy.toFixed(3), shown });
      }
    });
    return out;
  };
  const before = holes();
  // (its right front door off — WRECK's door gone bits, by doorSlot —, burnt out: fire 3)
  const DOOR_GONE_FR = 1 << 5;
  m.setWear(0, [0.5, 0.3, 0.3, 0.6, 0.2], 0, DOOR_GONE_FR, 3);
  const after = holes();
  // (plan 96 F3a: a hole on its bonnet laid, then its front dented deeper — as a driven car's update has it: the
  // holes first, the dents after — its middle against the skin under it)
  m.setWear(0, [0, 0, 0, 0, 0], 0, 0, 0);
  m.setHoles([{ u: S.body.ahead - 0.5, w: 0.15, h: 0.95, face: 0, n: [0, 0, 1] }]);
  const depth = () => {
    const out: number[] = [];
    const V = m.root.position.constructor;
    const skins: any[] = [];
    m.root.traverseVisible((o: any) => {
      if (o.isMesh && !o.isInstancedMesh) skins.push(o);
    });
    m.root.updateMatrixWorld(true);
    const C = y.cars;
    // (the cars' own ray caster: made by a shot's test toward this car)
    if (!C.rc) C.shotAlong({ x: p.pose.x + 6, y: p.pose.z, z: p.pose.y + 0.8 }, { x: -1, y: 0, z: 0 }, 12);
    m.root.traverse((o: any) => {
      if (!o.isInstancedMesh || !o.userData.mark) return;
      const M = new (o.matrixWorld.constructor)();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, M);
        M.premultiply(o.matrixWorld);
        const H = new V().setFromMatrixPosition(M);
        const N = new V(M.elements[8], M.elements[9], M.elements[10]).normalize();
        const R = new (C.rc.constructor)();
        R.set(H.clone().addScaledVector(N, 0.3), N.clone().negate());
        R.far = 0.6;
        const hit = R.intersectObjects(skins, false)[0];
        out.push(hit ? +(hit.point.clone().sub(H).dot(N) * 1000).toFixed(1) : 999);
      }
    });
    return out;
  };
  const laid = depth();
  m.setWear(0, [0.9, 0, 0, 0, 0], 0, 0, 0);
  const dented = depth();
  return { before, after, r: S.wheel.r, bonnetMark: { laid, dentedTo09: dented } };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
