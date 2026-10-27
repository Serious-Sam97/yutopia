// Phase 0 of docs/plan/46-the-karts.md: the HUD's mocks. The stills (/dev/karts?shot=…) with the
// karts' HUD laid over them in the game's own classes and tokens (the dev pages share its
// stylesheet: ink in walnut frames, docs/plan/45-the-ui.md), numbered notes beside. Saved to
// design/screens/karts/. The dev client on :3100, the machine's GPU:
//   node --experimental-strip-types e2e/karts-hud.mts [out dir] [mock …]
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { kartTrack } from "../../../packages/shared/src/kart/park.ts";

const out = process.argv[2] ?? "../../design/screens/karts";
const only = process.argv.slice(3);
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";

// ── the circuit as a little map (the HUD's corner, the lobby) ──
const t = kartTrack();
function lapPath(w: number, h: number, pad: number) {
  const xs = t.pts.map((p) => p.x);
  const zs = t.pts.map((p) => p.z);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const k = Math.min((w - pad * 2) / (Math.max(...xs) - x0), (h - pad * 2) / (Math.max(...zs) - z0));
  const X = (x: number) => pad + (x - x0) * k;
  const Z = (z: number) => pad + (z - z0) * k;
  const d = t.pts
    .filter((_, i) => i % 3 === 0)
    .map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)} ${Z(p.z).toFixed(1)}`)
    .join(" ");
  const at = (s: number) => {
    const p = t.pts[Math.round(s) % t.len];
    return [X(p.x), Z(p.z)];
  };
  const over = t.pts.filter((p) => p.y > 3).filter((_, i) => i % 2 === 0);
  const bridge = over.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)} ${Z(p.z).toFixed(1)}`).join(" ");
  return { d: `${d} Z`, at, bridge };
}
function miniMap(w: number, h: number, dots: [number, string, boolean?][]) {
  const m = lapPath(w, h, 12);
  const [sx, sz] = m.at(0);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <path d="${m.d}" fill="none" stroke="#2a2b31" stroke-width="9" stroke-linejoin="round"/>
  <path d="${m.d}" fill="none" stroke="#8a857c" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="${m.bridge}" fill="none" stroke="#17181d" stroke-width="8"/>
  <path d="${m.bridge}" fill="none" stroke="#a7a094" stroke-width="4.5"/>
  <rect x="${sx - 1.5}" y="${sz - 6}" width="3" height="12" fill="#ece6da"/>
  ${dots
    .map(([s, c, me]) => {
      const [x, z] = m.at(s);
      return me
        ? `<circle cx="${x}" cy="${z}" r="7" fill="${c}" stroke="#f1d79a" stroke-width="2.5"/>`
        : `<circle cx="${x}" cy="${z}" r="5" fill="${c}" stroke="#1a1a1e" stroke-width="1.5"/>`;
    })
    .join("")}
</svg>`;
}

// ── the parts ──
const CSS = `<style>
.mk-note{position:absolute;max-width:270px;padding:9px 12px 10px;border-radius:8px;background:#f3ead6;color:#2a1a12;
  font:500 13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35);z-index:5}
.mk-note b{font-weight:700}
.mk-note .n{display:inline-grid;place-items:center;width:20px;height:20px;margin:0 7px 0 -2px;border-radius:50%;
  background:#b5562f;color:#fff3e0;font:700 11px Inter,system-ui,sans-serif;vertical-align:1px}
.k-place{font-family:var(--font-title);font-weight:600;color:var(--cream);line-height:.8;letter-spacing:.02em;
  text-shadow:0 2px 0 #000,0 0 18px rgba(0,0,0,.6)}
.k-big{font-family:var(--font-title);font-weight:600;letter-spacing:.12em;color:var(--amber);
  text-shadow:0 3px 0 #2a1b11,0 0 30px rgba(241,215,154,.45);text-transform:uppercase}
.k-lbl{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cream-dim)}
.k-lcd{font-family:var(--font-lcd);color:var(--vfd);text-shadow:0 0 8px rgba(241,215,154,.35)}
.k-slot{width:96px;height:96px;display:grid;place-items:center;border-radius:4px;
  background:radial-gradient(#2a2b31,#121318);border:1px solid var(--well-edge)}
.k-row{display:flex;align-items:center;gap:10px;height:30px;padding:0 10px;border-radius:4px;font-size:14px;color:var(--cream)}
.k-row.me{background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber)}
.k-sw{width:22px;height:22px;border-radius:50%;border:2px solid #1a1a1e;box-shadow:0 0 0 1px var(--edge-2)}
.k-sw.on{box-shadow:0 0 0 2px var(--amber)}
.k-lamp{width:30px;height:30px;border-radius:50%;background:#2a1612;border:2px solid #120a08;box-shadow:inset 0 2px 4px #000}
.k-lamp.on{background:radial-gradient(#ffb08f,#c8553f 60%,#7a2a1e);box-shadow:0 0 18px #c8553f,inset 0 -2px 4px rgba(0,0,0,.4)}
</style>`;
const note = (n: number, x: number, y: number, html: string, w = 270) =>
  `<div class="mk-note" style="left:${x}px;top:${y}px;max-width:${w}px"><span class="n">${n}</span>${html}</div>`;

const SNOWBALL = `<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="15" fill="#f4f7fa" stroke="#1a1a1e" stroke-width="2.5"/>
<path d="M12 18q6-5 13-3M16 30q7 3 14-3" stroke="#b9c6d0" stroke-width="2" fill="none"/></svg>`;
const STAPLER = `<svg width="54" height="40" viewBox="0 0 54 40"><path d="M5 30h44v5H5z" fill="#3a3f45" stroke="#1a1a1e" stroke-width="2"/>
<path d="M7 28 44 14q5-2 6 3l-1 4-40 9z" fill="#c8553f" stroke="#1a1a1e" stroke-width="2.5" stroke-linejoin="round"/>
<circle cx="10" cy="29" r="3" fill="#8e959b" stroke="#1a1a1e" stroke-width="1.5"/></svg>`;

/** The item slot: what you hold, how many, the key. */
const slot = (icon: string, name: string, n?: number) => `
<div class="cabinet" style="padding:10px;display:flex;flex-direction:column;align-items:center;gap:7px">
  <div class="k-slot" style="position:relative">${icon}${n ? `<span class="k-lcd" style="position:absolute;right:7px;bottom:3px;font-size:22px">×${n}</span>` : ""}</div>
  <div class="k-lbl" style="color:var(--amber)">${name}</div>
  <div style="display:flex;gap:6px;align-items:center;color:var(--cream-dim)"><kbd class="keycap">SPACE</kbd><span class="k-lbl" style="font-size:10px">throw · ↓ behind</span></div>
</div>`;

/** The spark meter: the drift's charge, blue → amber → purple. */
const sparks = (lit: number) => `
<div style="display:flex;flex-direction:column;align-items:center;gap:6px">
  <div style="display:flex;gap:4px">${[
    ["#8fc0ff", "BLUE"],
    ["#e8a33d", "AMBER"],
    ["#c48cff", "PURPLE"],
  ]
    .map(
      ([c], i) =>
        `<i style="display:block;width:44px;height:10px;border-radius:2px;background:${i < lit ? c : "var(--meter-off)"};${i < lit ? `box-shadow:0 0 10px ${c}` : ""}"></i>`,
    )
    .join("")}</div>
  <div class="k-lbl" style="font-size:10px;color:${lit >= 3 ? "#d9b3ff" : "var(--cream-dim)"}">${lit >= 3 ? "Purple turbo · let go" : "Drift"}</div>
</div>`;

// ── the mocks ──
const MOCKS: Record<string, { shot: string; html: string }> = {
  // the race, from behind Ana: her place, the lap, the item, the drift, the map
  "hud-race": {
    shot: "kart-race",
    html: `
<div style="position:absolute;left:28px;top:22px;display:flex;align-items:flex-end;gap:14px">
  <div class="k-place" style="font-size:118px">5<span style="font-size:46px;vertical-align:top">th</span></div>
  <div style="padding-bottom:12px">
    <div class="k-lbl">of 8</div>
  </div>
</div>
<div class="cabinet" style="position:absolute;left:28px;top:150px;padding:10px 14px;display:grid;grid-template-columns:auto auto;gap:4px 16px;align-items:baseline">
  <span class="k-lbl">Lap</span><span class="k-lcd" style="font-size:26px">2<span style="color:var(--cream-dim);font-size:18px">/3</span></span>
  <span class="k-lbl">Time</span><span class="k-lcd" style="font-size:22px">1:18.42</span>
  <span class="k-lbl">Best lap</span><span class="k-lcd" style="font-size:18px;color:var(--cream-dim)">0:38.90</span>
</div>
<div style="position:absolute;right:28px;top:22px">${slot(SNOWBALL, "Snowballs", 2)}</div>
<div class="cabinet" style="position:absolute;left:28px;bottom:26px;padding:6px">${miniMap(230, 128, [
      [785, "#20262c"],
      [772, "#e8a33d"],
      [757, "#3d4a5c"],
      [745, "#2f4a3b"],
      [733, "#b5562f", true],
      [690, "#6b2430"],
      [610, "#4a5a73"],
      [560, "#8b8f93"],
    ])}</div>
<div style="position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:22px">
  ${sparks(3)}
  <div class="cabinet" style="padding:6px 14px;text-align:center"><div class="k-lcd" style="font-size:34px;line-height:1">64</div><div class="k-lbl" style="font-size:9px">km/h</div></div>
</div>
<div style="position:absolute;left:50%;top:120px;transform:translateX(-50%);text-align:center">
  <div class="k-big" style="font-size:30px">Snowball → Bia</div>
</div>
${note(1, 300, 40, "<b>Your place</b>, big, in the book face: the first thing your eye goes to. The lap and the clocks under it in the typed face.")}
${note(2, 1220, 200, "<b>The item slot.</b> A cassette crate rolls 1 s here (the roulette), then the item. Snowballs come in threes: the ones left circle your kart.", 300)}
${note(3, 300, 600, "<b>The circuit</b>, you ringed in the lamp's colour, everyone else a dot in their kart's colour; the bridge drawn over.")}
${note(4, 960, 690, "<b>The drift.</b> Hold the hop key in a corner: the meter (and the sparks off your tyres) go blue → amber → purple. Let go for the turbo.", 300)}
${note(5, 1010, 112, "<b>Call-outs</b> over the road: what you threw and at whom, FINAL LAP, the flag. Short, big, gone in a second.", 260)}
`,
  },
  // on the grid: the lights
  "hud-start": {
    shot: "kart-close",
    html: `
<div style="position:absolute;left:50%;top:38px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:12px">
  <div class="cabinet" style="padding:12px 18px;display:flex;gap:14px">
    ${[1, 1, 1, 0, 0].map((on) => `<div class="k-lamp${on ? " on" : ""}"></div>`).join("")}
  </div>
  <div class="k-lbl" style="color:var(--cream);text-shadow:0 1px 3px #000">Hold <kbd class="keycap" style="opacity:1">W</kbd> as the last light goes out: a start boost</div>
</div>
<div class="cabinet" style="position:absolute;left:28px;top:24px;padding:10px 16px">
  <div class="k-lbl">Grid</div>
  <div class="k-place" style="font-size:54px">P1</div>
  <div class="k-lbl" style="margin-top:4px">Grand Prix · 3 laps</div>
</div>
<div class="cabinet" style="position:absolute;right:28px;top:24px;padding:10px">
  <div class="k-slot" style="opacity:.55"><span class="k-lbl">empty</span></div>
</div>
${note(1, 1060, 160, "<b>The lights</b>, the slot cars' five, lamps in the rust of the house palette. Hold the throttle just as they go out for a start boost; too early and you bog down.", 300)}
${note(2, 28, 210, "<b>On the grid</b> in the order you joined (later: last race's results reversed).")}
`,
  },
  // the bowl: the clock, the score, the smash
  "hud-battle": {
    shot: "kart-battle",
    html: `
<div class="cabinet" style="position:absolute;left:50%;top:22px;transform:translateX(-50%);padding:6px 22px;text-align:center">
  <div class="k-lcd" style="font-size:40px;line-height:1">2:14</div>
  <div class="k-lbl" style="font-size:9px">Battle · the bowl</div>
</div>
<div class="cabinet" style="position:absolute;right:28px;top:22px;padding:8px 6px;width:250px">
  <div class="grp" style="margin:0 8px 6px">Smashes</div>
  <div class="k-row"><span class="k-lcd" style="width:16px">1</span><span class="k-sw" style="background:#e8a33d;width:14px;height:14px"></span><span style="flex:1">Lu</span><span class="k-lcd">5</span></div>
  <div class="k-row me"><span class="k-lcd" style="width:16px">2</span><span class="k-sw" style="background:#b5562f;width:14px;height:14px"></span><span style="flex:1">Ana (you)</span><span class="k-lcd">4</span></div>
  <div class="k-row"><span class="k-lcd" style="width:16px">3</span><span class="k-sw" style="background:#3d4a5c;width:14px;height:14px"></span><span style="flex:1">Cai</span><span class="k-lcd">3</span></div>
  <div class="k-row" style="color:var(--cream-dim)"><span class="k-lcd" style="width:16px">4</span><span class="k-sw" style="background:#2f4a3b;width:14px;height:14px"></span><span style="flex:1">Bia</span><span class="k-lcd">3</span></div>
</div>
<div style="position:absolute;left:28px;top:22px">${slot(STAPLER, "The stapler")}</div>
<div style="position:absolute;left:50%;top:150px;transform:translateX(-50%);text-align:center">
  <div class="k-big" style="font-size:54px">Smash!</div>
  <div class="k-lbl" style="color:var(--cream);font-size:13px;margin-top:4px">Lu got Tomás · +1</div>
</div>
${note(1, 930, 26, "<b>Three minutes</b>, everyone for themselves; the clock at the top, the lamp's colour in the last ten seconds.", 240)}
${note(2, 1090, 250, "<b>The score</b>: the top three and you, always. A smash is a point; the bowl's banks let you ride up and drop on people.", 250)}
${note(3, 28, 250, "<b>One item at a time</b>, from the crates on the floor (back 4 s after they're taken). The stapler: 3 staples and they're smashed.", 250)}
${note(4, 1150, 640, "<b>Smashed:</b> confetti, a puff of snow, your kart back on a ring at the edge in 2 s, blinking 1.5 s (nobody can hit you).", 260)}
`,
  },
  // the lobby: at the paddock's desk
  "hud-lobby": {
    shot: "kart-rack",
    html: `
<div class="cabinet" style="position:absolute;right:40px;top:40px;width:560px;padding:20px 22px 18px">
  <div style="display:flex;align-items:baseline;justify-content:space-between">
    <div class="title" style="font-size:26px">Kart Park</div>
    <div class="k-lbl">Next race · 5 of 8</div>
  </div>
  <div class="zigzag" style="margin:8px 0 14px"></div>
  <div style="display:grid;grid-template-columns:110px 1fr;gap:12px 14px;align-items:center">
    <span class="k-lbl">Mode</span>
    <div class="seg"><button aria-pressed="true">Grand Prix</button><button aria-pressed="false">Battle</button><button aria-pressed="false">Practice</button></div>
    <span class="k-lbl">Laps</span>
    <div class="seg"><button>1</button><button aria-pressed="true">3</button><button>5</button></div>
    <span class="k-lbl">Vortex karts</span>
    <div style="display:flex;gap:10px;align-items:center"><button class="sw" aria-pressed="true"></button><span class="k-lbl" style="color:var(--cream)">fill the grid</span>
      <div class="seg" style="flex:1"><button>Easy</button><button aria-pressed="true">Medium</button><button>Hard</button></div></div>
    <span class="k-lbl">Your kart</span>
    <div style="display:flex;gap:8px;align-items:center">
      ${["#b5562f", "#2f4a3b", "#e8a33d", "#3d4a5c", "#6b2430", "#cdbf9f", "#4a5a73", "#20262c"]
        .map((c, i) => `<span class="k-sw${i === 0 ? " on" : ""}" style="background:${c}"></span>`)
        .join("")}
      <span style="flex:1"></span><span class="k-lbl">No.</span><span class="k-lcd" style="font-size:24px">01</span>
    </div>
  </div>
  <div class="grp" style="margin:18px 0 6px">The grid</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px">
    ${[
      ["1", "Ana (you)", "#b5562f", "ready", true],
      ["2", "Bia", "#2f4a3b", "ready"],
      ["3", "Cai", "#3d4a5c", "picking"],
      ["4", "Duda", "#e8a33d", "ready"],
      ["5", "Vortex", "#20262c", "medium", false, true],
      ["6", "Vortex", "#20262c", "medium", false, true],
      ["7", "Vortex", "#20262c", "medium", false, true],
      ["8", "Vortex", "#20262c", "medium", false, true],
    ]
      .map(
        ([n, who, c, st, me, v]) =>
          `<div class="k-row${me ? " me" : ""}" style="${v ? "color:var(--cream-dim)" : ""}"><span class="k-lcd" style="width:14px">${n}</span><span class="k-sw" style="background:${c};width:14px;height:14px${v ? ";border-color:#7a2a1e" : ""}"></span><span style="flex:1">${who}</span><span class="k-lbl" style="font-size:10px;color:${st === "ready" ? "var(--olive)" : v ? "var(--rust)" : "var(--cream-dim)"}">${st}</span></div>`,
      )
      .join("")}
  </div>
  <div style="display:flex;gap:10px;margin-top:18px;align-items:center">
    <button class="deck-btn" aria-pressed="true" style="flex:1;font-size:15px;height:48px">Start · everyone's ready</button>
    <button class="deck-btn" style="height:48px">Leave</button>
  </div>
  <div class="faceplate" style="margin-top:16px;padding:10px 12px;display:flex;gap:18px;font-family:var(--font-mono);font-size:12px">
    <div><div style="opacity:.6;font-size:10px;letter-spacing:.1em;text-transform:uppercase">House record</div><div style="font-size:15px">0:36.42 · Bia</div></div>
    <div><div style="opacity:.6;font-size:10px;letter-spacing:.1em;text-transform:uppercase">Last race</div><div>1 Cai · 2 Ana · 3 Vortex</div></div>
    <div><div style="opacity:.6;font-size:10px;letter-spacing:.1em;text-transform:uppercase">Most wins</div><div>Cai, 7</div></div>
  </div>
</div>
${note(1, 40, 60, "<b>At the paddock's desk</b> (X): the lobby, as the slot cars' and the pool table's. Anyone on the grid can start once all are ready, or after a 20 s countdown.", 300)}
${note(2, 40, 200, "<b>Vortex karts</b> fill the empty slots at a level (your call: yes, with levels). Each glitches in with his VHS shimmer.", 300)}
${note(3, 40, 320, "<b>Your kart</b>: the house palette, your number; your helmet takes the colour. Not owned, not parked in the world: the rack's.", 300)}
${note(4, 40, 440, "<b>Practice</b>: free laps on your own while nobody races, timed, your best on the tower.", 300)}
${note(5, 40, 545, "<b>The tower's record</b>: best lap, the last results, most wins (kept with the park, like the pool table's chalkboard).", 300)}
`,
  },
  // at the flag: the results
  "hud-results": {
    shot: "kart-night",
    html: `
<div style="position:absolute;left:50%;top:70px;transform:translateX(-50%);text-align:center">
  <div class="k-big" style="font-size:64px">2nd</div>
  <div class="k-lbl" style="color:var(--cream);font-size:13px">Grand Prix · 3 laps · best lap 0:37.11</div>
</div>
<div class="cabinet" style="position:absolute;left:50%;top:210px;transform:translateX(-50%);width:430px;padding:12px 10px">
  <div class="grp" style="margin:0 8px 6px">At the flag</div>
  ${[
    ["1", "Cai", "#3d4a5c", "1:56.20"],
    ["2", "Ana (you)", "#b5562f", "+0.84", true],
    ["3", "Vortex", "#20262c", "+2.10"],
    ["4", "Bia", "#2f4a3b", "+3.47"],
    ["5", "Lu", "#e8a33d", "+9.02"],
  ]
    .map(
      ([n, who, c, tm, me]) =>
        `<div class="k-row${me ? " me" : ""}"><span class="k-lcd" style="width:16px">${n}</span><span class="k-sw" style="background:${c};width:14px;height:14px"></span><span style="flex:1">${who}</span><span class="k-lcd">${tm}</span></div>`,
    )
    .join("")}
  <div style="display:flex;gap:10px;margin:12px 8px 2px">
    <button class="deck-btn" aria-pressed="true" style="flex:1">Again</button>
    <button class="deck-btn" style="flex:1">Back to the paddock</button>
  </div>
</div>
${note(1, 1130, 240, "<b>At the flag</b>: your place big, everyone's gap; 9 s, then the lobby (as the slot cars). Again keeps the same grid.", 260)}
`,
  },
};

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("  error:", e.message));
for (const [name, m] of Object.entries(MOCKS)) {
  if (only.length && !only.includes(name)) continue;
  await page.goto(`${base}/dev/karts?shot=${m.shot}`);
  await page.waitForFunction(() => (window as unknown as { __shot?: boolean }).__shot === true, null, {
    timeout: 180_000,
  });
  await page.evaluate((h) => {
    document.querySelector("[data-status]")?.remove();
    for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:50";
    d.innerHTML = h;
    document.body.appendChild(d);
  }, CSS + m.html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const file = `${out}/${name}.png`;
  writeFileSync(file, await page.screenshot());
  console.log(`${name}: ${file}`);
}
await browser.close();
