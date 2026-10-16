import { entry, footprint, placedFootprint, type WorldObjectDef } from "./catalog.ts";

// Things on surfaces (mugs, monitors, the radio…) sit on a quarter-tile grid
// over the desk, table or shelf under them, Sims-style: a desk comes bare and
// you dress it with as many things as fit. props.c = [cx, cy] is the cell
// (0..3) of tile (x, y) that holds their back corner; their size is in cells.
export const Q = 4;

// Size in cells at rot 0 (tabletops by what they are, props.d).
const TOP_SIZE: Record<string, [number, number]> = {
  papers: [1, 1],
  mug: [1, 1],
  tapes: [1, 1],
  binder: [1, 1],
  succulent: [1, 1],
  vinyl: [2, 2],
  monitor: [2, 2],
  keyboard: [2, 1],
  desklamp: [1, 1],
  phone: [2, 2],
  cards: [1, 1],
  bell: [1, 1],
  book: [2, 1],
  photo: [1, 1],
};
const KIND_SIZE: Record<string, [number, number]> = {
  radio: [3, 2],
  coffee_machine: [3, 2],
  turntable: [3, 3],
  tv_portable: [2, 2],
  projector: [2, 2],
  computer: [2, 2],
};

export function topSize(o: { kind: string; rot?: number; props?: Record<string, unknown> }): [number, number] {
  const s = KIND_SIZE[o.kind] ?? TOP_SIZE[String(o.props?.d)] ?? [1, 1];
  return (o.rot ?? 0) % 2 ? [s[1], s[0]] : s;
}

// The cell its back corner is in (old tabletops without one: the middle).
export function topCell(o: WorldObjectDef): [number, number] {
  const c = o.props?.c;
  const ok = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < Q;
  if (Array.isArray(c) && ok(c[0]) && ok(c[1])) return [c[0], c[1]];
  const [w, h] = topSize(o);
  return [Math.max(0, Math.floor((Q - w) / 2)), Math.max(0, Math.floor((Q - h) / 2))];
}

// Its cells, in world cell units.
export function topRect(o: WorldObjectDef): { x: number; y: number; w: number; h: number } {
  const [cx, cy] = topCell(o);
  const [w, h] = topSize(o);
  return { x: o.x * Q + cx, y: o.y * Q + cy, w, h };
}

// Its middle, in world tiles.
export function topCentre(o: WorldObjectDef): { x: number; y: number } {
  const r = topRect(o);
  return { x: (r.x + r.w / 2) / Q, y: (r.y + r.h / 2) / Q };
}

// The same thing with its back corner on world cell (qx, qy).
export function topAt(o: WorldObjectDef, qx: number, qy: number): WorldObjectDef {
  const x = Math.floor(qx / Q);
  const y = Math.floor(qy / Q);
  return { ...o, x, y, props: { ...(o.props ?? {}), c: [qx - x * Q, qy - y * Q] } };
}

// The same thing with its middle as near (x, y) (world tiles) as the grid allows.
export function topNear(o: WorldObjectDef, x: number, y: number): WorldObjectDef {
  const [w, h] = topSize(o);
  return topAt(o, Math.round(x * Q - w / 2), Math.round(y * Q - h / 2));
}

// ── the host's own frame (rot-0 local tiles) ────────────────────────────────
export function hostLocal(o: WorldObjectDef, x: number, y: number): [number, number] {
  let lx = x - o.x;
  let ly = y - o.y;
  let { w: W, h: H } = footprint(o.kind, o.rot ?? 0);
  for (let i = 0; i < ((o.rot ?? 0) & 3); i++) {
    [lx, ly] = [ly, W - lx];
    [W, H] = [H, W];
  }
  return [lx, ly];
}
export function hostWorld(o: WorldObjectDef, lx: number, ly: number): [number, number] {
  const e = entry(o.kind);
  let x = lx;
  let y = ly;
  let W = e.w;
  let H = e.h;
  for (let i = 0; i < ((o.rot ?? 0) & 3); i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  return [o.x + x, o.y + y];
}

function covers(o: WorldObjectDef, x: number, y: number): boolean {
  const { w, h } = placedFootprint(o);
  return x >= o.x && x < o.x + w && y >= o.y && y < o.y + h;
}

// The item with a surface (desk, table, shelf…) covering a tile, if any.
export function surfaceAt(objects: WorldObjectDef[], tx: number, ty: number): WorldObjectDef | undefined {
  return objects.find((x) => entry(x.kind).surface !== undefined && covers(x, tx + 0.5, ty + 0.5));
}

// What a thing on a surface stands on: the surface under its middle, and only
// if all of it is on that surface's top (a shelf's top is narrower than it).
export function hostOf(objects: WorldObjectDef[], o: WorldObjectDef): WorldObjectDef | undefined {
  const c = topCentre(o);
  const host = objects.find((x) => x.id !== o.id && entry(x.kind).surface !== undefined && covers(x, c.x, c.y));
  if (!host) return undefined;
  const e = entry(host.kind);
  const [x0, y0, x1, y1] = e.top ?? [0, 0, e.w * Q, e.h * Q];
  const r = topRect(o);
  for (const [qx, qy] of [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ]) {
    const [lx, ly] = hostLocal(host, qx / Q, qy / Q);
    const eps = 1e-6;
    if (lx * Q < x0 - eps || lx * Q > x1 + eps || ly * Q < y0 - eps || ly * Q > y1 + eps) return undefined;
  }
  return host;
}

const overlap = (a: ReturnType<typeof topRect>, b: ReturnType<typeof topRect>) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A thing fits on a surface: all of it on one top, not on anything else there.
export function fitsOnSurface(others: WorldObjectDef[], o: WorldObjectDef): boolean {
  const rest = others.filter((x) => x.id !== o.id);
  if (!hostOf(rest, o)) return false;
  const r = topRect(o);
  return !rest.some((x) => entry(x.kind).onSurface && overlap(topRect(x), r));
}

// The things standing on a surface.
export function riders(host: WorldObjectDef, objects: WorldObjectDef[]): WorldObjectDef[] {
  if (entry(host.kind).surface === undefined) return [];
  return objects.filter((t) => {
    if (t.id === host.id || !entry(t.kind).onSurface) return false;
    const c = topCentre(t);
    return covers(host, c.x, c.y);
  });
}

// What stands on a surface rides along when it moves or turns (Sims-style):
// each keeps its spot on the top, in the host's own turned frame, and turns
// with it.
export function carried(before: WorldObjectDef, after: WorldObjectDef, objects: WorldObjectDef[]): WorldObjectDef[] {
  const turns = ((((after.rot ?? 0) - (before.rot ?? 0)) % 4) + 4) % 4;
  return riders(before, objects).map((t) => {
    const c = topCentre(t);
    const [lx, ly] = hostLocal(before, c.x, c.y);
    const [wx, wy] = hostWorld(after, lx, ly);
    return topNear({ ...t, rot: ((t.rot ?? 0) + turns) % 4 }, wx, wy);
  });
}

// ── bare furniture ───────────────────────────────────────────────────────────
// Desks, tables and shelves used to come with things drawn on them, and the
// radio and the coffee machine with their stands. Now each of those is its own
// thing: a room from before gets them as real objects, once (props.split marks
// it), so it looks the same and every piece can be moved, swapped or removed.
export const SPLIT_KINDS = [
  "desk",
  "coffee_table",
  "reception",
  "meeting_table",
  "tape_shelf",
  "radio",
  "coffee_machine",
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

type Spot = { d?: string; kind?: string; at: [number, number]; rot?: number; props?: Record<string, unknown> };

// What used to be drawn on each kind, in its rot-0 frame: [x, y] is the middle
// in local tiles, rot the turn it faces (0: towards −y, the sitter's side).
function spotsOf(o: WorldObjectDef): Spot[] {
  const r = hash(o.id);
  switch (o.kind) {
    case "desk": {
      const story = ["mug", "papers", "tapes", "mug"][Math.floor(r * 4)];
      return [
        { kind: "computer", at: [0.5, 0.75] },
        { kind: "computer", at: [1.5, 0.75] },
        { d: "keyboard", at: [0.5, 0.125] },
        { d: "keyboard", at: [1.5, 0.125] },
        { d: story, at: [1.0, 0.375] },
      ];
    }
    case "coffee_table":
      return [
        { d: "vinyl", at: [0.5, 0.5] },
        { d: "mug", at: [1.375, 0.375] },
      ];
    case "reception":
      return [
        { kind: "computer", at: [1.25, 0.5] },
        { d: "book", at: [2.25, 0.625] },
        { d: "bell", at: [2.625, 0.625] },
      ];
    case "meeting_table":
      return [
        { d: "phone", at: [5.0, 0.5] },
        { d: "cards", at: [0.625, 1.375] },
        { d: "papers", at: [2.75, 1.625] },
      ];
    case "tape_shelf":
      return [
        { d: "photo", at: [0.375, 0.375] },
        { d: "vinyl", at: [1.5, 0.5] },
      ];
    default:
      return [];
  }
}

// One object made bare: the things that were on it (new objects, ids derived
// from its own so a second run finds them), and itself marked as split.
export function splitBuiltIns(o: WorldObjectDef): { self: WorldObjectDef; add: WorldObjectDef[] } | null {
  if (!(SPLIT_KINDS as readonly string[]).includes(o.kind) || o.props?.split) return null;
  const self: WorldObjectDef = { ...o, props: { ...(o.props ?? {}), split: 1 } };
  if (o.kind === "radio" || o.kind === "coffee_machine") {
    // off its stand: the stand is a side table (a cupboard), the thing on top
    const host: WorldObjectDef = {
      id: `${o.id}-stand`,
      kind: o.kind === "radio" ? "side_table" : "cupboard",
      x: o.x,
      y: o.y,
      rot: o.rot ?? 0,
    };
    const on = topNear({ ...self, rot: o.rot ?? 0 }, o.x + 0.5, o.y + 0.5);
    on.props = { ...on.props, z: entry(host.kind).surface ?? 0 };
    return { self: on, add: [host] };
  }
  const z = entry(o.kind).surface ?? 0;
  const add = spotsOf(o).map((s, i) => {
    const [wx, wy] = hostWorld(o, s.at[0], s.at[1]);
    const t: WorldObjectDef = {
      id: `${o.id}-t${i}`,
      kind: s.kind ?? "tabletop",
      x: 0,
      y: 0,
      rot: ((s.rot ?? 0) + (o.rot ?? 0)) % 4,
      props: { ...(s.d ? { d: s.d } : {}), seed: hash(`${o.id}|${i}`), z },
    };
    return topNear(t, wx, wy);
  });
  return { self, add };
}

// A whole room made bare: hosts before what stands on them.
export function splitAll(objects: WorldObjectDef[]): { objects: WorldObjectDef[]; changed: WorldObjectDef[] } {
  const ids = new Set(objects.map((o) => o.id));
  const out: WorldObjectDef[] = [];
  const changed: WorldObjectDef[] = [];
  const later: WorldObjectDef[] = [];
  for (const o of objects) {
    const s = splitBuiltIns(o);
    if (!s) {
      (entry(o.kind).onSurface ? later : out).push(o);
      continue;
    }
    const fresh = s.add.filter((a) => !ids.has(a.id));
    const hosts = fresh.filter((a) => !entry(a.kind).onSurface);
    const tops = fresh.filter((a) => entry(a.kind).onSurface);
    if (entry(s.self.kind).onSurface) {
      out.push(...hosts);
      later.push(s.self, ...tops);
    } else {
      out.push(s.self, ...hosts);
      later.push(...tops);
    }
    changed.push(...hosts, s.self, ...tops);
  }
  return { objects: [...out, ...later], changed };
}
