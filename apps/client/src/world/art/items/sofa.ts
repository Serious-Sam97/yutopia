import { INK, type Mat, type Sketch, sh } from "./kit";
import { K, M } from "./pal";

// 3×1 corduroy sofa, back on −y: walnut plinth on short legs, rolled arms,
// three seat + three back cushions (one per tile, so depth slices cut between
// cushions). Story detail (seeded): a throw pillow, a cassette left on a
// cushion, or a knitted blanket over an arm.
const CORD: Mat = { c: K.rust, top: "#c76b41" };
const CORD_DARK: Mat = { c: "#9a4630", top: "#b25a3c" };

export function sofa(s: Sketch) {
  const v = Math.floor(s.seed * 3);

  // plinth + legs
  for (const [x, y] of [
    [0.1, 0.2],
    [2.9, 0.2],
    [0.1, 0.86],
    [2.9, 0.86],
  ])
    s.cyl({ x, y, z: 0, r: 0.035, h: 3, mat: M.walnutDark, line: 0.6 });
  s.box({ x: 0.04, y: 0.14, w: 2.92, d: 0.78, z: 3, h: 4, mat: M.walnut });
  s.box({ x: 0.04, y: 0.14, w: 2.92, d: 0.78, z: 7, h: 5, mat: CORD_DARK, puff: 0.8 });

  // back frame + arms
  s.box({ x: 0.04, y: 0.1, w: 2.92, d: 0.1, z: 12, h: 18, mat: CORD_DARK, puff: 1 });
  for (const ax of [0.04, 2.74])
    s.box({ x: ax, y: 0.14, w: 0.22, d: 0.78, z: 12, h: 11, mat: CORD_DARK, puff: 2.2 }, (d) => {
      d.line("s", [ax + 0.04, 0.92, 21], [ax + 0.18, 0.92, 21], sh("#9a4630", 0.75), 0.6, 0.8);
    });

  // cushions, one per tile
  const cush: [number, number][] = [
    [0.26, 1],
    [1, 2],
    [2, 2.74],
  ];
  for (const [x0, x1] of cush) {
    s.box({ x: x0 + 0.01, y: 0.18, w: x1 - x0 - 0.02, d: 0.22, z: 12, h: 21, mat: CORD, puff: 2.6 }, (d) => {
      for (let i = 1; i < 7; i++) {
        const x = x0 + ((x1 - x0) * i) / 7;
        d.line("s", [x, 0.4, 31], [x, 0.4, 14], sh(K.rust, 0.86), 0.45, 0.6);
      }
    });
    s.box({ x: x0 + 0.01, y: 0.4, w: x1 - x0 - 0.02, d: 0.52, z: 12, h: 5.5, mat: CORD, puff: 2 }, (d) => {
      for (let i = 1; i < 7; i++) {
        const x = x0 + ((x1 - x0) * i) / 7;
        d.line("s", [x, 0.92, 16.5], [x, 0.92, 13], sh(K.rust, 0.86), 0.45, 0.6);
      }
    });
  }

  // story details
  if (v === 0) {
    // throw pillow, leaning in the left corner
    s.shape({ x: 0.28, y: 0.3, w: 0.36, d: 0.2, z: 17, h: 15 }, (d) => {
      const [x, y] = d.m(0.44, 0.42, 25);
      d.raw(
        `<path d="M${x - 9} ${y - 4} Q${x - 1} ${y - 9} ${x + 8} ${y - 6} Q${x + 10} ${y + 2} ${x + 7} ${y + 8} Q${x - 2} ${y + 11} ${x - 9} ${y + 7} Q${x - 11} ${y + 1} ${x - 9} ${y - 4}Z" fill="${K.amberSoft}" stroke="${INK}" stroke-width="1.2"/><path d="M${x - 5} ${y - 2} L${x + 5} ${y + 4} M${x - 6} ${y + 3} L${x + 4} ${y - 3}" stroke="#b9792a" stroke-width=".8" opacity=".8"/>`,
      );
    });
  } else if (v === 1) {
    // a cassette on the middle cushion
    s.shape({ x: 1.3, y: 0.55, w: 0.3, d: 0.2, z: 17.5, h: 2 }, (d) => {
      const a = d.m(1.32, 0.58, 17.6);
      const b = d.m(1.6, 0.58, 17.6);
      const c = d.m(1.6, 0.76, 17.6);
      const e = d.m(1.32, 0.76, 17.6);
      d.raw(
        `<polygon points="${[a, b, c, e].map((p) => p.join(",")).join(" ")}" fill="${K.graphite}" stroke="${INK}" stroke-width=".8"/>`,
      );
      const l = d.m(1.4, 0.67, 17.8);
      const r = d.m(1.52, 0.67, 17.8);
      d.raw(
        `<ellipse cx="${l[0]}" cy="${l[1]}" rx="2" ry="1.1" fill="${K.cream}"/><ellipse cx="${r[0]}" cy="${r[1]}" rx="2" ry="1.1" fill="${K.cream}"/>`,
      );
    });
  } else {
    // knitted blanket over the right arm
    s.box({ x: 2.7, y: 0.36, w: 0.3, d: 0.4, z: 22, h: 3, mat: { c: K.olive }, puff: 1.5 }, (d) => {
      for (const z of [10, 14, 18]) d.line("e", [3, 0.38, z], [3, 0.74, z], K.amberSoft, 0.9);
    });
    s.box({ x: 2.98, y: 0.36, w: 0.04, d: 0.4, z: 7, h: 15, mat: { c: K.olive }, line: 1 }, (d) => {
      for (const z of [10, 14, 18]) d.line("e", [3.02, 0.38, z], [3.02, 0.74, z], K.amberSoft, 0.9);
    });
  }

  s.shadow(0.02, 0.12, 2.96, 0.82, 0.3, 0.5);
  for (const [x, y] of [
    [0.1, 0.2],
    [2.9, 0.2],
    [0.1, 0.86],
    [2.9, 0.86],
  ])
    s.shadowDot(x, y, 0.07, 0.4);
}
