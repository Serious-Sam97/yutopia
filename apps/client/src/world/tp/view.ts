import { crossings } from "@yutopia/shared/physics/structure-solids";
import type { Structure } from "@yutopia/shared/structure";
// (first: the fog chunks swapped before anything below makes a material — fog3d.ts)
import "./fog3d";
import {
  across,
  cutsSig,
  elevOf,
  entry,
  floorOf,
  floorsOf,
  HANDS_AT,
  hangSpot,
  homeOf,
  hostWorld,
  isFloor,
  isWindow,
  KEYBOARD_TOP,
  levelMap,
  liftFloorName,
  liftMotion,
  type MapDef,
  objLevel,
  offsetOf,
  onLevel,
  PIANO_STOOL,
  type Point,
  placedFootprint,
  SEAT_SPEC,
  STOREY,
  surfaceAt,
  tileAt,
  topCentre,
  type WorldObjectDef,
  wallCuts,
  wellsOf,
} from "@yutopia/shared";
import { BEAM, type Beam, beamOf } from "@yutopia/shared/beam";
import { type StreetThing, terrainAt } from "@yutopia/shared/grounds";
import { ALOFT, KH_MOVE, MV_AIM } from "@yutopia/shared/move";
import { localThing, localView } from "@yutopia/shared/structure/fold";
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
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sphere,
  SpotLight,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { tr } from "@/lib/i18n";
import type { Quality } from "@/lib/prefs";
import { chars, loadChars } from "../art/chars-load";
import { daylight } from "../art/daylight";
import type { people } from "../art/people-load";
import { loadPets, pets as petsArt } from "../art/pets-load";
import type { PetModel } from "../art/pets3d";
import type { PuffKind } from "../model";
import { activePad } from "../pads";
import { Arms3 } from "./arms3d";
import { HIDDEN_LAYER } from "./below-cull";
import { type FadeGroup, type Items, World3 } from "./build";
import { BuildLayer } from "./build3d";
import type { Outline } from "./campus";
import { FogBanks } from "./fog-banks";
import { flatLight } from "./fog3d";
import { FollowCam } from "./follow-cam";
import { type GameScene3, GamesIn3D, HAND_SIT, HAND_STAND } from "./games3d";
import { CASTER_LAYER } from "./grounds-stream";
import { Hands1P, handsDoing } from "./hands1p";
import { lazyMatrices } from "./lazy-matrices";
import { type LiftStop3, Lifts3, liftMats } from "./lift3d";
import { Light3, landLight, litBalance } from "./light3d";
import { type Live, LiveFeed, type LiveSources, LiveSurfaces } from "./live";
import { PROXIED } from "./merge-static";
import { Body } from "./parts/body";
import { BuildPick } from "./parts/buildpick";
import { FOV, GROUND_POOL, hashId, LAMPS, LIMITS, segBox } from "./parts/common";
import { Culling } from "./parts/culling";
import { Eyes } from "./parts/eyes";
import { Guns } from "./parts/guns";
import { Lens } from "./parts/lens";
import { MouseLook } from "./parts/look";
import { Mood } from "./parts/mood";
import { Pointer } from "./parts/pointer";
import { Prints } from "./parts/prints";
import { Seats } from "./parts/seats";
import { Sun } from "./parts/sun";
import { Tags } from "./parts/tags";
import { Vehicles } from "./parts/vehicles";
import { Warmup } from "./parts/warmup";
import { type Keys, Person3, type PersonIn } from "./people3d";
import { type Mats as CharMats, Person3D } from "./person3d";
import type { Post3 } from "./post3d";
import { Shroud3 } from "./shroud3d";
import { fogFor, type Ground, Surroundings, type Themes } from "./sky";
import { type StairStop3, Stairs3, stairMats } from "./stairs3d";
import { heldPoolBall, type TableScene3, TablesIn3D } from "./tables3d";
import { streetGeometry } from "./town3d";
import { edgesOfMap, edgesOfWalls, type WallEdges } from "./walls3d";
import { wx } from "./wx3d";

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
/** (plan 62) The keys: how far off a keyboard is still the one typed on (tiles); a keyboard's top
 *  over the desk (shared furniture.ts, the kit's keyboard: plan 67). */
const KEYS_REACH = 1.3;
const KEYBOARD_H = KEYBOARD_TOP;
/** (plan 62) The things each use puts the hands to. */
const PART_KINDS: Record<string, string[]> = {
  coffee: ["coffee_machine"],
  tea: ["kettle"],
  icecream: ["ice_cream_freezer"],
  water: ["water_cooler"],
  vending: ["vending", "drinks_fridge"],
  cocoa: ["cocoa_station"],
  piano: ["piano"],
  whiteboard: ["whiteboard"],
};
const footCentre = (o: WorldObjectDef) => {
  const { w, h } = placedFootprint(o);
  return { x: o.x + w / 2, y: o.y + h / 2 };
};
/** A thing's parts the hands go to (its drawing's own tiles and iso px, at rot 0 — art/items), in the
 *  world, for someone at (x, y): what's pressed first, then what's taken or played along. */
function partsOf(o: WorldObjectDef, here: WorldObjectDef[], x: number, y: number): Keys[] | null {
  const atM = ([lx, ly, m]: readonly [number, number, number]): Keys => {
    const [wx, wy] = hostWorld(o, lx, ly);
    return { x: wx, y: wy, h: m };
  };
  switch (o.kind) {
    // (where on each the hands go: shared furniture.ts HANDS_AT, m up — plan 67)
    case "water_cooler":
      // the cold tap; a paper cup from the holder on its side
      return [atM(HANDS_AT.water_cooler.tap), atM(HANDS_AT.water_cooler.cups)];
    case "vending":
      // the keypad; the flap, low down
      return [atM(HANDS_AT.vending.keypad), atM(HANDS_AT.vending.flap)];
    case "cocoa_station":
      // (plan 68) the urn's tap; a mug off the stack
      return [atM(HANDS_AT.cocoa_station.tap), atM(HANDS_AT.cocoa_station.mugs)];
    case "drinks_fridge":
      return [atM(HANDS_AT.drinks_fridge.handle), atM(HANDS_AT.drinks_fridge.shelf)];
    case "ice_cream_freezer":
      return [atM(HANDS_AT.ice_cream_freezer.lid), atM(HANDS_AT.ice_cream_freezer.tub)];
    case "piano": {
      // its keys, before the stool's middle; the stool (shared PIANO_STOOL), its top
      const [sx, sy] = PIANO_STOOL;
      const [, ky, kh] = HANDS_AT.piano.keys;
      return [atM([sx, ky, kh]), atM([sx, sy, SEAT_SPEC.stool.top])];
    }
    case "kettle":
    case "coffee_machine": {
      // on a counter: its buttons on top of the front, then the cup under the spout
      const c = topCentre(o);
      const host = surfaceAt(here, Math.floor(c.x), Math.floor(c.y));
      const top = host ? (entry(host.kind).surface ?? 0) : 0;
      const dx = x - c.x;
      const dy = y - c.y;
      const n = Math.hypot(dx, dy) || 1;
      return [
        { x: c.x + (dx / n) * 0.1, y: c.y + (dy / n) * 0.1, h: top + 0.4083 },
        { x: c.x + (dx / n) * 0.17, y: c.y + (dy / n) * 0.17, h: top + 0.0766 },
      ];
    }
    case "whiteboard": {
      // its face, at the height one writes, along it where they stand
      const h = hangSpot(o, 0.1);
      const span = placedFootprint(o);
      const horiz = span.w >= span.h;
      const u = horiz ? Math.max(o.x + 0.3, Math.min(o.x + span.w - 0.3, x)) : h.x;
      const v = horiz ? h.y : Math.max(o.y + 0.3, Math.min(o.y + span.h - 0.3, y));
      return [{ x: horiz ? u : h.x, y: horiz ? h.y : v, h: 1.35 }];
    }
  }
  return null;
}
const noLifts = (objects: WorldObjectDef[]): WorldObjectDef[] =>
  objects.filter((o) => o.kind !== "elevator" && o.kind !== "stairs");

export type CamMode = "chase" | "free" | "first";

export type Body3 = Omit<PersonIn, "angle"> & {
  id: string;
  yaw: number; // which way they face (world radians; `angle` when they turned freely)
  level?: number; // the floor they're on (shared levels.ts; their x / y are that floor's)
  angle?: number;
  mic?: boolean;
  bot?: boolean;
};

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

export interface ViewOpts {
  themes: Themes; // the themes chunk (the sky, trees), shared with iso
  keys?: boolean; // its own keyboard (the demo); the live world reads keys itself
  tags?: boolean; // name tags over heads (default on)
  level?: number; // the floor to show (shared levels.ts; default: the map's own)
  quality?: Quality; // the tier it starts at (Lowest: no antialiasing, for good)
  structure?: Structure | null; // the building's (its outline: the campus's outside — campus.ts)
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

// the phones' flashlights: spot lights (always there, dark when off: no shader
// changes), mine and the nearest other's; a beam you see in the snow and fog
const TORCHES = 2;
const PREP_LAYER = 30; // (things compiling: no camera draws it)
// the cone's mesh is built wide (shared beam.ts BEAM.wide) and scaled down to a focused one
const BEAM_LEN = BEAM.wide.len;
const BEAM_HALF = BEAM.wide.half;
const FOCUS_ALONG = BEAM.focus.len / BEAM_LEN;
const FOCUS_ACROSS = (Math.tan(BEAM.focus.half) * BEAM.focus.len) / (Math.tan(BEAM_HALF) * BEAM_LEN);
const LAMP_GLOW = 3.5; // how strongly a lamp post's pool lights what's under it at night
const CAM_ROOM = 2.2; // the least room in front of a wall for the camera to stand there (else it rises)
const CAM_LIFT_MAX = 1.3; // …up to this pitch
const EYE = 1.15; // tiles: what the camera looks at, above your feet
const SWIM_LIFT = 0.3; // …afloat, this much more: my head, just out of the water (feet 1.25 under)
// first person: where your eyes are (the name tag sits at 2.0 / 1.45)
const EYE_1P = 1.7;
const EYE_1P_SEATED = 1.2;
const VEIL_MS = 150; // into or out of first person: the dip to dark, and back (setMode)
const AIM_HELP = 0.12; // rad: aiming on a pad or keys, someone this near the reticle is helped onto

// the stairwells' tiles as a signature (a floor rebuilt when they change)
const wellsKey = (w: { floor: Set<string>; ceiling: Set<string> }) =>
  `${[...w.floor].sort().join(";")}/${[...w.ceiling].sort().join(";")}`;

/** A floor kept built (every floor is built once and kept): its layout's and stairwells' signature. */
type Floor3 = { world: World3; sig: string; lit?: Light3; wells: string };
/** Can a new layout be laid on this built floor (World3.relayout) — the same size and stairwells? */
const sameShape = (f: Floor3, map: MapDef, wells: string) =>
  f.wells === wells && f.world.map.width === map.width && f.world.map.height === map.height;

/** God mode's hands on the view (world/god): the pointer and the wheel, all of them, while it's on. */
export interface GodInput {
  down(e: PointerEvent): void;
  move(e: PointerEvent): void;
  up(e: PointerEvent): void;
  wheel(e: WheelEvent): void;
}

/** A floor as tp/build.ts and the light maps draw it: in its own frame (its corner at 0, 0 — shared
 *  structure/fold.ts localView), its things and its stairwells' tiles with it; `corner` where that
 *  frame sits in the world (its World3 and light map placed there). Everything else in the scene is
 *  the world's. (Phase 8 draws the structure in the world's frame and this goes.) */
function drawnFloor(lm: MapDef, here: WorldObjectDef[], all: WorldObjectDef[], structure: Structure | null) {
  const corner = lm.world ? { x: lm.ox ?? 0, y: lm.oy ?? 0 } : { x: 0, y: 0 };
  const map = localView(lm);
  const shift = (set: Set<string>) =>
    corner.x || corner.y
      ? new Set(
          [...set].map((k) => {
            const [x, y] = k.split(",").map(Number);
            return `${x - corner.x},${y - corner.y}`;
          }),
        )
      : set;
  // (its walls from the structure — walls3d.ts: phase 8 — or, with none, the map's edges)
  const edges = structure ? edgesOfWalls(structure.walls, floorOf(lm), corner) : edgesOfMap(map);
  // (its indoor slabs' rings — the lot's asphalt and concrete are open sky: no ceiling — for the
  // ceiling over them)
  const ringsOf = (keep: (top: string) => boolean) =>
    structure
      ? structure.slabs
          .filter((sl) => sl.floor === floorOf(lm) && keep(sl.top))
          .flatMap((sl) => [sl.outline, ...sl.holes])
          .map((r) => r.map(([x, y]): [number, number] => [x - corner.x, y - corner.y]))
      : null;
  const rings = ringsOf((t) => t !== "a" && t !== "c");
  // (and all of them: what's floor at all — below-cull's)
  const floorRings = ringsOf(() => true);
  return {
    map,
    objects: here.map((o) => localThing(lm, o)),
    wells: { floor: shift(wellsOf(lm, all)), ceiling: shift(wellsOf(lm, all, "ceiling")) },
    corner,
    edges,
    rings,
    floorRings,
  };
}
/** The home floor's outline from the structure, in the home map's own frame (campus.ts Outline: the
 *  campus's outside drawn from it — docs/plan/72 phase 8), made when it's asked for, and a key for
 *  what of it the facade draws: its slabs' rings and its windows' walls (an edit elsewhere leaves
 *  it). None without a structure (the map's, then). */
function outlineOf(building: MapDef, structure: Structure | null): { outline: () => Outline | null; key: string } {
  if (!structure) return { outline: () => null, key: "" };
  const f = floorOf(building);
  const corner = building.world ? { x: building.ox ?? 0, y: building.oy ?? 0 } : { x: 0, y: 0 };
  const rings = structure.slabs
    .filter((sl) => sl.floor === f)
    .flatMap((sl) => [sl.outline, ...sl.holes])
    .map((r) => r.map(([x, y]): [number, number] => [x - corner.x, y - corner.y]));
  // (windows on the outline only: floor one side, none the other — the facade's)
  const inside = (x: number, y: number) => crossings(rings, y).filter((c) => c < x).length % 2 === 1;
  const wins = structure.walls
    .filter((w) => {
      if (w.floor !== f || !isWindow(w.front)) return false;
      const [mx, my] = [(w.a[0] + w.b[0]) / 2 - corner.x, (w.a[1] + w.b[1]) / 2 - corner.y];
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
      const [nx, ny] = [-(w.b[1] - w.a[1]) / len / 2, (w.b[0] - w.a[0]) / len / 2];
      return inside(mx + nx, my + ny) !== inside(mx - nx, my - ny);
    })
    .map((w) => `${w.a}:${w.b}`)
    .sort();
  let made: Outline | null = null;
  return {
    outline: () => {
      made ??= { rings, edges: edgesOfWalls(structure.walls, f, corner) };
      return made;
    },
    key: `${JSON.stringify(rings)}|${wins.join(";")}`,
  };
}

/** (what the layout signature can't see: the walls off the lattice) */
const freeSig = (e: WallEdges) => (e.free.length ? JSON.stringify(e.free) : "");

export class ThirdPersonView {
  readonly warmup: Warmup = new Warmup(this);

  readonly body: Body = new Body(this);

  readonly culling: Culling = new Culling(this);

  readonly seats: Seats = new Seats(this);

  readonly tags: Tags = new Tags(this);

  readonly sunPart: Sun = new Sun(this);

  readonly mood: Mood = new Mood(this);

  readonly vehicles: Vehicles = new Vehicles(this);

  readonly buildPick: BuildPick = new BuildPick(this);

  readonly pointerPart: Pointer = new Pointer(this);

  readonly mouseLook: MouseLook = new MouseLook(this);

  readonly lensPart: Lens = new Lens(this);

  readonly guns: Guns = new Guns(this);

  readonly eyes: Eyes = new Eyes(this);

  readonly printsPart: Prints = new Prints(this);

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
  /** the building's structure (the controller's: plan 72 phase 6) — its walls and slabs are the
   *  physics' (physics3d.ts) */
  structure: Structure | null = null;
  level: number;
  // every floor built so far (mine is `world`); `lit`: the light map its things take
  floors = new Map<number, Floor3>();
  // the floors drawn below mine: each its own light map, so they take the hour too
  private below = new Map<number, Light3>();
  private wellSig = "";
  people = new Map<string, Person3>();
  // the 3D people (world/chars): a model each, built a few a frame; the
  // drawing above stands in until a person's model is ready (and for Vortex)
  people3 = new Map<string, Person3D>();
  charF: InstanceType<NonNullable<ReturnType<typeof chars>>["CharFactory"]> | null = null;
  private charMats: CharMats | null = null;
  private propMats = new Map<string, Material>();
  charsChunk = "";
  // first person: my own arms when they're doing something (hands1p.ts; Settings can turn them off)
  hands: Hands1P | null = null;
  handsSpare: Hands1P | null = null; // (made ahead, or put by out of first person)
  handsOn = true;
  // pets: real models (art/pets3d.ts), lit by the room, turned to where they walk
  pets3 = new Map<string, { model: PetModel; key: string; turned: number }>();
  private hemi = new HemisphereLight(0xffffff, 0x6b4a33, 1);
  sun = new DirectionalLight(0xffffff, 2);
  pool: PointLight[] = [];
  groundPool: PointLight[] = []; // the Grounds' lamps (groundLamps)
  around: Surroundings;
  host: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  ray = new Raycaster();
  live = new LiveSurfaces();
  light = new Light3();
  post: Post3 | null = null;
  quality: Quality = "high";
  lamps = LAMPS;
  nightLevel = 0;
  dark = 0; // out under the sky: daylight.ts `dark`
  fps = 60; // measured (auto quality steps down on it)
  // The pixel ratio, kept to the screen's (docs/plan/38-the-lag.md, round 3): a browser can
  // say 2 while this view starts and 1 a moment later (Firefox did, on a 1× monitor: 4× the
  // pixels until a reload), a window moves to another screen, a zoom: checked about once a
  // second, on the screen's density changing, and on every resize. What it started with and
  // how often it was put right go in the performance reports (world/telemetry.ts).
  ratioAtStart = 0;
  dprAtStart = 0;
  ratioFixes = 0;
  private ratioIn = 1; // (s to the next check)
  private dprQuery: MediaQueryList | null = null;
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
  pitch = 0.25; // (the KH camera's rest: follow-cam.ts CAM_TUNE.pitch)
  dist = 4.2;
  lean = 0.55; // how far people's drawings tip back towards a camera looking down
  hour = 12;
  target = new Vector3();
  private targetReady = false;
  padFree = true; // the gamepad moves me and the camera (not while it plays a console)
  /** the camera's keys held this frame (the arrows: docs/plan/56-the-controls.md phase 2) */
  keyLook = { x: 0, y: 0 };
  /** The chase camera after Kingdom Hearts 3 (follow-cam.ts: docs/plan/56-the-controls.md D): it
   *  owns yaw, pitch and distance in chase; the mouse, the stick and the arrows turn it. */
  readonly follow = new FollowCam();
  /** where I face (rad, the floor's atan2): R / R3 put the camera behind it (the controller's) */
  myFacing = 0;
  private recenterAsk = false;
  /** Behind me, now (R / R3). */
  recenter() {
    this.recenterAsk = true;
  }
  /** what I'm locked on to (docs/plan/56 E), my floor's coords, its feet's height: the camera
   *  frames us both, a ring at its feet (the controller's) */
  lockAt: { x: number; y: number; z: number; id?: string } | null = null;
  /** round a pole (Flowmotion's swing: docs/plan/56-the-controls.md F): the pole, my floor's, and
   *  how far round it I go — the camera holds still on it */
  swingAt: { x: number; y: number; r: number } | null = null;
  flickX = 0;
  /** A sideways flick of the mouse while locked on (-1, 1; 0 none): the next target that way. */
  takeFlick(): number {
    if (Math.abs(this.flickX) < 140) return 0;
    const s = Math.sign(this.flickX);
    this.flickX = 0;
    return s;
  }
  /** aiming help on a pad or the keys (not the mouse's: there you aim yourself), and who it helps
   *  onto (my floor's coords, chest high) — docs/plan/56 E */
  aimAssist = false;
  aimTargets: { x: number; y: number; z: number }[] = [];
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
  aimOn = false;
  aimTurn = 0;
  aimUp = 0;
  aimDir = new Vector3();
  aimHit = new Vector3(); // what the crosshair is on (the view's coords), aiming
  private aheadFor = 0; // s I've been going roughly where it looks
  private eyeY = EYE_1P; // first person: the eyes' height (eases sitting down / getting up)
  meId = "";
  dragged = -10; // time of the last manual turn
  activeAt = 0; // when the pointer or keys last did something here (performance.now)
  time = 0;

  // input
  private keys = new Set<string>();
  drag: { x: number; y: number; id: number; x0: number; y0: number; t: number } | null = null;
  private tint = new Color(1, 1, 1);
  personTint = new Color(1, 1, 1);
  // the Grounds' mood (docs/plan/27): the weather, the flashlights, breath in the cold
  storm = 0;
  torch3: {
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
  breathAt = new Map<string, number>();
  stormFog = new Color();
  /** The weather (shared weather.ts, eased by the controller). */
  setWeather(storm: number, wind: number) {
    this.storm = storm;
    this.wind = wind;
    this.around.setWeather(storm, wind);
  }
  /** What lies on the ground (the room's weather, docs/plan/65): the snow lying and how hard it's
   *  snowing now — the snow's layer (wx3d.ts) and the roads follow it. */
  setGround(g: Ground) {
    const { falling, temp } = g;
    this.around.setGround(g);
    // (a breath shows in the cold air only: none over 8 °C — W9)
    Person3D.airCold = temp === undefined ? 1 : Math.min(1, Math.max(0, (8 - temp) / 8));
    this.snowing = falling;
  }
  /** How hard it's snowing (the room's weather; 1 till it's said: a still's). */
  snowing = 1;
  wind = 0;
  /** The morning fog (the room's state, docs/plan/64-the-fog.md): its haze and its wall, 0 … 1,
   *  and how far it's lifted burning off; eased here (a called one comes at once). */
  setFog(haze: number, wall: number, lift = 0) {
    this.fogWant.haze = haze;
    this.fogWant.wall = wall;
    this.fogWant.lift = lift;
  }
  fogWant = { haze: 0, wall: 0, lift: 0 };
  /** How much the morning fog calls for lamps, 0 … 1 (none below 0.2 of it, all of it by 0.5): the
   *  cars' headlamps and the Grounds' vehicles' come on in it as after dark (docs/plan/64 F4). */
  /** How thick the air is with the morning fog, 0 … 1 (its haze or its wall): beams show in it. */
  get fogAir(): number {
    return Math.max(this.fogNow.haze, this.fogNow.wall);
  }
  get lampFog(): number {
    const f = Math.max(this.fogNow.haze, this.fogNow.wall);
    return Math.min(1, Math.max(0, (f - 0.2) / 0.3));
  }
  // the flashlight's beam in the air (its cone, its fade along, its shaders): airBeam's too
  private beamCone: ConeGeometry | null = null;
  private beamAlong: CanvasTexture | null = null;
  private beamVert = "";
  private beamFrag = "";
  /** A beam in the air like the flashlight's, for another light (the cars' headlamps): its mesh
   *  (tip at the lens, along +z; scale z by `len` / the length it's built at, x and y for the
   *  spread) and its material (`opacity`, `color`). Seen in fog, the snow, a storm. */
  airBeam(color: number): { mesh: Mesh; mat: ShaderMaterial; len: number; half: number } {
    const mat = new ShaderMaterial({
      uniforms: {
        color: { value: new Color(color) },
        opacity: { value: 0 },
        along: { value: this.beamAlong },
        time: { value: 0 },
        storm: { value: 0 },
        focus: { value: 0 },
        tight: { value: 1 },
      },
      vertexShader: this.beamVert,
      fragmentShader: this.beamFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    const mesh = new Mesh(this.beamCone ?? undefined, mat);
    mesh.visible = false;
    mesh.renderOrder = 4;
    return { mesh, mat, len: BEAM_LEN, half: BEAM_HALF };
  }
  banks: FogBanks | null = null;
  rime = 0;
  fogNow = { haze: 0, wall: 0, lift: 0 };
  // the room I'm in, for the fog (its tiles' bounds), and the tile it was found from
  roomAt = "";
  room: { x0: number; y0: number; x1: number; y1: number } | null = null;
  roomMap: MapDef | null = null; // (the floor's map it was found in: a new one, found again)
  // the sun and the open sky's fill by the hour (setHour), before the fog's flat light
  sunIntensity = 1;
  fillOut = 1;
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
    // (with alpha: a glass a real player shows through is a clear hole in the frame —
    // live.ts — the page under the canvas there; everywhere else it stays opaque)
    this.renderer = new WebGLRenderer({
      antialias: opts.quality !== "lowest",
      powerPreference: "high-performance",
      alpha: true,
    });
    this.renderer.setClearAlpha(1);
    // every render of the scene (mine, a car's mirror, the warm-up's): each floor's loose
    // pieces left out an area at a time when out of that camera's view (World3.cullLoose)
    this.scene.onBeforeRender = (_r, _s, cam) => {
      const f = this.culling.looseFrustum;
      this.culling.looseM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      f.setFromProjectionMatrix(this.culling.looseM);
      for (const b of this.floors.values()) if (b.world.root.parent) b.world.cullLoose(f);
      // the parked cars (still, a box each) out of this camera's view: off for this render
      // only — the shadow pass has them on again (they cast), and after it they're as they
      // were (the cars' own code shows and hides their models every frame)
      if (this.culling.viewCull)
        for (const top of this.scene.children)
          if (top.userData.cullKids && top.visible)
            for (const o of top.children) {
              if (!o.userData.still || !o.visible) continue;
              const b = this.culling.stillBox(o);
              if (b && !f.intersectsBox(b)) {
                o.visible = false;
                this.culling.viewHid.push(o);
              }
            }
    };
    this.scene.onAfterRender = () => {
      for (const o of this.culling.viewHid) o.visible = true;
      this.culling.viewHid.length = 0;
    };
    // (the shadow pass sees what's left out: three tests a caster's layers against the view's
    // camera there, not the light's — so for that pass the camera takes the hidden layer too)
    {
      const sm = this.renderer.shadowMap;
      const render = sm.render.bind(sm);
      // (and what the main pass left out is on again for it — below-cull.ts —, while the parts
      // of models whose shadow a proxy casts are off: nothing there to draw into it)
      const off: Object3D[] = [];
      sm.render = (lights: unknown, scene: unknown, camera: Camera) => {
        const mask = camera.layers.mask;
        camera.layers.enable(HIDDEN_LAYER);
        this.culling.below3.shadowPass(true);
        for (const o of this.culling.viewHid) o.visible = true;
        for (const root of PROXIED) {
          if (!root.parent) {
            PROXIED.delete(root);
            continue;
          }
          for (const c of root.userData.shadowSkip as Object3D[])
            if (c.visible) {
              c.visible = false;
              off.push(c);
            }
        }
        try {
          (render as (l: unknown, s: unknown, c: Camera) => void)(lights, scene, camera);
        } finally {
          camera.layers.mask = mask;
          this.culling.below3.shadowPass(false);
          for (const o of this.culling.viewHid) o.visible = false;
          for (const c of off) c.visible = true;
          off.length = 0;
        }
      };
    }
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.localClippingEnabled = true; // (the building cut above my floor: campus.cutAbove)
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setPixelRatio(this.ratioFor("high"));
    this.light.update(map, objects);
    this.seats.indexSeats(map, objects);
    this.world = new World3(
      items,
      map,
      noLifts(objects),
      this.renderer.capabilities.getMaxAnisotropy(),
      (m) => this.light.piece(m),
      wells,
    );
    this.scene.add(this.world.root);
    // a GPU reset (Chrome, mid-call) empties big canvases: draw the baked ones again
    this.renderer.domElement.addEventListener("webglcontextrestored", () => {
      this.world.rebakeFloor();
      this.light.redraw();
      for (const l of this.below.values()) l.redraw();
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
    this.beamCone = cone;
    this.beamAlong = along;
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
    this.beamVert = beamVert;
    this.beamFrag = beamFrag;
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
    this.structure = opts.structure ?? null;
    const out = this.outline();
    this.winSig = `${cutsSig(home)}|${out.key}`;
    this.around = new Surroundings(building, opts.themes, wallCuts(home), out.outline());
    this.around.floorLit = (m) => this.light.patch(m);
    this.prepareGrounds();
    this.scene.add(this.around.root);
    this.floors.set(this.level, {
      world: this.world,
      sig: `${layoutSig(map)}|${this.wellSig}`,
      lit: this.light,
      wells: this.wellSig,
    });
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
    this.buildPick.builder = new BuildLayer(map);
    this.scene.add(this.highlight, this.marker, this.earshotRing, this.live.root, this.buildPick.builder.root);
    this.setHour(12);
    this.warmup.setQuality("high");
  }

  // Little bursts, as iso's `puff`: warm sparks, confetti over a head (a card
  // done), a poof of dust, a drop. Tiny sprites with a bit of gravity.
  fx: {
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
  /** `lift`: m off the floor; `hard` (a jump's "land" / "kick"): how hard, 0..1 */
  puff(x: number, y: number, kind: PuffKind, lift = 0, hard = 1) {
    if (this.reduced) return;
    const z = lift + (kind === "land" || kind === "kick" ? 0.04 : 0);
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
  games3: GamesIn3D | null = null;
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
    return new Vector3(at.x + tx * 0.14 + tz * side, sitting ? HAND_SIT : HAND_STAND, at.z + tz * 0.14 - tx * side);
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
    const hand = new Vector3(b.x - (dx / len) * 0.18, 0.7655, b.y - (dy / len) * 0.18);
    const along = (t: number, h: number) => new Vector3(a.x + dx * t, h, a.y + dy * t);
    const pts = [new Vector3(a.x, 0.04, a.y), along(0.35, 0.015), along(0.75, 0.015), along(0.93, 0.18), hand];
    this.cable.geometry.dispose();
    this.cable.geometry = new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.016, 5);
    this.cable.visible = true;
  }

  // The game tables (Fita 13, tp/tables3d.ts): balls, cues, the lamp, rackets.
  private tables3: TablesIn3D | null = null;
  // (plan 62) who's on a pool shot now, and its cue (tables/pool.ts)
  private shooters = new Map<string, { tip: [number, number, number]; butt: [number, number, number] }>();
  setTables(s: TableScene3 | null) {
    this.shooters.clear();
    for (const c of s?.shooters ?? []) this.shooters.set(c.sid, c);
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
  // knocked down (shared/pool-throw.ts): when each fall was first seen here (performance.now)
  private falls = new Map<string, { at: number; t0: number }>();
  // a sound everyone near turns to (plan 58 9): the last shot, where and when
  private sound: { x: number; y: number; at: number } | null = null;
  heard(x: number, y: number) {
    this.sound = { x, y, at: performance.now() };
  }
  private heardBy(b: { x: number; y: number }): { t: number; x: number; y: number; loud: boolean } | undefined {
    const s = this.sound;
    if (!s) return undefined;
    const t = (performance.now() - s.at) / 1000;
    const d = Math.hypot(s.x - b.x, s.y - b.y);
    return t < 2.5 && d > 0.6 && d < 30 ? { t, x: s.x, y: s.y, loud: d < 8 } : undefined;
  }
  // struck (plan 58 7): when each blow was first seen here
  private hits = new Map<string, { at: number; t0: number }>();
  private hitOf(b: { id: string; hitAt?: number; hitYaw?: number }): { t: number; yaw: number } | undefined {
    const at = b.hitAt ?? 0;
    const h = this.hits.get(b.id);
    // (a blow already there when they're first seen — joining late — isn't played: only a new one)
    if (!h || h.at !== at) this.hits.set(b.id, { at, t0: h ? performance.now() : Number.NEGATIVE_INFINITY });
    const t = (performance.now() - (this.hits.get(b.id)?.t0 ?? 0)) / 1000;
    return at && t < 1.2 ? { t, yaw: b.hitYaw ?? 0 } : undefined;
  }
  private fellT(b: { id: string; fellAt?: number }): number | undefined {
    if (!b.fellAt) {
      this.falls.delete(b.id);
      return undefined;
    }
    let f = this.falls.get(b.id);
    if (!f || f.at !== b.fellAt) {
      f = { at: b.fellAt, t0: performance.now() };
      this.falls.set(b.id, f);
    }
    return (performance.now() - f.t0) / 1000;
  }
  /** God mode (world/god, docs/plan/53-the-god-mode.md): the ground point its camera looks at, my
   *  floor's frame (the land, the lamps and the sun round it, not round me), how far the camera
   *  is from it (the fog drawn back that far), and its pointer and wheel; null: the usual. The
   *  camera itself is a game camera (gameCam), eased in out of mine and back. */
  god: { at: Vector3; dist: number; input: GodInput } | null = null;
  gameCam: {
    eye: [number, number, number];
    look: [number, number, number];
    showMe?: boolean;
    fov?: number;
    snap?: boolean;
    /** tiles: people this near the lens hidden (2.7 unless said: a chess board's camera is a few
     *  centimetres over its men, the players beside it — plan 70) */
    lens?: number;
  } | null = null;
  private gcEye = new Vector3();
  private gcLook = new Vector3();
  gcMix = 0; // 0 = the usual camera, 1 = the game's
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
      g.position.set(c.x, c.z, c.y);
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
    this.body.startPhysics();
    const c = this.renderer.domElement;
    c.style.display = "block";
    c.style.touchAction = "none";
    c.setAttribute("aria-label", "Yutopia world");
    host.appendChild(c);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.watchDpr();
    this.resize();
    c.addEventListener("pointerdown", this.pointerPart.onDown);
    c.addEventListener("pointermove", this.pointerPart.onMove);
    c.addEventListener("pointerup", this.pointerPart.onUp);
    c.addEventListener("pointercancel", this.pointerPart.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", this.noMenu);
    document.addEventListener("pointerlockchange", this.mouseLook.onLockChange);
    document.addEventListener("pointerlockerror", this.mouseLook.onLockError);
    const x = document.createElement("div");
    x.style.cssText =
      "position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;" +
      "background:#f6eedb;box-shadow:0 0 0 1.5px rgba(26,16,10,.75);pointer-events:none;display:none;" +
      "transition:transform .12s,background .12s";
    host.appendChild(x);
    this.mouseLook.crosshair = x;
    const veil = document.createElement("div");
    veil.style.cssText = `position:absolute;inset:0;background:#0b0907;opacity:0;pointer-events:none;transition:opacity ${VEIL_MS}ms ease`;
    host.appendChild(veil);
    this.veil = veil;
    if (this.opts.keys !== false) {
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("keyup", this.onKey);
      window.addEventListener("blur", this.onBlur);
    }
    if (this.opts.tags !== false) {
      const t = document.createElement("div");
      t.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
      host.appendChild(t);
      this.tags.tagLayer = t;
    }
  }

  // The room as it is now: a new layout builds it all again; otherwise only
  // the areas whose things changed are redrawn (cheap: call it often).
  // `building`: the home map with every floor; `objects`: everything on every
  // floor; `level`: the floor I'm on.
  private lightLater: (() => void) | null = null;
  update(building: MapDef, objects: WorldObjectDef[], level = this.level) {
    const map = levelMap(building, level) ?? building;
    const moved = level !== this.level;
    const from = this.level;
    this.building = building;
    this.level = level;
    const all = objects;
    this.allObjects = all;
    objects = onLevel(all, map);
    this.hereObjects = objects;
    this.keysAt.clear();
    this.partsAt.clear();
    // (my floor drawn in its own frame, placed at its corner: drawnFloor)
    const drawn = drawnFloor(map, objects, all, this.structure);
    const wells = drawn.wells;
    const wellSig = wellsKey(wells);
    // my floor: kept from before (every floor is built once and kept — going
    // up or down only moves and shows them), built again when its layout changed
    const sig = `${layoutSig(map)}|${wellSig}|${freeSig(drawn.edges)}`;
    let mine = this.floors.get(level);
    // (a wall built or a tile laid: the floor kept, its walls and floor made again — World3.relayout;
    // another size or other stairwells: built anew)
    const relay = !!mine && mine.sig !== sig && sameShape(mine, drawn.map, wellSig);
    // (an edit on the floor I'm on — its walls drawn this frame —: its light the next, with the
    // things it touched; docs/plan/72 phase 8, an edit's cost)
    const lightNow = () => {
      this.lightLater = null;
      this.light.update(drawn.map, drawn.objects);
    };
    if (relay && !moved && mine?.world === this.world) {
      this.lightLater = lightNow;
      requestAnimationFrame(() => this.lightLater === lightNow && lightNow());
    } else lightNow();
    this.light.setOffset(drawn.corner.x, drawn.corner.y);
    this.seats.indexSeats(map, objects);
    const home = onLevel(all, building);
    // (the campus's outside: again when the studio's windows changed, or its outline from the
    // structure — its slabs' edge, its window walls)
    const winSig = `${cutsSig(home)}|${this.outline().key}`;
    let relaid = false;
    if (mine && relay) {
      mine.world.relayout(drawn.map, noLifts(drawn.objects), drawn.edges, drawn.rings, drawn.floorRings);
      mine.sig = sig;
      mine.wells = wellSig;
      relaid = true;
    } else if (mine && mine.sig !== sig) {
      this.scene.remove(mine.world.root);
      mine.world.dispose();
      mine = undefined;
    }
    if (!mine) {
      const world = new World3(
        this.items,
        drawn.map,
        noLifts(drawn.objects),
        this.renderer.capabilities.getMaxAnisotropy(),
        (m) => this.light.piece(m),
        wells,
        drawn.edges,
        drawn.rings,
        drawn.floorRings,
      );
      mine = { world, sig, lit: this.light, wells: wellSig };
      this.floors.set(level, mine);
      this.scene.add(world.root);
    } else if (!relaid) mine.world.update(noLifts(drawn.objects));
    if (moved) this.cameraAcross(from);
    const changed = mine.world !== this.world || layoutSig(map) !== layoutSig(this.map);
    if (mine.world !== this.world) {
      // (the floor I left takes its own light map below mine: placeFloors)
      if (mine.lit !== this.light) mine.world.setLight((m) => this.light.piece(m));
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
    this.buildPick.builder.setMap(map);
    const fog = fogFor();
    (this.scene.fog as Fog).near = fog.near;
    (this.scene.fog as Fog).far = fog.far;
    this.camera.far = fog.cameraFar;
    this.camera.updateProjectionMatrix();
    this.setHour(this.hour); // (the new room's glass, the new sky)
  }

  // what the studio stands in, again (a new layout, or the windows changed)
  private winSig = "";
  // (the home floor's outline, kept while the structure's the same)
  private outlined: { of: Structure | null; building: MapDef | null; at: ReturnType<typeof outlineOf> } = {
    of: null,
    building: null,
    at: { outline: () => null, key: "" },
  };
  private outline(): ReturnType<typeof outlineOf> {
    const o = this.outlined;
    if (o.of !== this.structure || o.building !== this.building) {
      this.outlined = { of: this.structure, building: this.building, at: outlineOf(this.building, this.structure) };
    }
    return this.outlined.at;
  }
  private surround(building: MapDef, home: WorldObjectDef[]) {
    this.scene.remove(this.around.root);
    this.banks?.dispose();
    this.banks = null;
    this.around.dispose();
    this.around = new Surroundings(building, this.opts.themes, wallCuts(home), this.outline().outline());
    this.around.floorLit = (m) => this.light.patch(m);
    this.prepareGrounds();
    this.scene.add(this.around.root);
    this.placeAround();
    this.setHour(this.hour);
  }

  // Where floor `level`'s own frame is (its corner: what tp/build.ts and the light maps draw from)
  // and how far it is up from mine. (Everything else — people, things — is in the world's frame:
  // a floor is only up or down from mine.)
  private cornerTo(level: number): { x: number; y: number; h: number } {
    const a = offsetOf(this.building, level);
    return { x: a.x, y: a.y, h: this.upTo(level) };
  }
  private upTo(level: number): number {
    return elevOf(level) - elevOf(this.level);
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
          if (!b.world.root.parent) this.scene.add(b.world.root);
          b.world.root.visible = true;
          const c = offsetOf(this.building, f);
          b.world.root.position.set(c.x, 0, c.y);
          b.world.root.updateMatrix(); // (World3: its matrix made when it moves)
          b.world.setFading(true);
        }
        continue;
      }
      let b = this.floors.get(f);
      if (f > this.level) {
        // (out of the scene, not just hidden: three would still walk it every frame)
        if (b) this.scene.remove(b.world.root);
        continue;
      }
      const wlm = levelMap(this.building, f);
      if (!wlm) continue;
      const drawn = drawnFloor(wlm, onLevel(all, wlm), all, this.structure);
      const { map: lm, objects: objs, wells, edges, rings, floorRings } = drawn;
      const wk = wellsKey(wells);
      const sig = `${layoutSig(lm)}|${wk}|${freeSig(edges)}`;
      let relaid = false;
      if (b && b.sig !== sig && sameShape(b, lm, wk)) {
        b.world.relayout(lm, noLifts(objs), edges, rings, floorRings);
        b.sig = sig;
        b.wells = wk;
        relaid = true;
      } else if (b && b.sig !== sig) {
        this.scene.remove(b.world.root);
        b.world.dispose();
        b = undefined;
      }
      const o = this.cornerTo(f);
      const lit = this.belowLight(f, lm, objs);
      lit.setOffset(o.x, o.y);
      if (!b) {
        const world = new World3(
          this.items,
          lm,
          noLifts(objs),
          this.renderer.capabilities.getMaxAnisotropy(),
          (m) => lit.piece(m),
          wells,
          edges,
          rings,
          floorRings,
        );
        b = { world, sig, lit, wells: wk };
        this.floors.set(f, b);
        this.scene.add(world.root);
      } else if (!relaid) b.world.update(noLifts(objs));
      if (b.lit !== lit) {
        b.world.setLight((m) => lit.piece(m));
        b.lit = lit;
      }
      if (!b.world.root.parent) this.scene.add(b.world.root);
      b.world.root.position.set(o.x, o.h, o.y);
      b.world.root.updateMatrix();
      b.world.root.visible = true;
      b.world.setFading(false); // (a floor below never fades)
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
  lifts3: Lifts3 | null = null;
  private liftObjs: WorldObjectDef[] = [];
  private liftSince = new Map<string, number>();
  liftSway = 0; // (the car I'm riding: its sway, tiles)
  liftRise = 0; // (and how far up from my floor its floor is, on the way: tiles)
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
        off: { x: 0, y: 0, h: this.upTo(level) },
        motion,
        floors,
        floor: liftFloorName(level),
        mine: level === this.level,
        shown: level <= this.level, // (the floors above aren't drawn — kept, hidden)
        inside: level === this.level && o.id === this.liftIn,
        sway: level === this.level && motion.phase === "moving" ? this.liftSway : 0,
        rise: level === this.level && o.id === this.liftIn && motion.phase === "moving" ? this.liftRise : 0,
      });
    }
    this.lifts3.sync(stops);
  }

  // The staircases (tp/stairs3d.ts): each floor's stairwell, its fire doors
  // opening for whoever comes near (anyone on that floor, as drawn here)
  stairs3 = new Stairs3();
  private syncStairs(dt: number, bodies: Body3[]) {
    const stops: StairStop3[] = [];
    for (const o of this.allObjects) {
      if (o.kind !== "stairs") continue;
      const level = objLevel(o, this.building);
      const off = { x: 0, y: 0, h: this.upTo(level) };
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
  allObjects: WorldObjectDef[] = [];
  private hereObjects: WorldObjectDef[] = [];

  // (plan 62) The keys someone at a desk types on: the keyboard ahead of them (else in front of the
  // computer or the monitor they face), its middle on the floor and its top's height — by where they
  // are and the way they face, as the room's things are now.
  private keysAt = new Map<string, Keys | null>();
  private keysFor(x: number, y: number, angle: number): Keys | null {
    const key = `${x.toFixed(2)}|${y.toFixed(2)}|${Math.round((angle * 4) / Math.PI)}`;
    const had = this.keysAt.get(key);
    if (had !== undefined) return had;
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    let best: Keys | null = null;
    let bestD = KEYS_REACH;
    for (const o of this.hereObjects) {
      const d = o.kind === "tabletop" ? String(o.props?.d) : "";
      const board = d === "keyboard";
      if (!board && d !== "monitor" && o.kind !== "computer") continue;
      const c = topCentre(o);
      const host = surfaceAt(this.hereObjects, Math.floor(c.x), Math.floor(c.y));
      const top = host ? (entry(host.kind).surface ?? 0) : 0;
      // (a screen faces whoever uses it: the keys a little this side of it, on the desk)
      let kx = c.x;
      let ky = c.y;
      if (!board) {
        const dx = x - c.x;
        const dy = y - c.y;
        const n = Math.hypot(dx, dy) || 1;
        kx += (dx / n) * 0.3;
        ky += (dy / n) * 0.3;
      }
      const ahead = (kx - x) * fx + (ky - y) * fy;
      const dist = Math.hypot(kx - x, ky - y);
      if (ahead < 0.15 || ahead < dist * 0.6) continue;
      const score = dist - (board ? 0.3 : 0);
      if (score < bestD) {
        bestD = score;
        best = { x: kx, y: ky, h: top + (board ? KEYBOARD_H : 0) };
      }
    }
    if (this.keysAt.size > 256) this.keysAt.clear();
    this.keysAt.set(key, best);
    return best;
  }

  // (plan 62, phase 3) What someone busy at a thing puts their hands to, on the thing itself: the
  // nearest of its kind ahead of them, its parts from its drawing (art/items, rot 0) turned with it —
  // a machine's button then where its drink comes out, a tap, the piano's keys, the whiteboard's face
  // (along it where they stand). Floor x, y and height (tiles).
  private partsFor(busy: string, x: number, y: number, angle: number): Keys[] | null {
    const kinds = PART_KINDS[busy];
    if (!kinds) return null;
    const key = `${busy}|${x.toFixed(2)}|${y.toFixed(2)}|${Math.round((angle * 4) / Math.PI)}`;
    const had = this.partsAt.get(key);
    if (had !== undefined) return had;
    let best: WorldObjectDef | null = null;
    let bestD = 2.5;
    for (const o of this.hereObjects) {
      if (!kinds.includes(o.kind)) continue;
      const c = entry(o.kind).wall ? hangSpot(o, 0.1) : entry(o.kind).onSurface ? topCentre(o) : footCentre(o);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    let out: Keys[] | null = null;
    if (best) out = partsOf(best, this.hereObjects, x, y);
    if (this.partsAt.size > 256) this.partsAt.clear();
    this.partsAt.set(key, out);
    return out;
  }
  private partsAt = new Map<string, Keys[] | null>();
  warmAt = 0;
  cutWarm = false;
  warmTarget: WebGLRenderTarget | null = null;
  warmCam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private warmUp(now: number) {
    if (now < this.warmAt || !this.allObjects.length) return;
    // (not before the sun's shadow map is made: drawn without it — the warm-up
    // keeps it from updating — every lit thing's draw failed, a burst of GL errors)
    if (this.sun.castShadow && !this.sun.shadow.map) return;
    // (behind the loading screen: one after another, a frame apart)
    this.warmAt = now + (this.warmup.warm ? 0 : 600);
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
        const o = this.cornerTo(homeOf(this.building));
        c.position.set(o.x + hw / 2, o.h + 80, o.y + hh / 2);
        c.lookAt(o.x + hw / 2, o.h - 20, o.y + hh / 2);
        c.far = 400;
        c.updateProjectionMatrix();
        this.warmup.warmDraw(c);
        this.lifts3?.showAll(false);
        this.stairs3.showAll(false);
        this.around.campus.cutAbove(STOREY - 0.15);
        this.warmup.warmDraw(this.camera);
        this.around.campus.cutAbove(null);
      }
      return;
    }
    const wlm = levelMap(this.building, f);
    if (!wlm) {
      this.warmAt = Number.POSITIVE_INFINITY;
      return;
    }
    const all = this.allObjects;
    const {
      map: lm,
      objects: objs,
      wells,
      edges,
      rings,
      floorRings,
    } = drawnFloor(wlm, onLevel(all, wlm), all, this.structure);
    const o = this.cornerTo(f);
    const lit = this.belowLight(f, lm, objs);
    lit.setOffset(o.x, o.y);
    const world = new World3(
      this.items,
      lm,
      noLifts(objs),
      this.renderer.capabilities.getMaxAnisotropy(),
      (m) => lit.piece(m),
      wells,
      edges,
      rings,
      floorRings,
    );
    const wk = wellsKey(wells);
    this.floors.set(f, { world, sig: `${layoutSig(lm)}|${wk}|${freeSig(edges)}`, lit, wells: wk });
    this.scene.add(world.root);
    world.root.position.set(o.x, o.h, o.y);
    world.root.updateMatrix();
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
    this.warmup.warmDraw(c);
    // (kept only if it's below mine: one above waits out of the scene)
    if (f > this.level) this.scene.remove(world.root);
    else world.root.visible = f < this.level;
  }

  // My floor changed: the scene now sits round the new one. Up or down the
  // stairs (`carryFrom` = the floor I came from) the camera keeps its place in
  // the building — shifted with it, no swoop; any other way (an elevator's
  // arrival, a teleport) it's simply there at once.
  carryFrom: number | null = null;
  private cameraAcross(from: number) {
    if (this.carryFrom === from) {
      const d = new Vector3(0, this.upTo(from), 0);
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
    const o = this.cornerTo(home);
    // (its snow a little under the ground floor's: what it lays on the snow —
    // shadows, slush, light — stays clear of the floor's own surface, or the
    // two fight over the same depth and flicker)
    this.around.campus.root.position.set(o.x, o.h - (home > 0 ? 0.05 : 0), o.y);
    this.around.campus.skinAlways = this.level < home;
  }

  // the ratio a fresh load picks on this screen at this quality
  ratioFor(q: Quality): number {
    const dpr = window.devicePixelRatio || 1;
    return q === "high" ? Math.min(2, dpr) : q === "medium" ? Math.min(1.5, dpr) : q === "low" ? 1 : 0.75;
  }

  // the screen's density changed (a moved window, a zoom): to the new one at once
  private onDpr = () => {
    this.watchDpr();
    if (this.ratioFor(this.quality) !== this.renderer.getPixelRatio()) this.resize();
  };
  private watchDpr() {
    this.dprQuery?.removeEventListener("change", this.onDpr);
    this.dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) ?? null;
    this.dprQuery?.addEventListener("change", this.onDpr);
  }

  resize() {
    if (!this.host) return;
    const ratio = this.ratioFor(this.quality);
    if (ratio !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(ratio);
      this.ratioFixes++;
    }
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

  pageRect = () => this.renderer.domElement.getBoundingClientRect();

  // the lock-on's ring at its feet, turning (docs/plan/56-the-controls.md E)
  private lockRing: Mesh | null = null;
  private drawLock() {
    const l = this.lockAt;
    if (!l && !this.lockRing) return;
    if (!this.lockRing) {
      this.lockRing = new Mesh(
        new RingGeometry(0.62, 0.72, 48).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({ color: 0xf1d79a, transparent: true, opacity: 0.85, depthTest: false }),
      );
      this.lockRing.renderOrder = 20;
      this.scene.add(this.lockRing);
    }
    const r = this.lockRing;
    r.visible = !!l;
    if (!l) return;
    // (someone: at their feet as they're drawn — out on the land the drawing's height is the view's)
    const drawn = l.id ? this.people3.get(l.id)?.root.position : undefined;
    if (drawn) r.position.set(drawn.x, drawn.y + 0.04, drawn.z);
    else r.position.set(l.x, l.z + 0.04, l.y);
    r.rotation.y = this.time * 1.6;
  }
  // someone near the reticle, aiming (within AIM_HELP of where I look, near enough): how far off
  private aimNear(me: { x: number; y: number }): { off: number } | null {
    let best: { off: number } | null = null;
    for (const t of this.aimTargets) {
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      if (d < 0.5 || d > 25) continue;
      const way = Math.atan2(t.y - me.y, t.x - me.x);
      const off = Math.atan2(Math.sin(way - this.lookYaw), Math.cos(way - this.lookYaw));
      if (Math.abs(off) < AIM_HELP && (!best || Math.abs(off) < Math.abs(best.off))) best = { off };
    }
    return best;
  }

  // Into or out of my head the screen dips to dark and the camera changes there,
  // unseen (the jump from behind me to my eyes: docs/plan/35-the-loading.md).
  private modeNext: CamMode | null = null;
  private veil: HTMLDivElement | null = null;
  private veilT = 0;
  setMode(m: CamMode) {
    if (m === (this.modeNext ?? this.mode)) return;
    const across = (m === "first") !== (this.mode === "first");
    if (across && this.veil && this.warmup.drawn > 0 && !this.warmup.warm) {
      this.modeNext = m;
      if (this.veilT) return; // (already dipping: it takes the latest at the bottom)
      this.veil.style.opacity = "1";
      this.veilT = window.setTimeout(() => {
        this.veilT = 0;
        const next = this.modeNext;
        this.modeNext = null;
        if (next) this.applyMode(next);
        // (lifted once a frame or two are drawn the new way)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (this.veil) this.veil.style.opacity = "0";
          }),
        );
      }, VEIL_MS);
      return;
    }
    this.modeNext = null;
    this.applyMode(m);
  }
  private applyMode(m: CamMode) {
    if (m === this.mode) return;
    this.mode = m;
    this.mouseLook.showCrosshair();
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
    this.fillOut = 1 - 0.4 * k;
    litBalance.lmFillOut.value = this.fillOut * flatLight(this.fogNow.wall).fill;
    // …and the lamp posts' pools come up after dark (light3d.ts: stored halved)
    // (five times as strong in the pitch dark: islands on the dark asphalt — docs/plan/44-the-night.md N2)
    litBalance.lmGlowK.value = 2 * LAMP_GLOW * Math.min(1, Math.max(0, (d.night - 0.1) / 0.4)) * (1 + 4 * d.dark);
    litBalance.lmDark.value = d.dark;
    this.dark = d.dark;
    // …and the sun's shadows (a soft moon at night)
    const [sr, sg, sb] = d.sun.color;
    this.sun.color.setRGB(sr, sg, sb, SRGBColorSpace);
    // (sun and moon blended round the horizon: the shadows turned over at once
    // when the sun went down, and came back as suddenly at dawn)
    const el = d.sun.elevation;
    const w = Math.min(1, Math.max(0, (el + 0.1) / 0.25));
    const sw = w * w * (3 - 2 * w);
    this.sunIntensity = 0.25 + (0.1 + 0.9 * Math.min(1, Math.max(0, el) * 1.6)) * sw;
    this.sun.intensity = this.sunIntensity * flatLight(this.fogNow.wall).sun;
    this.sun.userData.el = 0.9 + (Math.max(0.05, el) - 0.9) * sw;
    this.sun.userData.az = Math.PI * 0.6 + (d.sun.azimuth - Math.PI * 0.6) * sw;
    // people and paper pictures aren't lit: they take the light map's tint (per person, in frame)
    this.tint.setRGB(0.55 + 0.45 * ar, 0.55 + 0.45 * ag, 0.6 + 0.4 * ab);
    this.light.setHour(h);
    for (const l of this.below.values()) l.setHour(h);
    // glass (windows, glass walls and doors) shows the night outside: darker after dark
    const g = 1 - 0.62 * d.night;
    const glass = this.world.materials;
    for (const m of [glass.clear, glass.clearBack, glass.clearFront])
      m.color.setRGB(g * 0.92, g * 0.95, g, SRGBColorSpace);
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

  /** Each body's feet as they're put down (docs/plan/63-the-steps.md): its id, which foot — set by
   *  the controller (mine, everyone else's near). */
  onStep: ((id: string, side: "L" | "R") => void) | undefined = undefined;
  /** Both feet down at once out of a body's own hop (`hard` 0..1) — set by the controller. */
  onHop: ((id: string, hard: number) => void) | undefined = undefined;
  /** A body limp on the ragdoll hitting something (`hard` 0..1) — set by the controller. */
  onThud: ((id: string, hard: number) => void) | undefined = undefined;
  /** What's under (x, y) from z down on `level` and what it is, as Jolt has it (the steps'), or null
   *  till the physics is in. */
  underfoot(level: number, x: number, y: number, z: number): { g: number; on: string } | null {
    return this.body.physics?.underfoot(level, x, y, z) ?? null;
  }

  /** How the Grounds sit in the scene: as high as the ground floor is from mine (their x, z the
   *  scene's: plan 72's one frame), and whether they're drawn. */
  groundsFrame(): { y: number; visible: boolean } {
    return { y: elevOf(0) - elevOf(this.level), visible: !!this.around.grounds };
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

  // One frame: people from the world's bodies (`me` = whose camera this is).
  /** Bodies besides the room's people: the shadowed (world/dark, docs/plan/30-the-dark.md D5). */
  extraBodies: (() => Body3[]) | null = null;
  private shroud: Shroud3 | null = null;
  /** Who's down (crawling) and who's kneeling by them getting them up (world/dark says; D7). */
  downed = new Map<string, "down" | "kneel">();
  /** Flares burning (world/dark gives them: the floor's coords, feet z, s lit): a red ground lamp each. */
  flares: { x: number; y: number; z: number; t: number }[] = [];
  deaths: { x: number; y: number; z: number; t: number }[] = [];
  private arms3: Arms3 | null = null;
  /** Shots, sparks, flares in the air and on the snow (tp/arms3d.ts), made when first wanted. */
  arms(): Arms3 {
    this.arms3 ??= new Arms3(this.scene);
    return this.arms3;
  }

  /** `seat`: where I am when I'm not among `bodies` (in a car, which draws me — world/car/cars.ts):
   *  what the camera's target follows (the land streamed round it, the shadows, the lamps). */
  frame(dt: number, bodies: Body3[], meId: string, seat?: { x: number; y: number; ground: number; level: number }) {
    this.time += dt;
    // (the swimmers' rings and wakes, found again each frame; the bubbles up: plan 66)
    for (const v of wx.wxSwim.value) v.w = 0;
    this.mood.swimN = 0;
    this.mood.bubbleDt = dt;
    this.mood.bubbles?.step(dt, this.time);
    this.ratioIn -= dt;
    if (this.ratioIn <= 0) {
      this.ratioIn = 1;
      if (this.ratioFor(this.quality) !== this.renderer.getPixelRatio()) this.resize();
    }
    if (this.extraBodies) bodies = bodies.concat(this.extraBodies());
    // the furniture's live parts (plan 68: flames, a lava lamp's blobs), on every floor shown, near
    // the camera
    {
      const cam = this.camera.position;
      for (const w of new Set([this.world, ...[...this.floors.values()].map((b) => b.world)]))
        if (w.root.parent) w.animateLive(this.time, { x: cam.x - w.root.position.x, z: cam.z - w.root.position.z });
    }
    this.warmUp(performance.now());
    this.syncLifts(performance.now());
    // everyone where they are (the world's frame): the floors below down where they are, above not drawn
    bodies = bodies.flatMap((b) => {
      // (on the earbud — on a call, the phone put away: no phone in the hand, a bud in the ear)
      if (b.phone === "bud") b = { ...b, phone: "", bud: true };
      const l = b.level ?? this.level;
      if (l === this.level) return [b];
      if (l > this.level) return [];
      const h = this.upTo(l);
      return [{ ...b, z: (b.z ?? 0) + h, ground: (b.ground ?? 0) + h }];
    });
    const me = bodies.find((b) => b.id === meId);
    this.syncStairs(dt, bodies);
    const pad = this.padFree ? activePad() : null;
    // look around: the arrows, the right stick — the chase camera's the KH camera's (follow-cam.ts,
    // below); the others turn as they did (Q / E in the views that read their own keys)
    // (build mode keeps the camera where it's put: placing things, it mustn't come round)
    const chase = this.mode === "chase" && !this.god && !this.buildPick.buildMode;
    let lx = this.keyLook.x;
    let ly = this.keyLook.y;
    if (pad) {
      const [, , rx = 0, ry = 0] = pad.axes;
      if (!lx && Math.abs(rx) > 0.15) lx = rx;
      if (!ly && Math.abs(ry) > 0.15) ly = ry;
    }
    if (!chase) {
      let turn = lx;
      if (ly) this.pitch += ly * dt * 1.4;
      if (this.opts.keys !== false) {
        if (this.keys.has("KeyQ")) turn -= 1;
        if (this.keys.has("KeyE")) turn += 1;
      }
      if (turn) {
        this.yaw += turn * dt * 2.2;
        this.dragged = this.time;
      }
    } else if (lx || ly) this.dragged = this.time;
    // mouse look: the mouse aims the camera (no swinging in behind you)
    if (this.mouseLook.looking) {
      this.dragged = this.time;
      this.mouseLook.aimAt();
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
      if (chase) {
        // aiming on a pad or the keys: over someone near the reticle the turn slows and is drawn
        // onto them a little; locked on, the camera's own lock aims at them (docs/plan/56 E)
        const near = this.aim && this.aimAssist && !this.lockAt ? this.aimNear(me) : null;
        if (near) {
          lx *= 0.5;
          ly *= 0.5;
        }
        const f = this.follow;
        f.yaw = this.yaw;
        f.pitch = this.pitch;
        f.tune.pitchMin = this.aimK > 0.5 ? -0.5 : LIMITS.chase.pitch[0];
        const lock = this.lockAt;
        f.update({
          dt,
          look: { x: lx, y: ly },
          recenter: this.recenterAsk,
          yaw: this.myFacing,
          vx: Math.cos(going) * speed,
          vy: Math.sin(going) * speed,
          // (afloat in the water, none: plan 66)
          air: me.swim ? 0 : Math.max(0, (me.z ?? 0) - (me.ground ?? 0)),
          run: KH_MOVE.jog,
          dash: KH_MOVE.sprint,
          lock: lock ? { dx: lock.x - me.x, dy: lock.y - me.y } : null,
          still: this.aim,
          hold: !!this.swingAt,
        });
        this.recenterAsk = false;
        this.yaw = f.yaw;
        this.pitch = f.pitch;
        this.dist = f.dist;
        if (near) this.yaw += near.off * Math.min(1, dt * 4) * (1 - Math.abs(near.off) / AIM_HELP);
      }
      if (first) {
        // in your head: exactly where you are, every frame (an eased position
        // floats); only the eyes' height eases, sitting down and getting up
        const eye = me.a === 2 ? EYE_1P_SEATED : EYE_1P;
        this.eyeY = this.targetReady ? this.eyeY + (eye - this.eyeY) * (1 - Math.exp(-dt * 8)) : eye;
        this.target.set(me.x, this.eyeY + (me.z ?? 0) + jumpDip(me), me.y);
        this.targetReady = true;
      } else {
        const eye = me.a === 2 ? EYE - 0.3 : EYE;
        // up on something the camera's up there with you; in a jump it rides some of the
        // way (you see yourself go up); flying, higher than any jump, all the rest of it
        // (shared move ALOFT: docs/plan/49-the-height.md)
        // (in the water, on me: my feet ride 1.25 under, my head just out — afloat, a little up to
        // it; not the bed far under, which put me at the top of the screen: plan 66)
        const swim = (me.swim ?? 0) >= 2;
        const ground = me.a === 2 || swim ? (me.z ?? 0) : (me.ground ?? 0);
        const air = (me.z ?? 0) - ground;
        const rise = air <= ALOFT ? air * 0.55 : ALOFT * 0.55 + (air - ALOFT);
        const want = new Vector3(me.x, eye + ground + rise + (me.swim === 2 ? SWIM_LIFT : 0), me.y);
        // (locked on: a third of the way over to it, so we're both in frame; round a pole, the
        // pole: the view still while I go round it)
        if (this.lockAt && this.mode === "chase") {
          want.x += (this.lockAt.x - me.x) * 0.35;
          want.z += (this.lockAt.y - me.y) * 0.35;
        } else if (this.swingAt && this.mode === "chase") {
          want.x = this.swingAt.x;
          want.z = this.swingAt.y;
        }
        if (!this.targetReady) {
          this.target.copy(want);
          this.targetReady = true;
        } else this.target.lerp(want, 1 - Math.exp(-dt * 12));
      }
    } else if (seat && (seat.level ?? this.level) <= this.level) {
      // not drawn (in a car): the target's still where I am — it stayed where I got in, and the
      // land, the sun's shadows and the lamps all stayed round there (the town went bare and white)
      this.meAt = { x: seat.x, y: seat.y };
      this.walkAt = { ...this.meAt };
      this.target.set(seat.x, EYE - 0.3 + seat.ground + this.upTo(seat.level ?? this.level), seat.y);
      this.targetReady = true;
    }
    if (this.god) {
      this.target.copy(this.god.at);
      this.targetReady = true;
    }
    this.aimK += ((this.aim && !first ? 1 : 0) - this.aimK) * (1 - Math.exp(-dt * 10));
    // (into an aim the camera comes up to look ahead, near level — not at the ground at your feet)
    // (third person only: in first person the look is the look — it kept pulling it back level)
    if (this.aim && !first && this.aimK < 0.95 && this.time - this.dragged > 0.3)
      this.pitch += (0.15 - this.pitch) * (1 - Math.exp(-dt * 10));
    // a shot's kick: up (pitch > 0 is down) and a little aside, fast; settling back slower
    const kin = 1 - Math.exp(-dt * 38);
    const kout = 1 - Math.exp(-dt * 7);
    const ku = this.guns.kickIn.up * kin - this.guns.kickOut.up * kout;
    const ks = this.guns.kickIn.side * kin - this.guns.kickOut.side * kout;
    this.guns.kickIn.up *= 1 - kin;
    this.guns.kickIn.side *= 1 - kin;
    this.guns.kickOut.up *= 1 - kout;
    this.guns.kickOut.side *= 1 - kout;
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
    this.pointerPart.aimFrame(dt, me);
    this.drawLock();

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
    this.mood.underWater();
    // the lens: a game camera's own, or the photo zoom in first person
    const fov =
      gc?.fov ??
      (first ? (this.lensPart.lensFov ?? this.lensPart.fov1p * (1 - 0.18 * this.guns.ads)) : FOV - 8 * this.aimK);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 10));
      this.camera.updateProjectionMatrix();
    }

    this.reduced = !!me?.reduced;
    this.buildPick.builder.sync(this.buildPick.buildLook, this.world, dt);
    this.stepFx(dt);
    this.lensPart.stepFlashes(dt);
    // (god mode: the buildings whole from above)
    if (!this.god) this.fadeWalls(dt);
    this.around.campus.cutAbove(!this.god && this.insideBelowHome(me) ? STOREY - 0.15 : null);
    // (Lowest, a weak CPU: the snow half as thick, the land built in fewer frames)
    const lowest = this.quality === "lowest";
    this.around.campus.lite = lowest;
    this.around.quality = this.quality;
    if (this.around.grounds) {
      this.around.grounds.lite = lowest;
      this.around.grounds.fadeOff = !!this.god;
    }
    this.around.update(dt, this.camera.position, !me?.reduced, this.target);
    this.printsPart.drawPrints(performance.now());
    this.drawCues(dt, !!me?.reduced);
    this.sunPart.placeSun();
    this.sunPart.assignLamps(dt);
    this.mood.weatherFrame(dt, me);
    if (!me?.reduced) this.vehicles.breathe(bodies);

    // cards and people face back along the camera's view (all the same way)
    const face = this.yaw + Math.PI;
    for (const c of this.world.cards) c.rotation.y = Math.PI / 2 - face;
    for (const c of this.buildPick.builder.ghostCards) c.rotation.y = Math.PI / 2 - face;

    // people (drawn again each frame only when on screen; far ones every third frame)
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(
      this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse),
    );
    this.tick++;
    const seen = new Set<string>();
    const seenPets = new Set<string>();
    let mySeat: string | undefined;
    this.eyes.unseen.clear();
    // (plan 58's mood: the shadowed about, for everyone's tension)
    const shadesNear = bodies.filter((b) => b.shade && !b.shade.killed);
    for (const b of bodies) {
      if (b.pet) {
        seenPets.add(b.id);
        this.petFrame(b, dt);
        const pe = this.pets3.get(b.id);
        if (pe) pe.model.root.visible = !this.byLens(b);
        continue;
      }
      seen.add(b.id);
      // (knocked down by a pool ball: facing back the way it came, timed from when it's seen here)
      // (held down by a dog: lying there, not getting up — docs/plan/52-the-pet-two.md D8)
      const ft = this.fellT(b);
      const fell = ft !== undefined && b.pinned ? Math.min(ft, 1.4) : ft;
      const angle3 = fell !== undefined ? (b.fellYaw ?? 0) + Math.PI : (b.angle ?? b.yaw);
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
        this.sphere.center.set(b.x, (b.z ?? 0) + 0.9, b.y); // (up on a roof too)
        const seat3 =
          b.a === 2 ? this.seats.seatKinds.get(Math.floor(b.y) * this.map.width + Math.floor(b.x)) : undefined;
        // (the shadowed: not there yet while the dark gathers, gone as it goes)
        const sh = b.shade;
        const shadeT = sh ? (performance.now() - sh.since) / 1000 : 0;
        const notThere =
          !!sh &&
          ((sh.state === "emerge" && shadeT < 0.6) ||
            (sh.state === "dissolve" && shadeT > (sh.killed ? 1.95 : 0.45)) ||
            (sh.fade ?? 1) < 0.5);
        p3.root.visible = !hidden3 && !notThere;
        // (the light on them; out on the land, past the floor's light map, as a tint of their own)
        const c = this.eyes.lightOn(b, me);
        const L = landLight.value;
        // (and wet from the rain: darker, clothes and hair — docs/plan/65 W7)
        const wk = 1 - 0.32 * this.mood.wetOf(b, dt);
        p3.setTint(
          this.mood.onLand(b.x, b.y)
            ? this.eyes.ownTint.setRGB((wk * c.r) / L.r, (wk * c.g) / L.g, (wk * c.b) / L.b)
            : null,
        );
        p3.setWater(b.swim === 1 && b.waterOver ? b.waterOver : null);
        if (b.swim) this.mood.swimmer(b.id, p3);
        if (b.id === meId) mySeat = seat3;
        p3.gunFx = b.id === meId ? this.guns.myGun : this.guns.otherGun(b, dt);
        p3.update(
          {
            ...b,
            angle: angle3,
            seat: seat3,
            keys:
              (b.a === 2 && b.typing) || b.busy === "computer"
                ? (this.keysFor(b.x, b.y, angle3) ?? undefined)
                : undefined,
            parts: b.busy ? (this.partsFor(b.busy, b.x, b.y, angle3) ?? undefined) : undefined,
            cue: b.busy === "pool" ? this.shooters.get(b.id) : undefined,
            down: this.downed.get(b.id),
            fell,
            hit: this.hitOf(b),
            heard: this.heardBy(b),
          },
          dt,
          {
            camX: cam.x,
            camZ: cam.z,
            onScreen:
              (!hidden3 && this.frustum.intersectsSphere(this.sphere)) ||
              (b.id === meId && first && this.handsOn && handsDoing(b) !== ""),
            lowQuality: this.quality === "low" || this.quality === "lowest",
            mood: this.mood.moodOf(b, shadesNear),
            groundAt: this.body.groundAt,
            rag: this.body.ragSpace,
            sway: this.body.sway?.skipOf(b.id),
            step: this.onStep,
            thud: this.onThud,
            hop: this.onHop,
          },
        );
        this.seats.rideSeat(
          p3.root,
          b.a === 2 ? this.seats.seatObjs.get(Math.floor(b.y) * this.map.width + Math.floor(b.x)) : undefined,
        );
        // (plan 58 5d: down on the ragdoll — the physics stepped while anyone is; mine holds the walker)
        if (p3.limp?.on) this.body.limpNow = true;
        if (b.id === meId) {
          this.body.meLimp = !!p3.limp?.on;
          this.body.meDrift = p3.limp?.drift() ?? null;
          this.body.meUp = p3.upFacing();
        }
        this.mood.snowFall(b, p3, dt, hidden3);
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
      const angle = b.angle ?? b.yaw;
      this.eyes.lightOn(b, me);
      this.sphere.center.set(b.x, (b.z ?? 0) + 0.9, b.y); // (up on a roof too)
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
      const seat = b.a === 2 ? this.seats.seatKinds.get(Math.floor(b.y) * this.map.width + Math.floor(b.x)) : undefined;
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
    // (plan 61: what's worn swinging on Jolt — me and the nearest few: their stand-ins and anchors to
    // their bones, the step, their bones where it has them)
    const ph = this.body.physics;
    if (ph && this.charF && !this.body.swayAsked) {
      this.body.swayAsked = true;
      void import("@/world/sway/hub").then((m) => {
        const rs = this.body.physics?.ragdollSpace();
        if (rs && !this.gone) this.body.sway = new m.SwayHub(rs.world, rs.origin);
      });
    }
    const sw = this.body.sway;
    if (sw) {
      const near: { id: string; model: Person3D["model"]; d: number }[] = [];
      for (const [id, p] of this.people3)
        if (seen.has(id) && p.ready && p.root.visible && p.swayD < 14) near.push({ id, model: p.model, d: p.swayD });
      sw.pre(near, Math.min(dt, 1 / 30), meId ?? undefined);
    }
    // (plan 58 5d: the ragdolls in the world's physics, a step on while anyone's down — or swings)
    if (this.body.limpNow || sw?.active) ph?.step(dt);
    sw?.post();
    this.body.limpNow = false;
    for (const [id, p] of this.people3)
      if (!seen.has(id)) {
        p.dispose();
        this.people3.delete(id);
        this.hits.delete(id);
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
      const angle = me.angle ?? me.yaw;
      if (!this.hands && this.handsSpare) {
        this.hands = this.handsSpare;
        this.handsSpare = null;
      }
      this.hands ??= new Hands1P(C3, this.charF, this.charMats, { ...me, angle });
      this.hands.gunFx = this.guns.myGun;
      this.hands.update(
        { ...me, angle, seat: mySeat },
        this.people3.get(me.id)?.motionOut ?? null,
        dt,
        this.camera,
        this.pitch,
        // (a flip turns the body over: the hands drop out of view for it)
        this.lensPart.lensFov !== null || (me.jump?.kind === "flip" && me.jump.stage === "air" && !me.reduced),
        this.quality === "low" || this.quality === "lowest",
      );
    } else if (this.hands) {
      // (out of first person: put by, ready for the next time)
      this.handsSpare?.dispose();
      this.handsSpare = this.hands;
      this.hands = null;
    } else if (
      this.warmup.warm &&
      !this.handsSpare &&
      this.handsOn &&
      me &&
      !me.npc &&
      C3 &&
      this.charF &&
      this.charMats
    ) {
      // made ahead behind the loading screen: the first time into first person built them in
      // one frame (a hitch)
      this.handsSpare = new Hands1P(C3, this.charF, this.charMats, { ...me, angle: me.angle ?? me.yaw });
    }
    // the flashlights: after the people and my hands (out of the lens in a hand where it is this frame)
    this.torches(bodies, meId, dt);
    // build what's waiting (nearest first), a few milliseconds a frame
    this.charF?.pump(this.warmup.warm ? 30 : 4);
    for (const [id, e] of this.pets3)
      if (!seenPets.has(id)) {
        this.scene.remove(e.model.root);
        e.model.dispose();
        this.pets3.delete(id);
      }
    if (this.gameScene) this.games3?.set(this.gameScene, (id, port, sitting) => this.handOf(id, port, sitting), face);

    if (!document.hidden) {
      const hands = this.hands?.shown ? this.hands : null;
      // the scene's matrices once, here — the cull below reads them, the render doesn't make
      // them again (Low and Lowest: only where something moved, lazy-matrices.ts — and on the
      // way, what of the land and the campus my floor might hide)
      const slab = this.culling.noCull ? null : this.world.slab();
      if (this.quality === "low" || this.quality === "lowest") {
        const g = this.culling.gather;
        g.root = this.around.root;
        g.below = slab ? slab.slab.at.y - 0.02 : Number.NEGATIVE_INFINITY;
        g.out.length = 0;
        lazyMatrices(this.scene, slab ? g : null);
        this.culling.gathered = slab ? g.out : null;
      } else this.scene.updateMatrixWorld();
      this.scene.matrixWorldAutoUpdate = false;
      this.culling.matricesMade = true;
      try {
        // (what my floor hides from this camera left out of this one render: below-cull.ts)
        this.culling.cullBelow(slab);
        this.live.holes(this.camera, this.pageRect);
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
      } finally {
        this.culling.below3.end();
        this.scene.matrixWorldAutoUpdate = true;
        this.culling.matricesMade = false;
        this.culling.gathered = null;
      }
      this.tags.drawTags(bodies);
    }
    this.warmup.drawn++;
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
      // (the far leg a shade darker, after the light; each form's turned side in shade, with a rim
      // of light on the lit one: chars/model.ts — the room's light multiplies all of it, after)
      C.legShade(body);
      C.legShade(bodyAway);
      C.celShade(body);
      C.celShade(bodyAway);
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
        pball: (n) => heldPoolBall(n, (m) => this.light.patch(m)),
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
      Math.hypot(b.x - this.camera.position.x, b.y - this.camera.position.z) < (this.gameCam.lens ?? 2.7)
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
      e = { model, key, turned: b.yaw };
      this.pets3.set(b.id, e);
    }
    const angle = b.yaw;
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
        mood: pet.mood as never,
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
      { kind: r.kind, t: r.t, face: r.face, look, carry: pet.carry ?? null, flash: r.flash, mood: r.mood },
      dt,
      performance.now(),
    );
    // (its height: on a floor below mine, that floor's; in a lift's car, the car's)
    e.model.root.position.set(b.x, b.z ?? 0, b.y);
    e.model.root.rotation.y -= e.turned;
    e.model.root.visible = true;
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

  clampCam() {
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
        const o = this.cornerTo(home);
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
      if (!this.buildPick.buildMode) {
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
          for (const b of g.boxes) {
            const x0 = b.x0 - 0.3;
            const y0 = b.z0 - 0.3;
            const x1 = b.x1 + 0.3;
            const y1 = b.z1 + 0.3;
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
        for (const m of this.vehicles.veh3.values()) {
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
    // whatever's solid between me and it in Jolt's world — a tree, a fence, the hill behind me
    // (docs/plan/56-the-controls.md H.6): in front of it
    // (not building: placing things by a wall, the camera stays where it's put)
    // (round a pole the look's from inside it: the ray starts out past its side)
    const from = this.swingAt ? Math.max(0, this.swingAt.r - 0.25) : 0;
    const hit = this.buildPick.buildMode
      ? null
      : (this.body.physics?.ray(
          t.x + dx * cp * from,
          t.y + sp * from,
          t.z + dz * cp * from,
          dx * cp,
          sp,
          dz * cp,
          this.dist - from,
        ) ?? null);
    if (hit !== null) reach = Math.min(reach, Math.max(0.6, from + hit - 0.3));
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
      const view = this.buildPick.buildLook?.wallView;
      if (!f.item || f.wall) {
        if (view === "up") block = false;
        else if (view === "down") block = true;
      }
      const want = block ? 0.06 : 1; // cut down to the skirting, as iso's wall-down
      if (Math.abs(f.alpha - want) < 0.002 && (f.alpha === 1 || f.alpha === want)) continue;
      f.alpha += (want - f.alpha) * Math.min(1, dt * 10);
      if (Math.abs(f.alpha - want) < 0.01) f.alpha = want;
      applyFade(f, this.world.materials);
      this.world.faded(f); // (its pieces drawn themselves while faded: World3)
    }
  }

  // the Grounds' new things: their shaders compiled off the frame (on a layer no
  // camera draws), shown once ready
  private prepareGrounds() {
    const g = this.around.grounds;
    if (!g) return;
    g.prepare = (o) => {
      const masks: [Object3D, number][] = [];
      const maps = new Set<Texture>();
      o.traverse((c) => {
        masks.push([c, c.layers.mask]);
        c.layers.set(PREP_LAYER);
        // (its pictures up to the GPU now, not the first frame they're seen: the roads' asphalt,
        // a shop's wall)
        const m = (c as Mesh).material as Material | Material[] | undefined;
        for (const x of Array.isArray(m) ? m : m ? [m] : []) {
          const t = (x as MeshLambertMaterial).map;
          if (t) maps.add(t);
        }
      });
      for (const t of maps) this.renderer.initTexture(t);
      this.warmup.preparing++;
      void this.renderer.compileAsync(o, this.camera, this.scene).then(() => {
        this.warmup.preparing--;
        for (const [c, m] of masks) c.layers.mask = m;
      });
    };
    // (and what comes and goes out there: a breath's puff, the cars, the shuttle)
    const warm = new Group();
    const puff = new Sprite(
      new SpriteMaterial({
        map: this.vehicles.puffMap(),
        color: 0xf4f7fa,
        transparent: true,
        depthWrite: false,
        opacity: 0.32,
        toneMapped: false,
      }),
    );
    // (and the morning fog's: its banks — made now, their sheets when a fog wants them — and the
    // flashlight's beam, which the cars' beams in the air share: docs/plan/64-the-fog.md)
    this.banks ??= new FogBanks(g.root);
    const banks = this.banks.warm();
    const beam = new Mesh(this.beamCone ?? undefined, this.torch3[0]?.mat);
    warm.add(puff, this.vehicles.carModel("visitor"), this.vehicles.busModel(), banks, beam);
    void this.renderer.compileAsync(warm, this.camera, this.scene).then(() => {
      puff.material.dispose();
      banks.geometry.dispose();
    });
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
        b.angle ?? b.yaw,
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
      // (a third as thick in the pitch dark: on a black night the haze hid what the beam lit —
      // docs/plan/44-the-night.md; a storm's snow still thickens it)
      // (and in the morning fog, as in the snow: docs/plan/64 F4)
      const air = Math.max(this.storm, this.fogNow.haze, this.fogNow.wall);
      const op0 = Math.min(0.5, (0.03 + 0.16 * night) * (1 - 0.65 * this.dark) * (1 + air * 1.6));
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

  /** God mode's pointer: where the ray through the screen's (clientX, clientY) meets the land (the
   *  Grounds' own heights, not their chunks': far off none's made), the Grounds' coords; null
   *  over the sky. */
  /** A street thing's parts as the Grounds draw it (god mode's ghost of one held or dragged). */
  streetParts(t: StreetThing): BufferGeometry[] {
    return streetGeometry([t]);
  }

  landUnder(clientX: number, clientY: number): { x: number; z: number; h: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    this.ray.setFromCamera(
      new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1),
      this.camera,
    );
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    const f = this.groundsFrame();
    const below = (t: number) => o.y + d.y * t <= terrainAt(o.x + d.x * t, o.z + d.z * t) + f.y;
    let t0 = 0;
    let t1 = -1;
    for (let t = 2; t < this.camera.far; t += 2 + t * 0.01)
      if (below(t)) {
        t1 = t;
        break;
      } else t0 = t;
    if (t1 < 0) return null;
    for (let i = 0; i < 14; i++) {
      const m = (t0 + t1) / 2;
      if (below(m)) t1 = m;
      else t0 = m;
    }
    const x = o.x + d.x * t1;
    const z = o.z + d.z * t1;
    return { x, z, h: terrainAt(x, z) };
  }

  /** Where a ray (the scene's) first meets the land round the ground floor, off the floor's own
   *  tiles; null on any other floor, or when it meets the floor first. */
  landAt(o: Vector3, dir: Vector3): { x: number; y: number } | null {
    const g = this.around.grounds;
    if (this.level !== 0 || !g) return null;
    const below = (t: number) => o.y + dir.y * t <= g.heightAt(o.x + dir.x * t, o.z + dir.z * t);
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
  toys3 = new Map<string, { root: Group; kind: string; shadow: Mesh }>();
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
    if (this.god) return this.god.input.wheel(e);
    if (this.buildPick.buildMode && this.events.wheel?.(e.deltaY)) return; // turning what you hold
    this.lensPart.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.activeAt = performance.now();
    if (e.type === "keydown" && e.code === "KeyZ" && !this.god && !e.repeat && !e.metaKey && !e.ctrlKey)
      this.mouseLook.setLook(!this.mouseLook.looking);
    if (e.type === "keydown") this.keys.add(e.code);
    else this.keys.delete(e.code);
  };
  private onBlur = () => this.keys.clear();
  private noMenu = (e: Event) => e.preventDefault();

  gone = false;
  destroy() {
    this.mood.bubbles?.dispose();
    this.body.sway?.dispose();
    this.body.sway = null;
    this.body.physics?.stop();
    this.body.physics = null;
    this.gone = true;
    this.shroud?.dispose();
    this.arms3?.dispose();
    const c = this.renderer.domElement;
    c.removeEventListener("pointerdown", this.pointerPart.onDown);
    c.removeEventListener("pointermove", this.pointerPart.onMove);
    c.removeEventListener("pointerup", this.pointerPart.onUp);
    c.removeEventListener("pointercancel", this.pointerPart.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.noMenu);
    document.removeEventListener("pointerlockchange", this.mouseLook.onLockChange);
    document.removeEventListener("pointerlockerror", this.mouseLook.onLockError);
    if (document.pointerLockElement === c) document.exitPointerLock();
    this.mouseLook.crosshair?.remove();
    clearTimeout(this.veilT);
    this.veil?.remove();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    this.ro?.disconnect();
    this.dprQuery?.removeEventListener("change", this.onDpr);
    this.tags.tagLayer?.remove();
    this.live.dispose();
    this.buildPick.builder.dispose();
    for (const f of this.fx) (f.s.material as SpriteMaterial).dispose();
    this.post?.dispose();
    this.light.dispose();
    for (const l of this.below.values()) l.dispose();
    for (const p of this.people.values()) p.dispose();
    for (const p of this.people3.values()) p.dispose();
    this.hands?.dispose();
    this.handsSpare?.dispose();
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
    for (const m of this.warmup.fadeKept) m.dispose();
    this.banks?.dispose();
    this.around.dispose();
    this.renderer.dispose();
    c.remove();
  }

  /** (in Eyes: read from outside) */
  get unseen() {
    return this.eyes.unseen;
  }
  set unseen(v) {
    this.eyes.unseen = v;
  }
  /** (in Eyes: read from outside) */
  isUnseen(...a: Parameters<Eyes["isUnseen"]>): ReturnType<Eyes["isUnseen"]> {
    return this.eyes.isUnseen(...a);
  }
  /** (in Eyes: read from outside) */
  glareAt(...a: Parameters<Eyes["glareAt"]>): ReturnType<Eyes["glareAt"]> {
    return this.eyes.glareAt(...a);
  }
  /** (in Eyes: read from outside) */
  get carBeams() {
    return this.eyes.carBeams;
  }
  set carBeams(v) {
    this.eyes.carBeams = v;
  }
  /** (in Warmup: read from outside) */
  readiness(...a: Parameters<Warmup["readiness"]>): ReturnType<Warmup["readiness"]> {
    return this.warmup.readiness(...a);
  }
  /** (in Warmup: read from outside) */
  setQuality(...a: Parameters<Warmup["setQuality"]>): ReturnType<Warmup["setQuality"]> {
    return this.warmup.setQuality(...a);
  }
  /** (in BuildPick: read from outside) */
  get builder() {
    return this.buildPick.builder;
  }
  set builder(v) {
    this.buildPick.builder = v;
  }
  /** (in BuildPick: read from outside) */
  pick(...a: Parameters<BuildPick["pick"]>): ReturnType<BuildPick["pick"]> {
    return this.buildPick.pick(...a);
  }
  /** (in Mood: read from outside) */
  weatherFrame(...a: Parameters<Mood["weatherFrame"]>): ReturnType<Mood["weatherFrame"]> {
    return this.mood.weatherFrame(...a);
  }
  /** (in Mood: read from outside) */
  get wetOn() {
    return this.mood.wetOn;
  }
  set wetOn(v) {
    this.mood.wetOn = v;
  }
  /** (in MouseLook: read from outside) */
  get looking() {
    return this.mouseLook.looking;
  }
  set looking(v) {
    this.mouseLook.looking = v;
  }
  /** (in Culling: read from outside) */
  get below3() {
    return this.culling.below3;
  }
  set below3(v) {
    this.culling.below3 = v;
  }
  /** (in Culling: read from outside) */
  setUnmerged(...a: Parameters<Culling["setUnmerged"]>): ReturnType<Culling["setUnmerged"]> {
    return this.culling.setUnmerged(...a);
  }
  /** (in Culling: read from outside) */
  setMergeClear(...a: Parameters<Culling["setMergeClear"]>): ReturnType<Culling["setMergeClear"]> {
    return this.culling.setMergeClear(...a);
  }
  /** (in Culling: read from outside) */
  cullBelow(...a: Parameters<Culling["cullBelow"]>): ReturnType<Culling["cullBelow"]> {
    return this.culling.cullBelow(...a);
  }
  /** (in Guns: read from outside) */
  get myGun() {
    return this.guns.myGun;
  }
  set myGun(v) {
    this.guns.myGun = v;
  }
  /** (in Guns: read from outside) */
  get ads() {
    return this.guns.ads;
  }
  /** (in Body: read from outside) */
  get physics() {
    return this.body.physics;
  }
  set physics(v) {
    this.body.physics = v;
  }
  /** (in Body: read from outside) */
  get sway() {
    return this.body.sway;
  }
  set sway(v) {
    this.body.sway = v;
  }
  /** (in Body: read from outside) */
  physicsBody(...a: Parameters<Body["physicsBody"]>): ReturnType<Body["physicsBody"]> {
    return this.body.physicsBody(...a);
  }
  /** (in Body: read from outside) */
  physicsDebug(...a: Parameters<Body["physicsDebug"]>): ReturnType<Body["physicsDebug"]> {
    return this.body.physicsDebug(...a);
  }
  /** (in Body: read from outside) */
  get physicsShown() {
    return this.body.physicsShown;
  }
  /** (in Lens: read from outside) */
  snapshot(...a: Parameters<Lens["snapshot"]>): ReturnType<Lens["snapshot"]> {
    return this.lensPart.snapshot(...a);
  }

  /** (in Tags: read from outside) */
  get tagEls() {
    return this.tags.tagEls;
  }
  set tagEls(v) {
    this.tags.tagEls = v;
  }

  /** (in BuildPick: read from outside) */
  rayAt(...a: Parameters<BuildPick["rayAt"]>): ReturnType<BuildPick["rayAt"]> {
    return this.buildPick.rayAt(...a);
  }
  /** (in BuildPick: read from outside) */
  lookedThrough(...a: Parameters<BuildPick["lookedThrough"]>): ReturnType<BuildPick["lookedThrough"]> {
    return this.buildPick.lookedThrough(...a);
  }
  /** (in BuildPick: read from outside) */
  floorAt(...a: Parameters<BuildPick["floorAt"]>): ReturnType<BuildPick["floorAt"]> {
    return this.buildPick.floorAt(...a);
  }
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
    own.opacity =
      (base === shared.clear || base === shared.clearBack || base === shared.clearFront ? 1 : base.opacity) * f.alpha;
    m.material = own;
  }
}

// (the walls' back faces too: painting only a far side changes nothing else here)
const layoutSig = (m: MapDef) =>
  `${m.width}x${m.height}|${m.tiles.join("")}|${m.hWalls.join("")}|${m.vWalls.join("")}|${(m.hBacks ?? []).join("")}|${(m.vBacks ?? []).join("")}`;
