import { groundAt, type StreetThing } from "@yutopia/shared/grounds";
import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { place, tinted } from "./campus";

// The town's street furniture in 3D (docs/plan/33-the-look.md, phase 4; where it stands: shared
// grounds.ts STREET). Each a few primitives, coloured, merged with the rest; faceted (few sides);
// snow on whatever has a top. Its front is +z before it's turned.

const SNOW = 0xf2f5f8;
const cyl = (r0: number, r1: number, h: number, y: number, c: number, seg = 8) =>
  tinted(new CylinderGeometry(r1, r0, h, seg).translate(0, y + h / 2, 0), c);
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) =>
  tinted(new BoxGeometry(w, h, d).translate(x, y + h / 2, z), c);

function hydrant(): BufferGeometry[] {
  const red = 0xa8352a;
  return [
    cyl(0.17, 0.17, 0.08, 0, 0x7d281f),
    cyl(0.12, 0.12, 0.55, 0.08, red),
    cyl(0.15, 0.15, 0.06, 0.6, 0x7d281f),
    tinted(new SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.66, 0), red),
    cyl(0.03, 0.03, 0.05, 0.79, 0x7d281f, 6),
    // its two outlets, a cap each side, the big one to the street
    tinted(new CylinderGeometry(0.05, 0.05, 0.36, 6).rotateZ(Math.PI / 2).translate(0, 0.42, 0), red),
    tinted(new CylinderGeometry(0.07, 0.07, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0.38, 0.14), red),
    tinted(new SphereGeometry(0.135, 8, 3, 0, Math.PI * 2, 0, Math.PI / 3).translate(0, 0.7, 0), SNOW),
  ];
}
function bin(): BufferGeometry[] {
  const green = 0x2f4a3b;
  return [
    cyl(0.26, 0.28, 0.85, 0, green, 10),
    cyl(0.3, 0.3, 0.06, 0.85, 0x23382c, 10),
    cyl(0.12, 0.12, 0.05, 0.91, 0x23382c, 10),
    tinted(new CylinderGeometry(0.27, 0.29, 0.07, 10).translate(0, 0.95, 0), SNOW),
    box(0.3, 0.08, 0.02, 0, 0.6, 0.28, 0xd8d2c4), // a label band
  ];
}
function newsbox(): BufferGeometry[] {
  const blue = 0x2c4f7a;
  return [
    box(0.08, 0.5, 0.08, -0.18, 0, 0.15, 0x2a2e33),
    box(0.08, 0.5, 0.08, 0.18, 0, 0.15, 0x2a2e33),
    box(0.08, 0.5, 0.08, -0.18, 0, -0.15, 0x2a2e33),
    box(0.08, 0.5, 0.08, 0.18, 0, -0.15, 0x2a2e33),
    box(0.48, 0.62, 0.42, 0, 0.5, 0, blue),
    box(0.36, 0.26, 0.02, 0, 0.78, 0.215, 0xc9d2dc), // its window (the day's paper)
    box(0.5, 0.06, 0.44, 0, 1.12, 0, SNOW),
  ];
}
function pole(): BufferGeometry[] {
  const wood = 0x5a4434;
  return [
    cyl(0.16, 0.12, 8.6, 0, wood, 7),
    // the crossarm, its insulators, a transformer on one pole in three (the rest: just arms)
    // (across the street's line: the wires run along it)
    box(0.14, 0.14, 2.4, 0, 7.6, 0, wood),
    box(0.16, 0.04, 2.4, 0, 7.74, 0, SNOW),
    ...[-1.05, -0.35, 0.35, 1.05].map((z) => cyl(0.04, 0.03, 0.16, 7.74, 0xd8d6cc, 5).translate(0, 0, z)),
    cyl(0.17, 0.17, 0.04, 8.6, SNOW, 7),
  ];
}
function transformer(): BufferGeometry[] {
  return [
    cyl(0.26, 0.26, 0.75, 6.4, 0x6f767d, 8).translate(0.32, 0, 0),
    cyl(0.27, 0.27, 0.05, 7.15, SNOW, 8).translate(0.32, 0, 0),
  ];
}
function bench(): BufferGeometry[] {
  const iron = 0x22262b;
  const wood = 0x6a4b35;
  const out: BufferGeometry[] = [];
  for (const x of [-0.85, 0.85]) {
    out.push(box(0.08, 0.45, 0.5, x, 0, 0, iron));
    out.push(box(0.08, 0.5, 0.08, x, 0.45, -0.22, iron));
    out.push(box(0.08, 0.06, 0.45, x, 0.62, 0.02, iron)); // the armrest
  }
  for (const z of [-0.15, 0.02, 0.19]) out.push(box(2, 0.05, 0.14, 0, 0.45, z, wood));
  for (const y of [0.62, 0.8]) out.push(box(2, 0.12, 0.04, 0, y, -0.25, wood));
  out.push(box(1.9, 0.07, 0.48, 0, 0.5, 0.02, SNOW));
  out.push(box(2, 0.03, 0.06, 0, 0.92, -0.25, SNOW));
  return out;
}
function stop(): BufferGeometry[] {
  return [
    cyl(0.04, 0.04, 2.3, 0, 0x8b8f93, 6),
    tinted(
      new CylinderGeometry(0.38, 0.38, 0.04, 8)
        .rotateY(Math.PI / 8)
        .rotateX(Math.PI / 2)
        .translate(0, 2.25, 0.04),
      0xb3261e,
    ),
    tinted(
      new CylinderGeometry(0.33, 0.33, 0.045, 8)
        .rotateY(Math.PI / 8)
        .rotateX(Math.PI / 2)
        .translate(0, 2.25, 0.05),
      0xc8322a,
    ),
    box(0.4, 0.09, 0.01, 0, 2.2, 0.075, 0xf2efe8), // STOP, as a white bar from afar
    box(0.5, 0.05, 0.06, 0, 2.62, 0.04, SNOW),
  ];
}
function streetsign(): BufferGeometry[] {
  return [
    cyl(0.04, 0.04, 2.9, 0, 0x8b8f93, 6),
    box(1.3, 0.24, 0.03, 0.45, 2.55, 0, 0x2f5a3c),
    box(0.03, 0.24, 1.3, 0, 2.82, 0.45, 0x2f5a3c),
    box(1.3, 0.03, 0.05, 0.45, 2.79, 0, SNOW),
    box(0.05, 0.03, 1.3, 0, 3.06, 0.45, SNOW),
    tinted(new ConeGeometry(0.06, 0.12, 6).translate(0, 3.15, 0), 0x8b8f93),
  ];
}
function postbox(): BufferGeometry[] {
  const blue = 0x2b4d82;
  return [
    box(0.08, 0.3, 0.08, -0.2, 0, -0.2, 0x1f2a3a),
    box(0.08, 0.3, 0.08, 0.2, 0, -0.2, 0x1f2a3a),
    box(0.08, 0.3, 0.08, -0.2, 0, 0.2, 0x1f2a3a),
    box(0.08, 0.3, 0.08, 0.2, 0, 0.2, 0x1f2a3a),
    box(0.52, 0.75, 0.5, 0, 0.3, 0, blue),
    tinted(
      new CylinderGeometry(0.26, 0.26, 0.5, 10, 1, false, 0, Math.PI)
        .rotateZ(Math.PI / 2)
        .rotateY(Math.PI / 2)
        .translate(0, 1.05, 0),
      blue,
    ),
    box(0.3, 0.04, 0.02, 0, 0.92, 0.26, 0x1f2a3a), // the slot
    tinted(
      new CylinderGeometry(0.24, 0.24, 0.46, 10, 1, false, 0, Math.PI)
        .rotateZ(Math.PI / 2)
        .rotateY(Math.PI / 2)
        .scale(1, 0.4, 1)
        .translate(0, 1.2, 0),
      SNOW,
    ),
  ];
}

// ── god mode's own (docs/plan/53-the-god-mode.md, phase 8: shapes/grounds.ts their solids) ──
function boulder(): BufferGeometry[] {
  // a faceted rock, squat, the snow on its top
  return [
    tinted(new IcosahedronGeometry(0.85, 0).scale(1, 0.62, 0.9).translate(0, 0.5, 0), 0x7c8187),
    tinted(new IcosahedronGeometry(0.62, 0).scale(1, 0.32, 0.85).translate(0.04, 0.9, 0), SNOW),
  ];
}
function planter(): BufferGeometry[] {
  const wood = 0x6a4b35;
  return [
    box(1.2, 0.5, 1.2, 0, 0, 0, wood),
    box(1.26, 0.06, 1.26, 0, 0.5, 0, 0x553a28), // its rim
    box(1.08, 0.04, 1.08, 0, 0.5, 0, SNOW),
    cyl(0.07, 0.07, 0.5, 0.5, 0x4a3a2c, 6),
    // a little spruce in it, snow on its tiers
    ...[0, 1, 2].map((i) =>
      tinted(new ConeGeometry(0.55 - i * 0.14, 0.7, 7).translate(0, 1.15 + i * 0.42, 0), 0x2c4a36),
    ),
    tinted(new ConeGeometry(0.2, 0.3, 7).translate(0, 2.15, 0), SNOW),
  ];
}
function sign(): BufferGeometry[] {
  const wood = 0x5a4434;
  return [
    cyl(0.06, 0.06, 2.0, 0, wood, 6),
    box(1.6, 0.7, 0.07, 0, 1.3, 0, 0x3e2f24), // the board (its words: signFaces)
    box(1.64, 0.05, 0.1, 0, 2.0, 0, SNOW),
  ];
}
/** A fence along its line: split rails on posts every 2.5 m, the land's height under each. */
function fence(t: StreetThing): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const pts = t.pts ?? [];
  const wood = 0x6b5440;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 2.5));
    const a = Math.atan2(bz - az, bx - ax);
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 1) continue;
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      out.push(cyl(0.07, 0.06, 1.15, groundAt(x, z), wood, 5).translate(x, 0, z));
      out.push(cyl(0.08, 0.08, 0.04, groundAt(x, z) + 1.15, SNOW, 5).translate(x, 0, z));
    }
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n;
      const z0 = az + ((bz - az) * k) / n;
      const x1 = ax + ((bx - ax) * (k + 1)) / n;
      const z1 = az + ((bz - az) * (k + 1)) / n;
      const y0 = groundAt(x0, z0);
      const y1 = groundAt(x1, z1);
      const l = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      for (const [h, c] of [
        [0.45, wood],
        [0.9, wood],
        [0.94, SNOW],
      ] as const) {
        const g = new BoxGeometry(l, h === 0.94 ? 0.03 : 0.09, h === 0.94 ? 0.1 : 0.07);
        g.rotateZ(Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)));
        g.rotateY(-a);
        g.translate((x0 + x1) / 2, (y0 + y1) / 2 + h, (z0 + z1) / 2);
        out.push(tinted(g, c));
      }
    }
  }
  return out;
}
/** A sign's words: a face either side of its board, in place (its own picture: grounds3d.ts). */
export function signFaces(t: StreetThing): BufferGeometry[] {
  const y = groundAt(t.x, t.z);
  return [0, Math.PI].map((r) =>
    place(new PlaneGeometry(1.5, 0.6).rotateY(r).translate(0, 1.65, r ? -0.04 : 0.04), t.x, y, t.z, t.ry),
  );
}

const MAKE: Record<StreetThing["kind"], () => BufferGeometry[]> = {
  hydrant,
  bin,
  newsbox,
  pole,
  bench,
  stop,
  streetsign,
  postbox,
  boulder,
  planter,
  sign,
  fence: () => [], // (along its line: fence())
};
const SIZED = new Set<StreetThing["kind"]>(["boulder", "planter"]);

/** Every street thing's parts in place, and the wires sagging from pole to pole. */
export function streetGeometry(things: StreetThing[]): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const poles: StreetThing[] = [];
  for (const [i, t] of things.entries()) {
    const y = groundAt(t.x, t.z);
    // (a bench is two tiles: (x, z) its west one's corner)
    const [cx, cz] = t.kind === "bench" ? [t.x + 1, t.z + 0.5] : [t.x, t.z];
    if (t.kind === "fence") {
      out.push(...fence(t));
      continue;
    }
    const parts = [...MAKE[t.kind](), ...(t.kind === "pole" && i % 3 === 1 ? transformer() : [])];
    const k = SIZED.has(t.kind) ? (t.s ?? 1) : 1;
    for (const p of parts) out.push(place(k === 1 ? p : p.scale(k, k, k), cx, y, cz, t.ry));
    if (t.kind === "pole") poles.push(t);
  }
  // the wires: four, each a chain of thin boxes sagging between two arms
  poles.sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i];
    const b = poles[i + 1];
    // (a pole put down far off — god mode's — isn't wired to the town's)
    if (Math.hypot(b.x - a.x, b.z - a.z) > 70) continue;
    const ya = groundAt(a.x, a.z) + 7.86;
    const yb = groundAt(b.x, b.z) + 7.86;
    for (const off of [-1.05, -0.35, 0.35, 1.05]) {
      const n = 10;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const sag = (t: number) => -4 * 0.55 * t * (1 - t);
        const p0 = [a.x + (b.x - a.x) * t0, ya + (yb - ya) * t0 + sag(t0), a.z + (b.z - a.z) * t0 + off];
        const p1 = [a.x + (b.x - a.x) * t1, ya + (yb - ya) * t1 + sag(t1), a.z + (b.z - a.z) * t1 + off];
        const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        const g = new BoxGeometry(l, 0.025, 0.025);
        g.rotateZ(Math.atan2(p1[1] - p0[1], Math.hypot(p1[0] - p0[0], p1[2] - p0[2])));
        g.rotateY(-Math.atan2(p1[2] - p0[2], p1[0] - p0[0]));
        g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
        out.push(tinted(g, 0x1c1f22));
      }
    }
  }
  return out;
}
