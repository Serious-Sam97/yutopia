// The map checks (docs/plan/114-the-strike-park.md, S-M6): every map measured against the competitive
// map's rules on its own walk grid, at CS's run speed. A map that fails isn't played.
//
//   - each team has its spawns, standable, apart;
//   - the sites (and hostages, the rescue) are reached by both teams;
//   - bomb maps: the Wardens reach each site first, by WARDEN_LEAD s or more, and the Raiders reach it
//     in RAID_TIME (not a sprint, not a hike);
//   - each site has two ways in from the Raiders' side at least (the main path blocked, there's still
//     one: the lanes);
//   - a Warden rotates between the sites in ROTATE s or less;
//   - nobody gets out: from the spawns, no node at the map's edge.

import { bestIn, CELL, distances, type Grid, gridOf, nodePos, nodesAt, pathOf } from "./grid.ts";
import { inRect, midOf, type Rect, type StrikeMap } from "./map.ts";

/** CS's run speed with a pistol (240 u/s): the timings' (m/s). */
export const RUN = 6.1;
export const WARDEN_LEAD = 3;
export const RAID_TIME: [number, number] = [9, 32];
export const ROTATE = 24;

export interface MapReport {
  key: string;
  ok: boolean;
  fails: string[];
  /** seconds: [team][place] */
  times: Record<string, Record<string, number>>;
  /** ways in to each site from the Raiders' side */
  lanes: Record<string, number>;
  rotate?: number;
  nodes: number;
}

const secs = (m: number) => Math.round((m / RUN) * 10) / 10;

/** The map's report. */
export function checkMap(map: StrikeMap): MapReport {
  const g = gridOf(map);
  const fails: string[] = [];
  const times: MapReport["times"] = { r: {}, w: {} };
  const lanes: Record<string, number> = {};
  const need = map.mode === "wingman" ? 2 : map.mode === "range" ? 1 : 5;
  for (const t of ["r", "w"] as const) {
    const ps = map.spawns[t];
    if (ps.length < need) fails.push(`${t}: ${ps.length} spawns, ${need} wanted`);
    const ns = nodesAt(g, ps);
    ns.forEach((n, i) => {
      if (n < 0) fails.push(`${t} spawn ${i} isn't standable`);
      else if (nodePos(g, n)[1] > 0.6 && map.mode !== "range") {
        // (a spawn up on something's all right; under one isn't: the grid's node is where you'd stand)
      }
    });
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++)
        if (Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]) < 1.2)
          fails.push(`${t} spawns ${i} and ${j} too close`);
    if (!inRect(map.buy[t], ps[0][0], ps[0][1])) fails.push(`${t}: its first spawn isn't in its buy zone`);
  }
  const from = { r: nodesAt(g, map.spawns.r), w: nodesAt(g, map.spawns.w) };
  const d = { r: distances(g, from.r), w: distances(g, from.w) };
  const places: [string, Rect][] = [];
  if (map.sites) {
    places.push(["A", map.sites.A]);
    if (map.sites.B) places.push(["B", map.sites.B]);
  }
  if (map.rescue) places.push(["rescue", map.rescue]);
  for (const [i, h] of (map.hostages ?? []).entries())
    places.push([`hostage ${i + 1}`, { x0: h[0] - 1, z0: h[1] - 1, x1: h[0] + 1, z1: h[1] + 1 }]);
  for (const [name, r] of places)
    for (const t of ["r", "w"] as const) {
      const m = bestIn(g, d[t], r);
      if (!Number.isFinite(m)) fails.push(`${t} can't reach ${name}`);
      times[t][name] = secs(m);
    }
  if (map.mode === "bomb" || map.mode === "wingman") {
    for (const [name] of places) {
      const tr = times.r[name];
      const tw = times.w[name];
      if (!(tw + WARDEN_LEAD <= tr))
        fails.push(`${name}: Wardens ${tw}s, Raiders ${tr}s — Wardens should be there ${WARDEN_LEAD}s first`);
      if (tr < RAID_TIME[0] || tr > RAID_TIME[1])
        fails.push(`${name}: Raiders ${tr}s, wanted ${RAID_TIME[0]}–${RAID_TIME[1]}s`);
      lanes[name] = waysIn(g, from.r, (places.find((p) => p[0] === name) as [string, Rect])[1]);
      if (map.mode === "bomb" && lanes[name] < 2) fails.push(`${name}: one way in from the Raiders' side`);
    }
  }
  if (map.mode === "hostage" && map.hostages) {
    // (the Wardens attack: the Raiders hold the hostages and get there first)
    for (let i = 0; i < map.hostages.length; i++) {
      const name = `hostage ${i + 1}`;
      if (!(times.r[name] + WARDEN_LEAD <= times.w[name])) fails.push(`${name}: Raiders should hold it first`);
    }
  }
  let rotate: number | undefined;
  if (map.sites?.B) {
    const a = nodesAt(g, [midOf(map.sites.A)]);
    const ds = distances(g, a);
    rotate = secs(bestIn(g, ds, map.sites.B));
    if (rotate > ROTATE) fails.push(`rotating A → B takes ${rotate}s, ${ROTATE}s at most`);
  }
  // nobody gets out
  const all = new Float64Array(g.hs.length);
  for (let n = 0; n < g.hs.length; n++) all[n] = Math.min(d.r[n], d.w[n]);
  for (let n = 0; n < g.hs.length; n++) {
    if (!Number.isFinite(all[n])) continue;
    const c = g.cellOf[n];
    const i = c % g.nx;
    const j = (c - i) / g.nx;
    if (i === 0 || j === 0 || i === g.nx - 1 || j === g.nz - 1) {
      const [x, y, z] = nodePos(g, n);
      fails.push(`someone gets to the map's edge at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
      break;
    }
  }
  return { key: map.key, ok: fails.length === 0, fails, times, lanes, rotate, nodes: g.hs.length };
}

/** How many ways into rectangle r from `from` (nodes): the shortest path's cells near the site's
 *  approach blocked (a corridor RADIUS wide), a way found again, up to 4. */
function waysIn(g: Grid, from: number[], r: Rect): number {
  const RADIUS = 4;
  const blocked = new Uint8Array(g.nx * g.nz);
  const [mx, mz] = midOf(r);
  const target = nodesAt(g, [[mx, mz]])[0];
  if (target < 0) return 0;
  let n = 0;
  for (; n < 4; n++) {
    const start = from.find((f) => f >= 0) ?? -1;
    const p = pathOf(g, start, target, blocked);
    if (!p) break;
    // block the path where it's between 6 and 30 m from the site (its approach; not the site itself,
    // not the spawn's end that every way shares)
    let any = false;
    for (const node of p) {
      const [x, , z] = nodePos(g, node);
      const dx = Math.max(r.x0 - x, 0, x - r.x1);
      const dz = Math.max(r.z0 - z, 0, z - r.z1);
      const out = Math.hypot(dx, dz);
      if (out < 6 || out > 30) continue;
      any = true;
      const ci = Math.floor((x - g.x0) / CELL);
      const cj = Math.floor((z - g.z0) / CELL);
      const k = Math.ceil(RADIUS / CELL);
      for (let j = cj - k; j <= cj + k; j++)
        for (let i = ci - k; i <= ci + k; i++)
          if (i >= 0 && j >= 0 && i < g.nx && j < g.nz && (i - ci) ** 2 + (j - cj) ** 2 <= k * k)
            blocked[j * g.nx + i] = 1;
    }
    if (!any) {
      n++;
      break;
    }
  }
  return n;
}
