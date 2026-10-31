import { type AvatarLayers, type HeldKind, heldState, isHeld, type JumpKind, type JumpNow } from "@yutopia/shared";
import {
  Color,
  type Group,
  type Material,
  MeshBasicMaterial,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { phoneColors } from "../art/phone-art";
import { INK } from "./ink";
import { CharFactory, lookKey, PersonModel, type Reach } from "./model";
import {
  blend,
  busyPose,
  ease,
  emotePose,
  holdPose,
  jumpPose,
  phonePose,
  STRIDE,
  seatedPose,
  sipEnv,
  sipPose,
  standPose,
  togetherPose,
  walkPose,
} from "./motion";
import {
  crouchPose,
  crouchWalkPose,
  FALL_LEN,
  fellPose,
  runPose,
  runStride,
  SNEAK_STRIDE,
  torchPose,
  VERB_LEN,
  type Verb,
  verbPose,
} from "./moves";
import { buildProp, inHand, keepUpright, type PropKind, pointAlong } from "./props";
import type { Euler3, Pose } from "./rig";

// The 3D people drawn for the iso view (docs/plan/22-people-3d.md, P6): each
// person's model rendered from the iso camera — 30° down, the viewer at +x +y,
// 8 facings — into a sprite per look × facing × what they're doing × frame,
// on demand, kept (oldest out first). What they're doing is boiled down to a
// few frames (`isoState`) and posed by the same pose functions as the 3D
// motion (`isoPose`), so iso and 3D move alike. One small WebGL renderer, a
// few milliseconds of drawing a frame — which also draws the HUD's pictures
// of people: a live turntable and portraits (P7).

export const ISO = {
  LPX: 45.25, // iso px per tile of horizontal length (tp/kit3d.ts)
  ZPX: 45.25 * Math.cos(Math.PI / 6), // iso px of height per tile
  PX: 2, // sprite px per iso px (mipmapped: clean lines at any zoom)
  W: 164,
  H: 228,
  LOOK_AT: 0.95, // tiles above the feet the camera looks at
  SCALE: 1.38, // drawn this much over life-size: as tall as iso's people always stood (~92 px)
  INK: 1.7, // the line, in sprite px
  SEAT_HIP: 14, // iso px: where a sitter's hips rest (a chair's cushion)
};
const KEEP = 700; // sprites kept (≤ ~105 MB of canvases, ~140 MB of mipmapped textures)
const LOOKS = 40; // models kept
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
// the facing (0..7) nearest a heading
const dirOf = (a: number) => {
  let best = 0;
  for (let d = 1; d < 8; d++)
    if (Math.abs(Math.sin((a - dirAngle(d)) / 2)) < Math.abs(Math.sin((a - dirAngle(best)) / 2))) best = d;
  return best;
};
const dirAngle = (d: number) => {
  const [x, y] = DIR_VEC[((d % 8) + 8) % 8];
  return Math.atan2(y, x);
};

/** Someone as the iso view knows them this frame. */
export interface IsoIn {
  avatar: AvatarLayers;
  dir: number; // the facing drawn (0..7)
  a: number; // 0 idle, 1 walk, 2 sit
  dist: number; // tiles covered this frame
  dt: number;
  held?: string;
  heldAt?: number;
  phone?: string;
  phonePose?: string;
  phoneCase?: string; // (phone "bud": on a call, the phone put away — an earbud, no phone)
  torch?: boolean; // the torch on: a flashlight in the left hand
  mugColor?: string;
  recording?: boolean;
  busy?: string;
  emote?: string;
  speaking?: boolean;
  typing?: boolean;
  reduced?: boolean;
  act?: { what: string; t: number; len: number } | null;
  jump?: JumpNow | null; // jumping (shared/jump.ts): its stage
  mv?: number; // the gait, crouching, aiming (shared/move packMv)
  // a vault, a mantle, a roll, a slide: how far in (`at`: since when, performance.now ms)
  verb?: { kind: string; t: number; at?: number };
  // knocked down by a pool ball (shared/pool-throw.ts): the server's since when, the ball's way
  fellAt?: number;
  fellYaw?: number;
}

/** What a person's sprite remembers between frames (the walk's phase, the blinks…). */
export interface IsoMem {
  phase?: number;
  speed?: number; // eased (the cycle mustn't flicker between gaits)
  gait?: "walk" | "jog" | "sprint";
  blinkAt?: number;
  blinkUntil?: number;
  mouthAt?: number;
  mouthOpen?: boolean;
  emote?: string;
  emoteAt?: number;
  fellAt?: number; // the fall being drawn (its server time), from when it showed up here
  fellT0?: number;
  last?: IsoSprite;
}

/** One drawn frame of a person. */
export interface IsoState {
  // the gaits (docs/plan/29-the-move.md M6): the walk, the jog and the sprint (runPose),
  // crouched still and sneaking
  base: "stand" | "walk" | "jog" | "sprint" | "crouch" | "sneak" | "sit" | "type" | "fell" | JumpKind | Verb;
  bf: number; // the base's frame
  upper: string; // "" | hold | sip | busy:<use> | phone:<state>:<pose> | act:<what> | emote:<emote>
  uf: number; // its frame
  face: 0 | 1 | 2; // open, eyes shut, mouth open
  held: string; // the thing in the hand (and the coffee's level, 0..4)
  phone: string; // the phone's case colour, and the REC light
  extra: string; // "b": an earbud in; "t": a flashlight in the left hand
}

/** A pose for the HUD's pictures (a Motion3's output). */
export interface PictureMotion {
  pose: Pose;
  lift: Euler3;
  blink: number;
  talk: number;
  reach?: Reach;
}

export interface IsoSprite {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
  scale: number; // iso px per sprite px
}

// frames per thing they do
const WALK_N = 8;
const SIP_N = 6;
const BUSY_N = 8;
const ACT_N = 6;
const EMOTE_N = 8;
const EMOTE_LEN = 3.2; // s (Motion3's)
// a jump's frames: the crouch, the air (a flip turns a whole way round in it), the landing
const JUMP_N = { crouch: 2, air: { hop: 9, flip: 16, leap: 9 }, land: 3 };
const FELL_N = 16; // knocked down: thrown back, on the floor, up again

/** Which of a jump's frames its stage falls on. */
export function jumpFrame(j: JumpNow): number {
  const air = JUMP_N.air[j.kind];
  const at = (n: number) => Math.min(n - 1, Math.max(0, Math.floor(j.k * n)));
  if (j.stage === "crouch") return at(JUMP_N.crouch);
  if (j.stage === "air") return JUMP_N.crouch + at(air);
  return JUMP_N.crouch + air + at(JUMP_N.land);
}
/** The stage in the middle of a jump's frame. */
export function jumpAtFrame(kind: JumpKind, f: number): JumpNow {
  const air = JUMP_N.air[kind];
  if (f < JUMP_N.crouch) return { kind, stage: "crouch", k: (f + 0.5) / JUMP_N.crouch };
  if (f < JUMP_N.crouch + air) return { kind, stage: "air", k: (f - JUMP_N.crouch + 0.5) / air };
  return { kind, stage: "land", k: (f - JUMP_N.crouch - air + 0.5) / JUMP_N.land };
}

/** A verb as far as it's got (`at`: since when — someone else's — else its own `t`), or null
 *  (not a verb, or over). */
export function verbAt(
  v: { kind: string; t: number; at?: number } | undefined,
  now: number,
): { kind: Verb; t: number } | null {
  const len = v ? VERB_LEN[v.kind as Verb] : undefined;
  if (!v || !len) return null;
  const t = v.at !== undefined ? (now - v.at) / (len * 1000) : v.t;
  return t >= 0 && t <= 1 ? { kind: v.kind as Verb, t } : null;
}

/** Boil this frame down to a drawable state (and step what it remembers). */
export function isoState(m: IsoMem, p: IsoIn, now: number): IsoState {
  const t = now / 1000;
  const sitting = p.a === 2;
  const walking = p.a === 1 && !sitting;
  // the gait by the speed (eased, and a little past a line before it changes)
  const raw = p.dt > 0 ? p.dist / p.dt : 0;
  m.speed = (m.speed ?? raw) + (raw - (m.speed ?? raw)) * Math.min(1, p.dt * 8);
  const v = m.speed;
  const was = m.gait ?? "walk";
  const gait = v < (was === "walk" ? 3.0 : 2.6) ? "walk" : v < (was === "sprint" ? 5.2 : 5.6) ? "jog" : "sprint";
  m.gait = gait;
  const crouch = ((p.mv ?? 0) & 8) !== 0;
  const stride = crouch ? SNEAK_STRIDE : gait === "walk" ? STRIDE : runStride(gait === "jog" ? 0 : 1);
  m.phase = ((m.phase ?? 0) + p.dist / stride) % 1;
  let base: IsoState["base"] = sitting
    ? p.typing
      ? "type"
      : "sit"
    : crouch
      ? walking
        ? "sneak"
        : "crouch"
      : walking
        ? gait
        : "stand";
  let bf = 0;
  if (base === "walk" || base === "jog" || base === "sprint" || base === "sneak")
    bf = Math.floor(m.phase * WALK_N) % WALK_N;
  else if (base === "type" && !p.reduced) bf = Math.floor(t * 5) % 2;
  // a verb takes the body: its frames through it
  const vt = verbAt(p.verb, now);
  if (vt && !sitting) {
    base = vt.kind;
    bf = Math.min(WALK_N - 1, Math.floor(vt.t * WALK_N));
  }
  // a jump takes the body (a flip with reduced motion: a hop's frames)
  if (p.jump && !sitting) {
    const kind = p.reduced ? "hop" : p.jump.kind;
    base = kind;
    bf = jumpFrame({ ...p.jump, kind });
  }
  // knocked down by a pool ball: the fall's frames, timed from when it's seen
  if (p.fellAt) {
    if (m.fellAt !== p.fellAt) {
      m.fellAt = p.fellAt;
      m.fellT0 = t;
    }
    const ft = t - (m.fellT0 ?? t);
    if (ft < FALL_LEN) {
      base = "fell";
      bf = Math.min(FELL_N - 1, Math.floor((ft / FALL_LEN) * FELL_N));
    }
  } else m.fellAt = 0;

  let upper = "";
  let uf = 0;
  let held = "";
  let phone = "";
  let sipping = false;
  const bud = p.phone === "bud";
  if (p.phone && !bud) {
    upper = `phone:${p.phone}:${p.phonePose ?? ""}`;
    phone = `${phoneColors(p.phoneCase)[0]}|${p.recording && Math.floor(t * 2) % 2 === 0 ? 1 : 0}`;
  } else if (isHeld(p.held) && p.heldAt) {
    const st = heldState(p.held as HeldKind, Date.now() - p.heldAt);
    const drink = p.held === "mug" || p.held === "cup" || p.held === "soda";
    held = drink ? `${p.held}|${p.mugColor ?? ""}|${Math.round(st.level * 4)}` : `${p.held}`;
    if (drink && st.sip >= 0 && !p.reduced) {
      upper = "sip";
      uf = Math.min(SIP_N - 1, Math.floor(st.sip * SIP_N));
      sipping = st.sip >= 0.32 && st.sip <= 0.68;
    } else upper = "hold";
  }
  if (!upper && p.busy && !sitting) {
    upper = `busy:${p.busy}`;
    uf = p.reduced ? 0 : Math.floor(t * BUSY_N) % BUSY_N;
  }
  if (!upper && p.act && !sitting) {
    upper = `act:${p.act.what}`;
    uf = Math.min(ACT_N - 1, Math.floor((p.act.t / p.act.len) * ACT_N));
    if (p.act.t > p.act.len) upper = "";
  }
  // an emote plays once from when it showed up
  if (p.emote !== m.emote) {
    m.emote = p.emote;
    m.emoteAt = t;
  }
  if (!upper && p.emote) {
    const et = t - (m.emoteAt ?? t);
    const len = p.reduced ? 1.2 : EMOTE_LEN;
    if (et < len) {
      upper = `emote:${p.emote}`;
      uf = Math.min(EMOTE_N - 1, Math.floor((et / len) * EMOTE_N));
    }
  }

  // the face: a blink now and then, the mouth while speaking
  let face: IsoState["face"] = 0;
  if (!p.reduced) {
    m.blinkAt ??= t + 1 + Math.random() * 3;
    if (t > m.blinkAt) {
      m.blinkUntil = t + 0.12;
      m.blinkAt = t + 2.2 + Math.random() * 4;
    }
    if (t < (m.blinkUntil ?? 0)) face = 1;
  }
  if (sipping) face = 1;
  if (p.speaking) {
    if (t > (m.mouthAt ?? 0)) {
      m.mouthOpen = !m.mouthOpen;
      m.mouthAt = t + (m.mouthOpen ? 0.09 : 0.08) + Math.random() * 0.08;
    }
    if (m.mouthOpen) face = 2;
  } else m.mouthOpen = false;
  // (the flashlight: not while the phone's out — both hands on it)
  const extra = `${bud ? "b" : ""}${p.torch && (!p.phone || bud) && !sitting ? "t" : ""}`;
  return { base, bf, upper, uf, face, held, phone, extra };
}

/** A drawn state as a pose — the 3D motion's own pose functions, at that frame. */
export function isoPose(s: IsoState): {
  pose: Pose;
  lift: Euler3;
  reach: Reach;
  blink: number;
  talk: number;
  sip: number;
} {
  let lift: Euler3 = [0, 0, 0];
  const reach: Reach = {};
  let p: Pose;
  if (s.base === "walk") {
    const w = walkPose((s.bf + 0.5) / WALK_N, 1);
    p = w.pose;
    lift = [...w.lift];
  } else if (s.base === "jog" || s.base === "sprint" || s.base === "sneak" || s.base === "crouch") {
    const k = (s.bf + 0.5) / WALK_N;
    const w =
      s.base === "crouch"
        ? crouchPose(0)
        : s.base === "sneak"
          ? crouchWalkPose(k)
          : runPose(k, s.base === "jog" ? 0 : 1);
    p = w.pose;
    lift = [...w.lift];
  } else if (s.base === "sit" || s.base === "type") {
    p = seatedPose(s.base === "type");
    if (s.base === "type") {
      const k = s.bf ? 1 : -1;
      p.wristR = [(p.wristR?.[0] ?? 0) + 0.1 * k, p.wristR?.[1] ?? 0, p.wristR?.[2] ?? 0];
      p.wristL = [(p.wristL?.[0] ?? 0) - 0.1 * k, p.wristL?.[1] ?? 0, p.wristL?.[2] ?? 0];
    }
  } else if (s.base === "vault" || s.base === "mantle" || s.base === "roll" || s.base === "slide") {
    const w = verbPose(s.base, (s.bf + 0.5) / WALK_N);
    p = w.pose;
    lift = [...w.lift];
  } else if (s.base === "fell") {
    const w = fellPose(((s.bf + 0.5) / FELL_N) * FALL_LEN);
    p = w.pose;
    lift = [...w.lift];
  } else if (s.base === "hop" || s.base === "flip" || s.base === "leap") {
    const j = jumpPose(jumpAtFrame(s.base, s.bf));
    p = blend(standPose(), j.pose, j.w);
    lift = [0, j.lift[1] * j.w, 0];
  } else p = standPose();
  // the torch on: the left forearm out ahead, the flashlight in it
  if (s.extra.includes("t")) p = blend(p, torchPose(), 1);
  let sip = 0;
  let blink = s.face === 1 ? 1 : 0;
  let talk = s.face === 2 ? 1 : 0;
  const [kind, what = "", extra = ""] = s.upper.split(":");
  if (kind === "hold") p = blend(p, holdPose(), 1);
  else if (kind === "sip") {
    sip = sipEnv((s.uf + 0.5) / SIP_N);
    p = blend(p, blend(holdPose(), sipPose(), sip), 1);
    if (sip > 0) reach.R = { at: "mouth", w: sip };
  } else if (kind === "busy") {
    const b = busyPose(what, s.uf / BUSY_N);
    p = blend(p, b.pose, 1);
    lift = [lift[0] + b.lift[0], lift[1] + b.lift[1], lift[2] + b.lift[2]];
  } else if (kind === "phone") {
    p = blend(p, phonePose(what, extra, 0.4, false), 1);
    if (what === "call") reach.R = { at: "ear", w: 1 };
  } else if (kind === "act") {
    const k = (s.uf + 0.5) / ACT_N;
    p = blend(p, what === "wave" ? emotePose("wave", k * 1.6).pose : togetherPose(what, k), 1);
  } else if (kind === "emote") {
    const et = ((s.uf + 0.5) / EMOTE_N) * EMOTE_LEN;
    const e = ease(et / 0.28) * (1 - ease((et - (EMOTE_LEN - 0.4)) / 0.4));
    const em = emotePose(what, et);
    p = blend(p, em.pose, e);
    lift = [lift[0] + em.lift[0] * e, lift[1] + em.lift[1] * e, lift[2] + em.lift[2] * e];
    for (const side of ["L", "R"] as const) {
      const h = em.reach?.[side];
      if (h) reach[side] = { ...h, w: h.w * e };
    }
    if (em.blink !== undefined) blink = Math.max(blink, em.blink * e);
    if (em.talk !== undefined) talk = Math.max(talk, em.talk * e);
  }
  return { pose: p, lift, reach, blink, talk, sip };
}

const key = (look: string, dir: number, s: IsoState) =>
  `${look}|${dir}|${s.base}${s.bf}|${s.upper}${s.uf}|${s.face}|${s.held}|${s.phone}|${s.extra}`;

interface Look {
  model: PersonModel;
  props: Map<string, ReturnType<typeof buildProp>>;
  toy: Object3D | null;
}

class IsoPeople {
  private renderer: WebGLRenderer | null = null;
  private failed = false;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private persp = new PerspectiveCamera(28, 1, 0.05, 20);
  private factory = new CharFactory(20_000, 12);
  private looks = new Map<string, Look>();
  private sprites = new Map<string, IsoSprite>();
  private mats = new Map<string, MeshBasicMaterial>();
  private mounted: Look | null = null;
  private spent = 0; // ms of drawing this frame
  private frameAt = -1;
  /** draw at most this long a frame (ms); what's left waits (the last frame stays up) */
  budget = 4;
  /** a sprite left the cache (the view lets its texture go) */
  onDrop: ((canvas: HTMLCanvasElement) => void) | null = null;
  /** a pet toy for the hand, when the pets chunk is in (pets3d.ts `toyMesh`) */
  toy: ((kind: string, mat: (c: string | number | Color) => Material) => Object3D | null) | null = null;

  constructor() {
    const hw = ISO.W / 2 / (ISO.LPX * ISO.PX);
    const hh = ISO.H / 2 / (ISO.LPX * ISO.PX);
    this.camera = new OrthographicCamera(-hw, hw, hh, -hh, 0.1, 30);
    const a = 6;
    this.camera.position.set(a, Math.SQRT2 * a * Math.tan(Math.PI / 6), a);
    this.camera.lookAt(0, ISO.LOOK_AT, 0);
  }

  /** WebGL drawn on the CPU (no GPU, or a blocked one): a picture costs 0.1–1 s there, so iso and
   *  the HUD keep the drawn people (`canDraw`) and only the 3D view draws the models */
  software = false;

  /** People can be drawn from the model here (a GPU to draw them); otherwise iso and the HUD keep the drawing. */
  canDraw(): boolean {
    return !!this.gl() && !this.software;
  }

  private gl(): WebGLRenderer | null {
    if (this.renderer || this.failed) return this.renderer;
    try {
      const r = new WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
      r.setSize(ISO.W, ISO.H, false);
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = SRGBColorSpace;
      this.renderer = r;
      const g = r.getContext();
      const info = g.getExtension("WEBGL_debug_renderer_info");
      const name = String(info ? g.getParameter(info.UNMASKED_RENDERER_WEBGL) : "");
      this.software = /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch {
      this.failed = true; // (no WebGL: the drawn people stay)
    }
    return this.renderer;
  }

  private mat = (c: string) => {
    let m = this.mats.get(c);
    if (!m) {
      m = new MeshBasicMaterial({ color: c });
      this.mats.set(c, m);
    }
    return m;
  };

  private look(avatar: AvatarLayers, lk: string, lod: 0 | 1 = 1): Look {
    const k = lod === 1 ? lk : `${lk}|L${lod}`;
    let l = this.looks.get(k);
    if (!l) {
      l = { model: new PersonModel(this.factory, avatar, lod), props: new Map(), toy: null };
      this.looks.set(k, l);
      if (this.looks.size > LOOKS) {
        const [oldKey, old] = this.looks.entries().next().value as [string, Look];
        this.looks.delete(oldKey);
        if (this.mounted === old) this.mounted = null;
        for (const pr of old.props.values()) pr.dispose();
        old.model.dispose();
      }
    }
    return l;
  }

  /** The sprite for someone as they are now: a cached frame, a new one drawn
   *  (within the frame's budget), or their last one; null until their model is built. */
  sprite(mem: IsoMem, p: IsoIn, now: number): IsoSprite | null {
    if (this.frameAt !== now) {
      this.frameAt = now;
      this.spent = 0;
      this.factory.pump(this.budget);
    }
    const st = isoState(mem, p, now);
    const lk = lookKey(p.avatar);
    // (fallen: facing back the way the ball came)
    const dir = st.base === "fell" ? dirOf((p.fellYaw ?? 0) + Math.PI) : ((p.dir % 8) + 8) % 8;
    const k = key(lk, dir, st);
    const have = this.sprites.get(k);
    if (have) {
      // (fresh again: the oldest out first)
      this.sprites.delete(k);
      this.sprites.set(k, have);
      mem.last = have;
      return have;
    }
    if (this.spent > this.budget) return mem.last ?? null;
    const gl = this.gl();
    if (!gl) return null;
    const l = this.look(p.avatar, lk);
    if (!l.model.update(1)) return mem.last ?? null;
    const t0 = performance.now();
    this.mount(l);
    this.pose(l, st, dir);
    // the line, in sprite px (the 3D view's own settings are put back after)
    const res = INK.res.value.clone();
    const px = INK.px.value;
    INK.res.value.set(ISO.W, ISO.H);
    INK.px.value = ISO.INK;
    gl.render(this.scene, this.camera);
    INK.res.value.copy(res);
    INK.px.value = px;
    const canvas = document.createElement("canvas");
    canvas.width = ISO.W;
    canvas.height = ISO.H;
    (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(gl.domElement, 0, 0);
    // the feet: LOOK_AT tiles under the middle, foreshortened by the 30° camera
    const feetY = ISO.H / 2 + ISO.LOOK_AT * Math.cos(Math.PI / 6) * ISO.LPX * ISO.PX;
    const sp: IsoSprite = { canvas, anchorX: 0.5, anchorY: feetY / ISO.H, scale: ISO.SCALE / ISO.PX };
    this.sprites.set(k, sp);
    if (this.sprites.size > KEEP) {
      const [oldKey, old] = this.sprites.entries().next().value as [string, IsoSprite];
      this.sprites.delete(oldKey);
      this.onDrop?.(old.canvas);
    }
    this.spent += performance.now() - t0;
    mem.last = sp;
    return sp;
  }

  private mount(l: Look) {
    if (this.mounted === l) return;
    if (this.mounted) this.scene.remove(this.mounted.model.root);
    this.scene.add(l.model.root);
    this.mounted = l;
  }

  private pose(l: Look, st: IsoState, dir: number) {
    const m = l.model;
    const ps = isoPose(st);
    const drop = st.base === "sit" || st.base === "type" ? m.sitDrop(ISO.SEAT_HIP / ISO.ZPX) : 0;
    m.root.rotation.y = Math.PI / 2 - dirAngle(dir);
    m.root.updateMatrixWorld();
    m.setPose(ps.pose, [ps.lift[0], ps.lift[1] + drop, ps.lift[2]], ps.reach);
    m.setFace(ps.blink, ps.talk);
    // what's in the hand
    const hand = m.bone("wristR");
    for (const pr of l.props.values()) pr.root.visible = false;
    if (l.toy) l.toy.visible = false;
    // the earbud in the right ear; the flashlight in the left fist
    const head = m.bone("head");
    const ear = m.earPoint();
    if (st.extra.includes("b") && head && ear) {
      const pr = this.prop(l, "bud", "#f4f2ec");
      pr.root.visible = true;
      if (pr.root.parent !== head) head.add(pr.root);
      pr.root.position.set(ear[0], ear[1], ear[2]);
    }
    const left = m.bone("wristL");
    if (st.extra.includes("t") && left) {
      const pr = this.prop(l, "torch", "#2b2e33");
      pr.root.visible = true;
      if (pr.root.parent !== left) left.add(pr.root);
      // ahead along the beam, tipped at the ground (shared beam.ts BEAM.tilt)
      pointAlong(pr.root, new Vector3(0, Math.sin(-0.13), Math.cos(-0.13)).applyQuaternion(m.root.quaternion));
    }
    if (!hand) return;
    const [kind, color = "", level = "4"] = st.held.split("|");
    if (st.phone) {
      const [case_] = st.phone.split("|");
      const pr = this.prop(l, "phone", case_ || "#5b3a26");
      pr.root.visible = true;
      if (pr.root.parent !== hand) hand.add(pr.root);
      inHand(pr.root, "phone");
      if (pr.rec) pr.rec.visible = st.phone.endsWith("|1");
    } else if (kind === "mug" || kind === "cup" || kind === "soda") {
      const c = kind === "mug" ? color || "#efe4cc" : kind === "soda" ? "#c4402b" : "#efe4cc";
      const pr = this.prop(l, kind, c);
      pr.root.visible = true;
      if (pr.root.parent !== hand) hand.add(pr.root);
      pr.setLevel?.(Number(level) / 4);
      keepUpright(pr.root, kind, m.root, ps.sip * 1.05);
    } else if (kind && this.toy) {
      if (!l.toy || l.toy.userData.kind !== kind) {
        l.toy?.removeFromParent();
        l.toy = this.toy(kind, (c) => this.mat(`#${new Color(c).getHexString()}`));
        if (l.toy) l.toy.userData.kind = kind;
      }
      if (l.toy) {
        l.toy.visible = true;
        if (l.toy.parent !== hand) hand.add(l.toy);
        inHand(l.toy as Group, "toy");
      }
    }
  }

  // A picture of someone for the HUD: the model at `lod`, built now if it must be,
  // posed (rest when no pose), with the line sized for `px` (the canvas's px).
  private picture(avatar: AvatarLayers, lod: 0 | 1, yaw: number, px: number, mo?: PictureMotion | null): Look | null {
    const gl = this.gl();
    if (!gl) return null;
    const l = this.look(avatar, lookKey(avatar), lod);
    for (let i = 0; i < 4 && !l.model.update(2); i++) this.factory.pump(100);
    if (!l.model.ready) return null;
    this.mount(l);
    for (const pr of l.props.values()) pr.root.visible = false;
    if (l.toy) l.toy.visible = false;
    l.model.root.rotation.y = yaw;
    l.model.setPose(mo?.pose ?? {}, mo?.lift ?? [0, 0, 0], mo?.reach);
    l.model.setFace(mo?.blink ?? 0, mo?.talk ?? 0);
    INK.res.value.set(px, px);
    INK.px.value = Math.max(1.4, px / 150);
    return l;
  }

  private shoot(gl: WebGLRenderer, size: number) {
    gl.setSize(size, size, false);
    this.persp.aspect = 1;
    this.persp.updateProjectionMatrix();
    gl.render(this.scene, this.persp);
  }

  /** Someone on a stand into a (square-ish) canvas, turned `yaw`, posed by `mo` (a Motion3's output).
   *  (The middle level of detail: plenty at a HUD picture's size.) */
  turntable(target: HTMLCanvasElement, avatar: AvatarLayers, yaw: number, mo?: PictureMotion | null): boolean {
    const size = Math.min(target.width, target.height);
    const res = INK.res.value.clone();
    const px = INK.px.value;
    const l = this.picture(avatar, 1, yaw, size, mo);
    const gl = this.renderer;
    if (l && gl) {
      const h = l.model.height;
      // (room over the head for hair and hats)
      this.persp.position.set(0, h * 0.58, h * 2.6);
      this.persp.lookAt(0, h * 0.53, 0);
      this.shoot(gl, size);
      const g = target.getContext("2d") as CanvasRenderingContext2D;
      g.clearRect(0, 0, target.width, target.height);
      g.drawImage(gl.domElement, 0, 0, size, size, (target.width - size) / 2, (target.height - size) / 2, size, size);
      gl.setSize(ISO.W, ISO.H, false);
    }
    INK.res.value.copy(res);
    INK.px.value = px;
    return !!(l && gl);
  }

  /** Head and shoulders, facing you a little turned, as a data URL (null without WebGL). */
  portrait(avatar: AvatarLayers, px = 128): string | null {
    const res = INK.res.value.clone();
    const ipx = INK.px.value;
    const l = this.picture(avatar, 1, 0.32, px, null);
    const gl = this.renderer;
    let url: string | null = null;
    if (l && gl) {
      const head = l.model.jointPosition("head");
      const hh = l.model.height / 5;
      this.persp.position.set(0, head.y + hh * 0.62, hh * 3.9);
      this.persp.lookAt(0, head.y + hh * 0.4, 0);
      this.shoot(gl, px);
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      (c.getContext("2d") as CanvasRenderingContext2D).drawImage(gl.domElement, 0, 0, px, px, 0, 0, px, px);
      gl.setSize(ISO.W, ISO.H, false);
      url = c.toDataURL();
    }
    INK.res.value.copy(res);
    INK.px.value = ipx;
    return url;
  }

  /** One option of the look, framed on the part it's about (the avatar editor's buttons, docs/plan/60):
   *  the head, the chest, the legs or the feet, three-quarter on, as a data URL (null without WebGL). */
  thumb(avatar: AvatarLayers, focus: "head" | "chest" | "legs" | "feet", px = 96): string | null {
    const res = INK.res.value.clone();
    const ipx = INK.px.value;
    const l = this.picture(avatar, 1, 0.5, px, null);
    const gl = this.renderer;
    let url: string | null = null;
    if (l && gl) {
      const h = l.model.height;
      // (the point to look at, up the figure, and how far back to frame it)
      const [y, d] = { head: [0.88, 0.62], chest: [0.66, 0.85], legs: [0.3, 1.05], feet: [0.05, 0.6] }[focus];
      this.persp.position.set(0, h * (y + 0.04), h * d);
      this.persp.lookAt(0, h * y, 0);
      this.shoot(gl, px);
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      (c.getContext("2d") as CanvasRenderingContext2D).drawImage(gl.domElement, 0, 0, px, px, 0, 0, px, px);
      gl.setSize(ISO.W, ISO.H, false);
      url = c.toDataURL();
    }
    INK.res.value.copy(res);
    INK.px.value = ipx;
    return url;
  }

  private prop(l: Look, kind: PropKind, color: string) {
    const k = `${kind}|${color}`;
    let pr = l.props.get(k);
    if (!pr) {
      pr = buildProp(kind, color, this.mat);
      l.props.set(k, pr);
    }
    return pr;
  }

  get size() {
    return this.sprites.size;
  }

  dispose() {
    for (const l of this.looks.values()) {
      for (const pr of l.props.values()) pr.dispose();
      l.model.dispose();
    }
    this.looks.clear();
    this.sprites.clear();
    this.factory.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}

let shared: IsoPeople | null = null;
/** The one iso renderer for people (made on first use). */
export function isoPeople(): IsoPeople {
  shared ??= new IsoPeople();
  return shared;
}
