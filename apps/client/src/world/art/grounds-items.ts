import type { CatalogEntry, LotLayout, WorldObjectDef } from "@yutopia/shared";
import type * as GroundsModule from "@yutopia/shared/grounds";
import { type HouseLook, houseLook, type ShopLook, shopLook } from "../grounds-look";
import type { ItemGen } from "./items";
import type { Draw, Face, Mat, Sketch, V3 } from "./items/kit";

// The Grounds' things in the iso view (docs/plan/27-the-grounds.md, phase 2):
// the other buildings, the lamps, the fence, the gate's barrier, the tower,
// the statue, the bench, the signs — drawn as items (the iso kit's inked
// boxes and cones), registered at run time as kinds nobody builds or stores
// (`gr_…`), and set round the camera by art/grounds-iso.ts. The 3D view draws
// the same things from the same data (tp/grounds3d.ts).

type G = typeof GroundsModule;
type Props = Record<string, unknown>;
const P = 39.19; // px a tile up

/** A thing on the Grounds, in the building's coords (x, y: its footprint's corner). */
export interface Thing extends WorldObjectDef {
  /** where its middle is, for the ground's height */
  cx: number;
  cz: number;
}

// ── materials ───────────────────────────────────────────────────────────────
const mat = (c: string, top?: string, left?: string, right?: string): Mat => ({ c, top, left, right });
const SNOW = mat("#e9eef2", "#f7fafc", "#e3e9ee", "#d2dae1");
const CONCRETE = mat("#c9c5bc", "#d8d4cb", "#c2beb5", "#aeaaa2");
const STEEL = mat("#5d6268", "#7a7f85", "#6a6f75", "#52575c");
const DARK = mat("#2a2e33", "#3a3f45", "#33383d", "#24282c");
const ROOF = mat("#3a3f45", "#4a5058");
const WOOD = mat("#6b5442", "#7d6450", "#6f5845", "#5a4636");
const RED_BOARD = mat("#6e2a22", "#7d342a", "#73302a", "#5a2119");
const BRONZE = mat("#4a4338", "#5d554a", "#514a3e", "#3b352c");
const GLASS = "#2c3a44";
const LIT = "#ffcf8a";
const shade = (hex: string, k: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * k)))
      .toString(16)
      .padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};
const wallMat = (c: string): Mat => mat(c, shade(c, 1.12), shade(c, 1.0), shade(c, 0.82));
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fr(f: Face, plane: number, u0: number, u1: number, z0: number, z1: number): V3[] {
  return f === "s" || f === "n"
    ? [
        [u0, plane, z1],
        [u1, plane, z1],
        [u1, plane, z0],
        [u0, plane, z0],
      ]
    : [
        [plane, u0, z1],
        [plane, u1, z1],
        [plane, u1, z0],
        [plane, u0, z0],
      ];
}

// ── buildings ───────────────────────────────────────────────────────────────
interface Bld {
  kind: string;
  w: number;
  h: number;
  floors: number;
  face: "n" | "s" | "e" | "w";
  sign?: string;
  vacant?: boolean;
  seed: number;
  look?: ShopLook | HouseLook;
}
// a pitched roof over the footprint (ridge along x or y), snow on it
function pitched(s: Sketch, b: Bld, z: number, rise: number, alongX: boolean, over = 0.4, gable = "#b8b0a2") {
  const x0 = -over;
  const y0 = -over;
  const x1 = b.w + over;
  const y1 = b.h + over;
  s.shape({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, z, h: rise }, (d) => {
    const xm = b.w / 2;
    const ym = b.h / 2;
    const poly = (pts: V3[], fill: string) => {
      const p = pts.map(([x, y, zz]) => d.m(x, y, zz));
      d.raw(
        `<path d="M${p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L")}Z" fill="${fill}" stroke="#151819" stroke-width="1" stroke-linejoin="round"/>`,
      );
    };
    if (alongX) {
      // the far slope first, then the gable end, then the near slope (snow on both)
      poly(
        [
          [x0, y0, z],
          [x1, y0, z],
          [x1, ym, z + rise],
          [x0, ym, z + rise],
        ],
        "#e3e9ee",
      );
      poly(
        [
          [b.w, 0, z],
          [b.w, b.h, z],
          [b.w, ym, z + rise],
        ],
        gable,
      );
      poly(
        [
          [x0, y1, z],
          [x1, y1, z],
          [x1, ym, z + rise],
          [x0, ym, z + rise],
        ],
        "#f4f7fa",
      );
    } else {
      poly(
        [
          [x0, y0, z],
          [x0, y1, z],
          [xm, y1, z + rise],
          [xm, y0, z + rise],
        ],
        "#e3e9ee",
      );
      poly(
        [
          [0, b.h, z],
          [b.w, b.h, z],
          [xm, b.h, z + rise],
        ],
        gable,
      );
      poly(
        [
          [x1, y0, z],
          [x1, y1, z],
          [xm, y1, z + rise],
          [xm, y0, z + rise],
        ],
        "#f4f7fa",
      );
    }
  });
}
/** Text painted on a face (s: along x at y = plane; e: along y at x = plane), centred at u, its
 *  middle z px up, `size` tiles tall — in the face's own slant. */
function faceText(
  d: Draw,
  f: "s" | "e",
  plane: number,
  u: number,
  z: number,
  text: string,
  size: number,
  fill: string,
) {
  const at = (uu: number, zz: number) => (f === "s" ? d.m(uu, plane, zz) : d.m(plane, uu, zz));
  const o = at(u, z);
  const ex = at(u + 1, z);
  const ey = at(u, z + P);
  const m = [ex[0] - o[0], ex[1] - o[1], o[0] - ey[0], o[1] - ey[1], o[0], o[1]].map((v) => v.toFixed(2)).join(" ");
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  d.raw(
    `<text transform="matrix(${m})" x="0" y="0" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${size}" text-anchor="middle" dominant-baseline="central" fill="${fill}">${esc}</text>`,
  );
}
/** A window with its frame and a cross (the look's trim), lit or not. */
function framed(
  d: Draw,
  f: "s" | "e",
  plane: number,
  u: number,
  z0: number,
  w: number,
  h: number,
  on: boolean,
  trim: string,
) {
  d.poly(f, fr(f, plane, u - w / 2 - 0.12, u + w / 2 + 0.12, z0 - 0.1 * P, z0 + h + 0.12 * P), trim);
  d.poly(f, fr(f, plane, u - w / 2, u + w / 2, z0, z0 + h), on ? LIT : GLASS, { glow: on });
  d.poly(f, fr(f, plane, u - 0.03, u + 0.03, z0, z0 + h), trim);
  d.poly(f, fr(f, plane, u - w / 2, u + w / 2, z0 + h / 2 - 1.2, z0 + h / 2 + 1.2), trim);
}
function shop(s: Sketch, b: Bld) {
  const L = b.look as ShopLook;
  const fh = 3.8 * P;
  const H = b.floors * fh + 0.8 * P;
  const Hf = L.falseFront ? H + 1.4 * P : H;
  const trim = L.trim;
  // (everything on its walls drawn by the walls' own box, slice by slice: a big shape is drawn
  // only in the slice its middle is in)
  const art: ((d: Draw) => void)[] = [];
  const onWalls = (f: (d: Draw) => void) => art.push(f);
  // the top: a cornice (brick), a plain coping (the rest); the snow on the roof
  s.box({
    x: -0.25,
    y: -0.25,
    w: b.w + 0.5,
    d: b.h + 0.5,
    z: H - 0.45 * P,
    h: 0.45 * P,
    mat: mat(L.brick ? "#8c857a" : shade(L.wall, 0.85), L.brick ? "#9d968b" : shade(L.wall, 0.95)),
  });
  s.box({ x: -0.2, y: -0.2, w: b.w + 0.4, d: b.h + 0.4, z: H, h: 0.3 * P, mat: SNOW });
  // the false front over its street side, its raised middle
  if (L.falseFront) {
    const along = b.face === "n" || b.face === "s";
    const ff =
      b.face === "n"
        ? { x: 0, y: 0, w: b.w, d: 0.3 }
        : b.face === "s"
          ? { x: 0, y: b.h - 0.3, w: b.w, d: 0.3 }
          : b.face === "w"
            ? { x: 0, y: 0, w: 0.3, d: b.h }
            : { x: b.w - 0.3, y: 0, w: 0.3, d: b.h };
    s.box({ ...ff, z: H, h: Hf - H, mat: wallMat(L.wall) });
    const mid = along ? { x: b.w / 2 - 1.6, y: ff.y, w: 3.2, d: 0.3 } : { x: ff.x, y: b.h / 2 - 1.6, w: 0.3, d: 3.2 };
    s.box({ ...mid, z: Hf, h: 0.7 * P, mat: mat(trim) });
    s.box({ ...mid, z: Hf + 0.7 * P, h: 0.15 * P, mat: SNOW, line: 0.4 });
  }
  const lit = L.lit(64);
  let li = 0;
  for (const f of ["s", "e"] as const) {
    const front = b.face === f;
    const len = f === "s" ? b.w : b.h;
    const plane = f === "s" ? b.h : b.w;
    if (front && b.vacant) {
      onWalls((d) => {
        for (let z = 0.7 * P; z < 3 * P; z += 0.32 * P)
          d.poly(f, fr(f, plane, 0.9, len - 0.9, z, z + 0.26 * P), "#a48a6a", { stroke: "#5a4636", sw: 0.5 });
      });
    } else if (front && L.civic) {
      // a double door between framed windows (its columns, pediment and name: civicFront)
      onWalls((d) => {
        d.poly(f, fr(f, plane, 0, len, 0, 0.7 * P), "#b7b0a2");
        d.poly(f, fr(f, plane, len / 2 - 1.2, len / 2 + 1.2, 0.6 * P, 3.6 * P), L.trim);
        d.poly(f, fr(f, plane, len / 2 - 0.95, len / 2 + 0.95, 0.6 * P, 3.0 * P), "#3b2f27");
        for (const k of b.sign === "TOWN HALL" ? [4.2, 8.4] : [3.6])
          for (const sd of [-1, 1]) {
            const u = len / 2 + sd * k;
            if (u < 1 || u > len - 1) continue;
            framed(d, f, plane, u, 1.2 * P, 1.3, 1.9 * P, lit[li++ % 64], L.trim);
          }
      });
      if (b.sign === "POST OFFICE")
        onWalls((d) => {
          d.poly(f, fr(f, plane + 0.1, len / 2 - 1.8, len / 2 + 1.8, 4.05 * P, 4.6 * P), "#e8e2d2", {
            stroke: "#151819",
            sw: 1,
          });
          faceText(d, f, plane + 0.1, len / 2, 4.32 * P, "POST OFFICE", 0.34, "#2a2e33");
        });
    } else if (front) {
      onWalls((d) => {
        if (L.diner) {
          d.poly(f, fr(f, plane, 0, len, 0, 1.0 * P), "#b8bec4");
          d.poly(f, fr(f, plane, 0, len, 1.0 * P, 1.25 * P), "#a8322a");
          d.poly(f, fr(f, plane, 0.3, len - 0.3, 1.25 * P, 2.7 * P), "#f0d9a0", {
            stroke: "#d8dde2",
            sw: 1,
            glow: true,
          });
          for (let u = 1; u < len - 0.5; u += 1.6)
            d.poly(f, fr(f, plane, u - 0.04, u + 0.04, 1.25 * P, 2.7 * P), "#d8dde2");
          d.poly(f, fr(f, plane, 0, len, 2.7 * P, 2.88 * P), "#a8322a");
        } else {
          // pilasters, a panelled base, the panes, the door
          d.poly(f, fr(f, plane, 0.4, len - 0.4, 0, 3.4 * P), "#23292e");
          d.poly(f, fr(f, plane, 1, len - 1, 0.7 * P, 2.55 * P), b.sign === "BAR" ? "#e08a50" : "#f0c886", {
            glow: true,
          });
          d.poly(f, fr(f, plane, 1, len - 1, 2.62 * P, 3.0 * P), b.sign === "BAR" ? "#e08a50" : "#f0c886", {
            glow: true,
          });
          for (let u = 2.7; u < len - 1.4; u += 1.7)
            if (Math.abs(u - len / 2) > 1.1) d.poly(f, fr(f, plane, u - 0.05, u + 0.05, 0.7 * P, 3.0 * P), "#23292e");
          d.poly(f, fr(f, plane, len / 2 - 0.8, len / 2 + 0.8, 0, 2.6 * P), "#23292e");
          d.poly(f, fr(f, plane, len / 2 - 0.6, len / 2 + 0.6, 1.0 * P, 2.4 * P), "#46525c");
        }
      });
      // the awning in strips (not the diner's), snow on it
      if (!L.diner && b.kind !== "hotel") {
        const n = Math.max(2, Math.round((len - 1.2) / 0.6));
        for (let i = 0; i < n; i++) {
          const u0 = 0.6 + ((len - 1.2) * i) / n;
          const w = (len - 1.2) / n;
          const c = L.striped && i % 2 ? "#e9e2d0" : L.awning;
          if (f === "s")
            s.box({
              x: u0,
              y: b.h,
              w,
              d: 1.5,
              z: 2.9 * P,
              h: 0.5 * P,
              mat: mat(c, "#f4f7fa"),
              line: i === 0 || i === n - 1 ? 1.2 : 0.4,
            });
          else
            s.box({
              x: b.w,
              y: u0,
              w: 1.5,
              d: w,
              z: 2.9 * P,
              h: 0.5 * P,
              mat: mat(c, "#f4f7fa"),
              line: i === 0 || i === n - 1 ? 1.2 : 0.4,
            });
        }
      }
      if (b.kind === "hotel") {
        if (f === "s")
          s.box({ x: b.w / 2 - 2.4, y: b.h, w: 4.8, d: 3, z: 3.1 * P, h: 0.35 * P, mat: mat("#23292e", "#f4f7fa") });
        else s.box({ x: b.w, y: b.h / 2 - 2.4, w: 3, d: 4.8, z: 3.1 * P, h: 0.35 * P, mat: mat("#23292e", "#f4f7fa") });
      }
      // the sign over the awning (the diner's on its roof), its name in it
      if (b.sign) {
        const sw = L.diner ? Math.min(len - 2, 9) : Math.min(len - 1.5, 6.2);
        const sh = sw * 0.1875;
        const zc = L.diner ? H + 1.2 * P + (sh * P) / 2 : 3.72 * P + (sh * P) / 2;
        const bg = b.sign === "BAR" ? "#2a0e0c" : L.diner ? "#a8322a" : "#1d2226";
        const fg = b.sign === "BAR" ? "#ffb48a" : L.diner ? "#fff1d8" : "#efe3c4";
        onWalls((d) => {
          d.poly(f, fr(f, plane + 0.1, len / 2 - sw / 2, len / 2 + sw / 2, zc - (sh * P) / 2, zc + (sh * P) / 2), bg, {
            stroke: "#151819",
            sw: 1,
            glow: b.sign === "BAR" || L.diner,
          });
          faceText(d, f, plane + 0.1, len / 2, zc, b.sign ?? "", sh * 0.62, fg);
        });
      }
    } else if (b.floors === 1 || !front)
      onWalls((d) => {
        const n = Math.max(1, Math.floor(len / 3.4));
        for (let i = 0; i < n; i++)
          framed(d, f, plane, ((i + 0.5) * len) / n, 0.9 * P, 1.2, 1.7 * P, lit[li++ % 64], trim);
      });
    // upstairs: framed windows with stone heads
    onWalls((d) => {
      for (let k = 1; k < b.floors; k++) {
        const n = Math.max(2, Math.floor(len / 4));
        for (let i = 0; i < n; i++) {
          const u = ((i + 0.5) * len) / n;
          if (b.vacant && front) {
            d.poly(f, fr(f, plane, u - 0.8, u + 0.8, k * fh + 1.3 * P, k * fh + 3 * P), "#9a8264", {
              stroke: "#5a4636",
              sw: 0.6,
            });
            continue;
          }
          framed(d, f, plane, u, k * fh + 1.3 * P, 1.3, 1.7 * P, lit[li++ % 64], trim);
          d.poly(f, fr(f, plane, u - 0.87, u + 0.87, k * fh + 3.12 * P, k * fh + 3.38 * P), L.brick ? "#cfc6b4" : trim);
        }
      }
    });
  }
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat(L.wall) }, (d) => {
    for (const f of art) f(d);
  });
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
  if (L.civic && b.face === "s") civicFront(s, b, L);
}
/** The town hall's columns under a pediment and its clock; the post office's canopy. */
function civicFront(s: Sketch, b: Bld, L: ShopLook) {
  const xm = b.w / 2;
  const hall = b.sign === "TOWN HALL";
  for (let k = 0; k < 3; k++)
    s.box({
      x: xm - 2.6 + k * 0.2,
      y: b.h,
      w: 5.2 - k * 0.4,
      d: 1.6 - k * 0.45,
      z: k * 0.2 * P,
      h: 0.2 * P,
      mat: CONCRETE,
      line: 0.6,
    });
  if (!hall) {
    s.box({ x: xm - 1.6, y: b.h, w: 3.2, d: 1.4, z: 3.75 * P, h: 0.2 * P, mat: mat(L.trim, "#f4f7fa") });
    return;
  }
  for (const dx of [-2.4, -0.8, 0.8, 2.4])
    s.cyl({ x: xm + dx, y: b.h + 2.2, z: 0.6 * P, r: 0.22, h: 3.6 * P, mat: mat("#ece6da", "#f6f2ea") });
  s.box({ x: xm - 3.2, y: b.h, w: 6.4, d: 2.6, z: 4.2 * P, h: 0.6 * P, mat: mat("#e6e1d6", "#f4f7fa") });
  s.shape({ x: xm - 3.3, y: b.h, w: 6.6, d: 2.7, z: 4.8 * P, h: 1.5 * P }, (d) => {
    const p = [d.m(xm - 3.3, b.h + 2.6, 4.8 * P), d.m(xm + 3.3, b.h + 2.6, 4.8 * P), d.m(xm, b.h + 2.6, 6.3 * P)];
    d.raw(
      `<path d="M${p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L")}Z" fill="#e6e1d6" stroke="#151819" stroke-width="1"/>`,
    );
    const r = [
      d.m(xm + 3.3, b.h, 4.8 * P),
      d.m(xm + 3.3, b.h + 2.6, 4.8 * P),
      d.m(xm, b.h + 2.6, 6.3 * P),
      d.m(xm, b.h, 6.3 * P),
    ];
    d.raw(
      `<path d="M${r.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L")}Z" fill="#f4f7fa" stroke="#151819" stroke-width="1"/>`,
    );
    const c = d.m(xm, b.h + 2.65, 5.35 * P);
    d.raw(
      `<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="9" ry="10" fill="#f2ead6" stroke="#1f2124" stroke-width="1"/>`,
    );
    faceText(d, "s", b.h + 2.65, xm, 4.5 * P, "TOWN HALL", 0.32, "#2a2e33");
  });
}
function house(s: Sketch, b: Bld) {
  const L = b.look as HouseLook;
  const H = L.H * P;
  const trim = "#ece6da";
  const lit = L.lit(32);
  let li = 0;
  const frontE = b.face === "e";
  // windows on the two faces we see: framed; shuttered where it's the street side
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat(L.wall) }, (d) => {
    for (const f of ["s", "e"] as const) {
      const len = f === "s" ? b.w : b.h;
      const plane = f === "s" ? b.h : b.w;
      const street = f === "e" && frontE;
      const us = street ? [len / 2 - 2.7, len / 2 + 2.7] : [len / 2];
      for (const zz of L.kind === 2 ? [0.9] : [0.9, 3.9])
        for (const u of street && zz > 1 ? [len / 2 - 2.7, len / 2, len / 2 + 2.7] : us) {
          framed(d, f, plane, u, zz * P, 1.05, 1.45 * P, lit[li++ % 32], trim);
          if (street)
            for (const sd of [-1, 1])
              d.poly(f, fr(f, plane, u + sd * 0.83 - 0.3, u + sd * 0.83 + 0.3, zz * P, zz * P + 1.45 * P), L.shutter);
        }
      if (street)
        d.poly(f, fr(f, plane, len / 2 - 0.5, len / 2 + 0.5, 0.5 * P, 2.6 * P), L.shutter, { stroke: trim, sw: 1.5 });
    }
  });
  pitchedG(s, b, H, L.rise * P, L.kind === 1, 0.45, shade(L.wall, 0.9));
  // the chimney
  const cy = L.chimneyEnd ? 1.6 : b.h - 1.6;
  const cx = L.kind === 1 ? 2 : b.w / 2;
  s.box({
    x: cx - 0.4,
    y: cy - 0.35,
    w: 0.8,
    d: 0.7,
    z: H + L.rise * 0.4 * P,
    h: (L.rise * 0.6 + 0.8) * P,
    mat: mat("#7b3b2c", "#8a4a3a"),
  });
  s.box({ x: cx - 0.48, y: cy - 0.43, w: 0.96, d: 0.86, z: H + (L.rise + 0.8) * P, h: 0.2 * P, mat: SNOW, line: 0.5 });
  // the porch on its street side (across the front for a front gable)
  const py0 = L.kind === 1 ? 0.4 : b.h / 2 - 1.6;
  const pd = L.kind === 1 ? b.h - 0.8 : 3.2;
  const px = frontE ? b.w : -1.8;
  s.box({ x: frontE ? b.w : -1.6, y: py0 + 0.2, w: 1.6, d: pd - 0.4, z: 0, h: 0.5 * P, mat: CONCRETE });
  s.box({ x: px, y: py0, w: 1.8, d: pd, z: 2.75 * P, h: 0.2 * P, mat: ROOF });
  s.box({ x: px, y: py0, w: 1.8, d: pd, z: 2.95 * P, h: 0.2 * P, mat: SNOW, line: 0.5 });
  for (const yy of [py0 + 0.2, py0 + pd - 0.2])
    s.box({
      x: (frontE ? b.w + 1.6 : -1.6) - 0.08,
      y: yy - 0.08,
      w: 0.16,
      d: 0.16,
      z: 0.5 * P,
      h: 2.25 * P,
      mat: mat(trim),
    });
  if (L.kind === 2) {
    // the dormer out of the roof to the street
    const dx = frontE ? b.w - 2.9 : -0.3;
    s.box({ x: dx, y: b.h / 2 - 1.1, w: 3.2, d: 2.2, z: H, h: 2.2 * P, mat: wallMat(L.wall) }, (d) => {
      if (frontE) framed(d, "e", dx + 3.2, b.h / 2, H + 0.75 * P, 1, 1.2 * P, lit[3], trim);
    });
    s.box({ x: dx - 0.2, y: b.h / 2 - 1.3, w: 3.6, d: 2.6, z: H + 2.2 * P, h: 0.3 * P, mat: SNOW });
  }
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
/** A pitched roof with its gables in the walls' colour. */
function pitchedG(s: Sketch, b: Bld, z: number, rise: number, alongX: boolean, over: number, gable: string) {
  pitched(s, b, z, rise, alongX, over, gable);
}
function church(s: Sketch, b: Bld) {
  const H = 6 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat("#ecebe5") }, (d) => {
    // the pointed windows along the east side
    for (const y of [4, 9, 14, 19]) {
      const z0 = 1.3 * P;
      const z1 = 3.9 * P;
      const pts: V3[] = [
        [b.w, y - 0.65, z0],
        [b.w, y + 0.65, z0],
        [b.w, y + 0.65, z1],
        [b.w, y, z1 + 0.95 * P],
        [b.w, y - 0.65, z1],
      ];
      d.poly("e", pts, LIT, { stroke: "#e6e1d6", sw: 1.6, glow: true });
    }
  });
  pitched(s, b, H, 6 * P, false, 0.5, "#e6e3dc");
  // the steeple at the front (south): its tower, the open belfry, the spire, the cross
  const xm = b.w / 2;
  const sy0 = b.h - 1;
  s.box({ x: xm - 2, y: sy0, w: 4, d: 3.5, z: 0, h: 10 * P, mat: wallMat("#ecebe5") }, (d) => {
    d.poly("s", fr("s", sy0 + 3.5, xm - 1.2, xm + 1.2, 0, 3.4 * P), "#e0ddd4");
    d.poly("s", fr("s", sy0 + 3.5, xm - 0.85, xm + 0.85, 0.45 * P, 2.9 * P), "#5a2a22");
    const pts: V3[] = [
      [xm - 0.45, sy0 + 3.5, 7.4 * P],
      [xm + 0.45, sy0 + 3.5, 7.4 * P],
      [xm + 0.45, sy0 + 3.5, 8.4 * P],
      [xm, sy0 + 3.5, 8.9 * P],
      [xm - 0.45, sy0 + 3.5, 8.4 * P],
    ];
    d.poly("s", pts, LIT, { stroke: "#e6e1d6", sw: 1.4, glow: true });
  });
  s.box({ x: xm - 2.15, y: sy0 - 0.15, w: 4.3, d: 3.8, z: 10 * P, h: 0.3 * P, mat: mat("#e0ddd4") });
  s.box({ x: xm - 2, y: sy0, w: 4, d: 3.5, z: 10.3 * P, h: 2.5 * P, mat: wallMat("#ecebe5") }, (d) => {
    for (const f of ["s", "e"] as const) {
      const plane = f === "s" ? sy0 + 3.5 : xm + 2;
      const [u0, u1] = f === "s" ? [xm - 1.5, xm + 1.5] : [sy0 + 0.5, sy0 + 3];
      d.poly(f, fr(f, plane, u0, u1, 10.3 * P, 12.8 * P), "#1a1d21");
      for (let z = 10.6; z < 12.6; z += 0.32) d.poly(f, fr(f, plane, u0, u1, z * P, (z + 0.08) * P), "#d8d4ca");
    }
  });
  s.box({ x: xm - 2.2, y: sy0 - 0.2, w: 4.4, d: 3.9, z: 12.8 * P, h: 0.6 * P, mat: ROOF });
  s.cyl({ x: xm, y: sy0 + 1.75, z: 13.4 * P, r: 2.1, r2: 0.05, h: 8.2 * P, mat: ROOF });
  s.box({ x: xm - 0.05, y: sy0 + 1.7, w: 0.1, d: 0.1, z: 21.6 * P, h: 1.6 * P, mat: STEEL, line: 0.5 });
  s.box({ x: xm - 0.4, y: sy0 + 1.7, w: 0.8, d: 0.1, z: 22.5 * P, h: 0.1 * P, mat: STEEL, line: 0.5 });
  for (let k = 0; k < 3; k++)
    s.box({
      x: xm - 2 + k * 0.15,
      y: sy0 + 3.5,
      w: 4 - k * 0.3,
      d: 1.4 - k * 0.4,
      z: k * 0.15 * P,
      h: 0.15 * P,
      mat: CONCRETE,
      line: 0.5,
    });
  s.shadow(0, 0, b.w, b.h + 2.5, 0.3, 0.1);
}
function gas(s: Sketch, b: Bld) {
  // the kiosk at the back, the canopy over the pumps
  s.box({ x: 2, y: b.h - 6, w: 10, d: 6, z: 0, h: 3.2 * P, mat: wallMat("#d8d4cb") }, (d) => {
    d.poly("s", fr("s", b.h, 3, 11, 0.4 * P, 2.6 * P), LIT, { stroke: "#23292e", sw: 1, glow: true });
  });
  s.box({ x: 1.8, y: b.h - 6.2, w: 10.4, d: 6.4, z: 3.2 * P, h: 0.3 * P, mat: SNOW });
  for (const x of [3, b.w - 3])
    for (const y of [2, 8]) s.box({ x: x - 0.25, y: y - 0.25, w: 0.5, d: 0.5, z: 0, h: 4.6 * P, mat: mat("#e9e9e6") });
  for (const x of [7, b.w - 7]) {
    s.box({ x: x - 0.6, y: 3.5, w: 1.2, d: 3, z: 0, h: 0.25 * P, mat: CONCRETE });
    for (const y of [4.2, 5.2]) {
      s.box({ x: x - 0.35, y, w: 0.7, d: 0.6, z: 0.25 * P, h: 1.0 * P, mat: mat("#b8322a", "#c8473a") });
      s.box(
        { x: x - 0.37, y: y - 0.02, w: 0.74, d: 0.64, z: 1.25 * P, h: 0.6 * P, mat: mat("#e9e6dc", "#f4f7fa") },
        (d) => {
          d.poly("e", fr("e", x + 0.37, y + 0.12, y + 0.52, 1.38 * P, 1.72 * P), "#9ff0b0", { glow: true });
        },
      );
    }
  }
  s.box({ x: 1, y: 0, w: b.w - 2, d: 10, z: 4.6 * P, h: 0.8 * P, mat: mat("#b8322a", "#f4f7fa") });
  s.shadow(1, 0, b.w - 2, 10, 0.25, 0.1);
}
function smallHouse(s: Sketch, b: Bld, wall: Mat, alongX: boolean, H: number) {
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wall });
  pitched(s, b, H, 2.4 * P, alongX, 0.5);
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
function shed(s: Sketch, b: Bld) {
  const H = 4 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: mat("#9aa0a6", "#aab0b5", "#9aa0a6", "#80868c") }, (d) => {
    for (let x = 0.5; x < b.w; x += 0.5) d.poly("s", fr("s", b.h, x - 0.03, x + 0.03, 0, H), "#868c92");
  });
  s.box({ x: -0.4, y: -0.4, w: b.w + 0.8, d: b.h + 0.8, z: H, h: 0.2 * P, mat: mat("#5d6267") });
  s.box({ x: -0.38, y: -0.38, w: b.w + 0.76, d: b.h + 0.76, z: H + 0.2 * P, h: 0.4 * P, mat: SNOW });
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
function gatehouse(s: Sketch, b: Bld) {
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: 1.0 * P, mat: CONCRETE });
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 1.0 * P, h: 1.6 * P, mat: mat("#51606b", "#5c6b76"), op: 0.85 }, (d) => {
    for (const f of ["s", "e"] as const)
      d.poly(f, fr(f, f === "s" ? b.h : b.w, 0.1, (f === "s" ? b.w : b.h) - 0.1, 1.05 * P, 2.55 * P), LIT, {
        op: 0.85,
        glow: true,
      });
  });
  s.box({ x: -0.6, y: -0.6, w: b.w + 1.2, d: b.h + 1.2, z: 2.6 * P, h: 0.35 * P, mat: CONCRETE });
  s.box({ x: -0.62, y: -0.62, w: b.w + 1.24, d: b.h + 1.24, z: 2.95 * P, h: 0.25 * P, mat: SNOW });
  s.shadow(-0.4, -0.4, b.w + 0.8, b.h + 0.8, 0.35, 0.1);
}
function shelter(s: Sketch, b: Bld) {
  for (const [x, y] of [
    [0, 0],
    [b.w, 0],
    [0, b.h],
    [b.w, b.h],
  ])
    s.box({ x: x - 0.06, y: y - 0.06, w: 0.12, d: 0.12, z: 0, h: 2.5 * P, mat: DARK });
  s.box({ x: 0, y: 0, w: b.w, d: 0.08, z: 0.2 * P, h: 2.2 * P, mat: mat("#8fa3b0"), op: 0.45 });
  s.box({ x: 0.5, y: 0.3, w: b.w - 1, d: 0.5, z: 0.45 * P, h: 0.1 * P, mat: WOOD });
  s.box({ x: -0.3, y: -0.3, w: b.w + 0.6, d: b.h + 0.6, z: 2.5 * P, h: 0.2 * P, mat: DARK });
  s.box({ x: -0.3, y: -0.3, w: b.w + 0.6, d: b.h + 0.6, z: 2.7 * P, h: 0.25 * P, mat: SNOW });
}
function building(s: Sketch, p: Props) {
  const b = p as unknown as Bld;
  switch (b.kind) {
    case "house":
      return house(s, b);
    case "church":
      return church(s, b);
    case "gas":
      return gas(s, b);
    case "gatehouse":
      return gatehouse(s, b);
    case "shelter":
      return shelter(s, b);
    case "boathouse":
      return smallHouse(s, b, RED_BOARD, true, 3.2 * P);
    case "shed":
      return shed(s, b);
    case "barn":
      return barn(s, b);
    case "silo":
      return silo(s, b);
    case "farmhouse":
      return farmhouse(s, b);
    default:
      return shop(s, b);
  }
}

// ── the farm (docs/plan/31-the-day.md) ──────────────────────────────────────
const BARN_RED = mat("#8e2b20", "#9e3a2c", "#8e2b20", "#6e2018");
const TRIM = mat("#ece6da", "#f6f2ea", "#e4ddd0", "#c9c2b5");
const STRAW = mat("#c9a95a", "#d8bb70", "#c4a252", "#a88a44");
const STALK = mat("#b59c6c", "#c4ad7f", "#a88d5c", "#8f7a52");
/** The barn's gambrel roof (its ridge along x, as 3D draws it): steep low, shallow high, snow on
 *  its slopes; the east gable end red, the shape of it. */
function gambrel(s: Sketch, b: Bld, z: number, over = 0.6) {
  const K = 3.2;
  const ym = b.h / 2;
  const prof: [number, number][] = [
    [-over, z - 0.35 * P],
    [K, z + 2.8 * P],
    [ym, z + 4.2 * P],
    [b.h - K, z + 2.8 * P],
    [b.h + over, z - 0.35 * P],
  ];
  s.shape({ x: -over, y: -over, w: b.w + 2 * over, d: b.h + 2 * over, z: z - 0.35 * P, h: 4.6 * P }, (d) => {
    const poly = (pts: V3[], fill: string) => {
      const p = pts.map(([x, y, zz]) => d.m(x, y, zz));
      d.raw(
        `<path d="M${p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L")}Z" fill="${fill}" stroke="#151819" stroke-width="1" stroke-linejoin="round"/>`,
      );
    };
    const slope = (k: number, fill: string) => {
      const [ya, za] = prof[k];
      const [yb, zb] = prof[k + 1];
      poly(
        [
          [-over, ya, za],
          [b.w + over, ya, za],
          [b.w + over, yb, zb],
          [-over, yb, zb],
        ],
        fill,
      );
    };
    slope(0, "#dfe6ec");
    slope(1, "#e9eef2");
    poly(
      [
        [b.w, 0, z],
        [b.w, K, z + 2.8 * P],
        [b.w, ym, z + 4.2 * P],
        [b.w, b.h - K, z + 2.8 * P],
        [b.w, b.h, z],
      ],
      "#7a2419",
    );
    slope(2, "#f4f7fa");
    slope(3, "#f7fafc");
  });
}
function barn(s: Sketch, b: Bld) {
  const H = 5.2 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: BARN_RED }, (d) => {
    // the west doorway (dark: you walk in), its doors slid open either side, white X's
    const zm = b.h / 2;
    d.poly("w", fr("w", 0, zm - 1.6, zm + 1.6, 0, 3.4 * P), "#1b1410");
    for (const [u0, u1] of [
      [zm - 4.6, zm - 1.6],
      [zm + 1.6, zm + 4.6],
    ]) {
      d.poly("w", fr("w", 0, u0, u1, 0.05 * P, 3.3 * P), "#ece6da");
      d.poly("w", fr("w", 0, u0 + 0.2, u1 - 0.2, 0.25 * P, 3.1 * P), "#8e2b20");
    }
    for (const f of ["s", "n"] as const)
      for (let x = 4; x < b.w - 2; x += 6) d.poly(f, fr(f, f === "s" ? b.h : 0, x, x + 1, 2.2 * P, 3.2 * P), "#2c3540");
  });
  for (const [x, y] of [
    [0, 0],
    [b.w, 0],
    [0, b.h],
    [b.w, b.h],
  ])
    s.box({ x: x - 0.12, y: y - 0.12, w: 0.24, d: 0.24, z: 0, h: H, mat: TRIM, line: 0.5 });
  // a stone foundation round its foot
  s.box({
    x: -0.06,
    y: -0.06,
    w: b.w + 0.12,
    d: b.h + 0.12,
    z: 0,
    h: 0.6 * P,
    mat: mat("#8a8780", "#9a978f", "#8a8780", "#77746d"),
  });
  gambrel(s, b, H);
  // the cupola on the ridge
  s.box({ x: b.w / 2 - 0.8, y: b.h / 2 - 0.8, w: 1.6, d: 1.6, z: H + 4.0 * P, h: 1.3 * P, mat: TRIM });
  s.cyl({ x: b.w / 2, y: b.h / 2, z: H + 5.3 * P, r: 1.2, r2: 0.05, h: 0.9 * P, mat: mat("#3d3a36", "#f4f7fa") });
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
function silo(s: Sketch, b: Bld) {
  const c = b.w / 2;
  const r = Math.min(b.w, b.h) / 2 - 0.2;
  s.cyl({ x: c, y: c, z: 0, r, h: 13 * P, mat: mat("#a9aeb2", "#c4c8cc") });
  for (let z = 1.5; z < 13; z += 2.2) s.cyl({ x: c, y: c, z: z * P, r: r + 0.05, h: 0.14 * P, mat: STEEL });
  s.cyl({ x: c, y: c, z: 13 * P, r, r2: 0.6, h: 2 * P, mat: mat("#8f9499", "#f6f8fa") });
  s.shadow(c - r, c - r, 2 * r, 2 * r, 0.3, 0.5);
}
function farmhouse(s: Sketch, b: Bld) {
  const H = 6.2 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat("#e3dccb") }, (d) => {
    const xm = b.w / 2;
    for (const dx of [-4, 4]) {
      d.poly("n", fr("n", 0, xm + dx - 0.65, xm + dx + 0.65, 0.9 * P, 2.4 * P), GLASS);
      d.poly("n", fr("n", 0, xm + dx - 0.6, xm + dx + 0.6, 3.7 * P, 5.1 * P), GLASS);
    }
    d.poly("n", fr("n", 0, xm - 0.5, xm + 0.5, 0.45 * P, 2.5 * P), "#4a3a2c");
  });
  pitched(s, b, H, 3 * P, true, 0.5);
  // the porch along the front (north)
  s.box({ x: 1, y: -2.2, w: b.w - 2, d: 2.2, z: 0, h: 0.45 * P, mat: WOOD });
  for (let x = 1.2; x <= b.w - 1; x += (b.w - 2.4) / 3)
    s.box({ x: x - 0.09, y: -2.1, w: 0.18, d: 0.18, z: 0.45 * P, h: 2.35 * P, mat: TRIM, line: 0.4 });
  s.box({ x: 0.8, y: -2.4, w: b.w - 1.6, d: 2.4, z: 2.8 * P, h: 0.15 * P, mat: ROOF });
  s.box({ x: 0.8, y: -2.4, w: b.w - 1.6, d: 2.4, z: 2.95 * P, h: 0.2 * P, mat: SNOW, line: 0.4 });
  s.shadow(0, -2.2, b.w, b.h + 2.2, 0.3, 0.1);
}
/** A run of the cornfield: a row's dry stalks, `len` tiles of it (north–south). */
function cornRow(s: Sketch, p: Props) {
  const len = Number(p.len) || 10;
  const r = rng(Number(p.seed) || 1);
  for (let y = 0.2; y < len; y += 0.55 + r() * 0.3) {
    if (r() < 0.1) continue;
    const h = (r() < 0.14 ? 0.5 + r() * 0.4 : 1.5 + r() * 0.6) * P;
    const x = 0.45 + (r() - 0.5) * 0.3;
    s.box({ x, y, w: 0.08, d: 0.08, z: 0, h, mat: STALK, line: 0.3 });
    if (h > P)
      s.box({
        x: x - 0.28,
        y: y - 0.04,
        w: 0.64,
        d: 0.16,
        z: h * (0.45 + r() * 0.3),
        h: 0.04 * P,
        mat: STALK,
        line: 0.25,
      });
  }
}
function rail(s: Sketch, p: Props) {
  const v = p.dir === "v";
  const len = Number(p.len) || 3;
  s.box({ x: 0, y: 0, w: 0.14, d: 0.14, z: 0, h: 1.15 * P, mat: WOOD, line: 0.5 });
  for (const z of [0.55, 1.0])
    s.box({ x: 0, y: 0, w: v ? 0.1 : len, d: v ? len : 0.1, z: z * P, h: 0.1 * P, mat: WOOD, line: 0.4 });
}
function tractor(s: Sketch) {
  const RED = mat("#9b2a20", "#b03a2e", "#9b2a20", "#7a2018");
  const TYRE = mat("#1e1e1e", "#2a2a2a");
  // along x: the hood ahead (east), the cab behind, the big wheels at the back
  for (const y of [0.05, 2.0]) {
    s.cyl({ x: 1.1, y: y + 0.25, z: 0, r: 0.85, h: 0.5 * P, mat: TYRE });
    s.cyl({ x: 3.3, y: y + 0.2, z: 0, r: 0.45, h: 0.35 * P, mat: TYRE });
  }
  s.box({ x: 2.0, y: 0.8, w: 2.2, d: 0.9, z: 0.8 * P, h: 0.9 * P, mat: RED });
  s.box({ x: 2.1, y: 0.82, w: 2.0, d: 0.85, z: 1.7 * P, h: 0.14 * P, mat: SNOW, line: 0.3 });
  s.box({ x: 0.45, y: 0.3, w: 1.3, d: 1.9, z: 0.9 * P, h: 0.25 * P, mat: DARK });
  for (const [x, y] of [
    [0.45, 0.35],
    [1.65, 0.35],
    [0.45, 2.1],
    [1.65, 2.1],
  ])
    s.box({ x, y, w: 0.08, d: 0.08, z: 1.1 * P, h: 1.3 * P, mat: DARK, line: 0.3 });
  s.box({ x: 0.4, y: 0.3, w: 1.4, d: 1.9, z: 2.4 * P, h: 0.12 * P, mat: RED });
  s.box({ x: 0.38, y: 0.28, w: 1.44, d: 1.94, z: 2.52 * P, h: 0.18 * P, mat: SNOW, line: 0.3 });
  s.box({ x: 1.2, y: 2.2, w: 0.6, d: 0.3, z: 0.9 * P, h: 0.3 * P, mat: mat("#2f5d8a", "#3d6f9e") }); // the toolbox
  s.shadow(0.2, 0.1, 3.8, 2.6, 0.32, 0.2);
}
function scarecrow(s: Sketch) {
  // (a red plaid shirt over blue trousers, as 3D dresses him)
  const COAT = mat("#8a3b2e", "#9a4a3c", "#8a3b2e", "#6e2f25");
  s.cyl({ x: 0.37, y: 0.5, z: 0.5 * P, r: 0.12, h: 0.85 * P, mat: mat("#3d4a5c") });
  s.cyl({ x: 0.63, y: 0.5, z: 0.5 * P, r: 0.12, h: 0.85 * P, mat: mat("#3d4a5c") });
  s.box({ x: 0.45, y: 0.45, w: 0.1, d: 0.1, z: 0, h: 2.5 * P, mat: WOOD, line: 0.4 });
  s.box({ x: -0.3, y: 0.45, w: 1.6, d: 0.1, z: 1.8 * P, h: 0.1 * P, mat: WOOD, line: 0.4 });
  s.cyl({ x: 0.5, y: 0.5, z: 0.9 * P, r: 0.4, r2: 0.3, h: 1.1 * P, mat: COAT });
  s.box({ x: -0.25, y: 0.38, w: 1.5, d: 0.26, z: 1.72 * P, h: 0.28 * P, mat: COAT });
  s.box({ x: -0.25, y: 0.38, w: 1.5, d: 0.26, z: 2.0 * P, h: 0.06 * P, mat: SNOW, line: 0.3 });
  s.cyl({ x: 0.5, y: 0.5, z: 2.05 * P, r: 0.26, h: 0.45 * P, mat: mat("#c9b48a", "#d8c49a") });
  s.cyl({ x: 0.5, y: 0.5, z: 2.5 * P, r: 0.36, h: 0.06 * P, mat: DARK });
  s.cyl({ x: 0.5, y: 0.5, z: 2.56 * P, r: 0.2, h: 0.28 * P, mat: DARK });
}
function bale(s: Sketch) {
  // lying on its side (as 3D lays them): the wrapped round, its darker end, snow on top
  s.box({ x: 0, y: 0.05, w: 1.24, d: 1.1, z: 0, h: 1.2 * P, mat: STRAW, puff: 8, faces: { s: mat("#a88a44") } });
  s.box({ x: 0.25, y: 0.05, w: 0.75, d: 1.05, z: 1.2 * P, h: 0.1 * P, mat: SNOW, line: 0.4 });
}

// ── the rest ────────────────────────────────────────────────────────────────
function tower(s: Sketch) {
  const c = 9;
  // the fence round its foot (a gap to the south)
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
    const x = c + Math.cos(a) * 8.6;
    const y = c + Math.sin(a) * 8.6;
    if (y > c && Math.abs(x - c) < 1.5) continue;
    s.box({ x: x - 0.05, y: y - 0.05, w: 0.1, d: 0.1, z: 0, h: 1.8 * P, mat: STEEL, line: 0.6 });
  }
  // four legs splayed from its foot to under the bowl, braced (tp/grounds3d.ts: the same)
  s.shape({ x: c - 5, y: c - 5, w: 10, d: 10, z: 0, h: 25 * P }, (d) => {
    const leg = (k: number, z: number): [number, number, number] => {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const r = 2.3 + (z / 24) * 2.6;
      return [c + Math.cos(a) * r, c + Math.sin(a) * r, z * P];
    };
    const seg = (a: [number, number, number], b2: [number, number, number], w: number, col: string) => {
      const p = d.m(...a);
      const q = d.m(...b2);
      d.raw(
        `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`,
      );
    };
    seg([c, c, 0], [c, c, 24.5 * P], 6, "#7d848b");
    for (let k = 0; k < 4; k++) {
      for (const [z0, z1] of [
        [1, 8],
        [8, 16],
        [16, 24],
      ]) {
        seg(leg(k, z0), leg(k + 1, z1), 1.2, "#6f767d");
        seg(leg(k, z1), leg(k + 1, z0), 1.2, "#6f767d");
        seg(leg(k, z1), leg(k + 1, z1), 2, "#8e959c");
      }
      seg(leg(k, 0), leg(k, 24.2), 4, "#8e959c");
    }
  });
  s.cyl({ x: c, y: c, z: 24.3 * P, r: 4.4, r2: 6.6, h: 2.6 * P, mat: mat("#c9ced3") });
  s.cyl({ x: c, y: c, z: 26.8 * P, r: 7.6, h: 0.2 * P, mat: mat("#6f767d", "#f4f7fa") });
  s.cyl({ x: c, y: c, z: 27 * P, r: 6.6, h: 6.4 * P, mat: mat("#dadde0", "#e6e8ea") });
  s.cyl({ x: c, y: c, z: 33.3 * P, r: 7.1, r2: 0.3, h: 3.6 * P, mat: mat("#e9eef2", "#f4f7fa") });
  s.cyl({ x: c, y: c, z: 36.8 * P, r: 0.35, h: 1.6 * P, mat: mat("#8e959c") });
  s.cyl({
    x: c,
    y: c,
    z: 38.4 * P,
    r: 0.45,
    h: 0.6 * P,
    mat: { c: "#ff2a1a", top: "#ff6a4a", flat: true },
    glow: true,
  });
  s.shadowDot(c, c, 7.5, 0.25);
}
function fence(s: Sketch, p: Props) {
  const v = p.dir === "v";
  const len = 3;
  const w = v ? 0.1 : len;
  const d = v ? len : 0.1;
  s.box({ x: 0, y: 0, w: 0.1, d: 0.1, z: 0, h: 3.05 * P, mat: STEEL, line: 0.6 });
  // the chain-link: see-through
  s.box({ x: 0, y: 0, w, d, z: 0.05 * P, h: 2.35 * P, mat: mat("#3a3e44"), op: 0.32, line: 0.4 });
  for (const k of [2.6, 2.8, 3.0]) s.box({ x: 0, y: 0, w, d, z: k * P, h: 0.6, mat: DARK, line: 0 });
  // snow caught at its foot
  s.box({
    x: v ? -0.25 : 0,
    y: v ? 0 : -0.25,
    w: v ? 0.5 : len,
    d: v ? len : 0.5,
    z: 0,
    h: 0.3 * P,
    mat: SNOW,
    line: 0.4,
  });
}
function barrier(s: Sketch, p: Props) {
  const n = Number(p.len) || 8;
  s.box({ x: n - 0.3, y: 0.2, w: 0.6, d: 0.6, z: 0, h: 1.1 * P, mat: STEEL });
  for (let k = 0; k < n - 0.4; k += 0.95)
    s.box({
      x: k,
      y: 0.43,
      w: Math.min(0.95, n - 0.4 - k),
      d: 0.14,
      z: 0.95 * P,
      h: 0.17 * P,
      mat: mat(Math.round(k / 0.95) % 2 ? "#f2f2f2" : "#c8322a"),
      line: 0.5,
    });
}
// the company's shuttle (docs/plan/27, phase 6): 10 × 3 tiles, its nose at −x
// (as the lot's cars are), cream with a rust stripe, a band of dark glass
function bus(s: Sketch) {
  const BODY = mat("#e6dccb", "#f1e9db");
  const GLASS = mat("#262d33", "#323a41");
  const TYRE = mat("#1c1c1c", "#2a2a2a");
  for (const x of [1.4, 7.6]) for (const y of [0.25, 2.45]) s.box({ x, y, w: 1, d: 0.3, z: 0, h: 0.75 * P, mat: TYRE });
  s.box({ x: 0, y: 0.3, w: 10, d: 2.4, z: 0.35 * P, h: 1.2 * P, mat: BODY, line: 1 });
  s.box({ x: -0.02, y: 0.3, w: 10.04, d: 2.4, z: 1.0 * P, h: 0.22 * P, mat: mat("#a8432c", "#b9523a"), line: 0.4 });
  s.box({ x: 0, y: 0.3, w: 10, d: 2.4, z: 1.55 * P, h: 0.95 * P, mat: GLASS, line: 0.8 });
  s.box({ x: 0, y: 0.3, w: 10, d: 2.4, z: 2.5 * P, h: 0.45 * P, mat: BODY, line: 0.8 });
  s.box({ x: 0.3, y: 0.45, w: 9.4, d: 2.1, z: 2.95 * P, h: 0.12 * P, mat: SNOW, line: 0.5 });
  // its lights: headlamps at the nose, red at the back
  for (const y of [0.55, 2.25]) {
    s.box({
      x: -0.04,
      y,
      w: 0.06,
      d: 0.25,
      z: 0.7 * P,
      h: 0.18 * P,
      mat: mat("#fff4cc", "#fffbe8"),
      glow: true,
      line: 0,
    });
    s.box({ x: 9.98, y, w: 0.06, d: 0.25, z: 0.7 * P, h: 0.18 * P, mat: mat("#c8322a", "#d8553f"), line: 0 });
  }
}
// the snow plough, as 3D builds it (tp/vehicles3d.ts): the blade at the nose (x 0), the orange
// cab, the grey salt hopper behind, a beacon on the cab
function plough(s: Sketch) {
  const ORANGE = mat("#d8692a", "#e57a3a", "#d8692a", "#b0521f");
  const TYRE = mat("#1c1c1c", "#2a2a2a");
  for (const x of [2.1, 5.3, 6.7])
    for (const y of [0.3, 2.4]) s.box({ x, y, w: 1.1, d: 0.35, z: 0, h: 1.1 * P, mat: TYRE });
  s.box({ x: 0.1, y: 0, w: 0.25, d: 3, z: 0.15 * P, h: 0.9 * P, mat: mat("#e0b12a", "#edc240"), line: 0.6 });
  s.box({ x: 0.9, y: 0.35, w: 6.9, d: 2.3, z: 0.5 * P, h: 0.5 * P, mat: DARK });
  s.box({ x: 1.0, y: 0.3, w: 2.4, d: 2.4, z: 0.9 * P, h: 1.5 * P, mat: ORANGE, line: 0.8 });
  s.box({ x: 1.0, y: 0.3, w: 1.6, d: 2.4, z: 1.75 * P, h: 0.5 * P, mat: mat("#262d33", "#323a41"), line: 0.5 });
  s.box({ x: 3.5, y: 0.35, w: 3.8, d: 2.3, z: 1.0 * P, h: 1.6 * P, mat: mat("#8d8a84", "#a09c95"), line: 0.8 });
  s.box({ x: 3.6, y: 0.45, w: 3.6, d: 2.1, z: 2.6 * P, h: 0.12 * P, mat: SNOW, line: 0.4 });
  s.box({
    x: 1.9,
    y: 1.35,
    w: 0.3,
    d: 0.3,
    z: 2.4 * P,
    h: 0.25 * P,
    mat: mat("#ffa020", "#ffc060"),
    glow: true,
    line: 0,
  });
}
function statue(s: Sketch) {
  s.box({ x: 0, y: 0, w: 5, d: 5, z: 0, h: 0.5 * P, mat: mat("#8f8b83", "#a39f97") });
  s.box({ x: 1.1, y: 1.1, w: 2.8, d: 2.8, z: 0.5 * P, h: 2.7 * P, mat: mat("#9d988f", "#b0aba2") });
  s.box({ x: 1, y: 1, w: 3, d: 3, z: 3.2 * P, h: 0.2 * P, mat: SNOW });
  // the founder, his arm out to the street (north)
  s.cyl({ x: 2.5, y: 2.5, z: 3.4 * P, r: 0.75, r2: 0.45, h: 2.4 * P, mat: BRONZE });
  s.cyl({ x: 2.5, y: 2.5, z: 5.8 * P, r: 0.45, r2: 0.42, h: 0.9 * P, mat: BRONZE });
  s.cyl({ x: 2.5, y: 2.5, z: 6.7 * P, r: 0.34, h: 0.7 * P, mat: BRONZE });
  s.cyl({ x: 2.5, y: 2.5, z: 7.4 * P, r: 0.36, r2: 0.1, h: 0.25 * P, mat: SNOW });
  s.box({ x: 2.4, y: 1.0, w: 0.2, d: 1.5, z: 6.4 * P, h: 0.25 * P, mat: BRONZE });
}
function bench(s: Sketch) {
  for (const x of [0.15, 1.75]) s.box({ x, y: 0.1, w: 0.1, d: 0.6, z: 0, h: 1.0 * P, mat: DARK });
  s.box({ x: 0, y: 0.2, w: 2, d: 0.6, z: 0.45 * P, h: 0.08 * P, mat: WOOD });
  s.box({ x: 0, y: 0.08, w: 2, d: 0.1, z: 0.7 * P, h: 0.35 * P, mat: WOOD });
  s.box({ x: 0, y: 0.2, w: 2, d: 0.6, z: 0.53 * P, h: 0.1 * P, mat: SNOW, line: 0.4 });
}
function townLamp(s: Sketch) {
  const POST = mat("#1f2a26", "#2c3a35");
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.3, r2: 0.24, h: 0.6 * P, mat: POST });
  s.cyl({ x: 0.5, y: 0.5, z: 0.6 * P, r: 0.1, r2: 0.08, h: 3.6 * P, mat: POST });
  s.box({
    x: 0.26,
    y: 0.26,
    w: 0.48,
    d: 0.48,
    z: 4.25 * P,
    h: 0.57 * P,
    mat: { c: "#ffe0a8", top: "#fff2d0", flat: true },
    glow: true,
    line: 0.8,
  });
  s.cyl({ x: 0.5, y: 0.5, z: 4.82 * P, r: 0.42, r2: 0.05, h: 0.5 * P, mat: POST });
  s.shadowDot(0.5, 0.5, 0.3, 0.35);
}
function porchLamp(s: Sketch) {
  s.box({
    x: 0.38,
    y: 0.38,
    w: 0.24,
    d: 0.24,
    z: 2.2 * P,
    h: 0.35 * P,
    mat: { c: "#ffd29a", top: "#fff0d0", flat: true },
    glow: true,
    line: 0.6,
  });
}
function sign(s: Sketch, p: Props) {
  const w = Number(p.w) || 4;
  for (const x of [0.2, w - 0.3]) s.box({ x, y: 0.4, w: 0.1, d: 0.1, z: 0, h: 2.8 * P, mat: DARK });
  s.box({ x: 0, y: 0.35, w, d: 0.12, z: 1.0 * P, h: 1.8 * P, mat: mat(String(p.bg ?? "#e9e6dc")) }, (d) => {
    for (let i = 0; i < 3; i++)
      d.poly(
        "s",
        fr("s", 0.47, 0.4, w - 0.4 - i * 0.6, (1.3 + i * 0.45) * P, (1.42 + i * 0.45) * P),
        String(p.fg ?? "#1c2228"),
      );
  });
  s.box({ x: 0, y: 0.35, w, d: 0.12, z: 2.8 * P, h: 0.12 * P, mat: SNOW, line: 0.4 });
}
function dock(s: Sketch, p: Props) {
  const n = Number(p.len) || 14;
  for (let y = 0; y < n; y += 0.45) s.box({ x: 0, y, w: 3, d: 0.4, z: 0.55 * P, h: 0.12 * P, mat: WOOD, line: 0.4 });
  s.box({ x: 0.15, y: 0.2, w: 2.7, d: n - 0.4, z: 0.67 * P, h: 0.08 * P, mat: SNOW, line: 0 });
  // the canoe turned over, under snow
  s.box({ x: 1.0, y: 4.5, w: 0.9, d: 4.6, z: 0.67 * P, h: 0.32 * P, mat: mat("#7a2f22", "#f4f7fa") });
}

// the town's street furniture (shared STREET; tp/town3d.ts in 3D)
function hydrant(s: Sketch) {
  const RED = mat("#a8352a", "#c04a3c");
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.17, h: 0.08 * P, mat: RED });
  s.cyl({ x: 0.5, y: 0.5, z: 0.08 * P, r: 0.12, h: 0.55 * P, mat: RED });
  s.box({ x: 0.32, y: 0.45, w: 0.36, d: 0.1, z: 0.37 * P, h: 0.1 * P, mat: RED });
  s.cyl({ x: 0.5, y: 0.5, z: 0.63 * P, r: 0.14, r2: 0.05, h: 0.14 * P, mat: SNOW });
  s.shadowDot(0.5, 0.5, 0.2, 0.3);
}
function streetBin(s: Sketch) {
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.27, h: 0.85 * P, mat: mat("#2f4a3b", "#3d5c4a") });
  s.cyl({ x: 0.5, y: 0.5, z: 0.85 * P, r: 0.29, h: 0.1 * P, mat: SNOW });
  s.shadowDot(0.5, 0.5, 0.3, 0.3);
}
function newsbox(s: Sketch) {
  s.box({ x: 0.27, y: 0.3, w: 0.46, d: 0.4, z: 0.5 * P, h: 0.62 * P, mat: mat("#2c4f7a", "#3a6294") });
  for (const [x, y] of [
    [0.3, 0.33],
    [0.64, 0.33],
    [0.3, 0.62],
    [0.64, 0.62],
  ])
    s.box({ x, y, w: 0.06, d: 0.06, z: 0, h: 0.5 * P, mat: DARK });
  s.box({ x: 0.26, y: 0.29, w: 0.48, d: 0.42, z: 1.12 * P, h: 0.06 * P, mat: SNOW, line: 0.4 });
}
function pole(s: Sketch) {
  const W = mat("#5a4434", "#6e5442");
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.16, r2: 0.12, h: 8.6 * P, mat: W });
  s.box({ x: 0.43, y: -0.7, w: 0.14, d: 2.4, z: 7.6 * P, h: 0.14 * P, mat: W });
  s.box({ x: 0.42, y: -0.7, w: 0.16, d: 2.4, z: 7.74 * P, h: 0.05 * P, mat: SNOW, line: 0.3 });
  s.shadowDot(0.5, 0.5, 0.25, 0.3);
}
function stopSign(s: Sketch) {
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.04, h: 2.3 * P, mat: mat("#8b8f93") });
  s.box({ x: 0.15, y: 0.55, w: 0.7, d: 0.05, z: 1.9 * P, h: 0.7 * P, mat: mat("#c8322a", "#e8e2d2") });
}
function streetSign(s: Sketch) {
  const GREEN = mat("#2f5a3c", "#3d7050");
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.04, h: 2.9 * P, mat: mat("#8b8f93") });
  s.box({ x: 0.5, y: 0.47, w: 1.3, d: 0.05, z: 2.55 * P, h: 0.24 * P, mat: GREEN });
  s.box({ x: 0.47, y: 0.5, w: 0.05, d: 1.3, z: 2.82 * P, h: 0.24 * P, mat: GREEN });
}
function postbox(s: Sketch) {
  s.box({ x: 0.24, y: 0.25, w: 0.52, d: 0.5, z: 0.3 * P, h: 0.9 * P, mat: mat("#2b4d82", "#3a62a0") });
  s.box({ x: 0.24, y: 0.25, w: 0.52, d: 0.5, z: 1.2 * P, h: 0.08 * P, mat: SNOW, line: 0.4 });
  s.shadowDot(0.5, 0.5, 0.3, 0.3);
}

/** A snow pole by the road: an orange stake, its reflector, a cap of snow. */
function snowPole(s: Sketch) {
  s.box({ x: 0.47, y: 0.47, w: 0.06, d: 0.06, z: 0, h: 1.7 * P, mat: mat("#d2601e", "#e07030"), line: 0.5 });
  s.box({ x: 0.46, y: 0.46, w: 0.08, d: 0.08, z: 1.35 * P, h: 0.2 * P, mat: mat("#e8eef2"), line: 0.4 });
  s.box({ x: 0.46, y: 0.46, w: 0.08, d: 0.08, z: 1.7 * P, h: 0.05 * P, mat: SNOW, line: 0.3 });
}
/** One of the lot's islands (docs/plan/42-the-lot.md): a concrete kerb round a bed of snow, at
 *  (ox, oz) in its footprint, w × d. */
function island(s: Sketch, p: Props) {
  const [x, y, w, d] = [Number(p.ox), Number(p.oz), Number(p.w), Number(p.d)];
  s.box({ x, y, w, d, z: 0, h: 0.15 * P, mat: CONCRETE, line: 0.6 });
  s.box({
    x: x + 0.22,
    y: y + 0.22,
    w: w - 0.44,
    d: d - 0.44,
    z: 0.15 * P,
    h: 0.22 * P,
    mat: SNOW,
    puff: 5,
    line: 0.5,
  });
}
/** A heap of ploughed snow at (ox, oz) in its footprint, a × b its half-sizes, h tall. */
function heap(s: Sketch, p: Props) {
  const [x, y, a, b, h] = [Number(p.ox), Number(p.oz), Number(p.a), Number(p.b), Number(p.h)];
  s.box({ x: x - a, y: y - b, w: 2 * a, d: 2 * b, z: 0, h: h * 0.55 * P, mat: SNOW, puff: 7, line: 0.6 });
  s.box({
    x: x - a * 0.6,
    y: y - b * 0.6,
    w: a * 1.2,
    d: b * 1.2,
    z: h * 0.5 * P,
    h: h * 0.45 * P,
    mat: SNOW,
    puff: 7,
    line: 0.6,
  });
}
/** A sawhorse barricade across the road (along y, `len` long), a lamp on it. */
function sawhorse(s: Sketch, p: Props) {
  const n = Number(p.len) || 4.4;
  for (const y of [0.2, n - 0.2])
    s.box({ x: 0.15, y: y - 0.05, w: 0.7, d: 0.1, z: 0, h: 1.25 * P, mat: mat("#e9e6dc"), line: 0.6 });
  for (const z of [0.55, 1.05])
    s.box({ x: 0.45, y: 0, w: 0.06, d: n, z: z * P, h: 0.22 * P, mat: mat("#c8322a") }, (d) => {
      for (let y = 0.55; y < n; y += 1.1) d.poly("e", fr("e", 0.51, y, y + 0.55, z * P, (z + 0.22) * P), "#f2f2f2");
    });
  s.box({ x: 0.43, y: 0, w: 0.1, d: n, z: 1.27 * P, h: 0.05 * P, mat: SNOW, line: 0.3 });
  s.box({
    x: 0.4,
    y: n - 0.5,
    w: 0.15,
    d: 0.18,
    z: 1.3 * P,
    h: 0.15 * P,
    mat: { c: "#ffb02a", top: "#ffd27a", flat: true },
    glow: true,
    line: 0.5,
  });
}
/** A steel truss's side along x (`len` long, its deck z0 px up): chords, verticals, diagonals. */
function truss(s: Sketch, p: Props) {
  const n = Number(p.len) || 32;
  const z0 = Number(p.z0) || 0;
  const H = 5.2 * P;
  const bays = Math.max(2, Math.round(n / 4));
  s.shape({ x: 0, y: 0, w: n, d: 0.4, z: z0, h: H }, (d) => {
    const seg = (a: [number, number], b2: [number, number], w: number) => {
      const p0 = d.m(a[0], 0.2, z0 + a[1]);
      const q = d.m(b2[0], 0.2, z0 + b2[1]);
      d.raw(
        `<line x1="${p0[0].toFixed(1)}" y1="${p0[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="#3d4650" stroke-width="${w}" stroke-linecap="round"/>`,
      );
    };
    const b = n / bays;
    seg([0, 0], [n, 0], 4);
    seg([0, 0], [b, H], 3.5);
    seg([b, H], [n - b, H], 3.5);
    seg([n - b, H], [n, 0], 3.5);
    for (let k = 1; k < bays; k++) {
      seg([k * b, 0], [k * b, H], 2);
      if (k < bays - 1) seg(k % 2 ? [k * b, 0] : [k * b, H], k % 2 ? [(k + 1) * b, H] : [(k + 1) * b, 0], 1.5);
    }
    seg([0, 0.75 * P], [n, 0.75 * P], 1.5);
  });
}
/** A railing along y (`len` long, its deck z0 px up): posts and two rails. */
function railing(s: Sketch, p: Props) {
  const n = Number(p.len) || 20;
  const z0 = Number(p.z0) || 0;
  for (let y = 0; y <= n; y += 1.5) s.box({ x: 0, y, w: 0.12, d: 0.12, z: z0, h: 1.1 * P, mat: WOOD, line: 0.5 });
  s.box({ x: 0, y: 0, w: 0.1, d: n, z: z0 + 1.0 * P, h: 0.1 * P, mat: mat("#5a4636", "#f4f7fa"), line: 0.5 });
  s.box({ x: 0, y: 0, w: 0.08, d: n, z: z0 + 0.5 * P, h: 0.08 * P, mat: WOOD, line: 0.4 });
}

// ── the kinds and their drawings, the things ────────────────────────────────
/** Every kind the Grounds' things use (one per building: its own footprint). */
/** The lot as the page hands it in (its layout and the plough's banks: lot.ts — a lazy chunk
 *  importing it would split the page's chunks). */
export interface LotIso {
  l: LotLayout;
  banks: { x: number; z: number; s: number; sz: number }[];
}
export function groundKinds(
  G: G,
  lot?: LotIso,
): { kinds: Record<string, CatalogEntry>; gens: Record<string, ItemGen> } {
  const kinds: Record<string, CatalogEntry> = {
    gr_tower: { label: "Water tower", w: 18, h: 18, solid: true },
    gr_fence_h: { label: "Fence", w: 3, h: 1, solid: true },
    gr_fence_v: { label: "Fence", w: 1, h: 3, solid: true },
    gr_barrier: { label: "Barrier", w: 8, h: 1, solid: true },
    gr_statue: { label: "The founder", w: 5, h: 5, solid: true },
    gr_bench: { label: "Bench", w: 2, h: 1, solid: true },
    gr_lamp_town: { label: "Lamp", w: 1, h: 1, solid: true },
    gr_lamp_porch: { label: "Lamp", w: 1, h: 1, solid: false },
    gr_sign: { label: "Sign", w: 4, h: 1, solid: true },
    gr_dock: { label: "Dock", w: 3, h: 14, solid: false },
    gr_bus: { label: "Shuttle", w: 10, h: 3, solid: false },
    gr_plough: { label: "Snow plough", w: 9, h: 3, solid: false },
    gr_corn: { label: "Cornfield", w: 1, h: 10, solid: false },
    gr_rail_h: { label: "Fence", w: 3, h: 1, solid: false },
    gr_rail_v: { label: "Fence", w: 1, h: 3, solid: false },
    gr_tractor: { label: "Tractor", w: 4, h: 3, solid: true },
    gr_scarecrow: { label: "Scarecrow", w: 1, h: 1, solid: true },
    gr_bale: { label: "Hay", w: 1, h: 1, solid: false },
    gr_sawhorse: { label: "Road closed", w: 1, h: 5, solid: true },
    gr_snowpole: { label: "Snow pole", w: 1, h: 1, solid: false },
    gr_truss: { label: "Bridge", w: 33, h: 1, solid: false },
    gr_railing: { label: "Railing", w: 1, h: 22, solid: false },
    gr_hydrant: { label: "Hydrant", w: 1, h: 1, solid: true },
    gr_streetbin: { label: "Bin", w: 1, h: 1, solid: true },
    gr_newsbox: { label: "Newspapers", w: 1, h: 1, solid: true },
    gr_pole: { label: "Pole", w: 1, h: 1, solid: true },
    gr_stop: { label: "Stop sign", w: 1, h: 1, solid: true },
    gr_streetsign: { label: "Street sign", w: 1, h: 1, solid: true },
    gr_postbox: { label: "Mailbox", w: 1, h: 1, solid: true },
    // the Kart Park (docs/plan/46-the-karts.md)
    gr_k_tower: { label: "The tower", w: 3, h: 2, solid: true },
    gr_k_gate: { label: "Yutopia Kart Park", w: 14, h: 1, solid: false },
    gr_k_flood: { label: "Floodlight", w: 1, h: 1, solid: true },
    gr_k_kart: { label: "Kart", w: 2, h: 2, solid: true },
    gr_k_desk: { label: "The desk", w: 1, h: 4, solid: true },
    gr_k_wall: { label: "The shed", w: 1, h: 9, solid: true },
    gr_k_front: { label: "The shed", w: 1, h: 9, solid: false },
    gr_k_hut: { label: "Race control", w: 4, h: 7, solid: true },
    gr_k_board: { label: "Lap records", w: 3, h: 1, solid: true },
    gr_k_circuits: { label: "The circuits", w: 3, h: 1, solid: true },
    gr_k_fire: { label: "A fire barrel", w: 1, h: 1, solid: true },
    gr_k_stand: { label: "A kart on its stand", w: 3, h: 2, solid: true },
    gr_k_tools: { label: "Tool chest", w: 1, h: 1, solid: true },
    gr_k_tyres: { label: "Spare tyres", w: 1, h: 1, solid: true },
    gr_k_podium: { label: "The podium", w: 8, h: 3, solid: true },
    gr_k_cocoa: { label: "Hot cocoa", w: 3, h: 2, solid: true },
    gr_k_plinth: { label: "Kart No. 1", w: 3, h: 2, solid: true },
    gr_k_billboard: { label: "Yutopia Kart Park", w: 9, h: 2, solid: true },
    gr_k_finger: { label: "Kart Park", w: 1, h: 2, solid: true },
    gr_k_psign: { label: "Parking", w: 1, h: 1, solid: true },
  };
  const gens: Record<string, ItemGen> = {
    gr_tower: { draw: tower, variants: 1 },
    gr_fence_h: { draw: (s) => fence(s, { dir: "h" }), variants: 1 },
    gr_fence_v: { draw: (s) => fence(s, { dir: "v" }), variants: 1 },
    gr_barrier: { draw: barrier, variants: 1 },
    gr_statue: { draw: statue, variants: 1 },
    gr_bench: { draw: bench, variants: 1 },
    gr_hydrant: { draw: hydrant, variants: 1 },
    gr_streetbin: { draw: streetBin, variants: 1 },
    gr_newsbox: { draw: newsbox, variants: 1 },
    gr_pole: { draw: pole, variants: 1 },
    gr_stop: { draw: stopSign, variants: 1 },
    gr_streetsign: { draw: streetSign, variants: 1 },
    gr_postbox: { draw: postbox, variants: 1 },
    gr_lamp_town: { draw: townLamp, variants: 1 },
    gr_lamp_porch: { draw: porchLamp, variants: 1 },
    gr_sign: { draw: sign, variants: 1, key: (p) => `${p.bg}|${p.fg}` },
    gr_dock: { draw: dock, variants: 1 },
    gr_bus: { draw: bus, variants: 1 },
    gr_plough: { draw: plough, variants: 1 },
    gr_corn: { draw: cornRow, variants: 1, key: (p) => `${p.seed}|${p.len}` },
    gr_rail_h: { draw: (s, p) => rail(s, { ...p, dir: "h" }), variants: 1, key: (p) => String(p.len) },
    gr_rail_v: { draw: (s, p) => rail(s, { ...p, dir: "v" }), variants: 1, key: (p) => String(p.len) },
    gr_tractor: { draw: tractor, variants: 1 },
    gr_scarecrow: { draw: scarecrow, variants: 1 },
    gr_bale: { draw: bale, variants: 1 },
    gr_sawhorse: { draw: sawhorse, variants: 1 },
    gr_snowpole: { draw: snowPole, variants: 1 },
    gr_truss: { draw: truss, variants: 1, key: (p) => `${p.len}|${p.z0}` },
    gr_railing: { draw: railing, variants: 1, key: (p) => `${p.len}|${p.z0}` },
    gr_k_tower: { draw: kartTower, variants: 1 },
    gr_k_gate: { draw: kartGate, variants: 1 },
    gr_k_flood: { draw: kartFlood, variants: 1 },
    gr_k_kart: { draw: kartIso, variants: 1, key: (p) => `${p.c}|${p.t}` },
    gr_k_desk: { draw: kartDesk, variants: 1 },
    gr_k_wall: { draw: shedWall, variants: 1 },
    gr_k_front: { draw: shedFront, variants: 1 },
    gr_k_hut: { draw: kartHut, variants: 1 },
    gr_k_board: { draw: lapBoard, variants: 1 },
    // (its face the layout raced: drawn again when it changes — grounds-iso.ts repaints the park)
    gr_k_circuits: {
      draw: (s) => circuitsBoard(s, G),
      variants: 1,
      key: () => {
        const n = G.kartLayoutNow();
        return `${n.key}${n.reverse ? "-r" : ""}`;
      },
    },
    gr_k_fire: { draw: fireBarrel, variants: 1 },
    gr_k_stand: { draw: kartStand3, variants: 1 },
    gr_k_tools: { draw: toolChest, variants: 1 },
    gr_k_tyres: { draw: tyreStack, variants: 1 },
    gr_k_podium: { draw: kartPodium, variants: 1 },
    gr_k_cocoa: { draw: cocoaCart, variants: 1 },
    gr_k_plinth: { draw: kartPlinth, variants: 1 },
    gr_k_billboard: { draw: billboard, variants: 1 },
    gr_k_finger: { draw: fingerpost, variants: 1 },
    gr_k_psign: { draw: parkingSign, variants: 1 },
  };
  // the stands: a kind a length (their footprints differ)
  for (const st of G.KART_STANDS) {
    const len = Math.round(Math.abs(st.x1 - st.x0));
    const kind = `gr_k_stand${len}`;
    kinds[kind] ??= { label: "The stands", w: len, h: st.rows + 2 + STAND_IN, solid: true };
    gens[kind] ??= { draw: (sk) => kartStand(sk, G, st), variants: 1 };
  }
  // the lot's islands and the plough's heaps (lotThings): a kind a footprint's size
  for (const t of lot ? lotThings(lot) : []) {
    kinds[t.kind] ??= { label: t.kind.startsWith("gr_heap") ? "Snow" : "Island", w: t.w, h: t.h, solid: false };
    gens[t.kind] ??= {
      draw: t.kind.startsWith("gr_heap") ? heap : island,
      variants: 1,
      key: (p) => `${p.ox}|${p.oz}|${p.w}|${p.d}|${p.a}|${p.b}|${p.h}`,
    };
  }
  kinds.gr_wall = { label: "Wall", w: 1, h: 1, solid: true };
  gens.gr_wall = { draw: wallPiece, variants: 1, key: (p) => `${p.dir}|${p.c}` };
  for (const ins of G.INSIDES)
    for (const [k, f] of ins.fits.entries()) {
      const kind = `gr_f_${ins.b.key}_${k}`;
      const x = Math.floor(f.x);
      const y = Math.floor(f.z);
      kinds[kind] = {
        label: f.kind,
        w: Math.max(1, Math.ceil(f.x + f.w) - x),
        h: Math.max(1, Math.ceil(f.z + f.d) - y),
        solid: f.solid,
      };
      const props = { ...f, x: f.x - x, z: f.z - y, bar: ins.b.sign === "BAR" };
      gens[kind] = { draw: (s) => fitPiece(s, props), variants: 1 };
    }
  for (const [i, b] of G.BUILDINGS.entries()) {
    if (b.stored || b.kind === "hq") continue;
    const k = `gr_b_${b.key}`;
    kinds[k] = { label: b.name, w: b.x1 - b.x0, h: b.z1 - b.z0, solid: true };
    const props: Props = {
      kind: b.kind,
      w: b.x1 - b.x0,
      h: b.z1 - b.z0,
      floors: b.floors,
      face: b.face,
      sign: b.sign,
      vacant: b.vacant,
      seed: i * 7 + 3,
      // (what it looks like: decided with the 3D view's — world/grounds-look.ts)
      look: b.kind === "house" ? houseLook(b) : shopLook(b),
    };
    gens[k] = { draw: (s) => building(s, props), variants: 1 };
  }
  return { kinds, gens };
}

// ── insides (the town's bar, diner, market; the gatehouse): cut walls, furniture ──
function wallPiece(s: Sketch, p: Props) {
  const c = String(p.c ?? "#e6e0d4");
  const H = 0.9 * P; // cut low, as the iso view cuts walls
  const m = wallMat(c);
  if (p.dir === "v") s.box({ x: -0.08, y: 0, w: 0.16, d: 1, z: 0, h: H, mat: m, line: 0.7 });
  else s.box({ x: 0, y: -0.08, w: 1, d: 0.16, z: 0, h: H, mat: m, line: 0.7 });
}
function fitPiece(s: Sketch, p: Props) {
  const f = p as unknown as { kind: string; x: number; z: number; w: number; d: number; h: number; bar: boolean };
  const { x, z: y, w, d } = f;
  const h = f.h * P;
  const WOODD = mat("#3e2718", "#5b3a26");
  switch (f.kind) {
    case "counter":
      s.box({ x, y, w, d, z: 0, h: h - 3, mat: f.bar ? WOODD : mat("#d8d2c4", "#e6e0d4") });
      s.box({
        x: x - 0.08,
        y: y - 0.12,
        w: w + 0.16,
        d: d + 0.2,
        z: h - 3,
        h: 3,
        mat: f.bar ? mat("#7a5236", "#8a5a36") : mat("#b9b2a3", "#cfc9bc"),
      });
      break;
    case "stool":
      s.cyl({ x: x + 0.3, y: y + 0.3, z: 0, r: 0.05, h: h - 3, mat: DARK });
      s.cyl({ x: x + 0.3, y: y + 0.3, z: h - 3, r: 0.3, h: 3, mat: mat("#b5562f", "#c96a3f") });
      break;
    case "table":
      s.cyl({ x: x + w / 2, y: y + d / 2, z: 0, r: 0.07, h: h - 2, mat: DARK });
      s.box({ x, y, w, d, z: h - 2, h: 2, mat: mat("#8a5a36", "#a8733f") });
      break;
    case "chair":
      s.box({ x, y, w, d, z: 0.42 * P, h: 3, mat: mat("#5b3a26", "#74492f") });
      s.box({ x: x + w - 0.08, y, w: 0.08, d, z: 0, h, mat: mat("#5b3a26", "#74492f") });
      break;
    case "booth":
      s.box({ x, y, w, d: 0.7, z: 0, h: 0.5 * P, mat: mat("#8a3b2e", "#a04a36") });
      s.box({ x, y, w, d: 0.25, z: 0, h, mat: mat("#8a3b2e", "#a04a36") });
      s.box({ x: x + 0.4, y: y + 1.0, w: w - 0.8, d: d - 2.0, z: 0.75 * P, h: 2, mat: mat("#d8d2c4", "#e6e0d4") });
      s.box({ x, y: y + d - 0.7, w, d: 0.7, z: 0, h: 0.5 * P, mat: mat("#8a3b2e", "#a04a36") });
      break;
    case "shelf": {
      s.box({ x, y, w, d, z: 0, h, mat: f.bar ? WOODD : mat("#9aa0a6", "#aab0b5") }, (dd) => {
        const r = rng(Math.round(x * 13 + y * 7));
        for (let k = 0.5 * P; k < h - 6; k += 0.55 * P)
          for (let u = x + 0.1; u < x + w - 0.2; u += 0.3)
            dd.poly(
              "s",
              fr("s", y + d, u, u + 0.2, k, k + 0.35 * P),
              ["#2f4a3b", "#6b2430", "#c39a4a", "#3d4a5c", "#e8e6df", "#b5562f"][Math.floor(r() * 6)],
            );
      });
      break;
    }
    case "fridge":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#d6d2c8", "#e4e0d6") }, (dd) => {
        dd.poly("w", fr("w", x, y + 0.2, y + d - 0.2, 0.2 * P, h - 0.2 * P), "#dfeeff", { glow: true, op: 0.8 });
      });
      break;
    case "jukebox":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#5a1e1e", "#6e2a22") }, (dd) => {
        dd.poly("s", fr("s", y + d, x + 0.15, x + w - 0.15, 0.8 * P, h - 0.15 * P), "#ffb35c", { glow: true });
      });
      break;
    case "till":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#9a948a", "#aaa49a") });
      s.box({ x: x + 0.4, y: y + 0.3, w: 0.6, d: 0.5, z: h, h: 0.3 * P, mat: DARK });
      break;
    case "desk":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#5a4636", "#6b5442") });
      break;
    case "locker":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#4f5a52", "#5f6b62") });
      s.box({ x: x + w / 2 - 0.02, y: y + d, w: 0.04, d: 0.02, z: 0.2 * P, h: h - 0.4 * P, mat: DARK });
      break;
    case "screens":
      s.box({
        x,
        y,
        w: 0.1,
        d,
        z: 0.85 * P,
        h: h - 0.85 * P,
        mat: { c: "#9fd2c0", top: "#c8eadc", flat: true },
        glow: true,
      });
      break;
    // the barn's: hay in bales, the stalls' boards, the workbench
    case "hay":
      for (let k = 0; k < f.h - 0.05; k += 0.5)
        s.box({ x, y, w, d, z: k * P, h: Math.min(0.48, f.h - k) * P, mat: STRAW, line: 0.4 });
      break;
    case "stall":
      s.box({ x, y, w, d, z: 0.15 * P, h: h - 0.15 * P, mat: WOOD, line: 0.4 });
      break;
    // the farmhouse's
    case "stove":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#2b2a26", "#3a3a38") });
      s.box({ x: x + 0.25, y: y + d - 0.25, w: 0.1, d: 0.1, z: h, h: 1.6 * P, mat: DARK });
      break;
    case "sofa": {
      const C = mat("#6b4a3a", "#7d5844", "#6b4a3a", "#5a3c2e");
      s.box({ x, y, w, d, z: 0.15 * P, h: 0.3 * P, mat: C });
      s.box({ x, y, w: 0.25, d, z: 0.45 * P, h: h - 0.45 * P, mat: C });
      s.box({ x, y, w, d: 0.2, z: 0.45 * P, h: 0.2 * P, mat: C });
      s.box({ x, y: y + d - 0.2, w, d: 0.2, z: 0.45 * P, h: 0.2 * P, mat: C });
      break;
    }
    case "armchair": {
      const C = mat("#2f4a3b", "#3d5c4a", "#2f4a3b", "#27402f");
      s.box({ x, y, w, d, z: 0.15 * P, h: 0.3 * P, mat: C });
      s.box({ x, y: y + d - 0.25, w, d: 0.25, z: 0.45 * P, h: h - 0.45 * P, mat: C });
      break;
    }
    case "coffee":
      s.box({ x, y, w, d, z: h - 0.06 * P, h: 0.06 * P, mat: WOOD });
      for (const [u, v] of [
        [0.08, 0.08],
        [w - 0.14, d - 0.14],
      ])
        s.box({ x: x + u, y: y + v, w: 0.06, d: 0.06, z: 0, h: h - 0.06 * P, mat: WOOD });
      break;
    case "rug":
      s.box({ x, y, w, d, z: 0, h: 0.03 * P, mat: mat("#8a3b2e", "#9a4a3a"), line: 0.3 });
      s.box({ x: x + 0.3, y: y + 0.3, w: w - 0.6, d: d - 0.6, z: 0.03 * P, h: 0.01 * P, mat: mat("#c9a95a"), line: 0 });
      break;
    case "fireplace":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#8a6a5a", "#9a7a6a", "#8a6a5a", "#6f5444") });
      s.box({ x: x + 0.6, y, w: w - 1.2, d: d - 0.15, z: h, h: 3.0 * P - h, mat: mat("#7a5a4a", "#8a6a5a") });
      s.box({
        x: x + 0.6,
        y: y - 0.02,
        w: w - 1.2,
        d: 0.1,
        z: 0.1 * P,
        h: 0.3 * P,
        mat: { c: "#ff7a2a", top: "#ffb06a", flat: true },
        glow: true,
      });
      break;
    case "bookshelf":
      s.box({ x, y, w, d, z: 0, h, mat: WOOD }, (dr) => {
        for (let k = 0.2; k < f.h - 0.2; k += 0.45)
          dr.poly("s", fr("s", d, 0.1, w - 0.1, (k + 0.02) * P, (k + 0.3) * P), "#6b2430");
      });
      break;
    case "bed":
      s.box({ x, y, w, d, z: 0, h: 0.35 * P, mat: WOOD });
      s.box({
        x: x + 0.05,
        y: y + 0.05,
        w: w - 0.1,
        d: d - 0.1,
        z: 0.35 * P,
        h: 0.15 * P,
        mat: mat("#e8e4dc", "#f4f1ea"),
      });
      s.box({ x, y: y + 0.8, w, d: d - 0.8, z: 0.5 * P, h: 0.08 * P, mat: mat("#6b8aa8", "#7d9bb8") });
      s.box({ x, y: y - 0.1, w, d: 0.15, z: 0, h: 1.1 * P, mat: WOOD });
      break;
    case "nightstand":
      s.box({ x, y, w, d, z: 0, h, mat: WOOD });
      s.box({ x: x + 0.15, y: y + 0.15, w: 0.2, d: 0.2, z: h, h: 0.35 * P, mat: mat("#e8d8b0") });
      break;
    case "wardrobe":
      s.box({ x, y, w, d, z: 0, h, mat: WOOD });
      break;
    case "bench":
      for (const u of [x + 0.1, x + w - 0.2])
        s.box({ x: u, y: y + 0.1, w: 0.1, d: d - 0.2, z: 0, h: h - 0.1 * P, mat: WOOD });
      s.box({ x, y, w, d, z: h - 0.1 * P, h: 0.1 * P, mat: WOOD });
      s.box({ x: x + 1.6, y: y + 0.25, w: 0.7, d: 0.45, z: h, h: 0.25 * P, mat: mat("#2f5d8a", "#3d6f9e") });
      break;
  }
}
/** A building's inside as iso items (its walls cut low, its furniture), building coords. */
export function insideThings(G: G, i: GroundsModule.Inside): Thing[] {
  const out: Thing[] = [];
  const { b } = i;
  const c =
    b.sign === "BAR" ? "#4a3426" : b.kind === "barn" ? "#6a4a34" : b.kind === "farmhouse" ? "#d8c9a8" : "#e6e0d4";
  for (let x = b.x0; x < b.x1; x++)
    for (const z of [b.z0, b.z1])
      if (G.wallEdgeAt("h", x, z))
        out.push({
          id: `gr:${b.key}:h${x},${z}`,
          kind: "gr_wall",
          x,
          y: z,
          rot: 0,
          props: { dir: "h", c },
          cx: x + 0.5,
          cz: z,
        });
  for (let z = b.z0; z < b.z1; z++)
    for (const x of [b.x0, b.x1])
      if (G.wallEdgeAt("v", x, z))
        out.push({
          id: `gr:${b.key}:v${x},${z}`,
          kind: "gr_wall",
          x,
          y: z,
          rot: 0,
          props: { dir: "v", c },
          cx: x,
          cz: z + 0.5,
        });
  for (const [k, f] of i.fits.entries()) {
    const x = Math.floor(f.x);
    const y = Math.floor(f.z);
    out.push({
      id: `gr:${b.key}:f${k}`,
      kind: `gr_f_${b.key}_${k}`,
      x,
      y,
      rot: 0,
      props: {},
      cx: f.x + f.w / 2,
      cz: f.z + f.d / 2,
    });
  }
  return out;
}

/** The things on the Grounds (building coords), each with its middle for the ground's height. */
/** The lot's islands and the plough's heaps round it (lot.ts) as things: each a footprint whole
 *  tiles round it, drawn at its own place in it. */
function lotThings({ l, banks }: LotIso) {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const out: { id: string; kind: string; x: number; y: number; w: number; h: number; props: Props }[] = [];
  for (const [i, k] of l.islands.entries()) {
    const x = Math.floor(k.x0);
    const y = Math.floor(k.z0);
    const w = Math.ceil(k.x1) - x;
    const h = Math.ceil(k.z1) - y;
    const props = {
      ox: r2(k.x0 + 0.08 - x),
      oz: r2(k.z0 + 0.1 - y),
      w: r2(k.x1 - k.x0 - 0.16),
      d: r2(k.z1 - k.z0 - 0.2),
    };
    out.push({ id: `island${i}`, kind: `gr_island_${w}x${h}`, x, y, w, h, props });
  }
  for (const [i, k] of banks.entries()) {
    const a = r2(k.s * 0.8);
    const b = r2(k.sz * 0.8);
    const n = Math.min(7, Math.ceil(2 * Math.max(a, b) + 0.5));
    const x = Math.floor(k.x - n / 2);
    const y = Math.floor(k.z - n / 2);
    out.push({
      id: `heap${i}`,
      kind: `gr_heap_${n}`,
      x,
      y,
      w: n,
      h: n,
      props: { ox: r2(k.x - x), oz: r2(k.z - y), a, b, h: r2(k.s * 0.62) },
    });
  }
  return out;
}
export function groundThings(G: G, lot?: LotIso): Thing[] {
  const out: Thing[] = [];
  const put = (id: string, kind: string, x: number, y: number, w: number, h: number, props: Props = {}, rot = 0) =>
    out.push({ id: `gr:${id}`, kind, x: Math.floor(x), y: Math.floor(y), rot, props, cx: x + w / 2, cz: y + h / 2 });
  // the lot's islands, heaps and sign (docs/plan/42-the-lot.md)
  if (lot) {
    for (const t of lotThings(lot)) put(t.id, t.kind, t.x, t.y, t.w, t.h, t.props);
    put("lot-sign", "gr_sign", lot.l.sign.x - 2, lot.l.sign.z, 4, 1, { bg: "#1f3554", fg: "#e9edf1" });
  }
  for (const b of G.BUILDINGS)
    if (!b.stored && b.kind !== "hq") put(b.key, `gr_b_${b.key}`, b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  // the lamps (the cobra-heads are the lot's own kind; its arm turned to the road)
  for (const [i, l] of G.LAMPS.entries()) {
    if (l.kind === "flood") continue; // (the Kart Park's: its own masts, gr_k_flood)
    if (l.kind === "cobra") {
      const dx = Math.cos(l.ry);
      const dz = -Math.sin(l.ry);
      const rot = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 2) : dz > 0 ? 1 : 3;
      put(`lamp${i}`, "lamp_post", l.x - 0.5, l.z - 0.5, 1, 1, {}, rot);
    } else put(`lamp${i}`, l.kind === "porch" ? "gr_lamp_porch" : "gr_lamp_town", l.x - 0.5, l.z - 0.5, 1, 1);
  }
  // the fence, a panel every 3 tiles (the gate open)
  for (let i = 0; i < G.FENCE.length; i++) {
    const [ax, az] = G.FENCE[i];
    const [bx, bz] = G.FENCE[(i + 1) % G.FENCE.length];
    const v = ax === bx;
    const len = Math.abs(v ? bz - az : bx - ax);
    const s = Math.sign(v ? bz - az : bx - ax);
    for (let t = 0; t < len; t += 3) {
      const x = v ? ax : ax + s * t - (s < 0 ? 3 : 0);
      const z = v ? az + s * t - (s < 0 ? 3 : 0) : az;
      if (!v && Math.abs(z - G.GATE.z) < 1 && x + 3 > G.GATE.x - 5 && x < G.GATE.x + 12) continue;
      put(`fence${i}-${t}`, v ? "gr_fence_v" : "gr_fence_h", x, z, v ? 1 : 3, v ? 3 : 1);
    }
  }
  put("tower", "gr_tower", G.TOWER.x - 9, G.TOWER.z - 9, 18, 18);
  put("statue", "gr_statue", G.STATUE.x - 2.5, G.STATUE.z - 2.5, 5, 5);
  put("bench", "gr_bench", G.BENCH.x - 1, G.BENCH.z, 2, 1);
  for (const [i, p] of G.SNOW_POLES.entries()) put(`pole-snow${i}`, "gr_snowpole", p.x - 0.5, p.z - 0.5, 1, 1);
  // the town's street furniture
  const SK: Record<string, string> = {
    hydrant: "gr_hydrant",
    bin: "gr_streetbin",
    newsbox: "gr_newsbox",
    pole: "gr_pole",
    stop: "gr_stop",
    streetsign: "gr_streetsign",
    postbox: "gr_postbox",
  };
  for (const [i, t] of G.STREET.entries())
    if (t.kind === "bench") put(`st${i}`, "gr_bench", Math.floor(t.x), Math.floor(t.z), 2, 1);
    else put(`st${i}`, SK[t.kind], Math.floor(t.x), Math.floor(t.z), 1, 1);
  put("barrier", "gr_barrier", -44.5, G.GATE.z - 1, 8, 1, { len: 8 });
  for (const dz of [-4.6, 0, 4.6])
    put(`closed${dz}`, "gr_sawhorse", G.ROAD_CLOSED.x - 0.5, G.ROAD_CLOSED.z + dz - 2.2, 1, 4.4, { len: 4.4 });
  // the bridges' sides (their decks are the land's picture): the road's steel truss, the
  // footbridge's railings (both run along an axis)
  for (const w of G.WAYS) {
    const idx = w.line.map((_, i) => i).filter((i) => w.bridged[i]);
    if (idx.length < 2) continue;
    const a = w.line[idx[0]];
    const b = w.line[idx[idx.length - 1]];
    const along = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
    const len = Math.abs(along ? b[0] - a[0] : b[1] - a[1]);
    const lo = along ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]);
    const mid = along ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2;
    const half = w.w / 2 + (w.kind === "trail" ? 0.2 : 0.7);
    // (on the land's picture: iso paints the way there, under the deck's true height)
    const deck = 0;
    for (const sd of [-1, 1]) {
      const id = `bridge-${w.key}${sd}`;
      if (along && w.kind !== "trail")
        put(id, "gr_truss", lo, mid + sd * half, len, 1, {
          len: Math.round(len),
          z0: Math.round(Math.max(0, deck) * P),
        });
      else if (!along)
        put(id, "gr_railing", mid + sd * half, lo, 1, len, {
          len: Math.round(len),
          z0: Math.round(Math.max(0, deck) * P),
        });
    }
  }
  put("gate-sign", "gr_sign", -51.5, G.GATE.z + 4, 4, 1, { bg: "#e9e6dc", fg: "#1c2228" });
  kartThings(G, put);
  // the car dealer's forecourt (docs/plan/43-the-spot.md): its pole sign, flood lamps and rail (the
  // concrete is the land's picture, the vehicles on show cars)
  const M = G.MOTORS;
  put("motors-sign", "gr_sign", M.sign.x - 2, M.sign.z, 4, 1, { bg: "#24382d", fg: "#efe3c4" });
  for (const [i, [x, z]] of M.floods.entries()) put(`motors-flood${i}`, "gr_lamp_town", x - 0.5, z - 0.5, 1, 1);
  for (const [k, [x0, z0, x1, z1]] of M.rails.entries()) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const lo = along ? Math.min(x0, x1) : Math.min(z0, z1);
    const len = Math.abs(along ? x1 - x0 : z1 - z0);
    for (let t = 0; t < len; t += 3) {
      const n = Math.min(3, len - t);
      if (along) put(`motors-rail${k}-${t}`, "gr_rail_h", lo + t, z0 - 0.5, 3, 1, { len: Math.round(n) });
      else put(`motors-rail${k}-${t}`, "gr_rail_v", x0 - 0.5, lo + t, 1, 3, { len: Math.round(n) });
    }
  }
  put("dock", "gr_dock", -254, -98, 3, 14, { len: 14 });
  // the farm (docs/plan/31-the-day.md): the cornfield in runs of rows, its fence, the tractor,
  // the scarecrows, hay bales by the barn
  const C = G.CORN;
  for (let x = C.x0 + 1; x < C.x1; x += C.row)
    for (let z = C.z0; z < C.z1; z += 10) {
      const len = Math.min(10, C.z1 - z);
      put(`corn${x},${z}`, "gr_corn", x - 0.5, z, 1, len, { len, seed: 1 + ((((x * 31 + z) % 5) + 5) % 5) }); // (5 looks, drawn once each)
    }
  const e = { x0: C.x0 - 2, z0: C.z0 - 2, x1: C.x1 + 1, z1: C.z1 + 1 };
  for (let x = e.x0; x < e.x1; x += 3) {
    put(`rail-n${x}`, "gr_rail_h", x, e.z0, 3, 1, { len: Math.min(3, e.x1 - x) });
    put(`rail-s${x}`, "gr_rail_h", x, e.z1, 3, 1, { len: Math.min(3, e.x1 - x) });
  }
  const gm = (e.z0 + e.z1) / 2;
  for (let z = e.z0; z < e.z1; z += 3) {
    put(`rail-w${z}`, "gr_rail_v", e.x0, z, 1, 3, { len: Math.min(3, e.z1 - z) });
    if (z + 3 < gm - 3 || z > gm + 3) put(`rail-e${z}`, "gr_rail_v", e.x1, z, 1, 3, { len: Math.min(3, e.z1 - z) });
  }
  // (the tractor is a vehicle now: shared car/homes.ts)
  for (const [i, c] of G.SCARECROWS.entries()) put(`crow${i}`, "gr_scarecrow", c.x - 0.5, c.z - 0.5, 1, 1);
  for (const [i, [x, z]] of [
    [437, -298],
    [437, -296.6],
    [438.4, -297.4],
    [466, -300],
  ].entries())
    put(`bale${i}`, "gr_bale", x - 0.5, z - 0.5, 1, 1);
  // (the cars parked along Main Street are cars like the lot's: world objects, shared car/homes.ts)
  return out;
}

// ── the Kart Park (docs/plan/46-the-karts.md): what stands up in it (the circuit, the bowl and the
// paddock are the land's picture: kart-iso.ts) ──
function kartThings(
  G: G,
  put: (id: string, kind: string, x: number, y: number, w: number, h: number, props?: Props, rot?: number) => void,
) {
  for (const [i, st] of G.KART_STANDS.entries()) {
    const len = Math.round(Math.abs(st.x1 - st.x0));
    put(`k-stand${i}`, `gr_k_stand${len}`, Math.min(st.x0, st.x1), st.z - STAND_IN, len, st.rows + 2 + STAND_IN);
  }
  put("k-tower", "gr_k_tower", G.KART_TOWER.x - 1.5, G.KART_TOWER.z - 1, 3, 2);
  put("k-gate", "gr_k_gate", G.KART_GATE.x - 7, G.KART_GATE.z, 14, 1);
  for (const [i, f] of G.kartFloods().entries()) put(`k-flood${i}`, "gr_k_flood", f.x - 0.5, f.z - 0.5, 1, 1);
  const R = G.KART_RACK;
  const cols: [string, string][] = [
    ["#b5562f", "#f3ead6"],
    ["#2f4a3b", "#e8a33d"],
    ["#e8a33d", "#2a2018"],
    ["#3d4a5c", "#f3ead6"],
    ["#6b2430", "#e8a33d"],
    ["#cdbf9f", "#b5562f"],
    ["#4a5a73", "#f3ead6"],
    ["#20262c", "#e8a33d"],
  ];
  for (let i = 0; i < R.n; i++)
    put(`k-kart${i}`, "gr_k_kart", R.x - 1, R.z0 + i * R.dz - 1, 2, 2, { c: cols[i % 8][0], t: cols[i % 8][1] });
  put("k-desk", "gr_k_desk", G.KART_DESK.x - 0.5, G.KART_DESK.z - 2, 1, 4);
  // the shed: its back wall and its front's posts, a piece a pair of bays (no roof: its karts seen)
  const S = G.KART_SHED;
  for (let i = 0; i < R.n / 2; i++) {
    const z = S.z0 + i * 2 * R.dz;
    put(`k-wall${i}`, "gr_k_wall", Math.floor(S.x0), z, 1, 9);
    put(`k-front${i}`, "gr_k_front", Math.floor(S.x1), z, 1, 9);
  }
  // what stands about the paddock
  const at: Record<string, [string, number, number]> = {
    hut: ["gr_k_hut", 4, 7],
    board: ["gr_k_board", 3, 1],
    circuits: ["gr_k_circuits", 3, 1],
    fire: ["gr_k_fire", 1, 1],
    stand: ["gr_k_stand", 3, 2],
    tools: ["gr_k_tools", 1, 1],
    tyres: ["gr_k_tyres", 1, 1],
    podium: ["gr_k_podium", 8, 3],
    cocoa: ["gr_k_cocoa", 3, 2],
  };
  for (const [i, t] of G.KART_THINGS.entries()) {
    if (t.kind === "bench") {
      // (the office's bench, as the 3D's: tp/kart/park3d.ts)
      put(`k-bench${i}`, "bench", t.x - t.hx, t.z - t.hz, t.hx * 2, t.hz * 2, {}, t.hz > t.hx ? 1 : 0);
      continue;
    }
    const [kind, w, h] = at[t.kind];
    put(`k-${t.kind}${i}`, kind, Math.round(t.x - w / 2), Math.round(t.z - h / 2), w, h);
  }
  // outside: the island's kart on its plinth, the P sign, the billboard and the fingerpost
  put("k-plinth", "gr_k_plinth", Math.round(G.KART_TURN.x - 1.5), Math.round(G.KART_TURN.z - 1), 3, 2);
  const C = G.KART_CARPARK;
  put("k-psign", "gr_k_psign", Math.floor(C.bx + C.bays * 2.7 + 0.5), Math.floor(C.aisle[0] - 1.7), 1, 1);
  put("k-billboard", "gr_k_billboard", Math.round(G.KART_SIGN.x - 4.5), Math.round(G.KART_SIGN.z - 3), 9, 2);
  put("k-finger", "gr_k_finger", Math.floor(G.KART_SIGN.fx), Math.floor(G.KART_SIGN.fz - 1.5), 1, 2);
  // the fence: a rail panel every 3 tiles, the gate open
  const F = G.KART_FENCE;
  for (let x = F.x0; x < F.x1; x += 3)
    for (const z of [F.z0, F.z1]) {
      if (z === F.z1 && x + 3 > G.KART_GATE.x - G.KART_GATE.w / 2 && x < G.KART_GATE.x + G.KART_GATE.w / 2) continue;
      put(`k-fence-h${x}-${z}`, "gr_rail_h", x, z, 3, 1, { len: Math.min(3, F.x1 - x) });
    }
  for (let z = F.z0; z < F.z1; z += 3)
    for (const x of [F.x0, F.x1]) put(`k-fence-v${x}-${z}`, "gr_rail_v", x, z, 1, 3, { len: Math.min(3, F.z1 - z) });
}
const K_WOOD = mat("#7a5534", "#8a6440", "#7d5836", "#5e4128");
const K_ROOF = mat("#2f4a3b", "#3b5a48", "#33503f", "#264034");
const K_CROWD = ["#6b2430", "#2f4a3b", "#3d4a5c", "#b5562f", "#e8a33d", "#4a5a73", "#8b8f93", "#cdbf9f", "#20262c"];
const K_SKIN = ["#f3d2b3", "#e4b48e", "#c68a5e", "#a8693f", "#7c4a2b"];
/** The stands along x (`len`), facing north (−y): six tiers stepping up south, the painted crowd
 *  on them (`crowd`: a seat's, as the 3D's: shared kartSeats), a back wall, a roof. */
const STAND_IN = 2;
/** The stands, as the 3D's (tp/kart/park3d.ts stands3d, tp/kart/crowd3d.ts): each row a footwell
 *  and a ledge with its plank, the aisles' stairs, stepped side walls, the back wall's boards, the
 *  roof with its snow and fascia; the crowd on its seats (shared kartSeats: the iso sees their
 *  backs — hair, beanies, caps, scarves; an arm or a flag up). */
function kartStand(s: Sketch, G: typeof GroundsModule, st: (typeof GroundsModule.KART_STANDS)[number]) {
  const len = Math.round(Math.abs(st.x1 - st.x0));
  const rows = st.rows;
  // (drawn 2 tiles in: the roof reaches out over the front — its footprint starts there)
  const O = STAND_IN;
  const CONC = mat("#b6b0a3", "#cbc5b8", "#bdb7aa", "#9c968a");
  const STAIR = mat("#cdc7ba", "#ddd8cc", "#d2ccc0", "#b2ac9f");
  const PLANK = mat("#8a5a34", "#9c6a40", "#8f5e37", "#6e472a");
  const WALNUT = mat("#4a3324", "#5a4030", "#4f372a", "#3b2a1e");
  const GREEN = mat("#2f4a3b", "#3b5a48", "#33503f", "#264034");
  const half = G.STAND_AISLE / 2;
  const aisles = G.standAisles(st).map((a) => a - st.x0);
  const cuts = [0, ...aisles.flatMap((a) => [a - half, a + half]), len];
  const spans: [number, number][] = [];
  for (let i = 0; i < cuts.length; i += 2) spans.push([cuts[i], cuts[i + 1]]);
  // the front wall (its boards face the track: the iso sees its back)
  for (const [a, c] of spans)
    s.box({ x: a, y: O - 0.05, w: c - a, d: G.STAND_WALL, z: 0, h: 1.0 * P, mat: GREEN, line: 0.4 });
  // who sits where (the crowd's seats), back to front so the nearer rows draw over
  const people = G.kartSeats().filter(
    (q) => q.stand !== undefined && G.KART_STANDS[q.stand] === st && G.crowdDraw(q.x, q.row ?? 0) <= G.KART_CROWD,
  );
  for (let r = 0; r < rows; r++) {
    const y = r * 1.2;
    const top = 0.45 * (r + 1);
    for (const [a, c] of spans) {
      if (r > 0) s.box({ x: a, y, w: c - a, d: 0.5, z: 0, h: 0.45 * r * P, mat: CONC, line: 0.3 });
      s.box({ x: a, y: O + y + 0.5, w: c - a, d: 0.7, z: 0, h: (top - 0.06) * P, mat: CONC, line: 0.3 });
      s.box({
        x: a + 0.02,
        y: O + y + 0.52,
        w: c - a - 0.04,
        d: 0.46,
        z: (top - 0.06) * P,
        h: 0.06 * P,
        mat: PLANK,
        line: 0.3,
      });
    }
    for (const a of aisles) {
      s.box({ x: a - half, y, w: G.STAND_AISLE, d: 0.6, z: 0, h: (0.45 * r + 0.225) * P, mat: STAIR, line: 0.3 });
      s.box({ x: a - half, y: O + y + 0.6, w: G.STAND_AISLE, d: 0.6, z: 0, h: top * P, mat: STAIR, line: 0.3 });
    }
    for (const q of people) {
      if (q.row !== r) continue;
      const x = q.x - st.x0;
      let h = Math.sin(q.x * 12.9898 + r * 78.233) * 43758.5453;
      const rnd = () => {
        h = (h * 9301 + 49297) % 233280;
        return Math.abs(h) / 233280;
      };
      const kid = rnd() < 0.18 ? 0.76 : 1;
      const shirt = K_CROWD[Math.floor(rnd() * K_CROWD.length)];
      const skin = K_SKIN[Math.floor(rnd() * K_SKIN.length)];
      const top2 = rnd();
      const wool = ["#b5562f", "#e8a33d", "#2f4a3b", "#f3ead6", "#6b2430", "#3d4a5c"][Math.floor(rnd() * 6)];
      const hair = ["#2a1d14", "#5a3a20", "#c99a5a", "#1a1a1a", "#8a4a2a", "#d8d2c4"][Math.floor(rnd() * 6)];
      const z0 = top * P;
      const zy = y + 0.75;
      // the knees forward over the footwell, the back, the head, its hair or hat, maybe an arm up
      s.box({
        x: x - 0.15 * kid,
        y: O + zy - 0.42 * kid,
        w: 0.3 * kid,
        d: 0.4 * kid,
        z: z0,
        h: 0.13 * kid * P,
        mat: mat("#2b2f36", "#3a3f47"),
        line: 0.3,
      });
      s.box({
        x: x - 0.19 * kid,
        y: O + zy - 0.12 * kid,
        w: 0.38 * kid,
        d: 0.26 * kid,
        z: z0,
        h: 0.5 * kid * P,
        mat: mat(shirt, shade(shirt, 1.12)),
        line: 0.35,
      });
      s.cyl({ x, y: O + zy, z: z0 + 0.52 * kid * P, r: 0.13 * kid, h: 0.27 * kid * P, mat: mat(skin), line: 0.35 });
      if (top2 < 0.38)
        s.cyl({
          x,
          y: O + zy,
          z: z0 + 0.66 * kid * P,
          r: 0.145 * kid,
          r2: 0.06 * kid,
          h: 0.2 * kid * P,
          mat: mat(wool, shade(wool, 1.1)),
          line: 0.35,
        });
      else if (top2 < 0.55)
        s.cyl({
          x,
          y: O + zy,
          z: z0 + 0.7 * kid * P,
          r: 0.14 * kid,
          h: 0.08 * kid * P,
          mat: mat(wool, shade(wool, 1.1)),
          line: 0.35,
        });
      else
        s.cyl({
          x,
          y: O + zy + 0.02,
          z: z0 + 0.66 * kid * P,
          r: 0.14 * kid,
          r2: 0.1 * kid,
          h: 0.14 * kid * P,
          mat: mat(hair, shade(hair, 1.15)),
          line: 0.35,
        });
      if (rnd() < 0.4)
        s.cyl({
          x,
          y: O + zy,
          z: z0 + 0.46 * kid * P,
          r: 0.15 * kid,
          h: 0.07 * kid * P,
          mat: mat(wool, shade(wool, 1.1)),
          line: 0.3,
        });
      const up = rnd();
      if (up < 0.22)
        s.box({
          x: x + 0.17 * kid,
          y: O + zy - 0.04,
          w: 0.08,
          d: 0.08,
          z: z0 + 0.5 * kid * P,
          h: 0.48 * kid * P,
          mat: mat(shirt, shade(shirt, 1.12)),
          line: 0.3,
        });
      if (up < 0.08)
        s.box({
          x: x + 0.2,
          y: O + zy - 0.06,
          w: 0.3,
          d: 0.02,
          z: z0 + 0.82 * kid * P,
          h: 0.2 * P,
          mat: mat(wool, shade(wool, 1.1)),
          line: 0.3,
        });
    }
  }
  // the side walls, stepped with the rows
  for (const x of [-0.16, len])
    for (let r = 0; r < rows; r++)
      s.box({ x, y: O + r * 1.2, w: 0.16, d: 1.2, z: 0, h: (0.45 * (r + 1) + 1.0) * P, mat: WALNUT, line: 0.4 });
  // the back wall (its boards to the paddock), the posts behind it
  const R = G.standRoof(st);
  s.box({ x: -0.16, y: O + rows * 1.2, w: len + 0.32, d: 0.2, z: 0, h: R.back * P, mat: WALNUT, line: 0.5 }, (d) => {
    for (let i = 0.5; i < len; i += 0.9)
      d.line(
        "s",
        [i, O + rows * 1.2 + 0.2, 0.2 * P],
        [i, O + rows * 1.2 + 0.2, (R.back - 0.2) * P],
        "rgba(0,0,0,0.25)",
        0.6,
      );
  });
  for (let i = 0; i <= 4; i++)
    s.box({
      x: (len * i) / 4 - 0.13,
      y: O + rows * 1.2 + 0.22,
      w: 0.26,
      d: 0.26,
      z: 0,
      h: (R.back + 0.1) * P,
      mat: STEEL,
    });
  // the roof (flat here, at its middle's height), its snow, the fascia on the front
  const rz = ((R.back + R.front) / 2) * P;
  s.box({
    x: -0.45,
    y: O + R.zFront - st.z,
    w: len + 0.9,
    d: R.zBack - R.zFront,
    z: rz,
    h: 0.22 * P,
    mat: K_ROOF,
    line: 0.7,
  });
  s.box({
    x: -0.4,
    y: O + R.zFront - st.z + 0.05,
    w: len + 0.8,
    d: R.zBack - R.zFront - 0.1,
    z: rz + 0.22 * P,
    h: 0.08 * P,
    mat: SNOW,
    line: 0.3,
  });
  s.box({
    x: -0.45,
    y: O + R.zFront - st.z - 0.1,
    w: len + 0.9,
    d: 0.14,
    z: (R.front - 0.55) * P,
    h: 0.7 * P,
    mat: WALNUT,
    line: 0.6,
  });
}
/** The tower: four legs, the order's VFD board facing north, a walnut cap. */
function kartTower(s: Sketch) {
  for (const x of [0.2, 2.6])
    for (const y of [0.3, 1.5]) s.box({ x, y, w: 0.18, d: 0.18, z: 0, h: 7.5 * P, mat: DARK });
  s.box({ x: -0.1, y: 0.4, w: 3.2, d: 0.6, z: 7.3 * P, h: 4.2 * P, mat: DARK, line: 0.6 });
  s.box({
    x: 0.1,
    y: 0.32,
    w: 2.8,
    d: 0.08,
    z: 7.6 * P,
    h: 3.6 * P,
    mat: { c: "#3a2a12", top: "#3a2a12", flat: true },
    glow: true,
  });
  s.box({ x: -0.3, y: 0.25, w: 3.6, d: 0.9, z: 11.5 * P, h: 0.35 * P, mat: K_WOOD, line: 0.5 });
}
/** The gate's arch across x: two chequered posts, the sign's walnut beam, its lamps. */
function kartGate(s: Sketch) {
  const BLK = mat("#151515", "#262626");
  const CRM = mat("#f3ead6", "#fbf5e8");
  for (const x of [0.7, 12.7])
    for (let k = 0; k < 8; k++)
      s.box({ x, y: 0.2, w: 0.6, d: 0.6, z: k * 0.78 * P, h: 0.78 * P, mat: k % 2 ? CRM : BLK, line: 0.3 });
  s.box({ x: 0.4, y: 0.25, w: 13.2, d: 0.5, z: 4.8 * P, h: 1.6 * P, mat: mat("#4a3324", "#5a4030"), line: 0.8 });
  s.box({
    x: 1.0,
    y: 0.2,
    w: 12,
    d: 0.06,
    z: 5.0 * P,
    h: 1.2 * P,
    mat: { c: "#e8d9b8", top: "#e8d9b8", flat: true },
    glow: true,
  });
  for (const x of [3, 7, 11])
    s.box({
      x,
      y: 0.4,
      w: 0.25,
      d: 0.25,
      z: 6.5 * P,
      h: 0.25 * P,
      mat: { c: LIT, top: "#fff2d0", flat: true },
      glow: true,
    });
}
/** A floodlight: its mast, its head of four lamps. */
function kartFlood(s: Sketch) {
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.2, r2: 0.13, h: 13 * P, mat: STEEL });
  s.box({ x: 0.05, y: 0.15, w: 0.9, d: 0.7, z: 12.6 * P, h: 1.1 * P, mat: DARK, line: 0.6 });
  s.box({
    x: 0.1,
    y: 0.1,
    w: 0.8,
    d: 0.08,
    z: 12.75 * P,
    h: 0.8 * P,
    mat: { c: "#fff4dc", top: "#fff4dc", flat: true },
    glow: true,
  });
  s.shadowDot(0.5, 0.5, 0.25, 0.3);
}
/** A kart nosed east (+x): its tyres, the pods in its colour, the seat, the wing in its trim. */
function kartIso(s: Sketch, p: Props) {
  const c = String(p.c ?? "#b5562f");
  const t = String(p.t ?? "#f3ead6");
  const BODY = mat(c, shade(c, 1.15), shade(c, 1.05), shade(c, 0.8));
  const TRIM = mat(t, shade(t, 1.1), t, shade(t, 0.82));
  const TYRE = mat("#1a1b1d", "#2a2b2d");
  for (const [x, y, w] of [
    [0.2, 0.25, 0.42],
    [0.2, 1.45, 0.42],
    [1.35, 0.3, 0.32],
    [1.35, 1.4, 0.32],
  ] as [number, number, number][])
    s.box({ x, y, w, d: 0.3, z: 0, h: 0.4 * P, mat: TYRE, line: 0.4 });
  s.box({ x: 0.15, y: 0.55, w: 1.75, d: 0.9, z: 0.08 * P, h: 0.06 * P, mat: DARK });
  s.box({ x: 0.55, y: 0.35, w: 0.75, d: 0.25, z: 0.12 * P, h: 0.22 * P, mat: BODY, line: 0.4 });
  s.box({ x: 0.55, y: 1.4, w: 0.75, d: 0.25, z: 0.12 * P, h: 0.22 * P, mat: BODY, line: 0.4 });
  s.box({ x: 1.45, y: 0.7, w: 0.45, d: 0.6, z: 0.12 * P, h: 0.24 * P, mat: BODY, line: 0.4 });
  s.box({ x: 0.55, y: 0.75, w: 0.4, d: 0.5, z: 0.12 * P, h: 0.5 * P, mat: DARK, line: 0.3 });
  s.box({ x: 0.0, y: 0.45, w: 0.3, d: 1.1, z: 0.7 * P, h: 0.06 * P, mat: TRIM, line: 0.4 });
  // the driver: a helmet in the kart's colour over the seat
  s.cyl({ x: 0.75, y: 1, z: 0.7 * P, r: 0.2, r2: 0.2, h: 0.35 * P, mat: mat("#3a3a40", "#4a4a52") });
  s.cyl({ x: 0.75, y: 1, z: 1.05 * P, r: 0.26, r2: 0.14, h: 0.28 * P, mat: BODY });
  s.shadowDot(1, 1, 0.9, 0.3);
}
// the paddock's things, the car park's, the billboard on the corner (docs/plan/46: "the way in")
const K_WALNUT = mat("#4a3324", "#5a4030", "#4f372a", "#3b2a1e");
const K_GREEN = mat("#2f4a3b", "#3b5a48", "#34513f", "#264034");
const K_CREAM = mat("#f3ead6", "#fbf5e8", "#ece2cc", "#ddd2ba");
const K_RUST = mat("#b5562f", "#c5663f", "#ad5029", "#9a4524");
const K_AMBER = mat("#e8a33d", "#f0b350", "#e09a35", "#c98a2e");
const K_RED = mat("#a5281c", "#b8382a", "#9c2519", "#851f15");
const K_TYRE = mat("#1a1b1d", "#2a2b2d");
/** A piece of the shed's back wall: green boards, the post at its north end. */
function shedWall(s: Sketch) {
  s.box({ x: 0.2, y: 0, w: 0.15, d: 9.2, z: 0, h: 2.9 * P, mat: K_GREEN, line: 0.6 });
  s.box({ x: 0.15, y: 0, w: 0.25, d: 0.25, z: 0, h: 3.0 * P, mat: K_WALNUT, line: 0.4 });
  s.box({ x: 0.1, y: 0, w: 0.4, d: 9.2, z: 2.95 * P, h: 0.12 * P, mat: SNOW, line: 0.3 });
}
/** A piece of the shed's front: its post, the beam, the striped valance under it. */
function shedFront(s: Sketch) {
  s.box({ x: 0.85, y: 0, w: 0.2, d: 0.2, z: 0, h: 3.6 * P, mat: K_WALNUT, line: 0.4 });
  s.box({ x: 0.8, y: 0, w: 0.15, d: 9.2, z: 3.3 * P, h: 0.5 * P, mat: K_WALNUT, line: 0.5 }, (d) => {
    for (let y = 0; y < 9.2; y += 1) d.poly("e", fr("e", 0.95, y, y + 0.5, 3.0 * P, 3.3 * P), "#f3ead6");
  });
  s.box({ x: 0.8, y: 0, w: 0.15, d: 9.2, z: 3.0 * P, h: 0.3 * P, mat: K_RUST, line: 0.3 });
}
/** Race control: a green hut, its window lit to the east over the desk, a red roof under snow. */
function kartHut(s: Sketch) {
  s.box({ x: 0.4, y: 0.1, w: 3.2, d: 6.8, z: 0, h: 2.6 * P, mat: K_GREEN, line: 0.8 }, (d) => {
    d.poly("e", fr("e", 3.6, 0.7, 6.2, 1.25 * P, 2.25 * P), LIT, { glow: true });
  });
  s.box({ x: 0.2, y: -0.1, w: 3.6, d: 7.2, z: 2.6 * P, h: 0.5 * P, mat: mat("#6b2430", "#7d3040"), line: 0.6 });
  s.box({ x: 0.7, y: 0, w: 2.6, d: 7.0, z: 3.1 * P, h: 0.5 * P, mat: SNOW, puff: 4, line: 0.5 });
  s.box({ x: 3.65, y: 2, w: 0.08, d: 3.2, z: 2.75 * P, h: 0.6 * P, mat: K_WALNUT, line: 0.4 });
}
/** The lap records: a chalkboard on two posts, facing south. */
function lapBoard(s: Sketch) {
  for (const x of [0.2, 2.7]) s.box({ x, y: 0.4, w: 0.12, d: 0.12, z: 0, h: 2.5 * P, mat: K_WALNUT });
  s.box({ x: 0.1, y: 0.35, w: 2.8, d: 0.08, z: 0.8 * P, h: 1.5 * P, mat: mat("#24302a", "#2e3b34") }, (d) => {
    for (let i = 0; i < 4; i++)
      d.poly("s", fr("s", 0.43, 0.5, 2.5 - (i ? 0.6 : 0), (1.9 - i * 0.3) * P, (1.96 - i * 0.3) * P), "#e9e3d6");
  });
}
/** The board of the circuits (as tp/kart/park3d.ts circuits): walnut posts, a dark face with the
 *  layout raced drawn on it in cream (the fence's box, the start line in amber), a snowy cap (its
 *  face to the south, the way in). */
function circuitsBoard(s: Sketch, G: typeof GroundsModule) {
  for (const x of [0.2, 2.68]) s.box({ x, y: 0.4, w: 0.14, d: 0.14, z: 0, h: 2.7 * P, mat: K_WALNUT });
  s.box({ x: 0.15, y: 0.42, w: 2.7, d: 0.12, z: 0.66 * P, h: 1.78 * P, mat: K_WALNUT, line: 0.5 });
  s.box({ x: 0.22, y: 0.54, w: 2.56, d: 0.02, z: 0.74 * P, h: 1.62 * P, mat: mat("#1d2a23", "#26352c") }, (d) => {
    // the map: the park's box on the face (north up), the circuit, its line
    const F = G.KART_FENCE;
    const [u0, u1, h0, h1] = [0.32, 2.68, 0.86 * P, 2.24 * P];
    const k = Math.min((u1 - u0) / (F.x1 - F.x0), (h1 - h0) / P / (F.z1 - F.z0));
    const um = (u0 + u1) / 2 - ((F.x1 - F.x0) * k) / 2;
    const hm = (h0 + h1) / 2 + ((F.z1 - F.z0) * k * P) / 2;
    const at = (x: number, z: number): V3 => [um + (x - F.x0) * k, 0.56, hm - (z - F.z0) * k * P];
    const corners: V3[] = [at(F.x0, F.z0), at(F.x1, F.z0), at(F.x1, F.z1), at(F.x0, F.z1), at(F.x0, F.z0)];
    for (let i = 1; i < corners.length; i++) d.line("s", corners[i - 1], corners[i], "rgba(243,234,214,0.35)", 0.8);
    const t = G.kartTrackNow();
    let prev: V3 | null = null;
    for (let i = 0; i <= t.len; i += 8) {
      const p = t.pts[i % t.len];
      const q = at(p.x, p.z);
      if (prev) d.line("s", prev, q, "#f3ead6", 2.4);
      prev = q;
    }
    const s0 = t.pts[0];
    d.line("s", at(s0.x, s0.z - 4), at(s0.x, s0.z + 4), "#e8a33d", 2);
  });
  s.box({ x: 0.05, y: 0.3, w: 2.9, d: 0.42, z: 2.45 * P, h: 0.1 * P, mat: K_WALNUT });
  s.box({ x: 0.07, y: 0.32, w: 2.86, d: 0.38, z: 2.55 * P, h: 0.06 * P, mat: SNOW, line: 0.3 });
}
/** The fire barrel: a rusty drum, its fire. */
function fireBarrel(s: Sketch) {
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.34, h: 0.9 * P, mat: mat("#6b3a22", "#7a4a2a") });
  s.cyl({
    x: 0.5,
    y: 0.5,
    z: 0.9 * P,
    r: 0.22,
    r2: 0.04,
    h: 0.6 * P,
    mat: { c: "#ffb347", top: "#ffd27a", flat: true },
    glow: true,
  });
  s.shadowDot(0.5, 0.5, 0.4, 0.3);
}
/** A kart (as kartIso) at (ox, oy) in a footprint, `lift` metres up. */
function kartAt(s: Sketch, ox: number, oy: number, lift: number, c: string, t: string) {
  const BODY = mat(c, shade(c, 1.15), shade(c, 1.05), shade(c, 0.8));
  const TRIM = mat(t, shade(t, 1.1), t, shade(t, 0.82));
  const z = lift * P;
  for (const [x, y, w] of [
    [0.2, 0.25, 0.42],
    [0.2, 1.45, 0.42],
    [1.35, 0.3, 0.32],
    [1.35, 1.4, 0.32],
  ] as [number, number, number][])
    s.box({ x: ox + x, y: oy + y, w, d: 0.3, z, h: 0.4 * P, mat: K_TYRE, line: 0.4 });
  s.box({ x: ox + 0.15, y: oy + 0.55, w: 1.75, d: 0.9, z: z + 0.08 * P, h: 0.06 * P, mat: DARK });
  s.box({ x: ox + 0.55, y: oy + 0.35, w: 0.75, d: 0.25, z: z + 0.12 * P, h: 0.22 * P, mat: BODY, line: 0.4 });
  s.box({ x: ox + 0.55, y: oy + 1.4, w: 0.75, d: 0.25, z: z + 0.12 * P, h: 0.22 * P, mat: BODY, line: 0.4 });
  s.box({ x: ox + 1.45, y: oy + 0.7, w: 0.45, d: 0.6, z: z + 0.12 * P, h: 0.24 * P, mat: BODY, line: 0.4 });
  s.box({ x: ox + 0.55, y: oy + 0.75, w: 0.4, d: 0.5, z: z + 0.12 * P, h: 0.5 * P, mat: DARK, line: 0.3 });
  s.box({ x: ox, y: oy + 0.45, w: 0.3, d: 1.1, z: z + 0.7 * P, h: 0.06 * P, mat: TRIM, line: 0.4 });
}
/** A kart up on its red stand, a wheel off beside it. */
function kartStand3(s: Sketch) {
  s.box({ x: 0.6, y: 0.5, w: 1.8, d: 1, z: 0, h: 0.55 * P, mat: K_RED, line: 0.5 });
  kartAt(s, 0.5, 0, 0.55, "#3d4a5c", "#e8a33d");
  s.cyl({ x: 0.3, y: 1.6, z: 0, r: 0.15, h: 0.3 * P, mat: K_TYRE });
}
/** The tool chest: red drawers, on castors. */
function toolChest(s: Sketch) {
  s.box({ x: 0.1, y: 0.22, w: 0.8, d: 0.56, z: 0.08 * P, h: 0.95 * P, mat: K_RED, line: 0.5 }, (d) => {
    for (let i = 0; i < 4; i++)
      d.poly("s", fr("s", 0.78, 0.2, 0.8, (0.3 + i * 0.2) * P, (0.33 + i * 0.2) * P), "#c9ccd1");
  });
}
/** Spare tyres, stacked, snow on top. */
function tyreStack(s: Sketch) {
  for (let i = 0; i < 4; i++) s.cyl({ x: 0.5, y: 0.5, z: i * 0.21 * P, r: 0.38, h: 0.21 * P, mat: K_TYRE, line: 0.4 });
  s.cyl({ x: 0.5, y: 0.5, z: 0.84 * P, r: 0.3, h: 0.05 * P, mat: SNOW, line: 0.3 });
}
/** The podium: second, first, third, west to east, facing south; the backdrop behind. */
function kartPodium(s: Sketch) {
  s.box({ x: 0.2, y: 0.1, w: 7.6, d: 0.1, z: 1.4 * P, h: 2.4 * P, mat: K_WALNUT, line: 0.6 }, (d) => {
    d.poly("s", fr("s", 0.2, 0.4, 7.4, 3.2 * P, 3.6 * P), "#f3ead6");
    d.poly("s", fr("s", 0.2, 0.4, 7.4, 1.5 * P, 1.75 * P), "#f3ead6");
  });
  for (const x of [0.1, 7.7]) s.box({ x, y: 0.05, w: 0.2, d: 0.2, z: 0, h: 4 * P, mat: K_WALNUT });
  for (const [x, h, m] of [
    [1.8, 0.7, mat("#c9ccd1", "#e2e5e9")],
    [2.9, 1.05, K_AMBER],
    [4.0, 0.45, mat("#c07a42", "#d08a52")],
  ] as [number, number, Mat][])
    s.box({ x: x - 0.9 + 0.1, y: 1.0, w: 1.1, d: 1.6, z: 0, h: h * P, mat: K_CREAM, line: 0.6 }, (d) =>
      d.poly("s", fr("s", 2.6, x - 0.55, x - 0.05, h * 0.3 * P, h * 0.75 * P), m.c),
    );
}
/** The cocoa cart: green, on two wheels, a striped awning, its board. */
function cocoaCart(s: Sketch) {
  s.box({ x: 0.4, y: 0.5, w: 2.2, d: 1.2, z: 0.35 * P, h: 0.9 * P, mat: K_GREEN, line: 0.6 });
  s.cyl({ x: 1.0, y: 1.75, z: 0, r: 0.42, h: 0.1 * P, mat: K_WALNUT });
  for (const x of [0.5, 2.5]) s.box({ x, y: 0.55, w: 0.06, d: 0.06, z: 1.25 * P, h: 1.2 * P, mat: STEEL });
  s.box({ x: 0.2, y: 0.3, w: 2.6, d: 1.6, z: 2.4 * P, h: 0.1 * P, mat: K_RUST, line: 0.5 }, (d) => {
    for (let x = 0.2; x < 2.8; x += 0.5)
      d.poly(
        "t",
        [
          [x, 0.3, 2.5 * P],
          [x + 0.25, 0.3, 2.5 * P],
          [x + 0.25, 1.9, 2.5 * P],
          [x, 1.9, 2.5 * P],
        ],
        "#f3ead6",
      );
  });
  s.box({ x: 2.75, y: 0.7, w: 0.05, d: 0.8, z: 1.9 * P, h: 0.5 * P, mat: K_CREAM, line: 0.4 });
}
/** Kart No. 1 on its walnut plinth in the turning circle, facing the way in. */
function kartPlinth(s: Sketch) {
  s.box({ x: 0.2, y: 0.2, w: 2.6, d: 1.6, z: 0, h: 1.0 * P, mat: K_WALNUT, line: 0.6 });
  kartAt(s, 0.5, 0, 1.0, "#b5562f", "#f3ead6");
  s.box({ x: 2.9, y: 0.1, w: 0.06, d: 0.06, z: 0, h: 5.5 * P, mat: STEEL });
}
/** The billboard: its face to the road (south), the arrow's amber panel at its east end, the kart
 *  and the name on the dusk; its posts and lamps. */
function billboard(s: Sketch) {
  for (const x of [1.5, 7.5]) s.box({ x, y: 0.6, w: 0.3, d: 0.3, z: 0, h: 6.4 * P, mat: STEEL });
  s.box({ x: 0.3, y: 1.0, w: 8.4, d: 0.15, z: 3.0 * P, h: 3.4 * P, mat: mat("#3a2638", "#4a3348"), line: 0.8 }, (d) => {
    d.poly("s", fr("s", 1.15, 6.7, 8.5, 3.15 * P, 6.25 * P), "#e8a33d");
    d.poly("s", fr("s", 1.15, 0.6, 5.2, 5.1 * P, 5.7 * P), "#f3ead6");
    d.poly("s", fr("s", 1.15, 0.6, 3.6, 4.7 * P, 4.85 * P), "#f6d9a8");
    d.poly("s", fr("s", 1.15, 3.6, 6.0, 3.6 * P, 4.1 * P), "#b5562f");
    d.poly("s", fr("s", 1.15, 0.5, 6.7, 3.15 * P, 3.4 * P), "#e9e3d6");
    d.poly("s", fr("s", 1.15, 7.3, 7.9, 4.5 * P, 5.5 * P), "#4a3324");
  });
  s.box({ x: 0.3, y: 0.9, w: 8.4, d: 0.3, z: 6.4 * P, h: 0.12 * P, mat: SNOW, line: 0.4 });
  for (const x of [2.2, 6.6])
    s.box({
      x,
      y: 0.2,
      w: 0.5,
      d: 0.3,
      z: 6.5 * P,
      h: 0.15 * P,
      mat: { c: LIT, top: "#fff2d0", flat: true },
      glow: true,
    });
}
/** The fingerpost: KART PARK, pointing up the road in. */
function fingerpost(s: Sketch) {
  s.box({ x: 0.43, y: 1.6, w: 0.14, d: 0.14, z: 0, h: 2.7 * P, mat: mat("#6e5a44", "#7d6450") });
  s.box({ x: 0.47, y: 0.0, w: 0.06, d: 1.9, z: 2.05 * P, h: 0.42 * P, mat: K_WALNUT, line: 0.5 }, (d) =>
    d.poly("e", fr("e", 0.53, 0.3, 1.6, 2.15 * P, 2.35 * P), "#f3ead6"),
  );
}
/** The car park's sign: a blue P over KART PARK. */
function parkingSign(s: Sketch) {
  s.box({ x: 0.46, y: 0.46, w: 0.08, d: 0.08, z: 0, h: 3 * P, mat: STEEL });
  s.box({ x: 0.5, y: 0.1, w: 0.06, d: 0.8, z: 2.3 * P, h: 0.8 * P, mat: mat("#2d5fa8", "#3a6cb8"), line: 0.5 }, (d) =>
    d.poly("e", fr("e", 0.56, 0.35, 0.55, 2.45 * P, 2.95 * P), "#f3f0e8"),
  );
  s.box({ x: 0.5, y: 0.1, w: 0.06, d: 0.8, z: 1.8 * P, h: 0.4 * P, mat: K_WALNUT, line: 0.4 });
}
/** The lobby's desk: a walnut counter, its VFD strip on the east face. */
function kartDesk(s: Sketch) {
  s.box({
    x: 0,
    y: 0.2,
    w: 1,
    d: 3.6,
    z: 0,
    h: 1.05 * P,
    mat: mat("#5a3a28", "#3b2414", "#5a3a28", "#4a2e1f"),
    line: 0.5,
  });
  s.box({
    x: 0.98,
    y: 0.4,
    w: 0.05,
    d: 3.2,
    z: 0.5 * P,
    h: 0.5 * P,
    mat: { c: "#ffb347", top: "#ffb347", flat: true },
    glow: true,
  });
}
