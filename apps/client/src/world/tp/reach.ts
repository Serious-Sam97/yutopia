import type { Quality } from "@/lib/prefs";

// How far what's round you is made (docs/plan/91-the-big-map.md phase 6): the near land (its blocks; the far land
// under it past that) and the districts (the roads, the buildings, the lamps past the town). By the tier — High,
// Medium and Low as they always were, the same pixels; Lowest and Potato nearer — and by the device's memory
// (`navigator.deviceMemory`: 4 GB or less, the districts no further than Lowest's). Settings may set them by hand
// (phase 9). The town and the park are parked past the districts' `gone` (grounds-stream.ts parkFar).

export interface Reach {
  /** the near land's blocks, out to here (m) */
  land: number;
  /** the districts made within this of you (m) */
  districts: number;
}

export const REACH: Record<Quality, Reach> = {
  high: { land: 440, districts: 900 },
  medium: { land: 440, districts: 900 },
  low: { land: 440, districts: 900 },
  lowest: { land: 440, districts: 700 },
  potato: { land: 330, districts: 600 },
};

/** A district's freed this much past its reach (made again when it's back in it: no flicker at the edge). */
export const GONE_PAST = 400;

/** The device's memory, GB (8 where the browser doesn't say). */
export function deviceMemory(): number {
  return (typeof navigator !== "undefined" && (navigator as Navigator & { deviceMemory?: number }).deviceMemory) || 8;
}

export function reachFor(tier: Quality, mem = deviceMemory()): Reach {
  const r = { ...REACH[tier] };
  if (mem <= 4) r.districts = Math.min(r.districts, REACH.lowest.districts);
  return r;
}
