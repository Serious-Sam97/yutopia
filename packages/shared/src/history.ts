import type { WorldObjectDef } from "./catalog.ts";
import type { AreaDef, MapDef, Theme } from "./map.ts";

// Build undo/redo. A step is the difference between two snapshots of the
// studio (map + objects), so any edit — a drag of floor paint, a room, a
// template, a resize — undoes the same way. Applying a step only touches the
// parts that still look the way the step left them: someone else's later
// edit on the same tile or object wins and is skipped.

export interface Snapshot {
  map: MapDef;
  objects: Map<string, string>; // id → JSON of the def
}

type Layer = "t" | "h" | "v" | "hb" | "vb"; // tiles, walls, the walls' back faces
interface CellChange {
  l: Layer;
  x: number;
  y: number;
  a: string; // before
  b: string; // after
}
interface ObjChange {
  id: string;
  a: WorldObjectDef | null;
  b: WorldObjectDef | null;
}
export interface Step {
  label: string;
  cells: CellChange[];
  // a resize or blank start replaces the whole map
  full?: { a: MapDef; b: MapDef };
  areas?: { a: AreaDef[]; b: AreaDef[] };
  spawn?: { a: MapDef["spawn"]; b: MapDef["spawn"] };
  theme?: { a: Theme | undefined; b: Theme | undefined };
  objects: ObjChange[];
}

export function snapshot(map: MapDef, objects: Iterable<WorldObjectDef>): Snapshot {
  const m = new Map<string, string>();
  for (const o of objects) m.set(o.id, JSON.stringify(o));
  return { map, objects: m };
}

const blank = (walls: string[]) => walls.map((r) => ".".repeat(r.length));
const rows = (map: MapDef, l: Layer) =>
  l === "t"
    ? map.tiles
    : l === "h"
      ? map.hWalls
      : l === "v"
        ? map.vWalls
        : l === "hb"
          ? (map.hBacks ?? blank(map.hWalls))
          : (map.vBacks ?? blank(map.vWalls));
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffStep(before: Snapshot, after: Snapshot, label: string): Step | null {
  const a = before.map;
  const b = after.map;
  const step: Step = { label, cells: [], objects: [] };
  if (a.width !== b.width || a.height !== b.height) step.full = { a, b };
  else
    for (const l of ["t", "h", "v", "hb", "vb"] as const) {
      const ra = rows(a, l);
      const rb = rows(b, l);
      for (let y = 0; y < Math.max(ra.length, rb.length); y++) {
        const sa = ra[y] ?? "";
        const sb = rb[y] ?? "";
        if (sa === sb) continue;
        for (let x = 0; x < Math.max(sa.length, sb.length); x++)
          if (sa[x] !== sb[x]) step.cells.push({ l, x, y, a: sa[x] ?? "", b: sb[x] ?? "" });
      }
    }
  if (!step.full) {
    if (!sameJson(a.areas, b.areas)) step.areas = { a: a.areas, b: b.areas };
    if (!sameJson(a.spawn, b.spawn)) step.spawn = { a: a.spawn, b: b.spawn };
    if ((a.theme ?? "clouds") !== (b.theme ?? "clouds")) step.theme = { a: a.theme, b: b.theme };
  }
  const ids = new Set([...before.objects.keys(), ...after.objects.keys()]);
  for (const id of ids) {
    const ja = before.objects.get(id) ?? null;
    const jb = after.objects.get(id) ?? null;
    if (ja === jb) continue;
    step.objects.push({ id, a: ja ? JSON.parse(ja) : null, b: jb ? JSON.parse(jb) : null });
  }
  const empty = !step.full && !step.cells.length && !step.areas && !step.spawn && !step.theme && !step.objects.length;
  return empty ? null : step;
}

export interface StepResult {
  map: MapDef | null; // null: the map didn't change
  put: WorldObjectDef[];
  remove: string[];
  skipped: number; // parts someone else changed since
}

// Undo ("back") or redo ("forward") a step against the current studio.
export function applyStep(
  map: MapDef,
  objects: Iterable<WorldObjectDef>,
  step: Step,
  dir: "back" | "forward",
): StepResult {
  const from = <T>(c: { a: T; b: T }) => (dir === "back" ? c.b : c.a);
  const to = <T>(c: { a: T; b: T }) => (dir === "back" ? c.a : c.b);
  const res: StepResult = { map: null, put: [], remove: [], skipped: 0 };
  const now = new Map<string, string>();
  for (const o of objects) now.set(o.id, JSON.stringify(o));

  let next = map;
  if (step.full) {
    const f = from(step.full);
    if (map.width === f.width && map.height === f.height) next = { ...to(step.full), objects: map.objects };
    else res.skipped++;
  } else {
    const grid = {
      t: [...map.tiles],
      h: [...map.hWalls],
      v: [...map.vWalls],
      hb: [...rows(map, "hb")],
      vb: [...rows(map, "vb")],
    };
    let touched = false;
    for (const c of step.cells) {
      const r = grid[c.l];
      const row = r[c.y] ?? "";
      if ((row[c.x] ?? "") !== from(c)) {
        res.skipped++;
        continue;
      }
      r[c.y] = row.slice(0, c.x) + to(c) + row.slice(c.x + 1);
      touched = true;
    }
    if (touched) {
      const backs = [...grid.hb, ...grid.vb].some((r) => /[^.]/.test(r));
      next = {
        ...next,
        tiles: grid.t,
        hWalls: grid.h,
        vWalls: grid.v,
        hBacks: backs ? grid.hb : undefined,
        vBacks: backs ? grid.vb : undefined,
      };
    }
    if (step.areas) {
      if (sameJson(map.areas, from(step.areas))) next = { ...next, areas: to(step.areas) };
      else next = { ...next, areas: mergeAreas(map.areas, from(step.areas), to(step.areas)) };
    }
    if (step.spawn) {
      if (sameJson(map.spawn, from(step.spawn))) next = { ...next, spawn: to(step.spawn) };
      else res.skipped++;
    }
    if (step.theme) {
      if ((map.theme ?? "clouds") === (from(step.theme) ?? "clouds")) next = { ...next, theme: to(step.theme) };
      else res.skipped++;
    }
  }
  if (next !== map) res.map = next;

  for (const c of step.objects) {
    const cur = now.get(c.id) ?? null;
    const want = to(c);
    const was = from(c);
    if (cur !== (was ? JSON.stringify(was) : null)) {
      res.skipped++;
      continue;
    }
    if (want) res.put.push(want);
    else res.remove.push(c.id);
  }
  return res;
}

// Areas edited by someone else meanwhile: revert room by room, keeping theirs.
function mergeAreas(cur: AreaDef[], from: AreaDef[], to: AreaDef[]): AreaDef[] {
  const byKey = (l: AreaDef[]) => new Map(l.map((a) => [a.key, a]));
  const f = byKey(from);
  const t = byKey(to);
  const out: AreaDef[] = [];
  const seen = new Set<string>();
  for (const a of cur) {
    seen.add(a.key);
    const fa = f.get(a.key);
    const ta = t.get(a.key);
    if (fa && sameJson(fa, a)) {
      if (ta) out.push(ta); // revert ours; gone when the step added it
    } else out.push(a);
  }
  for (const [k, ta] of t) if (!seen.has(k) && !f.has(k)) out.push(ta); // the step removed it: back
  return out;
}

// A short name for what a builder message did ("Undo: painted floors").
export const STEP_LABELS: Record<string, string> = {
  "obj:put": "placed furniture",
  "obj:remove": "removed furniture",
  "obj:batch": "moved furniture",
  "obj:removeMany": "removed furniture",
  "dress:take": "moved decor",
  "dress:hide": "removed decor",
  "build:template": "switched a layout",
  "map:paint": "painted floors",
  "map:walls": "painted walls",
  "map:room": "made a room",
  "map:room:walls": "repainted a room",
  "map:room:update": "changed a room",
  "map:room:remove": "removed a room",
  "map:resize": "resized the studio",
  "map:new": "started blank",
  "map:theme": "changed the view",
  "map:spawn": "moved the arrival point",
  "desk:assign": "assigned a desk",
};
export const HISTORY_LIMIT = 50;
