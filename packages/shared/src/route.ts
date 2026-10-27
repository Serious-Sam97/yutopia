import type { Building, P, Way, WayKind } from "./grounds.ts";

// (the Grounds are handed in, not imported: the client's bundler copies a module
// into every chunk that imports it, and the Grounds are big — the client hands
// in the one it loaded for the world, grounds-load.ts; the server and tests theirs)
type Grounds = typeof import("./grounds.ts");
let G: Grounds | null = null;
/** The Grounds to route over (once, before the first route). */
export function routeOver(mod: Grounds) {
  if (G === mod) return;
  G = mod;
  nodes = null;
  places = null;
}
function g(): Grounds {
  if (!G) throw new Error("route.ts: routeOver(grounds) first");
  return G;
}

// The GPS (docs/plan/37-the-gps.md § 4): a route over the Grounds' ways — on
// foot along every one of them, by car along the driveway, the road and the
// streets — from anywhere to anywhere (a straight leg over the snow to the
// nearest way, and from the last one to the door), and the turns along it as
// steps. Shared so the server and the tests can use it; the client draws it.

export type RouteMode = "foot" | "car";
// a jog (move/spec.ts MOVE.jog, copied: this goes in the phone's chunk, and a new
// lazy import of /move grows the world page — route.test.ts checks they agree)
export const JOG = 4.2;
const DRIVE: ReadonlySet<WayKind> = new Set(["driveway", "road", "street"]);
const STEP = 4; // m between the graph's nodes along a way
const SPEED: Record<RouteMode, Partial<Record<WayKind, number>>> = {
  foot: { driveway: JOG, road: JOG, street: JOG, walk: JOG, trail: JOG * 0.9 },
  car: { driveway: 11, road: 17, street: 11 },
};
// over the snow (deep, the woods) / onto a road: slow, so a route keeps to the ways
const OFF_SPEED: Record<RouteMode, number> = { foot: JOG * 0.4, car: 3 };
const END_REACH = 45; // m: a way's loose end joins the nearest other way this close
const REACH = 80; // m: the ways a route can start or end on (beyond, only the nearest)

export interface Step {
  kind: "start" | "turn" | "arrive";
  /** start: the compass way I set off; turn: which way; arrive: the side it's on */
  dir: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" | Turn | "left" | "right" | "ahead";
  /** the way it goes onto ("" over the snow) */
  way: string;
  /** m from the start of the route */
  at: number;
  p: P;
}
export type Turn = "straight" | "slight-left" | "slight-right" | "left" | "right" | "sharp-left" | "sharp-right" | "u";

export interface Route {
  mode: RouteMode;
  pts: P[];
  /** each point's way (index into WAYS; -1 over the snow) */
  ways: number[];
  /** m along the route at each point */
  along: number[];
  dist: number;
  secs: number;
  steps: Step[];
}

// ── the graph (built once, the first time a route is asked for) ────────────
interface Node {
  p: P;
  way: number;
  edges: { to: number; d: number }[];
}
let nodes: Node[] | null = null;

function graph(): Node[] {
  if (nodes) return nodes;
  const ns: Node[] = [];
  const add = (p: P, way: number) => ns.push({ p, way, edges: [] }) - 1;
  const link = (a: number, b: number) => {
    const d = Math.hypot(ns[a].p[0] - ns[b].p[0], ns[a].p[1] - ns[b].p[1]);
    ns[a].edges.push({ to: b, d });
    ns[b].edges.push({ to: a, d });
  };
  const ofWay: number[][] = [];
  for (const [wi, w] of g().WAYS.entries()) {
    const ids: number[] = [];
    const line = w.line;
    for (let i = 0; i < line.length; i += STEP) ids.push(add(line[i], wi));
    const last = line[line.length - 1];
    if ((line.length - 1) % STEP !== 0 && !w.closed) ids.push(add(last, wi));
    for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]);
    if (w.closed && ids.length > 2) link(ids[ids.length - 1], ids[0]);
    ofWay.push(ids);
  }
  // where two ways meet: their nearest nodes within their half-widths (and a
  // little more: the samples are STEP apart), joined
  for (let a = 0; a < g().WAYS.length; a++)
    for (let b = a + 1; b < g().WAYS.length; b++) {
      const reach = (g().WAYS[a].w + g().WAYS[b].w) / 2 + STEP;
      const joins: { i: number; j: number; d: number }[] = [];
      for (const i of ofWay[a])
        for (const j of ofWay[b]) {
          const d = Math.hypot(ns[i].p[0] - ns[j].p[0], ns[i].p[1] - ns[j].p[1]);
          if (d > reach) continue;
          // one join per meeting place: the closest pair within ~20 m of each other
          const near = joins.find((x) => Math.hypot(ns[x.i].p[0] - ns[i].p[0], ns[x.i].p[1] - ns[i].p[1]) < 20);
          if (!near) joins.push({ i, j, d });
          else if (d < near.d) Object.assign(near, { i, j, d });
        }
      for (const x of joins) link(x.i, x.j);
    }
  // a way that stops short of another (the farm lane at the square): its open
  // ends joined to the nearest way within reach, if they aren't already
  for (const [wi, w] of g().WAYS.entries()) {
    if (w.closed) continue;
    const ids = ofWay[wi];
    for (const end of [ids[0], ids[ids.length - 1]]) {
      if (ns[end].edges.some((e) => ns[e.to].way !== wi)) continue;
      let best: { id: number; d: number } | null = null;
      for (const [id, n] of ns.entries()) {
        if (n.way === wi) continue;
        const d = Math.hypot(n.p[0] - ns[end].p[0], n.p[1] - ns[end].p[1]);
        if (d <= END_REACH && (!best || d < best.d)) best = { id, d };
      }
      if (best) link(end, best.id);
    }
  }
  nodes = ns;
  return ns;
}

const drivable = (n: Node) => DRIVE.has(g().WAYS[n.way].kind);
function costOf(mode: RouteMode, from: Node, to: Node, d: number): number {
  if (from.way !== to.way) return d / OFF_SPEED[mode]; // a junction's join
  const v = SPEED[mode][g().WAYS[from.way].kind];
  return v ? d / v : Number.POSITIVE_INFINITY;
}

// the nearest node of each way near a point (of the ways that mode can use);
// none that near: the nearest one there is
function entries(mode: RouteMode, p: P, k = 6): { id: number; d: number }[] {
  const ns = graph();
  const best = new Map<number, { id: number; d: number }>(); // per way
  for (const [id, n] of ns.entries()) {
    if (mode === "car" && !drivable(n)) continue;
    const d = Math.hypot(n.p[0] - p[0], n.p[1] - p[1]);
    const cur = best.get(n.way);
    if (!cur || d < cur.d) best.set(n.way, { id, d });
  }
  const all = [...best.values()].sort((a, b) => a.d - b.d);
  const near = all.filter((x) => x.d <= REACH);
  return (near.length ? near : all).slice(0, k);
}

// ── A* ─────────────────────────────────────────────────────────────────────
/** A route from one point on the Grounds to another, or null (no way there by car). */
export function route(from: P, to: P, mode: RouteMode = "foot"): Route | null {
  const ns = graph();
  const START = ns.length;
  const END = ns.length + 1;
  const off = OFF_SPEED[mode];
  const pos = (id: number): P => (id === START ? from : id === END ? to : ns[id].p);
  const outs = entries(mode, from);
  const ins = entries(mode, to);
  if (!outs.length || !ins.length) return null;
  const inCost = new Map(ins.map((x) => [x.id, x.d / off]));
  const vmax = Math.max(...Object.values(SPEED[mode]).filter((v): v is number => !!v), off);
  const h = (id: number) => {
    const p = pos(id);
    return Math.hypot(p[0] - to[0], p[1] - to[1]) / vmax;
  };
  const g = new Map<number, number>([[START, 0]]);
  const prev = new Map<number, number>();
  const open = new Heap();
  open.push(START, h(START));
  // on foot, close by: straight over the snow, when that's quicker than any way
  const straight = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const direct = straight / off;
  if (mode === "foot" && straight <= REACH) {
    g.set(END, direct);
    prev.set(END, START);
    open.push(END, direct);
  }
  const done = new Set<number>();
  while (open.size) {
    const id = open.pop() as number;
    if (id === END) break;
    if (done.has(id)) continue;
    done.add(id);
    const gi = g.get(id) as number;
    const next: { to: number; c: number }[] =
      id === START
        ? outs.map((x) => ({ to: x.id, c: x.d / off }))
        : ns[id].edges
            .filter((e) => mode === "foot" || drivable(ns[e.to]))
            .map((e) => ({ to: e.to, c: costOf(mode, ns[id], ns[e.to], e.d) }));
    if (id !== START && inCost.has(id)) next.push({ to: END, c: inCost.get(id) as number });
    for (const e of next) {
      const c = gi + e.c;
      if (c < (g.get(e.to) ?? Number.POSITIVE_INFINITY)) {
        g.set(e.to, c);
        prev.set(e.to, id);
        open.push(e.to, c + (e.to === END ? 0 : h(e.to)));
      }
    }
  }
  if (!prev.has(END)) return null;
  const ids: number[] = [];
  for (let id: number | undefined = END; id !== undefined; id = prev.get(id)) ids.push(id);
  ids.reverse();
  const pts = ids.map(pos);
  const ways = ids.map((id) => (id === START || id === END ? -1 : ns[id].way));
  // a leg over the snow is its own way (-1) only off the graph: the first and last legs
  const along = [0];
  for (let i = 1; i < pts.length; i++)
    along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const r: Route = {
    mode,
    pts,
    ways,
    along,
    dist: along[along.length - 1],
    secs: g.get(END) as number,
    steps: [],
  };
  r.steps = stepsOf(r, to);
  return r;
}

class Heap {
  private a: { id: number; k: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(id: number, k: number) {
    const a = this.a;
    a.push({ id, k });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0].id;
    const last = a.pop() as { id: number; k: number };
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// ── the steps ──────────────────────────────────────────────────────────────
const LOOK = 10; // m before and after a turn to read its direction from

function headingAt(r: Route, at: number, dir: 1 | -1): number {
  // the direction of travel over LOOK metres before (dir -1) or after (1) `at`
  const a = pointAt(r, at);
  const b = pointAt(r, Math.max(0, Math.min(r.dist, at + dir * LOOK)));
  const [dx, dz] = dir === 1 ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]];
  return Math.atan2(dx, -dz); // 0: north (−z), clockwise
}

/** The point `at` metres along the route. */
export function pointAt(r: Route, at: number): P {
  if (at <= 0) return r.pts[0];
  if (at >= r.dist) return r.pts[r.pts.length - 1];
  let lo = 0;
  let hi = r.along.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (r.along[m] <= at) lo = m;
    else hi = m;
  }
  const t = (at - r.along[lo]) / Math.max(1e-6, r.along[hi] - r.along[lo]);
  const a = r.pts[lo];
  const b = r.pts[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function turnOf(da: number): Turn {
  const deg = (((da * 180) / Math.PI + 540) % 360) - 180; // −180..180, + clockwise (right)
  const a = Math.abs(deg);
  if (a < 25) return "straight";
  const side = deg > 0 ? "right" : "left";
  if (a < 60) return `slight-${side}`;
  if (a < 135) return side;
  if (a < 165) return `sharp-${side}`;
  return "u";
}
function compass(hd: number): Step["dir"] {
  const names = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
  return names[Math.round((((hd * 180) / Math.PI + 360) % 360) / 45) % 8];
}

function stepsOf(r: Route, to: P): Step[] {
  const name = (w: number) => (w < 0 ? "" : g().WAYS[w].name);
  const steps: Step[] = [
    { kind: "start", dir: compass(headingAt(r, 0, 1)), way: name(r.ways[1] ?? -1), at: 0, p: r.pts[0] },
  ];
  // a step where the way changes (by name: one street can be two ways)
  for (let i = 1; i < r.pts.length - 1; i++) {
    const a = r.ways[i];
    const b = r.ways[i + 1];
    if (a === b || name(a) === name(b) || b < 0) continue;
    const at = r.along[i];
    const turn = turnOf(headingAt(r, at, 1) - headingAt(r, at, -1));
    const last = steps[steps.length - 1];
    // a join that's only a few metres of the other way: one step, not two
    if (last.kind === "turn" && at - last.at < 12) {
      last.way = name(b);
      continue;
    }
    steps.push({ kind: "turn", dir: turn, way: name(b), at, p: r.pts[i] });
  }
  // arriving: which side it's on, from the way I was last on (not the few
  // metres off it to the door)
  const end = r.pts[r.pts.length - 1];
  let last = r.ways.length - 1;
  while (last > 0 && r.ways[last] < 0) last--;
  const onWay = last > 0 ? r.pts[last] : r.pts[0];
  const before = pointAt(r, Math.max(0, r.along[last] - LOOK));
  const hx = onWay[0] - before[0];
  const hz = onWay[1] - before[1];
  const hl = Math.hypot(hx, hz);
  // + : to the right of the way of travel (x east, z south: a clockwise turn)
  const side = hl < 1 ? 0 : (hx * (to[1] - onWay[1]) - hz * (to[0] - onWay[0])) / hl;
  const dir = Math.abs(side) < 3 ? "ahead" : side > 0 ? "right" : "left";
  steps.push({ kind: "arrive", dir, way: "", at: r.dist, p: end });
  return steps;
}

/** How far a point is from the route, and how far along it its nearest point is. */
export function offRoute(r: Route, p: P): { d: number; at: number } {
  let best = { d: Number.POSITIVE_INFINITY, at: 0 };
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1];
    const b = r.pts[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1e-6;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    const d = Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
    if (d < best.d) best = { d, at: r.along[i - 1] + t * Math.sqrt(l2) };
  }
  return best;
}

// ── places ─────────────────────────────────────────────────────────────────
export interface Place {
  key: string;
  name: string;
  kind: "building" | "way" | "landmark";
  /** where a route ends: a building's door, a way's middle, a landmark's spot */
  p: P;
  /** the point to centre the map on (a building's middle) */
  c: P;
  building?: Building;
  way?: Way;
}

/** A building's door: out from the middle of the side it faces (n: −z). */
export function doorOf(b: Building, out = 2): P {
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  return b.face === "n"
    ? [cx, b.z0 - out]
    : b.face === "s"
      ? [cx, b.z1 + out]
      : b.face === "w"
        ? [b.x0 - out, cz]
        : [b.x1 + out, cz];
}

/** The Grounds' landmarks: where a route to each ends. */
export function landmarks(): { key: string; name: string; p: P }[] {
  const { LOT, PLAZA, POND, TOWER, STATUE, GATE, FARM, KART_DESK } = g();
  return [
    { key: "lot", name: "The lot", p: [(LOT.x0 + LOT.x1) / 2, (LOT.z0 + LOT.z1) / 2] },
    { key: "square", name: "The square", p: [(PLAZA.x0 + PLAZA.x1) / 2, (PLAZA.z0 + PLAZA.z1) / 2] },
    { key: "pond", name: "The frozen pond", p: [POND.cx, POND.cz + POND.rz] },
    { key: "tower", name: "The tower", p: [TOWER.x, TOWER.z] },
    { key: "statue", name: "The statue", p: [STATUE.x, STATUE.z] },
    { key: "gate", name: "The gate", p: [GATE.x, GATE.z] },
    { key: "farm", name: "The farm", p: [(FARM.x0 + FARM.x1) / 2, (FARM.z0 + FARM.z1) / 2] },
    // (its desk, where you take a kart: docs/plan/46-the-karts.md)
    { key: "karts", name: "Yutopia Kart Park", p: [KART_DESK.x + 2 * KART_DESK.face, KART_DESK.z] },
  ];
}

let places: Place[] | null = null;
/** Everywhere the GPS can find: the buildings (one of each name), the ways, the landmarks. */
export function gpsPlaces(extra?: { key: string; name: string; p: P }[]): Place[] {
  if (places && !extra) return places;
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const b of g().BUILDINGS) {
    if (b.kind === "house" || seen.has(b.name)) continue;
    seen.add(b.name);
    out.push({
      key: `b:${b.key}`,
      name: b.name,
      kind: "building",
      p: doorOf(b),
      c: [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2],
      building: b,
    });
  }
  for (const w of g().WAYS) {
    if (seen.has(w.name)) continue;
    seen.add(w.name);
    const mid = w.line[Math.floor(w.line.length / 2)];
    out.push({ key: `w:${w.key}`, name: w.name, kind: "way", p: mid, c: mid, way: w });
  }
  for (const l of extra ?? landmarks()) out.push({ key: `l:${l.key}`, name: l.name, kind: "landmark", p: l.p, c: l.p });
  if (!extra) places = out;
  return out;
}
