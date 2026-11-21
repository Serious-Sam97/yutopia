// Plan 110 (docs/plan/110-the-buildings.md) — the buildings' kinds, their styles and colours, and how each is laid
// out (building-kit.ts is what they're made with; design/buildings/refs.md the numbers they're made to).
//
// Every kind God mode puts down is here, with its limits (sizes, floors), whether you walk into it, whether it has
// a sign, and its styles. A style is a composer and its settings: the wood-frame house (`frame`: houses,
// farmhouses, inns, roadhouses, stores, schoolhouses, barns, boathouses, sheds, mills…), the flat-roofed block
// (`block`: Main Street, apartments, offices, schools, police, fire, clinics, libraries…), and the ones of their
// own (the church, the gas station, the silo, the parking garage, the diner's railcar, the shelter, the
// gatehouse). Its colours are four (walls, trim, roof, door) from its palette, and an awning's.
import {
  bays,
  type Colours,
  type Cover,
  headRise,
  K,
  type Layout,
  OPENINGS,
  rngOf,
  type Side,
  type Skin,
  seedOf,
  settleFaces,
  shade,
  type V3,
} from "./building-kit.ts";
import type { Building, BuildingKind } from "./grounds.ts";

export type KitKind = Exclude<BuildingKind, "hq" | "block">;
export type KindGroup = "homes" | "shops" | "work" | "civic" | "farm";

// ── palettes ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface Palette {
  walls: string[];
  trim: string[];
  roof: string[];
  door: string[];
  /** a second skin's (a stone base, a ground floor) — its first is the default */
  walls2?: string[];
}
export const PALETTES = {
  clapboard: {
    walls: ["#efeadd", "#e2dccb", "#c7d2d4", "#ddd0a8", "#a8b89f", "#8d9eab", "#9c4a3c", "#4a555c", "#d9c2a8"],
    trim: ["#f4f1e8", "#e6e0cf", "#2d3a33", "#3b3632"],
    roof: ["#3a3f45", "#4a4038", "#5d6163", "#2e3438", "#5a3d33"],
    door: ["#2f4a3a", "#7a2a22", "#22344a", "#1d1f22", "#8a6a3a", "#f1ece0"],
    walls2: ["#8e8578", "#6f675c"],
  },
  shingle: {
    walls: ["#8a7a66", "#a39279", "#6e6a62", "#b9ab92", "#5f6b6e"],
    trim: ["#f1eee6", "#e3ddcc", "#2d3a33"],
    roof: ["#3a3f45", "#4a4038", "#2e3438"],
    door: ["#7a2a22", "#2f4a3a", "#22344a", "#c49a3a"],
    walls2: ["#8e8578", "#6f675c"],
  },
  victorian: {
    walls: ["#7c8f7a", "#b77b62", "#d6c28e", "#8a96b0", "#c9a7a0", "#6e5a7a", "#e5ddc6"],
    trim: ["#f1ece0", "#d9c9a0", "#4d3b2e", "#2d3a33"],
    roof: ["#3a3f45", "#5a3d33", "#4a4a52"],
    door: ["#5a2a22", "#2f4a3a", "#3b2a1e", "#22344a"],
  },
  craftsman: {
    walls: ["#7f8c6e", "#a58c66", "#6f7d82", "#b9a27a", "#5e5c4c", "#9c6b4e"],
    trim: ["#efe7d2", "#d8cdb0", "#3e4436"],
    roof: ["#4a4038", "#3a3f45", "#5a5246"],
    door: ["#6b4a2a", "#2f4a3a", "#8a3a22"],
    walls2: ["#8e8578", "#7a6e60"],
  },
  brick: {
    walls: ["#9a4a36", "#8a3e2e", "#b5634a", "#7a4234", "#c4a27a", "#a35a40", "#6e3a2e"],
    trim: ["#efe8d8", "#d6cfbc", "#3a3f3a", "#5a3a2a", "#2a3540"],
    roof: ["#4a4a48", "#3a3f45", "#5a3d33"],
    door: ["#2a3540", "#5a2a22", "#1d1f22", "#2f4a3a"],
    walls2: ["#c8c0ae", "#9e9a90"],
  },
  stucco: {
    walls: ["#e8dcc4", "#efe6d2", "#d9c7a7", "#c9d6cc", "#e3c9b5", "#d4dde0"],
    trim: ["#b8a888", "#7d8a80", "#f4efe3", "#3a5560", "#9a5a4a"],
    roof: ["#55575a", "#9a5a3a", "#3a3f45"],
    door: ["#3a5560", "#2a2e30", "#9a5a4a"],
    walls2: ["#c8c0ae", "#2a2e30"],
  },
  stone: {
    walls: ["#a39c8c", "#8f8a80", "#b8ae98", "#7d776c"],
    trim: ["#d8d0bc", "#4a4438", "#2d3a33"],
    roof: ["#3a3f45", "#4a4a52", "#2e3438"],
    door: ["#5a2a22", "#3b2a1e", "#2f4a3a"],
  },
  metal: {
    walls: ["#9aa3a8", "#6f7a80", "#b8bcbc", "#7a3a2e", "#3e5a6a", "#a0a38e"],
    trim: ["#e0e0dc", "#2a2e30", "#8a8f92"],
    roof: ["#8d9496", "#5d6163", "#7a3a2e", "#3e5a6a"],
    door: ["#8a8f92", "#2a2e30", "#9e1512", "#3e5a6a"],
  },
  modern: {
    walls: ["#d8d6d0", "#5a5f63", "#a7a39a", "#c8c0b2", "#e6e4de", "#38424a"],
    trim: ["#2a2e30", "#8a8f92", "#e6e4de"],
    roof: ["#55575a", "#3a3f45"],
    door: ["#2a2e30", "#8a8f92", "#c4542a"],
    walls2: ["#2a2e30", "#8a8f92"],
  },
  concrete: {
    walls: ["#a8a69e", "#bdb9ae", "#8f8d86", "#c9c4b6"],
    trim: ["#3a3e42", "#8a8f92", "#d8d4c8"],
    roof: ["#55575a"],
    door: ["#2a2e30", "#8a8f92"],
  },
  barn: {
    walls: ["#9e2a22", "#8a3a2a", "#6e4a34", "#b8b2a2", "#4a5a4a"],
    trim: ["#efeadd", "#e2dccb", "#2d2a26"],
    roof: ["#5d6163", "#3a3f45", "#8d9496", "#5a3d33"],
    door: ["#9e2a22", "#efeadd", "#6e4a34"],
    walls2: ["#8e8578", "#6f675c"],
  },
  diner: {
    walls: ["#cfd4d6", "#e6e0cc", "#b8c4c8", "#e9d2a6"],
    trim: ["#a8221c", "#2a5a6a", "#2a2e30", "#d9a948"],
    roof: ["#8d9496", "#5d6163"],
    door: ["#a8221c", "#2a5a6a", "#2a2e30"],
  },
} satisfies Record<string, Palette>;
export type PaletteId = keyof typeof PALETTES;
/** The awnings' colours (canvas). */
export const CANVAS = ["#8c1f1c", "#1f4a3a", "#22344a", "#6a2a4a", "#3a3a3a", "#b8732a"];

// ── kinds ────────────────────────────────────────────────────────────────────────────────────────────────────
export interface StyleDef {
  id: string;
  name: string;
  pt: string;
  pal: PaletteId;
  make: (k: K, o: Opts) => void;
}
/** What a composer is told besides its building: its floors, whether it's walked into, its sign. */
export interface Opts {
  floors: number;
  enter: boolean;
  sign: string;
  vacant: boolean;
}
export interface KindDef {
  name: string;
  pt: string;
  group: KindGroup;
  /** its plot's sides (m), its floors */
  min: number;
  max: number;
  floors: [number, number];
  /** can be walked into (its ground floor furnished: grounds.ts fitsOf) */
  enter: boolean;
  /** has a sign over its door */
  sign: boolean;
  styles: StyleDef[];
}

// ── the composers' shared bits ───────────────────────────────────────────────────────────────────────────────

/** Middles along a side between a and b, about `bay` apart, kept clear of [lo, hi] ranges. */
function clearOf(xs: number[], keep: [number, number][]): number[] {
  return xs.filter((x) => keep.every(([lo, hi]) => x < lo || x > hi));
}
/** The window a style puts in a wall: its part, its sill over the floor, how it's dressed. */
interface Win {
  part: string;
  sill: number;
  shutters?: "louvred" | "panel";
  /** a stone sill and a lintel (brick, stone, stucco walls) */
  stone?: "lintel" | "jack" | "sill";
  /** windows `lit` at night: the chance */
  lit?: number;
}
/** A window and its dress at s on a side, its floor at y. */
function window(k: K, w: ReturnType<K["wall"]>, sd: Side, s: number, y: number, win: Win) {
  const o = OPENINGS[win.part];
  // (a home's evening: more of its rooms lit than a shop's upstairs)
  const homes =
    k.b.kind === "house" || k.b.kind === "farmhouse" || k.b.kind === "townhouses" || k.b.kind === "apartments";
  const lit = k.r() < (win.lit ?? (homes ? 0.55 : 0.35));
  k.open(w, sd, win.part, s, y + win.sill, lit);
  // (a ground floor's window boxes on a house's front, now and then; a walk-up's window units)
  if (homes && sd.is === "front" && y < 1.2 && o.w < 1 && k.r() < 0.35)
    k.part("windowbox", sd, s, y + win.sill - 0.06, 0.02, o.w + 0.2);
  if (k.b.kind === "apartments" && y > 2 && o.w < 1 && k.r() < 0.18) k.part("ac-unit", sd, s, y + win.sill, 0);
  const top = y + win.sill + o.h + headRise(o);
  if (win.shutters) {
    const off = o.w / 2 + 0.1 + 0.23;
    for (const sg of [-1, 1]) k.part(`shutter-${win.shutters}~y`, sd, s + sg * off, y + win.sill, 0, 1, o.h);
  }
  if (win.stone === "lintel" || win.stone === "sill") k.part("sill-stone~x", sd, s, y + win.sill - 0.09, 0, o.w + 0.24);
  if (win.stone === "lintel") k.part("lintel-stone~x", sd, s, top, 0, o.w + 0.3);
  if (win.stone === "jack") {
    k.part("sill-stone~x", sd, s, y + win.sill - 0.09, 0, o.w + 0.24);
    k.part("lintel-jack~x", sd, s, top, 0, o.w + 0.18);
  }
}
/** A row of windows along a side at floor y, `bay` apart, `margin` in from its ends, clear of `keep`. */
function windowRow(
  k: K,
  w: ReturnType<K["wall"]>,
  sd: Side,
  y: number,
  win: Win,
  bay: number,
  margin = 1.2,
  keep: [number, number][] = [],
  min = 1,
) {
  const o = OPENINGS[win.part];
  const half = o.w / 2 + (win.shutters ? 0.7 : 0.3);
  const xs = clearOf(
    bays(margin, sd.L - margin, bay, min),
    keep.map(([a, b]) => [a - half, b + half] as [number, number]),
  );
  for (const s of xs) if (s - half > 0.2 && s + half < sd.L - 0.2) window(k, w, sd, s, y, win);
  return xs;
}
/** Corner boards up every corner of a mass, a water table round its foot, its downpipes. */
function corners(k: K, S: Record<Side["is"], Side>, y0: number, y1: number, boards = true, table = true) {
  for (const sd of Object.values(S)) {
    if (boards) k.part("corner-board~y", sd, sd.L, y0, 0, 1, y1 - y0);
    if (table) k.part("water-table~x", sd, sd.L / 2, y0, 0, sd.L);
  }
}
function downpipes(k: K, S: Record<Side["is"], Side>, y1: number) {
  for (const sd of [S.left, S.right]) {
    k.part("downpipe~y", sd, sd.L - 0.25, 0.2, 0, 1, y1 - 0.2);
    k.part("downpipe-shoe", sd, sd.L - 0.25, 0, 0);
  }
}

// ── the wood-frame house: houses, farmhouses, inns, roadhouses, stores, schoolhouses, barns, boathouses, sheds ──
interface FrameP {
  skin: Skin;
  /** the ground storey's own skin (a stone base under shingle, a brick ground floor) */
  base?: Skin;
  storey: number;
  /** a half storey under the roof (a cape's, a bungalow's): its eaves low, dormers up */
  half?: boolean;
  plinth: number;
  roof: "side" | "front" | "hip" | "gambrel" | "shed";
  pitch: number;
  over: number;
  cover: Cover;
  win: Win;
  /** windows along the sides and back, if not the front's */
  sideWin?: Win;
  bay: number;
  door: string;
  /** the big door in the front instead (a barn's, a boathouse's, a shed's) */
  bigDoor?: string;
  porch?: { kind: "full" | "centre" | "wrap" | "stoop"; post: string; rail: boolean; depth: number; up?: boolean };
  dormers?: "gable" | "shed";
  bayWindow?: boolean;
  /** a gabled wing standing forward of the front (a Victorian's, a gothic farmhouse's) */
  cross?: "left" | "centre";
  chimney?: "end" | "centre" | "twin" | "none";
  boards?: boolean;
  returns?: boolean;
  trio?: boolean;
  cupola?: boolean;
  /** joined houses along the front: each its door and windows (a townhouse row) */
  units?: boolean;
  /** shop windows across the front under the porch (a country store) */
  store?: boolean;
  /** a hay door up the gable (a barn) */
  loft?: boolean;
  /** a belfry on the ridge's front end (a schoolhouse) */
  belfry?: boolean;
}
function frame(P: FrameP) {
  return (k: K, o: Opts) => {
    const { W, D } = k;
    // (plan 111: walked into or not, its plinth as styled — its inside's floor raised to its door's sill)
    const plinth = P.plinth;
    const n = P.half ? 1 : Math.max(1, o.floors);
    const eave = plinth + P.storey * n + (P.half ? 1.1 : 0);
    const S = k.sides(0, 0, W, D);
    // the foundation
    k.box(-0.05, -0.6, -0.05, W + 0.05, plinth, D + 0.05, "paint", "#8e8578");
    // the walls (a base storey in its own skin)
    const walls: Record<string, ReturnType<K["wall"]>> = {};
    const upper: Record<string, ReturnType<K["wall"]>> = {};
    for (const sd of Object.values(S)) {
      if (P.base) {
        walls[sd.is] = k.wall(sd, plinth, plinth + P.storey, P.base, k.c.walls2);
        upper[sd.is] = k.wall(sd, plinth + P.storey, eave, P.skin);
      } else walls[sd.is] = upper[sd.is] = k.wall(sd, plinth, eave, P.skin);
    }
    const wallAt = (sd: Side, y: number) => (P.base && y >= plinth + P.storey - 0.01 ? upper[sd.is] : walls[sd.is]);
    if (P.boards !== false) corners(k, S, plinth, eave, true, P.skin === "clapboard" || P.skin === "shingle");
    // the roof
    let rise = 0;
    const alongU = P.roof === "side" || P.roof === "hip" || P.roof === "gambrel";
    const endsOf = (a: Side, b: Side): [ReturnType<K["wall"]>, Side][] => [
      [upper[a.is], a],
      [upper[b.is], b],
    ];
    if (P.roof === "side" || P.roof === "front")
      rise = k.gable(0, 0, W, D, eave, P.pitch, alongU, P.cover, {
        over: P.over,
        rake: P.over * 0.7,
        ends: alongU ? endsOf(S.left, S.right) : endsOf(S.front, S.back),
      });
    else if (P.roof === "hip") rise = k.hip(0, 0, W, D, eave, P.pitch, P.cover, P.over);
    else if (P.roof === "shed") {
      const hi = eave + D * Math.tan((P.pitch * Math.PI) / 180);
      k.shed(0, 0, W, D, hi, eave, P.cover, P.skin, P.over, endsOf(S.left, S.right));
      rise = hi - eave;
    } else {
      const kneeIn = Math.min(3.2, D * 0.18);
      k.gambrel(
        0,
        0,
        W,
        D,
        eave,
        kneeIn,
        D * 0.16 + 1,
        D * 0.24 + 1.4,
        P.cover,
        P.skin,
        P.over,
        endsOf(S.left, S.right),
      );
      rise = D * 0.24 + 1.4;
    }
    k.mass(0, 0, W, D, eave, eave + rise);
    k.solid("mass", 0, 0, W, D, 0, eave);
    if (P.returns && P.roof === "side")
      for (const [sd, s] of [
        [S.left, 0],
        [S.right, D],
      ] as const)
        k.part("return", sd, s === 0 ? 0 : sd.L, eave - 0.05, 0, 1, 1);
    if (P.roof === "side" || P.roof === "front") {
      // (the boxed eaves along the eaves' sides)
      for (const sd of alongU ? [S.front, S.back] : [S.left, S.right])
        k.part("cornice-box~x", sd, sd.L / 2, eave - 0.02, 0, sd.L);
      if (!alongU) for (const sd of [S.left, S.right]) k.part("gutter~x", sd, sd.L / 2, eave - 0.32, 0.5, sd.L + 0.4);
      else for (const sd of [S.front, S.back]) k.part("gutter~x", sd, sd.L / 2, eave - 0.32, 0.5, sd.L + 0.4);
    }
    // the front: the door (or the big door), the porch, the windows
    const front = S.front;
    const units = P.units ? Math.max(2, Math.round(W / 6)) : 1;
    const doorS: number[] = [];
    if (P.units) for (let i = 0; i < units; i++) doorS.push((W / units) * (i + 0.3));
    else doorS.push(W / 2);
    const big = P.bigDoor ? OPENINGS[P.bigDoor] : null;
    // (a boathouse whose big door opens on the water — the land falls away before it: walked into by a door at
    // its back, on the land — plan 111)
    const byWater = k.b.kind === "boathouse" && !!big && dropBefore(k, front, W / 2) > 1.5;
    if (big) {
      k.open([walls.front, upper.front], front, P.bigDoor as string, W / 2, plinth);
      k.doorAt(front, W / 2, plinth, big.w, big.h);
    } else {
      for (const s of doorS) k.open(walls.front, front, P.door, s, plinth);
      // (the way in: the door nearest the middle — a row's units each have one)
      const mid = doorS.reduce((a, b) => (Math.abs(b - W / 2) < Math.abs(a - W / 2) ? b : a), doorS[0]);
      k.doorAt(front, mid, plinth, OPENINGS[P.door].w, OPENINGS[P.door].h);
    }
    const dw = big ? big.w : OPENINGS[P.door].w;
    const keep: [number, number][] = doorS.map((s) => [s - dw / 2 - 0.2, s + dw / 2 + 0.2]);
    if (big) keep.splice(0, keep.length, [W / 2 - dw / 2 - 0.3, W / 2 + dw / 2 + 0.3]);
    // (the store's: shop windows either side of the door under its porch)
    if (P.store) {
      for (const [a, b] of [
        [0.8, W / 2 - dw / 2 - 0.4],
        [W / 2 + dw / 2 + 0.4, W - 0.8],
      ]) {
        if (b - a < 1.2) continue;
        const c = (a + b) / 2;
        const wd = b - a;
        walls.front.holes.push({ s0: a, s1: b, y0: plinth, y1: plinth + 3.0 });
        k.part("shop-bulkhead~x", front, c, plinth, 0, wd);
        k.part("shop-plate~x", front, c, plinth - 0.05, 0, wd, 0.98, true);
        for (let i = 1; i < Math.round(wd / 1.6); i++)
          k.part("shop-mullion", front, a + (wd * i) / Math.round(wd / 1.6), plinth - 0.05, 0, 1, 0.82);
      }
      k.part("shop-fascia~x", front, W / 2, plinth + 3.05, 0, W - 1);
      if (o.sign)
        k.sign(
          front,
          o.sign,
          W / 2,
          plinth + 3.12,
          Math.min(W - 1.6, o.sign.length * 0.55 + 1),
          0.6,
          "#efe6d0",
          "#3a2a1e",
          0.08,
        );
    } else if (!P.bayWindow || P.cross) windowRow(k, wallAt(front, plinth), front, plinth, P.win, P.bay, 1.2, keep);
    if (P.bayWindow && !P.cross) {
      k.part("win-bay", front, W * 0.25, plinth, 0);
      windowRow(k, wallAt(front, plinth), front, plinth, P.win, P.bay, W * 0.5, keep);
    }
    for (let f = 1; f < n; f++) {
      const y = plinth + P.storey * f;
      windowRow(k, wallAt(front, y), front, y, P.win, P.bay, 1.2, P.units ? [] : []);
    }
    if (P.trio) k.part("win-cr31-trio", front, W * 0.75, plinth + 0.85, 0);
    // the sides and back
    const sw = P.sideWin ?? P.win;
    for (const sd of [S.left, S.right, S.back]) {
      for (let f = 0; f < n; f++) {
        const y = plinth + P.storey * f;
        const keepB: [number, number][] =
          sd.is === "back" && f === 0 && (!big || byWater) ? [[sd.L * 0.3 - 0.6, sd.L * 0.3 + 0.6]] : [];
        if (P.units && sd.is !== "back") continue;
        windowRow(k, wallAt(sd, y), sd, y, sw, P.bay * (sd.is === "back" ? 1.2 : 1.35), 1.2, keepB);
      }
      if (P.half && P.roof === "side" && sd.is !== "back")
        k.open(upper[sd.is], sd, "win-dh22-cased", sd.L / 2, eave + 0.15);
    }
    if (!big || byWater) k.open(walls.back, S.back, "door-service", S.back.L * 0.3, plinth);
    if (byWater) k.doorAt(S.back, S.back.L * 0.3, plinth, OPENINGS["door-service"].w, OPENINGS["door-service"].h);
    // a gable's attic window (a front gable's, a side gable's ends)
    if (P.roof === "front" && rise > 1.6 && !P.bigDoor)
      k.open(upper.front, front, "win-sq-cased", W / 2, eave + rise * 0.3);
    if (P.roof === "front" && P.bigDoor && rise > 2.4)
      k.open(upper.front, front, "win-sq-cased", W / 2, eave + rise * 0.4);
    if (P.roof === "side" && rise > 1.6 && !P.half)
      for (const sd of [S.left, S.right])
        k.open(upper[sd.is], sd, rise > 3 ? "win-dh22-cased" : "win-sq-cased", sd.L / 2, eave + rise * 0.22);
    if (P.loft && P.roof === "gambrel") k.open(upper.left, S.left, "door-garage", S.left.L / 2, eave + 0.6);
    // the cross gable: a wing standing forward on the left (or the middle), its own gable to the street
    if (P.cross) {
      const cw = P.cross === "centre" ? Math.min(4.2, W * 0.36) : Math.min(5, W * 0.42);
      const cu0 = P.cross === "centre" ? W / 2 - cw / 2 : 0.6;
      const fwd = P.cross === "centre" ? 0.0 : 1.6;
      const v0 = -fwd;
      const S2 = k.sides(cu0, v0, cu0 + cw, 2.5);
      if (fwd > 0) {
        for (const sd of [S2.front, S2.left, S2.right]) {
          const w2 = k.wall(sd, plinth, eave, P.skin);
          if (sd.is === "front") {
            if (P.bayWindow) k.part("win-bay", sd, sd.L / 2, plinth, 0);
            else window(k, w2, sd, sd.L / 2, plinth, P.win);
            for (let f = 1; f < n; f++) window(k, w2, sd, sd.L / 2, plinth + P.storey * f, P.win);
          }
        }
        k.box(cu0 - 0.05, -0.6, v0 - 0.05, cu0 + cw + 0.05, plinth, 0, "paint", "#8e8578");
        k.solid("building", cu0, v0, cu0 + cw, 0, 0, eave);
      }
      const r2 = k.gable(cu0, v0, cu0 + cw, D * 0.5, eave, Math.max(P.pitch, 48), false, P.cover, {
        over: P.over,
        rake: 0.25,
        skin: P.skin === "clapboard" ? "shingle" : P.skin,
        gableColour: k.c.walls,
      });
      if (P.cross === "centre") k.part("win-pointed", S2.front, cw / 2, eave + 0.1, 0.02, 0.6, 0.55);
      else k.part("win-sq-cased", S2.front, cw / 2, eave + r2 * 0.35, 0.01);
    }
    // the porch
    if (P.porch) porch(k, P, o, plinth, eave, doorS, dw);
    else if (plinth > 0.12 && !big)
      for (const s of doorS)
        k.stairs(s - dw / 2 - 0.3, s + dw / 2 + 0.3, -0.3 * Math.ceil(plinth / 0.2), 0, plinth, "#8a7a64");
    // dormers on the front slope
    if (P.dormers && P.roof === "side") {
      const xs = P.dormers === "shed" ? [W / 2] : bays(1.5, W - 1.5, 3.4, 2);
      const t = Math.tan((P.pitch * Math.PI) / 180);
      for (const s of xs) {
        const vIn = 0.5;
        k.free(P.dormers === "shed" ? "dormer-shed" : "dormer-gable", s, eave + vIn * t, vIn, 0, -1);
      }
    }
    // the chimney(s)
    const ch = P.chimney ?? "end";
    if (ch !== "none" && P.roof !== "gambrel") {
      const t = Math.tan((P.pitch * Math.PI) / 180);
      const spots: [number, number][] =
        ch === "centre"
          ? [[W / 2, D / 2 + 0.6]]
          : ch === "twin"
            ? [
                [0.9, D / 2],
                [W - 0.9, D / 2],
              ]
            : [[W - 1.0, D / 2 + 0.7]];
      for (const [u, v] of spots) {
        const c = alongU ? Math.abs(v - D / 2) : Math.abs(u - W / 2);
        const half = alongU ? D / 2 : W / 2;
        const y = eave + (half - c) * t;
        k.free("chimney-brick", u, y, v, 0, -1);
        k.solid("building", u - 0.31, v - 0.45, u + 0.31, v + 0.45, eave, y + 1.6);
      }
    }
    if (P.cupola) k.free("cupola", W / 2, eave + rise - 0.05, D / 2, 0, -1);
    if (P.belfry) k.free("cupola", W / 2, eave + rise - 0.3, 1.0, 0, -1);
    // a lantern by the door, the mailbox at the street
    k.part("lantern", front, W / 2 + dw / 2 + 0.35, plinth + 1.7, 0);
    if (!big) k.lamp(W / 2, plinth + 2.4, -1.0);
    if (P.chimney !== undefined || P.porch) downpipes(k, S, eave - 0.3);
    k.L.eave = eave;
  };
}
/** A porch: its deck, its steps, its posts, its rail, its roof. */
function porch(k: K, P: FrameP, o: Opts, plinth: number, eave: number, doorS: number[], dw: number) {
  const pr = P.porch as NonNullable<FrameP["porch"]>;
  const W = k.W;
  const d = pr.depth;
  const [u0, u1] =
    pr.kind === "full" || pr.kind === "wrap"
      ? [0, W]
      : pr.kind === "stoop"
        ? [W / 2 - 1.3, W / 2 + 1.3]
        : [Math.max(0, W / 2 - Math.max(2.6, dw / 2 + 1.4)), Math.min(W, W / 2 + Math.max(2.6, dw / 2 + 1.4))];
  const deck = plinth;
  const roofY = Math.min(plinth + 2.75, eave - 0.1);
  k.box(u0, deck - 0.12, -d, u1, deck, 0, "paint", "#8a7a64");
  k.box(u0, -0.4, -d + 0.15, u1, deck - 0.12, -0.05, "paint", "#6e675c");
  k.solid("porch", u0, -d, u1, 0, -0.2, deck);
  for (const s of doorS) k.stairs(s - 1, s + 1, -d - 0.3 * Math.ceil(deck / 0.2), -d, deck, "#8a7a64");
  if (pr.kind === "stoop" && !pr.post) return;
  // posts at its front corners and between, ~2.4 apart — an odd count of spans, so the door's in the middle of one
  let spans = Math.max(1, Math.round((u1 - u0) / 2.4));
  if (spans % 2 === 0) spans++;
  const posts = spans + 1;
  for (let i = 0; i < posts; i++) {
    const u = u0 + 0.15 + ((u1 - u0 - 0.3) * i) / (posts - 1);
    const sy = (roofY - deck) / (pr.post === "post-craftsman" ? 2.72 : pr.post === "column-tuscan" ? 2.7 : 2.6);
    k.free(pr.post, u, deck, -d + 0.15, 0, -1, 1, sy);
    k.solid("porch", u - 0.1, -d + 0.05, u + 0.1, -d + 0.25, deck, roofY);
  }
  if (pr.rail)
    for (let i = 0; i + 1 < posts; i++) {
      const a = u0 + 0.15 + ((u1 - u0 - 0.3) * i) / (posts - 1);
      const b = u0 + 0.15 + ((u1 - u0 - 0.3) * (i + 1)) / (posts - 1);
      const m = (a + b) / 2;
      if (doorS.some((s) => Math.abs(s - m) < (b - a) / 2 + 0.2)) continue;
      k.free("rail", m, deck, -d + 0.15, 0, -1, (b - a - 0.2) / 1.8, 1);
      k.solid("porch_rail", a, -d + 0.1, b, -d + 0.2, deck, deck + 0.95);
    }
  // its roof: a shallow shed off the wall, its fascia and beam
  const t = 0.25;
  const hi = roofY + d * t + 0.15;
  k.poly(
    [
      [u0 - 0.2, hi, 0],
      [u1 + 0.2, hi, 0],
      [u1 + 0.2, roofY + 0.05, -d - 0.25],
      [u0 - 0.2, roofY + 0.05, -d - 0.25],
    ],
    [0, 1, -t],
    `roof:${P.cover}`,
    k.c.roof,
  );
  k.poly(
    [
      [u0 - 0.2, roofY - 0.08, -d - 0.25],
      [u1 + 0.2, roofY - 0.08, -d - 0.25],
      [u1 + 0.2, hi - 0.1, 0],
      [u0 - 0.2, hi - 0.1, 0],
    ],
    [0, -1, 0],
    "paint",
    shade(k.c.trim, 0.85),
  );
  k.box(u0 - 0.2, roofY - 0.25, -d - 0.27, u1 + 0.2, roofY + 0.06, -d - 0.2, "paint", k.c.trim);
  for (const sg of [u0 - 0.2, u1 + 0.2])
    k.poly(
      [
        [sg, roofY - 0.08, -d - 0.25],
        [sg, hi - 0.1, 0],
        [sg, hi, 0],
        [sg, roofY + 0.05, -d - 0.25],
      ],
      [sg === u0 - 0.2 ? -1 : 1, 0, 0],
      "paint",
      k.c.trim,
    );
  k.L.snow.push({
    t: "slope",
    h0: k.p3(u0 - 0.1, hi, -0.05),
    h1: k.p3(u1 + 0.1, hi, -0.05),
    l0: k.p3(u0 - 0.1, roofY + 0.05, -d - 0.2),
    l1: k.p3(u1 + 0.1, roofY + 0.05, -d - 0.2),
    deep: 0.16,
  });
  k.solid("porch", u0, -d - 0.25, u1, -0.6, roofY, roofY + 0.15);
  // an upstairs porch over it (an inn's)
  if (pr.up && o.floors > 1) {
    const y2 = plinth + P.storey;
    k.box(u0, y2 - 0.12, -d, u1, y2, 0, "paint", "#8a7a64");
    for (let i = 0; i + 1 < posts; i++) {
      const a = u0 + 0.15 + ((u1 - u0 - 0.3) * i) / (posts - 1);
      const b = u0 + 0.15 + ((u1 - u0 - 0.3) * (i + 1)) / (posts - 1);
      k.free("rail", (a + b) / 2, y2, -d + 0.15, 0, -1, (b - a - 0.2) / 1.8, 1);
    }
  }
}

// ── the block: Main Street, apartments, offices, schools, police, fire, clinics, libraries ──────────────────
interface BlockP {
  skin: Skin;
  /** the ground storey's own skin (a stone base, a stucco shop floor) */
  base?: Skin;
  g: number;
  u: number;
  plinth: number;
  ground: "shop" | "entry" | "civic" | "bays" | "windows" | "lobby" | "pub" | "corner";
  win: Win;
  /** the ground floor's windows (entry, windows, lobby) */
  gwin?: Win;
  bay: number;
  /** ribbons of windows (offices, modern schools) or a curtain wall instead of punched ones */
  ribbon?: boolean;
  curtain?: boolean;
  top: "bracketed" | "dentil" | "coping" | "stepped" | "falsefront" | "metal" | "corbel";
  parapet: number;
  roof?: "flat" | "mansard" | "hip";
  cover?: Cover;
  awning?: "striped" | "plain";
  blade?: boolean;
  fireEscape?: boolean;
  tank?: boolean;
  plant?: number;
  belt?: boolean;
  quoins?: boolean;
  entry?: string;
  canopy?: boolean;
  marquee?: boolean;
  flag?: boolean;
  lamps?: "police" | "lantern" | "goose";
  /** joined fronts along the street (a row): each its own door, stoop and cornice break */
  units?: boolean;
  /** balconies under every other window (modern apartments) */
  balconies?: boolean;
  /** a clock in the pediment (civic) */
  clock?: boolean;
  /** a hose tower (a fire station's) */
  tower?: boolean;
  /** a cupola on the roof (a 1920s school's) */
  cupola?: boolean;
  /** neon in the windows (a tavern) */
  neon?: boolean;
  /** a vertical sign up the front (art deco) */
  vsign?: boolean;
}
function block(P: BlockP) {
  return (k: K, o: Opts) => {
    const { W, D } = k;
    const plinth = P.plinth;
    const n = Math.max(1, o.floors);
    const eave = plinth + P.g + P.u * (n - 1);
    const roofKind = P.roof ?? "flat";
    const par = roofKind === "flat" ? P.parapet : 0;
    const S = k.sides(0, 0, W, D);
    const top = eave + par;
    const walls: Record<string, ReturnType<K["wall"]>> = {};
    const upper: Record<string, ReturnType<K["wall"]>> = {};
    if (plinth > 0.05)
      k.box(-0.06, -0.6, -0.06, W + 0.06, plinth, D + 0.06, "paint", P.skin === "brick" ? "#9e9a90" : "#a8a69e");
    for (const sd of Object.values(S)) {
      if (P.base) {
        walls[sd.is] = k.wall(sd, plinth, plinth + P.g, P.base, k.c.walls2);
        upper[sd.is] = k.wall(sd, plinth + P.g, top, P.skin);
      } else walls[sd.is] = upper[sd.is] = k.wall(sd, plinth, top, P.skin);
    }
    const wallAt = (sd: Side, y: number) => (y >= plinth + P.g - 0.01 ? upper[sd.is] : walls[sd.is]);
    k.solid("mass", 0, 0, W, D, 0, eave);
    const front = S.front;
    const dS = W / 2;
    // (where you go in: the door in the middle, or a row's unit door)
    let wayIn = dS;
    // ── the ground floor's front ──
    const gy = plinth;
    let doorW = 1.8;
    const units = P.units ? Math.max(2, Math.round(W / 6)) : 1;
    if (P.ground === "shop" || P.ground === "pub" || P.ground === "corner") {
      const pil = 0.42;
      const recess = !o.enter && P.ground !== "pub";
      // pilasters at the ends and every ≤ 8 m — an odd number of bays, so the middle's glass and its door there (an
      // even number put a pilaster on the middle: no door drawn at all — plan 111)
      const nseg0 = Math.max(1, Math.ceil((W - 2 * pil) / 8));
      const nseg = nseg0 % 2 === 0 ? nseg0 + 1 : nseg0;
      const pilS = Array.from({ length: nseg + 1 }, (_, i) => pil / 2 + ((W - pil) * i) / nseg);
      for (const s of pilS) k.part("shop-pilaster", front, s, gy, 0, 1, Math.min(1.2, (P.g - 0.75) / 3.6));
      const dw = recess ? 1.8 : 0.95;
      doorW = dw;
      for (let i = 0; i < nseg; i++) {
        const a = pilS[i] + pil / 2;
        const b = pilS[i + 1] - pil / 2;
        const runs: [number, number][] = [];
        if (dS > a && dS < b) {
          runs.push([a, dS - dw / 2], [dS + dw / 2, b]);
          k.open(walls.front, front, recess ? "shop-recess" : "door-shop", dS, gy, true);
          if (!recess) {
            walls.front.holes.push({ s0: dS - dw / 2, s1: dS + dw / 2, y0: gy + 2.65, y1: gy + 3.55 });
            k.part("shop-transom~x", front, dS, gy - 0.0, 0, dw);
          }
        } else runs.push([a, b]);
        for (const [ra, rb] of runs) {
          const wd = rb - ra;
          if (wd < 0.4) continue;
          const c = (ra + rb) / 2;
          walls.front.holes.push({ s0: ra, s1: rb, y0: gy, y1: gy + 3.55 });
          k.part("shop-bulkhead~x", front, c, gy, 0, wd);
          k.part("shop-plate~x", front, c, gy, 0, wd, 1, true);
          k.part("shop-transom~x", front, c, gy, 0, wd);
          const m = Math.max(1, Math.round(wd / 1.7));
          for (let j = 1; j < m; j++) k.part("shop-mullion", front, ra + (wd * j) / m, gy);
          if (P.neon && j0(runs, ra)) k.part("sign-neon", front, c, gy + 1.9, -0.09);
        }
      }
      // the fascia and its sign, the awning
      const fy = gy + 3.62;
      k.part("shop-fascia~x", front, W / 2, fy, 0, W - 2 * pil);
      if (o.sign && !o.vacant)
        k.sign(
          front,
          o.sign,
          W / 2,
          fy + 0.07,
          Math.min(W - 2, o.sign.length * 0.62 + 1.2),
          0.62,
          P.ground === "pub" ? "#1f3a2e" : "#ece4cc",
          P.ground === "pub" ? "#d9a948" : "#2a2420",
          0.075,
        );
      if (P.awning && !o.vacant) k.part(`awning-${P.awning}~x`, front, W / 2, gy + 3.55, 0, W - 2 * pil - 0.6);
      if (P.awning && !o.vacant) {
        const at = (dd: number) => 3.55 - (0.75 * dd) / 1.1;
        for (let j = 0; j < 3; j++) {
          const db = 0.6 + (0.5 * (j + 1)) / 3;
          k.solid("awning", pil + 0.3, -db, W - pil - 0.3, -0.6 - (0.5 * j) / 3, gy + 2.6, gy + at(db));
        }
      }
      if (P.lamps === "goose" || !P.lamps)
        for (const s of [W * 0.28, W * 0.72]) k.part("gooseneck", front, s, fy + 0.6, 0);
      if (P.lamps === "lantern") for (const s of [pil + 0.5, W - pil - 0.5]) k.part("lantern", front, s, gy + 2.3, 0);
      if (P.ground === "corner") {
        // the shop goes round the corner: the right side's first bay glass too
        const sd = S.right;
        const b = Math.min(sd.L - 1, 5);
        walls.right.holes.push({ s0: 0.5, s1: b, y0: gy, y1: gy + 3.55 });
        k.part("shop-bulkhead~x", sd, (0.5 + b) / 2, gy, 0, b - 0.5);
        k.part("shop-plate~x", sd, (0.5 + b) / 2, gy, 0, b - 0.5, 1, true);
        k.part("shop-transom~x", sd, (0.5 + b) / 2, gy, 0, b - 0.5);
        k.part("shop-fascia~x", sd, (0.5 + b) / 2, fy, 0, b - 0.4);
        k.part("shop-pilaster", sd, b + 0.21, gy, 0, 1, Math.min(1.2, (P.g - 0.75) / 3.6));
      }
    } else if (P.ground === "civic") {
      // a portico on four columns, steps up to it, a double door under an arched head, arched windows either side
      const cw = Math.min(W - 2, 8.4);
      const ch = Math.min(P.g + (n > 1 ? P.u : 0) - 0.3, 7.5);
      const steps = Math.max(0.6, plinth);
      // (the portico's floor at the door's, the steps down from its front)
      k.box(W / 2 - cw / 2 - 0.3, -0.3, -2.75, W / 2 + cw / 2 + 0.3, steps, 0, "paint", "#c8c0ae");
      k.solid("porch", W / 2 - cw / 2 - 0.3, -2.75, W / 2 + cw / 2 + 0.3, 0, -0.3, steps);
      k.stairs(W / 2 - cw / 2 - 0.3, W / 2 + cw / 2 + 0.3, -2.75 - 0.32 * Math.ceil(steps / 0.2), -2.75, steps);
      for (let i = 0; i < 4; i++) {
        const u = W / 2 - cw / 2 + 0.45 + ((cw - 0.9) * i) / 3;
        k.free("column-civic", u, steps, -2.2, 0, -1, 1, ch / 6);
        k.solidCyl("building", u, -2.2, 0.3, steps, steps + ch);
      }
      const ey = steps + ch;
      k.box(W / 2 - cw / 2 - 0.2, ey, -2.75, W / 2 + cw / 2 + 0.2, ey + 0.75, 0, "paint", "#ddd5c2");
      k.part("cornice-dentil~x", front, W / 2, ey + 0.1, 2.75 - 0.04, cw + 0.4);
      const ph = cw * 0.22;
      k.poly(
        [
          [W / 2 - cw / 2 - 0.25, ey + 0.75, -2.7],
          [W / 2 + cw / 2 + 0.25, ey + 0.75, -2.7],
          [W / 2, ey + 0.75 + ph, -2.7],
        ],
        [0, 0, -1],
        "paint",
        "#e6dfcd",
      );
      for (const sg of [-1, 1]) {
        const a: V3 = [W / 2 + sg * (cw / 2 + 0.4), ey + 0.7, -2.95];
        const b: V3 = [W / 2, ey + 0.8 + ph, -2.95];
        k.poly(
          [
            [a[0], a[1], a[2]],
            [b[0], b[1], b[2]],
            [b[0], b[1], 0.1],
            [a[0], a[1], 0.1],
          ],
          [sg * 0.5, 1, 0],
          `roof:${P.cover ?? "slate"}`,
          k.c.roof,
        );
      }
      k.solid("building", W / 2 - cw / 2, -2.75, W / 2 + cw / 2, 0, ey, ey + 0.75);
      k.roofSolid(W / 2 - cw / 2 - 0.25, -2.75, W / 2 + cw / 2 + 0.25, 0, false, [
        [W / 2 - cw / 2 - 0.25, ey + 0.75],
        [W / 2, ey + 0.75 + ph],
        [W / 2 + cw / 2 + 0.25, ey + 0.75],
      ]);
      if (P.clock) k.part("clock", front, W / 2, ey + 0.75 + ph * 0.42, 2.66);
      k.open(walls.front, front, "door-double", W / 2, steps);
      doorW = 1.8;
      windowRow(k, walls.front, front, steps, { part: "win-arch", sill: 0.9, lit: 0.4 }, 2.6, 1.2, [
        [W / 2 - 1.6, W / 2 + 1.6],
      ]);
      if (o.sign)
        k.sign(
          front,
          o.sign.toUpperCase(),
          W / 2,
          ey + 0.18,
          Math.min(cw - 0.6, o.sign.length * 0.42 + 0.6),
          0.42,
          "#ddd5c2",
          "#3a3428",
          2.8,
          false,
        );
    } else if (P.ground === "bays") {
      // a fire station's: its engines' doors 4.6 apart, the office door at the end
      const nb = Math.max(1, Math.floor((W - 3.6) / 4.6));
      const span = nb * 4.6;
      const a = 0.8;
      for (let i = 0; i < nb; i++) {
        const s = a + 2.3 + i * 4.6;
        k.open(walls.front, front, "door-apparatus", s, gy, false);
        if (P.skin === "brick") k.part("lintel-stone~x", front, s, gy + 4.3, 0, 4.2);
      }
      k.box(0, -0.02, -6, Math.min(W, a + span + 0.4), 0.02, 0, "paint", "#b8b4aa");
      const ds = Math.min(W - 1.2, a + span + 1.4);
      k.open(walls.front, front, "door-front", ds, gy);
      doorW = 1.77;
      // (the way in: the office door, as drawn — plan 111)
      k.doorAt(front, ds, gy, OPENINGS["door-front"].w, OPENINGS["door-front"].h);
      if (o.sign)
        k.sign(
          front,
          o.sign.toUpperCase(),
          a + span / 2,
          gy + 4.55,
          Math.min(span - 0.4, o.sign.length * 0.55 + 1),
          0.55,
          "#efe6d0",
          "#9e1512",
          0.06,
          false,
        );
      if (P.lamps === "lantern" || !P.lamps) k.part("lantern", front, ds + 1.2, gy + 2.2, 0);
    } else {
      // an entry: the door (or a lobby's sliders, or its own) in the middle, windows across
      const entry = P.entry ?? (P.ground === "lobby" ? "door-slider" : "door-front");
      const eo = OPENINGS[entry];
      doorW = eo.w;
      if (P.units) {
        const uw = W / units;
        // (the way in: the unit door nearest the middle — plan 111)
        wayIn = uw * (Math.floor((units - 1) / 2) + 0.3);
        for (let i = 0; i < units; i++) {
          const s = uw * (i + 0.3);
          k.open(walls.front, front, entry, s, gy);
          if (plinth >= 0.5) {
            k.part("stoop", front, s, 0, 0, 1, plinth / 1.1);
            stoopSolids(k, s, plinth);
          }
          const gw = P.gwin ?? P.win;
          if (uw > 4.6) window(k, walls.front, front, uw * (i + 0.74), gy, gw);
        }
      } else {
        k.open(walls.front, front, entry, dS, gy);
        if (P.ground === "lobby" && !P.curtain) {
          // glass either side of the door, floor to head
          for (const [a, b] of [
            [1.0, dS - eo.w / 2 - 0.3],
            [dS + eo.w / 2 + 0.3, W - 1.0],
          ]) {
            if (b - a < 1) continue;
            walls.front.holes.push({ s0: a, s1: b, y0: gy + 0.3, y1: gy + 2.9 });
            k.part("win-ribbon~x", front, (a + b) / 2, gy + 0.3, 0, b - a, 2.6 / 1.7);
          }
        } else if (!P.curtain)
          windowRow(k, walls.front, front, gy, P.gwin ?? P.win, P.bay, 1.2, [
            [dS - eo.w / 2 - 0.3, dS + eo.w / 2 + 0.3],
          ]);
        if (plinth > 0.12)
          k.stairs(dS - eo.w / 2 - 0.6, dS + eo.w / 2 + 0.6, -0.32 * Math.ceil(plinth / 0.2) - 0.3, 0, plinth);
        if (P.canopy) {
          k.part("canopy-steel~x", front, dS, gy + eo.h + 0.25, 0, eo.w + 1.6);
          k.solid("awning", dS - eo.w / 2 - 0.8, -1.4, dS + eo.w / 2 + 0.8, -0.6, gy + eo.h + 0.25, gy + eo.h + 0.47);
        }
        if (P.marquee) {
          k.part("marquee", front, dS, gy + 3.1, 0);
          k.solid("awning", dS - 1.6, -1.8, dS + 1.6, -0.6, gy + 3.1, gy + 3.65);
        }
        if (P.lamps === "police")
          for (const sg of [-1, 1]) k.free("lamp-police", dS + sg * (eo.w / 2 + 0.7), gy, -0.6, 0, -1);
        if (P.lamps === "lantern")
          for (const sg of [-1, 1]) k.part("lantern", front, dS + sg * (eo.w / 2 + 0.45), gy + 1.9, 0);
        if (o.sign && P.ground !== "lobby")
          k.sign(
            front,
            o.sign.toUpperCase(),
            dS,
            gy + eo.h + headRise(eo) + 0.2,
            Math.min(W - 2, o.sign.length * 0.36 + 0.6),
            0.4,
            "#d8d0bc",
            "#2a2e30",
            0.03,
            false,
          );
        if (o.sign && P.ground === "lobby")
          k.sign(
            front,
            o.sign.toUpperCase(),
            dS,
            gy + 3.05,
            Math.min(W - 2, o.sign.length * 0.4 + 0.6),
            0.45,
            "#2a2e30",
            "#f1eee6",
            0.06,
            true,
          );
      }
    }
    if (P.ground !== "bays") k.doorAt(front, wayIn, gy, doorW, 2.6);
    // ── the upper floors, all round ──
    const rowAll = (sd: Side, f: number, bay: number) => {
      const y = f === 0 ? plinth : plinth + P.g + P.u * (f - 1);
      const hh = f === 0 ? P.g : P.u;
      if (P.curtain) {
        const m = Math.max(1, Math.round(sd.L / 1.5));
        const wd = sd.L / m;
        for (let i = 0; i < m; i++) {
          const s = wd * (i + 0.5);
          if (f === 0 && sd.is === "front" && Math.abs(s - dS) < wd / 2 + 1.9) continue;
          wallAt(sd, y).holes.push({ s0: s - wd / 2, s1: s + wd / 2, y0: y, y1: y + hh });
          k.part("win-curtain", sd, s, y, 0, wd / 1.5, hh / 3.8, k.r() < 0.4);
        }
        return;
      }
      if (P.ribbon) {
        const a = 0.9;
        const b = sd.L - 0.9;
        wallAt(sd, y).holes.push({ s0: a, s1: b, y0: y + 0.95, y1: y + 2.65 });
        k.part("win-ribbon~x", sd, sd.L / 2, y + 0.95, 0, b - a, 1, k.r() < 0.45);
        for (let s = a + 1.5; s < b - 0.2; s += 1.5) k.part("shop-mullion", sd, s, y + 0.95 - 0.6, 0.0, 1, 1.7 / 2.95);
        return;
      }
      const xs = windowRow(k, wallAt(sd, y), sd, y, P.win, bay, 1.2);
      if (P.balconies && sd.is === "front")
        xs.forEach((s, i) => {
          if (i % 2) return;
          const [u, v] = k.at(sd, s, 0);
          k.box(u - 1.2, y - 0.15, v - 1.3, u + 1.2, y, v, "paint", "#b8b4aa");
          k.box(u - 1.2, y, v - 1.3, u + 1.2, y + 1.0, v - 1.25, "paint", "#2a2e30");
        });
    };
    for (let f = 1; f < n; f++)
      for (const sd of Object.values(S)) rowAll(sd, f, sd.is === "front" ? P.bay : P.bay * 1.4);
    // (a curtain wall's ground floor too, round the doors)
    if (P.curtain) for (const sd of Object.values(S)) rowAll(sd, 0, P.bay);
    // the ground floor's sides and back
    const gwin = P.gwin ?? P.win;
    for (const sd of [S.left, S.right, S.back]) {
      if (P.curtain) continue;
      if (P.ground === "corner" && sd.is === "right") {
        windowRow(k, walls[sd.is], sd, gy, gwin, P.bay * 1.4, 5.6);
        continue;
      }
      if (P.ribbon && P.ground !== "shop") {
        rowAllGround(k, walls[sd.is], sd, gy);
        continue;
      }
      if (P.ground === "shop" || P.ground === "pub") continue;
      windowRow(
        k,
        walls[sd.is],
        sd,
        gy,
        gwin,
        P.bay * 1.5,
        1.4,
        sd.is === "back" ? [[sd.L * 0.25 - 0.6, sd.L * 0.25 + 0.6]] : [],
      );
    }
    k.open(walls.back, S.back, "door-service", S.back.L * 0.25, gy);
    k.free("bins", W * 0.75, 0, D + 0.7, 0, 1);
    // ── the top ──
    const tk = P.top;
    if (roofKind === "flat") {
      k.flat(0, 0, W, D, eave, par, P.skin, tk === "metal" ? "metal" : tk === "falsefront" ? "none" : "stone");
      if (tk === "bracketed") {
        k.part("cornice-bracketed~x", front, W / 2, eave + par - 0.88, 0, W + 0.3);
        for (const s of bays(0.2, W - 0.2, 0.9, 2)) k.part("bracket", front, s, eave + par - 0.88, 0);
        if (P.units)
          for (let i = 1; i < units; i++) k.part("bracket", front, (W / units) * i, eave + par - 0.88, 0, 1.4, 1.2);
      } else if (tk === "dentil") {
        for (const sd of Object.values(S)) k.part("cornice-dentil~x", sd, sd.L / 2, eave + par - 0.62, 0, sd.L + 0.4);
      } else if (tk === "corbel") {
        for (const sd of [front]) {
          k.part("belt-course~x", sd, sd.L / 2, eave + par - 0.45, 0, sd.L);
          for (const s of bays(0.3, sd.L - 0.3, 0.45, 4))
            k.part("lintel-stone~x", sd, s, eave + par - 0.62, 0, 0.18, 0.7);
        }
      } else if (tk === "stepped") {
        const hm = 1.2;
        k.box(W / 2 - W * 0.18, eave + par, -0.02, W / 2 + W * 0.18, eave + par + hm, 0.3, `skin:${P.skin}`, k.c.walls);
        k.box(
          W / 2 - W * 0.1,
          eave + par + hm,
          -0.02,
          W / 2 + W * 0.1,
          eave + par + hm + 0.8,
          0.3,
          `skin:${P.skin}`,
          k.c.walls,
        );
        k.box(
          W / 2 - W * 0.18 - 0.05,
          eave + par + hm,
          -0.06,
          W / 2 + W * 0.18 + 0.05,
          eave + par + hm + 0.1,
          0.34,
          "paint",
          k.c.trim,
        );
        for (const s of [W * 0.15, W * 0.85, W * 0.5])
          k.box(
            s - 0.25,
            plinth + P.g,
            -0.12,
            s + 0.25,
            eave + par + (s === W * 0.5 ? hm + 0.8 : 0.4),
            0.0,
            "paint",
            shade(k.c.walls, 1.08),
          );
        k.solid("building", W / 2 - W * 0.18, 0, W / 2 + W * 0.18, 0.3, eave + par, eave + par + hm + 0.8);
      } else if (tk === "falsefront") {
        const hf = 1.4;
        k.box(-0.15, eave + par, -0.02, W + 0.15, eave + par + hf, 0.25, `skin:${P.skin}`, k.c.walls);
        k.box(-0.2, eave + par + hf, -0.08, W + 0.2, eave + par + hf + 0.18, 0.32, "paint", k.c.trim);
        k.box(
          W / 2 - 1.6,
          eave + par + hf + 0.18,
          -0.02,
          W / 2 + 1.6,
          eave + par + hf + 0.85,
          0.25,
          `skin:${P.skin}`,
          k.c.walls,
        );
        k.box(
          W / 2 - 1.75,
          eave + par + hf + 0.85,
          -0.08,
          W / 2 + 1.75,
          eave + par + hf + 1.03,
          0.32,
          "paint",
          k.c.trim,
        );
        k.solid("building", 0, 0, W, 0.25, eave + par, eave + par + hf);
        k.L.snow.push({ t: "flat", ...k.rect(-0.1, -0.05, W + 0.1, 0.3), y: eave + par + hf + 0.18, deep: 0.12 });
        k.mass(0, 0, W, D, eave, eave + par + hf + 1.03);
      } else if (tk === "coping" || tk === "metal") {
        /* the coping's the flat roof's own */
      }
      if (P.belt) k.part("belt-course~x", front, W / 2, plinth + P.g - 0.1, 0, W + 0.1);
      // what's on the roof
      const rr = rngOf(seedOf(k.b, 9));
      for (let i = 0; i < (P.plant ?? 1); i++)
        k.free("rooftop-ac", 2 + rr() * (W - 4), eave, D * 0.45 + rr() * (D * 0.4), 0, -1);
      for (let i = 0; i < 2; i++) k.free("vent-pipe", 1.5 + rr() * (W - 3), eave + 0.3, 1.5 + rr() * (D - 3), 0, -1);
      // (the stair house: 2.6 × 3.6, its door to the front, its back 0.5 in from the back wall)
      if (n >= 3 && W > 8 && D > 8) k.free("stair-bulkhead", W - 2.2, eave, D - 4.1, 0, -1);
      if (P.tank && n >= 4) k.free("water-tank", W * 0.3, eave, D * 0.6, 0, -1);
      if (P.cupola) k.free("cupola", W / 2, eave + 0.3, D / 2, 0, -1);
    } else if (roofKind === "mansard") {
      const h = Math.min(3.2, P.u);
      k.mansard(0, 0, W, D, eave, h, 0.9, P.cover ?? "slate");
      for (const s of bays(1.4, W - 1.4, 3.0, 2)) k.free("dormer-gable", s, eave + 0.4, 0.55, 0, -1);
      k.mass(0, 0, W, D, eave, eave + h);
    } else {
      const rise = k.hip(0, 0, W, D, eave, 22, P.cover ?? "slate", 0.6);
      k.mass(0, 0, W, D, eave, eave + rise);
      if (tk === "dentil")
        for (const sd of Object.values(S)) k.part("cornice-dentil~x", sd, sd.L / 2, eave - 0.62, 0, sd.L + 0.2);
      if (P.cupola) k.free("cupola", W / 2, eave + rise - 0.2, D / 2, 0, -1);
    }
    if (roofKind === "flat" && tk !== "falsefront") k.mass(0, 0, W, D, eave, top + (tk === "stepped" ? 2.1 : 0.12));
    if (P.quoins) for (const sd of Object.values(S)) k.part("quoin~y", sd, sd.L, plinth, 0, 1, eave - plinth);
    if (P.blade && o.sign && !o.vacant) k.part("sign-blade", front, W - 0.7, plinth + P.g + 0.9, 0);
    if (P.vsign && o.sign) {
      // a tall board up the front, its letters one over another, lit
      const h = Math.min(eave + par - plinth - P.g - 0.4, o.sign.length * 0.85 + 0.6);
      const y = plinth + P.g + 0.3;
      k.box(W - 1.75, y, -0.52, W - 0.85, y + h, -0.38, "paint", "#2a2e30");
      k.box(W - 1.45, y + 0.4, -0.38, W - 1.15, y + h - 0.4, 0, "paint", "#2a2e30");
      k.sign(front, o.sign.split("").join("\n"), W - 1.3, y + 0.05, 0.78, h - 0.1, "#2a2e30", "#ffcf7a", 0.53, true);
    }
    if (P.fireEscape && n >= 3) {
      const sd = S.left;
      for (let f = 1; f < n; f++) k.part("fire-escape", sd, sd.L * 0.5, plinth + P.g + P.u * (f - 1), 0);
    }
    if (P.flag) k.free("flagpole", W * 0.15, 0, -2.6, 0, -1);
    if (P.tower) {
      const tw = 3.2;
      const th = top + 5;
      const S3 = k.sides(W - tw, D - tw, W, D);
      for (const sd of Object.values(S3)) {
        const w3 = k.wall(sd, top - 0.2, th, P.skin);
        if (sd.is === "front" || sd.is === "right") k.open(w3, sd, "win-arch-brick", sd.L / 2, th - 2.6);
      }
      const r = k.hip(W - tw, D - tw, W, D, th, 35, P.cover ?? "slate", 0.25);
      k.solid("building", W - tw, D - tw, W, D, eave, th);
      k.mass(W - tw, D - tw, W, D, th, th + r);
    }
    downpipes(k, S, eave + par);
    k.free("meter-electric", W - 0.6, 0, D + 0.02, 0, 1);
    k.L.eave = eave;
  };
}
/** A brownstone stoop's solids (the kit's `stoop`: a landing 1 m deep, five steps 0.3 down to the pavement, its
 *  rise scaled to the floor's `h`) at s on the front. */
function stoopSolids(k: K, s: number, h: number) {
  const r = h / 6;
  k.solid("porch", s - 0.8, -1.0, s + 0.8, 0, -0.2, h);
  for (let i = 0; i < 5; i++) k.solid("porch", s - 0.8, -(1.3 + 0.3 * i), s + 0.8, -(1.0 + 0.3 * i), -0.2, r * (5 - i));
}
function j0(runs: [number, number][], a: number) {
  return runs[0][0] === a;
}
function rowAllGround(k: K, w: ReturnType<K["wall"]>, sd: Side, y: number) {
  const a = 0.9;
  const b = sd.L - 0.9;
  if (b - a < 1) return;
  w.holes.push({ s0: a, s1: b, y0: y + 0.95, y1: y + 2.65 });
  k.part("win-ribbon~x", sd, sd.L / 2, y + 0.95, 0, b - a, 1, k.r() < 0.45);
}

// ── the church ─────────────────────────────────────────────────────────────────────────────────────────────
interface ChurchP {
  skin: Skin;
  win: string;
  door: string;
  pitch: number;
  /** a tower at the front's middle out past the plot with a spire (the meetinghouse), at a corner with a belfry
   *  under a pyramid (romanesque), or a square one with a spire at a corner (gothic) */
  tower: "front" | "corner-belfry" | "corner-spire";
  cover: Cover;
  buttress?: boolean;
  rose?: boolean;
}
function church(P: ChurchP) {
  return (k: K, o: Opts) => {
    const { W, D } = k;
    const eave = 6;
    const plinth = 0.15;
    const S = k.sides(0, 0, W, D);
    k.box(-0.05, -0.6, -0.05, W + 0.05, plinth, D + 0.05, "paint", "#8e8578");
    const walls: Record<string, ReturnType<K["wall"]>> = {};
    for (const sd of Object.values(S)) walls[sd.is] = k.wall(sd, plinth, eave, P.skin);
    if (P.skin === "clapboard") corners(k, S, plinth, eave);
    k.solid("mass", 0, 0, W, D, 0, eave);
    const rise = k.gable(0, 0, W, D, eave, P.pitch, false, P.cover, { over: 0.5, rake: 0.35, skin: P.skin });
    k.mass(0, 0, W, D, eave, eave + rise);
    for (const sd of [S.left, S.right]) {
      const xs = bays(2.2, sd.L - 2.2, 3.6, 2);
      for (const s of xs) k.open(walls[sd.is], sd, P.win, s, plinth + 1.0, k.r() < 0.3);
      if (P.buttress) for (let i = 0; i <= xs.length; i++) k.box(...butt(k, sd, (i * sd.L) / xs.length, eave));
    }
    if (P.skin !== "clapboard")
      for (const sd of [S.left, S.right]) k.part("cornice-box~x", sd, sd.L / 2, eave - 0.02, 0, sd.L);
    // the front: the door, a rose (or an oculus) over it
    const front = S.front;
    if (P.tower === "front") {
      // (the meetinghouse: the tower stands on the front's middle, 4.4 across, from 2.7 out to 1.2 in — the old
      // steeple's place: grounds.ts steepleOf)
      const tu0 = W / 2 - 2.2;
      const tu1 = W / 2 + 2.2;
      const tv0 = -2.7;
      const tv1 = 1.2;
      const th = 13.4;
      const ST = k.sides(tu0, tv0, tu1, tv1);
      for (const sd of Object.values(ST)) {
        const w = k.wall(sd, plinth, th - 3.1, P.skin);
        if (sd.is === "front") {
          k.open(w, sd, P.door, sd.L / 2, plinth);
          k.part("win-oculus", sd, sd.L / 2, 6.6, 0);
          k.part("clock", sd, sd.L / 2, th - 4.6, 0.02);
        } else if (sd.is === "back")
          // (its ground storey a porch through to the nave — plan 111: the church walked into)
          w.holes.push({ s0: sd.L / 2 - 0.9, s1: sd.L / 2 + 0.9, y0: plinth, y1: plinth + 2.6 });
        else k.open(w, sd, "win-arch", sd.L / 2, 6.0);
      }
      // (the nave's front open behind it, as wide)
      walls.front.holes.push({ s0: W / 2 - 0.9, s1: W / 2 + 0.9, y0: plinth, y1: plinth + 2.6 });
      // the porch inside it: its walls and ceiling facing in, its floor at the sill (seen from in it: the tower
      // stands out of the plot, past the cut that takes the outside away)
      {
        const e = 0.25;
        const [a0, a1, b0, b1] = [tu0 + e, tu1 - e, tv0 + e, tv1 - e];
        const yb = plinth;
        const yt = plinth + 3.0;
        const inner = "#d8d0c0";
        k.poly(
          [
            [a0, yb, b0],
            [a0, yt, b0],
            [a0, yt, b1],
            [a0, yb, b1],
          ],
          [1, 0, 0],
          "paint",
          inner,
        );
        k.poly(
          [
            [a1, yb, b0],
            [a1, yt, b0],
            [a1, yt, b1],
            [a1, yb, b1],
          ],
          [-1, 0, 0],
          "paint",
          inner,
        );
        for (const [v, n] of [
          [b0, 1],
          [b1, -1],
        ] as const) {
          k.poly(
            [
              [a0, yb, v],
              [W / 2 - 0.9, yb, v],
              [W / 2 - 0.9, yt, v],
              [a0, yt, v],
            ],
            [0, 0, n],
            "paint",
            inner,
          );
          k.poly(
            [
              [W / 2 + 0.9, yb, v],
              [a1, yb, v],
              [a1, yt, v],
              [W / 2 + 0.9, yt, v],
            ],
            [0, 0, n],
            "paint",
            inner,
          );
          k.poly(
            [
              [W / 2 - 0.9, yb + 2.6, v],
              [W / 2 + 0.9, yb + 2.6, v],
              [W / 2 + 0.9, yt, v],
              [W / 2 - 0.9, yt, v],
            ],
            [0, 0, n],
            "paint",
            inner,
          );
        }
        k.poly(
          [
            [a0, yt, b0],
            [a1, yt, b0],
            [a1, yt, b1],
            [a0, yt, b1],
          ],
          [0, -1, 0],
          "paint",
          "#e8e2d6",
        );
        k.poly(
          [
            [a0, yb + 0.01, b0],
            [a1, yb + 0.01, b0],
            [a1, yb + 0.01, b1],
            [a0, yb + 0.01, b1],
          ],
          [0, 1, 0],
          "paint",
          "#8a6a4a",
        );
      }
      corners(k, ST, plinth, th - 3.1, true, false);
      k.box(tu0 - 0.1, th - 3.1, tv0 - 0.1, tu1 + 0.1, th - 3.0, tv1 + 0.1);
      k.free("belfry", W / 2, th - 3.0, (tv0 + tv1) / 2, 0, -1, 1.69, 1);
      k.free("spire", W / 2, th + 0.3, (tv0 + tv1) / 2, 0, -1);
      // (solid but its porch: its sides, its front and back either side of the way through, and over its head)
      const t = 0.3;
      const dw = 0.9;
      k.solid("building", tu0, tv0, tu0 + t, tv1, 0, th);
      k.solid("building", tu1 - t, tv0, tu1, tv1, 0, th);
      for (const [v0, v1] of [
        [tv0, tv0 + t],
        [tv1 - t, tv1],
      ]) {
        k.solid("building", tu0 + t, v0, W / 2 - dw, v1, 0, th);
        k.solid("building", W / 2 + dw, v0, tu1 - t, v1, 0, th);
      }
      k.solid("building", tu0 + t, tv0, tu1 - t, tv1, plinth + 2.9, th);
      k.solid("porch", tu0 + t, tv0, tu1 - t, Math.min(tv1, 0.05), -0.3, plinth);
      k.solidCyl("building", W / 2, (tv0 + tv1) / 2, 0.9, th, th + 8.2);
      k.L.outside.push(k.rect(tu0, tv0, tu1, 0));
      k.mass(tu0, tv0, tu1, tv1, th, th + 9.2);
      k.doorAt(ST.front, ST.front.L / 2, plinth, 1.8, 2.6);
      // its steps before the door
      k.stairs(W / 2 - 2, W / 2 + 2, tv0 - 1.2, tv0, plinth);
      // the nave's front either side of the tower
      for (const s of [tu0 / 2, (tu1 + W) / 2]) if (tu0 > 2) k.open(walls.front, front, P.win, s, plinth + 1.0);
    } else {
      k.open(walls.front, front, P.door, W / 2, plinth);
      k.doorAt(front, W / 2, plinth, 1.8, 2.6);
      k.part(P.rose ? "win-oculus" : "win-oculus", front, W / 2, eave - 0.3, 0, P.rose ? 1.8 : 1.2, P.rose ? 1.8 : 1.2);
      k.stairs(W / 2 - 2, W / 2 + 2, -1.2, 0, plinth);
      // the tower at the front's left corner, inside the plot
      const tw = Math.min(4.2, W * 0.28);
      const th = P.tower === "corner-belfry" ? 14 : 15;
      const ST = k.sides(0, 0, tw, tw);
      for (const sd of Object.values(ST)) {
        const w = k.wall(sd, eave - 0.3, th, P.skin);
        if (sd.is === "front" || sd.is === "left")
          k.open(w, sd, P.tower === "corner-belfry" ? "win-arch-brick" : "win-pointed", sd.L / 2, th - 3.6);
      }
      k.solid("building", 0, 0, tw, tw, 0, th);
      if (P.tower === "corner-belfry") {
        const r = k.hip(0, 0, tw, tw, th, 40, P.cover, 0.3);
        k.mass(0, 0, tw, tw, th, th + r);
      } else {
        // crenellations, a spire inside them
        for (const sd of Object.values(ST))
          for (const s of bays(0.2, sd.L - 0.2, 0.7, 3)) {
            const [u, v] = k.at(sd, s, -0.2);
            k.box(u - 0.2, th, v - 0.2, u + 0.2, th + 0.6, v + 0.2, `skin:${P.skin}`, k.c.walls);
          }
        k.free("spire", tw / 2, th, tw / 2, 0, -1, (tw - 0.6) / 2, 0.9);
        k.solidCyl("building", tw / 2, tw / 2, tw / 2 - 0.4, th, th + 7);
        k.mass(0, 0, tw, tw, th, th + 8);
      }
    }
    if (o.sign)
      k.sign(
        front,
        o.sign,
        W / 2 + (P.tower === "front" ? 0 : 0),
        plinth + 3.4 + (P.tower === "front" ? 0 : 0.6),
        Math.min(W - 2, o.sign.length * 0.36 + 0.6),
        0.4,
        "#efeadd",
        "#2a2420",
        P.tower === "front" ? 2.78 : 0.05,
        false,
      );
    k.free("cross", W / 2, eave + rise + 0.05, 0.2, 0, -1);
    downpipes(k, S, eave);
    k.L.eave = eave;
  };
}
function butt(
  k: K,
  sd: Side,
  s: number,
  eave: number,
): [number, number, number, number, number, number, `skin:${Skin}`, string] {
  const [u, v] = k.at(sd, s, 0);
  const [u2, v2] = k.at(sd, s, 0.7);
  return [
    Math.min(u, u2) - 0.25,
    0,
    Math.min(v, v2) - 0.25,
    Math.max(u, u2) + 0.25,
    eave * 0.7,
    Math.max(v, v2) + 0.25,
    "skin:stone",
    k.c.walls,
  ];
}

// ── the gas station: its kiosk at the back, its canopy over two islands (grounds.ts forecourtOf: the same) ─────
function gas(style: "classic" | "modern" | "service") {
  return (k: K, o: Opts) => {
    const { W, D } = k;
    // (the kiosk 10 × 6 at the back's left — W−12…W−2 along, D−6…D back: as the old one, on any side)
    const ku0 = W - 12;
    const ku1 = W - 2;
    const kv0 = D - 6;
    const kv1 = D;
    const kh = style === "modern" ? 4.2 : 3.6;
    const S = k.sides(ku0, kv0, ku1, kv1);
    const skin: Skin = style === "modern" ? "panel" : style === "service" ? "brick" : "stucco";
    const walls: Record<string, ReturnType<K["wall"]>> = {};
    for (const sd of Object.values(S)) walls[sd.is] = k.wall(sd, 0.1, kh + 0.6, skin);
    k.box(ku0 - 0.05, -0.4, kv0 - 0.05, ku1 + 0.05, 0.1, kv1 + 0.05, "paint", "#b8b4aa");
    k.solid("building", ku0, kv0, ku1, kv1, 0, kh);
    k.flat(ku0, kv0, ku1, kv1, kh, 0.6, skin, style === "modern" ? "metal" : "stone");
    k.mass(ku0, kv0, ku1, kv1, kh, kh + 0.6);
    const front = S.front;
    if (style === "service") {
      k.open(walls.front, front, "door-garage", 2.6, 0.1);
      k.open(walls.front, front, "door-garage", 5.6, 0.1);
      k.open(walls.front, front, "door-shop", 8.4, 0.1);
      k.doorAt(front, 8.4, 0.1, 0.95, 2.6);
      k.sign(front, (o.sign || "SERVICE").toUpperCase(), 5, kh - 0.75, 6, 0.55, "#efeadd", "#9e1512", 0.06, true);
    } else {
      walls.front.holes.push({ s0: 0.6, s1: 9.4, y0: 0.1, y1: 2.9 });
      k.part("shop-bulkhead~x", front, 5, 0.1, 0, 8.8, 0.6);
      k.part("shop-plate~x", front, 5, -0.2, 0, 8.8, 0.98, true);
      for (const s of [2.4, 4.2, 5.8, 7.6]) k.part("shop-mullion", front, s, -0.2, 0, 1, 0.85);
      k.open(walls.front, front, "door-shop", 5, 0.1);
      k.doorAt(front, 5, 0.1, 0.95, 2.6);
      k.sign(
        front,
        (o.sign || (style === "modern" ? "MARKET" : "GAS")).toUpperCase(),
        5,
        kh - 0.55,
        5,
        0.6,
        style === "modern" ? "#2a2e30" : "#9e1512",
        "#f1eee6",
        0.08,
        true,
      );
    }
    k.open(walls.back, S.back, "door-service", 3, 0.1);
    // the canopy over the islands (its posts and islands where the old one had them)
    const isl = [7, W - 7];
    const posts = [3, W - 3];
    for (const u of isl) {
      k.free("island~x", u, 0, 5, 1, 0, 3.6, 1);
      for (const v of [4.5, 5.5]) k.free(style === "classic" ? "pump-classic" : "pump", u, 0.18, v, 1, 0);
      k.solid("forecourt", u - 0.6, 3.2, u + 0.6, 6.8, 0, 0.3);
      for (const v of [4.5, 5.5]) k.solid("forecourt", u - 0.37, v - 0.32, u + 0.37, v + 0.32, 0, 1.92);
    }
    const ch = style === "classic" ? 4.6 : 5.0;
    for (const u of posts)
      for (const v of [2, 8]) {
        k.free("canopy-post", u, 0, v, 0, -1, 1, ch / 5);
        k.solid("forecourt", u - 0.25, v - 0.25, u + 0.25, v + 0.25, 0, ch);
      }
    const cu0 = 1;
    const cu1 = W - 1;
    const cv0 = 0;
    const cv1 = 10;
    const fd = style === "modern" ? 1.1 : 0.8;
    const canopyCol = style === "modern" ? "#e6e4de" : k.c.trim;
    k.box(cu0, ch, cv0, cu1, ch + fd, cv1, "paint", canopyCol);
    k.box(
      cu0 - 0.02,
      ch + fd * 0.55,
      cv0 - 0.02,
      cu1 + 0.02,
      ch + fd * 0.85,
      cv1 + 0.02,
      "paint",
      style === "modern" ? "#2a5a8a" : "#9e1512",
    );
    for (const u of [cu0 + 2, (cu0 + cu1) / 2, cu1 - 2])
      for (const v of [3, 7]) k.box(u - 0.5, ch - 0.02, v - 0.3, u + 0.5, ch, v + 0.3, "glow", "#fff6e0");
    for (const u of [cu0 + 3, cu1 - 3]) k.lamp(u, ch - 0.3, 5);
    k.L.snow.push({ t: "flat", ...k.rect(cu0, cv0, cu1, cv1), y: ch + fd, deep: 0.27 });
    k.solid("roof", cu0, cv0, cu1, cv1, ch, ch + fd + 0.25);
    k.mass(cu0, cv0, cu1, cv1, ch, ch + fd);
    // the price sign at the corner, the air pump
    k.free("air-pump", 1.6, 0, D - 2, 1, 0);
    k.box(0.6, 0, 9.6, 0.8, 5.5, 9.8, "paint", "#8a8f92");
    k.box(0.1, 4.0, 9.4, 1.3, 6.0, 10.0, "paint", style === "modern" ? "#2a5a8a" : "#9e1512");
    k.L.signs.push({
      text: "GAS 1.19",
      ...xyz(k, 0.7, 4.25, 9.35),
      ry: k.ryOf(k.sides(0, 0, W, D).front),
      w: 1.1,
      h: 1.4,
      bg: "#f1eee6",
      fg: "#1d1f22",
      lit: true,
    });
    k.solid("street", 0.6, 9.6, 0.8, 9.8, 0, 6);
    k.L.built = k.rect(ku0, kv0, ku1, kv1);
    k.L.open = true;
    k.L.forecourt = {
      islands: isl.map((u) => {
        const [x, z] = k.P(u, 5);
        return { x, z, hx: k.uAlongX ? 0.62 : 1.82, hz: k.uAlongX ? 1.82 : 0.62 };
      }),
      posts: posts.flatMap((u) =>
        [2, 8].map((v) => {
          const [x, z] = k.P(u, v);
          return { x, z };
        }),
      ),
    };
    k.L.eave = kh;
  };
}
function xyz(k: K, u: number, y: number, v: number) {
  const [x, z] = k.P(u, v);
  return { x, y, z };
}

// ── the silo ───────────────────────────────────────────────────────────────────────────────────────────────
function silo(style: "stave" | "steel" | "brick") {
  return (k: K, o: Opts) => {
    const { W, D } = k;
    const R = Math.min(W, D) / 2 - 0.2;
    const H = 4 + o.floors * 2.4 + R * 0.5;
    const cu = W / 2;
    const cv = D / 2;
    const n = 20;
    const skin: Skin = style === "steel" ? "metal" : style === "brick" ? "brick" : "concrete";
    for (let i = 0; i < n; i++) {
      const a0 = (2 * Math.PI * i) / n;
      const a1 = (2 * Math.PI * (i + 1)) / n;
      const p0: V3 = [cu + Math.cos(a0) * R, 0, cv + Math.sin(a0) * R];
      const p1: V3 = [cu + Math.cos(a1) * R, 0, cv + Math.sin(a1) * R];
      const am = (a0 + a1) / 2;
      k.poly(
        [
          [p0[0], -0.3, p0[2]],
          [p1[0], -0.3, p1[2]],
          [p1[0], H, p1[2]],
          [p0[0], H, p0[2]],
        ],
        [Math.cos(am), 0, Math.sin(am)],
        `skin:${skin}`,
        k.c.walls,
      );
      // its cap: a dome (stave, brick) or a cone (steel)
      const steps = style === "steel" ? 1 : 4;
      for (let j = 0; j < steps; j++) {
        const t0 = j / steps;
        const t1 = (j + 1) / steps;
        const rad = (t: number) =>
          style === "steel" ? R * (1 - t) + 0.25 * t : R * Math.cos((t * Math.PI) / 2) + 0.2 * t;
        const hy = (t: number) => H + (style === "steel" ? t * R * 0.55 : Math.sin((t * Math.PI) / 2) * R * 0.6);
        k.poly(
          [
            [cu + Math.cos(a0) * rad(t0), hy(t0), cv + Math.sin(a0) * rad(t0)],
            [cu + Math.cos(a1) * rad(t0), hy(t0), cv + Math.sin(a1) * rad(t0)],
            [cu + Math.cos(a1) * rad(t1), hy(t1), cv + Math.sin(a1) * rad(t1)],
            [cu + Math.cos(a0) * rad(t1), hy(t1), cv + Math.sin(a0) * rad(t1)],
          ],
          [Math.cos(am), 1, Math.sin(am)],
          style === "brick" ? "roof:copper" : "roof:tin",
          style === "brick" ? "#5c9480" : k.c.roof,
        );
      }
    }
    // bands, its ladder and cage, the chute
    for (let y = 1.2; y < H; y += style === "steel" ? 0.9 : 1.6)
      k.box(cu - R - 0.03, y, cv - 0.04, cu - R + 0.0, y + 0.06, cv + 0.04, "paint", "#3a3e42");
    const lu = cu;
    const lv = cv - R - 0.25;
    for (const s of [-0.22, 0.22]) k.box(lu + s - 0.03, 0, lv - 0.03, lu + s + 0.03, H, lv + 0.03, "paint", "#3a3e42");
    for (let y = 0.3; y < H; y += 0.35)
      k.box(lu - 0.22, y, lv - 0.02, lu + 0.22, y + 0.03, lv + 0.02, "paint", "#3a3e42");
    for (let y = 2.5; y < H; y += 0.8) k.box(lu - 0.4, y, lv - 0.45, lu + 0.4, y + 0.04, lv - 0.41, "paint", "#3a3e42");
    k.box(lu - 0.6, H - 0.2, lv - 1.2, lu + 0.6, H, lv, "paint", "#5d6163");
    k.solidCyl("building", cu, cv, R + 0.45, 0, H + R * 0.5);
    k.mass(cu - R, cv - R, cu + R, cv + R, H, H + R * 0.6);
    k.doorAt(k.sides(0, 0, W, D).front, W / 2, 0, 1, 2);
    k.L.eave = H;
  };
}

// ── the parking garage: open decks on columns, a ramp up each storey, the stair and lift core ──────────────────
function garage(style: "concrete" | "brick" | "mesh") {
  return (k: K, o: Opts) => {
    const { W, D } = k;
    const n = Math.max(2, o.floors);
    const fh = 3.0;
    const top = fh * (n - 1);
    const S = k.sides(0, 0, W, D);
    // the decks (the ground's the land), each a slab 0.3 thick, its edges' spandrels
    const ys: number[] = [0];
    for (let f = 1; f < n; f++) {
      const y = fh * f;
      ys.push(y);
      // (its slab, less the ramp's hole on the right — drawn a little in from the sides, where the spandrels stand:
      // their faces and the slab's edges in one plane flickered, plan 111)
      const e = 0.03;
      k.box(e, y - 0.3, e, W - 7.2, y, D - e, "paint", "#a8a69e");
      k.box(W - 7.2, y - 0.3, e, W - e, y, 6.5, "paint", "#a8a69e");
      k.box(W - 7.2, y - 0.3, D - 6.5, W - e, y, D - e, "paint", "#a8a69e");
      k.solid("building", 0, 0, W - 7.2, D, y - 0.3, y);
      k.solid("building", W - 7.2, 0, W, 6.5, y - 0.3, y);
      k.solid("building", W - 7.2, D - 6.5, W, D, y - 0.3, y);
      for (const sd of Object.values(S)) {
        if (style === "mesh") k.part("screen-mesh~x", sd, sd.L / 2, y - 0.3, 0.02, sd.L, 1);
        else k.part("spandrel~x", sd, sd.L / 2, y, 0, sd.L, 1);
        const e = edge(k, sd, y);
        k.L.solids.push({ what: "building", box: e });
      }
      // the bay lines and wheel stops
      for (const v of [2.8, D - 2.8])
        for (let u = 1.6; u < W - 8.5; u += 2.6)
          k.free("wheel-stop", u, y, v + (v < D / 2 ? -1.8 : 1.8), 0, v < D / 2 ? -1 : 1);
    }
    // the top deck's walls (a parapet), the ground floor's columns
    for (let f = 0; f < n; f++)
      for (let u = 0.4; u <= W - 0.3; u += 8.1)
        for (const v of [0.4, D / 2, D - 0.4]) {
          if (u > W - 7.4 && v === D / 2) continue;
          if (f < n - 1) {
            k.free("column-conc", u, fh * f, v, 0, -1, 1, 1);
            k.solid("building", u - 0.3, v - 0.3, u + 0.3, v + 0.3, fh * f, fh * f + 2.75);
          }
        }
    // the ramps up the right: a storey each, alternately along
    const ramps: NonNullable<Layout["decks"]>["ramps"] = [];
    for (let f = 0; f < n - 1; f++) {
      const y0 = fh * f;
      const y1 = fh * (f + 1);
      const up = f % 2 === 0;
      const v0 = up ? 6.5 : D - 6.5;
      const v1 = up ? D - 6.5 : 6.5;
      const u0 = W - 6.8;
      const u1 = W - 0.4;
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const va = v0 + (v1 - v0) * t0;
        const vb = v0 + (v1 - v0) * t1;
        k.poly(
          [
            [u0, y0 + (y1 - y0) * t0, va],
            [u1, y0 + (y1 - y0) * t0, va],
            [u1, y0 + (y1 - y0) * t1, vb],
            [u0, y0 + (y1 - y0) * t1, vb],
          ],
          [0, 1, 0],
          "paint",
          "#9e9c95",
        );
        k.poly(
          [
            [u0, y0 + (y1 - y0) * t0 - 0.3, va],
            [u1, y0 + (y1 - y0) * t0 - 0.3, va],
            [u1, y0 + (y1 - y0) * t1 - 0.3, vb],
            [u0, y0 + (y1 - y0) * t1 - 0.3, vb],
          ],
          [0, -1, 0],
          "paint",
          "#8e8c85",
        );
        const lo = Math.min(va, vb);
        const hi = Math.max(va, vb);
        k.solid("building", u0, lo, u1, hi, y0 + (y1 - y0) * Math.min(t0, t1) - 0.3, y0 + (y1 - y0) * ((t0 + t1) / 2));
      }
      for (const u of [u0, u1])
        k.box(u - 0.1, y0, Math.min(v0, v1), u + 0.1, y1 + 0.9, Math.max(v0, v1), "paint", "#b8b4aa");
      const [ax, az] = k.P((u0 + u1) / 2, v0);
      const [bx, bz] = k.P((u0 + u1) / 2, v1);
      ramps.push({ ax, az, bx, bz, w: u1 - u0, y0, y1 });
    }
    // the core: a stair and lift tower at the front's left, glazed, up past the top
    const cu0 = 0;
    const cu1 = 4;
    const cv0 = D - 6.4;
    const cv1 = D;
    const CS = k.sides(cu0, cv0, cu1, cv1);
    const coreTop = top + 3.2;
    const skin: Skin = style === "brick" ? "brick" : "concrete";
    for (const sd of Object.values(CS)) {
      const w = k.wall(sd, 0, coreTop, skin);
      if (sd.is === "right") for (let f = 0; f < n; f++) k.open(w, sd, "door-service", sd.L / 2, fh * f);
    }
    k.flat(cu0, cv0, cu1, cv1, coreTop, 0.4, skin, "metal");
    k.solid("building", cu0, cv0, cu1, cv1, 0, coreTop);
    // the street face: arched screens (brick), or its sign
    if (style === "brick") {
      const f0 = S.front;
      const bw = k.wall(f0, fh - 0.3, top + 1.2, "brick");
      for (let f = 1; f < n; f++)
        for (const s of bays(1.2, f0.L - 1.2, 4.0, 2))
          bw.holes.push({ s0: s - 1.4, s1: s + 1.4, y0: fh * f + 0.3, y1: fh * f + 1.6, head: "arch" });
      k.part("coping~x", f0, f0.L / 2, top + 1.2, 0, f0.L);
    }
    k.sign(
      S.front,
      (o.sign || "PARKING").toUpperCase(),
      W / 2,
      fh * 0.65,
      Math.min(W - 4, 9),
      0.9,
      "#1f4a8a",
      "#f1eee6",
      0.12,
      true,
    );
    k.free("barrier", W - 3.6, 0, -0.6, 0, -1);
    for (let f = 0; f < n; f++) k.lamp(W / 2, fh * f + 2.6, D / 2);
    k.mass(0, 0, W, D, top, coreTop + 0.4);
    k.doorAt(S.front, W - 3.6, 0, 6, 2.2);
    k.L.open = true;
    k.L.decks = { ys, ramps };
    k.L.eave = top + 1.1;
  };
}
/** A deck's edge (its spandrel's solid): 0.2 thick inside the side, 1.1 over the deck. */
function edge(k: K, sd: Side, y: number): [number, number, number, number, number, number] {
  const [au, av] = k.at(sd, 0, 0);
  const [bu, bv] = k.at(sd, sd.L, -0.2);
  const r = k.rect(Math.min(au, bu), Math.min(av, bv), Math.max(au, bu), Math.max(av, bv));
  return [r.x0, r.z0, r.x1, r.z1, y, y + 1.1];
}

// ── the diner's railcar, the shelter, the gatehouse ────────────────────────────────────────────────────────
function railcar() {
  return (k: K, o: Opts) => {
    const { W, D } = k;
    const cw = Math.min(D - 2, 6);
    const v0 = 1;
    const v1 = v0 + cw;
    const h = 3.1;
    const S = k.sides(0, v0, W, v1);
    const walls: Record<string, ReturnType<K["wall"]>> = {};
    k.box(0.3, -0.4, v0 + 0.3, W - 0.3, 0.6, v1 - 0.3, "paint", "#5a5e60");
    for (const sd of Object.values(S)) walls[sd.is] = k.wall(sd, 0.6, h, "metal");
    k.solid("mass", 0, v0, W, v1, 0, h);
    k.barrel(0, v0, W, v1, h, 1.0, "tin", 0.25);
    k.mass(0, v0, W, v1, h, h + 1.0);
    for (const sd of [S.front, S.back]) {
      walls[sd.is].holes.push({ s0: 1.2, s1: sd.L - 1.2, y0: 1.5, y1: 2.6 });
      k.part("win-ribbon~x", sd, sd.L / 2, 1.5, 0, sd.L - 2.4, 1.1 / 1.7, true);
      for (const y of [0.95, 2.85]) k.part("water-table~x", sd, sd.L / 2, y, 0.01, sd.L, 0.5);
    }
    k.box(-0.02, 1.15, v0 - 0.04, W + 0.02, 1.35, v1 + 0.04, "paint", k.c.trim);
    // the vestibule on the front's middle
    const S2 = k.sides(W / 2 - 1.3, -0.6, W / 2 + 1.3, v0);
    for (const sd of [S2.front, S2.left, S2.right]) {
      const w = k.wall(sd, 0.1, 2.9, "metal");
      if (sd.is === "front") k.open(w, sd, "door-shop", sd.L / 2, 0.15);
    }
    k.flat(W / 2 - 1.3, -0.6, W / 2 + 1.3, v0, 2.9, 0, "metal", "none");
    k.solid("building", W / 2 - 1.3, -0.6, W / 2 + 1.3, v0, 0, 2.9);
    k.doorAt(S2.front, 1.3, 0.15, 0.95, 2.6);
    // the sign on the roof
    const t = (o.sign || "DINER").toUpperCase();
    k.box(W / 2 - 3, h + 1.0, v0 + cw / 2 - 0.1, W / 2 + 3, h + 2.2, v0 + cw / 2 + 0.1, "paint", k.c.trim);
    k.L.signs.push({
      text: t,
      ...xyz(k, W / 2, h + 1.1, v0 + cw / 2 - 0.12),
      ry: k.ryOf(S.front),
      w: 5.6,
      h: 1.0,
      bg: k.c.trim,
      fg: "#f6efd8",
      lit: true,
    });
    k.L.eave = h;
  };
}
function shelter(style: "glass" | "timber" | "brick") {
  return (k: K) => {
    const { W, D } = k;
    const h = 2.5;
    const S = k.sides(0, 0, W, D);
    // open to the street (the front), its back and sides walled (glass, boards or brick), a roof on posts
    for (const sd of [S.back, S.left, S.right]) {
      const s1 = sd.is === "back" ? sd.L : sd.is === "left" ? sd.L : sd.L - 0;
      if (style === "glass") {
        const [au, av] = k.at(sd, 0, 0);
        const [bu, bv] = k.at(sd, s1, 0);
        k.poly(
          [
            [au, 0.15, av],
            [bu, 0.15, bv],
            [bu, h - 0.1, bv],
            [au, h - 0.1, av],
          ],
          [sd.o[0], 0, sd.o[1]],
          "glass",
          "#9fb4bc",
        );
        k.box(
          Math.min(au, bu) - 0.04,
          0,
          Math.min(av, bv) - 0.04,
          Math.max(au, bu) + 0.04,
          0.15,
          Math.max(av, bv) + 0.04,
          "paint",
          "#3a3e42",
        );
      } else k.wall(sd, 0, h, style === "brick" ? "brick" : "batten");
    }
    for (const u of [0.05, W - 0.05])
      for (const v of [0.05, D - 0.05]) k.box(u - 0.05, 0, v - 0.05, u + 0.05, h, v + 0.05, "paint", "#3a3e42");
    if (style === "timber") k.gable(0, 0, W, D, h, 30, true, "shingle", { over: 0.4, rake: 0.3, skin: "batten" });
    else {
      k.box(-0.3, h, -0.3, W + 0.3, h + 0.2, D + 0.3, "paint", style === "brick" ? "#c8c0ae" : "#3a3e42");
      k.L.snow.push({ t: "flat", ...k.rect(-0.3, -0.3, W + 0.3, D + 0.3), y: h + 0.2, deep: 0.2 });
      k.solid("roof", -0.3, -0.3, W + 0.3, D + 0.3, h, h + 0.2);
    }
    k.box(0.4, 0.42, D - 0.55, W - 0.4, 0.48, D - 0.15, "paint", "#6b4d31");
    for (const u of [0.6, W - 0.6]) k.box(u - 0.04, 0, D - 0.4, u + 0.04, 0.42, D - 0.3, "paint", "#3a3e42");
    k.L.signs.push({
      text: "BUS STOP",
      ...xyz(k, W - 0.4, h - 0.55, -0.02),
      ry: k.ryOf(S.front),
      w: 1.2,
      h: 0.32,
      bg: "#1f4a8a",
      fg: "#f1eee6",
      lit: true,
    });
    k.solid("building", 0, D - 0.05, W, D + 0.05, 0, h);
    k.solid("building", -0.05, 1, 0.05, D, 0, h);
    k.solid("building", W - 0.05, 1, W + 0.05, D, 0, h);
    k.mass(0, 0, W, D, h, h + 0.2);
    k.doorAt(S.front, W / 2, 0, W, h);
    k.L.eave = h;
  };
}
function gatehouse(style: "glass" | "brick" | "timber") {
  return (k: K) => {
    const { W, D } = k;
    const h = 2.6;
    const S = k.sides(0, 0, W, D);
    const skin: Skin = style === "brick" ? "brick" : style === "timber" ? "batten" : "panel";
    const walls: Record<string, ReturnType<K["wall"]>> = {};
    for (const sd of Object.values(S)) walls[sd.is] = k.wall(sd, 0.1, h, skin);
    k.box(-0.05, -0.4, -0.05, W + 0.05, 0.1, D + 0.05, "paint", "#9e9c95");
    for (const sd of Object.values(S)) {
      if (sd.is === "front") continue;
      const a = 0.4;
      const b = sd.L - 0.4;
      walls[sd.is].holes.push({ s0: a, s1: b, y0: 1.0, y1: 2.3 });
      k.part("win-ribbon~x", sd, sd.L / 2, 1.0, 0, b - a, 1.3 / 1.7, true);
    }
    k.open(walls.front, S.front, "door-service", W / 2, 0.1);
    k.doorAt(S.front, W / 2, 0.1, 0.95, 2.2);
    k.solid("mass", 0, 0, W, D, 0, h);
    if (style === "timber") k.gable(0, 0, W, D, h, 32, false, "shingle", { over: 0.4, rake: 0.3, skin: "batten" });
    else if (style === "brick") k.hip(0, 0, W, D, h, 28, "slate", 0.45);
    else {
      k.box(-0.6, h, -0.6, W + 0.6, h + 0.35, D + 0.6, "paint", "#3a3e42");
      k.L.snow.push({ t: "flat", ...k.rect(-0.6, -0.6, W + 0.6, D + 0.6), y: h + 0.35, deep: 0.2 });
      k.solid("roof", -0.6, -0.6, W + 0.6, D + 0.6, h, h + 0.35);
    }
    k.mass(0, 0, W, D, h, h + 1.2);
    k.part("lantern", S.front, W / 2 + 0.8, 2.0, 0);
    k.free("barrier", W + 0.4, 0, -0.5, 0, -1);
    k.L.eave = h;
  };
}

// ── the kinds and their styles ─────────────────────────────────────────────────────────────────────────────
const wDH: Win = { part: "win-dh66-cased", sill: 0.8, shutters: "louvred" };
const wDH22: Win = { part: "win-dh22-cased", sill: 0.8 };
const wVic: Win = { part: "win-vic11-ped", sill: 0.6 };
const wCr: Win = { part: "win-cr31", sill: 0.85 };
const wBrick: Win = { part: "win-dh22", sill: 0.85, stone: "lintel" };
const wJack: Win = { part: "win-dh22", sill: 0.85, stone: "jack" };
const wHood: Win = { part: "win-vic11-hood", sill: 0.75 };
const wArch: Win = { part: "win-arch-brick", sill: 0.8 };
const wSteel: Win = { part: "win-steel", sill: 0.9, stone: "sill" };
const wModern: Win = { part: "win-dh22", sill: 0.85, lit: 0.45 };

function S(id: string, name: string, pt: string, pal: PaletteId, make: StyleDef["make"]): StyleDef {
  return { id, name, pt, pal, make };
}

export const KINDS: Record<KitKind, KindDef> = {
  house: {
    name: "House",
    pt: "Casa",
    group: "homes",
    min: 8,
    max: 20,
    floors: [1, 3],
    enter: true,
    sign: false,
    styles: [
      S(
        "colonial",
        "Colonial",
        "Colonial",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 2.85,
          plinth: 0.75,
          roof: "side",
          pitch: 38,
          over: 0.35,
          cover: "slate",
          win: wDH,
          bay: 2.35,
          door: "door-fan",
          chimney: "end",
          returns: true,
        }),
      ),
      S(
        "cape",
        "Cape",
        "Cape Cod",
        "shingle",
        frame({
          skin: "shingle",
          storey: 2.75,
          half: true,
          plinth: 0.6,
          roof: "side",
          pitch: 45,
          over: 0.25,
          cover: "shingle",
          win: { ...wDH, shutters: "panel" },
          bay: 2.3,
          door: "door-front",
          dormers: "gable",
          chimney: "centre",
        }),
      ),
      S(
        "victorian",
        "Victorian",
        "Vitoriana",
        "victorian",
        frame({
          skin: "clapboard",
          storey: 3.2,
          plinth: 0.9,
          roof: "side",
          pitch: 50,
          over: 0.45,
          cover: "slate",
          win: wVic,
          bay: 2.4,
          door: "door-front",
          porch: { kind: "wrap", post: "post-turned", rail: true, depth: 1.8 },
          cross: "left",
          bayWindow: true,
          chimney: "twin",
        }),
      ),
      S(
        "bungalow",
        "Bungalow",
        "Bangalô",
        "craftsman",
        frame({
          skin: "shingle",
          base: "fieldstone",
          storey: 2.85,
          half: true,
          plinth: 0.75,
          roof: "side",
          pitch: 24,
          over: 0.8,
          cover: "shingle",
          win: wCr,
          bay: 2.6,
          door: "door-front",
          porch: { kind: "full", post: "post-craftsman", rail: false, depth: 2.0 },
          dormers: "shed",
          chimney: "end",
          trio: true,
          boards: false,
        }),
      ),
    ],
  },
  townhouses: {
    name: "Townhouse row",
    pt: "Casas geminadas",
    group: "homes",
    min: 12,
    max: 60,
    floors: [2, 4],
    enter: true,
    sign: false,
    styles: [
      S(
        "brick-row",
        "Brick row",
        "Fileira de tijolos",
        "brick",
        block({
          skin: "brick",
          g: 3.1,
          u: 3.0,
          plinth: 1.1,
          ground: "entry",
          entry: "door-front",
          win: wHood,
          bay: 2.0,
          top: "bracketed",
          parapet: 0.9,
          units: true,
          plant: 0,
        }),
      ),
      S(
        "clapboard-row",
        "Clapboard row",
        "Fileira de tábuas",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 2.8,
          plinth: 0.6,
          roof: "side",
          pitch: 40,
          over: 0.3,
          cover: "slate",
          win: wDH22,
          bay: 2.0,
          door: "door-front",
          units: true,
          dormers: "gable",
          chimney: "twin",
        }),
      ),
      S(
        "modern-row",
        "Modern row",
        "Moderna",
        "modern",
        block({
          skin: "panel",
          g: 3.0,
          u: 3.0,
          plinth: 0.3,
          ground: "entry",
          entry: "door-front",
          win: { part: "win-ribbon~x", sill: 0.6 },
          bay: 2.4,
          ribbon: true,
          top: "metal",
          parapet: 0.5,
          units: true,
          plant: 0,
        }),
      ),
    ],
  },
  apartments: {
    name: "Apartments",
    pt: "Apartamentos",
    group: "homes",
    min: 14,
    max: 40,
    floors: [3, 6],
    enter: true,
    sign: true,
    styles: [
      S(
        "walk-up",
        "Walk-up",
        "Prédio de tijolos",
        "brick",
        block({
          skin: "brick",
          g: 3.4,
          u: 3.0,
          plinth: 0.9,
          ground: "entry",
          entry: "door-double",
          win: wBrick,
          bay: 2.2,
          top: "bracketed",
          parapet: 0.9,
          fireEscape: true,
          tank: true,
          lamps: "lantern",
          belt: true,
        }),
      ),
      S(
        "garden",
        "Garden",
        "Jardim",
        "clapboard",
        frame({
          skin: "clapboard",
          base: "brick",
          storey: 2.9,
          plinth: 0.45,
          roof: "hip",
          pitch: 26,
          over: 0.5,
          cover: "shingle",
          win: wDH22,
          bay: 2.6,
          door: "door-double",
          porch: { kind: "centre", post: "column-tuscan", rail: false, depth: 1.8 },
          chimney: "none",
        }),
      ),
      S(
        "modern",
        "Modern",
        "Moderno",
        "modern",
        block({
          skin: "stucco",
          base: "panel",
          g: 3.6,
          u: 3.0,
          plinth: 0.15,
          ground: "lobby",
          win: { part: "win-dh22", sill: 0.5, lit: 0.5 },
          bay: 2.6,
          top: "metal",
          parapet: 0.6,
          balconies: true,
          canopy: true,
          plant: 2,
        }),
      ),
    ],
  },
  shop: {
    name: "Shop",
    pt: "Loja",
    group: "shops",
    min: 8,
    max: 24,
    floors: [1, 3],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick",
        "Brick commercial",
        "Comercial de tijolos",
        "brick",
        block({
          skin: "brick",
          g: 4.4,
          u: 3.5,
          plinth: 0,
          ground: "shop",
          win: wHood,
          bay: 2.6,
          top: "bracketed",
          parapet: 0.9,
          awning: "striped",
          blade: true,
        }),
      ),
      S(
        "false-front",
        "False front",
        "Fachada falsa",
        "clapboard",
        block({
          skin: "clapboard",
          g: 4.2,
          u: 3.2,
          plinth: 0,
          ground: "shop",
          win: wDH22,
          bay: 2.6,
          top: "falsefront",
          parapet: 0.3,
          awning: "plain",
        }),
      ),
      S(
        "deco",
        "Art deco",
        "Art déco",
        "stucco",
        block({
          skin: "stucco",
          base: "stone",
          g: 4.6,
          u: 3.6,
          plinth: 0,
          ground: "shop",
          win: { part: "win-dh22", sill: 0.8, stone: "sill" },
          bay: 2.4,
          top: "stepped",
          parapet: 0.8,
          lamps: "lantern",
        }),
      ),
      S(
        "civic",
        "Civic",
        "Cívico",
        "stone",
        block({
          skin: "brick",
          g: 4.6,
          u: 4.0,
          plinth: 0.9,
          ground: "civic",
          win: { part: "win-arch-brick", sill: 0.9 },
          bay: 2.8,
          top: "dentil",
          parapet: 0.6,
          flag: true,
          clock: true,
          quoins: true,
        }),
      ),
    ],
  },
  cornershop: {
    name: "Corner shop",
    pt: "Loja de esquina",
    group: "shops",
    min: 10,
    max: 24,
    floors: [1, 3],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-corner",
        "Brick corner",
        "Esquina de tijolos",
        "brick",
        block({
          skin: "brick",
          g: 4.2,
          u: 3.2,
          plinth: 0,
          ground: "corner",
          win: wJack,
          bay: 2.4,
          top: "corbel",
          parapet: 0.8,
          awning: "plain",
          blade: true,
          fireEscape: true,
        }),
      ),
      S(
        "country-store",
        "Country store",
        "Armazém",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 3.4,
          plinth: 0.45,
          roof: "side",
          pitch: 36,
          over: 0.4,
          cover: "tin",
          win: wDH22,
          bay: 2.4,
          door: "door-shop",
          store: true,
          porch: { kind: "full", post: "post-turned", rail: false, depth: 2.4 },
          chimney: "end",
        }),
      ),
      S(
        "modern-corner",
        "Modern",
        "Moderna",
        "modern",
        block({
          skin: "panel",
          base: "stucco",
          g: 4.0,
          u: 3.2,
          plinth: 0,
          ground: "corner",
          win: { part: "win-dh22", sill: 0.7, lit: 0.5 },
          bay: 2.6,
          top: "metal",
          parapet: 0.5,
          awning: "plain",
        }),
      ),
    ],
  },
  bar: {
    name: "Bar",
    pt: "Bar",
    group: "shops",
    min: 10,
    max: 24,
    floors: [1, 2],
    enter: true,
    sign: true,
    styles: [
      S(
        "tavern",
        "Tavern",
        "Taverna",
        "brick",
        block({
          skin: "brick",
          g: 4.2,
          u: 3.4,
          plinth: 0,
          ground: "shop",
          win: wJack,
          bay: 2.6,
          top: "corbel",
          parapet: 0.8,
          neon: true,
          blade: true,
          lamps: "goose",
        }),
      ),
      S(
        "roadhouse",
        "Roadhouse",
        "Beira de estrada",
        "clapboard",
        frame({
          skin: "batten",
          storey: 3.6,
          plinth: 0.45,
          roof: "front",
          pitch: 30,
          over: 0.5,
          cover: "tin",
          win: wDH22,
          bay: 2.8,
          door: "door-shop",
          store: true,
          porch: { kind: "full", post: "post-craftsman", rail: true, depth: 2.4 },
          chimney: "none",
        }),
      ),
      S(
        "pub",
        "Pub",
        "Pub",
        "brick",
        block({
          skin: "stucco",
          g: 4.0,
          u: 3.2,
          plinth: 0,
          ground: "pub",
          win: { part: "win-dh66", sill: 0.85 },
          bay: 2.4,
          top: "coping",
          parapet: 0.7,
          lamps: "lantern",
          blade: true,
        }),
      ),
    ],
  },
  diner: {
    name: "Diner",
    pt: "Lanchonete",
    group: "shops",
    min: 10,
    max: 24,
    floors: [1, 1],
    enter: true,
    sign: true,
    styles: [
      S(
        "streamline",
        "Streamline",
        "Aerodinâmica",
        "diner",
        block({
          skin: "metal",
          g: 3.8,
          u: 3.2,
          plinth: 0.15,
          ground: "lobby",
          entry: "door-shop",
          win: { part: "win-ribbon~x", sill: 0.9 },
          bay: 2.4,
          ribbon: true,
          top: "metal",
          parapet: 0.5,
          canopy: true,
        }),
      ),
      S("railcar", "Railcar", "Vagão", "diner", railcar()),
      S(
        "modern",
        "Modern",
        "Moderna",
        "modern",
        block({
          skin: "panel",
          g: 4.0,
          u: 3.2,
          plinth: 0.1,
          ground: "lobby",
          win: { part: "win-ribbon~x", sill: 0.6 },
          bay: 2.4,
          ribbon: true,
          top: "metal",
          parapet: 0.6,
          canopy: true,
        }),
      ),
    ],
  },
  hotel: {
    name: "Hotel",
    pt: "Hotel",
    group: "shops",
    min: 14,
    max: 30,
    floors: [2, 5],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-hotel",
        "Brick hotel",
        "Hotel de tijolos",
        "brick",
        block({
          skin: "brick",
          g: 4.4,
          u: 3.3,
          plinth: 0.3,
          ground: "entry",
          entry: "door-double",
          win: wBrick,
          bay: 2.4,
          top: "bracketed",
          parapet: 1.0,
          marquee: true,
          blade: true,
          belt: true,
          tank: true,
        }),
      ),
      S(
        "inn",
        "Inn",
        "Pousada",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 3.0,
          plinth: 0.6,
          roof: "side",
          pitch: 38,
          over: 0.35,
          cover: "slate",
          win: wDH,
          bay: 2.4,
          door: "door-front",
          porch: { kind: "full", post: "column-tuscan", rail: true, depth: 2.4, up: true },
          dormers: "gable",
          chimney: "twin",
        }),
      ),
      S(
        "deco-hotel",
        "Art deco",
        "Art déco",
        "stucco",
        block({
          skin: "stucco",
          base: "stone",
          g: 4.6,
          u: 3.3,
          plinth: 0.15,
          ground: "entry",
          entry: "door-slider",
          win: { part: "win-dh22", sill: 0.8, stone: "sill" },
          bay: 2.2,
          top: "stepped",
          parapet: 0.8,
          canopy: true,
          vsign: true,
        }),
      ),
    ],
  },
  office: {
    name: "Office",
    pt: "Escritórios",
    group: "work",
    min: 14,
    max: 40,
    floors: [2, 8],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-office",
        "Brick",
        "Tijolos",
        "brick",
        block({
          skin: "brick",
          base: "stone",
          g: 4.4,
          u: 3.8,
          plinth: 0.6,
          ground: "entry",
          entry: "door-double",
          win: { ...wBrick, part: "win-vic11-hood" },
          bay: 2.2,
          top: "bracketed",
          parapet: 1.0,
          belt: true,
          lamps: "lantern",
          plant: 2,
        }),
      ),
      S(
        "glass-office",
        "Glass",
        "Vidro",
        "modern",
        block({
          skin: "panel",
          g: 3.8,
          u: 3.8,
          plinth: 0.1,
          ground: "lobby",
          win: wModern,
          bay: 1.5,
          curtain: true,
          top: "metal",
          parapet: 0.6,
          plant: 3,
          canopy: true,
        }),
      ),
      S(
        "concrete-office",
        "Concrete",
        "Concreto",
        "concrete",
        block({
          skin: "concrete",
          base: "panel",
          g: 4.2,
          u: 3.7,
          plinth: 0.1,
          ground: "lobby",
          win: wModern,
          bay: 1.5,
          ribbon: true,
          top: "metal",
          parapet: 0.8,
          plant: 3,
        }),
      ),
    ],
  },
  church: {
    name: "Church",
    pt: "Igreja",
    group: "civic",
    min: 14,
    max: 30,
    floors: [1, 1],
    enter: true,
    sign: false,
    styles: [
      S(
        "meetinghouse",
        "Meetinghouse",
        "Capela branca",
        "clapboard",
        church({ skin: "clapboard", win: "win-arch", door: "door-double", pitch: 45, tower: "front", cover: "slate" }),
      ),
      S(
        "gothic",
        "Gothic",
        "Gótica",
        "stone",
        church({
          skin: "stone",
          win: "win-pointed",
          door: "door-pointed",
          pitch: 52,
          tower: "corner-spire",
          cover: "slate",
          buttress: true,
          rose: true,
        }),
      ),
      S(
        "romanesque",
        "Brick romanesque",
        "Românica de tijolos",
        "brick",
        church({
          skin: "brick",
          win: "win-arch-brick",
          door: "door-double",
          pitch: 40,
          tower: "corner-belfry",
          cover: "slate",
          rose: true,
        }),
      ),
    ],
  },
  school: {
    name: "School",
    pt: "Escola",
    group: "civic",
    min: 16,
    max: 48,
    floors: [1, 3],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-school",
        "Brick",
        "Tijolos",
        "brick",
        block({
          skin: "brick",
          g: 4.0,
          u: 4.0,
          plinth: 0.6,
          ground: "entry",
          entry: "door-double",
          win: wSteel,
          gwin: wSteel,
          bay: 2.3,
          top: "corbel",
          parapet: 1.0,
          flag: true,
          cupola: true,
          belt: true,
        }),
      ),
      S(
        "modern-school",
        "Modern",
        "Moderna",
        "modern",
        block({
          skin: "brick",
          g: 4.0,
          u: 3.8,
          plinth: 0.1,
          ground: "lobby",
          win: wModern,
          bay: 2.4,
          ribbon: true,
          top: "metal",
          parapet: 0.5,
          canopy: true,
          flag: true,
        }),
      ),
      S(
        "schoolhouse",
        "Schoolhouse",
        "Escola rural",
        "barn",
        frame({
          skin: "clapboard",
          storey: 3.6,
          plinth: 0.5,
          roof: "front",
          pitch: 40,
          over: 0.35,
          cover: "shingle",
          win: { part: "win-dh66-cased", sill: 0.9 },
          bay: 2.2,
          door: "door-front",
          belfry: true,
          chimney: "none",
          porch: { kind: "stoop", post: "column-tuscan", rail: false, depth: 1.4 },
        }),
      ),
    ],
  },
  police: {
    name: "Police station",
    pt: "Delegacia",
    group: "civic",
    min: 12,
    max: 32,
    floors: [1, 2],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-civic",
        "Brick civic",
        "Cívica de tijolos",
        "brick",
        block({
          skin: "brick",
          base: "stone",
          g: 4.2,
          u: 3.6,
          plinth: 0.6,
          ground: "entry",
          entry: "door-double",
          win: wBrick,
          bay: 2.4,
          top: "dentil",
          parapet: 0.7,
          lamps: "police",
          flag: true,
          quoins: true,
        }),
      ),
      S(
        "modern-police",
        "Modern",
        "Moderna",
        "concrete",
        block({
          skin: "concrete",
          base: "panel",
          g: 4.0,
          u: 3.6,
          plinth: 0.1,
          ground: "lobby",
          win: wModern,
          bay: 2.4,
          ribbon: true,
          top: "metal",
          parapet: 0.6,
          canopy: true,
          lamps: "police",
          flag: true,
        }),
      ),
      S(
        "small-town",
        "Small-town",
        "Interior",
        "brick",
        block({
          skin: "brick",
          g: 3.8,
          u: 3.4,
          plinth: 0.3,
          ground: "entry",
          entry: "door-front",
          win: wJack,
          bay: 2.4,
          top: "coping",
          parapet: 0.6,
          lamps: "police",
          flag: true,
        }),
      ),
    ],
  },
  fire: {
    name: "Fire station",
    pt: "Bombeiros",
    group: "civic",
    min: 14,
    max: 36,
    floors: [1, 2],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-classic",
        "Brick classic",
        "Clássica de tijolos",
        "brick",
        block({
          skin: "brick",
          g: 5.0,
          u: 3.4,
          plinth: 0,
          ground: "bays",
          win: wArch,
          bay: 2.3,
          top: "corbel",
          parapet: 1.0,
          tower: true,
          flag: true,
        }),
      ),
      S(
        "modern-fire",
        "Modern",
        "Moderna",
        "metal",
        block({
          skin: "panel",
          g: 5.0,
          u: 3.4,
          plinth: 0,
          ground: "bays",
          win: wModern,
          bay: 2.4,
          ribbon: true,
          top: "metal",
          parapet: 0.5,
        }),
      ),
      S(
        "volunteer",
        "Volunteer",
        "Voluntários",
        "metal",
        block({
          skin: "metal",
          base: "concrete",
          g: 5.0,
          u: 3.2,
          plinth: 0,
          ground: "bays",
          win: { part: "win-dh22", sill: 0.9 },
          bay: 2.6,
          top: "metal",
          parapet: 0.4,
        }),
      ),
    ],
  },
  clinic: {
    name: "Clinic",
    pt: "Clínica",
    group: "civic",
    min: 10,
    max: 30,
    floors: [1, 2],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-clinic",
        "Brick",
        "Tijolos",
        "brick",
        block({
          skin: "brick",
          g: 3.6,
          u: 3.3,
          plinth: 0.3,
          ground: "entry",
          entry: "door-slider",
          win: wBrick,
          bay: 2.3,
          top: "coping",
          parapet: 0.7,
          canopy: true,
        }),
      ),
      S(
        "modern-clinic",
        "Modern",
        "Moderna",
        "modern",
        block({
          skin: "stucco",
          base: "panel",
          g: 3.8,
          u: 3.4,
          plinth: 0.1,
          ground: "lobby",
          win: wModern,
          bay: 2.4,
          ribbon: true,
          top: "metal",
          parapet: 0.5,
          canopy: true,
        }),
      ),
      S(
        "house-clinic",
        "Converted house",
        "Casa adaptada",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 2.85,
          plinth: 0.45,
          roof: "side",
          pitch: 38,
          over: 0.35,
          cover: "slate",
          win: { ...wDH, shutters: "panel" },
          bay: 2.4,
          door: "door-front",
          porch: { kind: "centre", post: "column-tuscan", rail: false, depth: 1.8 },
          chimney: "end",
        }),
      ),
    ],
  },
  library: {
    name: "Library",
    pt: "Biblioteca",
    group: "civic",
    min: 12,
    max: 36,
    floors: [1, 2],
    enter: true,
    sign: true,
    styles: [
      S(
        "carnegie",
        "Carnegie",
        "Carnegie",
        "brick",
        block({
          skin: "brick",
          base: "stone",
          g: 4.6,
          u: 3.8,
          plinth: 1.2,
          ground: "civic",
          win: wArch,
          bay: 2.6,
          roof: "hip",
          cover: "slate",
          top: "dentil",
          parapet: 0,
        }),
      ),
      S(
        "modern-library",
        "Modern",
        "Moderna",
        "modern",
        block({
          skin: "concrete",
          base: "panel",
          g: 4.4,
          u: 3.6,
          plinth: 0.1,
          ground: "lobby",
          win: wModern,
          bay: 1.5,
          curtain: true,
          top: "metal",
          parapet: 0.9,
          canopy: true,
        }),
      ),
      S(
        "clapboard-library",
        "Clapboard",
        "Tábuas",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 3.4,
          plinth: 0.6,
          roof: "front",
          pitch: 42,
          over: 0.4,
          cover: "slate",
          win: { part: "win-arch", sill: 0.8 },
          bay: 2.4,
          door: "door-double",
          porch: { kind: "centre", post: "column-tuscan", rail: false, depth: 1.8 },
          chimney: "none",
        }),
      ),
    ],
  },
  garage: {
    name: "Parking garage",
    pt: "Estacionamento",
    group: "work",
    min: 30,
    max: 60,
    floors: [2, 5],
    enter: false,
    sign: true,
    styles: [
      S("concrete-garage", "Concrete", "Concreto", "concrete", garage("concrete")),
      S("brick-garage", "Brick-clad", "Revestido de tijolos", "brick", garage("brick")),
      S("mesh-garage", "Metal mesh", "Tela metálica", "metal", garage("mesh")),
    ],
  },
  gas: {
    name: "Gas station",
    pt: "Posto de gasolina",
    group: "shops",
    min: 14,
    max: 28,
    floors: [1, 1],
    enter: false,
    sign: true,
    styles: [
      S("classic-gas", "Classic", "Clássico", "diner", gas("classic")),
      S("modern-gas", "Modern", "Moderno", "modern", gas("modern")),
      S("service", "Service garage", "Oficina", "brick", gas("service")),
    ],
  },
  warehouse: {
    name: "Warehouse",
    pt: "Armazém",
    group: "work",
    min: 16,
    max: 48,
    floors: [1, 2],
    enter: true,
    sign: true,
    styles: [
      S(
        "brick-warehouse",
        "Brick",
        "Tijolos",
        "brick",
        frame({
          skin: "brick",
          storey: 4.5,
          plinth: 0.3,
          roof: "side",
          pitch: 12,
          over: 0.4,
          cover: "metal",
          win: { part: "win-steel", sill: 1.4, stone: "sill" },
          bay: 4.2,
          door: "door-rollup",
          bigDoor: "door-rollup",
          chimney: "none",
          boards: false,
        }),
      ),
      S(
        "steel-warehouse",
        "Steel",
        "Aço",
        "metal",
        frame({
          skin: "metal",
          storey: 5.0,
          plinth: 0.15,
          roof: "side",
          pitch: 10,
          over: 0.4,
          cover: "metal",
          win: { part: "win-ribbon~x", sill: 3.0 },
          bay: 6,
          door: "door-rollup",
          bigDoor: "door-rollup",
          chimney: "none",
          boards: false,
        }),
      ),
      S(
        "mill",
        "Mill",
        "Moinho",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 3.6,
          plinth: 0.45,
          roof: "side",
          pitch: 26,
          over: 0.35,
          cover: "slate",
          win: { part: "win-dh66-cased", sill: 0.9 },
          bay: 2.2,
          door: "door-double",
          bigDoor: "door-barn",
          chimney: "end",
          cupola: true,
        }),
      ),
    ],
  },
  shed: {
    name: "Shed",
    pt: "Galpão",
    group: "farm",
    min: 6,
    max: 16,
    floors: [1, 1],
    enter: true,
    sign: false,
    styles: [
      S(
        "metal-shed",
        "Metal",
        "Metal",
        "metal",
        frame({
          skin: "metal",
          storey: 3.6,
          plinth: 0.1,
          roof: "side",
          pitch: 10,
          over: 0.35,
          cover: "metal",
          win: { part: "win-sq", sill: 1.6 },
          bay: 4,
          door: "door-rollup",
          bigDoor: "door-rollup",
          chimney: "none",
          boards: false,
        }),
      ),
      S(
        "timber-shed",
        "Timber",
        "Madeira",
        "barn",
        frame({
          skin: "batten",
          storey: 2.8,
          plinth: 0.1,
          roof: "front",
          pitch: 35,
          over: 0.35,
          cover: "shingle",
          win: { part: "win-sq-cased", sill: 1.2 },
          bay: 3,
          door: "door-garage",
          bigDoor: "door-garage",
          chimney: "none",
          boards: false,
        }),
      ),
      S(
        "block-shed",
        "Block",
        "Blocos",
        "concrete",
        block({
          skin: "concrete",
          g: 3.6,
          u: 3,
          plinth: 0.1,
          ground: "windows",
          entry: "door-rollup",
          win: { part: "win-sq", sill: 1.6 },
          bay: 3.5,
          top: "metal",
          parapet: 0.3,
          plant: 0,
        }),
      ),
    ],
  },
  boathouse: {
    name: "Boathouse",
    pt: "Casa de barcos",
    group: "farm",
    min: 8,
    max: 18,
    floors: [1, 1],
    enter: true,
    sign: false,
    styles: [
      S(
        "timber-boathouse",
        "Timber",
        "Madeira",
        "barn",
        frame({
          skin: "batten",
          storey: 3.4,
          plinth: 0.2,
          roof: "front",
          pitch: 38,
          over: 0.45,
          cover: "shingle",
          win: { part: "win-dh22-cased", sill: 1.0 },
          bay: 2.6,
          door: "door-barn",
          bigDoor: "door-barn",
          chimney: "none",
          boards: false,
        }),
      ),
      S(
        "clapboard-boathouse",
        "Clapboard",
        "Tábuas",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 3.4,
          plinth: 0.2,
          roof: "front",
          pitch: 42,
          over: 0.4,
          cover: "slate",
          win: { part: "win-dh66-cased", sill: 1.0 },
          bay: 2.4,
          door: "door-barn",
          bigDoor: "door-barn",
          chimney: "none",
          cupola: true,
        }),
      ),
      S(
        "stone-boathouse",
        "Stone base",
        "Base de pedra",
        "shingle",
        frame({
          skin: "shingle",
          base: "fieldstone",
          storey: 3.2,
          plinth: 0.2,
          roof: "front",
          pitch: 44,
          over: 0.45,
          cover: "shingle",
          win: { part: "win-dh66-cased", sill: 1.0 },
          bay: 2.4,
          door: "door-barn",
          bigDoor: "door-barn",
          chimney: "none",
          boards: false,
        }),
      ),
    ],
  },
  barn: {
    name: "Barn",
    pt: "Celeiro",
    group: "farm",
    min: 14,
    max: 32,
    floors: [1, 2],
    enter: true,
    sign: false,
    styles: [
      S(
        "gambrel",
        "Gambrel",
        "Gambrel",
        "barn",
        frame({
          skin: "batten",
          base: "fieldstone",
          storey: 5.0,
          plinth: 0.2,
          roof: "gambrel",
          pitch: 60,
          over: 0.5,
          cover: "metal",
          win: { part: "win-sq-cased", sill: 1.4 },
          bay: 4,
          door: "door-barn",
          bigDoor: "door-barn",
          cupola: true,
          loft: true,
          chimney: "none",
          boards: true,
        }),
      ),
      S(
        "bank-barn",
        "Bank barn",
        "Celeiro de encosta",
        "barn",
        frame({
          skin: "batten",
          base: "fieldstone",
          storey: 4.4,
          plinth: 0.2,
          roof: "side",
          pitch: 40,
          over: 0.5,
          cover: "metal",
          win: { part: "win-sq-cased", sill: 1.4 },
          bay: 4,
          door: "door-barn",
          bigDoor: "door-barn",
          cupola: true,
          chimney: "none",
        }),
      ),
      S(
        "pole-barn",
        "Pole barn",
        "Galpão de postes",
        "metal",
        frame({
          skin: "metal",
          storey: 4.8,
          plinth: 0.1,
          roof: "side",
          pitch: 18,
          over: 0.4,
          cover: "metal",
          win: { part: "win-ribbon~x", sill: 3.2 },
          bay: 6,
          door: "door-rollup",
          bigDoor: "door-rollup",
          chimney: "none",
          boards: false,
        }),
      ),
    ],
  },
  farmhouse: {
    name: "Farmhouse",
    pt: "Casa de fazenda",
    group: "homes",
    min: 10,
    max: 20,
    floors: [1, 3],
    enter: true,
    sign: false,
    styles: [
      S(
        "classic",
        "Classic",
        "Clássica",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 2.9,
          plinth: 0.15,
          roof: "side",
          pitch: 38,
          over: 0.4,
          cover: "slate",
          win: wDH,
          bay: 2.4,
          door: "door-front",
          porch: { kind: "full", post: "post-turned", rail: true, depth: 2.0 },
          chimney: "end",
          returns: true,
        }),
      ),
      S(
        "federal",
        "Federal",
        "Federal",
        "clapboard",
        frame({
          skin: "clapboard",
          storey: 2.9,
          plinth: 0.15,
          roof: "hip",
          pitch: 30,
          over: 0.45,
          cover: "slate",
          win: wDH,
          bay: 2.3,
          door: "door-fan",
          porch: { kind: "stoop", post: "column-tuscan", rail: false, depth: 1.6 },
          chimney: "twin",
        }),
      ),
      S(
        "gothic-farm",
        "Gothic farmhouse",
        "Fazenda gótica",
        "victorian",
        frame({
          skin: "clapboard",
          storey: 3.0,
          plinth: 0.15,
          roof: "side",
          pitch: 45,
          over: 0.45,
          cover: "slate",
          win: wVic,
          bay: 2.4,
          door: "door-front",
          porch: { kind: "full", post: "post-turned", rail: true, depth: 2.0 },
          cross: "centre",
          chimney: "end",
        }),
      ),
    ],
  },
  silo: {
    name: "Silo",
    pt: "Silo",
    group: "farm",
    min: 6,
    max: 10,
    floors: [2, 5],
    enter: false,
    sign: false,
    styles: [
      S("stave", "Concrete stave", "Aduelas de concreto", "concrete", silo("stave")),
      S("steel-bin", "Steel bin", "Silo de aço", "metal", silo("steel")),
      S("brick-silo", "Brick", "Tijolos", "brick", silo("brick")),
    ],
  },
  shelter: {
    name: "Bus shelter",
    pt: "Ponto de ônibus",
    group: "civic",
    min: 4,
    max: 10,
    floors: [1, 1],
    enter: false,
    sign: false,
    styles: [
      S("glass-shelter", "Glass", "Vidro", "modern", shelter("glass")),
      S("timber-shelter", "Timber", "Madeira", "barn", shelter("timber")),
      S("brick-shelter", "Brick", "Tijolos", "brick", shelter("brick")),
    ],
  },
  gatehouse: {
    name: "Gatehouse",
    pt: "Guarita",
    group: "civic",
    min: 4,
    max: 10,
    floors: [1, 1],
    enter: true,
    sign: false,
    styles: [
      S("glass-gate", "Glass", "Vidro", "modern", gatehouse("glass")),
      S("brick-gate", "Brick", "Tijolos", "brick", gatehouse("brick")),
      S("timber-gate", "Timber", "Madeira", "barn", gatehouse("timber")),
    ],
  },
};
export const KIT_KINDS = Object.keys(KINDS) as KitKind[];
export const isKit = (k: BuildingKind): k is KitKind => k in KINDS;

/** A building's style (its own, else one seeded from its plot). */
export function styleOf(b: Building): StyleDef | null {
  const kd = isKit(b.kind) ? KINDS[b.kind] : null;
  if (!kd) return null;
  return kd.styles.find((s) => s.id === b.style) ?? kd.styles[Math.floor(rngOf(seedOf(b, 1))() * kd.styles.length)];
}
/** A building's colours (its own, else seeded from its style's palette). */
export function coloursOf(b: Building, st = styleOf(b)): Colours {
  const p: Palette = PALETTES[st?.pal ?? "clapboard"];
  const r = rngOf(seedOf(b, 2));
  const pick = (a: string[]) => a[Math.floor(r() * a.length)];
  const walls = pick(p.walls);
  const trim = pick(p.trim);
  const roof = pick(p.roof);
  const door = pick(p.door);
  const canvas = CANVAS[Math.floor(r() * CANVAS.length)];
  const c = b.colours ?? {};
  return {
    walls: c.walls ?? b.tint ?? walls,
    trim: c.trim ?? (trim === (c.walls ?? walls) ? p.trim[(p.trim.indexOf(trim) + 1) % p.trim.length] : trim),
    roof: c.roof ?? roof,
    door: c.door ?? door,
    canvas,
    walls2: (p.walls2 ?? ["#8e8578"])[0],
  };
}

const cache = new Map<string, Layout>();
/** The land's height at (x, z) (grounds.ts sets it: no import of it here — it imports this). */
let landAt: ((x: number, z: number) => number) | null = null;
export function setLandAt(f: (x: number, z: number) => number): void {
  landAt = f;
  cache.clear();
}
/** How far the land falls before a side at s along it (m; 0 with no land known): sampled 1.5–5 m out. */
function dropBefore(k: K, sd: Side, s: number): number {
  if (!landAt) return 0;
  const b = k.b;
  const y0 = landAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  let drop = 0;
  for (const out of [1.5, 3, 5]) {
    const [u, v] = k.at(sd, s, out);
    const [x, z] = k.P(u, v);
    drop = Math.max(drop, y0 - landAt(x, z));
  }
  return drop;
}
/** (plan 111) A door's steps on down to the land where it's lower than the building stands: its stoop's laid from
 *  the building's ground, and where the land falls away in front (a gatehouse by the road's cut, a boathouse's bank)
 *  its foot was in the air — a landing at the building's ground, then treads down, ≤ 0.18 a rise. */
function stepsToLand(L: Layout, b: Building): void {
  if (!landAt) return;
  const d = L.door;
  if (d.w < 0.5) return;
  const y0 = landAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  const [ox, oz] = [d.ox, d.oz];
  const [tx, tz] = [-oz, ox];
  const half = Math.max(0.7, d.w / 2 + 0.3);
  // (how far out its steps under the door already reach)
  let reach = 0;
  for (const so of L.solids) {
    if (so.what !== "porch" || !("box" in so)) continue;
    const [x0, z0, x1, z1] = so.box;
    for (const [cx, cz] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ]) {
      const side = (cx - d.x) * tx + (cz - d.z) * tz;
      if (Math.abs(side) < half + 1) reach = Math.max(reach, (cx - d.x) * ox + (cz - d.z) * oz);
    }
  }
  reach = Math.min(reach, 4);
  const RUN = 0.34;
  let drop = 0;
  for (let t = reach + 0.1; t <= reach + 1.2; t += 0.2) drop = Math.max(drop, y0 - landAt(d.x + ox * t, d.z + oz * t));
  if (drop < 0.12) return;
  const n = Math.ceil(drop / 0.18);
  for (let k = 0; k < n; k++) {
    const top = -(drop * k) / n;
    const a = reach + RUN * k;
    const e = reach + RUN * (k + 1);
    const xs = [d.x + ox * a + tx * half, d.x + ox * a - tx * half, d.x + ox * e + tx * half, d.x + ox * e - tx * half];
    const zs = [d.z + oz * a + tz * half, d.z + oz * a - tz * half, d.z + oz * e + tz * half, d.z + oz * e - tz * half];
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    L.boxes.push({ x0, y0: -drop - 0.3, z0, x1, y1: top, z1, mat: "paint", colour: "#b8b2a6" });
    L.solids.push({ what: "porch", box: [x0, z0, x1, z1, -drop - 0.3, top] });
  }
}
const sigOf = (b: Building) =>
  JSON.stringify([
    b.kind,
    b.x0,
    b.z0,
    b.x1,
    b.z1,
    b.floors,
    b.face,
    b.style,
    b.colours,
    b.tint,
    b.sign,
    b.enter,
    b.vacant,
    b.name,
  ]);
/** A building laid out (null: not one of the kit's — the HQ, the blocks). Its y's are over its ground. */
export function layoutOf(b: Building): Layout | null {
  // (the skate hall stays as Blender made it, inside and out: docs/plan/104 — its own solids)
  if (b.key === "skatehall") return null;
  const st = styleOf(b);
  if (!st || !isKit(b.kind)) return null;
  const sig = sigOf(b);
  const hit = cache.get(b.key);
  if (hit && (hit as Layout & { sig?: string }).sig === sig) return hit;
  const kd = KINDS[b.kind];
  const k = new K(b, coloursOf(b, st));
  const floors = Math.max(kd.floors[0], Math.min(kd.floors[1], b.floors || kd.floors[0]));
  // (plan 111: every kind that can be walked into is — its inside empty unless it's furnished, `b.enter`)
  st.make(k, { floors, enter: kd.enter, sign: kd.sign ? (b.sign ?? "") : "", vacant: !!b.vacant });
  const L = k.L;
  if (!L.eave) L.eave = L.masses[0]?.eave ?? 3;
  L.top = Math.max(L.top, L.eave);
  if (kd.enter) L.solids.push({ what: "inside", h: L.eave });
  stepsToLand(L, b);
  // (no two faces in one plane: plan 111 phase 2)
  settleFaces(L);
  (L as Layout & { sig?: string }).sig = sig;
  cache.set(b.key, L);
  return L;
}
/** The kinds by group, in the panel's order. */
export const GROUPS: { id: KindGroup; name: string; pt: string; kinds: KitKind[] }[] = [
  { id: "homes", name: "Homes", pt: "Moradias", kinds: ["house", "townhouses", "apartments", "farmhouse"] },
  { id: "shops", name: "Shops", pt: "Comércio", kinds: ["shop", "cornershop", "bar", "diner", "hotel", "gas"] },
  { id: "work", name: "Work", pt: "Trabalho", kinds: ["office", "warehouse", "garage"] },
  {
    id: "civic",
    name: "Town",
    pt: "Cidade",
    kinds: ["church", "school", "police", "fire", "clinic", "library", "shelter", "gatehouse"],
  },
  { id: "farm", name: "Farm", pt: "Fazenda", kinds: ["barn", "silo", "shed", "boathouse"] },
];
