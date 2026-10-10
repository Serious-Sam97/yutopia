import { fe, fr, INK, rnd, type Sketch, sh, type V3 } from "./kit";
import { K, M } from "./pal";

// Wall items hang on a back wall: local y ∈ [−0.06, 0.06], their face at y 0.04.
const Y = 0.04;

function dropShadow(s: Sketch, x0: number, x1: number, z0: number, z1: number) {
  s.shape({ x: x0, y: -0.07, w: x1 - x0, d: 0.02, z: z0, h: z1 - z0 }, (d) => {
    d.poly("s", fr("s", -0.06, x0 + 0.06, x1 + 0.06, z0 - 3, z1 - 2), "#1a120c", { op: 0.22 });
  });
}

// A slightly skewed rectangle on the wall (notes, polaroids).
function note(u0: number, u1: number, z0: number, z1: number, tilt: number): V3[] {
  return [
    [u0, Y + 0.01, z1 + tilt],
    [u1, Y + 0.01, z1 - tilt],
    [u1, Y + 0.01, z0 - tilt],
    [u0, Y + 0.01, z0 + tilt],
  ];
}

// 4-tile big screen. The engine mounts the board / screen share on the glass
// (x 0.14 → 3.86, z 21 → 73, y 0.06). Story: an ON AIR lamp and a sticky note.
export function screenWall(s: Sketch) {
  dropShadow(s, 0.06, 3.94, 16, 78);
  s.box({ x: 0.06, y: -0.06, w: 3.88, d: 0.1, z: 16, h: 62, mat: M.graphite }, (d) => {
    d.poly("s", fr("s", Y, 0.11, 3.89, 19.5, 74.5), "#151310");
    d.poly("s", fr("s", Y, 0.14, 3.86, 21, 73), K.glass);
    d.poly(
      "s",
      [
        [0.2, Y, 73],
        [0.9, Y, 73],
        [0.5, Y, 52],
        [0.2, Y, 60],
      ],
      "#ffffff",
      { op: 0.05 },
    );
    d.poly("s", fe("s", Y, 3.8, 18, 0.02, 0.8, 8), K.red, { glow: true });
    d.poly("s", note(3.56, 3.8, 70, 77, 0.6), K.amberSoft, { stroke: "#b07a22", sw: 0.4 });
  });
  // soundbar + bracket
  s.box({ x: 1.2, y: -0.02, w: 1.6, d: 0.1, z: 10, h: 5, mat: M.graphite, puff: 0.5 }, (d) => {
    for (let i = 0; i < 24; i++) d.poly("s", fe("s", 0.08, 1.28 + i * 0.06, 12.5, 0.012, 0.6, 6), "#45413a");
  });
  // ON AIR lamp above the screen
  s.box({ x: 1.7, y: -0.04, w: 0.6, d: 0.08, z: 80, h: 6, mat: M.graphite, line: 0.8 }, (d) => {
    d.poly("s", fr("s", Y, 1.74, 2.26, 81, 85), "#5a2018");
    for (let i = 0; i < 5; i++) d.poly("s", fr("s", Y, 1.79 + i * 0.09, 1.85 + i * 0.09, 82, 84), "#b8705e");
  });
}

// 2-tile whiteboard. The engine draws the live miniature on the surface
// (x 0.14 → 1.86, z 27 → 61). Story: ghosts of erased marker under it.
export function whiteboard(s: Sketch) {
  dropShadow(s, 0.08, 1.92, 24, 64);
  s.box({ x: 0.08, y: -0.04, w: 1.84, d: 0.08, z: 24, h: 40, mat: M.aluminium }, (d) => {
    d.poly("s", fr("s", Y, 0.14, 1.86, 27, 61), "#fbf8ef");
    // erased ghosts
    for (let i = 0; i < 4; i++) {
      const u = 0.3 + rnd(i, 1) * 1.1;
      const z = 33 + rnd(i, 2) * 22;
      d.line("s", [u, Y, z], [u + 0.2 + rnd(i, 3) * 0.2, Y, z - 2 + rnd(i, 4) * 4], "#c9d0d8", 1.6, 0.5);
    }
    d.poly(
      "s",
      [
        [0.18, Y, 61],
        [0.6, Y, 61],
        [0.34, Y, 48],
        [0.18, Y, 52],
      ],
      "#ffffff",
      { op: 0.35 },
    );
  });
  s.box({ x: 0.2, y: 0.04, w: 1.6, d: 0.1, z: 22, h: 2, mat: M.aluminium, line: 0.7 });
  for (const [x, c] of [
    [0.4, K.red],
    [0.6, K.slate],
    [0.8, K.olive],
  ] as const)
    s.box({ x, y: 0.06, w: 0.15, d: 0.04, z: 24, h: 1.2, mat: { c, flat: true }, line: 0.4 });
  s.box({ x: 1.4, y: 0.05, w: 0.22, d: 0.07, z: 24, h: 2.2, mat: { c: K.graphite }, line: 0.5 }, (d) =>
    d.poly(
      "t",
      [
        [1.42, 0.06, 26.2],
        [1.6, 0.06, 26.2],
        [1.6, 0.11, 26.2],
        [1.42, 0.11, 26.2],
      ],
      K.cream,
    ),
  );
}

// 2-tile cork notice board with pinned papers (seeded), a polaroid and a flyer.
export function noticeBoard(s: Sketch) {
  dropShadow(s, 0.08, 1.92, 28, 62);
  s.box({ x: 0.08, y: -0.04, w: 1.84, d: 0.08, z: 28, h: 34, mat: M.walnut }, (d) => {
    d.poly("s", fr("s", Y, 0.14, 1.86, 31, 59), "#c49a6c");
    for (let i = 0; i < 40; i++)
      d.poly("s", fe("s", Y, 0.18 + rnd(i, 1, s.seed) * 1.64, 32 + rnd(i, 2, s.seed) * 26, 0.008, 0.45, 5), "#9c754c");
    const cols = [K.paper, K.amberSoft, K.cream, "#d8e0d0"];
    for (let i = 0; i < 6; i++) {
      const u = 0.2 + (i % 3) * 0.52 + rnd(i, 1, s.seed) * 0.12;
      const z = 34 + Math.floor(i / 3) * 12 + rnd(i, 2, s.seed) * 4;
      const t = (rnd(i, 3, s.seed) - 0.5) * 1.6;
      d.poly("s", note(u, u + 0.3, z, z + 9, t), cols[i % 4], { stroke: "#9a8a66", sw: 0.3 });
      for (let k = 0; k < 3; k++)
        d.line("s", [u + 0.04, Y + 0.012, z + 6.5 - k * 2], [u + 0.22, Y + 0.012, z + 6.3 - k * 2], "#6b5a40", 0.4);
      d.poly("s", fe("s", Y + 0.015, u + 0.15, z + 8.2, 0.016, 0.8, 8), K.red);
    }
    // polaroid (story)
    d.poly("s", note(1.5, 1.74, 44, 54, -0.8), K.paper, { stroke: "#9a8a66", sw: 0.3 });
    d.poly("s", note(1.53, 1.71, 47, 53, -0.8), K.sage);
  });
}

// Acoustic panel: felt frame with a grid of foam wedges.
export function acousticPanel(s: Sketch) {
  dropShadow(s, 0.14, 0.86, 22, 68);
  s.box({ x: 0.14, y: -0.04, w: 0.72, d: 0.08, z: 22, h: 46, mat: { c: K.rustDark, top: "#9a4636" } }, (d) => {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        const u = 0.18 + c * 0.22;
        const z = 25 + r * 8.4;
        const lit = (r + c) % 2 === 0;
        d.poly("s", fr("s", Y, u, u + 0.2, z, z + 7.6), lit ? "#9e4a36" : "#7d3a2c");
        // wedge ridge: light top-left half
        d.poly(
          "s",
          [
            [u, Y + 0.002, z + 7.6],
            [u + 0.2, Y + 0.002, z + 7.6],
            [u, Y + 0.002, z],
          ],
          "#ffffff",
          { op: lit ? 0.08 : 0.04 },
        );
      }
  });
}

// Framed posters: props.art "tape" | "vu" | "yondra". Story: a corner of tape.
export function poster(s: Sketch, props: Record<string, unknown>) {
  const art = String(props.art ?? "tape");
  dropShadow(s, 0.12, 0.88, 30, 66);
  s.box({ x: 0.12, y: -0.03, w: 0.76, d: 0.06, z: 30, h: 36, mat: { c: "#2b2420", top: "#3a322c" }, line: 1 }, (d) => {
    const P = (u0: number, u1: number, z0: number, z1: number, c: string) =>
      d.poly("s", fr("s", 0.03, u0, u1, z0, z1), c);
    if (art === "vu") {
      P(0.16, 0.84, 33, 63, K.cream);
      // a VU meter: arc scale, red zone, needle
      const arc: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * (0.15 + (i / 12) * 0.7);
        arc.push([0.5 - Math.cos(a) * 0.26, 0.031, 42 + Math.sin(a) * 15]);
      }
      for (let i = 0; i < 12; i++) d.line("s", arc[i], arc[i + 1], i > 8 ? K.red : INK, 1.1);
      for (let i = 0; i <= 12; i += 2)
        d.line(
          "s",
          arc[i],
          [arc[i][0] + (0.5 - arc[i][0]) * 0.15, 0.031, arc[i][2] - (arc[i][2] - 42) * 0.15],
          INK,
          0.6,
        );
      d.line("s", [0.5, 0.032, 42], [0.66, 0.032, 54], K.red, 1);
      P(0.3, 0.7, 35, 38, K.walnut);
    } else if (art === "yondra") {
      P(0.16, 0.84, 33, 63, K.walnutDark);
      // sunset stripes + a sun
      d.poly("s", fe("s", 0.031, 0.5, 47, 0.18, 9, 24), K.amber);
      const bands: [number, string][] = [
        [44, K.rust],
        [47.5, K.amberSoft],
        [51, K.olive],
      ];
      for (const [z, c] of bands) P(0.16, 0.84, z - 3.4, z, c);
      P(0.16, 0.84, 33, 40.6, K.walnutDark);
      for (let i = 0; i < 3; i++) P(0.3, 0.7 - i * 0.1, 35 + i * 1.6, 35.8 + i * 1.6, K.cream);
    } else {
      P(0.16, 0.84, 33, 63, K.amberSoft);
      // a big cassette
      P(0.24, 0.76, 40, 56, K.graphite);
      P(0.3, 0.7, 50, 54, K.cream);
      for (const u of [0.38, 0.62]) d.poly("s", fe("s", 0.031, u, 46, 0.06, 2.6, 16), K.cream);
      for (const u of [0.38, 0.62]) d.poly("s", fe("s", 0.032, u, 46, 0.025, 1, 10), K.graphite);
      P(0.36, 0.64, 41, 42.4, "#4a463e");
      for (let i = 0; i < 3; i++) P(0.24, 0.76, 58 + i * 1.6, 58.6 + i * 1.6, sh(K.amberSoft, 0.8));
    }
    // a strip of tape on the corner
    d.poly("s", note(0.66, 0.84, 63, 66.5, 0.8), "#e8dbb5", { op: 0.9 });
  });
}
