import type { DressKind } from "@yutopia/shared";
import { fe, fr, INK, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";
import { plant } from "./plant";

// Dressing (the rooms' clutter), drawn like the furniture. Each piece is drawn
// in a 1×1 sketch centred on (0.5, 0.5), standing on height `z` (a desk top, a
// table, the floor). Frames hang on the wall face at y = 0.1.
const CX = 0.5;
const CY = 0.5;

const pick = <T>(list: readonly T[], seed: number) => list[Math.floor(seed * list.length) % list.length];

function papers(s: Sketch, z: number, seed: number) {
  // a few sheets, a little skewed, one with writing; sometimes a manila folder
  const folder = seed > 0.6;
  for (let i = 0; i < 3; i++) {
    const o = (i - 1) * 0.015;
    s.box(
      {
        x: CX - 0.13 + o,
        y: CY - 0.1 - o,
        w: 0.26,
        d: 0.2,
        z: z + i * 0.8,
        h: 0.8,
        mat: i === 2 && folder ? { c: "#d9b878", top: "#e6c88a" } : { c: K.paper, top: K.paper },
        line: 0.6,
        bevel: false,
      },
      i === 2 && !folder
        ? (d) => {
            for (let k = 0; k < 4; k++)
              d.line(
                "t",
                [CX - 0.09, CY - 0.06 + k * 0.035, z + 2.4],
                [CX + 0.06, CY - 0.06 + k * 0.035, z + 2.4],
                "#8a7a5a",
                0.4,
              );
          }
        : undefined,
    );
  }
}

function mug(s: Sketch, z: number, seed: number) {
  const c = pick([K.rust, K.olive, K.cream, K.slate, K.amberSoft], seed);
  s.cyl({ x: CX, y: CY, z, r: 0.05, h: 6, mat: { c } }, (d) => {
    d.poly("t", te(z + 6, CX, CY, 0.037), "#3b2416");
    const [x, y] = d.m(CX + 0.05, CY + 0.02, z + 3);
    d.raw(
      `<path d="M${x} ${y - 2}q4 0 4 2.4t-4 2.4" stroke="${INK}" stroke-width="1.6" fill="none"/><path d="M${x} ${y - 2}q4 0 4 2.4t-4 2.4" stroke="${c}" stroke-width=".8" fill="none"/>`,
    );
  });
}

function tapes(s: Sketch, z: number, seed: number) {
  const n = 2 + Math.floor(seed * 3);
  for (let i = 0; i < n; i++) {
    const c = pick(["#c4402b", "#2b2a26", "#e8a33d", "#3d4a5c", "#efe4cc"], seed * 7 + i * 0.37);
    const o = ((i * 37) % 5) * 0.008;
    s.box(
      {
        x: CX - 0.11 + o,
        y: CY - 0.07 - o,
        w: 0.22,
        d: 0.14,
        z: z + i * 1.6,
        h: 1.6,
        mat: { c, flat: true },
        line: 0.5,
        bevel: false,
      },
      (d) =>
        d.poly(
          "s",
          fr("s", CY + 0.07 - o, CX - 0.08 + o, CX + 0.08 + o, z + i * 1.6 + 0.4, z + i * 1.6 + 1.2),
          K.cream,
        ),
    );
  }
}

function binder(s: Sketch, z: number, seed: number) {
  const c = pick([K.rust, K.slate, K.olive, "#2b2a26"], seed);
  s.box({ x: CX - 0.1, y: CY - 0.04, w: 0.2, d: 0.07, z, h: 15, mat: { c }, line: 0.8 }, (d) => {
    d.poly("s", fr("s", CY + 0.03, CX - 0.06, CX + 0.06, z + 8, z + 12), K.paper);
    d.poly("s", fe("s", CY + 0.03, CX, z + 4, 0.025, 1.4, 10), sh(c, 0.6));
  });
}

function succulent(s: Sketch, z: number, seed: number) {
  s.cyl({ x: CX, y: CY, z, r: 0.055, r2: 0.065, h: 4, mat: { c: pick([K.terracotta, K.cream, K.olive], seed) } });
  s.shape({ x: CX - 0.1, y: CY - 0.1, w: 0.2, d: 0.2, z: z + 4, h: 6 }, (d) => {
    const [x, y] = d.m(CX, CY, z + 4);
    let g = "";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + seed;
      const lx = x + Math.cos(a) * 3;
      const ly = y - 2 + Math.sin(a) * 1.4;
      g += `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="2.4" ry="1.4" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})" fill="${i % 2 ? "#7d9a6a" : "#9ab884"}" stroke="${INK}" stroke-width=".5"/>`;
    }
    g += `<circle cx="${x}" cy="${y - 3}" r="1.6" fill="#b8d49a" stroke="${INK}" stroke-width=".5"/>`;
    d.raw(g);
  });
}

function vinyl(s: Sketch, z: number, seed: number) {
  const c = pick([K.rust, K.amberSoft, K.slate, K.olive], seed);
  s.box({ x: CX - 0.2, y: CY - 0.18, w: 0.4, d: 0.36, z, h: 0.8, mat: { c }, line: 0.6, bevel: false }, (d) => {
    d.poly("t", te(z + 0.8, CX, CY, 0.12), sh(c, 0.75));
    d.poly("t", te(z + 0.8, CX, CY, 0.04), K.cream);
  });
  s.shape({ x: CX + 0.1, y: CY - 0.2, w: 0.2, d: 0.2, z: z + 0.8, h: 0.4 }, (d) =>
    d.poly("t", te(z + 0.9, CX + 0.2, CY + 0.02, 0.16, 24), K.graphite),
  );
}

// A framed picture on the wall face: a landscape, stripes or a photo.
function frame(s: Sketch, seed: number) {
  const Y = 0.1;
  const art = Math.floor(seed * 3);
  const w = 0.22 + ((seed * 10) % 1) * 0.12;
  s.box({ x: CX - w, y: Y - 0.02, w: w * 2, d: 0.04, z: 40, h: 20, mat: M.walnutDark, line: 0.8 }, (d) => {
    const F = Y + 0.02;
    d.poly("s", fr("s", F, CX - w + 0.04, CX + w - 0.04, 42, 58), K.paper);
    if (art === 0) {
      // a landscape: sky, hills, a sun
      d.poly("s", fr("s", F, CX - w + 0.05, CX + w - 0.05, 49, 57), "#9fc2d8");
      d.poly(
        "s",
        [
          [CX - w + 0.05, F, 49],
          [CX - 0.05, F, 54],
          [CX + 0.08, F, 51],
          [CX + w - 0.05, F, 53],
          [CX + w - 0.05, F, 43],
          [CX - w + 0.05, F, 43],
        ],
        K.olive,
      );
      d.poly("s", fe("s", F, CX + w * 0.4, 55, 0.025, 1.4, 10), K.amber);
    } else if (art === 1) {
      for (const [k, c] of [K.rust, K.amberSoft, K.olive, K.slate].entries())
        d.poly("s", fr("s", F, CX - w + 0.05, CX + w - 0.05, 43 + k * 3.5, 46 + k * 3.5), c);
    } else {
      d.poly("s", fr("s", F, CX - w + 0.05, CX + w - 0.05, 43, 57), "#6b5a4a");
      d.poly("s", fe("s", F, CX, 48, 0.05, 3.2, 14), "#e4b48e");
      d.poly("s", fr("s", F, CX - 0.06, CX + 0.06, 43, 46), K.rust);
    }
  });
}

function boxes(s: Sketch, seed: number) {
  const card = { c: "#b8935e", top: "#c9a46e" };
  s.box({ x: 0.18, y: 0.2, w: 0.6, d: 0.55, z: 0, h: 14, mat: card }, (d) => {
    d.poly("t", tr(14, 0.18, 0.44, 0.78, 0.5), "#d9c9a6");
    d.poly("s", fr("s", 0.75, 0.3, 0.6, 5, 10), K.paper, { stroke: "#8a7a5a", sw: 0.4 });
  });
  if (seed > 0.35)
    s.box({ x: 0.26, y: 0.26, w: 0.44, d: 0.4, z: 14, h: 10, mat: card }, (d) => {
      d.poly("t", tr(24, 0.26, 0.43, 0.7, 0.48), "#d9c9a6");
      d.line("s", [0.3, 0.66, 20], [0.62, 0.66, 20], "#3b2a1c", 0.7);
    });
  s.shadow(0.18, 0.2, 0.6, 0.55, 0.4);
}

function cable(s: Sketch) {
  s.shape({ x: 0.2, y: 0.2, w: 0.6, d: 0.6, z: 0, h: 1 }, (d) => {
    const [x, y] = d.m(0.5, 0.5, 0.4);
    let g = "";
    for (let i = 0; i < 3; i++)
      g += `<ellipse cx="${x + i}" cy="${y}" rx="${9 - i * 1.4}" ry="${4.4 - i * 0.7}" fill="none" stroke="${INK}" stroke-width="2.4"/><ellipse cx="${x + i}" cy="${y}" rx="${9 - i * 1.4}" ry="${4.4 - i * 0.7}" fill="none" stroke="${K.amberSoft}" stroke-width="1.2"/>`;
    const [px, py] = d.m(0.82, 0.3, 0.4);
    g += `<path d="M${x + 8} ${y}Q${px} ${y - 2} ${px} ${py}" stroke="${INK}" stroke-width="2.4" fill="none"/><path d="M${x + 8} ${y}Q${px} ${y - 2} ${px} ${py}" stroke="${K.amberSoft}" stroke-width="1.2" fill="none"/><rect x="${px - 2.5}" y="${py - 2}" width="5" height="4" rx="1" fill="${K.graphite}" stroke="${INK}" stroke-width=".6"/>`;
    d.raw(g);
  });
}

function bin(s: Sketch) {
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.15, r2: 0.19, h: 15, mat: { c: K.graphite, top: "#45423b" } }, (d) => {
    d.poly("t", te(15, 0.5, 0.5, 0.16), "#1c1a17");
    for (let i = 0; i < 6; i++) {
      const [x, y] = d.m(0.5 + Math.cos(i) * 0.11, 0.5 + Math.sin(i) * 0.11, 2);
      const [, y2] = d.m(0.5 + Math.cos(i) * 0.15, 0.5 + Math.sin(i) * 0.15, 14);
      d.raw(`<path d="M${x} ${y}L${x} ${y2}" stroke="#6f6a5e" stroke-width=".5" opacity=".7"/>`);
    }
  });
  s.shape({ x: 0.4, y: 0.4, w: 0.2, d: 0.2, z: 14, h: 4 }, (d) => {
    const [x, y] = d.m(0.5, 0.5, 16);
    d.raw(
      `<path d="M${x - 4} ${y}q1 -4 4 -3q3 -2 4 1q2 3 -2 4q-3 2 -6 -2z" fill="${K.paper}" stroke="${INK}" stroke-width=".6"/>`,
    );
  });
  s.shadowDot(0.5, 0.5, 0.18, 0.4);
}

export function dressing(s: Sketch, kind: DressKind, z: number, seed: number) {
  switch (kind) {
    case "papers":
      return papers(s, z, seed);
    case "mug":
      return mug(s, z, seed);
    case "tapes":
      return tapes(s, z, seed);
    case "binder":
      return binder(s, z, seed);
    case "succulent":
      return succulent(s, z, seed);
    case "vinyl":
      return vinyl(s, z, seed);
    case "frame":
      return frame(s, seed);
    case "plant":
      return plant(s, { variant: Math.floor(seed * 5) });
    case "boxes":
      return boxes(s, seed);
    case "cable":
      return cable(s);
    case "bin":
      return bin(s);
  }
}
