/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, spaceId, test, token, walkTo } from "./helpers";

// VortexOS on the studio's computers (docs/plan/19-vortexos.md). Ana sits at a
// computer and presses X: it boots for everyone, the OS in her panel says
// what it shows (here a stand-in VortexOS that speaks the bridge, so the test
// doesn't depend on the live site), Bia sees it on the glass and can't take
// it; Ana stands up: the OS saves, the monitor shuts down and goes dark.
// YUTOPIA_SHOTS=<dir> also keeps pictures of the glass.

const OS = "https://vortex.serious-sam.dev";
const SHOTS = process.env.YUTOPIA_SHOTS;

// A VortexOS that answers like the real one in host mode.
const STUB = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#008080;font:14px Tahoma">
<div id="s">booting</div><script>
const P = (d) => parent.postMessage(d, "*");
let bye = false;
addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "yutopia:hello") window.__hello = d;
  if (d.type === "yutopia:auth") window.__auth = d;
  if (d.type === "yutopia:bye") { bye = true; document.getElementById("s").textContent = "saving"; setTimeout(() => P({ type: "vortexos:bye" }), 300); }
});
P({ type: "vortexos:hello", signedIn: true, era: "win98" });
P({ type: "vortexos:phase", phase: "boot", era: "win98" });
setTimeout(() => { P({ type: "vortexos:phase", phase: "login", era: "win98" }); document.getElementById("s").textContent = "login"; }, 600);
setTimeout(() => { P({ type: "vortexos:user", username: "ana", era: "win98" }); P({ type: "vortexos:phase", phase: "desktop", era: "win98" }); }, 1200);
setTimeout(() => { P({ type: "vortexos:app", name: "Paint" }); document.getElementById("s").textContent = "desktop"; }, 1500);
</script>`;

// A desk near the arrival point, where there's room: the Lab is a shared dev
// space, so the first free spot the server accepts (it says what fits), not
// one fixed tile. Returns where it went (the chair goes at y + 1).
async function deskSpot(page: Page, sp: { x: number; y: number }, id: string) {
  const tries = [
    [-4, -4],
    [-4, -7],
    [-7, -4],
    [-7, -7],
    [2, -7],
    [-4, 2],
    [-10, -4],
  ];
  for (const [dx, dy] of tries) {
    const D = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
    const clear = await page.evaluate(
      (d) =>
        ![...(window as any).__yutopia.room.state.objects.values()].some(
          (o: any) => o.x >= d.x - 1 && o.x <= d.x + 2 && o.y >= d.y - 1 && o.y <= d.y + 2,
        ),
      D,
    );
    if (!clear) continue;
    await page.evaluate(
      ([d, i]) => (window as any).__yutopia.send("obj:put", { id: i, kind: "desk", x: d.x, y: d.y, rot: 2 }),
      [D, id] as const,
    );
    const placed = await expect
      .poll(() => page.evaluate((i) => !!(window as any).__yutopia.engine.getObject(i), id), { timeout: 4000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (placed) return D;
  }
  throw new Error("no room for a desk near the arrival point");
}

const comp = (page: Page, id: string) =>
  page.evaluate((cid) => {
    const c = (window as any).__yutopia.room.state.computers.get(cid);
    return c ? { phase: c.phase, era: c.era, app: c.app, user: c.user, name: c.name, sid: c.sid } : null;
  }, id);

test("a computer boots VortexOS for everyone, one person at a time", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.route(`${OS}/**`, (r) => r.fulfill({ contentType: "text/html", body: STUB }));
  const tok = await token(ANA);
  const space = await spaceId(tok, "Yutopia Lab");
  await enter(page, tok, space);
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const stamp = Date.now().toString(36);
  const ids = { desk: `e2e-pc-desk-${stamp}`, chair: `e2e-pc-chair-${stamp}`, pc: `e2e-pc-${stamp}` };
  const D = await deskSpot(page, sp, ids.desk);
  const ctxB = await browser.newContext();
  const bia = await ctxB.newPage();
  try {
    // a desk, its chair (the sitter on the −y side), a computer on it facing the chair
    await page.evaluate(
      ([d, i]) => {
        const w = (window as any).__yutopia;
        // (turned to face the camera: the sitter on the +y side)
        w.send("obj:put", { id: i.chair, kind: "chair", x: d.x, y: d.y + 1, rot: 2, props: { desk: true } });
      },
      [D, ids] as const,
    );
    await expect
      .poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.desk))
      .toBe(true);
    await page.evaluate(
      ([d, i]) =>
        (window as any).__yutopia.send("obj:put", {
          id: i.pc,
          kind: "computer",
          x: d.x,
          y: d.y,
          rot: 2,
          props: { c: [1, 0], z: 25 },
        }),
      [D, ids] as const,
    );
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.pc)).toBe(true);

    // Bia comes in to watch
    await enter(bia, await token(BIA), space);

    // Ana walks to the chair and presses X: the action sits her down and boots it
    await walkTo(page, D.x + 0.5, D.y + 2.6, 20_000);
    await page.waitForTimeout(400);
    await page.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ids.pc);
    await expect
      .poll(() => page.evaluate(() => (window as any).__hud.get().panel.kind), { timeout: 20_000 })
      .toBe("computer");
    await expect.poll(async () => (await comp(bia, ids.pc))?.sid).toBeTruthy();
    // the bridge carries what the OS shows to everyone
    await expect.poll(async () => (await comp(bia, ids.pc))?.phase, { timeout: 15_000 }).toBe("desktop");
    await expect.poll(() => comp(bia, ids.pc)).toMatchObject({ era: "win98", app: "Paint", user: "ana" });
    // Ana's shown typing at it; Bia's view draws its glass
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).busy,
        ),
      )
      .toBe("computer");
    await expect.poll(() => bia.evaluate(() => (window as any).__yutopia.os?.pictures().length ?? 0)).toBe(1);
    // the stand-in OS heard Yutopia say hello, with Ana's name
    const hello = await page
      .frameLocator("iframe[title=VortexOS]")
      .locator("body")
      .evaluate(() => (window as any).__hello);
    expect(hello?.name).toBeTruthy();

    if (SHOTS) {
      await bia.evaluate(
        (d) => (window as any).__yutopia.engine.pinCamera({ x: d.x + 0.6, y: d.y + 0.2, zoom: 3.2 }),
        D,
      );
      await bia.waitForTimeout(600);
      await bia.screenshot({ path: `${SHOTS}/computer-desktop-iso.png` });
      await bia.evaluate(() => (window as any).__yutopia.engine.setClock(22));
      await bia.waitForTimeout(1200);
      await bia.screenshot({ path: `${SHOTS}/computer-desktop-iso-night.png` });
      await bia.evaluate(() =>
        (window as any).__yutopia.engine.setClock(new Date().getHours() + new Date().getMinutes() / 60),
      );
      await page.screenshot({ path: `${SHOTS}/computer-panel.png` });
    }

    // Bia can't take it while Ana's on it
    await bia.evaluate((id) => (window as any).__yutopia.send("computer:use", { id }), ids.pc);
    await bia.waitForTimeout(600);
    expect((await comp(bia, ids.pc))?.sid).not.toBe(await bia.evaluate(() => (window as any).__yutopia.room.sessionId));
    expect(await bia.evaluate(() => (window as any).__hud.get().panel.kind)).toBeNull();

    // Ana stands up: the OS saves, then it shuts down for everyone and goes dark
    await page.getByRole("button", { name: /Stand up|Levantar/ }).click();
    await expect.poll(async () => (await comp(bia, ids.pc))?.phase).toBe("shutdown");
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().panel.kind)).toBeNull();
    await expect.poll(async () => await comp(bia, ids.pc), { timeout: 10_000 }).toBeNull();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).busy,
        ),
      )
      .toBe("");
    await expect.poll(() => bia.evaluate(() => (window as any).__yutopia.os?.pictures().length ?? 0)).toBe(0);

    // walking away from it shuts it down too
    await page.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ids.pc);
    await expect.poll(async () => (await comp(bia, ids.pc))?.phase, { timeout: 15_000 }).toBe("desktop");
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    await expect.poll(async () => (await comp(bia, ids.pc))?.phase).toBe("shutdown");
  } finally {
    await page.evaluate(
      (list) => (window as any).__yutopia.send("obj:removeMany", { ids: list }),
      [ids.pc, ids.desk, ids.chair],
    );
    await page.waitForTimeout(500);
    await ctxB.close();
  }
});

// Review shots only (YUTOPIA_SHOTS): the same computer, seen in the 3D view.
test("a computer in use, seen in third person", async ({ page, browser }) => {
  test.skip(!SHOTS, "review shots only");
  test.setTimeout(180_000);
  await page.route(`${OS}/**`, (r) => r.fulfill({ contentType: "text/html", body: STUB }));
  const tok = await token(ANA);
  const space = await spaceId(tok, "Yutopia Lab");
  await enter(page, tok, space);
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const stamp = Date.now().toString(36);
  const ids = { desk: `e2e-pc3-desk-${stamp}`, chair: `e2e-pc3-chair-${stamp}`, pc: `e2e-pc3-${stamp}` };
  const D = await deskSpot(page, sp, ids.desk);
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctxB.newPage();
  await bia.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  try {
    await page.evaluate(
      ([d, i]) => {
        const w = (window as any).__yutopia;
        w.send("obj:put", { id: i.chair, kind: "chair", x: d.x + 1, y: d.y + 1, rot: 2, props: { desk: true } });
      },
      [D, ids] as const,
    );
    await expect
      .poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.desk))
      .toBe(true);
    await page.evaluate(
      ([d, i]) =>
        (window as any).__yutopia.send("obj:put", {
          id: i.pc,
          kind: "computer",
          x: d.x,
          y: d.y,
          rot: 2,
          props: { c: [1, 0], z: 25, seed: 0.8 },
        }),
      [D, ids] as const,
    );
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.pc)).toBe(true);
    // Ana at it (standing: the chair's at the other end of the desk)
    await walkTo(page, D.x + 0.5, D.y + 1.4, 20_000);
    await page.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ids.pc);
    await expect.poll(() => comp(page, ids.pc).then((c) => c?.phase), { timeout: 20_000 }).toBe("desktop");
    await enter(bia, await token(BIA), space);
    await bia.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    await walkTo(bia, D.x + 1.9, D.y + 1.9, 20_000);
    // through her eyes, looking at the glass the way the iso camera does
    await bia.evaluate(() => {
      const tp = (window as any).__yutopia.tp;
      tp.setMode("first");
      tp.yaw = -Math.PI * 0.75;
      tp.pitch = 0.32;
    });
    await bia.waitForTimeout(2500);
    await bia.screenshot({ path: `${SHOTS}/computer-3p.png` });
  } finally {
    await page.evaluate(
      (list) => (window as any).__yutopia.send("obj:removeMany", { ids: list }),
      [ids.pc, ids.desk, ids.chair],
    );
    await page.waitForTimeout(500);
    await ctxB.close();
  }
});

// Against a real VortexOS in host mode (opt-in: YUTOPIA_VORTEXOS=<its url>, e.g. a local
// one on :5174 with its backend set up for sign-in with Yondra): it boots straight away,
// Yondra signs Ana in, her desktop reaches everyone, standing up saves and switches it off.
const REAL = process.env.YUTOPIA_VORTEXOS;
test("the real VortexOS: boot, sign in with Yondra, desktop, stand up", async ({ page, browser }) => {
  test.skip(!REAL, "needs YUTOPIA_VORTEXOS");
  test.setTimeout(240_000);
  await page.addInitScript((url) => localStorage.setItem("yutopia:vortexos", url), REAL as string);
  const tok = await token(ANA);
  const space = await spaceId(tok, "Yutopia Lab");
  await enter(page, tok, space);
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const stamp = Date.now().toString(36);
  const ids = { desk: `e2e-pcr-desk-${stamp}`, chair: `e2e-pcr-chair-${stamp}`, pc: `e2e-pcr-${stamp}` };
  const D = await deskSpot(page, sp, ids.desk);
  const ctxB = await browser.newContext();
  const bia = await ctxB.newPage();
  const seen: string[] = [];
  try {
    await page.evaluate(
      ([d, i]) => {
        const w = (window as any).__yutopia;
        w.send("obj:put", { id: i.chair, kind: "chair", x: d.x, y: d.y + 1, rot: 2, props: { desk: true } });
      },
      [D, ids] as const,
    );
    await expect
      .poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.desk))
      .toBe(true);
    await page.evaluate(
      ([d, i]) =>
        (window as any).__yutopia.send("obj:put", {
          id: i.pc,
          kind: "computer",
          x: d.x,
          y: d.y,
          rot: 2,
          props: { c: [1, 0], z: 25 },
        }),
      [D, ids] as const,
    );
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.pc)).toBe(true);
    await enter(bia, await token(BIA), space);
    const watch = setInterval(() => {
      void comp(bia, ids.pc)
        .then((c) => c && seen[seen.length - 1] !== c.phase && seen.push(c.phase))
        .catch(() => {});
    }, 150);

    await page.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ids.pc);
    await expect
      .poll(() => page.evaluate(() => (window as any).__hud.get().panel.kind), { timeout: 30_000 })
      .toBe("computer");
    // no "Are you ready?": it boots, Yondra signs her in, her desktop comes up for everyone
    await expect.poll(async () => (await comp(bia, ids.pc))?.phase, { timeout: 60_000 }).toBe("desktop");
    const c = await comp(bia, ids.pc);
    expect(c?.user).toBeTruthy();
    clearInterval(watch);
    expect(seen[0]).toBe("boot");
    if (SHOTS) {
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${SHOTS}/computer-real-desktop.png` });
      await bia.evaluate(
        (d) => (window as any).__yutopia.engine.pinCamera({ x: d.x + 0.6, y: d.y + 0.4, zoom: 3.2 }),
        D,
      );
      await bia.waitForTimeout(800);
      await bia.screenshot({ path: `${SHOTS}/computer-real-iso.png` });
    }
    // stand up: it saves (vortexos:bye), then it's off for everyone
    await page.getByRole("button", { name: /Stand up|Levantar/ }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__hud.get().panel.kind), { timeout: 10_000 })
      .toBeNull();
    await expect.poll(async () => await comp(bia, ids.pc), { timeout: 15_000 }).toBeNull();
  } finally {
    await page.evaluate(
      (list) => (window as any).__yutopia.send("obj:removeMany", { ids: list }),
      [ids.pc, ids.desk, ids.chair],
    );
    await page.waitForTimeout(500);
    await ctxB.close();
  }
});

// An OS that doesn't speak the bridge (the live VortexOS until host mode is
// deployed): it loads, so no NO SIGNAL; everyone's glass still moves on by
// Yutopia's own timeline.
test("a VortexOS that doesn't talk back: no NO SIGNAL, the glass goes on by itself", async ({ page }) => {
  test.setTimeout(150_000);
  await page.route(`${OS}/**`, (r) =>
    r.fulfill({ contentType: "text/html", body: '<!doctype html><body style="background:#3a6ea5">a quiet OS</body>' }),
  );
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok, "Yutopia Lab"));
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const stamp = Date.now().toString(36);
  const ids = { desk: `e2e-pcq-desk-${stamp}`, pc: `e2e-pcq-${stamp}` };
  const D = await deskSpot(page, sp, ids.desk);
  try {
    await expect
      .poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.desk))
      .toBe(true);
    await page.evaluate(
      ([d, i]) =>
        (window as any).__yutopia.send("obj:put", {
          id: i.pc,
          kind: "computer",
          x: d.x,
          y: d.y,
          rot: 2,
          props: { c: [1, 0], z: 25 },
        }),
      [D, ids] as const,
    );
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.pc)).toBe(true);
    await walkTo(page, D.x + 0.5, D.y + 1.4, 20_000);
    await page.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ids.pc);
    await expect
      .poll(() => page.evaluate(() => (window as any).__hud.get().panel.kind), { timeout: 20_000 })
      .toBe("computer");
    await expect(page.frameLocator("iframe[title=VortexOS]").getByText("a quiet OS")).toBeVisible();
    await page.waitForTimeout(13_500); // past the NO SIGNAL check
    await expect(page.getByText(/NO SIGNAL|SEM SINAL/)).toHaveCount(0);
    expect((await comp(page, ids.pc))?.phase).toBe("desktop");
    await page.getByRole("button", { name: /Stand up|Levantar/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().panel.kind)).toBeNull();
  } finally {
    await page.evaluate((list) => (window as any).__yutopia.send("obj:removeMany", { ids: list }), [ids.pc, ids.desk]);
    await page.waitForTimeout(500);
  }
});
