import type { AvatarLayers } from "@yutopia/shared";
import { type BufferGeometry, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import type { JointName } from "../rig";
import { arc, band, ellipsoid, lathe, lumpy, oval, type Prof, ribbon, sweepTube } from "../shapes";
import { type Body, creaseRing, LIMBS, lerp, limbFold, shapeOver, shell, taper } from "./body";
import { closedLimb, skirtSkin } from "./bottoms";

// Tops — every AvatarLayers top (`TOPS`; a dress's skirt is in bottoms.ts) and every layer over one
// (`OUTERS`), each a recipe for one builder. The chest is a shell over the trunk; collars, plackets,
// pockets and lapels are flat outlines laid onto it (`Body.onTrunk`), creases are drawn as lines.

export function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, "0")}`;
}
export function lum(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
}

// Every top and every layer over one is a recipe for one builder (`garment`): docs/plan/60.
export interface Garment {
  /** the hem, × the trunk's height up from its bottom; below 0, a coat's: × the leg, down it */
  hem: number;
  /** how far it stands off the skin (1.045 fitted) */
  kk?: number;
  /** the sleeves: 0 none, 0.42 short (× the upper arm), 1 to the wrist */
  sleeve?: number;
  /** the sleeves' looseness (1 fitted) */
  loose?: number;
  /** a long sleeve's cuff: a knit's ribbed band, or a turned cuff */
  knit?: boolean;
  /** a ribbed band at the hem */
  band?: boolean;
  /** round the neck: a ring (its thickness × hh), the trim's colour or its own */
  ring?: number;
  ringTrim?: boolean;
  /** collar tabs (their length × hh) */
  collar?: number;
  /** a turtleneck's roll, a puffer's stand */
  turtle?: boolean;
  stand?: boolean;
  /** a placket from (× T) down to (× T; 0 the hem), with its buttons (0: a zip) */
  front?: [number, number, number];
  /** open in a V down to (× T): what's under it shows; with lapels */
  v?: number;
  lapels?: boolean;
  /** pockets */
  pockets?: "chest" | "hip" | "kangaroo" | "flap";
  /** a hood down the back (its strings in front; fur round the neck) */
  hood?: boolean;
  strings?: boolean;
  fur?: boolean;
  /** a puffer's down, in bands this far apart (× T) */
  down?: number;
  /** a coat open at the front: the half-opening's angle */
  gap?: number;
  /** a tank's cut and straps; a dress (no hem line: its skirt runs on, bottoms.ts) */
  tank?: boolean;
  dress?: boolean;
  /** a jacket's front cut open in a V down to (× T), the top under it showing (a layer's) */
  vcut?: number;
  /** the hip pockets this high (× T); a welt pocket on the chest; suede patches on the elbows */
  pocketY?: number;
  breast?: boolean;
  patches?: boolean;
  /** a tie down the front, in the second colour */
  tie?: boolean;
  /** its pattern when none's chosen */
  pattern?: string;
}

export const TOPS: Record<string, Garment> = {
  tee: { hem: 0.31, sleeve: 0.42, ring: 0.022, ringTrim: true },
  tank: { hem: 0.31, tank: true },
  polo: { hem: 0.31, sleeve: 0.42, ring: 0.026, collar: 0.11, front: [0.96, 0.78, 2] },
  shirt: { hem: 0.31, sleeve: 1, ring: 0.026, collar: 0.13, front: [0.96, 0, 5] },
  sweater: { hem: 0.31, sleeve: 1, knit: true, band: true, ring: 0.05 },
  turtleneck: { hem: 0.31, sleeve: 1, knit: true, turtle: true },
  hoodie: {
    hem: 0.27,
    kk: 1.06,
    loose: 1.08,
    sleeve: 1,
    knit: true,
    band: true,
    ring: 0.05,
    pockets: "kangaroo",
    hood: true,
    strings: true,
  },
  jacket: {
    hem: 0.27,
    kk: 1.06,
    loose: 1.08,
    sleeve: 1,
    ring: 0.045,
    ringTrim: true,
    front: [0.97, 0, 0],
    pockets: "chest",
  },
  blazer: { hem: 0.2, kk: 1.06, loose: 1.08, sleeve: 1, v: 0.5, lapels: true, front: [0.5, 0, 1], pockets: "hip" },
  cardigan: { hem: 0.23, sleeve: 1, knit: true, band: true, v: 0.58, front: [0.58, 0, 3] },
  dress: { hem: 0.31, sleeve: 0.42, ring: 0.022, ringTrim: true, dress: true },
  puffer: { hem: 0.22, kk: 1.1, loose: 1.08, sleeve: 1, stand: true, front: [0.99, 0, 0], down: 0.12 },
  // the wardrobe's second set (docs/plan/60)
  longtee: { hem: 0.31, sleeve: 1, ring: 0.022, ringTrim: true },
  henley: { hem: 0.31, sleeve: 1, ring: 0.026, front: [0.96, 0.8, 3] },
  sweatshirt: { hem: 0.3, kk: 1.06, loose: 1.06, sleeve: 1, knit: true, band: true, ring: 0.055 },
  flannel: {
    hem: 0.27,
    kk: 1.06,
    loose: 1.06,
    sleeve: 1,
    ring: 0.026,
    collar: 0.13,
    front: [0.96, 0, 6],
    pockets: "chest",
  },
  crop: { hem: 0.54, sleeve: 0.42, ring: 0.022, ringTrim: true },
  fleece: { hem: 0.27, kk: 1.07, loose: 1.06, sleeve: 1, knit: true, band: true, stand: true, front: [0.99, 0.74, 0] },
  // a shirt buttoned to the collar and a tie (in the second colour)
  shirttie: { hem: 0.31, sleeve: 1, ring: 0.026, collar: 0.12, front: [0.96, 0, 5], tie: true },
};
/** The layers over a top (docs/plan/60): coats and jackets, built over it, bigger. */
export const OUTERS: Record<string, Garment> = {
  parka: {
    hem: -0.3,
    loose: 1.25,
    sleeve: 1,
    gap: 0.32,
    hood: true,
    fur: true,
    pockets: "flap",
    front: [0.98, 0.42, 0],
  },
  coat: { hem: -0.42, loose: 1.2, sleeve: 1, gap: 0.22, lapels: true, v: 0.6, front: [0.6, 0, 4], pockets: "flap" },
  puffer: { hem: 0.2, kk: 1.03, loose: 1.25, sleeve: 1, stand: true, front: [0.99, 0, 0], down: 0.12 },
  denim: { hem: 0.25, loose: 1.18, sleeve: 1, gap: 0.26, collar: 0.15, pockets: "chest", front: [0.95, 0.3, 0] },
  raincoat: { hem: -0.26, loose: 1.25, sleeve: 1, hood: true, front: [0.99, 0, 0], pockets: "flap" },
  vest: { hem: 0.24, kk: 1.03, stand: true, front: [0.99, 0, 0], down: 0.13 },
  // a sport coat: single-breasted, open in a V over what's under it, notched lapels, flap pockets
  // low and a welt on the chest, suede patches on the elbows, tweed unless chosen otherwise
  sportcoat: {
    hem: 0.05,
    loose: 1.2,
    sleeve: 1,
    vcut: 0.5,
    lapels: true,
    front: [0.5, 0, 2],
    pockets: "hip",
    pocketY: 0.2,
    breast: true,
    patches: true,
    pattern: "tweed",
  },
};
export const LONG_SLEEVES = new Set(Object.keys(TOPS).filter((k) => (TOPS[k].sleeve ?? 0) >= 1));

/** A garment's pattern (docs/plan/60): 0 none, then plaid, stripes, check, dots; "trim" puts the
 *  second colour on its trims instead (collar, cuffs, bands, pockets, zip). */
export const PATTERNS: Record<string, number> = { plaid: 1, stripes: 2, check: 3, dots: 4, tweed: 5 };

export function buildTop(k: Kit, b: Body, a: AvatarLayers) {
  const m = a as unknown as Record<string, string | undefined>;
  const g = TOPS[a.top] ?? TOPS.tee;
  // (what a layer over it hides isn't built: under a closed one, the top's chest — 1; under one with
  // sleeves, its sleeves and hood — 2)
  const L = OUTERS[m.outer ?? ""];
  const under = (L && !L.gap && !L.vcut ? 1 : 0) | ((L?.sleeve ?? 0) > 0 ? 2 : 0);
  dressed(k, b, g, a.topColor, m.topPattern, m.topColor2, 0, under);
}

/** The layer over the top, if any. */
export function buildOuter(k: Kit, b: Body, a: AvatarLayers) {
  const m = a as unknown as Record<string, string | undefined>;
  const g = OUTERS[m.outer ?? ""];
  if (g) dressed(k, b, g, m.outerColor ?? "#4f6b5a", m.outerPattern, m.outerColor2, 1, 0);
}

// a garment in its colour, then its pattern laid over that colour (or its trims in the second)
function dressed(
  k: Kit,
  b: Body,
  g: Garment,
  c: string,
  pattern: string | undefined,
  c2: string | undefined,
  over: number,
  under: number,
) {
  const first = k.parts.length;
  if (!pattern || pattern === "none") pattern = g.pattern;
  const trim = pattern === "trim" && c2 ? c2 : null;
  garment(k, b, g, c, trim, over, under, c2 ?? shade(c, 0.45));
  const kind = PATTERNS[pattern ?? ""] ?? 0;
  if (kind) for (const q of k.parts.slice(first)) if (q.color === c) q.pattern = [kind, c2 ?? shade(c, 0.55)];
}

function garment(
  k: Kit,
  b: Body,
  g: Garment,
  c: string,
  trim: string | null,
  over: number,
  under: number,
  second: string,
) {
  const bodyFrom = k.parts.length;
  const dark = shade(c, 0.82);
  const inner = lum(c) > 0.62 ? "#2a2a3a" : "#f4ece0"; // what shows in an open front
  const R = k.seg.radial;
  const T = b.T;
  const hh = b.hh;
  const fine = k.seg.radial >= 16; // buttons and the like only close up
  const near = k.seg.radial > 16; // seams and folds the nearest level only
  const toSpine = (geo: BufferGeometry) => geo.translate(0, -b.spineY, 0);
  // (a layer stands clear of the top under it, its hem and all: or they come through)
  const KK = (g.kk ?? 1.045) + 0.125 * over;
  const tr = (d: string) => trim ?? d;
  const tank = !!g.tank;
  const long = (g.sleeve ?? 0) >= 1;
  const loose = g.loose ?? 1;
  const gap = g.gap ?? 0;
  const sweep = gap ? ([gap, Math.PI * 2 - 2 * gap] as const) : ([0, Math.PI * 2] as const);

  // ── the chest: its hem rolled out over the seat (a coat's: on, down the legs) ──
  const coat = g.hem < 0;
  const s0 = coat ? 0.38 * T : g.hem * T;
  const r0 = b.trunk.r(s0);
  const topY = tank ? 0.66 * T : T;
  const pts: Prof[] = coat
    ? [[r0 * KK * 0.98, s0 - 0.02 * T], ...b.around(KK, s0, topY * 0.99), [b.trunk.r(T * 0.99) * 0.9, T]]
    : [
        [r0 * 0.9, s0 - 0.012 * T],
        [r0 * (KK + 0.015), s0 - 0.006 * T],
        [r0 * (KK + 0.03), s0 + 0.02 * T],
        ...b.around(KK, s0 + 0.04 * T, topY),
      ];
  if (tank) {
    // (its lower half: closed in towards the body, inside the skin)
    const rt = b.trunk.r(topY) * KK;
    pts.push([rt * 0.97, topY + 0.004 * T], [0, topY + 0.004 * T]);
  }
  // (a V cut down the front to `vcut`: the chest as a cover whose top edge comes down there, the top
  // under it showing; its half-width at the neck `vHalf`, radians round from the front)
  const vHalf = 0.42;
  if (g.vcut) {
    const vY = g.vcut * T;
    k.add(
      "spine",
      toSpine(
        b.cover(
          s0,
          (phi) => {
            const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
            return a < vHalf ? lerp(vY, T * 0.975, (a / vHalf) ** 1.15) : T * 0.985;
          },
          KK,
        ),
      ),
      c,
    );
    // (its hem rolled, as a lathe's would be)
    k.add("spine", toSpine(b.ring(s0 + 0.01 * T, KK + 0.01, 0.014 * hh)), c);
  } else k.add("spine", toSpine(b.squash(lathe(pts, R, ...sweep), 0, !over)), c);
  if (coat) {
    // the skirt of a coat, down the legs: its front rides the thighs, its hem on the skirt's spring
    const hem = g.hem * b.legLen;
    const hipR = k.p.torso.hip * hh * (1 + 0.1 * over);
    const low: Prof[] = [
      [hipR * 1.42, hem],
      [hipR * 1.4, hem * 0.5],
      [b.trunk.r(0.12 * T) * KK * 1.04, 0.1 * T],
      ...b.around(KK, 0.18 * T, 0.5 * T),
    ];
    const lowPts: Prof[] = [
      [low[0][0] * 0.97, hem + 0.02 * hh],
      ...arc(low[0][0] - 0.012 * hh, hem + 0.012 * hh, 0.012 * hh, Math.PI, Math.PI * 2, 3).map(
        ([x, y]): Prof => [x, y],
      ),
      ...low,
    ];
    const hip = b.hipY - b.torsoBot;
    k.add("hips", b.squash(lathe(lowPts, R, ...sweep), 0, false), c, { skin: skirtSkin(hip, hem, hipR * 1.4) });
    k.spring("skirt", [0, hip, 0], [0, hem - hip, 0], { hz: 3.2, damp: 0.5, limit: 0.25 });
  }
  if (tank)
    // its upper half: a scooped neck in front, cut away under the arms, higher at the back
    k.add(
      "spine",
      toSpine(
        b.cover(
          0.62 * T,
          (phi) => {
            const cf = Math.cos(phi);
            const sides = Math.abs(Math.sin(phi)) ** 3;
            return T * (cf >= 0 ? lerp(0.86, 0.72, sides) - 0.04 * cf ** 8 : lerp(0.88, 0.72, sides));
          },
          KK,
        ),
      ),
      c,
    );
  // the hem as a line (a dress runs on into its skirt: no line), a knit's ribbed band
  if (!g.dress && !coat && !gap) k.crease("spine", toSpine(b.squash(creaseRing(r0 * (KK + 0.025), s0, R))));
  if (g.band) k.add("spine", toSpine(b.ring(s0 + 0.02 * T, KK + 0.02, 0.022 * hh)), tr(c));
  // (a coat's front edges: a tape each side)
  if (gap)
    for (const sx of [1, -1] as const) {
      const edge: Vector3[] = [];
      for (let i = 0; i <= 12; i++) edge.push(b.around3(lerp(s0 + 0.04 * T, T * 0.98, i / 12), sx * gap, KK + 0.005));
      k.add("spine", toSpine(sweepTube(edge, () => [0.02 * hh, 0.012 * hh], { segs: 16, radial: 4 })), tr(dark), {
        keepNormals: true,
      });
    }
  // seams (`folds`, close up only; lines, no body): down each side a little behind it and on
  // over the shoulder to the neck; a hem's stitching just above it (not a knit's band)
  // (under a layer: no seams, folds or sleeves — the coat hides them all)
  const seams = k.p.folds > 0 && near && !under;
  if (seams && !tank) {
    for (const s of [1, -1] as const) {
      const line: Vector3[] = [];
      for (let i = 0; i <= 14; i++)
        line.push(b.around3(lerp(s0 + 0.03 * T, 0.975 * T, i / 14), s * (Math.PI / 2 + 0.14), KK + 0.006));
      k.crease("spine", toSpine(sweepTube(line, () => [1e-4, 1e-4], { segs: 28, radial: 4 })));
    }
    if (!g.band && !g.dress && !coat && !gap) {
      const y = s0 + 0.035 * T;
      k.crease("spine", toSpine(b.squash(creaseRing(b.trunk.r(y) * (KK + 0.012), y, R))));
    }
  }

  // ── round the neck ──
  // (sized to the neck's root: with the trapezius it spreads there, and a neckline sized to the neck
  // itself sinks inside it — the crew ring, the collar's tabs, a turtleneck's foot)
  const nr0 = k.p.neck.r * hh;
  const trap = k.p.torso.trap;
  const nr = nr0 * lerp(1, 1.3 / 1.05, trap) * (1 + 0.12 * over);
  // (with the trapezius, the trunk's top round the neck is steep: a ring as wide as the neck sinks
  // under the top's own surface, so it's put at least just outside that)
  const neckRing = (t: number, color: string, y = T * 0.975) => {
    const r = nr * 1.08 + t * 0.7;
    const ring = trap > 0 ? Math.max(r, b.trunk.r(y) * (KK + 0.01) + t * 0.3) : r;
    k.add("spine", toSpine(b.squash(lathe(arc(ring, y, t, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R))), color);
  };
  const placket = (from: number, to: number, buttons: number) => {
    const line: Vector3[] = [];
    for (let i = 0; i <= 8; i++) line.push(b.surf(0, lerp(from, to, i / 8), KK + 0.004));
    k.crease("spine", toSpine(sweepTube(line, () => [1e-4, 1e-4], { segs: 8, radial: 4 })));
    if (fine)
      for (let i = 0; i < buttons; i++) {
        const y = lerp(from, to, (i + 0.5) / buttons);
        const at = b.surf(hh * 0.035, y, KK + 0.004);
        k.add(
          "spine",
          toSpine(ellipsoid(0.016 * hh, 0.016 * hh, 0.008 * hh, 10, 3).translate(at.x, at.y, at.z)),
          inner,
        );
      }
  };
  const flat = (
    shape: Shape,
    color: string,
    o: { depth: number; bevel: number; lift: number; kk?: number; side?: 1 | -1 },
  ) => k.add("spine", toSpine(b.onTrunk(shape, { ...o, kk: o.kk ?? KK })), color);
  if (g.ring) neckRing(g.ring * hh, g.ringTrim ? tr(dark) : tr(c));
  if (g.collar) {
    // two pointed tabs lying on the chest either side of the neck (with the trapezius, a little
    // lower: the top round the neck is steep and narrow there, and squeezes them flat)
    const top = T * (0.985 - 0.035 * trap);
    const len = g.collar * hh;
    for (const side of [1, -1] as const) {
      const s = new Shape();
      const x0 = side * nr * (gap ? 0.75 : 0.2);
      s.moveTo(x0, top);
      s.lineTo(side * nr * 1.35, top - 0.01 * T);
      s.quadraticCurveTo(side * nr * 1.4, top - 0.035 * T, side * nr * (gap ? 1.2 : 0.9), top - len);
      s.lineTo(x0, top - len * 0.35);
      s.closePath();
      flat(s, tr(c), { depth: 0.004 * hh, bevel: 0.003 * hh, kk: KK + 0.012, lift: 0.002 * hh });
    }
  }
  if (g.turtle) {
    // a rolled tube up the neck: its foot round the neck's root, its roll round the neck (it rides
    // the neck: the neck joint sits at the trunk's top)
    const y0 = T * 0.93;
    const h = (b.chinY - b.neckBase) * 0.75 + (T - y0);
    const r = nr * 1.22;
    const rt = nr0 * 1.22;
    const prof: Prof[] = [
      [r * 0.95, y0],
      [r * 1.04, y0 + h * 0.15],
      [rt, y0 + h * 0.85],
      ...arc(rt - nr0 * 0.1, y0 + h, nr0 * 0.14, 0, Math.PI, k.seg.ring).map(([x, y]): Prof => [x, y]),
      [nr0 * 0.95, y0 + h * 0.9],
    ];
    k.add("neck", lathe(prof, R).translate(0, -T, 0), tr(c));
  }
  if (g.stand) {
    neckRing(0.06 * hh, tr(c), T * 0.985);
    neckRing(0.05 * hh, tr(c), T * 1.02);
  }
  if (g.vcut && g.lapels) {
    // notched lapels along the V's edges, from the neck down to where it closes, a crease where
    // each rolls
    const vY = g.vcut * T;
    for (const side of [1, -1] as const) {
      const top = b.around3(T * 0.955, side * vHalf, KK);
      const w = Math.abs(top.x);
      const l = new Shape();
      l.moveTo(side * w * 0.9, T * 0.965);
      l.lineTo(side * w * 1.55, T * 0.935);
      l.lineTo(side * w * 1.42, T * 0.875);
      l.lineTo(side * w * 1.72, T * 0.86);
      l.lineTo(side * w * 0.2, vY + 0.01 * T);
      l.lineTo(side * w * 0.06, vY + 0.03 * T);
      l.closePath();
      flat(l, tr(c), { depth: 0.006 * hh, bevel: 0.004 * hh, lift: 0.004 * hh, kk: KK + 0.01 });
    }
  }
  if (g.tie) tie(k, b, second, KK + 0.03);
  if (g.breast && k.seg.radial >= 16) {
    // the welt on the left chest
    const y = 0.74 * T;
    const x = b.trunk.r(y) * 0.48;
    const s = new Shape();
    s.moveTo(x - 0.075 * hh, y);
    s.lineTo(x + 0.075 * hh, y + 0.008 * hh);
    s.lineTo(x + 0.075 * hh, y - 0.022 * hh);
    s.lineTo(x - 0.075 * hh, y - 0.03 * hh);
    s.closePath();
    flat(s, tr(dark), { depth: 0.003 * hh, bevel: 0.002 * hh, lift: 0.003 * hh, kk: KK + 0.01 });
  }
  if (g.v) {
    // open at the front in a V: the shirt underneath, lapels or a button band
    const vY = g.v * T;
    const w = nr * 1.3;
    const v = new Shape();
    // (from just below the top of the trunk, where it rounds into the neck)
    v.moveTo(-w, T * 0.965);
    v.lineTo(w, T * 0.965);
    v.lineTo(0, vY);
    v.closePath();
    if (!gap) flat(v, inner, { depth: 0.002 * hh, bevel: 0.0015 * hh, lift: 0.009 * hh });
    if (g.lapels)
      for (const side of [1, -1] as const) {
        const l = new Shape();
        l.moveTo(side * w * 0.96, T * 0.962);
        l.lineTo(side * w * 1.55, T * 0.94);
        l.lineTo(side * w * 1.25, T * 0.83);
        l.lineTo(side * w * 0.12, vY + 0.02 * T);
        l.closePath();
        flat(l, tr(c), { depth: 0.004 * hh, bevel: 0.003 * hh, lift: 0.014 * hh });
      }
  }
  if (g.front) placket(g.front[0] * T, g.front[1] ? g.front[1] * T : s0 + 0.02 * T, g.front[2]);
  // (a band of down a few faces round: many of them)
  if (g.down)
    for (let y = s0 + 0.1 * T; y < 0.9 * T; y += g.down * T)
      k.add("spine", toSpine(b.ring(y, KK + 0.004, 0.026 * hh, 4)), c);
  // pockets: two on the chest with flaps; two flaps at the hips; a kangaroo's, its openings curved
  if (g.pockets === "chest" || g.pockets === "hip" || g.pockets === "flap")
    for (const side of [1, -1] as const) {
      const chest = g.pockets === "chest";
      const y = chest ? 0.74 * T : (g.pocketY ?? (g.pockets === "hip" ? 0.33 : coat ? 0.3 : (s0 + 0.12 * T) / T)) * T;
      const x = side * b.trunk.r(y) * (chest ? 0.45 : g.pockets === "hip" ? 0.55 : 0.74);
      const w = (chest ? 0.07 : 0.085) * hh;
      const s = new Shape();
      s.moveTo(x - w, y);
      s.lineTo(x + w, y);
      s.lineTo(x + w * 0.94, y - 0.05 * T);
      s.lineTo(x - w * 0.94, y - 0.05 * T);
      s.closePath();
      flat(s, tr(g.pockets === "flap" ? dark : c), {
        depth: 0.004 * hh,
        bevel: 0.003 * hh,
        lift: 0.003 * hh,
        kk: KK + 0.01,
      });
    }
  if (g.pockets === "kangaroo") {
    const p = new Shape();
    const w = b.trunk.r(0.42 * T) * 0.55;
    const r = 0.03 * T;
    p.moveTo(-w + r, 0.33 * T);
    p.lineTo(w - r, 0.33 * T);
    p.quadraticCurveTo(w, 0.33 * T, w, 0.33 * T + r);
    p.quadraticCurveTo(w * 0.62, 0.4 * T, w * 0.66, 0.5 * T);
    p.lineTo(-w * 0.66, 0.5 * T);
    p.quadraticCurveTo(-w * 0.62, 0.4 * T, -w, 0.33 * T + r);
    p.quadraticCurveTo(-w, 0.33 * T, -w + r, 0.33 * T);
    p.closePath();
    flat(p, tr(c), { depth: 0.006 * hh, bevel: 0.004 * hh, lift: 0.003 * hh });
  }
  // the hood down the back, a thick roll round the neck's back and sides (fur instead, on a parka);
  // its strings in front — none under a layer: they'd come through it, and it has its own
  // (its chest, built to here: under a closed layer, gone)
  if (under & 1) k.parts.splice(bodyFrom);
  if (g.hood && !(under & 2)) {
    const hw = b.trunk.r(0.8 * T) * (over ? 0.66 : 0.62);
    const top = T * 0.955;
    const bot = T * (over ? 0.62 : 0.64);
    const h = new Shape();
    h.moveTo(-hw, top);
    h.bezierCurveTo(-hw * 1.15, T * 0.82, -hw * 0.55, bot, 0, bot);
    h.bezierCurveTo(hw * 0.55, bot, hw * 1.15, T * 0.82, hw, top);
    h.closePath();
    flat(h, c, {
      depth: (0.05 + 0.01 * over) * hh,
      bevel: (0.035 + 0.005 * over) * hh,
      kk: KK + 0.01,
      lift: 0.004 * hh,
      side: -1,
    });
    k.crease(
      "spine",
      toSpine(
        sweepTube(
          [0.97, 0.88, 0.78, 0.7].map((u) => b.surf(0, T * u, KK + 0.11, -1)),
          () => [1e-4, 1e-4],
          { segs: 8, radial: 4 },
        ),
      ),
    );
    if (g.fur) {
      const fur = lathe(arc(nr * 1.3, T * 0.975, 0.07 * hh, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R);
      k.add("spine", toSpine(b.squash(lumpy(fur, 0.016 * hh, 26 / hh, 7), 0, false)), "#e9dfc9");
    } else {
      const hood: Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const phi = lerp(0.62, -0.62, i / 8) + Math.PI;
        const y = T * (0.94 - 0.05 * Math.cos(((i - 4) / 4) * (Math.PI / 2)));
        // (not inside the neck's root, where the trapezius draws the trunk in)
        const r = Math.max(b.trunk.r(y) * (KK + 0.06), nr * 1.75);
        hood.push(new Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r * b.depthAt(y)));
      }
      k.add(
        "spine",
        toSpine(
          sweepTube(
            hood,
            (u) => {
              const s = Math.sqrt(Math.sin(Math.PI * u)) * 1.35;
              return [0.075 * hh * s, 0.06 * hh * s];
            },
            { segs: k.seg.tube, radial: k.seg.tubeRadial },
          ),
        ),
        tr(c),
        { keepNormals: true },
      );
    }
    if (g.strings && !(under & 1))
      for (const side of [1, -1] as const) {
        // (down the chest's own surface, not straight across it: a fuller chest swallowed the middle)
        const along = [0, 0.33, 0.67, 1].map((u) =>
          b.surf(side * nr * lerp(0.5, 0.55, u), T * lerp(0.95, 0.8, u), KK + 0.03 + 0.012 * Math.sin(Math.PI * u)),
        );
        k.add(
          "spine",
          toSpine(
            sweepTube(along, () => [0.01 * hh, 0.01 * hh], {
              segs: Math.max(4, k.seg.tube / 3),
              radial: Math.max(4, k.seg.tubeRadial - 2),
            }),
          ),
          inner,
          { keepNormals: true },
        );
      }
  }
  if (tank && !(under & 1))
    // straps over the shoulders, from the neckline in front to the back
    for (const side of [1, -1] as const) {
      const x = side * b.trunk.r(0.84 * T) * 0.45;
      let yTop = 0.84 * T;
      while (yTop < T && b.trunk.r(yTop) > Math.abs(x)) yTop += T * 0.01;
      const strap = [
        b.surf(x, 0.8 * T, KK, 1),
        b.surf(x, lerp(0.86 * T, yTop, 0.6), KK + 0.01, 1),
        new Vector3(x, yTop + 0.012 * hh, 0),
        b.surf(x, lerp(0.86 * T, yTop, 0.6), KK + 0.01, -1),
        b.surf(x, 0.82 * T, KK, -1),
      ];
      k.add(
        "spine",
        toSpine(
          sweepTube(strap, () => [0.045 * hh, 0.012 * hh], {
            segs: k.seg.tube,
            radial: Math.max(4, k.seg.tubeRadial - 2),
            up: (q) => new Vector3(q.x, 0, q.z).normalize(),
          }),
        ),
        c,
        { keepNormals: true },
      );
    }

  // ── folds: inked creases sweeping in from under each arm, one pulled at the waist, one behind
  // (the nearest level of detail only) ──
  const folds = k.p.folds > 0 && near && !over && !under;
  if (folds && !tank) {
    const rc = b.trunk.r(0.7 * T);
    const crease = (p: [number, number][], wd: number, side: 1 | -1 = 1) =>
      k.add(
        "spine",
        toSpine(b.lay(ribbon(p, taper(wd * hh * k.p.folds)), { kk: KK, lift: 0.004 * hh, side })),
        k.p.ink,
        { ink: 0 },
      );
    for (const s of [1, -1] as const) {
      crease(
        [
          [s * 0.9 * rc, 0.78 * T],
          [s * 0.74 * rc, 0.715 * T],
          [s * 0.52 * rc, 0.69 * T],
        ],
        0.008,
      );
      crease(
        [
          [s * 0.92 * rc, 0.68 * T],
          [s * 0.82 * rc, 0.635 * T],
          [s * 0.68 * rc, 0.62 * T],
        ],
        0.006,
      );
      crease(
        [
          [s * 0.5 * rc, 0.6 * T],
          [s * 0.38 * rc, 0.54 * T],
          [s * 0.3 * rc, 0.48 * T],
        ],
        0.005,
        -1,
      );
    }
    // (the waist's pull on one side only: two alike look drawn by a machine)
    if (!g.v)
      crease(
        [
          [0.4 * rc, s0 + 0.04 * T],
          [0.33 * rc, s0 + 0.1 * T],
          [0.3 * rc, s0 + 0.15 * T],
        ],
        0.005,
      );
  }

  // ── sleeves ──
  if (!g.sleeve || under & 2) return;
  const big = 1 + 0.25 * over; // (a layer's over the top's)
  for (const side of ["L", "R"] as const) {
    // (`anatomy`: the arm's shape shows through, less in a loose one, none in a layer)
    const sx = side === "L" ? 1 : -1;
    const fit = over ? 0 : k.p.anatomy * (loose > 1 ? 0.3 : 0.55);
    const upLen = long ? b.upper : b.upper * (g.sleeve ?? 0.42);
    // (a long sleeve's upper half closed and round at the elbow, meeting the forearm's: no step)
    k.add(
      `shoulder${side}`,
      shapeOver(
        over || long
          ? closedLimb(upLen, b.uR * 1.28 * loose * big, b.fR * 1.3 * loose * big, b.uR * 0.08, R, k.seg.ring)
          : shell(upLen, b.uR * 1.28 * loose, b.uR * 0.96, R, k.seg.ring),
        b.upper,
        sx,
        LIMBS.upper,
        fit,
      ),
      c,
    );
    if (g.collar && !long && g.front) k.crease(`shoulder${side}`, creaseRing(b.uR * 1.27, -b.upper * 0.3, R));
    // (a short sleeve's hem stitched, shaped as the sleeve is)
    else if (seams && !long)
      k.crease(
        `shoulder${side}`,
        shapeOver(creaseRing(b.uR * 1.28 * loose * 1.03, -upLen * 0.8, R), b.upper, sx, LIMBS.upper, fit),
      );
    // (folds: from the armpit down a short sleeve; in the crook of the elbow and bunched at the
    // cuff on a long one)
    const fold = (joint: JointName, p: [number, number][], wd: number, r: number) =>
      k.add(
        joint,
        limbFold(k, p, wd, () => r, sx),
        k.p.ink,
        { ink: 0 },
      );
    if (folds) {
      const ru = b.uR * 1.3 * loose;
      if (!long) {
        fold(
          `shoulder${side}`,
          [
            [-1.25, -upLen * 0.22],
            [-0.95, -upLen * 0.42],
            [-0.7, -upLen * 0.55],
          ],
          0.006,
          ru,
        );
        fold(
          `shoulder${side}`,
          [
            [-1.05, -upLen * 0.55],
            [-0.85, -upLen * 0.7],
          ],
          0.004,
          ru,
        );
      } else {
        const u = b.upper;
        fold(
          `shoulder${side}`,
          [
            [-1.0, -u * 0.8],
            [-0.55, -u * 0.9],
            [-0.15, -u * 0.86],
          ],
          0.007,
          ru,
        );
        fold(
          `shoulder${side}`,
          [
            [-0.85, -u * 0.68],
            [-0.5, -u * 0.74],
          ],
          0.005,
          ru,
        );
        const f = b.fore - b.wR * 0.2;
        const rf = b.fR * 1.33 * loose;
        fold(
          `elbow${side}`,
          [
            [-0.9, -f * 0.12],
            [-0.5, -f * 0.2],
          ],
          0.005,
          rf,
        );
        fold(
          `elbow${side}`,
          [
            [0.15, -f * 0.76],
            [0.5, -f * 0.83],
            [0.85, -f * 0.78],
          ],
          0.005,
          rf * 0.92,
        );
        fold(
          `elbow${side}`,
          [
            [-0.3, -f * 0.7],
            [-0.65, -f * 0.78],
          ],
          0.004,
          rf * 0.94,
        );
      }
    }
    if (!long) continue;
    // the forearm's sleeve tapered to the wrist, and a cuff on it: a knit's ribbed band, a turned one
    const len = b.fore - b.wR * 0.15;
    k.add(
      `elbow${side}`,
      shapeOver(
        // (tapered to the wrist: a loose sleeve is loose at the elbow, not at the cuff)
        closedLimb(len, b.fR * 1.3 * loose * big, b.wR * 1.32 * Math.sqrt(loose * big), b.fR * 0.06, R, k.seg.ring),
        b.fore,
        sx,
        LIMBS.fore,
        fit,
      ),
      c,
    );
    // (suede patches over the elbows: ovals stood out of the sleeve's back, darker)
    if (g.patches && k.seg.radial > 16) {
      const r = b.fR * 1.3 * loose * big;
      k.add(
        `elbow${side}`,
        ellipsoid(0.075 * hh, 0.12 * hh, 0.03 * hh, Math.max(10, R / 2), k.seg.ring * 2),
        shade(c, 0.62),
        {
          at: new Vector3(0, -0.06 * hh, -r + 0.012 * hh),
        },
      );
    }
    // (the cuff only where it can be seen: not at the farthest level)
    if (k.seg.radial <= 9) continue;
    const cuffH = (g.knit ? 0.09 : 0.06) * hh;
    const cr = b.wR * (g.knit ? 1.24 : 1.36) * Math.sqrt(loose * big);
    k.add(
      `elbow${side}`,
      lathe(
        [
          [cr * 0.96, -len],
          ...arc(cr - cuffH * 0.18, -len + cuffH * 0.18, cuffH * 0.18, -Math.PI / 2, 0, 3),
          [cr, -len + cuffH * 0.8],
          ...arc(cr - cuffH * 0.2, -len + cuffH * 0.8, cuffH * 0.2, 0, Math.PI / 2, 3),
          [cr * 0.9, -len + cuffH],
        ],
        R,
      ),
      tr(g.knit ? c : shade(c, 0.94)),
    );
    if (seams) k.crease(`elbow${side}`, creaseRing(cr * 1.01, -len + cuffH * 1.02, R));
  }
}

/** A tie from the collar down the front, `kk` off the skin: its knot, its blade, pointed. */
export function tie(k: Kit, b: Body, color: string, kk: number) {
  const T = b.T;
  const hh = b.hh;
  const kw = 0.04 * hh;
  const knot = new Shape();
  knot.moveTo(-kw, T * 0.965);
  knot.lineTo(kw, T * 0.965);
  knot.lineTo(kw * 0.6, T * 0.92);
  knot.lineTo(-kw * 0.6, T * 0.92);
  knot.closePath();
  const at = (s: Shape, depth: number, lift: number) =>
    b.onTrunk(s, { depth: depth * hh, bevel: depth * 0.5 * hh, kk, lift: lift * hh }).translate(0, -b.spineY, 0);
  k.add("spine", at(knot, 0.012, 0.006), shade(color, 0.88));
  const blade = new Shape();
  blade.moveTo(-kw * 0.6, T * 0.925);
  blade.lineTo(kw * 0.6, T * 0.925);
  blade.lineTo(kw * 1.5, T * 0.5);
  blade.lineTo(0, T * 0.45);
  blade.lineTo(-kw * 1.5, T * 0.5);
  blade.closePath();
  k.add("spine", at(blade, 0.006, 0.005), color);
}

/** A short band laid on the chest (used for a scarf's tails). */
export function chestBand(b: Body, pts: [number, number][], width: number, kk: number) {
  return b.onTrunk(band(pts, width, 16), { depth: 0.01 * b.hh, bevel: 0.006 * b.hh, kk, lift: 0.004 * b.hh });
}

/** A round thing laid on the chest (a pendant). */
export function chestDot(b: Body, x: number, y: number, r: number, kk: number) {
  return b.onTrunk(oval(x, y, r, r), { depth: 0.004 * b.hh, bevel: 0.003 * b.hh, kk, lift: 0.004 * b.hh });
}
