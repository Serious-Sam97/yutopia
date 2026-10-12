import { fr, type Sketch, sh, tr } from "./kit";
import { K, M } from "./pal";

// 6×2 War Room table: two walnut pedestals, a polished top, the planning-poker
// VFD strip down the middle (emissive). The phone and cards are tabletops.
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
  s.shadow(0.5, 0.4, 0.5, 1.2, 0.42);
  s.shadow(5, 0.4, 0.5, 1.2, 0.42);
  s.shadow(0, 0, 6, 2, 0.14, 0.8);
}

// 2×1 teak coffee table on tapered legs, magazines on a lower shelf.
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
// (+y), a cream top (the CRT, guest book and bell are tabletops).
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
  s.shadow(0, 0.2, 3, 0.72, 0.4, 0.4);
}
