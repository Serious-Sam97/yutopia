import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  Shape,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";
import { inkMaterial } from "./ink";
import { arc, extrude, lathe, type Prof, smoothNormals, sweepTube } from "./shapes";

// Things in the hand (docs/plan/22-people-3d.md, P4): the mug, the paper cup
// and the soda can (shared/held.ts), the phone and the flashlight, as small
// Ligne claire models — lathes and bevelled extrusions, flat colour, the same
// ink line — built standing up (+y), centred on where the fist holds them.
// And the earbud (on a call, the phone put away), centred on the ear.

export type PropKind = "mug" | "cup" | "soda" | "phone" | "torch" | "bud";

interface Built {
  root: Group;
  /** the drink's surface, raised and lowered with the level (0..1) */
  setLevel?: (level: number) => void;
  /** the phone's screen (lit) and the recording light */
  screen?: Mesh;
  rec?: Mesh;
  dispose: () => void;
}

const SEG = 20;

// The phone's screen: Vortex Mobile lit up —
// its dusk gradient, the orb, the apps. One texture for every phone.
let screenTex: Texture | null = null;
function phoneScreen(): Texture | null {
  if (screenTex || typeof document === "undefined") return screenTex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#3a0a5e");
  grad.addColorStop(0.55, "#7a1f8a");
  grad.addColorStop(1, "#ff2d95");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = "#ffb3e0";
  g.beginPath();
  g.arc(64, 82, 26, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#00e5d0";
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 82, 41, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.75)";
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.roundRect(22 + i * 31, 150 + r * 32, 22, 22, 6);
      g.fill();
    }
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.beginPath();
  g.moveTo(6, 6);
  g.lineTo(42, 6);
  g.lineTo(6, 96);
  g.fill();
  screenTex = new CanvasTexture(c);
  screenTex.colorSpace = SRGBColorSpace;
  screenTex.anisotropy = 4;
  return screenTex;
}

export function buildProp(kind: PropKind, color: string, mats: (color: string) => Material): Built {
  const root = new Group();
  const geos: { dispose: () => void }[] = [];
  const own: Material[] = [];
  const maps: Texture[] = [];
  const add = (g: Parameters<typeof smoothNormals>[0], c: string | Material, ink = true) => {
    smoothNormals(g);
    // (the line's weight: all of it outlined)
    g.setAttribute(
      "inkK",
      new Float32BufferAttribute(new Float32Array(g.getAttribute("position").count).fill(ink ? 1 : 0), 1),
    );
    geos.push(g);
    const m = typeof c === "string" ? mats(c) : c;
    const mesh = new Mesh(g, m);
    mesh.castShadow = true;
    root.add(mesh);
    if (ink) {
      const line = new Mesh(g, inkMaterial());
      line.userData.ink = true;
      root.add(line);
    }
    return mesh;
  };
  let setLevel: ((level: number) => void) | undefined;
  let screen: Mesh | undefined;
  let rec: Mesh | undefined;
  switch (kind) {
    case "mug": {
      // a straight mug with a rolled rim, a handle, coffee inside
      const r = 0.045;
      const h = 0.1;
      const prof: Prof[] = [
        [0, -h / 2],
        [r * 0.92, -h / 2],
        ...arc(r * 0.92, -h / 2 + 0.008, 0.008, -Math.PI / 2, 0, 3).slice(1),
        [r, h / 2 - 0.006],
        ...arc(r - 0.006, h / 2 - 0.006, 0.006, 0, Math.PI, 4).slice(1),
        [r * 0.82, h / 2 - 0.02],
        [0, h / 2 - 0.02],
      ];
      add(lathe(prof, SEG), color);
      // (plan 78 phase 5: tall enough for two fingers through it, as a mug's is)
      const handle = sweepTube(
        [
          new Vector3(r * 0.9, 0.036, 0),
          new Vector3(r * 1.7, 0.03, 0),
          new Vector3(r * 1.75, -0.03, 0),
          new Vector3(r * 0.9, -0.036, 0),
        ],
        () => [0.008, 0.008],
        { segs: 10, radial: 6 },
      );
      add(handle, color);
      const surface = new CircleGeometry(r * 0.8, SEG);
      surface.rotateX(-Math.PI / 2);
      const coffee = new Mesh(surface, mats("#4a2a18"));
      geos.push(surface);
      root.add(coffee);
      setLevel = (l) => {
        coffee.position.y = -h / 2 + 0.01 + (h - 0.04) * l;
        coffee.visible = l > 0.02;
      };
      break;
    }
    case "cup": {
      // a paper cup, wider at the top, with a lid
      const h = 0.11;
      add(
        lathe(
          [
            [0, -h / 2],
            [0.03, -h / 2],
            [0.042, h / 2 - 0.012],
            [0.046, h / 2 - 0.008],
            [0.046, h / 2],
            [0, h / 2],
          ],
          SEG,
        ),
        color,
      );
      add(
        lathe([...arc(0, h / 2, 0.046, 0, Math.PI / 2, 3).map(([x, y]): Prof => [x, y - 0.03])], SEG).translate(
          0,
          0.008,
          0,
        ),
        "#f4efe6",
      );
      // the sleeve
      add(
        lathe(
          [
            [0.0355, -h / 2 + 0.03],
            [0.038, -h / 2 + 0.03],
            [0.0425, h / 2 - 0.035],
            [0.04, h / 2 - 0.035],
          ],
          SEG,
        ),
        "#b5562f",
      );
      break;
    }
    case "soda": {
      // a can: a cylinder with rounded shoulders and a lid
      const r = 0.033;
      const h = 0.12;
      add(
        lathe(
          [
            [0, -h / 2],
            [r * 0.8, -h / 2],
            ...arc(r * 0.8, -h / 2 + r * 0.2, r * 0.2, -Math.PI / 2, 0, 3).slice(1),
            [r, h / 2 - r * 0.35],
            [r * 0.82, h / 2],
            [0, h / 2],
          ],
          SEG,
        ),
        color,
      );
      add(
        lathe([...arc(0, 0, r * 0.82, 0, Math.PI / 2, 3)], SEG)
          .scale(1, 0.12, 1)
          .translate(0, h / 2, 0),
        "#d8d8d0",
      );
      break;
    }
    case "phone": {
      // a slab with round corners in its case, a lit screen on the front
      const w = 0.07;
      const hgt = 0.14;
      const rr = 0.012;
      const s = new Shape();
      s.moveTo(-w / 2 + rr, -hgt / 2);
      s.lineTo(w / 2 - rr, -hgt / 2);
      s.quadraticCurveTo(w / 2, -hgt / 2, w / 2, -hgt / 2 + rr);
      s.lineTo(w / 2, hgt / 2 - rr);
      s.quadraticCurveTo(w / 2, hgt / 2, w / 2 - rr, hgt / 2);
      s.lineTo(-w / 2 + rr, hgt / 2);
      s.quadraticCurveTo(-w / 2, hgt / 2, -w / 2, hgt / 2 - rr);
      s.lineTo(-w / 2, -hgt / 2 + rr);
      s.quadraticCurveTo(-w / 2, -hgt / 2, -w / 2 + rr, -hgt / 2);
      const g = extrude(s, 0.006, 0.003, 6, 2);
      g.translate(0, 0, -0.006);
      add(g, color);
      // the screen: lit, not shaded (its own colour; the view may draw on it)
      const sc = new Shape();
      const m = 0.006;
      sc.moveTo(-w / 2 + m + rr * 0.6, -hgt / 2 + m * 1.6);
      sc.lineTo(w / 2 - m - rr * 0.6, -hgt / 2 + m * 1.6);
      sc.quadraticCurveTo(w / 2 - m, -hgt / 2 + m * 1.6, w / 2 - m, -hgt / 2 + m * 1.6 + rr * 0.6);
      sc.lineTo(w / 2 - m, hgt / 2 - m - rr * 0.6);
      sc.quadraticCurveTo(w / 2 - m, hgt / 2 - m, w / 2 - m - rr * 0.6, hgt / 2 - m);
      sc.lineTo(-w / 2 + m + rr * 0.6, hgt / 2 - m);
      sc.quadraticCurveTo(-w / 2 + m, hgt / 2 - m, -w / 2 + m, hgt / 2 - m - rr * 0.6);
      sc.lineTo(-w / 2 + m, -hgt / 2 + m * 1.6 + rr * 0.6);
      sc.quadraticCurveTo(-w / 2 + m, -hgt / 2 + m * 1.6, -w / 2 + m + rr * 0.6, -hgt / 2 + m * 1.6);
      // (the extrusion's uvs are the shape's own metres: fit the picture to the glass)
      const map = phoneScreen()?.clone() ?? null;
      if (map) {
        const sw = w - 2 * m;
        const sh = hgt - 2.6 * m;
        map.repeat.set(1 / sw, 1 / sh);
        map.offset.set(0.5, 0.5 - (0.3 * m) / sh);
        map.needsUpdate = true;
      }
      const glass = new MeshBasicMaterial(map ? { map } : { color: "#8fd8ff" });
      own.push(glass);
      if (map) maps.push(map);
      screen = add(extrude(sc, 0.0005, 0.0005, 6, 1).translate(0, 0, 0.0058), glass, false); // (just proud of the front, which is at +6 mm)
      // the recording light on its back
      const red = new MeshBasicMaterial({ color: "#ff3030" });
      own.push(red);
      rec = add(
        lathe(arc(0, 0, 0.005, -Math.PI / 2, Math.PI / 2, 3), 8).translate(w / 2 - 0.012, hgt / 2 - 0.014, -0.0075),
        red,
        false,
      );
      rec.visible = false;
      break;
    }
    case "torch": {
      // a flashlight: the tail cap and its rubber switch, a knurled grip, the body flaring into
      // the head, a chrome bezel, the reflector's bowl behind the lens and the LED in it (lit),
      // the side switch and a pocket clip. 22 cm, its lens at +y.
      const r = 0.016;
      const prof: Prof[] = [
        [0, -0.115],
        [r * 0.8, -0.115],
        ...arc(r * 0.8, -0.111, 0.004, -Math.PI / 2, 0, 3).slice(1),
        [r * 1.04, -0.104],
        [r * 0.96, -0.101],
      ];
      // the grip: six grooves cut round it
      for (let i = 0; i < 6; i++) {
        const y = -0.094 + i * 0.012;
        prof.push([r * 0.96, y - 0.002], [r * 1.05, y], [r * 1.05, y + 0.007], [r * 0.96, y + 0.009]);
      }
      prof.push([r, -0.018], [r, 0.03], [r * 1.25, 0.05], [r * 1.5, 0.068], [r * 1.6, 0.076], [0, 0.076]);
      add(lathe(prof, SEG), color);
      // the bezel, the reflector's bowl inside it
      add(
        lathe(
          [
            [r * 1.6, 0.075],
            [r * 1.72, 0.078],
            [r * 1.72, 0.097],
            ...arc(r * 1.6, 0.098, 0.002, 0, Math.PI / 2, 2).slice(1),
            [r * 1.42, 0.1],
            [r * 1.4, 0.097],
          ],
          SEG,
        ),
        "#b9bec6",
      );
      add(
        lathe(
          [
            [r * 1.4, 0.097],
            [r * 0.9, 0.092],
            [r * 0.35, 0.087],
            [0, 0.087],
          ],
          SEG,
        ),
        "#e2e4e7",
        false,
      );
      // the LED, lit; the lens over it, warm and a little see-through
      const led = new MeshBasicMaterial({ color: "#ffffff" });
      const glass = new MeshBasicMaterial({ color: "#fff1c9", transparent: true, opacity: 0.82, depthWrite: false });
      own.push(led, glass);
      add(new CircleGeometry(r * 0.32, 12).rotateX(-Math.PI / 2).translate(0, 0.0875, 0), led, false);
      add(new CircleGeometry(r * 1.42, SEG).rotateX(-Math.PI / 2).translate(0, 0.0985, 0), glass, false);
      // the tail's rubber switch; the side switch; the clip along the grip
      const rubber = "#1a1c1f";
      add(
        lathe(arc(0, -0.115, r * 0.55, -Math.PI / 2, 0, 4), SEG)
          .scale(1, 0.5, 1)
          .translate(0, -0.057, 0),
        rubber,
      );
      add(
        lathe(arc(0, 0, 0.005, 0, Math.PI / 2, 3), 10)
          .rotateX(Math.PI / 2)
          .translate(0, 0.036, r * 1.02),
        rubber,
      );
      add(new BoxGeometry(0.007, 0.07, 0.0025).translate(0, -0.06, r * 1.12), "#9aa0a8");
      break;
    }
    case "bud": {
      // an earbud: a little white bulb and its stem, down along the jaw
      add(lathe(arc(0, 0, 0.009, -Math.PI / 2, Math.PI / 2, 5), 10), color);
      add(
        sweepTube([new Vector3(0, -0.004, 0.004), new Vector3(0, -0.02, 0.008)], () => [0.003, 0.003], {
          segs: 4,
          radial: 6,
        }),
        color,
      );
      break;
    }
  }
  return {
    root,
    setLevel,
    screen,
    rec,
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of own) m.dispose();
      for (const t of maps) t.dispose();
    },
  };
}

/** (plan 78 phase 5) A life hand's own frame, in its wrist bone's space (chars/life.ts LifeLook.grip): the
 *  middle finger's knuckle from the wrist, the fingers' way along the palm, across it toward the thumb, and
 *  out of the palm. */
export interface HandFrame {
  mid: Vector3;
  along: Vector3;
  across: Vector3;
  n: Vector3;
  /** where a mug's handle sits: inside the index's and the middle finger's hooked curl */
  hook?: Vector3;
}
/** How thick a palm is, half (m): a held thing's surface this far out of the bones' line */
export const PALM_HALF = 0.013;
/** Each held thing's grip (plan 78 phase 5): how round it is where it's held (m), and the point on it the
 *  hand closes round, in its own space (a torch by its barrel, not its head). */
export const GRIP: Record<PropKind | "toy", { r: number; at: [number, number, number] }> = {
  // (by its handle: the outer bar, 8 mm round, that the fingers hook through — plan 78 phase 5)
  mug: { r: 0.008, at: [0.077, 0, 0] },
  cup: { r: 0.04, at: [0, 0, 0] },
  soda: { r: 0.033, at: [0, 0, 0] },
  phone: { r: 0.006, at: [0, 0.01, -0.003] },
  torch: { r: 0.016, at: [0, -0.055, 0] },
  bud: { r: 0.005, at: [0, 0, 0] },
  toy: { r: 0.03, at: [0, 0, 0] },
};
const gm = new Matrix4();
const gx = new Vector3();
const gy = new Vector3();
const gz = new Vector3();
const gat = new Vector3();

/** (plan 78 phase 5) Where a held thing sits in a life hand (its wrist's space): a round thing across the
 *  palm at the fingers' roots, out of the palm by its own radius (the fingers close round it); the phone
 *  across the palm too, lying on it, its screen out of it. */
export function gripPlace(kind: PropKind | "toy", hand: HandFrame, pos: Vector3, quat: Quaternion) {
  const g = GRIP[kind];
  // (the palm's own axes, square: across it toward the thumb, along it toward the fingertips, out of it)
  const across = gy.copy(hand.across).addScaledVector(hand.n, -hand.across.dot(hand.n)).normalize();
  if (kind === "mug") {
    // (hooked by its handle, as a mug's held — photos of it: the fist upright, the thumb on the handle's
    // top, the index and the middle finger curled through it pointing at the mug, its body in front of the
    // fist: the handle's bar in the fingers' crook, the hole where they curl through; its +x — the body to
    // the handle — back toward the wrist, upright along the knuckles)
    gx.copy(hand.along).addScaledVector(across, -hand.along.dot(across)).normalize().negate();
    gz.crossVectors(gx, across).normalize();
  } else if (kind === "torch") {
    // (in a thumb-forward grip — the light points where the thumb does: its barrel on the palm's slant,
    // from the little finger's heel to the index's root, its head out past the thumb)
    const al = gx.copy(hand.along).addScaledVector(across, -hand.along.dot(across)).normalize();
    gat.copy(across).multiplyScalar(Math.cos(TORCH_SLANT)).addScaledVector(al, Math.sin(TORCH_SLANT)).normalize();
    gz.copy(hand.n);
    gx.crossVectors(gat, gz).normalize();
    across.copy(gat);
  } else if (kind === "phone") {
    // (in one hand, at the ear or held up: along the palm, the hand round its middle — the fingers up its
    // back, its top (the speaker) past the fingertips, the thumb on its near long edge; its screen out of the
    // palm)
    gz.copy(hand.n);
    across.copy(hand.along).addScaledVector(gz, -hand.along.dot(gz)).normalize();
    gx.crossVectors(across, gz).normalize();
  } else {
    // (each one's length across the palm, its face out of it)
    gz.copy(hand.n);
    gx.crossVectors(across, gz).normalize();
  }
  gm.makeBasis(gx, across, gz);
  quat.setFromRotationMatrix(gm);
  gripAt(kind, hand, gat);
  pos.copy(gat).sub(gx.set(g.at[0], g.at[1], g.at[2]).applyQuaternion(quat));
}
/** (plan 78 phase 5) The torch's slant on the palm off straight across (rad) */
const TORCH_SLANT = 0.6;
/** Where in a life hand (its wrist's space) a held thing's grip point sits: the mug's handle bar in the
 *  index's and the middle finger's curl; a round thing at the fingers' roots, out by its radius; the phone
 *  toward the palm's middle */
export function gripAt(kind: PropKind | "toy", hand: HandFrame, out: Vector3): Vector3 {
  const g = GRIP[kind];
  if (kind === "mug" && hand.hook) return out.copy(hand.hook);
  if (kind === "mug")
    // (the bar in the fist's crook, between the index and the middle finger: the hole just past it, where
    // the fingers curl through)
    return out
      .copy(hand.mid)
      .addScaledVector(hand.along, 0.014)
      .addScaledVector(hand.across, 0.011)
      .addScaledVector(hand.n, PALM_HALF + 0.011);
  return out
    .copy(hand.mid)
    .multiplyScalar(kind === "phone" ? 1.15 : kind === "torch" ? 0.82 : 0.92)
    .addScaledVector(hand.n, PALM_HALF + g.r);
}

/** (plan 78 phase 5) A held thing's shape for the fingers to close on, in its own space: a round thing about
 *  its +y (radius, middle, half length), or a box (half sizes, its middle's z). */
export type HeldShape =
  | { round: true; r: number; y0: number; hy: number; x0?: number }
  | { round: false; half: [number, number, number]; cz: number }
  | { cap: [number, number, number, number, number, number]; r: number }
  | { parts: HeldShape[] };
/** (plan 78 phase 5) A pad's handles: off each end of its body (side +1 its right), angled down and back —
 *  the segment each fist closes round (its own space: x to its right, y up off its top, z ahead) */
export const PAD_HANDLE = { x: 0.06, y: -0.008, z: -0.022, dir: [0, -0.62, -0.78] as const, len: 0.065, r: 0.017 };
export const HELD_SHAPE: Record<PropKind | "toy" | "pad", HeldShape> = {
  // (its body, and the handle's bar beside it — what the fingers hook round)
  mug: {
    parts: [
      { round: true, r: 0.045, y0: 0, hy: 0.05 },
      { round: true, r: 0.009, y0: 0, hy: 0.034, x0: 0.077 },
    ],
  },
  cup: { round: true, r: 0.04, y0: 0, hy: 0.05 },
  soda: { round: true, r: 0.033, y0: 0, hy: 0.06 },
  torch: { round: true, r: 0.016, y0: -0.035, hy: 0.08 },
  bud: { round: true, r: 0.005, y0: 0, hy: 0.005 },
  toy: { round: true, r: 0.03, y0: 0, hy: 0.03 },
  phone: { round: false, half: [0.035, 0.07, 0.0075], cz: -0.0015 },
  // (a pad as a pad is: its body, and a handle off each end angled down and back — what the fists close on)
  pad: {
    parts: [
      { round: false, half: [0.07, 0.014, 0.032], cz: 0 },
      { cap: padHandle(1), r: 0.017 },
      { cap: padHandle(-1), r: 0.017 },
    ],
  },
};
function padHandle(side: 1 | -1): [number, number, number, number, number, number] {
  const H = PAD_HANDLE;
  return [side * H.x, H.y, H.z, side * H.x + H.dir[0] * H.len, H.y + H.dir[1] * H.len, H.z + H.dir[2] * H.len];
}
const hn = new Vector3();
const hs0 = new Vector3();
const hs1 = new Vector3();
function capNearest(c: readonly number[], p: Vector3, out: Vector3): Vector3 {
  hs0.set(c[0], c[1], c[2]);
  hs1.set(c[3], c[4], c[5]).sub(hs0);
  const u = Math.max(0, Math.min(1, out.copy(p).sub(hs0).dot(hs1) / hs1.lengthSq()));
  return out.copy(hs0).addScaledVector(hs1, u);
}

/** (plan 78 phase 5) A game pad as one's held (the bench's and the game's): its body, a handle off each end
 *  down and back, two sticks and the buttons on its top — its own space as HELD_SHAPE.pad's */
export function buildPad(mats: (color: string) => Material): { root: Group; dispose: () => void } {
  const root = new Group();
  const geos: { dispose: () => void }[] = [];
  const add = (g: BoxGeometry | CylinderGeometry, c: string) => {
    geos.push(g);
    const m = new Mesh(g, mats(c));
    m.castShadow = true;
    root.add(m);
    return m;
  };
  add(new BoxGeometry(0.14, 0.028, 0.064), "#2b2a28");
  const H = PAD_HANDLE;
  for (const side of [1, -1] as const) {
    const g = new CylinderGeometry(H.r, H.r * 0.9, H.len + 0.02, 12);
    const m = add(g, "#2b2a28");
    m.position.set(side * H.x + (H.dir[0] * H.len) / 2, H.y + (H.dir[1] * H.len) / 2, H.z + (H.dir[2] * H.len) / 2);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(H.dir[0], H.dir[1], H.dir[2]).normalize());
    // (the stick on its top, over the handle)
    const st = add(new CylinderGeometry(0.009, 0.009, 0.012, 10), "#4a4946");
    st.position.set(side * 0.035, 0.019, side > 0 ? -0.008 : 0.01);
  }
  for (const [x, z] of [
    [0.022, 0.012],
    [0.03, 0.004],
    [0.022, -0.004],
    [0.014, 0.004],
  ])
    add(new CylinderGeometry(0.004, 0.004, 0.006, 8), "#7d7a72").position.set(x, 0.016, z);
  return {
    root,
    dispose: () => {
      for (const g of geos) g.dispose();
    },
  };
}

/** (the shapes again, for chars/model.ts' two-handed hold) */
export const GRIP_SHAPES = HELD_SHAPE;
/** How far a point (the thing's own space) is outside its shape (m; negative inside) */
export function heldDistance(sh: HeldShape, p: Vector3): number {
  if ("parts" in sh) return Math.min(...sh.parts.map((q) => heldDistance(q, p)));
  if ("cap" in sh) return capNearest(sh.cap, p, hn).distanceTo(p) - sh.r;
  if (sh.round) {
    const qr = Math.hypot(p.x - (sh.x0 ?? 0), p.z) - sh.r;
    const qy = Math.abs(p.y - sh.y0) - sh.hy;
    return Math.hypot(Math.max(qr, 0), Math.max(qy, 0)) + Math.min(Math.max(qr, qy), 0);
  }
  const qx = Math.abs(p.x) - sh.half[0];
  const qy = Math.abs(p.y) - sh.half[1];
  const qz = Math.abs(p.z - sh.cz) - sh.half[2];
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}
/** The nearest point on its surface to `p` (both its own space), into `out` */
export function heldNearest(sh: HeldShape, p: Vector3, out: Vector3): Vector3 {
  if ("cap" in sh) {
    const c = capNearest(sh.cap, p, hn);
    const d = out.copy(p).sub(c);
    return d.lengthSq() > 1e-12 ? d.normalize().multiplyScalar(sh.r).add(c) : out.copy(c);
  }
  if ("parts" in sh) {
    // (the nearest part's)
    let best = sh.parts[0];
    for (const q of sh.parts) if (heldDistance(q, p) < heldDistance(best, p)) best = q;
    return heldNearest(best, p, out);
  }
  if (sh.round) {
    const x0 = sh.x0 ?? 0;
    const rr = Math.hypot(p.x - x0, p.z) || 1e-6;
    const y = Math.max(sh.y0 - sh.hy, Math.min(sh.y0 + sh.hy, p.y));
    return out.set(x0 + ((p.x - x0) / rr) * sh.r, y, (p.z / rr) * sh.r);
  }
  out.set(
    Math.max(-sh.half[0], Math.min(sh.half[0], p.x)),
    Math.max(-sh.half[1], Math.min(sh.half[1], p.y)),
    Math.max(sh.cz - sh.half[2], Math.min(sh.cz + sh.half[2], p.z)),
  );
  // (inside: out to the nearest face)
  if (heldDistance(sh, p) < 0) {
    const fx = sh.half[0] - Math.abs(p.x);
    const fy = sh.half[1] - Math.abs(p.y);
    const fz = sh.half[2] - Math.abs(p.z - sh.cz);
    if (fx <= fy && fx <= fz) out.x = Math.sign(p.x || 1) * sh.half[0];
    else if (fy <= fz) out.y = Math.sign(p.y || 1) * sh.half[1];
    else out.z = sh.cz + Math.sign(p.z - sh.cz || 1) * sh.half[2];
  }
  return out;
}

/** Seat a prop in the right fist (the wrist bone's space): a drink upright when the
 *  forearm is level (the hand's +z is up then), the phone along the hand resting
 *  on the thumb (the mitten's thumb reaches ~5.6 cm out along +z), its screen
 *  facing away from the hand — the face while texting, the ear on a call. (plan 78 phase 5) With a life
 *  hand's frame, in it: a round thing across the palm at the fingers' roots, out of the palm by its own
 *  radius (the fingers close round it); the phone lying along the palm, its screen out of it. */
export function inHand(root: Group, kind: PropKind | "toy", hand?: HandFrame | null) {
  if (hand) {
    gripPlace(kind, hand, root.position, root.quaternion);
    return;
  }
  if (kind === "torch") {
    // (the left fist: its head out past the fingers, along the wrist's −y, as a gun's barrel)
    root.rotation.set(Math.PI, 0, 0);
    root.position.set(0, -0.06, 0.03);
  } else if (kind === "phone") {
    root.rotation.set(0, 0, Math.PI);
    root.position.set(0, -0.07, 0.064);
  } else if (kind === "toy") {
    root.rotation.set(0, 0, 0);
    root.position.set(0, -0.08, 0.03);
  } else {
    root.rotation.set(Math.PI / 2, 0, 0);
    root.position.set(0, -0.06, 0.03);
  }
}

/** Turn a prop in its hand so its +y (a flashlight's lens) points along `dir` (world, unit). (plan 78 phase
 *  5) With a life hand's frame, round the point the hand closes on (a torch turned about its barrel in the
 *  fist, not swung out of it by its head). */
export function pointAlong(root: Object3D, dir: Vector3, frame?: HandFrame | null, kind?: PropKind) {
  const hand = root.parent;
  if (!hand) return;
  hand.updateWorldMatrix(true, false);
  hand.getWorldQuaternion(wq);
  sw.setFromUnitVectors(Y, dir);
  // the turn in the world, into the hand's space: L = W⁻¹ · S
  root.quaternion.copy(wq.invert()).multiply(sw);
  if (frame && kind) {
    // (plan 78 phase 5: in a life hand, as it's gripped — the hand aims it (PersonModel.aimHand); what's
    // left turned in the fist no more than IN_HAND, about where it's held: past that it went through the
    // fingers)
    gripPlace(kind, frame, gat, bq);
    const ang = bq.angleTo(root.quaternion);
    sw.copy(root.quaternion);
    root.quaternion.copy(bq).slerp(sw, ang > IN_HAND ? IN_HAND / ang : 1);
    const g = GRIP[kind];
    gripAt(kind, frame, gat);
    root.position.copy(gat).sub(gx.set(g.at[0], g.at[1], g.at[2]).applyQuaternion(root.quaternion));
  }
}
/** (plan 78 phase 5) How far a held thing turns in the hand to point where it should (rad) */
const IN_HAND = 0.26;
/** (…and a drink, to stand up: the fingers close again on it each frame) */
export const IN_DRINK = 0.8;
/** (plan 78 phase 5) A held thing's own +y in a life hand (its wrist's space): the way its hand aims it */
export function gripLine(kind: PropKind, frame: HandFrame, out: Vector3): Vector3 {
  gripPlace(kind, frame, gat, bq);
  return out.set(0, 1, 0).applyQuaternion(bq);
}
const Y = new Vector3(0, 1, 0);

const wq = new Quaternion();
const bq = new Quaternion();
const sw = new Quaternion();
const up = new Vector3();
const want = new Vector3();

/** A drink stays upright however the wrist turns (it would spill), tipped
 *  towards the face by `tip` (radians) while it's at the mouth. `body` is the
 *  person's root (what "up" and "the face" are to). Call after posing. */
export function keepUpright(root: Object3D, kind: PropKind, body: Object3D, tip: number, frame?: HandFrame | null) {
  const hand = root.parent;
  if (!hand || kind === "phone") return;
  inHand(root as Group, kind, frame);
  hand.updateWorldMatrix(true, false);
  hand.getWorldQuaternion(wq);
  body.getWorldQuaternion(bq);
  // its up now, and the up it should have (the top tips back, to the mouth)
  up.set(0, 1, 0).applyQuaternion(root.quaternion).applyQuaternion(wq);
  want.set(0, Math.cos(tip), -Math.sin(tip)).applyQuaternion(bq);
  sw.setFromUnitVectors(up, want);
  // the turn in the world, into the hand's space: L' = W⁻¹ · S · W · L
  // (plan 78 phase 5: in a life hand, turned about where it's held — a mug about its handle in the fingers,
  // not its body's middle, which swung the handle out of the hand)
  const g = GRIP[kind];
  const held = frame ? gat.set(g.at[0], g.at[1], g.at[2]).applyQuaternion(root.quaternion).add(root.position) : null;
  if (frame) {
    // (a life hand tips it itself — PersonModel's — so it turns in the fingers no more than IN_HAND: turned
    // further, its handle twisted out of them)
    bq.copy(root.quaternion);
    root.quaternion.premultiply(wq).premultiply(sw).premultiply(wq.invert());
    const ang = bq.angleTo(root.quaternion);
    if (ang > IN_DRINK) root.quaternion.copy(bq).slerp(sw.copy(root.quaternion), IN_DRINK / ang);
  } else root.quaternion.premultiply(wq).premultiply(sw).premultiply(wq.invert());
  if (held) root.position.copy(held).sub(gx.set(g.at[0], g.at[1], g.at[2]).applyQuaternion(root.quaternion));
}
