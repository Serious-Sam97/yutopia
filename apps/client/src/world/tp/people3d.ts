import {
  type AvatarLayers,
  type HeldKind,
  heldState,
  isHeld,
  isSocial,
  type JumpNow,
  SOCIAL_MS,
} from "@yutopia/shared";
import type { FlowLook } from "@yutopia/shared/move";
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
import { PHONE_BOX, phoneColors, phoneSvg } from "../art/phone-art";
import { svgDoc } from "../art/svgdoc";
import { viewFor } from "../art/views";
import { type VortexMood, vortexSvg } from "../art/vortex/vortexArt";
import type { PetView } from "../petview";
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
const SEAT_FWD = 0.22; // tiles: a sitter's hips, forward from the seat's middle (over the cushion's front half)
const SEAT_BACK = 0.36; // tiles: a sitter's hips, back from the middle for a camera behind (inside the back; its rear face is 0.4 back)
const PULL_SIT = 0.42; // tiles towards a camera in front (past the cushion's front edge; nothing from the sides or behind)
const PULL_STAND = 0.2; // (in front of what they stand right against)
const HIP = 168 - 104; // board units from the feet line up to the hips (the seated drawing's hips are on y 104)
const SIT_FEET = 131 - 104; // board units from a sitter's hips down to their shoes (y 131)
const SIT_IN = 0.3; // s: sitting down / getting up
// Where a sitter's hips rest, iso px of height: each seat's cushion top less
// what it gives (the iso drawings sink an occupied cushion a px or two).
const SEAT_HIP: Record<string, number> = { chair: 14, armchair: 13.5, sofa: 15.2, beanbag: 11, bench: 11.2 };
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
  pet?: PetView; // a pet (world/petview.ts): drawn as a model by the view, not here
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
  seat?: string; // what they sit on (catalog kind), when `a` is 2
  // the phone (shared/phone.ts): in the hand, its case, a photo pose, ringing
  phone?: string;
  bud?: boolean; // on a call, the phone put away: an earbud in the right ear
  phoneCase?: string;
  phonePose?: string;
  ringing?: boolean;
  recording?: boolean;
  torch?: boolean; // the phone's flashlight on
  focused?: boolean; // …focused: narrow and far (docs/plan/30-the-dark.md D4)
  gun?: string; // the weapon in the hand (D6): "revolver", "shotgun"
  arm?: number; // …what the hand's doing with it (shared ARM: drawing, reloading, broken open)
  down?: "down" | "kneel"; // down, crawling; kneeling by someone down (D7: world/dark says)
  fell?: number; // knocked down by a pool ball: s since (tp/view.ts times it from when it's seen)
  fellAt?: number; // …the server's, since when (0: on their feet), and the way the ball went
  fellYaw?: number;
  /** (plan 58 7) struck: s since (the view times it from when it's seen) and where it came from (the
   *  floor's radians) */
  hit?: { t: number; yaw: number };
  /** (plan 58 9) the warmth and the stamina (0..100), and a sound heard (s since, from where; loud: close) */
  wm?: number;
  st?: number;
  heard?: { t: number; x: number; y: number; loud: boolean };
  pinned?: boolean; // held down by a dog (docs/plan/52-the-pet-two.md D8): lying, not getting up
  jump?: JumpNow; // jumping (shared/jump.ts): its stage
  z?: number; // feet off the floor (up on something, in a jump), tiles
  ground?: number; // the top under them, tiles
  mv?: number; // the gait, crouching, aiming (shared/move packMv)
  // a vault, a mantle, a roll, a slide: how far in (`at`: since when, performance.now ms)
  verb?: { kind: string; t: number; at?: number };
  // a Flowmotion move (docs/plan/56-the-controls.md F): mine as it is (shared move FlowLook), or
  // someone's by its byte (move/flow.ts flowCode) and since when it shows (performance.now ms)
  flow?: FlowLook | null;
  flowCode?: number;
  flowAt?: number;
  pitch?: number; // aiming: up from level (radians)
  // one of the shadowed (docs/plan/30-the-dark.md D5; world/dark gives them): its upper body's
  // pose and how far in (s), its own twitches, how wrapped in the dark it is (0 bare … 1),
  // and its state (shared dark/fsm.ts) for the shroud
  shade?: {
    pose: "lurch" | "windup" | "strike" | "recoil" | "exposed" | "lurk";
    t: number;
    seed: number;
    dark: number;
    state: string;
    since: number; // (performance.now ms)
    burn?: { x: number; y: number } | null; // a focused beam on it, from there
    fade?: number; // 0..1: coming into range, going out of it (world/dark/shades.ts)
    killed?: boolean; // shot down: its dissolve is its death (SHADE.dying long)
  };
}

// A phone in the hand: its case and the face this view sees
function phoneImage(caseId: string, face: "screen" | "back" | "edge"): HTMLImageElement | null {
  const c = phoneColors(caseId);
  return partImage(`phone|${c[0]}|${face}`, phoneSvg(c, face), PHONE_BOX);
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
  private pivot = new Group(); // the drawing turns and leans about this: the feet, or a sitter's hips
  private sitW: number | null = null; // 0 standing … 1 seated (eases: sitting down / getting up)
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
  private drawnHash = 0; // the pose last drawn
  private drawnAt = 0;

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
    this.pivot.rotation.order = "YXZ";
    this.pivot.add(this.plane);
    this.root.add(this.pivot, shadow, this.ring);
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
    const key = `${JSON.stringify(p.avatar)}|${view}|${sitting ? 1 : 0}`;
    if (key !== this.rigKey) {
      this.rig = P.avatarRig(p.avatar, view, sitting);
      this.rigKey = key;
    }
    const rig = this.rig as AvatarRig;
    this.motion ??= new P.Motion(hashSeed(p.name));
    let dist = Math.hypot(p.x - this.last.x, p.y - this.last.y);
    if (dist > 1.5) dist = 0;
    this.last = { x: p.x, y: p.y };
    const walking = p.a === 1;
    const held =
      isHeld(p.held) && p.heldAt && !p.phone ? { kind: p.held as HeldKind, since: Date.now() - p.heldAt } : null;
    const pose = this.motion.update(rig, dt, {
      held,
      phone: p.phone || p.ringing ? { state: p.phone ?? "", pose: p.phonePose ?? "", ringing: !!p.ringing } : null,
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
    let heldLevel = 0;
    if (held) {
      const st = heldState(held.kind, held.since);
      heldLevel = Math.round(st.level * 4) + 1;
      const color = MUG_COLORS[Math.floor(hashSeed(p.name) * MUG_COLORS.length)];
      heldImg = heldImage(held.kind, color, Math.round(st.level * 4));
      if (!heldImg) all = false;
      tip = ((rig.side ? -38 : -22) * P.sipEnv(st.sip) * Math.PI) / 180;
    }
    // the phone in the hand, tilted as the pose holds it
    let phoneImg: HTMLImageElement | null = null;
    let grip = { tilt: 0, face: "back" as "screen" | "back" | "edge", scale: 1 };
    if (p.phone) {
      grip = P.phoneGrip(rig, p.phone);
      phoneImg = phoneImage(p.phoneCase ?? "walnut", grip.face);
      if (!phoneImg) all = false;
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
    // Drawn again only when the drawing would differ (a hash of the pose):
    // standing still, breathing settles for 20 redraws a second at most;
    // walking, talking and gestures every frame. (Each redraw is a canvas
    // and a texture upload.)
    const b = P.bones(rig, pose);
    let h = mirror ? 7 : 3;
    const mix = (v: number) => {
      h = (Math.imul(h, 31) + Math.round(v * 200)) | 0;
    };
    mix(rig.squash);
    mix(tip);
    mix(heldLevel);
    mix(p.phone ? p.phone.length + (grip.face === "screen" ? 10 : grip.face === "edge" ? 20 : 30) : 0);
    mix(p.recording ? Math.floor(performance.now() / 500) % 2 : 3);
    mix(pose.face === "blink" ? 1 : pose.face === "talk" ? 2 : 0);
    mix(parts.length);
    for (const part of parts) {
      mix(part.name.length);
      for (const m of b[part.name as keyof typeof b]) mix(m);
    }
    const calm = !walking && !p.speaking && !p.typing && !p.emote && !held && !this.actOf(p) && !p.phone && !p.ringing;
    const now = performance.now();
    const changed = h !== this.drawnHash && (!calm || now - this.drawnAt >= 50);
    if (all && ((redraw && changed) || !this.shown)) {
      this.drawnHash = h;
      this.drawnAt = now;
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const sx = (mirror ? -1 : 1) * rig.squash;
      // board → canvas, mirrored / squashed about the board's middle (x 60)
      const base: Aff = [sx * PX, 0, 0, PX, (60 - 60 * sx - BX0) * PX, -BY0 * PX];
      const drawHeld = () => {
        if (!heldImg) return;
        const hand = P.apply(b.armRf, rig.joints.hand);
        const c = Math.cos(tip);
        const sn = Math.sin(tip);
        const m = P.mul(base, [c, sn, -sn, c, hand[0], hand[1]]);
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        g.drawImage(heldImg, HELD_BOX[0], HELD_BOX[1], HELD_BOX[2], HELD_BOX[3]);
      };
      const drawPhone = () => {
        if (!phoneImg) return;
        const hand = P.apply(b.armRf, rig.joints.hand);
        const r = (grip.tilt * Math.PI) / 180;
        const k = grip.scale;
        const m = P.mul(base, [Math.cos(r) * k, Math.sin(r) * k, -Math.sin(r) * k, Math.cos(r) * k, hand[0], hand[1]]);
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        // its lit screen at night: a soft light round it
        if (night && p.phone !== "call") {
          const gl = g.createRadialGradient(0, -8, 0, 0, -8, 18);
          gl.addColorStop(0, "rgba(255,120,210,.35)");
          gl.addColorStop(1, "rgba(160,90,255,0)");
          g.fillStyle = gl;
          g.fillRect(-18, -26, 36, 36);
        }
        g.drawImage(phoneImg, PHONE_BOX[0], PHONE_BOX[1], PHONE_BOX[2], PHONE_BOX[3]);
        // recording: a red light, blinking
        if (p.recording && Math.floor(performance.now() / 500) % 2 === 0) {
          g.fillStyle = "rgba(255,32,48,.35)";
          g.beginPath();
          g.arc(-1.5, -13, 4.5, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#ff2030";
          g.beginPath();
          g.arc(-1.5, -13, 2, 0, Math.PI * 2);
          g.fill();
        }
      };
      const phoneBehind = rig.back && p.phone !== "selfie";
      for (const part of parts) {
        if (rig.back && part.name === "torso") {
          drawHeld();
          if (phoneBehind) drawPhone();
        }
        const m = P.mul(base, b[part.name as keyof typeof b]);
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        g.drawImage(part.img, part.box[0], part.box[1], part.box[2], part.box[3]);
        if (!rig.back && part.name === "armRf") drawHeld();
        if (!phoneBehind && part.name === "armRf") drawPhone();
      }
      this.shown = true;
      this.tex.needsUpdate = true;
    }
    this.plane.visible = this.shown;

    // place. Standing: feet on the floor. Seated: the hips on the seat's
    // cushion (per seat kind), a little forward of its middle, the drawing
    // leaning about the hips; the shoes then hang just over the floor, as
    // drawn. Sitting down / getting up slides there over a moment (the hips
    // drop from standing height onto the cushion).
    const s = this.s;
    const baseY = -(2 * PERSON) / ZPX;
    if (this.sitW === null || p.reduced) this.sitW = sitting ? 1 : 0;
    else this.sitW = Math.max(0, Math.min(1, this.sitW + (sitting ? dt : -dt) / SIT_IN));
    const w = this.sitW * this.sitW * (3 - 2 * this.sitW);
    const hipY = Math.max((SEAT_HIP[p.seat ?? ""] ?? 14) / ZPX, SIT_FEET * s + 0.015);
    this.root.position.set(p.x, sitting ? 0 : (p.z ?? 0), p.y);
    // how much the camera looks at the seat's front (1) … side (0) … back (-1)
    const front = cam ? Math.cos(Math.atan2(cam.z - p.y, cam.x - p.x) - p.angle) : 1;
    // From the side the torso belongs against the back (the lap reaches the
    // front edge); from behind, well into the back (just short of its rear
    // face, so it still covers the card) — a chase camera looks down over a
    // seat's back, and a torso drawn forward of it shows whole, perched on it.
    const fwd = (front >= 0 ? SEAT_FWD * front : SEAT_BACK * front) * w;
    const pivotY = sitting ? HIP * s + baseY + (hipY - HIP * s - baseY) * w : baseY;
    this.pivot.position.set(Math.cos(p.angle) * fwd, pivotY, Math.sin(p.angle) * fwd);
    this.plane.position.set(0, sitting ? -HIP * s : 0, 0);
    // (a sitter leans back towards a high camera only from the front: from
    // behind, a tipped card lifts the torso out of the seat's back)
    this.pivot.rotation.set(-camPitch * lean * (sitting ? 0.3 * Math.max(0, front) : 1), -face + Math.PI / 2, 0);
    // Pulled towards the camera along the line of sight and shrunk by the same
    // ratio: exactly the same on screen, but in front of the cushion a sitter
    // sits on (and of a desk edge someone stands against). What's really
    // between you and them — more than the pull nearer — still covers them.
    // A sitter is pulled only for a camera in front of the seat: from the
    // sides its arms cover their lap, from behind its back covers them.
    this.pivot.scale.setScalar(1);
    if (cam) {
      let pull = PULL_STAND;
      if (sitting) pull = PULL_SIT * Math.max(0, front) * w + PULL_STAND * (1 - w);
      const px = p.x + this.pivot.position.x;
      const py = this.pivot.position.y;
      const pz = p.y + this.pivot.position.z;
      const d = Math.hypot(px - cam.x, py + (sitting ? 0.3 : 0.8) - cam.y, pz - cam.z);
      if (pull > 0 && d > pull * 2) {
        const k = (d - pull) / d;
        this.pivot.position.set(
          cam.x + (px - cam.x) * k - p.x,
          cam.y + (py - cam.y) * k,
          cam.z + (pz - cam.z) * k - p.y,
        );
        this.pivot.scale.setScalar(k);
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
    this.plane.position.set(0, 0, 0);
    this.pivot.scale.setScalar(1);
    this.pivot.position.set(0, 0.12 + Math.sin(performance.now() / 420) * 0.05, 0);
    this.pivot.rotation.set(-camPitch * lean, -face + Math.PI / 2, 0);
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
