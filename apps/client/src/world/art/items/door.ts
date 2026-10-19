import { paintOf } from "./home";
import { rnd, type Sketch, sh, te, tr } from "./kit";
import { K } from "./pal";

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
