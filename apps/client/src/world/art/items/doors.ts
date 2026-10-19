import { doorLeaves, doorShut, doorSlides, openingCut } from "@yutopia/shared";
import { paintOf } from "./home";
import { type Draw, type Face, type Mat, type Sketch, sh, type V3 } from "./kit";
import { K, M } from "./pal";
import { WALL_HALF_T } from "./walls";

// Doors set into a wall (shared openings.ts), drawn for both views. Local
// coords as the scene sets them: rot 0 = edges along x from (0, 0), the wall
// line at y = 0, its faces at ±T; +y is the side iso looks at (rot 3 on west
// edges turns that to +x). A door is two parts the scene sorts apart:
//   "edge" — the frame (jambs through the wall, casings on its faces, plinth
//            blocks, a cornice) and any shut leaf, in the wall line;
//   "leaf" — one open leaf (props._leaf: which), swung 90° on its hinges into
//            the tile on one side (props.swing −1: the other), or a barn door's
//            leaf and rail, always (it rolls along the wall's face).
// props._thumb draws it all, shut (the catalog). Kinds:
//   door        — four raised panels, a brass lever, hinges, a kick plate (props.color: its paint);
//                 props.glass: a studio glass door, slim stiles, a frosted band, a push bar
//   door_double — two leaves across two edges, glazed above a panel, handles meeting in the middle
//   door_studio — a padded, buttoned leather door with a big porthole; ON AIR lights while it's shut
//   door_barn   — planks and a Z brace on an iron rail, rolled aside to open
//   door_saloon — two louvered half-doors that swing as people pass
//   archway     — no door: a moulded arch with a keystone
// A locked door shows a red lamp on its head casing.

type Props = Record<string, unknown>;
const T = WALL_HALF_T;
const C = T + 0.028; // casings stand this far out from the wall line
const J = 0.07; // jamb
const TH = 0.034; // a leaf's half thickness
const GLASS: Mat = { c: "#a9c2d0", top: "#a9c2d0", left: "#a9c2d0", right: "#8ea7b5", flat: true };
const IRON: Mat = { c: "#2b2724", top: "#45403a" };

// ── a leaf: boxes and face details in its own coords ─────────────────────────
// u from its hinge (0) to its free edge (w), z up, t across its thickness. Shut,
// it lies in the wall line (u along x, from `hinge` one way or the other);
// open, it stands square to the wall in the tile on `side`, its hinge edge at
// the jamb. Details go on both faces (iso shows the one it can see).
interface Leaf {
  hinge: number; // x of its hinge edge
  dir: 1 | -1; // which way it runs from there, shut
  w: number;
}
interface LeafDraw {
  rect: (u0: number, u1: number, z0: number, z1: number, fill: string, o?: Opt) => void;
  line: (u0: number, z0: number, u1: number, z1: number, stroke: string, sw?: number, op?: number) => void;
  ell: (u: number, z: number, ru: number, rz: number, fill: string, o?: Opt) => void;
}
type Opt = { stroke?: string; sw?: number; op?: number; glow?: boolean };
type LeafBox = (
  u0: number,
  u1: number,
  z0: number,
  z1: number,
  mat: Mat,
  o?: { th?: number; op?: number; line?: number; paint?: (d: LeafDraw) => void },
) => void;

function leafBoxes(s: Sketch, L: Leaf, open: boolean, side: 1 | -1): LeafBox {
  return (u0, u1, z0, z1, mat, o = {}) => {
    const th = o.th ?? TH;
    const along = (u: number) => L.hinge + L.dir * u;
    if (!open) {
      const x0 = Math.min(along(u0), along(u1));
      s.box(
        { x: x0, y: -th, w: Math.abs(u1 - u0), d: 2 * th, z: z0, h: z1 - z0, mat, op: o.op, line: o.line ?? 0.9 },
        o.paint &&
          ((d) => {
            for (const [f, y] of [
              ["s", th],
              ["n", -th],
            ] as const)
              o.paint?.(drawer(d, f, (u, z) => [along(u), y, z]));
          }),
      );
      return;
    }
    // swung: its thickness at the hinge, its length out from the wall
    const cx = L.hinge + L.dir * TH;
    const out = (u: number) => (side > 0 ? T + 0.012 + u : -T - 0.012 - u);
    const y0 = Math.min(out(u0), out(u1));
    s.box(
      { x: cx - th, y: y0, w: 2 * th, d: Math.abs(u1 - u0), z: z0, h: z1 - z0, mat, op: o.op, line: o.line ?? 0.9 },
      o.paint &&
        ((d) => {
          for (const [f, x] of [
            ["e", cx + th],
            ["w", cx - th],
          ] as const)
            o.paint?.(drawer(d, f, (u, z) => [x, out(u), z]));
        }),
    );
  };
}

function drawer(d: Draw, f: Face, P: (u: number, z: number) => V3): LeafDraw {
  return {
    rect: (u0, u1, z0, z1, fill, o) => d.poly(f, [P(u0, z1), P(u1, z1), P(u1, z0), P(u0, z0)], fill, o),
    line: (u0, z0, u1, z1, stroke, sw = 0.7, op = 1) => d.line(f, P(u0, z0), P(u1, z1), stroke, sw, op),
    ell: (u, z, ru, rz, fill, o) => {
      const pts: V3[] = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        pts.push(P(u + Math.cos(a) * ru, z + Math.sin(a) * rz));
      }
      d.poly(f, pts, fill, o);
    },
  };
}

// A raised panel: a sunk field, a lit top and left bevel, a dark bottom and right.
function raised(d: LeafDraw, u0: number, u1: number, z0: number, z1: number, c: string) {
  d.rect(u0, u1, z0, z1, sh(c, 0.84));
  d.rect(u0 + 0.035, u1 - 0.035, z0 + 2.6, z1 - 2.6, sh(c, 1.04));
  d.line(u0, z1, u1, z1, sh(c, 1.32), 0.6);
  d.line(u0, z0, u0, z1, sh(c, 1.22), 0.6);
  d.line(u0, z0, u1, z0, sh(c, 0.62), 0.6);
  d.line(u1, z0, u1, z1, sh(c, 0.7), 0.6);
  for (const [a, b, e, g] of [
    [u0, z1, u0 + 0.035, z1 - 2.6],
    [u1, z1, u1 - 0.035, z1 - 2.6],
    [u0, z0, u0 + 0.035, z0 + 2.6],
    [u1, z0, u1 - 0.035, z0 + 2.6],
  ])
    d.line(a, b, e, g, sh(c, 0.74), 0.4, 0.8);
}

// Brass: a lever on a backplate with a keyhole (the latch side), hinges, a kick plate.
function lever(d: LeafDraw, u: number, back: number) {
  d.rect(u - 0.022, u + 0.022, 31, 46, K.brass, { stroke: "#8a6a2c", sw: 0.4 });
  d.ell(u, 41.5, 0.016, 1.6, sh(K.brass, 1.2));
  d.line(u, 41.5, u - back * 0.13, 41.2, sh(K.brass, 1.05), 1.9);
  d.line(u, 41.5, u - back * 0.13, 41.2, "#8a6a2c", 0.4, 0.6);
  d.ell(u, 35, 0.006, 1.3, "#2a1a12");
}
function hinges(d: LeafDraw, z1: number) {
  for (const z of [9, z1 / 2, z1 - 11])
    d.rect(0.004, 0.03, z - 2.5, z + 2.5, sh(K.brass, 0.9), { stroke: "#7a5a24", sw: 0.3 });
}
// (no outline: iso cuts things into slices, and an outline shows at every cut)
const kick = (d: LeafDraw, w: number) => {
  d.rect(0.05, w - 0.05, 1, 7, K.brass);
  d.line(0.05, 7, w - 0.05, 7, sh(K.brass, 1.3), 0.5);
  d.line(0.05, 1, w - 0.05, 1, "#8a6a2c", 0.5);
};

// ── the leaves ───────────────────────────────────────────────────────────────
function panelLeaf(b: LeafBox, w: number, h: number, col: string) {
  b(
    0,
    w,
    0,
    h,
    { c: col, top: sh(col, 1.18), left: sh(col, 1.06), right: sh(col, 0.86) },
    {
      paint: (d) => {
        const m = 0.075;
        const mid = w / 2;
        for (const [u0, u1] of [
          [m, mid - 0.025],
          [mid + 0.025, w - m],
        ]) {
          raised(d, u0, u1, 11, 36, col);
          raised(d, u0, u1, 44, h - 8, col);
        }
        hinges(d, h);
        lever(d, w - 0.075, 1);
        kick(d, w);
      },
    },
  );
}

function glassLeaf(b: LeafBox, w: number, h: number, col: string) {
  const frame: Mat = { c: col, top: sh(col, 1.18) };
  const st = 0.075;
  b(0, st, 0, h, frame, { paint: (d) => hinges(d, h) });
  b(w - st, w, 0, h, frame);
  b(st, w - st, 0, 11, frame, { paint: (d) => d.rect(0.0, w - 2 * st, 1.5, 6.5, sh(col, 0.86)) });
  b(st, w - st, h - 8, h, frame);
  b(st, w - st, 11, h - 8, GLASS, {
    th: 0.008,
    op: 0.32,
    line: 0.5,
    paint: (d) => {
      d.rect(st + 0.04, st + 0.22, h - 26, h - 11, "#ffffff", { op: 0.34 });
      d.rect(st + 0.04, st + 0.11, 16, h - 26, "#ffffff", { op: 0.16 });
      // a frosted band at eye level
      d.rect(st, w - st, 55, 61, "#eef3f5", { op: 0.55 });
      for (let u = st + 0.04; u < w - st; u += 0.05) d.line(u, 55.5, u + 0.02, 60.5, "#ffffff", 0.4, 0.6);
    },
  });
  // the push bar, out of both faces
  b(st + 0.04, w - st - 0.04, 38.5, 41.5, M.brass, {
    th: TH + 0.028,
    line: 0.6,
    paint: (d) => d.line(st + 0.05, 41, w - st - 0.05, 41, sh(K.brass, 1.3), 0.5),
  });
}

function doubleLeaf(b: LeafBox, w: number, h: number, col: string) {
  const frame: Mat = { c: col, top: sh(col, 1.18), left: sh(col, 1.06), right: sh(col, 0.86) };
  const st = 0.08;
  const sill = 44;
  b(0, w, 0, sill, frame, {
    paint: (d) => {
      raised(d, st, w - st, 9, sill - 6, col);
      hinges(d, h);
      kick(d, w);
    },
  });
  b(0, st, sill, h, frame);
  b(w - st, w, sill, h, frame, { paint: (d) => lever(d, w - 0.05, 1) });
  b(st, w - st, h - 8, h, frame);
  b(st, w - st, sill, h - 8, GLASS, {
    th: 0.008,
    op: 0.32,
    line: 0.5,
    paint: (d) => {
      d.rect(st + 0.04, st + 0.2, h - 24, h - 11, "#ffffff", { op: 0.34 });
      d.rect(st + 0.04, st + 0.1, sill + 4, h - 24, "#ffffff", { op: 0.16 });
    },
  });
  // glazing bars: three panes high, two wide
  const bar: Mat = { c: col, top: sh(col, 1.18), flat: true };
  b(w / 2 - 0.012, w / 2 + 0.012, sill, h - 8, bar, { th: 0.014, line: 0.4 });
  for (const z of [sill + (h - 8 - sill) / 3, sill + (2 * (h - 8 - sill)) / 3])
    b(st, w - st, z - 0.9, z + 0.9, bar, { th: 0.014, line: 0.4 });
}

function studioLeaf(b: LeafBox, w: number, h: number, col: string) {
  const pad: Mat = { c: col, top: sh(col, 1.15), left: sh(col, 1.05), right: sh(col, 0.82) };
  b(0, w, 0, h, pad, {
    th: TH + 0.012,
    paint: (d) => {
      // buttoned padding: diamonds of seams, a brass stud at each crossing
      const u0 = 0.07;
      const u1 = w - 0.07;
      d.rect(u0, u1, 8, h - 6, sh(col, 0.94));
      const cols = 4;
      const du = (u1 - u0) / cols;
      for (let r = 0; r < 9; r++)
        for (let c = 0; c <= cols; c++) {
          const u = u0 + c * du + (r % 2 ? du / 2 : 0);
          const z = 12 + r * 8.6;
          if (u > u1 + 1e-6 || z > h - 8) continue;
          if (Math.hypot((u - w / 2) / 0.17, (z - 60) / 9) < 1.25) continue; // the porthole
          d.line(u - du / 2, z - 4.3, u, z, sh(col, 0.7), 0.5, 0.8);
          d.line(u, z, u + du / 2, z - 4.3, sh(col, 0.7), 0.5, 0.8);
          d.ell(u, z, 0.012, 1, sh(K.brass, 0.95));
        }
      // the porthole: a brass ring, deep blue glass, a glint
      d.ell(w / 2, 60, 0.17, 9, K.brass, { stroke: "#7a5a24", sw: 0.5 });
      d.ell(w / 2, 60, 0.135, 7.2, "#1d2c38");
      d.ell(w / 2, 60, 0.1, 5.4, "#27404f");
      d.line(w / 2 - 0.07, 63, w / 2 - 0.02, 66, "#ffffff", 0.9, 0.55);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        d.ell(w / 2 + Math.cos(a) * 0.153, 60 + Math.sin(a) * 8.1, 0.007, 0.55, sh(K.brass, 0.7));
      }
      // a heavy pull bar and a kick plate
      d.rect(w - 0.12, w - 0.085, 26, 50, sh(K.brass, 1.05), { stroke: "#7a5a24", sw: 0.45 });
      hinges(d, h);
      kick(d, w);
    },
  });
}

function barnLeaf(s: Sketch, n: number, h: number, col: string, open: boolean, dir: 1 | -1) {
  // on the face it opens from (+y), rolled `dir` along the wall when open
  const x0 = open ? dir * 0.92 : 0;
  const y0 = T + 0.012;
  const d0 = 0.05;
  const planks = 6;
  s.box(
    { x: x0, y: y0, w: n, d: d0, z: 0, h: h + 2, mat: { c: col, top: sh(col, 1.16), right: sh(col, 0.84) }, line: 0.9 },
    (d) => {
      const Y = y0 + d0;
      const P = (u: number, z: number): V3 => [x0 + u, Y, z];
      for (let i = 1; i < planks; i++) d.line("s", P(i / planks, 1), P(i / planks, h + 1), sh(col, 0.7), 0.6, 0.9);
      for (let i = 0; i < planks; i++) {
        const u = (i + 0.4) / planks;
        d.line("s", P(u, 3), P(u + 0.02, h - 2), sh(col, 1.12), 0.4, 0.5);
      }
      // rails top and bottom and the Z brace, a shade darker
      const band = (z0: number, z1: number) =>
        d.poly("s", [P(0.04, z1), P(n - 0.04, z1), P(n - 0.04, z0), P(0.04, z0)], sh(col, 0.86), {
          stroke: sh(col, 0.66),
          sw: 0.5,
        });
      band(8, 15);
      band(h - 13, h - 6);
      d.poly("s", [P(0.08, 15), P(0.16, 15), P(n - 0.08, h - 13), P(n - 0.16, h - 13)], sh(col, 0.86), {
        stroke: sh(col, 0.66),
        sw: 0.5,
      });
      // iron: straps at the hangers, a pull on the leading edge
      for (const u of [0.18, n - 0.18])
        d.poly("s", [P(u - 0.03, h + 1), P(u + 0.03, h + 1), P(u + 0.03, h - 9), P(u - 0.03, h - 9)], IRON.c);
      const lead = dir > 0 ? 0.1 : n - 0.1;
      d.poly("s", [P(lead - 0.015, 52), P(lead + 0.015, 52), P(lead + 0.015, 30), P(lead - 0.015, 30)], IRON.c);
    },
  );
  // the rail it hangs from, along the face over both places it can be, and its wheels
  const r0 = Math.min(0, dir * 0.92);
  s.box({ x: r0 - 0.02, y: y0 + d0 + 0.004, w: n + 0.96, d: 0.022, z: h + 4, h: 2.4, mat: IRON, line: 0.6 });
  for (const u of [0.18, n - 0.18])
    s.box({ x: x0 + u - 0.05, y: y0 + d0, w: 0.1, d: 0.03, z: h + 1.5, h: 5, mat: IRON, line: 0.5 });
}

function saloonLeaf(b: LeafBox, w: number, col: string) {
  const z0 = 26;
  const z1 = 72;
  const frame: Mat = { c: col, top: sh(col, 1.18), left: sh(col, 1.06), right: sh(col, 0.86) };
  b(0, w, z0, z1, frame, {
    th: 0.024,
    paint: (d) => {
      d.rect(0.05, w - 0.05, z0 + 6, z1 - 10, sh(col, 0.78));
      for (let z = z0 + 8; z < z1 - 10; z += 3.2) {
        d.line(0.05, z, w - 0.05, z + 1.4, sh(col, 1.25), 0.7);
        d.line(0.05, z + 1.4, w - 0.05, z + 2.4, sh(col, 0.62), 0.4);
      }
      // a curved crest: higher at the hinge, dipping to the middle
      d.rect(0.0, w, z1 - 6, z1, sh(col, 1.05));
      d.rect(0.004, 0.03, z0 + 6, z0 + 11, K.brass);
      d.rect(0.004, 0.03, z1 - 13, z1 - 8, K.brass);
    },
  });
}

// ── the frame ────────────────────────────────────────────────────────────────
function frame(s: Sketch, n: number, D: number, kind: string, locked: boolean, lit: boolean) {
  const trim: Mat = { c: K.walnut, top: "#74492f", left: "#6a4430", right: "#4e3221" };
  const sides: (1 | -1)[] = s.round ? [1, -1] : [1];
  // jambs through the wall
  for (const x of [0, n - J]) s.box({ x, y: -T, w: J, d: 2 * T, z: 0, h: D, mat: M.walnut, line: 0.8, capped: true });
  for (const side of sides) {
    const y = side > 0 ? T - 0.004 : -C;
    const d = C - T + 0.004;
    // side casings on plinth blocks, the head casing and a cornice over it
    for (const x of [0, n - 0.1]) {
      s.box({ x, y, w: 0.1, d, z: 0, h: 9, mat: M.walnutDark, line: 0.8 });
      s.box({ x, y, w: 0.1, d, z: 9, h: D - 9, mat: trim, line: 0.8 }, (dr) => {
        const f = side > 0 ? "s" : "n";
        const Y = side > 0 ? C : -C;
        dr.line(f, [x + 0.035, Y, 10], [x + 0.035, Y, D - 1], sh(K.walnut, 1.3), 0.5, 0.7);
        dr.line(f, [x + 0.065, Y, 10], [x + 0.065, Y, D - 1], sh(K.walnut, 0.72), 0.5, 0.7);
      });
    }
    s.box({ x: 0, y, w: n, d, z: D, h: 6, mat: trim, line: 0.9 }, (dr) => {
      const f = side > 0 ? "s" : "n";
      const Y = side > 0 ? C : -C;
      dr.line(f, [0.03, Y, D + 2], [n - 0.03, Y, D + 2], sh(K.walnut, 1.3), 0.5, 0.8);
      // a locked door's lamp, in a little brass housing
      if (locked) {
        dr.poly(f, rectAt(f, Y, n / 2 - 0.05, n / 2 + 0.05, D + 0.8, D + 5.2), K.brass);
        dr.poly(f, rectAt(f, Y, n / 2 - 0.03, n / 2 + 0.03, D + 1.6, D + 4.4), K.red, { glow: true });
      }
    });
    const y2 = side > 0 ? T - 0.004 : -C - 0.012;
    s.box({ x: -0.0, y: y2, w: n, d: d + 0.012, z: D + 6, h: 2.4, mat: M.walnutDark, line: 0.8 });
    // the studio's ON AIR sign over it, lit while the door's shut
    if (kind === "door_studio") {
      const yy = side > 0 ? C : -C - 0.03;
      s.box(
        { x: n / 2 - 0.2, y: yy, w: 0.4, d: 0.03, z: D + 10, h: 9, mat: { c: "#2a1a12", top: "#3e2718" }, line: 0.8 },
        (dr) => {
          const f = side > 0 ? "s" : "n";
          const Y = side > 0 ? yy + 0.03 : yy;
          dr.poly(f, rectAt(f, Y, n / 2 - 0.17, n / 2 + 0.17, D + 11.5, D + 17.5), lit ? K.red : "#4a1c14", {
            glow: lit,
          });
          // the letters, as strokes on a little grid
          const ink = lit ? "#ffe2c8" : "#7a3a2c";
          const cw = 0.042;
          const gap = 0.016;
          const text = "ON AIR";
          const x0 = n / 2 - (text.length * (cw + gap) - gap) / 2;
          for (const [i, ch] of [...text].entries())
            for (const [a, b2, c2, e] of GLYPHS[ch] ?? [])
              dr.line(
                f,
                [x0 + i * (cw + gap) + a * cw, Y, D + 12.6 + b2 * 3.8],
                [x0 + i * (cw + gap) + c2 * cw, Y, D + 12.6 + e * 3.8],
                ink,
                0.5,
              );
        },
      );
    }
  }
}

// Strokes of a tiny sign font (x 0..1, y 0..1 up).
const GLYPHS: Record<string, [number, number, number, number][]> = {
  O: [
    [0, 0, 1, 0],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [0, 1, 0, 0],
  ],
  N: [
    [0, 0, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 1, 1],
  ],
  A: [
    [0, 0, 0.5, 1],
    [0.5, 1, 1, 0],
    [0.25, 0.45, 0.75, 0.45],
  ],
  I: [
    [0.5, 0, 0.5, 1],
    [0.2, 1, 0.8, 1],
    [0.2, 0, 0.8, 0],
  ],
  R: [
    [0, 0, 0, 1],
    [0, 1, 0.8, 1],
    [0.8, 1, 1, 0.8],
    [1, 0.8, 1, 0.65],
    [1, 0.65, 0.8, 0.5],
    [0.8, 0.5, 0, 0.5],
    [0.45, 0.5, 1, 0],
  ],
};

function rectAt(f: Face, Y: number, u0: number, u1: number, z0: number, z1: number): V3[] {
  return f === "s" || f === "n"
    ? [
        [u0, Y, z1],
        [u1, Y, z1],
        [u1, Y, z0],
        [u0, Y, z0],
      ]
    : [
        [Y, u0, z1],
        [Y, u1, z1],
        [Y, u1, z0],
        [Y, u0, z0],
      ];
}

// An arch: the hole's top corners filled through the wall in fine steps (no
// outlines: they read as one curve), a smooth moulded band round the curve on
// each face, a cream keystone, imposts where it springs, plinths.
function archway(s: Sketch, D: number) {
  const spring = 64; // where the curve starts
  const rise = D - spring;
  const steps = 22;
  const trim: Mat = { c: K.walnut, top: "#74492f", left: "#6a4430", right: "#4e3221" };
  // (one colour on every face: the steps' sides would show as teeth; the band draws the curve)
  const fill: Mat = { c: K.walnut, top: K.walnut, left: K.walnut, right: K.walnut, flat: true };
  const sides: (1 | -1)[] = s.round ? [1, -1] : [1];
  for (const x of [0, 1 - J]) s.box({ x, y: -T, w: J, d: 2 * T, z: 0, h: spring, mat: M.walnut, line: 0.8 });
  for (const side of sides) {
    const y = side > 0 ? T - 0.004 : -C;
    const d = C - T + 0.004;
    for (const x of [0, 1 - 0.1]) {
      s.box({ x, y, w: 0.1, d, z: 0, h: 9, mat: M.walnutDark, line: 0.8 });
      s.box({ x, y, w: 0.1, d, z: 9, h: spring - 9, mat: trim, line: 0.8 });
      s.box({ x: x > 0 ? x - 0.02 : x, y, w: 0.12, d: d + 0.01, z: spring - 3, h: 3, mat: M.walnutDark, line: 0.8 });
    }
  }
  // the curve: a quarter ellipse each side, from the jamb at `spring` to the
  // middle at D; under it the wall's corner is filled, step by step
  const ax = 0.5 - J;
  const at = (a: number): [number, number] => [0.5 - ax * Math.cos(a), spring + rise * Math.sin(a)];
  for (let i = 0; i < steps; i++) {
    const [u0] = at((i / steps) * (Math.PI / 2));
    const z = at(((i + 0.5) / steps) * (Math.PI / 2))[1];
    const [u2] = at(((i + 1) / steps) * (Math.PI / 2));
    // (in iso they stop short of the wall above by what their own top face
    // rises across the wall's thickness, so that face fills the gap exactly
    // and never shows over the wall)
    const top = s.round ? D + 0.01 : D - 3;
    for (const x of [u0, 1 - u2])
      s.box({ x, y: -T, w: u2 - u0, d: 2 * T, z, h: Math.max(0.5, top - z), mat: fill, line: 0, capped: true });
  }
  // the moulded band round the curve and the keystone, on each face (as
  // quads, so both views fill them), carried by a sliver of a box the whole
  // width (iso draws a box's details only in the slices the box is in)
  const band = 0.05;
  const zb = 4.2;
  s.box({ x: 0, y: -0.001, w: 1, d: 0.002, z: D - 0.02, h: 0.02, mat: fill, line: 0 }, (dr) => {
    for (const side of sides) {
      const f = side > 0 ? "s" : "n";
      const Y = side * (T + 0.006);
      const P = (u: number, z: number): V3 => [u, Y, z];
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI;
        const a1 = ((i + 1) / n) * Math.PI;
        const pt = (a: number, k: number): V3 =>
          P(0.5 - (ax + k * band) * Math.cos(a), spring + (rise + k * zb) * Math.sin(a));
        dr.poly(f, [pt(a0, 0), pt(a1, 0), pt(a1, 1), pt(a0, 1)], i % 2 ? "#6a4430" : "#6e4732");
      }
      for (const [k, c] of [
        [0, sh(K.walnut, 1.35)],
        [1, sh(K.walnut, 0.62)],
      ] as const)
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI;
          const a1 = ((i + 1) / n) * Math.PI;
          dr.line(
            f,
            P(0.5 - (ax + k * band) * Math.cos(a0), spring + (rise + k * zb) * Math.sin(a0)),
            P(0.5 - (ax + k * band) * Math.cos(a1), spring + (rise + k * zb) * Math.sin(a1)),
            c,
            0.5,
          );
        }
      // the keystone
      dr.poly(f, [P(0.455, D + 5.5), P(0.545, D + 5.5), P(0.53, D - 3.5), P(0.47, D - 3.5)], K.cream, {
        stroke: K.creamDark,
        sw: 0.5,
      });
    }
  });
}

// ── the door ─────────────────────────────────────────────────────────────────
export function doorItem(s: Sketch, kind: string, props: Props) {
  const n = kind === "door_double" ? 2 : 1;
  const D = openingCut(kind)[1];
  if (kind === "archway") {
    if (props._part !== "leaf") archway(s, D);
    return;
  }
  const thumb = !!props._thumb;
  const o = { kind, props: thumb ? { ...props, state: "closed", passing: false } : props };
  const shut = doorShut(o);
  const locked = props.state === "locked" && !thumb;
  const part = thumb ? "all" : String(props._part ?? "edge");
  const back = Number(props.swing) < 0;
  const side: 1 | -1 = back ? -1 : 1;
  const col =
    kind === "door_studio"
      ? paintOf(props, K.rustDark)
      : kind === "door_saloon"
        ? paintOf(props, K.teak)
        : kind === "door_barn"
          ? paintOf(props, "#7a4a2c")
          : paintOf(props, props.glass ? K.walnutDark : K.walnut);
  if (part !== "leaf") frame(s, n, D, kind, locked, shut);
  // a barn door hangs on the face: the leaf part, always
  if (doorSlides(kind)) {
    if (part !== "edge") barnLeaf(s, n, D, col, !shut, back ? -1 : 1);
    return;
  }
  const leaves: Leaf[] =
    kind === "door_double"
      ? [
          { hinge: J, dir: 1, w: 1 - J },
          { hinge: 2 - J, dir: -1, w: 1 - J },
        ]
      : kind === "door_saloon"
        ? [
            { hinge: J, dir: 1, w: 0.5 - J },
            { hinge: 1 - J, dir: -1, w: 0.5 - J },
          ]
        : [{ hinge: J + 0.005, dir: 1, w: 1 - 2 * J - 0.01 }];
  const which = Number(props._leaf ?? -1);
  leaves.forEach((L, i) => {
    if (i >= doorLeaves(kind)) return;
    // shut leaves are part of the frame's slices; open ones each their own part
    if (shut ? part === "leaf" : part === "edge" || (part === "leaf" && which >= 0 && which !== i)) return;
    const b = leafBoxes(s, L, !shut, side);
    if (kind === "door_double") doubleLeaf(b, L.w, D - 1, col);
    else if (kind === "door_saloon") saloonLeaf(b, L.w, col);
    else if (kind === "door_studio") studioLeaf(b, L.w, D - 1, col);
    else if (props.glass) glassLeaf(b, L.w, D - 1, col);
    else panelLeaf(b, L.w, D - 1, col);
  });
}
