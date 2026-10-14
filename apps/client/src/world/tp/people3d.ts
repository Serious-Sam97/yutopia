import { type AvatarLayers, type HeldKind, heldState, isHeld, isSocial, SOCIAL_MS } from "@yutopia/shared";
import {
  CanvasTexture,
  CircleGeometry,
  type Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
} from "three";
import type { Motion } from "../art/avatar-motion";
import type { Aff, Face } from "../art/avatar-rig";
import type { AvatarRig } from "../art/avatar-svg";
import { HELD_BOX, heldSvg, MUG_COLORS } from "../art/held";
import type { people } from "../art/people-load";
import { svgDoc } from "../art/svgdoc";
import { viewFor } from "../art/views";
import { type VortexMood, vortexSvg } from "../art/vortex/vortexArt";
import { ZPX } from "./kit3d";

type People = NonNullable<ReturnType<typeof people>>;

// People in 3D: the same rig the iso engine poses (avatar-rig + avatar-motion)
// drawn into a canvas every frame and shown upright, turned to the camera
// around its feet — "HD-2D". The view (front, ¾, side, back…) is picked from
// the angle between where they face and where the camera stands.

// The figure board (120×180, feet at y 168) as the iso engine sizes it: the rig
// at FIT, people at 1/1.3 of the world, iso px of height → tiles.
const PERSON = 1 / 1.3;
const BX0 = -12;
const BX1 = 132;
const BY0 = -14;
const BY1 = 186;
const PX = 1.6; // canvas px per board unit
const SEAT_FWD = 0.55; // tiles: a sitter's drawing, forward from the seat's middle (feet on the floor in front)
const PULL_SIT = 0.75; // tiles towards the camera (in front of the whole seat)
const PULL_STAND = 0.2; // (in front of what they stand right against)
const RIG_PX = 2; // part images, px per board unit

// 8 facings (screen dirs, shared/iso.ts) as world angles (atan2 of the world direction)
const DIR_VEC: [number, number][] = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
];
export function dirAngle(d: number): number {
  const [x, y] = DIR_VEC[((d % 8) + 8) % 8];
  return Math.atan2(y, x);
}

// Vortex: his drawing (exactly Yondra's), one image per mood
const vortexImgs = new Map<string, HTMLImageElement | null>();
function vortexImage(mood: string): HTMLImageElement | null {
  const have = vortexImgs.get(mood);
  if (have !== undefined) return have;
  vortexImgs.set(mood, null);
  const svg = vortexSvg(mood as VortexMood, `tp${mood}`).replace("<svg ", '<svg width="240" height="225" ');
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image();
  img.src = url;
  img
    .decode()
    .then(() => vortexImgs.set(mood, img))
    .catch(() => vortexImgs.delete(mood))
    .finally(() => URL.revokeObjectURL(url));
  return null;
}

// Part images (decoded SVG), shared by everyone wearing the same thing.
const imgs = new Map<string, HTMLImageElement | null>();
function partImage(key: string, svg: string, box: [number, number, number, number]): HTMLImageElement | null {
  const have = imgs.get(key);
  if (have !== undefined) return have;
  imgs.set(key, null);
  const url = URL.createObjectURL(new Blob([svgDoc(svg, box, RIG_PX)], { type: "image/svg+xml" }));
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  img
    .decode()
    .then(() => imgs.set(key, img))
    .catch(() => imgs.delete(key))
    .finally(() => URL.revokeObjectURL(url));
  return null;
}

export interface PersonIn {
  name: string;
  avatar: AvatarLayers;
  x: number;
  y: number;
  angle: number; // facing, world radians (atan2 of the world direction)
  a: number; // 0 idle, 1 walk, 2 sit
  npc?: boolean; // Vortex
  vortexMood?: string;
  status?: string; // available / away / dnd…
  speaking?: boolean;
  emote?: string;
  held?: string; // what they carry (shared/held.ts), since heldAt (server ms)
  heldAt?: number;
  busy?: string; // using something (the arcade, the piano…)
  act?: string; // with someone (shared SOCIAL, or "take"), since actAt
  actAt?: number;
  typing?: boolean; // seated at a desk with a keyboard
  reduced?: boolean; // reduced motion
}

// What people carry, one image per kind / colour / level
function heldImage(kind: string, color: string, level: number): HTMLImageElement | null {
  return partImage(`held|${kind}|${color}|${level}`, heldSvg(kind, color, level), HELD_BOX);
}

export class Person3 {
  readonly root = new Group();
  private canvas = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private mat: MeshBasicMaterial;
  readonly plane: Mesh;
  private motion: Motion | null = null;
  private rig: AvatarRig | null = null;
  private rigKey = "";
  private shown = false;
  private last = { x: 0, y: 0 };
  private turned = 0; // drawn facing (eases towards the real one)
  private s: number; // tiles per board unit
  private ring: Mesh; // speaking
  private actKey = "";
  private actSeen = 0;

  constructor(
    readonly id: string,
    private P: People,
  ) {
    this.canvas.width = Math.ceil((BX1 - BX0) * PX);
    this.canvas.height = Math.ceil((BY1 - BY0) * PX);
    this.g = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, alphaTest: 0.45, side: DoubleSide });
    this.s = (P.FIT * PERSON) / ZPX;
    const s = this.s;
    const geo = new PlaneGeometry((BX1 - BX0) * s, (BY1 - BY0) * s);
    // feet (board 60, 168) at the origin
    geo.translate(((BX0 + BX1) / 2 - 60) * s, (168 - (BY0 + BY1) / 2) * s, 0);
    this.plane = new Mesh(geo, this.mat);
    this.plane.visible = false;
    const shadow = new Mesh(
      new CircleGeometry(0.26, 20).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0x1a100a, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    shadow.position.y = 0.004;
    shadow.name = "shadow";
    // the speaking ring: amber, pulsing round their feet (as in iso)
    this.ring = new Mesh(
      new RingGeometry(0.3, 0.36, 32).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffa630, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.ring.position.y = 0.006;
    this.ring.visible = false;
    this.root.add(this.plane, shadow, this.ring);
  }

  // `camX/camY`: where the camera stands (plan), `lean`: how far the drawing
  // tips back towards a camera looking down (0 upright … 1 facing it fully).
  // `face`: which way the drawings face (all the same way: back along the
  // camera's view, so people near the screen's edge don't skew)
  update(
    p: PersonIn,
    dt: number,
    camX: number,
    camY: number,
    camPitch: number,
    lean: number,
    tint: Color,
    night: boolean,
    face: number,
    redraw = true, // off screen / far away: keep the last drawing (saves the upload)
    cam?: { x: number; y: number; z: number }, // the camera (three axes), for the depth pull
  ) {
    const P = this.P;
    // the facing turns smoothly (others only send 8 directions)
    let d = p.angle - this.turned;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.turned += d * Math.min(1, dt * 14);
    // the view: the facing relative to the direction towards the camera
    const toCam = Math.atan2(camY - p.y, camX - p.x);
    let rel = this.turned - toCam;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const dir = (((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8) as number;
    const { view, mirror } = viewFor(dir);
    if (p.npc) return this.vortex(p, face, camPitch, lean, tint);
    const sitting = p.a === 2;
    const rim = night ? "night" : "day";
    const key = `${JSON.stringify(p.avatar)}|${view}|${sitting ? 1 : 0}|${rim}`;
    if (key !== this.rigKey) {
      this.rig = P.avatarRig(p.avatar, view, sitting, rim);
      this.rigKey = key;
    }
    const rig = this.rig as AvatarRig;
    this.motion ??= new P.Motion(hashSeed(p.name));
    let dist = Math.hypot(p.x - this.last.x, p.y - this.last.y);
    if (dist > 1.5) dist = 0;
    this.last = { x: p.x, y: p.y };
    const walking = p.a === 1;
    const held = isHeld(p.held) && p.heldAt ? { kind: p.held as HeldKind, since: Date.now() - p.heldAt } : null;
    const pose = this.motion.update(rig, dt, {
      held,
      busy: p.busy ?? "",
      act: this.actOf(p),
      dist,
      walking,
      speed: dt > 0 ? dist / dt : 0,
      typing: !!p.typing && sitting,
      speaking: !!p.speaking,
      emote: p.emote ?? "",
      reduced: !!p.reduced,
    });

    // draw the posed figure — only once every part of this view is decoded:
    // until then the last whole drawing stays (no half-drawn people mid-turn)
    const parts: { img: HTMLImageElement; box: [number, number, number, number]; name: string }[] = [];
    let all = true;
    // the mug / cup in the right hand: in front of the arm, behind the body seen from the back
    let heldImg: HTMLImageElement | null = null;
    let tip = 0;
    if (held) {
      const st = heldState(held.kind, held.since);
      const color = MUG_COLORS[Math.floor(hashSeed(p.name) * MUG_COLORS.length)];
      heldImg = heldImage(held.kind, color, Math.round(st.level * 4));
      if (!heldImg) all = false;
      tip = ((rig.side ? -38 : -22) * P.sipEnv(st.sip) * Math.PI) / 180;
    }
    for (const part of P.drawOrder(rig, pose)) {
      const head = part.name === "head";
      const look: Face | undefined = head ? (rig.back ? "open" : pose.face) : undefined;
      const svg = head ? rig.heads[look as Face] : part.svg;
      if (!svg) continue;
      const img = partImage(`${rig.id}|${part.name}|${look ?? ""}`, svg, part.box);
      if (img) parts.push({ img, box: part.box, name: part.name });
      else all = false;
    }
    if (all && (redraw || !this.shown)) {
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const sx = (mirror ? -1 : 1) * rig.squash;
      // board → canvas, mirrored / squashed about the board's middle (x 60)
      const base: Aff = [sx * PX, 0, 0, PX, (60 - 60 * sx - BX0) * PX, -BY0 * PX];
      const b = P.bones(rig, pose);
      const drawHeld = () => {
        if (!heldImg) return;
        const hand = P.apply(b.armRf, rig.joints.hand);
        const c = Math.cos(tip);
        const sn = Math.sin(tip);
        const m = P.mul(base, [c, sn, -sn, c, hand[0], hand[1]]);
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        g.drawImage(heldImg, HELD_BOX[0], HELD_BOX[1], HELD_BOX[2], HELD_BOX[3]);
      };
      for (const part of parts) {
        if (rig.back && part.name === "torso") drawHeld();
        const m = P.mul(base, b[part.name as keyof typeof b]);
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        g.drawImage(part.img, part.box[0], part.box[1], part.box[2], part.box[3]);
        if (!rig.back && part.name === "armRf") drawHeld();
      }
      this.shown = true;
      this.tex.needsUpdate = true;
    }
    this.plane.visible = this.shown;

    // place: feet on the floor (seated: as the iso engine lowers them onto the seat)
    // seated: the drawing sits at the seat's front edge, where they face (a flat
    // drawing in the middle of a seat would vanish behind its cushions and
    // back), feet on the floor, leaning back less
    this.root.position.set(p.x, 0, p.y);
    if (sitting) {
      this.plane.position.x = Math.cos(p.angle) * SEAT_FWD;
      this.plane.position.z = Math.sin(p.angle) * SEAT_FWD;
    } else this.plane.position.x = this.plane.position.z = 0;
    this.plane.position.y = -(2 * PERSON) / ZPX;
    this.plane.rotation.set(0, 0, 0);
    this.plane.rotation.order = "YXZ";
    this.plane.rotation.y = -face + Math.PI / 2;
    this.plane.rotation.x = -camPitch * lean * (sitting ? 0.35 : 1);
    // Pulled towards the camera along the line of sight and shrunk by the same
    // ratio: exactly the same on screen, but in front of the seat it sits on
    // (and of a desk edge it stands against). What's really between you and
    // them — more than the pull nearer — still covers them.
    this.plane.scale.setScalar(1);
    if (cam) {
      const pull = sitting ? PULL_SIT : PULL_STAND;
      const wx = p.x + this.plane.position.x;
      const wy = this.plane.position.y + 0.8;
      const wz = p.y + this.plane.position.z;
      const d = Math.hypot(wx - cam.x, wy - cam.y, wz - cam.z);
      if (d > pull * 2) {
        const k = (d - pull) / d;
        const px = p.x + this.plane.position.x;
        const pz = p.y + this.plane.position.z;
        const py = this.plane.position.y;
        this.plane.position.set(
          cam.x + (px - cam.x) * k - p.x,
          cam.y + (py - cam.y) * k,
          cam.z + (pz - cam.z) * k - p.y,
        );
        this.plane.scale.setScalar(k);
      }
    }
    (this.root.getObjectByName("shadow") as Mesh).visible = !sitting && this.shown;
    this.mat.color.copy(tint);
    // away: faded, like iso
    const away = p.status === "away";
    if (this.mat.transparent !== away) {
      this.mat.transparent = away;
      this.mat.opacity = away ? 0.55 : 1;
      this.mat.needsUpdate = true;
    }
    // speaking: the amber ring pulses
    this.ring.visible = !!p.speaking && this.shown;
    if (this.ring.visible)
      (this.ring.material as MeshBasicMaterial).opacity = p.reduced
        ? 0.7
        : 0.55 + Math.sin(performance.now() / 83) * 0.25;
  }

  // A move with someone (shared SOCIAL): what, and how far into it.
  private actOf(p: PersonIn): { what: string; t: number; len: number } | null {
    if (!p.act) {
      this.actKey = "";
      return null;
    }
    const key = `${p.act}|${p.actAt}`;
    if (this.actKey !== key) {
      this.actKey = key;
      this.actSeen = performance.now();
    }
    const kind = p.act === "take" ? "give" : p.act;
    const len = (isSocial(kind) ? SOCIAL_MS[kind] : 1500) / 1000;
    return { what: p.act, t: (performance.now() - this.actSeen) / 1000, len };
  }

  // Vortex floats: his drawing, bobbing, turned to the camera
  private vortexMood = "";
  private vortex(p: PersonIn, face: number, camPitch: number, lean: number, tint: Color) {
    const mood = p.vortexMood || "smug";
    const img = vortexImage(mood);
    if (img && mood !== this.vortexMood) {
      this.vortexMood = mood;
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // his 240×225 drawing, 120 board units wide, standing on the feet line
      g.setTransform(PX, 0, 0, PX, -BX0 * PX, -BY0 * PX);
      g.drawImage(img, 0, 168 - 112.5, 120, 112.5);
      this.tex.needsUpdate = true;
      this.shown = true;
    }
    this.plane.visible = this.shown;
    this.root.position.set(p.x, 0, p.y);
    this.plane.position.y = 0.12 + Math.sin(performance.now() / 420) * 0.05;
    this.plane.rotation.order = "YXZ";
    this.plane.rotation.set(-camPitch * lean, -face + Math.PI / 2, 0);
    (this.root.getObjectByName("shadow") as Mesh).visible = this.shown;
    this.mat.color.copy(tint);
  }

  // Is the drawing there (not its transparent margin) at a point of its plane?
  opaqueAt(u: number, v: number): boolean {
    const x = Math.floor(u * this.canvas.width);
    const y = Math.floor((1 - v) * this.canvas.height);
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return false;
    return this.g.getImageData(x, y, 1, 1).data[3] > 60;
  }

  dispose() {
    this.tex.dispose();
    this.mat.dispose();
    this.plane.geometry.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    const sh = this.root.getObjectByName("shadow") as Mesh;
    sh.geometry.dispose();
    (sh.material as MeshBasicMaterial).dispose();
  }
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
