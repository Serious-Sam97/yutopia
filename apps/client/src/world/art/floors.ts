import {
  entry,
  footprint,
  hWall,
  isFloor,
  isWallEdge,
  type MapDef,
  tileAt,
  vWall,
  type WorldObjectDef,
} from "@yutopia/shared";

// Floors, baked: each material is a seamless top-down texture (4×4 tiles,
// generated once), filled into the floor in plan space through an isometric
// transform, then ambient occlusion (wall bases, corners, under furniture),
// door thresholds and strips between materials are painted on top. The result
// is cut into canvas chunks the engine turns into sprites.

const HW = 32;
const HH = 16;
export const T = 64; // plan px per tile at res 1
const PERIOD = 4; // texture repeats every 4 tiles

// ── seeded noise ───────────────────────────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const shadeHex = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)))
      .toString(16)
      .padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

// Every material is drawn at `s` px per tile and wraps at PERIOD tiles.
type Painter = (g: CanvasRenderingContext2D, s: number, r: () => number) => void;

// Plank rows along x, lit from the top: dark seam above, faint light below.
function planks(base: string[], rows: number, grain: number, opts: { knots?: boolean; tape?: boolean } = {}): Painter {
  return (g, s, r) => {
    const S = s * PERIOD;
    const rowH = s / rows;
    for (let row = 0; row < rows * PERIOD; row++) {
      const y = row * rowH;
      let x = -r() * s * 2;
      while (x < S) {
        const len = s * (1.3 + r() * 1.8);
        const tone = shadeHex(base[Math.floor(r() * base.length)], 0.94 + r() * 0.12);
        for (const ox of [0, S, -S]) {
          const px = x + ox;
          if (px > S || px + len < 0) continue;
          g.fillStyle = tone;
          g.fillRect(px, y, len, rowH);
          // grain: long wobbly lines
          g.strokeStyle = `rgba(52,30,16,${grain})`;
          g.lineWidth = Math.max(0.6, s / 90);
          const lines = 3 + Math.floor(r() * 3);
          const seed = r() * 100;
          for (let k = 0; k < lines; k++) {
            const gy = y + rowH * ((k + 0.5 + (r() - 0.5) * 0.4) / lines);
            g.beginPath();
            for (let t = 0; t <= len; t += s / 16) {
              const yy = gy + Math.sin((t + seed * 7 + k * 31) / (s * 0.35)) * rowH * 0.08;
              if (t === 0) g.moveTo(px + t, yy);
              else g.lineTo(px + t, yy);
            }
            g.stroke();
          }
          // a lighter streak
          g.fillStyle = "rgba(255,230,190,0.05)";
          g.fillRect(px + len * 0.1, y + rowH * (0.2 + r() * 0.4), len * 0.6, rowH * 0.18);
          if (opts.knots && r() < 0.07) {
            const kx = px + len * (0.2 + r() * 0.6);
            const ky = y + rowH * 0.5;
            g.strokeStyle = "rgba(60,34,18,0.32)";
            g.lineWidth = Math.max(0.6, s / 80);
            g.beginPath();
            g.ellipse(kx, ky, rowH * 0.32, rowH * 0.18, 0, 0, Math.PI * 2);
            g.stroke();
            g.fillStyle = "rgba(60,34,18,0.22)";
            g.beginPath();
            g.ellipse(kx, ky, rowH * 0.12, rowH * 0.07, 0, 0, Math.PI * 2);
            g.fill();
          }
          // end joint
          g.fillStyle = "rgba(40,22,12,0.55)";
          g.fillRect(px + len - Math.max(1, s / 64), y, Math.max(1, s / 64), rowH);
        }
        x += len;
      }
      // row seam (dark) + bevel light just under it
      g.fillStyle = "rgba(40,22,12,0.5)";
      g.fillRect(0, y, S, Math.max(1, s / 64));
      g.fillStyle = "rgba(255,235,200,0.10)";
      g.fillRect(0, y + Math.max(1, s / 64), S, Math.max(1, s / 64));
    }
    if (opts.tape) {
      // gaffer-tape marks on the stage (story)
      for (let i = 0; i < 2; i++) {
        const cx = s * (0.8 + r() * 2.4);
        const cy = s * (0.8 + r() * 2.4);
        g.save();
        g.translate(cx, cy);
        g.fillStyle = i ? "rgba(232,163,61,0.85)" : "rgba(239,228,204,0.8)";
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          g.save();
          g.rotate(a);
          g.fillRect(-s * 0.18, -s * 0.03, s * 0.36, s * 0.06);
          g.restore();
        }
        g.restore();
      }
    }
  };
}

function speckle(base: string, dots: [string, number][], density: number, size: number): Painter {
  return (g, s, r) => {
    const S = s * PERIOD;
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    const n = Math.floor(S * S * density);
    for (const [col, share] of dots) {
      g.fillStyle = col;
      for (let i = 0; i < n * share; i++) g.fillRect(r() * S, r() * S, size * (0.6 + r()), size * (0.6 + r()));
    }
  };
}

const MATERIALS: Record<string, Painter> = {
  // walnut-teak planks
  ".": planks(["#9a6a40", "#8f6139", "#a5744a", "#87592f", "#96663c", "#9d6d42"], 4, 0.22, { knots: true }),
  // 80s carpet tiles: olive fibre, alternate pile direction, faint seams
  ",": (g, s, r) => {
    speckle(
      "#6b6a3a",
      [
        ["rgba(40,42,18,0.35)", 0.5],
        ["rgba(160,160,100,0.16)", 0.5],
      ],
      0.16,
      Math.max(1, s / 64),
    )(g, s, r);
    const S = s * PERIOD;
    for (let y = 0; y < PERIOD; y++)
      for (let x = 0; x < PERIOD; x++) {
        g.fillStyle = (x + y) % 2 ? "rgba(255,255,220,0.014)" : "rgba(0,0,0,0.016)";
        g.fillRect(x * s, y * s, s, s);
        g.strokeStyle = "rgba(255,255,230,0.035)";
        g.lineWidth = Math.max(0.5, s / 128);
        for (let k = 0; k < 10; k++) {
          const o = (k / 10) * s;
          g.beginPath();
          if ((x + y) % 2) {
            g.moveTo(x * s + o, y * s);
            g.lineTo(x * s + o, y * s + s);
          } else {
            g.moveTo(x * s, y * s + o);
            g.lineTo(x * s + s, y * s + o);
          }
          g.stroke();
        }
      }
    g.fillStyle = "rgba(30,30,10,0.18)";
    for (let i = 0; i < PERIOD; i++) {
      g.fillRect(i * s, 0, Math.max(1, s / 96), S);
      g.fillRect(0, i * s, S, Math.max(1, s / 96));
    }
  },
  // cream checker tiles with grout and a soft gloss
  _: (g, s, r) => {
    const gr = Math.max(1.5, s / 32);
    g.fillStyle = "#b8ab8c";
    g.fillRect(0, 0, s * PERIOD, s * PERIOD);
    for (let y = 0; y < PERIOD; y++)
      for (let x = 0; x < PERIOD; x++) {
        const base = (x + y) % 2 ? "#e6dcc4" : "#cfc3a5";
        const grad = g.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
        grad.addColorStop(0, shadeHex(base, 1.06 + r() * 0.03));
        grad.addColorStop(1, shadeHex(base, 0.96 - r() * 0.03));
        g.fillStyle = grad;
        g.fillRect(x * s + gr / 2, y * s + gr / 2, s - gr, s - gr);
        // a little marble veining
        g.strokeStyle = "rgba(150,135,105,0.18)";
        g.lineWidth = Math.max(0.5, s / 100);
        g.beginPath();
        g.moveTo(x * s + r() * s, y * s + gr);
        g.quadraticCurveTo(x * s + r() * s, y * s + s / 2, x * s + r() * s, y * s + s - gr);
        g.stroke();
        // gloss on the upper-left corner
        g.fillStyle = "rgba(255,255,255,0.10)";
        g.beginPath();
        g.moveTo(x * s + gr, y * s + gr);
        g.lineTo(x * s + s * 0.55, y * s + gr);
        g.lineTo(x * s + gr, y * s + s * 0.55);
        g.fill();
      }
  },
  // rust felt (booths): mottled, soft
  ":": (g, s, r) => {
    speckle(
      "#7a3b2e",
      [
        ["rgba(40,14,10,0.22)", 0.5],
        ["rgba(200,120,90,0.12)", 0.5],
      ],
      0.2,
      Math.max(1, s / 64),
    )(g, s, r);
    const S = s * PERIOD;
    for (let i = 0; i < 40; i++) {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.6);
      grd.addColorStop(0, r() > 0.5 ? "rgba(150,70,50,0.12)" : "rgba(50,18,12,0.12)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      const x = r() * S;
      const y = r() * S;
      for (const [ox, oy] of [
        [0, 0],
        [S, 0],
        [0, S],
        [-S, 0],
        [0, -S],
      ]) {
        g.save();
        g.translate(x + ox, y + oy);
        g.fillStyle = grd;
        g.fillRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2);
        g.restore();
      }
    }
  },
  // stage boards, dark, with tape marks
  "~": planks(["#2f2620", "#352a22", "#2a221c", "#3a2e25"], 3, 0.3, { tape: true }),
  // metal grate (server room)
  x: (g, s, r) => {
    const S = s * PERIOD;
    g.fillStyle = "#4a4740";
    g.fillRect(0, 0, S, S);
    const sw = s / 4;
    const sh = s / 10;
    for (let y = 0; y < PERIOD * 8; y++)
      for (let x = 0; x < PERIOD * 4; x++) {
        const px = x * sw + sw * 0.15;
        const py = y * (s / 8) + sh * 0.3;
        g.fillStyle = "#1f1d19";
        g.fillRect(px, py, sw * 0.7, sh);
        g.fillStyle = "rgba(255,255,240,0.10)";
        g.fillRect(px, py + sh, sw * 0.7, Math.max(0.6, s / 128));
      }
    for (let i = 0; i < PERIOD; i++) {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, i * s, S, Math.max(1, s / 48));
      g.fillRect(i * s, 0, Math.max(1, s / 48), S);
      g.fillStyle = "rgba(255,255,240,0.08)";
      g.fillRect(0, i * s + Math.max(1, s / 48), S, Math.max(1, s / 96));
    }
    // a few scuffs
    for (let i = 0; i < 12; i++) {
      g.fillStyle = "rgba(160,150,130,0.08)";
      g.fillRect(r() * S, r() * S, s * 0.4 * r(), s * 0.05);
    }
  },
};

const matCache = new Map<string, HTMLCanvasElement>();
export function materialCanvas(ch: string, s: number): HTMLCanvasElement | null {
  const paint = MATERIALS[ch];
  if (!paint) return null;
  const key = `${ch}|${s}`;
  let c = matCache.get(key);
  if (!c) {
    c = canvas(s * PERIOD, s * PERIOD);
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    paint(g, s, rng(ch.charCodeAt(0) * 977));
    matCache.set(key, c);
  }
  return c;
}

// ── ambient occlusion ──────────────────────────────────────────────────────
const AO_PX = 8; // per tile
// Darkness from walls (thin walls on edges, and anything that isn't floor: strong,
// wide) and solid furniture (soft, close), in plan
// space, one byte of alpha per AO pixel.
export function aoCanvas(map: MapDef, objects: WorldObjectDef[]): HTMLCanvasElement {
  const W = map.width;
  const H = map.height;
  const occ = new Float32Array(W * H); // 0..1 occluder strength per tile
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isFloor(tileAt(map, x, y))) occ[y * W + x] = 1;
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const o of objects) {
    const e = entry(o.kind);
    if (!e.solid || e.wall) continue;
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    boxes.push({ x0: o.x + 0.06, y0: o.y + 0.06, x1: o.x + w - 0.06, y1: o.y + h - 0.06 });
  }
  // footprints bucketed by the tiles they can darken, so each pixel checks a few
  const near: (typeof boxes)[] = Array.from({ length: W * H }, () => []);
  for (const b of boxes)
    for (let ty = Math.max(0, Math.floor(b.y0 - 0.5)); ty <= Math.min(H - 1, Math.floor(b.y1 + 0.5)); ty++)
      for (let tx = Math.max(0, Math.floor(b.x0 - 0.5)); tx <= Math.min(W - 1, Math.floor(b.x1 + 0.5)); tx++)
        near[ty * W + tx].push(b);
  const c = canvas(W * AO_PX, H * AO_PX);
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const img = g.createImageData(c.width, c.height);
  const RW = 0.95; // wall reach (tiles)
  const RO = 0.45; // furniture reach
  const fall = (d: number, R: number) => (d >= R ? 0 : (1 - d / R) ** 1.6);
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      const tx = Math.floor(px / AO_PX);
      const ty = Math.floor(py / AO_PX);
      let a: number;
      if (occ[ty * W + tx]) a = 0.6;
      else {
        const x = (px + 0.5) / AO_PX;
        const y = (py + 0.5) / AO_PX;
        let lit = 1;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = tx + dx;
            const ny = ty + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || !occ[ny * W + nx]) continue;
            const ddx = Math.max(nx - x, 0, x - (nx + 1));
            const ddy = Math.max(ny - y, 0, y - (ny + 1));
            lit *= 1 - 0.95 * fall(Math.hypot(ddx, ddy), RW);
          }
        // thin walls on edges nearby (0.2 thick)
        for (let Y = ty - 1; Y <= ty + 2; Y++)
          for (let X = tx - 1; X <= tx + 1; X++) {
            if (!isWallEdge(hWall(map, X, Y))) continue;
            const ddx = Math.max(X - x, 0, x - (X + 1));
            const ddy = Math.max(Math.abs(y - Y) - 0.1, 0);
            lit *= 1 - 0.95 * fall(Math.hypot(ddx, ddy), RW);
          }
        for (let X = tx - 1; X <= tx + 2; X++)
          for (let Y = ty - 1; Y <= ty + 1; Y++) {
            if (!isWallEdge(vWall(map, X, Y))) continue;
            const ddx = Math.max(Math.abs(x - X) - 0.1, 0);
            const ddy = Math.max(Y - y, 0, y - (Y + 1));
            lit *= 1 - 0.95 * fall(Math.hypot(ddx, ddy), RW);
          }
        for (const b of near[ty * W + tx]) {
          if (x < b.x0 - RO || x > b.x1 + RO || y < b.y0 - RO || y > b.y1 + RO) continue;
          const ddx = Math.max(b.x0 - x, 0, x - b.x1);
          const ddy = Math.max(b.y0 - y, 0, y - b.y1);
          lit *= 1 - 0.32 * fall(Math.hypot(ddx, ddy), RO);
        }
        a = (1 - lit) * 0.7;
      }
      const i = (py * c.width + px) * 4;
      img.data[i] = 26;
      img.data[i + 1] = 16;
      img.data[i + 2] = 10;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ── the bake ───────────────────────────────────────────────────────────────
export interface FloorChunk {
  x: number; // screen px (1×) of the chunk's top-left
  y: number;
  w: number;
  h: number;
}

export class FloorBake {
  readonly chunks: FloorChunk[] = [];
  private ao: HTMLCanvasElement;
  private byMat = new Map<string, [number, number][]>();
  private edges: [number, number, number, number][] = []; // plan rects (tiles) for strips
  private sills: [number, number, number, number][] = [];
  private stage: [number, number, number, number] | null = null;

  constructor(
    readonly map: MapDef,
    objects: WorldObjectDef[],
    readonly res: number,
    chunkPx = 1024,
  ) {
    const W = map.width;
    const H = map.height;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = tileAt(map, x, y);
        if (!isFloor(ch)) continue;
        const list = this.byMat.get(ch) ?? [];
        list.push([x, y]);
        this.byMat.set(ch, list);
        // material transitions on the right and bottom edges
        const r = tileAt(map, x + 1, y);
        if (isFloor(r) && r !== ch) this.edges.push([x + 1 - 0.035, y, 0.07, 1]);
        const b = tileAt(map, x, y + 1);
        if (isFloor(b) && b !== ch) this.edges.push([x, y + 1 - 0.035, 1, 0.07]);
      }
    for (const o of objects) {
      if (o.kind !== "door") continue;
      // across the door's edge: the north edge of its tile, or the west one
      if ((o.rot ?? 0) % 2 === 0) this.sills.push([o.x + 0.05, o.y - 0.1, 0.9, 0.2]);
      else this.sills.push([o.x - 0.1, o.y + 0.05, 0.2, 0.9]);
    }
    const st = map.areas.find((a) => a.kind === "stage");
    if (st) this.stage = [st.x, st.y + st.h - 0.04, st.w, 0.08];
    this.ao = aoCanvas(map, objects);
    // screen bounds of the floor, cut into chunks of `chunkPx` device px
    const x0 = -H * HW;
    const x1 = W * HW;
    const y1 = (W + H) * HH;
    const step = chunkPx / res;
    for (let y = 0; y < y1; y += step)
      for (let x = x0; x < x1; x += step)
        this.chunks.push({ x, y, w: Math.min(step, x1 - x), h: Math.min(step, y1 - y) });
  }

  // Draw one chunk (device px = screen px × res).
  draw(i: number): HTMLCanvasElement {
    const k = this.chunks[i];
    const res = this.res;
    const c = canvas(k.w * res, k.h * res);
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    // plan (u, v in px, T per tile) → screen → device
    g.setTransform((res * HW) / T, (res * HH) / T, (-res * HW) / T, (res * HH) / T, -k.x * res, -k.y * res);
    const visible = (x: number, y: number) => {
      const sx = (x - y) * HW;
      const sy = (x + y) * HH;
      return sx + HW >= k.x && sx - HW <= k.x + k.w && sy + 2 * HH >= k.y && sy <= k.y + k.h;
    };
    const ms = Math.round(T * res);
    const e = 0.6 / res; // overlap so materials meet without hairline gaps
    for (const [ch, tiles] of this.byMat) {
      const tex = materialCanvas(ch, ms);
      if (!tex) continue;
      const pat = g.createPattern(tex, "repeat");
      if (!pat) continue;
      pat.setTransform(new DOMMatrix().scale(T / ms));
      g.fillStyle = pat;
      g.beginPath();
      let any = false;
      for (const [x, y] of tiles) {
        if (!visible(x, y)) continue;
        g.rect(x * T - e, y * T - e, T + 2 * e, T + 2 * e);
        any = true;
      }
      if (any) g.fill();
    }
    // ambient occlusion, only where there's floor
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.globalCompositeOperation = "source-atop";
    g.drawImage(this.ao, 0, 0, this.map.width * T, this.map.height * T);
    g.globalCompositeOperation = "source-over";
    // strips between materials, door sills, the stage edge
    const strip = (r: [number, number, number, number], fill: string, hi: string) => {
      const [x, y, w, h] = r;
      if (!visible(Math.floor(x), Math.floor(y)) && !visible(Math.floor(x + w), Math.floor(y + h))) return;
      g.fillStyle = fill;
      g.fillRect(x * T, y * T, w * T, h * T);
      g.fillStyle = hi;
      if (w > h) g.fillRect(x * T, y * T, w * T, h * T * 0.35);
      else g.fillRect(x * T, y * T, w * T * 0.35, h * T);
    };
    for (const r of this.edges) strip(r, "#8d877a", "rgba(255,250,235,0.45)");
    for (const r of this.sills) {
      strip(r, "#3e2718", "rgba(255,220,170,0.12)");
      const [x, y, w, h] = r;
      strip(w > h ? [x, y + h * 0.35, w, h * 0.3] : [x + w * 0.35, y, w * 0.3, h], "#c39a4a", "rgba(255,240,200,0.5)");
    }
    if (this.stage) strip(this.stage, "#ffa630", "rgba(255,240,200,0.4)");
    return c;
  }
}

// Resolution for the floor bake: crisp, but never more than ~12 M pixels.
export function floorRes(map: MapDef, high: boolean): number {
  const px = (map.width + map.height) * HW * (map.width + map.height) * HH;
  return Math.min(high ? 1.5 : 1, Math.sqrt(12e6 / px));
}
