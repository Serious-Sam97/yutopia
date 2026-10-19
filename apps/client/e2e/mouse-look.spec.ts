/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// Mouse look (third person): Z locks the pointer and the mouse turns the
// camera; a click uses what's under the crosshair (the middle of the view);
// Z again, or something that wants the pointer (the phone), lets it go. The hint
// saying so shows for a few seconds.
// Headless Chromium never grants a pointer lock, so the lock is stubbed: it
// behaves as the browser's (the element, the change event, letting go).

const looking = (page: Page) => page.evaluate(() => !!(window as any).__yutopia.tp?.looking);
const locked = (page: Page) => page.evaluate(() => document.pointerLockElement?.tagName ?? null);
const yaw = (page: Page) => page.evaluate(() => (window as any).__yutopia.tp.yaw as number);

test("mouse look: Z locks the pointer, the mouse turns the camera, a click picks the middle", async ({ page }) => {
  test.setTimeout(120_000);
  const tok = await token(ANA);
  const lab = await useWorld("lab");
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", lookSens: 1, lookInvert: false }));
    let el: Element | null = null;
    (window as any).__refuseLock = false;
    Object.defineProperty(Document.prototype, "pointerLockElement", { configurable: true, get: () => el });
    Element.prototype.requestPointerLock = function (this: Element) {
      if ((window as any).__refuseLock) {
        setTimeout(() => document.dispatchEvent(new Event("pointerlockerror")));
        return Promise.reject(new DOMException("refused", "NotAllowedError"));
      }
      el = this;
      setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")));
      return Promise.resolve();
    } as any;
    Document.prototype.exitPointerLock = () => {
      el = null;
      setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")));
    };
  });
  await enter(page, tok, lab);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.mouse.move(640, 400);

  // Z: locked, the hint and the crosshair show
  await page.keyboard.press("z");
  await expect.poll(() => looking(page)).toBe(true);
  expect(await locked(page)).toBe("CANVAS");
  await expect(page.getByText("Z or Esc frees the mouse")).toBeVisible();

  // the mouse turns the camera (left / right: yaw)
  const y0 = await yaw(page);
  await page.evaluate(() => {
    const c = document.pointerLockElement as HTMLElement;
    c.dispatchEvent(new PointerEvent("pointermove", { movementX: 120, movementY: 0, bubbles: true }));
  });
  await expect.poll(async () => (await yaw(page)) - y0).toBeGreaterThan(0.2);

  // a click: what's in the middle of the view, wherever the mouse was
  const picked = await page.evaluate(async () => {
    const tp = (window as any).__yutopia.tp;
    const seen: [number, number][] = [];
    const pick = tp.pick.bind(tp);
    // (only where it looks: what's in the middle here is me, and my menu would take the pointer)
    tp.pick = (x: number, y: number) => {
      seen.push([x, y]);
    };
    const c = tp.renderer.domElement as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientX: 5, clientY: 5, bubbles: true }));
    c.dispatchEvent(new PointerEvent("pointerup", { button: 0, clientX: 5, clientY: 5, bubbles: true }));
    tp.pick = pick;
    const r = c.getBoundingClientRect();
    return { seen, mid: [r.left + r.width / 2, r.top + r.height / 2] };
  });
  expect(picked.seen).toEqual([picked.mid]);

  // the hint goes after a few seconds; mouse look stays on
  await expect(page.getByText("Z or Esc frees the mouse")).toBeHidden({ timeout: 6000 });
  expect(await looking(page)).toBe(true);

  // Z again lets go
  await page.keyboard.press("z");
  await expect.poll(() => looking(page)).toBe(false);
  expect(await locked(page)).toBe(null);
  await expect(page.getByText("Z or Esc frees the mouse")).toBeHidden();

  // the phone wants the pointer: P lets go
  await page.waitForTimeout(1200);
  await page.keyboard.press("z");
  await expect.poll(() => looking(page)).toBe(true);
  await page.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  await page.keyboard.press("p");
  await expect.poll(() => looking(page)).toBe(false);

  // the browser says no (as right after Esc): a note, and nothing locked
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    (window as any).__refuseLock = true;
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press("z");
  await expect(page.getByText("didn't let mouse look start")).toBeVisible();
  expect(await looking(page)).toBe(false);
});
