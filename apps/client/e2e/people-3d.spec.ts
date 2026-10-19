/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// The 3D people everywhere (docs/plan/22-people-3d.md): in iso I'm a sprite of
// my 3D model (no drawn rig), in the 3D view a model, in the top bar a portrait
// rendered from it, and "My look" turns the live model. Drawing people from
// the models needs a GPU (on the CPU they stay the drawing), so this spec asks
// for one: Metal on macOS; elsewhere the flags fall back to what's there.
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  },
});

test("the 3D people: an iso sprite of my model, a model in 3D, a portrait, the turntable", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const gpu = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl2");
    const d = g?.getExtension("WEBGL_debug_renderer_info");
    return String(d && g ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : "");
  });
  test.skip(/swiftshader|llvmpipe|software/i.test(gpu), `no GPU here (${gpu}): people stay the drawing`);

  // iso: my model's sprite, posed (not the drawn rig, not the pawn)
  const iso = () =>
    page.evaluate(() => {
      const w = (window as any).__yutopia;
      const v = w.engine.avatars.get(w.room.sessionId);
      return { model: !!v?.iso?.last && v.sprite.visible, rig: !!v?.rig?.root.visible, pawn: !!v?.body.visible };
    });
  await expect.poll(iso, { timeout: 30_000 }).toEqual({ model: true, rig: false, pawn: false });
  expect(
    (await page.evaluate(() => (window as any).__yutopia.engine.avatarShown((window as any).__yutopia.room.sessionId)))
      ?.rigged,
  ).toBe(true);

  // the top bar's face: a picture rendered from the model (a PNG, not the drawing's SVG)
  const face = page.locator('[title="Ana Demo"] img').first();
  await expect
    .poll(async () => (await face.getAttribute("src"))?.slice(0, 22), { timeout: 20_000 })
    .toBe("data:image/png;base64,");

  // "My look": the live model on its stand
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "avatar" } }));
  await expect(page.getByRole("dialog", { name: "My look" }).locator("canvas[data-avatar-3d]")).toBeVisible();
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));

  // the 3D view: my model, drawn
  await page.keyboard.press("t");
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 30_000 });
  await expect
    .poll(
      () => page.evaluate(() => (window as any).__yutopia.tp.drawnAt((window as any).__yutopia.room.sessionId)?.model),
      {
        timeout: 30_000,
      },
    )
    .toBe(true);
  await page.keyboard.press("t");
  // leave her view as it was for the other specs
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso" }));
  });
});
