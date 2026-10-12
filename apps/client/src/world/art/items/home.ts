import { CLOTH_COLORS } from "@yutopia/shared";
import { fe, fr, INK, type Mat, rnd, type Sketch, sh, te, tr, type V3 } from "./kit";
import { K, M } from "./pal";

// More of a home: a bookcase, a bean bag, a room divider, a kitchen counter, a
// wall clock (its hands are drawn live by the world) and a neon sign.
// Fabric and paint follow props.color when it's set (the build Look's swatches).

export function paintOf(props: Record<string, unknown>, fallback: string): string {
  const c = props.color;
  return typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
}
export const fabric = (c: string): Mat => ({ c, top: sh(c, 1.14) });
export const fabricDark = (c: string): Mat => ({ c: sh(c, 0.8), top: sh(c, 0.92) });

const FINISH: Mat[] = [M.walnut, { c: "#b98e5c", top: "#cfa673" }, { c: K.cream, top: "#f6eedb" }];

// 2×1 bookcase against a wall: four shelves of books (spines seeded), a little
// pot on one of them; its top takes tabletops. Three finishes.
export function bookcase(s: Sketch) {
  const v = Math.floor(s.seed * 3);
  const wood = FINISH[v];
  s.box({ x: 0.04, y: 0.22, w: 1.92, d: 0.58, z: 0, h: 62, mat: wood }, (d) => {
    d.poly("s", fr("s", 0.8, 0.1, 1.9, 3, 59), "#2a1a10");
    for (const z of [3, 17, 31, 45]) {
      d.poly("s", fr("s", 0.8, 0.1, 1.9, z, z + 1.4), sh(wood.c, 1.12));
      let x = 0.14;
      let i = 0;
      const potAt = z === 31 ? 1.4 : -1;
      while (x < 1.84) {
        if (potAt > 0 && x > potAt && x < potAt + 0.3) {
          // a little pot with a trailing plant
          d.poly("s", fr("s", 0.8, x + 0.02, x + 0.2, z + 1.4, z + 6.4), K.terracotta, { stroke: INK, sw: 0.5 });
          d.poly("s", fe("s", 0.8, x + 0.11, z + 9, 0.12, 4, 12), K.leaf, { stroke: INK, sw: 0.5 });
          x += 0.3;
          continue;
        }
        const r = rnd(i, z, s.seed);
        const w = 0.05 + r * 0.04;
        const h = 8 + rnd(i, z + 3, s.seed) * 3.5;
        const col = CLOTH_COLORS[Math.floor(rnd(i, z + 9, s.seed) * CLOTH_COLORS.length)];
        const lean = rnd(i, z + 5, s.seed) > 0.9;
        if (lean && x < 1.7) {
          d.poly(
            "s",
            [
              [x, 0.8, z + 1.4],
              [x + w, 0.8, z + 1.4],
              [x + w + 0.08, 0.8, z + 1.4 + h * 0.92],
              [x + 0.08, 0.8, z + 1.4 + h * 0.92],
            ],
            col,
            { stroke: "#1a100a", sw: 0.3 },
          );
          x += w + 0.1;
        } else {
          d.poly("s", fr("s", 0.8, x, x + w, z + 1.4, z + 1.4 + h), col, { stroke: "#1a100a", sw: 0.3 });
          d.poly("s", fr("s", 0.8, x + 0.012, x + w - 0.012, z + 4, z + 5.4), K.cream, { op: 0.8 });
          x += w + 0.01 + (rnd(i, z + 1, s.seed) > 0.86 ? 0.07 : 0);
        }
        i++;
      }
    }
  });
  s.shadow(0, 0.2, 2, 0.6, 0.4, 0.3);
}

// A slouchy bean bag you sink into (a seat). props.occupied squashes it.
export function beanbag(s: Sketch, props: Record<string, unknown>) {
  const c = paintOf(props, K.rust);
  const sit = props.occupied ? 3 : 0;
  s.cyl({ x: 0.5, y: 0.52, z: 0, r: 0.4, r2: 0.37, h: 7 - sit * 0.4, mat: fabricDark(c), line: 1 });
  s.cyl({ x: 0.5, y: 0.5, z: 7 - sit * 0.4, r: 0.37, r2: 0.25, h: 8 - sit, mat: fabric(c), line: 1 }, (d) => {
    // a dimple where you sit, and a seam
    d.poly("t", te(15 - sit * 1.4, 0.5, 0.56, 0.16), sh(c, 0.88));
    const [a, b] = [d.m(0.2, 0.5, 9), d.m(0.5, 0.86, 9)];
    d.raw(
      `<path d="M${a.join(" ")} Q${a[0]} ${b[1]} ${b.join(" ")}" stroke="${sh(c, 0.7)}" stroke-width=".6" fill="none"/>`,
    );
  });
  s.shadowDot(0.5, 0.52, 0.42, 0.42);
}

// A 2×1 room divider on little feet: fabric (painted), wooden slats, or
// frosted glass in an aluminium frame.
export function partition(s: Sketch, props: Record<string, unknown>) {
  const v = Math.floor(s.seed * 3);
  for (const x of [0.16, 1.7]) s.box({ x, y: 0.36, w: 0.14, d: 0.28, z: 0, h: 2.5, mat: M.walnutDark, line: 0.7 });
  if (v === 2) {
    // frosted glass
    s.box({ x: 0.06, y: 0.46, w: 1.88, d: 0.08, z: 2.5, h: 42, mat: M.aluminium, line: 0.9 }, (d) => {
      d.poly("s", fr("s", 0.54, 0.12, 1.88, 5, 42), "#e8f0f0", { op: 0.75 });
      d.poly(
        "s",
        [
          [0.3, 0.541, 40],
          [0.6, 0.541, 40],
          [0.3, 0.541, 14],
          [0.18, 0.541, 14],
        ],
        "#ffffff",
        { op: 0.35 },
      );
    });
  } else if (v === 1) {
    s.box({ x: 0.06, y: 0.46, w: 1.88, d: 0.08, z: 2.5, h: 42, mat: M.walnut, line: 0.9 }, (d) => {
      d.poly("s", fr("s", 0.54, 0.1, 1.9, 4, 43), "#2a1a10");
      for (let i = 0; i < 11; i++) {
        const x = 0.12 + i * 0.165;
        d.poly("s", fr("s", 0.54, x, x + 0.11, 4, 43), K.teakTop, { stroke: K.walnutDark, sw: 0.4 });
      }
    });
  } else {
    const c = paintOf(props, K.olive);
    s.box({ x: 0.06, y: 0.46, w: 1.88, d: 0.08, z: 2.5, h: 42, mat: M.walnutDark, line: 0.9 }, (d) => {
      d.poly("s", fr("s", 0.54, 0.12, 1.88, 5, 42), c);
      d.poly("s", fr("s", 0.54, 0.98, 1.02, 5, 42), sh(c, 0.75));
      // stitching
      d.poly("s", fr("s", 0.541, 0.18, 1.82, 7, 40), "none", { stroke: sh(c, 1.3), sw: 0.5, op: 0.7 });
    });
  }
  s.shadow(0.06, 0.4, 1.88, 0.2, 0.35, 0.3);
}

// A 2×1 kitchen counter: painted cabinets, a worktop, a sink with a tap on the
// right (things stand on the left half).
export function counter(s: Sketch, props: Record<string, unknown>) {
  const c = paintOf(props, K.cream);
  const v = Math.floor(s.seed * 2);
  s.box({ x: 0.04, y: 0.12, w: 1.92, d: 0.78, z: 0, h: 2, mat: M.walnutDark, line: 0.8 });
  s.box({ x: 0.02, y: 0.1, w: 1.96, d: 0.8, z: 2, h: 22, mat: fabric(c), faces: { s: { c: sh(c, 0.92) } } }, (d) => {
    for (const [u0, u1] of [
      [0.06, 0.66],
      [0.7, 1.3],
      [1.34, 1.94],
    ]) {
      d.poly("s", fr("s", 0.9, u0, u1, 4, 21), sh(c, 0.96), { stroke: sh(c, 0.72), sw: 0.5 });
      d.poly("s", fr("s", 0.9, u1 - 0.12, u1 - 0.06, 17, 19), K.brass);
    }
  });
  const top: Mat = v ? M.teak : { c: "#cfc9bc", top: "#e6e1d6", gloss: 0.7 };
  s.box({ x: 0, y: 0.06, w: 2, d: 0.88, z: 24, h: 2, mat: top, line: 1 }, (d) => {
    // the sink, set into the worktop, and the tap
    d.poly("t", tr(26.02, 1.16, 0.26, 1.82, 0.74), K.alumDark, { stroke: INK, sw: 0.6 });
    d.poly("t", tr(26.03, 1.22, 0.32, 1.76, 0.68), "#5b6366");
    d.poly("t", te(26.04, 1.49, 0.5, 0.03, 8), "#2a2a2a");
  });
  s.cyl({ x: 1.49, y: 0.18, z: 26, r: 0.025, h: 8, mat: M.aluminium, line: 0.6 });
  s.box({ x: 1.465, y: 0.18, w: 0.05, d: 0.16, z: 33, h: 1.2, mat: M.aluminium, line: 0.5 });
  s.shadow(0.02, 0.1, 1.96, 0.8, 0.4, 0.3);
}

// A round wall clock. The world draws its hands live (the time where you are);
// pictures of it (the catalog) show ten past ten.
export function clock(s: Sketch, props: Record<string, unknown>) {
  const Z = 52;
  s.shape({ x: 0.3, y: -0.03, w: 0.4, d: 0.06, z: Z - 9, h: 18 }, (d) => {
    d.poly("s", fe("s", 0.03, 0.5, Z, 0.19, 8.2, 28), K.walnutDark, { stroke: INK, sw: 0.9 });
    d.poly("s", fe("s", 0.031, 0.5, Z, 0.16, 6.9, 28), K.cream);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const k = i % 3 ? 0.86 : 0.74;
      const p0: V3 = [0.5 + Math.sin(a) * 0.15, 0.032, Z + Math.cos(a) * 6.5];
      const p1: V3 = [0.5 + Math.sin(a) * 0.15 * k, 0.032, Z + Math.cos(a) * 6.5 * k];
      d.line("s", p0, p1, INK, i % 3 ? 0.5 : 0.9);
    }
    if (props._thumb) {
      const hand = (a: number, l: number, w: number) =>
        d.line("s", [0.5, 0.033, Z], [0.5 + Math.sin(a) * 0.15 * l, 0.033, Z + Math.cos(a) * 6.5 * l], INK, w);
      hand((10 / 12) * Math.PI * 2 + (10 / 60) * (Math.PI / 6), 0.55, 1.2);
      hand((10 / 60) * Math.PI * 2, 0.8, 0.8);
    }
    d.poly("s", fe("s", 0.034, 0.5, Z, 0.012, 0.5, 8), K.rust);
  });
}

// A neon sign on the wall: a coffee cup (amber), a heart (pink) or a bolt
// (cyan), glowing tubes on a smoked backing.
const NEON = [K.vfd, "#ff5fa8", "#5ff0ff"];
export function neon(s: Sketch) {
  const v = Math.floor(s.seed * 3);
  const c = NEON[v];
  s.box(
    { x: 0.2, y: -0.025, w: 1.6, d: 0.05, z: 36, h: 28, mat: { c: "#1c1a24", top: "#2a2832" }, line: 0.8, op: 0.85 },
    (d) => {
      // a tube along points on the wall face (u along the wall, z up)
      const tube = (pts: [number, number][], close = false) => {
        const xy = pts.map(([u, z]) => d.m(u, 0.03, z));
        const path = `M${xy.map((p) => p.join(" ")).join(" L")}${close ? "Z" : ""}`;
        d.raw(
          `<path d="${path}" stroke="${c}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/><path d="${path}" stroke="${sh(c, 1.5)}" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
          true,
        );
      };
      if (v === 0) {
        // a cup with a handle and steam
        tube([
          [0.72, 56],
          [0.78, 42],
          [1.12, 42],
          [1.18, 56],
        ]);
        tube(
          Array.from({ length: 9 }, (_, i) => {
            const a = -Math.PI / 2 + (i / 8) * Math.PI;
            return [1.17 + Math.cos(a) * 0.07, 50 + Math.sin(a) * -4] as [number, number];
          }),
        );
        for (const u of [0.86, 1.02])
          tube([
            [u, 58],
            [u + 0.04, 60.5],
            [u - 0.02, 62],
          ]);
      } else if (v === 1) {
        const heart: [number, number][] = [];
        for (let i = 0; i <= 24; i++) {
          const t = (i / 24) * Math.PI * 2;
          const x = 16 * Math.sin(t) ** 3;
          const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          heart.push([1 + x * 0.019, 50 + y * 0.55]);
        }
        tube(heart, true);
      } else {
        tube(
          [
            [1.06, 61],
            [0.86, 49],
            [1.0, 49],
            [0.92, 39],
            [1.16, 52],
            [1.02, 52],
            [1.12, 61],
          ],
          true,
        );
      }
    },
  );
}
