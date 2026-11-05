import {
  blocksLight,
  CATALOG,
  doorBlocksLight,
  type Edge,
  entry,
  hangOf,
  hWall,
  isFloor,
  isOpening,
  isWindow,
  isWindowKind,
  type MapDef,
  openingEdges,
  quarterOf,
  rotOf,
  tileAt,
  topCentre,
  variantOf,
  vWall,
  type WorldObjectDef,
} from "@yutopia/shared";
import { seedOf } from "./seed";

// What lights a floor and what stands in its way (docs/plan/72-the-3d-core.md, phase 9: the light itself
// is the light volume's, art/light-volume.ts): its lamps and the things that glow, its windows' pools of
// daylight, and its walls and shut doors — a lamp's light reaches a point when the straight line to it
// crosses none of them, ray-marched across the floor's tiles (a wall stands the storey: the same at
// every height).

export interface LightSource {
  x: number; // tiles
  y: number;
  color: number;
  radius: number;
  intensity: number;
  h?: number; // how high it hangs (tiles; the 3D view's lamps), when it's not a room lamp
  z?: number; // where its light comes from over its floor (m: the light volume's — art/light-volume.ts)
}

// Where each kind's light comes from over its floor (m): a lamp's shade, a screen's middle, a sign on
// the wall, a fire's flames (the light volume's: docs/plan/72 phase 9). One that hangs (`h`) from there.
const LIGHT_Z: Record<string, number> = {
  neon: 1.6,
  lamp: 1.45,
  radio: 0.9,
  vending: 1.2,
  slot_track: 0.85,
  pool_table: 1.5,
  turntable: 0.9,
  mixing_desk: 0.95,
  server_rack: 1.1,
  crt_terminal: 1.0,
  fireplace: 0.5,
  lava_lamp: 0.6,
  marquee_sign: 1.9,
  xmas_tree: 1.2,
  xmas_tree_small: 0.5,
  garland: 2.0,
  xmas_village: 0.4,
  candle_arch: 0.9,
  reindeer: 0.8,
  snow_globe: 0.5,
  // (what glows on a desk or a wall, beyond the catalog's lamps)
  desklamp: 1.15,
  monitor: 1.0,
  desk: 1.0,
  board_wall: 1.4,
  screen_wall: 1.5,
  arcade: 1.3,
  meeting_table: 0.8,
  standup_mat: 0.05,
};

// local rot-0 point → world, same turn as the item art (90° clockwise steps)
function place(o: WorldObjectDef, lx: number, ly: number): [number, number] {
  const e = entry(o.kind);
  let x = lx;
  let y = ly;
  let W = e.w;
  let H = e.h;
  const rot = rotOf(o) & 3;
  for (let i = 0; i < rot; i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  // (wall items: where their drawing is along the wall)
  if (e.wall) {
    const h = hangOf(o);
    return [h.ax + x, h.ay + y];
  }
  return [o.x + x, o.y + y];
}

// Light-giving things beyond the catalog's lamps: screens and displays glow a little.
const SCREENS: Record<string, { at: [number, number][]; color: number; radius: number; intensity: number }> = {
  desk: {
    at: [
      [0.48, 0.1],
      [1.52, 0.1],
    ],
    color: 0xa8b98a,
    radius: 1.7,
    intensity: 0.2,
  },
  board_wall: {
    at: [
      [0.7, 0.6],
      [1.5, 0.6],
      [2.3, 0.6],
    ],
    color: 0xffa630,
    radius: 1.9,
    intensity: 0.14,
  },
  screen_wall: {
    at: [
      [1, 0.6],
      [2, 0.6],
      [3, 0.6],
    ],
    color: 0xd8c8a8,
    radius: 2.2,
    intensity: 0.12,
  },
  arcade: { at: [[0.5, 1.1]], color: 0xffa630, radius: 1.8, intensity: 0.3 },
  meeting_table: {
    at: [
      [1.6, 1],
      [3, 1],
      [4.4, 1],
    ],
    color: 0xffa630,
    radius: 1.6,
    intensity: 0.14,
  },
  standup_mat: { at: [[2, 2]], color: 0xffb35c, radius: 2.4, intensity: 0.12 },
};

// A neon sign's tubes (items/home.ts NEON), as light.
const NEON_LIGHT = [0xffb35c, 0xff5fa8, 0x5ff0ff];
// On a desk: a desk lamp's warm pool (switched like a lamp), a monitor's glow.
const TOPS: Record<string, { color: number; radius: number; intensity: number; switched?: boolean }> = {
  desklamp: { color: 0xffc070, radius: 2.2, intensity: 0.42, switched: true },
  monitor: { color: 0xb8c9d8, radius: 1.5, intensity: 0.2 },
};

// The colour a lamp gives: its shade's paint (props.color) over a warm bulb.
function shadeLight(props: Record<string, unknown> | undefined, bulb: number): number {
  const c = props?.color;
  if (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c)) return bulb;
  const p = Number.parseInt(c.slice(1), 16);
  const mix = (sh: number) => {
    const a = (bulb >> sh) & 255;
    const b = (p >> sh) & 255;
    // a bright, tinted light: mostly the bulb, coloured by the shade
    return Math.min(255, Math.round(a * 0.55 + b * 0.45 + 30));
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export function lightSources(objects: WorldObjectDef[]): LightSource[] {
  const out: LightSource[] = [];
  for (const o of objects) {
    const c = (CATALOG as Record<string, { light?: { color: number; radius: number; intensity: number } }>)[o.kind]
      ?.light;
    if (c) {
      // (switched off: a lamp, a ceiling light, a fire, a tree's lights)
      if (
        (o.kind === "pendant_light" || o.kind === "panel_light" || entry(o.kind).interact === "lamp") &&
        o.props?.on === false
      )
        continue;
      if (o.kind === "radio" && !o.props?.on) continue;
      const e = entry(o.kind);
      // (a lamp post's light falls from its head, out at the end of its arm)
      const [x, y] = o.kind === "lamp_post" ? place(o, 2.25, 0.5) : place(o, e.w / 2, e.h / 2 + (e.wall ? 0.6 : 0));
      const color =
        o.kind === "neon"
          ? NEON_LIGHT[variantOf(o, seedOf(o.id))]
          : o.kind === "lamp"
            ? shadeLight(o.props, c.color)
            : c.color;
      // (a lot's lamp post: well up its pole, over the cars and people it lights
      // — its head, at ~8.8, is too high for a point light to reach them)
      const h = o.kind === "lamp_post" ? 3.3 : (c as { h?: number }).h;
      const z = h ?? LIGHT_Z[o.kind] ?? 1;
      out.push({ x, y, color, radius: c.radius, intensity: c.intensity, z, ...(h ? { h } : {}) });
    }
    const t = o.kind === "tabletop" ? TOPS[String(o.props?.d ?? "")] : undefined;
    if (t && !(t.switched && o.props?.on === false)) {
      const at = topCentre(o);
      const z = LIGHT_Z[String(o.props?.d ?? "")] ?? 1;
      out.push({ x: at.x, y: at.y + 0.3, color: t.color, radius: t.radius, intensity: t.intensity, z });
    }
    const s = SCREENS[o.kind];
    if (s)
      for (const [lx, ly] of s.at) {
        const [x, y] = place(o, lx, ly);
        out.push({ x, y, color: s.color, radius: s.radius, intensity: s.intensity, z: LIGHT_Z[o.kind] ?? 1 });
      }
  }
  return out;
}

/** A car's headlights: where they shine from (the middle of its nose) and which
 *  way, for the 3D view's beams on the ground at night. */
export function headlights(objects: WorldObjectDef[]): { x: number; y: number; dx: number; dy: number }[] {
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  for (const o of objects) {
    if (o.kind !== "car") continue;
    // (as the drawing: its nose to −x at rot 0, nudged in its bay by dx / dz)
    const ox = Math.max(-0.4, Math.min(0.4, Number(o.props?.dx) || 0));
    const oy = Math.max(-0.4, Math.min(0.4, Number(o.props?.dz) || 0));
    const [x, y] = place(o, ox, 1 + oy);
    const [bx, by] = place(o, 1 + ox, 1 + oy);
    out.push({ x, y, dx: x - bx, dy: y - by });
  }
  return out;
}

/** A rectangle of a floor (m, its own frame). */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
const meets = (a: Rect, b: Rect) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** A floor's light sources and what blocks them (its tiles, its walls, its doors). */
export class LightMap {
  private block: Uint8Array; // per tile: 1 = blocks light (no floor)
  private hBlk: Uint8Array; // walls on north edges that block light (glass and half walls don't)
  private vBlk: Uint8Array; // … on west edges
  /** what gives light: the lamps, and the windows' pools (`win`) */
  private srcs: { s: LightSource; win: boolean }[] = [];
  get sources(): readonly { s: LightSource; win: boolean }[] {
    return this.srcs;
  }

  constructor(
    readonly map: MapDef,
    objects: WorldObjectDef[],
  ) {
    const W = map.width;
    const H = map.height;
    this.block = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isFloor(tileAt(map, x, y))) this.block[y * W + x] = 1;
    this.hBlk = new Uint8Array((H + 1) * W);
    this.vBlk = new Uint8Array(H * (W + 1));
    for (let y = 0; y <= H; y++)
      for (let x = 0; x < W; x++) if (blocksLight(hWall(map, x, y))) this.hBlk[y * W + x] = 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x <= W; x++) if (blocksLight(vWall(map, x, y))) this.vBlk[y * (W + 1) + x] = 1;
    // doors and windows in walls (shared openings.ts): an open door and a
    // window's glass let light through, a shut door doesn't
    const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
    const glazed: Edge[] = [];
    for (const o of objects) {
      if (!isOpening(o.kind)) continue;
      const shut = doorBlocksLight(o);
      for (const e of openingEdges(o)) {
        if (e.dir === "h") this.hBlk[e.y * W + e.x] = shut ? 1 : 0;
        else this.vBlk[e.y * (W + 1) + e.x] = shut ? 1 : 0;
        if (isWindowKind(o.kind)) glazed.push(e);
      }
    }
    for (const s of lightSources(objects)) this.srcs.push({ s, win: false });
    // windows to the outside: a soft pool of light just inside each pane
    const pool = (x: number, y: number) => ({ x, y, color: 0xffffff, radius: 4.2, intensity: 0.9 });
    for (const e of glazed) {
      const [a, b] = e.dir === "h" ? [floor(e.x, e.y - 1), floor(e.x, e.y)] : [floor(e.x - 1, e.y), floor(e.x, e.y)];
      if (a === b) continue; // between two rooms: no daylight of its own
      const inn = b ? 0.45 : -0.45;
      const at = e.dir === "h" ? { x: e.x + 0.5, y: e.y + inn } : { x: e.x + inn, y: e.y + 0.5 };
      this.srcs.push({ s: pool(at.x, at.y), win: true });
    }
    for (let y = 0; y <= H; y++)
      for (let x = 0; x < W; x++)
        if (isWindow(hWall(map, x, y)))
          this.srcs.push({ s: pool(x + 0.5, floor(x, y) ? y + 0.45 : y - 0.45), win: true });
    for (let y = 0; y < H; y++)
      for (let x = 0; x <= W; x++)
        if (isWindow(vWall(map, x, y)))
          this.srcs.push({ s: pool(floor(x, y) ? x + 0.45 : x - 0.45, y + 0.5), win: true });
  }

  /** Where the light can have changed since `prev` (the same floor before an edit), by `reach` (where
   *  a source's light goes: the light volume's): the reaches of every source — before and now —
   *  whose reach takes in a tile or an edge that changed, and of every source that came, went or
   *  moved. Null: a floor of another size (all of it). */
  changedSince(prev: LightMap, reach: (q: { s: LightSource; win: boolean }) => Rect): Rect[] | null {
    const W = this.map.width;
    if (W !== prev.map.width || this.map.height !== prev.map.height) return null;
    let box: Rect | null = null;
    const hit = (x0: number, y0: number, x1: number, y1: number) => {
      box = box
        ? { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) }
        : { x0, y0, x1, y1 };
    };
    for (let i = 0; i < this.block.length; i++)
      if (this.block[i] !== prev.block[i]) hit(i % W, Math.floor(i / W), (i % W) + 1, Math.floor(i / W) + 1);
    for (let i = 0; i < this.hBlk.length; i++)
      if (this.hBlk[i] !== prev.hBlk[i]) hit(i % W, Math.floor(i / W), (i % W) + 1, Math.floor(i / W));
    for (let i = 0; i < this.vBlk.length; i++)
      if (this.vBlk[i] !== prev.vBlk[i])
        hit(i % (W + 1), Math.floor(i / (W + 1)), i % (W + 1), Math.floor(i / (W + 1)) + 1);
    const key = (q: { s: LightSource; win: boolean }) => JSON.stringify(q);
    const was = new Set(prev.srcs.map(key));
    const now = new Set(this.srcs.map(key));
    const out: Rect[] = [];
    const b = box as Rect | null;
    for (const q of [...prev.srcs, ...this.srcs]) {
      const r = reach(q);
      const moved = !was.has(key(q)) || !now.has(key(q));
      if (moved || (b && meets(r, b))) out.push(r);
    }
    return out;
  }

  private blocked(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return true;
    return this.block[ty * this.map.width + tx] === 1;
  }

  // A wall on the edge between two neighbouring tiles (diagonal steps: both ways round must be shut).
  private wallBetween(ax: number, ay: number, bx: number, by: number): boolean {
    const W = this.map.width;
    const h = (x: number, y: number) => this.hBlk[y * W + x] === 1;
    const v = (x: number, y: number) => this.vBlk[y * (W + 1) + x] === 1;
    const step = (x0: number, y0: number, x1: number, y1: number) =>
      x1 > x0 ? v(x1, y0) : x1 < x0 ? v(x0, y0) : y1 > y0 ? h(x0, y1) : y1 < y0 ? h(x0, y0) : false;
    if (ax === bx || ay === by) return step(ax, ay, bx, by);
    return (step(ax, ay, bx, ay) || step(bx, ay, bx, by)) && (step(ax, ay, ax, by) || step(ax, by, bx, by));
  }

  /** Is the straight line from a light to (x, y) clear of walls (and of what's off the floor, but
   *  for its end)? */
  sees(s: LightSource, x: number, y: number): boolean {
    const dx = x - s.x;
    const dy = y - s.y;
    const d = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(d * 6));
    let tx = Math.floor(s.x);
    let ty = Math.floor(s.y);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = s.x + dx * t;
      const py = s.y + dy * t;
      const nx = Math.floor(px);
      const ny = Math.floor(py);
      if (nx !== tx || ny !== ty) {
        if (this.wallBetween(tx, ty, nx, ny)) return false;
        // no floor in between (outside the building): blocked, except the end point
        if (i < steps && this.blocked(px, py)) return false;
        tx = nx;
        ty = ny;
      }
    }
    return true;
  }

  /** Does a light reach (x, y) — on the floor, no wall or shut door in the way? (the 3D view's lamps) */
  reaches(s: LightSource, x: number, y: number): boolean {
    if (this.blocked(x, y)) return false;
    return this.sees(s, x, y);
  }
}

// What changes the light map: walls (the map), light-giving things, doors.
export function affectsLight(o: WorldObjectDef): boolean {
  return (
    isOpening(o.kind) ||
    o.kind in SCREENS ||
    (o.kind === "tabletop" && String(o.props?.d) in TOPS) ||
    !!(CATALOG as Record<string, { light?: unknown }>)[o.kind]?.light
  );
}

// ── kept per floor ──────────────────────────────────────────────────────────
// A floor's light sources and what stands in their way, kept (a few): going back to a floor finds its
// light volume (made from it) again. Keyed by everything that lights it or stands in the light's way.
const baked = new Map<string, LightMap>();
export function lightSig(map: MapDef, objects: WorldObjectDef[]): string {
  const doors = objects
    .filter((o) => isOpening(o.kind))
    .map((o) => `${o.kind},${o.x},${o.y},${quarterOf(o)},${o.props?.state ?? ""}`)
    .join(";");
  return `${map.key}|${map.floor ?? ""}|${map.width}x${map.height}|${map.tiles.join("")}|${map.hWalls.join("")}|${map.vWalls.join("")}|${JSON.stringify(lightSources(objects))}|${doors}`;
}
export function lightMapFor(map: MapDef, objects: WorldObjectDef[], sig = lightSig(map, objects)): LightMap {
  let lm = baked.get(sig);
  if (lm) {
    baked.delete(sig);
    baked.set(sig, lm);
    return lm;
  }
  lm = new LightMap(map, objects);
  baked.set(sig, lm);
  if (baked.size > 8) baked.delete(baked.keys().next().value as string);
  return lm;
}
