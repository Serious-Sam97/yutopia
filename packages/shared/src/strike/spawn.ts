// Where someone starts a round (docs/plan/117-bot-brains.md, the balance pass): their side's spawn — or, in Retakes,
// the Raiders round the charge already down on its site (CS's Retakes: the attackers start on the site, the
// defenders come back in), on the site's own floor, and the Wardens round it 24–34 m out by foot, out of its sight,
// each from another side (CS's: the retakers spawn round the site, from every way in, not at their base). The
// server and the bots' lab both place by it.

import { distances, type Grid, gridOf, nodeAt, nodeNear, nodePos } from "./grid.ts";
import { inRect, type Rect, type StrikeMap, shotThrough, type Team } from "./map.ts";
import type { Match } from "./match.ts";

/** The floor most of a rectangle stands at (a site on an upper storey isn't the ground under it). */
export function floorIn(g: Grid, r: Rect): number {
  const hist = new Map<number, number>();
  for (let x = r.x0 + 0.25; x < r.x1; x += 0.5)
    for (let z = r.z0 + 0.25; z < r.z1; z += 0.5) {
      const n = nodeAt(g, x, z);
      if (n < 0) continue;
      const h = Math.round(g.hs[n] * 2) / 2;
      hist.set(h, (hist.get(h) ?? 0) + 1);
    }
  let best = 0;
  let bn = -1;
  for (const [h, n] of hist)
    if (n > bn) {
      bn = n;
      best = h;
    }
  return best;
}

/** The i-th start of `team` this round: [x, y, z] in the map's local metres, on the floor. */
export function spawnPoint(m: Match, team: Team, i: number): [number, number, number] {
  const g = gridOf(m.map);
  const c = m.charge;
  if (m.mode.id === "retakes" && team === "r" && c?.state === "planted" && c.site && m.map.sites) {
    const site = (c.site === "B" ? m.map.sites.B : m.map.sites.A) ?? m.map.sites.A;
    const fy = floorIn(g, site);
    // (round the charge, 3–8 m out, apart: the post-plant's own spread)
    for (let k = 0; k < 24; k++) {
      const a = ((i * 5 + k) / 10) * Math.PI * 2 + 0.3;
      const r = 3 + ((i + k) % 3) * 2.5;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (!inRect(site, x, z, 6)) continue;
      const n = nodeNear(g, x, z, fy);
      if (n < 0) continue;
      const [nx, ny, nz] = nodePos(g, n);
      if (Math.abs(ny - fy) < 1) return [nx, ny, nz];
    }
    const n = nodeNear(g, c.x, c.z, fy);
    if (n >= 0) return nodePos(g, n);
  }
  if (m.mode.id === "retakes" && team === "w" && c?.state === "planted" && c.site && m.map.sites) {
    const ring = ringOf(
      m.map,
      g,
      c.x,
      c.z,
      floorIn(g, (c.site === "B" ? m.map.sites.B : m.map.sites.A) ?? m.map.sites.A),
    );
    if (ring.length) {
      // (the round turns the ring: a different way in for each of them each round)
      const sectors = 4;
      const at = (i + m.round) % sectors;
      for (let k = 0; k < sectors; k++) {
        const sec = ring.filter((q) => q.sec === (at + k) % sectors);
        if (!sec.length) continue;
        const q = sec[(m.round * 7 + i * 13) % sec.length];
        return nodePos(g, q.n);
      }
    }
  }
  const ps = m.map.spawns[team];
  const [x, z] = ps[i % ps.length];
  const n = nodeNear(g, x, z);
  return n >= 0 ? [x, nodePos(g, n)[1], z] : [x, 0, z];
}

/** The Retakes Wardens' ring round a charge: nodes 24–34 m from it on foot, out of its sight, in four quarters
 *  round it (made once a map and charge). */
const rings = new Map<string, { n: number; sec: number }[]>();
function ringOf(map: StrikeMap, g: Grid, cx: number, cz: number, fy: number): { n: number; sec: number }[] {
  const key = `${map.key}:${cx.toFixed(1)}:${cz.toFixed(1)}`;
  const had = rings.get(key);
  if (had) return had;
  const from = nodeNear(g, cx, cz, fy);
  const out: { n: number; sec: number }[] = [];
  if (from >= 0) {
    const ds = distances(g, [from]);
    const [, cy] = nodePos(g, from);
    for (let n = 0; n < ds.length; n += 3) {
      if (!(ds[n] >= 24 && ds[n] <= 34)) continue;
      const [x, y, z] = nodePos(g, n);
      if (shotThrough(map, [x, y + 1.6, z], [cx, cy + 0.5, cz]).walls === 0) continue;
      const a = Math.atan2(z - cz, x - cx);
      out.push({ n, sec: Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4) % 4 });
    }
  }
  rings.set(key, out);
  return out;
}
