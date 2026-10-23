import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  BufferGeometry as Geo,
  Group,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Door, Lights, Sedan, SedanOpts, Wheel } from "./sedan";
import { wearable } from "./sedan";
import * as T from "./textures";

// The kit the vehicles beyond the sedan's bodies are built with (docs/plan/34-the-vehicles.md:
// the snowmobile, the snowcat, the plough truck, the tractor, the toboggan), to the sedan's
// `Sedan` parts so the rig, the camera, the people in their seats and the wear all work on them as
// they are. As the sedan's: metres, standing on the ground at y 0, centred on the footprint, the
// nose to −x, +z its left (the driver's side); `u` runs nose (0) to tail (L).
//
// The shapes: side profiles extruded across and bevelled (`prof`), top outlines extruded up
// (`plan`), rounded boxes, lofts through cross-sections (`loft`, `sect`: the hoods, the cowls, the
// seats), tubes along a path (rails, roll bars, handlebars), lathe-turned tyres with their tread,
// steel rims and their nuts, track loops with their cleats, round lamps with their lenses. Flat
// facets, as the world's (the stylized look).

export type P2 = [number, number];
export type V3 = [number, number, number];

/** A rounded trapezoid's ring for `loft` ([y, z] points): bottom y0 to top y1, half-widths `hb` at
 *  the bottom and `ht` at the top, its top corners rounded `rt`, its bottom ones `rb`. Ordered top →
 *  −z side → bottom → +z side (the loft's faces turn outward with it); always 4n + 4 points. */
export function sect(y0: number, y1: number, hb: number, ht: number, rt: number, rb: number, n = 3): P2[] {
  const half: [number, number][] = [[y1, 0]]; // [y, s] with s = −z
  rt = Math.min(rt, ht * 0.98, (y1 - y0) * 0.49);
  rb = Math.min(rb, hb * 0.98, (y1 - y0) * 0.49);
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (1 - i / n);
    half.push([y1 - rt + rt * Math.sin(a), ht - rt + rt * Math.cos(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = -(Math.PI / 2) * (i / n);
    half.push([y0 + rb + rb * Math.sin(a), hb - rb + rb * Math.cos(a)]);
  }
  half.push([y0, 0]);
  const ring: P2[] = half.map(([y, s]) => [y, -s]);
  for (let i = half.length - 2; i >= 1; i--) ring.push([half[i][0], half[i][1]]);
  return ring;
}

/** A canvas texture of a few lines of text (a decal, a stencil): transparent round it. */
function textTex(
  lines: string[],
  o: { w?: number; h?: number; colour?: string; font?: string; bg?: string; border?: string } = {},
): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = o.w ?? 512;
  c.height = o.h ?? 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  if (o.bg) {
    g.fillStyle = o.bg;
    g.beginPath();
    g.roundRect(4, 4, c.width - 8, c.height - 8, c.height * 0.12);
    g.fill();
  }
  if (o.border) {
    g.strokeStyle = o.border;
    g.lineWidth = c.height * 0.05;
    g.beginPath();
    g.roundRect(8, 8, c.width - 16, c.height - 16, c.height * 0.1);
    g.stroke();
  }
  g.fillStyle = o.colour ?? "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lh = c.height / lines.length;
  lines.forEach((l, i) => {
    g.font = o.font ?? `800 ${Math.round(lh * 0.62)}px "DIN Condensed", "Arial Narrow", Arial, sans-serif`;
    g.fillText(l, c.width / 2, lh * (i + 0.54));
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The materials, the shapes, a mesh per material, the interface: what every builder starts with. */
export function kit(o: SedanOpts, L: number, W: number) {
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const wear = {
    uGrime: { value: 0 },
    uDmg: { value: new Vector4(0, 0, 0, 0) },
    uEnds: { value: new Vector3(-L / 2, L / 2, W / 2) },
  };
  const outside: (MeshStandardMaterial | MeshPhysicalMaterial)[] = [];
  /** A material of its own: `out` (the default) takes the sky's reflection and the wear. */
  const tone = (
    colour: string | number,
    p: { rough?: number; metal?: number; coat?: number; out?: boolean; dirt?: boolean; map?: Texture } = {},
  ) => {
    const m = keep(
      p.coat
        ? new MeshPhysicalMaterial({
            color: colour,
            roughness: p.rough ?? 0.42,
            metalness: p.metal ?? 0.05,
            clearcoat: p.coat,
            clearcoatRoughness: 0.12,
            envMapIntensity: 0.4,
            map: p.map ?? null,
          })
        : new MeshStandardMaterial({
            color: colour,
            roughness: p.rough ?? 0.6,
            metalness: p.metal ?? 0.05,
            map: p.map ?? null,
          }),
    );
    if (p.out !== false) {
      outside.push(m);
      wearable(m, wear, p.dirt ?? true);
    }
    return m;
  };
  const paint = tone(o.colour, { coat: 0.5 });
  const satin = tone("#18191b", { rough: 0.6, metal: 0.1 });
  const steel = tone("#5d6166", { rough: 0.45, metal: 0.6 });
  const chrome = tone("#d9dde0", { rough: 0.14, metal: 1 });
  chrome.envMapIntensity = 1.1;
  const rubber = tone("#141516", { rough: 0.95, dirt: false });
  const treadTex = keep(T.tread());
  const tyreMat = tone("#ffffff", { rough: 0.92, map: treadTex, dirt: false });
  const seat = tone("#2a221d", { rough: 0.7, out: false });
  const dark = tone("#0e0f10", { rough: 0.9, out: false });
  const glass = keep(
    new MeshPhysicalMaterial({
      color: "#2b3940",
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: DoubleSide,
      envMapIntensity: 1.4,
    }),
  );
  outside.push(glass);
  const grid = keep(T.lens("grid"));
  const ribs = keep(T.lens("ribs"));
  /** A lamp's lens: its colour, its glow, its pattern (lit through `emissiveIntensity`). */
  const lensOf = (colour: string, glow: string, map: Texture) => {
    const m = tone(colour, { rough: 0.2, metal: 0.25, map, dirt: false });
    m.emissive.set(glow);
    m.emissiveMap = map;
    m.emissiveIntensity = 0;
    return m;
  };
  const headLens = lensOf("#e9e6dc", "#fff3d6", grid);
  const red = lensOf("#6e100c", "#ff2a14", ribs);
  const amber = lensOf("#b8661a", "#ff9a2a", ribs);
  const snowMat = tone("#f3f6f9", { rough: 0.88, out: false });
  const plateTex = keep(T.plate(o.plate ?? "YTP·1986"));
  const plateMat = tone("#ffffff", { rough: 0.5, map: plateTex, dirt: false });
  plateMat.emissive.set("#ffffff");
  plateMat.emissiveMap = plateTex;
  const diamondTex = keep(T.diamond());
  const tread = tone("#9aa0a6", { rough: 0.4, metal: 0.7, map: diamondTex });
  // the dash's gauges (lit with the dash)
  const gaugeTex = keep(T.gauges());
  const gauge = tone("#ffffff", { rough: 0.35, map: gaugeTex, out: false });
  gauge.emissive.set("#ffd9a0");
  gauge.emissiveMap = gaugeTex;

  const root = new Group();
  const body = new Group();
  root.add(body);
  const ux = (u: number) => u - L / 2;

  // ── a bucket of geometry per material, merged into a mesh each ──
  const bucket = () => {
    const by = new Map<Material, BufferGeometry[]>();
    return {
      add: (m: Material, ...gs: BufferGeometry[]) => {
        const a = by.get(m) ?? [];
        by.set(m, a);
        a.push(...gs);
      },
      build: (into: Group) => {
        for (const [m, gs] of by) {
          const ready = gs.map((g) => {
            const n = g.index ? g.toNonIndexed() : g;
            if (!n.getAttribute("uv"))
              n.setAttribute(
                "uv",
                new Float32BufferAttribute(new Float32Array(n.getAttribute("position").count * 2), 2),
              );
            if (!n.getAttribute("normal")) n.computeVertexNormals();
            for (const k of Object.keys(n.attributes))
              if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
            return n;
          });
          const mesh = new Mesh(mergeGeometries(ready, false), m);
          mesh.castShadow = !(m as MeshStandardMaterial).transparent;
          mesh.receiveShadow = true;
          if ((m as MeshStandardMaterial).transparent) mesh.renderOrder = 2;
          into.add(mesh);
          for (const g of new Set([...gs, ...ready])) g.dispose();
        }
        by.clear();
      },
    };
  };
  const B = bucket();
  const add = B.add;

  // ── shapes (model coords out; u along, y up, z across) ──
  /** A box between its corners. */
  const box = (u0: number, u1: number, y0: number, y1: number, z0: number, z1: number) =>
    new BoxGeometry(Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate(
      ux((u0 + u1) / 2),
      (y0 + y1) / 2,
      (z0 + z1) / 2,
    );
  const extrude = (pts: P2[], depth: number, bevel: number) =>
    new ExtrudeGeometry(new Shape(pts.map(([a, b]) => new Vector2(a, b))), {
      depth: Math.max(0.001, depth),
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2,
      curveSegments: 6,
    });
  /** A side profile ([u, y]) extruded across z0..z1, its edges bevelled (inside z0..z1). */
  const prof = (pts: P2[], z0: number, z1: number, bevel = 0) => {
    const b = Math.min(bevel, Math.abs(z1 - z0) * 0.45);
    return extrude(pts, Math.abs(z1 - z0) - 2 * b, b).translate(-L / 2, 0, Math.min(z0, z1) + b);
  };
  /** A top outline ([u, z]) extruded up y0..y1, its edges bevelled. */
  const plan = (pts: P2[], y0: number, y1: number, bevel = 0) => {
    const b = Math.min(bevel, (y1 - y0) * 0.45);
    return extrude(pts, y1 - y0 - 2 * b, b)
      .rotateX(Math.PI / 2)
      .translate(-L / 2, y1 - b, 0);
  };
  /** A box with its edges and corners rounded `r`. */
  const rbox = (u0: number, u1: number, y0: number, y1: number, z0: number, z1: number, r = 0.03) => {
    const b = Math.min(r, Math.abs(z1 - z0) * 0.45, Math.abs(u1 - u0) * 0.45, Math.abs(y1 - y0) * 0.45);
    const a0 = Math.min(u0, u1) + b;
    const a1 = Math.max(u0, u1) - b;
    const c0 = Math.min(y0, y1) + b;
    const c1 = Math.max(y0, y1) - b;
    return prof(
      [
        [a0, c0],
        [a1, c0],
        [a1, c1],
        [a0, c1],
      ],
      Math.min(z0, z1),
      Math.max(z0, z1),
      b,
    );
  };
  /** Through cross-sections ([y, z] rings of the same length, `sect`), each at its u: the faces
   *  between them, the ends capped. */
  const loft = (secs: { u: number; ring: P2[]; dy?: number }[], cap0 = true, cap1 = true) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const P = (s: { u: number; ring: P2[]; dy?: number }, i: number): V3 => [
      ux(s.u),
      s.ring[i % s.ring.length][0] + (s.dy ?? 0),
      s.ring[i % s.ring.length][1],
    ];
    const tri = (a: V3, b: V3, c: V3) => {
      pos.push(...a, ...b, ...c);
      uv.push(a[0], a[1], b[0], b[1], c[0], c[1]);
    };
    for (let k = 0; k < secs.length - 1; k++) {
      const s0 = secs[k];
      const s1 = secs[k + 1];
      const n = s0.ring.length;
      for (let i = 0; i < n; i++) {
        const a0 = P(s0, i);
        const a1 = P(s0, i + 1);
        const b0 = P(s1, i);
        const b1 = P(s1, i + 1);
        tri(a0, b0, a1);
        tri(a1, b0, b1);
      }
    }
    const fan = (s: { u: number; ring: P2[]; dy?: number }, flip: boolean) => {
      const c: V3 = [ux(s.u), s.ring.reduce((a, p) => a + p[0], 0) / s.ring.length + (s.dy ?? 0), 0];
      for (let i = 0; i < s.ring.length; i++) {
        const a = P(s, i);
        const b = P(s, i + 1);
        if (flip) tri(c, b, a);
        else tri(c, a, b);
      }
    };
    if (cap0) fan(secs[0], false);
    if (cap1) fan(secs[secs.length - 1], true);
    const g = new Geo();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  /** A tube through points ([u, y, z]), `r` round. */
  const tube = (pts: V3[], r: number, radial = 8, closed = false) => {
    const c = new CatmullRomCurve3(
      pts.map(([u, y, z]) => new Vector3(ux(u), y, z)),
      closed,
      "catmullrom",
      0.05,
    );
    return new TubeGeometry(c, Math.max(8, pts.length * 10), r, radial, closed);
  };
  /** A cylinder `r` round (`r1` at its far end), `len` long along an axis, centred at [u, y, z]. */
  const cyl = (u: number, y: number, z: number, r: number, len: number, axis: "u" | "y" | "z", seg = 16, r1 = r) => {
    const g = new CylinderGeometry(r1, r, len, seg);
    if (axis === "u") g.rotateZ(Math.PI / 2);
    if (axis === "z") g.rotateX(Math.PI / 2);
    return g.translate(ux(u), y, z);
  };
  /** A bar from a to b ([u, y, z]), `w` across `side`, `h` the third way. */
  const beam = (a: V3, b: V3, w: number, h: number, side: V3 = [0, 0, 1]) => {
    const va = new Vector3(ux(a[0]), a[1], a[2]);
    const vb = new Vector3(ux(b[0]), b[1], b[2]);
    const vd = vb.clone().sub(va);
    const len = vd.length();
    vd.normalize();
    const vs = new Vector3(...side);
    vs.addScaledVector(vd, -vs.dot(vd));
    if (vs.lengthSq() < 1e-8) vs.set(1, 0, 0).addScaledVector(vd, -vd.x);
    vs.normalize();
    const vn = new Vector3().crossVectors(vs, vd);
    const mat = new Matrix4().makeBasis(vs, vd, vn).setPosition(va.add(vb).multiplyScalar(0.5));
    return new BoxGeometry(w, len, h).applyMatrix4(mat);
  };
  /** A disc facing ±u, ±y or ±z (`face`), centred at [u, y, z]. */
  const disc = (u: number, y: number, z: number, r: number, face: "u" | "-u" | "y" | "z" | "-z", seg = 24) => {
    const g = new CircleGeometry(r, seg);
    if (face === "u") g.rotateY(Math.PI / 2);
    if (face === "-u") g.rotateY(-Math.PI / 2);
    if (face === "y") g.rotateX(-Math.PI / 2);
    if (face === "-z") g.rotateY(Math.PI);
    return g.translate(ux(u), y, z);
  };
  /** A flat panel facing ±z (a decal's ground, a window): u0..u1, y0..y1 at z. */
  const pane = (u0: number, u1: number, y0: number, y1: number, z: number, face: 1 | -1) => {
    const g = new PlaneGeometry(Math.abs(u1 - u0), Math.abs(y1 - y0));
    if (face < 0) g.rotateY(Math.PI);
    return g.translate(ux((u0 + u1) / 2), (y0 + y1) / 2, z);
  };
  /** A flat panel facing ±u (a dash's face, a back window): z0..z1, y0..y1 at u. */
  const paneU = (u: number, y0: number, y1: number, z0: number, z1: number, face: 1 | -1) =>
    new PlaneGeometry(Math.abs(z1 - z0), Math.abs(y1 - y0))
      .rotateY(face > 0 ? Math.PI / 2 : -Math.PI / 2)
      .translate(ux(u), (y0 + y1) / 2, (z0 + z1) / 2);
  /** A window's rubber surround on a side (±z): a dark strip `t` wide round u0..u1, y0..y1. */
  const surround = (u0: number, u1: number, y0: number, y1: number, z: number, t = 0.03) => {
    const d = 0.012;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    add(dark, box(u0 - t, u1 + t, y0 - t, y0, z0, z1), box(u0 - t, u1 + t, y1, y1 + t, z0, z1));
    add(dark, box(u0 - t, u0, y0, y1, z0, z1), box(u1, u1 + t, y0, y1, z0, z1));
  };
  /** A decal of text on a side (±z), a front (−u) or a back (+u), just off the surface there. */
  const decal = (
    lines: string[],
    at: { u: number; y: number; z: number; w: number; h: number; face: "z" | "-z" | "u" | "-u" | "y" },
    style: Parameters<typeof textTex>[1] = {},
    into: Group = body,
  ) => {
    const t = keep(textTex(lines, style));
    const m = tone("#ffffff", { rough: 0.45, map: t, dirt: true });
    m.transparent = true;
    m.alphaTest = 0.4;
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    const g = new PlaneGeometry(at.w, at.h);
    if (at.face === "-z") g.rotateY(Math.PI);
    if (at.face === "u") g.rotateY(Math.PI / 2);
    if (at.face === "-u") g.rotateY(-Math.PI / 2);
    if (at.face === "y") g.rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
    const mesh = new Mesh(keep(g.translate(ux(at.u), at.y, at.z)), m);
    mesh.renderOrder = 1;
    into.add(mesh);
    return mesh;
  };
  /** A round lamp facing ±u: its housing (`shell`), a chrome ring, its lens. */
  const roundLamp = (
    u: number,
    y: number,
    z: number,
    r: number,
    face: 1 | -1,
    lens: MeshStandardMaterial,
    shell: Material = chrome,
    depth = 0.1,
  ) => {
    add(shell, cyl(u + (face * depth) / 2, y, z, r * 1.12, depth, "u", 18, r * 0.95));
    add(chrome, new TorusGeometry(r * 1.02, r * 0.1, 6, 20).rotateY(Math.PI / 2).translate(ux(u), y, z));
    add(lens, disc(u - face * 0.004, y, z, r, face > 0 ? "u" : "-u", 20));
  };
  /** Bolts round a circle facing ±z (a rim's nuts): n little hexes `r` round. */
  const bolts = (cu: number, cy: number, z: number, R: number, n: number, r: number, face: 1 | -1, len = 0.03) => {
    const out: BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(cyl(cu, cy + Math.sin(a) * R, z + (face * len) / 2, r, len, "z", 6).translate(Math.cos(a) * R, 0, 0));
    }
    return out;
  };

  // ── wheels: a slot of the sim's four, a tyre, a steel rim ──
  /** A tyre turned on a lathe: `R` round, `w` wide, its rim `rim` of R; axle along z, centred. */
  const tyreGeo = (R: number, w: number, rim = 0.62, shoulder = 0.18) => {
    const h = w / 2;
    const r0 = R * rim;
    const s = Math.min(shoulder * R, h * 0.9);
    const pts: P2[] = [
      [r0, -h * 0.92],
      [r0 + (R - r0) * 0.45, -h * 1.02],
      [R - s * 0.55, -h],
      [R - s * 0.1, -h + s * 0.45],
      [R, -h + s],
      [R, h - s],
      [R - s * 0.1, h - s * 0.45],
      [R - s * 0.55, h],
      [r0 + (R - r0) * 0.45, h * 1.02],
      [r0, h * 0.92],
    ];
    return new LatheGeometry(
      pts.map(([r, y]) => new Vector2(r, y)),
      36,
    ).rotateX(Math.PI / 2);
  };
  /** Chevron lugs round a tractor tyre's tread (axle along z): `n` each side, alternating. */
  const lugGeo = (R: number, w: number, n = 22) => {
    const out: BufferGeometry[] = [];
    const h = w / 2;
    for (const s of [1, -1])
      for (let i = 0; i < n; i++) {
        const a = ((i + (s > 0 ? 0 : 0.5)) / n) * Math.PI * 2;
        const lean = 0.42; // radians round the tyre from the shoulder to the middle
        const p0 = new Vector3(Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), s * (h - 0.02));
        const p1 = new Vector3(Math.cos(a + lean) * (R + 0.03), Math.sin(a + lean) * (R + 0.03), s * 0.02);
        const d = p1.clone().sub(p0);
        const len = d.length();
        d.normalize();
        const up = p0.clone().add(p1).normalize();
        const side = new Vector3().crossVectors(d, up).normalize();
        const m = new Matrix4().makeBasis(side, d, up).setPosition(p0.add(p1).multiplyScalar(0.5));
        out.push(new BoxGeometry(0.06, len, 0.07).applyMatrix4(m));
      }
    return mergeGeometries(
      out.map((g) => g.toNonIndexed()),
      false,
    );
  };
  /** A steel disc wheel facing ±z (`face`): its barrel, a dished disc, the hub, the nuts. */
  const rimParts = (R: number, w: number, face: 1 | -1, paintOf: Material = steel, nuts = 8) => {
    const P = bucket();
    const h = w / 2;
    P.add(paintOf, new CylinderGeometry(R, R, w * 0.92, 24, 1, true).rotateX(Math.PI / 2));
    const dish: P2[] = [
      [R * 0.98, face * h * 0.55],
      [R * 0.8, face * h * 0.62],
      [R * 0.55, face * h * 0.3],
      [R * 0.34, face * h * 0.42],
      [R * 0.001, face * h * 0.44],
    ];
    const lathe = new LatheGeometry(
      (face > 0 ? dish : [...dish].reverse()).map(([r, y]) => new Vector2(r, y)),
      24,
    ).rotateX(face > 0 ? -Math.PI / 2 : Math.PI / 2);
    P.add(paintOf, lathe);
    P.add(
      steel,
      new CylinderGeometry(R * 0.2, R * 0.24, 0.06, 12).rotateX(Math.PI / 2).translate(0, 0, face * h * 0.5),
    );
    for (let i = 0; i < nuts; i++) {
      const a = (i / nuts) * Math.PI * 2;
      P.add(
        chrome,
        new CylinderGeometry(0.018, 0.018, 0.04, 6)
          .rotateX(Math.PI / 2)
          .translate(Math.cos(a) * R * 0.27, Math.sin(a) * R * 0.27, face * h * 0.46),
      );
    }
    return P;
  };
  /** One of the sim's four wheels: its slot (steered, riding, spun by the rig), what's on it. */
  const slot = (front: boolean, side: 1 | -1, rest: Vector3) => {
    const steer = new Group();
    steer.position.copy(rest);
    const spin = new Group();
    steer.add(spin);
    root.add(steer);
    return { steer, spin, front, side, rest } as Wheel;
  };
  /** A tyred wheel in a slot: the tyre and its rim turning (`dy` off the slot's centre). */
  const tyredSlot = (
    front: boolean,
    side: 1 | -1,
    rest: Vector3,
    R: number,
    w: number,
    o: {
      rimPaint?: Material;
      rim?: number;
      dy?: number;
      lugs?: boolean;
      dual?: number;
      nuts?: number;
      /** the sim's wheel's radius, when the drawn one's another size */
      simR?: number;
    } = {},
  ) => {
    const s = slot(front, side, rest);
    if (o.simR) s.turnK = o.simR / R;
    // (a wheel drawn off the slot's centre: the spinning group moved there, so it turns on its own
    // axle rather than orbiting the slot's)
    s.spin.position.y = o.dy ?? 0;
    const g = new Group();
    s.spin.add(g);
    const offs = o.dual ? [-o.dual / 2, o.dual / 2] : [0];
    for (const dz of offs) {
      const t = new Mesh(keep(tyreGeo(R, w, o.rim ?? 0.62)), o.lugs ? rubber : tyreMat);
      t.position.z = dz;
      t.castShadow = true;
      t.receiveShadow = true;
      g.add(t);
      if (o.lugs) {
        const l = new Mesh(keep(lugGeo(R, w)), rubber);
        l.castShadow = true;
        l.position.z = dz;
        g.add(l);
      }
    }
    // (the rim faces out: +z on the left, −z on the right; a dual's outer one)
    const rg = new Group();
    rg.position.z = o.dual ? (side * o.dual) / 2 : 0;
    rimParts(R * (o.rim ?? 0.62), w, side, o.rimPaint, o.nuts).build(rg);
    g.add(rg);
    return s;
  };

  // ── tracks ──
  /** A track's loop round two end wheels (centres [u, y], radius r each), `wd` wide at z: the
   *  belt, its cleats every `pitch`, the end wheels; facing out ±z. */
  const trackLoop = (
    a: { u: number; y: number; r: number },
    b: { u: number; y: number; r: number },
    zc: number,
    wd: number,
    t = 0.05,
    pitch = 0.2,
    cleat: Material = steel,
  ) => {
    // the outline: a belt round both wheels (their outer tangents), as points round the loop
    const pts: P2[] = [];
    const ang = Math.atan2(b.y - a.y, b.u - a.u);
    const dr = Math.asin(Math.max(-1, Math.min(1, (a.r - b.r) / Math.hypot(b.u - a.u, b.y - a.y))));
    const n = 14;
    // (round b, from its bottom tangent up to its top one; then round a)
    const b0 = ang - Math.PI / 2 + dr;
    const b1 = ang + Math.PI / 2 - dr;
    for (let i = 0; i <= n; i++) {
      const q = b0 + ((b1 - b0) * i) / n;
      pts.push([b.u + Math.cos(q) * b.r, b.y + Math.sin(q) * b.r]);
    }
    const a0 = ang + Math.PI / 2 - dr;
    const a1 = ang + (3 * Math.PI) / 2 + dr;
    for (let i = 0; i <= n; i++) {
      const q = a0 + ((a1 - a0) * i) / n;
      pts.push([a.u + Math.cos(q) * a.r, a.y + Math.sin(q) * a.r]);
    }
    const inner = (k: number): P2[] => {
      // (the outline pulled in by k: each point toward its wheel's centre)
      return pts.map(([u, y], i) => {
        const c = i <= n ? b : a;
        const d = Math.hypot(u - c.u, y - c.y) || 1;
        return [c.u + ((u - c.u) * (d - k)) / d, c.y + ((y - c.y) * (d - k)) / d];
      });
    };
    const outer = pts;
    const hole = inner(t);
    const sh = new Shape(outer.map(([u, y]) => new Vector2(u, y)));
    sh.holes.push(new Shape([...hole].reverse().map(([u, y]) => new Vector2(u, y))));
    const belt = new ExtrudeGeometry(sh, { depth: wd, bevelEnabled: false, curveSegments: 4 }).translate(
      -L / 2,
      0,
      zc - wd / 2,
    );
    add(rubber, belt);
    // the cleats along the loop
    const loop = [...outer, outer[0]];
    const seg = loop.slice(1).map((p, i) => Math.hypot(p[0] - loop[i][0], p[1] - loop[i][1]));
    const total = seg.reduce((x, y) => x + y, 0);
    for (let d = pitch / 2; d < total; d += pitch) {
      let k = 0;
      let s = d;
      while (k < seg.length - 1 && s > seg[k]) s -= seg[k++];
      const p = loop[k];
      const q = loop[k + 1];
      const f = s / (seg[k] || 1);
      const u = p[0] + (q[0] - p[0]) * f;
      const y = p[1] + (q[1] - p[1]) * f;
      const tu = (q[0] - p[0]) / (seg[k] || 1);
      const ty = (q[1] - p[1]) / (seg[k] || 1);
      // (outward: the loop runs clockwise in u, y — its outside on the tangent's left... checked
      // against the wheel's centre)
      const c = k <= n ? b : a;
      let nu = -ty;
      let ny = tu;
      if ((u - c.u) * nu + (y - c.y) * ny < 0 && Math.abs(u - c.u) + Math.abs(y - c.y) > 0) {
        nu = -nu;
        ny = -ny;
      }
      // (on the straight runs the outside is away from the loop's middle)
      const mu = (a.u + b.u) / 2;
      const my = (a.y + b.y) / 2;
      if ((u - mu) * nu + (y - my) * ny < 0) {
        nu = -nu;
        ny = -ny;
      }
      add(
        cleat,
        new BoxGeometry(0.035, 0.03, wd + 0.02)
          .rotateZ(Math.atan2(ty, tu))
          .translate(ux(u + nu * 0.012), y + ny * 0.012, zc),
      );
    }
  };

  // ── snow on it ──
  const snow: Mesh[] = [];
  const sk = o.snowy ?? 0;
  /** A cap of snow on a flat top (u0..u1, z0..z1 at y), thicker in its middle. */
  const snowCap = (u0: number, u1: number, z0: number, z1: number, y: number) => {
    if (sk <= 0.02) return;
    const h = 0.02 + 0.07 * sk;
    const g = rbox(u0 + 0.04, u1 - 0.04, y, y + h, z0 + 0.04, z1 - 0.04, Math.min(0.03, h * 0.45));
    const m = new Mesh(keep(g), snowMat);
    m.castShadow = true;
    m.receiveShadow = true;
    body.add(m);
    snow.push(m);
  };

  // ── the lights and the interface ──
  let lampK = 1;
  let last: Lights = { beams: "off", tail: false, brake: 0, reverse: false, ind: 0, dash: 0, dome: false };
  let beaconOn = (_on: boolean, _t: number) => {};
  const setLights = (l: Lights) => {
    last = l;
    headLens.emissiveIntensity = (l.beams === "off" ? 0 : l.beams === "low" ? 2.2 : 3.4) * lampK;
    red.emissiveIntensity = Math.max(l.tail || l.beams !== "off" ? 0.9 : 0, l.brake * 3.2);
    amber.emissiveIntensity = l.ind !== 0 || l.hazard ? 2.6 : 0;
    plateMat.emissiveIntensity = l.tail || l.beams !== "off" ? 0.35 : 0;
    gauge.emissiveIntensity = l.dash * 0.22;
  };
  /** The interface, from the parts each builder made. */
  const finish = (parts: {
    wheels: Wheel[];
    doors: Door[];
    steering: Group;
    seats: Sedan["seats"];
    eye: Vector3;
    axleF: number;
    kind: "snowmobile" | "snowcat" | "ploughtruck" | "tractor" | "toboggan";
    lamps: Sedan["lamps"];
    screen: Sedan["screen"];
    rim: Sedan["rim"];
    beacon?: (on: boolean, t: number) => void;
    lights?: boolean;
  }): Sedan => {
    B.build(body);
    const rearView = new Mesh(keep(new PlaneGeometry(0.01, 0.01)), satin);
    rearView.visible = false;
    body.add(rearView);
    if (parts.beacon) beaconOn = parts.beacon;
    setLights(last);
    return {
      root,
      body,
      wheels: parts.wheels,
      doors: parts.doors,
      steering: parts.steering,
      wipers: [],
      freshener: new Group(),
      snow,
      seats: parts.seats,
      eye: parts.eye,
      dims: { L, axleF: parts.axleF, kind: parts.kind },
      lamps: parts.lamps,
      rearView,
      screen: parts.screen,
      rim: parts.rim,
      setSteer: (road) => {
        for (const w of parts.wheels) if (w.front) w.steer.rotation.y = road;
      },
      setLights: parts.lights === false ? () => {} : setLights,
      setCluster: () => {},
      setRadio: () => {},
      setScreenSnow: () => {},
      setEnv: (t: Texture | null) => {
        for (const m of outside) {
          m.envMap = t;
          m.needsUpdate = true;
        }
      },
      setBeacon: (on, t) => beaconOn(on, t),
      setWear: (grime, dmg) => {
        wear.uGrime.value = Math.max(0, Math.min(1, grime));
        wear.uDmg.value.set(dmg[0] ?? 0, dmg[1] ?? 0, dmg[2] ?? 0, dmg[3] ?? 0);
        const k = (dmg[0] ?? 0) > 0.6 ? 0.35 : 1;
        if (k !== lampK) {
          lampK = k;
          setLights(last);
        }
      },
      dispose: () => {
        for (const d of disposables) d.dispose();
        root.traverse((x) => {
          const m = x as Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
      },
    };
  };

  /** A hinged door: its parts built into a group turning about y at [u, z] (opening outward). */
  const door = (
    hu: number,
    hz: number,
    side: 1 | -1,
    build: (P: ReturnType<typeof bucket>, inner: Group) => void,
  ): Door => {
    const hinge = new Group();
    hinge.position.set(ux(hu), 0, hz);
    const P = bucket();
    const inner = new Group();
    inner.position.set(-ux(hu), 0, -hz);
    build(P, inner);
    P.build(inner);
    hinge.add(inner);
    body.add(hinge);
    return {
      group: hinge,
      side,
      front: true,
      open: (a) => {
        hinge.rotation.y = -side * a;
      },
    };
  };
  /** A steering wheel: rim, three spokes, the boss (in the group's own frame, facing +z). */
  const wheelGeo = (r: number, P: ReturnType<typeof bucket>) => {
    P.add(satin, new TorusGeometry(r, r * 0.09, 8, 28));
    for (const a of [-Math.PI / 2, Math.PI / 6 + Math.PI, -Math.PI / 6]) {
      const g = new BoxGeometry(r * 0.12, r * 0.95, r * 0.05).translate(0, r * 0.48, 0).rotateZ(a + Math.PI / 2);
      P.add(satin, g);
    }
    P.add(steel, new CylinderGeometry(r * 0.22, r * 0.26, r * 0.18, 14).rotateX(Math.PI / 2));
  };

  return {
    keep,
    tone,
    lensOf,
    bucket,
    add,
    paint,
    satin,
    steel,
    chrome,
    rubber,
    tyreMat,
    seat,
    dark,
    glass,
    headLens,
    red,
    amber,
    snowMat,
    plateMat,
    tread,
    gauge,
    root,
    body,
    ux,
    box,
    rbox,
    prof,
    plan,
    loft,
    tube,
    cyl,
    beam,
    disc,
    pane,
    paneU,
    surround,
    decal,
    roundLamp,
    bolts,
    tyreGeo,
    slot,
    tyredSlot,
    trackLoop,
    snowCap,
    door,
    wheelGeo,
    sphere: (u: number, y: number, z: number, r: number, wSeg = 12, hSeg = 8, thetaLen = Math.PI) =>
      new SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, thetaLen).translate(ux(u), y, z),
    finish,
    snowy: sk,
  };
}
export type Kit = ReturnType<typeof kit>;
