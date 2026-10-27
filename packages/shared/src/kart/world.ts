// The circuit as a world for the kart (docs/plan/46-the-karts.md): the road's height (over the
// bridge, under it), what's underfoot (asphalt, the kerbs, a boost pad), the jump's kicker, and
// the walls: the snow banks either side (soft: a kart rides a little way up them) and the bridge's
// parapets. Read straight from the circuit's samples (park.ts); the pad under it is flat
// (`KART_PARK.h`), so this needs nothing of the Grounds.

import { KART_PARK } from "./land.ts";
import { TRACK_W as KART_TRACK_W, kartTrack, type Track, type TrackPoint, trackAt } from "./park.ts";
import type { KartGround, KartUnder, KartWorld } from "./sim.ts";

const H = KART_TRACK_W / 2;
const CELL = 8;
/** Where a kart's middle stops: short of the banks' foot (it rides up a little), the parapets. */
export const BANK_AT = H + 0.5;
export const PARAPET_AT = H - 0.05;

export interface OnTrack {
  /** the circuit's point abreast, its distance along the lap, how far off its middle (+ left) */
  p: TrackPoint;
  s: number;
  lat: number;
  /** the road's height there (the kicker's too) */
  y: number;
}

export interface TrackWorld extends KartWorld {
  track: Track;
  /** where (x, z) is on the circuit for a kart at height y, or null off it */
  locate(x: number, z: number, y: number): OnTrack | null;
}

/** The kicker's height over the road at `s`. */
export function rampAt(t: Track, s: number): number {
  const r = t.ramp;
  const d = r.s - s;
  if (d < 0 || d > r.len) return 0;
  const u = 1 - d / r.len;
  return r.h * u * u;
}

export function kartTrackWorld(t: Track = kartTrack(), o: { base?: number; surface?: KartGround } = {}): TrackWorld {
  const base = o.base ?? KART_PARK.h;
  const cells = new Map<number, number[]>();
  const key = (cx: number, cz: number) => cx * 65536 + cz;
  for (const [i, p] of t.pts.entries()) {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }
  const wrap = (s: number) => ((s % t.len) + t.len) % t.len;
  function locate(x: number, z: number, y: number): OnTrack | null {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best: OnTrack | null = null;
    let score = Number.POSITIVE_INFINITY;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const n of cells.get(key(cx + i, cz + j)) ?? []) {
          const p0 = t.pts[n];
          const along = (x - p0.x) * Math.cos(p0.a) + (z - p0.z) * Math.sin(p0.a);
          if (Math.abs(along) > 1.5) continue;
          const s = wrap(p0.s + along);
          const p = trackAt(t, s);
          const lat = (x - p.x) * Math.sin(p.a) - (z - p.z) * Math.cos(p.a);
          if (Math.abs(lat) > H + 6) continue;
          const ry = base + p.y + rampAt(t, s);
          // (the pass at the kart's height: the bridge, or the road under it)
          const sc = Math.abs(lat) * 0.1 + Math.abs(y - ry) + (ry > y + 1.5 ? 50 : 0);
          if (sc < score) {
            score = sc;
            best = { p, s, lat, y: ry };
          }
        }
    return best;
  }
  function under(x: number, z: number, y: number): KartUnder {
    const o2 = locate(x, z, y);
    if (!o2) return { y: base, ground: "deep" };
    const { p, s, lat } = o2;
    let ground: KartGround = o.surface ?? "asphalt";
    // the kerbs: on the inside of a corner, its last 1.2 m
    if (!o.surface && Math.abs(p.k) > 1 / 45 && p.y === 0 && -Math.sign(p.k) * lat > H - 1.2) ground = "kerb";
    let pad = false;
    for (const b of t.pads) {
      const d = wrap(s - b.s);
      if (d < 4.8 && Math.abs(lat - b.side * (H / 2)) < 1.4) pad = true;
    }
    return { y: o2.y, ground, pad };
  }
  function wall(x: number, z: number, y: number, r: number) {
    const o2 = locate(x, z, y);
    if (!o2) return null;
    const limit = (o2.p.y > 0.4 ? PARAPET_AT : BANK_AT) - r;
    const d = Math.abs(o2.lat);
    if (d <= limit) return null;
    const sg = Math.sign(o2.lat);
    // (back towards the middle: against the side it's off)
    return { nx: -sg * Math.sin(o2.p.a), nz: sg * Math.cos(o2.p.a), depth: d - limit };
  }
  return { track: t, locate, under, wall };
}
