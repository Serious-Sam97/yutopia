/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, holdCamera, test, token } from "./helpers";

// Phase 0 of docs/plan/51-the-pet.md: the HUD's mocks. The stills (/dev/grounds?shot=pet-…) with the new
// HUD laid over them in the game's own classes (the dev pages share its stylesheet): the name tags and the
// lost pet's "?" where the still says its pets' heads are (window.__g.tags), the toasts, the car's chip.
// Then the pet panel in the game itself, its new lines put in. Saved to design/screens/pet/.
// YUTOPIA_GPU=1 npx playwright test pet-shots
if (process.env.YUTOPIA_GPU)
  test.use({
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
  });
test.use({ viewport: { width: 1600, height: 900 } });
const OUT = "../../design/screens/pet";

type Tag = { name: string; lost: boolean; x: number; y: number };
/** A still drawn, the mock's HTML over it (given the pets' tags), saved. */
async function still(page: Page, shot: string, html: (tags: Tag[]) => string, name: string) {
  await page.goto(`/dev/grounds?shot=${shot}`);
  await page.waitForFunction(() => (window as any).__shot === true, null, { timeout: 180_000 });
  const tags = (await page.evaluate(() => (window as any).__g.tags ?? [])) as Tag[];
  await page.evaluate((h) => {
    document.querySelector("[data-status]")?.remove();
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:50;font-family:inherit";
    d.innerHTML = h;
    document.body.appendChild(d);
  }, NOTE_CSS + html(tags));
  await page.waitForTimeout(400);
  await hideDev(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
/** The dev server's own badge, out of the picture. */
const hideDev = (page: Page) =>
  page.evaluate(() => {
    for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
  });

// the mocks' notes: numbered paper cards, as the earlier plans' mocks
const NOTE_CSS = `<style>
.mk-note{position:absolute;max-width:270px;padding:9px 12px 10px;border-radius:8px;background:#f3ead6;color:#2a1a12;
  font:500 13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.mk-note b{font-weight:700}
.mk-note .n{display:inline-grid;place-items:center;width:20px;height:20px;margin:0 7px 0 -2px;border-radius:50%;
  background:#b5562f;color:#fff3e0;font:700 11px Inter,system-ui,sans-serif;vertical-align:1px}
</style>`;
const note = (n: number, x: number, y: number, html: string, w = 270) =>
  `<div class="mk-note" style="left:${x}px;top:${y}px;max-width:${w}px"><span class="n">${n}</span>${html}</div>`;

// ── the game's own pieces, as their markup ──
const COAT = "#d9a349"; // Rex's coat: a pet's tag dot (tp/view.ts drawTags)
/** A name tag over a head (tp/view.ts makeTag), with what's over it (the emote's slot). */
const tag = (t: Tag | undefined, label: string, over = "") =>
  t
    ? `<div style="position:absolute;left:${t.x}px;top:${t.y}px;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:3px">
  ${over}
  <div style="display:flex;align-items:center;gap:6px;height:18px;padding:0 9px 0 7px;border-radius:9px;background:rgba(30,23,18,.78);color:#efe4cc;font:12px/18px 'Share Tech Mono',ui-monospace,monospace;letter-spacing:.3px;white-space:nowrap">
    <span style="width:6.4px;height:6.4px;border-radius:50%;background:${COAT}"></span><span>${label}</span></div></div>`
    : "";
/** A lost pet's "?": a want token in the emotes' hand (art/emotes.ts: the bubble, an ink mark). */
const ASK = `<svg viewBox="0 0 64 64" width="38" height="38"><defs>
<linearGradient id="g-bubble" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fbf4e3"/><stop offset="1" stop-color="#e3d6b8"/></linearGradient></defs>
<path d="M10 3 H54 Q61 3 61 10 V43 Q61 50 54 50 H38.5 L32 57.5 L25.5 50 H10 Q3 50 3 43 V10 Q3 3 10 3 Z" fill="url(#g-bubble)" stroke="#2a1a12" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M8 9 Q8.6 6 12 6 H30" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
<path d="M23 19 Q23 10 32 10 Q41 10 41 18 Q41 23 35.5 26 Q32 28 32 33" fill="none" stroke="#2a1a12" stroke-width="7.5" stroke-linecap="round"/>
<path d="M23 19 Q23 10 32 10 Q41 10 41 18 Q41 23 35.5 26 Q32 28 32 33" fill="none" stroke="#c4402b" stroke-width="4" stroke-linecap="round"/>
<circle cx="32" cy="41.5" r="4.6" fill="#2a1a12"/><circle cx="32" cy="41.5" r="2.6" fill="#c4402b"/></svg>`;
/** A toast (Overlays.tsx Toasts): top middle. */
const toast = (text: string, tone: "info" | "warn" = "info", top = 96) =>
  `<div style="position:absolute;left:50%;top:${top}px;transform:translateX(-50%)"><div class="toast" data-tone="${tone}">${text}</div></div>`;
const PAW = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#e8a33d"><ellipse cx="12" cy="16" rx="5.2" ry="4.4"/>
<ellipse cx="5.6" cy="10.4" rx="2.2" ry="2.8"/><ellipse cx="9.6" cy="6.6" rx="2.2" ry="2.8"/><ellipse cx="14.4" cy="6.6" rx="2.2" ry="2.8"/><ellipse cx="18.4" cy="10.4" rx="2.2" ry="2.8"/></svg>`;
/** A chip over the prompt (as the held thing's): bottom middle. */
const chip = (icon: string, label: string, hint: string, bottom = 144) => `
<div class="cabinet rounded-full pl-1.5 pr-4 py-1 flex items-center gap-2.5" style="position:absolute;left:50%;transform:translateX(-50%);bottom:${bottom}px">
  <span class="w-8 h-8 rounded-full grid place-items-center shrink-0" style="background:radial-gradient(#4a3324,#241912);border:1px solid var(--edge)">${icon}</span>
  <span class="text-sm">${label}</span>
  <span class="mono text-[11px] whitespace-nowrap" style="color:var(--muted)">· ${hint}</span>
</div>`;
/** The use prompt (Overlays.tsx): bottom middle. */
const prompt = (thumb: string, label: string, hint = "press to use", bottom = 88) => `
<div class="cabinet rounded-full pl-1.5 pr-4 py-1.5 flex items-center gap-2.5" style="position:absolute;left:50%;transform:translateX(-50%);bottom:${bottom}px">
  <span class="w-9 h-9 rounded-full grid place-items-center shrink-0 p-1" style="background:radial-gradient(#4a3324,#241912);border:1px solid var(--edge)">${thumb}</span>
  <kbd class="keycap" style="color:var(--cream);opacity:1;height:20px;min-width:20px;font-size:11px">X</kbd>
  <span class="text-sm">${label}</span>
  <span class="mono text-[11px] whitespace-nowrap" style="color:var(--muted)">· ${hint}</span>
</div>`;
const rex = (tags: Tag[]) => tags.find((t) => t.name === "Rex");

test("the pet's HUD mocks over the stills: in the car, left behind, lost, found, waiting", async ({ page }) => {
  test.setTimeout(600_000);

  // ── the owner in the car, the door held for it ──
  await still(
    page,
    "pet-board",
    (t) =>
      tag(rex(t), "Rex") +
      chip(PAW, "Waiting for Rex…", "he's coming to the door") +
      note(
        1,
        1150,
        470,
        "<b>Get in with your pet near</b> (15 m) and it runs to the nearest free door and hops in, 1–3 s. The chip says so; <b>Rex is in</b> when he is.",
      ) +
      note(
        2,
        1150,
        630,
        "<b>Drive off first</b> and he can't get in (slower than walking only, as a person): he runs after the car.",
      ),
    "hud-board",
  );

  // ── driven off without it ──
  await still(
    page,
    "pet-left",
    (t) =>
      tag(rex(t), "Rex") +
      toast("You drove off without Rex.", "warn") +
      note(
        1,
        60,
        600,
        "<b>Too far</b>: more than 60 m behind the car for 20 s and Rex is <b>lost</b>. Stop and wait, or come back for him, and he catches up and gets in.",
        330,
      ),
    "hud-left",
  );

  // ── lost, by day: the "?" over it, wandering the woods ──
  await still(
    page,
    "pet-lost-day",
    (t) =>
      tag(rex(t), "Rex · Ana's", ASK) +
      toast("Rex is lost — last seen on the ravine trail.", "warn") +
      note(
        1,
        1080,
        360,
        "<b>Lost</b>: he wanders off in legs of 10–40 m, sniffing and whining, a <b>?</b> over his head. He doesn't come to strangers; someone he knows can lead him.",
        320,
      ) +
      note(
        2,
        1080,
        530,
        "<b>What can kill him</b>: hunger and thirst (no bowls out here; ~1.5 days from full), a car hitting him (twice), the deep woods, the river's ice, the county road past the closure.",
        320,
      ),
    "hud-lost-day",
  );

  // ── lost, at night: under the one lamp ──
  await still(
    page,
    "pet-lost-night",
    (t) =>
      tag(rex(t), "Rex · Ana's", ASK) +
      note(
        1,
        1080,
        560,
        "<b>Cold at night</b>: outside after dark and out of every lamp's pool, he loses health (~60 a night; two nights kill him). A lamp or a building is shelter — sometimes he finds one.",
        330,
      ),
    "hud-lost-night",
  );

  // ── found ──
  await still(
    page,
    "pet-found",
    (t) =>
      tag(rex(t), "Rex") +
      toast("You found Rex!") +
      note(
        1,
        60,
        620,
        "<b>Found</b>: his owner within 8 m and in sight (or heard calling <b>Come</b> within 30 m): he runs to them, happy, and follows again.",
        330,
      ),
    "hud-found",
  );

  // ── its owner gone home: waiting where it was left; Bia passing ──
  await still(
    page,
    "pet-waiting",
    (t) =>
      tag(rex(t), "Rex · Ana's") +
      prompt(PAW, "Feed Rex · <b>Ana's away</b>", "a snack") +
      note(
        1,
        1150,
        330,
        "<b>Ana logged off.</b> Rex stays where she left him, for everyone to see: sitting, sniffing round, asleep when tired. His tag says whose he is.",
      ) +
      note(
        2,
        1150,
        500,
        "<b>While she's away</b> anyone near can pet, feed and water him. Her next login, he's still here — the panel and the GPS say where.",
      ),
    "hud-waiting",
  );
});

// The panel in the game: Rex adopted for the shot (let go at the end), in a private room taken for
// Ana's office (the dev world has no owned room: the War Room, named hers in the mock).
const pets = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return [...w.room.state.pets.values()].map((p: any) => ({ id: p.id, mine: p.sid === w.room.sessionId }));
  });
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
const release = async (page: Page) => {
  for (const p of await pets(page)) if (p.mine) await send(page, "pet:release", { id: p.id });
};

test("the pet panel's mocks in the game: where it is, waiting in the office", async ({ page }) => {
  test.setTimeout(240_000);
  await enter(page, await token(ANA));
  try {
    await release(page); // (a run that died halfway)
    await send(page, "pet:adopt", {
      species: "dog",
      name: "Rex",
      look: { breed: "beagle", color: COAT, mark: "patch", markColor: "#efe4cc" },
    });
    await expect.poll(async () => (await pets(page)).filter((p) => p.mine).length).toBe(1);
    // into the War Room (Ana's office, in the mock)
    await send(page, "teleport", { to: { x: 41, y: 6 } });
    await page.waitForTimeout(3000);
    const at = (await page.evaluate(() => (window as any).__yutopia.meTile())) as { x: number; y: number };
    await holdCamera(page, { at, yaw: -Math.PI * 0.6, pitch: 0.55, dist: 7 });
    await page.waitForTimeout(2500);
    // the top bar: the room as hers
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("header *, [data-topbar] *"))
        if (el.childElementCount === 0 && el.textContent === "War Room") el.textContent = "Ana's office";
    });
    // ── the panel: where he is, and "Wait in my office" ──
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "pets" } }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      // the name plate's line: how it is, and where
      for (const el of document.querySelectorAll("*"))
        if (el.childElementCount === 0 && /following you/i.test(el.textContent ?? ""))
          el.textContent = "Happy · with you · Ana's office";
      // over the meters: where it is, and the office's command (only in your own room)
      const grp = [...document.querySelectorAll(".grp")].find((g) => /how it/i.test(g.textContent ?? ""));
      const col = grp?.parentElement?.parentElement;
      if (!col) return;
      const row = document.createElement("div");
      row.className = "well px-3 py-2 flex items-center gap-3";
      row.innerHTML = `<i style="width:8px;height:8px;border-radius:50%;background:#6e7b3a;box-shadow:0 0 6px #6e7b3a;flex:none"></i>
        <span class="flex-1 min-w-0"><span class="block text-sm" style="color:var(--cream)">With you, in your office</span>
        <span class="block mono text-[10px] uppercase tracking-wide" style="color:var(--muted)">Leave him here: he waits for you, safe, while you're out</span></span>
        <button type="button" class="deck-btn primary">Wait in my office</button>
        <button type="button" class="deck-btn">Follow</button>`;
      col.prepend(row);
    });
    await page.waitForTimeout(400);
    await hideDev(page);
    await page.screenshot({ path: `${OUT}/hud-panel-office.png` });

    // ── the list of pets: where each is (one at home, one lost) ──
    await page.evaluate(() => {
      const card = document.querySelector("aside .tile-card") as HTMLElement | null;
      if (!card) return;
      const list = card.parentElement as HTMLElement;
      const lines: [string, string, string][] = [
        ["Rex", "Dog · in your office", "#6e7b3a"],
        ["Mia", "Cat · lost · boathouse, 2 h ago", "#c4402b"],
        ["Kiwi", "Parrot · in your car", "#e8a33d"],
      ];
      for (const [i, [name, line, dot]] of lines.entries()) {
        const c = (i === 0 ? card : (card.cloneNode(true) as HTMLElement)) as HTMLElement;
        const spans = c.querySelectorAll("span span");
        if (spans[0]) spans[0].textContent = name;
        if (spans[1]) {
          spans[1].textContent = line;
          (spans[1] as HTMLElement).style.color = dot;
        }
        if (i > 0) {
          // (not picked; their own faces: a letter in the coat's colour stands in for the portrait)
          c.style.boxShadow = "none";
          c.style.borderColor = "var(--edge)";
          for (const dotEl of c.querySelectorAll("i")) dotEl.remove();
          const face = c.firstElementChild as HTMLElement;
          face.innerHTML = `<b style="font:700 14px Inter,system-ui;color:#2a1a12">${name[0]}</b>`;
          face.style.background = i === 1 ? "#e8a33d" : "#6e9b4a";
          list.appendChild(c);
        }
      }
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/hud-panel-list.png` });

    // ── the GPS: a lost pet's last sighting, a circle (not a pin: you go and look) ──
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    await page.evaluate(() => (window as any).__yutopia.togglePhone(true));
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as any).__yutopia.phone.open("maps"));
    await expect(page.locator("[data-gps]")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.locator("[data-gps-search]").click();
    await page.locator("[data-gps-search]").fill("boat");
    const place = page.locator("[data-gps-place]").first();
    await expect(place).toBeVisible();
    // the list: the pets in their own group, on top
    await page.evaluate(() => {
      const row = document.querySelector("[data-gps-place]") as HTMLElement;
      const group = row.parentElement as HTMLElement;
      const mine = group.cloneNode(true) as HTMLElement;
      (mine.querySelector("h3") as HTMLElement).textContent = "My pets";
      const rows = [...mine.querySelectorAll("button")];
      for (const b of rows.slice(1)) b.remove();
      const r = rows[0];
      r.removeAttribute("data-gps-place");
      const two = r.cloneNode(true) as HTMLElement;
      (r.querySelector("span") as HTMLElement).textContent = "Mia · lost · last seen 2 h ago";
      (two.querySelector("span") as HTMLElement).textContent = "Rex · in your office";
      (r.firstElementChild as HTMLElement).outerHTML =
        `<span style="width:16px;height:16px;border-radius:50%;background:rgba(196,64,43,.35);box-shadow:0 0 0 2px #c4402b;flex:none"></span>`;
      (two.firstElementChild as HTMLElement).outerHTML =
        `<span style="width:16px;height:16px;border-radius:50%;background:#6e7b3a;box-shadow:0 0 0 2px #fff;flex:none"></span>`;
      r.after(two);
      group.parentElement?.insertBefore(mine, group);
    });
    await page.waitForTimeout(300);
    await hideDev(page);
    await page.locator("[data-gps]").screenshot({ path: `${OUT}/hud-gps-list-phone.png` });
    // picked: the card, the circle where she was last seen
    await place.click();
    await expect(page.locator("[data-gps-card]")).toBeVisible();
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      const card = document.querySelector("[data-gps-card]") as HTMLElement;
      const b = card.querySelector("b") as HTMLElement;
      b.textContent = "Mia — lost";
      const span = b.nextElementSibling as HTMLElement;
      span.textContent = "Last seen near the boathouse, 2 h ago · by Bia";
      const map = document.querySelector("[data-gps-map]") as HTMLElement;
      const ring = document.createElement("div");
      ring.style.cssText =
        "position:absolute;left:50%;top:50%;width:120px;height:120px;transform:translate(-50%,-50%);border-radius:50%;background:rgba(196,64,43,.22);border:2px dashed #c4402b;pointer-events:none";
      map.appendChild(ring);
    });
    await page.waitForTimeout(300);
    await hideDev(page);
    await page.locator("[data-gps]").screenshot({ path: `${OUT}/hud-gps-lost-phone.png` });
    await page.evaluate(() => (window as any).__yutopia.togglePhone(false));
    await page.waitForTimeout(1200);

    // ── the panel shut: Rex at home in the office, Ana going out ──
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    await page.waitForTimeout(800);
    await page.evaluate(
      ([css, n]) => {
        const d = document.createElement("div");
        d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:50";
        d.innerHTML = css + n;
        document.body.appendChild(d);
      },
      [
        NOTE_CSS,
        `<div style="position:absolute;left:50%;top:96px;transform:translateX(-50%)"><div class="toast">Rex will wait for you in your office.</div></div>` +
          note(
            1,
            1150,
            560,
            "<b>Home</b>: he keeps to your office — its bowls, its bed, its toys — and never leaves it on his own. Your door's locked to everyone else, so nothing out there can hurt him. Back here, <b>Follow</b> and he's with you again.",
            330,
          ),
      ] as const,
    );
    await page.waitForTimeout(300);
    await hideDev(page);
    await page.screenshot({ path: `${OUT}/hud-office.png` });
  } finally {
    await release(page);
  }
});
