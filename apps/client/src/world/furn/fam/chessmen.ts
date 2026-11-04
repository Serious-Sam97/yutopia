import * as T from "three";
import { ball, box, cyl, extrude, lathe, Model, type PartOpts, ring, tube, type V3 } from "../kit";

// Plan 70 (docs/plan/70-the-chess.md), phase 0: the living chessmen — six carved figures on round
// plinths, each a little rig of rigid parts (plinth, body, head, arms, a weapon, the knight's horse,
// the crowns), so they can turn, march, strike, flinch, bow without skinning. Built in "units" (a
// pawn's body about 1 tall) and scaled by UNIT to the table's men (the king ~8.8 cm); the life-size
// board (phase 9) scales the same rigs up. Faceted like the furniture (low segments) for the ink line.

export type ManKind = "p" | "r" | "n" | "b" | "q" | "k";
export type Side = "w" | "b";
/** m a unit at the table (6.5 cm squares) */
export const UNIT = 0.045;

export interface ChessSet {
  name: string;
  /** the two sides' carving, their trim (crowns, shields, bands), their recesses (eyes, the rook's door) */
  body: [number, number];
  trim: [number, number];
  deep: [number, number];
}
export const SETS: ChessSet[] = [
  {
    name: "Walnut and maple",
    body: [0xe2bf88, 0x5c3721],
    trim: [0xc79a52, 0x8a5a32],
    deep: [0x7a5530, 0x24140b],
  },
  {
    name: "Park stone",
    body: [0xd9d5cb, 0x4a4c50],
    trim: [0xbdb7aa, 0x37393c],
    deep: [0x6e6a62, 0x1c1d1f],
  },
  {
    name: "Ivory and obsidian",
    body: [0xece0c6, 0x24222a],
    trim: [0xc9a24a, 0xc9a24a],
    deep: [0x8a7550, 0x0e0d11],
  },
];

/** A rig: its parts by name, each a group at its pivot (rotate them to pose). */
export interface Rig {
  kind: ManKind;
  side: Side;
  root: T.Group;
  part: Record<string, T.Group>;
}

/** What a part's builder draws into: a Model, or one placing it into another (`manInto`). */
type Sink = { add(g: T.BufferGeometry, color: number, o?: PartOpts): unknown };
type Build = (m: Sink) => void;
/** A part: its name, the part it hangs from (null: the man's scaled frame), its pivot there, its shape. */
interface PartDef {
  name: string;
  parent: string | null;
  at: V3;
  build?: Build;
}
const PT = 0.16; // the plinth's top

function piece(parent: T.Object3D, name: string, at: V3, mat: T.Material, build?: Build): T.Group {
  const g = new T.Group();
  g.name = name;
  g.position.set(...at);
  g.rotation.order = "YXZ";
  if (build) {
    const m = new Model(2);
    build(m);
    const mesh = new T.Mesh(m.geometry(), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  parent.add(g);
  return g;
}

/** An arm hanging from its shoulder (the pivot) to the hand, through an elbow. */
function arm(m: Sink, elbow: V3, hand: V3, r: number, c: number) {
  m.add(tube([[0, 0, 0], elbow, hand], r, 6, 6), c);
  m.add(ball(r * 1.25, 6), c, { at: hand });
  m.add(ball(r * 1.15, 6), c, { at: [0, 0, 0] });
}

function eyes(m: Sink, y: number, z: number, dx: number, c: number, s = 1) {
  for (const x of [-dx, dx]) m.add(box([0.035 * s, 0.018 * s, 0.02]), c, { at: [x, y, z] });
}

function plinth(m: Sink, R: number, c: number, t: number) {
  m.add(
    lathe(
      [
        [R, 0],
        [R, 0.06],
        [R * 0.93, 0.09],
        [R * 0.9, 0.12],
        [R * 0.84, PT],
        [0, PT],
      ],
      10,
    ),
    c,
    { tone: 0.92 },
  );
  m.add(ring(R * 0.985, 0.018, 4, 20), t, { at: [0, 0.065, 0] });
}

/** A crown: a band and its points (the queen) or arches and a cross (the king), at its foot. */
function crown(m: Sink, king: boolean, t: number, d: number) {
  const r = king ? 0.115 : 0.085;
  m.add(cyl(r, r * 1.06, king ? 0.07 : 0.055, 10), t);
  m.add(ring(r * 1.04, 0.012, 4, 16), d, { at: [0, 0.012, 0] });
  if (king) {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const [x, z] = [Math.cos(a), Math.sin(a)];
      m.add(
        tube(
          [
            [x * r, 0.06, z * r],
            [x * r * 0.75, 0.15, z * r * 0.75],
            [0, 0.18, 0],
          ],
          0.012,
          4,
          6,
        ),
        t,
      );
      m.add(ball(0.022, 5), t, { at: [Math.cos(a + 0.78) * r * 1.02, 0.075, Math.sin(a + 0.78) * r * 1.02] });
    }
    m.add(ball(0.03, 6), t, { at: [0, 0.19, 0] });
    m.add(box([0.018, 0.08, 0.018]), t, { at: [0, 0.25, 0] });
    m.add(box([0.06, 0.018, 0.018]), t, { at: [0, 0.255, 0] });
  } else
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const at: V3 = [Math.cos(a) * r, 0.05, Math.sin(a) * r];
      m.add(cyl(0.022, 0.004, 0.07, 4), t, { at });
      m.add(ball(0.014, 4), t, { at: [at[0], 0.125, at[2]] });
    }
}

/** A man of `kind`, `side`'s colours in `set`, its plinth's foot at its origin, facing +z, posable. */
export function makeMan(kind: ManKind, side: Side, set: ChessSet, mat: T.Material, scale = UNIT): Rig {
  const root = new T.Group();
  root.rotation.order = "YXZ";
  const scaled = new T.Group();
  scaled.scale.setScalar(scale);
  root.add(scaled);
  const part: Record<string, T.Group> = {};
  for (const p of partsOf(kind, side, set))
    part[p.name] = piece(p.parent ? part[p.parent] : scaled, p.name, p.at, mat, p.build);
  return { kind, side, root, part };
}

/** A man at rest drawn into `m` (a model's frame): its plinth's foot at `at`, turned `yaw` round y
 *  (facing +z at 0), `scale` m a unit. Every part where it rests (the rest pose turns nothing). */
export function manInto(m: Sink, kind: ManKind, side: Side, set: ChessSet, at: V3, yaw: number, scale = UNIT) {
  const defs = partsOf(kind, side, set);
  const pivot = new Map<string, V3>();
  const place = new T.Matrix4()
    .makeTranslation(...at)
    .multiply(new T.Matrix4().makeRotationY(yaw))
    .multiply(new T.Matrix4().makeScale(scale, scale, scale));
  const E = new T.Euler();
  const Q = new T.Quaternion();
  const M = new T.Matrix4();
  for (const p of defs) {
    const base = p.parent ? (pivot.get(p.parent) as V3) : ([0, 0, 0] as V3);
    const o: V3 = [base[0] + p.at[0], base[1] + p.at[1], base[2] + p.at[2]];
    pivot.set(p.name, o);
    p.build?.({
      add(g, color, opts = {}) {
        // (the part's own placing, then the man's, into the model's frame)
        E.set(...(opts.rot ?? [0, 0, 0]), "YXZ");
        Q.setFromEuler(E);
        M.compose(new T.Vector3(...(opts.at ?? [0, 0, 0])), Q, new T.Vector3(...(opts.scale ?? [1, 1, 1])));
        const geo = g.index ? g.toNonIndexed() : g;
        if (geo !== g) g.dispose();
        geo
          .applyMatrix4(M)
          .translate(...o)
          .applyMatrix4(place);
        return m.add(geo, color, { tone: opts.tone, glow: opts.glow });
      },
    });
  }
}

/** A crown alone (the king's or the queen's), at its foot, as one geometry (a dropped one). */
export function crownGeometry(king: boolean, side: Side, set: ChessSet, scale = UNIT): T.BufferGeometry {
  const m = new Model(2);
  const s = side === "w" ? 0 : 1;
  const sink: Sink = {
    add(g, c, o = {}) {
      const geo = g.index ? g.toNonIndexed() : g;
      const E = new T.Euler(...(o.rot ?? [0, 0, 0]), "YXZ");
      geo.applyMatrix4(
        new T.Matrix4().compose(
          new T.Vector3(...(o.at ?? [0, 0, 0])),
          new T.Quaternion().setFromEuler(E),
          new T.Vector3(...(o.scale ?? [1, 1, 1])),
        ),
      );
      geo.scale(scale, scale, scale);
      return m.add(geo, c, { tone: o.tone });
    },
  };
  crown(sink, king, set.trim[s], set.deep[s]);
  return m.geometry();
}

/** A man at rest as one geometry (its colours in it), its plinth's foot at the origin, facing +z. */
export function manGeometry(kind: ManKind, side: Side, set: ChessSet, scale = UNIT): T.BufferGeometry {
  const m = new Model(2);
  manInto(m, kind, side, set, [0, 0, 0], 0, scale);
  return m.geometry();
}

/** The parts of a man (the figures themselves). */
function partsOf(kind: ManKind, side: Side, set: ChessSet): PartDef[] {
  const s = side === "w" ? 0 : 1;
  const c = set.body[s];
  const t = set.trim[s];
  const d = set.deep[s];
  const scaled = null;
  const defs: PartDef[] = [];
  const P = (name: string, parent: string | null, at: V3, build?: Build) => {
    defs.push({ name, parent, at, build });
    return name;
  };
  const R = { p: 0.4, r: 0.46, n: 0.46, b: 0.44, q: 0.48, k: 0.5 }[kind];
  P("plinth", scaled, [0, 0, 0], (m) => plinth(m, R, c, t));

  if (kind === "p") {
    // a foot soldier: helmet, round shield, short spear
    const body = P("body", scaled, [0, PT, 0], (m) => {
      for (const x of [-0.065, 0.065]) m.add(cyl(0.055, 0.062, 0.22, 7), c, { at: [x, 0, 0], tone: 0.9 });
      m.add(
        lathe(
          [
            [0.17, 0.17],
            [0.16, 0.26],
            [0.135, 0.42],
            [0.15, 0.5],
            [0.165, 0.58],
            [0.12, 0.63],
            [0, 0.63],
          ],
          8,
        ),
        c,
      );
      m.add(cyl(0.142, 0.142, 0.035, 8), t, { at: [0, 0.39, 0] });
    });
    const head = P("head", body, [0, 0.62, 0], (m) => {
      m.add(cyl(0.05, 0.055, 0.05, 6), c);
      m.add(ball(0.105, 7), c, { at: [0, 0.14, 0], scale: [1, 1.05, 1] });
      m.add(
        lathe(
          [
            [0.128, 0.12],
            [0.128, 0.155],
            [0.118, 0.2],
            [0.09, 0.245],
            [0.05, 0.268],
            [0, 0.272],
          ],
          8,
        ),
        t,
      );
      m.add(cyl(0.142, 0.142, 0.018, 8), t, { at: [0, 0.135, 0] });
      m.add(box([0.022, 0.085, 0.02]), t, { at: [0, 0.11, 0.112] });
      eyes(m, 0.115, 0.098, 0.042, d);
    });
    void head;
    P("armL", body, [-0.165, 0.55, 0], (m) => {
      arm(m, [-0.05, -0.12, 0.03], [-0.04, -0.2, 0.12], 0.045, c);
      m.add(cyl(0.19, 0.19, 0.04, 10), t, { at: [-0.04, -0.17, 0.2], rot: [Math.PI / 2, 0, 0] });
      m.add(ring(0.19, 0.02, 4, 18), d, { at: [-0.04, -0.17, 0.22], rot: [Math.PI / 2, 0, 0] });
      m.add(ball(0.05, 6), c, { at: [-0.04, -0.17, 0.24] });
    });
    P("armR", body, [0.165, 0.55, 0], (m) => {
      arm(m, [0.05, -0.12, 0.02], [0.04, -0.19, 0.09], 0.045, c);
      m.add(cyl(0.02, 0.02, 0.92, 6), d, { at: [0.04, -0.55, 0.09] });
      m.add(
        lathe(
          [
            [0.03, 0],
            [0.045, 0.04],
            [0, 0.15],
          ],
          4,
        ),
        t,
        { at: [0.04, 0.36, 0.09] },
      );
    });
  } else if (kind === "r") {
    // a walking tower: battlements for a crown, a door for a mouth, stone fists
    const body = P("body", scaled, [0, PT, 0], (m) => {
      for (const x of [-0.12, 0.12]) m.add(box([0.14, 0.15, 0.2], 0.03), c, { at: [x, 0.075, 0.02], tone: 0.9 });
      m.add(
        lathe(
          [
            [0.31, 0.12],
            [0.31, 0.18],
            [0.27, 0.23],
            [0.255, 0.8],
            [0.3, 0.84],
            [0.3, 0.92],
            [0, 0.92],
          ],
          8,
        ),
        c,
      );
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        m.add(box([0.12, 0.14, 0.08], 0.01), c, {
          at: [Math.sin(a) * 0.255, 0.99, Math.cos(a) * 0.255],
          rot: [0, a, 0],
        });
      }
      // (the face: two slit windows for eyes, a brow, an arched door for a mouth)
      eyes(m, 0.6, 0.262, 0.08, d, 1.6);
      m.add(box([0.26, 0.035, 0.06]), c, { at: [0, 0.67, 0.262], tone: 0.88 });
      m.add(
        extrude(
          [
            [-0.07, 0],
            [0.07, 0],
            [0.07, 0.1],
            [0.04, 0.15],
            [0, 0.165],
            [-0.04, 0.15],
            [-0.07, 0.1],
          ],
          0.03,
        ),
        d,
        { at: [0, 0.22, 0.258] },
      );
      // (a few stones standing out of the wall)
      for (let i = 0; i < 12; i++) {
        const a = i * 2.39 + 0.4;
        const y = 0.3 + ((i * 0.37) % 1) * 0.45;
        if (Math.abs(Math.sin(a)) < 0.45 && Math.cos(a) > 0) continue; // (not over the face)
        m.add(box([0.09, 0.05, 0.03]), c, {
          at: [Math.sin(a) * 0.262, y, Math.cos(a) * 0.262],
          rot: [0, a, 0],
          tone: 0.86 + (i % 3) * 0.06,
        });
      }
    });
    for (const [n, x] of [
      ["armL", -1],
      ["armR", 1],
    ] as const)
      P(n, body, [x * 0.29, 0.66, 0], (m) => {
        arm(m, [x * 0.09, -0.14, 0.02], [x * 0.08, -0.28, 0.06], 0.065, c);
        m.add(box([0.15, 0.14, 0.15], 0.035), c, { at: [x * 0.08, -0.33, 0.07], tone: 0.95 });
      });
  } else if (kind === "n") {
    // a horse (rearing about its hind hooves), its rider with a lance
    const horse = P("horse", scaled, [0, PT, -0.24], (m) => {
      const z0 = 0.24; // (the horse's middle, from the hind hooves)
      m.add(ball(0.22, 8), c, { at: [0, 0.5, z0], scale: [0.9, 0.95, 1.6] });
      m.add(ball(0.13, 7), c, { at: [0, 0.56, z0 + 0.2], tone: 1.02 });
      for (const [x, z] of [
        [-0.09, z0 - 0.24],
        [0.09, z0 - 0.24],
        [-0.09, z0 + 0.25],
        [0.09, z0 + 0.25],
      ]) {
        m.add(cyl(0.048, 0.068, 0.4, 6), c, { at: [x * 1.1, 0.04, z] });
        m.add(cyl(0.058, 0.062, 0.05, 6), d, { at: [x * 1.1, 0, z] });
      }
      m.add(
        tube(
          [
            [0, 0.56, z0 + 0.2],
            [0, 0.74, z0 + 0.34],
            [0, 0.9, z0 + 0.4],
          ],
          0.095,
          7,
          6,
        ),
        c,
      );
      m.add(box([0.13, 0.14, 0.32], 0.035), c, { at: [0, 0.9, z0 + 0.52], rot: [0.62, 0, 0] });
      m.add(box([0.11, 0.1, 0.1], 0.03), c, { at: [0, 0.79, z0 + 0.64], rot: [0.62, 0, 0], tone: 0.9 });
      for (const x of [-0.045, 0.045]) m.add(cyl(0.025, 0.004, 0.09, 4), c, { at: [x, 1.0, z0 + 0.42] });
      eyes(m, 0.93, z0 + 0.5, 0.068, d);
      // (the mane, a ridge of tufts down the neck; the tail)
      for (let i = 0; i < 6; i++)
        m.add(box([0.04, 0.07, 0.06]), t, { at: [0, 0.98 - i * 0.07, z0 + 0.38 - i * 0.045], rot: [-0.6, 0, 0] });
      m.add(
        tube(
          [
            [0, 0.6, z0 - 0.3],
            [0, 0.48, z0 - 0.42],
            [0, 0.26, z0 - 0.4],
          ],
          0.04,
          5,
          6,
        ),
        t,
      );
      m.add(box([0.36, 0.035, 0.22], 0.01), t, { at: [0, 0.69, z0 - 0.02] });
    });
    const body = P("body", horse, [0, 0.72, 0.2], (m) => {
      for (const x of [-0.16, 0.16]) m.add(box([0.065, 0.24, 0.12], 0.02), c, { at: [x, -0.08, 0.04], tone: 0.9 });
      m.add(
        lathe(
          [
            [0.12, 0],
            [0.13, 0.12],
            [0.145, 0.27],
            [0.09, 0.33],
            [0, 0.33],
          ],
          8,
        ),
        c,
      );
    });
    P("head", body, [0, 0.32, 0], (m) => {
      m.add(ball(0.088, 7), c, { at: [0, 0.1, 0] });
      m.add(
        lathe(
          [
            [0.1, 0.07],
            [0.1, 0.13],
            [0.075, 0.18],
            [0, 0.2],
          ],
          8,
        ),
        t,
      );
      m.add(box([0.12, 0.03, 0.02]), d, { at: [0, 0.1, 0.09] });
      m.add(
        tube(
          [
            [0, 0.19, 0.06],
            [0, 0.26, 0],
            [0, 0.22, -0.1],
            [0, 0.12, -0.15],
          ],
          0.022,
          5,
          8,
        ),
        t,
      );
    });
    P("armR", body, [0.14, 0.27, 0], (m) => {
      arm(m, [0.05, -0.08, 0.06], [0.04, -0.12, 0.13], 0.035, c);
      m.add(cyl(0.018, 0.012, 0.95, 6), d, { at: [0.04, -0.3, 0.13] });
      m.add(
        lathe(
          [
            [0.03, 0],
            [0, 0.12],
          ],
          4,
        ),
        t,
        { at: [0.04, 0.65, 0.13] },
      );
      m.add(
        extrude(
          [
            [0, 0],
            [0.16, 0.035],
            [0, 0.08],
          ],
          0.008,
        ),
        t,
        { at: [0.045, 0.52, 0.13] },
      );
    });
    P("armL", body, [-0.14, 0.27, 0], (m) => {
      arm(m, [-0.04, -0.1, 0.04], [-0.06, -0.14, 0.09], 0.035, c);
      m.add(
        extrude(
          [
            [-0.08, 0.1],
            [0.08, 0.1],
            [0.07, -0.02],
            [0, -0.13],
            [-0.07, -0.02],
          ],
          0.03,
          0.006,
        ),
        t,
        { at: [-0.11, -0.12, 0.08], rot: [0, -1.2, 0] },
      );
    });
  } else if (kind === "b") {
    // a robed figure: a tall mitre, a crook, a book
    const body = P("body", scaled, [0, PT, 0], (m) => {
      m.add(
        lathe(
          [
            [0.3, 0],
            [0.29, 0.05],
            [0.22, 0.35],
            [0.16, 0.62],
            [0.17, 0.78],
            [0.2, 0.88],
            [0.12, 0.95],
            [0, 0.95],
          ],
          9,
        ),
        c,
      );
      m.add(
        tube(
          [
            [0, 0.06, 0.29],
            [0, 0.4, 0.2],
            [0, 0.7, 0.172],
            [0, 0.88, 0.2],
          ],
          0.03,
          4,
          8,
        ),
        t,
      );
      m.add(cyl(0.165, 0.165, 0.035, 9), t, { at: [0, 0.62, 0] });
    });
    P("head", body, [0, 0.94, 0], (m) => {
      m.add(cyl(0.045, 0.05, 0.05, 6), c);
      m.add(ball(0.1, 7), c, { at: [0, 0.12, 0] });
      eyes(m, 0.13, 0.09, 0.04, d);
      m.add(cyl(0.004, 0.07, 0.15, 6), c, { at: [0, -0.02, 0.055], tone: 0.92 });
      m.add(
        extrude(
          [
            [-0.1, 0],
            [0.1, 0],
            [0.11, 0.14],
            [0, 0.32],
            [-0.11, 0.14],
          ],
          0.16,
          0.01,
        ),
        c,
        { at: [0, 0.18, -0.01] },
      );
      m.add(box([0.215, 0.035, 0.17]), t, { at: [0, 0.2, -0.01] });
      m.add(box([0.03, 0.2, 0.17]), t, { at: [0, 0.32, -0.01] });
      m.add(box([0.015, 0.1, 0.18]), d, { at: [0.03, 0.4, -0.01], rot: [0, 0, -0.6] });
    });
    P("armR", body, [0.19, 0.82, 0], (m) => {
      arm(m, [0.06, -0.14, 0.04], [0.06, -0.25, 0.11], 0.045, c);
      m.add(cyl(0.02, 0.02, 1.25, 6), t, { at: [0.06, -0.8, 0.11] });
      m.add(
        tube(
          [
            [0.06, 0.44, 0.11],
            [0.06, 0.55, 0.1],
            [0.06, 0.6, 0.16],
            [0.06, 0.56, 0.22],
            [0.06, 0.5, 0.21],
          ],
          0.022,
          5,
          10,
        ),
        t,
      );
    });
    P("armL", body, [-0.19, 0.82, 0], (m) => {
      arm(m, [-0.05, -0.15, 0.05], [0.02, -0.22, 0.15], 0.045, c);
      m.add(box([0.13, 0.16, 0.045], 0.008), t, { at: [0.0, -0.2, 0.19], rot: [-0.3, 0.2, 0] });
      m.add(box([0.115, 0.145, 0.05]), set.body[0], { at: [0.0, -0.2, 0.19], rot: [-0.3, 0.2, 0], tone: 0.95 });
    });
  } else if (kind === "q") {
    // crowned, a long gown, a slim sword held low
    const body = P("body", scaled, [0, PT, 0], (m) => {
      m.add(
        lathe(
          [
            [0.36, 0],
            [0.35, 0.04],
            [0.28, 0.3],
            [0.2, 0.6],
            [0.13, 0.85],
            [0.15, 0.95],
            [0.17, 1.07],
            [0.14, 1.14],
            [0.06, 1.18],
            [0, 1.18],
          ],
          10,
        ),
        c,
      );
      m.add(cyl(0.135, 0.135, 0.04, 10), t, { at: [0, 0.84, 0] });
      m.add(ring(0.355, 0.022, 4, 22), t, { at: [0, 0.035, 0] });
      for (let i = 0; i < 5; i++)
        m.add(box([0.012, 0.6, 0.01]), c, {
          at: [Math.sin(i * 1.26) * 0.25, 0.3, Math.cos(i * 1.26) * 0.25],
          rot: [Math.cos(i * 1.26) * 0.27, 0, -Math.sin(i * 1.26) * 0.27],
          tone: 0.88,
        });
    });
    const head = P("head", body, [0, 1.17, 0], (m) => {
      m.add(cyl(0.042, 0.05, 0.07, 6), c);
      m.add(ball(0.095, 7), c, { at: [0, 0.14, 0], scale: [0.95, 1.1, 1] });
      m.add(ball(0.105, 7), c, { at: [0, 0.15, -0.025], scale: [1.02, 1.05, 1], tone: 0.86 });
      m.add(
        tube(
          [
            [0, 0.12, -0.08],
            [0, 0.0, -0.11],
            [0, -0.12, -0.1],
          ],
          0.06,
          6,
          6,
        ),
        c,
        { tone: 0.86 },
      );
      eyes(m, 0.14, 0.088, 0.038, d);
    });
    P("crown", head, [0, 0.22, 0], (m) => crown(m, false, t, d));
    P("armR", body, [0.17, 1.07, 0], (m) => {
      arm(m, [0.08, -0.22, 0.04], [0.08, -0.4, 0.13], 0.04, c);
      // the sword, point down
      m.add(box([0.12, 0.022, 0.03]), t, { at: [0.08, -0.45, 0.13] });
      m.add(box([0.032, 0.6, 0.01]), set.trim[0] === set.trim[1] ? 0xd8d8d0 : c, {
        at: [0.08, -0.76, 0.13],
        tone: 1.05,
      });
      m.add(ball(0.025, 5), t, { at: [0.08, -0.33, 0.13] });
    });
    P("armL", body, [-0.17, 1.07, 0], (m) => arm(m, [-0.12, -0.16, -0.02], [-0.05, -0.3, 0.06], 0.04, c));
  } else {
    // crowned and bearded, a cloak, a broadsword held point-down in both hands
    const body = P("body", scaled, [0, PT, 0], (m) => {
      m.add(
        lathe(
          [
            [0.36, 0],
            [0.36, 0.05],
            [0.3, 0.3],
            [0.24, 0.7],
            [0.22, 0.95],
            [0.27, 1.2],
            [0.25, 1.27],
            [0.12, 1.32],
            [0, 1.32],
          ],
          10,
        ),
        c,
      );
      m.add(cyl(0.232, 0.232, 0.05, 10), t, { at: [0, 0.88, 0] });
      // the mantle: an ermine cape over his shoulders, its tails dotted
      m.add(
        lathe(
          [
            [0.3, 1.0],
            [0.31, 1.04],
            [0.29, 1.16],
            [0.22, 1.28],
            [0.12, 1.33],
            [0, 1.34],
          ],
          10,
        ),
        c,
        { tone: 1.12 },
      );
      // (its hem, trimmed)
      m.add(ring(0.302, 0.02, 4, 20), t, { at: [0, 1.0, 0] });
    });
    const head = P("head", body, [0, 1.31, 0], (m) => {
      m.add(cyl(0.055, 0.06, 0.07, 6), c);
      m.add(ball(0.125, 7), c, { at: [0, 0.17, 0] });
      m.add(cyl(0.004, 0.1, 0.2, 7), c, { at: [0, -0.03, 0.06], tone: 0.9 });
      m.add(box([0.1, 0.02, 0.035]), c, { at: [0, 0.115, 0.112], tone: 0.9 });
      eyes(m, 0.185, 0.112, 0.045, d, 0.7);
    });
    P("crown", head, [0, 0.27, 0], (m) => crown(m, true, t, d));
    P("armR", body, [0.3, 1.12, 0.02], (m) => {
      arm(m, [0.06, -0.16, 0.16], [-0.27, -0.2, 0.4], 0.055, c);
      // the broadsword, held at its grip, point down on the plinth
      m.add(ball(0.04, 6), t, { at: [-0.3, -0.08, 0.42] });
      m.add(cyl(0.024, 0.024, 0.14, 6), d, { at: [-0.3, -0.24, 0.42] });
      m.add(box([0.26, 0.035, 0.045]), t, { at: [-0.3, -0.26, 0.42] });
      m.add(
        extrude(
          [
            [-0.04, 0],
            [0.04, 0],
            [0.035, -0.8],
            [0, -0.88],
            [-0.035, -0.8],
          ],
          0.018,
        ),
        set.trim[0] === set.trim[1] ? 0xd8d8d0 : c,
        { at: [-0.3, -0.27, 0.42], tone: 1.08 },
      );
    });
    const armL = P("armL", body, [-0.3, 1.12, 0.02], (m) => arm(m, [-0.06, -0.16, 0.16], [0.27, -0.16, 0.4], 0.055, c));
    // (where his left hand is: the crown goes there when he takes it off)
    P("handL", armL, [0.27, -0.12, 0.4]);
  }
  return defs;
}

// ── poses ─────────────────────────────────────────────────────────────────────────────────────────
/** Rotations (x, y, z) on a rig's parts; a part not named rests. */
export type Pose = Partial<Record<string, V3>>;
export const POSES: Record<string, Pose> = {
  rest: {},
  // picked: the weapon raised before the face
  salute: { armR: [-1.5, 0, 0.15], head: [-0.15, 0, 0] },
  // walking: leant into it
  step: { body: [0.14, 0, 0.04], armL: [0.3, 0, 0], armR: [-0.3, 0, 0] },
  // the blow drawn back, then landing
  windup: { body: [-0.14, 0, 0], armR: [-2.7, 0, 0.1], armL: [0.4, 0, 0], head: [-0.1, 0, 0] },
  strike: { body: [0.3, 0, 0], armR: [-0.7, 0, 0], armL: [0.5, 0, 0], head: [0.15, 0, 0] },
  // the pawn's spear thrust
  thrust: { body: [0.25, 0, 0], armR: [-1.35, 0, 0], armL: [-0.4, 0, 0] },
  // under threat: shield up, leaning away
  flinch: { body: [-0.22, 0, 0], armL: [-1.25, 0.2, -0.35], head: [0.25, 0, 0] },
  // in check: the sword up on guard
  guard: { body: [-0.1, 0, 0], armR: [-1.15, 0, 0], armL: [-1.15, 0, 0], head: [-0.1, 0, 0] },
  // a bow (a draw), or beaten
  bow: { body: [0.42, 0, 0], head: [0.35, 0, 0], armR: [0.1, 0, 0] },
  beaten: { body: [0.2, 0, 0], head: [0.55, 0, 0], armR: [0.25, 0, 0.1], armL: [0.2, 0, 0] },
  // the king reaching for his crown
  uncrown: { body: [0.05, 0, 0], head: [0.3, 0, 0], armL: [-2.75, 0, 0.55], armR: [0.2, 0, 0] },
  // victory: weapons up
  cheer: { body: [-0.1, 0, 0], armR: [-2.9, 0, 0.1], head: [-0.3, 0, 0], armL: [-0.6, 0, -0.3] },
  // the knight's horse up on its hind legs, the rider leant in
  rear: { horse: [-0.62, 0, 0], body: [0.3, 0, 0], armR: [-0.9, 0, 0] },
  leap: { horse: [-0.18, 0, 0], body: [0.2, 0, 0], armR: [-0.6, 0, 0] },
  land: { horse: [0.16, 0, 0], body: [-0.12, 0, 0], armR: [-0.3, 0, 0] },
};

export function pose(r: Rig, p: Pose | string, k = 1) {
  const q = typeof p === "string" ? POSES[p] : p;
  for (const [name, g] of Object.entries(r.part)) {
    const v = q[name];
    // (the rook has no weapon: its fists stand in; the king swings both)
    if (v) g.rotation.set(v[0] * k, v[1] * k, v[2] * k);
    else if (name !== "plinth") g.rotation.set(0, 0, 0);
  }
  if (r.kind === "k" && q.armR && !q.armL && r.part.armL) {
    const v = q.armR;
    r.part.armL.rotation.set(v[0] * k, -v[1] * k, -v[2] * k);
  }
}

export const KINDS: ManKind[] = ["p", "r", "n", "b", "q", "k"];
export const NAMES: Record<ManKind, string> = {
  p: "Pawn",
  r: "Rook",
  n: "Knight",
  b: "Bishop",
  q: "Queen",
  k: "King",
};
