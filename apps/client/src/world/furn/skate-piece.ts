import { PIECES, type PieceKind, type Surface } from "@yutopia/shared/skate/pieces";
import { BoxGeometry, type BufferGeometry, Float32BufferAttribute, BufferGeometry as Geo } from "three";
import { ball, tube, type V3 } from "./kit";

// Plan 103 (docs/plan/103-the-skate.md): a skate park piece drawn from its own profile (shared skate/pieces.ts
// PIECES) — the one the board rides, exactly: the riding face swept along its width (or round a bowl corner's
// middle), its arcs in 2.5° steps (a bowl corner's round in 2°: the face within 3 mm of the profile even on its steep walls); its sides down to its foot, its back and front; the steel coping a rod along each
// coping line, its top 2 mm proud of the deck; a box's and a ledge's edges in angle steel; rails a round bar on
// square posts. Into three buckets of plain positions (wound outward, in the frame `to` maps to): the riding
// face, the body (sides, ends), the steel — the build menu's pieces (fam/skate.ts) and the town's parks
// (skate3d.ts) give each its own finish.

export interface PieceGeos {
  face: BufferGeometry[];
  side: BufferGeometry[];
  steel: BufferGeometry[];
}
export interface PieceDraw {
  /** a point of the piece's own (u along its +u, w across, z up from its z) → the frame drawn in (y up) */
  to: (u: number, w: number, z: number) => V3;
  /** across (m): the piece's own when left out (a park's quarter as long as its wall) */
  width?: number;
  /** how far under the piece's z its sides and posts go down (a stair set's tread: to the floor): ≤ 0 */
  base?: number;
  /** its sides drawn (a bowl's pieces meet each other there: none) */
  sides?: boolean;
}

/** The arcs' step (rad). */
const STEP = (2.5 * Math.PI) / 180;
const TURN_STEP = (2 * Math.PI) / 180;
const COPING_R = 0.03;
const BAR_R = 0.024;
const POST = 0.05;
/** what lies on the floor itself (a pipe's flat bottom): lifted this much off it, never fighting it */
const FLOOR_LIFT = 0.004;

interface PP {
  u: number;
  z: number;
  tu: number;
  tz: number;
}
/** A surface's profile as points: each line's ends, each arc in 5° steps (a point at every joint twice, for the
 *  crease). */
function profilePoints(s: Surface): PP[][] {
  const out: PP[][] = [];
  for (const g of s.prof.segs) {
    const run: PP[] = [];
    if (g.k === "line") {
      const du = g.b[0] - g.a[0];
      const dz = g.b[1] - g.a[1];
      const n = Math.hypot(du, dz) || 1;
      run.push({ u: g.a[0], z: g.a[1], tu: du / n, tz: dz / n }, { u: g.b[0], z: g.b[1], tu: du / n, tz: dz / n });
    } else {
      const n = Math.max(1, Math.ceil(Math.abs(g.a1 - g.a0) / STEP - 1e-6));
      const sg = Math.sign(g.a1 - g.a0) || 1;
      for (let i = 0; i <= n; i++) {
        const a = g.a0 + ((g.a1 - g.a0) * i) / n;
        run.push({
          u: g.c[0] + g.r * Math.cos(a),
          z: g.c[1] + g.r * Math.sin(a),
          tu: -Math.sin(a) * sg,
          tz: Math.cos(a) * sg,
        });
      }
    }
    out.push(run);
  }
  return out;
}

/** Triangles into a bucket, each wound to face `n` (the frame's). */
class Tris {
  pos: number[] = [];
  tri(a: V3, b: V3, c: V3, n: V3) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const area = Math.hypot(cx, cy, cz);
    if (area < 1e-9) return;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.pos.push(...a, ...b, ...c);
    else this.pos.push(...a, ...c, ...b);
  }
  quad(a: V3, b: V3, c: V3, d: V3, n: V3) {
    this.tri(a, b, c, n);
    this.tri(a, c, d, n);
  }
  geo(): BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new Geo();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    return g;
  }
}

/** A piece's geometry (its kind's, at `d.width`), in the frame `d.to` maps its own into. */
export function pieceGeometry(kind: PieceKind, d: PieceDraw): PieceGeos {
  const def = PIECES[kind];
  const W = (d.width ?? def.size[1]) / def.size[1];
  const base = Math.min(0, d.base ?? 0);
  const to = d.to;
  // (a direction of the piece's own, in the frame)
  const dir = (p: [number, number, number], n: [number, number, number]): V3 => {
    const a = to(p[0], p[1], p[2]);
    const b = to(p[0] + n[0] * 0.01, p[1] + n[1] * 0.01, p[2] + n[2] * 0.01);
    return [(b[0] - a[0]) * 100, (b[1] - a[1]) * 100, (b[2] - a[2]) * 100];
  };
  const face = new Tris();
  const side = new Tris();
  const steel: BufferGeometry[] = [];

  for (const s of def.surfaces) {
    const runs = profilePoints(s);
    const turn = s.turn ?? 0;
    const [ct, st] = [Math.cos(turn), Math.sin(turn)];
    const rIn = s.rIn ?? 0;
    // (a turn's radius at u: out from its centre, or in toward it — a hip, plan 104 — round its centre (du, dw),
    // its angles from `turn`)
    const R = (u: number) => (s.inward ? rIn - u : rIn + u);
    const k = s.inward ? -1 : 1;
    // a surface point (its u, w) in the piece's plan, and a way of its own (its +u, +w) there
    const P = (u: number, w: number): [number, number] =>
      s.sweep === "line"
        ? [(s.du ?? 0) + u * ct - w * st, (s.dw ?? 0) + u * st + w * ct]
        : [(s.du ?? 0) + R(u) * Math.cos(turn + w), (s.dw ?? 0) + R(u) * Math.sin(turn + w)];
    const U = (w: number): [number, number] =>
      s.sweep === "line" ? [ct, st] : [k * Math.cos(turn + w), k * Math.sin(turn + w)];
    const Wd = (w: number): [number, number] =>
      s.sweep === "line" ? [-st, ct] : [-Math.sin(turn + w), Math.cos(turn + w)];
    const [w0, w1] = s.sweep === "line" ? [s.w0 * W, s.w1 * W] : [s.w0, s.w1];
    const ws: number[] = [];
    // (round a bowl's corner in 2° steps: a chord's sag on its steep wall under 3 mm)
    const nw = s.sweep === "line" ? 1 : Math.max(1, Math.ceil((w1 - w0) / TURN_STEP - 1e-6));
    for (let i = 0; i <= nw; i++) ws.push(w0 + ((w1 - w0) * i) / nw);
    // (the face's point — what lies on the floor itself lifted off it —, or at a height of its own)
    const at = (p: PP, w: number, z?: number): V3 => {
      const [x, y] = P(p.u, w);
      return to(x, y, z ?? (p.z <= 1e-6 ? FLOOR_LIFT : p.z));
    };
    // the riding face
    for (const run of runs)
      for (let i = 0; i + 1 < run.length; i++) {
        const a = run[i];
        const b = run[i + 1];
        if (Math.hypot(b.u - a.u, b.z - a.z) < 1e-6) continue;
        for (let j = 0; j + 1 < ws.length; j++) {
          const wm = (ws[j] + ws[j + 1]) / 2;
          const [ux, uy] = U(wm);
          const tm = { u: (a.tu + b.tu) / 2, z: (a.tz + b.tz) / 2 };
          const [px, py] = P((a.u + b.u) / 2, wm);
          // (its normal: the tangent turned up, in the plan along its +u)
          const n = dir([px, py, (a.z + b.z) / 2], [-tm.z * ux, -tm.z * uy, tm.u]);
          face.quad(at(a, ws[j]), at(b, ws[j]), at(b, ws[j + 1]), at(a, ws[j + 1]), n);
        }
      }
    // its sides down to the foot (each profile stretch over the ground under it), its ends
    const all = runs.flat();
    if (d.sides !== false)
      for (const w of [w0, w1]) {
        const [wx, wy] = Wd(w);
        const sgn = w === w0 ? -1 : 1;
        for (const run of runs)
          for (let i = 0; i + 1 < run.length; i++) {
            const a = run[i];
            const b = run[i + 1];
            if (Math.abs(b.u - a.u) < 1e-6) continue;
            const [px, py] = P((a.u + b.u) / 2, w);
            const n = dir([px, py, 0], [wx * sgn, wy * sgn, 0]);
            side.quad(at(a, w), at(b, w), at(b, w, base), at(a, w, base), n);
          }
      }
    for (const [p, out] of [
      [all[0], -1],
      [all[all.length - 1], 1],
    ] as const) {
      if (p.z - base < 0.01) continue;
      for (let j = 0; j + 1 < ws.length; j++) {
        const [ux, uy] = U((ws[j] + ws[j + 1]) / 2);
        const [px, py] = P(p.u, (ws[j] + ws[j + 1]) / 2);
        const n = dir([px, py, 0], [ux * out, uy * out, 0]);
        side.quad(at(p, ws[j]), at(p, ws[j + 1]), at(p, ws[j + 1], base), at(p, ws[j], base), n);
      }
    }
  }

  // the lines: copings, a box's edges, rails
  for (const ln of def.lines) {
    const scaleW = ln.what !== "rail" && def.surfaces[0]?.sweep === "line" ? W : 1;
    const pts = ln.pts.map(([u, w, z]): [number, number, number] => [u, w * scaleW, z]);
    if (ln.what === "coping" || ln.what === "ledge") {
      // a coping's rod 2 mm proud of the deck; a box's edge an angle iron flush with its top, a hair in
      const r = ln.what === "coping" ? COPING_R : 0.014;
      const drop = ln.what === "coping" ? r - 0.002 : r;
      // (an arc's line resampled round its middle: a bowl corner's coping a smooth ring)
      const round = def.surfaces[0]?.sweep === "turn";
      const ring: [number, number, number][] = [];
      if (round && pts.length > 2) {
        const R = Math.hypot(pts[0][0], pts[0][1]);
        const a0 = Math.atan2(pts[0][1], pts[0][0]);
        const a1 = Math.atan2(pts[pts.length - 1][1], pts[pts.length - 1][0]);
        const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / STEP));
        for (let i = 0; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          ring.push([R * Math.cos(a), R * Math.sin(a), pts[0][2]]);
        }
      }
      const line = ring.length ? ring : pts;
      // (an edge's iron pulled in toward the box's middle across)
      const inward = (p: [number, number, number]) => (ln.what === "ledge" ? (p[1] > 0 ? -r : r) : 0);
      const geo = tube(
        line.map((p) => to(p[0], p[1] + inward(p), p[2] - drop)),
        r,
        8,
        Math.max(1, (line.length - 1) * 2),
      );
      steel.push(geo);
      continue;
    }
    // a rail: the bar a straight tube a stretch, a ball at each kink; square posts down to the foot
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      steel.push(tube([to(a[0], a[1], a[2] - BAR_R), to(b[0], b[1], b[2] - BAR_R)], BAR_R, 10, 1));
      if (i > 0) {
        const g = ball(BAR_R, 10);
        const c = to(a[0], a[1], a[2] - BAR_R);
        g.translate(c[0], c[1], c[2]);
        steel.push(g);
      }
    }
    // the bar's end caps
    for (const p of [pts[0], pts[pts.length - 1]]) {
      const g = ball(BAR_R, 10);
      const c = to(p[0], p[1], p[2] - BAR_R);
      g.translate(c[0], c[1], c[2]);
      steel.push(g);
    }
    // posts: 0.3 in from each end, at each kink, and between no more than 2 m apart
    const total = pts.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    const stops = new Set<number>([0.3, total - 0.3]);
    let along = 0;
    for (let i = 1; i + 1 < pts.length; i++) {
      along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      stops.add(along);
    }
    const sorted = [...stops].sort((x, y) => x - y);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const gap = sorted[i + 1] - sorted[i];
      const k = Math.ceil(gap / 2 - 1e-6);
      for (let j = 1; j < k; j++) stops.add(sorted[i] + (gap * j) / k);
    }
    for (const t of stops) {
      // (the bar's point `t` along, plan)
      let rest = t;
      let p: [number, number, number] = pts[0];
      let dirU = 1;
      let dirW = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (rest <= l + 1e-6 || i + 2 === pts.length) {
          const k = l > 0 ? Math.min(1, rest / l) : 0;
          p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
          dirU = (b[0] - a[0]) / (l || 1);
          dirW = (b[1] - a[1]) / (l || 1);
          break;
        }
        rest -= l;
      }
      const top = p[2] - 2 * BAR_R;
      const h = top - base;
      if (h < 0.02) continue;
      const foot = to(p[0], p[1], base);
      const way = dir([p[0], p[1], 0], [dirU, dirW, 0]);
      const yaw = Math.atan2(-way[2], way[0]);
      const post = new BoxGeometry(POST, h, POST).rotateY(yaw).translate(foot[0], foot[1] + h / 2, foot[2]);
      const plate = new BoxGeometry(0.16, 0.01, 0.16).rotateY(yaw).translate(foot[0], foot[1] + 0.005, foot[2]);
      steel.push(post, plate);
    }
  }
  return {
    face: [face.geo()].filter((g): g is BufferGeometry => !!g),
    side: [side.geo()].filter((g): g is BufferGeometry => !!g),
    steel,
  };
}
