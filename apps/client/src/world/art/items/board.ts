import { fr, type Sketch, sh } from "./kit";
import { K, M } from "./pal";

// 3-tile board wall hanging on a back wall (local y ∈ [−0.06, 0.06]): a walnut
// frame around smoked glass. The engine mounts the live VU display on the glass
// (x 0.14 → 2.86, z 27 → 67, at y 0.06), so that geometry must not move.
// Story detail: a marker tray with markers + eraser, a sticky note on the frame.
export function boardWall(s: Sketch) {
  const Y = 0.04; // front face of the frame
  // soft drop shadow on the wall
  s.shape({ x: 0.1, y: -0.07, w: 2.9, d: 0.02, z: 20, h: 52 }, (d) => {
    d.poly("s", fr("s", -0.06, 0.12, 3.0, 19, 70), "#1a120c", { op: 0.22 });
  });
  s.box({ x: 0.06, y: -0.06, w: 2.88, d: 0.1, z: 22, h: 50, mat: M.walnut }, (d) => {
    // inner lip + glass
    d.poly("s", fr("s", Y, 0.11, 2.89, 25.5, 68.5), K.walnutDark);
    d.poly("s", fr("s", Y, 0.14, 2.86, 27, 67), K.glass);
    // glass sheen, top-left
    d.poly(
      "s",
      [
        [0.18, Y, 67],
        [0.62, Y, 67],
        [0.32, Y, 52],
        [0.18, Y, 58],
      ],
      "#ffffff",
      { op: 0.05 },
    );
    // corner screws
    for (const [u, z] of [
      [0.1, 70],
      [2.9, 70],
      [0.1, 24],
      [2.9, 24],
    ])
      d.poly("s", fr("s", Y, u - 0.012, u + 0.012, z - 0.7, z + 0.7), K.brass);
    // brass maker's plate
    d.poly("s", fr("s", Y, 1.36, 1.64, 23, 25.6), K.brass, { stroke: "#8a6a2c", sw: 0.4 });
    d.line("s", [1.4, Y, 24.3], [1.6, Y, 24.3], "#7a5a22", 0.5);
    // sticky note on the frame (story)
    d.poly(
      "s",
      [
        [2.64, Y, 75.5],
        [2.88, Y, 74.6],
        [2.87, Y, 67.6],
        [2.64, Y, 68.4],
      ],
      K.amberSoft,
      { stroke: "#b07a22", sw: 0.4 },
    );
    d.line("s", [2.68, Y, 73.4], [2.82, Y, 72.9], "#6b4a20", 0.5);
    d.line("s", [2.68, Y, 71.4], [2.79, Y, 71], "#6b4a20", 0.5);
  });
  // marker tray
  s.box({ x: 0.5, y: 0.04, w: 2, d: 0.1, z: 19.5, h: 1.8, mat: M.aluminium, line: 0.8 });
  s.box({ x: 0.7, y: 0.06, w: 0.18, d: 0.05, z: 21.3, h: 1.4, mat: { c: K.red, flat: true }, line: 0.5 });
  s.box({ x: 0.95, y: 0.06, w: 0.18, d: 0.05, z: 21.3, h: 1.4, mat: { c: K.slate, flat: true }, line: 0.5 });
  s.box({ x: 2.05, y: 0.05, w: 0.24, d: 0.07, z: 21.3, h: 2.4, mat: { c: sh(K.cream, 0.95) }, line: 0.6 }, (d) => {
    d.poly("s", fr("s", 0.12, 2.05, 2.29, 21.3, 22.3), K.graphite);
  });
}
