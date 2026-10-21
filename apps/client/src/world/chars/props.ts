import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  type Material,
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

// The phone's screen: Vortex Mobile lit up (as phone-art.ts draws it in iso) —
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
      const handle = sweepTube(
        [
          new Vector3(r * 0.9, 0.028, 0),
          new Vector3(r * 1.7, 0.02, 0),
          new Vector3(r * 1.75, -0.02, 0),
          new Vector3(r * 0.9, -0.028, 0),
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

/** Seat a prop in the right fist (the wrist bone's space): a drink upright when the
 *  forearm is level (the hand's +z is up then), the phone along the hand resting
 *  on the thumb (the mitten's thumb reaches ~5.6 cm out along +z), its screen
 *  facing away from the hand — the face while texting, the ear on a call. */
export function inHand(root: Group, kind: PropKind | "toy") {
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

/** Turn a prop in its hand so its +y (a flashlight's lens) points along `dir` (world, unit). */
export function pointAlong(root: Object3D, dir: Vector3) {
  const hand = root.parent;
  if (!hand) return;
  hand.updateWorldMatrix(true, false);
  hand.getWorldQuaternion(wq);
  sw.setFromUnitVectors(Y, dir);
  // the turn in the world, into the hand's space: L = W⁻¹ · S
  root.quaternion.copy(wq.invert()).multiply(sw);
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
export function keepUpright(root: Object3D, kind: PropKind, body: Object3D, tip: number) {
  const hand = root.parent;
  if (!hand || kind === "phone") return;
  inHand(root as Group, kind);
  hand.updateWorldMatrix(true, false);
  hand.getWorldQuaternion(wq);
  body.getWorldQuaternion(bq);
  // its up now, and the up it should have (the top tips back, to the mouth)
  up.set(0, 1, 0).applyQuaternion(root.quaternion).applyQuaternion(wq);
  want.set(0, Math.cos(tip), -Math.sin(tip)).applyQuaternion(bq);
  sw.setFromUnitVectors(up, want);
  // the turn in the world, into the hand's space: L' = W⁻¹ · S · W · L
  root.quaternion.premultiply(wq).premultiply(sw).premultiply(wq.invert());
}
