import {
  across,
  cutsSig,
  EMOTES,
  type Emote,
  elevOf,
  entry,
  floorOf,
  floorsOf,
  homeOf,
  isFloor,
  levelMap,
  liftFloorName,
  liftMotion,
  type MapDef,
  objLevel,
  offsetOf,
  onLevel,
  type Point,
  placedFootprint,
  STOREY,
  tileAt,
  WANTS,
  type Want,
  type WorldObjectDef,
  wallCuts,
  wellsOf,
} from "@yutopia/shared";
import { AIM_BLADE, BEAM, type Beam, beamAt, beamOf } from "@yutopia/shared/beam";
import { LAMPS as GROUND_LAMPS } from "@yutopia/shared/grounds";
import { MV_AIM } from "@yutopia/shared/move";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  type Camera,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Frustum,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearSRGBColorSpace,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sphere,
  SpotLight,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tr } from "@/lib/i18n";
import { chars, loadChars } from "../art/chars-load";
import { daylight } from "../art/daylight";
import { emoteUrl } from "../art/emotes";
import type { LightSource } from "../art/light";
import type { people } from "../art/people-load";
import { loadPets, pets as petsArt } from "../art/pets-load";
import type { PetModel } from "../art/pets3d";
import type { PuffKind } from "../engine";
import { type Footprints, printLeft } from "../footprints";
import { activePad } from "../pads";
import { Arms3 } from "./arms3d";
import { type FadeGroup, type Items, World3 } from "./build";
import { BuildLayer, type BuildLook } from "./build3d";
import { carGeometry } from "./campus";
import { type GameScene3, GamesIn3D, HAND_SIT, HAND_STAND } from "./games3d";
import { CASTER_LAYER } from "./grounds-stream";
import type { GunFx } from "./guns3d";
import { Hands1P, handsDoing } from "./hands1p";
import { zt } from "./kit3d";
import { type LiftStop3, Lifts3, liftMats } from "./lift3d";
import { Light3, landLight, litBalance, patchGrounds } from "./light3d";
import { type Live, LiveFeed, type LiveSources, LiveSurfaces } from "./live";
import { dirAngle, Person3, type PersonIn } from "./people3d";
import { type Mats as CharMats, Person3D } from "./person3d";
import { Post3 } from "./post3d";
import { Shroud3 } from "./shroud3d";
import { fogFor, Surroundings, type Themes } from "./sky";
import { type StairStop3, Stairs3, stairMats } from "./stairs3d";
import { type TableScene3, TablesIn3D } from "./tables3d";
import { busModel } from "./vehicles3d";

type People = NonNullable<ReturnType<typeof people>>;

// The third-person view: the world (build.ts) and its people (people3d.ts)
// seen by a camera behind and above you. Two cameras:
//   chase — follows behind you, looks down 20–57° (the drawn people read best
//           from above), turns with you as you walk; drag / Q E to look around
//   free  — orbit anywhere with the mouse, down to eye level, never turns on its own
//   first — in your head: the camera stands on you at eye height and looks
//           where you look; you aren't drawn (the camera is inside you)
// WASD moves relative to the camera in all three. Mouse look (Z): the pointer is
// locked and the mouse turns the camera; a crosshair picks what a click uses. Walls between the camera and you
// turn see-through (the iso view's "wall-down", in 3D).

// (the elevators and the staircases are drawn by Lifts3 / Stairs3, not with the floor's things)
const noLifts = (objects: WorldObjectDef[]): WorldObjectDef[] =>
  objects.filter((o) => o.kind !== "elevator" && o.kind !== "stairs");

export type CamMode = "chase" | "free" | "first";

// Someone to draw: what the server sends for a person (8 facings `d`; `a` 0
// idle, 1 walk, 2 sit). `angle`: your own facing, free (radians) — others turn
// between their 8. `npc`: Vortex.
// The eyes' dip as the knees load up for a jump and soak up its landing
function jumpDip(b: Body3): number {
  const a = b.a === 2 ? null : b.jump;
  if (a?.stage === "crouch") return -0.16 * Math.sin((a.k * Math.PI) / 2);
  if (a?.stage === "land") return -0.2 * Math.sin(Math.min(1, a.k * 1.6) * Math.PI) * (1 - a.k * 0.4);
  return 0;
}

export type Body3 = Omit<PersonIn, "angle"> & {
  id: string;
  d: number;
  level?: number; // the floor they're on (shared levels.ts; their x / y are that floor's)
  angle?: number;
  mic?: boolean;
  bot?: boolean;
};

export interface ViewOpts {
  themes: Themes; // the themes chunk (the sky, trees), shared with iso
  keys?: boolean; // its own keyboard (the demo); the live world reads keys itself
  tags?: boolean; // name tags over heads (default on)
  level?: number; // the floor to show (shared levels.ts; default: the map's own)
}

// Clicks: on the floor (tiles) or on someone (their id, where on the page).
export interface ViewEvents {
  floor?: (x: number, y: number, mods?: { shift: boolean; right: boolean }) => void;
  toy?: (id: string) => void; // a pet's toy on the floor
  // build mode: the floor under the pointer as it moves / presses / lets go; the wheel
  buildMove?: (x: number, y: number, client: { x: number; y: number }) => void;
  buildDown?: (x: number, y: number) => void;
  buildUp?: (x: number, y: number) => void;
  wheel?: (dy: number) => boolean;
  person?: (id: string, at: { x: number; y: number }) => void;
  object?: (id: string, at: { x: number; y: number }) => void;
  // mouse look on / off (the pointer locked or let go — by Z, Esc, the browser…)
  look?: (on: boolean) => void;
  lookRefused?: () => void; // the browser said no (right after Esc it waits a moment)
  // in mouse look: what the crosshair is on (someone, a thing to use), or null
  aim?: (at: { person?: string; object?: string } | null) => void;
}

const LAMPS = 10; // point lights in the pool (the nearest lamps get them)
const LAMP_REACH = 16; // tiles from the camera's target a lamp gets one within
// the Grounds' lamps after dark (docs/plan/27, the night): how high the head
// hangs (tiles over the ground), how far and how hard it lights; the pool's
// lights reach further out there (the road ahead lit, lamp to lamp)
const GROUND_LAMP: Record<string, { h: number; radius: number; intensity: number }> = {
  cobra: { h: 8.4, radius: 15, intensity: 26 },
  town: { h: 4.4, radius: 10, intensity: 11 },
  lone: { h: 4.4, radius: 10, intensity: 11 },
  porch: { h: 2.2, radius: 6, intensity: 4 },
};
// a flare burning on the snow (docs/plan/30-the-dark.md D6), lighting like a ground lamp, red
const FLARE_LAMP = { h: 0.5, radius: 8, intensity: 6 };
// one of the shadowed shot down: the shot's flash through it, then the light it burns away in
const DEATH_LAMP = { h: 1.1, radius: 9, intensity: 8 };
const GROUND_REACH = 44;
const GROUND_POOL = 4; // their own point lights (High; fewer below)
// the phones' flashlights: spot lights (always there, dark when off: no shader
// changes), mine and the nearest other's; a beam you see in the snow and fog
const TORCHES = 2;
const PREP_LAYER = 30; // (things compiling: no camera draws it)
// the cone's mesh is built wide (shared beam.ts BEAM.wide) and scaled down to a focused one
const BEAM_LEN = BEAM.wide.len;
const BEAM_HALF = BEAM.wide.half;
const FOCUS_ALONG = BEAM.focus.len / BEAM_LEN;
const FOCUS_ACROSS = (Math.tan(BEAM.focus.half) * BEAM.focus.len) / (Math.tan(BEAM_HALF) * BEAM_LEN);
const LAMP_FADE = 4; // …fading out over the last few
const LAMP_GLOW = 3.5; // how strongly a lamp post's pool lights what's under it at night
const CAM_ROOM = 2.2; // the least room in front of a wall for the camera to stand there (else it rises)
const CAM_LIFT_MAX = 1.3; // …up to this pitch
const EYE = 1.15; // tiles: what the camera looks at, above your feet
// first person: where your eyes are (the name tag sits at 2.0 / 1.45)
const EYE_1P = 1.7;
const EYE_1P_SEATED = 1.2;
const FOV = 50;

const LIMITS: Record<CamMode, { pitch: [number, number]; dist: [number, number] }> = {
  chase: { pitch: [0.35, 1.0], dist: [2.6, 9] },
  free: { pitch: [-0.12, 1.45], dist: [1.2, 14] },
  first: { pitch: [-1.25, 1.25], dist: [0, 0] },
};

// the stairwells' tiles as a signature (a floor rebuilt when they change)
const wellsKey = (w: { floor: Set<string>; ceiling: Set<string> }) =>
  `${[...w.floor].sort().join(";")}/${[...w.ceiling].sort().join(";")}`;

export class ThirdPersonView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  // (near 0.1, not less: the depth buffer's precision is spent near the camera,
  // and faces a hair apart far off would flicker — see kit3d Layers)
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 200);
  world: World3;
  events: ViewEvents = {};
  // The building (shared levels.ts): its home map, the floor I'm on (`map`: it,
  // drawn at the origin, in its own coords) and the floors below it, drawn
  // where they are in the building (seen down a stairwell, out of a window);
  // the floors above aren't drawn (the Sims rule), the campus moves to match.
  map: MapDef;
  building: MapDef;
  level: number;
  // every floor built so far (mine is `world`); `lit`: the light map its things take
  private floors = new Map<number, { world: World3; sig: string; lit?: Light3 }>();
  // the floors drawn below mine: each its own light map, so they take the hour too
  private below = new Map<number, Light3>();
  private wellSig = "";
  private people = new Map<string, Person3>();
  // the 3D people (world/chars): a model each, built a few a frame; the
  // drawing above stands in until a person's model is ready (and for Vortex)
  private people3 = new Map<string, Person3D>();
  private charF: InstanceType<NonNullable<ReturnType<typeof chars>>["CharFactory"]> | null = null;
  private charMats: CharMats | null = null;
  private propMats = new Map<string, Material>();
  charsChunk = "";
  // first person: my own arms when they're doing something (hands1p.ts; Settings can turn them off)
  private hands: Hands1P | null = null;
  handsOn = true;
  // pets: real models (art/pets3d.ts), lit by the room, turned to where they walk
  private pets3 = new Map<string, { model: PetModel; key: string; turned: number }>();
  private hemi = new HemisphereLight(0xffffff, 0x6b4a33, 1);
  private sun = new DirectionalLight(0xffffff, 2);
  private pool: PointLight[] = [];
  private groundPool: PointLight[] = []; // the Grounds' lamps (groundLamps)
  private around: Surroundings;
  private host: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private tagLayer: HTMLDivElement | null = null;
  private tagEls = new Map<string, Tag>();
  private ray = new Raycaster();
  private live = new LiveSurfaces();
  private light = new Light3();
  private post: Post3 | null = null;
  quality: "high" | "medium" | "low" = "high";
  private lamps = LAMPS;
  private nightLevel = 0;
  fps = 60; // measured (auto quality steps down on it)
  private lastFrameAt = 0;
  // on the floor, as in iso: the nearest usable thing's outline, where you
  // clicked to walk, how far your voice carries
  private highlight: Mesh;
  private highlightLine: LineLoop;
  private marker: Mesh;
  private markerAt: { x: number; y: number; t: number } | null = null;
  private earshotRing: LineSegments;
  earshot = 0; // tiles (0 = off)
  private meAt = { x: 0, y: 0 };

  mode: CamMode = "chase";
  yaw = -Math.PI * 0.75; // looking where the iso camera looks
  pitch = 0.62;
  dist = 5.4;
  lean = 0.55; // how far people's drawings tip back towards a camera looking down
  hour = 12;
  private target = new Vector3();
  private targetReady = false;
  padFree = true; // the gamepad moves me and the camera (not while it plays a console)
  private walkAt = { x: 0, y: 0 }; // where I was last frame (the chase camera follows where I go)
  /** aiming (docs/plan/29-the-move.md M5): over the shoulder (`shoulder` 1 the right, -1 the left) */
  aim = false;
  /** a gun in my hand (the right button aims, not a thing's menu; the left fires, not picks) */
  armed = false;
  shoulder = 1;
  private aimK = 0;
  /** where I aim, up from level (radians): from the flashlight in my hand to what the crosshair is
   *  on (aimFrame), else from the camera's pitch */
  get aimPitch(): number {
    return this.aimOn ? this.aimUp : Math.max(-0.9, Math.min(0.9, -(this.pitch - 0.2)));
  }
  /** where I look round (radians): aiming, turned a little so the flashlight's line meets the
   *  crosshair's (Alan Wake's: the light where the reticle is) */
  get lookYaw(): number {
    return this.yaw + (this.aimOn ? this.aimTurn : 0);
  }
  private aimOn = false;
  private aimTurn = 0;
  private aimUp = 0;
  private aimDir = new Vector3();
  private aimHit = new Vector3(); // what the crosshair is on (the view's coords), aiming
  private aheadFor = 0; // s I've been going roughly where it looks
  private eyeY = EYE_1P; // first person: the eyes' height (eases sitting down / getting up)
  private meId = "";
  private dragged = -10; // time of the last manual turn
  activeAt = 0; // when the pointer or keys last did something here (performance.now)
  private time = 0;

  // input
  private keys = new Set<string>();
  private drag: { x: number; y: number; id: number; x0: number; y0: number; t: number } | null = null;
  private tint = new Color(1, 1, 1);
  private personTint = new Color(1, 1, 1);
  // the Grounds' mood (docs/plan/27): the weather, the flashlights, breath in the cold
  private storm = 0;
  private torch3: {
    spot: SpotLight;
    beam: Mesh;
    mat: ShaderMaterial;
    core: Mesh;
    coreMat: ShaderMaterial;
    glare: Sprite;
    on: Beam | null;
    /** whose it is this frame (another's: their focus as it is, not eased from the last one's) */
    who: string;
    /** how far into focus (0 … 1): `ramp` linear, `f` eased; when the focus last came on (s) */
    ramp: number;
    f: number;
    kickAt: number;
    /** what it throws: wide, and focused (the crisper) */
    wide: CanvasTexture;
    crisp: CanvasTexture;
  }[] = [];
  /** my torch's battery (0 … 100, the walker's vitals): low, it flickers */
  battery = 100;
  private lensAt = new Vector3();
  private breathAt = new Map<string, number>();
  private stormFog = new Color();
  /** The weather (shared weather.ts, eased by the controller). */
  setWeather(storm: number, wind: number) {
    this.storm = storm;
    this.around.setWeather(storm, wind);
  }
  private frustum = new Frustum();
  private projView = new Matrix4();
  private sphere = new Sphere(new Vector3(), 1.1);
  private tick = 0;
  private night = false;

  constructor(
    building: MapDef,
    objects: WorldObjectDef[],
    private P: People,
    private items: Items,
    private opts: ViewOpts,
  ) {
    this.building = building;
    this.level = opts.level ?? floorOf(building);
    const map = levelMap(building, this.level) ?? building;
    this.map = map;
    const all = objects;
    objects = onLevel(all, map);
    const wells = { floor: wellsOf(map, all), ceiling: wellsOf(map, all, "ceiling") };
    this.wellSig = wellsKey(wells);
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.localClippingEnabled = true; // (the building cut above my floor: campus.cutAbove)
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.light.update(map, objects);
    this.indexSeats(map, objects);
    this.world = new World3(
      items,
      map,
      noLifts(objects),
      this.renderer.capabilities.getMaxAnisotropy(),
      (m) => this.light.patch(m),
      wells,
    );
    this.scene.add(this.world.root);
    // a GPU reset (Chrome, mid-call) empties big canvases: draw the baked ones again
    this.renderer.domElement.addEventListener("webglcontextrestored", () => {
      this.world.rebakeFloor();
      this.light.setHour(this.hour);
      for (const l of this.below.values()) l.setHour(this.hour);
    });
    this.scene.add(this.hemi);
    this.lifts3 = new Lifts3(this.renderer);
    this.scene.add(this.lifts3.root, this.stairs3.root);
    // the stairwells and the elevators' landings take the hour as the rooms round
    // them do (the well is in the same place on every floor: my floor's light
    // map lights it); the cars have their own (lift3d.ts liftCarMats), lit
    for (const m of [...Object.values(stairMats()), ...Object.values(liftMats())])
      if (m instanceof MeshStandardMaterial) this.light.patch(m);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.camera.left = -14;
    s.shadow.camera.right = 14;
    s.shadow.camera.top = 14;
    s.shadow.camera.bottom = -14;
    s.shadow.camera.near = 1;
    s.shadow.camera.far = 70;
    // (the woods' near trees cast from their own layer: drawn for the shadow only)
    s.shadow.camera.layers.enable(CASTER_LAYER);
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.02;
    this.scene.add(s, s.target);
    for (let i = 0; i < LAMPS; i++) {
      const l = new PointLight(0xffd9a0, 0, 4, 1.4);
      this.pool.push(l);
      this.scene.add(l);
    }
    for (let i = 0; i < GROUND_POOL; i++) {
      const l = new PointLight(0xffd29a, 0, 4, 1.4);
      this.groundPool.push(l);
      this.scene.add(l);
    }
    // the flashlights: a spot each and its beam (a cone of light in the air,
    // brighter in the snow and fog), fading out along its length
    const fadeAlong = document.createElement("canvas");
    fadeAlong.width = 4;
    fadeAlong.height = 64;
    const fg = fadeAlong.getContext("2d") as CanvasRenderingContext2D;
    const grd = fg.createLinearGradient(0, 0, 0, 64);
    // (from nothing at the phone — the tip near the camera was a hard white blob — to its
    // brightest a little way out, then fading along its length)
    grd.addColorStop(0, "#000000");
    grd.addColorStop(0.09, "#ffffff");
    grd.addColorStop(0.35, "#6a6a6a");
    grd.addColorStop(1, "#000000");
    fg.fillStyle = grd;
    fg.fillRect(0, 0, 4, 64);
    const along = new CanvasTexture(fadeAlong);
    const cone = new ConeGeometry(Math.tan(BEAM_HALF) * BEAM_LEN, BEAM_LEN, 32, 1, true);
    cone.translate(0, -BEAM_LEN / 2, 0);
    cone.rotateX(-Math.PI / 2); // (its tip at the lens, opening along +z)
    // what a flashlight throws (the spot's map): a hot core, the reflector's ring round it, the
    // spill fading out — not a flat disc
    const throwCv = document.createElement("canvas");
    throwCv.width = throwCv.height = 128;
    const tc = throwCv.getContext("2d") as CanvasRenderingContext2D;
    const rg = tc.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, "#ffffff");
    rg.addColorStop(0.18, "#fffaf0");
    rg.addColorStop(0.3, "#b8b2a6");
    rg.addColorStop(0.4, "#d8d2c4");
    rg.addColorStop(0.46, "#8a857c");
    rg.addColorStop(0.75, "#2c2a27");
    rg.addColorStop(1, "#000000");
    tc.fillStyle = rg;
    tc.fillRect(0, 0, 128, 128);
    const throwMap = new CanvasTexture(throwCv);
    throwMap.colorSpace = SRGBColorSpace;
    // …and focused, a crisper one: a tight hot core, a thin ring, little spill (swapped in as the
    // focus comes on: one map for another, never none, so nothing recompiles)
    const crispCv = document.createElement("canvas");
    crispCv.width = crispCv.height = 128;
    const cc = crispCv.getContext("2d") as CanvasRenderingContext2D;
    const cg = cc.createRadialGradient(64, 64, 0, 64, 64, 64);
    cg.addColorStop(0, "#ffffff");
    cg.addColorStop(0.1, "#fffcf4");
    cg.addColorStop(0.22, "#c9c3b6");
    cg.addColorStop(0.3, "#9a948a");
    cg.addColorStop(0.34, "#e6dfd0");
    cg.addColorStop(0.38, "#6e6a62");
    cg.addColorStop(0.55, "#161514");
    cg.addColorStop(1, "#000000");
    cc.fillStyle = cg;
    cc.fillRect(0, 0, 128, 128);
    const crispMap = new CanvasTexture(crispCv);
    crispMap.colorSpace = SRGBColorSpace;
    // the glare of a lens looking at you
    const glareCv = document.createElement("canvas");
    glareCv.width = glareCv.height = 64;
    const gc = glareCv.getContext("2d") as CanvasRenderingContext2D;
    const gg = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
    gg.addColorStop(0, "rgba(255,255,255,1)");
    gg.addColorStop(0.12, "rgba(255,246,222,0.9)");
    gg.addColorStop(0.4, "rgba(255,226,170,0.22)");
    gg.addColorStop(1, "rgba(255,210,150,0)");
    gc.fillStyle = gg;
    gc.fillRect(0, 0, 64, 64);
    const glareMap = new CanvasTexture(glareCv);
    // the beam in the air: brightest along its middle, soft at its edges (seen side on, a cone's
    // skin fades out — no hard outline), fading along its length; motes drifting through it (snow,
    // dust: value noise in the world's coords, quicker in a storm); one program for the beam and
    // its hot core (`tight`: how fast its edges fall off)
    const beamVert = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
    const beamFrag = `uniform vec3 color; uniform float opacity; uniform sampler2D along;
uniform float time; uniform float storm; uniform float focus; uniform float tight;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0)), f.x), f.y),
    f.z);
}
void main() {
  float a = texture2D(along, vUv).r;
  float face = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(smoothstep(0.0, 0.7, face), tight);
  float sp = 0.35 + 1.4 * storm;
  vec3 drift = vec3(0.45 * storm + 0.08, 1.0, 0.25 * storm) * time * sp;
  float haze = 0.85 + 0.3 * noise(vW * 1.2 + drift * 0.6);
  // (only where the skin faces you: seen side on, a mote smears into a streak)
  float m = smoothstep(0.86, 0.98, noise(vW * 11.0 + drift * 3.0)) * smoothstep(0.4, 0.9, face);
  float motes = m * (0.4 + 1.4 * focus) * (0.8 + 0.6 * storm);
  gl_FragColor = vec4(color, a * edge * edge * opacity * (haze + motes));
}`;
    for (let i = 0; i < TORCHES; i++) {
      const spot = new SpotLight(0xfff1dc, 0, BEAM_LEN * 1.6, BEAM_HALF * 1.25, 0.55, 1.3);
      // (every torch has its map, always: a light's map coming or going recompiles every material)
      spot.map = throwMap;
      // (its shadows on High — setQuality — the first only: mine)
      spot.shadow.mapSize.set(512, 512);
      spot.shadow.camera.near = 0.05;
      spot.shadow.bias = -0.0015;
      spot.shadow.normalBias = 0.03;
      spot.shadow.autoUpdate = false;
      // (off: parked far under the ground, pointing down — at the origin with its
      // target there too its direction was NaN, and a NaN blacked out High's frame)
      spot.position.set(0, -500, 0);
      spot.target.position.set(0, -501, 0);
      this.scene.add(spot, spot.target);
      const beamMat = (color: number, tight: number) =>
        new ShaderMaterial({
          uniforms: {
            color: { value: new Color(color) },
            opacity: { value: 0 },
            along: { value: along },
            time: { value: 0 },
            storm: { value: 0 },
            focus: { value: 0 },
            tight: { value: tight },
          },
          vertexShader: beamVert,
          fragmentShader: beamFrag,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          side: DoubleSide,
          toneMapped: false,
        });
      const mat = beamMat(0xfff3e0, 1);
      const beam = new Mesh(cone, mat);
      beam.visible = false;
      beam.renderOrder = 4;
      this.scene.add(beam);
      // (its hot core: narrower, whiter, its edges falling off fast — there as it focuses)
      const coreMat = beamMat(0xffffff, 3);
      const core = new Mesh(cone, coreMat);
      core.visible = false;
      core.renderOrder = 4;
      this.scene.add(core);
      const glare = new Sprite(
        new SpriteMaterial({
          map: glareMap,
          color: 0xfff1d6,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          toneMapped: false,
        }),
      );
      glare.visible = false;
      glare.renderOrder = 5;
      this.scene.add(glare);
      this.torch3.push({
        spot,
        beam,
        mat,
        core,
        coreMat,
        glare,
        on: null,
        who: "",
        ramp: 0,
        f: 0,
        kickAt: -1,
        wide: throwMap,
        crisp: crispMap,
      });
    }
    // what the studio stands in (clouds / city / snow), the sky by the hour
    const home = onLevel(all, building);
    this.winSig = cutsSig(home);
    this.around = new Surroundings(building, opts.themes, wallCuts(home));
    this.prepareGrounds();
    this.scene.add(this.around.root);
    this.floors.set(this.level, { world: this.world, sig: `${layoutSig(map)}|${this.wellSig}`, lit: this.light });
    this.placeFloors(all);
    const fog = fogFor();
    this.scene.fog = new Fog(0xa8c8e0, fog.near, fog.far);
    this.camera.far = fog.cameraFar;
    this.camera.updateProjectionMatrix();
    // floor cues (amber, unlit, drawn over the floor)
    const amber = (o: number) =>
      new MeshBasicMaterial({ color: 0xffa630, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
    this.highlight = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), amber(0.12));
    this.highlightLine = new LineLoop(
      new BufferGeometry().setFromPoints([
        new Vector3(-0.5, 0, -0.5),
        new Vector3(0.5, 0, -0.5),
        new Vector3(0.5, 0, 0.5),
        new Vector3(-0.5, 0, 0.5),
      ]),
      new LineBasicMaterial({ color: 0xffa630, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.highlight.add(this.highlightLine);
    this.highlight.visible = false;
    this.highlight.renderOrder = 3;
    this.marker = new Mesh(new RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), amber(1));
    this.marker.visible = false;
    const dashes: Vector3[] = [];
    for (let i = 0; i < 44; i++) {
      const a0 = (i / 44) * Math.PI * 2;
      const a1 = ((i + 0.55) / 44) * Math.PI * 2;
      dashes.push(new Vector3(Math.cos(a0), 0, Math.sin(a0)), new Vector3(Math.cos(a1), 0, Math.sin(a1)));
    }
    this.earshotRing = new LineSegments(
      new BufferGeometry().setFromPoints(dashes),
      new LineBasicMaterial({
        color: 0xffb35c,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.earshotRing.visible = false;
    for (const o of [this.highlight, this.marker, this.earshotRing]) o.position.y = 0.012;
    this.builder = new BuildLayer(map);
    this.scene.add(this.highlight, this.marker, this.earshotRing, this.live.root, this.builder.root);
    this.setHour(12);
    this.setQuality("high");
  }

  // Little bursts, as iso's `puff`: warm sparks, confetti over a head (a card
  // done), a poof of dust, a drop. Tiny sprites with a bit of gravity.
  private fx: {
    s: Sprite;
    vx: number;
    vy: number;
    vz: number;
    t: number;
    life: number;
    g: number;
    drag?: number; // slowing (1/s): dust thrown out that hangs
    grow?: number; // its size at the end, times its first
    size?: number;
    op?: number; // its opacity, fresh (else 1, or 0.7 swelling)
  }[] = [];
  /** `lift`: px off the floor; `hard` (a jump's "land" / "kick"): how hard, 0..1 */
  puff(x: number, y: number, kind: PuffKind, lift = 0, hard = 1) {
    if (this.reduced) return;
    const z = zt(lift) + (kind === "land" || kind === "kick" ? 0.04 : 0);
    const add = (
      color: number,
      size: number,
      vx: number,
      vy: number,
      vz: number,
      life: number,
      g: number,
      h = z,
      more?: { drag: number; grow: number; opacity: number },
    ) => {
      const s = new Sprite(
        new SpriteMaterial({
          color,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          opacity: more?.opacity ?? 1,
        }),
      );
      s.scale.setScalar(size);
      s.position.set(x, h, y);
      this.scene.add(s);
      this.fx.push({ s, vx, vy, vz, t: 0, life, g, drag: more?.drag, grow: more?.grow, size });
    };
    const rnd = Math.random;
    if (kind === "land" || kind === "kick") {
      // a jump: a ring of dust thrown out low along the floor as it lands (a
      // little kicked back at take-off), slowing, swelling and drifting up
      const land = kind === "land";
      const n = Math.round((land ? 22 : 8) * (0.5 + hard / 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
        const sp = (land ? 2.2 : 1.1) * (0.5 + hard / 2) * (0.75 + rnd() * 0.5);
        add(
          rnd() < 0.5 ? 0xe6d6b4 : 0xcdb894,
          0.07 + rnd() * 0.05,
          Math.cos(a) * sp,
          Math.sin(a) * sp,
          0.25 + rnd() * 0.3,
          (land ? 0.6 : 0.4) + rnd() * 0.2,
          -0.3,
          z,
          { drag: 4.5, grow: 2.4, opacity: 0.7 },
        );
      }
      return;
    }
    if (kind === "spark")
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rnd() * 0.3;
        const sp = 1.1 * (0.6 + rnd() * 0.6);
        add(rnd() < 0.5 ? 0xffd27a : 0xfff1d0, 0.05, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + rnd(), 0.45, 4);
      }
    else if (kind === "confetti") {
      const colors = [0xffa630, 0xc4402b, 0x9aa67e, 0xf1e4cf, 0x6fa3b8, 0xffd27a];
      for (let i = 0; i < 36; i++) {
        const a = rnd() * Math.PI * 2;
        const sp = 0.4 + rnd() * 0.9;
        add(colors[i % colors.length], 0.06, Math.cos(a) * sp, Math.sin(a) * sp, 1.6 + rnd() * 1.2, 1.6, 2.2, 2.2);
      }
    } else
      for (let i = 0; i < (kind === "poof" ? 10 : 6); i++) {
        const a = (i / 8) * Math.PI * 2;
        add(0xd9cba9, kind === "poof" ? 0.16 : 0.08, Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.3, 0.6, 0.4, z + 0.05);
      }
  }
  private stepFx(dt: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      f.vz -= f.g * dt;
      if (f.drag) {
        const d = Math.max(0, 1 - f.drag * dt);
        f.vx *= d;
        f.vy *= d;
        f.vz *= d;
      }
      f.s.position.x += f.vx * dt;
      f.s.position.z += f.vy * dt;
      f.s.position.y = Math.max(0.01, f.s.position.y + f.vz * dt);
      if (f.grow && f.size) f.s.scale.setScalar(f.size * (1 + (f.grow - 1) * Math.min(1, f.t / f.life)));
      (f.s.material as SpriteMaterial).opacity =
        Math.max(0, Math.min(1, 1 - f.t / f.life)) * (f.op ?? (f.grow ? 0.7 : 1));
      if (f.t >= f.life) {
        this.scene.remove(f.s);
        (f.s.material as SpriteMaterial).dispose();
        this.fx.splice(i, 1);
      }
    }
  }
  private reduced = false;

  // The slot cars (each frame): a little 1:32 formula car per lane, in its colour.
  // A console's cable in my hands: from its back along the floor, up to my hand.
  private cable: Mesh | null = null;
  private cableKey = "";
  // The game room: cables, pads (by their consoles or in hands), power LEDs —
  // drawn once the people are placed (held pads go where their hands are).
  private games3: GamesIn3D | null = null;
  private gameScene: GameScene3 | null = null;
  setGames(s: GameScene3 | null) {
    this.gameScene = s;
    if (s && !this.games3) {
      this.games3 = new GamesIn3D((m) => this.light.patch(m));
      this.scene.add(this.games3.root);
    }
    if (this.games3) this.games3.root.visible = !!s;
  }
  // in front of someone's drawing, towards the camera, a little to the left
  // (pad 1) or right (pad 2), at hand height
  private handOf(id: string, port: number, sitting: boolean): Vector3 | null {
    // a 3D person holds it in their hands
    const p3 = this.people3.get(id);
    if (p3?.ready && p3.root.visible) return p3.hand("L").add(p3.hand("R")).multiplyScalar(0.5);
    const p = this.people.get(id);
    if (!p?.root.visible) return null;
    const at = p.root.position;
    const cam = this.camera.position;
    const d = Math.hypot(cam.x - at.x, cam.z - at.z) || 1;
    const tx = (cam.x - at.x) / d;
    const tz = (cam.z - at.z) / d;
    const side = port === 1 ? -0.07 : 0.07;
    return new Vector3(at.x + tx * 0.14 + tz * side, zt(sitting ? HAND_SIT : HAND_STAND), at.z + tz * 0.14 - tx * side);
  }

  setCable(ends: { from: { x: number; y: number }; to: { x: number; y: number } } | null) {
    const key = ends ? [ends.from.x, ends.from.y, ends.to.x, ends.to.y].map((n) => n.toFixed(2)).join() : "";
    if (key === this.cableKey) return;
    this.cableKey = key;
    if (!ends) {
      if (this.cable) this.cable.visible = false;
      return;
    }
    if (!this.cable) {
      const mat = new MeshLambertMaterial({ color: 0x15120f });
      this.light.patch(mat);
      this.cable = new Mesh(new BufferGeometry(), mat);
      this.cable.castShadow = true;
      this.scene.add(this.cable);
    }
    const { from: a, to: b } = ends;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // the hand: a little in front of me, on the console's side
    const hand = new Vector3(b.x - (dx / len) * 0.18, zt(30), b.y - (dy / len) * 0.18);
    const along = (t: number, h: number) => new Vector3(a.x + dx * t, h, a.y + dy * t);
    const pts = [new Vector3(a.x, 0.04, a.y), along(0.35, 0.015), along(0.75, 0.015), along(0.93, 0.18), hand];
    this.cable.geometry.dispose();
    this.cable.geometry = new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.016, 5);
    this.cable.visible = true;
  }

  // The game tables (Fita 13, tp/tables3d.ts): balls, cues, the lamp, rackets.
  private tables3: TablesIn3D | null = null;
  setTables(s: TableScene3 | null) {
    if (s && !this.tables3) {
      this.tables3 = new TablesIn3D((m) => this.light.patch(m));
      this.scene.add(this.tables3.root);
    }
    if (this.tables3) {
      this.tables3.root.visible = !!s;
      if (s) this.tables3.sync(s);
    }
  }
  // A game camera (playing at a table): where to look from and at, world tiles
  // (z = height in tiles). The chase camera eases over to it and back.
  // (the phone's camera uses it too: `showMe` keeps you drawn — a selfie —
  // and `fov` is the lens)
  // (`snap`: no easing once it's over — a car's camera, which moves on its own)
  gameCam: {
    eye: [number, number, number];
    look: [number, number, number];
    showMe?: boolean;
    fov?: number;
    snap?: boolean;
  } | null = null;
  private gcEye = new Vector3();
  private gcLook = new Vector3();
  private gcMix = 0; // 0 = the usual camera, 1 = the game's
  private gcReady = false;

  private cars: Group[] = [];
  setCars(list: { x: number; y: number; z: number; h: number; color: number; tilt: number }[]) {
    while (this.cars.length < list.length) {
      const g = new Group();
      const body = new MeshLambertMaterial({ color: 0xc4402b });
      this.light.patch(body);
      const dark = new MeshLambertMaterial({ color: 0x1c1a17 });
      const part = (w: number, h: number, d: number, x: number, y: number, m: Material) => {
        const mesh = new Mesh(new BoxGeometry(w, h, d), m);
        mesh.position.set(x, y + h / 2, 0);
        mesh.castShadow = true;
        g.add(mesh);
      };
      part(0.26, 0.035, 0.07, 0, 0, body); // the tub
      part(0.07, 0.03, 0.05, -0.02, 0.035, dark); // the cockpit
      part(0.05, 0.012, 0.13, 0.125, 0, body); // front wing
      part(0.04, 0.03, 0.12, -0.12, 0.04, body); // rear wing
      for (const [x, z] of [
        [0.08, 0.055],
        [0.08, -0.055],
        [-0.08, 0.055],
        [-0.08, -0.055],
      ]) {
        const wheel = new Mesh(new BoxGeometry(0.05, 0.04, 0.025), dark);
        wheel.position.set(x, 0.02, z);
        g.add(wheel);
      }
      g.userData.body = body;
      this.scene.add(g);
      this.cars.push(g);
    }
    this.cars.forEach((g, i) => {
      const c = list[i];
      g.visible = !!c;
      if (!c) return;
      g.position.set(c.x, zt(c.z), c.y);
      g.rotation.set(c.tilt * 0.25, -c.h, 0, "YXZ");
      (g.userData.body as MeshLambertMaterial).color.setHex(c.color);
    });
  }

  // What's on every screen, board and whiteboard right now, from where the
  // live world keeps them (each frame).
  private feed = new LiveFeed();
  setLiveFrom(src: LiveSources) {
    this.setLive(this.feed.collect(src));
  }

  // What's on every screen, board and whiteboard right now (each frame).
  setLive(list: Live[]) {
    const cam = this.camera.position;
    this.live.set(list, cam.x, cam.z, this.tint, (x, y) => this.wallAlphaAt(x, y));
  }

  // how faded the wall run at a point is (1 = standing): pictures on it fade with it
  private wallAlphaAt(x: number, y: number): number {
    let a = 1;
    for (const f of this.world.fades)
      if (!f.item && f.alpha < a && x >= f.x0 - 0.3 && x <= f.x1 + 0.3 && y >= f.y0 - 0.3 && y <= f.y1 + 0.3)
        a = f.alpha;
    return a;
  }

  // The nearest usable thing (iso's "press E" outline): its footprint, or null.
  setHighlight(r: { x: number; y: number; w: number; h: number } | null) {
    this.highlight.visible = !!r;
    if (!r) return;
    this.highlight.position.set(r.x + r.w / 2, 0.012, r.y + r.h / 2);
    this.highlight.scale.set(r.w, 1, r.h);
  }

  // Where you clicked to walk: an amber ring that opens and fades.
  showMarker(x: number, y: number) {
    this.markerAt = { x, y, t: 0 };
  }

  private drawCues(dt: number, reduced: boolean) {
    const pulse = reduced ? 0.7 : 0.55 + Math.sin(this.time * 5) * 0.25;
    (this.highlightLine.material as LineBasicMaterial).opacity = pulse;
    const m = this.markerAt;
    if (m) {
      m.t += dt;
      const r = 0.15 + m.t * 0.55;
      this.marker.visible = m.t < 0.9;
      this.marker.position.set(m.x, 0.012, m.y);
      this.marker.scale.set(r, 1, r);
      (this.marker.material as MeshBasicMaterial).opacity = Math.max(0, 1 - m.t / 0.9);
      if (m.t >= 0.9) this.markerAt = null;
    }
    const e = this.earshotRing;
    e.visible = this.earshot > 0;
    if (e.visible) {
      e.position.set(this.meAt.x, 0.012, this.meAt.y);
      e.scale.set(this.earshot, 1, this.earshot);
      e.rotation.y = reduced ? 0 : -this.time * 0.08 * ((Math.PI * 2) / 44); // turning slowly, as in iso
    }
  }

  mount(host: HTMLElement) {
    this.host = host;
    const c = this.renderer.domElement;
    c.style.display = "block";
    c.style.touchAction = "none";
    host.appendChild(c);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", this.noMenu);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("pointerlockerror", this.onLockError);
    const x = document.createElement("div");
    x.style.cssText =
      "position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;" +
      "background:#f6eedb;box-shadow:0 0 0 1.5px rgba(26,16,10,.75);pointer-events:none;display:none;" +
      "transition:transform .12s,background .12s";
    host.appendChild(x);
    this.crosshair = x;
    if (this.opts.keys !== false) {
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("keyup", this.onKey);
      window.addEventListener("blur", this.onBlur);
    }
    if (this.opts.tags !== false) {
      const t = document.createElement("div");
      t.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
      host.appendChild(t);
      this.tagLayer = t;
    }
  }

  // The room as it is now: a new layout builds it all again; otherwise only
  // the areas whose things changed are redrawn (cheap: call it often).
  // `building`: the home map with every floor; `objects`: everything on every
  // floor; `level`: the floor I'm on.
  update(building: MapDef, objects: WorldObjectDef[], level = this.level) {
    const map = levelMap(building, level) ?? building;
    const moved = level !== this.level;
    const from = this.level;
    this.building = building;
    this.level = level;
    const all = objects;
    this.allObjects = all;
    objects = onLevel(all, map);
    const wells = { floor: wellsOf(map, all), ceiling: wellsOf(map, all, "ceiling") };
    const wellSig = wellsKey(wells);
    this.light.update(map, objects);
    this.indexSeats(map, objects);
    const home = onLevel(all, building);
    const winSig = cutsSig(home);
    // my floor: kept from before (every floor is built once and kept — going
    // up or down only moves and shows them), built again when its layout changed
    const sig = `${layoutSig(map)}|${wellSig}`;
    let mine = this.floors.get(level);
    if (mine && mine.sig !== sig) {
      this.scene.remove(mine.world.root);
      mine.world.dispose();
      mine = undefined;
    }
    if (!mine) {
      const world = new World3(
        this.items,
        map,
        noLifts(objects),
        this.renderer.capabilities.getMaxAnisotropy(),
        (m) => this.light.patch(m),
        wells,
      );
      mine = { world, sig, lit: this.light };
      this.floors.set(level, mine);
      this.scene.add(world.root);
    } else mine.world.update(noLifts(objects));
    if (moved) this.cameraAcross(from);
    const changed = mine.world !== this.world || layoutSig(map) !== layoutSig(this.map);
    if (mine.world !== this.world) {
      // (the floor I left takes its own light map below mine: placeFloors)
      if (mine.lit !== this.light) mine.world.setLight((m) => this.light.patch(m));
      mine.lit = this.light;
      this.world = mine.world;
    }
    this.map = map;
    this.wellSig = wellSig;
    this.placeFloors(all);
    // the campus is built once: only the studio's windows change it
    if (winSig !== this.winSig) this.surround(building, home);
    this.winSig = winSig;
    if (!changed && !moved) return;
    this.builder.setMap(map);
    const fog = fogFor();
    (this.scene.fog as Fog).near = fog.near;
    (this.scene.fog as Fog).far = fog.far;
    this.camera.far = fog.cameraFar;
    this.camera.updateProjectionMatrix();
    this.setHour(this.hour); // (the new room's glass, the new sky)
  }

  // what the studio stands in, again (a new layout, or the windows changed)
  private winSig = "";
  private surround(building: MapDef, home: WorldObjectDef[]) {
    this.scene.remove(this.around.root);
    this.around.dispose();
    this.around = new Surroundings(building, this.opts.themes, wallCuts(home));
    this.prepareGrounds();
    this.scene.add(this.around.root);
    this.placeAround();
    this.setHour(this.hour);
  }

  // Where floor `level` is from mine: its corner and its height.
  private offsetTo(level: number): { x: number; y: number; h: number } {
    const a = offsetOf(this.building, level);
    const b = offsetOf(this.building, this.level);
    return { x: a.x - b.x, y: a.y - b.y, h: elevOf(level) - elevOf(this.level) };
  }

  // Every floor kept built (`floors`): mine at the origin, the ones below where
  // they are from it, the ones above hidden (the Sims rule). A floor below is
  // built the first time it's needed (or again when its layout changed); one
  // above that was built stays, hidden, for when I go up.
  private placeFloors(all: WorldObjectDef[]) {
    const have = new Set(floorsOf(this.building));
    for (const [f, b] of this.floors)
      if (!have.has(f)) {
        this.scene.remove(b.world.root);
        b.world.dispose();
        this.floors.delete(f);
        this.below.get(f)?.dispose();
        this.below.delete(f);
      }
    for (const f of have) {
      if (f === this.level) {
        const b = this.floors.get(f);
        if (b) {
          b.world.root.visible = true;
          b.world.root.position.set(0, 0, 0);
        }
        continue;
      }
      let b = this.floors.get(f);
      if (f > this.level) {
        if (b) b.world.root.visible = false;
        continue;
      }
      const lm = levelMap(this.building, f);
      if (!lm) continue;
      const objs = onLevel(all, lm);
      const wells = { floor: wellsOf(lm, all), ceiling: wellsOf(lm, all, "ceiling") };
      const sig = `${layoutSig(lm)}|${wellsKey(wells)}`;
      if (b && b.sig !== sig) {
        this.scene.remove(b.world.root);
        b.world.dispose();
        b = undefined;
      }
      const o = this.offsetTo(f);
      const lit = this.belowLight(f, lm, objs);
      lit.setOffset(o.x, o.y);
      if (!b) {
        const world = new World3(
          this.items,
          lm,
          noLifts(objs),
          this.renderer.capabilities.getMaxAnisotropy(),
          (m) => lit.patch(m),
          wells,
        );
        b = { world, sig, lit };
        this.floors.set(f, b);
        this.scene.add(world.root);
      } else b.world.update(noLifts(objs));
      if (b.lit !== lit) {
        b.world.setLight((m) => lit.patch(m));
        b.lit = lit;
      }
      b.world.root.position.set(o.x, o.h, o.y);
      b.world.root.visible = true;
    }
    this.placeAround();
  }

  // A floor below mine's light: baked from its own lamps and windows, at the hour.
  private belowLight(f: number, lm: MapDef, objs: WorldObjectDef[]): Light3 {
    let l = this.below.get(f);
    if (!l) {
      l = new Light3();
      l.setHour(this.hour); // (before the bake: it's composited at this hour)
      this.below.set(f, l);
    }
    l.update(lm, objs);
    return l;
  }

  // The elevators (tp/lift3d.ts): every stop's landing and car, drawn apart
  // from the floors' things and moved every frame from the shared motion —
  // `since`: when each stop's current phase was heard of (performance.now()).
  private lifts3: Lifts3 | null = null;
  private liftObjs: WorldObjectDef[] = [];
  private liftSince = new Map<string, number>();
  liftSway = 0; // (the car I'm riding: its sway, tiles)
  liftIn: string | null = null; // (the stop whose car I'm standing in, on my floor)
  setLifts(objects: WorldObjectDef[], since: Map<string, number>) {
    this.liftObjs = objects;
    this.liftSince = since;
  }
  private syncLifts(now: number) {
    if (!this.lifts3) return;
    const shafts = new Map<string, number[]>();
    for (const o of this.liftObjs) {
      const sh = String(o.props?.shaft ?? o.id);
      shafts.set(sh, [...(shafts.get(sh) ?? []), objLevel(o, this.building)]);
    }
    const stops: LiftStop3[] = [];
    for (const o of this.liftObjs) {
      const level = objLevel(o, this.building);
      const floors = [...(shafts.get(String(o.props?.shaft ?? o.id)) ?? [])].sort((a, b) => b - a).map(liftFloorName);
      const since = (now - (this.liftSince.get(o.id) ?? now)) / 1000;
      const motion = liftMotion(o, level, since);
      stops.push({
        o,
        off: this.offsetTo(level),
        motion,
        floors,
        floor: liftFloorName(level),
        mine: level === this.level,
        shown: level <= this.level, // (the floors above aren't drawn — kept, hidden)
        inside: level === this.level && o.id === this.liftIn,
        sway: level === this.level && motion.phase === "moving" ? this.liftSway : 0,
      });
    }
    this.lifts3.sync(stops);
  }

  // The staircases (tp/stairs3d.ts): each floor's stairwell, its fire doors
  // opening for whoever comes near (anyone on that floor, as drawn here)
  private stairs3 = new Stairs3();
  private syncStairs(dt: number, bodies: Body3[]) {
    const stops: StairStop3[] = [];
    for (const o of this.allObjects) {
      if (o.kind !== "stairs") continue;
      const level = objLevel(o, this.building);
      const off = this.offsetTo(level);
      stops.push({
        shown: level <= this.level,
        o,
        off,
        floor: liftFloorName(level),
        next: level === 0 ? tr("stairsSignGround") : tr("stairsSignFloor").replace("{n}", liftFloorName(level)),
        people: bodies.filter((b) => (b.level ?? this.level) === level).map((b) => ({ x: b.x, y: b.y })),
      });
    }
    this.stairs3.sync(stops, dt);
  }

  // The floors not built yet, built ahead in quiet moments (one at a time, a
  // little apart) and drawn once off screen — so their geometry and textures
  // are on the GPU and their shaders compiled before anyone goes there: a
  // floor change then only moves and shows what's ready.
  private allObjects: WorldObjectDef[] = [];
  private warmAt = 0;
  private cutWarm = false;
  private warmTarget: WebGLRenderTarget | null = null;
  private warmCam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private warmUp(now: number) {
    if (now < this.warmAt || !this.allObjects.length) return;
    // (not before the sun's shadow map is made: drawn without it — the warm-up
    // keeps it from updating — every lit thing's draw failed, a burst of GL errors)
    if (this.sun.castShadow && !this.sun.shadow.map) return;
    this.warmAt = now + 600;
    const f = floorsOf(this.building).find((l) => !this.floors.has(l));
    if (f === undefined) {
      // last: the building's glass cut above a floor (campus.cutAbove) — its
      // clipped shaders compiled too, before anyone first goes downstairs
      if (!this.cutWarm) {
        this.cutWarm = true;
        // every elevator and stairwell, every floor's, drawn once off screen
        this.lifts3?.showAll(true);
        this.stairs3.showAll(true);
        const hw = this.building.width;
        const hh = this.building.height;
        const c = this.warmCam;
        const r = Math.max(hw, hh) / 2 + 4;
        Object.assign(c, { left: -r, right: r, top: r, bottom: -r });
        const o = this.offsetTo(homeOf(this.building));
        c.position.set(o.x + hw / 2, o.h + 80, o.y + hh / 2);
        c.lookAt(o.x + hw / 2, o.h - 20, o.y + hh / 2);
        c.far = 400;
        c.updateProjectionMatrix();
        this.warmDraw(c);
        this.lifts3?.showAll(false);
        this.stairs3.showAll(false);
        this.around.campus.cutAbove(STOREY - 0.15);
        this.warmDraw(this.camera);
        this.around.campus.cutAbove(null);
      }
      return;
    }
    const lm = levelMap(this.building, f);
    if (!lm) {
      this.warmAt = Number.POSITIVE_INFINITY;
      return;
    }
    const all = this.allObjects;
    const wells = { floor: wellsOf(lm, all), ceiling: wellsOf(lm, all, "ceiling") };
    const objs = onLevel(all, lm);
    const o = this.offsetTo(f);
    const lit = this.belowLight(f, lm, objs);
    lit.setOffset(o.x, o.y);
    const world = new World3(
      this.items,
      lm,
      noLifts(objs),
      this.renderer.capabilities.getMaxAnisotropy(),
      (m) => lit.patch(m),
      wells,
    );
    this.floors.set(f, { world, sig: `${layoutSig(lm)}|${wellsKey(wells)}`, lit });
    this.scene.add(world.root);
    world.root.position.set(o.x, o.h, o.y);
    // drawn once, from above, all of it in view (warmDraw)
    const c = this.warmCam;
    const r = Math.max(lm.width, lm.height) / 2 + 2;
    c.left = -r;
    c.right = r;
    c.top = r;
    c.bottom = -r;
    c.position.set(o.x + lm.width / 2, o.h + 60, o.y + lm.height / 2);
    c.lookAt(o.x + lm.width / 2, o.h, o.y + lm.height / 2);
    c.updateProjectionMatrix();
    // (lit by a light map as every floor is, mine or one below: one set of shaders)
    this.warmDraw(c);
    // (shown only if it's below mine)
    world.root.visible = f < this.level;
  }

  // One draw of the warm-up, as the screen draws (so the shaders compiled are the
  // ones it uses): High into a tiny linear target, as its finish's buffer;
  // Medium and Low into one pixel of the screen itself — its tones and colours —
  // which the frame then draws over.
  private warmView = new Vector4();
  private warmDraw(cam: Camera) {
    const r = this.renderer;
    const shadows = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    if (this.post) {
      this.warmTarget ??= new WebGLRenderTarget(4, 4, { colorSpace: LinearSRGBColorSpace });
      r.setRenderTarget(this.warmTarget);
      r.render(this.scene, cam);
      r.setRenderTarget(null);
    } else {
      r.getViewport(this.warmView);
      r.setViewport(0, 0, 1, 1);
      r.setScissor(0, 0, 1, 1);
      r.setScissorTest(true);
      r.render(this.scene, cam);
      r.setScissorTest(false);
      r.setViewport(this.warmView);
    }
    r.shadowMap.autoUpdate = shadows;
  }

  // My floor changed: the scene now sits round the new one. Up or down the
  // stairs (`carryFrom` = the floor I came from) the camera keeps its place in
  // the building — shifted with it, no swoop; any other way (an elevator's
  // arrival, a teleport) it's simply there at once.
  carryFrom: number | null = null;
  private cameraAcross(from: number) {
    if (this.carryFrom === from) {
      const o = this.offsetTo(from);
      const d = new Vector3(o.x, o.h, o.y);
      this.target.add(d);
      this.camera.position.add(d);
      this.gcEye.add(d);
      this.gcLook.add(d);
    } else {
      this.targetReady = false;
      this.gcReady = false;
    }
    this.carryFrom = null;
  }

  // Am I in the building (on its footprint) on a floor under the studio? Then
  // the floors above me aren't drawn, and neither is the building's glass up there.
  private insideBelowHome(me: { x: number; y: number } | undefined): boolean {
    const home = homeOf(this.building);
    if (!me || this.level >= home) return false;
    const h = across(this.building, this.level, home, me);
    return isFloor(tileAt(this.building, Math.floor(h.x), Math.floor(h.y)));
  }

  // The campus is built in the home floor's coords, its ground STOREYs below it.
  private placeAround() {
    const home = homeOf(this.building);
    const o = this.offsetTo(home);
    // (its snow a little under the ground floor's: what it lays on the snow —
    // shadows, slush, light — stays clear of the floor's own surface, or the
    // two fight over the same depth and flicker)
    this.around.campus.root.position.set(o.x, o.h - (home > 0 ? 0.05 : 0), o.y);
    this.around.campus.skinAlways = this.level < home;
  }

  private resize() {
    if (!this.host) return;
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    chars()?.inkResolution(w, h);
  }

  // High: shadows in detail, bloom and the finish; Medium: softer shadows, no
  // finish; Low: no shadows, fewer lamps, 1× pixels.
  setQuality(q: "high" | "medium" | "low") {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === "high" ? Math.min(2, dpr) : q === "medium" ? Math.min(1.5, dpr) : 1);
    this.sun.castShadow = q !== "low";
    const size = q === "high" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.lamps = q === "high" ? LAMPS : q === "medium" ? 6 : 3;
    // the first flashlight (mine) throws shadows on High — its shadow map drawn once now, so it's
    // there even while it's off (a shadow-casting light with no map yet: every lit draw failed —
    // "mismatch between texture format and sampler type" — and only the ink was left)
    for (const [i, tc] of this.torch3.entries()) {
      tc.spot.castShadow = q === "high" && i === 0;
      if (tc.spot.castShadow) tc.spot.shadow.needsUpdate = true;
    }
    this.pool.forEach((l, i) => {
      l.visible = i < this.lamps;
    });
    if (q !== "low") {
      if (this.post && this.post.lite !== (q === "medium")) {
        this.post.dispose();
        this.post = null;
      }
      this.post ??= new Post3(this.renderer, this.scene, this.camera, q === "medium");
      this.post.setNight(this.nightLevel);
    } else {
      this.post?.dispose();
      this.post = null;
    }
    this.resize();
  }

  // A gun (docs/plan/32-the-arms.md): what mine is doing (world/dark/arms.ts sets it: my body's and
  // my hands' gun pose it), and a shot's kick on my look — most of it comes back by itself, the
  // rest is mine to pull down.
  myGun: GunFx | null = null;
  private kickIn = { up: 0, side: 0 }; // (rad, still to come)
  private kickOut = { up: 0, side: 0 }; // (rad, settling back)
  kick(up: number, side: number, settle: number) {
    this.kickIn.up += up;
    this.kickIn.side += side;
    this.kickOut.up += up * settle;
    this.kickOut.side += side * settle;
  }
  // Everyone else's gun (plan 32, phase 4): their shots' kicks (by id, this view's time), and what
  // their hands are doing, eased from what the server says (`arm`: drawing, reloading, open).
  private gunKicks = new Map<string, number>();
  private gunFxs = new Map<string, GunFx & { turnTo: number }>();
  /** Where someone's gun's muzzle is drawn (the floor's coords, z up) — mine in first person where
   *  my hands show it — or null: no gun drawn (the flash and the tracers come out of it). */
  muzzleOf(id: string): { x: number; y: number; z: number } | null {
    const v = new Vector3();
    // (first person: my body isn't drawn; my hands are, by their own lens — where the world's
    // camera would show that same spot)
    if (id === this.meId && this.mode === "first") {
      if (!this.hands?.muzzleFor(this.camera, v)) return null;
    } else if (!this.people3.get(id)?.gunMuzzle(v)) return null;
    return { x: v.x, y: v.z, z: v.y };
  }

  /** Someone else fired (`arms:shot`): their gun kicks, their hammer falls. */
  gunShot(id: string) {
    this.gunKicks.set(id, this.time);
    const f = this.gunFxs.get(id);
    if (f) f.turnTo += 1;
  }
  private otherGun(b: Body3, dt: number): GunFx | null {
    if (!b.gun) {
      this.gunFxs.delete(b.id);
      return null;
    }
    let f = this.gunFxs.get(b.id);
    if (!f) {
      f = { kick: 0, cock: 0, turn: 0, turnTo: 0, open: 0, loaded: 6, trigger: 0, reload: 0 };
      this.gunFxs.set(b.id, f);
    }
    const ease = (v: number, to: number, rate: number) => v + (to - v) * (1 - Math.exp(-dt * rate));
    const since = this.time - (this.gunKicks.get(b.id) ?? -9);
    const aiming = ((b.mv ?? 0) & MV_AIM) !== 0;
    const loading = b.arm === 2 || b.arm === 3;
    f.kick = since < 0.035 ? since / 0.035 : Math.exp(-(since - 0.035) * (b.gun === "shotgun" ? 9 : 13));
    f.cock = ease(f.cock, aiming && since > 0.12 ? 1 : 0, 18);
    f.turn = ease(f.turn, f.turnTo, 14);
    f.open = ease(f.open, loading ? 1 : 0, 12);
    f.reload = ease(f.reload, loading && !aiming ? 1 : 0, 8);
    f.trigger = since < 0.08 ? 1 : 0;
    return f;
  }

  /** How far down the sights (0..1), first person. */
  get ads(): number {
    return this.hands?.ads ?? 0;
  }
  private fov1p = FOV; // first person's own lens (the wheel zooms it), down the sights closer

  // The phone's camera in first person: its zoom (1 = the eye's lens). null lets go.
  lensFov: number | null = null;
  lens(zoom: number | null) {
    this.lensFov = zoom === null ? null : Math.max(14, FOV / zoom);
    if (zoom === null && this.mode !== "first") this.camera.fov = FOV;
  }

  // The frame as it is (the phone's camera): drawn now and copied in the same
  // task, so it's there without keeping the drawing buffer.
  snapshot(): HTMLCanvasElement | null {
    const tags = this.tagLayer?.style.display ?? "";
    if (this.post) this.post.render(false);
    else this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d");
    if (!g) return null;
    g.drawImage(src, 0, 0);
    if (this.tagLayer) this.tagLayer.style.display = tags;
    return c;
  }

  // Someone took a photo: the flash, at their hand.
  private flashes: { s: Sprite; t: number }[] = [];
  private flashTex: CanvasTexture | null = null;
  flash(id: string) {
    const p3 = this.people3.get(id);
    const p = this.people.get(id);
    if (!p && !p3?.ready) return;
    if (!this.flashTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.2, "rgba(255,250,235,.8)");
      r.addColorStop(1, "rgba(255,240,210,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      this.flashTex = new CanvasTexture(c);
    }
    const s = new Sprite(
      new SpriteMaterial({ map: this.flashTex, blending: AdditiveBlending, depthWrite: false, transparent: true }),
    );
    if (p3?.ready) s.position.copy(p3.hand("R"));
    else if (p) s.position.set(p.root.position.x, 1.5, p.root.position.z);
    s.scale.setScalar(0.2);
    s.renderOrder = 999;
    this.scene.add(s);
    this.flashes.push({ s, t: 0 });
  }
  private stepFlashes(dt: number) {
    for (const f of this.flashes) {
      f.t += dt;
      const k = f.t / 0.3;
      f.s.scale.setScalar(0.25 + k * 1.6);
      (f.s.material as SpriteMaterial).opacity = Math.max(0, 1 - k * k);
    }
    for (const f of this.flashes.filter((x) => x.t > 0.3)) {
      this.scene.remove(f.s);
      (f.s.material as SpriteMaterial).dispose();
    }
    this.flashes = this.flashes.filter((x) => x.t <= 0.3);
  }

  zoomBy(k: number) {
    // (first person: the lens, not the distance)
    if (this.mode === "first") {
      this.fov1p = Math.max(40, Math.min(80, this.fov1p * k));
      return;
    }
    this.dist *= k;
    this.clampCam();
  }

  setMode(m: CamMode) {
    if (m === this.mode) return;
    this.mode = m;
    this.showCrosshair();
    if (m !== "first" && this.camera.fov !== FOV) {
      this.camera.fov = FOV;
      this.camera.updateProjectionMatrix();
    }
    this.clampCam();
  }

  setHour(h: number) {
    this.hour = h;
    const d = daylight(h);
    const [ar, ag, ab] = d.ambient;
    this.night = d.night > 0.5;
    this.nightLevel = d.night;
    this.post?.setNight(d.night);
    // the sky (as in iso); far things fade into its horizon
    this.around.setDay(d);
    (this.scene.fog as Fog).color.copy(this.around.horizon);
    // the hour's colour comes from the light map (as in iso); these only give
    // things their shape: a neutral fill from above, warm from the floor…
    this.hemi.color.setRGB(1, 1, 1, SRGBColorSpace);
    this.hemi.groundColor.setRGB(0.62, 0.52, 0.44, SRGBColorSpace);
    this.hemi.intensity = 2.1;
    // …out under the open sky with the sun up, more sun and less fill
    // (light3d.ts): the rooms' even fill washed the sun's shadows off the lot
    // and the snow (by the sun's height: at dawn, less fill and a sun too low to
    // make up for it was a lot as dark as night)
    const up = Math.min(1, Math.max(0, (d.sun.elevation - 0.05) / 0.4));
    const k = up * up * (3 - 2 * up);
    litBalance.lmSunOut.value = 1 + 0.6 * k;
    litBalance.lmFillOut.value = 1 - 0.4 * k;
    // …and the lamp posts' pools come up after dark (light3d.ts: stored halved)
    litBalance.lmGlowK.value = 2 * LAMP_GLOW * Math.min(1, Math.max(0, (d.night - 0.1) / 0.4));
    // …and the sun's shadows (a soft moon at night)
    const [sr, sg, sb] = d.sun.color;
    this.sun.color.setRGB(sr, sg, sb, SRGBColorSpace);
    // (sun and moon blended round the horizon: the shadows turned over at once
    // when the sun went down, and came back as suddenly at dawn)
    const el = d.sun.elevation;
    const w = Math.min(1, Math.max(0, (el + 0.1) / 0.25));
    const sw = w * w * (3 - 2 * w);
    this.sun.intensity = 0.25 + (0.1 + 0.9 * Math.min(1, Math.max(0, el) * 1.6)) * sw;
    this.sun.userData.el = 0.9 + (Math.max(0.05, el) - 0.9) * sw;
    this.sun.userData.az = Math.PI * 0.6 + (d.sun.azimuth - Math.PI * 0.6) * sw;
    // people and paper pictures aren't lit: they take the light map's tint (per person, in frame)
    this.tint.setRGB(0.55 + 0.45 * ar, 0.55 + 0.45 * ag, 0.6 + 0.4 * ab);
    this.light.setHour(h);
    for (const l of this.below.values()) l.setHour(h);
    // glass (windows, glass walls and doors) shows the night outside: darker after dark
    const g = 1 - 0.62 * d.night;
    this.world.materials.clear.color.setRGB(g * 0.92, g * 0.95, g, SRGBColorSpace);
  }

  // Your input as a world direction (camera-relative) and whether you run.
  input(): { move: Point; run: boolean } {
    let f = 0;
    let r = 0;
    const k = this.keys;
    if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) r += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) r -= 1;
    let run = k.has("ShiftLeft") || k.has("ShiftRight");
    const pad = this.padFree ? activePad() : null;
    if (pad) {
      const [lx = 0, ly = 0] = pad.axes;
      if (Math.hypot(lx, ly) > 0.18) {
        r += lx;
        f -= ly;
      }
      if (pad.buttons[0]?.pressed || pad.buttons[10]?.pressed) run = true;
    }
    const len = Math.hypot(f, r);
    if (len > 1) {
      f /= len;
      r /= len;
    }
    return { move: this.relative(f, r), run };
  }

  // forward / right (as the camera looks) → a world direction
  relative(f: number, r: number): Point {
    const fx = Math.cos(this.yaw);
    const fy = Math.sin(this.yaw);
    return { x: fx * f - fy * r, y: fy * f + fx * r };
  }

  // Stereo pan of a sound at `src` for a listener at `ear`, as this camera sees
  // it (the iso view pans by screen x; here by the camera's right).
  /** Where the Grounds' coords (the building's) sit in my floor's 3D frame: the scene's x, z are
   *  theirs less (x, z); its height theirs plus y (docs/plan/28-the-car.md: the cars draw so). */
  groundsFrame(): { x: number; z: number; y: number; visible: boolean } {
    const off = offsetOf(this.building, this.level);
    return { x: off.x, z: off.y, y: elevOf(0) - elevOf(this.level), visible: !!this.around.grounds };
  }
  /** The element the view is drawn into (an overlay goes in it). */
  get hostEl(): HTMLElement | null {
    return this.host;
  }

  pan(ear: Point, src: Point): number {
    const rx = -Math.sin(this.yaw);
    const ry = Math.cos(this.yaw);
    return Math.max(-1, Math.min(1, ((src.x - ear.x) * rx + (src.y - ear.y) * ry) / 6));
  }

  // What seat is on each tile (its catalog kind): a sitter's hips rest at its
  // cushion's height.
  private seatKinds = new Map<number, string>();
  private indexSeats(map: MapDef, objects: WorldObjectDef[]) {
    this.seatKinds.clear();
    for (const o of objects) {
      if (!entry(o.kind).seat) continue;
      const { w, h } = placedFootprint(o);
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) this.seatKinds.set((o.y + dy) * map.width + o.x + dx, o.kind);
    }
  }

  // One frame: people from the world's bodies (`me` = whose camera this is).
  /** Bodies besides the room's people: the shadowed (world/dark, docs/plan/30-the-dark.md D5). */
  extraBodies: (() => Body3[]) | null = null;
  private shroud: Shroud3 | null = null;
  /** Who's down (crawling) and who's kneeling by them getting them up (world/dark says; D7). */
  downed = new Map<string, "down" | "kneel">();
  /** Flares burning (world/dark gives them: the floor's coords, feet z, s lit): a red ground lamp each. */
  flares: { x: number; y: number; z: number; t: number }[] = [];
  private deaths: { x: number; y: number; z: number; t: number }[] = [];
  private arms3: Arms3 | null = null;
  /** Shots, sparks, flares in the air and on the snow (tp/arms3d.ts), made when first wanted. */
  arms(): Arms3 {
    this.arms3 ??= new Arms3(this.scene);
    return this.arms3;
  }

  frame(dt: number, bodies: Body3[], meId: string) {
    this.time += dt;
    if (this.extraBodies) bodies = bodies.concat(this.extraBodies());
    this.warmUp(performance.now());
    this.syncLifts(performance.now());
    // everyone in my floor's frame: the floors below where they are, above not drawn
    bodies = bodies.flatMap((b) => {
      // (on the earbud — on a call, the phone put away: no phone in the hand, a bud in the ear)
      if (b.phone === "bud") b = { ...b, phone: "", bud: true };
      const l = b.level ?? this.level;
      const o = this.offsetTo(l);
      if (l === this.level) return [b];
      if (l > this.level) return [];
      return [{ ...b, x: b.x + o.x, y: b.y + o.y, z: (b.z ?? 0) + o.h, ground: (b.ground ?? 0) + o.h }];
    });
    const me = bodies.find((b) => b.id === meId);
    this.syncStairs(dt, bodies);
    const pad = this.padFree ? activePad() : null;
    // look around: Q / E, the right stick
    let turn = 0;
    if (this.opts.keys !== false) {
      if (this.keys.has("KeyQ")) turn -= 1;
      if (this.keys.has("KeyE")) turn += 1;
    }
    if (pad) {
      const [, , rx = 0, ry = 0] = pad.axes;
      if (Math.abs(rx) > 0.15) turn += rx;
      if (Math.abs(ry) > 0.15) this.pitch += ry * dt * 1.4;
    }
    if (turn) {
      this.yaw += turn * dt * 2.2;
      this.dragged = this.time;
    }
    // mouse look: the mouse aims the camera (no swinging in behind you)
    if (this.looking) {
      this.dragged = this.time;
      this.aimAt();
    }
    this.meId = meId;
    const first = this.mode === "first";
    if (me) {
      this.meAt = { x: me.x, y: me.y };
      // the chase camera swings in behind where you go — only going roughly ahead (within 25°
      // of where it looks) for a moment: on a diagonal, or across it, it holds still (it once
      // followed your facing there and spun you round in circles: docs/plan/29-the-move.md M5)
      const mx = me.x - this.walkAt.x;
      const my = me.y - this.walkAt.y;
      this.walkAt = { x: me.x, y: me.y };
      const step = Math.hypot(mx, my);
      const speed = step < 1 && dt > 0 ? step / dt : 0;
      const going = Math.atan2(my, mx);
      const off = Math.atan2(Math.sin(going - this.yaw), Math.cos(going - this.yaw));
      this.aheadFor = speed > 0.8 && Math.abs(off) < 0.44 ? this.aheadFor + dt : 0;
      if (this.mode === "chase" && !this.aim && this.aheadFor > 0.4 && this.time - this.dragged > 1.2)
        this.yaw += off * Math.min(1, dt * 1.4 * Math.min(1.6, speed / 4.2));
      if (first) {
        // in your head: exactly where you are, every frame (an eased position
        // floats); only the eyes' height eases, sitting down and getting up
        const eye = me.a === 2 ? EYE_1P_SEATED : EYE_1P;
        this.eyeY = this.targetReady ? this.eyeY + (eye - this.eyeY) * (1 - Math.exp(-dt * 8)) : eye;
        this.target.set(me.x, this.eyeY + (me.a === 2 ? 0 : (me.z ?? 0)) + jumpDip(me), me.y);
        this.targetReady = true;
      } else {
        const eye = me.a === 2 ? EYE - 0.3 : EYE;
        // up on something the camera's up there with you; in a jump it rides some of the
        // way (you see yourself go up)
        const ground = me.a === 2 ? 0 : (me.ground ?? 0);
        const want = new Vector3(me.x, eye + ground + ((me.a === 2 ? 0 : (me.z ?? 0)) - ground) * 0.55, me.y);
        if (!this.targetReady) {
          this.target.copy(want);
          this.targetReady = true;
        } else this.target.lerp(want, 1 - Math.exp(-dt * 12));
      }
    }
    this.aimK += ((this.aim && !first ? 1 : 0) - this.aimK) * (1 - Math.exp(-dt * 10));
    // (into an aim the camera comes up to look ahead, near level — not at the ground at your feet)
    // (third person only: in first person the look is the look — it kept pulling it back level)
    if (this.aim && !first && this.aimK < 0.95 && this.time - this.dragged > 0.3)
      this.pitch += (0.15 - this.pitch) * (1 - Math.exp(-dt * 10));
    // a shot's kick: up (pitch > 0 is down) and a little aside, fast; settling back slower
    const kin = 1 - Math.exp(-dt * 38);
    const kout = 1 - Math.exp(-dt * 7);
    const ku = this.kickIn.up * kin - this.kickOut.up * kout;
    const ks = this.kickIn.side * kin - this.kickOut.side * kout;
    this.kickIn.up *= 1 - kin;
    this.kickIn.side *= 1 - kin;
    this.kickOut.up *= 1 - kout;
    this.kickOut.side *= 1 - kout;
    this.pitch -= ku;
    this.yaw += ks;
    this.clampCam();
    const cp = Math.cos(this.pitch);
    const cam = this.camera.position;
    if (first) {
      // the camera is the eye point, looking along yaw / pitch (pitch > 0 = down, as the others)
      cam.copy(this.target);
      this.camera.lookAt(
        cam.x + Math.cos(this.yaw) * cp,
        cam.y - Math.sin(this.pitch),
        cam.z + Math.sin(this.yaw) * cp,
      );
    } else {
      const v = this.camView(dt);
      const vc = Math.cos(v.pitch);
      // aiming: closer, over a shoulder (our people's heads are big: 0.8 out), a little up
      const a = this.aimK;
      const d = v.dist + (Math.min(v.dist, 2.6) - v.dist) * a;
      const sx = -Math.sin(this.yaw) * 0.8 * this.shoulder * a;
      const sz = Math.cos(this.yaw) * 0.8 * this.shoulder * a;
      const up = 0.35 * a;
      cam.set(
        this.target.x - Math.cos(this.yaw) * d * vc + sx,
        this.target.y + up + Math.sin(v.pitch) * d,
        this.target.z - Math.sin(this.yaw) * d * vc + sz,
      );
      // (not under the ground I stand on: the floor's 0 indoors, the land's own height out on it —
      // the pond lies 1.7 down, and a floor-high limit there kept the camera from looking up)
      const floor = this.target.y - EYE;
      if (cam.y < floor + 0.25) cam.y = floor + 0.25;
      this.camera.lookAt(this.target.x + sx, this.target.y + up, this.target.z + sz);
    }
    this.aimFrame(dt, me);

    // a game camera: ease over to it (and back when it lets go)
    const gc = this.gameCam;
    this.gcMix += ((gc ? 1 : 0) - this.gcMix) * (1 - Math.exp(-dt * (gc?.snap ? 9 : 5)));
    if (gc?.snap && this.gcMix > 0.985) this.gcMix = 1;
    if (gc) {
      const k = this.gcReady && !gc.snap ? 1 - Math.exp(-dt * 7) : 1;
      this.gcEye.lerp(new Vector3(gc.eye[0], gc.eye[2], gc.eye[1]), k);
      this.gcLook.lerp(new Vector3(gc.look[0], gc.look[2], gc.look[1]), k);
      this.gcReady = true;
    } else if (this.gcMix < 0.002) this.gcReady = false;
    if (this.gcMix > 0.002 && this.gcReady) {
      const m = this.gcMix;
      const look = this.camera.getWorldDirection(new Vector3()).multiplyScalar(4).add(cam);
      cam.lerp(this.gcEye, m);
      this.camera.lookAt(look.lerp(this.gcLook, m));
    }
    // the lens: a game camera's own, or the photo zoom in first person
    const fov = gc?.fov ?? (first ? (this.lensFov ?? this.fov1p * (1 - 0.18 * this.ads)) : FOV - 8 * this.aimK);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 10));
      this.camera.updateProjectionMatrix();
    }

    this.reduced = !!me?.reduced;
    this.builder.sync(this.buildLook, this.world, dt);
    this.stepFx(dt);
    this.stepFlashes(dt);
    this.fadeWalls(dt);
    this.around.campus.cutAbove(this.insideBelowHome(me) ? STOREY - 0.15 : null);
    this.around.update(dt, this.camera.position, !me?.reduced, this.target);
    this.drawPrints(performance.now());
    this.drawCues(dt, !!me?.reduced);
    this.placeSun();
    this.assignLamps(dt);
    this.weatherFrame();
    if (!me?.reduced) this.breathe(bodies);

    // cards and people face back along the camera's view (all the same way)
    const face = this.yaw + Math.PI;
    for (const c of this.world.cards) c.rotation.y = Math.PI / 2 - face;
    for (const c of this.builder.ghostCards) c.rotation.y = Math.PI / 2 - face;

    // people (drawn again each frame only when on screen; far ones every third frame)
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(
      this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse),
    );
    this.tick++;
    const seen = new Set<string>();
    const seenPets = new Set<string>();
    let mySeat: string | undefined;
    for (const b of bodies) {
      if (b.pet) {
        seenPets.add(b.id);
        this.petFrame(b, dt);
        const pe = this.pets3.get(b.id);
        if (pe) pe.model.root.visible = !this.byLens(b);
        continue;
      }
      seen.add(b.id);
      const angle3 = b.angle ?? dirAngle(b.d);
      const hidden3 =
        ((first || (this.gameCam !== null && this.gcMix > 0.5 && !this.gameCam.showMe)) && b.id === meId) ||
        this.byLens(b);
      // a person in 3D (not Vortex: he's his drawing, exactly as in Yondra)
      const C = b.npc ? null : this.chars();
      if (C && this.charF && this.charMats) {
        let p3 = this.people3.get(b.id);
        if (!p3) {
          p3 = new Person3D(b.id, C, this.charF, this.charMats, { ...b, angle: angle3 });
          this.people3.set(b.id, p3);
          this.scene.add(p3.root);
        }
        this.sphere.center.set(b.x, 0.9, b.y);
        const seat3 = b.a === 2 ? this.seatKinds.get(Math.floor(b.y) * this.map.width + Math.floor(b.x)) : undefined;
        // (the shadowed: not there yet while the dark gathers, gone as it goes)
        const sh = b.shade;
        const shadeT = sh ? (performance.now() - sh.since) / 1000 : 0;
        const notThere =
          !!sh &&
          ((sh.state === "emerge" && shadeT < 0.6) ||
            (sh.state === "dissolve" && shadeT > (sh.killed ? 1.95 : 0.45)) ||
            (sh.fade ?? 1) < 0.5);
        p3.root.visible = !hidden3 && !notThere;
        if (b.id === meId) mySeat = seat3;
        p3.gunFx = b.id === meId ? this.myGun : this.otherGun(b, dt);
        p3.update({ ...b, angle: angle3, seat: seat3, down: this.downed.get(b.id) }, dt, {
          camX: cam.x,
          camZ: cam.z,
          onScreen:
            (!hidden3 && this.frustum.intersectsSphere(this.sphere)) ||
            (b.id === meId && first && this.handsOn && handsDoing(b) !== ""),
          lowQuality: this.quality === "low",
        });
        this.snowFall(b, p3, dt, hidden3);
        if (p3.ready) {
          // (its drawing stood in until now)
          const old = this.people.get(b.id);
          if (old) {
            this.scene.remove(old.root);
            old.dispose();
            this.people.delete(b.id);
          }
          continue;
        }
        p3.root.visible = false;
      }
      let p = this.people.get(b.id);
      if (!p) {
        p = new Person3(b.id, this.P);
        this.people.set(b.id, p);
        this.scene.add(p.root);
      }
      const angle = b.angle ?? dirAngle(b.d);
      this.personTint.setHex(this.light.tintAt(b.x, b.y));
      if (this.onLand(b.x, b.y)) this.landTint(b.x, b.y, this.personTint);
      this.sphere.center.set(b.x, 0.9, b.y);
      // first person: you aren't drawn (the camera is inside you); the rig
      // keeps stepping so the other cameras find you as you left them
      // (nor under a game camera: it stands where you'd block the table)
      const byLens = this.byLens(b);
      const hidden =
        ((first || (this.gameCam !== null && this.gcMix > 0.5 && !this.gameCam.showMe)) && b.id === meId) || byLens;
      p.root.visible = !hidden;
      const onScreen = !hidden && this.frustum.intersectsSphere(this.sphere);
      const near = Math.hypot(cam.x - b.x, cam.z - b.y) < 12;
      const redraw = onScreen && (near || (this.tick + hashId(b.id)) % 3 === 0);
      const seat = b.a === 2 ? this.seatKinds.get(Math.floor(b.y) * this.map.width + Math.floor(b.x)) : undefined;
      p.update(
        { ...b, angle, seat },
        dt,
        cam.x,
        cam.z,
        this.pitch,
        first ? 0 : this.lean, // (at eye level nobody tips back)
        this.personTint,
        this.night,
        face,
        redraw,
        cam,
      );
    }
    for (const [id, p] of this.people)
      if (!seen.has(id)) {
        this.scene.remove(p.root);
        p.dispose();
        this.people.delete(id);
      }
    for (const [id, p] of this.people3)
      if (!seen.has(id)) {
        p.dispose();
        this.people3.delete(id);
      }
    // the shadowed's shroud (tp/shroud3d.ts): their smoke, and embers where a beam burns them
    const shades = bodies.filter((b) => b.shade);
    const now3 = performance.now();
    this.deaths = [];
    for (const b of shades) {
      const sh = b.shade as NonNullable<Body3["shade"]>;
      const t = (now3 - sh.since) / 1000;
      if (sh.killed && sh.state === "dissolve" && t < 2) this.deaths.push({ x: b.x, y: b.y, z: b.z ?? 0, t });
    }
    if (shades.length || this.shroud) {
      this.shroud ??= new Shroud3(this.scene);
      const px = this.renderer.domElement.clientHeight / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
      this.shroud.update(
        shades.map((b) => {
          const sh = b.shade as NonNullable<Body3["shade"]>;
          return {
            id: b.id,
            x: b.x,
            y: b.y,
            z: b.z ?? 0,
            dark: sh.dark,
            state: sh.state,
            t: (now3 - sh.since) / 1000,
            burn: sh.burn ?? null,
            h: sh.state === "lurk" ? 0.95 : undefined,
            fade: sh.fade,
            killed: sh.killed,
          };
        }),
        this.camera,
        dt,
        this.nightLevel,
        1.8,
        px,
      );
    }
    if (this.arms3 || this.flares.length) this.arms().update(dt, this.flares);
    // first person: my hands, posed by my body's motion, framed in front of my eyes
    const C3 = this.chars();
    if (first && this.handsOn && me && !me.npc && C3 && this.charF && this.charMats && this.gcMix < 0.002) {
      const angle = me.angle ?? dirAngle(me.d);
      this.hands ??= new Hands1P(C3, this.charF, this.charMats, { ...me, angle });
      this.hands.gunFx = this.myGun;
      this.hands.update(
        { ...me, angle, seat: mySeat },
        this.people3.get(me.id)?.motionOut ?? null,
        dt,
        this.camera,
        this.pitch,
        // (a flip turns the body over: the hands drop out of view for it)
        this.lensFov !== null || (me.jump?.kind === "flip" && me.jump.stage === "air" && !me.reduced),
        this.quality === "low",
      );
    } else if (this.hands) {
      this.hands.dispose();
      this.hands = null;
    }
    // the flashlights: after the people and my hands (out of the lens in a hand where it is this frame)
    this.torches(bodies, meId, dt);
    // build what's waiting (nearest first), a few milliseconds a frame
    this.charF?.pump(4);
    for (const [id, e] of this.pets3)
      if (!seenPets.has(id)) {
        this.scene.remove(e.model.root);
        e.model.dispose();
        this.pets3.delete(id);
      }
    if (this.gameScene) this.games3?.set(this.gameScene, (id, port, sitting) => this.handOf(id, port, sitting), face);

    if (!document.hidden) {
      const hands = this.hands?.shown ? this.hands : null;
      if (this.post) this.post.render(dt > 0 && !me?.reduced, hands);
      else {
        this.renderer.render(this.scene, this.camera);
        if (hands) {
          // over the room, its depth cleared: the hands never sink into a wall or a desk
          this.renderer.autoClear = false;
          this.renderer.clearDepth();
          this.renderer.render(hands.scene, hands.camera);
          this.renderer.autoClear = true;
        }
      }
      this.drawTags(bodies);
    }
    const now = performance.now();
    if (this.lastFrameAt) this.fps += (1000 / Math.max(1, now - this.lastFrameAt) - this.fps) * 0.05;
    this.lastFrameAt = now;
  }

  // The 3D people's chunk, its factory and materials (lit by the room); null while it loads.
  private chars() {
    const C = chars();
    if (!C) {
      void loadChars();
      return null;
    }
    if (!this.charF) {
      this.charsChunk = C.CHARS_CHUNK;
      this.charF = new C.CharFactory();
      const body = new MeshBasicMaterial({ vertexColors: true });
      this.light.patch(body);
      const bodyAway = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
      this.light.patch(bodyAway);
      const prop = (color: string) => {
        let m = this.propMats.get(color);
        if (!m) {
          // ("vertex": its own colours, as the guns' models have — tp/guns3d.ts)
          const mat = new MeshBasicMaterial(color === "vertex" ? { vertexColors: true } : { color });
          this.light.patch(mat);
          // (an unskinned basic material has no objectNormal for the light map to read)
          const lit = mat.onBeforeCompile;
          mat.onBeforeCompile = (sh, r) => {
            lit.call(mat, sh, r);
            sh.vertexShader = sh.vertexShader.replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\n#if !defined( USE_ENVMAP ) && !defined( USE_SKINNING )\nvec3 objectNormal = vec3( normal );\n#endif",
            );
          };
          mat.customProgramCacheKey = () => "yutopia-lightmap-basic";
          m = mat;
          this.propMats.set(color, m);
        }
        return m;
      };
      this.charMats = {
        body,
        bodyAway,
        // (the shadowed: near black, the clothes' colours only hinted)
        shade: new MeshBasicMaterial({ vertexColors: true, color: 0x24262e }),
        shadeInk: C.inkMaterial("#050506"),
        ink: C.inkMaterial(),
        inkAway: C.inkMaterial("#151515", 0.55),
        prop,
        toy: (kind) => {
          const P = petsArt();
          return P ? P.toyMesh(kind, (c) => prop(`#${new Color(c).getHexString()}`)) : null;
        },
      };
      const r = this.renderer.domElement.getBoundingClientRect();
      C.inkResolution(r.width || 1, r.height || 1);
    }
    return C;
  }

  // A pet this frame: its model where it is, turned the way it walks (eased),
  // posed by what it's doing (its rig), looking at its owner.
  // under a game camera: someone (or a pet) standing right by it, in the way
  private byLens(b: { x: number; y: number; id?: string }): boolean {
    return (
      this.gameCam !== null &&
      !(this.gameCam.showMe && b.id === this.meId) &&
      this.gcMix > 0.5 &&
      Math.hypot(b.x - this.camera.position.x, b.y - this.camera.position.z) < 2.7
    );
  }

  private petFrame(b: Body3, dt: number) {
    const P = petsArt();
    const pet = b.pet;
    if (!pet) return;
    if (!P) {
      void loadPets();
      return;
    }
    const key = `${pet.species}|${JSON.stringify(pet.look)}|${JSON.stringify(pet.outfit)}|${b.name}`;
    let e = this.pets3.get(b.id);
    if (e && e.key !== key) {
      this.scene.remove(e.model.root);
      e.model.dispose();
      e = undefined;
    }
    if (!e) {
      const model = new P.PetModel(
        pet.species,
        pet.look,
        pet.outfit,
        (c, o) => {
          // toon-ramped, lit by the room's light map, with the rim light on top
          const m = P.petMaterial(c, o);
          this.light.patch(m);
          P.rimPatch(m);
          return m;
        },
        b.name,
      );
      this.scene.add(model.root);
      e = { model, key, turned: dirAngle(b.d) };
      this.pets3.set(b.id, e);
    }
    const angle = dirAngle(b.d);
    let d = angle - e.turned;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.turned += d * Math.min(1, dt * 9);
    const now = Date.now();
    const r = P.rigOf(
      {
        species: pet.species,
        a: b.a,
        mode: pet.mode,
        act: pet.act,
        actAt: pet.actAt,
        feeling: pet.feeling,
        hurtAt: pet.hurtAt,
        carry: pet.carry,
      },
      now,
    );
    // the head turns to its owner (never right round)
    let look = 0;
    if (pet.lookAt) {
      let rel = Math.atan2(pet.lookAt.y - b.y, pet.lookAt.x - b.x) - e.turned;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      look = Math.max(-1.1, Math.min(1.1, -rel));
    }
    e.model.pose(
      { kind: r.kind, t: r.t, face: r.face, look, carry: pet.carry ?? null, flash: r.flash },
      dt,
      performance.now(),
    );
    // (on a floor below mine: down there, its height is that floor's)
    const below = (b.level ?? this.level) !== this.level ? (b.z ?? 0) : 0;
    e.model.root.position.set(b.x, below, b.y);
    e.model.root.rotation.y -= e.turned;
    e.model.root.visible = true;
  }

  // Over heads, as in iso: the name tag (status dot, a slash when the mic is
  // off), the emote above it, chat bubbles above that. HTML over the canvas
  // (crisp at any distance), hidden behind standing walls and far away.
  // name tags off while a panel covers the world (they're HTML, above the canvas)
  tagsHidden = false;
  private drawTags(bodies: Body3[]) {
    const layer = this.tagLayer;
    if (!layer) return;
    const hide = this.tagsHidden ? "none" : "";
    if (layer.style.display !== hide) layer.style.display = hide;
    const cam = this.camera.position;
    const now = performance.now();
    const seen = new Set<string>();
    for (const b of bodies) {
      if (b.shade) continue; // (the shadowed have no names)
      seen.add(b.id);
      let t = this.tagEls.get(b.id);
      if (!t) {
        t = makeTag();
        layer.appendChild(t.root);
        this.tagEls.set(b.id, t);
      }
      if (t.name.textContent !== b.name) t.name.textContent = b.name;
      const dot = b.pet
        ? b.pet.look.color
        : b.npc
          ? "#c4402b"
          : b.status === "dnd"
            ? "#b5562f"
            : b.status === "away"
              ? "#8d877a"
              : "#6e7b3a";
      const muted = !b.mic && !b.npc && !b.bot && !b.pet;
      const dotKey = `${dot}|${muted}`;
      if (t.dotKey !== dotKey) {
        t.dotKey = dotKey;
        t.dot.style.background = dot;
        t.slash.style.display = muted ? "" : "none";
      }
      const emote =
        b.emote && ((EMOTES as readonly string[]).includes(b.emote) || (WANTS as readonly string[]).includes(b.emote))
          ? (b.emote as Emote | Want)
          : "";
      if (t.emoteKey !== emote) {
        t.emoteKey = emote;
        t.emote.style.display = emote ? "" : "none";
        if (emote) t.emote.src = emoteUrl(emote);
      }
      if (t.bubbleUntil && now > t.bubbleUntil) {
        t.bubbleUntil = 0;
        t.bubble.style.display = "none";
      }
      const p3 = this.people3.get(b.id);
      const h = b.pet
        ? (this.pets3.get(b.id)?.model.height ?? 0.8) + 0.18
        : p3?.ready
          ? p3.tagY()
          : b.npc
            ? 1.6
            : b.a === 2
              ? 1.45
              : 2.0;
      const far = Math.hypot(cam.x - b.x, cam.z - b.y) > 16;
      // (first person: nothing over your own head — the camera is in it)
      const mine = this.mode === "first" && b.id === this.meId;
      // (someone on a floor below: the floor's between us — no tag through it)
      const below = (b.level ?? this.level) !== this.level;
      const p = far || mine || below || this.hidden(b.x, b.y, h) ? null : this.project(b.x, b.y, h);
      t.root.style.display = p ? "" : "none";
      if (p) {
        const bob = emote && !b.reduced ? Math.sin(now / 166) * 2 : 0;
        t.emote.style.transform = `translate(-50%, ${bob}px)`;
        t.root.style.transform = `translate(${p.x}px, ${p.y}px)`;
        t.root.style.zIndex = String(Math.round(10000 - Math.hypot(cam.x - b.x, cam.z - b.y) * 100));
      }
    }
    for (const [id, t] of this.tagEls)
      if (!seen.has(id)) {
        t.root.remove();
        this.tagEls.delete(id);
      }
  }

  /** Where someone is drawn now (their 3D model, or the drawing standing in), in tiles; null if not at all. (tests) */
  /** (tests) my hands in first person: drawn, and what they're doing */
  handsNow(): { shown: boolean; doing: string } | null {
    return this.hands ? { shown: this.hands.shown, doing: this.hands.now } : null;
  }

  drawnAt(id: string): { x: number; y: number; shown: boolean; model: boolean } | null {
    const p3 = this.people3.get(id);
    if (p3?.ready) return { x: p3.root.position.x, y: p3.root.position.z, shown: p3.root.visible, model: true };
    const p = this.people.get(id);
    if (p)
      return { x: p.root.position.x, y: p.root.position.z, shown: p.root.visible && p.plane.visible, model: false };
    return null;
  }

  // A chat bubble over someone's head (as the iso engine's `say`).
  say(id: string, text: string, ms = 6000) {
    const t = this.tagEls.get(id);
    if (!t) return;
    t.bubble.textContent = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    t.bubble.style.display = "";
    t.bubbleUntil = performance.now() + ms;
  }

  private clampCam() {
    const L = LIMITS[this.mode];
    // (aiming: up to looking above level)
    this.pitch = Math.max(this.aimK > 0.5 ? -0.5 : L.pitch[0], Math.min(L.pitch[1], this.pitch));
    this.dist = Math.max(L.dist[0], Math.min(L.dist[1], this.dist));
  }

  // The camera keeps out of walls. A wall it would stand behind, below the
  // wall's top: in front of it when there's room (eased back out after), else
  // up, to look over it. Backed into a wall, or lined up along one, it saw the
  // wall faded from inside — a ghost column over you, its skirting a block at
  // the foot of the screen. And inside the building on a floor under the
  // studio, the building's outer walls likewise: through them it looked at the
  // campus's façade from outside — a pane of glass filling the screen, dark by
  // day and lit at night.
  private camPull = 0; // how much nearer than `dist` the camera stands (eased)
  private camLift = 0; // …and how much higher it looks down from (eased)
  private camView(dt: number): { dist: number; pitch: number } {
    const t = this.target;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const dx = -Math.cos(this.yaw);
    const dz = -Math.sin(this.yaw);
    let reach = Number.POSITIVE_INFINITY;
    let lift = 0; // how far up from your pitch, to look over a wall too close to stand in front of
    // (both by degrees: in front of it down to CAM_ROOM, then rising as the room
    // runs out — switched, the camera jumped tiles in a frame walking past one)
    const block = (along: number, top: number) => {
      const room = along - 0.25 / Math.max(cp, 0.01);
      reach = Math.min(reach, Math.max(room, CAM_ROOM));
      if (room >= CAM_ROOM) return;
      const over = Math.atan2(top + 0.2 - t.y, Math.max(0.3, along * cp - 0.15)) - this.pitch;
      const k = Math.min(1, (CAM_ROOM - room) / 1.2);
      lift = Math.max(lift, over * k * k * (3 - 2 * k));
    };
    if (cp > 0.01) {
      const home = homeOf(this.building);
      if (this.level < home) {
        const o = this.offsetTo(home);
        const m = 0.3; // (clear of the wall's inner face)
        const x0 = o.x + m;
        const z0 = o.y + m;
        const x1 = o.x + this.building.width - m;
        const z1 = o.y + this.building.height - m;
        if (t.x > x0 && t.x < x1 && t.z > z0 && t.z < z1) {
          const rx = dx < 0 ? (t.x - x0) / -dx : dx > 0 ? (x1 - t.x) / dx : Number.POSITIVE_INFINITY;
          const rz = dz < 0 ? (t.z - z0) / -dz : dz > 0 ? (z1 - t.z) / dz : Number.POSITIVE_INFINITY;
          const along = Math.min(rx, rz) / cp;
          if (along < this.dist) block(along + 0.25 / cp, STOREY - 0.15);
        }
      }
      // (not building: placing things by a wall, the camera stays where it's put)
      if (!this.buildMode) {
        const cx = t.x + dx * this.dist * cp;
        const cz = t.z + dz * this.dist * cp;
        for (const f of this.world.fades) {
          if (f.item) continue;
          const x0 = f.x0 - 0.06;
          const y0 = f.y0 - 0.06;
          const x1 = f.x1 + 0.06;
          const y1 = f.y1 + 0.06;
          if (t.x > x0 && t.x < x1 && t.z > y0 && t.z < y1) continue; // (you're at it: it fades)
          const hit = segBox(t.x, t.z, cx, cz, x0, y0, x1, y1);
          if (hit === null) continue;
          const along = hit * this.dist;
          if (t.y + sp * along > f.top + 0.1) continue; // (it looks over it)
          block(along, f.top);
        }
        // the Grounds' buildings round the ground floor (the town's, the blocks')
        const g = this.around.grounds;
        if (g && this.level === 0) {
          const off = offsetOf(this.building, 0);
          for (const b of g.boxes) {
            const x0 = b.x0 - off.x - 0.3;
            const y0 = b.z0 - off.y - 0.3;
            const x1 = b.x1 - off.x + 0.3;
            const y1 = b.z1 - off.y + 0.3;
            if (Math.max(x0 - t.x, 0, t.x - x1) + Math.max(y0 - t.z, 0, t.z - y1) > this.dist + 2) continue;
            if (t.x > x0 && t.x < x1 && t.z > y0 && t.z < y1) continue; // (you're in it: its outside's gone)
            const hit = segBox(t.x, t.z, cx, cz, x0, y0, x1, y1);
            if (hit === null) continue;
            const along = hit * this.dist;
            if (t.y + sp * along > b.top + 0.1) continue;
            block(along, b.top);
          }
        }
        // the shuttle and the visitor's car (their box, square to the ground)
        for (const m of this.veh3.values()) {
          const big = m.userData.big as boolean;
          const half = big ? 5.2 : 2.6;
          const r = Math.abs(Math.cos(m.rotation.y)) * half + Math.abs(Math.sin(m.rotation.y)) * 1.3;
          const q = Math.abs(Math.sin(m.rotation.y)) * half + Math.abs(Math.cos(m.rotation.y)) * 1.3;
          const [x0, y0, x1, y1] = [m.position.x - r, m.position.z - q, m.position.x + r, m.position.z + q];
          if (t.x > x0 && t.x < x1 && t.z > y0 && t.z < y1) continue;
          const hit = segBox(t.x, t.z, cx, cz, x0, y0, x1, y1);
          if (hit === null) continue;
          const top = m.position.y + (big ? 3.1 : 1.6);
          const along = hit * this.dist;
          if (t.y + sp * along > top + 0.1) continue;
          block(along, top);
        }
      }
    }
    // eased: in quickly, back out gently (a zoom isn't: it's the distance itself)
    const pull = Math.max(0, this.dist - reach);
    this.camPull += (pull - this.camPull) * (1 - Math.exp(-dt * (pull > this.camPull ? 14 : 3)));
    if (Math.abs(pull - this.camPull) < 0.005) this.camPull = pull;
    const up = Math.max(0, Math.min(CAM_LIFT_MAX - this.pitch, lift));
    this.camLift += (up - this.camLift) * (1 - Math.exp(-dt * (up > this.camLift ? 10 : 3)));
    return { dist: Math.max(0.6, this.dist - this.camPull), pitch: this.pitch + this.camLift };
  }

  // Walls standing between the camera and you go see-through (their upper part).
  private fadeWalls(dt: number) {
    const cam = this.camera.position;
    const t = this.target;
    // (first person: the camera is you — nothing stands between)
    const inside = this.mode === "first";
    for (const f of this.world.fades) {
      let block = false;
      // (from your side: the sight line where it leaves the wall nearest you,
      // its lowest over it, and down to your feet — a thick wall close by,
      // the camera up over it, still hid your legs)
      const hit = inside ? null : segBox(t.x, t.z, cam.x, cam.z, f.x0 - 0.06, f.y0 - 0.06, f.x1 + 0.06, f.y1 + 0.06);
      if (hit !== null) {
        const feet = t.y - EYE + 0.1;
        block = feet + (cam.y - feet) * hit < f.top + 0.1;
      }
      // (build mode's walls up / down override it)
      // (walls and what hangs on them: not tall furniture)
      const view = this.buildLook?.wallView;
      if (!f.item || f.wall) {
        if (view === "up") block = false;
        else if (view === "down") block = true;
      }
      const want = block ? 0.06 : 1; // cut down to the skirting, as iso's wall-down
      if (Math.abs(f.alpha - want) < 0.002 && (f.alpha === 1 || f.alpha === want)) continue;
      f.alpha += (want - f.alpha) * Math.min(1, dt * 10);
      if (Math.abs(f.alpha - want) < 0.01) f.alpha = want;
      applyFade(f, this.world.materials);
    }
  }

  private sunX = new Vector3();
  private sunY = new Vector3();
  private sunZ = new Vector3();
  private sunAt = new Vector3();
  private placeSun() {
    const el = this.sun.userData.el as number;
    const az = this.sun.userData.az as number;
    const t = this.target;
    // azimuth: east → south → west over the day; +y is "south" on the map
    const dx = -Math.cos(az) * Math.cos(el);
    const dz = Math.sin(az) * Math.cos(el);
    const dy = Math.sin(el);
    // the shadows cover what's in view: a box round you, reaching further ahead
    // the further back the camera stands (a far free camera saw them stop
    // short); its size in steps, so its texels stay put between them
    const sc = this.sun.shadow.camera;
    const cam = this.camera.position;
    const back = Math.hypot(cam.x - t.x, cam.z - t.z);
    const R = 14 + 2 * Math.round(Math.max(0, back - 6) * 0.75);
    if (sc.right !== R) {
      Object.assign(sc, { left: -R, right: R, top: R, bottom: -R, far: 2 * R + 50 });
      sc.updateProjectionMatrix();
    }
    const ahead = (R - 14) * 0.6 + 2;
    const fx = t.x + Math.cos(this.yaw) * ahead;
    const fz = t.z + Math.sin(this.yaw) * ahead;
    // the shadow map moves with you a whole texel at a time (snapped in the
    // light's view): sliding with you, every shadow's edge crawled and shimmered
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    const z = this.sunZ.set(dx, dy, dz).normalize();
    const x = this.sunX.set(z.z, 0, -z.x).normalize(); // up × z
    const y = this.sunY.crossVectors(z, x);
    const p = this.sunAt.set(fx, 0, fz);
    const u = p.dot(x);
    const v = p.dot(y);
    p.addScaledVector(x, Math.round(u / texel) * texel - u).addScaledVector(y, Math.round(v / texel) * texel - v);
    const far = R + 20;
    this.sun.position.set(p.x + dx * far, p.y + dy * far, p.z + dz * far);
    this.sun.target.position.copy(p);
  }

  // The point lights go to the lamps nearest the camera's target that light
  // where it is (a lamp in the next room shone through the wall onto this one's
  // things); each fades in and out with its distance, with the last one in
  // reach when there are more lamps than lights, and as a wall or a door comes
  // between — every frame: a lamp switching on or off as you walked by was a
  // flash on the floor round it.
  private lampSeen = new Map<string, number>(); // how much each lamp lights where you are (eased)
  private assignLamps(dt: number) {
    const d = daylight(this.hour);
    const t = this.target;
    const ease = 1 - Math.exp(-dt * 6);
    const seen = new Map<string, number>();
    const all: { l: LightSource; d: number; w: number }[] = [];
    for (const l of this.world.lights) {
      const dist = Math.hypot(l.x - t.x, l.y - t.z);
      if (dist >= LAMP_REACH) continue;
      const key = `${l.x},${l.y}`;
      const want = this.light.reaches(l, t.x, t.z) ? 1 : 0;
      const was = this.lampSeen.get(key) ?? want;
      const w = Math.abs(want - was) < 0.01 ? want : was + (want - was) * ease;
      seen.set(key, w);
      if (w > 0.001) all.push({ l, d: dist, w });
    }
    this.lampSeen = seen;
    all.sort((a, b) => a.d - b.d);
    const near = all.slice(0, this.lamps);
    const edge = Math.min(LAMP_REACH, all[this.lamps]?.d ?? LAMP_REACH);
    const k = 0.15 + 1.1 * d.night; // (the light map has their pools; this lights what stands up)
    this.pool.forEach((p, i) => {
      const n = near[i];
      const fade = n ? Math.min(1, Math.max(0, (edge - n.d) / LAMP_FADE)) : 0;
      if (!n || fade <= 0) {
        p.intensity = 0;
        return;
      }
      p.color.setHex(n.l.color);
      p.position.set(n.l.x, n.l.h ?? 1.05, n.l.y);
      p.distance = n.l.radius * 1.4;
      p.intensity = n.l.intensity * k * fade * fade * (3 - 2 * fade) * n.w;
    });
    this.groundLamps(d.night);
  }

  // the Grounds' lamps after dark (the ground floor's frame): a pool of their
  // own (in the lot's they took its lamps' places and, as bright as they are,
  // their fade at the pool's edge was a pop), the nearest lit, fading over 10 tiles
  private groundLamps(night: number) {
    const g = this.around.grounds;
    const on = Math.min(1, Math.max(0, night * 1.3 - 0.1));
    const n = this.quality === "high" ? GROUND_POOL : this.quality === "medium" ? 2 : 1;
    const near: {
      x: number;
      y: number;
      h: number;
      c: (typeof GROUND_LAMP)[string];
      d: number;
      flare?: boolean;
      color?: number;
    }[] = [];
    // a death first of all (short, and the brightest thing there; the ground floor's)
    for (const f of this.level === 0 ? this.deaths : []) {
      const d = Math.hypot(f.x - this.target.x, f.y - this.target.z);
      const smooth = (a: number, b: number) => {
        const k = Math.max(0, Math.min(1, (f.t - a) / (b - a)));
        return k * k * (3 - 2 * k);
      };
      const k = Math.max(Math.exp(-f.t * 9), 0.35 * smooth(0.45, 1.05) * (1 - smooth(1.15, 1.9)));
      if (d < GROUND_REACH && k > 0.01)
        near.push({
          x: f.x,
          y: f.y,
          h: f.z + DEATH_LAMP.h,
          c: { ...DEATH_LAMP, intensity: DEATH_LAMP.intensity * k },
          d: -2,
          flare: true,
          color: f.t < 0.2 ? 0xfff4e6 : 0xffd08a,
        });
    }
    // flares first, day or night: red, ~6 over 11 tiles (the mocks' 02-hud-night), flickering
    // (my floor's: dark/arms.ts hands over only those)
    for (const f of this.flares) {
      const d = Math.hypot(f.x - this.target.x, f.y - this.target.z);
      if (d < GROUND_REACH)
        near.push({
          x: f.x + 0.1,
          y: f.y,
          h: f.z + 0.5,
          c: { ...FLARE_LAMP, intensity: FLARE_LAMP.intensity * (0.85 + 0.15 * Math.sin(this.time * 23 + f.t * 7)) },
          d: -1,
          flare: true,
        });
    }
    if (g && this.level === 0 && on > 0) {
      const off = offsetOf(this.building, 0);
      const t = this.target;
      for (const l of GROUND_LAMPS) {
        const x = l.x - off.x;
        const y = l.z - off.y;
        const d = Math.hypot(x - t.x, y - t.z);
        if (d < GROUND_REACH)
          near.push({ x, y, h: g.heightAt(l.x, l.z) + GROUND_LAMP[l.kind].h, c: GROUND_LAMP[l.kind], d });
      }
      near.sort((a, b) => a.d - b.d);
    }
    const edge = Math.min(GROUND_REACH, near[n]?.d ?? GROUND_REACH);
    this.groundPool.forEach((p, i) => {
      const l = i < n ? near[i] : undefined;
      const fade = l ? Math.min(1, Math.max(0, (edge - l.d) / 10)) : 0;
      if (!l || fade <= 0) {
        p.intensity = 0;
        return;
      }
      p.position.set(l.x, l.h, l.y);
      p.distance = l.c.radius * 1.4;
      p.color.setHex(l.color ?? (l.flare ? 0xff3a24 : 0xffd29a));
      p.intensity = l.flare ? l.c.intensity : l.c.intensity * on * fade * fade * (3 - 2 * fade);
    });
  }

  // ── the Grounds' mood (docs/plan/27) ──
  // a storm: the fog closes in, white (as dark as the hour)
  private weatherFrame() {
    const f = fogFor();
    const s = this.storm;
    const fog = this.scene.fog as Fog;
    fog.near = f.near + (4 - f.near) * s;
    fog.far = f.far + (55 - f.far) * s;
    const l = landLight.value;
    this.stormFog.setRGB(
      Math.min(1, l.r * 1.15) * 0.84,
      Math.min(1, l.g * 1.15) * 0.88,
      Math.min(1, l.b * 1.15) * 0.92,
    );
    fog.color.copy(this.around.horizon).lerp(this.stormFog, Math.min(1, s * 1.4));
  }

  // Snow settling on people out under the sky (docs/plan/33-the-look.md): their shoulders and
  // heads white after six minutes or so out (a minute and a half in a storm), gone again in a
  // minute and a half indoors (or in a car, on the shuttle). Each viewer keeps its own count.
  private snowOn = new Map<string, number>();
  private snowFall(b: Body3, p3: Person3D, dt: number, hidden: boolean) {
    if (!Person3D.snowMat) {
      Person3D.snowMat = new MeshLambertMaterial({ color: 0xf2f5f8 });
      patchGrounds(Person3D.snowMat);
    }
    const sheltered = !!b.busy && (b.busy.startsWith("ride:") || b.busy.startsWith("drive:"));
    const out = !sheltered && this.underSky(b.x, b.y);
    const was = this.snowOn.get(b.id) ?? 0;
    const k = Math.max(0, Math.min(1, was + (out ? ((1 + 3 * this.storm) * dt) / 360 : -dt / 90)));
    this.snowOn.set(b.id, k);
    p3.snowK = hidden ? 0 : k;
    p3.updateSnow();
  }
  // out under the open sky: on the land, or the lot's open tiles (asphalt, concrete)
  private underSky(x: number, y: number): boolean {
    if (this.level !== 0) return false;
    if (this.onLand(x, y)) return true;
    const ch = tileAt(this.map, Math.floor(x), Math.floor(y));
    return ch === "a" || ch === "c";
  }
  // out on the land (the ground floor's frame, off its own tiles)
  private onLand(x: number, y: number): boolean {
    if (this.level !== 0 || !this.around.grounds) return false;
    return !(
      x >= 0 &&
      y >= 0 &&
      x < this.map.width &&
      y < this.map.height &&
      isFloor(tileAt(this.map, Math.floor(x), Math.floor(y)))
    );
  }

  // the light on someone out on the land: the hour's, the lamps' near, a beam's
  private landTint(x: number, y: number, out: Color) {
    out.copy(landLight.value);
    for (const p of [...this.pool, ...this.groundPool]) {
      if (p.intensity <= 0) continue;
      const d = Math.hypot(p.position.x - x, p.position.z - y) / (p.distance * 0.6);
      if (d >= 1) continue;
      const k = (1 - d) * (1 - d) * Math.min(1, p.intensity / 8) * 0.8;
      out.r += k * p.color.r;
      out.g += k * p.color.g;
      out.b += k * p.color.b;
    }
    for (const t of this.torch3) {
      if (!t.on) continue;
      // (shared beam.ts: the same test iso and the server make; a focused beam is the brighter)
      const k = beamAt(t.on, x, y) * (0.2 + 0.9 * this.nightLevel) * (t.on.focus ? 1.5 : 1);
      if (k <= 0) continue;
      out.r += k;
      out.g += k * 0.97;
      out.b += k * 0.9;
    }
    out.r = Math.min(1, out.r);
    out.g = Math.min(1, out.g);
    out.b = Math.min(1, out.b);
  }

  // ── what drives on the Grounds (docs/plan/27, phase 6): the visitor's car,
  // the shuttle; lit as the land is (dark at night), headlamps glowing ──
  private veh3 = new Map<string, Group>();
  private vehMat: MeshLambertMaterial | null = null;
  setVehicles(list: { id: string; kind: string; x: number; z: number; a: number; shown: boolean }[]) {
    const g = this.around.grounds;
    const off = offsetOf(this.building, this.level);
    const up = elevOf(0) - elevOf(this.level);
    const seen = new Set<string>();
    for (const v of list) {
      if (!g || !v.shown) continue;
      seen.add(v.id);
      let m = this.veh3.get(v.id);
      if (!m) {
        m = v.kind === "shuttle" ? this.busModel() : this.carModel(v.id);
        this.veh3.set(v.id, m);
        this.scene.add(m);
      }
      const px = v.x - off.x;
      const pz = v.z - off.y;
      // its wheels turn by how far it went (the shuttle's)
      const wheels = m.userData.wheels as Group[] | undefined;
      if (wheels && m.userData.at) {
        const [ax, az] = m.userData.at as [number, number];
        const d = Math.hypot(px - ax, pz - az);
        if (d < 5) for (const w of wheels) w.rotation.z -= d / 0.5;
      }
      m.userData.at = [px, pz];
      m.position.set(px, g.heightAt(v.x, v.z) + up + 0.03, pz);
      // (the models' noses point −x: turned to the heading)
      m.rotation.y = Math.PI - v.a;
      const n = this.nightLevel;
      for (const l of m.userData.glow as MeshBasicMaterial[]) l.opacity = Math.min(1, 0.25 + n * 1.2);
      for (const l of m.userData.tail as MeshBasicMaterial[]) l.opacity = Math.min(1, 0.35 + n * 1.1);
    }
    for (const [id, m] of this.veh3)
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.veh3.delete(id);
      }
  }
  private vehicleMat(): MeshLambertMaterial {
    if (!this.vehMat) {
      this.vehMat = new MeshLambertMaterial({ vertexColors: true });
      patchGrounds(this.vehMat);
    }
    return this.vehMat;
  }
  private lampsOf(xs: number, w: number, y: number): Mesh {
    const lamps = new MeshBasicMaterial({ color: 0xfff1cc, transparent: true, toneMapped: false });
    const geo = mergeGeometries(
      [-1, 1].map((s) => new BoxGeometry(0.06, 0.18, 0.3).translate(xs, y, (s * w) / 2)),
      false,
    );
    return new Mesh(geo, lamps);
  }
  /** The visitor's car: one of the town's colours and shapes (by its id), snow on it from the
   *  drive in, headlamps and tail lamps. */
  private carModel(id: string): Group {
    const root = new Group();
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
    const colours = [0x4a5a73, 0x6b2430, 0x2f4a3b, 0xcbbd98, 0x1f2124, 0x6a4a35];
    const { solid, glass } = carGeometry((h & 4) !== 0, colours[Math.abs(h) % colours.length], true);
    root.add(new Mesh(solid, this.vehicleMat()), new Mesh(glass, this.vehicleMat()));
    const l = this.lampsOf(-2.52, 1.2, 0.55);
    root.add(l);
    const tail = new MeshBasicMaterial({ color: 0xff3a24, transparent: true, toneMapped: false });
    root.add(
      new Mesh(
        mergeGeometries(
          [-1, 1].map((s) => new BoxGeometry(0.05, 0.14, 0.5).translate(2.53, 0.68, s * 0.62)),
          false,
        ),
        tail,
      ),
    );
    root.userData.glow = [l.material];
    root.userData.tail = [tail];
    for (const c of root.children) c.castShadow = true;
    return root;
  }
  private busModel(): Group {
    const b = busModel(this.vehicleMat());
    b.root.userData.big = true;
    b.root.userData.glow = [b.lamps, b.sign];
    b.root.userData.tail = [b.tail];
    b.root.userData.wheels = b.wheels;
    return b.root;
  }

  // the Grounds' new things: their shaders compiled off the frame (on a layer no
  // camera draws), shown once ready
  private prepareGrounds() {
    const g = this.around.grounds;
    if (!g) return;
    g.prepare = (o) => {
      const masks: [Object3D, number][] = [];
      o.traverse((c) => {
        masks.push([c, c.layers.mask]);
        c.layers.set(PREP_LAYER);
      });
      void this.renderer.compileAsync(o, this.camera, this.scene).then(() => {
        for (const [c, m] of masks) c.layers.mask = m;
      });
    };
    // (and what comes and goes out there: a breath's puff, the cars, the shuttle)
    const warm = new Group();
    const puff = new Sprite(
      new SpriteMaterial({
        map: this.puffMap(),
        color: 0xf4f7fa,
        transparent: true,
        depthWrite: false,
        opacity: 0.32,
        toneMapped: false,
      }),
    );
    warm.add(puff, this.carModel("visitor"), this.busModel());
    void this.renderer.compileAsync(warm, this.camera, this.scene).then(() => puff.material.dispose());
  }

  // the flashlights on: mine first, then the nearest — out of the lens of the one in their hand
  // (where it's drawn; else where shared beam.ts has it), along the beam
  private torches(bodies: Body3[], meId: string, dt: number) {
    const t = this.target;
    const on = bodies
      .filter((b) => b.torch)
      .sort(
        (a, b) =>
          (a.id === meId ? -1 : b.id === meId ? 1 : 0) ||
          Math.hypot(a.x - t.x, a.y - t.z) - Math.hypot(b.x - t.x, b.y - t.z),
      );
    const night = this.nightLevel;
    const cam = this.camera.position;
    // (the motes' clock, kept small: a float's precision)
    const tm = this.time % 600;
    for (const [i, tc] of this.torch3.entries()) {
      const b = on[i];
      tc.on = null;
      if (!b) {
        tc.who = "";
        tc.core.visible = false;
        tc.spot.intensity = 0;
        tc.spot.shadow.autoUpdate = false;
        tc.spot.position.set(0, -500, 0);
        tc.spot.target.position.set(0, -501, 0);
        tc.spot.target.updateMatrixWorld();
        tc.beam.visible = false;
        tc.glare.visible = false;
        continue;
      }
      // where they look (as they turned, not 8 ways), up as they aim; focused: narrow and far
      // (shared beam.ts: everyone draws the same beam from the same numbers)
      const aiming = ((b.mv ?? 0) & MV_AIM) !== 0;
      const beam = beamOf(
        b.x,
        b.y,
        b.z ?? b.ground ?? 0,
        b.angle ?? dirAngle(b.d),
        aiming ? (b.pitch ?? 0) : null,
        !!b.focused,
      );
      const cp = Math.cos(beam.pitch);
      const dir = { x: Math.cos(beam.yaw) * cp, y: Math.sin(beam.pitch), z: Math.sin(beam.yaw) * cp };
      tc.on = beam;
      // focusing eases in (~0.2 s) and out (~0.3 s), with a kick of brightness as it comes on;
      // someone else's torch in this one now: as their focus is
      const want = beam.focus ? 1 : 0;
      if (tc.who !== b.id) {
        tc.who = b.id;
        tc.ramp = want;
        tc.kickAt = -1;
      } else {
        if (want && tc.ramp === 0) tc.kickAt = this.time;
        tc.ramp = want ? Math.min(1, tc.ramp + dt / 0.2) : Math.max(0, tc.ramp - dt / 0.3);
      }
      const f = tc.ramp * tc.ramp * (3 - 2 * tc.ramp);
      tc.f = f;
      const since = this.time - tc.kickAt;
      const kick = tc.kickAt >= 0 && since < 0.12 ? 1 + 0.15 * Math.sin((since / 0.12) * Math.PI) : 1;
      // (mine, the battery nearly out: a faint flicker — never anyone else's)
      let flick = 1;
      if (i === 0 && b.id === meId && this.battery < 15) {
        const low = 1 - Math.max(0, this.battery) / 15;
        const t = this.time;
        const jitter = 0.5 + 0.5 * Math.sin(t * 31.7) * Math.sin(t * 13.3 + 1.1);
        const dip = Math.max(0, Math.sin(t * 1.9) * Math.sin(t * 3.1 + 0.7) - 0.75) * 4;
        flick = 1 - low * (0.08 * jitter + 0.3 * dip);
      }
      const len = BEAM.wide.len + (BEAM.focus.len - BEAM.wide.len) * f;
      const half = BEAM.wide.half + (BEAM.focus.half - BEAM.wide.half) * f;
      // (the lens in their hand, when they're drawn with one: the light comes out of it — mine in
      // first person, the one in my hands' own picture, where it shows on the screen)
      const mine1p = b.id === meId && this.mode === "first";
      const lens = mine1p
        ? (this.hands?.lensFor(this.camera, this.lensAt) ?? null)
        : (this.people3.get(b.id)?.torchLens(this.lensAt) ?? null);
      if (lens) tc.spot.position.copy(lens);
      else tc.spot.position.set(beam.x, beam.z, beam.y);
      const o = tc.spot.position;
      // (mine, aiming: from there onto what the crosshair is on)
      if (b.id === meId && aiming && this.aimOn) {
        const dx = this.aimHit.x - o.x;
        const dy = this.aimHit.y - o.y;
        const dz = this.aimHit.z - o.z;
        const l = Math.hypot(dx, dy, dz);
        if (l > 0.5) {
          dir.x = dx / l;
          dir.y = dy / l;
          dir.z = dz / l;
        }
      }
      tc.spot.target.position.set(o.x + dir.x * 7, o.y + dir.y * 7, o.z + dir.z * 7);
      tc.spot.target.updateMatrixWorld();
      tc.spot.angle = half * 1.25;
      tc.spot.distance = len * 1.6;
      tc.spot.shadow.camera.far = len * 1.6;
      tc.spot.shadow.autoUpdate = tc.spot.castShadow;
      // (focused: a hard round spot where it lands, crisper — a teammate's focus is easy to read;
      // the map swapped, never taken off)
      tc.spot.penumbra = 0.5 - 0.28 * f;
      tc.spot.map = f > 0.5 ? tc.crisp : tc.wide;
      tc.spot.intensity = (1.8 + 26 * night) * (1 + 0.8 * f) * kick * flick;
      tc.beam.position.copy(o);
      tc.beam.lookAt(tc.spot.target.position);
      const across = 1 + (FOCUS_ACROSS - 1) * f;
      const along = 1 + (FOCUS_ALONG - 1) * f;
      tc.beam.scale.set(across, across, along);
      const op0 = Math.min(0.5, (0.03 + 0.16 * night) * (1 + this.storm * 1.6));
      const op = Math.min(0.5, op0 * (1 + 0.35 * f) * kick) * flick;
      for (const m of [tc.mat, tc.coreMat]) {
        m.uniforms.time.value = tm;
        m.uniforms.storm.value = this.storm;
        m.uniforms.focus.value = f;
      }
      tc.mat.uniforms.opacity.value = op;
      tc.beam.visible = op > 0.01;
      // (its hot core, as it focuses)
      tc.core.position.copy(o);
      tc.core.quaternion.copy(tc.beam.quaternion);
      tc.core.scale.set(across * 0.42, across * 0.42, along * 0.96);
      const co = op0 * 0.3 * f * kick * flick;
      tc.coreMat.uniforms.opacity.value = co;
      tc.core.visible = co > 0.01;
      // the lens: a glint; looking into it, a glare
      const dc = Math.hypot(cam.x - o.x, cam.y - o.y, cam.z - o.z) || 1;
      const into = Math.max(0, (dir.x * (cam.x - o.x) + dir.y * (cam.y - o.y) + dir.z * (cam.z - o.z)) / dc);
      const k = into ** 6;
      tc.glare.position.copy(o);
      tc.glare.scale.setScalar(0.07 + k * (0.5 + 0.6 * night) * (1 + 0.4 * f) * kick);
      (tc.glare.material as SpriteMaterial).opacity = Math.min(1, 0.55 + k * 0.6) * (0.4 + 0.6 * night) * flick;
      // (not my own in first person: it's in my hands' own picture, hands1p.ts)
      tc.glare.visible = !(b.id === meId && this.mode === "first");
    }
  }

  // a soft round puff (a sprite with no picture is a square)
  private puffTex: CanvasTexture | null = null;
  private puffMap(): CanvasTexture {
    if (this.puffTex) return this.puffTex;
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.5, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    this.puffTex = new CanvasTexture(c);
    return this.puffTex;
  }

  // breath in the cold: a little cloud now and then from everyone out on the land
  private breathe(bodies: Body3[]) {
    const now = this.time;
    const cam = this.camera.position;
    for (const b of bodies) {
      if (
        b.npc ||
        b.pet ||
        b.busy === "ride:shuttle" ||
        !this.onLand(b.x, b.y) ||
        Math.hypot(cam.x - b.x, cam.z - b.y) > 16
      )
        continue;
      const next = this.breathAt.get(b.id) ?? now + (hashId(b.id) % 100) / 40;
      if (now < next) {
        this.breathAt.set(b.id, next);
        continue;
      }
      // (quicker running)
      this.breathAt.set(b.id, now + (b.a === 1 ? 1.6 : 2.8) + Math.random() * 0.6);
      const a = b.angle ?? dirAngle(b.d);
      const feet = b.z ?? b.ground ?? 0;
      for (let i = 0; i < 3; i++) {
        const s = new Sprite(
          new SpriteMaterial({
            map: this.puffMap(),
            color: 0xf4f7fa,
            transparent: true,
            depthWrite: false,
            opacity: 0.32,
            toneMapped: false,
          }),
        );
        s.material.color.multiply(landLight.value).multiplyScalar(1.4);
        s.scale.setScalar(0.08);
        s.position.set(b.x + Math.cos(a) * 0.22, feet + 1.52, b.y + Math.sin(a) * 0.22);
        this.scene.add(s);
        const sp = 0.3 + Math.random() * 0.2;
        this.fx.push({
          s,
          vx: Math.cos(a) * sp + (Math.random() - 0.5) * 0.1,
          vy: Math.sin(a) * sp + (Math.random() - 0.5) * 0.1,
          vz: 0.1 + Math.random() * 0.08,
          t: -i * 0.06,
          life: 1.3,
          g: -0.05,
          drag: 1.6,
          grow: 4,
          size: 0.08,
          op: 0.3,
        });
      }
    }
  }

  // screen position of a world point (tiles, h = height in tiles), or null behind the camera
  project(x: number, y: number, h: number): { x: number; y: number } | null {
    const v = new Vector3(x, h, y).project(this.camera);
    if (v.z > 1) return null;
    const c = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * c.clientWidth, y: ((1 - v.y) / 2) * c.clientHeight };
  }

  // Is a point (tiles; h = height) hidden behind a wall that's standing (not faded)?
  hidden(x: number, y: number, h: number): boolean {
    const cam = this.camera.position;
    for (const f of this.world.fades) {
      if (f.item || f.alpha < 0.5) continue;
      const t = segBox(cam.x, cam.z, x, y, f.x0, f.y0, f.x1, f.y1);
      if (t !== null && t < 0.98 && cam.y + (h - cam.y) * t < f.top) return true;
    }
    return false;
  }

  info() {
    const r = this.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles, build: this.world.stats };
  }

  // ── input ────────────────────────────────────────────────────────────────
  // two fingers: pinch to zoom (phones, tablets), as in iso
  private touches = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private onTouch(e: PointerEvent): boolean {
    if (e.pointerType !== "touch") return false;
    if (e.type === "pointerdown" || e.type === "pointermove")
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else this.touches.delete(e.pointerId);
    if (this.touches.size !== 2) {
      this.pinch = 0;
      return false;
    }
    const [a, b] = [...this.touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (this.pinch) {
      this.dist *= this.pinch / Math.max(1, d);
      this.clampCam();
    }
    this.pinch = d;
    this.drag = null; // no orbit (and no click) while pinching
    return true;
  }

  private onDown = (e: PointerEvent) => {
    this.activeAt = performance.now();
    // mouse look: a click uses what the crosshair is on
    if (this.looking) {
      if (e.button === 0 && !(this.aim && this.armed)) {
        const r = this.renderer.domElement.getBoundingClientRect();
        this.pick(r.left + r.width / 2, r.top + r.height / 2);
      }
      return;
    }
    if (this.onTouch(e)) return;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    // build mode: the left button builds (the right one turns the camera)
    if (this.buildMode && e.button === 0) {
      this.buildPress = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now() };
      const f = this.buildAt(e.clientX, e.clientY);
      this.events.buildDown?.(f.x, f.y);
      return;
    }
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now() };
  };
  private onMove = (e: PointerEvent) => {
    this.activeAt = performance.now();
    if (this.looking) {
      // (some browsers send one huge jump as the lock starts)
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      const k = 0.0024 * this.lookSens;
      this.yaw += e.movementX * k;
      this.pitch += e.movementY * k * 0.8 * (this.lookInvert ? -1 : 1);
      this.dragged = this.time;
      this.clampCam();
      return;
    }
    if (this.onTouch(e)) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    if (this.buildMode) {
      const f = this.buildAt(e.clientX, e.clientY);
      this.events.buildMove?.(f.x, f.y, this.pointer);
    }
    if (!this.drag || this.drag.id !== e.pointerId)
      return this.buildMode ? undefined : this.hover(e.clientX, e.clientY);
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.yaw += dx * 0.0055;
    this.pitch += dy * 0.004;
    this.dragged = this.time;
    this.clampCam();
  };
  private onUp = (e: PointerEvent) => {
    this.onTouch(e);
    const b = this.buildPress;
    if (b && b.id === e.pointerId) {
      this.buildPress = null;
      const f = this.buildAt(e.clientX, e.clientY);
      this.events.buildUp?.(f.x, f.y);
      // a click: build mode's click on the floor there (it picks what's under the pointer itself)
      if (e.type === "pointerup" && Math.hypot(e.clientX - b.x0, e.clientY - b.y0) < 6 && performance.now() - b.t < 600)
        this.events.floor?.(f.x, f.y);
      return;
    }
    const d = this.drag;
    if (d?.id !== e.pointerId) return;
    this.drag = null;
    // a click (not a drag): someone, or a spot on the floor (armed, the right button only aims)
    if (
      e.type === "pointerup" &&
      !(e.button === 2 && this.armed) &&
      Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6 &&
      performance.now() - d.t < 600
    )
      this.pick(e.clientX, e.clientY, { shift: e.shiftKey, right: e.button === 2 });
  };

  // the nearest usable thing along the ray (its 3D box; see-through walls don't
  // stop it) — an elevator car's buttons first (you're in the car's own box)
  private pickObject(): string | null {
    const btn = this.lifts3?.buttonPicks.length ? this.nearestPick(this.lifts3.buttonPicks) : null;
    if (btn) return btn;
    return this.nearestPick([...this.world.picks, ...(this.lifts3?.picks ?? []), ...this.stairs3.picks]);
  }
  private nearestPick(
    picks: { id: string; use: boolean; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }[],
  ): string | null {
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    let best: string | null = null;
    let bestT = Number.POSITIVE_INFINITY;
    for (const p of picks) {
      if (!p.use) continue;
      let t0 = 0;
      let t1 = bestT;
      let ok = true;
      for (const [oa, da, lo, hi] of [
        [o.x, d.x, p.x0, p.x1],
        [o.y, d.y, p.z0, p.z1],
        [o.z, d.z, p.y0, p.y1],
      ]) {
        if (Math.abs(da) < 1e-9) {
          if (oa < lo || oa > hi) ok = false;
          continue;
        }
        let a = (lo - oa) / da;
        let b = (hi - oa) / da;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 < bestT) {
        bestT = t0;
        best = p.id;
      }
    }
    // a wall in the way (standing, not faded) hides what's behind it
    if (best !== null) {
      const hit = o.clone().addScaledVector(d, bestT);
      if (this.hidden(hit.x, hit.z, hit.y)) return null;
    }
    return best;
  }

  private setRay(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
  }

  /** How far along the crosshair's line (from the camera, tiles) one of the others stands, or null. */
  personAlongLook(): number | null {
    this.ray.setFromCamera(new Vector2(0, 0), this.camera);
    let best: number | null = null;
    for (const [id, p] of this.people3) {
      if (id === this.meId) continue;
      const t = p.hitDistance(this.ray.ray);
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best;
  }

  /** Where a shot from (x, y, z) — the floor's coords, z up — going `yaw`, `pitch` stops within `max`:
   *  the first wall (or anything solid this view fades), else the ground (the land's or the floor's);
   *  null: neither (docs/plan/32-the-arms.md: tracers that stop where the shot did). */
  rayStop(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    max: number,
  ): { t: number; what: "wall" | "ground" } | null {
    const c = Math.cos(pitch);
    const dx = Math.cos(yaw) * c;
    const dy = Math.sin(yaw) * c;
    const dz = Math.sin(pitch);
    let t = max;
    let what: "wall" | "ground" | null = null;
    const ex = x + dx * max;
    const ey = y + dy * max;
    for (const f of this.world.fades) {
      if (f.item) continue;
      const k = segBox(x, y, ex, ey, f.x0, f.y0, f.x1, f.y1);
      if (k === null || k <= 0.01) continue;
      const at = k * max;
      if (at < t && z + dz * at < f.top) {
        t = at;
        what = "wall";
      }
    }
    const off = offsetOf(this.building, 0);
    const g = this.around.grounds;
    for (let s = 0.3; s < t; s += 0.2) {
      const px = x + dx * s;
      const py = y + dy * s;
      const floor = g && this.onLand(px, py) ? g.heightAt(px + off.x, py + off.y) : 0;
      if (z + dz * s <= floor) {
        t = s;
        what = "ground";
        break;
      }
    }
    return what ? { t, what } : null;
  }

  // Aiming: what the crosshair is on — the first wall beyond me, else the ground (the land's or the
  // floor's), within 16 tiles — and the turn and the pitch that point the flashlight in my hand
  // (shared beam.ts, held out) at it. Eased: the crosshair crossing an edge doesn't snap the body.
  private aimFrame(dt: number, me: Body3 | undefined) {
    const was = this.aimOn;
    this.aimOn = this.aim && !!me;
    if (!this.aimOn || !me) return;
    const cam = this.camera.position;
    const d = this.camera.getWorldDirection(this.aimDir);
    const L = 16;
    // past me (the walls between the camera and me are faded, or behind me)
    const near = Math.max(0, (me.x - cam.x) * d.x + (me.y - cam.z) * d.z) + 0.6;
    let t = L;
    const ex = cam.x + d.x * L;
    const ez = cam.z + d.z * L;
    for (const f of this.world.fades) {
      if (f.item || f.alpha < 0.5) continue;
      const k = segBox(cam.x, cam.z, ex, ez, f.x0, f.y0, f.x1, f.y1);
      if (k === null) continue;
      const at = k * L;
      if (at > near && at < t && cam.y + d.y * at < f.top) t = at;
    }
    // the ground: a step at a time (the land rises and falls; a floor is 0)
    const off = offsetOf(this.building, 0);
    const g = this.around.grounds;
    for (let s = near; s < t; s += 0.25) {
      const x = cam.x + d.x * s;
      const z = cam.z + d.z * s;
      const floor = g && this.onLand(x, z) ? g.heightAt(x + off.x, z + off.y) : 0;
      if (cam.y + d.y * s <= floor) {
        t = s;
        break;
      }
    }
    const tx = cam.x + d.x * t;
    const ty = cam.y + d.y * t;
    const tz = cam.z + d.z * t;
    this.aimHit.set(tx, ty, tz);
    // from the lens (held out) to there — not nearer than 2.5
    // (as the body faces: last frame's turn on the camera's)
    const o = beamOf(me.x, me.y, me.z ?? me.ground ?? 0, this.yaw + (was ? this.aimTurn : 0) + AIM_BLADE, 0, false);
    const flat = Math.max(2.5, Math.hypot(tx - o.x, tz - o.y));
    let turn = Math.atan2(tz - o.y, tx - o.x) - this.yaw;
    turn = Math.max(-0.35, Math.min(0.35, Math.atan2(Math.sin(turn), Math.cos(turn))));
    const up = Math.max(-0.9, Math.min(0.9, Math.atan2(ty - o.z, flat)));
    const k = was ? 1 - Math.exp(-dt * 14) : 1;
    this.aimTurn += (turn - this.aimTurn) * k;
    this.aimUp += (up - this.aimUp) * k;
  }

  // what's under the pointer: someone, or something to use
  private personAt(): string | null {
    // the 3D people: the nearest one the ray passes through
    let best: { id: string; t: number } | null = null;
    for (const [id, p] of this.people3) {
      const t = p.hitDistance(this.ray.ray);
      if (t !== null && (!best || t < best.t)) best = { id, t };
    }
    if (best) return best.id;
    const planes: Object3D[] = [];
    for (const p of this.people.values()) if (p.plane.visible && p.root.visible) planes.push(p.plane);
    for (const hit of this.ray.intersectObjects(planes, false)) {
      const found = [...this.people].find(([, p]) => p.plane === hit.object);
      if (found && hit.uv && found[1].opaqueAt(hit.uv.x, hit.uv.y)) return found[0];
    }
    // pets: their meshes
    const roots: Object3D[] = [...this.pets3.values()].map((e) => e.model.root);
    const hit = this.ray.intersectObjects(roots, true)[0];
    if (hit) {
      let o: Object3D | null = hit.object;
      while (o && !roots.includes(o)) o = o.parent;
      if (o) return [...this.pets3].find(([, e]) => e.model.root === o)?.[0] ?? null;
    }
    return null;
  }

  private hoverAt = 0;
  private hover(clientX: number, clientY: number) {
    const now = performance.now();
    if (now - this.hoverAt < 50) return; // a few times a second is plenty
    this.hoverAt = now;
    this.setRay(clientX, clientY);
    const any = this.personAt() ?? this.pickObject();
    this.renderer.domElement.style.cursor = any ? "pointer" : "";
  }

  // ── build mode ─────────────────────────────────────────────────────────────
  buildMode = false;
  private buildPress: { id: number; x0: number; y0: number; t: number } | null = null;
  private pointer = { x: 0, y: 0 };
  private buildLook: BuildLook | null = null;
  private builder: BuildLayer;
  setBuild(look: BuildLook | null) {
    if (look) this.setLook(false);
    this.buildMode = !!look;
    this.buildLook = look;
  }

  // the floor under a point of the screen (tiles), or null looking up; `h`:
  // the point at that height instead (on a surface that high, in tiles)
  // The ray through a screen point, from the camera (world tiles; z in iso px).
  rayAt(
    clientX: number,
    clientY: number,
  ): { o: { x: number; y: number; z: number }; d: { x: number; y: number; z: number } } {
    this.setRay(clientX, clientY);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    return { o: { x: o.x, y: o.z, z: o.y * 39.19 }, d: { x: d.x, y: d.z, z: d.y * 39.19 } };
  }

  // The walls this view looks through now (faded runs): "h3,4" keys.
  lookedThrough(): Set<string> {
    const out = new Set<string>();
    for (const f of this.world.fades) {
      if (f.item || f.alpha >= 0.5) continue;
      if (f.y1 - f.y0 < 0.5) {
        const y = Math.round((f.y0 + f.y1) / 2);
        for (let x = Math.floor(f.x0 + 0.2); x < f.x1 - 0.2; x++) out.add(`h${x},${y}`);
      } else if (f.x1 - f.x0 < 0.5) {
        const x = Math.round((f.x0 + f.x1) / 2);
        for (let y = Math.floor(f.y0 + 0.2); y < f.y1 - 0.2; y++) out.add(`v${x},${y}`);
      }
    }
    return out;
  }

  // Where build mode's pointer is on the floor. Pointing above the horizon (high
  // up a wall, the camera low) there's no floor under it: the last floor point
  // then, so presses, drags and clicks still reach build mode (a wall item in
  // hand goes by the pointer's ray anyway).
  private lastBuildFloor: { x: number; y: number } | null = null;
  private buildAt(clientX: number, clientY: number): { x: number; y: number } {
    const f = this.floorAt(clientX, clientY);
    if (f) this.lastBuildFloor = f;
    if (f ?? this.lastBuildFloor) return (f ?? this.lastBuildFloor) as { x: number; y: number };
    const c = this.camera.position;
    return { x: c.x, y: c.z };
  }

  floorAt(clientX: number, clientY: number, h = 0): { x: number; y: number } | null {
    this.setRay(clientX, clientY);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (d.y >= -1e-4 || o.y <= h) return null;
    const t = (h - o.y) / d.y;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  }

  // Everything under the pointer, front first (build mode's pick: furniture and
  // the rooms' clutter, as the iso engine's `picksAt`).
  picksAtPointer(): { id: string; dress: boolean; kind?: string; t: number }[] {
    this.setRay(this.pointer.x, this.pointer.y);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    const out: { id: string; dress: boolean; kind?: string; t: number }[] = [];
    for (const p of this.world.picks) {
      let t0 = 0;
      let t1 = Number.POSITIVE_INFINITY;
      let ok = true;
      for (const [oa, da, lo, hi] of [
        [o.x, d.x, p.x0, p.x1],
        [o.y, d.y, p.z0, p.z1],
        [o.z, d.z, p.y0, p.y1],
      ]) {
        if (Math.abs(da) < 1e-9) {
          if (oa < lo || oa > hi) ok = false;
          continue;
        }
        let a = (lo - oa) / da;
        let b = (hi - oa) / da;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok) out.push({ id: p.id, dress: !!p.dress, kind: p.dress?.kind, t: t0 });
    }
    // small things on a surface first (as iso: a mug wins over its desk), then nearest
    return out.sort((a, b) => a.t - b.t);
  }

  private pick(clientX: number, clientY: number, mods?: { shift: boolean; right: boolean }) {
    this.setRay(clientX, clientY);
    // the nearest drawing actually under the pointer (not a plane's empty margin)
    const who = this.personAt();
    if (who) return this.events.person?.(who, { x: clientX, y: clientY });
    const toyHit = this.ray.intersectObjects(
      [...this.toys3.values()].map((t) => t.root),
      true,
    )[0];
    if (toyHit) {
      let o: Object3D | null = toyHit.object;
      while (o?.parent && !o.userData.toyId) o = o.parent;
      if (o?.userData.toyId) return this.events.toy?.(o.userData.toyId as string);
    }
    const hitObj = this.pickObject();
    if (hitObj) return this.events.object?.(hitObj, { x: clientX, y: clientY });
    const o = this.ray.ray.origin;
    const dir = this.ray.ray.direction;
    if (dir.y >= -1e-4) return;
    // out on the land (the ground floor): where the ray meets the ground
    const land = this.landAt(o, dir);
    if (land) return this.events.floor?.(land.x, land.y, mods);
    const t = -o.y / dir.y;
    const x = o.x + dir.x * t;
    const y = o.z + dir.z * t;
    if (x >= 0 && y >= 0 && x < this.map.width && y < this.map.height) this.events.floor?.(x, y, mods);
  }

  // ── footprints in the snow (world/footprints.ts): one instanced mesh, fading ──
  prints: Footprints | null = null;
  private printMesh: InstancedMesh | null = null;
  private printLeftAttr: InstancedBufferAttribute | null = null;
  private printVersion = -1;
  private printFaded = 0;
  private drawPrints(now: number) {
    const f = this.prints;
    if (!f) return;
    const N = 1600;
    // (made up front, its shader compiled then: not with the first print)
    if (!this.printMesh) {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 20;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      const grd = g.createRadialGradient(16, 10, 0, 16, 10, 15);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.7, "rgba(255,255,255,0.8)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(16, 10, 15, 9, 0, 0, Math.PI * 2);
      g.fill();
      const tex = new CanvasTexture(c);
      const mat = new MeshBasicMaterial({
        color: 0x5f7290,
        map: tex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aLeft;\nvarying float vLeft;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLeft = aLeft;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vLeft;")
          .replace("#include <opaque_fragment>", "diffuseColor.a *= vLeft;\n#include <opaque_fragment>");
      };
      const geo = new PlaneGeometry(0.2, 0.12).rotateX(-Math.PI / 2);
      this.printLeftAttr = new InstancedBufferAttribute(new Float32Array(N), 1);
      geo.setAttribute("aLeft", this.printLeftAttr);
      this.printMesh = new InstancedMesh(geo, mat, N);
      this.printMesh.frustumCulled = false;
      this.printMesh.renderOrder = 1;
      this.scene.add(this.printMesh);
      this.printMesh.count = 1;
      this.renderer.compile(this.printMesh, this.camera);
      this.printMesh.count = 0;
    }
    const on = this.level === 0 && f.list.length > 0;
    this.printMesh.visible = on;
    if (!on) return;
    const fade = now - this.printFaded > 1000;
    if (f.version === this.printVersion && !fade) return;
    this.printVersion = f.version;
    this.printFaded = now;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const at = new Vector3();
    const left = this.printLeftAttr as InstancedBufferAttribute;
    const n = Math.min(N, f.list.length);
    for (let i = 0; i < n; i++) {
      const p = f.list[f.list.length - n + i];
      m.compose(at.set(p.x, p.z + 0.035, p.y), q.setFromAxisAngle(up, -p.a), one);
      this.printMesh.setMatrixAt(i, m);
      left.setX(i, printLeft(p, now));
    }
    this.printMesh.count = n;
    this.printMesh.instanceMatrix.needsUpdate = true;
    left.needsUpdate = true;
  }

  /** Where a ray (my floor's coords) first meets the land round the ground floor, off
   *  the floor's own tiles; null on any other floor, or when it meets the floor first. */
  private landAt(o: Vector3, dir: Vector3): { x: number; y: number } | null {
    const g = this.around.grounds;
    if (this.level !== 0 || !g) return null;
    const off = offsetOf(this.building, 0);
    const below = (t: number) => o.y + dir.y * t <= g.heightAt(o.x + dir.x * t + off.x, o.z + dir.z * t + off.y);
    let t0 = 0;
    let t1 = -1;
    for (let t = 0.5; t < 500; t += 0.5)
      if (below(t)) {
        t1 = t;
        break;
      } else t0 = t;
    if (t1 < 0) return null;
    for (let i = 0; i < 12; i++) {
      const m = (t0 + t1) / 2;
      if (below(m)) t1 = m;
      else t0 = m;
    }
    const x = o.x + dir.x * t1;
    const y = o.z + dir.z * t1;
    // (on the floor's own tiles: the floor's, as before)
    if (
      x >= 0 &&
      y >= 0 &&
      x < this.map.width &&
      y < this.map.height &&
      isFloor(tileAt(this.map, Math.floor(x), Math.floor(y)))
    )
      return null;
    return { x, y };
  }

  // pets' toys (shared/pets.ts): a mesh each, where it is (in the air too)
  private toys3 = new Map<string, { root: Group; kind: string; shadow: Mesh }>();
  setToys(list: { id: string; kind: string; x: number; y: number; z: number }[]) {
    const P = petsArt();
    if (!P && list.length) void loadPets();
    const seen = new Set<string>();
    for (const t of list) {
      seen.add(t.id);
      let v = this.toys3.get(t.id);
      if (!v && P) {
        const root = new Group();
        root.userData.toyId = t.id;
        const m = P.toyMesh(t.kind, (c, o) => {
          const mat = new MeshLambertMaterial({ color: c, emissive: o?.glow ? c : 0 });
          this.light.patch(mat);
          return mat;
        });
        if (!m) continue;
        m.traverse((x) => {
          x.castShadow = true;
        });
        root.add(m);
        const shadow = new Mesh(
          new CircleGeometry(0.09, 16).rotateX(-Math.PI / 2),
          new MeshBasicMaterial({ color: 0x1a100a, transparent: true, opacity: 0.3, depthWrite: false }),
        );
        shadow.position.y = 0.004;
        root.add(shadow);
        this.scene.add(root);
        v = { root, kind: t.kind, shadow };
        this.toys3.set(t.id, v);
      }
      if (!v) continue;
      v.root.position.set(t.x, 0, t.y);
      (v.root.children[0] as Object3D).position.y = t.z + (t.kind === "ball" ? 0.1 : 0.012);
      if (t.kind === "ball" && t.z > 0.01) (v.root.children[0] as Object3D).rotation.x += 0.2;
      const k = 1 / (1 + t.z * 1.6);
      v.shadow.scale.setScalar(k);
      (v.shadow.material as MeshBasicMaterial).opacity = 0.12 + 0.2 * k;
    }
    for (const [id, v] of this.toys3)
      if (!seen.has(id)) {
        this.scene.remove(v.root);
        this.toys3.delete(id);
      }
  }
  private onWheel = (e: WheelEvent) => {
    this.activeAt = performance.now();
    e.preventDefault();
    if (this.buildMode && this.events.wheel?.(e.deltaY)) return; // turning what you hold
    this.dist *= e.deltaY > 0 ? 1.1 : 1 / 1.1;
    this.clampCam();
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.activeAt = performance.now();
    if (e.type === "keydown" && e.code === "KeyZ" && !e.repeat && !e.metaKey && !e.ctrlKey) this.setLook(!this.looking);
    if (e.type === "keydown") this.keys.add(e.code);
    else this.keys.delete(e.code);
  };
  private onBlur = () => this.keys.clear();
  private noMenu = (e: Event) => e.preventDefault();

  // ── mouse look ─────────────────────────────────────────────────────────────
  // The browser owns the lock: Esc, another window or tab let it go, and right
  // after Esc it refuses to lock again for a moment. `looking` follows it.
  looking = false;
  lookSens = 1; // × the base speed
  lookInvert = false;
  private crosshair: HTMLDivElement | null = null;
  private aimKey = "";
  private aimDue = 0;
  setLook(on: boolean, quiet = false) {
    const c = this.renderer.domElement;
    if (!on) {
      if (document.pointerLockElement === c) document.exitPointerLock();
      return;
    }
    if (this.looking || this.buildMode || !c.requestPointerLock) return;
    // raw mouse movement where there is (Chrome); a plain lock elsewhere (Firefox)
    const lock = c.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
    // a refusal: the promise says so (Chrome), or the error event (Firefox: no promise)
    const refused = () => {
      if (!quiet) this.events.lookRefused?.();
    };
    this.lockAsked = 0;
    try {
      const p = lock.call(c, { unadjustedMovement: true });
      if (!p?.catch) this.lockAsked = quiet ? 0 : 1;
      else
        p.catch(() => {
          if (document.pointerLockElement === c) return;
          const q = lock.call(c);
          if (q?.catch) q.catch(refused);
          else this.lockAsked = quiet ? 0 : 1;
        });
    } catch {
      this.lockAsked = quiet ? 0 : 1;
      lock.call(c);
    }
  }
  // Back to mouse look after something borrowed the pointer (the phone, the bag).
  // Chrome locks again without a click after letting go from code; where the
  // browser says no, the pointer just stays out (no toast: nobody asked).
  resumeLook() {
    this.setLook(true, true);
  }
  private onLockChange = () => {
    const on = document.pointerLockElement === this.renderer.domElement;
    if (on === this.looking) return;
    this.looking = on;
    this.drag = null;
    this.renderer.domElement.style.cursor = "";
    this.showCrosshair();
    this.aimKey = "";
    if (!on) this.events.aim?.(null);
    this.events.look?.(on);
  };
  // the aim's dot: in first person only (in third person you see where you look)
  private showCrosshair() {
    if (this.crosshair) this.crosshair.style.display = this.looking && this.mode === "first" ? "block" : "none";
  }
  private lockAsked = 0;
  private onLockError = () => {
    if (!this.lockAsked) return;
    this.lockAsked = 0;
    this.events.lookRefused?.();
  };
  // what the crosshair is on (a few times a second)
  private aimAt() {
    const now = performance.now();
    if (now - this.aimDue < 80) return;
    this.aimDue = now;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.setRay(r.left + r.width / 2, r.top + r.height / 2);
    const person = this.personAt();
    const object = person ? null : this.pickObject();
    const key = person ? `p${person}` : object ? `o${object}` : "";
    if (key === this.aimKey) return;
    this.aimKey = key;
    const x = this.crosshair;
    if (x) {
      x.style.background = key ? "#ffa630" : "#f6eedb";
      x.style.transform = key ? "scale(1.6)" : "";
    }
    this.events.aim?.(person ? { person } : object ? { object } : null);
  }

  destroy() {
    this.shroud?.dispose();
    this.arms3?.dispose();
    const c = this.renderer.domElement;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.noMenu);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("pointerlockerror", this.onLockError);
    if (document.pointerLockElement === c) document.exitPointerLock();
    this.crosshair?.remove();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    this.ro?.disconnect();
    this.tagLayer?.remove();
    this.live.dispose();
    this.builder.dispose();
    for (const f of this.fx) (f.s.material as SpriteMaterial).dispose();
    this.post?.dispose();
    this.light.dispose();
    for (const l of this.below.values()) l.dispose();
    for (const p of this.people.values()) p.dispose();
    for (const p of this.people3.values()) p.dispose();
    this.hands?.dispose();
    this.charF?.dispose();
    for (const m of this.propMats.values()) m.dispose();
    (this.charMats?.body as Material | undefined)?.dispose();
    (this.charMats?.bodyAway as Material | undefined)?.dispose();
    for (const e of this.pets3.values()) e.model.dispose();
    this.games3?.dispose();
    this.lifts3?.dispose();
    this.stairs3.dispose();
    for (const b of this.floors.values()) b.world.dispose();
    this.warmTarget?.dispose();
    this.around.dispose();
    this.renderer.dispose();
    c.remove();
  }
}

// Where a 2D segment first enters a box (0..1 along it), or null.
function segBox(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return t0;
}

function applyFade(f: FadeGroup, shared: World3["materials"]) {
  f.own ??= new Map();
  for (const o of f.objects) {
    const m = o as Mesh | LineSegments;
    m.userData.base ??= m.material;
    const base = m.userData.base as Material;
    if (f.alpha >= 0.999) {
      m.material = base;
      continue;
    }
    let own = f.own.get(base);
    if (!own) {
      own = base.clone();
      own.transparent = true;
      own.depthWrite = false;
      f.own.set(base, own);
    }
    // the shared glass is already see-through: scale it
    own.opacity = (base === shared.clear ? 1 : base.opacity) * f.alpha;
    m.material = own;
  }
}

// ── over heads ───────────────────────────────────────────────────────────────
interface Tag {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  dot: HTMLSpanElement;
  slash: HTMLSpanElement;
  emote: HTMLImageElement;
  bubble: HTMLDivElement;
  dotKey: string;
  emoteKey: string;
  bubbleUntil: number;
}

// The iso look: a dark pill in Share Tech Mono, the paper bubble with a walnut
// edge, the emote's own drawing.
function makeTag(): Tag {
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;will-change:transform";
  const stack = document.createElement("div");
  stack.style.cssText =
    "position:absolute;left:0;bottom:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px";
  const bubble = document.createElement("div");
  bubble.style.cssText =
    "display:none;max-width:196px;padding:5px 8px;border-radius:8px;background:rgba(247,240,222,.96);border:1px solid rgba(91,58,38,.6);color:#2a1a12;font:12px/15px Inter,ui-sans-serif,system-ui,sans-serif;text-align:left;white-space:normal;overflow-wrap:anywhere;width:max-content;position:relative;margin-bottom:4px";
  const emote = document.createElement("img");
  emote.alt = "";
  emote.style.cssText = "display:none;width:34px;height:34px;position:relative;left:50%";
  const pill = document.createElement("div");
  pill.style.cssText =
    "display:flex;align-items:center;gap:6px;height:18px;padding:0 9px 0 7px;border-radius:9px;background:rgba(30,23,18,.78);color:#efe4cc;font:12px/18px 'Share Tech Mono',ui-monospace,monospace;letter-spacing:.3px;white-space:nowrap";
  const dot = document.createElement("span");
  dot.style.cssText = "position:relative;width:6.4px;height:6.4px;border-radius:50%;flex:none";
  const slash = document.createElement("span");
  slash.style.cssText =
    "display:none;position:absolute;left:50%;top:50%;width:8.5px;height:1.4px;background:#efe4cc;transform:translate(-50%,-50%) rotate(45deg)";
  dot.appendChild(slash);
  const name = document.createElement("span");
  pill.append(dot, name);
  stack.append(bubble, emote, pill);
  root.appendChild(stack);
  return { root, name, dot, slash, emote, bubble, dotKey: "", emoteKey: "", bubbleUntil: 0 };
}

// (the walls' back faces too: painting only a far side changes nothing else here)
const layoutSig = (m: MapDef) =>
  `${m.width}x${m.height}|${m.tiles.join("")}|${m.hWalls.join("")}|${m.vWalls.join("")}|${(m.hBacks ?? []).join("")}|${(m.vBacks ?? []).join("")}`;

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
