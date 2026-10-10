import { fr, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// 2×1 walnut office desk, sitter on the −y side: a drawer pedestal, an end
// panel, a teak top, two beige CRTs facing the sitter and two keyboards.
// Story detail (seeded): a mug with a coffee ring, a cassette, a paper stack.
const TOP = 21;
const TH = 4;
const Z = TOP + TH;

export function desk(s: Sketch) {
  const v = Math.floor(s.seed * 4);

  // drawer pedestal (drawers face the sitter)
  s.box({ x: 0.08, y: 0.14, w: 0.52, d: 0.72, z: 0, h: TOP, mat: M.walnut }, (d) => {
    for (const [z0, z1] of [
      [1.5, 7],
      [8, 13.5],
      [14.5, 20],
    ]) {
      d.poly("n", fr("n", 0.14, 0.12, 0.56, z0, z1), sh(K.walnut, 1.08), { stroke: K.walnutDark, sw: 0.6 });
      d.line("n", [0.27, 0.14, (z0 + z1) / 2 + 1], [0.41, 0.14, (z0 + z1) / 2 + 1], K.brass, 1.1);
    }
    // the back of the pedestal: a recessed panel
    d.poly("s", fr("s", 0.86, 0.14, 0.54, 3, 18), sh(K.walnut, 0.92), { stroke: K.walnutDark, sw: 0.5 });
  });
  // end panel with an aluminium foot
  s.box({ x: 1.82, y: 0.12, w: 0.09, d: 0.76, z: 1.5, h: TOP - 1.5, mat: M.walnut });
  s.box({ x: 1.8, y: 0.1, w: 0.13, d: 0.8, z: 0, h: 1.5, mat: M.aluminium, line: 0.8 });
  // modesty panel at the back
  s.box({ x: 0.6, y: 0.8, w: 1.22, d: 0.05, z: 8, h: TOP - 8, mat: M.walnutDark, line: 0.9 });

  // teak top with a darker edge band
  s.box({ x: 0, y: 0.06, w: 2, d: 0.88, z: TOP, h: TH, mat: M.teak }, (d) => {
    // wood grain on the top
    for (let i = 0; i < 6; i++) {
      const y = 0.14 + i * 0.13 + (s.seed * 0.05 + i * 0.01);
      d.line("t", [0.05, y, Z], [0.6 + ((i * 37) % 9) * 0.12, y + 0.015, Z], sh(K.teakTop, 0.86), 0.5, 0.6);
    }
    // a coffee ring next to the mug (story detail)
    if (v !== 2) d.poly("t", te(Z, 0.96, 0.28, 0.07), "none", { stroke: "#6b3f22", sw: 0.7, op: 0.55 });
  });

  // keyboards
  for (const kx of [0.26, 1.3]) {
    s.box({ x: kx, y: 0.12, w: 0.44, d: 0.17, z: Z, h: 1.8, mat: M.putty, line: 0.8 }, (d) => {
      for (let r = 0; r < 3; r++) {
        const y = 0.15 + r * 0.045;
        for (let k = 0; k < 9; k++) {
          const x = kx + 0.03 + k * 0.045;
          d.poly("t", tr(Z + 1.8, x, y, x + 0.034, y + 0.032), r === 2 && k > 2 && k < 7 ? "#c8bb98" : "#e9dfc4", {
            stroke: "#a69772",
            sw: 0.25,
          });
        }
      }
    });
  }

  // CRT monitors facing the sitter (−y)
  // (the n face is seen from the sitter's side, so "left as seen" is high x)
  for (const mx of [0.26, 1.3]) {
    s.box({ x: mx + 0.1, y: 0.5, w: 0.24, d: 0.22, z: Z, h: 2, mat: M.puttyDark, line: 0.8 });
    // tube housing behind the bezel
    s.box({ x: mx + 0.06, y: 0.58, w: 0.32, d: 0.22, z: Z + 4, h: 14, mat: M.puttyDark, puff: 1 }, (d) => {
      for (let i = 0; i < 4; i++)
        d.line("t", [mx + 0.1 + i * 0.06, 0.63, Z + 18], [mx + 0.1 + i * 0.06, 0.76, Z + 18], "#8e8263", 0.7);
    });
    const R = mx + 0.44; // left edge as seen from the front
    s.box({ x: mx, y: 0.4, w: 0.44, d: 0.18, z: Z + 2, h: 19, mat: M.putty }, (d) => {
      // bezel recess + glass
      d.poly("n", fr("n", 0.4, mx + 0.04, mx + 0.4, Z + 5.5, Z + 19.5), "#a89a76");
      d.poly("n", fr("n", 0.4, mx + 0.06, mx + 0.38, Z + 6.5, Z + 18.5), K.screen, { stroke: "#3a3428", sw: 0.6 });
      // phosphor text rows (emissive), left-aligned as seen
      for (let r = 0; r < 4; r++) {
        const len = 0.08 + ((r * 7 + Math.floor(s.seed * 10)) % 5) * 0.04;
        const z = Z + 16.5 - r * 2.5;
        d.poly("n", fr("n", 0.4, R - 0.09 - len, R - 0.09, z - 0.9, z), K.phosphor, { glow: true });
      }
      d.poly("n", fr("n", 0.4, R - 0.13, R - 0.09, Z + 7.2, Z + 8.3), K.phosphorHi, { glow: true }); // cursor
      // power LED + badge
      d.poly("n", fr("n", 0.4, mx + 0.03, mx + 0.06, Z + 3.4, Z + 4.6), K.amber, { glow: true });
      d.poly("n", fr("n", 0.4, R - 0.16, R - 0.05, Z + 3.5, Z + 4.5), "#8e8263");
      // a sticky note on the bezel (story detail)
      if (mx < 1 && v !== 3)
        d.poly(
          "n",
          [
            [mx + 0.14, 0.4, Z + 20.5],
            [mx - 0.01, 0.4, Z + 19.6],
            [mx - 0.01, 0.4, Z + 14],
            [mx + 0.13, 0.4, Z + 14.8],
          ],
          K.amberSoft,
          { stroke: "#b07a22", sw: 0.4 },
        );
      // vents on the back
      for (let i = 0; i < 3; i++)
        d.line("s", [mx + 0.1, 0.58, Z + 8 + i * 3.5], [mx + 0.34, 0.58, Z + 8 + i * 3.5], "#a49470", 0.8);
    });
  }

  // mug (or a cassette / a stack of paper on some desks)
  if (v !== 2) {
    s.cyl({ x: 0.96, y: 0.28, z: Z, r: 0.055, h: 7, mat: { c: v === 1 ? K.olive : K.rust } }, (d) => {
      d.poly("t", te(Z + 7, 0.96, 0.28, 0.04), "#3b2416");
    });
  }
  if (v === 1 || v === 2) {
    s.box({ x: 0.84, y: 0.6, w: 0.26, d: 0.17, z: Z, h: 1.6, mat: { c: K.graphite }, line: 0.7 }, (d) => {
      d.poly("t", tr(Z + 1.6, 0.87, 0.63, 1.07, 0.74), K.cream);
      d.poly("t", te(Z + 1.7, 0.93, 0.685, 0.022), K.graphite);
      d.poly("t", te(Z + 1.7, 1.01, 0.685, 0.022), K.graphite);
    });
  }
  if (v === 3 || v === 0) {
    s.box({ x: 0.78, y: 0.56, w: 0.3, d: 0.22, z: Z, h: 3, mat: { c: K.paper, top: K.paper }, line: 0.7 });
  }

  s.shadow(0.06, 0.1, 0.56, 0.8, 0.42);
  s.shadow(1.78, 0.08, 0.17, 0.84, 0.42);
  s.shadow(0, 0.06, 2, 0.88, 0.16, 0.6);
}
