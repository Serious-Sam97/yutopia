import { fabric, fabricDark, paintOf } from "./home";
import { fe, INK, type Mat, type Sketch, sh, te } from "./kit";
import { K, M } from "./pal";

// For pets (shared/pets.ts): a bed it curls up in, bowls for food and water
// (what's left in them shows), a scratching post, a little house.

// A round cushion with a rolled rim (variant 0), or a low wicker basket with
// a cushion in it (variant 1); its fabric is painted.
export function petBed(s: Sketch, props: Record<string, unknown>) {
  const c = paintOf(props, K.rust);
  const v = Math.floor(s.seed * 2);
  if (v === 1) {
    const wicker: Mat = { c: "#b08a56", top: "#c9a46a", left: "#9a7647", right: "#a98252" };
    s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.44, r2: 0.46, h: 9, mat: wicker, line: 1 }, (d) => {
      // the weave
      for (let i = 0; i < 5; i++) {
        const [a, b] = [
          d.m(0.06 + i * 0.03, 0.5 + i * 0.09, 2 + i * 1.4),
          d.m(0.5 + i * 0.09, 0.94 - i * 0.03, 2 + i * 1.4),
        ];
        d.raw(
          `<path d="M${a.join(" ")} Q${(a[0] + b[0]) / 2} ${b[1] + 3} ${b.join(" ")}" stroke="${sh("#b08a56", 0.72)}" stroke-width=".6" fill="none" opacity=".7"/>`,
        );
      }
    });
    s.cyl({ x: 0.5, y: 0.5, z: 9, r: 0.36, h: 3, mat: fabric(c), line: 0.8 }, (d) => {
      d.poly("t", te(12, 0.5, 0.52, 0.22), sh(c, 0.86));
    });
  } else {
    s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.42, r2: 0.44, h: 6, mat: fabricDark(c), line: 1 });
    // the rolled rim, a dip in the middle
    s.cyl({ x: 0.5, y: 0.5, z: 6, r: 0.44, r2: 0.4, h: 4, mat: fabric(c), line: 0.9 }, (d) => {
      d.poly("t", te(10, 0.5, 0.53, 0.26), sh(c, 0.82));
      d.poly("t", te(10.3, 0.48, 0.5, 0.2), sh(c, 0.9));
    });
  }
  s.shadowDot(0.5, 0.52, 0.46, 0.42);
}

// A bowl, with what's left in it (props.portions 0..3): kibble, or water.
function bowl(s: Sketch, props: Record<string, unknown>, water: boolean) {
  const c = paintOf(props, water ? K.slate : K.olive);
  const left = Math.max(0, Math.min(3, Number(props.portions ?? 0)));
  const mat: Mat = { c, top: sh(c, 1.1), left: sh(c, 0.85), right: sh(c, 0.95), gloss: 0.3 };
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.2, r2: 0.25, h: 6, mat, line: 1 }, (d) => {
    // the inside
    d.poly("t", te(6, 0.5, 0.5, 0.2), sh(c, 0.7));
    if (!left) return;
    if (water) {
      d.poly("t", te(5.4 + left * 0.2, 0.5, 0.5, 0.18 + left * 0.005), "#8fc0ea", { op: 0.85 });
      d.poly("t", te(5.6 + left * 0.2, 0.46, 0.47, 0.05), "#ffffff", { op: 0.45 });
    } else {
      d.poly("t", te(5.2 + left * 0.3, 0.5, 0.5, 0.17), "#8a5a36");
      const n = 4 + left * 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + s.seed;
        const r = 0.05 + ((i * 7) % 5) * 0.02;
        d.poly(
          "t",
          te(5.4 + left * 0.3, 0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.025),
          i % 2 ? "#b5773f" : "#6b4128",
        );
      }
    }
  });
  s.shadowDot(0.5, 0.51, 0.26, 0.4);
}
export const petBowl = (s: Sketch, p: Record<string, unknown>) => bowl(s, p, false);
export const waterBowl = (s: Sketch, p: Record<string, unknown>) => bowl(s, p, true);

// A sisal post on a carpet base, a perch on top.
export function scratchPost(s: Sketch, _props: Record<string, unknown>) {
  const carpet: Mat = { c: "#7a7260", top: "#8d8470", left: "#6a6252", right: "#716959" };
  s.box({ x: 0.15, y: 0.15, w: 0.7, d: 0.7, z: 0, h: 3, mat: carpet, line: 1 });
  const sisal: Mat = { c: "#c9a46a", top: "#d9b47a", left: "#a98252", right: "#b8925c" };
  s.cyl({ x: 0.5, y: 0.5, z: 3, r: 0.09, h: 34, mat: sisal, line: 0.9 }, (d) => {
    // the wound rope
    for (let i = 0; i < 9; i++) {
      const z = 5 + i * 3.6;
      const [a, b] = [d.m(0.41, 0.5, z), d.m(0.59, 0.5, z + 1.2)];
      d.raw(
        `<path d="M${a.join(" ")} L${b.join(" ")}" stroke="${sh("#c9a46a", 0.7)}" stroke-width=".55" fill="none"/>`,
      );
    }
  });
  s.box({ x: 0.28, y: 0.28, w: 0.44, d: 0.44, z: 37, h: 3, mat: carpet, line: 1 });
  // a dangling toy on a string
  s.cyl({ x: 0.72, y: 0.4, z: 24, r: 0.035, h: 3, mat: { c: K.rust, flat: true }, line: 0.6 });
  s.shadow(0.15, 0.15, 0.7, 0.7, 0.35);
}

// A small house: painted walls, a dark roof, a round door with a mat.
export function petHouse(s: Sketch, props: Record<string, unknown>) {
  const c = paintOf(props, K.olive);
  const v = Math.floor(s.seed * 2);
  const wall: Mat = { c, top: sh(c, 1.08), left: sh(c, 0.82), right: sh(c, 0.92) };
  const roof: Mat =
    v === 1 ? { c: K.rust, top: sh(K.rust, 1.1), left: sh(K.rust, 0.8), right: sh(K.rust, 0.9) } : M.walnutDark;
  s.box({ x: 0.08, y: 0.1, w: 0.84, d: 0.8, z: 0, h: 20, mat: wall, line: 1.1 }, (d) => {
    // the door, on the front, with a mat in front of it
    d.poly("s", fe("s", 0.9, 0.5, 10, 0.17, 9), "#2a1a12");
    d.poly("s", fe("s", 0.9, 0.5, 10, 0.13, 7), "#1a100a");
    // a little window on the right side
    d.poly("e", fe("e", 0.92, 0.5, 13, 0.08, 3), "#f3e6c0", { stroke: INK, sw: 0.8 });
  });
  // the roof: two slopes meeting in a ridge
  s.box({ x: 0.02, y: 0.04, w: 0.96, d: 0.92, z: 20, h: 3, mat: roof, line: 1 });
  s.box({ x: 0.14, y: 0.16, w: 0.72, d: 0.68, z: 23, h: 4, mat: roof, line: 0.9 });
  s.box({ x: 0.3, y: 0.32, w: 0.4, d: 0.36, z: 27, h: 3, mat: roof, line: 0.8 });
  // the mat
  s.box({ x: 0.3, y: 0.9, w: 0.4, d: 0.09, z: 0, h: 1, mat: { c: "#8a5a36", flat: true }, line: 0.6 });
  s.shadow(0.06, 0.08, 0.88, 0.86, 0.4);
}
