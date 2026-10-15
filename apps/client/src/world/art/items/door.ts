import { paintOf } from "./home";
import { fe, fr, type Mat, rnd, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";
import { DOOR_Z, WALL_Z } from "./walls";

// A door on a tile edge (map v2): rot 0 = the north edge of its tile, in a
// thin wall along x (the scene turns doors on west edges to rot 3). The frame,
// lintel and a shut leaf sit in the wall line (y = 0 ± 0.1) and sort like the
// wall; an open leaf swings into the door's own tile and sorts like furniture
// there — props._part picks which ("edge" | "leaf"). props.state: open | closed
// | locked; props.passing swings it open. props.glass: a glazed studio door.
// Story: a brass kick plate and a little porthole.
const LEAF: Mat = { c: K.walnut, top: "#74492f", left: "#6e4a31", right: "#5a3a26" };
const T = 0.1;
const D = DOOR_Z; // the opening's height (the leaf's)
const PANELS = [
  [12, 42],
  [48, D - 8],
] as const;
const PORT = 66; // the porthole's middle, about eye level

export function door(s: Sketch, props: Record<string, unknown>) {
  const state = String(props.state ?? "open");
  const shut = (state === "closed" || state === "locked") && !props.passing;
  const locked = state === "locked";
  const glass = !!props.glass;
  const part = String(props._part ?? "edge");
  if (part === "edge") {
    for (const x of [0, 0.92]) {
      s.box({ x, y: -T, w: 0.08, d: 2 * T, z: 0, h: 5, mat: M.walnutDark, line: 0.8 });
      s.box({ x, y: -T, w: 0.08, d: 2 * T, z: 5, h: D - 5, mat: M.walnut, line: 0.8 });
    }
    // the lintel: up to the wall's cap
    s.box({ x: 0, y: -T, w: 1, d: 2 * T, z: D, h: WALL_Z - 3 - D, mat: M.cream, line: 0.9 }, (d) => {
      d.poly("s", fr("s", T, 0.08, 0.92, D, D + 2), M.walnutDark.c);
      if (locked) d.poly("s", fe("s", T, 0.5, D + 5, 0.06, 2.2, 12), K.red, { glow: true });
    });
    s.box({ x: -0.01, y: -T, w: 1.02, d: 2 * T, z: WALL_Z - 3, h: 3, mat: M.walnutDark, line: 1 });
    if (shut) {
      s.box({ x: 0.08, y: -0.04, w: 0.84, d: 0.08, z: 0, h: D, mat: LEAF }, (d) => {
        const Y = 0.04;
        if (glass) {
          d.poly("s", fr("s", Y, 0.16, 0.84, 14, D - 8), "#3a4a4a", { op: 0.55, stroke: sh(K.walnut, 1.2), sw: 0.6 });
          d.poly("s", fr("s", Y, 0.2, 0.4, 46, D - 10), "#ffffff", { op: 0.1 });
        } else {
          for (const [z0, z1] of PANELS)
            d.poly("s", fr("s", Y, 0.17, 0.83, z0, z1), sh(K.walnut, 0.88), { stroke: sh(K.walnut, 1.25), sw: 0.6 });
          d.poly("s", fe("s", Y, 0.5, PORT, 0.12, 5.2, 20), K.brass);
          d.poly("s", fe("s", Y, 0.5, PORT, 0.095, 4.2, 20), "#2a3a3a");
          d.poly("s", fe("s", Y, 0.47, PORT + 1.4, 0.03, 1.4, 10), "#ffffff", { op: 0.3 });
        }
        d.poly("s", fr("s", Y, 0.1, 0.9, 1, 7), K.brass, { stroke: "#8a6a2c", sw: 0.4 });
        d.poly("s", fe("s", Y, 0.78, 36, 0.035, 1.6, 10), K.brass, { stroke: "#8a6a2c", sw: 0.4 });
        d.poly("s", fr("s", Y, 0.76, 0.8, 30, 32.5), locked ? K.red : sh(K.brass, 0.8), { glow: locked });
      });
    }
    return;
  }
  if (shut) return;
  // swung open into the room, against the frame
  s.box({ x: 0.08, y: T, w: 0.07, d: 0.8, z: 0, h: D, mat: LEAF }, (d) => {
    const X = 0.15;
    if (glass) d.poly("e", fr("e", X, T + 0.08, T + 0.72, 14, D - 8), "#3a4a4a", { op: 0.55 });
    else {
      for (const [z0, z1] of PANELS)
        d.poly("e", fr("e", X, T + 0.08, T + 0.72, z0, z1), sh(K.walnut, 0.78), {
          stroke: sh(K.walnut, 1.15),
          sw: 0.6,
        });
      d.poly("e", fe("e", X, T + 0.4, PORT, 0.12, 5.2, 20), K.brass);
      d.poly("e", fe("e", X, T + 0.4, PORT, 0.095, 4.2, 20), "#2a3a3a");
    }
    d.poly("e", fr("e", X, T + 0.02, T + 0.78, 1, 7), K.brass);
  });
}

// 4×3 rug: olive border, rust field, an amber medallion, cream fringe on the
// short ends. Flat (floor layer).
export function rug(s: Sketch, props: Record<string, unknown> = {}) {
  const v = Math.floor(s.seed * 3);
  // (props.color: the field, rust unless painted)
  const field = paintOf(props, K.rust);
  if (v === 1) return kilim(s, field);
  if (v === 2) return shag(s, field);
  s.box(
    { x: 0, y: 0, w: 4, d: 3, z: 0, h: 0.8, mat: { c: K.olive, top: "#74823f", flat: true }, line: 0.9, bevel: false },
    (d) => {
      const Z = 0.8;
      d.poly("t", tr(Z, 0.2, 0.2, 3.8, 2.8), field);
      d.poly("t", tr(Z, 0.28, 0.28, 3.72, 2.72), "none", { stroke: K.amberSoft, sw: 0.8 });
      d.poly("t", tr(Z, 0.42, 0.42, 3.58, 2.58), sh(field, 0.9));
      // medallion: nested diamonds
      for (const [r, c] of [
        [1.1, K.amberSoft],
        [0.8, K.rustDark],
        [0.5, K.cream],
        [0.25, K.olive],
      ] as const)
        d.poly(
          "t",
          [
            [2 - r * 1.3, 1.5, Z],
            [2, 1.5 - r, Z],
            [2 + r * 1.3, 1.5, Z],
            [2, 1.5 + r, Z],
          ],
          c,
        );
      // corner motifs
      for (const [x, y] of [
        [0.75, 0.75],
        [3.25, 0.75],
        [0.75, 2.25],
        [3.25, 2.25],
      ])
        d.poly("t", te(Z, x, y, 0.16, 8), K.amberSoft);
      // fringe on the short ends
      for (let i = 0; i < 24; i++) {
        const y = 0.1 + i * 0.12;
        d.line("t", [0, y, 0.4], [-0.12, y, 0.2], K.cream, 0.8);
        d.line("t", [4, y, 0.4], [4.12, y, 0.2], K.cream, 0.8);
      }
    },
  );
}

// A flat-woven kilim: bands of colour across it, zigzags between.
function kilim(s: Sketch, field: string) {
  const bands = [field, K.cream, K.amberSoft, K.slate, K.cream, field, K.olive, K.cream, field];
  s.box(
    { x: 0, y: 0, w: 4, d: 3, z: 0, h: 0.6, mat: { c: field, top: field, flat: true }, line: 0.9, bevel: false },
    (d) => {
      const Z = 0.6;
      bands.forEach((c, i) => {
        const y0 = (i / bands.length) * 3;
        d.poly("t", tr(Z, 0.1, y0, 3.9, y0 + 3 / bands.length), c);
      });
      for (let i = 1; i < bands.length; i += 2) {
        const y = (i / bands.length) * 3 + 3 / bands.length / 2;
        for (let k = 0; k < 13; k++) {
          const x = 0.2 + k * 0.28;
          d.line("t", [x, y - 0.08, Z + 0.01], [x + 0.14, y + 0.08, Z + 0.01], sh(field, 0.7), 0.7);
          d.line("t", [x + 0.14, y + 0.08, Z + 0.01], [x + 0.28, y - 0.08, Z + 0.01], sh(field, 0.7), 0.7);
        }
      }
      for (let i = 0; i < 24; i++) {
        const y = 0.1 + i * 0.12;
        d.line("t", [0, y, 0.3], [-0.12, y, 0.1], K.cream, 0.8);
        d.line("t", [4, y, 0.3], [4.12, y, 0.1], K.cream, 0.8);
      }
    },
  );
}

// A deep shag in one colour, its pile catching the light.
function shag(s: Sketch, field: string) {
  s.box(
    {
      x: 0.1,
      y: 0.1,
      w: 3.8,
      d: 2.8,
      z: 0,
      h: 1.4,
      mat: { c: sh(field, 0.85), top: field, flat: true },
      line: 0.9,
      bevel: false,
    },
    (d) => {
      for (let i = 0; i < 160; i++) {
        const x = 0.2 + rnd(i, 1) * 3.6;
        const y = 0.2 + rnd(i, 2) * 2.6;
        d.line("t", [x, y, 1.42], [x + 0.05, y - 0.04, 1.42], rnd(i, 3) > 0.5 ? sh(field, 1.2) : sh(field, 0.8), 0.7);
      }
    },
  );
}

// 4×4 standup ring: a round felt mat with an amber inlay and 12 VFD dots that
// glow. Flat (floor layer).
export function standupMat(s: Sketch) {
  s.cyl({ x: 2, y: 2, z: 0, r: 1.85, h: 0.8, mat: { c: "#3a2a20", top: "#4a362a", flat: true }, line: 1 }, (d) => {
    d.poly("t", te(0.8, 2, 2, 1.6, 48), "none", { stroke: K.amber, sw: 2.2 });
    d.poly("t", te(0.8, 2, 2, 1.15, 40), "none", { stroke: K.amber, sw: 1, op: 0.5 });
    d.poly("t", te(0.8, 2, 2, 0.35, 24), "#5a4232", { stroke: K.amberSoft, sw: 0.6 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      d.poly("t", te(0.85, 2 + Math.cos(a) * 1.38, 2 + Math.sin(a) * 1.38, 0.05, 10), K.vfd, { glow: true });
    }
  });
}
