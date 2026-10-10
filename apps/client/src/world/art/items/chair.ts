import { fr, INK, type Sketch, sh } from "./kit";
import { K, M } from "./pal";

// 80s office swivel chair: five-star base on casters, gas column, a rust
// upholstered seat and backrest (backrest on −y; it's the "bias" part that sorts
// behind or in front of a sitter). Story detail (seeded): a tape patch on the
// back, or a knitted cardigan over it.
// props.occupied: the seat sinks a little and the back leans back.
export function chair(s: Sketch, props: Record<string, unknown>) {
  const v = Math.floor(s.seed * 4);
  const sit = props.occupied ? 1 : 0;

  // five-star base
  s.shape(
    { x: 0.18, y: 0.18, w: 0.64, d: 0.64, z: 0, h: 4 },
    (d) => {
      const [cx, cy] = d.m(0.5, 0.5, 3);
      let g = "";
      const arms: [number, number][] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.5;
        arms.push(d.m(0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3, 1.5));
      }
      // back arms first (higher on screen)
      arms.sort((a, b) => a[1] - b[1]);
      for (const [x, y] of arms) {
        g += `<path d="M${cx} ${cy}L${x} ${y}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M${cx} ${cy}L${x} ${y}" stroke="#3d3a33" stroke-width="2.2" stroke-linecap="round"/>`;
        g += `<ellipse cx="${x}" cy="${y + 1.6}" rx="2.2" ry="1.6" fill="#1c1a17" stroke="${INK}" stroke-width=".6"/>`;
      }
      g += `<ellipse cx="${cx}" cy="${cy}" rx="3.2" ry="1.8" fill="#4a463e" stroke="${INK}" stroke-width=".8"/>`;
      d.raw(g);
    },
    { pad: 4 },
  );
  s.cyl({ x: 0.5, y: 0.5, z: 3, r: 0.045, h: 7.5, mat: { c: "#57534a", top: "#6d685d" }, line: 0.8 });
  s.box({ x: 0.36, y: 0.34, w: 0.28, d: 0.3, z: 9.5, h: 1.5, mat: M.graphite, line: 0.7 });

  // seat cushion
  s.box({ x: 0.19, y: 0.24, w: 0.62, d: 0.58, z: 11, h: 4.5 - sit, mat: M.rust, puff: 1.4 }, (d) => {
    d.line("t", [0.24, 0.76, 15.5 - sit], [0.76, 0.76, 15.5 - sit], sh(K.rust, 0.8), 0.5, 0.7); // piping
  });

  // backrest spine + backrest (bias: sorts around the sitter)
  s.box({ x: 0.45, y: 0.15, w: 0.1, d: 0.08, z: 9.5, h: 10, mat: M.graphite, bias: true, line: 0.8 });
  s.box(
    { x: 0.18, y: 0.1 - sit * 0.04, w: 0.64, d: 0.12, z: 17 - sit, h: 20, mat: M.rust, puff: 1.8, bias: true },
    (d) => {
      // channel stitching on the front (faces the sitter)
      for (const z of [23.5, 30]) d.line("s", [0.22, 0.22, z], [0.78, 0.22, z], sh(K.rust, 0.72), 0.6, 0.8);
      if (v === 1) {
        // tape patch on the back
        d.poly("n", fr("n", 0.1, 0.56, 0.7, 26, 31), "#e4d7b6", { stroke: "#b3a37c", sw: 0.4 });
        d.line("n", [0.57, 0.1, 30.5], [0.69, 0.1, 26.5], "#b3a37c", 0.5);
      }
    },
  );
  if (v === 3) {
    // a cardigan hanging over the backrest
    s.box({ x: 0.27, y: 0.03, w: 0.46, d: 0.07, z: 26, h: 11, mat: { c: K.amberSoft }, puff: 1.6, bias: true }, (d) => {
      for (let i = 0; i < 5; i++) d.line("n", [0.3 + i * 0.09, 0.03, 36], [0.3 + i * 0.09, 0.03, 27], "#b9792a", 0.6);
    });
  }

  s.shadowDot(0.5, 0.5, 0.3, 0.32);
  s.shadowDot(0.5, 0.5, 0.12, 0.3);
}
