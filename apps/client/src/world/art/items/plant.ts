import { INK, type Mat, rnd, type Sketch, sh, te } from "./kit";
import { K } from "./pal";

// Five seeded plants (props.variant overrides): monstera in terracotta, snake
// plant in a glazed cream pot, a fern on a walnut stand, a rubber tree in rust,
// a cactus in a low olive bowl. Story details: a plant tag, a "water me" note,
// a cactus flower.
export const PLANT_VARIANTS = 5;

type Leaf = { x: number; y: number; a: number; len: number; wid: number; col: string; bend?: number; kind?: string };

// One leaf, base at (x, y) in screen px, pointing at angle a (0 = right, −π/2 = up).
function leaf(l: Leaf): string {
  const ca = Math.cos(l.a);
  const sa = Math.sin(l.a);
  const tx = l.x + ca * l.len;
  const ty = l.y + sa * l.len;
  const nx = -sa;
  const ny = ca;
  const b = l.bend ?? 0;
  const mx = l.x + ca * l.len * 0.5 + nx * b;
  const my = l.y + sa * l.len * 0.5 + ny * b;
  const w = l.wid;
  const p1 = [mx + nx * w, my + ny * w];
  const p2 = [mx - nx * w, my - ny * w];
  const f = (n: number) => Math.round(n * 100) / 100;
  const hi = sh(l.col, 1.18);
  let svg = `<path d="M${f(l.x)} ${f(l.y)} Q${f(p1[0])} ${f(p1[1])} ${f(tx)} ${f(ty)} Q${f(p2[0])} ${f(p2[1])} ${f(l.x)} ${f(l.y)}Z" fill="${l.col}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`;
  // lit half (upper-left side of the leaf)
  const lit = ny < 0 ? p2 : p1;
  svg += `<path d="M${f(l.x)} ${f(l.y)} Q${f((lit[0] + mx) / 2)} ${f((lit[1] + my) / 2)} ${f(tx)} ${f(ty)} Q${f(mx)} ${f(my)} ${f(l.x)} ${f(l.y)}Z" fill="${hi}" opacity=".55"/>`;
  svg += `<path d="M${f(l.x)} ${f(l.y)} Q${f(mx)} ${f(my)} ${f(tx)} ${f(ty)}" stroke="${sh(l.col, 0.7)}" stroke-width=".6" fill="none"/>`;
  if (l.kind === "monstera") {
    // the splits
    for (const t of [0.35, 0.55, 0.75]) {
      const ex = l.x + ca * l.len * t;
      const ey = l.y + sa * l.len * t;
      for (const sgn of [1, -1])
        svg += `<path d="M${f(ex + nx * w * 0.25 * sgn)} ${f(ey + ny * w * 0.25 * sgn)} L${f(ex + nx * w * 0.62 * sgn + ca * 2)} ${f(ey + ny * w * 0.62 * sgn + sa * 2)}" stroke="${sh(l.col, 0.6)}" stroke-width="1.1" stroke-linecap="round"/>`;
    }
  }
  if (l.kind === "snake") {
    // yellow edge + bands
    svg += `<path d="M${f(l.x)} ${f(l.y)} Q${f(p1[0])} ${f(p1[1])} ${f(tx)} ${f(ty)}" stroke="#c9b45a" stroke-width=".8" fill="none"/>`;
    for (let i = 1; i < 5; i++) {
      const ex = l.x + ca * l.len * (i / 5);
      const ey = l.y + sa * l.len * (i / 5);
      svg += `<path d="M${f(ex - nx * w * 0.4)} ${f(ey - ny * w * 0.4)} L${f(ex + nx * w * 0.4)} ${f(ey + ny * w * 0.4 - 1)}" stroke="${sh(l.col, 0.75)}" stroke-width=".7"/>`;
    }
  }
  return svg;
}

function pot(s: Sketch, mat: Mat, r: number, r2: number, h: number, z = 0, rim = true): number {
  s.cyl({ x: 0.5, y: 0.5, z, r, r2, h, mat });
  if (rim) s.cyl({ x: 0.5, y: 0.5, z: z + h, r: r2 + 0.02, h: 2.5, mat: { c: sh(mat.c, 1.05), top: sh(mat.c, 1.15) } });
  const top = z + h + (rim ? 2.5 : 0);
  s.shape({ x: 0.5 - r2, y: 0.5 - r2, w: r2 * 2, d: r2 * 2, z: top, h: 0.2 }, (d) => {
    d.poly("t", te(top - 0.6, 0.5, 0.5, r2 - 0.015), K.soil);
    for (let i = 0; i < 4; i++)
      d.poly("t", te(top - 0.5, 0.5 + (rnd(i, 1) - 0.5) * r2, 0.5 + (rnd(i, 2) - 0.5) * r2, 0.012, 6), "#5a4430");
  });
  return top;
}

export function plant(s: Sketch, props: Record<string, unknown>) {
  const v = typeof props.variant === "number" ? props.variant % PLANT_VARIANTS : Math.floor(s.seed * PLANT_VARIANTS);
  let top = 0;
  const foliage = (zTop: number, h: number, build: (cx: number, cy: number) => string, pad = 16) =>
    s.shape(
      { x: 0.2, y: 0.2, w: 0.6, d: 0.6, z: zTop, h },
      (d) => {
        const [cx, cy] = d.m(0.5, 0.5, zTop);
        d.raw(build(cx, cy));
      },
      { pad },
    );

  if (v === 0) {
    // monstera
    top = pot(s, { c: K.terracotta, top: "#cf7b4f" }, 0.2, 0.25, 15);
    foliage(top, 46, (cx, cy) => {
      const leaves: Leaf[] = [];
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.9 + (rnd(i, 3) - 0.5) * 0.3;
        leaves.push({
          x: cx + Math.cos(a) * 4,
          y: cy - 10 - rnd(i, 4) * 14 - (1 - Math.abs(Math.cos(a))) * 8,
          a,
          len: 26 + rnd(i, 5) * 10,
          wid: 12 + rnd(i, 6) * 3,
          bend: (a > -Math.PI / 2 ? 1 : -1) * 4,
          col: [K.leaf, K.leafDark, K.leafLight][i % 3],
          kind: "monstera",
        });
      }
      // stems first, then leaves back to front (the ones pointing up are behind)
      let g = "";
      for (const l of leaves)
        g += `<path d="M${cx} ${cy}Q${cx} ${l.y} ${l.x} ${l.y}" stroke="${K.leafDark}" stroke-width="1.6" fill="none"/>`;
      leaves.sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
      return g + leaves.map(leaf).join("");
    });
    // plant tag (story)
    s.shape({ x: 0.62, y: 0.6, w: 0.05, d: 0.05, z: top, h: 8 }, (d) => {
      const [x, y] = d.m(0.66, 0.68, top);
      d.raw(
        `<path d="M${x} ${y}L${x + 0.4} ${y - 4}" stroke="#8e7a5a" stroke-width="1"/><path d="M${x - 2.4} ${y - 4.2}l5.6 -1.4l0 3.6l-5.6 1.4z" fill="${K.paper}" stroke="${INK}" stroke-width=".5"/>`,
      );
    });
  } else if (v === 1) {
    // snake plant
    s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.19, h: 7, mat: { c: K.cream, top: "#fbf3e2" } });
    s.cyl({ x: 0.5, y: 0.5, z: 7, r: 0.19, h: 3, mat: { c: K.rust }, line: 0.6 });
    top = pot(s, { c: K.cream, top: "#fbf3e2" }, 0.19, 0.19, 8, 10, false);
    foliage(
      top,
      44,
      (cx, cy) => {
        const leaves: Leaf[] = [];
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i / 8 - 0.5) * 0.9 + (rnd(i, 7) - 0.5) * 0.2;
          leaves.push({
            x: cx + (i / 8 - 0.5) * 14,
            y: cy - 1,
            a,
            len: 30 + rnd(i, 8) * 16,
            wid: 3.4,
            bend: (rnd(i, 9) - 0.5) * 3,
            col: i % 2 ? K.leafDark : "#56703a",
            kind: "snake",
          });
        }
        leaves.sort((a, b) => b.len - a.len);
        return leaves.map(leaf).join("");
      },
      12,
    );
  } else if (v === 2) {
    // fern on a walnut stand
    for (const [x, y] of [
      [0.3, 0.38],
      [0.68, 0.36],
      [0.5, 0.7],
    ])
      s.cyl({ x, y, z: 0, r: 0.025, h: 12, mat: { c: "#4a2e1d" }, line: 0.6 });
    top = pot(s, { c: K.walnut, top: "#74492f" }, 0.17, 0.23, 9, 11);
    foliage(top, 26, (cx, cy) => {
      let g = "";
      const n = 12;
      const fronds: { a: number; len: number }[] = [];
      for (let i = 0; i < n; i++)
        fronds.push({ a: (i / n) * Math.PI * 2 + rnd(i, 10) * 0.3, len: 22 + rnd(i, 11) * 8 });
      fronds.sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
      for (const fd of fronds) {
        const ex = cx + Math.cos(fd.a) * fd.len;
        const ey = cy - 3 + Math.sin(fd.a) * fd.len * 0.45;
        const mx = cx + Math.cos(fd.a) * fd.len * 0.45;
        const my = cy - 24 + Math.sin(fd.a) * fd.len * 0.2;
        const col = Math.sin(fd.a) > 0 ? K.leafLight : K.leaf;
        g += `<path d="M${cx} ${cy - 2}Q${mx} ${my} ${ex} ${ey}" stroke="${INK}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
        g += `<path d="M${cx} ${cy - 2}Q${mx} ${my} ${ex} ${ey}" stroke="${col}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
        // leaflets
        for (let k = 1; k < 8; k++) {
          const t = k / 8;
          const px = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * ex;
          const py = (1 - t) * (1 - t) * (cy - 2) + 2 * (1 - t) * t * my + t * t * ey;
          // leaflets on both sides, perpendicular to the frond
          const tx = 2 * (1 - t) * (mx - cx) + 2 * t * (ex - mx);
          const ty = 2 * (1 - t) * (my - cy + 2) + 2 * t * (ey - my);
          const tl = Math.hypot(tx, ty) || 1;
          const l = 4.2 * (1 - t * 0.55);
          const nx = (-ty / tl) * l;
          const ny = (tx / tl) * l;
          g += `<path d="M${px + nx} ${py + ny + 1}L${px} ${py}L${px - nx} ${py - ny + 1}" stroke="${sh(col, 1.12)}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
      }
      return g;
    });
  } else if (v === 3) {
    // rubber tree, tall
    top = pot(s, { c: K.rust, top: "#c96a3f" }, 0.19, 0.22, 16);
    foliage(
      top,
      70,
      (cx, cy) => {
        let g = `<path d="M${cx} ${cy}C${cx - 2} ${cy - 20} ${cx + 3} ${cy - 40} ${cx} ${cy - 62}" stroke="${INK}" stroke-width="4.2" fill="none" stroke-linecap="round"/><path d="M${cx} ${cy}C${cx - 2} ${cy - 20} ${cx + 3} ${cy - 40} ${cx} ${cy - 62}" stroke="#6b4a2c" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
        const leaves: Leaf[] = [];
        for (let i = 0; i < 11; i++) {
          const side = i % 2 ? 1 : -1;
          const h = 14 + i * 4.8;
          const a = -Math.PI / 2 + side * (0.5 + rnd(i, 12) * 0.5);
          leaves.push({
            x: cx + side * 1.5,
            y: cy - h,
            a,
            len: 13 + rnd(i, 13) * 5,
            wid: 6,
            bend: side * 1.5,
            col: [K.leafDark, "#3c5422", K.leaf][i % 3],
          });
        }
        g += leaves.map(leaf).join("");
        return g;
      },
      14,
    );
    // "water me" note on the pot (story)
    s.shape({ x: 0.5, y: 0.7, w: 0.1, d: 0.02, z: 6, h: 6 }, (d) => {
      const [x, y] = d.m(0.42, 0.71, 12);
      d.raw(
        `<path d="M${x} ${y}l6 -1.2l.4 5.4l-6 1.2z" fill="${K.amberSoft}" stroke="#a8721f" stroke-width=".4"/><path d="M${x + 1} ${y + 1.6}l4 -.8M${x + 1.2} ${y + 3.2}l3 -.6" stroke="#6b4a20" stroke-width=".5"/>`,
      );
    });
  } else {
    // cactus in a low bowl, with a flower
    top = pot(s, { c: K.olive, top: "#7f8d47" }, 0.24, 0.29, 9);
    foliage(
      top,
      40,
      (cx, cy) => {
        const body = (x: number, y: number, w: number, h: number) =>
          `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="${w / 2}" fill="#6f8a42" stroke="${INK}" stroke-width="1.1"/><rect x="${x - w / 2 + 1.4}" y="${y - h + 2}" width="${w * 0.3}" height="${h - 5}" rx="${w * 0.15}" fill="#9cb866" opacity=".7"/><path d="M${x + w * 0.18} ${y - h + 3}L${x + w * 0.18} ${y - 2}" stroke="#4f6630" stroke-width=".7"/>`;
        let g = "";
        g += `<path d="M${cx - 4} ${cy - 16}h-6v-12" stroke="${INK}" stroke-width="6.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${cx - 4} ${cy - 16}h-6v-12" stroke="#6f8a42" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        g += `<path d="M${cx + 4} ${cy - 24}h6v-8" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${cx + 4} ${cy - 24}h6v-8" stroke="#6f8a42" stroke-width="3.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        g += body(cx, cy, 10, 38);
        // spines
        for (let i = 0; i < 7; i++)
          g += `<path d="M${cx - 5} ${cy - 6 - i * 4.6}l-1.6 -.8M${cx + 5} ${cy - 8 - i * 4.6}l1.6 -.8" stroke="${K.cream}" stroke-width=".5"/>`;
        // flower (story)
        g += `<circle cx="${cx + 1}" cy="${cy - 38}" r="3" fill="${K.red}" stroke="${INK}" stroke-width=".7"/><circle cx="${cx + 1}" cy="${cy - 38}" r="1.1" fill="${K.amber}"/>`;
        // pebbles
        for (let i = 0; i < 5; i++)
          g += `<ellipse cx="${cx - 12 + i * 6}" cy="${cy + 2 + (i % 2)}" rx="2" ry="1.2" fill="${["#cfc3a5", "#a69a7d", "#e2d8bf"][i % 3]}" stroke="${INK}" stroke-width=".4"/>`;
        return g;
      },
      10,
    );
  }
  s.shadowDot(0.5, 0.5, v === 4 ? 0.3 : 0.24, 0.42);
}
