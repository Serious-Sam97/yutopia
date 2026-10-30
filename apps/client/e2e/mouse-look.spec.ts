/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// The mouse is the camera (docs/plan/56-the-controls.md A): a click on the world locks the
// pointer and the mouse turns the camera; a click then picks nothing in the world; what wants the
// pointer (a panel, the phone) lets it go and gives it back when it's gone; Esc lets it go and the
// hint says how to take it again; Z no longer toggles it (it aims now). The hints show as they say.
// Headless Chromium never grants a pointer lock, so the lock is stubbed: it behaves as the
// browser's (the element, the change event, letting go).

// (3D: the real GPU — headless software GL draws a frame in seconds, and the hints fade first)
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const looking = (page: Page) => page.evaluate(() => !!(window as any).__yutopia.tp?.looking);
const locked = (page: Page) => page.evaluate(() => document.pointerLockElement?.tagName ?? null);
const yaw = (page: Page) => page.evaluate(() => (window as any).__yutopia.tp.yaw as number);

test("the mouse is the camera: a click takes it, it turns the camera, it picks nothing", async ({ page }) => {
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

  // in play without it: the hint asks for a click
  await expect(page.getByText("Click to look around with the mouse")).toBeVisible();

  // a click on the world: locked, and the hint says how to let go — nothing in the world picked
  const picks = await page.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    (window as any).__picks = 0;
    const pick = tp.pick.bind(tp);
    tp.pick = (...a: unknown[]) => {
      (window as any).__picks++;
      return pick(...a);
    };
    return 0;
  });
  await page.mouse.click(640, 400);
  await expect.poll(() => looking(page)).toBe(true);
  expect(await locked(page)).toBe("CANVAS");
  await expect(page.getByText("Esc frees it")).toBeVisible();

  // the mouse turns the camera (left / right: yaw)
  const y0 = await yaw(page);
  await page.evaluate(() => {
    const c = document.pointerLockElement as HTMLElement;
    c.dispatchEvent(new PointerEvent("pointermove", { movementX: 120, movementY: 0, bubbles: true }));
  });
  // (the camera keeps its angle in −π..π: the turn as an angle between)
  const turned = async () => {
    const d = (await yaw(page)) - y0;
    return Math.atan2(Math.sin(d), Math.cos(d));
  };
  await expect.poll(turned).toBeGreaterThan(0.2);

  // a click with it: nothing in the world is picked, no menu
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__picks)).toBe(picks);
  expect(await page.evaluate(() => (window as any).__hud.get().menu)).toBe(null);

  // the hint goes after a few seconds; the mouse stays the camera
  await expect(page.getByText("Esc frees it")).toBeHidden({ timeout: 6000 });
  expect(await looking(page)).toBe(true);

  // Z is the aim now, not a toggle
  await page.keyboard.press("z");
  await page.waitForTimeout(200);
  expect(await looking(page)).toBe(true);

  // a panel wants the pointer: let go; closed, it's the camera's again
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "settings" } }));
  await expect.poll(() => looking(page)).toBe(false);
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
  await expect.poll(() => looking(page)).toBe(true);

  // Esc (the browser's): let go, and the hint asks for a click again
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(() => looking(page)).toBe(false);
  await expect(page.getByText("Click to look around with the mouse")).toBeVisible();

  // the browser says no (as right after Esc): a note, and nothing locked
  await page.evaluate(() => {
    (window as any).__refuseLock = true;
  });
  await page.mouse.click(640, 400);
  await expect(page.getByText("didn't give the mouse to the camera")).toBeVisible();
  expect(await looking(page)).toBe(false);
});
