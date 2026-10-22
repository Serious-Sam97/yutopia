import { groundsRng, SNOW_POLES, WAYS, type Way } from "@yutopia/shared/grounds";
import { BoxGeometry, type BufferGeometry, CylinderGeometry } from "three";
import { type G, place, tinted, type V } from "./campus";
import type { Themes } from "./sky";
import { face, wobble } from "./snow3d";

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
  lift: number,
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
        return [px, ctx.yAt(w, k, px, pz) + lift, pz];
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
    const others = WAYS.filter((u) => u !== w && u.kind !== "trail" && u.kind !== "walk");
    c = w.line.map(([x, z]) => others.some((u) => nearLine(u, x, z) < u.w / 2 + u.pave + pad));
    crossings.set(k, c);
  }
  return c;
}

/** The lines, the verges, the kerbs and pavements of one way: into `paint` (vertex coloured),
 *  `slabs` (the pavements' picture). */
export function wayDressing(w: Way, ctx: Ctx, nearLine: (u: Way, x: number, z: number) => number, paint: G, slabs: G) {
  if (w.kind === "trail" || w.kind === "walk") return;
  const half = w.w / 2;
  const lanes = lanesOf(w);
  const r = groundsRng(w.key.length * 101 + Math.round(w.w * 13));
  const wobA = wobble(r, 3.1);
  const wobB = wobble(r, 1.3);
  const notBridge = (i: number) => !w.bridged[i];
  const crossedAt = crossedAll(w, 0.5, nearLine);
  const open = (i: number) => !crossedAt[i];
  // ── the paint: a little faded, gone here and there under the slush ──
  const worn = wobble(r, 7);
  const painted = (i: number) => open(i) && worn(i) > -0.75;
  const C = 0.06;
  paint.color(0xe6e8ea);
  for (const e of lanes.edge)
    strip(
      paint,
      w,
      ctx,
      () => e - C,
      () => e + C,
      0.085,
      painted,
    );
  paint.color(0xd8b84a);
  if (lanes.centre === "double")
    for (const o of [-0.14, 0.14])
      strip(
        paint,
        w,
        ctx,
        () => o - 0.05,
        () => o + 0.05,
        C,
        painted,
      );
  else
    strip(
      paint,
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
    for (const s of [1, -1]) {
      const inner = (t: number) => s * (half - 0.15 - 0.3 * (0.5 + 0.5 * wobA(t)) - 0.12 * wobB(t));
      const outer = () => s * (half + 1.0);
      strip(
        paint,
        w,
        ctx,
        (t) => (s > 0 ? inner(t) : outer()),
        (t) => (s > 0 ? outer() : inner(t)),
        0.075,
        notBridge,
      );
    }
    return;
  }
  // ── a street: slush in the gutters, the kerbs (a face and a top), the pavements, snow along
  // the buildings' feet; all open where another street meets it ──
  const keep = (i: number) => open(i) && notBridge(i);
  paint.color(0xc9cfd6);
  for (const s of [1, -1]) {
    const inner = (t: number) => s * (half - 0.35 - 0.35 * (0.5 + 0.5 * wobA(t + s * 40)));
    strip(
      paint,
      w,
      ctx,
      (t) => (s > 0 ? inner(t) : s * half),
      (t) => (s > 0 ? s * half : inner(t)),
      0.07,
      keep,
    );
  }
  const KERB = 0.18;
  for (const s of [1, -1]) {
    // its face, granite grey, from the road up
    const L = w.line;
    paint.color(0x8d8f93);
    for (let i = 0; i + 1 < L.length; i++) {
      if (!ctx.near(L[i][0], L[i][1], 20) || !keep(i) || !keep(i + 1)) continue;
      const [anx, anz] = normal(w, i);
      const [bnx, bnz] = normal(w, i + 1);
      const ax = L[i][0] + anx * s * half;
      const az = L[i][1] + anz * s * half;
      const bx = L[i + 1][0] + bnx * s * half;
      const bz = L[i + 1][1] + bnz * s * half;
      const ya = ctx.yAt(w, i, ax, az);
      const yb = ctx.yAt(w, i + 1, bx, bz);
      face(
        paint,
        [ax, ya + 0.04, az],
        [bx, yb + 0.04, bz],
        [bx, yb + KERB + 0.02, bz],
        [ax, ya + KERB + 0.02, az],
        [-anx * s, 0, -anz * s],
      );
    }
    // its top, lighter
    paint.color(0xb8b8b4);
    strip(
      paint,
      w,
      ctx,
      () => s * half,
      () => s * (half + 0.28),
      KERB + 0.02,
      keep,
    );
    // the pavement's slabs
    strip(
      slabs,
      w,
      ctx,
      () => s * (half + 0.28),
      () => s * (half + w.pave),
      KERB,
      keep,
    );
    // snow banked along the buildings' side of it, ragged
    paint.color(0xf1f4f7);
    const inner = (t: number) => s * (half + w.pave - 0.25 - 0.35 * (0.5 + 0.5 * wobB(t + s * 13)));
    strip(
      paint,
      w,
      ctx,
      (t) => (s > 0 ? inner(t) : s * (half + w.pave)),
      (t) => (s > 0 ? s * (half + w.pave) : inner(t)),
      KERB + 0.025,
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
