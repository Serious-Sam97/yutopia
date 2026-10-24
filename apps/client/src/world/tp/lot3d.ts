import { type LotLayout, type LotRect, lotBanksOf, lotStripes } from "@yutopia/shared/lot";
import { type BufferGeometry, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { G, place, tinted } from "./campus";
import type { Themes } from "./sky";
import { ridge, SNOW, type Station } from "./snow3d";

// The headquarters' lot in 3D (docs/plan/42-the-lot.md), drawn from the shared
// layout (packages/shared lot.ts): the asphalt's paint, the kerbs and islands,
// the pavement along the building, the plough's windrows and its dump, the
// snow left in the empty bays, the sign at the mouth.

const KERB = 0x9ea2a6;
const KERB_H = 0.15;
const PAVE_H = 0.08;
const CONCRETE = 0xbab9b4;

/** The asphalt in plan, `px` a tile: ploughed, wet patches, the tyres' tracks round the aisles'
 *  loop, the bays' lines, the accessible bays' blue and hatching, VISITOR stencils, the stop
 *  line; packed snow on the dump's strip, concrete slabs on the pavement. */
export function lotPaintCanvas(T: Themes, l: LotLayout, px: number): HTMLCanvasElement {
  const W = Math.round((l.x1 - l.x0) * px);
  const H = Math.round((l.z1 - l.z0) * px);
  const { c, g } = T.canvas(W, H);
  const r = T.rng(97);
  const X = (x: number) => (x - l.x0) * px;
  const Z = (z: number) => (z - l.z0) * px;
  const rect = (q: LotRect) => [X(q.x0), Z(q.z0), (q.x1 - q.x0) * px, (q.z1 - q.z0) * px] as const;
  g.fillStyle = "#3a3d42";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * H;
    const w = 20 + r() * 80;
    const grd = g.createRadialGradient(x, y, 0, x, y, w);
    grd.addColorStop(0, r() < 0.5 ? "rgba(90,96,104,0.5)" : "rgba(20,22,26,0.4)");
    grd.addColorStop(1, "rgba(60,64,70,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, w, w * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  // snow left in the corners, thicker along the rows' backs
  g.fillStyle = "rgba(240,243,247,0.5)";
  for (let i = 0; i < 180; i++) {
    g.beginPath();
    g.ellipse(r() * W, r() * H, 3 + r() * 10, 2 + r() * 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // the tyres' tracks: up the mouth, round the loop (the aisles and the cross aisles)
  g.strokeStyle = "rgba(15,17,20,0.28)";
  g.lineWidth = px * 0.3;
  const [cn, cs] = l.cross;
  const zN = (cn.z0 + cn.z1) / 2;
  const zS = (cs.z0 + cs.z1) / 2;
  const track = (pts: [number, number][], off: number) => {
    g.beginPath();
    pts.forEach(([x, z], i) => {
      const w = Math.sin(z / 4.5 + x / 7) * 0.25;
      if (i === 0) g.moveTo(X(x + off + w), Z(z));
      else g.lineTo(X(x + off + w), Z(z));
    });
    g.stroke();
  };
  for (const off of [-0.9, 0.9]) {
    for (const ax of l.aisles) {
      const pts: [number, number][] = [];
      for (let z = l.z0; z <= l.z1; z += 1.2) pts.push([ax, z]);
      track(pts, off);
    }
    for (const zc of [zN, zS]) {
      g.beginPath();
      for (let x = l.aisles[0]; x <= l.aisles[1]; x += 1.2) {
        const y = Z(zc + off + Math.sin(x / 5) * 0.2);
        if (x === l.aisles[0]) g.moveTo(X(x), y);
        else g.lineTo(X(x), y);
      }
      g.stroke();
    }
  }
  // the dump's strip: packed snow under the heaps
  g.fillStyle = "#cfd4d9";
  g.fillRect(...rect(l.dump));
  for (let i = 0; i < 120; i++) {
    const [x0, y0, w, h] = rect(l.dump);
    g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "150,156,164"},${0.15 + r() * 0.2})`;
    g.beginPath();
    g.ellipse(x0 + r() * w, y0 + r() * h, 4 + r() * 12, 2 + r() * 6, r(), 0, Math.PI * 2);
    g.fill();
  }
  // the pavement: concrete slabs, salted, a dusting at the edges
  g.fillStyle = "#bab9b4";
  g.fillRect(...rect(l.pavement));
  g.strokeStyle = "rgba(80,80,80,0.35)";
  g.lineWidth = Math.max(1, px * 0.06);
  for (let z = l.z0; z < l.z1; z += 1.5) {
    g.beginPath();
    g.moveTo(X(l.pavement.x0), Z(z));
    g.lineTo(X(l.pavement.x1), Z(z));
    g.stroke();
  }
  // the accessible bays: blue, a white figure; the strip between them hatched
  for (const b of l.bays) {
    if (b.kind !== "accessible") continue;
    g.fillStyle = "rgba(47,95,158,0.85)";
    g.fillRect(X(b.x - l.bayL / 2 + 0.15), Z(b.z - l.bayW / 2 + 0.12), (l.bayL - 0.3) * px, (l.bayW - 0.24) * px);
    figure(g, X(b.x), Z(b.z), px);
  }
  g.strokeStyle = "rgba(238,240,242,0.88)";
  g.lineWidth = Math.max(1.5, px * 0.12);
  for (const h of l.hatches) {
    const [x0, y0, w, hh] = rect(h);
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, hh);
    g.clip();
    for (let d = -hh; d < w; d += px * 0.6) {
      g.beginPath();
      g.moveTo(x0 + d, y0 + hh);
      g.lineTo(x0 + d + hh, y0);
      g.stroke();
    }
    g.restore();
    g.strokeRect(x0, y0, w, hh);
  }
  // the lines
  g.fillStyle = "rgba(235,238,240,0.88)";
  for (const [x, z, w, h] of lotStripes(l)) g.fillRect(X(x), Z(z), Math.max(1.5, w * px), Math.max(1.5, h * px));
  // VISITOR, written to be read driving in (its top towards the bay's nose)
  g.fillStyle = "rgba(238,240,242,0.88)";
  g.font = `700 ${Math.round(px * 0.62)}px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const b of l.bays) {
    if (b.kind !== "visitor") continue;
    g.save();
    g.translate(X(b.x - b.dir * 0.4), Z(b.z));
    g.rotate(b.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.fillText("VISITOR", 0, 0);
    g.restore();
  }
  return c;
}

/** The accessible bay's pictogram, a person in a chair, at (x, y) on the paint. */
function figure(g: CanvasRenderingContext2D, x: number, y: number, px: number) {
  const s = px * 0.55;
  g.save();
  g.translate(x, y);
  g.strokeStyle = "rgba(240,242,244,0.95)";
  g.fillStyle = "rgba(240,242,244,0.95)";
  g.lineWidth = s * 0.16;
  g.lineCap = "round";
  g.beginPath();
  g.arc(-s * 0.1, -s * 0.95, s * 0.17, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-s * 0.15, -s * 0.7);
  g.lineTo(-s * 0.15, -s * 0.1);
  g.lineTo(s * 0.35, -s * 0.1);
  g.lineTo(s * 0.5, s * 0.35);
  g.moveTo(-s * 0.15, -s * 0.5);
  g.lineTo(s * 0.25, -s * 0.5);
  g.stroke();
  g.beginPath();
  g.arc(-s * 0.1, s * 0.15, s * 0.45, Math.PI * 0.2, Math.PI * 1.55);
  g.stroke();
  g.restore();
}

/** The lot's sign at the mouth: white on dark blue, the parking P. */
export function lotSignCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(384, 256);
  g.fillStyle = "#1f3554";
  g.fillRect(0, 0, 384, 256);
  g.strokeStyle = "#e9edf1";
  g.lineWidth = 8;
  g.strokeRect(10, 10, 364, 236);
  g.fillStyle = "#e9edf1";
  g.fillRect(30, 34, 120, 120);
  g.fillStyle = "#1f3554";
  g.font = `700 104px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("P", 90, 98);
  g.fillStyle = "#e9edf1";
  g.textAlign = "left";
  g.font = `700 40px "Helvetica Neue", Arial, sans-serif`;
  g.fillText("PARKING", 170, 72);
  g.font = `500 28px "Helvetica Neue", Arial, sans-serif`;
  g.fillText("Staff", 170, 118);
  g.fillText("Visitors", 170, 150);
  g.font = `500 24px "Helvetica Neue", Arial, sans-serif`;
  g.fillText("Visitors: by the doors", 30, 206);
  return c;
}

export interface LotDressing {
  /** kerbs, islands, the pavement, the sign's posts and back (vertex coloured) */
  solid: BufferGeometry;
  /** the windrows, the dump's heaps, the snow on the islands and in the empty bays */
  snow: BufferGeometry;
  /** the sign's face (its uvs on lotSignCanvas) */
  sign: BufferGeometry;
}

/** The lot's geometry over its painted asphalt (the asphalt at y `y0`); `parked`: where cars
 *  stand now (no snow in their bays; null: none in any bay). */
export function lotDressing(l: LotLayout, parked: { x: number; z: number }[] | null, y0 = 0.03): LotDressing {
  const s = new G();
  const flat = () => y0;
  // the kerbs: the dump's (west) edge and the pavement's (east), their whole length
  s.color(KERB);
  s.box(l.dump.x1 - 0.25, y0, l.z0, l.dump.x1, y0 + KERB_H, l.z1);
  s.box(l.pavement.x0, y0, l.z0, l.pavement.x0 + 0.25, y0 + KERB_H, l.z1);
  // the pavement: slabs a little up, flush with its kerb's top but for the kerb's rounding
  s.color(CONCRETE);
  s.box(l.pavement.x0 + 0.25, y0, l.z0, l.pavement.x1, y0 + PAVE_H, l.z1);
  // the islands: a kerb round a raised bed of snow
  for (const i of l.islands) {
    s.color(KERB);
    const x0 = i.x0 + 0.08;
    const x1 = i.x1 - 0.08;
    const z0 = i.z0 + 0.1;
    const z1 = i.z1 - 0.1;
    s.box(x0, y0, z0, x1, y0 + KERB_H, z0 + 0.22);
    s.box(x0, y0, z1 - 0.22, x1, y0 + KERB_H, z1);
    s.box(x0, y0, z0 + 0.22, x0 + 0.22, y0 + KERB_H, z1 - 0.22);
    s.box(x1 - 0.22, y0, z0 + 0.22, x1, y0 + KERB_H, z1 - 0.22);
    s.color(0xe4e9ee);
    s.box(x0 + 0.22, y0, z0 + 0.22, x1 - 0.22, y0 + KERB_H - 0.02, z1 - 0.22);
  }
  // the sign: two posts, a board facing the way in
  const sg = new G().color(0x5a5f66);
  sg.box(-1.05, 0, -0.05, -0.95, 3.1, 0.05);
  sg.box(0.95, 0, -0.05, 1.05, 3.1, 0.05);
  sg.color(0x2a2e33);
  sg.box(-1.25, 1.35, -0.06, 1.25, 3.0, -0.01);
  const solid = mergeGeometries([s.build(), place(sg.build(), l.sign.x, y0, l.sign.z, l.sign.ry)], false);
  const face = new G().color(0xffffff);
  face.quad([-1.22, 1.38, 0], [1.22, 1.38, 0], [1.22, 2.97, 0], [-1.22, 2.97, 0], [0, 0, 1]);
  const sign = place(face.build(), l.sign.x, y0, l.sign.z, l.sign.ry);

  // ── the snow ──
  const sn = new G();
  const parts: BufferGeometry[] = [];
  const r = rngOf(41);
  const banks = lotBanksOf(l);
  // the windrows along the north and south edges: ridges through the shared mounds, broken where
  // they're apart (the mouth)
  for (const side of [-1, 1]) {
    const pts = banks
      .filter((k) => k.x >= l.dump.x1 - 0.5 && (side < 0 ? k.z < l.z0 : k.z > l.z1))
      .sort((a, b) => a.x - b.x);
    let run: typeof pts = [];
    const flush = () => {
      if (run.length < 2) return;
      const st: Station[] = run.map((k) => ({ x: k.x, z: k.z, nx: 0, nz: side, k: 0.7 + k.s * 0.35 }));
      st.unshift({ ...st[0], x: st[0].x - 1.4, k: 0 });
      const e = st[st.length - 1];
      st.push({ ...e, x: e.x + 1.4, k: 0 });
      ridge(
        sn,
        st.map((q) => ({ ...q, k: q.k * (0.85 + r() * 0.3) })),
        [
          [-1.3, -1],
          [-0.7, 0.5],
          [0, 0.7],
          [0.8, 0.45],
          [1.6, -1],
        ],
        flat,
      );
    };
    for (const k of pts) {
      const last = run[run.length - 1];
      if (last && k.x - last.x > 3.2) {
        flush();
        run = [];
      }
      run.push(k);
    }
    flush();
  }
  // the dump: heaps, pushed up big and grey-white
  for (const k of banks.filter((b) => b.x < l.dump.x1 - 0.5)) {
    parts.push(
      place(
        tinted(heap(k.s, k.s * 0.62, k.sz, k.x * 7 + k.z), r() < 0.4 ? 0xdde2e7 : 0xeef2f5),
        k.x,
        y0 - 0.05,
        k.z,
        k.ry,
      ),
    );
  }
  // a mound on each island
  for (const i of l.islands) {
    const hx = (i.x1 - i.x0) / 2 - 0.45;
    const hz = (i.z1 - i.z0) / 2 - 0.45;
    parts.push(
      place(
        tinted(heap(hx, 0.28, hz, i.x0 + i.z0 * 3), SNOW),
        (i.x0 + i.x1) / 2,
        y0 + KERB_H - 0.04,
        (i.z0 + i.z1) / 2,
      ),
    );
  }
  if (parked) parts.push(baySnow(l, parked, y0));
  parts.push(sn.build());
  return {
    solid,
    snow: mergeGeometries(
      parts.map((p) => p.toNonIndexed()),
      false,
    ),
    sign,
  };
}

/** A heap of snow, (sx, sy, sz) its half-sizes, lumpy by `seed`: its corners moved by where they
 *  are, so the faces that share one stay joined (no cracks, no shards). */
function heap(sx: number, sy: number, sz: number, seed: number): BufferGeometry {
  const geo = new IcosahedronGeometry(1, 2);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = Math.sin(x * 3.1 + seed) * Math.sin(z * 2.7 - seed * 0.7) * Math.cos(y * 2.3 + seed * 1.3);
    const j = 0.9 + 0.12 * h;
    pos.setXYZ(i, x * sx * j, Math.max(-0.08, y) * sy * j, z * sz * j);
  }
  geo.computeVertexNormals();
  return geo;
}

/** The snow the plough left against the backs of the lot's empty bays (`parked`: where cars stand
 *  now; the asphalt at y `y0`). */
export function baySnow(l: LotLayout, parked: { x: number; z: number }[], y0 = 0.03): BufferGeometry {
  const sn = new G();
  const r = rngOf(43);
  const flat = () => y0;
  for (const b of l.bays) {
    if (parked.some((c) => Math.abs(c.x - b.x) < 1.6 && Math.abs(c.z - b.z) < 1.2)) continue;
    const row = l.rows.find((q) => q.key === b.row);
    if (!row) continue;
    const n = Math.sign(row.aisle - row.back);
    const x = row.back + n * 0.05;
    const st: Station[] = [];
    for (let t = -1.25; t <= 1.25 + 1e-6; t += 0.5) {
      const end = Math.min(1, (1.25 - Math.abs(t)) / 0.45);
      st.push({ x, z: b.z + t, nx: n, nz: 0, k: (0.45 + r() * 0.2) * end });
    }
    ridge(
      sn,
      st,
      [
        [-0.05, -1],
        [0.05, 0.42],
        [0.35, 0.36],
        [0.75, 0.18],
        [1.15, -1],
      ],
      flat,
    );
  }
  return sn.build();
}

function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
