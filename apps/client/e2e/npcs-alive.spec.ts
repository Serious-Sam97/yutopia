/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */

import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import type { NpcDef } from "@yutopia/shared/npc";
import { ANA, API, loaded, makeDraft, test, token } from "./helpers";

// NPCs alive (docs/plan/123-npcs-alive.md) on the dev stack, as Ana: two of the cast made for this — Bea, a barista
// at work behind house-w0's counter in her shift (F2a), and Tom out by the houses — published; Bea's menu (F4c) asked
// of the server and opened, an order taken and a cup handed over; her card (F8b) with its needs' bars; talked to till
// she's an acquaintance, a hug; rain called — Tom's umbrella open over him (F9a). Stills of each to the scratch dir
// (YUTOPIA_SHOTS). Rolled back, the NPCs and the draft deleted, the weather back to its schedule.
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const SHOTS = process.env.YUTOPIA_SHOTS ?? "";
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
// (a together act seen from the side: a camera of its own, square on to the line between the two)
const sideShot = async (page: Page, name: string, a: string, b: string) => {
  if (!SHOTS) return;
  const data = await page.evaluate(
    ([ia, ib]) => {
      const y = (window as any).__yutopia;
      const t = y.tp;
      const pa = t.people3.get(ia)?.root;
      const pb = t.people3.get(ib)?.root;
      if (!pa || !pb) return `missing|${[...(t.people3?.keys?.() ?? [])].slice(0, 12).join(",")}|${ia}|${ib}`;
      const A = pa.getWorldPosition(pa.position.clone());
      const B = pb.getWorldPosition(pb.position.clone());
      const mx = (A.x + B.x) / 2;
      const mz = (A.z + B.z) / 2;
      // (one alone — a and b the same —: seen square on from beside them, across the world's x)
      const one = ia === ib;
      const dx = one ? 1 : B.x - A.x;
      const dz = one ? 0 : B.z - A.z;
      const d = Math.hypot(dx, dz) || 1;
      const cam = t.camera.clone();
      cam.fov = 40;
      cam.aspect = 16 / 9;
      cam.updateProjectionMatrix();
      cam.position.set(mx + (-dz / d) * 2.8, A.y + 1.35, mz + (dx / d) * 2.8);
      cam.lookAt(mx, A.y + 1.05, mz);
      cam.updateMatrixWorld();
      t.renderer.render(t.scene, cam);
      return `${Math.hypot(dx, dz).toFixed(2)}|${t.renderer.domElement.toDataURL("image/png")}`;
    },
    [a, b] as const,
  );
  if (data.startsWith("missing|")) return console.log(`[${name}] not drawn: ${data}`);
  const [gap, url] = data.split("|");
  console.log(`[${name}] drawn ${gap} m apart`);
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(url.split(",")[1], "base64"));
};
const json = (tok: string) => ({
  Authorization: `Bearer ${tok}`,
  Accept: "application/json",
  "Content-Type": "application/json",
});
const Y = (page: Page, f: string) => page.evaluate(f);
const npcOf = (page: Page, id: string) =>
  page.evaluate((i) => {
    const n = (window as any).__yutopia.room.state.npcs.get(i);
    return n ? { x: n.x, y: n.y, level: n.level, held: n.held, act: n.act, say: n.say, want: n.want } : null;
  }, id);
const me = (page: Page) =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const p = y.room.state.players.get(y.room.sessionId);
    return { held: p.held, act: p.act, level: p.level };
  });

test("NPCs alive: a barista at work, her menu and an order, her card, a hug; an umbrella in the rain", async ({
  page,
}) => {
  test.setTimeout(300_000);
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  const tok = await token(ANA);
  const make = async (name: string) =>
    (
      (await (
        await fetch(`${API}/api/admin/npcs`, {
          method: "POST",
          headers: json(tok),
          body: JSON.stringify({
            npc: {
              name,
              behaviour: { type: "stand", answer: true, talk: "never", traits: { outgoing: 1, cheerful: 1 } },
            },
          }),
        })
      ).json()) as { npc: NpcDef }
    ).npc.key;
  let bea = "";
  let tom = "";
  let wes = "";
  let draftId = 0;
  let rev0 = -1;
  let published = false;
  // (what the shared world had before: an hour or a sky someone called, where Ana stood — put back after)
  let had: { hour: number | null; sky: string | null; x: number; y: number; level: number } | null = null;
  try {
    bea = await make("E2E Bea");
    tom = await make("E2E Tom");
    wes = await make("E2E Wes");
    await page.addInitScript((t) => {
      localStorage.setItem("yutopia:token", t);
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
    }, tok);
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 120_000 });
    await loaded(page);
    // house-w0's ground storey, its middle: Bea's spot (facing +x: her customers come to her from there)
    const f = await page.evaluate(() => {
      const s = (window as any).__yutopia.structure;
      const q = s.floors.find((x: any) => x.space === "house-w0" && !x.storey);
      return { level: q.index, x: q.grid.x0 + q.grid.w / 2, z: q.grid.y0 + q.grid.h / 2 };
    });
    // the diner's floor, its middle: Wes's, waiting its tables
    const dn = await page.evaluate(() => {
      const s = (window as any).__yutopia.structure;
      const q = s.floors.find((x: any) => x.space === "diner" && !x.storey);
      return { level: q.index, x: q.grid.x0 + q.grid.w / 2, z: q.grid.y0 + q.grid.h / 2 };
    });
    // the town's umbrella stands, in by the bar's, the diner's and the market's doors (plan 123's leftovers)
    const stands = await page.evaluate(
      () =>
        [...(window as any).__yutopia.room.state.objects.values()].filter((o: any) => o.kind === "umbrella_stand")
          .length,
    );
    expect(stands, "umbrella stands in the town").toBeGreaterThanOrEqual(3);
    had = await page.evaluate(() => {
      const y = (window as any).__yutopia;
      const st = y.room.state;
      const p = st.players.get(y.room.sessionId);
      return {
        hour: st.hourBy ? Number(st.hour) : null,
        sky: st.weather?.by ? st.weather.to || null : null,
        x: p.x,
        y: p.y,
        level: p.level,
      };
    });
    rev0 = await page.evaluate(() => (window as any).__yutopia.room.state.groundsRev);
    // (by day for the stills: 13:00, the real hour again after)
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 13 }));
    await expect.poll(() => Y(page, "Math.floor(__yutopia.room.state.hour)"), { timeout: 10_000 }).toBe(13);
    const hour = 13;
    draftId = await makeDraft(tok, "e2e: npcs alive", (e: any) => ({
      ...e,
      npcs: {
        ...(e.npcs ?? {}),
        add: [
          ...(e.npcs?.add ?? []),
          {
            key: bea,
            x: 417,
            z: -446,
            a: 0,
            level: 0,
            work: {
              building: "house-w0",
              job: "barista",
              spot: "counter",
              x: f.x,
              z: f.z,
              a: 0,
              level: f.level,
              from: (hour + 23) % 24,
              to: (hour + 3) % 24,
            },
          },
          { key: tom, x: 418, z: -436, a: 0, level: 0 },
          {
            key: wes,
            x: dn.x,
            z: dn.z,
            a: 0,
            level: dn.level,
            work: {
              building: "diner",
              job: "waiter",
              spot: "floor",
              x: dn.x,
              z: dn.z,
              a: 0,
              level: dn.level,
              from: (hour + 23) % 24,
              to: (hour + 3) % 24,
            },
          },
        ],
      },
    }));
    await page.evaluate(
      (d) => (window as any).__yutopia.room.send("god:publish", { draftId: d, note: "e2e: npcs alive" }),
      draftId,
    );
    published = true;
    await expect.poll(() => Y(page, "__yutopia.room.state.groundsRev"), { timeout: 30_000 }).toBe(rev0 + 1);
    // Bea: in her shift, to her spot inside
    await expect
      .poll(
        async () => {
          const b = await npcOf(page, `place:${bea}`);
          return !!b && b.level === f.level && Math.hypot(b.x - f.x, b.y - f.z) < 1.3;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    // me at her counter
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: f.x + 1.4, y: f.z, level: f.level });
    await expect.poll(() => me(page).then((m) => m.level), { timeout: 20_000 }).toBe(f.level);
    await page.waitForTimeout(2500);
    await loaded(page);
    // her menu: asked of the server, opened with what I can do with her — an order among it
    await page.evaluate(
      (id) => (window as any).__yutopia.menu.openMenu({ type: "npc", id }, { x: 640, y: 380 }),
      `place:${bea}`,
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__hud.get().menu?.items.map((i: any) => i.act) ?? []), {
        timeout: 10_000,
      })
      .toContain("npc_order");
    await page.waitForTimeout(400);
    await shot(page, "123-menu");
    await page.evaluate(() => (window as any).__yutopia.menu.pickAction("npc_order"));
    // the order made (her act) and handed over: a cup in my hand
    await expect.poll(() => npcOf(page, `place:${bea}`).then((b) => b?.act), { timeout: 15_000 }).toBe("make");
    await shot(page, "123-making");
    await expect.poll(() => me(page).then((m) => m.held), { timeout: 30_000 }).toBe("mug");
    // her card: who she is, her needs as bars, her work
    await page.evaluate(() => (window as any).__hud.set({ npcAbout: null }));
    await page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "npc", objectId: id } }), `place:${bea}`);
    await expect(page.locator(`[data-npc-card="place:${bea}"]`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`[data-npc-card="place:${bea}"] [data-npc-need]`)).toHaveCount(6);
    await expect(page.locator(`[data-npc-card="place:${bea}"]`)).toContainText(/house-w0/);
    await shot(page, "123-card");
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    // talked to a few times: an acquaintance — a hug on offer (not at her counter: Tom's, outside)
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: 419, y: -436, level: 0 });
    await expect.poll(() => me(page).then((m) => m.level), { timeout: 20_000 }).toBe(0);
    await page.waitForTimeout(2500);
    await loaded(page);
    const t0 = await npcOf(page, `place:${tom}`);
    expect(t0).not.toBeNull();
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), {
      x: (t0?.x ?? 418) + 1,
      y: t0?.y ?? -436,
      level: 0,
    });
    await page.waitForTimeout(1500);
    for (const act of ["talk", "ask_day", "compliment"]) {
      await page.evaluate(([id, a]) => (window as any).__yutopia.room.send("npc:act", { id, act: a }), [
        `place:${tom}`,
        act,
      ] as const);
      await page.waitForTimeout(1800);
    }
    await page.evaluate((id) => (window as any).__yutopia.room.send("npc:about", { id }), `place:${tom}`);
    await expect
      .poll(() => page.evaluate(() => (window as any).__hud.get().npcAbout?.acts ?? []), { timeout: 10_000 })
      .toContain("hug");
    await page.evaluate((id) => (window as any).__yutopia.room.send("npc:act", { id, act: "hug" }), `place:${tom}`);
    await expect
      .poll(() => npcOf(page, `place:${tom}`).then((t) => t?.act ?? ""), { timeout: 5000 })
      .toMatch(/hug|refuse/);
    await page.waitForTimeout(1100);
    await shot(page, "123-hug");
    const sid = await page.evaluate(() => (window as any).__yutopia.room.sessionId);
    await sideShot(page, "123-hug-side", sid, `npc:place:${tom}`);
    // a handshake, seen from the side too
    await page.waitForTimeout(2600);
    await page.evaluate(
      (id) => (window as any).__yutopia.room.send("npc:act", { id, act: "handshake" }),
      `place:${tom}`,
    );
    await expect
      .poll(() => npcOf(page, `place:${tom}`).then((t) => t?.act ?? ""), { timeout: 5000 })
      .toMatch(/handshake|refuse/);
    await page.waitForTimeout(900);
    await sideShot(page, "123-handshake-side", sid, `npc:place:${tom}`);
    // a friend's (an admin's bond set outright: plan 123's leftovers): a kiss on the cheek, from the side
    await page.waitForTimeout(2200);
    await page.evaluate((id) => (window as any).__yutopia.room.send("mod:npcBond", { id, v: 50 }), `place:${tom}`);
    await expect
      .poll(() => page.evaluate(() => (window as any).__hud.get().npcAbout?.acts ?? []), { timeout: 10_000 })
      .toContain("kiss");
    await page.evaluate((id) => (window as any).__yutopia.room.send("npc:act", { id, act: "kiss" }), `place:${tom}`);
    await expect
      .poll(() => npcOf(page, `place:${tom}`).then((t) => t?.act ?? ""), { timeout: 5000 })
      .toMatch(/kiss|refuse/);
    await page.waitForTimeout(750);
    await sideShot(page, "123-kiss-side", sid, `npc:place:${tom}`);
    // rain called: Tom's umbrella open over him
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:weather", { to: "rain", now: true }));
    await expect.poll(() => npcOf(page, `place:${tom}`).then((t) => t?.held), { timeout: 15_000 }).toBe("umbrella");
    await page.waitForTimeout(2500);
    await shot(page, "123-umbrella");
    // the diner: Wes waiting its tables — my order taken where I stand, a plate carried out to me
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: dn.x + 3, y: dn.z, level: dn.level });
    await expect.poll(() => me(page).then((m) => m.level), { timeout: 20_000 }).toBe(dn.level);
    await page.waitForTimeout(2500);
    await loaded(page);
    await expect
      .poll(() => npcOf(page, `place:${wes}`).then((w) => !!w && w.level === dn.level), { timeout: 30_000 })
      .toBe(true);
    // (hands free to take it — Bea's cup put down —, up to him: an order's asked within reach)
    await page.evaluate(() => (window as any).__yutopia.room.send("item:drop", {}));
    await expect.poll(() => me(page).then((m) => m.held), { timeout: 10_000 }).toBe("");
    // (he walks the floor between tables: up to him where he is, asked; again if he'd walked on out of reach)
    let taken = false;
    for (let i = 0; i < 4 && !taken; i++) {
      const w0 = await npcOf(page, `place:${wes}`);
      await page.evaluate((p) => (window as any).__yutopia.teleport(p), {
        x: (w0?.x ?? dn.x) + 1.2,
        y: w0?.y ?? dn.z,
        level: dn.level,
      });
      await page.waitForTimeout(1200);
      await page.evaluate((id) => (window as any).__yutopia.room.send("npc:act", { id, act: "order" }), `place:${wes}`);
      taken = await expect
        .poll(() => npcOf(page, `place:${wes}`).then((w) => w?.act === "chat" || w?.act === "make" || !!w?.say), {
          timeout: 6000,
        })
        .toBe(true)
        .then(
          () => true,
          () => false,
        );
    }
    expect(taken, "Wes took my order").toBe(true);
    await expect.poll(() => npcOf(page, `place:${wes}`).then((w) => w?.held), { timeout: 45_000 }).toBe("plate");
    await page.waitForTimeout(600);
    await sideShot(page, "123-waiter-side", `npc:place:${wes}`, `npc:place:${wes}`);
    await expect.poll(() => npcOf(page, `place:${wes}`).then((w) => w?.held), { timeout: 30_000 }).toBe("");
  } finally {
    // (each step on its own: one failing never leaves the rest of the shared world as the test had it)
    const send = (type: string, msg: unknown) =>
      page.evaluate(([t, m]) => (window as any).__yutopia?.room?.send(t, m), [type, msg] as const).catch(() => {});
    await send("mod:weather", { to: had?.sky ?? null });
    await send("mod:hour", { h: had?.hour ?? null });
    await send("item:drop", {});
    // (a publish sent may land late: waited for before deciding — ours rolled back, one of someone else's left be)
    let revNow = await Y(page, "__yutopia.room.state.groundsRev").catch(() => -1);
    if (published && rev0 >= 0 && revNow === rev0)
      revNow = await expect
        .poll(() => Y(page, "__yutopia.room.state.groundsRev").catch(() => rev0), { timeout: 30_000 })
        .not.toBe(rev0)
        .then(
          () => Y(page, "__yutopia.room.state.groundsRev").catch(() => -1),
          () => rev0,
        );
    if (rev0 >= 0 && revNow === rev0 + 1) {
      await send("god:rollback", { rev: rev0 });
      await expect
        .poll(() => Y(page, "__yutopia.room.state.groundsRev").catch(() => -1), { timeout: 30_000 })
        .toBe(rev0 + 2)
        .catch((e) => console.log(`[cleanup] the rollback to ${rev0} didn't land: ${e}`));
    } else if (rev0 >= 0 && revNow !== rev0)
      console.log(`[cleanup] the world's at ${revNow}, not ${rev0 + 1}: roll back to ${rev0} by hand if it's ours`);
    if (had) await page.evaluate((p) => (window as any).__yutopia?.teleport(p), had).catch(() => {});
    for (const k of [bea, tom, wes])
      if (k) await fetch(`${API}/api/admin/npcs/${k}`, { method: "DELETE", headers: json(tok) }).catch(() => {});
    if (draftId)
      await fetch(`${API}/api/admin/grounds/drafts/${draftId}`, { method: "DELETE", headers: json(tok) }).catch(
        () => {},
      );
  }
});
