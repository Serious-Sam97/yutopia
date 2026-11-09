import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import {
  ball,
  box,
  cushion,
  cyl,
  extrude,
  type LiveAnim,
  type Look,
  lathe,
  type Model,
  merged,
  type PartOpts,
  rod,
  roundRect,
  taper,
  tube,
  type V3,
  wrap,
} from "../kit";
import { finishes } from "../life-mats";
import { P, shade } from "../palette";

// Plan 68 phase 3 (docs/plan/68-more-furniture.md): Seating — the new kinds' models, in the kit's frame
// (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/seating2.ts. A seat faces +z (rot 0); its sitter is
// put on it as shared SEATS has it (the cushion's top, its front edge, its back's face). What moves:
// the egg chair swivels and the rocking chair rocks while they're sat in (`o.occupied`), the hanging
// chair and the hammock sway always — gently, less with someone in them (live parts, `nod`).

export const LOOKS: Record<string, readonly string[]> = {
  egg_chair: ["White and teal egg", "Wicker egg", "Leather egg"],
  rocking_chair: ["Oak Windsor rocker", "White porch rocker", "Walnut rocker"],
  hanging_chair: ["Rattan bubble chair", "Macramé swing chair"],
  gaming_chair: ["Red gaming chair", "Black gaming chair", "White gaming chair"],
  window_seat: ["Painted window seat", "Oak window seat"],
  corner_sofa: ["Three-seat corner", "Chesterfield corner", "Mid-century corner"],
  floor_cushions: ["Floor cushions", "Knitted poufs"],
  bleachers: ["Timber bleachers", "Steel bleachers"],
  hammock: ["Canvas hammock", "Striped hammock"],
};

const C = {
  rattan: 0xc49a5c,
  rattanDark: 0x8e6a3e,
  teal: 0x2f7d78,
  shell: 0xeeebe4,
  cord: 0xe8dcc2,
  cordDark: 0xcdbd9c,
  red: 0xb8282c,
  redDark: 0x7e1c1f,
  galv: 0xa7adb0,
  plank: 0xb98955,
  brick: 0x9c3b30,
  sage: 0x8fa58a,
  gold: 0xd8a640,
};
// (plan 73 phase 6.1: what the finishes are in the life look)
finishes([
  [C.teal, "twill"],
  [C.shell, "gloss"],
  [C.cord, "boucle"],
  [C.cordDark, "boucle"],
  [C.red, "leather"],
  [C.redDark, "leather"],
  [C.galv, "metal-brushed"],
  [C.plank, "pine"],
  [C.brick, "linen"],
  [C.sage, "linen"],
  [0xb07a46, "oak"],
  [0xe4d7ba, "linen"],
  [0x4f7f9a, "linen"],
]);

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

const M4 = new Matrix4();
const EU = new Euler();
const QU = new Quaternion();

/** A part placed as Model.add places it (its own turn, then where it goes), positions only. */
function placed(g: BufferGeometry, o: PartOpts = {}): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const k of Object.keys(geo.attributes)) if (k !== "position") geo.deleteAttribute(k);
  EU.set(...(o.rot ?? [0, 0, 0]), "YXZ");
  QU.setFromEuler(EU);
  M4.compose(new Vector3(...(o.at ?? [0, 0, 0])), QU, new Vector3(...(o.scale ?? [1, 1, 1])));
  return geo.applyMatrix4(M4);
}

/** Parts that go together: tipped as one about a pivot (a chair's leant back), and either put in the
 *  model as they are or made live, moving together (one live part a colour, so one draw each). */
export class Rig {
  private parts: { g: BufferGeometry; c: number; glow: boolean }[] = [];
  constructor(readonly mat: Matrix4 | null = null) {}
  add(g: BufferGeometry, c: number, o: PartOpts = {}): this {
    const geo = placed(g, o);
    if (this.mat) geo.applyMatrix4(this.mat);
    this.parts.push({ g: geo, c: o.tone ? shade(c, o.tone) : c, glow: !!o.glow });
    return this;
  }
  /** into the model, still */
  still(m: { add(g: BufferGeometry, c: number, o?: PartOpts): unknown }): void {
    for (const p of this.parts) m.add(p.g, p.c, { glow: p.glow });
    this.parts = [];
  }
  /** live: nodding round `axis` through `pivot` (the model's frame) */
  live(m: Model, pivot: V3, axis: "x" | "y" | "z", anim: LiveAnim): void {
    const by = new Map<string, { c: number; glow: boolean; gs: BufferGeometry[] }>();
    for (const p of this.parts) {
      const k = `${p.c}|${p.glow}`;
      const e = by.get(k) ?? { c: p.c, glow: p.glow, gs: [] };
      e.gs.push(p.g);
      by.set(k, e);
    }
    // (the nod turns round the part's own z: built turned so that z is the axis wanted)
    const rot: V3 = axis === "x" ? [0, Math.PI / 2, 0] : axis === "y" ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
    for (const { c, glow, gs } of by.values()) {
      const g = merged(gs).translate(-pivot[0], -pivot[1], -pivot[2]);
      for (const x of gs) x.dispose();
      if (axis === "x") g.rotateY(-Math.PI / 2);
      else if (axis === "y") g.rotateX(Math.PI / 2);
      m.live(g, c, anim, { at: pivot, rot, glow });
    }
    this.parts = [];
  }
}

/** Turned by `rx` round x through `p` (a leant back). */
export function aboutX(p: V3, rx: number): Matrix4 {
  return new Matrix4()
    .makeTranslation(p[0], p[1], p[2])
    .multiply(new Matrix4().makeRotationX(rx))
    .multiply(new Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
}

/** A surface over (u, v) in 0..1², `nu` × `nv` facets: facing ∂u × ∂v (side 1), the other way (−1),
 *  or both (0: a hammock's cloth, seen from over and under). */
export function sheet(nu: number, nv: number, f: (u: number, v: number) => V3, side: 1 | -1 | 0 = 1): BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = f(i / nu, j / nv);
      const b = f((i + 1) / nu, j / nv);
      const c = f(i / nu, (j + 1) / nv);
      const d = f((i + 1) / nu, (j + 1) / nv);
      if (side >= 0) pos.push(...a, ...b, ...c, ...b, ...d, ...c);
      if (side <= 0) pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
}

/** A table's value at x, eased between its rows. */
function ease(tab: [number, number][], x: number): number {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++)
    if (x <= tab[i][0]) {
      const [x0, y0] = tab[i - 1];
      const [x1, y1] = tab[i];
      const k = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * k * k * (3 - 2 * k);
    }
  return tab[tab.length - 1][1];
}

/** A smooth curve through (key, value) rows, sampled: its value at a key (linear between samples). */
class Smooth {
  private tab: [number, number][];
  constructor(rows: [number, number][]) {
    this.tab = new CatmullRomCurve3(rows.map(([k, v]) => new Vector3(v, k, 0)))
      .getPoints(96)
      .map((p) => [p.y, p.x] as [number, number])
      .sort((a, b) => a[0] - b[0]);
  }
  at(k: number): number {
    const t = this.tab;
    if (k <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++)
      if (k <= t[i][0]) {
        const f = (k - t[i - 1][0]) / Math.max(1e-9, t[i][0] - t[i - 1][0]);
        return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * f;
      }
    return t[t.length - 1][1];
  }
  get first(): number {
    return this.tab[0][0];
  }
  get last(): number {
    return this.tab[this.tab.length - 1][0];
  }
}

/** A pod: a shell turned round y — its radius up its height a smooth curve through `prof` ((y, r),
 *  from its foot up) — open at its front (+z) by `open` ((y, half-angle)). Its facets on a fixed
 *  grid round it, clamped to the opening's edge (so they don't twist where the opening widens). */
class Pod {
  private r: Smooth;
  private a: Smooth;
  constructor(prof: [number, number][], open: [number, number][]) {
    this.r = new Smooth(prof);
    this.a = new Smooth(open);
  }
  rAt(y: number): number {
    return this.r.at(y);
  }
  aAt(y: number): number {
    return Math.max(0, this.a.at(y));
  }
  get y0(): number {
    return this.r.first;
  }
  get y1(): number {
    return this.r.last;
  }
  /** its face, `inset(phi)` in from the outside (φ 0 at the front, π at the back), from `from` up:
   *  outward (1) or in (−1) */
  face(inset: (phi: number) => number, side: 1 | -1, from = this.y0, nt = 20, nphi = 32): BufferGeometry {
    const P = (i: number, j: number): V3 => {
      const y = from + ((this.y1 - from) * j) / nt;
      const a = this.aAt(y);
      const phi = Math.min(Math.PI * 2 - a, Math.max(a, (Math.PI * 2 * i) / nphi));
      const r = Math.max(0.004, this.rAt(y) - inset(phi));
      return [r * Math.sin(phi), y, r * Math.cos(phi)];
    };
    const pos: number[] = [];
    const tri = (a: V3, b: V3, c: V3) => {
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-7) return;
      if (side > 0) pos.push(...a, ...b, ...c);
      else pos.push(...a, ...c, ...b);
    };
    for (let i = 0; i < nphi; i++)
      for (let j = 0; j < nt; j++) {
        const a = P(i, j);
        const b = P(i + 1, j);
        const c = P(i, j + 1);
        const d = P(i + 1, j + 1);
        tri(a, b, c);
        tri(b, d, c);
      }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    return g;
  }
  /** its cut edge as a closed band, `inset` in: up the left, over the top, down the right, back
   *  round under the front */
  rim(inset: number, from: number, rad: number, along = 72): BufferGeometry {
    // (the edge sampled finely up its height, then taken at even steps along it: where the opening
    // widens fast the edge runs nearly level)
    const dense: V3[] = [];
    for (let i = 0; i <= 240; i++) {
      const y = from + ((this.y1 - 0.012 - from) * i) / 240;
      const a = this.aAt(y);
      if (a < 0.02) continue;
      const r = Math.max(0.01, this.rAt(y) - inset);
      dense.push([r * Math.sin(a), y, r * Math.cos(a)]);
    }
    const left: V3[] = [dense[0]];
    let run = 0;
    for (let i = 1; i < dense.length; i++) {
      run += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]);
      if (run >= 0.035) {
        left.push(dense[i]);
        run = 0;
      }
    }
    const right = left.map(([x, y, z]) => [-x, y, z] as V3).reverse();
    const curve = new CatmullRomCurve3(
      [...left, ...right].map((p) => new Vector3(...p)),
      true,
    );
    return new TubeGeometry(curve, along, rad, 6, true);
  }
  /** a ring round it at `y`, `out` off its face, where it's closed */
  ring(y: number, out: number | ((phi: number) => number), n = 20): V3[] {
    const a = this.aAt(y) + 0.04;
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const phi = a + ((Math.PI * 2 - 2 * a) * i) / n;
      const r = this.rAt(y) + (typeof out === "number" ? out : out(phi));
      pts.push([r * Math.sin(phi), y, r * Math.cos(phi)]);
    }
    return pts;
  }
}

/** A five-star (or `n`-star) base on twin-wheel casters, its hub at y 0.075 (as the task chair's). */
function starBase(m: Model | Rig, cx: number, cz: number, c: number, n = 5, R = 0.31) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const arm = extrude(
      [
        [0, -0.02],
        [R, -0.012],
        [R, 0.016],
        [0.04, 0.03],
        [0, 0.03],
      ],
      0.05,
      0.006,
      2,
    );
    m.add(arm, c, { at: [cx, 0.09, cz], rot: [0, -a, 0] });
    const ex = cx + dx * (R - 0.02);
    const ez = cz + dz * (R - 0.02);
    for (const s of [-1, 1])
      m.add(new CylinderGeometry(0.028, 0.028, 0.016, 10).rotateZ(Math.PI / 2), P.rubber, {
        at: [ex + Math.cos(a + Math.PI / 2) * s * 0.012, 0.028, ez + Math.sin(a + Math.PI / 2) * s * 0.012],
        rot: [0, -a - Math.PI / 2, 0],
      });
    m.add(box([0.03, 0.035, 0.03], 0.006), c, { at: [ex, 0.06, ez] });
  }
  m.add(cyl(0.05, 0.04, 0.06, 12), c, { at: [cx, 0.075, cz] });
}

/** A four-star swivel foot (an egg chair's): polished arms out to round glides. */
function fourStar(m: Model, cx: number, cz: number, c: number, R = 0.36) {
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = extrude(
      [
        [0, -0.015],
        [R, -0.008],
        [R, 0.006],
        [0.06, 0.02],
        [0, 0.022],
      ],
      0.045,
      0.006,
      2,
    );
    m.add(arm, c, { at: [cx, 0.03, cz], rot: [0, -a, 0] });
    m.add(cyl(0.022, 0.024, 0.016, 10), P.rubber, {
      at: [cx + Math.cos(a) * (R - 0.02), 0, cz + Math.sin(a) * (R - 0.02)],
    });
  }
  m.add(cyl(0.06, 0.05, 0.05, 14), c, { at: [cx, 0.02, cz] });
}

/** A rectangle's edge, its middle at 0 (y 0), `r` round its corners. */
function rectLoop(w: number, d: number, r: number): V3[] {
  const out: V3[] = [];
  const c = (x: number, z: number, a0: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      out.push([x + Math.cos(a) * r, 0, z + Math.sin(a) * r]);
    }
  };
  c(w / 2 - r, d / 2 - r, 0);
  c(-w / 2 + r, d / 2 - r, Math.PI / 2);
  c(-w / 2 + r, -d / 2 + r, Math.PI);
  c(w / 2 - r, -d / 2 + r, (3 * Math.PI) / 2);
  out.push(out[0]);
  return out;
}

/** A round cushion (lathed), `r` across, `h` thick, its foot at y 0, its top swelling. */
function roundCushion(r: number, h: number, seg = 20): BufferGeometry {
  return lathe(
    [
      [0, 0],
      [r * 0.9, 0],
      [r, h * 0.3],
      [r * 0.97, h * 0.7],
      [r * 0.85, h * 0.95],
      [0, h],
    ],
    seg,
  );
}

// ── the egg chair (1×1) ──────────────────────────────────────────────────────────────────────────
// A swivelling pod on a four-star foot: its shell wraps round the sitter from the seat to the wings
// at her head, open at the front, upholstered inside. Seat 0.44 (shared SEATS.egg_chair). Sat in, it
// turns a little to and fro.
const EGG = new Pod(
  [
    [0.3, 0.16],
    [0.35, 0.33],
    [0.44, 0.41],
    [0.58, 0.435],
    [0.74, 0.42],
    [0.88, 0.37],
    [0.98, 0.29],
    [1.05, 0.18],
    [1.085, 0.04],
  ],
  [
    [0.3, 0],
    [0.35, 0],
    [0.4, 0.75],
    [0.46, 1.3],
    [0.57, 1.22],
    [0.67, 1.85],
    [0.84, 1.62],
    [0.95, 1.08],
    [1.03, 1.3],
    [1.085, 1.6],
  ],
);
const EGG_Z = 0.47;
/** the egg's lining: in from its shell, padded thicker up the back (φ π) */
const LINING = (phi: number) => 0.035 + 0.08 * Math.max(0, -Math.cos(phi)) ** 1.5;

function eggChair(m: Model, o: Look) {
  const cx = 0.5;
  const cz = EGG_Z;
  const look = o.look;
  const outer = look === 1 ? C.rattan : look === 2 ? P.cognac : C.shell;
  const inner = o.fabric ?? (look === 1 ? P.cream : look === 2 ? shade(P.cognac, 0.92) : C.teal);
  const foot = look === 1 ? P.steel : P.chrome;
  fourStar(m, cx, cz, foot);
  m.add(cyl(0.034, 0.034, 0.22, 12), foot, { at: [cx, 0.06, cz] });
  // what turns: the shell, its lining, the cushions
  const r = new Rig();
  const at: V3 = [cx, 0, cz];
  r.add(cyl(0.07, 0.09, 0.03, 14), foot, { at: [cx, 0.27, cz] });
  const fine = look === 1 ? 0 : 1;
  r.add(
    EGG.face(() => 0, 1, EGG.y0, 20 + 4 * fine, 32 + 4 * fine),
    outer,
    { at },
  );
  r.add(cyl(0.16, 0.16, 0.012, 18), shade(outer, 0.85), { at: [cx, 0.294, cz] });
  // the lining, padded thicker up its back
  r.add(EGG.face(LINING, -1, 0.34, 18 + 4 * fine, 32 + 4 * fine), inner, { at });
  r.add(EGG.rim(0.03, 0.34, look === 1 ? 0.024 : 0.022), look === 2 ? shade(outer, 0.7) : outer, { at });
  if (look === 1) {
    // the weave: rings round it, ribs up its back
    for (let y = 0.37; y < 1.05; y += 0.068) r.add(tube(EGG.ring(y, 0.004), 0.006, 3, 20), C.rattanDark, { at });
    for (let k = -4; k <= 4; k++) {
      const phi = Math.PI + k * 0.27;
      const pts: V3[] = [];
      for (let y = 0.32; y < 1.07; y += 0.06) {
        const rr = EGG.rAt(y) + 0.005;
        pts.push([rr * Math.sin(phi), y, rr * Math.cos(phi)]);
      }
      r.add(tube(pts, 0.005, 3, 14), shade(C.rattan, 0.82), { at });
    }
  } else if (look === 2) {
    // leather: the seams of its panels, stitched
    for (const y of [0.58, 0.86]) r.add(tube(EGG.ring(y, 0.002), 0.004, 3, 24), shade(outer, 0.78), { at });
  }
  // the seat cushion, piped
  const seatTop = 0.44 - (o.occupied ? 0.012 : 0);
  r.add(roundCushion(0.31, seatTop - 0.375), inner, { at: [cx, 0.375, cz + 0.03] });
  r.add(tube(rectLoop(0.6, 0.6, 0.29), 0.006, 4, 40), shade(inner, 0.72), {
    at: [cx, seatTop - 0.018, cz + 0.03],
  });
  // the lining's seams: a channel up the back, two across it
  for (const y of [0.62, 0.84])
    r.add(
      tube(
        EGG.ring(y, (phi) => -LINING(phi) - 0.003, 24),
        0.004,
        3,
        30,
      ),
      shade(inner, 0.8),
      { at },
    );
  // (story) a lumbar pillow, or a throw over its wing
  if (o.seed > 0.6)
    r.add(cushion([0.32, 0.18, 0.08], 0.45, 3), look === 0 ? P.mustard : P.rust, {
      at: [cx, 0.56, cz - 0.2],
      rot: [-0.2, 0, 0.06],
    });
  else if (o.seed < 0.25)
    r.add(cushion([0.12, 0.42, 0.02], 0.2, 2), P.wool, { at: [cx + 0.39, 0.82, cz - 0.05], rot: [0, 0.5, 0.12] });
  if (o.occupied) r.live(m, [cx, 0, cz], "y", { kind: "nod", amp: 0.16, period: 9, phase: o.seed });
  else r.still(m);
}

// ── the rocking chair (1×1) ─────────────────────────────────────────────────────────────────────
// On two rockers (arcs round a centre 1.1 m up); a seat at 0.45 with a pad (the paint), a back leant
// back to 1.1 m: an oak Windsor (spindles under a crest rail), a white porch rocker (slats, wide flat
// arms), a walnut Danish rocker (upholstered). Sat in, it rocks. A braided rag rug under it.
const ROCK_R = 1.1;

function rockingChair(m: Model, o: Look) {
  const look = o.look;
  const wood = look === 1 ? P.white : look === 2 ? P.walnut : P.oak;
  const dark = shade(wood, look === 1 ? 0.9 : 0.82);
  const pad = o.fabric ?? (look === 1 ? 0x4f7f9a : look === 2 ? P.olive : C.brick);
  // the rug: braided rings, three tones (the house's: still while the chair rocks)
  const rugC = [0xb5653f, 0xc98a5f, 0x8a7a5a, 0xd9cfb4, 0x6e7b3a, 0xb8ad90, 0xa65a3a];
  for (let i = 0; i < 10; i++) {
    const k = 1 - i * 0.092;
    m.add(
      lathe(
        [
          [0, 0],
          [0.43 * k, 0],
          [0.43 * k - 0.006, 0.008],
          [0, 0.008],
        ],
        28,
      ),
      rugC[(i * 3) % rugC.length],
      { at: [0.5, i * 0.0004, 0.5], scale: [0.94, 1, 1.04] },
    );
  }
  const r = new Rig();
  const zc = 0.5;
  const yAt = (z: number) => ROCK_R - Math.sqrt(ROCK_R ** 2 - (z - zc) ** 2) + 0.009;
  // the rockers
  const sweep = look === 2 ? 0.43 : 0.4;
  for (const x of [0.27, 0.73]) {
    const lo: [number, number][] = [];
    const hi: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const th = -sweep + (2 * sweep * i) / 16;
      const z = zc + ROCK_R * Math.sin(th);
      const y = ROCK_R - ROCK_R * Math.cos(th) + 0.009;
      const tall = look === 2 ? 0.045 : 0.06 - 0.02 * Math.abs(th / sweep) ** 2;
      lo.push([z - 0.5, y]);
      hi.push([z - 0.5, y + tall]);
    }
    r.add(extrude([...lo, ...hi.reverse()], 0.03, 0.006, 1).rotateY(-Math.PI / 2), dark, { at: [x, 0, 0.5] });
  }
  const seatY = 0.45 - (o.occupied ? 0.01 : 0);
  const zF = 0.73; // the front legs
  const zB = 0.3; // the back legs, going on up as the back's posts
  const lean = -0.24;
  // the legs, turned, from the rockers to the seat
  for (const s of [-1, 1]) {
    const x = 0.5 + s * 0.23;
    for (const z of [zF, zB]) {
      const y0 = yAt(z) + 0.03;
      const h = 0.41 - y0;
      r.add(
        look === 2
          ? taper(cyl(0.02, 0.02, h, 8), 1.3, 0, h)
          : lathe(
              [
                [0, 0],
                [0.02, 0],
                [0.024, h * 0.15],
                [0.017, h * 0.35],
                [0.022, h * 0.6],
                [0.016, h * 0.85],
                [0.018, h],
                [0, h],
              ],
              8,
            ),
        wood,
        { at: [x, y0, z], rot: [z > 0.5 ? -0.06 : 0.06, 0, 0] },
      );
    }
    // stretchers between them
    if (look !== 2) r.add(rod(0.011, 0.011, zF - zB, "z", 6), wood, { at: [x, yAt(0.5) + 0.14, (zF + zB) / 2] });
  }
  if (look !== 2) r.add(rod(0.011, 0.011, 0.44, "x", 6), wood, { at: [0.5, yAt(0.5) + 0.16, 0.52] });
  // the seat: a board (a saddle for the Windsor), its pad
  if (look === 2) {
    r.add(box([0.52, 0.04, 0.5], 0.01, 2), wood, { at: [0.5, 0.39, 0.5] });
    r.add(cushion([0.5, 0.08, 0.5], 0.25, 3), pad, { at: [0.5, seatY - 0.04, 0.51] });
    r.add(tube(rectLoop(0.46, 0.46, 0.06), 0.006, 4, 40), shade(pad, 0.75), { at: [0.5, seatY - 0.012, 0.51] });
  } else {
    r.add(extrude(roundRect(0.52, 0.48, look === 0 ? 0.14 : 0.04, 3), 0.035, 0.008, 2).rotateX(Math.PI / 2), wood, {
      at: [0.5, 0.405, 0.51],
    });
    if (look === 1)
      for (let i = 0; i < 5; i++) r.add(box([0.5, 0.004, 0.006]), dark, { at: [0.5, 0.4235, 0.31 + i * 0.1] });
    r.add(cushion([0.44, 0.03, 0.42], 0.3, 2), pad, { at: [0.5, seatY - 0.015, 0.52] });
    // its ties at the back
    for (const s of [-1, 1])
      r.add(box([0.008, 0.07, 0.008]), shade(pad, 0.8), { at: [0.5 + s * 0.19, 0.4, 0.3], rot: [0.2, 0, 0] });
  }
  // the back: posts from the back legs up, leant
  const B = aboutX([0.5, 0.42, zB], lean);
  const back = new Rig(B);
  const top = 1.1 - 0.42;
  for (const s of [-1, 1]) {
    const x = 0.5 + s * 0.22;
    back.add(taper(cyl(0.02, 0.02, top, 8), 0.8, 0, top), wood, { at: [x, 0.42, zB] });
    back.add(ball(0.024, 8), wood, { at: [x, 0.42 + top, zB] });
  }
  if (look === 0) {
    // the crest rail, bowed, and its spindles
    back.add(wrap(box([0.5, 0.075, 0.03], 0.012, 2), 0.6), wood, { at: [0.5, 1.04, zB] });
    for (let i = 0; i < 7; i++) {
      const x = 0.5 + (i - 3) * 0.055;
      back.add(taper(cyl(0.009, 0.009, 0.58, 6), 0.7, 0, 0.58), wood, { at: [x, 0.43, zB + 0.6 * (x - 0.5) ** 2] });
    }
    back.add(wrap(box([0.44, 0.03, 0.025], 0.008), 0.6), wood, { at: [0.5, 0.62, zB] });
  } else if (look === 1) {
    // five slats, a top rail with a cut-out handle
    back.add(box([0.48, 0.1, 0.03], 0.01, 2), wood, { at: [0.5, 1.03, zB] });
    back.add(box([0.12, 0.025, 0.032], 0.008), dark, { at: [0.5, 1.03, zB] });
    for (let i = 0; i < 5; i++)
      back.add(box([0.06, 0.52, 0.018], 0.004), wood, {
        at: [0.5 + (i - 2) * 0.083, 0.71, zB],
        tone: 0.97 + (i % 2) * 0.03,
      });
    back.add(box([0.46, 0.04, 0.025], 0.006), wood, { at: [0.5, 0.45, zB] });
  } else {
    // two rails, the back cushion strapped between them
    for (const y of [0.55, 1.02]) back.add(wrap(box([0.46, 0.05, 0.03], 0.01, 2), 0.5), wood, { at: [0.5, y, zB] });
    back.add(wrap(cushion([0.44, 0.48, 0.09], 0.25, 3), 0.5), pad, { at: [0.5, 0.79, zB + 0.05] });
    back.add(wrap(box([0.4, 0.006, 0.004]), 0.5), shade(pad, 0.7), { at: [0.5, 0.79, zB + 0.096] });
  }
  if (o.seed > 0.65) {
    // (story) a knitted blanket over the back
    back.add(cushion([0.46, 0.02, 0.12], 0.3, 2), P.wool, { at: [0.5, 1.1, zB - 0.01] });
    back.add(cushion([0.44, 0.3, 0.02], 0.2, 2), shade(P.wool, 0.94), {
      at: [0.5, 0.95, zB - 0.06],
      rot: [0.06, 0, 0],
    });
  }
  back.still(r);
  // the arms: from the back posts forward onto the front legs' tops
  for (const s of [-1, 1]) {
    const x = 0.5 + s * 0.26;
    const bz = zB - 0.08;
    if (look === 1) {
      r.add(box([0.1, 0.022, 0.52], 0.006, 2), wood, { at: [x + s * 0.01, 0.66, (zF + 0.06 + bz) / 2] });
      r.add(cyl(0.016, 0.016, 0.24, 8), wood, { at: [x - s * 0.03, 0.42, zF] });
    } else {
      r.add(
        tube(
          [
            [x - s * 0.03, 0.66, bz],
            [x, 0.65, 0.48],
            [x + s * 0.01, 0.645, zF + 0.04],
            [x + s * 0.005, 0.63, zF + 0.08],
          ],
          look === 2 ? 0.024 : 0.02,
          7,
          14,
        ),
        wood,
      );
      r.add(taper(cyl(0.015, 0.015, 0.22, 8), 1.2, 0, 0.22), wood, { at: [x - s * 0.03, 0.42, zF + 0.01] });
    }
  }
  if (o.occupied) r.live(m, [0.5, ROCK_R, zc], "x", { kind: "nod", amp: 0.07, period: 2.6, phase: o.seed });
  else r.still(m);
}

// ── the hanging chair (1×1, from the ceiling) ───────────────────────────────────────────────────
// Hung from a hook in the ceiling (3.27): a rattan bubble on its chain, or a macramé swing chair
// on its ropes; the seat at 0.45. It sways, always, a little less with someone in it.
const HANG = 3.27;
const BUBBLE = new Pod(
  [
    [0.3, 0.03],
    [0.31, 0.2],
    [0.345, 0.34],
    [0.42, 0.41],
    [0.62, 0.455],
    [0.92, 0.44],
    [1.2, 0.36],
    [1.44, 0.22],
    [1.6, 0.09],
    [1.66, 0.02],
  ],
  [
    [0.3, 0],
    [0.37, 0],
    [0.42, 0.7],
    [0.48, 1.2],
    [0.72, 1.55],
    [1.0, 1.45],
    [1.26, 1.1],
    [1.42, 0.5],
    [1.5, 0],
  ],
);

function hangingChair(m: Model, o: Look) {
  const cx = 0.5;
  const cz = 0.48;
  const fab = o.fabric ?? (o.look === 1 ? P.mustard : P.linen);
  // the ceiling's plate and hook (still)
  m.add(cyl(0.06, 0.05, 0.02, 14), P.white, { at: [cx, HANG - 0.02, cz] });
  m.add(new TorusGeometry(0.022, 0.005, 4, 10), P.steel, { at: [cx, HANG - 0.045, cz] });
  const r = new Rig();
  const at: V3 = [cx, 0, cz];
  if (o.look === 1) macrame(r, fab, o);
  else {
    // the bubble: a wicker shell, its rim bound, the weave round it
    r.add(
      BUBBLE.face(() => 0, 1, BUBBLE.y0, 20, 30),
      C.rattan,
      { at },
    );
    r.add(
      BUBBLE.face(() => 0.03, -1, 0.33, 18, 28),
      shade(C.rattan, 0.84),
      { at },
    );
    r.add(BUBBLE.rim(0.015, 0.36, 0.022, 64), C.rattanDark, { at });
    for (let y = 0.4; y < 1.6; y += 0.085) r.add(tube(BUBBLE.ring(y, 0.004), 0.0055, 3, 18), C.rattanDark, { at });
    for (let k = -4; k <= 4; k++) {
      const phi = Math.PI + k * 0.3;
      const pts: V3[] = [];
      for (let y = 0.36; y < 1.64; y += 0.08) {
        const rr = BUBBLE.rAt(y) + 0.005;
        pts.push([rr * Math.sin(phi), y, rr * Math.cos(phi)]);
      }
      r.add(tube(pts, 0.005, 3, 14), shade(C.rattan, 0.8), { at });
    }
    // its cushions: a round seat, a back against the curve, a scatter cushion
    const seatTop = 0.45 - (o.occupied ? 0.015 : 0);
    r.add(roundCushion(0.3, seatTop - 0.355), fab, { at: [cx, 0.355, cz + 0.02] });
    r.add(wrap(cushion([0.52, 0.5, 0.1], 0.3, 3), 0.9), fab, { at: [cx, 0.72, cz - 0.3], rot: [-0.18, 0, 0] });
    r.add(cushion([0.3, 0.28, 0.1], 0.45, 3), o.seed > 0.5 ? C.teal : P.rust, {
      at: [cx + 0.14, 0.62, cz - 0.16],
      rot: [-0.3, -0.4, 0.15],
    });
    // the ring at its crown and the chain up to the hook, link by link
    r.add(new TorusGeometry(0.035, 0.008, 4, 12).rotateX(Math.PI / 2), P.steel, { at: [cx, 1.67, cz] });
    const n = Math.floor((HANG - 0.06 - 1.7) / 0.062);
    for (let i = 0; i < n; i++)
      r.add(new TorusGeometry(0.022, 0.005, 3, 8), P.steel, {
        at: [cx, 1.72 + i * 0.062, cz],
        rot: [0, i % 2 ? Math.PI / 2 : 0, 0],
        scale: [1, 1.6, 1],
      });
  }
  r.live(m, [cx, HANG - 0.045, cz], "x", {
    kind: "nod",
    amp: o.occupied ? 0.012 : 0.028,
    period: 4.6,
    phase: o.seed,
  });
}

/** A macramé swing chair: a cotton sling knotted in diamonds from an oak dowel, fringed, on two
 *  ropes to a ring and one up to the hook; a seat cushion and a pillow in it. */
function macrame(r: Rig, fab: number, o: Look) {
  // the sling's middle line, from the dowel down its back, under the seat, out to its front edge
  const path = new CatmullRomCurve3(
    [
      [0.3, 1.5],
      [0.22, 1.18],
      [0.2, 0.86],
      [0.24, 0.56],
      [0.38, 0.39],
      [0.6, 0.39],
      [0.78, 0.44],
      [0.86, 0.47],
    ].map(([z, y]) => new Vector3(0, y, z)),
  );
  const width = (v: number) =>
    ease(
      [
        [0, 0.78],
        [0.5, 0.66],
        [0.75, 0.6],
        [1, 0.66],
      ],
      v,
    );
  const S = (u: number, v: number): V3 => {
    const p = path.getPoint(v);
    const s = 2 * u - 1;
    const wrapK = ease(
      [
        [0, 0.05],
        [0.4, 0.16],
        [0.65, 0.06],
        [1, 0.02],
      ],
      v,
    );
    const dip = ease(
      [
        [0, 0],
        [0.5, 0.01],
        [0.7, 0.05],
        [1, 0.03],
      ],
      v,
    );
    return [0.5 + (s * width(v)) / 2, p.y - dip * (1 - s * s) + (v > 0.85 ? 0.02 * s * s : 0), p.z + wrapK * s * s];
  };
  r.add(sheet(14, 22, S, 0), C.cord);
  // the knots: diamonds over it, a little inside, and the knots where they cross
  const inward = (p: V3): V3 => {
    const d = [0.5 - p[0], 0.85 - p[1], 0.62 - p[2]];
    const l = Math.hypot(...d) || 1;
    return [p[0] + (d[0] / l) * 0.007, p[1] + (d[1] / l) * 0.007, p[2] + (d[2] / l) * 0.007];
  };
  const N = 5;
  for (let k = -N; k <= N; k++)
    for (const dir of [1, -1]) {
      const pts: V3[] = [];
      for (let i = 0; i <= 14; i++) {
        const v = i / 14;
        const u = (k + N) / (2 * N) + dir * (v - 0.5) * 0.9;
        if (u < 0 || u > 1) continue;
        pts.push(inward(S(u, v)));
      }
      if (pts.length > 2) r.add(tube(pts, 0.0055, 3, pts.length), C.cordDark);
    }
  // its hem along the front edge, tassels hung from it
  const hem: V3[] = [];
  for (let k = 0; k <= 12; k++) hem.push(S(k / 12, 1));
  r.add(tube(hem, 0.011, 5, 24), C.cordDark);
  for (let k = 0; k < 6; k++) {
    const p = S((k + 0.5) / 6, 1);
    r.add(ball(0.014, 6), C.cordDark, { at: [p[0], p[1] - 0.012, p[2] + 0.004] });
    r.add(cyl(0.005, 0.018, 0.12, 7).rotateX(Math.PI), C.cord, { at: [p[0], p[1] - 0.02, p[2] + 0.004] });
  }
  // the dowel, its ropes down to the front corners, the ropes up to the ring and on to the hook
  r.add(rod(0.02, 0.02, 0.92, "x", 10), P.oak, { at: [0.5, 1.51, 0.3] });
  for (const s of [-1, 1]) {
    r.add(ball(0.026, 8), P.oak, { at: [0.5 + s * 0.46, 1.51, 0.3] });
    const f = S(s < 0 ? 0 : 1, 1);
    r.add(
      tube(
        [
          [0.5 + s * 0.42, 1.51, 0.3],
          [0.5 + s * 0.37, 1.0, 0.62],
          [f[0], f[1] + 0.02, f[2]],
        ],
        0.009,
        4,
        14,
      ),
      C.cord,
    );
    r.add(
      tube(
        [
          [0.5 + s * 0.42, 1.52, 0.3],
          [0.5 + s * 0.2, 1.95, 0.34],
          [0.5 + s * 0.03, 2.3, 0.37],
        ],
        0.009,
        4,
        10,
      ),
      C.cord,
    );
  }
  r.add(new TorusGeometry(0.05, 0.012, 5, 16), P.oak, { at: [0.5, 2.34, 0.37] });
  r.add(
    tube(
      [
        [0.5, 2.39, 0.37],
        [0.5, 2.8, 0.43],
        [0.5, 3.23, 0.48],
      ],
      0.011,
      4,
      10,
    ),
    C.cord,
  );
  // a seat cushion, a pillow against its back
  const seatTop = 0.45 - (o.occupied ? 0.015 : 0);
  r.add(cushion([0.5, 0.06, 0.42], 0.3, 3), fab, { at: [0.5, seatTop - 0.04, 0.52] });
  r.add(cushion([0.44, 0.34, 0.12], 0.4, 3), o.seed > 0.5 ? P.rust : C.sage, {
    at: [0.5, 0.68, 0.33],
    rot: [-0.3, 0, 0.04],
  });
}

// ── the gaming chair (1×1) ───────────────────────────────────────────────────────────────────────
// A racing bucket seat on a five-star base: bolstered seat and back, the harness slots at its
// shoulders, a headrest pillow and a lumbar one, 4D arms. Seat 0.48; it reclines when sat in.
function gamingChair(m: Model, o: Look) {
  const look = o.look;
  const main = look === 2 ? P.white : P.vinyl;
  const accent = look === 0 ? C.red : look === 2 ? P.vinyl : 0x3a3b40;
  const stitch = look === 0 ? C.red : look === 1 ? 0x6e7076 : P.vinyl;
  const cx = 0.5;
  const cz = 0.5;
  const sink = o.occupied ? 0.012 : 0;
  const seatTop = 0.48 - sink;
  starBase(m, cx, cz, look === 2 ? P.white : P.plastic);
  m.add(cyl(0.024, 0.024, 0.24, 12), P.chrome, { at: [cx, 0.12, cz] });
  m.add(
    lathe(
      [
        [0.034, 0],
        [0.04, 0.02],
        [0.034, 0.04],
        [0.04, 0.06],
        [0.034, 0.08],
        [0.04, 0.1],
        [0.03, 0.12],
      ],
      12,
    ),
    P.rubber,
    { at: [cx, 0.13, cz] },
  );
  m.add(box([0.24, 0.06, 0.26], 0.012), P.steel, { at: [cx, 0.37, cz] });
  m.add(
    tube(
      [
        [cx + 0.1, 0.37, cz],
        [cx + 0.22, 0.36, cz + 0.04],
        [cx + 0.26, 0.34, cz + 0.08],
      ],
      0.008,
      5,
      8,
    ),
    P.plastic,
  );
  // the seat: a pan, the middle cushion, two high bolsters, the front's roll
  m.add(box([0.5, 0.04, 0.5], 0.01), P.plastic, { at: [cx, 0.41, cz + 0.02] });
  m.add(cushion([0.34, seatTop - 0.42, 0.46], 0.2, 3), main, { at: [cx, (seatTop + 0.42) / 2, cz + 0.03] });
  for (const s of [-1, 1]) {
    m.add(cushion([0.09, 0.12, 0.48], 0.3, 3), accent, {
      at: [cx + s * 0.215, 0.475, cz + 0.02],
      rot: [0, 0, s * 0.18],
    });
    m.add(box([0.003, 0.004, 0.42]), stitch, { at: [cx + s * 0.168, seatTop - 0.002, cz + 0.03] });
  }
  for (let i = 0; i < 4; i++)
    m.add(box([0.3, 0.004, 0.003]), stitch, { at: [cx, seatTop - 0.001, cz - 0.12 + i * 0.1] });
  // the back, leant (further when sat in): a bucket, wide at the shoulders, its wings, the slots
  const lean = o.occupied ? -0.27 : -0.15;
  const bz = cz - 0.2;
  const back = new Rig(aboutX([cx, 0.45, bz], lean));
  const outline: [number, number][] = [
    [-0.24, 0],
    [0.24, 0],
    [0.27, 0.12],
    [0.22, 0.32],
    [0.27, 0.6],
    [0.28, 0.78],
    [0.2, 0.86],
    [0.12, 0.88],
    [-0.12, 0.88],
    [-0.2, 0.86],
    [-0.28, 0.78],
    [-0.27, 0.6],
    [-0.22, 0.32],
    [-0.27, 0.12],
  ];
  back.add(wrap(extrude(outline, 0.07, 0.015, 2), 0.6), main, { at: [cx, 0.46, bz - 0.01] });
  back.add(
    wrap(
      extrude(
        outline.map(([x, y]) => [x * 0.98, y * 0.99 + 0.004]),
        0.02,
        0.006,
        1,
      ),
      0.6,
    ),
    shade(main, 0.75),
    {
      at: [cx, 0.46, bz - 0.05],
    },
  );
  // the wings: bolsters up its sides
  for (const s of [-1, 1]) {
    back.add(
      tube(
        [
          [cx + s * 0.2, 0.5, bz + 0.06],
          [cx + s * 0.235, 0.62, bz + 0.07],
          [cx + s * 0.2, 0.8, bz + 0.06],
          [cx + s * 0.235, 1.05, bz + 0.05],
          [cx + s * 0.2, 1.22, bz + 0.04],
        ],
        0.05,
        8,
        16,
      ),
      accent,
    );
    // the harness slot at the shoulder
    back.add(extrude(roundRect(0.05, 0.1, 0.022, 3), 0.012, 0, 1), P.ink, { at: [cx + s * 0.11, 1.2, bz + 0.03] });
  }
  // the middle's channels, stitched
  back.add(wrap(cushion([0.3, 0.6, 0.05], 0.25, 3), 0.6), main, { at: [cx, 0.8, bz + 0.035] });
  for (let i = 0; i < 6; i++)
    back.add(wrap(box([0.28, 0.004, 0.004]), 0.6), stitch, { at: [cx, 0.56 + i * 0.09, bz + 0.064] });
  for (const s of [-1, 1]) back.add(box([0.004, 0.58, 0.004]), stitch, { at: [cx + s * 0.15, 0.8, bz + 0.064] });
  // the headrest and lumbar pillows, on their straps; its badge
  back.add(cushion([0.24, 0.12, 0.08], 0.35, 3), main === P.white ? P.vinyl : accent, { at: [cx, 1.13, bz + 0.09] });
  back.add(cushion([0.3, 0.14, 0.09], 0.4, 3), main === P.white ? P.vinyl : accent, { at: [cx, 0.62, bz + 0.1] });
  back.add(box([0.03, 0.12, 0.004]), P.ink, { at: [cx, 1.2, bz + 0.07] });
  back.add(cyl(0.025, 0.025, 0.006, 12).rotateX(Math.PI / 2), look === 1 ? C.red : P.chrome, {
    at: [cx, 1.13, bz + 0.13],
  });
  back.still(m);
  // the 4D arms: a post from under the seat, a pad
  for (const s of [-1, 1]) {
    const x = cx + s * 0.29;
    m.add(box([0.06, 0.03, 0.18], 0.008), P.plastic, { at: [x - s * 0.05, 0.42, cz - 0.04] });
    m.add(box([0.04, 0.24, 0.06], 0.01), P.plastic, { at: [x, 0.55, cz - 0.04] });
    m.add(cushion([0.085, 0.035, 0.26], 0.2, 2), P.vinyl, { at: [x, 0.69, cz - 0.02] });
    m.add(box([0.012, 0.03, 0.04], 0.004), stitch, { at: [x + s * 0.02, 0.6, cz - 0.04] });
  }
  // (story) a headset hung on its back
  if (o.seed > 0.6) {
    const hr = new Rig(aboutX([cx, 0.45, bz], lean));
    hr.add(new TorusGeometry(0.075, 0.012, 5, 14, Math.PI).rotateY(Math.PI / 2), P.vinyl, {
      at: [cx + 0.27, 1.27, bz + 0.03],
    });
    for (const z of [-0.075, 0.075])
      hr.add(cyl(0.042, 0.042, 0.04, 12).rotateZ(Math.PI / 2), P.vinyl, { at: [cx + 0.27, 1.25, bz + 0.03 + z] });
    hr.add(cyl(0.028, 0.028, 0.004, 10).rotateZ(Math.PI / 2), C.red, { at: [cx + 0.292, 1.25, bz + 0.105] });
    hr.still(m);
  }
}

// ── the window seat (2×1, built in) ─────────────────────────────────────────────────────────────
// A box under a window: its seat cushion at 0.45 (the paint), cushions along the wall behind,
// storage under — panelled doors (painted), or two oak drawers.
function windowSeat(m: Model, o: Look) {
  const look = o.look;
  const body = look === 1 ? P.oak : C.sage;
  const fab = o.fabric ?? (look === 1 ? P.fabric : P.linen);
  const x0 = 0.03;
  const x1 = 1.97;
  const z0 = 0.02;
  const z1 = 0.76;
  const cx = 1;
  const H = 0.37;
  // the plinth, set back; the carcass; its top
  m.add(box([x1 - x0 - 0.04, 0.08, z1 - z0 - 0.05], 0.004), shade(body, 0.7), { at: [cx, 0.04, (z0 + z1) / 2 - 0.02] });
  m.add(box([x1 - x0, H - 0.1, z1 - z0], 0.006, 2), body, { at: [cx, 0.08 + (H - 0.1) / 2, (z0 + z1) / 2] });
  m.add(box([x1 - x0 + 0.02, 0.025, z1 - z0 + 0.02], 0.006, 2), look === 1 ? shade(P.oak, 1.08) : P.white, {
    at: [cx, H - 0.0125, (z0 + z1) / 2 + 0.005],
  });
  // the front: shaker doors, or drawers
  const fy = 0.08 + (H - 0.1) / 2;
  const doors = look === 1 ? 2 : 3;
  const dw = (x1 - x0 - 0.06) / doors;
  for (let i = 0; i < doors; i++) {
    const x = x0 + 0.03 + dw * (i + 0.5);
    m.add(box([dw - 0.02, H - 0.15, 0.016], 0.003), body, { at: [x, fy, z1 + 0.006] });
    if (look === 1) {
      m.add(box([dw - 0.06, 0.006, 0.006]), shade(body, 0.8), { at: [x, fy + 0.02, z1 + 0.016] });
      m.add(box([0.14, 0.018, 0.02], 0.006), P.brass, { at: [x, fy + 0.04, z1 + 0.022] });
    } else {
      m.add(box([dw - 0.1, H - 0.23, 0.008], 0.002), shade(body, 0.92), { at: [x, fy, z1 + 0.016] });
      m.add(ball(0.014, 8), P.brass, { at: [x + (i === 0 ? dw / 2 - 0.08 : -dw / 2 + 0.08), fy, z1 + 0.026] });
    }
  }
  // the seat cushion, piped, a box edge to its front
  const seatTop = 0.45 - (o.occupied ? 0.012 : 0);
  m.add(cushion([x1 - x0 - 0.02, seatTop - H, z1 - z0 - 0.02], 0.12, 3), fab, {
    at: [cx, (seatTop + H) / 2, (z0 + z1) / 2],
  });
  m.add(tube(rectLoop(x1 - x0 - 0.04, z1 - z0 - 0.04, 0.03), 0.006, 4, 48), shade(fab, 0.75), {
    at: [cx, seatTop - 0.006, (z0 + z1) / 2],
  });
  // the back cushions, against the wall
  for (const s of [-1, 1])
    m.add(cushion([0.88, 0.44, 0.14], 0.3, 3), fab, {
      at: [cx + s * 0.46, seatTop + 0.2, z0 + 0.09],
      rot: [-0.14, 0, 0],
    });
  // scatter cushions, a book left open (story)
  m.add(cushion([0.36, 0.34, 0.12], 0.45, 3), look === 1 ? P.mustard : P.rust, {
    at: [x0 + 0.3, seatTop + 0.17, z0 + 0.25],
    rot: [-0.32, 0.4, 0.1],
  });
  m.add(cushion([0.32, 0.3, 0.11], 0.45, 3), look === 1 ? P.rust : C.teal, {
    at: [x1 - 0.32, seatTop + 0.15, z0 + 0.26],
    rot: [-0.32, -0.35, -0.08],
  });
  if (o.seed > 0.55) {
    for (const s of [-1, 1])
      m.add(box([0.14, 0.012, 0.2], 0.002), P.paper, {
        at: [1.3 + s * 0.07, seatTop + 0.008, 0.5],
        rot: [0, 0.3, s * 0.08],
      });
    m.add(box([0.012, 0.016, 0.2]), P.oxblood, { at: [1.3, seatTop + 0.005, 0.5], rot: [0, 0.3, 0] });
  }
}

// ── the corner sofa piece (1×1): joins two sofas into an L ─────────────────────────────────────────
// Each of the sofa's looks (world/furn/seating.ts): its back along −z and −x, open to +x and +z where
// the sofas run on; its base, legs and cushions as theirs. Seat 0.455, as the sofa's.
function cornerSofa(m: Model, o: Look) {
  const f = o.fabric ?? (o.look === 1 ? P.oxblood : o.look === 2 ? P.rust : P.moss);
  const dark = shade(f, 0.82);
  const z0 = 0.05;
  const x0 = 0.05;
  if (o.look === 1) {
    // a Chesterfield's: a deep base on bun feet, its back as high as its rolled top, buttoned
    const top = 0.74;
    for (const [x, z] of [
      [x0 + 0.08, z0 + 0.08],
      [0.92, z0 + 0.08],
      [x0 + 0.08, 0.86],
      [0.92, 0.86],
    ])
      m.add(
        lathe(
          [
            [0, 0],
            [0.03, 0],
            [0.045, 0.03],
            [0.035, 0.07],
            [0.04, 0.09],
            [0, 0.09],
          ],
          12,
        ),
        P.walnutDark,
        { at: [x, 0, z] },
      );
    m.add(cushion([1 - x0, 0.26, 0.94 - z0], 0.04, 2), f, { at: [(1 + x0) / 2, 0.22, (0.94 + z0) / 2] });
    m.add(cushion([1 - x0, top - 0.35, 0.3], 0.08, 3), f, { at: [(1 + x0) / 2, (top + 0.35) / 2, z0 + 0.15] });
    m.add(cushion([0.3, top - 0.35, 0.94 - z0 - 0.3], 0.08, 3), f, {
      at: [x0 + 0.15, (top + 0.35) / 2, (0.94 + z0 + 0.3) / 2],
    });
    m.add(rod(0.075, 0.075, 1 - x0 - 0.15, "x", 14), shade(f, 1.05), {
      at: [(1 + x0 + 0.15) / 2, top - 0.02, z0 + 0.15],
    });
    m.add(rod(0.075, 0.075, 0.94 - z0 - 0.15, "z", 14), shade(f, 1.05), {
      at: [x0 + 0.15, top - 0.02, (0.94 + z0 + 0.15) / 2],
    });
    m.add(ball(0.078, 14), shade(f, 1.05), { at: [x0 + 0.15, top - 0.02, z0 + 0.15] });
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 3; i++) {
        const d = 0.32 + (r % 2 ? 0.125 : 0) + i * 0.25;
        if (d < 0.95) {
          m.add(ball(0.013, 6), dark, { at: [d, 0.5 + r * 0.075, z0 + 0.305] });
          m.add(ball(0.013, 6), dark, { at: [x0 + 0.305, 0.5 + r * 0.075, d] });
        }
      }
    m.add(cushion([0.62, 0.12, 0.6], 0.2, 3), f, { at: [0.66, 0.39, 0.62] });
    m.add(tube(rectLoop(0.58, 0.56, 0.05), 0.007, 4, 40), dark, { at: [0.66, 0.444, 0.62] });
  } else if (o.look === 2) {
    // a mid-century's: splayed legs, a walnut rail round its base, a slim back, cushions leant
    for (const [x, z, sx, sz] of [
      [x0 + 0.1, z0 + 0.1, -1, -1],
      [0.9, z0 + 0.1, 1, -1],
      [x0 + 0.1, 0.82, -1, 1],
      [0.9, 0.82, 1, 1],
    ]) {
      m.add(taper(cyl(0.022, 0.022, 0.22, 10), 1.6, 0, 0.22), P.walnut, {
        at: [x, 0, z],
        rot: [-sz * 0.12, 0, sx * 0.12],
      });
      m.add(cyl(0.015, 0.015, 0.02, 10), P.brass, { at: [x + sx * 0.026, 0, z + sz * 0.026] });
    }
    m.add(box([1 - x0 + 0.02, 0.03, 0.92 - z0], 0.006), P.walnut, {
      at: [(1 + x0) / 2 - 0.01, 0.225, (0.92 + z0) / 2],
    });
    m.add(box([1 - x0, 0.1, 0.92 - z0 - 0.02], 0.02, 2), dark, { at: [(1 + x0) / 2, 0.29, (0.92 + z0) / 2] });
    m.add(box([1 - x0, 0.36, 0.12], 0.02, 2), dark, { at: [(1 + x0) / 2, 0.52, z0 + 0.06] });
    m.add(box([0.12, 0.36, 0.92 - z0 - 0.12], 0.02, 2), dark, {
      at: [x0 + 0.06, 0.52, z0 + 0.12 + (0.92 - z0 - 0.12) / 2],
    });
    m.add(cushion([1 - x0 - 0.12, 0.12, 0.92 - z0 - 0.14], 0.15, 3), f, {
      at: [(1 + x0 + 0.12) / 2, 0.395, (0.92 + z0 + 0.14) / 2],
    });
    m.add(cushion([0.76, 0.14, 0.36], 0.25, 3).rotateX(Math.PI / 2), f, {
      at: [0.6, 0.62, z0 + 0.2],
      rot: [-0.22, 0, 0],
    });
    m.add(cushion([0.66, 0.14, 0.36], 0.25, 3).rotateX(Math.PI / 2), f, {
      at: [x0 + 0.2, 0.62, 0.56],
      rot: [-0.22, Math.PI / 2, 0],
    });
  } else {
    // the three-seat sofa's: tapered legs, a deck, its back block, cushions buttoned and piped
    const deckY = 0.33;
    const seatTop = 0.45;
    for (const [x, z] of [
      [x0 + 0.08, z0 + 0.08],
      [0.92, z0 + 0.08],
      [x0 + 0.08, 0.87],
      [0.92, 0.87],
    ])
      m.add(taper(cyl(0.025, 0.025, 0.13, 10), 1.45, 0, 0.13), P.walnut, { at: [x, 0, z] });
    m.add(box([1 - x0, deckY - 0.13, 0.95 - z0], 0.02), dark, {
      at: [(1 + x0) / 2, (0.13 + deckY) / 2, (0.95 + z0) / 2],
    });
    m.add(box([1 - x0, 0.42, 0.2], 0.04, 3), dark, { at: [(1 + x0) / 2, deckY + 0.21, z0 + 0.1] });
    m.add(box([0.2, 0.42, 0.95 - z0 - 0.2], 0.04, 3), dark, {
      at: [x0 + 0.1, deckY + 0.21, 0.2 + (0.95 + z0) / 2 - 0.1],
    });
    const sd = 0.68;
    m.add(cushion([0.7, seatTop - deckY + 0.01, sd], 0.22, 3), f, { at: [0.64, (deckY + seatTop) / 2, 0.94 - sd / 2] });
    m.add(tube(rectLoop(0.66, sd - 0.03, 0.05), 0.007, 4, 40), dark, { at: [0.64, seatTop - 0.008, 0.94 - sd / 2] });
    m.add(cushion([0.66, 0.17, 0.44], 0.3, 3).rotateX(Math.PI / 2), f, {
      at: [0.62, seatTop + 0.18, z0 + 0.27],
      rot: [-0.2, 0, 0],
    });
    m.add(cushion([0.6, 0.17, 0.44], 0.3, 3).rotateX(Math.PI / 2), f, {
      at: [x0 + 0.22, seatTop + 0.18, 0.6],
      rot: [-0.2, Math.PI / 2, 0],
    });
    for (const [bx, by] of [
      [-0.16, 0.1],
      [0, 0.1],
      [0.16, 0.1],
    ]) {
      m.add(ball(0.012, 6), dark, { at: [0.62 + bx, seatTop + 0.18 + by, z0 + 0.37 + by * 0.2] });
      m.add(ball(0.012, 6), dark, { at: [x0 + 0.32 + by * 0.2, seatTop + 0.18 + by, 0.6 + bx] });
    }
  }
  // (story) a throw pillow in the corner, or a blanket folded over its back
  if (o.seed > 0.55)
    m.add(cushion([0.42, 0.4, 0.13], 0.45, 3), P.mustard, { at: [0.36, 0.64, 0.34], rot: [-0.3, Math.PI / 4, 0.1] });
  else if (o.seed < 0.25)
    m.add(cushion([0.5, 0.02, 0.26], 0.3, 2), P.wool, {
      at: [0.6, o.look === 1 ? 0.8 : 0.77, z0 + 0.12],
      rot: [-0.3, 0, 0],
    });
}

// ── floor cushions / poufs (1×1) ─────────────────────────────────────────────────────────────────
// Sat on low (0.32): a stack of two big tufted floor cushions with a third beside it, tassels at the
// corners; or a round cable-knit pouf with a little one by it. The top one's in the paint.
function floorCushions(m: Model, o: Look) {
  const fab = o.fabric ?? (o.look === 1 ? 0xc9963e : P.mustard);
  const sink = o.occupied ? 0.02 : 0;
  if (o.look === 1) {
    // the knit: a round pouf, its cable ribs, its top's swirl
    const pouf = (x: number, z: number, r: number, h: number, c: number, ribs: number) => {
      const prof: [number, number][] = [
        [0, 0],
        [0.86, 0],
        [1, 0.2],
        [1.02, 0.55],
        [0.95, 0.85],
        [0.7, 1],
      ];
      m.add(lathe([...prof.map(([k, t]) => [r * k, h * t] as [number, number]), [0, h + 0.004]], 28), c, {
        at: [x, 0, z],
      });
      // the cables: ribs over it from its foot to under its top, on its face
      const rAt = (t: number) =>
        ease(
          prof.slice(1).map(([k, tt]) => [tt, k] as [number, number]),
          t,
        ) * r;
      for (let i = 0; i < ribs; i++) {
        const a = (i / ribs) * Math.PI * 2;
        const pts: V3[] = [];
        for (let k = 0; k <= 8; k++) {
          const t = 0.04 + (k / 8) * 0.88;
          const rr = rAt(t) + 0.004;
          pts.push([x + Math.sin(a) * rr, h * t, z + Math.cos(a) * rr]);
        }
        m.add(tube(pts, 0.011, 4, 12), shade(c, i % 2 ? 0.9 : 1.04));
      }
      m.add(cyl(r * 0.5, r * 0.45, 0.01, 16), shade(c, 0.92), { at: [x, h - 0.004, z] });
    };
    pouf(0.46, 0.44, 0.3, 0.32 - sink, fab, 18);
    pouf(0.84, 0.82, 0.13, 0.22, o.seed > 0.5 ? P.rust : 0xe2d6bd, 10);
  } else {
    // two big square cushions stacked, a button in each, tassels at the corners; one more beside
    const sq = (x: number, y: number, z: number, s: number, h: number, c: number, turn: number) => {
      m.add(cushion([s, h, s], 0.35, 3), c, { at: [x, y + h * 0.675, z], rot: [0, turn, 0] });
      m.add(cyl(0.022, 0.022, 0.012, 10), shade(c, 0.7), { at: [x, y + h * 1.35 - 0.009, z] });
      for (const [a, b] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const dx = (a * Math.cos(turn) + b * Math.sin(turn)) * (s / 2 - 0.01);
        const dz = (-a * Math.sin(turn) + b * Math.cos(turn)) * (s / 2 - 0.01);
        m.add(taper(cyl(0.014, 0.014, 0.05, 6), 0.4, 0, 0.05).rotateX(Math.PI), shade(c, 0.8), {
          at: [x + dx, y + h * 0.675 + 0.01, z + dz],
        });
      }
    };
    sq(0.78, 0, 0.22, 0.28, 0.1, o.seed > 0.5 ? C.teal : P.rust, 0.5);
    sq(0.45, 0, 0.46, 0.72, 0.15, P.rust, 0.08);
    sq(0.45, 0.17, 0.46, 0.66, 0.1 - sink, fab, -0.06);
  }
}

// ── bleachers (3×2) ─────────────────────────────────────────────────────────────────────────────
// Three tiers rising to the back: each a seat plank and, in front of it, the board the next row up
// puts its feet on; stringers under them; a rail behind the top row. Timber planks on timber, or
// aluminium on galvanised steel. Sat on at the front row's 0.42 (shared SEATS.bleachers).
const ROWS = [
  { seat: 0.42, z: 1.58 },
  { seat: 0.82, z: 0.98 },
  { seat: 1.22, z: 0.38 },
];

function bleachers(m: Model, o: Look) {
  const steel = o.look === 1;
  const plank = steel ? P.alum : C.plank;
  const frame = steel ? C.galv : shade(P.walnut, 1.1);
  const x0 = 0.04;
  const x1 = 2.96;
  const W = x1 - x0;
  const slats = (y: number, zc: number, depth: number, n: number) => {
    const d = depth / n;
    for (let i = 0; i < n; i++)
      m.add(box([W, 0.035, d - 0.012], steel ? 0.004 : 0.006, 1), plank, {
        at: [1.5, y - 0.0175, zc - depth / 2 + d * (i + 0.5)],
        tone: steel ? 1 - 0.04 * (i % 2) : 0.94 + 0.06 * Math.sin(i * 2.3 + zc * 7),
      });
  };
  ROWS.forEach((r, i) => {
    // the seat plank (two boards), its riser under the front; the footboard in front of it
    slats(r.seat, r.z, 0.32, 2);
    if (steel) m.add(box([W, 0.12, 0.012], 0.003), shade(P.alum, 0.85), { at: [1.5, r.seat - 0.095, r.z + 0.15] });
    if (i > 0) slats(ROWS[i - 1].seat, r.z + 0.3, 0.28, 2);
  });
  // the stringers: a stepped frame at each end and two between
  for (const x of [0.12, 1.06, 1.94, 2.88]) {
    const t = steel ? 0.05 : 0.07;
    m.add(box([t, 0.08, 1.9], 0.008), frame, { at: [x, 0.04, 1.0] });
    for (const r of ROWS) {
      m.add(box([t, r.seat - 0.035, t], 0.006), frame, { at: [x, (r.seat - 0.035) / 2, r.z + 0.12] });
      m.add(box([t, 0.06, 0.6], 0.006), frame, { at: [x, r.seat - 0.065, r.z + 0.02] });
    }
    // the diagonal brace
    const len = Math.hypot(1.5, 1.1);
    m.add(box([t * 0.7, 0.05, len], 0.006), frame, { at: [x, 0.62, 1.0], rot: [Math.atan2(1.1, 1.5), 0, 0] });
  }
  // the rail behind the top row: posts and two rails
  for (const x of [0.12, 1.06, 1.94, 2.88])
    m.add(cyl(0.022, 0.022, 0.7, 8), steel ? C.galv : frame, { at: [x, 1.22, 0.1] });
  for (const y of [1.55, 1.9]) m.add(rod(0.022, 0.022, W, "x", 8), steel ? C.galv : frame, { at: [1.5, y, 0.1] });
  for (const x of [0.12, 1.06, 1.94, 2.88]) m.add(ball(0.03, 8), steel ? C.galv : frame, { at: [x, 1.92, 0.1] });
  // row numbers on the risers (steel), and something left behind (story)
  if (steel)
    ROWS.forEach((r, i) => {
      for (let k = 0; k <= i; k++)
        m.add(box([0.012, 0.05, 0.004]), P.ink, { at: [0.3 + k * 0.025, r.seat - 0.09, r.z + 0.158] });
    });
  if (o.seed > 0.6) {
    // a foam finger and a thermos, one row up
    m.add(cyl(0.035, 0.035, 0.2, 10), C.red, { at: [2.3, 0.82, 1.0] });
    m.add(cyl(0.03, 0.03, 0.03, 10), P.steel, { at: [2.3, 1.02, 1.0] });
    m.add(box([0.12, 0.03, 0.34], 0.012, 2), C.gold, { at: [0.8, 1.235, 0.4], rot: [0, 0.4, 0] });
    m.add(box([0.04, 0.03, 0.12], 0.012, 2), C.gold, { at: [0.75, 1.235, 0.22], rot: [0, 0.4, 0] });
  } else if (o.seed < 0.3)
    m.add(cushion([0.34, 0.03, 0.12], 0.3, 2), C.teal, { at: [2.45, 0.435, 1.55], rot: [0, 0.2, 0] });
}

// ── the hammock on its frame (3×1) ─────────────────────────────────────────────────────────────
// A bed of cloth between two spreader bars, its cords fanned up to the hooks of an arched stand:
// laminated larch with canvas (the paint), or a steel stand with a striped cotton bed. Sat on at
// 0.5, leant back into it; it sways, always, a little less with someone in it.
const HOOK_Y = 1.32;

function hammock(m: Model, o: Look) {
  const steel = o.look === 1;
  const frame = steel ? P.steel : 0xb07a46;
  // the stand: a long foot, an arch up to each hook
  m.add(box([2.3, 0.06, 0.1], 0.012, 2), frame, { at: [1.5, 0.03, 0.5] });
  for (const s of [-1, 1]) {
    m.add(box([0.08, 0.04, 0.8], 0.01, 2), frame, { at: [1.5 + s * 1.08, 0.02, 0.5] });
    for (const z of [0.18, 0.82]) m.add(cyl(0.025, 0.025, 0.012, 10), P.rubber, { at: [1.5 + s * 1.08, 0, z] });
    const arch: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const bow = steel ? 0 : 0.1 * Math.sin(t * Math.PI);
      arch.push([
        1.5 + s * (1.1 + 0.32 * Math.sin((t * Math.PI) / 2) + bow),
        0.06 + (HOOK_Y + 0.02) * Math.sin((t * Math.PI) / 2) ** 1.2,
        0.5,
      ]);
    }
    if (steel) m.add(tube(arch, 0.03, 8, 20), frame);
    else m.add(tube(arch, 0.04, 6, 20), frame);
    m.add(cyl(0.03, 0.03, 0.03, 10), frame, { at: [1.5 + s * 1.42, HOOK_Y - 0.01, 0.5] });
    m.add(new TorusGeometry(0.018, 0.005, 4, 10).rotateY(Math.PI / 2), P.chrome, {
      at: [1.5 + s * 1.43, HOOK_Y - 0.03, 0.5],
    });
  }
  // the bed: sagging along, cupped across (its edges up)
  const r = new Rig();
  const sag = o.occupied ? 0.05 : 0;
  const bedY = (x: number, s: number) => {
    const q = (x - 1.5) / 1.2;
    return 0.47 - sag * (1 - q * q) + 0.17 * q * q + 0.11 * (1 - q ** 4) * s * s;
  };
  const B = (u: number, v: number): V3 => {
    const x = 0.3 + 2.4 * u;
    const s = 2 * v - 1;
    const half = 0.27 + 0.05 * (1 - ((x - 1.5) / 1.2) ** 2);
    return [x, bedY(x, s), 0.5 + s * half];
  };
  if (steel) {
    // stripes across its width, a colour each
    const stripes = [0xc8463a, 0xe3a63a, 0x3f8f7b, 0x2e5a8a, 0xe9e1cc, 0xc8463a, 0xe3a63a, 0x3f8f7b];
    const n = stripes.length;
    stripes.forEach((c, i) => {
      r.add(
        sheet(20, 2, (u, v) => B(u, (i + v) / n), 0),
        c,
      );
    });
  } else r.add(sheet(24, 8, B, 0), o.fabric ?? 0xe4d7ba);
  // its hems along both edges, the spreader bars, the cords fanned up to the rings
  for (const v of [0, 1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) pts.push(B(i / 12, v));
    r.add(tube(pts, 0.012, 4, 30), steel ? 0xe9e1cc : shade(0xe4d7ba, 0.86));
  }
  for (const s of [-1, 1]) {
    const x = 1.5 + s * 1.2;
    r.add(rod(0.017, 0.017, 0.72, "z", 8), P.oak, { at: [x, bedY(x, 0) + 0.01, 0.5] });
    for (const z of [0.14, 0.86]) r.add(ball(0.022, 6), P.oak, { at: [x, bedY(x, 0) + 0.01, z] });
    for (let k = 0; k < 7; k++) {
      const z = 0.17 + (k / 6) * 0.66;
      r.add(
        tube(
          [
            [x, bedY(x, 0) + 0.01, z],
            [x + s * 0.11, bedY(x, 0) + 0.38, 0.5 + (z - 0.5) * 0.45],
            [x + s * 0.21, HOOK_Y - 0.05, 0.5],
          ],
          0.004,
          3,
          6,
        ),
        P.cream,
      );
    }
    r.add(new TorusGeometry(0.026, 0.006, 4, 10), P.chrome, { at: [x + s * 0.21, HOOK_Y - 0.05, 0.5] });
  }
  // (story) a pillow at one end, or a book left on it
  if (o.seed > 0.5)
    r.add(cushion([0.42, 0.12, 0.3], 0.4, 3), steel ? 0xe9e1cc : C.teal, {
      at: [0.72, bedY(0.72, 0) + 0.06, 0.5],
      rot: [0, 0, -0.35],
    });
  else if (o.seed < 0.25) {
    r.add(box([0.15, 0.03, 0.22], 0.004), P.oxblood, { at: [2.05, bedY(2.05, 0) + 0.02, 0.48], rot: [0, 0.4, 0.12] });
  }
  r.live(m, [1.5, HOOK_Y - 0.05, 0.5], "x", {
    kind: "nod",
    amp: o.occupied ? 0.015 : 0.035,
    period: 3.8,
    phase: o.seed,
  });
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  egg_chair: eggChair,
  rocking_chair: rockingChair,
  hanging_chair: hangingChair,
  gaming_chair: gamingChair,
  window_seat: windowSeat,
  corner_sofa: cornerSofa,
  floor_cushions: floorCushions,
  bleachers,
  hammock,
};
