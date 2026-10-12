import { fr, type Mat, type Sketch, sh } from "./kit";
import { K, M } from "./pal";

// 2×1 office desk, sitter on the −y side: a drawer pedestal, an end panel, a
// top. Bare: monitors, keyboards and mugs are their own things (tabletops), set
// on it one by one. Four finishes (the Look): walnut + teak, light oak, cream
// laminate with rust drawers, black ash with a graphite top.
const TOP = 21;
const TH = 4;
const Z = TOP + TH;

interface Finish {
  body: Mat;
  bodyC: string;
  dark: string;
  top: Mat;
  grain: string;
  pull: string;
  drawer: string;
}
const FINISHES: Finish[] = [
  {
    body: M.walnut,
    bodyC: K.walnut,
    dark: K.walnutDark,
    top: M.teak,
    grain: sh(K.teakTop, 0.86),
    pull: K.brass,
    drawer: sh(K.walnut, 1.08),
  },
  {
    body: { c: "#b98e5c", top: "#cfa673" },
    bodyC: "#b98e5c",
    dark: "#8a6540",
    top: { c: "#c79a63", top: "#dcb47e", left: "#a77c4a", right: "#93693d", gloss: 0.5 },
    grain: "#b88a52",
    pull: K.graphite,
    drawer: "#c69a66",
  },
  {
    body: M.cream,
    bodyC: K.cream,
    dark: K.creamDark,
    top: { c: K.creamDark, top: "#f3ead6", left: "#d2c4a1", right: "#c3b48f", gloss: 0.7 },
    grain: "#e6dcc3",
    pull: K.rust,
    drawer: K.rust,
  },
  {
    body: M.graphite,
    bodyC: K.graphite,
    dark: "#1c1b18",
    top: { c: "#3a3833", top: "#4a4740", left: "#2f2d29", right: "#262521", gloss: 0.9 },
    grain: "#55524a",
    pull: K.aluminium,
    drawer: "#36342f",
  },
];

export function desk(s: Sketch) {
  const f = FINISHES[Math.floor(s.seed * FINISHES.length) % FINISHES.length];
  // drawer pedestal (drawers face the sitter)
  s.box({ x: 0.08, y: 0.14, w: 0.52, d: 0.72, z: 0, h: TOP, mat: f.body }, (d) => {
    for (const [z0, z1] of [
      [1.5, 7],
      [8, 13.5],
      [14.5, 20],
    ]) {
      d.poly("n", fr("n", 0.14, 0.12, 0.56, z0, z1), f.drawer, { stroke: f.dark, sw: 0.6 });
      d.line("n", [0.27, 0.14, (z0 + z1) / 2 + 1], [0.41, 0.14, (z0 + z1) / 2 + 1], f.pull, 1.1);
    }
    // the back of the pedestal: a recessed panel
    d.poly("s", fr("s", 0.86, 0.14, 0.54, 3, 18), sh(f.bodyC, 0.92), { stroke: f.dark, sw: 0.5 });
  });
  // end panel with an aluminium foot
  s.box({ x: 1.82, y: 0.12, w: 0.09, d: 0.76, z: 1.5, h: TOP - 1.5, mat: f.body });
  s.box({ x: 1.8, y: 0.1, w: 0.13, d: 0.8, z: 0, h: 1.5, mat: M.aluminium, line: 0.8 });
  // modesty panel at the back
  s.box({ x: 0.6, y: 0.8, w: 1.22, d: 0.05, z: 8, h: TOP - 8, mat: { c: f.dark }, line: 0.9 });

  // the top, with a little grain
  s.box({ x: 0, y: 0.06, w: 2, d: 0.88, z: TOP, h: TH, mat: f.top }, (d) => {
    for (let i = 0; i < 6; i++) {
      const y = 0.14 + i * 0.13 + (s.seed * 0.05 + i * 0.01);
      d.line("t", [0.05, y, Z], [0.6 + ((i * 37) % 9) * 0.12, y + 0.015, Z], f.grain, 0.5, 0.6);
    }
  });

  s.shadow(0.06, 0.1, 0.56, 0.8, 0.42);
  s.shadow(1.78, 0.08, 0.17, 0.84, 0.42);
  s.shadow(0, 0.06, 2, 0.88, 0.16, 0.6);
}
