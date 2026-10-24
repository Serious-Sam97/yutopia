import { MOTORS } from "@yutopia/shared/grounds";
import {
  type BufferGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { G, place, tinted } from "./campus";
import type { Themes } from "./sky";
import { SNOW } from "./snow3d";

// Someone's own bay and the car dealer in 3D (docs/plan/43-the-spot.md): the
// wooden board with their name at a claimed bay's head, and MOTORS' forecourt
// on Main Street — its concrete, the kerb and its way in, the collection bay,
// the pole sign, the bunting and the flood lamps. The vehicles on show are the
// cars' own models, put there by whoever draws the forecourt.

const PINE = 0xc49660;
const PINE_EDGE = 0x9c7346;
const POST = 0x6e5a44;

/** The board's front (its uvs, a plank 512 × 168 at the canvas's top) and its enamel tag (160 × 80
 *  under it, left): the name burnt into the pine in caps, the bay's label white on the lot's blue. */
export function boardCanvas(T: Themes, name: string, label: string): HTMLCanvasElement {
  const { c, g } = T.canvas(512, 256);
  // the plank: pine, its grain running along it, darker to the weathered edges
  g.fillStyle = "#c99a62";
  g.fillRect(0, 0, 512, 168);
  let seed = 7;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const r = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 46; i++) {
    const y = r() * 168;
    const a = 2 + r() * 5;
    const f = 0.004 + r() * 0.01;
    const ph = r() * 6;
    g.strokeStyle = r() < 0.5 ? "rgba(140,96,52,0.35)" : "rgba(176,128,76,0.4)";
    g.lineWidth = 0.8 + r() * 1.6;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const yy = y + Math.sin(x * f + ph) * a;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  // a knot
  const kx = 60 + r() * 392;
  const ky = 30 + r() * 108;
  g.fillStyle = "rgba(120,78,40,0.55)";
  g.beginPath();
  g.ellipse(kx, ky, 11, 6, 0, 0, Math.PI * 2);
  g.fill();
  const edge = g.createLinearGradient(0, 0, 0, 168);
  edge.addColorStop(0, "rgba(90,60,30,0.35)");
  edge.addColorStop(0.12, "rgba(90,60,30,0)");
  edge.addColorStop(0.88, "rgba(90,60,30,0)");
  edge.addColorStop(1, "rgba(90,60,30,0.4)");
  g.fillStyle = edge;
  g.fillRect(0, 0, 512, 168);
  // the screws at its ends
  for (const x of [22, 490]) {
    g.fillStyle = "#4a3a2a";
    g.beginPath();
    g.arc(x, 84, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#8a7a66";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 4, 84);
    g.lineTo(x + 4, 84);
    g.stroke();
  }
  // the name, burnt in: a charred halo, then the letters
  const text = name.toUpperCase();
  let size = 96;
  const font = (s: number) => `700 ${s}px Rockwell, "Roboto Slab", Georgia, serif`;
  g.font = font(size);
  while (g.measureText(text).width > 430 && size > 30) g.font = font(--size);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.save();
  g.shadowColor = "rgba(92,52,22,0.85)";
  g.shadowBlur = 9;
  g.fillStyle = "#3b2414";
  g.fillText(text, 256, 90);
  g.restore();
  g.fillStyle = "#2a170c";
  g.fillText(text, 256, 90);
  // the tag: enamel, the lot's blue, a white rim
  g.fillStyle = "#e9edf1";
  g.beginPath();
  g.roundRect(0, 176, 160, 80, 12);
  g.fill();
  g.fillStyle = "#1f3554";
  g.beginPath();
  g.roundRect(6, 182, 148, 68, 9);
  g.fill();
  g.fillStyle = "#e9edf1";
  g.font = `700 46px "Helvetica Neue", Arial, sans-serif`;
  g.fillText(label, 80, 218);
  return c;
}

// the board's parts (local: its face looks +z, the post's foot at the origin): the plank at head
// height, over a parked car's roof (1.5–1.7), so it reads from the aisle past the car in its bay
const PLANK = { x: 0.55, y0: 1.45, y1: 1.81, z0: 0.045, z1: 0.075 };
const TAG = { x: 0.13, y0: 1.2, y1: 1.34, z: 0.047 };
const POST_TOP = 1.9;

/** A bay's board: `post` false when another board on the same spot has drawn it (the pair's). */
export function boardGeometry(post = true): { solid: BufferGeometry; face: BufferGeometry } {
  const s = new G();
  if (post) {
    s.color(POST).box(-0.045, 0, -0.045, 0.045, POST_TOP, 0.045);
    // its cap of snow
    s.color(SNOW).box(-0.06, POST_TOP, -0.06, 0.06, POST_TOP + 0.05, 0.06);
  }
  // the plank: pine edges, a bare back; the front is the face
  s.color(PINE_EDGE).box(-PLANK.x, PLANK.y0, PLANK.z0, PLANK.x, PLANK.y1, PLANK.z1 - 0.002);
  // snow along its top edge, a little over each side
  s.color(SNOW).box(-PLANK.x - 0.01, PLANK.y1, PLANK.z0 - 0.012, PLANK.x + 0.01, PLANK.y1 + 0.045, PLANK.z1 + 0.012);
  s.color(SNOW).box(-PLANK.x * 0.7, PLANK.y1 + 0.045, PLANK.z0, PLANK.x * 0.6, PLANK.y1 + 0.07, PLANK.z1);
  const f = new G().color(0xffffff);
  const v0 = 1 - 168 / 256;
  f.quad(
    [-PLANK.x, PLANK.y0, PLANK.z1],
    [PLANK.x, PLANK.y0, PLANK.z1],
    [PLANK.x, PLANK.y1, PLANK.z1],
    [-PLANK.x, PLANK.y1, PLANK.z1],
    [0, 0, 1],
    [
      [0, v0],
      [1, v0],
      [1, 1],
      [0, 1],
    ],
  );
  const tu = 160 / 512;
  const tv = 80 / 256;
  f.quad(
    [-TAG.x, TAG.y0, TAG.z],
    [TAG.x, TAG.y0, TAG.z],
    [TAG.x, TAG.y1, TAG.z],
    [-TAG.x, TAG.y1, TAG.z],
    [0, 0, 1],
    [
      [0, 0],
      [tu, 0],
      [tu, tv],
      [0, tv],
    ],
  );
  // (the plank's pine sides in the solid; its colour a touch lighter than the edge on top)
  s.color(PINE).box(-PLANK.x, PLANK.y1 - 0.004, PLANK.z0, PLANK.x, PLANK.y1, PLANK.z1 - 0.002);
  return { solid: s.build(), face: f.build() };
}

export interface BoardIn {
  x: number;
  z: number;
  ry: number;
  y?: number;
  name: string;
  label: string;
  /** another board here drew the post */
  post?: boolean;
}

/** The boards, each its own canvas (a few dozen at most), as one group. */
export function boards(T: Themes, list: BoardIn[]): Group {
  const root = new Group();
  const solids: BufferGeometry[] = [];
  for (const b of list) {
    const { solid, face } = boardGeometry(b.post !== false);
    solids.push(place(solid, b.x, b.y ?? 0, b.z, b.ry));
    const t = new CanvasTexture(boardCanvas(T, b.name, b.label));
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    const m = new Mesh(place(face, b.x, b.y ?? 0, b.z, b.ry), new MeshLambertMaterial({ map: t }));
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  if (solids.length) {
    const m = new Mesh(mergeGeometries(solids, false), new MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  return root;
}

// ── MOTORS ──

/** The pole sign's face: MOTORS in an 80s italic over three stripes, cream on dark green. */
export function motorsSignCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(512, 192);
  g.fillStyle = "#24382d";
  g.fillRect(0, 0, 512, 192);
  g.strokeStyle = "#efe3c4";
  g.lineWidth = 6;
  g.strokeRect(9, 9, 494, 174);
  const stripes = ["#e8a33d", "#c8642f", "#a8322a"];
  stripes.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    const y = 128 + i * 14;
    g.moveTo(30, y);
    g.lineTo(482, y);
    g.lineTo(474, y + 9);
    g.lineTo(22, y + 9);
    g.fill();
  });
  g.fillStyle = "#efe3c4";
  g.font = `italic 800 96px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText("MOTORS", 256, 112);
  return c;
}

/** The collection bay's sign. */
function collectCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(256, 128);
  g.fillStyle = "#efe3c4";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#24382d";
  g.fillRect(6, 6, 244, 116);
  g.fillStyle = "#efe3c4";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 30px "Helvetica Neue", Arial, sans-serif`;
  g.fillText("NEW CARS", 128, 44);
  g.font = `500 24px "Helvetica Neue", Arial, sans-serif`;
  g.fillText("collect here", 128, 84);
  return c;
}

export interface Motors {
  root: Group;
  /** where the flood lamps' heads are (lit after dark), aimed down onto the forecourt */
  floods: Vector3[];
  /** what glows after dark, and how bright fully dark (the Grounds' own night: grounds3d.ts) */
  lit: { m: MeshLambertMaterial; on: number }[];
  /** the sign's faces: lit after dark (0..1) */
  setNight(k: number): void;
}

/** The forecourt at ground height `y0` (the town is flat). */
export function motorsForecourt(T: Themes, y0: number): Motors {
  const root = new Group();
  const { yard, way, collect, sign } = MOTORS;
  const s = new G();
  const lit: MeshLambertMaterial[] = [];
  // the concrete, slabs 3 apart, swept but for a dusting along the back
  const yC = y0 + 0.05;
  s.color(0xb9b8b2).box(yard.x0, y0, yard.z0, yard.x1, yC, yard.z1);
  s.color(0x9a9994);
  for (let x = yard.x0 + 3; x < yard.x1; x += 3) s.box(x - 0.025, yC, yard.z0, x + 0.025, yC + 0.002, yard.z1);
  for (let z = yard.z0 + 3; z < yard.z1; z += 3) s.box(yard.x0, yC, z - 0.025, yard.x1, yC + 0.002, z + 0.025);
  // its kerb on the street side, dropped at the way in
  s.color(0x9ea2a6);
  s.box(yard.x0, y0, yard.z0 - 0.05, way.x0, yC + 0.12, yard.z0 + 0.2);
  s.color(0xa8aaae).box(way.x0, y0, yard.z0 - 0.05, way.x1, yC + 0.02, yard.z0 + 0.2);
  // a low white rail along the back and the east side (the showroom closes the west)
  s.color(0xe9e6de);
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.4));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      s.box(x - 0.05, y0, z - 0.05, x + 0.05, y0 + 0.75, z + 0.05);
    }
    s.box(
      Math.min(x0, x1) - 0.03,
      y0 + 0.62,
      Math.min(z0, z1) - 0.03,
      Math.max(x0, x1) + 0.03,
      y0 + 0.7,
      Math.max(z0, z1) + 0.03,
    );
  };
  for (const [x0, z0, x1, z1] of MOTORS.rails) rail(x0, z0, x1, z1);
  // the collection bay: painted, its sign at its back corner
  s.color(0xf2f0e8);
  const cw = 1.5;
  const cl = 2.9;
  s.box(collect.x - cw - 0.05, yC, collect.z - cl, collect.x - cw + 0.05, yC + 0.004, collect.z + cl);
  s.box(collect.x + cw - 0.05, yC, collect.z - cl, collect.x + cw + 0.05, yC + 0.004, collect.z + cl);
  s.box(collect.x - cw, yC, collect.z + cl - 0.1, collect.x + cw, yC + 0.004, collect.z + cl);
  // the pole sign: two posts, a box, MOTORS both ways
  const SH = 6.2;
  s.color(0x2a2e33);
  for (const [x, z] of MOTORS.signPosts) s.box(x - 0.09, y0, z - 0.09, x + 0.09, y0 + SH - 1.6, z + 0.09);
  s.color(0x1d2620).box(sign.x - 2.2, y0 + SH - 1.65, sign.z - 0.16, sign.x + 2.2, y0 + SH, sign.z + 0.16);
  s.color(SNOW).box(sign.x - 2.24, y0 + SH, sign.z - 0.2, sign.x + 2.24, y0 + SH + 0.09, sign.z + 0.2);
  // the collection sign's post
  const cs = MOTORS.collectSign;
  s.color(0x2a2e33).box(cs.x - 0.04, y0, cs.z - 0.04, cs.x + 0.04, y0 + 1.5, cs.z + 0.04);
  // the flood lamps: four poles, a head each leaning in over the cars
  const floods: Vector3[] = [];
  const poles = MOTORS.floods;
  for (const [x, z] of poles) {
    s.color(0x3a3f45).box(x - 0.07, y0, z - 0.07, x + 0.07, y0 + 5.6, z + 0.07);
    const toX = (yard.x0 + yard.x1) / 2 - x;
    const toZ = -390 - z;
    const l = Math.hypot(toX, toZ) || 1;
    const hx = x + (toX / l) * 0.45;
    const hz = z + (toZ / l) * 0.45;
    s.color(0x2a2e33).box(hx - 0.32, y0 + 5.35, hz - 0.22, hx + 0.32, y0 + 5.7, hz + 0.22);
    floods.push(new Vector3(hx, y0 + 5.3, hz));
  }
  const solid = new Mesh(s.build(), new MeshLambertMaterial({ vertexColors: true }));
  solid.receiveShadow = true;
  solid.castShadow = true;
  root.add(solid);
  // the lamps' glass (lit after dark)
  {
    const gl = new G().color(0xfff4dc);
    for (const p of floods) gl.box(p.x - 0.28, p.y - 0.02, p.z - 0.18, p.x + 0.28, p.y + 0.02, p.z + 0.18);
    const m = new MeshLambertMaterial({ vertexColors: true, emissive: 0xfff1d6, emissiveIntensity: 0 });
    lit.push(m);
    root.add(new Mesh(gl.build(), m));
  }
  // the signs' faces
  const face = (c: HTMLCanvasElement, glow: boolean) => {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    const m = new MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 });
    if (glow) lit.push(m);
    return m;
  };
  {
    const f = new G().color(0xffffff);
    const y1 = y0 + SH - 1.58;
    const y2 = y0 + SH - 0.07;
    f.quad(
      [sign.x - 2.12, y1, sign.z - 0.17],
      [sign.x + 2.12, y1, sign.z - 0.17],
      [sign.x + 2.12, y2, sign.z - 0.17],
      [sign.x - 2.12, y2, sign.z - 0.17],
      [0, 0, -1],
      [
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ],
    );
    f.quad(
      [sign.x - 2.12, y1, sign.z + 0.17],
      [sign.x + 2.12, y1, sign.z + 0.17],
      [sign.x + 2.12, y2, sign.z + 0.17],
      [sign.x - 2.12, y2, sign.z + 0.17],
      [0, 0, 1],
    );
    root.add(new Mesh(f.build(), face(motorsSignCanvas(T), true)));
    const k = new G().color(0xffffff);
    k.quad(
      [cs.x - 0.45, y0 + 1.0, cs.z - 0.05],
      [cs.x + 0.45, y0 + 1.0, cs.z - 0.05],
      [cs.x + 0.45, y0 + 1.45, cs.z - 0.05],
      [cs.x - 0.45, y0 + 1.45, cs.z - 0.05],
      [0, 0, -1],
      [
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ],
    );
    root.add(new Mesh(k.build(), face(collectCanvas(T), false)));
  }
  // the bunting: strings from the showroom's corner and the sign out to the poles, sagging
  {
    const b = new G();
    const cols = [0xa8322a, 0xe8a33d, 0x2f4a3b, 0xe9e2d0, 0x4a5a73];
    const string = (a: Vector3, c: Vector3, sag: number, seed: number) => {
      const len = a.distanceTo(c);
      const n = Math.floor(len / 0.5);
      const at = (t: number) => new Vector3().lerpVectors(a, c, t).setY(a.y + (c.y - a.y) * t - sag * 4 * t * (1 - t));
      for (let i = 0; i < n; i++) {
        const p = at(i / n);
        const q = at((i + 1) / n);
        b.color(0x2a2e33).box(
          Math.min(p.x, q.x) - 0.01,
          Math.min(p.y, q.y) - 0.01,
          Math.min(p.z, q.z) - 0.01,
          Math.max(p.x, q.x) + 0.01,
          Math.max(p.y, q.y) + 0.01,
          Math.max(p.z, q.z) + 0.01,
        );
        // a pennant hanging from the middle of each span
        const m = at((i + 0.15) / n);
        const m2 = at((i + 0.75) / n);
        const tip = at((i + 0.45) / n).setY(m.y - 0.38);
        b.color(cols[(i + seed) % cols.length]);
        const nrm = new Vector3()
          .subVectors(m2, m)
          .cross(new Vector3(0, 1, 0))
          .normalize();
        const tri = (u: Vector3, v: Vector3, w: Vector3, d: number) =>
          b.quad([u.x, u.y, u.z], [v.x, v.y, v.z], [w.x, w.y, w.z], [w.x, w.y, w.z], [nrm.x * d, 0, nrm.z * d]);
        tri(m, m2, tip, 1);
        tri(m, m2, tip, -1);
      }
    };
    const top = (p: [number, number], h: number) => new Vector3(p[0], y0 + h, p[1]);
    const corner = new Vector3(500.2, y0 + 4.6, yard.z0 + 0.2);
    const signTop = new Vector3(sign.x - 1.66, y0 + SH - 1.7, sign.z);
    string(corner, signTop, 0.45, 0);
    string(corner, top(poles[1], 5.5), 0.55, 2);
    string(signTop, top(poles[1], 5.5), 0.4, 4);
    string(signTop, top(poles[3], 5.5), 0.35, 1);
    string(top(poles[0], 5.5), top(poles[1], 5.5), 0.5, 3);
    string(top(poles[1], 5.5), top(poles[2], 5.5), 0.5, 0);
    const m = new Mesh(b.build(), new MeshLambertMaterial({ vertexColors: true, side: 2 }));
    m.castShadow = true;
    root.add(m);
  }
  // snow pushed up at the back corners
  {
    const parts = [
      [yard.x0 + 1.2, yard.z1 - 1.0, 1.1],
      [yard.x1 - 1.2, yard.z1 - 1.2, 0.9],
      [yard.x1 - 1.0, yard.z0 + 2.4, 0.7],
    ].map(([x, z, k]) => place(tinted(new SphereGeometry(1, 9, 6).scale(k * 1.3, k * 0.5, k), SNOW), x, y0, z));
    const m = new Mesh(mergeGeometries(parts, false), new MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    root.add(m);
  }
  return {
    root,
    floods,
    lit: lit.map((m) => ({ m, on: m.map ? 0.75 : 1.4 })),
    setNight(k: number) {
      for (const m of lit) m.emissiveIntensity = k * (m.map ? 0.75 : 1.4);
    },
  };
}
