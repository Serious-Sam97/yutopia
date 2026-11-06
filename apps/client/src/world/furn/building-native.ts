import { CAR_COLOURS, flightParts, flightRise, type WorldObjectDef } from "@yutopia/shared";
import type { Out } from "../tp/kit3d";
import { box, cyl, type Model } from "./kit";

// The building's things on the kit (docs/plan/72-the-3d-core.md, phase 12: signed off 2026-11-06,
// in place of the item art's sketches and the old box art): the staircase (build mode's ghost and
// the catalog's picture: the world's own is tp/stairs3d.ts), an elevator's stop (likewise:
// tp/lift3d.ts), a car as it stands before the cars' own models are loaded (car/sedan.ts), a
// flight of steps, a bay's name board. Each the old drawing's own boxes where they were (its
// heights turned to metres), in the model's frame (x across the footprint, z down
// it, y up), flat facets the world inks.

const STOREY = 3.5;
const HALF = STOREY / 2;
const N = 9; // steps a flight

/** A box (across, down, up: m — from x, y, z, w by d by h) into `m`. */
function bx(
  m: Model,
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  h: number,
  color: number,
  o: { glow?: boolean } = {},
) {
  if (w <= 0 || d <= 0 || h <= 0) return;
  m.add(box([w, h, d]), color, { at: [x + w / 2, z + h / 2, y + d / 2], glow: o.glow });
}

const TREAD = 0x8d8a84;
const CONCRETE = 0xb9b6ae;
const NOSING = 0x2b2d2f;
const RAIL = 0x2f3336;
const STEEL = 0x9aa1a6;
const STEEL_DK = 0x6c7378;
const CAR_FLOOR = 0x3a3633;
const LIT = 0xffb35c;
const DARK = 0x2a2016;
const GRAPHITE = 0x2b2a26;
const WALNUT = 0x5b3a26;
const ALUMINIUM = 0xb9b2a3;
const RED = 0xc4402b;

/** The staircase: a switchback in its 4 × 7 well — up the east half, the half landing across the far
 *  end, back up the west half; amber-less dark nosings, the spine between the flights, a rail up the
 *  outer side of each. */
export function stairsModel(m: Model) {
  const run = 3 / N;
  for (let i = 0; i < N; i++) {
    const top = (HALF * (i + 1)) / N;
    const v = 2 + run * i;
    bx(m, 2.04, v, 1.9, run + 0.01, 0, top, TREAD);
    bx(m, 2.04, v, 1.9, 0.05, top, 0.0306, NOSING);
  }
  bx(m, 0.04, 5, 3.92, 1.94, 0, HALF, CONCRETE);
  bx(m, 0.04, 5, 3.92, 0.05, HALF, 0.0306, NOSING);
  for (let i = 0; i < N; i++) {
    const top = HALF + (HALF * (i + 1)) / N;
    const v = 5 - run * (i + 1);
    bx(m, 0.06, v, 1.9, run + 0.01, top - 0.6635, 0.6635, TREAD);
    bx(m, 0.06, v + run - 0.05, 1.9, 0.05, top, 0.0306, NOSING);
  }
  bx(m, 1.96, 2, 0.08, 3, 0, 0.3573, CONCRETE);
  for (let i = 0; i <= N; i += 3) {
    const a = (HALF * Math.max(1, i)) / N;
    bx(m, 3.88, 2 + run * i, 0.06, 0.06, a, 0.9187, RAIL);
    const b = HALF + (HALF * Math.max(1, i)) / N;
    bx(m, 0.08, 5 - run * i - 0.06, 0.06, 0.06, b, 0.9187, RAIL);
  }
  // (the bars: a rod along each flight's slope, not the drawing's stepped bars)
  const slope = (x: number, y0: number, z0: number, y1: number, z1: number) => {
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dy, dz);
    m.add(box([0.06, 0.05, len]), RAIL, {
      at: [x, (z0 + z1) / 2, (y0 + y1) / 2],
      rot: [-Math.atan2(dz, dy), 0, 0],
    });
  };
  slope(3.91, 2, HALF / N + 0.9187, 5, HALF + 0.9187);
  slope(0.11, 5, HALF + HALF / N + 0.9187, 2, STOREY + 0.9187);
}

/** An elevator's stop (2 × 2, its doors on the north edge): the car's floor (or the dark shaft), the
 *  car cut away low with its rail and panel, the steel portal, the leaves apart by `anim`, the
 *  display over them lit while the car's here or coming. */
export function elevatorModel(m: Model, props: Record<string, unknown>) {
  const k = Math.max(0, Math.min(1, Number(props.anim ?? (props.door === "open" ? 1 : 0))));
  const here = props.here !== false;
  const H = 2.1945; // the doors (m)
  bx(m, 0.06, 0.14, 1.88, 1.8, 0, 0.051, here ? CAR_FLOOR : GRAPHITE);
  if (here) {
    for (const [x, y, w, d] of [
      [0.06, 0.14, 0.06, 1.8],
      [1.88, 0.14, 0.06, 1.8],
      [0.06, 1.88, 1.88, 0.06],
    ])
      bx(m, x, y, w, d, 0, 0.3573, STEEL);
    bx(m, 0.14, 1.8, 1.72, 0.04, 0.3573, 0.051, WALNUT);
    bx(m, 1.62, 0.16, 0.2, 0.03, 0.7655, 0.8676, STEEL);
    bx(m, 1.68, 0.13, 0.08, 0.02, 1.378, 0.1276, LIT, { glow: true });
  }
  bx(m, 0.36, 0, 0.08, 0.14, 0, H + 0.1531, STEEL);
  bx(m, 1.56, 0, 0.08, 0.14, 0, H + 0.1531, STEEL);
  bx(m, 0.44, 0, 1.12, 0.14, H, 0.1531, STEEL);
  const w = 0.56 * (1 - k);
  if (w > 0.02) {
    bx(m, 0.44, 0.03, w, 0.06, 0, H, STEEL_DK);
    bx(m, 1.56 - w, 0.03, w, 0.06, 0, H, STEEL_DK);
  }
  const lit = (here && k > 0) || (props.dir !== undefined && props.dir !== 0);
  bx(m, 0.72, 0.14, 0.56, 0.04, H + 0.2041, 0.2297, lit ? LIT : DARK, { glow: lit });
}

/** What makes one elevator stop look unlike another. */
export const elevatorLook = (o: WorldObjectDef) => {
  const p = o.props ?? {};
  return `${Number(p.anim ?? (p.door === "open" ? 1 : 0)).toFixed(2)}|${p.here !== false}|${p.dir ?? ""}`;
};

/** A car parked in its bay (5 × 2, its nose to −x) — or a tracked one (a snowmobile, a snowcat), a
 *  plough truck, a tractor, a toboggan — its paint `variant` (shared CAR_COLOURS) or `color`, a
 *  taxi's or a police car's livery and light, snow on it. */
export function carModel(m: Model, props: Record<string, unknown>, pick: number) {
  const v = Number.isInteger(props.variant) ? (props.variant as number) : pick;
  const role = props.role;
  const body =
    role === "taxi"
      ? 0xe2b42a
      : typeof props.color === "string"
        ? Number.parseInt(props.color.slice(1), 16)
        : CAR_COLOURS[v % CAR_COLOURS.length];
  const pickup = props.model === "pickup";
  const wagon = !!props.wagon && !pickup;
  const snowy = props.snowy !== 0 && props.snowy !== false;
  const ox = Math.max(-0.4, Math.min(0.4, Number(props.dx) || 0));
  const oy = Math.max(-0.4, Math.min(0.4, Number(props.dz) || 0));
  const b = (x: number, y: number, w: number, d: number, z: number, h: number, c: number, glow = false) =>
    bx(m, x + ox, y + oy, w, d, z, h, c, { glow });
  const TYRE = 0x1c1c1c;
  const GLASS = 0x2a3036;
  const SNOW = 0xeef2f4;
  const SEAT = 0x2a221e;
  const LAMP = 0xfff4cc;
  const BEACON = 0xff9a2a;
  // (a wheel: a short drum across the car, not the drawing's block)
  const wheel = (x: number, y: number, r: number, wd: number) =>
    m.add(cyl(r, r, wd, 14), TYRE, { at: [x + ox, r, y + oy - wd / 2], rot: [Math.PI / 2, 0, 0] });
  if (props.model === "snowmobile") {
    for (const y of [0.42, 1.42]) b(0.0, y, 1.35, 0.14, 0, 0.051, TYRE);
    b(1.4, 0.75, 1.55, 0.5, 0, 0.3062, TYRE);
    b(0.05, 0.55, 1.1, 0.9, 0.2552, 0.5104, body);
    b(1.0, 0.65, 0.08, 0.7, 0.7655, 0.2552, GLASS);
    b(1.1, 0.7, 1.85, 0.6, 0.3828, 0.1531, body);
    b(1.3, 0.76, 1.15, 0.48, 0.5359, 0.2041, SEAT);
    b(0.0, 0.85, 0.05, 0.3, 0.5614, 0.1021, LAMP, true);
    return;
  }
  if (props.model === "snowcat") {
    for (const y of [-0.2, 1.6]) b(0.35, y, 3.9, 0.6, 0, 0.5614, TYRE);
    b(-0.25, -0.3, 0.12, 2.6, 0.051, 0.5614, body);
    b(0.3, -0.15, 4.0, 2.3, 0.5614, 0.1786, body);
    b(0.7, 0.05, 2.8, 1.9, 0.74, 0.8166, GLASS);
    b(0.64, 0.0, 2.92, 2.0, 1.5566, 0.1021, body);
    b(3.5, 0.2, 0.8, 1.6, 0.74, 0.3317, body);
    b(2.0, 0.9, 0.2, 0.2, 1.6587, 0.1021, BEACON, true);
    if (snowy) b(0.75, 0.1, 2.7, 1.8, 1.6587, 0.051, SNOW);
    return;
  }
  if (props.model === "ploughtruck") {
    for (const x of [1.4, 5.0]) for (const y of [-0.25, 1.95]) b(x, y, 0.9, 0.3, 0, 0.6635, TYRE);
    b(-0.45, -0.5, 0.18, 2.9, 0.051, 0.6124, 0xe0b12a);
    b(0.3, -0.2, 6.0, 2.3, 0.3573, 0.3062, body);
    b(0.3, -0.15, 1.3, 2.2, 0.6635, 0.4593, body);
    b(1.6, -0.2, 1.5, 2.3, 0.6635, 0.5614, GLASS);
    b(1.55, -0.25, 1.6, 2.4, 1.2249, 0.1276, body);
    b(3.3, -0.15, 2.9, 2.2, 0.6635, 0.7145, 0x8d8a84);
    b(2.3, 0.85, 0.24, 0.24, 1.3525, 0.1276, BEACON, true);
    if (snowy) b(3.4, -0.05, 2.7, 2.0, 1.378, 0.051, SNOW);
    return;
  }
  if (props.model === "tractor") {
    for (const y of [-0.2, 1.65]) b(2.2, y, 1.5, 0.45, 0, 0.8676, TYRE);
    for (const y of [0.15, 1.45]) b(0.2, y, 0.8, 0.3, 0, 0.4593, TYRE);
    b(0.05, 0.55, 1.75, 0.8, 0.4083, 0.4593, body);
    for (const y of [-0.25, 1.6]) b(2.05, y, 1.4, 0.55, 0.8676, 0.0766, body);
    b(2.5, 0.65, 0.5, 0.6, 0.6635, 0.4083, SEAT);
    b(2.95, 0.0, 0.08, 1.8, 0.6635, 1.0207, 0x3a3d40);
    b(1.0, 1.1, 0.1, 0.1, 0.8676, 0.5614, ALUMINIUM);
    if (snowy) b(0.1, 0.6, 1.6, 0.7, 0.8676, 0.051, SNOW);
    return;
  }
  if (props.model === "toboggan") {
    b(0.3, 0.0, 1.5, 0.6, 0.0255, 0.051, body);
    b(0.05, 0.0, 0.25, 0.6, 0.0766, 0.2552, body);
    for (const y of [-0.02, 0.6]) b(0.1, y, 1.65, 0.03, 0.1021, 0.0255, 0xc8b48a);
    if (snowy) b(0.5, 0.05, 1.1, 0.5, 0.0766, 0.0255, SNOW);
    return;
  }
  for (const x of [1.06, 3.91]) for (const y of [0.16, 1.84]) wheel(x, y, 0.288, 0.2);
  b(0.12, 0.14, 4.76, 1.72, 0.2041, 0.5869, body);
  b(0, 0.2, 0.14, 1.6, 0.2552, 0.1786, ALUMINIUM);
  b(4.86, 0.2, 0.14, 1.6, 0.2552, 0.1786, ALUMINIUM);
  for (const y of [0.3, 1.4]) {
    b(0.04, y, 0.06, 0.3, 0.5359, 0.1021, LAMP, true);
    b(4.92, y, 0.05, 0.3, 0.5359, 0.1021, RED);
  }
  if (role === "police") b(1.6, 0.11, 2.2, 1.78, 0.3062, 0.4338, 0xecebe6);
  const c0 = 1.55;
  const c1 = pickup ? 2.95 : wagon ? 4.7 : 3.95;
  b(c0, 0.3, c1 - c0, 1.4, 0.7911, 0.5104, GLASS);
  b(c0 + 0.12, 0.34, c1 - c0 - 0.2, 1.32, 1.3014, 0.1021, body);
  if (pickup) {
    b(c1 + 0.1, 0.24, 4.7 - c1 - 0.1, 1.52, 0.7911, 0.0255, 0x2a2d30);
    for (const y of [0.14, 1.72]) b(c1 + 0.05, y, 4.8 - c1, 0.14, 0.7911, 0.1786, body);
    b(4.74, 0.14, 0.12, 1.72, 0.7911, 0.1786, body);
  }
  const mid = (c0 + c1) / 2;
  if (role === "taxi") b(mid - 0.18, 0.62, 0.36, 0.76, 1.4035, 0.1786, 0xf6dc8c, true);
  if (role === "police") {
    b(mid - 0.1, 0.25, 0.2, 0.7, 1.4035, 0.1276, RED, true);
    b(mid - 0.1, 0.95, 0.2, 0.7, 1.4035, 0.1276, 0x2a52c8, true);
  }
  if (snowy) {
    if (!role) b(c0 + 0.2, 0.42, c1 - c0 - 0.4, 1.16, 1.4035, 0.0766, SNOW);
    b(0.25, 0.3, 1.1, 1.4, 0.7911, 0.051, SNOW);
    if (!wagon && !pickup) b(c1 + 0.15, 0.3, 4.75 - c1 - 0.2, 1.4, 0.7911, 0.051, SNOW);
  }
}

/** What makes one car look unlike another. */
export const carLook = (o: WorldObjectDef) => {
  const p = o.props ?? {};
  return JSON.stringify([p.variant, p.color, p.role, p.model, p.wagon, p.snowy, p.dx, p.dz]);
};

/** A flight of steps up to a mezzanine (plan 72 phase 11.8): its steps as Jolt has them (shared
 *  flightParts), walnut, their treads a shade lighter. */
export function flightModel(m: Model, props: Record<string, unknown>) {
  for (const b of flightParts(flightRise({ props }))) {
    const [w, h, d] = [b.u1 - b.u0, b.y1 - b.y0, b.v1 - b.v0];
    if (w <= 0 || h <= 0 || d <= 0) continue;
    m.add(box([w, h, d]), WALNUT, { at: [b.u0 + w / 2, b.y0 + h / 2, b.v0 + d / 2] });
    m.add(box([w, 0.012, d]), 0x8a5a3c, { at: [b.u0 + w / 2, b.y1 + 0.006, b.v0 + d / 2] });
  }
}

// ── someone's own bay: the name board (docs/plan/43-the-spot.md, shared spot.ts) ──
const PINE = 0xc49660;
const POST = 0x6e5a44;
const SNOWCAP = 0xeef2f5;
const TAG = 0x1f3554;

/** The board's post, plank(s), snow caps and the bay's tag plate (its name and number painted on by
 *  `bayBoardWords`), at its post's spot `ox`/`oy` in its tile, facing along x by `face`. */
export function bayBoardModel(m: Model, p: Record<string, unknown>) {
  const ox = Number(p.ox ?? 0.5);
  const oy = Number(p.oy ?? 0.5);
  const f = Number(p.face) < 0 ? -1 : 1;
  const half = !!p.half;
  const span = (a: number, b: number) => [Math.min(a, b), Math.abs(b - a)] as const;
  const [px, pw] = half ? span(ox, ox + f * 0.045) : span(ox - 0.045, ox + 0.045);
  bx(m, px, oy - 0.045, pw, 0.09, 0, 1.9, POST);
  bx(m, px, oy - 0.055, pw, 0.11, 1.9, 0.051, SNOWCAP);
  for (const side of p.back ? [f, -f] : [f]) {
    const [lx, lw] = span(ox + side * 0.045, ox + side * 0.075);
    bx(m, lx, oy - 0.55, lw, 1.1, 1.45, 0.36, PINE);
    bx(m, lx - 0.012, oy - 0.56, lw + 0.024, 1.12, 1.81, 0.0459, SNOWCAP);
  }
  const [tx, tw] = span(ox + f * 0.045, ox + f * 0.052);
  bx(m, tx, oy - 0.13, tw, 0.26, 1.2, 0.14, TAG);
}
export const bayBoardLook = (o: WorldObjectDef) => {
  const p = o.props ?? {};
  return JSON.stringify([p.ox, p.oy, p.face, p.half, p.back]);
};

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function nameSvg(name: string): string {
  const text = esc(name.toUpperCase());
  const size = Math.round(Math.min(96, 470 / Math.max(1, name.length * 0.68)));
  const tx = `<text x="256" y="${96 + size * 0.02}" text-anchor="middle" dominant-baseline="middle" font-family="Rockwell, 'Roboto Slab', Georgia, serif" font-weight="700" font-size="${size}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="168" viewBox="0 0 512 168"><defs><filter id="b" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter></defs>${tx} fill="#6b3a18" opacity="0.8" filter="url(#b)">${text}</text>${tx} fill="#2a170c">${text}</text><circle cx="22" cy="84" r="7" fill="#4a3a2a"/><circle cx="490" cy="84" r="7" fill="#4a3a2a"/></svg>`;
}
function tagSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80"><rect x="0" y="0" width="160" height="80" rx="12" fill="#e9edf1"/><rect x="6" y="6" width="148" height="68" rx="9" fill="#1f3554"/><text x="80" y="42" text-anchor="middle" dominant-baseline="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="700" font-size="46" fill="#e9edf1">${esc(label)}</text></svg>`;
}

/** The board's words — the owner's first name on each plank, the bay's number on the tag — painted
 *  on as decals in `out` (the floor's frame: tiles across and down, m up), the board at its tile. */
export function bayBoardWords(out: Out, o: WorldObjectDef) {
  const p = o.props ?? {};
  const ox = o.x + Number(p.ox ?? 0.5);
  const oy = o.y + Number(p.oy ?? 0.5);
  const f = Number(p.face) < 0 ? -1 : 1;
  const name = String(p.ownerName ?? "").split(" ")[0] || "?";
  const bay = String(p.bay ?? "").toUpperCase();
  // a picture on the face at x, from y0 (its left, seen from in front) to y1, z0..z1 m up, facing ±x
  const decal = (svg: string, x: number, y0: number, y1: number, z0: number, z1: number, side: number) => {
    const pts: [number, number, number][] = [
      [x + side * 0.002, z0, y0],
      [x + side * 0.002, z0, y1],
      [x + side * 0.002, z1, y1],
      [x + side * 0.002, z1, y0],
    ];
    const uv = [0, 0, 1, 0, 1, 1, 0, 1];
    const d = { svg, pos: [] as number[], nor: [] as number[], uv: [] as number[], glow: false };
    // (wound to face out)
    const order = side * (y1 - y0) < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) {
      d.pos.push(...pts[i]);
      d.nor.push(side, 0, 0);
      d.uv.push(uv[i * 2], uv[i * 2 + 1]);
    }
    out.decals.push(d);
  };
  for (const side of p.back ? [f, -f] : [f])
    decal(nameSvg(name), ox + side * 0.075, oy + side * 0.55, oy - side * 0.55, 1.45, 1.81, side);
  decal(tagSvg(bay), ox + f * 0.052, oy + f * 0.13, oy - f * 0.13, 1.2, 1.34, f);
}
