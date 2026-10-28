/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { KART_THINGS, kartTrack, TRACK_W } from "../../../packages/shared/src/kart/park.ts";
import { ANA, enter, test, token } from "./helpers";

// The board of the circuits in the game (docs/plan/47-the-track-changer.md, phases 3–6): in 3D,
// stood by the board in the paddock, X opens the panel — a card each layout, its map drawn —,
// the Oval picked and set, the board's face and the desk's strip painted with it (3D), Rosa calling
// it out; the show — the park shut, four ploughs out, the panel saying so, the new circuit drawn
// behind them (3D) —; then, the show over, a walk where the Figure Eight's asphalt was: snow now,
// underfoot and to look at (3D); the bridge sunk out of the way (the Oval doesn't go over it), the
// land walked where it stood; then the Figure Eight set again from it, the bridge back.
// Review shots: YUTOPIA_SHOTS=<dir>.

const dir = process.env.YUTOPIA_SHOTS;
if (process.env.YUTOPIA_FIREFOX !== "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, z: number) => ({ x: x + 60, y: z + 10 });
const board = KART_THINGS.find((t) => t.kind === "circuits");
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const showOver = (page: Page) =>
  page.waitForFunction(() => !(window as any).__yutopia.room.state.karts.get("park").showing, null, {
    timeout: 20_000,
  });
// a stretch of the Figure Eight's that's no other layout's (off the Oval by 14 m+), on the ground
const eight = kartTrack();
const oval = kartTrack("oval");
const lost = eight.pts.find(
  (p) => p.y === 0 && p.s > 200 && !oval.pts.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 16),
);
const layoutIs = (page: Page, key: string) =>
  page.waitForFunction((k) => (window as any).__yutopia.room.state.karts.get("park").layout === k, key, {
    timeout: 10_000,
  });

for (const view of ["3p"] as const)
  test(`the board of the circuits in ${view}: the panel, a track set, the board and Rosa`, async ({ page }) => {
    test.setTimeout(200_000);
    if (!board) throw new Error("no board");
    await page.addInitScript((v) => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase" }));
    }, view);
    await enter(page, await token(ANA));
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    await page.evaluate(() => (window as any).__yutopia.room.send("park:stand", {}));
    // (from the Figure Eight)
    await page.evaluate(() => (window as any).__yutopia.room.send("kart:layout", { layout: "eight" }));
    await layoutIs(page, "eight");
    // in front of the board
    await page.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), G(board.x, board.z + 1.8));
    await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "kart:circuits", null, {
      timeout: 30_000,
    });
    await page.waitForTimeout(3000);
    await shot(page, `kart-circuits-${view}-board`);
    try {
      await page.keyboard.press("x");
      const panel = page.locator("[data-circuits]");
      await expect(panel).toBeVisible();
      await expect(panel.locator("button[data-pick]")).toHaveCount(4);
      // the cards' maps drawn (not blank)
      const inked = await page.evaluate(() =>
        [...document.querySelectorAll("[data-circuits] canvas[data-map]")].map((c) => {
          const cv = c as HTMLCanvasElement;
          const d = (cv.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, cv.width, cv.height).data;
          let lit = 0;
          for (let i = 0; i < d.length; i += 16) if (d[i] > 200 && d[i + 1] > 200) lit++;
          return lit;
        }),
      );
      expect(Math.min(...inked), `the maps: ${inked}`).toBeGreaterThan(50);
      await expect(panel.locator("button[data-pick]", { hasText: "RACING NOW" })).toHaveCount(1);
      await expect(panel.locator("button[data-pick='eight']", { hasText: "RACING NOW" })).toHaveCount(1);
      await panel.locator("button[data-pick='oval']").click();
      await shot(page, `kart-circuits-${view}-panel`);
      await panel.locator("button[data-go='set']").click();
      await layoutIs(page, "oval");
      // the show: the park shut, the ploughs out, the panel saying so
      await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").showing, null, {
        timeout: 5000,
      });
      await expect(panel.locator("text=The ploughs are out")).toBeVisible();
      await page.waitForFunction(
        () => [0, 1, 2, 3].every((k) => (window as any).__yutopia.room.state.vehicles.get(`kart-plough-${k}`)?.shown),
        null,
        { timeout: 5000 },
      );
      await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").show > 0.4, null, {
        timeout: 10_000,
      });
      if (view === "3p") {
        // the new circuit drawn so far: its road part way, every quarter
        const part = await page.evaluate(() => {
          // (the new one's lifted over the old till the show's done: grounds3d.ts showBegin)
          const s = (window as any).__yutopia.tp.scene;
          let out = -1;
          s.traverse((o: any) => {
            if (o.name !== "kart-circuit" || o.position.y < 0.01) return;
            o.traverse((m: any) => {
              const n = m.geometry?.index?.count;
              if (m.userData?.reveal && n && out < 0) out = Math.min(m.geometry.drawRange.count, n) / n;
            });
          });
          return { part: out };
        });
        console.log(`[kart-circuits] the show half way: the road drawn ${part.part.toFixed(2)}`);
        expect(part.part).toBeGreaterThan(0.2);
        expect(part.part).toBeLessThan(0.98);
        // the bridge sinking under the snow
        const sunk = await page.evaluate(() => {
          const b = (window as any).__yutopia.tp.scene.getObjectByName("kart-bridge");
          return b?.visible ? b.position.y : null;
        });
        console.log(`[kart-circuits] the show half way: the bridge at ${sunk?.toFixed(1)} m`);
        expect(sunk).not.toBeNull();
        expect(sunk as number).toBeLessThan(-1);
        expect(sunk as number).toBeGreaterThan(-7);
      }
      await shot(page, `kart-circuits-${view}-show`);
      await showOver(page);
      await page.waitForFunction(
        () => /Oval/.test((window as any).__yutopia.room.state.npcs.get("folk-rosa")?.say ?? ""),
        null,
        { timeout: 10_000 },
      );
      // no bridge on the Oval: the land where its span stood, walked on, its guard strips too
      const gone = await page.evaluate(
        ([p, o]) => {
          const G = (window as any).__yutopia.G;
          const x = p.x + Math.sin(p.a) * o;
          const z = p.z - Math.cos(p.a) * o;
          return {
            up: G.heightAt(p.x, p.z) - G.landAt(p.x, p.z),
            strip: G.walkableTile(Math.floor(x), Math.floor(z)),
            drawn: (window as any).__yutopia.tp?.scene.getObjectByName("kart-bridge")?.visible ?? null,
          };
        },
        [eight.pts[eight.cross.over], TRACK_W / 2 + 1.2] as const,
      );
      expect(gone.up, "the land where the span was").toBeLessThan(0.1);
      expect(gone.strip, "its guard strip walked").toBe(true);
      if (view === "3p") expect(gone.drawn, "the bridge drawn").toBe(false);
      if (view === "3p") {
        // where the bridge's ramp came down by the start straight (the grid's back, looking up it)
        const grid = await page.evaluate((g) => {
          const tp = (window as any).__yutopia.tp;
          const fr = tp.groundsFrame();
          const cam = tp.camera.clone();
          cam.position.set(g.x - Math.cos(g.a) * 6 - fr.x, 3 + fr.y, g.z - Math.sin(g.a) * 6 - fr.z);
          cam.lookAt(g.x + Math.cos(g.a) * 40 - fr.x, 1 + fr.y, g.z + Math.sin(g.a) * 40 - fr.z);
          cam.updateMatrixWorld();
          tp.renderer.render(tp.scene, cam);
          return tp.renderer.domElement.toDataURL("image/png") as string;
        }, oval.grid[7]);
        if (dir) writeFileSync(`${dir}/kart-circuits-3p-oval-grid.png`, Buffer.from(grid.split(",")[1], "base64"));
        // the board's face and the desk's strip say it
        await page.waitForFunction(
          () => {
            const s = (window as any).__yutopia.tp.scene;
            const f = s.getObjectByName("kart-circuits")?.userData.sig ?? "";
            const d = s.getObjectByName("kart-desk-vfd")?.userData.sig ?? "";
            return f.startsWith("ovalfalse") && /OVAL/.test(d);
          },
          null,
          { timeout: 10_000 },
        );
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await page.waitForTimeout(1500);
        await shot(page, `kart-circuits-3p-board-oval`);
        // a close look at the face, from the 3D view's renderer
        const url = await page.evaluate((b) => {
          const tp = (window as any).__yutopia.tp;
          const fr = tp.groundsFrame();
          const cam = tp.camera.clone();
          cam.position.set(b.x - fr.x, 3.6 + fr.y, b.z + 3.4 - fr.z);
          cam.lookAt(b.x - fr.x, 3.5 + fr.y, b.z - fr.z);
          cam.updateMatrixWorld();
          tp.renderer.render(tp.scene, cam);
          return tp.renderer.domElement.toDataURL("image/png") as string;
        }, board);
        if (dir) writeFileSync(`${dir}/kart-circuits-3p-face.png`, Buffer.from(url.split(",")[1], "base64"));
        await page.keyboard.press("x");
      }
      // where the Figure Eight's asphalt was: snow underfoot, and to look at (3D)
      if (!lost) throw new Error("no stretch of the Figure Eight's own");
      await page.keyboard.press("Escape");
      const at = G(lost.x, lost.z);
      await page.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), at);
      await page.waitForFunction(
        (q) => {
          const w = (window as any).__yutopia;
          const m = w.room.state.players.get(w.room.sessionId);
          return !!m && Math.hypot(m.x - q.x, m.y - q.y) < 2;
        },
        at,
        { timeout: 20_000 },
      );
      await page.waitForTimeout(3000);
      const under = await page.evaluate(
        (q) => (window as any).__yutopia.G.surfaceTileAt(Math.floor(q.x), Math.floor(q.z)),
        lost,
      );
      expect(under, "underfoot where the Figure Eight was").not.toBe("asphalt");
      if (view === "3p") {
        // straight down on it from the view's own renderer: the snow's white, not asphalt's grey
        const [lum, road] = await page.evaluate(
          ([a, b]) => {
            const tp = (window as any).__yutopia.tp;
            const fr = tp.groundsFrame();
            const r = tp.renderer;
            const look = (p: { x: number; z: number }) => {
              const cam = tp.camera.clone();
              cam.position.set(p.x - fr.x, 30 + fr.y, p.z - fr.z + 0.01);
              cam.lookAt(p.x - fr.x, fr.y, p.z - fr.z);
              cam.updateMatrixWorld();
              r.setRenderTarget(null);
              r.render(tp.scene, cam);
              const gl = r.getContext();
              const px = new Uint8Array(4);
              gl.readPixels(
                gl.drawingBufferWidth >> 1,
                gl.drawingBufferHeight >> 1,
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                px,
              );
              return (px[0] + px[1] + px[2]) / 3;
            };
            return [look(a), look(b)];
          },
          // (a few metres on from where I stand: not my own head)
          [eight.pts[(lost.s + 5) % eight.len], oval.pts[Math.floor(oval.len / 2)]],
        );
        console.log(
          `[kart-circuits] where the Figure Eight was: ${Math.round(lum)}; the Oval's road: ${Math.round(road)}`,
        );
        expect(lum, "snow where the Figure Eight was").toBeGreaterThan(road + 40);
      }
      await shot(page, `kart-circuits-${view}-old-road`);
      // back to the Figure Eight, from the panel
      await page.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), G(board.x, board.z + 1.8));
      await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "kart:circuits", null, {
        timeout: 30_000,
      });
      await page.keyboard.press("x");
      await panel.locator("button[data-pick='eight']").click();
      await panel.locator("button[data-go='set']").click();
      await layoutIs(page, "eight");
      await showOver(page);
      // the bridge back up
      const back = await page.evaluate((p) => {
        const w = (window as any).__yutopia;
        const b = w.tp?.scene.getObjectByName("kart-bridge");
        return { up: w.G.heightAt(p.x, p.z) - w.G.landAt(p.x, p.z), drawn: b ? b.visible && b.position.y === 0 : null };
      }, eight.pts[eight.cross.over]);
      expect(back.up, "the span's deck").toBeGreaterThan(5);
      if (view === "3p") expect(back.drawn, "the bridge drawn").toBe(true);
    } finally {
      await showOver(page).catch(() => {});
      await page.evaluate(() => (window as any).__yutopia.room.send("kart:layout", { layout: "eight" }));
      await layoutIs(page, "eight").catch(() => {});
      await showOver(page).catch(() => {});
    }
  });
