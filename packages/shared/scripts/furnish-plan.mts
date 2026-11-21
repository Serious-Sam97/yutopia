// Plan 113: a building's hand-made layout laid as the world server lays it, held to the rules, and drawn as a plan
// in text (25 cm a character) — `npx tsx scripts/furnish-plan.mts <building key> [scale]`.
import { entry } from "../src/catalog.ts";
import { BUILDINGS } from "../src/grounds.ts";
import { kindSolids } from "../src/shapes/index.ts";
import { layoutProblems } from "../src/structure/furnishings-check.ts";
import { layoutFor, laySpace } from "../src/structure/spaces.ts";
import type { Structure } from "../src/structure/types.ts";

const key = process.argv[2] ?? "bar";
const S = Number(process.argv[3] ?? 0.25);
const b = BUILDINGS.find((q) => q.key === key);
if (!b) throw new Error(`no building ${key}`);
const st: Structure = {
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [0, 0],
  floors: [{ index: 0, name: "g", z: 0, grid: { x0: 0, y0: 0, w: 1, h: 1 } }],
  slabs: [],
  walls: [],
  rooms: [],
};
const s = laySpace(st, b);
if (!s) throw new Error("no space");
const layout = layoutFor(b) ?? { pieces: [] };
const { furnishThings } = await import("../src/structure/spaces.ts");
void furnishThings;
const things = [
  ...s.things,
  ...(await import("../src/structure/furnishings.ts")).layoutThings(
    b,
    layout,
    s.floors.map((f) => f.index),
  ),
];
const problems = layoutProblems(b, layout, s.floors, s.walls, things);
console.log(`${b.key}: ${things.length} things, ${problems.length} problems`);
for (const p of problems) console.log(`  ✖ ${p}`);
const letters = new Map<string, string>();
const legend: string[] = [];
const code = (k: string) => {
  if (!letters.has(k)) {
    const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[letters.size] ?? "?";
    letters.set(k, c);
    legend.push(`${c} ${k}`);
  }
  return letters.get(k) as string;
};
for (const [i, f] of s.floors.entries()) {
  const W = Math.round((b.x1 - b.x0) / S);
  const H = Math.round((b.z1 - b.z0) / S);
  const g = Array.from({ length: H + 1 }, () => Array.from({ length: W + 1 }, () => " "));
  const put = (x: number, y: number, c: string) => {
    const gx = Math.round((x - b.x0) / S);
    const gy = Math.round((y - b.z0) / S);
    if (gy >= 0 && gy <= H && gx >= 0 && gx <= W) g[gy][gx] = c;
  };
  for (const w of s.walls.filter((q) => q.floor === f.index)) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    for (let d = 0; d <= L; d += S / 2) {
      const gap = (w.gaps ?? []).find((q) => d >= q[0] && d <= q[1]);
      put(
        w.a[0] + ((w.b[0] - w.a[0]) * d) / L,
        w.a[1] + ((w.b[1] - w.a[1]) * d) / L,
        gap ? (gap[2] < 0.05 ? "." : "=") : w.shell ? "#" : "|",
      );
    }
  }
  for (const o of things.filter((q) => q.props?.level === f.index)) {
    const c = o.kind === "stairs" ? "%" : code(o.kind);
    for (const sol of o.kind === "stairs" ? [] : kindSolids(o)) {
      const pts =
        sol.t === "cyl"
          ? [[sol.x, sol.z]]
          : (() => {
              const out: number[][] = [];
              const [co, si] = [Math.cos(-sol.a), Math.sin(-sol.a)];
              for (let u = -sol.hx; u <= sol.hx + 1e-6; u += S / 2)
                for (let v = -sol.hz; v <= sol.hz + 1e-6; v += S / 2)
                  out.push([sol.x + u * co - v * si, sol.z + u * si + v * co]);
              return out;
            })();
      for (const [x, y] of pts) put(x, y, c);
    }
    if (o.kind === "stairs") {
      const q = Math.round((o.yaw ?? 0) / (Math.PI / 2)) & 3;
      const [w, h] = q % 2 ? [7, 4] : [4, 7];
      for (let x = o.x; x <= o.x + w; x += S) for (let y = o.y; y <= o.y + h; y += S) put(x, y, "%");
    }
    // its front, an arrow
    if (o.kind !== "stairs" && entry(o.kind).h) {
      const fx = -Math.sin(o.yaw ?? 0);
      const fy = Math.cos(o.yaw ?? 0);
      const d = entry(o.kind).h / 2 + 0.1;
      put(o.x + fx * d, o.y + fy * d, Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? ">" : "<") : fy > 0 ? "v" : "^");
    }
  }
  console.log(`\n storey ${i} (floor ${f.index}, north up, x ${b.x0}…${b.x1})`);
  for (const row of g) console.log(` ${row.join("")}`);
}
console.log(`\n ${legend.join("   ")}   % stairs   # wall   = window   . door   | inside wall`);
