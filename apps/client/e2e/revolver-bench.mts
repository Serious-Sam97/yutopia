/* biome-ignore-all lint/suspicious/noExplicitAny: reads the bench's window hooks */
// Plan 80: the revolver's bench (/dev/revolver) through its poses and views — stills of each, and the hold's
// checks for each (the gun upright, the barrel on the look, no hand through a hand or the grip, each wrist
// at its place and within its reach). The dev stack's client (:3100), the GPU.
//   node --experimental-strip-types e2e/revolver-bench.mts [out dir]   (ONLY=aim,aim-torch: those poses;
//   VIEWS=side,hands: those views; CHECK=1: the checks only, every pitch — fails past the limits)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/guns/p80/bench";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const only = process.env.ONLY?.split(",");
const views = process.env.VIEWS?.split(",") ?? ["side", "front", "hands", "hands-left", "shoulder"];
const checkOnly = process.env.CHECK === "1";
mkdirSync(out, { recursive: true });

const POSES: [string, Record<string, unknown>][] = [
  ["ready", { pose: "ready", torch: false }],
  ["ready-walk", { pose: "ready", torch: false, move: 1 }],
  ["ready-sprint", { pose: "ready", torch: false, move: 3 }],
  ["draw-0.15", { pose: "ready", draw: 0.15 }],
  ["draw-0.4", { pose: "ready", draw: 0.4 }],
  ["draw-0.7", { pose: "ready", draw: 0.7 }],
  ["away-0.5", { pose: "ready", draw: 0.5, away: true }],
  ["holstered", { pose: "ready", draw: 0, away: true }],
  ["holstered-walk", { pose: "ready", draw: 0, away: true, move: 1 }],
  ["ready-torch", { pose: "ready", torch: true }],
  ["ready-torch-walk", { pose: "ready", torch: true, move: 1 }],
  ["aim", { pose: "aim", torch: false, pitch: 0 }],
  ["aim-walk", { pose: "aim", torch: false, pitch: 0, move: 1 }],
  ["aim-up", { pose: "aim", torch: false, pitch: 0.5 }],
  ["aim-down", { pose: "aim", torch: false, pitch: -0.5 }],
  ["aim-torch", { pose: "aim", torch: true, pitch: 0 }],
  ["aim-kick", { pose: "aim", torch: false, pitch: 0, kick: 0.8, trigger: 1 }],
  // (phase 5: a hit taken aiming — the flinch, then back on; a roll with it out)
  ["hit-0.1", { pose: "aim", act: "hit", actT: 0.1 }],
  ["hit-0.5", { pose: "aim", act: "hit", actT: 0.5 }],
  ["roll-0.4", { pose: "ready", act: "roll", actT: 0.4 }],
  // (plan 81 phase 5: a vault, a slide, sat — the double-barrel pulled in across her chest, or let go sat)
  ["vault-0.4", { pose: "ready", act: "vault", actT: 0.4 }],
  ["slide-0.4", { pose: "ready", act: "slide", actT: 0.4 }],
  ["sit", { pose: "ready", act: "sit" }],
  ["aim-torch-up", { pose: "aim", torch: true, pitch: 0.5 }],
  // (the reload's moments, s into its 2.2: in close, the cylinder out; muzzle up; the rod struck; muzzle down,
  // to the pouch; the loader up; in; twisted; let go; shut; up)
  // (the double-barrel's, s into its 2.3 — plan 81 phase 4: the lever and the barrels down; to the carrier, a
  // shell drawn; at the left chamber, pushed home; the second; shut; up)
  ...(process.env.GUN === "shotgun"
    ? [0.2, 0.42, 0.73, 0.95, 1.15, 1.48, 1.7, 1.9, 2.1, 2.25].map(
        (s) => [`reload-${s.toFixed(2)}`, { pose: "reload", t: s / 2.3 }] as [string, Record<string, unknown>],
      )
    : [0.25, 0.45, 0.62, 0.9, 1.04, 1.35, 1.6, 1.74, 1.9, 2.1].map(
        (s) => [`reload-${s.toFixed(2)}`, { pose: "reload", t: s / 2.2 }] as [string, Record<string, unknown>],
      )),
];

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
// (GUN=shotgun: the double-barrel's — plan 81)
const gun = process.env.GUN ?? "revolver";
await page.goto(`${base}/dev/arms?gun=${gun}&view=side${process.env.Q ?? ""}`);
await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120_000 });
const set = (s: Record<string, unknown>) => page.evaluate((s) => (window as any).__revolver.set(s), s);
const check = () => page.evaluate(() => (window as any).__revolver.check());
const settle = () => page.waitForTimeout(700);
const r = (x: number | null, k = 1) => (x === null ? null : Math.round(x * k * 10) / 10);
const DEG = 180 / Math.PI;
let bad = 0;
const report = (name: string, c: any) => {
  const line = {
    cant: r(c.cant, DEG),
    off: r(c.off, DEG),
    hands: r(c.hands, 100),
    grip: r(c.grip, 100),
    R: [r(c.R.short, 100), r(c.R.over, DEG)],
    ...(c.arms !== null && c.arms !== undefined ? { arms: r(c.arms, 100) } : {}),
    L: c.L ? [r(c.L.short, 100), r(c.L.over, DEG)] : null,
  };
  // (the limits: upright within 2°, on the look within 2°, nothing through a hand or the grip by more than
  // 3 mm — skin gives —, each wrist within 1.5 cm of its place)
  const aiming = name.startsWith("aim");
  const fails = [
    aiming && c.cant > 2 / DEG && "canted",
    aiming && !name.includes("kick") && c.off > 2 / DEG && "off the look",
    !name.includes("torch") && c.hands !== null && c.hands < -0.003 && "a hand through a hand",
    !name.includes("torch") && c.grip !== null && c.grip < -0.003 && "fingers through the grip",
    c.R.short > 0.015 && "the right short",
    typeof c.arms === "number" && c.arms < -0.005 && "an arm through the gun",
    c.L && c.L.short > 0.015 && "the left short",
  ].filter(Boolean);
  if (
    !/^(reload|hit|roll|vault|slide|sit)/.test(name) &&
    !name.startsWith("draw") &&
    !name.startsWith("away") &&
    fails.length
  )
    bad++;
  console.log(
    `${name.padEnd(12)} ${JSON.stringify(line)}${fails.length ? `  ✗ ${fails.join(", ")} (nearest: ${c.where})` : ""}`,
  );
};
for (const [name, s] of POSES) {
  if (only && !only.includes(name)) continue;
  await set({ pitch: 0, move: 0, draw: 1, away: false, torch: false, kick: 0, trigger: 0, act: "", actT: 0, ...s });
  await settle();
  const c = await check();
  if (c) report(name, c);
  if (checkOnly) continue;
  for (const v of views) {
    await set({ view: v });
    await settle();
    const cv = await page.$("canvas");
    await cv?.screenshot({ path: `${out}/${name}-${v}.png` });
  }
}
if (checkOnly) {
  // the ready to the aim in the gun's own 0.18 s (shared ARMS.revolver.aim): well off the look early in it,
  // on it by its end
  await set({ pose: "ready", torch: false, pitch: 0 });
  await settle();
  const t0 = Date.now();
  await set({ pose: "aim" });
  const offAt = async (ms: number) => {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    return ((await check())?.off ?? 0) * DEG;
  };
  const early = await offAt(50);
  const late = await offAt(320);
  const ok = early > 8 && late < 2;
  if (!ok) bad++;
  console.log(
    `ready → aim: ${early.toFixed(1)}° off the look at 50 ms, ${late.toFixed(1)}° at 320 ms${ok ? "" : "  ✗"}`,
  );
  // every pitch aimed, with and without the torch
  for (const torch of [false, true])
    for (let pitch = -0.9; pitch <= 0.91; pitch += 0.3) {
      await set({ pose: "aim", torch, pitch });
      await settle();
      const c = await check();
      if (c) report(`aim${torch ? "-torch" : ""} ${pitch.toFixed(1)}`, c);
    }
}
await browser.close();
if (bad) {
  console.log(`${bad} past the limits`);
  process.exit(1);
}
