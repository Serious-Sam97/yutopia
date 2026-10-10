import { type Mat, type Sketch, sh } from "./kit";
import { K, M } from "./pal";

const OLIVE: Mat = { c: K.olive, top: "#86944e" };
const OLIVE_DARK: Mat = { c: "#5d6930", top: "#717f3c" };

// 70s olive lounge chair, back on −y (the "bias" part, sorted around a sitter).
// props.occupied: the cushion sinks and the back leans a touch. Story: a
// crocheted doily on the back, or a newspaper on the arm.
export function armchair(s: Sketch, props: Record<string, unknown>) {
  const v = Math.floor(s.seed * 2);
  const sit = props.occupied ? 1.6 : 0;
  for (const [x, y] of [
    [0.14, 0.18],
    [0.86, 0.18],
    [0.14, 0.86],
    [0.86, 0.86],
  ])
    s.cyl({ x, y, z: 0, r: 0.03, h: 3, mat: M.walnutDark, line: 0.5 });
  s.box({ x: 0.08, y: 0.12, w: 0.84, d: 0.8, z: 3, h: 7, mat: OLIVE_DARK, puff: 1 });
  s.box({ x: 0.22, y: 0.3, w: 0.56, d: 0.6, z: 10, h: 5 - sit, mat: OLIVE, puff: 1.8 }, (d) => {
    d.line("t", [0.26, 0.86, 15 - sit], [0.74, 0.86, 15 - sit], sh(K.olive, 0.75), 0.5, 0.7);
  });
  for (const ax of [0.08, 0.78]) s.box({ x: ax, y: 0.3, w: 0.14, d: 0.62, z: 10, h: 9, mat: OLIVE_DARK, puff: 1.6 });
  s.box(
    { x: 0.08, y: 0.1 - sit * 0.012, w: 0.84, d: 0.2, z: 10, h: 21 - sit * 0.4, mat: OLIVE, puff: 2.2, bias: true },
    (d) => {
      // button tufting facing the sitter
      for (const z of [18, 25])
        for (const x of [0.3, 0.5, 0.7])
          d.raw(
            (() => {
              const [px, py] = d.m(x, 0.3 - sit * 0.012, z);
              return d.vis("s")
                ? `<circle cx="${px}" cy="${py}" r=".9" fill="${sh(K.olive, 0.6)}"/><circle cx="${px - 0.3}" cy="${py - 0.3}" r=".35" fill="${sh(K.olive, 1.3)}"/>`
                : "";
            })(),
          );
    },
  );
  if (v === 0)
    s.shape(
      { x: 0.3, y: 0.08, w: 0.4, d: 0.06, z: 26, h: 6 },
      (d) => {
        if (!d.vis("s")) return;
        const [x, y] = d.m(0.5, 0.31, 29);
        d.raw(
          `<path d="M${x - 5} ${y - 3} Q${x} ${y - 6} ${x + 5} ${y - 3} L${x + 4} ${y + 3} Q${x} ${y + 5} ${x - 4} ${y + 3}Z" fill="${K.paper}" stroke="#b8a982" stroke-width=".6" stroke-dasharray="1 .6"/>`,
        );
      },
      { bias: true },
    );
  else
    s.box(
      { x: 0.79, y: 0.42, w: 0.12, d: 0.36, z: 19, h: 1.2, mat: { c: K.paper, top: "#ece4cf" }, line: 0.6 },
      (d) => {
        for (let i = 0; i < 3; i++)
          d.line("t", [0.8, 0.48 + i * 0.09, 20.2], [0.9, 0.48 + i * 0.09, 20.2], "#7a7060", 0.4);
      },
    );
  s.shadow(0.08, 0.12, 0.84, 0.8, 0.34, 0.5);
}

// 3×1 teak slatted bench on walnut trestles. Story: a scarf left on one end.
export function bench(s: Sketch) {
  for (const x of [0.12, 2.8]) {
    s.box({ x, y: 0.3, w: 0.08, d: 0.4, z: 0, h: 9, mat: M.walnutDark, line: 0.8 });
    s.box({ x: x - 0.02, y: 0.26, w: 0.12, d: 0.48, z: 0, h: 1.4, mat: M.walnutDark, line: 0.6 });
  }
  s.box({ x: 0.16, y: 0.46, w: 2.68, d: 0.08, z: 4, h: 1.2, mat: M.walnutDark, line: 0.6 });
  for (let i = 0; i < 4; i++)
    s.box({ x: 0.04, y: 0.28 + i * 0.112, w: 2.92, d: 0.095, z: 9, h: 2.6, mat: M.teak, line: 0.8 });
  // scarf (story)
  s.shape({ x: 2.3, y: 0.3, w: 0.4, d: 0.42, z: 11.6, h: 2 }, (d) => {
    const a = d.m(2.32, 0.34, 11.8);
    const b = d.m(2.66, 0.36, 11.8);
    const c = d.m(2.6, 0.7, 11.8);
    const e = d.m(2.34, 0.68, 11.8);
    d.raw(
      `<path d="M${a.join(" ")} Q${(a[0] + b[0]) / 2} ${a[1] - 2} ${b.join(" ")} L${c.join(" ")} Q${(c[0] + e[0]) / 2} ${c[1] + 2} ${e.join(" ")}Z" fill="${K.rust}" stroke="#2a1a12" stroke-width=".8"/><path d="M${(a[0] + e[0]) / 2} ${(a[1] + e[1]) / 2} L${(b[0] + c[0]) / 2} ${(b[1] + c[1]) / 2}" stroke="${K.amberSoft}" stroke-width="1.2"/>`,
    );
  });
  for (const x of [0.16, 2.84]) s.shadow(x - 0.06, 0.26, 0.14, 0.48, 0.4, 0.3);
  s.shadow(0.04, 0.28, 2.92, 0.44, 0.16, 0.5);
}
