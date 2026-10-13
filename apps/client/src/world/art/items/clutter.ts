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

// ── on desks: the workstation, one piece at a time ──────────────────────────
// A beige CRT facing −y (the sitter), green phosphor text; sometimes a sticky
// note on the bezel.
function monitor(s: Sketch, z: number, seed: number) {
  const mx = 0.28;
  const F = 0.3; // the glass's plane
  s.box({ x: mx + 0.1, y: 0.4, w: 0.24, d: 0.22, z, h: 2, mat: M.puttyDark, line: 0.8 });
  // tube housing behind the bezel
  s.box({ x: mx + 0.06, y: 0.48, w: 0.32, d: 0.22, z: z + 4, h: 14, mat: M.puttyDark, puff: 1 }, (d) => {
    for (let i = 0; i < 4; i++)
      d.line("t", [mx + 0.1 + i * 0.06, 0.53, z + 18], [mx + 0.1 + i * 0.06, 0.66, z + 18], "#8e8263", 0.7);
  });
  const R = mx + 0.44; // left edge as seen from the front
  s.box({ x: mx, y: F, w: 0.44, d: 0.18, z: z + 2, h: 19, mat: M.putty }, (d) => {
    d.poly("n", fr("n", F, mx + 0.04, mx + 0.4, z + 5.5, z + 19.5), "#a89a76");
    d.poly("n", fr("n", F, mx + 0.06, mx + 0.38, z + 6.5, z + 18.5), K.screen, { stroke: "#3a3428", sw: 0.6 });
    for (let r = 0; r < 4; r++) {
      const len = 0.08 + ((r * 7 + Math.floor(seed * 10)) % 5) * 0.04;
      const zz = z + 16.5 - r * 2.5;
      d.poly("n", fr("n", F, R - 0.09 - len, R - 0.09, zz - 0.9, zz), K.phosphor, { glow: true });
    }
    d.poly("n", fr("n", F, R - 0.13, R - 0.09, z + 7.2, z + 8.3), K.phosphorHi, { glow: true }); // cursor
    d.poly("n", fr("n", F, mx + 0.03, mx + 0.06, z + 3.4, z + 4.6), K.amber, { glow: true }); // power LED
    d.poly("n", fr("n", F, R - 0.16, R - 0.05, z + 3.5, z + 4.5), "#8e8263");
    if (seed > 0.5)
      d.poly(
        "n",
        [
          [mx + 0.14, F, z + 20.5],
          [mx - 0.01, F, z + 19.6],
          [mx - 0.01, F, z + 14],
          [mx + 0.13, F, z + 14.8],
        ],
        K.amberSoft,
        { stroke: "#b07a22", sw: 0.4 },
      );
    for (let i = 0; i < 3; i++)
      d.line("s", [mx + 0.1, 0.48, z + 8 + i * 3.5], [mx + 0.34, 0.48, z + 8 + i * 3.5], "#a49470", 0.8);
  });
}

// A putty keyboard, three rows of keys (the long one's the space bar).
function keyboard(s: Sketch, z: number) {
  const kx = 0.28;
  const ky = 0.415;
  s.box({ x: kx, y: ky, w: 0.44, d: 0.17, z, h: 1.8, mat: M.putty, line: 0.8 }, (d) => {
    for (let r = 0; r < 3; r++) {
      const y = ky + 0.03 + r * 0.045;
      for (let k = 0; k < 9; k++) {
        const x = kx + 0.03 + k * 0.045;
        d.poly("t", tr(z + 1.8, x, y, x + 0.034, y + 0.032), r === 2 && k > 2 && k < 7 ? "#c8bb98" : "#e9dfc4", {
          stroke: "#a69772",
          sw: 0.25,
        });
      }
    }
  });
}

// A little desk lamp: a round base, a bent arm, an amber shade with a glow
// (switched off: the bulb's dark).
function desklamp(s: Sketch, z: number, seed: number, off = false) {
  const c = pick([K.rust, K.olive, K.graphite, K.cream], seed);
  s.cyl({ x: CX, y: CY, z, r: 0.07, h: 1.6, mat: { c } });
  s.shape({ x: CX - 0.1, y: CY - 0.1, w: 0.2, d: 0.2, z: z + 1.6, h: 16 }, (d) => {
    const [x0, y0] = d.m(CX, CY, z + 1.6);
    const [x1, y1] = d.m(CX - 0.04, CY + 0.02, z + 11);
    const [x2, y2] = d.m(CX + 0.05, CY + 0.06, z + 15);
    const arm = `M${x0} ${y0}L${x1} ${y1}L${x2} ${y2}`;
    d.raw(
      `<path d="${arm}" stroke="${INK}" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="${arm}" stroke="${K.aluminium}" stroke-width=".9" fill="none" stroke-linejoin="round"/>`,
    );
  });
  s.cyl({ x: CX + 0.06, y: CY + 0.07, z: z + 10, r: 0.03, r2: 0.075, h: 5, mat: { c } }, (d) =>
    d.poly("t", te(z + 10, CX + 0.06, CY + 0.07, 0.06), off ? sh(K.cream, 0.55) : K.vfd, { glow: !off }),
  );
}

// The War Room's conference phone: a graphite starfish with a keypad.
function phone(s: Sketch, z: number) {
  s.box({ x: 0.29, y: 0.32, w: 0.42, d: 0.36, z, h: 3, mat: M.graphite, puff: 0.6, line: 0.9 }, (d) => {
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) d.poly("t", te(z + 3, 0.39 + c * 0.1, 0.42 + r * 0.08, 0.025, 8), K.cream);
    d.poly("t", tr(z + 3, 0.61, 0.4, 0.67, 0.6), K.red, { glow: true });
  });
}

// A deck of planning-poker cards.
function cards(s: Sketch, z: number) {
  s.box({ x: 0.42, y: 0.4, w: 0.16, d: 0.2, z, h: 2.4, mat: { c: K.cream, top: K.paper }, line: 0.7 }, (d) => {
    d.poly("t", tr(z + 2.4, 0.45, 0.44, 0.55, 0.56), "none", { stroke: K.rust, sw: 0.6 });
  });
}

// A brass desk bell on a walnut foot.
function bell(s: Sketch, z: number) {
  s.cyl({ x: CX, y: CY, z, r: 0.07, h: 1, mat: M.walnutDark, line: 0.6 });
  s.cyl({ x: CX, y: CY, z: z + 1, r: 0.06, r2: 0.025, h: 4, mat: M.brass, line: 0.6 });
}

// An open guest book with a ribbon.
function book(s: Sketch, z: number, seed: number) {
  const cover = pick([K.rust, K.olive, K.slate], seed);
  s.box({ x: 0.27, y: 0.37, w: 0.46, d: 0.26, z, h: 0.6, mat: { c: cover }, line: 0.6, bevel: false });
  s.box(
    { x: 0.28, y: 0.38, w: 0.44, d: 0.24, z: z + 0.6, h: 0.8, mat: { c: K.paper, top: K.paper }, line: 0.6 },
    (d) => {
      d.line("t", [0.5, 0.38, z + 1.4], [0.5, 0.62, z + 1.4], sh(cover, 0.8), 0.6);
      for (let i = 0; i < 3; i++)
        d.line("t", [0.32, 0.44 + i * 0.06, z + 1.4], [0.46, 0.44 + i * 0.06, z + 1.4], "#8a7a5a", 0.4);
    },
  );
}

// A framed photo standing up, facing the room (+y).
function photo(s: Sketch, z: number, seed: number) {
  const pic = pick([K.sage, "#9fc2d8", "#e4b48e"], seed);
  s.box({ x: 0.39, y: 0.47, w: 0.22, d: 0.05, z, h: 10, mat: M.walnutDark, line: 0.8 }, (d) => {
    d.poly("s", fr("s", 0.52, 0.42, 0.58, z + 1.5, z + 8.5), pic);
    d.poly("s", fr("s", 0.52, 0.46, 0.54, z + 1.5, z + 5), K.amberSoft);
  });
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

export function dressing(s: Sketch, kind: DressKind, z: number, seed: number, off = false) {
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
    case "monitor":
      return monitor(s, z, seed);
    case "keyboard":
      return keyboard(s, z);
    case "desklamp":
      return desklamp(s, z, seed, off);
    case "phone":
      return phone(s, z);
    case "cards":
      return cards(s, z);
    case "bell":
      return bell(s, z);
    case "book":
      return book(s, z, seed);
    case "photo":
      return photo(s, z, seed);
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
