import {
  groundsRng,
  KART_LAND,
  KART_TURN,
  SNOW_POLES,
  TOWN_CARS,
  WAYS,
  type Way,
  wayHalf,
  wayPave,
} from "@yutopia/shared/grounds";
import { BoxGeometry, type BufferGeometry, CylinderGeometry, IcosahedronGeometry } from "three";
import { type G, place, tinted, type V } from "./campus";
import type { Themes } from "./sky";
import { face, ridge, type Station, wobble } from "./snow3d";

// The roads (docs/plan/33-the-look.md, the roads): the asphalt's own picture (its lanes' tyre
// tracks, wear, tar seams — no snow painted into it), and as geometry what lies on it and beside
// it: the lines (white edges, yellow middles: dashed out on the road, doubled in town), the snow
// at its verges with a ragged edge that never repeats, the kerbs with a face and a top, the
// pavements' slabs, the crosswalks and the stop line where Church Street meets Main, the snow
// poles. Each way by its own width.

/** Where a way's lanes run (their middles, tiles from its line), its parking lanes', and where
 *  its painted lines go. */
export function lanesOf(w: Way): { travel: number[]; parking: number[]; edge: number[]; centre: "dashed" | "double" } {
  if (w.kind === "street" && w.w >= 13)
    return { travel: [-1.75, 1.75], parking: [-5.75, 5.75], edge: [-3.5, 3.5], centre: "double" };
  if (w.kind === "street") return { travel: [-w.w / 4, w.w / 4], parking: [], edge: [], centre: "double" };
  return { travel: [-w.w / 4, w.w / 4], parking: [], edge: [-(w.w / 2 - 0.75), w.w / 2 - 0.75], centre: "dashed" };
}

/** The asphalt's picture across a way `w.w` wide (u across, v along, 9 tiles a repeat): worn
 *  dark where the wheels run in each lane, salt-grey between, tar seams, a crack now and then. */
export function asphaltCanvas(T: Themes, w: Way): HTMLCanvasElement {
  const W = 256;
  const H = 512;
  const { c, g } = T.canvas(W, H);
  const r = T.rng(Math.round(w.w * 31 + w.key.length * 7));
  const U = (m: number) => (m / w.w + 0.5) * W;
  const wave = (y: number, ph: number, a: number) =>
    a * (Math.sin((2 * Math.PI * y) / H + ph) + 0.5 * Math.sin((2 * Math.PI * 3 * y) / H + ph * 2.1));
  g.fillStyle = "#4b5058";
  g.fillRect(0, 0, W, H);
  // speckle: lighter aggregate, darker patches
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(120,126,134,${0.08 + r() * 0.12})` : `rgba(28,30,34,${0.06 + r() * 0.1})`;
    const x = r() * W;
    const y = r() * H;
    g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
  }
  // salt and slush grey between and outside the wheel paths
  const lanes = lanesOf(w);
  for (const m of lanes.parking) {
    g.fillStyle = "rgba(150,156,164,0.22)";
    g.fillRect(U(m - 1.2), 0, U(m + 1.2) - U(m - 1.2), H);
  }
  // the tracks: two a lane, worn darker and smoother, wandering a little (wrapping at the tile)
  g.lineCap = "round";
  for (const m of lanes.travel)
    for (const o of [-0.78, 0.78]) {
      const ph = r() * 6;
      for (const [wd, a] of [
        [U(0.55) - U(0), 0.16],
        [U(0.3) - U(0), 0.3],
      ]) {
        g.strokeStyle = `rgba(24,26,30,${a})`;
        g.lineWidth = wd;
        g.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const x = U(m + o) + wave(y, ph, 2.2);
          if (y === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  // a crack or two (no seams across, no patches: they showed the repeat)
  g.strokeStyle = "rgba(22,24,28,0.3)";
  g.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    let x = r() * W;
    let y = r() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (r() - 0.5) * 22;
      y += 6 + r() * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

/** The pavements' slabs: concrete flags with their joints, a little stained, salt at the edges. */
export function slabCanvas(T: Themes): HTMLCanvasElement {
  const S = 256;
  const { c, g } = T.canvas(S, S);
  const r = T.rng(311);
  // four flags across a 2-tile repeat each way
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const v = 176 + Math.floor(r() * 18);
      g.fillStyle = `rgb(${v},${v - 1},${v - 5})`;
      g.fillRect(i * 64, j * 64, 64, 64);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "90,90,92" : "220,222,224"},${0.06 + r() * 0.08})`;
        g.fillRect(i * 64 + r() * 64, j * 64 + r() * 64, 1 + r() * 3, 1 + r() * 3);
      }
    }
  g.strokeStyle = "rgba(70,70,72,0.55)";
  g.lineWidth = 2;
  for (let k = 0; k <= 4; k++) {
    g.beginPath();
    g.moveTo(k * 64, 0);
    g.lineTo(k * 64, S);
    g.moveTo(0, k * 64);
    g.lineTo(S, k * 64);
    g.stroke();
  }
  // trodden snow in patches, salt stains
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(240,243,246,${0.25 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(r() * S, r() * S, 8 + r() * 26, 4 + r() * 12, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

interface Ctx {
  near: (x: number, z: number, pad?: number) => boolean;
  yAt: (w: Way, i: number, x: number, z: number) => number;
}

/** A smooth noise over the world, −1..1 (the verges' ragged edges: two ways that meet agree). */
function worldWob(x: number, z: number, f: number, seed: number): number {
  const h = (i: number, j: number) => {
    const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const X = x * f;
  const Z = z * f;
  const i = Math.floor(X);
  const j = Math.floor(Z);
  const u = X - i;
  const v = Z - j;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - su) + h(i + 1, j) * su) * (1 - sv) + (h(i, j + 1) * (1 - su) + h(i + 1, j + 1) * su) * sv;
}

/** The line's normal at sample k (to its left, x then z). */
function normal(w: Way, k: number): [number, number] {
  const L = w.line;
  const [px, pz] = L[Math.max(0, k - 1)];
  const [qx, qz] = L[Math.min(L.length - 1, k + 1)];
  const l = Math.hypot(qx - px, qz - pz) || 1;
  return [-(qz - pz) / l, (qx - px) / l];
}

/** A strip along a way between offsets `a(t)` and `b(t)` (tiles from its line; t: tiles along),
 *  `lift` over it, where `keep(i)`; dashed: on `dash` tiles of every `period`. */
function strip(
  g: G,
  w: Way,
  ctx: Ctx,
  a: (t: number, i: number) => number,
  b: (t: number, i: number) => number,
  lift: number | ((i: number) => number),
  keep: (i: number, x: number, z: number) => boolean = () => true,
  dash?: { on: number; period: number },
) {
  const L = w.line;
  let t = 0;
  for (let i = 0; i + 1 < L.length; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const t1 = t + len;
    if (ctx.near(ax, az, 20) && keep(i, ax, az) && keep(i + 1, bx, bz) && (!dash || t % dash.period < dash.on)) {
      const [anx, anz] = normal(w, i);
      const [bnx, bnz] = normal(w, i + 1);
      const P = (x: number, z: number, nx: number, nz: number, o: number, k: number): V => {
        const px = x + nx * o;
        const pz = z + nz * o;
        return [px, ctx.yAt(w, k, px, pz) + (typeof lift === "number" ? lift : lift(k)), pz];
      };
      face(
        g,
        P(ax, az, anx, anz, a(t, i), i),
        P(bx, bz, bnx, bnz, a(t1, i + 1), i + 1),
        P(bx, bz, bnx, bnz, b(t1, i + 1), i + 1),
        P(ax, az, anx, anz, b(t, i), i),
      );
    }
    t = t1;
  }
}

/** Per sample of `w`: is another way crossing it there (within that one's width, its pavements
 *  and `pad`)? Worked out once a way (it was asked per sample per strip: a 130 ms frame). */
const crossings = new Map<string, boolean[]>();
function crossedAll(w: Way, pad: number, nearLine: (u: Way, x: number, z: number) => number): boolean[] {
  const k = `${w.key}|${pad}`;
  let c = crossings.get(k);
  if (!c) {
    // (not one that carries it on, end to end: the driveway into the road, the road into Main Street)
    const joined = (u: Way) =>
      [u.line[0], u.line[u.line.length - 1]].some((p) =>
        [w.line[0], w.line[w.line.length - 1]].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5),
      );
    const others = WAYS.filter((u) => u !== w && u.kind !== "trail" && u.kind !== "walk" && !joined(u));
    c = w.line.map(([x, z]) => others.some((u) => nearLine(u, x, z) < u.w / 2 + u.pave + pad));
    crossings.set(k, c);
  }
  return c;
}

/** Per sample of a road: 0..1, eased in over its last 10 tiles where it runs on into a street
 *  (its verges and spray narrow to nothing there, the street's kerbs taking over — no cut
 *  across where the county road becomes Main Street); 1 elsewhere. */
function intoStreet(w: Way): number[] {
  const L = w.line;
  const at = (p: [number, number]) =>
    WAYS.some(
      (u) =>
        u !== w &&
        u.kind === "street" &&
        [u.line[0], u.line[u.line.length - 1]].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5),
    );
  const out = L.map(() => 1);
  for (const [end, dir] of [
    [0, 1],
    [L.length - 1, -1],
  ] as const) {
    if (!at(L[end] as [number, number])) continue;
    let d = 0;
    for (let i = end; i >= 0 && i < L.length; i += dir) {
      if (i !== end) d += Math.hypot(L[i][0] - L[i - dir][0], L[i][1] - L[i - dir][1]);
      if (d > 10) break;
      const e = d / 10;
      out[i] = Math.min(out[i], e * e * (3 - 2 * e));
    }
  }
  return out;
}
/** Per sample, how far a way is from running into the Kart Park's turning circle (0 at its edge,
 *  1 from 8 m out): its verges taper away and its paint stops, the circle's mouth over it
 *  (tp/kart/park3d.ts carMouth). */
function intoTurn(w: Way): number[] {
  const T = KART_TURN;
  return w.line.map(([x, z]) => {
    if (!KART_LAND) return 1;
    const e = Math.min(1, Math.max(0, (Math.hypot(x - T.x, z - T.z) - T.r) / 8));
    return e * e * (3 - 2 * e);
  });
}

/** The lines, the verges, the kerbs and pavements of one way: into `paint` (vertex coloured),
 *  `slabs` (the pavements' picture). */
export function wayDressing(
  w: Way,
  ctx: Ctx,
  nearLine: (u: Way, x: number, z: number) => number,
  paint: G,
  slabs: G,
  lines: G,
) {
  if (w.kind === "trail" || w.kind === "walk") return;
  const half = w.w / 2;
  // (per sample: a flared start — Main Street from the county road — narrower, no pavements)
  const hw = (i: number) => wayHalf(w, i);
  const pv = (i: number) => wayPave(w, i);
  const lanes = lanesOf(w);
  const r = groundsRng(w.key.length * 101 + Math.round(w.w * 13));
  const wobA = wobble(r, 3.1);
  const wobB = wobble(r, 1.3);
  const notBridge = (i: number) => !w.bridged[i];
  // (the verges' edge by where it is on the land, each side its own: no restart where ways meet)
  const sideAt = (i: number, s: number): [number, number] => {
    const [nx, nz] = normal(w, i);
    return [w.line[i][0] + nx * s * half, w.line[i][1] + nz * s * half];
  };
  const vA = (i: number, s: number) => worldWob(...sideAt(i, s), 1 / 3.1, 3);
  const vB = (i: number, s: number) => worldWob(...sideAt(i, s), 1 / 1.3, 7);
  const crossedAt = crossedAll(w, 0.5, nearLine);
  const open = (i: number) => !crossedAt[i];
  const turn = intoTurn(w);
  // ── the paint: a little faded, gone here and there under the slush (and short of the turning
  // circle: its mouth's asphalt) ──
  const worn = wobble(r, 7);
  const painted = (i: number) => open(i) && worn(i) > -0.75 && turn[i] > 0.6;
  const C = 0.06;
  lines.color(0xe6e8ea);
  for (const e of lanes.edge)
    strip(
      lines,
      w,
      ctx,
      () => e - C,
      () => e + C,
      0.085,
      painted,
    );
  lines.color(0xd8b84a);
  if (lanes.centre === "double")
    for (const o of [-0.14, 0.14])
      strip(
        lines,
        w,
        ctx,
        () => o - 0.05,
        () => o + 0.05,
        C,
        painted,
      );
  else
    strip(
      lines,
      w,
      ctx,
      () => -0.06,
      () => 0.06,
      C,
      painted,
      { on: 3, period: 9 },
    );
  if (w.kind !== "street") {
    // ── the verges: packed grey snow from inside the edge out to the plough's bank, its inner
    // edge ragged (by distance along: no repeat) ──
    paint.color(0xd9dfe5);
    const street = intoStreet(w);
    const ease = street.map((e, i) => Math.min(e, turn[i]));
    for (const s of [1, -1]) {
      const inner = (_t: number, i: number) =>
        s * (half - (0.15 + 0.3 * (0.5 + 0.5 * vA(i, s)) + 0.12 * vB(i, s)) * ease[i]);
      const outer = (_t: number, i: number) => s * (half + 1.0 * ease[i]);
      strip(
        paint,
        w,
        ctx,
        (t, i) => (s > 0 ? inner(t, i) : outer(t, i)),
        (t, i) => (s > 0 ? outer(t, i) : inner(t, i)),
        0.075,
        (i) => open(i) && notBridge(i),
      );
    }
    // the wheels' spray: a dirty band along its inner edge
    paint.color(0xa8a6a0);
    for (const s of [1, -1]) {
      const a = (_t: number, i: number) =>
        s * (half - (0.15 + 0.3 * (0.5 + 0.5 * vA(i, s)) + 0.12 * vB(i, s)) * ease[i]);
      const b = (t: number, i: number) => a(t, i) + s * (0.25 + 0.3 * (0.5 + 0.5 * vB(i, -s))) * ease[i];
      strip(
        paint,
        w,
        ctx,
        (t, i) => (s > 0 ? a(t, i) : b(t, i)),
        (t, i) => (s > 0 ? b(t, i) : a(t, i)),
        0.08,
        (i) => open(i) && notBridge(i),
      );
    }
    return;
  }
  // ── a street: slush in the gutters, the kerbs (a face and a top), the pavements, snow along
  // the buildings' feet; all open where another street meets it ──
  const keep = (i: number) => open(i) && notBridge(i);
  paint.color(0xa9a59d); // (the gutters' slush: grey-brown)
  for (const s of [1, -1]) {
    const inner = (t: number, i: number) => s * (hw(i) - 0.35 - 0.35 * (0.5 + 0.5 * wobA(t + s * 40)));
    strip(
      paint,
      w,
      ctx,
      (t, i) => (s > 0 ? inner(t, i) : s * hw(i)),
      (t, i) => (s > 0 ? s * hw(i) : inner(t, i)),
      0.07,
      keep,
    );
  }
  const KERB = 0.18;
  // (the kerb rises as the pavement opens: no wall where the road ends)
  const kerbH = (i: number) => KERB * Math.min(1, pv(i) / 0.8);
  for (const s of [1, -1]) {
    // its face, granite grey, from the road up
    const L = w.line;
    paint.color(0x8d8f93);
    for (let i = 0; i + 1 < L.length; i++) {
      if (!ctx.near(L[i][0], L[i][1], 20) || !keep(i) || !keep(i + 1)) continue;
      const [anx, anz] = normal(w, i);
      const [bnx, bnz] = normal(w, i + 1);
      const ax = L[i][0] + anx * s * hw(i);
      const az = L[i][1] + anz * s * hw(i);
      const bx = L[i + 1][0] + bnx * s * hw(i + 1);
      const bz = L[i + 1][1] + bnz * s * hw(i + 1);
      const ya = ctx.yAt(w, i, ax, az);
      const yb = ctx.yAt(w, i + 1, bx, bz);
      face(
        paint,
        [ax, ya + 0.04, az],
        [bx, yb + 0.04, bz],
        [bx, yb + kerbH(i + 1) + 0.02, bz],
        [ax, ya + kerbH(i) + 0.02, az],
        [-anx * s, 0, -anz * s],
      );
    }
    // its top, lighter
    paint.color(0xb8b8b4);
    strip(
      paint,
      w,
      ctx,
      (_t, i) => s * hw(i),
      (_t, i) => s * (hw(i) + 0.28),
      (i) => kerbH(i) + 0.02,
      keep,
    );
    // the pavement's slabs
    strip(
      slabs,
      w,
      ctx,
      (_t, i) => s * (hw(i) + 0.28),
      (_t, i) => s * (hw(i) + Math.max(0.28, pv(i))),
      kerbH,
      keep,
    );
    // snow banked along the buildings' side of it, ragged
    paint.color(0xf1f4f7);
    const inner = (t: number, i: number) =>
      s *
      (hw(i) +
        Math.max(0.28, pv(i)) -
        0.25 * Math.min(1, pv(i)) -
        0.35 * Math.min(1, pv(i)) * (0.5 + 0.5 * wobB(t + s * 13)));
    strip(
      paint,
      w,
      ctx,
      (t, i) => (s > 0 ? inner(t, i) : s * (hw(i) + Math.max(0.28, pv(i)))),
      (t, i) => (s > 0 ? s * (hw(i) + Math.max(0.28, pv(i))) : inner(t, i)),
      (i) => kerbH(i) + 0.025,
      keep,
    );
  }
}

/** The crossing of Church Street and Main: crosswalks on Main either side of its mouth and across
 *  Church Street, the stop line before it. */
export function crossingPaint(g: G, yAt: (x: number, z: number) => number) {
  const main = WAYS.find((u) => u.key === "main") as Way;
  const church = WAYS.find((u) => u.key === "church-st") as Way;
  const mz = main.line[0][1];
  const cx = church.line[0][0];
  const halfM = main.w / 2;
  const halfC = church.w / 2;
  const y = 0.072;
  const bar = (x0: number, z0: number, x1: number, z1: number) =>
    g.quad(
      [x0, yAt(x0, z0) + y, z0],
      [x1, yAt(x1, z0) + y, z0],
      [x1, yAt(x1, z1) + y, z1],
      [x0, yAt(x0, z1) + y, z1],
      [0, 1, 0],
    );
  g.color(0xe8eaec);
  // across Main, west and east of the mouth: bars along x, 3 wide, every 1.1 across
  for (const x0 of [cx - halfC - 3.6, cx + halfC + 0.6])
    for (let z = mz - halfM + 0.4; z < mz + halfM - 0.5; z += 1.1) bar(x0, z, x0 + 3, z + 0.55);
  // across Church Street, just past Main's pavement
  const zc = mz - halfM - main.pave - 0.6;
  for (let x = cx - halfC + 0.3; x < cx + halfC - 0.4; x += 1.1) bar(x, zc - 3, x + 0.55, zc);
  // the stop line, the southbound lane's (heading +z, it keeps to the west half)
  bar(cx - halfC + 0.2, zc - 3.9, cx - 0.2, zc - 3.45);
}

/** The snow poles (shared SNOW_POLES): an orange stake, a reflector band, snow on its cap. */
export function snowPoles(
  near: (x: number, z: number, pad?: number) => boolean,
  yAt: (x: number, z: number) => number,
): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (const p of SNOW_POLES) {
    if (!near(p.x, p.z, 10)) continue;
    const y = yAt(p.x, p.z);
    out.push(
      place(tinted(new CylinderGeometry(0.035, 0.04, 1.7, 5).translate(0, 0.85, 0), 0xd2601e), p.x, y, p.z, p.ry),
    );
    out.push(place(tinted(new BoxGeometry(0.09, 0.2, 0.02).translate(0, 1.45, 0.04), 0xe8eef2), p.x, y, p.z, p.ry));
    out.push(
      place(tinted(new CylinderGeometry(0.045, 0.045, 0.04, 5).translate(0, 1.72, 0), 0xf2f5f8), p.x, y, p.z, p.ry),
    );
  }
  return out;
}

// ── the roads worn (docs/plan/33-the-look.md, "The roads, worn") ──────────────────────────────
// How white the carriageways are from the weather: up as a storm comes, cleared by the ploughs
// and the traffic over about an hour after it (shared weather.ts: the same for everyone).
export const roadSnow = { value: -1 };
// (the e2e shots set it: after a storm)
if (typeof window !== "undefined") (window as unknown as { __roadSnow?: typeof roadSnow }).__roadSnow = roadSnow;
let snowAt = 0;
export function stepRoadSnow(storm: number, stormAt: (ms: number) => number) {
  const now = Date.now();
  if (roadSnow.value < 0) {
    // (coming in: what the last storms left)
    let v = 0;
    for (let k = 0; k <= 24; k++) v = Math.max(v, stormAt(now - k * 5 * 60_000) * Math.max(0, 1 - (k * 5) / 60));
    roadSnow.value = v;
    snowAt = now;
    return;
  }
  const dt = Math.min(5, (now - snowAt) / 1000);
  snowAt = now;
  const v = roadSnow.value;
  roadSnow.value = storm > v ? v + (storm - v) * Math.min(1, dt / 300) : Math.max(storm, v - dt / 3600);
}

const NOISE = `
float rdHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rdNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rdHash(i), rdHash(i + vec2(1.0, 0.0)), f.x), mix(rdHash(i + vec2(0.0, 1.0)), rdHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float rdFbm(vec2 p) { return 0.55 * rdNoise(p) + 0.3 * rdNoise(p * 2.3 + 11.0) + 0.15 * rdNoise(p * 5.1 + 3.0); }
`;
// (in the Grounds' own coords — their meshes sit at the root's origin; the campus is placed
// in the world elsewhere — so a join's point means the same as WAYS' and iso's noise matches)
const VARY = (sh: { vertexShader: string; fragmentShader: string }) => {
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vRdW;")
    .replace("#include <project_vertex>", "#include <project_vertex>\nvRdW = transformed;");
};
/** How much packed snow a kind of way keeps (before the weather's). */
const BASE: Record<string, number> = { street: 0.1, driveway: 0.38, road: 0.5 };

/** A carriageway's cover: packed snow over the asphalt by a world-space noise (no repeat), the
 *  asphalt showing in two wheel ruts a lane, slush and spray towards its edges, salt crusts and
 *  wet patches on the bare. On a Grounds material (light3d.ts patchGrounds calls it). */
export function roadCover(m: { userData: Record<string, unknown> }, w: Way) {
  const lanes = lanesOf(w);
  // where it carries on into another (end to end), its cover eases into that one's over ~25
  // tiles either side of the join (the county road's packed snow into the town's slush)
  const join = WAYS.flatMap((o) => {
    if (o === w || o.kind === "trail" || o.kind === "walk") return [];
    const ends = [w.line[0], w.line[w.line.length - 1]];
    const oe = [o.line[0], o.line[o.line.length - 1]];
    for (const p of ends)
      for (const q of oe)
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5)
          return [{ p, base: BASE[o.kind] ?? 0.3, lane: lanesOf(o).travel[1] }];
    return [];
  });
  const own = lanesOf(w).travel[1];
  const j1 = join[0] ?? { p: [1e6, 1e6], base: BASE[w.kind] ?? 0.3, lane: own };
  const j2 = join[1] ?? { p: [1e6, 1e6], base: BASE[w.kind] ?? 0.3, lane: own };
  // a flared start (Main's, from the county road's width): how far along it widens to its own
  let flen = 0;
  if (w.flare)
    for (let i = 1; i <= w.flare.n && i < w.line.length; i++)
      flen += Math.hypot(w.line[i][0] - w.line[i - 1][0], w.line[i][1] - w.line[i - 1][1]);
  const u = {
    rdFl: { value: [w.line[0][0], w.line[0][1], flen, w.flare ? w.flare.w0 : w.w] },
    rdJ1: { value: [j1.p[0], j1.p[1], j1.base] },
    rdJ2: { value: [j2.p[0], j2.p[1], j2.base] },
    rdJL: { value: [j1.lane, j2.lane] },
    rdW: { value: w.w },
    rdLanes: { value: [lanes.travel[0], lanes.travel[1]] },
    rdBase: { value: BASE[w.kind] ?? 0.3 },
    rdPark: { value: lanes.parking.length ? 3.5 : 99 },
    rdSnow: roadSnow,
  };
  m.userData.grounds = {
    key: "-road",
    patch: (sh: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }) => {
      Object.assign(sh.uniforms, u);
      VARY(sh);
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vRdW;\nuniform float rdW; uniform float rdLanes[2]; uniform float rdBase; uniform float rdPark; uniform float rdSnow; uniform vec3 rdJ1; uniform vec3 rdJ2; uniform vec2 rdJL; uniform vec4 rdFl;\n${NOISE}`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
{
  float snow = max(rdSnow, 0.0);
  vec2 P = vRdW.xz;
  float m = (vMapUv.x - 0.5) * rdW; // across it, tiles from its line
  float big = rdFbm(P * 0.07);
  float fine = rdFbm(P * 0.8);
  // the ruts: two a lane, wandering; by a join, their lanes eased to halfway to that way's
  float d1 = smoothstep(0.0, 25.0, distance(P, rdJ1.xy));
  float d2 = smoothstep(0.0, 25.0, distance(P, rdJ2.xy));
  float rut = 0.0;
  for (int k = 0; k < 2; k++)
    for (int s = -1; s <= 1; s += 2) {
      float ln = rdLanes[k];
      float sg = sign(ln);
      ln = mix(sg * 0.5 * (abs(rdLanes[k]) + rdJL.x), ln, d1);
      ln = mix(sg * 0.5 * (abs(rdLanes[k]) + rdJL.y), ln, d2);
      float c = ln + float(s) * 0.78 + (rdNoise(P * 0.09 + float(k * 7 + s)) - 0.5) * 0.35;
      rut = max(rut, 1.0 - smoothstep(0.2, 0.62, abs(m - c)));
    }
  // (where it flares, its edge where it is then, no bays yet)
  float fl = rdFl.z > 0.0 ? smoothstep(0.0, rdFl.z, distance(P, rdFl.xy)) : 1.0;
  float hw = mix(rdFl.w, rdW, fl) * 0.5;
  float edge = smoothstep(hw - 1.7, hw - 0.15, abs(m));
  float park = smoothstep(rdPark - 0.2, rdPark + 0.6, abs(m)) * fl;
  // (by a join: halfway to the other way's at it, its own 25 tiles off)
  float base = rdBase;
  base = mix(0.5 * (rdBase + rdJ1.z), base, smoothstep(0.0, 25.0, distance(P, rdJ1.xy)));
  base = mix(0.5 * (rdBase + rdJ2.z), base, smoothstep(0.0, 25.0, distance(P, rdJ2.xy)));
  float cover = clamp(base + snow * 0.6 + (big - 0.5) * 0.8 + park * 0.18, 0.0, 1.0);
  cover = cover * (1.0 - rut * (0.92 - snow * 0.35));
  cover = max(cover, edge * (0.5 + snow * 0.45) * smoothstep(0.25, 0.6, fine + 0.2));
  vec3 packed = mix(vec3(0.52, 0.55, 0.59), vec3(0.74, 0.77, 0.81), fine);
  // slush and the wheels' spray: brown-grey towards the edges and by the parking bays
  float slush = clamp(edge * 0.8 + park * 0.5, 0.0, 1.0) * smoothstep(0.35, 0.75, rdNoise(P * 0.4 + 5.0)) * (1.0 - snow * 0.6);
  packed = mix(packed, vec3(0.30, 0.27, 0.23), slush * 0.65);
  diffuseColor.rgb = mix(diffuseColor.rgb, packed, smoothstep(0.08, 0.55, cover) * 0.95);
  // on the bare: salt drying white, dark wet patches
  float bare = 1.0 - smoothstep(0.1, 0.5, cover);
  float salt = smoothstep(0.66, 0.78, rdFbm(P * 0.45 + 17.0)) * bare;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.37, 0.38), salt * 0.55);
  float wet = smoothstep(0.62, 0.8, rdFbm(P * 0.16 + 31.0)) * bare;
  diffuseColor.rgb *= 1.0 - wet * 0.35;
}`,
        );
    },
  };
}

/** The paint under it: worn and snowed over where the cover's thick (no ruts known here: by the
 *  same noise, a little less). */
export function paintCover(m: { userData: Record<string, unknown> }, kind: string) {
  const u = { rdBase: { value: (BASE[kind] ?? 0.3) * 0.8 }, rdSnow: roadSnow };
  m.userData.grounds = {
    key: "-paint",
    patch: (sh: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }) => {
      Object.assign(sh.uniforms, u);
      VARY(sh);
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vRdW;\nuniform float rdBase; uniform float rdSnow;\n${NOISE}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
{
  vec2 P = vRdW.xz;
  float cover = clamp(rdBase + max(rdSnow, 0.0) * 0.6 + (rdFbm(P * 0.07) - 0.5) * 0.8, 0.0, 1.0);
  float scuff = smoothstep(0.55, 0.85, rdFbm(P * 1.7));
  vec3 packed = mix(vec3(0.52, 0.55, 0.59), vec3(0.74, 0.77, 0.81), rdFbm(P * 0.8));
  diffuseColor.rgb = mix(diffuseColor.rgb, packed, clamp(smoothstep(0.2, 0.7, cover) + scuff * 0.45, 0.0, 0.92));
}`,
        );
    },
  };
}

/** A street's corners (geometry): the plough's windrow along each kerb, the parking bays with no
 *  car in them snowed in (a car's own bay dug out round it), heaps where the pavements end at the
 *  crossing. */
export function streetCorners(w: Way, ctx: Ctx, nearLine: (u: Way, x: number, z: number) => number, g: G) {
  if (w.kind !== "street") return;
  const lanes = lanesOf(w);
  const crossedAt = crossedAll(w, 0.5, nearLine);
  const L = w.line;
  const r = groundsRng(w.key.length * 977 + 5);
  const lump = wobble(r, 1.7);
  const yAt = (x: number, z: number) => ctx.yAt(w, 0, x, z);
  // (main: the crosswalks and the square's side keep clear of snowed-in bays)
  const clearBay = (x: number, s: number) => Math.abs(x - 420) < 10.5 || (s > 0 && x > 397 && x < 443);
  const carAt = (x: number, z: number, s: number) =>
    TOWN_CARS.some((c) => c.dir === s && Math.abs(c.x - x) < 3.1 && Math.abs(c.z - z) < 8);
  for (const s of [1, -1]) {
    const row: Station[] = [];
    const bays: Station[] = [];
    let t = 0;
    for (let i = 0; i < L.length; i++) {
      if (i > 0) t += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]);
      const [nx, nz] = normal(w, i);
      const x = L[i][0] + nx * s * (wayHalf(w, i) + 0.02);
      const z = L[i][1] + nz * s * (wayHalf(w, i) + 0.02);
      const open = !crossedAt[i] && ctx.near(x, z, 20);
      // inward, off the kerb
      // (lower where a car's parked against it: it was dug out)
      const dug = lanes.parking.length > 0 && carAt(L[i][0], z, s) ? 0.55 : 1;
      // (where it flares from a road, rising from nothing as its kerb does)
      const rise = w.flare ? Math.min(1, wayPave(w, i) / 0.8) : 1;
      row.push({ x, z, nx: -nx * s, nz: -nz * s, k: open ? (0.8 + 0.4 * lump(t + s * 50)) * dug * rise : 0 });
      const flaring = !!w.flare && i < w.flare.n + 2;
      const parked = lanes.parking.length > 0 && open && !flaring && !clearBay(L[i][0], s) && !carAt(L[i][0], z, s);
      bays.push({ x, z, nx: -nx * s, nz: -nz * s, k: parked ? 0.85 + 0.3 * lump(t * 1.7 + 30) : 0 });
    }
    // the windrow: ragged, against the kerb
    ridge(
      g,
      row,
      [
        [-0.05, 0.3],
        [0.25, 0.34],
        [0.55, 0.18],
        [0.85, -1],
      ],
      yAt,
    );
    // a bay with no car: snowed in to the parking lane's edge
    if (lanes.parking.length)
      ridge(
        g,
        bays,
        [
          [0.3, 0.24],
          [1.2, 0.2],
          [2.0, 0.12],
          [2.55, -1],
        ],
        yAt,
      );
  }
}

/** Heaps the plough left where the pavements end at Church Street's mouth. */
export function crossingHeaps(yAt: (x: number, z: number) => number): BufferGeometry[] {
  const main = WAYS.find((u) => u.key === "main") as Way;
  const church = WAYS.find((u) => u.key === "church-st") as Way;
  const mz = main.line[0][1];
  const cx = church.line[0][0];
  const r = groundsRng(4711);
  const out: BufferGeometry[] = [];
  const zN = mz - main.w / 2 - main.pave - 0.6;
  for (const [x, z, s] of [
    [cx - church.w / 2 - 1.1, zN - 1.2, 1.1],
    [cx + church.w / 2 + 1.1, zN - 1.2, 1.0],
    [cx - church.w / 2 - 5.2, mz - main.w / 2 - 1.4, 0.9],
    [cx + church.w / 2 + 5.2, mz - main.w / 2 - 1.4, 1.2],
  ] as const) {
    const g = new IcosahedronGeometry(1, 1);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const k = 0.8 + r() * 0.35;
      pos.setXYZ(i, pos.getX(i) * k * 1.3, Math.max(-0.1, pos.getY(i)) * k * 0.75, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    out.push(place(tinted(g, r() < 0.5 ? 0xe6eaee : 0xd4d8dc), x, yAt(x, z) - 0.05, z, r() * Math.PI, s));
  }
  return out;
}

/** The lot's asphalt (the ground floor's own, drawn by the floor) under the same weather as the
 *  roads: packed snow and slush over it in patches — a see-through layer over it (it read as a pit
 *  beside the snowed-over driveway). Given the lot's layout (docs/plan/42-the-lot.md), as the
 *  driveway's: the paint showing through, the tyres' tracks worn clear round the aisles' loop and
 *  more left in the bays. */
export function lotCover(
  m: { userData: Record<string, unknown>; transparent: boolean; depthWrite: boolean },
  lot?: { aisles: [number, number]; cross: [number, number] },
) {
  m.transparent = true;
  m.depthWrite = false;
  const u: Record<string, { value: unknown }> = { rdSnow: roadSnow };
  if (lot) {
    u.lotA = { value: lot.aisles };
    u.lotZ = { value: lot.cross };
  }
  const worn = lot
    ? `
  // round the loop: the aisles (x) and the cross aisles (z) between them; the tyres' two tracks
  float inA = max(1.0 - smoothstep(2.8, 3.6, abs(P.x - lotA.x)), 1.0 - smoothstep(2.8, 3.6, abs(P.x - lotA.y)));
  float inZ = (1.0 - smoothstep(2.8, 3.6, min(abs(P.y - lotZ.x), abs(P.y - lotZ.y)))) * step(lotA.x - 3.6, P.x) * step(P.x, lotA.y + 3.6);
  float aisle = max(inA, inZ);
  float tA = min(min(abs(abs(P.x - lotA.x) - 0.9), abs(abs(P.x - lotA.y) - 0.9)), 9.0);
  float tZ = min(abs(abs(P.y - lotZ.x) - 0.9), abs(abs(P.y - lotZ.y) - 0.9)) + (1.0 - inZ) * 9.0;
  float tracks = 1.0 - smoothstep(0.25, 0.6, min(tA, tZ) + (rdNoise(P * 0.5) - 0.5) * 0.3);
  cover += 0.3 - 0.5 - aisle * 0.06 - tracks * aisle * 0.3;`
    : "";
  m.userData.grounds = {
    key: lot ? "-lot2" : "-lot",
    patch: (sh: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }) => {
      Object.assign(sh.uniforms, u);
      VARY(sh);
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vRdW;\nuniform float rdSnow;\n${lot ? "uniform vec2 lotA;\nuniform vec2 lotZ;\n" : ""}${NOISE}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
{
  vec2 P = vRdW.xz;
  float snow = max(rdSnow, 0.0);
  float cover = clamp(0.5 + snow * 0.6 + (rdFbm(P * 0.07) - 0.5) * 0.9 + (rdFbm(P * 0.6) - 0.5) * 0.25, 0.0, 1.0);${worn}
  cover = clamp(cover, 0.0, 1.0);
  vec3 packed = mix(vec3(0.52, 0.55, 0.59), vec3(0.76, 0.79, 0.83), rdFbm(P * 0.8));
  float slush = smoothstep(0.45, 0.8, rdNoise(P * 0.35 + 5.0)) * (1.0 - snow * 0.6);
  packed = mix(packed, vec3(0.30, 0.27, 0.23), slush * 0.5);
  diffuseColor.rgb = packed;
  diffuseColor.a = smoothstep(0.08, 0.55, cover) * 0.92;
}`,
        );
    },
  };
}
