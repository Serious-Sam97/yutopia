// The town's buildings' insides as floors of the one structure (docs/plan/112-the-insides.md): a building you walk
// into is given a space — a floor a storey, numbered from SPACE_BASE, at its real height (the land under it, its
// door's sill, its storeys'), its plot the floor's grid; its shell's walls there for the tools (flagged `shell`: the
// kit draws them, the Grounds' solids hold them; never moved nor erased), their windows and door as gaps; a slab
// over the inside of each storey, the upper ones open over a starting staircase. The world server lays them (the
// Grounds and the kit are heavy: not a page's import).

import { KINDS, type KitKind, layoutOf } from "../building-styles.ts";
import type { WorldObjectDef } from "../catalog.ts";
import { CATALOG, entry, quarterYaw } from "../catalog.ts";
import { BUILDINGS, type Building, type Fit, furnishingsOf, groundAt } from "../grounds.ts";
import { SPACE_BASE, SPACE_TOP } from "../levels.ts";
import { kindSolids } from "../shapes/index.ts";
import { STAIRS_D, STAIRS_W, stairsDoor, stairsPoint, stairsWell } from "../stairs.ts";
import { SLAB, WALL_T } from "../units.ts";
import { FURNISHED, STAIRS } from "./furnish-layouts.ts";
import { frameOf, type Layout, layoutThings, stairsAt, toWorld } from "./furnishings.ts";
import type { StructOp } from "./ops.ts";
import type { Floor, Ring, Slab, Structure, Wall, XY } from "./types.ts";

/** Whether a building has a space: one of the kit's you walk into (not the skate hall, the HQ, the stored blocks). */
export function hasSpace(b: Building): boolean {
  if (b.stored || b.kind === "hq") return false;
  const kd = KINDS[b.kind as KitKind];
  return !!kd?.enter && !!layoutOf(b);
}

/** The town's buildings that have a space. */
export const spaceBuildings = (): Building[] => BUILDINGS.filter(hasSpace);

/** A building's storeys inside: each one's floor over the land (the first its door's sill) and how high its walls
 *  stand (to the slab over it; the top one to its eaves). */
export function storeysOf(b: Building): { y: number; ceil: number }[] {
  const L = layoutOf(b);
  if (!L) return [];
  const sill = Math.max(0, L.door.y);
  const ys = L.storeys && L.storeys.length >= 2 ? [...L.storeys] : [sill, L.eave];
  ys[0] = sill;
  const out: { y: number; ceil: number }[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const top = i === ys.length - 2;
    const rise = ys[i + 1] - ys[i];
    if (rise < 2) continue;
    out.push({ y: ys[i], ceil: r3(top ? Math.min(rise, L.eave - ys[i]) : rise - SLAB) });
  }
  return out.length ? out : [{ y: sill, ceil: r3(Math.max(2.2, L.eave - sill)) }];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The tile a staircase starts on, turned, for a building's storeys: against a side wall by the front, its landing
 *  into the room, clear of the doorway (null: none fits). */
export function starterStairs(b: Building): { x: number; y: number; rot: number } | null {
  const L = layoutOf(b);
  if (!L) return null;
  const d = L.door;
  // (the doorway's approach inside: 2.5 m in from the door, 2 m wide)
  const inX = d.x - d.ox * 1.25;
  const inZ = d.z - d.oz * 1.25;
  const clear = (x0: number, y0: number, x1: number, y1: number) =>
    x1 <= inX - 1.2 || x0 >= inX + 1.2 || y1 <= inZ - 1.4 || y0 >= inZ + 1.4;
  let best: { x: number; y: number; rot: number; k: number } | null = null;
  for (let rot = 0; rot < 4; rot++) {
    const [w, h] = rot % 2 ? [STAIRS_D, STAIRS_W] : [STAIRS_W, STAIRS_D];
    for (let y = b.z0; y + h <= b.z1; y++)
      for (let x = b.x0; x + w <= b.x1; x++) {
        // (against a wall: on the plot's edge one way at least)
        const edge = x === b.x0 || y === b.z0 || x + w === b.x1 || y + h === b.z1;
        if (!edge || !clear(x, y, x + w, y + h)) continue;
        const o = { x, y, yaw: quarterYaw(rot) };
        const at = stairsDoor(o);
        // (its landing's door looking into the room, not at a wall)
        if (at.x < b.x0 + 0.5 || at.x > b.x1 - 0.5 || at.y < b.z0 + 0.5 || at.y > b.z1 - 0.5) continue;
        const k = Math.hypot(at.x - inX, at.y - inZ);
        if (!best || k < best.k) best = { x, y, rot, k };
      }
  }
  return best && { x: best.x, y: best.y, rot: best.rot };
}

/** A building's space as it's first laid: its floors (given the indexes not taken in `st`), the slabs over each
 *  storey's inside, its shell's walls, and the starting staircases (things: `props.level` their storey). */
export function laySpace(
  st: Structure,
  b: Building,
): { floors: Floor[]; slabs: Slab[]; walls: Wall[]; things: WorldObjectDef[] } | null {
  const L = layoutOf(b);
  if (!L || !hasSpace(b)) return null;
  const storeys = storeysOf(b);
  const taken = new Set(st.floors.map((f) => f.index));
  const free: number[] = [];
  for (let i = SPACE_BASE; i < SPACE_TOP && free.length < storeys.length; i++) if (!taken.has(i)) free.push(i);
  if (free.length < storeys.length) return null;
  const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  const t = WALL_T / 2;
  const inner: Ring = [
    [b.x0 + t, b.z0 + t],
    [b.x1 - t, b.z0 + t],
    [b.x1 - t, b.z1 - t],
    [b.x0 + t, b.z1 - t],
  ];
  // (plan 113: a building's own layout's stairs, placed by hand; else the starting rule's)
  const layout = layoutFor(b);
  const stairs = storeys.length > 1 ? (layout?.stairs ? stairsAt(b, layout.stairs) : starterStairs(b)) : null;
  const floors: Floor[] = [];
  const slabs: Slab[] = [];
  const walls: Wall[] = [];
  const things: WorldObjectDef[] = [];
  const top = topOf(b);
  storeys.forEach((s, i) => {
    const index = free[i];
    const z = r3(y0 + s.y);
    floors.push({
      index,
      name: `${b.name} · ${storeyName(i)}`,
      z,
      grid: { x0: b.x0, y0: b.z0, w: b.x1 - b.x0, h: b.z1 - b.z0 },
      space: b.key,
      storey: i,
      ceil: s.ceil,
      ...(turnOf(b) !== undefined ? { turn: turnOf(b) } : {}),
      // (plan 123: laid now, its layout's later additions with it)
      ...(i === 0 && additionsOf(layout) ? { added: additionsOf(layout) } : {}),
    });
    // (the floor over the stairs from the storey below: open there)
    const holes: Ring[] = [];
    if (stairs && i > 0) holes.push(wellRing({ x: stairs.x, y: stairs.y, yaw: quarterYaw(stairs.rot) }));
    slabs.push({ id: `sp-${b.key}-${i}`, floor: index, z, top, outline: inner, holes });
    walls.push(...shellWalls(b, L.walls, index, i, s.y, z, s.ceil));
    // (its own rooms' walls, by hand: plan 113)
    const fr = frameOf(b);
    if (fr)
      (layout?.walls ?? []).forEach((w, k) => {
        if (w.storey !== i) return;
        const a = toWorld(fr, w.a[0], w.a[1]);
        const c = toWorld(fr, w.b[0], w.b[1]);
        walls.push({
          id: `sp-${b.key}-w${k}`,
          floor: index,
          a: [r3(a[0]), r3(a[1])],
          b: [r3(c[0]), r3(c[1])],
          base: z,
          height: s.ceil,
          front: "p",
        });
      });
    if (stairs && i < storeys.length - 1)
      things.push({
        id: `sp-${b.key}-stairs-${i}`,
        kind: "stairs",
        x: stairs.x,
        y: stairs.y,
        yaw: quarterYaw(stairs.rot),
        refId: null,
        props: { level: index },
      });
  });
  return { floors, slabs, walls, things };
}

const storeyName = (i: number) =>
  ["ground floor", "first floor", "second floor", "third floor", "fourth floor"][i] ?? `floor ${i}`;

/** A building's floors' top as the build tool's floor chars ("." wood, "," carpet, "_" tile). */
function topOf(b: Building): string {
  switch (b.kind) {
    case "shop":
    case "cornershop":
    case "diner":
    case "clinic":
    case "gas":
    case "fire":
    case "police":
    case "garage":
      return "_";
    case "hotel":
    case "office":
    case "library":
      return ",";
    // (a barn's, a shed's, a boathouse's: old dark boards — plan 113)
    case "barn":
    case "shed":
    case "boathouse":
      return "~";
    default:
      return ".";
  }
}

function wellRing(o: { x: number; y: number; yaw?: number }): Ring {
  const cells = stairsWell(o);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs) + 1, Math.min(...ys), Math.max(...ys) + 1];
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** A storey's shell: the plot's four edges as walls (where the Grounds' inside walls stand), each with the kit's
 *  openings in it as gaps (its windows', its door's) over this storey. */
function shellWalls(
  b: Building,
  kws: {
    a: [number, number];
    b: [number, number];
    y0: number;
    y1: number;
    holes: { s0: number; s1: number; y0: number; y1: number }[];
  }[],
  floor: number,
  storey: number,
  sy: number,
  z: number,
  ceil: number,
): Wall[] {
  const corners: XY[] = [
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x1, b.z1],
    [b.x0, b.z1],
  ];
  const out: Wall[] = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const c = corners[(e + 1) % 4];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const ux = (c[0] - a[0]) / len;
    const uy = (c[1] - a[1]) / len;
    const gaps: [number, number, number, number][] = [];
    for (const k of kws) {
      // (a kit wall on this edge's line, within 0.3 m of it — its own drawn a little in)
      const off = (p: [number, number]) => (p[0] - a[0]) * -uy + (p[1] - a[1]) * ux;
      if (Math.abs(off(k.a)) > 0.3 || Math.abs(off(k.b)) > 0.3) continue;
      const kl = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
      if (kl < 1e-6) continue;
      const along = (s: number): number => {
        const x = k.a[0] + ((k.b[0] - k.a[0]) / kl) * s;
        const y = k.a[1] + ((k.b[1] - k.a[1]) / kl) * s;
        return (x - a[0]) * ux + (y - a[1]) * uy;
      };
      for (const h of k.holes) {
        const lo = h.y0 - sy;
        const hi = h.y1 - sy;
        if (hi <= 0.05 || lo >= ceil - 0.05) continue;
        const u0 = Math.max(0, Math.min(along(h.s0), along(h.s1)));
        const u1 = Math.min(len, Math.max(along(h.s0), along(h.s1)));
        if (u1 - u0 < 0.1) continue;
        gaps.push([r3(u0), r3(u1), r3(Math.max(0, lo)), r3(Math.min(ceil, hi))]);
      }
    }
    gaps.sort((p, q) => p[0] - q[0]);
    out.push({
      id: `sp-${b.key}-${storey}-${e}`,
      floor,
      a,
      b: c,
      base: z,
      height: ceil,
      // (inside: plaster, a farm building's boards — plan 113)
      front: b.kind === "barn" || b.kind === "shed" || b.kind === "boathouse" ? "w" : "p",
      shell: true,
      ...(gaps.length ? { gaps: dedupe(gaps) } : {}),
    });
  }
  return out;
}

function dedupe(g: [number, number, number, number][]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const q of g)
    if (!out.some((p) => Math.abs(p[0] - q[0]) < 0.02 && Math.abs(p[1] - q[1]) < 0.02 && Math.abs(p[2] - q[2]) < 0.02))
      out.push(q);
  return out;
}

/** The space's floors of building `key` in `st`, bottom up (taken away or not). */
export const floorsOfSpace = (st: Structure, key: string): Floor[] =>
  st.floors.filter((f) => f.space === key).sort((a, b) => (a.storey ?? 0) - (b.storey ?? 0));

// ── a furnished building's first things (F5a): its kind's furniture as the catalog's, placed free where it stood ──
const AS: Partial<Record<Fit["kind"], string>> = {
  counter: "counter",
  stool: "bar_stool",
  table: "dining_table",
  chair: "chair",
  shelf: "shelving",
  booth: "bench",
  fridge: "fridge",
  jukebox: "jukebox",
  till: "reception",
  desk: "desk",
  locker: "locker",
  bench: "bench",
  pew: "bench",
  stove: "kitchen_stove",
  sofa: "sofa",
  armchair: "armchair",
  coffee: "coffee_table",
  rug: "rug",
  fireplace: "fireplace",
  bookshelf: "bookcase",
  nightstand: "bedside_table",
  plant: "plant",
};

/** A space's furniture (plan 113): its layout's pieces laid by hand; none by hand, plan 112's fits while it's
 *  furnished; empty, none. One rule wherever a space is laid, laid again, or furnished. */
export function furnitureOf(b: Building, lay: Layout | null, levels: number[]): WorldObjectDef[] {
  if (lay?.pieces.length) return layoutThings(b, lay, levels);
  if (!b.enter || !levels.length) return [];
  // (the fits laid round its stairs — by hand or the starting rule's: none where the flights go up, nor on the
  // landing before them — plan 113 review: a fridge, a table and its chairs stood in a house's stairs)
  const s = storeysOf(b).length > 1 ? (lay?.stairs ? stairsAt(b, lay.stairs) : starterStairs(b)) : null;
  if (!s) return furnishThings(b, levels[0]);
  const o = { x: s.x, y: s.y, yaw: quarterYaw(s.rot) };
  const fp = [stairsPoint(o, 0, 0), stairsPoint(o, STAIRS_W, STAIRS_D)];
  const pad = 0.3;
  const [sx0, sx1] = [Math.min(fp[0].x, fp[1].x) - pad, Math.max(fp[0].x, fp[1].x) + pad];
  const [sy0, sy1] = [Math.min(fp[0].y, fp[1].y) - pad, Math.max(fp[0].y, fp[1].y) + pad];
  return furnishThings(b, levels[0]).filter((t) =>
    kindSolids(t).every((q) => {
      const r = q.t === "cyl" ? q.r : Math.hypot(q.hx, q.hz);
      return q.x + r <= sx0 || q.x - r >= sx1 || q.z + r <= sy0 || q.z - r >= sy1;
    }),
  );
}

/** A furnished building's furniture as things on its ground storey `level` (placed free, each where its fit stood,
 *  turned along its long side; the long counters and shelves a piece a catalog length along). */
export function furnishThings(b: Building, level: number): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  furnishingsOf(b).forEach((f, i) => {
    const kind = AS[f.kind];
    if (!kind || !(kind in CATALOG)) return;
    const e = entry(kind);
    const long = Math.max(1, e.w);
    const alongX = f.w >= f.d;
    const len = alongX ? f.w : f.d;
    const n = kind === "counter" || kind === "shelving" || kind === "bench" ? Math.max(1, Math.round(len / long)) : 1;
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      const x = alongX ? f.x + f.w * t : f.x + f.w / 2;
      const y = alongX ? f.z + f.d / 2 : f.z + f.d * t;
      out.push({
        id: `sp-${b.key}-f${i}-${j}`,
        kind,
        x: r3(x),
        y: r3(y),
        yaw: alongX ? 0 : Math.PI / 2,
        refId: null,
        // (a chair the bentwood one: a café's, a kitchen's — not the office's task chair)
        props: { level, free: true, ...(kind === "chair" ? { variant: 2 } : {}) },
      });
    }
  });
  return out;
}

// ── the town's spaces kept with its buildings ────────────────────────────────
/** A space's floors and walls as its building is now: where it stands (its plot's corner), its storeys' heights,
 *  its shell — what a publish that moved, regrew or restyled it changes (null: nothing to change). The rest of what's
 *  built in it moves with its corner: its walls, slabs, rooms and roofs, and its things (`moves`). A storey it no
 *  longer has is taken out of the world (kept); one it has now that it hadn't is laid. */
function refit(
  st: Structure,
  b: Building,
  floors: Floor[],
): {
  floors: Floor[];
  ops: StructOp[];
  moves: { level: number; dx: number; dy: number }[];
  relay?: WorldObjectDef[];
  /** its storeys more or fewer: its stairs as they're laid now (the server's: its laid stairs these) */
  stairs?: WorldObjectDef[];
} | null {
  const L = layoutOf(b);
  if (!L) return null;
  const storeys = storeysOf(b);
  const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  const grid = { x0: b.x0, y0: b.z0, w: b.x1 - b.x0, h: b.z1 - b.z0 };
  const turn = turnOf(b);
  // (its door turned to another side: its layout laid again in its new frame — what's built in it besides was
  // refused by the publish's rules, spaceShrinkWhy)
  const was = floors.find((f) => f.turn !== undefined)?.turn;
  if (was !== undefined && turn !== undefined && was !== turn) return relay(st, b, floors);
  const live = floors.filter((f) => !f.away);
  const same =
    live.length === storeys.length &&
    // (a storey out of the world stays out: only the ones it has now compared — plan 113 review)
    floors.every((f) => !f.away || (f.storey ?? 0) >= storeys.length) &&
    live.every((f, i) => {
      if (f.turn !== turn) return false;
      const s = storeys[i];
      const shell = shellWalls(b, L.walls, f.index, i, s.y, r3(y0 + s.y), s.ceil);
      const had = st.walls.filter((w) => w.floor === f.index && w.shell);
      return (
        // (renamed in God mode: its storeys' names with it — plan 113 review)
        f.name === `${b.name} · ${storeyName(i)}` &&
        JSON.stringify(f.grid) === JSON.stringify(grid) &&
        Math.abs(f.z - r3(y0 + s.y)) < 1e-6 &&
        f.ceil === s.ceil &&
        JSON.stringify(had.map(shellSig)) === JSON.stringify(shell.map(shellSig))
      );
    });
  if (same) return null;
  const ops: StructOp[] = [];
  const moves: { level: number; dx: number; dy: number }[] = [];
  const outFloors: Floor[] = [];
  const t = WALL_T / 2;
  const inner: Ring = [
    [b.x0 + t, b.z0 + t],
    [b.x1 - t, b.z0 + t],
    [b.x1 - t, b.z1 - t],
    [b.x0 + t, b.z1 - t],
  ];
  const removeWalls: string[] = [];
  const addWalls: Wall[] = [];
  floors.forEach((f, i) => {
    const s = storeys[i];
    if (!s) {
      // (a storey it hasn't now: out of the world, what's in it kept)
      const { away: _a, ...rest } = f;
      outFloors.push({ ...rest, away: true });
      return;
    }
    const z = r3(y0 + s.y);
    const dz = r3(z - f.z);
    // (each floor from where it is: one out of the world while its building moved comes back from where it was
    // left, its stairwell's hole with it — plan 113 review)
    const dx = r3(b.x0 - f.grid.x0);
    const dy = r3(b.z0 - f.grid.y0);
    const mv = (p: XY): XY => [r3(p[0] + dx), r3(p[1] + dy)];
    const { away: _a, turn: _t, ...rest } = f;
    outFloors.push({
      ...rest,
      name: `${b.name} · ${storeyName(i)}`,
      z,
      grid,
      ceil: s.ceil,
      storey: i,
      ...(turn !== undefined ? { turn } : {}),
    });
    // (its own walls with it; its shell laid again from its layout, its faces' paint kept)
    const had = st.walls.filter((q) => q.floor === f.index);
    for (const w of had) {
      removeWalls.push(w.id);
      if (!w.shell) addWalls.push({ ...w, a: mv(w.a), b: mv(w.b), base: r3(w.base + dz) });
    }
    addWalls.push(...keepPaint(shellWalls(b, L.walls, f.index, i, s.y, z, s.ceil), had));
    ops.push({
      op: "slabs",
      floor: f.index,
      slabs: st.slabs
        .filter((x) => x.floor === f.index)
        .map((x) => ({
          ...x,
          z: r3(x.z + dz),
          // (its first slab the inside's, whatever its size now; the others moved with it)
          outline: x.id === `sp-${b.key}-${i}` ? inner : x.outline.map(mv),
          holes: x.holes.map((h) => h.map(mv)),
        })),
    });
    ops.push({
      op: "rooms",
      floor: f.index,
      rooms: st.rooms
        .filter((r) => r.floor === f.index)
        .map((r) => ({
          ...r,
          outline: r.outline.map(mv),
          rect: [r3(r.rect[0] + dx), r3(r.rect[1] + dy), r3(r.rect[2] + dx), r3(r.rect[3] + dy)],
        })),
    });
    const roofs = (st.roofs ?? []).filter((r) => r.floor === f.index);
    if (roofs.length)
      ops.push({
        op: "roofs",
        floor: f.index,
        roofs: roofs.map((r) => ({ ...r, outline: r.outline.map(mv), z: r3(r.z + dz) })),
      });
    if (dx || dy) moves.push({ level: f.index, dx, dy });
  });
  // (storeys it has now that it hadn't: laid as a new space's are)
  const extra = storeys.slice(floors.length);
  if (extra.length) {
    // (every floor of the world's taken — another space's later in the round too: plan 113 review)
    const taken = new Set([...st.floors.map((f) => f.index), ...outFloors.map((f) => f.index)]);
    let next = SPACE_BASE;
    extra.forEach((s, j) => {
      const i = floors.length + j;
      while (taken.has(next)) next++;
      if (next >= SPACE_TOP) return;
      taken.add(next);
      const z = r3(y0 + s.y);
      outFloors.push({
        index: next,
        name: `${b.name} · ${storeyName(i)}`,
        z,
        grid,
        space: b.key,
        storey: i,
        ceil: s.ceil,
        ...(turn !== undefined ? { turn } : {}),
      });
      ops.push({
        op: "slabs",
        floor: next,
        slabs: [{ id: `sp-${b.key}-${i}`, floor: next, z, top: topOf(b), outline: inner, holes: [] }],
      });
      addWalls.push(...shellWalls(b, L.walls, next, i, s.y, z, s.ceil));
    });
  }
  ops.unshift({ op: "walls", remove: removeWalls, add: addWalls });
  // (its storeys more or fewer: its stairs laid again — one up to each storey over the ground, none up to a storey it
  // hasn't now — and every storey's floor holed for the stairs up to it, as a new space's are — plan 113 review)
  const liveNow = outFloors.filter((f) => !f.away).sort((p, q) => (p.storey ?? 0) - (q.storey ?? 0));
  if (live.length !== liveNow.length) {
    const fresh = laySpace({ ...st, floors: st.floors.filter((f) => f.space !== b.key) }, b);
    if (fresh) {
      const at = new Map(fresh.floors.map((f, i) => [f.index, liveNow[i]?.index ?? f.index]));
      const stairs = fresh.things.map((o) => ({
        ...o,
        props: { ...(o.props ?? {}), level: at.get(Number(o.props?.level)) },
      }));
      for (const [i, f] of liveNow.entries()) {
        const holes = fresh.slabs.find((x) => x.id === `sp-${b.key}-${i}`)?.holes ?? [];
        const op = ops.find((o): o is Extract<StructOp, { op: "slabs" }> => o.op === "slabs" && o.floor === f.index);
        if (!op) continue;
        op.slabs = op.slabs.map((x) => (x.id === `sp-${b.key}-${i}` ? { ...x, holes } : x));
      }
      return { floors: outFloors, ops, moves, stairs };
    }
  }
  return { floors: outFloors, ops, moves };
}
const shellSig = (w: Wall) => [w.a, w.b, w.base, w.height, w.gaps ?? []];
/** New shell walls with the paint their namesakes had (a shell's faces painted inside survive its re-laying). */
function keepPaint(shell: Wall[], had: Wall[]): Wall[] {
  return shell.map((w) => {
    const o = had.find((q) => q.id === w.id && q.shell);
    return o ? { ...w, front: o.front, ...(o.back !== undefined ? { back: o.back } : {}) } : w;
  });
}
/** The quarter turn of a building's frame (its door's side: furnishings.ts frameOf). */
const turnOf = (b: Building): number | undefined => frameOf(b)?.q;
/** A space's floors the shape its building is: as big, its door the same side (one put back — its storeys a
 *  restyle's to change, as for any). */
function sameShape(list: readonly Floor[], b: Building): boolean {
  const g = list[0]?.grid;
  const t = list.find((f) => f.turn !== undefined)?.turn;
  return (
    !!g &&
    Math.abs(g.w - (b.x1 - b.x0)) < 1e-6 &&
    Math.abs(g.h - (b.z1 - b.z0)) < 1e-6 &&
    (t === undefined || t === turnOf(b))
  );
}

/** A space whose building turned its door to another side, laid again in its new frame: its floors keep their
 *  numbers (storey for storey; a new one's next free, a gone one's out of the world), its shell, slabs, stairs and
 *  layout laid as new, its rooms gone — what an admin built in it the publish's rules refused (spaceShrinkWhy). */
function relay(
  st: Structure,
  b: Building,
  floors: Floor[],
): {
  floors: Floor[];
  ops: StructOp[];
  moves: { level: number; dx: number; dy: number }[];
  relay: WorldObjectDef[];
} | null {
  const without = { ...st, floors: st.floors.filter((f) => f.space !== b.key) };
  const s = laySpace(without, b);
  if (!s) return null;
  const old = [...floors].sort((p, q) => (p.storey ?? 0) - (q.storey ?? 0));
  const taken = new Set(st.floors.map((f) => f.index));
  const map = new Map<number, number>();
  let next = SPACE_BASE;
  s.floors.forEach((f, i) => {
    if (old[i]) map.set(f.index, old[i].index);
    else {
      while (taken.has(next)) next++;
      taken.add(next);
      map.set(f.index, next);
    }
  });
  const at = (n: number) => map.get(n) ?? n;
  const outFloors: Floor[] = s.floors.map((f) => ({ ...f, index: at(f.index) }));
  for (const f of old.slice(s.floors.length)) {
    const { turn: _t, ...rest } = f;
    outFloors.push({ ...rest, away: true });
  }
  const ops: StructOp[] = [];
  // (the storeys it keeps laid again; one it hasn't now out of the world as it was, its walls kept — plan 113 review)
  const kept = old.slice(0, s.floors.length);
  const had = st.walls.filter((w) => kept.some((f) => f.index === w.floor));
  ops.push({
    op: "walls",
    remove: had.map((w) => w.id),
    add: keepPaint(
      s.walls.map((w) => ({ ...w, floor: at(w.floor) })),
      had,
    ),
  });
  for (const f of outFloors.filter((q) => !q.away)) {
    ops.push({
      op: "slabs",
      floor: f.index,
      slabs: s.slabs.filter((x) => at(x.floor) === f.index).map((x) => ({ ...x, floor: f.index })),
    });
    ops.push({ op: "rooms", floor: f.index, rooms: [] });
  }
  const levels = outFloors.filter((f) => !f.away).map((f) => f.index);
  const lay = layoutFor(b);
  const things = [
    ...s.things.map((o) => ({ ...o, props: { ...(o.props ?? {}), level: at(Number(o.props?.level)) } })),
    ...furnitureOf(b, lay, levels),
  ];
  return { floors: outFloors, ops, moves: [], relay: things };
}

/** What makes `st` have a space for every building that has one (laid where there's none; moved, regrown or
 *  restyled with its building; one whose building's gone taken out of the world, one whose building's back put in
 *  again — plan 54's rules): the operations, the things a newly laid space starts with (its stairs; a furnished
 *  building's furniture), and how far the things on each floor that moved go. */
export function spacesFix(
  st: Structure,
  buildings: readonly Building[] = spaceBuildings(),
): {
  ops: StructOp[];
  things: WorldObjectDef[];
  laid: string[];
  moves: { level: number; dx: number; dy: number }[];
  /** spaces laid again (their buildings turned, a key given again): their things as they're laid now, the rest of
   *  their laid ones gone — those whose ids start `prefix` (none: all its laid things; its stairs alone when only its
   *  storeys changed) */
  relaid: { key: string; things: WorldObjectDef[]; prefix?: string }[];
} {
  const relaid: { key: string; things: WorldObjectDef[]; prefix?: string }[] = [];
  const want = new Map(buildings.filter(hasSpace).map((b) => [b.key, b]));
  let changed = false;
  const bySpace = new Map<string, Floor[]>();
  for (const f of st.floors) if (f.space !== undefined) bySpace.set(f.space, [...(bySpace.get(f.space) ?? []), f]);
  const floors: Floor[] = st.floors.filter((f) => f.space === undefined);
  const ops: StructOp[] = [];
  const moves: { level: number; dx: number; dy: number }[] = [];
  const retired = new Set<string>();
  for (const [key, list] of bySpace) {
    list.sort((a, b) => (a.storey ?? 0) - (b.storey ?? 0));
    const b = want.get(key);
    if (!b) {
      // (its building's gone: out of the world, kept)
      floors.push(...list.map((f) => (f.away ? f : { ...f, away: true })));
      if (list.some((f) => !f.away)) changed = true;
      continue;
    }
    // (all of it out of the world, and its key back on another building — not the one put back, a size or a door
    // side apart: the old one's inside kept to itself, out of the world, a new one laid — plan 113 review)
    if (list.every((f) => f.away) && !sameShape(list, b)) {
      const to = `${key}~${list[0].index}`;
      floors.push(...list.map((f) => ({ ...f, space: to })));
      // (its laid walls and floors by the retired key's ids: the new inside's are laid by the key's own)
      const on = new Set(list.map((f) => f.index));
      const from = `sp-${key}-`;
      const re = (id: string) => (id.startsWith(from) ? `sp-${to}-${id.slice(from.length)}` : id);
      const walls = st.walls.filter((w) => on.has(w.floor) && w.id.startsWith(from));
      if (walls.length)
        ops.push({ op: "walls", remove: walls.map((w) => w.id), add: walls.map((w) => ({ ...w, id: re(w.id) })) });
      for (const f of list)
        ops.push({
          op: "slabs",
          floor: f.index,
          slabs: st.slabs.filter((x) => x.floor === f.index).map((x) => ({ ...x, id: re(x.id) })),
        });
      retired.add(key);
      changed = true;
      continue;
    }
    // (every floor numbered so far taken: the spaces still to come in the round too — plan 113 review)
    const r = refit({ ...st, floors: [...st.floors, ...floors] }, b, list);
    if (!r) {
      floors.push(...list);
      continue;
    }
    changed = true;
    floors.push(...r.floors);
    ops.push(...r.ops);
    moves.push(...r.moves);
    if (r.relay) relaid.push({ key: b.key, things: r.relay });
    else if (r.stairs) relaid.push({ key: b.key, things: r.stairs, prefix: `sp-${b.key}-stairs-` });
  }
  const have = new Set([...bySpace.keys()].filter((k) => !retired.has(k)));
  const slabs: Slab[] = [];
  const walls: Wall[] = [];
  const things: WorldObjectDef[] = [];
  const laid: string[] = [];
  let acc: Structure = { ...st, floors };
  for (const b of want.values()) {
    if (have.has(b.key)) continue;
    const s = laySpace(acc, b);
    if (!s) continue;
    acc = { ...acc, floors: [...acc.floors, ...s.floors] };
    slabs.push(...s.slabs);
    walls.push(...s.walls);
    const lay = layoutFor(b);
    const its = [
      ...s.things,
      ...furnitureOf(
        b,
        lay,
        s.floors.map((f) => f.index),
      ),
    ];
    // (a key's old laid things, the retired inside's, made way for: these in their place — the server's relaid)
    if (retired.has(b.key)) relaid.push({ key: b.key, things: its });
    else things.push(...its);
    laid.push(b.key);
    changed = true;
  }
  if (!changed) return { ops: [], things: [], laid: [], moves: [], relaid: [] };
  const out: StructOp[] = [{ op: "floors", floors: [...acc.floors].sort((a, b) => a.index - b.index) }, ...ops];
  const byFloor = new Map<number, Slab[]>();
  for (const x of slabs) byFloor.set(x.floor, [...(byFloor.get(x.floor) ?? []), x]);
  for (const [floor, list] of byFloor) out.push({ op: "slabs", floor, slabs: list });
  if (walls.length) out.push({ op: "walls", remove: [], add: walls });
  return { ops: out, things, laid, moves, relaid };
}

/** (plan 123) The rounds of additions a layout has (its pieces' highest `since`; 0: none). */
export function additionsOf(lay: Layout | null | undefined): number {
  let n = 0;
  for (const p of lay?.pieces ?? []) n = Math.max(n, p.since ?? 0);
  return n;
}

/** (plan 123) What layouts gained since spaces were laid: each laid space whose ground storey has had fewer rounds of
 *  additions than its layout now has — its newer pieces' things, and its ground storey marked as having them. Once: a
 *  piece taken away after (an admin's call) isn't put back. */
export function layoutAdditions(
  st: Structure,
  buildings: readonly Building[] = spaceBuildings(),
): { ops: StructOp[]; things: WorldObjectDef[]; keys: string[] } {
  const things: WorldObjectDef[] = [];
  const keys: string[] = [];
  const marked = new Map<number, Floor>();
  for (const b of buildings) {
    if (!hasSpace(b)) continue;
    const lay = layoutFor(b);
    const rev = additionsOf(lay);
    if (!lay || !rev) continue;
    const list = st.floors
      .filter((f) => f.space === b.key && !f.away)
      .sort((x, y) => (x.storey ?? 0) - (y.storey ?? 0));
    const g = list.find((f) => (f.storey ?? 0) === 0);
    if (!g || (g.added ?? 0) >= rev) continue;
    const had = g.added ?? 0;
    const ids = new Set(lay.pieces.flatMap((p, i) => ((p.since ?? 0) > had ? [`sp-${b.key}-p${i}`] : [])));
    things.push(
      ...layoutThings(
        b,
        lay,
        list.map((f) => f.index),
      ).filter((t) => ids.has(t.id)),
    );
    marked.set(g.index, { ...g, added: rev });
    keys.push(b.key);
  }
  if (!marked.size) return { ops: [], things: [], keys: [] };
  return { ops: [{ op: "floors", floors: st.floors.map((f) => marked.get(f.index) ?? f) }], things, keys };
}

/** Why a building's new plot or storeys can't hold what's built in its space (null: it can) — plan 54's rule: a
 *  publish never leaves walls or things outside a building, nor on a storey it no longer has. `things`: every thing
 *  in the world. */
export function spaceShrinkWhy(
  st: Structure,
  was: Building,
  now: Building,
  things: readonly WorldObjectDef[],
): string | null {
  const floors = floorsOfSpace(st, was.key).filter((f) => !f.away);
  if (!floors.length || !hasSpace(now)) return null;
  const laid = (id: string) => id.startsWith(`sp-${was.key}-`);
  // (what an admin built on a floor: its things, walls, rooms, floors and roofs — not the building's own laid ones)
  const builtOn = (l: number) => ({
    things: things.filter((o) => o.props?.level === l && !laid(o.id)),
    walls: st.walls.filter((w) => w.floor === l && !w.shell && !laid(w.id)),
    rooms: st.rooms.filter((r) => r.floor === l),
    slabs: st.slabs.filter((x) => x.floor === l && !laid(x.id)),
    roofs: (st.roofs ?? []).filter((r) => r.floor === l),
  });
  const any = (b: ReturnType<typeof builtOn>) =>
    b.things.length + b.walls.length + b.rooms.length + b.slabs.length + b.roofs.length > 0;
  // (its door turned to another side: its layout's laid again — refused if anything else is built in it)
  if (turnOf(was) !== turnOf(now))
    return floors.some((f) => any(builtOn(f.index)))
      ? `${was.name}: turned with what's built inside it (move it out first)`
      : null;
  const before = storeysOf(was);
  const after = storeysOf(now);
  const dx = now.x0 - was.x0;
  const dy = now.z0 - was.z0;
  // (only moved — as big, its storeys as they were: all of it with it, none left out)
  if (
    now.x1 - now.x0 === was.x1 - was.x0 &&
    now.z1 - now.z0 === was.z1 - was.z0 &&
    JSON.stringify(before) === JSON.stringify(after)
  )
    return null;
  // (inside its new plot, moved with its corner: a thing all of it, a hair in from the shell's middle; a wall, a
  // floor, a room or a roof up to it — one drawn against the shell is on its line — plan 113 review)
  const within = (x: number, y: number, m: number) =>
    x + dx >= now.x0 + m && x + dx <= now.x1 - m && y + dy >= now.z0 + m && y + dy <= now.z1 - m;
  const T = WALL_T / 2 - 0.01;
  const E = -0.01;
  // (a thing by its solids' corners, not its middle — a staircase by its footprint, a hand in: its flights' ends
  // stand in its building's wall)
  const corners = (o: WorldObjectDef): [number, number][] =>
    o.kind === "stairs"
      ? ([
          [0.2, 0.2],
          [STAIRS_W - 0.2, 0.2],
          [STAIRS_W - 0.2, STAIRS_D - 0.2],
          [0.2, STAIRS_D - 0.2],
        ].map(([u, v]) => {
          const p = stairsPoint(o, u, v);
          return [p.x, p.y];
        }) as [number, number][])
      : kindSolids(o).flatMap((q): [number, number][] => {
          if (q.t === "cyl")
            return [
              [q.x - q.r, q.z - q.r],
              [q.x + q.r, q.z + q.r],
            ];
          const c = Math.cos(-q.a);
          const n = Math.sin(-q.a);
          return (
            [
              [-q.hx, -q.hz],
              [q.hx, -q.hz],
              [q.hx, q.hz],
              [-q.hx, q.hz],
            ] as [number, number][]
          ).map(([u, v]): [number, number] => [q.x + u * c - v * n, q.z + u * n + v * c]);
        });
  for (const [i, f] of floors.entries()) {
    const b = builtOn(f.index);
    // (a storey it won't have: nothing an admin built on it — the building's own laid things go out with it)
    if (i >= after.length) {
      if (any(b)) return `${was.name}: its ${storeyName(i)} has things built on it`;
      continue;
    }
    const ring = (pts: readonly XY[]) => pts.some(([x, y]) => !within(x, y, E));
    if (
      b.walls.some((w) => !within(...w.a, E) || !within(...w.b, E)) ||
      b.slabs.some((x) => ring(x.outline)) ||
      b.rooms.some((r) => ring(r.outline)) ||
      b.roofs.some((r) => ring(r.outline)) ||
      things.filter((o) => o.props?.level === f.index).some((o) => corners(o).some(([x, y]) => !within(x, y, T)))
    )
      return `${was.name}: smaller than what's built inside it`;
    // (its storey lower: no wall built on it taller than its ceiling now)
    const ceil = after[i].ceil;
    if (b.walls.some((w) => w.base - f.z + w.height > ceil + 0.01))
      return `${was.name}: its ${storeyName(i)} lower than a wall built on it`;
  }
  return null;
}

/** A building's hand-made layout (plan 113): its own (by key), or only its stairs placed by hand; null: none. A
 *  furnished one only while it's furnished (`b.enter`). */
export function layoutFor(b: Building): Layout | null {
  // (a building God mode put down, furnished: the town's layout of its twin — the same kind, style and size, its
  // windows and door where they are — else the kind's fits, plan 112's way)
  const twin = FURNISHED[b.key]
    ? null
    : Object.keys(FURNISHED).find((k) => {
        const t = BUILDINGS.find((q) => q.key === k);
        const ft = t && frameOf(t);
        const fb = frameOf(b);
        return (
          !!t &&
          !!ft &&
          !!fb &&
          t.kind === b.kind &&
          t.style === b.style &&
          t.floors === b.floors &&
          ft.W === fb.W &&
          ft.D === fb.D
        );
      });
  const own = FURNISHED[b.key] ?? (twin ? FURNISHED[twin] : undefined);
  if (own && b.enter) return own;
  const s = STAIRS[b.key];
  return s ? { stairs: s, pieces: [] } : own ? { stairs: own.stairs, pieces: [], walls: own.walls } : null;
}

/** A building made furnished or empty in a publish (God mode's "Furnished" toggle, plan 113): its furniture laid in
 *  its space (when it has none), or the furniture its layout laid taken away. Only the buildings `turned`. */
export function furnishingsFix(
  st: Structure,
  objects: readonly WorldObjectDef[],
  turned: ReadonlySet<string>,
  buildings: readonly Building[] = spaceBuildings(),
): { add: WorldObjectDef[]; drop: string[]; ops: StructOp[] } {
  const add: WorldObjectDef[] = [];
  const drop: string[] = [];
  const laid: Building[] = [];
  for (const b of buildings) {
    if (!turned.has(b.key)) continue;
    const levels = floorsOfSpace(st, b.key)
      .filter((f) => !f.away)
      .map((f) => f.index);
    if (!levels.length) continue;
    const mine = (o: WorldObjectDef) => o.id.startsWith(`sp-${b.key}-p`) || o.id.startsWith(`sp-${b.key}-f`);
    const have = objects.filter(mine);
    if (b.enter && !have.length) {
      add.push(...furnitureOf(b, layoutFor(b), levels));
      laid.push(b);
    } else if (!b.enter) drop.push(...have.map((o) => o.id));
  }
  // (plan 123: laid whole now, its layout's later additions with it — marked, so loading never adds them again)
  return { add, drop, ops: markAdditions(st, laid) };
}

/** (plan 123) Spaces laid whole now: their ground storeys marked as having every round of their layouts' additions. */
export function markAdditions(st: Structure, laid: readonly Building[]): StructOp[] {
  const marked = new Map<number, Floor>();
  for (const b of laid) {
    const rev = additionsOf(layoutFor(b));
    const g = st.floors.find((f) => f.space === b.key && !f.away && (f.storey ?? 0) === 0);
    if (rev && g && (g.added ?? 0) < rev) marked.set(g.index, { ...g, added: rev });
  }
  return marked.size ? [{ op: "floors", floors: st.floors.map((f) => marked.get(f.index) ?? f) }] : [];
}
