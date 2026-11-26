import { Color } from "three";
import type { Out, V3 } from "./kit3d";

// Fences, railings, spandrels and gates, and the walls' trims, in 3D (docs/plan/130-the-house-build.md, phase 3): a
// "wall" with a style (shared structure/edit.ts WALL_STYLES) drawn as what it is — posts, rails, pickets, bars,
// boards, glass, a hedge — along its line; a wall's trims (skirting, a chair rail, crown moulding, a frieze) along both
// its faces. Into the walls' own lit buffers (floor-local, three's axes: x, up, z = the plan's y), as the walls are.

/** A styled wall or a trimmed one, floor-local. */
export interface StyledWall {
  id: string;
  a: [number, number];
  b: [number, number];
  style?: string;
  trim?: readonly string[];
  height: number;
  thick: number;
  /** its foot over the floor (m) */
  base: number;
}

const lin = (hex: number, a = 1): number[] => {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255), a];
};
const WHITE = lin(0xf1efe8);
const IRON = lin(0x26282c);
const WOOD = lin(0x8a6a48);
const WOOD_DARK = lin(0x5e4630);
const STONE = lin(0x9c968a);
const STONE_CAP = lin(0xbab4a8);
const HEDGE = lin(0x3f6a34);
const HEDGE_DARK = lin(0x2f5427);
const STEEL = lin(0xb9bec4);
const GLASS = lin(0xbcd8e4, 0.35);
const TRIM = lin(0xf6f4ee);

/** A box along a wall: from `u0` to `u1` along it (m from a), `v0`–`v1` across it (left +), `y0`–`y1` up. */
function along(
  g: Out["lit"],
  w: StyledWall,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  y0: number,
  y1: number,
  col: number[],
  uv = false,
) {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
  const [ux, uy] = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
  const [nx, ny] = [-uy, ux];
  const P = (u: number, v: number, y: number): V3 => [w.a[0] + ux * u + nx * v, w.base + y, w.a[1] + uy * u + ny * v];
  const c = [
    P(u0, v0, y0),
    P(u1, v0, y0),
    P(u1, v1, y0),
    P(u0, v1, y0),
    P(u0, v0, y1),
    P(u1, v0, y1),
    P(u1, v1, y1),
    P(u0, v1, y1),
  ];
  const U: V3 = [ux, 0, uy];
  const N: V3 = [nx, 0, ny];
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
  // (a library material's: UVs in metres along each face — the quality pass's foundations)
  const q = uv ? g.quadUV.bind(g) : g.quad.bind(g);
  q(c[4], c[5], c[6], c[7], [0, 1, 0], col);
  q(c[0], c[3], c[2], c[1], [0, -1, 0], col);
  q(c[0], c[1], c[5], c[4], neg(N), col);
  q(c[3], c[7], c[6], c[2], N, col);
  q(c[1], c[2], c[6], c[5], U, col);
  q(c[0], c[4], c[7], c[3], neg(U), col);
}
const lengthOf = (w: StyledWall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
/** Points along a wall `step` m apart at most, its ends too. */
function stations(L: number, step: number): number[] {
  const n = Math.max(1, Math.ceil(L / step - 1e-6));
  return Array.from({ length: n + 1 }, (_, i) => (L * i) / n);
}
/** Even spacing `step` apart between u0 and u1 (the ends kept clear by half a step). */
function between(u0: number, u1: number, step: number): number[] {
  const n = Math.max(0, Math.floor((u1 - u0) / step));
  const pad = (u1 - u0 - (n - 1) * step) / 2;
  return Array.from({ length: n }, (_, i) => u0 + pad + i * step);
}

/** One styled wall drawn into `out`. */
export function drawStyled(out: Out, w: StyledWall): void {
  const g = out.lit;
  const L = lengthOf(w);
  const H = w.height;
  const post = (u: number, s: number, h: number, col: number[]) =>
    along(g, w, u - s / 2, u + s / 2, -s / 2, s / 2, 0, h, col);
  switch (w.style) {
    case "picket": {
      for (const u of stations(L, 2)) post(u, 0.09, H + 0.04, WHITE);
      // (its rails' backs a hair inside its posts' faces — flush, they flickered there)
      for (const y of [0.22, 0.72]) along(g, w, 0, L, -0.042, -0.005, y * H, y * H + 0.07, WHITE);
      for (const u of between(0.08, L - 0.08, 0.14))
        along(g, w, u - 0.035, u + 0.035, 0.0, 0.022, 0.06, H - 0.06, WHITE);
      for (const u of between(0.08, L - 0.08, 0.14)) along(g, w, u - 0.018, u + 0.018, 0.0, 0.022, H - 0.06, H, WHITE);
      break;
    }
    case "iron":
    case "ironrail": {
      for (const u of stations(L, 2.4)) post(u, 0.06, H + 0.06, IRON);
      for (const y of [0.08, H - 0.06]) along(g, w, 0, L, -0.025, 0.025, y, y + 0.04, IRON);
      for (const u of between(0.05, L - 0.05, 0.12)) along(g, w, u - 0.011, u + 0.011, -0.011, 0.011, 0.1, H, IRON);
      if (w.style === "iron")
        for (const u of between(0.05, L - 0.05, 0.12)) along(g, w, u - 0.02, u + 0.02, -0.02, 0.02, H, H + 0.05, IRON);
      break;
    }
    case "ranch": {
      for (const u of stations(L, 2.4)) post(u, 0.12, H, WOOD_DARK);
      for (const y of [0.25, 0.55, 0.85]) along(g, w, 0, L, -0.08, -0.04, y * H, y * H + 0.15, WOOD);
      break;
    }
    case "lattice": {
      for (const u of stations(L, 1.8)) post(u, 0.09, H + 0.03, WOOD_DARK);
      along(g, w, 0, L, -0.03, 0.03, H - 0.07, H, WOOD_DARK);
      along(g, w, 0, L, -0.03, 0.03, 0.05, 0.12, WOOD_DARK);
      for (let y = 0.2; y < H - 0.1; y += 0.15) along(g, w, 0.05, L - 0.05, -0.012, 0.0, y, y + 0.035, WOOD);
      for (const u of between(0.05, L - 0.05, 0.15))
        along(g, w, u - 0.017, u + 0.017, 0.0, 0.012, 0.12, H - 0.07, WOOD);
      break;
    }
    case "hedge": {
      along(g, w, 0, L, -w.thick / 2, w.thick / 2, 0, H * 0.92, HEDGE);
      along(g, w, 0.05, L - 0.05, -w.thick / 2 + 0.04, w.thick / 2 - 0.04, H * 0.92, H, HEDGE_DARK);
      for (const u of between(0.2, L - 0.2, 0.55))
        along(g, w, u - 0.18, u + 0.18, -w.thick / 2 - 0.03, w.thick / 2 + 0.03, H * 0.2, H * 0.8, HEDGE_DARK);
      break;
    }
    case "stone": {
      along(g, w, 0, L, -w.thick / 2, w.thick / 2, 0, H - 0.08, STONE);
      along(g, w, -0.03, L + 0.03, -w.thick / 2 - 0.03, w.thick / 2 + 0.03, H - 0.08, H, STONE_CAP);
      break;
    }
    case "rail": {
      for (const u of stations(L, 1.8)) post(u, 0.1, H + 0.04, WHITE);
      along(g, w, 0, L, -0.047, 0.047, H - 0.06, H, WHITE);
      along(g, w, 0, L, -0.04, 0.04, 0.06, 0.12, WHITE);
      for (const u of between(0.08, L - 0.08, 0.12))
        along(g, w, u - 0.018, u + 0.018, -0.018, 0.018, 0.12, H - 0.06, WHITE);
      break;
    }
    case "glassrail": {
      for (const u of stations(L, 1.5)) post(u, 0.05, H - 0.04, STEEL);
      along(g, w, 0, L, -0.03, 0.03, H - 0.04, H, STEEL);
      along(out.clear, w, 0.03, L - 0.03, -0.006, 0.006, 0.06, H - 0.05, GLASS);
      break;
    }
    case "spandrel": {
      // (hanging from the ceiling over an opening: a beam, a row of spindles, a scalloped board)
      along(g, w, 0, L, -w.thick / 2, w.thick / 2, H - 0.12, H, WHITE);
      along(g, w, 0, L, -w.thick / 2 + 0.02, w.thick / 2 - 0.02, H - 0.2, H - 0.12, WHITE);
      for (const u of between(0.05, L - 0.05, 0.1))
        along(
          g,
          w,
          u - 0.015,
          u + 0.015,
          -0.015,
          0.015,
          H - 0.2 - (0.12 + 0.18 * Math.sin((Math.PI * u) / L)),
          H - 0.2,
          WHITE,
        );
      break;
    }
    case "gate": {
      post(0, 0.1, H + 0.12, WHITE);
      post(L, 0.1, H + 0.12, WHITE);
      along(g, w, 0.06, L - 0.06, -0.03, 0.03, 0.18, 0.26, WHITE);
      along(g, w, 0.06, L - 0.06, -0.03, 0.03, H - 0.3, H - 0.22, WHITE);
      for (const u of between(0.1, L - 0.1, 0.12)) {
        const top = H - 0.12 + 0.12 * Math.sin((Math.PI * u) / L);
        along(g, w, u - 0.03, u + 0.03, 0.03, 0.05, 0.06, top, WHITE);
      }
      break;
    }
    default:
      along(g, w, 0, L, -w.thick / 2, w.thick / 2, 0, H, WHITE);
  }
}

/** A wall's trims along both its faces (skirting, a chair rail, crown moulding, a frieze band). */
export function drawTrims(out: Out, w: StyledWall): void {
  if (!w.trim?.length) return;
  const g = out.lit;
  const L = lengthOf(w);
  const t = w.thick / 2;
  for (const s of [1, -1]) {
    const v = (d: number): [number, number] => (s > 0 ? [t, t + d] : [-t - d, -t]);
    for (const k of w.trim) {
      if (k === "base") along(g, w, 0, L, ...v(0.018), 0, 0.12, TRIM);
      else if (k === "chair") along(g, w, 0, L, ...v(0.022), 0.86, 0.92, TRIM);
      else if (k === "crown") {
        // (just under the wall's top: its cap's there — one plane, they flickered from above)
        along(g, w, 0, L, ...v(0.02), w.height - 0.12, w.height - 0.004, TRIM);
        along(g, w, 0, L, ...v(0.045), w.height - 0.05, w.height - 0.008, TRIM);
      } else if (k === "frieze") along(g, w, 0, L, ...v(0.012), w.height - 0.42, w.height - 0.14, TRIM);
    }
  }
}

/** (plan 130 phase 5) A foundation's pad, floor-local: its box on the plan, what its sides are. */
export interface PadDraw {
  ring: [number, number][];
  style: string;
}
const LIB_WHITE = lin(0xffffff);
/** A foundation's sides in the life look: the library's material for its style. */
const PAD_LIB: Record<string, string> = {
  stone: "fieldstone",
  brick: "brick",
  concrete: "concrete",
  stucco: "stucco",
  logs: "bark",
};
const PAD_COL: Record<string, [number[], number[]]> = {
  stone: [lin(0x9c968a), lin(0x7a756b)],
  brick: [lin(0x9a4a35), lin(0xd8d2c6)],
  concrete: [lin(0xb7b4ad), lin(0x9e9b94)],
  stucco: [lin(0xe3d7bd), lin(0xcbbfa5)],
  logs: [lin(0x8a5e3a), lin(0x5e3e24)],
  deck: [lin(0x8a6a48), lin(0x5e4630)],
};
/** A foundation's pads drawn under the floor: their sides from the land (`found` under the floor) up to it — courses
 *  of stone, brick, logs; a deck on posts with its rim. */
export function drawPads(out: Out, pads: readonly PadDraw[], found: number): void {
  const g = out.lit;
  for (const p of pads) {
    const xs = p.ring.map((q) => q[0]);
    const ys = p.ring.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const ym = (y0 + y1) / 2;
    const hd = (y1 - y0) / 2;
    const [col, line] = PAD_COL[p.style] ?? PAD_COL.stone;
    const w: StyledWall = { id: "", a: [x0, ym], b: [x1, ym], height: found, thick: 0, base: -found };
    const L = x1 - x0;
    if (p.style === "deck") {
      // (a deck on posts: its rim joists round, a post every 1.8 m along each side)
      along(g, w, 0, L, -hd, -hd + 0.05, found - 0.22, found - 0.02, line);
      along(g, w, 0, L, hd - 0.05, hd, found - 0.22, found - 0.02, line);
      along(g, w, 0, 0.05, -hd, hd, found - 0.22, found - 0.02, line);
      along(g, w, L - 0.05, L, -hd, hd, found - 0.22, found - 0.02, line);
      for (const u of [
        0.08,
        ...Array.from({ length: Math.floor(L / 1.8) }, (_, i) => (i + 1) * 1.8).filter((u) => u < L - 0.3),
        L - 0.08,
      ])
        for (const v of [-hd + 0.08, hd - 0.08])
          along(g, w, u - 0.06, u + 0.06, v - 0.06, v + 0.06, 0, found - 0.2, col);
      continue;
    }
    // (the quality pass: its sides in the library's own material — brick, fieldstone, concrete, stucco, logs' bark —
    // not lines a course that shimmered; a hair outside the floor slab's edges, under a cap that alone meets the floor:
    // its top and the cap's were one plane, and flickered)
    const lib = out.textured ? PAD_LIB[p.style] : undefined;
    const body = lib ? out.mat(lib) : g;
    along(body, w, -0.008, L + 0.008, -hd - 0.008, hd + 0.008, 0, found - 0.07, lib ? LIB_WHITE : col, !!lib);
    if (!lib) {
      // (the plain look: its courses, proud of its faces, under the cap)
      const course = p.style === "brick" ? 0.075 : p.style === "logs" ? 0.2 : p.style === "stone" ? 0.22 : 0;
      if (course)
        for (let y = course; y < found - 0.09; y += course)
          along(g, w, -0.014, L + 0.014, -hd - 0.014, hd + 0.014, y - 0.008, y, line);
    }
    // (its cap: a coping where it meets the floor — limestone, or the logs' own wood)
    const capLib = out.textured ? (p.style === "logs" ? "oak" : p.style === "concrete" ? "concrete" : "limestone") : undefined;
    along(
      capLib ? out.mat(capLib) : g,
      w,
      -0.03,
      L + 0.03,
      -hd - 0.03,
      hd + 0.03,
      found - 0.07,
      found - 0.004,
      capLib ? LIB_WHITE : line,
      !!capLib,
    );
  }
}

// ── (plan 130 phase 6) stairs built with the stair tool ──────────────────────────────────────────────────────────
const STAIR_COL: Record<string, { tread: number[]; side: number[]; rail: number[] }> = {
  oak: { tread: lin(0xb98a5a), side: lin(0xf1efe8), rail: lin(0x3a2a1e) },
  white: { tread: lin(0xf1efe8), side: lin(0xf1efe8), rail: lin(0xf1efe8) },
  iron: { tread: lin(0x3a3c40), side: lin(0x26282c), rail: lin(0x26282c) },
  glass: { tread: lin(0xb9884f), side: lin(0xb9bec4), rail: lin(0xb9bec4) },
  rustic: { tread: lin(0x8a6a48), side: lin(0x5e4630), rail: lin(0x5e4630) },
  concrete: { tread: lin(0xb7b4ad), side: lin(0x9e9b94), rail: lin(0x26282c) },
};
/** A flight's pieces (shared structure/flights.ts flightBoxes), floor-local (the corner subtracted), drawn: its treads,
 *  risers, landings, strings, pole — and its rail: a baluster at each tread's open sides, a handrail over them. */
export function drawFlight(
  out: Out,
  boxes: readonly { x: number; y: number; hu: number; hv: number; a: number; y0: number; y1: number; part: string }[],
  style: string,
  rail: string,
  base = 0,
): void {
  const g = out.lit;
  const col = STAIR_COL[style] ?? STAIR_COL.oak;
  const turned = (
    b: (typeof boxes)[number],
    hu: number,
    hv: number,
    y0: number,
    y1: number,
    c: number[],
    du = 0,
    dv = 0,
  ) => {
    const [cs, sn] = [Math.cos(b.a), Math.sin(b.a)];
    // (a box: its middle moved du across, dv along — the plan's x, y; three's x, z)
    const mx = b.x + dv * cs - du * sn;
    const my = b.y + dv * sn + du * cs;
    const w: StyledWall = {
      id: "",
      a: [mx - cs * hv, my - sn * hv],
      b: [mx + cs * hv, my + sn * hv],
      height: 0,
      thick: 0,
      base,
    };
    along(g, w, 0, hv * 2, -hu, hu, y0, y1, c);
  };
  const treads = boxes.filter((b) => b.part === "tread");
  for (const b of boxes) {
    const c = b.part === "tread" || b.part === "landing" ? col.tread : col.side;
    if (b.part === "riser" && style === "glass") continue;
    turned(b, b.hu, b.hv, b.y0, b.y1, c);
  }
  if (rail === "none") return;
  // the rail: a baluster at each side of each tread, a handrail joining their tops, 0.9 over the treads
  const H = 0.9;
  for (const side of [-1, 1]) {
    let prev: { x: number; y: number; top: number } | null = null;
    for (const b of treads) {
      const off = side * (b.hu - 0.04);
      const [cs, sn] = [Math.cos(b.a), Math.sin(b.a)];
      const x = b.x - off * sn;
      const y = b.y + off * cs;
      const top = b.y1 + H;
      if (rail === "glass") turned(b, 0.006, b.hv, b.y1, top - 0.05, GLASS, off);
      else turned(b, 0.016, 0.016, b.y1, top, rail === "iron" ? IRON : col.side, off);
      if (prev) {
        // (the handrail: from the last baluster's top to this one's)
        const L = Math.hypot(x - prev.x, y - prev.y);
        if (L > 0.01 && L < 0.8) {
          const w: StyledWall = {
            id: "",
            a: [prev.x, prev.y],
            b: [x, y],
            height: 0,
            thick: 0,
            base: base + (prev.top + top) / 2 - 0.03,
          };
          along(g, w, 0, L, -0.03, 0.03, 0, 0.06, rail === "iron" ? IRON : col.rail);
        }
      }
      prev = { x, y, top };
    }
  }
}

// ── (plan 130 phase 11) a pool: its tiled basin in the land's hole, a darker band at the waterline, its coping round
// it, the water a little under the land, a ladder down one side, lights in its walls ──────────────────────────────
export interface PoolDraw {
  id: string;
  ring: [number, number][];
  depth: number;
  tile: string;
  coping: string;
  ladder: number;
  lights: boolean;
}
const POOL_TILE: Record<string, number> = {
  blue: 0x3f8fc4,
  teal: 0x2f9a9a,
  white: 0xdde8ee,
  black: 0x2c3440,
  mosaic: 0x4f7fb8,
};
const COPING: Record<string, number> = { stone: 0xd8d2c4, brick: 0xa4573e, concrete: 0xb9b6ae, wood: 0x9a7048 };
const WATER = lin(0x5fb4d8, 0.55);
/** One pool, its land's top at `top` (floor-local m: under the floor by its foundation). */
export function drawPool(out: Out, p: PoolDraw, top: number): void {
  const g = out.lit;
  const xs = p.ring.map((q) => q[0]);
  const ys = p.ring.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ym = (y0 + y1) / 2;
  const hd = (y1 - y0) / 2;
  const L = x1 - x0;
  const w: StyledWall = { id: "", a: [x0, ym], b: [x1, ym], height: 0, thick: 0, base: top };
  const tile = lin(POOL_TILE[p.tile] ?? POOL_TILE.blue);
  const band = lin(new Color(POOL_TILE[p.tile] ?? POOL_TILE.blue).multiplyScalar(0.55).getHex());
  const D = p.depth;
  const t = 0.06;
  // its floor and its four walls' inner faces
  along(g, w, 0, L, -hd, hd, -D - t, -D, tile);
  along(g, w, 0, L, -hd - t, -hd, -D, 0, tile);
  along(g, w, 0, L, hd, hd + t, -D, 0, tile);
  along(g, w, -t, 0, -hd, hd, -D, 0, tile);
  along(g, w, L, L + t, -hd, hd, -D, 0, tile);
  // (the waterline's band, a hair proud of the walls)
  along(g, w, 0, L, -hd, -hd + 0.004, -0.3, -0.12, band);
  along(g, w, 0, L, hd - 0.004, hd, -0.3, -0.12, band);
  along(g, w, 0, 0.004, -hd, hd, -0.3, -0.12, band);
  along(g, w, L - 0.004, L, -hd, hd, -0.3, -0.12, band);
  // (a mosaic's: a lane line down its floor)
  if (p.tile === "mosaic" || p.tile === "blue") along(g, w, 0.6, L - 0.6, -0.08, 0.08, -D, -D + 0.004, band);
  // its coping round it, on the land
  const c = lin(COPING[p.coping] ?? COPING.stone);
  const cw = 0.35;
  along(g, w, -cw, L + cw, -hd - cw, -hd, 0, 0.05, c);
  along(g, w, -cw, L + cw, hd, hd + cw, 0, 0.05, c);
  along(g, w, -cw, 0, -hd, hd, 0, 0.05, c);
  along(g, w, L, L + cw, -hd, hd, 0, 0.05, c);
  // the water
  along(out.clear, w, 0, L, -hd, hd, -0.16, -0.15, WATER);
  // a ladder: two steel rails over the coping, rungs down the wall
  if (p.ladder >= 0) {
    const steel = lin(0xc9ced4);
    const at = (s: number, v: number): [number, number] =>
      p.ladder === 0
        ? [L / 2 + s, -hd + v]
        : p.ladder === 1
          ? [L - v, s]
          : p.ladder === 2
            ? [L / 2 + s, hd - v]
            : [v, s];
    for (const s of [-0.25, 0.25]) {
      const [u, v] = at(s, 0.12);
      along(g, w, u - 0.02, u + 0.02, v - 0.02, v + 0.02, -1.2, 0.85, steel);
    }
    for (let y = -1.1; y < -0.1; y += 0.3) {
      const [ua, va] = at(-0.25, 0.12);
      const [ub, vb] = at(0.25, 0.12);
      along(
        g,
        w,
        Math.min(ua, ub) - 0.02,
        Math.max(ua, ub) + 0.02,
        Math.min(va, vb) - 0.03,
        Math.max(va, vb) + 0.03,
        y,
        y + 0.03,
        steel,
      );
    }
  }
  // lights: a lamp in each long wall's middle, under the water (glowing)
  if (p.lights) {
    const lamp = lin(0xbfe8ff);
    for (const u of [L / 3, (2 * L) / 3]) {
      along(out.glow, w, u - 0.12, u + 0.12, -hd, -hd + 0.01, -0.75, -0.55, lamp);
      along(out.glow, w, u - 0.12, u + 0.12, hd - 0.01, hd, -0.75, -0.55, lamp);
    }
  }
}
