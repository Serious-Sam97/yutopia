/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, request } from "@playwright/test";
import { ANA, API, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// Controllers (docs/plan/23-disc-console.md P4), with a fake gamepad in each
// player's browser. The disc console's test card: colour bars; ✕ on pad 1 →
// red; each pad's left stick moves a square while the pad is analog (white:
// pad 1, cyan: pad 2). Ana moves ✕ to her pad's top button (Controllers): the
// top one turns it red, the bottom one doesn't any more. Her stick does nothing
// while the pad's digital; Analog on: the square follows it. Bia takes pad 2,
// turns Analog on, pushes her stick: her square moves on Ana's screen (the
// sticks go through the world-server) and on Bia's TV.
const SHOTS = process.env.YUTOPIA_SHOTS;

const fakePad = () => {
  const mk = () => Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = {
    id: "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: mk(),
  };
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
  (window as any).__press = (i: number, on: boolean) => {
    pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
    pad.timestamp = performance.now(); // (a real pad's moves when its state does)
  };
  (window as any).__axes = (a: number[]) => {
    pad.axes = a;
  };
  try {
    localStorage.removeItem("yutopia:pads");
  } catch {}
};

// a spot of the picture (a 16 × 12 grid), sampled
const colourAt = (page: Page, which: "tv" | "host", id: string, x: number, y: number) =>
  page.evaluate(
    ([w, i, gx, gy]) => {
      const yy = (window as any).__yutopia;
      const src: HTMLVideoElement | HTMLCanvasElement | undefined =
        w === "tv" ? yy.tvVideos.get(`tv-${i}`) : yy.games?.hosting?.canvas;
      if (!src) return "none";
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 12;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.drawImage(src, 0, 0, 16, 12);
      return Array.from(g.getImageData(gx, gy, 1, 1).data.slice(0, 3)).join(",");
    },
    [which, id, x, y] as const,
  );
const hue = (rgb: string) => {
  const [r, g, b] = rgb.split(",").map(Number);
  if (Number.isNaN(r)) return "none";
  if (r > 200 && g > 200 && b > 200) return "white";
  if (r < 100 && g > 200 && b > 200) return "cyan";
  if (r > 150 && g > 150 && b < 100) return "bars"; // (the second bar: yellow)
  if (r > 150 && g < 100 && b < 100) return "red";
  return `other(${rgb})`;
};
const consoleOf = (page: Page, id: string) =>
  page.evaluate((i) => {
    const c = (window as any).__yutopia.room.state.consoles.get(i);
    return c ? { host: c.hostName as string, p2: c.p2Name as string, a1: !!c.a1, a2: !!c.a2 } : null;
  }, id);

const api = async (tok: string) =>
  request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
async function testBios(tok: string, on: boolean) {
  const c = await api(tok);
  const bios = (await (await c.get(`/api/bios`)).json()).bios ?? [];
  for (const b of bios.filter((x: any) => x.model === "Test BIOS")) await c.delete(`/api/bios/${b.id}`);
  if (on)
    await c.post(`/api/bios`, {
      multipart: {
        file: { name: "scph5501.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(512 * 1024, 0x42) },
      },
    });
  await c.dispose();
}

test("controllers: rebind on a fake pad, the analog switch, pad 2's stick through the server", async ({ browser }) => {
  test.setTimeout(300_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const s = await useWorld("lab");
  await testBios(ta, true);
  const open = async (who: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(fakePad);
    const page = await ctx.newPage();
    await enter(page, who === "ana" ? ta : tb, s);
    return page;
  };
  const ana = await open("ana");
  const bia = await open("bia");
  const stamp = Date.now().toString(36);
  const tvId = `e2e-tv-${stamp}`;
  const conId = `e2e-ps1-${stamp}`;
  try {
    // Controllers from Settings
    await ana.evaluate(() => (window as any).__hud.set({ panel: { kind: "settings" } }));
    await ana.getByRole("tab", { name: "Controls" }).click();
    await ana.getByRole("button", { name: /Controllers/ }).click();
    await expect(ana.getByTestId("controllers")).toBeVisible();
    await ana.evaluate(() => (window as any).__press(5, true)); // (a press shows the pad)
    await expect(ana.getByRole("button", { name: /Wireless Controller/ })).toBeVisible();
    // what it sends, raw: the button held, the browser's input arriving
    await expect(ana.getByTestId("pad-raw")).toContainText("#5");
    await expect(ana.getByTestId("pad-raw")).toContainText("input arriving");
    await ana.evaluate(() => (window as any).__press(5, false));
    await ana.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));

    // a TV and the console, cabled (free ground near the arrival point)
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    let at: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [5, -6],
      [8, -6],
      [-9, -6],
      [-12, -6],
      [2, -12],
      [-6, -12],
      [8, -12],
      [-2, -6],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      const busy = await ana.evaluate(
        (a) =>
          (window as any).__yutopia.model
            .allObjects()
            .some((o: any) => o.x >= a.x - 1 && o.x <= a.x + 3 && o.y >= a.y - 1 && o.y <= a.y + 3),
        p,
      );
      if (busy) continue;
      await ana.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
        id: tvId,
        kind: "crt_tv",
        ...p,
        rot: 0,
      });
      await ana.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
        id: conId,
        kind: "console_ps1",
        x: p.x + 1,
        y: p.y + 2,
        rot: 0,
        props: { tv: tvId },
      });
      await ana.waitForTimeout(800);
      if (await ana.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), conId)) {
        at = p;
        break;
      }
    }
    expect(at, "room for the TV and the console").not.toBeNull();
    const p = at as { x: number; y: number };
    const panel = (page: Page) =>
      page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    await walkTo(ana, p.x + 1.5, p.y + 3.6, 25_000);
    await ana.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await ana.evaluate(([id]) => (window as any).__yutopia.send("game:cart", { id, game: "b:testcard-ps1" }), [conId]);
    await panel(ana);
    const power = ana.getByRole("button", { name: /^⏻ Turn on/ });
    await expect(power).toBeEnabled({ timeout: 15_000 });
    await power.click();
    const host = (x: number, y: number) => colourAt(ana, "host", conId, x, y).then(hue);
    await expect.poll(() => host(2, 6), { timeout: 90_000 }).toBe("bars");

    // ✕ (bottom) works as it comes: red
    await ana.evaluate(() => (window as any).__press(0, true));
    await expect.poll(() => host(2, 6)).toBe("red");
    await ana.evaluate(() => (window as any).__press(0, false));
    await expect.poll(() => host(2, 6)).toBe("bars");
    // Controllers: ✕ to the top button (△ on this pad)
    await ana.getByRole("button", { name: /Controllers/ }).click();
    await expect(ana.getByTestId("controllers")).toBeVisible();
    const row = ana.locator('tr[data-control="b"]');
    await row.locator('[data-bind="pad"]').click();
    await expect(row.locator('[data-bind="pad"]')).toHaveText(/Press a button/);
    await ana.evaluate(() => (window as any).__press(3, true));
    await expect(row.locator('[data-bind="pad"]')).toHaveText("△");
    await ana.evaluate(() => (window as any).__press(3, false));
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/controllers.png` });
    await ana.getByRole("button", { name: /Back to the console/ }).click();
    await ana.evaluate(() => (window as any).__press(3, true));
    await expect.poll(() => host(2, 6)).toBe("red");
    await ana.evaluate(() => (window as any).__press(3, false));
    await expect.poll(() => host(2, 6)).toBe("bars");
    await ana.evaluate(() => (window as any).__press(0, true));
    await ana.waitForTimeout(600);
    expect(await host(2, 6), "the bottom button does nothing now").toBe("bars");
    await ana.evaluate(() => (window as any).__press(0, false));

    // the stick: nothing while digital; Analog on → the white square follows it (up-left)
    await ana.evaluate(() => (window as any).__axes([-1, -1, 0, 0]));
    await ana.waitForTimeout(700);
    expect(await host(2, 3), "digital: no square").toBe("bars");
    await ana.getByRole("button", { name: /Analog/ }).click();
    await expect.poll(() => consoleOf(bia, conId).then((c) => c?.a1)).toBe(true);
    await expect.poll(() => host(2, 3), { timeout: 10_000 }).toBe("white");
    await ana.evaluate(() => (window as any).__axes([0, 0, 0, 0])); // (back to the middle)
    await expect.poll(() => host(2, 3)).toBe("bars");

    // Bia: pad 2, Analog, her stick up-left: the cyan square on Ana's screen and on Bia's TV
    await walkTo(bia, p.x + 2.5, p.y + 3.6, 25_000);
    await panel(bia);
    await bia.getByRole("button", { name: "Take pad 2" }).click();
    await expect.poll(() => consoleOf(ana, conId).then((c) => c?.p2)).toBe("Bia Demo");
    await bia.getByRole("button", { name: /Analog/ }).click();
    await expect.poll(() => consoleOf(ana, conId).then((c) => c?.a2)).toBe(true);
    await bia.evaluate(() => (window as any).__axes([-1, -1, 0, 0]));
    await expect.poll(() => host(2, 3), { timeout: 10_000 }).toBe("cyan");
    await expect.poll(() => colourAt(bia, "tv", conId, 2, 3).then(hue), { timeout: 15_000 }).toBe("cyan");
    if (SHOTS) await bia.screenshot({ path: `${SHOTS}/controllers-pad2-stick.png` });
    await bia.evaluate(() => (window as any).__axes([0, 0, 0, 0]));
    await expect.poll(() => host(2, 3)).toBe("bars");

    await ana.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleOf(ana, conId)).toBeNull();
  } finally {
    await ana
      .evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId])
      .catch(() => {});
    await ana.waitForTimeout(1500).catch(() => {});
    await testBios(ta, false);
  }
});
