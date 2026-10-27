// The layouts' own checks (docs/plan/47-the-track-changer.md): what a layout must keep clear of, as
// numbers — the tests' and the drawing's. Pure.
import { KART_FENCE, KART_PARK } from "./land.ts";
import {
  KART_BOWL,
  KART_PADDOCK,
  KART_STANDS,
  KART_TOWER,
  type KartLayoutKey,
  kartLayout,
  kartTrack,
  TRACK_W,
  type Track,
} from "./park.ts";

export interface LayoutReport {
  key: KartLayoutKey;
  reverse: boolean;
  len: number;
  /** what's wrong, by name; empty: none */
  faults: string[];
  /** the tightest turn's radius (metres, over 5 m) */
  tightest: number;
  /** the nearest the edge of the road comes to the fence, the bowl, the stands, the paddock */
  margins: Record<string, number>;
}

const H = TRACK_W / 2;
const rectDist = (x: number, z: number, x0: number, z0: number, x1: number, z1: number) => {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [c, d] = [Math.min(z0, z1), Math.max(z0, z1)];
  const dx = Math.max(a - x, 0, x - b);
  const dz = Math.max(c - z, 0, z - d);
  return Math.hypot(dx, dz);
};

export function checkLayout(key: KartLayoutKey, reverse = false): LayoutReport {
  const t = kartTrack(key, reverse);
  const lay = kartLayout(key);
  const deck = kartTrack();
  const ramp = deck.pts.filter((p) => p.y > 0.3);
  // (its walls: where the embankment stands up off the snow — its feet are near flat)
  const wall = deck.pts.filter((p) => p.y > 0.8);
  const onRoad = (x: number, z: number) => ramp.some((r) => Math.hypot(x - r.x, z - r.z) < 1.5);
  const faults: string[] = [];
  const m = { fence: 1e9, bowl: 1e9, stands: 1e9, tower: 1e9, paddock: 1e9, ramps: 1e9, self: 1e9 };
  const F = KART_FENCE;
  for (const p of t.pts) {
    m.fence = Math.min(m.fence, p.x - F.x0, F.x1 - p.x, p.z - F.z0, F.z1 - p.z);
    m.bowl = Math.min(m.bowl, Math.hypot(p.x - KART_BOWL.x, p.z - KART_BOWL.z) - KART_BOWL.r - KART_BOWL.rim);
    for (const st of KART_STANDS)
      m.stands = Math.min(m.stands, rectDist(p.x, p.z, st.x0, st.z - 0.05, st.x1, st.z + st.rows * 1.2 + 0.4));
    m.tower = Math.min(m.tower, Math.hypot(p.x - KART_TOWER.x, p.z - KART_TOWER.z) - 1.5);
    const D = KART_PADDOCK;
    m.paddock = Math.min(m.paddock, rectDist(p.x, p.z, D.x0, D.z0, D.x1, D.z1));
    // the bridge's ramps (there only for a layout over it): kept off unless on them (its own road,
    // at its height) or under its span
    const onDeck = p.y > 0.3 || onRoad(p.x, p.z);
    if (lay.bridge === "both" && !onDeck) {
      const underSpan = !Number.isNaN(deck.cross.x) && Math.hypot(p.x - deck.cross.x, p.z - deck.cross.z) < 9;
      if (!underSpan)
        for (const r of wall) m.ramps = Math.min(m.ramps, Math.hypot(p.x - r.x, p.z - r.z) - (r.y > 1 ? 7.5 : 6.5));
    }
  }
  // on the bridge: on its road
  if (lay.bridge === "both") {
    let off = 0;
    for (const p of t.pts.filter((q) => q.y > 0.3))
      off = Math.max(off, Math.min(...ramp.map((r) => Math.hypot(p.x - r.x, p.z - r.z))));
    if (off > 1.2) faults.push(`off the bridge's road by ${off.toFixed(1)} m`);
  }
  // itself: another part of the lap no nearer than a road's width and a margin (but over it)
  const n = t.len;
  for (let i = 0; i < n; i += 2)
    for (let j = i + 40; j < n; j += 2) {
      if (n - (j - i) < 40) continue;
      const a = t.pts[i];
      const b = t.pts[j];
      if (Math.abs(a.y - b.y) > 4) continue;
      m.self = Math.min(m.self, Math.hypot(a.x - b.x, a.z - b.z) - TRACK_W);
    }
  // the tightest turn, over 5 m
  let k = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let d = -2; d <= 2; d++) sum += t.pts[(i + d + n) % n].k;
    k = Math.max(k, Math.abs(sum / 5));
  }
  const tightest = 1 / Math.max(k, 1e-6);
  // the start straight: the Figure Eight's — the line, the grid and the gantry within a metre of it
  // (12 m either side), its ends within three
  let line = 0;
  let straight = 0;
  const q = deck.pts.slice(-40).concat(deck.pts.slice(0, 40));
  for (let d = -28; d <= 28; d++) {
    const p = t.pts[(d + n) % n];
    const off = Math.min(...q.map((r) => Math.hypot(p.x - r.x, p.z - r.z)));
    if (Math.abs(d) <= 12) line = Math.max(line, off);
    straight = Math.max(straight, off);
  }
  const want: [string, number, number][] = [
    ["fence", m.fence, H + 2],
    ["bowl", m.bowl, H + 1],
    ["stands", m.stands, H + 1],
    ["tower", m.tower, H + 1],
    ["paddock", m.paddock, H + 1],
    ["ramps", m.ramps, 0],
    ["self", m.self, 2],
  ];
  for (const [name, got, need] of want) if (got < need) faults.push(`${name}: ${got.toFixed(1)} < ${need}`);
  if (tightest < 9) faults.push(`a turn of ${tightest.toFixed(1)} m`);
  if (line > 1) faults.push(`off the start line by ${line.toFixed(1)} m`);
  if (straight > 3) faults.push(`off the start straight by ${straight.toFixed(1)} m`);
  if (t.jumps.length === 0) faults.push("no jump");
  const margins = Object.fromEntries(Object.entries(m).map(([k2, v]) => [k2, Math.round(v * 10) / 10]));
  return { key, reverse, len: t.len, faults, tightest: Math.round(tightest * 10) / 10, margins };
}

/** A quick plan of a layout as SVG (the park's outline, the bridge, the road), for the scratch. */
export function layoutSvg(t: Track): string {
  const F = KART_FENCE;
  const pad = 10;
  const W = F.x1 - F.x0 + pad * 2;
  const Hh = F.z1 - F.z0 + pad * 2;
  const X = (x: number) => (x - F.x0 + pad).toFixed(1);
  const Z = (z: number) => (z - F.z0 + pad).toFixed(1);
  const path = (pts: { x: number; z: number }[], close = true) =>
    `M${pts.map((p) => `${X(p.x)} ${Z(p.z)}`).join(" L")}${close ? " Z" : ""}`;
  const deck = kartTrack();
  const ramp = deck.pts.filter((p) => p.y > 0.3);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 ${-(W - Hh) / 2} ${W} ${W}">`,
  );
  out.push(`<rect width="${W}" height="${Hh}" fill="#eef1f3"/>`);
  out.push(
    `<rect x="${X(F.x0)}" y="${Z(F.z0)}" width="${F.x1 - F.x0}" height="${F.z1 - F.z0}" fill="#f8f9fa" stroke="#6a4a34" stroke-width="1"/>`,
  );
  out.push(
    `<circle cx="${X(KART_BOWL.x)}" cy="${Z(KART_BOWL.z)}" r="${KART_BOWL.r + KART_BOWL.rim}" fill="#dfe6ea" stroke="#9aa"/>`,
  );
  for (const st of KART_STANDS)
    out.push(
      `<rect x="${X(Math.min(st.x0, st.x1))}" y="${Z(st.z)}" width="${Math.abs(st.x1 - st.x0)}" height="${st.rows * 1.2}" fill="#2f4a3b"/>`,
    );
  const D = KART_PADDOCK;
  out.push(
    `<rect x="${X(Math.min(D.x0, D.x1))}" y="${Z(D.z0)}" width="${Math.abs(D.x1 - D.x0)}" height="${D.z1 - D.z0}" fill="#c9ccce"/>`,
  );
  out.push(`<path d="${path(t.pts)}" fill="none" stroke="#3d4248" stroke-width="${TRACK_W}" stroke-linejoin="round"/>`);
  if (kartLayout(t.key).bridge === "both")
    out.push(
      `<path d="${path(ramp, false)}" fill="none" stroke="#b5562f" stroke-width="${TRACK_W + 3}" stroke-opacity="0.55"/>`,
    );
  for (const p of t.pts.filter((q) => q.y > 0.3))
    out.push(`<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="2" fill="#e8a33d"/>`);
  const s0 = t.pts[0];
  out.push(`<circle cx="${X(s0.x)}" cy="${Z(s0.z)}" r="4" fill="#fff" stroke="#000"/>`);
  for (let i = 20; i < t.len; i += 60) {
    const p = t.pts[i];
    const a = p.a;
    out.push(
      `<path d="M${X(p.x)} ${Z(p.z)} l${(Math.cos(a + 2.6) * 6).toFixed(1)} ${(Math.sin(a + 2.6) * 6).toFixed(1)} M${X(p.x)} ${Z(p.z)} l${(Math.cos(a - 2.6) * 6).toFixed(1)} ${(Math.sin(a - 2.6) * 6).toFixed(1)}" stroke="#fff" stroke-width="1.5"/>`,
    );
  }
  for (const j of t.jumps) {
    const p = t.pts[j.s];
    out.push(`<rect x="${Number(X(p.x)) - 3}" y="${Number(Z(p.z)) - 3}" width="6" height="6" fill="#4a7ab5"/>`);
  }
  out.push(`<circle cx="${X(KART_PARK.x)}" cy="${Z(KART_PARK.z)}" r="1.5" fill="#000"/>`);
  out.push("</svg>");
  return out.join("\n");
}
