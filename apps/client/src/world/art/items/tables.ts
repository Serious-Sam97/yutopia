import { fr, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// 6×2 War Room table: two walnut pedestals, a polished top, the planning-poker
// VFD strip down the middle (emissive). Story: a conference phone, a stack of
// poker cards, a notepad.
export function meetingTable(s: Sketch) {
  for (const x of [0.6, 5.1]) {
    s.box({ x, y: 0.5, w: 0.3, d: 1, z: 1.5, h: 18.5, mat: M.walnutDark });
    s.box({ x: x - 0.12, y: 0.38, w: 0.54, d: 1.24, z: 0, h: 1.5, mat: M.aluminium, line: 0.8 });
  }
  s.box({ x: 0, y: 0, w: 6, d: 2, z: 20, h: 5, mat: { c: K.walnut, top: "#6f452c", gloss: 0.9 } }, (d) => {
    // inlaid border + a soft reflection streak
    d.poly("t", tr(25, 0.12, 0.12, 5.88, 1.88), "none", { stroke: sh(K.walnut, 1.3), sw: 0.6, op: 0.5 });
    d.poly(
      "t",
      [
        [0.4, 0.2, 25],
        [2.2, 0.2, 25],
        [1.6, 0.6, 25],
        [0.3, 0.6, 25],
      ],
      "#ffffff",
      { op: 0.06 },
    );
    // VFD channel + strip
    d.poly("t", tr(25.05, 1.2, 0.88, 4.8, 1.12), K.graphite, { stroke: "#15120f", sw: 0.5 });
    d.poly("t", tr(25.1, 1.3, 0.96, 4.7, 1.04), K.amber, { glow: true });
    for (let i = 0; i < 17; i++) {
      const x = 1.38 + i * 0.2;
      d.poly("t", tr(25.15, x, 0.97, x + 0.11, 1.03), K.vfd, { glow: true });
    }
  });
  // conference phone
  s.box({ x: 4.9, y: 0.32, w: 0.42, d: 0.36, z: 25, h: 3, mat: M.graphite, puff: 0.6, line: 0.9 }, (d) => {
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) d.poly("t", te(28, 5.0 + c * 0.1, 0.42 + r * 0.08, 0.025, 8), K.cream);
    d.poly("t", tr(28, 5.22, 0.4, 5.28, 0.6), K.red, { glow: true });
  });
  // poker cards + notepad
  s.box({ x: 0.5, y: 1.3, w: 0.22, d: 0.3, z: 25, h: 2.4, mat: { c: K.cream, top: K.paper }, line: 0.7 }, (d) => {
    d.poly("t", tr(27.4, 0.55, 1.36, 0.67, 1.54), "none", { stroke: K.rust, sw: 0.6 });
  });
  s.box({ x: 2.6, y: 1.4, w: 0.36, d: 0.44, z: 25, h: 1, mat: { c: K.amberSoft, top: "#f3d27a" }, line: 0.7 }, (d) => {
    for (let i = 0; i < 4; i++) d.line("t", [2.64, 1.5 + i * 0.08, 26], [2.9, 1.5 + i * 0.08, 26], "#b98a3a", 0.5);
  });
  s.shadow(0.5, 0.4, 0.5, 1.2, 0.42);
  s.shadow(5, 0.4, 0.5, 1.2, 0.42);
  s.shadow(0, 0, 6, 2, 0.14, 0.8);
}

// 2×1 teak coffee table on tapered legs, magazines on a lower shelf. Story: a
// mug and a record sleeve.
export function coffeeTable(s: Sketch) {
  for (const [x, y] of [
    [0.12, 0.16],
    [1.88, 0.16],
    [0.12, 0.84],
    [1.88, 0.84],
  ])
    s.cyl({ x, y, z: 0, r: 0.03, r2: 0.04, h: 10, mat: M.walnutDark, line: 0.6 });
  s.box({ x: 0.1, y: 0.14, w: 1.8, d: 0.72, z: 3.5, h: 1.2, mat: M.walnut, line: 0.8 });
  s.box({ x: 0.3, y: 0.3, w: 0.5, d: 0.4, z: 4.7, h: 1.4, mat: { c: K.slate }, line: 0.6 }, (d) => {
    d.poly("t", tr(6.1, 0.34, 0.34, 0.76, 0.5), K.amberSoft);
  });
  s.box({ x: 0.04, y: 0.1, w: 1.92, d: 0.8, z: 10, h: 3, mat: M.teak }, (d) => {
    for (let i = 0; i < 4; i++)
      d.line("t", [0.1, 0.22 + i * 0.18, 13], [1.2 + i * 0.15, 0.24 + i * 0.18, 13], sh(K.teakTop, 0.86), 0.5, 0.6);
  });
  // record sleeve + mug
  s.box({ x: 0.3, y: 0.3, w: 0.5, d: 0.42, z: 13, h: 0.8, mat: { c: K.cream, top: "#efe2c2" }, line: 0.7 }, (d) => {
    d.poly("t", te(13.8, 0.55, 0.51, 0.15), K.graphite);
    d.poly("t", te(13.85, 0.55, 0.51, 0.05), K.rust);
  });
  s.cyl({ x: 1.32, y: 0.48, z: 13, r: 0.06, h: 6, mat: { c: K.rust } }, (d) => {
    d.poly("t", te(19, 1.32, 0.48, 0.045), "#3b2416");
  });
  for (const [x, y] of [
    [0.12, 0.16],
    [1.88, 0.16],
    [0.12, 0.84],
    [1.88, 0.84],
  ])
    s.shadowDot(x, y, 0.06, 0.4);
  s.shadow(0.04, 0.1, 1.92, 0.8, 0.18, 0.6);
}

// 3×1 reception counter: walnut body with 80s stripes on the visitor side
// (+y), a cream top, a CRT for the receptionist (−y). Story: a desk bell and an
// open guest book.
export function reception(s: Sketch) {
  s.box({ x: 0, y: 0.2, w: 3, d: 0.72, z: 0, h: 26, mat: M.walnut }, (d) => {
    for (const [z, c] of [
      [6, K.rust],
      [10, K.amberSoft],
      [14, K.olive],
    ] as const)
      d.poly("s", fr("s", 0.92, 0.02, 2.98, z, z + 3), c);
    d.poly("s", fr("s", 0.92, 0.02, 2.98, 0, 1.5), K.walnutDark);
  });
  s.box({ x: -0.04, y: 0.16, w: 3.08, d: 0.82, z: 26, h: 3, mat: M.cream });
  // CRT facing the receptionist
  s.box({ x: 1.12, y: 0.42, w: 0.26, d: 0.2, z: 29, h: 2, mat: M.puttyDark, line: 0.7 });
  s.box({ x: 1.08, y: 0.42, w: 0.34, d: 0.24, z: 31, h: 14, mat: M.puttyDark, puff: 0.8 });
  s.box({ x: 1.0, y: 0.26, w: 0.5, d: 0.16, z: 30, h: 18, mat: M.putty }, (d) => {
    d.poly("n", fr("n", 0.26, 1.04, 1.46, 33, 46), "#a89a76");
    d.poly("n", fr("n", 0.26, 1.06, 1.44, 34, 45), K.screen);
    for (let r = 0; r < 4; r++)
      d.poly("n", fr("n", 0.26, 1.28 - r * 0.03, 1.38, 43 - r * 2.4, 43.8 - r * 2.4), K.phosphor, { glow: true });
  });
  // guest book + bell
  s.box({ x: 1.9, y: 0.5, w: 0.44, d: 0.3, z: 29, h: 1, mat: { c: K.paper, top: K.paper }, line: 0.7 }, (d) => {
    d.line("t", [2.12, 0.5, 30], [2.12, 0.8, 30], K.walnut, 0.6);
    for (let i = 0; i < 3; i++) d.line("t", [1.94, 0.56 + i * 0.07, 30], [2.08, 0.56 + i * 0.07, 30], "#8a7a5a", 0.4);
  });
  s.cyl({ x: 2.62, y: 0.6, z: 29, r: 0.07, h: 1, mat: M.walnutDark, line: 0.6 });
  s.cyl({ x: 2.62, y: 0.6, z: 30, r: 0.06, r2: 0.025, h: 4, mat: M.brass, line: 0.6 });
  s.shadow(0, 0.2, 3, 0.72, 0.4, 0.4);
}
