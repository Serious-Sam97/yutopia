// What the adapter must give back (docs/plan/72-the-3d-core.md, phase 6): a map turned into a
// structure and back reads the same — every floor's tiles, every edge's wall and both its faces,
// every room, the floors' places, names, spawns, the core. (Used by the tests and the migration's
// dry run; the raw arrays may differ only where they say nothing, e.g. back rows all ".".)
import { floorsOf, levelMap } from "../levels.ts";
import { backAt, hWall, type MapDef, spanOf, tileAt, vWall } from "../map.ts";
import { foldMap } from "./fold.ts";
import { structureFromMap } from "./from-map.ts";
import { mapFromStructure } from "./to-map.ts";

const norm = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x)
            .filter(([, y]) => y !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );

/** Where `b` doesn't read as `a` (empty: the same). */
export function mapDiff(a0: MapDef, b0: MapDef): string[] {
  const out: string[] = [];
  // (both in the world's frame: an older map folded first)
  const a = foldMap(a0);
  const b = foldMap(b0);
  const top = (m: MapDef) => ({
    key: m.key,
    name: m.name,
    spawn: m.spawn,
    core: m.core,
    floor: m.levels?.length ? (m.floor ?? 0) : undefined,
  });
  if (norm(top(a)) !== norm(top(b))) out.push(`top: ${norm(top(a))} vs ${norm(top(b))}`);
  const fa = floorsOf(a);
  const fb = floorsOf(b);
  if (norm(fa) !== norm(fb)) return [...out, `floors ${fa} vs ${fb}`];
  for (const f of fa) {
    const la = levelMap(a, f) as MapDef;
    const lb = levelMap(b, f) as MapDef;
    const da = a.levels?.find((l) => l.index === f);
    const db = b.levels?.find((l) => l.index === f);
    const head = (m: MapDef, d?: { spawn?: unknown; outdoor?: boolean }) => ({
      w: m.width,
      h: m.height,
      ox: m.ox ?? 0,
      oy: m.oy ?? 0,
      name: m.name,
      outdoor: !!d?.outdoor,
      spawn: d?.spawn,
    });
    if (norm(head(la, da)) !== norm(head(lb, db)))
      out.push(`floor ${f}: ${norm(head(la, da))} vs ${norm(head(lb, db))}`);
    const { x0, y0, x1, y1 } = spanOf(la);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (tileAt(la, x, y) !== tileAt(lb, x, y))
          out.push(`floor ${f} tile ${x},${y}: ${tileAt(la, x, y)} vs ${tileAt(lb, x, y)}`);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x < x1; x++) {
        const e = { dir: "h" as const, x, y };
        if (hWall(la, x, y) !== hWall(lb, x, y) || backAt(la, e) !== backAt(lb, e)) out.push(`floor ${f} h${x},${y}`);
      }
    for (let y = y0; y < y1; y++)
      for (let x = x0; x <= x1; x++) {
        const e = { dir: "v" as const, x, y };
        if (vWall(la, x, y) !== vWall(lb, x, y) || backAt(la, e) !== backAt(lb, e)) out.push(`floor ${f} v${x},${y}`);
      }
    if (norm(la.areas) !== norm(lb.areas)) out.push(`floor ${f} areas`);
  }
  return out;
}

/** A map through a structure and back: where it doesn't read the same (empty: it does). */
export const roundTrip = (m: MapDef): string[] => mapDiff(m, mapFromStructure(structureFromMap(m)));
