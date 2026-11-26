// A group's day (docs/plan/128-animal-minds.md, F4a): where it beds (cover), where it feeds, where it drinks — found on
// the land round its home within its range (traits.ts), the same every time for the same group (its id seeds the
// look), so it walks the same ways between them every day and its prints in the snow wear trails. Pure.
import { habitatAt } from "./habitat.ts";
import { ANIMALS, type AnimalKind, type Habitat } from "./species.ts";
import { traitsOf } from "./traits.ts";

export interface P {
  x: number;
  z: number;
}
export interface DayPlaces {
  /** where it beds down (its den's own for a den) */
  bed: P;
  /** its feeding grounds, best first */
  feed: P[];
  /** where it drinks (a bank), if it drinks and there's water in reach */
  water: P | null;
}

const score = (w: Partial<Record<Habitat, number>>, want: Partial<Record<Habitat, number>>) => {
  let best = 0;
  for (const k of Object.keys(want) as Habitat[]) {
    const a = w[k];
    const b = want[k];
    if (a && b) best = Math.max(best, a * b);
  }
  return best;
};
function unit(s: string, k: number): number {
  let h = 2166136261 ^ k;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Can it stand there: true, false, or unknown (null: its land not made yet — taken as yes, the way there finds out). */
export type CanStand = (kind: AnimalKind, x: number, z: number) => boolean | null;

/** A group's places, looked for round its home (`den`: it beds at home — a den, a nest, a roost God mode put). */
export function dayPlaces(g: { id: string; species: AnimalKind; x: number; z: number; den?: boolean }, canStand: CanStand): DayPlaces | null {
  const t = traitsOf(g.species);
  if (!t.range) return null;
  const d = ANIMALS[g.species];
  const home = { x: g.x, z: g.z };
  const turn = unit(g.id, 1) * Math.PI * 2;
  const pts: { x: number; z: number; bed: number; feed: number; bank: boolean; r: number }[] = [];
  for (const f of [0, 0.18, 0.38, 0.6, 0.85]) {
    const n = f === 0 ? 1 : Math.round(6 + f * 12);
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2 + f * 1.3;
      const r = f * t.range;
      const x = g.x + Math.cos(a) * r;
      const z = g.z + Math.sin(a) * r;
      const w = habitatAt(x, z);
      // (open water: a swimmer's ground, a walker's never)
      if (w.water && !d.swims) {
        continue;
      }
      if (canStand(g.species, x, z) === false) continue;
      pts.push({ x, z, bed: score(w, t.bed), feed: score(w, t.feed), bank: !!w.shore && !w.water, r });
    }
  }
  if (!pts.length) return { bed: home, feed: [home], water: null };
  // a bed in its cover: the best, nearer home on a tie (a den's is home)
  const bed = g.den
    ? home
    : pts.reduce((b, p) => (p.bed > b.bed + 0.05 || (Math.abs(p.bed - b.bed) <= 0.05 && p.r < b.r) ? p : b), pts[0]);
  // feeding grounds: the best few, apart (a quarter of its range), not its bed
  const feed: P[] = [];
  for (const p of [...pts].sort((a, b) => b.feed - a.feed || a.r - b.r)) {
    if (p.feed < 0.25 || feed.length >= 3) break;
    if (Math.hypot(p.x - bed.x, p.z - bed.z) < t.range * 0.15) continue;
    if (feed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < t.range * 0.25)) continue;
    feed.push({ x: p.x, z: p.z });
  }
  if (!feed.length) {
    // (nothing it likes in reach: round home, as before)
    const p = pts[Math.floor(unit(g.id, 2) * pts.length)];
    feed.push({ x: p.x, z: p.z });
  }
  // water: the nearest bank in reach (it drinks)
  let water: P | null = null;
  if (t.drinks) {
    let bd = Number.POSITIVE_INFINITY;
    for (const p of pts)
      if (p.bank) {
        const q = Math.hypot(p.x - bed.x, p.z - bed.z);
        if (q < bd) {
          bd = q;
          water = { x: p.x, z: p.z };
        }
      }
  }
  return { bed: { x: bed.x, z: bed.z }, feed, water };
}

/** Is (x, z) at `p` (within `r` m)? */
export const at = (a: P, p: P | null | undefined, r: number) => !!p && Math.hypot(a.x - p.x, a.z - p.z) <= r;

