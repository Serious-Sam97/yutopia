import type { GroundsEdits, Section } from "./grounds-edits.ts";

// An admin's draft of god mode's edits (docs/plan/53-the-god-mode.md § Draft, walk it, publish):
// what it changes against what's published (the strip's count, the publish's sums), and brought
// up to date when someone else publishes first — a three-way merge on what the draft was made
// on, the draft, and what's live: each chunk's grid and each keyed way, thing and building taken
// from whichever side changed it, the draft's kept where both did (and said). Plain data, no
// Grounds (the client's god mode chunk and the tests use it).

const GRIDS = ["height", "paint", "trees"] as const;
const SECTIONS = ["ways", "things", "buildings"] as const;
type Grid = (typeof GRIDS)[number];
type SectionName = (typeof SECTIONS)[number];

/** What a draft changes against another set, a kind at a time. */
export interface EditsCount {
  /** chunks whose heights differ */
  height: number;
  /** chunks whose painted tiles differ */
  paint: number;
  /** chunks whose tree cells differ */
  trees: number;
  ways: Moves;
  things: Moves;
  buildings: Moves;
  /** all of them */
  total: number;
}
export interface Moves {
  add: number;
  change: number;
  remove: number;
}

/** Where both changed the same thing: the draft's kept. */
export interface Overlap {
  kind: Grid | SectionName;
  key: string;
}

// a keyed entry's effect on the world: put there (whole), changed (those fields), taken away
type Effect = { add: Record<string, unknown> } | { change: Record<string, unknown> } | { remove: true };

function effects(s: Section<{ key: string }> | undefined): Map<string, Effect> {
  const out = new Map<string, Effect>();
  if (!s) return out;
  const gone = new Set(s.remove ?? []);
  const added = new Set<string>();
  for (const d of s.add ?? []) {
    added.add(d.key);
    // (put there and taken away: as if never)
    if (!gone.has(d.key)) out.set(d.key, { add: { ...d, ...(s.change?.[d.key] ?? {}) } });
  }
  for (const [k, c] of Object.entries(s.change ?? {}))
    if (!added.has(k) && !gone.has(k)) out.set(k, { change: { ...c } });
  for (const k of gone) if (!added.has(k)) out.set(k, { remove: true });
  return out;
}
function section(m: Map<string, Effect>): Section<{ key: string }> | undefined {
  if (!m.size) return undefined;
  const s: Required<Section<{ key: string }>> = { add: [], change: {}, remove: [] };
  for (const [k, e] of m) {
    if ("add" in e) s.add.push({ ...e.add, key: k } as { key: string });
    else if ("change" in e) s.change[k] = e.change;
    else s.remove.push(k);
  }
  const out: Section<{ key: string }> = {};
  if (s.add.length) out.add = s.add;
  if (Object.keys(s.change).length) out.change = s.change;
  if (s.remove.length) out.remove = s.remove;
  return out;
}
/** The same whatever order its fields were written in. */
function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}
function stable(v: unknown): string {
  if (v === undefined) return "u";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/** What `to` changes against `from` (a draft against what's published). */
export function editsCount(from: GroundsEdits, to: GroundsEdits): EditsCount {
  const n: EditsCount = {
    height: 0,
    paint: 0,
    trees: 0,
    ways: { add: 0, change: 0, remove: 0 },
    things: { add: 0, change: 0, remove: 0 },
    buildings: { add: 0, change: 0, remove: 0 },
    total: 0,
  };
  for (const g of GRIDS) {
    const a = from[g] ?? {};
    const b = to[g] ?? {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) n[g]++;
    n.total += n[g];
  }
  for (const s of SECTIONS) {
    const a = effects(from[s] as Section<{ key: string }> | undefined);
    const b = effects(to[s] as Section<{ key: string }> | undefined);
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k);
      const y = b.get(k);
      if (same(x, y)) continue;
      // (on both sides: changed, unless the draft takes it away; taken back to what's generated:
      // the opposite of what was published)
      const by: keyof Moves = y
        ? x && !("remove" in y)
          ? "change"
          : "add" in y
            ? "add"
            : "remove" in y
              ? "remove"
              : "change"
        : x && "add" in x
          ? "remove"
          : x && "remove" in x
            ? "add"
            : "change";
      n[s][by]++;
      n.total++;
    }
  }
  return n;
}

/** The draft made on `base`, brought up to date with what's live (`theirs`): what only one side
 *  changed, that side's; what both did, the draft's (each said in `overlaps`). Its `rev` is
 *  theirs'. */
export function mergeEdits(
  base: GroundsEdits,
  mine: GroundsEdits,
  theirs: GroundsEdits,
): { edits: GroundsEdits; overlaps: Overlap[] } {
  const out: GroundsEdits = { rev: theirs.rev };
  const overlaps: Overlap[] = [];
  const pick = <T>(kind: Overlap["kind"], key: string, b: T, m: T, t: T): T => {
    if (same(m, b)) return t;
    if (same(t, b) || same(m, t)) return m;
    overlaps.push({ kind, key });
    return m;
  };
  for (const g of GRIDS) {
    const b = base[g] ?? {};
    const m = mine[g] ?? {};
    const t = theirs[g] ?? {};
    const grid: Record<string, string> = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) {
      const v = pick(g, k, b[k], m[k], t[k]);
      if (v !== undefined) grid[k] = v;
    }
    if (Object.keys(grid).length) out[g] = grid;
  }
  for (const s of SECTIONS) {
    const b = effects(base[s] as Section<{ key: string }> | undefined);
    const m = effects(mine[s] as Section<{ key: string }> | undefined);
    const t = effects(theirs[s] as Section<{ key: string }> | undefined);
    const merged = new Map<string, Effect>();
    for (const k of new Set([...b.keys(), ...m.keys(), ...t.keys()])) {
      const v = pick(s, k, b.get(k), m.get(k), t.get(k));
      if (v) merged.set(k, v);
    }
    const sec = section(merged);
    if (sec) (out as Record<SectionName, unknown>)[s] = sec;
  }
  return { edits: out, overlaps };
}
