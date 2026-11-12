/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 79 phase 4: the holds seen close — Ana by day on the pond, each gun out (ready) and aimed, drawn
// again by the game's own renderer from cameras of our own (her right side, her left, ahead of her) so the
// player's camera — which her aim follows — stays where it is. The dev stack (:3100, :8100), the GPU.
//   node --experimental-strip-types e2e/guns-hold.mts [out dir]   (NAME=x: the files' prefix; ONLY=ak47: one gun;
//   DEBUG=1: each step's state)
import { writeFileSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/guns";
const name = process.env.NAME ?? "hold";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const state = (page: Page, at: string) =>
  w(page, (y) => {
    const p = y.room.state.players.get(y.room.sessionId);
    const inv = (window as any).__dark?.inv;
    const g = inv?.quick?.find((it: any) => it?.id === p.gun);
    const f = y.tp.guns.myGun;
    // (the AK's reload, as my body has it: its clock, the magazine in the hand, where it and the hand are)
    const me = y.tp.people3?.get(y.tp.meId);
    const r2 = (v: any) => (v ? [v.x, v.y, v.z].map((n: number) => Math.round(n * 100) / 100) : null);
    const mag = me?.gun?.model.parts.magazine;
    const wp = (o: any) => (o ? o.getWorldPosition(new o.position.constructor()) : null);
    const ak = me
      ? {
          loadT: Math.round(me.loadT * 100) / 100,
          inHand: me.magInHand,
          tilt: me.magTilt,
          w: Math.round(me.gunHandsW * 100) / 100,
          // (in her own frame: x her left, y up, z ahead)
          mag: r2(mag && me.root.worldToLocal(wp(mag))),
          handL: r2(me.root.worldToLocal(wp(me.model.bone("wristL")))),
          handR: r2(me.root.worldToLocal(wp(me.model.bone("wristR")))),
          torch: me.torch ? r2(me.root.worldToLocal(wp(me.torch.root))) : null,
        }
      : null;
    const pockets = inv?.pockets.map((s: any) => (s ? `${s.id}${s.n}` : "-")).join(" ");
    const cd = y.tp.camera.getWorldDirection(y.tp.camera.position.clone());
    const cam = {
      dirY: Math.round(cd.y * 1000) / 1000,
      pitch: Math.round(y.tp.pitch * 1000) / 1000,
      camY: Math.round(y.tp.camera.position.y * 100) / 100,
      fov: Math.round(y.tp.camera.fov),
    };
    return {
      cam,
      life: me?.gun?.model.life ?? null,
      gun: p.gun,
      arm: p.arm,
      scopeK: Math.round(y.tp.scopeK * 100) / 100,
      hidden: me ? !me.root.visible : null,
      loaded: g?.loaded,
      open: f ? Math.round(f.open * 100) / 100 : null,
      pockets,
      ak,
    };
  }).then((s) => process.env.DEBUG && console.log(`  ${at}`, JSON.stringify(s)));
const gun = (page: Page) => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun as string);

/** Draw the scene from beside her: `side` +1 her right, −1 her left, 0 ahead of her; at `h` up, `d` out. */
async function view(page: Page, file: string, side: number, d = 1.6, h = 1.35) {
  const url = (await page.evaluate(
    ([side, d, h]) => {
      const y = (window as any).__yutopia;
      const tp = y.tp;
      const me = y.walker.where();
      const yaw = tp.lookYaw ?? tp.yaw;
      // (floor coords: x, y; three: x, up, z = the floor's y)
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      const rx = -fz;
      const rz = fx;
      const cam = tp.camera.clone();
      cam.fov = 32;
      const base = me.z ?? 0;
      const ax = side === 0 ? fx : rx * side + fx * 0.35;
      const az = side === 0 ? fz : rz * side + fz * 0.35;
      cam.position.set(me.x + ax * d, base + h, me.y + az * d);
      cam.lookAt(me.x + fx * 0.3, base + 1.3, me.y + fz * 0.3);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      tp.renderer.render(tp.scene, cam);
      const me3 = tp.people3?.get(tp.meId);
      if ((window as any).__gunsDebug && me3) {
        const v = me3.root.position;
        console.log(
          `view: visible ${me3.root.visible}, at ${[v.x, v.y, v.z].map((n: number) => n.toFixed(2))}, me ${[me.x, me.z ?? 0, me.y].map((n: number) => n.toFixed(2))}`,
        );
      }
      return tp.renderer.domElement.toDataURL("image/png");
    },
    [side, d, h],
  )) as string;
  writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
}

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([only, hour]) => {
    (window as any).__gunsOnly = only;
    (window as any).__gunsHour = hour;
  },
  [process.env.ONLY ?? "", process.env.HOUR ?? "13"],
);
if (process.env.DEBUG) {
  page.on("console", (m) => m.text().startsWith("view:") && console.log("  ", m.text()));
  await page.addInitScript(() => {
    (window as any).__gunsDebug = true;
  });
}
const tok = await token("ana@yutopia.test");
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  const p = JSON.parse(localStorage.getItem("yutopia:prefs") ?? "{}");
  localStorage.setItem(
    "yutopia:prefs",
    JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false, quality: "high" }),
  );
}, tok);
await page.goto(base);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false && !!(window as any).__yutopia?.tp;
  },
  null,
  { timeout: 120_000 },
);
await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -22, level: 0 }));
await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 30_000 });
await w(page, (y) => {
  y.room.send("mod:hour", { h: Number((window as any).__gunsHour ?? 13) });
  y.room.send("mod:storm", { storm: 0, now: true });
  // (the fourth slot: the sniper, or the Daybreak when it's the one asked for — plan 79 phase 7)
  const db = (window as any).__gunsOnly === "daybreak";
  y.room.send("mod:refill", { kit: true, ak: true, sniper: !db, daybreak: db });
  y.room.send("mod:dark", { mode: "peaceful" });
  if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
  y.tp.yaw = 0;
  y.tp.pitch = 0.1;
});
await page.waitForTimeout(3000);
await page.mouse.move(640, 400);
for (const [key, id] of [
  ["Digit1", "revolver"],
  ["Digit2", "shotgun"],
  ["Digit3", "ak47"],
  ["Digit4", "sniper"],
  ["Digit4", "daybreak"],
] as const) {
  if (process.env.ONLY && process.env.ONLY !== id) continue;
  // (back to the start for each — the moves pass walks and sprints her ahead, toward the water)
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -22, level: 0 }));
  await w(page, (y) => {
    y.tp.yaw = 0;
    y.tp.pitch = 0.1;
  });
  await page.waitForTimeout(800);
  await page.keyboard.press(key);
  const end = Date.now() + 15_000;
  while ((await gun(page)) !== id && Date.now() < end) await page.waitForTimeout(50);
  // (its draw: the hands rising from the side — plan 79 phase 4)
  await page.waitForTimeout(120);
  await state(page, `${id} drawn`);
  await view(page, `${out}/${name}-${id}-draw-120.png`, 1, 1.6);
  await page.waitForTimeout(1500);
  await view(page, `${out}/${name}-${id}-ready-right.png`, 1);
  await view(page, `${out}/${name}-${id}-ready-front.png`, 0, 2.2);
  await page.mouse.down({ button: "right" });
  // (the sniper's aim seen before its scope comes in — down it, her body's not drawn: plan 79 phase 6)
  await page.waitForTimeout(id === "sniper" ? 240 : 1500);
  if (id !== "sniper") await page.screenshot({ path: `${out}/${name}-${id}-aim-game.png` });
  await view(page, `${out}/${name}-${id}-aim-right.png`, 1);
  await view(page, `${out}/${name}-${id}-aim-left.png`, -1);
  await view(page, `${out}/${name}-${id}-aim-front.png`, 0, 2.2);
  if (id === "sniper") {
    await state(page, `${id} shoulder`);
    // down the scope: 4×, then 8× (the wheel), the breath held (Shift)
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}-${id}-scope-4.png` });
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-${id}-scope-8.png` });
    await page.mouse.wheel(0, 100);
    await state(page, `${id} scoped`);
  }
  // (two shots, then R: the reload seen opening and loading — plan 79 F11a, F12a; the AK held down till
  // it's dry, a frame mid-burst, so its reload racks the charging handle — phase 5)
  if (id === "ak47") {
    await page.mouse.down({ button: "left" });
    await page.waitForTimeout(700);
    await view(page, `${out}/${name}-${id}-burst.png`, 1);
    // (dry at ~3.1 s: its click starts the reload — the frames from there, the aim let go at once)
    await page.waitForTimeout(2700);
    await page.mouse.up({ button: "left" });
    await page.mouse.up({ button: "right" });
    await state(page, `${id} emptied`);
    const t0 = Date.now();
    for (const at of [150, 450, 750, 1050, 1350, 1650, 1950]) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      await view(page, `${out}/${name}-${id}-reload-${at}.png`, 1, 1.4);
      await view(page, `${out}/${name}-${id}-reload-${at}-left.png`, -1, 1.4);
      await state(page, `${id} reload ${at}`);
    }
  } else if (id === "daybreak") {
    // pressed, aimed near level (the ball flies its 40 tiles, ~2.9 s): its charge (a frame halfway), the
    // ball off a second on and flying (the game's view), its burst
    // (on the pond's north shore, facing out over it: open ground for the ball's light)
    await page.mouse.up({ button: "right" });
    await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -23, level: 0 }));
    await w(page, (y) => {
      y.tp.yaw = -Math.PI / 2;
      if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
    });
    await page.waitForTimeout(800);
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(900);
    await w(page, (y) => {
      y.tp.pitch = 0.02;
    });
    await page.waitForTimeout(200);
    await page.mouse.down({ button: "left" });
    await page.mouse.up({ button: "left" });
    const t0 = Date.now();
    for (const at of [500, 1150, 1500, 2000, 2600, 3300, 4100]) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      if (at === 500 || at === 1150) await view(page, `${out}/${name}-${id}-charge-${at}.png`, 1, 1.6);
      await page.screenshot({ path: `${out}/${name}-${id}-ball-${at}.png` });
      await state(page, `${id} ball ${at}`);
    }
    await page.waitForTimeout(1500);
  } else if (id === "sniper") {
    // a shot down the scope; the bolt worked out of it (frames), back in; another
    await page.mouse.down({ button: "left" });
    await page.mouse.up({ button: "left" });
    const t0 = Date.now();
    for (const at of [300, 500, 700, 900]) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      await view(page, `${out}/${name}-${id}-bolt-${at}.png`, 1, 1.5);
      await state(page, `${id} bolt ${at}`);
      if (at === 500) await view(page, `${out}/${name}-${id}-bolt-${at}-left.png`, -1, 1.5);
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}-${id}-scope-again.png` });
    await page.mouse.down({ button: "left" });
    await page.mouse.up({ button: "left" });
    await page.waitForTimeout(1500);
  } else
    for (let i = 0; i < 2; i++) {
      await page.mouse.down({ button: "left" });
      await page.mouse.up({ button: "left" });
      await page.waitForTimeout(1000);
    }
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(300);
  if (id !== "ak47") await page.keyboard.press("KeyR");
  // (frames through it: the revolver's one speedloader trip, ~1.55 s; the double-barrel's opening)
  const t0 = Date.now();
  const frames = {
    revolver: [250, 600, 850, 1100, 1450],
    shotgun: [350, 850],
    ak47: [] as number[],
    sniper: [250, 600, 900, 1200],
    daybreak: [250, 600, 900, 1300, 1700],
  };
  for (const at of frames[id]) {
    await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
    await view(page, `${out}/${name}-${id}-reload-${at}.png`, 1, 1.4);
    if (id === "daybreak") await view(page, `${out}/${name}-${id}-reload-${at}-left.png`, -1, 1.4);
  }
  await state(page, `${id} reloaded`);
  await page.waitForTimeout(2500);
  // (on the move — plan 79 phase 4: walking aimed, sprinting, a dodge — away from the pond, open water
  // out of the winter)
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -22, level: 0 }));
  await w(page, (y) => {
    y.tp.yaw = Math.PI;
  });
  await page.waitForTimeout(600);
  await page.mouse.down({ button: "right" });
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await state(page, `${id} walking aimed`);
  await view(page, `${out}/${name}-${id}-walkaim.png`, 1, 1.8);
  await page.keyboard.up("KeyW");
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(400);
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ShiftLeft");
  await page.waitForTimeout(1300);
  await view(page, `${out}/${name}-${id}-sprint.png`, 1, 2.2);
  await view(page, `${out}/${name}-${id}-sprint-front.png`, 0, 2.6);
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.press("KeyQ");
  await page.waitForTimeout(220);
  await view(page, `${out}/${name}-${id}-dodge.png`, 1, 2.2);
  await page.waitForTimeout(1200);
  // (put away: the hands down to the side, then it's gone)
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
  await view(page, `${out}/${name}-${id}-away-150.png`, 1, 1.6);
  await page.waitForTimeout(600);
  console.log("  wrote", id);
}
// (DROPS=1: the guns dropped at her feet, as they lie on the snow — their life models: plan 79 phase 8)
if (process.env.DROPS) {
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -22, level: 0 }));
  for (const kit of [
    { ak: true, sniper: true },
    { ak: false, daybreak: true },
  ]) {
    await w(page, (y) => y.room.send("mod:refill", { kit: true, ...(window as any).__kit }));
    await page.evaluate((k) => {
      (window as any).__kit = k;
      (window as any).__yutopia.room.send("mod:refill", { kit: true, ...k });
    }, kit);
    await page.waitForTimeout(800);
    for (const slot of kit.ak ? [6, 7, 8, 9] : [9]) {
      await w(page, (y) => y.tp.yaw);
      await page.evaluate((s) => (window as any).__yutopia.room.send("dark:drop", { slot: s }), slot);
      await page.waitForTimeout(300);
      // (step aside a little so they don't pile up)
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(260);
      await page.keyboard.up("KeyD");
    }
  }
  await page.waitForTimeout(2500);
  // (from over them, a little to one side, looking down at where they lie)
  const url = (await page.evaluate(() => {
    const y = (window as any).__yutopia;
    const tp = y.tp;
    const ds = [...y.room.state.drops.values()].filter((d: any) =>
      ["revolver", "shotgun", "ak47", "sniper", "daybreak"].includes(d.item),
    );
    const cx = ds.reduce((a: number, d: any) => a + d.x, 0) / ds.length;
    const cy = ds.reduce((a: number, d: any) => a + d.y, 0) / ds.length;
    // (drops keep no height: they lie where she stands)
    const cz = y.walker.where().z ?? 0;
    const cam = tp.camera.clone();
    cam.fov = 40;
    cam.position.set(cx + 0.6, cz + 2.3, cy + 1.4);
    cam.lookAt(cx, cz, cy);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    tp.renderer.render(tp.scene, cam);
    return tp.renderer.domElement.toDataURL("image/png");
  })) as string;
  writeFileSync(`${out}/${name}-drops.png`, Buffer.from(url.split(",")[1], "base64"));
  console.log("  wrote drops");
}
await browser.close();
