// Plan 73, phase 0b — stills (and frame runs for a loop) of /dev/life's people, on the machine's GPU.
//   node --experimental-strip-types e2e/life-bench.mts [out dir]
//   SHOTS=front-idle,…   (see SHOTS below)   FRAMES=walk,turn   (frame runs: numbered PNGs)
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/life/0b";
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const want = process.env.SHOTS?.split(",");
const frames = process.env.FRAMES?.split(",") ?? [];

const SHOTS: [string, string][] = [
  ["front-idle", "t=2.4"],
  ["threeq-idle", "t=2.4&spin=35"],
  ["side-idle", "t=2.4&spin=90"],
  ["back-idle", "t=2.4&spin=180"],
  ["front-walk", "act=walk&t=3.15"],
  ["side-walk", "act=walk&t=3.15&spin=90"],
  ["night-idle", "t=2.4&spin=20&hour=22"],
  ["face-man", "face=man&t=2.4&spin=12"],
  ["face-woman", "face=woman&t=2.4&spin=-12"],
  ["face-man-side", "face=man&t=2.4&spin=70"],
  ["face-woman-side", "face=woman&t=2.4&spin=-70"],
  // the painted style beside the photo one (build_person.py --paint): photo man, painted man, photo
  // woman, painted woman
  ["style-front", "style=both&t=2.4&spin=12"],
  ["style-threeq", "style=both&t=2.4&spin=40"],
  ["style-walk", "style=both&act=walk&t=3.15&spin=60"],
  ["style-night", "style=both&t=2.4&spin=20&hour=22"],
  ["face-man-painted", "face=man&style=painted&t=2.4&spin=12"],
  ["face-woman-painted", "face=woman&style=painted&t=2.4&spin=-12"],
  // the faces pass: painted, front, ¾ and profile
  ["pf-man-front", "face=man&style=painted&t=2.4&spin=0"],
  ["pf-man-side", "face=man&style=painted&t=2.4&spin=75"],
  ["pf-woman-front", "face=woman&style=painted&t=2.4&spin=0"],
  ["pf-woman-side", "face=woman&style=painted&t=2.4&spin=-75"],
  // the people polish: the face held — open and glancing, a blink, a smile
  ["pp-man", "face=man&style=painted&t=2.4&spin=12&blink=0&eyes=0,0"],
  ["pp-man-look", "face=man&style=painted&t=2.4&spin=12&blink=0&eyes=0.8,0.1"],
  ["pp-man-blink", "face=man&style=painted&t=2.4&spin=12&blink=1"],
  ["pp-man-smile", "face=man&style=painted&t=2.4&spin=12&blink=0&smile=0.8"],
  ["pp-woman", "face=woman&style=painted&t=2.4&spin=-12&blink=0&eyes=0,0"],
  ["pp-woman-look", "face=woman&style=painted&t=2.4&spin=-12&blink=0&eyes=-0.8,0.1"],
  ["pp-woman-blink", "face=woman&style=painted&t=2.4&spin=-12&blink=1"],
  ["pp-woman-smile", "face=woman&style=painted&t=2.4&spin=-12&blink=0&smile=0.8"],
  ["pp-both", "style=painted&today=0&t=2.4&spin=25"],
  // phase 0c: a corner of a room, the life kit and today's, by day and by night
  ["room-life", "room:t=3"],
  ["room-today", "room:kit=today&t=3"],
  ["room-life-night", "room:hour=22&t=3"],
  ["room-today-night", "room:kit=today&hour=22&t=3"],
  ["room-life-close", "room:view=close&t=3"],
  ["room-life-desk", "room:view=desk&t=3"],
  // the man alone, front and ¾ (his shoulders)
  ["man-front", "who=man&style=painted&today=0&t=2.4&spin=0"],
  ["man-threeq", "who=man&style=painted&today=0&t=2.4&spin=35"],
  // phase 0d: the front of the building, the lawn, the lot — noon, 17h, night
  ["out-noon", "out:t=3"],
  ["out-dusk", "out:hour=dusk&t=3"],
  ["out-night", "out:hour=night&t=3"],
  ["out-close", "out:view=close&t=3"],
  ["out-close-night", "out:view=close&hour=night&t=3"],
  // phase 3: the material library's board — all, each family nearer, the tintables in picked colours,
  // a few close, night, Low's half-size set
  ["mat-all", "mat:"],
  ["mat-all-night", "mat:hour=22"],
  ["mat-wood", "mat:family=wood"],
  ["mat-floor", "mat:family=floor"],
  ["mat-fabric", "mat:family=fabric"],
  ["mat-fabric-tint", "mat:family=fabric&tint=1"],
  ["mat-metal-tint", "mat:family=metal&tint=1"],
  ["mat-wall-tint", "mat:family=wall&tint=1"],
  ["mat-tile-tint", "mat:family=tile&tint=1"],
  ["mat-leather-tint", "mat:family=leather&tint=1"],
  ["mat-ground", "mat:family=ground"],
  ["mat-plant", "mat:family=plant"],
  ["mat-brick", "mat:id=brick"],
  ["mat-velvet", "mat:id=velvet"],
  ["mat-floor-oak", "mat:id=floor-oak"],
  ["mat-all-half", "mat:half=1"],
];

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => m.text().startsWith("life ") && console.log("  ", m.text()));

async function shot(p: Page, query: string, file: string) {
  // ("room:…" is /dev/life/room's, phase 0c)
  const [path, qs] = query.startsWith("room:")
    ? ["/dev/life/room", query.slice(5)]
    : query.startsWith("out:")
      ? ["/dev/life/outside", query.slice(4)]
      : query.startsWith("mat:")
        ? ["/dev/life/materials", query.slice(4)]
        : ["/dev/life", query];
  await p.goto(`${base}${path}?${qs}`);
  await p.waitForFunction(() => (window as unknown as { __life?: { ready: boolean } }).__life?.ready, null, {
    timeout: 120_000,
  });
  await p.screenshot({ path: file });
  console.log(file);
}

for (const [name, q] of SHOTS) {
  if (want && !want.includes(name)) continue;
  await shot(page, q, `${out}/${name}.png`);
}
// frame runs, for a loop: the walk over one stride, a turn on the spot
const N = 36;
for (const run of frames) {
  mkdirSync(`${out}/${run}`, { recursive: true });
  for (let i = 0; i < N; i++) {
    const q =
      run === "walk"
        ? `act=walk&spin=60&t=${(3 + (i / N) * 1.5).toFixed(3)}`
        : `t=2.4&spin=${((i / N) * 360).toFixed(1)}`;
    await shot(page, q, `${out}/${run}/${String(i).padStart(3, "0")}.png`);
  }
}
await browser.close();
