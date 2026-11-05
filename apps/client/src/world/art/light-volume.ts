import { STOREY, tileAt } from "@yutopia/shared";
import { DataUtils } from "three";
import type { RGB } from "./daylight";
import type { LightMap, LightSource, Rect } from "./light";

// The light volume (docs/plan/72-the-3d-core.md, phase 9): a floor's light in three dimensions — VPX
// samples a metre across, LAYERS up its storey from the floor (layer 0 the floor itself, the last
// the slab over it) — sampled by the 3D view where a face is. Its lamps, its windows' pools and what
// stands in their way are the floor's (art/light.ts LightMap: the walls and shut doors, a lamp's
// line to a point ray-marched across the tiles — a wall stands the storey, so what a lamp sees is
// the same at every height).
//
// Each lamp sits where its light comes from (its LightSource.z: a floor lamp's shade, a pendant's,
// a sign on the wall; a window's pool at the window's middle). The floor is lit as the light map
// always lit it (its lamps a little over the floor, H0): a lamp at z is given the reach and the
// strength that make its light on the floor what it was —
//   R'² = R² + z² − H0²,   I' = I · (R'/R)⁴
// — so what its height changes is above the floor: the walls, the furniture, the people, lit by how
// far they are from it in three dimensions (the user's pick, 2026-11-05: "Real heights").

export const VPX = 4; // samples a metre, across
export const LAYERS = 8; // up the storey: layer 0 the floor, LAYERS−1 the slab over it
const H0 = 0.35; // the light map's lamps' height: no hot pinpoint nearer than this

/** How high a source's light comes from over its floor (m). */
const zOf = (s: LightSource, win: boolean): number => Math.max(H0, win ? 1.3 : (s.z ?? 1));

/** Its reach (m) and its strength, its height taken in (see the top). */
function reachOf(s: LightSource, win: boolean): { R2: number; I: number; z: number } {
  const z = zOf(s, win);
  const R2 = s.radius * s.radius + z * z - H0 * H0;
  return { R2, I: s.intensity * (R2 / (s.radius * s.radius)) ** 2, z };
}

/** Where a source's light goes on the floor's plan (m). */
export function lightReach(q: { s: LightSource; win: boolean }): Rect {
  const R = Math.sqrt(reachOf(q.s, q.win).R2);
  return { x0: q.s.x - R, y0: q.s.y - R, x1: q.s.x + R, y1: q.s.y + R };
}

export class LightVolume {
  readonly w: number; // samples across (x)
  readonly h: number; // … and down the plan (y)
  readonly d = LAYERS;
  /** per sample: the lamps' light (r, g, b) and the windows' strength (a), as half floats — the very
   *  array its texture sends the GPU (tp/light3d.ts): one copy, 8 bytes a sample */
  readonly data: Uint16Array;

  /** `prev`: the same floor's volume before an edit — the light of every source the edit can't
   *  change kept from it; only the sources whose reach meets what changed (a wall, a door, a tile, the
   *  source itself) added again, inside their reach. */
  constructor(
    readonly lm: LightMap,
    prev?: LightVolume,
  ) {
    const W = lm.map.width;
    const H = lm.map.height;
    this.w = W * VPX;
    this.h = H * VPX;
    this.data = new Uint16Array(this.w * this.h * this.d * 4);
    const again = prev && prev.w === this.w && prev.h === this.h ? lm.changedSince(prev.lm, lightReach) : null;
    if (!prev || !again) {
      for (const q of lm.sources) this.add(q.s, q.win);
      return;
    }
    // (an edit: the light before kept, made again where the sources it touches reach — a half float's
    // zero is 0)
    this.data.set(prev.data);
    const rects = again.map((r) => this.samples(r));
    const plane = this.w * this.h;
    for (const r of rects)
      for (let k = 0; k < this.d; k++)
        for (let py = r.y0; py <= r.y1; py++)
          this.data.fill(0, (k * plane + py * this.w + r.x0) * 4, (k * plane + py * this.w + r.x1 + 1) * 4);
    for (const q of lm.sources) {
      const r = this.samples(lightReach(q));
      if (rects.some((o) => r.x0 <= o.x1 && o.x0 <= r.x1 && r.y0 <= o.y1 && o.y0 <= r.y1)) this.add(q.s, q.win, rects);
    }
  }

  /** A layer's height over the floor (m). */
  static layerY(k: number): number {
    return (k / (LAYERS - 1)) * STOREY;
  }

  // a plan rectangle (m) as the samples in it (inclusive, clamped)
  private samples(r: Rect): { x0: number; y0: number; x1: number; y1: number } {
    return {
      x0: Math.max(0, Math.floor(r.x0 * VPX)),
      x1: Math.min(this.w - 1, Math.ceil(r.x1 * VPX)),
      y0: Math.max(0, Math.floor(r.y0 * VPX)),
      y1: Math.min(this.h - 1, Math.ceil(r.y1 * VPX)),
    };
  }

  // a source's light added (`only`: in these samples alone)
  private add(s: LightSource, win: boolean, only?: { x0: number; y0: number; x1: number; y1: number }[]) {
    const { R2, I, z } = reachOf(s, win);
    const [cr, cg, cb] = [((s.color >> 16) & 255) / 255, ((s.color >> 8) & 255) / 255, (s.color & 255) / 255];
    const { x0, x1, y0, y1 } = this.samples(lightReach({ s, win }));
    const plane = this.w * this.h;
    const dv = new Float32Array(this.d);
    for (let k = 0; k < this.d; k++) dv[k] = Math.max(H0, Math.abs(LightVolume.layerY(k) - z));
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        if (only && !only.some((q) => px >= q.x0 && px <= q.x1 && py >= q.y0 && py <= q.y1)) continue;
        const x = (px + 0.5) / VPX;
        const y = (py + 0.5) / VPX;
        const dxy2 = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (dxy2 + H0 * H0 >= R2) continue;
        // (the walls stand the storey: what it sees from here it sees at every height)
        if (!this.lm.sees(s, x, y)) continue;
        const col = py * this.w + px;
        for (let k = 0; k < this.d; k++) {
          const d2 = dxy2 + dv[k] * dv[k];
          if (d2 >= R2) continue;
          const f = (1 - d2 / R2) ** 2 * I;
          const i = (k * plane + col) * 4;
          if (win) this.put(i + 3, f);
          else {
            this.put(i, cr * f);
            this.put(i + 1, cg * f);
            this.put(i + 2, cb * f);
          }
        }
      }
  }

  // (a half float added to)
  private put(i: number, v: number) {
    this.data[i] = DataUtils.toHalfFloat(DataUtils.fromHalfFloat(this.data[i]) + v);
  }

  /** What's at a sample, a float (`c`: r, g, b, the windows' a). */
  at(i: number): number {
    return DataUtils.fromHalfFloat(this.data[i]);
  }

  /** The light at a point of the floor (its own frame, m; `up` over its floor), the hour's ambient
   *  and the windows' daylight in it (`out`: the ambient under the open sky), each part clamped to 1
   *  as the 3D view's shader puts them together — as 0xRRGGBB (a person's tint). */
  tintAt(x: number, y: number, up: number, ambient: RGB, win: RGB, out: RGB = ambient): number {
    const fx = Math.max(0, Math.min(this.w - 1.001, x * VPX - 0.5));
    const fy = Math.max(0, Math.min(this.h - 1.001, y * VPX - 0.5));
    const fz = Math.max(0, Math.min(this.d - 1.001, (up / STOREY) * (this.d - 1)));
    const [ix, iy, iz] = [Math.floor(fx), Math.floor(fy), Math.floor(fz)];
    const [tx, ty, tz] = [fx - ix, fy - iy, fz - iz];
    const plane = this.w * this.h;
    const at = (c: number) => {
      let v = 0;
      for (let dz = 0; dz < 2; dz++)
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const k = ((iz + dz) * plane + (iy + dy) * this.w + ix + dx) * 4 + c;
            v += this.at(k) * (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
          }
      return v;
    };
    const ch = tileAt(this.lm.map, Math.floor(x), Math.floor(y));
    const amb = ch === "a" || ch === "c" ? out : ambient;
    const w = Math.min(1, at(3));
    let rgb = 0;
    for (let c = 0; c < 3; c++) rgb = (rgb << 8) | Math.round(Math.min(1, amb[c] + at(c) + win[c] * w) * 255);
    return rgb;
  }
}
