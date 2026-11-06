import type { WorldObjectDef } from "./catalog.ts";
import type { StructOp } from "./structure/ops.ts";

// Build undo/redo. A step is what an edit changed: the things (each one as it was and as it is),
// and the structure's operations both ways (docs/plan/72 phase 11 — the building is the structure's:
// walls, floors, roofs, rooms, the floors themselves, the arrival point), so any edit — walls drawn,
// a room renamed, a floor added, a template — undoes the same way. Applying a step only touches
// what still looks the way the step left it: someone else's later edit on the same thing wins and
// is skipped; the structure's ops, if what they undo was changed since, not at all.

export interface Snapshot {
  objects: Map<string, string>; // id → JSON of the def
}

interface ObjChange {
  id: string;
  a: WorldObjectDef | null;
  b: WorldObjectDef | null;
}
export interface Step {
  label: string;
  objects: ObjChange[];
  // the structure's operations it made, and those that undo them
  struct?: { fwd: StructOp[]; back: StructOp[] };
}

export function snapshot(objects: Iterable<WorldObjectDef>): Snapshot {
  const m = new Map<string, string>();
  for (const o of objects) m.set(o.id, JSON.stringify(o));
  return { objects: m };
}

/** The things' change from one snapshot to the next (null: none). */
export function diffStep(before: Snapshot, after: Snapshot, label: string): Step | null {
  const step: Step = { label, objects: [] };
  const ids = new Set([...before.objects.keys(), ...after.objects.keys()]);
  for (const id of ids) {
    const ja = before.objects.get(id) ?? null;
    const jb = after.objects.get(id) ?? null;
    if (ja === jb) continue;
    step.objects.push({ id, a: ja ? JSON.parse(ja) : null, b: jb ? JSON.parse(jb) : null });
  }
  return step.objects.length ? step : null;
}

export interface StepResult {
  put: WorldObjectDef[];
  remove: string[];
  skipped: number; // things someone else changed since
}

// Undo ("back") or redo ("forward") a step's things against the current ones.
export function applyStep(objects: Iterable<WorldObjectDef>, step: Step, dir: "back" | "forward"): StepResult {
  const from = <T>(c: { a: T; b: T }) => (dir === "back" ? c.b : c.a);
  const to = <T>(c: { a: T; b: T }) => (dir === "back" ? c.a : c.b);
  const res: StepResult = { put: [], remove: [], skipped: 0 };
  const now = new Map<string, string>();
  for (const o of objects) now.set(o.id, JSON.stringify(o));
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

// A short name for what a builder message did ("Undo: painted floors").
export const STEP_LABELS: Record<string, string> = {
  "obj:put": "placed furniture",
  "obj:remove": "removed furniture",
  "obj:batch": "moved furniture",
  "obj:removeMany": "removed furniture",
  "dress:take": "moved decor",
  "dress:hide": "removed decor",
  "build:template": "switched a layout",
  "build:furnish": "furnished a room",
  "build:refurnish": "refurnished the floor",
  "build:christmas": "switched Christmas",
  "struct:walls": "drew walls",
  "struct:paint": "painted walls",
  "struct:slabs": "drew floors",
  "struct:roofs": "roofed",
  "map:room:update": "changed a room",
  "map:room:remove": "removed a room",
  "map:new": "started blank",
  "map:spawn": "moved the arrival point",
  "level:add": "added a floor",
  "level:remove": "took a floor away",
  "desk:assign": "assigned a desk",
};
export const HISTORY_LIMIT = 50;
