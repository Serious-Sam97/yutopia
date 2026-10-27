import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// The kart (docs/plan/46-the-karts.md; rebuilt in the quality pass): a little 80s go-kart, chunky
// as a toy — a tube frame on a floor tray, fat tyres with tread and lettered walls on five-spoke
// rims, a lofted wedge nose with its front number panel and lamp, swept side pods with intakes and
// decals, a moulded rear bumper with a low ducktail spoiler, a bucket seat, a steering wheel on its column, the engine and its
// exhaust on the right, a little wing on struts, a whip flag on a pole so you see it over the
// snow banks, a lamp in the nose for the night races. Flat facets and the people's ink line.
// Metres; the nose to +x, standing on y 0, its middle between the axles at 0.

export interface KartOpts {
  colour: string;
  number: number;
  /** the stripe, the wing, the number's disc */
  trim?: string;
}
export interface Kart {
  root: Group;
  /** the sprung part: rolls and pitches over the wheels */
  body: Group;
  wheels: { steer: Group; spin: Group; front: boolean; x: number; z: number; r: number }[];
  setSteer(a: number): void;
  /** where the driver's hips sit (body coords) */
  hip: Vector3;
  /** a point on the steering wheel's rim at clock angle `phi` (0 top, + to the right), body coords */
  rim(phi: number, out?: Vector3): Vector3;
  /** the exhaust's tip, and the way it points (body coords) */
  exhaust: { p: Vector3; dir: Vector3 };
  /** the nose lamp (body coords) */
  lamp: Vector3;
  lampMat: MeshStandardMaterial;
  meshes: Mesh[];
  /** the whip flag's pennant in the wind (seconds, speed m/s) */
  wave(t: number, speed: number): void;
  dispose(): void;
}

const geos: BufferGeometry[] = [];
const mats: Material[] = [];
const keep = <T extends BufferGeometry | Material>(g: T): T => {
  if ((g as BufferGeometry).isBufferGeometry) geos.push(g as BufferGeometry);
  else mats.push(g as Material);
  return g;
};

/** The geometry the ink is drawn from: the same shape welded smooth (the flat facets' split
 *  normals would crack the line at every edge), every vertex at line weight `k`. */
function inkOf(g: BufferGeometry, k: number): BufferGeometry {
  const p = g.clone();
  for (const n of Object.keys(p.attributes)) if (n !== "position") p.deleteAttribute(n);
  const w = mergeVertices(p, 1e-4);
  w.computeVertexNormals();
  w.setAttribute("inkK", new Float32BufferAttribute(new Float32Array(w.attributes.position.count).fill(k), 1));
  p.dispose();
  return keep(w);
}

const flat = (color: string, o: Partial<{ rough: number; metal: number; emissive: string }> = {}) =>
  keep(
    new MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: o.rough ?? 0.6,
      metalness: o.metal ?? 0,
      emissive: o.emissive ?? "#000000",
      emissiveIntensity: o.emissive ? 1 : 0,
    }),
  );

/** The number on a cream disc, for the nose and the pods. */
function numberTex(n: number, ink: string, disc: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = disc;
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = "#151515";
  g.stroke();
  g.fillStyle = ink;
  g.font = "900 82px 'Helvetica Neue', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A loft through cross-sections along x (nose +x): each a closed ring of [y, z] points (the same
 *  count), at `x`, shifted by `dz` across; capped both ends. Flat facets (each quad its own). */
function loft(secs: { x: number; ring: [number, number][]; dz?: number }[], cap = true): BufferGeometry {
  const pos: number[] = [];
  const P = (s: (typeof secs)[number], i: number): [number, number, number] => {
    const p = s.ring[i % s.ring.length];
    return [s.x, p[0], p[1] + (s.dz ?? 0)];
  };
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  for (let k = 0; k < secs.length - 1; k++) {
    const n = secs[k].ring.length;
    for (let i = 0; i < n; i++) {
      const a0 = P(secs[k], i);
      const a1 = P(secs[k], i + 1);
      const b0 = P(secs[k + 1], i);
      const b1 = P(secs[k + 1], i + 1);
      tri(a0, a1, b0);
      tri(a1, b1, b0);
    }
  }
  if (cap)
    for (const [s, flip] of [
      [secs[0], true],
      [secs[secs.length - 1], false],
    ] as const) {
      const cy = s.ring.reduce((a, p) => a + p[0], 0) / s.ring.length;
      const cz = s.ring.reduce((a, p) => a + p[1], 0) / s.ring.length + (s.dz ?? 0);
      for (let i = 0; i < s.ring.length; i++) {
        const a = P(s, i);
        const b = P(s, i + 1);
        if (flip) tri([s.x, cy, cz], b, a);
        else tri([s.x, cy, cz], a, b);
      }
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** A rounded box's ring (y0..y1, half-widths hb at the bottom, ht at the top, corners r), `n` a corner. */
function ring(y0: number, y1: number, hb: number, ht: number, r: number, n = 3): [number, number][] {
  const out: [number, number][] = [];
  const rr = Math.min(r, (y1 - y0) * 0.49, ht * 0.95, hb * 0.95);
  const corner = (cy: number, cz: number, a0: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cy + Math.sin(a) * rr, cz + Math.cos(a) * rr]);
    }
  };
  // (counter-clockwise seen from the nose: top right → top left → bottom left → bottom right)
  corner(y1 - rr, ht - rr, 0);
  corner(y1 - rr, -(ht - rr), Math.PI / 2);
  corner(y0 + rr, -(hb - rr), Math.PI);
  corner(y0 + rr, hb - rr, (3 * Math.PI) / 2);
  return out;
}

/** The side pods' decal: a stripe, the number on a disc, the park's name small. */
function podTex(n: number, trim: string, disc: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = trim;
  g.fillRect(0, 86, 512, 18);
  g.fillRect(0, 110, 512, 6);
  g.beginPath();
  g.arc(140, 56, 46, 0, Math.PI * 2);
  g.fillStyle = disc;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = "#151515";
  g.stroke();
  g.fillStyle = "#151515";
  g.font = "900 64px 'Helvetica Neue', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 140, 60);
  g.font = "italic 800 30px 'Helvetica Neue', Arial, sans-serif";
  g.fillStyle = disc;
  g.textAlign = "left";
  g.fillText("YUTOPIA", 205, 48);
  g.font = "700 18px 'Helvetica Neue', Arial, sans-serif";
  g.fillText("KART PARK · SNOW", 207, 74);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** The tyre's tread (chevrons) round its face, and its sidewall's lettering. */
let treadTex: CanvasTexture | null = null;
let wallTex: CanvasTexture | null = null;
function treads(): { tread: CanvasTexture; wall: CanvasTexture } {
  if (!treadTex) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#1c1d20";
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = "#0c0d0e";
    g.lineWidth = 5;
    for (let x = -16; x < 272; x += 16) {
      g.beginPath();
      g.moveTo(x, 6);
      g.lineTo(x + 8, 32);
      g.lineTo(x, 58);
      g.stroke();
    }
    treadTex = new CanvasTexture(c);
    treadTex.colorSpace = SRGBColorSpace;
    treadTex.wrapS = RepeatWrapping;
    treadTex.repeat.set(3, 1);
  }
  if (!wallTex) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#1c1d20";
    g.fillRect(0, 0, 512, 512);
    g.translate(256, 256);
    g.fillStyle = "#d9d2bf";
    g.font = "800 44px 'Helvetica Neue', Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const [word, a] of [
      ["YUTOPIA", 0],
      ["SNOW · R10", Math.PI],
    ] as [string, number][]) {
      const chars = word.split("");
      chars.forEach((ch, i) => {
        g.save();
        g.rotate(a + (i - chars.length / 2) * 0.13);
        g.fillText(ch, 0, -205);
        g.restore();
      });
    }
    wallTex = new CanvasTexture(c);
    wallTex.colorSpace = SRGBColorSpace;
  }
  return { tread: treadTex, wall: wallTex };
}

export function buildKart(o: KartOpts, ink: Material): Kart {
  // (what this kart makes, freed with it: the game's karts come and go)
  const g0 = geos.length;
  const m0 = mats.length;
  const root = new Group();
  const body = new Group();
  root.add(body);
  const meshes: Mesh[] = [];
  const add = (parent: Group, g: BufferGeometry, m: Material, k = 1) => {
    const mesh = new Mesh(keep(g), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    if (k > 0) {
      const l = new Mesh(inkOf(g, k), ink);
      l.renderOrder = 1;
      parent.add(l);
    }
    return mesh;
  };
  const trimC = o.trim ?? "#f3ead6";
  const paint = flat(o.colour, { rough: 0.32 });
  const paintDark = flat(new Color(o.colour).multiplyScalar(0.62).getStyle(), { rough: 0.45 });
  const trim = flat(trimC, { rough: 0.4 });
  const steel = flat("#9aa1a7", { rough: 0.3, metal: 0.65 });
  const dark = flat("#25262a", { rough: 0.75 });
  const floorM = flat("#303237", { rough: 0.6, metal: 0.3 });
  const seatMat = flat("#2c2420", { rough: 0.7 });
  const engine = flat("#5b6067", { rough: 0.45, metal: 0.5 });
  const chrome = flat("#d4d9dd", { rough: 0.18, metal: 0.95 });
  const filter = flat("#b5562f", { rough: 0.6 });
  const lampMat = flat("#f3e0a0", { rough: 0.3, emissive: "#000000" });
  const tex = podTex(o.number, trimC, "#f3ead6");
  const podMat = keep(
    new MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  const numTex = numberTex(o.number, "#151515", "#f3ead6");
  const numMat = keep(new MeshStandardMaterial({ map: numTex, roughness: 0.45 }));
  const { tread, wall } = treads();
  const treadMat = keep(new MeshStandardMaterial({ map: tread, roughness: 0.95, flatShading: true }));
  const wallMat = keep(new MeshStandardMaterial({ map: wall, roughness: 0.9 }));
  const tube = (pts: [number, number, number][], r: number, m: Material, k = 0.5, parent: Group = body) =>
    add(
      parent,
      new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), pts.length * 10, r, 7, false),
      m,
      k,
    );
  const box = (w: number, h: number, d: number, r: number, x: number, y: number, z: number, m: Material, k = 0.6) => {
    const g = new RoundedBoxGeometry(w, h, d, 2, r);
    g.translate(x, y, z);
    return add(body, g, m, k);
  };

  // ── the chassis: two main rails, the cross members, the floor tray, the axles' carriers ──
  for (const s of [1, -1])
    tube(
      [
        [0.92, 0.12, s * 0.16],
        [0.74, 0.11, s * 0.3],
        [0.2, 0.11, s * 0.34],
        [-0.55, 0.12, s * 0.36],
        [-0.8, 0.14, s * 0.3],
      ],
      0.022,
      steel,
    );
  for (const x of [0.6, 0.05, -0.62])
    tube(
      [
        [x, 0.11, -0.34],
        [x, 0.11, 0.34],
      ],
      0.018,
      steel,
      0.4,
    );
  {
    const g = new RoundedBoxGeometry(1.3, 0.025, 0.56, 2, 0.01);
    g.translate(0.05, 0.095, 0);
    add(body, g, floorM, 0);
  }
  // ── the nose: a low wedge, a centre ridge, its trim stripe; the front panel with the number and lamp ──
  {
    const secs = [
      { x: 1.04, ring: ring(0.1, 0.19, 0.2, 0.17, 0.05) },
      { x: 0.96, ring: ring(0.08, 0.24, 0.3, 0.26, 0.07) },
      { x: 0.8, ring: ring(0.08, 0.3, 0.34, 0.3, 0.09) },
      { x: 0.6, ring: ring(0.09, 0.33, 0.33, 0.27, 0.1) },
      { x: 0.46, ring: ring(0.1, 0.31, 0.28, 0.22, 0.09) },
    ];
    add(body, loft(secs), paint);
    // its stripe along the top, a hair proud
    const st = loft([
      { x: 1.02, ring: ring(0.183, 0.205, 0.05, 0.05, 0.008, 1) },
      { x: 0.8, ring: ring(0.297, 0.318, 0.05, 0.05, 0.008, 1) },
      { x: 0.6, ring: ring(0.327, 0.348, 0.05, 0.05, 0.008, 1) },
      { x: 0.47, ring: ring(0.307, 0.326, 0.05, 0.05, 0.008, 1) },
    ]);
    add(body, st, trim, 0);
    // the bumper's loop ahead of it, low
    tube(
      [
        [0.9, 0.1, 0.36],
        [1.08, 0.12, 0.3],
        [1.14, 0.12, 0],
        [1.08, 0.12, -0.3],
        [0.9, 0.1, -0.36],
      ],
      0.026,
      steel,
    );
    // the front panel: a plate leaning back, its number, the lamp in a chrome bezel under it
    const panel = new Group();
    panel.position.set(0.5, 0.28, 0);
    panel.rotation.z = 0.5;
    body.add(panel);
    const pg = new RoundedBoxGeometry(0.035, 0.24, 0.42, 2, 0.02);
    pg.translate(0, 0.11, 0);
    add(panel, pg, paintDark, 0.6);
    const n = new Mesh(keep(new PlaneGeometry(0.19, 0.19).rotateY(Math.PI / 2)), numMat);
    n.position.set(0.019, 0.12, 0);
    panel.add(n);
  }
  const lamp = new Vector3(1.02, 0.2, 0);
  {
    const bez = new CylinderGeometry(0.055, 0.065, 0.04, 16).rotateZ(Math.PI / 2);
    bez.translate(lamp.x, lamp.y, 0);
    add(body, bez, chrome, 0.5);
    const lens = new CylinderGeometry(0.047, 0.047, 0.012, 16).rotateZ(Math.PI / 2);
    lens.translate(lamp.x + 0.022, lamp.y, 0);
    add(body, lens, lampMat, 0);
  }
  // ── the side pods: rounded, swept back, an intake at the front; their decals ──
  for (const s of [1, -1]) {
    const secs = [
      { x: 0.36, ring: ring(0.1, 0.2, 0.06, 0.05, 0.04), dz: s * 0.48 },
      { x: 0.28, ring: ring(0.09, 0.3, 0.12, 0.1, 0.06), dz: s * 0.52 },
      { x: 0.0, ring: ring(0.09, 0.33, 0.13, 0.11, 0.07), dz: s * 0.54 },
      { x: -0.3, ring: ring(0.09, 0.31, 0.13, 0.1, 0.07), dz: s * 0.53 },
      { x: -0.42, ring: ring(0.1, 0.24, 0.1, 0.08, 0.05), dz: s * 0.5 },
    ];
    add(body, loft(secs), paint);
    // the intake: a dark mouth on its front
    const mouth = new RoundedBoxGeometry(0.02, 0.1, 0.13, 1, 0.02);
    mouth.translate(0.3, 0.2, s * 0.52);
    add(body, mouth, dark, 0);
    // the decal on its outside
    const d = new Mesh(keep(new PlaneGeometry(0.64, 0.16)), podMat);
    d.position.set(-0.05, 0.215, s * 0.672);
    if (s < 0) d.rotation.y = Math.PI;
    body.add(d);
  }
  // ── the seat: a moulded bucket, leaning back; the fuel tank between the knees ──
  {
    const pts = [
      new Vector2(0.001, 0),
      new Vector2(0.2, 0.0),
      new Vector2(0.245, 0.06),
      new Vector2(0.255, 0.22),
      new Vector2(0.235, 0.44),
      new Vector2(0.19, 0.5),
    ];
    const g = new LatheGeometry(pts, 16, Math.PI * 0.62, Math.PI * 0.76);
    g.scale(0.95, 1, 1.05);
    g.rotateZ(0.32);
    g.translate(-0.24, 0.1, 0);
    add(body, g, keep(new MeshStandardMaterial({ color: "#2c2420", flatShading: true, roughness: 0.7, side: 2 })), 0.8);
    box(0.34, 0.06, 0.36, 0.03, -0.26, 0.13, 0, seatMat, 0.6);
    // the tank: a white plastic jerrycan between the legs
    box(0.16, 0.12, 0.17, 0.04, 0.33, 0.17, 0, flat("#e8e6de", { rough: 0.55 }), 0.5);
    add(body, new CylinderGeometry(0.025, 0.025, 0.03, 8).translate(0.33, 0.245, 0.04), dark, 0);
  }
  const hip = new Vector3(-0.2, 0.2, 0);
  // ── the steering: column, a butterfly wheel with its grips, the pedals ──
  const wheelC = new Vector3(0.28, 0.54, 0);
  const tilt = 0.95;
  tube(
    [
      [0.6, 0.15, 0],
      [0.44, 0.34, 0],
      [wheelC.x + 0.02, wheelC.y - 0.02, 0],
    ],
    0.018,
    steel,
  );
  const sw = new Group();
  sw.position.copy(wheelC);
  sw.rotation.z = tilt;
  body.add(sw);
  {
    // (a butterfly: the rim flattened top and bottom, fat grips each side, a hub with the dial)
    const shape = new Shape();
    const R = 0.15;
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const y = Math.cos(a) * R * 0.8;
      const z = Math.sin(a) * R;
      i ? shape.lineTo(z, y) : shape.moveTo(z, y);
    }
    const hole = new Path();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const y = Math.cos(a) * R * 0.8 - 0.0;
      const z = Math.sin(a) * (R - 0.028);
      i ? hole.lineTo(z, y * 0.78) : hole.moveTo(z, y * 0.78);
    }
    shape.holes.push(hole);
    const rg = new ExtrudeGeometry(shape, {
      depth: 0.024,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      bevelSegments: 2,
    });
    rg.translate(0, 0, -0.012);
    rg.rotateY(Math.PI / 2);
    const rm = new Mesh(keep(rg), dark);
    sw.add(rm, new Mesh(inkOf(rg, 0.6), ink));
    for (const s of [1, -1]) {
      const grip = new CylinderGeometry(0.026, 0.026, 0.13, 8);
      grip.translate(0, 0, 0);
      const gm = new Mesh(keep(grip), flat("#3a2a20", { rough: 0.8 }));
      gm.position.set(0, 0, -s * 0.135);
      sw.add(gm);
    }
    const hub = new Mesh(keep(new CylinderGeometry(0.05, 0.05, 0.04, 14).rotateZ(Math.PI / 2)), trim);
    sw.add(hub);
    const dial = new Mesh(
      keep(new CylinderGeometry(0.03, 0.03, 0.01, 14).rotateZ(Math.PI / 2)),
      keep(new MeshBasicMaterial({ color: "#ffb347", toneMapped: false })),
    );
    dial.position.x = -0.022;
    sw.add(dial);
  }
  for (const s of [1, -1]) box(0.08, 0.1, 0.06, 0.01, 0.7, 0.16, s * 0.1, steel, 0);
  // ── the engine on the right: its finned barrel, a red air filter, the exhaust to a silencer ──
  {
    box(0.26, 0.2, 0.2, 0.04, -0.42, 0.22, -0.3, engine, 0.6);
    for (let i = 0; i < 6; i++) box(0.22, 0.012, 0.24, 0.004, -0.42, 0.32 + i * 0.022, -0.3, chrome, 0);
    const cap = new CylinderGeometry(0.05, 0.06, 0.06, 10);
    cap.translate(-0.42, 0.47, -0.3);
    add(body, cap, engine, 0.4);
    // the carburettor and its filter sticking out ahead
    tube(
      [
        [-0.32, 0.27, -0.3],
        [-0.24, 0.3, -0.42],
      ],
      0.025,
      engine,
      0.3,
    );
    const fl = new CylinderGeometry(0.075, 0.075, 0.11, 14).rotateX(Math.PI / 2);
    fl.translate(-0.24, 0.3, -0.5);
    add(body, fl, filter, 0.6);
    for (const dz of [-0.448, -0.552]) {
      const lip = new CylinderGeometry(0.082, 0.082, 0.012, 14).rotateX(Math.PI / 2);
      lip.translate(-0.24, 0.3, dz);
      add(body, lip, chrome, 0);
    }
    // the chain guard to the axle
    box(0.42, 0.1, 0.04, 0.02, -0.62, 0.2, -0.43, dark, 0.4);
  }
  tube(
    [
      [-0.32, 0.3, -0.38],
      [-0.42, 0.42, -0.48],
      [-0.62, 0.46, -0.5],
      [-0.78, 0.44, -0.44],
    ],
    0.026,
    chrome,
  );
  {
    const sil = new CylinderGeometry(0.06, 0.06, 0.3, 14).rotateZ(Math.PI / 2 - 0.08);
    sil.translate(-0.92, 0.45, -0.42);
    add(body, sil, chrome, 0.6);
    const tip = new CylinderGeometry(0.045, 0.05, 0.05, 12).rotateZ(Math.PI / 2 - 0.08);
    tip.translate(-1.09, 0.46, -0.42);
    add(body, tip, dark, 0.4);
  }
  const exhaust = { p: new Vector3(-1.13, 0.465, -0.42), dir: new Vector3(-1, 0.08, 0).normalize() };
  // ── the rear bumper: a moulded shell behind the wheels, a low ducktail spoiler on it ──
  {
    const secs = [
      { x: -0.86, ring: ring(0.08, 0.22, 0.74, 0.7, 0.06) },
      { x: -0.94, ring: ring(0.07, 0.27, 0.76, 0.72, 0.08) },
      { x: -1.04, ring: ring(0.08, 0.26, 0.74, 0.7, 0.08) },
      { x: -1.08, ring: ring(0.1, 0.22, 0.7, 0.66, 0.06) },
    ];
    add(body, loft(secs), paint);
    // its stripe and the lamps: two red lenses
    box(0.012, 0.03, 1.28, 0.008, -1.085, 0.17, 0, trim, 0);
    for (const s of [1, -1]) {
      const tl = new CylinderGeometry(0.035, 0.035, 0.012, 12).rotateZ(Math.PI / 2);
      tl.translate(-1.09, 0.2, s * 0.5);
      add(
        body,
        tl,
        keep(new MeshStandardMaterial({ color: "#7a1412", emissive: "#ff2a20", emissiveIntensity: 0.6 })),
        0,
      );
    }
    // the ducktail: a short wing on two low struts, end plates in the paint
    for (const s of [1, -1])
      tube(
        [
          [-0.94, 0.27, s * 0.34],
          [-0.96, 0.4, s * 0.34],
        ],
        0.016,
        steel,
        0.4,
      );
    // (an aerofoil seen from the side: thin, cambered, its trailing edge kicked up)
    const wg = new Shape();
    wg.moveTo(0, 0.012);
    wg.quadraticCurveTo(0.06, 0.04, 0.22, 0.03);
    wg.lineTo(0.24, 0.055);
    wg.quadraticCurveTo(0.08, 0.06, 0, 0.026);
    wg.lineTo(0, 0.012);
    const w = new ExtrudeGeometry(wg, {
      depth: 0.98,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 1,
    });
    w.translate(-0.24, 0, -0.49);
    w.translate(-0.86, 0.39, 0);
    add(body, w, trim, 0.7);
    for (const s of [1, -1]) box(0.28, 0.1, 0.018, 0.008, -0.98, 0.42, s * 0.5, paint, 0.6);
  }
  // the whip flag: a pole off the back left, its pennant (waves: `wave`)
  tube(
    [
      [-0.98, 0.4, 0.5],
      [-1.0, 0.95, 0.51],
      [-1.03, 1.5, 0.52],
    ],
    0.008,
    steel,
    0.4,
  );
  const pennant = new Group();
  pennant.position.set(-1.03, 1.42, 0.52);
  body.add(pennant);
  const penGeo = new PlaneGeometry(0.34, 0.2, 6, 1);
  const penBase = Float32Array.from(penGeo.attributes.position.array);
  {
    const m = new Mesh(
      keep(penGeo),
      keep(new MeshStandardMaterial({ color: o.colour, side: 2, flatShading: true, roughness: 0.6 })),
    );
    m.position.x = -0.17;
    pennant.add(m);
  }

  // ── the wheels: fat tyres with tread and lettered walls, five-spoke rims in the trim, a nut ──
  const wheels: Kart["wheels"] = [];
  const tyre = (r: number, w: number) => {
    const h = w / 2;
    const rr = Math.min(0.055, w * 0.28);
    const pts: Vector2[] = [new Vector2(r * 0.66, -h)];
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2);
      pts.push(new Vector2(r - rr + Math.cos(a) * rr, -h + rr + Math.sin(a) * rr));
    }
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * (Math.PI / 2);
      pts.push(new Vector2(r - rr + Math.cos(a) * rr, h - rr + Math.sin(a) * rr));
    }
    pts.push(new Vector2(r * 0.66, h));
    return new LatheGeometry(pts, 28).rotateX(Math.PI / 2);
  };
  const rimShape = (r: number) => {
    const s = new Shape();
    s.absarc(0, 0, r, 0, Math.PI * 2, false);
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2 + 0.22;
      const a1 = a0 + (Math.PI * 2) / 5 - 0.44;
      const hole = new Path();
      hole.absarc(0, 0, r * 0.78, a0, a1, false);
      hole.absarc(0, 0, r * 0.36, a1, a0, true);
      s.holes.push(hole);
    }
    return s;
  };
  for (const [x, z, r, w, front] of [
    [0.56, 0.6, 0.17, 0.16, true],
    [0.56, -0.6, 0.17, 0.16, true],
    [-0.62, 0.65, 0.215, 0.27, false],
    [-0.62, -0.65, 0.215, 0.27, false],
  ] as [number, number, number, number, boolean][]) {
    const steer = new Group();
    steer.position.set(x, r, z);
    root.add(steer);
    const spin = new Group();
    steer.add(spin);
    const out = Math.sign(z);
    const tg = keep(tyre(r, w));
    const t = new Mesh(tg, treadMat);
    t.castShadow = true;
    spin.add(t, new Mesh(inkOf(tg, 1), ink));
    // the sidewall's lettering, both faces
    for (const side of [1, -1]) {
      const wl = new Mesh(keep(new RingGeometry(r * 0.68, r * 0.97, 28)), wallMat);
      wl.position.z = side * (w / 2 + 0.002);
      if (side < 0) wl.rotation.y = Math.PI;
      spin.add(wl);
    }
    // the rim: five spokes, in the trim, on the outer face; the barrel behind it
    const barrel = new CylinderGeometry(r * 0.66, r * 0.66, w * 0.84, 18, 1, true).rotateX(Math.PI / 2);
    spin.add(
      new Mesh(
        keep(barrel),
        keep(new MeshStandardMaterial({ color: "#8e959b", metalness: 0.6, roughness: 0.35, side: 2 })),
      ),
    );
    const rg = new ExtrudeGeometry(rimShape(r * 0.66), {
      depth: 0.02,
      bevelEnabled: true,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      bevelSegments: 1,
      curveSegments: 18,
    });
    rg.translate(0, 0, out * (w / 2 - 0.03) - 0.01);
    spin.add(new Mesh(keep(rg), trim));
    const nut = new CylinderGeometry(r * 0.17, r * 0.2, 0.04, 6).rotateX(Math.PI / 2);
    nut.translate(0, 0, out * (w / 2 - 0.005));
    spin.add(new Mesh(keep(nut), chrome));
    if (front) {
      const ax = new CylinderGeometry(0.015, 0.015, 0.24, 6).rotateX(Math.PI / 2).translate(0, 0, -out * 0.15);
      steer.add(new Mesh(keep(ax), steel));
      // the kingpin's upright
      const up = new BoxGeometry(0.04, 0.12, 0.03).translate(0, 0, -out * 0.11);
      steer.add(new Mesh(keep(up), steel));
    }
    wheels.push({ steer, spin, front, x, z, r });
  }
  // the rear axle right across, its bearing carriers, the brake disc
  {
    const ax = new CylinderGeometry(0.022, 0.022, 1.24, 8).rotateX(Math.PI / 2).translate(-0.62, 0.215, 0);
    root.add(new Mesh(keep(ax), steel));
    const disc = new CylinderGeometry(0.1, 0.1, 0.012, 18).rotateX(Math.PI / 2).translate(-0.62, 0.215, 0.18);
    root.add(new Mesh(keep(disc), chrome));
    const sprocket = new CylinderGeometry(0.09, 0.09, 0.015, 14).rotateX(Math.PI / 2).translate(-0.62, 0.215, -0.42);
    root.add(new Mesh(keep(sprocket), dark));
  }

  const v = new Vector3();
  const own = new Set<BufferGeometry | Material>([...geos.slice(g0), ...mats.slice(m0)]);
  return {
    root,
    body,
    wheels,
    setSteer(a: number) {
      for (const w of wheels) if (w.front) w.steer.rotation.y = a;
      sw.rotation.x = -a * 2.2;
    },
    hip,
    rim(phi: number, out = new Vector3()) {
      // (in the wheel's frame: its face is the y–z plane, top +y, right −z)
      v.set(0, Math.cos(phi) * 0.12, -Math.sin(phi) * 0.15);
      v.applyAxisAngle(new Vector3(1, 0, 0), sw.rotation.x);
      v.applyAxisAngle(new Vector3(0, 0, 1), tilt);
      return out.copy(v).add(wheelC);
    },
    exhaust,
    lamp,
    lampMat,
    meshes,
    wave(t: number, speed: number) {
      const p = penGeo.attributes.position;
      const k = 0.02 + Math.min(1, speed / 20) * 0.05;
      for (let i = 0; i < p.count; i++) {
        const x = penBase[i * 3] + 0.17;
        p.setZ(i, Math.sin(t * (6 + speed * 0.4) + x * 14) * k * (x / 0.34));
      }
      p.needsUpdate = true;
      pennant.rotation.y = Math.PI + Math.min(0.5, speed * 0.02);
    },
    dispose() {
      tex.dispose();
      numTex.dispose();
      for (const x of own) x.dispose();
      for (let i = geos.length - 1; i >= 0; i--) if (own.has(geos[i])) geos.splice(i, 1);
      for (let i = mats.length - 1; i >= 0; i--) if (own.has(mats[i])) mats.splice(i, 1);
    },
  };
}

/** The driver's helmet: an open-face shell in the kart's colour down past the ears, a cream
 *  stripe over the crown front to back, the visor flipped up over the brow, a dark rim round the
 *  face's opening. Its centre at 0 (the head's), `r` its radius; it faces +z (as people do). */
export function buildHelmet(colour: string, r: number, ink: Material): Group {
  const g = new Group();
  // the shell: a sphere less the face's window (in front, below the brow) and below the neck
  const shell = new SphereGeometry(r, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.8).toNonIndexed();
  {
    const p = shell.attributes.position;
    const keepTri: number[] = [];
    for (let i = 0; i < p.count; i += 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let j = 0; j < 3; j++) {
        cx += p.getX(i + j) / 3;
        cy += p.getY(i + j) / 3;
        cz += p.getZ(i + j) / 3;
      }
      const l = Math.hypot(cx, cy, cz);
      const face = cz / l > 0.42 && cy / l < 0.36 && Math.abs(cx / l) < 0.78;
      if (!face) keepTri.push(i);
    }
    const pos = new Float32Array(keepTri.length * 9);
    keepTri.forEach((i, n) => {
      for (let j = 0; j < 3; j++) pos.set([p.getX(i + j), p.getY(i + j), p.getZ(i + j)], n * 9 + j * 3);
    });
    shell.setAttribute("position", new Float32BufferAttribute(pos, 3));
    shell.deleteAttribute("normal");
    shell.deleteAttribute("uv");
    shell.computeVertexNormals();
  }
  shell.scale(1.02, 1.02, 1.1);
  keep(shell);
  const sm = new Mesh(
    shell,
    keep(new MeshStandardMaterial({ color: colour, roughness: 0.22, flatShading: true, side: 2 })),
  );
  sm.castShadow = true;
  g.add(sm, new Mesh(inkOf(shell, 1), ink));
  // the stripe: front (to the brow) and back (to the neck), over the crown
  for (const [phi0, len] of [
    [Math.PI / 2 - 0.13, Math.PI * 0.32],
    [-Math.PI / 2 - 0.13, Math.PI * 0.6],
  ] as [number, number][]) {
    const st = keep(new SphereGeometry(r * 1.012, 4, 14, phi0, 0.26, 0, len));
    st.scale(1.02, 1.02, 1.1);
    g.add(new Mesh(st, flat("#f3ead6", { rough: 0.3 })));
  }
  // the visor, up over the brow: a smoked band, its ink
  const vz = keep(new SphereGeometry(r * 1.06, 18, 3, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.2, Math.PI * 0.12));
  vz.scale(1.02, 1.02, 1.1);
  const visor = new Mesh(
    vz,
    keep(
      new MeshStandardMaterial({
        color: "#2b3a42",
        roughness: 0.05,
        metalness: 0.6,
        transparent: true,
        opacity: 0.85,
        side: 2,
      }),
    ),
  );
  g.add(visor, new Mesh(inkOf(vz, 0.6), ink));
  return g;
}

export function disposeKarts() {
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  geos.length = 0;
  mats.length = 0;
}

type Chars = typeof import("../../chars");
export interface KartDriver {
  model: InstanceType<Chars["PersonModel"]>;
  /** built (a few a frame by the factory): pose it only once it is */
  ready(): boolean;
  /** seated: legs out, hands on the rim (the wheel as it's turned), leaning into a turn (+ to its
   *  right), slumped when spun out; the helmet on once the head's there */
  pose(lean?: number, dizzy?: boolean): void;
  dispose(): void;
}
/** A person in a kart's seat, in a helmet in the kart's colour. */
export function kartDriver(
  C: Chars,
  f: InstanceType<Chars["CharFactory"]>,
  kart: Kart,
  look: import("@yutopia/shared").AvatarLayers,
  colour: string,
  mats: { body: Material; ink: Material },
): KartDriver {
  // (under the helmet: what's on the head comes off, big hair's tucked in; long hair hangs below)
  const tucked: Record<string, string> = {
    curly: "short",
    afro: "short",
    bun: "short",
    mohawk: "buzz",
    spiky: "short",
    slick: "short",
  };
  const m = new C.PersonModel(
    f,
    { ...look, hair: (tucked[look.hair] ?? look.hair) as typeof look.hair, accessory: "none" },
    0,
    mats,
  );
  m.root.position.set(kart.hip.x, 0, kart.hip.z);
  m.root.rotation.y = Math.PI / 2; // (people face +z; the kart's nose is +x)
  m.root.scale.setScalar(0.9);
  kart.body.add(m.root);
  let helmet: Group | null = null;
  const v = new Vector3();
  return {
    model: m,
    ready: () => m.update(),
    pose(lean = 0, dizzy = false) {
      const pose = C.carPose(true);
      // (a kart's seat is on the floor: legs out ahead, near flat, knees up a little)
      pose.thighL = [-1.42, 0, 0.12];
      pose.thighR = [-1.42, 0, -0.12];
      pose.kneeL = [0.42, 0, 0];
      pose.kneeR = [0.42, 0, 0];
      pose.ankleL = [-0.35, 0, 0];
      pose.ankleR = [-0.35, 0, 0];
      pose.spine = [-0.22 + (dizzy ? 0.2 : 0), 0, lean * 0.25];
      pose.neck = [0.12, 0, -lean * 0.12];
      m.setPose(pose, [0, m.sitDrop((kart.hip.y + 0.02) / 0.9), 0]);
      m.setFace(1, 0);
      kart.root.updateMatrixWorld(true);
      for (const [sd, phi] of [
        ["L", -1.1],
        ["R", 1.1],
      ] as const) {
        kart.rim(phi, v);
        kart.body.localToWorld(v);
        m.reachTo(sd, v, 1, [-0.75, -1, -0.35]);
      }
      if (!helmet) {
        const head = m.bone("head");
        if (head) {
          const crown = m.crown;
          helmet = buildHelmet(colour, Math.max(0.2, crown * 0.64), mats.ink);
          helmet.position.set(0, crown * 0.6, -0.015);
          head.add(helmet);
        }
      }
    },
    dispose() {
      m.dispose();
    },
  };
}
