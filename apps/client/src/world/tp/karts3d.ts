import type { AvatarLayers } from "@yutopia/shared";
import { groundAt } from "@yutopia/shared/grounds";
import {
  KART_BOWL,
  KART_CROWD,
  KART_DESK,
  KART_FENCE,
  KART_GATE,
  KART_NAME,
  KART_PADDOCK,
  KART_RACK,
  KART_SHOW,
  KART_THINGS,
  KART_TOWER,
  KART_TURN,
  kartBridged,
  kartFloods,
  kartTrack,
  kartTrackNow,
  TRACK_W,
  type Track,
  type TrackPoint,
  trackAt,
} from "@yutopia/shared/kart";
import type * as THREE_NS from "three";
import { inkMaterial } from "../chars/ink";
import { crowd3d } from "./kart/crowd3d";
import { KartFx } from "./kart/fx";
import { crate3d, drone3d, fax3d, ice3d, snowball3d, umbrella3d } from "./kart/items3d";
import { buildKart, disposeKarts, type Kart, type KartDriver, kartDriver } from "./kart/kart3d";
import { billboard3d, carPark3d, paddock3d, stands3d } from "./kart/park3d";

// The Kart Park in 3D for the stills (docs/plan/46-the-karts.md, phase 0): the circuit (its
// asphalt, kerbs, the snow banks either side, the bridge and its ramps, the jump, the boost pads,
// the item crates, the start line), the floodlights, the stands and their crowd, the tower and
// its VFD board, the gate and its sign, the fence, the paddock with the rack and the lobby's desk,
// the bowl; the karts with their drivers in helmets, and what flies about a race (drift sparks,
// boosts, snowballs, black ice, the fax bomb, Vortex's drone, staples, a smash). Used by the
// Grounds' stills (grounds-shots.ts: a shot's `karts`).

type THREE = typeof THREE_NS;

// Marks the chunk for `pnpm budget` (the game loads it once the Grounds' scenery gets to the park).
export const KARTS_CHUNK = "yutopia-karts";
type Chars = typeof import("../chars");

export interface KartIn {
  /** on the lap: how far along it, and how far off its middle (+ its left) */
  s?: number;
  off?: number;
  /** or anywhere: where, and its heading (atan2(dz, dx)) */
  x?: number;
  z?: number;
  a?: number;
  y?: number; // over the ground (in the air)
  colour: string;
  trim?: string;
  number: number;
  driver?: AvatarLayers;
  steer?: number;
  /** turned off its line (a drift: its tail out), radians */
  yaw?: number;
  roll?: number;
  pitch?: number;
  /** the mini-turbo's sparks: 1 blue, 2 amber, 3 purple */
  sparks?: 1 | 2 | 3;
  boost?: boolean;
  spray?: number;
  /** spinning out (after a hit): stars round the head */
  dizzy?: boolean;
  umbrella?: boolean;
  /** the snowballs held, circling the kart */
  orbit?: number;
  /** skid marks behind it on the asphalt (metres) */
  skid?: number;
}
export type FxIn =
  | { kind: "snowball"; x: number; y: number; z: number; a: number; trail?: number }
  | { kind: "ice"; x: number; z: number; r: number }
  | { kind: "fax"; x: number; z: number; a: number }
  | { kind: "blast"; x: number; z: number; r: number }
  | { kind: "drone"; x: number; y: number; z: number; a: number }
  | { kind: "staples"; x: number; y: number; z: number; a: number; n: number }
  | { kind: "smash"; x: number; z: number; colour: string }
  | { kind: "boxes"; x: number; z: number; n: number; r: number };
export interface KartScene {
  karts: KartIn[];
  fx?: FxIn[];
  /** the rack: the paddock's eight karts, waiting */
  rack?: boolean;
  /** the tower's board: the order */
  order?: string[];
  /** the lap shown on the tower */
  lap?: string;
  /** false: no circuit (the game's Grounds build it on their own: grounds3d.ts) */
  circuit?: boolean;
  /** the stands' crowd: the share of seats taken (shared crowdDraw; the game's KART_CROWD) */
  crowd?: number;
  /** the gantry's start lights: how many red (6: all green) */
  gantry?: number;
  /** no crates (the game's: its crates come and go, drawn live by kart/karts.ts) */
  noCrates?: boolean;
}

interface Ctx {
  night: number;
  lit: boolean;
  /** for the drivers (none: a park with nobody in its karts, as the game's) */
  f?: InstanceType<Chars["CharFactory"]>;
  C?: Chars;
  bodyMat?: THREE_NS.Material;
  flatMat?: THREE_NS.Material;
  cam: THREE_NS.Vector3;
  /** the item art (the fire's benches are the office's): the game's, loaded with the park */
  items?: typeof import("../art/items");
}

const H = TRACK_W / 2;
/** The steps (1/60 s) the particles run before a still. */
const STEPS = 45;
/** A side of the track at p: + its left. */
const side = (p: { x: number; z: number; a: number }, off: number): [number, number] => [
  p.x + Math.sin(p.a) * off,
  p.z - Math.cos(p.a) * off,
];
const padY = (x: number, z: number) => groundAt(x, z);

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d") as CanvasRenderingContext2D);
  return c;
}

/** A strip swept along a lap: a cross-section [offset, height over the road] at each metre (null:
 *  none there), added to `root`. */
/** A sweep along `t`: a section `section(p)` a metre, joined. With `q` (the change's show: a quarter
 *  of the circuit, a plough each), its triangles in the order the ploughs get to them, and where
 *  that order is (`userData.reveal`: each phase 0..1 and the indices to it) — drawn to a phase,
 *  every quarter's drawn that far. */
function makeSweep(
  T3: THREE,
  root: THREE_NS.Object3D,
  t: Track,
  keep: <T extends { dispose(): void }>(d: T) => T,
  q = 0,
) {
  return function sweep(
    s0: number,
    s1: number,
    section: (p: TrackPoint) => [number, number][] | null,
    mat: THREE_NS.Material,
    colour?: (p: TrackPoint, j: number) => [number, number, number],
  ) {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    let prev: number[] | null = null;
    let n = 0;
    const segs: { ph: number; i: number[] }[] = [];
    for (let s = s0; s <= s1; s++) {
      const p = trackAt(t, s);
      const sec = section(p);
      if (!sec) {
        prev = null;
        continue;
      }
      const base = padY(p.x, p.z) + p.y;
      const here: number[] = [];
      for (const [j, [off, dy]] of sec.entries()) {
        const [x, z] = side(p, off);
        pos.push(x, base + dy, z);
        if (colour) col.push(...colour(p, j));
        here.push(n++);
      }
      if (prev && prev.length === here.length) {
        const tri: number[] = [];
        for (let j = 0; j < here.length - 1; j++)
          tri.push(prev[j], here[j], prev[j + 1], prev[j + 1], here[j], here[j + 1]);
        if (q) segs.push({ ph: ((((s % t.len) + t.len) % t.len) % q) / q, i: tri });
        else idx.push(...tri);
      }
      prev = here;
    }
    const reveal = { ph: [] as number[], n: [] as number[] };
    if (q) {
      segs.sort((a, b) => a.ph - b.ph);
      for (const sg of segs) {
        idx.push(...sg.i);
        reveal.ph.push(sg.ph);
        reveal.n.push(idx.length);
      }
    }
    const g = keep(new T3.BufferGeometry());
    g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
    if (colour) g.setAttribute("color", new T3.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new T3.Mesh(g, mat);
    m.receiveShadow = true;
    if (q) m.userData.reveal = reveal;
    root.add(m);
    return m;
  };
}

/** The circuit of a layout (docs/plan/47-the-track-changer.md), a part at a time (it yields
 *  between them: the game's Grounds build one a frame): its road (to the bridge's feet: the
 *  bridge is the stage's), centre line, kerbs, the start line and the grid, the snow banks, the
 *  hairpin's tyre walls, its jumps, its boost pads — into `root`. */
export function* buildCircuit(
  T3: THREE,
  t: Track,
  root: THREE_NS.Object3D,
  night: number,
  keep: <T extends { dispose(): void }>(d: T) => T,
): Generator<void, void> {
  const tex = (c: HTMLCanvasElement, srgb = true) => {
    const x = keep(new T3.CanvasTexture(c));
    if (srgb) x.colorSpace = T3.SRGBColorSpace;
    x.anisotropy = 8;
    return x;
  };
  const std = (color: string | number, o: Partial<THREE_NS.MeshStandardMaterialParameters> = {}) =>
    keep(new T3.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...o }));
  const sweep = makeSweep(T3, root, t, keep, t.len / KART_SHOW.ploughs);
  // ── the road ──
  const asphalt = std("#4b5057", {
    roughness: 0.92,
    side: T3.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  // (the lap twice over its seam: closed; up on the bridge the deck's own road)
  sweep(
    0,
    t.len,
    (p) =>
      p.y > 0.05
        ? null
        : [
            [H, 0.05],
            [0, 0.05],
            [-H, 0.05],
          ],
    asphalt,
  );
  yield;
  // the centre line, dashed
  {
    const m = std("#e6d69a", { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let s = 0; s < t.len; s += 8)
      sweep(
        s,
        s + 3,
        (p) =>
          p.y > 0.05
            ? null
            : [
                [0.08, 0.06],
                [-0.08, 0.06],
              ],
        m,
      );
  }
  yield;
  // the kerbs: rust and cream blocks on the inside of every corner (and the outside of the hairpin)
  {
    const m = keep(new T3.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }));
    const rust = new T3.Color("#b5562f");
    const cream = new T3.Color("#efe4cc");
    for (let s = 0; s < t.len; s += 1) {
      const p = trackAt(t, s);
      if (Math.abs(p.k) < 1 / 45 || p.y > 0) continue;
      const kk = -Math.sign(p.k);
      const c = Math.floor(s / 1.5) % 2 ? rust : cream;
      sweep(
        s,
        s + 1,
        () =>
          [
            [kk * H, 0.06],
            [kk * (H - 0.6), 0.12],
            [kk * (H - 1.2), 0.06],
          ].sort((a, b) => b[0] - a[0]) as [number, number][],
        m,
        () => [c.r, c.g, c.b],
      );
    }
  }
  yield;
  // the start line: chequered across, and the grid's boxes behind it
  {
    const c = canvas(512, 64, (g) => {
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? "#151515" : "#f3ead6";
          g.fillRect(i * 32, j * 32, 32, 32);
        }
    });
    const m = keep(
      new T3.MeshStandardMaterial({ map: tex(c), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -6 }),
    );
    const p = trackAt(t, 0);
    const pl = new T3.Mesh(keep(new T3.PlaneGeometry(TRACK_W, 1.6)), m);
    pl.rotation.set(-Math.PI / 2, 0, 0);
    pl.rotateOnWorldAxis(new T3.Vector3(0, 1, 0), -p.a - Math.PI / 2);
    pl.position.set(p.x, padY(p.x, p.z) + 0.07, p.z);
    root.add(pl);
    const lineMat = std("#f3ead6", { polygonOffset: true, polygonOffsetFactor: -6 });
    for (const gs of t.grid) {
      const q = new T3.Mesh(keep(new T3.PlaneGeometry(2.4, 0.12)), lineMat);
      q.rotation.set(-Math.PI / 2, 0, 0);
      q.rotateOnWorldAxis(new T3.Vector3(0, 1, 0), -gs.a + Math.PI / 2);
      const fx = gs.x + Math.cos(gs.a) * 1.3;
      const fz = gs.z + Math.sin(gs.a) * 1.3;
      // (on the road: reversed past the bridge, the last row's on its ramp's foot)
      let y = 0;
      let d = Number.POSITIVE_INFINITY;
      for (const p of t.pts) {
        const e = Math.hypot(p.x - fx, p.z - fz);
        if (e < d) {
          d = e;
          y = p.y;
        }
      }
      q.position.set(fx, padY(fx, fz) + y + 0.07, fz);
      root.add(q);
    }
  }

  yield;
  // ── the snow banks: soft walls either side (not on the raised stretch: walls there) ──
  {
    const snow = std("#f4f7fa", { roughness: 0.95 });
    for (const sgn of [1, -1])
      sweep(
        0,
        t.len,
        (p) => {
          if (p.y > 0.3) return null;
          const pts: [number, number][] = [
            [H + 0.1, 0.0],
            [H + 0.5, 0.55],
            [H + 1.1, 0.95],
            [H + 1.8, 0.75],
            [H + 2.6, -0.05],
          ];
          return pts.map(([o, y]) => [sgn * o, y] as [number, number]).sort((a, b) => sgn * (a[0] - b[0]));
        },
        snow,
      );
  }
  yield;
  // tyre walls on the hairpin's outside: stacks of three
  {
    const hp = t.pts
      .filter((p: TrackPoint) => p.y === 0 && p.s > 60)
      .reduce((a: TrackPoint, b: TrackPoint) => (Math.abs(b.k) > Math.abs(a.k) ? b : a));
    const tg = keep(new T3.TorusGeometry(0.32, 0.14, 6, 12).rotateX(Math.PI / 2));
    const tm = std("#1b1c1e", { roughness: 0.95 });
    const n = 70;
    const tyres = new T3.InstancedMesh(tg, tm, n * 3);
    const m4 = new T3.Matrix4();
    let i = 0;
    for (let j = 0; j < n; j++) {
      const p = trackAt(t, hp.s - 35 + j);
      const [x, z] = side(p, Math.sign(p.k) * (H + 3.1));
      for (let l = 0; l < 3; l++) {
        m4.makeTranslation(x, padY(x, z) + 0.14 + l * 0.27, z);
        tyres.setMatrixAt(i++, m4);
      }
    }
    tyres.castShadow = true;
    root.add(tyres);
    // a rust band painted round the top tyre every few
    const band = std("#b5562f", { roughness: 0.7 });
    for (let j = 0; j < n; j += 3) {
      const p = trackAt(t, hp.s - 35 + j);
      const [x, z] = side(p, Math.sign(p.k) * (H + 3.1));
      const b = new T3.Mesh(keep(new T3.TorusGeometry(0.33, 0.1, 6, 12).rotateX(Math.PI / 2)), band);
      b.position.set(x, padY(x, z) + 0.68, z);
      root.add(b);
    }
  }

  yield;
  // ── the jumps: a snow kicker across the road each, its lip painted ──
  for (const r of t.jumps) {
    sweep(
      r.s - r.len,
      r.s,
      (p) => {
        const u = 1 - (r.s - p.s) / r.len;
        const y = 0.05 + r.h * u * u;
        return [
          [H - 0.2, y],
          [-H + 0.2, y],
        ];
      },
      std("#f7f9fb", { roughness: 0.9, side: T3.DoubleSide }),
    );
    const p = trackAt(t, r.s);
    sweep(
      r.s,
      r.s + 0.01,
      () => [
        [H - 0.2, r.h + 0.05],
        [H - 0.2, 0.05],
      ],
      std("#f7f9fb"),
    );
    const lip = new T3.Mesh(keep(new T3.BoxGeometry(0.25, 0.08, TRACK_W - 0.4)), std("#b5562f"));
    lip.position.set(p.x, padY(p.x, p.z) + r.h + 0.06, p.z);
    lip.rotation.y = -p.a;
    root.add(lip);
    // its front face
    const face = new T3.Mesh(keep(new T3.PlaneGeometry(TRACK_W - 0.4, r.h)), std("#e3e9ee", { side: T3.DoubleSide }));
    face.position.set(p.x, padY(p.x, p.z) + r.h / 2 + 0.05, p.z);
    face.rotation.y = -p.a + Math.PI / 2;
    root.add(face);
  }

  yield;
  // ── the boost pads: amber chevrons, lit ──
  {
    const c = canvas(128, 256, (g) => {
      g.fillStyle = "#2a2018";
      g.fillRect(0, 0, 128, 256);
      g.strokeStyle = "#ffc260";
      g.lineWidth = 18;
      g.lineCap = "round";
      g.lineJoin = "round";
      // (three to the tile, drawn over its edges too: the tile repeats, scrolling)
      for (let i = -1; i < 4; i++) {
        const y = 220 - i * (256 / 3);
        g.beginPath();
        g.moveTo(16, y);
        g.lineTo(64, y - 48);
        g.lineTo(112, y);
        g.stroke();
      }
    });
    const tx = tex(c);
    tx.wrapT = T3.RepeatWrapping;
    const m = keep(
      new T3.MeshStandardMaterial({
        map: tx,
        emissiveMap: tx,
        emissive: "#ffb347",
        emissiveIntensity: 0.35 + night * 1.4,
        roughness: 0.4,
        polygonOffset: true,
        polygonOffsetFactor: -6,
      }),
    );
    for (const b of t.pads) {
      const p = trackAt(t, b.s + 2.4);
      const [x, z] = side(p, b.side * (H / 2));
      const pl = new T3.Mesh(keep(new T3.PlaneGeometry(2.6, 4.8)), m);
      pl.rotation.set(-Math.PI / 2, 0, 0);
      pl.rotateOnWorldAxis(new T3.Vector3(0, 1, 0), -p.a - Math.PI / 2);
      pl.position.set(x, padY(x, z) + 0.075, z);
      // (the chevrons running forward: ticked as they're drawn)
      pl.onBeforeRender = () => {
        tx.offset.y = -((performance.now() / 1000) * 1.6) % 1;
      };
      root.add(pl);
    }
  }
}

/** A layout's circuit built all at once (a still; the stage's). */
export function stageCircuit(T3: THREE, t: Track, night: number) {
  const root = new T3.Group();
  root.name = "kart-circuit";
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  for (const _ of buildCircuit(T3, t, root, night, keep));
  return {
    root,
    dispose() {
      for (const d of disposables) d.dispose();
      root.removeFromParent();
    },
  };
}

export function stageKarts(T3: THREE, scene: THREE_NS.Object3D, k: KartScene, ctx: Ctx) {
  const root = new T3.Group();
  scene.add(root);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const tex = (c: HTMLCanvasElement, srgb = true) => {
    const t = keep(new T3.CanvasTexture(c));
    if (srgb) t.colorSpace = T3.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const std = (color: string | number, o: Partial<THREE_NS.MeshStandardMaterialParameters> = {}) =>
    keep(new T3.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...o }));
  const night = ctx.night;
  // the circuit raced (the layout's: docs/plan/47-the-track-changer.md); the bridge is the Figure
  // Eight's, there for a layout over it (named: the game's Grounds show it, or not, with the layout)
  const t = kartTrackNow();
  const deck = kartTrack();
  const bridge = new T3.Group();
  bridge.name = "kart-bridge";
  bridge.visible = kartBridged(t.key);
  root.add(bridge);
  const sweep = makeSweep(T3, bridge, deck, keep);
  const ink = inkMaterial();
  // what lights up after dark, and how bright then (the game's Grounds3 turns them up and down)
  const glows: { m: THREE_NS.MeshStandardMaterial; on: number }[] = [];
  // the particles (the game's, tp/kart/fx.ts), run on for a moment before the still is taken:
  // what streams (sparks, flames, spray, trails) each step, what bursts (a smash) once part-way
  const fx = keep(new KartFx(root));
  const streams: ((i: number) => void)[] = [];
  const bursts: (() => void)[] = [];

  // ── the gantry over the line: two posts, a truss, the five start lights facing the grid ──
  // (named, its lamps' materials in userData: kart/karts.ts lights them with the race)
  {
    const p = trackAt(t, 0);
    const g = new T3.Group();
    g.name = "kart-gantry";
    g.position.set(p.x, padY(p.x, p.z) + p.y, p.z);
    g.rotation.y = -p.a; // (its +x along the lap, -z the lap's left)
    const steel = std("#2c3136", { metalness: 0.55, roughness: 0.45 });
    const paint = std("#b5562f", { roughness: 0.5 });
    const W = H + 1.1;
    const top = 5.6;
    for (const z of [-W, W]) {
      const post = new T3.Mesh(keep(new T3.BoxGeometry(0.42, top + 0.5, 0.42)), paint);
      post.position.set(0, (top + 0.5) / 2, z);
      post.castShadow = true;
      const foot = new T3.Mesh(keep(new T3.BoxGeometry(0.9, 0.3, 0.9)), steel);
      foot.position.set(0, 0.15, z);
      g.add(post, foot);
    }
    // the truss: two chords and the zig-zag between them
    for (const y of [top - 0.35, top + 0.35]) {
      const chord = new T3.Mesh(keep(new T3.BoxGeometry(0.16, 0.16, W * 2 + 0.4)), steel);
      chord.position.set(0, y, 0);
      g.add(chord);
    }
    const n = 14;
    for (let i = 0; i < n; i++) {
      const z = -W + ((i + 0.5) / n) * W * 2;
      const d = new T3.Mesh(keep(new T3.BoxGeometry(0.07, 0.86, 0.07)), steel);
      d.position.set(0, top, z);
      d.rotation.x = i % 2 ? 0.55 : -0.55;
      g.add(d);
    }
    // the lights' board, facing the grid (−x): five pairs of lamps under hoods
    const board = new T3.Mesh(keep(new T3.BoxGeometry(0.3, 1.25, 4.6)), std("#16181b", { roughness: 0.6 }));
    board.position.set(-0.25, top - 1.15, 0);
    g.add(board);
    const lamps: THREE_NS.MeshStandardMaterial[] = [];
    const lampGeo = keep(new T3.CircleGeometry(0.2, 18).rotateY(-Math.PI / 2));
    const hoodGeo = keep(new T3.CylinderGeometry(0.24, 0.24, 0.18, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2));
    for (let i = 0; i < 5; i++) {
      const m = keep(new T3.MeshStandardMaterial({ color: "#3a1512", emissive: "#000000", roughness: 0.25 }));
      lamps.push(m);
      for (const y of [0.28, -0.28]) {
        const l = new T3.Mesh(lampGeo, m);
        l.position.set(-0.41, top - 1.15 + y, (i - 2) * 0.88);
        const h = new T3.Mesh(hoodGeo, steel);
        h.position.set(-0.48, top - 1.15 + y, (i - 2) * 0.88);
        h.rotation.x = Math.PI / 2;
        g.add(l, h);
      }
    }
    g.userData.lamps = lamps;
    lamps.forEach((m, i) => {
      const lit = k.gantry === 6 ? "#3dff6a" : i < (k.gantry ?? 0) ? "#ff2a1a" : null;
      if (!lit) return;
      m.color.set(lit);
      m.emissive.set(lit);
      m.emissiveIntensity = 4;
    });
    // the banner on the far face: the park's name
    const bc = canvas(1024, 128, (c) => {
      c.fillStyle = "#f3ead6";
      c.fillRect(0, 0, 1024, 128);
      c.fillStyle = "#b5562f";
      c.fillRect(0, 0, 1024, 14);
      c.fillRect(0, 114, 1024, 14);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 8; j++) {
          c.fillStyle = (i + j) % 2 ? "#151515" : "#f3ead6";
          c.fillRect(i ? 1024 - 64 + (j % 2) * 32 : (j % 2) * 32, 14 + Math.floor(j / 2) * 25, 32, 25);
        }
      c.fillStyle = "#1c1a17";
      c.font = "700 70px Georgia, serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("YUTOPIA  KART  PARK", 512, 68);
    });
    const banner = new T3.Mesh(
      keep(new T3.PlaneGeometry(W * 2 - 0.6, 0.95).rotateY(Math.PI / 2)),
      std("#ffffff", { map: tex(bc), roughness: 0.8, flatShading: false }),
    );
    banner.position.set(0.12, top, 0);
    g.add(banner);
    root.add(g);
  }

  // ── the bridge: its raised stretch walled, the span over the road under it open ──
  const raised = deck.pts.filter((p) => p.y > 0.05);
  const spanOf = (p: TrackPoint) =>
    deck.pts.some(
      (q) =>
        Math.min(Math.abs(q.s - p.s), deck.len - Math.abs(q.s - p.s)) > 60 &&
        Math.hypot(q.x - p.x, q.z - p.z) < TRACK_W + 3,
    );
  const concrete = std("#cfc8b8", { roughness: 0.85 });
  const r0 = Math.min(...raised.map((p) => p.s));
  const r1 = Math.max(...raised.map((p) => p.s));
  // its road: the deck and the ramps' asphalt, its centre line (the circuit's road stops at its feet;
  // this one runs on a few metres onto it, the same asphalt: no seam of snow, either way round)
  sweep(
    r0 - 3,
    r1 + 3,
    () => [
      [H, 0.05],
      [0, 0.05],
      [-H, 0.05],
    ],
    std("#4b5057", { roughness: 0.92, side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  {
    const m = std("#e6d69a", { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let s = r0; s < r1; s += 8)
      sweep(
        s,
        Math.min(r1, s + 3),
        () => [
          [0.08, 0.06],
          [-0.08, 0.06],
        ],
        m,
      );
  }
  // the walls down to the ground (the ramps' retaining walls; under the span nothing)
  for (const sgn of [1, -1])
    sweep(
      r0,
      r1,
      (p) =>
        spanOf(p)
          ? null
          : [
              [sgn * (H + 0.35), 0.9],
              [sgn * (H + 0.35), -p.y - 0.05],
            ],
      concrete,
    );
  // the parapets
  for (const sgn of [1, -1])
    sweep(
      r0,
      r1,
      (p) =>
        p.y < 0.4
          ? null
          : ([
              [sgn * H, 0.05],
              [sgn * H, 0.9],
              [sgn * (H + 0.35), 0.9],
              [sgn * (H + 0.35), -0.2],
            ].sort((a, b) => sgn * (a[0] - b[0])) as [number, number][]),
      concrete,
    );
  // the deck's underside over the span, and its girders
  {
    const under = std("#8f8a80", { side: T3.DoubleSide });
    sweep(
      r0,
      r1,
      (p) =>
        spanOf(p)
          ? [
              [H + 0.35, -0.75],
              [-H - 0.35, -0.75],
            ]
          : null,
      under,
    );
    for (const sgn of [1, -1])
      sweep(
        r0,
        r1,
        (p) =>
          spanOf(p)
            ? [
                [sgn * (H + 0.35), -0.2],
                [sgn * (H + 0.35), -0.8],
              ]
            : null,
        concrete,
      );
    // the piers: either end of the span
    const span = raised.filter(spanOf);
    for (const p of [span[0], span[span.length - 1]]) {
      if (!p) continue;
      for (const o of [-H + 1.5, 0, H - 1.5]) {
        const [x, z] = side(p, o);
        const y0 = padY(x, z);
        const h = p.y - 0.7;
        const c = new T3.Mesh(keep(new T3.BoxGeometry(1.1, h, 1.1)), concrete);
        c.position.set(x, y0 + h / 2, z);
        c.castShadow = true;
        bridge.add(c);
      }
    }
    // the bridge's name on its side: a walnut board, cream letters
    const mid = trackAt(deck, deck.cross.over);
    const board = canvas(512, 96, (g) => {
      g.fillStyle = "#4a3324";
      g.fillRect(0, 0, 512, 96);
      g.strokeStyle = "#e8a33d";
      g.lineWidth = 6;
      g.strokeRect(6, 6, 500, 84);
      g.fillStyle = "#f3ead6";
      g.font = "700 50px Georgia, serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("THE  BRIDGE", 256, 52);
    });
    const bm = keep(new T3.MeshStandardMaterial({ map: tex(board), roughness: 0.6 }));
    for (const sgn of [1, -1]) {
      const [x, z] = side(mid, sgn * (H + 0.38));
      const pl = new T3.Mesh(keep(new T3.PlaneGeometry(4.2, 0.8)), bm);
      pl.position.set(x, padY(x, z) + mid.y - 0.45, z);
      pl.rotation.y = -mid.a + (sgn > 0 ? Math.PI : 0);
      bridge.add(pl);
    }
  }

  // ── the circuit: its road, lines, kerbs, start and grid, banks, tyre walls, jumps, pads (the
  // game's Grounds build it themselves, a step a frame, and again when the layout changes:
  // grounds3d.ts kartCircuit) ──
  if (k.circuit !== false) {
    const c = stageCircuit(T3, t, night);
    root.add(c.root);
    disposables.push(c);
  }

  // ── the item crates: amber cassette crates floating over the road ──
  const crate = (x: number, z: number, y: number, spin: number) => {
    const c = crate3d();
    c.position.set(x, y, z);
    c.rotation.set(0.35, spin, 0.4);
    root.add(c);
    // its shadow on the ground, soft
    const sh = new T3.Mesh(
      keep(new T3.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2)),
      keep(new T3.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.18, depthWrite: false })),
    );
    sh.position.set(x, padY(x, z) + 0.08, z);
    root.add(sh);
  };
  for (const [ri, s] of k.noCrates ? [] : t.boxes.entries()) {
    const p = trackAt(t, s);
    for (let i = 0; i < 4; i++) {
      const [x, z] = side(p, -H + 1.5 + i * ((TRACK_W - 3) / 3));
      crate(x, z, padY(x, z) + p.y + 0.85 + (i % 2) * 0.1, ri * 0.7 + i * 0.9);
    }
  }

  // ── the floodlights ──
  const floods = kartFloods();
  {
    const pole = std("#6d747b", { metalness: 0.5, roughness: 0.45 });
    const head = std("#2a2d31");
    const lens = keep(
      new T3.MeshStandardMaterial({
        color: "#fff4dc",
        emissive: "#fff1d0",
        emissiveIntensity: night > 0.2 ? 0.9 : 0.1,
      }),
    );
    glows.push({ m: lens, on: 1.2 });
    for (const f of floods) {
      const y0 = padY(f.x, f.z);
      const m = new T3.Mesh(keep(new T3.CylinderGeometry(0.14, 0.22, 13, 8)), pole);
      m.position.set(f.x, y0 + 6.5, f.z);
      m.castShadow = true;
      root.add(m);
      const g = new T3.Group();
      g.position.set(f.x, y0 + 13, f.z);
      g.rotation.y = -f.ry;
      for (let i = 0; i < 4; i++) {
        const b = new T3.Mesh(keep(new T3.BoxGeometry(0.4, 0.55, 0.7)), head);
        b.position.set(0.15, (i >> 1) * 0.65 - 0.3, ((i & 1) - 0.5) * 0.8);
        b.rotation.z = -0.35;
        g.add(b);
        const l = new T3.Mesh(keep(new T3.PlaneGeometry(0.62, 0.45)), lens);
        l.position.set(0.37, (i >> 1) * 0.65 - 0.35, ((i & 1) - 0.5) * 0.8);
        l.rotation.set(0, Math.PI / 2, -0.35);
        g.add(l);
      }
      root.add(g);
    }
    // at night the nearest ones lit for real, aimed at the road
    if (night > 0.2) {
      const near = [...floods].sort(
        (a, b) => Math.hypot(a.x - ctx.cam.x, a.z - ctx.cam.z) - Math.hypot(b.x - ctx.cam.x, b.z - ctx.cam.z),
      );
      for (const f of near.slice(0, 7)) {
        const y0 = padY(f.x, f.z);
        const s = new T3.SpotLight("#fff0d6", 240 * night, 80, 0.8, 0.5, 1.4);
        s.position.set(f.x, y0 + 12.8, f.z);
        s.target.position.set(f.x + Math.cos(f.ry) * 14, y0, f.z + Math.sin(f.ry) * 14);
        root.add(s, s.target);
      }
    }
  }

  // ── the tower: its VFD board shows the order ──
  {
    const x = KART_TOWER.x;
    const z = KART_TOWER.z;
    const y0 = padY(x, z);
    const steel = std("#3a3f45", { metalness: 0.4 });
    for (const dx of [-1.2, 1.2])
      for (const dz of [-0.6, 0.6]) {
        const p = new T3.Mesh(keep(new T3.BoxGeometry(0.18, 7.5, 0.18)), steel);
        p.position.set(x + dx, y0 + 3.75, z + dz);
        root.add(p);
      }
    const order = k.order ?? ["ANA", "BIA", "CAI", "DUDA", "VORTEX", "TOMÁS", "LU", "RAFA"];
    const board = canvas(512, 640, (g) => {
      g.fillStyle = "#120d08";
      g.fillRect(0, 0, 512, 640);
      g.fillStyle = "#ffb347";
      g.shadowColor = "#ff9a2a";
      g.shadowBlur = 14;
      g.font = "700 46px 'Share Tech Mono', 'Courier New', monospace";
      g.textBaseline = "middle";
      g.fillText(`LAP ${k.lap ?? "2/3"}`, 28, 48);
      g.font = "700 50px 'Share Tech Mono', 'Courier New', monospace";
      order.forEach((n, i) => {
        g.globalAlpha = i < 3 ? 1 : 0.8;
        g.fillText(`${i + 1}`, 28, 120 + i * 64);
        g.fillText(n, 92, 120 + i * 64);
      });
    });
    const bt = tex(board);
    const box = new T3.Mesh(
      keep(new T3.BoxGeometry(3.2, 4.2, 0.5)),
      keep(new T3.MeshStandardMaterial({ color: "#1d1f22", roughness: 0.6 })),
    );
    box.position.set(x, y0 + 9.4, z);
    root.add(box);
    const face = new T3.Mesh(
      keep(new T3.PlaneGeometry(2.8, 3.6)),
      keep(
        new T3.MeshStandardMaterial({
          map: bt,
          emissiveMap: bt,
          emissive: "#ffffff",
          emissiveIntensity: 1.1,
          roughness: 0.4,
        }),
      ),
    );
    face.position.set(x, y0 + 9.4, z - 0.26);
    face.rotation.y = Math.PI;
    root.add(face);
    // a walnut cap with the park's lamp on top
    const cap = new T3.Mesh(keep(new T3.BoxGeometry(3.6, 0.35, 0.9)), std("#4a3324"));
    cap.position.set(x, y0 + 11.7, z);
    root.add(cap);
  }

  // ── the gate: two chequered posts, the arch, the sign ──
  {
    const x = KART_GATE.x;
    const z = KART_GATE.z;
    const y0 = padY(x, z);
    const chk = tex(
      canvas(64, 256, (g) => {
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 8; j++) {
            g.fillStyle = (i + j) % 2 ? "#151515" : "#f3ead6";
            g.fillRect(i * 32, j * 32, 32, 32);
          }
      }),
    );
    const postM = keep(new T3.MeshStandardMaterial({ map: chk, roughness: 0.6 }));
    for (const sgn of [-1, 1]) {
      const p = new T3.Mesh(keep(new T3.BoxGeometry(0.6, 6.2, 0.6)), postM);
      p.position.set(x + (sgn * KART_GATE.w) / 2, y0 + 3.1, z);
      p.castShadow = true;
      root.add(p);
    }
    const sign = canvas(1024, 160, (g) => {
      g.fillStyle = "#4a3324";
      g.fillRect(0, 0, 1024, 160);
      g.strokeStyle = "#e8a33d";
      g.lineWidth = 8;
      g.strokeRect(10, 10, 1004, 140);
      g.fillStyle = "#f3ead6";
      g.font = "700 50px Georgia, 'Times New Roman', serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(KART_NAME.split("").join(" "), 512, 84);
    });
    const st = tex(sign);
    const face = keep(
      new T3.MeshStandardMaterial({
        map: st,
        emissiveMap: st,
        emissive: "#fff0d0",
        emissiveIntensity: night * 0.6,
        roughness: 0.6,
      }),
    );
    glows.push({ m: face, on: 0.6 });
    // (the gate's on the fence's south side, its arch across x: the sign's faces on ±z, read from
    // the road coming in and from inside)
    const beam = new T3.Mesh(keep(new T3.BoxGeometry(KART_GATE.w + 1.2, 1.6, 0.5)), [
      std("#4a3324"),
      std("#4a3324"),
      std("#4a3324"),
      std("#4a3324"),
      face,
      face,
    ]);
    beam.position.set(x, y0 + 5.6, z);
    beam.castShadow = true;
    root.add(beam);
    // lamps over the sign, lit at night
    const bulb = keep(
      new T3.MeshStandardMaterial({ color: "#fff2d0", emissive: "#ffd890", emissiveIntensity: night > 0.2 ? 4 : 0.2 }),
    );
    glows.push({ m: bulb, on: 4 });
    for (const dz of [-4, 0, 4]) {
      const l = new T3.Mesh(keep(new T3.SphereGeometry(0.16, 10, 8)), bulb);
      l.position.set(x + dz, y0 + 6.6, z + 0.5);
      root.add(l);
    }
    if (night > 0.2) {
      const s = new T3.SpotLight("#ffd9a0", 120 * night, 18, 0.9, 0.6, 1.5);
      s.position.set(x, y0 + 7, z + 2.5);
      s.target.position.set(x, y0 + 5, z);
      root.add(s, s.target);
    }
  }

  // ── the fence: posts and two rails, a gap at the gate ──
  {
    const F = KART_FENCE;
    const ring: [number, number][] = [
      [F.x0, F.z0],
      [F.x1, F.z0],
      [F.x1, F.z1],
      [F.x0, F.z1],
    ];
    const posts: [number, number][] = [];
    const rails: [number, number, number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += 3) {
        const x = ax + ((bx - ax) * s) / len;
        const z = az + ((bz - az) * s) / len;
        const x2 = ax + ((bx - ax) * Math.min(len, s + 3)) / len;
        const z2 = az + ((bz - az) * Math.min(len, s + 3)) / len;
        const gate = (px: number, pz: number) =>
          Math.abs(pz - KART_GATE.z) < 1 && Math.abs(px - KART_GATE.x) < KART_GATE.w / 2;
        if (gate(x, z) && gate(x2, z2)) continue;
        if (Math.hypot(x - ctx.cam.x, z - ctx.cam.z) > 260) continue;
        posts.push([x, z]);
        if (!gate(x2, z2) && !gate(x, z)) rails.push([x, z, x2, z2]);
      }
    }
    const pm = new T3.InstancedMesh(keep(new T3.BoxGeometry(0.14, 1.4, 0.14)), std("#6e5a44"), posts.length);
    const m4 = new T3.Matrix4();
    posts.forEach(([x, z], i) => {
      m4.makeTranslation(x, padY(x, z) + 0.7, z);
      pm.setMatrixAt(i, m4);
    });
    root.add(pm);
    const rm = new T3.InstancedMesh(keep(new T3.BoxGeometry(1, 0.1, 0.06)), std("#8a7056"), rails.length * 2);
    const q = new T3.Quaternion();
    const sc = new T3.Vector3();
    let j = 0;
    for (const [x, z, x2, z2] of rails)
      for (const h of [0.6, 1.15]) {
        q.setFromAxisAngle(new T3.Vector3(0, 1, 0), -Math.atan2(z2 - z, x2 - x));
        sc.set(Math.hypot(x2 - x, z2 - z), 1, 1);
        m4.compose(new T3.Vector3((x + x2) / 2, padY(x, z) + h, (z + z2) / 2), q, sc);
        rm.setMatrixAt(j++, m4);
      }
    root.add(rm);
  }

  // ── the paddock, the car park, the billboard on the county road (kart/park3d.ts); the lobby's desk ──
  {
    const env = { T3, root, keep, tex, std, canvas, glows, night, padY, items: ctx.items };
    paddock3d(env);
    // the stands and their crowd (kart/park3d.ts, kart/crowd3d.ts)
    stands3d(env);
    root.add(crowd3d(padY, keep, k.crowd ?? KART_CROWD));
    carPark3d(env);
    billboard3d(env);
    const P = KART_PADDOCK;
    const y0 = padY((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2) + 0.08;
    // the lobby's desk: a walnut counter, a VFD strip, a bell
    const dx = KART_DESK.x;
    const dz = KART_DESK.z;
    const desk = new T3.Mesh(keep(new T3.BoxGeometry(1.2, 1.05, 3.6)), std("#5a3a28"));
    desk.position.set(dx, y0 + 0.6, dz);
    desk.castShadow = true;
    root.add(desk);
    const top = new T3.Mesh(keep(new T3.BoxGeometry(1.4, 0.08, 3.8)), std("#3b2414"));
    top.position.set(dx, y0 + 1.14, dz);
    root.add(top);
    const vfd = tex(
      canvas(512, 96, (g) => {
        g.fillStyle = "#120d08";
        g.fillRect(0, 0, 512, 96);
        g.fillStyle = "#ffb347";
        g.shadowColor = "#ff9a2a";
        g.shadowBlur = 10;
        g.font = "700 40px 'Share Tech Mono', 'Courier New', monospace";
        g.textBaseline = "middle";
        g.fillText("NEXT: GRAND PRIX 3 LAPS", 16, 48);
      }),
    );
    const strip = new T3.Mesh(
      keep(new T3.PlaneGeometry(3.2, 0.5)),
      keep(
        new T3.MeshStandardMaterial({
          map: vfd,
          emissiveMap: vfd,
          emissive: "#ffffff",
          emissiveIntensity: 1,
          roughness: 0.4,
        }),
      ),
    );
    strip.position.set(dx + KART_DESK.face * 0.61, y0 + 0.75, dz);
    strip.rotation.y = (KART_DESK.face * Math.PI) / 2;
    // (the kart module writes the next race on it: kart/karts.ts)
    strip.name = "kart-desk-vfd";
    strip.userData = { canvas: vfd.image, tex: vfd, sig: "" };
    root.add(strip);
  }

  // ── the bowl: a flat floor walled round by banked snow, a terrace on top ──
  {
    const B = KART_BOWL;
    const y0 = padY(B.x, B.z);
    const prof: THREE_NS.Vector2[] = [];
    const R = B.r;
    const fr = B.floor;
    for (let i = 0; i <= 8; i++) {
      // the bank: a quarter-pipe from the floor's edge up to the rim
      const a = (i / 8) * (Math.PI / 2);
      prof.push(new T3.Vector2(fr + (R - fr) * Math.sin(a), B.wall * (1 - Math.cos(a))));
    }
    prof.push(new T3.Vector2(R + B.rim, B.wall), new T3.Vector2(R + B.rim + 3.5, 0));
    const wall = new T3.Mesh(
      keep(new T3.LatheGeometry(prof, 64)),
      std("#f1f5f8", { roughness: 0.92, side: T3.DoubleSide }),
    );
    wall.position.set(B.x, y0, B.z);
    wall.receiveShadow = true;
    wall.castShadow = true;
    root.add(wall);
    // the terrace's boards on the rim, a rail on its inner edge
    const deck = new T3.Mesh(keep(new T3.RingGeometry(R + 0.1, R + B.rim, 64).rotateX(-Math.PI / 2)), std("#9a7a5a"));
    deck.position.set(B.x, y0 + B.wall + 0.04, B.z);
    root.add(deck);
    const rail = new T3.Mesh(keep(new T3.TorusGeometry(R + 0.2, 0.05, 4, 80).rotateX(Math.PI / 2)), std("#b5562f"));
    rail.position.set(B.x, y0 + B.wall + 1.0, B.z);
    root.add(rail);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const p = new T3.Mesh(keep(new T3.CylinderGeometry(0.04, 0.04, 1, 4)), std("#5d646b"));
      p.position.set(B.x + Math.cos(a) * (R + 0.2), y0 + B.wall + 0.5, B.z + Math.sin(a) * (R + 0.2));
      root.add(p);
    }
    // the floor: asphalt, a ring painted at its middle, the spawns round the edge
    const floor = new T3.Mesh(
      keep(new T3.CircleGeometry(fr + 0.4, 64).rotateX(-Math.PI / 2)),
      std("#4b5057", { roughness: 0.92, side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    floor.position.set(B.x, y0 + 0.05, B.z);
    floor.receiveShadow = true;
    root.add(floor);
    const ring = new T3.Mesh(
      keep(new T3.RingGeometry(fr * 0.5 - 0.15, fr * 0.5 + 0.15, 64).rotateX(-Math.PI / 2)),
      std("#e6d69a", { polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ring.position.set(B.x, y0 + 0.06, B.z);
    root.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sp = new T3.Mesh(
        keep(new T3.RingGeometry(0.7, 0.95, 20).rotateX(-Math.PI / 2)),
        std("#b5562f", { polygonOffset: true, polygonOffsetFactor: -4 }),
      );
      sp.position.set(B.x + Math.cos(a) * fr * 0.88, y0 + 0.06, B.z + Math.sin(a) * fr * 0.88);
      root.add(sp);
    }
  }

  // ── the rack: eight karts nosed out, waiting ──
  const karts: { k: Kart; in: KartIn; driver?: KartDriver }[] = [];
  const RACK_COLS: [string, string][] = [
    ["#b5562f", "#f3ead6"],
    ["#2f4a3b", "#e8a33d"],
    ["#e8a33d", "#2a2018"],
    ["#3d4a5c", "#f3ead6"],
    ["#6b2430", "#e8a33d"],
    ["#cdbf9f", "#b5562f"],
    ["#4a5a73", "#f3ead6"],
    ["#20262c", "#e8a33d"],
  ];
  const all: KartIn[] = [...k.karts];
  // the paddock's kart up on its stand, the turning circle's on its plinth (facing the way in)
  const stand = KART_THINGS.find((t) => t.kind === "stand");
  if (stand) all.push({ x: stand.x, z: stand.z, a: Math.PI, y: 0.55, colour: "#3d4a5c", trim: "#e8a33d", number: 9 });
  all.push({ x: KART_TURN.x, z: KART_TURN.z, a: Math.PI / 2, y: 1.03, colour: "#b5562f", trim: "#f3ead6", number: 1 });
  if (k.rack)
    for (let i = 0; i < KART_RACK.n; i++)
      all.push({
        x: KART_RACK.x,
        z: KART_RACK.z0 + i * KART_RACK.dz,
        a: KART_RACK.a,
        colour: RACK_COLS[i][0],
        trim: RACK_COLS[i][1],
        number: i + 1,
      });

  for (const ki of all) {
    const kart = buildKart({ colour: ki.colour, number: ki.number, trim: ki.trim }, ink);
    let x = ki.x ?? 0;
    let z = ki.z ?? 0;
    let a = ki.a ?? 0;
    let y = 0;
    if (ki.s !== undefined) {
      const p = trackAt(t, ki.s);
      [x, z] = side(p, ki.off ?? 0);
      a = p.a;
      y = p.y;
    }
    a += ki.yaw ?? 0;
    kart.root.position.set(x, padY(x, z) + y + 0.06 + (ki.y ?? 0), z);
    kart.root.rotation.set(0, -a, 0);
    kart.body.rotation.x = ki.roll ?? 0;
    kart.body.rotation.z = -(ki.pitch ?? 0);
    kart.setSteer(ki.steer ?? 0);
    for (const w of kart.wheels) w.spin.rotation.z = (ki.number * 1.7) % 6;
    kart.lampMat.emissive.set(night > 0.2 ? "#ffd890" : "#000000");
    kart.lampMat.emissiveIntensity = night > 0.2 ? 3 : 0;
    root.add(kart.root);
    const entry: (typeof karts)[number] = { k: kart, in: ki };
    if (ki.driver)
      if (ctx.C && ctx.f && ctx.bodyMat && ctx.flatMat)
        entry.driver = kartDriver(ctx.C, ctx.f, kart, ki.driver, ki.colour, {
          body: ctx.lit ? ctx.bodyMat : ctx.flatMat,
          ink,
        });
    karts.push(entry);
    // the kart's lamp at night: a little spot ahead
    if (night > 0.2) {
      const p = kart.lamp.clone();
      kart.body.localToWorld(p);
      const s = new T3.SpotLight("#ffe6b8", 40, 26, 0.5, 0.6, 1.5);
      s.position.copy(p);
      s.target.position.set(p.x + Math.cos(a) * 10, p.y - 0.6, p.z + Math.sin(a) * 10);
      root.add(s, s.target);
    }
    effects(kart, ki, a);
  }

  // ── what karts give off ──
  function effects(kart: Kart, ki: KartIn, a: number) {
    kart.root.updateMatrixWorld(true);
    const at = (lx: number, ly: number, lz: number) => kart.body.localToWorld(new T3.Vector3(lx, ly, lz));
    const bx = -Math.cos(a);
    const bz = -Math.sin(a);
    // the drift's sparks off the rear wheels, by tier, and a light where they come off
    if (ki.sparks) {
      const tier = ki.sparks;
      const tyres = [0.66, -0.66].map((sz) => at(-0.72, 0.06, sz));
      streams.push(() => {
        for (const p of tyres) fx.sparks(p.x, p.y, p.z, bx, bz, tier, 3);
      });
      if (night > 0.2)
        for (const p of tyres) {
          const l = new T3.PointLight(["", "#7fc4ff", "#ffb040", "#c77dff"][tier], 4, 5, 2);
          l.position.set(p.x + bx * 0.1, p.y + 0.2, p.z + bz * 0.1);
          root.add(l);
        }
    }
    // the boost: a flame out of the exhaust, a little smoke
    if (ki.boost) {
      const p = at(kart.exhaust.p.x, kart.exhaust.p.y, kart.exhaust.p.z);
      streams.push((i) => {
        fx.flame(p.x, p.y, p.z, bx, bz, 1.4, 4);
        if (i % 4 === 0) fx.smoke(p.x, p.y, p.z, bx, bz, 0.8);
      });
    }
    // snow thrown up by the rear wheels
    if (ki.spray) {
      const k2 = ki.spray;
      const tyres = [0.66, -0.66].map((sz) => at(-0.75, 0.05, sz));
      streams.push(() => {
        for (const p of tyres) fx.spray(p.x, p.y, p.z, bx, bz, k2);
      });
    }
    // skid marks behind it, curving with the drift
    if (ki.skid && ki.s !== undefined) {
      const m = keep(
        new T3.MeshBasicMaterial({ color: "#121416", transparent: true, opacity: 0.35, depthWrite: false }),
      );
      for (const sz of [0.64, -0.64]) {
        const pos: number[] = [];
        for (let i = 0; i <= 24; i++) {
          const d = (i / 24) * ki.skid;
          const p = trackAt(t, ki.s - d);
          const off = (ki.off ?? 0) + sz + (ki.yaw ?? 0) * -1.2 * (1 - i / 24) * Math.sign(sz || 1);
          const [x, z] = side(p, off);
          const [x2, z2] = side(p, off + 0.2);
          const y = padY(x, z) + p.y + 0.075;
          pos.push(x, y, z, x2, y, z2);
        }
        const idx: number[] = [];
        for (let i = 0; i < 24; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
        const g = keep(new T3.BufferGeometry());
        g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        root.add(new T3.Mesh(g, m));
      }
    }
    // the snowballs held, circling it
    for (let i = 0; i < (ki.orbit ?? 0); i++) {
      const th = (i / (ki.orbit ?? 1)) * Math.PI * 2 + 0.6;
      const b = snowball3d(0.2);
      b.position.copy(at(Math.cos(th) * 1.35, 0.45, Math.sin(th) * 1.1));
      root.add(b);
    }
    // the umbrella: up over the driver, a faint dome round the kart
    if (ki.umbrella) {
      const u = umbrella3d();
      u.position.set(-0.2, 1.55, 0);
      u.rotation.z = 0.15;
      kart.root.add(u);
      const dome = new T3.Mesh(
        keep(new T3.SphereGeometry(1.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
        keep(
          new T3.MeshBasicMaterial({
            color: "#fff6dc",
            transparent: true,
            opacity: 0.1,
            depthWrite: false,
            side: T3.DoubleSide,
          }),
        ),
      );
      kart.root.add(dome);
    }
    // dizzy: little stars round the head
    if (ki.dizzy) {
      const m = keep(new T3.MeshBasicMaterial({ color: "#ffd25a", toneMapped: false }));
      for (let i = 0; i < 5; i++) {
        const th = (i / 5) * Math.PI * 2;
        const s = new T3.Mesh(keep(new T3.OctahedronGeometry(0.08)), m);
        s.position.copy(at(-0.15 + Math.cos(th) * 0.35, 1.45, Math.sin(th) * 0.35));
        root.add(s);
      }
    }
  }

  // ── the things flying about ──
  for (const f of k.fx ?? []) {
    if (f.kind === "snowball") {
      const b = snowball3d(0.26);
      b.position.set(f.x, f.y, f.z);
      root.add(b);
      // its trail: the flakes it sheds on the way (the steps run back along its line)
      const L = f.trail ?? 3;
      streams.push((i) => {
        const d = L * (1 - i / STEPS);
        fx.trail(f.x - Math.cos(f.a) * d, f.y, f.z - Math.sin(f.a) * d);
      });
      const sh = new T3.Mesh(
        keep(new T3.CircleGeometry(0.25, 12).rotateX(-Math.PI / 2)),
        keep(new T3.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.2, depthWrite: false })),
      );
      sh.position.set(f.x, padY(f.x, f.z) + 0.08, f.z);
      root.add(sh);
    } else if (f.kind === "ice") {
      const m = ice3d(f.r);
      m.position.set(f.x, padY(f.x, f.z) + 0.05, f.z);
      root.add(m);
    } else if (f.kind === "fax") {
      const g = fax3d();
      g.position.set(f.x, padY(f.x, f.z) + 0.06, f.z);
      g.rotation.y = -f.a;
      g.scale.setScalar(1.5);
      root.add(g);
    } else if (f.kind === "blast") {
      // the shockwave on the ground; the fire and the snow it throws, particles
      const y0 = padY(f.x, f.z);
      const ring = new T3.Mesh(
        keep(new T3.TorusGeometry(f.r * 0.8, 0.1, 4, 48).rotateX(Math.PI / 2)),
        keep(new T3.MeshBasicMaterial({ color: "#ffd890", transparent: true, opacity: 0.7, toneMapped: false })),
      );
      ring.position.set(f.x, y0 + 0.2, f.z);
      root.add(ring);
      bursts.push(() => fx.blast(f.x, y0 + 0.5, f.z, f.r));
    } else if (f.kind === "drone") {
      const g = drone3d();
      g.position.set(f.x, f.y, f.z);
      g.rotation.y = -f.a;
      root.add(g);
      if (night > 0.2) {
        const l = new T3.PointLight("#ffb347", 3, 6, 2);
        l.position.set(f.x, f.y, f.z);
        root.add(l);
      }
    } else if (f.kind === "staples") {
      const m = std("#d6dde3", { metalness: 0.8, roughness: 0.25 });
      for (let i = 0; i < f.n; i++) {
        const st = new T3.Mesh(keep(new T3.TorusGeometry(0.06, 0.012, 3, 8, Math.PI)), m);
        st.position.set(
          f.x + Math.cos(f.a) * i * 0.9,
          f.y + Math.sin(i * 2.1) * 0.12,
          f.z + Math.sin(f.a) * i * 0.9 + Math.cos(i * 1.7) * 0.15,
        );
        st.rotation.set(i, i * 2, 0);
        st.scale.setScalar(1.6);
        root.add(st);
      }
    } else if (f.kind === "smash") {
      // a smashed kart: a burst of snow and fire, confetti in the house colours
      const y0 = padY(f.x, f.z);
      bursts.push(() => {
        fx.blast(f.x, y0 + 0.6, f.z, 2.2);
        fx.confetti(f.x, y0 + 0.8, f.z, f.colour);
      });
    } else if (f.kind === "boxes") {
      for (let i = 0; i < f.n; i++) {
        const th = (i / f.n) * Math.PI * 2 + 0.3;
        const r = (i % 2 ? 0.55 : 0.25) * f.r;
        const x = f.x + Math.cos(th) * r;
        const z = f.z + Math.sin(th) * r;
        crate(x, z, padY(x, z) + 1.05, i);
      }
    }
  }

  // the particles run on, the bursts set off a third of a second before the still
  for (let i = 0; i < STEPS; i++) {
    for (const e of streams) e(i);
    if (i === STEPS - 20) for (const b of bursts) b();
    fx.update(1 / 60);
  }

  // (the drivers posed once they're built: kart3d.ts kartDriver)
  return {
    root,
    glows,
    ready() {
      let n = 0;
      let need = 0;
      for (const e of karts) {
        if (!e.driver) continue;
        need++;
        if (e.driver.ready()) n++;
      }
      return n === need;
    },
    pose() {
      for (const e of karts) e.driver?.pose(e.in.yaw ?? 0, e.in.dizzy);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      for (const e of karts) {
        e.k.dispose();
        e.driver?.dispose();
      }
      disposeKarts();
      root.removeFromParent();
    },
  };
}
