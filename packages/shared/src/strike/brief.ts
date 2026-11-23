// (plan 118, F10a) The briefing hall's briefing: the map flown over, stop by stop — the whole of it, each side's
// start, the sites (or the hostages and the way out with them) — each with its line of the plan.
import { inRect, midOf, type P, type StrikeMap, TEAMS } from "./map.ts";

export interface BriefStop {
  /** the point looked at (the map's own coords) and how far over and back the camera is */
  at: P;
  far: number;
  /** the place's name and the plan's line */
  name: string;
  say: string;
}

/** The named place a point is in (a callout), or "". */
function callAt(map: StrikeMap, p: P): string {
  return map.calls.find((c) => inRect(c.r, p[0], p[1]))?.name ?? "";
}
const mean = (ps: P[]): P => [
  ps.reduce((t, p) => t + p[0], 0) / ps.length,
  ps.reduce((t, p) => t + p[1], 0) / ps.length,
];

/** The briefing's stops, in order. */
export function briefStops(map: StrikeMap): BriefStop[] {
  const R = TEAMS.r.name;
  const W = TEAMS.w.name;
  const out: BriefStop[] = [
    {
      at: midOf(map.size),
      far: Math.max(map.size.x1 - map.size.x0, map.size.z1 - map.size.z0) * 0.62,
      name: map.name,
      say: `${map.blurb.replace(/\.?$/, ".")} ${map.plays.charAt(0).toUpperCase()}${map.plays.slice(1)}`,
    },
  ];
  const rs = mean(map.spawns.r);
  const ws = mean(map.spawns.w);
  const near = (p: P) => callAt(map, p);
  if (map.sites) {
    out.push({
      at: rs,
      far: 30,
      name: near(rs) || `${R}' start`,
      say: `The ${R} start here: take a site and plant the charge — the round's yours when it goes off.`,
    });
    for (const k of ["A", "B"] as const) {
      const r = map.sites[k];
      if (!r) continue;
      const c = midOf(r);
      out.push({
        at: c,
        far: 26,
        name: `Site ${k}${near(c) ? ` · ${near(c)}` : ""}`,
        say: `Plant here (${R}). The ${W} hold it, or take it back and defuse before the fuse runs down.`,
      });
    }
    out.push({
      at: ws,
      far: 30,
      name: near(ws) || `${W}' start`,
      say: `The ${W} start here, nearer the sites: split up to hold both, rotate when one's hit.`,
    });
  } else if (map.hostages?.length) {
    out.push({
      at: ws,
      far: 30,
      name: near(ws) || `${W}' start`,
      say: `The ${W} start here: reach the hostages and walk them out.`,
    });
    const h = mean(map.hostages);
    out.push({
      at: h,
      far: 26,
      name: `The hostages${near(h) ? ` · ${near(h)}` : ""}`,
      say: `Held here, the ${R} guarding them. Hold E by one to pick them up (${W} only).`,
    });
    if (map.rescue) {
      const c = midOf(map.rescue);
      out.push({
        at: c,
        far: 26,
        name: `The way out${near(c) ? ` · ${near(c)}` : ""}`,
        say: `Carry one here (${W}): one brought out takes the round.`,
      });
    }
    out.push({
      at: rs,
      far: 30,
      name: near(rs) || `${R}' start`,
      say: `The ${R} start here: keep the hostages, or wipe the ${W} out.`,
    });
  } else {
    out.push({ at: rs, far: 30, name: near(rs) || `${R}' start`, say: `The ${R} start here.` });
    out.push({ at: ws, far: 30, name: near(ws) || `${W}' start`, say: `The ${W} start here.` });
  }
  return out;
}
/** Each stop's seconds (the first, the whole map, a little longer). */
export const BRIEF_SECS = 5;
