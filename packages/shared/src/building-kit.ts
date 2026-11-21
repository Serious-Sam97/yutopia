// Plan 110 (docs/plan/110-the-buildings.md) — the buildings' layout grammar: the engine.
//
// A building is laid out once, as data, from its plot, floors, door side, style and colours: its walls (each a
// flat skin with its openings cut, one material a skin), its roofs and gables, the boxes drawn as they are
// (foundations, decks, parapets), the kit's parts placed (tools/art/buildings: windows, doors, cornices, porches,
// chimneys… — their meshes in the client's kit GLB), its signs, its lamps, where the snow lies, and its solids.
// What's drawn (tp/kit-buildings.ts), what's solid (shapes/grounds.ts), what's walked and the God mode ghost all
// read the same layout, so they always agree.
//
// The styles and the kinds are building-styles.ts; this is what they're made with.
//
// Frames: the WORLD's (x east, z south, y up; y over the ground at the plot's middle). A building is composed in
// its LOCAL frame — u along its front from left to right as you face it from the street, v back from the front
// into it — and mapped to the world by its door's side. A part's own frame (the kit's): x along the wall (to the
// right as you face it), y up, z out of it; placed by its world position and `ry`, its turn about y.
import type { Building } from "./grounds.ts";

export type V3 = [number, number, number];
export type P2 = [number, number];
type Face = Building["face"];

/** What a wall's skin is (each its own picture in the client). */
export type Skin =
  | "clapboard"
  | "shingle"
  | "batten"
  | "brick"
  | "stone"
  | "fieldstone"
  | "stucco"
  | "concrete"
  | "metal"
  | "panel";
/** What a roof's covered with. */
export type Cover = "slate" | "shingle" | "metal" | "membrane" | "copper" | "tin";
/** A material of what's drawn: a skin, a roof's cover, plain paint (its colour in its vertices), glass (lit at
 *  night `lit` of the time: 0 none), a glow (lamps, neon). */
export type KMat = `skin:${Skin}` | `roof:${Cover}` | "paint" | "glass" | "glass-lit" | "glow";

/** The kit's roles (tools/art/buildings/bkit.py ROLES): what each piece of a part is. */
export type Role =
  | "skin"
  | "trim"
  | "sash"
  | "door"
  | "glass"
  | "canvas"
  | "canvas2"
  | "metal"
  | "chrome"
  | "galv"
  | "stone"
  | "brick"
  | "concrete"
  | "roof"
  | "copper"
  | "wood"
  | "lamp"
  | "neon"
  | "sign"
  | "gold"
  | "red"
  | "rubber";
/** The roles' own colours (the ones a building's colours don't set). */
export const ROLE_HEX: Record<Role, string> = {
  skin: "#78909a",
  trim: "#dcd9cc",
  sash: "#ebe8de",
  door: "#33453a",
  glass: "#d2dadf",
  canvas: "#8c1f1c",
  canvas2: "#e1dccd",
  metal: "#16171a",
  chrome: "#cfd2d4",
  galv: "#8d9090",
  stone: "#b3ab9a",
  brick: "#7a3a2c",
  concrete: "#9e9c95",
  roof: "#34373b",
  copper: "#5c9480",
  wood: "#6b4d31",
  lamp: "#ffdca0",
  neon: "#ff4050",
  sign: "#1f2a38",
  gold: "#d9a948",
  red: "#9e1512",
  rubber: "#0a0a0a",
};
/** The roles that are lit at night (their own material), the ones that are glass. */
export const GLOW_ROLES = new Set<Role>(["lamp", "neon"]);

/** A building's colours (each from its style's palette: building-styles.ts). */
export interface Colours {
  walls: string;
  trim: string;
  roof: string;
  door: string;
  canvas: string;
  /** a second skin's (a stone base, a brick ground floor under clapboard) */
  walls2: string;
}

/** An opening in a wall: from s0 to s1 along it, y0 to y1 up; its head (an arch's, a lancet's: drawn over y1). */
export interface KHole {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  head?: "arch" | "pointed" | "round";
}
/** A wall: from a to b (b − a to the right as you face it), facing `o` (outward), y0 to y1 over the ground; its
 *  openings cut. */
export interface KWall {
  a: P2;
  b: P2;
  o: P2;
  y0: number;
  y1: number;
  mat: KMat;
  colour: string;
  holes: KHole[];
  /** its top when it isn't level (a gable end's, a gambrel's, a shed's side): (s along it, y) from its start to
   *  its end, y1 the eaves' */
  top?: P2[];
}
/** A flat polygon drawn as it is (a gable, a roof's slope, a soffit, a sign's board…). */
export interface KPoly {
  pts: V3[];
  n: V3;
  mat: KMat;
  colour: string;
}
/** A box drawn as it is. */
export interface KBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  mat: KMat;
  colour: string;
}
/** A part of the kit, placed. */
export interface KPart {
  part: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  sx: number;
  sy: number;
  /** its glass lit at night */
  lit?: boolean;
}
/** A sign's words on a board. */
export interface KSign {
  text: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  w: number;
  h: number;
  bg: string;
  fg: string;
  /** lit at night */
  lit?: boolean;
}
/** Where snow lies: a slope (h0–h1 its high edge, l0–l1 its low one) or a flat top. */
export type KSnow =
  | { t: "slope"; h0: V3; h1: V3; l0: V3; l1: V3; deep?: number }
  | { t: "flat"; x0: number; z0: number; x1: number; z1: number; y: number; deep?: number };
/** What's solid (shapes/grounds.ts reads these): a box, an upright cylinder, a roof in steps by its section. */
export type KSolid =
  | { what: SolidWhat; box: [number, number, number, number, number, number] }
  | { what: SolidWhat; cyl: [number, number, number, number, number] }
  | {
      what: SolidWhat;
      steps: { x0: number; z0: number; x1: number; z1: number; alongX: boolean; prof: P2[] };
    }
  /** the building's walls when you walk into it (shapes/grounds.ts insideWalls: its tiles' edges) */
  | { what: "inside"; h: number };
/** (`mass`: a building's main walls — solid, or round its inside when it's walked into) */
export type SolidWhat =
  | "mass"
  | "building"
  | "roof"
  | "porch"
  | "porch_rail"
  | "awning"
  | "street"
  | "forecourt"
  | "fit";
/** A mass of the building: a box on its plot, its eaves at `eave`, the top of what's over it `top`. */
export interface KMass {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  eave: number;
  top: number;
}

/** A building laid out. */
export interface Layout {
  key: string;
  walls: KWall[];
  polys: KPoly[];
  boxes: KBox[];
  parts: KPart[];
  signs: KSign[];
  lamps: V3[];
  snow: KSnow[];
  solids: KSolid[];
  masses: KMass[];
  /** its walls' height at its door (the old `wallsHigh`), and its highest point, over its ground */
  eave: number;
  top: number;
  /** its door (the middle of its sill, out of it) */
  door: { x: number; z: number; y: number; ox: number; oz: number; w: number; h: number };
  /** its storeys' floors over its ground, bottom up, and the top storey's ceiling last (plan 112: a floor each in its
   *  space); none: one storey, door sill to eaves */
  storeys?: number[];
  /** what's of it past its plot (a steeple: walking keeps off it) */
  outside: { x0: number; z0: number; x1: number; z1: number }[];
  /** the part of its plot built (a gas station's kiosk; none: all of it) */
  built?: { x0: number; z0: number; x1: number; z1: number };
  /** open ground in its plot you walk and drive on (a gas station's forecourt, a parking garage's decks) */
  open?: boolean;
  /** a gas station's islands and canopy posts (grounds.ts forecourtOf) */
  forecourt?: { islands: { x: number; z: number; hx: number; hz: number }[]; posts: { x: number; z: number }[] };
  /** a parking garage's decks: their heights over the ground, and its ramps (each from y0 at (ax, az) to y1 at
   *  (bx, bz), w wide) */
  decks?: {
    ys: number[];
    ramps: { ax: number; az: number; bx: number; bz: number; w: number; y0: number; y1: number }[];
  };
}

// ── the openings the kit's parts make: their size, their head (tools/art/buildings/parts.py) ─────────────────
export interface Opening {
  w: number;
  h: number;
  head?: KHole["head"];
  /** none: the part stands proud of a wall without a hole (a bay window) */
  hole?: boolean;
}
export const OPENINGS: Record<string, Opening> = {
  "win-dh66": { w: 0.85, h: 1.55 },
  "win-dh66-cased": { w: 0.85, h: 1.55 },
  "win-dh22": { w: 0.85, h: 1.55 },
  "win-dh22-cased": { w: 0.85, h: 1.55 },
  "win-vic11-hood": { w: 0.85, h: 1.95 },
  "win-vic11-ped": { w: 0.85, h: 1.95 },
  "win-cr31": { w: 0.8, h: 1.4 },
  "win-cr31-trio": { w: 2.64, h: 1.4 },
  "win-sq": { w: 0.6, h: 0.6 },
  "win-sq-cased": { w: 0.6, h: 0.6 },
  "win-arch": { w: 0.9, h: 1.95, head: "arch" },
  "win-arch-brick": { w: 0.9, h: 1.95, head: "arch" },
  "win-pointed": { w: 1.0, h: 2.6, head: "pointed" },
  "win-oculus": { w: 0.9, h: 0.9, head: "round" },
  "win-ribbon~x": { w: 1, h: 1.7 },
  "win-curtain": { w: 1.5, h: 3.8 },
  "win-steel": { w: 1.8, h: 2.4 },
  "win-bay": { w: 2.4, h: 2.95, hole: false },
  "door-front": { w: 1.77, h: 2.62 },
  "door-fan": { w: 1.05, h: 2.15, head: "arch" },
  "door-shop": { w: 0.95, h: 2.65 },
  "door-double": { w: 1.8, h: 2.6, head: "arch" },
  "door-pointed": { w: 1.8, h: 2.5, head: "pointed" },
  "door-garage": { w: 2.7, h: 2.15 },
  "door-rollup": { w: 3.6, h: 4.3 },
  "door-apparatus": { w: 3.7, h: 4.3 },
  "door-barn": { w: 3.6, h: 4.0 },
  "door-service": { w: 0.95, h: 2.1 },
  "door-slider": { w: 3.6, h: 2.8 },
  "shop-recess": { w: 1.8, h: 3.55 },
};
/** How far over its rectangle an opening's head goes. */
export function headRise(o: { w: number; head?: KHole["head"] }): number {
  if (o.head === "arch") return o.w / 2;
  if (o.head === "pointed") return o.w * 0.866;
  return 0;
}

// ── a seeded random (the same everywhere: the client's look and the server's solids) ─────────────────────────
export function rngOf(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedOf = (b: { x0: number; z0: number }, k = 0) => Math.round(b.x0 * 7919 + b.z0 * 31 + 7 + k * 101);

/** A side of a mass, in the local frame: its foot from (u, v) at s = 0 to its end, facing out along (du, dv). */
export interface Side {
  a: P2;
  b: P2;
  o: P2;
  L: number;
  /** what this side is to the building */
  is: "front" | "back" | "left" | "right";
}

/** The composer: what a building's laid out with, in its local frame, mapped as it goes. */
export class K {
  readonly W: number;
  readonly D: number;
  readonly L: Layout;
  readonly r: () => number;
  constructor(
    readonly b: Building,
    readonly c: Colours,
  ) {
    const ns = b.face === "n" || b.face === "s";
    this.W = ns ? b.x1 - b.x0 : b.z1 - b.z0;
    this.D = ns ? b.z1 - b.z0 : b.x1 - b.x0;
    this.r = rngOf(seedOf(b, 3));
    this.L = {
      key: b.key,
      walls: [],
      polys: [],
      boxes: [],
      parts: [],
      signs: [],
      lamps: [],
      snow: [],
      solids: [],
      masses: [],
      eave: 0,
      top: 0,
      door: { x: 0, z: 0, y: 0, ox: 0, oz: 1, w: 1, h: 2.1 },
      outside: [],
    };
  }
  /** local (u, v) → world (x, z) */
  P(u: number, v: number): P2 {
    const { x0, z0, x1, z1 } = this.b;
    switch (this.b.face as Face) {
      case "n":
        return [x1 - u, z0 + v];
      case "s":
        return [x0 + u, z1 - v];
      case "e":
        return [x1 - v, z1 - u];
      default:
        return [x0 + v, z0 + u];
    }
  }
  /** a local direction → the world's */
  dir(du: number, dv: number): P2 {
    switch (this.b.face as Face) {
      case "n":
        return [-du, dv];
      case "s":
        return [du, -dv];
      case "e":
        return [-dv, -du];
      default:
        return [dv, du];
    }
  }
  /** a local point (u, y, v) → the world's */
  p3(u: number, y: number, v: number): V3 {
    const [x, z] = this.P(u, v);
    return [x, y, z];
  }
  n3(du: number, dy: number, dv: number): V3 {
    const [x, z] = this.dir(du, dv);
    return [x, dy, z];
  }
  /** a local rectangle → the world's (axis-aligned either way) */
  rect(u0: number, v0: number, u1: number, v1: number) {
    const [ax, az] = this.P(u0, v0);
    const [bx, bz] = this.P(u1, v1);
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
  }
  /** whether local u runs along world x */
  get uAlongX(): boolean {
    return this.b.face === "n" || this.b.face === "s";
  }

  // ── the sides of a mass (u0, v0)–(u1, v1) ──
  sides(u0: number, v0: number, u1: number, v1: number): Record<Side["is"], Side> {
    return {
      front: { a: [u0, v0], b: [u1, v0], o: [0, -1], L: u1 - u0, is: "front" },
      right: { a: [u1, v0], b: [u1, v1], o: [1, 0], L: v1 - v0, is: "right" },
      back: { a: [u1, v1], b: [u0, v1], o: [0, 1], L: u1 - u0, is: "back" },
      left: { a: [u0, v1], b: [u0, v0], o: [-1, 0], L: v1 - v0, is: "left" },
    };
  }
  /** a point s along a side, `out` off its face → local (u, v) */
  at(sd: Side, s: number, out = 0): P2 {
    const t = s / (sd.L || 1);
    return [sd.a[0] + (sd.b[0] - sd.a[0]) * t + sd.o[0] * out, sd.a[1] + (sd.b[1] - sd.a[1]) * t + sd.o[1] * out];
  }
  /** a side's turn for the parts on it (their +z out of it) */
  ryOf(sd: Side): number {
    const [ox, oz] = this.dir(sd.o[0], sd.o[1]);
    return Math.atan2(ox, oz);
  }

  // ── what's laid ──
  /** a wall up a side, y0 to y1 (its openings added after by `open`); returned to add them to */
  wall(sd: Side, y0: number, y1: number, skin: Skin = "clapboard", colour = this.c.walls, s0 = 0, s1 = sd.L): KWall {
    const [au, av] = this.at(sd, s0);
    const [bu, bv] = this.at(sd, s1);
    const w: KWall = {
      a: this.P(au, av),
      b: this.P(bu, bv),
      o: this.dir(sd.o[0], sd.o[1]),
      y0,
      y1,
      mat: `skin:${skin}`,
      colour,
      holes: [],
    };
    this.L.walls.push(w);
    return w;
  }
  /** a part on a side at s along it, y up, `out` off its face (stretched sx, sy where it may be) */
  part(name: string, sd: Side, s: number, y: number, out = 0, sx = 1, sy = 1, lit?: boolean) {
    const [u, v] = this.at(sd, s, out);
    const [x, z] = this.P(u, v);
    this.L.parts.push({ part: name, x, y, z, ry: this.ryOf(sd), sx, sy, ...(lit ? { lit } : {}) });
  }
  /** a part standing free at local (u, y, v), facing local (du, dv) */
  free(name: string, u: number, y: number, v: number, du = 0, dv = -1, sx = 1, sy = 1) {
    const [x, z] = this.P(u, v);
    const [ox, oz] = this.dir(du, dv);
    this.L.parts.push({ part: name, x, y, z, ry: Math.atan2(ox, oz), sx, sy });
  }
  /** an opening's part in a wall (its hole cut, centred at s, its sill at y) */
  open(w: KWall | KWall[], sd: Side, name: string, s: number, y: number, lit?: boolean, s0 = 0) {
    const o = OPENINGS[name];
    if (o.hole !== false)
      for (const ww of Array.isArray(w) ? w : [w])
        ww.holes.push({ s0: s - s0 - o.w / 2, s1: s - s0 + o.w / 2, y0: y, y1: y + o.h, head: o.head });
    this.part(name, sd, s, y, 0, 1, 1, lit);
  }
  /** a wall's top raised to the roof over it: `h` the roof's height at local (u, v), sampled at s along it */
  raise(w: KWall, sd: Side, ss: number[], h: (u: number, v: number) => number) {
    w.top = ss.map((s) => {
      const [u, v] = this.at(sd, s);
      return [s, Math.max(w.y1, h(u, v))] as P2;
    });
  }
  /** a stretched opening (a ribbon window, a shopfront's run): its hole `wid` wide, the part stretched to it */
  openRun(w: KWall, sd: Side, name: string, s: number, y: number, wid: number, h: number, lit?: boolean, s0 = 0) {
    w.holes.push({ s0: s - s0 - wid / 2, s1: s - s0 + wid / 2, y0: y, y1: y + h });
    this.part(name, sd, s, y, 0, wid, 1, lit);
  }
  /** a box in local coordinates */
  box(
    u0: number,
    y0: number,
    v0: number,
    u1: number,
    y1: number,
    v1: number,
    mat: KMat = "paint",
    colour = this.c.trim,
  ) {
    const r = this.rect(u0, v0, u1, v1);
    this.L.boxes.push({
      x0: r.x0,
      y0: Math.min(y0, y1),
      z0: r.z0,
      x1: r.x1,
      y1: Math.max(y0, y1),
      z1: r.z1,
      mat,
      colour,
    });
  }
  /** a polygon in local coordinates (u, y, v), facing local (du, dy, dv) */
  poly(pts: V3[], n: V3, mat: KMat, colour: string) {
    this.L.polys.push({ pts: pts.map((p) => this.p3(p[0], p[1], p[2])), n: this.n3(n[0], n[1], n[2]), mat, colour });
  }
  /** stairs up to `h` (at vBack, the door's or a deck's front) from the ground at vFront, across u0–u1: each
   *  step a drawn box and its solid, none over 0.2 up */
  stairs(u0: number, u1: number, vFront: number, vBack: number, h: number, colour = "#c8c0ae") {
    if (h < 0.05) return;
    const n = Math.max(1, Math.ceil(h / 0.2 - 1e-6));
    const run = (vBack - vFront) / n;
    for (let i = 0; i < n; i++) {
      const top = (h * (i + 1)) / n;
      const va = vFront + run * i;
      this.box(u0, -0.3, va, u1, top, vBack, "paint", colour);
      this.solid("porch", u0, va, u1, vBack, -0.3, top);
    }
  }
  /** a solid box in local coordinates */
  solid(what: SolidWhat, u0: number, v0: number, u1: number, v1: number, y0: number, y1: number) {
    const r = this.rect(u0, v0, u1, v1);
    this.L.solids.push({ what, box: [r.x0, r.z0, r.x1, r.z1, y0, y1] });
  }
  solidCyl(what: SolidWhat, u: number, v: number, rad: number, y0: number, y1: number) {
    const [x, z] = this.P(u, v);
    this.L.solids.push({ what, cyl: [x, z, rad, y0, y1] });
  }
  /** a sign's words on a side at s along it, y its bottom, `out` off the face */
  sign(
    sd: Side,
    text: string,
    s: number,
    y: number,
    w: number,
    h: number,
    bg: string,
    fg: string,
    out = 0.07,
    lit = true,
  ) {
    if (!text.trim()) return;
    const [u, v] = this.at(sd, s, out);
    const [x, z] = this.P(u, v);
    this.L.signs.push({ text, x, y, z, ry: this.ryOf(sd), w, h, bg, fg, lit });
  }
  lamp(u: number, y: number, v: number) {
    this.L.lamps.push(this.p3(u, y, v));
  }
  mass(u0: number, v0: number, u1: number, v1: number, eave: number, top: number) {
    this.L.masses.push({ ...this.rect(u0, v0, u1, v1), eave, top });
    this.L.top = Math.max(this.L.top, top);
  }
  /** the building's door: on its front at s, its sill y, w wide, h tall */
  doorAt(sd: Side, s: number, y: number, w: number, h: number) {
    const [u, v] = this.at(sd, s);
    const [x, z] = this.P(u, v);
    const [ox, oz] = this.dir(sd.o[0], sd.o[1]);
    this.L.door = { x, z, y, ox, oz, w, h };
  }

  // ── roofs: drawn, snowed on, solid ──
  /** a gable roof over the mass u0–u1 × v0–v1, its eaves at y, its ridge along u (`alongU`) or v, `pitch`
   *  degrees, out `over` at the eaves and `rake` at the gables; its gable ends in the walls' skin (or none) */
  gable(
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    y: number,
    pitch: number,
    alongU: boolean,
    cover: Cover,
    o: {
      over?: number;
      rake?: number;
      skin?: Skin | null;
      gableColour?: string;
      trim?: boolean;
      solid?: boolean;
      /** the walls under its gable ends, raised to them (else the ends are drawn on their own) */
      ends?: [KWall, Side][];
    } = {},
  ): number {
    const over = o.over ?? 0.4;
    const rake = o.rake ?? 0.3;
    // in the roof's own terms: a along the ridge, c across it
    const [a0, a1, c0, c1] = alongU ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
    const cm = (c0 + c1) / 2;
    const half = (c1 - c0) / 2;
    const rise = half * Math.tan((pitch * Math.PI) / 180);
    const drop = over * Math.tan((pitch * Math.PI) / 180);
    const L = (a: number, yy: number, c: number): V3 => (alongU ? [a, yy, c] : [c, yy, a]);
    const N = (da: number, dy: number, dc: number): V3 => (alongU ? [da, dy, dc] : [dc, dy, da]);
    const col = this.c.roof;
    const tr = this.c.trim;
    const th = 0.12; // (its thickness at the edges)
    for (const sg of [-1, 1]) {
      const ce = sg < 0 ? c0 - over : c1 + over;
      const eaveY = y - drop;
      const n = N(0, half, sg * rise);
      this.poly(
        [L(a0 - rake, eaveY, ce), L(a1 + rake, eaveY, ce), L(a1 + rake, y + rise, cm), L(a0 - rake, y + rise, cm)],
        n,
        `roof:${cover}`,
        col,
      );
      // its underside, its fascia
      this.poly(
        [
          L(a0 - rake, eaveY - th, ce),
          L(a1 + rake, eaveY - th, ce),
          L(a1 + rake, y + rise - th, cm),
          L(a0 - rake, y + rise - th, cm),
        ],
        N(0, -1, 0),
        "paint",
        shade(tr, 0.8),
      );
      if (o.trim !== false)
        this.poly(
          [
            L(a0 - rake, eaveY - th - 0.1, ce),
            L(a1 + rake, eaveY - th - 0.1, ce),
            L(a1 + rake, eaveY + 0.02, ce),
            L(a0 - rake, eaveY + 0.02, ce),
          ],
          N(0, 0, sg),
          "paint",
          tr,
        );
      // its rake boards up both gables
      for (const [a, sa] of [
        [a0 - rake, -1],
        [a1 + rake, 1],
      ] as const)
        this.poly(
          [
            L(a, eaveY - th - 0.1, ce),
            L(a, y + rise - th - 0.1, cm),
            L(a, y + rise + 0.03, cm),
            L(a, eaveY + 0.03, ce),
          ],
          N(sa, 0, 0),
          "paint",
          tr,
        );
      this.L.snow.push({
        t: "slope",
        h0: this.p3(...L(a0 - rake + 0.05, y + rise, cm)),
        h1: this.p3(...L(a1 + rake - 0.05, y + rise, cm)),
        l0: this.p3(...L(a0 - rake + 0.05, eaveY, ce)),
        l1: this.p3(...L(a1 + rake - 0.05, eaveY, ce)),
      });
    }
    // the gable ends: the walls under them raised, or drawn on their own
    if (o.ends)
      for (const [w, sd] of o.ends)
        this.raise(
          w,
          sd,
          [0, sd.L / 2, sd.L],
          (u, v) => y + rise * Math.max(0, 1 - Math.abs((alongU ? v : u) - cm) / half),
        );
    else if (o.skin !== null)
      for (const [a, sa] of [
        [a0, -1],
        [a1, 1],
      ] as const)
        this.poly(
          [L(a, y, c0), L(a, y, c1), L(a, y + rise, cm)],
          N(sa, 0, 0),
          `skin:${o.skin ?? "clapboard"}`,
          o.gableColour ?? this.c.walls,
        );
    if (o.solid !== false)
      this.roofSolid(u0, v0, u1, v1, alongU, [
        [c0 - over, y - drop],
        [cm, y + rise],
        [c1 + over, y - drop],
      ]);
    return rise;
  }
  /** a hipped roof (its ridge along the longer side; a pyramid on a square) */
  hip(u0: number, v0: number, u1: number, v1: number, y: number, pitch: number, cover: Cover, over = 0.45) {
    const alongU = u1 - u0 >= v1 - v0;
    const [a0, a1, c0, c1] = alongU
      ? [u0 - over, u1 + over, v0 - over, v1 + over]
      : [v0 - over, v1 + over, u0 - over, u1 + over];
    const t = Math.tan((pitch * Math.PI) / 180);
    const half = (c1 - c0) / 2;
    const rise = half * t;
    const cm = (c0 + c1) / 2;
    const ra0 = Math.min(a0 + half, (a0 + a1) / 2);
    const ra1 = Math.max(a1 - half, (a0 + a1) / 2);
    const L = (a: number, yy: number, c: number): V3 => (alongU ? [a, yy, c] : [c, yy, a]);
    const N = (da: number, dy: number, dc: number): V3 => (alongU ? [da, dy, dc] : [dc, dy, da]);
    const ye = y - over * t;
    const top = ye + rise;
    for (const sg of [-1, 1]) {
      const ce = sg < 0 ? c0 : c1;
      this.poly(
        [L(a0, ye, ce), L(a1, ye, ce), L(ra1, top, cm), L(ra0, top, cm)],
        N(0, half, sg * rise),
        `roof:${cover}`,
        this.c.roof,
      );
      this.poly(
        [L(a0, ye - 0.15, ce), L(a1, ye - 0.15, ce), L(a1, ye + 0.02, ce), L(a0, ye + 0.02, ce)],
        N(0, 0, sg),
        "paint",
        this.c.trim,
      );
      this.L.snow.push({
        t: "slope",
        h0: this.p3(...L(ra0, top, cm)),
        h1: this.p3(...L(ra1, top, cm)),
        l0: this.p3(...L(a0 + 0.3, ye, ce)),
        l1: this.p3(...L(a1 - 0.3, ye, ce)),
      });
    }
    for (const sa of [-1, 1]) {
      const ae = sa < 0 ? a0 : a1;
      const ra = sa < 0 ? ra0 : ra1;
      this.poly(
        [L(ae, ye, c0), L(ae, ye, c1), L(ra, top, cm)],
        N(sa * half, (a1 - a0) / 2 - (ra1 - ra0) / 2, 0),
        `roof:${cover}`,
        this.c.roof,
      );
      this.poly(
        [L(ae, ye - 0.15, c0), L(ae, ye - 0.15, c1), L(ae, ye + 0.02, c1), L(ae, ye + 0.02, c0)],
        N(sa, 0, 0),
        "paint",
        this.c.trim,
      );
    }
    // the soffit
    const r0 = alongU ? [u0, v0, u1, v1] : [u0, v0, u1, v1];
    this.flatRing(r0[0], r0[1], r0[2], r0[3], over, ye - 0.15, shade(this.c.trim, 0.8));
    this.roofSolid(u0, v0, u1, v1, alongU, [
      [c0, ye],
      [cm, top],
      [c1, ye],
    ]);
    return top - y;
  }
  /** a gambrel (a barn's): lower slopes steep to a knee `kneeIn` in and `kneeUp` up, then to the ridge */
  gambrel(
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    y: number,
    kneeIn: number,
    kneeUp: number,
    ridgeUp: number,
    cover: Cover,
    skin: Skin,
    over = 0.5,
    ends?: [KWall, Side][],
  ) {
    const cm = (v0 + v1) / 2;
    const prof: P2[] = [
      [v0 - over, y - 0.35],
      [v0 + kneeIn, y + kneeUp],
      [cm, y + ridgeUp],
      [v1 - kneeIn, y + kneeUp],
      [v1 + over, y - 0.35],
    ];
    const rake = 0.35;
    for (let i = 0; i + 1 < prof.length; i++) {
      const [ca, ya] = prof[i];
      const [cb, yb] = prof[i + 1];
      this.poly(
        [
          [u0 - rake, ya, ca],
          [u1 + rake, ya, ca],
          [u1 + rake, yb, cb],
          [u0 - rake, yb, cb],
        ],
        [0, 1, i < 2 ? -0.6 : 0.6],
        `roof:${cover}`,
        this.c.roof,
      );
      const hiFirst = yb > ya;
      const h = hiFirst ? [cb, yb] : [ca, ya];
      const l = hiFirst ? [ca, ya] : [cb, yb];
      this.L.snow.push({
        t: "slope",
        h0: this.p3(u0 - rake + 0.05, h[1], h[0]),
        h1: this.p3(u1 + rake - 0.05, h[1], h[0]),
        l0: this.p3(u0 - rake + 0.05, l[1], l[0]),
        l1: this.p3(u1 + rake - 0.05, l[1], l[0]),
        deep: i === 1 || i === 2 ? 0.2 : 0.12,
      });
    }
    // the gable ends: a pentagon each (as a fan from the middle)
    for (const [u, su] of [
      [u0, -1],
      [u1, 1],
    ] as const) {
      if (!ends) {
        const pts: V3[] = [
          [u, y, v1],
          [u, y, v0],
          [u, y + kneeUp, v0 + kneeIn],
          [u, y + ridgeUp, cm],
          [u, y + kneeUp, v1 - kneeIn],
        ];
        this.poly(pts, [su, 0, 0], `skin:${skin}`, this.c.walls);
      }
      // its rakes
      for (let i = 0; i + 1 < prof.length; i++) {
        const [ca, ya] = prof[i];
        const [cb, yb] = prof[i + 1];
        const ue = u + su * rake;
        this.poly(
          [
            [ue, ya - 0.12, ca],
            [ue, yb - 0.12, cb],
            [ue, yb + 0.05, cb],
            [ue, ya + 0.05, ca],
          ],
          [su, 0, 0],
          "paint",
          this.c.trim,
        );
      }
    }
    if (ends) {
      const at = (v: number) => {
        for (let i = 0; i + 1 < prof.length; i++) {
          const [ca, ya] = prof[i];
          const [cb, yb] = prof[i + 1];
          if (v >= ca - 1e-6 && v <= cb + 1e-6) return ya + ((yb - ya) * (v - ca)) / (cb - ca || 1);
        }
        return y;
      };
      for (const [w, sd] of ends) this.raise(w, sd, [0, kneeIn, sd.L / 2, sd.L - kneeIn, sd.L], (_u, v) => at(v));
    }
    this.roofSolid(u0, v0, u1, v1, true, prof);
  }
  /** a flat roof inside a parapet `p` high over y (its walls' tops in the skin, a coping), or none */
  flat(
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    y: number,
    p: number,
    skin: Skin,
    coping: "stone" | "metal" | "none" = "stone",
    colour = this.c.walls,
  ) {
    const t = 0.3;
    this.poly(
      [
        [u0, y, v0],
        [u1, y, v0],
        [u1, y, v1],
        [u0, y, v1],
      ],
      [0, 1, 0],
      "roof:membrane",
      "#55575a",
    );
    if (p > 0) {
      const S = this.sides(u0, v0, u1, v1);
      for (const sd of Object.values(S)) {
        // (the parapet's inside face)
        const [au, av] = this.at(sd, 0, -t);
        const [bu, bv] = this.at(sd, sd.L, -t);
        this.poly(
          [
            [au, y, av],
            [bu, y, bv],
            [bu, y + p, bv],
            [au, y + p, av],
          ],
          [-sd.o[0], 0, -sd.o[1]],
          `skin:${skin}`,
          shade(colour, 0.85),
        );
      }
      if (coping !== "none") {
        const cm = coping === "stone" ? "#c8c0ae" : "#3a3e42";
        this.box(u0 - 0.05, y + p, v0 - 0.05, u1 + 0.05, y + p + 0.12, v0 + t + 0.02, "paint", cm);
        this.box(u0 - 0.05, y + p, v1 - t - 0.02, u1 + 0.05, y + p + 0.12, v1 + 0.05, "paint", cm);
        this.box(u0 - 0.05, y + p, v0 + t, u0 + t + 0.02, y + p + 0.12, v1 - t, "paint", cm);
        this.box(u1 - t - 0.02, y + p, v0 + t, u1 + 0.05, y + p + 0.12, v1 - t, "paint", cm);
      }
    }
    const r = this.rect(u0 + t, v0 + t, u1 - t, v1 - t);
    this.L.snow.push({ t: "flat", ...r, y, deep: 0.34 });
    this.solid("roof", u0, v0, u1, v1, y - 0.3, y);
    if (p > 0) {
      for (const [a0, b0, a1, b1] of [
        [u0, v0, u1, v0 + t],
        [u0, v1 - t, u1, v1],
        [u0, v0, u0 + t, v1],
        [u1 - t, v0, u1, v1],
      ])
        this.solid("building", a0, b0, a1, b1, y, y + p + 0.12);
    }
  }
  /** a shed roof: high along v0, falling to v1 */
  shed(
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    yHi: number,
    yLo: number,
    cover: Cover,
    skin: Skin,
    over = 0.4,
    ends?: [KWall, Side][],
  ) {
    const k = (yHi - yLo) / (v1 - v0);
    const a: V3 = [u0 - over, yHi + over * k, v0 - over];
    const b: V3 = [u1 + over, yHi + over * k, v0 - over];
    const c: V3 = [u1 + over, yLo - over * k, v1 + over];
    const d: V3 = [u0 - over, yLo - over * k, v1 + over];
    this.poly([a, b, c, d], [0, 1, k], `roof:${cover}`, this.c.roof);
    this.box(u0 - over, yHi + over * k - 0.15, v0 - over - 0.03, u1 + over, yHi + over * k + 0.03, v0 - over + 0.03);
    if (ends) for (const [w, sd] of ends) this.raise(w, sd, [0, sd.L], (_u, v) => yHi - (v - v0) * k);
    else
      for (const [u, su] of [
        [u0, -1],
        [u1, 1],
      ] as const)
        this.poly(
          [
            [u, yLo, v1],
            [u, yLo, v0],
            [u, yHi, v0],
          ],
          [su, 0, 0],
          `skin:${skin}`,
          this.c.walls,
        );
    this.L.snow.push({
      t: "slope",
      h0: this.p3(u0 - over + 0.05, a[1], v0 - over),
      h1: this.p3(u1 + over - 0.05, a[1], v0 - over),
      l0: this.p3(u0 - over + 0.05, d[1], v1 + over),
      l1: this.p3(u1 + over - 0.05, d[1], v1 + over),
    });
    this.roofSolid(u0, v0, u1, v1, true, [
      [v0, yHi],
      [v1, yLo],
    ]);
  }
  /** a mansard: steep lower slopes `h` up on every side, in `inset`, a flat top over them */
  mansard(u0: number, v0: number, u1: number, v1: number, y: number, h: number, inset: number, cover: Cover) {
    const sides: [V3, V3, V3, V3, V3][] = [
      [
        [u0, y, v0],
        [u1, y, v0],
        [u1 - inset, y + h, v0 + inset],
        [u0 + inset, y + h, v0 + inset],
        [0, inset, -h],
      ],
      [
        [u1, y, v0],
        [u1, y, v1],
        [u1 - inset, y + h, v1 - inset],
        [u1 - inset, y + h, v0 + inset],
        [h, inset, 0],
      ],
      [
        [u1, y, v1],
        [u0, y, v1],
        [u0 + inset, y + h, v1 - inset],
        [u1 - inset, y + h, v1 - inset],
        [0, inset, h],
      ],
      [
        [u0, y, v1],
        [u0, y, v0],
        [u0 + inset, y + h, v0 + inset],
        [u0 + inset, y + h, v1 - inset],
        [-h, inset, 0],
      ],
    ];
    for (const [a, b, c, d, n] of sides) this.poly([a, b, c, d], n, `roof:${cover}`, this.c.roof);
    this.poly(
      [
        [u0 + inset, y + h, v0 + inset],
        [u1 - inset, y + h, v0 + inset],
        [u1 - inset, y + h, v1 - inset],
        [u0 + inset, y + h, v1 - inset],
      ],
      [0, 1, 0],
      "roof:membrane",
      "#55575a",
    );
    this.box(u0 - 0.15, y - 0.25, v0 - 0.15, u1 + 0.15, y, v1 + 0.15);
    this.L.snow.push({ t: "flat", ...this.rect(u0 + inset, v0 + inset, u1 - inset, v1 - inset), y: y + h, deep: 0.3 });
    this.solid("roof", u0 + inset, v0 + inset, u1 - inset, v1 - inset, y, y + h);
    return h;
  }
  /** a barrel roof along u (a railcar diner's) */
  barrel(u0: number, v0: number, u1: number, v1: number, y: number, rise: number, cover: Cover, over = 0.3) {
    const n = 8;
    const cm = (v0 + v1) / 2;
    const half = (v1 - v0) / 2 + over;
    const pt = (i: number): P2 => {
      const a = Math.PI * (i / n);
      return [cm - Math.cos(a) * half, y + Math.sin(a) * rise];
    };
    for (let i = 0; i < n; i++) {
      const [ca, ya] = pt(i);
      const [cb, yb] = pt(i + 1);
      this.poly(
        [
          [u0 - over, ya, ca],
          [u1 + over, ya, ca],
          [u1 + over, yb, cb],
          [u0 - over, yb, cb],
        ],
        [0, 1, (ca + cb) / 2 - cm],
        `roof:${cover}`,
        this.c.roof,
      );
    }
    for (const [u, su] of [
      [u0, -1],
      [u1, 1],
    ] as const) {
      const pts: V3[] = [];
      for (let i = 0; i <= n; i++) {
        const [c, yy] = pt(i);
        pts.push([u, yy, Math.min(Math.max(c, v0), v1)]);
      }
      this.poly(pts, [su, 0, 0], "paint", this.c.trim);
    }
    this.L.snow.push({ t: "flat", ...this.rect(u0, cm - half * 0.5, u1, cm + half * 0.5), y: y + rise, deep: 0.2 });
    this.roofSolid(u0, v0, u1, v1, true, [
      [v0, y],
      [cm, y + rise],
      [v1, y],
    ]);
  }
  /** a ring of soffit round a mass (a hip's overhang underside) */
  private flatRing(u0: number, v0: number, u1: number, v1: number, over: number, y: number, colour: string) {
    for (const [a, b, c, d] of [
      [u0 - over, v0 - over, u1 + over, v0],
      [u0 - over, v1, u1 + over, v1 + over],
      [u0 - over, v0, u0, v1],
      [u1, v0, u1 + over, v1],
    ])
      this.poly(
        [
          [a, y, b],
          [c, y, b],
          [c, y, d],
          [a, y, d],
        ],
        [0, -1, 0],
        "paint",
        colour,
      );
  }
  /** a roof's solid by its section across (local c: v when the ridge runs along u) */
  roofSolid(u0: number, v0: number, u1: number, v1: number, alongU: boolean, prof: P2[]) {
    const r = this.rect(u0, v0, u1, v1);
    // (local c → world: along v when alongU, else along u; flipped where the frame flips it)
    const alongX = alongU === this.uAlongX; // the ridge along world x
    const map = (c: number): number => {
      const [x, z] = alongU ? this.P(u0, c) : this.P(c, v0);
      return alongX ? z : x;
    };
    const wp = prof.map(([c, y]) => [map(c), y] as P2).sort((a, b) => a[0] - b[0]);
    this.L.solids.push({ what: "roof", steps: { ...r, alongX, prof: wp } });
  }
}

/** A colour darker (k < 1) or lighter. */
export function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Evenly spaced middles along a run from a to b, about `bay` apart (at least `min`). */
export function bays(a: number, b: number, bay: number, min = 1): number[] {
  const n = Math.max(min, Math.round((b - a) / bay));
  return Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);
}

// ── coplanar fights (plan 111 phase 2): two faces of a layout in one plane, facing the same way, overlapping — the
// depth test can't choose between them, so they flicker as the camera moves ──
/** A face of a layout: its points, its normal, what it's drawn in, where it came from. */
interface Face3 {
  pts: V3[];
  n: V3;
  look: string;
  from: string;
}
/** Every flat face a layout draws (its walls whole, without their openings; its polys; its boxes' six sides). */
export function layoutFaces(L: Layout): Face3[] {
  const out: Face3[] = [];
  L.walls.forEach((w, i) => {
    const L2 = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (L2 < 1e-3) return;
    const tx = (w.b[0] - w.a[0]) / L2;
    const tz = (w.b[1] - w.a[1]) / L2;
    const P = (s: number, y: number): V3 => [w.a[0] + tx * s, y, w.a[1] + tz * s];
    const top = w.top && w.top.length >= 2 ? w.top : [[0, w.y1] as P2, [L2, w.y1] as P2];
    const pts: V3[] = [P(0, w.y0), P(L2, w.y0)];
    for (let k = top.length - 1; k >= 0; k--) pts.push(P(top[k][0], top[k][1]));
    out.push({ pts, n: [w.o[0], 0, w.o[1]], look: `${w.mat}|${w.colour}`, from: `wall#${i}` });
  });
  L.polys.forEach((p, i) => {
    out.push({ pts: p.pts, n: p.n, look: `${p.mat}|${p.colour}`, from: `poly#${i}` });
  });
  L.boxes.forEach((b, i) => {
    const { x0, y0, z0, x1, y1, z1 } = b;
    const look = `${b.mat}|${b.colour}`;
    const f = (pts: V3[], n: V3, s: string) => out.push({ pts, n, look, from: `box#${i}.${s}` });
    f(
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [0, 1, 0],
      "top",
    );
    f(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      [0, -1, 0],
      "bottom",
    );
    f(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      [0, 0, -1],
      "-z",
    );
    f(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [0, 0, 1],
      "+z",
    );
    f(
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      [-1, 0, 0],
      "-x",
    );
    f(
      [
        [x1, y0, z0],
        [x1, y0, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
      [1, 0, 0],
      "+x",
    );
  });
  return out;
}
function norm3(n: V3): V3 {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}
/** A face's points in its plane's own 2D (u, v) and its plane's offset. */
function onPlane(pts: V3[], n: V3): { uv: P2[]; d: number } {
  const u: V3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : norm3([-n[2], 0, n[0]]);
  const v: V3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const d = pts.reduce((a, p) => a + p[0] * n[0] + p[1] * n[1] + p[2] * n[2], 0) / pts.length;
  return {
    uv: pts.map((p) => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]]),
    d,
  };
}
function area2(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}
/** Convex `subject` clipped by convex `clip` (Sutherland–Hodgman). */
function clipPoly(subject: P2[], clip: P2[]): P2[] {
  let out = subject;
  const ccw = area2(clip) > 0;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: P2) => {
      const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      return ccw ? c >= -1e-9 : c <= 1e-9;
    };
    const cut = (p: P2, q: P2): P2 => {
      const A1 = b[1] - a[1];
      const B1 = a[0] - b[0];
      const C1 = A1 * a[0] + B1 * a[1];
      const A2 = q[1] - p[1];
      const B2 = p[0] - q[0];
      const C2 = A2 * p[0] + B2 * p[1];
      const det = A1 * B2 - A2 * B1 || 1e-12;
      return [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
    };
    const inp = out;
    out = [];
    for (let k = 0; k < inp.length; k++) {
      const p = inp[k];
      const q = inp[(k + 1) % inp.length];
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cut(p, q));
    }
  }
  return out;
}
/** The pairs of a layout's faces that fight: one plane (within `tol` m), one way, overlapping by more than `minArea`
 *  m², drawn differently (two faces drawn alike look alike whichever wins). */
export function coplanarFights(
  L: Layout,
  tol = 0.002,
  minArea = 0.004,
): { a: string; b: string; area: number; at: V3 }[] {
  const fs = layoutFaces(L).map((f) => {
    const n = norm3(f.n);
    return { ...f, n, ...onPlane(f.pts, n) };
  });
  const out: { a: string; b: string; area: number; at: V3 }[] = [];
  for (let i = 0; i < fs.length; i++)
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i];
      const b = fs[j];
      if (a.look === b.look) continue;
      if (a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2] < 0.9999) continue;
      if (Math.abs(a.d - b.d) > tol) continue;
      const ov = clipPoly(a.uv, b.uv);
      const ar = ov.length >= 3 ? Math.abs(area2(ov)) : 0;
      if (ar > minArea) out.push({ a: a.from, b: b.from, area: +ar.toFixed(3), at: a.pts[0] });
    }
  return out;
}

/** How far a wall's drawn in from its line (m): what's put on it — a corner board, a trim, a part's edge in its
 *  plane — stands that far proud of it, and the walls still meet (each runs on past the other's face by as much). */
export const WALL_IN = 0.015;
/** How far a box that fights another face is grown on that face (m). */
const GROW = 0.012;
/** A layout's faces settled so none fight (plan 111 phase 2): its walls drawn `WALL_IN` in from their lines; then a
 *  box in one plane with another face is grown off it on that face (the smaller of two boxes; a box before a wall or
 *  a poly) until nothing fights. Only what's drawn moves: the solids are their own. */
export function settleFaces(L: Layout): void {
  for (const w of L.walls) {
    const dx = -w.o[0] * WALL_IN;
    const dz = -w.o[1] * WALL_IN;
    w.a = [w.a[0] + dx, w.a[1] + dz];
    w.b = [w.b[0] + dx, w.b[1] + dz];
  }
  const vol = (b: KBox) => (b.x1 - b.x0) * (b.y1 - b.y0) * (b.z1 - b.z0);
  const boxOf = (from: string): [number, string] | null => {
    const m = /^box#(\d+)\.(\S+)$/.exec(from);
    return m ? [Number(m[1]), m[2]] : null;
  };
  for (let round = 0; round < 8; round++) {
    const fights = coplanarFights(L);
    if (!fights.length) return;
    const grown = new Set<string>();
    for (const f of fights) {
      const a = boxOf(f.a);
      const b = boxOf(f.b);
      const pick = a && b ? (vol(L.boxes[a[0]]) <= vol(L.boxes[b[0]]) ? a : b) : (a ?? b);
      if (!pick) continue;
      const key = `${pick[0]}.${pick[1]}`;
      if (grown.has(key)) continue;
      grown.add(key);
      const bx = L.boxes[pick[0]];
      if (pick[1] === "top") bx.y1 += GROW;
      else if (pick[1] === "bottom") bx.y0 -= GROW;
      else if (pick[1] === "-z") bx.z0 -= GROW;
      else if (pick[1] === "+z") bx.z1 += GROW;
      else if (pick[1] === "-x") bx.x0 -= GROW;
      else if (pick[1] === "+x") bx.x1 += GROW;
    }
    if (!grown.size) return;
  }
}
