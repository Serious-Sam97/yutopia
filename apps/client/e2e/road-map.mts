// Phase 0 of docs/plan/69-the-long-road.md: the course on paper — a map of the whole road (the land
// shaded by its height, the forest, rock and snow, the creek, the lake, the walkable band, today's
// Grounds for scale) and the road's profile (its altitude and grade along all of it). From
// road-course.mts; no game code.
//   node --experimental-strip-types e2e/road-map.mts [out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { landBounds, WAYS } from "@yutopia/shared/grounds";
import {
  ALT,
  at,
  BEND,
  bridged,
  CREEK,
  forest,
  GRADE,
  LAKE,
  LENGTH,
  LOOKOUT,
  lakeR,
  landAt,
  N,
  PADS,
  PASS,
  padAt,
  REST,
  S,
  SPINE,
  surfaceAt,
  TREELINE,
} from "./road-course.mts";

// (the land's box: shared land.ts — docs/plan/69)
const GROUNDS = landBounds();

const out = resolve(process.argv[2] ?? "../../design/screens/road");
mkdirSync(out, { recursive: true });

// ── the map: one grid of the land, 12 m a cell ──
function mapOf(
  X0: number,
  Z0: number,
  X1: number,
  Z1: number,
  STEP: number,
): { svg: string; px: Uint8ClampedArray; W: number; H: number } {
  const W = Math.ceil((X1 - X0) / STEP);
  const H = Math.ceil((Z1 - Z0) / STEP);
  const t0 = Date.now();
  const hgt = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hgt[j * W + i] = landAt(X0 + i * STEP, Z0 + j * STEP);
  console.log(`the land: ${W}×${H} in ${Date.now() - t0} ms`);
  const px = new Uint8ClampedArray(W * H * 4);
  const hAt = (i: number, j: number) => hgt[Math.max(0, Math.min(H - 1, j)) * W + Math.max(0, Math.min(W - 1, i))];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = X0 + i * STEP;
      const z = Z0 + j * STEP;
      const h = hAt(i, j);
      const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * STEP);
      const dz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * STEP);
      const slope = Math.hypot(dx, dz);
      // (the light from the north-west)
      const nl = Math.hypot(dx, 1, dz);
      const shade = Math.max(0, (dx * 0.6 + dz * 0.5 + 0.62) / nl);
      const f = forest(x, z, h, slope);
      const s = surfaceAt(x, z, h, slope, f);
      let c: [number, number, number];
      if (lakeR(x, z) < 1) c = [118, 158, 186];
      else if (s === "rock") c = [128, 126, 128];
      else if (h > 600) c = [248, 250, 252];
      else {
        // the snow, greyed green by the forest's density
        const k = Math.min(1, f * 1.1);
        c = [250 - 150 * k, 252 - 118 * k, 254 - 156 * k];
      }
      const inside = x > GROUNDS.x0 && x < GROUNDS.x1 && z > GROUNDS.z0 && z < GROUNDS.z1;
      if (inside) c = [c[0] * 0.92, c[1] * 0.92, c[2] * 0.95];
      const k = 0.55 + 0.6 * shade;
      // contours every 50 m
      const band = Math.floor(h / 50);
      const edge =
        Math.floor(hAt(i + 1, j) / 50) !== band || Math.floor(hAt(i, j + 1) / 50) !== band
          ? band % 2
            ? 0.86
            : 0.8
          : 1;
      const o = (j * W + i) * 4;
      px[o] = c[0] * k * edge;
      px[o + 1] = c[1] * k * edge;
      px[o + 2] = c[2] * k * edge;
      px[o + 3] = 255;
    }
  console.log(`shaded in ${Date.now() - t0} ms`);

  // the overlays, in the map's pixels
  const mx = (x: number) => (x - X0) / STEP;
  const mz = (z: number) => (z - Z0) / STEP;
  const line = (pts: [number, number][], every = 4) => {
    let d = "";
    for (let k = 0; k < pts.length; k += every)
      d += `${d ? "L" : "M"}${mx(pts[k][0]).toFixed(1)},${mz(pts[k][1]).toFixed(1)}`;
    const l = pts[pts.length - 1];
    return `${d}L${mx(l[0]).toFixed(1)},${mz(l[1]).toFixed(1)}`;
  };
  // the road in runs: on the land, on a bridge, the hairpins
  const runs: { d: string; kind: string }[] = [];
  {
    let kind = "";
    let pts: [number, number][] = [];
    for (let i = 0; i < N; i += 2) {
      const k = bridged(i) ? "bridge" : BEND[i] > 0.03 ? "pin" : "road";
      if (k !== kind && pts.length) {
        pts.push(SPINE[i]);
        runs.push({ d: line(pts, 1), kind });
        pts = [];
      }
      kind = k;
      pts.push(SPINE[i]);
    }
    runs.push({ d: line(pts, 1), kind });
  }
  // the walkable band: a ribbon of 500 m round the road (drawn as a wide faint stroke), the lake's basin
  const kms: string[] = [];
  for (let km = 1; km < LENGTH / 1000; km++) {
    const [x, z] = SPINE[at(km)];
    kms.push(
      `<circle cx="${mx(x)}" cy="${mz(z)}" r="5" fill="#16181b" stroke="#f2d17a" stroke-width="2"/><text x="${mx(x) + 8}" y="${mz(z) - 8}" class="km">${km}</text>`,
    );
  }
  const place = (x: number, z: number, label: string, dy = -14, anchor = "middle") =>
    `<circle cx="${mx(x)}" cy="${mz(z)}" r="7" fill="#c8322a" stroke="#fff" stroke-width="2"/><text x="${mx(x)}" y="${mz(z) + dy}" text-anchor="${anchor}" class="place">${label}</text>`;
  const places = [
    place(536, -405, "the barricade's spot", 26),
    ...PADS.map((p) => {
      const [x, z] = padAt(p);
      return place(x, z, p.name, p.name === "lookout" ? 28 : 26);
    }),
    place(SPINE[PASS][0], SPINE[PASS][1], `the pass ${ALT[PASS].toFixed(0)} m`, -16),
    place(SPINE[at(2.67)][0], SPINE[at(2.67)][1], "timber bridge", -16),
    place(SPINE[at(6.0)][0], SPINE[at(6.0)][1], "the high bridge", 28),
    `<text x="${mx(LAKE.cx)}" y="${mz(LAKE.cz) + 6}" text-anchor="middle" class="lake">the lake ${LAKE.level} m</text>`,
    `<text x="${mx(3400)}" y="${mz(-760)}" text-anchor="middle" class="region">THE LONG WOOD</text>`,
    `<text x="${mx(5700)}" y="${mz(-900)}" text-anchor="middle" class="region">THE GORGE</text>`,
    `<text x="${mx(6300)}" y="${mz(-1350)}" text-anchor="end" class="region">THE CLIMB</text>`,
    `<text x="${mx(1250)}" y="${mz(-180)}" text-anchor="middle" class="region">FIELDS</text>`,
    `<text x="${mx(30)}" y="${mz(-376)}" text-anchor="middle" class="region">TODAY'S GROUNDS</text>`,
  ];
  const grounds = `<rect x="${mx(GROUNDS.x0)}" y="${mz(GROUNDS.z0)}" width="${(GROUNDS.x1 - GROUNDS.x0) / STEP}" height="${(GROUNDS.z1 - GROUNDS.z0) / STEP}" fill="none" stroke="#3a4a5a" stroke-width="2" stroke-dasharray="6 4"/>`;
  const ways = WAYS.map(
    (w) =>
      `<path d="${line(w.line as [number, number][], 3)}" stroke="#4a4f57" stroke-width="${Math.max(1.4, w.w / 6)}" fill="none"/>`,
  ).join("");
  const scale = `<g transform="translate(40,${H - 46})"><rect x="-10" y="-26" width="${1000 / STEP + 120}" height="52" fill="#16181bcc"/><line x1="0" x2="${1000 / STEP}" y1="0" y2="0" stroke="#eee" stroke-width="3"/><text x="${1000 / STEP + 10}" y="5" class="km">1 km</text><text x="0" y="-10" class="small">north ↑</text></g>`;
  const fs = Math.max(1, Math.min(2.2, 12 / STEP / 1.6));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.km{font:600 ${(15 * fs).toFixed(0)}px system-ui;fill:#f2d17a;paint-order:stroke;stroke:#16181b;stroke-width:3px}
.place{font:600 ${(15 * fs).toFixed(0)}px system-ui;fill:#fff;paint-order:stroke;stroke:#16181b;stroke-width:4px}
.region{font:700 ${(20 * fs).toFixed(0)}px system-ui;letter-spacing:4px;fill:#2a3038;opacity:.75}
.lake{font:600 ${(16 * fs).toFixed(0)}px system-ui;fill:#173248}
.small{font:13px system-ui;fill:#ddd}
</style>
${grounds}${ways}
<path d="${line(SPINE, 4)}" stroke="#2b2f36" stroke-opacity=".12" stroke-width="${1000 / STEP}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${line(CREEK, 3)}" stroke="#3f7fa8" stroke-width="2.4" fill="none"/>
${runs.map((r) => `<path d="${r.d}" stroke="${r.kind === "bridge" ? "#e0a030" : r.kind === "pin" ? "#c8322a" : "#16181b"}" stroke-width="${Math.max(r.kind === "road" ? 3.4 : 5, 9 / STEP)}" fill="none" stroke-linecap="round"/>`).join("")}
${kms.join("")}${places.join("")}${scale}
</svg>`;
  return { svg, px, W, H };
}

// ── the profile ──
function profile(): string {
  const PW = 1800;
  const PH = 560;
  const L = 70;
  const Rr = PW - 30;
  const X = (s: number) => L + (s / LENGTH) * (Rr - L);
  const top = 60;
  const ph = 340;
  const lo = 0;
  const hi = 1000;
  const Y = (h: number) => top + ph - ((h - lo) / (hi - lo)) * ph;
  const gt = top + ph + 50;
  const gh = 100;
  const GY = (g: number) => gt + gh / 2 - (g / 0.12) * (gh / 2);
  // the land either side (60 m off: the higher) and the road
  let road = "";
  let land = "";
  let fill = "";
  let grade = "";
  for (let i = 0; i < N; i += 8) {
    const [x, z] = SPINE[i];
    const n = SPINE[Math.min(N - 1, i + 4)];
    const b = SPINE[Math.max(0, i - 4)];
    const l = Math.hypot(n[0] - b[0], n[1] - b[1]) || 1;
    const nx = -(n[1] - b[1]) / l;
    const nz = (n[0] - b[0]) / l;
    const side = Math.max(landAt(x + nx * 160, z + nz * 160), landAt(x - nx * 160, z - nz * 160));
    road += `${road ? "L" : "M"}${X(S[i]).toFixed(1)},${Y(ALT[i]).toFixed(1)}`;
    land += `${land ? "L" : "M"}${X(S[i]).toFixed(1)},${Y(Math.min(hi, side)).toFixed(1)}`;
    grade += `${grade ? "L" : "M"}${X(S[i]).toFixed(1)},${GY(GRADE[i]).toFixed(1)}`;
  }
  fill = `${land}L${X(LENGTH)},${Y(0)}L${X(0)},${Y(0)}Z`;
  const grid = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
    .map(
      (h) =>
        `<line x1="${L}" x2="${Rr}" y1="${Y(h)}" y2="${Y(h)}" stroke="#2c3138"/><text x="${L - 8}" y="${Y(h) + 4}" text-anchor="end">${h} m</text>`,
    )
    .join("");
  const kmLines = Array.from({ length: Math.floor(LENGTH / 1000) + 1 }, (_, k) => k)
    .map(
      (k) =>
        `<line x1="${X(k * 1000)}" x2="${X(k * 1000)}" y1="${top}" y2="${gt + gh}" stroke="#2c3138"/><text x="${X(k * 1000)}" y="${gt + gh + 18}" text-anchor="middle">km ${k}</text>`,
    )
    .join("");
  const span = (a: number, b: number, label: string) =>
    `<rect x="${X(a * 1000)}" y="${top}" width="${X(b * 1000) - X(a * 1000)}" height="${ph}" fill="#fff" opacity="0.035"/><text x="${(X(a * 1000) + X(b * 1000)) / 2}" y="${top + 18}" text-anchor="middle" fill="#ddd">${label}</text>`;
  const mark = (i: number, label: string) =>
    `<circle cx="${X(S[i])}" cy="${Y(ALT[i])}" r="5" fill="#c8322a" stroke="#fff"/><text x="${X(S[i])}" y="${Y(ALT[i]) - 12}" text-anchor="middle" fill="#fff">${label}</text>`;
  const bridges: string[] = [];
  for (let i = 0; i < N; i += 4)
    if (bridged(i)) bridges.push(`<rect x="${X(S[i])}" y="${Y(ALT[i]) - 2}" width="2" height="4" fill="#e0a030"/>`);
  const maxG = Math.max(...GRADE.map(Math.abs));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH + 60}" font-family="system-ui" font-size="13" fill="#bbb">
<rect width="100%" height="100%" fill="#16181b"/>
<text x="${L}" y="30" font-size="20" fill="#eee">The long road's profile (plan 69): ${(LENGTH / 1000).toFixed(1)} km, town ${ALT[0].toFixed(0)} m → the pass ${ALT[PASS].toFixed(0)} m → the lookout ${ALT[LOOKOUT].toFixed(0)} m</text>
<text x="${L}" y="50">The road (white), the higher land 160 m to either side (grey), the treeline ${TREELINE} m and the snow that never goes (600 m); bridges in amber. Grade below: steepest ${(maxG * 100).toFixed(1)}%.</text>
${grid}${kmLines}
${span(0, 1.5, "the edge of town")}${span(1.5, 4.9, "the Long Wood")}${span(4.9, 6.1, "the gorge")}${span(6.1, 10.4, "the climb")}${span(10.4, 11.6, "the pass")}${span(11.6, LENGTH / 1000, "the lake")}
<path d="${fill}" fill="#3a4048" opacity="0.65"/><path d="${land}" stroke="#8a929c" fill="none"/>
<line x1="${L}" x2="${Rr}" y1="${Y(TREELINE)}" y2="${Y(TREELINE)}" stroke="#6f9a5a" stroke-dasharray="6 4"/><text x="${Rr - 4}" y="${Y(TREELINE) - 5}" text-anchor="end" fill="#8fbf78">treeline</text>
<line x1="${L}" x2="${Rr}" y1="${Y(600)}" y2="${Y(600)}" stroke="#dfe8f0" stroke-dasharray="2 4"/><text x="${Rr - 4}" y="${Y(600) - 5}" text-anchor="end" fill="#eef">snow all year</text>
<line x1="${X(S[at(11.6)])}" x2="${Rr}" y1="${Y(LAKE.level)}" y2="${Y(LAKE.level)}" stroke="#58a7d0" stroke-width="2"/>
<path d="${road}" stroke="#fff" stroke-width="2.5" fill="none"/>${bridges.join("")}
${mark(REST, "rest stop")}${mark(at(6.0), "high bridge")}${mark(PADS[1].i, "pull-out")}${mark(PASS, "pass")}${mark(LOOKOUT, "lookout")}
<text x="${L}" y="${gt - 10}" fill="#eee">grade</text>
<line x1="${L}" x2="${Rr}" y1="${GY(0)}" y2="${GY(0)}" stroke="#3a4048"/>
<line x1="${L}" x2="${Rr}" y1="${GY(0.09)}" y2="${GY(0.09)}" stroke="#c8322a" stroke-dasharray="4 4"/><text x="${L - 8}" y="${GY(0.09) + 4}" text-anchor="end" fill="#e07060">9%</text>
<line x1="${L}" x2="${Rr}" y1="${GY(-0.09)}" y2="${GY(-0.09)}" stroke="#c8322a" stroke-dasharray="4 4"/><text x="${L - 8}" y="${GY(-0.09) + 4}" text-anchor="end" fill="#e07060">−9%</text>
<path d="${grade}" stroke="#f2d17a" fill="none"/>
</svg>`;
}

const browser = await chromium.launch({ channel: "chromium" });
for (const [name, x0, z0, x1, z1, step] of [
  ["map", -700, -3300, 11300, 900, 12],
  ["map-climb", 6250, -2050, 8350, -520, 2.5],
  ["map-lake", 8200, -2850, 10700, -1650, 3],
  ["map-town", -500, -1150, 3000, 450, 4],
] as const) {
  const { svg, px, W, H } = mapOf(x0, z0, x1, z1, step);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const html = `<html><body style="margin:0;background:#16181b"><div style="position:relative;width:${W}px;height:${H}px">
<canvas id="c" width="${W}" height="${H}" style="position:absolute;left:0;top:0"></canvas>
<div style="position:absolute;left:0;top:0">${svg}</div></div>
<script>
const b = atob("${Buffer.from(px.buffer).toString("base64")}");
const a = new Uint8ClampedArray(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
document.getElementById("c").getContext("2d").putImageData(new ImageData(a, ${W}, ${H}), 0, 0);
</script></body></html>`;
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
  console.log(`${name}: ${W}×${H}`);
}
{
  const p = profile();
  writeFileSync(`${out}/profile.svg`, p);
  const page = await browser.newPage({ viewport: { width: 1800, height: 620 } });
  await page.setContent(p);
  await page.screenshot({ path: `${out}/profile.png` });
  await page.close();
}
await browser.close();
console.log(`map, profile: ${out}`);
