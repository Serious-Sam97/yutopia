import { fe, fr, type Mat, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// A door in a one-tile gap of a (tile) wall. rot 0: the wall runs along x and
// faces +y (the scene turns doors along y to rot 3 so the leaf faces the
// camera). Frame and lintel match the walls: walnut dado to 30, cream above,
// cap at 84. props.state: open | closed | locked; props.passing swings it open.
// Story: a brass kick plate and a little porthole.
const LEAF: Mat = { c: K.walnut, top: "#74492f", left: "#6e4a31", right: "#5a3a26" };

export function door(s: Sketch, props: Record<string, unknown>) {
  const state = String(props.state ?? "open");
  const shut = (state === "closed" || state === "locked") && !props.passing;
  const locked = state === "locked";
  for (const x of [0, 0.93]) {
    s.box({ x, y: 0, w: 0.07, d: 1, z: 0, h: 30, mat: M.walnut, line: 0.8 });
    s.box({ x, y: 0, w: 0.07, d: 1, z: 30, h: 42, mat: M.cream, line: 0.8 });
    s.box({ x: x + (x ? -0.02 : 0.07), y: 0.84, w: 0.02, d: 0.14, z: 0, h: 72, mat: M.walnutDark, line: 0.5 });
  }
  s.box({ x: 0, y: 0, w: 1, d: 1, z: 72, h: 12, mat: M.cream, line: 0.8 }, (d) => {
    d.poly("s", fr("s", 1, 0.07, 0.93, 72, 74), M.walnutDark.c);
    if (locked) d.poly("s", fe("s", 1, 0.5, 79, 0.06, 2.4, 12), K.red, { glow: true });
  });
  s.box({ x: -0.02, y: -0.02, w: 1.04, d: 1.04, z: 84, h: 3, mat: M.walnutDark, line: 1 });

  if (shut) {
    s.box({ x: 0.07, y: 0.86, w: 0.86, d: 0.1, z: 0, h: 72, mat: LEAF }, (d) => {
      // raised panels
      for (const [z0, z1] of [
        [12, 34],
        [40, 66],
      ])
        d.poly("s", fr("s", 0.96, 0.17, 0.83, z0, z1), sh(K.walnut, 0.88), { stroke: sh(K.walnut, 1.25), sw: 0.6 });
      // porthole
      d.poly("s", fe("s", 0.96, 0.5, 56, 0.12, 5.2, 20), K.brass);
      d.poly("s", fe("s", 0.96, 0.5, 56, 0.095, 4.2, 20), "#2a3a3a");
      d.poly("s", fe("s", 0.96, 0.47, 57.4, 0.03, 1.4, 10), "#ffffff", { op: 0.3 });
      // kick plate + knob + lock
      d.poly("s", fr("s", 0.96, 0.1, 0.9, 1, 7), K.brass, { stroke: "#8a6a2c", sw: 0.4 });
      d.poly("s", fe("s", 0.96, 0.78, 36, 0.035, 1.6, 10), K.brass, { stroke: "#8a6a2c", sw: 0.4 });
      d.poly("s", fr("s", 0.96, 0.76, 0.8, 30, 32.5), locked ? K.red : sh(K.brass, 0.8), { glow: locked });
    });
  } else {
    // swung open into the room, against the frame
    s.box({ x: 0.07, y: 0.1, w: 0.09, d: 0.8, z: 0, h: 72, mat: LEAF }, (d) => {
      for (const [z0, z1] of [
        [12, 34],
        [40, 66],
      ])
        d.poly("e", fr("e", 0.16, 0.18, 0.82, z0, z1), sh(K.walnut, 0.78), { stroke: sh(K.walnut, 1.15), sw: 0.6 });
      d.poly("e", fe("e", 0.16, 0.5, 56, 0.12, 5.2, 20), K.brass);
      d.poly("e", fe("e", 0.16, 0.5, 56, 0.095, 4.2, 20), "#2a3a3a");
      d.poly("e", fr("e", 0.16, 0.12, 0.88, 1, 7), K.brass);
      d.poly("e", fe("e", 0.16, 0.22, 36, 0.035, 1.6, 10), K.brass);
    });
  }
  s.shadow(0, 0, 0.07, 1, 0.35, 0.2);
  s.shadow(0.93, 0, 0.07, 1, 0.35, 0.2);
}

// 4×3 rug: olive border, rust field, an amber medallion, cream fringe on the
// short ends. Flat (floor layer).
export function rug(s: Sketch) {
  s.box(
    { x: 0, y: 0, w: 4, d: 3, z: 0, h: 0.8, mat: { c: K.olive, top: "#74823f", flat: true }, line: 0.9, bevel: false },
    (d) => {
      const Z = 0.8;
      d.poly("t", tr(Z, 0.2, 0.2, 3.8, 2.8), K.rust);
      d.poly("t", tr(Z, 0.28, 0.28, 3.72, 2.72), "none", { stroke: K.amberSoft, sw: 0.8 });
      d.poly("t", tr(Z, 0.42, 0.42, 3.58, 2.58), "#a34d2b");
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
