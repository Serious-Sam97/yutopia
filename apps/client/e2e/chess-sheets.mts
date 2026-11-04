// Phase 0 of docs/plan/70-the-chess.md: contact sheets from chess-shots.mts' stills (a page of them
// laid out, screenshotted): each storyboard on one sheet, the men of the three sets, the board's views.
//   node --experimental-strip-types e2e/chess-sheets.mts [dir]
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const dir = resolve(process.argv[2] ?? "../../design/screens/chess");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });

async function sheet(name: string, title: string, files: string[], cols: number) {
  const imgs = files.filter((f) => existsSync(`${dir}/${f}.png`));
  const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#17140f;color:#e9dfca;font:600 22px ui-sans-serif,system-ui;padding:22px}
h1{font:600 26px Georgia,serif;letter-spacing:.12em;text-transform:uppercase;margin:0 0 16px;color:#f2c879}
.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px}
img{width:100%;display:block;border:3px solid #5b3a22;border-radius:2px}</style>
<h1>${title}</h1><div class="g">${imgs.map((f) => `<img src="file://${dir}/${f}.png">`).join("")}</div>`;
  const f = `${dir}/sheet-tmp.html`;
  writeFileSync(f, html);
  await page.goto(`file://${f}`);
  await page.waitForLoadState("load");
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  console.log(`${dir}/${name}.png`);
}

const SET = ["wood", "stone", "obsidian"];
const NAME = ["Walnut and maple", "Park stone", "Ivory and obsidian"];
const STORY: Record<string, [string, number]> = {
  knight: ["The knight's leap — Ng1–f3", 6],
  rook: ["The rook takes — Rd1×d5", 6],
  promo: ["Promotion — b7–b8=Q", 5],
  castle: ["Castling — O-O", 4],
  check: ["Check — Bb5+", 3],
  mate: ["Mate — the crown dropped", 5],
};
for (const [k, [title, n]] of Object.entries(STORY))
  await sheet(
    `sheet-story-${k}`,
    title,
    Array.from({ length: n }, (_, i) => `story/${k}-${i}`),
    n === 4 ? 2 : 3,
  );
for (const [i, s] of SET.entries()) {
  await sheet(`sheet-men-${s}`, `${NAME[i]} — the men`, [`men-${s}-w`, `men-${s}-b`], 1);
  await sheet(
    `sheet-turn-${s}`,
    `${NAME[i]} — each man four ways`,
    ["p", "r", "n", "b", "q", "k"].map((k) => `turn-${s}-${k}`),
    2,
  );
  await sheet(
    `sheet-board-${s}`,
    `${NAME[i]} — the board camera`,
    ["white", "black", "top", "watch", "white-picked", "white-night", "room"].map((v) => `board-${s}-${v}`),
    2,
  );
}
for (const [i, s] of SET.entries())
  await sheet(
    `sheet-lean-${s}`,
    `${NAME[i]} — the lean-in camera`,
    ["white", "black", "picked", "night", "wheel-out"].map((v) => `lean/${s}-${v}`),
    2,
  );
await sheet(
  "sheet-lean-vs-chair",
  "From the chair, and leaning in",
  ["board-stone-white", "lean/stone-white", "board-stone-white-picked", "lean/stone-picked"],
  2,
);
await sheet(
  "sheet-vortex",
  "Vortex in the chair — the computer opponent",
  [
    "1-thinking",
    "2-your-move",
    "3-you-take-his-pawn",
    "4-he-took-yours",
    "5-losing-at-night",
    "6-you-mated-him",
    "7-in-the-room",
    "8-a-watcher",
  ].map((v) => `vortex/${v}`),
  2,
);
await sheet(
  "sheet-today-vs-new",
  "Today (plan 68) and the new men",
  ["today-white", "board-stone-white", "today-watch", "board-stone-watch"],
  2,
);
await browser.close();
