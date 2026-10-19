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
  type MapDef,
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
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Frustum,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  Sphere,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { chars, loadChars } from "../art/chars-load";
import { daylight } from "../art/daylight";
import { emoteUrl } from "../art/emotes";
import type { people } from "../art/people-load";
import { loadPets, pets as petsArt } from "../art/pets-load";
import type { PetModel } from "../art/pets3d";
import type { PuffKind } from "../engine";
import { activePad } from "../pads";
import { type FadeGroup, type Items, World3 } from "./build";
import { BuildLayer, type BuildLook } from "./build3d";
import { type GameScene3, GamesIn3D, HAND_SIT, HAND_STAND } from "./games3d";
import { Hands1P, handsDoing } from "./hands1p";
import { zt } from "./kit3d";
import { Light3 } from "./light3d";
import { type Live, LiveFeed, type LiveSources, LiveSurfaces } from "./live";
import { dirAngle, Person3, type PersonIn } from "./people3d";
import { type Mats as CharMats, Person3D } from "./person3d";
import { Post3 } from "./post3d";
import { fogFor, Surroundings, type Themes } from "./sky";
import { type TableScene3, TablesIn3D } from "./tables3d";

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
  private floors = new Map<number, { world: World3; sig: string }>(); // every floor built so far (mine is `world`)
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
  private poolDue = 0;
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
      objects,
      this.renderer.capabilities.getMaxAnisotropy(),
      (m) => this.light.patch(m),
      wells,
    );
    this.scene.add(this.world.root);
    // a GPU reset (Chrome, mid-call) empties big canvases: draw the baked ones again
    this.renderer.domElement.addEventListener("webglcontextrestored", () => {
      this.world.rebakeFloor();
      this.light.setHour(this.hour);
    });
    this.scene.add(this.hemi);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.camera.left = -14;
    s.shadow.camera.right = 14;
    s.shadow.camera.top = 14;
    s.shadow.camera.bottom = -14;
    s.shadow.camera.near = 1;
    s.shadow.camera.far = 70;
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.02;
    this.scene.add(s, s.target);
    for (let i = 0; i < LAMPS; i++) {
      const l = new PointLight(0xffd9a0, 0, 4, 1.4);
      this.pool.push(l);
      this.scene.add(l);
    }
    // what the studio stands in (clouds / city / snow), the sky by the hour
    const home = onLevel(all, building);
    this.winSig = cutsSig(home);
    this.around = new Surroundings(building, opts.themes, wallCuts(home));
    this.scene.add(this.around.root);
    this.floors.set(this.level, { world: this.world, sig: `${layoutSig(map)}|${this.wellSig}` });
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
      (f.s.material as SpriteMaterial).opacity = Math.max(0, 1 - f.t / f.life) * (f.grow ? 0.7 : 1);
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
  gameCam: { eye: [number, number, number]; look: [number, number, number]; showMe?: boolean; fov?: number } | null =
    null;
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
        objects,
        this.renderer.capabilities.getMaxAnisotropy(),
        (m) => this.light.patch(m),
        wells,
      );
      mine = { world, sig };
      this.floors.set(level, mine);
      this.scene.add(world.root);
    } else mine.world.update(objects);
    const changed = mine.world !== this.world || layoutSig(map) !== layoutSig(this.map);
    if (mine.world !== this.world) {
      // the floor I left keeps its drawing, without my floor's light map
      this.world.setLight(null);
      mine.world.setLight((m) => this.light.patch(m));
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
    this.poolDue = 0;
  }

  // what the studio stands in, again (a new layout, or the windows changed)
  private winSig = "";
  private surround(building: MapDef, home: WorldObjectDef[]) {
    this.scene.remove(this.around.root);
    this.around.dispose();
    this.around = new Surroundings(building, this.opts.themes, wallCuts(home));
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
      if (!b) {
        const world = new World3(this.items, lm, objs, this.renderer.capabilities.getMaxAnisotropy(), () => {}, wells);
        b = { world, sig };
        this.floors.set(f, b);
        this.scene.add(world.root);
      } else b.world.update(objs);
      const o = this.offsetTo(f);
      b.world.root.position.set(o.x, o.h, o.y);
      b.world.root.visible = true;
    }
    this.placeAround();
  }

  // The floors not built yet, built ahead in quiet moments (one at a time, a
  // little apart) and drawn once off screen — so their geometry and textures
  // are on the GPU and their shaders compiled before anyone goes there: a
  // floor change then only moves and shows what's ready.
  private allObjects: WorldObjectDef[] = [];
  private warmAt = 0;
  private warmTarget: WebGLRenderTarget | null = null;
  private warmCam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private warmUp(now: number) {
    if (now < this.warmAt || !this.allObjects.length) return;
    this.warmAt = now + 600;
    const f = floorsOf(this.building).find((l) => !this.floors.has(l));
    if (f === undefined) return;
    const lm = levelMap(this.building, f);
    if (!lm) {
      this.warmAt = Number.POSITIVE_INFINITY;
      return;
    }
    const all = this.allObjects;
    const wells = { floor: wellsOf(lm, all), ceiling: wellsOf(lm, all, "ceiling") };
    const world = new World3(this.items, lm, onLevel(all, lm), this.renderer.capabilities.getMaxAnisotropy(), () => {}, wells);
    this.floors.set(f, { world, sig: `${layoutSig(lm)}|${wellsKey(wells)}` });
    this.scene.add(world.root);
    const o = this.offsetTo(f);
    world.root.position.set(o.x, o.h, o.y);
    // drawn once, from above, all of it in view, into a tiny target
    this.warmTarget ??= new WebGLRenderTarget(4, 4);
    const c = this.warmCam;
    const r = Math.max(lm.width, lm.height) / 2 + 2;
    c.left = -r;
    c.right = r;
    c.top = r;
    c.bottom = -r;
    c.position.set(o.x + lm.width / 2, o.h + 60, o.y + lm.height / 2);
    c.lookAt(o.x + lm.width / 2, o.h, o.y + lm.height / 2);
    c.updateProjectionMatrix();
    const shadows = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setRenderTarget(this.warmTarget);
    // (both ways it's drawn: as the floor I'm on, with the light map, and as one below)
    world.setLight((m) => this.light.patch(m));
    this.renderer.render(this.scene, c);
    world.setLight(null);
    this.renderer.render(this.scene, c);
    this.renderer.setRenderTarget(null);
    this.renderer.shadowMap.autoUpdate = shadows;
    // (shown only if it's below mine)
    world.root.visible = f < this.level;
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
    // (its snow a hair under the ground floor's)
    this.around.campus.root.position.set(o.x, o.h - (home > 0 ? 0.03 : 0), o.y);
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
    this.pool.forEach((l, i) => {
      l.visible = i < this.lamps;
    });
    if (q === "high") {
      this.post ??= new Post3(this.renderer, this.scene, this.camera);
      this.post.setNight(this.nightLevel);
    } else {
      this.post?.dispose();
      this.post = null;
    }
    this.resize();
    this.poolDue = 0;
  }

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
      this.camera.fov = Math.max(40, Math.min(80, this.camera.fov * k));
      this.camera.updateProjectionMatrix();
      return;
    }
    this.dist *= k;
    this.clampCam();
  }

  setMode(m: CamMode) {
    if (m === this.mode) return;
    this.mode = m;
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
    // …and the sun's shadows (a soft moon at night)
    const [sr, sg, sb] = d.sun.color;
    this.sun.color.setRGB(sr, sg, sb, SRGBColorSpace);
    this.sun.intensity = d.sun.elevation > 0 ? 0.35 + 0.9 * Math.min(1, d.sun.elevation * 1.6) : 0.25;
    this.sun.userData.el = d.sun.elevation > 0.05 ? d.sun.elevation : 0.9;
    this.sun.userData.az = d.sun.elevation > 0.05 ? d.sun.azimuth : Math.PI * 0.6;
    // people and paper pictures aren't lit: they take the light map's tint (per person, in frame)
    this.tint.setRGB(0.55 + 0.45 * ar, 0.55 + 0.45 * ag, 0.6 + 0.4 * ab);
    this.light.setHour(h);
    // glass (windows, glass walls and doors) shows the night outside: darker after dark
    const g = 1 - 0.62 * d.night;
    this.world.materials.clear.color.setRGB(g * 0.92, g * 0.95, g, SRGBColorSpace);
    this.poolDue = 0;
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
  frame(dt: number, bodies: Body3[], meId: string) {
    this.time += dt;
    this.warmUp(performance.now());
    // everyone in my floor's frame: the floors below where they are, above not drawn
    bodies = bodies.flatMap((b) => {
      const l = b.level ?? this.level;
      const o = this.offsetTo(l);
      if (l === this.level) return [b];
      if (l > this.level) return [];
      return [{ ...b, x: b.x + o.x, y: b.y + o.y, z: (b.z ?? 0) + o.h, ground: (b.ground ?? 0) + o.h }];
    });
    const me = bodies.find((b) => b.id === meId);
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
      // the chase camera swings in behind you as you walk forward (not while you
      // strafe or walk towards it: that would spin you in circles)
      if (this.mode === "chase" && me.a === 1 && this.time - this.dragged > 1.2) {
        let d = (me.angle ?? dirAngle(me.d)) - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 1.0) this.yaw += d * Math.min(1, dt * 1.8) * (1 - Math.abs(d) / 1.0);
      }
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
      cam.set(
        this.target.x - Math.cos(this.yaw) * this.dist * cp,
        this.target.y + Math.sin(this.pitch) * this.dist,
        this.target.z - Math.sin(this.yaw) * this.dist * cp,
      );
      if (cam.y < 0.25) cam.y = 0.25;
      this.camera.lookAt(this.target);
    }

    // a game camera: ease over to it (and back when it lets go)
    const gc = this.gameCam;
    this.gcMix += ((gc ? 1 : 0) - this.gcMix) * (1 - Math.exp(-dt * 5));
    if (gc) {
      const k = this.gcReady ? 1 - Math.exp(-dt * 7) : 1;
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
    const fov = gc?.fov ?? (first ? (this.lensFov ?? this.camera.fov) : FOV);
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
    this.around.update(dt, this.camera.position, !me?.reduced);
    this.drawCues(dt, !!me?.reduced);
    this.placeSun();
    this.poolDue -= dt;
    if (this.poolDue <= 0) {
      this.assignLamps();
      this.poolDue = 0.3;
    }

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
      const angle3 = b.id === meId && b.angle !== undefined ? b.angle : dirAngle(b.d);
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
        p3.root.visible = !hidden3;
        if (b.id === meId) mySeat = seat3;
        p3.update({ ...b, angle: angle3, seat: seat3 }, dt, {
          camX: cam.x,
          camZ: cam.z,
          onScreen:
            (!hidden3 && this.frustum.intersectsSphere(this.sphere)) ||
            (b.id === meId && first && this.handsOn && handsDoing(b) !== ""),
          lowQuality: this.quality === "low",
        });
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
      const angle = b.id === meId && b.angle !== undefined ? b.angle : dirAngle(b.d);
      this.personTint.setHex(this.light.tintAt(b.x, b.y));
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
    // first person: my hands, posed by my body's motion, framed in front of my eyes
    const C3 = this.chars();
    if (first && this.handsOn && me && !me.npc && C3 && this.charF && this.charMats && this.gcMix < 0.002) {
      const angle = me.angle ?? dirAngle(me.d);
      this.hands ??= new Hands1P(C3, this.charF, this.charMats, { ...me, angle });
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
          const mat = new MeshBasicMaterial({ color });
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
    this.pitch = Math.max(L.pitch[0], Math.min(L.pitch[1], this.pitch));
    this.dist = Math.max(L.dist[0], Math.min(L.dist[1], this.dist));
  }

  // Walls standing between the camera and you go see-through (their upper part).
  private fadeWalls(dt: number) {
    const cam = this.camera.position;
    const t = this.target;
    // (first person: the camera is you — nothing stands between)
    const inside = this.mode === "first";
    for (const f of this.world.fades) {
      let block = false;
      const hit = inside ? null : segBox(cam.x, cam.z, t.x, t.z, f.x0 - 0.06, f.y0 - 0.06, f.x1 + 0.06, f.y1 + 0.06);
      if (hit !== null) {
        const h = cam.y + (t.y - 0.5 - cam.y) * hit;
        block = h < f.top + 0.1;
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

  private placeSun() {
    const el = this.sun.userData.el as number;
    const az = this.sun.userData.az as number;
    const t = this.target;
    // azimuth: east → south → west over the day; +y is "south" on the map
    const dx = -Math.cos(az) * Math.cos(el);
    const dz = Math.sin(az) * Math.cos(el);
    const dy = Math.sin(el);
    this.sun.position.set(t.x + dx * 30, dy * 30, t.z + dz * 30);
    this.sun.target.position.set(t.x, 0, t.z);
  }

  private assignLamps() {
    const d = daylight(this.hour);
    const t = this.target;
    const near = this.world.lights
      .map((l) => ({ l, d: Math.hypot(l.x - t.x, l.y - t.z) }))
      .filter((x) => x.d < 16)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lamps);
    const k = 0.15 + 1.1 * d.night; // (the light map has their pools; this lights what stands up)
    this.pool.forEach((p, i) => {
      const n = near[i];
      if (!n) {
        p.intensity = 0;
        return;
      }
      p.color.setHex(n.l.color);
      p.position.set(n.l.x, 1.05, n.l.y);
      p.distance = n.l.radius * 1.4;
      p.intensity = n.l.intensity * k;
    });
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
      if (e.button === 0) {
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
    // a click (not a drag): someone, or a spot on the floor
    if (e.type === "pointerup" && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6 && performance.now() - d.t < 600)
      this.pick(e.clientX, e.clientY, { shift: e.shiftKey, right: e.button === 2 });
  };

  // the nearest usable thing along the ray (its 3D box; see-through walls don't stop it)
  private pickObject(): string | null {
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    let best: string | null = null;
    let bestT = Number.POSITIVE_INFINITY;
    for (const p of this.world.picks) {
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
    const t = -o.y / dir.y;
    const x = o.x + dir.x * t;
    const y = o.z + dir.z * t;
    if (x >= 0 && y >= 0 && x < this.map.width && y < this.map.height) this.events.floor?.(x, y, mods);
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
  setLook(on: boolean) {
    const c = this.renderer.domElement;
    if (!on) {
      if (document.pointerLockElement === c) document.exitPointerLock();
      return;
    }
    if (this.looking || this.buildMode || !c.requestPointerLock) return;
    // raw mouse movement where there is (Chrome); a plain lock elsewhere (Firefox)
    const lock = c.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
    // a refusal: the promise says so (Chrome), or the error event (Firefox: no promise)
    const refused = () => this.events.lookRefused?.();
    this.lockAsked = 0;
    try {
      const p = lock.call(c, { unadjustedMovement: true });
      if (!p?.catch) this.lockAsked = 1;
      else
        p.catch(() => {
          if (document.pointerLockElement === c) return;
          const q = lock.call(c);
          if (q?.catch) q.catch(refused);
          else this.lockAsked = 1;
        });
    } catch {
      this.lockAsked = 1;
      lock.call(c);
    }
  }
  private onLockChange = () => {
    const on = document.pointerLockElement === this.renderer.domElement;
    if (on === this.looking) return;
    this.looking = on;
    this.drag = null;
    this.renderer.domElement.style.cursor = "";
    if (this.crosshair) this.crosshair.style.display = on ? "block" : "none";
    this.aimKey = "";
    if (!on) this.events.aim?.(null);
    this.events.look?.(on);
  };
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
    for (const p of this.people.values()) p.dispose();
    for (const p of this.people3.values()) p.dispose();
    this.hands?.dispose();
    this.charF?.dispose();
    for (const m of this.propMats.values()) m.dispose();
    (this.charMats?.body as Material | undefined)?.dispose();
    (this.charMats?.bodyAway as Material | undefined)?.dispose();
    for (const e of this.pets3.values()) e.model.dispose();
    this.games3?.dispose();
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
