// Phase 0 of docs/plan/70-the-chess.md: the chess mocks (/dev/chess on the dev client, the machine's
// GPU) into design/screens/chess/.
//   node --experimental-strip-types e2e/chess-shots.mts [out dir]
//   ONLY=men,turn,board,story,today   SETS=0,1,2   Q="shot=…" (one shot, to test.png)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/chess";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3107";
const only = (process.env.ONLY ?? "men,turn,board,story,today").split(",");
const sets = (process.env.SETS ?? "0,1,2").split(",").map(Number);
const W = 1600;
const H = 900;

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 300)));
const shot = async (q: string, name: string) => {
  await page.goto(`${base}/dev/chess?${q}&w=${W}&h=${H}`);
  await page.waitForFunction(() => (window as unknown as { __shot?: boolean }).__shot === true, null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(500);
  const f = `${out}/${name}.png`;
  await page.screenshot({ path: f });
  console.log(f);
};
mkdirSync(`${out}/story`, { recursive: true });
if (process.env.VORTEX === "1") {
  // Vortex in black's chair, the computer opponent, by his moods
  mkdirSync(`${out}/vortex`, { recursive: true });
  const shots: [string, string][] = [
    ["shot=board&set=1&view=lean&vortex=focused", "1-thinking"],
    ["shot=board&set=1&view=lean&vortex=focused&sel=1&hud=1", "2-your-move"],
    ["shot=board&set=1&view=lean&vortex=shocked", "3-you-take-his-pawn"],
    ["shot=board&set=0&view=lean&vortex=smug", "4-he-took-yours"],
    ["shot=board&set=2&view=lean&vortex=seething&night=1", "5-losing-at-night"],
    ["shot=board&set=1&view=lean&vortex=crying", "6-you-mated-him"],
    ["shot=board&set=1&view=room&vortex=judging", "7-in-the-room"],
    ["shot=board&set=1&view=watch&vortex=judging", "8-a-watcher"],
  ];
  for (const [q, name] of shots) await shot(q, `vortex/${name}`);
} else if (process.env.LEAN === "1") {
  // the lean-in camera (the user's pick after phase 0)
  const SET = ["wood", "stone", "obsidian"];
  mkdirSync(`${out}/lean`, { recursive: true });
  for (const s of sets) {
    await shot(`shot=board&set=${s}&view=lean`, `lean/${SET[s]}-white`);
    await shot(`shot=board&set=${s}&view=lean-black`, `lean/${SET[s]}-black`);
    await shot(`shot=board&set=${s}&view=lean&sel=1&hud=1`, `lean/${SET[s]}-picked`);
    await shot(`shot=board&set=${s}&view=lean&sel=1&night=1`, `lean/${SET[s]}-night`);
    await shot(`shot=board&set=${s}&view=lean-mid`, `lean/${SET[s]}-wheel-out`);
  }
} else if (process.env.Q) {
  await shot(process.env.Q, "test");
} else {
  const SET = ["wood", "stone", "obsidian"];
  for (const s of sets) {
    if (only.includes("men"))
      for (const side of ["w", "b"]) await shot(`shot=men&set=${s}&side=${side}`, `men-${SET[s]}-${side}`);
    if (only.includes("turn"))
      for (const k of ["p", "r", "n", "b", "q", "k"]) await shot(`shot=turn&set=${s}&k=${k}`, `turn-${SET[s]}-${k}`);
    if (only.includes("board")) {
      for (const v of ["white", "black", "top", "watch", "room"])
        await shot(`shot=board&set=${s}&view=${v}`, `board-${SET[s]}-${v}`);
      await shot(`shot=board&set=${s}&view=white&sel=1&hud=1`, `board-${SET[s]}-white-picked`);
      await shot(`shot=board&set=${s}&view=white&night=1&sel=1`, `board-${SET[s]}-white-night`);
    }
  }
  if (only.includes("today"))
    for (const v of ["white", "watch"]) await shot(`shot=today&set=1&view=${v}`, `today-${v}`);
  if (only.includes("story")) {
    const frames: Record<string, number> = { knight: 6, rook: 6, promo: 5, castle: 4, check: 3, mate: 5 };
    for (const [st, n] of Object.entries(frames))
      for (let f = 0; f < n; f++) await shot(`shot=story&set=1&story=${st}&f=${f}`, `story/${st}-${f}`);
  }
}
await browser.close();
