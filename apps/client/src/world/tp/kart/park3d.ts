import { LAMPS, WAYS } from "@yutopia/shared/grounds";
import {
  KART_CARPARK,
  KART_DESK,
  KART_FENCE,
  KART_GATE,
  KART_NAME,
  KART_PADDOCK,
  KART_RACK,
  KART_SHED,
  KART_SIGN,
  KART_STANDS,
  KART_THINGS,
  KART_TURN,
  kartLayout,
  kartLayoutNow,
  kartSignWings,
  kartTrack,
  STAND_AISLE,
  STAND_WALL,
  standAisles,
  standRoof,
} from "@yutopia/shared/kart";
import type * as THREE_NS from "three";
import { drawBoardFace } from "../../kart/track-map";
import { MeshSketch, Out, ZPX } from "../kit3d";

// The Kart Park round its circuit (docs/plan/46-the-karts.md, "the way in"): the paddock (its
// painted concrete, the rack's shed, race control's hut behind the desk, the lap records, the
// fire barrel and its benches, the kart up on its stand, the podium, the bunting), the car park
// and the turning circle outside the gate (painted asphalt, kerbs, islands, wheel stops, the
// plough's heaps, the P sign, the island's plinth), the billboard on the county road's corner and
// its fingerpost. Part of the park's chunk (karts3d.ts stageKarts): the scenery is built once.

type THREE = typeof THREE_NS;
export interface ParkEnv {
  T3: THREE;
  root: THREE_NS.Object3D;
  keep: <T extends { dispose(): void }>(d: T) => T;
  tex: (c: HTMLCanvasElement, srgb?: boolean) => THREE_NS.CanvasTexture;
  std: (color: string | number, o?: Partial<THREE_NS.MeshStandardMaterialParameters>) => THREE_NS.MeshStandardMaterial;
  canvas: (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => HTMLCanvasElement;
  glows: { m: THREE_NS.MeshStandardMaterial; on: number }[];
  night: number;
  padY: (x: number, z: number) => number;
  /** the item art, when the game has it already (else fetched: the stills) */
  items?: typeof import("../../art/items");
}

const WALNUT = "#4a3324";
const RUST = "#b5562f";
const CREAM = "#f3ead6";
const AMBER = "#e8a33d";
const GREEN = "#2f4a3b";
const STEEL = "#5d646b";
const SNOW = "#f1f5f8";
const CONCRETE = "#c9ccce";
const SERIF = "Georgia, 'Times New Roman', serif";
const TYPED = "'Courier New', monospace";

/** Boxes and the like gathered by material and drawn as one mesh each (a few draw calls for
 *  the lot of them). */
function batch(e: ParkEnv) {
  const { T3 } = e;
  const by = new Map<THREE_NS.Material, THREE_NS.BufferGeometry[]>();
  const m4 = new T3.Matrix4();
  const q = new T3.Quaternion();
  const eu = new T3.Euler();
  const one = new T3.Vector3(1, 1, 1);
  const put = (
    g: THREE_NS.BufferGeometry,
    m: THREE_NS.Material,
    x: number,
    y: number,
    z: number,
    ry = 0,
    rx = 0,
    rz = 0,
  ) => {
    m4.compose(new T3.Vector3(x, y, z), q.setFromEuler(eu.set(rx, ry, rz, "YXZ")), one);
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    flat.applyMatrix4(m4);
    const l = by.get(m) ?? [];
    l.push(flat);
    by.set(m, l);
  };
  return {
    put,
    box(
      w: number,
      h: number,
      d: number,
      m: THREE_NS.Material,
      x: number,
      y: number,
      z: number,
      ry = 0,
      rx = 0,
      rz = 0,
    ) {
      put(new T3.BoxGeometry(w, h, d), m, x, y, z, ry, rx, rz);
    },
    cyl(
      r0: number,
      r1: number,
      h: number,
      m: THREE_NS.Material,
      x: number,
      y: number,
      z: number,
      seg = 8,
      rx = 0,
      rz = 0,
    ) {
      put(new T3.CylinderGeometry(r0, r1, h, seg), m, x, y, z, 0, rx, rz);
    },
    done(cast = true) {
      for (const [m, gs] of by) {
        const n = gs.reduce((s, g) => s + g.attributes.position.count, 0);
        const merged = e.keep(new T3.BufferGeometry());
        for (const name of ["position", "normal", "uv"]) {
          const size = name === "uv" ? 2 : 3;
          const arr = new Float32Array(n * size);
          let o = 0;
          for (const g of gs) {
            const a = g.attributes[name];
            if (a) arr.set(a.array as Float32Array, o);
            o += g.attributes.position.count * size;
          }
          merged.setAttribute(name, new T3.BufferAttribute(arr, size));
        }
        for (const g of gs) g.dispose();
        const mesh = new T3.Mesh(merged, m);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        e.root.add(mesh);
      }
      by.clear();
    },
  };
}

/** A flat picture laid on the ground over a rectangle (its top north), `lift` over the pad. */
function decal(
  e: ParkEnv,
  c: HTMLCanvasElement,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  lift: number,
  cut = false,
) {
  const { T3 } = e;
  const t = e.tex(c);
  const m = e.keep(
    new T3.MeshStandardMaterial({
      map: t,
      roughness: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      alphaTest: cut ? 0.5 : 0,
    }),
  );
  const p = new T3.Mesh(e.keep(new T3.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)), m);
  p.position.set((x0 + x1) / 2, e.padY((x0 + x1) / 2, (z0 + z1) / 2) + lift, (z0 + z1) / 2);
  p.receiveShadow = true;
  e.root.add(p);
  return m;
}
/** Specks of grit and wear over a picture. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number) {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const big = i % 9 === 0;
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${big ? 0.035 : 0.06})` : `rgba(255,255,255,${big ? 0.035 : 0.05})`;
    const sz = big ? 10 + r() * 40 : 1 + r() * 2.5;
    g.fillRect(r() * w, r() * h, sz, sz * (big ? 0.6 + r() : 1));
  }
}
/** A string of pennants hanging between two points (sagging `sag` in the middle). */
function bunting(e: ParkEnv, pts: [number, number, number][][], sag = 0.6) {
  const { T3 } = e;
  const pos: number[] = [];
  const col: number[] = [];
  const cols = [RUST, CREAM, AMBER, GREEN].map((c) => new T3.Color(c));
  const line: number[] = [];
  for (const [a, b] of pts) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(2, Math.floor(len / 0.55));
    const at = (t: number): [number, number, number] => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ];
    for (let i = 0; i < n; i++) {
      const p = at(i / n);
      const q = at((i + 1) / n);
      line.push(...p, ...q);
      if (i % 2) continue;
      const m = at((i + 0.5) / n);
      const c = cols[(i / 2) % cols.length];
      pos.push(...p, ...q, m[0], m[1] - 0.32, m[2]);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = e.keep(new T3.BufferGeometry());
  g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T3.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  e.root.add(
    new T3.Mesh(g, e.keep(new T3.MeshStandardMaterial({ vertexColors: true, side: T3.DoubleSide, roughness: 0.9 }))),
  );
  const lg = e.keep(new T3.BufferGeometry());
  lg.setAttribute("position", new T3.Float32BufferAttribute(line, 3));
  e.root.add(new T3.LineSegments(lg, e.keep(new T3.LineBasicMaterial({ color: "#2a2018" }))));
}
/** Something lit after dark: its material, how bright then. */
function lit(
  e: ParkEnv,
  color: string,
  emissive: string,
  on: number,
  o: Partial<THREE_NS.MeshStandardMaterialParameters> = {},
) {
  const m = e.std(color, { emissive, emissiveIntensity: e.night * on, ...o });
  e.glows.push({ m, on });
  return m;
}

// ── the paddock ─────────────────────────────────────────────────────────────
export function paddock3d(e: ParkEnv) {
  const { T3 } = e;
  const P = KART_PADDOCK;
  const S = KART_SHED;
  const R = KART_RACK;
  const y0 = e.padY((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2);
  benches(e);
  const b = batch(e);
  const wood = e.std(WALNUT);
  const green = e.std(GREEN);
  const steel = e.std(STEEL, { metalness: 0.4, roughness: 0.5 });
  const snow = e.std(SNOW, { roughness: 0.95 });
  const rubber = e.std("#1d1e20", { roughness: 0.9 });

  // the slab: its edge, and over it the concrete painted (16 px a metre, north up)
  {
    const PX = 16;
    const W = (P.x1 - P.x0) * PX;
    const H = (P.z1 - P.z0) * PX;
    const X = (x: number) => (x - P.x0) * PX;
    const Z = (z: number) => (z - P.z0) * PX;
    const c = e.canvas(W, H, (g) => {
      g.fillStyle = "#c4c6c3";
      g.fillRect(0, 0, W, H);
      grain(g, W, H, 2600, 7);
      // the joints, a slab every 4 m
      g.strokeStyle = "rgba(110,112,110,0.55)";
      g.lineWidth = 2;
      for (let x = 4; x < P.x1 - P.x0; x += 4) {
        g.beginPath();
        g.moveTo(x * PX, 0);
        g.lineTo(x * PX, H);
        g.stroke();
      }
      for (let z = 4; z < P.z1 - P.z0; z += 4) {
        g.beginPath();
        g.moveTo(0, z * PX);
        g.lineTo(W, z * PX);
        g.stroke();
      }
      // the karts' tyre marks out of the rack, swinging north and south
      g.strokeStyle = "rgba(25,25,28,0.13)";
      g.lineWidth = 5;
      for (let i = 0; i < R.n; i++) {
        const z = R.z0 + i * R.dz;
        for (const k of [-1, 1]) {
          g.beginPath();
          g.moveTo(X(R.x + 1.2), Z(z + k * 0.5));
          g.quadraticCurveTo(X(R.x + 7), Z(z + k * 0.6), X(R.x + 9 + i), Z(z + (i % 2 ? 7 : -7)));
          g.stroke();
        }
      }
      // the bays, a line between each kart; a rust and cream kerb painted along the shed's front
      g.fillStyle = "rgba(243,234,214,0.9)";
      for (let i = 0; i <= R.n; i++) g.fillRect(X(R.x - 1.6), Z(R.z0 - R.dz / 2 + i * R.dz) - 1.5, 3.2 * PX, 3);
      for (let z = S.z0; z < S.z1; z += 1) {
        g.fillStyle = Math.floor(z - S.z0) % 2 ? CREAM : RUST;
        g.fillRect(X(S.x1 + 0.35), Z(z), 0.45 * PX, PX);
      }
      // the walk from the gate to the desk: two amber lines, chevrons along it
      const [w0, w1] = [KART_GATE.x - 1.6, KART_GATE.x + 1.6];
      const top = KART_DESK.z + 3;
      g.fillStyle = "rgba(232,163,61,0.85)";
      for (const x of [w0, w1]) g.fillRect(X(x) - 3, Z(top), 6, H - Z(top));
      g.strokeStyle = "rgba(232,163,61,0.8)";
      g.lineWidth = 6;
      for (let z = P.z1 - 6; z > top + 2; z -= 7) {
        g.beginPath();
        g.moveTo(X(w0 + 0.6), Z(z + 0.8));
        g.lineTo(X(KART_GATE.x), Z(z));
        g.lineTo(X(w1 - 0.6), Z(z + 0.8));
        g.stroke();
      }
      // the words, read coming in (from the south)
      g.fillStyle = "rgba(243,234,214,0.85)";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 ${1.5 * PX}px ${SERIF}`;
      g.fillText("P A D D O C K", X(P.x1 - 7), Z(P.z1 - 5));
      g.font = `700 ${0.9 * PX}px ${TYPED}`;
      g.fillText("RACE CONTROL  ↑", X(KART_GATE.x), Z(top + 4));
      // oil under the stand, soot round the barrel
      for (const t of KART_THINGS) {
        if (t.kind !== "stand" && t.kind !== "fire") continue;
        const gr = g.createRadialGradient(X(t.x), Z(t.z), 0, X(t.x), Z(t.z), 2.2 * PX);
        gr.addColorStop(0, "rgba(20,18,16,0.28)");
        gr.addColorStop(1, "rgba(20,18,16,0)");
        g.fillStyle = gr;
        g.fillRect(X(t.x - 2.2), Z(t.z - 2.2), 4.4 * PX, 4.4 * PX);
      }
    });
    const edge = new T3.Mesh(
      e.keep(new T3.BoxGeometry(P.x1 - P.x0 + 0.3, 0.14, P.z1 - P.z0 + 0.3)),
      e.std("#a9adb0", { roughness: 0.9 }),
    );
    edge.position.set((P.x0 + P.x1) / 2, y0, (P.z0 + P.z1) / 2);
    edge.receiveShadow = true;
    e.root.add(edge);
    decal(e, c, P.x0, P.z0, P.x1, P.z1, 0.08);
  }

  // the rack's shed: posts every two bays, a roof sloping to its board wall at the back, the
  // fascia with the bays' numbers, a striped valance, lamps under it
  {
    const len = S.z1 - S.z0;
    const zm = (S.z0 + S.z1) / 2;
    const [hf, hb] = [3.5, 2.9]; // the roof's underside at the front and the back
    for (let z = S.z0; z <= S.z1 + 0.01; z += 2 * R.dz) {
      b.box(0.2, hf, 0.2, wood, S.x1, y0 + hf / 2, z);
      b.box(0.2, hb, 0.2, wood, S.x0 + 0.1, y0 + hb / 2, z);
      // a brace under the beam
      b.box(0.1, 0.1, 1.1, wood, S.x1, y0 + hf - 0.45, z + 0.4, 0, Math.PI / 4);
    }
    b.box(0.22, 0.24, len + 0.2, wood, S.x1, y0 + hf - 0.1, zm); // the front beam
    // the roof: corrugated steel under a blanket of snow, its fall to the back
    const run = S.x1 - S.x0 + 1.2;
    const fall = Math.atan2(hf - hb, S.x1 - S.x0);
    const xm = (S.x0 + S.x1) / 2 + 0.1;
    const corr = e.tex(
      e.canvas(64, 16, (g) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? "#56625e" : "#6c7a75";
          g.fillRect(i * 8, 0, 8, 16);
        }
      }),
    );
    corr.wrapS = T3.RepeatWrapping;
    corr.wrapT = T3.RepeatWrapping;
    corr.repeat.set(1, len * 2.2);
    const roofM = e.keep(new T3.MeshStandardMaterial({ map: corr, roughness: 0.55, metalness: 0.3 }));
    const roof = new T3.Mesh(e.keep(new T3.BoxGeometry(run, 0.12, len + 1)), [roofM, roofM, snow, roofM, roofM, roofM]);
    roof.position.set(xm, y0 + (hf + hb) / 2 + 0.06, zm);
    roof.rotation.z = fall;
    roof.castShadow = true;
    roof.receiveShadow = true;
    e.root.add(roof);
    const cap = new T3.Mesh(e.keep(new T3.BoxGeometry(run - 0.25, 0.16, len + 0.7)), snow);
    cap.position.set(xm, y0 + (hf + hb) / 2 + 0.2, zm);
    cap.rotation.z = fall;
    cap.castShadow = true;
    e.root.add(cap);
    // the back wall: boards, the park's name painted on the inside facing the paddock
    const wall = e.tex(
      e.canvas(1024, 96, (g) => {
        for (let i = 0; i < 64; i++) {
          g.fillStyle = i % 2 ? "#2c4537" : "#33503f";
          g.fillRect(i * 16, 0, 16, 96);
        }
        for (let i = 0; i < 64; i++) {
          g.fillStyle = (i + (i > 31 ? 1 : 0)) % 2 ? "#151515" : CREAM;
          g.fillRect(i * 16, 0, 16, 10);
          g.fillStyle = i % 2 ? CREAM : "#151515";
          g.fillRect(i * 16, 86, 16, 10);
        }
        g.fillStyle = CREAM;
        g.font = `700 46px ${SERIF}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(KART_NAME.split("").join(" "), 512, 50);
      }),
    );
    const wm = e.keep(new T3.MeshStandardMaterial({ map: wall, roughness: 0.85 }));
    const back = new T3.Mesh(e.keep(new T3.BoxGeometry(0.14, hb, len + 0.2)), [wm, green, green, green, green, green]);
    back.position.set(S.x0 + 0.03, y0 + hb / 2, zm);
    back.castShadow = true;
    e.root.add(back);
    // the fascia: walnut, each bay's number over it (read from the paddock: east)
    const fz = len + 0.8;
    const fas = e.tex(
      e.canvas(2048, 64, (g) => {
        g.fillStyle = WALNUT;
        g.fillRect(0, 0, 2048, 64);
        g.strokeStyle = AMBER;
        g.lineWidth = 3;
        g.strokeRect(3, 3, 2042, 58);
        g.textAlign = "center";
        g.textBaseline = "middle";
        for (let i = 0; i < R.n; i++) {
          // (its left end is the south end: its plane faces east)
          const u = ((S.z1 + 0.4 - (R.z0 + i * R.dz)) / fz) * 2048;
          g.fillStyle = CREAM;
          g.beginPath();
          g.arc(u, 32, 23, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = WALNUT;
          g.font = `700 34px ${SERIF}`;
          g.fillText(String(i + 1), u, 34);
        }
      }),
    );
    const fm = lit(e, "#ffffff", "#ffffff", 0.25, { map: fas, emissiveMap: fas, roughness: 0.7 });
    const fascia = new T3.Mesh(e.keep(new T3.PlaneGeometry(fz, 0.55)), fm);
    fascia.rotation.y = Math.PI / 2;
    fascia.position.set(S.x1 + 0.62, y0 + hf + 0.12, zm);
    e.root.add(fascia);
    b.box(0.1, 0.55, fz, wood, S.x1 + 0.56, y0 + hf + 0.12, zm);
    // the valance under it: rust and cream, scalloped
    const val = e.tex(
      e.canvas(1024, 48, (g) => {
        for (let i = 0; i < 32; i++) {
          g.fillStyle = i % 2 ? CREAM : RUST;
          g.beginPath();
          g.moveTo(i * 32, 0);
          g.lineTo(i * 32 + 32, 0);
          g.lineTo(i * 32 + 32, 26);
          g.arc(i * 32 + 16, 26, 16, 0, Math.PI);
          g.closePath();
          g.fill();
        }
      }),
    );
    val.wrapS = T3.RepeatWrapping;
    val.repeat.set(fz / 9, 1);
    const vm = e.keep(
      new T3.MeshStandardMaterial({
        map: val,
        alphaTest: 0.5,
        transparent: false,
        side: T3.DoubleSide,
        roughness: 0.9,
      }),
    );
    const valance = new T3.Mesh(e.keep(new T3.PlaneGeometry(fz, 0.5)), vm);
    valance.rotation.y = Math.PI / 2;
    valance.position.set(S.x1 + 0.6, y0 + hf - 0.4, zm);
    e.root.add(valance);
    // the lamps under the roof: a warm bulb in a shade over every other bay
    const bulb = lit(e, "#fff2d0", "#ffd890", 3);
    for (let i = 0; i < R.n; i += 2) {
      const z = R.z0 + (i + 0.5) * R.dz;
      b.cyl(0.05, 0.28, 0.2, steel, S.x1 - 1.6, y0 + hf - 0.45, z, 10);
      b.put(new T3.SphereGeometry(0.11, 8, 6), bulb, S.x1 - 1.6, y0 + hf - 0.58, z);
    }
    // the karts' kit on hooks on the back wall: a helmet over each bay
    const shell = [RUST, GREEN, AMBER, "#3d4a5c"].map((c) => e.std(c, { roughness: 0.4 }));
    for (let i = 0; i < R.n; i++)
      b.put(
        new T3.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
        shell[i % 4],
        S.x0 + 0.3,
        y0 + 1.75,
        R.z0 + i * R.dz + 1.2,
        0,
        0,
        -0.3,
      );
  }

  // what else stands about
  for (const t of KART_THINGS) {
    const y = e.padY(t.x, t.z) + 0.08;
    if (t.kind === "hut") hut(e, b, t, y);
    else if (t.kind === "board") records(e, b, t, y);
    else if (t.kind === "circuits") circuits(e, b, t, y);
    else if (t.kind === "fire") {
      // a drum, its holes glowing, a fire in it
      b.cyl(0.34, 0.32, 0.9, e.std("#6b3a22", { roughness: 0.8, metalness: 0.3 }), t.x, y + 0.45, t.z, 14);
      b.cyl(0.35, 0.35, 0.05, e.std("#3b2414"), t.x, y + 0.2, t.z, 14);
      b.cyl(0.35, 0.35, 0.05, e.std("#3b2414"), t.x, y + 0.7, t.z, 14);
      const ember = lit(e, "#ff7a1f", "#ff6a10", 3, { emissiveIntensity: 1.6 + e.night * 3 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.box(0.07, 0.07, 0.02, ember, t.x + Math.cos(a) * 0.33, y + 0.45, t.z + Math.sin(a) * 0.33, -a + Math.PI / 2);
      }
      const fm = e.std("#ffb347", { emissive: "#ff8a2a", emissiveIntensity: 2.2, roughness: 1 });
      const flame = new T3.Group();
      for (let i = 0; i < 4; i++) {
        const f = new T3.Mesh(e.keep(new T3.ConeGeometry(0.12 + (i % 2) * 0.05, 0.55 - i * 0.07, 6)), fm);
        f.position.set(Math.cos(i * 1.9) * 0.12, 0.25, Math.sin(i * 1.9) * 0.12);
        flame.add(f);
      }
      flame.position.set(t.x, y + 0.9, t.z);
      // (flickers: a little sway and stretch each frame)
      (flame.children[0] as THREE_NS.Mesh).onBeforeRender = () => {
        const s = performance.now() / 1000;
        flame.children.forEach((f, i) => {
          f.scale.y = 0.8 + 0.35 * Math.abs(Math.sin(s * (6 + i * 1.7) + i));
          f.rotation.z = Math.sin(s * (3 + i) + i * 2) * 0.15;
        });
      };
      e.root.add(flame);
    } else if (t.kind === "bench") {
      // (the office's: benches(), below)
    } else if (t.kind === "stand") {
      // a red stand, a kart up on it (karts3d.ts puts the kart there); a creeper under
      const red = e.std("#a5281c", { roughness: 0.5 });
      for (const k of [-1, 1]) b.box(t.hx * 1.6, 0.08, 0.1, red, t.x, y + 0.5, t.z + k * 0.45);
      for (const kx of [-1, 1])
        for (const kz of [-1, 1]) b.box(0.08, 0.5, 0.08, red, t.x + kx * t.hx * 0.75, y + 0.25, t.z + kz * 0.45);
      b.box(0.5, 0.06, 0.9, e.std("#3a3d42"), t.x + 0.9, y + 0.1, t.z + 1.0, 0.3);
      // a wheel off, leaning on the stand
      b.put(
        new T3.CylinderGeometry(0.15, 0.15, 0.14, 14),
        rubber,
        t.x - t.hx - 0.1,
        y + 0.16,
        t.z + 0.9,
        0,
        Math.PI / 2,
        0.2,
      );
    } else if (t.kind === "tools") {
      // the tool chest: red drawers on castors, a spanner left on top
      const red = e.std("#a5281c", { roughness: 0.45, metalness: 0.2 });
      b.box(t.hx * 2, 0.95, t.hz * 2, red, t.x, y + 0.55, t.z);
      for (let i = 0; i < 4; i++) b.box(t.hx * 1.7, 0.03, 0.02, steel, t.x, y + 0.3 + i * 0.2, t.z + t.hz + 0.01);
      for (const kx of [-1, 1])
        for (const kz of [-1, 1]) b.cyl(0.04, 0.04, 0.06, rubber, t.x + kx * 0.3, y + 0.04, t.z + kz * 0.2);
      b.box(0.3, 0.02, 0.05, steel, t.x, y + 1.04, t.z, 0.6);
    } else if (t.kind === "tyres") {
      // spares, stacked, snow on the top one
      const n = 3 + (Math.round(t.x + t.z) % 2);
      for (let i = 0; i < n; i++)
        b.put(new T3.TorusGeometry(0.27, 0.11, 6, 14), rubber, t.x, y + 0.11 + i * 0.21, t.z, i * 0.4, Math.PI / 2);
      b.cyl(0.3, 0.32, 0.05, snow, t.x, y + n * 0.21 + 0.02, t.z, 12);
    } else if (t.kind === "podium") podium(e, b, t, y);
    else if (t.kind === "cocoa") cocoa(e, b, t, y);
  }

  // bunting: along the paddock's lamps down its east edge and on to the podium, and over the walk
  // from the shed's front to each lamp
  {
    const lamps = LAMPS.filter((l) => l.kind === "lone" && l.x > P.x0 && l.x < P.x1 && l.z > P.z0 && l.z < P.z1).sort(
      (a, c) => a.z - c.z,
    );
    const top = (x: number, z: number, h: number): [number, number, number] => [x, e.padY(x, z) + h, z];
    const pts = lamps.map((l) => top(l.x, l.z, 4.1));
    const pod = KART_THINGS.find((t) => t.kind === "podium");
    if (pod) pts.push(top(pod.x + pod.hx - 0.2, pod.z - pod.hz + 0.2, 3.9));
    bunting(
      e,
      pts.slice(1).map((p, i) => [pts[i], p]),
      0.5,
    );
    const shed = (z: number) => top(S.x1, Math.min(S.z1, Math.max(S.z0 + 0.5, z)), 3.6);
    bunting(
      e,
      lamps.map((l, i) => [shed(l.z), pts[i]]),
      0.8,
    );
  }
  b.done();
}

/** The fire's benches: the office's (catalog `bench`, art/items/seating.ts), drawn by the item kit
 *  as the office's are in 3D (tp/build.ts): lit faces and ink, from the item art's chunk. */
function benches(e: ParkEnv) {
  const { T3 } = e;
  const draw = ({ drawItem }: typeof import("../../art/items")) => {
    const out = new Out();
    for (const [i, t] of KART_THINGS.entries()) {
      if (t.kind !== "bench") continue;
      const lift = e.padY(t.x, t.z) * ZPX;
      const s = new MeshSketch({
        rot: t.hz > t.hx ? 1 : 0,
        w: 3,
        h: 1,
        seed: 0.5,
        at: [t.x - t.hx, t.z - t.hz],
        lift,
        out,
      });
      drawItem(s, { kind: "bench", id: `kart-bench-${i}`, rot: t.hz > t.hx ? 1 : 0 });
      s.end();
    }
    if (!out.lit.empty) {
      const g = e.keep(new T3.BufferGeometry());
      g.setAttribute("position", new T3.Float32BufferAttribute(out.lit.pos, 3));
      g.setAttribute("normal", new T3.Float32BufferAttribute(out.lit.nor, 3));
      g.setAttribute("color", new T3.Float32BufferAttribute(out.lit.col, 4));
      const m = new T3.Mesh(g, e.keep(new T3.MeshLambertMaterial({ vertexColors: true })));
      m.castShadow = true;
      m.receiveShadow = true;
      e.root.add(m);
    }
    if (out.lines.length) {
      const g = e.keep(new T3.BufferGeometry());
      g.setAttribute("position", new T3.Float32BufferAttribute(out.lines, 3));
      g.setAttribute("color", new T3.Float32BufferAttribute(out.lineCol, 4));
      e.root.add(
        new T3.LineSegments(
          g,
          e.keep(new T3.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })),
        ),
      );
    }
  };
  // (the game's: built with the rest of the park, so the Grounds' light is put on it with it)
  if (e.items) draw(e.items);
  else void import("../../art/items").then(draw);
}

/** Race control: a green clapboard hut behind the desk, its serving window over it (lit), its
 *  sign on the eave, a stovepipe. */
function hut(e: ParkEnv, b: ReturnType<typeof batch>, t: (typeof KART_THINGS)[number], y: number) {
  const { T3 } = e;
  const [w, d, h] = [t.hx * 2, t.hz * 2, 2.6];
  const board = e.tex(
    e.canvas(256, 128, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#2c4537" : "#34513f";
        g.fillRect(0, i * 16, 256, 16);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(0, i * 16 + 14, 256, 2);
      }
    }),
  );
  board.wrapS = T3.RepeatWrapping;
  board.wrapT = T3.RepeatWrapping;
  board.repeat.set(2, 2);
  const wm = e.keep(new T3.MeshStandardMaterial({ map: board, roughness: 0.85 }));
  const body = new T3.Mesh(e.keep(new T3.BoxGeometry(w, h, d)), wm);
  body.position.set(t.x, y + h / 2, t.z);
  body.castShadow = true;
  body.receiveShadow = true;
  e.root.add(body);
  const cream = e.std(CREAM);
  // trim at the corners and the eaves
  for (const kx of [-1, 1])
    for (const kz of [-1, 1]) b.box(0.12, h, 0.12, cream, t.x + kx * t.hx, y + h / 2, t.z + kz * t.hz);
  // the gabled roof, its ridge along z, under snow
  const rise = 1.0;
  const over = 0.35;
  const half = t.hx + over;
  const slope = Math.atan2(rise, half);
  const slab = Math.hypot(half, rise);
  const roofM = e.std("#6b2430", { roughness: 0.7 });
  const snow = e.std(SNOW, { roughness: 0.95 });
  for (const k of [-1, 1]) {
    b.box(slab, 0.1, d + 0.7, roofM, t.x + (k * half) / 2, y + h + rise / 2, t.z, 0, 0, -k * slope);
    b.box(slab - 0.1, 0.12, d + 0.5, snow, t.x + (k * half) / 2, y + h + rise / 2 + 0.1, t.z, 0, 0, -k * slope);
  }
  // the gables: triangles of the same boards
  const tri = new T3.Shape();
  tri.moveTo(-t.hx, 0);
  tri.lineTo(t.hx, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  const gable = e.keep(new T3.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false }));
  const gm = new T3.Mesh(gable, e.std("#34513f"));
  gm.position.set(t.x, y + h, t.z - t.hz);
  e.root.add(gm);
  // the serving window over the desk (east), warm inside; its shutter propped up over it
  const win = lit(e, "#3a2a1a", "#ffcf8a", 1.2, { emissiveIntensity: 0.25 + e.night * 1.2 });
  const face = KART_DESK.face;
  const wx = t.x + face * (t.hx + 0.02);
  b.box(0.04, 1.0, d - 1.2, win, wx, y + 1.75, t.z);
  b.box(0.06, 0.08, d - 1.0, cream, wx + face * 0.02, y + 1.22, t.z);
  b.box(0.06, 0.08, d - 1.0, cream, wx + face * 0.02, y + 2.28, t.z);
  b.box(0.9, 0.05, d - 1.0, roofM, wx + face * 0.42, y + 2.36, t.z, 0, 0, -face * 0.3);
  // the sign on the eave
  const sign = e.tex(
    e.canvas(512, 96, (g) => {
      g.fillStyle = WALNUT;
      g.fillRect(0, 0, 512, 96);
      g.strokeStyle = AMBER;
      g.lineWidth = 5;
      g.strokeRect(6, 6, 500, 84);
      g.fillStyle = CREAM;
      g.font = `700 50px ${SERIF}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("RACE CONTROL", 256, 52);
    }),
  );
  const sm = lit(e, "#ffffff", "#ffffff", 0.35, { map: sign, emissiveMap: sign });
  const sp = new T3.Mesh(e.keep(new T3.PlaneGeometry(3.2, 0.6)), sm);
  sp.rotation.y = (face * Math.PI) / 2;
  sp.position.set(wx + face * 0.2, y + h + 0.35, t.z);
  e.root.add(sp);
  b.box(0.08, 0.66, 3.3, e.std(WALNUT), wx + face * 0.15, y + h + 0.35, t.z);
  // a stovepipe through the roof at the back
  b.cyl(0.1, 0.1, 1.4, e.std("#2a2b2d", { metalness: 0.5 }), t.x - face * 0.7, y + h + 0.9, t.z - t.hz + 1.2, 10);
  b.cyl(0.18, 0.18, 0.06, e.std("#2a2b2d"), t.x - face * 0.7, y + h + 1.62, t.z - t.hz + 1.2, 10);
}

/** The lap records: a chalkboard on two posts, facing the paddock (south). */
function records(e: ParkEnv, b: ReturnType<typeof batch>, t: (typeof KART_THINGS)[number], y: number) {
  const { T3 } = e;
  const wood = e.std(WALNUT);
  for (const k of [-1, 1]) b.box(0.12, 2.5, 0.12, wood, t.x + k * (t.hx - 0.1), y + 1.25, t.z);
  const c = e.canvas(512, 320, (g) => {
    g.fillStyle = "#24302a";
    g.fillRect(0, 0, 512, 320);
    grain(g, 512, 320, 500, 3);
    g.strokeStyle = "#7a5534";
    g.lineWidth = 16;
    g.strokeRect(8, 8, 496, 304);
    g.fillStyle = "rgba(243,234,214,0.92)";
    g.textAlign = "center";
    g.font = `700 40px ${SERIF}`;
    g.fillText("LAP RECORDS", 256, 64);
    g.fillRect(120, 80, 272, 3);
    g.textAlign = "left";
    g.font = `26px ${TYPED}`;
    const rows = [
      ["GRAND PRIX", "VORTEX", "0:37.92"],
      ["3 LAPS", "VORTEX", "1:56.40"],
      ["BATTLE", "—", "—"],
    ];
    rows.forEach(([a, n, tm], i) => {
      g.fillText(a, 40, 130 + i * 46);
      g.fillText(n, 230, 130 + i * 46);
      g.fillText(tm, 380, 130 + i * 46);
    });
    g.fillStyle = "rgba(232,163,61,0.9)";
    g.textAlign = "center";
    g.font = `italic 26px ${SERIF}`;
    g.fillText("beat the machine — ask at the desk", 256, 282);
  });
  const m = e.keep(new T3.MeshStandardMaterial({ map: e.tex(c), roughness: 0.95 }));
  const p = new T3.Mesh(e.keep(new T3.BoxGeometry(t.hx * 2 - 0.1, 1.5, 0.06)), [m, m, m, m, m, m]);
  p.position.set(t.x, y + 1.55, t.z);
  p.castShadow = true;
  e.root.add(p);
  b.box(t.hx * 2 + 0.1, 0.08, 0.2, e.std(SNOW), t.x, y + 2.34, t.z);
}

/** The board of the circuits (docs/plan/47-the-track-changer.md): two walnut posts, a cap with its
 *  snow and a lamp, the face to the south — the layout raced, its map, the next race; named
 *  `kart-circuits`, its face's canvas and texture in `userData` (the kart module paints it again
 *  when the layout or the next race changes). */
function circuits(e: ParkEnv, b: ReturnType<typeof batch>, t: (typeof KART_THINGS)[number], y: number) {
  const { T3 } = e;
  const wood = e.std(WALNUT);
  const W = t.hx * 2 - 0.1;
  for (const k of [-1, 1]) b.box(0.14, 2.7, 0.14, wood, t.x + k * (t.hx - 0.08), y + 1.35, t.z);
  b.box(W + 0.16, 1.78, 0.12, wood, t.x, y + 1.55, t.z - 0.02);
  b.box(W + 0.4, 0.1, 0.42, wood, t.x, y + 2.5, t.z);
  b.box(W + 0.36, 0.06, 0.38, e.std(SNOW), t.x, y + 2.58, t.z);
  // (its lamp: an arm out over the face, lit after dark)
  b.box(0.06, 0.06, 0.5, wood, t.x, y + 2.42, t.z + 0.3);
  b.box(0.3, 0.08, 0.14, lit(e, "#fff3dc", "#ffe7b8", 2.2), t.x, y + 2.36, t.z + 0.55);
  const lay = kartLayoutNow();
  const track = kartTrack(lay.key, lay.reverse);
  const c = e.canvas(1024, 680, (g) =>
    drawBoardFace(g, 1024, 680, track, kartLayout(lay.key).name.toUpperCase(), "NEXT RACE: ASK AT THE DESK"),
  );
  const tex = e.tex(c);
  // (lit after dark by its lamp: readable at night)
  const m = e.keep(
    new T3.MeshStandardMaterial({
      map: tex,
      roughness: 0.85,
      emissive: "#ffffff",
      emissiveMap: tex,
      emissiveIntensity: e.night * 0.55,
    }),
  );
  e.glows.push({ m, on: 0.55 });
  const face = new T3.Mesh(e.keep(new T3.PlaneGeometry(W - 0.06, 1.62)), m);
  face.position.set(t.x, y + 1.55, t.z + 0.05);
  face.name = "kart-circuits";
  face.userData = { canvas: c, tex, sig: "" };
  e.root.add(face);
}

/** The podium: three steps (second, first, third, west to east) facing the way in (south), a
 *  chequered backdrop with the park's name behind. */
function podium(e: ParkEnv, b: ReturnType<typeof batch>, t: (typeof KART_THINGS)[number], y: number) {
  const { T3 } = e;
  const steps: [number, number, number, string][] = [
    [-2.2, 0.7, 2, "#c9ccd1"],
    [0, 1.05, 1, AMBER],
    [2.2, 0.45, 3, "#c07a42"],
  ];
  const zf = t.z + t.hz - 0.8; // (the steps' middle)
  for (const [dx, h, n, medal] of steps) {
    const face = e.canvas(128, 128, (g) => {
      g.fillStyle = CREAM;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = medal;
      g.beginPath();
      g.arc(64, 64, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = WALNUT;
      g.font = `700 54px ${SERIF}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(n), 64, 68);
    });
    const fm = e.keep(new T3.MeshStandardMaterial({ map: e.tex(face), roughness: 0.7 }));
    const side = e.std(CREAM, { roughness: 0.7 });
    const top = e.std("#e6dcc6");
    const s = new T3.Mesh(e.keep(new T3.BoxGeometry(2.2, h, 1.6)), [side, side, top, side, fm, side]);
    s.position.set(t.x + dx, y + h / 2, zf);
    s.castShadow = true;
    s.receiveShadow = true;
    e.root.add(s);
    b.box(2.0, 0.04, 1.4, e.std(SNOW), t.x + dx, y + h + 0.02, zf);
  }
  // the backdrop
  const zb = t.z - t.hz + 0.15;
  const c = e.canvas(1024, 300, (g) => {
    g.fillStyle = WALNUT;
    g.fillRect(0, 0, 1024, 300);
    for (let i = 0; i < 64; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? "#151515" : CREAM;
        g.fillRect(i * 16, j * 16, 16, 16);
        g.fillRect(i * 16, 268 + j * 16, 16, 16);
      }
    g.fillStyle = CREAM;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 80px ${SERIF}`;
    g.fillText(KART_NAME, 512, 128);
    g.fillStyle = AMBER;
    g.font = `26px ${TYPED}`;
    g.fillText("W I N N E R S   ·   S I N C E   T H E   F I R S T   S N O W", 512, 208);
  });
  const m = lit(e, "#ffffff", "#ffffff", 0.3, { map: e.tex(c), emissiveMap: e.tex(c), roughness: 0.8 });
  const bd = new T3.Mesh(e.keep(new T3.PlaneGeometry(t.hx * 2 - 0.4, 2.3)), m);
  bd.position.set(t.x, y + 2.55, zb + 0.07);
  e.root.add(bd);
  const wood = e.std(WALNUT);
  b.box(t.hx * 2 - 0.2, 2.5, 0.1, wood, t.x, y + 2.55, zb);
  for (const k of [-1, 1]) b.box(0.18, 4, 0.18, wood, t.x + k * (t.hx - 0.2), y + 2, zb);
  // a chequered flag on a pole at either end
  const chk = e.tex(
    e.canvas(64, 40, (g) => {
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 5; j++) {
          g.fillStyle = (i + j) % 2 ? "#151515" : CREAM;
          g.fillRect(i * 8, j * 8, 8, 8);
        }
    }),
  );
  const fm = e.keep(new T3.MeshStandardMaterial({ map: chk, side: T3.DoubleSide, roughness: 0.9 }));
  for (const k of [-1, 1]) {
    const px = t.x + k * (t.hx - 0.2);
    b.cyl(0.03, 0.03, 1.4, e.std(STEEL), px, y + 4.6, zb, 6);
    const f = new T3.Mesh(e.keep(new T3.PlaneGeometry(0.8, 0.5)), fm);
    f.position.set(px - k * 0.42, y + 5.0, zb);
    e.root.add(f);
  }
}

/** The cocoa cart: a green wooden cart on two wheels, its urn and mugs on the counter, a striped
 *  awning on four poles, its board to the walk (east), a string of bulbs. */
function cocoa(e: ParkEnv, b: ReturnType<typeof batch>, t: (typeof KART_THINGS)[number], y: number) {
  const { T3 } = e;
  const [w, d] = [t.hx * 2 - 0.4, t.hz * 2 - 0.2];
  const green = e.std(GREEN);
  const cream = e.std(CREAM);
  b.box(w, 0.85, d, green, t.x, y + 0.8, t.z);
  b.box(w + 0.1, 0.06, d + 0.1, e.std("#3b2414"), t.x, y + 1.25, t.z);
  for (const k of [-1, 1]) b.box(w + 0.02, 0.08, 0.04, cream, t.x, y + 1.05, t.z + k * (d / 2 + 0.01));
  for (const k of [-1, 1]) {
    b.put(
      new T3.CylinderGeometry(0.42, 0.42, 0.08, 14),
      e.std(WALNUT),
      t.x - 0.3,
      y + 0.42,
      t.z + k * (d / 2 + 0.06),
      0,
      Math.PI / 2,
    );
    b.put(
      new T3.CylinderGeometry(0.08, 0.08, 0.1, 8),
      e.std(STEEL),
      t.x - 0.3,
      y + 0.42,
      t.z + k * (d / 2 + 0.06),
      0,
      Math.PI / 2,
    );
  }
  b.box(0.08, 0.08, d, e.std(WALNUT), t.x - w / 2 - 0.5, y + 0.75, t.z);
  b.box(0.5, 0.06, 0.06, e.std(WALNUT), t.x - w / 2 - 0.25, y + 0.75, t.z - d / 2 + 0.1);
  b.box(0.5, 0.06, 0.06, e.std(WALNUT), t.x - w / 2 - 0.25, y + 0.75, t.z + d / 2 - 0.1);
  b.box(0.1, 0.45, 0.1, e.std("#6e5a44"), t.x + w / 2 - 0.2, y + 0.2, t.z);
  // the urn, the mugs
  const steel = e.std("#b9c0c6", { metalness: 0.7, roughness: 0.3 });
  b.cyl(0.2, 0.22, 0.5, steel, t.x - 0.4, y + 1.53, t.z - 0.1, 12);
  b.cyl(0.08, 0.2, 0.1, steel, t.x - 0.4, y + 1.83, t.z - 0.1, 12);
  for (const [i, c] of [RUST, CREAM, AMBER, RUST].entries())
    b.cyl(0.05, 0.045, 0.1, e.std(c), t.x + 0.25 + (i % 2) * 0.16, y + 1.33, t.z - 0.2 + Math.floor(i / 2) * 0.22, 8);
  // the awning
  for (const kx of [-1, 1])
    for (const kz of [-1, 1])
      b.cyl(0.03, 0.03, 1.2, e.std(STEEL), t.x + kx * (w / 2 - 0.05), y + 1.85, t.z + kz * (d / 2 - 0.05), 6);
  const st = e.tex(
    e.canvas(128, 32, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? CREAM : RUST;
        g.fillRect(i * 16, 0, 16, 32);
      }
    }),
  );
  const am = e.keep(new T3.MeshStandardMaterial({ map: st, roughness: 0.85 }));
  const aw = new T3.Mesh(e.keep(new T3.BoxGeometry(w + 0.4, 0.05, d + 0.4)), [am, am, am, am, am, am]);
  aw.position.set(t.x, y + 2.5, t.z);
  aw.rotation.z = -0.12;
  aw.castShadow = true;
  e.root.add(aw);
  b.box(w + 0.3, 0.06, d + 0.3, e.std(SNOW, { roughness: 0.95 }), t.x, y + 2.56, t.z, 0, 0, -0.12);
  // the board, to the walk
  const c = e.canvas(256, 96, (g) => {
    g.fillStyle = CREAM;
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = RUST;
    g.lineWidth = 6;
    g.strokeRect(5, 5, 246, 86);
    g.fillStyle = WALNUT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 40px ${SERIF}`;
    g.fillText("HOT COCOA", 128, 42);
    g.font = `20px ${TYPED}`;
    g.fillText("& marshmallows", 128, 76);
  });
  const m = lit(e, "#ffffff", "#ffffff", 0.35, { map: e.tex(c), emissiveMap: e.tex(c), roughness: 0.7 });
  const p = new T3.Mesh(e.keep(new T3.PlaneGeometry(1.5, 0.56)), m);
  p.rotation.y = Math.PI / 2;
  p.position.set(t.x + w / 2 + 0.26, y + 2.2, t.z);
  e.root.add(p);
  const bulb = lit(e, "#fff2d0", "#ffd890", 3);
  for (let i = 0; i < 6; i++)
    b.put(
      new T3.SphereGeometry(0.05, 6, 4),
      bulb,
      t.x + w / 2 + 0.15,
      y + 2.38 - Math.sin((i / 5) * Math.PI) * 0.12,
      t.z - d / 2 + (i / 5) * d,
    );
}

// ── the car park and the turning circle ─────────────────────────────────────
/** The circle's mouth, where the road in meets it (from the south): its asphalt flared out to the
 *  road's edges — no corner where the arc meets them — and fading over the road's last metres into
 *  the road's own ploughed surface; draped over the land (it falls away there: the circle's flat). */
function carMouth(e: ParkEnv) {
  const { T3 } = e;
  const T = KART_TURN;
  const RW = 4.5; // the road's half-width (shared grounds.ts "kart-road")
  const f = 3; // the flares' radius
  const fade = 11; // how far down the road the asphalt fades
  const half = RW + f;
  const zTop = T.z + Math.sqrt(T.r * T.r - half * half);
  const zEnd = T.z + T.r + fade;
  // (each flare's circle: touching the road's edge and the circle's)
  const zf = T.z + Math.sqrt((T.r + f) ** 2 - half * half);
  const PX = 16;
  const X = (x: number) => (x - (T.x - half)) * PX;
  const Z = (z: number) => (z - zTop) * PX;
  const W = 2 * half * PX;
  const H = (zEnd - zTop) * PX;
  const c = e.canvas(W, H, (g) => {
    g.fillStyle = "#4e535a";
    g.fillRect(X(T.x - RW), 0, 2 * RW * PX, H);
    // the flares: between the road's edge, the circle and each flare's curve (a quad round it,
    // the two circles taken out below)
    for (const k of [-1, 1]) {
      const cx = T.x + k * half;
      const t = T.r / (T.r + f);
      g.beginPath();
      g.moveTo(X(T.x + k * RW), Z(zf));
      g.lineTo(X(T.x + k * RW), Z(T.z + Math.sqrt(T.r * T.r - RW * RW)) - 2);
      g.lineTo(X(T.x + (cx - T.x) * t), Z(T.z + (zf - T.z) * t) - 2);
      g.lineTo(X(cx), Z(zf));
      g.closePath();
      g.fill();
    }
    // (the flares' curves, and the circle itself: the circle's own decal)
    g.globalCompositeOperation = "destination-out";
    for (const k of [-1, 1]) {
      g.beginPath();
      g.arc(X(T.x + k * half), Z(zf), f * PX, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(X(T.x), Z(T.z), (T.r - 0.02) * PX, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-atop";
    grain(g, W, H, 900, 13);
    // the fade down the road
    g.globalCompositeOperation = "destination-in";
    const gr = g.createLinearGradient(0, Z(T.z + T.r + 1), 0, H);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(0.55, "rgba(0,0,0,0.45)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  });
  const nx = Math.round(2 * half);
  const nz = Math.round(zEnd - zTop);
  const geo = e.keep(new T3.PlaneGeometry(2 * half, zEnd - zTop, nx, nz).rotateX(-Math.PI / 2));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = T.x + pos.getX(i);
    const z = (zTop + zEnd) / 2 + pos.getZ(i);
    pos.setXYZ(i, x, e.padY(x, z) + 0.1, z);
  }
  geo.computeVertexNormals();
  const m = e.keep(
    new T3.MeshStandardMaterial({
      map: e.tex(c),
      roughness: 0.92,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    }),
  );
  const mesh = new T3.Mesh(geo, m);
  mesh.name = "kart-mouth";
  mesh.receiveShadow = true;
  e.root.add(mesh);
}

export function carPark3d(e: ParkEnv) {
  const { T3 } = e;
  const C = KART_CARPARK;
  const T = KART_TURN;
  const b = batch(e);
  const x1 = T.x + T.r;
  const z0 = KART_FENCE.z1;
  const y0 = e.padY((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2);
  const [n0, n1] = [C.z0, C.aisle[0]]; // the north row
  const [s0, s1] = [C.aisle[1], C.z1]; // the south row
  const bayEnd = C.bx + C.bays * 2.7;
  const PX = 16;
  // (down to the circle's south edge, should it reach past the car park's)
  const z1 = Math.max(C.z1, T.z + T.r);
  const X = (x: number) => (x - C.x0) * PX;
  const Z = (z: number) => (z - z0) * PX;
  const W = (x1 - C.x0) * PX;
  const H = (z1 - z0) * PX;
  const c = e.canvas(W, H, (g) => {
    // the footway's pavers and the gate's (as the Grounds have them: shared grounds.ts kartApronAt)
    g.save();
    g.beginPath();
    g.rect(X(C.x0), Z(C.walk[0]), (T.x - C.x0) * PX, (C.walk[1] - C.walk[0]) * PX);
    g.rect(X(KART_GATE.x - KART_GATE.w / 2 - 1), 0, (KART_GATE.w + 2) * PX, Z(C.walk[1]));
    g.clip();
    g.fillStyle = "#bdbbb4";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(90,90,86,0.35)";
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 0.6 * PX) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let z = 0; z < H; z += 0.6 * PX) {
      g.beginPath();
      g.moveTo(0, z);
      g.lineTo(W, z);
      g.stroke();
    }
    g.restore();
    // the asphalt: the car park, the circle
    g.fillStyle = "#4e535a";
    g.fillRect(X(C.x0), Z(C.z0), (C.x1 - C.x0) * PX, (C.z1 - C.z0) * PX);
    g.beginPath();
    g.arc(X(T.x), Z(T.z), T.r * PX, 0, Math.PI * 2);
    g.fill();
    // (its mouth to the south, where the road comes in: carMouth)
    g.globalCompositeOperation = "source-atop";
    grain(g, W, H, 3200, 11);
    g.globalCompositeOperation = "source-over";
    // the bays: lines between, the two by the gate blue, a wheelchair on them
    g.fillStyle = "rgba(243,240,232,0.9)";
    for (let i = 0; i <= C.bays; i++) {
      const x = X(C.bx + i * 2.7) - 1.5;
      g.fillRect(x, Z(n0 + 0.3), 3, (n1 - n0 - 0.3) * PX);
      g.fillRect(x, Z(s0), 3, (s1 - s0 - 0.3) * PX);
    }
    for (let i = C.bays - 2; i < C.bays; i++) {
      g.fillStyle = "rgba(52,96,160,0.75)";
      g.fillRect(X(C.bx + i * 2.7) + 2, Z(n0 + 0.3), 2.7 * PX - 4, (n1 - n0 - 0.3) * PX);
      g.fillStyle = "rgba(243,240,232,0.95)";
      const cx = X(C.bx + (i + 0.5) * 2.7);
      const cz = Z((n0 + n1) / 2 + 0.6);
      g.beginPath();
      g.arc(cx, cz - 14, 4, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "rgba(243,240,232,0.95)";
      g.beginPath();
      g.arc(cx + 2, cz + 6, 10, Math.PI * 0.2, Math.PI * 1.5);
      g.moveTo(cx - 2, cz - 8);
      g.lineTo(cx - 2, cz + 2);
      g.lineTo(cx + 8, cz + 2);
      g.lineTo(cx + 12, cz + 12);
      g.stroke();
    }
    // the aisle's arrows (in from the circle, round and back) and a hatch at its far end
    g.fillStyle = "rgba(243,240,232,0.8)";
    const am = (C.aisle[0] + C.aisle[1]) / 2;
    for (let x = C.bx + 6; x < bayEnd - 4; x += 12)
      for (const [dz, dir] of [
        [-1.6, -1],
        [1.6, 1],
      ]) {
        const cx = X(x);
        const cz = Z(am + dz);
        g.beginPath();
        g.moveTo(cx + dir * 22, cz);
        g.lineTo(cx + dir * 6, cz - 9);
        g.lineTo(cx + dir * 6, cz - 3);
        g.lineTo(cx - dir * 22, cz - 3);
        g.lineTo(cx - dir * 22, cz + 3);
        g.lineTo(cx + dir * 6, cz + 3);
        g.lineTo(cx + dir * 6, cz + 9);
        g.closePath();
        g.fill();
      }
    g.strokeStyle = "rgba(232,163,61,0.7)";
    g.lineWidth = 4;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(X(C.x0 + 0.4), Z(C.aisle[0] + k * 1.4));
      g.lineTo(X(C.x0 + 2.6), Z(C.aisle[0] + k * 1.4 + 1.2));
      g.stroke();
    }
    // the give-way where the road meets the circle, dashed
    g.fillStyle = "rgba(243,240,232,0.85)";
    for (let x = T.x - 4.2; x < T.x + 4.2; x += 1) g.fillRect(X(x), Z(T.z + T.r - 0.6), 0.6 * PX, 5);
    // a ring painted round the island
    g.strokeStyle = "rgba(243,240,232,0.6)";
    g.lineWidth = 3;
    g.setLineDash([12, 10]);
    g.beginPath();
    g.arc(X(T.x), Z(T.z), (T.island + 0.6) * PX, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // the words: KART PARK on the aisle, read from the circle (east)
    g.save();
    g.translate(X(bayEnd - 3), Z(am));
    g.rotate(-Math.PI / 2);
    g.fillStyle = "rgba(243,240,232,0.75)";
    g.font = `700 ${1.1 * PX}px ${TYPED}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("PARKING", 0, 0);
    g.restore();
  });
  decal(e, c, C.x0, z0, x1, z1, 0.05, true);
  carMouth(e);

  // kerbs round it, snow on them; the islands at the rows' ends (a little spruce on the west
  // ones); a wheel stop in every bay; the plough's heaps outside the south kerb
  const kerb = e.std(CONCRETE, { roughness: 0.9 });
  const snow = e.std(SNOW, { roughness: 0.95 });
  const kerbRun = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    b.box(len, 0.16, 0.25, kerb, (ax + bx) / 2, y0 + 0.08, (az + bz) / 2, ry);
    b.box(len, 0.06, 0.3, snow, (ax + bx) / 2, y0 + 0.18, (az + bz) / 2, ry);
  };
  kerbRun(C.x0, C.z0, C.x1 - 1.8, C.z0);
  kerbRun(C.x0, C.z1, C.x1 - 1.5, C.z1);
  kerbRun(C.x0, C.z0, C.x0, C.z1);
  const island = (ax: number, az: number, bx: number, bz: number, tree: boolean) => {
    kerbRun(ax, az, bx, az);
    kerbRun(ax, bz, bx, bz);
    kerbRun(ax, az, ax, bz);
    kerbRun(bx, az, bx, bz);
    b.box(bx - ax - 0.2, 0.3, bz - az - 0.2, snow, (ax + bx) / 2, y0 + 0.15, (az + bz) / 2);
    if (tree) {
      const pine = e.std("#2b4636", { roughness: 0.9 });
      // (clear of the lamp in its middle: shared grounds.ts LAMPS)
      const tx = (ax + bx) / 2;
      const tz = (az + bz) / 2 + (az < C.aisle[0] ? -1.6 : 1.6);
      b.cyl(0.07, 0.09, 0.6, e.std("#5a3f2a"), tx, y0 + 0.5, tz, 6);
      b.put(new T3.ConeGeometry(0.85, 1.5, 7), pine, tx, y0 + 1.35, tz);
      b.put(new T3.ConeGeometry(0.6, 1.1, 7), pine, tx, y0 + 2.0, tz);
      b.put(new T3.ConeGeometry(0.5, 0.35, 7), snow, tx, y0 + 2.45, tz);
    }
  };
  island(C.x0 + 0.2, n0 + 0.2, C.bx - 0.2, n1, true);
  island(C.x0 + 0.2, s0, C.bx - 0.2, s1 - 0.2, true);
  island(bayEnd + 0.2, n0 + 0.2, bayEnd + 1.8, n1 - 0.4, false);
  island(bayEnd + 0.2, s0 + 0.4, bayEnd + 1.8, s1 - 0.2, false);
  const stop = e.std("#b9bcbe", { roughness: 0.9 });
  for (let i = 0; i < C.bays; i++) {
    const x = C.bx + (i + 0.5) * 2.7;
    b.box(1.7, 0.13, 0.22, stop, x, y0 + 0.07, n0 + 0.85);
    b.box(1.7, 0.13, 0.22, stop, x, y0 + 0.07, s1 - 0.85);
  }
  {
    let s = 5;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < 9; i++) {
      const x = C.x0 + 2 + r() * 14 + (i > 4 ? 24 : 0);
      const z = C.z1 + 1.6 + r() * 1.2;
      const hg = new T3.IcosahedronGeometry(1, 1);
      hg.scale(1.4 + r() * 1.2, 0.6 + r() * 0.5, 1 + r() * 0.5);
      b.put(hg, snow, x, e.padY(x, z) + 0.1, z, r() * 3);
    }
  }
  // the P sign at the way in from the circle
  {
    const x = bayEnd + 1;
    const z = n1 - 1.2;
    b.cyl(0.05, 0.05, 2.8, e.std(STEEL), x, y0 + 1.5, z, 8);
    const pc = e.canvas(256, 384, (g) => {
      g.fillStyle = "#2d5fa8";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "#f3f0e8";
      g.lineWidth = 10;
      g.strokeRect(10, 10, 236, 236);
      g.fillStyle = "#f3f0e8";
      g.font = `700 200px Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("P", 128, 140);
      g.fillStyle = WALNUT;
      g.fillRect(0, 266, 256, 118);
      g.fillStyle = CREAM;
      g.font = `700 38px ${SERIF}`;
      g.fillText("KART PARK", 128, 306);
      g.font = `28px ${TYPED}`;
      g.fillText("visitors", 128, 350);
    });
    const m = lit(e, "#ffffff", "#ffffff", 0.3, { map: e.tex(pc), emissiveMap: e.tex(pc), roughness: 0.6 });
    const p = new T3.Mesh(e.keep(new T3.PlaneGeometry(0.8, 1.2)), m);
    p.rotation.y = Math.PI / 2;
    p.position.set(x + 0.07, y0 + 2.4, z);
    e.root.add(p);
    b.box(0.04, 1.22, 0.82, e.std("#3a3e44"), x + 0.03, y0 + 2.4, z);
  }
  // the island in the circle: a kerb round it, snow, a walnut plinth (its kart karts3d.ts sets on
  // it), the park's flag
  {
    const y = e.padY(T.x, T.z);
    const ring = new T3.CylinderGeometry(T.island, T.island, 0.18, 40, 1, true);
    b.put(ring, kerb, T.x, y + 0.09, T.z);
    b.put(new T3.CylinderGeometry(T.island - 0.1, T.island, 0.3, 40), snow, T.x, y + 0.12, T.z);
    b.box(2.6, 0.9, 1.6, e.std(WALNUT), T.x, y + 0.5, T.z);
    b.box(2.8, 0.1, 1.8, e.std("#3b2414"), T.x, y + 0.98, T.z);
    const pl = e.canvas(256, 64, (g) => {
      g.fillStyle = "#b08a3e";
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#3b2414";
      g.font = `700 22px ${SERIF}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("KART No. 1 · THE FIRST LAP", 128, 34);
    });
    const pm = e.keep(new T3.MeshStandardMaterial({ map: e.tex(pl), roughness: 0.4, metalness: 0.5 }));
    const plaque = new T3.Mesh(e.keep(new T3.PlaneGeometry(1.4, 0.35)), pm);
    plaque.position.set(T.x, y + 0.55, T.z + 0.81);
    e.root.add(plaque);
    const px = T.x + 1.9;
    const pz = T.z - 1.2;
    b.cyl(0.04, 0.05, 5.5, e.std(STEEL), px, y + 2.85, pz, 8);
    const flag = e.canvas(128, 80, (g) => {
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 5; j++) {
          g.fillStyle = (i + j) % 2 ? "#151515" : CREAM;
          g.fillRect(i * 16, j * 16, 16, 16);
        }
    });
    const fg = e.keep(new T3.PlaneGeometry(1.5, 0.95, 8, 1));
    const pa = fg.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin((pa.getX(i) + 0.75) * 3) * 0.12);
    fg.computeVertexNormals();
    const f = new T3.Mesh(
      fg,
      e.keep(new T3.MeshStandardMaterial({ map: e.tex(flag), side: T3.DoubleSide, roughness: 0.9 })),
    );
    f.position.set(px + 0.76, y + 5.1, pz);
    e.root.add(f);
  }
  b.done();
}

// ── the billboard on the county road's corner, and the fingerpost ───────────
export function billboard3d(e: ParkEnv) {
  const { T3 } = e;
  const b = batch(e);
  const steel = e.std("#4c5258", { metalness: 0.4, roughness: 0.55 });
  const [y1, h] = [3, 3.4]; // the face's bottom over the ground, its height
  for (const w of kartSignWings()) {
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    const xm = (w.x0 + w.x1) / 2;
    const zm = (w.z0 + w.z1) / 2;
    const yg = Math.min(e.padY(w.x0, w.z0), e.padY(w.x1, w.z1));
    // (its plane's +z out to the traffic: the face's normal)
    const ry = Math.atan2(w.nx, w.nz);
    const face = e.canvas(1024, 468, (g) => billboardArt(g, w.k));
    const ft = e.tex(face);
    const fm = lit(e, "#ffffff", "#ffffff", 0.55, { map: ft, emissiveMap: ft, roughness: 0.7 });
    const p = new T3.Mesh(e.keep(new T3.PlaneGeometry(len, h)), fm);
    p.position.set(xm + w.nx * 0.09, yg + y1 + h / 2, zm + w.nz * 0.09);
    p.rotation.y = ry;
    p.castShadow = true;
    e.root.add(p);
    // the back of it: grey steel, a frame, two posts, a catwalk and the lamps over it
    b.box(len + 0.2, h + 0.2, 0.14, steel, xm, yg + y1 + h / 2, zm, ry);
    for (const t of [0.2, 0.8]) {
      const x = w.x0 + (w.x1 - w.x0) * t;
      const z = w.z0 + (w.z1 - w.z0) * t;
      const yp = e.padY(x, z);
      b.cyl(0.16, 0.2, yg + y1 + h - yp, steel, x - w.nx * 0.25, (yp + yg + y1 + h) / 2, z - w.nz * 0.25, 10);
    }
    b.box(len, 0.06, 0.8, e.std("#3a3e44", { metalness: 0.5 }), xm + w.nx * 0.45, yg + y1 - 0.1, zm + w.nz * 0.45, ry);
    const head = lit(e, "#fff2d0", "#ffe2a8", 3.5);
    for (const t of [0.25, 0.75]) {
      const x = w.x0 + (w.x1 - w.x0) * t;
      const z = w.z0 + (w.z1 - w.z0) * t;
      b.box(0.06, 0.06, 1.1, steel, x + w.nx * 0.55, yg + y1 + h + 0.25, z + w.nz * 0.55, ry);
      b.box(0.5, 0.14, 0.3, e.std("#2a2e33"), x + w.nx * 1.1, yg + y1 + h + 0.2, z + w.nz * 1.1, ry, -0.5);
      b.box(0.44, 0.02, 0.24, head, x + w.nx * 1.12, yg + y1 + h + 0.12, z + w.nz * 1.12, ry, -0.5);
    }
    // snow along its top
    b.box(len + 0.1, 0.12, 0.3, e.std(SNOW, { roughness: 0.95 }), xm, yg + y1 + h + 0.16, zm, ry);
    // at night a wash of light down its face
    if (e.night > 0.2) {
      const s = new T3.SpotLight("#ffe6c0", 60 * e.night, 9, 0.9, 0.7, 1.4);
      s.position.set(xm + w.nx * 1.6, yg + y1 + h + 0.4, zm + w.nz * 1.6);
      s.target.position.set(xm, yg + y1 + h / 2 - 0.4, zm);
      e.root.add(s, s.target);
    }
  }
  // the fingerpost on the corner: KART PARK and how far, pointing up the road in (north)
  {
    const S = KART_SIGN;
    const yp = e.padY(S.fx, S.fz);
    const wood = e.std("#6e5a44");
    b.box(0.14, 2.7, 0.14, wood, S.fx, yp + 1.35, S.fz);
    b.put(new T3.ConeGeometry(0.13, 0.2, 4), e.std(SNOW), S.fx, yp + 2.8, S.fz, Math.PI / 4);
    const road = WAYS.find((w) => w.key === "kart-road")?.line ?? [];
    let len = 0;
    for (let i = 1; i < road.length; i++) len += Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]);
    const far = `${Math.round(len / 10) * 10} m`;
    // the board: an arrow's shape, its point north (−z)
    const [bl, bh] = [1.9, 0.42];
    const shape = new T3.Shape();
    shape.moveTo(0, -bh / 2);
    shape.lineTo(bl - 0.3, -bh / 2);
    shape.lineTo(bl, 0);
    shape.lineTo(bl - 0.3, bh / 2);
    shape.lineTo(0, bh / 2);
    shape.closePath();
    const bg = e.keep(new T3.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }));
    // (the shape's +x up the road: turned so it runs north from the post)
    const brd = new T3.Mesh(bg, e.std(WALNUT));
    brd.rotation.y = Math.PI / 2;
    brd.position.set(S.fx - 0.03, yp + 2.25, S.fz + 0.25);
    brd.castShadow = true;
    e.root.add(brd);
    for (const k of [1, -1]) {
      // (east's face reads south → north left to right; west's the other way)
      const c = e.canvas(512, 112, (g) => {
        g.fillStyle = WALNUT;
        g.fillRect(0, 0, 512, 112);
        g.fillStyle = CREAM;
        g.textBaseline = "middle";
        g.textAlign = k > 0 ? "left" : "right";
        const x = k > 0 ? 18 : 494;
        g.font = `700 46px ${SERIF}`;
        g.fillText("KART PARK", x, 44);
        g.fillStyle = AMBER;
        g.font = `30px ${TYPED}`;
        g.fillText(far, x, 90);
      });
      const m = lit(e, "#ffffff", "#ffffff", 0.3, { map: e.tex(c), emissiveMap: e.tex(c), roughness: 0.7 });
      const pl = new T3.Mesh(e.keep(new T3.PlaneGeometry(bl - 0.4, bh - 0.06)), m);
      pl.rotation.y = (k * Math.PI) / 2;
      pl.position.set(S.fx + k * 0.035, yp + 2.25, S.fz + 0.25 - 0.8);
      e.root.add(pl);
    }
  }
  b.done();
}

/** A face of the billboard (1024 × 468): dusk over the snow and the pines, a kart drifting in a
 *  shower of sparks, the park's name, what's on, the arrow to the turning (`k` 1: the east
 *  face, the turning on its right; −1: the west face, on its left). */
function billboardArt(g: CanvasRenderingContext2D, k: number) {
  const [W, H] = [1024, 468];
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#1d2740");
  sky.addColorStop(0.55, "#6b3a4a");
  sky.addColorStop(0.8, "#e08a3c");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // stars, the hills under snow, the pines
  g.fillStyle = "rgba(255,244,220,0.8)";
  for (let i = 0; i < 40; i++) g.fillRect((i * 263) % W, (i * 97) % 160, 2, 2);
  g.fillStyle = "#e9e3d6";
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 32) g.lineTo(x, 330 + Math.sin(x / 140) * 22 + Math.sin(x / 47) * 6);
  g.lineTo(W, H);
  g.fill();
  g.fillStyle = "#1f3328";
  for (let i = 0; i < 18; i++) {
    const x = (i * 131 + 40) % W;
    const s = 0.6 + ((i * 37) % 10) / 14;
    const base = 336 + Math.sin(x / 140) * 22;
    g.beginPath();
    g.moveTo(x, base - 120 * s);
    g.lineTo(x - 30 * s, base);
    g.lineTo(x + 30 * s, base);
    g.fill();
  }
  // the track sweeping through: asphalt with its kerb
  g.fillStyle = "#3d4248";
  g.beginPath();
  g.moveTo(0, 430);
  g.quadraticCurveTo(520, 330, W, 400);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  for (let i = 0; i < 24; i++) {
    g.fillStyle = i % 2 ? CREAM : RUST;
    const x = i * 44;
    const y = 430 - (x / W) * 34 - Math.sin((x / W) * Math.PI) * 52;
    g.fillRect(x, y - 6, 44, 10);
  }
  // the kart: side on, drifting, the driver's helmet, its number, sparks off the back
  const kx = k > 0 ? 610 : 400;
  const ky = 360;
  g.save();
  g.translate(kx, ky);
  g.scale(k > 0 ? 1 : -1, 1);
  g.rotate(-0.06);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.beginPath();
  g.ellipse(0, 42, 150, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = RUST;
  g.beginPath();
  g.moveTo(-130, 10);
  g.lineTo(-90, -14);
  g.lineTo(60, -14);
  g.lineTo(140, 2);
  g.lineTo(150, 20);
  g.lineTo(-124, 26);
  g.closePath();
  g.fill();
  g.fillStyle = CREAM;
  g.fillRect(-60, -4, 150, 8);
  g.beginPath();
  g.arc(10, 6, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = WALNUT;
  g.font = `700 22px ${SERIF}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("1", 10, 7);
  g.fillStyle = "#1a1b1d";
  for (const [x, r] of [
    [-92, 30],
    [104, 24],
  ]) {
    g.beginPath();
    g.arc(x, 24, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#8a9096";
    g.beginPath();
    g.arc(x, 24, r * 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a1b1d";
  }
  g.fillStyle = "#2a2b2d";
  g.fillRect(-40, -46, 26, 34);
  g.fillStyle = AMBER;
  g.beginPath();
  g.arc(-24, -62, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1d2740";
  g.fillRect(-12, -70, 18, 12);
  g.fillStyle = "#151515";
  g.fillRect(-160, -26, 12, 34);
  g.fillRect(-170, -30, 34, 8);
  // sparks and speed lines behind
  for (let i = 0; i < 26; i++) {
    g.fillStyle = i % 3 ? "#ffd27a" : "#c77dff";
    const a = Math.PI + (i / 26 - 0.5) * 0.9;
    const r = 30 + ((i * 53) % 90);
    g.fillRect(-120 + Math.cos(a) * r, 34 + Math.sin(a) * r * 0.35, 5, 3);
  }
  g.strokeStyle = "rgba(243,234,214,0.6)";
  g.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(-190 - i * 30, -30 + i * 16);
    g.lineTo(-300 - i * 30, -30 + i * 16);
    g.stroke();
  }
  g.restore();
  // the words
  const tx = k > 0 ? 50 : 300;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = AMBER;
  g.font = `700 34px ${SERIF}`;
  g.fillText("Y U T O P I A", tx, 74);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.font = `700 104px ${SERIF}`;
  g.fillText("KART PARK", tx + 5, 177);
  g.fillStyle = CREAM;
  g.fillText("KART PARK", tx, 172);
  g.fillStyle = "#f6d9a8";
  g.font = `700 28px ${TYPED}`;
  g.fillText("GRAND PRIX · BATTLE BOWL · OPEN DAILY", tx + 4, 222);
  // the arrow panel, on the side the turning's on
  const ax = k > 0 ? W - 230 : 0;
  g.fillStyle = AMBER;
  g.fillRect(ax, 0, 230, H);
  g.fillStyle = WALNUT;
  g.beginPath();
  const cx = ax + 115;
  const d = k;
  g.moveTo(cx - 40 * d, 250);
  g.lineTo(cx - 40 * d, 170);
  g.quadraticCurveTo(cx - 40 * d, 130, cx, 130);
  g.lineTo(cx + 10 * d, 130);
  g.lineTo(cx + 10 * d, 96);
  g.lineTo(cx + 80 * d, 156);
  g.lineTo(cx + 10 * d, 216);
  g.lineTo(cx + 10 * d, 182);
  g.lineTo(cx, 182);
  g.quadraticCurveTo(cx + 12 * d, 182, cx + 12 * d, 194);
  g.lineTo(cx + 12 * d, 250);
  g.closePath();
  g.fill();
  g.textAlign = "center";
  g.font = `700 40px ${SERIF}`;
  g.fillText(k > 0 ? "NEXT" : "TURN", cx, 310);
  g.fillText(k > 0 ? "RIGHT" : "LEFT", cx, 356);
  g.font = `24px ${TYPED}`;
  g.fillText("parking · free", cx, 410);
  // the frame
  g.strokeStyle = WALNUT;
  g.lineWidth = 16;
  g.strokeRect(8, 8, W - 16, H - 16);
}

// ── the stands ──────────────────────────────────────────────────────────────

/** A board on the stands' front wall: its name painted on, a sponsor's colours. */
function standBoard(g: CanvasRenderingContext2D, W: number, H: number, k: number) {
  const looks = [
    { bg: GREEN, fg: CREAM, a: "YUTOPIA KART PARK", b: "SINCE THE FIRST SNOW" },
    { bg: "#1f3554", fg: "#e9edf1", a: "MOTORS", b: "MAIN STREET · YOUR CAR, YOUR BAY" },
    { bg: RUST, fg: CREAM, a: "HOT COCOA", b: "MARSHMALLOWS ON TOP · BY THE CART" },
    { bg: "#151515", fg: AMBER, a: "BEAT VORTEX", b: "THE PARK'S OWN DRIVER" },
  ];
  const l = looks[k % looks.length];
  g.fillStyle = l.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.lineWidth = 6;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = l.fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold ${Math.round(H * 0.42)}px ${SERIF}`;
  g.fillText(l.a, W / 2, H * 0.42, W * 0.9);
  g.font = `${Math.round(H * 0.15)}px ${TYPED}`;
  g.fillText(l.b, W / 2, H * 0.78, W * 0.9);
  grain(g, W, H, 400, 7 + k);
}

/** The stands (docs/plan/46-the-karts.md, "the stands"): each row a footwell and a ledge with its
 *  plank seat (a sitter's feet in the row's own footwell, at the seat's height less 0.45 —
 *  shared kartSeats), two aisles of stairs with rails, the front wall's boards, stepped side
 *  walls, the back wall with the name to the paddock, the roof on the back posts only (nobody's
 *  view through a post), its fascia, the bunting under it, lamps under it lit after dark. Its
 *  people are crowd3d.ts. */
export function stands3d(e: ParkEnv) {
  const { T3 } = e;
  const b = batch(e);
  const concrete = e.std("#b6b0a3", { roughness: 0.95 });
  const stair = e.std("#cdc7ba", { roughness: 0.95 });
  const nosing = e.std(AMBER, { roughness: 0.8 });
  const plank = e.std("#8a5a34", { roughness: 0.75 });
  const wood = e.std(WALNUT, { roughness: 0.8 });
  const green = e.std(GREEN, { roughness: 0.8 });
  const steel = e.std(STEEL, { metalness: 0.4, roughness: 0.5 });
  const snow = e.std(SNOW, { roughness: 0.95 });
  const roofM = e.std("#2a4034", { roughness: 0.85 });
  const lamp = lit(e, "#fff3dc", "#ffe7b8", 2.4);
  let board = 0;
  for (const st of KART_STANDS) {
    const L = st.x1 - st.x0;
    const cx = (st.x0 + st.x1) / 2;
    const y0 = e.padY(cx, st.z);
    const D = st.rows * 1.2;
    const half = STAND_AISLE / 2;
    const aisles = standAisles(st);
    // the seating between the aisles: [x0, x1] spans
    const cuts = [st.x0, ...aisles.flatMap((a) => [a - half, a + half]), st.x1];
    const spans: [number, number][] = [];
    for (let i = 0; i < cuts.length; i += 2) spans.push([cuts[i], cuts[i + 1]]);
    for (let r = 0; r < st.rows; r++) {
      const z0 = st.z + r * 1.2;
      const top = 0.45 * (r + 1);
      for (const [a, c] of spans) {
        const w = c - a;
        const mx = (a + c) / 2;
        // the footwell (the row before's ledge height), the ledge, its plank
        if (r > 0) b.box(w, 0.45 * r, 0.5, concrete, mx, y0 + 0.225 * r, z0 + 0.25);
        b.box(w, top - 0.06, 0.7, concrete, mx, y0 + (top - 0.06) / 2, z0 + 0.85);
        b.box(w - 0.04, 0.06, 0.46, plank, mx, y0 + top - 0.03, z0 + 0.75);
        b.box(w - 0.04, 0.12, 0.04, plank, mx, y0 + top - 0.1, z0 + 0.53);
      }
      // the aisles: two steps a row, a nosing on each
      for (const a of aisles)
        for (const [h, dz] of [
          [0.45 * r + 0.225, 0.3],
          [top, 0.9],
        ]) {
          b.box(STAND_AISLE, h, 0.6, stair, a, y0 + h / 2, z0 + dz);
          b.box(STAND_AISLE - 0.02, 0.025, 0.06, nosing, a, y0 + h + 0.012, z0 + dz - 0.27);
        }
    }
    // the aisles' rails: up their middle on posts
    for (const a of aisles) {
      const zA = st.z + 0.3;
      const zB = st.z + D - 0.3;
      const yA = y0 + 0.225 + 0.95;
      const yB = y0 + 0.45 * st.rows + 0.95;
      const len = Math.hypot(zB - zA, yB - yA);
      b.cyl(0.035, 0.035, len, steel, a, (yA + yB) / 2, (zA + zB) / 2, 8, Math.atan2(zB - zA, yB - yA));
      for (let r = 0; r < st.rows; r += 2) {
        const z = st.z + r * 1.2 + 0.3;
        const yb = y0 + 0.45 * r + 0.225;
        const yt = yA + ((z - zA) / (zB - zA)) * (yB - yA);
        b.cyl(0.03, 0.03, yt - yb, steel, a, (yt + yb) / 2, z, 6);
      }
    }
    // the front wall: boards between the aisles, a walnut cap
    for (const [a, c] of spans) {
      const w = c - a;
      const mx = (a + c) / 2;
      b.box(w, 1.0, STAND_WALL, green, mx, y0 + 0.5, st.z - 0.05 + STAND_WALL / 2);
      b.box(w + 0.04, 0.06, STAND_WALL + 0.04, wood, mx, y0 + 1.03, st.z - 0.05 + STAND_WALL / 2);
      const face = e.canvas(1024, Math.round((1024 * 0.8) / w), (g) =>
        standBoard(g, 1024, Math.round((1024 * 0.8) / w), board++),
      );
      const m = e.keep(new T3.MeshStandardMaterial({ map: e.tex(face), roughness: 0.8 }));
      const p = new T3.Mesh(e.keep(new T3.PlaneGeometry(w - 0.2, 0.8)).rotateY(Math.PI), m);
      p.position.set(mx, y0 + 0.5, st.z - 0.056);
      p.receiveShadow = true;
      e.root.add(p);
    }
    // the side walls, stepped with the rows, a rail's height over them
    for (const x of [st.x0 - 0.08, st.x1 + 0.08])
      for (let r = 0; r < st.rows; r++) {
        const h = 0.45 * (r + 1) + 1.0;
        b.box(0.16, h, 1.2, wood, x, y0 + h / 2, st.z + r * 1.2 + 0.6);
        b.box(0.22, 0.06, 1.22, steel, x, y0 + h + 0.03, st.z + r * 1.2 + 0.6);
      }
    // the back wall up to the roof, the name on it to the paddock
    const R = standRoof(st);
    b.box(L + 0.32, R.back, 0.2, wood, cx, y0 + R.back / 2, st.z + D + 0.1);
    {
      const c = e.canvas(2048, 256, (g) => {
        g.fillStyle = "#3a2a1d";
        g.fillRect(0, 0, 2048, 256);
        for (let i = 0; i < 2048; i += 64) {
          g.fillStyle = i % 128 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.04)";
          g.fillRect(i, 0, 3, 256);
        }
        g.fillStyle = CREAM;
        g.font = `bold 150px ${SERIF}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("YUTOPIA KART PARK · GRANDSTAND", 1024, 132, 1960);
      });
      const m = e.keep(new T3.MeshStandardMaterial({ map: e.tex(c), roughness: 0.85 }));
      const p = new T3.Mesh(e.keep(new T3.PlaneGeometry(L * 0.8, (L * 0.8) / 8)), m);
      p.position.set(cx, y0 + R.back - 1.2, st.z + D + 0.21);
      e.root.add(p);
    }
    // the posts behind it, the roof's (it's held over the rows from the back: nothing in the way)
    for (let i = 0; i <= 4; i++)
      b.box(0.26, R.back + 0.1, 0.26, steel, st.x0 + (L * i) / 4, y0 + (R.back + 0.1) / 2, st.z + D + 0.35);
    // the roof: a slab rising to the front, snow on it, the fascia with the name, lamps under it
    {
      const depth = R.zBack - R.zFront;
      const tilt = Math.atan2(R.front - R.back, depth);
      const zc = (R.zBack + R.zFront) / 2;
      const yc = y0 + (R.back + R.front) / 2;
      b.box(L + 0.9, 0.22, depth / Math.cos(tilt), roofM, cx, yc, zc, 0, tilt);
      b.box(L + 0.8, 0.08, depth / Math.cos(tilt) - 0.1, snow, cx, yc + 0.15, zc, 0, tilt);
      b.box(L + 0.9, 0.7, 0.14, wood, cx, y0 + R.front - 0.2, R.zFront - 0.05);
      const c = e.canvas(2048, 160, (g) => {
        g.fillStyle = WALNUT;
        g.fillRect(0, 0, 2048, 160);
        g.fillStyle = AMBER;
        g.fillRect(0, 6, 2048, 6);
        g.fillRect(0, 148, 2048, 6);
        g.fillStyle = CREAM;
        g.font = `bold 96px ${SERIF}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        for (let i = 0; i < 2; i++) g.fillText("YUTOPIA KART PARK", 512 + i * 1024, 84, 940);
      });
      const fm = e.keep(new T3.MeshStandardMaterial({ map: e.tex(c), roughness: 0.8 }));
      const fp = new T3.Mesh(e.keep(new T3.PlaneGeometry(L + 0.7, 0.58)).rotateY(Math.PI), fm);
      fp.position.set(cx, y0 + R.front - 0.2, R.zFront - 0.13);
      e.root.add(fp);
      // (the underside's height at z)
      const under = (z: number) => y0 + R.back + ((R.zBack - z) / depth) * (R.front - R.back) - 0.14;
      for (const fz of [0.3, 0.75])
        for (const fx of [0.2, 0.5, 0.8]) {
          const z = st.z + D * fz;
          b.box(L * 0.16, 0.06, 0.22, lamp, st.x0 + L * fx, under(z) - 0.05, z);
        }
      // the floods on its front edge, over the start straight
      for (const fx of [0.25, 0.75]) {
        b.box(0.7, 0.4, 0.3, steel, st.x0 + L * fx, y0 + R.front + 0.3, R.zFront + 0.2, 0, -0.5);
        b.box(0.6, 0.32, 0.04, lamp, st.x0 + L * fx, y0 + R.front + 0.28, R.zFront + 0.03, 0, -0.5);
      }
      // the bunting under the fascia, in bights between the posts' lines
      const pts: [number, number, number][][] = [];
      for (let i = 0; i < 6; i++) {
        const xa = st.x0 + (L * i) / 6;
        const xb = st.x0 + (L * (i + 1)) / 6;
        pts.push([
          [xa, y0 + R.front - 0.6, R.zFront + 0.05],
          [xb, y0 + R.front - 0.6, R.zFront + 0.05],
        ]);
      }
      bunting(e, pts, 0.35);
    }
    // (the stills: a light of their own under the roof and over the straight; the game's are
    // the Grounds' lamps — grounds3d.ts kartParkLamps)
    if (e.night > 0.2)
      for (const fx of [0.25, 0.75]) {
        const l = new T3.PointLight("#ffd9a0", 60 * e.night, 22, 1.6);
        l.position.set(st.x0 + L * fx, y0 + R.back + 0.2, st.z + D / 2);
        const s = new T3.SpotLight("#fff0d6", 110 * e.night, 45, 0.8, 0.6, 1.5);
        s.position.set(st.x0 + L * fx, y0 + R.front + 0.2, R.zFront);
        s.target.position.set(st.x0 + L * fx, y0, st.z - 15);
        e.root.add(l, s, s.target);
      }
  }
  b.done();
}
